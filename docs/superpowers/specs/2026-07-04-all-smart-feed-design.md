# "All" Smart Feed — Design

## Summary

Add a fourth smart feed, "All", to the main feed list. It shows every article across every feed — read and unread — sorted newest to oldest. It's the broadest view in the app, so it's placed first in the Smart Feeds section, has no badge count, and supports Mark All Read (which clears unread state app-wide, same action as the existing All Unread button).

## Motivation

The existing smart feeds (Starred, All Unread, Today) all filter down to a subset. There's no way to browse the full article history across all feeds in one chronological list — "All" fills that gap.

## Design

### Smart Feeds order

`SMART_FEEDS` in `mobile/app/feeds/index.tsx` becomes:

```
[
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
]
```

### Badge

None. `getSmartCount()` already returns `0` for any unrecognized id, and `Badge` already renders `null` at `count === 0` — so "All" gets no badge with no additional code, consistent with how "total article count" isn't an actionable number the way an unread count is.

### Data layer (`mobile/src/db/queries.ts`)

New query, same shape as `ARTICLES_TODAY` but with no filter at all:

```sql
SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
FROM articles a
JOIN feeds f ON a.feed_id = f.id
ORDER BY a.published_at DESC
```

`getArticles()`'s `feedId` parameter type extends from `number | 'unread' | 'starred' | 'today'` to also include `'all'`, dispatching to this new query.

### Article list & reader

- `SMART_LABELS` (in `mobile/app/feeds/[feedId]/index.tsx`) gets `all: 'All'`.
- The `feedId` string-union parsing in both `mobile/app/feeds/[feedId]/index.tsx` and `mobile/app/feeds/[feedId]/[articleId].tsx` extends to include `'all'`.
- `hasMarkAllRead` extends to include `feedId === 'all'`.
- Mark All Read for `'all'` calls the existing `markAllUnreadRead(db)` — the same bulk operation All Unread's button already uses (clear every currently-unread article app-wide). No new database function needed.
- Row dimming (`dimmed={!!item.read}`) is already generic across the list — read articles show grayed out, same treatment Today already uses for its mixed read/unread list.
- Prev/Next navigation in the reader is already generic over `getArticles(db, feedIdParam)` — works automatically once the type union is extended, no logic changes needed.

## Out of scope

- No pagination — matches existing behavior of every other list in the app (single unbounded query).
- No separate "mark all read" confirmation copy — reuses the existing generic alert ("Mark every article in this list as read?").

## Files touched

- `mobile/src/db/queries.ts`
- `mobile/app/feeds/index.tsx`
- `mobile/app/feeds/[feedId]/index.tsx`
- `mobile/app/feeds/[feedId]/[articleId].tsx`
