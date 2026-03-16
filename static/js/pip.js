/**
 * TrackerMode v2.6 — Pop-out Metrics Window
 * Opens /static/pip.html as a small popup.
 * Syncs data via BroadcastChannel (no polling, instant updates).
 */

class PipMetrics {
    constructor() {
        this.popupWindow = null;
        this.isActive = false;
        this.channel = null;
        this.data = {
            score: 0, gaze: '--', eyes: '--', head: '--',
            mouse: '--', keys: '--', blink: '0',
            alert: '', alertType: ''
        };
    }

    async start() {
        try {
            const w = 300, h = 240;
            const left = window.screen.width - w - 16;
            const top = 16;

            this.popupWindow = window.open(
                '/static/pip.html',
                'TrackerMode_Metrics',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
            );

            if (!this.popupWindow) {
                console.warn('Popup blocked — allow popups for localhost');
                return false;
            }

            this.channel = new BroadcastChannel('tm_pip');

            this.popupWindow.addEventListener('beforeunload', () => {
                this.isActive = false;
            });

            this.isActive = true;
            this._send();

            return true;
        } catch (err) {
            console.warn('Popup failed:', err);
            return false;
        }
    }

    stop() {
        this.isActive = false;
        if (this.channel) {
            this.channel.postMessage({ type: 'close' });
            this.channel.close();
            this.channel = null;
        }
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
        this.popupWindow = null;
    }

    update(data) {
        Object.assign(this.data, data);
        this._send();
    }

    showAlert(title, message, type) {
        this.data.alert = message;
        this.data.alertType = type;
        this._send();
        setTimeout(() => {
            this.data.alert = '';
            this.data.alertType = '';
            this._send();
        }, 6000);
    }

    _send() {
        if (!this.isActive || !this.channel) return;
        if (this.popupWindow && this.popupWindow.closed) {
            this.isActive = false;
            return;
        }
        this.channel.postMessage({ type: 'update', data: this.data });
    }
}

window.PipMetrics = PipMetrics;
