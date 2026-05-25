# gui/startup.py (IMPROVED - with Hardware Level Selection)
"""
Startup configuration GUI — PySimpleGUI edition.

IMPROVEMENTS:
  ✅ Model selection listbox (from model_manager.py)
  ✅ Hardware level selector (dropdown)
  ✅ Auto-tuning of detection parameters based on hardware
  ✅ Per-camera detection toggle support

Sections:
  • PX4 Flight Controller  — COM port combo
  • Cameras                — enable toggle, per-camera checkboxes, layout combo
  • Detection Settings     — Model selection, Hardware level selector
  • Joystick               — joystick combo
  • Optional AI Features   — checkboxes for voice, wake word, AI advisor
"""

import queue
import threading
import logging
import sys
from pathlib import Path

# Add project root to path to import local PySimpleGUI module
sys.path.insert(0, str(Path(__file__).parent.parent))

import cv2
import pygame
import serial.tools.list_ports
import PySimpleGUI as sg

from config.settings import config
from vision.model_manager import ModelManager

logger = logging.getLogger(__name__)

# ── Theme ────────────────────────────────────────────────────────────────────
sg.theme("DarkGrey13")

ACCENT   = "#00ff00"
BG       = "#1a1a1a"
BG2      = "#2a2a2a"
TEXT     = "#ffffff"
TEXT_DIM = "#888888"

# ── Hardware Level Presets ──────────────────────────────────────────────────
HARDWARE_PRESETS = {
    "Modern Laptop (i5+, 8GB+ RAM)": {
        "description": "Intel i5/i7 or AMD Ryzen 5+, 8GB+ RAM",
        "detection_max_concurrent": 1,
        "detection_frame_skip": 1,
        "detection_adaptive_skip": True,
        "recommended_model": "yolov8s",
        "expected_fps": "25-30 FPS",
        "inference_time": "80-120ms",
    },
    "Standard Laptop (i3/i5, 4GB RAM)": {
        "description": "Intel i3/i5 or AMD Ryzen 3/5, 4GB RAM",
        "detection_max_concurrent": 1,
        "detection_frame_skip": 2,
        "detection_adaptive_skip": True,
        "recommended_model": "yolov8n",
        "expected_fps": "15-20 FPS",
        "inference_time": "120-150ms",
    },
    "Weak Hardware (RPi 4, Atom, old CPU)": {
        "description": "Raspberry Pi 4, Intel Atom, or older CPUs with 4GB RAM",
        "detection_max_concurrent": 1,
        "detection_frame_skip": 4,
        "detection_adaptive_skip": True,
        "recommended_model": "yolov8n",
        "expected_fps": "8-12 FPS",
        "inference_time": "300-500ms",
    },
    "Very Limited Hardware (RPi Zero, <2GB RAM)": {
        "description": "Raspberry Pi Zero, 1GB-2GB RAM systems",
        "detection_max_concurrent": 1,
        "detection_frame_skip": 8,
        "detection_adaptive_skip": True,
        "recommended_model": "yolov8n",
        "expected_fps": "3-5 FPS",
        "inference_time": "800-1200ms",
    },
}

# ── Layout catalogue ─────────────────────────────────────────────────────────
LAYOUTS: dict[int, list[tuple[str, str]]] = {
    1: [
        ("single",           "Single  [ □ ]"),
    ],
    2: [
        ("side_by_side",     "Side by Side  [ L | R ]"),
        ("top_bottom",       "Top / Bottom  [ T ] / [ B ]"),
    ],
    3: [
        ("three_left_main",  "Main Left   [ Main | s1 ] / [ Main | s2 ]"),
        ("three_right_main", "Main Right  [ s1 | Main ] / [ s2 | Main ]"),
        ("three_top_main",   "Main Top    [ Main ] / [ s1 | s2 ]"),
    ],
    4: [
        ("grid_2x2",         "2 × 2 Grid  [ c0 | c1 ] / [ c2 | c3 ]"),
    ],
}

