# fressh Mobile — Expo RSS Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone iOS RSS reader Expo app in `mobile/` that fetches feeds directly, stores articles in local SQLite, and supports background and manual refresh.

**Architecture:** Expo Router (file-based, three-screen stack: feeds → articles → reader), expo-sqlite with raw SQL (same schema as desktop fressh), expo-background-fetch for periodic refresh, pull-to-refresh for manual, JetBrains Mono as the sole typeface.

**Tech Stack:** Expo SDK 53, Expo Router 4, expo-sqlite, expo-background-fetch, expo-task-manager, expo-web-browser, expo-notifications, expo-font, expo-splash-screen, rss-parser, react-native-gesture-handler (bundled with Expo)

---

## File Map

```
mobile/
  app/
    _layout.tsx                   # root stack layout — fonts, DB init, bg fetch, foreground refresh
    index.tsx                     # redirect to /feeds
    feeds/
      index.tsx                   # Feed List screen + Add Feed sheet
      [feedId]/
        index.tsx                 # Article List screen
        [articleId].tsx           # Article Reader screen
  src/
    constants.ts                  # fonts, colors
    db/
      schema.ts                   # CREATE TABLE SQL strings
      database.ts                 # expo-sqlite singleton + migration runner
      queries.ts                  # all raw SQL wrapper functions
    fetcher/
      detect.ts                   # Reddit URL → RSS URL; YouTube URL → { type, originalUrl }
      fetch.ts                    # fetch() with ETag/If-Modified-Since, returns FetchResult
      parser.ts                   # rss-parser wrapper → normalized ParsedFeed
      refresh.ts                  # loops all feeds, fetch + parse + upsert, max 3 concurrent
    tasks/
      background.ts               # expo-task-manager task definition + registerBackgroundFetch()
  assets/
    fonts/
      JetBrainsMono-Regular.ttf
      JetBrainsMono-Medium.ttf
      JetBrainsMono-Bold.ttf
  test/
    detect.test.ts
    parser.test.ts
    queries.test.ts
  app.json
  package.json
  tsconfig.json
```

---

