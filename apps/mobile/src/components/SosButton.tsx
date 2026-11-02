import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { ChevronRight, HeartPulse } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pulse } from '@/components/Pulse';
import { colors, radius, shadow, type } from '@/theme';

/**
 * „Някой припадна“ — the one action that must be reachable from anywhere a stranger might be.
 * Home shows the full size; the learning feed pins the compact one above the home indicator.
 */
export function SosButton({ compact }: { compact?: boolean }) {
  const h = compact ? 64 : 84;
  return (
    <Pulse color={colors.red} size={0} rings={1} period={2600} grow={1.06} rect={{ width: '100%', height: h, radius: radius.lg }} style={{ alignItems: 'stretch' }}>
      <Pressable
        onPress={() => {
          Speech.stop();
          router.push('/emergency');
        }}
        accessibilityRole="button"
        accessibilityLabel="Някой припадна. Обаждане на 112, указания за масаж и най-близкия дефибрилатор"
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        style={({ pressed }) => [styles.sos, { minHeight: h, gap: compact ? 12 : 14 }, pressed && { backgroundColor: colors.redDark }]}
      >
        <View style={[styles.icon, compact && styles.iconCompact]}>
          <HeartPulse size={compact ? 22 : 28} color={colors.red} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.text, compact && styles.textCompact]} maxFontSizeMultiplier={1.3}>Някой припадна</Text>
          <Text style={styles.sub} maxFontSizeMultiplier={1.3}>112 · масаж · най-близък AED</Text>
        </View>
        <ChevronRight size={compact ? 22 : 26} color="#fff" strokeWidth={2.4} />
      </Pressable>
    </Pulse>
  );
}

const styles = StyleSheet.create({
  sos: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.red, paddingHorizontal: 16, overflow: 'hidden', ...shadow.glow },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 40, height: 40, borderRadius: 20 },
  text: { ...(type.title as object), fontSize: 24, lineHeight: 28, color: '#fff' },
  textCompact: { fontSize: 20, lineHeight: 24 },
  sub: { ...(type.caption as object), color: 'rgba(255,255,255,0.88)', fontSize: 14 },
});
