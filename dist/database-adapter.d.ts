export interface DatabaseInstance {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string): void;
    transaction<T>(fn: () => T): () => T;
    close(): void;
}
export interface Statement {
    run(...params: any[]): {
        changes: number;
    };
    get(...params: any[]): any;
    all(...params: any[]): any[];
}
export declare function createDatabase(path: string): DatabaseInstance;
//# sourceMappingURL=database-adapter.d.ts.map