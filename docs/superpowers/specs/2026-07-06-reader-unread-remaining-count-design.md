# Reader "Unread Remaining" Count — Design

## Summary

Show how many unread articles are still ahead while flipping through the "All Unread" and "Today" smart-feed views in the article reader (GitHub issue #33). As a side effect of the required fix, also resolves issue #32 (Prev button incorrectly disabled in "All Unread").

## Motivation

Issue #33 ("should unreaded counter in 'all read' and 'today'") asks for a way to tell, while reading through a filtered list, how many more unread articles remain. There is no "All Read" filter in the app — the smart feeds are `All`, `All Unread`, `Starred`, `Today` (`mobile/app/feeds/index.tsx:27-32`) — so this is scoped to `unread` and `today`, matching the issue's own screenshot of the "All Unread" view.

## Root cause context (shared with issue #32)

`mobile/app/feeds/[feedId]/[articleId].tsx` currently runs two independent effects on focus:

```typescript
const loadArticle = useCallback(async () => {
  await markRead(db, Number(articleId));   // marks the article read...
  const a = await getArticle(db, Number(articleId));
  setArticle(a);
}, [articleId]);

const loadList = useCallback(async () => {
  const list = await getArticles(db, feedIdParam);   // ...before the filtered list is re-fetched
  setArticleList(list);
}, [feedId]);

useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [loadArticle, loadList]));
```

In the `unread` filter, `ARTICLES_UNREAD` returns only `read = 0` rows. Because `markRead` runs before `loadList`'s query executes, the current article can already be excluded from the freshly-fetched list, making `articleList.findIndex(a => a.id === article.id)` return `-1`. `prevArticle` requires `currentIndex > 0`, so a `-1` index always yields `null` (Prev disabled) — this is issue #32. Any unread-count feature built on top of `articleList` without fixing this ordering would inherit the same bug (miscounting or throwing off "ahead" calculations).

## Design

### Fix the load order

Reorder the focus effect so the list (and the current article's position within it) is captured **before** the article is marked read:

1. Fetch `articleList` via `getArticles(db, feedIdParam)`.
2. Mark the current article read via `markRead`.
3. Fetch the (now updated) article record via `getArticle` for display.

This guarantees `articleList` reflects the pre-mark-read state, so `currentIndex`, `prevArticle`, and `nextArticle` resolve correctly — fixing #32 — and gives a stable base for the new count.

### Compute "unread remaining ahead"

Derived entirely client-side from the already-loaded `articleList` — no new SQL query:

```typescript
const remainingAhead =
  (feedId === 'unread' || feedId === 'today') && currentIndex >= 0
    ? articleList.slice(currentIndex + 1).filter((a) => a.read === 0).length
    : 0;
```

- For `unread`, every row in `articleList` already has `read = 0` (query-level filter), so this is equivalent to `articleList.length - currentIndex - 1`.
- For `today`, `ARTICLES_TODAY` returns all of today's articles regardless of read state, so the `.filter((a) => a.read === 0)` is required to exclude already-read ones.
- For `all`, `starred`, or a numeric feed id, `remainingAhead` is always `0` and the count is not shown (out of scope per the issue).

### Display: fold into the existing header title

`Stack.Screen`'s `title` currently renders `article.feed_title` (the source feed's name, not the filter name — it changes per article since a filtered view mixes feeds). Extend it:

```typescript
const headerTitle =
  remainingAhead > 0
    ? `${article.feed_title ?? ''} · ${remainingAhead} left`
    : article.feed_title ?? '';
```

No new header component — reuses the plain string `title` prop, alongside the existing `headerRight` (star/share icons). When `remainingAhead` is `0` (last unread/today article, or filter doesn't apply), the title is unchanged from today's behavior.

## Components affected

Only `mobile/app/feeds/[feedId]/[articleId].tsx` changes:
- Reordered `loadList`/`markRead`/`loadArticle` sequence.
- New `remainingAhead` derivation.
- `Stack.Screen`'s `title` prop computed from `remainingAhead`.

No changes to `NavBar`, `Badge`, `queries.ts`, or the schema — this reuses data already being fetched for prev/next navigation.

## Error handling

No new failure surface. Reuses the existing `getArticles`/`getArticle`/`markRead` calls and their existing try/catch blocks; a failed fetch leaves `articleList` as its previous value (existing behavior, unchanged).

## Testing

Manual verification (no automated test harness currently covers this screen's navigation):
- Open "All Unread": confirm the header shows "`<Feed>` · N left", N decrementing by one with each Next; confirm Prev stays enabled while navigating forward, then back (regression check for #32).
- Open "Today": confirm the count reflects only unread articles ahead, not the total count of today's articles.
- Confirm "All" and "Starred" show no count (unchanged from current behavior).
- Confirm the count disappears (title reverts to plain feed name) on the last unread/today article.

## Out of scope

- No change to the "All"/"Starred" filters' header display.

## Addendum: freeze the browsing list at entry (found during interactive verification)

Manual testing in the simulator after implementing the above revealed that the load-order fix does **not** actually restore Prev in the way issue #32 wants. Walking through "All Unread" article by article:

- Article 1 (via list tap): the list screen's own `onTap` already calls `markRead` before navigating, so article 1 is excluded from the reader's first `getArticles('unread')` fetch. `currentIndex` is `-1`; Prev disabled — expected, it's the first article anyway.
- Article 2 (via Next): `loadList` now runs before `markRead` (per the fix above), so article 2 survives its own fetch — but article 1 is permanently gone from every future `unread` fetch. `currentIndex` is `0`; Prev disabled.
- Article 3 (via Next): same shape — articles 1 and 2 are both now read and excluded, article 3 is `0`; Prev disabled.

Confirmed via exact pixel-color match against `COLORS.textDimmed` at each step (not visual guessing) — Prev renders disabled at every article reached via Next, reproducing the original bug report exactly. The load-order fix is still correct and worth keeping (it fixed a real off-by-one: pre-fix, `currentIndex = -1` made `nextArticle` resolve to `articleList[0]`, skipping the true next unread article; post-fix, `currentIndex = 0` correctly resolves `nextArticle` to `articleList[1]`). But because `articleList` is re-derived from a live `read = 0` query on every focus, the current article is mathematically always first in its own snapshot once everything before it has been read — Prev can never point anywhere.

**Fix: stop re-deriving the browsing list from a live filtered query. Freeze the article-id order once, when entering the reader from the list screen, and keep using it for the rest of that browsing session — independent of read-state changes the session itself causes.**

### New module: `mobile/src/reader/session.ts`

A minimal in-memory singleton (matches this codebase's existing style — no state-management library is used anywhere else):

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

`key` is the raw `feedId` route param (string, e.g. `"unread"`, `"today"`, or a numeric feed id as a string) — the same value already used to select which SQL query to run.

### New query: `getArticlesByIds` (`mobile/src/db/queries.ts`)

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

No `WHERE read = 0` — membership in the returned list depends only on the frozen `ids`, never on live read state, which is what eliminates the bug at its root. SQL `IN` doesn't guarantee row order, so results are re-sorted back into the requested `ids` order; any id no longer present (e.g. deleted by retention cleanup) is silently skipped.

### List screen (`mobile/app/feeds/[feedId]/index.tsx`)

In `onTap`, before `router.push`, capture the currently-loaded `articles` state's id order:

```typescript
setReaderSession(rawId, articles.map((a) => a.id));
```

### Reader screen (`mobile/app/feeds/[feedId]/[articleId].tsx`)

`loadList` tries the frozen session first, falling back to the existing live query if the reader was entered without going through the list screen (e.g. a deep link):

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
    setArticleList(await getArticles(db, feedIdParam));
  } catch (e) {
    console.error('ArticleReader loadList error:', e);
  }
}, [feedId]);
```

Everything downstream (`currentIndex`, `prevArticle`, `nextArticle`, `remainingAhead`) is unchanged — they already operate on `articleList` regardless of how it was populated. `remainingAhead` still reflects live read state per row (from `getArticlesByIds`), so the count keeps decrementing correctly as the session progresses; only *membership* in the list is frozen, not the read flags used for counting.

The Task 2 load-order fix (`loadList` before `markRead`) remains in place — harmless, and still correct for the deep-link fallback path.

### Testing (addendum)

- Unit test `getArticlesByIds`: given `ids = [3, 1, 2]` with mixed read states, returns rows in `[3, 1, 2]` order with live `read` values; an id not present in the table is silently omitted; empty input returns `[]`.
- Unit test `session.ts`: `setReaderSession`/`getReaderSession` round-trip returns the stored ids; a `getReaderSession` call with a different key than the last `setReaderSession` call returns `null`.
- Manual (simulator): re-run the exact scenario above — open "All Unread", tap into the first article, tap Next three times, then tap Prev three times back to the start, confirming at each step that Prev is enabled (except genuinely at the first article) and lands on the correct previous article, and the "N left" count is consistent going both directions.

## Files touched

- `mobile/app/feeds/[feedId]/[articleId].tsx` — load-order fix, `remainingAhead` derivation, header title, frozen-session list load with live fallback
- `mobile/app/feeds/[feedId]/index.tsx` — capture the browsing session's id order in `onTap`
- `mobile/src/reader/session.ts` (new) — in-memory frozen browsing-session store
- `mobile/src/db/queries.ts` — new `getArticlesByIds`
- `mobile/test/` — new tests for `session.ts` and `getArticlesByIds`
