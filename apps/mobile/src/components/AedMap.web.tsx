import type { LatLon, RankedAed } from '@defikarta/core';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

/**
 * react-native-maps has no web support. The real website (with a Leaflet map) is apps/web,
 * so the mobile app's web build only needs to not crash.
 */
export function AedMap(_: { aeds: RankedAed[]; coords: LatLon | null }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.box]}>
      <Text style={styles.text}>Картата е в мобилното приложение и на сайта (apps/web).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft, padding: 24 },
  text: { color: colors.muted, fontSize: 16, textAlign: 'center' },
});
