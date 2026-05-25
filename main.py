import asyncio
import logging
import uvicorn
from fastapi import FastAPI
from contextlib import asynccontextmanager

from vision.camera_node import CameraNode
from config.settings import config
from gui.startup import launch_config_gui
from hardware.mavlink_node import MavlinkNode
from hardware.joystick_node import JoystickNode
from server.socket_manager import ConnectionManager
from ai.audio_node import AIAudioNode
from server.web_app import create_web_app


# Configure logging
logging.basicConfig( level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger("Main")

# ============================================================================
# 1. LAUNCH GUI FIRST (lightweight, user configures hardware + AI features)
# ============================================================================
logger.info("=" * 70)
logger.info("🚀 DRONE STATION STARTUP")
logger.info("=" * 70)
logger.info("")
logger.info("Launching configuration GUI…")
launch_config_gui()

logger.info("")
logger.info("Configuration selected:")
logger.info(f"  COM Port  : {config.com_port}")
logger.info(f"  Cameras   : {config.camera_ids}  (enabled={config.camera_enabled})")
logger.info(f"  Layout    : {config.camera_layout}")
logger.info(f"  Output    : {config.composite_width}×{config.composite_height}")
logger.info(f"  Joystick  : {config.joystick_id}")
logger.info(f"  Theme     : {config.ui_theme}")
logger.info("")
logger.info("AI Features:")
logger.info(f"  Voice Commands: {config.voice_commands_enabled}")
logger.info(f"  Wake Word     : {config.wake_word_enabled}")
logger.info(f"  YOLO Detection: {config.yolo_detection_enabled}")
logger.info(f"  AI Advisor    : {config.ai_advisor_enabled}")
logger.info("")

# ============================================================================
# 2. INITIALIZE COMPONENTS (only those selected by user)
# ============================================================================
logger.info("Initializing components…")

ws_manager   = ConnectionManager()
mavlink_node = MavlinkNode(config.com_port, config.baud_rate, ws_manager)
joy_node     = JoystickNode(config.joystick_id, mavlink_node, ws_manager)
ai_audio     = AIAudioNode(mavlink_node)
camera_node  = CameraNode(
                            ws_manager          =ws_manager,
                            camera_ids          =config.camera_ids,
                            enabled             =config.camera_enabled,
                            yolo_model_path     =config.yolo_model_path,
                            layout              =config.camera_layout,
                            composite_width     =config.composite_width,
                            composite_height    =config.composite_height,
                            layout_main_ratio   =config.layout_main_ratio,   
                        )
if config.yolo_detection_enabled and config.ai_advisor_enabled is False:
    # Only pre-load YOLO if user explicitly enabled it without AI advisor
    # (AI advisor enables it separately via toggle_detection)
    camera_node.load_model()
# ── Optional: AI Advisor (heavy model) ────────────────────────────────────
ai_node = None
if config.ai_advisor_enabled:
    logger.info("  Loading AI Advisor…")
    from ai.ai_node import AINode
    ai_node = AINode(mavlink_node, camera_node, ws_manager)
    # Cross-wire camera detections to advisor
    camera_node.ai_node = ai_node
else:
    logger.info("  ⏭️  AI Advisor disabled")

# ── Optional: Voice Commands (heavy models) ──────────────────────────────
voice_cmd = None
if config.voice_commands_enabled:
    logger.info("  Loading Voice Commander…")
    from ai.voice_commander import VoiceCommander
    voice_cmd = VoiceCommander(mavlink_node, ai_audio, ws_manager)
else:
    logger.info("  ⏭️  Voice Commander disabled")

logger.info("✅ Component initialization complete")


# ============================================================================
# 3. LIFESPAN CONTEXT MANAGER
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:  open hardware connections, start all background tasks.
    Shutdown: cancel all tasks and release resources.
    """
    logger.info("")
    logger.info("=" * 70)
    logger.info("🚀 STARTING GROUND CONTROL STATION")
    logger.info("=" * 70)

    tasks = [
        asyncio.create_task(mavlink_node.connect(),    name="MAVLink-Connect"),
        asyncio.create_task(mavlink_node.read_loop(),  name="MAVLink-ReadLoop"),
        asyncio.create_task(joy_node.poll_loop(),      name="Joystick-Poll"),
        asyncio.create_task(ai_audio.listen_loop(),    name="Audio-Listen"),
        asyncio.create_task(camera_node.start(),       name="Camera-Compositor"),
    ]

    # Optional tasks
    if ai_node is not None:
        tasks.append(asyncio.create_task(ai_node.advisor_loop(), name="AI-Advisor"))
    
    if voice_cmd is not None:
        tasks.append(asyncio.create_task(voice_cmd.listen_loop(), name="Voice-Commander"))

    logger.info(f"✅ Started {len(tasks)} background tasks:")
    logger.info(f"   ✓ MAVLink     : {config.com_port} @ {config.baud_rate} baud")
    logger.info(f"   ✓ Joystick    : ID {config.joystick_id}")
    logger.info(f"   ✓ Cameras     : {config.camera_ids}  (enabled={config.camera_enabled})")
    logger.info(f"   ✓ Layout      : {config.camera_layout}  {config.composite_width}×{config.composite_height}")
    if ai_node is not None:
        logger.info(f"   ✓ AI Advisor  : ENABLED")
    if voice_cmd is not None:
        logger.info(f"   ✓ Voice Cmd   : ENABLED")
    logger.info(f"   ✓ WS Port     : {config.websocket_port}")
    logger.info(f"   ✓ UI Theme    : {config.ui_theme}")

    yield   # ← server runs here

    logger.info("=" * 70)
    logger.info("🛑 SHUTTING DOWN DRONE STATION")
    logger.info("=" * 70)

    for task in tasks:
        logger.info(f"  Stopping {task.get_name()} …")
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("✅ All systems shut down cleanly")


# ============================================================================
# 4. MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    try:
        # Warn if cameras are enabled but list is empty
        if config.camera_enabled and not config.camera_ids:
            logger.warning(
                "⚠️  CAMERA ENABLED BUT NO CAMERAS SELECTED!\n"
                "   The system will start, but no camera frames will be available.\n"
                "   If cameras are connected, run: python diagnose_cameras.py"
            )

        # Build FastAPI app
        logger.info("")
        logger.info("Creating FastAPI application…")
        app = create_web_app(
                            ws_manager      =ws_manager,
                            mavlink_node    =mavlink_node,
                            camera_node     =camera_node,
                            ai_node         =ai_node,
                            ai_audio        =ai_audio,
                            lifespan        =lifespan,
                        )

        # Start server
        logger.info("")
        logger.info("=" * 70)
        logger.info("🌐 STARTING WEB SERVER")
        logger.info(f"   Access Station at: http://localhost:8765")
        logger.info("=" * 70)
        logger.info("")

        uvicorn.run(
            app,
            host="127.0.0.1",
            port=config.websocket_port,
            log_level="info",
        )

    except KeyboardInterrupt:
        logger.info("🛑 Server interrupted by user")
    except Exception as exc:
        logger.error(f"❌ Fatal error: {exc}", exc_info=True)
        exit(1)