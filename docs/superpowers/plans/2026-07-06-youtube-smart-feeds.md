# YouTube / Non-YouTube Smart Feeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new smart feeds — "YouTube" and "Non-YouTube" — that filter articles by URL pattern, with scoped "Mark All Read" support, matching the existing "All"/"Starred"/"All Unread"/"Today" pattern (GitHub #34, scoped to just the smart-feed filter).

**Architecture:** Two new SQL queries filter directly on `article.url` (no schema change, works retroactively on every existing article). A new shared `SmartFeedId` type and `isSmartFeedId` type guard in `queries.ts` replace four copy-pasted five-way string-literal checks across the app, so the two new ids are recognized everywhere at once. Two new scoped mark-all-read functions mirror the existing `markAllTodayRead` pattern rather than the global `markAllUnreadRead` one.

**Tech Stack:** Expo Router, React Native, expo-sqlite, Bun test runner (`bun:test`).

## Global Constraints

- Test runner is Bun's built-in `bun:test` (invoked via `bun test test/` from `mobile/`) — not Jest. This sandboxed dev environment sometimes hits a spurious `EMFILE`/`ProcessFdQuotaExceeded` error running `bun test` directly — if that happens, retry with `bash -c 'ulimit -n 8192; bun test test/'`.
- No schema change and no new column — YouTube detection is a URL `LIKE` pattern match at query time: `url LIKE '%youtube.com%' OR url LIKE '%youtu.be%'`.
- An article with a `NULL` url must be classified as non-YouTube, not excluded from both smart feeds — SQL's `NOT (NULL LIKE ...)` evaluates to `NULL`, not `TRUE`, so the non-YouTube query must explicitly say `url IS NULL OR (...)`.
- New smart feed ids: `youtube` (label "YouTube") and `nonyoutube` (label "Non-YouTube"). No read-state filter — show every matching article regardless of read status, exactly like `all`/`starred`/`today` today (only `unread` filters by read state).
- Both new smart feeds get a "Mark All Read" button, scoped to their own category (new `markAllYoutubeRead`/`markAllNonYoutubeRead` functions) — not the existing `markAllUnreadRead`, which marks every unread article system-wide.

---

### Task 1: `SmartFeedId` type, `isSmartFeedId` guard, and the two new read queries

**Files:**
- Modify: `mobile/src/db/queries.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Produces: `export type SmartFeedId = 'unread' | 'starred' | 'today' | 'all' | 'youtube' | 'nonyoutube'` and `export function isSmartFeedId(id: string): id is SmartFeedId` — used by Task 4 in `mobile/app/feeds/[feedId]/index.tsx` and `mobile/app/feeds/[feedId]/[articleId].tsx`.
- Produces: `getArticles(db, feedId: number | SmartFeedId)` now handles `'youtube'`/`'nonyoutube'` in addition to the existing four.

- [ ] **Step 1: Write the failing tests**

Add to `mobile/test/queries.test.ts` (near the other `ARTICLES_*` tests, e.g. after the `ARTICLES_ALL` test at line 150). This file already imports `expect`/`test` from `bun:test` and has `insertFeed(url, title)` and `db`/`setup`/`teardown` helpers in scope — reuse them as shown:

```typescript
import { isSmartFeedId } from '../src/db/queries';

test('isSmartFeedId: true for all six smart feed ids', () => {
  for (const id of ['unread', 'starred', 'today', 'all', 'youtube', 'nonyoutube']) {
    expect(isSmartFeedId(id)).toBe(true);
  }
});

test('isSmartFeedId: false for a numeric-looking feed id string', () => {
  expect(isSmartFeedId('42')).toBe(false);
});

