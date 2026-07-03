import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Stack } from 'expo-router';
import { Linking } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDb } from '../src/db/database';
import { getFeeds, upsertFeed, getFeedByUrl } from '../src/db/queries';
import { parseOpml, buildOpml } from '../src/fetcher/opml';
import { FONTS, COLORS } from '../src/constants';

async function importOpmlXml(xml: string): Promise<{ added: number; skipped: number; errors: number }> {
  const feeds = parseOpml(xml);
  if (feeds.length === 0) throw new Error('NO_FEEDS');
  const db = getDb();
  let added = 0, skipped = 0, errors = 0;
  for (const feed of feeds) {
    try {
      const existing = await getFeedByUrl(db, feed.url);
      if (existing) { skipped++; continue; }
      await upsertFeed(db, { url: feed.url, title: feed.title, site_url: feed.siteUrl });
      added++;
    } catch { errors++; }
  }
  return { added, skipped, errors };
}

export default function SettingsScreen() {
  const [exporting, setExporting] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onImportPaste = async () => {
    const xml = pasteText.trim();
    if (!xml) return;
    setPasteLoading(true);
    try {
      const { added, skipped, errors } = await importOpmlXml(xml);
      setPasteText('');
      setPasteVisible(false);
      const parts = [`Added ${added} feed${added === 1 ? '' : 's'}.`];
      if (skipped > 0) parts.push(`${skipped} already in your list.`);
      if (errors > 0) parts.push(`${errors} failed.`);
      Alert.alert('Import complete', parts.join(' '));
    } catch (e: any) {
      if (e?.message === 'NO_FEEDS') {
        Alert.alert('No feeds found', 'No feed subscriptions found in this OPML.');
      } else {
        Alert.alert('Invalid OPML', "This doesn't look like a valid OPML file.");
      }
    } finally {
      setPasteLoading(false);
    }
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
          onPress={() => setPasteVisible(true)}
          disabled={exporting}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Paste OPML</Text>
            <Text style={styles.rowSubtitle}>Paste OPML XML directly</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={onExport}
          disabled={exporting}
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

      <Text style={styles.sectionLabel}>About</Text>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Fressh</Text>
            <Text style={styles.rowSubtitle}>Clean RSS reader for iPhone</Text>
          </View>
          <Text style={styles.rowVersion}>
            v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Developer</Text>
            <Text style={styles.rowSubtitle}>Eladio Caritos</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('https://fressh.caritos.com/support').catch(() => Alert.alert('Unable to open link'))}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Support</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('https://fressh.caritos.com/privacy').catch(() => Alert.alert('Unable to open link'))}
          activeOpacity={0.6}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Paste OPML modal */}
      <Modal visible={pasteVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { paddingBottom: 24 + keyboardHeight }]}>
          <Text style={styles.modalTitle}>Paste OPML</Text>
          <Text style={styles.modalSubtitle}>
            Paste the contents of an OPML file below.
          </Text>
          <ScrollView style={styles.pasteScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.pasteInput}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={'<?xml version="1.0"?>\n<opml version="1.0">…'}
              placeholderTextColor={COLORS.textSecondary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </ScrollView>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn]}
              onPress={() => { setPasteVisible(false); setPasteText(''); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.confirmBtn, pasteLoading && { opacity: 0.5 }]}
              onPress={onImportPaste}
              disabled={pasteLoading || !pasteText.trim()}
            >
              {pasteLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Import</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  rowVersion: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.textDimmed,
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
  modal: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 24,
    paddingTop: 48,
  },
  modalTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  pasteScroll: {
    flex: 1,
    marginBottom: 16,
  },
  pasteInput: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    padding: 12,
    minHeight: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 3, paddingVertical: 13, alignItems: 'center' },
  cancelBtn: { backgroundColor: COLORS.border },
  cancelBtnText: { fontFamily: FONTS.sansMedium, fontSize: 14, color: COLORS.text },
  confirmBtn: { backgroundColor: COLORS.accent },
  confirmBtnText: { fontFamily: FONTS.sansBold, fontSize: 14, color: '#fff' },
});
