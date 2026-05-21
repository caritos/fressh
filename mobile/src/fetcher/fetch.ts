export type FetchResult =
  | { status: 'ok'; text: string; lastModified: string | null; etag: string | null }
  | { status: 'not-modified' }
  | { status: 'error'; message: string };

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

export async function fetchFeed(
  url: string,
  opts: { lastModified?: string | null; etag?: string | null } = {}
): Promise<FetchResult> {
  const httpsUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : null;
  const urlsToTry = httpsUrl ? [httpsUrl, url] : [url];

  let lastError = 'unknown error';
  for (const candidate of urlsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const headers: Record<string, string> = {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      };
      if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;
      if (opts.etag) headers['If-None-Match'] = opts.etag;

      const res = await fetch(candidate, { headers, signal: controller.signal });

      if (res.status === 304) return { status: 'not-modified' };
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }

      const text = await res.text();
      return {
        status: 'ok',
        text,
        lastModified: res.headers.get('last-modified'),
        etag: res.headers.get('etag'),
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timeout);
    }
  }
  return { status: 'error', message: lastError };
}

export async function resolveYouTubeChannelId(channelUrl: string): Promise<string | null> {
  const result = await fetchFeed(channelUrl);
  if (result.status !== 'ok') return null;
  const match = result.text.match(/channel_id=([a-zA-Z0-9_-]{24})/);
  return match ? match[1] : null;
}
