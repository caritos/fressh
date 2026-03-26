import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  databasePath: '~/Library/Application Support/fressh/articles.db',
  logLevel: 'info',
  fetchInterval: 900, // 15 minutes
  maxConcurrentFetches: 5,
  httpTimeout: 30000, // 30 seconds
  userAgent: 'fressh/1.0',
  excludeYouTubeShorts: false, // disabled by default for backward compatibility
  maxArticleAgeDays: 30, // only process articles published within last 30 days
};

function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

export function loadConfig(): Config {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Try to load from config file
  const configPath = expandPath('~/.fressh/config.json');
  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = { ...config, ...fileConfig };
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error);
    }
  }

  // Override with environment variables
  if (process.env.FRESSH_DB_PATH) {
    config.databasePath = process.env.FRESSH_DB_PATH;
  }
  if (process.env.FRESSH_LOG_LEVEL) {
    config.logLevel = process.env.FRESSH_LOG_LEVEL as Config['logLevel'];
  }
  if (process.env.FRESSH_FETCH_INTERVAL) {
    config.fetchInterval = parseInt(process.env.FRESSH_FETCH_INTERVAL, 10);
  }

  // Expand tilde in database path
  config.databasePath = expandPath(config.databasePath);

  return config;
}
