import { EMERGENCY_NUMBER } from '@defikarta/core';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme';

/** Step 1 of every emergency, never skipped: get professionals on the way. */
export default function Emergency() {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.step}>Стъпка 1 от 2</Text>
      <Text style={styles.h1}>Обади се на 112</Text>
      <Text style={styles.p}>Кажи: „Човек е в безсъзнание и не диша нормално“ и адреса. Включи високоговорителя и не затваряй.</Text>

      <Pressable
        style={({ pressed }) => [styles.call, pressed && { backgroundColor: colors.redDark }]}
        onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
        accessibilityRole="button"
      >
        <Text style={styles.callText}>📞 {EMERGENCY_NUMBER}</Text>
      </Pressable>

      <Pressable style={styles.next} onPress={() => router.replace('/cpr')} accessibilityRole="button">
        <Text style={styles.nextText}>Обадих се → към масажа</Text>
      </Pressable>
      <Text style={styles.small}>Ако друг човек вече звъни на 112, продължи направо към масажа.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 16 },
  step: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  h1: { fontSize: 32, fontWeight: '800', color: colors.ink },
  p: { fontSize: 18, lineHeight: 26, color: colors.ink },
  call: { backgroundColor: colors.red, borderRadius: 20, paddingVertical: 32, alignItems: 'center', marginTop: 8 },
  callText: { color: '#fff', fontSize: 44, fontWeight: '800' },
  next: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  nextText: { fontSize: 19, fontWeight: '700', color: colors.ink },
  small: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
