"""
TrackerMode v2.5 — Global Input Tracker + Window Time Tracker
Tracks mouse/keyboard activity, active window, and time spent per app.
"""

import time
import threading


# Default distraction keywords — matched against active window title
DEFAULT_DISTRACTIONS = []


class WindowTimeTracker:
    """Tracks cumulative time spent on each active window/app during a session."""

    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        """Reset all tracking data for a new session."""
        with self._lock:
            self.app_times = {}       # {app_name: total_seconds}
            self.current_app = None
            self.current_start = None
            self.session_start = time.time()

    def update(self, app_name: str):
        """Called every poll cycle with the current active app name."""
        now = time.time()
        with self._lock:
            if self.current_app and self.current_start:
                elapsed = now - self.current_start
                if self.current_app in self.app_times:
                    self.app_times[self.current_app] += elapsed
                else:
                    self.app_times[self.current_app] = elapsed

            self.current_app = app_name
            self.current_start = now

    def get_summary(self) -> list:
        """Return a sorted list of app time data for the session summary."""
        now = time.time()
        with self._lock:
            # Flush current app's time
            times = dict(self.app_times)
            if self.current_app and self.current_start:
                elapsed = now - self.current_start
                if self.current_app in times:
                    times[self.current_app] += elapsed
                else:
                    times[self.current_app] = elapsed

        total = sum(times.values()) or 1  # avoid division by zero

        result = []
        for app, secs in sorted(times.items(), key=lambda x: x[1], reverse=True):
            mins = int(secs // 60)
            remaining_secs = int(secs % 60)
            result.append({
                "app": app,
                "seconds": round(secs, 1),
                "duration": f"{mins}m {remaining_secs}s" if mins > 0 else f"{remaining_secs}s",
                "percentage": round((secs / total) * 100, 1)
            })

        return result


class GlobalInputTracker:
    """Tracks mouse/keyboard activity + active window across the entire OS."""

    def __init__(self):
        self.available = False
        self.mouse_last_moved = time.time()
        self.key_last_pressed = time.time()
        self.mouse_idle_threshold = 30   # seconds
        self.key_idle_threshold = 60     # seconds
        self.mouse_listener = None
        self.keyboard_listener = None
        self._lock = threading.Lock()

        # Active window tracking
        self.gw_available = False
        try:
            import pygetwindow as gw
            self._gw = gw
            self.gw_available = True
            print("[v2.5] pygetwindow loaded — active window tracking available")
        except ImportError:
            print("[v2.5] pygetwindow not installed — window tracking disabled")

        # Distraction list (can be extended by user)
        self.distraction_keywords = list(DEFAULT_DISTRACTIONS)
        self.custom_distractions = []

        # Window time tracker
        self.window_time = WindowTimeTracker()

        try:
            from pynput import mouse, keyboard
            self._mouse_module = mouse
            self._keyboard_module = keyboard
            self.available = True
            print("[v2.5] pynput loaded — global input tracking available")
        except ImportError:
            print("[v2.5] pynput not installed — global tracking disabled")

    def start(self):
        if not self.available:
            return
        try:
            self.mouse_listener = self._mouse_module.Listener(
                on_move=self._on_mouse_move,
                on_click=self._on_mouse_click,
                on_scroll=self._on_mouse_scroll
            )
            self.keyboard_listener = self._keyboard_module.Listener(
                on_press=self._on_key_press
            )
            self.mouse_listener.daemon = True
            self.keyboard_listener.daemon = True
            self.mouse_listener.start()
            self.keyboard_listener.start()
            with self._lock:
                self.mouse_last_moved = time.time()
                self.key_last_pressed = time.time()
            print("[v2.5] Global input listeners started")
        except Exception as e:
            print(f"[v2.5] Failed to start input listeners: {e}")
            self.available = False

    def stop(self):
        if self.mouse_listener:
            self.mouse_listener.stop()
            self.mouse_listener = None
        if self.keyboard_listener:
            self.keyboard_listener.stop()
            self.keyboard_listener = None

    def get_active_window(self):
        """Get the currently active window title and check for distractions."""
        if not self.gw_available:
            return {"title": "Unknown", "app": "Unknown", "is_distraction": False}
        try:
            win = self._gw.getActiveWindow()
            if win is None:
                return {"title": "Desktop", "app": "Desktop", "is_distraction": False}
            title = win.title or "Unknown"
            # Extract app name
            parts = title.replace(" — ", " - ").split(" - ")
            app_name = parts[-1].strip() if len(parts) > 1 else title.strip()
            # Check distraction
            title_lower = title.lower()
            all_distractions = self.distraction_keywords + self.custom_distractions
            is_distraction = any(d in title_lower for d in all_distractions)
            matched = next((d for d in all_distractions if d in title_lower), None)

            # Update window time tracker
            self.window_time.update(app_name)

            return {
                "title": title,
                "app": app_name,
                "is_distraction": is_distraction,
                "matched_keyword": matched
            }
        except Exception:
            return {"title": "Unknown", "app": "Unknown", "is_distraction": False}

    def add_custom_distractions(self, keywords: list):
        """Add user-defined distraction keywords."""
        for kw in keywords:
            kw_lower = kw.strip().lower()
            if kw_lower and kw_lower not in self.custom_distractions:
                self.custom_distractions.append(kw_lower)

    def get_status(self):
        with self._lock:
            now = time.time()
            mouse_idle = now - self.mouse_last_moved
            key_idle = now - self.key_last_pressed
        result = {
            "available": self.available,
            "mouseActive": mouse_idle < self.mouse_idle_threshold,
            "keyboardActive": key_idle < self.key_idle_threshold,
            "mouseIdleSeconds": int(mouse_idle),
            "keyIdleSeconds": int(key_idle),
            "activeWindow": self.get_active_window()
        }
        return result

    def _on_mouse_move(self, x, y):
        with self._lock:
            self.mouse_last_moved = time.time()

    def _on_mouse_click(self, x, y, button, pressed):
        with self._lock:
            self.mouse_last_moved = time.time()

    def _on_mouse_scroll(self, x, y, dx, dy):
        with self._lock:
            self.mouse_last_moved = time.time()

    def _on_key_press(self, key):
        with self._lock:
            self.key_last_pressed = time.time()
