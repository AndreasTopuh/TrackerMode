"""
TrackerMode v2.6 — Attention Analyzer
MediaPipe FaceLandmarker (Tasks API) + Haar Cascades fallback.
"""

import cv2
import math
import time
import numpy as np

from .utils import download_model, MODEL_PATH


class AttentionAnalyzer:
    """Analyzes webcam frames using MediaPipe FaceLandmarker (Tasks API)."""

    # Key Face Mesh landmark indices
    LEFT_EYE = [362, 385, 387, 263, 373, 380]
    LEFT_IRIS = [474, 475, 476, 477]
    RIGHT_EYE = [33, 160, 158, 133, 153, 144]
    RIGHT_IRIS = [469, 470, 471, 472]
    NOSE_TIP = 1
    CHIN = 152
    LEFT_FACE = 234
    RIGHT_FACE = 454
    FOREHEAD = 10

    def __init__(self):
        self.use_mediapipe = False
        self.face_landmarker = None

        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision

            if download_model():
                base_options = mp_python.BaseOptions(
                    model_asset_path=MODEL_PATH
                )
                options = mp_vision.FaceLandmarkerOptions(
                    base_options=base_options,
                    output_face_blendshapes=False,
                    output_facial_transformation_matrixes=False,
                    num_faces=1,
                    min_face_detection_confidence=0.5,
                    min_face_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                    running_mode=mp_vision.RunningMode.VIDEO
                )
                self.face_landmarker = mp_vision.FaceLandmarker.create_from_options(options)
                self.mp_image_class = mp.Image
                self.use_mediapipe = True
                self.mp_frame_timestamp = 0
                self.mp_errors = 0
                print("[v2.5] MediaPipe FaceLandmarker loaded — 478 landmarks + iris")
            else:
                raise Exception("Model file not available")

        except Exception as e:
            print(f"[v2.5] MediaPipe unavailable ({e}), falling back to Haar Cascades")

        # Always load Haar as fallback
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'  # type: ignore[attr-defined]
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'  # type: ignore[attr-defined]
        )

        # State tracking
        self.last_face_time = time.time()
        self.face_detected_count = 0
        self.no_face_count = 0
        self.attention_history = []
        self.history_max = 60
        self.blink_total = 0
        self.prev_ear = 0.3
        self.session_start = time.time()
        self.last_process_time = 0
        self.eye_closed_start_time = None

    def analyze_frame(self, frame: np.ndarray) -> dict:
        if self.use_mediapipe:
            return self._analyze_mediapipe(frame)
        else:
            return self._analyze_haar(frame)

    def _analyze_mediapipe(self, frame: np.ndarray) -> dict:
        """Full analysis with MediaPipe FaceLandmarker (Tasks API)."""
        import mediapipe as mp

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        mp_image = self.mp_image_class(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )

        try:
            if self.face_landmarker is None:
                return self._analyze_haar(frame)
            self.mp_frame_timestamp = int(time.time() * 1000)
            result_data = self.face_landmarker.detect_for_video(mp_image, self.mp_frame_timestamp)
        except Exception as e:
            self.mp_errors += 1
            if self.mp_errors <= 3:
                print(f"[v2.5] MediaPipe detect error ({self.mp_errors}): {e}")
            if self.mp_errors >= 5:
                print("[v2.5] Too many MediaPipe errors, switching to Haar Cascades")
                self.use_mediapipe = False
            return self._analyze_haar(frame)

        result = {
            "face_detected": False,
            "eyes_detected": 0,
            "face_position": "none",
            "attention_score": 0,
            "looking_at_screen": False,
            "gaze_direction": "none",
            "eyes_open": False,
            "head_pose": "none",
            "blink_rate": 0,
            "ear": 0,
            "gaze_ratio": 0.5,
            "drowsiness": "none",
            "timestamp": time.time()
        }

        if not result_data.face_landmarks or len(result_data.face_landmarks) == 0:
            self.no_face_count += 1
            self.face_detected_count = 0
            score = max(0, 20 - self.no_face_count * 2)
            result["attention_score"] = score
            result["face_position"] = "not_visible"
            self._add_to_history(score)
            return result

        landmarks = result_data.face_landmarks[0]
        self.face_detected_count += 1
        self.no_face_count = 0
        self.last_face_time = time.time()
        result["face_detected"] = True
        result["eyes_detected"] = 2

        # --- 1. Eye Aspect Ratio (EAR) — blink detection ---
        left_ear = self._calculate_ear(landmarks, self.LEFT_EYE, w, h)
        right_ear = self._calculate_ear(landmarks, self.RIGHT_EYE, w, h)
        ear = (left_ear + right_ear) / 2.0
        result["ear"] = round(ear, 3)

        if ear < 0.2:
            if self.prev_ear >= 0.2:
                self.blink_total += 1
                self.eye_closed_start_time = time.time()
            if self.eye_closed_start_time:
                closed_duration = time.time() - self.eye_closed_start_time
                result["eye_closed_seconds"] = round(closed_duration, 1)
                if closed_duration > 60:
                    result["drowsiness"] = "deep_sleep"
                elif closed_duration > 15:
                    result["drowsiness"] = "microsleep"
                elif closed_duration > 3:
                    result["drowsiness"] = "drowsy"
        else:
            self.eye_closed_start_time = None

        self.prev_ear = ear

        result["eyes_open"] = ear >= 0.2
        elapsed = time.time() - self.session_start
        result["blink_rate"] = round((self.blink_total / max(elapsed, 1)) * 60, 1)

        # --- 2. Gaze direction (iris position) ---
        gaze_ratio = self._calculate_gaze_ratio(landmarks, w, h)
        result["gaze_ratio"] = round(gaze_ratio, 3)

        if 0.35 <= gaze_ratio <= 0.65:
            result["gaze_direction"] = "center"
        elif gaze_ratio < 0.35:
            result["gaze_direction"] = "left"
        else:
            result["gaze_direction"] = "right"

        # --- 3. Head pose estimation ---
        nose = landmarks[self.NOSE_TIP]
        chin = landmarks[self.CHIN]
        forehead = landmarks[self.FOREHEAD]
        left_face = landmarks[self.LEFT_FACE]
        right_face = landmarks[self.RIGHT_FACE]

        nose_to_chin = abs(chin.y - nose.y)
        nose_to_forehead = abs(nose.y - forehead.y)
        vertical_ratio = nose_to_chin / (nose_to_forehead + 1e-6)

        nose_to_left = abs(nose.x - left_face.x)
        nose_to_right = abs(nose.x - right_face.x)
        horizontal_ratio = nose_to_left / (nose_to_right + 1e-6)

        if vertical_ratio > 1.8:
            result["head_pose"] = "looking_down"
        elif vertical_ratio < 0.6:
            result["head_pose"] = "looking_up"
        elif horizontal_ratio > 2.0:
            result["head_pose"] = "looking_right"
        elif horizontal_ratio < 0.5:
            result["head_pose"] = "looking_left"
        else:
            result["head_pose"] = "forward"

        face_cx = nose.x
        face_cy = nose.y
        result["face_position"] = "centered" if 0.25 < face_cx < 0.75 and 0.2 < face_cy < 0.65 else "off_center"

        # --- 4. Combined attention score ---
        score = 40

        if result["eyes_open"]:
            score += 15
        else:
            score -= 15

        if result["gaze_direction"] == "center":
            score += 20
        elif result["gaze_direction"] in ("left", "right"):
            score += 5

        if result["head_pose"] == "forward":
            score += 20
        elif result["head_pose"] == "looking_down":
            score -= 10
        elif result["head_pose"] in ("looking_left", "looking_right"):
            score += 5

        if result["face_position"] == "centered":
            score += 10

        if 10 <= result["blink_rate"] <= 25:
            score += 5
        elif result["blink_rate"] > 35:
            score -= 5

        score = max(0, min(100, score))
        result["attention_score"] = score
        result["looking_at_screen"] = score >= 55

        self._add_to_history(score)
        return result

    def _calculate_ear(self, landmarks, eye_indices, w, h):
        """Eye Aspect Ratio — measures how open the eye is."""
        pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices]
        v1 = math.dist(pts[1], pts[5])
        v2 = math.dist(pts[2], pts[4])
        h1 = math.dist(pts[0], pts[3])
        return (v1 + v2) / (2.0 * h1 + 1e-6)

    def _calculate_gaze_ratio(self, landmarks, w, h):
        """Estimate horizontal gaze using iris position relative to eye corners."""
        left_iris_cx = sum(landmarks[i].x for i in self.LEFT_IRIS) / len(self.LEFT_IRIS)
        left_eye_inner = landmarks[self.LEFT_EYE[3]].x
        left_eye_outer = landmarks[self.LEFT_EYE[0]].x
        left_ratio = (left_iris_cx - left_eye_outer) / (left_eye_inner - left_eye_outer + 1e-6)

        right_iris_cx = sum(landmarks[i].x for i in self.RIGHT_IRIS) / len(self.RIGHT_IRIS)
        right_eye_inner = landmarks[self.RIGHT_EYE[3]].x
        right_eye_outer = landmarks[self.RIGHT_EYE[0]].x
        right_ratio = (right_iris_cx - right_eye_outer) / (right_eye_inner - right_eye_outer + 1e-6)

        return (left_ratio + right_ratio) / 2.0

    def _analyze_haar(self, frame: np.ndarray) -> dict:
        """Fallback: Haar Cascades analysis."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = self.face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(80, 80))

        result = {
            "face_detected": False, "eyes_detected": 0,
            "face_position": "none", "attention_score": 0,
            "looking_at_screen": False, "gaze_direction": "unknown",
            "eyes_open": True, "head_pose": "unknown",
            "blink_rate": 0, "ear": 0, "gaze_ratio": 0.5,
            "drowsiness": "none",
            "timestamp": time.time()
        }

        if len(faces) == 0:
            self.no_face_count += 1
            score = max(0, 20 - self.no_face_count * 2)
            result["attention_score"] = score
            self._add_to_history(score)
            return result

        faces_sorted = sorted(faces, key=lambda f: f[2]*f[3], reverse=True)
        x, y, w, h = faces_sorted[0]
        self.face_detected_count += 1
        self.no_face_count = 0
        result["face_detected"] = True
        fh, fw = frame.shape[:2]

        score = 50
        face_cx = (x + w//2) / fw
        face_cy = (y + h//2) / fh

        if abs(face_cx - 0.5) < 0.15:
            score += 15
            result["face_position"] = "centered"
        else:
            result["face_position"] = "off_center"

        if 0.2 < face_cy < 0.55:
            score += 15
        elif face_cy > 0.65:
            score -= 10
            result["head_pose"] = "looking_down"

        roi_gray = gray[y:y+int(h*0.6), x:x+w]
        eyes = self.eye_cascade.detectMultiScale(roi_gray, 1.1, 5, minSize=(20,20))
        result["eyes_detected"] = len(eyes)
        if len(eyes) >= 2:
            score += 20
        elif len(eyes) == 1:
            score += 10
        else:
            score -= 5

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
            "current": self.attention_history[-1]
        }

    def reset_session(self):
        self.blink_total = 0
        self.session_start = time.time()
        self.attention_history = []
