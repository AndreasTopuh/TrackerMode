/**
 * TrackerMode v2.3 — Session Manager
 * Manages focus session timer, Pomodoro cycles, and triggers alerts/quizzes.
 */

class SessionManager {
    constructor() {
        this.duration = 25 * 60; // seconds (one cycle)
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
        this.alertLevel = 0;
        this.lowFocusStreak = 0;
        this.notificationCount = 0;
        this.quizTriggered = 0;

        // Thresholds
        this.warningThreshold = 40;
        this.quizThreshold = 6;
        this.checkIntervalMs = 3000;

        // Pomodoro
        this.currentCycle = 1;
        this.maxCycles = 4;
        this.breakDuration = 5 * 60; // seconds
        this.longBreakDuration = 15 * 60;
        this.alarmDismissCount = 0; // tracks "I'm Back" clicks for violation breaks

        // Break duration map (focus minutes → break minutes)
        this.breakMap = {
            15: { short: 3, long: 15 },
            25: { short: 5, long: 15 },
            45: { short: 10, long: 20 },
            60: { short: 15, long: 25 },
            90: { short: 30, long: 30 }
        };

        // Callbacks
        this.onTick = null;
        this.onFocusUpdate = null;
        this.onAlert = null;
        this.onQuiz = null;
        this.onSessionEnd = null;
        this.onCycleEnd = null;        // Pomodoro: cycle complete → break time
        this.onViolationBreak = null;  // Pomodoro: suggest break after violations
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
        this.currentCycle = 1;
        this.alarmDismissCount = 0;

        // Calculate break durations from map
        const config = this.breakMap[durationMinutes] || { short: 5, long: 15 };
        this.breakDuration = config.short * 60;
        this.longBreakDuration = config.long * 60;

        this._startTimers();
    }

    /** Resume after a Pomodoro break (next cycle) */
    startNextCycle() {
        this.currentCycle++;
        this.elapsed = 0;
        this.isRunning = true;
        this.isPaused = false;
        this.lowFocusStreak = 0;
        this.alarmDismissCount = 0;
        this._startTimers();
    }

    /** Resume remaining time after a violation break */
    resumeFromBreak() {
        this.isRunning = true;
        this.isPaused = false;
        this.lowFocusStreak = 0;
        this.alarmDismissCount = 0;
        this._startTimers();
    }

    _startTimers() {
        // Clear existing
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.focusCheckInterval) clearInterval(this.focusCheckInterval);

        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                this.elapsed++;
                if (this.onTick) this.onTick(this.getTimeRemaining(), this.elapsed);

                if (this.elapsed >= this.duration) {
                    this._stopTimers();
                    // Pomodoro: cycle ends, not full session
                    if (this.currentCycle >= this.maxCycles) {
                        // All 4 cycles done → session truly ends
                        this.isRunning = false;
                        if (this.onSessionEnd) this.onSessionEnd(this.getSummary());
                    } else {
                        // Cycle done → break time
                        this.isRunning = false;
                        if (this.onCycleEnd) {
                            this.onCycleEnd(this.currentCycle, this.breakDuration);
                        }
                    }
                }
            }
        }, 1000);

        this.focusCheckInterval = setInterval(() => {
            if (!this.isPaused) {
                this._checkFocus();
            }
        }, this.checkIntervalMs);
    }

    _stopTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.focusCheckInterval) clearInterval(this.focusCheckInterval);
        this.timerInterval = null;
        this.focusCheckInterval = null;
    }

    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }

    togglePause() {
        if (this.isPaused) this.resume();
        else this.pause();
        return this.isPaused;
    }

    /** Called when user dismisses alarm (I'm Back) */
    registerAlarmDismiss() {
        this.alarmDismissCount++;
        // After 2 alarm dismissals → suggest violation break
        if (this.alarmDismissCount >= 2 && this.onViolationBreak) {
            this.onViolationBreak();
        }
    }

    end() {
        this.isRunning = false;
        this._stopTimers();
        if (this.onSessionEnd) {
            this.onSessionEnd(this.getSummary());
        }
    }

    updateFocusScore(webcamScore, activityScore) {
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
            focusHistory: this.focusScores,
            cyclesCompleted: this.currentCycle
        };
    }

    _checkFocus() {
        if (this.currentFocusScore < this.warningThreshold) {
            this.lowFocusStreak++;

            if (this.lowFocusStreak >= this.quizThreshold) {
                this.quizTriggered++;
                this.lowFocusStreak = 0;
                if (this.onQuiz) this.onQuiz();
            } else if (this.lowFocusStreak >= 2) {
                this.notificationCount++;
                if (this.onAlert) this.onAlert(this.currentFocusScore);
            }
        } else {
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
