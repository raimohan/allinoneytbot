/**
 * ========================================================
 *  DISCORD BOT
 *  Uses discord.js v14 with slash commands + embeds
 * ========================================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, AttachmentBuilder, InteractionType,
    PermissionFlagsBits, Collection,
} = require('discord.js');

const path = require('path');
const branding = require('../branding');
const api = require('../shared/api');
const { getUserSettings, updateUserSettings, addToHistory, getHistory, clearHistory } = require('../shared/settings');

const PLATFORM = 'discord';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ── State store for multi-step interactions ────────────────────
const userState = new Map();
function setState(userId, state) { userState.set(String(userId), state); }
function getState(userId) { return userState.get(String(userId)) || {}; }
function clearState(userId) { userState.delete(String(userId)); }

// ── Slash Command Definitions ──────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription(`Show all commands for ${branding.BOT_NAME}`),

    new SlashCommandBuilder()
        .setName('download')
        .setDescription('Download a video from YouTube, Instagram, Twitter, or Pinterest')
        .addStringOption(o => o.setName('url').setDescription('Video URL').setRequired(true))
        .addStringOption(o => o.setName('quality').setDescription('Video quality').setRequired(false)
            .addChoices(
                { name: '4K (2160p)', value: '2160' },
                { name: '1080p (Full HD)', value: '1080' },
                { name: '720p (HD)', value: '720' },
                { name: '480p', value: '480' },
                { name: '360p', value: '360' },
            )),

    new SlashCommandBuilder()
        .setName('mp3')
        .setDescription('Download a YouTube video as MP3')
        .addStringOption(o => o.setName('url').setDescription('YouTube URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('song')
        .setDescription('Search and download a song by name')
        .addStringOption(o => o.setName('name').setDescription('Song name or artist').setRequired(true)),

    new SlashCommandBuilder()
        .setName('summarise')
        .setDescription('Get an AI summary of a YouTube video')
        .addStringOption(o => o.setName('url').setDescription('YouTube URL').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Summary type').setRequired(false)
            .addChoices(
                { name: 'Brief', value: 'brief' },
                { name: 'Detailed', value: 'detailed' },
                { name: 'Key Points', value: 'keypoints' },
                { name: 'Chapter Breakdown', value: 'chapters' },
            )),

    new SlashCommandBuilder()
        .setName('viral')
        .setDescription('Find the most viral 30-second clip in a YouTube video')
        .addStringOption(o => o.setName('url').setDescription('YouTube URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clip')
        .setDescription('Cut a clip from a video (max 60 seconds)')
        .addStringOption(o => o.setName('url').setDescription('Video URL').setRequired(true))
        .addIntegerOption(o => o.setName('start').setDescription('Start time in seconds').setRequired(true))
        .addIntegerOption(o => o.setName('end').setDescription('End time in seconds').setRequired(true))
        .addStringOption(o => o.setName('quality').setDescription('Video quality').setRequired(false)
            .addChoices(
                { name: '1080p', value: '1080' },
                { name: '720p', value: '720' },
                { name: '480p', value: '480' },
                { name: '360p', value: '360' },
            ))
        .addStringOption(o => o.setName('ratio').setDescription('Aspect ratio').setRequired(false)
            .addChoices(
                { name: 'Original', value: 'original' },
                { name: '9:16 (Shorts/Reels)', value: '9:16' },
                { name: '1:1 (Square)', value: '1:1' },
            )),

    new SlashCommandBuilder()
        .setName('transcript')
        .setDescription('Download transcript/subtitles from a YouTube video')
        .addStringOption(o => o.setName('url').setDescription('YouTube URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('pinterest')
        .setDescription('Download Pinterest image or video')
        .addStringOption(o => o.setName('url').setDescription('Pinterest URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('instagram')
        .setDescription('Download Instagram post, reel, or story')
        .addStringOption(o => o.setName('url').setDescription('Instagram URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('twitter')
        .setDescription('Download Twitter/X video')
        .addStringOption(o => o.setName('url').setDescription('Twitter/X URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View and change your preferences'),

    new SlashCommandBuilder()
        .setName('history')
        .setDescription('View your recent downloads'),

    new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Ask AI a question')
        .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
];

// ── Register Slash Commands ─────────────────────────────────────
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('[DC] Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
        console.log('[DC] Slash commands registered.');
    } catch (err) {
        console.error('[DC] Command registration failed:', err.message);
    }
}

// ── Embed Builders ─────────────────────────────────────────────
function buildEmbed(title, description, color = branding.COLOR_PRIMARY) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: `${branding.BOT_NAME} by ${branding.AUTHOR_NAME}` })
        .setTimestamp();
}

function buildSuccessEmbed(title, description) {
    return buildEmbed(title, description, branding.COLOR_SUCCESS);
}

function buildErrorEmbed(description) {
    return buildEmbed('Something went wrong', description, branding.COLOR_ERROR);
}

function buildInfoEmbed(title, description) {
    return buildEmbed(title, description, branding.COLOR_INFO);
}

// ── Interaction Handler ────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    } catch (err) {
        console.error('[DC] Interaction error:', err.message);
        const errEmbed = buildErrorEmbed('An unexpected error occurred. Please try again.');
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errEmbed], components: [] });
            } else {
                await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
        } catch (_) { }
    }
});

async function handleCommand(interaction) {
    const { commandName, user, options } = interaction;
    const userId = user.id;
    const settings = getUserSettings(userId, PLATFORM);

    switch (commandName) {
        case 'help':
            await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
            break;

        case 'download':
            await handleDownload(interaction);
            break;

        case 'mp3':
            await handleMp3(interaction);
            break;

        case 'song':
            await handleSong(interaction);
            break;

        case 'summarise':
            await handleSummarise(interaction);
            break;

        case 'viral':
            await handleViral(interaction);
            break;

        case 'clip':
            await handleClip(interaction);
            break;

        case 'transcript':
            await handleTranscript(interaction);
            break;

        case 'pinterest':
        case 'instagram':
        case 'twitter': {
            const url = options.getString('url');
            await handleSocialDownload(interaction, url, commandName);
            break;
        }

        case 'settings':
            await handleSettings(interaction);
            break;

        case 'history':
            await handleHistory(interaction);
            break;

        case 'ai':
            await handleAi(interaction);
            break;
    }
}

// ─────────────────────────────────────────────────────────────────
//  HELP EMBED
// ─────────────────────────────────────────────────────────────────
function buildHelpEmbed() {
    return new EmbedBuilder()
        .setTitle(`${branding.BOT_NAME} — Command Reference`)
        .setDescription(branding.SHORT_DESCRIPTION)
        .setColor(branding.COLOR_PRIMARY)
        .addFields(
            { name: '📥 Downloads', value: '`/download` `/mp3` `/song` `/pinterest` `/instagram` `/twitter`', inline: false },
            { name: '🤖 AI Tools', value: '`/summarise` `/viral` `/ai`', inline: false },
            { name: '✂️ Clip Tools', value: '`/clip`', inline: false },
            { name: '📝 Extras', value: '`/transcript` `/history` `/settings`', inline: false },
        )
        .setFooter({ text: `Author: ${branding.AUTHOR_NAME} · ${branding.WEBSITE_URL}` })
        .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────────────────────
async function handleSettings(interaction) {
    const userId = interaction.user.id;
    const s = getUserSettings(userId, PLATFORM);

    const embed = buildInfoEmbed('⚙️ Your Settings', `**Video Quality:** ${s.quality}\n**Auto-Delete:** ${s.autoDelete ? 'On' : 'Off'}\n**History:** ${s.history ? 'On' : 'Off'}`);

    const qualityMenu = new StringSelectMenuBuilder()
        .setCustomId('settings_quality')
        .setPlaceholder('Select video quality')
        .addOptions(
            { label: '4K (2160p)', value: '2160p' },
            { label: '1080p (Full HD)', value: '1080p' },
            { label: '720p (HD)', value: '720p' },
            { label: '480p', value: '480p' },
            { label: '360p', value: '360p' },
        );

    const row1 = new ActionRowBuilder().addComponents(qualityMenu);

    const toggleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('settings_toggle_autodelete').setLabel(s.autoDelete ? '🗑 Auto-Delete: On' : '🗑 Auto-Delete: Off').setStyle(s.autoDelete ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('settings_toggle_history').setLabel(s.history ? '📋 History: On' : '📋 History: Off').setStyle(s.history ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('settings_contribute').setLabel('🤝 Contribute').setStyle(ButtonStyle.Link).setURL(branding.GITHUB_URL),
    );

    await interaction.reply({ embeds: [embed], components: [row1, toggleRow], ephemeral: true });
}

// ─────────────────────────────────────────────────────────────────
//  HISTORY
// ─────────────────────────────────────────────────────────────────
async function handleHistory(interaction) {
    const userId = interaction.user.id;
    const history = getHistory(userId, PLATFORM);

    if (!history.length) {
        return interaction.reply({ embeds: [buildInfoEmbed('Download History', 'No downloads found yet.')], ephemeral: true });
    }

    let desc = '';
    history.slice(0, 10).forEach((h, i) => {
        desc += `**${i + 1}.** ${h.title || 'Unknown'} · \`${h.type}\`\n_${new Date(h.timestamp).toLocaleString()}_\n\n`;
    });

    const clearBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('history_clear').setLabel('🗑 Clear History').setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({ embeds: [buildInfoEmbed('📋 Your Recent Downloads', desc)], components: [clearBtn], ephemeral: true });
}

// ─────────────────────────────────────────────────────────────────
//  DOWNLOAD
// ─────────────────────────────────────────────────────────────────
async function handleDownload(interaction) {
    const url = interaction.options.getString('url');
    const qualityOpt = interaction.options.getString('quality');
    const userId = interaction.user.id;
    const settings = getUserSettings(userId, PLATFORM);
    const quality = qualityOpt || settings.quality.replace('p', '') || '1080';

    await interaction.deferReply();

    try {
        const progressEmbed = buildInfoEmbed('Preparing Download', 'Analyzing your link...');
        await interaction.editReply({ embeds: [progressEmbed] });

        const info = await api.analyzeUrl(url);

        const progressEmbed2 = buildInfoEmbed('Downloading', `Fetching **${info.title}** at ${quality}p...`);
        progressEmbed2.setThumbnail(info.thumbnail);
        await interaction.editReply({ embeds: [progressEmbed2] });

        const { buffer, filename, size } = await api.downloadToBuffer(url, `${quality}p`, 'video');

        if (api.isFileTooLarge(size, 25)) {
            const embed = buildErrorEmbed(`File is too large to upload (${api.formatBytes(size)}). Discord supports up to 25 MB. Try a lower quality.`);
            return interaction.editReply({ embeds: [embed], components: [] });
        }

        const attachment = new AttachmentBuilder(buffer, { name: filename });
        const embed = buildSuccessEmbed(info.title || 'Video Downloaded', `Quality: ${quality}p · Size: ${api.formatBytes(size)}`);
        embed.setThumbnail(info.thumbnail);
        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

        addToHistory(userId, PLATFORM, { title: info.title, type: 'video', url, size: api.formatBytes(size) });

        if (settings.autoDelete) {
            setTimeout(async () => {
                try { await interaction.deleteReply(); } catch (_) { }
            }, 60000);
        }
    } catch (err) {
        console.error('[DC] Download error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Download failed. Check the URL and try a lower quality.')], components: [] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  MP3
// ─────────────────────────────────────────────────────────────────
async function handleMp3(interaction) {
    const url = interaction.options.getString('url');
    const userId = interaction.user.id;
    const settings = getUserSettings(userId, PLATFORM);

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Converting to MP3', 'Extracting audio...')] });

        const { buffer, filename, size } = await api.downloadToBuffer(url, 'best', 'audio');

        if (api.isFileTooLarge(size, 25)) {
            return interaction.editReply({ embeds: [buildErrorEmbed(`Audio file too large (${api.formatBytes(size)}). Discord supports up to 25 MB.`)] });
        }

        const attachment = new AttachmentBuilder(buffer, { name: filename.endsWith('.mp3') ? filename : filename + '.mp3' });
        const embed = buildSuccessEmbed('MP3 Ready', `Format: MP3 · Size: ${api.formatBytes(size)}`);
        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

        addToHistory(userId, PLATFORM, { title: filename, type: 'mp3', url, size: api.formatBytes(size) });
    } catch (err) {
        console.error('[DC] MP3 error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('MP3 conversion failed.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  SONG SEARCH
// ─────────────────────────────────────────────────────────────────
async function handleSong(interaction) {
    const query = interaction.options.getString('name');
    const userId = interaction.user.id;
    const settings = getUserSettings(userId, PLATFORM);

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Searching', `Looking for "${query}"...`)] });

        const results = await api.searchMusic(query);

        if (!results.results?.length) {
            return interaction.editReply({ embeds: [buildErrorEmbed('No songs found. Try a different search.')] });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('song_select')
            .setPlaceholder('Choose a song to download')
            .addOptions(
                results.results.slice(0, 10).map((s, i) => ({
                    label: `${i + 1}. ${s.title.slice(0, 50)}`,
                    description: `${(s.artist || '').slice(0, 50)} · ${s.duration}`,
                    value: `${s.id}|||${s.title.slice(0, 50)}|||${(s.artist || '').slice(0, 30)}`,
                }))
            );

        const row = new ActionRowBuilder().addComponents(menu);

        let desc = '';
        results.results.slice(0, 10).forEach((s, i) => {
            desc += `**${i + 1}.** ${s.title.slice(0, 45)} — _${(s.artist || 'Unknown').slice(0, 30)}_ \`[${s.duration}]\`\n`;
        });

        await interaction.editReply({
            embeds: [buildInfoEmbed(`Search: "${query}"`, desc)],
            components: [row],
        });
    } catch (err) {
        console.error('[DC] Song search error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Song search failed.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  SUMMARISE
// ─────────────────────────────────────────────────────────────────
async function handleSummarise(interaction) {
    const url = interaction.options.getString('url');
    const type = interaction.options.getString('type') || 'detailed';

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Summarizing', 'Fetching transcript and generating AI summary...')] });

        const result = await api.summarizeVideo(url, type);
        const embed = new EmbedBuilder()
            .setTitle(result.title || 'Video Summary')
            .setDescription((result.summary || '').slice(0, 4096))
            .setColor(branding.COLOR_INFO)
            .addFields({ name: 'Channel', value: result.uploader || 'Unknown', inline: true })
            .setThumbnail(result.thumbnail)
            .setFooter({ text: `Summary type: ${type} · ${branding.BOT_NAME}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
        console.error('[DC] Summarise error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Could not summarize. Make sure the video has subtitles.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  VIRAL CLIP
// ─────────────────────────────────────────────────────────────────
async function handleViral(interaction) {
    const url = interaction.options.getString('url');
    const userId = interaction.user.id;

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Analyzing', 'Finding the most viral moment...')] });

        const result = await api.findViralClip(url);
        const duration = result.endTime - result.startTime;

        const embed = new EmbedBuilder()
            .setTitle('Found a Viral Clip')
            .setDescription(`**${result.title}**\n\n**Timeframe:** ${api.formatDuration(result.startTime)} — ${api.formatDuration(result.endTime)} (${duration}s)\n\n**Why it's viral:**\n${result.reasoning}`)
            .setColor(branding.COLOR_SUCCESS)
            .setThumbnail(result.thumbnail)
            .setFooter({ text: branding.BOT_NAME })
            .setTimestamp();

        const downloadBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`viral_download:${url}:${result.startTime}:${result.endTime}`)
                .setLabel('⬇️ Download This Clip')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`viral_find_another:${url}`)
                .setLabel('🔍 Find Another')
                .setStyle(ButtonStyle.Secondary),
        );

        await interaction.editReply({ embeds: [embed], components: [downloadBtn] });
    } catch (err) {
        console.error('[DC] Viral error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Could not analyze this video.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  CLIP
// ─────────────────────────────────────────────────────────────────
async function handleClip(interaction) {
    const url = interaction.options.getString('url');
    const start = interaction.options.getInteger('start');
    const end = interaction.options.getInteger('end');
    const quality = interaction.options.getString('quality') || '720';
    const ratio = interaction.options.getString('ratio') || 'original';
    const userId = interaction.user.id;

    if (end - start > 60) {
        return interaction.reply({ embeds: [buildErrorEmbed('Maximum clip duration is 60 seconds.')], ephemeral: true });
    }
    if (end <= start) {
        return interaction.reply({ embeds: [buildErrorEmbed('End time must be after start time.')], ephemeral: true });
    }

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Processing Clip', `Cutting ${start}s — ${end}s at ${quality}p (${ratio})...`)] });

        const clipResult = await api.clipVideo(url, start, end, quality, ratio);
        let fileData;

        if (clipResult.jobId) {
            await interaction.editReply({ embeds: [buildInfoEmbed('Converting', 'Applying ratio conversion, please wait...')] });
            fileData = await api.waitAndDownloadClip(clipResult.jobId, 300000);
        } else {
            const params = new URLSearchParams({ url, start, end, quality, ratio });
            const res = await fetch(`${api.BACKEND_URL}/api/clip?${params}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            const cd = res.headers.get('content-disposition') || '';
            const nm = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
            fileData = { buffer, filename: nm ? decodeURIComponent(nm[1]) : `clip_${Date.now()}.mp4`, size: buffer.length };
        }

        if (api.isFileTooLarge(fileData.size, 25)) {
            return interaction.editReply({ embeds: [buildErrorEmbed(`Clip is too large (${api.formatBytes(fileData.size)}). Try lower quality.`)] });
        }

        const attachment = new AttachmentBuilder(fileData.buffer, { name: fileData.filename });
        const embed = buildSuccessEmbed('Clip Ready', `**Range:** ${start}s — ${end}s\n**Ratio:** ${ratio}\n**Quality:** ${quality}p\n**Size:** ${api.formatBytes(fileData.size)}`);

        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

        addToHistory(userId, PLATFORM, { title: fileData.filename, type: 'clip', url });
    } catch (err) {
        console.error('[DC] Clip error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Clip processing failed.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  TRANSCRIPT
// ─────────────────────────────────────────────────────────────────
async function handleTranscript(interaction) {
    const url = interaction.options.getString('url');
    const userId = interaction.user.id;

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Fetching', 'Getting subtitle information...')] });

        const subInfo = await api.getSubtitlesList(url);

        if (!subInfo.subtitles?.length) {
            return interaction.editReply({ embeds: [buildErrorEmbed('No subtitles found for this video.')] });
        }

        const best = subInfo.subtitles.find(s => s.code.startsWith('en')) || subInfo.subtitles[0];
        await interaction.editReply({ embeds: [buildInfoEmbed('Downloading', `Getting ${best.name} transcript...`)] });

        const { buffer, filename, size } = await api.downloadSubtitleToBuffer(url, best.code, 'srt');
        const attachment = new AttachmentBuilder(buffer, { name: filename });
        const embed = buildSuccessEmbed('Transcript Ready', `**Video:** ${subInfo.title}\n**Language:** ${best.name}\n**Format:** SRT · ${api.formatBytes(size)}`);

        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

        addToHistory(userId, PLATFORM, { title: subInfo.title, type: 'transcript', url });
    } catch (err) {
        console.error('[DC] Transcript error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('Could not download transcript.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  SOCIAL DOWNLOADS
// ─────────────────────────────────────────────────────────────────
async function handleSocialDownload(interaction, url, platform) {
    const userId = interaction.user.id;
    const settings = getUserSettings(userId, PLATFORM);

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Downloading', `Fetching from ${platform}...`)] });

        const info = await api.analyzeUrl(url);
        const resolution = settings.quality.replace('p', '') || '1080';

        const { buffer, filename, size } = await api.downloadToBuffer(url, `${resolution}p`, 'video');

        if (api.isFileTooLarge(size, 25)) {
            return interaction.editReply({ embeds: [buildErrorEmbed(`File is too large (${api.formatBytes(size)}). Discord limit is 25 MB.`)] });
        }

        const attachment = new AttachmentBuilder(buffer, { name: filename });
        const embed = buildSuccessEmbed(info.title || `${platform} Content`, `Source: ${platform} · Size: ${api.formatBytes(size)}`);
        if (info.thumbnail) embed.setThumbnail(info.thumbnail);

        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

        addToHistory(userId, PLATFORM, { title: info.title || platform, type: 'media', url, size: api.formatBytes(size) });
    } catch (err) {
        console.error(`[DC] ${platform} error:`, err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed(`Could not download from ${platform}.`)] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  AI CHAT
// ─────────────────────────────────────────────────────────────────
async function handleAi(interaction) {
    const question = interaction.options.getString('question');

    await interaction.deferReply();

    try {
        await interaction.editReply({ embeds: [buildInfoEmbed('Thinking...', `Processing: "${question.slice(0, 100)}"`)] });

        const result = await api.aiChat([{ role: 'user', content: question }]);
        const embed = new EmbedBuilder()
            .setTitle('AI Response')
            .setDescription((result.response || 'No response.').slice(0, 4096))
            .setColor(branding.COLOR_INFO)
            .setFooter({ text: `${branding.BOT_NAME} · Powered by OpenRouter` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
        console.error('[DC] AI error:', err.message);
        await interaction.editReply({ embeds: [buildErrorEmbed('AI is currently unavailable.')] });
    }
}

// ─────────────────────────────────────────────────────────────────
//  BUTTON & SELECT MENU HANDLERS
// ─────────────────────────────────────────────────────────────────
async function handleButton(interaction) {
    const { customId, user } = interaction;
    const userId = user.id;

    if (customId === 'settings_toggle_autodelete') {
        const s = getUserSettings(userId, PLATFORM);
        updateUserSettings(userId, PLATFORM, { autoDelete: !s.autoDelete });
        await interaction.reply({ content: `Auto-delete is now ${!s.autoDelete ? 'on' : 'off'}.`, ephemeral: true });

    } else if (customId === 'settings_toggle_history') {
        const s = getUserSettings(userId, PLATFORM);
        updateUserSettings(userId, PLATFORM, { history: !s.history });
        await interaction.reply({ content: `History tracking is now ${!s.history ? 'on' : 'off'}.`, ephemeral: true });

    } else if (customId === 'history_clear') {
        clearHistory(userId, PLATFORM);
        await interaction.reply({ content: 'Your download history has been cleared.', ephemeral: true });

    } else if (customId.startsWith('viral_download:')) {
        const parts = customId.split(':');
        const url = parts[1];
        const start = parseInt(parts[2]);
        const end = parseInt(parts[3]);
        const settings = getUserSettings(userId, PLATFORM);

        await interaction.deferUpdate();
        await interaction.editReply({ embeds: [buildInfoEmbed('Downloading Viral Clip', `Cutting ${start}s — ${end}s...`)], components: [] });

        try {
            const quality = settings.quality.replace('p', '') || '720';
            const clipResult = await api.clipVideo(url, start, end, quality, 'original');
            let fileData;

            if (clipResult.jobId) {
                fileData = await api.waitAndDownloadClip(clipResult.jobId);
            } else {
                const params = new URLSearchParams({ url, start, end, quality, ratio: 'original' });
                const res = await fetch(`${api.BACKEND_URL}/api/clip?${params}`);
                const buffer = Buffer.from(await res.arrayBuffer());
                const cd = res.headers.get('content-disposition') || '';
                const nm = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
                fileData = { buffer, filename: nm ? decodeURIComponent(nm[1]) : `clip_${Date.now()}.mp4`, size: buffer.length };
            }

            if (api.isFileTooLarge(fileData.size, 25)) {
                return interaction.editReply({ embeds: [buildErrorEmbed(`Clip is too large (${api.formatBytes(fileData.size)}).`)] });
            }

            const attachment = new AttachmentBuilder(fileData.buffer, { name: fileData.filename });
            const embed = buildSuccessEmbed('Viral Clip Ready', `Size: ${api.formatBytes(fileData.size)}`);
            await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });
        } catch (err) {
            console.error('[DC] Viral download error:', err.message);
            await interaction.editReply({ embeds: [buildErrorEmbed('Clip download failed.')], components: [] });
        }

    } else if (customId.startsWith('viral_find_another:')) {
        const url = customId.replace('viral_find_another:', '');
        await interaction.deferUpdate();
        await interaction.editReply({ embeds: [buildInfoEmbed('Analyzing', 'Finding another viral moment...')], components: [] });
        try {
            const result = await api.findViralClip(url, []);
            const duration = result.endTime - result.startTime;
            const embed = new EmbedBuilder()
                .setTitle('Found Another Viral Clip')
                .setDescription(`**${result.title}**\n\nTime: ${api.formatDuration(result.startTime)} — ${api.formatDuration(result.endTime)} (${duration}s)\n\n${result.reasoning}`)
                .setColor(branding.COLOR_SUCCESS).setThumbnail(result.thumbnail).setTimestamp();
            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`viral_download:${url}:${result.startTime}:${result.endTime}`).setLabel('⬇️ Download').setStyle(ButtonStyle.Primary),
            );
            await interaction.editReply({ embeds: [embed], components: [btn] });
        } catch (err) {
            await interaction.editReply({ embeds: [buildErrorEmbed('Could not find another clip.')], components: [] });
        }
    }
}

async function handleSelectMenu(interaction) {
    const { customId, values, user } = interaction;
    const userId = user.id;

    if (customId === 'settings_quality') {
        const quality = values[0];
        updateUserSettings(userId, PLATFORM, { quality });
        await interaction.reply({ content: `Video quality set to ${quality}.`, ephemeral: true });

    } else if (customId === 'song_select') {
        const [id, title, artist] = values[0].split('|||');
        const settings = getUserSettings(userId, PLATFORM);

        await interaction.deferUpdate();
        await interaction.editReply({ embeds: [buildInfoEmbed('Downloading', `Downloading "${title}" by ${artist}...`)], components: [] });

        try {
            const { buffer, filename, size } = await api.downloadMusicToBuffer(id, title, artist);

            if (api.isFileTooLarge(size, 25)) {
                return interaction.editReply({ embeds: [buildErrorEmbed(`File too large (${api.formatBytes(size)}).`)] });
            }

            const attachment = new AttachmentBuilder(buffer, { name: filename });
            const embed = buildSuccessEmbed(title, `Artist: ${artist}\nFormat: MP3 · ${api.formatBytes(size)}`);
            await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });

            addToHistory(userId, PLATFORM, { title, type: 'song', size: api.formatBytes(size) });
        } catch (err) {
            console.error('[DC] Song download error:', err.message);
            await interaction.editReply({ embeds: [buildErrorEmbed('Could not download this song.')], components: [] });
        }
    }
}

// ── Auto-detect URLs in messages ──────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const urlPattern = /https?:\/\/[^\s]+/i;
    const text = message.content.trim();

    if (!urlPattern.test(text)) return;

    const url = text.match(urlPattern)[0];
    const userId = message.author.id;
    const settings = getUserSettings(userId, PLATFORM);

    let platform = '';
    if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
    else if (url.includes('instagram.com')) platform = 'Instagram';
    else if (url.includes('pinterest.com') || url.includes('pin.it')) platform = 'Pinterest';
    else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';

    if (!platform) return;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`auto_video:${url}`).setLabel('🎬 Download Video').setStyle(ButtonStyle.Primary),
        ...(platform === 'YouTube' ? [
            new ButtonBuilder().setCustomId(`auto_mp3:${url}`).setLabel('🎵 MP3').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auto_sum:${url}`).setLabel('📝 Summarize').setStyle(ButtonStyle.Secondary),
        ] : []),
    );

    await message.reply({ content: `Detected a ${platform} link! What would you like to do?`, components: [row] });
});

// ── Handle auto-detect buttons ──────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const { customId } = interaction;

    if (customId.startsWith('auto_video:')) {
        const url = customId.replace('auto_video:', '');
        await handleDownloadFromUrl(interaction, url);
    } else if (customId.startsWith('auto_mp3:')) {
        const url = customId.replace('auto_mp3:', '');
        await interaction.deferUpdate();
        await interaction.editReply({ content: null, components: [], embeds: [buildInfoEmbed('Converting', 'Extracting audio...')] });
        try {
            const { buffer, filename, size } = await api.downloadToBuffer(url, 'best', 'audio');
            const attachment = new AttachmentBuilder(buffer, { name: filename.endsWith('.mp3') ? filename : filename + '.mp3' });
            await interaction.editReply({ embeds: [buildSuccessEmbed('MP3 Ready', `Size: ${api.formatBytes(size)}`)], files: [attachment], components: [] });
        } catch (err) {
            await interaction.editReply({ embeds: [buildErrorEmbed('MP3 conversion failed.')], components: [] });
        }
    } else if (customId.startsWith('auto_sum:')) {
        const url = customId.replace('auto_sum:', '');
        await interaction.deferUpdate();
        await interaction.editReply({ content: null, components: [], embeds: [buildInfoEmbed('Summarizing', 'Generating AI summary...')] });
        try {
            const result = await api.summarizeVideo(url, 'brief');
            const embed = new EmbedBuilder().setTitle(result.title || 'Summary').setDescription((result.summary || '').slice(0, 4096)).setColor(branding.COLOR_INFO).setThumbnail(result.thumbnail).setTimestamp();
            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (err) {
            await interaction.editReply({ embeds: [buildErrorEmbed('Summarization failed.')], components: [] });
        }
    }
});

async function handleDownloadFromUrl(interaction, url) {
    const userId = interaction.user.id;
    const settings = getUserSettings(userId, PLATFORM);
    const quality = settings.quality.replace('p', '') || '1080';

    await interaction.deferUpdate();
    await interaction.editReply({ content: null, components: [], embeds: [buildInfoEmbed('Downloading', 'Fetching video...')] });

    try {
        const info = await api.analyzeUrl(url);
        const { buffer, filename, size } = await api.downloadToBuffer(url, `${quality}p`, 'video');

        if (api.isFileTooLarge(size, 25)) {
            return interaction.editReply({ embeds: [buildErrorEmbed(`File too large (${api.formatBytes(size)}). Use /download with lower quality.`)], components: [] });
        }

        const attachment = new AttachmentBuilder(buffer, { name: filename });
        await interaction.editReply({ embeds: [buildSuccessEmbed(info.title || 'Video', `${api.formatBytes(size)}`)], files: [attachment], components: [] });
    } catch (err) {
        await interaction.editReply({ embeds: [buildErrorEmbed('Download failed.')], components: [] });
    }
}

// ── Ready ──────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`[DC] ${branding.BOT_NAME} Discord bot is ready as ${client.user.tag}`);
    client.user.setActivity(`${branding.TAGLINE} | /help`, { type: 0 });
    await registerCommands();
});

// ── Error handler ──────────────────────────────────────────────
client.on('error', (err) => console.error('[DC] Client error:', err.message));
process.on('unhandledRejection', (err) => console.error('[DC] Unhandled rejection:', err?.message || err));

// ── Login ──────────────────────────────────────────────────────
client.login(TOKEN);
