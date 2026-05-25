#!/usr/bin/env python3
"""
Camera Diagnostics Tool - Identify available cameras and troubleshoot issues
Usage: python diagnose_cameras.py
"""

import cv2
import threading
import time
from queue import Queue
import sys

def test_camera_threaded(cam_id: int, result_queue: Queue, timeout: float = 2.0):
    """Test a single camera with timeout using threading."""
    def _test():
        try:
            print(f"  Testing camera {cam_id}...", end=" ", flush=True)
            
            # Try DirectShow first (Windows)
            cap = cv2.VideoCapture(cam_id, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(cam_id)
            
            if cap.isOpened():
                # Try to read a frame
                ret, frame = cap.read()
                cap.release()
                
                if ret and frame is not None:
                    h, w = frame.shape[:2]
                    print(f"✅ FOUND - {w}×{h}")
                    result_queue.put((cam_id, 'found', w, h))
                    return
                else:
                    print("❌ (opened but no frames)")
                    result_queue.put((cam_id, 'no_frames', 0, 0))
                    return
            else:
                cap.release()
        except Exception as e:
            print(f"❌ (error: {str(e)[:50]})")
        
        result_queue.put((cam_id, 'not_found', 0, 0))
    
    thread = threading.Thread(target=_test, daemon=True)
    thread.start()
    thread.join(timeout=timeout)

def main():
    print("\n" + "="*70)
    print("🎥 DRONE STATION CAMERA DIAGNOSTICS")
    print("="*70)
    
    print("\n📋 OpenCV Information:")
    print(f"  Version: {cv2.__version__}")
    
    # Test cameras 0-9
    print("\n🔍 Scanning for cameras (indices 0-9)...")
    result_queue = Queue()
    
    for i in range(10):
        test_camera_threaded(i, result_queue, timeout=2.0)
    
    # Collect results
    found_cameras = []
    no_frames_cameras = []
    failed_cameras = []
    
    while not result_queue.empty():
        cam_id, status, w, h = result_queue.get_nowait()
        if status == 'found':
            found_cameras.append((cam_id, w, h))
        elif status == 'no_frames':
            no_frames_cameras.append(cam_id)
        else:
            failed_cameras.append(cam_id)
    
    # Display results
    print("\n📊 RESULTS:")
    print("-" * 70)
    
    if found_cameras:
        print(f"\n✅ WORKING CAMERAS: {len(found_cameras)}")
        for cam_id, w, h in sorted(found_cameras):
            print(f"   Camera {cam_id}: {w}×{h}")
        print(f"\n⚠️  USE THESE INDICES: {[c[0] for c in sorted(found_cameras)]}")
    else:
        print(f"\n❌ NO WORKING CAMERAS FOUND")
    
    if no_frames_cameras:
        print(f"\n⚠️  CAMERAS THAT OPENED BUT HAD NO FRAMES: {no_frames_cameras}")
        print("   → These might be in use by another application")
    
    # Recommendations
    print("\n💡 TROUBLESHOOTING RECOMMENDATIONS:")
    print("-" * 70)
    
    if not found_cameras and not no_frames_cameras:
        print("""
❌ NO CAMERAS DETECTED AT ALL

Possible causes:
  1. USB cameras not connected
  2. Camera drivers not installed
  3. All cameras are in use by other applications
  4. Permission issues with /dev/video* (Linux)

Solutions:
  • Check USB connections
  • Install camera drivers (especially DirectShow on Windows)
  • Close other applications using cameras (Zoom, Teams, etc.)
  • For Linux: check permission with: ls -la /dev/video*
  • Run: sudo usermod -a -G video $USER  (then log out/in)
""")
    elif len(found_cameras) < 2:
        print(f"""
⚠️  ONLY {len(found_cameras)} CAMERA(S) FOUND

The GUI detected cameras but might have detected too many indices.
Use these camera IDs when prompted: {[c[0] for c in sorted(found_cameras)]}

To add a camera:
  • Connect USB camera and run this script again
  • Check camera permissions
  • Restart the application
""")
    else:
        print(f"""
✅ {len(found_cameras)} CAMERAS DETECTED AND WORKING

Next steps:
  1. Run the drone station with these camera indices: {[c[0] for c in sorted(found_cameras)]}
  2. When prompted by the GUI, select the cameras you want to use
  3. The GUI should auto-detect these cameras
  
If cameras still timeout during startup:
  • Make sure no other app (Zoom, Teams, OBS) is using them
  • Close the GUI and try again
  • Check system resource usage
""")
    
    # Additional diagnostics
    print("\n" + "="*70)
    print("📋 DETAILED DIAGNOSTICS:")
    print("="*70)
    
    print("\nTesting DirectShow (Windows camera backend)...")
    try:
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if cap.isOpened():
            print("✅ DirectShow available")
            cap.release()
        else:
            print("⚠️  DirectShow not working - will fall back to default backend")
    except Exception as e:
        print(f"⚠️  DirectShow error: {e}")
    
    print("\nTesting default backend...")
    try:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            print("✅ Default backend available")
            cap.release()
        else:
            print("❌ Default backend not working")
    except Exception as e:
        print(f"❌ Default backend error: {e}")
    
    print("\n" + "="*70)
    print("Run this script again after connecting/disconnecting cameras")
    print("="*70 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
