/**
 * TrackerMode v2.6 — Alert Manager
 * Extracted from main.js: toast notifications, PiP alert bar, alarm overlay,
 * browser push notifications, drowsiness tolerance, distraction sound escalation.
 */

class AlertManager {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.notifContainer - #notification-container
     * @param {HTMLElement} config.pipAlert - #pip-alert
     * @param {HTMLElement} config.alarmOverlay - #alarm-overlay
     * @param {HTMLAudioElement} config.alarmSound - #alarm-sound
     * @param {Object} config.ICONS - { eye, warning, alert, check, avg, ... }
     * @param {Function} config.iconFn - icon(name, size) → HTML string
     */
    constructor(config) {
        this.notifContainer = config.notifContainer;
        this.pipAlert = config.pipAlert;
        this.alarmOverlay = config.alarmOverlay;
        this.alarmSound = config.alarmSound;
        this.ICONS = config.ICONS;
        this.icon = config.iconFn;

        // Alarm state
        this.alarmActive = false;
        this.pipAlertTimer = null;
        this.pushPermission = false;

        // Visual escalation tracking
        this.consecutiveLowCount = 0;
        this.lastAlertTime = 0;
        this.ALERT_COOLDOWN_MS = 30000; // 30 seconds

        // Drowsiness tolerance
        this.drowsinessEpisodes = 0;
        this.lastDrowsinessTime = 0;
        this.DROWSY_COOLDOWN_MS = 60000; // 60s
        this.DROWSY_TOLERANCE = 3;

        // Distraction sound system
        this.distractionSound = new Audio('/static/audio/notifications2.mp3');
        this.alertSound = new Audio('/static/audio/notifications1.mp3');
        this.distractionSound.volume = 0.6;
        this.alertSound.volume = 0.8;
        this.distractionIgnoreCount = {};
        this.lastDistractionSoundTime = 0;
        this.DISTRACTION_SOUND_COOLDOWN = 15000; // 15s

        // Roasts for focus-drop alerts
        this.roasts = [
            "You'll fail if you don't stop slacking!",
            "Your dreams called — they want your attention back!",
            "The algorithm wins again. Pathetic.",
            "Future you is watching. They're disappointed.",
            "Every second wasted is a step backward.",
            "Your productivity just left the chat.",
            "Is scrolling really more important than your goals?",
            "PUT. THE. PHONE. DOWN. NOW.",
            "This is why you're behind schedule.",
            "The screen won't study for you!",
        ];
    }

