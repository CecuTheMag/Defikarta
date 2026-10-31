import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, shadow, space, type } from '@/theme';

/**
 * The component kit. Every screen is built from these, so spacing, type and states stay consistent.
 * `tone="night"` switches a component to the urgent (dark) mood.
 */

export type Tone = 'calm' | 'night';
type Variant = keyof typeof type;

// ---------- type ----------
export function T({ v = 'body', tone = 'calm', color, style, children, numberOfLines, center }: { v?: Variant; tone?: Tone; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean }) {
  const base = tone === 'night' ? (v === 'caption' || v === 'label' || v === 'overline' ? colors.nightText2 : colors.nightText) : v === 'caption' || v === 'overline' ? colors.ink2 : colors.ink;
  return (
    <Text style={[type[v] as TextStyle, { color: color ?? base }, center && { textAlign: 'center' }, style]} numberOfLines={numberOfLines} maxFontSizeMultiplier={1.6}>
      {children}
    </Text>
  );
}

// ---------- brand mark ----------
export function Mark({ size = 28, inverse }: { size?: number; inverse?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!inverse && <Path d="M96 0h320a96 96 0 0 1 96 96v320a96 96 0 0 1-96 96H96A96 96 0 0 1 0 416V96A96 96 0 0 1 96 0z" fill={colors.red} />}
      <Path d="M256 420s-150-92-150-200a80 80 0 0 1 150-40 80 80 0 0 1 150 40c0 108-150 200-150 200z" fill={inverse ? colors.red : '#fff'} />
      <Path d="M276 170l-60 100h50l-20 80 70-110h-52z" fill={inverse ? '#fff' : colors.red} />
    </Svg>
  );
}

// ---------- glass ----------
/**
 * Frosted surface. iOS blurs natively. Android blurs only when the content behind is wrapped in a
 * BlurTargetView (pass its ref as `blurTarget`); otherwise a dense translucent fill keeps text at full contrast.
 */
