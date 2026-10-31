import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AedProvider } from '@/lib/AedContext';
import { SessionProvider } from '@/lib/session';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
    <AedProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: colors.red, headerTitleStyle: { color: colors.ink }, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ title: 'ДефиКарта' }} />
        <Stack.Screen name="emergency" options={{ title: 'Спешен случай', headerStyle: { backgroundColor: colors.red }, headerTintColor: '#fff', headerTitleStyle: { color: '#fff' } }} />
        <Stack.Screen name="cpr" options={{ title: 'Сърдечен масаж', gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ title: 'Вход' }} />
        <Stack.Screen name="volunteer" options={{ title: 'Доброволец' }} />
        <Stack.Screen name="org" options={{ title: 'Организация' }} />
      </Stack>
    </AedProvider>
    </SessionProvider>
  );
}
