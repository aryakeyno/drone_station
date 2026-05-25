# 🚁 Startup Architecture Guide

## Overview

The drone station now uses a **lightweight-first startup** approach:

1. **GUI launches immediately** (few MB, fast)
2. **User selects features** (hardware + AI options)
3. **Heavy models load on-demand** (only what's needed)
4. **Server starts** with selected components

This reduces startup time dramatically when you don't need all features.

---

## Startup Flow

### Phase 1: Import & Configuration (< 1 second)
```
main.py runs
  └─ Import core modules
  └─ Launch GUI (PySimpleGUI - lightweight)
  └─ Wait for user input
```

### Phase 2: Hardware Initialization
```
User clicks "START" in GUI
  ├─ Saves selections to config singleton
  ├─ Initialize MAVLink (COM port)
  ├─ Initialize Joystick
  ├─ Initialize Camera Node
  ├─ Initialize Audio Node (lightweight TTS fallback)
  └─ Return to main.py
```

### Phase 3: Optional AI Components (user-selected only)
```
Check config.voice_commands_enabled
  ├─ IF TRUE: Import & instantiate VoiceCommander (loads Whisper: 140 MB)
  └─ IF FALSE: Skip (saves memory & time)

Check config.ai_advisor_enabled
  ├─ IF TRUE: Import & instantiate AINode (loads YOLO, etc.)
  └─ IF FALSE: Skip (saves memory & time)
```

### Phase 4: Web Server
```
Create FastAPI app
  └─ Start Uvicorn on port 8000
  └─ Lifespan starts background tasks:
      ├─ MAVLink read loop
      ├─ Joystick polling
      ├─ Camera compositor
      ├─ Audio processing
      ├─ AI Advisor (if enabled)
      └─ Voice Commander (if enabled)
```

---

## Configuration Options

The GUI now includes an **Optional AI Features** section:

### 🎤 Voice Commands
- **What it loads:** Whisper STT (~140 MB) + Mistral LLM integration
- **Dependencies:** Microphone, `ollama run mistral` running
- **Latency:** ~3-5 seconds per command
- **Benefits:** Hands-free drone control via speech

### 👁️ Wake Word Detection  
- **What it loads:** openwakeword ONNX models (~4 MB)
- **Dependencies:** Voice models must be downloaded first: `python setup_wake_word.py`
- **Latency:** ~10 ms per audio chunk (runs continuously)
- **Benefits:** Activate voice listening with "Hey Station"

### 🔍 Object Detection (YOLO)
- **What it loads:** YOLOv8n model (~50-150 MB depending on size)
- **Dependencies:** opencv-python
- **Latency:** ~50-100 ms per frame (GPU faster)
- **Benefits:** Real-time object detection on camera feed

### 🤓 AI Advisor
- **What it loads:** AINode with LLM integration
- **Dependencies:** Mistral LLM, camera feed
- **Latency:** ~1-2 seconds per analysis
- **Benefits:** AI guidance for flight planning

---

## Code Structure

### `config/settings.py`
```python
@dataclass
class AppConfig:
    # Hardware
    com_port: str
    camera_ids: List[int]
    joystick_id: int
    
    # Optional Features (user selects in GUI)
    voice_commands_enabled: bool
    wake_word_enabled: bool
    yolo_detection_enabled: bool
    ai_advisor_enabled: bool
```

### `gui/startup.py`
```python
def launch_config_gui():
    # Hardware detection
    ports = _get_com_ports()
    cameras = _get_available_cameras()
    joysticks = _get_available_joysticks()
    
    # Build GUI with feature checkboxes
    # Return when user clicks START
    # Settings saved to global config singleton
```

### `main.py`
```python
# Phase 1: Launch GUI
launch_config_gui()  # Blocks until user clicks START

# Phase 2: Create required components
ws_manager = ConnectionManager()
mavlink_node = MavlinkNode(...)
joy_node = JoystickNode(...)
ai_audio = AIAudioNode(...)
camera_node = CameraNode(...)

# Phase 3: Create optional components only if enabled
ai_node = None
if config.ai_advisor_enabled:
    from ai.ai_node import AINode
    ai_node = AINode(...)

voice_cmd = None
if config.voice_commands_enabled:
    from ai.voice_commander import VoiceCommander
    voice_cmd = VoiceCommander(...)

# Phase 4: Create FastAPI app and start server
app = create_web_app(...)
uvicorn.run(app, ...)
```

---

## Performance Impact

### Startup Time Comparison

**All Features Enabled:**
- GUI appears: 1-2 seconds
- Model loading: 30-60 seconds
- Server starts: 5 seconds
- **Total: ~45-75 seconds**

**Minimal Setup (no AI):**
- GUI appears: 1-2 seconds
- Component init: 2-3 seconds
- Server starts: 2-3 seconds
- **Total: ~5-8 seconds** ✅

**Memory Usage:**
- Minimal setup: ~200-300 MB
- With Voice Commands: +140 MB → ~340-440 MB
- With YOLO: +50-150 MB → ~250-450 MB
- All features: ~500-700 MB

---

## When to Enable Each Feature

### 🎤 Voice Commands
- You have a microphone
- You want hands-free control
- You have `ollama run mistral` or compatible LLM
- You can wait 3-5 seconds for speech processing

### 👁️ Wake Word
- You enabled voice commands
- You want automatic listening (not manual activation)
- You ran `python setup_wake_word.py`

### 🔍 Object Detection
- You have cameras connected
- You want real-time object detection (people, vehicles, etc.)
- You're willing to use 50-150 MB extra memory
- You have GPU available (recommended for performance)

### 🤓 AI Advisor
- You want AI guidance for drone operations
- You have Mistral or another LLM running
- You want to leverage camera feed + flight state for recommendations

---

## Troubleshooting

### GUI doesn't appear
- Check you're running: `python main.py`
- Ensure PySimpleGUI is installed: `pip install PySimpleGUI`
- Check terminal for errors

### Feature loads even though unchecked
- Config file might have old values
- Delete any saved config or re-select features

### Voice commands don't work after enabling
- Verify Mistral is running: `ollama run mistral`
- Check microphone is connected and working
- Run `python setup_wake_word.py` if wake word enabled

### Startup is still slow
- Check if heavy models are being loaded
- See what's running in Task Manager
- Only enable features you need

---

## Customization

### Disable Features by Default
Edit `config/settings.py`:
```python
@dataclass
class AppConfig:
    voice_commands_enabled: bool = False  # Disabled by default
    wake_word_enabled: bool = False
    yolo_detection_enabled: bool = False
    ai_advisor_enabled: bool = False
```

### Add New Optional Features
1. Add to `AppConfig` in `config/settings.py`
2. Add checkbox to GUI in `gui/startup.py`
3. Add conditional instantiation in `main.py`
4. Add conditional task in lifespan function

### Pre-select Default Features
Edit GUI defaults in `gui/startup.py`:
```python
sg.Checkbox(
    "🎤 Voice Commands",
    default=True,  # Pre-selected
    key="-VOICE-ENABLED-"
)
```

---

## Design Rationale

### Why GUI First?
- Users know what they want **before** we load heavy models
- Reduces wasted startup time for features they don't use
- Makes the app feel more responsive

### Why Conditional Imports?
- Avoids import errors if optional libraries aren't installed
- Keeps base startup lightweight
- `ImportError` only happens if user selects that feature

### Why Lazy-Load Models?
- Heavy ONNX models (Whisper, YOLO) only load on first use
- First call has slight latency, but subsequent calls are fast
- Doesn't block startup if a model is missing

---

## Future Improvements

- [ ] Save feature selections across sessions
- [ ] Progress bar while loading heavy models
- [ ] Per-feature setup guides in GUI ("Why would I use this?")
- [ ] Ability to enable/disable features from web UI (without restart)
- [ ] Download models directly from GUI
