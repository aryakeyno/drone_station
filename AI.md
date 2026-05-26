# Drone Station — AI System Architecture & Specification

**Version:** 2.0.0  
**Status:** Production  
**Last Updated:** 2026-05-26  
**Target Audience:** AI systems, code generation tools, API integrators  
**Format:** Machine-readable with structured metadata

---

## 1. SYSTEM OVERVIEW

### 1.1 Architecture Type
- **Pattern:** Distributed async microservices (multi-node coroutine pattern)
- **Framework:** FastAPI + asyncio (Python 3.10+)
- **Communication:** WebSocket (bidirectional) + HTTP (unidirectional)
- **State Model:** Stateful nodes with rolling telemetry windows
- **Execution Model:** Async/await (single event loop) + background worker threads for blocking I/O

### 1.2 Core Nodes
```
┌──────────────────────────────────────────────────────────────────┐
│ SYSTEM COMPOSITION                                               │
├──────────────────────────────────────────────────────────────────┤
│ 1. MavlinkNode          → Hardware (COM port) ↔ PX4 telemetry   │
│ 2. CameraNode           → Hardware (USB cameras) ↔ Vision        │
│ 3. JoystickNode         → Hardware (USB joystick) ↔ RC override  │
│ 4. AINode               → Ollama REST ↔ LLM inference            │
│ 5. VoiceCommander       → Microphone ↔ STT/intent/command       │
│ 6. AIAudioNode          → TTS synthesis ↔ Speaker               │
│ 7. ConnectionManager    → WebSocket pool ↔ Browser clients      │
│ 8. FastAPI App          → HTTP/WebSocket router                 │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Data Flow Topology
```
Inputs (External):
  - Serial MAVLink (drone telemetry/commands)
  - USB cameras (video frames)
  - USB joystick (RC input)
  - Microphone (voice input)
  - Browser WebSocket (UI commands)

Processing:
  - CameraNode: frame capture + YOLO detection + composition
  - MavlinkNode: telemetry parsing + command execution
  - AINode: rolling window analysis + Ollama LLM queries
  - VoiceCommander: wake word + STT + intent classification
  - JoystickNode: input polling + RC override mapping

Outputs (External):
  - Browser WebSocket: telemetry, advice, status
  - HTTP MJPEG: video streams (/video, /video/<cam_id>)
  - Speaker: audio (TTS, alerts)
  - Serial MAVLink: commands back to drone
  - RC PWM: joystick override signals
```

### 1.4 Service Dependencies & Versions

| Component | Type | Version | Purpose |
|-----------|------|---------|---------|
| `fastapi` | Framework | ^0.104 | HTTP/WebSocket server |
| `uvicorn` | ASGI Server | ^0.24 | Server runtime |
| `pymavlink` | Library | ^2.4 | MAVLink protocol |
| `opencv-python` | Library | ^4.8 | Image processing, camera capture |
| `ultralytics` | Library | ^8.0 | YOLOv8 inference |
| `pygame` | Library | ^2.2 | Joystick polling |
| `asyncio` | Stdlib | built-in | Async runtime |
| `httpx` | Library | ^0.25 | Async HTTP client (Ollama) |
| `faster-whisper` | Library | ^0.10 | Speech-to-text |
| `openwakeword` | Library | ^0.5 | Wake word detection |
| `edge-tts` | Library | ^6.0 | Microsoft TTS (online) |
| `ollama` | Service | ^0.1 | Local LLM (external process) |

---

## 2. NODE SPECIFICATIONS

### 2.1 MavlinkNode

**Class:** `hardware/mavlink_node.py :: MavlinkNode`

**Responsibility:** Serial communication with PX4 flight controller

**Interface:**
```python
class MavlinkNode:
    def __init__(self, com_port: str, baud_rate: int, ws_manager)
    async def connect() → None
    async def run() → None
    async def send_command_long(target_system, command, params) → bool
    async def send_command_int(target_system, command, params) → bool
    def get_telemetry_snapshot() → dict
    def ingest_message(msg_dict) → None
```

**Message Types Streamed:**
- `HEARTBEAT` (1, frequency 5 Hz)
- `SYS_STATUS` (1, frequency 1 Hz)
- `ATTITUDE` (30, frequency 30 Hz)
- `GLOBAL_POSITION_INT` (33, frequency 1 Hz)
- `GPS_RAW_INT` (24, frequency 1 Hz)
- `BATTERY_STATUS` (147, frequency 1 Hz)
- `VFR_HUD` (74, frequency 5 Hz)
- `STATUSTEXT` (253, frequency 0.5 Hz)
- (20+ more types, rate-limited per config)

**Telemetry Snapshot Keys:**
```json
{
  "armed": bool,
  "system_status": int,
  "mode": str,
  "battery_percent": float,
  "battery_voltage": float,
  "gps_fix": int,
  "satellites": int,
  "altitude": float,
  "lat": float,
  "lon": float,
  "velocity": float,
  "roll": float,
  "pitch": float,
  "yaw": float,
  "connected": bool
}
```

**Error Handling:**
- Connection lost: auto-reconnect every 5s
- Malformed message: log + continue
- Command timeout: return False

---

### 2.2 CameraNode

**Class:** `vision/camera_node.py :: CameraNode`

**Responsibility:** Multi-camera capture, frame composition, YOLO detection

**Interface:**
```python
class CameraNode:
    def __init__(self, camera_ids: list[int], layout: str, ai_node, ws_manager, detection_optimizer)
    async def capture_loop(cam_id: int) → None
    async def compositor_loop() → None
    def toggle_detection(enable: bool, camera_id: int = None) → None
    def get_camera_info() → dict
    def set_camera_layout(layout: str) → None
    def set_composite_resolution(width: int, height: int) → None
