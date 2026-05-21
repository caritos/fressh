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
import { initDb, getDb } from '../src/db/database';
import { loadDbConfig, saveDbConfig, appStoragePath } from '../src/db/config';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type AppPhase = 'loading' | 'ready';

export default function RootLayout() {
  const lastFetchAt = useRef<number | null>(null);
  const [appPhase, setAppPhase] = useState<AppPhase>('loading');

  const [fontsLoaded, fontError] = useFonts({
    [FONTS.sans]: Barlow_400Regular,
    [FONTS.sansMedium]: Barlow_500Medium,
    [FONTS.sansBold]: Barlow_700Bold,
    [FONTS.mono]: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    [FONTS.monoMedium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    [FONTS.monoBold]: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  const startApp = useCallback(async (dbPath: string) => {
    await initDb(dbPath);
    await registerBackgroundFetch();
    lastFetchAt.current = Date.now();
    refresh().catch(console.error);
    setAppPhase('ready');
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    async function init() {
      try {
        let config = await loadDbConfig();
        if (!config) {
          const dbPath = appStoragePath();
          config = { databasePath: dbPath };
          await saveDbConfig(config);
        }
        // Guard against fast refresh wiping the module-level _db while
        // appPhase is already 'ready' — re-init silently if needed.
        try { getDb(); } catch { await initDb(config.databasePath); }
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
  if (appPhase === 'loading') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: FONTS.sansBold, fontSize: 14 },
          contentStyle: { backgroundColor: COLORS.background },
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="feeds/index" options={{ title: 'FRESSH' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
