# RSS Daemon Specification
**A Lightweight Background RSS Reader for macOS**

## Problem Statement

NetNewsWire requires the app to be running for iCloud sync to occur, causing jarvis to:
- Open NetNewsWire before each sync (resource intensive)
- Wait 60 seconds for iCloud sync (slow)
- Read from a database that may be stale if app wasn't running

**Goal**: Build a minimal, daemon-based RSS reader that continuously syncs in the background without requiring a GUI app to be open.

---

## Core Requirements

### Functional Requirements
1. **Background Operation**: Fetch RSS feeds continuously without user interaction
2. **Low Resource Usage**: Minimal CPU/memory footprint when idle
3. **Direct Access**: Expose articles via SQLite database for jarvis integration
4. **Reliability**: Handle network failures, malformed feeds gracefully
5. **OPML Import**: Support standard OPML format for feed subscriptions

### Non-Functional Requirements
- **CPU**: <1% when idle, <5% when actively fetching
- **Memory**: <50MB resident
- **Disk**: Efficient storage with automatic cleanup of old articles
- **Startup**: Launch on boot via launchd
- **Logging**: Structured logs for debugging

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────┐
│         RSS Daemon (Node.js)            │
│                                         │
│  ┌──────────────┐   ┌───────────────┐  │
│  │   Scheduler  │   │  Feed Fetcher │  │
│  │  (cron-like) │──▶│   (parallel)  │  │
│  └──────────────┘   └───────────────┘  │
│                            │            │
│                            ▼            │
│                     ┌─────────────┐    │
│                     │   Parser    │    │
│                     │ (RSS/Atom)  │    │
│                     └─────────────┘    │
│                            │            │
│                            ▼            │
│                   ┌──────────────────┐  │
│                   │  SQLite Database │  │
│                   │   (articles.db)  │  │
│                   └──────────────────┘  │
└─────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   jarvis (reader)    │
              │  reads unread items  │
              └──────────────────────┘
```

### Component Breakdown

#### 1. Scheduler
- **Purpose**: Trigger feed fetches at configurable intervals
- **Implementation**: node-cron
- **Default**: Every 15 minutes
- **Configurable**: Per-feed custom intervals

#### 2. Feed Fetcher
- **Purpose**: Download RSS/Atom feeds via HTTP
- **Implementation**: axios with retry logic
- **Features**:
  - Parallel fetching (max 5 concurrent)
  - ETag/Last-Modified support (bandwidth optimization)
  - Timeout handling (30s per feed)
  - User-Agent rotation (avoid blocking)

#### 3. Parser
- **Purpose**: Extract articles from RSS/Atom XML
- **Implementation**: feedparser or rss-parser
- **Handles**:
  - RSS 2.0
  - Atom 1.0
  - JSON Feed
  - Malformed XML (best-effort parsing)

#### 4. Database
- **Purpose**: Store feeds, articles, read/unread state
- **Implementation**: better-sqlite3 (synchronous, fast)
- **Location**: `~/Library/Application Support/rss-daemon/articles.db`

---

## Data Model

### Database Schema

```sql
-- Feeds table
CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  site_url TEXT,
  last_fetch DATETIME,
  last_modified TEXT,     -- HTTP Last-Modified header
  etag TEXT,              -- HTTP ETag header
  fetch_interval INTEGER DEFAULT 900,  -- seconds (15 min)
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Articles table
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  guid TEXT NOT NULL,     -- Unique article identifier
  title TEXT,
  url TEXT,
  author TEXT,
  content_html TEXT,
  content_text TEXT,      -- Stripped HTML for full-text search
  summary TEXT,
  published_at DATETIME,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
  UNIQUE(feed_id, guid)
);

-- Indexes for performance
CREATE INDEX idx_articles_feed_id ON articles(feed_id);
CREATE INDEX idx_articles_read ON articles(read);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_guid ON articles(guid);

