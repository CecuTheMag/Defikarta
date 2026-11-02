import { LEARN_SOURCE, tempoFromTaps, type ChoiceReel, type CompareReel, type FinaleReel, type LearnIcon, type LearnReel, type RhythmReel, type StoryReel } from '@defikarta/core';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  ArrowDown,
  Ban,
  Bandage,
  Bed,
  BicepsFlexed,
  Brain,
  Check,
  Clock,
  Droplet,
  Eye,
  FaceSlightlySmiling,
  Hand,
  HandHeart,
  Heart,
  MessageCircle,
  Phone,
  Play,
  PersonStanding,
  RotateCcw,
  Share2,
  Sparkles,
  Users,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Pulse, useReducedMotion } from '@/components/Pulse';
import { ReelArt } from '@/components/ReelArt';
import { colors, moods, radius, type } from '@/theme';

/**
 * One full-screen card of the „Научи“ feed. Story and compare reels reveal their lines on a short
 * timeline (tap to pause, like a video); choice and rhythm reels wait for the viewer instead.
 * Everything the voice says is also on screen, so the feed works muted.
 */

const ICONS: Record<LearnIcon, LucideIcon> = {
  phone: Phone,
  hands: HandHeart,
  zap: Zap,
  clock: Clock,
  brain: Brain,
  droplet: Droplet,
  smile: FaceSlightlySmiling,
  arm: BicepsFlexed,
  speech: MessageCircle,
  pad: Bandage,
  handsOff: Ban,
  repeat: RotateCcw,
  wind: Wind,
  bed: Bed,
  head: PersonStanding,
  eye: Eye,
  users: Users,
  heart: Heart,
};

const BEAT_MS = 1800;
const LEAD_MS = 700;
const STAT_MS = 1100;
const POINT_MS = 1100;
const BRIGHT_GREEN = '#3DDC97';

const say = (text: string) => Speech.speak(text, { language: 'bg-BG', rate: 0.95 });

/** How long the timed part of a reel runs; 0 for reels that wait for the viewer. */
function durationOf(r: LearnReel) {
  if (r.kind === 'story') return LEAD_MS + (r.stat ? STAT_MS : 0) + r.beats.length * BEAT_MS;
  if (r.kind === 'compare') return LEAD_MS + (r.left.points.length + r.right.points.length) * POINT_MS + 1200;
  return 0;
}

export function shareText(r: LearnReel) {
  const body =
    r.kind === 'story' ? r.beats.map((b) => `• ${b.text}`).join('\n')
    : r.kind === 'choice' ? `${r.verdict}. ${r.why}`
    : r.kind === 'compare' ? `${r.left.title}: ${r.left.points.join(' ')}\n${r.right.title}: ${r.right.points.join(' ')}`
    : r.kind === 'rhythm' ? r.hint
    : r.body;
  return `${r.title}\n\n${body}\n\nДефиКарта — първа помощ и най-близкият дефибрилатор.`;
}

export interface ReelProps {
  reel: LearnReel;
  height: number;
  /** Space taken by the fixed header above and the SOS bar below. */
  padTop: number;
  padBottom: number;
  active: boolean;
  paused: boolean;
  voice: boolean;
  liked: boolean;
  first: boolean;
  last: boolean;
  answer: 0 | 1 | undefined;
  rhythmDone: boolean;
  score: { right: number; asked: number; seen: number; total: number };
  /** The active reel drives the header's progress segment. */
  progress: Animated.Value;
  onTogglePause: () => void;
  onLike: () => void;
  onDoubleTap: () => void;
  onShare: () => void;
  onNext: () => void;
  onAnswer: (pick: 0 | 1) => void;
  onRhythmDone: () => void;
}

