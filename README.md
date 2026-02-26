<div align="center">

<!-- Animated Header -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=200&section=header&text=RaiXbot&fontSize=80&fontColor=fff&animation=fadeIn&fontAlignY=35&desc=All-in-One%20Multi-Platform%20Bot&descAlignY=55&descSize=18" width="100%"/>

<!-- Animated Typing -->
<a href="https://github.com/raimohan/allinoneytbot">
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=22&duration=3000&pause=500&color=6C63FF&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=80&lines=Download+Anything.+Everywhere.;Telegram+%7C+Discord+%7C+WhatsApp;Powered+by+yt-dlp+%2B+OpenRouter+AI" alt="Typing SVG" />
</a>

<br/>

<!-- Badges Row 1 -->
[![GitHub Stars](https://img.shields.io/github/stars/raimohan/allinoneytbot?style=for-the-badge&logo=github&color=6C63FF&labelColor=0D1117)](https://github.com/raimohan/allinoneytbot/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/raimohan/allinoneytbot?style=for-the-badge&logo=github&color=43B581&labelColor=0D1117)](https://github.com/raimohan/allinoneytbot/network)
[![GitHub Issues](https://img.shields.io/github/issues/raimohan/allinoneytbot?style=for-the-badge&logo=github&color=F04747&labelColor=0D1117)](https://github.com/raimohan/allinoneytbot/issues)
[![License](https://img.shields.io/github/license/raimohan/allinoneytbot?style=for-the-badge&color=FAA61A&labelColor=0D1117)](LICENSE)

<!-- Badges Row 2 -->
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0D1117)](https://nodejs.org)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white&labelColor=0D1117)](https://telegram.org)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=0D1117)](https://discord.com)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=0D1117)](https://whatsapp.com)

<!-- Badges Row 3 -->
[![YouTube](https://img.shields.io/badge/YouTube-@raieditz56-FF0000?style=for-the-badge&logo=youtube&logoColor=white&labelColor=0D1117)](https://youtube.com/@raieditz56)
[![Termux](https://img.shields.io/badge/Termux-Compatible-black?style=for-the-badge&logo=android&logoColor=white&labelColor=0D1117)](https://termux.dev)
[![yt-dlp](https://img.shields.io/badge/Powered%20by-yt--dlp-red?style=for-the-badge&labelColor=0D1117)](https://github.com/yt-dlp/yt-dlp)

</div>

---

## 🎬 Video Tutorial

<div align="center">

> 📺 **Watch the full setup tutorial on YouTube:**

[![Watch Tutorial](https://img.shields.io/badge/▶%20Watch%20Setup%20Tutorial-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/@raieditz56)

*Full step-by-step guide — cookies setup, token configuration, running on VPS & Termux*

</div>

---

<div align="center">

## ✨ What is RaiXbot?

</div>

**RaiXbot** is a powerful, unified multi-platform media downloader bot that runs simultaneously on **Telegram**, **Discord**, and **WhatsApp** — all from a single backend. Fully AI-powered, supports 10+ platforms, and works on any server or even your Android phone via Termux.

<div align="center">

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   📱 Telegram  ──┐                                          │
│   💬 Discord   ──┼──►  backend.js  ──►  yt-dlp + AI        │
│   📲 WhatsApp  ──┘                                          │
│                                                             │
│   One backend. Three platforms. Zero limit.                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

</div>

---

## 🗺️ Feature Overview

<div align="center">

| Feature | Telegram | Discord | WhatsApp |
|:--|:--:|:--:|:--:|
| 🎬 YouTube Video Download | ✅ | ✅ | ✅ |
| 🎵 YouTube → MP3 | ✅ | ✅ | ✅ |
| 🔍 Song Search & Download | ✅ | ✅ | ✅ |
| 🤖 AI Video Summarizer | ✅ | ✅ | ✅ |
| 📊 Viral Clip Finder (AI) | ✅ | ✅ | ✅ |
| ✂️ Clip Cutter (max 60s, ratios) | ✅ | ✅ | ✅ |
| 📄 Transcript Downloader | ✅ | ✅ | ✅ |
| 📌 Pinterest Downloader | ✅ | ✅ | ✅ |
| 📸 Instagram Downloader | ✅ | ✅ | ✅ |
| 🐦 Twitter/X Downloader | ✅ | ✅ | ✅ |
| ⚙️ Quality Selector | ✅ | ✅ | ✅ |
| 📋 Download History | ✅ | ✅ | ✅ |
| 🗑 Auto-Delete Messages | ✅ | ✅ | — |
| 📁 Files sent as Document | ✅ | ✅ | ✅ |
| 🔐 Persistent WA Session | — | — | ✅ |

</div>

---

## 📂 Project Structure

```
allinoneytbot/
│
├── 📄 index.js              ← Main launcher (starts all bots)
├── 📄 backend.js            ← Core API server (yt-dlp + AI)
├── 📄 branding.js           ← Customize bot name, author, links
├── 📄 .env.example          ← Environment variable template
├── 📄 script.sh             ← VPS/Linux one-time setup
├── 📄 termux.sh             ← Android Termux one-time setup
│
├── 📁 shared/
│   ├── api.js               ← API client (all bots use this)
│   └── settings.js          ← User settings + history store
│
├── 📁 telegram/
│   ├── bot.js               ← Telegram bot (grammy v1)
│   └── package.json
│
├── 📁 discord/
│   ├── bot.js               ← Discord bot (discord.js v14)
│   └── package.json
│
├── 📁 whatsapp/
│   ├── bot.js               ← WhatsApp bot (whatsapp-web.js)
│   └── package.json
│
├── 📁 downloads/            ← Temp downloads (auto-cleaned)
├── 📁 data/                 ← User settings & history
└── 📁 .wwebjs_auth/         ← WhatsApp session (auto-login)
```

---

## 🚀 Setup Guide

### Prerequisites

- **Node.js 18+** (20 recommended)
- **Python 3.8+**
- **FFmpeg**
- **yt-dlp**
- **A Telegram/Discord bot token** (WhatsApp uses QR login)

---

### 🖥️ Option A — VPS / Linux Server

```bash
# 1. Clone the repo
git clone https://github.com/raimohan/allinoneytbot.git
cd allinoneytbot

# 2. Run the one-time setup script
bash script.sh

# 3. Edit your tokens
nano .env

# 4. Start everything
node index.js
```

---

### 📱 Option B — Android (Termux)

> ⚠️ **Use Termux from [F-Droid](https://f-droid.org/packages/com.termux/)** — NOT the Play Store version (outdated).

```bash
# 1. Install Termux from F-Droid
# 2. Open Termux and run:

pkg update -y && pkg install -y git
git clone https://github.com/raimohan/allinoneytbot.git
cd allinoneytbot

# 3. Run the Termux setup script
bash termux.sh

# 4. Edit your tokens
nano .env

# 5. Prevent Android from killing the bot
termux-wake-lock

# 6. Start everything
node index.js

# Or run in background:
nohup node index.js > bot.log 2>&1 &
```

---

### 🍪 Cookie Setup (Required for YouTube & Instagram)

> Cookies let the bot bypass age-restrictions, login-walls, and rate-limits on YouTube, Instagram, and other platforms.

#### Step 1 — Install the Browser Extension

<div align="center">

[![Get Cookies.txt LOCALLY](https://img.shields.io/badge/Chrome-Get%20cookies.txt%20LOCALLY-blue?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

[![Firefox - cookies.txt](https://img.shields.io/badge/Firefox-cookies.txt-orange?style=for-the-badge&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

</div>

> 🔗 **Chrome Extension:** https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc

#### Step 2 — Export Cookies

```
1. Open Chrome / Firefox browser
2. Log into YouTube (or Instagram, Twitter, Pinterest)
3. Click the "Get cookies.txt LOCALLY" extension icon
4. In the dropdown, select the website (e.g. youtube.com)
5. Click "Export As" → save as cookies.txt
```

#### Step 3 — Place Cookie Files

```
allinoneytbot/
├── youtube.txt       ← YouTube cookies
├── instagram.txt     ← Instagram cookies  
├── twitter.txt       ← Twitter/X cookies
└── pinterest.txt     ← Pinterest cookies
```

> 💡 The bot automatically detects and uses the matching cookie file for each platform.

#### Step 4 — Video Walkthrough

<div align="center">

[![Cookie Setup Tutorial](https://img.shields.io/badge/▶%20Cookie%20Setup%20Video-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/@raieditz56)

</div>

---

### 🤖 Getting Bot Tokens

<details>
<summary><b>📱 Telegram Bot Token</b></summary>

1. Open Telegram → search for **[@BotFather](https://t.me/botfather)**
2. Send `/newbot`
3. Choose a name and username
4. Copy the token → paste as `TELEGRAM_BOT_TOKEN` in `.env`

</details>

<details>
<summary><b>💬 Discord Bot Token</b></summary>

1. Go to **[Discord Developer Portal](https://discord.com/developers/applications)**
2. Click **New Application** → give it a name
3. Go to **Bot** tab → click **Reset Token** → copy token
4. Paste as `DISCORD_BOT_TOKEN` in `.env`
5. Copy the **Application ID** → paste as `DISCORD_CLIENT_ID` in `.env`
6. Go to **OAuth2 → URL Generator** → select `bot` + `applications.commands`
7. Select permissions: `Send Messages`, `Attach Files`, `Read Message History`
8. Open the generated URL to invite the bot to your server

</details>

<details>
<summary><b>🟢 WhatsApp (QR Login — No Token Needed)</b></summary>

1. Start the bot: `node whatsapp/bot.js` or `node index.js`
2. A QR code appears in the terminal
3. Open WhatsApp on your phone → **Linked Devices** → **Link a Device**
4. Scan the QR code
5. ✅ Done! The bot session is saved — **no re-scan needed** after first login

</details>

<details>
<summary><b>🧠 OpenRouter API Key (for AI features)</b></summary>

1. Go to **[OpenRouter.ai](https://openrouter.ai)**
2. Sign up → go to **[Keys](https://openrouter.ai/keys)**
3. Click **Create Key**
4. Copy the key → paste as `OPENROUTER_API_KEY_1` in `.env`

> Free tier is available. The bot uses `google/gemini-2.0-flash-exp:free` by default.

</details>

---

### ⚙️ Environment Variables

```env
# ── Backend ──────────────────────────────────────────────────
BACKEND_URL=http://localhost:3000
PORT=3000

# ── OpenRouter AI (up to 5 keys for auto-failover) ───────────
OPENROUTER_API_KEY_1=sk-or-...
# OPENROUTER_API_KEY_2=sk-or-...   (optional backup)

# ── Telegram ─────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# ── Discord ──────────────────────────────────────────────────
DISCORD_BOT_TOKEN=MTIz...
DISCORD_CLIENT_ID=123456789012345678

# ── Control which bots start ─────────────────────────────────
START_BOTS=backend,telegram,discord,whatsapp
# To run only Telegram + Discord (no WhatsApp):
# START_BOTS=backend,telegram,discord
```

---

### 🚦 Running the Bot

```bash
# Start all bots at once
node index.js

# Or individually:
node backend.js          # Backend API
node telegram/bot.js     # Telegram only
node discord/bot.js      # Discord only
node whatsapp/bot.js     # WhatsApp only
```

### 🔄 Run 24/7 with PM2 (Recommended for VPS)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start index.js --name raixbot

# Auto-restart on server reboot
pm2 save
pm2 startup

# Monitor logs
pm2 logs raixbot
pm2 status
```

### 📱 Run Forever on Termux (Background)

```bash
# Enable wake lock first
termux-wake-lock

# Start in background
nohup node index.js > bot.log 2>&1 &

# Monitor live
tail -f bot.log

# Stop
kill $(cat bot.pid)
# or
pkill -f "node index.js"
```

---

## 📖 Bot Commands

### Telegram & WhatsApp

| Command | Description |
|:--|:--|
| `/help` | Show all commands |
| `/download [url]` | Download video (YouTube, Instagram, Twitter, Pinterest) |
| `/mp3 [url]` | Download YouTube video as MP3 |
| `/song [name]` | Search and download a song |
| `/summarise [url]` | AI-powered video summary |
| `/viral [url]` | Find the most viral 30-second clip |
| `/clip [url] [start] [end]` | Cut a clip (max 60 seconds) |
| `/transcript [url]` | Download video transcript/subtitles |
| `/pinterest [url]` | Download Pinterest image or video |
| `/instagram [url]` | Download Instagram post or reel |
| `/twitter [url]` | Download Twitter/X video |
| `/settings` | View and change your preferences |
| `/quality [360/480/720/1080]` | Set default video quality |
| `/history` | View recent downloads |
| `/ai [question]` | Ask the AI a question |

### Discord (Slash Commands)

> All commands available as `/command` in Discord with options and dropdowns.

---

## ⭐ Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=raimohan/allinoneytbot&type=Date)](https://star-history.com/#raimohan/allinoneytbot&Date)

</div>

---

## 🛠 Tech Stack

<div align="center">

| Component | Technology |
|:--|:--|
| **Backend** | Node.js + Express |
| **Download Engine** | yt-dlp + FFmpeg |
| **Telegram** | [grammY](https://grammy.dev) v1 |
| **Discord** | [discord.js](https://discord.js.org) v14 |
| **WhatsApp** | [whatsapp-web.js](https://wwebjs.dev) + Puppeteer |
| **AI** | [OpenRouter](https://openrouter.ai) — `google/gemini-2.0-flash-exp:free` |
| **Browser Automation** | Puppeteer + Chromium |
| **Scheduling** | node-cron |

</div>

---

## 🐛 Troubleshooting

<details>
<summary><b>WhatsApp bot not starting / Puppeteer error</b></summary>

**On VPS:**
```bash
# Install missing Chromium dependencies
sudo apt-get install -y chromium-browser libxss1 libgbm1 libasound2

# Then retry
node whatsapp/bot.js
```

**On Termux:**
```bash
pkg install chromium
```

Or run without WhatsApp:
```env
START_BOTS=backend,telegram,discord
```

</details>

<details>
<summary><b>YouTube 403 / Bot detection error</b></summary>

1. Export fresh cookies from your browser using the **Get Cookies.txt LOCALLY** extension
2. Place `youtube.txt` in the root folder
3. Restart the bot

</details>

<details>
<summary><b>Discord commands not showing</b></summary>

Slash commands take up to **1 hour** to register globally on Discord. Wait or re-invite the bot with correct permissions.

</details>

<details>
<summary><b>WhatsApp QR code expired</b></summary>

Delete the session folder and restart:
```bash
rm -rf .wwebjs_auth
node whatsapp/bot.js
```

</details>

<details>
<summary><b>File too large to send</b></summary>

- **WhatsApp:** Max 100 MB — try `/quality 480`
- **Telegram:** Max 2 GB (Bot API) — no limit issue
- **Discord:** Max 25 MB (free) / 500 MB (Nitro) — try lower quality

</details>

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

- ⭐ **Star** the repo if this helped you
- 🐛 **Open an Issue** for bugs or feature requests
- 🔀 **Submit a Pull Request** for improvements

```bash
# Fork → Clone → Create branch → Make changes → PR
git checkout -b feature/your-feature
git commit -m "Add: your feature"
git push origin feature/your-feature
# Then open a Pull Request on GitHub
```

---

## 📜 License

```
MIT License — Free to use, modify, and distribute.
See LICENSE file for full details.
```

---

<div align="center">

## 👨‍💻 Author

<img src="https://avatars.githubusercontent.com/raimohan" width="100" style="border-radius:50%"/>

**raimohan**

[![GitHub](https://img.shields.io/badge/GitHub-raimohan-181717?style=for-the-badge&logo=github)](https://github.com/raimohan)
[![YouTube](https://img.shields.io/badge/YouTube-@raieditz56-FF0000?style=for-the-badge&logo=youtube)](https://youtube.com/@raieditz56)

---

*If this project helped you, please consider giving it a* ⭐ *star on GitHub!*

*It really means a lot and helps others discover this project.* 🙏

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%"/>

</div>
