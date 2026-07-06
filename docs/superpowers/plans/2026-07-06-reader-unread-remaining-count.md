# Reader Unread-Remaining Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the article reader, show how many unread articles are still ahead while browsing the "All Unread" and "Today" smart feeds (GitHub #33), and fix the same-root-cause bug where Prev is wrongly disabled in "All Unread" (GitHub #32).

**Architecture:** A pure helper function (`getRemainingUnreadAhead`) derives the count from the article list the reader screen already fetches — no new SQL query. The reader screen's focus effect is resequenced so the filtered list is fetched (and the current article's position in it resolved) *before* the article is marked read, which fixes both the count's correctness and the Prev-disabled bug. The count is folded into the existing `Stack.Screen` header title.

**Tech Stack:** Expo Router, React Native, expo-sqlite, Bun test runner (`bun:test`).

## Global Constraints

- Test runner is Bun's built-in `bun:test` (invoked via `bun test test/` from `mobile/`) — not Jest.
- Count applies only to the `unread` and `today` smart-feed filters; `all`, `starred`, and numeric feed ids show no count (unchanged behavior).
- When the count would be `0`, the header shows just the feed name (today's existing behavior) — no "0 left" or "all caught up" text.
- Header format when count > 0: `` `${feedTitle} · ${count} left` `` — reuses the existing plain-string `title` prop of `Stack.Screen`, no new header component.
- No new SQL query and no schema change — the count is derived client-side from `ArticleRow[]` already loaded for Prev/Next navigation.

---

### Task 1: Pure `getRemainingUnreadAhead` helper + unit tests

**Files:**
- Create: `mobile/src/reader/remainingUnread.ts`
- Test: `mobile/test/remainingUnread.test.ts`

**Interfaces:**
- Produces: `getRemainingUnreadAhead(articles: Array<{ id: number; read: number }>, currentArticleId: number, feedId: string): number` — used by Task 3 inside `mobile/app/feeds/[feedId]/[articleId].tsx`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/test/remainingUnread.test.ts`:

```typescript
import { expect, test } from 'bun:test';
import { getRemainingUnreadAhead } from '../src/reader/remainingUnread';

test('getRemainingUnreadAhead: counts unread articles after the current one', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
    { id: 3, read: 0 },
    { id: 4, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'unread')).toBe(2);
});

test('getRemainingUnreadAhead: excludes already-read articles ahead (Today filter case)', () => {
  const articles = [
    { id: 1, read: 1 },
    { id: 2, read: 0 },
    { id: 3, read: 1 },
    { id: 4, read: 0 },
    { id: 5, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'today')).toBe(2);
});

test('getRemainingUnreadAhead: is 0 for the last article in the list', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'unread')).toBe(0);
});

test('getRemainingUnreadAhead: is 0 when the current article is not found in the list', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 999, 'unread')).toBe(0);
});

test('getRemainingUnreadAhead: is 0 for filters other than unread/today', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
    { id: 3, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 1, 'all')).toBe(0);
  expect(getRemainingUnreadAhead(articles, 1, 'starred')).toBe(0);
  expect(getRemainingUnreadAhead(articles, 1, '42')).toBe(0);
});

