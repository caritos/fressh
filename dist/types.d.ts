export interface Config {
    databasePath: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    fetchInterval: number;
    maxConcurrentFetches: number;
    httpTimeout: number;
    userAgent: string;
}
export interface Feed {
    id?: number;
    url: string;
    title?: string;
    site_url?: string;
    last_fetch?: Date;
    last_modified?: string;
    etag?: string;
    fetch_interval?: number;
    enabled?: number;
    created_at?: Date;
}
export interface Article {
    id?: number;
    feed_id: number;
    guid: string;
    title?: string;
    url?: string;
    author?: string;
    content_html?: string;
    content_text?: string;
    summary?: string;
    published_at?: Date;
    fetched_at?: Date;
    read?: number;
    starred?: number;
}
export interface FeedStats {
    totalFeeds: number;
    enabledFeeds: number;
    totalArticles: number;
    unreadArticles: number;
    starredArticles: number;
}
//# sourceMappingURL=types.d.ts.map