/**
 * TrackerMode v2.2 — Activity Tracker
 * Hybrid: uses pynput backend (global) if available, falls back to browser events.
 */

class ActivityTracker {
    constructor() {
        this.mouseLastMoved = Date.now();
        this.keyLastPressed = Date.now();
        this.mouseIdleThreshold = 30000;  // 30 seconds
        this.keyIdleThreshold = 60000;    // 60 seconds
        this.mouseMovements = 0;
        this.keystrokes = 0;
        this.isMouseActive = true;
        this.isKeyboardActive = true;

        this.enabled = { cursor: true, keyboard: true };
        this.listeners = [];

        // Global tracking mode
        this.useGlobal = false;
        this.paused = false;
        this._pollInterval = null;

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseClick = this._onMouseClick.bind(this);
    }

    async start() {
        // Try to use global backend first
        try {
            const resp = await fetch('/api/input-status');
            const data = await resp.json();
            if (data.available) {
                this.useGlobal = true;
                console.log('[Tracker] Using global input tracking (pynput backend)');
                this._startPolling();
                return;
            }
        } catch (e) {
            console.warn('[Tracker] Backend input-status unavailable:', e);
        }

        // Fallback to browser-only tracking
        console.log('[Tracker] Fallback: browser-only input tracking');
        this.useGlobal = false;
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('click', this._onMouseClick);
        this._checkInterval = setInterval(() => this._checkActivity(), 2000);
    }

    _startPolling() {
        // Poll backend every 2 seconds
        this._pollInterval = setInterval(async () => {
            try {
                if (this.paused) return; // skip when session paused
                const resp = await fetch('/api/input-status');
                const data = await resp.json();

                const now = Date.now();
                this.activeWindow = data.activeWindow;

                if (data.mouseActive) {
                    this.mouseLastMoved = now;
                    this.mouseMovements++;
                } else {
                    this.mouseLastMoved = now - (data.mouseIdleSeconds * 1000);
                }

                if (data.keyboardActive) {
                    this.keyLastPressed = now;
                    this.keystrokes++;
                } else {
                    this.keyLastPressed = now - (data.keyIdleSeconds * 1000);
                }

                this._checkActivity();
            } catch (e) {
                // Backend died — fall back to browser events
                console.warn('[Tracker] Backend poll failed, switching to browser events');
                this.useGlobal = false;
                clearInterval(this._pollInterval);
                document.addEventListener('mousemove', this._onMouseMove);
                document.addEventListener('keydown', this._onKeyDown);
                document.addEventListener('click', this._onMouseClick);
                this._checkInterval = setInterval(() => this._checkActivity(), 2000);
            }
        }, 2000);
    }

    stop() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('click', this._onMouseClick);

        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
        this.clearListeners();
        this.paused = false;
    }

    onActivityChange(callback) {
        this.listeners.push(callback);
    }

    clearListeners() {
        this.listeners = [];
    }

    getStatus() {
        const now = Date.now();
        const mouseIdle = now - this.mouseLastMoved;
        const keyIdle = now - this.keyLastPressed;

        return {
            mouseActive: this.enabled.cursor ? mouseIdle < this.mouseIdleThreshold : null,
            keyboardActive: this.enabled.keyboard ? keyIdle < this.keyIdleThreshold : null,
            mouseIdleSeconds: Math.floor(mouseIdle / 1000),
            keyIdleSeconds: Math.floor(keyIdle / 1000),
            mouseMovements: this.mouseMovements,
            keystrokes: this.keystrokes,
            activeWindow: this.activeWindow
        };
    }

    /**
     * Returns a focus contribution score (0-100) based on cursor+keyboard activity.
     */
    getActivityScore() {
        const status = this.getStatus();
        let score = 50; // base

        if (this.enabled.cursor) {
            if (status.mouseActive) {
                score += 25;
            } else {
                const penalty = Math.min(25, Math.floor(status.mouseIdleSeconds / 5) * 3);
                score -= penalty;
            }
        }

        if (this.enabled.keyboard) {
            if (status.keyboardActive) {
                score += 25;
            } else {
                const penalty = Math.min(25, Math.floor(status.keyIdleSeconds / 10) * 3);
                score -= penalty;
            }
        }

        return Math.max(0, Math.min(100, score));
    }

    _onMouseMove(e) {
        this.mouseLastMoved = Date.now();
        this.mouseMovements++;
    }

    _onMouseClick(e) {
        this.mouseLastMoved = Date.now();
        this.mouseMovements++;
    }

    _onKeyDown(e) {
        this.keyLastPressed = Date.now();
        this.keystrokes++;
    }

    _checkActivity() {
        const status = this.getStatus();

        const wasMouseActive = this.isMouseActive;
        const wasKeyActive = this.isKeyboardActive;
        const currentWinTitle = status.activeWindow ? status.activeWindow.title : '';
        const winChanged = this.lastWinTitle !== currentWinTitle;

        this.isMouseActive = status.mouseActive !== false;
        this.isKeyboardActive = status.keyboardActive !== false;
        this.lastWinTitle = currentWinTitle;

        if (wasMouseActive !== this.isMouseActive || wasKeyActive !== this.isKeyboardActive || winChanged) {
            this._notify(status);
        }
    }

    _notify(status) {
        for (const cb of this.listeners) {
            cb(status);
        }
    }
}
