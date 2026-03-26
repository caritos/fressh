import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { logger } from './logger.js';
class DatabaseManager {
    db = null;
    preparedStatements = new Map();
    initialize(dbPath) {
        // Ensure directory exists
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // Open database with WAL mode for better concurrency
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        // Create schema
        this.createSchema();
        logger.info(`Database initialized at ${dbPath}`);
    }
    createSchema() {
        if (!this.db)
            throw new Error('Database not initialized');
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
    `);
    }
    getStatement(key, sql) {
        if (!this.db)
            throw new Error('Database not initialized');
        if (!this.preparedStatements.has(key)) {
            this.preparedStatements.set(key, this.db.prepare(sql));
        }
        return this.preparedStatements.get(key);
    }
    // Feed operations
    addFeed(feed) {
        const stmt = this.getStatement('addFeed', `INSERT INTO feeds (url, title, site_url, fetch_interval, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title,
         site_url = excluded.site_url
       RETURNING id`);
        const result = stmt.get(feed.url, feed.title || null, feed.site_url || null, feed.fetch_interval || 900, feed.enabled ?? 1);
        return result.id;
    }
    getAllFeeds() {
        const stmt = this.getStatement('getAllFeeds', 'SELECT * FROM feeds WHERE enabled = 1');
        return stmt.all();
    }
    getFeed(url) {
        const stmt = this.getStatement('getFeed', 'SELECT * FROM feeds WHERE url = ?');
        return stmt.get(url);
    }
    removeFeed(url) {
        const stmt = this.getStatement('removeFeed', 'DELETE FROM feeds WHERE url = ?');
        stmt.run(url);
    }
    updateFeedMetadata(feedId, metadata) {
        const updates = [];
        const values = [];
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
        if (updates.length === 0)
            return;
        values.push(feedId);
        const sql = `UPDATE feeds SET ${updates.join(', ')} WHERE id = ?`;
        if (!this.db)
            throw new Error('Database not initialized');
        this.db.prepare(sql).run(...values);
    }
    // Article operations
    addArticles(articles) {
        if (!this.db)
            throw new Error('Database not initialized');
        if (articles.length === 0)
            return 0;
        let insertCount = 0;
        const insertStmt = this.db.prepare(`
      INSERT INTO articles (
        feed_id, guid, title, url, author,
        content_html, content_text, summary, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feed_id, guid) DO NOTHING
    `);
        const transaction = this.db.transaction((articles) => {
            for (const article of articles) {
                const result = insertStmt.run(article.feed_id, article.guid, article.title || null, article.url || null, article.author || null, article.content_html || null, article.content_text || null, article.summary || null, article.published_at ? article.published_at.toISOString() : null);
                if (result.changes > 0)
                    insertCount++;
            }
        });
        transaction(articles);
        return insertCount;
    }
    getUnreadArticles(limit) {
        const sql = limit
            ? 'SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC LIMIT ?'
            : 'SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC';
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(sql);
        return (limit ? stmt.all(limit) : stmt.all());
    }
    markArticleAsRead(articleId) {
        const stmt = this.getStatement('markRead', 'UPDATE articles SET read = 1 WHERE id = ?');
        stmt.run(articleId);
    }
    markAllAsRead() {
        const stmt = this.getStatement('markAllRead', 'UPDATE articles SET read = 1');
        stmt.run();
    }
    toggleStarred(articleId) {
        if (!this.db)
            throw new Error('Database not initialized');
        this.db.prepare('UPDATE articles SET starred = 1 - starred WHERE id = ?').run(articleId);
    }
    // Statistics
    getStats() {
        if (!this.db)
            throw new Error('Database not initialized');
        const feedStats = this.db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(enabled), 0) as enabled FROM feeds').get();
        const articleStats = this.db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END), 0) as unread, COALESCE(SUM(starred), 0) as starred FROM articles').get();
        return {
            totalFeeds: feedStats.total,
            enabledFeeds: feedStats.enabled,
            totalArticles: articleStats.total,
            unreadArticles: articleStats.unread,
            starredArticles: articleStats.starred,
        };
    }
    // Cleanup
    deleteOldArticles(daysOld) {
        if (!this.db)
            throw new Error('Database not initialized');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        const result = this.db.prepare(`
      DELETE FROM articles
      WHERE read = 1 AND starred = 0 AND published_at < ?
    `).run(cutoffDate.toISOString());
        return result.changes;
    }
    close() {
        if (this.db) {
            this.preparedStatements.clear();
            this.db.close();
            this.db = null;
        }
    }
}
export const database = new DatabaseManager();
//# sourceMappingURL=database.js.map