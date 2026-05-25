#!/usr/bin/env python3
"""
Quick camera test script - run this to diagnose camera issues
Usage: python test_camera.py
"""

import cv2
import time

def test_camera(camera_id=0, duration=5):
    """Test if a camera works by reading frames"""
    print(f"\n{'='*70}")
    print(f"Testing Camera ID: {camera_id}")
    print(f"{'='*70}")
    
    # Try to open camera
    print(f"[1/4] Opening camera...")
    cap = cv2.VideoCapture(camera_id)
    
    if not cap.isOpened():
        print(f"❌ FAILED: Cannot open camera {camera_id}")
        print("   Possible issues:")
        print("   - Camera not connected or powered off")
        print("   - Camera drivers not installed")
        print("   - Camera already in use by another app")
        print("   - Wrong camera ID (try different numbers)")
        return False
    
    print(f"✅ Camera opened successfully")
    
    # Get camera properties
    print(f"\n[2/4] Checking camera properties...")
    try:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        print(f"✅ Resolution: {width}x{height}")
        print(f"✅ FPS: {fps}")
    except Exception as e:
        print(f"⚠️  Warning getting properties: {e}")
    
    # Try to read frames
    print(f"\n[3/4] Reading frames for {duration} seconds...")
    start_time = time.time()
    frame_count = 0
    errors = 0
    
    while time.time() - start_time < duration:
        ret, frame = cap.read()
        
        if ret:
            frame_count += 1
            print(f"  Frame {frame_count}: {frame.shape} ✓", end="\r")
        else:
            errors += 1
            print(f"  ❌ Failed to read frame (error #{errors})")
        
        time.sleep(0.1)
    
    elapsed = time.time() - start_time
    actual_fps = frame_count / elapsed if elapsed > 0 else 0
    
    print(f"\n✅ Successfully read {frame_count} frames in {elapsed:.1f}s")
    print(f"   Actual FPS: {actual_fps:.1f}")
    print(f"   Failed reads: {errors}")
    
    # Cleanup
    print(f"\n[4/4] Cleaning up...")
    cap.release()
    print(f"✅ Camera released")
    
    return frame_count > 0

def main():
    print("\n" + "="*70)
    print("🎥 DRONE STATION CAMERA TEST")
    print("="*70)
    
    # Detect available cameras
    print("\n[Scanning] Detecting available cameras...")
    available = []
    
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            available.append(i)
            cap.release()
            print(f"  ✅ Camera {i} detected")
        else:
            print(f"  ❌ Camera {i} not available")
    
    if not available:
        print("\n❌ No cameras detected!")
        print("\nTroubleshooting:")
        print("1. Check if camera is connected to USB")
        print("2. Check if camera is powered on")
        print("3. Close other apps using the camera (Zoom, Teams, OBS, etc.)")
        print("4. Try a different USB port")
        print("5. Check Device Manager for camera drivers")
        return
    
    # Test each detected camera
    print(f"\n{'='*70}")
    print(f"Found {len(available)} camera(s). Testing each...")
    print(f"{'='*70}")
    
    for cam_id in available:
        success = test_camera(cam_id, duration=5)
        if not success:
            print(f"❌ Camera {cam_id} FAILED")
        else:
            print(f"✅ Camera {cam_id} SUCCESS - Ready for drone station!")
    
    print(f"\n{'='*70}")
    print("🎥 TEST COMPLETE")
    print(f"{'='*70}\n")
    
    # Recommendations
    if available:
        print("Next steps:")
        print(f"1. Run: python main.py")
        print(f"2. Select Camera {available[0]} in the GUI")
        print(f"3. Make sure 'Enable Camera Stream' is CHECKED ✓")
        print(f"4. Click 'START STATION'")
        print(f"5. Open http://localhost:8765 in your browser")
    else:
        print("Please fix camera issues and try again.")

if __name__ == "__main__":
    main()