export function Reel(p: ReelProps) {
  const { reel, active, paused } = p;
  const m = moods[reel.mood];
  const reduced = useReducedMotion();
  const total = durationOf(reel);

  // ---- timeline (story / compare) ----
  // Kept after the reel scrolls away, so coming back shows everything for re-reading.
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  useEffect(() => {
    if (!active || paused || !total) return;
    if (reduced) {
      tRef.current = total;
      setT(total);
      return;
    }
    const start = Date.now() - tRef.current;
    const id = setInterval(() => {
      const now = Math.min(total, Date.now() - start);
      tRef.current = now;
      setT(now);
      if (now >= total) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [active, paused, total, reduced]);

  const done = total ? t >= total : reel.kind === 'choice' ? p.answer !== undefined : reel.kind === 'rhythm' ? p.rhythmDone : true;
  useEffect(() => {
    if (!active) return;
    p.progress.setValue(total ? t / total : done ? 1 : 0);
  }, [active, t, total, done, p.progress]);

  // ---- voice ----
  useEffect(() => {
    if (!active || !p.voice || paused) return;
    Speech.stop();
    say(reel.kind === 'choice' && p.answer !== undefined ? `${reel.verdict}. ${reel.why}` : reel.say);
    return () => {
      Speech.stop();
    };
    // Speak once per visit (or when the voice is switched on); resuming from pause stays quiet.
  }, [active, p.voice]);
  useEffect(() => {
    if (paused) Speech.stop();
  }, [paused]);

  // ---- tap: once to pause, twice to like ----
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heart = useRef(new Animated.Value(0)).current;
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      clearTimeout(single.current);
      lastTap.current = 0;
      p.onDoubleTap();
      heart.setValue(0);
      Animated.timing(heart, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    lastTap.current = now;
    if (total) single.current = setTimeout(p.onTogglePause, 280);
  };
  useEffect(() => () => clearTimeout(single.current), []);

  // Shorter phones get a denser layout so a whole reel always fits on one screen.
  const dense = p.height < 800;
  const artH = Math.round(Math.max(84, Math.min(140, p.height * (dense ? 0.12 : 0.14))));
  const titleSize = (reel.title.length > 44 ? 26 : reel.title.length > 30 ? 30 : 34) - (dense ? 4 : 0);

  return (
    <Pressable onPress={tap} accessible={false} style={{ height: p.height, overflow: 'hidden' }}>
      <Backdrop id={reel.id} top={m.top} bottom={m.bottom} accent={m.accent} />

      <View style={[styles.body, { paddingTop: p.padTop, paddingBottom: p.padBottom }]}>
        <View style={[styles.main, dense && { gap: 10 }]}>
          <View style={[styles.topic, { borderColor: m.accent }]}>
            <View style={[styles.topicDot, { backgroundColor: m.accent }]} />
            <Text style={styles.topicText} maxFontSizeMultiplier={1.3}>{reel.topic}</Text>
          </View>
          <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.14 }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {reel.title}
          </Text>

          {reel.kind === 'story' && <Story reel={reel} t={t} accent={m.accent} dense={dense} />}
          {reel.art && <ArtSlot max={artH}>{(h) => <ReelArt art={reel.art!} height={h} accent={m.accent} on={active && !paused} />}</ArtSlot>}
          {reel.kind === 'story' && <Beats reel={reel} t={t} accent={m.accent} dense={dense} />}
          {reel.kind === 'choice' && <Choice reel={reel} answer={p.answer} accent={m.accent} onAnswer={p.onAnswer} voice={p.voice} />}
          {reel.kind === 'rhythm' && <Rhythm reel={reel} accent={m.accent} active={active} voice={p.voice} done={p.rhythmDone} onDone={p.onRhythmDone} />}
          {reel.kind === 'compare' && <Compare reel={reel} t={t} accent={m.accent} />}
          {reel.kind === 'finale' && <Finale reel={reel} score={p.score} accent={m.accent} />}
        </View>

        <View style={styles.foot}>
          <View style={styles.footRow}>
            <View style={{ flex: 1 }}>
              <NextButton last={p.last} nudge={active && done && !reduced} onPress={p.onNext} />
            </View>
            <RailButton icon={Heart} label="Полезно" on={p.liked} onPress={p.onLike} a11y={p.liked ? 'Махни „Полезно“' : 'Отбележи като полезно'} />
            <RailButton icon={Share2} label="Сподели" onPress={p.onShare} a11y="Сподели този съвет" />
          </View>
          <Text style={styles.footNote} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {p.first ? 'Плъзни с пръст нагоре или натисни „Следващо“' : LEARN_SOURCE}
          </Text>
        </View>
      </View>

      {active && paused && (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.paused}>
            <Play size={40} color="#fff" fill="#fff" strokeWidth={2} />
          </View>
          <Text style={styles.pausedText}>Пауза · докосни, за да продължиш</Text>
        </View>
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.center,
          {
            opacity: heart.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ scale: heart.interpolate({ inputRange: [0, 0.25, 0.4, 1], outputRange: [0.3, 1.25, 1, 1.1] }) }],
          },
        ]}
      >
        <Heart size={120} color={colors.red} fill={colors.red} strokeWidth={1.5} />
      </Animated.View>
    </Pressable>
  );
}

