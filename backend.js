const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron'); // npm install node-cron
const cors = require('cors');

// Load environment variables
require('dotenv').config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// --- OPENROUTER API KEY MANAGER (Multi-Key Support with Auto-Failover) ---
class OpenRouterKeyManager {
    constructor() {
        this.keys = [];
        this.currentKeyIndex = 0;
        this.keyStatus = new Map(); // Track key status: { lastError: Date, failCount: number, isBlacklisted: boolean }

        // Load up to 5 API keys from environment
        for (let i = 1; i <= 5; i++) {
            const key = process.env[`OPENROUTER_API_KEY_${i}`] || (i === 1 ? process.env.OPENROUTER_API_KEY : null);
            if (key && key.trim()) {
                this.keys.push(key.trim());
                this.keyStatus.set(i - 1, { lastError: null, failCount: 0, isBlacklisted: false });
            }
        }

        if (this.keys.length === 0) {
            console.warn('⚠️ No OpenRouter API keys found! AI features will be disabled.');
            console.warn('💡 Set OPENROUTER_API_KEY_1 through OPENROUTER_API_KEY_5 in your .env file');
        } else {
            console.log(`✅ Loaded ${this.keys.length} OpenRouter API key(s)`);
        }
    }

    // Get the current active API key
    getCurrentKey() {
        if (this.keys.length === 0) return null;

        // Find first non-blacklisted key
        for (let i = 0; i < this.keys.length; i++) {
            const index = (this.currentKeyIndex + i) % this.keys.length;
            const status = this.keyStatus.get(index);

            if (!status.isBlacklisted) {
                this.currentKeyIndex = index;
                return this.keys[index];
            }
        }

        // All keys blacklisted - reset blacklist and try again
        console.warn('⚠️ All API keys blacklisted. Resetting blacklist...');
        this.keyStatus.forEach((status) => {
            status.isBlacklisted = false;
            status.failCount = 0;
        });

        return this.keys[0];
    }

    // Mark current key as failed and switch to next
    markCurrentKeyAsFailed(error) {
        if (this.keys.length === 0) return;

        const status = this.keyStatus.get(this.currentKeyIndex);
        status.lastError = new Date();
        status.failCount++;

        const keyPreview = this.keys[this.currentKeyIndex].substring(0, 10) + '...';
        console.error(`❌ API Key ${this.currentKeyIndex + 1} failed (${keyPreview}): ${error}`);
        console.error(`   Fail count: ${status.failCount}`);

        // Blacklist after 3 consecutive failures
        if (status.failCount >= 3) {
            status.isBlacklisted = true;
            console.error(`🚫 API Key ${this.currentKeyIndex + 1} blacklisted after ${status.failCount} failures`);
        }

        // Switch to next key
        this.switchToNextKey();
    }

    // Switch to the next available key
    switchToNextKey() {
        if (this.keys.length <= 1) return;

        const oldIndex = this.currentKeyIndex;

        // Find next non-blacklisted key
        for (let i = 1; i <= this.keys.length; i++) {
            const nextIndex = (this.currentKeyIndex + i) % this.keys.length;
            const status = this.keyStatus.get(nextIndex);

            if (!status.isBlacklisted) {
                this.currentKeyIndex = nextIndex;
                console.log(`🔄 Switched from API Key ${oldIndex + 1} to API Key ${this.currentKeyIndex + 1}`);
                return;
            }
        }

        console.warn('⚠️ No available API keys to switch to!');
    }

    // Mark current key as successful (reset fail count)
    markCurrentKeyAsSuccess() {
        if (this.keys.length === 0) return;

        const status = this.keyStatus.get(this.currentKeyIndex);
        if (status.failCount > 0) {
            console.log(`✅ API Key ${this.currentKeyIndex + 1} recovered`);
            status.failCount = 0;
            status.isBlacklisted = false;
        }
    }

    // Check if any key is available
    hasAvailableKey() {
        return this.keys.length > 0;
    }

    // Get status summary for logging
    getStatusSummary() {
        if (this.keys.length === 0) return 'No API keys configured';

        const summary = [];
        this.keyStatus.forEach((status, index) => {
            const keyPreview = this.keys[index].substring(0, 10) + '...';
            const state = status.isBlacklisted ? '🚫 BLACKLISTED' :
                status.failCount > 0 ? `⚠️ ${status.failCount} fails` : '✅ OK';
            summary.push(`Key ${index + 1} (${keyPreview}): ${state}`);
        });

        return summary.join('\n');
    }
}

// Initialize the key manager
const apiKeyManager = new OpenRouterKeyManager();

// Backwards compatibility: Keep this for simple checks
const OPENROUTER_API_KEY = apiKeyManager.hasAvailableKey() ? apiKeyManager.getCurrentKey() : null;

// --- HELPER: Make OpenRouter API Call with Auto-Failover ---
async function callOpenRouterAPI(endpoint, requestBody, options = {}) {
    const maxRetries = Math.min(apiKeyManager.keys.length, 3); // Try up to 3 keys or all available keys
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = apiKeyManager.getCurrentKey();

        if (!apiKey) {
            throw new Error('No OpenRouter API keys available');
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': options.referer || 'https://raix.app',
                    'X-Title': options.title || 'RaiX App',
                    ...options.headers
                },
                body: JSON.stringify(requestBody)
            });

            // Check for auth errors (401, 403) which indicate expired/invalid key
            if (response.status === 401 || response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error?.message || `HTTP ${response.status}`;

                console.error(`🔑 API Key authentication failed: ${errorMsg}`);
                apiKeyManager.markCurrentKeyAsFailed(errorMsg);
                lastError = new Error(errorMsg);
                continue; // Try next key
            }

            // Check for other errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
                throw new Error(errorMsg);
            }

            // Success! Mark key as working
            apiKeyManager.markCurrentKeyAsSuccess();
            return await response.json();

        } catch (error) {
            console.error(`API call attempt ${attempt + 1} failed:`, error.message);
            lastError = error;

            // Only switch keys on network/auth errors, not on other errors
            if (error.message.includes('401') || error.message.includes('403') ||
                error.message.includes('invalid') || error.message.includes('expired')) {
                apiKeyManager.markCurrentKeyAsFailed(error.message);
            } else {
                // For other errors, don't switch keys - it's likely not a key issue
                throw error;
            }
        }
    }

    // All retries failed
    throw lastError || new Error('All API keys failed');
}


// --- CONFIGURATION ---
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const COOKIES_DIR = __dirname;

// Cookie files for different platforms
const PLATFORM_COOKIES = {
    youtube: path.join(COOKIES_DIR, 'youtube.txt'),
    instagram: path.join(COOKIES_DIR, 'instagram.txt'),
    twitter: path.join(COOKIES_DIR, 'youtube.txt'), // Uses youtube.txt as it has twitter cookies
    x: path.join(COOKIES_DIR, 'youtube.txt'),
    pinterest: path.join(COOKIES_DIR, 'youtube.txt'),
    snapchat: path.join(COOKIES_DIR, 'youtube.txt'),
    tiktok: path.join(COOKIES_DIR, 'youtube.txt'),
    facebook: path.join(COOKIES_DIR, 'youtube.txt'),
    vimeo: path.join(COOKIES_DIR, 'youtube.txt')
};

// Supported platforms detection patterns
const PLATFORM_PATTERNS = {
    youtube: ['youtube.com', 'youtu.be'],
    instagram: ['instagram.com'],
    twitter: ['twitter.com', 'x.com'],
    x: ['x.com'],
    snapchat: ['snapchat.com'],
    pinterest: ['pinterest.com'],
    tiktok: ['tiktok.com'],
    facebook: ['facebook.com', 'fb.watch'],
    vimeo: ['vimeo.com']
};

// --- BINARY DETECTION ---
const POSSIBLE_BINARIES = [
    '/home/raimohan/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/snap/bin/yt-dlp',
    'yt-dlp'
];

let YT_DLP_BINARY = 'yt-dlp';

for (const binPath of POSSIBLE_BINARIES) {
    if (binPath === 'yt-dlp') continue;
    if (fs.existsSync(binPath)) {
        console.log(`✅ Found yt-dlp binary at: ${binPath}`);
        YT_DLP_BINARY = binPath;
        break;
    }
}

// Ensure download folder exists
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

app.use(express.json());



// --- HELPER: Detect Platform from URL ---
function detectPlatform(url) {
    const urlLower = url.toLowerCase();

    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
        if (patterns.some(pattern => urlLower.includes(pattern))) {
            return platform;
        }
    }

    return 'generic'; // Default fallback
}

// --- HELPER: Get Cookie File for Platform ---
function getCookieFile(url) {
    const platform = detectPlatform(url);
    const cookieFile = PLATFORM_COOKIES[platform] || PLATFORM_COOKIES.youtube;

    if (fs.existsSync(cookieFile)) {
        console.log(`🍪 Using cookies from: ${cookieFile} for platform: ${platform}`);
        return cookieFile;
    }

    console.log(`⚠️ No cookies found for ${platform}, proceeding without cookies`);
    return null;
}

