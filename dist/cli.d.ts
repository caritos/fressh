export declare function handleImport(file: string): Promise<void>;
export declare function handleExport(file?: string): Promise<void>;
export declare function handleAdd(url: string): Promise<void>;
export declare function handleRemove(url: string): Promise<void>;
export declare function handleList(): Promise<void>;
export declare function handleStats(): Promise<void>;
export declare function handleMarkAllRead(): Promise<void>;
export declare function handleMarkFeedRead(url: string): Promise<void>;
export declare function handleCleanup(days?: number): Promise<void>;
export declare function handleDeleteShorts(): Promise<void>;
export declare function handleRemoveDuplicates(): Promise<void>;
export declare function handleRebuildSearchIndex(): Promise<void>;
export declare function handleRefresh(): Promise<void>;
export declare function handleStart(): Promise<void>;
export declare function handleLogs(options: {
    follow?: boolean;
    lines?: number;
}): Promise<void>;
export declare function handleView(): Promise<void>;
export declare function handleRead(options: {
    limit?: number;
    unread?: boolean;
}): Promise<void>;
export declare function handleTest(url: string): Promise<void>;
//# sourceMappingURL=cli.d.ts.map