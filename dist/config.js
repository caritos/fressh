import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
const DEFAULT_CONFIG = {
    databasePath: '~/Library/Application Support/rss-daemon/articles.db',
    logLevel: 'info',
    fetchInterval: 900, // 15 minutes
    maxConcurrentFetches: 5,
    httpTimeout: 30000, // 30 seconds
    userAgent: 'rss-daemon/1.0',
};
function expandPath(path) {
    if (path.startsWith('~/')) {
        return join(homedir(), path.slice(2));
    }
    return path;
}
export function loadConfig() {
    // Start with defaults
    let config = { ...DEFAULT_CONFIG };
    // Try to load from config file
    const configPath = expandPath('~/.rss-daemon/config.json');
    if (existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
            config = { ...config, ...fileConfig };
        }
        catch (error) {
            console.warn(`Failed to load config from ${configPath}:`, error);
        }
    }
    // Override with environment variables
    if (process.env.RSS_DAEMON_DB_PATH) {
        config.databasePath = process.env.RSS_DAEMON_DB_PATH;
    }
    if (process.env.RSS_DAEMON_LOG_LEVEL) {
        config.logLevel = process.env.RSS_DAEMON_LOG_LEVEL;
    }
    if (process.env.RSS_DAEMON_FETCH_INTERVAL) {
        config.fetchInterval = parseInt(process.env.RSS_DAEMON_FETCH_INTERVAL, 10);
    }
    // Expand tilde in database path
    config.databasePath = expandPath(config.databasePath);
    return config;
}
//# sourceMappingURL=config.js.map