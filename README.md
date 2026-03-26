<p align="center">
  <img src="docs/assets/logo.png" alt="fressh logo" width="200">
</p>

# fressh

**Fresh RSS** - A lightweight, daemon-based RSS reader for macOS that runs continuously in the background, fetching RSS feeds and storing articles in SQLite for direct database access.

Built with **Bun** for maximum performance - instant TypeScript execution, no build step needed!

**📖 Quick Links:**
- **[QUICKSTART.md](docs/QUICKSTART.md)** - Get started in 3 steps
- **[SERVICE.md](docs/SERVICE.md)** - Stop/Start/Restart the daemon
- **[CHEATSHEET.md](docs/CHEATSHEET.md)** - Common commands

## Features

- **Background daemon** - Runs continuously via launchd, no need to keep apps open
- **Efficient fetching** - Fetches feeds every 15 minutes with HTTP caching support
- **SQLite storage** - Direct database access for integration with other tools
- **OPML import/export** - Easy migration from other RSS readers
- **Concurrent fetching** - Parallel feed fetching with rate limiting
- **Error resilient** - Never crashes on individual feed failures

## Installation

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Install as launchd service (runs on boot)
bash daemon/install.sh

# To stop/start/restart the service, see docs/SERVICE.md
```

That's it! No build step needed - Bun runs TypeScript directly.

**📖 For service management (stop/start/restart), see [SERVICE.md](docs/SERVICE.md)**

### Alternative: Node.js

If you prefer Node, the project also works with it:
```bash
npm install && npm run build
bash daemon/install.sh
```

## Quick Start

### 1. Import your feeds from OPML

```bash
./fressh import subscriptions.opml
# Or: bun src/index.ts import subscriptions.opml
```

### 2. View statistics

```bash
./fressh stats
```

### 3. Check logs

```bash
./fressh logs --follow
```

The daemon will automatically fetch feeds every 15 minutes and store articles in:
```
~/Library/Application Support/fressh/articles.db
```

## Service Management

After installing with `bash daemon/install.sh`, the daemon runs in the background.

### Stop/Start/Restart

```bash
# Stop the daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist

# Start the daemon
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Restart (use after updating code)
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist
```

### Check Status

```bash
# Is it running?
launchctl list | grep fressh
# Output: "12345  0  com.caritos.fressh" means running
# No output means stopped

# View live logs
./fressh logs --follow

# Check last fetch
./fressh logs -n 20
```

### Uninstall Service

```bash
# Remove from launchd
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist
rm ~/Library/LaunchAgents/com.caritos.fressh.plist

# Optionally remove database and logs
rm -rf ~/Library/Application\ Support/fressh
rm -rf ~/Library/Logs/fressh
```

## CLI Commands

All commands can be run with `./fressh <command>` or `bun src/index.ts <command>`.

### Feed Management

```bash
# Test if a feed is valid (auto-detects YouTube & Reddit!)
./fressh test <feed-url>
./fressh test "https://www.youtube.com/@kurzgesagt"
./fressh test "https://www.reddit.com/r/programming"

# Add a feed (auto-detects YouTube & Reddit!)
./fressh add <feed-url>
./fressh add "https://www.youtube.com/@veritasium"
./fressh add "https://www.reddit.com/r/tennis"

# List all feeds
./fressh list

# Remove a feed
./fressh remove <feed-url>

# Import/export OPML
./fressh import <opml-file>
./fressh export [output-file]
```

### Supported Feed Types

The daemon automatically detects and converts:

**YouTube Channels:**
```bash
./fressh add "https://www.youtube.com/@username"
./fressh add "https://www.youtube.com/c/channel"
./fressh add "https://www.youtube.com/channel/UC..."
# Auto-converts to: https://www.youtube.com/feeds/videos.xml?channel_id=...
```

**Reddit Subreddits:**
```bash
./fressh add "https://www.reddit.com/r/subreddit"
./fressh add "https://www.reddit.com/r/subreddit/"
# Auto-converts to: https://www.reddit.com/r/subreddit/top/.rss?t=month&limit=10
# Shows only top 10 posts from this month - minimal noise!
```

**Regular RSS/Atom Feeds:**
```bash
./fressh add "https://example.com/feed.xml"
./fressh add "https://example.com/rss"
# Works as-is
```

### Daemon Control

```bash
# Start daemon in foreground (for testing)
./fressh start

