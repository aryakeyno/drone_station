# vision/detection_optimizer.py
"""
Optimized detection system for multi-camera YOLO inference.

Key design:
  1. Capture loop is NEVER blocked — frames go directly to display
  2. Detection happens in background queue(s) with concurrency limits
  3. Completed detections are merged back into frames asynchronously
  4. Telemetry reports queue depth, inference time, and skip ratios

Usage:
    optimizer = DetectionOptimizer(
        model_path="yolov8n.pt",
        max_concurrent_inferences=1,  # Adjust for your hardware
        frame_skip_ratio=2,           # Process 1 in 2 frames
    )
    
    # In capture loop (NEVER WAITS):
    await optimizer.queue_frame_for_detection(cam_id, frame)
    
    # In compositor loop (gets result if ready):
    processed_frame = await optimizer.get_processed_frame(cam_id)
"""

import asyncio
import logging
import time
from collections import deque
from typing import Dict, Optional, Tuple
from threading import Lock
import numpy as np

logger = logging.getLogger(__name__)

YOLO = None


def _load_yolo():
    global YOLO
    if YOLO is None:
        try:
            from ultralytics import YOLO as _YOLO
            YOLO = _YOLO
            logger.info("✅ YOLO module loaded for detection optimizer")
            return True
        except ImportError as exc:
            logger.error(f"❌ YOLO import failed: {exc}")
            return False
    return True


