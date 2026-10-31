import { EMERGENCY_NUMBER } from '@defikarta/core';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { ArrowRight, Phone } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pulse } from '@/components/Pulse';
import { Steps } from '@/components/Steps';
import { Button, Screen, T } from '@/components/ui';
import { colors, radius, type } from '@/theme';

/** Step 1 of every emergency, never skipped: get professionals on the way. Urgent mood: dark, one red action. */
export default function Emergency() {
  const call = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
  };
  return (
    <Screen tone="night" contentStyle={{ gap: 28 }}>
      <Steps step={1} />
      <T v="display" tone="night">Обади се на {EMERGENCY_NUMBER}</T>

      <View style={styles.script}>
        <T v="overline" tone="night">Кажи на диспечера</T>
        <Text style={styles.quote} maxFontSizeMultiplier={1.5}>„Човек е в безсъзнание и не диша нормално.“</Text>
        <T v="body" tone="night" color={colors.nightText2}>Кажи адреса. Включи високоговорителя и не затваряй.</T>
      </View>

      <View style={styles.callWrap}>
        <Pulse color={colors.red} size={196} rings={3} period={2400}>
          <Pressable onPress={call} accessibilityRole="button" accessibilityLabel={`Обади се на ${EMERGENCY_NUMBER}`} style={({ pressed }) => [styles.call, pressed && { backgroundColor: colors.redDark, transform: [{ scale: 0.97 }] }]}>
            <Phone size={34} color="#fff" strokeWidth={2.4} />
            <Text style={styles.callNum} maxFontSizeMultiplier={1.2}>{EMERGENCY_NUMBER}</Text>
          </Pressable>
        </Pulse>
      </View>

      <Button kind="nightGhost" size="lg" icon={ArrowRight} title="Обадих се — към масажа" onPress={() => router.replace('/cpr')} />
      <T v="caption" tone="night" center>Някой друг вече звъни? Продължи направо към масажа.</T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  script: { gap: 10, padding: 20, borderRadius: radius.lg, backgroundColor: colors.nightGlass, borderWidth: 1, borderColor: colors.nightEdge },
  quote: { ...(type.title as object), fontSize: 24, lineHeight: 31, color: colors.nightText },
  callWrap: { alignItems: 'center', paddingVertical: 36 },
  call: { width: 196, height: 196, borderRadius: 98, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 6, borderColor: 'rgba(255,255,255,0.12)' },
  callNum: { ...(type.number as object), fontSize: 56, lineHeight: 60, color: '#fff', letterSpacing: -1 },
});
