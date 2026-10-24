import { formatDistance, nativeWalkingUrl, openLabel, type RankedAed } from '@defikarta/core';
import * as Linking from 'expo-linking';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

const badge = {
  open: { bg: '#E6F4EA', fg: colors.green },
  closed: { bg: '#FDE7EA', fg: colors.redDark },
  unknown: { bg: '#FFF4DC', fg: colors.amber },
};

export function AedCard({ aed, compact = false }: { aed: RankedAed; compact?: boolean }) {
  const hasDistance = Number.isFinite(aed.distanceM);
  const b = badge[aed.open];
  const route = () => Linking.openURL(nativeWalkingUrl(Platform.OS === 'ios' ? 'ios' : 'android', aed));

  return (
    <View style={styles.card} accessible accessibilityLabel={`Дефибрилатор: ${aed.name}`}>
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={2}>
          {aed.name}
        </Text>
        {hasDistance && (
          <Text style={styles.dist}>
            {formatDistance(aed.distanceM)} · ~{aed.walkMin} мин
          </Text>
        )}
      </View>
      <View style={[styles.badge, { backgroundColor: b.bg }]}>
        <Text style={[styles.badgeText, { color: b.fg }]}>{openLabel(aed.open)}</Text>
      </View>
      {aed.locationHint ? <Text style={styles.hint}>📍 {aed.locationHint}</Text> : null}
      {!compact && aed.note ? <Text style={styles.note}>{aed.note}</Text> : null}
      <Pressable style={styles.routeBtn} onPress={route} accessibilityRole="button">
        <Text style={styles.routeText}>Маршрут пеша →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.line, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.ink },
  dist: { fontSize: 15, fontWeight: '600', color: colors.ink },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 15, color: colors.ink },
  note: { fontSize: 13, color: colors.muted },
  routeBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  routeText: { fontSize: 16, fontWeight: '700', color: colors.red },
});
