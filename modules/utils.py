"""
TrackerMode v2.5 — Utility Helpers
PyInstaller path resolution, frame decoding, model download.
"""

import os
import sys
import base64
import urllib.request

import cv2
import numpy as np
from io import BytesIO
from typing import Optional
from PIL import Image


# ============================================================
#  PyInstaller path helper
# ============================================================

def resource_path(relative_path: str) -> str:
    """Resolve file path for both dev mode and PyInstaller .exe bundle."""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        # Go up one level from modules/ to project root
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


# ============================================================
#  Model download
# ============================================================

FACE_LANDMARKER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)
MODEL_PATH = resource_path("face_landmarker.task")


def download_model() -> bool:
    """Download the FaceLandmarker model file if not present."""
    if os.path.exists(MODEL_PATH):
        return True
    try:
        print("[v2.5] Downloading FaceLandmarker model (~5MB)...")
        urllib.request.urlretrieve(FACE_LANDMARKER_MODEL_URL, MODEL_PATH)
        print("[v2.5] Model downloaded successfully!")
        return True
    except Exception as e:
        print(f"[v2.5] Model download failed: {e}")
        return False


# ============================================================
#  Frame decoder
# ============================================================

def decode_frame(data_url: str) -> Optional[np.ndarray]:
    """Decode a base64 data-URL into an OpenCV BGR frame."""
    try:
        if "," in data_url:
            data_url = data_url.split(",")[1]
        img_bytes = base64.b64decode(data_url)
        img = Image.open(BytesIO(img_bytes))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        return frame
    except Exception as e:
        print(f"Frame decode error: {e}")
        return None