## Task 1: Scaffold the Expo project

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/app.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/babel.config.js`

- [ ] **Step 1: Create the mobile directory and package.json**

```bash
mkdir -p mobile/app/feeds mobile/src/db mobile/src/fetcher mobile/src/tasks mobile/assets/fonts mobile/test
```

Create `mobile/package.json`:

```json
{
  "name": "fressh-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "test": "bun test test/"
  },
  "dependencies": {
    "expo": "~53.0.0",
    "expo-router": "~4.0.0",
    "expo-sqlite": "~15.0.0",
    "expo-background-fetch": "~13.0.0",
    "expo-task-manager": "~12.0.0",
    "expo-web-browser": "~14.0.0",
    "expo-notifications": "~0.29.0",
    "expo-font": "~13.0.0",
    "expo-splash-screen": "~0.29.0",
    "expo-linking": "~7.0.0",
    "expo-constants": "~17.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.2",
    "react-native": "0.76.9",
    "react-native-screens": "~4.4.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-gesture-handler": "~2.20.0",
    "rss-parser": "^3.13.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.3.0",
    "typescript": "~5.3.3"
  }
}
```

- [ ] **Step 2: Create app.json**

```json
{
  "expo": {
    "name": "fressh",
    "slug": "fressh-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "fressh",
    "userInterfaceStyle": "dark",
    "platforms": ["ios"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.caritos.fressh",
      "infoPlist": {
        "UIBackgroundModes": ["fetch", "remote-notification"]
      }
    },
    "plugins": [
      "expo-router",
      "expo-font",
      [
        "expo-notifications",
        {
          "sounds": []
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 4: Create babel.config.js**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

- [ ] **Step 5: Install dependencies**

```bash
cd mobile && npm install
```

Expected: node_modules populated, no errors.

- [ ] **Step 6: Commit**

```bash
cd mobile && git add . && git commit -m "feat: scaffold fressh mobile Expo project"
```

---

## Task 2: Download and bundle JetBrains Mono fonts

**Files:**
- Create: `mobile/assets/fonts/JetBrainsMono-Regular.ttf`
- Create: `mobile/assets/fonts/JetBrainsMono-Medium.ttf`
- Create: `mobile/assets/fonts/JetBrainsMono-Bold.ttf`

- [ ] **Step 1: Download the font files**

```bash
cd mobile/assets/fonts

curl -L "https://download.jetbrains.com/fonts/JetBrainsMono-2.304.zip" -o jb.zip
unzip jb.zip
cp "fonts/ttf/JetBrainsMono-Regular.ttf" .
cp "fonts/ttf/JetBrainsMono-Medium.ttf" .
cp "fonts/ttf/JetBrainsMono-Bold.ttf" .
rm -rf jb.zip fonts/ webfonts/
```

Expected: three `.ttf` files in `mobile/assets/fonts/`.

- [ ] **Step 2: Create src/constants.ts**

```typescript
export const FONTS = {
  regular: 'JetBrainsMono-Regular',
  medium: 'JetBrainsMono-Medium',
  bold: 'JetBrainsMono-Bold',
};

export const COLORS = {
  background: '#000000',
  surface: '#111111',
  surfaceHighlight: '#1a1a1a',
  border: '#222222',
  text: '#ffffff',
  textSecondary: '#888888',
  textDimmed: '#444444',
  accent: '#6366f1',
};
```

- [ ] **Step 3: Commit**

```bash
git add mobile/assets/fonts/ mobile/src/constants.ts
git commit -m "feat: add JetBrains Mono fonts and color constants"
```

---

## Task 3: URL detection — TDD

**Files:**
- Create: `mobile/test/detect.test.ts`
- Create: `mobile/src/fetcher/detect.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/test/detect.test.ts`:

```typescript
import { expect, test } from 'bun:test';
import { detectFeedType } from '../src/fetcher/detect';

test('passes through a plain RSS URL unchanged', () => {
  const result = detectFeedType('https://xkcd.com/rss.xml');
  expect(result).toEqual({ type: 'rss', url: 'https://xkcd.com/rss.xml' });
});

test('trims whitespace from input', () => {
  const result = detectFeedType('  https://xkcd.com/rss.xml  ');
  expect(result).toEqual({ type: 'rss', url: 'https://xkcd.com/rss.xml' });
});

test('converts reddit subreddit URL to RSS', () => {
  const result = detectFeedType('https://www.reddit.com/r/programming');
  expect(result).toEqual({
    type: 'reddit',
    url: 'https://www.reddit.com/r/programming/top/.rss?t=month&limit=10',
  });
});

test('converts reddit subreddit URL with trailing slash', () => {
  const result = detectFeedType('https://www.reddit.com/r/tennis/');
  expect(result).toEqual({
    type: 'reddit',
    url: 'https://www.reddit.com/r/tennis/top/.rss?t=month&limit=10',
  });
});

test('detects YouTube handle URL', () => {
  const result = detectFeedType('https://www.youtube.com/@veritasium');
  expect(result).toEqual({
    type: 'youtube',
    originalUrl: 'https://www.youtube.com/@veritasium',
  });
});

test('detects YouTube channel URL', () => {
  const result = detectFeedType('https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA');
  expect(result).toEqual({
    type: 'youtube',
    originalUrl: 'https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA',
  });
});

test('detects YouTube /c/ URL', () => {
  const result = detectFeedType('https://www.youtube.com/c/Kurzgesagt');
  expect(result).toEqual({ type: 'youtube', originalUrl: 'https://www.youtube.com/c/Kurzgesagt' });
});

test('passes through an already-converted YouTube feed URL', () => {
  const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q';
  const result = detectFeedType(feedUrl);
  expect(result).toEqual({ type: 'rss', url: feedUrl });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && bun test test/detect.test.ts
```

Expected: `Cannot find module '../src/fetcher/detect'`

- [ ] **Step 3: Implement src/fetcher/detect.ts**

```typescript
export type DetectResult =
  | { type: 'rss'; url: string }
  | { type: 'reddit'; url: string }
  | { type: 'youtube'; originalUrl: string };

export function detectFeedType(input: string): DetectResult {
  const url = input.trim();

  // Already a YouTube RSS feed — pass through
  if (url.includes('youtube.com/feeds/videos.xml')) {
    return { type: 'rss', url };
  }

  // Reddit subreddit URL
  const redditMatch = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)\/?$/);
  if (redditMatch) {
    return {
      type: 'reddit',
      url: `https://www.reddit.com/r/${redditMatch[1]}/top/.rss?t=month&limit=10`,
    };
  }

  // YouTube channel URL (handle, /c/, or /channel/)
  if (url.includes('youtube.com') && !url.includes('/feeds/')) {
    return { type: 'youtube', originalUrl: url };
  }

  return { type: 'rss', url };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && bun test test/detect.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/fetcher/detect.ts mobile/test/detect.test.ts
git commit -m "feat: add feed URL detection (Reddit, YouTube, RSS)"
```

---

## Task 4: Feed parser — TDD

**Files:**
- Create: `mobile/test/parser.test.ts`
- Create: `mobile/src/fetcher/parser.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/test/parser.test.ts`:

```typescript
import { expect, test } from 'bun:test';
import { parseFeed } from '../src/fetcher/parser';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <guid>https://example.com/1</guid>
      <pubDate>Mon, 12 May 2026 10:00:00 GMT</pubDate>
      <author>Alice</author>
      <description>A short summary</description>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <guid>guid-2</guid>
      <pubDate>Sun, 11 May 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link href="https://atom.example.com"/>
  <entry>
    <id>urn:atom:1</id>
    <title>Atom Article</title>
    <link href="https://atom.example.com/1"/>
    <published>2026-05-12T10:00:00Z</published>
    <author><name>Bob</name></author>
    <summary>Atom summary</summary>
  </entry>
</feed>`;

const EMPTY_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;

const MALFORMED_DATE_FEED = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Bad Dates</title>
    <item>
      <title>No date</title>
      <link>https://example.com/noddate</link>
      <guid>no-date-1</guid>
    </item>
  </channel>
</rss>`;

test('parses RSS 2.0 feed title and site URL', async () => {
  const result = await parseFeed(RSS_FIXTURE);
  expect(result).not.toBeNull();
  expect(result!.title).toBe('Test Feed');
  expect(result!.siteUrl).toBe('https://example.com');
});

test('parses RSS 2.0 articles', async () => {
  const result = await parseFeed(RSS_FIXTURE);
  expect(result!.articles).toHaveLength(2);
  const first = result!.articles[0];
  expect(first.title).toBe('First Article');
  expect(first.url).toBe('https://example.com/1');
  expect(first.guid).toBe('https://example.com/1');
  expect(first.author).toBeTruthy();
  expect(first.summary).toBeTruthy();
  expect(first.published_at).not.toBeNull();
});

test('falls back to link as guid when guid is missing', async () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
    <item><title>X</title><link>https://example.com/x</link></item>
  </channel></rss>`;
  const result = await parseFeed(feed);
  expect(result!.articles[0].guid).toBe('https://example.com/x');
});

test('parses Atom feed', async () => {
  const result = await parseFeed(ATOM_FIXTURE);
  expect(result).not.toBeNull();
  expect(result!.title).toBe('Atom Feed');
  expect(result!.articles).toHaveLength(1);
  expect(result!.articles[0].title).toBe('Atom Article');
  expect(result!.articles[0].url).toBe('https://atom.example.com/1');
  expect(result!.articles[0].guid).toBe('urn:atom:1');
});

test('returns empty articles array for feed with no items', async () => {
  const result = await parseFeed(EMPTY_FEED);
  expect(result).not.toBeNull();
  expect(result!.articles).toHaveLength(0);
});

test('returns null for non-feed content', async () => {
  const result = await parseFeed('<!DOCTYPE html><html><body>not a feed</body></html>');
  expect(result).toBeNull();
});

test('handles articles with no pubDate gracefully', async () => {
  const result = await parseFeed(MALFORMED_DATE_FEED);
  expect(result).not.toBeNull();
  expect(result!.articles).toHaveLength(1);
  // published_at is null or a Date string — should not throw
});

test('strips HTML from content_text', async () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
    <item><title>X</title><link>https://example.com/x</link><guid>x</guid>
      <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
    </item></channel></rss>`;
  const result = await parseFeed(feed);
  expect(result!.articles[0].content_text).not.toContain('<');
  expect(result!.articles[0].content_text).toContain('Hello');
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && bun test test/parser.test.ts
```

Expected: `Cannot find module '../src/fetcher/parser'`

- [ ] **Step 3: Implement src/fetcher/parser.ts**

```typescript
import Parser from 'rss-parser';

const rssParser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['summary', 'summary'],
    ],
  },
});

