# Multi-Model Detection - Quick Reference

## 🎯 What You Get

✅ **Model Discovery** — Automatically finds all YOLO models in `models/` folder  
✅ **YOLO Default** — `yolov8n.pt` (nano) is pre-selected in GUI  
✅ **GUI Selector** — Dropdown list appears when YOLO is enabled  
✅ **Dynamic Loading** — Selected model loads automatically on startup  
✅ **Extensible** — Easy to add new model types in the future  

---

## 📦 What Changed

### New Files
- `vision/model_manager.py` — Model discovery & management
- `MODEL_SETUP.md` — User setup guide
- `IMPLEMENTATION_GUIDE.md` — Developer reference
- `QUICK_REFERENCE.md` — This file

### Updated Files
- `gui/startup.py` — Added model dropdown + selection logic
- `config/settings.py` — Added model configuration fields

### Unchanged Files
- `main.py` — Just uses updated config
- `vision/detection_optimizer.py` — Already supports any model path
- `vision/camera_node.py` — Already uses config.yolo_model_path

---

## 🚀 Key Code Locations

### 1. Model Discovery: `vision/model_manager.py`

```python
# Discover models
manager = ModelManager("models")
models = manager.discover_models()

# Get default (YOLO nano)
default = manager.get_default_model()

# Get for GUI dropdown
display_list, default_sel = manager.get_model_display_list()
```

### 2. GUI Integration: `gui/startup.py`

```python
# Get models at startup
models, default_model = _get_available_models()

# Show/hide dropdown when YOLO checkbox changes
if event == "-YOLO-ENABLED-":
    window["-MODEL-SELECT-"].update(visible=yolo_enabled)

# Extract model name and load path
model_name = selected_model_display.split()[0]
model_info = manager.get_model_by_name(model_name)
config.yolo_model_path = model_info['path']
```

### 3. Configuration: `config/settings.py`

```python
models_folder: str = "models"           # Folder to scan
selected_model: str = "yolov8n"         # Default model name
yolo_model_path: str = "models/yolov8n.pt"  # Full path (set by GUI)
```

---

## 📋 User Flow

```
1. User runs: python main.py
   │
2. GUI launches → Model Manager discovers models
   │
3. User checks: ☑ Object Detection (YOLO)
   ↓
4. Dropdown appears with available models
   │
   ├─ yolov8n (12.3MB) ← PRE-SELECTED (DEFAULT)
   ├─ yolov8s (24.5MB)
   └─ yolov8m (49.8MB)
   │
5. User can select different model
   │
6. User clicks: ▶ START STATION
   │
7. System loads selected model
   │
8. Detection starts with chosen model ✅
```

---

## 🗂️ Folder Structure

```
models/
├── yolov8n.pt       ← YOLO nano (default, smallest, fastest)
├── yolov8s.pt       ← YOLO small (better accuracy)
└── yolov8m.pt       ← YOLO medium (best accuracy, slower)
```

**How to add models:**
1. Copy `.pt` file to `models/` folder
2. Restart GUI — new model appears automatically ✅
3. Select from dropdown

---

## 📊 Model Comparison

| Model | Size | Speed (CPU) | Accuracy | Best For |
|-------|------|-----------|----------|----------|
| `yolov8n` | 12 MB | 5-30 FPS | Good | **DEFAULT**, RPi |
| `yolov8s` | 25 MB | 3-15 FPS | Better | Standard systems |
| `yolov8m` | 50 MB | 1-5 FPS | Best | High-end systems |

---

## 🔧 Technical Details

### Model Manager Methods

```python
discover_models()           # → List of all models
get_default_model()         # → First model (YOLO nano preferred)
get_model_by_name(name)     # → Find specific model
get_model_display_list()    # → (display_list, default) for GUI
load_model(model_name)      # → (success, path_or_error)
```

### Model Info Dictionary

```python
{
    "name": "yolov8n",                    # Model name
    "filename": "yolov8n.pt",             # File name
    "path": "/full/path/to/yolov8n.pt",   # Full path
    "type": "YOLO",                       # Model type
    "framework": "ultralytics",           # Framework
    "size_mb": 12.3                       # File size in MB
}
```

### Supported Model Patterns

```python
SUPPORTED_PATTERNS = [
    ("yolov8*.pt", "YOLO", "ultralytics"),    # yolov8n, yolov8s, etc.
    ("yolov8*.onnx", "YOLO", "ultralytics"),  # ONNX format
    ("*.pt", "YOLO", "ultralytics"),          # Generic PyTorch
]
```

---

## 🔍 For Developers

### Adding New Model Framework

Edit `vision/model_manager.py`:

```python
SUPPORTED_PATTERNS = [
    ("yolov8*.pt", "YOLO", "ultralytics"),
    ("faster_rcnn*.pt", "FasterRCNN", "torchvision"),  # ← NEW
    ("efficientdet*.onnx", "EfficientDet", "tf"),       # ← NEW
]
```

### Changing Default Model

Option 1: Edit `config/settings.py`:
```python
selected_model: str = "yolov8s"  # Change to yolov8s default
```

Option 2: Custom logic in `gui/startup.py`:
```python
if has_gpu():
    return_default = "yolov8m"  # Large model with GPU
else:
    return_default = "yolov8n"  # Small model on CPU
```

---

## ✅ Checklist: Setup Complete

- [ ] `models/` folder exists
- [ ] At least one YOLO model in `models/` folder
- [ ] Run `python main.py`
- [ ] Check "Object Detection (YOLO)" in GUI
- [ ] See dropdown with available models
- [ ] YOLO nano is pre-selected
- [ ] Select model and click START
- [ ] Logs show "✅ Selected model: [name] → [path]"
- [ ] Detection works! 🎉

---

## 🐛 Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| No model selector in GUI | Is YOLO checkbox checked? | Check the checkbox ✓ |
| "No models found" warning | Does `models/` folder exist? | Create it: `mkdir models` |
| Wrong model loading | Check GUI logs | Verify GUI shows selected model |
| Model file not found | Full path correct? | Copy model to `models/` folder |

---

## 📚 Full Documentation

- **Setup Guide:** See `MODEL_SETUP.md`
- **Implementation Details:** See `IMPLEMENTATION_GUIDE.md`
- **System Architecture:** See `AI.md` (original DetectionService spec)

---

**Version:** 1.0  
**Last Updated:** 2026-05-21  
**Status:** Ready to Use ✅
