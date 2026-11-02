import { router } from 'expo-router';
import { Building, Hand, LocateFixed, UserRound } from 'lucide-react-native';
import { BlurTargetView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AedCard } from '@/components/AedCard';
import { AedMap } from '@/components/AedMap';
import { LearnEntry } from '@/components/LearnEntry';
import { SosButton } from '@/components/SosButton';
import { Banner, Glass, IconButton, Mark, T } from '@/components/ui';
import { useAedState } from '@/lib/AedContext';
import { homeFor, useSession } from '@/lib/session';
import { colors, radius, space, type } from '@/theme';

/**
 * Home: the map is the product. One floating bar on top, one sheet below with the single most
 * important fact (the nearest usable AED) and the single most important action (someone collapsed).
 */
export default function Home() {
  const { ranked, coords, locationStatus, offline } = useAedState();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  // The map is the blur source for every glass surface on this screen (real blur on Android needs a target).
  const target = useRef<ComponentRef<typeof View>>(null);

  const nearest = coords ? ranked[0] : undefined;
  const aed = useMemo(() => ranked.find((a) => a.id === selected) ?? nearest, [ranked, selected, nearest]);
  const openNow = ranked.filter((a) => a.open === 'open').length;
  const sheetH = Math.min(440, height * 0.52);

  const select = (id: string) => {
    setSelected(id);
    const a = ranked.find((x) => x.id === id);
    if (a) setFocus({ lat: a.lat, lon: a.lon, zoom: 16 });
  };
  const profile = () => router.push(me ? homeFor(me.user.roles) : '/login');

  // First location fix: frame the nearest AED above the sheet, once.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !nearest) return;
    framed.current = true;
    setFocus({ lat: nearest.lat, lon: nearest.lon, zoom: 15.5 });
  }, [nearest]);

  return (
    <View style={styles.fill}>
      <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
        <AedMap aeds={ranked} coords={coords} selected={aed?.id} onSelect={select} focus={focus} padBottom={sheetH} />
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
          <Banner kind="caution">{locationStatus === 'denied' ? 'Без достъп до местоположението. Показваме всички дефибрилатори в града.' : 'Няма връзка. Показваме последните запазени данни.'}</Banner>
        </View>
      )}

      <View style={[styles.learn, { bottom: sheetH + insets.bottom + 12 }]}>
        <LearnEntry blurTarget={target} />
      </View>

      {coords && (
        <View style={[styles.locate, { bottom: sheetH + insets.bottom + 12 }]}>
          <IconButton icon={LocateFixed} label="Към моето местоположение" onPress={() => { setSelected(null); setFocus({ ...coords, zoom: 15.5 }); }} />
        </View>
      )}

      {/* bottom sheet */}
      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 12 }]}>
        <Glass strong style={styles.sheet} blurTarget={target}>
          <View style={styles.handle} />
          {aed ? (
            <AedCard aed={aed} overline={selected && selected !== nearest?.id ? 'Избран дефибрилатор' : 'Най-близкият дефибрилатор'} />
          ) : (
            <T v="caption">Търсим местоположението ти, за да покажем най-близкия дефибрилатор…</T>
          )}

          <SosButton />

          <View style={styles.tiles}>
            <Tile icon={Hand} title="Доброволец" sub="Помагай наблизо" onPress={() => router.push('/volunteer')} />
            <Tile icon={Building} title="Организации" sub="Поддръжка на AED" onPress={() => router.push(me?.user.roles.includes('aed_owner') ? '/org' : '/login')} />
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
      <View>
        <T v="bodyStrong" numberOfLines={1}>{title}</T>
        <T v="caption" numberOfLines={1}>{sub}</T>
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
  locate: { position: 'absolute', right: space.lg },
  learn: { position: 'absolute', left: space.lg },
  sheetWrap: { position: 'absolute', left: 10, right: 10, bottom: 0 },
  sheet: { borderRadius: radius.xl },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginTop: -4 },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, gap: 10, minHeight: 64, padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tileIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
