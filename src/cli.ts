import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { database } from './database.js';
import { importOpml, exportOpml } from './opml.js';
import { fetchFeed } from './fetcher.js';
import { parseFeed } from './parser.js';
import { COMPACT_LOGO } from './logo.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

export async function handleImport(file: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  database.initialize(config.databasePath);

  logger.info(`Importing feeds from ${filePath}...`);
  const result = importOpml(filePath);

  console.log(`\n✅ Import complete:`);
  console.log(`   Imported: ${result.imported}`);
  console.log(`   Skipped:  ${result.skipped} (already exist)`);
  console.log(`   Errors:   ${result.errors}`);

  database.close();
}

export async function handleExport(file?: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const outputPath = file ? resolve(file) : resolve('subscriptions.opml');
  const count = exportOpml(outputPath);

  console.log(`\n✅ Exported ${count} feeds to ${outputPath}`);

  database.close();
}

export async function handleAdd(url: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  let feedUrl = url;

  // Check if this is a Reddit subreddit URL (not already an RSS feed)
  if (url.includes('reddit.com/r/') && !url.endsWith('.rss')) {
    const redditRss = convertRedditToRss(url);
    if (redditRss) {
      console.log('🔴 Reddit subreddit detected, converting to RSS feed URL...');
      feedUrl = redditRss;
      console.log(`✓ Using: ${feedUrl}\n`);
    }
  }
  // Check if this is a YouTube channel page URL (not already a feed URL)
  else if (url.includes('youtube.com') && !url.includes('/feeds/videos.xml')) {
    console.log('🎥 YouTube channel detected, converting to RSS feed URL...');

    const channelId = await getYouTubeChannelId(url);

    if (!channelId) {
      console.log('❌ Could not extract channel ID from this URL');
      console.log('   Make sure it\'s a valid YouTube channel URL');
      database.close();
      process.exit(1);
    }

    feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log(`✓ Using: ${feedUrl}\n`);
  }

  // Check if feed already exists (check both original URL and converted URL)
  const existingConverted = database.getFeed(feedUrl);
  const existingOriginal = url !== feedUrl ? database.getFeed(url) : null;

  const existing = existingConverted || existingOriginal;

  if (existing) {
    console.log(`\n⚠️  Feed already exists!`);
    console.log(`   Title: ${existing.title || 'Unknown'}`);
    console.log(`   URL: ${existing.url}`);
    if (existing.last_fetch) {
      const lastFetch = new Date(existing.last_fetch);
      console.log(`   Last fetched: ${lastFetch.toLocaleString()}`);
    }
    console.log(`\n💡 This feed is already being tracked by the daemon`);
    database.close();
    return;
  }

  // Try to fetch and parse the feed to validate it
  console.log(`Checking for duplicates... ✓ Not found`);
  console.log(`Validating feed...`);
  const fetchResult = await fetchFeed(feedUrl, {
    timeout: config.httpTimeout,
    userAgent: config.userAgent,
    allowInsecureCertificates: config.allowInsecureCertificates,
  });

  if (!fetchResult) {
    console.log('❌ Failed to fetch feed');
    console.log('   This feed may be unavailable or blocking requests');
    database.close();
    process.exit(1);
  }

  const parsed = await parseFeed(fetchResult.data, config);
  if (!parsed) {
    console.log('❌ Failed to parse feed');
    console.log('   This may not be a valid RSS/Atom feed');
    database.close();
    process.exit(1);
  }

  // Add feed to database
  database.addFeed({
    url: feedUrl,
    title: parsed.title,
    site_url: parsed.siteUrl,
  });

  console.log(`\n✅ Added feed: ${parsed.title || feedUrl}`);
  console.log(`   URL: ${feedUrl}`);
  console.log(`   Articles available: ${parsed.articles.length}`);
  console.log(`\n💡 The daemon will fetch this feed automatically every 10 minutes`);

  database.close();
}

