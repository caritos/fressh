# Auto-Delete Read Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically delete read articles a configurable number of days (30 or 90, default 90) after they were marked read, exempting starred articles, with the retention window configurable in Settings.

**Architecture:** A schema migration (v1→v2) adds a `read_at` timestamp column to `articles` and a new `settings` key-value table. Every code path that marks an article read now stamps `read_at` (without resetting it if already set); marking unread clears it. A new `deleteExpiredReadArticles` query runs once per app launch, deleting read+unstarred articles whose `read_at` is older than the configured window. A new Settings row lets the user pick 30 or 90 days via a native action sheet.

**Tech Stack:** Expo Router, expo-sqlite, React Native. Tests: `bun test`, following the project's existing `bun:sqlite`-based direct-SQL test pattern in `mobile/test/queries.test.ts` (this project's `getArticles`/mark-read functions take a live `expo-sqlite` `SQLiteDatabase`, which isn't available under the Bun test runner — so, consistent with every existing test in that file, tests validate the exact SQL strings this plan specifies, not the exported functions directly).

## Global Constraints

- Retention options are exactly 30 or 90 days; default is 90.
- Starred articles (`starred = 1`) are always exempt from auto-deletion, regardless of age.
- `read_at` is set via `COALESCE(read_at, datetime('now'))` on every "mark read" path — never reset if already set. `markUnread` clears it back to `NULL`.
- Deletion runs exactly once per app launch, in `mobile/app/_layout.tsx`'s init flow — not on manual refresh.
- `shared/schema.ts` (root) and `mobile/shared/schema.ts` are two manually-synced copies of the same file (per commit `833158f`, "copy shared/ into mobile for EAS archive" — Metro/EAS can't resolve paths outside the `mobile/` project root). Every schema edit must be applied identically to both files.
- Fresh installs (`current === 0`) get `read_at` for free via the updated `CREATE_ARTICLES`; the `ALTER TABLE`/backfill only runs for installs upgrading from schema version 1 (gated on `current === 1`, not the blanket `current < SCHEMA_VERSION` check that the existing migration code uses today).

---

### Task 1: Schema migration — `read_at` column, `settings` table

**Files:**
- Modify: `shared/schema.ts`
- Modify: `mobile/shared/schema.ts` (identical copy — see Global Constraints)
- Modify: `mobile/src/db/schema.ts:1`
- Modify: `mobile/src/db/database.ts`
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Produces: `CREATE_SETTINGS` (new SQL constant, exported from `shared/schema.ts` and re-exported from `mobile/src/db/schema.ts`), a `settings` table (`key TEXT PRIMARY KEY, value TEXT`), and an `articles.read_at DATETIME` column. Task 2 reads/writes this column and table directly via raw SQL in `queries.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `mobile/test/queries.test.ts`, after the existing `ARTICLES_ALL` test (end of file):

```typescript
test('CREATE_ARTICLES: read_at column defaults to NULL', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const row = db.query(`SELECT read_at FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.read_at).toBeNull();
});

test('migration backfill: sets read_at for pre-existing read articles with NULL read_at', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'already-read', 1);
  insertArticle(feedId, 'still-unread', 0);
  db.exec(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
  const read = db.query(`SELECT read_at FROM articles WHERE guid = 'already-read'`).get() as any;
  const unread = db.query(`SELECT read_at FROM articles WHERE guid = 'still-unread'`).get() as any;
  expect(read.read_at).not.toBeNull();
  expect(unread.read_at).toBeNull();
});

test('migration backfill: does not overwrite an existing read_at', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 1);
  db.exec(`UPDATE articles SET read_at = '2020-01-01 00:00:00' WHERE guid = 'a1'`);
  db.exec(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
  const row = db.query(`SELECT read_at FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.read_at).toBe('2020-01-01 00:00:00');
});

test('settings table: default retention_days seeds once and is idempotent', () => {
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  const row = db.query(`SELECT value FROM settings WHERE key = 'retention_days'`).get() as any;
  expect(row.value).toBe('90');
});

