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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getDb } from '../../src/db/database';
import { getFeeds, upsertFeed, deleteFeed, getFeedByUrl, type FeedRow } from '../../src/db/queries';
import { detectFeedType } from '../../src/fetcher/detect';
import { resolveYouTubeChannelId, fetchFeed } from '../../src/fetcher/fetch';
import { parseFeed } from '../../src/fetcher/parser';
import { refresh } from '../../src/fetcher/refresh';
import { FONTS, COLORS } from '../../src/constants';
import Row from '../../src/components/ui/Row';
import SectionHeader from '../../src/components/ui/SectionHeader';

const SMART_FEEDS = [
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
];

const TOOLBAR_HEIGHT = 50;

export default function FeedsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      const summary = await refresh();
      await loadFeeds();
      if (summary.newArticles > 0) {
        Alert.alert('Refreshed', `${summary.newArticles} new article${summary.newArticles === 1 ? '' : 's'}.`);
      }
    } catch {
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
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      if (!showingAlert) {
        setAddLoading(false);
      }
    }
  };

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <SectionList
        sections={sections}
        keyExtractor={(item) => String((item as any).id)}
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} />
        )}
        renderItem={({ item }) => {
          if ((item as any).isSmart) {
            const smart = item as typeof SMART_FEEDS[0] & { isSmart: true };
            const count = getSmartCount(smart.id);
            return (
              <Row
                label={smart.label}
                badge={count}
                onPress={() => router.push(`/feeds/${smart.id}`)}
              />
            );
          }
          const feed = item as FeedRow & { isSmart: false };
          const faviconUrl = (() => {
            try {
              const { hostname } = new URL(feed.site_url ?? feed.url);
              return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
            } catch { return undefined; }
          })();
          return (
            <Swipeable
              renderRightActions={() => (
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={() => onDeleteFeed(feed)}
                >
                  <Text style={styles.deleteActionText}>Remove</Text>
                </TouchableOpacity>
              )}
            >
              <Row
                label={feed.title ?? feed.url}
                badge={feed.unread_count}
                icon={faviconUrl}
                onPress={() => router.push(`/feeds/${feed.id}`)}
              />
            </Swipeable>
          );
        }}
        renderSectionFooter={({ section }) => {
          if (section.title === 'Feeds' && feeds.length === 0) {
            return (
              <View style={styles.emptyHint}>
                <Text style={styles.emptyHintText}>
                  Tap <Text style={styles.emptyHintAccent}>+</Text> to add your first feed, or use{' '}
                  <Text style={styles.emptyHintAccent}>Settings</Text> to import an OPML file.
                </Text>
              </View>
            );
          }
          return null;
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: TOOLBAR_HEIGHT + insets.bottom + 16 }}
      />

      {/* Bottom action bar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.toolbarDivider} />
        <TouchableOpacity style={styles.toolbarBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.accent} />
            : <Text style={styles.toolbarRefreshText}>↻</Text>}
        </TouchableOpacity>
        <View style={styles.toolbarDivider} />
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setAddVisible(true)}>
          <Text style={styles.toolbarAddText}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={addVisible} animationType="slide" presentationStyle="pageSheet">
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
  emptyHint: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyHintText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  emptyHintAccent: {
    color: COLORS.accent,
    fontFamily: FONTS.sansMedium,
  },
  deleteAction: {
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  deleteActionText: { fontFamily: FONTS.sansBold, color: '#fff', fontSize: 13 },
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
  toolbarRefreshText: {
    fontSize: 22,
    color: COLORS.accent,
    lineHeight: 26,
  },
  toolbarAddText: {
    fontSize: 28,
    fontFamily: FONTS.sans,
    fontWeight: '300',
    color: COLORS.accent,
    lineHeight: 32,
  },
  modal: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 24,
    paddingTop: 48,
  },
  modalTitle: { fontFamily: FONTS.sansBold, fontSize: 18, color: COLORS.text, marginBottom: 20 },
  input: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 3, paddingVertical: 13, alignItems: 'center' },
  cancelBtn: { backgroundColor: COLORS.border },
  cancelBtnText: { fontFamily: FONTS.sansMedium, fontSize: 14, color: COLORS.text },
  confirmBtn: { backgroundColor: COLORS.accent },
  confirmBtnText: { fontFamily: FONTS.sansBold, fontSize: 14, color: '#fff' },
});
