import pLimit from 'p-limit';
import { database } from './database.js';
import { fetchFeed } from './fetcher.js';
import { parseFeed } from './parser.js';
import { logger } from './logger.js';
import { Scheduler } from './scheduler.js';
import { scrapePinboardPopular, convertPinboardLinksToArticles } from './pinboard-scraper.js';
import { CLI_BANNER } from './logo.js';
import type { Feed, Config } from './types.js';

export class Daemon {
  private scheduler: Scheduler;
  private config: Config;
  private running = false;

  constructor(config: Config) {
    this.config = config;
    this.scheduler = new Scheduler();
  }

  async start(): Promise<void> {
    // Enable file logging for daemon
    logger.enableFileLogging();

    console.log('\n' + CLI_BANNER);
    logger.info('=== fressh Daemon Starting ===');
    logger.info(`Database: ${this.config.databasePath}`);
    logger.info(`Fetch interval: ${this.config.fetchInterval}s (every ${Math.floor(this.config.fetchInterval / 60)} minutes)`);
    logger.info(`Max concurrent fetches: ${this.config.maxConcurrentFetches}`);
    logger.info(`HTTP timeout: ${this.config.httpTimeout}ms`);
    logger.info(`Log level: ${this.config.logLevel}`);

    // Initialize database
    database.initialize(this.config.databasePath);

    // Check for feeds
    const feeds = database.getAllFeeds();
    logger.info(`Loaded ${feeds.length} feeds`);

    if (feeds.length === 0) {
      logger.warn('No feeds found in database. Import feeds using: fressh import <opml-file>');
    }

    this.running = true;

    // Fetch all feeds immediately on startup
    logger.info('Performing initial fetch...');
    await this.fetchAllFeeds();

    // Schedule periodic fetches
    const cronExpression = `*/${Math.floor(this.config.fetchInterval / 60)} * * * *`;
    this.scheduler.schedule(cronExpression, 'fetch-all', () => this.fetchAllFeeds());

    // Ensure Pinboard feed exists and schedule daily scraping
    this.ensurePinboardFeed();
    await this.scrapePinboard(); // Initial scrape
    this.scheduler.schedule('0 9 * * *', 'scrape-pinboard', () => this.scrapePinboard()); // Daily at 9am

    logger.info('Daemon started successfully');
    logger.info('Press Ctrl+C to stop');

    // Wait for shutdown signal
    await this.waitForShutdown();
  }

  private async fetchAllFeeds(): Promise<void> {
    const startTime = Date.now();
    logger.info('--- Fetch Cycle Starting ---');

    const feeds = database.getAllFeeds();
    if (feeds.length === 0) {
      logger.warn('No feeds to fetch. Import feeds using: rss-daemon import <opml-file>');
      return;
    }

    logger.info(`Fetching ${feeds.length} feeds (max ${this.config.maxConcurrentFetches} concurrent)...`);

    // Limit concurrent fetches
    const limit = pLimit(this.config.maxConcurrentFetches);

    const promises = feeds.map((feed) =>
      limit(() => this.fetchOne(feed))
    );

    const results = await Promise.allSettled(promises);

    // Count successes and failures
    let successful = 0;
    let failed = 0;
    let notModified = 0;
    let newArticles = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
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
    logger.info(`Total: ${feeds.length} feeds | Success: ${successful} | Not Modified: ${notModified} | Failed: ${failed}`);
    logger.info(`New articles: ${newArticles} | Duration: ${duration}s`);

    // Log next fetch time
    const nextFetch = new Date(Date.now() + this.config.fetchInterval * 1000);
    logger.info(`Next fetch scheduled for: ${nextFetch.toLocaleString()}`);
  }

  private async fetchOne(feed: Feed): Promise<number | null> {
    try {
      logger.debug(`Fetching: ${feed.title || feed.url}`);

      // Fetch feed
      const result = await fetchFeed(feed.url, {
        timeout: this.config.httpTimeout,
        userAgent: this.config.userAgent,
        lastModified: feed.last_modified,
        etag: feed.etag,
      });

      // Handle 304 Not Modified
      if (!result) {
        logger.debug(`Not modified: ${feed.title || feed.url}`);
        database.updateFeedMetadata(feed.id!, { last_fetch: new Date() });
        return null; // null = not modified
      }

      // Parse feed
      const parsed = await parseFeed(result.data, this.config);
      if (!parsed) {
        logger.error(`Failed to parse: ${feed.title || feed.url}`);
        database.updateFeedMetadata(feed.id!, { last_fetch: new Date() });
        return -1; // -1 = error
      }

      // Add articles to database
      const articlesWithFeedId = parsed.articles.map((article) => ({
        ...article,
        feed_id: feed.id!,
      }));

      const newCount = database.addArticles(articlesWithFeedId);

      // Update feed metadata
      database.updateFeedMetadata(feed.id!, {
        last_fetch: new Date(),
        last_modified: result.lastModified,
        etag: result.etag,
        title: parsed.title || feed.title,
      });

      if (newCount > 0) {
        logger.info(`✓ ${feed.title || feed.url}: ${newCount} new articles`);
      } else {
        logger.debug(`✓ ${feed.title || feed.url}: no new articles`);
      }

      return newCount;
    } catch (error) {
      logger.error(`✗ Error fetching ${feed.title || feed.url}:`, error);
      return -1; // -1 = error
    }
  }

  private async waitForShutdown(): Promise<void> {
    return new Promise((resolve) => {
      const shutdown = () => {
        if (this.running) {
          logger.info('=== Shutdown signal received ===');
          this.running = false;
          this.scheduler.stopAll();
          database.close();
          logger.info('=== Daemon stopped cleanly ===');
          resolve();
        }
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });
  }

  async refresh(): Promise<void> {
    logger.info('Forcing refresh of all feeds...');
    await this.fetchAllFeeds();
  }

  private ensurePinboardFeed(): void {
    const pinboardUrl = 'https://pinboard.in/popular/';
    const existingFeed = database.getFeed(pinboardUrl);

    if (!existingFeed) {
      const feedId = database.addFeed({
        url: pinboardUrl,
        title: 'Pinboard Popular',
        site_url: 'https://pinboard.in',
        enabled: 1,
      });
      logger.info(`Added Pinboard Popular feed (ID: ${feedId})`);
    }
  }

  private async scrapePinboard(): Promise<void> {
    const pinboardUrl = 'https://pinboard.in/popular/';

    try {
      logger.info('--- Scraping Pinboard Popular ---');

      const links = await scrapePinboardPopular(this.config.httpTimeout);

      if (links.length === 0) {
        logger.warn('No links found on Pinboard popular page');
        return;
      }

      const feed = database.getFeed(pinboardUrl);
      if (!feed || !feed.id) {
        logger.error('Pinboard feed not found in database');
        return;
      }

      const articles = convertPinboardLinksToArticles(links, feed.id).map((article) => ({
        ...article,
        feed_id: feed.id!,
      }));

      const newCount = database.addArticles(articles);

      database.updateFeedMetadata(feed.id, {
        last_fetch: new Date(),
        title: 'Pinboard Popular',
      });

      if (newCount > 0) {
        logger.info(`✓ Pinboard Popular: ${newCount} new links`);
      } else {
        logger.debug(`✓ Pinboard Popular: no new links`);
      }

      logger.info(`--- Pinboard Scraping Complete (${newCount} new) ---`);
    } catch (error) {
      logger.error('Error scraping Pinboard:', error);
    }
  }
}
