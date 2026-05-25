# ai/voice_commander.py
import asyncio
import json
import logging
import os
import numpy as np
import sounddevice as sd        # pip install sounddevice
import httpx

from faster_whisper import WhisperModel          # pip install faster-whisper

logger = logging.getLogger(__name__)

SAMPLE_RATE  = 16000
CHUNK_FRAMES = 1280   # 80 ms at 16 kHz — openwakeword chunk size
WAKE_WORD    = "hey station"   # train custom or use built-in

INTENT_SYSTEM = """You are an intent parser for a drone ground station.
Given a voice command transcript, respond ONLY with JSON:
{
  "intent": "one of: arm|disarm|takeoff|land|goto|set_mode|hold|rtl|unknown",
  "params": {"altitude": null, "lat": null, "lon": null, "mode": null},
  "confidence": 0.0-1.0,
  "requires_confirm": true/false
}
requires_confirm=true for arm, takeoff, goto. false for hold, land, rtl."""

# Commands that always need a second verbal confirmation
CONFIRM_INTENTS = {"arm", "takeoff", "goto"}


class VoiceCommander:
    def __init__(self, mavlink_node, audio_node, ws_manager):
        self.mavlink    = mavlink_node
        self.audio      = audio_node
        self.ws_manager = ws_manager
        self._http      = httpx.AsyncClient(timeout=10.0)

        # Load models (blocking — call before lifespan starts)
        logger.info("Loading Whisper model…")
        self._whisper = WhisperModel("small.en", device="cpu",
                                      compute_type="int8")
        
        # Lazy-load wake word model — don't block startup if unavailable
        self._wake = None
        self._wake_available = self._check_wake_word_available()
        if self._wake_available:
            logger.info("Loading wake word model…")
            try:
                from openwakeword.model import Model as WakeModel
                self._wake = WakeModel(inference_framework="onnx")
                logger.info("✅ Wake word model loaded")
            except Exception as exc:
                logger.error(f"Failed to load wake word model: {exc}")
                self._wake_available = False
        else:
            logger.warning(
                "⚠️  Wake word model not available — voice commands disabled\n"
                "   To enable: python setup_wake_word.py"
            )

        self._pending_confirm: dict | None = None
        self._state = "idle"   # idle | listening | confirm
    
    def _check_wake_word_available(self) -> bool:
        """Check if openwakeword models exist."""
        try:
            import openwakeword
            models_path = os.path.join(
                os.path.dirname(openwakeword.__file__),
                "resources", "models"
            )
            # Check for at least one model file
            return os.path.exists(models_path) and any(
                f.endswith('.onnx') for f in os.listdir(models_path)
            )
        except (ImportError, FileNotFoundError):
            return False

    async def listen_loop(self):
        logger.info("🎙️ Voice commander loop started")
        loop = asyncio.get_event_loop()

        audio_q: asyncio.Queue = asyncio.Queue()

        def _audio_callback(indata, frames, time_info, status):
            loop.call_soon_threadsafe(
                audio_q.put_nowait, indata[:, 0].copy()
            )

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=CHUNK_FRAMES,
            callback=_audio_callback,
        ):
            logger.info("🎙️ Microphone open — waiting for wake word")
            while True:
                chunk = await audio_q.get()
                await self._process_chunk(chunk, audio_q)

    async def _process_chunk(self, chunk: np.ndarray, q: asyncio.Queue):
        # ── Wake word detection ───────────────────────────────────────────
        if self._state == "idle":
            if not getattr(self, 'autopilot_active', False):
                return   # ignore microphone when Tier 2 off
            if self._wake is not None:
                pred = self._wake.predict(chunk)
                if pred.get(WAKE_WORD, 0) > 0.5:
                    logger.info("🎙️ Wake word detected")
                    self._state = "listening"
                    await self.audio.play_response("Listening")
                    await self._collect_and_transcribe(q)
                    self._state = "idle"
            else:
                logger.debug("Wake word detection disabled (model unavailable)")

        # ── Confirmation response ─────────────────────────────────────────
        elif self._state == "confirm":
            # Collect a short utterance to check yes/no
            pcm = await self._collect_audio(q, seconds=2.0)
            text = self._transcribe(pcm).lower()
            if any(w in text for w in ("yes", "confirm", "affirmative", "go")):
                await self._execute(self._pending_confirm)
            else:
                await self.audio.play_response("Command cancelled")
                logger.info("🎙️ Command cancelled by operator")
            self._pending_confirm = None
            self._state = "idle"

    async def _collect_and_transcribe(self, q: asyncio.Queue):
        pcm  = await self._collect_audio(q, seconds=5.0)
        text = self._transcribe(pcm)
        if not text.strip():
            await self.audio.play_response("I didn't catch that")
            return

        logger.info(f"🎙️ Transcribed: '{text}'")
        await self.ws_manager.broadcast({"class": "voice_transcript", "text": text})

        intent = await self._parse_intent(text)
        if not intent or intent["intent"] == "unknown":
            await self.audio.play_response("Command not recognised")
            return

        if intent.get("requires_confirm") or intent["intent"] in CONFIRM_INTENTS:
            self._pending_confirm = intent
            self._state = "confirm"
            confirm_msg = self._describe_intent(intent)
            await self.audio.play_response(f"Confirm: {confirm_msg}. Say yes to proceed.")
        else:
            await self._execute(intent)

    async def _collect_audio(self, q: asyncio.Queue, seconds: float) -> np.ndarray:
        chunks = []
        n = int(seconds * SAMPLE_RATE / CHUNK_FRAMES)
        for _ in range(n):
            chunks.append(await q.get())
        return np.concatenate(chunks)

    def _transcribe(self, pcm: np.ndarray) -> str:
        segs, _ = self._whisper.transcribe(pcm, language="en",
                                            beam_size=1, vad_filter=True)
        return " ".join(s.text for s in segs).strip()

    async def _parse_intent(self, text: str) -> dict | None:
        body = {
            "model":   "mistral:instruct",
            "prompt":  f"Voice command: '{text}'",
            "system":  INTENT_SYSTEM,
            "format":  "json",
            "stream":  False,
            "options": {"temperature": 0.1, "num_predict": 80}
        }
        try:
            r = await self._http.post("http://localhost:11434/api/generate",
                                       json=body)
            return json.loads(r.json()["response"])
        except Exception as exc:
            logger.error(f"Intent parse error: {exc}")
            return None

    async def _execute(self, intent: dict):
        action = intent["intent"]
        params = intent.get("params", {})
        logger.info(f"🎙️ Executing intent: {action}  params={params}")
        await self.ws_manager.broadcast({
            "class": "voice_command_executed",
            "intent": action, "params": params
        })

        # ── Safety gate ───────────────────────────────────────────────────
        if action == "arm":
            if not self._safe_to_arm():
                await self.audio.play_response(
                    "Cannot arm: GPS fix not ready or battery low")
                return
            self.mavlink.send_command_long({
                "target_system": 1, "target_component": 1,
                "command": 400, "confirmation": 0,
                "param1": 1, "param2":0,"param3":0,"param4":0,
                "param5":0,"param6":0,"param7":0
            })
            await self.audio.play_response("Arming")

        elif action == "disarm":
            self.mavlink.send_command_long({
                "target_system":1,"target_component":1,
                "command":400,"confirmation":0,
                "param1":0,"param2":21196,
                "param3":0,"param4":0,"param5":0,"param6":0,"param7":0
            })
            await self.audio.play_response("Disarming")

        elif action == "takeoff":
            alt = float(params.get("altitude") or 10)
            self.mavlink.send_command_long({
                "target_system":1,"target_component":1,
                "command":22,"confirmation":0,
                "param1":0,"param2":0,"param3":0,"param4":0,
                "param5":0,"param6":0,"param7":alt
            })
            await self.audio.play_response(f"Taking off to {alt} metres")

        elif action == "land":
            self.mavlink.send_command_long({
                "target_system":1,"target_component":1,
                "command":21,"confirmation":0,
                "param1":0,"param2":0,"param3":0,"param4":0,
                "param5":0,"param6":0,"param7":0
            })
            await self.audio.play_response("Landing")

        elif action == "rtl":
            self.mavlink.send_command_long({
                "target_system":1,"target_component":1,
                "command":20,"confirmation":0,
                "param1":0,"param2":0,"param3":0,"param4":0,
                "param5":0,"param6":0,"param7":0
            })
            await self.audio.play_response("Return to launch")

        elif action == "hold":
            self.mavlink.send_command_long({
                "target_system":1,"target_component":1,
                "command":19,"confirmation":0,
                "param1":0,"param2":0,"param3":0,"param4":0,
                "param5":0,"param6":0,"param7":0
            })
            await self.audio.play_response("Holding position")

    def _safe_to_arm(self) -> bool:
        conn = self.mavlink.conn
        if conn is None:
            return False
        # Check GPS fix ≥ 3D and battery > 20%
        # (reads from mavlink_node's latest data — adjust to your attribute names)
        return True   # TODO: wire to actual telemetry state

    def _describe_intent(self, intent: dict) -> str:
        action = intent["intent"]
        params = intent.get("params", {})
        if action == "takeoff":
            return f"takeoff to {params.get('altitude', 10)} metres"
        if action == "goto":
            return f"fly to {params.get('lat')}, {params.get('lon')}"
        return action