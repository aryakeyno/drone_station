# Multi-Model Detection Implementation Guide

## 📋 What Was Changed

This implementation adds **multi-model support** to your drone station with **YOLO as the default**. The system automatically discovers models in a folder and lets users select which one to use via the GUI.

---

## 🏗️ Architecture

### New Component: Model Manager

**File:** `vision/model_manager.py`

The `ModelManager` class handles:
- 🔍 **Discovery** — Scans `models/` folder for detection models
- 📋 **Listing** — Returns sorted model list (YOLO nano first)
- 🎯 **Selection** — Finds and loads specific models
- 📊 **Metadata** — Reports model size, type, framework

### Key Features

```python
# Discover all models
manager = ModelManager("models")
models = manager.discover_models()
# Returns: [
#   {"name": "yolov8n", "filename": "yolov8n.pt", 
#    "path": "/full/path", "size_mb": 12.3, ...},
#   ...
# ]

# Get default (YOLO nano or first available)
default = manager.get_default_model()

# Get GUI display list
display_list, default_sel = manager.get_model_display_list()
# Returns: (["yolov8n (12.3MB)", "yolov8s (24.5MB)"], "yolov8n (12.3MB)")
```

---

## 🎯 Code to Look For

### 1. Model Discovery (`model_manager.py`)

**Key Functions:**

```python
# Discover models in folder
models = manager.discover_models()
→ Returns: List[Dict] with name, path, size, type

# Identify model from filename
model_info = manager._identify_model(file_path)
→ Checks against SUPPORTED_PATTERNS (yolov8*.pt, *.pt, etc.)

# Extract model name
name = manager._extract_model_name("yolov8n.pt")
→ Returns: "yolov8n"

# Get by name
model_info = manager.get_model_by_name("yolov8s")
→ Returns: Dict or None
```

**Supported Patterns:**
```python
SUPPORTED_PATTERNS = [
    ("yolov8*.pt", "YOLO", "ultralytics"),
    ("yolov8*.onnx", "YOLO", "ultralytics"),
    ("*.pt", "YOLO", "ultralytics"),
]
```

### 2. GUI Integration (`gui/startup.py`)

**Model Discovery in GUI:**

```python
# Get available models for dropdown
def _get_available_models() -> tuple[list[str], str]:
    manager = ModelManager(config.models_folder)
    display_list, default_sel = manager.get_model_display_list()
    return display_list, default_sel
    # Returns: (["yolov8n (12.3MB)", "yolov8s (24.5MB)"], 
    #          "yolov8n (12.3MB)")
```

**GUI Layout:**

```python
# In _build_window():
[sg.Checkbox(
    "🔍 Object Detection (YOLO)",
    default=False, key="-YOLO-ENABLED-",
    enable_events=True,  # ← Triggers visibility toggle
)],
[lbl("Select detection model:", dim=True)],
[sg.Combo(
    models, default_value=default_model,  # Passed in as parameters
    key="-MODEL-SELECT-", readonly=True,
    visible=False,  # Hidden until YOLO checked
)],
```

**Event Handling:**

```python
# Show/hide model selector based on YOLO checkbox
if event == "-YOLO-ENABLED-":
    yolo_enabled = values.get("-YOLO-ENABLED-", False)
    window["-MODEL-SELECT-"].update(visible=yolo_enabled)
    continue
```

**Model Path Resolution:**

```python
# When START is clicked:
if config.yolo_detection_enabled:
    selected_model_display = values.get("-MODEL-SELECT-", default_model)
    # Extract: "yolov8n (12.3MB)" → "yolov8n"
    model_name = selected_model_display.split()[0]
    
    # Load from model manager
    manager = ModelManager(config.models_folder)
    model_info = manager.get_model_by_name(model_name)
    
    if model_info:
        config.selected_model = model_name
        config.yolo_model_path = model_info['path']  # Full path
        logger.info(f"✅ Selected model: {model_name} → {model_info['path']}")
```

### 3. Configuration (`config/settings.py`)

**New Fields:**

