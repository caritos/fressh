# Configurable Database Path (Mobile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On first launch, show a setup screen where the user chooses the database location (app-local storage or a custom path such as an iCloud Drive folder). Subsequent launches use the configured path.

**Architecture:** A lightweight JSON config file (`fressh-config.json`) stored in the app's document directory persists the database path. `initDb` accepts the configured path. The root layout checks for a completed setup before mounting the main app; if setup is incomplete, the setup screen is shown instead.

**Tech Stack:** Expo 55, expo-sqlite ~55.0.16, expo-file-system (transitive dep, already available), React Native 0.83.6, expo-router

---

### Schema note

The mobile SQLite schema (`feeds` + `articles` tables) is identical to the terminal app's schema. If both apps point to the same database file (e.g., a shared iCloud folder), they share data seamlessly.

---

### Task 1: Create `mobile/src/db/config.ts`

Reads and writes `{documentDirectory}fressh-config.json`. Exposes two things: the configured database path (or `null` if not yet set), and a save function.

**Files:**
- Create: `mobile/src/db/config.ts`

The config JSON shape:
```json
{ "databasePath": "/absolute/path/to/fressh.db" }
```

- [ ] **Step 1: Create the file**

`mobile/src/db/config.ts`:
```typescript
import * as FileSystem from 'expo-file-system';

const CONFIG_URI = FileSystem.documentDirectory + 'fressh-config.json';

export interface DbConfig {
  databasePath: string;
}

export async function loadDbConfig(): Promise<DbConfig | null> {
  try {
    const info = await FileSystem.getInfoAsync(CONFIG_URI);
    if (!info.exists) return null;
    const text = await FileSystem.readAsStringAsync(CONFIG_URI);
    return JSON.parse(text) as DbConfig;
  } catch {
    return null;
  }
}

export async function saveDbConfig(config: DbConfig): Promise<void> {
  await FileSystem.writeAsStringAsync(CONFIG_URI, JSON.stringify(config));
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/db/config.ts
git commit -m "feat: add db config reader/writer for configurable database path"
```

---

### Task 2: Modify `mobile/src/db/database.ts` — accept path parameter

`initDb` currently opens `'fressh.db'` from the expo-sqlite default directory. It must now accept the configured path. When a path is provided, it is used; when `null` is passed, the default behavior is preserved.

**Files:**
- Modify: `mobile/src/db/database.ts`

The `openDatabaseAsync` signature is:
```typescript
openDatabaseAsync(databaseName: string, options?: SQLiteOpenOptions, directory?: string): Promise<SQLiteDatabase>
```

If `databaseName` is just a filename (no `/`), `expo-sqlite` prepends the `directory` (or the default). To open at a full absolute path like `/private/var/mobile/.../fressh.db`, pass the full path as `databaseName` — the `createDatabasePath` util in expo-sqlite passes it through unchanged when it already contains the full directory structure.

Actually, `createDatabasePath` always joins `resolvedDirectory + '/' + databaseName`, so to use an absolute path we need to pass `directory` as the parent directory and just the filename as `databaseName`. The helper function below splits the path correctly.

- [ ] **Step 1: Update `initDb` to accept a path**

Replace the current `initDb` function in `mobile/src/db/database.ts`:

```typescript
import * as SQLite from 'expo-sqlite';
import { CREATE_SCHEMA_VERSION, CREATE_FEEDS, CREATE_ARTICLES, CREATE_INDEXES } from './schema';

const SCHEMA_VERSION = 1;

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export async function initDb(absolutePath?: string): Promise<void> {
  if (_db) return;
  if (absolutePath) {
    const lastSlash = absolutePath.lastIndexOf('/');
    const directory = absolutePath.slice(0, lastSlash);
    const filename = absolutePath.slice(lastSlash + 1);
    _db = await SQLite.openDatabaseAsync(filename, {}, directory);
  } else {
    _db = await SQLite.openDatabaseAsync('fressh.db');
  }
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _migrate(_db);
}

async function _migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_SCHEMA_VERSION);
  const row = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`
  );
  const current = row?.version ?? 0;
  if (current < SCHEMA_VERSION) {
    await db.execAsync(CREATE_FEEDS);
    await db.execAsync(CREATE_ARTICLES);
    for (const sql of CREATE_INDEXES) await db.execAsync(sql);
    await db.runAsync(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`, [SCHEMA_VERSION]);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/db/database.ts
git commit -m "feat: allow initDb to open database at a custom absolute path"
```

---

### Task 3: Create setup screen `mobile/app/setup.tsx`

A full-screen setup screen shown on first launch. The user picks one of two options:

1. **App Storage** — uses the expo-sqlite default location (no path stored, `null` config means "use default")
2. **Custom path** — shows a text input where the user enters an absolute path (e.g. an iCloud Drive path)

The `savedPath` for option 1 is the expo-sqlite default directory + `fressh.db`, which is `FileSystem.documentDirectory + 'SQLite/fressh.db'`. We store this as an absolute path so the config is always explicit.

On confirm, call `saveDbConfig` then call the `onComplete` callback (passed as a route param won't work here — we use a module-level callback pattern similar to how the existing layout works).

Actually, the cleanest pattern for this single-app lifecycle event is to export a `completeSetup` function that the screen calls, and the layout subscribes to it via a state setter. Pass `onSetupComplete` as a prop/context isn't possible with expo-router file-based routing. Instead, use a simple module-level event emitter or expose the state setter via a React context.

The simplest approach: use a module-level callback ref in a new `mobile/src/db/setup-complete.ts` module.

**Files:**
- Create: `mobile/src/db/setup-complete.ts`
- Create: `mobile/app/setup.tsx`

- [ ] **Step 1: Create `mobile/src/db/setup-complete.ts`**

```typescript
let _onComplete: (() => void) | null = null;

export function registerSetupCompleteCallback(cb: () => void): void {
  _onComplete = cb;
}

export function notifySetupComplete(): void {
  _onComplete?.();
}
```

- [ ] **Step 2: Create `mobile/app/setup.tsx`**

```typescript
import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { saveDbConfig } from '../src/db/config';
import { notifySetupComplete } from '../src/db/setup-complete';
import { COLORS, FONTS } from '../src/constants';

type Mode = 'app' | 'custom';

export default function SetupScreen() {
  const [mode, setMode] = useState<Mode>('app');
  const [customPath, setCustomPath] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    let dbPath: string;
    if (mode === 'app') {
      dbPath = (FileSystem.documentDirectory ?? '') + 'SQLite/fressh.db';
    } else {
      const trimmed = customPath.trim();
      if (!trimmed) {
        Alert.alert('Path required', 'Enter an absolute path for the database file.');
        return;
      }
      dbPath = trimmed;
    }
    setSaving(true);
    try {
      await saveDbConfig({ databasePath: dbPath });
      notifySetupComplete();
    } catch {
      Alert.alert('Error', 'Could not save configuration. Try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.title}>FRESSH</Text>
        <Text style={styles.subtitle}>Choose where to store your database</Text>

        <TouchableOpacity style={[styles.option, mode === 'app' && styles.optionSelected]} onPress={() => setMode('app')} activeOpacity={0.7}>
          <Text style={[styles.optionLabel, mode === 'app' && styles.optionLabelSelected]}>App Storage</Text>
          <Text style={styles.optionDesc}>Stored privately on this device. Fast, zero setup.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.option, mode === 'custom' && styles.optionSelected]} onPress={() => setMode('custom')} activeOpacity={0.7}>
          <Text style={[styles.optionLabel, mode === 'custom' && styles.optionLabelSelected]}>Custom Path</Text>
          <Text style={styles.optionDesc}>Enter an absolute path — e.g. an iCloud Drive folder shared with the terminal app.</Text>
        </TouchableOpacity>

        {mode === 'custom' && (
          <TextInput
            style={styles.input}
            placeholder="/path/to/fressh.db"
            placeholderTextColor={COLORS.textDimmed}
            value={customPath}
            onChangeText={setCustomPath}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        )}

        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={handleConfirm} disabled={saving} activeOpacity={0.8}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 80 },
  title: { fontFamily: FONTS.sansBold, fontSize: 22, color: COLORS.text, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  subtitle: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.textSecondary, marginBottom: 32 },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 3,
    padding: 16,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
  },
  optionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.background },
  optionLabel: { fontFamily: FONTS.sansMedium, fontSize: 14, color: COLORS.text, marginBottom: 4 },
  optionLabelSelected: { color: COLORS.accent },
  optionDesc: { fontFamily: FONTS.sans, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    marginBottom: 12,
  },
  btn: { backgroundColor: COLORS.accent, borderRadius: 3, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: FONTS.sansBold, fontSize: 14, color: '#fff' },
});
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/db/setup-complete.ts mobile/app/setup.tsx
git commit -m "feat: add first-launch setup screen for database path configuration"
```

---

### Task 4: Update `mobile/app/_layout.tsx` — check setup, show screen or app

On launch, after fonts load:
1. Load `DbConfig` from `fressh-config.json`
2. If `null` → show setup screen
3. If configured → call `initDb(config.databasePath)` then show main stack

The setup screen calls `notifySetupComplete()` when done; the layout receives this via the registered callback and re-runs the init flow.

**Files:**
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Rewrite `_layout.tsx`**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
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
import { loadDbConfig } from '../src/db/config';
import { registerSetupCompleteCallback } from '../src/db/setup-complete';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';
import SetupScreen from './setup';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type AppState2 = 'loading' | 'setup' | 'ready';

export default function RootLayout() {
  const lastFetchAt = useRef<number | null>(null);
  const [appState, setAppState] = useState<AppState2>('loading');

  const [fontsLoaded, fontError] = useFonts({
    [FONTS.sans]: Barlow_400Regular,
    [FONTS.sansMedium]: Barlow_500Medium,
    [FONTS.sansBold]: Barlow_700Bold,
    [FONTS.mono]: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    [FONTS.monoMedium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    [FONTS.monoBold]: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  const startApp = useCallback(async (dbPath?: string) => {
    try {
      await initDb(dbPath);
      await registerBackgroundFetch();
      lastFetchAt.current = Date.now();
      refresh().catch(console.error);
      setAppState('ready');
    } catch (e) {
      console.error('App init error:', e);
    }
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    registerSetupCompleteCallback(async () => {
      const config = await loadDbConfig();
      await startApp(config?.databasePath);
    });

    async function init() {
      try {
        const config = await loadDbConfig();
        if (!config) {
          setAppState('setup');
          await SplashScreen.hideAsync();
          return;
        }
        await startApp(config.databasePath);
      } catch (e) {
        console.error('App init error:', e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    init();
  }, [fontsLoaded, fontError, startApp]);

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
  if (appState === 'loading') return null;
  if (appState === 'setup') return <SetupScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: FONTS.sansBold, fontSize: 14 },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="feeds/index" options={{ title: 'FRESSH' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
```

Key changes from current `_layout.tsx`:
- Adds `loadDbConfig` + `registerSetupCompleteCallback` imports
- Introduces `AppState2` type (`'loading' | 'setup' | 'ready'`)
- `init()` checks config: no config → `setAppState('setup')`; config found → calls `startApp(config.databasePath)`
- Renders `<SetupScreen />` when `appState === 'setup'` (no router needed — setup replaces entire UI)
- `SetupScreen` is imported directly (not via expo-router), so it doesn't need to be a navigable route

- [ ] **Step 2: Commit**

```bash
git add mobile/app/_layout.tsx
git commit -m "feat: check db config on launch, show setup screen if not configured"
```

---

### Task 5: Verify TypeScript and build

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check on mobile**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors (or only pre-existing unrelated errors — confirm by comparing to `git stash && npx tsc --noEmit` if needed).

- [ ] **Step 2: Confirm the setup screen renders**

No simulator needed — just confirm the component tree logic is correct:
- Fonts not loaded → `null`
- Fonts loaded, no config → `<SetupScreen />`
- Fonts loaded, config exists → `<GestureHandlerRootView>` with `<Stack>`

- [ ] **Step 3: Run any existing tests**

```bash
cd mobile && npx tsc --noEmit
```

Expected: TypeScript reports no type errors in the modified files.
