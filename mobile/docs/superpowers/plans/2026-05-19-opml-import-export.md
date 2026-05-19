# OPML Import / Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OPML import (file picker → progress → summary) and export (generate → Share Sheet) via a new Settings screen, and remove the legacy bundled-subscription import.

**Architecture:** A pure `src/fetcher/opml.ts` module handles XML parsing and generation using `fast-xml-parser` (already installed). A new `app/settings.tsx` screen owns all I/O — file picking via `expo-document-picker`, temp file writing via `expo-file-system`, and sharing via `expo-sharing`. The feeds list header gets a gear icon linking to Settings.

**Tech Stack:** Expo Router, expo-document-picker, expo-sharing, expo-file-system, fast-xml-parser v5, bun test

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/fetcher/opml.ts` | Replace | Pure `parseOpml` and `buildOpml` functions |
| `test/opml.test.ts` | Create | Unit tests for parse/build |
| `app/settings.tsx` | Create | Import + Export UI |
| `app/feeds/index.tsx` | Modify | Add gear icon; remove TUI import |
| `src/assets/subscriptions.json` | Delete | No longer needed |
| `mobile/.gitignore` | Modify | Add `.superpowers/` |

---

## Task 1: Install new dependencies

**Files:**
- Modify: `package.json` (via expo install)

- [ ] **Step 1: Install packages**

```bash
cd mobile
npx expo install expo-document-picker expo-sharing
```

Expected output includes lines like:
```
✔ Installing 2 packages...
```

- [ ] **Step 2: Verify they appear in package.json**

```bash
grep -E 'expo-document-picker|expo-sharing' package.json
```

Expected:
```
"expo-document-picker": "~...",
"expo-sharing": "~...",
```

- [ ] **Step 3: Add .superpowers to .gitignore**

Append to `mobile/.gitignore`:
```
.superpowers/
```

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/.gitignore
git commit -m "chore: add expo-document-picker and expo-sharing deps"
```

---

## Task 2: Replace opml.ts with pure parse/build functions (TDD)

**Files:**
- Create: `mobile/test/opml.test.ts`
- Replace: `mobile/src/fetcher/opml.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/test/opml.test.ts`:

```ts
import { expect, test, describe } from 'bun:test';
import { parseOpml, buildOpml } from '../src/fetcher/opml';

const SIMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline type="rss" text="Feed One" title="Feed One"
      xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com"/>
    <outline type="rss" text="Feed Two" title="Feed Two"
      xmlUrl="https://other.com/rss"/>
  </body>
</opml>`;

const NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Nested</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Inner Feed" title="Inner Feed"
        xmlUrl="https://inner.com/feed.xml"/>
    </outline>
    <outline type="rss" text="Top Feed" title="Top Feed"
      xmlUrl="https://top.com/feed.xml"/>
  </body>
</opml>`;

describe('parseOpml', () => {
  test('parses flat list of feeds', () => {
    const feeds = parseOpml(SIMPLE_OPML);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual({
      url: 'https://example.com/feed.xml',
      title: 'Feed One',
      siteUrl: 'https://example.com',
    });
    expect(feeds[1]).toEqual({
      url: 'https://other.com/rss',
      title: 'Feed Two',
      siteUrl: undefined,
    });
  });

  test('flattens nested category outlines', () => {
    const feeds = parseOpml(NESTED_OPML);
    expect(feeds).toHaveLength(2);
    const urls = feeds.map(f => f.url);
    expect(urls).toContain('https://inner.com/feed.xml');
    expect(urls).toContain('https://top.com/feed.xml');
  });

  test('returns empty array for OPML with no feeds', () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head/><body/></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });

  test('throws on invalid XML', () => {
    expect(() => parseOpml('not xml at all <unclosed')).toThrow();
  });
});

describe('buildOpml', () => {
  test('produces valid OPML with feed entries', () => {
    const xml = buildOpml([
      { url: 'https://a.com/feed', title: 'A Feed', site_url: 'https://a.com' },
      { url: 'https://b.com/rss', title: null, site_url: null },
    ]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<opml');
    expect(xml).toContain('xmlUrl="https://a.com/feed"');
    expect(xml).toContain('xmlUrl="https://b.com/rss"');
    expect(xml).toContain('text="A Feed"');
  });

  test('escapes special characters in titles and URLs', () => {
    const xml = buildOpml([
      { url: 'https://a.com/feed?x=1&y=2', title: 'A & B <feed>', site_url: null },
    ]);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).not.toContain('A & B');
  });

  test('round-trips through parseOpml', () => {
    const original = [
      { url: 'https://a.com/feed', title: 'Alpha', site_url: 'https://a.com' },
      { url: 'https://b.com/rss', title: 'Beta', site_url: null },
    ];
    const xml = buildOpml(original);
    const parsed = parseOpml(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].url).toBe('https://a.com/feed');
    expect(parsed[0].title).toBe('Alpha');
    expect(parsed[1].url).toBe('https://b.com/rss');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd mobile
bun test test/opml.test.ts
```

Expected: errors about missing exports from `src/fetcher/opml`.

- [ ] **Step 3: Replace src/fetcher/opml.ts**

Replace the entire file with:

