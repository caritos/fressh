export interface FetchResult {
    data: string;
    lastModified?: string;
    etag?: string;
    status: number;
}
export interface FetchOptions {
    timeout?: number;
    userAgent?: string;
    lastModified?: string;
    etag?: string;
}
export declare function fetchFeed(url: string, options?: FetchOptions): Promise<FetchResult | null>;
//# sourceMappingURL=fetcher.d.ts.map