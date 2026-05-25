#!/usr/bin/env python3
"""
System health check and setup verification
Run this to diagnose any startup issues
"""

import os
import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def check_python_version():
    """Check Python version."""
    version = sys.version_info
    required = (3, 8)
    
    if version >= required:
        logger.info(f"✅ Python {version.major}.{version.minor}.{version.micro} (required: {required[0]}.{required[1]}+)")
        return True
    else:
        logger.error(f"❌ Python {version.major}.{version.minor}.{version.micro} (required: {required[0]}.{required[1]}+)")
        return False

def check_required_files():
    """Check for required files and directories."""
    required = [
        "main.py",
        "config/settings.py",
        "gui/startup.py",
        "server/web_app.py",
        "hardware/mavlink_node.py",
        "hardware/joystick_node.py",
        "vision/camera_node.py",
        "ai/audio_node.py",
        "platformio.ini",
    ]
    
    all_exist = True
    for file in required:
        exists = os.path.exists(file)
        status = "✅" if exists else "❌"
        logger.info(f"{status} {file}")
        if not exists:
            all_exist = False
    
    return all_exist

def check_dependencies():
    """Check if required Python packages are installed."""
    dependencies = {
        "fastapi": "FastAPI web framework",
        "uvicorn": "ASGI server",
        "opencv": "cv2: Computer vision",
        "numpy": "Numerical computing",
        "pygame": "pygame-ce: Joystick input",
        "edge_tts": "Microsoft Edge TTS",
        "websockets": "WebSocket support",
    }
    
    all_installed = True
    for package, description in dependencies.items():
        try:
            __import__(package)
            logger.info(f"✅ {package:<20} ({description})")
        except ImportError:
            logger.error(f"❌ {package:<20} ({description})")
            all_installed = False
    
    return all_installed

def check_optional_features():
    """Check for optional features."""
    logger.info("")
    logger.info("Optional Features:")
    
    # Kokoro TTS
    kokoro_model = os.path.exists("kokoro-v0_19.onnx")
    kokoro_voices = os.path.exists("voices.bin")
    kokoro_lib = False
    try:
        __import__("kokoro_onnx")
        kokoro_lib = True
    except ImportError:
        pass
    
    if kokoro_voices and kokoro_model and kokoro_lib:
        logger.info("✅ Kokoro TTS (local voice synthesis)")
    else:
        missing = []
        if not kokoro_lib:
            missing.append("kokoro_onnx library")
        if not kokoro_model:
            missing.append("kokoro-v0_19.onnx model")
        if not kokoro_voices:
            missing.append("voices.bin")
        logger.info(f"⚠️  Kokoro TTS (missing: {', '.join(missing)})")
        logger.info(f"    To enable: python setup_kokoro.py")
    
    # Wake word detection
    wake_lib = False
    wake_models = False
    try:
        import openwakeword
        wake_lib = True
        models_dir = os.path.join(
            os.path.dirname(openwakeword.__file__),
            "resources", "models"
        )
        wake_models = os.path.exists(models_dir) and any(
            f.endswith('.onnx') for f in os.listdir(models_dir)
        )
    except (ImportError, FileNotFoundError):
        pass
    
    if wake_lib and wake_models:
        logger.info("✅ Wake word detection (voice commands available)")
    else:
        missing = []
        if not wake_lib:
            missing.append("openwakeword library")
        if not wake_models:
            missing.append("ONNX model files")
        logger.info(f"⚠️  Wake word detection (missing: {', '.join(missing)})")
        logger.info(f"    To enable: python setup_wake_word.py")
    
    # Cameras
    try:
        import cv2
        logger.info("✅ Camera support (OpenCV available)")
    except ImportError:
        logger.warning("⚠️  Camera support (OpenCV not available)")
    
    # Faster-Whisper (speech-to-text)
    try:
        __import__("faster_whisper")
        logger.info("✅ Speech-to-text (Faster-Whisper available)")
    except ImportError:
        logger.info("⏳ Speech-to-text (Faster-Whisper - will download on first use)")

def main():
    """Run all checks."""
    logger.info("=" * 70)
    logger.info("🚁 DRONE STATION SYSTEM CHECK")
    logger.info("=" * 70)
    logger.info("")
    
    logger.info("Environment:")
    py_ok = check_python_version()
    
    logger.info("")
    logger.info("Required Files:")
    files_ok = check_required_files()
    
    logger.info("")
    logger.info("Dependencies:")
    deps_ok = check_dependencies()
    
    check_optional_features()
    
    logger.info("")
    logger.info("=" * 70)
    
    if py_ok and files_ok and deps_ok:
        logger.info("✅ All required components OK - Ready to launch!")
        logger.info("")
        logger.info("Start the application:")
        logger.info("  python main.py")
        return 0
    else:
        logger.info("❌ Some components are missing")
        logger.info("")
        logger.info("Install missing packages:")
        logger.info("  pip install -r requirements.txt")
        return 1

if __name__ == "__main__":
    sys.exit(main())
