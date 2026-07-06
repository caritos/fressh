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

## Out of scope (per design spec)

- No change to the "All"/"Starred" filters' header display.
- No new shared SQL query — the count is derived from data already loaded for Prev/Next.
- No persistence of the filtered list across navigations (e.g. via route params) — the existing per-focus re-fetch pattern is kept, just resequenced.
