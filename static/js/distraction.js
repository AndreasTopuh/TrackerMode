/**
 * TrackerMode v2.6 — Distraction Handler
 * Extracted from main.js: app detection, distraction icons, whitelist management.
 * v2.6: Added General Mode (block listed apps) & Strict Mode (only allow listed apps).
 * Auto-detection aliases for smart app name matching.
 */

// Auto-detection aliases: maps user-friendly names → actual window title keywords
const APP_ALIASES = {
    'microsoft word':       ['word', 'winword'],
    'ms word':              ['word', 'winword'],
    'microsoft excel':      ['excel'],
    'ms excel':             ['excel'],
    'microsoft powerpoint': ['powerpoint', 'pptx'],
    'ms powerpoint':        ['powerpoint'],
    'microsoft teams':      ['teams'],
    'ms teams':             ['teams'],
    'microsoft edge':       ['edge', 'msedge'],
    'ms edge':              ['edge', 'msedge'],
    'microsoft onenote':    ['onenote'],
    'ms onenote':           ['onenote'],
    'microsoft outlook':    ['outlook'],
    'ms outlook':           ['outlook'],
    'microsoft access':     ['access'],
    'ms access':            ['access'],
    'google chrome':        ['chrome'],
    'mozilla firefox':      ['firefox'],
    'visual studio code':   ['visual studio code', 'code'],
    'vs code':              ['visual studio code', 'code'],
    'vscode':               ['visual studio code', 'code'],
    'visual studio':        ['visual studio'],
    'adobe photoshop':      ['photoshop'],
    'adobe illustrator':    ['illustrator'],
    'adobe premiere':       ['premiere'],
    'adobe after effects':  ['after effects'],
    'sublime text':         ['sublime'],
    'intellij idea':        ['intellij'],
    'android studio':       ['android studio'],
    'obs studio':           ['obs'],
    'libre office':         ['libreoffice', 'libre'],
    'file explorer':        ['explorer'],
    'command prompt':       ['cmd.exe', 'command prompt'],
    'windows terminal':     ['terminal', 'windowsterminal'],
    'task manager':         ['task manager', 'taskmgr'],
    'microsoft paint':      ['paint', 'mspaint'],
    'google docs':          ['docs.google'],
    'google sheets':        ['sheets.google'],
    'google slides':        ['slides.google'],
};

/** Expand user keywords using APP_ALIASES for smarter matching. */
function expandKeywords(keywords) {
    const expanded = new Set();
    for (const kw of keywords) {
        const lower = kw.toLowerCase().trim();
        if (!lower) continue;
        expanded.add(lower);
        if (APP_ALIASES[lower]) {
            for (const alias of APP_ALIASES[lower]) {
                expanded.add(alias);
            }
        }
    }
    return Array.from(expanded);
}

class DistractionHandler {
    constructor() {
        this.whitelistedApps = new Set();
        this.lastDistractionApp = '';

        // Mode: 'general' = block listed apps, 'strict' = only allow listed apps
        this.mode = 'general';
        this.appList = []; // user-input app keywords (distractions in general, allowed in strict)

        // Friendly app icon mapping (window-title keyword → display name + emoji)
        this.APP_MAP = {
            youtube:     { name: 'YouTube',   icon: '▶️' },
            whatsapp:    { name: 'WhatsApp',  icon: '💬' },
            'visual studio code': { name: 'VS Code', icon: '💻' },
            vscode:      { name: 'VS Code',   icon: '💻' },
            cursor:      { name: 'Cursor',    icon: '💻' },
            discord:     { name: 'Discord',   icon: '🎮' },
            netflix:     { name: 'Netflix',   icon: '🍿' },
            instagram:   { name: 'Instagram', icon: '📸' },
            tiktok:      { name: 'TikTok',    icon: '🎵' },
            spotify:     { name: 'Spotify',   icon: '🎧' },
            github:      { name: 'GitHub',    icon: '🐙' },
            chatgpt:     { name: 'ChatGPT',   icon: '🤖' },
            openai:      { name: 'ChatGPT',   icon: '🤖' },
            chrome:      { name: 'Browser',   icon: '🌐' },
            edge:        { name: 'Browser',   icon: '🌐' },
            brave:       { name: 'Browser',   icon: '🌐' },
            firefox:     { name: 'Browser',   icon: '🌐' },
        };
    }

    /**
     * Set distraction mode and app list.
     * @param {'general'|'strict'} mode
     * @param {string[]} apps - keywords list
     */
    setMode(mode, apps) {
        this.mode = mode;
        this.appList = expandKeywords(apps);
    }

    /**
     * Detect a friendly app name + icon from window title.
     * @param {string} title - raw window title
     * @param {Object} win - { app, title, is_distraction, matched_keyword }
     * @returns {{ displayApp: string, displayIcon: string }}
     */
    detectApp(title, win) {
        const lower = title.toLowerCase();
        for (const [keyword, info] of Object.entries(this.APP_MAP)) {
            if (lower.includes(keyword)) {
                return { displayApp: info.name, displayIcon: info.icon };
            }
        }
        // Fallback: use backend's matched_keyword or raw app name
        if (win.matched_keyword) {
            return {
                displayApp: win.matched_keyword.charAt(0).toUpperCase() + win.matched_keyword.slice(1),
                displayIcon: '📱'
            };
        }
        return { displayApp: win.app || win.title, displayIcon: '🖥️' };
    }

    /**
     * Check if an app/window is a distraction based on current mode.
     * In General Mode: distraction if keyword matches distraction list
     * In Strict Mode: distraction if keyword does NOT match allowed list
     * @param {Object} win - { app, title, is_distraction, matched_keyword }
     * @returns {boolean}
     */
    isDistraction(win) {
        const titleLower = (win.title || '').toLowerCase();
        const appLower = (win.app || '').toLowerCase();

        // Always allow TrackerMode itself
        if (titleLower.includes('trackermode') || appLower.includes('trackermode')) {
            return false;
        }

        // Check session whitelist first
        if (win.matched_keyword && this.isWhitelisted(win.matched_keyword)) {
            return false;
        }

        if (this.mode === 'strict') {
            // Strict Mode: only allowed apps are safe, everything else is distraction
            if (this.appList.length === 0) return false; // no list = allow all
            const isAllowed = this.appList.some(keyword => 
                titleLower.includes(keyword) || appLower.includes(keyword)
            );
            return !isAllowed;
        } else {
            // General Mode: use backend's is_distraction flag (current behavior)
            return win.is_distraction && !this.isWhitelisted(win.matched_keyword);
        }
    }

    /** Check if keyword is whitelisted for this session. */
    isWhitelisted(keyword) {
        return this.whitelistedApps.has((keyword || '').toLowerCase());
    }

    /** Whitelist an app for the current session. */
    whitelist(app) {
        this.whitelistedApps.add(app.toLowerCase());
    }

    /** Reset state for a new session. */
    reset() {
        this.whitelistedApps = new Set();
        this.lastDistractionApp = '';
    }
}

// Export as global
window.DistractionHandler = DistractionHandler;
