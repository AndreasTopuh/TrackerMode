/**
 * TrackerMode v2 — Main Entry Point
 * Wires together all modules: Session, ActivityTracker, WebcamManager, Quiz, Dashboard.
 */

(function() {
    // --- Module Instances ---
    const session = new SessionManager();
    const tracker = new ActivityTracker();
    const webcam = new WebcamManager();
    const quiz = new QuizSystem();
    const dashboard = new Dashboard();

    // --- State ---
    let selectedDuration = 25;
    let webcamEnabled = true;
    let cursorEnabled = true;
    let keyboardEnabled = true;

    const roasts = [
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

    // --- DOM Refs ---
    const splashScreen = document.getElementById('splash-screen');
    const sessionScreen = document.getElementById('session-screen');
    const summaryScreen = document.getElementById('summary-screen');
    const btnStart = document.getElementById('btn-start-focus');
    const btnPause = document.getElementById('btn-pause');
    const btnStop = document.getElementById('btn-stop');
    const btnRestart = document.getElementById('btn-restart');
    const timerDisplay = document.getElementById('timer-display');
    const headerTaskName = document.getElementById('header-task-name');
    const scoreNumber = document.getElementById('score-number');
    const scoreRingFill = document.getElementById('score-ring-fill');
    const scoreStatus = document.getElementById('score-status');
    const notifContainer = document.getElementById('notification-container');

    // --- Duration Selector ---
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDuration = parseInt(btn.dataset.minutes);
        });
    });

    // --- Toggle Listeners ---
    document.getElementById('toggle-webcam').addEventListener('change', (e) => { webcamEnabled = e.target.checked; });
    document.getElementById('toggle-cursor').addEventListener('change', (e) => { cursorEnabled = e.target.checked; });
    document.getElementById('toggle-keyboard').addEventListener('change', (e) => { keyboardEnabled = e.target.checked; });

    // --- Start Session ---
    btnStart.addEventListener('click', startSession);
    btnPause.addEventListener('click', togglePause);
    btnStop.addEventListener('click', endSession);
    btnRestart.addEventListener('click', () => {
        switchScreen(splashScreen);
    });

    function startSession() {
        const taskName = document.getElementById('focus-task').value.trim() || 'Focus Session';
        headerTaskName.textContent = taskName;

        // Configure tracker
        tracker.enabled.cursor = cursorEnabled;
        tracker.enabled.keyboard = keyboardEnabled;

        // Switch screen
        switchScreen(sessionScreen);

        // Initialize dashboard
        dashboard.init();
        dashboard.clearLog();
        dashboard.addLog('Session started — Stay focused! 🎯', 'success');

        // Start session timer
        session.start(selectedDuration, taskName);

        // Start activity tracker
        tracker.start();

        // Start webcam if enabled
        if (webcamEnabled) {
            webcam.start().then(success => {
                if (success) {
                    dashboard.addLog('Webcam activated — tracking eye contact', 'info');
                    updateIndicator('stat-webcam-indicator', 'active');
                } else {
                    dashboard.addLog('Webcam unavailable — tracking cursor/keyboard only', 'warning');
                    webcamEnabled = false;
                }
            });
        } else {
            document.getElementById('stat-webcam-value').textContent = 'Off';
        }

        // --- Wire up callbacks ---

        // Timer tick
        session.onTick = (timeStr, elapsed) => {
            timerDisplay.textContent = timeStr;
        };

        // Webcam attention data
        webcam.onAttentionData((data) => {
            if (!session.isRunning || session.isPaused) return;

            const activityScore = tracker.getActivityScore();
            session.updateFocusScore(data.smoothed_score || data.attention_score, activityScore);

            // Update webcam stat
            const eyeScore = data.attention_score;
            document.getElementById('stat-webcam-value').textContent = data.face_detected ? `${eyeScore}%` : 'No face';
            updateIndicator('stat-webcam-indicator', eyeScore >= 60 ? 'active' : eyeScore >= 30 ? 'warning' : 'danger');
        });

        // Activity tracker state changes
        tracker.onActivityChange((status) => {
            if (!session.isRunning) return;

            if (!status.mouseActive && cursorEnabled) {
                dashboard.addLog(`Mouse idle for ${status.mouseIdleSeconds}s`, 'warning');
            }
            if (!status.keyboardActive && keyboardEnabled) {
                dashboard.addLog(`Keyboard idle for ${status.keyIdleSeconds}s`, 'warning');
            }
        });

        // Focus update (every 3 seconds)
        session.onFocusUpdate = (currentScore, avgScore) => {
            updateScoreDisplay(currentScore);

            // Update activity stats
            const status = tracker.getStatus();
            if (cursorEnabled) {
                document.getElementById('stat-cursor-value').textContent = status.mouseActive ? 'Active' : `Idle ${status.mouseIdleSeconds}s`;
                updateIndicator('stat-cursor-indicator', status.mouseActive ? 'active' : 'danger');
            }
            if (keyboardEnabled) {
                document.getElementById('stat-keyboard-value').textContent = status.keyboardActive ? 'Active' : `Idle ${status.keyIdleSeconds}s`;
                updateIndicator('stat-keyboard-indicator', status.keyboardActive ? 'active' : 'warning');
            }
            document.getElementById('stat-avg-value').textContent = `${avgScore}%`;

            // If webcam is off, update score from activity only
            if (!webcamEnabled) {
                const activityScore = tracker.getActivityScore();
                session.updateFocusScore(null, activityScore);
            }

            // Add data point to chart
            dashboard.addDataPoint(currentScore, session.elapsed);
        };

        // Alert (warning notification)
        session.onAlert = (score) => {
            const roast = roasts[Math.floor(Math.random() * roasts.length)];
            showNotification('⚠️ Focus Dropping!', roast, 'warning');
            dashboard.addLog(`⚠️ Focus alert — score: ${score}%`, 'warning');
        };

        // Quiz trigger
        session.onQuiz = () => {
            quiz.show();
            dashboard.addLog('⚡ Focus check quiz triggered!', 'danger');
        };

        // Quiz completion
        quiz.onComplete = (correct) => {
            if (correct) {
                showNotification('✅ Correct!', 'Great, now get back to work!', 'success');
                dashboard.addLog('✅ Quiz answered correctly', 'success');
            } else {
                showNotification('❌ Wrong!', 'Focus harder next time!', 'danger');
                dashboard.addLog('❌ Quiz answered incorrectly', 'danger');
            }
        };

        // Session end
        session.onSessionEnd = (summary) => {
            showSummary(summary);
        };
    }

    function togglePause() {
        const paused = session.togglePause();
        const icon = btnPause.querySelector('svg');
        if (paused) {
            icon.innerHTML = '<polygon points="5,3 19,12 5,21" fill="currentColor"/>';
            dashboard.addLog('⏸️ Session paused', 'info');
            showNotification('⏸️ Paused', 'Session is paused. Click play to resume.', 'warning');
        } else {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
            dashboard.addLog('▶️ Session resumed', 'info');
        }
    }

    function endSession() {
        session.end();
    }

    function showSummary(summary) {
        // Stop everything
        tracker.stop();
        webcam.stop();

        // Populate summary
        document.getElementById('summary-duration').textContent = summary.durationFormatted;
        document.getElementById('summary-focus').textContent = `${summary.avgFocus}%`;
        document.getElementById('summary-alerts').textContent = summary.notifications;
        document.getElementById('summary-quizzes').textContent = summary.quizzes;

        switchScreen(summaryScreen);
    }

    // --- UI Helpers ---

    function switchScreen(screen) {
        [splashScreen, sessionScreen, summaryScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    function updateScoreDisplay(score) {
        scoreNumber.textContent = score;

        // Update ring
        const circumference = 2 * Math.PI * 85; // 534
        const offset = circumference - (score / 100) * circumference;
        scoreRingFill.style.strokeDashoffset = offset;

        // Update status
        scoreStatus.className = 'score-status';
        if (score >= 70) {
            scoreStatus.textContent = '🟢 Excellent Focus';
            scoreStatus.classList.add('good');
        } else if (score >= 50) {
            scoreStatus.textContent = '🟡 Moderate Focus';
            scoreStatus.classList.add('warning');
        } else if (score >= 30) {
            scoreStatus.textContent = '🟠 Low Focus — Stay alert!';
            scoreStatus.classList.add('warning');
        } else {
            scoreStatus.textContent = '🔴 Very Low — Action needed!';
            scoreStatus.classList.add('danger');
        }

        // Color the score number
        if (score >= 70) scoreNumber.style.color = '#00E676';
        else if (score >= 50) scoreNumber.style.color = '#FFB300';
        else scoreNumber.style.color = '#FF5252';
    }

    function updateIndicator(id, state) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'stat-indicator';
        if (state) el.classList.add(state);
    }

    function showNotification(title, message, type = 'warning') {
        const icons = { warning: '⚠️', danger: '🚨', success: '✅', info: 'ℹ️' };
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.innerHTML = `
            <span class="notif-icon">${icons[type] || '📢'}</span>
            <div class="notif-content">
                <div class="notif-title">${title}</div>
                <div class="notif-msg">${message}</div>
            </div>
        `;
        notifContainer.appendChild(notif);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        }, 5000);

        // Click to dismiss
        notif.addEventListener('click', () => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        });
    }

})();
