#!/bin/bash
# ============================================================
#  RaiXbot — Termux Setup Script
#  Telegram + Discord + WhatsApp bots on Android via Termux
#  Author: raimohan | github.com/raimohan/allinoneytbot
# ============================================================

# Exit on unset variables; do NOT use set -e (pkg errors are non-fatal in Termux)
set -u 2>/dev/null || true

# ── Colors ────────────────────────────────────────────────────
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✅ $1${NC}"; }
info() { echo -e "${CYAN}  ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
fail() { echo -e "${RED}  ❌ $1${NC}"; }
step() { echo -e "\n${MAGENTA}${BOLD}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Banner ────────────────────────────────────────────────────
clear
echo ""
echo -e "${CYAN}${BOLD}"
cat << "EOF"
 ___  ___  ___  ___  __   __             _     _
|   \| __|| __|  _ \ / _||  |___  ___  | |   | |__  ___  ___
| |) | _| | _|| |_) | _| |   _/ / -_) | |_  | '_ \/ _ \/ -_)
|___/|___||___|____/ |_|  |_|_|  \___| |___| |_.__/\___/\___|
                                                               
         Telegram · Discord · WhatsApp — All in One
               github.com/raimohan/allinoneytbot
EOF
echo -e "${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
warn "This script is designed for TERMUX on Android."
warn "Make sure you have Termux installed from F-Droid (NOT Play Store)."
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Detect Termux ────────────────────────────────────────────
if [ -z "$TERMUX_VERSION" ] && [ ! -d "/data/data/com.termux" ]; then
    warn "This script is intended for Termux. Detected non-Termux environment."
    warn "For VPS/Linux, use script.sh instead."
    echo ""
    read -p "Continue anyway? [y/N] " CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
        echo "Exiting."
        exit 0
    fi
fi

# ============================================================
# STEP 1 — Update Termux Packages
# ============================================================
step "Step 1: Update Termux Packages"
info "Updating package list..."
pkg update -y 2>/dev/null || apt-get update -y 2>/dev/null || true
pkg upgrade -y 2>/dev/null || true
ok "Packages updated."

# ============================================================
# STEP 2 — Install Core Packages
# ============================================================
step "Step 2: Core System Packages"

info "Installing essential packages..."
pkg install -y \
    nodejs \
    python \
    python-pip \
    ffmpeg \
    curl \
    wget \
    git \
    openssl \
    2>/dev/null || true

if command -v node &>/dev/null; then
    ok "Node.js: $(node --version)"
else
    warn "Node.js install may have failed. Try: pkg install nodejs"
fi
if command -v python &>/dev/null; then
    ok "Python: $(python --version 2>&1)"
fi
if command -v ffmpeg &>/dev/null; then
    ok "FFmpeg ready."
fi

# ============================================================
# STEP 3 — Storage Permission
# ============================================================
step "Step 3: Storage Permission"

info "Requesting storage permissions..."
termux-setup-storage 2>/dev/null || true
ok "Storage setup done (check phone if permission popup appeared)."

# ============================================================
# STEP 4 — Install yt-dlp
# ============================================================
step "Step 4: yt-dlp"

if command -v yt-dlp &>/dev/null; then
    info "Updating yt-dlp..."
    pip install -U yt-dlp 2>/dev/null
else
    info "Installing yt-dlp..."
    pip install yt-dlp 2>/dev/null
fi

ok "yt-dlp: $(yt-dlp --version)"

# Install curl_cffi extras for better platform compatibility
info "Installing yt-dlp extras (curl-cffi, brotli, websockets, mutagen)..."
pip install "yt-dlp[default]" 2>/dev/null || true

# Install yt-dlp-ejs — YouTube JS extension for PO Token / anti-bot challenges
info "Installing yt-dlp-ejs (YouTube PO Token / JS challenge support)..."
pip install -U yt-dlp-ejs 2>/dev/null || \
    warn "yt-dlp-ejs install failed (non-critical, yt-dlp still works)"

ok "yt-dlp setup complete."

# ============================================================
# STEP 5 — WhatsApp Bot: Puppeteer & Chromium Setup
# ============================================================
step "Step 5: WhatsApp / Puppeteer Setup"

warn "WhatsApp bot requires Chromium via Puppeteer."
warn "In Termux, we use a special lightweight approach."
echo ""
# Initialize with safe default
SKIP_CHROMIUM=false
CHROMIUM_BIN=""

pkg install -y chromium 2>/dev/null || true

