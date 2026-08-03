import { getDb } from '../db/database';
import {
  getFeeds,
  upsertFeed,
  insertArticles,
  updateFeedFetchMeta,
  updateArticleVideoDimensions,
} from '../db/queries';
import { fetchFeed } from './fetch';
import { parseFeed } from './parser';
import { getYouTubeVideoId, fetchYouTubeAspectRatio } from './youtube';
import { logService } from '../logging/logService';

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

  await logService.startNewLog('refresh');
  await logService.write('INFO', 'refresh', `Refreshing ${enabled.length} feed(s)`);

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
            await logService.write('DEBUG', 'refresh', `${feed.url}: not modified`);
          } else if (result.status === 'error') {
            failed++;
            await logService.write('WARN', 'refresh', `${feed.url}: fetch failed — ${result.message}`);
          } else {
            const parsed = await parseFeed(result.text);
            if (!parsed) {
              failed++;
              await logService.write('WARN', 'refresh', `${feed.url}: parse failed`);
            } else {
              await upsertFeed(db, {
                url: feed.url,
                title: parsed.title ?? feed.title,
                site_url: parsed.siteUrl ?? feed.site_url,
              });
              const insertedArticles = await insertArticles(db, feed.id, parsed.articles);
              await updateFeedFetchMeta(db, feed.id, result.lastModified, result.etag);
              await Promise.all(
                insertedArticles
                  .filter((a) => getYouTubeVideoId(a.url))
                  .map(async (a) => {
                    const dims = await fetchYouTubeAspectRatio(a.url as string);
                    if (dims) await updateArticleVideoDimensions(db, a.id, dims.width, dims.height);
                  })
              );
              newArticles += insertedArticles.length;
              fetched++;
              await logService.write('DEBUG', 'refresh', `${feed.url}: ok — ${insertedArticles.length} new article(s)`);
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`refresh: error on ${feed.url}:`, e);
          await logService.write('ERROR', 'refresh', `${feed.url}: ${message}`);
          failed++;
        } finally {
          onProgress?.(++completed, enabled.length);
        }
      })
    );
  }

  await logService.write(
    'INFO',
    'refresh',
    `Done — ${fetched} fetched, ${failed} failed, ${newArticles} new article(s)`
  );
  await logService.finishLog();

  return { fetched, failed, newArticles };
}
