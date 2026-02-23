/**
 * TrackerMode v2.4 — Main Entry Point
 * Wires together: Session, ActivityTracker, WebcamManager, Quiz, Dashboard
 * v2.4: Replaced screen capture with active window monitoring + distraction detection
 */

(function() {
    // --- Icon Paths ---
    const ICONS = {
        eye: '/static/icon/eye.svg',
        mouse: '/static/icon/mouse.svg',
        keyboard: '/static/icon/keyboard.svg',
        screen: '/static/icon/screen.svg',
        warning: '/static/icon/warning.svg',
        alert: '/static/icon/alert.svg',
        check: '/static/icon/check.svg',
        pause: '/static/icon/pause.svg',
        play: '/static/icon/play.svg',
        avg: '/static/icon/bar_avg.svg'
    };
    function icon(name, size = 16) {
        return `<img src="${ICONS[name]}" alt="${name}" style="width:${size}px;height:${size}px;vertical-align:middle;margin-right:4px">`;
    }

    // --- Module Instances ---
    const session = new SessionManager();
    const tracker = new ActivityTracker();
    const webcam = new WebcamManager();
    const quiz = new QuizSystem();
    const dashboard = new Dashboard();
    const pip = new PipMetrics();

    // --- State ---
    let selectedDuration = 25;
    let webcamEnabled = true;
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
    const videoPrompt = document.getElementById('video-prompt');
    const btnVideoYes = document.getElementById('btn-video-yes');
    const btnVideoNo = document.getElementById('btn-video-no');

    let isWatchingVideo = false;
    let lastSummary = null;
    let pipAlertTimer = null;
    // LOGIC-3: consecutiveLowCount tracks VISUAL alert escalation (notification → alarm)
    // session.lowFocusStreak tracks SCORING escalation (alert → quiz trigger)
    // They serve different purposes and reset independently.
    let consecutiveLowCount = 0;
    let alarmActive = false;
    let lastAlertTime = 0;           // Smart cooldown
    const ALERT_COOLDOWN_MS = 30000; // 30 seconds between alerts
    let webcamFailed = false;        // Webcam fallback flag
    let pushPermission = false;      // Browser push notification permission

    // --- Drowsiness Tolerance ---
    let drowsinessEpisodes = 0;       // How many times user was caught drowsy
    let lastDrowsinessTime = 0;       // Cooldown for drowsy notifications
    const DROWSY_COOLDOWN_MS = 60000; // 60s between drowsy warnings
    const DROWSY_TOLERANCE = 3;       // Allow 3 episodes before first warning

    // --- Active App Monitor ---
    const distractionPrompt = document.getElementById('distraction-prompt');
    const btnDistractionYes = document.getElementById('btn-distraction-yes');
    const btnDistractionNo = document.getElementById('btn-distraction-no');
    let whitelistedApps = new Set();     // Apps user confirmed "for studying" this session
    let lastDistractionApp = '';         // Track which app triggered the prompt

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

    // --- Floating Bar Toggle ---
    if (floatingBarToggle) {
        floatingBarToggle.addEventListener('click', () => {
            floatingBar.classList.toggle('collapsed');
        });
    }

    // --- PiP Alert Close ---
    pipAlertClose.addEventListener('click', () => {
        pipAlert.classList.add('hidden');
    });

    // --- "I'm Back" Button — dismiss alarm ---
    // UX-3: "I'm Back" also resumes session if it was auto-paused
    btnImBack.addEventListener('click', () => {
        dismissAlarm();
        if (session.isPaused) {
            session.resume();
            tracker.paused = false;
        }
        showNotification('Welcome back!', 'Let\'s get focused again!', 'success');
        dashboard.addLog(icon('check') + ' User returned — alarm dismissed', 'success');
        consecutiveLowCount = 0;
        session.registerAlarmDismiss(); // track for violation breaks
    });

    // --- Violation Break Suggestion buttons ---
    document.getElementById('btn-accept-break').addEventListener('click', () => {
        document.getElementById('break-suggest').classList.add('hidden');
        dashboard.addLog(icon('pause') + ' User accepted violation break', 'info');
        showBreakReminder(5 * 60, 'violation'); // 5-min violation break
    });
    document.getElementById('btn-skip-break-suggest').addEventListener('click', () => {
        document.getElementById('break-suggest').classList.add('hidden');
        session.resume();
        dashboard.addLog(icon('play') + ' User skipped break suggestion', 'info');
    });

    // --- Video Prompt Buttons ---
    btnVideoYes.addEventListener('click', () => {
        isWatchingVideo = true;
        videoPrompt.classList.add('hidden');
        showNotification('Video Mode', 'Activity tracking paused while you watch.', 'info');
        dashboard.addLog(icon('check') + ' User confirmed watching video', 'success');
        // Resume recovering focus points instantly based on just webcam
    });
    btnVideoNo.addEventListener('click', () => {
        isWatchingVideo = false;
        videoPrompt.classList.add('hidden');
        dashboard.addLog(icon('play') + ' User denied video prompt', 'info');
    });

    // --- Distraction Prompt Buttons ---
    btnDistractionYes.addEventListener('click', () => {
        if (lastDistractionApp) {
            whitelistedApps.add(lastDistractionApp.toLowerCase());
        }
        distractionPrompt.classList.add('hidden');
        showNotification('App Allowed', `${lastDistractionApp} whitelisted for this session.`, 'success');
        dashboard.addLog(icon('check') + ` ${lastDistractionApp} whitelisted (study)`, 'success');
    });
    btnDistractionNo.addEventListener('click', () => {
        distractionPrompt.classList.add('hidden');
        showNotification('Get Back to Work!', `${lastDistractionApp} is a distraction. Focus!`, 'warning');
        dashboard.addLog(icon('warning') + ` ${lastDistractionApp} confirmed as distraction`, 'warning');
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
            dashboard.addLog(icon('screen') + ' PiP window closed', 'info');
        } else {
            const ok = await pip.start();
            if (ok) {
                btnPip.classList.add('active');
                dashboard.addLog(icon('screen') + ' PiP metrics window opened!', 'success');
            } else {
                showNotification('PiP Unavailable', 'PiP not supported in this browser', 'warning');
            }
        }
    });

    // --- Share Screen Button REMOVED in v2.4 (replaced by active window monitor) ---

    async function startSession() {
        const taskName = document.getElementById('focus-task').value.trim() || 'Focus Session';
        headerTaskName.textContent = taskName;

        tracker.enabled.cursor = cursorEnabled;
        tracker.enabled.keyboard = keyboardEnabled;
        webcamFailed = false;
        isWatchingVideo = false;
        videoPrompt.classList.add('hidden');
        distractionPrompt.classList.add('hidden');
        whitelistedApps = new Set();
        lastDistractionApp = '';
        lastAlertTime = 0;
        consecutiveLowCount = 0;
        drowsinessEpisodes = 0;
        lastDrowsinessTime = 0;

        // Send custom distractions to backend
        const customInput = document.getElementById('custom-distractions').value.trim();
        if (customInput) {
            const keywords = customInput.split(',').map(k => k.trim()).filter(Boolean);
            fetch('/api/distractions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords })
            }).then(() => {
                dashboard.addLog(icon('check') + ` Custom distractions set: ${keywords.join(', ')}`, 'info');
            }).catch(() => {});
        }

        // Request browser push notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                pushPermission = perm === 'granted';
                if (pushPermission) dashboard.addLog(icon('check') + ' Push notifications enabled', 'info');
            });
        } else {
            pushPermission = Notification.permission === 'granted';
        }

        switchScreen(sessionScreen);
        dashboard.init();
        dashboard.clearLog();
        dashboard.addLog(icon('avg') + ' Session started — Stay focused!', 'success');

        // Start session timer
        session.start(selectedDuration, taskName);

        // Update cycle badge
        document.getElementById('cycle-badge').textContent = `Cycle ${session.currentCycle}/${session.maxCycles}`;

        // Start activity tracker
        await tracker.start();
        if (tracker.useGlobal) {
            dashboard.addLog(icon('check') + ' Global input tracking active (pynput)', 'success');
        } else {
            dashboard.addLog(icon('warning') + ' Browser-only input tracking (limited)', 'warning');
        }

        // Start webcam
        if (webcamEnabled) {
            webcam.start().then(success => {
                if (success) {
                    dashboard.addLog(icon('eye') + ' Webcam activated — tracking eye contact', 'info');
                    updateIndicator('stat-webcam-indicator', 'active');
                } else {
                    dashboard.addLog(icon('warning') + ' Webcam unavailable — using cursor/keyboard only', 'warning');
                    webcamEnabled = false;
                }
            });
        } else {
            document.getElementById('stat-webcam-value').textContent = 'Off';
        }

        // Active window monitoring is handled via tracker.onActivityChange below
        dashboard.addLog(icon('screen') + ' Active App Monitor enabled', 'info');

        // --- Wire Callbacks ---

        // Timer tick
        // UX-4: Update tab title with timer
        session.onTick = (timeStr) => {
            timerDisplay.textContent = timeStr;
            document.title = `${timeStr} — TrackerMode`;
        };

        // Webcam attention data (v2.1: includes gaze, head_pose, blink_rate, ear)
        // LOGIC-2: Guard against stale frames after webcam disconnect
        webcam.onAttentionData((data) => {
            if (!session.isRunning || session.isPaused || webcamFailed) return;
            latestWebcamData = data;

            // Handle Drowsiness — tolerant, human-friendly approach
            if (data.drowsiness === 'deep_sleep') {
                // 60+ seconds eyes closed → alarm immediately
                if (!alarmActive) {
                    triggerAlarm(`Wake Up! You've been asleep for ${data.eye_closed_seconds || 60}s!`);
                    dashboard.addLog(icon('warning') + ` Deep sleep detected (${data.eye_closed_seconds}s)`, 'danger');
                    sendPushNotification('WAKE UP!', 'You fell asleep during your focus session!');
                }
            } else if (data.drowsiness === 'microsleep') {
                // 15-60s eyes closed → count episodes, only warn after repeated
                drowsinessEpisodes++;
                if (drowsinessEpisodes >= 4 && !alarmActive) {
                    triggerAlarm('You keep falling asleep! Take a break.');
                    dashboard.addLog(icon('warning') + ` Repeated microsleep (episode #${drowsinessEpisodes})`, 'danger');
                } else if (drowsinessEpisodes >= 2 && Date.now() - lastDrowsinessTime > DROWSY_COOLDOWN_MS) {
                    lastDrowsinessTime = Date.now();
                    showNotification('Microsleep Detected', `You dozed off for ${data.eye_closed_seconds || 15}s. Stay awake!`, 'warning');
                    dashboard.addLog(icon('warning') + ` Microsleep #${drowsinessEpisodes} (${data.eye_closed_seconds}s)`, 'warning');
                }
            } else if (data.drowsiness === 'drowsy') {
                // 3-15s eyes closed → just log silently first few times
                drowsinessEpisodes++;
                if (drowsinessEpisodes >= DROWSY_TOLERANCE && Date.now() - lastDrowsinessTime > DROWSY_COOLDOWN_MS) {
                    lastDrowsinessTime = Date.now();
                    showNotification('Feeling Drowsy?', 'Your eyes have been closing. Wake up!', 'warning');
                    dashboard.addLog(icon('warning') + ` Drowsiness episode #${drowsinessEpisodes}`, 'warning');
                }
            } else {
                // Eyes open → gradually forgive past episodes (1 forgiven per open frame)
                if (drowsinessEpisodes > 0) drowsinessEpisodes = Math.max(0, drowsinessEpisodes - 0.05);
            }

            const activityScore = isWatchingVideo ? 100 : tracker.getActivityScore();
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
                gaze: data.face_detected ? (data.gaze_direction || '--') : 'none',
                eyes: data.face_detected ? (data.eyes_open ? 'Open' : 'Closed') : 'none',
                head: data.face_detected ? (data.head_pose || '--').replace('_', ' ') : 'none',
                blink: String(data.blink_rate || 0)
            });
        });

        // Webcam error/disconnect fallback
        webcam.onError = () => {
            if (!webcamFailed) {
                webcamFailed = true;
                webcamEnabled = false;
                dashboard.addLog(icon('warning') + ' Webcam lost — switched to keyboard/mouse-only mode', 'warning');
                showNotification('Webcam Disconnected', 'Scoring now uses keyboard/mouse only', 'warning');
                sendPushNotification('TrackerMode', 'Webcam disconnected — fallback mode active');
                document.getElementById('stat-webcam-value').textContent = 'Offline';
                updateIndicator('stat-webcam-indicator', 'danger');
            }
        };

        // Screen capture removed in v2.4 — replaced by active window monitor

        // Activity tracker
        tracker.onActivityChange((status) => {
            if (!session.isRunning) return;
            
            if (status.mouseActive || status.keyboardActive) {
                if (isWatchingVideo) {
                    isWatchingVideo = false;
                    showNotification('Video Mode Ended', 'Activity detected. Normal tracking resumed.', 'info');
                    dashboard.addLog(icon('avg') + ' Video mode ended (activity detected)', 'info');
                }
            }

            // --- Active App Monitor ---
            const win = status.activeWindow;
            if (win && win.title !== 'Unknown') {
                const lowerTitle = win.title.toLowerCase();
                let displayApp = win.app || win.title;
                let displayIcon = '🖥️';

                // Smart app detection for beautiful icons
                if (lowerTitle.includes('youtube')) { displayApp = 'YouTube'; displayIcon = '▶️'; }
                else if (lowerTitle.includes('whatsapp')) { displayApp = 'WhatsApp'; displayIcon = '💬'; }
                else if (lowerTitle.includes('visual studio code') || lowerTitle.includes('vscode') || lowerTitle.includes('cursor')) { displayApp = 'VS Code'; displayIcon = '💻'; }
                else if (lowerTitle.includes('discord')) { displayApp = 'Discord'; displayIcon = '🎮'; }
                else if (lowerTitle.includes('netflix')) { displayApp = 'Netflix'; displayIcon = '🍿'; }
                else if (lowerTitle.includes('instagram')) { displayApp = 'Instagram'; displayIcon = '📸'; }
                else if (lowerTitle.includes('tiktok')) { displayApp = 'TikTok'; displayIcon = '🎵'; }
                else if (lowerTitle.includes('spotify')) { displayApp = 'Spotify'; displayIcon = '🎧'; }
                else if (lowerTitle.includes('github')) { displayApp = 'GitHub'; displayIcon = '🐙'; }
                else if (lowerTitle.includes('chatgpt') || lowerTitle.includes('openai')) { displayApp = 'ChatGPT'; displayIcon = '🤖'; }
                else if (lowerTitle.includes('chrome') || lowerTitle.includes('edge') || lowerTitle.includes('brave') || lowerTitle.includes('firefox')) { displayApp = 'Browser'; displayIcon = '🌐'; }
                else if (win.matched_keyword) {
                    displayApp = win.matched_keyword.charAt(0).toUpperCase() + win.matched_keyword.slice(1);
                    displayIcon = '📱';
                }

                document.getElementById('active-app-name').textContent = displayApp;
                document.getElementById('active-window-title').textContent = win.title;
                document.getElementById('active-window-title').title = win.title;
                document.getElementById('app-monitor-icon').textContent = displayIcon;
                
                const statusEl = document.getElementById('active-app-status');
                const bgEl = document.getElementById('app-monitor-bg');
                
                // If it's a known distraction and not whitelisted yet
                if (win.is_distraction && !whitelistedApps.has((win.matched_keyword || '').toLowerCase())) {
                    statusEl.textContent = '⚠️ Distraction';
                    statusEl.className = 'app-monitor-status distraction';
                    if (bgEl) bgEl.className = 'app-monitor-bg distraction';
                    
                    // Show distraction prompt (first time per app per session)
                    const appKey = (win.matched_keyword || displayApp).toLowerCase();
                    if (!whitelistedApps.has(appKey) && distractionPrompt.classList.contains('hidden')) {
                        lastDistractionApp = displayApp;
                        document.getElementById('distraction-app-name').textContent = `${lastDistractionApp} Detected`;
                        distractionPrompt.classList.remove('hidden');
                        dashboard.addLog(icon('warning') + ` Distraction detected: ${lastDistractionApp}`, 'warning');
                    }
                } else {
                    statusEl.textContent = '✅ On Task';
                    statusEl.className = 'app-monitor-status on-task';
                    if (bgEl) bgEl.className = 'app-monitor-bg on-task';
                }
            }

            if (!status.mouseActive && cursorEnabled) {
                dashboard.addLog(icon('mouse') + ` Mouse idle for ${status.mouseIdleSeconds}s`, 'warning');
            }
            if (!status.keyboardActive && keyboardEnabled) {
                dashboard.addLog(icon('keyboard') + ` Keyboard idle for ${status.keyIdleSeconds}s`, 'warning');
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
            // LOGIC-1: avgScore can be null on first tick before any scoring
            document.getElementById('stat-avg-value').textContent = `${avgScore ?? 0}%`;

            if (!webcamEnabled) {
                const activityScore = isWatchingVideo ? 100 : tracker.getActivityScore();
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

        // Alert — show PiP bar + check for alarm + SMART COOLDOWN
        session.onAlert = (score) => {
            const now = Date.now();
            
            // Checking if we should show the video prompt instead of normal alert
            const status = tracker.getStatus();
            if (!isWatchingVideo && latestWebcamData && latestWebcamData.looking_at_screen && (status.mouseIdleSeconds > 30 || status.keyIdleSeconds > 30)) {
                // User is looking at screen but inactive. Show video prompt.
                if (videoPrompt.classList.contains('hidden')) {
                    videoPrompt.classList.remove('hidden');
                    dashboard.addLog(icon('screen') + ' Showing Video prompt due to inactivity', 'info');
                }
                // Suppress normal alert while asking, but still count cooldown logic below if we wanted
                // We just return to skip this alert entirely this tick
                return;
            }

            // Smart cooldown: skip if less than 30s since last alert
            if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
                consecutiveLowCount++; // still count for alarm trigger
                return;
            }
            lastAlertTime = now;

            const roast = roasts[Math.floor(Math.random() * roasts.length)];

            // Escalating severity
            let severity = 'warning';
            if (consecutiveLowCount >= 4) severity = 'danger';

            showPipAlert('Focus Dropping!', roast, score, severity);
            showNotification('Focus Dropping!', roast, severity);
            pip.showAlert('Focus Drop!', roast, severity);
            dashboard.addLog(icon('warning') + ` Focus alert — score: ${score}%`, severity);

            // Browser push notification
            sendPushNotification('Focus Dropping!', roast);

            consecutiveLowCount++;
            // Trigger alarm after 3 consecutive alerts
            if (consecutiveLowCount >= 3 && !alarmActive) {
                triggerAlarm(roast);
                dashboard.addLog(icon('alert') + ' ALARM — user seems away!', 'danger');
                sendPushNotification('ALARM', 'You\'ve been unfocused for too long! Come back!');
            }
        };

        // Quiz — also trigger alarm (severe focus drop)
        // LOGIC-5: Don't trigger alarm during quiz — avoid double overlay
        session.onQuiz = () => {
            quiz.show();
            dashboard.addLog(icon('alert') + ' Focus check quiz triggered!', 'danger');
        };

        quiz.onComplete = (correct) => {
            if (correct) {
                showNotification('Correct!', 'Great, now get back to work!', 'success');
                dashboard.addLog(icon('check') + ' Quiz answered correctly', 'success');
            } else {
                showNotification('Wrong Answer', 'Focus harder next time!', 'danger');
                dashboard.addLog(icon('warning') + ' Quiz answered incorrectly', 'danger');
            }
        };

        // Session end (after all cycles or manual stop)
        session.onSessionEnd = (summary) => {
            showSummary(summary);
        };

        // Pomodoro: cycle complete → break time
        session.onCycleEnd = (cycleNum, breakSecs) => {
            dashboard.addLog(icon('check') + ` Cycle ${cycleNum} complete! Break time.`, 'success');
            sendPushNotification('Cycle Complete!', `Cycle ${cycleNum} done. Take a ${Math.floor(breakSecs/60)}-minute break!`);
            showBreakReminder(breakSecs, 'cycle');
        };

        // Pomodoro: violation break suggestion (after 2+ alarm dismissals)
        session.onViolationBreak = () => {
            session.pause();
            document.getElementById('break-suggest').classList.remove('hidden');
            dashboard.addLog(icon('pause') + ' Break suggestion shown', 'warning');
            sendPushNotification("Take a Break?", "You've lost focus multiple times. Maybe take a short break?");
        };
    }

    function togglePause() {
        const paused = session.togglePause();
        tracker.paused = paused; // EDGE-5: stop polling during pause
        const svgIcon = btnPause.querySelector('svg');
        if (paused) {
            svgIcon.innerHTML = '<polygon points="5,3 19,12 5,21" fill="currentColor"/>';
            dashboard.addLog(icon('pause') + ' Session paused', 'info');
            showNotification('Paused', 'Click play to resume.', 'warning');
        } else {
            svgIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
            dashboard.addLog(icon('play') + ' Session resumed', 'info');
        }
    }

    function endSession() {
        session.end();
    }

    async function showSummary(summary) {
        tracker.stop();
        webcam.stop();
        pip.stop();
        dismissAlarm();
        document.title = 'TrackerMode \u2014 Focus Tracker'; // UX-4: reset tab title
        pipAlert.classList.add('hidden');
        consecutiveLowCount = 0;

        document.getElementById('summary-duration').textContent = summary.durationFormatted;
        document.getElementById('summary-focus').textContent = `${summary.avgFocus ?? 0}%`;
        document.getElementById('summary-alerts').textContent = summary.notifications;
        document.getElementById('summary-quizzes').textContent = summary.quizzes;

        // Store summary for AI button
        lastSummary = summary;

        // Reset AI section
        document.getElementById('ai-idle').style.display = 'block';
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-result').style.display = 'none';

        switchScreen(summaryScreen);

        // Push notification for session complete
        sendPushNotification('Session Complete!', `${summary.cyclesCompleted} cycles done. Average focus: ${summary.avgFocus}%.`);
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

            // SEC-2: Sanitize AI output before rendering as HTML
            const safe = data.analysis
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            let html = safe
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
            const faceOk = webcamData.face_detected;

            // Gaze gauge — drop to 0 when no face or 'none'
            const gazeDir = webcamData.gaze_direction;
            const gazeScore = !faceOk || gazeDir === 'none' ? 0
                : gazeDir === 'center' ? 100
                : 50;
            setGauge('gauge-gaze', gazeScore);
            document.getElementById('float-gaze-val').textContent = faceOk ? (gazeDir || '--') : 'none';

            // Eyes gauge — drop to 0 when no face
            const eyesScore = !faceOk ? 0 : (webcamData.eyes_open ? 100 : 10);
            setGauge('gauge-eyes', eyesScore);
            document.getElementById('float-eyes-val').textContent = faceOk ? (webcamData.eyes_open ? 'Open' : 'Closed') : 'none';

            // Head gauge — drop to 0 when no face or 'none'
            const headPose = webcamData.head_pose;
            const headScore = !faceOk || headPose === 'none' ? 0
                : headPose === 'forward' ? 100
                : headPose === 'looking_down' ? 20
                : 60;
            setGauge('gauge-head', headScore);
            document.getElementById('float-head-val').textContent = faceOk ? (headPose || '--').replace('_', ' ') : 'none';

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

        scoreStatus.className = 'focus-status-badge';
        if (score >= 70) {
            scoreStatus.innerHTML = '<span class="status-dot good"></span> Excellent Focus';
            scoreStatus.classList.add('good');
        } else if (score >= 50) {
            scoreStatus.innerHTML = '<span class="status-dot warning"></span> Moderate Focus';
            scoreStatus.classList.add('warning');
        } else if (score >= 30) {
            scoreStatus.innerHTML = '<span class="status-dot warning"></span> Low Focus — Stay alert!';
            scoreStatus.classList.add('warning');
        } else {
            scoreStatus.innerHTML = '<span class="status-dot danger"></span> Very Low — Action needed!';
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
        const notifIcons = {
            warning: `<img src="${ICONS.warning}" style="width:20px;height:20px">`,
            danger: `<img src="${ICONS.alert}" style="width:20px;height:20px">`,
            success: `<img src="${ICONS.check}" style="width:20px;height:20px">`,
            info: `<img src="${ICONS.avg}" style="width:20px;height:20px">`
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
        const pipIconMap = {
            danger: ICONS.alert,
            success: ICONS.check,
            warning: ICONS.warning
        };
        document.getElementById('pip-alert-icon').innerHTML = `<img src="${pipIconMap[type] || pipIconMap.warning}" class="pip-icon-img" alt="alert">`;
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

        const msg = message || 'You\'ve been unfocused for too long!';
        document.getElementById('alarm-msg').textContent = msg;
        alarmOverlay.classList.remove('hidden');

        // Visual notifications FIRST (in case laptop is muted)
        showNotification('🚨 Focus Lost!', msg, 'danger');
        sendPushNotification('🚨 Focus Lost!', msg);

        // Then play alarm sound (loop)
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

    // --- BROWSER PUSH NOTIFICATIONS ---
    function sendPushNotification(title, body) {
        if (!pushPermission || !('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const notif = new Notification(title, {
                body: body,
                icon: '/static/favicon.svg',
                silent: false,
                tag: 'trackermode-alert'
            });
            notif.onclick = function(e) {
                e.preventDefault();
                window.focus();
                notif.close();
            };
        } catch(e) {
            console.warn('Push notification failed:', e);
        }
    }

    // --- POMODORO BREAK REMINDER ---
    function showBreakReminder(breakDurationSecs, breakType) {
        // BUG-3 fix: remove any existing break overlay first
        const existing = document.querySelector('.break-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'break-overlay';

        const breakMins = Math.floor(breakDurationSecs / 60);
        const isLongBreak = breakType === 'final';
        const breakIcon = breakType === 'violation' ? icon('warning', 40) : icon('pause', 40);
        const title = breakType === 'violation' ? 'Quick Break!' : (isLongBreak ? 'Long Break — You\'ve earned it!' :'Pomodoro Break!');
        const msg = breakType === 'violation'
            ? 'Refresh your mind. Stand up and stretch.'
            : `Cycle ${session.currentCycle}/${session.maxCycles} complete. Rest for ${breakMins} minutes.`;

        overlay.innerHTML = `
            <div class="break-content">
                <div class="break-icon">${breakIcon}</div>
                <h2 class="break-title">${title}</h2>
                <p class="break-msg">${msg}</p>
                <div class="break-timer" id="break-countdown">${breakMins}:00</div>
                <button class="btn-skip-break" id="btn-skip-break">Skip Break</button>
            </div>
        `;
        document.body.appendChild(overlay);

        let breakSeconds = breakDurationSecs;
        const countdownEl = overlay.querySelector('#break-countdown');
        const breakInterval = setInterval(() => {
            breakSeconds--;
            const m = Math.floor(breakSeconds / 60);
            const s = breakSeconds % 60;
            countdownEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
            if (breakSeconds <= 0) {
                clearInterval(breakInterval);
                overlay.remove();
                onBreakComplete(breakType);
            }
        }, 1000);

        overlay.querySelector('#btn-skip-break').addEventListener('click', () => {
            clearInterval(breakInterval);
            overlay.remove();
            onBreakComplete(breakType);
        });
    }

    function onBreakComplete(breakType) {
        sendPushNotification('Break Over!', 'Ready for the next focus session?');

        if (breakType === 'violation') {
            // Resume remaining time
            session.resumeFromBreak();
            dashboard.addLog(icon('play') + ' Session resumed after break', 'success');
            showNotification('Let\'s go!', 'Session resumed. Stay focused!', 'success');
        } else if (breakType === 'cycle') {
            // Start next cycle
            session.startNextCycle();
            document.getElementById('cycle-badge').textContent = `Cycle ${session.currentCycle}/${session.maxCycles}`;
            dashboard.addLog(icon('play') + ` Cycle ${session.currentCycle} started`, 'success');
            showNotification('New Cycle!', `Cycle ${session.currentCycle} — Let\'s focus!`, 'success');
        }
    }

})();
