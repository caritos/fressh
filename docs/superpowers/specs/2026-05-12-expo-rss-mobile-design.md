# fressh Mobile — Expo RSS Reader Design

**Date:** 2026-05-12  
**Status:** Approved

## Overview

An iOS-only Expo app that acts as a standalone RSS reader, independent of the Mac daemon. It fetches feeds directly, stores everything in a local SQLite database on the device, and refreshes in the background. The UI is modeled after NetNewsWire: three-level stack navigation (feeds → articles → reader), clean native feel, unread counts on feed badges.

The app lives in the `mobile/` subfolder of the existing `fressh` repo.

## Architecture

The app is fully self-contained — no connection to the Mac daemon or its SQLite file. It manages its own subscriptions and article database on-device.

Three layers:
1. **Database** (`src/db/`) — expo-sqlite with raw SQL, same schema as the desktop fressh
2. **Fetcher** (`src/fetcher/`) — fetches and parses RSS/Atom/JSON Feed, handles YouTube and Reddit URL detection
3. **UI** (`app/`) — Expo Router file-based routing, three screens

Background refresh is registered as an `expo-task-manager` task and runs approximately every 30 minutes (iOS enforces a minimum interval and may defer). The app also triggers a fresh fetch on every foreground resume.

## Data Layer

Location: `mobile/src/db/`

### Schema

Identical to the desktop fressh schema:

```sql
CREATE TABLE IF NOT EXISTS feeds (
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

CREATE TABLE IF NOT EXISTS articles (
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

CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(read);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
```

### Files

- **`schema.ts`** — exports the `CREATE TABLE` and `CREATE INDEX` SQL strings
- **`database.ts`** — opens the SQLite connection via `expo-sqlite`, runs migrations on startup (version tracked in a `schema_version` table), exports a `db` singleton
- **`queries.ts`** — all raw SQL functions:
  - `getFeeds()` → feeds with unread count per feed
  - `getArticles(feedId | 'unread' | 'starred' | 'today')` → articles for a feed or smart feed
  - `getArticle(id)` → single article
  - `upsertFeed(feed)` → insert or update feed metadata
  - `insertArticles(articles[])` → bulk insert with `INSERT OR IGNORE`
  - `updateFeedFetchMeta(feedId, lastModified, etag, lastFetch)` → update caching headers
  - `markRead(id)` → set `read = 1`
  - `markAllRead(feedId)` → set all articles in a feed as read
  - `toggleStar(id)` → toggle `starred`
  - `deleteFeed(id)` → cascade deletes articles
  - `getTotalUnreadCount()` → for the app badge

## Feed Fetcher

Location: `mobile/src/fetcher/`

### Files

- **`detect.ts`** — converts YouTube channel URLs to RSS feed URLs, Reddit subreddit URLs to `.rss` URLs. Copied and adapted from `src/fetcher.ts` in the desktop fressh
- **`fetch.ts`** — fetches a single feed URL with `If-Modified-Since` and `ETag` headers for HTTP caching. Returns `{ status: 'ok', xml: string } | { status: 'not-modified' } | { status: 'error', message: string }`
- **`parser.ts`** — parses RSS 2.0, Atom 1.0, and JSON Feed into a normalized `Article[]`. Adapted from `src/parser.ts` in the desktop fressh
- **`refresh.ts`** — top-level refresh function: loads all enabled feeds from the database, fetches and parses each one (sequentially to avoid overwhelming on mobile, max 3 concurrent), upserts articles, updates feed fetch metadata. Individual feed failures are caught and logged without stopping the loop. Returns a summary `{ fetched, failed, newArticles }`

### Background Refresh

Registered with `expo-task-manager` under the task name `FRESSH_BACKGROUND_FETCH`. Registered in `mobile/src/tasks/background.ts`. The task calls `refresh()` and updates the app badge count.

Registered in the app entry point with `expo-background-fetch` at a 30-minute interval. iOS may defer or throttle this — the app does not guarantee real-time delivery. On every foreground resume (`AppState` change to `active`), the app checks when the last fetch happened and triggers a manual refresh if it's been more than 15 minutes.

## Navigation

Expo Router file-based routing, stack navigation.

```
app/
  index.tsx              # immediate redirect to /feeds
  feeds/
    index.tsx            # Feed List screen
    [feedId]/
      index.tsx          # Article List screen (feedId can be 'unread', 'starred', 'today', or a numeric feed id)
      [articleId].tsx    # Article Reader screen
```