# Force refresh all feeds immediately
./fressh refresh

# View statistics
./fressh stats

# View logs
./fressh logs                # Show last 50 lines
./fressh logs -n 100         # Show last 100 lines
./fressh logs --follow       # Follow logs in real-time
```

### Article Management

```bash
# Mark all articles as read
./fressh mark-all-read

# Delete old read articles
./fressh cleanup --days 30
```

### Service Management

```bash
# Stop the daemon
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist

# Start the daemon
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Restart the daemon (after code changes)
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Check if daemon is running
launchctl list | grep fressh
# If running, you'll see output like: "12345  0  com.caritos.fressh"

# Completely uninstall the service
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist
rm ~/Library/LaunchAgents/com.caritos.fressh.plist
```

## Database Access

The daemon stores all data in SQLite at:
```
~/Library/Application Support/fressh/articles.db
```

### Schema

**Feeds table:**
```sql
CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  site_url TEXT,
  last_fetch DATETIME,
  last_modified TEXT,
  etag TEXT,
  fetch_interval INTEGER DEFAULT 900,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Articles table:**
```sql
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  guid TEXT NOT NULL,
  title TEXT,
  url TEXT,
  author TEXT,
  content_html TEXT,
  content_text TEXT,
  summary TEXT,
  published_at DATETIME,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
  UNIQUE(feed_id, guid)
);
```

### Example Queries

```sql
-- Get unread articles
SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC LIMIT 10;

-- Mark article as read
UPDATE articles SET read = 1 WHERE id = ?;

-- Get articles from specific feed
SELECT a.* FROM articles a
JOIN feeds f ON a.feed_id = f.id
WHERE f.url = 'https://example.com/feed.xml'
ORDER BY a.published_at DESC;

-- Get unread count by feed
SELECT f.title, COUNT(*) as unread
FROM articles a
JOIN feeds f ON a.feed_id = f.id
WHERE a.read = 0
GROUP BY f.id;
```

## Integration Example (jarvis)

Access the database directly from your tools:

```python
import sqlite3

db_path = os.path.expanduser('~/Library/Application Support/fressh/articles.db')
conn = sqlite3.connect(db_path)

# Get unread articles
cursor = conn.execute('''
    SELECT a.id, a.title, a.url, a.published_at, f.title as feed_title
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.read = 0
    ORDER BY a.published_at DESC
    LIMIT 10
''')

for row in cursor:
    print(f"{row[1]} - {row[4]}")

# Mark as read
conn.execute('UPDATE articles SET read = 1 WHERE id = ?', (article_id,))
conn.commit()
```

## Configuration

Default configuration:
```json
{
  "databasePath": "~/Library/Application Support/fressh/articles.db",
  "logLevel": "info",
  "fetchInterval": 900,
  "maxConcurrentFetches": 5,
  "httpTimeout": 30000,
  "userAgent": "fressh/1.0",
  "excludeYouTubeShorts": false,
  "maxArticleAgeDays": 30
}
```

Override via `~/.fressh/config.json` or environment variables:
```bash
export FRESSH_DB_PATH="/custom/path/articles.db"
export FRESSH_LOG_LEVEL="debug"
export FRESSH_FETCH_INTERVAL="600"
```

### Filtering YouTube Shorts

To exclude YouTube Shorts from all feeds, create or edit `~/.fressh/config.json`:

```json
{
  "excludeYouTubeShorts": true
}
```

