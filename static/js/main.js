/**
 * TrackerMode v2.6 — Main Orchestrator
 * Wires together: AlertManager, DistractionHandler, BreakManager, UIManager,
 * Session, ActivityTracker, WebcamManager, Quiz, Dashboard, PipMetrics.
 *
 * v2.6: General/Strict distraction modes + Writing/Watching activity detection.
 *       Session persistence via /api/sessions.
 */
(function () {
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

    // DOM Refs used by UI
    const splashScreen = document.getElementById('splash-screen');
    const sessionScreen = document.getElementById('session-screen');
    const summaryScreen = document.getElementById('summary-screen');
    const scoreNumber = document.getElementById('score-number');
    const scoreRingFill = document.getElementById('score-ring-fill');
    const scoreStatus = document.getElementById('score-status');

    const ui = new UIManager({
        splashScreen, sessionScreen, summaryScreen,
        scoreNumber, scoreRingFill, scoreStatus
    });

    const alerts = new AlertManager({
        notifContainer: document.getElementById('notification-container'),
        pipAlert: document.getElementById('pip-alert'),
        alarmOverlay: document.getElementById('alarm-overlay'),
        alarmSound: document.getElementById('alarm-sound'),
        ICONS, iconFn: icon
    });

    const distractions = new DistractionHandler();

    const breaks = new BreakManager({
        iconFn: icon,
        onComplete: onBreakComplete
    });

    // --- Theme Toggle ---
    const savedTheme = localStorage.getItem('trackermode-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('trackermode-theme', next);
    });

    // --- State ---
    let selectedDuration = 25;
    let webcamEnabled = true;
    let cursorEnabled = true;
    let keyboardEnabled = true;
    let latestWebcamData = null;
    let isWatchingVideo = false;
    let isWritingMode = false;       // v2.6: writing mode — relaxes gaze scoring
    let lastSummary = null;
    let webcamFailed = false;
    let distractionMode = 'general'; // v2.6: 'general' or 'strict'
    let activityPromptInterval = null; // v2.6: 5-min activity check

    // --- DOM Refs ---
    const btnStart = document.getElementById('btn-start-focus');
    const btnPause = document.getElementById('btn-pause');
    const btnStop = document.getElementById('btn-stop');
    const btnRestart = document.getElementById('btn-restart');
    const timerDisplay = document.getElementById('timer-display');
    const headerTaskName = document.getElementById('header-task-name');
    const floatingBar = document.getElementById('floating-bar');
    const floatingBarToggle = document.getElementById('floating-bar-toggle');
    const pipAlert = document.getElementById('pip-alert');
    const pipAlertClose = document.getElementById('pip-alert-close');
    const videoPrompt = document.getElementById('video-prompt');
    const btnVideoYes = document.getElementById('btn-video-yes');
    const btnVideoNo = document.getElementById('btn-video-no');
    const distractionPrompt = document.getElementById('distraction-prompt');
    const btnDistractionYes = document.getElementById('btn-distraction-yes');
    const btnDistractionNo = document.getElementById('btn-distraction-no');
    const activityPrompt = document.getElementById('activity-prompt');
    const btnActivityWriting = document.getElementById('btn-activity-writing');
    const btnActivityWatching = document.getElementById('btn-activity-watching');

    // --- Duration Selector ---
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDuration = parseInt(btn.dataset.minutes);
            const customInput = document.getElementById('custom-duration');
            if (customInput) customInput.value = '';
        });
    });

    const customDurationInput = document.getElementById('custom-duration');
    if (customDurationInput) {
        customDurationInput.addEventListener('input', () => {
            const val = parseInt(customDurationInput.value);
            if (val && val > 0) {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                selectedDuration = Math.min(val, 240);
            }
        });
        customDurationInput.addEventListener('blur', () => {
            const val = parseInt(customDurationInput.value);
            if (!val || val <= 0) {
                if (!document.querySelector('.duration-btn.active')) {
                    const defaultBtn = document.querySelector('.duration-btn[data-minutes="25"]');
                    if (defaultBtn) {
                        defaultBtn.classList.add('active');
                        selectedDuration = 25;
                    }
                }
            }
        });
    }

    // --- Feature Card Expand/Collapse ---
    document.querySelectorAll('.feature-card[data-expandable]').forEach(card => {
        const header = card.querySelector('.feature-card-header');
        if (header) {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.toggle-switch')) return;
                card.classList.toggle('expanded');
            });
        }
    });

    // --- Mode Selector (General / Strict) ---
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            distractionMode = btn.dataset.mode;
            document.getElementById('distraction-mode').value = distractionMode;

            const label = document.getElementById('app-list-label');
            const hint = document.getElementById('app-list-hint-top');
            const tagInput = document.getElementById('distraction-input');

            if (distractionMode === 'strict') {
                label.textContent = 'Allowed Apps';
                hint.textContent = 'Only these apps are allowed. Everything else triggers distraction alerts.';
                tagInput.placeholder = 'Type allowed app name...';
            } else {
                label.textContent = 'Distraction Apps';
                hint.textContent = 'Apps that will trigger distraction alerts when opened.';
                tagInput.placeholder = 'Type app name...';
            }
        });
    });

    // --- Tag Input (Distraction/Allowed Apps) ---
    const tagContainer = document.getElementById('distraction-tags');
    const tagInput = document.getElementById('distraction-input');
    const btnAddTag = document.getElementById('btn-add-distraction');
    const hiddenDistractions = document.getElementById('custom-distractions');
    let distractionTags = [];

    function renderTags() {
        if (!tagContainer) return;
        tagContainer.innerHTML = '';
        distractionTags.forEach((tag, index) => {
            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
                <span>${tag}</span>
                <button type="button" class="tag-chip-remove" aria-label="Remove" data-index="${index}">\u00d7</button>
            `;
            tagContainer.appendChild(chip);
        });
        if (hiddenDistractions) {
            hiddenDistractions.value = distractionTags.join(', ');
        }
    }

    function addTag() {
        if (!tagInput) return;
        const val = tagInput.value.trim().toLowerCase();
        if (val && !distractionTags.includes(val)) {
            distractionTags.push(val);
            renderTags();
        }
        tagInput.value = '';
        tagInput.focus();
    }

    if (tagInput && btnAddTag) {
        btnAddTag.addEventListener('click', addTag);
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        });
        tagContainer.addEventListener('click', (e) => {
            if (e.target.closest('.tag-chip-remove')) {
                const index = e.target.closest('.tag-chip-remove').dataset.index;
                distractionTags.splice(index, 1);
                renderTags();
            }
        });
        if (hiddenDistractions && hiddenDistractions.value) {
            distractionTags = hiddenDistractions.value.split(',').map(t => t.trim()).filter(t => t);
            renderTags();
        }
    }

    // --- Toggle Validation (Min 2 Features) ---
    const startBtnEl = document.getElementById('btn-start-focus');
    const validationMsg = document.getElementById('start-validation-msg');
    let windowEnabled = true;

    function validateToggles() {
        if (!startBtnEl || !validationMsg) return;
        const activeCount = [webcamEnabled, cursorEnabled, keyboardEnabled, windowEnabled].filter(Boolean).length;
        if (activeCount < 2) {
            startBtnEl.classList.add('disabled');
            validationMsg.classList.remove('hidden');
            return false;
        } else {
            startBtnEl.classList.remove('disabled');
            validationMsg.classList.add('hidden');
            return true;
        }
    }

    // --- Toggle Listeners ---
    document.getElementById('toggle-webcam').addEventListener('change', (e) => { webcamEnabled = e.target.checked; validateToggles(); });
    document.getElementById('toggle-cursor').addEventListener('change', (e) => { cursorEnabled = e.target.checked; validateToggles(); });
    document.getElementById('toggle-keyboard').addEventListener('change', (e) => { keyboardEnabled = e.target.checked; validateToggles(); });
    const toggleWindow = document.getElementById('toggle-window');
    if (toggleWindow) {
        toggleWindow.addEventListener('change', (e) => { windowEnabled = e.target.checked; validateToggles(); });
    }
    validateToggles();

    // --- Floating Bar Toggle ---
    if (floatingBarToggle) {
        floatingBarToggle.addEventListener('click', () => floatingBar.classList.toggle('collapsed'));
    }

    // --- PiP Alert Close ---
    pipAlertClose.addEventListener('click', () => pipAlert.classList.add('hidden'));

    // --- "I'm Back" Button — dismiss alarm ---
    document.getElementById('btn-im-back').addEventListener('click', () => {
        alerts.dismissAlarm();
        if (session.isPaused) {
            session.resume();
            tracker.paused = false;
        }
        alerts.showNotification('Welcome back!', "Let's get focused again!", 'success');
        dashboard.addLog(icon('check') + ' User returned \u2014 alarm dismissed', 'success');
        alerts.consecutiveLowCount = 0;
        session.registerAlarmDismiss();
    });

    // --- Violation Break Suggestion buttons ---
    document.getElementById('btn-accept-break').addEventListener('click', () => {
        document.getElementById('break-suggest').classList.add('hidden');
        dashboard.addLog(icon('pause') + ' User accepted violation break', 'info');
        breaks.show(5 * 60, 'violation', session);
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
        alerts.showNotification('Video Mode', 'Activity tracking paused while you watch.', 'info');
        dashboard.addLog(icon('check') + ' User confirmed watching video', 'success');
    });
    btnVideoNo.addEventListener('click', () => {
        isWatchingVideo = false;
        videoPrompt.classList.add('hidden');
        dashboard.addLog(icon('play') + ' User denied video prompt', 'info');
    });

    // --- Distraction Prompt Buttons ---
    btnDistractionYes.addEventListener('click', () => {
        if (distractions.lastDistractionApp) {
            distractions.whitelist(distractions.lastDistractionApp);
        }
        distractionPrompt.classList.add('hidden');
        alerts.showNotification('App Allowed', `${distractions.lastDistractionApp} whitelisted for this session.`, 'success');
        dashboard.addLog(icon('check') + ` ${distractions.lastDistractionApp} whitelisted (study)`, 'success');
    });
    btnDistractionNo.addEventListener('click', () => {
        distractionPrompt.classList.add('hidden');
        alerts.showNotification('Get Back to Work!', `${distractions.lastDistractionApp} is a distraction. Focus!`, 'warning');
        dashboard.addLog(icon('warning') + ` ${distractions.lastDistractionApp} confirmed as distraction`, 'warning');
    });

    // --- Activity Prompt Buttons (Writing / Watching) v2.6 ---
    btnActivityWriting.addEventListener('click', () => {
        isWritingMode = true;
        isWatchingVideo = false;
        activityPrompt.classList.add('hidden');
        alerts.showNotification('Writing Mode', 'Gaze tracking relaxed — focus on your writing!', 'info');
        dashboard.addLog(icon('check') + ' User is writing — gaze metrics relaxed', 'success');
    });
    btnActivityWatching.addEventListener('click', () => {
        isWritingMode = false;
        isWatchingVideo = true;
        activityPrompt.classList.add('hidden');
        alerts.showNotification('Watching Mode', 'Activity tracking paused while you watch.', 'info');
        dashboard.addLog(icon('check') + ' User is watching/reading — normal gaze tracking', 'success');
    });

    // --- Buttons ---
    btnStart.addEventListener('click', startSession);
    btnPause.addEventListener('click', togglePause);
    btnStop.addEventListener('click', endSession);
    btnRestart.addEventListener('click', () => ui.switchScreen(splashScreen));

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
                alerts.showNotification('PiP Unavailable', 'PiP not supported in this browser', 'warning');
            }
        }
    });

    // ============================================================
    //  Start Session
    // ============================================================

    async function startSession() {
        if (!validateToggles()) return;

        const taskName = document.getElementById('focus-task').value.trim() || 'Focus Session';
        headerTaskName.textContent = taskName;

        // Show motivation modal if apps are set
        const tagList = document.querySelector('.tag-list');
        const tags = tagList ? Array.from(tagList.querySelectorAll('.tag-chip')).map(t => t.textContent.replace('\u00d7', '').trim()) : [];
        if (tags.length > 0) {
            await ui.showMotivationModal(taskName, tags, distractionMode);
        }

        tracker.enabled.cursor = cursorEnabled;
        tracker.enabled.keyboard = keyboardEnabled;
        tracker.enabled.window = windowEnabled;

        // Reset state
        webcamFailed = false;
        isWatchingVideo = false;
        isWritingMode = false;
        window.isWatchingVideo = false;
        videoPrompt.classList.add('hidden');
        distractionPrompt.classList.add('hidden');
        activityPrompt.classList.add('hidden');
        latestWebcamData = null;
        alerts.reset();
        distractions.reset();

        // Get mode and app list
        const currentMode = document.getElementById('distraction-mode').value || 'general';
        distractionMode = currentMode;

        // Send custom distractions/allowed apps to backend
        const customInput = document.getElementById('custom-distractions').value.trim();
        const keywords = customInput ? customInput.split(',').map(k => k.trim()).filter(Boolean) : [];

        // Set mode on frontend handler
        distractions.setMode(distractionMode, keywords);

        fetch('/api/distractions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords, mode: distractionMode })
        }).then(() => {
            if (distractionMode === 'strict') {
                dashboard.addLog(icon('check') + ` Strict Mode: allowed apps: ${keywords.join(', ') || 'none'}`, 'info');
            } else {
                dashboard.addLog(icon('check') + ` General Mode: distraction apps: ${keywords.join(', ') || 'default list'}`, 'info');
            }
        }).catch(() => {});

        // Request browser push notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                alerts.pushPermission = perm === 'granted';
                if (alerts.pushPermission) dashboard.addLog(icon('check') + ' Push notifications enabled', 'info');
            });
        } else {
            alerts.pushPermission = Notification.permission === 'granted';
        }

        ui.switchScreen(sessionScreen);
        dashboard.init();
        dashboard.clearLog();
        dashboard.addLog(icon('avg') + ' Session started \u2014 Stay focused!', 'success');

        session.start(selectedDuration, taskName, {
            webcam: webcamEnabled,
            cursor: cursorEnabled,
            keyboard: keyboardEnabled,
            window: windowEnabled
        });
        document.getElementById('cycle-badge').textContent = `Cycle ${session.currentCycle}/${session.maxCycles}`;

        // Start activity tracker
        await tracker.start();
        if (tracker.useGlobal) {
            dashboard.addLog(icon('check') + ' Global input tracking active (pynput)', 'success');
            dashboard.addLog(icon('screen') + ' Active App Monitor enabled', 'info');
        } else {
            dashboard.addLog(icon('screen') + ' Browser mode \u2014 Tab Focus tracking active', 'info');
            dashboard.addLog(icon('mouse') + ' Page interaction tracking (mouse/keyboard in tab)', 'info');
            // Update app monitor panel to show tab focus info
            document.getElementById('active-app-name').textContent = 'TrackerMode Tab';
            document.getElementById('active-window-title').textContent = 'Monitoring tab visibility & focus';
            document.getElementById('app-monitor-icon').textContent = '\ud83d\udcf1';
            document.getElementById('active-app-status').textContent = '\u2705 On Tab';
            document.getElementById('active-app-status').className = 'app-monitor-status on-task';
        }

        // Start webcam
        if (webcamEnabled) {
            webcam.start().then(success => {
                if (success) {
                    dashboard.addLog(icon('eye') + ' Webcam activated \u2014 tracking eye contact', 'info');
                    ui.updateIndicator('stat-webcam-indicator', 'active');
                } else {
                    dashboard.addLog(icon('warning') + ' Webcam unavailable \u2014 using cursor/keyboard only', 'warning');
                    webcamEnabled = false;
                }
            });
        } else {
            document.getElementById('stat-webcam-value').textContent = 'Off';
        }

        // ---- Wire Callbacks ----

        // Timer tick
        session.onTick = (timeStr) => {
            timerDisplay.textContent = timeStr;
            document.title = `${timeStr} \u2014 TrackerMode`;
        };

        // Webcam attention data
        webcam.onAttentionData((data) => {
            if (!session.isRunning || session.isPaused || webcamFailed) return;
            latestWebcamData = data;

            // -- Drowsiness Handling --
            if (data.drowsiness === 'deep_sleep') {
                if (!alerts.alarmActive) {
                    alerts.triggerAlarm(`Wake Up! You've been asleep for ${data.eye_closed_seconds || 60}s!`);
                    dashboard.addLog(icon('warning') + ` Deep sleep detected (${data.eye_closed_seconds}s)`, 'danger');
                    alerts.sendPushNotification('WAKE UP!', 'You fell asleep during your focus session!');
                }
            } else if (data.drowsiness === 'microsleep') {
                alerts.drowsinessEpisodes++;
                if (alerts.drowsinessEpisodes >= 4 && !alerts.alarmActive) {
                    alerts.triggerAlarm('You keep falling asleep! Take a break.');
                    dashboard.addLog(icon('warning') + ` Repeated microsleep (episode #${alerts.drowsinessEpisodes})`, 'danger');
                } else if (alerts.drowsinessEpisodes >= 2 && Date.now() - alerts.lastDrowsinessTime > alerts.DROWSY_COOLDOWN_MS) {
                    alerts.lastDrowsinessTime = Date.now();
                    alerts.showNotification('Microsleep Detected', `You dozed off for ${data.eye_closed_seconds || 15}s. Stay awake!`, 'warning');
                    dashboard.addLog(icon('warning') + ` Microsleep #${alerts.drowsinessEpisodes} (${data.eye_closed_seconds}s)`, 'warning');
                }
            } else if (data.drowsiness === 'drowsy') {
                alerts.drowsinessEpisodes++;
                if (alerts.drowsinessEpisodes >= alerts.DROWSY_TOLERANCE && Date.now() - alerts.lastDrowsinessTime > alerts.DROWSY_COOLDOWN_MS) {
                    alerts.lastDrowsinessTime = Date.now();
                    alerts.showNotification('Feeling Drowsy?', 'Your eyes have been closing. Wake up!', 'warning');
                    dashboard.addLog(icon('warning') + ` Drowsiness episode #${alerts.drowsinessEpisodes}`, 'warning');
                }
            } else {
                if (alerts.drowsinessEpisodes > 0) alerts.drowsinessEpisodes = Math.max(0, alerts.drowsinessEpisodes - 0.05);
            }

            // -- Build scores --
            const status = tracker.getStatus();
            const scores = {
                webcam: data.smoothed_score || data.attention_score,
                cursor: status.mouseActive ? 100 : Math.max(0, 100 - (status.mouseIdleSeconds * 2)),
                keyboard: status.keyboardActive ? 100 : Math.max(0, 100 - (status.keyIdleSeconds * 2)),
                window: 100
            };
            if (isWatchingVideo) { scores.cursor = 100; scores.keyboard = 100; }

            // v2.6: Writing mode — relax webcam/gaze scoring
            if (isWritingMode) {
                // When writing, eyes look down (at keyboard/paper), gaze is off-screen
                // Boost webcam score since looking down is expected
                scores.webcam = Math.max(scores.webcam, 70);
                // Keyboard should be active in writing mode
                scores.keyboard = status.keyboardActive ? 100 : Math.max(50, scores.keyboard);
                // Mouse can be used for scrolling
                scores.cursor = status.mouseActive ? 100 : Math.max(50, scores.cursor);
            }

            // Window/Tab score — different for global vs browser mode
            if (!tracker.useGlobal) {
                // Browser mode: use tab visibility as window metric
                const tabScore = tracker.getTabFocusScore();
                scores.window = tabScore !== null ? tabScore : 100;
            } else {
                const activeAppStatus = document.getElementById('active-app-status').textContent;
                if (activeAppStatus.includes('Distraction')) { scores.window = 0; }
            }

            session.updateFocusScore(scores);

            document.getElementById('stat-webcam-value').textContent = data.face_detected ? `${data.attention_score}%` : 'No face';
            ui.updateIndicator('stat-webcam-indicator', data.attention_score >= 60 ? 'active' : data.attention_score >= 30 ? 'warning' : 'danger');
            ui.updateFloatingBar(data, tracker.getStatus());

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
                dashboard.addLog(icon('warning') + ' Webcam lost \u2014 switched to keyboard/mouse-only mode', 'warning');
                alerts.showNotification('Webcam Disconnected', 'Scoring now uses keyboard/mouse only', 'warning');
                alerts.sendPushNotification('TrackerMode', 'Webcam disconnected \u2014 fallback mode active');
                document.getElementById('stat-webcam-value').textContent = 'Offline';
                ui.updateIndicator('stat-webcam-indicator', 'danger');
            }
        };

        // Activity tracker — Active App Monitor (global) / Tab Focus (browser)
        tracker.onActivityChange((status) => {
            if (!session.isRunning) return;

            if (status.mouseActive || status.keyboardActive) {
                if (isWatchingVideo) {
                    isWatchingVideo = false;
                    alerts.showNotification('Video Mode Ended', 'Activity detected. Normal tracking resumed.', 'info');
                    dashboard.addLog(icon('avg') + ' Video mode ended (activity detected)', 'info');
                }
                // Note: writing mode is NOT auto-cancelled by activity, since writing IS activity
            }

            // --- Browser mode: Tab Focus tracking ---
            if (!tracker.useGlobal) {
                const statusEl = document.getElementById('active-app-status');
                const bgEl = document.getElementById('app-monitor-bg');
                const titleEl = document.getElementById('active-window-title');

                if (status.isOnTab) {
                    statusEl.textContent = '\u2705 On Tab';
                    statusEl.className = 'app-monitor-status on-task';
                    if (bgEl) bgEl.className = 'app-monitor-bg on-task';
                    titleEl.textContent = `Tab switches: ${status.tabSwitchCount} | Away: ${status.totalAwaySeconds}s total`;
                } else if (status.tabVisible && !status.windowFocused) {
                    statusEl.textContent = '\u26a0\ufe0f Window Blurred';
                    statusEl.className = 'app-monitor-status distraction';
                    if (bgEl) bgEl.className = 'app-monitor-bg distraction';
                    titleEl.textContent = 'Browser window lost focus';
                    dashboard.addLog(icon('warning') + ' Browser window lost focus', 'warning');
                    alerts.showNotification('Come Back!', 'You left the TrackerMode window.', 'warning');
                } else {
                    // Tab hidden — user switched to another tab
                    statusEl.textContent = '\ud83d\udeab Tab Left!';
                    statusEl.className = 'app-monitor-status distraction';
                    if (bgEl) bgEl.className = 'app-monitor-bg distraction';
                    titleEl.textContent = `Switched away! (${status.tabSwitchCount} times, ${status.totalAwaySeconds}s total)`;
                    dashboard.addLog(icon('alert') + ` Tab switch #${status.tabSwitchCount} \u2014 user left tab`, 'danger');
                    alerts.showNotification('\ud83d\udeab Focus Lost!', `You switched tabs! (${status.tabSwitchCount} times)`, 'danger');
                    alerts.sendPushNotification('Come Back!', 'You switched away from your focus session!');
                }
                return; // Skip global window logic below
            }

            // --- Global mode: Active Window Monitor ---
            const win = status.activeWindow;
            if (win && win.title !== 'Unknown') {
                const { displayApp, displayIcon } = distractions.detectApp(win.title, win);

                document.getElementById('active-app-name').textContent = displayApp;
                document.getElementById('active-window-title').textContent = win.title;
                document.getElementById('active-window-title').title = win.title;
                document.getElementById('app-monitor-icon').textContent = displayIcon;

                const statusEl = document.getElementById('active-app-status');
                const bgEl = document.getElementById('app-monitor-bg');

                // v2.6: Use frontend distraction check (supports both general & strict mode)
                const isDistracted = distractions.isDistraction(win);

                if (isDistracted) {
                    statusEl.textContent = '\u26a0\ufe0f Distraction';
                    statusEl.className = 'app-monitor-status distraction';
                    if (bgEl) bgEl.className = 'app-monitor-bg distraction';

                    const appKey = (win.matched_keyword || displayApp).toLowerCase();
                    const action = alerts.playDistractionSound(appKey);

                    if (action === 'soft') {
                        alerts.showNotification('Distraction Warning', `${displayApp} detected \u2014 close it and stay focused!`, 'warning');
                        dashboard.addLog(icon('warning') + ` Distraction detected: ${displayApp}`, 'warning');
                        alerts.sendPushNotification('Distraction Detected', `You opened ${displayApp}. Please return to work!`);
                    } else if (action === 'escalate') {
                        distractions.lastDistractionApp = displayApp;
                        document.getElementById('distraction-app-name').textContent = `${displayApp} Detected`;
                        distractionPrompt.classList.remove('hidden');
                        alerts.showNotification('\u26a0\ufe0f You broke your promise!', `${displayApp} is still open! You promised to stay disciplined.`, 'danger');
                        dashboard.addLog(icon('alert') + ` ALERT: ${displayApp} still open \u2014 ignored warnings!`, 'danger');
                        alerts.sendPushNotification('Focus Broken!', `${displayApp} is still open after multiple warnings!`);
                    }
                } else {
                    statusEl.textContent = '\u2705 On Task';
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
            ui.updateScoreDisplay(currentScore);

            if (currentScore >= 60) alerts.consecutiveLowCount = 0;

            const status = tracker.getStatus();
            if (cursorEnabled) {
                document.getElementById('stat-cursor-value').textContent = status.mouseActive ? 'Active' : `Idle ${status.mouseIdleSeconds}s`;
                ui.updateIndicator('stat-cursor-indicator', status.mouseActive ? 'active' : 'danger');
            }
            if (keyboardEnabled) {
                document.getElementById('stat-keyboard-value').textContent = status.keyboardActive ? 'Active' : `Idle ${status.keyIdleSeconds}s`;
                ui.updateIndicator('stat-keyboard-indicator', status.keyboardActive ? 'active' : 'warning');
            }
            document.getElementById('stat-avg-value').textContent = `${avgScore ?? 0}%`;

            if (!webcamEnabled) {
                const scores = {
                    webcam: null,
                    cursor: status.mouseActive ? 100 : Math.max(0, 100 - (status.mouseIdleSeconds * 2)),
                    keyboard: status.keyboardActive ? 100 : Math.max(0, 100 - (status.keyIdleSeconds * 2)),
                    window: 100
                };
                if (isWatchingVideo) { scores.cursor = 100; scores.keyboard = 100; }

                // v2.6: Writing mode relaxation (no webcam)
                if (isWritingMode) {
                    scores.keyboard = status.keyboardActive ? 100 : Math.max(50, scores.keyboard);
                    scores.cursor = status.mouseActive ? 100 : Math.max(50, scores.cursor);
                }

                // Window/Tab score
                if (!tracker.useGlobal) {
                    const tabScore = tracker.getTabFocusScore();
                    scores.window = tabScore !== null ? tabScore : 100;
                } else {
                    const activeAppStatus = document.getElementById('active-app-status').textContent;
                    if (activeAppStatus.includes('Distraction')) { scores.window = 0; }
                }
                session.updateFocusScore(scores);
                ui.updateFloatingBar(null, status);
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

            // Check if video prompt should show instead
            const status = tracker.getStatus();
            if (!isWatchingVideo && latestWebcamData && latestWebcamData.looking_at_screen && (status.mouseIdleSeconds > 30 || status.keyIdleSeconds > 30)) {
                if (videoPrompt.classList.contains('hidden')) {
                    videoPrompt.classList.remove('hidden');
                    dashboard.addLog(icon('screen') + ' Showing Video prompt due to inactivity', 'info');
                }
                return;
            }

            // Smart cooldown
            if (now - alerts.lastAlertTime < alerts.ALERT_COOLDOWN_MS) {
                alerts.consecutiveLowCount++;
                return;
            }
            alerts.lastAlertTime = now;

            const roast = alerts.getRandomRoast();
            let severity = 'warning';
            if (alerts.consecutiveLowCount >= 4) severity = 'danger';

            alerts.showPipAlert('Focus Dropping!', roast, score, severity);
            alerts.showNotification('Focus Dropping!', roast, severity);
            pip.showAlert('Focus Drop!', roast, severity);
            dashboard.addLog(icon('warning') + ` Focus alert \u2014 score: ${score}%`, severity);
            alerts.sendPushNotification('Focus Dropping!', roast);

            alerts.consecutiveLowCount++;
            if (alerts.consecutiveLowCount >= 3 && !alerts.alarmActive) {
                alerts.triggerAlarm(roast);
                dashboard.addLog(icon('alert') + ' ALARM \u2014 user seems away!', 'danger');
                alerts.sendPushNotification('ALARM', "You've been unfocused for too long! Come back!");
            }
        };

        // Quiz
        session.onQuiz = () => {
            quiz.show();
            dashboard.addLog(icon('alert') + ' Focus check quiz triggered!', 'danger');
        };

        quiz.onComplete = (correct) => {
            if (correct) {
                alerts.showNotification('Correct!', 'Great, now get back to work!', 'success');
                dashboard.addLog(icon('check') + ' Quiz answered correctly', 'success');
            } else {
                alerts.showNotification('Wrong Answer', 'Focus harder next time!', 'danger');
                dashboard.addLog(icon('warning') + ' Quiz answered incorrectly', 'danger');
            }
        };

        // Session end
        session.onSessionEnd = (summary) => showSummary(summary);

        // Pomodoro: cycle complete -> break time
        session.onCycleEnd = (cycleNum, breakSecs) => {
            dashboard.addLog(icon('check') + ` Cycle ${cycleNum} complete! Break time.`, 'success');
            alerts.sendPushNotification('Cycle Complete!', `Cycle ${cycleNum} done. Take a ${Math.floor(breakSecs / 60)}-minute break!`);
            breaks.show(breakSecs, 'cycle', session);
        };

        // Pomodoro: violation break suggestion
        session.onViolationBreak = () => {
            session.pause();
            document.getElementById('break-suggest').classList.remove('hidden');
            dashboard.addLog(icon('pause') + ' Break suggestion shown', 'warning');
            alerts.sendPushNotification("Take a Break?", "You've lost focus multiple times. Maybe take a short break?");
        };

        // v2.6: Start 5-minute activity prompt (writing vs watching)
        if (activityPromptInterval) clearInterval(activityPromptInterval);
        activityPromptInterval = setInterval(() => {
            if (!session.isRunning || session.isPaused) return;
            // Only show if no distraction detected and user is on task
            const appStatus = document.getElementById('active-app-status');
            if (appStatus && appStatus.textContent.includes('Distraction')) return;
            // Only show if not already in a special mode
            if (!isWatchingVideo && !isWritingMode) {
                // Check if user seems to be working (some activity detected)
                const st = tracker.getStatus();
                if (st.mouseActive || st.keyboardActive) {
                    activityPrompt.classList.remove('hidden');
                    dashboard.addLog(icon('avg') + ' Activity check: writing or watching?', 'info');
                }
            }
        }, 5 * 60 * 1000); // every 5 minutes
    }

    // ============================================================
    //  Pause / End / Summary
    // ============================================================

    function togglePause() {
        const paused = session.togglePause();
        tracker.paused = paused;
        const svgIcon = btnPause.querySelector('svg');
        if (paused) {
            svgIcon.innerHTML = '<polygon points="5,3 19,12 5,21" fill="currentColor"/>';
            dashboard.addLog(icon('pause') + ' Session paused', 'info');
            alerts.showNotification('Paused', 'Click play to resume.', 'warning');
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
        alerts.dismissAlarm();
        if (activityPromptInterval) { clearInterval(activityPromptInterval); activityPromptInterval = null; }
        document.title = 'TrackerMode \u2014 Focus Tracker';
        pipAlert.classList.add('hidden');
        alerts.consecutiveLowCount = 0;

        document.getElementById('summary-duration').textContent = summary.durationFormatted;
        const avgFocus = summary.avgFocus ?? 0;
        document.getElementById('summary-focus').textContent = `${avgFocus}%`;
        document.getElementById('summary-alerts').textContent = summary.notifications;
        document.getElementById('summary-quizzes').textContent = summary.quizzes;

        const taskNameEl = document.getElementById('summary-task-name');
        if (taskNameEl) taskNameEl.textContent = summary.taskName || 'Focus Session';

        // Populate Score Ring
        const ringFill = document.getElementById('summary-ring-fill');
        const summaryScoreNum = document.getElementById('summary-score-number');
        if (ringFill && summaryScoreNum) {
            summaryScoreNum.textContent = `${avgFocus}%`;
            const circumference = 2 * Math.PI * 52;
            const offset = circumference - (avgFocus / 100) * circumference;
            ringFill.style.strokeDasharray = `${circumference} ${circumference}`;
            ringFill.style.strokeDashoffset = circumference;
            setTimeout(() => { ringFill.style.strokeDashoffset = offset; }, 100);

            if (avgFocus >= 70) ringFill.style.stroke = 'var(--success-color)';
            else if (avgFocus >= 40) ringFill.style.stroke = 'var(--warning-color)';
            else ringFill.style.stroke = 'var(--danger-color)';
        }

        // Populate Metrics Table
        const tableBody = document.getElementById('metrics-table-body');
        const totalScoreEl = document.getElementById('metrics-total-score');
        if (tableBody && summary.metrics) {
            tableBody.innerHTML = '';
            const rows = [
                { name: 'Eye Contact', source: 'Webcam', data: summary.metrics.webcam },
                { name: 'Mouse Activity', source: 'Cursor', data: summary.metrics.cursor },
                { name: 'Keyboard Activity', source: 'Keyboard', data: summary.metrics.keyboard },
                { name: 'Active Window', source: 'OS Monitor', data: summary.metrics.window }
            ];
            let rowHtml = '';
            rows.forEach(r => {
                if (r.data.active) {
                    const weightPct = Math.round(r.data.weight * 100);
                    const scoreDisplay = r.data.score !== null ? `${r.data.score}%` : 'N/A';
                    rowHtml += `
                        <tr>
                            <td><strong>${r.name}</strong></td>
                            <td style="color: var(--text-muted); font-size: 0.85rem;">${r.source}</td>
                            <td>${weightPct}%</td>
                            <td style="color: ${r.data.score >= 70 ? 'var(--success-color)' : r.data.score >= 40 ? 'var(--warning-color)' : 'var(--danger-color)'}; font-weight: 700;">
                                ${scoreDisplay}
                            </td>
                        </tr>
                    `;
                } else {
                    rowHtml += `
                        <tr>
                            <td><strong>${r.name}</strong></td>
                            <td style="color: var(--text-muted); font-size: 0.85rem;">${r.source}</td>
                            <td style="color: var(--text-muted);">Off</td>
                            <td style="color: var(--text-muted);">\u2014</td>
                        </tr>
                    `;
                }
            });
            tableBody.innerHTML = rowHtml;
            if (totalScoreEl) totalScoreEl.innerHTML = `<strong>${avgFocus}%</strong>`;
        }

        lastSummary = summary;

        // Fetch final window time data
        try {
            const wtResp = await fetch('/api/window-time');
            if (wtResp.ok) summary.windowTimeData = await wtResp.json();
        } catch (e) { /* ignore */ }

        const appTimeBody = document.getElementById('app-time-body');
        if (appTimeBody && summary.windowTimeData && summary.windowTimeData.length > 0) {
            let appHtml = '';
            const topApps = summary.windowTimeData.slice(0, 10);
            topApps.forEach((item, idx) => {
                const barColor = idx === 0 ? 'var(--accent-primary)' : idx < 3 ? 'var(--accent-secondary)' : 'var(--text-muted)';
                appHtml += `
                    <tr>
                        <td><strong>${item.app}</strong></td>
                        <td>${item.duration}</td>
                        <td>
                            <div class="app-time-bar-bg">
                                <div class="app-time-bar-fill" style="width: ${item.percentage}%; background: ${barColor};"></div>
                            </div>
                        </td>
                        <td style="font-weight: 600;">${item.percentage}%</td>
                    </tr>
                `;
            });
            appTimeBody.innerHTML = appHtml;
            document.getElementById('app-time-section').style.display = 'block';
        } else if (document.getElementById('app-time-section')) {
            document.getElementById('app-time-section').style.display = 'none';
        }

        // Reset AI section
        document.getElementById('ai-idle').style.display = 'block';
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-result').style.display = 'none';

        ui.switchScreen(summaryScreen);

        // Push notification for session complete
        alerts.sendPushNotification('Session Complete!', `${summary.cyclesCompleted} cycles done. Average focus: ${summary.avgFocus}%.`);

        // ---- Persist session to SQLite ----
        try {
            await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(summary)
            });
        } catch (e) {
            console.warn('Session save failed:', e);
        }
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
                body: JSON.stringify({ ...lastSummary, focusSample, windowTimeData: lastSummary.windowTimeData || [] })
            });

            if (response.status === 429) {
                aiLoading.style.display = 'none';
                aiResult.style.display = 'block';
                aiResult.innerHTML = '<p>\u26a0\ufe0f Rate limit reached. Please wait a minute before trying again.</p>';
                btn.disabled = false;
                return;
            }

            const data = await response.json();
            aiLoading.style.display = 'none';
            aiResult.style.display = 'block';

            // Sanitize AI output before rendering as HTML
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
            aiResult.innerHTML = `<p>\u26a0\ufe0f Could not connect to AI. Check server & .env.</p>`;
        }
        btn.disabled = false;
    }

    // ============================================================
    //  Break completion handler
    // ============================================================

    function onBreakComplete(breakType) {
        alerts.sendPushNotification('Break Over!', 'Ready for the next focus session?');

        if (breakType === 'violation') {
            session.resumeFromBreak();
            dashboard.addLog(icon('play') + ' Session resumed after break', 'success');
            alerts.showNotification("Let's go!", 'Session resumed. Stay focused!', 'success');
        } else if (breakType === 'cycle') {
            session.startNextCycle();
            document.getElementById('cycle-badge').textContent = `Cycle ${session.currentCycle}/${session.maxCycles}`;
            dashboard.addLog(icon('play') + ` Cycle ${session.currentCycle} started`, 'success');
            alerts.showNotification('New Cycle!', `Cycle ${session.currentCycle} \u2014 Let's focus!`, 'success');
        }
    }

})();
