import axios, { AxiosError } from 'axios';
import https from 'https';
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
  allowInsecureCertificates?: boolean;
}

export async function fetchFeed(url: string, options: FetchOptions = {}): Promise<FetchResult | null> {
  const {
    timeout = 30000,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    lastModified,
    etag,
    allowInsecureCertificates = false,
  } = options;

  try {
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Add conditional request headers
    if (lastModified) {
      headers['If-Modified-Since'] = lastModified;
    }
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    logger.debug(`Fetching ${url}`);

    // Configure HTTPS agent to handle certificate issues
    const httpsAgent = allowInsecureCertificates
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    const response = await axios.get(url, {
      headers,
      timeout,
      httpsAgent,
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