from PIL import Image
import io

def _load_resized_image(path: str, width: int, height: int) -> bytes:
    """Load and resize image using PIL."""
    try:
        img = Image.open(path)
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Convert to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        return img_bytes.getvalue()
    except Exception as e:
        logger.error(f"Could not load image {path}: {e}")
        return None

# ── Hardware detection ────────────────────────────────────────────────────────

def _get_com_ports() -> list[str]:
    ports = [p.device for p in serial.tools.list_ports.comports()]
    return ports if ports else ["COM7"]


def _get_available_cameras() -> list[int]:
    """Probe indices 0-5 in parallel; return sorted list of working camera IDs."""
    result_q: queue.Queue[int] = queue.Queue()

    def check(idx: int) -> None:
        try:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if cap.grab():
                    result_q.put(idx)
            cap.release()
        except Exception:
            pass

    threads = [
        threading.Thread(target=check, args=(i,), daemon=True)
        for i in range(6)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=2.0)

    found: list[int] = []
    while not result_q.empty():
        found.append(result_q.get_nowait())
    return sorted(found)


def _get_available_joysticks() -> list[str]:
    try:
        pygame.init()
        pygame.joystick.init()
        out = []
        for i in range(pygame.joystick.get_count()):
            try:
                j = pygame.joystick.Joystick(i)
                j.init()
                out.append(f"{i}: {j.get_name()}")
            except Exception:
                continue
        return out if out else ["No Joystick Detected"]
    except Exception as exc:
        logger.error(f"Joystick enumeration error: {exc}")
        return ["No Joystick Detected"]


def _get_available_models() -> tuple[list[str], str]:
    """
    Get available detection models from models folder.
    
    Returns:
        (model_display_list, default_selection)
    """
    try:
        manager = ModelManager(config.models_folder)
        display_list, default_sel = manager.get_model_display_list()
        logger.info(f"✅ Found {len(display_list)} model(s): {display_list}")
        return display_list, default_sel
    except Exception as exc:
        logger.warning(f"⚠️  Model discovery error: {exc}")
        return ["yolov8n (offline)"], "yolov8n (offline)"


# ── Layout catalogue helpers ──────────────────────────────────────────────────

def _clamp_count(count: int) -> int:
    return max(1, min(count, 4))


def _layout_keys(count: int) -> list[str]:
    return [k for k, _ in LAYOUTS.get(_clamp_count(count), LAYOUTS[1])]


def _layout_display(count: int) -> list[str]:
    return [lbl for _, lbl in LAYOUTS.get(_clamp_count(count), LAYOUTS[1])]


# ── Build window layout ───────────────────────────────────────────────────────

