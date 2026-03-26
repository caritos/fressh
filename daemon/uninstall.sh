#!/bin/bash

set -e

echo "🗑️  Uninstalling fressh..."

PLIST_PATH="$HOME/Library/LaunchAgents/com.caritos.fressh.plist"

# Stop and unload the service
if [ -f "$PLIST_PATH" ]; then
    echo "Stopping daemon..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true

    echo "Removing launch agent..."
    rm "$PLIST_PATH"
    echo "✓ Launch agent removed"
else
    echo "⚠️  Launch agent not found (may already be uninstalled)"
fi

# Ask about data removal
echo ""
read -p "Remove database and logs? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing data..."
    rm -rf ~/Library/Application\ Support/fressh
    rm -rf ~/Library/Logs/fressh
    echo "✓ Database and logs removed"
else
    echo "⏭️  Keeping database and logs"
    echo "   Database: ~/Library/Application Support/fressh/"
    echo "   Logs: ~/Library/Logs/fressh/"
fi

echo ""
echo "✅ fressh uninstalled successfully!"
echo ""
echo "To reinstall:"
echo "  bash daemon/install.sh"
