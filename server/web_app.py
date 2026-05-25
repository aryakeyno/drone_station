import json
import logging
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
import aiofiles

logger = logging.getLogger(__name__)

BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

def create_web_app(ws_manager, mavlink_node, camera_node=None, ai_node=None, ai_audio=None, lifespan=None):
    """
    Create and configure the FastAPI application.

    Video endpoints
    ───────────────
    GET /video              → composite MJPEG stream  (all cameras merged)
    GET /video/{cam_id}     → individual MJPEG stream for one camera
    GET /api/camera/frame   → single composite JPEG snapshot
    GET /api/camera/frame/{cam_id} → single JPEG snapshot for one camera
    """
    app = FastAPI(
        title="Drone Station Web Server",
        description="Ground Control Station for PX4 Drones",
        version="2.0.0",
        lifespan=lifespan,
    )

    # ========================================================================
    # WEBSOCKET
    # ========================================================================

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    request = json.loads(data)
                    await ws_manager.handle_incoming_command(
                                                                request         =request,
                                                                websocket       =websocket,
                                                                mavlink_node    =mavlink_node,
                                                                camera_node     =camera_node,
                                                                ai_audio        =ai_audio,
                                                                ai_node         =ai_node,
                                                            )
                except json.JSONDecodeError:
                    logger.debug("Received malformed JSON")
                except Exception as exc:
                    logger.error(f"WebSocket handler error: {exc}")
                    try:
                        await websocket.send_json(
                            {"class": "error", "message": f"Error: {exc}"}
                        )
                    except Exception:
                        pass
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)
        except Exception as exc:
            logger.error(f"WebSocket error: {exc}")
            ws_manager.disconnect(websocket)

    # ========================================================================
    # REST – status / info
    # ========================================================================

    @app.get("/api/health")
    async def health_check():
        return {
            "status": "ok",
            "server": "Drone Station Ground Control",
            "clients_connected": len(ws_manager.active_connections),
        }

    @app.get("/api/camera/info")
    async def get_camera_info():
        if camera_node is None:
            return {"error": "Camera not available"}
        return camera_node.get_camera_info()

    @app.get("/api/mavlink/status")
    async def get_mavlink_status():
        return {
            "connected": (
                mavlink_node.conn is not None
                if hasattr(mavlink_node, "conn") else False
            ),
            "port":      getattr(mavlink_node, "com_port",  "Unknown"),
            "baud_rate": getattr(mavlink_node, "baud_rate", "Unknown"),
        }

    # ========================================================================
    # VIDEO – composite MJPEG stream  (all cameras merged)
    # ========================================================================

    @app.get("/video")
    async def video_stream():
        """Stream the composite (all cameras) frame as MJPEG."""
        if camera_node is None or not camera_node.current_frame_jpeg:
            return {"error": "Camera not available"}

        async def frame_generator():
            while True:
                frame_data = camera_node.current_frame_jpeg
                if frame_data:
                    yield b"--frame\r\n"
                    yield b"Content-Type: image/jpeg\r\n"
                    yield (
                        b"Content-Length: "
                        + str(len(frame_data)).encode()
                        + b"\r\n\r\n"
                    )
                    yield frame_data
                    yield b"\r\n"
                await asyncio.sleep(0.01)

        return StreamingResponse(
            frame_generator(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    # ========================================================================
    # VIDEO – individual camera MJPEG stream
    # ========================================================================

    @app.get("/video/{cam_id}")
    async def video_stream_single(cam_id: int):
        """Stream a single camera's MJPEG feed."""
        if camera_node is None:
            return {"error": "Camera not available"}

        async def frame_generator():
            while True:
                frame_data = camera_node.latest_frames.get(cam_id)
                if frame_data:
                    yield b"--frame\r\n"
                    yield b"Content-Type: image/jpeg\r\n"
                    yield (
                        b"Content-Length: "
                        + str(len(frame_data)).encode()
                        + b"\r\n\r\n"
                    )
                    yield frame_data
                    yield b"\r\n"
                await asyncio.sleep(0.01)

        return StreamingResponse(
            frame_generator(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    # ========================================================================
    # SNAPSHOT endpoints
    # ========================================================================

    @app.get("/api/camera/frame")
    async def get_latest_frame():
        """Single JPEG snapshot of the composite view."""
        if camera_node is None or not camera_node.current_frame_jpeg:
            return {"error": "No frame available"}
        return Response(
            content=camera_node.current_frame_jpeg,
            media_type="image/jpeg",
        )

    @app.get("/api/camera/frame/{cam_id}")
    async def get_latest_frame_single(cam_id: int):
        """Single JPEG snapshot for one camera."""
        if camera_node is None:
            return {"error": "Camera not available"}
        frame = camera_node.latest_frames.get(cam_id)
        if not frame:
            return {"error": f"No frame available for camera {cam_id}"}
        return Response(content=frame, media_type="image/jpeg")

    # ========================================================================
    # STATIC FILE SERVING
    # ========================================================================

    @app.get("/")
    async def serve_index():
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if not os.path.exists(index_path):
            return {"error": "index.html not found", "frontend_dir": FRONTEND_DIR}
        return FileResponse(index_path)

    if os.path.exists(FRONTEND_DIR):

        @app.get("/{file_path:path}")
        async def serve_static(file_path: str):
            if file_path == "":
                file_path = "index.html"

            file_path_full = os.path.join(FRONTEND_DIR, file_path)

            # Security: prevent directory traversal
            if not os.path.abspath(file_path_full).startswith(
                os.path.abspath(FRONTEND_DIR)
            ):
                return {"error": "Access denied"}

            if os.path.isfile(file_path_full):
                return FileResponse(file_path_full)

            # SPA routing fallback
            index_path = os.path.join(FRONTEND_DIR, "index.html")
            if os.path.isfile(index_path):
                return FileResponse(index_path)

            return {"error": "File not found"}

    else:
        logger.error(f"⚠️  Frontend directory not found at {FRONTEND_DIR}")

    return app