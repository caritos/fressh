import { Database } from 'bun:sqlite';
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SCHEMA_VERSION, CREATE_SETTINGS } from '../src/db/schema';
import { getArticlesByIds, type ArticleRow } from '../src/db/queries';

// Synchronous bun:sqlite wrapper to validate the same SQL used in queries.ts
let db: Database;

function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_SCHEMA_VERSION);
  db.exec(CREATE_FEEDS);
  db.exec(CREATE_ARTICLES);
  db.exec(CREATE_SETTINGS);
  for (const idx of CREATE_INDEXES) db.exec(idx);
}

function teardown() {
  db.close();
}

function insertFeed(url: string, title: string): number {
  db.exec(`INSERT INTO feeds (url, title) VALUES ('${url}', '${title}')`);
  return (db.query(`SELECT id FROM feeds WHERE url = '${url}'`).get() as any).id;
}

function insertArticle(feedId: number, guid: string, read = 0, starred = 0) {
  db.exec(
    `INSERT INTO articles (feed_id, guid, title, url, read, starred, published_at)
     VALUES (${feedId}, '${guid}', 'Title ${guid}', 'https://example.com/${guid}', ${read}, ${starred}, datetime('now'))`
  );
}

beforeEach(setup);
afterEach(teardown);

test('feeds table: upsert inserts new feed', () => {
  db.exec(`INSERT INTO feeds (url, title, site_url) VALUES ('https://example.com/feed', 'Example', 'https://example.com')
           ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`);
  const row = db.query(`SELECT * FROM feeds WHERE url = 'https://example.com/feed'`).get() as any;
  expect(row.title).toBe('Example');
  expect(row.enabled).toBe(1);
});

test('feeds table: upsert updates existing feed title', () => {
  db.exec(`INSERT INTO feeds (url, title) VALUES ('https://example.com/feed', 'Old Title')`);
  db.exec(`INSERT INTO feeds (url, title) VALUES ('https://example.com/feed', 'New Title')
           ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`);
  const row = db.query(`SELECT title FROM feeds WHERE url = 'https://example.com/feed'`).get() as any;
  expect(row.title).toBe('New Title');
});

test('articles table: INSERT OR IGNORE skips duplicates', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'A', 'https://a.com')`);
  db.exec(`INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'B', 'https://b.com')`);
  const rows = db.query(`SELECT * FROM articles WHERE feed_id = ${feedId}`).all();
  expect(rows).toHaveLength(1);
});

test('FEEDS_WITH_UNREAD: counts only unread articles', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0); // unread
  insertArticle(feedId, 'a2', 0); // unread
  insertArticle(feedId, 'a3', 1); // read
  const rows = db.query(
    `SELECT f.*, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
     FROM feeds f LEFT JOIN articles a ON a.feed_id = f.id
     WHERE f.enabled = 1 GROUP BY f.id ORDER BY f.title ASC`
  ).all() as any[];
  expect(rows[0].unread_count).toBe(2);
});

test('markRead: sets read = 1', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET read = 1 WHERE id = ${id}`);
  const row = db.query(`SELECT read FROM articles WHERE id = ${id}`).get() as any;
  expect(row.read).toBe(1);
});

test('markAllRead: marks all articles in feed as read', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  insertArticle(feedId, 'a2', 0);
  db.exec(`UPDATE articles SET read = 1 WHERE feed_id = ${feedId}`);
  const rows = db.query(`SELECT read FROM articles WHERE feed_id = ${feedId}`).all() as any[];
  expect(rows.every((r) => r.read === 1)).toBe(true);
});

test('toggleStar: flips starred flag', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0, 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;
  db.exec(`UPDATE articles SET starred = 1 - starred WHERE id = ${id}`);
  const after = db.query(`SELECT starred FROM articles WHERE id = ${id}`).get() as any;
  expect(after.starred).toBe(1);
  db.exec(`UPDATE articles SET starred = 1 - starred WHERE id = ${id}`);
  const after2 = db.query(`SELECT starred FROM articles WHERE id = ${id}`).get() as any;
  expect(after2.starred).toBe(0);
});

test('deleteFeed: cascades to articles', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1');
  db.exec(`DELETE FROM feeds WHERE id = ${feedId}`);
  const articles = db.query(`SELECT * FROM articles WHERE feed_id = ${feedId}`).all();
  expect(articles).toHaveLength(0);
});

test('getTotalUnreadCount: counts all unread across feeds', () => {
  const f1 = insertFeed('https://f1.com', 'F1');
  const f2 = insertFeed('https://f2.com', 'F2');
  insertArticle(f1, 'a1', 0);
  insertArticle(f1, 'a2', 1);
  insertArticle(f2, 'b1', 0);
  const row = db.query(`SELECT COUNT(*) as count FROM articles WHERE read = 0`).get() as any;
  expect(row.count).toBe(2);
});

