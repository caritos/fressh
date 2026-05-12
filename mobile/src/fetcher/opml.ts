import { getDb } from '../db/database';
import subscriptions from '../assets/subscriptions.json';

export async function importBundledSubscriptions(): Promise<number> {
  const db = getDb();
  let inserted = 0;
  for (const feed of subscriptions) {
    const result = await db.runAsync(
      `INSERT INTO feeds (url, title, site_url) VALUES (?, ?, ?)
       ON CONFLICT(url) DO NOTHING`,
      [feed.url, feed.title ?? null, feed.siteUrl ?? null]
    );
    inserted += result.changes;
  }
  return inserted;
}

export const BUNDLED_FEED_COUNT = subscriptions.length;