export function Glass({ children, tone = 'calm', style, blurTarget, strong, padded = true }: { children?: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle>; blurTarget?: RefObject<ComponentRef<typeof View> | null>; strong?: boolean; padded?: boolean }) {
  const night = tone === 'night';
  const canBlur = Platform.OS === 'ios' || !!blurTarget;
  const fill = night ? (canBlur ? 'rgba(18,20,26,0.55)' : 'rgba(26,28,36,0.92)') : canBlur ? (strong ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.5)') : strong ? 'rgba(255,255,255,0.96)' : colors.glassStrong;
  return (
    <View style={[styles.glassBox, night ? styles.glassNight : styles.glassCalm, style]}>
      {canBlur && (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={night ? 40 : 60}
          tint={night ? 'dark' : 'light'}
          {...(Platform.OS === 'android' && blurTarget ? { blurTarget, blurMethod: 'dimezisBlurViewSdk31Plus' as const } : {})}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {/* a 1 px top highlight, the light edge that sells "glass" */}
      <View style={[styles.highlight, { backgroundColor: night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.95)' }]} />
      <View style={padded && { padding: space.lg, gap: space.md }}>{children}</View>
    </View>
  );
}

// ---------- buttons ----------
type ButtonKind = 'primary' | 'dark' | 'glass' | 'ghost' | 'success' | 'nightGhost';

export function Button({
  title,
  subtitle,
  onPress,
  kind = 'primary',
  icon: Icon,
  disabled,
  size = 'md',
  style,
  label,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'xl';
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  const fg = kind === 'primary' || kind === 'dark' || kind === 'success' || kind === 'nightGhost' ? '#fff' : colors.ink;
  const h = size === 'xl' ? 76 : size === 'lg' ? 60 : 52;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? (subtitle ? `${title}. ${subtitle}` : title)}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => to(0.97)}
        onPressOut={() => to(1)}
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        android_ripple={{ color: kind === 'glass' || kind === 'ghost' ? 'rgba(11,13,18,0.08)' : 'rgba(255,255,255,0.18)', borderless: false }}
        style={[styles.btn, styles[kind], { minHeight: h }, disabled && styles.disabled]}
      >
        {Icon && <Icon size={size === 'xl' ? 26 : 20} color={fg} strokeWidth={2.2} />}
        <View style={{ flexShrink: 1, alignItems: Icon ? 'flex-start' : 'center' }}>
          <Text style={[size === 'xl' ? styles.btnXl : styles.btnText, { color: fg }]} maxFontSizeMultiplier={1.4}>{title}</Text>
          {subtitle && <Text style={[styles.btnSub, { color: kind === 'glass' || kind === 'ghost' ? colors.ink2 : 'rgba(255,255,255,0.78)' }]} maxFontSizeMultiplier={1.4}>{subtitle}</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({ icon: Icon, onPress, label, tone = 'calm', size = 48 }: { icon: LucideIcon; onPress: () => void; label: string; tone?: Tone; size?: number }) {
  const night = tone === 'night';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { width: size, height: size, backgroundColor: night ? 'rgba(255,255,255,0.10)' : colors.glassStrong, borderColor: night ? colors.nightEdge : colors.line }, pressed && { opacity: 0.6 }]}
    >
      <Icon size={22} color={night ? colors.nightText : colors.ink} strokeWidth={2.2} />
    </Pressable>
  );
}

// ---------- layout ----------
/** Top bar with a real back button; replaces the platform header so every screen shares one look. */
export function Header({ title, tone = 'calm', right, back = true }: { title?: string; tone?: Tone; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {back ? <IconButton icon={ChevronLeft} label="Назад" tone={tone} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <View style={{ width: 48 }} />}
      {title ? <T v="label" tone={tone} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>{title}</T> : <View style={{ flex: 1 }} />}
      <View style={{ minWidth: 48, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Screen({ children, tone = 'calm', title, right, back, scroll = true, contentStyle }: { children: ReactNode; tone?: Tone; title?: string; right?: ReactNode; back?: boolean; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const bg = tone === 'night' ? colors.night : colors.paper;
  const body = [{ padding: space.lg, paddingBottom: insets.bottom + 40, gap: space.lg }, contentStyle];
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={tone === 'night' ? 'light' : 'dark'} />
      <Header title={title} tone={tone} right={right} back={back} />
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, body]}>{children}</View>
      )}
    </View>
  );
}

export function Card({ children, style, tone = 'calm' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: Tone }) {
  return <View style={[styles.card, tone === 'night' && styles.cardNight, style]}>{children}</View>;
}

export const Row = ({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
export const Divider = ({ tone = 'calm' }: { tone?: Tone }) => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tone === 'night' ? colors.nightEdge : colors.lineStrong }} />;

// ---------- status ----------
export type Status = 'open' | 'closed' | 'unknown' | 'ok' | 'soon' | 'overdue' | 'missing' | 'live';
const STATUS: Record<Status, { fg: string; bg: string }> = {
  open: { fg: colors.greenDark, bg: colors.greenSoft },
  ok: { fg: colors.greenDark, bg: colors.greenSoft },
  closed: { fg: colors.redDark, bg: colors.redSoft },
  overdue: { fg: colors.redDark, bg: colors.redSoft },
  unknown: { fg: colors.amber, bg: colors.amberSoft },
  soon: { fg: colors.amber, bg: colors.amberSoft },
  missing: { fg: colors.amber, bg: colors.amberSoft },
  live: { fg: '#fff', bg: colors.red },
};
export const statusColor = (s: Status) => STATUS[s].fg;

export function Pill({ status, label }: { status: Status; label: string }) {
  const c = STATUS[status];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <Text style={[type.label as TextStyle, { color: c.fg, fontSize: 13 }]}>{label}</Text>
    </View>
  );
}

/** Every server-backed screen in the drill environment carries this tag (BLUEPRINT safety rule 6). */
export const DrillTag = () => (
  <View style={styles.drill} accessibilityLabel="Учебна среда">
    <View style={[styles.dot, { backgroundColor: colors.ink }]} />
    <Text style={styles.drillText}>УЧЕНИЕ</Text>
  </View>
);

export function Banner({ kind, children, tone = 'calm' }: { kind: 'danger' | 'caution' | 'ok' | 'info'; children: ReactNode; tone?: Tone }) {
  const map = {
    danger: { Icon: TriangleAlert, fg: colors.redDark, bg: colors.redSoft },
    caution: { Icon: TriangleAlert, fg: colors.amber, bg: colors.amberSoft },
    ok: { Icon: CircleCheck, fg: colors.greenDark, bg: colors.greenSoft },
    info: { Icon: Info, fg: colors.ink2, bg: colors.paper },
  }[kind];
  const night = tone === 'night';
  return (
    <View style={[styles.banner, { backgroundColor: night ? 'rgba(255,255,255,0.08)' : map.bg }]} accessibilityRole="alert">
      <map.Icon size={20} color={night ? (kind === 'ok' ? '#6CE9A6' : kind === 'danger' ? '#FF8A97' : '#FEC84B') : map.fg} strokeWidth={2.2} />
      <Text style={[type.label as TextStyle, { flex: 1, color: night ? colors.nightText : map.fg, fontSize: 15, lineHeight: 21 }]}>{children}</Text>
    </View>
  );
}

// ---------- inputs ----------
export function Chip({ label, on, onPress, danger, tone = 'calm', icon: Icon }: { label: string; on?: boolean; onPress: () => void; danger?: boolean; tone?: Tone; icon?: LucideIcon }) {
  const night = tone === 'night';
  const active = on ? (danger ? colors.red : night ? '#fff' : colors.ink) : undefined;
  const fg = on ? (night && !danger ? colors.ink : '#fff') : night ? colors.nightText : colors.ink;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, { backgroundColor: active ?? (night ? 'rgba(255,255,255,0.08)' : colors.bg), borderColor: active ?? (night ? colors.nightEdge : colors.lineStrong) }, pressed && { opacity: 0.7 }]}
    >
      {Icon && <Icon size={16} color={fg} strokeWidth={2.2} />}
      <Text style={[type.label as TextStyle, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChange, placeholder, hint, keyboard, error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; keyboard?: 'default' | 'number-pad' | 'email-address' | 'url'; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput
        style={[styles.input, error ? { borderColor: colors.red } : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        keyboardType={keyboard}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
      {error ? <T v="caption" color={colors.redDark}>{error}</T> : hint ? <T v="caption">{hint}</T> : null}
    </View>
  );
}

export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <Banner kind="danger">{children}</Banner> : null);

// ---------- data ----------
/** A ring that fills from 0 to 1 (readiness, countdowns). */
export function Ring({ value, size = 64, stroke = 6, color = colors.green, track = colors.line, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {children}
    </View>
  );
}

export function Stat({ value, label, tone = 'calm', color }: { value: ReactNode; label: string; tone?: Tone; color?: string }) {
  return (
    <View style={{ gap: 2, flexShrink: 1 }}>
      <Text style={[type.number as TextStyle, { fontSize: 26, color: color ?? (tone === 'night' ? colors.nightText : colors.ink) }]} maxFontSizeMultiplier={1.3}>{value}</Text>
      <T v="caption" tone={tone}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  glassBox: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  glassCalm: { borderColor: 'rgba(255,255,255,0.7)', ...shadow.float },
  glassNight: { borderColor: colors.nightEdge },
  highlight: { position: 'absolute', top: 0, left: 16, right: 16, height: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12, overflow: 'hidden' },
  primary: { backgroundColor: colors.red },
  dark: { backgroundColor: colors.ink },
  success: { backgroundColor: colors.green },
  glass: { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.lineStrong },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.lineStrong },
  nightGhost: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  disabled: { opacity: 0.38 },
  btnText: { ...(type.bodyStrong as object), fontSize: 17 },
  btnXl: { ...(type.heading as object), fontSize: 22, fontWeight: '800' },
  btnSub: { ...(type.caption as object) },
  iconBtn: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: 8 },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft },
  cardNight: { backgroundColor: colors.night2, borderColor: colors.nightEdge, shadowOpacity: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  drill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#FFD60A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  drillText: { ...(type.overline as object), color: colors.ink, fontSize: 11 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.md, padding: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  input: { ...(type.body as object), color: colors.ink, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.lineStrong, borderRadius: radius.sm, paddingHorizontal: 14, minHeight: 52 },
});
