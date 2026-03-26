import type { Article } from './types.js';
export interface ParsedFeed {
    title?: string;
    siteUrl?: string;
    articles: Omit<Article, 'feed_id' | 'fetched_at'>[];
}
export declare function parseFeed(feedContent: string): Promise<ParsedFeed | null>;
//# sourceMappingURL=parser.d.ts.map