def _build_window( ports: list[str], cameras: list[int], joysticks: list[str], models: list[str], default_model: str,) -> sg.Window:

    def lbl(text: str, dim: bool = False) -> sg.Text:
        return sg.Text( text, background_color=BG, text_color=TEXT_DIM if dim else TEXT, )

    def frame(title: str, rows: list) -> sg.Frame:
        return sg.Frame( title, rows, title_color=ACCENT, background_color=BG, relief=sg.RELIEF_RIDGE, expand_x=True, pad=(12, 6), )

    # ── COM port ─────────────────────────────────────────────────────────────
    com_frame = frame("PX4 Flight Controller", [
        [lbl("Select COM Port:")],
        [sg.Combo( ports, default_value=ports[0], key="-PORT-", readonly=True, size=(40, 1), background_color=BG2, text_color=TEXT, )],
    ])

    # ── Camera checkboxes ─────────────────────────────────────────────────────
    enable_cb = sg.Checkbox( "Enable Camera Streaming", default=True, key="-CAM-ENABLE-", background_color=BG, text_color=ACCENT, enable_events=True, )

    if cameras:
        cam_rows = [[
                    sg.Checkbox( f"Camera {idx}", default=(idx == cameras[0]), key=f"-CAM-{idx}-", background_color=BG, text_color=TEXT, enable_events=True, )
                         ] for idx in cameras]

        cam_frame = sg.Frame( "Select cameras to use", cam_rows, background_color=BG, title_color=TEXT_DIM, relief=sg.RELIEF_FLAT, )
        manual_rows: list = []
    else:
        cam_frame = sg.Frame(
                                "No cameras auto-detected",
                                [
                                    [sg.Text( "Enter camera index to try manually:", background_color=BG, text_color="#ff6666", )],
                                    [sg.Input( "0", key="-MANUAL-CAM-", size=(6, 1), background_color=BG2, text_color=TEXT, )],
                                ],
                                background_color=BG, title_color="#ff6666",
                                relief=sg.RELIEF_FLAT,
                            )
        manual_rows = []

    # Initial layout options — only first camera is pre-checked
    init_count   = _clamp_count(1 if cameras else 1)
    init_display = _layout_display(init_count)

    camera_frame = frame("📷 Cameras", [
        [enable_cb],
        [cam_frame],
        *manual_rows,
        [lbl("Composite Layout:")],
        [sg.Combo( init_display, default_value=init_display[0], key="-LAYOUT-", readonly=True, size=(46, 1), background_color=BG2, text_color=TEXT, )],
        # Ratio slider row — visible only when exactly 3 cameras selected
        [            lbl("Main panel ratio (3-camera layouts):", dim=True),
            sg.Slider(range=(0.40, 0.80),default_value=config.layout_main_ratio,resolution=0.05,orientation="h",key="-RATIO-",size=(18, 12),background_color=BG,trough_color=BG2,text_color=TEXT,visible=False,),
        ],
        [lbl("Output resolution W × H:", dim=True)],
        [
            sg.Input( str(config.composite_width), key="-W-", size=(6, 1), background_color=BG2, text_color=TEXT, ),
            sg.Text("×", background_color=BG, text_color=TEXT),
            sg.Input( str(config.composite_height), key="-H-", size=(6, 1), background_color=BG2, text_color=TEXT, ),
        ],
    ])

    # ── Joystick ──────────────────────────────────────────────────────────────
    joy_frame = frame("🎮 Joystick", [
        [lbl("Select Joystick:")],
        [sg.Combo( joysticks, default_value=joysticks[0], key="-JOY-", readonly=True, size=(40, 1), background_color=BG2, text_color=TEXT, )],
    ])

    # ── DETECTION SETTINGS FRAME (NEW) ──────────────────────────────────────
    hardware_levels = list(HARDWARE_PRESETS.keys())
    default_hw = hardware_levels[0]  # Modern Laptop
    
    detection_frame = frame("🔍 Detection Settings", [
        [sg.Text( "Select your hardware level to auto-tune detection parameters:", background_color=BG, text_color=TEXT_DIM, font=("Helvetica", 9), )],
        [lbl("Hardware Level:")],
        [sg.Combo( hardware_levels, default_value=default_hw, key="-HARDWARE-LEVEL-", readonly=True, size=(50, 1), background_color=BG2, text_color=TEXT, enable_events=True, )],
        [lbl("Recommended Model:", dim=True)],
        [sg.Text( f"(Will be auto-selected based on hardware)", background_color=BG, text_color=TEXT_DIM, font=("Helvetica", 8), key="-HW-RECOMMENDED-MODEL-", )],
        [lbl("Expected Performance:", dim=True)],
        [sg.Text( f"FPS: — | Inference: —", background_color=BG, text_color=TEXT_DIM, font=("Helvetica", 8), key="-HW-PERFORMANCE-", )],
        [lbl("OR manually select detection model:")],
        [sg.Combo( models, default_value=models[0] if models else "yolov8n (offline)", key="-MODEL-SELECT-", readonly=True, size=(40, 1), background_color=BG2, text_color=TEXT, )],
    ])

    # ── Optional AI Features ──────────────────────────────────────────────────
    features_frame = frame("🤖 Optional AI Features (Heavy Models)", [
        [sg.Text( "Select which features to load (can add/remove later):", background_color=BG, text_color=TEXT_DIM, font=("Helvetica", 9), )],
        [sg.Checkbox( "🎤 Voice Commands (Whisper STT + Mistral Intent)", default=False, key="-VOICE-ENABLED-", background_color=BG, text_color=TEXT, tooltip="Speech-to-text + intent parsing. Requires microphone + Mistral LLM.", )],
        [sg.Checkbox( "👁️  Wake Word Detection (openwakeword)", default=False, key="-WAKE-ENABLED-", background_color=BG, text_color=TEXT, tooltip="'Hey Station' wake word detection. Requires voice models (~4 MB).", )],
        [sg.Checkbox( "🤓 AI Advisor (Ollama/Mistral)", default=False, key="-AI-ADVISOR-ENABLED-", background_color=BG, text_color=TEXT, tooltip="AI guidance for flight. Requires LLM (Ollama/Mistral).", )],
    ])

    # ── Buttons ───────────────────────────────────────────────────────────────
    btn_row = [
        sg.Button( "▶  START STATION", key="-START-", button_color=("#000000", "#00aa00"), font=("Helvetica", 10, "bold"),size=(30, 1), pad=(8, 4), ),
        sg.Button( "✕  EXIT"         , key="-EXIT-",  button_color=("#ffffff", "#aa0000"), font=("Helvetica", 10),   size=(30, 1),     pad=(8, 4), ),
    ]

    # Left column: PX4, Cameras, Joystick
    col_left = sg.Column(
        [
            [com_frame],
            [camera_frame],
            [joy_frame],
        ],
        pad=(0, 0),
        vertical_alignment='top'
    )

    # Right column: Detection Settings, AI Features
    col_right = sg.Column(
        [
            [detection_frame],
            [features_frame],
        ],
        pad=(0, 0),
        vertical_alignment='top'
    )

    logo_data  = _load_resized_image("config/kgc.png", 150, 100)
    #------------------------------------- Main layout---------------------------------------------------
    layout = [
       [
            sg.Column(
                        [
                            [
                                sg.Image(data=logo_data,background_color=BG) if logo_data else sg.Text("📷", font=("Helvetica", 100)),
                                sg.Text("Drone Setup", font=("Helvetica", 16, "bold"), text_color=ACCENT, background_color=BG)
                            ]
                        ],
                        element_justification='center',
                        justification='center',
                        background_color=BG
                    )
        ],
        [col_left, col_right],
        [sg.Column([btn_row], background_color=BG, justification="center", pad=(0, 12))],
        [sg.Text( f"Keyno Guidance and control, version {config.version_major}.{config.version_minor}.{config.version_patch}", background_color=BG, text_color=TEXT_DIM, font=("Helvetica", 10), )],
    ]

    return sg.Window( "Drone Station Setup", layout, background_color=BG, finalize=True, resizable=False, element_justification="left", )


