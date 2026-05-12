import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../../src/db/database';
import {
  getArticles,
  markRead,
  markAllRead,
  toggleStar,
  getFeeds,
  type ArticleRow,
} from '../../../src/db/queries';
import { refresh } from '../../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../../src/constants';

const SMART_LABELS: Record<string, string> = {
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ArticleListScreen() {
  const router = useRouter();
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today'
      ? rawId
      : Number(rawId);

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [feedTitle, setFeedTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();
    const rows = await getArticles(db, feedId);
    setArticles(rows);
    if (typeof feedId === 'string') {
      setFeedTitle(SMART_LABELS[feedId] ?? feedId);
    } else {
      const feeds = await getFeeds(db);
      const feed = feeds.find((f) => f.id === feedId);
      setFeedTitle(feed?.title ?? 'Feed');
    }
  }, [feedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await load();
    } catch {
      Alert.alert('Refresh failed', 'Check your connection.');
    } finally {
      setRefreshing(false);
    }
  };

  const onMarkAllRead = async () => {
    if (typeof feedId === 'string') return;
    const db = getDb();
    await markAllRead(db, feedId);
    await load();
  };

  const onTap = async (article: ArticleRow) => {
    const db = getDb();
    await markRead(db, article.id);
    router.push(`/feeds/${rawId}/${article.id}`);
  };

  const renderRightActions = (article: ArticleRow) => (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#f59e0b' }]}
        onPress={async () => {
          const db = getDb();
          await toggleStar(db, article.id);
          await load();
        }}
      >
        <Text style={styles.swipeActionText}>{article.starred ? 'Unstar' : 'Star'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#6366f1' }]}
        onPress={async () => {
          if (article.url) await Share.share({ url: article.url, message: article.title ?? '' });
        }}
      >
        <Text style={styles.swipeActionText}>Share</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeftActions = (article: ArticleRow) => (
    <TouchableOpacity
      style={[styles.swipeAction, { backgroundColor: article.read ? '#10b981' : '#6b7280', minWidth: 80 }]}
      onPress={async () => {
        const db = getDb();
        if (article.read) {
          await db.runAsync('UPDATE articles SET read = 0 WHERE id = ?', [article.id]);
        } else {
          await markRead(db, article.id);
        }
        await load();
      }}
    >
      <Text style={styles.swipeActionText}>{article.read ? 'Unread' : 'Read'}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: ArticleRow }) => (
    <Swipeable
      renderRightActions={() => renderRightActions(item)}
      renderLeftActions={() => renderLeftActions(item)}
    >
      <TouchableOpacity
        style={[styles.row, item.read ? styles.rowRead : null]}
        onPress={() => onTap(item)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, item.read ? styles.titleRead : null]}
            numberOfLines={2}
          >
            {item.starred ? '⭐ ' : ''}{item.title ?? 'Untitled'}
          </Text>
          <Text style={styles.meta}>{formatRelative(item.published_at)}</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: feedTitle,
          headerRight: typeof feedId === 'number'
            ? () => (
                <TouchableOpacity onPress={onMarkAllRead} style={{ marginRight: 4 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.accent }}>
                    Mark All Read
                  </Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <FlatList
        data={articles}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No articles yet. Pull to refresh.</Text>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowRead: { opacity: 0.4 },
  title: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text, lineHeight: 21, marginBottom: 3 },
  titleRead: { fontFamily: FONTS.regular },
  meta: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSecondary },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  swipeActionText: { fontFamily: FONTS.medium, fontSize: 13, color: '#fff' },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 60,
  },
});
