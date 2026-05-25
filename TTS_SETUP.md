# 🎤 Text-to-Speech (TTS) Setup Guide

The Drone Station includes optional Kokoro TTS (local voice synthesis) features.

## Default Setup (No Kokoro)

The system uses **Microsoft Edge TTS** by default, which works out-of-the-box:
- ✅ No additional files needed
- ✅ High-quality neural voices
- ✅ Requires internet connection (streaming voices)

## Optional: Local Kokoro TTS

For **offline voice synthesis** with local models:

### 1. Download Voices File

Run the setup script:
```bash
python setup_kokoro.py
```

This will:
- Download `voices.bin` (~77 MB) from GitHub
- Place it in the drone_station directory
- Enable local Kokoro TTS support

### 2. Manual Download (if needed)

If the automatic download fails:

```bash
# On Windows (PowerShell):
$url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
(New-Object System.Net.WebClient).DownloadFile($url, "voices.bin")

# On macOS/Linux:
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Then place `voices.bin` in the drone_station directory (same folder as `main.py`).

## Verification

Check your setup:
```bash
# Test cameras (optional)
python diagnose_cameras.py

# Download Kokoro voices (optional)
python setup_kokoro.py

# Start the application
python main.py
```

If you see these in the startup logs:
- ✅ `AIAudioNode initialised (edge-tts + Kokoro TTS)` → Full setup
- ⚠️ `AIAudioNode initialised (edge-tts only - Kokoro voices not found)` → Edge-tts only

Both are functional - it's just a matter of whether you want offline voice synthesis.

## Troubleshooting

### "Kokoro voices not found" warning
- Not a critical error - the app will still work with Edge TTS
- To enable Kokoro: `python setup_kokoro.py`

### Download fails with network error
- Check your internet connection
- Try manual download steps above
- The app still works without Kokoro (uses Edge TTS instead)

### "FileNotFoundError: voices.bin"
- This should no longer happen - AIAudioNode now handles missing voices gracefully
- If it does occur, run: `python setup_kokoro.py`

## Available Voices (if Kokoro enabled)

- `af_heart` (Female, warm)
- `af_bella` (Female, bright)  
- `am_adam` (Male, deep)
- `bf_emma` (Female, energetic)
- `bm_george` (Male, calm)

## Performance Notes

- **Edge TTS**: Requires internet, lower latency (~1-2 sec), highest quality
- **Kokoro TTS**: Offline, local models, variable latency (~2-5 sec)
