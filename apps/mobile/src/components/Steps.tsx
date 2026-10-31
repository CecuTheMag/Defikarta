import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { T } from './ui';

/** "Step 1 of 2" with a two-segment bar, on the urgent screens. */
export function Steps({ step }: { step: 1 | 2 }) {
  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel={`Стъпка ${step} от 2`}>
      <T v="overline" tone="night">Стъпка {step} от 2</T>
      <View style={styles.bar}>
        <View style={[styles.seg, { backgroundColor: colors.red }]} />
        <View style={[styles.seg, { backgroundColor: step === 2 ? colors.red : 'rgba(255,255,255,0.16)' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
});
