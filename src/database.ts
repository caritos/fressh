import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Feed, Article, FeedStats } from './types.js';
import { logger } from './logger.js';
import { createDatabase, type DatabaseInstance, type Statement } from './database-adapter.js';

class DatabaseManager {
  private db: DatabaseInstance | null = null;
  private preparedStatements: Map<string, Statement> = new Map();

  initialize(dbPath: string): void {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database with WAL mode for better concurrency
    this.db = createDatabase(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Create schema
    this.createSchema();
    logger.info(`Database initialized at ${dbPath}`);
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        site_url TEXT,
        last_fetch DATETIME,
        last_modified TEXT,
        etag TEXT,
        fetch_interval INTEGER DEFAULT 900,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
      );

      CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
      CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(read);
      CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_guid ON articles(guid);

      -- Full-text search index
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        content_text,
        summary,
        content=articles,
        content_rowid=id
      );

      -- Triggers to keep FTS index in sync
      CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, content_text, summary)
        VALUES (new.id, new.title, new.content_text, new.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
        DELETE FROM articles_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
        DELETE FROM articles_fts WHERE rowid = old.id;
        INSERT INTO articles_fts(rowid, title, content_text, summary)
        VALUES (new.id, new.title, new.content_text, new.summary);
      END;
    `);
  }

  private getStatement(key: string, sql: string): Statement {
    if (!this.db) throw new Error('Database not initialized');

    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, this.db.prepare(sql));
    }
    return this.preparedStatements.get(key)!;
  }

  // Feed operations
  addFeed(feed: Feed): number {
    const stmt = this.getStatement(
      'addFeed',
      `INSERT INTO feeds (url, title, site_url, fetch_interval, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title,
         site_url = excluded.site_url
       RETURNING id`
    );

    const result = stmt.get(
      feed.url,
      feed.title || null,
      feed.site_url || null,
      feed.fetch_interval || 900,
      feed.enabled ?? 1
    ) as { id: number };

    return result.id;
  }

  getAllFeeds(): Feed[] {
    const stmt = this.getStatement(
      'getAllFeeds',
      'SELECT * FROM feeds WHERE enabled = 1'
    );
    return stmt.all() as Feed[];
  }

  getFeed(url: string): Feed | undefined {
    const stmt = this.getStatement(
      'getFeed',
      'SELECT * FROM feeds WHERE url = ?'
    );
    return stmt.get(url) as Feed | undefined;
  }

  removeFeed(url: string): void {
    const stmt = this.getStatement(
      'removeFeed',
      'DELETE FROM feeds WHERE url = ?'
    );
    stmt.run(url);
  }

  updateFeedMetadata(feedId: number, metadata: { last_fetch?: Date; last_modified?: string; etag?: string; title?: string }): void {
    const updates: string[] = [];
    const values: any[] = [];

    if (metadata.last_fetch !== undefined) {
      updates.push('last_fetch = ?');
      values.push(metadata.last_fetch.toISOString());
    }
    if (metadata.last_modified !== undefined) {
      updates.push('last_modified = ?');
      values.push(metadata.last_modified);
    }
    if (metadata.etag !== undefined) {
      updates.push('etag = ?');
      values.push(metadata.etag);
    }
    if (metadata.title !== undefined) {
      updates.push('title = ?');
      values.push(metadata.title);
    }

    if (updates.length === 0) return;

    values.push(feedId);
    const sql = `UPDATE feeds SET ${updates.join(', ')} WHERE id = ?`;

    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(sql).run(...values);
  }

  // Article operations
  addArticles(articles: Article[]): number {
    if (!this.db) throw new Error('Database not initialized');
    if (articles.length === 0) return 0;

    const insertStmt = this.db.prepare(`
      INSERT INTO articles (
        feed_id, guid, title, url, author,
        content_html, content_text, summary, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feed_id, guid) DO NOTHING
    `);

    const transaction = this.db.transaction((articles: Article[]) => {
      let insertCount = 0;
      for (const article of articles) {
        const result = insertStmt.run(
          article.feed_id,
          article.guid,
          article.title || null,
          article.url || null,
          article.author || null,
          article.content_html || null,
          article.content_text || null,
          article.summary || null,
          article.published_at ? article.published_at.toISOString() : null
        );
        if (result.changes > 0) insertCount++;
      }
      return insertCount;
    });

    return transaction(articles);
  }

  getUnreadArticles(limit?: number): Article[] {
    const sql = limit
      ? 'SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC LIMIT ?'
      : 'SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC';

    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    return (limit ? stmt.all(limit) : stmt.all()) as Article[];
  }

  markArticleAsRead(articleId: number): void {
    const stmt = this.getStatement(
      'markRead',
      'UPDATE articles SET read = 1 WHERE id = ?'
    );
    stmt.run(articleId);
  }

  markAllAsRead(): void {
    const stmt = this.getStatement(
      'markAllRead',
      'UPDATE articles SET read = 1'
    );
    stmt.run();
  }

  markFeedAsRead(feedUrl: string): number {
    const feed = this.getFeed(feedUrl);
    if (!feed || !feed.id) return 0;

    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('UPDATE articles SET read = 1 WHERE feed_id = ? AND read = 0').run(feed.id);
    return result.changes;
  }

  toggleStarred(articleId: number): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('UPDATE articles SET starred = 1 - starred WHERE id = ?').run(articleId);
  }

  // Statistics
  getStats(): FeedStats {
    if (!this.db) throw new Error('Database not initialized');

    const feedStats = this.db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(enabled), 0) as enabled FROM feeds').get() as { total: number; enabled: number };
    const articleStats = this.db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END), 0) as unread, COALESCE(SUM(starred), 0) as starred FROM articles').get() as { total: number; unread: number; starred: number };

    return {
      totalFeeds: feedStats.total,
      enabledFeeds: feedStats.enabled,
      totalArticles: articleStats.total,
      unreadArticles: articleStats.unread,
      starredArticles: articleStats.starred,
    };
  }

  // Cleanup
  deleteOldArticles(daysOld: number): number {
    if (!this.db) throw new Error('Database not initialized');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = this.db.prepare(`
      DELETE FROM articles
      WHERE read = 1 AND starred = 0 AND published_at < ?
    `).run(cutoffDate.toISOString());

    return result.changes;
  }

  deleteYouTubeShorts(): number {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.prepare(`
      DELETE FROM articles
      WHERE url LIKE '%youtube.com/shorts/%' OR url LIKE '%youtu.be/shorts/%'
    `).run();

    return result.changes;
  }

  searchArticles(query: string, feedId?: number | null, showUnreadOnly: boolean = true): Article[] {
    if (!this.db) throw new Error('Database not initialized');
    if (!query || query.trim().length === 0) return [];

    // Escape FTS5 special characters and prepare query
    const sanitizedQuery = query
      .replace(/[:"*]/g, ' ')
      .trim()
      .split(/\s+/)
      .map(term => `"${term}"*`)
      .join(' OR ');

    let sql: string;
    let params: any[];

    if (feedId === null || feedId === undefined) {
      // Search all feeds
      sql = showUnreadOnly
        ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           ) AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500`
        : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           )
           ORDER BY a.published_at DESC
           LIMIT 500`;
      params = [sanitizedQuery];
    } else {
      // Search specific feed
      sql = showUnreadOnly
        ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           ) AND a.feed_id = ? AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500`
        : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           ) AND a.feed_id = ?
           ORDER BY a.published_at DESC
           LIMIT 500`;
      params = [sanitizedQuery, feedId];
    }

    try {
      return this.db.prepare(sql).all(...params) as Article[];
    } catch (error) {
      logger.error('Search error:', error);
      return [];
    }
  }

  rebuildSearchIndex(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Rebuild FTS index from scratch
    this.db.exec(`
      DELETE FROM articles_fts;
      INSERT INTO articles_fts(rowid, title, content_text, summary)
      SELECT id, title, content_text, summary FROM articles;
    `);

    logger.info('Search index rebuilt successfully');
  }

  close(): void {
    if (this.db) {
      this.preparedStatements.clear();
      this.db.close();
      this.db = null;
    }
  }
}

export const database = new DatabaseManager();
