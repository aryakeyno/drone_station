#!/usr/bin/env python3
"""
mavlink_tester.py
=================
Standalone MAVLink ↔ PX4 test tool.

Tabs
----
  1. CONNECTION   — select COM port, baud, connect / disconnect, heartbeat stats
  2. TELEMETRY    — live parsed values for every known message type
  3. MSG REQUEST  — request any message on-demand or set a stream rate
  4. COMMANDS     — send COMMAND_LONG / COMMAND_INT with presets or raw params
  5. RAW LOG      — every received packet, with type-filter and pause

Dependencies
------------
    pip install pymavlink pyserial
"""

import threading
import queue
import time
import json
import math
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import serial.tools.list_ports

# ── pymavlink ────────────────────────────────────────────────────────────────
try:
    from pymavlink import mavutil
except ImportError:
    import sys
    print("ERROR: pymavlink not installed.  Run:  pip install pymavlink")
    sys.exit(1)


# ════════════════════════════════════════════════════════════════════════════════
#  CONSTANTS
# ════════════════════════════════════════════════════════════════════════════════

APP_TITLE = "MAVLink PX4 Test Tool"
BAUD_OPTIONS = ["57600", "115200", "230400", "460800", "921600"]
DEFAULT_BAUD = "921600"
POLL_INTERVAL_MS = 50          # tkinter after() loop rate

# All message types we know how to parse  (id → name)
KNOWN_MESSAGES: dict[int, str] = {
    0:   "HEARTBEAT",
    1:   "SYS_STATUS",
    2:   "SYSTEM_TIME",
    24:  "GPS_RAW_INT",
    29:  "SCALED_PRESSURE",
    30:  "ATTITUDE",
    32:  "LOCAL_POSITION_NED",
    33:  "GLOBAL_POSITION_INT",
    36:  "SERVO_OUTPUT_RAW",
    42:  "MISSION_CURRENT",
    62:  "NAV_CONTROLLER_OUTPUT",
    63:  "GLOBAL_POSITION_INT_COV",
    74:  "VFR_HUD",
    83:  "ATTITUDE_TARGET",
    147: "BATTERY_STATUS",
    141: "ALTITUDE",
    242: "HOME_POSITION",
    253: "STATUSTEXT",
    340: "UTM_GLOBAL_POSITION",
    34:  "RC_CHANNELS_SCALED",
    65:  "RC_CHANNELS",
    87:  "POSITION_TARGET_GLOBAL_INT",
    105: "HIGHRES_IMU",
}

