import type { Article } from './types.js';
export interface PinboardLink {
    url: string;
    title: string;
    description?: string;
    tags: string[];
    timestamp?: Date;
}
export declare function scrapePinboardPopular(timeout?: number): Promise<PinboardLink[]>;
export declare function convertPinboardLinksToArticles(links: PinboardLink[], feedId: number): Omit<Article, 'feed_id'>[];
//# sourceMappingURL=pinboard-scraper.d.ts.map