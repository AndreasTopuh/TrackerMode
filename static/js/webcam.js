/**
 * TrackerMode v2 — Webcam Manager
 * Handles webcam stream and sends frames to backend via WebSocket for attention analysis.
 */

class WebcamManager {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;
        this.ws = null;
        this.isRunning = false;
        this.frameInterval = null;
        this.frameRate = 4; // frames per second (lower = less CPU)

        this.latestResult = null;
        this.listeners = [];
        this.connected = false;
        this.reconnectTimer = null;
        this.onError = null; // callback for webcam failures
    }

    async start() {
        this.video = document.getElementById('webcam-video');
        this.canvas = document.getElementById('webcam-canvas');
        this.ctx = this.canvas.getContext('2d');

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false
            });
            this.video.srcObject = this.stream;
            await this.video.play();

            // Show webcam preview
            document.getElementById('webcam-preview').classList.add('visible');

            // Detect webcam disconnect mid-session
            this.stream.getVideoTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    console.warn('Webcam track ended');
                    this.isRunning = false;
                    if (this.onError) this.onError();
                });
            });

            this._connectWebSocket();
            this.isRunning = true;
            this._startFrameLoop();

            return true;
        } catch (err) {
            console.warn('Webcam access denied or unavailable:', err.message);
            if (this.onError) this.onError();
            return false;
        }
    }

    stop() {
        this.isRunning = false;

        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        document.getElementById('webcam-preview').classList.remove('visible');
    }

    onAttentionData(callback) {
        this.listeners.push(callback);
    }

    getLatestResult() {
        return this.latestResult;
    }

    _connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${window.location.host}/ws/attention`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.latestResult = data;
                for (const cb of this.listeners) {
                    cb(data);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                if (this.isRunning) {
                    this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
                }
            };

            this.ws.onerror = (err) => {
                console.warn('WebSocket error:', err);
            };
        } catch (e) {
            console.warn('WebSocket connection failed:', e);
        }
    }

    _startFrameLoop() {
        const interval = Math.floor(1000 / this.frameRate);
        this.frameInterval = setInterval(() => {
            if (!this.isRunning || !this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            this.canvas.width = 320;
            this.canvas.height = 240;
            this.ctx.drawImage(this.video, 0, 0, 320, 240);

            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5);
            this.ws.send(JSON.stringify({
                type: 'frame',
                data: dataUrl
            }));
        }, interval);
    }
}

// Export as global
window.WebcamManager = WebcamManager;
