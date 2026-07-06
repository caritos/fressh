import * as SQLite from 'expo-sqlite';
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SETTINGS } from './schema';

const SCHEMA_VERSION = 3;

let _db: SQLite.SQLiteDatabase | null = null;
let _lastPath: string | undefined;
let _initPromise: Promise<void> | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export async function initDb(absolutePath?: string): Promise<void> {
  // Memoize the in-flight promise, not just the `_db` handle: `_db` is
  // assigned before `_migrate()` finishes, so a concurrent caller checking
  // only `_db` can race ahead and query tables the migration hasn't
  // created yet. Awaiting the same promise closes that window.
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      _lastPath = absolutePath;
      if (absolutePath) {
        const lastSlash = absolutePath.lastIndexOf('/');
        const directory = absolutePath.slice(0, lastSlash);
        const filename = absolutePath.slice(lastSlash + 1);
        _db = await SQLite.openDatabaseAsync(filename, {}, directory);
      } else {
        _db = await SQLite.openDatabaseAsync('fressh.db');
      }
      await _db.execAsync('PRAGMA journal_mode = WAL;');
      await _db.execAsync('PRAGMA foreign_keys = ON;');
      await _migrate(_db);
    } catch (e) {
      // Let a failed init be retried from scratch instead of permanently
      // caching a rejected promise.
      _db = null;
      _initPromise = null;
      throw e;
    }
  })();
  return _initPromise;
}

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
    if (current > 0 && current < 3) {
      // Upgrading from v1 or v2: video_width/video_height don't exist yet.
      // Fresh installs (current === 0) already have them via CREATE_ARTICLES above.
      await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
      await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
    }
    await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
  // Self-heal: a schema_version row can outpace what was actually applied if
  // a past run's migration was ever interrupted after bumping the version
  // (e.g. iOS carries a container's Documents contents across a reinstall,
  // so a corrupted version marker persists indefinitely otherwise). Verify
  // the objects this version claims to have created actually exist, rather
  // than trusting the counter alone.
  await db.execAsync(CREATE_SETTINGS);
  await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(articles)`);
  if (!columns.some((c) => c.name === 'read_at')) {
    await db.execAsync(`ALTER TABLE articles ADD COLUMN read_at DATETIME`);
    await db.execAsync(`UPDATE articles SET read_at = datetime('now') WHERE read = 1 AND read_at IS NULL`);
  }
  if (!columns.some((c) => c.name === 'video_width')) {
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
    await db.execAsync(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);
  }
}
