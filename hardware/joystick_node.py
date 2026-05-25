import asyncio
import pygame
import logging
import time
from pymavlink import mavutil

logger = logging.getLogger(__name__)

class JoystickNode:
    def __init__(self, joy_id, mavlink_node, ws_manager):
        self.joy_id = joy_id
        self.mavlink = mavlink_node
        self.ws_manager = ws_manager
        self.joystick = None
        self.last_axes = [0.0, 0.0, 0.0, 0.0]
        
        # Button configuration
        self.WEBSOCKET_BUTTONS = [1, 2, 3, 4, 9, 10, 11]
        self.MAVLINK_BUTTONS = [0, 5, 6, 7, 8, 12, 13]
        self.button_last_pressed = {}
        self.button_debounce_time = 0.2

    def init_joystick(self):
        if self.joy_id < 0:
            logger.warning("No joystick selected")
            return False
        pygame.init()
        pygame.joystick.init()
        self.joystick = pygame.joystick.Joystick(self.joy_id)
        self.joystick.init()
        logger.info(f"✓ Joystick: {self.joystick.get_name()}")
        return True

    async def poll_loop(self):
        if not self.init_joystick():
            return

        while True:
            try:
                pygame.event.pump()
                
                # Axes (RC channels)
                roll = self.joystick.get_axis(0)
                pitch = self.joystick.get_axis(1)
                throttle = self.joystick.get_axis(2)
                yaw = self.joystick.get_axis(3)
                
                if any(abs(a - b) > 0.05 for a, b in zip([roll, pitch, throttle, yaw], self.last_axes)):
                    roll_pwm = int(1500 + roll * 500)
                    pitch_pwm = int(1500 + pitch * 500)
                    throttle_pwm = int(1500 - (throttle + 1) * 500)
                    yaw_pwm = int(1500 + yaw * 500)

                    self.mavlink.send_rc_override(roll_pwm, pitch_pwm, throttle_pwm, yaw_pwm)
                    await self.ws_manager.broadcast({
                        "type": "joystick_axes",
                        "roll": roll, "pitch": pitch,
                        "throttle": throttle, "yaw": yaw
                    })
                    self.last_axes = [roll, pitch, throttle, yaw]

                # Buttons
                for button_id in range(self.joystick.get_numbuttons()):
                    if self.joystick.get_button(button_id):
                        current_time = time.time()
                        last_press = self.button_last_pressed.get(button_id, 0)
                        
                        if current_time - last_press >= self.button_debounce_time:
                            self.button_last_pressed[button_id] = current_time
                            await self._handle_button(button_id)

            except Exception as e:
                logger.error(f"Joystick error: {e}")
            
            await asyncio.sleep(0.02)

    async def _handle_button(self, button_id):
        """Route button to WebSocket or MAVLink"""
        
        if button_id in self.WEBSOCKET_BUTTONS:
            await self.ws_manager.broadcast({
                "type": "button",
                "id": button_id
            })
            logger.info(f"Button {button_id} → WebSocket")

        elif button_id in self.MAVLINK_BUTTONS:
            await self._send_mavlink_button_command(button_id)

    async def _send_mavlink_button_command(self, button_id):
        """Send MAVLink commands for buttons"""
        
        if button_id == 0:  # Trigger: Arm
            logger.info("Button 0: ARM")
            self.mavlink.conn.mav.command_long_send(
                self.mavlink.conn.target_system,
                self.mavlink.conn.target_component,
                mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                0, 1, 0, 0, 0, 0, 0, 0
            )
        elif button_id == 5:  # Mode: Manual
            logger.info("Button 5: MANUAL MODE")
            self.mavlink.conn.mav.command_long_send(
                self.mavlink.conn.target_system,
                self.mavlink.conn.target_component,
                mavutil.mavlink.MAV_CMD_DO_SET_MODE,
                0, mavutil.mavlink.MAV_MODE_MANUAL_ARMED, 0, 0, 0, 0, 0, 0
            )
        elif button_id == 6:  # Custom
            logger.info("Button 6: SERVO")
            self.mavlink.conn.mav.command_long_send(
                self.mavlink.conn.target_system,
                self.mavlink.conn.target_component,
                mavutil.mavlink.MAV_CMD_DO_SET_SERVO,
                0, 9, 1500, 0, 0, 0, 0, 0
            )
        else:
            logger.info(f"Button {button_id}: Not implemented")