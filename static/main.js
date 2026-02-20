/**
 * TrackerMode v2.1 — Main Entry Point
 * Wires together: Session, ActivityTracker, WebcamManager, ScreenCapture, Quiz, Dashboard
 * New in v2.1: Floating metrics bar, screen capture, AI session analysis, mediapipe data
 */

(function() {
    // --- Module Instances ---
    const session = new SessionManager();
    const tracker = new ActivityTracker();
    const webcam = new WebcamManager();
    const screenCap = new ScreenCapture();
    const quiz = new QuizSystem();
    const dashboard = new Dashboard();
    const pip = new PipMetrics();

    // --- State ---
    let selectedDuration = 25;
    let webcamEnabled = true;
    let screenEnabled = true;
    let cursorEnabled = true;
    let keyboardEnabled = true;
    let latestWebcamData = null;

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
    const floatingBar = document.getElementById('floating-bar');
    const floatingBarToggle = document.getElementById('floating-bar-toggle');
    const pipAlert = document.getElementById('pip-alert');
    const pipAlertClose = document.getElementById('pip-alert-close');
    const alarmOverlay = document.getElementById('alarm-overlay');
    const alarmSound = document.getElementById('alarm-sound');
    const btnImBack = document.getElementById('btn-im-back');
    let lastSummary = null;
    let pipAlertTimer = null;
    let consecutiveLowCount = 0;
    let alarmActive = false;

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
    document.getElementById('toggle-screen').addEventListener('change', (e) => { screenEnabled = e.target.checked; });
    document.getElementById('toggle-cursor').addEventListener('change', (e) => { cursorEnabled = e.target.checked; });
    document.getElementById('toggle-keyboard').addEventListener('change', (e) => { keyboardEnabled = e.target.checked; });

    // --- Floating Bar Toggle ---
    floatingBarToggle.addEventListener('click', () => {
        floatingBar.classList.toggle('collapsed');
    });

    // --- PiP Alert Close ---
    pipAlertClose.addEventListener('click', () => {
        pipAlert.classList.add('hidden');
    });

    // --- "I'm Back" Button — dismiss alarm ---
    btnImBack.addEventListener('click', () => {
        dismissAlarm();
        showNotification('✅ Welcome back!', 'Let\'s get focused again!', 'success');
        dashboard.addLog('✅ User returned — alarm dismissed', 'success');
        consecutiveLowCount = 0;
    });

    // --- Buttons ---
    btnStart.addEventListener('click', startSession);
    btnPause.addEventListener('click', togglePause);
    btnStop.addEventListener('click', endSession);
    btnRestart.addEventListener('click', () => switchScreen(splashScreen));

    // --- AI Analyze Button ---
    document.getElementById('btn-ai-analyze').addEventListener('click', triggerAIAnalysis);

    // --- PiP Button ---
    document.getElementById('btn-pip').addEventListener('click', async () => {
        const btnPip = document.getElementById('btn-pip');
        if (pip.isActive) {
            pip.stop();
            btnPip.classList.remove('active');
            dashboard.addLog('📺 PiP window closed', 'info');
        } else {
            const ok = await pip.start();
            if (ok) {
                btnPip.classList.add('active');
                dashboard.addLog('📺 PiP metrics window opened!', 'success');
            } else {
                showNotification('⚠️ PiP', 'PiP not supported in this browser', 'warning');
            }
        }
    });

    function startSession() {
        const taskName = document.getElementById('focus-task').value.trim() || 'Focus Session';
        headerTaskName.textContent = taskName;

        tracker.enabled.cursor = cursorEnabled;
        tracker.enabled.keyboard = keyboardEnabled;

        switchScreen(sessionScreen);
        dashboard.init();
        dashboard.clearLog();
        dashboard.addLog('Session started — Stay focused! 🎯', 'success');

        // Start session timer
        session.start(selectedDuration, taskName);

        // Start activity tracker
        tracker.start();

        // Start webcam
        if (webcamEnabled) {
            webcam.start().then(success => {
                if (success) {
                    dashboard.addLog('👁️ Webcam activated — tracking eye contact', 'info');
                    updateIndicator('stat-webcam-indicator', 'active');
                } else {
                    dashboard.addLog('⚠️ Webcam unavailable — using cursor/keyboard only', 'warning');
                    webcamEnabled = false;
                }
            });
        } else {
            document.getElementById('stat-webcam-value').textContent = 'Off';
        }

        // Start screen capture
        if (screenEnabled) {
            screenCap.start().then(success => {
                if (success) {
                    dashboard.addLog('🖥️ Screen capture activated', 'info');
                } else {
                    dashboard.addLog('⚠️ Screen capture denied', 'warning');
                    screenEnabled = false;
                }
            });
        }

        // --- Wire Callbacks ---

        // Timer tick
        session.onTick = (timeStr) => {
            timerDisplay.textContent = timeStr;
        };

        // Webcam attention data (v2.1: includes gaze, head_pose, blink_rate, ear)
        webcam.onAttentionData((data) => {
            if (!session.isRunning || session.isPaused) return;
            latestWebcamData = data;

            const activityScore = tracker.getActivityScore();
            session.updateFocusScore(data.smoothed_score || data.attention_score, activityScore);

            // Update webcam stat
            const eyeScore = data.attention_score;
            document.getElementById('stat-webcam-value').textContent = data.face_detected ? `${eyeScore}%` : 'No face';
            updateIndicator('stat-webcam-indicator', eyeScore >= 60 ? 'active' : eyeScore >= 30 ? 'warning' : 'danger');

            // Update floating bar with mediapipe data
            updateFloatingBar(data, tracker.getStatus());

            // Update PiP window
            pip.update({
                score: data.smoothed_score || data.attention_score,
                gaze: data.gaze_direction || '--',
                eyes: data.eyes_open ? 'Open' : 'Closed',
                head: (data.head_pose || '--').replace('_', ' '),
                blink: String(data.blink_rate || 0)
            });
        });

        // Screen capture events
        screenCap.onCapture((data) => {
            if (data.event === 'stopped') {
                dashboard.addLog('🖥️ Screen capture stopped', 'warning');
                screenEnabled = false;
            }
        });

        // Activity tracker
        tracker.onActivityChange((status) => {
            if (!session.isRunning) return;
            if (!status.mouseActive && cursorEnabled) {
                dashboard.addLog(`🖱️ Mouse idle for ${status.mouseIdleSeconds}s`, 'warning');
            }
            if (!status.keyboardActive && keyboardEnabled) {
                dashboard.addLog(`⌨️ Keyboard idle for ${status.keyIdleSeconds}s`, 'warning');
            }
        });

        // Focus update (every 3 seconds)
        session.onFocusUpdate = (currentScore, avgScore) => {
            updateScoreDisplay(currentScore);

            // Reset alarm counter if focus recovers
            if (currentScore >= 60) {
                consecutiveLowCount = 0;
            }

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

            if (!webcamEnabled) {
                const activityScore = tracker.getActivityScore();
                session.updateFocusScore(null, activityScore);
                // Update floating bar without webcam data
                updateFloatingBar(null, status);
            }

            pip.update({
                mouse: status.mouseActive ? 'Active' : `Idle ${status.mouseIdleSeconds}s`,
                keys: status.keyboardActive ? 'Active' : `Idle ${status.keyIdleSeconds}s`
            });

            dashboard.addDataPoint(currentScore, session.elapsed);
        };

        // Alert — show PiP bar + check for alarm
        session.onAlert = (score) => {
            const roast = roasts[Math.floor(Math.random() * roasts.length)];
            showPipAlert('⚠️ Focus Dropping!', roast, score, 'warning');
            showNotification('⚠️ Focus Dropping!', roast, 'warning');
            pip.showAlert('⚠️ Focus Drop!', roast, 'warning');
            dashboard.addLog(`⚠️ Focus alert — score: ${score}%`, 'warning');

            consecutiveLowCount++;
            // Trigger alarm after 3 consecutive alerts
            if (consecutiveLowCount >= 3 && !alarmActive) {
                triggerAlarm(roast);
                dashboard.addLog('🚨 ALARM — user seems away!', 'danger');
            }
        };

        // Quiz — also trigger alarm (severe focus drop)
        session.onQuiz = () => {
            quiz.show();
            dashboard.addLog('⚡ Focus check quiz triggered!', 'danger');
            // If score is very low, also sound alarm
            if (consecutiveLowCount >= 2) {
                triggerAlarm('Your focus is critically low!');
            }
        };

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
            showNotification('⏸️ Paused', 'Click play to resume.', 'warning');
        } else {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
            dashboard.addLog('▶️ Session resumed', 'info');
        }
    }

    function endSession() {
        session.end();
    }

    async function showSummary(summary) {
        tracker.stop();
        webcam.stop();
        screenCap.stop();
        pip.stop();
        dismissAlarm();
        pipAlert.classList.add('hidden');
        consecutiveLowCount = 0;

        document.getElementById('summary-duration').textContent = summary.durationFormatted;
        document.getElementById('summary-focus').textContent = `${summary.avgFocus}%`;
        document.getElementById('summary-alerts').textContent = summary.notifications;
        document.getElementById('summary-quizzes').textContent = summary.quizzes;

        // Store summary for AI button
        lastSummary = summary;

        // Reset AI section
        document.getElementById('ai-idle').style.display = 'block';
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-result').style.display = 'none';

        switchScreen(summaryScreen);
    }

    async function triggerAIAnalysis() {
        if (!lastSummary) return;

        const btn = document.getElementById('btn-ai-analyze');
        const aiIdle = document.getElementById('ai-idle');
        const aiLoading = document.getElementById('ai-loading');
        const aiResult = document.getElementById('ai-result');

        btn.disabled = true;
        aiIdle.style.display = 'none';
        aiLoading.style.display = 'flex';
        aiResult.style.display = 'none';

        try {
            const focusSample = lastSummary.focusHistory
                ? lastSummary.focusHistory
                    .filter((_, i) => i % Math.max(1, Math.floor(lastSummary.focusHistory.length / 30)) === 0)
                    .map(p => p.score)
                : [];

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...lastSummary, focusSample })
            });

            const data = await response.json();
            aiLoading.style.display = 'none';
            aiResult.style.display = 'block';

            let html = data.analysis
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            aiResult.innerHTML = html;
        } catch (err) {
            aiLoading.style.display = 'none';
            aiResult.style.display = 'block';
            aiResult.innerHTML = `<p>⚠️ Could not connect to AI. Check server & .env.</p>`;
        }
    }

    // --- Floating Bar Update ---
    function updateFloatingBar(webcamData, activityStatus) {
        if (webcamData) {
            // Gaze gauge
            const gazeScore = webcamData.gaze_direction === 'center' ? 100 : webcamData.gaze_direction === 'unknown' ? 0 : 50;
            setGauge('gauge-gaze', gazeScore);
            document.getElementById('float-gaze-val').textContent = webcamData.gaze_direction || '--';

            // Eyes gauge
            const eyesScore = webcamData.eyes_open ? 100 : 10;
            setGauge('gauge-eyes', eyesScore);
            document.getElementById('float-eyes-val').textContent = webcamData.eyes_open ? 'Open' : 'Closed';

            // Head gauge
            const headScore = webcamData.head_pose === 'forward' ? 100 : webcamData.head_pose === 'looking_down' ? 20 : 60;
            setGauge('gauge-head', headScore);
            document.getElementById('float-head-val').textContent = (webcamData.head_pose || '--').replace('_', ' ');

            // Blink rate
            document.getElementById('float-blink-val').textContent = `${webcamData.blink_rate || 0}/m`;
        }

        if (activityStatus) {
            // Mouse gauge
            const mouseScore = activityStatus.mouseActive !== false ? 100 : Math.max(0, 100 - activityStatus.mouseIdleSeconds * 3);
            setGauge('gauge-mouse', mouseScore);
            document.getElementById('float-mouse-val').textContent = activityStatus.mouseActive !== false ? 'Active' : `Idle ${activityStatus.mouseIdleSeconds}s`;

            // Keys gauge
            const keysScore = activityStatus.keyboardActive !== false ? 100 : Math.max(0, 100 - activityStatus.keyIdleSeconds * 2);
            setGauge('gauge-keys', keysScore);
            document.getElementById('float-keys-val').textContent = activityStatus.keyboardActive !== false ? 'Active' : `Idle ${activityStatus.keyIdleSeconds}s`;
        }
    }

    function setGauge(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.width = `${Math.max(0, Math.min(100, value))}%`;
        el.className = 'gauge-fill';
        if (value >= 70) el.classList.add('good');
        else if (value >= 40) el.classList.add('warning');
        else el.classList.add('danger');
    }

    // --- UI Helpers ---
    function switchScreen(screen) {
        [splashScreen, sessionScreen, summaryScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    function updateScoreDisplay(score) {
        scoreNumber.textContent = score;
        const circumference = 2 * Math.PI * 85;
        const offset = circumference - (score / 100) * circumference;
        scoreRingFill.style.strokeDashoffset = offset;

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
        setTimeout(() => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        }, 5000);
        notif.addEventListener('click', () => {
            notif.classList.add('removing');
            setTimeout(() => notif.remove(), 300);
        });
    }

    // --- PiP Alert Bar ---
    function showPipAlert(title, message, score, type = 'warning') {
        document.getElementById('pip-alert-icon').textContent = type === 'danger' ? '🚨' : type === 'success' ? '✅' : '⚠️';
        document.getElementById('pip-alert-title').textContent = title;
        document.getElementById('pip-alert-msg').textContent = message;
        document.getElementById('pip-alert-score').textContent = score;

        const scoreEl = document.getElementById('pip-alert-score');
        if (score >= 50) scoreEl.style.color = '#FFB300';
        else scoreEl.style.color = '#FF5252';

        pipAlert.className = `pip-alert ${type}`;

        clearTimeout(pipAlertTimer);
        pipAlertTimer = setTimeout(() => {
            pipAlert.classList.add('hidden');
        }, 8000);
    }

    // --- ALARM SYSTEM ---
    function triggerAlarm(message) {
        if (alarmActive) return;
        alarmActive = true;

        document.getElementById('alarm-msg').textContent = message || 'You\'ve been unfocused for too long!';
        alarmOverlay.classList.remove('hidden');

        // Play alarm sound (loop)
        alarmSound.currentTime = 0;
        alarmSound.play().catch(err => {
            console.warn('Audio play blocked:', err);
        });
    }

    function dismissAlarm() {
        alarmActive = false;
        alarmOverlay.classList.add('hidden');
        alarmSound.pause();
        alarmSound.currentTime = 0;
    }

})();
