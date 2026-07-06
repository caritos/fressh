# YouTube Player Aspect Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Size the embedded YouTube player in the article reader to match each video's real aspect ratio (fetched via oEmbed at feed-refresh time), instead of always assuming 16:9 landscape, so portrait/Shorts videos display full-size instead of pillarboxed.

**Architecture:** During feed refresh, newly-inserted YouTube articles get their real `width`/`height` fetched from YouTube's oEmbed endpoint and persisted on the `articles` row. The article reader screen reads those stored dimensions and computes the player box height from the real ratio, falling back to 16:9 when dimensions are absent (pre-existing articles, or oEmbed failed).

**Tech Stack:** Expo/React Native, `expo-sqlite`, `bun:test` for unit tests, `react-native-youtube-iframe`.

## Global Constraints

- Use `bun test` (Bun's built-in runner), not Jest — this project's existing convention.
- Follow the existing test style in `mobile/test/queries.test.ts`: exercise the raw SQL via `bun:sqlite` directly rather than importing `mobile/src/db/queries.ts` (which imports `expo-sqlite`, a native module unavailable under `bun test`).
- Pure/network-only modules (no `expo-sqlite` dependency) — like the new `youtube.ts` util — are imported and tested directly, matching `mobile/test/parser.test.ts`.
- Design doc: `docs/superpowers/specs/2026-07-06-youtube-video-aspect-ratio-design.md`.

---

### Task 1: Add `video_width`/`video_height` columns to the articles schema

**Files:**
- Modify: `shared/schema.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Produces: `CREATE_ARTICLES` now creates `articles.video_width INTEGER` and `articles.video_height INTEGER` (both nullable, no default). Task 2's migration ALTER statements and Task 4's `updateArticleVideoDimensions` write to these exact column names.

- [ ] **Step 1: Write the failing test**

Add to `mobile/test/queries.test.ts` (after the existing `'CREATE_ARTICLES: read_at column defaults to NULL'` test):

```typescript
test('CREATE_ARTICLES: video_width and video_height default to NULL', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const row = db.query(`SELECT video_width, video_height FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.video_width).toBeNull();
  expect(row.video_height).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/queries.test.ts -t "video_width and video_height default to NULL"` (from `mobile/`)
Expected: FAIL with `SQLite3 error: no such column: video_width`

- [ ] **Step 3: Implement the schema change**

In `shared/schema.ts`, update `CREATE_ARTICLES`:

```typescript
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
    read_at DATETIME,
    starred INTEGER DEFAULT 0,
    video_width INTEGER,
    video_height INTEGER,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
    UNIQUE(feed_id, guid)
  )
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/queries.test.ts -t "video_width and video_height default to NULL"` (from `mobile/`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts mobile/test/queries.test.ts
git commit -m "feat: add video_width/video_height columns to articles schema"
```

---

### Task 2: Migrate existing installs to the new columns

**Files:**
- Modify: `mobile/src/db/database.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (works directly against the raw SQL added in Task 1).
- Produces: `SCHEMA_VERSION = 3`; installs upgrading from version 1 or 2 get `video_width`/`video_height` added via `ALTER TABLE`; a self-heal check guarantees the columns exist even if `schema_version` is stuck ahead of reality.

- [ ] **Step 1: Write the test**

`database.ts`'s `_migrate()` function imports `expo-sqlite` and can't run under `bun test` (same reason `mobile/src/db/queries.ts` isn't imported directly in tests — see Global Constraints). This test instead validates the exact `ALTER TABLE` statements Step 3 will add to `database.ts`, run against a `bun:sqlite` table shaped like a pre-migration (v2) install — mirroring the existing `'migration backfill: sets read_at...'` tests in this file.

Add to `mobile/test/queries.test.ts`:

```typescript
test('migration: ALTER TABLE adds video_width/video_height to a pre-existing v2 table', () => {
  // Simulate a v2 install: articles table without the new columns.
  db.exec('DROP TABLE articles');
  db.exec(`
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
      read_at DATETIME,
      starred INTEGER DEFAULT 0,
      UNIQUE(feed_id, guid)
    )
  `);
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);

  db.exec(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
  db.exec(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);

  const row = db.query(`SELECT video_width, video_height FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.video_width).toBeNull();
  expect(row.video_height).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test test/queries.test.ts -t "ALTER TABLE adds video_width"` (from `mobile/`)
Expected: PASS — this test validates the SQL syntax/behavior in isolation, not `database.ts` itself, so it passes as soon as it's written. Its purpose is to lock in the exact statements Step 3 must add.

- [ ] **Step 3: Implement the migration in `database.ts`**

Read `mobile/src/db/database.ts` first to confirm line numbers match (it may have shifted). Update:

```typescript
const SCHEMA_VERSION = 3;
```

Inside `_migrate()`, change:

```typescript
  if (current < SCHEMA_VERSION) {
    await db.execAsync(CREATE_FEEDS);
    await db.execAsync(CREATE_ARTICLES);
    await db.execAsync(CREATE_SETTINGS);
    for (const sql of CREATE_INDEXES) await db.execAsync(sql);
    if (current === 1) {
      // Upgrading from v1: read_at doesn't exist on this table yet.
      // Fresh installs (current === 0) already have it via CREATE_ARTICLES above.
      await db.execAsync(`ALTER TABLE articles ADD COLUMN read_at DATETIME`);
      await db.execAsync(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
    }
    if (current > 0 && current < 3) {
      // Upgrading from v1 or v2: video_width/video_height don't exist yet.
      // Fresh installs (current === 0) already have them via CREATE_ARTICLES above.
      await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
      await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
    }
    await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
```

And extend the existing self-heal block (the one checking for `read_at` via `PRAGMA table_info(articles)`) with a matching check:

```typescript
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(articles)`);
  if (!columns.some((c) => c.name === 'read_at')) {
    await db.execAsync(`ALTER TABLE articles ADD COLUMN read_at DATETIME`);
    await db.execAsync(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
  }
  if (!columns.some((c) => c.name === 'video_width')) {
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
  }
```

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run: `bun test test/` (from `mobile/`)
Expected: All tests PASS (same count as before plus the one new test from Step 1).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/db/database.ts mobile/test/queries.test.ts
git commit -m "feat: migrate articles table to schema v3 with video dimension columns"
```

---

### Task 3: Add `mobile/src/fetcher/youtube.ts` (video ID extraction + oEmbed fetch)

**Files:**
- Create: `mobile/src/fetcher/youtube.ts`
- Test: `mobile/test/youtube.test.ts`

**Interfaces:**
- Produces:
  - `getYouTubeVideoId(url: string | null): string | null`
  - `fetchYouTubeAspectRatio(url: string): Promise<{ width: number; height: number } | null>`
- Consumed by: Task 5 (`refresh.ts`) and Task 6 (`articleId.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `mobile/test/youtube.test.ts`:

```typescript
import { expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { getYouTubeVideoId, fetchYouTubeAspectRatio } from '../src/fetcher/youtube';

test('getYouTubeVideoId: extracts id from a watch URL', () => {
  expect(getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: extracts id from a youtu.be short link', () => {
  expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: extracts id from an embed URL', () => {
  expect(getYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: returns null for a non-YouTube URL', () => {
  expect(getYouTubeVideoId('https://example.com/article')).toBeNull();
});

test('getYouTubeVideoId: returns null for null input', () => {
  expect(getYouTubeVideoId(null)).toBeNull();
});

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('fetchYouTubeAspectRatio: returns width/height from a successful oEmbed response', async () => {
  global.fetch = mock(async () =>
    new Response(JSON.stringify({ width: 113, height: 200 }), { status: 200 })
  ) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toEqual({ width: 113, height: 200 });
});

test('fetchYouTubeAspectRatio: returns null on a non-OK response', async () => {
  global.fetch = mock(async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=missing');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null when width/height are missing from the response', async () => {
  global.fetch = mock(async () => new Response(JSON.stringify({ title: 'no dims' }), { status: 200 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null when fetch throws', async () => {
  global.fetch = mock(async () => {
    throw new Error('network error');
  }) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null on malformed JSON', async () => {
  global.fetch = mock(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/youtube.test.ts` (from `mobile/`)
Expected: FAIL with `Cannot find module '../src/fetcher/youtube'`

- [ ] **Step 3: Implement `mobile/src/fetcher/youtube.ts`**

```typescript
export function getYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function fetchYouTubeAspectRatio(
  url: string
): Promise<{ width: number; height: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as { width?: unknown; height?: unknown };
    const { width, height } = data;
    if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
      return { width, height };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/youtube.test.ts` (from `mobile/`)
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/fetcher/youtube.ts mobile/test/youtube.test.ts
git commit -m "feat: add YouTube video id extraction and oEmbed aspect ratio fetch"
```

---

### Task 4: Update `queries.ts` — track newly-inserted articles, add dimension update

**Files:**
- Modify: `mobile/src/db/queries.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Consumes: nothing new (works against the schema from Task 1).
- Produces:
  - `ArticleRow` gains `video_width: number | null` and `video_height: number | null`.
  - `insertArticles(db, feedId, articles): Promise<Array<{ id: number; url: string | null }>>` (was `Promise<number>`) — returns the newly-inserted articles, not a count.
  - `updateArticleVideoDimensions(db: SQLiteDatabase, id: number, width: number, height: number): Promise<void>`
- Consumed by: Task 5 (`refresh.ts`) and Task 6 (`articleId.tsx`, via `ArticleRow`).

- [ ] **Step 1: Write the failing test**

Add to `mobile/test/queries.test.ts`:

```typescript
test('updateArticleVideoDimensions SQL: sets video_width and video_height', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;

  db.exec(`UPDATE articles SET video_width = 113, video_height = 200 WHERE id = ${id}`);

  const row = db.query(`SELECT video_width, video_height FROM articles WHERE id = ${id}`).get() as any;
  expect(row.video_width).toBe(113);
  expect(row.video_height).toBe(200);
});

test('insertArticles SQL: INSERT OR IGNORE reports which rows actually inserted', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');

  const first = db.run(
    `INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'A', 'https://a.com')`
  );
  const second = db.run(
    `INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'B', 'https://b.com')`
  );

  expect(first.changes).toBe(1);
  expect(second.changes).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test test/queries.test.ts -t "video dimensions|reports which rows"` (from `mobile/`)
Expected: PASS — like Task 2's migration test, these validate the raw SQL/`bun:sqlite` behavior (`Database.run()` returns `{ changes, lastInsertRowid }` per row) that Step 3's `queries.ts` implementation relies on, rather than exercising `queries.ts` itself (which imports `expo-sqlite` and can't run under `bun test`).

- [ ] **Step 3: Implement the `queries.ts` changes**

Update `ArticleRow` (in `mobile/src/db/queries.ts`):

```typescript
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
  read_at: string | null;
  starred: number;
  video_width: number | null;
  video_height: number | null;
  feed_title: string | null;
  feed_site_url: string | null;
}
```

Replace `insertArticles`:

```typescript
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
): Promise<Array<{ id: number; url: string | null }>> {
  const inserted: Array<{ id: number; url: string | null }> = [];
  for (const a of articles) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO articles
         (feed_id, guid, title, url, author, content_html, content_text, summary, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [feedId, a.guid, a.title, a.url, a.author, a.content_html, a.content_text, a.summary, a.published_at]
    );
    if (result.changes > 0) {
      inserted.push({ id: result.lastInsertRowId, url: a.url });
    }
  }
  return inserted;
}
```

Add `updateArticleVideoDimensions` (near `updateFeedFetchMeta`):

```typescript
export async function updateArticleVideoDimensions(
  db: SQLiteDatabase,
  id: number,
  width: number,
  height: number
): Promise<void> {
  await db.runAsync(`UPDATE articles SET video_width = ?, video_height = ? WHERE id = ?`, [width, height, id]);
}
```

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run: `bun test test/` (from `mobile/`)
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: track newly-inserted articles and add video dimension update query"
```

---

### Task 5: Enrich newly-inserted YouTube articles during refresh

**Files:**
- Modify: `mobile/src/fetcher/refresh.ts`

**Interfaces:**
- Consumes: `insertArticles` (Task 4, new return type), `getYouTubeVideoId`/`fetchYouTubeAspectRatio` (Task 3), `updateArticleVideoDimensions` (Task 4).
- Produces: no new exports — `refresh()`'s public behavior (its `RefreshSummary` return shape) is unchanged; this task only changes what happens internally per newly-inserted article.

There is no automated test for this task: `refresh.ts` already has no test coverage in this codebase (it orchestrates `expo-sqlite` + network calls with no seam for `bun:sqlite`-style SQL-level testing), and adding that harness is out of scope for this change. Verify manually per Step 3.

- [ ] **Step 1: Update the import and the per-feed insert/enrich flow**

In `mobile/src/fetcher/refresh.ts`, update the import block:

```typescript
import { getDb } from '../db/database';
import {
  getFeeds,
  upsertFeed,
  insertArticles,
  updateFeedFetchMeta,
  updateArticleVideoDimensions,
} from '../db/queries';
import { fetchFeed } from './fetch';
import { parseFeed } from './parser';
import { getYouTubeVideoId, fetchYouTubeAspectRatio } from './youtube';
```

Replace the body of the `else` branch inside the per-feed `try`:

```typescript
          } else {
            const parsed = await parseFeed(result.text);
            if (!parsed) {
              failed++;
            } else {
              await upsertFeed(db, {
                url: feed.url,
                title: parsed.title ?? feed.title,
                site_url: parsed.siteUrl ?? feed.site_url,
              });
              const insertedArticles = await insertArticles(db, feed.id, parsed.articles);
              await updateFeedFetchMeta(db, feed.id, result.lastModified, result.etag);
              await Promise.all(
                insertedArticles
                  .filter((a) => getYouTubeVideoId(a.url))
                  .map(async (a) => {
                    const dims = await fetchYouTubeAspectRatio(a.url as string);
                    if (dims) await updateArticleVideoDimensions(db, a.id, dims.width, dims.height);
                  })
              );
              newArticles += insertedArticles.length;
              fetched++;
            }
          }
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `bun test test/` (from `mobile/`)
Expected: All tests PASS (this task has no new automated tests, so the count is unchanged from Task 4)

- [ ] **Step 3: Manual verification**

Run the app against a YouTube channel feed that includes a Shorts/portrait video (e.g. add a channel known to post Shorts), trigger a refresh, then check the database directly:

```bash
sqlite3 "$(find ~/Library/Developer/CoreSimulator -name 'fressh.db' 2>/dev/null | head -1)" \
  "SELECT guid, url, video_width, video_height FROM articles WHERE video_width IS NOT NULL LIMIT 5;"
```

Expected: rows for YouTube articles show non-NULL `video_width`/`video_height`, with portrait videos showing `video_width < video_height`.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/fetcher/refresh.ts
git commit -m "feat: enrich newly-inserted YouTube articles with real aspect ratio"
```

---

### Task 6: Size the player in the article reader to the real aspect ratio

**Files:**
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx`

**Interfaces:**
- Consumes: `getYouTubeVideoId` (Task 3), `article.video_width`/`article.video_height` (Task 4's `ArticleRow`).
- Produces: no new exports — this is the leaf UI change.

There is no automated test for this screen: this codebase has no component-test harness for any screen (confirmed — no `@testing-library`/`render` usage anywhere in `mobile/test/`). Verify manually per Step 3.

- [ ] **Step 1: Remove the local `getYouTubeId` and import the shared version**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, delete the local function:

```typescript
function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
```

Add to the import block at the top of the file:

```typescript
import { getYouTubeVideoId } from '../../../src/fetcher/youtube';
```

- [ ] **Step 2: Use the real aspect ratio when sizing the player**

Replace:

```typescript
  const youtubeId = getYouTubeId(article.url);
  const videoHeight = Math.round((width - 40) * (9 / 16));
```

with:

```typescript
  const youtubeId = getYouTubeVideoId(article.url);
  const boxWidth = width - 40;
  const aspectRatio =
    article.video_width && article.video_height
      ? article.video_width / article.video_height
      : 16 / 9;
  const videoHeight = Math.round(boxWidth / aspectRatio);
```

- [ ] **Step 3: Manual verification**

Run: `bun test test/` (from `mobile/`) — confirm the full suite still passes (this task adds no new tests, so it verifies no regressions).

Then start the app (`npx expo start` from `mobile/`, or the project's existing dev workflow) and open an article for a known-portrait YouTube video that already has `video_width`/`video_height` populated (from Task 5's manual verification, or a fresh refresh against a Shorts-posting channel). Confirm the player renders taller/narrower and fills the available width without pillarboxing, and that a landscape video's article still renders at the usual 16:9 box.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "feat: size embedded YouTube player to the video's real aspect ratio"
```