# ── Event helpers ─────────────────────────────────────────────────────────────

def _selected_count(cameras: list[int], values: dict) -> int:
    """How many camera checkboxes are currently ticked (clamped 1-4)."""
    if not cameras:
        return 1
    return _clamp_count(sum(1 for i in cameras if values.get(f"-CAM-{i}-")))


def _refresh_layout_combo( window: sg.Window, cameras: list[int], values: dict,) -> None:
    """Update layout combo values and ratio slider visibility."""
    count        = _selected_count(cameras, values)
    display_vals = _layout_display(count)

    # Preserve current selection if it's still valid
    current = values.get("-LAYOUT-", "")
    new_val = current if current in display_vals else display_vals[0]

    window["-LAYOUT-"].update(values=display_vals, value=new_val)
    window["-RATIO-"].update(visible=(count == 3))


def _update_hardware_display(window: sg.Window, hardware_level: str) -> None:
    """Update hardware level performance display."""
    preset = HARDWARE_PRESETS.get(hardware_level)
    if preset:
        window["-HW-RECOMMENDED-MODEL-"].update( f"Recommended: {preset['recommended_model']} | Frame Skip: {preset['detection_frame_skip']}" )
        window["-HW-PERFORMANCE-"      ].update( f"FPS: {preset['expected_fps']} | Inference: {preset['inference_time']}" )


