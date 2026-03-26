export declare class Scheduler {
    private tasks;
    schedule(cronExpression: string, name: string, callback: () => void | Promise<void>): void;
    stop(name: string): void;
    stopAll(): void;
}
//# sourceMappingURL=scheduler.d.ts.map