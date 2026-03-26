type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    private level;
    private logFilePath;
    setLevel(level: LogLevel): void;
    enableFileLogging(logDir?: string): void;
    private shouldLog;
    private formatMessage;
    private writeToFile;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map