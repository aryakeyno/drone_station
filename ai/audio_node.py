# pip install edge-tts
import asyncio
import base64
import io
import logging
import os
import edge_tts


logger = logging.getLogger(__name__)

# Best neural voices — swap to any from: edge-tts --list-voices
VOICE       = "en-US-AriaNeural"     # very natural female
VOICE_RATE  = "+0%"                  # speed: "-10%" slower, "+10%" faster
VOICE_PITCH = "+0Hz"


class AIAudioNode:
    def __init__(self, mavlink_node, ws_manager=None):
        self.mavlink    = mavlink_node
        self.ws_manager = ws_manager   # needed to broadcast TTS audio back
        self._kokoro = None        # Lazy-loaded when needed
        self._kokoro_available = os.path.exists("voices.bin")
        self._voice  = "af_heart"   # voices: af_heart, af_bella, am_adam, bf_emma, bm_george
        
        if self._kokoro_available:
            logger.info("✅ AIAudioNode initialised (edge-tts + Kokoro TTS)")
        else:
            logger.warning(
                "⚠️  AIAudioNode initialised (edge-tts only - Kokoro voices not found)\n"
                "   To enable Kokoro TTS with local voices, run:\n"
                "   python setup_kokoro.py"
            )
    
    def _ensure_kokoro_loaded(self):
        """Lazy-load Kokoro on first use."""
        if self._kokoro is not None:
            return True
        
        if not self._kokoro_available:
            logger.error("Kokoro TTS not available - voices.bin not found")
            return False
        
        try:
            from kokoro_onnx import Kokoro
            self._kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
            logger.info("✅ Kokoro TTS loaded")
            return True
        except Exception as exc:
            logger.error(f"❌ Failed to load Kokoro TTS: {exc}")
            self._kokoro_available = False
            return False

    async def listen_loop(self):
        """Background task — keeps the node alive for future voice commands."""
        logger.info("Audio listen loop started")
        while True:
            await asyncio.sleep(1)
            # TODO: add speech recognition (e.g. faster-whisper)

    async def synthesise(self, text: str) -> bytes:
        """
        Call Microsoft's Edge TTS service; return raw MP3 bytes.
        Uses edge_tts.Communicate which streams chunks and collects them.

        import io, soundfile as sf
                samples, sr = self._kokoro.create(text, voice=self._voice,
                                                speed=1.0, lang="en-us")
                buf = io.BytesIO()
                sf.write(buf, samples, sr, format="WAV")
                return buf.getvalue()   # WAV bytes → send as base64 like edge-tts path


        """
        communicate = edge_tts.Communicate( text, VOICE, rate=VOICE_RATE, pitch=VOICE_PITCH )
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        buf.seek(0)
        return buf.read()

    async def handle_tts_request(self, text: str, loop: bool, websocket) -> None:
        """
        Called by socket_manager when a tts_request command arrives.
        Synthesises audio and sends it back to the requesting client only.
        """
        try:
            mp3_bytes = await self.synthesise(text)
            audio_b64 = base64.b64encode(mp3_bytes).decode()
            await websocket.send_json({
                "class": "tts_audio",
                "text":  text,
                "loop":  loop,
                "audio": audio_b64,
            })
          #  logger.info(f"TTS sent: '{text[:40]}…'  ({len(mp3_bytes)} bytes)") #---------------------adio log
        except Exception as exc:
            logger.error(f"TTS synthesis failed: {exc}")
            await websocket.send_json({
                "class":   "error",
                "message": f"TTS failed: {exc}",
            })