test('settings table: seeding on a later launch does not override a user-changed value', () => {
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  db.exec(`UPDATE settings SET value = '30' WHERE key = 'retention_days'`);
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  const row = db.query(`SELECT value FROM settings WHERE key = 'retention_days'`).get() as any;
  expect(row.value).toBe('30');
});
```

Also update the test file's `setup()` function (near the top) to create the new table. Change:

```typescript
import { CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SCHEMA_VERSION } from '../src/db/schema';
```

to:

```typescript
import { CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SCHEMA_VERSION, CREATE_SETTINGS } from '../src/db/schema';
```

and change:

```typescript
function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_SCHEMA_VERSION);
  db.exec(CREATE_FEEDS);
  db.exec(CREATE_ARTICLES);
  for (const idx of CREATE_INDEXES) db.exec(idx);
}
```

to:

```typescript
function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_SCHEMA_VERSION);
  db.exec(CREATE_FEEDS);
  db.exec(CREATE_ARTICLES);
  db.exec(CREATE_SETTINGS);
  for (const idx of CREATE_INDEXES) db.exec(idx);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && bun test test/queries.test.ts -t "read_at|settings table|migration backfill"`
Expected: FAIL — `CREATE_SETTINGS` does not exist yet (import error) and `articles.read_at` column doesn't exist yet. If this sandbox hits the known pre-existing `EMFILE`/module-resolution error instead (confirmed to reproduce on a clean checkout with none of this branch's changes — see prior sessions), note that in your report rather than treating it as caused by this change; in that case, verify the failure by temporarily reverting Step 3's changes after writing them, confirming the import/column errors, then reapplying Step 3.

- [ ] **Step 3: Add `read_at` and `CREATE_SETTINGS` to the schema, update the migration**

In `shared/schema.ts`, change `CREATE_ARTICLES` from:

```typescript
export const CREATE_ARTICLES = `
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    guid TEXT NOT NULL,
    title TEXT,
    url TEXT,
    author TEXT,
    content_html TEXT,
    content_text TEXT,
    summary TEXT,
    published_at DATETIME,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
    UNIQUE(feed_id, guid)
  )
`;
```

to:

```typescript
export const CREATE_ARTICLES = `
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    guid TEXT NOT NULL,
    title TEXT,
    url TEXT,
    author TEXT,
    content_html TEXT,
    content_text TEXT,
    summary TEXT,
    published_at DATETIME,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0,
    read_at DATETIME,
    starred INTEGER DEFAULT 0,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
    UNIQUE(feed_id, guid)
  )
`;
```

Then add a new export, after `CREATE_INDEXES`:

```typescript
export const CREATE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`;
```

Apply the exact same two changes to `mobile/shared/schema.ts` (byte-identical copy).

In `mobile/src/db/schema.ts`, change:

```typescript
export { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES } from '../../shared/schema';
```

to:

```typescript
export { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SETTINGS } from '../../shared/schema';
```

In `mobile/src/db/database.ts`, change:

```typescript
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES } from './schema';

const SCHEMA_VERSION = 1;
```

to:

```typescript
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SETTINGS } from './schema';

const SCHEMA_VERSION = 2;
```

And change `_migrate` from:

```typescript
async function _migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_SCHEMA_VERSION);
  const row = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`
  );
  const current = row?.version ?? 0;
  if (current < SCHEMA_VERSION) {
    await db.execAsync(CREATE_FEEDS);
    await db.execAsync(CREATE_ARTICLES);
    for (const sql of CREATE_INDEXES) await db.execAsync(sql);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
}
```

to:

```typescript
async function _migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_SCHEMA_VERSION);
  const row = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`
  );
  const current = row?.version ?? 0;
  if (current < SCHEMA_VERSION) {
    await db.execAsync(CREATE_FEEDS);
    await db.execAsync(CREATE_ARTICLES);
    await db.execAsync(CREATE_SETTINGS);
    for (const sql of CREATE_INDEXES) await db.execAsync(sql);
    if (current === 1) {
      // Upgrading from v1: read_at doesn't exist on this table yet.
      // Fresh installs (current === 0) already have it via CREATE_ARTICLES above.
      await db.execAsync(`ALTER TABLE articles ADD COLUMN read_at DATETIME`);
      await db.execAsync(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
    }
    await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && bun test test/queries.test.ts`