if command -v chromium &>/dev/null; then
    CHROMIUM_BIN=$(command -v chromium)
    ok "System Chromium found at: $CHROMIUM_BIN"
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    export PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_BIN"
    SKIP_CHROMIUM=true
else
    warn "System Chromium not found. WhatsApp bot may not work on this device."
    warn "You can still use Telegram and Discord bots — set START_BOTS=backend,telegram,discord in .env"
    SKIP_CHROMIUM=false
fi


# ============================================================
# STEP 6 — npm Dependencies
# ============================================================
step "Step 6: Node.js Dependencies"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

install_npm() {
    local DIR="$1"
    local NAME="$2"
    if [ -f "$DIR/package.json" ]; then
        info "Installing $NAME..."
        if [ "$SKIP_CHROMIUM" = true ]; then
            (cd "$DIR" && PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
                PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_BIN" \
                npm install --loglevel=error 2>&1 | tail -3)
        else
            (cd "$DIR" && npm install --loglevel=error 2>&1 | tail -3)
        fi
        ok "$NAME: packages installed."
    else
        warn "$NAME: No package.json found."
    fi
}

install_npm "$SCRIPT_DIR"          "Root (Backend)"
install_npm "$SCRIPT_DIR/telegram" "Telegram Bot"
install_npm "$SCRIPT_DIR/discord"  "Discord Bot"
install_npm "$SCRIPT_DIR/whatsapp" "WhatsApp Bot"

# ============================================================
# STEP 7 — Create Directories
# ============================================================
step "Step 7: Directories"

mkdir -p "$SCRIPT_DIR/downloads"
mkdir -p "$SCRIPT_DIR/data"
mkdir -p "$SCRIPT_DIR/.wwebjs_auth"
ok "Created: downloads/, data/, .wwebjs_auth/"

# ============================================================
# STEP 8 — Environment File
# ============================================================
step "Step 8: .env File"

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        ok ".env created from template."
    else
        cat > "$SCRIPT_DIR/.env" << 'ENVEOF'
BACKEND_URL=http://localhost:3000
PORT=3000
OPENROUTER_API_KEY_1=your_openrouter_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
START_BOTS=backend,telegram,discord,whatsapp
ENVEOF
        ok ".env file created."
    fi

    # Auto-add Chromium path if found
    if [ "$SKIP_CHROMIUM" = true ]; then
        echo "" >> "$SCRIPT_DIR/.env"
        echo "# Termux Chromium path" >> "$SCRIPT_DIR/.env"
        echo "PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_BIN" >> "$SCRIPT_DIR/.env"
        ok "Chromium path added to .env"
    fi
else
    ok ".env already exists. Skipping."
fi

# ============================================================
# STEP 9 — Wake Lock Reminder
# ============================================================
step "Step 9: Termux Wake Lock"

echo ""
info "📱 IMPORTANT for Termux users:"
info "   To prevent Android from killing your bots:"
info "   → Run: termux-wake-lock"
info "   → Or enable: Termux > Acquire Wakelock (notification)"
info "   → Keep screen on OR use Termux:Boot"
echo ""

# ============================================================
# STEP 10 — Final Summary
# ============================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅ All Done! RaiXbot is ready for Termux.${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}  📋 NEXT STEPS:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} Add your tokens to ${CYAN}.env${NC}:"
echo -e "     ${CYAN}nano .env${NC}"
echo ""
echo -e "  ${YELLOW}2.${NC} Enable wake lock so Android doesn't kill bots:"
echo -e "     ${CYAN}termux-wake-lock${NC}"
echo ""
echo -e "  ${YELLOW}3.${NC} Start all bots:"
echo -e "     ${CYAN}node index.js${NC}"
echo ""
echo -e "  ${YELLOW}4.${NC} Run in background (no screen required):"
echo -e "     ${CYAN}nohup node index.js > bot.log 2>&1 &${NC}"
echo -e "     ${CYAN}tail -f bot.log${NC}  ← to monitor"
echo ""
echo -e "  ${YELLOW}5.${NC} WhatsApp: scan QR code once, then auto-logs in."
echo ""
echo -e "  ${YELLOW}6.${NC} Telegram/Discord only (if WhatsApp fails on Termux):"
echo -e "     Edit .env: ${CYAN}START_BOTS=backend,telegram,discord${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${YELLOW}GitHub  :${NC} ${CYAN}github.com/raimohan/allinoneytbot${NC}"
echo -e "  ${YELLOW}YouTube :${NC} ${CYAN}youtube.com/@raieditz56${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
