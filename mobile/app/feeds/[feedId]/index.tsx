import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../../src/db/database';
import {
  getArticles,
  markRead,
  markUnread,
  markAllRead,
  markAllUnreadRead,
  markAllTodayRead,
  toggleStar,
  getFeeds,
  type ArticleRow,
} from '../../../src/db/queries';
import { refresh } from '../../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../../src/constants';
import Row from '../../../src/components/ui/Row';
import { setReaderSession } from '../../../src/reader/session';

const SMART_LABELS: Record<string, string> = {
  all: 'All',
  unread: 'All Unread',
  starred: 'Starred',
  today: 'Today',
};

const TOOLBAR_HEIGHT = 50;

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
  const insets = useSafeAreaInsets();
  const { feedId: rawId } = useLocalSearchParams<{ feedId: string }>();
  if (Array.isArray(rawId)) return null;
  const feedId =
    rawId === 'unread' || rawId === 'starred' || rawId === 'today' || rawId === 'all'
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
        } else if (feedId === 'today') {
          await markAllTodayRead(db);
        } else if (feedId === 'all') {
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
    setReaderSession(rawId, articles.map((a) => a.id));
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
          if (article.url) await Share.share({ message: `${article.title ?? ''}\n${article.url}` });
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
    const faviconUrl = typeof feedId === 'string' && item.feed_site_url
      ? (() => { try { const { hostname } = new URL(item.feed_site_url!); return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`; } catch { return undefined; } })()
      : undefined;
    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        renderLeftActions={() => renderLeftActions(item)}
      >
        <Row
          label={label}
          meta={formatRelative(item.published_at)}
          dimmed={!!item.read}
          icon={faviconUrl}
          onPress={() => onTap(item)}
        />
      </Swipeable>
    );
  }, [articles, feedId, rawId]);

  const hasMarkAllRead = typeof feedId === 'number' || feedId === 'unread' || feedId === 'today' || feedId === 'all';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {feedTitle ? <Text style={styles.screenTitle}>{feedTitle}</Text> : null}

      <FlatList
        data={articles}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: TOOLBAR_HEIGHT + insets.bottom + 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No articles here.</Text>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.accent} />
        </TouchableOpacity>

        <View style={styles.toolbarDivider} />

        {hasMarkAllRead ? (
          <TouchableOpacity style={styles.toolbarBtn} onPress={onMarkAllRead}>
            <Text style={styles.toolbarMarkRead}>Mark All Read</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.toolbarBtn} />
        )}

        <View style={styles.toolbarDivider} />

        <TouchableOpacity style={styles.toolbarBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.accent} />
            : <Text style={styles.toolbarRefreshText}>↻</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  screenTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 13,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
    letterSpacing: 0.3,
  },
  toolbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  toolbarBtn: {
    flex: 1,
    height: TOOLBAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    alignSelf: 'stretch',
    marginVertical: 10,
  },
  toolbarMarkRead: {
    fontFamily: FONTS.sansMedium,
    fontSize: 12,
    color: COLORS.accent,
  },
  toolbarRefreshText: {
    fontSize: 22,
    color: COLORS.accent,
    lineHeight: 26,
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