Expected: All tests pass, including the 5 new ones and every pre-existing test in the file (confirm nothing regressed). If the sandbox's pre-existing `EMFILE` issue blocks execution, note it in your report (see Step 2) rather than treating it as caused by this change.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts mobile/shared/schema.ts mobile/src/db/schema.ts mobile/src/db/database.ts mobile/test/queries.test.ts
git commit -m "feat: add read_at column and settings table for auto-delete"
```

---

### Task 2: `queries.ts` — read_at stamping, settings helpers, deletion query

**Files:**
- Modify: `mobile/src/db/queries.ts:17-33` (interface), `:162-180` (mark-read functions), end of file (new exports)
- Test: `mobile/test/queries.test.ts`

**Interfaces:**
- Consumes: `articles.read_at` column and `settings` table from Task 1.
- Produces:
  - `ArticleRow.read_at: string | null` (new field on the existing interface)
  - `getSetting(db: SQLiteDatabase, key: string): Promise<string | null>`
  - `setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void>`
  - `deleteExpiredReadArticles(db: SQLiteDatabase, retentionDays: number): Promise<void>`
  
  Task 3 calls `getSetting` and `deleteExpiredReadArticles`. Task 4 calls `getSetting` and `setSetting`.

- [ ] **Step 1: Write the failing tests**

Add to `mobile/test/queries.test.ts`:

```typescript
test('markRead: sets read_at when marking read', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE id = ${id}`);
  const row = db.query(`SELECT read, read_at FROM articles WHERE id = ${id}`).get() as any;
  expect(row.read).toBe(1);
  expect(row.read_at).not.toBeNull();
});

test('markRead: does not reset read_at if already read', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 1);
  db.exec(`UPDATE articles SET read_at = '2020-01-01 00:00:00' WHERE guid = 'a1'`);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE id = ${id}`);
  const row = db.query(`SELECT read_at FROM articles WHERE id = ${id}`).get() as any;
  expect(row.read_at).toBe('2020-01-01 00:00:00');
});

test('markUnread: clears read_at', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 1);
  db.exec(`UPDATE articles SET read_at = datetime('now') WHERE guid = 'a1'`);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET read = 0, read_at = NULL WHERE id = ${id}`);
  const row = db.query(`SELECT read, read_at FROM articles WHERE id = ${id}`).get() as any;
  expect(row.read).toBe(0);
  expect(row.read_at).toBeNull();
});

test('deleteExpiredReadArticles SQL: deletes old read articles, keeps starred/recent/unread', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, starred, read_at, published_at)
           VALUES (${feedId}, 'old-read', 'Old', 'https://o.com', 1, 0, datetime('now', '-100 days'), datetime('now', '-100 days'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, starred, read_at, published_at)
           VALUES (${feedId}, 'old-starred', 'Old Starred', 'https://s.com', 1, 1, datetime('now', '-100 days'), datetime('now', '-100 days'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, starred, read_at, published_at)
           VALUES (${feedId}, 'recent-read', 'Recent', 'https://r.com', 1, 0, datetime('now', '-5 days'), datetime('now', '-5 days'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, starred, published_at)
           VALUES (${feedId}, 'old-unread', 'Unread', 'https://u.com', 0, 0, datetime('now', '-100 days'))`);

  db.exec(`DELETE FROM articles WHERE read = 1 AND starred = 0 AND read_at IS NOT NULL AND read_at <= datetime('now', '-' || 90 || ' days')`);

  const remaining = (db.query(`SELECT guid FROM articles ORDER BY guid`).all() as any[]).map((r) => r.guid);
  expect(remaining.sort()).toEqual(['old-starred', 'old-unread', 'recent-read']);
});

