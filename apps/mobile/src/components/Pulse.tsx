import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

/** True when the user asked the system to reduce motion. Every looping animation checks it. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * Expanding rings behind a control: the "live" signal used on the SOS, the 112 call and the CPR circle.
 * It sits behind its children and never affects layout.
 */
export function Pulse({ color, size, rings = 2, period = 2200, children, style, rect, grow = 1.6 }: { color: string; size: number; rings?: number; period?: number; children: ReactNode; style?: StyleProp<ViewStyle>; rect?: { width: number | `${number}%`; height: number; radius: number }; grow?: number }) {
  const reduced = useReducedMotion();
  const anims = useRef(Array.from({ length: rings }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduced) return;
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((period / rings) * i),
          Animated.timing(a, { toValue: 1, duration: period, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduced, anims, period, rings]);

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {!reduced &&
        anims.map((a, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              {
                // Absolute children without offsets are centred by the parent's align/justify.
                position: 'absolute',
                width: rect?.width ?? size,
                height: rect?.height ?? size,
                borderRadius: rect?.radius ?? size / 2,
                backgroundColor: color,
                opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, grow] }) }],
              },
            ]}
          />
        ))}
      {children}
    </View>
  );
}