// --- HELPER: Get Common yt-dlp Arguments ---
function getCommonArgs(url) {
    const platform = detectPlatform(url);

    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--no-playlist',
        // CRITICAL: Browser Impersonation to avoid throttling and 403 errors (Twitter, YouTube, etc.)
        '--impersonate', 'chrome'
    ];

    // Platform-specific referer
    if (platform === 'twitter' || platform === 'x') {
        args.push('--referer', 'https://twitter.com/');
    } else {
        args.push('--referer', 'https://www.youtube.com/');
    }

    // Add platform-specific cookie file
    const cookieFile = getCookieFile(url);
    if (cookieFile) {
        args.push('--cookies', cookieFile);
    }

    // Add safe features for YouTube (metadata & chapters only)
    // NOTE: Do NOT add --embed-thumbnail, --embed-subs, --write-subs, or --sponsorblock-remove
    // These cause downloaded MP4 files to be incompatible with editing apps like
    // CapCut, Premiere Pro, DaVinci Resolve, etc. because they:
    // - embed-thumbnail: adds extra non-video stream that confuses editors
    // - embed-subs/write-subs: can create malformed MP4 containers
    // - sponsorblock-remove: creates timestamp discontinuities without re-encoding
    if (platform === 'youtube') {
        args.push(
            '--embed-metadata',
            '--embed-chapters'
        );
    }

    return args;
}