export interface ParsedArticle {
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  content_html: string | null;
  content_text: string | null;
  summary: string | null;
  published_at: string | null;
}

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  articles: ParsedArticle[];
}

function isHtmlPage(content: string): boolean {
  const t = content.trim().slice(0, 500).toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html') || t.includes('<head>') || t.includes('<body>');
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function parseFeed(content: string): Promise<ParsedFeed | null> {
  if (isHtmlPage(content)) return null;

  try {
    const feed = await rssParser.parseString(content);
    if (!feed) return null;

    const articles: ParsedArticle[] = (feed.items ?? []).map((item) => {
      const any = item as any;
      const contentHtml = any.contentEncoded || item.content || any.description || '';
      const summary = any.summary || item.contentSnippet || '';
      const guid = item.guid || any.id || item.link || item.title || String(Math.random());

      return {
        guid,
        title: item.title ?? null,
        url: item.link ?? null,
        author: item.creator || any.author || null,
        content_html: contentHtml || null,
        content_text: stripHtml(contentHtml) || null,
        summary: summary || null,
        published_at: parseDate(item.pubDate || item.isoDate),
      };
    });

    return {
      title: feed.title ?? null,
      siteUrl: feed.link ?? null,
      articles,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && bun test test/parser.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/fetcher/parser.ts mobile/test/parser.test.ts
git commit -m "feat: add RSS/Atom parser adapted from desktop fressh"
```

---

## Task 5: Database schema and queries — TDD

**Files:**
- Create: `mobile/src/db/schema.ts`
- Create: `mobile/src/db/queries.ts`
- Create: `mobile/test/queries.test.ts`

The tests use `bun:sqlite` (synchronous, no native module needed) to verify the SQL is correct. The production code uses expo-sqlite (async). The SQL strings are identical.

- [ ] **Step 1: Create src/db/schema.ts**

```typescript
export const CREATE_SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )
`;

export const CREATE_FEEDS = `
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
  )
`;

export const CREATE_ARTICLES = `
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
  )
`;

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(read)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)`,
];
```

- [ ] **Step 2: Create src/db/queries.ts**

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

export interface FeedRow {
  id: number;
  url: string;
  title: string | null;
  site_url: string | null;
  last_fetch: string | null;
  last_modified: string | null;
  etag: string | null;
  fetch_interval: number;
  enabled: number;
  created_at: string;
  unread_count: number;
}

export interface ArticleRow {
  id: number;
  feed_id: number;
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  content_html: string | null;
  content_text: string | null;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  read: number;
  starred: number;
  feed_title: string | null;
}

const FEEDS_WITH_UNREAD = `
  SELECT f.*, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
  FROM feeds f
  LEFT JOIN articles a ON a.feed_id = f.id
  WHERE f.enabled = 1
  GROUP BY f.id
  ORDER BY f.title ASC
`;

const ARTICLES_BY_FEED = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.feed_id = ?
  ORDER BY a.published_at DESC
`;

const ARTICLES_UNREAD = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.read = 0
  ORDER BY a.published_at DESC
`;

const ARTICLES_STARRED = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.starred = 1
  ORDER BY a.published_at DESC
`;

const ARTICLES_TODAY = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE date(a.published_at) = date('now')
  ORDER BY a.published_at DESC
`;

export async function getFeeds(db: SQLiteDatabase): Promise<FeedRow[]> {
  return db.getAllAsync<FeedRow>(FEEDS_WITH_UNREAD);
}

export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | 'unread' | 'starred' | 'today'
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}

export async function getArticle(db: SQLiteDatabase, id: number): Promise<ArticleRow | null> {
  return db.getFirstAsync<ArticleRow>(
    `SELECT a.*, f.title as feed_title FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE a.id = ?`,
    [id]
  );
}

export async function upsertFeed(
  db: SQLiteDatabase,
  feed: { url: string; title?: string | null; site_url?: string | null }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO feeds (url, title, site_url) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`,
    [feed.url, feed.title ?? null, feed.site_url ?? null]
  );
}

