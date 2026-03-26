# fressh - Cheat Sheet

**📖 For detailed service management, see [SERVICE.md](SERVICE.md)**

## Essential Commands

```bash
./fressh stats                            # Show feed/article counts
./fressh logs --follow                    # Watch daemon in real-time
./fressh test "https://feed.url"          # Test feed (auto-detects YouTube & Reddit!)
./fressh add "https://feed.url"           # Add feed (auto-detects YouTube & Reddit!)
./fressh list                             # List all feeds
./fressh remove "https://feed.url"        # Remove a feed
./fressh import subscriptions.opml        # Import feeds
./fressh refresh                          # Force immediate fetch
```

## Quick Add Examples

```bash
# YouTube channels
./fressh add "https://www.youtube.com/@kurzgesagt"

# Reddit subreddits
./fressh add "https://www.reddit.com/r/programming"

# Regular RSS feeds
./fressh add "https://xkcd.com/rss.xml"
```

## Daily Workflow

```bash
# Check what's new
./fressh stats

# View recent logs
./fressh logs -n 20

# Test a YouTube feed
./fressh test "https://www.youtube.com/feeds/videos.xml?channel_id=..."

# Edit and re-import feeds
vim subscriptions.opml
./fressh import subscriptions.opml
```

## Service Control

```bash
# Stop the daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist

# Start the daemon
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Restart (after code changes)
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Check if running (output = running, no output = stopped)
launchctl list | grep fressh

# Uninstall completely
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist
rm ~/Library/LaunchAgents/com.caritos.fressh.plist
```

## File Locations

```bash
# Database
~/Library/Application Support/fressh/articles.db

# Main log file
~/Library/Logs/fressh/daemon.log

# Launchd service
~/Library/LaunchAgents/com.caritos.fressh.plist

# OPML file
./subscriptions.opml
```

## Quick Queries

```bash
# Query database directly
sqlite3 ~/Library/Application\ Support/fressh/articles.db

# In SQLite:
SELECT COUNT(*) FROM articles WHERE read = 0;
SELECT title, url FROM articles WHERE read = 0 LIMIT 10;
UPDATE articles SET read = 1 WHERE id = 123;
```

## Troubleshooting

```bash
# View recent errors
./fressh logs | grep ERROR

# Check daemon status
launchctl list | grep fressh

# View full logs
tail -100 ~/Library/Logs/fressh/daemon.log

# Test database
./fressh stats

# Force refresh to test
./fressh refresh
```
