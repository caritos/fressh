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
  read_at: string | null;
  starred: number;
  video_width: number | null;
  video_height: number | null;
  feed_title: string | null;
  feed_site_url: string | null;
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
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.feed_id = ?
  ORDER BY a.published_at DESC
`;

const ARTICLES_UNREAD = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.read = 0
  ORDER BY a.published_at DESC
`;

const ARTICLES_STARRED = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.starred = 1
  ORDER BY a.published_at DESC
`;

const ARTICLES_TODAY = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE date(a.published_at) = date('now')
  ORDER BY a.published_at DESC
`;

const ARTICLES_ALL = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  ORDER BY a.published_at DESC
`;

// Broader match than getYouTubeVideoId (fetcher/youtube.ts) — this is a category
// filter, not a check for whether the reader can embed a player; intentional.
const ARTICLES_YOUTUBE = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.url LIKE '%youtube.com%' OR a.url LIKE '%youtu.be%'
  ORDER BY a.published_at DESC
`;

const ARTICLES_NON_YOUTUBE = `
  SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  WHERE a.url IS NULL OR (a.url NOT LIKE '%youtube.com%' AND a.url NOT LIKE '%youtu.be%')
  ORDER BY a.published_at DESC
`;

export type SmartFeedId = 'unread' | 'starred' | 'today' | 'all' | 'youtube' | 'nonyoutube';

const SMART_FEED_IDS: readonly SmartFeedId[] = ['unread', 'starred', 'today', 'all', 'youtube', 'nonyoutube'];

export function isSmartFeedId(id: string): id is SmartFeedId {
  return (SMART_FEED_IDS as readonly string[]).includes(id);
}

export async function getFeeds(db: SQLiteDatabase): Promise<FeedRow[]> {
  return db.getAllAsync<FeedRow>(FEEDS_WITH_UNREAD);
}

export async function getArticles(
  db: SQLiteDatabase,
  feedId: number | SmartFeedId
): Promise<ArticleRow[]> {
  if (feedId === 'unread') return db.getAllAsync<ArticleRow>(ARTICLES_UNREAD);
  if (feedId === 'starred') return db.getAllAsync<ArticleRow>(ARTICLES_STARRED);
  if (feedId === 'today') return db.getAllAsync<ArticleRow>(ARTICLES_TODAY);
  if (feedId === 'all') return db.getAllAsync<ArticleRow>(ARTICLES_ALL);
  if (feedId === 'youtube') return db.getAllAsync<ArticleRow>(ARTICLES_YOUTUBE);
  if (feedId === 'nonyoutube') return db.getAllAsync<ArticleRow>(ARTICLES_NON_YOUTUBE);
  return db.getAllAsync<ArticleRow>(ARTICLES_BY_FEED, [feedId]);
}

export async function getArticle(db: SQLiteDatabase, id: number): Promise<ArticleRow | null> {
  return db.getFirstAsync<ArticleRow>(
    `SELECT a.*, f.title as feed_title FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE a.id = ?`,
    [id]
  );
}

export async function getArticlesByIds(db: SQLiteDatabase, ids: number[]): Promise<ArticleRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<ArticleRow>(
    `SELECT a.*, f.title as feed_title, f.site_url as feed_site_url
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     WHERE a.id IN (${placeholders})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ArticleRow => r != null);
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
): Promise<Array<{ id: number; url: string | null }>> {
  const inserted: Array<{ id: number; url: string | null }> = [];
  for (const a of articles) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO articles
         (feed_id, guid, title, url, author, content_html, content_text, summary, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [feedId, a.guid, a.title, a.url, a.author, a.content_html, a.content_text, a.summary, a.published_at]
    );
    if (result.changes > 0) {
      inserted.push({ id: result.lastInsertRowId, url: a.url });
    }
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

export async function updateArticleVideoDimensions(
  db: SQLiteDatabase,
  id: number,
  width: number,
  height: number
): Promise<void> {
  await db.runAsync(`UPDATE articles SET video_width = ?, video_height = ? WHERE id = ?`, [width, height, id]);
}

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
