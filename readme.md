# 🚁 Drone Station — Ground Control System

A **modern, real-time ground control station (GCS)** for PX4-based autonomous drones, built with a Python FastAPI backend and an HTML5 interactive frontend. The system supports multi-camera composite streaming, YOLOv8 object detection, a local AI flight advisor, and a fully offline voice command pipeline — all running without an internet connection.

---

## 📋 Table of Contents
- [Features](#-features)
- [System Architecture](#-system-architecture)
- [Hardware Requirements](#-hardware-requirements)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Core Modules](#-core-modules)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [WebSocket Message Reference](#-websocket-message-reference)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#-roadmap)

---

## 🎯 Features

### ✅ Real-Time Flight Control
- **Live telemetry streaming** — Attitude (roll/pitch/yaw), altitude, speed, GPS position
- **Flight instruments** — Artificial horizon, altitude ladder, speed indicator, HUD overlay
- **RC Override** — USB joystick with PWM override to drone (50 Hz poll rate)
- **3D avatar** — Real-time drone attitude visualised with a Three.js 3D model

### ✅ Multi-Camera Composite Streaming
- **Up to 4 simultaneous USB cameras** — detected and selected at startup
- **7 composite layouts** — side-by-side, top/bottom, three-camera asymmetric (left/right/top main), 2×2 grid
- **Client-side layout control** — switch and rearrange camera slots live via right-click menu with zero server round-trips
- **Individual camera feeds** — each camera also accessible at `/video/<cam_id>` independently
- **Per-slot promote-to-main** — click any camera label to instantly move it to the main slot
- **MJPEG over HTTP** — efficient streaming without blocking the WebSocket channel

### ✅ AI Flight Advisor (Local, Offline)
- **Real-time situational awareness** — LLM reads rolling telemetry and YOLO detections every 10 seconds
- **Priority-graded advice** — 1–10 scale; critical alerts (8–10) trigger immediate speech and popup
- **On-demand questions** — operator can ask free-form questions via the UI
- **Runs on local hardware** — powered by Ollama (Mistral 7B or Phi-3 Mini); no cloud dependency
- **Structured JSON output** — LLM responses are schema-validated before reaching the UI or audio pipeline

### ✅ Offline Voice Command Pipeline (Phase 2)
- **Wake word detection** — "hey station" via OpenWakeWord (custom words supported)
- **Speech-to-text** — faster-whisper (Whisper small.en, int8 quantised, runs on CPU)
- **Intent classification** — local LLM maps transcripts to typed intents (arm, takeoff, land, goto, RTL…)
- **Safety gate** — commands validated against live telemetry (GPS fix, battery level) before execution
- **Verbal confirmation** — high-risk commands (arm, takeoff, goto) require a second "yes" before executing
- **Fully airgapped** — no microphone data leaves the machine

### ✅ Neural Text-to-Speech
- **Microsoft Edge neural voices** — Aria Online (Natural), Jenny, Guy; selected automatically in Edge browser
- **Server-side fallback** — `edge-tts` Python package (Microsoft neural TTS API) used when Edge voices are unavailable
- **Fully offline fallback** — Kokoro-82M ONNX model for airgapped deployments
- **Priority speech queue** — battery warnings, AI advice, and voice confirmations managed by priority with debounce

### ✅ Object Detection & Vision
- **YOLOv8 integration** — toggle per-camera detection from the right-click context menu
- **Detection results fed to AI advisor** — objects seen are included in the LLM telemetry snapshot
- **Configurable model** — yolov8n (default), yolov8s, yolov8m supported

### ✅ Autonomous Mission Planning
- **Interactive OpenLayers map** — OpenStreetMap, online/offline toggle
- **Waypoint editor** — right-click to add, edit, delete waypoints
- **Mission table** — live current waypoint tracking with sequence display
- **Flight mode selection** — Manual, Stabilised, Altitude, Position, Mission, RTL

### ✅ Hardware Integration
- **PX4 MAVLink** — full telemetry and command support (30+ message types)
- **USB joystick/gamepad** — 14-button mapping, configurable axes
- **Serial auto-detection** — COM port scanned and listed in startup GUI
- **Multi-client WebSocket** — multiple browser tabs connected simultaneously

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Browser (Frontend)                           │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐   │
│  │ Flight HUD  │  │ Mission Map  │  │ Camera Grid │  │ AI Panel  │   │
│  │ Instruments │  │ Waypoints    │  │ Multi-layout│  │ Advisor   │   │
│  └──────┬──────┘  └──────┬───────┘  └───────┬─────┘  └─────┬─────┘   │
│         └────────────────┼──────────────────┼──────────────┘         │
│                          │    WebSocket /ws │                        │
│                          │    (telemetry,   │                        │
│                          │     commands,    │                        │
│                          │     AI advice,   │                        │
│                          │     TTS audio)   │                        │
│                          │                  │   HTTP /video/<cam_id> │
│                          │                  │   (MJPEG per camera)   │
└──────────────────────────┼──────────────────┼────────────────────────┘
                           │                  │
              ┌────────────▼──────────────────▼────────────┐
              │          FastAPI Web Server (Port 8765)    │
              │              server/web_app.py             │
              │              server/socket_manager.py      │
              └───┬──────────┬─────────┬──────────┬───────┘
                  │          │         │          │
        ┌─────────▼──┐ ┌─────▼──────┐ ┌▼────────┐ ┌▼──────────────┐
        │ MAVLink    │ │ Camera     │ │Joystick │ │  AI Node      │
        │ Node       │ │ Node       │ │ Node    │ │  (Ollama LLM) │
        │ PX4/drone  │ │ Multi-cam  │ │ USB pad │ │               │
        └─────────┬──┘ └─────┬──────┘ └┬────────┘ └┬──────────────┘
                  │          │          │            │
        ┌─────────▼──┐ ┌─────▼──────┐   │      ┌────▼──────────────┐
        │ COM Port   │ │ YOLO       │   │      │ Voice Commander   │
        │ 115200 baud│ │ Compositor │   │      │ Whisper STT       │
        └────────────┘ └─────┬──────┘   │      │ OpenWakeWord      │
                             │          │      └────┬──────────────┘
                    ┌────────▼────┐     │            │
                    │ /video/0    │     │       ┌────▼──────────────┐
                    │ /video/1    │     │       │ Audio Node        │
                    │ /video/N    │     │       │ edge-tts / Kokoro │
                    └─────────────┘     │       └───────────────────┘
                                        │
                               ┌────────▼────────┐
                               │ RC Override      │
                               │ PWM 1000–2000    │
                               └─────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    TIER 1 — ALWAYS ON (client-side)                  │
│                                                                       │
│  MAVLink raw bytes → decode table → human text → speech queue        │
│                                                                       │
│  • STATUSTEXT     → lookup severity → queueStatusMessage()           │
│  • SYS_STATUS     → battery% → batteryLevel() → battery loop        │
│  • HEARTBEAT      → mode change → queueCommandMessage()              │
│  • COMMAND_ACK    → success/fail → queueCommandMessage()             │
│                                                                       │
│  Voice: UnifiedAudioQueue                                            │
│    Priority 10: battery critical                                      │
│    Priority 8-9: CRITICAL STATUSTEXT                                 │
│    Priority 5-7: WARNING / mode changes                              │
│    Priority 1-4: INFO status                                         │
│                                                                       │
│  Speech: Edge neural → native system voice → basic Web Speech        │
│  NO server round-trips for Tier 1                                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │  toggleAutopilot() enables Tier 2
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              TIER 2 — AI AUTOPILOT MODE (server-side)                │
│                     state.autoPilot === true                          │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ai_node.py — rolling telemetry window + YOLO detections     │   │
│  │  • Drift detection (IMU variance over time)                   │   │
│  │  • GPS accuracy degradation                                   │   │
│  │  • Cross-correlates battery + altitude + speed               │   │
│  │  → {class:"ai_advice", priority, advice, detail, alert}      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  voice_commander.py — takes CONTROL of speech queue          │   │
│  │  • Wake word detected → state.autoPilot must be true         │   │
│  │  • Clears low-priority Tier 1 items from queue               │   │
│  │  • Broadcasts {class:"voice_listening"} → UI shows indicator │   │
│  │  • STT → intent → safety gate → MAVLink command              │   │
│  │  • Confirmation dialog interrupts queue (priority 10)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  Speech: same UnifiedAudioQueue                                      │
│    Priority 10: voice confirmation requests (pre-empts everything)   │
│    Priority 6-8: AI advisor critical advice                          │
│    Priority 4-5: AI advisor informational                            │
│                                                                       │
│  When autoPilot OFF:                                                 │
│    • voice_commander ignores wake word                               │
│    • ai_node.advisor_loop() sleeps (no Ollama queries)               │
│    • Any queued AI advice messages are cleared                       │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    drone_diagnostics.js  (new file)                  │
│                                                                       │
│  A flat lookup table: condition → {message, action, priority}        │
│  Covers: arming blocks, GPS states, sensor failures, mode changes    │
│  Pure data — no audio, no DOM, no side effects                       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  imported by
┌──────────────────────▼──────────────────────────────────────────────┐
│                    DroneStateManager  (new section in ws.js)         │
│                                                                       │
│  Single entry point for all decoded MAVLink state changes.           │
│  Owns the "what changed" logic — compares to previous state.        │
│  Decides: which table entry matches → calls SpeechManager.speak()   │
│                                                                       │
│  DroneStateManager.update(source, key, value)                        │
│    source: 'heartbeat' | 'sys_status' | 'gps' | 'statustext'        │
│    key:    'armed' | 'system_status' | 'gps_fix' | ...              │
│    value:  the new decoded value                                     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  routes to
┌──────────────────────▼──────────────────────────────────────────────┐
│                    SpeechManager  (replaces scattered calls)         │
│                                                                       │
│  speak(text, options)                                                │
│    → checks state.autoPilot (Tier 1 vs Tier 2 mode)                 │
│    → routes to UnifiedAudioQueue.enqueue()                           │
│    → handles dedup, priority, source tagging                         │
│                                                                       │
│  Tier 1 (autoPilot OFF): table lookup messages only                  │
│  Tier 2 (autoPilot ON):  table + AI advice + voice command control   │
└─────────────────────────────────────────────────────────────────────┘


```

### Communication Flow

| Channel | Direction | Content |
|---|---|---|
| WebSocket `/ws` | Bidirectional | Telemetry, MAVLink commands, AI advice, TTS audio, camera notifications |
| HTTP `/video/<cam_id>` | Server → Browser | MJPEG stream per individual camera |
| HTTP `/video` | Server → Browser | MJPEG composite stream (all cameras merged) |
| Serial (MAVLink) | Bidirectional | PX4 telemetry and commands |
| Microphone | Hardware → Python | Wake word + voice command audio |
| Speaker | Python → Hardware | TTS responses and audio alerts |
| Ollama REST | Python → Localhost | LLM inference for advisor + intent parser |

---

## 🔧 Hardware Requirements

### Minimum
- **Drone**: PX4-based (Pixhawk, Cube, Holybro, etc.) with USB/serial connection
- **PC**: Windows 10+ / Ubuntu 22.04+ with Python 3.10+
- **RAM**: 4 GB (8 GB recommended for AI features)
- **Connection**: USB cable or telemetry radio to drone

### Recommended (for full feature set)
- **RAM**: 8–16 GB (Mistral 7B requires ~6 GB; Phi-3 Mini runs in 2.5 GB)
- **GPU**: Any CUDA-capable GPU (accelerates Ollama, Whisper, YOLO significantly)
- **Cameras**: 1–4 USB webcams (tested with Logitech C920)
- **Joystick**: USB gamepad (tested with Saitek Cyborg Stick)
- **Microphone**: USB or built-in mic for voice commands
- **Browser**: Microsoft Edge (enables on-device neural TTS — Aria, Jenny, Guy voices)

### AI Hardware Notes
- **CPU-only** (no GPU): Phi-3 Mini recommended over Mistral 7B for acceptable latency
- **GPU (CUDA)**: Mistral 7B runs comfortably; inference latency drops from ~8s to ~1s
- **Whisper STT**: `small.en` model runs real-time on modern CPU without GPU

---

## 📦 Installation

### 1. Clone / Download Project
```bash
cd drone_station
```

### 2. Install Core Python Dependencies
```bash
pip install -r requirements.txt
```

**Core dependencies**:

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `pymavlink` | MAVLink protocol |
| `pygame` | Joystick / gamepad |
| `opencv-python` | Camera capture |
| `PySimpleGUI` | Startup configuration GUI |
| `httpx` | Async HTTP client (Ollama calls) |
| `edge-tts` | Server-side neural TTS (online fallback) |

### 3. Install Vision / Detection Dependencies
```bash
pip install ultralytics torch torchvision
```

### 4. Install AI Advisor Dependencies
```bash
# Ollama runtime (runs as a local background service)
# Windows:
winget install Ollama.Ollama
# Linux/macOS:
curl -fsSL https://ollama.com/install.sh | sh

# Pull the LLM (one-time download)
ollama pull mistral:instruct          # 4.1 GB — best quality
ollama pull phi3:mini                 # 2.3 GB — low-RAM / CPU-only systems

# Python Ollama client (uses httpx — already installed above)
# No additional package needed; ai_node.py calls the REST API directly
```

### 5. Install Voice Command Dependencies
```bash
pip install faster-whisper sounddevice openwakeword
```

### 6. (Optional) Fully Offline TTS — Kokoro
```bash
pip install kokoro-onnx soundfile
# Download model files (~300 MB) from:
# https://huggingface.co/hexgrad/Kokoro-82M
# Place kokoro-v0_19.onnx and voices.bin in the ai/ directory
```

---

## 🚀 Quick Start

### Step 1: Start Ollama Service
```bash
ollama serve          # starts on localhost:11434
# (runs automatically as a background service on Windows after install)
```

### Step 2: Connect Hardware
- Connect drone via USB (serial)
- Connect USB camera(s) — up to 4
- Connect USB joystick
- Connect microphone (for voice commands)

### Step 3: Run the Application
```bash
python main.py
```

### Step 4: Configure Hardware (Startup GUI)
A PySimpleGUI window appears:
1. **Select COM Port** — auto-detected serial ports listed
2. **Select Cameras** — individual checkboxes per detected camera (0–4)
3. **Select Composite Layout** — updates dynamically based on how many cameras are checked
4. **Adjust Main Panel Ratio** — slider appears for 3-camera asymmetric layouts
5. **Set Output Resolution** — composite frame resolution (default 1280×720)
6. **Select Joystick** — auto-detected gamepads listed
7. **Click START**

### Step 5: Open Browser
Navigate to: **`http://localhost:8765`**

You should see:
- ✅ Multi-camera grid with selected layout
- ✅ Flight instruments (attitude, altitude, speed)
- ✅ Real-time telemetry data
- ✅ GPS map with drone position
- ✅ AI advisor panel (connects to Ollama automatically)
- ✅ Battery indicator with audio warning

### Step 6: Interact

**Camera control** (right-click on main section):
- `⊞ Layout` — cycle through valid layouts for the active camera count
- `⇑ Set Cam N as Main` — promote a camera to the primary slot
- `⇄ Swap Cam A ↔ Cam B` — swap two camera slots
- `🎯 Detection: ON/OFF` — toggle YOLO object detection

**Voice commands** (if microphone connected):
- Say **"hey station"** → wait for "Listening" response
- Say a command: *"takeoff to 20 metres"*, *"land"*, *"return to launch"*, *"hold position"*
- High-risk commands prompt verbal confirmation: say **"yes"** to proceed

**AI advisor**:
- Automatic advice every 10 seconds based on telemetry and detections
- Ask a question via the UI: type in the AI panel input and press Ask

---

## 📚 Core Modules

### 🔌 `hardware/mavlink_node.py`
**Purpose**: All communication with PX4 via MAVLink protocol.

**Key Features**:
- Serial connection (configurable baud rate, auto-reconnect)
- Automatic message streaming (30+ types, rate-controlled)
- Command routing: arm/disarm, mode changes, RC override, COMMAND_LONG/INT
- Parameter request and update
- Heartbeat monitoring and timeout detection
- Telemetry snapshot exposed to `AINode` for situational awareness

**Streamed message types**:
`HEARTBEAT`, `SYS_STATUS`, `ATTITUDE`, `VFR_HUD`, `GPS_RAW_INT`, `GLOBAL_POSITION_INT`,
`LOCAL_POSITION_NED`, `BATTERY_STATUS`, `SYSTEM_TIME`, `HOME_POSITION`, `MISSION_CURRENT`,
`STATUSTEXT`, `ESTIMATOR_STATUS`, `ALTITUDE`, `SERVO_OUTPUT_RAW`, `RC_CHANNELS_SCALED`, and more.

---

### 🎮 `hardware/joystick_node.py`
**Purpose**: USB joystick polling and RC override.

**RC Channel Mapping**:

| Axis | Channel | Range | Function |
|---|---|---|---|
| 0 | Roll | 1000–2000 PWM | Bank left / right |
| 1 | Pitch | 1000–2000 PWM | Pitch up / down |
| 2 | Throttle | 1000–2000 PWM | Climb / descend |
| 3 | Yaw | 1000–2000 PWM | Turn left / right |

**Button Mapping**:
- Buttons 0, 5–8, 12–13: MAVLink commands (Arm, Mode select, Servo control)
- Buttons 1–4, 9–11: WebSocket events (UI controls, custom commands)

**Parameters**: Deadzone 0.05, debounce 0.2 s, poll rate 50 Hz.

---

### 📷 `vision/camera_node.py`
**Purpose**: Multi-camera capture, YOLO inference, and composite frame generation.

**Architecture**: One async capture coroutine per camera + one compositor coroutine.

**Composite Layouts**:

| Camera count | Available layouts |
|---|---|
| 1 | `single` |
| 2 | `side_by_side`, `top_bottom` |
| 3 | `three_left_main`, `three_right_main`, `three_top_main` |
| 4 | `grid_2x2` |

**HTTP Endpoints**:

| Endpoint | Content |
|---|---|
| `/video` | Composite MJPEG stream (all cameras merged) |
| `/video/<cam_id>` | Individual camera MJPEG stream |
| `/api/camera/frame` | Single composite JPEG snapshot |
| `/api/camera/frame/<cam_id>` | Single per-camera JPEG snapshot |

**Technical Parameters**:
- Capture resolution: 640×480 per camera
- Composite output: 1280×720 (configurable)
- Target FPS: 30 (adaptive)
- JPEG quality: 80%
- YOLO detection results fed to `AINode.ingest_detections()` after each inference

---

### 🤖 `ai/ai_node.py`
**Purpose**: Local LLM-powered flight advisor — reads telemetry and vision data, provides prioritised advice.

**Architecture**:
```
MAVLink telemetry  ──→  rolling 30-entry window
YOLO detections    ──→  latest_detections list
                              │
                    _build_snapshot()  (compact dict)
                              │
                    Ollama REST API  (localhost:11434)
                    model: mistral:instruct / phi3:mini
                    format: JSON, temperature: 0.2
                              │
                    schema-validated advice dict
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ws_manager       audio_node      UI panel
        broadcast()    speechSynthesis   popup
```

**Advice schema** (LLM is constrained to this output):
```json
{
  "priority": 7,
  "advice": "GPS accuracy degraded — consider returning to launch",
  "detail": "Satellites dropped from 14 to 6 in last 30 seconds",
  "alert": true
}
```

**Priority scale**: 1–3 informational, 4–6 advisory, 7–10 safety-critical.

**WebSocket commands accepted**:

| Command | Effect |
|---|---|
| `{"ask_ai": "is it safe to fly?"}` | On-demand LLM query, response sent back to requesting client |

**Ollama model selection**:

| System RAM | Recommended model | Inference latency (CPU) |
|---|---|---|
| 16 GB+ | `mistral:instruct` | ~4–8 s |
| 8 GB | `phi3:mini` | ~2–4 s |
| 4 GB | `phi3:mini` | ~6–10 s |

---

### 🎙️ `ai/voice_commander.py`
**Purpose**: Fully offline voice command pipeline — wake word → STT → intent → MAVLink.

**Pipeline stages**:

```
Microphone (sounddevice, 16 kHz mono)
    │  80 ms chunks
    ▼
OpenWakeWord  ──  "hey station" (confidence > 0.5)
    │
    ▼  collect 5 seconds of audio
faster-whisper (small.en, int8, VAD filter)
    │  transcript text
    ▼
Ollama intent parser  (temperature 0.1, JSON output)
    │  { intent, params, confidence, requires_confirm }
    ▼
Safety Gate  ──  GPS fix ≥ 3D, battery > 20%, drone connected
    │
    ├── requires_confirm=true  →  "Confirm: takeoff to 20m. Say yes."
    │         │ "yes"
    │         ▼
    └── execute()  →  mavlink_node.send_command_long()
                          │
                      audio_node.play_response("Taking off to 20 metres")
```

**Supported intents**:

| Intent | MAVLink command | Requires confirm |
|---|---|---|
| `arm` | MAV_CMD_COMPONENT_ARM_DISARM (400) | ✅ |
| `disarm` | MAV_CMD_COMPONENT_ARM_DISARM (400, force) | ❌ |
| `takeoff` | MAV_CMD_NAV_TAKEOFF (22) | ✅ |
| `land` | MAV_CMD_NAV_LAND (21) | ❌ |
| `goto` | MAV_CMD_DO_REPOSITION | ✅ |
| `rtl` | MAV_CMD_NAV_RETURN_TO_LAUNCH (20) | ❌ |
| `hold` | MAV_CMD_DO_LOITER_UNLIMITED (17) | ❌ |
| `unknown` | — (audio: "Command not recognised") | — |

---

### 🔊 `ai/audio_node.py`
**Purpose**: Text-to-speech synthesis and audio response delivery.

**TTS priority chain**:

```
1. Microsoft Edge neural voice (browser-side, client in Edge)
   → Aria Online (Natural), Jenny Online (Natural), Guy Online (Natural)

2. edge-tts Python package (server-side, requires internet)
   → same Microsoft neural engine, MP3 bytes sent as base64 over WebSocket

3. Kokoro-82M ONNX (server-side, fully offline)
   → WAV bytes sent as base64 over WebSocket
```

**WebSocket messages**:

| Direction | Class | Content |
|---|---|---|
| Browser → Server | `tts_request` | `{text, loop}` |
| Server → Browser | `tts_audio` | `{text, loop, audio: "<base64 MP3/WAV>"}` |

**Speech queue** (browser-side, `ai.js`):
- Max queue size: configurable via `state.maxSpeechQueueSize`
- Priority-sorted: higher priority pre-empts lower
- Debounce: configurable `state.speechDebounceDelay`
- Looping messages: battery warning loops until cleared by state change

---

### 🌐 `server/web_app.py`
**Purpose**: FastAPI application — REST API, WebSocket, and static file serving.

**API Endpoints**:

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Serve `index.html` (SPA) |
| `/ws` | WebSocket | All real-time communication |
| `/video` | GET | Composite MJPEG stream |
| `/video/{cam_id}` | GET | Per-camera MJPEG stream |
| `/api/camera/frame` | GET | Composite JPEG snapshot |
| `/api/camera/frame/{cam_id}` | GET | Per-camera JPEG snapshot |
| `/api/camera/info` | GET | Camera configuration and status |
| `/api/mavlink/status` | GET | MAVLink connection status |
| `/api/health` | GET | Server health check |
| `/{path}` | GET | Static frontend assets (SPA fallback) |

---

### 🔗 `server/socket_manager.py`
**Purpose**: WebSocket connection management, broadcasting, and command routing.

**Broadcasting strategy**: Concurrent `asyncio.gather()` sends with 1-second timeout per client. Dead connections removed automatically. Zero-copy snapshots prevent race conditions during iteration.

**Commands handled** (client → server):

| Key in request | Action |
|---|---|
| `toggle_detection` | Enable / disable YOLO on camera node |
| `request_camera_info` | Return full camera config as `camera_info` message |
| `set_camera_properties` | Update FPS target |
| `set_camera_layout` | Change composite layout (server compositor) |
| `set_camera_slot_order` | Reorder camera IDs in compositor |
| `request_message` | Request a specific MAVLink message on demand |
| `list_messages` | Return available MAVLink message types |
| `ask_ai` | Send free-form question to AI advisor |
| `tts_request` | Request server-side TTS synthesis |
| `COMMAND_LONG` | Send MAVLink COMMAND_LONG with ACK wait |
| `COMMAND_INT` | Send MAVLink COMMAND_INT with ACK wait |

**Messages broadcast** (server → all clients):

| `class` | Trigger | Content |
|---|---|---|
| `camera_frame_available` | Each compositor frame | Camera IDs, active cameras, frame count, URLs |
| `ai_advice` | AI advisor loop / on-demand query | Priority, advice text, detail, alert flag |
| `voice_transcript` | After STT transcription | Transcript text |
| `voice_command_executed` | After intent execution | Intent, params |
| `tts_audio` | After server TTS synthesis | Base64 audio, loop flag |
| MAVLink types | Each parsed message | Full telemetry fields |

---

### ⚙️ `config/settings.py`
**Purpose**: Centralised configuration dataclass.

```python
# Hardware
com_port          = "COM21"        # PX4 serial port
baud_rate         = 115200         # Serial baud rate
joystick_id       = 0              # USB joystick index

# Camera (multi-camera)
camera_ids        = [0]            # List of active camera indices
camera_enabled    = True
yolo_model_path   = "yolov8n.pt"  # yolov8n / yolov8s / yolov8m

# Composite layout
camera_layout     = "side_by_side" # See layout catalogue in camera_node.py
layout_main_ratio = 0.65           # Main panel fraction for 3-camera layouts
composite_width   = 1280           # Output frame width (pixels)
composite_height  = 720            # Output frame height (pixels)

# Server
websocket_port    = 8765

# UI
ui_theme          = "dark"
background_color  = "#1a1a1a"
```

All values are set by the startup GUI and persist for the session. To change defaults permanently, edit the dataclass field defaults directly.

---

### 🎛️ `gui/startup.py`
**Purpose**: PySimpleGUI startup window for hardware selection.

**Sections**:
- **PX4 Flight Controller** — COM port combo (auto-detected)
- **Cameras** — one checkbox per detected camera (parallel probe of indices 0–5), composite layout combo (options update dynamically based on how many cameras are checked), main-panel ratio slider (3-camera layouts only), output resolution fields
- **Joystick** — combo of detected gamepads

The GUI writes to the global `config` singleton on **START**. The main process then applies those values to the already-constructed hardware nodes before starting the FastAPI server.

---

## 📂 Project Structure

```
drone_station/
├── main.py                      # Entry point — initializes all nodes, launches FastAPI server
├── requirements.txt             # Python dependencies
│
├── hardware/                    # Physical hardware interfaces
│   ├── mavlink_node.py          # PX4 MAVLink protocol — telemetry streaming, command execution
│   └── joystick_node.py         # USB gamepad polling — 50 Hz RC override, button event routing
│
├── vision/                      # Camera capture & computer vision
│   ├── camera_node.py           # Multi-camera capture (up to 4), composite layout synthesis, YOLO inference
│   ├── detection_optimizer.py   # YOLO frame scheduling, FPS throttling, detection caching
│   └── model_manager.py         # YOLOv8 model loader — yolov8n/s/m switching
│
├── ai/                          # AI, LLM, voice, and audio
│   ├── ai_node.py               # Rolling telemetry window + Ollama REST client — advice loop (10s interval)
│   ├── voice_commander.py       # Offline voice pipeline — wake word (OpenWakeWord) → STT (faster-whisper) → intent → MAVLink
│   └── audio_node.py            # TTS synthesis — edge-tts (online), Kokoro ONNX (offline), WebSocket delivery
│
├── server/                      # Web server & WebSocket
│   ├── web_app.py               # FastAPI application — REST endpoints, MJPEG streams, static SPA serving
│   └── socket_manager.py        # WebSocket connection pool, broadcast routing, command ACK handling
│
├── config/                      # Configuration
│   └── settings.py              # AppConfig singleton — hardware ports, camera layout, AI feature flags
│
├── gui/                         # Desktop UI
│   └── startup.py               # PySimpleGUI window — COM port, camera selection, layout picker, joystick setup
│
├── frontend/                    # Browser interface
│   ├── index.html               # Main SPA — layout, sections, context menus
│   ├── style.css                # Dark theme, camera grid, HUD, overlays
│   ├── jscode.js                # Main JS — telemetry, map, mission, WS router
│   ├── ai.js                    # Audio / TTS — Edge voices, speech queue, battery
│   ├── camera_ui.js             # Multi-camera grid — layout engine, slot swap
│   ├── ws.js                    # WebSocket init and message dispatcher
│   ├── utility.js               # Shared helpers (debounce, popup, draggable)
│   ├── flight-indicators.js     # Canvas HUD — horizon, ladder, speed tape
│   ├── gl-matrix-min.js         # Matrix math for 3D avatar
│   ├── three.min.js             # Three.js 3D rendering
│   ├── GLTFLoader.js            # GLTF model loader for drone avatar
│   ├── CameraHandler.js         # (legacy stub — superseded by camera_ui.js)
│   ├── jquery-3.6.0.min.js      # DOM utilities
│   ├── openlayers/              # OpenLayers map library
│   ├── models/                  # 3D model files (.glb) + ML assets
│   └── sounds/                  # Alert audio files
│
├── data/                        # Static HTML pages
│   ├── index.html
│   ├── settings.html
│   ├── main.html
│   └── files.html
│
└── test/
    └── camera_test.py           # Standalone camera diagnostic tool
```

---

## ⚙️ Configuration

### Hardware (Startup GUI)
Selected interactively at each launch. No config file editing required.

### Software (`config/settings.py`)
Edit field defaults for permanent changes:

```python
# Change default LLM model
# in ai/ai_node.py:
OLLAMA_MODEL = "phi3:mini"        # swap to smaller model on low-RAM systems

# Change TTS voice
# in ai/audio_node.py:
VOICE = "en-US-JennyNeural"       # edge-tts voice name
# run: edge-tts --list-voices | grep en-US  to see all options

# Change wake word
# in ai/voice_commander.py:
WAKE_WORD = "hey station"         # must match an OpenWakeWord model
```

### Advanced Tuning

**Camera** (`vision/camera_node.py`):
- Capture resolution: `cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)` in `_open_camera()`
- JPEG quality: `cv2.IMWRITE_JPEG_QUALITY, 80` in `_compositor_loop()`
- Compositor FPS: `self.fps = 30` in `__init__()`

**Joystick** (`hardware/joystick_node.py`):
- Deadzone: `0.05`
- Debounce: `0.2 s`
- Poll rate: `50 Hz`

**AI Advisor** (`ai/ai_node.py`):
- Advice interval: `self._advice_interval = 10.0` (seconds)
- Telemetry window: `deque(maxlen=30)`
- LLM temperature: `"temperature": 0.2` (lower = more consistent)
- Max tokens: `"num_predict": 120`

**Voice Commander** (`ai/voice_commander.py`):
- Wake word threshold: `> 0.5` confidence
- Listening window: `5.0` seconds
- Whisper model: `"small.en"` — swap to `"tiny.en"` for faster/lower-accuracy or `"medium.en"` for higher accuracy
- Confirmation words: `("yes", "confirm", "affirmative", "go")`

---

## 📡 WebSocket Message Reference

### Browser → Server

```json
{ "toggle_detection": true }
{ "request_camera_info": true }
{ "set_camera_layout": "three_left_main" }
{ "set_camera_slot_order": [1, 0, 2] }
{ "ask_ai": "is it safe to fly in current conditions?" }
{ "tts_request": { "text": "Battery low", "loop": true } }
{ "request_message": "GLOBAL_POSITION_INT" }
{ "class": "COMMAND_LONG", "message": { "target_system": 1, ... } }
```

### Server → Browser

```json
{ "class": "camera_frame_available", "camera_ids": [0,1], "active_cameras": [0,1], "frame_count": 1234 }
{ "class": "camera_info", "data": { "camera_ids": [0,1], "layout": "side_by_side", ... } }
{ "class": "ai_advice", "priority": 8, "advice": "Battery critical", "alert": true }
{ "class": "voice_transcript", "text": "takeoff to 30 metres" }
{ "class": "voice_command_executed", "intent": "takeoff", "params": { "altitude": 30 } }
{ "class": "tts_audio", "text": "Taking off", "loop": false, "audio": "<base64>" }
{ "class": "HEARTBEAT", "message": { ... } }
{ "class": "notify", "message": "Layout changed to side_by_side" }
{ "class": "error", "message": "Camera not available" }
```

---

## 🐛 Troubleshooting

### Camera not showing
- ✅ Check camera is connected and recognised by OS
- ✅ Run `python test/camera_test.py` to verify indices
- ✅ The DirectShow `VIDEOIO(DSHOW)` warnings in the log are normal on Windows when no camera is connected to a probed index — not errors
- ✅ Check that at least one camera checkbox is ticked in the startup GUI

### Drone not connecting
- ✅ Verify USB cable and correct COM port
- ✅ Check baud rate (115200 standard for PX4)
- ✅ Run: `python -c "from pymavlink import mavutil; c = mavutil.mavlink_connection('COM21'); print(c)"`

### AI advisor silent / not responding
- ✅ Verify Ollama is running: `curl http://localhost:11434/api/tags`
- ✅ Verify model is pulled: `ollama list`
- ✅ Check server log for `AI advisor error:` lines
- ✅ Switch to `phi3:mini` if RAM is under 8 GB

### Robotic TTS voice in Edge
- ✅ Open Edge and navigate to `edge://settings/languages` — ensure "Download languages for offline use" includes English
- ✅ Open DevTools console and run: `speechSynthesis.getVoices().filter(v => v.name.includes('Aria'))`
- ✅ If empty, voices haven't loaded yet — refresh the page and try again
- ✅ The console log `🔊 Edge neural voice selected: Microsoft Aria Online (Natural)` confirms correct detection

### Voice commands not triggering
- ✅ Check microphone is set as default input device in OS audio settings
- ✅ Verify `sounddevice` lists your microphone: `python -c "import sounddevice; print(sounddevice.query_devices())"`
- ✅ Check server log for `Wake word detected` after saying "hey station"
- ✅ Run Whisper test: `python -c "from faster_whisper import WhisperModel; m = WhisperModel('small.en'); print('OK')"`

### WebSocket drops
- ✅ Verify server running at `http://localhost:8765/api/health`
- ✅ Check browser console (F12) for connection errors
- ✅ Slow camera compositor can starve the WS event loop — reduce camera count or lower FPS

### Server crashes on startup
- ✅ Camera timeout (no frame in 10 s) — disable cameras in GUI and test without
- ✅ Python version must be 3.10+ (type hints with `|` used throughout)
- ✅ Run `python -u main.py 2>&1 | tee launch.log` to capture full error output

---

## 🗺️ Roadmap

### In Progress
- [ ] **Ollama streaming responses** — stream LLM tokens to UI as they arrive for lower perceived latency
- [ ] **Custom wake words** — train domain-specific wake words ("drone station", "autopilot")
- [ ] **Safety gate wiring** — connect `_safe_to_arm()` to live mavlink_node telemetry fields

### Planned — Phase 3
- [ ] **SLAM integration** — visual odometry using camera feeds
- [ ] **Obstacle avoidance** — fuse YOLO detections with distance sensor MAVLink messages
- [ ] **Mission AI** — LLM generates waypoint sequences from natural language ("survey the north field")
- [ ] **Telemetry logging** — SQLite recording of all MAVLink messages with playback
- [ ] **Multiple drones** — swarm support via multiple MAVLink connections
- [ ] **Mobile companion** — responsive layout for tablet field operation

### Future
- [ ] **Faster-RCNN / SAM** — higher-accuracy detection for specific mission objects
- [ ] **Edge TPU / Coral** — hardware acceleration for vision on embedded ground station
- [ ] **Lua scripting** — custom button/automation workflows without Python restarts

---

## 📄 License

[Add your license here]

---

## 🤝 Contributing

1. Test on actual PX4 hardware before submitting
2. Follow existing async/await patterns (no blocking calls in coroutines)
3. All LLM prompts must use `"format": "json"` and validate output against a schema before acting on it
4. Document new WebSocket message classes in the Message Reference section above
5. Update this README for any new module, endpoint, or configuration option

---

## 📞 Support

- Check the Troubleshooting section above first
- Capture full logs: `python -u main.py 2>&1 | tee launch.log`
- Monitor browser console: F12 → Console tab
- Ollama logs: `ollama serve` output in a separate terminal

---

**Happy flying! 🚁✈️**