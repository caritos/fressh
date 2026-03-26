import type { Config } from './types.js';
export declare class Daemon {
    private scheduler;
    private config;
    private running;
    constructor(config: Config);
    start(): Promise<void>;
    private fetchAllFeeds;
    private fetchOne;
    private waitForShutdown;
    refresh(): Promise<void>;
}
//# sourceMappingURL=daemon.d.ts.map