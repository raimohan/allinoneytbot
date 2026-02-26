/**
 * ========================================================
 *  SHARED API CLIENT
 *  All bots communicate with the backend via this module
 * ========================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

/**
 * Make a request to the backend API
 */
async function apiRequest(method, endpoint, data = null, isQuery = false) {
    const url = `${BACKEND_URL}${endpoint}`;

    const options = {
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
    };

    if (data) {
        if (method.toUpperCase() === 'GET') {
            // build query string
            const qs = new URLSearchParams(data).toString();
            return fetch(`${url}?${qs}`, { method: 'GET', headers: options.headers });
        }
        options.body = JSON.stringify(data);
    }

    return fetch(url, options);
}

// ── Video Info ──────────────────────────────────────────────
async function analyzeUrl(url) {
    const res = await apiRequest('POST', '/api/analyze', { url });
    if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
    return res.json();
}

// ── Download URL (returns a readable stream) ─────────────────
async function getDownloadUrl(url, resolution = 'best', type = 'video') {
    const params = new URLSearchParams({ url, resolution, type });
    return `${BACKEND_URL}/api/download?${params.toString()}`;
}

// ── Fetch download as buffer ─────────────────────────────────
async function downloadToBuffer(url, resolution = 'best', type = 'video') {
    const dlUrl = await getDownloadUrl(url, resolution, type);
    const res = await fetch(dlUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `file_${Date.now()}.${type === 'audio' ? 'mp3' : 'mp4'}`;
    return { buffer, filename, size: buffer.length };
}

// ── Music Search ──────────────────────────────────────────────
async function searchMusic(query) {
    const res = await apiRequest('POST', '/api/music/search', { query });
    if (!res.ok) throw new Error(`Music search failed: ${res.status}`);
    return res.json();
}

// ── Music Download ────────────────────────────────────────────
async function downloadMusicToBuffer(id, title = '', artist = '') {
    const params = new URLSearchParams({ id, title, artist });
    const dlUrl = `${BACKEND_URL}/api/music/download?${params.toString()}`;
    const res = await fetch(dlUrl);
    if (!res.ok) throw new Error(`Music download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `${title || 'song'}.mp3`;
    return { buffer, filename, size: buffer.length };
}

// ── Subtitles List ─────────────────────────────────────────────
async function getSubtitlesList(url) {
    const res = await apiRequest('POST', '/api/subtitles', { url });
    if (!res.ok) throw new Error(`Subtitle list failed: ${res.status}`);
    return res.json();
}

// ── Download Subtitle File ─────────────────────────────────────
async function downloadSubtitleToBuffer(url, lang = 'en', format = 'srt') {
    const params = new URLSearchParams({ url, lang, format });
    const dlUrl = `${BACKEND_URL}/api/subtitles/download?${params.toString()}`;
    const res = await fetch(dlUrl);
    if (!res.ok) throw new Error(`Subtitle download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `transcript.${format}`;
    return { buffer, filename, size: buffer.length };
}

// ── Summarize Video ────────────────────────────────────────────
async function summarizeVideo(url, type = 'brief') {
    const res = await apiRequest('POST', '/api/summarize', { url, type });
    if (!res.ok) throw new Error(`Summarize failed: ${res.status}`);
    return res.json();
}

// ── Find Viral Clip ────────────────────────────────────────────
async function findViralClip(url, excludedRanges = []) {
    const res = await apiRequest('POST', '/api/viral', { url, excludedRanges });
    if (!res.ok) throw new Error(`Viral clip failed: ${res.status}`);
    return res.json();
}

// ── Clip Video (start job) ──────────────────────────────────────
async function clipVideo(url, startSec, endSec, quality = '720', ratio = 'original') {
    const params = new URLSearchParams({
        url,
        start: String(startSec),
        end: String(endSec),
        quality,
        ratio,
    });
    const res = await fetch(`${BACKEND_URL}/api/clip?${params.toString()}`);
    if (!res.ok) throw new Error(`Clip failed: ${res.status}`);
    return res.json(); // may be { jobId, status } or direct download
}

// ── Poll Clip Job Status ────────────────────────────────────────
async function getClipJobStatus(jobId) {
    const res = await fetch(`${BACKEND_URL}/api/clip/status/${jobId}`);
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json();
}

// ── Download Completed Clip ─────────────────────────────────────
async function downloadClipToBuffer(jobId) {
    const dlUrl = `${BACKEND_URL}/api/clip/download/${jobId}`;
    const res = await fetch(dlUrl);
    if (!res.ok) throw new Error(`Clip download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `clip_${Date.now()}.mp4`;
    return { buffer, filename, size: buffer.length };
}

// ── Poll and download clip with progressive retry ───────────────
async function waitAndDownloadClip(jobId, maxWaitMs = 300000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const status = await getClipJobStatus(jobId);
        if (status.status === 'ready') {
            return downloadClipToBuffer(jobId);
        }
        if (status.status === 'failed') {
            throw new Error(status.error || 'Clip processing failed');
        }
        await new Promise(r => setTimeout(r, 5000)); // poll every 5s
    }
    throw new Error('Clip processing timed out');
}

// ── Get Video Info ─────────────────────────────────────────────
async function getVideoInfo(url) {
    const res = await apiRequest('POST', '/api/video/info', { url });
    if (!res.ok) throw new Error(`Video info failed: ${res.status}`);
    return res.json();
}

// ── Metadata ───────────────────────────────────────────────────
async function getMetadata(url) {
    const res = await apiRequest('POST', '/api/metadata', { url });
    if (!res.ok) throw new Error(`Metadata failed: ${res.status}`);
    return res.json();
}

// ── AI Chat ───────────────────────────────────────────────────
async function aiChat(messages, systemContext = '') {
    const res = await apiRequest('POST', '/api/chat', {
        videoId: 'bot_chat',
        videoData: { title: systemContext },
        messages,
    });
    if (!res.ok) throw new Error(`AI chat failed: ${res.status}`);
    return res.json();
}

// ── Helper: Format bytes to human ──────────────────────────────
function formatBytes(bytes) {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Helper: Format duration seconds ────────────────────────────
function formatDuration(secs) {
    if (!secs) return '--:--';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Check file size limit ──────────────────────────────────────
function isFileTooLarge(bytes, limitMB = 100) {
    return bytes > limitMB * 1024 * 1024;
}

module.exports = {
    BACKEND_URL,
    analyzeUrl,
    getDownloadUrl,
    downloadToBuffer,
    searchMusic,
    downloadMusicToBuffer,
    getSubtitlesList,
    downloadSubtitleToBuffer,
    summarizeVideo,
    findViralClip,
    clipVideo,
    getClipJobStatus,
    downloadClipToBuffer,
    waitAndDownloadClip,
    getVideoInfo,
    getMetadata,
    aiChat,
    formatBytes,
    formatDuration,
    isFileTooLarge,
};
