import * as FileSystem from 'expo-file-system/legacy';

// Must live under FileSystem.cacheDirectory (Library/Caches), not a bare
// Library/ subfolder — expo-file-system's native permission layer only
// grants read/write access to documentDirectory, cacheDirectory, and
// applicationSupportDirectory.
const LOGS_DIR = `${FileSystem.cacheDirectory}logs`;

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class LogService {
  private currentLogFile: string | null = null;
  private buffer: string[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  async ensureLogsDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(LOGS_DIR, { intermediates: true });
    }
  }

  async startNewLog(moduleName: string): Promise<string> {
    await this.ensureLogsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.currentLogFile = `${LOGS_DIR}/${moduleName}-${timestamp}.log`;
    this.buffer = [];

    await this.write('INFO', moduleName, `Log started at ${new Date().toISOString()}`);

    return this.currentLogFile;
  }

  async write(level: LogLevel, module: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${module}] [${level}] ${message}\n`;

    console.log(logLine.trim());

    if (this.currentLogFile) {
      this.buffer.push(logLine);

      if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
      }

      if (this.buffer.length > 50) {
        await this.flush();
      } else {
        this.flushTimeout = setTimeout(() => this.flush(), 500);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.currentLogFile && this.buffer.length > 0) {
      const content = this.buffer.join('');
      this.buffer = [];

      try {
        const fileInfo = await FileSystem.getInfoAsync(this.currentLogFile);
        let existing = '';
        if (fileInfo.exists) {
          existing = await FileSystem.readAsStringAsync(this.currentLogFile);
        }

        await FileSystem.writeAsStringAsync(this.currentLogFile, existing + content);
      } catch (error) {
        console.error('Failed to write log file:', error);
      }
    }

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }

  async finishLog(): Promise<void> {
    await this.flush();
    if (this.currentLogFile) {
      console.log(`Log file written to: ${this.currentLogFile}`);
    }
    this.currentLogFile = null;
  }

  getCurrentLogFile(): string | null {
    return this.currentLogFile;
  }
}

export const logService = new LogService();

/**
 * Find the most recently written log file, for sharing via the Settings
 * screen's "Export Logs" action. Filenames are `${moduleName}-${timestamp}`
 * where timestamp is an ISO-8601-derived string with colons/dots replaced
 * by hyphens (see startNewLog) — this format sorts lexicographically in
 * chronological order, so the last entry after a plain string sort is the
 * newest file. Returns null if there's nothing to export yet, or on any
 * FileSystem error — never throws.
 */
export async function getMostRecentLogFile(): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!info.exists) {
      return null;
    }
    const files = await FileSystem.readDirectoryAsync(LOGS_DIR);
    if (files.length === 0) {
      return null;
    }
    const sorted = [...files].sort();
    return `${LOGS_DIR}/${sorted[sorted.length - 1]}`;
  } catch (error) {
    console.error('Failed to find most recent log file:', error);
    return null;
  }
}