```

**Composite Layout Enum:**
```python
LAYOUTS = {
    "single": "1 camera, full screen",
    "side_by_side": "2 cameras, left-right",
    "top_bottom": "2 cameras, top-bottom",
    "three_left_main": "3 cameras: main left, 2 right stacked",
    "three_right_main": "3 cameras: main right, 2 left stacked",
    "three_top_main": "3 cameras: main top, 2 bottom stacked",
    "grid_2x2": "4 cameras, 2x2 grid"
}
```

**Frame Specification:**
- Format: BGR uint8 (OpenCV standard)
- Capture resolution: 640×480 per camera
- Composite output: configurable (default 1280×720)
- JPEG quality: 80% (tunable)
- Target FPS: 30 (adaptive)

**YOLO Detection Output:**
```json
[
  {
    "class_id": 0,
    "class_name": "person",
    "confidence": 0.95,
    "bbox": [x1, y1, x2, y2],  // normalized 0-1
    "camera_id": 0
  }
]
```

**HTTP Endpoints Generated:**
- `GET /video` → Composite MJPEG stream
- `GET /video/{cam_id}` → Per-camera MJPEG stream
- `GET /api/camera/frame` → Composite JPEG snapshot
- `GET /api/camera/frame/{cam_id}` → Per-camera JPEG snapshot

---

### 2.3 JoystickNode

**Class:** `hardware/joystick_node.py :: JoystickNode`

**Responsibility:** USB gamepad polling and RC override mapping

**Interface:**
```python
class JoystickNode:
    def __init__(self, joystick_id: int, ws_manager, mavlink_node)
    async def poll_loop() → None
```

**Input Mapping:**
```
AXES (RC Channels):
  0 (Roll)    → PWM 1000-2000  (left/right tilt)
  1 (Pitch)   → PWM 1000-2000  (forward/backward tilt)
  2 (Throttle)→ PWM 1000-2000  (climb/descend)
  3 (Yaw)     → PWM 1000-2000  (turn left/right)

BUTTONS:
  0: arm/disarm toggle
  1: manual mode
  2: altitude hold
  3: position hold
  4: mission mode
  5: return to launch
  6: mode up
  7: mode down
  8: camera layout up
  9: camera layout down
  10: detection toggle
  11: AI advisor on/off
  12: emergency land
  13: custom (unused)
```

**Parameters:**
- Poll rate: 50 Hz (20ms)
- Deadzone: 0.05 (5% of axis range)
- Debounce: 0.2 s (button)
- Invert axes: configurable per axis

---

### 2.4 AINode

**Class:** `ai/ai_node.py :: AINode`

**Responsibility:** Rolling telemetry analysis + Ollama LLM inference

**Interface:**
```python
class AINode:
    def __init__(self, mavlink_node, camera_node, ws_manager)
    async def advisor_loop() → None
    def ingest_telemetry(data: dict) → None
    def ingest_detections(detections: list[dict]) → None
    async def ask_question(question: str) → dict
```

**Telemetry Window:**
- Type: `collections.deque(maxlen=30)`
- Update frequency: every MAVLink message (~10-50 Hz)
- Retention: ~3 seconds of history

**LLM Query Contract:**
```json
{
  "model": "mistral:instruct | phi3:mini",
  "prompt": "...telemetry snapshot + detections + user question...",
  "stream": false,
  "temperature": 0.2,
  "num_predict": 120,
  "top_p": 0.95
}
```

**LLM Response Schema (enforced):**
```json
{
  "priority": 1-10,
  "advice": "string (max 20 words)",
  "detail": "string (optional explanation)",
  "alert": true|false
}
```

**Advice Loop:**
- Interval: 10 seconds (configurable)
- Triggers: telemetry window change, detection changes
- Output: broadcast to all WebSocket clients
- Fallback: if Ollama unreachable, advice={priority:1, advice:"LLM offline"}

**Priority Scale:**
- 1-3: Informational (no speech)
- 4-6: Advisory (low-priority speech queue)
- 7-9: Warning (medium-priority speech queue)
- 10: Critical (pre-empt all speech, popup alert)

---

### 2.5 VoiceCommander

**Class:** `ai/voice_commander.py :: VoiceCommander`

**Responsibility:** Offline voice command pipeline

**Pipeline Stages:**

```
Stage 1: Wake Word Detection
  Input: Microphone audio (16 kHz mono, 80 ms chunks via sounddevice)
  Model: OpenWakeWord (CPU-optimized)
  Output: Confidence score
  Threshold: 0.5
  Latency: ~50 ms

Stage 2: Speech-to-Text (triggered on wake word)
  Input: Audio stream (5 seconds max)
  Model: faster-whisper small.en (int8 quantized)
  Output: Text transcript
  Latency: ~1-2s (CPU), ~0.3s (GPU)

Stage 3: Intent Classification
  Input: Transcript text
  Model: Ollama (temperature 0.1)
  Output: JSON intent object
  Latency: ~1s (CPU)

Stage 4: Safety Gate
  Checks:
    - GPS fix ≥ 3D
    - Battery > 20%
    - Drone connected
    - Autopilot mode enabled
  Action: block or proceed

Stage 5: Execution + Confirmation
  High-risk intents (arm, takeoff, goto):
    → ask "Confirm: <action>. Say yes."
    → wait for verbal confirmation
    → execute
  Low-risk intents (land, rtl, disarm, hold):
    → execute immediately
```

**Intent Schema:**
```json
{
  "intent": "arm|disarm|takeoff|land|goto|rtl|hold|unknown",
  "params": {
    "altitude": float_meters,
    "lat": float,
    "lon": float,
    "direction": "north|south|east|west",
    "duration": float_seconds
  },
  "confidence": 0.0-1.0,
  "requires_confirm": true|false
}
```

**Supported Intents:**
```
arm                 → MAV_CMD_COMPONENT_ARM_DISARM (400, param1=1)
disarm              → MAV_CMD_COMPONENT_ARM_DISARM (400, param1=0)
takeoff <altitude>  → MAV_CMD_NAV_TAKEOFF (22, param7=altitude)
land                → MAV_CMD_NAV_LAND (21)
goto <lat> <lon>    → MAV_CMD_DO_REPOSITION (102, lat, lon)
rtl                 → MAV_CMD_NAV_RETURN_TO_LAUNCH (20)
hold                → MAV_CMD_DO_LOITER_UNLIMITED (17)
unknown             → no-op (audio response only)
```

---

### 2.6 AIAudioNode

**Class:** `ai/audio_node.py :: AIAudioNode`

**Responsibility:** Text-to-speech synthesis and audio queue management

**TTS Priority Chain:**

```
1. Edge Browser (client-side)
   - Trigger: user in Microsoft Edge
   - Voices: Aria Online, Jenny Online, Guy Online
   - Latency: ~0.5s
   - No server round-trip

