# Model Setup Guide

## Overview

The drone station now supports multiple AI models for object detection. **YOLO is set as the default** in the GUI startup, but you can:

- 🔄 **Switch models** via the GUI selector
- 📂 **Add new models** to the `models/` folder
- 🔧 **Configure model parameters** at startup

## 1. Models Folder Structure

Create a `models/` folder in your project root:

```
drone_station/
├── models/
│   ├── yolov8n.pt      ← YOLO nano (default)
│   ├── yolov8s.pt      ← YOLO small
│   ├── yolov8m.pt      ← YOLO medium
│   └── custom_model.pt ← Any YOLO variant
├── main.py
├── config/
│   └── settings.py
└── gui/
    └── startup.py
```

## 2. Supported Models

The model manager automatically discovers:

- **YOLO models**: `yolov8n.pt`, `yolov8s.pt`, `yolov8m.pt`, `yolov8l.pt`, `yolov8x.pt`
- **YOLO ONNX**: `yolov8n.onnx`, `yolov8s.onnx`, etc.
- **Generic PyTorch**: Any `.pt` file recognized as YOLO

### Model Sizes & Performance

| Model | File Size | Speed (CPU) | Accuracy | Recommended For |
|-------|-----------|-----------|----------|-----------------|
| `yolov8n` (nano) | ~12 MB | 5-30 FPS | Good | RPi, weak hardware |
| `yolov8s` (small) | ~25 MB | 3-15 FPS | Better | Most systems |
| `yolov8m` (medium) | ~50 MB | 1-5 FPS | Best | High-end systems |
| `yolov8l` (large) | ~100 MB | <1 FPS | Excellent | Servers, GPU |

## 3. GUI Model Selection

When you check **"🔍 Object Detection (YOLO)"** in the startup GUI:

1. ✅ **Model selector dropdown appears**
2. 📋 **Lists all discovered models from `models/` folder**
3. 🎯 **YOLO nano is pre-selected as default**
4. 🔄 **You can change the selection before startup**

### Example GUI Flow

```
[✓] 🔍 Object Detection (YOLO)
    Select detection model:
    ┌─────────────────────────────┐
    │ yolov8n (12.3MB)      ◄─── Default (pre-selected)
    │ yolov8s (24.5MB)
    │ yolov8m (49.8MB)
    └─────────────────────────────┘
```

## 4. Downloading Models

### Option A: Download Manually

Download from [Ultralytics YOLOv8 Releases](https://github.com/ultralytics/assets/releases):

```bash
cd models/
# Download nano model (smallest, fastest)
wget https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.pt

# Or small model (more accurate)
wget https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8s.pt
```

### Option B: Auto-Download on First Use

If a model is not found locally, the system will:
1. Attempt to download it automatically
2. Fall back to YOLO nano if download fails
3. Log the download status

```python
# This happens automatically in the detection optimizer
model = YOLO("yolov8n.pt")  # Auto-downloads if missing
```

## 5. Configuration

### Settings File

Edit `config/settings.py` to customize defaults:

```python
@dataclass
class AppConfig:
    # ================================================================
    # Object Detection Model Configuration
    # ================================================================
    # Folder containing detection models (YOLO, etc.)
    models_folder: str = "models"
    
    # Selected detection model name (e.g., "yolov8n", "yolov8s")
    selected_model: str = "yolov8n"  ← Default model name
    
    # Full path to selected model (set dynamically by GUI)
    yolo_model_path: str = "models/yolov8n.pt"
    
    # Detection confidence threshold (0.0-1.0)
    detection_confidence: float = 0.5
    
    # Max concurrent inferences
    detection_max_concurrent: int = 1
    
    # Frame skip ratio (1=all, 2=every 2nd, 4=every 4th)
    detection_frame_skip: int = 2
```

## 6. Model Selection Programmatically

The GUI automatically handles this, but if you need to load a model from code:

```python
from vision.model_manager import ModelManager
from vision.detection_optimizer import DetectionOptimizer

# 1. Discover available models
manager = ModelManager("models")
models = manager.discover_models()
print([m['name'] for m in models])  # ['yolov8n', 'yolov8s', 'yolov8m']

# 2. Get default model
default = manager.get_default_model()
print(f"Default: {default['name']} → {default['path']}")

# 3. Load a specific model
model_info = manager.get_model_by_name("yolov8s")
optimizer = DetectionOptimizer(model_path=model_info['path'])
await optimizer.load_model()
```

## 7. Adding Custom Models

To add a custom detection model:

1. **Copy** your model file to `models/` folder:
   ```bash
   cp /path/to/my_model.pt models/
   ```

2. **Restart** the GUI — it will discover the new model automatically

3. **Select** your custom model from the dropdown

### Requirements

- Model must be PyTorch format (`.pt`) or ONNX (`.onnx`)
- Model should be trained on COCO or compatible dataset
- Naming convention: `model_name.pt` (underscore-friendly)

## 8. Monitoring Model Loading

Check the startup logs to see model discovery:

```
✅ YOLO module loaded for detection optimizer
📦 Model Manager initialized: /path/to/models
🔍 Discovered 3 model(s)
   - yolov8n (yolov8n.pt)      12.3MB
   - yolov8s (yolov8s.pt)      24.5MB
   - yolov8m (yolov8m.pt)      49.8MB
✅ Loading model: yolov8n from /path/to/models/yolov8n.pt
✅ Detection optimizer loaded: /path/to/models/yolov8n.pt
```

## 9. Troubleshooting

### No models found?

```
⚠️  Models folder not found: /path/to/models
```

**Fix**: Create the folder:
```bash
mkdir models
cd models
wget https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.pt
```

### Model selector doesn't appear in GUI?

- ✓ Make sure "🔍 Object Detection (YOLO)" checkbox is **checked**
- ✓ The dropdown should appear below the checkbox
- ✓ If not visible, restart the GUI

### Model fails to load?

```
❌ Failed to load YOLO model: [error details]
```

**Possible causes:**
- Model file corrupted → re-download
- Insufficient RAM → use smaller model (yolov8n)
- Missing dependencies → `pip install ultralytics opencv-python`

### Wrong model loaded?

**Verify in startup logs:**
```
✅ Selected model: yolov8s → /path/to/models/yolov8s.pt
```

Check that `config.yolo_model_path` points to the correct file.

---

## Quick Start

### 1️⃣ Setup (First Time)

```bash
# Create models folder and download default model
mkdir -p models
cd models
wget https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.pt
cd ..
```

### 2️⃣ Launch Station

```bash
python main.py
```

### 3️⃣ In GUI

1. Check "🔍 Object Detection (YOLO)"
2. Select model from dropdown (yolov8n is default)
3. Click "▶ START STATION"

✅ **Done!** Model will load automatically.

---

## Advanced: Model Priority

Models are automatically sorted by priority:

1. **YOLO nano** (`yolov8n.pt`) — always first if present
2. **YOLO small** → **medium** → **large** → **extra-large**
3. **Other models** — alphabetically

This ensures fastest loading and most reasonable defaults.

---

**Last Updated:** 2026-05-21  
**Version:** 1.0
