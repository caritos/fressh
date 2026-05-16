# Braun Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the fressh mobile app with a Braun/Bauhaus aesthetic — light palette, Barlow typography, orange accent, shared UI components.

**Architecture:** Update design tokens in `src/constants.ts`, load Barlow via `@expo-google-fonts/barlow`, extract four shared UI components (`Row`, `SectionHeader`, `Badge`, `NavBar`) into `src/components/ui/`, then update all three screens to use them.

**Tech Stack:** Expo 55, React Native 0.83, expo-font, `@expo-google-fonts/barlow`, TypeScript

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/constants.ts` | Design tokens: COLORS + FONTS |
| Modify | `app/_layout.tsx` | Load Barlow fonts, update Stack header styles |
| Create | `src/components/ui/Badge.tsx` | Orange count pill, hidden at 0 |
| Create | `src/components/ui/SectionHeader.tsx` | Grey section label bar |
| Create | `src/components/ui/Row.tsx` | Full-width list row with optional meta + badge |
| Create | `src/components/ui/NavBar.tsx` | Prev/Next bottom bar for article reader |
| Modify | `app/feeds/index.tsx` | Feeds list screen |
| Modify | `app/feeds/[feedId]/index.tsx` | Article list screen |
| Modify | `app/feeds/[feedId]/[articleId].tsx` | Article reader screen |

---

## Task 1: Update design tokens

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Replace `src/constants.ts` entirely**

```typescript
export const FONTS = {
  sans: 'Barlow-Regular',
  sansMedium: 'Barlow-Medium',
  sansBold: 'Barlow-Bold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
  monoBold: 'JetBrainsMono-Bold',
};

export const COLORS = {
  background: '#F5F5F0',
  surface: '#EBEBEB',
  surfaceAlt: '#E4E4DF',
  border: '#D0D0C8',
  text: '#111111',
  textSecondary: '#888888',
  textDimmed: '#BBBBB0',
  accent: '#E8500A',
};
```

- [ ] **Step 2: Install Barlow font package**

```bash
cd mobile && npm install @expo-google-fonts/barlow
```

Expected: package added, `package-lock.json` updated.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/constants.ts mobile/package.json mobile/package-lock.json
git commit -m "feat: update design tokens for Braun palette"
```

---

## Task 2: Load Barlow in root layout

**Files:**
- Modify: `app/_layout.tsx`

The `useFonts` call must map the string values from `FONTS` to font assets. Barlow comes from the npm package; JetBrains Mono is already in `assets/fonts/`.

- [ ] **Step 1: Replace `app/_layout.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb } from '../src/db/database';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export default function RootLayout() {
  const lastFetchAt = useRef<number | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    [FONTS.sans]: Barlow_400Regular,
    [FONTS.sansMedium]: Barlow_500Medium,
    [FONTS.sansBold]: Barlow_700Bold,
    [FONTS.mono]: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    [FONTS.monoMedium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    [FONTS.monoBold]: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    async function init() {
      try {
        await initDb();
        setDbReady(true);
        await registerBackgroundFetch();
        lastFetchAt.current = Date.now();
        refresh().catch(console.error);
      } catch (e) {
        console.error('App init error:', e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    init();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (!lastFetchAt.current || now - lastFetchAt.current > FOREGROUND_REFRESH_INTERVAL_MS) {
        lastFetchAt.current = now;
        refresh().catch(console.error);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;
  if (!dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: FONTS.sansBold, fontSize: 14, letterSpacing: 0.5 },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="feeds/index" options={{ title: 'FRESSH' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Start the app and verify fonts load without crashing**

```bash
cd mobile && npx expo start --dev-client
```

Open on device/simulator. The app should launch with the fonts loaded. If you see a "fontFamily not found" error, check that the `FONTS.*` string values in `constants.ts` exactly match the keys passed to `useFonts`. The screen will look unstyled/broken — that's expected until Task 7–9.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/_layout.tsx
git commit -m "feat: load Barlow fonts in root layout"
```

---

## Task 3: Create `Badge` component

**Files:**
- Create: `src/components/ui/Badge.tsx`

- [ ] **Step 1: Create `src/components/ui/Badge.tsx`**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';