test('ARTICLES_TODAY: only returns articles with today date', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'today', 'Today', 'https://t.com', datetime('now'))`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, published_at)
           VALUES (${feedId}, 'old', 'Old', 'https://o.com', '2020-01-01 00:00:00')`);
  const rows = db.query(
    `SELECT * FROM articles WHERE date(published_at) = date('now')`
  ).all();
  expect(rows).toHaveLength(1);
  expect((rows[0] as any).guid).toBe('today');
});

test('ARTICLES_ALL: returns every article regardless of read state, newest first', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, published_at)
           VALUES (${feedId}, 'old-read', 'Old Read', 'https://o.com', 1, '2020-01-01 00:00:00')`);
  db.exec(`INSERT INTO articles (feed_id, guid, title, url, read, published_at)
           VALUES (${feedId}, 'new-unread', 'New Unread', 'https://n.com', 0, '2025-06-01 00:00:00')`);
  const rows = db.query(
    `SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
     FROM articles a JOIN feeds f ON a.feed_id = f.id
     ORDER BY a.published_at DESC`
  ).all() as any[];
  expect(rows).toHaveLength(2);
  expect(rows[0].guid).toBe('new-unread');
  expect(rows[1].guid).toBe('old-read');
});

test('CREATE_ARTICLES: read_at column defaults to NULL', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const row = db.query(`SELECT read_at FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.read_at).toBeNull();
});

test('CREATE_ARTICLES: video_width and video_height default to NULL', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const row = db.query(`SELECT video_width, video_height FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.video_width).toBeNull();
  expect(row.video_height).toBeNull();
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

test('migration: ALTER TABLE adds video_width/video_height to a pre-existing v2 table', () => {
  // Simulate a v2 install: articles table without the new columns.
  db.exec('DROP TABLE articles');
  db.exec(`
    CREATE TABLE articles (
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
      UNIQUE(feed_id, guid)
    )
  `);
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);

  db.exec(`ALTER TABLE articles ADD COLUMN video_width INTEGER`);
  db.exec(`ALTER TABLE articles ADD COLUMN video_height INTEGER`);

  const row = db.query(`SELECT video_width, video_height FROM articles WHERE guid = 'a1'`).get() as any;
  expect(row.video_width).toBeNull();
  expect(row.video_height).toBeNull();
});

test('updateArticleVideoDimensions SQL: sets video_width and video_height', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');
  insertArticle(feedId, 'a1', 0);
  const id = (db.query(`SELECT id FROM articles WHERE guid = 'a1'`).get() as any).id;

  db.exec(`UPDATE articles SET video_width = 113, video_height = 200 WHERE id = ${id}`);

  const row = db.query(`SELECT video_width, video_height FROM articles WHERE id = ${id}`).get() as any;
  expect(row.video_width).toBe(113);
  expect(row.video_height).toBe(200);
});

test('insertArticles SQL: INSERT OR IGNORE reports which rows actually inserted', () => {
  const feedId = insertFeed('https://f.com/feed', 'Feed');

  const first = db.run(
    `INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'A', 'https://a.com')`
  );
  const second = db.run(
    `INSERT OR IGNORE INTO articles (feed_id, guid, title, url) VALUES (${feedId}, 'g1', 'B', 'https://b.com')`
  );

  expect(first.changes).toBe(1);
  expect(second.changes).toBe(0);
});

function fakeArticle(id: number, read: number): ArticleRow {
  return {
    id, feed_id: 1, guid: `g${id}`, title: `Title ${id}`, url: null, author: null,
    content_html: null, content_text: null, summary: null, published_at: null,
    fetched_at: '', read, read_at: null, starred: 0, video_width: null, video_height: null,
    feed_title: 'Feed', feed_site_url: null,
  };
}

test('getArticlesByIds: returns rows in the requested id order, not query order', async () => {
  const rows = [fakeArticle(1, 0), fakeArticle(2, 1), fakeArticle(3, 0)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [3, 1, 2]);
  expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
});

test('getArticlesByIds: silently omits ids not present in the result set', async () => {
  const rows = [fakeArticle(1, 0)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [1, 999]);
  expect(result.map((r) => r.id)).toEqual([1]);
});

test('getArticlesByIds: empty ids array returns empty array without querying', async () => {
  let called = false;
  const fakeDb = { getAllAsync: async () => { called = true; return []; } } as any;
  const result = await getArticlesByIds(fakeDb, []);
  expect(result).toEqual([]);
  expect(called).toBe(false);
});

test('getArticlesByIds: reflects live read state from the query result', async () => {
  const rows = [fakeArticle(5, 1)];
  const fakeDb = { getAllAsync: async () => rows } as any;
  const result = await getArticlesByIds(fakeDb, [5]);
  expect(result[0].read).toBe(1);
});
