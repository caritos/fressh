#!/usr/bin/env bun
// @bun
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/logger.ts
import { appendFileSync, mkdirSync, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

class Logger {
  level = "info";
  logFilePath = null;
  setLevel(level) {
    this.level = level;
  }
  enableFileLogging(logDir) {
    const dir = logDir || join2(homedir2(), "Library", "Logs", "fressh");
    if (!existsSync2(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.logFilePath = join2(dir, "daemon.log");
  }
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }
  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? " " + args.map((arg) => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ") : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }
  writeToFile(formatted) {
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, formatted + `
`, "utf-8");
      } catch (error) {
        console.error("Failed to write to log file:", error);
      }
    }
  }
  debug(message, ...args) {
    if (this.shouldLog("debug")) {
      const formatted = this.formatMessage("debug", message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }
  info(message, ...args) {
    if (this.shouldLog("info")) {
      const formatted = this.formatMessage("info", message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }
  warn(message, ...args) {
    if (this.shouldLog("warn")) {
      const formatted = this.formatMessage("warn", message, ...args);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }
  error(message, ...args) {
    if (this.shouldLog("error")) {
      const formatted = this.formatMessage("error", message, ...args);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }
}
var LOG_LEVELS, logger;
var init_logger = __esm(() => {
  LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  logger = new Logger;
});

// src/database-adapter.ts
function createDatabase(path) {
  const isBun = typeof Bun !== "undefined";
  if (isBun) {
    const { Database } = __require("bun:sqlite");
    const db = new Database(path);
    return {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          run(...params) {
            const result = stmt.run(...params);
            const changes = db.changes;
            return { changes };
          },
          get(...params) {
            return stmt.get(...params);
          },
          all(...params) {
            return stmt.all(...params);
          }
        };
      },
      exec(sql) {
        db.exec(sql);
      },
      pragma(pragma) {
        db.exec(`PRAGMA ${pragma}`);
      },
      transaction(fn) {
        return db.transaction(fn);
      },
      close() {
        db.close();
      }
    };
  } else {
    const BetterSqlite3 = __require("better-sqlite3");
    const db = new BetterSqlite3(path);
    return {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          run(...params) {
            return stmt.run(...params);
          },
          get(...params) {
            return stmt.get(...params);
          },
          all(...params) {
            return stmt.all(...params);
          }
        };
      },
      exec(sql) {
        db.exec(sql);
      },
      pragma(pragma) {
        db.pragma(pragma);
      },
      transaction(fn) {
        return db.transaction(fn);
      },
      close() {
        db.close();
      }
    };
  }
}

// src/database.ts
import { mkdirSync as mkdirSync2, existsSync as existsSync3 } from "fs";
import { dirname as dirname2 } from "path";

class DatabaseManager {
  db = null;
  preparedStatements = new Map;
  initialize(dbPath) {
    const dir = dirname2(dbPath);
    if (!existsSync3(dir)) {
      mkdirSync2(dir, { recursive: true });
    }
    this.db = createDatabase(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.createSchema();
    logger.info(`Database initialized at ${dbPath}`);
  }
  createSchema() {
    if (!this.db)
      throw new Error("Database not initialized");
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
  getStatement(key, sql) {
    if (!this.db)
      throw new Error("Database not initialized");
    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, this.db.prepare(sql));
    }
    return this.preparedStatements.get(key);
  }
  addFeed(feed) {
    const stmt = this.getStatement("addFeed", `INSERT INTO feeds (url, title, site_url, fetch_interval, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title,
         site_url = excluded.site_url
       RETURNING id`);
    const result = stmt.get(feed.url, feed.title || null, feed.site_url || null, feed.fetch_interval || 900, feed.enabled ?? 1);
    return result.id;
  }
  getAllFeeds() {
    const stmt = this.getStatement("getAllFeeds", "SELECT * FROM feeds WHERE enabled = 1");
    return stmt.all();
  }
  getFeed(url) {
    const stmt = this.getStatement("getFeed", "SELECT * FROM feeds WHERE url = ?");
    return stmt.get(url);
  }
  removeFeed(url) {
    const stmt = this.getStatement("removeFeed", "DELETE FROM feeds WHERE url = ?");
    stmt.run(url);
  }
  updateFeedMetadata(feedId, metadata) {
    const updates = [];
    const values = [];
    if (metadata.last_fetch !== undefined) {
      updates.push("last_fetch = ?");
      values.push(metadata.last_fetch.toISOString());
    }
    if (metadata.last_modified !== undefined) {
      updates.push("last_modified = ?");
      values.push(metadata.last_modified);
    }
    if (metadata.etag !== undefined) {
      updates.push("etag = ?");
      values.push(metadata.etag);
    }
    if (metadata.title !== undefined) {
      updates.push("title = ?");
      values.push(metadata.title);
    }
    if (updates.length === 0)
      return;
    values.push(feedId);
    const sql = `UPDATE feeds SET ${updates.join(", ")} WHERE id = ?`;
    if (!this.db)
      throw new Error("Database not initialized");
    this.db.prepare(sql).run(...values);
  }
  addArticles(articles) {
    if (!this.db)
      throw new Error("Database not initialized");
    if (articles.length === 0)
      return 0;
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO articles (
        feed_id, guid, title, url, author,
        content_html, content_text, summary, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((articles2) => {
      let insertCount = 0;
      for (const article of articles2) {
        const result = insertStmt.run(article.feed_id, article.guid, article.title || null, article.url || null, article.author || null, article.content_html || null, article.content_text || null, article.summary || null, article.published_at ? article.published_at.toISOString() : null);
        if (result.changes > 0)
          insertCount++;
      }
      return insertCount;
    });
    return transaction(articles);
  }
  getUnreadArticles(limit) {
    const sql = limit ? "SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC LIMIT ?" : "SELECT * FROM articles WHERE read = 0 ORDER BY published_at DESC";
    if (!this.db)
      throw new Error("Database not initialized");
    const stmt = this.db.prepare(sql);
    return limit ? stmt.all(limit) : stmt.all();
  }
  markArticleAsRead(articleId) {
    const stmt = this.getStatement("markRead", "UPDATE articles SET read = 1 WHERE id = ?");
    stmt.run(articleId);
  }
  markAllAsRead() {
    const stmt = this.getStatement("markAllRead", "UPDATE articles SET read = 1");
    stmt.run();
  }
  markFeedAsRead(feedUrl) {
    const feed = this.getFeed(feedUrl);
    if (!feed || !feed.id)
      return 0;
    if (!this.db)
      throw new Error("Database not initialized");
    const result = this.db.prepare("UPDATE articles SET read = 1 WHERE feed_id = ? AND read = 0").run(feed.id);
    return result.changes;
  }
  toggleStarred(articleId) {
    if (!this.db)
      throw new Error("Database not initialized");
    this.db.prepare("UPDATE articles SET starred = 1 - starred WHERE id = ?").run(articleId);
  }
  getStats() {
    if (!this.db)
      throw new Error("Database not initialized");
    const feedStats = this.db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(enabled), 0) as enabled FROM feeds").get();
    const articleStats = this.db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END), 0) as unread, COALESCE(SUM(starred), 0) as starred FROM articles").get();
    return {
      totalFeeds: feedStats.total,
      enabledFeeds: feedStats.enabled,
      totalArticles: articleStats.total,
      unreadArticles: articleStats.unread,
      starredArticles: articleStats.starred
    };
  }
  deleteOldArticles(daysOld) {
    if (!this.db)
      throw new Error("Database not initialized");
    const cutoffDate = new Date;
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const result = this.db.prepare(`
      DELETE FROM articles
      WHERE read = 1 AND starred = 0 AND published_at < ?
    `).run(cutoffDate.toISOString());
    return result.changes;
  }
  deleteYouTubeShorts() {
    if (!this.db)
      throw new Error("Database not initialized");
    const result = this.db.prepare(`
      DELETE FROM articles
      WHERE url LIKE '%youtube.com/shorts/%' OR url LIKE '%youtu.be/shorts/%'
    `).run();
    return result.changes;
  }
  removeDuplicateUrls() {
    if (!this.db)
      throw new Error("Database not initialized");
    const result = this.db.prepare(`
      DELETE FROM articles
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM articles
        WHERE url IS NOT NULL
        GROUP BY url
      ) AND url IS NOT NULL
    `).run();
    const deletedCount = result.changes || 0;
    logger.info(`Removed ${deletedCount} duplicate URLs`);
    try {
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_url_unique ON articles(url) WHERE url IS NOT NULL");
      logger.info("Created unique index on article URLs");
    } catch (error) {
      logger.warn("Could not create unique URL index (may already exist):", error);
    }
    return deletedCount;
  }
  searchArticles(query, feedId, showUnreadOnly = true) {
    if (!this.db)
      throw new Error("Database not initialized");
    if (!query || query.trim().length === 0)
      return [];
    const sanitizedQuery = query.replace(/[:"*]/g, " ").trim().split(/\s+/).map((term) => `"${term}"*`).join(" OR ");
    let sql;
    let params;
    if (feedId === null || feedId === undefined) {
      sql = showUnreadOnly ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           ) AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500` : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           )
           ORDER BY a.published_at DESC
           LIMIT 500`;
      params = [sanitizedQuery];
    } else {
      sql = showUnreadOnly ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.id IN (
             SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
           ) AND a.feed_id = ? AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500` : `SELECT a.*, f.title as feed_title
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
      return this.db.prepare(sql).all(...params);
    } catch (error) {
      logger.error("Search error:", error);
      return [];
    }
  }
  rebuildSearchIndex() {
    if (!this.db)
      throw new Error("Database not initialized");
    this.db.exec(`
      DELETE FROM articles_fts;
      INSERT INTO articles_fts(rowid, title, content_text, summary)
      SELECT id, title, content_text, summary FROM articles;
    `);
    logger.info("Search index rebuilt successfully");
  }
  close() {
    if (this.db) {
      this.preparedStatements.clear();
      this.db.close();
      this.db = null;
    }
  }
}
var database;
var init_database = __esm(() => {
  init_logger();
  database = new DatabaseManager;
});

// src/fetcher.ts
import axios from "axios";
import https from "https";
async function fetchFeed(url, options = {}) {
  const {
    timeout = 30000,
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    lastModified,
    etag,
    allowInsecureCertificates = false
  } = options;
  try {
    const headers = {
      "User-Agent": userAgent,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9"
    };
    if (lastModified) {
      headers["If-Modified-Since"] = lastModified;
    }
    if (etag) {
      headers["If-None-Match"] = etag;
    }
    logger.debug(`Fetching ${url}`);
    const httpsAgent = allowInsecureCertificates ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    const response = await axios.get(url, {
      headers,
      timeout,
      httpsAgent,
      validateStatus: (status) => status < 500
    });
    if (response.status === 304) {
      logger.debug(`Feed not modified: ${url}`);
      return null;
    }
    if (response.status >= 400) {
      logger.error(`HTTP ${response.status} when fetching ${url}`);
      return null;
    }
    return {
      data: response.data,
      lastModified: response.headers["last-modified"],
      etag: response.headers["etag"],
      status: response.status
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.code === "ECONNABORTED") {
        logger.error(`Timeout fetching ${url}`);
      } else if (axiosError.response) {
        logger.error(`HTTP ${axiosError.response.status} when fetching ${url}`);
      } else if (axiosError.request) {
        logger.error(`Network error fetching ${url}: ${axiosError.message}`);
      } else {
        logger.error(`Error fetching ${url}: ${axiosError.message}`);
      }
    } else {
      logger.error(`Unexpected error fetching ${url}:`, error);
    }
    return null;
  }
}
var init_fetcher = __esm(() => {
  init_logger();
});

