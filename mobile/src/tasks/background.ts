import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { initDb, getDb } from '../db/database';
import { getTotalUnreadCount } from '../db/queries';
import { refresh } from '../fetcher/refresh';

export const BACKGROUND_FETCH_TASK = 'FRESSH_BACKGROUND_FETCH';

// Task must be defined at module level (before any async code)
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await initDb(); // idempotent — safe to call if already open
    await refresh();
    const db = getDb();
    const count = await getTotalUnreadCount(db);
    await Notifications.setBadgeCountAsync(count);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('Background fetch failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetch(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 30 * 60, // 30 minutes (iOS may defer)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}