test('getSetting/setSetting SQL: round-trips a value', () => {
  db.exec(`INSERT INTO settings (key, value) VALUES ('retention_days', '90')`);
  db.exec(`INSERT INTO settings (key, value) VALUES ('retention_days', '30')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const row = db.query(`SELECT value FROM settings WHERE key = 'retention_days'`).get() as any;
  expect(row.value).toBe('30');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && bun test test/queries.test.ts -t "markRead|markUnread|deleteExpiredReadArticles|getSetting"`
Expected: The new tests validate raw SQL directly (matching this file's existing convention), so they should already pass once Task 1's schema exists — there's no separate "red" step tied to an unwritten function here. Instead, confirm meaningfully by temporarily changing one assertion (e.g. swap `expect(row.read_at).not.toBeNull()` to `expect(row.read_at).toBeNull()` in the first new test) and confirming it fails, then revert.

- [ ] **Step 3: Update `queries.ts`**

Change the `ArticleRow` interface (currently lines 17-33) from:

```typescript
export interface ArticleRow {
  id: number;
  feed_id: number;
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  content_html: string | null;
  content_text: string | null;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  read: number;
  starred: number;
  feed_title: string | null;
  feed_site_url: string | null;
}
```

to:

```typescript
export interface ArticleRow {
  id: number;
  feed_id: number;
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  content_html: string | null;
  content_text: string | null;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  read: number;
  read_at: string | null;
  starred: number;
  feed_title: string | null;
  feed_site_url: string | null;
}
```

Change the mark-read functions (currently lines 162-180) from:

```typescript
export async function markRead(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE id = ?`, [id]);
}

export async function markUnread(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 0 WHERE id = ?`, [id]);
}

export async function markAllRead(db: SQLiteDatabase, feedId: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE feed_id = ?`, [feedId]);
}

export async function markAllUnreadRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE read = 0`);
}

export async function markAllTodayRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE read = 0 AND date(published_at) = date('now')`);
}
```

to:

```typescript
export async function markRead(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE id = ?`, [id]);
}

export async function markUnread(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 0, read_at = NULL WHERE id = ?`, [id]);
}

export async function markAllRead(db: SQLiteDatabase, feedId: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE feed_id = ?`, [feedId]);
}

export async function markAllUnreadRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE read = 0`);
}

