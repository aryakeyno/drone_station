# 🚁 Drone Station Setup Guide

This guide explains how to set up all required and optional components for the drone station.

## Quick Start

### 1. Prerequisites
- Python 3.8+ (tested on 3.14.1)
- Windows/macOS/Linux
- Hardware: Flight controller with MAVLink, camera (optional), joystick (optional), microphone (optional)

### 2. Install Core Dependencies

```bash
pip install -r requirements.txt
```

### 3. Check System

```bash
python check_system.py
```

This verifies:
- Python version
- Required files and directories
- Core dependencies (FastAPI, OpenCV, etc.)
- Optional components status

### 4. Start Application

```bash
python main.py
```

A configuration GUI will launch where you can select:
- COM port (for flight controller)
- Camera indices and layout
- Joystick device
- UI theme

The application will then start with your selected hardware.

---

## Optional Features

### 🎤 Wake Word Detection (Voice Commands)

Enable voice-based drone control with "Hey Station" wake word.

**Status:** Currently disabled (models not downloaded)

**Setup:**
```bash
python setup_wake_word.py
```

This will download ~200 MB of ONNX models for:
- Wake word detection (detects "Hey Station")
- Speech recognition (Whisper AI model)
- Intent parsing (Mistral LLM)

**Requirements:**
- Microphone connected
- Mistral LLM running locally: `ollama run mistral`
- Internet connection for initial model downloads

**After Setup:**
```bash
# Restart the application
python main.py
```

Look for this in startup logs:
```
✅ Wake word model loaded
```

---

### 🎵 Local TTS (Text-to-Speech)

Enable offline voice synthesis with Kokoro ONNX models.

**Status:** Ready (uses Edge-TTS by default, optional Kokoro for offline)

**Setup (optional):**
```bash
python setup_kokoro.py
```

This will download ~77 MB of Kokoro voices for local text-to-speech.

**Features:**
- Edge-TTS (default): Works immediately, requires internet, streams synthesis
- Kokoro TTS (optional): Offline synthesis, better voice quality, no internet needed

**Restart the application:**
```bash
python main.py
```

Look for this in startup logs:
```
✅ AIAudioNode initialised (edge-tts + Kokoro TTS)   # Full setup
⚠️  AIAudioNode initialised (edge-tts only)           # Edge-TTS only
```

---

### 📷 Multi-Camera Support

Use 1-4 cameras with configurable layouts.

**Supported Cameras:**
- USB webcams (via OpenCV/DirectShow on Windows)
- CSI/DSI camera modules (Raspberry Pi)
- Any device supported by OpenCV

**Diagnose Available Cameras:**
```bash
python diagnose_cameras.py
```

This tests camera indices 0-9 and reports which ones work.

**Configure in GUI:**
- Run `python main.py`
- Select camera indices in the configuration GUI
- Choose layout: single, side_by_side, top_bottom, grid_2x2, etc.

---

### 🕹️ Joystick/Gamepad Support

Control the drone with a game controller or joystick.

**Supported Controllers:**
- Xbox controllers
- PlayStation controllers  
- Generic USB joysticks

**Check Connected Devices:**
In the configuration GUI, the joystick list will show available devices.

**Configure:**
- Run `python main.py`
- Select joystick from the list
- The app will map buttons to drone controls

---

## Troubleshooting

### Application won't start

1. Check Python version:
   ```bash
   python --version    # Should be 3.8+
   ```

2. Run system check:
   ```bash
   python check_system.py
   ```

3. Install missing packages:
   ```bash
   pip install -r requirements.txt
   ```

### Missing models/files

- **Kokoro voices not found:** Run `python setup_kokoro.py`
- **Wake word models not found:** Run `python setup_wake_word.py`
- **Camera not detected:** Run `python diagnose_cameras.py`

### Voice commands not working

1. Ensure microphone is connected and working
2. Start Mistral LLM: `ollama run mistral`
3. Check logs for errors
4. Verify wake word model is loaded: `python setup_wake_word.py`

### Web UI not loading

1. Check that FastAPI server started (look for `Uvicorn running on http://127.0.0.1:8000`)
2. Try different browser (Chrome, Firefox recommended)
3. Check browser console for errors (F12)

---

## Architecture Overview

```
main.py (FastAPI application)
├── gui/startup.py                    (Hardware config GUI)
├── server/web_app.py                 (Web frontend)
├── hardware/
│   ├── mavlink_node.py               (Flight controller communication)
│   ├── joystick_node.py              (Controller input)
│   └── camera_node.py                (Multi-camera capture)
├── ai/
│   ├── audio_node.py                 (TTS: Edge-TTS + optional Kokoro)
│   ├── voice_commander.py            (Voice commands: Whisper + openwakeword)
│   ├── ai_node.py                    (AI advisor: YOLO + LLM)
│   └── ai/voice_commander.py         (Intent parsing)
├── vision/
│   └── camera_node.py                (Computer vision/YOLO detection)
└── server/
    ├── socket_manager.py             (WebSocket management)
    └── web_app.py                    (Frontend + API)
```

