#!/usr/bin/env python3
"""
Download openwakeword ONNX models
Run this to enable wake word detection for voice commands
"""

import os
import sys
import logging
import urllib.request
import shutil
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# List of pre-trained openwakeword models
# Try downloading from multiple sources (in order of preference)
MODELS = {
    "alexa_v0.1.onnx": [
        "https://github.com/thewh1teagle/openwakeword/releases/download/v0.5.0/alexa_v0.1.onnx",
        "https://github.com/thewh1teagle/openwakeword-onnx/releases/download/v0.5.0/alexa_v0.1.onnx",
    ],
    "hey_google_v0.1.onnx": [
        "https://github.com/thewh1teagle/openwakeword/releases/download/v0.5.0/hey_google_v0.1.onnx",
        "https://github.com/thewh1teagle/openwakeword-onnx/releases/download/v0.5.0/hey_google_v0.1.onnx",
    ],
    "hey_station_v0.1.onnx": [
        "https://github.com/thewh1teagle/openwakeword/releases/download/v0.5.0/hey_station_v0.1.onnx",
        "https://github.com/thewh1teagle/openwakeword-onnx/releases/download/v0.5.0/hey_station_v0.1.onnx",
    ],
    "timer_v0.1.onnx": [
        "https://github.com/thewh1teagle/openwakeword/releases/download/v0.5.0/timer_v0.1.onnx",
        "https://github.com/thewh1teagle/openwakeword-onnx/releases/download/v0.5.0/timer_v0.1.onnx",
    ],
}

def get_models_directory():
    """Get the openwakeword models directory."""
    try:
        import openwakeword
        models_dir = Path(openwakeword.__file__).parent / "resources" / "models"
        return models_dir
    except ImportError:
        logger.error("❌ openwakeword not installed. Install with:")
        logger.error("   pip install openwakeword")
        return None

def download_models(models_to_download=None):
    """Download openwakeword ONNX models."""
    
    models_dir = get_models_directory()
    if not models_dir:
        return False
    
    # Create directory if needed
    models_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"📁 Models directory: {models_dir}")
    logger.info("")
    
    if models_to_download is None:
        models_to_download = MODELS
    
    all_success = True
    failed_models = []
    
    for model_name, urls in models_to_download.items():
        model_path = models_dir / model_name
        
        if model_path.exists():
            size_mb = model_path.stat().st_size / (1024 * 1024)
            logger.info(f"✅ {model_name} ({size_mb:.1f} MB) - already exists")
            continue
        
        logger.info(f"📥 Downloading {model_name}...")
        
        success = False
        last_error = None
        
        # Try each URL as fallback
        for url in urls:
            try:
                def progress_hook(block_num, block_size, total_size):
                    """Display download progress."""
                    downloaded = block_num * block_size
                    percent = min(100, int(100 * downloaded / total_size))
                    bar_length = 30
                    filled = int(bar_length * downloaded / total_size)
                    bar = "█" * filled + "░" * (bar_length - filled)
                    
                    if downloaded < total_size:
                        mb_done = downloaded / (1024 * 1024)
                        mb_total = total_size / (1024 * 1024)
                        print(f"\r  {bar} {percent}% ({mb_done:.1f}MB/{mb_total:.1f}MB)", end="", flush=True)
                    else:
                        mb_total = total_size / (1024 * 1024)
                        print(f"\r  {bar} 100% ({mb_total:.1f}MB/{mb_total:.1f}MB)", flush=True)
                
                urllib.request.urlretrieve(url, model_path, progress_hook)
                
                if model_path.exists():
                    size_mb = model_path.stat().st_size / (1024 * 1024)
                    logger.info(f"✅ Downloaded {model_name} ({size_mb:.1f} MB)")
                    success = True
                    break
                    
            except Exception as e:
                last_error = str(e)
                logger.debug(f"  Failed URL: {url} ({e})")
        
        if not success:
            logger.error(f"❌ Failed to download {model_name}")
            if last_error:
                logger.error(f"   Last error: {last_error}")
            failed_models.append((model_name, urls))
            all_success = False
    
    # Provide manual download links for failed models
    if failed_models:
        logger.info("")
        logger.info("❌ Some models failed to download. Manual download:")
        logger.info("")
        for model_name, urls in failed_models:
            logger.info(f"{model_name}:")
            for i, url in enumerate(urls, 1):
                logger.info(f"  Option {i}: {url}")
            logger.info(f"  Save to: {models_dir / model_name}")
            logger.info("")
    
    return all_success

def verify_installation():
    """Verify that models are installed and readable."""
    try:
        from openwakeword.model import Model as WakeModel
        logger.info("")
        logger.info("🔍 Testing wake word model initialization...")
        
        try:
            model = WakeModel(inference_framework="onnx")
            logger.info(f"✅ Wake word model initialized successfully")
            logger.info(f"   Available models: {list(model.models.keys())}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize model: {e}")
            return False
            
    except ImportError:
        logger.error("❌ openwakeword library not available")
        return False

def main():
    """Run the setup."""
    logger.info("=" * 70)
    logger.info("🎙️ OPENWAKEWORD MODELS SETUP")
    logger.info("=" * 70)
    logger.info("")
    
    models_dir = get_models_directory()
    if not models_dir:
        return 1
    
    logger.info("Available models:")
    for model_name in MODELS:
        logger.info(f"  • {model_name}")
    logger.info("")
    logger.info(f"Target directory: {models_dir}")
    logger.info("")
    
    success = download_models()
    
    logger.info("")
    logger.info("=" * 70)
    
    if success:
        if verify_installation():
            logger.info("✅ Wake word models are ready!")
            logger.info("   You can now use voice command features in the drone station")
            logger.info("")
            logger.info("Restart the application to enable voice commands:")
            logger.info("  python main.py")
            return 0
        else:
            logger.error("❌ Models downloaded but failed to initialize")
            return 1
    else:
        logger.error("❌ Some models failed to download")
        logger.info("")
        logger.info("OPTIONS:")
        logger.info("")
        logger.info("1️⃣  Manual Download:")
        logger.info(f"   Place .onnx files into: {models_dir}")
        logger.info("")
        logger.info("2️⃣  Skip Voice Commands:")
        logger.info("   The drone station works fine without voice commands")
        logger.info("   Press Ctrl+C above to continue without voice support")
        logger.info("")
        logger.info("3️⃣  Retry:")
        logger.info("   python setup_wake_word.py")
        return 1

if __name__ == "__main__":
    sys.exit(main())
