export const CREATE_SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )
`;

export const CREATE_FEEDS = `
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
  )
`;

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

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(read)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_guid ON articles(guid)`,
];

export const CREATE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`;
