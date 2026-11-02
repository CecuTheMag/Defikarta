import type { LearnArt } from '@defikarta/core';
import { Hand } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Pulse, useReducedMotion } from '@/components/Pulse';
import { Mark } from '@/components/ui';
import { colors, type } from '@/theme';

/**
 * The moving pictures of the learning feed. Each one is authored on a fixed stage and scaled to fit,
 * loops only while its reel is on screen (`on`), and holds a finished frame when motion is reduced.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A 0→1 loop while `on`; parked at 1 (the finished picture) otherwise. */
function useLoop(on: boolean, duration: number, { hold = 0, delay = 0, native = true, ease = Easing.inOut(Easing.cubic) } = {}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on || reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: ease, useNativeDriver: native }),
        Animated.delay(hold),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]),
    );
    const run = delay ? Animated.sequence([Animated.delay(delay), loop]) : loop;
    run.start();
    return () => run.stop();
  }, [on, reduced, v, duration, hold, delay, native, ease]);
  return v;
}

/** Draws children on a `design`-sized canvas, scaled to fit the box. */
function Stage({ height, design: [dw, dh], children }: { height: number; design: [number, number]; children: ReactNode }) {
  const s = height / dh;
  return (
    <View style={{ width: dw * s, height, alignSelf: 'center' }}>
      <View style={{ position: 'absolute', width: dw, height: dh, left: (dw * s - dw) / 2, top: (height - dh) / 2, transform: [{ scale: s }] }}>{children}</View>
    </View>
  );
}

export function ReelArt({ art, height, accent, on }: { art: LearnArt; height: number; accent: string; on: boolean }) {
  switch (art) {
    case 'ecg':
      return <Ecg height={height} accent={accent} on={on} />;
    case 'chest':
      return <Chest height={height} accent={accent} on={on} />;
    case 'aed':
      return <Aed height={height} accent={accent} on={on} />;
    case 'water':
      return <Water height={height} accent={accent} on={on} />;
    case 'press':
      return <Press height={height} accent={accent} on={on} />;
    case 'fivefive':
      return <FiveFive height={height} accent={accent} on={on} />;
    case 'side':
      return <Side height={height} accent={accent} on={on} />;
  }
}

type ArtProps = { height: number; accent: string; on: boolean };

// ---------- heartbeat that flatlines ----------
const BEAT: [number, number][] = [
  [0, 0], [0.14, 0], [0.2, -0.1], [0.27, 0], [0.36, 0], [0.4, 0.14], [0.46, -0.85], [0.52, 0.34], [0.58, 0], [0.7, 0], [0.8, -0.18], [0.9, 0], [1, 0],
];
const ECG = (() => {
  const W = 300;
  const H = 120;
  const mid = 66;
  const bw = 78;
  const pts: [number, number][] = [[0, mid]];
  for (const start of [10, 10 + bw]) for (const [x, y] of BEAT) pts.push([start + x * bw, mid + y * 56]);
  pts.push([W, mid]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { W, H, d: 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'), len: Math.ceil(len) };
})();

function Ecg({ height, accent, on }: ArtProps) {
  const v = useLoop(on, 2600, { hold: 900, native: false, ease: Easing.linear });
  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [ECG.len, 0] });
  return (
    <Stage height={height} design={[ECG.W, ECG.H]}>
      <Svg width={ECG.W} height={ECG.H}>
        {[22, 44, 66, 88, 110].map((y) => (
          <Path key={y} d={`M0 ${y} L${ECG.W} ${y}`} stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
        ))}
        <AnimatedPath d={ECG.d} stroke={accent} strokeOpacity={0.35} strokeWidth={10} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${ECG.len} ${ECG.len}`} strokeDashoffset={offset} />
        <AnimatedPath d={ECG.d} stroke="#fff" strokeWidth={3.5} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${ECG.len} ${ECG.len}`} strokeDashoffset={offset} />
      </Svg>
    </Stage>
  );
}

// ---------- hands on the chest, compressing at 110/min ----------
function Chest({ height, accent, on }: ArtProps) {
  const v = useLoop(on, 545, { ease: Easing.inOut(Easing.quad) });
  // Down fast (40 %), up slower (60 %): the chest recoils fully.
  const push = v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 9, 0] });
  const ring = v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.35, 1] });
  return (
    <Stage height={height} design={[220, 170]}>
      <Svg width={220} height={170}>
        <Circle cx={110} cy={28} r={20} stroke="#fff" strokeOpacity={0.55} strokeWidth={3.5} fill="none" />
        <Path d="M44 170 C44 106 70 66 110 66 C150 66 176 106 176 170" stroke="#fff" strokeOpacity={0.55} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <Path d="M110 78 L110 140" stroke="#fff" strokeOpacity={0.16} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={110} cy={118} r={18} fill={accent} fillOpacity={0.28} />
        <Circle cx={110} cy={118} r={5} fill={accent} />
      </Svg>
      <Animated.View style={[styles.ring, { left: 110 - 26, top: 118 - 26, borderColor: accent, transform: [{ scale: ring }] }]} />
      <Animated.View style={{ position: 'absolute', left: 110 - 30, top: 118 - 34, transform: [{ translateY: push }] }}>
        <Svg width={60} height={34}>
          <Rect x={2} y={12} width={56} height={20} rx={10} fill="#fff" fillOpacity={0.55} />
          <Rect x={6} y={2} width={48} height={20} rx={10} fill="#fff" />
        </Svg>
      </Animated.View>
      <View style={[styles.depth, { left: 168, top: 94 }]}>
        <Text style={styles.depthText} maxFontSizeMultiplier={1.2}>5–6</Text>
        <Text style={styles.depthUnit} maxFontSizeMultiplier={1.2}>см</Text>
      </View>
    </Stage>
  );
}

