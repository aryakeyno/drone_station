from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class AppConfig:
    version_major: str = "0"
    version_minor: str = "2"
    version_patch: str = "1"
    # ------------------------------------------------------------------ #
    # Hardware Configuration
    # ------------------------------------------------------------------ #
    com_port: str = "COM21"
    baud_rate: int = 115200
    joystick_id: int = 0

    # ------------------------------------------------------------------ #
    # Camera Configuration  (multi-camera)
    # ------------------------------------------------------------------ #
    # List of OpenCV camera indices that are active (e.g. [0, 1, 2])
    camera_ids: List[int] = field(default_factory=lambda: [0])
    camera_enabled: bool = True
    
    # ================================================================
    # Object Detection Model Configuration
    # ================================================================
    # Folder containing detection models (YOLO, etc.)
    models_folder: str = "models"
    
    # Selected detection model name (e.g., "yolov8n", "yolov8s")
    selected_model: str = "yolov8n"
    
    # Full path to selected model (set dynamically by GUI)
    yolo_model_path: str = "models/yolov8n.pt"   # Updated by GUI with selected model

    # ================================================================
    # Object Detection Configuration
    # ================================================================
   
    
    # Run YOLO inference in a background thread pool
    detection_async_mode: bool = True
    
    # Confidence threshold for YOLO detections (0.0-1.0)
    detection_confidence: float = 0.5


    # ================================================================
    # DETECTION OPTIMIZATION SETTINGS
    # ================================================================
    
    # Maximum number of YOLO inferences running simultaneously.
    # Recommended values based on hardware:
    #   1 = Safest (processes one frame at a time)
    #   2 = For dual-core+ systems with 4GB+ RAM
    #   4+ = Not recommended for weak hardware
    detection_max_concurrent: int = 1  # CRITICAL: Start at 1!
    
    # Skip ratio for frame processing (higher = skip more frames)
    # Examples:
    #   1 = Process every frame (100% load)
    #   2 = Process every 2nd frame (50% load) ← recommended for 2-3 cameras
    #   4 = Process every 4th frame (25% load) ← for 4+ cameras or weak hardware
    #  10 = Process every 10th frame (10% load) ← RPi, very limited hardware
    detection_frame_skip: int = 2
    
    # Enable adaptive frame skipping (skip more if queue backs up)
    detection_adaptive_skip: bool = True
    
    # Maximum frames waiting in detection queue before adapter skip kicks in
    detection_max_queue_depth: int = 5



    # ------------------------------------------------------------------ #
    # Composite Layout
    # ------------------------------------------------------------------ #
    # Selectable layouts per camera count:
    #
    #  1 camera  : "single"
    #
    #  2 cameras : "side_by_side"    ──  [L | R]
    #              "top_bottom"      ──  [T]
    #                                    [B]
    #
    #  3 cameras : "three_left_main" ──  [  Main  | s1 ]
    #                                    [        | s2 ]
    #              "three_right_main"──  [ s1 |   Main ]
    #                                    [ s2 |        ]
    #              "three_top_main"  ──  [   Main     ]
    #                                    [ s1 |  s2   ]
    #
    #  4 cameras : "grid_2x2"       ──  [ c0 | c1 ]
    #                                    [ c2 | c3 ]
    #
    camera_layout: str = "side_by_side"

    # Fraction of composite width/height given to the "main" panel in
    # asymmetric 3-camera layouts.
    layout_main_ratio: float = 0.65

    # Final composite output resolution (pixels)
    composite_width: int = 1280
    composite_height: int = 720

    # ------------------------------------------------------------------ #
    # Server Configuration
    # ------------------------------------------------------------------ #
    websocket_port: int = 8765

    # ------------------------------------------------------------------ #
    # UI Customisation
    # ------------------------------------------------------------------ #
    background_color: str = "#1a1a1a"
    background_image_path: Optional[str] = None
    ui_theme: str = "dark"   # "dark" | "light"
    speaker_voice_preference: str = "edge"  # "edge" | "native" | "robotic"

    # ------------------------------------------------------------------ #
    # Optional AI Features (user selects in GUI)
    # ------------------------------------------------------------------ #
    # Heavy models - deferred until after GUI config
    voice_commands_enabled: bool = False      # Speech-to-text + intent parsing
    wake_word_enabled: bool = False           # Wake word detection ("Hey Station")
    yolo_detection_enabled: bool = False      # Computer vision / object detection
    ai_advisor_enabled: bool = False          # AI advisor for drone commands


# Singleton used throughout the application
config = AppConfig()


# Scenario 2: Weak Laptop / Older i5 (4GB RAM, older CPU)
# pythondetection_max_concurrent = 1      # Sequential inference
# detection_frame_skip = 2          # Process 50% of frames
# detection_adaptive_skip = True
# Expected: 20-25 FPS on 2 cameras
# Inference time per frame: 100-150ms

# Scenario 3: Raspberry Pi 4 (4GB)
# pythondetection_max_concurrent = 1
# detection_frame_skip = 4          # Process 25% of frames
# detection_adaptive_skip = True    # Defensive: skip more if queue backs up
# Expected: 5-8 FPS on 2 cameras (use lightweight model yolov8n)
# Inference time per frame: 400-600ms

# Scenario 4: Jetson Nano / TX2
# pythondetection_max_concurrent = 1
# detection_frame_skip = 2
# detection_adaptive_skip = True
# # (Consider using TensorRT-optimized YOLO if available)
# Expected: 10-15 FPS on 2 cameras
# Inference time per frame: 200-400ms