test('getRemainingUnreadAhead: empty list returns 0', () => {
  expect(getRemainingUnreadAhead([], 1, 'unread')).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && bun test test/remainingUnread.test.ts`
Expected: FAIL — `Cannot find module '../src/reader/remainingUnread'` (or similar module-not-found error), since the file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/reader/remainingUnread.ts`:

```typescript
export function getRemainingUnreadAhead(
  articles: Array<{ id: number; read: number }>,
  currentArticleId: number,
  feedId: string
): number {
  if (feedId !== 'unread' && feedId !== 'today') return 0;

  const currentIndex = articles.findIndex((a) => a.id === currentArticleId);
  if (currentIndex === -1) return 0;

  return articles.slice(currentIndex + 1).filter((a) => a.read === 0).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && bun test test/remainingUnread.test.ts`
Expected: PASS — `6 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/reader/remainingUnread.ts mobile/test/remainingUnread.test.ts
git commit -m "feat: add getRemainingUnreadAhead helper for reader unread count"
```

---

### Task 2: Fix load ordering so the filtered list reflects pre-read state (fixes #32)

**Files:**
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx:60-74`

**Interfaces:**
- Consumes: nothing new — reuses existing `getArticles`, `markRead`, `getArticle` from `mobile/src/db/queries.ts`.
- Produces: `articleList` (state, unchanged type `ArticleRow[]`) is now guaranteed to be fetched before the current article's `read` flag is flipped, for every focus of this screen. Task 3 relies on this ordering guarantee.

**Context:** Today, `useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [...]))` fires both async functions independently. `loadArticle` calls `markRead` before `loadList`'s `getArticles` query executes, so in the `unread` filter the current article can already be excluded from the freshly-fetched list — `articleList.findIndex(a => a.id === article.id)` returns `-1`, which makes `prevArticle` always resolve to `null` (Prev button disabled) since `prevArticle` requires `currentIndex > 0`. This task sequences `loadList` fully before `loadArticle` so the list snapshot always reflects the pre-mark-read state.

- [ ] **Step 1: Read the current focus-effect block to confirm line numbers**

Run: `sed -n '39,76p' 'mobile/app/feeds/[feedId]/[articleId].tsx'`
Expected: shows the current `loadArticle`, `loadList`, and `useFocusEffect` block matching:

```typescript
  const loadArticle = useCallback(async () => {
    try {
      const db = getDb();
      await markRead(db, Number(articleId));
      const a = await getArticle(db, Number(articleId));
      setArticle(a);
    } catch (e) {
      console.error('ArticleReader load error:', e);
    }
  }, [articleId]);

  const loadList = useCallback(async () => {
    try {
      const db = getDb();
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today' || feedId === 'all'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader loadList error:', e);
    }
  }, [feedId]);

  useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [loadArticle, loadList]));
```

- [ ] **Step 2: Change the `useFocusEffect` call to sequence `loadList` before `loadArticle`**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, replace:

```typescript
  useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [loadArticle, loadList]));
```

with:

```typescript
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadList();
        await loadArticle();
      })();
    }, [loadList, loadArticle])
  );
```

Leave `loadArticle`, `loadList`, and every other line in the file unchanged in this step — `onStar`'s existing `await loadArticle()` call (around line 93) keeps calling only `loadArticle`, so toggling star doesn't trigger an extra list re-fetch.

- [ ] **Step 3: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors reported for `app/feeds/[feedId]/[articleId].tsx`.

- [ ] **Step 4: Manually verify the fix in the running app**

There is no automated component-test harness for Expo Router screens in this repo (`bun test test/` only covers pure logic under `src/`), so this task is verified by running the app:

Run: `cd mobile && npx expo start` (or `bun run ios` for the simulator), then in the app:
1. Ensure at least 3 unread articles exist in one feed (refresh a feed if needed).
2. Open the "All Unread" smart feed from the feed list.
3. Open the first article, then tap **Next** twice.
4. Tap **Prev**.

Expected: **Prev** is enabled and navigates back correctly at every step (previously it became disabled after the first `Next` tap due to the race). Confirm the article content shown after **Prev** matches the article you came from.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "fix: resolve reader list snapshot before marking article read (#32)"
```

---

### Task 3: Show remaining-unread count in the reader header

**Files:**
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx`

**Interfaces:**
- Consumes: `getRemainingUnreadAhead` from `mobile/src/reader/remainingUnread.ts` (Task 1); the now-correctly-sequenced `articleList`/`currentIndex` from Task 2.

- [ ] **Step 1: Import the helper**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, add to the existing import block (near the other local imports, e.g. below the `getYouTubeVideoId` import):

```typescript
import { getRemainingUnreadAhead } from '../../../src/reader/remainingUnread';
```

- [ ] **Step 2: Compute `remainingAhead` and the header title**

Locate the existing lines:

```typescript
  const currentIndex = articleList.findIndex((a) => a.id === article.id);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle = currentIndex < articleList.length - 1 ? articleList[currentIndex + 1] : null;
