import json
import logging
import time
import asyncio
from typing import List
from fastapi import WebSocket
from pymavlink import mavutil

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"✓ Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"✗ Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients concurrently"""
        if not self.active_connections:
            return
        
        try:
            msg_str = json.dumps(message)
        except Exception as e:
            logger.error(f"Failed to serialize broadcast message: {e}")
            return
        
        # Create a snapshot to avoid race conditions during concurrent modifications
        connections_snapshot = list(self.active_connections)
        
        if not connections_snapshot:
            return
        
        # Send to all clients concurrently instead of sequentially
        # This prevents one client from blocking others and avoids buffer backup
        async def send_to_connection(connection):
            try:
                # Use timeout to prevent hanging on slow connections
                await asyncio.wait_for(connection.send_text(msg_str), timeout=1.0)
                return None  # Success
            except asyncio.TimeoutError:
                logger.debug("Send timeout - connection too slow")
                return connection  # Mark as dead
            except (AssertionError, RuntimeError, ConnectionError, BrokenPipeError) as e:
                # WebSocket library internal errors or connection broken
                return connection  # Mark as dead
            except Exception as e:
                logger.debug(f"Send error: {type(e).__name__}")
                return connection  # Mark as dead
        
        # Send to all connections in parallel
        results = await asyncio.gather(
            *[send_to_connection(conn) for conn in connections_snapshot],
            return_exceptions=False
        )
        
        # Remove dead connections
        dead_connections = [conn for conn in results if conn is not None]
        for dead in dead_connections:
            if dead in self.active_connections:
                self.active_connections.remove(dead)
                logger.debug(f"Removed dead connection. Total: {len(self.active_connections)}")
        
        # Yield control to allow keepalive pings and other tasks to run
        await asyncio.sleep(0)

    async def handle_incoming_command(self, request: dict, websocket: WebSocket, mavlink_node, camera_node=None, ai_audio=None, ai_node=None):
        """
        Handle all incoming WebSocket commands from browser
        
        Args:
            request: Command dictionary
            websocket: WebSocket connection
            mavlink_node: MAVLink communication handler
            camera_node: Camera handler (optional)
        """
        
        if not isinstance(request, dict):
            await websocket.send_json({"class": "error", "message": "Invalid request"})
            return
        
        # ========== CAMERA CONTROL COMMANDS ==========
        
        # Toggle object detection
        if 'toggle_detection' in request:
            if camera_node is None:
                await websocket.send_json({ "class": "error", "message": "Camera not available" })
                return

            enable = request.get('toggle_detection', False)
            camera_id = request.get('camera_id', None)  # Optional: specific camera ID
            
            try:
                if camera_id is not None:
                    # Per-camera detection
                    camera_node.toggle_detection(enable, camera_id=camera_id)
                    # Send detection state update so client can update menu
                    await websocket.send_json({ 
                        "class": "camera_detection_update", 
                        "camera_id": camera_id,
                        "detection_enabled": enable,
                        "message": f"Camera {camera_id}: detection {'enabled' if enable else 'disabled'}" 
                    })
                else:
                    # Global detection (all cameras)
                    camera_node.toggle_detection(enable)
                    # Send detection state update so client can update menu
                    await websocket.send_json({ 
                        "class": "camera_detection_update", 
                        "camera_id": None,
                        "detection_enabled": enable,
                        "message": f"Object detection {'enabled' if enable else 'disabled'} (all cameras)" 
                    })
            except Exception as e:
                logger.error(f"Failed to toggle detection: {e}")
                await websocket.send_json({ "class": "error", "message": f"Failed to toggle detection: {str(e)}" })
            return
        
        # Get camera info
        if 'request_camera_info' in request:
            if camera_node is None:
                await websocket.send_json({
                    "class": "error",
                    "message": "Camera not available"
                })
                return
            
            camera_info = camera_node.get_camera_info()
            await websocket.send_json({
                "class": "camera_info",
                "data": camera_info
            })
            return
        
        # Set camera properties
        if 'set_camera_properties' in request:
            if camera_node is None:
                await websocket.send_json({
                    "class": "error",
                    "message": "Camera not available"
                })
                return
            
            props = request.get('set_camera_properties', {})
            width = props.get('width', 640)
            height = props.get('height', 480)
            fps = props.get('fps', 30)
            
            success = camera_node.set_camera_properties(width, height, fps)
            
            await websocket.send_json({
                "class": "notify" if success else "error",
                "message": "Camera properties updated" if success else "Failed to update camera properties"
            })
            return
        
        # ========== MAVLINK COMMAND LONG / COMMAND_INT ==========
        
        if request.get('class') in ['COMMAND_LONG', 'COMMAND_INT'] and 'message' in request:
            await self._handle_mavlink_command(request, websocket, mavlink_node)
            return

        # ========== ON-DEMAND MESSAGE REQUEST ==========
        
        if 'request_message' in request:
            msg_name = request['request_message']
            msg_id = next((k for k, v in mavlink_node.allowed_types.items() if v["name"] == msg_name), None)
            if msg_id is not None:
                await mavlink_node.request_on_demand_message(msg_id)
                await websocket.send_json({"class": "notify", "message": f"Requested {msg_name}"})
            else:
                await websocket.send_json({"class": "error", "message": f"Unknown message: {msg_name}"})
            return

        # ========== LIST AVAILABLE MESSAGES ==========
        
        if 'list_messages' in request:
            messages_dict = {info["name"]: info["frequency"] for info in mavlink_node.allowed_types.values()}
            await websocket.send_json({"class": "notify", "message": messages_dict})
            return


        if 'ask_ai' in request:
            if ai_node is None:
                await websocket.send_json({"class": "error", "message": "AI advisor not available"})
                return
            question = str(request.get('ask_ai', ''))[:200]
            asyncio.create_task(ai_node.answer_question(question, websocket))
            return


        # ========== TEXT-TO-SPEECH REQUEST ==========
        if 'tts_request' in request:
            if ai_audio is None:
                await websocket.send_json({"class": "error", "message": "TTS not available"})
                return
            payload = request['tts_request']
            text    = str(payload.get('text', ''))[:300]   # hard cap
            loop    = bool(payload.get('loop', False))
            asyncio.create_task(ai_audio.handle_tts_request(text, loop, websocket))
            return

        # ========== CAMERA LAYOUT CHANGE ==========
 
        if 'set_camera_layout' in request:
            if camera_node is None:
                await websocket.send_json({"class": "error", "message": "Camera not available"})
                return
            layout = request.get('set_camera_layout', 'single')
            try:
                camera_node.layout = layout
                await websocket.send_json({
                    "class": "notify",
                    "message": f"Layout changed to {layout}"
                })
            except Exception as e:
                await websocket.send_json({"class": "error", "message": str(e)})
            return
    
        # ========== CAMERA SLOT ORDER (rearrange for composite /video) ==========
    
        if 'set_camera_slot_order' in request:
            if camera_node is None:
                await websocket.send_json({"class": "error", "message": "Camera not available"})
                return
            new_order = request.get('set_camera_slot_order', [])
            try:
                # Validate: only accept IDs that are already configured
                valid = [int(cid) for cid in new_order if int(cid) in camera_node._camera_ids]
                if len(valid) == len(camera_node._camera_ids):
                    camera_node._camera_ids = valid
                    await websocket.send_json({
                        "class": "notify",
                        "message": f"Camera order updated: {valid}"
                    })
                else:
                    await websocket.send_json({
                        "class": "error",
                        "message": f"Invalid camera IDs in order: {new_order}"
                    })
            except Exception as e:
                await websocket.send_json({"class": "error", "message": str(e)})
            return
    
        # ========== JOYSTICK STATE REQUEST ==========
        
        if 'request_joystick' in request:
            await websocket.send_json({
                "class": "joystick",
                "data": {"roll": 0, "pitch": 0, "throttle": 0, "yaw": 0}
            })
            return

        if 'set_autopilot_mode' in request:
            enabled = bool(request['set_autopilot_mode'])
            if ai_node is not None:
                ai_node.autopilot_active = enabled
                # When enabled, reset the advice timer so first advice
                # fires within 2 seconds rather than waiting full interval
                if enabled:
                    ai_node._last_advice_time = 0.0
            if voice_cmd is not None:
                voice_cmd.autopilot_active = enabled
            await websocket.send_json({
                "class": "notify",
                "message": f"AI autopilot {'activated' if enabled else 'deactivated'}"
            })
            return






        await websocket.send_json({"class": "error", "message": "Invalid request format"})

    async def _handle_mavlink_command(self, request: dict, websocket: WebSocket, mavlink_node):
        """Send COMMAND_LONG/INT to drone and wait for ACK"""
        command_type    = request['class']
        msg             = request['message']

        required_fields = {
            'COMMAND_LONG': ['target_system', 'target_component', 'command', 'confirmation', 'param1', 'param2', 'param3', 'param4', 'param5', 'param6', 'param7'],
            'COMMAND_INT':  ['target_system', 'target_component', 'frame', 'command', 'current', 'autocontinue', 'param1', 'param2', 'param3', 'param4', 'x', 'y', 'z']
        }

        missing = [f for f in required_fields[command_type] if f not in msg]
        if missing:
            await websocket.send_json({"class": "error", "message": f"Missing fields: {missing}"})
            return

        try:
            if command_type == 'COMMAND_LONG':
                mavlink_node.send_command_long(msg)
            else:
                mavlink_node.send_command_int(msg)

            # Wait for ACK
            ack = mavlink_node.conn.recv_match(type='COMMAND_ACK', blocking=True, timeout=3.0)
            if ack:
                result_str = mavutil.mavlink.enums['MAV_RESULT'].get(ack.result, 'UNKNOWN').name
                await websocket.send_json({
                                            "class": "COMMAND_ACK",
                                            "command": ack.command,
                                            "result": ack.result,
                                            "result_description": result_str
                                        })
            else:
                await websocket.send_json({
                                            "class": "error",
                                            "message": f"No ACK for {command_type}"
                                        })

            # Special: collect STATUSTEXT after arm commands
            if command_type == 'COMMAND_LONG' and msg['command'] == 400:
                logger.info("Arm command sent, waiting for STATUSTEXT...")
                start = time.time()
                while time.time() - start < 5:
                    try:
                        mav_msg = mavlink_node.conn.recv_match(type='STATUSTEXT', blocking=True, timeout=0.5)
                        if mav_msg:
                            data = mavlink_node._parse_mavlink_message(mav_msg)
                            if data:
                                await websocket.send_json(data)
                    except:
                        pass

        except Exception as e:
            logger.error(f"Command error: {e}")
            await websocket.send_json({"class": "error", "message": str(e)})
