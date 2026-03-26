# fressh - Quick Start

## 1. Install

```bash
bun install
bash daemon/install.sh
```

## 2. Import Your Feeds

```bash
./fressh import subscriptions.opml
```

## 3. Watch It Work

```bash
./fressh logs --follow
```

Done! The daemon is now running in the background.

---

## Common Commands

```bash
./fressh stats              # View statistics
./fressh logs --follow      # Watch live logs
./fressh test "url"         # Test a feed before adding
./fressh refresh            # Force immediate fetch
```

## Stop/Start the Daemon

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist

# Start
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.caritos.fressh.plist && \
launchctl load ~/Library/LaunchAgents/com.caritos.fressh.plist
```

**📖 See [SERVICE.md](SERVICE.md) for complete service management docs**

## Managing Feeds

Edit `subscriptions.opml` then re-import:

```bash
vim subscriptions.opml
./fressh import subscriptions.opml
```

## Database Location

```
~/Library/Application Support/fressh/articles.db
```

Query directly with SQLite or from jarvis:

```sql
SELECT title, url FROM articles WHERE read = 0 LIMIT 10;
```

---

**📚 Documentation:**
- **[README.md](README.md)** - Full documentation
- **[SERVICE.md](SERVICE.md)** - Service management
- **[CHEATSHEET.md](CHEATSHEET.md)** - Command reference
- **[BUN-USAGE.md](BUN-USAGE.md)** - Why Bun & workflow