export async function handleRemove(url: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const feed = database.getFeed(url);
  if (!feed) {
    console.log('❌ Feed not found');
    console.log('\n💡 List all feeds with: ./rss list');
    database.close();
    return;
  }

  database.removeFeed(url);
  console.log(`\n✅ Removed feed: ${feed.title || url}`);
  console.log(`   URL: ${url}`);

  database.close();
}

export async function handleList(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const feeds = database.getAllFeeds();

  if (feeds.length === 0) {
    console.log('No feeds found');
    console.log('\n💡 Add feeds with: ./rss add <url>');
    database.close();
    return;
  }

  console.log(`\n📋 Feeds (${feeds.length} total)\n`);

  for (const feed of feeds) {
    console.log(`• ${feed.title || 'Untitled'}`);
    console.log(`  ${feed.url}`);
    if (feed.last_fetch) {
      const lastFetch = new Date(feed.last_fetch);
      console.log(`  Last fetched: ${lastFetch.toLocaleString()}`);
    }
    console.log('');
  }

  database.close();
}

export async function handleStats(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const stats = database.getStats();

  console.log('\n📊 fressh Statistics\n');
  console.log(`Feeds:          ${stats.enabledFeeds} enabled / ${stats.totalFeeds} total`);
  console.log(`Articles:       ${stats.totalArticles.toLocaleString()}`);
  console.log(`Unread:         ${stats.unreadArticles.toLocaleString()}`);
  console.log(`Starred:        ${stats.starredArticles.toLocaleString()}`);

  database.close();
}

export async function handleMarkAllRead(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  database.markAllAsRead();
  console.log('\n✅ Marked all articles as read');

  database.close();
}

export async function handleMarkFeedRead(url: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const feed = database.getFeed(url);
  if (!feed) {
    console.log('❌ Feed not found');
    console.log('\n💡 List all feeds with: fressh list');
    database.close();
    return;
  }

  const count = database.markFeedAsRead(url);
  console.log(`\n✅ Marked ${count} articles as read from: ${feed.title || url}`);

  database.close();
}

export async function handleCleanup(days: number = 30): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const deleted = database.deleteOldArticles(days);
  console.log(`\n✅ Deleted ${deleted} old articles (older than ${days} days)`);

  database.close();
}

export async function handleDeleteShorts(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const deleted = database.deleteYouTubeShorts();
  console.log(`\n✅ Deleted ${deleted} YouTube Shorts from the database`);

  database.close();
}

export async function handleRemoveDuplicates(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  console.log('Removing duplicate URLs...');
  const deleted = database.removeDuplicateUrls();
  console.log(`\n✅ Removed ${deleted} duplicate articles`);

  database.close();
}

export async function handleRebuildSearchIndex(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  console.log('Rebuilding search index...');
  database.rebuildSearchIndex();
  console.log('\n✅ Search index rebuilt successfully');

  database.close();
}

export async function handleRefresh(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);
  logger.enableFileLogging(); // Enable file logging for refresh too

  database.initialize(config.databasePath);

  console.log('Refreshing all feeds...');

  const { Daemon } = await import('./daemon.js');
  const daemon = new Daemon(config);

  // Use the daemon's refresh logic
  await daemon.refresh();

  database.close();
}

export async function handleStart(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  const { Daemon } = await import('./daemon.js');
  const daemon = new Daemon(config);

  await daemon.start();
}