2. edge-tts (server-side, requires internet)
   - Trigger: client not in Edge OR offline fallback unavailable
   - Voices: same Microsoft neural voices
   - Format: MP3 base64 over WebSocket
   - Latency: ~1-2s
   - Requires: active internet

3. Kokoro-82M ONNX (server-side, fully offline)
   - Trigger: edge-tts fails OR offline mode
   - Voices: 5 multilingual voices (en-US, etc.)
   - Format: WAV base64 over WebSocket
   - Latency: ~0.3-0.5s
   - Requires: ONNX model files (300 MB)
```

**Speech Queue Specification:**
```python
class UnifiedAudioQueue:
    max_size = 100  # configurable
    messages: list[SpeechMessage]
    
    SpeechMessage = {
        "text": str,
        "priority": 1-10,
        "source": "battery|statustext|ai_advice|voice_confirm|custom",
        "loop": bool,  # repeat until cleared
        "timestamp": float
    }
```

**Queue Behavior:**
- Sorted by priority (higher = first)
- Deduplicated by (text + source) within 5s window
- Looping messages: repeat until state changes
- Dropped if: queue full AND priority < 5

**WebSocket Message Contract:**
```json
{
  "class": "tts_audio",
  "text": "string",
  "loop": false,
  "audio": "base64 encoded MP3 or WAV"
}
```

---

### 2.7 ConnectionManager

**Class:** `server/socket_manager.py :: ConnectionManager`

**Responsibility:** WebSocket connection pooling and message routing

**Interface:**
```python
class ConnectionManager:
    async def connect(websocket: WebSocket) → None
    def disconnect(websocket: WebSocket) → None
    async def broadcast(message: dict) → None
    async def handle_incoming_command(...) → None
```

**Broadcasting Strategy:**
- Concurrent `asyncio.gather()` with 1s timeout per client
- Dead connections auto-removed
- Zero-copy snapshots during iteration
- Throughput: 1000+ msgs/sec sustained

**Incoming Command Routing:**

| Command Key | Handler | Response |
|---|---|---|
| `toggle_detection` | CameraNode.toggle_detection() | `camera_detection_update` |
| `set_camera_layout` | CameraNode.set_camera_layout() | broadcast `camera_frame_available` |
| `set_camera_slot_order` | CameraNode.reorder_cameras() | broadcast `camera_frame_available` |
| `ask_ai` | AINode.ask_question() | `ai_advice` |
| `tts_request` | AIAudioNode.synthesize() | `tts_audio` |
| `COMMAND_LONG` | MavlinkNode.send_command_long() | MAVLink ACK → `mavlink_ack` |
| `COMMAND_INT` | MavlinkNode.send_command_int() | MAVLink ACK → `mavlink_ack` |
| `request_camera_info` | CameraNode.get_camera_info() | `camera_info` |
| `request_message` | MavlinkNode query | MAVLink message |

**Outgoing Message Broadcast:**

| Message Class | Trigger | Frequency | Keys |
|---|---|---|---|
| `mavlink_*` | Message received | ~10-50 Hz | (MAVLink message fields) |
| `camera_frame_available` | Compositor ready | ~30 Hz | urls, active_cameras, frame_count |
| `ai_advice` | Advice interval | ~0.1 Hz | priority, advice, detail, alert |
| `voice_transcript` | STT complete | on-demand | text, confidence |
| `voice_command_executed` | Intent executed | on-demand | intent, params, status |
| `tts_audio` | TTS ready | on-demand | text, audio (base64) |
| `camera_detection_update` | Detection toggled | on-demand | camera_id, detection_enabled |

---

### 2.8 FastAPI Application

**File:** `server/web_app.py`

**Initialization:**
```python
app = FastAPI(
    title="Drone Station",
    version="2.0.0",
    lifespan=lifespan_context
)
```

**Endpoints:**

| Method | Path | Content-Type | Purpose |
|--------|------|--------------|---------|
| GET | `/` | text/html | Serve index.html (SPA) |
| WebSocket | `/ws` | application/json | Real-time bidirectional |
| GET | `/video` | video/x-motion-jpeg | Composite MJPEG stream |
| GET | `/video/{cam_id}` | video/x-motion-jpeg | Per-camera MJPEG |
| GET | `/api/camera/frame` | image/jpeg | Composite JPEG snapshot |
| GET | `/api/camera/frame/{cam_id}` | image/jpeg | Per-camera JPEG |
| GET | `/api/camera/info` | application/json | Camera config |
| GET | `/api/mavlink/status` | application/json | MAVLink connection status |
| GET | `/api/health` | application/json | Server health |
| GET | `/{path}` | (auto-detect) | SPA fallback |

---

## 3. DATA TYPES & SCHEMAS

### 3.1 Configuration

**File:** `config/settings.py`

```python
@dataclass
class AppConfig:
    # Hardware
    com_port: str = "COM3"
    baud_rate: int = 115200
    joystick_id: int = 0
    
    # Camera
    camera_ids: list[int] = field(default_factory=lambda: [0])
    camera_enabled: bool = True
    camera_layout: str = "side_by_side"
    layout_main_ratio: float = 0.65
    composite_width: int = 1280
    composite_height: int = 720
    
    # Detection
    yolo_model_path: str = "models/yolov8n.pt"
    yolo_detection_enabled: bool = False
    
    # AI
    ai_advisor_enabled: bool = True
    voice_commands_enabled: bool = True
    wake_word_enabled: bool = True
    
    # Server
    websocket_port: int = 8765
    
    # UI
    ui_theme: str = "dark"
    background_color: str = "#1a1a1a"