type Props = { count: number };

export default function Badge({ count }: Props) {
  if (count === 0) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
  },
  text: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: '#fff',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/ui/Badge.tsx
git commit -m "feat: add Badge UI component"
```

---

## Task 4: Create `SectionHeader` component

**Files:**
- Create: `src/components/ui/SectionHeader.tsx`

- [ ] **Step 1: Create `src/components/ui/SectionHeader.tsx`**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';

type Props = { title: string };

export default function SectionHeader({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    backgroundColor: COLORS.surfaceAlt,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  text: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.62,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/ui/SectionHeader.tsx
git commit -m "feat: add SectionHeader UI component"
```

---

## Task 5: Create `Row` component

**Files:**
- Create: `src/components/ui/Row.tsx`

`Row` is the core list primitive. When `meta` is provided the label allows 2 lines and the timestamp renders below. When `dimmed` is true, the label switches to Regular weight and `textDimmed` colour — this replaces the `opacity: 0.4` read-state used previously.

- [ ] **Step 1: Create `src/components/ui/Row.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';
import Badge from './Badge';

type Props = {
  label: string;
  meta?: string;
  badge?: number;
  dimmed?: boolean;
  onPress: () => void;
};

export default function Row({ label, meta, badge, dimmed, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
        <Text
          style={[styles.label, dimmed && styles.labelDimmed]}
          numberOfLines={meta ? 2 : 1}
        >
          {label}
        </Text>
        {meta ? (
          <Text style={[styles.meta, dimmed && styles.metaDimmed]}>{meta}</Text>
        ) : null}
      </View>
      {badge !== undefined && <Badge count={badge} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  content: { flex: 1, marginRight: 8 },
  label: {
    fontFamily: FONTS.sansMedium,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  labelDimmed: {
    fontFamily: FONTS.sans,
    color: COLORS.textDimmed,
  },
  meta: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  metaDimmed: {
    color: COLORS.textDimmed,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/ui/Row.tsx
git commit -m "feat: add Row UI component"
```

---

## Task 6: Create `NavBar` component

**Files:**
- Create: `src/components/ui/NavBar.tsx`

`NavBar` takes `paddingBottom` so the article reader can pass `insets.bottom` for safe-area handling, keeping that concern out of the component itself.

- [ ] **Step 1: Create `src/components/ui/NavBar.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';

type Props = {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  paddingBottom?: number;
};

export default function NavBar({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  paddingBottom = 0,
}: Props) {
  return (
    <View style={[styles.bar, { paddingBottom }]}>
      <TouchableOpacity style={styles.btn} onPress={onPrev} disabled={prevDisabled}>
        <Text style={[styles.btnText, prevDisabled && styles.btnTextDisabled]}>
          ‹ Prev
        </Text>
      </TouchableOpacity>
      <View style={styles.divider} />
      <TouchableOpacity style={styles.btn} onPress={onNext} disabled={nextDisabled}>
        <Text style={[styles.btnText, nextDisabled && styles.btnTextDisabled]}>
          Next ›
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 52,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnText: {
    fontFamily: FONTS.sansBold,
    fontSize: 15,
    color: COLORS.accent,
  },
  btnTextDisabled: {
    color: COLORS.textDimmed,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/ui/NavBar.tsx
git commit -m "feat: add NavBar UI component"
```

---

## Task 7: Update feeds list screen

**Files:**
- Modify: `app/feeds/index.tsx`

Changes: emoji removed from smart feed labels; `renderFeedRow` uses `<Row>`; section headers use `<SectionHeader>`; `+` button is orange Barlow 300; delete swipe is `#C0392B`; Add Feed modal updated throughout.

- [ ] **Step 1: Replace `app/feeds/index.tsx`**

