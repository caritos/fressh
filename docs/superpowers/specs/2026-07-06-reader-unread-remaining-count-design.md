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
- No new shared query helper — the count is derived from data already loaded for prev/next.
- No persistence of the filtered list across navigations (e.g. via route params) — the existing per-focus re-fetch pattern is kept, just reordered.

## Files touched

- `mobile/app/feeds/[feedId]/[articleId].tsx` — load-order fix, `remainingAhead` derivation, header title
