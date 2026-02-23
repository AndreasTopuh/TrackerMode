/**
 * TrackerMode v2.1 — Screen Capture Monitor
 * Uses Screen Capture API to monitor the user's shared tab/screen.
 */

class ScreenCapture {
    constructor() {
        this.stream = null;
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.isCapturing = false;
        this.captureInterval = null;
        this.captureRate = 10000; // screenshot every 10 seconds
        this.listeners = [];
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'browser' },
                audio: false
            });

            this.video = document.getElementById('screen-video');
            this.canvas = document.getElementById('screen-canvas');
            this.ctx = this.canvas.getContext('2d');

            this.video.srcObject = this.stream;
            await this.video.play();

            // Show preview
            const preview = document.getElementById('screen-preview');
            if (preview) preview.classList.add('visible');

            // Listen for user stopping the share
            this.stream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stop();
                this._notify({ event: 'stopped', reason: 'user_stopped' });
            });

            this.isCapturing = true;
            this._startCapture();

            return true;
        } catch (err) {
            console.warn('Screen capture denied:', err.message);
            return false;
        }
    }

    stop() {
        this.isCapturing = false;
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        const preview = document.getElementById('screen-preview');
        if (preview) preview.classList.remove('visible');
    }

    onCapture(callback) {
        this.listeners.push(callback);
    }

    _startCapture() {
        this.captureInterval = setInterval(() => {
            if (!this.isCapturing || !this.video) return;
            this._takeScreenshot();
        }, this.captureRate);

        // Take first screenshot immediately
        setTimeout(() => this._takeScreenshot(), 2000);
    }

    _takeScreenshot() {
        if (!this.video || this.video.readyState < 2) return;

        this.canvas.width = 320;
        this.canvas.height = 180;
        this.ctx.drawImage(this.video, 0, 0, 320, 180);

        // Update preview thumbnail
        const thumbnail = document.getElementById('screen-thumbnail');
        if (thumbnail) {
            thumbnail.src = this.canvas.toDataURL('image/jpeg', 0.6);
        }

        this._notify({ event: 'screenshot', timestamp: Date.now() });
    }

    _notify(data) {
        for (const cb of this.listeners) {
            cb(data);
        }
    }

    clearListeners() {
        this.listeners = [];
    }
}

window.ScreenCapture = ScreenCapture;