```tsx
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
import { importBundledSubscriptions, BUNDLED_FEED_COUNT } from '../../src/fetcher/opml';
import { FONTS, COLORS } from '../../src/constants';
import Row from '../../src/components/ui/Row';
import SectionHeader from '../../src/components/ui/SectionHeader';

const SMART_FEEDS = [
  { id: 'starred', label: 'Starred' },
  { id: 'unread', label: 'All Unread' },
  { id: 'today', label: 'Today' },
];

export default function FeedsScreen() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const onImportSubscriptions = () => {
    Alert.alert(
      'Import Subscriptions',
      `Import ${BUNDLED_FEED_COUNT} feeds from your TUI subscription list? Feeds already added will be skipped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setImporting(true);
            setAddVisible(false);
            try {
              const inserted = await importBundledSubscriptions();
              await loadFeeds();
              Alert.alert('Done', `Imported ${inserted} new feeds.`);
            } catch {
              Alert.alert('Error', 'Import failed. Please try again.');
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
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
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'FRESSH',
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
                onPress={() => router.push(`/feeds/${feed.id}`)}
              />
            </Swipeable>
          );
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

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
          <TouchableOpacity style={styles.importLink} onPress={onImportSubscriptions}>
            <Text style={styles.importLinkText}>
              Import all {BUNDLED_FEED_COUNT} subscriptions from TUI
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {importing && (
        <View style={styles.importingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.importingText}>Importing subscriptions…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: {
    fontSize: 26,
    fontFamily: FONTS.sans,
    fontWeight: '300',
    color: COLORS.accent,
    lineHeight: 30,
  },
  deleteAction: {
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  deleteActionText: { fontFamily: FONTS.sansBold, color: '#fff', fontSize: 13 },
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
  importLink: { marginTop: 24, alignItems: 'center' },
  importLinkText: { fontFamily: FONTS.sans, fontSize: 13, color: COLORS.textSecondary },
  importingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,245,240,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  importingText: { fontFamily: FONTS.sansMedium, fontSize: 15, color: COLORS.text },
});
```

- [ ] **Step 2: Verify feeds list visually**

Run the app. Open the Feeds screen. Check:
- Background is off-white `#F5F5F0`, not black
- "Smart Feeds" / "Feeds" section headers are in small mono caps on a grey bar
- Feed rows use Barlow, unread badge is orange
- Smart feed labels have no emoji
- Swipe left on a feed — "Remove" button is dark red `#C0392B`
- Tap `+` — Add Feed modal opens; title is Barlow Bold, confirm button is orange

- [ ] **Step 3: Commit**

```bash
git add mobile/app/feeds/index.tsx
git commit -m "feat: apply Braun design to feeds list screen"
```

---

## Task 8: Update article list screen

**Files:**
- Modify: `app/feeds/[feedId]/index.tsx`

Changes: `renderItem` uses `<Row>`; starred articles get a `★ ` prefix; swipe action colours updated; "Mark All Read" is orange text.

- [ ] **Step 1: Replace `app/feeds/[feedId]/index.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify article list visually**

Open a feed. Check:
- Background is off-white, rows use Barlow
- Read articles are muted (`#BBBBB0` text), not greyed-out blobs
- Timestamps are in small mono caps below the title
- Starred articles show `★` prefix in plain text
- Swipe right → star (dark gold), share (dark grey)
- Swipe left → Read (orange) / Unread (dark grey)
- "Mark All Read" header text is orange

- [ ] **Step 3: Commit**

```bash
git add mobile/app/feeds/\[feedId\]/index.tsx
git commit -m "feat: apply Braun design to article list screen"
```

---

## Task 9: Update article reader screen

**Files:**
- Modify: `app/feeds/[feedId]/[articleId].tsx`

Changes: meta/title/author/body typography updated; "Open in Browser" button is sharp-cornered orange; star/share header icons are orange; `<NavBar>` replaces the inline nav bar.

- [ ] **Step 1: Replace `app/feeds/[feedId]/[articleId].tsx`**

```tsx
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useLocalSearchParams, Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import YoutubePlayer from 'react-native-youtube-iframe';
import { getDb } from '../../../src/db/database';
import { getArticle, toggleStar, getArticles, type ArticleRow } from '../../../src/db/queries';
import { FONTS, COLORS } from '../../../src/constants';
import NavBar from '../../../src/components/ui/NavBar';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getBody(article: ArticleRow): string {
  if (article.content_text?.trim()) return article.content_text;
  if (article.content_html?.trim()) return stripHtml(article.content_html);
  if (article.summary?.trim()) return article.summary;
  return '(No content available — open in browser to read the full article.)';
}

export default function ArticleReaderScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { feedId, articleId } = useLocalSearchParams<{ feedId: string; articleId: string }>();
  if (Array.isArray(feedId) || Array.isArray(articleId)) return null;

  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [articleList, setArticleList] = useState<ArticleRow[]>([]);

  const loadArticle = useCallback(async () => {
    try {
      const db = getDb();
      const a = await getArticle(db, Number(articleId));
      setArticle(a);
    } catch (e) {
      console.error('ArticleReader load error:', e);
    }
  }, [articleId]);

  const loadList = useCallback(async () => {
    try {
      const db = getDb();
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader loadList error:', e);
    }
  }, [feedId]);

  useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [loadArticle, loadList]));

  if (!article) return null;

  const youtubeId = getYouTubeId(article.url);
  const videoHeight = Math.round((width - 40) * (9 / 16));
  const currentIndex = articleList.findIndex((a) => a.id === article.id);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle = currentIndex < articleList.length - 1 ? articleList[currentIndex + 1] : null;

  const onStar = async () => {
    try {
      const db = getDb();
      await toggleStar(db, article.id);
      await loadArticle();
    } catch (e) {
      console.error('toggleStar error:', e);
    }
  };

  const onShare = async () => {
    if (!article.url) return;
    try {
      await Share.share({ url: article.url, message: article.title ?? '' });
    } catch (e) {
      console.error('share error:', e);
    }
  };

  const onOpenBrowser = async () => {
    if (!article.url) return;
    try {
      await WebBrowser.openBrowserAsync(article.url);
    } catch (e) {
      console.error('openBrowser error:', e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen
        options={{
          title: article.feed_title ?? '',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={onStar} hitSlop={8}>
                <Text style={styles.headerActionBtn}>
                  {article.starred === 1 ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} hitSlop={8}>
                <Text style={styles.headerActionBtn}>↑</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 20 }]}
      >
        <Text style={styles.meta}>
          {article.feed_title}{'  ·  '}{formatDate(article.published_at)}
        </Text>
        <Text style={styles.title}>{article.title ?? 'Untitled'}</Text>
        {article.author ? (
          <Text style={styles.author}>by {article.author}</Text>
        ) : null}

        {youtubeId ? (
          <YoutubePlayer height={videoHeight} videoId={youtubeId} play={false} />
        ) : (
          <>
            <Text style={styles.body}>{getBody(article)}</Text>
            {article.url ? (
              <TouchableOpacity style={styles.browserBtn} onPress={onOpenBrowser}>
                <Text style={styles.browserBtnText}>Open in Browser</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>

      <NavBar
        onPrev={() => prevArticle && router.replace(`/feeds/${feedId}/${prevArticle.id}`)}
        onNext={() => nextArticle && router.replace(`/feeds/${feedId}/${nextArticle.id}`)}
        prevDisabled={!prevArticle}
        nextDisabled={!nextArticle}
        paddingBottom={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  meta: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 30,
    marginBottom: 8,
  },
  author: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 32,
  },
  browserBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 3,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  browserBtnText: { fontFamily: FONTS.sansBold, fontSize: 15, color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerActionBtn: {
    fontFamily: FONTS.sans,
    fontSize: 18,
    color: COLORS.accent,
  },
});
```

- [ ] **Step 2: Verify article reader visually**

Open an article. Check:
- Background is off-white
- Meta line (feed name · date) is small mono caps
- Title is large Barlow Bold
- Body text is Barlow Regular, comfortable line height
- "Open in Browser" button is sharp-cornered orange
- Star (☆/★) and share (↑) in header are orange
- Bottom Prev/Next bar: orange text on grey bar, disabled side is muted

- [ ] **Step 3: Commit**

```bash
git add mobile/app/feeds/\[feedId\]/\[articleId\].tsx
git commit -m "feat: apply Braun design to article reader screen"
```

---

## Done

All three screens should now display the Braun/Bauhaus design: off-white `#F5F5F0` backgrounds, Barlow typography, `#E8500A` orange accent, JetBrains Mono for metadata and section labels, shared `Row` / `SectionHeader` / `Badge` / `NavBar` components.
