# "All" Smart Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth smart feed, "All", showing every article across every feed (read and unread) sorted newest to oldest, with no badge count and full Mark All Read support.

**Architecture:** Follows the exact pattern already used for the "Today" smart feed: a new unfiltered SQL query in the data layer, a new entry in the `SMART_FEEDS` list, and generic string-union extensions through the article list and reader screens (which already dispatch on `feedId` being `number | 'unread' | 'starred' | 'today'`).

**Tech Stack:** Expo Router, expo-sqlite, React Native. Tests: `bun test`, using the project's existing `bun:sqlite`-based direct-SQL test pattern in `mobile/test/queries.test.ts` (no component-level test harness exists in this project — UI-layer tasks are verified manually in the running app, consistent with existing conventions).

## Global Constraints

- "All" smart feed id is the string `'all'` — must not collide with any numeric feed id (numeric feed ids come from the `feeds` table's autoincrement `id`, so `'all'` as a string is always distinguishable from `Number(rawId)`).
- "All" shows no badge — achieved by leaving it out of `getSmartCount()`'s recognized ids so it falls through to the existing `return 0` default. Do not add a `today`-style badge query for it.
- Order: `SMART_FEEDS` becomes `All, Starred, All Unread, Today` (All is prepended, per approved design).
- Mark All Read for `'all'` must reuse the existing `markAllUnreadRead(db)` function — do not write a new database function for this.
- Sort order for the new query: `ORDER BY a.published_at DESC` (newest first), matching every other article list query in the app.

---

### Task 1: Add the `ARTICLES_ALL` query and wire it into `getArticles()`

**Files:**
- Modify: `mobile/src/db/queries.ts:68-88`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Produces: `getArticles(db, 'all')` — returns `ArticleRow[]`, every article across every feed, `read` and unread, ordered by `published_at DESC`. Later tasks (Task 3, Task 4) call this by passing `feedId === 'all'` through the existing `getArticles` signature.

- [ ] **Step 1: Write the failing test**

Add to `mobile/test/queries.test.ts`, after the existing `ARTICLES_TODAY` test (after line 132):

```typescript
test('ARTICLES_ALL: returns every article regardless of read state, newest first', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, published_at)
           VALUES (${feedId}, 'old-read', 'Old Read', 'https://o.com', 1, '2020-01-01 00:00:00')`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, published_at)
           VALUES (${feedId}, 'new-unread', 'New Unread', 'https://n.com', 0, '2025-06-01 00:00:00')`);
  const rows = db.query(
    `SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
     FROM articles a JOIN feeds f ON a.feed_id = f.id
     ORDER BY a.published_at DESC`
  ).all() as any[];
  expect(rows).toHaveLength(2);
  expect(rows[0].guid).toBe('new-unread');
  expect(rows[1].guid).toBe('old-read');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && bun test test/queries.test.ts -t "ARTICLES_ALL"`
Expected: FAIL — at this point the test itself is really just validating raw SQL (matching this project's existing test style), so it should actually PASS as written since it doesn't call any queries.ts export yet. Instead, verify it fails by temporarily checking the assertion is meaningful: confirm `rows` is empty/wrong if you comment out the `JOIN` condition or swap the `ORDER BY` direction to `ASC` — you should see `rows[0].guid` become `'old-read'` and the test fail. Restore the correct SQL before continuing.

- [ ] **Step 3: Add `ARTICLES_ALL` and wire `getArticles()`**

In `mobile/src/db/queries.ts`, add after the `ARTICLES_TODAY` constant (currently lines 68-74):

```typescript
const ARTICLES_ALL = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  ORDER BY a.published_at DESC
`;
```

Then update `getArticles()` (currently lines 80-88) from:

```typescript
export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | 'unread' | 'starred' | 'today'
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}
```

to:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && bun test test/queries.test.ts -t "ARTICLES_ALL"`
Expected: PASS — 1 test, 0 failures. (Note: if `bun test` fails in your environment with an unrelated `EMFILE`/module-resolution error, that's a pre-existing environment issue, not something this task introduces — verify by running `bun test test/queries.test.ts` on `main` before this change to confirm the same failure occurs there too.)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: add ARTICLES_ALL query for the All smart feed"
```

---

### Task 2: Add "All" to the main feed list's `SMART_FEEDS`

**Files:**
- Modify: `mobile/app/feeds/index.tsx:27-31`

**Interfaces:**
- Consumes: nothing new (uses existing `getSmartCount(id: string): number` at `mobile/app/feeds/index.tsx:195-200`, unchanged).
- Produces: a `{ id: 'all', label: 'All' }` entry, first in `SMART_FEEDS`, that later tasks' routes (`/feeds/all`) resolve against.

- [ ] **Step 1: Update `SMART_FEEDS`**

In `mobile/app/feeds/index.tsx`, change (lines 27-31):

```typescript
const SMART_FEEDS = [
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
];
```

to:

```typescript
const SMART_FEEDS = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
];
```

Do **not** modify `getSmartCount()` (lines 195-200) — it already returns `0` for any id it doesn't recognize (`'all'` included), and `Badge` (`mobile/src/components/ui/Badge.tsx:6-7`) already renders `null` when `count === 0`. This is what gives "All" no badge with zero extra code.

- [ ] **Step 2: Manually verify in the running app**

With the dev client connected to Metro (per your existing workflow), reload the app and open the main feed list screen. Confirm:
- "All" appears as the first row under "Smart Feeds", above "Starred".
- "All" shows no badge/count pill next to it.
- Tapping "All" navigates to `/feeds/all` (it will 404 or show a wrong title until Task 3 is done — that's expected at this point).

- [ ] **Step 3: Commit**

```bash
git add mobile/app/feeds/index.tsx
git commit -m "feat: add All to the main list's Smart Feeds section"
```

---

### Task 3: Wire up the article list screen (`/feeds/all`) — labels, list, Mark All Read

**Files:**
- Modify: `mobile/app/feeds/[feedId]/index.tsx:32-36` (labels), `:54-59` (feedId parsing), `:96-119` (mark all read), `:195` (toolbar gate)

**Interfaces:**
- Consumes: `getArticles(db, feedId)` from Task 1 (now accepts `'all'`); `markAllUnreadRead(db): Promise<void>` (already exists in `mobile/src/db/queries.ts:166-168`, unchanged).
- Produces: `/feeds/all` renders a title of "All", lists every article (read articles dimmed), and has a working "Mark All Read" button.

- [ ] **Step 1: Add the label**

In `mobile/app/feeds/[feedId]/index.tsx`, change (lines 32-36):

```typescript
const SMART_LABELS: Record<string, string> = {
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};
```

to:

```typescript
const SMART_LABELS: Record<string, string> = {
  all: 'All',
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};
```

- [ ] **Step 2: Extend the `feedId` string union**

Change (lines 54-59):

```typescript
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  if (Array.isArray(rawId)) return null;
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today'
      ? rawId
      : Number(rawId);
