/**
 * TrackerMode v2.6 — UI Manager
 * Extracted from main.js: screen switching, score display, gauges, indicators,
 * floating bar updates, motivation modal.
 * v2.6: Mode-aware motivation modal.
 */

class UIManager {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.splashScreen
     * @param {HTMLElement} config.sessionScreen
     * @param {HTMLElement} config.summaryScreen
     * @param {HTMLElement} config.scoreNumber
     * @param {HTMLElement} config.scoreRingFill
     * @param {HTMLElement} config.scoreStatus
     */
    constructor(config) {
        this.splashScreen = config.splashScreen;
        this.sessionScreen = config.sessionScreen;
        this.summaryScreen = config.summaryScreen;
        this.scoreNumber = config.scoreNumber;
        this.scoreRingFill = config.scoreRingFill;
        this.scoreStatus = config.scoreStatus;
    }

    /** Switch between splash / session / summary screens. */
    switchScreen(screen) {
        [this.splashScreen, this.sessionScreen, this.summaryScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    /** Update the large focus score ring during a session. */
    updateScoreDisplay(score) {
        this.scoreNumber.textContent = score;
        const circumference = 2 * Math.PI * 85;
        const offset = circumference - (score / 100) * circumference;
        this.scoreRingFill.style.strokeDashoffset = offset;

        this.scoreStatus.className = 'focus-status-badge';
        if (score >= 70) {
            this.scoreStatus.innerHTML = '<span class="status-dot good"></span> Excellent Focus';
            this.scoreStatus.classList.add('good');
        } else if (score >= 50) {
            this.scoreStatus.innerHTML = '<span class="status-dot warning"></span> Moderate Focus';
            this.scoreStatus.classList.add('warning');
        } else if (score >= 30) {
            this.scoreStatus.innerHTML = '<span class="status-dot warning"></span> Low Focus — Stay alert!';
            this.scoreStatus.classList.add('warning');
        } else {
            this.scoreStatus.innerHTML = '<span class="status-dot danger"></span> Very Low — Action needed!';
            this.scoreStatus.classList.add('danger');
        }

        this.scoreNumber.style.color = score >= 70 ? '#00E676' : score >= 50 ? '#FFB300' : '#FF5252';
    }

    /** Update a stat indicator dot (active/warning/danger). */
    updateIndicator(id, state) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'stat-indicator';
        if (state) el.classList.add(state);
    }

    /** Set a gauge fill bar (0–100). */
    setGauge(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.width = `${Math.max(0, Math.min(100, value))}%`;
        el.className = 'gauge-fill';
        if (value >= 70) el.classList.add('good');
        else if (value >= 40) el.classList.add('warning');
        else el.classList.add('danger');
    }

    /** Update the floating detail bar with webcam + activity data. */
    updateFloatingBar(webcamData, activityStatus) {
        if (webcamData) {
            const faceOk = webcamData.face_detected;

            // Gaze gauge
            const gazeDir = webcamData.gaze_direction;
            const gazeScore = !faceOk || gazeDir === 'none' ? 0
                : gazeDir === 'center' ? 100 : 50;
            this.setGauge('gauge-gaze', gazeScore);
            document.getElementById('float-gaze-val').textContent = faceOk ? (gazeDir || '--') : 'none';

            // Eyes gauge
            const eyesScore = !faceOk ? 0 : (webcamData.eyes_open ? 100 : 10);
            this.setGauge('gauge-eyes', eyesScore);
            document.getElementById('float-eyes-val').textContent = faceOk ? (webcamData.eyes_open ? 'Open' : 'Closed') : 'none';

            // Head gauge
            const headPose = webcamData.head_pose;
            const headScore = !faceOk || headPose === 'none' ? 0
                : headPose === 'forward' ? 100
                : headPose === 'looking_down' ? 20 : 60;
            this.setGauge('gauge-head', headScore);
            document.getElementById('float-head-val').textContent = faceOk ? (headPose || '--').replace('_', ' ') : 'none';

            // Blink rate
            document.getElementById('float-blink-val').textContent = `${webcamData.blink_rate || 0}/m`;
        }

        if (activityStatus) {
            // Mouse gauge
            const mouseScore = activityStatus.mouseActive !== false
                ? 100 : Math.max(0, 100 - activityStatus.mouseIdleSeconds * 3);
            this.setGauge('gauge-mouse', mouseScore);
            document.getElementById('float-mouse-val').textContent =
                activityStatus.mouseActive !== false ? 'Active' : `Idle ${activityStatus.mouseIdleSeconds}s`;

            // Keys gauge
            const keysScore = activityStatus.keyboardActive !== false
                ? 100 : Math.max(0, 100 - activityStatus.keyIdleSeconds * 2);
            this.setGauge('gauge-keys', keysScore);
            document.getElementById('float-keys-val').textContent =
                activityStatus.keyboardActive !== false ? 'Active' : `Idle ${activityStatus.keyIdleSeconds}s`;
        }
    }

    /** Show the motivation promise modal before starting a session. */
    showMotivationModal(taskName, appTags, mode = 'general') {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'motivation-modal-overlay';

            const isStrict = mode === 'strict';
            const titleText = isStrict ? 'Strict Mode Activated!' : 'Stay Disciplined!';
            const modalIcon = isStrict ? '🔒' : '🎯';
            const description = isStrict
                ? `You're about to focus on <strong>"${taskName}"</strong>. Only these apps are allowed:`
                : `You're about to focus on <strong>"${taskName}"</strong>. You promised to avoid these apps:`;
            const hint = isStrict
                ? 'Any app NOT in this list will trigger a distraction alert.'
                : 'If you open them, TrackerMode will remind you to stay on track.';
            const tagClass = isStrict ? 'motivation-app-tag allowed' : 'motivation-app-tag';

            overlay.innerHTML = `
                <div class="motivation-modal">
                    <div class="motivation-modal-icon">${modalIcon}</div>
                    <h2>${titleText}</h2>
                    <p>${description}</p>
                    <div class="motivation-apps-list">
                        ${appTags.map(tag => `<span class="${tagClass}">${tag}</span>`).join('')}
                    </div>
                    <p style="font-size: 0.82rem; color: var(--text-muted);">${hint}</p>
                    <button class="btn-primary btn-glow" id="btn-motivation-go">
                        <span class="btn-icon"></span>
                        I Promise — Let's Go!
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#btn-motivation-go').addEventListener('click', () => {
                overlay.remove();
                resolve();
            });
        });
    }
}

// Export as global
window.UIManager = UIManager;
