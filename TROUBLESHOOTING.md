# Drone Station - Performance & Video Frame Troubleshooting Guide

## Issues Fixed

### 1. **GUI Launching Takes 26+ Seconds** ✅ FIXED
**Root Cause:** The camera enumeration was checking 10 cameras sequentially, with each check trying multiple OpenCV backends (MSMF, DirectShow, OBS), causing massive delays.

**Fixes Applied:**
- ✅ Changed to **parallel threading** for camera detection (checks cameras in parallel instead of one-by-one)
- ✅ Reduced cameras checked from 10 to 5
- ✅ Added 1.5s timeout per camera detection
- ✅ Added buffer size optimization for camera
- **Expected Result:** GUI launch time reduced from ~26s to **3-5 seconds**

### 2. **No Video Frames Displaying** 
**Possible Causes & Solutions:**

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Camera not detected** | "No Camera Detected" in dropdown | Check if camera is connected & powered |
| **Camera driver missing** | Errors in logs about device enumeration | Install/update camera drivers |
| **Camera in use elsewhere** | "Cannot open camera" error | Close other apps using camera (Zoom, Teams, etc.) |
| **Wrong camera ID selected** | Selected camera 1 but only camera 0 exists | Check available cameras in dropdown |
| **USB connection issue** | Intermittent "Failed to read frame" errors | Check USB cable, try different USB port |
| **Permission denied** | Access denied errors | Run app with admin privileges |

---

## How to Diagnose Camera Issues

### Step 1: Check Application Logs
When you run `main.py`, look for:

```
✅ Messages = Camera working:
- "🎥 CameraNode started - Camera ID: 0, Detection: False"
- "Camera properties - Resolution: 640x480, FPS: 30.0"
- "camera_frame" messages in logs

❌ Error Messages = Camera issues:
- "Cannot open camera {id}"
- "Failed to read frame from camera"
- "too many consecutive errors"
```

### Step 2: Test Camera Directly
Run this Python script to test camera access:

```python
import cv2

# Test camera 0
cap = cv2.VideoCapture(0)
if cap.isOpened():
    print("✅ Camera 0 is accessible")
    ret, frame = cap.read()
    if ret:
        print(f"✅ Can read frame: {frame.shape}")
    else:
        print("❌ Cannot read frame")
    cap.release()
else:
    print("❌ Camera 0 cannot be opened")
    print("  Check if:")
    print("  - Camera is connected")
    print("  - Camera is not in use by another app")
    print("  - Camera drivers are installed")
```

### Step 3: Check Connected Cameras
```python
import cv2

for i in range(5):
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        print(f"✅ Camera {i} is available")
        cap.release()
```

### Step 4: Close Programs Using Camera
**Common camera-hogging applications:**
- ✅ Zoom / Teams / Discord / Skype
- ✅ OBS Studio
- ✅ YouTube Live Creator
- ✅ Browser tabs with webcam access
- ✅ Previous Drone Station instance

---

## Performance Optimization Tips

### 1. Disable YOLO Detection (If Frames Still Slow)
Edit the GUI and uncheck "Enable Detection" to:
- Reduce CPU load
- Increase frame rate
- Save GPU memory

### 2. Check System Resources
While running:
- Open Task Manager (Ctrl+Shift+Esc)
- Check CPU, GPU, Memory usage
- If any near 100%, close other applications

### 3. Reduce Frame Resolution
Edit `config/settings.py`:
```python
# Change from 640x480 to 320x240 for faster capture
# (Currently set in camera_node.py)
```

### 4. Increase FPS Target (Optional)
In `camera_node.py`:
```python
self.fps = 30  # Current setting (adjust if camera supports more)
```

---

## Expected Log Output (Working System)

### When GUI Launches
```
2026-05-14 12:52:11,367 - INFO - vision.camera_node - 🎥 CameraNode initialized - Camera ID: 0, Enabled: True
2026-05-14 12:52:11,374 - INFO - Main - Launching configuration GUI...
[... GUI opens quickly ...]
2026-05-14 12:52:37,307 - INFO - Main - Configuration selected:
```
⚠️ **Note:** GUI should take **3-5 seconds max** after fixes, not 26 seconds!

### When Camera Starts
```
2026-05-14 12:52:50,889 - INFO - vision.camera_node - 🎥 CameraNode started - Camera ID: 0, Detection: False
2026-05-14 12:52:50,890 - INFO - vision.camera_node - 🎥 Camera properties - Resolution: 640x480, FPS: 30.0
2026-05-14 12:52:50,891 - INFO - server.socket_manager - ✓ Client connected. Total: 1
2026-05-14 12:52:50,950 - DEBUG - vision.camera_node - Broadcasting frame #1
2026-05-14 12:52:50,980 - DEBUG - vision.camera_node - Broadcasting frame #2
[... frames continue broadcasting ...]
```

---

## Troubleshooting Checklist

- [ ] GUI launches in 5-10 seconds (was 26s)
- [ ] Camera dropdown shows available cameras
- [ ] Can select Camera 0 and enable it
- [ ] No red errors about camera in logs
- [ ] WebSocket shows frames being received
- [ ] Web UI displays video stream

---

## Contact & Additional Help

If issues persist after these fixes:

1. **Collect diagnostic info:**
   ```python
   # Run this and share output
   import cv2
   print(f"OpenCV Version: {cv2.__version__}")
   print(f"Available cameras:")
   for i in range(5):
       cap = cv2.VideoCapture(i)
       if cap.isOpened():
           print(f"  Camera {i}: ✅")
           cap.release()
   ```

2. **Check logs for full error messages**
3. **Try on different USB port/camera if available**
4. **Update OpenCV:** `pip install --upgrade opencv-python`

---

## Files Modified
- [startup.py](gui/startup.py) - Parallel camera detection
- [camera_node.py](vision/camera_node.py) - Enhanced debugging & error handling