```

### 3.2 MAVLink Command Contract

```python
# Send to drone
{
    "class": "COMMAND_LONG | COMMAND_INT",
    "message": {
        "target_system": 1,
        "target_component": 0,
        "command": int,  # MAV_CMD_*
        "confirmation": 0,
        "param1": float, ... "param7": float,
        "frame": 0|1|3|10  # MAV_FRAME enum
    }
}

# Response from drone
{
    "class": "COMMAND_ACK",
    "result": 0|1|2|3,  # 0=accepted, 1=temp reject, 2=denied, 3=unsupported
    "command": int
}
```

---

## 4. STATE MACHINES

### 4.1 Drone Connection State

```
DISCONNECTED
    ↓ (connection attempt)
CONNECTING
    ├─→ (timeout) → DISCONNECTED
    └─→ (heartbeat received) → CONNECTED
            ↓ (heartbeat lost 5s)
        HEARTBEAT_LOST
            ↓ (auto-reconnect)
        CONNECTING
```

### 4.2 Voice Command State

```
IDLE
    ↓ (wake word detected)
LISTENING
    ├─→ (timeout 5s) → IDLE
    └─→ (silence detected) → PROCESSING
            ↓
        STT_RUNNING
            ├─→ (error) → IDLE
            └─→ (transcript ready) → INTENT_CLASSIFICATION
                    ↓
                SAFETY_GATE_CHECK
                    ├─→ (fail) → speak error → IDLE
                    └─→ (pass) → maybe CONFIRMATION_WAIT
                            ↓
                        EXECUTING
                            ├─→ (success) → speak confirm → IDLE
                            └─→ (error) → speak error → IDLE
```

### 4.3 Detection State

```
DISABLED
    ↓ (toggle_detection(True))
LOADING
    ├─→ (timeout 10s) → DISABLED
    └─→ (model loaded) → ENABLED
            ↓ (toggle_detection(False))
        DISABLED
```

---

## 5. ERROR CODES & RECOVERY

### 5.1 MAVLink Errors

| Code | Meaning | Recovery |
|------|---------|----------|
| 0 | MAV_RESULT_ACCEPTED | Success, continue |
| 1 | MAV_RESULT_TEMPORARILY_REJECTED | Retry in 2s |
| 2 | MAV_RESULT_DENIED | User intervention required |
| 3 | MAV_RESULT_UNSUPPORTED | Fallback command or skip |

### 5.2 Camera Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| Camera not found | USB disconnected | Warn user, auto-disable camera |
| Frame capture timeout | Slow device | Skip frame, continue |
| YOLO load failed | Model corrupt | Disable detection, log error |
| Compositor overflow | Too many frames | Increase skip ratio |

### 5.3 Ollama Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| Connection refused | Service not running | Retry every 10s, queue advice |
| Timeout | Slow inference | Use fallback empty advice |
| Model not found | Model not pulled | Log error, fall back to phi3:mini |
| Out of memory | Model too large | Reduce context window, log warning |

---

## 6. PERFORMANCE TARGETS

| Metric | Target | Acceptable | Degraded |
|--------|--------|-----------|----------|
| Frame capture latency | <50ms | <100ms | <500ms |
| Composite rendering | <50ms | <100ms | <200ms |
| YOLO inference (1 frame) | <1s (GPU) <5s (CPU) | <2s (GPU) <10s (CPU) | >10s |
| MAVLink telemetry latency | <100ms | <500ms | >1s |
| Advice loop latency | <2s | <5s | >10s |
| Voice command latency | <3s | <5s | >10s |
| WebSocket broadcast | <100ms | <500ms | >1s |

---

## 7. DEPLOYMENT & INITIALIZATION

### 7.1 Startup Sequence

```
1. Parse CLI args / load config (default: config/settings.py)
2. Launch GUI (PySimpleGUI) for hardware selection
3. Initialize hardware nodes (async context)
   a. MavlinkNode (connect, start telemetry loop)
   b. CameraNode (probe cameras, start capture + compositor)
   c. JoystickNode (probe gamepads, start poll loop)
   d. AINode (init Ollama connection, start advisor loop)
   e. VoiceCommander (load models: wake word, STT, intent)
   f. AIAudioNode (load TTS model if offline mode)
