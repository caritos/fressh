import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../src/db/database';
import { getFeeds, upsertFeed, deleteFeed, getFeedByUrl, type FeedRow } from '../../src/db/queries';
import { detectFeedType } from '../../src/fetcher/detect';
import { resolveYouTubeChannelId, fetchFeed } from '../../src/fetcher/fetch';
import { parseFeed } from '../../src/fetcher/parser';
import { refresh } from '../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../src/constants';

const SMART_FEEDS = [
  { id: 'starred', label: '⭐ Starred' },
  { id: 'unread', label: '📬 All Unread' },
  { id: 'today', label: '🗓 Today' },
];

export default function FeedsScreen() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [smartCounts, setSmartCounts] = useState<{ starred: number; unread: number; today: number }>({
    starred: 0,
    unread: 0,
    today: 0,
  });

  const loadFeeds = useCallback(async () => {
    const db = getDb();
    const rows = await getFeeds(db);
    setFeeds(rows);

    const starredRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM articles WHERE starred = 1'
    );
    const unreadRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM articles WHERE read = 0'
    );
    const todayRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM articles WHERE date(published_at) = date('now')"
    );

    setSmartCounts({
      starred: starredRow?.count ?? 0,
      unread: unreadRow?.count ?? 0,
      today: todayRow?.count ?? 0,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeeds();
    }, [loadFeeds])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await loadFeeds();
    } catch (e) {
      Alert.alert('Refresh failed', 'Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const onDeleteFeed = (feed: FeedRow) => {
    Alert.alert('Remove feed', `Remove "${feed.title ?? feed.url}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const db = getDb();
            await deleteFeed(db, feed.id);
            try {
              await loadFeeds();
            } catch {
              Alert.alert('Error', 'Feed removed but failed to refresh the list.');
            }
          } catch {
            Alert.alert('Error', 'Failed to remove feed.');
          }
        },
      },
    ]);
  };

  const onAddFeed = async () => {
    if (!addUrl.trim()) return;
    setAddLoading(true);
    let showingAlert = false;
    try {
      const detected = detectFeedType(addUrl.trim());
      let feedUrl = '';

      if (detected.type === 'reddit') {
        feedUrl = detected.url;
      } else if (detected.type === 'youtube') {
        const channelId = await resolveYouTubeChannelId(detected.originalUrl);
        if (!channelId) {
          Alert.alert('Error', 'Could not find YouTube channel RSS feed. Make sure the URL is a channel page.');
          return;
        }
        feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      } else {
        feedUrl = detected.url;
      }

      const db = getDb();
      const existing = await getFeedByUrl(db, feedUrl);
      if (existing) {
        Alert.alert('Already added', `"${existing.title ?? feedUrl}" is already in your feeds.`);
        return;
      }

      const result = await fetchFeed(feedUrl);
      if (result.status !== 'ok') {
        Alert.alert('Error', 'Could not fetch this feed. Check the URL and try again.');
        return;
      }

      const parsed = await parseFeed(result.text);
      if (!parsed) {
        Alert.alert('Error', 'This does not appear to be a valid RSS or Atom feed.');
        return;
      }

      showingAlert = true;
      Alert.alert(
        'Add Feed',
        `Add "${parsed.title ?? feedUrl}"?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setAddLoading(false),
          },
          {
            text: 'Add',
            onPress: async () => {
              try {
                await upsertFeed(db, { url: feedUrl, title: parsed.title, site_url: parsed.siteUrl });
                setAddUrl('');
                setAddVisible(false);
                try {
                  await loadFeeds();
                } catch {
                  Alert.alert('Error', 'Feed saved but failed to refresh the list.');
                }
              } catch {
                Alert.alert('Error', 'Failed to save feed.');
              } finally {
                setAddLoading(false);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      if (!showingAlert) {
        setAddLoading(false);
      }
    }
  };

  const renderDeleteAction = (feed: FeedRow) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => onDeleteFeed(feed)}
    >
      <Text style={styles.deleteActionText}>Remove</Text>
    </TouchableOpacity>
  );

  const renderFeedRow = (feed: FeedRow) => (
    <Swipeable renderRightActions={() => renderDeleteAction(feed)}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/feeds/${feed.id}`)}
        activeOpacity={0.7}
      >
        <Text style={styles.rowTitle} numberOfLines={1}>{feed.title ?? feed.url}</Text>
        {feed.unread_count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{feed.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Swipeable>
  );

  const getSmartCount = (id: string): number => {
    if (id === 'starred') return smartCounts.starred;
    if (id === 'unread') return smartCounts.unread;
    if (id === 'today') return smartCounts.today;
    return 0;
  };

  const sections = useMemo(() => [
    { title: 'Smart Feeds', data: SMART_FEEDS.map(s => ({ ...s, isSmart: true as const })) },
    { title: 'Feeds', data: feeds.map(f => ({ ...f, isSmart: false as const })) },
  ], [feeds]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity style={styles.headerBtn} onPress={() => setAddVisible(true)}>
              <Text style={styles.headerBtnText}>+</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => String((item as any).id)}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if ((item as any).isSmart) {
            const smart = item as typeof SMART_FEEDS[0] & { isSmart: true };
            const count = getSmartCount(smart.id);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/feeds/${smart.id}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowTitle}>{smart.label}</Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }
          return renderFeedRow(item as FeedRow);
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Add Feed modal */}
      <Modal visible={addVisible} animationType="slide" transparent presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add Feed</Text>
          <TextInput
            style={styles.input}
            value={addUrl}
            onChangeText={setAddUrl}
            placeholder="Paste RSS, YouTube, or Reddit URL"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn]}
              onPress={() => { setAddVisible(false); setAddUrl(''); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.confirmBtn, addLoading && { opacity: 0.5 }]}
              onPress={onAddFeed}
              disabled={addLoading}
            >
              {addLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { fontSize: 20, color: COLORS.accent },
  sectionHeader: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowTitle: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.text, flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11, color: '#fff' },
  deleteAction: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  deleteActionText: { fontFamily: FONTS.medium, color: '#fff', fontSize: 14 },
  modal: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 24,
    paddingTop: 48,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.text, marginBottom: 20 },
  input: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  cancelBtn: { backgroundColor: COLORS.border },
  cancelBtnText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text },
  confirmBtn: { backgroundColor: COLORS.accent },
  confirmBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
