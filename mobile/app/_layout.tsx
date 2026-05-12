import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb } from '../src/db/database';
import { registerBackgroundFetch } from '../src/tasks/background';
import { refresh } from '../src/fetcher/refresh';
import { COLORS, FONTS } from '../src/constants';

SplashScreen.preventAutoHideAsync();

const FOREGROUND_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export default function RootLayout() {
  const lastFetchAt = useRef<number | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    [FONTS.regular]: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    [FONTS.medium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    [FONTS.bold]: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    async function init() {
      try {
        await initDb();
        await registerBackgroundFetch();
        // Initial fetch on first launch
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: FONTS.bold, fontSize: 16 },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="feeds/index" options={{ title: 'fressh' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
