import { EMERGENCY_NUMBER } from '@defikarta/core';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Phone } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, type } from '@/theme';

/** The 112 call as a footer bar: pinned on every step after the first, so calling (again) is always one tap. */
export function Call112({ hint = 'Не затваряй, докато диспечерът не каже' }: { hint?: string }) {
  const call = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
  };
  return (
    <Pressable onPress={call} accessibilityRole="button" accessibilityLabel={`Обади се на ${EMERGENCY_NUMBER}`} android_ripple={{ color: 'rgba(255,255,255,0.2)' }} style={({ pressed }) => [styles.bar, pressed && { backgroundColor: colors.redDark }]}>
      <View style={styles.icon}>
        <Phone size={20} color={colors.red} strokeWidth={2.6} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>Обади се на {EMERGENCY_NUMBER}</Text>
        <Text style={styles.sub} maxFontSizeMultiplier={1.3} numberOfLines={1}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.red, overflow: 'hidden' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { ...(type.bodyStrong as object), fontSize: 18, color: '#fff' },
  sub: { ...(type.caption as object), color: 'rgba(255,255,255,0.85)' },
});