test('ARTICLES_YOUTUBE: matches youtube.com and youtu.be URLs, excludes others', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'yt1', 'YT1', 'https://www.youtube.com/watch?v=abc', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'yt2', 'YT2', 'https://youtu.be/xyz', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'blog', 'Blog', 'https://example.com/post', datetime('now'))`);
  const rows = db.query(
    `SELECT guid FROM articles WHERE url LIKE '%youtube.com%' OR url LIKE '%youtu.be%'`
  ).all() as any[];
  expect(rows.map((r) => r.guid).sort()).toEqual(['yt1', 'yt2']);
});

test('ARTICLES_NON_YOUTUBE: excludes YouTube URLs, includes NULL-url articles', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'yt1', 'YT1', 'https://www.youtube.com/watch?v=abc', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'blog', 'Blog', 'https://example.com/post', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'nourl', 'No URL', NULL, datetime('now'))`);
  const rows = db.query(
    `SELECT guid FROM articles WHERE url IS NULL OR (url NOT LIKE '%youtube.com%' AND url NOT LIKE '%youtu.be%')`
  ).all() as any[];
  expect(rows.map((r) => r.guid).sort()).toEqual(['blog', 'nourl']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/queries.test.ts'`
Expected: FAIL — `isSmartFeedId` is not exported from `../src/db/queries` (the two `ARTICLES_*` SQL tests don't depend on new exports and will pass immediately since they just exercise raw SQL against `bun:sqlite` — only the `isSmartFeedId` tests should fail at this step).

- [ ] **Step 3: Write minimal implementation**

In `mobile/src/db/queries.ts`, add directly after the `ARTICLES_ALL` constant (currently ending at line 84) and before `export async function getFeeds` (currently line 86):

```typescript
const ARTICLES_YOUTUBE = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.url LIKE '%youtube.com%' OR a.url LIKE '%youtu.be%'
  ORDER BY a.published_at DESC
`;

const ARTICLES_NON_YOUTUBE = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.url IS NULL OR (a.url NOT LIKE '%youtube.com%' AND a.url NOT LIKE '%youtu.be%')
  ORDER BY a.published_at DESC
`;

export type SmartFeedId = 'unread' | 'starred' | 'today' | 'all' | 'youtube' | 'nonyoutube';

const SMART_FEED_IDS: readonly SmartFeedId[] = ['unread', 'starred', 'today', 'all', 'youtube', 'nonyoutube'];

export function isSmartFeedId(id: string): id is SmartFeedId {
  return (SMART_FEED_IDS as readonly string[]).includes(id);
}
```

Then replace the existing `getArticles` function (currently lines 90-99):

```typescript
export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | 'unread' | 'starred' | 'today' | 'all'
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  if (feedId === 'all') return db.getAllAsync<ArticleRow>(ARTICLES_ALL);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}
```

with:

```typescript
export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | SmartFeedId
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  if (feedId === 'all') return db.getAllAsync<ArticleRow>(ARTICLES_ALL);
  if (feedId === 'youtube') return db.getAllAsync<ArticleRow>(ARTICLES_YOUTUBE);
  if (feedId === 'nonyoutube') return db.getAllAsync<ArticleRow>(ARTICLES_NON_YOUTUBE);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/queries.test.ts'`
Expected: PASS — all existing tests in the file plus the 4 new ones, `0 fail`.

- [ ] **Step 5: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors for `mobile/src/db/queries.ts` (there are pre-existing, unrelated `bun:test`/`bun:sqlite` type-declaration errors in test files — ignore those, they predate this change).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: add SmartFeedId type and YouTube/non-YouTube article queries"
```

---

### Task 2: Scoped `markAllYoutubeRead`/`markAllNonYoutubeRead`

**Files:**
- Modify: `mobile/src/db/queries.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 (this task only adds two independent functions).
- Produces: `markAllYoutubeRead(db: SQLiteDatabase): Promise<void>` and `markAllNonYoutubeRead(db: SQLiteDatabase): Promise<void>` — used by Task 4 in `mobile/app/feeds/[feedId]/index.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `mobile/test/queries.test.ts` (near the `markAllRead`/`deleteExpiredReadArticles` tests). This calls the REAL exported functions (not a raw-SQL duplicate) via a thin async adapter over the file's existing synchronous `bun:sqlite` `db` — the same pattern already used for the `getArticlesByIds` test at the bottom of this file (`fakeAsyncDb`), since `queries.ts` functions expect an `expo-sqlite`-shaped async `SQLiteDatabase` and this test file's `db` is `bun:sqlite`'s synchronous `Database`:

```typescript
import { markAllYoutubeRead, markAllNonYoutubeRead } from '../src/db/queries';

function fakeRunAsyncDb() {
  return { runAsync: async (sql: string) => db.run(sql) } as any;
}

test('markAllYoutubeRead: marks only unread YouTube articles as read', async () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read) VALUES (${feedId}, 'yt-unread', 'YT', 'https://youtu.be/a', 0)`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read) VALUES (${feedId}, 'blog-unread', 'Blog', 'https://example.com/b', 0)`);

  await markAllYoutubeRead(fakeRunAsyncDb());

  const yt = db.query(`SELECT read FROM articles WHERE guid = 'yt-unread'`).get() as any;
  const blog = db.query(`SELECT read FROM articles WHERE guid = 'blog-unread'`).get() as any;
  expect(yt.read).toBe(1);
  expect(blog.read).toBe(0);
});