export async function getFeedByUrl(db: SQLiteDatabase, url: string): Promise<FeedRow | null> {
  return db.getFirstAsync<FeedRow>(
    `SELECT f.*, 0 as unread_count FROM feeds f WHERE f.url = ?`,
    [url]
  );
}

export async function insertArticles(
  db: SQLiteDatabase,
  feedId: number,
  articles: Array<{
    guid: string;
    title: string | null;
    url: string | null;
    author: string | null;
    content_html: string | null;
    content_text: string | null;
    summary: string | null;
    published_at: string | null;
  }>
): Promise<number> {
  let inserted = 0;
  for (const a of articles) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO articles
         (feed_id, guid, title, url, author, content_html, content_text, summary, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [feedId, a.guid, a.title, a.url, a.author, a.content_html, a.content_text, a.summary, a.published_at]
    );
    inserted += result.changes;
  }
  return inserted;
}

export async function updateFeedFetchMeta(
  db: SQLiteDatabase,
  feedId: number,
  lastModified: string | null,
  etag: string | null
): Promise<void> {
  await db.runAsync(
    `UPDATE feeds SET last_modified = ?, etag = ?, last_fetch = datetime('now') WHERE id = ?`,
    [lastModified, etag, feedId]
  );
}

export async function markRead(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE id = ?`, [id]);
}

export async function markAllRead(db: SQLiteDatabase, feedId: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE feed_id = ?`, [feedId]);
}

export async function toggleStar(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET starred = 1 - starred WHERE id = ?`, [id]);
}

export async function deleteFeed(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM feeds WHERE id = ?`, [id]);
}

export async function getTotalUnreadCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM articles WHERE read = 0`
  );
  return row?.count ?? 0;
}
```

- [ ] **Step 3: Write failing tests**

Create `mobile/test/queries.test.ts`:

```typescript
import { Database } from 'bun:sqlite';
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SCHEMA_VERSION } from '../src/db/schema';

// Synchronous bun:sqlite wrapper to validate the same SQL used in queries.ts
let db: Database;

function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_SCHEMA_VERSION);
  db.exec(CREATE_FEEDS);
  db.exec(CREATE_ARTICLES);
  for (const idx of CREATE_INDEXES) db.exec(idx);
}

function teardown() {
  db.close();
}

function insertFeed(url: string, title: string): number {
  db.exec(`INSERT INTO feeds (url, title) VALUES ('${url}', '${title}')`);
  return (db.query(`SELECT id FROM feeds WHERE url = '${url}'`).get() as any).id;
}

function insertArticle(feedId: number, guid: string, read = 0, starred = 0) {
  db.exec(
    `INSERT INTO articles (feed_id, guid, title, url, read, starred, published_at)
     VALUES (${feedId}, '${guid}', 'Title ${guid}', 'https://example.com/${guid}', ${read}, ${starred}, datetime('now'))`
  );
}

beforeEach(setup);
afterEach(teardown);

test('feeds table: upsert inserts new feed', () => {
  db.exec(`INSERT INTO feeds (url, title, site_url) VALUES ('https://example.com/feed', 'Example', 'https://example.com')
           ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`);
  const row = db.query(`SELECT * FROM feeds WHERE url = 'https://example.com/feed'`).get() as any;
  expect(row.title).toBe('Example');
  expect(row.enabled).toBe(1);
});

test('feeds table: upsert updates existing feed title', () => {
  db.exec(`INSERT INTO feeds (url, title) VALUES ('https://example.com/feed', 'Old Title')`);
  db.exec(`INSERT INTO feeds (url, title) VALUES ('https://example.com/feed', 'New Title')
           ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`);
  const row = db.query(`SELECT title FROM feeds WHERE url = 'https://example.com/feed'`).get() as any;
  expect(row.title).toBe('New Title');
});

test('articles table: INSERT OR IGNORE skips duplicates', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'A', 'https://a.com')`);
  db.exec(`INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'B', 'https://b.com')`);
  const rows = db.query(`SELECT * FROM articles WHERE feed_id = ${feedId}`).all();
  expect(rows).toHaveLength(1);
});

test('FEEDS_WITH_UNREAD: counts only unread articles', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0); // unread
  insertArticle(feedId, 'a2', 0); // unread
  insertArticle(feedId, 'a3', 1); // read
  const rows = db.query(
    `SELECT f.*, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
     FROM feeds f LEFT JOIN articles a ON a.feed_id = f.id
     WHERE f.enabled = 1 GROUP BY f.id ORDER BY f.title ASC`
  ).all() as any[];
  expect(rows[0].unread_count).toBe(2);
});

test('markRead: sets read = 1', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET read = 1 WHERE id = ${id}`);
  const row = db.query(`SELECT read FROM articles WHERE id = ${id}`).get() as any;
  expect(row.read).toBe(1);
});

test('markAllRead: marks all articles in feed as read', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  insertArticle(feedId, 'a2', 0);
  db.exec(`UPDATE articles SET read = 1 WHERE feed_id = ${feedId}`);
  const rows = db.query(`SELECT read FROM articles WHERE feed_id = ${feedId}`).all() as any[];
  expect(rows.every((r) => r.read === 1)).toBe(true);
});

test('toggleStar: flips starred flag', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0, 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET starred = 1 - starred WHERE id = ${id}`);
  const after = db.query(`SELECT starred FROM articles WHERE id = ${id}`).get() as any;
  expect(after.starred).toBe(1);
  db.exec(`UPDATE articles SET starred = 1 - starred WHERE id = ${id}`);
  const after2 = db.query(`SELECT starred FROM articles WHERE id = ${id}`).get() as any;
  expect(after2.starred).toBe(0);
});

