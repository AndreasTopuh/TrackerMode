/**
 * TrackerMode v2 — Session Manager
 * Manages focus session timer, calculates combined focus score, and triggers alerts/quizzes.
 */

class SessionManager {
    constructor() {
        this.duration = 25 * 60; // seconds
        this.elapsed = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.taskName = '';

        this.timerInterval = null;
        this.focusCheckInterval = null;

        // Focus scoring
        this.focusScores = [];
        this.currentFocusScore = 0;

        // Alert escalation
        this.alertLevel = 0;       // 0=normal, 1=warning, 2=quiz
        this.lowFocusStreak = 0;   // consecutive low-score checks
        this.notificationCount = 0;
        this.quizTriggered = 0;

        // Thresholds
        this.warningThreshold = 40;   // focus score below this = warning
        this.quizThreshold = 6;       // consecutive low checks to trigger quiz
        this.checkIntervalMs = 3000;  // check every 3 seconds

        // Callbacks
        this.onTick = null;
        this.onFocusUpdate = null;
        this.onAlert = null;
        this.onQuiz = null;
        this.onSessionEnd = null;
    }

    start(durationMinutes, taskName) {
        this.duration = durationMinutes * 60;
        this.elapsed = 0;
        this.taskName = taskName || 'Focus Session';
        this.isRunning = true;
        this.isPaused = false;
        this.focusScores = [];
        this.alertLevel = 0;
        this.lowFocusStreak = 0;
        this.notificationCount = 0;
        this.quizTriggered = 0;

        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                this.elapsed++;
                if (this.onTick) this.onTick(this.getTimeRemaining(), this.elapsed);

                if (this.elapsed >= this.duration) {
                    this.end();
                }
            }
        }, 1000);

        this.focusCheckInterval = setInterval(() => {
            if (!this.isPaused) {
                this._checkFocus();
            }
        }, this.checkIntervalMs);
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    togglePause() {
        if (this.isPaused) this.resume();
        else this.pause();
        return this.isPaused;
    }

    end() {
        this.isRunning = false;
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.focusCheckInterval) clearInterval(this.focusCheckInterval);
        this.timerInterval = null;
        this.focusCheckInterval = null;

        if (this.onSessionEnd) {
            this.onSessionEnd(this.getSummary());
        }
    }

    updateFocusScore(webcamScore, activityScore) {
        // Combine webcam and activity score
        // webcamScore can be null if webcam is disabled
        let combined;
        if (webcamScore !== null && webcamScore !== undefined) {
            combined = Math.round(webcamScore * 0.5 + activityScore * 0.5);
        } else {
            combined = activityScore;
        }
        this.currentFocusScore = combined;
        this.focusScores.push({ score: combined, time: this.elapsed });
    }

    getTimeRemaining() {
        const remaining = Math.max(0, this.duration - this.elapsed);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    getAverageFocus() {
        if (this.focusScores.length === 0) return 0;
        const sum = this.focusScores.reduce((a, b) => a + b.score, 0);
        return Math.round(sum / this.focusScores.length);
    }

    getSummary() {
        return {
            duration: this.elapsed,
            durationFormatted: this._formatTime(this.elapsed),
            avgFocus: this.getAverageFocus(),
            notifications: this.notificationCount,
            quizzes: this.quizTriggered,
            taskName: this.taskName,
            totalScores: this.focusScores.length,
            focusHistory: this.focusScores
        };
    }

    _checkFocus() {
        if (this.currentFocusScore < this.warningThreshold) {
            this.lowFocusStreak++;

            if (this.lowFocusStreak >= this.quizThreshold) {
                // Trigger quiz
                this.quizTriggered++;
                this.lowFocusStreak = 0;
                if (this.onQuiz) this.onQuiz();
            } else if (this.lowFocusStreak >= 2) {
                // Show warning notification
                this.notificationCount++;
                if (this.onAlert) this.onAlert(this.currentFocusScore);
            }
        } else {
            // Reset streak on good focus
            if (this.lowFocusStreak > 0) {
                this.lowFocusStreak = Math.max(0, this.lowFocusStreak - 1);
            }
        }

        if (this.onFocusUpdate) {
            this.onFocusUpdate(this.currentFocusScore, this.getAverageFocus());
        }
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}

// Export as global
window.SessionManager = SessionManager;
