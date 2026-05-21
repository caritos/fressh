import { getDb } from '../db/database';
import {
  getFeeds,
  upsertFeed,
  insertArticles,
  updateFeedFetchMeta,
} from '../db/queries';
import { fetchFeed } from './fetch';
import { parseFeed } from './parser';

export interface RefreshSummary {
  fetched: number;
  failed: number;
  newArticles: number;
}

const MAX_CONCURRENT = 6;

export async function refresh(
  onProgress?: (completed: number, total: number) => void
): Promise<RefreshSummary> {
  const db = getDb();
  const feeds = await getFeeds(db);
  const enabled = feeds.filter((f) => f.enabled === 1);

  let fetched = 0;
  let failed = 0;
  let newArticles = 0;
  let completed = 0;

  onProgress?.(0, enabled.length);

  for (let i = 0; i < enabled.length; i += MAX_CONCURRENT) {
    const batch = enabled.slice(i, i + MAX_CONCURRENT);
    await Promise.all(
      batch.map(async (feed) => {
        try {
          const result = await fetchFeed(feed.url, {
            lastModified: feed.last_modified,
            etag: feed.etag,
          });

          if (result.status === 'not-modified') {
            fetched++;
          } else if (result.status === 'error') {
            failed++;
          } else {
            const parsed = await parseFeed(result.text);
            if (!parsed) {
              failed++;
            } else {
              await upsertFeed(db, {
                url: feed.url,
                title: parsed.title ?? feed.title,
                site_url: parsed.siteUrl ?? feed.site_url,
              });
              const count = await insertArticles(db, feed.id, parsed.articles);
              await updateFeedFetchMeta(db, feed.id, result.lastModified, result.etag);
              newArticles += count;
              fetched++;
            }
          }
        } catch (e) {
          console.error(`refresh: error on ${feed.url}:`, e);
          failed++;
        } finally {
          onProgress?.(++completed, enabled.length);
        }
      })
    );
  }

  return { fetched, failed, newArticles };
}
