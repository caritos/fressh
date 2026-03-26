#!/bin/bash

set -e

echo "🚀 Installing fressh..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Build the project
echo "📦 Building project..."
cd "$PROJECT_DIR"

if [ -n "$BUN_PATH" ]; then
    bun install
    bun run build
else
    npm install
    npm run build
fi

# Find bun or node path
BUN_PATH=$(which bun)
if [ -n "$BUN_PATH" ]; then
    RUNTIME_PATH="$BUN_PATH"
    echo "✓ Using Bun runtime: $BUN_PATH"
else
    NODE_PATH=$(which node)
    if [ -z "$NODE_PATH" ]; then
        echo "❌ Error: neither bun nor node found in PATH"
        exit 1
    fi
    RUNTIME_PATH="$NODE_PATH"
    echo "✓ Using Node runtime: $NODE_PATH"
fi

# Set up paths
DAEMON_PATH="$PROJECT_DIR/dist/index.js"
PLIST_TEMPLATE="$SCRIPT_DIR/com.caritos.fressh.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.caritos.fressh.plist"
LOG_DIR="$HOME/Library/Logs/fressh"

# Create log directory
mkdir -p "$LOG_DIR"

# Check if daemon exists
if [ ! -f "$DAEMON_PATH" ]; then
    echo "❌ Error: daemon not found at $DAEMON_PATH"
    echo "Run 'npm run build' first"
    exit 1
fi

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$HOME/Library/LaunchAgents"

# Stop existing daemon if running
if launchctl list | grep -q "com.caritos.fressh"; then
    echo "⏹️  Stopping existing daemon..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Copy and configure plist
echo "📝 Installing launch agent..."
sed -e "s|NODE_PATH|$RUNTIME_PATH|g" \
    -e "s|DAEMON_PATH|$DAEMON_PATH|g" \
    -e "s|LOG_DIR|$LOG_DIR|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"

# Load the launch agent
echo "▶️  Starting daemon..."
launchctl load "$PLIST_DEST"

# Wait a moment for the daemon to start
sleep 2

# Check if it's running
if launchctl list | grep -q "com.caritos.fressh"; then
    echo ""
    echo "✅ fressh installed successfully!"
    echo ""
    echo "The daemon is now running and will:"
    echo "  • Start automatically on login"
    echo "  • Fetch RSS feeds every 15 minutes"
    echo "  • Store articles in: ~/Library/Application Support/fressh/articles.db"
    echo ""
    echo "Logs can be found at:"
    echo "  • $LOG_DIR/stdout.log"
    echo "  • $LOG_DIR/stderr.log"
    echo ""
    echo "Useful commands:"
    if [ -n "$BUN_PATH" ]; then
        echo "  • Import feeds:  bun $DAEMON_PATH import <opml-file>"
        echo "  • View stats:    bun $DAEMON_PATH stats"
    else
        echo "  • Import feeds:  node $DAEMON_PATH import <opml-file>"
        echo "  • View stats:    node $DAEMON_PATH stats"
    fi
    echo "  • Stop daemon:   launchctl unload $PLIST_DEST"
    echo "  • Start daemon:  launchctl load $PLIST_DEST"
    echo "  • View logs:     tail -f $LOG_DIR/stdout.log"
else
    echo ""
    echo "⚠️  Daemon installed but may not be running"
    echo "Check logs at: $LOG_DIR/"
    exit 1
fi
