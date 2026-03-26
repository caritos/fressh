import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = 'info';
  private logFilePath: string | null = null;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  enableFileLogging(logDir?: string) {
    const dir = logDir || join(homedir(), 'Library', 'Logs', 'fressh');

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.logFilePath = join(dir, 'daemon.log');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }

  private writeToFile(formatted: string) {
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, formatted + '\n', 'utf-8');
      } catch (error) {
        // Don't crash if we can't write to log file
        console.error('Failed to write to log file:', error);
      }
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, ...args);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, ...args);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }
}

export const logger = new Logger();