// src/parser.ts
import Parser from "rss-parser";
function isYouTubeShort(url) {
  if (!url)
    return false;
  return url.includes("youtube.com/shorts/") || url.includes("youtu.be/shorts/");
}
function sanitizeXml(xml) {
  return xml.replace(/&([^a-zA-Z#]|[a-zA-Z]+[^a-zA-Z0-9;])/g, "&amp;$1");
}
function isHtmlPage(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return true;
  }
  const firstPart = trimmed.slice(0, 1000).toLowerCase();
  return firstPart.includes("<head>") || firstPart.includes("<body>") || firstPart.includes("<html") && !firstPart.includes("<rss") && !firstPart.includes("<feed");
}
async function parseFeed(feedContent, config) {
  try {
    if (isHtmlPage(feedContent)) {
      logger.error("This appears to be an HTML page, not an RSS/Atom feed");
      return null;
    }
    const sanitizedContent = sanitizeXml(feedContent);
    const feed = await parser.parseString(sanitizedContent);
    if (!feed || !feed.items) {
      logger.error("Invalid feed structure - no items found");
      return null;
    }
    const articles = [];
    for (const item of feed.items) {
      const anyItem = item;
      if (isYouTubeShort(item.link)) {
        logger.debug(`Skipping YouTube Short: ${item.title || item.link}`);
        continue;
      }
      const guid = item.guid || anyItem.id || item.link || item.title || `${Date.now()}-${Math.random()}`;
      const contentHtml = anyItem.contentEncoded || item.content || anyItem.description || "";
      const summary = anyItem.summary || item.contentSnippet || "";
      let publishedAt;
      if (item.pubDate) {
        publishedAt = new Date(item.pubDate);
        if (isNaN(publishedAt.getTime())) {
          publishedAt = undefined;
        }
      }
      if (!publishedAt && item.isoDate) {
        publishedAt = new Date(item.isoDate);
        if (isNaN(publishedAt.getTime())) {
          publishedAt = undefined;
        }
      }
      articles.push({
        guid,
        title: item.title,
        url: item.link,
        author: item.creator || anyItem.author,
        content_html: contentHtml,
        content_text: stripHtml(contentHtml),
        summary,
        published_at: publishedAt || new Date
      });
    }
    let filteredArticles = articles;
    if (config?.maxArticleAgeDays && config.maxArticleAgeDays > 0) {
      const cutoffDate = new Date;
      cutoffDate.setDate(cutoffDate.getDate() - config.maxArticleAgeDays);
      const beforeFilter = articles.length;
      filteredArticles = articles.filter((article) => {
        if (!article.published_at)
          return true;
        return article.published_at >= cutoffDate;
      });
      const filtered = beforeFilter - filteredArticles.length;
      if (filtered > 0) {
        logger.debug(`Filtered out ${filtered} articles older than ${config.maxArticleAgeDays} days`);
      }
    }
    return {
      title: feed.title,
      siteUrl: feed.link,
      articles: filteredArticles
    };
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error parsing feed: ${error.message}`);
    } else {
      logger.error("Error parsing feed:", error);
    }
    return null;
  }
}
function stripHtml(html) {
  if (!html)
    return "";
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
var parser;
var init_parser = __esm(() => {
  init_logger();
  parser = new Parser({
    customFields: {
      item: [
        ["content:encoded", "contentEncoded"],
        ["description", "description"],
        ["summary", "summary"]
      ]
    }
  });
});

// src/scheduler.ts
import cron from "node-cron";

class Scheduler {
  tasks = new Map;
  schedule(cronExpression, name, callback) {
    if (this.tasks.has(name)) {
      logger.warn(`Task ${name} already scheduled, replacing...`);
      this.tasks.get(name)?.stop();
    }
    const task = cron.schedule(cronExpression, async () => {
      logger.debug(`Running scheduled task: ${name}`);
      try {
        await callback();
      } catch (error) {
        logger.error(`Error in scheduled task ${name}:`, error);
      }
    });
    this.tasks.set(name, task);
    logger.info(`Scheduled task: ${name} (${cronExpression})`);
  }
  stop(name) {
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
      logger.info(`Stopped task: ${name}`);
    }
  }
  stopAll() {
    for (const [name, task] of this.tasks) {
      task.stop();
      logger.info(`Stopped task: ${name}`);
    }
    this.tasks.clear();
  }
}
var init_scheduler = __esm(() => {
  init_logger();
});

// src/pinboard-scraper.ts
import * as cheerio from "cheerio";
import axios2 from "axios";
async function scrapePinboardPopular(timeout = 30000) {
  try {
    logger.debug("Fetching Pinboard popular page...");
    const response = await axios2.get("https://pinboard.in/popular/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout
    });
    if (response.status !== 200) {
      logger.error(`HTTP ${response.status} when fetching Pinboard popular page`);
      return [];
    }
    let html = response.data;
    if (typeof html === "string") {
      html = html.replace(/&#x[0-9A-Fa-f]*[^0-9A-Fa-f;][^;]*;?/g, "");
      html = html.replace(/&#[0-9]*[^0-9;][^;]*;?/g, "");
    }
    const $ = cheerio.load(html, {
      xmlMode: false,
      decodeEntities: false
    });
    const links = [];
    $(".bookmark").each((_, element) => {
      const $bookmark = $(element);
      const $link = $bookmark.find(".bookmark_title");
      const url = $link.attr("href");
      const title = $link.text().trim();
      if (!url || !title)
        return;
      const description = $bookmark.find(".description").text().trim() || undefined;
      const tags = [];
      $bookmark.find(".tag").each((_2, tagEl) => {
        const tag = $(tagEl).text().trim();
        if (tag)
          tags.push(tag);
      });
      let timestamp;
      const timeText = $bookmark.find(".when").attr("title") || $bookmark.find(".when").text();
      if (timeText) {
        const parsed = new Date(timeText);
        if (!isNaN(parsed.getTime())) {
          timestamp = parsed;
        }
      }
      links.push({
        url,
        title,
        description,
        tags,
        timestamp
      });
    });
    logger.info(`Scraped ${links.length} links from Pinboard popular page`);
    return links;
  } catch (error) {
    if (axios2.isAxiosError(error)) {
      logger.error(`Error fetching Pinboard: ${error.message}`);
    } else {
      logger.error("Unexpected error scraping Pinboard:", error);
    }
    return [];
  }
}
function convertPinboardLinksToArticles(links, feedId) {
  return links.map((link) => ({
    guid: link.url,
    title: link.title,
    url: link.url,
    author: undefined,
    content_html: link.description ? `<p>${link.description}</p>${link.tags.length > 0 ? `<p>Tags: ${link.tags.join(", ")}</p>` : ""}` : link.tags.length > 0 ? `<p>Tags: ${link.tags.join(", ")}</p>` : undefined,
    content_text: link.description || undefined,
    summary: link.description || link.tags.join(", ") || undefined,
    published_at: link.timestamp || new Date
  }));
}
var init_pinboard_scraper = __esm(() => {
  init_logger();
});

// src/hackernews-scraper.ts
import * as cheerio2 from "cheerio";
import axios3 from "axios";
async function scrapeHackerNews(timeout = 30000) {
  try {
    logger.debug("Fetching Hacker News front page...");
    const response = await axios3.get("https://news.ycombinator.com/news", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout
    });
    if (response.status !== 200) {
      logger.error(`HTTP ${response.status} when fetching Hacker News`);
      return [];
    }
    const $ = cheerio2.load(response.data);
    const items = [];
    $(".athing").each((_, element) => {
      const $story = $(element);
      const rank = parseInt($story.find(".rank").text().replace(".", ""), 10);
      const $titleLink = $story.find(".titleline > a").first();
      const title = $titleLink.text().trim();
      let url = $titleLink.attr("href");
      if (!title || !url)
        return;
      if (url.startsWith("item?id=")) {
        url = `https://news.ycombinator.com/${url}`;
      }
      const $subtext = $story.next(".subtext");
      const pointsText = $subtext.find(".score").text();
      const pointsMatch = pointsText.match(/(\d+) point/);
      const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 0;
      const author = $subtext.find(".hnuser").text() || undefined;
      const commentsText = $subtext.find("a").last().text();
      const commentsMatch = commentsText.match(/(\d+)\s+comment/);
      const commentCount = commentsMatch ? parseInt(commentsMatch[1], 10) : 0;
      const ageText = $subtext.find(".age").attr("title");
      let timestamp;
      if (ageText) {
        timestamp = new Date(ageText);
      } else {
        timestamp = new Date;
      }
      items.push({
        url,
        title,
        points,
        author,
        commentCount,
        timestamp,
        rank
      });
    });
    logger.info(`Scraped ${items.length} stories from Hacker News`);
    return items;
  } catch (error) {
    if (axios3.isAxiosError(error)) {
      logger.error(`Error fetching Hacker News: ${error.message}`);
    } else {
      logger.error("Unexpected error scraping Hacker News:", error);
    }
    return [];
  }
}
function convertHackerNewsToArticles(items, feedId) {
  return items.map((item) => {
    const metadataParts = [];
    if (item.points !== undefined) {
      metadataParts.push(`${item.points} points`);
    }
    if (item.author) {
      metadataParts.push(`by ${item.author}`);
    }
    if (item.commentCount) {
      metadataParts.push(`${item.commentCount} comments`);
    }
    if (item.rank) {
      metadataParts.push(`#${item.rank}`);
    }
    const content_html = metadataParts.length > 0 ? `<p>${metadataParts.join(" | ")}</p>` : undefined;
    const summary = metadataParts.length > 0 ? metadataParts.join(" | ") : undefined;
    return {
      guid: item.url,
      title: item.title,
      url: item.url,
      author: item.author,
      content_html,
      content_text: undefined,
      summary,
      published_at: item.timestamp || new Date
    };
  });
}
var init_hackernews_scraper = __esm(() => {
  init_logger();
});

