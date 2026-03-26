# RSS Daemon - Quick Reference

**Bun is the default runtime** - all examples use the `./rss` wrapper for simplicity.

## Common Commands

```bash
# Test a feed before adding
./rss test "https://example.com/feed.xml"

# Import your subscriptions
./rss import subscriptions.opml

# Check statistics
./rss stats

# View logs
./rss logs --follow

# Force immediate refresh
./rss refresh
```

## Workflow: Managing Feeds

Since you manage feeds via OPML:

```bash
# 1. Edit subscriptions.opml (add/remove feeds)
vim subscriptions.opml

# 2. Test individual feeds (especially YouTube)
./rss test "https://www.youtube.com/feeds/videos.xml?channel_id=..."

# 3. Re-import (won't duplicate existing feeds)
./rss import subscriptions.opml

# 4. Check what was added
./rss stats

# 5. Watch it work
./rss logs --follow
```

## Installation

```bash
# One-time setup
bun install
bash daemon/install.sh

# The daemon now runs in the background
# Check status:
launchctl list | grep rss-daemon
```

## Why Bun?

| Feature | Node | Bun |
|---------|------|-----|
| Install time | 6s | 0.06s (100x faster) |
| Cold start | ~200ms | ~50ms (4x faster) |
| Refresh 563 feeds | 15.8s | 10.2s (35% faster) |
| Build step | Required | None - direct TypeScript |
| SQLite | better-sqlite3 (npm) | bun:sqlite (native) |

**Result**: Faster development, faster execution, simpler workflow.

## Database Access (for jarvis)

The database is just SQLite - query it directly:

```python
import sqlite3
db = sqlite3.connect(
    os.path.expanduser('~/Library/Application Support/rss-daemon/articles.db')
)

# Get unread
cursor = db.execute('''
    SELECT title, url FROM articles
    WHERE read = 0
    ORDER BY published_at DESC
    LIMIT 10
''')

# Mark as read
db.execute('UPDATE articles SET read = 1 WHERE id = ?', (article_id,))
db.commit()
```

No REST API needed!
