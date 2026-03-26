import axios, { AxiosError } from 'axios';
import { logger } from './logger.js';

export interface FetchResult {
  data: string;
  lastModified?: string;
  etag?: string;
  status: number;
}

export interface FetchOptions {
  timeout?: number;
  userAgent?: string;
  lastModified?: string;
  etag?: string;
}

export async function fetchFeed(url: string, options: FetchOptions = {}): Promise<FetchResult | null> {
  const {
    timeout = 30000,
    userAgent = 'rss-daemon/1.0',
    lastModified,
    etag,
  } = options;

  try {
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
    };

    // Add conditional request headers
    if (lastModified) {
      headers['If-Modified-Since'] = lastModified;
    }
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    logger.debug(`Fetching ${url}`);

    const response = await axios.get(url, {
      headers,
      timeout,
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });

    // Handle 304 Not Modified
    if (response.status === 304) {
      logger.debug(`Feed not modified: ${url}`);
      return null;
    }

    // Handle errors
    if (response.status >= 400) {
      logger.error(`HTTP ${response.status} when fetching ${url}`);
      return null;
    }

    return {
      data: response.data,
      lastModified: response.headers['last-modified'],
      etag: response.headers['etag'],
      status: response.status,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNABORTED') {
        logger.error(`Timeout fetching ${url}`);
      } else if (axiosError.response) {
        logger.error(`HTTP ${axiosError.response.status} when fetching ${url}`);
      } else if (axiosError.request) {
        logger.error(`Network error fetching ${url}: ${axiosError.message}`);
      } else {
        logger.error(`Error fetching ${url}: ${axiosError.message}`);
      }
    } else {
      logger.error(`Unexpected error fetching ${url}:`, error);
    }
    return null;
  }
}