// ---------- the AED: pads go on, then it speaks ----------
function Aed({ height, accent, on }: ArtProps) {
  const v = useLoop(on, 3200, { hold: 600, ease: Easing.linear });
  const left = v.interpolate({ inputRange: [0, 0.15, 0.3, 1], outputRange: [0, 0, 1, 1] });
  const right = v.interpolate({ inputRange: [0, 0.35, 0.5, 1], outputRange: [0, 0, 1, 1] });
  const talk = v.interpolate({ inputRange: [0, 0.55, 0.62, 0.7, 0.78, 0.86, 1], outputRange: [0.25, 0.25, 1, 0.4, 1, 0.4, 1] });
  return (
    <Stage height={height} design={[240, 150]}>
      <Svg width={240} height={150}>
        <Rect x={78} y={10} width={84} height={130} rx={20} fill="#fff" />
        <Rect x={90} y={86} width={60} height={8} rx={4} fill={colors.ink} fillOpacity={0.1} />
        <Circle cx={120} cy={116} r={11} fill={colors.green} />
      </Svg>
      <View style={{ position: 'absolute', left: 120 - 22, top: 26 }}>
        <Mark size={44} />
      </View>
      {/* speaker waves */}
      <Animated.View style={{ position: 'absolute', left: 168, top: 2, opacity: talk }}>
        <Svg width={30} height={40}>
          <Path d="M4 10 Q12 20 4 30" stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Path d="M14 4 Q26 20 14 36" stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: 4, top: 36, opacity: left }}>
        <Pad wire="M48 40 C62 40 64 70 74 76" accent={accent} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: 156, top: 36, opacity: right, transform: [{ scaleX: -1 }] }}>
        <Pad wire="M48 40 C62 40 64 70 74 76" accent={accent} />
      </Animated.View>
    </Stage>
  );
}

function Pad({ wire, accent }: { wire: string; accent: string }) {
  return (
    <Svg width={80} height={90}>
      <Path d={wire} stroke="#fff" strokeOpacity={0.6} strokeWidth={3} fill="none" />
      <Rect x={4} y={10} width={44} height={60} rx={12} fill="#fff" fillOpacity={0.92} />
      <Path d="M30 22 L20 40 H28 L24 58 L36 36 H28 Z" fill={accent} />
    </Svg>
  );
}