```

Add directly below them:

```typescript
  const remainingAhead = getRemainingUnreadAhead(articleList, article.id, feedId);
  const headerTitle =
    remainingAhead > 0
      ? `${article.feed_title ?? ''} · ${remainingAhead} left`
      : article.feed_title ?? '';
```

- [ ] **Step 3: Use `headerTitle` in `Stack.Screen`**

Replace:

```typescript
        options={{
          title: article.feed_title ?? '',
```

with:

```typescript
        options={{
          title: headerTitle,
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors reported for `app/feeds/[feedId]/[articleId].tsx`.

- [ ] **Step 5: Re-run the full test suite**

Run: `cd mobile && bun test test/`
Expected: PASS — all existing tests plus the 6 from Task 1 pass, `0 fail`.

- [ ] **Step 6: Manually verify in the running app**

Run: `cd mobile && npx expo start` (or `bun run ios`), then:
1. Open "All Unread" with several unread articles in it. Confirm the header reads `<Feed> · N left` and that `N` decreases by exactly 1 each time you tap **Next**.
2. Continue to the last unread article. Confirm the header reverts to just the feed name (no count) once `remainingAhead` reaches `0`.
3. Open "Today" (with a mix of read and unread articles published today, if available). Confirm the count reflects only the unread ones ahead, not the total count of today's articles.
4. Open "All" and "Starred". Confirm the header shows only the feed name in both, with no count — unchanged from current behavior.

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "feat: show unread-remaining count in reader header (#33)"
```

---

### Task 4: Frozen browsing-session store + `getArticlesByIds` query

**Context:** Interactive testing after Task 2/3 revealed the load-order fix alone does not restore Prev — see the design spec's "Addendum: freeze the browsing list at entry" section (`docs/superpowers/specs/2026-07-06-reader-unread-remaining-count-design.md`). Because `articleList` is re-derived from a live `read = 0` query on every reader focus, the current article is always first in its own snapshot once everything before it in the session has been read, so Prev can never resolve. This task adds the two pieces needed to freeze the list instead: an in-memory session store, and a query that hydrates full rows for a fixed set of ids (with **live** read state, so the count still updates correctly).

**Files:**
- Create: `mobile/src/reader/session.ts`
- Modify: `mobile/src/db/queries.ts`
- Test: `mobile/test/session.test.ts`
- Test: `mobile/test/queries.test.ts` (add cases; do not remove existing ones)

**Interfaces:**
- Produces: `setReaderSession(key: string, ids: number[]): void` and `getReaderSession(key: string): number[] | null` from `mobile/src/reader/session.ts` — used by Task 5 in both the list screen (`onTap`) and reader screen (`loadList`).
- Produces: `getArticlesByIds(db: SQLiteDatabase, ids: number[]): Promise<ArticleRow[]>` from `mobile/src/db/queries.ts` — used by Task 5's reader `loadList`.

- [ ] **Step 1: Write the failing tests for `session.ts`**

Create `mobile/test/session.test.ts`:

```typescript
import { expect, test } from 'bun:test';
import { setReaderSession, getReaderSession } from '../src/reader/session';

test('getReaderSession: returns the ids stored by the last setReaderSession call for the same key', () => {
  setReaderSession('unread', [1, 2, 3]);
  expect(getReaderSession('unread')).toEqual([1, 2, 3]);
});

test('getReaderSession: returns null when the key does not match the last stored key', () => {
  setReaderSession('unread', [1, 2, 3]);
  expect(getReaderSession('today')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/session.test.ts'` (raise the fd limit first — this sandboxed environment sometimes hits a spurious `EMFILE`/`ProcessFdQuotaExceeded` error on plain `bun test`, unrelated to the code).
Expected: FAIL — `Cannot find module '../src/reader/session'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/reader/session.ts`:

```typescript
let currentKey: string | null = null;
let currentIds: number[] = [];

export function setReaderSession(key: string, ids: number[]): void {
  currentKey = key;
  currentIds = ids;
}

export function getReaderSession(key: string): number[] | null {
  return currentKey === key ? currentIds : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/session.test.ts'`
Expected: PASS — `2 pass`, `0 fail`.

- [ ] **Step 5: Write the failing tests for `getArticlesByIds`**

Append to `mobile/test/queries.test.ts` (add near the other article-query tests; keep all existing tests in the file unchanged):

```typescript
import { getArticlesByIds, type ArticleRow } from '../src/db/queries';

function fakeArticle(id: number, read: number): ArticleRow {
  return {
    id, feed_id: 1, guid: `g${id}`, title: `Title ${id}`, url: null, author: null,
    content_html: null, content_text: null, summary: null, published_at: null,
    fetched_at: '', read, read_at: null, starred: 0, video_width: null, video_height: null,
    feed_title: 'Feed', feed_site_url: null,
  };
}

test('getArticlesByIds: returns rows in the requested id order, not query order', async () => {
  const rows = [fakeArticle(1, 0), fakeArticle(2, 1), fakeArticle(3, 0)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [3, 1, 2]);
  expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
});

test('getArticlesByIds: silently omits ids not present in the result set', async () => {
  const rows = [fakeArticle(1, 0)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [1, 999]);
  expect(result.map((r) => r.id)).toEqual([1]);
});

test('getArticlesByIds: empty ids array returns empty array without querying', async () => {
  let called = false;
  const fakeDb = { getAllAsync: async () => { called = true; return []; } } as any;
  const result = await getArticlesByIds(fakeDb, []);
  expect(result).toEqual([]);
  expect(called).toBe(false);
});

test('getArticlesByIds: reflects live read state from the query result', async () => {
  const rows = [fakeArticle(5, 1)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [5]);
  expect(result[0].read).toBe(1);
});
```

Note: `mobile/test/queries.test.ts` currently imports `Database` from `bun:sqlite` and tests raw SQL directly against it (pre-existing convention for the rest of the file) — these new tests instead call the real exported `getArticlesByIds` function with a minimal fake `db` object (`{ getAllAsync: async () => rows }`), since its order-preserving/filtering logic is plain JS, not SQL. Add the `getArticlesByIds`/`ArticleRow` import and `fakeArticle` helper alongside the file's existing imports/helpers — do not change any existing test in the file.

- [ ] **Step 6: Run to verify the new tests fail**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/queries.test.ts'`
Expected: FAIL — `getArticlesByIds` is not exported from `../src/db/queries` (existing tests in the file still pass).

- [ ] **Step 7: Write minimal implementation**

Add to `mobile/src/db/queries.ts` (near the other article query functions, e.g. after `getArticle`):

```typescript
export async function getArticlesByIds(db: SQLiteDatabase, ids: number[]): Promise<ArticleRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<ArticleRow>(
    `SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     WHERE a.id IN (${placeholders})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ArticleRow => r != null);
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/queries.test.ts'`
Expected: PASS — all existing tests in the file plus the 4 new ones, `0 fail`.

- [ ] **Step 9: Run the full suite**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/'`
Expected: PASS — `0 fail` (existing 66 + 2 session + 4 getArticlesByIds = 72 tests).

- [ ] **Step 10: Commit**

```bash
git add mobile/src/reader/session.ts mobile/test/session.test.ts mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: add frozen reader-session store and getArticlesByIds query"
```

---

### Task 5: Wire the frozen session into the list and reader screens

**Files:**
- Modify: `mobile/app/feeds/[feedId]/index.tsx`
- Modify: `mobile/app/feeds/[feedId]/[articleId].tsx`

**Interfaces:**
- Consumes: `setReaderSession` (in the list screen) and `getReaderSession` + `getArticlesByIds` (in the reader screen) from Task 4.

- [ ] **Step 1: Import `setReaderSession` in the list screen**

In `mobile/app/feeds/[feedId]/index.tsx`, add to the existing imports:

```typescript
import { setReaderSession } from '../../../src/reader/session';
```

- [ ] **Step 2: Capture the session snapshot in `onTap`**

Locate:

```typescript
  const onTap = async (article: ArticleRow) => {
    try {
      const db = getDb();
      await markRead(db, article.id);
    } catch (e) {
      console.error('markRead error:', e);
    }
    router.push(`/feeds/${rawId}/${article.id}`);
  };
```

Replace with:

```typescript
  const onTap = async (article: ArticleRow) => {
    try {
      const db = getDb();
      await markRead(db, article.id);
    } catch (e) {
      console.error('markRead error:', e);
    }
    setReaderSession(rawId, articles.map((a) => a.id));
    router.push(`/feeds/${rawId}/${article.id}`);
  };
```

- [ ] **Step 3: Import `getReaderSession` and `getArticlesByIds` in the reader screen**

In `mobile/app/feeds/[feedId]/[articleId].tsx`, the current imports (lines 9 and 13) read:

```typescript
import { getArticle, markRead, toggleStar, getArticles, type ArticleRow } from '../../../src/db/queries';
```
```typescript
import { getRemainingUnreadAhead } from '../../../src/reader/remainingUnread';
```

Change the first line to add `getArticlesByIds`:

```typescript
import { getArticle, markRead, toggleStar, getArticles, getArticlesByIds, type ArticleRow } from '../../../src/db/queries';
```

Add a new import line directly below the `getRemainingUnreadAhead` import:

```typescript
import { getReaderSession } from '../../../src/reader/session';
```

- [ ] **Step 4: Use the frozen session in `loadList`, with a live-query fallback**

Replace:

```typescript
  const loadList = useCallback(async () => {
    try {
      const db = getDb();
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today' || feedId === 'all'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader loadList error:', e);
    }
  }, [feedId]);
```

with:

```typescript
  const loadList = useCallback(async () => {
    try {
      const db = getDb();
      const sessionIds = getReaderSession(feedId);
      if (sessionIds) {
        setArticleList(await getArticlesByIds(db, sessionIds));
        return;
      }
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today' || feedId === 'all'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader loadList error:', e);
    }
  }, [feedId]);
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: no new errors reported for either modified file.

- [ ] **Step 6: Run the full test suite**

Run: `cd mobile && bash -c 'ulimit -n 8192; bun test test/'`
Expected: PASS — `0 fail` (this task adds no new automated tests; it wires already-tested pieces together — the existing 72 keep passing).

- [ ] **Step 7: Manually verify in the running app**

There is no automated component-test harness for these screens. Verify with the app running (`cd mobile && npx expo start` or `bun run ios`):
1. Ensure "All Unread" has at least 4 unread articles (add/refresh a feed if needed).
2. Open the first article from the list, then tap **Next** three times, then tap **Prev** three times back to the start.
3. At every article except the very first, confirm **Prev** is enabled (not dimmed) and tapping it lands on the exact article you came from (check the headline).
4. Confirm the "`<Feed>` · N left" count reflects live unread state at every step: it decreases by one on each **Next**. On the way back via **Prev**, it does **not** necessarily increase symmetrically — articles you already read on the way forward are correctly excluded from the count when you revisit them, so the count can stay flat or only partially recover. That is correct behavior (the count is not a simple position index), not a bug.
5. Repeat steps 1-4 for "Today" if a mix of read/unread articles published today is available.
6. Force-quit and relaunch, then open the reader directly via a deep link (e.g. `xcrun simctl openurl <device> "fressh://feeds/unread/<some-article-id>"`) without going through the list screen first — confirm it still opens without crashing (exercises the live-query fallback, since no session was set for this key).

- [ ] **Step 8: Commit**

```bash
git add "mobile/app/feeds/[feedId]/index.tsx" "mobile/app/feeds/[feedId]/[articleId].tsx"
git commit -m "fix: freeze the reader browsing list at entry so Prev survives read-state changes (#32)"
```

---

## Out of scope (per design spec)

- No change to the "All"/"Starred" filters' header display.
