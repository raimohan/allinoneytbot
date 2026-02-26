/**
 * ========================================================
 *  MAIN ENTRY POINT
 *  Starts all bots and the backend server together
 * ========================================================
 */

const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const branding = require('./branding');

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${branding.BOT_NAME} v${branding.BOT_VERSION}`);
console.log(`  Starting all services...`);
console.log(`${'='.repeat(60)}\n`);

const services = [];

// ── Helper: Start a child process ─────────────────────────────
function startProcess(name, scriptPath, color = '\x1b[37m') {
    const reset = '\x1b[0m';
    const label = `[${name}]`;

    const proc = spawn('node', [scriptPath], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env },
    });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => console.log(`${color}${label}${reset} ${line}`));
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => console.error(`${color}${label}${reset} \x1b[31m${line}\x1b[0m`));
    });

    proc.on('exit', (code) => {
        console.warn(`${color}${label}${reset} Process exited (code ${code}). Restarting in 5s...`);
        setTimeout(() => {
            const idx = services.findIndex(s => s.name === name);
            if (idx !== -1) {
                services[idx].proc = startProcess(name, scriptPath, color);
            }
        }, 5000);
    });

    proc.on('error', (err) => {
        console.error(`${color}${label}${reset} Failed to start: ${err.message}`);
    });

    services.push({ name, proc, scriptPath, color });
    return proc;
}

// ── Start Backend ─────────────────────────────────────────────
const BOTS_TO_START = process.env.START_BOTS || 'backend,telegram,discord,whatsapp';
const botsToStart = BOTS_TO_START.split(',').map(b => b.trim().toLowerCase());

if (botsToStart.includes('backend')) {
    console.log('Starting Backend Server...');
    startProcess('BACKEND', path.join(__dirname, 'backend.js'), '\x1b[36m');
}

// Give backend 3 seconds to start before launching bots
setTimeout(() => {
    if (botsToStart.includes('telegram') && process.env.TELEGRAM_BOT_TOKEN) {
        console.log('Starting Telegram Bot...');
        startProcess('TELEGRAM', path.join(__dirname, 'telegram', 'bot.js'), '\x1b[34m');
    } else if (botsToStart.includes('telegram')) {
        console.warn('[MAIN] TELEGRAM_BOT_TOKEN not set. Telegram bot skipped.');
    }

    if (botsToStart.includes('discord') && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID) {
        console.log('Starting Discord Bot...');
        startProcess('DISCORD', path.join(__dirname, 'discord', 'bot.js'), '\x1b[35m');
    } else if (botsToStart.includes('discord')) {
        console.warn('[MAIN] DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set. Discord bot skipped.');
    }

    if (botsToStart.includes('whatsapp')) {
        console.log('Starting WhatsApp Bot...');
        startProcess('WHATSAPP', path.join(__dirname, 'whatsapp', 'bot.js'), '\x1b[32m');
    }
}, 3000);

// ── Graceful Shutdown ─────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n[MAIN] Received SIGINT. Shutting down all services...');
    services.forEach(s => {
        try { s.proc.kill('SIGTERM'); } catch (_) { }
    });
    setTimeout(() => process.exit(0), 2000);
});

process.on('SIGTERM', () => {
    services.forEach(s => {
        try { s.proc.kill('SIGTERM'); } catch (_) { }
    });
    process.exit(0);
});