// ---------- backdrop ----------
function Backdrop({ id, top, bottom, accent }: { id: string; top: string; bottom: string; accent: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        <RadialGradient id={`glow-${id}`} cx="85%" cy="18%" r="65%">
          <Stop offset="0" stopColor={accent} stopOpacity={0.34} />
          <Stop offset="1" stopColor={accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#bg-${id})`} />
      <Rect width="100%" height="100%" fill={`url(#glow-${id})`} />
    </Svg>
  );
}

// ---------- art slot ----------
/** The picture is the one thing on a reel that may give up space, so the words always fit. */
function ArtSlot({ max, children }: { max: number; children: (height: number) => ReactNode }) {
  const [h, setH] = useState(max);
  return (
    <View style={{ height: max, minHeight: 64, flexShrink: 1, justifyContent: 'center' }} onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}>
      {children(h)}
    </View>
  );
}

// ---------- reveal ----------
/** Fades and lifts its child in when `shown` turns true; holds its space either way so nothing jumps. */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  const a = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: shown ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [shown, a]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      {children}
    </Animated.View>
  );
}

function IconBubble({ icon, accent, size = 40 }: { icon: LearnIcon; accent: string; size?: number }) {
  const Icon = ICONS[icon];
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${accent}2E` }]}>
      <Icon size={size * 0.5} color={accent} strokeWidth={2.3} />
    </View>
  );
}

// ---------- story ----------
function Story({ reel, t, accent, dense }: { reel: StoryReel; t: number; accent: string; dense: boolean }) {
  if (!reel.stat) return null;
  const k = Math.min(1, Math.max(0, (t - 200) / 900));
  const eased = 1 - Math.pow(1 - k, 3);
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.stat, { color: accent }, dense && { fontSize: 54, lineHeight: 58 }]} maxFontSizeMultiplier={1.2}>
        {reel.stat.prefix}
        {Math.round(eased * reel.stat.value)}
        {reel.stat.suffix}
      </Text>
      <Text style={styles.statLabel} maxFontSizeMultiplier={1.3}>{reel.stat.label}</Text>
    </View>
  );
}

function Beats({ reel, t, accent, dense }: { reel: StoryReel; t: number; accent: string; dense: boolean }) {
  const start = LEAD_MS + (reel.stat ? STAT_MS : 0);
  return (
    <View style={{ gap: dense ? 8 : 12 }}>
      {reel.beats.map((b, i) => (
        <Reveal key={b.text} shown={t >= start + i * BEAT_MS}>
          <View style={styles.beat}>
            {b.icon && <IconBubble icon={b.icon} accent={accent} size={dense ? 34 : 40} />}
            <Text style={[styles.beatText, dense && { fontSize: 16, lineHeight: 22 }]} maxFontSizeMultiplier={1.3}>{b.text}</Text>
          </View>
        </Reveal>
      ))}
    </View>
  );
}

// ---------- myth or fact ----------
function Choice({ reel, answer, accent, onAnswer, voice }: { reel: ChoiceReel; answer: 0 | 1 | undefined; accent: string; onAnswer: (p: 0 | 1) => void; voice: boolean }) {
  const stamp = useRef(new Animated.Value(answer === undefined ? 0 : 1)).current;
  const pick = (i: 0 | 1) => {
    if (answer !== undefined) return;
    const right = i === reel.answer;
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    onAnswer(i);
    Animated.spring(stamp, { toValue: 1, useNativeDriver: true, speed: 9, bounciness: 14 }).start();
    if (voice) {
      Speech.stop();
      say(`${right ? 'Позна.' : 'Не съвсем.'} ${reel.verdict}. ${reel.why}`);
    }
  };
  const right = answer === reel.answer;
  return (
    <View style={{ gap: 14 }}>
      {answer === undefined && <Text style={styles.ask} maxFontSizeMultiplier={1.3}>Ти как мислиш? Избери:</Text>}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {reel.options.map((o, i) => {
          const isAnswer = i === reel.answer;
          const isPick = i === answer;
          const after = answer !== undefined;
          return (
            <Pressable
              key={o}
              onPress={() => pick(i as 0 | 1)}
              disabled={after}
              accessibilityRole="button"
              accessibilityLabel={after ? `${o}${isAnswer ? ', верен отговор' : ''}${isPick ? ', твоят избор' : ''}` : o}
              style={({ pressed }) => [
                styles.option,
                after && isAnswer && { backgroundColor: colors.green, borderColor: colors.green },
                after && isPick && !isAnswer && { backgroundColor: 'rgba(225,17,45,0.55)', borderColor: colors.red },
                after && !isAnswer && !isPick && { opacity: 0.45 },
                pressed && { transform: [{ scale: 0.97 }], backgroundColor: 'rgba(255,255,255,0.22)' },
              ]}
            >
              {after && isAnswer && <Check size={24} color="#fff" strokeWidth={3} />}
              {after && isPick && !isAnswer && <X size={24} color="#fff" strokeWidth={3} />}
              <Text style={styles.optionText} maxFontSizeMultiplier={1.3}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
      {answer !== undefined && (
        <Animated.View style={{ gap: 10, opacity: stamp, transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) }] }}>
          <View style={styles.verdictRow}>
            <View style={[styles.stamp, { borderColor: accent, transform: [{ rotate: '-4deg' }] }]}>
              <Text style={[styles.stampText, { color: accent }]} maxFontSizeMultiplier={1.2}>{reel.verdict}</Text>
            </View>
            <Text style={styles.feedback} maxFontSizeMultiplier={1.3}>{right ? 'Позна!' : 'Не съвсем.'}</Text>
          </View>
          <Text style={styles.why} maxFontSizeMultiplier={1.3}>{reel.why}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ---------- tap the rhythm ----------
const GOOD_TAPS = 8;
function Rhythm({ reel, accent, active, voice, done, onDone }: { reel: RhythmReel; accent: string; active: boolean; voice: boolean; done: boolean; onDone: () => void }) {
  const click = useAudioPlayer(require('../../assets/click.wav'));
  const [taps, setTaps] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const streakRef = useRef(0);
  const press = useRef(new Animated.Value(1)).current;
  const bpm = tempoFromTaps(taps);
  const inRange = bpm !== null && bpm >= reel.min && bpm <= reel.max;

  useEffect(() => {
    if (!active) {
      setTaps([]);
      setStreak((streakRef.current = 0));
    }
  }, [active]);

  const tap = () => {
    const now = Date.now();
    const next = [...taps.slice(-8), now];
    const tempo = tempoFromTaps(next);
    const good = tempo !== null && tempo >= reel.min && tempo <= reel.max;
    setTaps(next);
    streakRef.current = good ? streakRef.current + 1 : 0;
    setStreak(streakRef.current);
    if (streakRef.current === GOOD_TAPS && !done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onDone();
    }
    Haptics.impactAsync(good ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (voice) {
      click.seekTo(0);
      click.play();
    }
    press.setValue(0.9);
    Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
  };

  const ringColor = bpm === null ? 'rgba(255,255,255,0.35)' : inRange ? BRIGHT_GREEN : '#FFBA52';
  const message =
    bpm === null ? `Целта: ${reel.min}–${reel.max} в минута`
    : bpm < reel.min ? 'По-бързо!'
    : bpm > reel.max ? 'По-бавно — не бързай толкова.'
    : done || streak >= GOOD_TAPS ? 'Перфектно! Точно така се натиска.'
    : 'Точно така! Задръж този ритъм.';

  return (
    <View style={{ gap: 14, alignItems: 'center' }}>
      <Text style={[styles.beatText, { flex: 0, textAlign: 'center' }]} maxFontSizeMultiplier={1.3}>{reel.hint}</Text>
      <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={bpm === null ? 'Почукай тук в ритъм' : `${bpm} в минута. ${message}`} hitSlop={12}>
        <Animated.View style={[styles.tapCircle, { borderColor: ringColor, transform: [{ scale: press }] }]}>
          {bpm === null ? (
            <>
              <Hand size={40} color="#fff" strokeWidth={2} />
              <Text style={styles.tapHint} maxFontSizeMultiplier={1.2}>Почукай тук</Text>
            </>
          ) : (
            <>
              <Text style={[styles.tapBpm, { color: inRange ? BRIGHT_GREEN : '#fff' }]} maxFontSizeMultiplier={1.1}>{bpm}</Text>
              <Text style={styles.tapHint} maxFontSizeMultiplier={1.2}>в минута</Text>
            </>
          )}
        </Animated.View>
      </Pressable>
      <Text style={[styles.feedback, { textAlign: 'center', color: inRange ? BRIGHT_GREEN : '#fff' }]} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">{message}</Text>
      <View style={styles.guide}>
        <Pulse color={accent} size={14} rings={1} period={545} grow={2.2}>
          <View style={[styles.guideDot, { backgroundColor: accent }]} />
        </Pulse>
        <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>Тази точка пулсира точно 110 пъти в минута</Text>
      </View>
    </View>
  );
}

// ---------- side by side ----------
function Compare({ reel, t, accent }: { reel: CompareReel; t: number; accent: string }) {
  const column = (side: CompareReel['left'], offset: number) => (
    <View style={styles.col}>
      <IconBubble icon={side.icon} accent={accent} size={36} />
      <Text style={styles.colTitle} maxFontSizeMultiplier={1.3}>{side.title}</Text>
      {side.points.map((pt, i) => (
        <Reveal key={pt} shown={t >= LEAD_MS + (offset + i) * POINT_MS}>
          <Text style={styles.colPoint} maxFontSizeMultiplier={1.3}>{pt}</Text>
        </Reveal>
      ))}
    </View>
  );
  const all = reel.left.points.length + reel.right.points.length;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {column(reel.left, 0)}
        {column(reel.right, reel.left.points.length)}
      </View>
      <Reveal shown={t >= LEAD_MS + all * POINT_MS}>
        <View style={[styles.note, { borderLeftColor: accent }]}>
          <Text style={styles.noteText} maxFontSizeMultiplier={1.3}>{reel.note}</Text>
        </View>
      </Reveal>
    </View>
  );
}

// ---------- the end ----------
function Finale({ reel, score, accent }: { reel: FinaleReel; score: ReelProps['score']; accent: string }) {
  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.why} maxFontSizeMultiplier={1.3}>{reel.body}</Text>
      <View style={styles.scoreRow}>
        <ScoreTile value={`${score.seen}/${score.total}`} label="видени съвета" />
        <ScoreTile value={score.asked ? `${score.right}/${score.asked}` : '—'} label="верни отговора" />
      </View>
      <Pressable onPress={() => router.push('/volunteer')} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
        <HandHeart size={24} color={colors.ink} strokeWidth={2.3} />
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaText} maxFontSizeMultiplier={1.3}>Стани доброволец</Text>
          <Text style={styles.ctaSub} maxFontSizeMultiplier={1.3}>Ако имаш курс по първа помощ</Text>
        </View>
        <Sparkles size={20} color={accent} strokeWidth={2.3} />
      </Pressable>
    </View>
  );
}

function ScoreTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.scoreTile}>
      <Text style={styles.scoreValue} maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

// ---------- controls ----------
function NextButton({ last, nudge, onPress }: { last: boolean; nudge: boolean; onPress: () => void }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!nudge) return y.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [nudge, y]);
  const Icon = last ? RotateCcw : ArrowDown;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={last ? 'Отначало' : 'Следващ съвет'}
      style={({ pressed }) => [styles.next, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <Text style={styles.nextText} maxFontSizeMultiplier={1.3}>{last ? 'Отначало' : 'Следващо'}</Text>
      <Animated.View style={{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }] }}>
        <Icon size={22} color={colors.ink} strokeWidth={2.6} />
      </Animated.View>
    </Pressable>
  );
}

function RailButton({ icon: Icon, label, on, onPress, a11y }: { icon: LucideIcon; label: string; on?: boolean; onPress: () => void; a11y: string }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        s.setValue(0.75);
        Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 16 }).start();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      hitSlop={6}
      style={styles.railBtn}
    >
      <Animated.View style={[styles.railIcon, { transform: [{ scale: s }] }]}>
        <Icon size={26} color={on ? colors.red : '#fff'} fill={on ? colors.red : 'transparent'} strokeWidth={2.2} />
      </Animated.View>
      <Text style={styles.railLabel} maxFontSizeMultiplier={1.2}>{label}</Text>
    </Pressable>
  );
}

const white = (a: number) => `rgba(255,255,255,${a})`;
const tx = (k: keyof typeof type) => type[k] as TextStyle;

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20 },
  main: { flex: 1, justifyContent: 'center', gap: 14 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: white(0.06) },
  topicDot: { width: 8, height: 8, borderRadius: 4 },
  topicText: { ...tx('overline'), color: '#fff', fontSize: 13 },
  title: { ...tx('display'), color: '#fff' },
  stat: { ...tx('number'), fontSize: 58, lineHeight: 62, letterSpacing: -2 },
  statLabel: { ...tx('bodyStrong'), color: white(0.9), fontSize: 17, lineHeight: 23 },
  beat: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  beatText: { ...tx('body'), flex: 1, color: '#fff', fontSize: 18, lineHeight: 25 },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  ask: { ...tx('label'), color: white(0.85), fontSize: 16 },
  option: { flex: 1, minHeight: 76, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 2, borderColor: white(0.35), backgroundColor: white(0.12), paddingHorizontal: 12 },
  optionText: { ...tx('title'), color: '#fff', fontSize: 24, lineHeight: 28 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stamp: { borderWidth: 3, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4 },
  stampText: { ...tx('title'), fontSize: 26, lineHeight: 32, textTransform: 'uppercase', letterSpacing: 1 },
  feedback: { ...tx('heading'), color: '#fff', fontSize: 22 },
  why: { ...tx('body'), color: white(0.94), fontSize: 18, lineHeight: 26 },
  tapCircle: { width: 188, height: 188, borderRadius: 94, borderWidth: 6, backgroundColor: white(0.1), alignItems: 'center', justifyContent: 'center', gap: 2 },
  tapBpm: { ...tx('number'), fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  tapHint: { ...tx('label'), color: white(0.85), fontSize: 15 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guideDot: { width: 14, height: 14, borderRadius: 7 },
  col: { flex: 1, gap: 8, padding: 14, borderRadius: 20, backgroundColor: white(0.08), borderWidth: 1, borderColor: white(0.14) },
  colTitle: { ...tx('heading'), color: '#fff', fontSize: 19 },
  colPoint: { ...tx('body'), color: white(0.92), fontSize: 15, lineHeight: 21 },
  note: { borderLeftWidth: 4, paddingLeft: 14, paddingVertical: 4 },
  noteText: { ...tx('bodyStrong'), color: '#fff', fontSize: 16, lineHeight: 23 },
  scoreRow: { flexDirection: 'row', gap: 10 },
  scoreTile: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: white(0.1), borderWidth: 1, borderColor: white(0.14), gap: 2 },
  scoreValue: { ...tx('number'), fontSize: 30, color: '#fff' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#fff' },
  ctaText: { ...tx('heading'), color: colors.ink, fontSize: 19 },
  ctaSub: { ...tx('caption'), color: colors.ink2 },
  foot: { gap: 8, paddingTop: 12 },
  footRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  footNote: { ...tx('caption'), color: white(0.78), fontSize: 13 },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: radius.pill, backgroundColor: '#fff', paddingHorizontal: 22 },
  nextText: { ...tx('bodyStrong'), color: colors.ink, fontSize: 18 },
  railBtn: { alignItems: 'center', gap: 3, minWidth: 62 },
  railIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: white(0.14), borderWidth: 1, borderColor: white(0.22), alignItems: 'center', justifyContent: 'center' },
  railLabel: { ...tx('label'), color: '#fff', fontSize: 12, lineHeight: 15 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
  paused: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 6 },
  pausedText: { ...tx('label'), color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, overflow: 'hidden' },
});