All three screens live in a single native stack so iOS swipe-back works throughout.

## Screens

### Feed List (`feeds/index.tsx`)

**Nav bar:** "fressh" title (left), settings gear + add feed button (right).

**Content:**
- Section "Smart Feeds": Starred, All Unread, Today — each with unread/item count badge
- Section "Feeds": all feeds sorted alphabetically, each row shows feed title + unread count badge (hidden if 0)

**Interactions:**
- Tap any row → push Article List
- Pull to refresh → triggers `refresh()` on all feeds
- Swipe left on a feed row → Delete (with confirmation)
- Tap + → Add Feed sheet: text field to paste/type a URL, detects YouTube/Reddit, resolves feed title, confirms before saving

### Article List (`feeds/[feedId]/index.tsx`)

**Nav bar:** back button with feed name (or smart feed name), "Mark All Read" button (right, hidden for Starred/Today).

**Content:**
- Articles sorted by `published_at DESC`
- Unread articles: bold title, full opacity
- Read articles: normal weight, dimmed (40% opacity)
- Each row: title, relative timestamp (e.g. "2h ago"), star indicator if starred
- Pull to refresh → triggers `refresh()` for the specific feed (or all feeds for smart feeds)

**Interactions:**
- Tap row → mark as read + push Article Reader
- Swipe right → toggle read/unread
- Swipe left → star/unstar | share

### Article Reader (`feeds/[feedId]/[articleId].tsx`)

**Nav bar:** back button, star button + share button + "Open in Browser" button (right).

**Content:**
- Feed name + published timestamp (small, above title)
- Article title (large, bold)
- Article body: `content_text` if available, else `summary`. Plain text rendering via `ScrollView` + `Text` (no WebView for content — keeps it fast and offline-friendly)
- "Open in Browser" prominent button at bottom → opens `WebBrowser.openBrowserAsync()` (SFSafariViewController)

**Interactions:**
- Star button → `toggleStar(id)`
- Share → native share sheet with article URL
- Swipe left/right → navigate to next/previous article in the list

## Error Handling

- **Feed fetch failure:** caught per-feed, logged to console, never crashes the refresh loop. The feed's `last_fetch` is not updated so it retries next cycle
- **Database init failure:** app renders an error screen with a "Retry" button
- **Network error on manual refresh:** shows a brief toast/snackbar "Refresh failed — check your connection"
- **Malformed feed:** parser returns an empty array, no articles inserted, feed still marked as fetched

## Project Structure

```
mobile/
  app/
    index.tsx
    feeds/
      index.tsx
      [feedId]/
        index.tsx
        [articleId].tsx
  src/
    db/
      schema.ts
      database.ts
      queries.ts
    fetcher/
      detect.ts
      fetch.ts
      parser.ts
      refresh.ts
    tasks/
      background.ts
  assets/
  app.json
  package.json
  tsconfig.json
```

## Dependencies

- `expo` (SDK 52+)
- `expo-router`
- `expo-sqlite`
- `expo-background-fetch`
- `expo-task-manager`
- `expo-web-browser` (SFSafariViewController)
- `react-native` (iOS only target)

No ORM. No state management library — React `useState` + `useEffect` with direct query calls is sufficient for this scope.

## Testing

Tests live in `mobile/test/` and run with `bun test`. We test the pure logic — no device or simulator required.

### What gets tested

- **`test/parser.test.ts`** — feed parser: RSS 2.0, Atom, and JSON Feed fixtures → expected `Article[]` shape. Covers edge cases: missing fields, empty feeds, malformed dates
- **`test/detect.test.ts`** — URL detection: YouTube channel/user/handle URLs → RSS feed URLs, Reddit subreddit URLs → `.rss` URLs, plain RSS URLs pass through unchanged
- **`test/queries.test.ts`** — database queries: uses an in-memory `expo-sqlite` database (`:memory:`), runs migrations, then exercises `upsertFeed`, `insertArticles`, `markRead`, `toggleStar`, `markAllRead`, `deleteFeed`, and the read/unread count queries

### What is not tested

- UI screens (require a device/simulator)
- Background fetch task (iOS-only runtime)
- HTTP fetch layer (network calls, skip in unit tests)

## Out of Scope (V1)

- OPML import/export
- Search
- Android support
- Feed folders/grouping
- Sync with Mac daemon
- Push notifications
- Font size / reader theme settings
