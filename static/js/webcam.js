/**
 * TrackerMode v2.6 — Webcam Manager
 * Handles webcam stream and sends frames to backend via WebSocket for attention analysis.
 * Uses backpressure: waits for server response before sending next frame.
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
        this.pendingFrame = false; // backpressure flag

        this.latestResult = null;
        this.listeners = [];
        this.connected = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.onError = null; // callback for webcam failures
        this._expanded = false;
    }

    async start() {
        this.video = document.getElementById('webcam-video');
        this.canvas = document.getElementById('webcam-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Resize button
        const resizeBtn = document.getElementById('btn-webcam-resize');
        if (resizeBtn) {
            resizeBtn.addEventListener('click', () => this.toggleExpand());
        }

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
        this.clearListeners();
    }

    onAttentionData(callback) {
        this.listeners.push(callback);
    }

    clearListeners() {
        this.listeners = [];
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
                this.reconnectAttempts = 0; // reset on success
                this.pendingFrame = false;  // reset backpressure on (re)connect
            };

            this.ws.onmessage = (event) => {
                this.pendingFrame = false; // server responded, allow next frame
                const data = JSON.parse(event.data);
                // Skip ack or pong — don't propagate to listeners
                if (data.type === 'skip' || data.type === 'pong') return;
                this.latestResult = data;
                for (const cb of this.listeners) {
                    cb(data);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                if (this.isRunning) {
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                        console.log(`WebSocket reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
                    } else {
                        console.warn('WebSocket max reconnect attempts reached');
                        this.isRunning = false;
                        if (this.onError) this.onError();
                    }
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
            // Backpressure: skip if previous frame hasn't been processed yet
            if (this.pendingFrame) return;

            this.canvas.width = 320;
            this.canvas.height = 240;
            this.ctx.drawImage(this.video, 0, 0, 320, 240);

            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5);
            this.pendingFrame = true;
            this.ws.send(JSON.stringify({
                type: 'frame',
                data: dataUrl
            }));
        }, interval);
    }

    // =====================================================
    //  Expand / Collapse webcam preview
    // =====================================================

    toggleExpand() {
        const preview = document.getElementById('webcam-preview');
        if (!preview) return;

        this._expanded = !this._expanded;
        preview.classList.toggle('expanded', this._expanded);

        const btn = document.getElementById('btn-webcam-resize');
        if (btn) {
            btn.innerHTML = this._expanded
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <polyline points="4 14 10 14 10 20"/>
                     <polyline points="20 10 14 10 14 4"/>
                     <line x1="14" y1="10" x2="21" y2="3"/>
                     <line x1="3" y1="21" x2="10" y2="14"/>
                   </svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <polyline points="15 3 21 3 21 9"/>
                     <polyline points="9 21 3 21 3 15"/>
                     <line x1="21" y1="3" x2="14" y2="10"/>
                     <line x1="3" y1="21" x2="10" y2="14"/>
                   </svg>`;
            btn.title = this._expanded ? 'Minimize webcam' : 'Expand webcam';
        }

        if (this._expanded) {
            this._escHandler = (e) => { if (e.key === 'Escape') this.toggleExpand(); };
            document.addEventListener('keydown', this._escHandler);
        } else if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }
}

// Export as global
window.WebcamManager = WebcamManager;
