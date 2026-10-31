/**
 * ДефиКарта design tokens.
 *
 * Two moods, one system:
 * - Calm (map, volunteer, organisation): paper-white, frosted glass over a quiet basemap, ink type.
 * - Urgent (112, CPR, live alerts): near-black canvas, one signal red, the largest type in the app.
 * Contrast targets: body text ≥ 4.5:1 on its surface in both moods; touch targets ≥ 48 dp (most are 56+).
 */

export const colors = {
  // brand + semantic
  red: '#E1112D',
  redDark: '#B30C22',
  redSoft: '#FDECEE',
  green: '#0E9F6E',
  greenDark: '#05603A',
  greenSoft: '#E7F7F0',
  amber: '#B54708',
  amberSoft: '#FEF3E2',
  blue: '#2563EB',

  // calm surfaces
  ink: '#0B0D12',
  ink2: '#4A505C', // secondary text, 8.3:1 on white
  ink3: '#6B7280', // tertiary text, 4.8:1 on white
  paper: '#F3F4F6',
  bg: '#FFFFFF',
  line: 'rgba(11,13,18,0.08)',
  lineStrong: 'rgba(11,13,18,0.14)',
  glass: 'rgba(255,255,255,0.78)',
  glassStrong: 'rgba(255,255,255,0.92)',
  glassEdge: 'rgba(255,255,255,0.9)',

  // urgent surfaces
  night: '#07080B',
  night2: '#12141A',
  nightGlass: 'rgba(255,255,255,0.07)',
  nightEdge: 'rgba(255,255,255,0.12)',
  nightText: '#F5F6F8',
  nightText2: '#B4B8C2', // 9:1 on night

  // legacy names still used by the CPR metronome code
  muted: '#4A505C',
  soft: '#F3F4F6',
};

export const font = {
  family: 'Manrope',
  // Weights map to the embedded Manrope faces (app.json → expo-font).
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

/** Type scale, tuned for a 16 dp body (older users) with a confident display size. */
export const type = {
  display: { fontFamily: font.family, fontWeight: font.heavy, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  title: { fontFamily: font.family, fontWeight: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  heading: { fontFamily: font.family, fontWeight: font.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily: font.family, fontWeight: font.medium, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: font.family, fontWeight: font.bold, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.family, fontWeight: font.semibold, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: font.family, fontWeight: font.medium, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: font.family, fontWeight: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  number: { fontFamily: font.family, fontWeight: font.heavy, fontVariant: ['tabular-nums' as const] },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };

export const shadow = {
  float: { shadowColor: '#0B0D12', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  soft: { shadowColor: '#0B0D12', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  glow: { shadowColor: '#E1112D', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
};

export const motion = { fast: 140, base: 220, slow: 380 };
