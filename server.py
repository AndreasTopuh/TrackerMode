"""
TrackerMode v2 — Focus Tracker Backend Server
FastAPI + WebSocket for real-time webcam attention tracking with OpenCV.
"""

import cv2
import numpy as np
import base64
import json
import time
import os
from io import BytesIO
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image

app = FastAPI(title="TrackerMode v2 — Focus Tracker")

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AttentionAnalyzer:
    """Analyzes webcam frames to determine user attention level."""

    def __init__(self):
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'
        )

        # Tracking state
        self.last_face_time = time.time()
        self.face_detected_count = 0
        self.no_face_count = 0
        self.attention_history = []  # rolling window of scores
        self.history_max = 30  # keep last 30 scores for smoothing

    def analyze_frame(self, frame: np.ndarray) -> dict:
        """
        Analyze a single frame and return attention data.
        Returns dict with: attention_score (0-100), face_detected, eyes_detected, details
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)  # improve detection in varying light

        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.3, minNeighbors=5, minSize=(80, 80)
        )

        result = {
            "face_detected": False,
            "eyes_detected": 0,
            "face_position": "none",
            "attention_score": 0,
            "looking_at_screen": False,
            "timestamp": time.time()
        }

        if len(faces) == 0:
            self.no_face_count += 1
            self.face_detected_count = 0
            # No face = low attention
            score = max(0, 20 - self.no_face_count * 2)
            result["attention_score"] = score
            result["face_position"] = "not_visible"
            self._add_to_history(score)
            return result

        # Take the largest face
        faces_sorted = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        x, y, w, h = faces_sorted[0]

        self.face_detected_count += 1
        self.no_face_count = 0
        self.last_face_time = time.time()

        result["face_detected"] = True
        frame_h, frame_w = frame.shape[:2]

        # --- Score calculation ---
        score = 50  # base score for face detected

        # 1. Face position analysis (centered = good)
        face_center_x = x + w // 2
        face_center_y = y + h // 2
        center_x_ratio = abs(face_center_x - frame_w // 2) / (frame_w // 2)
        center_y_ratio = face_center_y / frame_h

        # Horizontally centered is good
        if center_x_ratio < 0.3:
            score += 15
            result["face_position"] = "centered"
        elif center_x_ratio < 0.5:
            score += 8
            result["face_position"] = "slightly_off"
        else:
            result["face_position"] = "off_center"

        # Vertically: upper-middle = looking at screen, too low = looking down
        if 0.2 < center_y_ratio < 0.55:
            score += 15
        elif center_y_ratio > 0.65:
            score -= 10  # looking down at phone
            result["face_position"] = "looking_down"

        # 2. Eye detection
        roi_gray = gray[y:y + int(h * 0.6), x:x + w]
        eyes = self.eye_cascade.detectMultiScale(roi_gray, 1.1, 5, minSize=(20, 20))
        result["eyes_detected"] = len(eyes)

        if len(eyes) >= 2:
            score += 20  # both eyes visible = looking at screen
            result["looking_at_screen"] = True
        elif len(eyes) == 1:
            score += 10  # one eye = partially looking
        else:
            score -= 5  # no eyes = might be looking away

        # 3. Face size (too small = far away, not engaged)
        face_area_ratio = (w * h) / (frame_w * frame_h)
        if face_area_ratio > 0.03:
            score += 5  # close enough to screen
        elif face_area_ratio < 0.01:
            score -= 10  # too far away

        # Clamp score
        score = max(0, min(100, score))
        result["attention_score"] = score
        result["looking_at_screen"] = score >= 60

        self._add_to_history(score)

        return result

    def _add_to_history(self, score: int):
        self.attention_history.append(score)
        if len(self.attention_history) > self.history_max:
            self.attention_history.pop(0)

    def get_smoothed_score(self) -> int:
        if not self.attention_history:
            return 0
        return int(sum(self.attention_history) / len(self.attention_history))

    def get_stats(self) -> dict:
        if not self.attention_history:
            return {"avg": 0, "min": 0, "max": 0, "current": 0}
        return {
            "avg": int(sum(self.attention_history) / len(self.attention_history)),
            "min": min(self.attention_history),
            "max": max(self.attention_history),
            "current": self.attention_history[-1] if self.attention_history else 0
        }


# Global analyzer instance
analyzer = AttentionAnalyzer()


def decode_frame(data_url: str) -> Optional[np.ndarray]:
    """Decode a base64 data URL to OpenCV frame."""
    try:
        # Remove data URL prefix if present
        if "," in data_url:
            data_url = data_url.split(",")[1]
        img_bytes = base64.b64decode(data_url)
        img = Image.open(BytesIO(img_bytes))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        return frame
    except Exception as e:
        print(f"Frame decode error: {e}")
        return None


@app.websocket("/ws/attention")
async def attention_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time attention tracking."""
    await websocket.accept()
    print("WebSocket client connected")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "frame":
                frame = decode_frame(msg["data"])
                if frame is not None:
                    # Resize for faster processing
                    h, w = frame.shape[:2]
                    if w > 640:
                        scale = 640 / w
                        frame = cv2.resize(frame, (640, int(h * scale)))

                    result = analyzer.analyze_frame(frame)
                    result["smoothed_score"] = analyzer.get_smoothed_score()

                    await websocket.send_json(result)

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.get("/api/stats")
async def get_stats():
    """Get current attention statistics."""
    return analyzer.get_stats()


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "TrackerMode v2"}


# Serve frontend static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(static_dir, "index.html"))


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  TrackerMode v2 — Focus Tracker Server")
    print("  http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
