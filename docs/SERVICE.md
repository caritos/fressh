# Service Management Quick Reference

## Installation

```bash
# Install the daemon as a launchd service
bash daemon/install.sh

# The daemon will:
# • Start automatically on boot
# • Fetch feeds every 15 minutes
# • Restart automatically if it crashes
# • Log to ~/Library/Logs/rss-daemon/
```

## Stop/Start/Restart

```bash
# STOP the daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# START the daemon
launchctl load ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# RESTART the daemon (stop + start)
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.rss-daemon.plist
```

**When to restart:**
- After pulling code updates
- After changing configuration
- If the daemon seems stuck

**You DON'T need to restart when:**
- Adding/removing feeds (they're read from database each cycle)
- Articles are updated (daemon runs every 15 minutes automatically)

## Check Status

```bash
# Is the daemon running?
launchctl list | grep rss-daemon
# Output example: "12345  0  com.caritos.rss-daemon"
#                  ^^^^^ = process ID (means it's running)
# No output = daemon is stopped

# View real-time logs
./rss logs --follow

# Check recent activity
./rss logs -n 50

# View stats
./rss stats
```

## Uninstall

```bash
# Easy way (with prompts)
bash daemon/uninstall.sh

# Manual way
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist
rm ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# Optional: remove all data
rm -rf ~/Library/Application\ Support/rss-daemon
rm -rf ~/Library/Logs/rss-daemon
```

## Troubleshooting

### Daemon won't start

```bash
# Check for errors in stderr
cat ~/Library/Logs/rss-daemon/stderr.log

# Try running in foreground to see errors
./rss start
# (Ctrl+C to stop)

# Check the plist file is correct
cat ~/Library/LaunchAgents/com.caritos.rss-daemon.plist
```

### Daemon not fetching

```bash
# Check when it last ran
./rss logs -n 20

# Manually trigger a fetch
./rss refresh

# Check feed count
./rss stats
```

### Daemon using too much memory/CPU

```bash
# Check process
ps aux | grep rss-daemon

# Reduce concurrent fetches (edit src/config.ts)
# Change maxConcurrentFetches from 5 to 3
# Then restart
```

## File Locations

```
~/Library/LaunchAgents/com.caritos.rss-daemon.plist    # Service definition
~/Library/Logs/rss-daemon/daemon.log                # Main log file
~/Library/Logs/rss-daemon/stdout.log                # Standard output
~/Library/Logs/rss-daemon/stderr.log                # Error output
~/Library/Application Support/rss-daemon/articles.db # Database
```

## Common Tasks

### After updating code

```bash
# 1. Stop daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# 2. Pull changes / edit code
git pull
# or edit files

# 3. No need to rebuild (Bun runs TypeScript directly!)

# 4. Restart daemon
launchctl load ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# 5. Verify it's running
./rss logs --follow
```

### Temporarily disable automatic fetching

```bash
# Stop the daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist

# Use manual refresh when you want
./rss refresh

# Re-enable automatic fetching
launchctl load ~/Library/LaunchAgents/com.caritos.rss-daemon.plist
```

### Change fetch interval

```bash
# Edit the config
vim ~/.rss-daemon/config.json

# Add/change:
{
  "fetchInterval": 600  // 10 minutes instead of 15
}

# Restart daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.rss-daemon.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.rss-daemon.plist
```
