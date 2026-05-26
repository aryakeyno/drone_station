# vision/camera_node.py
"""
Multi-camera capture and composite frame engine with optimized async YOLO detection.

Each physical camera gets its own async capture coroutine that writes the
latest decoded frame into a shared dict (self.latest_frames).  A separate
compositor coroutine reads that dict, tiles the frames according to the
configured layout, JPEG-encodes the result, and stores it in
self.current_frame_jpeg – the same attribute the web layer already polls
for HTTP MJPEG streaming.

Individual camera frames are also available at self.latest_frames[cam_id]
so the REST endpoint /video/<cam_id> can serve them independently.

Detection is handled by DetectionOptimizer running in a background worker thread,
with non-blocking frame queuing. The capture loop never waits for YOLO inference.
"""

import asyncio
import cv2
import logging
import time
from typing import Dict, List, Optional
from collections import deque

import numpy as np

from vision.detection_optimizer import DetectionOptimizer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Layout helpers (Run entirely inside background threads via workers)
# ---------------------------------------------------------------------------

def _resize(frame: np.ndarray, w: int, h: int) -> np.ndarray:
    return cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)


def _compose(
                frames: List[np.ndarray],
                layout: str,
                out_w: int,
                out_h: int,
                main_ratio: float,
            ) -> Optional[np.ndarray]:
    """
    Combine *frames* (already captured, never None here) into one image of
    size out_w × out_h according to *layout*.
    """
    n = len(frames)
    if n == 0:
        return None

    if n == 1:
        return _resize(frames[0], out_w, out_h)

    if n == 2:
        if layout == "top_bottom":
            h2 = out_h // 2
            return np.vstack([
                _resize(frames[0], out_w, h2),
                _resize(frames[1], out_w, out_h - h2),
            ])
        else:  # side_by_side (default)
            w2 = out_w // 2
            return np.hstack([
                _resize(frames[0], w2, out_h),
                _resize(frames[1], out_w - w2, out_h),
            ])

    if n == 3:
        if layout == "three_right_main":
            side_w = int(out_w * (1.0 - main_ratio))
            main_w = out_w - side_w
            h2 = out_h // 2
            side_col = np.vstack([
                _resize(frames[0], side_w, h2),
                _resize(frames[1], side_w, out_h - h2),
            ])
            main_col = _resize(frames[2], main_w, out_h)
            return np.hstack([side_col, main_col])

        elif layout == "three_top_main":
            main_h = int(out_h * main_ratio)
            side_h = out_h - main_h
            w2 = out_w // 2
            top = _resize(frames[0], out_w, main_h)
            bot = np.hstack([
                _resize(frames[1], w2, side_h),
                _resize(frames[2], out_w - w2, side_h),
            ])
            return np.vstack([top, bot])

        else:  # three_left_main (default)
            main_w = int(out_w * main_ratio)
            side_w = out_w - main_w
            h2 = out_h // 2
            main_col = _resize(frames[0], main_w, out_h)
            side_col = np.vstack([
                _resize(frames[1], side_w, h2),
                _resize(frames[2], side_w, out_h - h2),
            ])
            return np.hstack([main_col, side_col])

    w2, h2 = out_w // 2, out_h // 2
    tiles = frames[:4]
    while len(tiles) < 4:
        tiles.append(np.zeros((h2, w2, 3), dtype=np.uint8))
    top = np.hstack([_resize(tiles[0], w2, h2),     _resize(tiles[1], out_w - w2, h2)])
    bot = np.hstack([_resize(tiles[2], w2, out_h - h2), _resize(tiles[3], out_w - w2, out_h - h2)])
    return np.vstack([top, bot])


