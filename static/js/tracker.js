/**
 * TrackerMode v2.6 — Activity Tracker
 * Hybrid: uses pynput backend (global) if available, falls back to browser events.
 * 
 * Browser-only mode includes:
 * - Page Visibility API (detect tab switch = distraction)
 * - Window blur/focus (detect leaving browser)
 * - In-page mouse/keyboard (interaction with study material)
 * - Tab switch counter + cumulative away time
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

        this.enabled = { cursor: true, keyboard: true, window: true };
        this.listeners = [];

        // Global tracking mode
        this.useGlobal = false;
        this.paused = false;
        this._pollInterval = null;

        // --- Browser-only: Tab Visibility & Focus ---
        this.tabVisible = true;           // is our tab the active one?
        this.windowFocused = true;        // is the browser window focused?
        this.tabSwitchCount = 0;          // how many times user left the tab
        this.totalAwayMs = 0;             // cumulative ms spent away from tab
        this._awayStart = null;           // timestamp when user left

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseClick = this._onMouseClick.bind(this);
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);
        this._onWindowFocus = this._onWindowFocus.bind(this);
    }

    async start() {
        // Reset tab stats
        this.tabSwitchCount = 0;
        this.totalAwayMs = 0;
        this._awayStart = null;
        this.tabVisible = !document.hidden;
        this.windowFocused = document.hasFocus();

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

        // Page interaction events
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('click', this._onMouseClick);

        // Tab visibility + window focus (the KEY web metrics)
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('blur', this._onWindowBlur);
        window.addEventListener('focus', this._onWindowFocus);

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
                document.addEventListener('visibilitychange', this._onVisibilityChange);
                window.addEventListener('blur', this._onWindowBlur);
                window.addEventListener('focus', this._onWindowFocus);
                this._checkInterval = setInterval(() => this._checkActivity(), 2000);
            }
        }, 2000);
    }

    stop() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('click', this._onMouseClick);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('blur', this._onWindowBlur);
        window.removeEventListener('focus', this._onWindowFocus);

        // Flush remaining away time
        if (this._awayStart) {
            this.totalAwayMs += Date.now() - this._awayStart;
            this._awayStart = null;
        }

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

        const base = {
            mouseActive: this.enabled.cursor ? mouseIdle < this.mouseIdleThreshold : null,
            keyboardActive: this.enabled.keyboard ? keyIdle < this.keyIdleThreshold : null,
            mouseIdleSeconds: Math.floor(mouseIdle / 1000),
            keyIdleSeconds: Math.floor(keyIdle / 1000),
            mouseMovements: this.mouseMovements,
            keystrokes: this.keystrokes,
            activeWindow: this.activeWindow
        };

        // Add browser-specific tab focus data (always available, but most useful in browser mode)
        if (!this.useGlobal) {
            base.tabVisible = this.tabVisible;
            base.windowFocused = this.windowFocused;
            base.tabSwitchCount = this.tabSwitchCount;
            base.totalAwaySeconds = Math.floor((this.totalAwayMs + (this._awayStart ? (now - this._awayStart) : 0)) / 1000);
            base.isOnTab = this.tabVisible && this.windowFocused;
        }

        return base;
    }

    /**
     * Returns a "Tab Focus" score (0-100) for browser mode.
     * Measures how much the user stays on this tab vs switching away.
     */
    getTabFocusScore() {
        if (this.useGlobal) return null; // not applicable in global mode

        // Currently on tab = high base
        if (this.tabVisible && this.windowFocused) {
            // Penalize based on number of tab switches (max -40)
            const switchPenalty = Math.min(40, this.tabSwitchCount * 8);
            return Math.max(30, 100 - switchPenalty);
        }

        // Tab visible but window not focused (e.g. reading alongside)
        if (this.tabVisible && !this.windowFocused) {
            return 40;
        }

        // Tab hidden = user definitely switched away
        return 0;
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

    // --- Browser event handlers ---

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

    _onVisibilityChange() {
        const wasVisible = this.tabVisible;
        this.tabVisible = !document.hidden;

        if (wasVisible && !this.tabVisible) {
            // User left the tab
            this.tabSwitchCount++;
            if (!this._awayStart) this._awayStart = Date.now();
            console.log(`[Tracker] Tab hidden (switch #${this.tabSwitchCount})`);
        } else if (!wasVisible && this.tabVisible) {
            // User came back
            if (this._awayStart) {
                this.totalAwayMs += Date.now() - this._awayStart;
                this._awayStart = null;
            }
            console.log('[Tracker] Tab visible again');
        }

        this._checkActivity();
    }

    _onWindowBlur() {
        this.windowFocused = false;
        if (!this._awayStart) this._awayStart = Date.now();
        this._checkActivity();
    }

    _onWindowFocus() {
        this.windowFocused = true;
        if (this._awayStart) {
            this.totalAwayMs += Date.now() - this._awayStart;
            this._awayStart = null;
        }
        this._checkActivity();
    }

    _checkActivity() {
        const status = this.getStatus();

        const wasMouseActive = this.isMouseActive;
        const wasKeyActive = this.isKeyboardActive;
        const currentWinTitle = status.activeWindow ? status.activeWindow.title : '';
        const winChanged = this.lastWinTitle !== currentWinTitle;

        // In browser mode, also detect tab focus changes
        const tabChanged = (status.tabVisible !== undefined) &&
            (this._lastTabVisible !== status.tabVisible || this._lastWindowFocused !== status.windowFocused);
        this._lastTabVisible = status.tabVisible;
        this._lastWindowFocused = status.windowFocused;

        this.isMouseActive = status.mouseActive !== false;
        this.isKeyboardActive = status.keyboardActive !== false;
        this.lastWinTitle = currentWinTitle;

        if (wasMouseActive !== this.isMouseActive || wasKeyActive !== this.isKeyboardActive || winChanged || tabChanged) {
            this._notify(status);
        }
    }

    _notify(status) {
        for (const cb of this.listeners) {
            cb(status);
        }
    }
}