# ── Public entry point ────────────────────────────────────────────────────────

def launch_config_gui() -> None:
    """
    Show the startup GUI and block until the user clicks START or EXIT.
    Writes selected values directly into the global `config` singleton.
    """
    import sys

    logger.info("Detecting hardware …")
    ports     = _get_com_ports()
    cameras   = _get_available_cameras()
    joysticks = _get_available_joysticks()
    models, default_model = _get_available_models()
    logger.info(f"  COM ports : {ports}")
    logger.info(f"  Cameras   : {cameras}")
    logger.info(f"  Joysticks : {joysticks}")
    logger.info(f"  Models    : {models}")

    window = _build_window(ports, cameras, joysticks, models, default_model)
    
    # Update hardware display on startup
    _update_hardware_display(window, list(HARDWARE_PRESETS.keys())[0])

    while True:
        event, values = window.read()

        # ── Closed / EXIT ─────────────────────────────────────────────────
        if event in (sg.WIN_CLOSED, "-EXIT-"):
            if sg.popup_yes_no( "Exit without starting?", title="Confirm Exit", background_color=BG, text_color=TEXT, ) == "Yes":
                window.close()
                sys.exit(0)
            continue

        # ── Any camera checkbox changed → rebuild layout combo ────────────
        if event == "-CAM-ENABLE-" or ( isinstance(event, str) and event.startswith("-CAM-") ):
            _refresh_layout_combo(window, cameras, values)
            continue

        # ── Hardware level changed → update display ─────────────────────
        if event == "-HARDWARE-LEVEL-":
            hardware_level = values.get("-HARDWARE-LEVEL-", "")
            _update_hardware_display(window, hardware_level)
            
            # Auto-select recommended model if available
            preset = HARDWARE_PRESETS.get(hardware_level)
            if preset:
                recommended = preset['recommended_model']
                # Find matching model in list
                for model in models:
                    if model.startswith(recommended):
                        window["-MODEL-SELECT-"].update(model)
                        break
            continue

        # ── START ─────────────────────────────────────────────────────────
        if event == "-START-":

            # Camera selection
            cam_enabled = values["-CAM-ENABLE-"]
            if cameras:
                selected_ids = [i for i in cameras if values.get(f"-CAM-{i}-")]
                if cam_enabled and not selected_ids:
                    sg.popup_ok(
                                    "No cameras are checked.\n"
                                    "Tick at least one camera or uncheck\n"
                                    "'Enable Camera Streaming'.",
                                    title="No Camera Selected",
                                    background_color=BG, text_color="#ffaa00",
                                )
                    continue
                if not selected_ids:
                    selected_ids = cameras[:1] or [0]
            else:
                try:
                    selected_ids = [int(values.get("-MANUAL-CAM-", "0"))]
                except ValueError:
                    selected_ids = [0]

            # Output resolution
            try:
                comp_w = int(values["-W-"])
                comp_h = int(values["-H-"])
                if comp_w < 160 or comp_h < 120:
                    raise ValueError("Resolution too small")
            except ValueError as exc:
                sg.popup_ok(
                                f"Invalid output resolution: {exc}\n"
                                "Please enter positive integers (e.g. 1280 × 720).",
                                title="Invalid Resolution",
                                background_color=BG, text_color="#ffaa00",
                            )
                continue

            # Map displayed label → internal layout key
            count        = _selected_count(cameras, values)
            keys         = _layout_keys(count)
            disp         = _layout_display(count)
            chosen       = values.get("-LAYOUT-", disp[0])
            try:
                layout_key = keys[disp.index(chosen)]
            except (ValueError, IndexError):
                layout_key = keys[0] if keys else "single"

            # Joystick
            joy_sel = values["-JOY-"]
            joy_id  = -1 if "No Joystick" in joy_sel \
                else int(joy_sel.split(":")[0])

            # ── Hardware level & detection settings ─────────────────────
            hardware_level = values.get("-HARDWARE-LEVEL-", "")
            preset = HARDWARE_PRESETS.get(hardware_level)
            
            if preset:
                config.detection_max_concurrent = preset["detection_max_concurrent"]
                config.detection_frame_skip = preset["detection_frame_skip"]
                config.detection_adaptive_skip = preset["detection_adaptive_skip"]
                logger.info(f"✅ Applied hardware preset: {hardware_level}")
                logger.info(f"   Max concurrent: {config.detection_max_concurrent}")
                logger.info(f"   Frame skip: {config.detection_frame_skip}")
                logger.info(f"   Adaptive skip: {config.detection_adaptive_skip}")

            # ── Write to config ───────────────────────────────────────────
            config.com_port          = values["-PORT-"].split()[0]
            config.camera_ids        = selected_ids
            config.camera_enabled    = cam_enabled
            config.camera_layout     = layout_key
            config.layout_main_ratio = float(values["-RATIO-"])
            config.composite_width   = comp_w
            config.composite_height  = comp_h
            config.joystick_id       = joy_id
            
            # ── Optional AI Features ──────────────────────────────────────
            config.voice_commands_enabled = values.get("-VOICE-ENABLED-", False)
            config.wake_word_enabled      = values.get("-WAKE-ENABLED-", False)
            config.yolo_detection_enabled = True  # Now always set to True (separate from checkbox)
            config.ai_advisor_enabled     = values.get("-AI-ADVISOR-ENABLED-", False)
            
            # ── Set selected detection model ───────────────────────────────
            selected_model_display = values.get("-MODEL-SELECT-", default_model)
            # Extract model name from display string (e.g., "yolov8n (12.3MB)" → "yolov8n")
            model_name = selected_model_display.split()[0]
            
            # Load model path from model manager
            manager = ModelManager(config.models_folder)
            model_info = manager.get_model_by_name(model_name)
            
            if model_info:
                config.selected_model = model_name
                config.yolo_model_path = model_info['path']
                logger.info(f"✅ Selected model: {model_name} → {model_info['path']}")
            else:
                logger.warning(f"⚠️  Model not found: {model_name}, using default")
                default_info = manager.get_default_model()
                if default_info:
                    config.selected_model = default_info['name']
                    config.yolo_model_path = default_info['path']

            # ── Summary ───────────────────────────────────────────────────
            cam_str = ", ".join(f"Cam {i}" for i in selected_ids)
            features = []
            if config.voice_commands_enabled:
                features.append("🎤 Voice Commands")
            if config.wake_word_enabled:
                features.append("👁️  Wake Word")
            if config.yolo_detection_enabled:
                features.append(f"🔍 YOLO ({config.selected_model})")
            if config.ai_advisor_enabled:
                features.append("🤓 AI Advisor")
            features_str = ", ".join(features) if features else "None"
            
            sg.popup_ok(
                        f"COM Port          :  {config.com_port}\n"
                        f"Cameras           :  {cam_str}  (enabled={cam_enabled})\n"
                        f"Layout            :  {layout_key}\n"
                        f"Output            :  {comp_w} × {comp_h}\n"
                        f"Joystick          :  {joy_id if joy_id >= 0 else 'None'}\n"
                        f"Hardware Level    :  {hardware_level}\n"
                        f"Frame Skip        :  {config.detection_frame_skip}\n"
                        f"Max Concurrent    :  {config.detection_max_concurrent}\n"
                        f"AI Features       :  {features_str}\n\n"
                        "System starting up…",
                        title="✅ Configuration Saved",
                        background_color=BG, text_color=ACCENT,
                    )
            break   # leave event loop

    window.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    launch_config_gui()