-- Full-text search (optional, for future)
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, content_text, content='articles', content_rowid='id'
);
```

### Data Retention Policy

- **Keep unread**: Forever (user decides when to delete)
- **Keep read**: 30 days (configurable)
- **Auto-cleanup**: Daily at 3:00 AM
- **Max articles per feed**: 1000 (keep most recent)

---

## API / Interface

### Configuration File: `~/.rss-daemon/config.json`

```json
{
  "daemon": {
    "fetch_interval": 900,
    "max_concurrent_fetches": 5,
    "timeout_seconds": 30,
    "cleanup_retention_days": 30,
    "max_articles_per_feed": 1000
  },
  "database": {
    "path": "~/Library/Application Support/rss-daemon/articles.db"
  },
  "logging": {
    "level": "info",
    "path": "~/Library/Logs/rss-daemon/"
  }
}
```

### OPML Import: `subscriptions.opml`

Standard OPML format:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head><title>RSS Subscriptions</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="Daring Fireball"
               xmlUrl="https://daringfireball.net/feeds/json"/>
      <outline type="rss" text="Kottke"
               xmlUrl="http://feeds.kottke.org/json"/>
    </outline>
  </body>
</opml>
```

### CLI Interface

```bash
# Start daemon
rss-daemon start

# Stop daemon
rss-daemon stop

# Import OPML
rss-daemon import subscriptions.opml

# Export OPML
rss-daemon export > my-feeds.opml

# Add single feed
rss-daemon add "https://example.com/feed.xml"

# Remove feed
rss-daemon remove "https://example.com/feed.xml"

# Force refresh all feeds
rss-daemon refresh

# Show stats
rss-daemon stats
# Output:
#   Feeds: 45
#   Unread: 234
#   Total articles: 12,456
#   Last sync: 2 minutes ago

# Mark all as read
rss-daemon mark-all-read

# Cleanup old articles
rss-daemon cleanup
```

### Programmatic Access (for jarvis)

```javascript
// jarvis can directly query the database
import Database from 'better-sqlite3';

const db = new Database('~/Library/Application Support/rss-daemon/articles.db');

// Get unread articles
const unread = db.prepare(`
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.read = 0
  ORDER BY a.published_at DESC
`).all();

// Mark as read
db.prepare('UPDATE articles SET read = 1 WHERE id = ?').run(articleId);
```

---

## Implementation Plan

### Phase 1: Core Daemon (Week 1)
- [x] Project setup (TypeScript + Node.js)
- [x] SQLite database schema
- [x] Feed fetcher with retry logic
- [x] RSS/Atom parser
- [x] Basic scheduler (every 15 min)
- [x] OPML import
- [x] Launchd integration

### Phase 2: Optimization (Week 2)
- [ ] ETag/Last-Modified caching
- [ ] Parallel feed fetching
- [ ] Article deduplication
- [ ] Automatic cleanup
- [ ] Error handling & logging

### Phase 3: CLI & Integration (Week 3)
- [ ] CLI commands
- [ ] OPML export
- [ ] Stats dashboard
- [ ] jarvis integration
- [ ] Testing & debugging

### Phase 4: Polish (Week 4)
- [ ] Performance tuning
- [ ] Memory optimization
- [ ] Comprehensive logging
- [ ] Documentation
- [ ] Migration tool from NetNewsWire

---

## Technical Stack

### Core Dependencies
```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",      // Fast SQLite
    "rss-parser": "^3.13.0",         // RSS/Atom parser
    "axios": "^1.6.0",               // HTTP client
    "node-cron": "^3.0.3",           // Scheduler
    "fast-xml-parser": "^4.3.0",     // OPML parsing
    "commander": "^11.1.0"           // CLI framework
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0"
  }
}
```

### File Structure
```
rss-daemon/
├── src/
│   ├── index.ts              # Main entry point
│   ├── daemon.ts             # Daemon orchestration
│   ├── scheduler.ts          # Cron scheduler
│   ├── fetcher.ts            # HTTP feed fetcher
│   ├── parser.ts             # RSS/Atom parser
│   ├── database.ts           # SQLite operations
│   ├── opml.ts               # OPML import/export
│   ├── cli.ts                # CLI interface
│   └── config.ts             # Configuration loader
├── daemon/
│   ├── com.user.rss-daemon.plist  # Launchd config
│   └── install.sh            # Installation script
├── test/
│   └── *.test.ts             # Unit tests
├── package.json
├── tsconfig.json
└── README.md
```

