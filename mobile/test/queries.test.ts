import { Database } from 'bun:sqlite';
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES, CREATE_SCHEMA_VERSION } from '../src/db/schema';

// Synchronous bun:sqlite wrapper to validate the same SQL used in queries.ts
let db: Database;

function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_SCHEMA_VERSION);
  db.exec(CREATE_FEEDS);
  db.exec(CREATE_ARTICLES);
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
