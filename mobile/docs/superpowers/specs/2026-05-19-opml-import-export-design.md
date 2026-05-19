# OPML Import / Export — Design Spec

**Date:** 2026-05-19
**Issue:** [#5 — be able to import / export opml file](https://github.com/caritos/fressh/issues/5)

## Summary

Add OPML import and export to the Fressh mobile app via a new Settings screen. Remove the existing "Import all subscriptions from TUI" button. The feature lets users bring in feeds from any RSS reader that exports OPML and share their Fressh subscriptions with other apps.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `app/settings.tsx` | Settings screen with Import and Export rows |
| `src/fetcher/opml.ts` | Pure OPML parse/export functions (replaces bundled-import module) |

### Modified Files

| File | Change |
|------|--------|
| `app/feeds/index.tsx` | Add gear icon to header; remove "Import from TUI" link and `importing` state |

### New Dependencies

| Package | Purpose |
|---------|---------|
| `expo-document-picker` | iOS file picker for selecting .opml files |
| `expo-sharing` | iOS Share Sheet for exporting the generated file |

`fast-xml-parser` and `expo-file-system` are already installed.

---

## `src/fetcher/opml.ts`

Pure functions — no I/O. Callers pass in strings and get strings/arrays back. This makes the module testable without any native module setup.

```ts
// Parse an OPML XML string → array of feeds
parseOpml(xml: string): { url: string; title?: string; siteUrl?: string }[]

// Build an OPML XML string from feeds
buildOpml(feeds: { url: string; title?: string; site_url?: string }[]): string
```

Uses `fast-xml-parser` (already in deps, same library as the console). Handles nested category outlines by flattening them — Fressh has no feed groups.

Replaces the current module which only did `importBundledSubscriptions()` from a JSON asset. That function and the `BUNDLED_FEED_COUNT` constant are removed.

---

## Settings Screen (`app/settings.tsx`)

A standard Expo Router screen pushed from the feeds list header gear icon.

**Header:** Back button (auto, from Expo Router stack) + title "Settings"

**Sections:**

```
SUBSCRIPTIONS
  Import OPML        Add feeds from an .opml file        ›
  Export OPML        Share your subscriptions as a file  ›
```

Each row is a `TouchableOpacity` using the existing `Row` component pattern.

### Import Flow

1. `DocumentPicker.getDocumentAsync({ type: ['text/xml', 'application/xml', '*/*'] })` — opens iOS file picker
2. Read file contents with `FileSystem.readAsStringAsync(uri)`
3. Call `parseOpml(xml)` → array of feed entries
4. Show progress UI: `"Adding 3 of 12 feeds…"` with a simple count display
5. Loop: for each feed, call `getFeedByUrl` (skip if exists), then `upsertFeed`
6. On completion, show Alert: `"Added 9 feeds. 3 were already in your list."`

Progress state: `{ current: number; total: number }` — rendered as text in the screen body while import is running. No modal or overlay — the screen itself shows the progress.

### Export Flow

1. Call `getFeeds(db)` to get all current feeds
2. Call `buildOpml(feeds)` → XML string
3. Write to `FileSystem.cacheDirectory + 'fressh-subscriptions.opml'` via `FileSystem.writeAsStringAsync`
4. Call `Sharing.shareAsync(fileUri, { mimeType: 'text/xml', UTI: 'public.xml' })` → iOS Share Sheet

---

## Navigation

The gear icon sits in the feeds list header, left of the existing `+` button:

```tsx
<Stack.Screen
  options={{
    headerRight: () => (
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAddVisible(true)}>
          <Text>+</Text>
        </TouchableOpacity>
      </View>
    ),
  }}
/>
```

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| User cancels file picker | `DocumentPicker` returns `cancelled` — silently ignore |
| File is not valid OPML | `parseOpml` throws → catch → Alert "This doesn't look like a valid OPML file." |
| Individual feed fails to insert | Skip and count as error; include in summary: "Added 8, skipped 3, 1 error." |
| No feeds to export | Alert "You have no feeds to export." — skip Share Sheet |
| `expo-sharing` unavailable | Show Alert with the file path as fallback |

---

## Removed

- `importBundledSubscriptions()` function in `src/fetcher/opml.ts`
- `BUNDLED_FEED_COUNT` constant
- "Import all X subscriptions from TUI" link in the Add Feed modal
- `importing` state and `importingOverlay` styles in `app/feeds/index.tsx`
- `src/assets/subscriptions.json` bundled feed list (large file — removes ~300KB from the bundle)

---

## Out of Scope

- Feed picker / selective import (user imports all, duplicates skipped)
- OPML category/folder support (feeds are flat in Fressh)
- Android (iOS-only app)
