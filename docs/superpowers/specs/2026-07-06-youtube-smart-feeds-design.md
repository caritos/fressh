# YouTube / Non-YouTube Smart Feeds — Design

## Summary

Add two new smart feeds — "YouTube" and "Non-YouTube" — that filter articles by whether their URL points to a YouTube video, matching the existing "All"/"Starred"/"All Unread"/"Today" pattern (GitHub issue #34, scope limited to the smart-feed request; offline download is a separate future issue, out of scope here).

## Motivation

Issue #34 asks for a way to browse articles split by content type: YouTube videos vs. everything else. There is no existing "is this a YouTube article" flag in the database — `article.video_width`/`video_height` are unreliable for this (only set for articles inserted during a refresh where the YouTube oEmbed call happened to succeed within its 8s timeout; never backfilled for older articles). The reader screen (`mobile/app/feeds/[feedId]/[articleId].tsx:92`) already re-derives YouTube-ness from the URL on every render via `getYouTubeVideoId`, so the URL itself is the only reliable signal.

## Design

### Detection: SQL URL pattern match, not a new column

Filter directly on `article.url` in the smart-feed queries:

```sql
-- YouTube
WHERE a.url LIKE '%youtube.com%' OR a.url LIKE '%youtu.be%'

-- Non-YouTube
WHERE a.url IS NULL OR (a.url NOT LIKE '%youtube.com%' AND a.url NOT LIKE '%youtu.be%')
```

No schema change, and this works retroactively on every article already in the database (unlike a computed column, which would only classify articles going forward unless backfilled).

**NULL-url edge case:** `article.url` is nullable (`ArticleRow.url: string | null`). In SQL's three-valued logic, `NULL NOT LIKE '...'` evaluates to `NULL`, not `TRUE` — so a naive `NOT (url LIKE ... OR url LIKE ...)` would silently exclude NULL-url articles from *both* smart feeds. The Non-YouTube query explicitly handles this with `url IS NULL OR (...)`, since an article with no URL is definitionally not a YouTube video.

### Two new smart feeds

Added to `SMART_FEEDS` (`mobile/app/feeds/index.tsx:27-32`) and `SMART_LABELS` (`mobile/app/feeds/[feedId]/index.tsx:33-38`):
- `youtube` → "YouTube"
- `nonyoutube` → "Non-YouTube"

Same as `all`/`starred`/`today`: no read-state filter, ordered by `published_at DESC`, showing every matching article regardless of read status (only "All Unread" filters by read state today).

### Badge counts

Same pattern as the existing three inline count queries in `feeds/index.tsx`'s `loadFeeds` — two more `COUNT(*)` queries using the same URL-match/NULL-handling logic, added to `smartCounts` state and `getSmartCount`.

### Mark All Read — scoped to the category

Both new smart feeds get a "Mark All Read" button (confirmed: yes, scoped — not the existing `markAllUnreadRead`, which marks every unread article system-wide regardless of category). Two new functions in `queries.ts`, mirroring `markAllTodayRead`'s scoped-by-condition pattern rather than `markAllUnreadRead`'s global one:

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

`onMarkAllRead` (`mobile/app/feeds/[feedId]/index.tsx:98-123`) gets two new branches calling these, and `hasMarkAllRead` (line 200) is extended to include `'youtube'`/`'nonyoutube'`.

### Cleanup: consolidate the duplicated smart-feed-id type

The smart-feed-id string union (`'unread' | 'starred' | 'today' | 'all'`) is currently copy-pasted with no shared type across four places: `getArticles`'s signature (`queries.ts:92`), the list screen's `feedId` narrowing (`[feedId]/index.tsx:58-61`), and the reader screen's duplicate narrowing (`[articleId].tsx:70-73`) — the `all` variant of the "is this a smart feed" check is otherwise never centralized. Adding two more literals is the point where this becomes worth fixing rather than pasting a fifth copy. `queries.ts` exports:

```typescript
export type SmartFeedId = 'unread' | 'starred' | 'today' | 'all' | 'youtube' | 'nonyoutube';

const SMART_FEED_IDS: readonly SmartFeedId[] = ['unread', 'starred', 'today', 'all', 'youtube', 'nonyoutube'];

export function isSmartFeedId(id: string): id is SmartFeedId {
  return (SMART_FEED_IDS as readonly string[]).includes(id);
}
```

`getArticles`'s signature changes from `feedId: number | 'unread' | 'starred' | 'today' | 'all'` to `feedId: number | SmartFeedId`, with two new branches for `youtube`/`nonyoutube`. The two narrowing call sites become:

```typescript
const feedId = isSmartFeedId(rawId) ? rawId : Number(rawId);
```

replacing their respective five-way `===` chains. This is a mechanical, behavior-preserving refactor (same runtime logic, same result) that also makes the reader's `getReaderSession`/frozen-session code and `getRemainingUnreadAhead` (which already take `feedId: string` and only special-case `'unread'`/`'today'`) automatically correct for the two new ids with zero changes — they simply return `0`/no-count for `youtube`/`nonyoutube`, matching how `all`/`starred` behave today.

## Components affected

- `mobile/src/db/queries.ts` — `SmartFeedId` type + `isSmartFeedId` guard, two new `ARTICLES_*` SQL constants, `getArticles` signature/branches, two new `markAll*Read` functions.
- `mobile/app/feeds/index.tsx` — `SMART_FEEDS` list, two new count queries in `loadFeeds`, `smartCounts` state shape, `getSmartCount`.
- `mobile/app/feeds/[feedId]/index.tsx` — `SMART_LABELS`, `feedId` narrowing (via `isSmartFeedId`), `onMarkAllRead` branches, `hasMarkAllRead` condition.
- `mobile/app/feeds/[feedId]/[articleId].tsx` — `feedId` narrowing in `loadList`'s fallback branch (via `isSmartFeedId`), replacing its duplicate five-way check.

No changes to `mobile/src/reader/remainingUnread.ts`, `mobile/src/reader/session.ts`, or the schema.

## Error handling

No new failure surface — reuses existing `getFirstAsync`/`getAllAsync`/`runAsync` call patterns and their existing try/catch blocks throughout.

## Testing

- Unit tests for the new `ARTICLES_YOUTUBE`/`ARTICLES_NON_YOUTUBE` SQL (via the existing `bun:sqlite` integration-test pattern in `mobile/test/queries.test.ts`): a YouTube-URL article appears only in the YouTube query; a non-YouTube-URL article appears only in the non-YouTube query; a NULL-url article appears only in the non-YouTube query (the edge case above).
- Unit tests for `markAllYoutubeRead`/`markAllNonYoutubeRead`: marks only matching unread articles, leaves the other category's unread articles untouched, leaves already-read articles' `read_at` unchanged (`COALESCE` behavior, matching the existing `markAllTodayRead` test if one exists — otherwise mirroring its shape).
- Unit tests for `isSmartFeedId`: true for all six smart ids, false for an arbitrary numeric-looking string.
- Manual (simulator): open "YouTube" and "Non-YouTube" from the feed list, confirm articles are correctly split (including any NULL-url edge cases if reachable), confirm badge counts match the list contents, confirm "Mark All Read" in each only affects that category.

## Out of scope

- Downloading article content for offline reading (separate future issue).
- Any change to how YouTube-ness is detected/rendered inside the reader screen itself (`getYouTubeVideoId` at render time is unchanged).
- Any change to `video_width`/`video_height` population or the aspect-ratio feature.
- Retention/deletion interaction — not applicable to this feature (no new persisted state that retention could delete).

## Files touched

- `mobile/src/db/queries.ts` — `SmartFeedId` type, `isSmartFeedId`, 2 new SQL constants, `getArticles` update, 2 new `markAll*Read` functions
- `mobile/app/feeds/index.tsx` — smart feed list, badge counts
- `mobile/app/feeds/[feedId]/index.tsx` — labels, narrowing, mark-all-read wiring
- `mobile/app/feeds/[feedId]/[articleId].tsx` — narrowing (reader's list-load fallback)
- `mobile/test/queries.test.ts` — new tests
