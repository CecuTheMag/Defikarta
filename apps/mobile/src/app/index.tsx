import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AedCard } from '@/components/AedCard';
import { AedMap } from '@/components/AedMap';
import { useAedState } from '@/lib/AedContext';
import { colors } from '@/theme';

export default function Home() {
  const { ranked, coords, locationStatus, offline } = useAedState();
  const insets = useSafeAreaInsets();
  const nearest = coords ? ranked[0] : undefined;

  return (
    <View style={styles.fill}>
      <AedMap aeds={ranked} coords={coords} />

      {(offline || locationStatus === 'denied') && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {locationStatus === 'denied'
              ? 'Няма достъп до местоположение — показваме всички дефибрилатори в града.'
              : 'Няма връзка — показваме последните запазени данни.'}
          </Text>
        </View>
      )}

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.sos, pressed && { backgroundColor: colors.redDark }]}
          onPress={() => router.push('/emergency')}
          accessibilityRole="button"
          accessibilityHint="Обаждане на 112 и указания за сърдечен масаж"
        >
          <Text style={styles.sosText}>Някой припадна</Text>
          <Text style={styles.sosSub}>112 · масаж · най-близък AED</Text>
        </Pressable>
        {nearest && <AedCard aed={nearest} compact />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { position: 'absolute', top: 12, left: 12, right: 12, backgroundColor: '#FFF4DC', borderRadius: 10, padding: 10 },
  bannerText: { color: colors.amber, fontSize: 14, fontWeight: '600' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, gap: 10 },
  sos: { backgroundColor: colors.red, borderRadius: 18, paddingVertical: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sosText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sosSub: { color: '#FFE3E8', fontSize: 14, marginTop: 2 },
});
