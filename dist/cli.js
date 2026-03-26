import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { database } from './database.js';
import { importOpml, exportOpml } from './opml.js';
import { fetchFeed } from './fetcher.js';
import { parseFeed } from './parser.js';
import { existsSync } from 'fs';
import { resolve } from 'path';
export async function handleImport(file) {
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
export async function handleExport(file) {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    const outputPath = file ? resolve(file) : resolve('subscriptions.opml');
    const count = exportOpml(outputPath);
    console.log(`\n✅ Exported ${count} feeds to ${outputPath}`);
    database.close();
}
export async function handleAdd(url) {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    // Check if feed already exists
    const existing = database.getFeed(url);
    if (existing) {
        console.log(`Feed already exists: ${existing.title || url}`);
        database.close();
        return;
    }
    // Try to fetch and parse the feed to validate it
    console.log(`Validating feed: ${url}...`);
    const fetchResult = await fetchFeed(url, {
        timeout: config.httpTimeout,
        userAgent: config.userAgent,
    });
    if (!fetchResult) {
        logger.error('Failed to fetch feed');
        database.close();
        process.exit(1);
    }
    const parsed = await parseFeed(fetchResult.data);
    if (!parsed) {
        logger.error('Failed to parse feed');
        database.close();
        process.exit(1);
    }
    // Add feed to database
    database.addFeed({
        url,
        title: parsed.title,
        site_url: parsed.siteUrl,
    });
    console.log(`\n✅ Added feed: ${parsed.title || url}`);
    console.log(`   Articles: ${parsed.articles.length}`);
    database.close();
}
export async function handleRemove(url) {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    const feed = database.getFeed(url);
    if (!feed) {
        console.log('Feed not found');
        database.close();
        return;
    }
    database.removeFeed(url);
    console.log(`\n✅ Removed feed: ${feed.title || url}`);
    database.close();
}
export async function handleStats() {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    const stats = database.getStats();
    console.log('\n📊 RSS Daemon Statistics\n');
    console.log(`Feeds:          ${stats.enabledFeeds} enabled / ${stats.totalFeeds} total`);
    console.log(`Articles:       ${stats.totalArticles.toLocaleString()}`);
    console.log(`Unread:         ${stats.unreadArticles.toLocaleString()}`);
    console.log(`Starred:        ${stats.starredArticles.toLocaleString()}`);
    database.close();
}
export async function handleMarkAllRead() {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    database.markAllAsRead();
    console.log('\n✅ Marked all articles as read');
    database.close();
}
export async function handleCleanup(days = 30) {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    database.initialize(config.databasePath);
    const deleted = database.deleteOldArticles(days);
    console.log(`\n✅ Deleted ${deleted} old articles (older than ${days} days)`);
    database.close();
}
export async function handleRefresh() {
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
export async function handleStart() {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    const { Daemon } = await import('./daemon.js');
    const daemon = new Daemon(config);
    await daemon.start();
}
export async function handleLogs(options) {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { existsSync, readFileSync } = await import('fs');
    const { spawn } = await import('child_process');
    const logFile = join(homedir(), 'Library', 'Logs', 'rss-daemon', 'daemon.log');
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
    }
    else {
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
export async function handleTest(url) {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    console.log(`\n🧪 Testing feed: ${url}\n`);
    // Fetch the feed
    console.log('Fetching...');
    const fetchResult = await fetchFeed(url, {
        timeout: config.httpTimeout,
        userAgent: config.userAgent,
    });
    if (!fetchResult) {
        console.log('❌ Failed to fetch feed');
        console.log('   This feed may be unavailable or blocking requests');
        process.exit(1);
    }
    console.log(`✓ Fetched successfully (${fetchResult.data.length} bytes)`);
    console.log(`  Status: ${fetchResult.status}`);
    if (fetchResult.etag)
        console.log(`  ETag: ${fetchResult.etag}`);
    if (fetchResult.lastModified)
        console.log(`  Last-Modified: ${fetchResult.lastModified}`);
    console.log('');
    // Parse the feed
    console.log('Parsing...');
    const parsed = await parseFeed(fetchResult.data);
    if (!parsed) {
        console.log('❌ Failed to parse feed');
        console.log('   This may not be a valid RSS/Atom feed');
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
            if (i < recent.length - 1)
                console.log('');
        }
    }
    else {
        console.log('⚠️  No articles found in feed (may be empty)');
    }
    console.log('\n✅ Feed is valid and can be added!');
}
//# sourceMappingURL=cli.js.map