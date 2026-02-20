/**
 * TrackerMode v2 — Cursor & Keyboard Activity Tracker
 * Monitors mouse movement and keyboard activity to detect inactivity.
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

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseClick = this._onMouseClick.bind(this);
    }

    start() {
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('click', this._onMouseClick);

        this._checkInterval = setInterval(() => this._checkActivity(), 2000);
    }

    stop() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('click', this._onMouseClick);

        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
    }

    onActivityChange(callback) {
        this.listeners.push(callback);
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
            keystrokes: this.keystrokes
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

        this.isMouseActive = status.mouseActive !== false;
        this.isKeyboardActive = status.keyboardActive !== false;

        if (wasMouseActive !== this.isMouseActive || wasKeyActive !== this.isKeyboardActive) {
            this._notify(status);
        }
    }

    _notify(status) {
        for (const cb of this.listeners) {
            cb(status);
        }
    }
}

// Export as global
window.ActivityTracker = ActivityTracker;