export async function handleLogs(options: { follow?: boolean; lines?: number }): Promise<void> {
  const { homedir } = await import('os');
  const { join } = await import('path');
  const { existsSync, readFileSync } = await import('fs');
  const { spawn } = await import('child_process');

  const logFile = join(homedir(), 'Library', 'Logs', 'fressh', 'daemon.log');

  if (!existsSync(logFile)) {
    console.log('❌ Log file not found at:', logFile);
    console.log('\nThe daemon may not have been started yet, or file logging is not enabled.');
    console.log('Start the daemon with: node dist/index.js start');
    return;
  }

  if (options.follow) {
    // Follow mode - tail -f
    console.log(`📋 Following log file (Ctrl+C to stop):\n`);
    const tail = spawn('tail', ['-f', logFile], { stdio: 'inherit' });

    process.on('SIGINT', () => {
      tail.kill();
      process.exit(0);
    });
  } else {
    // Show last N lines
    const lines = options.lines || 50;
    console.log(`📋 Last ${lines} lines of daemon.log:\n`);

    const content = readFileSync(logFile, 'utf-8');
    const allLines = content.split('\n').filter(line => line.trim());
    const lastLines = allLines.slice(-lines);

    lastLines.forEach(line => console.log(line));

    console.log(`\n📁 Log file: ${logFile}`);
    console.log(`💡 Use --follow to watch logs in real-time`);
  }
}

async function getYouTubeChannelId(url: string): Promise<string | null> {
  try {
    const response = await fetchFeed(url, { timeout: 10000, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    if (!response) return null;

    const match = response.data.match(/channel_id=([a-zA-Z0-9_-]{24})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function convertRedditToRss(url: string): string | null {
  // Match Reddit subreddit URLs
  const match = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)\/?$/);
  if (match) {
    // Use /top/.rss?t=month&limit=10 to get only the top 10 posts from this month
    // This reduces noise and shows only highly popular content
    return `https://www.reddit.com/r/${match[1]}/top/.rss?t=month&limit=10`;
  }
  return null;
}

export async function handleView(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const { ArticleViewer } = await import('./tui.js');
  const viewer = new ArticleViewer();
  viewer.start();
}

export async function handleRead(options: { limit?: number; unread?: boolean }): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  database.initialize(config.databasePath);

  const limit = options.limit || 20;
  const articles = options.unread
    ? database.getUnreadArticles(limit)
    : (() => {
        // Get all articles, not just unread
        // @ts-ignore - accessing private db
        const db = database['db'];
        if (!db) return [];
        return db.prepare('SELECT a.*, f.title as feed_title FROM articles a LEFT JOIN feeds f ON a.feed_id = f.id ORDER BY a.published_at DESC LIMIT ?').all(limit);
      })();

  if (articles.length === 0) {
    console.log('\n📭 No articles found');
    console.log('\n💡 The daemon needs to fetch feeds first: fressh start');
    database.close();
    return;
  }

  console.log(`\n📰 ${options.unread ? 'Unread' : 'Recent'} Articles (${articles.length} shown)\n`);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i] as any;
    const readIndicator = article.read ? '  ' : '● ';
    const starIndicator = article.starred ? '⭐ ' : '';

    console.log(`${i + 1}. ${readIndicator}${starIndicator}${article.title || 'Untitled'}`);
    console.log(`   Feed: ${article.feed_title || 'Unknown'}`);
    if (article.url) {
      console.log(`   URL: ${article.url}`);
    }
    if (article.published_at) {
      const date = new Date(article.published_at);
      console.log(`   Published: ${date.toLocaleString()}`);
    }
    console.log('');
  }

  console.log(`💡 Use 'fressh view' for an interactive interface`);

  database.close();
}