test('markAllNonYoutubeRead: marks only unread non-YouTube articles as read, including NULL-url ones', async () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read) VALUES (${feedId}, 'yt-unread', 'YT', 'https://youtu.be/a', 0)`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read) VALUES (${feedId}, 'blog-unread', 'Blog', 'https://example.com/b', 0)`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read) VALUES (${feedId}, 'nourl-unread', 'NoURL', NULL, 0)`);

  await markAllNonYoutubeRead(fakeRunAsyncDb());

  const yt = db.query(`SELECT read FROM articles WHERE guid = 'yt-unread'`).get() as any;
  const blog = db.query(`SELECT read FROM articles WHERE guid = 'blog-unread'`).get() as any;
  const nourl = db.query(`SELECT read FROM articles WHERE guid = 'nourl-unread'`).get() as any;
  expect(yt.read).toBe(0);
  expect(blog.read).toBe(1);
  expect(nourl.read).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/queries.test.ts'`
Expected: FAIL — `markAllYoutubeRead`/`markAllNonYoutubeRead` are not exported from `../src/db/queries` yet.

- [ ] **Step 3: Write the implementation**

In `mobile/src/db/queries.ts`, add directly after `markAllTodayRead` (currently ending at line 194) and before `toggleStar`:

```typescript
export async function markAllYoutubeRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now'))
     WHERE read = 0 AND (url LIKE '%youtube.com%' OR url LIKE '%youtu.be%')`
  );
}

export async function markAllNonYoutubeRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now'))
     WHERE read = 0 AND (url IS NULL OR (url NOT LIKE '%youtube.com%' AND url NOT LIKE '%youtu.be%'))`
  );
}
```

- [ ] **Step 4: Run the full test suite**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/'`
Expected: PASS — all tests including Task 1's and Task 2's new ones, `0 fail`.

- [ ] **Step 5: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors for `mobile/src/db/queries.ts`.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: add scoped markAllYoutubeRead/markAllNonYoutubeRead"
```

---

### Task 3: Add the two smart feeds to the feed list screen

**Files:**
- Modify: `mobile/app/feeds/index.tsx`

**Interfaces:**
- Consumes: `getArticles`'s expanded `SmartFeedId` support (Task 1) is not directly called here — this screen only needs the new smart-feed rows and their badge counts via raw `COUNT(*)` queries, matching its existing style for `starred`/`unread`/`today`.

- [ ] **Step 1: Add the two new smart feed entries**

In `mobile/app/feeds/index.tsx`, replace:

```typescript
const SMART_FEEDS = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
];
```

with:

```typescript
const SMART_FEEDS = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'nonyoutube', label: 'Non-YouTube' },
];
```

- [ ] **Step 2: Expand `smartCounts` state to include the two new counts**

Replace:

```typescript
  const [smartCounts, setSmartCounts] = useState<{ starred: number; unread: number; today: number }>({
    starred: 0,
    unread: 0,
    today: 0,
  });
```

with:

```typescript
  const [smartCounts, setSmartCounts] = useState<{
    starred: number;
    unread: number;
    today: number;
    youtube: number;
    nonyoutube: number;
  }>({
    starred: 0,
    unread: 0,
    today: 0,
    youtube: 0,
    nonyoutube: 0,
  });
```

- [ ] **Step 3: Query and set the two new counts in `loadFeeds`**

Locate (inside `loadFeeds`):

```typescript
    const todayRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM articles WHERE read = 0 AND date(published_at) = date('now')"
    );

    setSmartCounts({
      starred: starredRow?.count ?? 0,
      unread: unreadRow?.count ?? 0,
      today: todayRow?.count ?? 0,
    });