# Preset COMMAND_LONG commands
COMMAND_PRESETS = {
    "ARM":           {"cmd": 400, "p1": 1, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "DISARM":        {"cmd": 400, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "FORCE DISARM":  {"cmd": 400, "p1": 0, "p2": 21196, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "TAKEOFF 5m":    {"cmd": 22,  "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 5},
    "TAKEOFF 10m":   {"cmd": 22,  "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 10},
    "LAND":          {"cmd": 21,  "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "RTL":           {"cmd": 20,  "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "LOITER":        {"cmd": 19,  "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "MODE STABILIZE":{"cmd": 176, "p1": 81,"p2": 6,  "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "MODE POSCTL":   {"cmd": 176, "p1": 81,"p2": 3,  "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "MODE AUTO":     {"cmd": 176, "p1": 157,"p2":0,  "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "REBOOT FC":     {"cmd": 246, "p1": 1, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "REQ HOME POS":  {"cmd": 410, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "SET HOME HERE": {"cmd": 179, "p1": 1, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "CALIBRATE GYRO":{"cmd": 241, "p1": 1, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "CALIBRATE ACC": {"cmd": 241, "p1": 0, "p2": 0, "p3": 1, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
    "CALIBRATE MAG": {"cmd": 241, "p1": 0, "p2": 1, "p3": 0, "p4": 0, "p5": 0, "p6": 0, "p7": 0},
}

# Severity colours for STATUSTEXT
SEV_COLOUR = {
    "EMERGENCY": "#ff0000", "ALERT":    "#ff3c3c",
    "CRITICAL":  "#ff6b00", "ERROR":    "#ff8c00",
    "WARNING":   "#ffb300", "NOTICE":   "#ffe566",
    "INFO":      "#00d4ff", "DEBUG":    "#8899aa",
}

MAV_RESULT_NAMES = {
    0: "ACCEPTED", 1: "TEMP_REJECTED", 2: "DENIED",
    3: "UNSUPPORTED", 4: "FAILED", 5: "IN_PROGRESS",
    6: "CANCELLED",
}


# ════════════════════════════════════════════════════════════════════════════════
#  THEME
# ════════════════════════════════════════════════════════════════════════════════

BG       = "#090f14"
PANEL    = "#0d1c26"
BORDER   = "#122433"
ACCENT   = "#00d4ff"
ACCENT2  = "#00ff99"
DANGER   = "#ff3c3c"
WARN     = "#ffb300"
TXT      = "#c8e0e8"
TXT_DIM  = "#4a7a8a"
ENTRY_BG = "#071320"

FONT_MONO  = ("Courier New", 9)
FONT_MONO2 = ("Courier New", 8)
FONT_HUD   = ("Courier New", 10, "bold")
FONT_TITLE = ("Courier New", 11, "bold")
FONT_SMALL = ("Courier New", 8)


def apply_theme(root):
    style = ttk.Style(root)
    style.theme_use("clam")

    style.configure(".",
        background=BG, foreground=TXT,
        font=FONT_MONO, bordercolor=BORDER,
        focuscolor=ACCENT, selectbackground=ACCENT, selectforeground=BG)

    style.configure("TFrame",        background=BG)
    style.configure("TLabel",        background=BG,    foreground=TXT, font=FONT_MONO)
    style.configure("Dim.TLabel",    background=BG,    foreground=TXT_DIM, font=FONT_SMALL)
    style.configure("Accent.TLabel", background=BG,    foreground=ACCENT, font=FONT_HUD)
    style.configure("OK.TLabel",     background=BG,    foreground=ACCENT2, font=FONT_MONO)
    style.configure("Warn.TLabel",   background=BG,    foreground=WARN, font=FONT_MONO)
    style.configure("Danger.TLabel", background=BG,    foreground=DANGER, font=FONT_MONO)

    style.configure("TNotebook",       background=BG,  bordercolor=BORDER, tabmargins=[2,2,0,0])
    style.configure("TNotebook.Tab",   background=PANEL, foreground=TXT_DIM,
                    padding=[12, 5], font=FONT_MONO)
    style.map("TNotebook.Tab",
        background=[("selected", BG)],
        foreground=[("selected", ACCENT)])

    style.configure("TButton",
        background=PANEL, foreground=TXT,
        bordercolor=BORDER, relief="flat", padding=[8, 4], font=FONT_MONO)
    style.map("TButton",
        background=[("active", "#1a3048"), ("pressed", "#0d2030")],
        foreground=[("active", ACCENT)])

    style.configure("Accent.TButton",
        background="#0a2535", foreground=ACCENT, bordercolor=ACCENT, font=FONT_HUD)
    style.map("Accent.TButton",
        background=[("active", "#0d3040")],
        foreground=[("active", "#80e8ff")])

    style.configure("Danger.TButton",
        background="#250a0a", foreground=DANGER, bordercolor=DANGER, font=FONT_HUD)
    style.map("Danger.TButton",
        background=[("active", "#350f0f")],
        foreground=[("active", "#ff8080")])

    style.configure("OK.TButton",
        background="#0a2518", foreground=ACCENT2, bordercolor=ACCENT2, font=FONT_HUD)

    style.configure("TEntry",
        fieldbackground=ENTRY_BG, foreground=ACCENT,
        bordercolor=BORDER, insertcolor=ACCENT, font=FONT_MONO)

    style.configure("TCombobox",
        fieldbackground=ENTRY_BG, foreground=ACCENT,
        background=PANEL, arrowcolor=ACCENT, font=FONT_MONO)
    style.map("TCombobox",
        fieldbackground=[("readonly", ENTRY_BG)],
        foreground=[("readonly", ACCENT)])

    style.configure("Treeview",
        background=PANEL, foreground=TXT, fieldbackground=PANEL,
        bordercolor=BORDER, rowheight=20, font=FONT_MONO2)
    style.configure("Treeview.Heading",
        background=BORDER, foreground=ACCENT, font=FONT_MONO,
        relief="flat", bordercolor=BORDER)
    style.map("Treeview",
        background=[("selected", "#0d3040")],
        foreground=[("selected", ACCENT)])

    style.configure("TSeparator", background=BORDER)
    style.configure("TLabelframe",      background=BG, bordercolor=BORDER, relief="groove")
    style.configure("TLabelframe.Label", background=BG, foreground=ACCENT, font=FONT_HUD)
    style.configure("TScrollbar",
        background=PANEL, troughcolor=BG, arrowcolor=TXT_DIM,
        bordercolor=BORDER, relief="flat")


# ════════════════════════════════════════════════════════════════════════════════
#  MAVLink PARSER  (pure function, no state)
# ════════════════════════════════════════════════════════════════════════════════

def parse_message(msg) -> dict | None:
    """Return a flat dict of human-readable fields, or None to skip."""
    if msg is None or msg.get_type() == "BAD_DATA":
        return None

    mt = msg.get_type()
    PI = math.pi
    d  = {"_type": mt, "_id": msg.get_msgId(), "_ts": time.time()}

    try:
        if mt == "HEARTBEAT":
            d.update({
                "type":          msg.type,
                "autopilot":     msg.autopilot,
                "base_mode":     f"0x{msg.base_mode:02X}",
                "custom_mode":   msg.custom_mode,
                "system_status": msg.system_status,
                "armed":         bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED),
            })
        elif mt == "SYS_STATUS":
            d.update({
                "load_%":         round(msg.load / 10.0, 1),
                "voltage_V":      round(msg.voltage_battery / 1000.0, 3),
                "current_A":      round(msg.current_battery / 100.0, 2),
                "battery_%":      msg.battery_remaining,
                "errors_comm":    msg.errors_comm,
                "sensors_present":f"0x{msg.onboard_control_sensors_present:08X}",
                "sensors_enabled":f"0x{msg.onboard_control_sensors_enabled:08X}",
                "sensors_health": f"0x{msg.onboard_control_sensors_health:08X}",
            })
        elif mt == "SYSTEM_TIME":
            d.update({
                "time_unix_usec": msg.time_unix_usec,
                "time_boot_ms":   msg.time_boot_ms,
            })
        elif mt == "ATTITUDE":
            d.update({
                "roll_rad":    round(msg.roll,   4),
                "pitch_rad":   round(msg.pitch,  4),
                "yaw_rad":     round(msg.yaw,    4),
                "roll_deg":    round(msg.roll  * 180 / PI, 2),
                "pitch_deg":   round(msg.pitch * 180 / PI, 2),
                "yaw_deg":     round(msg.yaw   * 180 / PI, 2),
                "rollspeed":   round(msg.rollspeed,  4),
                "pitchspeed":  round(msg.pitchspeed, 4),
                "yawspeed":    round(msg.yawspeed,   4),
            })
        elif mt == "GPS_RAW_INT":
            fix = mavutil.mavlink.enums["GPS_FIX_TYPE"].get(msg.fix_type, None)
            d.update({
                "lat_deg":    round(msg.lat / 1e7, 7),
                "lon_deg":    round(msg.lon / 1e7, 7),
                "alt_m":      round(msg.alt / 1000.0, 3),
                "fix_type":   fix.name if fix else msg.fix_type,
                "satellites": msg.satellites_visible,
                "vel_m/s":    round(msg.vel / 100.0, 2),
                "eph":        msg.eph,
                "epv":        msg.epv,
                "cog_deg":    round(msg.cog / 100.0, 1),
            })
        elif mt == "GLOBAL_POSITION_INT":
            d.update({
                "lat_deg":     round(msg.lat / 1e7, 7),
                "lon_deg":     round(msg.lon / 1e7, 7),
                "alt_m":       round(msg.alt / 1000.0, 3),
                "rel_alt_m":   round(msg.relative_alt / 1000.0, 3),
                "vx_m/s":      round(msg.vx / 100.0, 3),
                "vy_m/s":      round(msg.vy / 100.0, 3),
                "vz_m/s":      round(msg.vz / 100.0, 3),
                "hdg_deg":     round(msg.hdg / 100.0, 1),
            })
        elif mt == "LOCAL_POSITION_NED":
            d.update({
                "x_m": round(msg.x, 3), "y_m": round(msg.y, 3), "z_m": round(msg.z, 3),
                "vx":  round(msg.vx,3), "vy":  round(msg.vy,3), "vz":  round(msg.vz,3),
            })
        elif mt == "ALTITUDE":
            d.update({
                "monotonic_m": round(msg.altitude_monotonic, 3),
                "amsl_m":      round(msg.altitude_amsl,      3),
                "local_m":     round(msg.altitude_local,     3),
                "relative_m":  round(msg.altitude_relative,  3),
                "terrain_m":   round(msg.altitude_terrain,   3),
                "clearance_m": round(msg.bottom_clearance,   3),
            })
        elif mt == "VFR_HUD":
            d.update({
                "airspeed_m/s":   round(msg.airspeed,    2),
                "groundspeed_m/s":round(msg.groundspeed, 2),
                "heading_deg":    msg.heading,
                "throttle_%":     msg.throttle,
                "alt_m":          round(msg.alt,   2),
                "climb_m/s":      round(msg.climb, 2),
            })
        elif mt == "BATTERY_STATUS":
            d.update({
                "id":               msg.id,
                "remaining_%":      msg.battery_remaining,
                "current_mAh":      msg.current_consumed,
                "current_A":        round(msg.current_battery / 100.0, 2) if msg.current_battery != -1 else None,
                "temperature_°C":   round(msg.temperature / 100.0, 1) if msg.temperature != 0x7FFF else None,
                "cell1_mV": msg.voltages[0] if msg.voltages[0] != 0xFFFF else None,
                "cell2_mV": msg.voltages[1] if msg.voltages[1] != 0xFFFF else None,
                "cell3_mV": msg.voltages[2] if msg.voltages[2] != 0xFFFF else None,
                "cell4_mV": msg.voltages[3] if msg.voltages[3] != 0xFFFF else None,
                "cell5_mV": msg.voltages[4] if msg.voltages[4] != 0xFFFF else None,
                "cell6_mV": msg.voltages[5] if msg.voltages[5] != 0xFFFF else None,
                "function":  mavutil.mavlink.enums["MAV_BATTERY_FUNCTION"].get(msg.battery_function, None),
                "bat_type":  mavutil.mavlink.enums["MAV_BATTERY_TYPE"].get(msg.type, None),
            })
        elif mt == "SCALED_PRESSURE":
            d.update({
                "press_abs_hPa":  round(msg.press_abs,  3),
                "press_diff_hPa": round(msg.press_diff, 3),
                "temp_°C":        round(msg.temperature / 100.0, 2),
            })
        elif mt == "HOME_POSITION":
            d.update({
                "lat_deg": round(msg.latitude  / 1e7, 7),
                "lon_deg": round(msg.longitude / 1e7, 7),
                "alt_m":   round(msg.altitude  / 1000.0, 3),
            })
        elif mt == "STATUSTEXT":
            sev = mavutil.mavlink.enums["MAV_SEVERITY"].get(msg.severity, None)
            d.update({
                "severity": sev.name if sev else msg.severity,
                "text":     msg.text.decode("utf-8", errors="ignore").rstrip("\x00"),
            })
        elif mt == "MISSION_CURRENT":
            d.update({"seq": msg.seq})
        elif mt == "SERVO_OUTPUT_RAW":
            for i in range(1, 9):
                d[f"servo{i}_raw"] = getattr(msg, f"servo{i}_raw", None)
        elif mt == "RC_CHANNELS_SCALED":
            for i in range(1, 9):
                d[f"chan{i}_scaled"] = getattr(msg, f"chan{i}_scaled", None)
            d["rssi"] = msg.rssi
        elif mt == "RC_CHANNELS":
            for i in range(1, 19):
                d[f"chan{i}_raw"] = getattr(msg, f"chancount", None)
            d["chancount"] = msg.chancount
            d["rssi"]      = msg.rssi
        elif mt == "ATTITUDE_TARGET":
            d.update({
                "roll_rate":  round(msg.body_roll_rate,  4),
                "pitch_rate": round(msg.body_pitch_rate, 4),
                "yaw_rate":   round(msg.body_yaw_rate,   4),
                "thrust":     round(msg.thrust,           4),
            })
        elif mt == "NAV_CONTROLLER_OUTPUT":
            d.update({
                "nav_roll":      round(msg.nav_roll,       2),
                "nav_pitch":     round(msg.nav_pitch,      2),
                "nav_bearing":   msg.nav_bearing,
                "target_bearing":msg.target_bearing,
                "wp_dist_m":     msg.wp_dist,
                "alt_error_m":   round(msg.alt_error,   3),
                "aspd_error":    round(msg.aspd_error,  3),
                "xtrack_error":  round(msg.xtrack_error,3),
            })
        elif mt == "HIGHRES_IMU":
            d.update({
                "xacc":  round(msg.xacc,  4),
                "yacc":  round(msg.yacc,  4),
                "zacc":  round(msg.zacc,  4),
                "xgyro": round(msg.xgyro, 4),
                "ygyro": round(msg.ygyro, 4),
                "zgyro": round(msg.zgyro, 4),
                "xmag":  round(msg.xmag,  4),
                "ymag":  round(msg.ymag,  4),
                "zmag":  round(msg.zmag,  4),
                "temperature_°C": round(msg.temperature, 2),
                "pressure_hPa":   round(msg.abs_pressure, 3),
            })
        else:
            # Generic: dump all numeric / string fields
            for k, v in msg.to_dict().items():
                if k not in ("mavpackettype", "fieldnames"):
                    if isinstance(v, (bytearray, bytes)):
                        d[k] = v.decode("utf-8", errors="ignore")
                    elif isinstance(v, list):
                        for i, item in enumerate(v[:8]):
                            d[f"{k}[{i}]"] = item
                    else:
                        d[k] = v
    except Exception as e:
        d["_parse_error"] = str(e)

    return d


# ════════════════════════════════════════════════════════════════════════════════
#  MAVLINK THREAD
# ════════════════════════════════════════════════════════════════════════════════

class MavlinkThread(threading.Thread):
    """Background thread: connects to FC and drains the RX buffer."""

    def __init__(self, port: str, baud: int, rx_queue: queue.Queue):
        super().__init__(daemon=True, name="mavlink-rx")
        self.port     = port
        self.baud     = baud
        self.rx_q     = rx_queue
        self.conn     = None
        self.running  = False
        self.connected= False
        self.rx_count = 0
        self.rx_rate  = 0.0
        self._stop    = threading.Event()
        self._rate_t  = time.time()
        self._rate_n  = 0

    def run(self):
        self.running = True
        try:
            self.rx_q.put({"_event": "connecting"})
            self.conn = mavutil.mavlink_connection(self.port, baud=self.baud)
            # Wait for heartbeat with timeout
            self.conn.wait_heartbeat(timeout=10)
            self.connected = True
            self.rx_q.put({
                "_event":     "connected",
                "sys_id":     self.conn.target_system,
                "comp_id":    self.conn.target_component,
            })
        except Exception as exc:
            self.rx_q.put({"_event": "error", "msg": str(exc)})
            self.running = False
            return

        while not self._stop.is_set():
            try:
                msg = self.conn.recv_match(blocking=False)
                if msg and msg.get_type() != "BAD_DATA":
                    parsed = parse_message(msg)
                    if parsed:
                        self.rx_q.put(parsed)
                        self.rx_count += 1
                        self._rate_n  += 1

                now = time.time()
                if now - self._rate_t >= 1.0:
                    self.rx_rate  = self._rate_n / (now - self._rate_t)
                    self._rate_n  = 0
                    self._rate_t  = now
                    self.rx_q.put({"_event": "rate", "hz": round(self.rx_rate, 1),
                                   "total": self.rx_count})
            except Exception as exc:
                self.rx_q.put({"_event": "error", "msg": str(exc)})
                break

            time.sleep(0.002)

        self.running   = False
        self.connected = False
        self.rx_q.put({"_event": "disconnected"})

    def stop(self):
        self._stop.set()

    def send_heartbeat(self):
        if self.conn and self.connected:
            try:
                self.conn.mav.heartbeat_send(
                    mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
                    mavutil.mavlink.MAV_AUTOPILOT_INVALID, 0, 0, 0)
            except Exception:
                pass

    def set_message_interval(self, msg_id: int, freq_hz: float):
        if not (self.conn and self.connected):
            return
        interval = int(1_000_000 / freq_hz) if freq_hz > 0 else -1
        self.conn.mav.command_long_send(
            self.conn.target_system, self.conn.target_component,
            mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
            0, msg_id, interval, 0, 0, 0, 0, 0)

    def request_message(self, msg_id: int):
        if not (self.conn and self.connected):
            return
        self.conn.mav.command_long_send(
            self.conn.target_system, self.conn.target_component,
            mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
            0, msg_id, 0, 0, 0, 0, 0, 0)

    def send_command_long(self, sys_id, comp_id, cmd, conf, p1, p2, p3, p4, p5, p6, p7):
        if not (self.conn and self.connected):
            return False
        self.conn.mav.command_long_send(
            sys_id, comp_id, cmd, conf, p1, p2, p3, p4, p5, p6, p7)
        return True

    def send_command_int(self, sys_id, comp_id, frame, cmd, cur, auto, p1, p2, p3, p4, x, y, z):
        if not (self.conn and self.connected):
            return False
        self.conn.mav.command_int_send(
            sys_id, comp_id, frame, cmd, cur, auto, p1, p2, p3, p4, x, y, z)
        return True


# ════════════════════════════════════════════════════════════════════════════════
#  MAIN APPLICATION WINDOW
# ════════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.configure(bg=BG)
        self.geometry("1200x820")
        self.minsize(960, 640)
        apply_theme(self)

        self._mav_thread: MavlinkThread | None = None
        self._rx_queue   = queue.Queue(maxsize=2000)
        self._hb_job     = None                    # heartbeat after() id

        # live parsed data keyed by message type
        self._telem: dict[str, dict] = {}

        self._build_ui()
        self._poll()   # start UI update loop

    # ── UI CONSTRUCTION ───────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Top bar ──────────────────────────────────────────────────────────
        top = tk.Frame(self, bg="#0a1825", height=46)
        top.pack(fill="x", side="top")
        top.pack_propagate(False)

        tk.Label(top, text="◈  MAVLINK PX4 TEST TOOL",
                 bg="#0a1825", fg=ACCENT,
                 font=("Courier New", 13, "bold")).pack(side="left", padx=16, pady=8)

        self._conn_label = tk.Label(top, text="● DISCONNECTED",
                                    bg="#0a1825", fg=DANGER,
                                    font=("Courier New", 9, "bold"))
        self._conn_label.pack(side="right", padx=16)

        self._rate_label = tk.Label(top, text="0.0 msg/s  |  0 total",
                                    bg="#0a1825", fg=TXT_DIM,
                                    font=("Courier New", 9))
        self._rate_label.pack(side="right", padx=12)

        # ── Notebook ──────────────────────────────────────────────────────────
        self._nb = ttk.Notebook(self)
        self._nb.pack(fill="both", expand=True, padx=6, pady=(4, 6))

        self._tab_connection = ttk.Frame(self._nb)
        self._tab_telemetry  = ttk.Frame(self._nb)
        self._tab_request    = ttk.Frame(self._nb)
        self._tab_commands   = ttk.Frame(self._nb)
        self._tab_raw        = ttk.Frame(self._nb)

        self._nb.add(self._tab_connection, text="  CONNECTION  ")
        self._nb.add(self._tab_telemetry,  text="  TELEMETRY  ")
        self._nb.add(self._tab_request,    text="  MSG REQUEST  ")
        self._nb.add(self._tab_commands,   text="  COMMANDS  ")
        self._nb.add(self._tab_raw,        text="  RAW LOG  ")

        self._build_connection_tab()
        self._build_telemetry_tab()
        self._build_request_tab()
        self._build_commands_tab()
        self._build_raw_tab()

    # ══════════════════════════════════════════════════════════════════════════
    #  TAB 1 — CONNECTION
    # ══════════════════════════════════════════════════════════════════════════

    def _build_connection_tab(self):
        f = self._tab_connection
        f.columnconfigure(1, weight=1)

        # ── Port / baud selectors ────────────────────────────────────────────
        lf_conn = ttk.LabelFrame(f, text=" Serial Connection ", padding=14)
        lf_conn.grid(row=0, column=0, columnspan=2, sticky="ew", padx=12, pady=10)
        lf_conn.columnconfigure(1, weight=1)

        ttk.Label(lf_conn, text="COM Port:").grid(row=0, column=0, sticky="w", pady=4)
        self._port_var = tk.StringVar()
        self._port_cb  = ttk.Combobox(lf_conn, textvariable=self._port_var,
                                       state="readonly", width=20)
        self._port_cb.grid(row=0, column=1, sticky="w", padx=(8,0), pady=4)

        ttk.Button(lf_conn, text="⟳ Refresh",
                   command=self._refresh_ports).grid(row=0, column=2, padx=8)

        ttk.Label(lf_conn, text="Baud Rate:").grid(row=1, column=0, sticky="w", pady=4)
        self._baud_var = tk.StringVar(value=DEFAULT_BAUD)
        ttk.Combobox(lf_conn, textvariable=self._baud_var,
                     values=BAUD_OPTIONS, state="readonly",
                     width=20).grid(row=1, column=1, sticky="w", padx=(8,0), pady=4)

        ttk.Label(lf_conn, text="System ID (GCS):").grid(row=2, column=0, sticky="w", pady=4)
        self._gcs_sys_var = tk.StringVar(value="255")
        ttk.Entry(lf_conn, textvariable=self._gcs_sys_var, width=8).grid(
            row=2, column=1, sticky="w", padx=(8,0), pady=4)

        btn_row = tk.Frame(lf_conn, bg=BG)
        btn_row.grid(row=3, column=0, columnspan=3, pady=(12, 0))
        self._connect_btn = ttk.Button(btn_row, text="CONNECT",
                                        style="Accent.TButton",
                                        command=self._connect)
        self._connect_btn.pack(side="left", padx=4)
        self._disconnect_btn = ttk.Button(btn_row, text="DISCONNECT",
                                           style="Danger.TButton",
                                           state="disabled",
                                           command=self._disconnect)
        self._disconnect_btn.pack(side="left", padx=4)

        # ── Connection stats ─────────────────────────────────────────────────
        lf_stats = ttk.LabelFrame(f, text=" Session Statistics ", padding=14)
        lf_stats.grid(row=1, column=0, sticky="nsew", padx=12, pady=4)

        stats = [
            ("FC System ID:",    "_stat_sysid"),
            ("FC Component ID:", "_stat_compid"),
            ("Messages/s:",      "_stat_rate"),
            ("Total received:",  "_stat_total"),
            ("Uptime:",          "_stat_uptime"),
            ("Armed:",           "_stat_armed"),
            ("Flight mode:",     "_stat_mode"),
            ("Battery:",         "_stat_batt"),
        ]
        for r, (label, attr) in enumerate(stats):
            ttk.Label(lf_stats, text=label, style="Dim.TLabel").grid(
                row=r, column=0, sticky="w", pady=2)
            lbl = ttk.Label(lf_stats, text="--", style="Accent.TLabel")
            lbl.grid(row=r, column=1, sticky="w", padx=(12, 0), pady=2)
            setattr(self, attr, lbl)

        self._connect_start = None

        # ── STATUSTEXT console ────────────────────────────────────────────────
        lf_st = ttk.LabelFrame(f, text=" STATUSTEXT Messages ", padding=8)
        lf_st.grid(row=1, column=1, sticky="nsew", padx=12, pady=4)
        lf_st.rowconfigure(0, weight=1)
        lf_st.columnconfigure(0, weight=1)
        f.rowconfigure(1, weight=1)
        f.columnconfigure(1, weight=1)

        self._status_text = scrolledtext.ScrolledText(
            lf_st, bg=PANEL, fg=TXT, font=FONT_MONO, wrap="word",
            insertbackground=ACCENT, relief="flat", height=12)
        self._status_text.grid(row=0, column=0, sticky="nsew")
        for sev, col in SEV_COLOUR.items():
            self._status_text.tag_configure(sev, foreground=col)

        ttk.Button(lf_st, text="Clear",
                   command=lambda: self._status_text.delete("1.0", "end")
                   ).grid(row=1, column=0, sticky="e", pady=(4,0))

        self._refresh_ports()

    def _refresh_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self._port_cb["values"] = ports
        if ports:
            self._port_var.set(ports[0])

    def _connect(self):
        port = self._port_var.get()
        if not port:
            messagebox.showerror("Error", "Please select a COM port.")
            return
        baud = int(self._baud_var.get())
        self._mav_thread = MavlinkThread(port, baud, self._rx_queue)
        self._mav_thread.start()
        self._connect_btn.configure(state="disabled")
        self._disconnect_btn.configure(state="normal")
        self._connect_start = time.time()
        # start sending GCS heartbeat every second
        self._schedule_heartbeat()

    def _disconnect(self):
        if self._mav_thread:
            self._mav_thread.stop()
        if self._hb_job:
            self.after_cancel(self._hb_job)
            self._hb_job = None
        self._connect_btn.configure(state="normal")
        self._disconnect_btn.configure(state="disabled")
        self._conn_label.configure(text="● DISCONNECTED", fg=DANGER)

    def _schedule_heartbeat(self):
        if self._mav_thread and self._mav_thread.connected:
            self._mav_thread.send_heartbeat()
        self._hb_job = self.after(1000, self._schedule_heartbeat)

    # ══════════════════════════════════════════════════════════════════════════
    #  TAB 2 — TELEMETRY
    # ══════════════════════════════════════════════════════════════════════════

    def _build_telemetry_tab(self):
        f = self._tab_telemetry
        f.rowconfigure(0, weight=1)
        f.columnconfigure(0, weight=1)

        # Left: message type selector
        left = tk.Frame(f, bg=BG, width=180)
        left.pack(side="left", fill="y", padx=(8, 0), pady=8)
        left.pack_propagate(False)

        ttk.Label(left, text="Message Types",
                  style="Accent.TLabel").pack(anchor="w", pady=(0, 4))

        self._telem_listbox = tk.Listbox(
            left, bg=PANEL, fg=TXT, selectbackground="#0d3040",
            selectforeground=ACCENT, font=FONT_MONO2,
            borderwidth=0, highlightthickness=0, activestyle="none")
        self._telem_listbox.pack(fill="both", expand=True)
        self._telem_listbox.bind("<<ListboxSelect>>", self._on_telem_select)

        # Pre-populate listbox with known types
        self._telem_types = []

        # Right: field tree
        right = tk.Frame(f, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)

        self._telem_header = ttk.Label(right, text="Select a message type →",
                                       style="Accent.TLabel")
        self._telem_header.grid(row=0, column=0, sticky="w", pady=(0, 6))

        self._telem_tree = ttk.Treeview(right, columns=("field", "value"),
                                         show="headings", selectmode="none")
        self._telem_tree.heading("field", text="Field",  anchor="w")
        self._telem_tree.heading("value", text="Value",  anchor="w")
        self._telem_tree.column("field", width=260, stretch=False)
        self._telem_tree.column("value", width=400)
        self._telem_tree.grid(row=1, column=0, sticky="nsew")

        sb = ttk.Scrollbar(right, orient="vertical",
                           command=self._telem_tree.yview)
        sb.grid(row=1, column=1, sticky="ns")
        self._telem_tree.configure(yscrollcommand=sb.set)

        self._telem_tree.tag_configure("even", background=PANEL)
        self._telem_tree.tag_configure("odd",  background="#0a1620")

        self._telem_selected: str | None = None
        self._telem_last_update: dict[str, float] = {}

        # Age label
        self._telem_age_lbl = ttk.Label(right, text="", style="Dim.TLabel")
        self._telem_age_lbl.grid(row=2, column=0, sticky="w", pady=(4,0))

    def _on_telem_select(self, _evt=None):
        sel = self._telem_listbox.curselection()
        if sel:
            self._telem_selected = self._telem_listbox.get(sel[0])
            self._refresh_telem_tree()

    def _refresh_telem_tree(self):
        mt = self._telem_selected
        if not mt or mt not in self._telem:
            return
        data = self._telem[mt]
        self._telem_header.configure(text=f"  {mt}")
        self._telem_tree.delete(*self._telem_tree.get_children())
        for i, (k, v) in enumerate(data.items()):
            if k.startswith("_"):
                continue
            tag = "even" if i % 2 == 0 else "odd"
            self._telem_tree.insert("", "end", values=(k, v), tags=(tag,))
        age = time.time() - data.get("_ts", time.time())
        self._telem_age_lbl.configure(text=f"Last update: {age:.1f}s ago")

    # ══════════════════════════════════════════════════════════════════════════
    #  TAB 3 — MESSAGE REQUEST
    # ══════════════════════════════════════════════════════════════════════════

    def _build_request_tab(self):
        f = self._tab_request

        # ── On-demand single request ──────────────────────────────────────────
        lf1 = ttk.LabelFrame(f, text=" Request Single Message (on-demand) ", padding=12)
        lf1.pack(fill="x", padx=12, pady=10)

        row1 = tk.Frame(lf1, bg=BG)
        row1.pack(fill="x")
        ttk.Label(row1, text="Message:").pack(side="left")
        self._req_msg_var = tk.StringVar()
        req_cb = ttk.Combobox(row1, textvariable=self._req_msg_var,
                               values=sorted(KNOWN_MESSAGES.values()),
                               state="readonly", width=28)
        req_cb.pack(side="left", padx=(8,0))
        ttk.Button(row1, text="REQUEST NOW",
                   style="Accent.TButton",
                   command=self._request_single).pack(side="left", padx=8)

        # ── Set stream rate ───────────────────────────────────────────────────
        lf2 = ttk.LabelFrame(f, text=" Set Message Stream Rate ", padding=12)
        lf2.pack(fill="x", padx=12, pady=4)

        row2 = tk.Frame(lf2, bg=BG)
        row2.pack(fill="x")
        ttk.Label(row2, text="Message:").pack(side="left")
        self._rate_msg_var = tk.StringVar()
        ttk.Combobox(row2, textvariable=self._rate_msg_var,
                     values=sorted(KNOWN_MESSAGES.values()),
                     state="readonly", width=28).pack(side="left", padx=(8, 0))

        ttk.Label(row2, text="Hz:").pack(side="left", padx=(12, 0))
        self._rate_hz_var = tk.StringVar(value="10")
        hz_entry = ttk.Entry(row2, textvariable=self._rate_hz_var, width=6)
        hz_entry.pack(side="left", padx=(4, 0))

        ttk.Button(row2, text="SET RATE",
                   style="Accent.TButton",
                   command=self._set_rate).pack(side="left", padx=8)
        ttk.Button(row2, text="DISABLE (0 Hz)",
                   style="Danger.TButton",
                   command=self._disable_rate).pack(side="left")

        # ── Quick-request all ─────────────────────────────────────────────────
        lf3 = ttk.LabelFrame(f, text=" Bulk Request ", padding=12)
        lf3.pack(fill="x", padx=12, pady=4)

        row3 = tk.Frame(lf3, bg=BG)
        row3.pack(fill="x")
        ttk.Button(row3, text="REQUEST ALL KNOWN MESSAGES",
                   command=self._request_all).pack(side="left")
        ttk.Label(row3, text="  (sends REQUEST_MESSAGE for every known ID)",
                  style="Dim.TLabel").pack(side="left")

        # ── Response log ──────────────────────────────────────────────────────
        lf4 = ttk.LabelFrame(f, text=" Request / ACK Log ", padding=8)
        lf4.pack(fill="both", expand=True, padx=12, pady=4)
        lf4.rowconfigure(0, weight=1)
        lf4.columnconfigure(0, weight=1)

        self._req_log = scrolledtext.ScrolledText(
            lf4, bg=PANEL, fg=TXT, font=FONT_MONO2, wrap="none",
            relief="flat", state="disabled")
        self._req_log.grid(row=0, column=0, sticky="nsew")
        self._req_log.tag_configure("sent", foreground=ACCENT)
        self._req_log.tag_configure("ack",  foreground=ACCENT2)
        self._req_log.tag_configure("err",  foreground=DANGER)

    def _request_single(self):
        name = self._req_msg_var.get()
        if not name:
            return
        msg_id = next((k for k, v in KNOWN_MESSAGES.items() if v == name), None)
        if msg_id and self._mav_thread and self._mav_thread.connected:
            self._mav_thread.request_message(msg_id)
            self._req_log_write(f"→ REQUEST_MESSAGE  {name}  (ID={msg_id})", "sent")
        elif not (self._mav_thread and self._mav_thread.connected):
            self._req_log_write("✖ Not connected", "err")

    def _set_rate(self):
        name = self._rate_msg_var.get()
        if not name:
            return
        try:
            hz = float(self._rate_hz_var.get())
        except ValueError:
            messagebox.showerror("Error", "Hz must be a number")
            return
        msg_id = next((k for k, v in KNOWN_MESSAGES.items() if v == name), None)
        if msg_id and self._mav_thread and self._mav_thread.connected:
            self._mav_thread.set_message_interval(msg_id, hz)
            self._req_log_write(f"→ SET_MESSAGE_INTERVAL  {name}  {hz} Hz", "sent")
        elif not (self._mav_thread and self._mav_thread.connected):
            self._req_log_write("✖ Not connected", "err")

    def _disable_rate(self):
        name = self._rate_msg_var.get()
        if not name:
            return
        msg_id = next((k for k, v in KNOWN_MESSAGES.items() if v == name), None)
        if msg_id and self._mav_thread and self._mav_thread.connected:
            self._mav_thread.set_message_interval(msg_id, -1)
            self._req_log_write(f"→ DISABLE stream  {name}", "sent")

    def _request_all(self):
        if not (self._mav_thread and self._mav_thread.connected):
            self._req_log_write("✖ Not connected", "err")
            return
        for mid, name in KNOWN_MESSAGES.items():
            self._mav_thread.request_message(mid)
            self._req_log_write(f"→ REQUEST  {name}  (ID={mid})", "sent")

    def _req_log_write(self, text: str, tag: str = ""):
        self._req_log.configure(state="normal")
        ts = time.strftime("%H:%M:%S")
        self._req_log.insert("end", f"{ts}  {text}\n", tag)
        self._req_log.see("end")
        self._req_log.configure(state="disabled")

    # ══════════════════════════════════════════════════════════════════════════
    #  TAB 4 — COMMANDS
    # ══════════════════════════════════════════════════════════════════════════

    def _build_commands_tab(self):
        f = self._tab_commands
        f.columnconfigure(1, weight=1)
        f.rowconfigure(1, weight=1)

        # ── Presets ───────────────────────────────────────────────────────────
        lf_pre = ttk.LabelFrame(f, text=" Command Presets ", padding=10)
        lf_pre.grid(row=0, column=0, columnspan=2, sticky="ew", padx=12, pady=8)

        cols = 5
        for i, (name, params) in enumerate(COMMAND_PRESETS.items()):
            r, c = divmod(i, cols)
            col  = DANGER if "DISARM" in name or "REBOOT" in name else \
                   ACCENT2 if "ARM" == name else ACCENT
            btn = tk.Button(
                lf_pre, text=name, bg=PANEL, fg=col,
                font=("Courier New", 8, "bold"),
                relief="flat", bd=0, padx=6, pady=5,
                activebackground="#0d2030", activeforeground=col,
                highlightthickness=1, highlightbackground=BORDER,
                command=lambda p=params: self._load_preset(p))
            btn.grid(row=r, column=c, padx=4, pady=3, sticky="ew")

        # ── COMMAND_LONG manual ───────────────────────────────────────────────
        lf_cl = ttk.LabelFrame(f, text=" COMMAND_LONG  (Manual) ", padding=12)
        lf_cl.grid(row=1, column=0, sticky="nsew", padx=12, pady=4)

        self._cl_vars: dict[str, tk.StringVar] = {}
        fields_cl = [
            ("target_system",    "1"),
            ("target_component", "1"),
            ("command",          "400"),
            ("confirmation",     "0"),
            ("param1",           "0"),
            ("param2",           "0"),
            ("param3",           "0"),
            ("param4",           "0"),
            ("param5",           "0"),
            ("param6",           "0"),
            ("param7",           "0"),
        ]
        for r, (fname, default) in enumerate(fields_cl):
            ttk.Label(lf_cl, text=f"{fname}:", style="Dim.TLabel").grid(
                row=r, column=0, sticky="w", pady=2)
            v = tk.StringVar(value=default)
            self._cl_vars[fname] = v
            ttk.Entry(lf_cl, textvariable=v, width=14).grid(
                row=r, column=1, sticky="w", padx=(8, 0), pady=2)

        # MAV_CMD lookup
        lookup_row = len(fields_cl)
        ttk.Label(lf_cl, text="CMD name:", style="Dim.TLabel").grid(
            row=lookup_row, column=0, sticky="w", pady=2)
        self._cmd_name_lbl = ttk.Label(lf_cl, text="--", style="Accent.TLabel")
        self._cmd_name_lbl.grid(row=lookup_row, column=1, sticky="w", padx=(8,0))
        self._cl_vars["command"].trace_add("write", self._lookup_cmd_name)

        ttk.Button(lf_cl, text="SEND COMMAND_LONG", style="Accent.TButton",
                   command=self._send_command_long).grid(
            row=lookup_row+1, column=0, columnspan=2, pady=10, sticky="ew")

        # ── COMMAND_INT manual ────────────────────────────────────────────────
        lf_ci = ttk.LabelFrame(f, text=" COMMAND_INT  (Manual) ", padding=12)
        lf_ci.grid(row=1, column=1, sticky="nsew", padx=12, pady=4)

        self._ci_vars: dict[str, tk.StringVar] = {}
        fields_ci = [
            ("target_system",    "1"),
            ("target_component", "1"),
            ("frame",            "6"),
            ("command",          "400"),
            ("current",          "0"),
            ("autocontinue",     "0"),
            ("param1",           "0"),
            ("param2",           "0"),
            ("param3",           "0"),
            ("param4",           "0"),
            ("x (lat×1e7)",      "0"),
            ("y (lon×1e7)",      "0"),
            ("z (alt m)",        "0"),
        ]
        for r, (fname, default) in enumerate(fields_ci):
            ttk.Label(lf_ci, text=f"{fname}:", style="Dim.TLabel").grid(
                row=r, column=0, sticky="w", pady=2)
            v = tk.StringVar(value=default)
            self._ci_vars[fname] = v
            ttk.Entry(lf_ci, textvariable=v, width=14).grid(
                row=r, column=1, sticky="w", padx=(8, 0), pady=2)

        ttk.Button(lf_ci, text="SEND COMMAND_INT", style="Accent.TButton",
                   command=self._send_command_int).grid(
            row=len(fields_ci), column=0, columnspan=2, pady=10, sticky="ew")

        # ── ACK / response pane ───────────────────────────────────────────────
        lf_ack = ttk.LabelFrame(f, text=" Command ACK Log ", padding=8)
        lf_ack.grid(row=2, column=0, columnspan=2, sticky="ew", padx=12, pady=4)
        lf_ack.columnconfigure(0, weight=1)

        self._ack_log = scrolledtext.ScrolledText(
            lf_ack, bg=PANEL, fg=TXT, font=FONT_MONO2, height=6,
            relief="flat", state="disabled", wrap="none")
        self._ack_log.grid(row=0, column=0, sticky="ew")
        self._ack_log.tag_configure("sent",    foreground=ACCENT)
        self._ack_log.tag_configure("ok",      foreground=ACCENT2)
        self._ack_log.tag_configure("fail",    foreground=DANGER)
        self._ack_log.tag_configure("pending", foreground=WARN)

        f.rowconfigure(1, weight=1)

    def _lookup_cmd_name(self, *_):
        try:
            cid = int(self._cl_vars["command"].get())
            entry = mavutil.mavlink.enums.get("MAV_CMD", {}).get(cid, None)
            name  = entry.name if entry else "unknown"
        except (ValueError, AttributeError):
            name = "--"
        self._cmd_name_lbl.configure(text=name)

    def _load_preset(self, p: dict):
        self._cl_vars["command"].set(str(p["cmd"]))
        for i in range(1, 8):
            key = f"param{i}"
            self._cl_vars[key].set(str(p.get(f"p{i}", 0)))

    def _send_command_long(self):
        if not (self._mav_thread and self._mav_thread.connected):
            self._ack_log_write("✖ Not connected", "fail"); return
        try:
            v = self._cl_vars
            ok = self._mav_thread.send_command_long(
                int(v["target_system"].get()), int(v["target_component"].get()),
                int(v["command"].get()),       int(v["confirmation"].get()),
                float(v["param1"].get()),      float(v["param2"].get()),
                float(v["param3"].get()),      float(v["param4"].get()),
                float(v["param5"].get()),      float(v["param6"].get()),
                float(v["param7"].get()))
            if ok:
                self._ack_log_write(f"→ COMMAND_LONG  cmd={v['command'].get()} sent", "sent")
        except Exception as e:
            self._ack_log_write(f"✖ {e}", "fail")

    def _send_command_int(self):
        if not (self._mav_thread and self._mav_thread.connected):
            self._ack_log_write("✖ Not connected", "fail"); return
        try:
            v = self._ci_vars
            ok = self._mav_thread.send_command_int(
                int(v["target_system"].get()), int(v["target_component"].get()),
                int(v["frame"].get()),         int(v["command"].get()),
                int(v["current"].get()),       int(v["autocontinue"].get()),
                float(v["param1"].get()),      float(v["param2"].get()),
                float(v["param3"].get()),      float(v["param4"].get()),
                int(v["x (lat×1e7)"].get()),   int(v["y (lon×1e7)"].get()),
                float(v["z (alt m)"].get()))
            if ok:
                self._ack_log_write(f"→ COMMAND_INT  cmd={v['command'].get()} sent", "sent")
        except Exception as e:
            self._ack_log_write(f"✖ {e}", "fail")

    def _ack_log_write(self, text: str, tag: str = ""):
        self._ack_log.configure(state="normal")
        ts = time.strftime("%H:%M:%S")
        self._ack_log.insert("end", f"{ts}  {text}\n", tag)
        self._ack_log.see("end")
        self._ack_log.configure(state="disabled")

    # ══════════════════════════════════════════════════════════════════════════
    #  TAB 5 — RAW LOG
    # ══════════════════════════════════════════════════════════════════════════

    def _build_raw_tab(self):
        f = self._tab_raw
        f.rowconfigure(1, weight=1)
        f.columnconfigure(0, weight=1)

        # Controls row
        ctrl = tk.Frame(f, bg=BG)
        ctrl.grid(row=0, column=0, sticky="ew", padx=8, pady=6)

        ttk.Label(ctrl, text="Filter type:").pack(side="left")
        self._raw_filter_var = tk.StringVar(value="ALL")
        filter_values = ["ALL"] + sorted(KNOWN_MESSAGES.values())
        self._raw_filter_cb = ttk.Combobox(ctrl, textvariable=self._raw_filter_var,
                                            values=filter_values, state="readonly", width=22)
        self._raw_filter_cb.pack(side="left", padx=(6, 12))

        self._raw_paused = tk.BooleanVar(value=False)
        ttk.Checkbutton(ctrl, text="Pause", variable=self._raw_paused).pack(side="left", padx=4)
        ttk.Button(ctrl, text="Clear",
                   command=self._clear_raw).pack(side="left", padx=8)

        self._raw_count_lbl = ttk.Label(ctrl, text="0 lines", style="Dim.TLabel")
        self._raw_count_lbl.pack(side="right", padx=8)

        # Max lines cap
        ttk.Label(ctrl, text="Max lines:").pack(side="right")
        self._raw_max_var = tk.StringVar(value="500")
        ttk.Entry(ctrl, textvariable=self._raw_max_var, width=6).pack(side="right", padx=4)

        # Raw log text
        self._raw_log = scrolledtext.ScrolledText(
            f, bg=PANEL, fg=TXT_DIM, font=FONT_MONO2, wrap="none",
            relief="flat", insertbackground=ACCENT)
        self._raw_log.grid(row=1, column=0, sticky="nsew", padx=8, pady=(0, 8))

        # Colour tags per message type
        colours = [ACCENT, ACCENT2, WARN, "#ff9966", "#cc99ff", "#ff99cc",
                   "#66ccff", "#99ffcc", "#ffcc66", "#cc66ff"]
        self._type_colours: dict[str, str] = {}
        for i, name in enumerate(sorted(KNOWN_MESSAGES.values())):
            col = colours[i % len(colours)]
            self._raw_log.tag_configure(name, foreground=col)
            self._type_colours[name] = col

        self._raw_log.tag_configure("evt",  foreground="#8866cc")
        self._raw_log.tag_configure("err",  foreground=DANGER)
        self._raw_line_count = 0

    def _clear_raw(self):
        self._raw_log.delete("1.0", "end")
        self._raw_line_count = 0
        self._raw_count_lbl.configure(text="0 lines")

    def _raw_append(self, mt: str, data: dict):
        flt = self._raw_filter_var.get()
        if flt != "ALL" and mt != flt:
            return
        if self._raw_paused.get():
            return
        try:
            max_lines = int(self._raw_max_var.get())
        except ValueError:
            max_lines = 500

        ts   = time.strftime("%H:%M:%S")
        body = "  ".join(f"{k}={v}" for k, v in data.items() if not k.startswith("_"))
        line = f"{ts}  [{mt}]  {body}\n"
        tag  = mt if mt in self._type_colours else ""

        self._raw_log.configure(state="normal")
        self._raw_log.insert("end", line, tag)
        self._raw_line_count += 1

        # Trim if over cap
        if self._raw_line_count > max_lines + 50:
            self._raw_log.delete("1.0", f"{self._raw_line_count - max_lines}.0")
            self._raw_line_count = max_lines

        self._raw_log.see("end")
        self._raw_log.configure(state="disabled")
        self._raw_count_lbl.configure(text=f"{self._raw_line_count} lines")

    # ══════════════════════════════════════════════════════════════════════════
    #  MAIN POLL LOOP (runs in UI thread via after())
    # ══════════════════════════════════════════════════════════════════════════

    def _poll(self):
        try:
            limit = 60   # max messages to process per poll tick
            for _ in range(limit):
                try:
                    item = self._rx_queue.get_nowait()
                except queue.Empty:
                    break
                self._handle_item(item)
        finally:
            self.after(POLL_INTERVAL_MS, self._poll)

    def _handle_item(self, item: dict):
        # ── Internal events ───────────────────────────────────────────────────
        if "_event" in item:
            evt = item["_event"]
            if evt == "connecting":
                self._conn_label.configure(text="● CONNECTING…", fg=WARN)
            elif evt == "connected":
                self._conn_label.configure(text="● CONNECTED", fg=ACCENT2)
                self._stat_sysid.configure(text=str(item.get("sys_id", "--")))
                self._stat_compid.configure(text=str(item.get("comp_id", "--")))
                self._raw_append("EVENT", {"event": "Connected",
                                           "sys": item.get("sys_id"),
                                           "comp": item.get("comp_id")})
            elif evt == "disconnected":
                self._conn_label.configure(text="● DISCONNECTED", fg=DANGER)
                self._raw_append("EVENT", {"event": "Disconnected"})
            elif evt == "error":
                self._conn_label.configure(text=f"● ERROR: {item['msg'][:40]}", fg=DANGER)
                self._raw_append("EVENT", {"event": "Error", "msg": item["msg"]})
                messagebox.showerror("MAVLink Error", item["msg"])
                self._connect_btn.configure(state="normal")
                self._disconnect_btn.configure(state="disabled")
            elif evt == "rate":
                self._rate_label.configure(
                    text=f"{item['hz']:.1f} msg/s  |  {item['total']} total")
                self._stat_rate.configure(text=f"{item['hz']:.1f}")
                self._stat_total.configure(text=str(item["total"]))
                if self._connect_start:
                    up = int(time.time() - self._connect_start)
                    self._stat_uptime.configure(
                        text=f"{up//3600:02d}:{(up%3600)//60:02d}:{up%60:02d}")
            return

        # ── Parsed MAVLink message ────────────────────────────────────────────
        mt = item.get("_type", "UNKNOWN")

        # Store in live telem cache
        self._telem[mt] = item

        # Update telemetry listbox (add if new type)
        if mt not in self._telem_types:
            self._telem_types.append(mt)
            self._telem_listbox.insert("end", mt)

        # Refresh telem tree if this type is selected
        if self._telem_selected == mt:
            self._refresh_telem_tree()

        # Update connection-tab stats from key messages
        if mt == "HEARTBEAT":
            armed = item.get("armed", False)
            self._stat_armed.configure(
                text="YES" if armed else "NO",
                foreground=DANGER if armed else ACCENT2)
            mode = item.get("custom_mode", "--")
            self._stat_mode.configure(text=str(mode))
        elif mt == "SYS_STATUS":
            v   = item.get("voltage_V", "--")
            pct = item.get("battery_%", "--")
            self._stat_batt.configure(text=f"{v}V  {pct}%")
        elif mt == "STATUSTEXT":
            sev  = item.get("severity", "INFO")
            text = item.get("text", "")
            self._status_text.configure(state="normal")
            ts   = time.strftime("%H:%M:%S")
            self._status_text.insert("end", f"{ts}  [{sev}]  {text}\n", sev)
            self._status_text.see("end")
            self._status_text.configure(state="disabled")
        elif mt == "COMMAND_ACK":
            res  = item.get("result", -1)
            name = MAV_RESULT_NAMES.get(res, str(res))
            cmd  = item.get("command", "--")
            col  = "ok" if res == 0 else "fail"
            self._ack_log_write(f"← COMMAND_ACK  cmd={cmd}  result={res} ({name})", col)
            self._req_log_write(f"← COMMAND_ACK  cmd={cmd}  result={res} ({name})",
                                "ack" if res == 0 else "err")

        # Raw log
        self._raw_append(mt, item)


# ════════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app = App()
    app.mainloop()