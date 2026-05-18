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
import { loadDbConfig } from '../src/db/config';
import { registerSetupCompleteCallback } from '../src/db/setup-complete';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';
import SetupScreen from './setup';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type AppPhase = 'loading' | 'setup' | 'ready';

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

    registerSetupCompleteCallback(async () => {
      const config = await loadDbConfig();
      if (config) await startApp(config.databasePath);
    });

    async function init() {
      try {
        const config = await loadDbConfig();
        if (!config) {
          setAppPhase('setup');
          await SplashScreen.hideAsync();
          return;
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
  if (appPhase === 'setup') return <SetupScreen />;

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
