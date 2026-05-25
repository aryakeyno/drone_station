# Integration Tests for Detection Service
# File: test/test_detection_service.py

"""
Comprehensive integration tests for DetectionService.

Tests cover:
- Frame queueing (success, skipped, errors)
- Concurrency and thread safety
- Performance SLAs
- State transitions
- Error recovery
- Message contracts
- Telemetry accuracy
"""

import pytest
import asyncio
import numpy as np
import cv2
import time
from pathlib import Path

from vision.detection_optimizer import DetectionOptimizer


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
async def detector():
    """Create and load detector for tests"""
    d = DetectionOptimizer(
        model_path="yolov8n.pt",
        max_concurrent_inferences=1,
        frame_skip_ratio=2,
        confidence_threshold=0.5,
    )
    loaded = await d.load_model()
    assert loaded, "Failed to load model"
    yield d
    
    # Cleanup
    await d.unload_model()


@pytest.fixture
def test_frame():
    """Generate synthetic test frame (720p, BGR)"""
    return np.random.randint(0, 256, (720, 1280, 3), dtype=np.uint8)


@pytest.fixture
def test_frames(test_frame):
    """Generate multiple test frames"""
    return [test_frame.copy() for _ in range(10)]


# ============================================================================
# TEST SUITE 1: BASIC FUNCTIONALITY
# ============================================================================

class TestBasicFunctionality:
    """Tests for core queueing and result retrieval"""
    
    @pytest.mark.asyncio
    async def test_queue_frame_success(self, detector, test_frame):
        """Frame queueing returns (True, 'queued')"""
        queued, reason = detector.queue_frame_for_detection(0, test_frame)
        
        assert queued is True
        assert reason == "queued"
    
    @pytest.mark.asyncio
    async def test_queue_frame_invalid_shape(self, detector):
        """Invalid frame shape rejected gracefully"""
        bad_frame = np.zeros((720, 1280, 4), dtype=np.uint8)  # 4 channels
        
        queued, reason = detector.queue_frame_for_detection(0, bad_frame)
        
        assert queued is False
        assert "invalid" in reason.lower()
    
    @pytest.mark.asyncio
    async def test_queue_frame_invalid_dtype(self, detector):
        """Invalid frame dtype rejected gracefully"""
        bad_frame = np.zeros((720, 1280, 3), dtype=np.float32)  # Wrong dtype
        
        queued, reason = detector.queue_frame_for_detection(0, bad_frame)
        
        assert queued is False
        assert "invalid" in reason.lower()
    
    @pytest.mark.asyncio
    async def test_get_processed_frame_empty(self, detector):
        """get_processed_frame returns None if nothing queued yet"""
        result = await detector.get_processed_frame(0)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_processed_frame_returns_ndarray(self, detector, test_frame):
        """get_processed_frame returns numpy array after inference"""
        queued, _ = detector.queue_frame_for_detection(0, test_frame)
        assert queued
        
        # Wait for inference
        await asyncio.sleep(0.5)
        
        result = await detector.get_processed_frame(0)
        
        # Result may be None (inference still running) or ndarray
        if result is not None:
            assert isinstance(result, np.ndarray)
            assert result.dtype == np.uint8
    
    @pytest.mark.asyncio
    async def test_get_telemetry_structure(self, detector):
        """Telemetry has correct structure and ranges"""
        telemetry = detector.get_telemetry()
        
        # Check required fields
        assert "enabled" in telemetry
        assert "total_queued" in telemetry
        assert "total_processed" in telemetry
        assert "total_skipped" in telemetry
        assert "avg_inference_ms" in telemetry
        assert "avg_queue_depth" in telemetry
        assert "per_camera" in telemetry
        
        # Check value ranges
        assert telemetry["enabled"] is True
        assert telemetry["total_queued"] >= 0
        assert telemetry["total_processed"] >= 0
        assert telemetry["total_skipped"] >= 0
        assert 0 <= telemetry["avg_inference_ms"] <= 2000
        assert 0 <= telemetry["avg_queue_depth"] <= 10
        
        # Check per_camera structure
        assert isinstance(telemetry["per_camera"], dict)
        for cam_id, stats in telemetry["per_camera"].items():
            assert "queued" in stats
            assert "processed" in stats
            assert "skipped" in stats


# ============================================================================
# TEST SUITE 2: LATENCY SLA
# ============================================================================

