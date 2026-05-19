import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDb } from '../src/db/database';
import { getFeeds, upsertFeed, getFeedByUrl } from '../src/db/queries';
import { parseOpml, buildOpml } from '../src/fetcher/opml';
import { FONTS, COLORS } from '../src/constants';

export default function SettingsScreen() {
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const onImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/xml', 'application/xml', 'public.xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    let xml: string;
    try {
      xml = await FileSystem.readAsStringAsync(picked.assets[0].uri);
    } catch {
      Alert.alert('Error', 'Could not read the selected file.');
      return;
    }

    let feeds: { url: string; title?: string; siteUrl?: string }[];
    try {
      feeds = parseOpml(xml);
    } catch {
      Alert.alert('Invalid file', "This doesn't look like a valid OPML file.");
      return;
    }

    if (feeds.length === 0) {
      Alert.alert('No feeds found', 'The OPML file contained no feed subscriptions.');
      return;
    }

    const db = getDb();
    let added = 0;
    let skipped = 0;
    let errors = 0;

    setImportProgress({ current: 0, total: feeds.length });

    for (let i = 0; i < feeds.length; i++) {
      setImportProgress({ current: i + 1, total: feeds.length });
      const feed = feeds[i];
      try {
        const existing = await getFeedByUrl(db, feed.url);
        if (existing) {
          skipped++;
          continue;
        }
        await upsertFeed(db, { url: feed.url, title: feed.title, site_url: feed.siteUrl });
        added++;
      } catch {
        errors++;
      }
    }

    setImportProgress(null);

    const parts = [`Added ${added} feed${added === 1 ? '' : 's'}.`];
    if (skipped > 0) parts.push(`${skipped} already in your list.`);
    if (errors > 0) parts.push(`${errors} failed.`);
    Alert.alert('Import complete', parts.join(' '));
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const db = getDb();
      const feeds = await getFeeds(db);
      if (feeds.length === 0) {
        Alert.alert('Nothing to export', 'You have no feeds to export.');
        return;
      }
      const xml = buildOpml(feeds);
      const fileUri = FileSystem.cacheDirectory + 'fressh-subscriptions.opml';
      await FileSystem.writeAsStringAsync(fileUri, xml, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/xml', UTI: 'public.xml' });
    } catch {
      Alert.alert('Export failed', 'Something went wrong. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Text style={styles.sectionLabel}>Subscriptions</Text>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={onImport}
          disabled={importProgress !== null || exporting}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Import OPML</Text>
            <Text style={styles.rowSubtitle}>Add feeds from an .opml file</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={onExport}
          disabled={exporting || importProgress !== null}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Export OPML</Text>
            <Text style={styles.rowSubtitle}>Share your subscriptions as a file</Text>
          </View>
          {exporting
            ? <ActivityIndicator color={COLORS.accent} />
            : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {importProgress && (
        <View style={styles.progress}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.progressText}>
            Adding {importProgress.current} of {importProgress.total} feeds…
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  sectionLabel: {
    fontFamily: FONTS.sansBold,
    fontSize: 10,
    letterSpacing: 0.1,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 8,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: FONTS.sansMedium,
    fontSize: 15,
    color: COLORS.text,
  },
  rowSubtitle: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontFamily: FONTS.sans,
    fontSize: 20,
    color: COLORS.textDimmed,
    lineHeight: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 16,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  progressText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