4. Start FastAPI server (Uvicorn, port 8765)
5. Emit "ready" event to browser clients
```

### 7.2 Shutdown Sequence

```
1. Set shutdown flag
2. Cancel all async tasks
3. Gracefully disconnect all WebSocket clients
4. Close serial ports
5. Release camera handles
6. Unload YOLO model
7. Exit
```

---

## 8. EXTENSION POINTS

Designed for extensibility:

1. **New Hardware:** Subclass `Node` base class, implement async `run()` method
2. **New Inference Model:** Replace YOLO in `DetectionOptimizer`, same interface
3. **New LLM Provider:** Replace Ollama calls in `AINode`, same response schema
4. **New TTS Engine:** Add to priority chain in `AIAudioNode`
5. **Custom WebSocket Commands:** Register in `ConnectionManager.handle_incoming_command()`

### Key Characteristics

| Property | Value | Reason |
|----------|-------|--------|
| **Model** | Stateful microservice | Maintains model state and detection queues |
| **Communication** | Async (WebSocket) or sync (direct Python) | Async for distributed systems, sync for same-process |
| **Thread Safety** | Yes, thread-safe | Uses asyncio Semaphore and locks for queue access |
| **Blocking** | Never | All I/O is async; inference runs in thread pool |
| **Scalability** | Per-instance | Each service instance has its own model and queues |
| **Statefulness** | Stateful | Maintains rolling queue per camera |
| **Consistency** | Eventual | Detection results may lag frames by 100-500ms depending on hardware |

### Service Dependencies

```
DetectionService
├── ultralytics.YOLO (model inference)
├── asyncio (async runtime)
├── threading (inference thread pool)
├── numpy (frame handling)
└── cv2 (image processing)
```

### Resource Requirements

| Resource | Minimum | Recommended | Ideal |
|----------|---------|-------------|-------|
| **CPU** | 1 core | 2+ cores | 4+ cores |
| **RAM** | 2 GB | 4 GB | 8+ GB |
| **GPU** | Not used (CPU only) | N/A | N/A |
| **Model Storage** | 40 MB (yolov8n) | 90 MB (yolov8s) | 200 MB (yolov8m) |
| **Queue Buffer** | 50 MB max | 20 MB avg | 10 MB avg |

---

## 🤝 Service Guarantees

The service makes these formal guarantees to clients:

### Availability
- **Uptime SLA:** 99.5% (service available, not including client connectivity)
- **Graceful Degradation:** If queue overflows, automatically increases frame skip ratio
- **Crash Recovery:** Unhandled exceptions in inference logged; service continues running

### Consistency
- **Message Ordering:** Per-camera ordering guaranteed (frame N+1 never processed before frame N for same camera)
- **Duplicate Prevention:** No frame processed twice
- **State Atomicity:** Telemetry snapshots are atomic (no partial updates visible)

### Latency
- **Frame Queueing:** < 1ms (p99) — never blocks caller
- **Result Retrieval:** < 0.1ms (p99) — instant cache lookup
- **Telemetry Broadcast:** Within 5s (±1s jitter) of request

### Throughput
- **Max Concurrent Inferences:** 1-2 (configurable, default 1)
- **Frame Queueing Rate:** > 1000 frames/sec sustainable
- **Inference Rate:** 5-200 FPS (hardware-dependent)

### Data Integrity
- **Frame Data:** No corruption during queue operations
- **Telemetry:** Rolling averages with no NaN/Inf values
- **Configuration:** Atomic updates (no partial application)

---

## 🎯 Core Responsibilities

### What This Service DOES Provide

1. ✅ **Async frame queueing** — Queue frames without blocking
2. ✅ **YOLO inference** — Run object detection on queued frames
3. ✅ **Per-camera tracking** — Maintain separate queues per camera
4. ✅ **Result caching** — Latest annotated frame available per camera
5. ✅ **Adaptive frame skipping** — Auto-reduce load if queue backs up
6. ✅ **Concurrency limiting** — Semaphore prevents inference explosion
7. ✅ **Real-time telemetry** — Periodic metrics broadcast
8. ✅ **Error recovery** — Automatic restart on inference crash
9. ✅ **Configuration management** — Runtime tuning of skip ratio, confidence, etc.
10. ✅ **Thread pool management** — Offload CPU inference to thread pool

### What This Service DOES NOT Provide

1. ❌ GPU acceleration (CPU-only)
2. ❌ Model training or fine-tuning
3. ❌ Distributed inference (single-instance only)
4. ❌ Model serving over REST HTTP (async only)
5. ❌ Persistent frame storage
6. ❌ Historical detection logging
7. ❌ Custom YOLO model compilation
8. ❌ Real-time frame capture (expects frames already captured)

---

## 💡 Design Principles

### 1. **Non-Blocking First**
All client-facing APIs must return in < 1ms. Inference happens in background.
```python
# ✅ Good: Returns immediately
queued, reason = detector.queue_frame(cam_id, frame)

# ❌ Bad: Waits for inference to complete
frame_with_boxes = await detector.detect_and_annotate(frame)  # 100-500ms
```

### 2. **Fail-Safe Defaults**
If something breaks, degrade gracefully rather than crash.
```python
# If inference times out: skip frame, log warning, continue
# If model won't load: return False, stay disabled
# If queue overflows: increase skip_ratio, keep processing
```

### 3. **Observability by Default**
Service emits telemetry every N seconds without being asked.
```python
# Automatically broadcast:
# - Queue depth per camera
# - Inference time rolling average
# - Frame skip ratio
# - Total frames processed/skipped
```

### 4. **Hardware Adaptivity**
Configuration adapts to what the hardware can handle.
```python
# User sets frame_skip=2 (process 50%)
# If queue backs up to 5+ frames:
#   Auto-increase skip_ratio to 4 (process 25%)
# If queue empties to 0:
#   Can decrease skip_ratio back to 2
```

### 5. **Clear Contracts**
Every method has explicit input/output contracts, latency guarantees, and error modes.
```python
def queue_frame(camera_id: int, frame: np.ndarray) -> Tuple[bool, str]:
    """
    BLOCKING: Never (< 1ms p99)
    THREAD_SAFE: Yes
    EXCEPTION_FREE: Yes (returns error in tuple)
    IDEMPOTENT: No (frame added each call)
    """
