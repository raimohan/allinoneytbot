#!/bin/bash
# ============================================================
#  RaiXbot — Complete One-Time Setup Script
#  Installs ALL dependencies for Telegram + Discord + WhatsApp bots
#  Just run once: bash script.sh
# ============================================================

set -e  # Exit immediately on error

# ── Colors ────────────────────────────────────────────────────
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────
ok()   { echo -e "${GREEN}  ✅ $1${NC}"; }
info() { echo -e "${CYAN}  ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
fail() { echo -e "${RED}  ❌ $1${NC}"; exit 1; }
step() { echo -e "\n${MAGENTA}${BOLD}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Banner ────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
cat << "EOF"
███╗   ███╗███████╗██████╗ ██╗ █████╗ ██████╗  ██████╗ ████████╗
████╗ ████║██╔════╝██╔══██╗██║██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██╔████╔██║█████╗  ██║  ██║██║███████║██████╔╝██║   ██║   ██║   
██║╚██╔╝██║██╔══╝  ██║  ██║██║██╔══██║██╔══██╗██║   ██║   ██║   
██║ ╚═╝ ██║███████╗██████╔╝██║██║  ██║██████╔╝╚██████╔╝   ██║   
╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝  
EOF
echo -e "${NC}"
echo -e "${BOLD}         Multi-Platform Bot — One-Time Setup${NC}"
echo -e "${CYAN}         Telegram · Discord · WhatsApp${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Detect OS ─────────────────────────────────────────────────
detect_os() {
    if [ -x "$(command -v apt-get)" ]; then
        OS="debian"
    elif [ -x "$(command -v yum)" ]; then
        OS="rhel"
    elif [ -x "$(command -v brew)" ]; then
        OS="macos"
    else
        OS="unknown"
    fi
    info "Detected OS type: $OS"
}

detect_os

# ============================================================
# STEP 1 — System Dependencies
# ============================================================
step "Step 1: System Dependencies"

install_system_deps() {
    if [ "$OS" = "debian" ]; then
        # Silently fix any unsigned/expired third-party repo keys before updating
        sudo find /etc/apt/sources.list.d/ -name "*.list" -exec \
            grep -l "NO_PUBKEY\|not signed\|signatures" {} \; \
            2>/dev/null | xargs -I{} sudo rm -f {} 2>/dev/null || true

        sudo apt-get update -qq 2>/dev/null || \
        sudo apt-get update --allow-unauthenticated -qq 2>/dev/null || true

        info "Installing system packages..."
        sudo apt-get install -y \
            curl \
            unzip \
            python3 \
            python3-pip \
            python3-venv \
            ffmpeg \
            atomicparsley \
            ca-certificates \
            gnupg \
            git \
            2>/dev/null || true

        sudo apt-get install -y \
            chromium-browser \
            libglib2.0-0 \
            libnss3 \
            libx11-xcb1 \
            libxcomposite1 \
            libxcursor1 \
            libxdamage1 \
            libxi6 \
            libxtst6 \
            libatk1.0-0 \
            libcups2 \
            libxrandr2 \
            libasound2 \
            libpangocairo-1.0-0 \
            libatk-bridge2.0-0 \
            libxss1 \
            libdrm2 \
            libgbm1 \
            libgtk-3-0 \
            fonts-liberation \
            xdg-utils \
            2>/dev/null || true

        ok "System packages installed."

    elif [ "$OS" = "rhel" ]; then
        info "Installing system packages (yum)..."
        sudo yum install -y \
            curl unzip python3 python3-pip ffmpeg \
            chromium \
            nss atk cups-libs libXcomposite libXrandr \
            pango alsa-lib libXss liberation-fonts \
            2>/dev/null || true
        ok "System packages installed."

    elif [ "$OS" = "macos" ]; then
        info "Installing via Homebrew..."
        brew install python ffmpeg curl || true
        brew install --cask chromium || true
        ok "macOS dependencies installed."

    else
        warn "Unknown OS. Please manually install: ffmpeg, curl, python3, chromium."
    fi
}

install_system_deps

# ============================================================
# STEP 2 — Node.js
# ============================================================
step "Step 2: Node.js (v20 LTS)"

install_node() {
    if command -v node &>/dev/null; then
        NODE_VER=$(node --version)
        MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
        if [ "$MAJOR" -ge 18 ]; then
            ok "Node.js $NODE_VER already installed."
            return 0
        fi
        warn "Node.js $NODE_VER is too old (need 18+). Upgrading..."
    fi

    if [ "$OS" = "debian" ]; then
        info "Installing Node.js 20.x via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
        sudo apt-get install -y nodejs 2>/dev/null
    elif [ "$OS" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif [ "$OS" = "macos" ]; then
        brew install node@20 || brew upgrade node
    else
        warn "Please install Node.js 20+ manually: https://nodejs.org"
        return 0
    fi

    ok "Node.js $(node --version) installed."
}

install_node

# ============================================================
# STEP 3 — Python / Virtual Environment / yt-dlp
# ============================================================
step "Step 3: Python, Virtual Environment & yt-dlp"

ENV_DIR="$HOME/yt-dlp-env"

if [ ! -d "$ENV_DIR" ]; then
    info "Creating Python virtual environment at $ENV_DIR..."
    python3 -m venv "$ENV_DIR"
    ok "Virtual environment created."
else
    ok "Virtual environment already exists at $ENV_DIR"
fi

source "$ENV_DIR/bin/activate"
pip install -U pip -q

info "Installing yt-dlp with all extras (curl-cffi, brotli, websockets, mutagen)..."
pip install -U "yt-dlp[default,curl-cffi]" -q

# Installing the dedicated YouTube extension for full JS/PO Token support
# Required for solving YouTube's new anti-bot JS challenges
info "Installing yt-dlp-ejs (YouTube JS extension for PO Token support)..."
pip install -U yt-dlp-ejs -q

ok "yt-dlp installed: $(yt-dlp --version)"
ok "yt-dlp-ejs installed (YouTube JS challenge support active)"

# ── Install yt-dlp binary to /usr/local/bin for easy access ──
if [ "$OS" != "macos" ]; then
    YT_DLP_BIN="/usr/local/bin/yt-dlp"
    if [ ! -f "$YT_DLP_BIN" ]; then
        info "Installing yt-dlp binary to /usr/local/bin..."
        sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YT_DLP_BIN" 2>/dev/null
        sudo chmod a+rx "$YT_DLP_BIN"
        ok "yt-dlp binary installed at $YT_DLP_BIN"
    else
        info "Updating yt-dlp binary..."
        sudo yt-dlp -U 2>/dev/null || true
        ok "yt-dlp binary up to date."
    fi
fi

# ============================================================
# STEP 4 — Deno (for yt-dlp JS challenges)
# ============================================================
step "Step 4: Deno Runtime"

if ! command -v deno &>/dev/null; then
    info "Installing Deno..."
    curl -fsSL https://deno.land/install.sh | sh 2>/dev/null
    export PATH="$HOME/.deno/bin:$PATH"
    ok "Deno installed: $(deno --version | head -1)"
else
    ok "Deno already installed: $(deno --version | head -1)"
fi

# ============================================================
# STEP 5 — Node Modules (Root + All Bots)
# ============================================================
step "Step 5: Node.js Dependencies"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

install_npm() {
    local DIR="$1"
    local NAME="$2"
    if [ -f "$DIR/package.json" ]; then
        info "Installing $NAME dependencies..."
        (cd "$DIR" && npm install --loglevel=warn 2>&1 | tail -5)
        ok "$NAME: $(cat "$DIR/package.json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('dependencies',{})))" 2>/dev/null || echo '?') packages installed"
    else
        warn "$NAME: No package.json found at $DIR"
    fi
}

install_npm "$SCRIPT_DIR"          "Root (Backend)"
install_npm "$SCRIPT_DIR/telegram" "Telegram Bot (grammy)"
install_npm "$SCRIPT_DIR/discord"  "Discord Bot (discord.js v14)"
install_npm "$SCRIPT_DIR/whatsapp" "WhatsApp Bot (whatsapp-web.js)"

# ============================================================
# STEP 6 — Puppeteer / Chromium for WhatsApp Bot
# ============================================================
step "Step 6: Puppeteer & Chromium for WhatsApp"

# Tell Puppeteer to use the system Chromium if available
# Otherwise, download its own Chromium
CHROMIUM_PATH=""

if command -v chromium-browser &>/dev/null; then
    CHROMIUM_PATH=$(command -v chromium-browser)
elif command -v chromium &>/dev/null; then
    CHROMIUM_PATH=$(command -v chromium)
elif command -v google-chrome &>/dev/null; then
    CHROMIUM_PATH=$(command -v google-chrome)
fi

if [ -n "$CHROMIUM_PATH" ]; then
    info "Found system Chromium at: $CHROMIUM_PATH"
    info "Setting PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true (using system browser)"
    
    # Add to .env if not already there
    if [ -f "$SCRIPT_DIR/.env" ]; then
        if ! grep -q "PUPPETEER_EXECUTABLE_PATH" "$SCRIPT_DIR/.env"; then
            echo "" >> "$SCRIPT_DIR/.env"
            echo "# Puppeteer — use system Chromium" >> "$SCRIPT_DIR/.env"
            echo "PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH" >> "$SCRIPT_DIR/.env"
        fi
    fi
    
    # Reinstall with skip flag to avoid Puppeteer downloading its own Chromium
    (cd "$SCRIPT_DIR/whatsapp" && \
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install --loglevel=warn 2>&1 | tail -3)
    
    ok "WhatsApp bot configured with system Chromium at $CHROMIUM_PATH"
else
    warn "No system Chromium found. Puppeteer will download its own (~170 MB)."
    info "This is fine — it will be used automatically by the WhatsApp bot."
    (cd "$SCRIPT_DIR/whatsapp" && npm install --loglevel=warn 2>&1 | tail -3)
    ok "Puppeteer Chromium download complete."
fi

# ============================================================
# STEP 7 — Downloads Folder & Data Directories
# ============================================================
step "Step 7: Creating Required Directories"

mkdir -p "$SCRIPT_DIR/downloads"
mkdir -p "$SCRIPT_DIR/data"
mkdir -p "$SCRIPT_DIR/.wwebjs_auth"

ok "directories: downloads/, data/, .wwebjs_auth/"

# ============================================================
# STEP 8 — .env File Setup
# ============================================================
step "Step 8: Environment File"

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        ok ".env created from .env.example"
        warn "IMPORTANT: Edit .env and fill in your API tokens before starting!"
    else
        warn "No .env.example found. Creating a blank .env..."
        cat > "$SCRIPT_DIR/.env" << 'ENVEOF'
# Bot Backend
BACKEND_URL=http://localhost:3000
PORT=3000

# OpenRouter AI Keys
OPENROUTER_API_KEY_1=your_openrouter_key_here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Which bots to start (comma-separated)
START_BOTS=backend,telegram,discord,whatsapp
ENVEOF
        ok ".env file created."
        warn "IMPORTANT: Edit .env and fill in your API tokens before starting!"
    fi
else
    ok ".env file already exists. Skipping creation."
fi

# ============================================================
# STEP 9 — FFmpeg Verification
# ============================================================
step "Step 9: Verifying FFmpeg"

if command -v ffmpeg &>/dev/null; then
    ok "FFmpeg: $(ffmpeg -version 2>&1 | head -1)"
else
    warn "FFmpeg not found! Clip cutting and conversion will NOT work."
    if [ "$OS" = "debian" ]; then
        info "Installing FFmpeg..."
        sudo apt-get install -y ffmpeg
    fi
fi

# ============================================================
# STEP 10 — Final Summary
# ============================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅ All Done! RaiXbot is ready to launch.${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}  📋 NEXT STEPS:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} Edit ${CYAN}.env${NC} and fill in your tokens:"
echo -e "     ${CYAN}nano .env${NC}"
echo ""
echo -e "  ${YELLOW}2.${NC} Start ALL bots (backend + TG + Discord + WhatsApp):"
echo -e "     ${CYAN}node index.js${NC}"
echo ""
echo -e "  ${YELLOW}3.${NC} Or start them individually:"
echo -e "     ${CYAN}node backend.js${NC}         ← Start backend API"
echo -e "     ${CYAN}node telegram/bot.js${NC}    ← Start Telegram bot"
echo -e "     ${CYAN}node discord/bot.js${NC}     ← Start Discord bot"
echo -e "     ${CYAN}node whatsapp/bot.js${NC}    ← Start WhatsApp bot"
echo ""
echo -e "  ${YELLOW}4.${NC} For production (auto-restart on crash):"
echo -e "     ${CYAN}npm install -g pm2${NC}"
echo -e "     ${CYAN}pm2 start index.js --name raixbot${NC}"
echo -e "     ${CYAN}pm2 save && pm2 startup${NC}"
echo ""
echo -e "  ${YELLOW}5.${NC} WhatsApp — On first run, scan the QR code in terminal."
echo -e "     After that it auto-logs in every time."
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Print ASCII art at end ─────────────────────────────────────
echo -e "${CYAN}${BOLD}"
cat << "EOF"
███╗   ███╗███████╗██████╗ ██╗ █████╗ ██████╗  ██████╗ ████████╗
████╗ ████║██╔════╝██╔══██╗██║██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██╔████╔██║█████╗  ██║  ██║██║███████║██████╔╝██║   ██║   ██║   
██║╚██╔╝██║██╔══╝  ██║  ██║██║██╔══██║██╔══██╗██║   ██║   ██║   
██║ ╚═╝ ██║███████╗██████╔╝██║██║  ██║██████╔╝╚██████╔╝   ██║   
╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝  
EOF
echo -e "${NC}"
