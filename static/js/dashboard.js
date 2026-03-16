/**
 * TrackerMode v2.6 — Dashboard Renderer
 * Renders focus timeline chart and activity log.
 * Supports light/dark theme via CSS custom properties.
 */

class Dashboard {
    constructor() {
        this.canvas = document.getElementById('timeline-canvas');
        this.ctx = null;
        this.logList = document.getElementById('log-list');
        this.dataPoints = [];
        this.maxPoints = 600; // ~30 minutes of data at 3-sec intervals
    }

    init() {
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this._resizeCanvas();
            window.addEventListener('resize', () => this._resizeCanvas());
        }
    }

    addDataPoint(score, elapsed) {
        this.dataPoints.push({ score, elapsed });
        if (this.dataPoints.length > this.maxPoints) {
            this.dataPoints.shift();
        }
        this._drawChart();
    }

    addLog(message, type = 'info') {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const item = document.createElement('div');
        item.className = `log-item log-${type}`;
        item.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg">${message}</span>`;

        this.logList.prepend(item);

        // Keep max 50 log entries
        while (this.logList.children.length > 50) {
            this.logList.removeChild(this.logList.lastChild);
        }
    }

    clearLog() {
        this.logList.innerHTML = '';
    }

    _resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width - 32;  // padding
        this.canvas.height = rect.height - 32;
        this._drawChart();
    }

    _drawChart() {
        if (!this.ctx || this.dataPoints.length < 2) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, w, h);

        const points = this.dataPoints;
        const stepX = w / (this.maxPoints - 1);

        // Draw grid lines — adapt to current theme
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw threshold line
        const threshY = h - (40 / 100) * h;
        ctx.strokeStyle = 'rgba(255,82,82,0.3)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(w, threshY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw area fill
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(108,92,231,0.3)');
        gradient.addColorStop(0.5, 'rgba(0,210,255,0.1)');
        gradient.addColorStop(1, 'rgba(0,210,255,0)');

        ctx.beginPath();
        const startIdx = Math.max(0, points.length - this.maxPoints);
        for (let i = 0; i < points.length; i++) {
            const x = i * stepX;
            const y = h - (points[i].score / 100) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo((points.length - 1) * stepX, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const x = i * stepX;
            const y = h - (points[i].score / 100) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
        lineGrad.addColorStop(0, '#6C5CE7');
        lineGrad.addColorStop(1, '#00D2FF');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw current point
        if (points.length > 0) {
            const last = points[points.length - 1];
            const lx = (points.length - 1) * stepX;
            const ly = h - (last.score / 100) * h;
            ctx.beginPath();
            ctx.arc(lx, ly, 4, 0, Math.PI * 2);
            ctx.fillStyle = last.score >= 60 ? '#00E676' : last.score >= 40 ? '#FFB300' : '#FF5252';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

// Export as global
window.Dashboard = Dashboard;