```

---

## 📦 Interfaces

### 1. Frame Queueing Interface

**Method Signature:**
```python
def queue_frame_for_detection(
    self, 
    cam_id: int, 
    frame: np.ndarray
) -> Tuple[bool, str]
```

**Contract:**
```python
"""
Queue a frame for background YOLO detection.

INPUT VALIDATION:
  - cam_id: Must be integer >= 0
  - frame: Must be numpy array, shape (H, W, 3), dtype uint8, BGR color

BEHAVIOR:
  - Frame is copied (caller retains original)
  - Non-blocking: Returns in < 1ms
  - May skip frame if frame_skip_ratio is active
  - May skip frame if queue is full (graceful degradation)

RETURN VALUE:
  - (True, "queued") — Frame added to this camera's queue
  - (False, "skipped (ratio 2)") — Frame skipped due to skip_ratio
  - (False, "queue full") — Camera queue at max capacity
  - (False, "detection_disabled") — Service not enabled

GUARANTEES:
  - Thread-safe: Multiple threads can call simultaneously
  - No exceptions (errors returned in tuple)
  - Never blocks caller
  - Caller frame data not modified

ERROR CASES (NO EXCEPTION):
  - cam_id not recognized: Returns (False, "unknown_camera")
  - frame wrong shape: Returns (False, "invalid_frame_shape")
  - frame wrong dtype: Returns (False, "invalid_frame_dtype")
  - service disabled: Returns (False, "detection_disabled")

LATENCY SLA:
  - 99th percentile: < 1ms
  - 99.9th percentile: < 5ms
  - Max: < 10ms (even under load)

THROUGHPUT:
  - Supports > 1000 calls/sec from all cameras combined
"""
```

### 2. Result Retrieval Interface

**Method Signature:**
```python
async def get_processed_frame(
    self, 
    camera_id: int
) -> Optional[np.ndarray]
```

**Contract:**
```python
"""
Get the latest detection result for a camera.

BEHAVIOR:
  - Non-blocking: Returns in < 0.1ms
  - Async but never actually awaits (returns immediately)
  - Returns latest available annotated frame or None

RETURN VALUE:
  - np.ndarray of same shape as last queued frame, with boxes overlaid
  - None if no result available yet

GUARANTEES:
  - Thread-safe: Multiple threads can read simultaneously
  - Non-destructive: Calling multiple times returns same frame
  - Frame is annotated with detection boxes (if any objects found)
  - Original frame data preserved (frame not modified in-place)

LATENCY SLA:
  - 99th percentile: < 0.1ms
  - Always instant (O(1) dict lookup)

CONCURRENCY:
  - Can be called while inference is running
  - May return old result while new one processes
  - Expected: Called before each frame display
"""
```

### 3. Telemetry Interface

**Method Signature:**
```python
def get_telemetry(self) -> Dict[str, Any]
```

**Contract:**
```python
"""
Get current detection service metrics.

RETURN VALUE:
  {
    "enabled": bool,                    # Service initialized?
    "total_queued": int,                # Cumulative frames queued
    "total_processed": int,             # Cumulative frames detected
    "total_skipped": int,               # Cumulative frames skipped
    "avg_inference_ms": float,          # Rolling average inference time
    "avg_queue_depth": float,           # Rolling average queue size
    "max_concurrent_inferences": int,   # Semaphore limit
    "frame_skip_ratio": int,            # Current skip ratio
    "per_camera": {
      "0": {
        "queued": int,
        "processed": int,
        "skipped": int,
        "last_inference_ms": int
      },
      ...
    }
  }

GUARANTEES:
  - All values are non-negative
  - avg_queue_depth is 0.0-10.0 range
  - avg_inference_ms is 0-2000 range (milliseconds)
  - No NaN or Inf values ever present
  - Atomic snapshot (all values from same point in time)

LATENCY SLA:
  - 99th percentile: < 0.1ms
  - Always instant (dict access)

FREQUENCY:
  - Broadcasted automatically every 5s (±1s jitter)
  - Can be called on-demand anytime
"""
```

### 4. Lifecycle Interface

**Method Signature:**
```python
async def load_model(self, model_path: str) -> bool

async def unload_model(self) -> None

def set_configuration(
    self,
    max_concurrent: int = None,
    frame_skip: int = None,
    confidence: float = None,
    adaptive_skip: bool = None
) -> bool
```

**Contract:**
```python
"""
load_model(model_path) -> bool:
  - Loads YOLO model asynchronously
  - Returns True on success, False on failure
  - Does NOT raise exceptions (returns bool)
  - Service ready to accept frames after load completes
  - Slow operation: May take 5-30 seconds depending on disk I/O
  
  LATENCY: 5-30 seconds (model load time)
  BLOCKING: Yes, must await completion

unload_model() -> None:
  - Unloads model from memory
  - Clears all queued frames
  - Sets service to DISABLED state
  - Safe to call even if not loaded
  
  LATENCY: < 100ms
  BLOCKING: Yes, must await completion

set_configuration(**kwargs) -> bool:
  - Updates service configuration at runtime
  - Returns True if all updates successful
  - Invalid values return False (no partial update)
  - Changes take effect immediately
  - Does NOT reload model or clear queues
  
  VALID RANGES:
    - max_concurrent: 1-4
    - frame_skip: 1-32
    - confidence: 0.0-1.0
    - adaptive_skip: True/False
  
  LATENCY: < 1ms
  BLOCKING: No (async-safe)
"""
```

---

## 💬 Message Contracts

### Input Message: FrameQueueRequest

```typescript
interface FrameQueueRequest {
  camera_id: number;           // 0-3
  frame: ArrayBuffer;          // Raw BGR image bytes
  frame_height: number;        // pixels
  frame_width: number;         // pixels
  frame_dtype: "uint8";        // Always uint8
  timestamp: number;           // Unix timestamp ms (optional)
  request_id: string;          // For correlation (optional)
}
```

### Output Message: FrameQueueResponse

```typescript
interface FrameQueueResponse {
  queued: boolean;             // Frame accepted by service?
  reason: string;              // "queued" | "skipped (ratio 2)" | "queue_full" | etc.
  request_id: string;          // Echo of input request_id
  timestamp: number;           // Service receive time (ms)
  queue_depth: number;         // Current queue size for this camera
}
```

### Broadcast Message: DetectionTelemetry

```typescript
interface DetectionTelemetry {
  class: "detection_telemetry";
  data: {
    enabled: boolean;                    // Service running?
    total_queued: number;                // Cumulative
    total_processed: number;             // Cumulative
    total_skipped: number;               // Cumulative
    avg_inference_ms: number;            // 0-2000
    avg_queue_depth: number;             // 0.0-10.0
    max_concurrent_inferences: number;   // 1-4
    frame_skip_ratio: number;            // 1-32
    per_camera: {
      [camera_id: number]: {
        queued: number;
        processed: number;
        skipped: number;
        last_inference_ms: number;
      }
    }
  };
  timestamp: number;                     // Service time (ms)
  broadcast_interval_ms: number;         // Expected interval (5000)
}
```

### Broadcast Message: DetectionResult

```typescript
interface DetectionResult {
  class: "detection_result";
  camera_id: number;
  timestamp: number;                     // Service time (ms)
  inference_time_ms: number;             // How long inference took
  objects_detected: Array<{
    label: string;                       // e.g., "person", "car"
    confidence: number;                  // 0.0-1.0
    bbox: [x1, y1, x2, y2];            // Pixel coordinates
    class_id: number;                    // COCO class ID
  }>;
  frame_height: number;                  // Original frame size
  frame_width: number;
}
```

---

## 🔄 State Model

### Service State Machine

```
START
  │
  ├─ __init__() [UNINITIALIZED state]
  │   • Model not loaded
  │   • Queues initialized but empty
  │   • Telemetry accumulator created
  │
  ├─ load_model() [LOADING state]
  │   • Async model download/load
  │   • Can take 5-30 seconds
  │   • Blocks until complete
  │   │
  │   ├─ SUCCESS → READY state
  │   │   • Model in memory
  │   │   • Can process frames
  │   │   • Workers spawned
  │   │
  │   └─ FAILURE → DISABLED state
  │       • Model load failed
  │       • Queued frames rejected
  │       • Requires retry
  │
  ├─ queue_frame() [READY state]
  │   • Frames queued
  │   • Skip ratio evaluated
  │   • Returns immediately
  │
  ├─ [WORKER threads] [PROCESSING state]
  │   • One frame at a time (semaphore limit)
  │   • YOLO inference runs
  │   • Result cached
  │   │
  │   ├─ SUCCESS → Result available
  │   │   • Boxes overlaid on frame
  │   │   • get_processed_frame() returns it
  │   │
  │   └─ INFERENCE_ERROR → Frame skipped
  │       • Exception caught
  │       • Logged as ERROR
  │       • Continue with next frame
  │
  └─ unload_model() [SHUTTING_DOWN state]
      • Model unloaded
      • Queues cleared
      • Workers stopped
      • Return to UNINITIALIZED