    /** Request push notification permission. Auto-grants for Desktop (pywebview). */
    requestPushPermission() {
        // Desktop mode: native notifications always available via plyer
        if (window.pywebview && window.pywebview.api && window.pywebview.api.show_notification) {
            this.pushPermission = true;
            return true;
        }

        // Web mode: browser Notification API
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                this.pushPermission = perm === 'granted';
            });
        } else if ('Notification' in window) {
            this.pushPermission = Notification.permission === 'granted';
        }
        return this.pushPermission;
    }

    /** Reset all dynamic state for a new session. */
    reset() {
        this.alarmActive = false;
        this.consecutiveLowCount = 0;
        this.lastAlertTime = 0;
        this.drowsinessEpisodes = 0;
        this.lastDrowsinessTime = 0;
        this.distractionIgnoreCount = {};
        this.lastDistractionSoundTime = 0;
        clearTimeout(this.pipAlertTimer);
    }

    getRandomRoast() {
        return this.roasts[Math.floor(Math.random() * this.roasts.length)];
    }

    // ---- Toast Notification ----

    showNotification(title, message, type = 'warning') {
        const notifIcons = {
            warning: `<img src="${this.ICONS.warning}" style="width:20px;height:20px">`,
            danger: `<img src="${this.ICONS.alert}" style="width:20px;height:20px">`,
            success: `<img src="${this.ICONS.check}" style="width:20px;height:20px">`,
            info: `<img src="${this.ICONS.avg}" style="width:20px;height:20px">`
        };
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.innerHTML = `
            <span class="notif-icon">${notifIcons[type] || notifIcons.warning}</span>
            <div class="notif-content">
                <div class="notif-title">${title}</div>
                <div class="notif-msg">${message}</div>
            </div>
        `;
        this.notifContainer.appendChild(notif);
        setTimeout(() => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        }, 5000);
        notif.addEventListener('click', () => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        });
    }

    // ---- PiP Alert Bar ----

    showPipAlert(title, message, score, type = 'warning') {
        const pipIconMap = {
            danger: this.ICONS.alert,
            success: this.ICONS.check,
            warning: this.ICONS.warning
        };
        document.getElementById('pip-alert-icon').innerHTML =
            `<img src="${pipIconMap[type] || pipIconMap.warning}" class="pip-icon-img" alt="alert">`;
        document.getElementById('pip-alert-title').textContent = title;
        document.getElementById('pip-alert-msg').textContent = message;
        document.getElementById('pip-alert-score').textContent = score;

        const scoreEl = document.getElementById('pip-alert-score');
        scoreEl.style.color = score >= 50 ? '#FFB300' : '#FF5252';

        this.pipAlert.className = `pip-alert ${type}`;

        clearTimeout(this.pipAlertTimer);
        this.pipAlertTimer = setTimeout(() => {
            this.pipAlert.classList.add('hidden');
        }, 8000);
    }

    // ---- Alarm System ----

    triggerAlarm(message) {
        if (this.alarmActive) return;
        this.alarmActive = true;

        const msg = message || "You've been unfocused for too long!";
        document.getElementById('alarm-msg').textContent = msg;
        this.alarmOverlay.classList.remove('hidden');

        // Visual notifications first (in case speaker is muted)
        this.showNotification('🚨 Focus Lost!', msg, 'danger');
        this.sendPushNotification('🚨 Focus Lost!', msg);

        // Play alarm sound (native on Desktop, HTML5 on web)
        this._playSound(this.alarmSound, 'notifications1.mp3');
    }

    dismissAlarm() {
        this.alarmActive = false;
        this.alarmOverlay.classList.add('hidden');
        this.alarmSound.pause();
        this.alarmSound.currentTime = 0;
    }

    // ---- Push Notifications (Native + Browser) ----

    sendPushNotification(title, body) {
        // Desktop (pywebview): use native OS notifications via plyer
        if (window.pywebview && window.pywebview.api && window.pywebview.api.show_notification) {
            try {
                window.pywebview.api.show_notification(title, body);
            } catch (e) {
                console.warn('Native notification failed:', e);
            }
            return;
        }

        // Web fallback: browser Notification API
        if (!this.pushPermission || !('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const notif = new Notification(title, {
                body,
                icon: '/static/favicon.svg',
                silent: false,
                tag: 'trackermode-alert'
            });
            notif.onclick = (e) => {
                e.preventDefault();
                window.focus();
                notif.close();
            };
        } catch (e) {
            console.warn('Push notification failed:', e);
        }
    }

    // ---- Distraction Sound Escalation ----

    /**
     * Play a sound file — uses native API on Desktop, HTML5 Audio on web.
     * @param {HTMLAudioElement} audioEl - fallback HTML5 audio element
     * @param {string} filename - e.g. 'notifications1.mp3'
     */
    _playSound(audioEl, filename) {
        // Try native server-side sound first (Desktop: Windows MCI via REST)
        fetch(`/api/play-sound/${filename}`, { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                if (data.status !== 'ok') {
                    // Fallback to HTML5 Audio (web mode)
                    audioEl.currentTime = 0;
                    audioEl.play().catch(() => {});
                }
            })
            .catch(() => {
                // Server endpoint not available (web version)
                audioEl.currentTime = 0;
                audioEl.play().catch(() => {});
            });
    }

    /**
     * Play escalating distraction sounds.
     * @param {string} appKey - lowercase distraction app identifier
     * @returns {'soft'|'escalate'|'cooldown'} what action was taken
     */
    playDistractionSound(appKey) {
        const now = Date.now();
        if (now - this.lastDistractionSoundTime < this.DISTRACTION_SOUND_COOLDOWN) {
            return 'cooldown';
        }
        this.lastDistractionSoundTime = now;
        this.distractionIgnoreCount[appKey] = (this.distractionIgnoreCount[appKey] || 0) + 1;

        if (this.distractionIgnoreCount[appKey] <= 2) {
            this._playSound(this.distractionSound, 'notifications2.mp3');
            return 'soft';
        } else {
            this._playSound(this.alertSound, 'notifications1.mp3');
            this.distractionIgnoreCount[appKey] = 0; // reset after escalation
            return 'escalate';
        }
    }
}

// Export as global
window.AlertManager = AlertManager;
