import type { Article, Config } from './types.js';
export interface ParsedFeed {
    title?: string;
    siteUrl?: string;
    articles: Omit<Article, 'feed_id' | 'fetched_at'>[];
}
export declare function parseFeed(feedContent: string, config?: Config): Promise<ParsedFeed | null>;
//# sourceMappingURL=parser.d.ts.map