```

### Queue State Per Camera

```
EMPTY (depth=0)
  │
  ├─ queue_frame() → FILLING
  │
FILLING (0 < depth < max)
  │
  ├─ queue_frame() → continue FILLING
  │
  ├─ worker dequeues → may become EMPTY
  │
  └─ if depth >= max → OVERFLOW
  
OVERFLOW (depth >= max_queue_depth)
  │
  └─ trigger adaptive_skip
      → increase skip_ratio
      → new frames skipped
      → queue depth may decrease
```

---

## 📊 Performance Contracts (SLA)

### Latency SLAs

| Operation | p50 | p95 | p99 | p99.9 | Max | Notes |
|-----------|-----|-----|-----|-------|-----|-------|
| queue_frame() | 0.1ms | 0.5ms | 1.0ms | 3ms | 10ms | Always non-blocking |
| get_processed_frame() | <0.1ms | <0.1ms | <0.1ms | <0.1ms | 0.5ms | Instant dict lookup |
| get_telemetry() | <0.1ms | <0.1ms | <0.1ms | <0.1ms | 0.5ms | Instant dict access |
| YOLO inference | 5ms | 50ms | 150ms | 500ms | 2000ms | Hardware dependent |
| load_model() | 5s | 10s | 15s | 30s | 60s | First-time: includes download |
| telemetry broadcast | 5s | 5.1s | 5.2s | 5.5s | 6s | Intentional interval ±10% |

### Throughput SLAs

| Metric | Guarantee | Notes |
|--------|-----------|-------|
| Frame queueing | > 1000 req/sec | All cameras combined |
| Inference capacity | 5-200 FPS | Depends on hardware & model |
| Concurrent inferences | 1-2 | Default 1 (semaphore limit) |
| Telemetry broadcasts | 1 per 5 seconds | Automatic |
| Queue capacity per camera | 5 frames (default) | Configurable |

### Resource Consumption

| Resource | Guarantee | Notes |
|----------|-----------|-------|
| Memory (model) | 40-200 MB | Depends on model size |
| Memory (queue) | 50 MB max | 5 frames × 1280×720 × 3 bytes |
| Memory (telemetry) | 1 MB | Rolling windows + accumulators |
| CPU (idle) | 0-5% | No frames being processed |
| CPU (full load) | 50-100% | One core at max during inference |
| Thread count | 1-5 | Main + worker threads |

### Degradation Behavior

When system is overloaded:

| Condition | Trigger | Response |
|-----------|---------|----------|
| Queue depth > 3 | avg_queue_depth exceeds threshold | Log WARN, increase skip_ratio |
| Queue depth > 5 | Overflow condition | Reject new frames, keep processing |
| Inference timeout | Timeout > 2000ms | Skip frame, log ERROR |
| Memory limit | Queue size > 100 MB | Purge oldest frames |
| Model load fail | Exception during load | Return False, stay DISABLED |

---

## ⚠️ Error Model

### Error Classification

#### Category A: Transient (Automatic Retry)
```
- Queue overflow (queue full)
  Response: Skip frame, continue
  Retry: Automatic (next frame)
  
- Frame skip due to skip_ratio
  Response: Not queued (intentional)
  Retry: Next frame may be queued
```

#### Category B: Recoverable (Manual Recovery)
```
- Model load failure
  Response: Return False
  Recovery: Call load_model() again
  
- Inference timeout
  Response: Skip frame, log ERROR
  Recovery: Automatic (continue with next frame)
```

#### Category C: Unrecoverable (Service Degraded)
```
- Memory exhausted
  Response: Clear queues, log CRITICAL
  Recovery: Restart service
  
- Model file corrupted
  Response: Return False from load_model()
  Recovery: Verify file integrity, reload
```

### Error Return Codes

```python
# No exceptions ever raised; errors returned as strings in tuple

SUCCESS_CODES = {
    "queued": "Frame added to processing queue",
    "loaded": "Model loaded successfully",
}