// src/logo.ts
var CLI_BANNER = `
     ↗
   ↗  \uD83C\uDF31   fressh — Fresh RSS Reader
  —  ╱│╲   Terminal-based RSS daemon
`;

// src/daemon.ts
var exports_daemon = {};
__export(exports_daemon, {
  Daemon: () => Daemon
});
import pLimit from "p-limit";

class Daemon {
  scheduler;
  config;
  running = false;
  constructor(config) {
    this.config = config;
    this.scheduler = new Scheduler;
  }
  async start() {
    logger.enableFileLogging();
    console.log(`
` + CLI_BANNER);
    logger.info("=== fressh Daemon Starting ===");
    logger.info(`Database: ${this.config.databasePath}`);
    logger.info(`Fetch interval: ${this.config.fetchInterval}s (every ${Math.floor(this.config.fetchInterval / 60)} minutes)`);
    logger.info(`Max concurrent fetches: ${this.config.maxConcurrentFetches}`);
    logger.info(`HTTP timeout: ${this.config.httpTimeout}ms`);
    logger.info(`Log level: ${this.config.logLevel}`);
    database.initialize(this.config.databasePath);
    const feeds = database.getAllFeeds();
    logger.info(`Loaded ${feeds.length} feeds`);
    if (feeds.length === 0) {
      logger.warn("No feeds found in database. Import feeds using: fressh import <opml-file>");
    }
    this.running = true;
    logger.info("Performing initial fetch...");
    await this.fetchAllFeeds();
    const cronExpression = `*/${Math.floor(this.config.fetchInterval / 60)} * * * *`;
    this.scheduler.schedule(cronExpression, "fetch-all", () => this.fetchAllFeeds());
    this.ensurePinboardFeed();
    await this.scrapePinboard();
    this.scheduler.schedule("0 9 * * *", "scrape-pinboard", () => this.scrapePinboard());
    this.ensureHackerNewsFeed();
    await this.scrapeHackerNews();
    this.scheduler.schedule("0 */4 * * *", "scrape-hackernews", () => this.scrapeHackerNews());
    logger.info("Daemon started successfully");
    logger.info("Press Ctrl+C to stop");
    await this.waitForShutdown();
  }
  async fetchAllFeeds() {
    const startTime = Date.now();
    logger.info("--- Fetch Cycle Starting ---");
    const feeds = database.getAllFeeds();
    if (feeds.length === 0) {
      logger.warn("No feeds to fetch. Import feeds using: fressh import <opml-file>");
      return;
    }
    const rssFeeds = feeds.filter((feed) => feed.url !== "https://pinboard.in/popular/" && feed.url !== "https://news.ycombinator.com/news");
    logger.info(`Fetching ${rssFeeds.length} feeds (max ${this.config.maxConcurrentFetches} concurrent)...`);
    const limit = pLimit(this.config.maxConcurrentFetches);
    const promises = rssFeeds.map((feed) => limit(() => this.fetchOne(feed)));
    const results = await Promise.allSettled(promises);
    let successful = 0;
    let failed = 0;
    let notModified = 0;
    let newArticles = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value === null) {
          notModified++;
        } else if (result.value === -1) {
          failed++;
        } else {
          successful++;
          newArticles += result.value;
        }
      } else {
        failed++;
      }
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`--- Fetch Cycle Complete ---`);
    logger.info(`Total: ${rssFeeds.length} feeds | Success: ${successful} | Not Modified: ${notModified} | Failed: ${failed}`);
    logger.info(`New articles: ${newArticles} | Duration: ${duration}s`);
    const nextFetch = new Date(Date.now() + this.config.fetchInterval * 1000);
    logger.info(`Next fetch scheduled for: ${nextFetch.toLocaleString()}`);
  }
  async fetchOne(feed) {
    try {
      logger.debug(`Fetching: ${feed.title || feed.url}`);
      const result = await fetchFeed(feed.url, {
        timeout: this.config.httpTimeout,
        userAgent: this.config.userAgent,
        lastModified: feed.last_modified,
        etag: feed.etag,
        allowInsecureCertificates: this.config.allowInsecureCertificates
      });
      if (!result) {
        logger.debug(`Not modified: ${feed.title || feed.url}`);
        database.updateFeedMetadata(feed.id, { last_fetch: new Date });
        return null;
      }
      const parsed = await parseFeed(result.data, this.config);
      if (!parsed) {
        logger.error(`Failed to parse: ${feed.title || feed.url}`);
        database.updateFeedMetadata(feed.id, { last_fetch: new Date });
        return -1;
      }
      const articlesWithFeedId = parsed.articles.map((article) => ({
        ...article,
        feed_id: feed.id
      }));
      const newCount = database.addArticles(articlesWithFeedId);
      database.updateFeedMetadata(feed.id, {
        last_fetch: new Date,
        last_modified: result.lastModified,
        etag: result.etag,
        title: parsed.title || feed.title
      });
      if (newCount > 0) {
        logger.info(`✓ ${feed.title || feed.url}: ${newCount} new articles`);
      } else {
        logger.debug(`✓ ${feed.title || feed.url}: no new articles`);
      }
      return newCount;
    } catch (error) {
      logger.error(`✗ Error fetching ${feed.title || feed.url}:`, error);
      return -1;
    }
  }
  async waitForShutdown() {
    return new Promise((resolve) => {
      const shutdown = () => {
        if (this.running) {
          logger.info("=== Shutdown signal received ===");
          this.running = false;
          this.scheduler.stopAll();
          database.close();
          logger.info("=== Daemon stopped cleanly ===");
          resolve();
        }
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    });
  }
  async refresh() {
    logger.info("Forcing refresh of all feeds...");
    await this.fetchAllFeeds();
  }
  ensurePinboardFeed() {
    const pinboardUrl = "https://pinboard.in/popular/";
    const existingFeed = database.getFeed(pinboardUrl);
    if (!existingFeed) {
      const feedId = database.addFeed({
        url: pinboardUrl,
        title: "Pinboard Popular",
        site_url: "https://pinboard.in",
        enabled: 1
      });
      logger.info(`Added Pinboard Popular feed (ID: ${feedId})`);
    }
  }
  async scrapePinboard() {
    const pinboardUrl = "https://pinboard.in/popular/";
    try {
      logger.info("--- Scraping Pinboard Popular ---");
      const links = await scrapePinboardPopular(this.config.httpTimeout);
      if (links.length === 0) {
        logger.warn("No links found on Pinboard popular page");
        return;
      }
      const feed = database.getFeed(pinboardUrl);
      if (!feed || !feed.id) {
        logger.error("Pinboard feed not found in database");
        return;
      }
      const articles = convertPinboardLinksToArticles(links, feed.id).map((article) => ({
        ...article,
        feed_id: feed.id
      }));
      const newCount = database.addArticles(articles);
      database.updateFeedMetadata(feed.id, {
        last_fetch: new Date,
        title: "Pinboard Popular"
      });
      if (newCount > 0) {
        logger.info(`✓ Pinboard Popular: ${newCount} new links`);
      } else {
        logger.debug(`✓ Pinboard Popular: no new links`);
      }
      logger.info(`--- Pinboard Scraping Complete (${newCount} new) ---`);
    } catch (error) {
      logger.error("Error scraping Pinboard:", error);
    }
  }
  ensureHackerNewsFeed() {
    const hnUrl = "https://news.ycombinator.com/news";
    const existingFeed = database.getFeed(hnUrl);
    if (!existingFeed) {
      const feedId = database.addFeed({
        url: hnUrl,
        title: "Hacker News",
        site_url: "https://news.ycombinator.com",
        enabled: 1
      });
      logger.info(`Added Hacker News feed (ID: ${feedId})`);
    }
  }
  async scrapeHackerNews() {
    const hnUrl = "https://news.ycombinator.com/news";
    try {
      logger.info("--- Scraping Hacker News ---");
      const items = await scrapeHackerNews(this.config.httpTimeout);
      if (items.length === 0) {
        logger.warn("No stories found on Hacker News");
        return;
      }
      const feed = database.getFeed(hnUrl);
      if (!feed || !feed.id) {
        logger.error("Hacker News feed not found in database");
        return;
      }
      const articles = convertHackerNewsToArticles(items, feed.id).map((article) => ({
        ...article,
        feed_id: feed.id
      }));
      const newCount = database.addArticles(articles);
      database.updateFeedMetadata(feed.id, {
        last_fetch: new Date,
        title: "Hacker News"
      });
      if (newCount > 0) {
        logger.info(`✓ Hacker News: ${newCount} new stories`);
      } else {
        logger.debug(`✓ Hacker News: no new stories`);
      }
      logger.info(`--- Hacker News Scraping Complete (${newCount} new) ---`);
    } catch (error) {
      logger.error("Error scraping Hacker News:", error);
    }
  }
}
var init_daemon = __esm(() => {
  init_database();
  init_fetcher();
  init_parser();
  init_logger();
  init_scheduler();
  init_pinboard_scraper();
  init_hackernews_scraper();
});

// src/tui.ts
var exports_tui = {};
__export(exports_tui, {
  ArticleViewer: () => ArticleViewer
});
import blessed from "blessed";
import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join as join3 } from "path";
import axios4 from "axios";
import * as cheerio3 from "cheerio";

