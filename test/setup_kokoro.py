#!/usr/bin/env python3
"""
Download Kokoro TTS voices file
Run this to set up Kokoro voice synthesis for audio features
"""

import os
import sys
import urllib.request
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
VOICES_FILE = "voices.bin"
VOICES_SIZE_MB = 77  # Approximate size


def download_voices():
    """Download the Kokoro voices file."""
    if os.path.exists(VOICES_FILE):
        logger.info(f"✅ {VOICES_FILE} already exists")
        return True
    
    logger.info(f"📥 Downloading Kokoro voices from GitHub...")
    logger.info(f"   URL: {VOICES_URL}")
    logger.info(f"   Size: ~{VOICES_SIZE_MB} MB")
    logger.info("")
    
    try:
        def progress_hook(block_num, block_size, total_size):
            """Display download progress."""
            downloaded = block_num * block_size
            percent = min(100, int(100 * downloaded / total_size))
            bar_length = 40
            filled = int(bar_length * downloaded / total_size)
            bar = "█" * filled + "░" * (bar_length - filled)
            
            if downloaded < total_size:
                print(f"\r  {bar} {percent}% ({downloaded//1024//1024}MB/{total_size//1024//1024}MB)", end="", flush=True)
            else:
                print(f"\r  {bar} 100% ({total_size//1024//1024}MB/{total_size//1024//1024}MB)", flush=True)
        
        urllib.request.urlretrieve(VOICES_URL, VOICES_FILE, progress_hook)
        
        if os.path.exists(VOICES_FILE):
            size_mb = os.path.getsize(VOICES_FILE) / (1024 * 1024)
            logger.info(f"✅ Downloaded {VOICES_FILE} ({size_mb:.1f} MB)")
            return True
        else:
            logger.error(f"❌ Download failed - file not created")
            return False
            
    except Exception as e:
        logger.error(f"❌ Download failed: {e}")
        logger.info(f"\nManual download:")
        logger.info(f"  1. Open: {VOICES_URL}")
        logger.info(f"  2. Save as: {VOICES_FILE}")
        logger.info(f"  3. Place in: {os.path.abspath('.')}")
        return False


if __name__ == "__main__":
    logger.info("=" * 70)
    logger.info("🎤 KOKORO TTS VOICES SETUP")
    logger.info("=" * 70)
    logger.info("")
    
    success = download_voices()
    
    logger.info("")
    if success:
        logger.info("✅ Kokoro voices are ready!")
        logger.info("   You can now use text-to-speech features in the drone station")
        sys.exit(0)
    else:
        logger.info("❌ Setup incomplete")
        logger.info("   The drone station will still work, but TTS audio will use edge-tts only")
        sys.exit(1)