SKIP_CODES = {
    "skipped (ratio 2)": "Frame skipped due to skip_ratio setting",
    "skipped (adaptive)": "Frame skipped due to adaptive skip increase",
    "skipped (overflow)": "Frame skipped due to queue overflow",
}

DISABLE_CODES = {
    "detection_disabled": "Service not initialized",
    "queue_full": "Camera queue at max capacity",
    "model_not_loaded": "Model load failed previously",
}

INVALID_CODES = {
    "invalid_frame_shape": f"Expected (H, W, 3), got {frame.shape}",
    "invalid_frame_dtype": f"Expected uint8, got {frame.dtype}",
    "invalid_camera_id": f"Camera {cam_id} not registered",
    "unknown_error": "Unexpected error (see logs)",
}
```

### Logging Strategy

```python
# ERROR level: Unexpected failures, service degradation
logger.error("YOLO inference failed: {exception}")
logger.error("Model load failed: corrupted file")

# WARNING level: Overload conditions, degradation
logger.warning(f"Queue backing up: depth={queue_depth}, increasing skip_ratio")
logger.warning(f"Inference timeout: {elapsed_ms}ms > {timeout}ms")

# INFO level: State changes, milestones
logger.info("YOLO model loaded successfully")
logger.info("Adaptive skip triggered: skip_ratio=4")
logger.info(f"Telemetry broadcast: {telemetry}")

# DEBUG level: High-frequency operations
logger.debug(f"Frame queued: cam={cam_id}, reason={reason}")
logger.debug(f"Inference completed: {inference_time_ms}ms")
```

---

## 🔐 Concurrency Model

### Thread Safety Guarantees

```python
# THREAD-SAFE Operations:
queue_frame_for_detection(cam_id, frame)   # ✅ Safe from multiple threads
get_processed_frame(cam_id)                 # ✅ Multiple readers OK
get_telemetry()                             # ✅ Safe concurrent access

# NOT THREAD-SAFE (internal):
_frame_queues dict                          # Protected by _queue_lock
_processed_frames dict                      # Protected by _queue_lock (reads only)
_stats accumulator                          # Protected by lock
```

### Concurrency Scenarios

#### Scenario 1: Multiple Cameras Simultaneously
```
Thread_0: queue_frame(cam_0, frame_0)  ✅ OK
Thread_1: queue_frame(cam_1, frame_1)  ✅ OK
Thread_2: queue_frame(cam_0, frame_1)  ✅ OK
Result: All queued independently
```

#### Scenario 2: Read During Inference
```
Main Thread: detector.get_processed_frame(cam_0)  ✅ OK
Worker Thread: [inferencing on cam_0]
Result: May return old result or new result (race OK, both valid)
```

#### Scenario 3: Configuration During Processing
```
Thread_0: queue_frame(cam_0, frame)     ✅ OK
Thread_1: set_configuration(frame_skip=4)  ✅ OK
Result: Config change takes effect for next frame
```

#### Scenario 4: Load During Queueing
```
Thread_0: queue_frame(cam_0, frame)     → Returns (False, "detection_disabled")
Thread_1: [loading model...]
Thread_0: queue_frame(cam_0, frame)     → After load: Returns (True, "queued")
Result: Proper sequencing
```

### Race Conditions (Acceptable)

```python
# RACE OK: get_processed_frame may return old or new result
# Both are valid; eventual consistency

# RACE OK: Telemetry may lag by up to 1 second
# Shows rolling averages; exact values not critical

# RACE NOT OK: Frame processed twice (prevented by deque semantics)
# Frame processed out of order (prevented by per-camera queue)
```

### Deadlock Prevention

```python
# NO NESTED LOCKS: All locks acquired in strict order
#   1. _queue_lock (data access)
#   2. _inference_semaphore (concurrency limit)
#   Never acquire in reverse order

# TIMEOUT ON LOCKS: Never wait forever
#   asyncio.wait_for(inference_semaphore.acquire(), timeout=10s)

# NO CIRCULAR DEPENDENCIES: Each module independent
#   detection_optimizer doesn't call back to camera_node
```

---

## 🔄 Versioning

### Semantic Versioning: MAJOR.MINOR.PATCH

```
2.0.0
│││
││└─ PATCH: Bug fixes, performance improvements (backward compatible)
│└── MINOR: New features, new methods (backward compatible)
└─── MAJOR: Breaking changes, removed methods (NOT backward compatible)
```

### Current Version: 2.0.0

#### API Stability

| Version | Status | Breaking Changes |
|---------|--------|------------------|
| 2.x.x | Production | None planned until 3.0 |
| 1.x.x | Deprecated | (Old blocking API) |

#### Supported Features

```python
# STABLE (guaranteed support through 2.x.x):
- queue_frame_for_detection(cam_id, frame) → Tuple[bool, str]
- get_processed_frame(cam_id) → Optional[np.ndarray]
- get_telemetry() → Dict
- load_model(model_path) → bool
- unload_model() → None
- set_configuration(**kwargs) → bool

# EXPERIMENTAL (may change in 2.x.x):
- (None currently)

# DEPRECATED (removed in 3.0):
- (None currently)
```

#### Version Migration Path

```
1.0 (blocking API)
  │ MAJOR BREAKING CHANGE
  ├─ Remove model member variable
  ├─ Remove synchronous detection
  ├─ Add DetectionOptimizer
  ▼
2.0 (async queue API) ← YOU ARE HERE
  │
  └─ (future: 3.0 if needed)
```

---

## 📞 Contact & Support

**Service Owner:** Vision Systems Team  
**On-Call:** ai-services@dronestation.local  
**Issues/Bugs:** Create issue with `[detection-service]` tag  
**Questions:** Ask in #ai-services Slack channel  

---

## 📄 Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2026-05-21 | AI Docs | Initial production release |
| 1.0.0 | 2026-04-15 | AI Docs | Draft version |

---

**Last Updated:** 2026-05-21  
**Next Review:** 2026-08-21