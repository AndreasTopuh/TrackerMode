/**
 * TrackerMode v2.1 — Pop-out Metrics Window
 * Opens /static/pip.html as a small popup.
 * Syncs data via localStorage (no about:blank, proper URL).
 */

class PipMetrics {
    constructor() {
        this.popupWindow = null;
        this.isActive = false;
        this.data = {
            score: 0, gaze: '--', eyes: '--', head: '--',
            mouse: '--', keys: '--', blink: '0',
            alert: '', alertType: ''
        };
        this.syncInterval = null;
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

            this.popupWindow.addEventListener('beforeunload', () => {
                this.isActive = false;
                clearInterval(this.syncInterval);
            });

            this.isActive = true;

            // Sync data to localStorage every 400ms
            this.syncInterval = setInterval(() => this._sync(), 400);
            this._sync();

            return true;
        } catch (err) {
            console.warn('Popup failed:', err);
            return false;
        }
    }

    stop() {
        this.isActive = false;
        clearInterval(this.syncInterval);
        localStorage.removeItem('tm_pip_data');
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
        this.popupWindow = null;
    }

    update(data) {
        Object.assign(this.data, data);
    }

    showAlert(title, message, type) {
        this.data.alert = message;
        this.data.alertType = type;
        this._sync();
        setTimeout(() => {
            this.data.alert = '';
            this.data.alertType = '';
        }, 6000);
    }

    _sync() {
        if (!this.isActive) return;
        if (this.popupWindow && this.popupWindow.closed) {
            this.isActive = false;
            clearInterval(this.syncInterval);
            return;
        }
        localStorage.setItem('tm_pip_data', JSON.stringify(this.data));
    }
}

window.PipMetrics = PipMetrics;