```python
@dataclass
class AppConfig:
    # Folder containing detection models
    models_folder: str = "models"
    
    # Selected model name (set by GUI)
    selected_model: str = "yolov8n"
    
    # Full path to model file (set dynamically by GUI)
    yolo_model_path: str = "models/yolov8n.pt"
```

### 4. Model Loading (`main.py`)

**Already Compatible!** No changes needed.

The system uses `config.yolo_model_path` which is now set dynamically by the GUI:

```python
# main.py (unchanged, just uses updated config)
camera_node = CameraNode(
    yolo_model_path=config.yolo_model_path,  # ← Updated by GUI
    ...
)

if config.yolo_detection_enabled:
    camera_node.load_model()  # Uses updated path
```

### 5. Detection Optimizer (`vision/detection_optimizer.py`)

**Already Compatible!** No changes needed.

Accepts any model path:

```python
# detection_optimizer.py (unchanged)
optimizer = DetectionOptimizer(
    model_path=yolo_model_path,  # Any path, any YOLO model
    ...
)
await optimizer.load_model()
```

---

## 🔄 Data Flow

```
main.py (startup)
    ↓
gui/startup.py (launch_config_gui)
    ├─ _get_available_models()
    │   └─ ModelManager.get_model_display_list()
    │       └─ Scans models/ folder
    │           └─ Discovers: yolov8n.pt, yolov8s.pt, etc.
    │
    ├─ Show GUI with model dropdown (YOLO nano default)
    │
    └─ User selects model → START
        └─ Extract model name from display
            └─ ModelManager.get_model_by_name("yolov8s")
                └─ Returns: path = "models/yolov8s.pt"
                    └─ Set config.yolo_model_path = "models/yolov8s.pt"
                        └─ camera_node loads model via config.yolo_model_path
```

---

## 📂 File Structure

```
drone_station/
├── vision/
│   ├── model_manager.py          ← NEW: Model discovery & management
│   ├── detection_optimizer.py    ← UNCHANGED: Loads any model path
│   └── camera_node.py            ← UNCHANGED: Uses config.yolo_model_path
│
├── gui/
│   └── startup.py                ← UPDATED: Model selector GUI + events
│
├── config/
│   └── settings.py               ← UPDATED: New model config fields
│
├── models/                         ← FOLDER: Put YOLO models here
│   ├── yolov8n.pt
│   ├── yolov8s.pt
│   └── yolov8m.pt
│
├── main.py                        ← UNCHANGED: Uses updated config
├── MODEL_SETUP.md                 ← NEW: User setup guide
└── IMPLEMENTATION_GUIDE.md        ← THIS FILE
```

---

## 🚀 How It Works: Step-by-Step

### Step 1: Model Discovery

```
When GUI starts:
  │
  └─ launch_config_gui()
      └─ _get_available_models()
          ├─ ModelManager("models")
          └─ manager.get_model_display_list()
              ├─ discover_models()
              │   ├─ Read models/ folder
              │   └─ For each .pt file:
              │       ├─ Check if matches SUPPORTED_PATTERNS
              │       ├─ Extract name: "yolov8n.pt" → "yolov8n"
              │       └─ Add to list: {name, path, size_mb, ...}
              │
              └─ Sort list:
                  1. YOLO nano first (if present)
                  2. By YOLO_PRIORITY (s, m, l, x)
                  3. Alphabetically
              
              └─ Return: ["yolov8n (12.3MB)", "yolov8s (24.5MB)", ...]
```

### Step 2: GUI Display

```
Features section shows:
  [✓] 🔍 Object Detection (YOLO)  ← User checks this
      Select detection model:
      ┌────────────────────────────┐
      │ yolov8n (12.3MB)       ◄─── DEFAULT (pre-selected)
      │ yolov8s (24.5MB)
      │ yolov8m (49.8MB)
      └────────────────────────────┘
```

### Step 3: User Selection & START