test('deleteFeed: cascades to articles', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1');
  db.exec(`DELETE FROM feeds WHERE id = ${feedId}`);
  const articles = db.query(`SELECT * FROM articles WHERE feed_id = ${feedId}`).all();
  expect(articles).toHaveLength(0);
});

test('getTotalUnreadCount: counts all unread across feeds', () => {
  const f1 = insertFeed('https://f1.com', 'F1');
  const f2 = insertFeed('https://f2.com', 'F2');
  insertArticle(f1, 'a1', 0);
  insertArticle(f1, 'a2', 1);
  insertArticle(f2, 'b1', 0);
  const row = db.query(`SELECT COUNT(*) as count FROM articles WHERE read = 0`).get() as any;
  expect(row.count).toBe(2);
});

test('ARTICLES_TODAY: only returns articles with today date', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'today', 'Today', 'https://t.com', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'old', 'Old', 'https://o.com', '2020-01-01 00:00:00')`);
  const rows = db.query(
    `SELECT * FROM articles WHERE date(published_at) = date('now')`
  ).all();
  expect(rows).toHaveLength(1);
  expect((rows[0] as any).guid).toBe('today');
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && bun test test/queries.test.ts
```

Expected: all 10 tests pass. (These run against bun:sqlite to validate the SQL.)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/db/schema.ts mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: add database schema, queries, and SQL tests"
```

---

## Task 6: Database singleton (database.ts)

**Files:**
- Create: `mobile/src/db/database.ts`

No unit tests — expo-sqlite is a native module.

- [ ] **Step 1: Create src/db/database.ts**

```typescript
import * as SQLite from 'expo-sqlite';
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES } from './schema';

const SCHEMA_VERSION = 1;

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export async function initDb(): Promise<void> {
  if (_db) return; // idempotent
  _db = await SQLite.openDatabaseAsync('fressh.db');
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _migrate(_db);
}

async function _migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_SCHEMA_VERSION);
  const row = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`
  );
  const current = row?.version ?? 0;
  if (current < SCHEMA_VERSION) {
    await db.execAsync(CREATE_FEEDS);
    await db.execAsync(CREATE_ARTICLES);
    for (const sql of CREATE_INDEXES) await db.execAsync(sql);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/db/database.ts
git commit -m "feat: add expo-sqlite database singleton with migration runner"
```

---

## Task 7: HTTP fetcher (fetch.ts)

**Files:**
- Create: `mobile/src/fetcher/fetch.ts`

No unit tests (network calls).

- [ ] **Step 1: Create src/fetcher/fetch.ts**

```typescript
export type FetchResult =
  | { status: 'ok'; text: string; lastModified: string | null; etag: string | null }
  | { status: 'not-modified' }
  | { status: 'error'; message: string };

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

export async function fetchFeed(
  url: string,
  opts: { lastModified?: string | null; etag?: string | null } = {}
): Promise<FetchResult> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    };
    if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;
    if (opts.etag) headers['If-None-Match'] = opts.etag;

    const res = await fetch(url, { headers });

    if (res.status === 304) return { status: 'not-modified' };
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };

    const text = await res.text();
    return {
      status: 'ok',
      text,
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
    };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveYouTubeChannelId(channelUrl: string): Promise<string | null> {
  const result = await fetchFeed(channelUrl);
  if (result.status !== 'ok') return null;
  const match = result.text.match(/channel_id=([a-zA-Z0-9_-]{24})/);
  return match ? match[1] : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/fetcher/fetch.ts
git commit -m "feat: add HTTP fetcher with ETag/If-Modified-Since support"
```

---

## Task 8: Refresh orchestrator (refresh.ts)

**Files:**
- Create: `mobile/src/fetcher/refresh.ts`

- [ ] **Step 1: Create src/fetcher/refresh.ts**

```typescript
import { getDb } from '../db/database';
import {
  getFeeds,
  upsertFeed,
  insertArticles,
  updateFeedFetchMeta,
} from '../db/queries';
import { fetchFeed } from './fetch';
import { parseFeed } from './parser';

export interface RefreshSummary {
  fetched: number;
  failed: number;
  newArticles: number;
}

const MAX_CONCURRENT = 3;

export async function refresh(): Promise<RefreshSummary> {
  const db = getDb();
  const feeds = await getFeeds(db);
  const enabled = feeds.filter((f) => f.enabled === 1);

  let fetched = 0;
  let failed = 0;
  let newArticles = 0;

  // Process feeds in batches of MAX_CONCURRENT
  for (let i = 0; i < enabled.length; i += MAX_CONCURRENT) {
    const batch = enabled.slice(i, i + MAX_CONCURRENT);
    await Promise.all(
      batch.map(async (feed) => {
        try {
          const result = await fetchFeed(feed.url, {
            lastModified: feed.last_modified,
            etag: feed.etag,
          });

          if (result.status === 'not-modified') {
            fetched++;
            return;
          }
          if (result.status === 'error') {
            failed++;
            return;
          }

          const parsed = await parseFeed(result.text);
          if (!parsed) {
            failed++;
            return;
          }

          // Ensure feed metadata is up to date
          await upsertFeed(db, {
            url: feed.url,
            title: parsed.title ?? feed.title,
            site_url: parsed.siteUrl ?? feed.site_url,
          });

          // Re-fetch feed row to get id (upsert may not have changed it)
          const count = await insertArticles(db, feed.id, parsed.articles);
          await updateFeedFetchMeta(db, feed.id, result.lastModified, result.etag);

          newArticles += count;
          fetched++;
        } catch (e) {
          console.error(`refresh: error on ${feed.url}:`, e);
          failed++;
        }
      })
    );
  }

  return { fetched, failed, newArticles };
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/fetcher/refresh.ts
git commit -m "feat: add refresh orchestrator with max-3-concurrent batching"
```

