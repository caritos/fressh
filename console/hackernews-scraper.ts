import * as cheerio from 'cheerio';
import axios from 'axios';
import { logger } from './logger.js';
import type { Article } from './types.js';

export interface HackerNewsItem {
  url: string;
  title: string;
  points?: number;
  author?: string;
  commentCount?: number;
  timestamp?: Date;
  rank?: number;
}

export async function scrapeHackerNews(timeout = 30000): Promise<HackerNewsItem[]> {
  try {
    logger.debug('Fetching Hacker News front page...');

    const response = await axios.get('https://news.ycombinator.com/news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout,
    });

    if (response.status !== 200) {
      logger.error(`HTTP ${response.status} when fetching Hacker News`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const items: HackerNewsItem[] = [];

    // HN structure: stories are in table rows with class 'athing'
    $('.athing').each((_, element) => {
      const $story = $(element);
      const rank = parseInt($story.find('.rank').text().replace('.', ''), 10);

      // Get title and URL
      const $titleLink = $story.find('.titleline > a').first();
      const title = $titleLink.text().trim();
      let url = $titleLink.attr('href');

      if (!title || !url) return;

      // Handle relative URLs (Ask HN, Show HN, etc.)
      if (url.startsWith('item?id=')) {
        url = `https://news.ycombinator.com/${url}`;
      }

      // Get metadata from the next row (subtext)
      const $subtext = $story.next('.subtext');

      // Extract points
      const pointsText = $subtext.find('.score').text();
      const pointsMatch = pointsText.match(/(\d+) point/);
      const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 0;

      // Extract author
      const author = $subtext.find('.hnuser').text() || undefined;

      // Extract comment count
      const commentsText = $subtext.find('a').last().text();
      const commentsMatch = commentsText.match(/(\d+)\s+comment/);
      const commentCount = commentsMatch ? parseInt(commentsMatch[1], 10) : 0;

      // Extract time - HN uses relative time like "2 hours ago"
      // We'll use current time as published time since HN doesn't provide exact timestamps
      const ageText = $subtext.find('.age').attr('title');
      let timestamp: Date | undefined;
      if (ageText) {
        timestamp = new Date(ageText);
      } else {
        timestamp = new Date();
      }

      items.push({
        url,
        title,
        points,
        author,
        commentCount,
        timestamp,
        rank,
      });
    });

    logger.info(`Scraped ${items.length} stories from Hacker News`);
    return items;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Error fetching Hacker News: ${error.message}`);
    } else {
      logger.error('Unexpected error scraping Hacker News:', error);
    }
    return [];
  }
}

export function convertHackerNewsToArticles(items: HackerNewsItem[], feedId: number): Omit<Article, 'feed_id'>[] {
  return items.map((item) => {
    // Build content HTML with metadata
    const metadataParts: string[] = [];
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

    const content_html = metadataParts.length > 0
      ? `<p>${metadataParts.join(' | ')}</p>`
      : undefined;

    const summary = metadataParts.length > 0
      ? metadataParts.join(' | ')
      : undefined;

    return {
      // Use URL as guid since HN doesn't provide unique IDs in the HTML
      guid: item.url,
      title: item.title,
      url: item.url,
      author: item.author,
      content_html,
      content_text: undefined,
      summary,
      published_at: item.timestamp || new Date(),
    };
  });
}