def _process_and_encode_all(
    raw_frames_snapshot: Dict[int, np.ndarray],
    camera_ids: List[int],
    layout: str,
    comp_w: int,
    comp_h: int,
    main_ratio: float,
    jpeg_quality: int = 75
) -> tuple:
    """
    Bundles image composition and all JPEG conversions into a single function
    to run inside a thread worker, preventing loop blocking.
    
    IMPROVEMENT: Burns camera ID onto each frame for visual identification
    """
    import cv2
    
    annotated_frames_dict = {}
    annotated_frames_list = []
    
    for cid in camera_ids:
        raw = raw_frames_snapshot.get(cid)
        if raw is not None:
            # Copy the frame so we don't draw text over the original buffer used by YOLO
            frame = raw.copy()
            
            # ─────────────────────────────────────────────────────────────
            # BURN CAMERA ID ONTO FRAME
            # ─────────────────────────────────────────────────────────────
            
            text = f"CAM {cid}"
            
            # Draw black background box for text readability
            # Box at top-left: (x1, y1) to (x2, y2)
            cv2.rectangle(frame, (5, 5), (140, 45), (0, 0, 0), -1)
            
            # Draw green text over the black box
            cv2.putText(
                frame, 
                text, 
                (15, 33),  # Text position (x, y)
                cv2.FONT_HERSHEY_SIMPLEX,  # Font
                1.0,  # Font scale
                (0, 255, 0),  # BGR color: Green
                2,  # Thickness
                cv2.LINE_AA  # Anti-aliased
            )
            
            annotated_frames_dict[cid] = frame
            annotated_frames_list.append(frame)

    if not annotated_frames_list:
        return None, {}

    # 1. Tile Frames using the annotated images
    composite = _compose(annotated_frames_list, layout, comp_w, comp_h, main_ratio)
    
    # 2. JPEG Encode Composite Frame
    comp_jpeg = None
    if composite is not None:
        ok, buf = cv2.imencode(".jpg", composite, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        if ok:
            comp_jpeg = bytes(buf)

    # 3. JPEG Encode Individual Streams (with camera ID burned in)
    indiv_jpegs = {}
    for cid, frame in annotated_frames_dict.items():
        ok2, buf2 = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        if ok2:
            indiv_jpegs[cid] = bytes(buf2)

    return comp_jpeg, indiv_jpegs
# ---------------------------------------------------------------------------
# CameraNode  (multi-camera, backwards-compatible API)
# ---------------------------------------------------------------------------

class CameraNode:
    """
    Manages N USB cameras and composites their frames into a single stream.
    Detection is handled by an async DetectionOptimizer that never blocks
    the capture or compositor loops.
    """

    def __init__(
        self,
        ws_manager,
        camera_ids: List[int] = None,
        camera_id: int = None,
        enabled: bool = True,
        yolo_model_path: str = "yolov8n.pt",
        layout: str = "side_by_side",
        composite_width: int = 1280,
        composite_height: int = 720,
        layout_main_ratio: float = 0.65,
        ai_node = None,
        detection_frame_skip: int = 2,
        detection_confidence: float = 0.5,
        detection_max_concurrent: int = 1,
    ):
        if camera_ids is not None:
            self._camera_ids: List[int] = list(camera_ids)
        elif camera_id is not None:
            self._camera_ids = [camera_id]
        else:
            self._camera_ids = [0]

        self.ws_manager = ws_manager
        self.enabled = enabled
        self.running = False
        self.ai_node = ai_node

        # ── Layout & Composite Settings ────────────────────────────────────
        self.layout = layout
        self.composite_width = composite_width
        self.composite_height = composite_height
        self.layout_main_ratio = layout_main_ratio
        self.fps = 30

        # ── Frame Storage ──────────────────────────────────────────────────
        self._raw_frames: Dict[int, Optional[np.ndarray]] = {cid: None for cid in self._camera_ids}
        self.latest_frames: Dict[int, bytes] = {}  # JPEG-encoded frames
        self.current_frame_jpeg: Optional[bytes] = None
        self.current_frame_time: float = 0.0
        self.frame_count: int = 0

        # ── Detection Settings ─────────────────────────────────────────────
        self.detection_enabled = False
        self.detection_confidence = detection_confidence
        self.per_camera_detection: Dict[int, bool] = {cid: False for cid in self._camera_ids}

        # Initialize DetectionOptimizer (async queue-based system)
        # This does NOT load the model until explicitly requested
        self.detection_optimizer = DetectionOptimizer(
            model_path=yolo_model_path,
            max_concurrent_inferences=detection_max_concurrent,
            frame_skip_ratio=detection_frame_skip,
            confidence_threshold=detection_confidence,
            enable_adaptive_skip=True,
            max_queue_depth=5,
        )

        logger.info(
            f"✅ CameraNode initialised\n"
            f"   Cameras: {self._camera_ids}\n"
            f"   Layout: {layout} ({composite_width}×{composite_height})\n"
            f"   Detection: async queue (max_concurrent={detection_max_concurrent}, "
            f"frame_skip={detection_frame_skip})"
        )

    # ────────────────────────────────────────────────────────────────────────
    # Public API
    # ────────────────────────────────────────────────────────────────────────

    async def start(self):
        """
        Start camera capture and compositor.
        Spawns capture loops for each camera, detection worker, and compositor.
        """
        if not self.enabled:
            logger.warning("Camera node is disabled")
            return

        # Load YOLO model ONCE if detection enabled
        if self.detection_enabled:
            logger.info("Loading YOLO model...")
            loaded = await self.detection_optimizer.load_model()
            if not loaded:
                logger.error("Could not load YOLO model, disabling detection")
                self.detection_enabled = False
            else:
                logger.info("✅ YOLO model loaded")

        self.running = True

        # Spawn all capture coroutines (one per camera)
        tasks = [
            asyncio.create_task(self._capture_camera_loop(cid), name=f"Camera-{cid}")
            for cid in self._camera_ids
        ]

        # Spawn detection worker (only if detection enabled)
        if self.detection_enabled:
            logger.info("Spawning detection worker...")
            tasks.append(
                asyncio.create_task(
                    self.detection_optimizer.detection_worker_loop(),
                    name="Detection-Worker"
                )
            )

            # Spawn telemetry broadcaster (shows queue depth, inference time, etc.)
            if self.ws_manager:
                tasks.append(
                    asyncio.create_task(
                        self.detection_optimizer.broadcast_telemetry(self.ws_manager),
                        name="Detection-Telemetry"
                    )
                )

        # Spawn compositor (reads raw frames, composites + encodes them)
        tasks.append(
            asyncio.create_task(self._compositor_loop(), name="Compositor")
        )

        logger.info(f"✅ Camera node started: {len(tasks)} tasks")
        logger.info(f"   Capture: {self._camera_ids}")
        logger.info(f"   Detection: {'enabled' if self.detection_enabled else 'disabled'}")

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("Camera node cancelled")
        finally:
            self.running = False
            logger.info("Camera node stopped")

    def toggle_detection(self, enable: bool, camera_id: int = None):
        """
        Enable/disable detection globally or per-camera.

        Args:
            enable: True to enable, False to disable
            camera_id: Specific camera ID, or None for all cameras
        """
        if camera_id is None:
            # Global toggle
            self.detection_enabled = enable
            for cid in self._camera_ids:
                self.per_camera_detection[cid] = enable
            logger.info(f"Detection toggled: {enable} (all cameras)")
        else:
            # Per-camera toggle
            if camera_id in self._camera_ids:
                self.per_camera_detection[camera_id] = enable
                logger.info(f"Detection toggled: {enable} (camera {camera_id})")
            else:
                logger.warning(f"Camera {camera_id} not in active list")

    def load_model(self):
        """Legacy method for backward compatibility."""
        logger.warning("load_model() is deprecated; use toggle_detection(True) instead")
        self.detection_enabled = True

    def get_camera_info(self) -> dict:
        """Return camera status and configuration."""
        return {
            "camera_ids": self._camera_ids,
            "layout": self.layout,
            "composite_width": self.composite_width,
            "composite_height": self.composite_height,
            "detection_enabled": self.detection_enabled,
            "per_camera_detection": self.per_camera_detection,
            "frame_count": self.frame_count,
            "current_frame_time": self.current_frame_time,
        }

    def set_camera_properties(self, width: int, height: int, fps: int) -> bool:
        """Set camera capture properties (not yet implemented)."""
        logger.warning("set_camera_properties() not yet implemented")
        return False

    # ────────────────────────────────────────────────────────────────────────
    # Capture Loop (one per camera)
    # ────────────────────────────────────────────────────────────────────────

    async def _capture_camera_loop(self, cam_id: int):
        """
        Continuously read frames from a USB camera and store them.
        Frames are queued for detection (non-blocking) and stored in _raw_frames.

        The detection optimizer handles:
        - Queuing frames for YOLO (non-blocking, <1ms)
        - Skipping frames adaptively based on queue depth
        - Running YOLO in background worker without blocking capture

        This loop NEVER waits for detection to complete.
        """
        logger.info(f"📹 Opening camera {cam_id}...")

        # Open camera with timeout
        try:
            cap = await asyncio.wait_for(
                asyncio.to_thread(self._open_camera, cam_id),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            logger.error(f"❌ Timeout opening camera {cam_id}")
            return
        except Exception as exc:
            logger.error(f"❌ Error opening camera {cam_id}: {exc}")
            return

        if cap is None or not cap.isOpened():
            logger.error(f"❌ Camera {cam_id} did not open properly")
            return

        # Warm-up (read a few frames to stabilize)
        logger.info(f"Warming up camera {cam_id}...")
        warmup, start = 0, time.time()
        while warmup < 5 and time.time() - start < 10.0:
            ret, _ = await asyncio.to_thread(cap.read)
            if ret:
                warmup += 1
            await asyncio.sleep(0.05)

        if warmup == 0:
            logger.error(f"❌ Camera {cam_id}: no frames after 10 s – giving up")
            cap.release()
            return

        logger.info(f"✅ Camera {cam_id} warmed up ({warmup} frames)")
        logger.info(
            f"   Frame skip: {self.detection_optimizer.base_skip_ratio} "
            f"(process every {self.detection_optimizer.base_skip_ratio} frame)"
        )
        logger.info(f"   Confidence: {self.detection_confidence}")

        errors = 0
        frame_counter = 0

        try:
            while self.running:
                # Read frame from camera
                ret, frame = await asyncio.to_thread(cap.read)

                if not ret:
                    errors += 1
                    if errors > 10:
                        logger.error(f"❌ Camera {cam_id}: too many read errors – stopping")
                        break
                    await asyncio.sleep(0.1)
                    continue

                errors = 0

                # Periodic logging
                if frame_counter % 300 == 0 and frame_counter > 0:
                    should_detect = self.per_camera_detection.get(cam_id, False)
                    logger.info(
                        f"📹 Camera {cam_id}: frame #{frame_counter}, "
                        f"detection_enabled={self.detection_enabled}, "
                        f"this_camera_detect={should_detect}"
                    )

                # ═══════════════════════════════════════════════════════════
                # OPTIMIZED DETECTION: Queue frame, NEVER WAIT
                # ═══════════════════════════════════════════════════════════
                if self.detection_enabled:
                    should_detect = self.per_camera_detection.get(cam_id, False)

                    if should_detect:
                        # Queue frame for background YOLO (non-blocking, <1ms)
                        queued, reason = self.detection_optimizer.queue_frame_for_detection(
                            cam_id, frame
                        )

                        # Try to get processed result if ready (non-blocking)
                        processed = await self.detection_optimizer.get_processed_frame(cam_id)
                        if processed is not None:
                            frame = processed

                # Store frame in shared dict for compositor
                self._raw_frames[cam_id] = frame
                frame_counter += 1

                # Sleep for frame interval (e.g., 1/30 for 30 FPS)
                await asyncio.sleep(1.0 / self.fps)

        except asyncio.CancelledError:
            logger.info(f"📹 Camera {cam_id} cancelled")
        except Exception as exc:
            logger.error(f"❌ Camera {cam_id} loop error: {exc}")
        finally:
            cap.release()
            self._raw_frames[cam_id] = None
            logger.info(f"📷 Camera {cam_id} released")

    @staticmethod
    def _open_camera(cam_id: int) -> cv2.VideoCapture:
        """Open a camera by ID with platform-specific optimizations."""
        # Try DirectShow on Windows (faster initialization)
        cap = cv2.VideoCapture(cam_id, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(cam_id)

        if cap.isOpened():
            # Minimize buffering (we want fresh frames, not old ones)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # Capture resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            # Target FPS
            cap.set(cv2.CAP_PROP_FPS, 30)

        return cap

    # ────────────────────────────────────────────────────────────────────────
    # Compositor Loop
    # ────────────────────────────────────────────────────────────────────────

    async def _compositor_loop(self):
        """
        Periodically read _raw_frames, composite them, JPEG-encode, and
        broadcast a lightweight WS notification.

        This loop is FAST because:
        1. Reads a snapshot of raw frames (lock-free, instant)
        2. Offloads composition + JPEG encoding to thread pool
        3. Stores result in self.current_frame_jpeg
        4. Sends a lightweight notification (no pixel data)
        """
        interval = 1.0 / self.fps
        broadcast_count = 0
        last_log = time.time()

        logger.info(f"Compositor loop started ({self.fps} FPS target)")

        try:
            while self.running:
                t0 = time.time()

                # Get a snapshot of current frames (no lock, just dict read)
                raw_snapshot = {cid: self._raw_frames.get(cid) for cid in self._camera_ids}

                # If we have at least one frame, composite and encode
                if any(f is not None for f in raw_snapshot.values()):
                    # CRITICAL: Offload composition + JPEG encoding to thread pool
                    # This prevents the event loop from blocking
                    comp_jpeg, indiv_jpegs = await asyncio.to_thread(
                        _process_and_encode_all,
                        raw_snapshot,
                        self._camera_ids,
                        self.layout,
                        self.composite_width,
                        self.composite_height,
                        self.layout_main_ratio,
                        80  # JPEG quality
                    )

                    # Store composite
                    if comp_jpeg:
                        self.current_frame_jpeg = comp_jpeg
                        self.current_frame_time = time.time()
                        self.frame_count += 1

                    # Store individual camera JPEG frames
                    if indiv_jpegs:
                        self.latest_frames.update(indiv_jpegs)

                    # Broadcast lightweight notification (no pixel data)
                    if self.ws_manager.active_connections:
                        notification = {
                            "class": "camera_frame_available",
                            "timestamp": self.current_frame_time,
                            "camera_ids": self._camera_ids,
                            "active_cameras": [
                                cid for cid in self._camera_ids
                                if raw_snapshot.get(cid) is not None
                            ],
                            "frame_count": self.frame_count,
                            "url": "/video",
                        }
                        try:
                            await self.ws_manager.broadcast(notification)
                            broadcast_count += 1
                        except Exception as exc:
                            logger.debug(f"Notification broadcast error: {exc}")

                # Periodic progress log
                if time.time() - last_log >= 5.0:
                    clients = len(self.ws_manager.active_connections)
                    active = [c for c in self._camera_ids if self._raw_frames.get(c) is not None]
                    logger.info(
                        f"📹 Compositor: {broadcast_count} frames / 5s  "
                        f"active: {active}  "
                        f"clients: {clients}"
                    )
                    broadcast_count = 0
                    last_log = time.time()

                # Sleep for remainder of frame interval
                elapsed = time.time() - t0
                sleep = max(0.0, interval - elapsed)
                await asyncio.sleep(sleep)

        except asyncio.CancelledError:
            logger.info("Compositor loop cancelled")
        except Exception as exc:
            logger.error(f"❌ Compositor loop error: {exc}")