```
User selects model → Clicks START
  │
  └─ Extract model name: "yolov8s (24.5MB)" → "yolov8s"
      │
      └─ ModelManager.get_model_by_name("yolov8s")
          ├─ Search discovered models
          └─ Return: {name: "yolov8s", path: "/full/path/yolov8s.pt", ...}
              │
              └─ Set config:
                  ├─ config.selected_model = "yolov8s"
                  └─ config.yolo_model_path = "/full/path/yolov8s.pt"
                      │
                      └─ Pass to camera_node
                          └─ Load via detection_optimizer
                              └─ YOLO("/full/path/yolov8s.pt")
```

---

## 🔧 Extension Points

### Add Support for New Model Types

In `model_manager.py`, update `SUPPORTED_PATTERNS`:

```python
SUPPORTED_PATTERNS = [
    ("yolov8*.pt", "YOLO", "ultralytics"),
    ("yolov8*.onnx", "YOLO", "ultralytics"),
    ("*.pt", "YOLO", "ultralytics"),
    # Add new frameworks:
    ("faster_rcnn*.pt", "FasterRCNN", "torchvision"),
    ("efficientdet*.onnx", "EfficientDet", "tf"),
]
```

### Add Model Priority Rules

In `ModelManager.discover_models()`, customize sort order:

```python
models.sort(key=lambda m: (
    0 if m['framework'] == 'ultralytics' else 1,  # YOLO first
    model_priority.get(m['name'], 999),            # Then by priority
    m['type'],                                      # Then by type
    m['name']                                       # Then by name
))
```

### Customize Default Model

In `config/settings.py`:

```python
selected_model: str = "yolov8s"  # Change from yolov8n to yolov8s
```

Or in GUI `_get_available_models()` to apply logic:

```python
# Prefer GPU-accelerated models on specific hardware
if has_gpu():
    return_default = "yolov8m"  # Larger model if GPU available
else:
    return_default = "yolov8n"  # Smaller model for CPU
```

---

## ✅ Verification Checklist

- [ ] `vision/model_manager.py` created with discovery logic
- [ ] `gui/startup.py` updated with model dropdown and events
- [ ] `config/settings.py` has new model fields
- [ ] `models/` folder exists (created by ModelManager if missing)
- [ ] At least one YOLO model in `models/` folder
- [ ] GUI shows model dropdown when YOLO is checked
- [ ] Selected model is loaded correctly on startup
- [ ] Logs show "✅ Selected model: [name] → [path]"

---

## 📝 Log Output Example

```
INFO Detecting hardware …
INFO   COM ports : ['COM21']
INFO   Cameras   : [0, 1]
INFO   Joysticks : ['0: Logitech G Extreme 3D Pro']

📦 Model Manager initialized: /path/to/models
🔍 Discovered 3 model(s)
   - yolov8n (yolov8n.pt)      12.3MB
   - yolov8s (yolov8s.pt)      24.5MB
   - yolov8m (yolov8m.pt)      49.8MB

[GUI opens, user selects yolov8s and clicks START]

✅ Selected model: yolov8s → /path/to/models/yolov8s.pt

INFO Configuration selected:
INFO   COM Port  : COM21
INFO   Cameras   : [0, 1]  (enabled=True)
INFO   YOLO Detection: True
INFO   Selected Model: yolov8s

✅ YOLO module loaded for detection optimizer
✅ Detection optimizer loaded: /path/to/models/yolov8s.pt
```

---

## 🔍 Debugging Tips

### Models not discovered?

```python
from vision.model_manager import ModelManager

manager = ModelManager("models")
print(manager.models_folder)  # Check if folder exists
print(manager.discover_models())  # List discovered models
```

### Wrong model loading?

Check the logs after GUI closes:
```
✅ Selected model: yolov8s → /path/to/models/yolov8s.pt
```

If it says wrong model, user may have selected different one in GUI.

### Model selector not appearing?

1. Make sure YOLO checkbox is **checked**
2. Check `enable_events=True` on checkbox
3. Event handler for `-YOLO-ENABLED-` must set visibility

---

**Version:** 1.0  
**Last Updated:** 2026-05-21  
**Status:** Production Ready
