# YouTube Player Aspect Ratio — Design

## Summary

Size the embedded YouTube player in the article reader to match each video's real aspect ratio, instead of always assuming 16:9 landscape. Portrait/Shorts-style videos currently get pillarboxed into a landscape-shaped box and look tiny; they should fill the box properly.

## Motivation

`mobile/app/feeds/[feedId]/[articleId].tsx` computes `videoHeight = (width - 40) * (9 / 16)` unconditionally. A vertical video rendered inside that box is scaled down to fit its width within a 16:9 frame, leaving black bars on both sides and a much smaller picture than the screen affords.

## Design

### Aspect ratio source: YouTube oEmbed

`https://www.youtube.com/oembed?url=<video-url>&format=json` returns `width`/`height` fields that reflect the actual video's aspect ratio — verified directly:

- Landscape video: `"width":200,"height":113` (16:9)
- Shorts (portrait) video: `"width":113,"height":200"` (9:16)

(`thumbnail_width`/`thumbnail_height` are always 480×360 regardless of video shape — not usable for this purpose.)

### Fetch at refresh time, not view time

Per user preference, the oEmbed call happens once per new article during feed refresh, not when the article is opened — so viewing an article never triggers a network call and repeated refreshes don't re-fetch for articles already known.

### New util: `mobile/src/fetcher/youtube.ts`

- `getYouTubeVideoId(url: string | null): string | null` — moved verbatim from the local `getYouTubeId` in `articleId.tsx` (same regex, same behavior, just relocated so both the refresh pipeline and the reader screen share one implementation).
- `fetchYouTubeAspectRatio(url: string): Promise<{ width: number; height: number } | null>` — calls the oEmbed endpoint with an AbortController timeout (8s, matching the pattern in `fetch.ts`), parses the JSON, returns `{ width, height }` when both are positive numbers, otherwise `null`. Any thrown error (network, timeout, non-OK status, malformed JSON) is caught and also yields `null` — this is best-effort enrichment, never something that should fail a refresh.

### Schema migration (`SCHEMA_VERSION` 2 → 3)

`CREATE_ARTICLES` in `shared/schema.ts` gets two new nullable columns added directly to its column list:

```sql
video_width INTEGER,
video_height INTEGER
```

In `mobile/src/db/database.ts`, following the existing per-version branch pattern:

```typescript
const SCHEMA_VERSION = 3;
// ...
if (current < SCHEMA_VERSION) {
  await db.execAsync(CREATE_FEEDS);
  await db.execAsync(CREATE_ARTICLES);
  await db.execAsync(CREATE_SETTINGS);
  for (const sql of CREATE_INDEXES) await db.execAsync(sql);
  if (current === 1) { /* existing read_at migration, unchanged */ }
  if (current > 0 && current < 3) {
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
  }
  await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
}
```

Fresh installs (`current === 0`) get the columns from `CREATE_ARTICLES` directly. The existing self-heal block (checking `PRAGMA table_info(articles)` for `read_at`) gets a matching check for `video_width`, so a stuck/corrupted `schema_version` row can't leave the columns permanently missing:

```typescript
if (!columns.some((c) => c.name === 'video_width')) {
  await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
  await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
}
```

The console app shares `CREATE_ARTICLES` but has no migration system and no use for these columns (it doesn't render video). Fresh console DBs get the columns for free; existing console DBs simply never populate them, which is harmless since nothing there reads them.

### Insertion + enrichment (`mobile/src/db/queries.ts`, `mobile/src/fetcher/refresh.ts`)

`insertArticles` changes return type from `Promise<number>` to `Promise<Array<{ id: number; url: string | null }>>` — the list of articles actually inserted (via `INSERT OR IGNORE`, keyed off `result.changes > 0` and `result.lastInsertRowId`), not just a count. This lets the caller target enrichment at genuinely-new articles only.

New query: `updateArticleVideoDimensions(db, id: number, width: number, height: number): Promise<void>` — `UPDATE articles SET video_width = ?, video_height = ? WHERE id = ?`.

In `refresh.ts`, after `insertArticles` returns, for the newly-inserted articles whose `url` yields a YouTube video ID via `getYouTubeVideoId`, fetch aspect ratio for all of them concurrently (`Promise.all`) and persist any that succeed, before moving to `updateFeedFetchMeta`:

```typescript
const insertedArticles = await insertArticles(db, feed.id, parsed.articles);
newArticles += insertedArticles.length;
await Promise.all(
  insertedArticles
    .filter((a) => getYouTubeVideoId(a.url))
    .map(async (a) => {
      const dims = await fetchYouTubeAspectRatio(a.url!);
      if (dims) await updateArticleVideoDimensions(db, a.id, dims.width, dims.height);
    })
);
```

This keeps enrichment scoped to this feed's newly-inserted articles and awaited before `refresh()` reports completion for that feed — acceptable since new-YouTube-article counts per refresh cycle are small.

### Article reader (`mobile/app/feeds/[feedId]/[articleId].tsx`)

- Import `getYouTubeVideoId` from `../../../src/fetcher/youtube` instead of defining `getYouTubeId` locally; call sites unchanged (just renamed).
- Replace the fixed `videoHeight` calculation:

```typescript
const boxWidth = width - 40;
const aspectRatio =
  article.video_width && article.video_height
    ? article.video_width / article.video_height
    : 16 / 9;
const videoHeight = Math.round(boxWidth / aspectRatio);
```

Articles without stored dimensions (enrichment failed, or predate this feature) fall back to today's 16:9 box — no regression for existing data.

## Out of scope

- No change to fullscreen/expand-button behavior in the player.
- No backfill of `video_width`/`video_height` for articles already in the database before this change ships — they simply keep using the 16:9 fallback until re-fetched (they won't be re-inserted since `guid` already exists, so pre-existing YouTube articles never get enriched).
- No retry logic for failed oEmbed calls — a failure just leaves the columns NULL permanently for that article.
- No changes to the console app's schema handling.

## Files touched

- `shared/schema.ts` — two new columns on `CREATE_ARTICLES`
- `mobile/src/db/database.ts` — migration bump to version 3, ALTER TABLE + self-heal check
- `mobile/src/db/queries.ts` — `insertArticles` return type change, new `updateArticleVideoDimensions`
- `mobile/src/fetcher/youtube.ts` (new) — `getYouTubeVideoId`, `fetchYouTubeAspectRatio`
- `mobile/src/fetcher/refresh.ts` — enrichment step after insert
- `mobile/app/feeds/[feedId]/[articleId].tsx` — use shared `getYouTubeVideoId`, real-aspect-ratio sizing
- `mobile/test/` — new tests for `youtube.ts`
