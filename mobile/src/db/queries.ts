import type { SQLiteDatabase } from 'expo-sqlite';

export interface FeedRow {
  id: number;
  url: string;
  title: string | null;
  site_url: string | null;
  last_fetch: string | null;
  last_modified: string | null;
  etag: string | null;
  fetch_interval: number;
  enabled: number;
  created_at: string;
  unread_count: number;
}

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
}

const FEEDS_WITH_UNREAD = `
  SELECT f.*, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
  FROM feeds f
  LEFT JOIN articles a ON a.feed_id = f.id
  WHERE f.enabled = 1
  GROUP BY f.id
  ORDER BY f.title ASC
`;

const ARTICLES_BY_FEED = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.feed_id = ?
  ORDER BY a.published_at DESC
`;

const ARTICLES_UNREAD = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.read = 0
  ORDER BY a.published_at DESC
`;

const ARTICLES_STARRED = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.starred = 1
  ORDER BY a.published_at DESC
`;

const ARTICLES_TODAY = `
  SELECT a.*, f.title as feed_title
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE date(a.published_at) = date('now')
  ORDER BY a.published_at DESC
`;

export async function getFeeds(db: SQLiteDatabase): Promise<FeedRow[]> {
  return db.getAllAsync<FeedRow>(FEEDS_WITH_UNREAD);
}

export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | 'unread' | 'starred' | 'today'
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}

export async function getArticle(db: SQLiteDatabase, id: number): Promise<ArticleRow | null> {
  return db.getFirstAsync<ArticleRow>(
    `SELECT a.*, f.title as feed_title FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE a.id = ?`,
    [id]
  );
}

export async function upsertFeed(
  db: SQLiteDatabase,
  feed: { url: string; title?: string | null; site_url?: string | null }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO feeds (url, title, site_url) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, site_url = excluded.site_url`,
    [feed.url, feed.title ?? null, feed.site_url ?? null]
  );
}

export async function getFeedByUrl(db: SQLiteDatabase, url: string): Promise<FeedRow | null> {
  return db.getFirstAsync<FeedRow>(
    `SELECT f.*, 0 as unread_count FROM feeds f WHERE f.url = ?`,
    [url]
  );
}

export async function insertArticles(
  db: SQLiteDatabase,
  feedId: number,
  articles: Array<{
    guid: string;
    title: string | null;
    url: string | null;
    author: string | null;
    content_html: string | null;
    content_text: string | null;
    summary: string | null;
    published_at: string | null;
  }>
): Promise<number> {
  let inserted = 0;
  for (const a of articles) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO articles
         (feed_id, guid, title, url, author, content_html, content_text, summary, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [feedId, a.guid, a.title, a.url, a.author, a.content_html, a.content_text, a.summary, a.published_at]
    );
    inserted += result.changes;
  }
  return inserted;
}

export async function updateFeedFetchMeta(
  db: SQLiteDatabase,
  feedId: number,
  lastModified: string | null,
  etag: string | null
): Promise<void> {
  await db.runAsync(
    `UPDATE feeds SET last_modified = ?, etag = ?, last_fetch = datetime('now') WHERE id = ?`,
    [lastModified, etag, feedId]
  );
}

export async function markRead(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE id = ?`, [id]);
}

export async function markUnread(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 0 WHERE id = ?`, [id]);
}

export async function markAllRead(db: SQLiteDatabase, feedId: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET read = 1 WHERE feed_id = ?`, [feedId]);
}

export async function toggleStar(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`UPDATE articles SET starred = 1 - starred WHERE id = ?`, [id]);
}

export async function deleteFeed(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM feeds WHERE id = ?`, [id]);
}

export async function getTotalUnreadCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM articles WHERE read = 0`
  );
  return row?.count ?? 0;
}