export async function markAllTodayRead(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE read = 0 AND date(published_at) = date('now')`);
}
```

Add these new exports at the end of the file (after `getTotalUnreadCount`):

```typescript
export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function deleteExpiredReadArticles(db: SQLiteDatabase, retentionDays: number): Promise<void> {
  await db.runAsync(
    `DELETE FROM articles WHERE read = 1 AND starred = 0 AND read_at IS NOT NULL AND read_at <= datetime('now', '-' || ? || ' days')`,
    [retentionDays]
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && bun test test/queries.test.ts`
Expected: All tests pass (or note the pre-existing sandbox `EMFILE` issue per Task 1 Step 2/4 if it blocks execution).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/db/queries.ts mobile/test/queries.test.ts
git commit -m "feat: stamp read_at on mark-read, add settings and deletion helpers"
```

---

### Task 3: Wire deletion into app launch

**Files:**
- Modify: `mobile/app/_layout.tsx:12-43`

**Interfaces:**
- Consumes: `getSetting(db, 'retention_days')` and `deleteExpiredReadArticles(db, retentionDays)` from Task 2.

- [ ] **Step 1: Add the deletion call to `startApp`**

In `mobile/app/_layout.tsx`, change the import (currently line 12) from:

```typescript
import { initDb, getDb } from '../src/db/database';
```

keep as-is (no change needed — `getDb` is already imported), and change the import on line 15 from:

```typescript
import { refresh } from '../src/fetcher/refresh';
```

to add a new import line right after it:

```typescript
import { refresh } from '../src/fetcher/refresh';
import { getSetting, deleteExpiredReadArticles } from '../src/db/queries';
```

Then change `startApp` (currently lines 37-43) from:

```typescript
  const startApp = useCallback(async (dbPath: string) => {
    await initDb(dbPath);
    await registerBackgroundFetch();
    lastFetchAt.current = Date.now();
    refresh().catch(console.error);
    setAppPhase('ready');
  }, []);
```

to:

```typescript
  const startApp = useCallback(async (dbPath: string) => {
    await initDb(dbPath);
    const db = getDb();
    const retentionDays = Number((await getSetting(db, 'retention_days')) ?? '90');
    await deleteExpiredReadArticles(db, retentionDays);
    await registerBackgroundFetch();
    lastFetchAt.current = Date.now();
    refresh().catch(console.error);
    setAppPhase('ready');
  }, []);
```

- [ ] **Step 2: Manually verify in the running app**

This project has no automated UI/integration test harness, and `_layout.tsx`'s init flow isn't unit-testable in isolation (it depends on `expo-sqlite`, fonts, and splash screen). Verify by code inspection: confirm `getDb()` is called after `initDb(dbPath)` completes (so the database handle exists), confirm `getSetting`/`deleteExpiredReadArticles` are awaited before `setAppPhase('ready')` (so deletion completes before the UI renders any article list), and confirm no existing behavior (`registerBackgroundFetch`, `refresh()`, splash screen hide) was reordered or removed.

If you have a running simulator available, reload the app and confirm it still launches normally (no crash, no infinite splash screen) — but do not fabricate simulator output if you don't have one available; report code-inspection verification instead.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/_layout.tsx
git commit -m "feat: run auto-delete of expired read articles at app launch"
```

---

### Task 4: Settings UI — retention picker

**Files:**
- Modify: `mobile/app/settings.tsx`

**Interfaces:**
- Consumes: `getSetting(db, 'retention_days')` and `setSetting(db, 'retention_days', value)` from Task 2.

- [ ] **Step 1: Add state, load, and save logic**

In `mobile/app/settings.tsx`, change the import (currently line 20) from:

```typescript
import { getFeeds, upsertFeed, getFeedByUrl } from '../src/db/queries';
```

to:

```typescript
import { getFeeds, upsertFeed, getFeedByUrl, getSetting, setSetting } from '../src/db/queries';
```

Change the top of `SettingsScreen` (currently lines 40-54) from:

```typescript
export default function SettingsScreen() {
  const [exporting, setExporting] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
```

to:

```typescript
export default function SettingsScreen() {
  const [exporting, setExporting] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [retentionDays, setRetentionDays] = useState(90);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = getDb();
        const value = await getSetting(db, 'retention_days');
        setRetentionDays(Number(value ?? '90'));
      } catch (e) {
        console.error('Settings load error:', e);
      }
    })();
  }, []);

  const onChangeRetention = () => {
    Alert.alert('Delete read articles after', undefined, [
      { text: '30 days', onPress: () => saveRetention(30) },
      { text: '90 days', onPress: () => saveRetention(90) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveRetention = async (days: number) => {
    try {
      const db = getDb();
      await setSetting(db, 'retention_days', String(days));
      setRetentionDays(days);
    } catch {
      Alert.alert('Error', 'Failed to save setting.');
    }
  };
```

- [ ] **Step 2: Add the Settings row**

Change (currently lines 137-139):

```typescript
      </View>

      <Text style={styles.sectionLabel}>About</Text>
```

to:

```typescript
      </View>

      <Text style={styles.sectionLabel}>Reading</Text>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={onChangeRetention}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Delete read articles after</Text>
          </View>
          <Text style={styles.rowVersion}>{retentionDays} days</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>About</Text>
```

No new styles are needed — `rowVersion` (right-aligned mono text) and `chevron` already exist and are reused as-is from the existing "Fressh"/"Support" rows.

- [ ] **Step 3: Manually verify in the running app**

This project has no automated UI component test harness. Verify by code inspection: confirm the new `useEffect` calls `getDb()` only after the screen mounts (the database is already initialized by the time `_layout.tsx` renders any screen, so this is safe), confirm `onChangeRetention`'s `Alert.alert` options exactly match "30 days" / "90 days" / "Cancel" per the design, and confirm `saveRetention` updates local state immediately after `setSetting` resolves (so the row's subtitle reflects the new value without needing to leave and re-enter the screen).

If you have a running simulator, navigate to Settings, confirm the new "Reading" section appears between "Subscriptions" and "About" showing "Delete read articles after — 90 days", tap it, select "30 days", and confirm the row updates to "30 days" without restarting the app.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/settings.tsx
git commit -m "feat: add retention picker to Settings"
```

---

## Self-Review Notes

- **Spec coverage:** All five spec sections (schema migration, marking read/unread, settings access, deletion, trigger, settings UI) map to Tasks 1-4 above. No gaps. The spec's "Out of scope" items (no manual delete-now button, no deletion count UI, no options beyond 30/90, no refresh-triggered deletion) are respected — none of the four tasks introduce them.
- **Placeholder scan:** No TBDs; every step shows exact code, exact file paths, and exact manual-verification actions (given this project's lack of a UI test harness, consistent with how the previous "All smart feed" plan handled the same gap).
- **Type consistency:** `getSetting`/`setSetting`/`deleteExpiredReadArticles` signatures are defined once in Task 2 and referenced identically (same names, same parameter order) in Tasks 3 and 4. `ArticleRow.read_at: string | null` is added in Task 2 and not redefined elsewhere.
