# Auto-Delete Read Articles — Design

## Summary

Automatically delete read articles a configurable number of days (30 or 90, default 90) after they were marked read. Starred articles are always exempt. The retention window is configurable in Settings.

## Motivation

Articles currently accumulate forever — the only existing deletion path is removing an entire feed (which cascades). With no cleanup, read articles pile up indefinitely (the app already has 11,000+ unread articles in testing; read ones accumulate the same way with no bound). This lets users reclaim space and keep the database lean without manually managing individual articles.

## Design

### Schema migration (`SCHEMA_VERSION` 1 → 2)

`CREATE_ARTICLES` in `shared/schema.ts` gets `read_at DATETIME` added to its column list directly, so brand-new installs create the column from the start (the `CREATE TABLE IF NOT EXISTS` never re-runs against an existing table, so this alone does nothing for upgrading installs). A new `CREATE_SETTINGS` constant is added alongside it:
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)
```

**Important — the existing migration in `mobile/src/db/database.ts` has no per-version granularity today.** `_migrate()` currently does one blanket check, `if (current < SCHEMA_VERSION)`, which re-runs all `CREATE TABLE IF NOT EXISTS` statements and jumps straight to recording the new version — there's no incremental "apply v2 changes, then v3 changes" step. Since `ALTER TABLE articles ADD COLUMN read_at` must run for pre-existing installs (`current === 1`) but must NOT run for fresh installs (`current === 0`, where the column already exists via the updated `CREATE_ARTICLES`), this task introduces the first granular version branch:

```typescript
const SCHEMA_VERSION = 2;
// ...
if (current < SCHEMA_VERSION) {
  await db.execAsync(CREATE_FEEDS);
  await db.execAsync(CREATE_ARTICLES);
  await db.execAsync(CREATE_SETTINGS);
  for (const sql of CREATE_INDEXES) await db.execAsync(sql);
  if (current === 1) {
    // Upgrading from v1: read_at doesn't exist yet on this table.
    await db.execAsync(`ALTER TABLE articles ADD COLUMN read_at DATETIME`);
    await db.execAsync(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
  }
  await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
}
```

Fresh installs (`current === 0`) skip the `ALTER TABLE`/backfill entirely since `CREATE_ARTICLES` already created `read_at`. Upgrading installs (`current === 1`) get the column added and existing read articles backfilled with `read_at = datetime('now')` — starting their retention clock at migration time, not deleted immediately, not grandfathered in forever.

### Marking read/unread (`mobile/src/db/queries.ts`)

Every function that sets `read = 1` also sets `read_at`, without resetting it if already set:

- `markRead(db, id)`: `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE id = ?`
- `markAllRead(db, feedId)`: `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE feed_id = ?`
- `markAllUnreadRead(db)`: `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE read = 0`
- `markAllTodayRead(db)`: `UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE read = 0 AND date(published_at) = date('now')`

`markUnread(db, id)` clears the timestamp: `UPDATE articles SET read = 0, read_at = NULL WHERE id = ?` — taking the article out of the deletion pipeline until it's read again.

### Settings access (`mobile/src/db/queries.ts`)

Two small helpers:
- `getSetting(db, key): Promise<string | null>` — `SELECT value FROM settings WHERE key = ?`.
- `setSetting(db, key, value): Promise<void>` — `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`.

### Deletion (`mobile/src/db/queries.ts`)

```sql
DELETE FROM articles
WHERE read = 1 AND starred = 0
  AND read_at IS NOT NULL
  AND read_at <= datetime('now', '-' || ? || ' days')
```
Exposed as `deleteExpiredReadArticles(db, retentionDays: number): Promise<void>`. Starred articles are always exempt, regardless of age.

### Trigger (`mobile/app/_layout.tsx`)

Runs once per app launch, immediately after the existing DB init/migration step and before the UI mounts:
```
const retentionDays = Number(await getSetting(db, 'retention_days') ?? '90');
await deleteExpiredReadArticles(db, retentionDays);
```
Not run on manual refresh — only at launch.

### Settings UI (`mobile/app/settings.tsx`)

A new row (in a new "Reading" section, above "About"):
- Title: "Delete read articles after"
- Subtitle: current value, e.g. "90 days"
- On tap: `Alert.alert` action sheet with "30 days", "90 days", "Cancel". Selecting a value calls `setSetting(db, 'retention_days', '30' | '90')` and updates local component state so the subtitle reflects the new value immediately (no need to reload the screen).

## Out of scope

- No user-facing "delete now" button — deletion only happens automatically at launch.
- No UI showing how many articles will be/were deleted.
- No retention options beyond 30 and 90 days.
- No deletion triggered by manual refresh.

## Files touched

- `shared/schema.ts` (or wherever `CREATE_ARTICLES`/schema constants live) — new column, new table
- `mobile/src/db/database.ts` — migration bump to version 2, backfill step
- `mobile/src/db/queries.ts` — updated mark-read functions, new settings helpers, new deletion function
- `mobile/app/_layout.tsx` — call deletion at launch
- `mobile/app/settings.tsx` — new Settings row + action sheet