class ArticleViewer {
  screen;
  feedList;
  articleList;
  articleDetail;
  statusBar;
  helpBox;
  searchBox;
  feeds = [];
  articles = [];
  selectedFeedIndex = 0;
  selectedArticleIndex = 0;
  showUnreadOnly = true;
  showingHelp = false;
  searchMode = false;
  searchQuery = "";
  currentPane = "articles";
  currentAISummary = null;
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "fressh - RSS Article Viewer",
      fullUnicode: true,
      forceUnicode: true
    });
    this.feedList = blessed.list({
      parent: this.screen,
      label: " Feeds ",
      tags: true,
      top: 0,
      left: 0,
      width: "25%",
      height: "100%-1",
      border: {
        type: "line"
      },
      style: {
        fg: "white",
        selected: {
          bg: "black",
          fg: "yellow",
          bold: true
        },
        border: {
          fg: "cyan"
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: "█",
        style: {
          fg: "cyan"
        }
      }
    });
    this.articleList = blessed.list({
      parent: this.screen,
      label: " Articles ",
      tags: true,
      top: 0,
      left: "25%",
      width: "35%",
      height: "100%-1",
      border: {
        type: "line"
      },
      style: {
        fg: "white",
        selected: {
          bg: "black",
          fg: "yellow",
          bold: true
        },
        border: {
          fg: "cyan"
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: "█",
        style: {
          fg: "cyan"
        }
      }
    });
    this.articleDetail = blessed.box({
      parent: this.screen,
      label: " Article Details ",
      top: 0,
      left: "60%",
      width: "40%",
      height: "100%-1",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "cyan"
        }
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: "█",
        style: {
          fg: "cyan"
        }
      },
      tags: true
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      style: {
        fg: "black",
        bg: "white",
        bold: true
      }
    });
    this.helpBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "80%",
      height: "80%",
      label: " Help (Press ? or ESC to close) ",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "yellow"
        },
        bg: "black"
      },
      hidden: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: "█",
        style: {
          fg: "yellow"
        }
      },
      tags: true,
      content: this.getHelpContent()
    });
    this.searchBox = blessed.textbox({
      parent: this.screen,
      top: 0,
      left: "25%",
      width: "35%",
      height: 3,
      label: " Search (ESC to cancel) ",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "green"
        },
        bg: "black",
        focus: {
          border: {
            fg: "green"
          }
        }
      },
      hidden: true,
      inputOnFocus: true
    });
    this.setupEventHandlers();
  }
  setupEventHandlers() {
    this.feedList.on("select", (item, index) => {
      this.selectedFeedIndex = index;
      this.loadArticlesForFeed();
    });
    this.feedList.key(["j", "down"], () => {
      setImmediate(() => {
        const index = this.feedList.selected;
        this.selectedFeedIndex = index;
        this.loadArticlesForFeed();
      });
    });
    this.feedList.key(["k", "up"], () => {
      setImmediate(() => {
        const index = this.feedList.selected;
        this.selectedFeedIndex = index;
        this.loadArticlesForFeed();
      });
    });
    this.articleList.on("select", (item, index) => {
      this.selectedArticleIndex = index;
      this.showArticleDetail(index);
    });
    this.articleList.on("select item", () => {
      const index = this.articleList.selected;
      this.selectedArticleIndex = index;
      this.showArticleDetail(index);
    });
    this.screen.key(["pagedown", "C-f"], () => {
      if (!this.showingHelp) {
        this.pageDown();
      }
    });
    this.screen.key(["pageup", "C-b"], () => {
      if (!this.showingHelp) {
        this.pageUp();
      }
    });
    this.screen.key(["q", "Q"], () => {
      if (!this.showingHelp) {
        this.quit();
      }
    });
    this.screen.key(["escape"], () => {
      if (this.showingHelp) {
        this.toggleHelp();
      } else if (this.searchMode) {
        this.exitSearch();
      } else {
        this.quit();
      }
    });
    this.screen.key(["r", "R"], () => {
      this.refresh();
    });
    this.screen.key(["t", "T"], () => {
      this.showUnreadOnly = !this.showUnreadOnly;
      this.refresh();
      this.updateStatusBar();
    });
    this.screen.key(["tab"], () => {
      this.switchPane();
    });
    this.screen.key(["delete", "backspace"], () => {
      this.unsubscribeFromFeed();
    });
    this.screen.key(["space"], () => {
      this.toggleRead();
    });
    this.screen.key(["s", "S"], () => {
      this.toggleStar();
    });
    this.screen.key(["m", "M"], () => {
      this.markFeedAsRead();
    });
    this.screen.key(["enter"], () => {
      if (!this.showingHelp) {
        this.openInBrowser();
      }
    });
    this.screen.key(["?", "h"], () => {
      this.toggleHelp();
    });
    this.screen.key(["a", "A"], () => {
      if (!this.showingHelp) {
        this.markAllAsRead();
      }
    });
    this.screen.key(["i", "I"], () => {
      if (!this.showingHelp) {
        this.summarizeArticle();
      }
    });
    this.screen.key(["c", "C"], () => {
      if (!this.showingHelp) {
        this.copyArticleToClipboard();
      }
    });
    this.screen.key(["/"], () => {
      if (!this.showingHelp && !this.searchMode) {
        this.enterSearch();
      }
    });
    this.searchBox.on("submit", (value) => {
      this.performSearch(value);
    });
    this.searchBox.key(["escape"], () => {
      this.exitSearch();
    });
  }
  loadFeeds() {
    const db = database["db"];
    if (!db) {
      this.feeds = [];
      return;
    }
    let query;
    if (this.showUnreadOnly) {
      query = `SELECT f.id, f.title, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
               FROM feeds f
               LEFT JOIN articles a ON f.id = a.feed_id
               WHERE f.enabled = 1
               GROUP BY f.id
               HAVING unread_count > 0
               ORDER BY f.title`;
    } else {
      query = `SELECT f.id, f.title, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
               FROM feeds f
               LEFT JOIN articles a ON f.id = a.feed_id
               WHERE f.enabled = 1
               GROUP BY f.id
               ORDER BY f.title`;
    }
    const feedResults = db.prepare(query).all();
    const totalUnread = db.prepare("SELECT COUNT(*) as count FROM articles WHERE read = 0").get();
    this.feeds = [
      { id: null, title: "All", unreadCount: totalUnread.count },
      ...feedResults.map((f) => ({ id: f.id, title: f.title || "Untitled", unreadCount: f.unread_count }))
    ];
  }
  loadArticlesForFeed() {
    if (this.searchMode && this.searchQuery) {
      this.performSearch(this.searchQuery);
      return;
    }
    const selectedFeed = this.feeds[this.selectedFeedIndex];
    if (!selectedFeed) {
      this.articles = [];
      return;
    }
    const db = database["db"];
    if (!db) {
      this.articles = [];
      return;
    }
    let query;
    let params = [];
    if (selectedFeed.id === null) {
      query = this.showUnreadOnly ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500` : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           ORDER BY a.published_at DESC
           LIMIT 500`;
    } else {
      query = this.showUnreadOnly ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.feed_id = ? AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500` : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.feed_id = ?
           ORDER BY a.published_at DESC
           LIMIT 500`;
      params = [selectedFeed.id];
    }
    this.articles = db.prepare(query).all(...params);
    const items = this.articles.map((a) => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    if (this.articles.length > 0) {
      this.articleList.select(0);
      this.selectedArticleIndex = 0;
      this.showArticleDetail(0);
    } else {
      this.articleDetail.setContent(`

  No articles

  No articles found for this feed.`);
    }
    this.updateStatusBar();
    this.screen.render();
  }
  enterSearch() {
    this.searchMode = true;
    this.searchBox.setValue("");
    this.searchBox.show();
    this.searchBox.focus();
    this.updateStatusBar("Enter search query and press Enter...");
    this.screen.render();
  }
  exitSearch() {
    this.searchMode = false;
    this.searchQuery = "";
    this.searchBox.hide();
    this.searchBox.setValue("");
    if (this.currentPane === "articles") {
      this.articleList.focus();
    } else {
      this.feedList.focus();
    }
    this.loadArticlesForFeed();
    this.updateStatusBar();
    this.screen.render();
  }
  performSearch(query) {
    this.searchQuery = query.trim();
    if (!this.searchQuery) {
      this.exitSearch();
      return;
    }
    const selectedFeed = this.feeds[this.selectedFeedIndex];
    const feedId = selectedFeed?.id;
    this.articles = database.searchArticles(this.searchQuery, feedId, this.showUnreadOnly);
    const items = this.articles.map((a) => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    if (this.articles.length > 0) {
      this.articleList.select(0);
      this.selectedArticleIndex = 0;
      this.showArticleDetail(0);
    } else {
      this.articleDetail.setContent(`

  No results

  No articles found matching your search.`);
    }
    this.searchBox.hide();
    this.articleList.focus();
    this.updateStatusBar(`Search: "${this.searchQuery}" (${this.articles.length} results) - ESC to clear`);
    this.screen.render();
  }
  formatArticleListItem(article) {
    const title = (article.title || "Untitled").replace(/[^\x20-\x7E]/g, "");
    const readIndicator = article.read ? " " : "*";
    const starIndicator = article.starred ? "S" : " ";
    const listWidth = this.articleList.width;
    const maxTitleLength = Math.max(20, listWidth - 9);
    const truncatedTitle = title.length > maxTitleLength ? title.substring(0, maxTitleLength - 3) + "..." : title;
    return `${readIndicator} ${starIndicator} ${truncatedTitle}`;
  }
  formatFeedListItem(feed) {
    const title = feed.title.replace(/[^\x20-\x7E]/g, "");
    const listWidth = this.feedList.width;
    const maxTitleLength = Math.max(15, listWidth - 11);
    const truncatedTitle = title.length > maxTitleLength ? title.substring(0, maxTitleLength - 3) + "..." : title;
    if (feed.unreadCount > 0) {
      return `${truncatedTitle} {cyan-fg}(${feed.unreadCount}){/cyan-fg}`;
    }
    return truncatedTitle;
  }
  switchPane() {
    if (this.currentPane === "feeds") {
      this.currentPane = "articles";
      this.articleList.focus();
      this.feedList.style.border.fg = "cyan";
      this.articleList.style.border.fg = "yellow";
    } else {
      this.currentPane = "feeds";
      this.feedList.focus();
      this.feedList.style.border.fg = "yellow";
      this.articleList.style.border.fg = "cyan";
    }
    this.screen.render();
  }
  cleanText(text) {
    if (!text)
      return "";
    return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2013/g, "-").replace(/\u2014/g, "--").replace(/\u2026/g, "...").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&mdash;/g, "--").replace(/&ndash;/g, "-").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"').replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'").replace(/[^\x00-\x7F]/g, "").trim();
  }
  showArticleDetail(index) {
    const article = this.articles[index];
    if (!article)
      return;
    if (this.currentAISummary && article.id && this.currentAISummary.articleId === article.id) {
      this.displaySummary(article, this.currentAISummary.summary, this.currentAISummary.tags);
      return;
    }
    this.currentAISummary = null;
    const publishedDate = article.published_at ? new Date(article.published_at).toLocaleDateString() + " " + new Date(article.published_at).toLocaleTimeString() : "Unknown date";
    const title = (article.title || "Untitled").replace(/[^\x20-\x7E]/g, "");
    const feed = (article.feed_title || "Unknown").replace(/[^\x20-\x7E]/g, "");
    const author = (article.author || "Unknown").replace(/[^\x20-\x7E]/g, "");
    let contentPreview = article.content_text || article.summary || "No content available";
    contentPreview = contentPreview.replace(/[^\x20-\x7E\n]/g, "").substring(0, 2000);
    const content = `{bold}${title}{/bold}

{cyan-fg}Feed:{/cyan-fg} ${feed}
{cyan-fg}Author:{/cyan-fg} ${author}
{cyan-fg}Published:{/cyan-fg} ${publishedDate}
{cyan-fg}URL:{/cyan-fg} ${article.url || "No URL"}
{cyan-fg}Status:{/cyan-fg} ${article.read ? "Read" : "Unread"} ${article.starred ? "[STARRED]" : ""}

========================================

${contentPreview}`;
    this.articleDetail.setContent(content);
    this.articleDetail.setScrollPerc(0);
  }
  stripHtmlTags(html) {
    if (!html)
      return "";
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&mdash;/g, "--").replace(/&ndash;/g, "-").replace(/&hellip;/g, "...").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"').replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2013/g, "-").replace(/\u2014/g, "--").replace(/\u2026/g, "...").replace(/[\u2018-\u201F]/g, "'").replace(/[^\x00-\x7F]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 128 && code <= 255) {
        return char;
      }
      return "";
    }).trim();
  }
  toggleRead() {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.id)
      return;
    this.selectedArticleIndex = index;
    const newReadStatus = article.read ? 0 : 1;
    const db = database["db"];
    if (!db)
      return;
    db.prepare("UPDATE articles SET read = ? WHERE id = ?").run(newReadStatus, article.id);
    article.read = newReadStatus;
    const items = this.articles.map((a) => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);
    this.loadFeeds();
    const feedItems = this.feeds.map((f) => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(this.selectedFeedIndex);
    this.updateStatusBar();
    this.screen.render();
  }
  toggleStar() {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.id)
      return;
    this.selectedArticleIndex = index;
    const newStarStatus = article.starred ? 0 : 1;
    const db = database["db"];
    if (!db)
      return;
    db.prepare("UPDATE articles SET starred = ? WHERE id = ?").run(newStarStatus, article.id);
    article.starred = newStarStatus;
    const items = this.articles.map((a) => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);
    this.showArticleDetail(this.selectedArticleIndex);
    this.updateStatusBar();
    this.screen.render();
  }
  copyArticleToClipboard() {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article) {
      this.updateStatusBar("No article selected");
      return;
    }
    const title = article.title || "Untitled";
    const url = article.url || "No URL";
    const author = article.author || "Unknown";
    const publishedDate = article.published_at ? new Date(article.published_at).toLocaleString() : "Unknown date";
    const feed = article.feed_title || "Unknown";
    const content = article.content_text || article.content_html || article.summary || "No content available";
    let clipboardContent = `${title}

URL: ${url}
Feed: ${feed}
Author: ${author}
Published: ${publishedDate}`;
    if (this.currentAISummary) {
      clipboardContent += `
Tags: ${this.currentAISummary.tags.length > 0 ? this.currentAISummary.tags.join(", ") : "none"}`;
      clipboardContent += `

========================================
AI SUMMARY
========================================

${this.currentAISummary.summary}`;
    }
    clipboardContent += `

---

${content}`;
    const pbcopy = spawn("pbcopy");
    pbcopy.stdin.write(clipboardContent);
    pbcopy.stdin.end();
    pbcopy.on("close", (code) => {
      if (code === 0) {
        const summaryNote = this.currentAISummary ? " (with AI summary)" : "";
        this.updateStatusBar(`Copied "${title}" to clipboard${summaryNote}`);
      } else {
        this.updateStatusBar("Failed to copy to clipboard");
      }
      this.screen.render();
    });
  }
  openInBrowser() {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.url) {
      this.updateStatusBar("No URL available for this article");
      return;
    }
    this.selectedArticleIndex = index;
    if (!article.read && article.id) {
      const db = database["db"];
      if (db) {
        db.prepare("UPDATE articles SET read = 1 WHERE id = ?").run(article.id);
        article.read = 1;
      }
    }
    spawn("open", [article.url], { detached: true, stdio: "ignore" }).unref();
    this.updateStatusBar(`Opened in browser: ${article.url}`);
    const items = this.articles.map((a) => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);
    this.loadFeeds();
    const feedItems = this.feeds.map((f) => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(this.selectedFeedIndex);
    this.screen.render();
  }
  markFeedAsRead() {
    const selectedFeed = this.feeds[this.selectedFeedIndex];
    if (!selectedFeed) {
      this.updateStatusBar("No feed selected");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    if (selectedFeed.id === null) {
      this.updateStatusBar('Cannot mark "All" feed as read. Use A to mark all articles as read.');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    const feedTitle = selectedFeed.title;
    const db = database["db"];
    if (!db) {
      this.updateStatusBar("Database error");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    const result = db.prepare("UPDATE articles SET read = 1 WHERE feed_id = ? AND read = 0").run(selectedFeed.id);
    const count = result.changes;
    this.updateStatusBar(`Marked ${count} articles as read from: ${feedTitle}`);
    setTimeout(() => this.updateStatusBar(), 5000);
    this.refresh();
  }
  unsubscribeFromFeed() {
    const selectedFeed = this.feeds[this.selectedFeedIndex];
    if (!selectedFeed || selectedFeed.id === null) {
      this.updateStatusBar('Cannot unsubscribe from "All" feed');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    const feedTitle = selectedFeed.title;
    const db = database["db"];
    if (!db) {
      this.updateStatusBar("Error: Database not available");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    try {
      const articleCount = db.prepare("SELECT COUNT(*) as count FROM articles WHERE feed_id = ?").get(selectedFeed.id);
      const result = db.prepare("DELETE FROM feeds WHERE id = ?").run(selectedFeed.id);
      if (result.changes > 0) {
        this.updateStatusBar(`Unsubscribed from "${feedTitle}" (removed ${articleCount.count} articles)`);
        setTimeout(() => this.updateStatusBar(), 5000);
        this.selectedFeedIndex = 0;
        this.refresh();
      } else {
        this.updateStatusBar("Error: Failed to delete feed");
        setTimeout(() => this.updateStatusBar(), 3000);
      }
    } catch (error) {
      this.updateStatusBar(`Error unsubscribing: ${error}`);
      setTimeout(() => this.updateStatusBar(), 3000);
    }
  }
  refresh() {
    this.loadFeeds();
    this.loadArticlesForFeed();
    const feedItems = this.feeds.map((f) => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(Math.min(this.selectedFeedIndex, this.feeds.length - 1));
    this.screen.render();
  }
  updateStatusBar(message) {
    if (message) {
      this.statusBar.setContent(` ${message}`);
    } else {
      const selectedFeed = this.feeds[this.selectedFeedIndex];
      const feedName = selectedFeed ? selectedFeed.title : "No feed";
      const totalCount = this.articles.length;
      const unreadCount = this.articles.filter((a) => !a.read).length;
      const filter = this.showUnreadOnly ? "Unread" : "All";
      if (this.searchMode && this.searchQuery) {
        this.statusBar.setContent(` Search: "${this.searchQuery}" (${totalCount} results) | ESC to clear | ? help | Q quit `);
      } else {
        this.statusBar.setContent(` ${feedName} | Articles: ${totalCount} | Unread: ${unreadCount} | Filter: ${filter} | / search | Tab switch | ? help | Q quit `);
      }
    }
  }
  quit() {
    this.screen.destroy();
    process.exit(0);
  }
  toggleHelp() {
    this.showingHelp = !this.showingHelp;
    if (this.showingHelp) {
      this.helpBox.show();
      this.helpBox.focus();
    } else {
      this.helpBox.hide();
      this.articleList.focus();
    }
    this.screen.render();
  }
  pageDown() {
    const pageSize = 10;
    const currentIndex = this.articleList.selected;
    const newIndex = Math.min(currentIndex + pageSize, this.articles.length - 1);
    this.articleList.select(newIndex);
    this.selectedArticleIndex = newIndex;
  }
  pageUp() {
    const pageSize = 10;
    const currentIndex = this.articleList.selected;
    const newIndex = Math.max(currentIndex - pageSize, 0);
    this.articleList.select(newIndex);
    this.selectedArticleIndex = newIndex;
  }
  markAllAsRead() {
    const db = database["db"];
    if (!db) {
      this.updateStatusBar("Error: Database not available");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    try {
      const result = db.prepare("UPDATE articles SET read = 1 WHERE read = 0").run();
      const count = result.changes;
      this.updateStatusBar(`Marked ${count} articles as read`);
      setTimeout(() => this.updateStatusBar(), 5000);
      this.refresh();
    } catch (error) {
      this.updateStatusBar(`Error marking all as read: ${error}`);
      setTimeout(() => this.updateStatusBar(), 3000);
    }
  }
  async summarizeArticle() {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article) {
      this.updateStatusBar("No article selected");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    if (!article.url) {
      this.updateStatusBar("No URL available for this article");
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }
    this.updateStatusBar("Fetching content...");
    this.screen.render();
    try {
      const isYouTube = this.isYouTubeUrl(article.url);
      let content;
      let contentType = "article";
      if (isYouTube) {
        contentType = "video";
        this.updateStatusBar("Fetching YouTube transcript...");
        this.screen.render();
        content = await this.fetchYouTubeTranscript(article.url);
      } else {
        this.updateStatusBar("Fetching article content...");
        this.screen.render();
        content = await this.fetchArticleContent(article.url);
      }
      this.updateStatusBar("Generating AI summary...");
      this.screen.render();
      const { summary, tags } = await this.generateAISummary(content, {
        title: article.title,
        author: article.author,
        url: article.url
      }, contentType);
      this.currentAISummary = { summary, tags, articleId: article.id };
      this.displaySummary(article, summary, tags);
      this.updateStatusBar("AI summary generated successfully");
      setTimeout(() => this.updateStatusBar(), 3000);
      if (!article.read && article.id) {
        const db = database["db"];
        if (db) {
          db.prepare("UPDATE articles SET read = 1 WHERE id = ?").run(article.id);
          article.read = 1;
          const items = this.articles.map((a) => this.formatArticleListItem(a));
          this.articleList.setItems(items);
          this.articleList.select(this.selectedArticleIndex);
          this.loadFeeds();
          const feedItems = this.feeds.map((f) => this.formatFeedListItem(f));
          this.feedList.setItems(feedItems);
          this.feedList.select(this.selectedFeedIndex);
          this.displaySummary(article, summary, tags);
        }
      }
      this.screen.render();
    } catch (error) {
      this.updateStatusBar(`Error: ${error.message}`);
      setTimeout(() => this.updateStatusBar(), 5000);
    }
  }
  isYouTubeUrl(url) {
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
    return youtubeRegex.test(url);
  }
  extractYouTubeVideoId(url) {
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  }
  escapeShellArg(arg) {
    return arg.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/!/g, "\\!");
  }
  async fetchYouTubeTranscript(url) {
    const tempDir = join3(tmpdir(), "fressh");
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }
    try {
      try {
        await execAsync("which yt-dlp", { timeout: 5000 });
      } catch {
        throw new Error("yt-dlp not installed. Run: brew install yt-dlp");
      }
      await mkdir(tempDir, { recursive: true });
      const outputPath = join3(tempDir, `transcript-${videoId}`);
      const escapedOutput = this.escapeShellArg(outputPath);
      const escapedUrl = this.escapeShellArg(url);
      const command = `yt-dlp --write-auto-sub --skip-download --sub-format vtt --output "${escapedOutput}" "${escapedUrl}"`;
      const { stderr } = await execAsync(command, { timeout: 60000 });
      if (stderr && stderr.toLowerCase().includes("no subtitles")) {
        throw new Error("No transcript available for this video");
      }
      let transcriptText;
      const vttPathEn = `${outputPath}.en.vtt`;
      const vttPath = `${outputPath}.vtt`;
      try {
        transcriptText = await readFile(vttPathEn, "utf-8");
        await unlink(vttPathEn).catch(() => {});
      } catch {
        transcriptText = await readFile(vttPath, "utf-8");
        await unlink(vttPath).catch(() => {});
      }
      return this.cleanTranscript(transcriptText);
    } catch (error) {
      if (error.message?.includes("No transcript available")) {
        throw error;
      }
      if (error.message?.includes("yt-dlp not installed")) {
        throw error;
      }
      if (error.code === "ENOENT") {
        throw new Error("No transcript available for this video");
      }
      throw new Error(`Failed to download transcript: ${error.message}`);
    }
  }
  cleanTranscript(text) {
    const lines = text.split(`
`);
    const transcriptLines = [];
    for (let i = 0;i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "" || line.startsWith("WEBVTT") || line.startsWith("Kind:") || line.startsWith("Language:") || line.match(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/)) {
        continue;
      }
      const cleanedLine = line.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "").replace(/<c>/g, "").replace(/<\/c>/g, "").trim();
      if (cleanedLine.length > 0) {
        transcriptLines.push(cleanedLine);
      }
    }
    return transcriptLines.join(" ").replace(/\s+/g, " ").trim();
  }
  async fetchArticleContent(url) {
    try {
      const response = await axios4.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
      });
      const $ = cheerio3.load(response.data);
      $("script, style, nav, footer, header, iframe, noscript").remove();
      const contentSelectors = [
        "article",
        '[role="main"]',
        "main",
        ".post-content",
        ".article-content",
        ".entry-content",
        ".content"
      ];
      let content = "";
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }
      if (!content) {
        content = $("body").text();
      }
      content = content.replace(/\s+/g, " ").replace(/\n+/g, `
`).trim();
      return content;
    } catch (error) {
      throw new Error(`Failed to fetch article: ${error.message}`);
    }
  }
  async generateAISummary(content, metadata, contentType = "article") {
    const tempDir = join3(tmpdir(), "fressh");
    const tempFile = join3(tempDir, `prompt-${Date.now()}.txt`);
    try {
      await mkdir(tempDir, { recursive: true });
      const words = content.split(/\s+/);
      const maxWords = contentType === "video" ? 1e4 : 15000;
      const truncated = words.length > maxWords;
      const contentText = truncated ? words.slice(0, maxWords).join(" ") + `

[... content truncated ...]` : content;
      let prompt;
      if (contentType === "video") {
        prompt = `You are summarizing a YouTube video transcript.

${metadata.title ? `Video Title: ${metadata.title}` : ""}
${metadata.author ? `Channel: ${metadata.author}` : ""}
${metadata.url ? `URL: ${metadata.url}` : ""}
Transcript Word Count: ${words.length}${truncated ? ` (truncated to ${maxWords} words)` : ""}

Transcript:
${contentText}

Please provide:
1. A concise summary (2-3 paragraphs) of the video content
2. 2-3 relevant subject tags (single words or short phrases, lowercase, like 'technology', 'programming', 'tutorial')

Format your response exactly like this:
SUMMARY:
[your summary here]

TAGS:
tag1, tag2, tag3`;
      } else {
        prompt = `You are summarizing an article.

${metadata.title ? `Article Title: ${metadata.title}` : ""}
${metadata.author ? `Author: ${metadata.author}` : ""}
${metadata.url ? `URL: ${metadata.url}` : ""}
Content Word Count: ${words.length}${truncated ? ` (truncated to ${maxWords} words)` : ""}

Article Content:
${contentText}

Please provide:
1. A concise summary (2-4 paragraphs) of the article content
2. 2-3 relevant subject tags (single words or short phrases, lowercase, like 'technology', 'personal-finance', 'productivity')

Format your response exactly like this:
SUMMARY:
[your summary here]

TAGS:
tag1, tag2, tag3`;
      }
      await writeFile(tempFile, prompt, "utf-8");
      const claudeCodePath = process.env.CLAUDE_CODE_PATH || "claude";
      const command = `${claudeCodePath} < "${tempFile}"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });
      if (stderr && !stderr.includes("Success")) {
        console.warn("⚠️  Claude Code stderr:", stderr);
      }
      const response = this.cleanAIResponse(stdout);
      return this.parseAISummaryResponse(response);
    } catch (error) {
      if (error.code === "ETIMEDOUT" || error.killed && error.signal === "SIGTERM") {
        throw new Error("AI summary timed out after 5 minutes");
      }
      const output = error.stdout || error.stderr || "";
      if (output.includes("You've hit your limit")) {
        const resetMatch = output.match(/resets\s+(.+?)(\n|$)/);
        const resetTime = resetMatch ? resetMatch[1].trim() : "later today";
        throw new Error(`Claude Code rate limit reached (resets ${resetTime})`);
      }
      throw new Error(`AI summary failed: ${error.message}`);
    } finally {
      try {
        await unlink(tempFile);
      } catch {}
    }
  }
  cleanAIResponse(output) {
    let cleaned = output.trim();
    cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, "");
    const lines = cleaned.split(`
`);
    const contentLines = [];
    for (const line of lines) {
      if (line.startsWith("claude>") || line.startsWith("$") || line.startsWith("[") || line.match(/^\s*✓/) || line.match(/^\s*›/)) {
        continue;
      }
      contentLines.push(line);
    }
    return contentLines.join(`
`).trim();
  }
  parseAISummaryResponse(response) {
    try {
      const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)\s*TAGS:/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : response;
      const tagsMatch = response.match(/TAGS:\s*(.+)$/im);
      const tags = tagsMatch ? tagsMatch[1].split(",").map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-")).filter((tag) => tag.length > 0) : [];
      return { summary, tags };
    } catch (error) {
      return {
        summary: response.trim(),
        tags: []
      };
    }
  }
  displaySummary(article, summary, tags) {
    const publishedDate = article.published_at ? new Date(article.published_at).toLocaleDateString() + " " + new Date(article.published_at).toLocaleTimeString() : "Unknown date";
    const title = (article.title || "Untitled").replace(/[^\x20-\x7E]/g, "");
    const feed = (article.feed_title || "Unknown").replace(/[^\x20-\x7E]/g, "");
    const author = (article.author || "Unknown").replace(/[^\x20-\x7E]/g, "");
    const tagsDisplay = tags.length > 0 ? tags.join(", ") : "none";
    const content = `{bold}${title}{/bold}

{cyan-fg}Feed:{/cyan-fg} ${feed}
{cyan-fg}Author:{/cyan-fg} ${author}
{cyan-fg}Published:{/cyan-fg} ${publishedDate}
{cyan-fg}URL:{/cyan-fg} ${article.url || "No URL"}
{cyan-fg}Status:{/cyan-fg} ${article.read ? "Read" : "Unread"} ${article.starred ? "[STARRED]" : ""}
{cyan-fg}Tags:{/cyan-fg} ${tagsDisplay}

========================================
{yellow-fg}AI SUMMARY{/yellow-fg}
========================================

${summary}`;
    this.articleDetail.setContent(content);
    this.articleDetail.setScrollPerc(0);
  }
  getHelpContent() {
    return `
{bold}{cyan-fg}fressh - RSS Article Viewer - Keyboard Shortcuts{/cyan-fg}{/bold}

{yellow-fg}Layout{/yellow-fg}
  Left Pane     Feed list (select a feed to view its articles)
  Middle Pane   Article list for selected feed
  Right Pane    Article details
  Tab           Switch between Feeds and Articles pane

{yellow-fg}Navigation{/yellow-fg}
  j, Down       Move down one item
  k, Up         Move up one item
  PageDown/C-f  Jump down one page (10 items)
  PageUp/C-b    Jump up one page (10 items)
  Mouse         Click to select items

{yellow-fg}Search{/yellow-fg}
  /             Search articles (title, content, summary)
  ESC           Clear search and return to normal view
                Search works within the current feed
                (searches all feeds when "All" is selected)

{yellow-fg}Reading Articles{/yellow-fg}
  Enter         Open article in browser (marks as read)
  I             Generate AI summary of article (marks as read)
  C             Copy article content to clipboard (pbcopy)
  Space         Toggle read/unread status
  S             Toggle starred status

{yellow-fg}Feed Management{/yellow-fg}
  M             Mark all articles from current feed as read
  A             Mark ALL articles as read (all feeds)
  Delete/Bksp   Unsubscribe from the current feed
                (removes feed and all its articles)

{yellow-fg}View Options{/yellow-fg}
  T             Toggle filter (Unread Only / All Articles)
  R             Refresh feed and article lists

{yellow-fg}General{/yellow-fg}
  ?             Show this help screen
  Q, Escape     Quit the application

{yellow-fg}Status Indicators{/yellow-fg}
  *             Unread article
  S             Starred article
  (no marker)   Read article
  (number)      Unread count next to feed name

{yellow-fg}Tips{/yellow-fg}
  - Select "All" feed to see articles from all feeds
  - Unread counts update automatically as you read
  - Use / to quickly clear all articles from a noisy feed
  - Delete key unsubscribes from the selected feed

{cyan-fg}Press ? or ESC to close this help screen{/cyan-fg}
`;
  }
  start() {
    this.loadFeeds();
    const feedItems = this.feeds.map((f) => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    if (this.feeds.length > 0) {
      this.feedList.select(0);
      this.selectedFeedIndex = 0;
      this.loadArticlesForFeed();
    }
    this.updateStatusBar();
    this.articleList.focus();
    this.screen.render();
  }
}
var execAsync;
var init_tui = __esm(() => {
  init_database();
  execAsync = promisify(exec);
});

// src/index.ts
import { Command } from "commander";

// src/config.ts
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var DEFAULT_CONFIG = {
  databasePath: "~/Library/Application Support/fressh/articles.db",
  logLevel: "info",
  fetchInterval: 900,
  maxConcurrentFetches: 5,
  httpTimeout: 30000,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  excludeYouTubeShorts: false,
  maxArticleAgeDays: 30,
  allowInsecureCertificates: false
};
function expandPath(path) {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
function loadConfig() {
  let config = { ...DEFAULT_CONFIG };
  const configPath = expandPath("~/.fressh/config.json");
  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      config = { ...config, ...fileConfig };
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error);
    }
  }
  if (process.env.FRESSH_DB_PATH) {
    config.databasePath = process.env.FRESSH_DB_PATH;
  }
  if (process.env.FRESSH_LOG_LEVEL) {
    config.logLevel = process.env.FRESSH_LOG_LEVEL;
  }
  if (process.env.FRESSH_FETCH_INTERVAL) {
    config.fetchInterval = parseInt(process.env.FRESSH_FETCH_INTERVAL, 10);
  }
  config.databasePath = expandPath(config.databasePath);
  return config;
}

// src/cli.ts
init_logger();
init_database();

// src/opml.ts
init_database();
init_logger();
import { readFileSync as readFileSync2, writeFileSync } from "fs";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
function importOpml(filePath) {
  try {
    const content = readFileSync2(filePath, "utf-8");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const opml = parser.parse(content);
    if (!opml.opml || !opml.opml.body) {
      throw new Error("Invalid OPML structure");
    }
    const feeds = [];
    extractFeeds(opml.opml.body.outline, feeds);
    logger.info(`Found ${feeds.length} feeds in OPML`);
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    for (const feed of feeds) {
      try {
        const existing = database.getFeed(feed.url);
        if (existing) {
          skipped++;
          logger.debug(`Skipping existing feed: ${feed.url}`);
          continue;
        }
        database.addFeed({
          url: feed.url,
          title: feed.title,
          site_url: feed.siteUrl
        });
        imported++;
        logger.debug(`Imported: ${feed.title || feed.url}`);
      } catch (error) {
        errors++;
        logger.error(`Error importing ${feed.url}:`, error);
      }
    }
    return { imported, skipped, errors };
  } catch (error) {
    logger.error("Error parsing OPML:", error);
    throw error;
  }
}
function extractFeeds(outline, feeds) {
  const outlines = Array.isArray(outline) ? outline : [outline];
  for (const item of outlines) {
    if (item["@_xmlUrl"]) {
      feeds.push({
        url: item["@_xmlUrl"],
        title: item["@_title"] || item["@_text"],
        siteUrl: item["@_htmlUrl"]
      });
    }
    if (item.outline) {
      extractFeeds(item.outline, feeds);
    }
  }
}
function exportOpml(outputPath) {
  const feeds = database.getAllFeeds();
  const outlines = feeds.map((feed) => ({
    "@_type": "rss",
    "@_text": feed.title || feed.url,
    "@_title": feed.title || feed.url,
    "@_xmlUrl": feed.url,
    "@_htmlUrl": feed.site_url || ""
  }));
  const opml = {
    opml: {
      head: {
        title: "RSS Daemon Subscriptions",
        dateCreated: new Date().toUTCString()
      },
      body: {
        outline: outlines
      }
    }
  };
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
` + builder.build(opml);
  writeFileSync(outputPath, xml, "utf-8");
  logger.info(`Exported ${feeds.length} feeds to ${outputPath}`);
  return feeds.length;
}

// src/cli.ts
init_fetcher();
init_parser();
import { existsSync as existsSync4 } from "fs";
import { resolve } from "path";
async function handleImport(file) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  const filePath = resolve(file);
  if (!existsSync4(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  database.initialize(config.databasePath);
  logger.info(`Importing feeds from ${filePath}...`);
  const result = importOpml(filePath);
  console.log(`
✅ Import complete:`);
  console.log(`   Imported: ${result.imported}`);
  console.log(`   Skipped:  ${result.skipped} (already exist)`);
  console.log(`   Errors:   ${result.errors}`);
  database.close();
}
async function handleExport(file) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const outputPath = file ? resolve(file) : resolve("subscriptions.opml");
  const count = exportOpml(outputPath);
  console.log(`
✅ Exported ${count} feeds to ${outputPath}`);
  database.close();
}
async function handleAdd(url) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  let feedUrl = url;
  if (url.includes("reddit.com/r/") && !url.endsWith(".rss")) {
    const redditRss = convertRedditToRss(url);
    if (redditRss) {
      console.log("\uD83D\uDD34 Reddit subreddit detected, converting to RSS feed URL...");
      feedUrl = redditRss;
      console.log(`✓ Using: ${feedUrl}
`);
    }
  } else if (url.includes("youtube.com") && !url.includes("/feeds/videos.xml")) {
    console.log("\uD83C\uDFA5 YouTube channel detected, converting to RSS feed URL...");
    const channelId = await getYouTubeChannelId(url);
    if (!channelId) {
      console.log("❌ Could not extract channel ID from this URL");
      console.log("   Make sure it's a valid YouTube channel URL");
      database.close();
      process.exit(1);
    }
    feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log(`✓ Using: ${feedUrl}
`);
  }
  const existingConverted = database.getFeed(feedUrl);
  const existingOriginal = url !== feedUrl ? database.getFeed(url) : null;
  const existing = existingConverted || existingOriginal;
  if (existing) {
    console.log(`
⚠️  Feed already exists!`);
    console.log(`   Title: ${existing.title || "Unknown"}`);
    console.log(`   URL: ${existing.url}`);
    if (existing.last_fetch) {
      const lastFetch = new Date(existing.last_fetch);
      console.log(`   Last fetched: ${lastFetch.toLocaleString()}`);
    }
    console.log(`
\uD83D\uDCA1 This feed is already being tracked by the daemon`);
    database.close();
    return;
  }
  console.log(`Checking for duplicates... ✓ Not found`);
  console.log(`Validating feed...`);
  const fetchResult = await fetchFeed(feedUrl, {
    timeout: config.httpTimeout,
    userAgent: config.userAgent,
    allowInsecureCertificates: config.allowInsecureCertificates
  });
  if (!fetchResult) {
    console.log("❌ Failed to fetch feed");
    console.log("   This feed may be unavailable or blocking requests");
    database.close();
    process.exit(1);
  }
  const parsed = await parseFeed(fetchResult.data, config);
  if (!parsed) {
    console.log("❌ Failed to parse feed");
    console.log("   This may not be a valid RSS/Atom feed");
    database.close();
    process.exit(1);
  }
  database.addFeed({
    url: feedUrl,
    title: parsed.title,
    site_url: parsed.siteUrl
  });
  console.log(`
✅ Added feed: ${parsed.title || feedUrl}`);
  console.log(`   URL: ${feedUrl}`);
  console.log(`   Articles available: ${parsed.articles.length}`);
  console.log(`
\uD83D\uDCA1 The daemon will fetch this feed automatically every 10 minutes`);
  database.close();
}
async function handleRemove(url) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const feed = database.getFeed(url);
  if (!feed) {
    console.log("❌ Feed not found");
    console.log(`
\uD83D\uDCA1 List all feeds with: ./rss list`);
    database.close();
    return;
  }
  database.removeFeed(url);
  console.log(`
✅ Removed feed: ${feed.title || url}`);
  console.log(`   URL: ${url}`);
  database.close();
}
async function handleList() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const feeds = database.getAllFeeds();
  if (feeds.length === 0) {
    console.log("No feeds found");
    console.log(`
\uD83D\uDCA1 Add feeds with: ./rss add <url>`);
    database.close();
    return;
  }
  console.log(`
\uD83D\uDCCB Feeds (${feeds.length} total)
`);
  for (const feed of feeds) {
    console.log(`• ${feed.title || "Untitled"}`);
    console.log(`  ${feed.url}`);
    if (feed.last_fetch) {
      const lastFetch = new Date(feed.last_fetch);
      console.log(`  Last fetched: ${lastFetch.toLocaleString()}`);
    }
    console.log("");
  }
  database.close();
}
async function handleStats() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const stats = database.getStats();
  console.log(`
\uD83D\uDCCA fressh Statistics
`);
  console.log(`Feeds:          ${stats.enabledFeeds} enabled / ${stats.totalFeeds} total`);
  console.log(`Articles:       ${stats.totalArticles.toLocaleString()}`);
  console.log(`Unread:         ${stats.unreadArticles.toLocaleString()}`);
  console.log(`Starred:        ${stats.starredArticles.toLocaleString()}`);
  database.close();
}
async function handleMarkAllRead() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  database.markAllAsRead();
  console.log(`
✅ Marked all articles as read`);
  database.close();
}
async function handleMarkFeedRead(url) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const feed = database.getFeed(url);
  if (!feed) {
    console.log("❌ Feed not found");
    console.log(`
\uD83D\uDCA1 List all feeds with: fressh list`);
    database.close();
    return;
  }
  const count = database.markFeedAsRead(url);
  console.log(`
✅ Marked ${count} articles as read from: ${feed.title || url}`);
  database.close();
}
async function handleCleanup(days = 30) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const deleted = database.deleteOldArticles(days);
  console.log(`
✅ Deleted ${deleted} old articles (older than ${days} days)`);
  database.close();
}
async function handleDeleteShorts() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const deleted = database.deleteYouTubeShorts();
  console.log(`
✅ Deleted ${deleted} YouTube Shorts from the database`);
  database.close();
}
async function handleRemoveDuplicates() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  console.log("Removing duplicate URLs...");
  const deleted = database.removeDuplicateUrls();
  console.log(`
✅ Removed ${deleted} duplicate articles`);
  database.close();
}
async function handleRebuildSearchIndex() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  console.log("Rebuilding search index...");
  database.rebuildSearchIndex();
  console.log(`
✅ Search index rebuilt successfully`);
  database.close();
}
async function handleRefresh() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  logger.enableFileLogging();
  database.initialize(config.databasePath);
  console.log("Refreshing all feeds...");
  const { Daemon: Daemon2 } = await Promise.resolve().then(() => (init_daemon(), exports_daemon));
  const daemon = new Daemon2(config);
  await daemon.refresh();
  database.close();
}
async function handleStart() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  const { Daemon: Daemon2 } = await Promise.resolve().then(() => (init_daemon(), exports_daemon));
  const daemon = new Daemon2(config);
  await daemon.start();
}
async function handleLogs(options) {
  const { homedir: homedir3 } = await import("os");
  const { join: join4 } = await import("path");
  const { existsSync: existsSync5, readFileSync: readFileSync3 } = await import("fs");
  const { spawn: spawn2 } = await import("child_process");
  const logFile = join4(homedir3(), "Library", "Logs", "fressh", "daemon.log");
  if (!existsSync5(logFile)) {
    console.log("❌ Log file not found at:", logFile);
    console.log(`
The daemon may not have been started yet, or file logging is not enabled.`);
    console.log("Start the daemon with: node dist/index.js start");
    return;
  }
  if (options.follow) {
    console.log(`\uD83D\uDCCB Following log file (Ctrl+C to stop):
`);
    const tail = spawn2("tail", ["-f", logFile], { stdio: "inherit" });
    process.on("SIGINT", () => {
      tail.kill();
      process.exit(0);
    });
  } else {
    const lines = options.lines || 50;
    console.log(`\uD83D\uDCCB Last ${lines} lines of daemon.log:
`);
    const content = readFileSync3(logFile, "utf-8");
    const allLines = content.split(`
`).filter((line) => line.trim());
    const lastLines = allLines.slice(-lines);
    lastLines.forEach((line) => console.log(line));
    console.log(`
\uD83D\uDCC1 Log file: ${logFile}`);
    console.log(`\uD83D\uDCA1 Use --follow to watch logs in real-time`);
  }
}
async function getYouTubeChannelId(url) {
  try {
    const response = await fetchFeed(url, { timeout: 1e4, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
    if (!response)
      return null;
    const match = response.data.match(/channel_id=([a-zA-Z0-9_-]{24})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
function convertRedditToRss(url) {
  const match = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)\/?$/);
  if (match) {
    return `https://www.reddit.com/r/${match[1]}/top/.rss?t=month&limit=10`;
  }
  return null;
}
async function handleView() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const { ArticleViewer: ArticleViewer2 } = await Promise.resolve().then(() => (init_tui(), exports_tui));
  const viewer = new ArticleViewer2;
  viewer.start();
}
async function handleRead(options) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  database.initialize(config.databasePath);
  const limit = options.limit || 20;
  const articles = options.unread ? database.getUnreadArticles(limit) : (() => {
    const db = database["db"];
    if (!db)
      return [];
    return db.prepare("SELECT a.*, f.title as feed_title FROM articles a LEFT JOIN feeds f ON a.feed_id = f.id ORDER BY a.published_at DESC LIMIT ?").all(limit);
  })();
  if (articles.length === 0) {
    console.log(`
\uD83D\uDCED No articles found`);
    console.log(`
\uD83D\uDCA1 The daemon needs to fetch feeds first: fressh start`);
    database.close();
    return;
  }
  console.log(`
\uD83D\uDCF0 ${options.unread ? "Unread" : "Recent"} Articles (${articles.length} shown)
`);
  for (let i = 0;i < articles.length; i++) {
    const article = articles[i];
    const readIndicator = article.read ? "  " : "● ";
    const starIndicator = article.starred ? "⭐ " : "";
    console.log(`${i + 1}. ${readIndicator}${starIndicator}${article.title || "Untitled"}`);
    console.log(`   Feed: ${article.feed_title || "Unknown"}`);
    if (article.url) {
      console.log(`   URL: ${article.url}`);
    }
    if (article.published_at) {
      const date = new Date(article.published_at);
      console.log(`   Published: ${date.toLocaleString()}`);
    }
    console.log("");
  }
  console.log(`\uD83D\uDCA1 Use 'fressh view' for an interactive interface`);
  database.close();
}
async function handleTest(url) {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  let testUrl = url;
  let isYouTubeChannelPage = false;
  let isRedditSubreddit = false;
  if (url.includes("reddit.com/r/") && !url.endsWith(".rss")) {
    const redditRss = convertRedditToRss(url);
    if (redditRss) {
      isRedditSubreddit = true;
      console.log(`
\uD83D\uDD34 Reddit subreddit detected: ${url}
`);
      console.log("Converting to RSS feed URL...");
      testUrl = redditRss;
      console.log(`
✅ Correct RSS feed URL:
   ${testUrl}
`);
    }
  } else if (url.includes("youtube.com") && !url.includes("/feeds/videos.xml")) {
    isYouTubeChannelPage = true;
    console.log(`
\uD83C\uDFA5 YouTube channel detected: ${url}
`);
    console.log("Converting to RSS feed URL...");
    const channelId = await getYouTubeChannelId(url);
    if (!channelId) {
      console.log("❌ Could not extract channel ID from this URL");
      console.log("   Make sure it's a valid YouTube channel URL");
      console.log(`
\uD83D\uDCA1 YouTube feed URLs should be in this format:`);
      console.log("   https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID");
      process.exit(1);
    }
    testUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log(`
✅ Correct RSS feed URL:
   ${testUrl}
`);
  }
  console.log(`
\uD83E\uDDEA Testing feed: ${testUrl}
`);
  console.log("Fetching...");
  const fetchResult = await fetchFeed(testUrl, {
    timeout: config.httpTimeout,
    userAgent: config.userAgent,
    allowInsecureCertificates: config.allowInsecureCertificates
  });
  if (!fetchResult) {
    console.log("❌ Failed to fetch feed");
    console.log("   This feed may be unavailable or blocking requests");
    if (isYouTubeChannelPage) {
      console.log(`
\uD83D\uDCA1 For YouTube feeds, use:`);
      console.log(`   ${testUrl}`);
    }
    process.exit(1);
  }
  console.log(`✓ Fetched successfully (${fetchResult.data.length} bytes)`);
  console.log(`  Status: ${fetchResult.status}`);
  if (fetchResult.etag)
    console.log(`  ETag: ${fetchResult.etag}`);
  if (fetchResult.lastModified)
    console.log(`  Last-Modified: ${fetchResult.lastModified}`);
  console.log("");
  console.log("Parsing...");
  const parsed = await parseFeed(fetchResult.data, config);
  if (!parsed) {
    console.log("❌ Failed to parse feed");
    console.log("   This may not be a valid RSS/Atom feed");
    if (isYouTubeChannelPage) {
      console.log(`
\uD83D\uDCA1 The correct YouTube feed URL is:`);
      console.log(`   ${testUrl}`);
    } else if (isRedditSubreddit) {
      console.log(`
\uD83D\uDCA1 The correct Reddit feed URL is:`);
      console.log(`   ${testUrl}`);
    }
    process.exit(1);
  }
  console.log(`✓ Parsed successfully`);
  console.log(`  Title: ${parsed.title || "unknown"}`);
  console.log(`  Site URL: ${parsed.siteUrl || "unknown"}`);
  console.log(`  Articles found: ${parsed.articles.length}`);
  console.log("");
  if (parsed.articles.length > 0) {
    console.log("Most recent articles:");
    const recent = parsed.articles.slice(0, 5);
    for (let i = 0;i < recent.length; i++) {
      const article = recent[i];
      console.log(`  ${i + 1}. ${article.title || "Untitled"}`);
      console.log(`     ${article.url || "no url"}`);
      console.log(`     ${article.published_at || "no date"}`);
      if (i < recent.length - 1)
        console.log("");
    }
  } else {
    console.log("⚠️  No articles found in feed (may be empty)");
  }
  console.log(`
✅ Feed is valid and can be added!`);
  if (isYouTubeChannelPage || isRedditSubreddit) {
    console.log(`
\uD83D\uDCDD Use this URL in your OPML:`);
    console.log(`   ${testUrl}`);
  }
}

// src/index.ts
var program = new Command;
program.name("fressh").description("Fresh RSS - Lightweight RSS daemon and TUI reader for macOS").version("1.0.0");
program.command("start").description("Start the RSS daemon").action(handleStart);
program.command("import <file>").description("Import feeds from OPML file").action(handleImport);
program.command("export [file]").description("Export feeds to OPML file (defaults to subscriptions.opml)").action(handleExport);
program.command("add <url>").description("Add a single feed").action(handleAdd);
program.command("remove <url>").description("Remove a feed").action(handleRemove);
program.command("stats").description("Show feed and article statistics").action(handleStats);
program.command("mark-all-read").description("Mark all articles as read").action(handleMarkAllRead);
program.command("mark-feed-read <url>").description("Mark all articles from a specific feed as read").action(handleMarkFeedRead);
program.command("cleanup").description("Delete old read articles").option("-d, --days <days>", "Delete articles older than N days", "30").action((options) => handleCleanup(parseInt(options.days, 10)));
program.command("delete-shorts").description("Delete all YouTube Shorts from the database").action(handleDeleteShorts);
program.command("remove-duplicates").description("Remove duplicate URLs from the database").action(handleRemoveDuplicates);
program.command("refresh").description("Force refresh all feeds").action(handleRefresh);
program.command("test <url>").description("Test if an RSS feed is valid").action(handleTest);
program.command("list").description("List all feeds").action(handleList);
program.command("logs").description("View daemon logs").option("-f, --follow", "Follow log output (like tail -f)").option("-n, --lines <number>", "Number of lines to show", "50").action((options) => handleLogs({
  follow: options.follow,
  lines: parseInt(options.lines, 10)
}));
program.command("view").description("Interactive TUI for browsing articles").action(handleView);
program.command("read").description("List recent articles in the terminal").option("-l, --limit <number>", "Number of articles to show", "20").option("-u, --unread", "Show only unread articles", true).action((options) => handleRead({
  limit: parseInt(options.limit, 10),
  unread: options.unread
}));
program.command("rebuild-search").description("Rebuild the full-text search index").action(handleRebuildSearchIndex);
program.parse();

//# debugId=18A786EADFBE973C64756E2164756E21
//# sourceMappingURL=index.js.map