---

## Performance Benchmarks

### Target Metrics
- **Startup time**: <500ms
- **Feed fetch (50 feeds)**: <10s
- **Database write (100 articles)**: <100ms
- **Memory footprint**: 30-50MB RSS
- **CPU idle**: <0.5%
- **CPU active**: 2-5%

### Optimization Strategies
1. **Connection pooling**: Reuse HTTP connections
2. **Database batching**: Insert articles in transactions
3. **Lazy parsing**: Only parse new articles (use ETags)
4. **Compression**: gzip/brotli for HTTP requests
5. **Indexing**: Proper SQLite indexes for queries

---

## Deployment

### Launchd Configuration: `com.user.rss-daemon.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.rss-daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/USERNAME/rss-daemon/dist/index.js</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/USERNAME/Library/Logs/rss-daemon/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/USERNAME/Library/Logs/rss-daemon/stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

### Installation
```bash
# Install daemon
cd ~/rss-daemon
npm install
npm run build

# Install launchd service
bash daemon/install.sh

# Import feeds from NetNewsWire
rss-daemon import ~/Downloads/subscriptions.opml

# Check status
rss-daemon stats
```

---

## Integration with jarvis

### Replace NetNewsWire Service

```typescript
// src/services/rss-daemon.ts
import Database from 'better-sqlite3';

const RSS_DB_PATH = process.env.RSS_DAEMON_DB ||
  `${process.env.HOME}/Library/Application Support/rss-daemon/articles.db`;

class RssDaemonService {
  /**
   * Get unread articles (no need to open app!)
   */
  getUnreadArticles(limit?: number): Article[] {
    const db = new Database(RSS_DB_PATH, { readonly: true });

    let sql = `
      SELECT
        a.id,
        a.title,
        a.url,
        a.author,
        a.content_html,
        a.content_text,
        a.summary,
        a.published_at,
        f.title as feed_title,
        f.site_url as feed_url
      FROM articles a
      JOIN feeds f ON a.feed_id = f.id
      WHERE a.read = 0
      ORDER BY a.published_at DESC
    `;

    if (limit) sql += ` LIMIT ${limit}`;

    const articles = db.prepare(sql).all();
    db.close();

    return articles;
  }

  /**
   * Mark articles as read
   */
  markAsRead(articleIds: number[]): void {
    const db = new Database(RSS_DB_PATH);
    const stmt = db.prepare('UPDATE articles SET read = 1 WHERE id = ?');

    for (const id of articleIds) {
      stmt.run(id);
    }

    db.close();
  }

  /**
   * Export to Obsidian (same as before, but faster!)
   */
  async exportUnreadArticles(): Promise<ExportResult> {
    // No need to open app or wait for sync!
    const articles = this.getUnreadArticles();

    // Process articles...
    // (existing logic from NetNewsWire service)

    return result;
  }
}

export const rssDaemonService = new RssDaemonService();
```

### Update Scheduler

```typescript
// src/services/scheduler.ts

// Before (slow):
// 1. Open NetNewsWire
// 2. Wait 60 seconds
// 3. Read database
// 4. Process articles

// After (instant):
// 1. Read database (RSS daemon keeps it fresh)
// 2. Process articles

const rssSyncTask = cron.schedule(
  config.rssSync.schedule,
  async () => {
    console.log('\n📰 Running scheduled RSS sync...');

    // RSS daemon keeps database fresh - just read it!
    const result = await rssDaemonService.exportUnreadArticles();

    console.log(`✅ RSS sync complete: ${result.exported} exported`);
  }
);
```

---

## Migration from NetNewsWire

### Export OPML from NetNewsWire
1. Open NetNewsWire
2. File → Export Subscriptions...
3. Save as `subscriptions.opml`