// --- ROUTE: MUSIC SEARCH ---
app.post('/api/music/search', (req, res) => {
    const { query } = req.body;
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Please enter a song name to search' });
    }

    console.log(`🎵 Searching music: ${query}`);

    // Use yt-dlp to search YouTube Music
    const searchQuery = `ytsearch10:${query} audio`; // Search top 10 results
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--flat-playlist',
        '--impersonate', 'chrome',
        '-J',
        searchQuery
    ];

    const child = spawn(YT_DLP_BINARY, args);
    let jsonBuffer = '';

    child.stdout.on('data', (d) => jsonBuffer += d.toString());
    child.stderr.on('data', (d) => console.error(`[Music Search Log] ${d}`));

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Music search exited with code ${code}`);
            return res.status(500).json({ error: 'Search failed. Please try again.' });
        }

        try {
            const data = JSON.parse(jsonBuffer);

            // Process entries into clean song objects
            let results = [];

            if (data.entries && Array.isArray(data.entries)) {
                results = data.entries
                    .filter(entry => entry && entry.title)
                    .slice(0, 10) // Limit to 10 results
                    .map(entry => ({
                        id: entry.id || entry.url,
                        title: entry.title || 'Unknown Title',
                        artist: entry.channel || entry.uploader || 'Unknown Artist',
                        duration: formatDuration(entry.duration),
                        thumbnail: entry.thumbnail || `https://img.youtube.com/vi/${entry.id}/mqdefault.jpg`,
                        url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`
                    }));
            }

            console.log(`🎶 Found ${results.length} songs for "${query}"`);

            res.json({
                status: 'success',
                query: query,
                results: results
            });

        } catch (e) {
            console.error('Music search JSON Parse Error:', e);
            res.status(500).json({ error: 'Failed to parse search results' });
        }
    });
});



// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- ROUTE: MUSIC DOWNLOAD ---
app.get('/api/music/download', async (req, res) => {
    const { id, title, artist } = req.query;

    if (!id) {
        return res.status(400).send('Missing song ID');
    }

    console.log(`🎵 Downloading music: ${title} by ${artist}`);

    // Construct YouTube URL from ID
    const url = id.startsWith('http') ? id : `https://www.youtube.com/watch?v=${id}`;

    // Use timestamp-based filename
    const timestamp = Date.now();
    const filename = `music_${timestamp}.mp3`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--impersonate', 'chrome',
        '-x', // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '0', // Best quality
        '--embed-thumbnail',
        '--embed-metadata',
        '-o', filePath,
        url
    ];

    // Add cookies if available
    const cookieFile = PLATFORM_COOKIES.youtube;
    if (fs.existsSync(cookieFile)) {
        args.push('--cookies', cookieFile);
    }

    console.log(`📁 Saving music to: ${filePath}`);

    const child = spawn(YT_DLP_BINARY, args);

    child.stdout.on('data', d => console.log(`[Music DL] ${d}`));
    child.stderr.on('data', d => console.error(`[Music DL ERR] ${d}`));

    child.on('close', (code) => {
        if (code === 0 && fs.existsSync(filePath)) {
            // Create user-friendly filename
            const safeTitle = (title || 'song').replace(/[\\/:*?"<>|]/g, '_').replace(/[\r\n]/g, '').trim();
            const safeArtist = (artist || 'artist').replace(/[\\/:*?"<>|]/g, '_').replace(/[\r\n]/g, '').trim();
            const userFilename = `${safeTitle} - ${safeArtist}.mp3`;

            console.log(`✅ Music download successful: ${userFilename}`);

            res.download(filePath, userFilename, (err) => {
                if (!err) {
                    // Delete file after 5 minutes
                    setTimeout(() => {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ Cleaned up: ${filename}`);
                        }
                    }, 5 * 60 * 1000);
                } else {
                    console.error(`❌ Music download serve error: ${err.message}`);
                }
            });
        } else {
            console.error(`❌ Music download failed with code: ${code}`);
            res.status(500).send('Download failed. Please try again.');
        }
    });

    child.on('error', (err) => {
        console.error('❌ Music Spawn Error:', err);
        res.status(500).send('Failed to start download process.');
    });
});



// --- ROUTE: VIDEO INFO (Load from URL) ---
app.post('/api/video/info', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Please provide a video URL' });
    }

    console.log(`🎬 Getting video info: ${url}`);

    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--impersonate', 'chrome',
        '-J',
        url
    ];

    const cookieFile = PLATFORM_COOKIES.youtube;
    if (fs.existsSync(cookieFile)) {
        args.push('--cookies', cookieFile);
    }

    const child = spawn(YT_DLP_BINARY, args);
    let jsonBuffer = '';

    child.stdout.on('data', (d) => jsonBuffer += d.toString());
    child.stderr.on('data', (d) => console.error(`[Video Info Log] ${d}`));

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Video info extraction exited with code ${code}`);
            return res.status(500).json({ error: 'Failed to get video info. Please check the URL.' });
        }

        try {
            const data = JSON.parse(jsonBuffer);

            const videoInfo = {
                id: data.id,
                title: data.title || 'Unknown Title',
                channel: data.channel || data.uploader || 'Unknown Channel',
                duration: formatDuration(data.duration),
                views: data.view_count ? formatViews(data.view_count) : 'N/A',
                uploadDate: data.upload_date ? formatDate(data.upload_date) : 'Unknown',
                thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.id}/mqdefault.jpg`,
                description: data.description || '',
                qualities: getAvailableQualities(data.formats || [])
            };

            console.log(`✅ Got video info: ${videoInfo.title}`);

            res.json({
                status: 'success',
                video: videoInfo
            });

        } catch (e) {
            console.error('Video info JSON Parse Error:', e);
            res.status(500).json({ error: 'Failed to parse video data' });
        }
    });
});

// --- ROUTE: VIDEO PLAYLIST ---
app.post('/api/video/playlist', (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('playlist')) {
        return res.status(400).json({ error: 'Please enter a valid YouTube playlist URL' });
    }

    console.log(`🎬 Extracting playlist: ${url}`);

    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--flat-playlist',
        '--impersonate', 'chrome',
        '-J',
        url
    ];

    const cookieFile = PLATFORM_COOKIES.youtube;
    if (fs.existsSync(cookieFile)) {
        args.push('--cookies', cookieFile);
    }

    const child = spawn(YT_DLP_BINARY, args);
    let jsonBuffer = '';

    child.stdout.on('data', (d) => jsonBuffer += d.toString());
    child.stderr.on('data', (d) => console.error(`[Playlist Log] ${d}`));

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Playlist extraction exited with code ${code}`);
            return res.status(500).json({ error: 'Failed to extract playlist. Please check the URL.' });
        }

        try {
            const data = JSON.parse(jsonBuffer);

            let results = [];

            if (data.entries && Array.isArray(data.entries)) {
                results = data.entries
                    .filter(entry => entry && entry.title && entry.id)
                    .map(entry => ({
                        id: entry.id,
                        title: entry.title || 'Unknown Title',
                        channel: entry.channel || entry.uploader || 'Unknown Channel',
                        duration: formatDuration(entry.duration),
                        thumbnail: entry.thumbnail || `https://img.youtube.com/vi/${entry.id}/mqdefault.jpg`,
                        url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`
                    }));
            }

            console.log(`🎥 Found ${results.length} videos in playlist`);

            res.json({
                status: 'success',
                title: data.title || 'Playlist',
                count: results.length,
                results: results
            });

        } catch (e) {
            console.error('Playlist JSON Parse Error:', e);
            res.status(500).json({ error: 'Failed to parse playlist data' });
        }
    });
});



// Helper function to format views
function formatViews(count) {
    if (!count) return '0';
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
}

// Helper function to format date
function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return 'Unknown';
    // Format: YYYYMMDD -> DD/MM/YYYY
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}/${month}/${year}`;
}

// Helper function to get available qualities
function getAvailableQualities(formats) {
    const qualities = new Set();
    formats.forEach(f => {
        if (f.height) {
            if (f.height >= 1080) qualities.add('1080p');
            if (f.height >= 720) qualities.add('720p');
            if (f.height >= 480) qualities.add('480p');
            if (f.height >= 360) qualities.add('360p');
        }
    });
    return Array.from(qualities);
}

// --- ROUTE: ANALYZE ---
app.post('/api/analyze', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    console.log(`🔍 Analyzing: ${url}`);
    const platform = detectPlatform(url);
    console.log(`📱 Platform detected: ${platform}`);

    const args = [...getCommonArgs(url), '-J', url];
    const child = spawn(YT_DLP_BINARY, args);
    let jsonBuffer = '';

    child.stdout.on('data', (d) => jsonBuffer += d.toString());
    child.stderr.on('data', (d) => console.error(`[Analyze Log] ${d}`));

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Analysis process exited with code ${code}`);
            return res.status(500).json({ error: 'Analysis failed (Check server logs)' });
        }

        try {
            const data = JSON.parse(jsonBuffer);

            // Filter and process formats
            const MAX_SIZE = 100 * 1024 * 1024; // 100MB in bytes

            // Get all video formats with valid data
            let videoFormats = data.formats
                .filter(f =>
                    f.vcodec !== 'none' &&
                    f.ext !== 'mhtml' &&
                    f.height && // Must have height
                    (!f.filesize || f.filesize <= MAX_SIZE) // Filter by size if known
                )
                .map(f => ({
                    format_id: f.format_id,
                    height: f.height,
                    width: f.width,
                    fps: f.fps || null,
                    ext: f.ext,
                    filesize: f.filesize,
                    tbr: f.tbr || 0, // Total bitrate for quality comparison
                    vcodec: f.vcodec
                }));

            // Group by resolution and keep only the best quality for each
            const resolutionMap = new Map();

            videoFormats.forEach(f => {
                const key = f.height;
                const existing = resolutionMap.get(key);

                // Keep format with higher bitrate (better quality)
                if (!existing || f.tbr > existing.tbr) {
                    resolutionMap.set(key, f);
                }
            });

            // Convert to array and sort by resolution (HIGHEST to LOWEST)
            let uniqueFormats = Array.from(resolutionMap.values())
                .sort((a, b) => b.height - a.height) // Reversed: highest first
                .map(f => {
                    // Build resolution label
                    let resLabel = `${f.height}p`;

                    // Add FPS for higher qualities (720p and above)
                    if (f.fps && f.height >= 720) {
                        resLabel += ` ${Math.round(f.fps)}fps`;
                    }

                    return {
                        format_id: f.format_id,
                        resolution: resLabel,
                        height: f.height, // Store raw height for filter specification
                        extension: f.ext,
                        size: f.filesize ? (f.filesize / 1024 / 1024).toFixed(1) + ' MB' : '~',
                        fps: f.fps ? Math.round(f.fps) : null,
                        url: f.url // Direct URL for Twitter/client-side downloads
                    };
                });

            // Ensure we have common resolutions (144p to highest available)
            // Remove any that exceed 100MB
            uniqueFormats = uniqueFormats.filter(f => {
                if (f.size === '~') return true; // Keep if size unknown
                const sizeNum = parseFloat(f.size);
                return sizeNum <= 100;
            });

            console.log(`📊 Found ${uniqueFormats.length} unique quality options`);

            res.json({
                status: 'success',
                title: data.title,
                thumbnail: data.thumbnail,
                duration: data.duration_string || (data.duration ? new Date(data.duration * 1000).toISOString().substr(11, 8) : 'N/A'),
                source: data.extractor_key || data.extractor || platform.toUpperCase(),
                formats: uniqueFormats,
                platform: platform
            });

        } catch (e) {
            console.error('JSON Parse Error:', e);
            res.status(500).json({ error: 'Failed to parse JSON' });
        }
    });
});

// --- ROUTE: DOWNLOAD ---
// Uses timestamp-based filenames (more reliable than --print after_move)
app.get('/api/download', async (req, res) => {
    const { url, resolution, type } = req.query;
    if (!url) return res.status(400).send('Missing URL');

    const platform = detectPlatform(url);
    console.log(`🚀 Downloading from ${platform}: ${url} [Type: ${type}, Res: ${resolution}]`);

    // Fetch Title
    let videoTitle = 'video';
    try {
        const titleArgs = ['--get-title', '--no-warnings', '--impersonate', 'chrome', url];
        const cookieFile = getCookieFile(url);
        if (cookieFile) titleArgs.push('--cookies', cookieFile);

        const titleChild = spawn(YT_DLP_BINARY, titleArgs);
        let titleData = '';

        await new Promise((resolve) => {
            titleChild.stdout.on('data', d => titleData += d.toString());
            titleChild.on('close', () => resolve());
            titleChild.on('error', () => resolve());
            setTimeout(resolve, 5000);
        });

        if (titleData.trim()) videoTitle = titleData.trim();
        console.log(`📄 Title: ${videoTitle}`);
    } catch (e) {
        console.error('Title fetch error:', e);
    }

    // Use timestamp-based filename (same method as newupdate.js - more reliable!)
    const timestamp = Date.now();
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const filename = `${platform}_${timestamp}.${ext}`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    let args = getCommonArgs(url);

    // Direct output path (no templates to avoid "NA" issue)
    args.push('-o', filePath);

    if (type === 'audio') {
        args.push('-x', '--audio-format', 'mp3');
    } else {
        if (resolution && resolution !== 'best' && resolution !== 'Best Auto') {
            // Extract just the height number (e.g., "1080p 30fps" -> "1080")
            // Use ONLY digits before 'p' to avoid malformed filter specs like "height<=108030fps"
            const heightMatch = resolution.match(/^(\d+)p/);
            const height = heightMatch ? heightMatch[1] : resolution.replace(/\D/g, '');

            // Use proper format specification
            args.push('-f', `bestvideo[height<=${height}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best`, '--merge-output-format', 'mp4');
        } else {
            args.push('-f', 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
        }
    }

    args.push(url);

    console.log(`📁 Saving to: ${filePath}`);

    const child = spawn(YT_DLP_BINARY, args);

    child.stdout.on('data', d => {
        const str = d.toString();
        console.log(`[DL] ${str}`);
    });

    child.stderr.on('data', d => console.error(`[DL ERR] ${d}`));

    child.on('close', (code) => {
        if (code === 0) {
            // Check if file exists at expected path
            if (fs.existsSync(filePath)) {
                // Sanitize title for the USER download
                const safeTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/[\r\n]/g, '').trim() || `video_${timestamp}`;
                const userFilename = `${safeTitle}.${ext}`;

                console.log(`✅ Download successful. Serving as: ${userFilename}`);
                res.download(filePath, userFilename, (err) => {
                    if (!err) {
                        // Delete file after 5 minutes
                        setTimeout(() => {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                console.log(`🗑️ Cleaned up: ${filename}`);
                            }
                        }, 5 * 60 * 1000);
                    } else {
                        console.error(`❌ Download serve error: ${err.message}`);
                    }
                });
            } else {
                console.error('❌ FATAL: File not found after download:', filePath);
                res.status(500).send('File not found after download.');
            }
        } else {
            console.error(`❌ Download failed with code: ${code}`);
            res.status(500).send(`Download failed. Code: ${code}`);
        }
    });

    child.on('error', (err) => {
        console.error('❌ Spawn Error:', err);
        res.status(500).send('Failed to start download process.');
    });
});

// --- CLIP JOBS STORAGE ---
const clipJobs = new Map(); // jobId -> { status, filePath, filename, error, createdAt }

// Clean up old jobs every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [jobId, job] of clipJobs) {
        if (now - job.createdAt > 30 * 60 * 1000) { // 30 minutes
            if (job.filePath && fs.existsSync(job.filePath)) {
                try { fs.unlinkSync(job.filePath); } catch (e) { }
            }
            clipJobs.delete(jobId);
        }
    }
}, 10 * 60 * 1000);

// --- ROUTE: CLIP VIDEO ---
// For ratio conversion, returns job ID for async processing (to avoid Cloudflare timeout)
app.get('/api/clip', async (req, res) => {
    const { url, start, end, quality, ratio } = req.query;

    if (!url) return res.status(400).send('Missing URL');
    if (start === undefined || end === undefined) {
        return res.status(400).send('Missing start or end time');
    }

    const startTime = parseInt(start);
    const endTime = parseInt(end);
    const duration = endTime - startTime;

    const videoQuality = quality || '720';
    const validQualities = ['360', '480', '720', '1080'];
    const selectedQuality = validQualities.includes(videoQuality) ? videoQuality : '720';

    const aspectRatio = ratio || 'original';
    const validRatios = ['original', '9:16', '1:1'];
    const selectedRatio = validRatios.includes(aspectRatio) ? aspectRatio : 'original';
    const needsConversion = selectedRatio !== 'original';

    if (duration <= 0) return res.status(400).send('Invalid time range');
    if (duration > 60) return res.status(400).send('Maximum clip duration is 60 seconds');

    const platform = detectPlatform(url);
    console.log(`✂️ Clipping: ${url} [${startTime}s-${endTime}s] @ ${selectedQuality}p${needsConversion ? ` → ${selectedRatio}` : ''}`);

    const timestamp = Date.now();

    // For conversion jobs, skip title fetch initially to avoid timeout
    // Title will be fetched in background during processing
    let videoTitle = 'clip';
    let safeTitle = `clip_${timestamp}`;

    // Only fetch title synchronously for non-conversion (fast path)
    if (!needsConversion) {
        try {
            const titleArgs = ['--get-title', '--no-warnings', '--impersonate', 'chrome', url];
            const cookieFile = getCookieFile(url);
            if (cookieFile) titleArgs.push('--cookies', cookieFile);
            const titleChild = spawn(YT_DLP_BINARY, titleArgs);
            let titleData = '';
            await new Promise((resolve) => {
                titleChild.stdout.on('data', d => titleData += d.toString());
                titleChild.on('close', () => resolve());
                titleChild.on('error', () => resolve());
                setTimeout(resolve, 3000);
            });
            if (titleData.trim()) {
                videoTitle = titleData.trim();
                safeTitle = videoTitle.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'clip';
            }
        } catch (e) { }
    }

    // If NO conversion needed, do direct download (fast path)
    if (!needsConversion) {
        const filename = `clip_${timestamp}.mp4`;
        const filePath = path.join(DOWNLOAD_DIR, filename);
        const sectionArg = `*${startTime}-${endTime}`;
        const formatStr = `bestvideo[ext=mp4][height<=${selectedQuality}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${selectedQuality}]/best`;

        const args = [
            ...getCommonArgs(url),
            '--download-sections', sectionArg,
            '-f', formatStr,
            '--merge-output-format', 'mp4',
            '-o', filePath,
            url
        ];

        const downloadChild = spawn(YT_DLP_BINARY, args);
        let stderrLog = '';
        downloadChild.stderr.on('data', d => stderrLog += d.toString());

        downloadChild.on('close', (code) => {
            if (code !== 0) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                return res.status(500).send('Clip download failed.');
            }

            let actualPath = filePath;
            if (!fs.existsSync(filePath)) {
                const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`clip_${timestamp}`));
                if (files.length > 0) actualPath = path.join(DOWNLOAD_DIR, files[0]);
                else return res.status(500).send('Clip not found.');
            }

            const userFilename = `${safeTitle} [${startTime}s-${endTime}s].mp4`;
            res.download(actualPath, userFilename, (err) => {
                if (!err) setTimeout(() => { try { if (fs.existsSync(actualPath)) fs.unlinkSync(actualPath); } catch (e) { } }, 5 * 60 * 1000);
            });
        });

        downloadChild.on('error', () => res.status(500).send('Failed to start clip.'));
        return;
    }

    // === ASYNC PATH: Ratio conversion needed ===
    const jobId = `job_${timestamp}_${Math.random().toString(36).substr(2, 6)}`;
    const ratioSuffix = selectedRatio === '9:16' ? 'shorts' : 'square';

    clipJobs.set(jobId, {
        status: 'processing',
        filePath: null,
        filename: `${safeTitle} [${startTime}s-${endTime}s] ${ratioSuffix}.mp4`,
        error: null,
        createdAt: Date.now()
    });

    // Return job ID immediately (no timeout!)
    res.json({
        status: 'processing',
        jobId: jobId,
        message: 'Processing clip with ratio conversion. Poll /api/clip/status/' + jobId
    });

    // Process in background
    const filename = `clip_${timestamp}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);
    const sectionArg = `*${startTime}-${endTime}`;

    // Use user's selected quality (don't force 480p)
    const formatStr = `bestvideo[ext=mp4][height<=${selectedQuality}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${selectedQuality}]/best`;

    const args = [
        ...getCommonArgs(url),
        '--download-sections', sectionArg,
        '-f', formatStr,
        '--merge-output-format', 'mp4',
        '-o', filePath,
        url
    ];

    console.log(`[Job ${jobId}] Starting download at ${selectedQuality}p`);

    const downloadChild = spawn(YT_DLP_BINARY, args);

    let downloadStdout = '';
    let downloadStderr = '';

    // Capture download output for debugging
    downloadChild.stdout.on('data', (data) => {
        downloadStdout += data.toString();
        console.log(`[Job ${jobId}] Download stdout: ${data.toString().trim()}`);
    });

    downloadChild.stderr.on('data', (data) => {
        downloadStderr += data.toString();
        const output = data.toString().trim();
        // Log progress information
        if (output.includes('[download]') || output.includes('%')) {
            console.log(`[Job ${jobId}] Download: ${output}`);
        } else if (output.includes('ERROR') || output.includes('error')) {
            console.error(`[Job ${jobId}] Download ERROR: ${output}`);
        } else {
            console.log(`[Job ${jobId}] ${output}`);
        }
    });

    downloadChild.on('close', async (code) => {
        console.log(`[Job ${jobId}] Download process exited with code: ${code}`);
        if (code !== 0) {
            // Log last error output if failed
            console.error(`[Job ${jobId}] Download stderr output:`);
            console.error(downloadStderr);
            clipJobs.set(jobId, { ...clipJobs.get(jobId), status: 'failed', error: 'Download failed' });
            return;
        }

        let actualFilePath = filePath;
        if (!fs.existsSync(filePath)) {
            const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`clip_${timestamp}`));
            if (files.length > 0) actualFilePath = path.join(DOWNLOAD_DIR, files[0]);
            else {
                clipJobs.set(jobId, { ...clipJobs.get(jobId), status: 'failed', error: 'File not found' });
                return;
            }
        }

        // FFmpeg conversion with proper aspect ratio
        const convertedFilename = `clip_${timestamp}_${ratioSuffix}.mp4`;
        const convertedPath = path.join(DOWNLOAD_DIR, convertedFilename);

        let filterStr;
        if (selectedRatio === '9:16') {
            // For 9:16 (Shorts/Reels): Scale height to match quality, then crop width to 9:16
            // Example: 1080p → scale to 1920x1080 → crop center 1080x1920
            const targetHeight = parseInt(selectedQuality);
            const targetWidth = Math.round(targetHeight * 9 / 16);
            filterStr = `scale=-2:${targetHeight},crop=${targetWidth}:${targetHeight}`;
        } else {
            // For 1:1 (Square): Crop to square based on selected quality
            const targetSize = parseInt(selectedQuality);
            filterStr = `crop='min(iw,ih)':'min(iw,ih)',scale=${targetSize}:${targetSize}`;
        }

        const ffmpegArgs = [
            '-y', '-i', actualFilePath,
            '-vf', filterStr,
            '-c:v', 'libx264',
            '-preset', 'superfast', // Changed from ultrafast for better speed/quality balance
            '-crf', '28', // Slightly better quality than 30
            '-c:a', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart', // Enable fast start for web
            '-threads', '0',
            convertedPath
        ];

        console.log(`[Job ${jobId}] FFmpeg converting to ${selectedRatio}...`);
        console.log(`[Job ${jobId}] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

        const ffmpegChild = spawn('ffmpeg', ffmpegArgs);

        let ffmpegStdout = '';
        let ffmpegStderr = '';

        // Capture FFmpeg output for debugging
        ffmpegChild.stdout.on('data', (data) => {
            ffmpegStdout += data.toString();
            console.log(`[Job ${jobId}] FFmpeg stdout: ${data.toString().trim()}`);
        });

        ffmpegChild.stderr.on('data', (data) => {
            ffmpegStderr += data.toString();
            const output = data.toString().trim();
            // Log progress info if it contains time=
            if (output.includes('time=') || output.includes('frame=')) {
                console.log(`[Job ${jobId}] FFmpeg progress: ${output}`);
            } else if (output.includes('error') || output.includes('Error') || output.includes('failed')) {
                console.error(`[Job ${jobId}] FFmpeg ERROR: ${output}`);
            }
        });

        ffmpegChild.on('close', (ffmpegCode) => {
            console.log(`[Job ${jobId}] FFmpeg process exited with code: ${ffmpegCode}`);

            // Log last error output if failed
            if (ffmpegCode !== 0) {
                console.error(`[Job ${jobId}] FFmpeg stderr output:`);
                console.error(ffmpegStderr);
            }

            // Cleanup original
            try { if (fs.existsSync(actualFilePath)) fs.unlinkSync(actualFilePath); } catch (e) { }

            if (ffmpegCode !== 0 || !fs.existsSync(convertedPath)) {
                console.error(`[Job ${jobId}] ❌ FFmpeg failed with code ${ffmpegCode}`);
                console.error(`[Job ${jobId}] Output file exists: ${fs.existsSync(convertedPath)}`);
                clipJobs.set(jobId, { ...clipJobs.get(jobId), status: 'failed', error: `Conversion failed (exit code ${ffmpegCode})` });
                return;
            }

            const fileSize = fs.statSync(convertedPath).size;
            console.log(`[Job ${jobId}] ✅ Conversion complete! File size: ${(fileSize / 1024).toFixed(2)}KB`);
            console.log(`[Job ${jobId}] ✅ Ready for download at: ${convertedPath}`);

            clipJobs.set(jobId, {
                ...clipJobs.get(jobId),
                status: 'ready',
                filePath: convertedPath
            });
        });

        ffmpegChild.on('error', (err) => {
            console.error(`[Job ${jobId}] ❌ FFmpeg spawn error:`, err);
            clipJobs.set(jobId, { ...clipJobs.get(jobId), status: 'failed', error: `FFmpeg error: ${err.message}` });
        });
    });

    downloadChild.on('error', () => {
        clipJobs.set(jobId, { ...clipJobs.get(jobId), status: 'failed', error: 'Process error' });
    });
});

// --- ROUTE: CHECK CLIP JOB STATUS ---
app.get('/api/clip/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = clipJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ status: 'not_found', error: 'Job not found or expired' });
    }

    res.json({
        status: job.status,
        error: job.error,
        filename: job.filename
    });
});

// --- ROUTE: DOWNLOAD COMPLETED CLIP ---
app.get('/api/clip/download/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = clipJobs.get(jobId);

    if (!job) {
        return res.status(404).send('Job not found or expired');
    }

    if (job.status !== 'ready') {
        return res.status(400).send('Clip not ready yet');
    }

    if (!job.filePath || !fs.existsSync(job.filePath)) {
        return res.status(404).send('File not found');
    }

    res.download(job.filePath, job.filename, (err) => {
        if (!err) {
            // Cleanup after download
            setTimeout(() => {
                try {
                    if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
                    clipJobs.delete(jobId);
                } catch (e) { }
            }, 60 * 1000); // Delete after 1 minute
        }
    });
});


// --- ROUTE: GET AVAILABLE SUBTITLES ---
app.post('/api/subtitles', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    console.log(`📝 Fetching subtitles for: ${url}`);

    const args = [
        '--list-subs',
        '--skip-download',
        '--no-warnings',
        '--impersonate', 'chrome',
        '-J',
        url
    ];

    const cookieFile = getCookieFile(url);
    if (cookieFile) args.push('--cookies', cookieFile);

    try {
        const child = spawn(YT_DLP_BINARY, args);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());

        child.on('close', (code) => {
            if (code !== 0) {
                console.error('Subtitle list error:', stderr);
                return res.status(500).json({ error: 'Failed to fetch subtitle info' });
            }

            try {
                // Sometimes yt-dlp outputs warnings/text before JSON, so we find the start of JSON
                let validJson = stdout;
                const jsonStart = stdout.indexOf('{');
                if (jsonStart !== -1) {
                    validJson = stdout.slice(jsonStart);
                }
                const data = JSON.parse(validJson);
                const subtitles = [];

                // Get manual subtitles
                if (data.subtitles) {
                    Object.keys(data.subtitles).forEach(lang => {
                        const sub = data.subtitles[lang];
                        if (sub && sub.length > 0) {
                            subtitles.push({
                                code: lang,
                                name: sub[0].name || lang.toUpperCase(),
                                auto: false
                            });
                        }
                    });
                }

                // Get auto-generated subtitles
                if (data.automatic_captions) {
                    Object.keys(data.automatic_captions).forEach(lang => {
                        // Only add if not already in manual subs
                        if (!subtitles.find(s => s.code === lang)) {
                            const sub = data.automatic_captions[lang];
                            if (sub && sub.length > 0) {
                                subtitles.push({
                                    code: lang,
                                    name: (sub[0].name || lang.toUpperCase()) + ' (Auto)',
                                    auto: true
                                });
                            }
                        }
                    });
                }

                // Sort English first
                subtitles.sort((a, b) => {
                    if (a.code.startsWith('en') && !b.code.startsWith('en')) return -1;
                    if (!a.code.startsWith('en') && b.code.startsWith('en')) return 1;
                    return a.code.localeCompare(b.code);
                });

                console.log(`✅ Found ${subtitles.length} subtitle tracks`);

                res.json({
                    title: data.title || 'Unknown',
                    thumbnail: data.thumbnail || '',
                    uploader: data.uploader || data.channel || 'Unknown',
                    duration: data.duration_string || '',
                    subtitles: subtitles
                });

            } catch (parseErr) {
                console.error('JSON parse error:', parseErr);
                res.status(500).json({ error: 'Failed to parse subtitle info' });
            }
        });

        child.on('error', (err) => {
            console.error('Spawn error:', err);
            res.status(500).json({ error: 'Failed to fetch subtitles' });
        });

    } catch (err) {
        console.error('Subtitle fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});



// Parse VTT format to array of {time, text}
function parseVTT(content) {
    const lines = [];
    const blocks = content.split(/\n\n+/);

    for (const block of blocks) {
        const blockLines = block.trim().split('\n');
        if (blockLines.length < 2) continue;

        // Find timestamp line
        const timestampLine = blockLines.find(l => l.includes('-->'));
        if (!timestampLine) continue;

        const timeMatch = timestampLine.match(/(\d{2}:\d{2}:\d{2})/);
        const time = timeMatch ? timeMatch[1] : '';

        // Get text (everything after timestamp)
        const textIndex = blockLines.indexOf(timestampLine) + 1;
        const text = blockLines.slice(textIndex).join(' ').replace(/<[^>]+>/g, '').trim();

        if (text) {
            lines.push({ time, text });
        }
    }

    return lines;
}

// --- ROUTE: DOWNLOAD SUBTITLE FILE ---
app.get('/api/subtitles/download', async (req, res) => {
    const { url, lang, format } = req.query;
    if (!url || !lang) return res.status(400).send('Missing URL or language');

    const subFormat = ['srt', 'vtt', 'txt'].includes(format) ? format : 'srt';
    console.log(`📥 Downloading subtitle: ${lang} as ${subFormat}`);

    const timestamp = Date.now();
    const subFile = path.join(DOWNLOAD_DIR, `sub_${timestamp}`);

    // For txt format, we'll convert from vtt
    const downloadFormat = subFormat === 'txt' ? 'vtt' : subFormat;

    const args = [
        '--write-sub',
        '--write-auto-sub',
        '--sub-lang', lang,
        '--sub-format', downloadFormat,
        '--skip-download',
        '--no-warnings',
        '--impersonate', 'chrome',
        '-o', subFile,
        url
    ];

    const cookieFile = getCookieFile(url);
    if (cookieFile) args.push('--cookies', cookieFile);

    // Get video title for filename
    let videoTitle = 'subtitle';
    try {
        const titleArgs = ['--get-title', '--no-warnings', '--impersonate', 'chrome', url];
        if (cookieFile) titleArgs.push('--cookies', cookieFile);

        const titleChild = spawn(YT_DLP_BINARY, titleArgs);
        let titleData = '';

        await new Promise((resolve) => {
            titleChild.stdout.on('data', d => titleData += d.toString());
            titleChild.on('close', () => resolve());
            titleChild.on('error', () => resolve());
            setTimeout(resolve, 5000);
        });

        if (titleData.trim()) videoTitle = titleData.trim();
    } catch (e) { }

    const safeTitle = videoTitle.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'subtitle';

    const child = spawn(YT_DLP_BINARY, args);
    let stderr = '';

    child.stderr.on('data', (d) => stderr += d.toString());

    child.on('close', (code) => {
        // Find the subtitle file
        const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`sub_${timestamp}`));

        if (files.length === 0) {
            console.error('No subtitle file found:', stderr);
            return res.status(404).send('No subtitle available for this language');
        }

        const subFilePath = path.join(DOWNLOAD_DIR, files[0]);

        try {
            if (subFormat === 'txt') {
                // Convert VTT to plain text
                const content = fs.readFileSync(subFilePath, 'utf8');
                const lines = parseVTT(content);
                const plainText = lines.map(l => l.text).join('\n');

                const txtPath = path.join(DOWNLOAD_DIR, `sub_${timestamp}.txt`);
                fs.writeFileSync(txtPath, plainText);

                // Delete original vtt
                fs.unlinkSync(subFilePath);

                const userFilename = `${safeTitle} [${lang}].txt`;
                res.download(txtPath, userFilename, (err) => {
                    setTimeout(() => {
                        if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
                    }, 60000);
                });
            } else {
                const userFilename = `${safeTitle} [${lang}].${subFormat}`;
                res.download(subFilePath, userFilename, (err) => {
                    setTimeout(() => {
                        if (fs.existsSync(subFilePath)) fs.unlinkSync(subFilePath);
                    }, 60000);
                });
            }

            console.log(`✅ Subtitle downloaded: ${safeTitle} [${lang}].${subFormat}`);

        } catch (readErr) {
            console.error('Read error:', readErr);
            res.status(500).send('Failed to read subtitle file');
        }
    });

    child.on('error', (err) => {
        console.error('Spawn error:', err);
        res.status(500).send('Failed to download subtitle');
    });
});

// --- ROUTE: AI VIDEO SUMMARIZER ---
app.post('/api/summarize', async (req, res) => {
    const { url, type } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'AI service not configured. Please set OPENROUTER_API_KEY in .env file' });
    }

    const summaryType = ['brief', 'detailed', 'keypoints', 'chapters'].includes(type) ? type : 'brief';
    console.log(`🧠 AI Summarizing video: ${url} (${summaryType})`);

    try {
        // Step 1: Get video info and subtitles
        const args = [
            '--skip-download',
            '--no-warnings',
            '--impersonate', 'chrome',
            '-J',
            url
        ];

        const cookieFile = getCookieFile(url);
        if (cookieFile) args.push('--cookies', cookieFile);

        const videoInfo = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, args);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (d) => stdout += d.toString());
            child.stderr.on('data', (d) => stderr += d.toString());

            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('Failed to fetch video info'));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error('Failed to parse video info'));
                }
            });

            child.on('error', (err) => reject(err));
        });

        // Step 2: Get transcript
        const timestamp = Date.now();
        const subFile = path.join(DOWNLOAD_DIR, `sum_${timestamp}`);

        // Try to get English subtitles first, then auto-generated
        const subArgs = [
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'en,en-US,en-GB,en-orig,hi,hi-IN',
            '--sub-format', 'vtt',
            '--skip-download',
            '--no-warnings',
            '--impersonate', 'chrome',
            '-o', subFile,
            url
        ];

        if (cookieFile) subArgs.push('--cookies', cookieFile);

        await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, subArgs);
            child.on('close', () => resolve());
            child.on('error', (err) => reject(err));
        });

        // Find and read subtitle file
        const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`sum_${timestamp}`));
        if (files.length === 0) {
            return res.status(400).json({ error: 'No subtitles available for this video' });
        }

        const subFilePath = path.join(DOWNLOAD_DIR, files[0]);
        const subContent = fs.readFileSync(subFilePath, 'utf8');
        const transcriptLines = parseVTT(subContent);

        // Clean up subtitle file
        fs.unlinkSync(subFilePath);

        if (transcriptLines.length === 0) {
            return res.status(400).json({ error: 'Could not extract transcript from video' });
        }

        // Combine transcript text (limit to avoid token limits)
        const transcriptText = transcriptLines
            .map(l => l.text)
            .join(' ')
            .slice(0, 15000); // Limit transcript length

        // Step 3: Generate prompt based on summary type
        let systemPrompt = 'You are an expert video summarizer. Provide clear, well-structured summaries.';
        let userPrompt = '';

        switch (summaryType) {
            case 'brief':
                userPrompt = `Summarize this video transcript in 3-5 paragraphs. Focus on the main message and key takeaways.

Video Title: ${videoInfo.title || 'Unknown'}
Video Channel: ${videoInfo.uploader || videoInfo.channel || 'Unknown'}

Transcript:
${transcriptText}`;
                break;

            case 'detailed':
                userPrompt = `Provide a detailed summary of this video with the following sections:
1. **Overview** - What is this video about?
2. **Main Points** - List all important points discussed
3. **Key Insights** - Any valuable insights or lessons
4. **Conclusion** - Final thoughts and takeaways

Video Title: ${videoInfo.title || 'Unknown'}
Video Channel: ${videoInfo.uploader || videoInfo.channel || 'Unknown'}

Transcript:
${transcriptText}`;
                break;

            case 'keypoints':
                userPrompt = `Extract the key points from this video as a bulleted list. Each point should be concise but informative. Include at least 5-10 key points.

Video Title: ${videoInfo.title || 'Unknown'}
Video Channel: ${videoInfo.uploader || videoInfo.channel || 'Unknown'}

Transcript:
${transcriptText}`;
                break;

            case 'chapters':
                userPrompt = `Create a chapter-by-chapter breakdown of this video. Identify different sections/topics discussed and summarize each one with a clear heading.

Format:
## Chapter 1: [Topic Name]
Summary of this section...

## Chapter 2: [Topic Name]
Summary of this section...

Video Title: ${videoInfo.title || 'Unknown'}
Video Channel: ${videoInfo.uploader || videoInfo.channel || 'Unknown'}

Transcript:
${transcriptText}`;
                break;
        }

        // Step 4: Call OpenRouter API with auto-failover
        console.log('🤖 Calling OpenRouter AI...');

        const aiData = await callOpenRouterAPI(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 2000,
                temperature: 0.7
            },
            { title: 'RaiSum Video Summarizer' }
        );

        const summary = aiData.choices?.[0]?.message?.content || 'Could not generate summary';

        console.log(`✅ Summary generated (${summary.length} chars)`);

        res.json({
            title: videoInfo.title || 'Unknown',
            thumbnail: videoInfo.thumbnail || '',
            uploader: videoInfo.uploader || videoInfo.channel || 'Unknown',
            duration: videoInfo.duration_string || '',
            summary: summary,
            type: summaryType
        });

    } catch (err) {
        console.error('Summarize error:', err);
        res.status(500).json({ error: err.message || 'Failed to summarize video' });
    }
});

// --- ROUTE: AI VIRAL CLIP FINDER ---
app.post('/api/viral', async (req, res) => {
    const { url, excludedRanges } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'AI service not configured. Please set OPENROUTER_API_KEY in .env file' });
    }

    console.log(`🔥 Finding viral clip for: ${url}`);
    if (excludedRanges && excludedRanges.length > 0) {
        console.log(`📌 Excluding ${excludedRanges.length} previously selected range(s)`);
    }

    try {
        // Step 1: Get video info
        const args = [
            '--skip-download',
            '--no-warnings',
            '--impersonate', 'chrome',
            '-J',
            url
        ];

        const cookieFile = getCookieFile(url);
        if (cookieFile) args.push('--cookies', cookieFile);

        const videoInfo = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, args);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (d) => stdout += d.toString());
            child.stderr.on('data', (d) => stderr += d.toString());

            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('Failed to fetch video info'));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error('Failed to parse video info'));
                }
            });

            child.on('error', (err) => reject(err));
        });

        const videoDuration = videoInfo.duration || 0;
        if (videoDuration < 30) {
            return res.status(400).json({ error: 'Video must be at least 30 seconds long' });
        }

        // Step 2: Get transcript
        const timestamp = Date.now();
        const subFile = path.join(DOWNLOAD_DIR, `viral_${timestamp}`);

        const subArgs = [
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'en,en-US,en-GB,en-orig,hi,hi-IN',
            '--sub-format', 'vtt',
            '--skip-download',
            '--no-warnings',
            '--impersonate', 'chrome',
            '-o', subFile,
            url
        ];

        if (cookieFile) subArgs.push('--cookies', cookieFile);

        await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, subArgs);
            child.on('close', () => resolve());
            child.on('error', (err) => reject(err));
        });

        // Find and read subtitle file
        // Find and read subtitle file
        const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`viral_${timestamp}`));
        let transcriptLines = [];

        if (files.length > 0) {
            const subFilePath = path.join(DOWNLOAD_DIR, files[0]);
            const subContent = fs.readFileSync(subFilePath, 'utf8');
            transcriptLines = parseVTT(subContent);
            try { fs.unlinkSync(subFilePath); } catch (e) { } // Clean up
        }

        // --- FALLBACK: RANDOM SELECTION (If no subs) ---
        if (files.length === 0 || transcriptLines.length === 0) {
            console.log('⚠️ No subtitles found using random 30s segment.');

            // Logic to pick random 30s
            // Exclude first 10% and last 10% if video is long enough (> 2 mins)
            let minStart = 0;
            let maxStart = Math.max(0, videoDuration - 30);

            if (videoDuration > 120) {
                minStart = Math.floor(videoDuration * 0.1);
                maxStart = Math.floor(videoDuration * 0.9) - 30;
            }

            // Ensure valid range
            if (maxStart < minStart) maxStart = minStart;

            let attempts = 0;
            let finalStart = minStart;
            let isValid = false;

            while (attempts < 50 && !isValid) {
                // Random start between min and max
                const randStart = Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart;
                const randEnd = randStart + 30;

                // Check collision with excludedRanges
                let collision = false;
                if (excludedRanges && excludedRanges.length > 0) {
                    collision = excludedRanges.some(r =>
                        (randStart < r.end && randEnd > r.start) // Overlap check
                    );
                }

                if (!collision) {
                    finalStart = randStart;
                    isValid = true;
                }
                attempts++;
            }

            // Retry fallback: if we couldn't find a valid one, just pick random
            if (!isValid) {
                finalStart = Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart;
            }

            return res.json({
                title: videoInfo.title || 'Unknown',
                thumbnail: videoInfo.thumbnail || '',
                uploader: videoInfo.uploader || videoInfo.channel || 'Unknown',
                duration: videoDuration,
                startTime: finalStart,
                endTime: finalStart + 30,
                reasoning: "No subtitles available. Selected a random highlight segment.",
                clipTranscript: "No transcript available for this video."
            });
        }

        // Create transcript with timestamps for AI
        const transcriptWithTimestamps = transcriptLines
            .map(l => {
                // Parse time to seconds for exclusion check
                const timeMatch = l.time.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (!timeMatch) return `[${l.time}] ${l.text}`;

                const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);

                // Check if this line falls within any excluded range
                let isExcluded = false;
                if (excludedRanges && excludedRanges.length > 0) {
                    isExcluded = excludedRanges.some(range =>
                        // If the line is within the range (with 5s buffer)
                        seconds >= (range.start - 5) && seconds <= (range.end + 5)
                    );
                }

                if (isExcluded) {
                    return `[${l.time}] [ALREADY SELECTED - DO NOT USE]`;
                }
                return `[${l.time}] ${l.text}`;
            })
            .join('\n')
            .slice(0, 20000); // Limit length

        // Step 3: Use AI to find best viral moment
        console.log('🤖 AI analyzing for viral moment...');

        // Build excluded ranges text for AI prompt
        let excludedText = '';
        if (excludedRanges && excludedRanges.length > 0) {
            excludedText = '\n\nCRITICAL INSTRUCTION: The following time ranges have ALREADY been selected. You MUST NOT select any time range that overlaps with these:\n';
            excludedRanges.forEach((range, idx) => {
                excludedText += `- Range ${idx + 1}: ${range.start}s to ${range.end}s (ALREADY USED)\n`;
            });
            excludedText += '\nFind a COMPLETELY DIFFERENT valid hook from the remaining transcript.\n';
        }

        const systemPrompt = `You are a viral content expert. Analyze video transcripts and identify the single best 30-second segment that would go viral on TikTok, Instagram Reels, or YouTube Shorts.

Look for:
- Shocking statements or surprising facts
- Emotional hooks that grab attention in first 3 seconds
- Controversial or thought-provoking moments
- Funny or relatable quotes
- "Aha!" moments or key insights
- Cliffhangers or mystery hooks

IMPORTANT: Respond ONLY in this exact JSON format:
{
  "startTime": <seconds_as_number>,
  "endTime": <seconds_as_number>,
  "reasoning": "<1-2 sentence explanation of why this moment is viral-worthy>"
}`;

        const userPrompt = `Video Title: ${videoInfo.title || 'Unknown'}
Video Duration: ${videoDuration} seconds

Find the best 30-second clip from this transcript. The clip must be exactly 30 seconds.${excludedText}

Transcript with timestamps:
${transcriptWithTimestamps}

Return ONLY the JSON response with startTime (in seconds), endTime (in seconds, which should be startTime + 30), and reasoning.`;

        const aiData = await callOpenRouterAPI(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openrouter/auto',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 500,
                temperature: 0.7
            },
            { title: 'RaiViral Clip Finder' }
        );

        const aiText = aiData.choices?.[0]?.message?.content || '';

        // Parse AI response
        let startTime = 0;
        let endTime = 30;
        let reasoning = 'This segment has high viral potential based on content analysis.';

        try {
            // Try to extract JSON from response
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                startTime = Math.max(0, Number(parsed.startTime) || 0);
                endTime = Math.min(videoDuration, Number(parsed.endTime) || startTime + 30);
                reasoning = parsed.reasoning || reasoning;

                // Ensure 30 second clip
                if (endTime - startTime !== 30) {
                    endTime = Math.min(videoDuration, startTime + 30);
                }
                if (endTime > videoDuration) {
                    startTime = Math.max(0, videoDuration - 30);
                    endTime = videoDuration;
                }
            }
        } catch (parseErr) {
            console.error('AI response parse error:', parseErr);
            // Default to first 30 seconds if parsing fails
        }

        // Get clip transcript
        const clipTranscript = transcriptLines
            .filter(l => {
                const timeMatch = l.time.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (!timeMatch) return false;
                const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                return seconds >= startTime && seconds <= endTime;
            })
            .map(l => l.text)
            .join(' ');

        console.log(`✅ Viral clip found: ${startTime}s - ${endTime}s`);

        res.json({
            title: videoInfo.title || 'Unknown',
            thumbnail: videoInfo.thumbnail || '',
            uploader: videoInfo.uploader || videoInfo.channel || 'Unknown',
            duration: videoDuration,
            startTime: startTime,
            endTime: endTime,
            reasoning: reasoning,
            clipTranscript: clipTranscript || 'Transcript not available for this segment.'
        });

    } catch (err) {
        console.error('Viral clip error:', err);
        res.status(500).json({ error: err.message || 'Failed to find viral clip' });
    }
});

// --- ROUTE: THUMBNAIL INFO ---
app.post('/api/thumbnail', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    try {
        const args = ['--skip-download', '--no-warnings', '--impersonate', 'chrome', '-J', url];
        const cookieFile = getCookieFile(url);
        if (cookieFile) args.push('--cookies', cookieFile);

        const info = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, args);
            let stdout = '';
            child.stdout.on('data', (d) => stdout += d.toString());
            child.on('close', (code) => {
                if (code !== 0) reject(new Error('Failed to fetch video info'));
                else {
                    try { resolve(JSON.parse(stdout)); }
                    catch (e) { reject(new Error('Failed to parse video info')); }
                }
            });
            child.on('error', (err) => reject(err));
        });

        res.json({
            title: info.title || 'Unknown',
            uploader: info.uploader || info.channel || '',
            thumbnail: info.thumbnail || '',
            thumbnails: info.thumbnails || []
        });

    } catch (err) {
        console.error('Thumbnail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE: FULL METADATA ---
app.post('/api/metadata', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    console.log(`📊 Fetching metadata for: ${url}`);

    try {
        const args = ['--skip-download', '--no-warnings', '--impersonate', 'chrome', '-J', url];
        const cookieFile = getCookieFile(url);
        if (cookieFile) args.push('--cookies', cookieFile);

        const info = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, args);
            let stdout = '';
            child.stdout.on('data', (d) => stdout += d.toString());
            child.on('close', (code) => {
                if (code !== 0) reject(new Error('Failed to fetch video info'));
                else {
                    try { resolve(JSON.parse(stdout)); }
                    catch (e) { reject(new Error('Failed to parse video info')); }
                }
            });
            child.on('error', (err) => reject(err));
        });

        res.json({
            title: info.title || 'Unknown',
            uploader: info.uploader || info.channel || '',
            upload_date: info.upload_date || '',
            description: info.description || '',
            duration: info.duration || 0,
            duration_string: info.duration_string || '0:00',
            view_count: info.view_count || 0,
            like_count: info.like_count || 0,
            comment_count: info.comment_count || 0,
            tags: info.tags || [],
            categories: info.categories || [],
            thumbnail: info.thumbnail || ''
        });

    } catch (err) {
        console.error('Metadata error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE: AI Chat (Bot-compatible) ---

app.post('/api/chat', async (req, res) => {
    const { videoId, videoData, messages } = req.body;

    if (!videoId || !messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid request. videoId and messages are required.' });
    }

    if (!OPENROUTER_API_KEY) {
        console.error('[RaiChat] OpenRouter API key not configured');
        return res.status(500).json({ error: 'AI service not configured. Please set OPENROUTER_API_KEY.' });
    }

    console.log(`🤖 [RaiChat] Processing chat for video: ${videoData?.title || videoId}`);

    try {
        // Build the system prompt with video context
        const systemPrompt = `You are RaiChat, a friendly and helpful AI assistant that specializes in analyzing and discussing YouTube videos.

CURRENT VIDEO CONTEXT:
- Title: ${videoData?.title || 'Unknown'}
- Channel: ${videoData?.channel || 'Unknown'}
- Duration: ${videoData?.duration || 'Unknown'}
- Description: ${(videoData?.description || '').substring(0, 1000)}

YOUR CAPABILITIES:
- Summarize videos based on title, description, and available metadata
- Answer questions about the video's topic, creator, and content
- Provide key takeaways and main points
- Suggest timestamps for different sections (based on description if available)
- Explain complex concepts mentioned in the video
- Translate or simplify content
- Generate scripts, hooks, or content ideas based on the video

GUIDELINES:
- Be concise but thorough
- Use markdown formatting for better readability (bullet points, bold, headers)
- If you don't have enough information, be honest and say so
- Focus on being helpful and actionable
- Keep responses engaging and conversational`;

        // Prepare messages for API
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }))
        ];

        // Call OpenRouter API with auto-failover
        const data = await callOpenRouterAPI(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: apiMessages,
                max_tokens: 1500,
                temperature: 0.7
            },
            { title: 'RaiChat Video Assistant' }
        );

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response from AI service');
        }

        const aiResponse = data.choices[0].message.content;
        console.log(`✅ [RaiChat] Response generated (${aiResponse.length} chars)`);

        res.json({
            status: 'success',
            response: aiResponse
        });

    } catch (error) {
        console.error('[RaiChat] Chat Error:', error);
        res.status(500).json({
            error: 'Failed to generate response. Please try again.',
            details: error.message
        });
    }

    console.log(`📊 [RaiAnalyze] Analyzing: ${input}`);

    const channelInfo = extractChannelId(input);
    let targetUrl;
    let videosUrl;

    switch (channelInfo.type) {
        case 'video':
            // For video URL, first get channel URL
            targetUrl = `https://www.youtube.com/watch?v=${channelInfo.value}`;
            break;
        case 'channel_id':
            targetUrl = `https://www.youtube.com/channel/${channelInfo.value}`;
            videosUrl = `https://www.youtube.com/channel/${channelInfo.value}/videos`;
            break;
        case 'handle':
        default:
            // Clean handle
            const handle = channelInfo.value.replace(/^@/, '');
            targetUrl = `https://www.youtube.com/@${handle}`;
            videosUrl = `https://www.youtube.com/@${handle}/videos`;
    }

    console.log(`📊 [RaiAnalyze] Target URL: ${targetUrl}`);

    try {
        // Step 1: Get channel metadata using a single video or channel page
        const cookieFile = getCookieFile(targetUrl);

        // First, try to get channel info
        const infoArgs = [
            '--no-check-certificates',
            '--no-warnings',
            '--skip-download',
            '--impersonate', 'chrome',
            '-j',  // Single JSON output
            '--playlist-items', '1',
            targetUrl
        ];

        if (cookieFile && fs.existsSync(cookieFile)) {
            infoArgs.unshift('--cookies', cookieFile);
        }

        console.log(`📊 [RaiAnalyze] Fetching channel info...`);

        const channelMeta = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, infoArgs);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', d => stdout += d.toString());
            child.stderr.on('data', d => stderr += d.toString());

            child.on('close', code => {
                if (code !== 0) {
                    console.error(`[RaiAnalyze] Info fetch failed: ${stderr}`);
                    reject(new Error('Failed to fetch channel info'));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error('Failed to parse channel info'));
                }
            });

            child.on('error', err => reject(err));
        });

        // Extract channel data
        const channelName = channelMeta.channel || channelMeta.uploader || 'Unknown Channel';
        const channelId = channelMeta.channel_id || channelMeta.uploader_id || '';
        const channelHandle = channelMeta.uploader_id || channelId;
        const channelUrl = channelMeta.channel_url || channelMeta.uploader_url || targetUrl;
        const subscriberCount = channelMeta.channel_follower_count || 0;
        const channelDescription = channelMeta.channel_description || channelMeta.description || '';

        // Generate avatar URL - Try to get from thumbnails or use placeholder
        let avatarUrl = null;
        if (channelMeta.thumbnails && channelMeta.thumbnails.length > 0) {
            // Look for avatar in thumbnails (usually the smaller square ones)
            const possibleAvatars = channelMeta.thumbnails.filter(t =>
                t.height && t.width && Math.abs(t.height - t.width) < 50 && t.height < 300
            );
            if (possibleAvatars.length > 0) {
                avatarUrl = possibleAvatars[possibleAvatars.length - 1].url;
            }
        }

        // Fallback to UI Avatars service
        if (!avatarUrl) {
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(channelName)}&size=200&background=10B981&color=fff&bold=true`;
        }

        console.log(`📊 [RaiAnalyze] Channel: ${channelName}, Subs: ${subscriberCount}`);

        // Step 2: Get recent videos with full metadata
        const actualVideosUrl = videosUrl || channelUrl + '/videos';
        const videosArgs = [
            '--no-check-certificates',
            '--no-warnings',
            '--skip-download',
            '--impersonate', 'chrome',
            '-j',
            '--playlist-items', '1:10', // Get first 10 videos
            actualVideosUrl
        ];

        if (cookieFile && fs.existsSync(cookieFile)) {
            videosArgs.unshift('--cookies', cookieFile);
        }

        console.log(`📊 [RaiAnalyze] Fetching videos from: ${actualVideosUrl}`);

        const videosData = await new Promise((resolve, reject) => {
            const child = spawn(YT_DLP_BINARY, videosArgs);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', d => stdout += d.toString());
            child.stderr.on('data', d => stderr += d.toString());

            child.on('close', code => {
                if (code !== 0) {
                    console.log(`[RaiAnalyze] Videos fetch warning: ${stderr}`);
                }
                resolve(stdout);
            });

            child.on('error', err => {
                console.error('[RaiAnalyze] Videos fetch error:', err);
                resolve('');
            });
        });

        // Parse videos
        const videos = [];
        let totalViews = 0;
        let videoCount = 0;
        let oldestDate = null;

        if (videosData.trim()) {
            const lines = videosData.trim().split('\n').filter(l => l.trim());

            for (const line of lines) {
                try {
                    const video = JSON.parse(line);
                    const views = video.view_count || 0;
                    totalViews += views;
                    videoCount++;

                    // Track oldest video date
                    if (video.upload_date) {
                        const uploadDate = new Date(video.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                        if (!oldestDate || uploadDate < oldestDate) {
                            oldestDate = uploadDate;
                        }
                    }

                    videos.push({
                        id: video.id,
                        title: video.title || 'Untitled',
                        url: video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`,
                        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`,
                        duration: formatDuration(video.duration),
                        views: views,
                        uploadDate: video.upload_date ?
                            new Date(video.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toISOString()
                            : null
                    });
                } catch (e) {
                    // Skip malformed entries
                }
            }
        }

        // Calculate channel age
        let channelAge = null;
        if (oldestDate) {
            const now = new Date();
            const years = Math.floor((now - oldestDate) / (365.25 * 24 * 60 * 60 * 1000));
            const months = Math.floor(((now - oldestDate) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
            if (years > 0) {
                channelAge = `${years}+ years`;
            } else if (months > 0) {
                channelAge = `${months}+ months`;
            } else {
                channelAge = 'Less than a month';
            }
        }

        // Get playlist count (total videos) from channel metadata if available
        const totalVideoCount = channelMeta.playlist_count || videoCount || 0;

        console.log(`✅ [RaiAnalyze] Found ${videos.length} videos for ${channelName}`);

        res.json({
            status: 'success',
            name: channelName,
            handle: channelHandle ? (channelHandle.startsWith('@') ? channelHandle : '@' + channelHandle) : '',
            description: channelDescription.substring(0, 500),
            url: channelUrl,
            avatar: avatarUrl,
            subscribers: subscriberCount,
            videoCount: totalVideoCount,
            totalViews: totalViews,
            channelAge: channelAge,
            country: channelMeta.location || null,
            videos: videos
        });

    } catch (err) {
        console.error('[RaiAnalyze] Error:', err.message);

        // Try fallback search
        if (channelInfo.type === 'handle') {
            return fetchChannelViaSearch(channelInfo.value, res);
        }

        res.status(500).json({ error: 'Failed to analyze channel. Please check the URL and try again.' });
    }
});


// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// --- AUTOMATIC CLEANUP FUNCTION ---
function cleanupOldFiles() {
    try {
        if (!fs.existsSync(DOWNLOAD_DIR)) return;

        const files = fs.readdirSync(DOWNLOAD_DIR);
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds
        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(DOWNLOAD_DIR, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtimeMs; // Time since last modification

            if (fileAge > maxAge) {
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`🗑️ Auto-cleanup: Deleted ${file} (${Math.round(fileAge / 60000)} min old)`);
            }
        });

        if (deletedCount > 0) {
            console.log(`✅ Cleanup complete: ${deletedCount} old file(s) removed`);
        }
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

// --- CRON JOB: Run cleanup every 10 minutes ---
cron.schedule('*/10 * * * *', () => {
    console.log('🕐 Running scheduled cleanup...');
    cleanupOldFiles();
});

// Run cleanup on server start
console.log('🧹 Running initial cleanup...');
cleanupOldFiles();

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Bot API Server running on Port ${PORT}`);
    console.log(`📱 Supported Platforms: ${Object.keys(PLATFORM_PATTERNS).join(', ')}`);
    console.log(`🍪 Cookie files detected:`);
    Object.entries(PLATFORM_COOKIES).forEach(([platform, file]) => {
        if (fs.existsSync(file)) {
            console.log(`   ✅ ${platform}: ${path.basename(file)}`);
        }
    });
    console.log('✅ Backend ready. Waiting for bot requests...');
});

server.on('error', (err) => {
    if (err.code === 'EACCES') {
        console.error(`❌ PERMISSION DENIED: Cannot bind to Port ${PORT} without root privileges.`);
        console.error(`👉 TRY RUNNING: sudo node backend.js`);
    } else if (err.code === 'EADDRINUSE') {
        console.error(`❌ PORT IN USE: Port ${PORT} is already being used.`);
    } else {
        console.error('❌ SERVER ERROR:', err);
    }
});
