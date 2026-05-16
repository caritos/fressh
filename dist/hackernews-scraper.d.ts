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
export declare function scrapeHackerNews(timeout?: number): Promise<HackerNewsItem[]>;
export declare function convertHackerNewsToArticles(items: HackerNewsItem[], feedId: number): Omit<Article, 'feed_id'>[];
//# sourceMappingURL=hackernews-scraper.d.ts.map