```ts
import { XMLParser } from 'fast-xml-parser';

interface OpmlOutline {
  '@_xmlUrl'?: string;
  '@_htmlUrl'?: string;
  '@_title'?: string;
  '@_text'?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

export function parseOpml(xml: string): { url: string; title?: string; siteUrl?: string }[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'outline',
  });
  const result = parser.parse(xml);
  if (!result?.opml?.body?.outline) return [];
  const feeds: { url: string; title?: string; siteUrl?: string }[] = [];
  extractFeeds(result.opml.body.outline, feeds);
  return feeds;
}

function extractFeeds(
  outlines: OpmlOutline | OpmlOutline[],
  feeds: { url: string; title?: string; siteUrl?: string }[]
): void {
  const list = Array.isArray(outlines) ? outlines : [outlines];
  for (const item of list) {
    if (item['@_xmlUrl']) {
      feeds.push({
        url: item['@_xmlUrl'],
        title: item['@_title'] || item['@_text'] || undefined,
        siteUrl: item['@_htmlUrl'] || undefined,
      });
    }
    if (item.outline) {
      extractFeeds(item.outline, feeds);
    }
  }
}

export function buildOpml(
  feeds: { url: string; title?: string | null; site_url?: string | null }[]
): string {
  const outlines = feeds
    .map((f) => {
      const text = escapeXml(f.title || f.url);
      const xmlUrl = escapeXml(f.url);
      const htmlUrl = f.site_url ? ` htmlUrl="${escapeXml(f.site_url)}"` : '';
      return `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}"${htmlUrl}/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Fressh Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd mobile
bun test test/opml.test.ts
```

Expected: all tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/fetcher/opml.ts mobile/test/opml.test.ts
git commit -m "feat: replace bundled-import opml.ts with pure parseOpml/buildOpml functions"
```

---

## Task 3: Create the Settings screen

**Files:**
- Create: `mobile/app/settings.tsx`

- [ ] **Step 1: Create app/settings.tsx**

```tsx
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
import * as FileSystem from 'expo-file-system';
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile
npx tsc --noEmit
```

Expected: no errors related to `app/settings.tsx`.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/settings.tsx
git commit -m "feat: add Settings screen with OPML import and export"
```

---

## Task 4: Update feeds list — add gear icon, remove TUI import

**Files:**
- Modify: `mobile/app/feeds/index.tsx`

- [ ] **Step 1: Update the import block**

Remove this import at the top of `mobile/app/feeds/index.tsx`:

```ts
import { importBundledSubscriptions, BUNDLED_FEED_COUNT } from '../../src/fetcher/opml';
```

- [ ] **Step 2: Remove the `importing` state and `onImportSubscriptions` handler**

Remove this state declaration:
```ts
const [importing, setImporting] = useState(false);
```

Remove the entire `onImportSubscriptions` function (roughly 20 lines starting with `const onImportSubscriptions = () => {`).

- [ ] **Step 3: Update the header to add a gear icon**

Replace the `Stack.Screen` options block:

```tsx
// Before
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

// After
<Stack.Screen
  options={{
    title: 'FRESSH',
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/settings')}>
          <Text style={styles.headerGearText}>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setAddVisible(true)}>
          <Text style={styles.headerBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    ),
  }}
/>
```

- [ ] **Step 4: Remove the TUI import link from the modal**

Remove this block inside the `<Modal>`:

```tsx
<TouchableOpacity style={styles.importLink} onPress={onImportSubscriptions}>
  <Text style={styles.importLinkText}>
    Import all {BUNDLED_FEED_COUNT} subscriptions from TUI
  </Text>
</TouchableOpacity>
```

- [ ] **Step 5: Remove the importing overlay**

Remove this block (after the closing `</Modal>` tag):

```tsx
{importing && (
  <View style={styles.importingOverlay}>
    <ActivityIndicator color={COLORS.accent} size="large" />
    <Text style={styles.importingText}>Importing subscriptions…</Text>
  </View>
)}
```

- [ ] **Step 6: Add missing styles and remove old ones**

Add to `StyleSheet.create({...})`:

```ts
headerGearText: {
  fontSize: 18,
  color: COLORS.textSecondary,
  lineHeight: 24,
},
```

Remove from `StyleSheet.create({...})`:

```ts
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
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add mobile/app/feeds/index.tsx
git commit -m "feat: add Settings gear icon to feeds header; remove TUI import button"
```

---

## Task 5: Delete the bundled subscriptions asset

**Files:**
- Delete: `mobile/src/assets/subscriptions.json`

- [ ] **Step 1: Delete the file**

```bash
git rm mobile/src/assets/subscriptions.json
```

- [ ] **Step 2: Run the full test suite to confirm nothing references it**

```bash
cd mobile
bun test test/
```

Expected: all tests pass.

- [ ] **Step 3: Commit and push**

```bash
git commit -m "chore: remove bundled subscriptions.json (~300KB)"
git push
```

---

## Task 6: Close the GitHub issue

- [ ] **Step 1: Close issue #5**

```bash
gh issue close 5 --repo caritos/fressh --comment "Implemented in Settings screen: Import OPML (file picker → progress → summary) and Export OPML (iOS Share Sheet). Removed the bundled TUI subscription import."
```
