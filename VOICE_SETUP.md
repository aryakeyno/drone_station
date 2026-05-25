# 🎤 Voice Commands Setup Guide

The Drone Station includes optional voice command features using wake word detection and speech-to-text.

## Quick Answer: Where to Download Models

**Models Directory:**
```
C:\Python314\Lib\site-packages\openwakeword\resources\models
```

**What You Need:**
- `alexa_v0.1.onnx` (~1 MB)
- `hey_google_v0.1.onnx` (~1 MB)  
- `hey_station_v0.1.onnx` (~1 MB)
- `timer_v0.1.onnx` (~1 MB)

Total: ~4 MB

## Setup Options

### Option A: Automatic Download (Recommended)

```bash
python setup_wake_word.py
```

This script will:
1. Try multiple download sources
2. Place models in the correct directory
3. Verify installation

### Option B: Manual Download

If automated download fails, you can manually download and place the files:

1. **Find your openwakeword directory:**
   ```bash
   python -c "import openwakeword; import os; print(os.path.join(os.path.dirname(openwakeword.__file__), 'resources', 'models'))"
   ```

2. **Create models directory if needed:**
   ```bash
   mkdir -p C:\Python314\Lib\site-packages\openwakeword\resources\models
   ```

3. **Download models from GitHub:**
   - https://github.com/thewh1teagle/openwakeword/releases
   - Look for release v0.5.0 or latest
   - Download: `alexa_v0.1.onnx`, `hey_google_v0.1.onnx`, `hey_station_v0.1.onnx`, `timer_v0.1.onnx`

4. **Place in models directory:**
   ```
   C:\Python314\Lib\site-packages\openwakeword\resources\models\
   ├── alexa_v0.1.onnx
   ├── hey_google_v0.1.onnx
   ├── hey_station_v0.1.onnx
   └── timer_v0.1.onnx
   ```

5. **Restart the application:**
   ```bash
   python main.py
   ```

### Option C: Skip Voice Commands (Recommended if downloads fail)

**Voice commands are optional.** The drone station works great without them!

If you can't download the models:
1. Just skip this step
2. Run: `python main.py`
3. The app starts normally without voice support
4. You can control the drone via:
   - Web UI (keyboard, mouse)
   - Joystick/gamepad
   - Manual MAVLink commands

## Verification

After setup, check if voice commands are available:

```bash
python main.py
```

Look for this in startup logs:
```
✅ Wake word model loaded          # Models ready - voice commands enabled
⚠️  Wake word model not available   # Models missing - voice commands disabled
```

Both cases are fine! The app works with or without voice support.

## What You Get When Enabled

With voice commands enabled, you can:

1. **Wake Word Detection** - Say "Hey Station" to activate
2. **Speech Recognition** - Whisper AI model transcribes your speech
3. **Intent Parsing** - Mistral LLM understands drone commands
4. **Confirmation** - AI asks for verbal confirmation for critical commands (arm, takeoff)

**Example voice command:**
```
"Hey Station" → [listening beep]
"Take off to 50 meters"
"Confirm: takeoff to 50 meters. Say yes to proceed."
"Yes"
→ Drone takes off
```

## Requirements for Voice Commands

### Required Files:
- ONNX models (this guide) - ~4 MB
- Whisper model - auto-downloads on first use (~140 MB)

### Required Hardware:
- Microphone connected and working
- Flight controller (MAVLink)

### Required Software:
- Mistral LLM running locally

**Start Mistral:**
```bash
ollama run mistral
```

(Requires [Ollama](https://ollama.ai) installed)

### Optional:
- GPT-compatible API endpoint instead of local Mistral

## Troubleshooting

### "Wake word model not available" warning
- Models not found or download failed
- Run: `python setup_wake_word.py` to retry
- Or manually download and place files (Option B above)
- If both fail, voice commands will just be disabled (app still works!)

### Voice commands don't work
Check in order:
1. Microphone connected: `Test in Windows Settings → Sound`
2. Models downloaded: Look in `C:\Python314\Lib\site-packages\openwakeword\resources\models`
3. Mistral running: `ollama run mistral` in another terminal
4. Check logs for errors

### Download keeps failing
- Check internet connection
- Try manual download (Option B)
- The GitHub release might have moved - check: https://github.com/thewh1teagle/openwakeword/releases

### Memory issues
Wake word detection uses ~50-100 MB RAM. If your system is low on memory:
- Close other applications
- Or skip voice commands entirely (they're optional!)

## Performance Notes

Voice command processing:
- Wake word detection: ~10 ms per chunk (low CPU)
- Speech recognition: ~2-3 seconds for typical phrase
- Intent parsing: ~1-2 seconds (depends on Mistral)
- Total latency: ~3-5 seconds after saying the command

## Alternative: Text Commands

If voice commands don't work, you can still:
1. Use the web UI (chat interface)
2. Type commands instead of speaking
3. Use joystick/gamepad for drone control

Voice is optional - use whatever works best for you! 🚁
