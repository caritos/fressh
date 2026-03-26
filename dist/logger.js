import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Logger {
    level = 'info';
    logFilePath = null;
    setLevel(level) {
        this.level = level;
    }
    enableFileLogging(logDir) {
        const dir = logDir || join(homedir(), 'Library', 'Logs', 'rss-daemon');
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        this.logFilePath = join(dir, 'daemon.log');
    }
    shouldLog(level) {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
    }
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ') : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
    }
    writeToFile(formatted) {
        if (this.logFilePath) {
            try {
                appendFileSync(this.logFilePath, formatted + '\n', 'utf-8');
            }
            catch (error) {
                // Don't crash if we can't write to log file
                console.error('Failed to write to log file:', error);
            }
        }
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            const formatted = this.formatMessage('debug', message, ...args);
            console.log(formatted);
            this.writeToFile(formatted);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('info', message, ...args);
            console.log(formatted);
            this.writeToFile(formatted);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            const formatted = this.formatMessage('warn', message, ...args);
            console.warn(formatted);
            this.writeToFile(formatted);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            const formatted = this.formatMessage('error', message, ...args);
            console.error(formatted);
            this.writeToFile(formatted);
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map