---

## Task 9: Background fetch task (background.ts)

**Files:**
- Create: `mobile/src/tasks/background.ts`

- [ ] **Step 1: Create src/tasks/background.ts**

```typescript
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { initDb, getDb } from '../db/database';
import { getTotalUnreadCount } from '../db/queries';
import { refresh } from '../fetcher/refresh';

export const BACKGROUND_FETCH_TASK = 'FRESSH_BACKGROUND_FETCH';

// Task must be defined at module level (before any async code)
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await initDb(); // idempotent — safe to call if already open
    await refresh();
    const db = getDb();
    const count = await getTotalUnreadCount(db);
    await Notifications.setBadgeCountAsync(count);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('Background fetch failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetch(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 30 * 60, // 30 minutes (iOS may defer)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/tasks/background.ts
git commit -m "feat: register expo background fetch task for periodic refresh"
```

---

## Task 10: Root layout and app entry point

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`

- [ ] **Step 1: Create app/_layout.tsx**

```tsx
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb } from '../src/db/database';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export default function RootLayout() {
  const lastFetchAt = useRef<number | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    [FONTS.regular]: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    [FONTS.medium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    [FONTS.bold]: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    async function init() {
      try {
        await initDb();
        await registerBackgroundFetch();
        // Initial fetch on first launch
        lastFetchAt.current = Date.now();
        refresh().catch(console.error);
      } catch (e) {
        console.error('App init error:', e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    init();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (!lastFetchAt.current || now - lastFetchAt.current > FOREGROUND_REFRESH_INTERVAL_MS) {
        lastFetchAt.current = now;
        refresh().catch(console.error);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: FONTS.bold, fontSize: 16 },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      />
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Create app/index.tsx**

```tsx
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/feeds" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/_layout.tsx mobile/app/index.tsx
git commit -m "feat: add root layout with font loading, DB init, background fetch"
```

---

## Task 11: Feed List screen

**Files:**
- Create: `mobile/app/feeds/index.tsx`

- [ ] **Step 1: Create app/feeds/index.tsx**

```tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../src/db/database';
import { getFeeds, upsertFeed, deleteFeed, getFeedByUrl, type FeedRow } from '../../src/db/queries';
import { detectFeedType } from '../../src/fetcher/detect';
import { resolveYouTubeChannelId } from '../../src/fetcher/fetch';
import { parseFeed } from '../../src/fetcher/parser';
import { fetchFeed } from '../../src/fetcher/fetch';
import { refresh } from '../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../src/constants';

const SMART_FEEDS = [
  { id: 'starred', label: '⭐ Starred' },
  { id: 'unread', label: '📬 All Unread' },
  { id: 'today', label: '🗓 Today' },
];

export default function FeedsScreen() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const loadFeeds = useCallback(async () => {
    const db = getDb();
    const rows = await getFeeds(db);
    setFeeds(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeeds();
    }, [loadFeeds])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await loadFeeds();
    } catch (e) {
      Alert.alert('Refresh failed', 'Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const onDeleteFeed = (feed: FeedRow) => {
    Alert.alert('Remove feed', `Remove "${feed.title ?? feed.url}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const db = getDb();
          await deleteFeed(db, feed.id);
          await loadFeeds();
        },
      },
    ]);
  };

  const onAddFeed = async () => {
    if (!addUrl.trim()) return;
    setAddLoading(true);
    try {
      const detected = detectFeedType(addUrl.trim());
      let feedUrl = '';

      if (detected.type === 'reddit') {
        feedUrl = detected.url;
      } else if (detected.type === 'youtube') {
        const channelId = await resolveYouTubeChannelId(detected.originalUrl);
        if (!channelId) {
          Alert.alert('Error', 'Could not find YouTube channel RSS feed. Make sure the URL is a channel page.');
          return;
        }
        feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      } else {
        feedUrl = detected.url;
      }

      const db = getDb();
      const existing = await getFeedByUrl(db, feedUrl);
      if (existing) {
        Alert.alert('Already added', `"${existing.title ?? feedUrl}" is already in your feeds.`);
        return;
      }

      const result = await fetchFeed(feedUrl);
      if (result.status !== 'ok') {
        Alert.alert('Error', 'Could not fetch this feed. Check the URL and try again.');
        return;
      }

      const parsed = await parseFeed(result.text);
      if (!parsed) {
        Alert.alert('Error', 'This does not appear to be a valid RSS or Atom feed.');
        return;
      }

      await upsertFeed(db, { url: feedUrl, title: parsed.title, site_url: parsed.siteUrl });
      setAddUrl('');
      setAddVisible(false);
      await loadFeeds();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setAddLoading(false);
    }
  };

  const renderDeleteAction = (feed: FeedRow) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => onDeleteFeed(feed)}
    >
      <Text style={styles.deleteActionText}>Remove</Text>
    </TouchableOpacity>
  );

  const renderFeedRow = (feed: FeedRow) => (
    <Swipeable renderRightActions={() => renderDeleteAction(feed)}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/feeds/${feed.id}`)}
        activeOpacity={0.7}
      >
        <Text style={styles.rowTitle} numberOfLines={1}>{feed.title ?? feed.url}</Text>
        {feed.unread_count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{feed.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Swipeable>
  );

  const sections = [
    { title: 'Smart Feeds', data: SMART_FEEDS.map(s => ({ ...s, isSmart: true })) },
    { title: 'Feeds', data: feeds.map(f => ({ ...f, isSmart: false })) },
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String((item as any).id)}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if ((item as any).isSmart) {
            const smart = item as typeof SMART_FEEDS[0];
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/feeds/${smart.id}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowTitle}>{smart.label}</Text>
              </TouchableOpacity>
            );
          }
          return renderFeedRow(item as FeedRow);
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Add Feed button */}
      <TouchableOpacity style={styles.addButton} onPress={() => setAddVisible(true)}>
        <Text style={styles.addButtonText}>+ Add Feed</Text>
      </TouchableOpacity>

      {/* Add Feed modal */}
      <Modal visible={addVisible} animationType="slide" transparent presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add Feed</Text>
          <TextInput
            style={styles.input}
            value={addUrl}
            onChangeText={setAddUrl}
            placeholder="Paste RSS, YouTube, or Reddit URL"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn]}
              onPress={() => { setAddVisible(false); setAddUrl(''); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.confirmBtn, addLoading && { opacity: 0.5 }]}
              onPress={onAddFeed}
              disabled={addLoading}
            >
              {addLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  sectionHeader: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowTitle: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.text, flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11, color: '#fff' },
  deleteAction: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  deleteActionText: { fontFamily: FONTS.medium, color: '#fff', fontSize: 14 },
  addButton: {
    margin: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  modal: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 24,
    paddingTop: 48,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.text, marginBottom: 20 },
  input: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  cancelBtn: { backgroundColor: COLORS.border },
  cancelBtnText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text },
  confirmBtn: { backgroundColor: COLORS.accent },
  confirmBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
```

- [ ] **Step 2: Add screen title in _layout.tsx**

The stack header title for `/feeds` defaults to "Feeds". To customise it, add inside the `<Stack>` in `_layout.tsx`:

```tsx
<Stack.Screen name="feeds/index" options={{ title: 'fressh' }} />
```

Add this line inside the `<Stack>` block (after the `screenOptions` prop closes, before `</Stack>`).

- [ ] **Step 3: Launch on simulator and verify**

```bash
cd mobile && npx expo run:ios
```

Expected: Feed List screen opens showing smart feeds and any saved feeds. Pull to refresh works. Tap + opens Add Feed sheet.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/feeds/index.tsx mobile/app/_layout.tsx
git commit -m "feat: add Feed List screen with smart feeds, add/delete, pull-to-refresh"
```

---

## Task 12: Article List screen

**Files:**
- Create: `mobile/app/feeds/[feedId]/index.tsx`

- [ ] **Step 1: Create app/feeds/[feedId]/index.tsx**

```tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../../src/db/database';
import {
  getArticles,
  markRead,
  markAllRead,
  toggleStar,
  getFeeds,
  type ArticleRow,
  type FeedRow,
} from '../../../src/db/queries';
import { refresh } from '../../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../../src/constants';

type FeedId = number | 'unread' | 'starred' | 'today';
const SMART_LABELS: Record<string, string> = {
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ArticleListScreen() {
  const router = useRouter();
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  const feedId: FeedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today'
      ? rawId
      : Number(rawId);

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [feedTitle, setFeedTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();
    const rows = await getArticles(db, feedId);
    setArticles(rows);
    if (typeof feedId === 'string') {
      setFeedTitle(SMART_LABELS[feedId] ?? feedId);
    } else {
      const feeds = await getFeeds(db);
      const feed = feeds.find((f) => f.id === feedId);
      setFeedTitle(feed?.title ?? 'Feed');
    }
  }, [feedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await load();
    } catch {
      Alert.alert('Refresh failed', 'Check your connection.');
    } finally {
      setRefreshing(false);
    }
  };

  const onMarkAllRead = async () => {
    if (typeof feedId === 'string') return;
    const db = getDb();
    await markAllRead(db, feedId);
    await load();
  };

  const onTap = async (article: ArticleRow) => {
    const db = getDb();
    await markRead(db, article.id);
    router.push(`/feeds/${rawId}/${article.id}`);
  };

  const renderRightActions = (article: ArticleRow) => (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#f59e0b' }]}
        onPress={async () => {
          const db = getDb();
          await toggleStar(db, article.id);
          await load();
        }}
      >
        <Text style={styles.swipeActionText}>{article.starred ? 'Unstar' : 'Star'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#6366f1' }]}
        onPress={async () => {
          if (article.url) await Share.share({ url: article.url, message: article.title ?? '' });
        }}
      >
        <Text style={styles.swipeActionText}>Share</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeftActions = (article: ArticleRow) => (
    <TouchableOpacity
      style={[styles.swipeAction, { backgroundColor: article.read ? '#10b981' : '#6b7280', minWidth: 80 }]}
      onPress={async () => {
        const db = getDb();
        if (article.read) {
          await db.runAsync('UPDATE articles SET read = 0 WHERE id = ?', [article.id]);
        } else {
          await markRead(db, article.id);
        }
        await load();
      }}
    >
      <Text style={styles.swipeActionText}>{article.read ? 'Unread' : 'Read'}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: ArticleRow }) => (
    <Swipeable
      renderRightActions={() => renderRightActions(item)}
      renderLeftActions={() => renderLeftActions(item)}
    >
      <TouchableOpacity
        style={[styles.row, item.read && styles.rowRead]}
        onPress={() => onTap(item)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, item.read && styles.titleRead]}
            numberOfLines={2}
          >
            {item.starred ? '⭐ ' : ''}{item.title ?? 'Untitled'}
          </Text>
          <Text style={styles.meta}>{formatRelative(item.published_at)}</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: feedTitle,
          headerRight: typeof feedId === 'number'
            ? () => (
                <TouchableOpacity onPress={onMarkAllRead} style={{ marginRight: 4 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.accent }}>
                    Mark All Read
                  </Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <FlatList
        data={articles}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No articles yet. Pull to refresh.</Text>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowRead: { opacity: 0.45 },
  title: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text, lineHeight: 21, marginBottom: 3 },
  titleRead: { fontFamily: FONTS.regular },
  meta: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSecondary },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  swipeActionText: { fontFamily: FONTS.medium, fontSize: 13, color: '#fff' },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 60,
  },
});
```

- [ ] **Step 2: Verify on simulator**

Tap any feed row in the Feed List. Expected: article list opens, unread articles are bold, read ones are dimmed, pull to refresh works, swipe left/right reveal actions.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/feeds/\[feedId\]/index.tsx
git commit -m "feat: add Article List screen with swipe actions and mark-all-read"
```

