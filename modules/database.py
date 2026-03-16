"""
TrackerMode v2.6 — Session Database
SQLite persistence for session history.
"""

import json
import os
import sqlite3
import time

from .utils import resource_path

DB_PATH = resource_path("trackermode_sessions.db")


class SessionDatabase:
    """SQLite storage for completed focus sessions."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Create the sessions table if it doesn't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_name TEXT NOT NULL DEFAULT 'Focus Session',
                    duration INTEGER NOT NULL DEFAULT 0,
                    duration_formatted TEXT DEFAULT '00:00',
                    avg_focus REAL DEFAULT 0,
                    notifications INTEGER DEFAULT 0,
                    quizzes INTEGER DEFAULT 0,
                    cycles_completed INTEGER DEFAULT 1,
                    focus_history TEXT DEFAULT '[]',
                    window_time_data TEXT DEFAULT '[]',
                    metrics TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    created_at_formatted TEXT NOT NULL
                )
            """)

    def save_session(self, data: dict) -> int | None:
        """Save a completed session. Returns the new session ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                INSERT INTO sessions
                    (task_name, duration, duration_formatted, avg_focus, notifications,
                     quizzes, cycles_completed, focus_history, window_time_data,
                     metrics, created_at, created_at_formatted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get("taskName", "Focus Session"),
                data.get("duration", 0),
                data.get("durationFormatted", "00:00"),
                data.get("avgFocus", 0),
                data.get("notifications", 0),
                data.get("quizzes", 0),
                data.get("cyclesCompleted", 1),
                json.dumps(data.get("focusHistory", [])),
                json.dumps(data.get("windowTimeData", [])),
                json.dumps(data.get("metrics", {})),
                time.time(),
                time.strftime("%Y-%m-%d %H:%M")
            ))
            return cursor.lastrowid

    def get_sessions(self, limit: int = 50) -> list:
        """Return recent sessions (summary only, no focus_history)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT id, task_name, duration, duration_formatted,
                          avg_focus, notifications, quizzes, cycles_completed,
                          created_at, created_at_formatted
                   FROM sessions ORDER BY created_at DESC LIMIT ?""",
                (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_session(self, session_id: int) -> dict | None:
        """Return full session data including focus history."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                return None
            data = dict(row)
            # Parse JSON fields
            data["focus_history"] = json.loads(data.get("focus_history", "[]"))
            data["window_time_data"] = json.loads(data.get("window_time_data", "[]"))
            data["metrics"] = json.loads(data.get("metrics", "{}"))
            return data