---

## Configuration

Default settings are in `config/settings.py`. The GUI updates these when you select hardware.

You can also manually edit `config/settings.py` to set defaults.

---

## Development

### Running diagnostics

```bash
# Check system and dependencies
python check_system.py

# Test camera hardware
python diagnose_cameras.py

# Download and verify TTS
python setup_kokoro.py

# Download and verify wake word models
python setup_wake_word.py
```

### Environment Variables

- `HF_TOKEN`: HuggingFace token for faster model downloads
- `HF_HUB_DISABLE_SYMLINKS_WARNING`: Set to 1 to disable symlinks warning on Windows
- `DRONE_STATION_LOG_LEVEL`: Set to DEBUG for verbose logging

---

## Performance Tips

1. **Cameras:** Lower resolution = better performance but reduced detail
2. **TTS:** Use Edge-TTS for responsive synthesis, Kokoro for offline/quality
3. **Voice:** Wake word detection is CPU-intensive; disable if you don't need it
4. **AI:** Run Mistral on GPU for faster intent parsing if available

---

## Support

For issues:
1. Run `python check_system.py`
2. Run `python diagnose_cameras.py` if cameras fail
3. Check logs in terminal output
4. See individual setup scripts for detailed error messages

Current (Problematic) Architecture

MAVLink Message (battery=12%)
    ↓
Server receives STATUSTEXT
    ↓
ai.audio_node decides: "Battery low!"
    ↓
Server sends TTS to client ← REPEATING EVERY TIME MESSAGE ARRIVES
    ↓
Client plays audio (duplicates!)

Problems:

Server duplicates audio logic that should be client-side
Server sends the same TTS multiple times for the same status
Network overhead (sending audio data repeatedly)
Client can't proactively prevent duplicates (they arrive from server)
Server is doing "light jobs" when it should focus on heavy lifting
✅ Suggested Architecture

MAVLink Message (battery=12%)
    ↓
Server receives → Broadcasts raw/minimal telemetry to ALL clients
    ↓
Client receives telemetry
    ↓
Client checks: "Is battery < 15% AND not already warning?"
    ↓
Client plays TTS locally (deduplication at source!)


Split Responsibility
Server (Heavy)	Client (Light)
Receive MAVLink messages	Decode telemetry
Broadcast telemetry to all clients	Extract battery/status
Video frame streaming	Decide if alert needed
Process AI advisor requests	Play audio warnings
Manage audio queue locally
🎯 Key Benefits
Server is lighter → Focus on MAVLink + video, not audio logic
True deduplication → Client knows what it just played, skips repeats
Lower network traffic → Send battery value once, not audio data 10 times
Better UX → Client has 100ms latency control, not 100+ms network delay
Offline resilient → If server drops, client still has battery status
Scalability → One server → 100 clients, each handles their own audio
📊 Data Flow Examples
Battery Warning (Simple Status → Client)

Server broadcasts:{  "class": "telemetry",  "battery": 12,  "voltage": 3.4,  "current": 2.1,  "remaining": 8}Client receives:→ Checks: battery < 15?→ Checks: currentLoopingMessage !== "Battery low, warning"?→ If both true: speechSynthesisPlayer("Battery low, warning", true)
AI Advisor (Heavy Processing → Server)

User asks: "How's my drone?"Server:→ Process Mistral LLM (heavy)→ Generate custom response based on current state→ Send TTS to requesting client only{  "class": "tts_audio",  "text": "Battery at 12%, you have 8 minutes of flight time",  "audio": "<base64>"}
🔧 What Changes
Server Side

BEFORE:  MAVLink → audio_node decides → sends TTS 10xAFTER:  MAVLink → broadcast telemetry once → clients decide
Client Side

BEFORE:  Receive TTS → play (can't prevent duplicates)AFTER:  Receive telemetry → decide what TTS to queue → play once
❓ Special Cases
When Server SHOULD Send TTS
AI advisor response (user asked a question)
Arm/disarm confirmation
Critical pre-flight checks
Mission status updates
NOT routine battery/status alarms
When Client SHOULD Handle TTS
Battery warnings (routine status)
Flight mode changes
Geofence breaches
Signal loss alerts
Pre-computed safety warnings
My Recommendation
Move battery warning logic to client

Client receives battery telemetry
Client checks threshold and deduplicates locally
Server never sends "Battery low, warning" TTS
Keep server TTS for:

AI advisor only
User-requested voice responses
Complex situation analysis
Server broadcasts telemetry:

Lightweight JSON telemetry update every 100-500ms
Client subscribes and reacts in real-time
Result: Server load → 90% reduction in TTS messages, Client has true deduplication control, Cleaner separation of concerns.

Would you like me to implement this architecture change? I would:

Move battery warning to ai.js (triggered by telemetry updates)
Update socket_manager.py to broadcast raw telemetry instead of processing audio
Update audio_node.py to only handle AI advisor TTS (on-demand, not automatic)