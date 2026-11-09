import { router } from 'expo-router';
import { Building, ChevronUp, Hand, LocateFixed, UserRound, X } from 'lucide-react-native';
import { BlurTargetView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, BackHandler, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AedDetails, AedHeader } from '@/components/AedCard';
import { AedMap } from '@/components/AedMap';
import type { Focus } from '@/components/LeafletMap';
import { LearnEntry } from '@/components/LearnEntry';
import { useReducedMotion } from '@/components/Pulse';
import { SosButton } from '@/components/SosButton';
import { Banner, Glass, IconButton, Mark, T } from '@/components/ui';
import { useAedState } from '@/lib/AedContext';
import { homeFor, useSession } from '@/lib/session';
import { colors, radius, space, type } from '@/theme';

const PAD = 16;

/**
 * Home: the map is the product. One floating bar on top, one sheet below.
 * The sheet rests collapsed (nearest AED in one line + „Някой припадна“) so the map stays visible.
 * Tap or drag it up for status, route and the volunteer/organisation entries; selecting a pin opens it
 * for that AED. Swipe down, ✕, a tap on the map or Back collapses it again. The SOS button is the
 * sheet's fixed bottom, so it never leaves the screen whatever the sheet does.
 */
export default function Home() {
  const { ranked, coords, locationStatus, offline } = useAedState();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [size, setSize] = useState({ header: 72, body: 0, sos: 84, floating: 68 });
  // The map is the blur source for every glass surface on this screen (real blur on Android needs a target).
  const target = useRef<ComponentRef<typeof View>>(null);
  const open = useRef(new Animated.Value(0)).current;

  const nearest = coords ? ranked[0] : undefined;
  const aed = useMemo(() => ranked.find((a) => a.id === selected) ?? nearest, [ranked, selected, nearest]);
  const openNow = ranked.filter((a) => a.open === 'open').length;
  const isSelected = !!selected && selected !== nearest?.id;
  // What the sheet covers once it settles; the map centres in what is left (read only when it flies).
  const sheetH = 2 * PAD + 2 + size.header + size.sos + (isOpen ? size.body : 0) + insets.bottom + 12 + size.floating;
  const topH = insets.top + 90;

  const animateTo = (to: 0 | 1) => {
    // Opening shows the AED it talks about (with you, when we know where you are) above the taller sheet.
    if (to === 1 && !isOpen && aed) setFocus(coords ? { ...coords, also: { lat: aed.lat, lon: aed.lon } } : { lat: aed.lat, lon: aed.lon, zoom: 16 });
    setIsOpen(to === 1);
    if (to === 0) setSelected(null);
    if (reduced) open.setValue(to);
    else Animated.spring(open, { toValue: to, useNativeDriver: false, speed: 18, bounciness: 0 }).start();
  };
  const select = (id: string) => {
    setSelected(id);
    animateTo(1);
    const a = ranked.find((x) => x.id === id);
    if (a) setFocus({ lat: a.lat, lon: a.lon, zoom: 16 });
  };
  const profile = () => router.push(me ? homeFor(me.user.roles) : '/login');

  // Drag the handle/header: follows the finger, then settles by direction (a flick) or by how far it got.
  const start = useRef(0);
  const latest = useRef({ animateTo, body: size.body });
  latest.current = { animateTo, body: size.body };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => open.stopAnimation((v) => (start.current = v)),
      onPanResponderMove: (_, g) => open.setValue(Math.max(0, Math.min(1, start.current - g.dy / Math.max(1, latest.current.body)))),
      onPanResponderRelease: (_, g) => {
        const v = start.current - g.dy / Math.max(1, latest.current.body);
        latest.current.animateTo(g.vy > 0.4 ? 0 : g.vy < -0.4 ? 1 : v > 0.5 ? 1 : 0);
      },
      onPanResponderTerminate: () => latest.current.animateTo(start.current > 0.5 ? 1 : 0),
    }),
  ).current;

  // Android Back closes the sheet before it leaves the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isOpen) return false;
      animateTo(0);
      return true;
    });
    return () => sub.remove();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // First location fix: frame you and the nearest AED together, once.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !nearest || !coords) return;
    framed.current = true;
    setFocus({ lat: coords.lat, lon: coords.lon, also: { lat: nearest.lat, lon: nearest.lon } });
  }, [nearest, coords]);

  const measure = (k: keyof typeof size) => (h: number) => setSize((s) => (Math.abs(s[k] - h) < 1 ? s : { ...s, [k]: h }));

  return (
    <View style={styles.fill}>
      <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
        <AedMap aeds={ranked} coords={coords} selected={isSelected || isOpen ? aed?.id : undefined} onSelect={select} onPress={() => isOpen && animateTo(0)} focus={focus} padTop={topH} padBottom={sheetH} />
      </BlurTargetView>

      {/* top bar */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Glass strong padded={false} style={styles.brand} blurTarget={target}>
          <View style={styles.brandRow}>
            <Mark size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.word} maxFontSizeMultiplier={1.3}>ДефиКарта</Text>
              <T v="caption" numberOfLines={1}>Стара Загора · {openNow} от {ranked.length} отворени</T>
            </View>
          </View>
        </Glass>
        <IconButton icon={UserRound} label={me ? `Профил: ${me.user.name}` : 'Вход'} onPress={profile} size={56} />
      </View>

      {(offline || locationStatus === 'denied') && (
        <View style={[styles.notice, { top: insets.top + 84 }]}>
          <Banner kind="caution">{locationStatus === 'denied' ? 'Без достъп до местоположението. Докосни дефибрилатор на картата.' : 'Няма връзка. Показваме последните запазени данни.'}</Banner>
        </View>
      )}

      {/* bottom sheet; the floating buttons ride on its top edge */}
      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View style={styles.floating} pointerEvents="box-none" onLayout={(e) => measure('floating')(e.nativeEvent.layout.height)}>
          <LearnEntry blurTarget={target} />
          {coords && <IconButton icon={LocateFixed} label="Към моето местоположение" onPress={() => { animateTo(0); setFocus({ ...coords, zoom: 15.5 }); }} size={52} />}
        </View>

        <Glass strong padded={false} style={styles.sheet} blurTarget={target}>
          <View style={{ padding: PAD }}>
            <View {...pan.panHandlers} onLayout={(e) => measure('header')(e.nativeEvent.layout.height)}>
              <Pressable
                onPress={() => aed && animateTo(isOpen ? 0 : 1)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={aed ? `${aed.name}. ${isOpen ? 'Скрий подробностите' : 'Покажи подробности и маршрут'}` : undefined}
                style={styles.header}
              >
                <View style={styles.handle} />
                {aed ? (
                  <>
                    <View style={styles.overRow}>
                      <T v="overline" style={{ flex: 1 }}>{isSelected ? 'Избран дефибрилатор' : 'Най-близкият дефибрилатор'}</T>
                      <View style={styles.toggle}>{isOpen ? <X size={18} color={colors.ink2} strokeWidth={2.4} /> : <ChevronUp size={18} color={colors.ink2} strokeWidth={2.4} />}</View>
                    </View>
                    <AedHeader aed={aed} compact={!isOpen} />
                  </>
                ) : (
                  <T v="caption">{locationStatus === 'denied' || locationStatus === 'error' ? 'Докосни дефибрилатор на картата, за да видиш подробности.' : 'Търсим местоположението ти, за да покажем най-близкия дефибрилатор…'}</T>
                )}
              </Pressable>
            </View>

            {/* details: height follows the open value; measured off-screen at full size */}
            <Animated.View style={{ height: open.interpolate({ inputRange: [0, 1], outputRange: [0, size.body] }), opacity: open, overflow: 'hidden' }} pointerEvents={isOpen ? 'auto' : 'none'} aria-hidden={!isOpen}>
              <View style={styles.measure} onLayout={(e) => measure('body')(e.nativeEvent.layout.height)}>
                {aed && <AedDetails aed={aed} />}
                {!isSelected && (
                  <View style={styles.tiles}>
                    <Tile icon={Hand} title="Доброволец" sub="Помагай наблизо" onPress={() => router.push('/volunteer')} />
                    <Tile icon={Building} title="Организации" sub="Поддръжка на AED" onPress={() => router.push(me?.user.roles.includes('aed_owner') ? '/org' : '/login')} />
                  </View>
                )}
              </View>
            </Animated.View>

            <View onLayout={(e) => measure('sos')(e.nativeEvent.layout.height)} style={{ paddingTop: 12 }}>
              <SosButton />
            </View>
          </View>
        </Glass>
      </View>
    </View>
  );
}

function Tile({ icon: Icon, title, sub, onPress }: { icon: typeof Hand; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} android_ripple={{ color: 'rgba(11,13,18,0.06)' }} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
      <View style={styles.tileIcon}>
        <Icon size={20} color={colors.ink} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" numberOfLines={1}>{title}</T>
        <T v="caption" numberOfLines={2}>{sub}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  top: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  brand: { flex: 1, borderRadius: radius.pill },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 18 },
  word: { ...(type.heading as object), fontSize: 18, lineHeight: 22, color: colors.ink },
  notice: { position: 'absolute', left: space.lg, right: space.lg },
  sheetWrap: { position: 'absolute', left: 10, right: 10, bottom: 0 },
  floating: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: 6, paddingBottom: 12 },
  sheet: { borderRadius: radius.xl },
  header: { gap: 6 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginTop: -6, marginBottom: 4 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(11,13,18,0.06)', alignItems: 'center', justifyContent: 'center' },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 12, gap: 12 },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tileIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