---

## Task 13: Article Reader screen

**Files:**
- Create: `mobile/app/feeds/[feedId]/[articleId].tsx`

- [ ] **Step 1: Create app/feeds/[feedId]/[articleId].tsx**

```tsx
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getDb } from '../../../src/db/database';
import { getArticle, toggleStar, getArticles, type ArticleRow } from '../../../src/db/queries';
import { FONTS, COLORS } from '../../../src/constants';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getBody(article: ArticleRow): string {
  if (article.content_text?.trim()) return article.content_text;
  if (article.content_html?.trim()) return stripHtml(article.content_html);
  if (article.summary?.trim()) return article.summary;
  return '(No content available — open in browser to read the full article.)';
}

export default function ArticleReaderScreen() {
  const router = useRouter();
  const { feedId, articleId } = useLocalSearchParams<{ feedId: string; articleId: string }>();
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [articleList, setArticleList] = useState<ArticleRow[]>([]);

  const load = useCallback(async () => {
    const db = getDb();
    const a = await getArticle(db, Number(articleId));
    setArticle(a);
    // Load sibling articles for prev/next navigation
    const feedIdParam =
      feedId === 'unread' || feedId === 'starred' || feedId === 'today'
        ? feedId
        : Number(feedId);
    const list = await getArticles(db, feedIdParam);
    setArticleList(list);
  }, [articleId, feedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!article) return null;

  const currentIndex = articleList.findIndex((a) => a.id === article.id);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle = currentIndex < articleList.length - 1 ? articleList[currentIndex + 1] : null;

  const onStar = async () => {
    const db = getDb();
    await toggleStar(db, article.id);
    await load();
  };

  const onShare = async () => {
    if (article.url) await Share.share({ url: article.url, message: article.title ?? '' });
  };

  const onOpenBrowser = async () => {
    if (article.url) await WebBrowser.openBrowserAsync(article.url);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: article.feed_title ?? '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {prevArticle && (
                <TouchableOpacity onPress={() => router.replace(`/feeds/${feedId}/${prevArticle.id}`)}>
                  <Text style={styles.navBtn}>‹ Prev</Text>
                </TouchableOpacity>
              )}
              {nextArticle && (
                <TouchableOpacity onPress={() => router.replace(`/feeds/${feedId}/${nextArticle.id}`)}>
                  <Text style={styles.navBtn}>Next ›</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onStar}>
                <Text style={styles.navBtn}>{article.starred ? '★' : '☆'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare}>
                <Text style={styles.navBtn}>↑</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.meta}>
          {article.feed_title}  ·  {formatDate(article.published_at)}
        </Text>
        <Text style={styles.title}>{article.title ?? 'Untitled'}</Text>
        {article.author && (
          <Text style={styles.author}>by {article.author}</Text>
        )}
        <Text style={styles.body}>{getBody(article)}</Text>
        <TouchableOpacity style={styles.browserBtn} onPress={onOpenBrowser}>
          <Text style={styles.browserBtnText}>Open in Browser</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  navBtn: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.accent },
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  meta: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 30,
    marginBottom: 8,
  },
  author: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 32,
  },
  browserBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  browserBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
```

- [ ] **Step 2: Verify on simulator**

Tap an article from the Article List. Expected: reader opens with article content, "Open in Browser" button launches SFSafariViewController, star and share buttons work, Prev/Next navigate between articles.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "feat: add Article Reader with browser link, star, share, prev/next nav"
```

---

## Task 14: Run all tests and final verification

- [ ] **Step 1: Run all tests**

```bash
cd mobile && bun test test/
```

Expected output: all tests in `detect.test.ts`, `parser.test.ts`, and `queries.test.ts` pass.

- [ ] **Step 2: Run on simulator and verify the golden path**

```bash
cd mobile && npx expo run:ios
```

Walk through:
1. Feed List loads
2. Tap + → add a real feed URL (e.g. `https://xkcd.com/rss.xml`) → appears in list
3. Tap the feed → article list shows with unread articles bold
4. Tap an article → reader shows content
5. Tap "Open in Browser" → SFSafariViewController opens
6. Swipe right on article in list → marks read (dims)
7. Swipe left → star/share appear
8. Pull to refresh on feed list → articles update

- [ ] **Step 3: Final commit**

```bash
git add mobile/
git commit -m "feat: fressh iOS Expo RSS reader — complete v1"
```
