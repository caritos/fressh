import * as cheerio from 'cheerio';
import axios from 'axios';
import { logger } from './logger.js';
import type { Article } from './types.js';

export interface PinboardLink {
  url: string;
  title: string;
  description?: string;
  tags: string[];
  timestamp?: Date;
}

export async function scrapePinboardPopular(timeout = 30000): Promise<PinboardLink[]> {
  try {
    logger.debug('Fetching Pinboard popular page...');

    const response = await axios.get('https://pinboard.in/popular/', {
      headers: {
        'User-Agent': 'fressh/1.0',
      },
      timeout,
    });

    if (response.status !== 200) {
      logger.error(`HTTP ${response.status} when fetching Pinboard popular page`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const links: PinboardLink[] = [];

    // Pinboard popular page structure: bookmarks are in divs with class 'bookmark'
    $('.bookmark').each((_, element) => {
      const $bookmark = $(element);

      // Extract URL and title from the bookmark link
      const $link = $bookmark.find('.bookmark_title');
      const url = $link.attr('href');
      const title = $link.text().trim();

      if (!url || !title) return;

      // Extract description
      const description = $bookmark.find('.description').text().trim() || undefined;

      // Extract tags
      const tags: string[] = [];
      $bookmark.find('.tag').each((_, tagEl) => {
        const tag = $(tagEl).text().trim();
        if (tag) tags.push(tag);
      });

      // Extract timestamp if available
      let timestamp: Date | undefined;
      const timeText = $bookmark.find('.when').attr('title') || $bookmark.find('.when').text();
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
        timestamp,
      });
    });

    logger.info(`Scraped ${links.length} links from Pinboard popular page`);
    return links;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Error fetching Pinboard: ${error.message}`);
    } else {
      logger.error('Unexpected error scraping Pinboard:', error);
    }
    return [];
  }
}

export function convertPinboardLinksToArticles(links: PinboardLink[], feedId: number): Omit<Article, 'feed_id'>[] {
  return links.map((link) => ({
    // Use URL as guid since Pinboard doesn't provide unique IDs
    guid: link.url,
    title: link.title,
    url: link.url,
    author: undefined,
    content_html: link.description
      ? `<p>${link.description}</p>${link.tags.length > 0 ? `<p>Tags: ${link.tags.join(', ')}</p>` : ''}`
      : link.tags.length > 0
        ? `<p>Tags: ${link.tags.join(', ')}</p>`
        : undefined,
    content_text: link.description || undefined,
    summary: link.description || link.tags.join(', ') || undefined,
    published_at: link.timestamp || new Date(),
  }));
}
