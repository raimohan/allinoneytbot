/**
 * ========================================================
 *  WHATSAPP BOT
 *  Uses whatsapp-web.js with persistent session
 *  Single login with auto-reconnect
 * ========================================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const branding = require('../branding');
const api = require('../shared/api');
const { getUserSettings, updateUserSettings, addToHistory, getHistory, clearHistory } = require('../shared/settings');

const PLATFORM = 'whatsapp';
const MAX_SIZE_MB = 100; // WhatsApp limit
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// ── Auto-detect Chromium for Termux / custom installs ─────────
function findChromiumPath() {
    // 1. Check env var first (set by termux.sh or .env)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        const p = process.env.PUPPETEER_EXECUTABLE_PATH;
        if (fs.existsSync(p)) return p;
    }

    // 2. Scan common paths (Termux, Linux, macOS, snap)
    const candidates = [
        '/data/data/com.termux/files/usr/bin/chromium-browser',  // Termux
        '/data/data/com.termux/files/usr/bin/chromium',          // Termux alt
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }

    return null; // Let puppeteer use its bundled Chromium
}

const CHROMIUM_PATH = findChromiumPath();
if (CHROMIUM_PATH) {
    console.log(`[WA] Using Chromium at: ${CHROMIUM_PATH}`);
} else {
    console.log('[WA] No system Chromium found — using bundled Puppeteer Chromium.');
}

// ── WhatsApp Client with persistent session ───────────────────
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'raixbot',
        dataPath: path.join(__dirname, '..', '.wwebjs_auth'),
    }),
    puppeteer: {
        headless: true,
        ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--single-process',           // Required for Termux (no fork support)
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-translate',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-default-browser-check',
        ],
    },
});


// ── State Store ───────────────────────────────────────────────
const userState = new Map();
function setState(chatId, state) { userState.set(chatId, state); }
function getState(chatId) { return userState.get(chatId) || {}; }
function clearState(chatId) { userState.delete(chatId); }

// ── Initialize ────────────────────────────────────────────────
client.on('qr', (qr) => {
    console.log('\n[WA] Scan this QR code with your WhatsApp:');
    qrcode.generate(qr, { small: true });
    console.log('[WA] QR code displayed in terminal. Waiting for scan...\n');
});

client.on('authenticated', () => {
    console.log('[WA] Authenticated successfully. Session saved for auto-login.');
});

client.on('auth_failure', (msg) => {
    console.error('[WA] Authentication failed:', msg);
    console.error('[WA] Delete .wwebjs_auth folder and restart to login again.');
});

client.on('ready', () => {
    console.log(`[WA] ${branding.BOT_NAME} WhatsApp bot is ready.`);
});

client.on('disconnected', (reason) => {
    console.warn('[WA] Disconnected:', reason);
    console.log('[WA] Attempting to reconnect...');
    client.initialize().catch(console.error);
});

// ── Message Handler ────────────────────────────────────────────
client.on('message', async (message) => {
    // Ignore group messages (optional - remove if you want group support)
    // if (message.from.endsWith('@g.us')) return;

    const chatId = message.from;
    const body = (message.body || '').trim();
    const userId = chatId.split('@')[0];

    if (!body) return;

    try {
        // Command routing
        if (body.startsWith('/')) {
            await handleCommand(message, chatId, userId, body);
        } else {
            // Handle states
            const state = getState(chatId);
            if (state.step) {
                await handleState(message, chatId, userId, body, state);
            }
            // Auto-detect URLs even without commands
            else if (/https?:\/\/[^\s]+/i.test(body)) {
                const url = body.match(/https?:\/\/[^\s]+/i)[0];
                await handleAutoUrl(message, chatId, userId, url);
            }
        }
    } catch (err) {
        console.error('[WA] Message handler error:', err.message);
    }
});

// ─────────────────────────────────────────────────────────────────
//  COMMAND HANDLER
// ─────────────────────────────────────────────────────────────────
async function handleCommand(message, chatId, userId, body) {
    const parts = body.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ').trim();

    switch (cmd) {
        case '/help':
        case '/start':
            await sendHelp(message);
            break;

        case '/download': {
            if (!args) {
                setState(chatId, { step: 'await_download_url' });
                await message.reply('Send me the video URL (YouTube, Instagram, Twitter, Pinterest):');
            } else {
                await handleDownload(message, chatId, userId, args);
            }
            break;
        }

        case '/mp3': {
            if (!args) {
                setState(chatId, { step: 'await_mp3_url' });
                await message.reply('Send the YouTube URL to convert to MP3:');
            } else {
                await handleMp3(message, chatId, userId, args);
            }
            break;
        }

        case '/song': {
            if (!args) {
                setState(chatId, { step: 'await_song_name' });
                await message.reply('Send me the song name to search:');
            } else {
                await handleSongSearch(message, chatId, userId, args);
            }
            break;
        }

        case '/summarise':
        case '/summarize': {
            if (!args) {
                setState(chatId, { step: 'await_summarise_url' });
                await message.reply('Send the YouTube URL to summarize:');
            } else {
                await handleSummarise(message, chatId, userId, args);
            }
            break;
        }

        case '/viral': {
            if (!args) {
                setState(chatId, { step: 'await_viral_url' });
                await message.reply('Send the YouTube URL to find the best viral clip:');
            } else {
                await handleViral(message, chatId, userId, args);
            }
            break;
        }

        case '/clip': {
            if (!args) {
                setState(chatId, { step: 'await_clip_url' });
                await message.reply('Send the video URL to clip from:');
            } else {
                // /clip URL START END
                const clipParts = args.split(/\s+/);
                if (clipParts.length >= 3) {
                    const url = clipParts[0];
                    const start = parseInt(clipParts[1]);
                    const end = parseInt(clipParts[2]);
                    const ratio = clipParts[3] || 'original';
                    await handleClip(message, chatId, userId, url, start, end, ratio);
                } else {
                    setState(chatId, { step: 'await_clip_url' });
                    await message.reply('Send the video URL to clip:');
                }
            }
            break;
        }

        case '/transcript': {
            if (!args) {
                setState(chatId, { step: 'await_transcript_url' });
                await message.reply('Send the YouTube URL to download the transcript:');
            } else {
                await handleTranscript(message, chatId, userId, args);
            }
            break;
        }

        case '/pinterest': {
            if (!args) {
                setState(chatId, { step: 'await_pinterest_url' });
                await message.reply('Send the Pinterest URL:');
            } else {
                await handleSocialDownload(message, chatId, userId, args, 'Pinterest');
            }
            break;
        }

        case '/instagram': {
            if (!args) {
                setState(chatId, { step: 'await_instagram_url' });
                await message.reply('Send the Instagram URL:');
            } else {
                await handleSocialDownload(message, chatId, userId, args, 'Instagram');
            }
            break;
        }

        case '/twitter': {
            if (!args) {
                setState(chatId, { step: 'await_twitter_url' });
                await message.reply('Send the Twitter/X URL:');
            } else {
                await handleSocialDownload(message, chatId, userId, args, 'Twitter');
            }
            break;
        }

        case '/settings': {
            await showSettings(message, chatId, userId);
            break;
        }

        case '/quality': {
            if (!args) {
                setState(chatId, { step: 'await_quality' });
                await message.reply('Send your preferred quality:\n360 / 480 / 720 / 1080');
            } else {
                const q = args.replace('p', '') + 'p';
                const valid = ['360p', '480p', '720p', '1080p'];
                if (valid.includes(q)) {
                    updateUserSettings(userId, PLATFORM, { quality: q });
                    await message.reply(`Quality set to ${q}.`);
                } else {
                    await message.reply('Invalid quality. Choose: 360, 480, 720, 1080');
                }
            }
            break;
        }

        case '/history': {
            await showHistory(message, userId);
            break;
        }

        case '/clearhistory': {
            clearHistory(userId, PLATFORM);
            await message.reply('Your download history has been cleared.');
            break;
        }

        default:
            await message.reply(`Unknown command. Type /help to see all available commands.`);
    }
}

// ─────────────────────────────────────────────────────────────────
//  STATE MACHINE
// ─────────────────────────────────────────────────────────────────
async function handleState(message, chatId, userId, text, state) {
    clearState(chatId);

    switch (state.step) {
        case 'await_download_url':
            return handleDownload(message, chatId, userId, text);
        case 'await_mp3_url':
            return handleMp3(message, chatId, userId, text);
        case 'await_song_name':
            return handleSongSearch(message, chatId, userId, text);
        case 'await_summarise_url':
            return handleSummarise(message, chatId, userId, text);
        case 'await_viral_url':
            return handleViral(message, chatId, userId, text);
        case 'await_transcript_url':
            return handleTranscript(message, chatId, userId, text);
        case 'await_pinterest_url':
            return handleSocialDownload(message, chatId, userId, text, 'Pinterest');
        case 'await_instagram_url':
            return handleSocialDownload(message, chatId, userId, text, 'Instagram');
        case 'await_twitter_url':
            return handleSocialDownload(message, chatId, userId, text, 'Twitter');
        case 'await_clip_url':
            setState(chatId, { step: 'await_clip_times', data: { url: text } });
            return message.reply('Now send start and end time in seconds.\nExample: 30 90');
        case 'await_clip_times': {
            const parts = text.split(/\s+/);
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            if (isNaN(start) || isNaN(end)) {
                return message.reply('Please send valid times. Example: 30 90');
            }
            setState(chatId, { step: 'await_clip_ratio', data: { ...state.data, start, end } });
            return message.reply('Choose aspect ratio:\n1. original\n2. 9:16 (Shorts)\n3. 1:1 (Square)\n\nReply with: original, 9:16, or 1:1');
        }
        case 'await_clip_ratio': {
            const ratio = text.trim().toLowerCase();
            const validRatios = { 'original': 'original', '9:16': '9:16', '1:1': '1:1', '1': 'original', '2': '9:16', '3': '1:1' };
            const selectedRatio = validRatios[ratio] || 'original';
            return handleClip(message, chatId, userId, state.data.url, state.data.start, state.data.end, selectedRatio);
        }
        case 'await_quality': {
            const q = text.replace('p', '') + 'p';
            const valid = ['360p', '480p', '720p', '1080p'];
            if (valid.includes(q)) {
                updateUserSettings(userId, PLATFORM, { quality: q });
                return message.reply(`Quality set to ${q}.`);
            }
            return message.reply('Invalid quality. Choose: 360, 480, 720, 1080');
        }
        case 'await_song_choice': {
            const idx = parseInt(text) - 1;
            if (isNaN(idx) || idx < 0 || !state.data?.songs?.[idx]) {
                return message.reply('Invalid choice. Please try /song again.');
            }
            const song = state.data.songs[idx];
            return downloadAndSendSong(message, chatId, userId, song.id, song.title, song.artist);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
//  AUTO URL DETECT
// ─────────────────────────────────────────────────────────────────
async function handleAutoUrl(message, chatId, userId, url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        await message.reply('YouTube link detected. What do you want?\n/download ' + url + '\n/mp3 ' + url + '\n/summarise ' + url);
    } else if (url.includes('instagram.com')) {
        await handleSocialDownload(message, chatId, userId, url, 'Instagram');
    } else if (url.includes('pinterest.com') || url.includes('pin.it')) {
        await handleSocialDownload(message, chatId, userId, url, 'Pinterest');
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
        await handleSocialDownload(message, chatId, userId, url, 'Twitter');
    }
}

// ─────────────────────────────────────────────────────────────────
//  HELP
// ─────────────────────────────────────────────────────────────────
async function sendHelp(message) {
    const helpText = `*${branding.BOT_NAME}* — Media Downloader

*Download Commands:*
/download [url] — Download video
/mp3 [url] — Convert to MP3
/song [name] — Search & download song
/pinterest [url] — Pinterest download
/instagram [url] — Instagram download
/twitter [url] — Twitter download

*AI Tools:*
/summarise [url] — AI video summary
/viral [url] — Find viral 30s clip

*Clip Tool:*
/clip [url] [start] [end] — Cut a clip (max 60s)

*Transcript:*
/transcript [url] — Download subtitles

*Settings:*
/settings — View your settings
/quality [360/480/720/1080] — Set quality
/history — View download history
/clearhistory — Clear your history

/help — Show this message`;

    await message.reply(helpText);
}

// ─────────────────────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────────────────────
async function showSettings(message, chatId, userId) {
    const s = getUserSettings(userId, PLATFORM);
    const text = `*Your Settings*

Quality: ${s.quality}
History: ${s.history ? 'On' : 'Off'}

To change quality: /quality 720
To toggle history: send /history

*Contribute:*
GitHub: ${branding.GITHUB_URL}
Donate: ${branding.DONATE_URL}`;

    await message.reply(text);
}

// ─────────────────────────────────────────────────────────────────
//  HISTORY
// ─────────────────────────────────────────────────────────────────
async function showHistory(message, userId) {
    const history = getHistory(userId, PLATFORM);

    if (!history.length) {
        return message.reply('No download history yet.');
    }

    let text = '*Your Recent Downloads:*\n\n';
    history.slice(0, 10).forEach((h, i) => {
        text += `${i + 1}. ${h.title || 'Unknown'} (${h.type})\n`;
    });
    text += '\nTo clear: /clearhistory';

    await message.reply(text);
}

// ─────────────────────────────────────────────────────────────────
//  DOWNLOAD VIDEO
// ─────────────────────────────────────────────────────────────────
async function handleDownload(message, chatId, userId, url) {
    const settings = getUserSettings(userId, PLATFORM);
    const quality = settings.quality.replace('p', '') || '1080';

    const procMsg = await message.reply('Processing...');

    try {
        const { buffer, filename, size } = await api.downloadToBuffer(url, `${quality}p`, 'video');

        if (size > MAX_SIZE_BYTES) {
            await procMsg.delete().catch(() => { });
            await message.reply('File is too large to send. Please try a lower quality (/quality 480).');
            return;
        }

        const media = new MessageMedia(
            'video/mp4',
            buffer.toString('base64'),
            filename,
        );

        await procMsg.delete().catch(() => { });
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title: filename, type: 'video', url, size: api.formatBytes(size) });
    } catch (err) {
        console.error('[WA] Download error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  MP3
// ─────────────────────────────────────────────────────────────────
async function handleMp3(message, chatId, userId, url) {
    const procMsg = await message.reply('Processing...');

    try {
        const { buffer, filename, size } = await api.downloadToBuffer(url, 'best', 'audio');

        if (size > MAX_SIZE_BYTES) {
            await procMsg.delete().catch(() => { });
            await message.reply('File is too large to send.');
            return;
        }

        const safeFilename = filename.endsWith('.mp3') ? filename : filename + '.mp3';
        const media = new MessageMedia('audio/mpeg', buffer.toString('base64'), safeFilename);

        await procMsg.delete().catch(() => { });
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title: safeFilename, type: 'mp3', url, size: api.formatBytes(size) });
    } catch (err) {
        console.error('[WA] MP3 error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  SONG SEARCH
// ─────────────────────────────────────────────────────────────────
async function handleSongSearch(message, chatId, userId, query) {
    const procMsg = await message.reply('Processing...');

    try {
        const results = await api.searchMusic(query);
        await procMsg.delete().catch(() => { });

        if (!results.results?.length) {
            return message.reply('No songs found. Try a different search term.');
        }

        const songs = results.results.slice(0, 8);
        let text = `*Search: "${query}"*\n\nChoose a song (reply with number):\n\n`;
        songs.forEach((s, i) => {
            text += `${i + 1}. ${s.title.slice(0, 40)} — ${(s.artist || 'Unknown').slice(0, 25)} [${s.duration}]\n`;
        });

        setState(chatId, { step: 'await_song_choice', data: { songs } });
        await message.reply(text);
    } catch (err) {
        console.error('[WA] Song search error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

async function downloadAndSendSong(message, chatId, userId, id, title, artist) {
    const procMsg = await message.reply('Processing...');

    try {
        const { buffer, filename, size } = await api.downloadMusicToBuffer(id, title, artist);

        if (size > MAX_SIZE_BYTES) {
            await procMsg.delete().catch(() => { });
            return message.reply('File is too large to send.');
        }

        const media = new MessageMedia('audio/mpeg', buffer.toString('base64'), filename);
        await procMsg.delete().catch(() => { });
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title, type: 'song', size: api.formatBytes(size) });
    } catch (err) {
        console.error('[WA] Song download error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  SUMMARISE
// ─────────────────────────────────────────────────────────────────
async function handleSummarise(message, chatId, userId, url) {
    const procMsg = await message.reply('Processing...');

    try {
        const result = await api.summarizeVideo(url, 'brief');
        await procMsg.delete().catch(() => { });

        const text = `*${result.title || 'Summary'}*\nChannel: ${result.uploader || 'Unknown'}\n\n${result.summary || 'No summary available.'}`;

        // Split if too long (WhatsApp limit ~65535 chars)
        const chunks = splitText(text, 4000);
        for (const chunk of chunks) {
            await message.reply(chunk);
        }
    } catch (err) {
        console.error('[WA] Summarise error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  VIRAL CLIP
// ─────────────────────────────────────────────────────────────────
async function handleViral(message, chatId, userId, url) {
    const settings = getUserSettings(userId, PLATFORM);
    const procMsg = await message.reply('Processing...');

    try {
        const result = await api.findViralClip(url);
        await procMsg.delete().catch(() => { });

        const duration = result.endTime - result.startTime;
        const infoText = `*Viral Clip Found*\n\nVideo: ${result.title}\nTime: ${api.formatDuration(result.startTime)} - ${api.formatDuration(result.endTime)} (${duration}s)\n\nWhy it's viral:\n${result.reasoning}\n\nTo download this clip:\n/clip ${url} ${result.startTime} ${result.endTime}`;

        await message.reply(infoText);
    } catch (err) {
        console.error('[WA] Viral error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  CLIP
// ─────────────────────────────────────────────────────────────────
async function handleClip(message, chatId, userId, url, start, end, ratio) {
    const settings = getUserSettings(userId, PLATFORM);
    const quality = Math.min(parseInt(settings.quality) || 1080, 1080).toString();

    if (end - start > 60) {
        return message.reply('Maximum clip duration is 60 seconds.');
    }
    if (end <= start) {
        return message.reply('End time must be after start time.');
    }

    const procMsg = await message.reply('Processing...');

    try {
        const clipResult = await api.clipVideo(url, start, end, quality, ratio);
        let fileData;

        if (clipResult.jobId) {
            fileData = await api.waitAndDownloadClip(clipResult.jobId, 300000);
        } else {
            // Direct download returned from API
            fileData = clipResult;
        }

        await procMsg.delete().catch(() => { });

        if (fileData.size > MAX_SIZE_BYTES) {
            return message.reply('File is too large to send.');
        }

        const media = new MessageMedia('video/mp4', fileData.buffer.toString('base64'), fileData.filename);
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title: fileData.filename, type: 'clip', url });
    } catch (err) {
        console.error('[WA] Clip error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  TRANSCRIPT
// ─────────────────────────────────────────────────────────────────
async function handleTranscript(message, chatId, userId, url) {
    const procMsg = await message.reply('Processing...');

    try {
        const subInfo = await api.getSubtitlesList(url);

        if (!subInfo.subtitles?.length) {
            await procMsg.delete().catch(() => { });
            return message.reply('No subtitles found for this video.');
        }

        const best = subInfo.subtitles.find(s => s.code.startsWith('en')) || subInfo.subtitles[0];
        const { buffer, filename, size } = await api.downloadSubtitleToBuffer(url, best.code, 'srt');

        await procMsg.delete().catch(() => { });

        if (size > MAX_SIZE_BYTES) {
            return message.reply('Transcript file is too large.');
        }

        const media = new MessageMedia('text/plain', buffer.toString('base64'), filename);
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title: subInfo.title || 'Transcript', type: 'transcript', url });
    } catch (err) {
        console.error('[WA] Transcript error:', err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ─────────────────────────────────────────────────────────────────
//  SOCIAL DOWNLOAD
// ─────────────────────────────────────────────────────────────────
async function handleSocialDownload(message, chatId, userId, url, platform) {
    const settings = getUserSettings(userId, PLATFORM);
    const quality = settings.quality.replace('p', '') || '1080';

    const procMsg = await message.reply('Processing...');

    try {
        const { buffer, filename, size } = await api.downloadToBuffer(url, `${quality}p`, 'video');

        await procMsg.delete().catch(() => { });

        if (size > MAX_SIZE_BYTES) {
            return message.reply('File is too large to send.');
        }

        const media = new MessageMedia('video/mp4', buffer.toString('base64'), filename);
        await message.reply(media, undefined, { sendMediaAsDocument: true });

        addToHistory(userId, PLATFORM, { title: filename, type: 'media', url, size: api.formatBytes(size) });
    } catch (err) {
        console.error(`[WA] ${platform} download error:`, err.message);
        await procMsg.delete().catch(() => { });
        await message.reply('Failed.');
    }
}

// ── Utilities ──────────────────────────────────────────────────
function splitText(text, maxLen = 4000) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + maxLen));
        i += maxLen;
    }
    return chunks;
}

// ── Error handlers ─────────────────────────────────────────────
client.on('message_create', () => { }); // prevent unhandled error
process.on('unhandledRejection', (err) => console.error('[WA] Unhandled rejection:', err?.message || err));

// ── Initialize ─────────────────────────────────────────────────
console.log('[WA] Starting WhatsApp bot...');
client.initialize().catch((err) => {
    console.error('[WA] Failed to initialize:', err.message);
    process.exit(1);
});
