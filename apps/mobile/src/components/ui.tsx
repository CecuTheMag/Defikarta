import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

/** Small shared building blocks so the server-backed screens look like the rest of the app. */

export function Button({ title, onPress, kind = 'primary', disabled, style }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'next' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, s[kind], disabled && s.disabled, pressed && !disabled && s.pressed, style]}
    >
      <Text style={[s.btnText, (kind === 'primary' || kind === 'danger') && { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.card, style]}>{children}</View>;
export const H1 = ({ children }: { children: ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const H3 = ({ children }: { children: ReactNode }) => <Text style={s.h3}>{children}</Text>;
export const P = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[s.p, style]}>{children}</Text>;
export const Small = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[s.small, style]}>{children}</Text>;
export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <Text style={s.error}>{children}</Text> : null);
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.row, style]}>{children}</View>;

/** Every server-backed screen in the drill environment carries this tag (BLUEPRINT safety rule 6). */
export const DrillTag = () => (
  <View style={s.drill}>
    <Text style={s.drillText}>УЧЕНИЕ</Text>
  </View>
);

export function Chip({ label, on, onPress, danger }: { label: string; on?: boolean; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && (danger ? s.chipDanger : s.chipOn)]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export const Banner = ({ kind, children }: { kind: 'danger' | 'caution' | 'ok'; children: ReactNode }) => (
  <Text style={[s.banner, kind === 'danger' ? s.bDanger : kind === 'caution' ? s.bCaution : s.bOk]}>{children}</Text>
);

const s = StyleSheet.create({
  btn: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', borderWidth: 2 },
  primary: { backgroundColor: colors.red, borderColor: colors.red },
  danger: { backgroundColor: colors.redDark, borderColor: colors.redDark },
  ghost: { backgroundColor: 'transparent', borderColor: colors.line },
  next: { backgroundColor: 'transparent', borderColor: colors.ink },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  btnText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink },
  h3: { fontSize: 17, fontWeight: '700', color: colors.ink },
  p: { fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  error: { color: colors.redDark, fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  drill: { alignSelf: 'flex-start', backgroundColor: '#FFD400', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  drillText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.ink },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipDanger: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  banner: { borderRadius: 12, padding: 10, fontWeight: '700', fontSize: 15, overflow: 'hidden' },
  bDanger: { backgroundColor: '#FDE7EA', color: colors.redDark },
  bCaution: { backgroundColor: '#FFF4DC', color: colors.amber },
  bOk: { backgroundColor: '#E6F4EA', color: colors.green },
});