class TestLatencySLA:
    """Tests verify latency meets SLA (< 1ms for queueing, < 0.1ms for retrieval)"""
    
    @pytest.mark.asyncio
    async def test_queue_frame_latency_p99(self, detector, test_frame):
        """Frame queueing latency p99 < 1ms"""
        times = []
        
        for _ in range(100):
            start = time.perf_counter()
            detector.queue_frame_for_detection(0, test_frame)
            elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
            times.append(elapsed)
        
        p99 = np.percentile(times, 99)
        
        print(f"\nQueue latency p99: {p99:.3f}ms")
        assert p99 < 1.0, f"p99 latency {p99:.3f}ms exceeds SLA of 1.0ms"
    
    @pytest.mark.asyncio
    async def test_get_telemetry_latency_p99(self, detector):
        """Telemetry retrieval latency p99 < 0.1ms"""
        times = []
        
        for _ in range(100):
            start = time.perf_counter()
            detector.get_telemetry()
            elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
            times.append(elapsed)
        
        p99 = np.percentile(times, 99)
        
        print(f"\nTelemetry latency p99: {p99:.3f}ms")
        assert p99 < 0.1, f"p99 latency {p99:.3f}ms exceeds SLA of 0.1ms"


# ============================================================================
# TEST SUITE 3: CONCURRENCY
# ============================================================================

class TestConcurrency:
    """Tests for thread-safe concurrent operations"""
    
    @pytest.mark.asyncio
    async def test_multiple_cameras_concurrent(self, detector, test_frames):
        """Multiple cameras can queue simultaneously"""
        results = []
        
        async def queue_to_camera(cam_id, frame):
            return detector.queue_frame_for_detection(cam_id, frame)
        
        # Queue to cameras 0-3 concurrently
        tasks = [
            queue_to_camera(i, test_frames[i])
            for i in range(4)
        ]
        
        results = await asyncio.gather(*tasks)
        
        # All should succeed
        assert all(r[0] is True for r in results)
    
    @pytest.mark.asyncio
    async def test_read_during_inference(self, detector, test_frame):
        """Can read results while inference is happening"""
        # Queue frame
        queued, _ = detector.queue_frame_for_detection(0, test_frame)
        assert queued
        
        # Try to read while inference happening
        results = []
        for _ in range(10):
            result = await detector.get_processed_frame(0)
            results.append(result)
            await asyncio.sleep(0.01)
        
        # Some results may be None, some may be ndarray, all valid
        assert all(r is None or isinstance(r, np.ndarray) for r in results)
    
    @pytest.mark.asyncio
    async def test_config_change_thread_safe(self, detector, test_frame):
        """Configuration can change while queueing"""
        # Start queueing
        for i in range(10):
            detector.queue_frame_for_detection(0, test_frame)
        
        # Change config while queueing
        detector.set_configuration(frame_skip_ratio=4)
        
        # Continue queueing
        for i in range(10):
            detector.queue_frame_for_detection(0, test_frame)
        
        # Verify config changed
        assert detector.base_skip_ratio == 4


# ============================================================================
# TEST SUITE 4: FRAME SKIPPING
# ============================================================================

class TestFrameSkipping:
    """Tests for frame skip ratio behavior"""
    
    @pytest.mark.asyncio
    async def test_skip_ratio_2(self, test_frame):
        """With skip_ratio=2, roughly 50% of frames queued"""
        detector = DetectionOptimizer(
            model_path="yolov8n.pt",
            frame_skip_ratio=2,
        )
        await detector.load_model()
        
        queued_count = 0
        for i in range(100):
            q, _ = detector.queue_frame_for_detection(0, test_frame)
            if q:
                queued_count += 1
        
        ratio = queued_count / 100
        
        print(f"\nWith skip_ratio=2, queued: {ratio*100:.0f}%")
        # Allow 40-60% due to randomness/timing
        assert 0.4 <= ratio <= 0.6, f"Expected ~50%, got {ratio*100:.0f}%"
    
    @pytest.mark.asyncio
    async def test_skip_ratio_4(self, test_frame):
        """With skip_ratio=4, roughly 25% of frames queued"""
        detector = DetectionOptimizer(
            model_path="yolov8n.pt",
            frame_skip_ratio=4,
        )
        await detector.load_model()
        
        queued_count = 0
        for i in range(100):
            q, _ = detector.queue_frame_for_detection(0, test_frame)
            if q:
                queued_count += 1
        
        ratio = queued_count / 100
        
        print(f"\nWith skip_ratio=4, queued: {ratio*100:.0f}%")
        # Allow 20-35% due to randomness/timing
        assert 0.2 <= ratio <= 0.35