// ---------- cool running water, 20 minutes ----------
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;
function Water({ height, accent, on }: ArtProps) {
  const fall = Easing.in(Easing.quad);
  const drops = [useLoop(on, 900, { ease: fall }), useLoop(on, 900, { delay: 300, ease: fall }), useLoop(on, 900, { delay: 600, ease: fall })];
  const timer = useLoop(on, 5000, { hold: 800, native: false, ease: Easing.linear });
  return (
    <Stage height={height} design={[240, 150]}>
      <Svg width={240} height={150}>
        <Rect x={32} y={6} width={56} height={14} rx={7} fill="#fff" fillOpacity={0.85} />
        <Rect x={52} y={18} width={16} height={16} rx={4} fill="#fff" fillOpacity={0.85} />
        <Rect x={14} y={112} width={92} height={26} rx={13} fill={accent} fillOpacity={0.4} />
        <Circle cx={182} cy={75} r={RING_R} stroke="#fff" strokeOpacity={0.16} strokeWidth={8} fill="none" />
        <AnimatedCircle
          cx={182}
          cy={75}
          r={RING_R}
          stroke={accent}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`}
          strokeDashoffset={timer.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] })}
          transform="rotate(-90 182 75)"
        />
      </Svg>
      {drops.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: 54 + (i - 1) * 8,
            top: 36,
            opacity: on ? d.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }) : 0.9,
            transform: [{ translateY: on ? d.interpolate({ inputRange: [0, 1], outputRange: [0, 66] }) : i * 22 }],
          }}
        >
          <Svg width={12} height={16}>
            <Path d="M6 0 C6 0 0 8 0 11 A6 6 0 0 0 12 11 C12 8 6 0 6 0 Z" fill="#9FD8FF" />
          </Svg>
        </Animated.View>
      ))}
      <View style={[styles.timerText, { left: 182 - 40, top: 75 - 26 }]}>
        <Text style={styles.timerNum} maxFontSizeMultiplier={1.1}>20</Text>
        <Text style={styles.timerUnit} maxFontSizeMultiplier={1.1}>мин</Text>
      </View>
    </Stage>
  );
}

// ---------- firm pressure on a wound ----------
function Press({ height, accent, on }: ArtProps) {
  const v = useLoop(on, 1400, { ease: Easing.inOut(Easing.quad) });
  const squeeze = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.9, 1] });
  const size = Math.min(height * 0.72, 118);
  const disc = (
    <Animated.View style={[styles.pressDisc, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: squeeze }] }]}>
      <Hand size={size * 0.46} color={colors.redDark} strokeWidth={2.2} />
    </Animated.View>
  );
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      {on ? (
        <Pulse color={accent} size={size} rings={2} period={2000} grow={1.5}>
          {disc}
        </Pulse>
      ) : (
        disc
      )}
    </View>
  );
}

// ---------- 5 back blows + 5 abdominal thrusts ----------
function FiveFive({ height, accent, on }: ArtProps) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(12);
  useEffect(() => {
    if (!on || reduced) return setTick(12);
    setTick(0);
    const id = setInterval(() => setTick((t) => (t + 1) % 13), 480);
    return () => clearInterval(id);
  }, [on, reduced]);
  // 0–5: back blows count up, 6–11: thrusts, 12: both full (rest frame).
  const a = tick >= 12 ? 5 : Math.min(5, tick);
  const b = tick >= 12 ? 5 : Math.max(0, tick - 6);
  const group = (n: number, label: string, live: boolean) => (
    <View style={[styles.ffCard, live && { borderColor: accent, backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <Text style={[styles.ffNum, { color: live ? accent : '#fff' }]} maxFontSizeMultiplier={1.1}>{n}</Text>
      <Text style={styles.ffLabel} maxFontSizeMultiplier={1.2} numberOfLines={2}>{label}</Text>
      <View style={styles.ffDots}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={[styles.ffDot, i < n && { backgroundColor: live ? accent : '#fff' }]} />
        ))}
      </View>
    </View>
  );
  return (
    <View style={{ minHeight: height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {group(a, 'удара по гърба', tick < 6)}
      <Text style={styles.ffPlus}>+</Text>
      {group(b, 'притискания над пъпа', tick >= 6 && tick < 12)}
    </View>
  );
}

// ---------- recovery position, breathing ----------
function Side({ height, accent, on }: ArtProps) {
  const v = useLoop(on, 2400, { ease: Easing.inOut(Easing.sin) });
  const breath = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 1, 0.15] });
  return (
    <Stage height={height} design={[230, 124]}>
      <Svg width={230} height={124}>
        <Path d="M6 112 L224 112" stroke="#fff" strokeOpacity={0.22} strokeWidth={2} strokeLinecap="round" />
        <Path d="M64 88 L136 92" stroke="#fff" strokeWidth={18} strokeLinecap="round" />
        <Path d="M136 94 L206 100" stroke="#fff" strokeOpacity={0.6} strokeWidth={13} strokeLinecap="round" />
        <Path d="M136 88 L168 70 L182 100" stroke="#fff" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M76 86 Q66 104 50 102" stroke="#fff" strokeWidth={10} strokeLinecap="round" fill="none" />
        <Circle cx={44} cy={80} r={16} fill="#fff" />
      </Svg>
      <Animated.View style={{ position: 'absolute', left: 2, top: 60, opacity: breath }}>
        <Svg width={26} height={40}>
          <Path d="M20 8 Q12 20 20 32" stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Path d="M10 2 Q-2 20 10 38" stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 2.5 },
  depth: { position: 'absolute', alignItems: 'flex-start' },
  depthText: { ...(type.number as object), fontSize: 22, lineHeight: 24, color: '#fff' },
  depthUnit: { ...(type.label as object), color: 'rgba(255,255,255,0.8)' },
  timerText: { position: 'absolute', width: 80, alignItems: 'center' },
  timerNum: { ...(type.number as object), fontSize: 34, lineHeight: 36, color: '#fff' },
  timerUnit: { ...(type.label as object), color: 'rgba(255,255,255,0.85)', marginTop: -2 },
  pressDisc: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ffCard: { width: 118, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', gap: 4 },
  ffNum: { ...(type.number as object), fontSize: 40, lineHeight: 44 },
  ffLabel: { ...(type.label as object), color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 13, lineHeight: 17, minHeight: 34 },
  ffDots: { flexDirection: 'row', gap: 5, marginTop: 4 },
  ffDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)' },
  ffPlus: { ...(type.title as object), color: 'rgba(255,255,255,0.7)' },
});
