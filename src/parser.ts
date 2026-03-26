import Parser from 'rss-parser';
import type { Article, Config } from './types.js';
import { logger } from './logger.js';

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['summary', 'summary'],
    ],
  },
});

export interface ParsedFeed {
  title?: string;
  siteUrl?: string;
  articles: Omit<Article, 'feed_id' | 'fetched_at'>[];
}

function isYouTubeShort(url?: string): boolean {
  if (!url) return false;
  return url.includes('youtube.com/shorts/') || url.includes('youtu.be/shorts/');
}

export async function parseFeed(feedContent: string, config?: Config): Promise<ParsedFeed | null> {
  try {
    const feed = await parser.parseString(feedContent);

    if (!feed || !feed.items) {
      logger.error('Invalid feed structure - no items found');
      return null;
    }

    const articles: Omit<Article, 'feed_id' | 'fetched_at'>[] = [];

    for (const item of feed.items) {
      const anyItem = item as any;

      // Always skip YouTube Shorts
      if (isYouTubeShort(item.link)) {
        logger.debug(`Skipping YouTube Short: ${item.title || item.link}`);
        continue;
      }

      // Generate guid - prefer item.id, fallback to link, then title
      const guid = item.guid || anyItem.id || item.link || item.title || `${Date.now()}-${Math.random()}`;

      // Extract content in order of preference
      const contentHtml = anyItem.contentEncoded || item.content || anyItem.description || '';
      const summary = anyItem.summary || item.contentSnippet || '';

      // Parse published date
      let publishedAt: Date | undefined;
      if (item.pubDate) {
        publishedAt = new Date(item.pubDate);
        // Validate date
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
        published_at: publishedAt || new Date(),
      });
    }

    // Filter articles by age if configured
    let filteredArticles = articles;
    if (config?.maxArticleAgeDays && config.maxArticleAgeDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.maxArticleAgeDays);

      const beforeFilter = articles.length;
      filteredArticles = articles.filter(article => {
        if (!article.published_at) return true; // keep articles without dates
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
      articles: filteredArticles,
    };
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error parsing feed: ${error.message}`);
    } else {
      logger.error('Error parsing feed:', error);
    }
    return null;
  }
}

function stripHtml(html: string): string {
  if (!html) return '';
  // Simple HTML stripping - remove tags
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