This will filter out any videos with URLs containing `/shorts/` during feed parsing, preventing them from being stored in the database. The filtering applies to all YouTube feeds.

### Filtering Old Articles

To only process articles published within a certain number of days, configure `maxArticleAgeDays`:

```json
{
  "maxArticleAgeDays": 30
}
```

This will skip articles older than the specified number of days during feed parsing, preventing old articles from being stored in the database. Set to `0` to disable this filter and process all articles regardless of age. Default is `30` days.

## Logs

The daemon writes detailed logs to help you monitor what's happening:

### Log Files

- **`~/Library/Logs/fressh/daemon.log`** - Main daemon log with detailed fetch information
- **`~/Library/Logs/fressh/stdout.log`** - Standard output (when running via launchd)
- **`~/Library/Logs/fressh/stderr.log`** - Error output (when running via launchd)

### Viewing Logs

```bash
# Use the built-in logs command (recommended)
./fressh logs                # Last 50 lines
./fressh logs -n 100         # Last 100 lines
./fressh logs --follow       # Follow in real-time

# Or use standard Unix tools
tail -f ~/Library/Logs/fressh/daemon.log
grep ERROR ~/Library/Logs/fressh/daemon.log
```

### What Gets Logged

The daemon logs include:
- **Daemon lifecycle**: Start, stop, configuration
- **Fetch cycles**: When fetches start/complete, duration, success/failure counts
- **Individual feeds**: Success (✓), errors (✗), new article counts
- **HTTP caching**: "Not Modified" responses (saves bandwidth)
- **Errors**: Failed fetches, parse errors, network issues
- **Scheduling**: Next fetch time

Example log output:
```
[2026-03-12T10:27:14.348Z] INFO: --- Fetch Cycle Starting ---
[2026-03-12T10:27:14.351Z] INFO: Fetching 563 feeds (max 5 concurrent)...
[2026-03-12T10:27:14.472Z] INFO: ✓ xkcd.com: 4 new articles
[2026-03-12T10:27:14.589Z] INFO: ✓ Hacker News: 30 new articles
[2026-03-12T10:27:14.682Z] ERROR: ✗ Error fetching https://broken.example.com/feed.xml
[2026-03-12T10:27:30.156Z] INFO: --- Fetch Cycle Complete ---
[2026-03-12T10:27:30.156Z] INFO: Total: 563 feeds | Success: 551 | Not Modified: 6 | Failed: 6
[2026-03-12T10:27:30.157Z] INFO: New articles: 9739 | Duration: 15.8s
[2026-03-12T10:27:30.170Z] INFO: Next fetch scheduled for: 3/12/2026, 6:42:30 AM
```


## Development

```bash
# Install dependencies
bun install

# Run commands
./fressh start
./fressh test "https://xkcd.com/rss.xml"

# Run tests
bun test/database.test.ts
bun test/test-fetch.ts "https://xkcd.com/rss.xml"
```

### Why Bun?

- ⚡ **Instant execution**: No build step, TypeScript runs directly
- 🗄️ **Built-in SQLite**: Native `bun:sqlite` (faster than better-sqlite3)
- 📦 **Fast installs**: Dependencies install in ~60ms (100x faster than npm)
- 🚀 **Better performance**: 35% faster feed fetching (10.2s vs 15.8s for 563 feeds)
- 🔄 **Drop-in replacement**: Works with existing Node packages

## Architecture

- **Bun** - Fast JavaScript runtime with native TypeScript support
- **TypeScript** - Full type safety, runs directly without compilation
- **bun:sqlite** - Native SQLite with WAL mode (faster than better-sqlite3)
- **RSS Parser** - Supports RSS 2.0, Atom 1.0, and JSON Feed
- **p-limit** - Controlled concurrent fetching (max 5 parallel)
- **node-cron** - Scheduled tasks (every 15 minutes)

## License

MIT
# fressh
