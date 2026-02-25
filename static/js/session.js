/**
 * TrackerMode v2.4 — Session Manager
 * Manages focus session timer, Pomodoro cycles, triggers alerts/quizzes,
 * and tracks app/window time usage for end-of-session evaluation.
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

        // Window/app time tracking
        this.windowTimeData = [];
        this._windowTimePollInterval = null;
    }

    start(durationMinutes, taskName, activeFeatures = { webcam: true, cursor: true, keyboard: true, window: true }) {
        this.duration = durationMinutes * 60;
        this.elapsed = 0;
        this.taskName = taskName || 'Focus Session';
        this.activeFeatures = activeFeatures; // Track which features are enabled

        this.isRunning = true;
        this.isPaused = false;
        
        // Detailed scoring history
        this.focusScores = [];
        this.webcamScores = [];
        this.cursorScores = [];
        this.keyboardScores = [];
        this.windowScores = [];
        this.windowTimeData = [];

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

        // Poll window/app time every 10 seconds
        if (this._windowTimePollInterval) clearInterval(this._windowTimePollInterval);
        this._windowTimePollInterval = setInterval(() => {
            if (!this.isPaused) this._pollWindowTime();
        }, 10000);
    }

    _stopTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.focusCheckInterval) clearInterval(this.focusCheckInterval);
        if (this._windowTimePollInterval) clearInterval(this._windowTimePollInterval);
        this.timerInterval = null;
        this.focusCheckInterval = null;
        this._windowTimePollInterval = null;
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

    updateFocusScore(scores) {
        // scores = { webcam: number|null, cursor: number|null, keyboard: number|null, window: number|null }
        let totalWeight = 0;
        let weightedSum = 0;

        // Dynamic weights based on active features
        const weights = {
            webcam: 0.40,
            cursor: 0.20,
            keyboard: 0.20,
            window: 0.20
        };

        // If webcam is off, redistribute its weight to activity
        if (!this.activeFeatures.webcam) {
            weights.cursor = 0.33;
            weights.keyboard = 0.33;
            weights.window = 0.34;
        }

        // Tally up active components
        if (this.activeFeatures.webcam && scores.webcam !== null && scores.webcam !== undefined) {
            weightedSum += scores.webcam * weights.webcam;
            totalWeight += weights.webcam;
            this.webcamScores.push(scores.webcam);
        }
        if (this.activeFeatures.cursor && scores.cursor !== null && scores.cursor !== undefined) {
            weightedSum += scores.cursor * weights.cursor;
            totalWeight += weights.cursor;
            this.cursorScores.push(scores.cursor);
        }
        if (this.activeFeatures.keyboard && scores.keyboard !== null && scores.keyboard !== undefined) {
            weightedSum += scores.keyboard * weights.keyboard;
            totalWeight += weights.keyboard;
            this.keyboardScores.push(scores.keyboard);
        }
        if (this.activeFeatures.window && scores.window !== null && scores.window !== undefined) {
            weightedSum += scores.window * weights.window;
            totalWeight += weights.window;
            this.windowScores.push(scores.window);
        }

        const combined = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
        
        this.currentFocusScore = combined;
        this.focusScores.push({ score: combined, time: this.elapsed });
        
        // Limit memory: keep last 2000 entries (~100 min at 3s intervals)
        if (this.focusScores.length > 2000) {
            this.focusScores.shift();
            if (this.webcamScores.length > 2000) this.webcamScores.shift();
            if (this.cursorScores.length > 2000) this.cursorScores.shift();
            if (this.keyboardScores.length > 2000) this.keyboardScores.shift();
            if (this.windowScores.length > 2000) this.windowScores.shift();
        }
    }

    getTimeRemaining() {
        const remaining = Math.max(0, this.duration - this.elapsed);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    getAverageFocus() {
        return this._getAverage(this.focusScores.map(f => f.score));
    }

    _getAverage(arr) {
        if (!arr || arr.length === 0) return null;
        const sum = arr.reduce((a, b) => a + b, 0);
        return Math.round(sum / arr.length);
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
            cyclesCompleted: this.currentCycle,
            windowTimeData: this.windowTimeData,
            metrics: {
                webcam: {
                    active: this.activeFeatures.webcam,
                    score: this._getAverage(this.webcamScores),
                    weight: this.activeFeatures.webcam ? 0.40 : 0
                },
                cursor: {
                    active: this.activeFeatures.cursor,
                    score: this._getAverage(this.cursorScores),
                    weight: this.activeFeatures.webcam ? 0.20 : 0.33
                },
                keyboard: {
                    active: this.activeFeatures.keyboard,
                    score: this._getAverage(this.keyboardScores),
                    weight: this.activeFeatures.webcam ? 0.20 : 0.33
                },
                window: {
                    active: this.activeFeatures.window,
                    score: this._getAverage(this.windowScores),
                    weight: this.activeFeatures.webcam ? 0.20 : 0.34
                }
            }
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

    async _pollWindowTime() {
        try {
            const resp = await fetch('/api/window-time');
            if (resp.ok) {
                this.windowTimeData = await resp.json();
            }
        } catch (e) {
            // Silently ignore poll failures
        }
    }
}

// Export as global
window.SessionManager = SessionManager;
