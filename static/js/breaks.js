/**
 * TrackerMode v2.6 — Break Manager
 * Extracted from main.js: Pomodoro break overlay + violation break logic.
 */

class BreakManager {
    /**
     * @param {Object} config
     * @param {Function} config.iconFn - icon(name, size) → HTML string
     * @param {Function} config.onComplete - (breakType) => void
     */
    constructor(config) {
        this.icon = config.iconFn;
        this.onComplete = config.onComplete || (() => {});
    }

    /**
     * Show break overlay with countdown timer.
     * @param {number} breakDurationSecs
     * @param {'cycle'|'violation'|'final'} breakType
     * @param {{ currentCycle: number, maxCycles: number }} session
     */
    show(breakDurationSecs, breakType, session) {
        // Remove any existing break overlay first (BUG-3 fix)
        const existing = document.querySelector('.break-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'break-overlay';

        const breakMins = Math.floor(breakDurationSecs / 60);
        const isLongBreak = breakType === 'final';
        const breakIcon = breakType === 'violation' ? this.icon('warning', 40) : this.icon('pause', 40);
        const title = breakType === 'violation'
            ? 'Quick Break!'
            : (isLongBreak ? "Long Break — You've earned it!" : 'Pomodoro Break!');
        const msg = breakType === 'violation'
            ? 'Refresh your mind. Stand up and stretch.'
            : `Cycle ${session.currentCycle}/${session.maxCycles} complete. Rest for ${breakMins} minutes.`;

        overlay.innerHTML = `
            <div class="break-content">
                <div class="break-icon">${breakIcon}</div>
                <h2 class="break-title">${title}</h2>
                <p class="break-msg">${msg}</p>
                <div class="break-timer" id="break-countdown">${breakMins}:00</div>
                <button class="btn-skip-break" id="btn-skip-break">Skip Break</button>
            </div>
        `;
        document.body.appendChild(overlay);

        let breakSeconds = breakDurationSecs;
        const countdownEl = overlay.querySelector('#break-countdown');

        const breakInterval = setInterval(() => {
            breakSeconds--;
            const m = Math.floor(breakSeconds / 60);
            const s = breakSeconds % 60;
            countdownEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
            if (breakSeconds <= 0) {
                clearInterval(breakInterval);
                overlay.remove();
                this.onComplete(breakType);
            }
        }, 1000);

        overlay.querySelector('#btn-skip-break').addEventListener('click', () => {
            clearInterval(breakInterval);
            overlay.remove();
            this.onComplete(breakType);
        });
    }
}

// Export as global
window.BreakManager = BreakManager;