```

Replace with:

```typescript
    const todayRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM articles WHERE read = 0 AND date(published_at) = date('now')"
    );
    const youtubeRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM articles WHERE url LIKE '%youtube.com%' OR url LIKE '%youtu.be%'"
    );
    const nonYoutubeRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM articles WHERE url IS NULL OR (url NOT LIKE '%youtube.com%' AND url NOT LIKE '%youtu.be%')"
    );

    setSmartCounts({
      starred: starredRow?.count ?? 0,
      unread: unreadRow?.count ?? 0,
      today: todayRow?.count ?? 0,
      youtube: youtubeRow?.count ?? 0,
      nonyoutube: nonYoutubeRow?.count ?? 0,
    });
```

- [ ] **Step 4: Extend `getSmartCount` to recognize the two new ids**

Replace:

```typescript
  const getSmartCount = useCallback((id: string): number => {
    if (id === 'starred') return smartCounts.starred;
    if (id === 'unread') return smartCounts.unread;
    if (id === 'today') return smartCounts.today;
    return 0;
  }, [smartCounts]);
```

with:

```typescript
  const getSmartCount = useCallback((id: string): number => {
    if (id === 'starred') return smartCounts.starred;
    if (id === 'unread') return smartCounts.unread;
    if (id === 'today') return smartCounts.today;
    if (id === 'youtube') return smartCounts.youtube;
    if (id === 'nonyoutube') return smartCounts.nonyoutube;
    return 0;
  }, [smartCounts]);
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors for `mobile/app/feeds/index.tsx`.

- [ ] **Step 6: Run the full test suite (regression check)**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/'`
Expected: PASS — this task adds no new automated tests (no test harness exists for this screen), so all prior tests passing is the regression signal.

- [ ] **Step 7: Manually verify in the running app**

There is no automated component-test harness for this screen. Trace through statically instead, then flag for the controller to verify interactively:
1. Confirm `SMART_FEEDS.map(...)` in `sections` (the `useMemo` a few lines below) will render two new rows with `isSmart: true`, so `renderItem`'s smart-feed branch (`badge={count}` via `getSmartCount(item.id)`) applies to them automatically — no changes needed there.
2. In your report, note that interactive verification (does tapping "YouTube"/"Non-YouTube" navigate correctly and show the right badge count) should be done separately by the controller on a simulator or device.

- [ ] **Step 8: Commit**

```bash
git add mobile/app/feeds/index.tsx
git commit -m "feat: add YouTube/Non-YouTube rows to the smart feeds list"
```

---

### Task 4: Wire the two new ids into the article list and reader screens

**Files:**
- Modify: `mobile/app/feeds/[feedId]/index.tsx`
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx`

**Interfaces:**
- Consumes: `SmartFeedId`, `isSmartFeedId` (Task 1) and `markAllYoutubeRead`, `markAllNonYoutubeRead` (Task 2), all from `mobile/src/db/queries.ts`.

- [ ] **Step 1: Update the list screen's imports**

In `mobile/app/feeds/[feedId]/index.tsx`, the current import block (lines 17-27) reads:

```typescript
import {
  getArticles,
  markRead,
  markUnread,
  markAllRead,
  markAllUnreadRead,
  markAllTodayRead,
  toggleStar,
  getFeeds,
  type ArticleRow,
} from '../../../src/db/queries';
```

Replace with:

```typescript
import {
  getArticles,
  markRead,
  markUnread,
  markAllRead,
  markAllUnreadRead,
  markAllTodayRead,
  markAllYoutubeRead,
  markAllNonYoutubeRead,
  toggleStar,
  getFeeds,
  isSmartFeedId,
  type ArticleRow,
} from '../../../src/db/queries';
```

- [ ] **Step 2: Add the two new labels**

Replace:

```typescript
const SMART_LABELS: Record<string, string> = {
  all: 'All',
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};
```

with:

```typescript
const SMART_LABELS: Record<string, string> = {
  all: 'All',
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
  youtube: 'YouTube',
  nonyoutube: 'Non-YouTube',
};
```

- [ ] **Step 3: Replace the `feedId` narrowing with `isSmartFeedId`**

Replace:

```typescript
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today' || rawId === 'all'
      ? rawId
      : Number(rawId);