class DetectionOptimizer:
    """
    Async detection queue manager with concurrency limiting.
    
    Args:
        model_path: Path to YOLO model (e.g. "yolov8n.pt")
        max_concurrent_inferences: Max simultaneous YOLO calls (1-2 recommended for weak HW)
        frame_skip_ratio: Process every Nth frame (2=50%, 4=25%)
        confidence_threshold: YOLO confidence threshold (0.0-1.0)
        enable_adaptive_skip: Skip more frames if queue backs up
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        max_concurrent_inferences: int = 1,
        frame_skip_ratio: int = 2,
        confidence_threshold: float = 0.5,
        enable_adaptive_skip: bool = True,
        max_queue_depth: int = 5,
    ):
        self.model_path = model_path
        self.model = None
        self.max_concurrent = max_concurrent_inferences
        self.base_skip_ratio = frame_skip_ratio
        self.confidence = confidence_threshold
        self.enable_adaptive_skip = enable_adaptive_skip
        self.max_queue_depth = max_queue_depth

        # Per-camera frame queues
        self._frame_queues: Dict[int, deque] = {}
        self._frame_counter: Dict[int, int] = {}
        self._queue_lock = Lock()

        # Processed frame cache (last result for each camera)
        self._processed_frames: Dict[int, np.ndarray] = {}

        # Semaphore to limit concurrent inferences
        self._inference_semaphore = asyncio.Semaphore(max_concurrent_inferences)

        # Telemetry
        self._stats = {
            "total_frames_queued": 0,
            "total_frames_processed": 0,
            "total_frames_skipped": 0,
            "inference_times": deque(maxlen=100),  # Last 100 inference times
            "queue_depths": deque(maxlen=100),
            "per_camera": {},  # {cam_id: {queued, processed, skipped, last_inference_time}}
        }

        self.enabled = False

    # ────────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ────────────────────────────────────────────────────────────────────────

    async def load_model(self) -> bool:
        """Load YOLO model asynchronously."""
        if not _load_yolo():
            return False
        try:
            self.model = await asyncio.to_thread(lambda: YOLO(self.model_path))
            logger.info(f"✅ Detection optimizer loaded: {self.model_path}")
            self.enabled = True
            return True
        except Exception as exc:
            logger.error(f"❌ Failed to load YOLO model: {exc}")
            return False

    async def unload_model(self):
        """Release model from memory."""
        if self.model is not None:
            try:
                await asyncio.to_thread(lambda: self.model.fuse())  # Free memory
                self.model = None
                self.enabled = False
                logger.info("✅ Detection optimizer unloaded")
            except Exception as exc:
                logger.warning(f"Warning unloading model: {exc}")

    # ────────────────────────────────────────────────────────────────────────
    # Queue frame for detection (non-blocking, from capture loop)
    # ────────────────────────────────────────────────────────────────────────

    def queue_frame_for_detection(
        self, cam_id: int, frame: np.ndarray
    ) -> Tuple[bool, str]:
        """
        Add a frame to the detection queue for this camera.
        NEVER BLOCKS. Returns (queued, reason).

        Args:
            cam_id: Camera ID
            frame: Raw BGR frame from cv2.VideoCapture.read()

        Returns:
            (queued: bool, message: str) – e.g., (True, "queued")
                                           or (False, "queue full")
        """
        if not self.enabled or self.model is None:
            return False, "Detection not enabled"

        with self._queue_lock:
            # Initialize queue if needed
            if cam_id not in self._frame_queues:
                self._frame_queues[cam_id] = deque(maxlen=self.max_queue_depth)
                self._frame_counter[cam_id] = 0
                self._stats["per_camera"][cam_id] = {
                    "queued": 0,
                    "processed": 0,
                    "skipped": 0,
                    "last_inference_ms": 0,
                }

            counter = self._frame_counter[cam_id]

            # Adaptive frame skip: if queue is full, skip more frames
            skip_ratio = self.base_skip_ratio
            if self.enable_adaptive_skip and len(self._frame_queues[cam_id]) > self.max_queue_depth * 0.7:
                skip_ratio = int(self.base_skip_ratio * 2)  # Skip 2x more frames
                # logger.warning(------------------------------------------------------------------------------------------------------
                #     f"📷 Camera {cam_id}: queue backing up (depth={len(self._frame_queues[cam_id])}) "
                #     f"→ adaptive skip ratio {skip_ratio}"
                # )

            # Check if we should process this frame
            if counter % skip_ratio != 0:
                self._stats["total_frames_skipped"] += 1
                self._stats["per_camera"][cam_id]["skipped"] += 1
                self._frame_counter[cam_id] += 1
                return False, f"skipped (ratio {skip_ratio})"

            # Queue the frame
            try:
                self._frame_queues[cam_id].append((frame.copy(), time.time()))
                self._stats["total_frames_queued"] += 1
                self._stats["per_camera"][cam_id]["queued"] += 1
                self._stats["queue_depths"].append(len(self._frame_queues[cam_id]))
                self._frame_counter[cam_id] += 1
                return True, "queued"
            except Exception as exc:
                logger.warning(f"Failed to queue frame for camera {cam_id}: {exc}")
                return False, str(exc)

    # ────────────────────────────────────────────────────────────────────────
    # Get processed frame (non-blocking, from compositor)
    # ────────────────────────────────────────────────────────────────────────

    async def get_processed_frame(self, cam_id: int) -> Optional[np.ndarray]:
        """
        Get the last processed frame for this camera (result of YOLO overlay).
        Returns None if no result ready yet (will use raw frame instead).
        NEVER BLOCKS.
        """
        if cam_id not in self._processed_frames:
            return None
        return self._processed_frames.get(cam_id)

    # ────────────────────────────────────────────────────────────────────────
    # Background detection worker loop
    # ────────────────────────────────────────────────────────────────────────

    async def detection_worker_loop(self):
        """
        Background loop that processes detection queues.
        Runs continuously, respecting concurrency limits.
        """
        logger.info(f"Detection worker starting (max concurrent: {self.max_concurrent})")

        while True:
            try:
                await asyncio.sleep(0.01)  # Yield frequently

                # Collect one frame from each camera's queue (round-robin)
                frame_to_process = None
                source_cam_id = None

                with self._queue_lock:
                    for cam_id in sorted(self._frame_queues.keys()):
                        q = self._frame_queues[cam_id]
                        if len(q) > 0:
                            frame_to_process, queued_at = q.popleft()
                            source_cam_id = cam_id
                            age_ms = (time.time() - queued_at) * 1000
                            break  # Process one frame, then check again

                if frame_to_process is not None:
                    # Acquire a slot from the semaphore (blocks if max concurrent reached)
                    async with self._inference_semaphore:
                        await self._run_inference(source_cam_id, frame_to_process)

            except asyncio.CancelledError:
                logger.info("Detection worker cancelled")
                break
            except Exception as exc:
                logger.error(f"Detection worker error: {exc}")
                await asyncio.sleep(0.1)

    async def _run_inference(self, cam_id: int, frame: np.ndarray):
        """
        Run YOLO inference on one frame.
        Handles exceptions gracefully.
        """
        t0 = time.time()
        try:
            # Run inference in thread pool (YOLO can be CPU-heavy)
            result_frame = await asyncio.to_thread(
                self._inference_sync, frame
            )

            # Store result
            self._processed_frames[cam_id] = result_frame
            elapsed_ms = (time.time() - t0) * 1000

            # Update stats
            self._stats["total_frames_processed"] += 1
            self._stats["inference_times"].append(elapsed_ms)
            self._stats["per_camera"][cam_id]["processed"] += 1
            self._stats["per_camera"][cam_id]["last_inference_ms"] = int(elapsed_ms)

            if elapsed_ms > 100:  # Log slow inferences
                logger.warning(f"Slow inference: cam {cam_id} took {elapsed_ms:.0f}ms")

        except Exception as exc:
            logger.error(f"Inference error on camera {cam_id}: {exc}")
            # Fall back to raw frame
            self._processed_frames[cam_id] = frame

    def _inference_sync(self, frame: np.ndarray) -> np.ndarray:
        """
        Synchronous YOLO inference (runs in thread pool).
        Returns frame with overlay.
        """
        if self.model is None:
            return frame

        try:
            results = self.model(frame, verbose=False, conf=self.confidence)
            if results and len(results) > 0:
                return results[0].plot()  # Frame with bounding boxes
            return frame
        except Exception as exc:
            logger.error(f"YOLO inference failed: {exc}")
            return frame

    # ────────────────────────────────────────────────────────────────────────
    # Telemetry
    # ────────────────────────────────────────────────────────────────────────

    def get_telemetry(self) -> dict:
        """Return detection telemetry for UI/logging."""
        avg_inference_ms = (
            sum(self._stats["inference_times"]) / len(self._stats["inference_times"])
            if self._stats["inference_times"]
            else 0
        )

        avg_queue_depth = (
            sum(self._stats["queue_depths"]) / len(self._stats["queue_depths"])
            if self._stats["queue_depths"]
            else 0
        )

        return {
            "enabled": self.enabled,
            "total_queued": self._stats["total_frames_queued"],
            "total_processed": self._stats["total_frames_processed"],
            "total_skipped": self._stats["total_frames_skipped"],
            "avg_inference_ms": round(avg_inference_ms, 1),
            "avg_queue_depth": round(avg_queue_depth, 1),
            "max_concurrent_inferences": self.max_concurrent,
            "frame_skip_ratio": self.base_skip_ratio,
            "per_camera": self._stats["per_camera"],
        }

    async def broadcast_telemetry(self, ws_manager):
        """Periodically broadcast detection stats to UI."""
        while True:
            try:
                telemetry = self.get_telemetry()
                await ws_manager.broadcast({
                    "class": "detection_telemetry",
                    "data": telemetry,
                })
                await asyncio.sleep(5.0)  # Every 5 seconds
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug(f"Telemetry broadcast error: {exc}")
                await asyncio.sleep(5.0)