### Import to RSS Daemon
```bash
rss-daemon import ~/Downloads/subscriptions.opml
```

### Test & Verify
```bash
# Wait a few minutes for initial fetch
rss-daemon stats

# Should show:
# Feeds: 45
# Unread: 234
# Last sync: 1 minute ago
```

### Switch jarvis Configuration
```bash
# In .env
RSS_READER=rss-daemon  # instead of netnewswire
```

---

## Future Enhancements

### Phase 5: Advanced Features
- [ ] **Web UI**: Simple web interface for browsing (optional)
- [ ] **Full-text search**: FTS5 search across articles
- [ ] **Tagging**: Custom tags/categories
- [ ] **Filters**: Auto-tag based on keywords
- [ ] **Read-later**: Integration with Instapaper/Pocket
- [ ] **Webhooks**: Trigger actions on new articles
- [ ] **AI summaries**: Built-in Claude summarization
- [ ] **Newsletter support**: Parse email newsletters

### Phase 6: iOS Companion
- [ ] **Sync protocol**: Custom sync between Mac daemon and iOS app
- [ ] **iOS app**: Native SwiftUI reader
- [ ] **CloudKit sync**: Share read/unread state via iCloud

---

## Why This Beats NetNewsWire for jarvis

| Feature | NetNewsWire | RSS Daemon |
|---------|-------------|------------|
| Background sync | ❌ Requires app open | ✅ Always running |
| Sync latency | 60 seconds | <1 second |
| Resource usage | ~200MB (GUI app) | ~30MB (daemon) |
| jarvis integration | Complex (open app, wait) | Direct (read DB) |
| OPML support | ✅ Yes | ✅ Yes |
| iOS app | ✅ Yes | ❌ Not yet |
| User interface | ✅ Beautiful GUI | ❌ CLI only |

**Best of both worlds**: Keep NetNewsWire for reading on iOS, use RSS Daemon for Mac background sync + jarvis integration.

---

## Cost & Timeline Estimate

### Development Time
- **Solo developer**: 3-4 weeks part-time
- **With AI assistance**: 1-2 weeks
- **Maintenance**: <2 hrs/month

### Infrastructure Costs
- **Server**: $0 (runs locally)
- **API costs**: $0 (no external APIs)
- **Total**: $0

### Complexity
- **Lines of code**: ~2,000
- **Dependencies**: 6 core packages
- **Configuration**: Single JSON file
- **Learning curve**: Low (similar to jarvis architecture)

---

## Decision Matrix

### Should You Build This?

**Build RSS Daemon if**:
- ✅ You want instant RSS sync (no 60s wait)
- ✅ You prefer lightweight daemons over GUI apps
- ✅ You primarily use jarvis for RSS consumption
- ✅ You enjoy building custom tools
- ✅ You want full control over data/sync

**Stick with NetNewsWire if**:
- ✅ You actively read RSS on Mac GUI
- ✅ You need iOS app with beautiful UI
- ✅ You don't want to maintain custom code
- ✅ iCloud sync across devices is critical
- ✅ 60s sync delay is acceptable

### Hybrid Approach (Recommended)
1. **Build RSS Daemon** for Mac background sync
2. **Keep NetNewsWire** for iOS reading
3. **Optional**: Export read/unread state back to NetNewsWire via OPML

---

## Conclusion

This specification provides a complete blueprint for a production-ready RSS daemon that solves the core problem: **RSS feeds should sync in the background without requiring a GUI app to be open**.

The daemon is:
- **Lightweight**: <50MB memory, <1% CPU idle
- **Fast**: No app launch overhead, instant database access
- **Reliable**: Runs continuously via launchd
- **Compatible**: Standard OPML, direct SQLite access
- **Maintainable**: Simple TypeScript codebase

**Next Steps**:
1. Review this spec and provide feedback
2. Set up project skeleton
3. Implement Phase 1 (core daemon)
4. Test with subset of feeds
5. Migrate from NetNewsWire
6. Integrate with jarvis

Ready to build?
