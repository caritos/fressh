import * as SQLite from 'expo-sqlite';
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SETTINGS } from './schema';

const SCHEMA_VERSION = 2;

let _db: SQLite.SQLiteDatabase | null = null;
let _lastPath: string | undefined;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export async function initDb(absolutePath?: string): Promise<void> {
  if (_db) return;
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
    await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90')`);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
}
