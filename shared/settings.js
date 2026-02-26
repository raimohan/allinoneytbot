/**
 * ========================================================
 *  USER SETTINGS STORE
 *  In-memory store with optional JSON persistence
 *  Shared across all bot platforms
 * ========================================================
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'user_settings.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Default settings for a new user
const DEFAULT_SETTINGS = {
    quality: '1080p',        // default video quality
    autoDelete: false,        // auto-delete messages after sending file
    history: true,            // store download history
    platform: 'unknown',
    createdAt: null,
};

// In-memory cache
let settingsCache = {};

// Load from disk
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            settingsCache = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Settings] Load error:', e.message);
        settingsCache = {};
    }
}

// Save to disk (debounced)
let saveTimer = null;
function saveSettings() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
        } catch (e) {
            console.error('[Settings] Save error:', e.message);
        }
    }, 1000);
}

// Get user settings
function getUserSettings(userId, platform = 'unknown') {
    const key = `${platform}_${userId}`;
    if (!settingsCache[key]) {
        settingsCache[key] = {
            ...DEFAULT_SETTINGS,
            platform,
            createdAt: new Date().toISOString(),
        };
    }
    return settingsCache[key];
}

// Update user settings
function updateUserSettings(userId, platform, updates) {
    const key = `${platform}_${userId}`;
    settingsCache[key] = {
        ...getUserSettings(userId, platform),
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    saveSettings();
    return settingsCache[key];
}

// Get a single setting value
function getSetting(userId, platform, key) {
    return getUserSettings(userId, platform)[key];
}

// ── Download History ─────────────────────────────────────────
const HISTORY_FILE = path.join(__dirname, '..', 'data', 'download_history.json');
let historyCache = {};

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            historyCache = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }
    } catch (e) {
        historyCache = {};
    }
}

function addToHistory(userId, platform, entry) {
    const settings = getUserSettings(userId, platform);
    if (!settings.history) return;

    const key = `${platform}_${userId}`;
    if (!historyCache[key]) historyCache[key] = [];
    historyCache[key].unshift({
        ...entry,
        timestamp: new Date().toISOString(),
    });
    // Keep last 20 entries
    historyCache[key] = historyCache[key].slice(0, 20);

    let saveHTimer = null;
    if (saveHTimer) clearTimeout(saveHTimer);
    saveHTimer = setTimeout(() => {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2));
        } catch (e) { }
    }, 1000);
}

function getHistory(userId, platform) {
    const key = `${platform}_${userId}`;
    return historyCache[key] || [];
}

function clearHistory(userId, platform) {
    const key = `${platform}_${userId}`;
    historyCache[key] = [];
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2));
    } catch (e) { }
}

// Initialize
loadSettings();
loadHistory();

module.exports = {
    getUserSettings,
    updateUserSettings,
    getSetting,
    addToHistory,
    getHistory,
    clearHistory,
    DEFAULT_SETTINGS,
};
