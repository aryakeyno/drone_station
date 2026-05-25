# ai/ai_node.py
import asyncio
import json
import logging
import time
from collections import deque
from typing import Optional
import httpx   # pip install httpx

logger = logging.getLogger(__name__)

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "mistral:instruct"   # or phi3:mini for low-RAM systems

# System prompt — keeps the LLM focused on flight ops
SYSTEM_PROMPT = """You are a flight safety advisor for a PX4 quadcopter ground station.
You receive real-time telemetry and computer vision data.
Respond ONLY with a JSON object in this exact schema:
{
  "priority": 1-10,
  "advice": "short operator message (max 20 words)",
  "detail": "optional longer explanation",
  "alert": true/false
}
Priority 8-10 = safety critical. Be concise. Never invent data not given."""


class AINode:
    def __init__(self, mavlink_node, camera_node, ws_manager):
        self.mavlink    = mavlink_node
        self.camera     = camera_node
        self.ws_manager = ws_manager

        # Rolling telemetry window — last 30 readings
        self._telem_window: deque = deque(maxlen=30)
        self._last_advice_time    = 0.0
        self._advice_interval     = 10.0   # seconds between unprompted advice
        self._http                = httpx.AsyncClient(timeout=15.0)

        logger.info("AINode initialised")

    # ── Feed telemetry in (called by mavlink_node after each parse) ───────────
    def ingest_telemetry(self, data: dict):
        """Call this from mavlink_node._parse_mavlink_message() with the dict."""
        self._telem_window.append({
            "t":   time.time(),
            "msg": data
        })

    # ── Feed detections in (called by camera compositor) ─────────────────────
    def ingest_detections(self, detections: list[dict]):
        """Call from camera_node after each YOLO inference."""
        self._latest_detections = detections   # [{label, confidence, bbox}, ...]

    # ── Background loop ───────────────────────────────────────────────────────
    async def advisor_loop(self):
        logger.info("AI advisor loop started")
        while True:
            await asyncio.sleep(2.0)
            if not getattr(self, 'autopilot_active', False):
                continue   # paused — Tier 2 is off
            now = time.time()
            if now - self._last_advice_time >= self._advice_interval:
                await self._run_advisor()
                self._last_advice_time = now

    async def _run_advisor(self):
        snapshot = self._build_snapshot()
        if not snapshot:
            return
        try:
            response = await self._query_llm(snapshot)
            if response:
                await self._broadcast_advice(response)
        except Exception as exc:
            logger.error(f"AI advisor error: {exc}")

    def _build_snapshot(self) -> Optional[dict]:
        """Summarise telemetry window into a compact dict for the prompt."""
        if not self._telem_window:
            return None
        # Extract latest values for key fields
        latest = {}
        for entry in self._telem_window:
            latest.update(entry["msg"])  # later entries overwrite earlier

        detections = getattr(self, "_latest_detections", [])
        return {
            "flight_mode":  latest.get("HEARTBEAT_custom_mode"),
            "armed":        latest.get("HEARTBEAT_base_mode", 0) & 128,
            "battery_pct":  latest.get("BATTERY_STATUS_battery_remaining"),
            "altitude_m":   latest.get("VFR_HUD_alt"),
            "groundspeed":  latest.get("VFR_HUD_groundspeed"),
            "gps_fix":      latest.get("GPS_RAW_INT_fix_type"),
            "satellites":   latest.get("GPS_RAW_INT_satellites_visible"),
            "roll_deg":     latest.get("ATTITUDE_roll"),
            "pitch_deg":    latest.get("ATTITUDE_pitch"),
            "objects_seen": [d["label"] for d in detections[:5]],
        }

    async def _query_llm(self, snapshot: dict) -> Optional[dict]:
        prompt = f"Current flight data:\n{json.dumps(snapshot, indent=2)}\n\nProvide advice."
        body   = {
            "model":  OLLAMA_MODEL,
            "prompt": prompt,
            "system": SYSTEM_PROMPT,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 120}
        }
        r = await self._http.post(OLLAMA_URL, json=body)
        r.raise_for_status()
        text = r.json().get("response", "")
        return json.loads(text)

    async def _broadcast_advice(self, advice: dict):
        msg = {
            "class":    "ai_advice",
            "priority": advice.get("priority", 1),
            "advice":   advice.get("advice", ""),
            "detail":   advice.get("detail", ""),
            "alert":    advice.get("alert", False),
        }
        await self.ws_manager.broadcast(msg)
        logger.info(f"AI advice (pri={msg['priority']}): {msg['advice']}")

    # ── On-demand query (from WS command ask_ai) ──────────────────────────────
    async def answer_question(self, question: str, websocket) -> None:
        snapshot  = self._build_snapshot() or {}
        prompt    = (f"Flight data: {json.dumps(snapshot)}\n"
                     f"Operator question: {question}")
        body = {
            "model":  OLLAMA_MODEL,
            "prompt": prompt,
            "system": SYSTEM_PROMPT,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 150}
        }
        try:
            r = await self._http.post(OLLAMA_URL, json=body)
            advice = json.loads(r.json().get("response", "{}"))
            await websocket.send_json({"class": "ai_advice", **advice})
        except Exception as exc:
            await websocket.send_json({"class": "error", "message": str(exc)})