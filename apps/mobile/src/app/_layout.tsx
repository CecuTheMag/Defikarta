import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AedProvider } from '@/lib/AedContext';
import { SessionProvider } from '@/lib/session';
import { colors } from '@/theme';

/** Every screen draws its own header (components/ui Header), so the platform header is off everywhere. */
export default function RootLayout() {
  // On a desktop browser public/index.html shows the phone-frame page and embeds the app in an iframe.
  // The outer page must not start a second copy (location prompt, API calls), so it renders nothing here.
  if ((globalThis as Record<string, unknown>).__DEFIKARTA_SHELL__) return null;
  return (
    <SessionProvider>
      <AedProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="emergency" options={{ animation: 'fade_from_bottom', contentStyle: { backgroundColor: colors.night } }} />
          <Stack.Screen name="cpr" options={{ animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: colors.night } }} />
          <Stack.Screen name="learn" options={{ animation: 'fade_from_bottom', contentStyle: { backgroundColor: colors.night } }} />
          <Stack.Screen name="login" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="volunteer" />
          <Stack.Screen name="org" />
        </Stack>
      </AedProvider>
    </SessionProvider>
  );
}
