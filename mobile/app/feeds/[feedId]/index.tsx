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
  markUnread,
  markAllRead,
  markAllUnreadRead,
  toggleStar,
  getFeeds,
  type ArticleRow,
} from '../../../src/db/queries';
import { refresh } from '../../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../../src/constants';
import Row from '../../../src/components/ui/Row';

const SMART_LABELS: Record<string, string> = {
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ArticleListScreen() {
  const router = useRouter();
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  if (Array.isArray(rawId)) return null;
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today'
      ? rawId
      : Number(rawId);

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [feedTitle, setFeedTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
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
    } catch (e) {
      console.error('ArticleList load error:', e);
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
    const doMark = async () => {
      try {
        const db = getDb();
        if (typeof feedId === 'number') {
          await markAllRead(db, feedId);
        } else if (feedId === 'unread') {
          await markAllUnreadRead(db);
        } else {
          return;
        }
        await load();
      } catch {
        Alert.alert('Error', 'Failed to mark all as read.');
      }
    };

    Alert.alert('Mark All Read', 'Mark every article in this list as read?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark All Read', onPress: doMark },
    ]);
  };

  const onTap = async (article: ArticleRow) => {
    try {
      const db = getDb();
      await markRead(db, article.id);
    } catch (e) {
      console.error('markRead error:', e);
    }
    router.push(`/feeds/${rawId}/${article.id}`);
  };

  const renderRightActions = (article: ArticleRow) => (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#B8860B' }]}
        onPress={async () => {
          const db = getDb();
          await toggleStar(db, article.id);
          await load();
        }}
      >
        <Text style={styles.swipeActionText}>{article.starred ? 'Unstar' : 'Star'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: '#555555' }]}
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
      style={[
        styles.swipeAction,
        { backgroundColor: article.read ? '#555555' : COLORS.accent, minWidth: 80 },
      ]}
      onPress={async () => {
        const db = getDb();
        if (article.read) {
          await markUnread(db, article.id);
        } else {
          await markRead(db, article.id);
        }
        await load();
      }}
    >
      <Text style={styles.swipeActionText}>{article.read ? 'Unread' : 'Read'}</Text>
    </TouchableOpacity>
  );

  const renderItem = useCallback(({ item }: { item: ArticleRow }) => {
    const label = item.starred ? `★ ${item.title ?? 'Untitled'}` : (item.title ?? 'Untitled');
    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        renderLeftActions={() => renderLeftActions(item)}
      >
        <Row
          label={label}
          meta={formatRelative(item.published_at)}
          dimmed={!!item.read}
          onPress={() => onTap(item)}
        />
      </Swipeable>
    );
  }, [articles, feedId, rawId]);

  return (
    <>
      <Stack.Screen
        options={{
          title: feedTitle,
          headerRight: (typeof feedId === 'number' || feedId === 'unread')
            ? () => (
                <TouchableOpacity onPress={onMarkAllRead} style={{ marginRight: 4 }}>
                  <Text style={styles.markAllRead}>Mark All Read</Text>
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
          <Text style={styles.empty}>No articles here.</Text>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  markAllRead: {
    fontFamily: FONTS.sansMedium,
    fontSize: 13,
    color: COLORS.accent,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  swipeActionText: { fontFamily: FONTS.sansBold, fontSize: 13, color: '#fff' },
  empty: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 60,
  },
});
