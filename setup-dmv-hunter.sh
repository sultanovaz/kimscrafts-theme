#!/bin/bash
# ============================================================
# DMV Hunter Bot - One-Click Setup for Mac
# ============================================================
# Run this:  chmod +x setup-dmv-hunter.sh && ./setup-dmv-hunter.sh
# ============================================================

set -e

echo "=========================================="
echo "  DMV Cancellation Hunter - Mac Setup"
echo "=========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[!] Python 3 not found. Install it:"
    echo "    brew install python3"
    exit 1
fi
echo "[+] Python3 found: $(python3 --version)"

# Install dependencies
echo "[*] Installing Python packages..."
pip3 install playwright --quiet
echo "[*] Installing Chromium browser for automation..."
python3 -m playwright install chromium

echo ""
echo "[+] Setup complete!"
echo ""
echo "=========================================="
echo "  HOW TO RUN"
echo "=========================================="
echo ""
echo "  OPTION 1 - Run in terminal (see output):"
echo "    python3 dmv-hunter.py"
echo ""
echo "  OPTION 2 - Run in background:"
echo "    nohup python3 dmv-hunter.py &"
echo ""
echo "  OPTION 3 - Auto-start on login (recommended):"
echo "    1. Edit com.dmv.hunter.plist - replace YOUR_USERNAME"
echo "    2. cp com.dmv.hunter.plist ~/Library/LaunchAgents/"
echo "    3. launchctl load ~/Library/LaunchAgents/com.dmv.hunter.plist"
echo ""
echo "  The bot will:"
echo "    - Check all 13 DMV offices every 2-3 minutes"
echo "    - Send macOS notification + bounce dock when slot found"
echo "    - Open the booking page automatically"
echo "    - Log everything to dmv-hunter.log"
echo ""
echo "  Press Ctrl+C to stop if running in terminal."
echo "=========================================="
echo ""

read -p "Start the bot now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 dmv-hunter.py
fi
