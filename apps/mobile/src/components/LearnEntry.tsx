import { LEARN_REELS } from '@defikarta/core';
import { router } from 'expo-router';
import { Play } from 'lucide-react-native';
import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from '@/components/Pulse';
import { Glass } from '@/components/ui';
import { useLearn } from '@/lib/learn';
import { colors, radius, type } from '@/theme';

const RING = 46;

/**
 * The way into „Научи“ from the map: a story-style ring (the shape every phone user already reads
 * as "something to watch") on a calm glass pill, with „НОВО“ until the feed has been opened.
 * Deliberately quieter than the red SOS button below it.
 */
export function LearnEntry({ blurTarget }: { blurTarget?: RefObject<ComponentRef<typeof View> | null> }) {
  const { seen } = useLearn();
  const fresh = seen.length === 0;
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);

  const left = LEARN_REELS.length - Math.min(seen.length, LEARN_REELS.length);
  return (
    <Pressable
      onPress={() => router.push('/learn')}
      accessibilityRole="button"
      accessibilityLabel={`Научи първа помощ. ${LEARN_REELS.length} кратки съвета${fresh ? ', ново' : ''}`}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <Glass strong padded={false} style={styles.pill} blurTarget={blurTarget}>
        <View style={styles.row}>
          <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
              <Svg width={RING} height={RING}>
                <Defs>
                  <LinearGradient id="learn-ring" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={colors.red} />
                    <Stop offset="0.5" stopColor="#FF9F43" />
                    <Stop offset="1" stopColor="#8B5CF6" />
                  </LinearGradient>
                </Defs>
                <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 2} stroke="url(#learn-ring)" strokeWidth={3} fill="none" />
              </Svg>
            </Animated.View>
            <View style={styles.core}>
              <Play size={16} color="#fff" fill="#fff" strokeWidth={2} style={{ marginLeft: 2 }} />
            </View>
          </View>
          <View>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>Научи</Text>
            <Text style={styles.sub} maxFontSizeMultiplier={1.3}>{fresh || left === 0 ? 'Първа помощ за 3 мин' : `Още ${left} съвета`}</Text>
          </View>
        </View>
      </Glass>
      {fresh && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>НОВО</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingLeft: 5, paddingRight: 18 },
  core: { width: RING - 12, height: RING - 12, borderRadius: (RING - 12) / 2, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  title: { ...(type.bodyStrong as object), color: colors.ink, fontSize: 16, lineHeight: 20 },
  sub: { ...(type.caption as object), color: colors.ink2, fontSize: 12, lineHeight: 16 },
  badge: { position: 'absolute', top: -7, right: -4, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: '#fff' },
  badgeText: { ...(type.overline as object), color: '#fff', fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
});