# ============================================================================
# TEST SUITE 5: THROUGHPUT
# ============================================================================

class TestThroughput:
    """Tests verify throughput meets SLA (> 1000 req/sec)"""
    
    @pytest.mark.asyncio
    async def test_frame_queueing_throughput(self, detector, test_frame):
        """Frame queueing throughput > 1000 req/sec"""
        start = time.perf_counter()
        count = 0
        
        # Queue frames for 5 seconds
        while time.perf_counter() - start < 5.0:
            queued, reason = detector.queue_frame_for_detection(0, test_frame)
            if queued or "skipped" in reason:
                count += 1
        
        elapsed = time.perf_counter() - start
        rate = count / elapsed
        
        print(f"\nFrame queueing throughput: {rate:.0f} req/sec")
        assert rate > 1000, f"Expected > 1000 req/sec, got {rate:.0f}"


# ============================================================================
# TEST SUITE 6: STATE MANAGEMENT
# ============================================================================

class TestStateManagement:
    """Tests for state transitions and lifecycle"""
    
    @pytest.mark.asyncio
    async def test_load_unload_cycle(self):
        """Service can load, unload, and reload model"""
        detector = DetectionOptimizer(model_path="yolov8n.pt")
        
        # Load
        loaded = await detector.load_model()
        assert loaded is True
        assert detector.enabled is True
        
        # Unload
        await detector.unload_model()
        assert detector.enabled is False
        
        # Reload
        loaded = await detector.load_model()
        assert loaded is True
        assert detector.enabled is True
    
    @pytest.mark.asyncio
    async def test_disabled_service_rejects_frames(self):
        """Disabled service rejects frame queueing"""
        detector = DetectionOptimizer(model_path="yolov8n.pt")
        
        # Don't load model
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        
        queued, reason = detector.queue_frame_for_detection(0, frame)
        
        assert queued is False
        assert "disabled" in reason.lower()


# ============================================================================
# TEST SUITE 7: ERROR RECOVERY
# ============================================================================

class TestErrorRecovery:
    """Tests for graceful error handling"""
    
    @pytest.mark.asyncio
    async def test_invalid_frame_does_not_crash_service(self, detector):
        """Invalid frame doesn't crash service"""
        frame = np.zeros((720, 1280, 4), dtype=np.uint8)  # Wrong channels
        
        queued, reason = detector.queue_frame_for_detection(0, frame)
        
        assert queued is False
        
        # Service still works
        good_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        queued, reason = detector.queue_frame_for_detection(0, good_frame)
        assert queued is True
    
    @pytest.mark.asyncio
    async def test_multiple_unloads_safe(self, detector):
        """Multiple unload calls don't crash"""
        await detector.unload_model()
        await detector.unload_model()  # Second unload should be safe
        
        # Service should still be valid
        detector.enabled is False


# ============================================================================
# TEST SUITE 8: MESSAGE CONTRACTS
# ============================================================================

class TestMessageContracts:
    """Tests verify message schemas match spec"""
    
    @pytest.mark.asyncio
    async def test_frame_queue_response_schema(self, detector, test_frame):
        """FrameQueueResponse has correct schema"""
        queued, reason = detector.queue_frame_for_detection(0, test_frame)
        
        # Check return types
        assert isinstance(queued, bool)
        assert isinstance(reason, str)
        assert reason in [
            "queued",
            "skipped (ratio 1)",
            "skipped (ratio 2)",
            "skipped (ratio 4)",
            "skipped (adaptive)",
            "queue_full",
            "detection_disabled",
            "invalid_frame_shape",
            "invalid_frame_dtype",
        ]
    
    @pytest.mark.asyncio
    async def test_telemetry_schema(self, detector):
        """Telemetry message has correct schema"""
        telemetry = detector.get_telemetry()
        
        # Check types
        assert isinstance(telemetry["enabled"], bool)
        assert isinstance(telemetry["total_queued"], int)
        assert isinstance(telemetry["total_processed"], int)
        assert isinstance(telemetry["total_skipped"], int)
        assert isinstance(telemetry["avg_inference_ms"], (int, float))
        assert isinstance(telemetry["avg_queue_depth"], (int, float))
        assert isinstance(telemetry["per_camera"], dict)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])