export async function handleTest(url: string): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  let testUrl = url;
  let isYouTubeChannelPage = false;
  let isRedditSubreddit = false;
  let shouldCopyToClipboard = false;

  // Check if this is a Reddit subreddit URL (not already an RSS feed)
  if (url.includes('reddit.com/r/') && !url.endsWith('.rss')) {
    const redditRss = convertRedditToRss(url);
    if (redditRss) {
      isRedditSubreddit = true;
      shouldCopyToClipboard = true;
      console.log(`\n🔴 Reddit subreddit detected: ${url}\n`);
      console.log('Converting to RSS feed URL...');
      testUrl = redditRss;
      console.log(`\n✅ Correct RSS feed URL:\n   ${testUrl}\n`);
    }
  }
  // Check if this is a YouTube channel page URL (not already a feed URL)
  else if (url.includes('youtube.com') && !url.includes('/feeds/videos.xml')) {
    isYouTubeChannelPage = true;
    shouldCopyToClipboard = true;
    console.log(`\n🎥 YouTube channel detected: ${url}\n`);
    console.log('Converting to RSS feed URL...');

    const channelId = await getYouTubeChannelId(url);

    if (!channelId) {
      console.log('❌ Could not extract channel ID from this URL');
      console.log('   Make sure it\'s a valid YouTube channel URL');
      console.log('\n💡 YouTube feed URLs should be in this format:');
      console.log('   https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID');
      process.exit(1);
    }

    testUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log(`\n✅ Correct RSS feed URL:\n   ${testUrl}\n`);
  }

  console.log(`\n🧪 Testing feed: ${testUrl}\n`);

  // Fetch the feed
  console.log('Fetching...');
  const fetchResult = await fetchFeed(testUrl, {
    timeout: config.httpTimeout,
    userAgent: config.userAgent,
    allowInsecureCertificates: config.allowInsecureCertificates,
  });

  if (!fetchResult) {
    console.log('❌ Failed to fetch feed');
    console.log('   This feed may be unavailable or blocking requests');
    if (isYouTubeChannelPage) {
      console.log('\n💡 For YouTube feeds, use:');
      console.log(`   ${testUrl}`);
    }
    process.exit(1);
  }

  console.log(`✓ Fetched successfully (${fetchResult.data.length} bytes)`);
  console.log(`  Status: ${fetchResult.status}`);
  if (fetchResult.etag) console.log(`  ETag: ${fetchResult.etag}`);
  if (fetchResult.lastModified) console.log(`  Last-Modified: ${fetchResult.lastModified}`);
  console.log('');

  // Parse the feed
  console.log('Parsing...');
  const parsed = await parseFeed(fetchResult.data, config);

  if (!parsed) {
    console.log('❌ Failed to parse feed');
    console.log('   This may not be a valid RSS/Atom feed');
    if (isYouTubeChannelPage) {
      console.log('\n💡 The correct YouTube feed URL is:');
      console.log(`   ${testUrl}`);
    } else if (isRedditSubreddit) {
      console.log('\n💡 The correct Reddit feed URL is:');
      console.log(`   ${testUrl}`);
    }
    process.exit(1);
  }

  console.log(`✓ Parsed successfully`);
  console.log(`  Title: ${parsed.title || 'unknown'}`);
  console.log(`  Site URL: ${parsed.siteUrl || 'unknown'}`);
  console.log(`  Articles found: ${parsed.articles.length}`);
  console.log('');

  if (parsed.articles.length > 0) {
    console.log('Most recent articles:');
    const recent = parsed.articles.slice(0, 5);
    for (let i = 0; i < recent.length; i++) {
      const article = recent[i];
      console.log(`  ${i + 1}. ${article.title || 'Untitled'}`);
      console.log(`     ${article.url || 'no url'}`);
      console.log(`     ${article.published_at || 'no date'}`);
      if (i < recent.length - 1) console.log('');
    }
  } else {
    console.log('⚠️  No articles found in feed (may be empty)');
  }

  console.log('\n✅ Feed is valid and can be added!');

  if (isYouTubeChannelPage || isRedditSubreddit) {
    console.log('\n📝 Use this URL in your OPML:');
    console.log(`   ${testUrl}`);
  }

  // Copy the actual feed URL to clipboard if it was converted
  if (shouldCopyToClipboard) {
    try {
      const { spawn } = await import('child_process');
      const pbcopy = spawn('pbcopy');
      pbcopy.stdin.write(testUrl);
      pbcopy.stdin.end();
      console.log('\n📋 Feed URL copied to clipboard!');
    } catch (error) {
      // Silent fail if clipboard copy doesn't work
    }
  }
}