```

to:

```typescript
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  if (Array.isArray(rawId)) return null;
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today' || rawId === 'all'
      ? rawId
      : Number(rawId);
```

- [ ] **Step 3: Add the Mark All Read branch**

Change `onMarkAllRead`'s inner `doMark` (lines 96-119) from:

```typescript
  const onMarkAllRead = async () => {
    const doMark = async () => {
      try {
        const db = getDb();
        if (typeof feedId === 'number') {
          await markAllRead(db, feedId);
        } else if (feedId === 'unread') {
          await markAllUnreadRead(db);
        } else if (feedId === 'today') {
          await markAllTodayRead(db);
        } else {
          return;
        }
        await load();
      } catch {
        Alert.alert('Error', 'Failed to mark all as read.');
      }
    };
```

to:

```typescript
  const onMarkAllRead = async () => {
    const doMark = async () => {
      try {
        const db = getDb();
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
        await load();
      } catch {
        Alert.alert('Error', 'Failed to mark all as read.');
      }
    };
```

- [ ] **Step 4: Show the Mark All Read button for `'all'`**

Change (line 195):

```typescript
  const hasMarkAllRead = typeof feedId === 'number' || feedId === 'unread' || feedId === 'today';
```

to:

```typescript
  const hasMarkAllRead = typeof feedId === 'number' || feedId === 'unread' || feedId === 'today' || feedId === 'all';
```

- [ ] **Step 5: Manually verify in the running app**

Reload the app, tap "All" from the main list. Confirm:
- Screen title reads "All".
- The list shows articles from every feed, newest first, with previously-read articles visually dimmed and unread ones not dimmed.
- The toolbar shows "Mark All Read" (it did not before Task 2/3, since the route 404'd).
- Tap "Mark All Read", confirm the alert, and confirm every article in the list becomes dimmed (read).
- Navigate back to the main list and confirm the "All Unread" badge count dropped to reflect the newly-read articles.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/feeds/[feedId]/index.tsx"
git commit -m "feat: support the All smart feed in the article list screen"
```

---

### Task 4: Extend the reader screen's `feedId` union for Prev/Next support

**Files:**
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx:70-73`

**Interfaces:**
- Consumes: `getArticles(db, feedIdParam)` from Task 1 (now accepts `'all'`).
- Produces: opening any article from the "All" list into the reader, and using Next/Prev there, walks the same newest-first `ARTICLES_ALL` ordering.

- [ ] **Step 1: Extend the union**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, change (inside `loadList`, currently):

```typescript
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today'
          ? feedId
          : Number(feedId);
```

to:

```typescript
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today' || feedId === 'all'
          ? feedId
          : Number(feedId);
```

- [ ] **Step 2: Manually verify in the running app**

From the "All" list, tap an article that isn't the newest one. Confirm:
- The reader opens showing that article's content.
- Tapping "Next"/"Prev" moves through the same newest-first order as the "All" list, and each article visited gets marked read (per the existing fix already in this file from `loadArticle`).
- Navigating back to the "All" list shows the visited articles dimmed.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "feat: support the All smart feed in the article reader's prev/next"
```

---

## Self-Review Notes

- **Spec coverage:** All four spec sections (Smart Feeds order, badge, data layer, article list & reader) map to Tasks 1-4 above. No gaps.
- **Placeholder scan:** No TBDs; every step shows exact code or exact manual verification actions.
- **Type consistency:** `getArticles`'s `feedId` union (`number | 'unread' | 'starred' | 'today' | 'all'`) is introduced once in Task 1 and referenced identically (by value, not by imported type name — the union isn't exported as a named type anywhere in the existing code, so each screen keeps its own local literal check, matching the existing pattern for `'unread' | 'starred' | 'today'`) in Tasks 3 and 4.
