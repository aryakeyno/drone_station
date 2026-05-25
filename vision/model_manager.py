"""
Model manager for object detection — discovery, listing, and loading.

Supports multiple detection frameworks:
  - YOLO (yolov8n, yolov8s, yolov8m, etc.)
  - (Extensible for other frameworks)

Model discovery:
  - Scans MODELS_FOLDER for detection models
  - Returns sorted list with YOLO as default
  - Validates model files exist before listing
"""

import os
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Default models folder (relative to project root)
DEFAULT_MODELS_FOLDER = "models"


class ModelManager:
    """Discover and manage object detection models."""
    
    # Supported model patterns: (file_pattern, model_type, framework)
    SUPPORTED_PATTERNS = [
        ("yolov8*.pt", "YOLO", "ultralytics"),      # YOLOv8 models
        ("yolov8*.onnx", "YOLO", "ultralytics"),    # YOLO ONNX
        ("*.pt", "YOLO", "ultralytics"),            # Generic PyTorch
    ]
    
    # YOLO model sizes (for sorting/priority)
    YOLO_PRIORITY = {
        "yolov8n": 1,  # nano — fastest, smallest
        "yolov8s": 2,  # small
        "yolov8m": 3,  # medium
        "yolov8l": 4,  # large
        "yolov8x": 5,  # extra large — slowest, biggest
    }
    
    def __init__(self, models_folder: str = DEFAULT_MODELS_FOLDER):
        """
        Initialize model manager.
        
        Args:
            models_folder: Path to folder containing model files.
                          If relative, resolves relative to project root.
        """
        self.models_folder = self._resolve_folder(models_folder)
        logger.info(f"📦 Model Manager initialized: {self.models_folder}")
    
    @staticmethod
    def _resolve_folder(folder: str) -> Path:
        """Resolve folder path (absolute or relative to project root)."""
        path = Path(folder)
        
        # If relative, make it relative to project root (where main.py lives)
        if not path.is_absolute():
            project_root = Path(__file__).parent.parent
            path = project_root / folder
        
        # Create folder if it doesn't exist
        path.mkdir(parents=True, exist_ok=True)
        logger.debug(f"📂 Models folder: {path}")
        
        return path
    
    def discover_models(self) -> List[Dict[str, str]]:
        """
        Discover all available detection models in models folder.
        
        Returns:
            List of dicts: [
                {
                    "name": "yolov8n",
                    "filename": "yolov8n.pt",
                    "path": "/full/path/to/yolov8n.pt",
                    "type": "YOLO",
                    "framework": "ultralytics",
                    "size_mb": 12.3
                },
                ...
            ]
            
            Sorted with YOLO nano first, then by priority, then alphabetically.
        """
        models = []
        
        if not self.models_folder.exists():
            logger.warning(f"⚠️  Models folder not found: {self.models_folder}")
            return []
        
        try:
            for file_path in self.models_folder.iterdir():
                if not file_path.is_file():
                    continue
                
                model_info = self._identify_model(file_path)
                if model_info:
                    models.append(model_info)
                    logger.debug(f"✅ Found model: {model_info['name']} ({model_info['filename']})")
        
        except Exception as exc:
            logger.error(f"❌ Error scanning models folder: {exc}")
            return []
        
        # Sort: YOLO nano first, then by priority, then alphabetically
        models.sort(key=lambda m: (
            0 if m['name'] == 'yolov8n' else 1,  # YOLO nano first
            self.YOLO_PRIORITY.get(m['name'], 999),  # Then by priority
            m['name']  # Then alphabetically
        ))
        
        logger.info(f"🔍 Discovered {len(models)} model(s)")
        for m in models:
            logger.info(f"   - {m['name']:20s} ({m['filename']:20s}) {m['size_mb']:6.1f}MB")
        
        return models
    
    def _identify_model(self, file_path: Path) -> Optional[Dict[str, str]]:
        """
        Identify a single model file.
        
        Args:
            file_path: Path to model file
            
        Returns:
            Model info dict or None if not recognized
        """
        filename = file_path.name
        
        # Check each supported pattern
        for pattern, model_type, framework in self.SUPPORTED_PATTERNS:
            if self._matches_pattern(filename, pattern):
                return {
                    "name": self._extract_model_name(filename),
                    "filename": filename,
                    "path": str(file_path),
                    "type": model_type,
                    "framework": framework,
                    "size_mb": round(file_path.stat().st_size / (1024**2), 1),
                }
        
        return None
    
    @staticmethod
    def _matches_pattern(filename: str, pattern: str) -> bool:
        """Check if filename matches glob pattern."""
        from fnmatch import fnmatch
        return fnmatch(filename.lower(), pattern.lower())
    
    @staticmethod
    def _extract_model_name(filename: str) -> str:
        """Extract model name from filename (without extension)."""
        return Path(filename).stem
    
    def get_model_by_name(self, name: str) -> Optional[Dict[str, str]]:
        """
        Get model info by name.
        
        Args:
            name: Model name (e.g., "yolov8n")
            
        Returns:
            Model info dict or None if not found
        """
        models = self.discover_models()
        for model in models:
            if model['name'].lower() == name.lower():
                return model
        return None
    
    def get_default_model(self) -> Optional[Dict[str, str]]:
        """
        Get default model (yolov8n if available, else first available).
        
        Returns:
            Model info dict or None if no models available
        """
        models = self.discover_models()
        
        if not models:
            logger.warning("⚠️  No models available")
            return None
        
        # Prefer yolov8n (nano)
        for model in models:
            if model['name'] == 'yolov8n':
                logger.info(f"✅ Default model: {model['name']}")
                return model
        
        # Fall back to first model
        logger.info(f"✅ Default model: {models[0]['name']} (yolov8n not available)")
        return models[0]
    
    def get_model_display_list(self) -> Tuple[List[str], str]:
        """
        Get model display list and default selection for GUI.
        
        Returns:
            (display_list, default_selection) where:
            - display_list: List of strings like "yolov8n (12.3 MB)"
            - default_selection: First item in list (for combo default)
        """
        models = self.discover_models()
        
        if not models:
            logger.warning("⚠️  No models found; using fallback")
            return ["yolov8n (offline)"], "yolov8n (offline)"
        
        display_list = [
            f"{m['name']} ({m['size_mb']}MB)"
            for m in models
        ]
        
        default = display_list[0]  # Already sorted, first is YOLO nano or first available
        
        return display_list, default
    
    def load_model(self, model_name: str):
        """
        Load a model by name.
        
        Args:
            model_name: Name of model to load (e.g., "yolov8n")
            
        Returns:
            (success: bool, model_path: str or error_msg: str)
        """
        model_info = self.get_model_by_name(model_name)
        
        if not model_info:
            msg = f"❌ Model not found: {model_name}"
            logger.error(msg)
            return False, msg
        
        model_path = model_info['path']
        
        if not os.path.exists(model_path):
            msg = f"❌ Model file not found: {model_path}"
            logger.error(msg)
            return False, msg
        
        logger.info(f"✅ Loading model: {model_name} from {model_path}")
        return True, model_path


# ============================================================================
# Convenience functions
# ============================================================================

def discover_models(models_folder: str = DEFAULT_MODELS_FOLDER) -> List[Dict[str, str]]:
    """Discover all available models in a folder."""
    manager = ModelManager(models_folder)
    return manager.discover_models()


def get_default_model(models_folder: str = DEFAULT_MODELS_FOLDER) -> Optional[Dict[str, str]]:
    """Get default model (YOLO nano preferred)."""
    manager = ModelManager(models_folder)
    return manager.get_default_model()


def get_model_display_list(models_folder: str = DEFAULT_MODELS_FOLDER) -> Tuple[List[str], str]:
    """Get display list and default for GUI combo."""
    manager = ModelManager(models_folder)
    return manager.get_model_display_list()