```

with:

```typescript
  const feedId = isSmartFeedId(rawId) ? rawId : Number(rawId);
```

- [ ] **Step 4: Add the two new `onMarkAllRead` branches**

Replace:

```typescript
        if (typeof feedId === 'number') {
          await markAllRead(db, feedId);
        } else if (feedId === 'unread') {
          await markAllUnreadRead(db);
        } else if (feedId === 'today') {
          await markAllTodayRead(db);
        } else if (feedId === 'all') {
          await markAllUnreadRead(db);
        } else {
          return;
        }
```

with:

```typescript
        if (typeof feedId === 'number') {
          await markAllRead(db, feedId);
        } else if (feedId === 'unread') {
          await markAllUnreadRead(db);
        } else if (feedId === 'today') {
          await markAllTodayRead(db);
        } else if (feedId === 'all') {
          await markAllUnreadRead(db);
        } else if (feedId === 'youtube') {
          await markAllYoutubeRead(db);
        } else if (feedId === 'nonyoutube') {
          await markAllNonYoutubeRead(db);
        } else {
          return;
        }
```

- [ ] **Step 5: Extend `hasMarkAllRead` to include the two new ids**

Replace:

```typescript
  const hasMarkAllRead = typeof feedId === 'number' || feedId === 'unread' || feedId === 'today' || feedId === 'all';
```

with:

```typescript
  const hasMarkAllRead =
    typeof feedId === 'number' ||
    feedId === 'unread' ||
    feedId === 'today' ||
    feedId === 'all' ||
    feedId === 'youtube' ||
    feedId === 'nonyoutube';
```

- [ ] **Step 6: Update the reader screen's import**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, the current import (line 9) reads:

```typescript
import { getArticle, markRead, toggleStar, getArticles, getArticlesByIds, type ArticleRow } from '../../../src/db/queries';
```

Replace with:

```typescript
import { getArticle, markRead, toggleStar, getArticles, getArticlesByIds, isSmartFeedId, type ArticleRow } from '../../../src/db/queries';
```

- [ ] **Step 7: Replace the reader's duplicate `feedIdParam` narrowing**

Inside `loadList` (the live-query fallback branch), replace:

```typescript
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today' || feedId === 'all'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
```

with:

```typescript
      const feedIdParam = isSmartFeedId(feedId) ? feedId : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
```

- [ ] **Step 8: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors for either modified file.

- [ ] **Step 9: Run the full test suite (regression check)**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/'`
Expected: PASS — `0 fail`. This task adds no new automated tests; it wires already-tested pieces (Tasks 1-2) together.

- [ ] **Step 10: Manually verify in the running app**

There is no automated component-test harness for these screens. Static trace-through in place of interactive verification:
1. Confirm `SMART_LABELS['youtube']`/`['nonyoutube']` render as the list screen's title (`feedTitle` state, set from `SMART_LABELS[feedId] ?? feedId` since `typeof feedId === 'string'` for these two ids).
2. Confirm `hasMarkAllRead` is now `true` for both new ids, so the "Mark All Read" button renders in the toolbar.
3. Confirm the reader screen's prev/next navigation still works for these two filters — since `isSmartFeedId('youtube')`/`isSmartFeedId('nonyoutube')` are both `true`, `feedIdParam` resolves to the string (not `Number(feedId)`, which would be `NaN` for a non-numeric string), matching the existing behavior for `unread`/`starred`/`today`/`all`.
4. Note in your report that interactive verification (opening "YouTube"/"Non-YouTube" from the feed list, confirming the correct articles appear, tapping "Mark All Read" and confirming only that category's unread articles are marked, and confirming Next/Prev navigation works inside the reader for both new filters) should be performed separately by the controller on a simulator or device.

- [ ] **Step 11: Commit**

```bash
git add "mobile/app/feeds/[feedId]/index.tsx" "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "feat: wire YouTube/Non-YouTube smart feeds into list and reader screens (#34)"
```

---

## Out of scope (per design spec)

- Downloading article content for offline reading (separate future issue).
- Any change to how YouTube-ness is detected/rendered inside the reader screen itself (`getYouTubeVideoId` at render time is unchanged).
- Any change to `video_width`/`video_height` population or the aspect-ratio feature.
- Retention/deletion interaction — not applicable, no new persisted state.
