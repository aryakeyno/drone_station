import asyncio
import time
import logging
from pymavlink import mavutil

logger = logging.getLogger(__name__)

class MavlinkNode:
    def __init__(self, com_port, baud_rate, ws_manager):
        self.com_port = com_port
        self.baud_rate = baud_rate
        self.ws_manager = ws_manager
        self.conn = None
        self.latest_messages = {}
        
        self.allowed_types = {
            141: {"name": "ALTITUDE",                   "frequency": 5},
            30:  {"name": "ATTITUDE",                   "frequency": 30},
            24:  {"name": "GPS_RAW_INT",                "frequency": 1},
            242: {"name": "HOME_POSITION",              "frequency": 0.5},
            32:  {"name": "LOCAL_POSITION_NED",         "frequency": 1},
            29:  {"name": "SCALED_PRESSURE",            "frequency": 1},    
            42:  {"name": "MISSION_CURRENT",            "frequency": 0.1},
            2:   {"name": "SYSTEM_TIME",                "frequency": 1},
            1:   {"name": "SYS_STATUS",                 "frequency": 1},
            147: {"name": "BATTERY_STATUS",             "frequency": 1},
            74:  {"name": "VFR_HUD",                    "frequency": 5},
            33:  {"name": "GLOBAL_POSITION_INT",        "frequency": 1},
            253: {"name": "STATUSTEXT",                 "frequency": 0.5}, 
            340: {"name": "UTM_GLOBAL_POSITION",        "frequency": 0},
            63:  {"name": "GLOBAL_POSITION_INT_COV",    "frequency": 0},   
            83:  {"name": "ATTITUDE_TARGET",            "frequency": 0},
            34:  {"name": "RC_CHANNELS_SCALED",         "frequency": 0},
            36:  {"name": "SERVO_OUTPUT_RAW",           "frequency": 0},
            0:   {"name": "HEARTBEAT",                  "frequency": 0}
        }

    async def connect(self):
        while True:
            try:
                logger.info(f"Connecting to PX4 on {self.com_port}...")
                self.conn = mavutil.mavlink_connection(self.com_port, baud=self.baud_rate)
                self.conn.wait_heartbeat()
                logger.info("✅ Connected to PX4!")
                self._set_intervals()
                break
            except Exception as e:
                logger.error(f"❌ Connection failed: {e}. Retrying in 5s...")
                await asyncio.sleep(5)

    def _set_intervals(self):
        for msg_id, info in self.allowed_types.items():
            if info["frequency"] > 0:
                asyncio.create_task(self._set_message_interval_with_retry(msg_id, info["frequency"]))
    
    async def _set_message_interval_with_retry(self, message_id, frequency_hz, retries=3):
        if message_id == 0 or frequency_hz <= 0:
            return False
        
        interval_us = int(1_000_000 / frequency_hz)
        msg_name = self.allowed_types.get(message_id, {"name": str(message_id)})["name"]
        
        for attempt in range(retries):
            try:
                self.conn.mav.command_long_send(
                    self.conn.target_system,
                    self.conn.target_component,
                    mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                    0, message_id, interval_us, 0, 0, 0, 0, 0
                )
                ack = self.conn.recv_match(type='COMMAND_ACK', blocking=True, timeout=2)
                if ack and ack.result == mavutil.mavlink.MAV_RESULT_ACCEPTED:
                    logger.info(f"✓ {msg_name} set to {frequency_hz} Hz")
                    return True
            except Exception as e:
                logger.error(f"Error setting interval for {msg_name}: {e}")
            await asyncio.sleep(0.5)
        
        return False

    def _make_serializable(self, obj):
        if isinstance(obj, bytearray):
            return list(obj)
        elif isinstance(obj, bytes):
            return obj.decode('utf-8', errors='ignore')
        elif isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._make_serializable(item) for item in obj]
        return obj

    def _parse_mavlink_message(self, msg):
        if msg is None or msg.get_type() == 'BAD_DATA':
            return None
        
        msg_id   = msg.get_msgId()
        msg_type = msg.get_type()
        
        if msg_id not in self.allowed_types:
            return None
        
        data = {"class": msg_type, "timestamp": time.time()}
        
        try:
            if   msg_type == 'SYS_STATUS':
                data.update({
                    'SYS_STATUS_load': msg.load / 10.0,
                    'SYS_STATUS_voltage_battery': msg.voltage_battery / 1000.0,
                    'SYS_STATUS_current_battery': msg.current_battery / 100.0,
                    'SYS_STATUS_battery_remaining': msg.battery_remaining,
                    'SYS_STATUS_errors_comm': msg.errors_comm,
                    'SYS_STATUS_onboard_control_sensors_health': msg.onboard_control_sensors_health,
                    'SYS_STATUS_onboard_control_sensors_enabled': msg.onboard_control_sensors_enabled,	
                    'SYS_STATUS_onboard_control_sensors_present': msg.onboard_control_sensors_present
                })
            elif msg_type == 'ATTITUDE':
                data.update({
                    'ATTITUDE_roll': msg.roll,
                    'ATTITUDE_pitch': msg.pitch,
                    'ATTITUDE_yaw': msg.yaw,
                    'ATTITUDE_roll_deg': msg.roll * 180 / 3.14159,
                    'ATTITUDE_pitch_deg': msg.pitch * 180 / 3.14159,
                    'ATTITUDE_yaw_deg': msg.yaw * 180 / 3.14159,
                    'ATTITUDE_rollspeed': msg.rollspeed,
                    'ATTITUDE_pitchspeed': msg.pitchspeed,
                    'ATTITUDE_yawspeed': msg.yawspeed,
                })
            elif msg_type == 'GPS_RAW_INT':
                data.update({
                    'GPS_RAW_INT_lat': msg.lat / 1e7,
                    'GPS_RAW_INT_lon': msg.lon / 1e7,
                    'GPS_RAW_INT_alt': msg.alt / 1000.0,
                    'GPS_RAW_INT_fix_type': mavutil.mavlink.enums['GPS_FIX_TYPE'].get(msg.fix_type, 'UNKNOWN').name,
                    'GPS_RAW_INT_satellites_visible': msg.satellites_visible,
                    'GPS_RAW_INT_vel': msg.vel / 100.0,
                    'GPS_RAW_INT_eph': msg.eph,
                    'GPS_RAW_INT_epv': msg.epv,
                    'GPS_RAW_INT_cog': msg.cog / 100.0
                })
            elif msg_type == 'GLOBAL_POSITION_INT':
                data.update({
                    'GLOBAL_POSITION_INT_lat': msg.lat / 1e7,
                    'GLOBAL_POSITION_INT_lon': msg.lon / 1e7,
                    'GLOBAL_POSITION_INT_alt': msg.alt / 1000.0,
                    'GLOBAL_POSITION_INT_relative_alt': msg.relative_alt / 1000.0,
                    'GLOBAL_POSITION_INT_vx': msg.vx / 100.0,
                    'GLOBAL_POSITION_INT_vy': msg.vy / 100.0, 
                    'GLOBAL_POSITION_INT_vz': msg.vz / 100.0,
                    'GLOBAL_POSITION_INT_hdg': msg.hdg / 100.0  # Fixed: msg.hdg instead of msg.vel
                })
            elif msg_type == 'BATTERY_STATUS':
                data.update({
                    'BATTERY_STATUS_battery_remaining': msg.battery_remaining,
                    'BATTERY_STATUS_current_consumed': msg.current_consumed,
                    'BATTERY_STATUS_current_battery_a': msg.current_battery / 100.0 if msg.current_battery != -1 else None,
                    'BATTERY_STATUS_battery_function': mavutil.mavlink.enums['MAV_BATTERY_FUNCTION'].get(msg.battery_function, 'UNKNOWN').name,
                    'BATTERY_STATUS_type': mavutil.mavlink.enums['MAV_BATTERY_TYPE'].get(msg.type, 'UNKNOWN').name,
                })
            elif msg_type == 'HOME_POSITION':
                data.update({
                    'HOME_POSITION_latitude': msg.latitude / 1e7,
                    'HOME_POSITION_longitude': msg.longitude / 1e7,
                    'HOME_POSITION_altitude': msg.altitude / 1000.0
                })
            elif msg_type == 'LOCAL_POSITION_NED':
                data.update({
                    'LOCAL_POSITION_NED_x': msg.x,
                    'LOCAL_POSITION_NED_y': msg.y,
                    'LOCAL_POSITION_NED_z': msg.z,
                    'LOCAL_POSITION_NED_vx': msg.vx,
                    'LOCAL_POSITION_NED_vy': msg.vy,
                    'LOCAL_POSITION_NED_vz': msg.vz
                })
            elif msg_type == 'SCALED_PRESSURE':
                data.update({
                    'SCALED_PRESSURE_press_abs': msg.press_abs,
                    'SCALED_PRESSURE_temperature': msg.temperature / 100.0
                })
            elif msg_type == 'STATUSTEXT':
                text = msg.text
                # Fixed: safely decode byte arrays, leave strings alone
                if isinstance(text, (bytes, bytearray)):
                    text = text.decode('utf-8', errors='ignore')
                
                data.update({
                    'STATUSTEXT_severity': mavutil.mavlink.enums['MAV_SEVERITY'].get(msg.severity, 'UNKNOWN').name,
                    'STATUSTEXT_text': text
                })
            elif msg_type == 'VFR_HUD':
                data.update({
                    'VFR_HUD_airspeed': msg.airspeed,
                    'VFR_HUD_groundspeed': msg.groundspeed,
                    'VFR_HUD_heading': msg.heading,
                    'VFR_HUD_throttle': msg.throttle,
                    'VFR_HUD_alt': msg.alt,
                    'VFR_HUD_climb': msg.climb
                })
            elif msg_type == 'MISSION_CURRENT':
                data.update({'MISSION_CURRENT_seq': msg.seq})
            elif msg_type == 'HEARTBEAT':
                if msg.type == mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER:
                    return None
                data.update({
                    'HEARTBEAT_type': msg.type,
                    'HEARTBEAT_autopilot': msg.autopilot,
                    'HEARTBEAT_base_mode': msg.base_mode,
                    'HEARTBEAT_custom_mode': msg.custom_mode,
                    'HEARTBEAT_system_status': msg.system_status
                })
            elif msg_type == 'ALTITUDE':
                data.update({
                    'ALTITUDE_altitude_monotonic': msg.altitude_monotonic,
                    'ALTITUDE_altitude_amsl': msg.altitude_amsl,
                    'ALTITUDE_altitude_relative': msg.altitude_relative,
                })
            elif msg_type == 'RC_CHANNELS_SCALED':
                data.update({
                    'RC_CHANNELS_SCALED_chan1_scaled': msg.chan1_scaled,
                    'RC_CHANNELS_SCALED_chan2_scaled': msg.chan2_scaled,
                    'RC_CHANNELS_SCALED_chan3_scaled': msg.chan3_scaled,
                    'RC_CHANNELS_SCALED_chan4_scaled': msg.chan4_scaled,
                })
            elif msg_type == 'SERVO_OUTPUT_RAW':
                data.update({
                    'SERVO_OUTPUT_RAW_servo1_raw': msg.servo1_raw,
                    'SERVO_OUTPUT_RAW_servo2_raw': msg.servo2_raw,
                    'SERVO_OUTPUT_RAW_servo3_raw': msg.servo3_raw,
                    'SERVO_OUTPUT_RAW_servo4_raw': msg.servo4_raw,
                })
            else:
                data.update(self._make_serializable(msg.to_dict()))
        

            if hasattr(self, 'ai_node') and data:
                self.ai_node.ingest_telemetry(data)

        except Exception as e:
            logger.error(f"Error parsing {msg_type}: {e}")
            return None
        
        return data

    async def read_loop(self):
        heartbeat_interval = 1.0
        last_heartbeat = time.time()
        
        while True:
            if not self.conn:
                await asyncio.sleep(0.1)
                continue
            
            try:
                current_time = time.time()
                if current_time - last_heartbeat >= heartbeat_interval:
                    self.conn.mav.heartbeat_send(
                        mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
                        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                        0, 0, 0
                    )
                    last_heartbeat = current_time
                
                # Fetch up to 15 messages per tick to empty the buffer quickly
                for _ in range(15):
                    msg = self.conn.recv_match(blocking=False)
                    if not msg or msg.get_type() == 'BAD_DATA':
                        break
                    #logger.info(f"RAW MAVLink message: {msg.get_type()}") ##################################################################################################################
                    data = self._parse_mavlink_message(msg)
                    if data:
                        self.latest_messages[data['class']] = data
                        
                        # Fix: Broadcast ALL allowed messages that have a frequency > 0 or are core states
                        msg_info = next((info for id, info in self.allowed_types.items() if info["name"] == data['class']), None)
                        if msg_info and (msg_info["frequency"] > 0 or data['class'] in ['HEARTBEAT', 'STATUSTEXT', 'SYS_STATUS']):
                            try:
                                await self.ws_manager.broadcast(data)
                            except Exception as e:
                                logger.error(f"MAVLink broadcast error: {e}")
                                # Continue reading even if broadcast fails
                        
            except Exception as e:
                logger.error(f"MAVLink read error: {e}")
                await asyncio.sleep(1)
            
            # Yield control back to the event loop (keeps websockets fast)
            await asyncio.sleep(0.01)

    def send_rc_override(self, roll, pitch, throttle, yaw):
        if self.conn:
            self.conn.mav.rc_channels_override_send(
                self.conn.target_system, self.conn.target_component,
                roll, pitch, throttle, yaw, 65535, 65535, 65535, 65535
            )
    
    async def request_on_demand_message(self, message_id):
        msg_name = self.allowed_types.get(message_id, {"name": str(message_id)})["name"]
        logger.info(f"Requesting on-demand: {msg_name}")
        try:
            self.conn.mav.command_long_send(
                self.conn.target_system, self.conn.target_component,
                mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                0, message_id, 0, 0, 0, 0, 0, 0
            )
            ack = self.conn.recv_match(type='COMMAND_ACK', blocking=True, timeout=1.0)
            if ack and ack.result == mavutil.mavlink.MAV_RESULT_FAILED:
                self.conn.mav.command_long_send(
                    self.conn.target_system, self.conn.target_component,
                    mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                    0, message_id, 0, 0, 0, 0, 0, 0
                )
        except Exception as e:
            logger.error(f"Error requesting {msg_name}: {e}")

    def send_command_long(self, cmd_dict):
        self.conn.mav.command_long_send(
            cmd_dict['target_system'],
            cmd_dict['target_component'],
            cmd_dict['command'],
            cmd_dict['confirmation'],
            cmd_dict['param1'],
            cmd_dict['param2'],
            cmd_dict['param3'],
            cmd_dict['param4'],
            cmd_dict['param5'],
            cmd_dict['param6'],
            cmd_dict['param7']
        )
        logger.info(f"Sent COMMAND_LONG: cmd={cmd_dict['command']}")

    def send_command_int(self, cmd_dict):
        self.conn.mav.command_int_send(
            cmd_dict['target_system'],
            cmd_dict['target_component'],
            cmd_dict['frame'],
            cmd_dict['command'],
            cmd_dict['current'],
            cmd_dict['autocontinue'],
            cmd_dict['param1'],
            cmd_dict['param2'],
            cmd_dict['param3'],
            cmd_dict['param4'],
            cmd_dict['x'],
            cmd_dict['y'],
            cmd_dict['z']
        )
        logger.info(f"Sent COMMAND_INT: cmd={cmd_dict['command']}")