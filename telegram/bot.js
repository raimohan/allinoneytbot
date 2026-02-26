/**
 * ========================================================
 *  TELEGRAM BOT
 *  Full-featured bot using Grammy (latest Telegram Bot lib)
 * ========================================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Bot, InlineKeyboard, Keyboard, InputFile } = require('grammy');
const path = require('path');
const branding = require('../branding');
const api = require('../shared/api');
const { getUserSettings, updateUserSettings, addToHistory, getHistory, clearHistory } = require('../shared/settings');

const PLATFORM = 'telegram';
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// ── State Store (in-memory) ───────────────────────────────────
const userState = new Map(); // userId -> { step, data }
const pendingJobs = new Map(); // jobId -> { chatId, msgId }

function setState(userId, state) { userState.set(String(userId), state); }
function getState(userId) { return userState.get(String(userId)) || {}; }
function clearState(userId) { userState.delete(String(userId)); }

// ── Helper: delete message after delay ─────────────────────────
async function deleteAfter(ctx, messageId, ms = 3000) {
    setTimeout(async () => {
        try { await ctx.api.deleteMessage(ctx.chat.id, messageId); } catch (_) { }
    }, ms);
}

// ── Helper: Edit or send processing message ─────────────────────
async function sendProcessing(ctx, text) {
    return ctx.reply(text, { parse_mode: 'HTML' });
}

// ── Helper: Format file size ─────────────────────────────────────
const MB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ─────────────────────────────────────────────────────────────────
//  WELCOME & HELP
// ─────────────────────────────────────────────────────────────────
bot.command(['start', 'help'], async (ctx) => {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const helpText = `
<b>Welcome to ${branding.BOT_NAME}</b>

${branding.SHORT_DESCRIPTION}

<b>What I can do for you:</b>

<b>Video & Audio</b>
/download — Download a video from YouTube / Instagram / Twitter / Pinterest
/mp3 — Convert YouTube video to MP3
/song — Search and download a song by name

<b>AI Tools</b>
/summarise — Get an AI-generated summary of any YouTube video
/viral — Find the most viral 30-second clip in a video

<b>Clip Tools</b>
/clip — Cut a clip (up to 60 sec) with ratio & quality options

<b>More Downloads</b>
/transcript — Download subtitles / transcript from a YouTube video
/pinterest — Download Pinterest image or video
/instagram — Download Instagram post, reel, or story
/twitter — Download Twitter/X video

<b>Settings</b>
/settings — Quality, auto-delete, history & contribute

<b>Help</b>
/help — Show this message

Just send a link and I will detect it automatically!

<i>Powered by ${branding.AUTHOR_NAME}</i>
`;

    const keyboard = new InlineKeyboard()
        .text('⚙️ Settings', 'menu_settings')
        .text('📜 History', 'menu_history')
        .row()
        .url('🌐 Website', branding.WEBSITE_URL)
        .url('💬 Support', branding.TELEGRAM_CHANNEL);

    await ctx.reply(helpText, { parse_mode: 'HTML', reply_markup: keyboard });
});

// ─────────────────────────────────────────────────────────────────
//  SETTINGS COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('settings', async (ctx) => {
    await showSettings(ctx);
});

async function showSettings(ctx) {
    const userId = ctx.from.id.toString();
    const s = getUserSettings(userId, PLATFORM);

    const text = `<b>⚙️ Your Settings</b>

• <b>Video Quality:</b> ${s.quality}
• <b>Auto-Delete files:</b> ${s.autoDelete ? 'On' : 'Off'}
• <b>Download History:</b> ${s.history ? 'On' : 'Off'}`;

    const keyboard = new InlineKeyboard()
        .text('🎬 Quality', 'set_quality')
        .text(s.autoDelete ? '🗑 Auto-Delete: On' : '🗑 Auto-Delete: Off', 'toggle_autodelete')
        .row()
        .text(s.history ? '📋 History: On' : '📋 History: Off', 'toggle_history')
        .text('🤝 Contribute', 'show_contribute')
        .row()
        .text('❌ Close', 'close_menu');

    const msgFn = ctx.callbackQuery
        ? () => ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        : () => ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });

    await msgFn();
}

// Quality Selector
bot.callbackQuery('set_quality', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
        .text('4K', 'quality_2160p').text('1080p', 'quality_1080p').text('720p', 'quality_720p')
        .row()
        .text('480p', 'quality_480p').text('360p', 'quality_360p').text('144p', 'quality_144p')
        .row()
        .text('⬅️ Back', 'menu_settings');
    await ctx.editMessageText('<b>Choose your preferred video quality:</b>', { parse_mode: 'HTML', reply_markup: keyboard });
});

['2160p', '1080p', '720p', '480p', '360p', '144p'].forEach(q => {
    bot.callbackQuery(`quality_${q}`, async (ctx) => {
        await ctx.answerCallbackQuery(`Quality set to ${q}`);
        updateUserSettings(ctx.from.id.toString(), PLATFORM, { quality: q });
        await showSettings(ctx);
    });
});

bot.callbackQuery('toggle_autodelete', async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = getUserSettings(ctx.from.id.toString(), PLATFORM);
    updateUserSettings(ctx.from.id.toString(), PLATFORM, { autoDelete: !s.autoDelete });
    await showSettings(ctx);
});

bot.callbackQuery('toggle_history', async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = getUserSettings(ctx.from.id.toString(), PLATFORM);
    updateUserSettings(ctx.from.id.toString(), PLATFORM, { history: !s.history });
    await showSettings(ctx);
});

bot.callbackQuery('show_contribute', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`<b>🤝 Contribute to ${branding.BOT_NAME}</b>

Help us improve! You can:
• Star us on <a href="${branding.GITHUB_URL}">GitHub</a>
• Donate via <a href="${branding.DONATE_URL}">Buy Me a Coffee</a>
• Share with friends

<i>Built with love by <b>${branding.AUTHOR_NAME}</b></i>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
            .url('⭐ GitHub', branding.GITHUB_URL)
            .url('☕ Donate', branding.DONATE_URL)
            .row()
            .text('⬅️ Back', 'menu_settings'),
    });
});

bot.callbackQuery('menu_settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
});

bot.callbackQuery('close_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
});

// ─────────────────────────────────────────────────────────────────
//  HISTORY
// ─────────────────────────────────────────────────────────────────
bot.command('history', async (ctx) => {
    await showHistory(ctx);
});

bot.callbackQuery('menu_history', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHistory(ctx);
});

async function showHistory(ctx) {
    const userId = ctx.from.id.toString();
    const history = getHistory(userId, PLATFORM);

    if (!history.length) {
        const msg = await (ctx.callbackQuery
            ? ctx.editMessageText('No download history yet.')
            : ctx.reply('No download history yet.'));
        return;
    }

    let text = '<b>📋 Your Recent Downloads</b>\n\n';
    history.slice(0, 10).forEach((h, i) => {
        text += `${i + 1}. <b>${h.title || 'Unknown'}</b> — ${h.type || 'video'}\n`;
        text += `   <i>${new Date(h.timestamp).toLocaleString()}</i>\n\n`;
    });

    const keyboard = new InlineKeyboard()
        .text('🗑 Clear History', 'clear_history')
        .text('❌ Close', 'close_menu');

    const fn = ctx.callbackQuery
        ? () => ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        : () => ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });

    await fn();
}

bot.callbackQuery('clear_history', async (ctx) => {
    await ctx.answerCallbackQuery('History cleared');
    clearHistory(ctx.from.id.toString(), PLATFORM);
    await ctx.editMessageText('✅ Your download history has been cleared.');
});

// ─────────────────────────────────────────────────────────────────
//  DOWNLOAD COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('download', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_download_url' });
        return ctx.reply('Please send me the video URL (YouTube, Instagram, Twitter, etc.):');
    }
    await handleVideoDownload(ctx, url);
});

// ─────────────────────────────────────────────────────────────────
//  MP3 COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('mp3', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_mp3_url' });
        return ctx.reply('Send me a YouTube URL to convert to MP3:');
    }
    await handleMp3Download(ctx, url);
});

// ─────────────────────────────────────────────────────────────────
//  SONG COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('song', async (ctx) => {
    const songName = ctx.match?.trim();
    if (!songName) {
        setState(ctx.from.id.toString(), { step: 'await_song_name' });
        return ctx.reply('What song would you like to download? Send the song name:');
    }
    await handleSongSearch(ctx, songName);
});

// ─────────────────────────────────────────────────────────────────
//  SUMMARISE COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('summarise', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_summarise_url' });
        return ctx.reply('Send me a YouTube video URL to summarize:');
    }
    await handleSummarise(ctx, url);
});

// ─────────────────────────────────────────────────────────────────
//  VIRAL COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('viral', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_viral_url' });
        return ctx.reply('Send me a YouTube URL and I will find the most viral 30-second clip:');
    }
    await handleViralClip(ctx, url);
});

// ─────────────────────────────────────────────────────────────────
//  CLIP COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('clip', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_clip_url' });
        return ctx.reply('Send me the video URL you want to clip:');
    }
    setState(ctx.from.id.toString(), { step: 'await_clip_times', data: { url } });
    await ctx.reply('Now send the start and end time (in seconds).\nExample: <code>30 90</code>', { parse_mode: 'HTML' });
});

// ─────────────────────────────────────────────────────────────────
//  TRANSCRIPT COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('transcript', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_transcript_url' });
        return ctx.reply('Send me the YouTube URL to download the transcript/subtitles:');
    }
    await handleTranscript(ctx, url);
});

// ─────────────────────────────────────────────────────────────────
//  SOCIAL DOWNLOAD COMMANDS
// ─────────────────────────────────────────────────────────────────
bot.command('pinterest', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_pinterest_url' });
        return ctx.reply('Send me a Pinterest URL:');
    }
    await handleSocialDownload(ctx, url, 'Pinterest');
});

bot.command('instagram', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_instagram_url' });
        return ctx.reply('Send me an Instagram URL:');
    }
    await handleSocialDownload(ctx, url, 'Instagram');
});

bot.command('twitter', async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        setState(ctx.from.id.toString(), { step: 'await_twitter_url' });
        return ctx.reply('Send me a Twitter/X URL:');
    }
    await handleSocialDownload(ctx, url, 'Twitter');
});

// ─────────────────────────────────────────────────────────────────
//  AI COMMAND
// ─────────────────────────────────────────────────────────────────
bot.command('ai', async (ctx) => {
    const question = ctx.match?.trim();
    if (!question) {
        setState(ctx.from.id.toString(), { step: 'await_ai_question' });
        return ctx.reply('What would you like to ask the AI?');
    }
    await handleAiChat(ctx, question);
});

// ─────────────────────────────────────────────────────────────────
//  AUTO-DETECT URLS IN MESSAGES
// ─────────────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id.toString();
    const state = getState(userId);

    // State machine
    if (state.step) {
        switch (state.step) {
            case 'await_download_url':
                clearState(userId);
                return handleVideoDownload(ctx, text);
            case 'await_mp3_url':
                clearState(userId);
                return handleMp3Download(ctx, text);
            case 'await_song_name':
                clearState(userId);
                return handleSongSearch(ctx, text);
            case 'await_summarise_url':
                clearState(userId);
                return handleSummarise(ctx, text);
            case 'await_viral_url':
                clearState(userId);
                return handleViralClip(ctx, text);
            case 'await_transcript_url':
                clearState(userId);
                return handleTranscript(ctx, text);
            case 'await_pinterest_url':
                clearState(userId);
                return handleSocialDownload(ctx, text, 'Pinterest');
            case 'await_instagram_url':
                clearState(userId);
                return handleSocialDownload(ctx, text, 'Instagram');
            case 'await_twitter_url':
                clearState(userId);
                return handleSocialDownload(ctx, text, 'Twitter');
            case 'await_clip_url':
                setState(userId, { step: 'await_clip_times', data: { url: text } });
                return ctx.reply('Now send start and end time in seconds.\nExample: <code>30 90</code>', { parse_mode: 'HTML' });
            case 'await_clip_times': {
                const parts = text.split(/\s+/);
                const start = parseInt(parts[0]);
                const end = parseInt(parts[1]);
                if (isNaN(start) || isNaN(end) || end <= start) {
                    return ctx.reply('Please send valid start and end times.\nExample: <code>30 90</code>', { parse_mode: 'HTML' });
                }
                const clipData = { ...state.data, startSec: start, endSec: end };
                setState(userId, { step: 'await_clip_config', data: clipData });
                return showClipOptions(ctx, clipData);
            }
            case 'await_ai_question':
                clearState(userId);
                return handleAiChat(ctx, text);
        }
    }

    // Auto-detect URL
    const urlPattern = /https?:\/\/[^\s]+/i;
    if (urlPattern.test(text)) {
        const url = text.match(urlPattern)[0];
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Show options for YouTube
            return showYTOptions(ctx, url);
        } else if (url.includes('instagram.com')) {
            return handleSocialDownload(ctx, url, 'Instagram');
        } else if (url.includes('pinterest.com') || url.includes('pin.it')) {
            return handleSocialDownload(ctx, url, 'Pinterest');
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            return handleSocialDownload(ctx, url, 'Twitter');
        } else {
            return handleVideoDownload(ctx, url);
        }
    }
});

// ── Show YouTube options inline ────────────────────────────────
async function showYTOptions(ctx, url) {
    const keyboard = new InlineKeyboard()
        .text('🎬 Download Video', `yt_video:${url}`)
        .row()
        .text('🎵 Convert to MP3', `yt_mp3:${url}`)
        .row()
        .text('📝 Summarize', `yt_sum:${url}`)
        .text('📊 Find Viral Clip', `yt_viral:${url}`)
        .row()
        .text('📄 Transcript', `yt_transcript:${url}`);

    await ctx.reply(`Detected YouTube link. What would you like to do?`, {
        reply_markup: keyboard,
    });
}

bot.callbackQuery(/^yt_video:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    await handleVideoDownload(ctx, ctx.match[1]);
});

bot.callbackQuery(/^yt_mp3:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    await handleMp3Download(ctx, ctx.match[1]);
});

bot.callbackQuery(/^yt_sum:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    await handleSummarise(ctx, ctx.match[1]);
});

bot.callbackQuery(/^yt_viral:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    await handleViralClip(ctx, ctx.match[1]);
});

bot.callbackQuery(/^yt_transcript:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    await handleTranscript(ctx, ctx.match[1]);
});

// ─────────────────────────────────────────────────────────────────
//  HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────────

async function handleVideoDownload(ctx, url) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const procMsg = await ctx.reply('Analyzing your link, please hold on...');

    try {
        const info = await api.analyzeUrl(url);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (!info.formats || info.formats.length === 0) {
            return ctx.reply('No downloadable formats found for this URL.');
        }

        // Build quality keyboard
        const keyboard = new InlineKeyboard();
        info.formats.slice(0, 8).forEach((f, i) => {
            if (i % 2 === 0) keyboard.row();
            keyboard.text(f.resolution, `dl_video:${url}:${f.resolution}`);
        });
        keyboard.row().text('❌ Cancel', 'close_menu');

        await ctx.reply(
            `<b>${info.title || 'Video'}</b>\n\nChoose quality to download:`,
            { parse_mode: 'HTML', reply_markup: keyboard }
        );
    } catch (err) {
        console.error('[TG] Download analyze error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not analyze the URL. Please check the link and try again.');
    }
}

bot.callbackQuery(/^dl_video:(.+):(.+)$/, async (ctx) => {
    const url = ctx.match[1];
    const resolution = ctx.match[2];
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    await ctx.answerCallbackQuery('Starting download...');
    await ctx.deleteMessage().catch(() => { });

    const procMsg = await ctx.reply(`Downloading at ${resolution}, this might take a moment...`);

    try {
        const { buffer, filename, size } = await api.downloadToBuffer(url, resolution, 'video');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (api.isFileTooLarge(size, 2000)) {
            return ctx.reply(`The file is too large to send via Telegram (${api.formatBytes(size)}). Please try a lower quality.`);
        }

        const sentMsg = await ctx.replyWithDocument(new InputFile(buffer, filename), {
            caption: `<b>${filename.replace(/\.[^.]+$/, '')}</b>\nQuality: ${resolution} · ${api.formatBytes(size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title: filename, type: 'video', url, size: api.formatBytes(size) });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error('[TG] Video download error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Download failed. The file may be too large or unavailable. Try a lower quality.');
    }
});

async function handleMp3Download(ctx, url) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const procMsg = await ctx.reply('Extracting audio, this may take a moment...');

    try {
        // Get title first
        let titleText = 'Audio';
        try {
            const meta = await api.getMetadata(url);
            titleText = meta.title || 'Audio';
        } catch (_) { }

        const { buffer, filename, size } = await api.downloadToBuffer(url, 'best', 'audio');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (api.isFileTooLarge(size, 2000)) {
            return ctx.reply(`The audio file is too large to send (${api.formatBytes(size)}).`);
        }

        const safeFilename = filename.endsWith('.mp3') ? filename : `${titleText}.mp3`;

        const sentMsg = await ctx.replyWithDocument(new InputFile(buffer, safeFilename), {
            caption: `<b>${safeFilename.replace('.mp3', '')}</b>\nFormat: MP3 · ${api.formatBytes(size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title: safeFilename, type: 'mp3', url, size: api.formatBytes(size) });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error('[TG] MP3 error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not convert to MP3. Please check the URL and try again.');
    }
}

async function handleSongSearch(ctx, query) {
    const procMsg = await ctx.reply(`Searching for "${query}"...`);

    try {
        const results = await api.searchMusic(query);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (!results.results || results.results.length === 0) {
            return ctx.reply('No songs found. Try a different search term.');
        }

        const keyboard = new InlineKeyboard();
        results.results.slice(0, 8).forEach((song, i) => {
            keyboard.row().text(
                `${i + 1}. ${song.title.slice(0, 35)} — ${(song.artist || '').slice(0, 20)} [${song.duration}]`,
                `song_dl:${song.id}:${encodeURIComponent(song.title.slice(0, 50))}:${encodeURIComponent((song.artist || '').slice(0, 30))}`
            );
        });
        keyboard.row().text('❌ Cancel', 'close_menu');

        await ctx.reply(`Found ${results.results.length} results for "${query}":\nChoose a song to download:`, {
            reply_markup: keyboard,
        });
    } catch (err) {
        console.error('[TG] Song search error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Song search failed. Please try again.');
    }
}

bot.callbackQuery(/^song_dl:([^:]+):([^:]+):(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const title = decodeURIComponent(ctx.match[2]);
    const artist = decodeURIComponent(ctx.match[3]);
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    await ctx.answerCallbackQuery('Downloading song...');
    await ctx.deleteMessage().catch(() => { });

    const procMsg = await ctx.reply(`Downloading "${title}" by ${artist}...`);

    try {
        const { buffer, filename, size } = await api.downloadMusicToBuffer(id, title, artist);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        const sentMsg = await ctx.replyWithDocument(new InputFile(buffer, filename), {
            caption: `<b>${title}</b>\nArtist: ${artist}\nFormat: MP3 · ${api.formatBytes(size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title, type: 'song', size: api.formatBytes(size) });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error('[TG] Song download error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not download this song. Please try another.');
    }
});

async function handleSummarise(ctx, url) {
    const procMsg = await ctx.reply('Fetching transcript and generating AI summary, this may take up to 30 seconds...');

    try {
        const summary = await api.summarizeVideo(url, 'detailed');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        const text = `<b>${summary.title}</b>\nChannel: ${summary.uploader}\n\n${summary.summary}`;

        // Split if too long
        const chunks = splitText(text, 4000);
        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'HTML' });
        }
    } catch (err) {
        console.error('[TG] Summarise error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not summarize this video. Make sure it has subtitles enabled.');
    }
}

async function handleViralClip(ctx, url) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const procMsg = await ctx.reply('Analyzing video for the most viral moment...');

    try {
        const result = await api.findViralClip(url);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        const duration = result.endTime - result.startTime;
        const text = `<b>Found a Viral Clip</b>\n\nVideo: <b>${result.title}</b>\nTime: ${api.formatDuration(result.startTime)} — ${api.formatDuration(result.endTime)} (${duration}s)\n\nWhy it's viral:\n${result.reasoning}`;

        const keyboard = new InlineKeyboard()
            .text('⬇️ Download This Clip', `clip_viral:${url}:${result.startTime}:${result.endTime}`)
            .row()
            .text('🔍 Find Another', `yt_viral:${url}`);

        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
        console.error('[TG] Viral clip error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not analyze this video. Make sure it has subtitles and is at least 30 seconds long.');
    }
}

bot.callbackQuery(/^clip_viral:(.+):(\d+):(\d+)$/, async (ctx) => {
    const url = ctx.match[1];
    const start = parseInt(ctx.match[2]);
    const end = parseInt(ctx.match[3]);
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    await ctx.answerCallbackQuery('Processing clip...');
    await ctx.deleteMessage().catch(() => { });

    await downloadAndSendClip(ctx, url, start, end, settings.quality.replace('p', ''), 'original');
});

async function showClipOptions(ctx, clipData) {
    const keyboard = new InlineKeyboard()
        .text('📐 Original', `clip_ratio:original:${clipData.url}:${clipData.startSec}:${clipData.endSec}`)
        .text('📱 9:16 Shorts', `clip_ratio:9:16:${clipData.url}:${clipData.startSec}:${clipData.endSec}`)
        .text('⬛ 1:1 Square', `clip_ratio:1:1:${clipData.url}:${clipData.startSec}:${clipData.endSec}`)
        .row()
        .text('❌ Cancel', 'close_menu');

    await ctx.reply(
        `Choose ratio for your clip (${clipData.startSec}s — ${clipData.endSec}s):`,
        { reply_markup: keyboard }
    );
}

bot.callbackQuery(/^clip_ratio:([^:]+):(.+):(\d+):(\d+)$/, async (ctx) => {
    const ratio = ctx.match[1];
    const url = ctx.match[2];
    const start = parseInt(ctx.match[3]);
    const end = parseInt(ctx.match[4]);
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    await ctx.answerCallbackQuery('Starting clip...');
    await ctx.deleteMessage().catch(() => { });

    const quality = settings.quality.replace('p', '') || '720';
    await downloadAndSendClip(ctx, url, start, end, quality, ratio);
});

async function downloadAndSendClip(ctx, url, start, end, quality, ratio) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    if (end - start > 60) {
        return ctx.reply('Maximum clip duration is 60 seconds. Please choose a shorter range.');
    }

    const procMsg = await ctx.reply(`Processing clip (${start}s — ${end}s)...`);

    try {
        const clipResult = await api.clipVideo(url, start, end, quality, ratio);
        let fileData;

        if (clipResult.jobId) {
            // Update message to show progress
            await ctx.api.editMessageText(ctx.chat.id, procMsg.message_id, 'Processing clip with ratio conversion, please wait...');
            fileData = await api.waitAndDownloadClip(clipResult.jobId, 300000);
        } else {
            // Direct download URL returned
            const params = new URLSearchParams({ url, start, end, quality, ratio });
            const res = await fetch(`${api.BACKEND_URL}/api/clip?${params}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            const cd = res.headers.get('content-disposition') || '';
            const nm = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
            fileData = { buffer, filename: nm ? decodeURIComponent(nm[1]) : `clip_${Date.now()}.mp4`, size: buffer.length };
        }

        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (api.isFileTooLarge(fileData.size, 2000)) {
            return ctx.reply(`Clip is too large to send (${api.formatBytes(fileData.size)}). Try a lower quality.`);
        }

        const sentMsg = await ctx.replyWithDocument(new InputFile(fileData.buffer, fileData.filename), {
            caption: `<b>Clip</b>: ${start}s — ${end}s · ${ratio} · ${api.formatBytes(fileData.size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title: fileData.filename, type: 'clip', url });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error('[TG] Clip error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Clip processing failed. Please try again with different settings.');
    }
}

async function handleTranscript(ctx, url) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const procMsg = await ctx.reply('Fetching subtitles list...');

    try {
        const subInfo = await api.getSubtitlesList(url);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        if (!subInfo.subtitles || subInfo.subtitles.length === 0) {
            return ctx.reply('No subtitles found for this video.');
        }

        // Show first available language (auto-detect best)
        const best = subInfo.subtitles.find(s => s.code.startsWith('en')) || subInfo.subtitles[0];

        const procMsg2 = await ctx.reply(`Downloading ${best.name} transcript...`);

        const { buffer, filename, size } = await api.downloadSubtitleToBuffer(url, best.code, 'srt');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg2.message_id).catch(() => { });

        const sentMsg = await ctx.replyWithDocument(new InputFile(buffer, filename), {
            caption: `<b>${subInfo.title}</b>\nLanguage: ${best.name}\nFormat: SRT · ${api.formatBytes(size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title: subInfo.title, type: 'transcript', url });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error('[TG] Transcript error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('Could not download transcript. The video may not have subtitles.');
    }
}

async function handleSocialDownload(ctx, url, platform) {
    const userId = ctx.from.id.toString();
    const settings = getUserSettings(userId, PLATFORM);

    const procMsg = await ctx.reply(`Fetching ${platform} content, please wait...`);

    try {
        const info = await api.analyzeUrl(url);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        const resolution = settings.quality.replace('p', '');
        const procMsg2 = await ctx.reply(`Downloading at best available quality...`);

        const { buffer, filename, size } = await api.downloadToBuffer(url, resolution, 'video');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg2.message_id).catch(() => { });

        if (api.isFileTooLarge(size, 2000)) {
            return ctx.reply(`This file is too large to send via Telegram (${api.formatBytes(size)}).`);
        }

        const sentMsg = await ctx.replyWithDocument(new InputFile(buffer, filename), {
            caption: `<b>${info.title || platform + ' Content'}</b>\nSource: ${platform} · ${api.formatBytes(size)}`,
            parse_mode: 'HTML',
        });

        addToHistory(userId, PLATFORM, { title: info.title || platform, type: 'media', url, size: api.formatBytes(size) });

        if (settings.autoDelete) {
            setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => { }), 60000);
        }
    } catch (err) {
        console.error(`[TG] ${platform} download error:`, err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply(`Could not download from ${platform}. Make sure the URL is correct and the content is public.`);
    }
}

async function handleAiChat(ctx, question) {
    const procMsg = await ctx.reply('Thinking...');

    try {
        const result = await api.aiChat([{ role: 'user', content: question }], 'General assistant');
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });

        const chunks = splitText(result.response || 'No response.', 4000);
        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'HTML' });
        }
    } catch (err) {
        console.error('[TG] AI chat error:', err.message);
        await ctx.api.deleteMessage(ctx.chat.id, procMsg.message_id).catch(() => { });
        await ctx.reply('AI is currently unavailable. Please try again later.');
    }
}

// ── Utilities ─────────────────────────────────────────────────
function splitText(text, maxLen = 4096) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + maxLen));
        i += maxLen;
    }
    return chunks;
}

// ── Error handler ──────────────────────────────────────────────
bot.catch((err) => {
    console.error('[TG] Bot error:', err.error?.message || err.message || err);
});

// ── Start ──────────────────────────────────────────────────────
bot.start({
    onStart: () => console.log(`[TG] ${branding.BOT_NAME} Telegram bot is running`),
});
