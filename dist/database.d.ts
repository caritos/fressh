import type { Feed, Article, FeedStats } from './types.js';
declare class DatabaseManager {
    private db;
    private preparedStatements;
    initialize(dbPath: string): void;
    private createSchema;
    private getStatement;
    addFeed(feed: Feed): number;
    getAllFeeds(): Feed[];
    getFeed(url: string): Feed | undefined;
    removeFeed(url: string): void;
    updateFeedMetadata(feedId: number, metadata: {
        last_fetch?: Date;
        last_modified?: string;
        etag?: string;
        title?: string;
    }): void;
    addArticles(articles: Article[]): number;
    getUnreadArticles(limit?: number): Article[];
    markArticleAsRead(articleId: number): void;
    markAllAsRead(): void;
    toggleStarred(articleId: number): void;
    getStats(): FeedStats;
    deleteOldArticles(daysOld: number): number;
    close(): void;
}
export declare const database: DatabaseManager;
export {};
//# sourceMappingURL=database.d.ts.map