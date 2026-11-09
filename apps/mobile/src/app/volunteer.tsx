import { distanceM, formatDistance, nativeWalkingUrl, type LatLon } from '@defikarta/core';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  Ambulance,
  BellOff,
  BellRing,
  CircleCheck,
  Download,
  FileText,
  LocateFixed,
  LogOut,
  MapPin,
  Moon,
  Route,
  ShieldAlert,
  ShieldCheck,
  Trash,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, Share, StyleSheet, Switch, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LeafletMap, type Pin } from '@/components/LeafletMap';
import { Pulse } from '@/components/Pulse';
import { Banner, Button, Card, Chip, Divider, DrillTag, ErrorText, Field, Glass, Header, Ring, Row, Screen, Stat, T } from '@/components/ui';
import { useAedState } from '@/lib/AedContext';
import { api, usePoll } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, radius, space, type } from '@/theme';

/** Volunteer (responder) mode: the website's „Доброволец“ flow, designed for the phone. */
export default function Volunteer() {
  const { ready, me, refresh } = useSession();
  if (!ready) return <Screen title="Доброволец"><T>Зареждане…</T></Screen>;
  if (!me)
    return (
      <Screen title="Доброволец">
        <Intro />
        <Button size="lg" title="Вход" onPress={() => router.push('/login')} />
      </Screen>
    );
  if (!me.responder) return <Register done={refresh} />;
  if (me.responder.status !== 'verified')
    return (
      <Screen title="Доброволец">
        <Card>
          <Ring value={0.5} size={72} color={colors.amber}>
            <ShieldAlert size={26} color={colors.amber} strokeWidth={2.2} />
          </Ring>
          <T v="title">Чакаме проверка</T>
          <T>Удостоверението ти ({me.responder.certificate?.issuer}) е при верификатор. Щом бъде одобрено, ще можеш да включиш известията.</T>
          <T v="caption">В демото: на компютъра влез като verifier@drill.defikarta.bg → Конзола → Проверка.</T>
        </Card>
        <Button kind="glass" title="Обнови" onPress={refresh} />
      </Screen>
    );
  return <Console />;
}

function Intro() {
  return (
    <View style={{ gap: space.md }}>
      <T v="overline">Мрежа от обучени хора</T>
      <T v="display">Бъди първите четири минути.</T>
      <T color={colors.ink2}>Когато наблизо някой получи сърдечен арест, ДефиКарта известява обучени доброволци: един започва масаж, друг носи най-близкия дефибрилатор. Винаги можеш да откажеш.</T>
    </View>
  );
}

function Register({ done }: { done: () => void }) {
  const [f, setF] = useState({ birthYear: '2000', issuer: '', issuedOn: '' });
  const [err, setErr] = useState<string | null>(null);
  const valid = !!f.issuer && /^\d{4}-\d{2}-\d{2}$/.test(f.issuedOn);
  return (
    <Screen title="Стани доброволец">
      <Intro />
      <Card>
        <Field label="Година на раждане" value={f.birthYear} onChange={(v) => setF({ ...f, birthYear: v })} keyboard="number-pad" hint="Улични известия — само за пълнолетни. Под 18 г. — ученията в училището ти." />
        <Field label="Издател на удостоверението" value={f.issuer} onChange={(v) => setF({ ...f, issuer: v })} placeholder="БЧК Стара Загора" />
        <Field label="Дата на издаване" value={f.issuedOn} onChange={(v) => setF({ ...f, issuedOn: v })} placeholder="ГГГГ-ММ-ДД" hint="Удостоверението важи 2 години от курса." />
      </Card>
      <ErrorText>{err}</ErrorText>
      <Button size="lg" title="Изпрати за проверка" disabled={!valid} onPress={() => api('/api/rpc/register_responder', { ...f, birthYear: Number(f.birthYear) }).then(done, (x: Error) => setErr(x.message))} />
    </Screen>
  );
}

/** Loud enough to notice in a pocket: vibration plus a short Bulgarian voice line. */
function ring(band: string) {
  Vibration.vibrate([0, 500, 250, 500, 250, 500]);
  Speech.speak(`Учение. Сърдечен арест на ${band.replace('~', 'около ').replace('м', 'метра')}. Можеш ли да помогнеш?`, { language: 'bg-BG' });
}

function Console() {
  const { data, error, reload } = usePoll(() => api<any>('/api/responder/state'), 2500);
  const { coords: gps } = useAedState();
  const [pos, setPos] = useState<LatLon | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const seen = useRef(new Set<string>());
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data?.responder?.pos && !pos) setPos(data.responder.pos);
  }, [data, pos]);
  useEffect(() => {
    for (const o of data?.offers ?? []) if (!seen.current.has(o.id)) (seen.current.add(o.id), ring(o.band));
  }, [data]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const active = data?.active;
  const a = active?.assignment;
  const target: LatLon | null = active ? (a.role === 'aed_runner' && a.status === 'en_route' && active.aed ? active.aed : active.incident.pos) : null;

  // Moving: the phone's real GPS, or (demo, when you are not in Stara Zagora) a walk toward the target.
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    if (!sim || !a || !target || !posRef.current) return;
    const t = setInterval(() => {
      const p = posRef.current!;
      const d = distanceM(p, target);
      const f = d < 10 ? 0 : Math.min(1, 10 / d);
      const next = { lat: p.lat + (target.lat - p.lat) * f, lon: p.lon + (target.lon - p.lon) * f };
      setPos(next);
      api('/api/rpc/push_location', { assignmentId: a.id, ...next }).catch(() => undefined);
    }, 1000);
    return () => clearInterval(t);
  }, [sim, a?.id, target?.lat, target?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastPush = useRef(0);
  useEffect(() => {
    if (sim || !a || !gps || Date.now() - lastPush.current < 3000) return;
    lastPush.current = Date.now();
    setPos(gps);
    api('/api/rpc/push_location', { assignmentId: a.id, ...gps }).catch(() => undefined);
  }, [gps, sim, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where alerts are measured from: a point you tapped on the map, otherwise the phone's GPS.
  const here = pos ?? gps;
  const hereKey = here ? `${here.lat.toFixed(5)},${here.lon.toFixed(5)}` : '';
  const focus = useMemo(() => (here ? { ...here, zoom: 15 } : null), [hereKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Presence expires after 30 min on the server; while available with the app open, renew it every 10.
  const available = data?.responder?.availability === 'around';
  const hereRef = useRef(here);
  hereRef.current = here;
  useEffect(() => {
    if (!available) return;
    const t = setInterval(() => hereRef.current && api('/api/rpc/set_availability', { mode: 'around', ...hereRef.current }).catch(() => undefined), 10 * 60_000);
    return () => clearInterval(t);
  }, [available]);

  if (!data) return <Screen title="Доброволец"><T>{error ?? 'Зареждане…'}</T></Screen>;
  const r = data.responder;

  if (active) return <Active active={active} pos={pos} target={target} sim={sim} setSim={setSim} act={act} err={err} />;
  if (data.offers.length) return <Offer o={data.offers[0]} act={act} err={err} />;

  const missing: string[] = r.readiness.missing;
  const on = r.availability === 'around';
  const toggle = () => act(() => api('/api/rpc/set_availability', on ? { mode: 'off' } : { mode: 'around', ...here }));

  return (
    <Screen title="Доброволец" right={<DrillTag />}>
      {/* the switch that matters, as the hero */}
      <View style={[styles.hero, on && styles.heroOn]}>
        <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={14}>
          <Pulse key={on ? 'on' : 'off'} color={on ? '#12B76A' : 'transparent'} size={52} rings={on ? 2 : 0} period={2600}>
            <View style={[styles.orb, { backgroundColor: on ? '#12B76A' : 'rgba(255,255,255,0.14)' }]}>
              {on ? <BellRing size={24} color="#fff" strokeWidth={2.4} /> : <BellOff size={24} color={colors.nightText2} strokeWidth={2.4} />}
            </View>
          </Pulse>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="overline" tone="night">Известия</T>
            <T v="title" tone="night">{on ? 'Достъпен си' : 'Изключени'}</T>
            <T v="caption" tone="night">{on ? 'Ще те известим, ако наблизо има случай, докато приложението е отворено.' : missing.length ? 'Довърши готовността отдолу, за да ги включиш.' : here ? 'Включи ги, когато можеш да помогнеш.' : 'Разреши местоположението или докосни картата отдолу.'}</T>
          </View>
        </Row>
        <Button
          size="lg"
          kind={on || !here || missing.length > 0 ? 'nightGhost' : 'primary'}
          icon={on ? BellOff : BellRing}
          title={on ? 'Изключи известията' : 'Достъпен съм'}
          disabled={!on && (!here || missing.length > 0)}
          onPress={toggle}
        />
        <Row gap={28}>
          <Stat tone="night" value={r.acceptCount} label="приети" />
          <Stat tone="night" value={r.offerCount} label="известия" />
          <Stat tone="night" value={4 - missing.length + '/4'} label="готовност" color={missing.length ? '#FEC84B' : '#6CE9A6'} />
        </Row>
      </View>
      <ErrorText>{err}</ErrorText>

      {data.debrief && (
        <Banner kind={data.debrief.unsafe ? 'caution' : 'ok'}>
          {data.debrief.unsafe ? 'Добре, че се пази.' : 'Благодарим ти.'} Ако случаят те е разтърсил, говори с координатора на доброволците (контакт за подкрепа — уточнява се с БЧК).
        </Banner>
      )}

      <Readiness r={r} reload={reload} />

      <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
        <View style={{ height: 220 }}>
          <LeafletMap center={here ?? { lat: 42.4258, lon: 25.6345 }} pins={here ? [{ id: 'me', kind: 'me', ...here }] : []} onPress={setPos} focus={focus} />
        </View>
        <View style={{ padding: space.lg, gap: space.md }}>
          <T v="heading">Твоята позиция</T>
          <T v="caption">Докосни картата или ползвай GPS. Без следене на живо: точната позиция се споделя само в приет случай и се трие при затварянето му.</T>
          <Row>
            <Chip icon={LocateFixed} label="Моята позиция (GPS)" onPress={() => gps && setPos(gps)} />
            {on && here && <Chip icon={MapPin} label="Обнови" onPress={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...here }))} />}
          </Row>
        </View>
      </Card>

      <MyData />
    </Screen>
  );
}

// ---------- incoming alert: takes over the screen ----------
function Offer({ o, act, err }: { o: any; act: (fn: () => Promise<unknown>) => void; err: string | null }) {
  const insets = useSafeAreaInsets();
  const left = Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 1000));
  const total = 30;
  const accept = (role?: 'cpr') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept', ...(role ? { role } : {}) }));
  };
  return (
    <View style={[styles.takeover, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
      <Row style={{ justifyContent: 'space-between' }}>
        <DrillTag />
        <T v="overline" tone="night">Сигнал за сърдечен арест</T>
      </Row>
      <View style={styles.offerCenter}>
        <Pulse color={colors.red} size={190} rings={3} period={1800}>
          <Ring value={left / total} size={190} stroke={8} color={colors.red} track="rgba(255,255,255,0.1)">
            <Text style={styles.offerSec} maxFontSizeMultiplier={1.2}>{left}</Text>
            <T v="caption" tone="night">секунди</T>
          </Ring>
        </Pulse>
        <Text style={styles.offerDist} maxFontSizeMultiplier={1.3}>{o.band} от теб</Text>
        <T v="body" tone="night" center color={colors.nightText2}>Можеш ли да помогнеш? Отказът е без последствия.</T>
      </View>
      <View style={{ gap: space.sm }}>
        {o.called112 && <Banner tone="night" kind="ok">112 е уведомен</Banner>}
        {o.caution && <Banner tone="night" kind="caution">Безопасността не е потвърдена. Огледай се, преди да се приближиш.</Banner>}
        {o.role === 'aed_runner' && (
          <Banner tone="night" kind="info">Най-близкият дефибрилатор: {o.suggestedAed?.name}</Banner>
        )}
      </View>
      <View style={{ gap: space.sm }}>
        {o.role === 'aed_runner' ? (
          <>
            <Button size="xl" icon={Zap} title="Нося AED" subtitle="вземам дефибрилатора и идвам" onPress={() => accept()} />
            <Button size="lg" kind="nightGhost" title="Тръгвам — само масаж" onPress={() => accept('cpr')} />
          </>
        ) : (
          <Button size="xl" title="Тръгвам" subtitle="започвам масаж на място" onPress={() => accept()} />
        )}
        <Button size="lg" kind="nightGhost" title="Не мога" onPress={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'decline' }))} />
        <ErrorText>{err}</ErrorText>
      </View>
    </View>
  );
}

// ---------- accepted case: map first ----------
function Active({ active, pos, target, sim, setSim, act, err }: { active: any; pos: LatLon | null; target: LatLon | null; sim: boolean; setSim: (v: boolean) => void; act: (fn: () => Promise<unknown>) => void; err: string | null }) {
  const insets = useSafeAreaInsets();
  const a = active.assignment;
  const steps: Record<string, string> = { on_scene: 'На място съм', aed_collected: 'Взех дефибрилатора', aed_on_scene: 'Дефибрилаторът е на място' };
  const next = a.role === 'cpr' ? (a.status === 'en_route' ? 'on_scene' : null) : a.status === 'en_route' ? 'aed_collected' : a.status === 'aed_collected' ? 'aed_on_scene' : null;
  const pins: Pin[] = [{ id: 'patient', kind: 'patient', ...active.incident.pos }];
  if (active.aed) pins.push({ id: 'aed', kind: 'aed', lat: active.aed.lat, lon: active.aed.lon, color: colors.green, selected: a.status === 'en_route' && a.role === 'aed_runner' });
  if (pos) pins.push({ id: 'me', kind: a.role === 'cpr' ? 'cpr' : 'runner', ...pos });
  const title = a.role === 'cpr' ? 'Към пациента' : a.status === 'en_route' ? 'Вземи дефибрилатора' : 'Занеси дефибрилатора';
  const d = pos && target ? formatDistance(distanceM(pos, target)) : null;
  // Re-centre when the target changes (patient → AED → patient), not on every one-second re-render.
  const focus = useMemo(() => (target ? { ...target, zoom: 16 } : null), [target?.lat, target?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={StyleSheet.absoluteFill}>
        <LeafletMap center={target ?? active.incident.pos} zoom={16} pins={pins} lines={pos && target ? [{ points: [pos, target], color: colors.blue, dashed: true }] : []} focus={focus} padBottom={360} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <Header right={<DrillTag />} />
      </View>
      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 10 }]}>
        <Glass strong style={{ borderRadius: radius.xl }}>
          {active.incident.scene === 'unsafe' && <Banner kind="danger">Мястото е отбелязано като опасно. Не се приближавай — изчакай 112.</Banner>}
          {active.incident.scene === 'unknown' && <Banner kind="caution">Безопасността не е потвърдена. Огледай се, преди да се приближиш.</Banner>}
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="overline">{a.role === 'cpr' ? 'Масаж' : 'Носач на AED'} · {active.incident.called112 ? '112 е уведомен' : 'обади се на 112'}</T>
              <T v="title">{title}</T>
              {a.role === 'aed_runner' && active.aed && <T v="caption" numberOfLines={2}>{active.aed.name}{active.aed.locationHint ? ` · ${active.aed.locationHint}` : ''}</T>}
            </View>
            {d && <Text style={styles.dist} maxFontSizeMultiplier={1.3}>{d}</Text>}
          </Row>
          {next && <Button size="xl" icon={CircleCheck} title={steps[next]!} onPress={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: next }))} />}
          <Row style={{ flexWrap: 'nowrap' }}>
            {target && <Button style={{ flex: 1 }} kind="glass" icon={Route} title="Маршрут" onPress={() => Linking.openURL(nativeWalkingUrl('android', target))} />}
            <Button style={{ flex: 1 }} kind="glass" icon={Ambulance} title="Линейката дойде" onPress={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: 'ems_on_scene' }))} />
          </Row>
          <Divider />
          <Row style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
            <T v="caption" style={{ flex: 1 }}>Симулирай придвижване (демо). Иначе споделяме GPS, докато случаят е активен.</T>
            <Switch value={sim} onValueChange={setSim} trackColor={{ true: colors.green, false: colors.lineStrong }} thumbColor="#fff" />
          </Row>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Опасно ли е мястото?', 'Ще се оттеглиш и известяването на други ще спре. Това не се брои като отказ.', [
                { text: 'Не', style: 'cancel' },
                { text: 'Оттеглям се', style: 'destructive', onPress: () => act(() => api('/api/rpc/withdraw_unsafe', { assignmentId: a.id })) },
              ])
            }
            style={styles.unsafe}
            hitSlop={8}
          >
            <TriangleAlert size={18} color={colors.redDark} strokeWidth={2.2} />
            <T v="label" color={colors.redDark}>Опасно е — оттеглям се</T>
          </Pressable>
          <ErrorText>{err}</ErrorText>
        </Glass>
      </View>
    </View>
  );
}

// ---------- readiness ----------
const ROWS: { key: 'certificate' | 'terms' | 'consent' | 'quiz'; title: string; icon: LucideIcon }[] = [
  { key: 'certificate', title: 'Валидно удостоверение', icon: ShieldCheck },
  { key: 'terms', title: 'Условия за доброволци', icon: FileText },
  { key: 'consent', title: 'Съгласие за местоположение', icon: MapPin },
  { key: 'quiz', title: 'Проверка на знанията', icon: CircleCheck },
];

/** The mentor's questions 1–3 and 5 as one checklist: nothing reaches the volunteer until every row is done. */
function Readiness({ r, reload }: { r: any; reload: () => void }) {
  const [open, setOpen] = useState<'terms' | 'quiz' | null>(null);
  const [quiet, setQuiet] = useState({ from: r.quiet?.from ?? 23, to: r.quiet?.to ?? 7 });
  const miss = new Set<string>(r.readiness.missing);
  const detail: Record<string, string> = {
    certificate: `${r.certificate?.issuer ?? '—'} · до ${r.verifiedUntil ?? '—'}`,
    terms: `версия ${r.readiness.termsVersion}`,
    consent: r.locationConsentAt ? 'само за известия, оттегляш го по всяко време' : 'отделно, изрично съгласие',
    quiz: r.readiness.quizValidUntil ? `валидна до ${new Date(r.readiness.quizValidUntil).toLocaleDateString('bg-BG')}` : '5 въпроса, на всеки 6 месеца',
  };
  const action: Record<string, ReactNode> = {
    terms: <Chip label="Прочети" onPress={() => setOpen('terms')} />,
    consent: <Chip label="Дай" onPress={() => setOpen('terms')} />,
    quiz: <Chip label="Започни" onPress={() => setOpen('quiz')} />,
  };
  const hour = (h: number, d: number) => (h + d + 24) % 24;
  const done = 4 - miss.size;
  return (
    <Card>
      <Row style={{ flexWrap: 'nowrap' }} gap={14}>
        <Ring value={done / 4} size={56} color={miss.size ? colors.amber : colors.green}>
          <Text style={[type.number, { fontSize: 16, color: colors.ink }]}>{done}/4</Text>
        </Ring>
        <View style={{ flex: 1 }}>
          <T v="heading">Готовност</T>
          <T v="caption">{miss.size ? 'Нужно е всичко, преди да получаваш известия.' : 'Всичко е наред.'}</T>
        </View>
      </Row>
      {ROWS.map(({ key, title, icon: Icon }) => (
        <View key={key}>
          <Divider />
          <Row style={{ flexWrap: 'nowrap', paddingTop: 12 }} gap={12}>
            <View style={[styles.rowIcon, !miss.has(key) && { backgroundColor: colors.greenSoft }]}>
              <Icon size={20} color={miss.has(key) ? colors.ink : colors.greenDark} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{title}</T>
              <T v="caption">{detail[key]}</T>
            </View>
            {miss.has(key) ? action[key] ?? <T v="label" color={colors.amber}>липсва</T> : <CircleCheck size={24} color={colors.green} strokeWidth={2.4} />}
          </Row>
        </View>
      ))}
      {open === 'terms' && <Terms done={() => (setOpen(null), reload())} />}
      {open === 'quiz' && <Quiz done={() => (setOpen(null), reload())} />}

      <Divider />
      <Row style={{ flexWrap: 'nowrap', paddingTop: 4 }} gap={12}>
        <View style={styles.rowIcon}>
          <Moon size={20} color={colors.ink} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Тихи часове</T>
          <T v="caption">{r.quiet ? `без известия ${r.quiet.from}:00 – ${r.quiet.to}:00` : 'по желание'}</T>
        </View>
      </Row>
      <View style={styles.quiet}>
        <Stepper label="от" value={quiet.from} onChange={(v) => setQuiet({ ...quiet, from: hour(v, 0) })} />
        <Stepper label="до" value={quiet.to} onChange={(v) => setQuiet({ ...quiet, to: hour(v, 0) })} />
      </View>
      <Row>
        <Chip label="Запази" onPress={() => api('/api/rpc/set_quiet_hours', quiet).then(reload)} />
        {r.quiet && <Chip label="Махни" onPress={() => api('/api/rpc/set_quiet_hours', { from: null }).then(reload)} />}
        {r.locationConsentAt && !miss.has('consent') && (
          <Chip
            label="Оттегли съгласието"
            onPress={() =>
              Alert.alert('Оттегляне на съгласието', 'Известията спират и позицията ти се изтрива.', [
                { text: 'Отказ', style: 'cancel' },
                { text: 'Оттегли', style: 'destructive', onPress: () => api('/api/rpc/withdraw_consent', {}).then(reload) },
              ])
            }
          />
        )}
      </Row>
    </Card>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} по-рано`} onPress={() => onChange((value + 23) % 24)} style={styles.stepBtn} hitSlop={6}>
        <Text style={styles.stepSign}>−</Text>
      </Pressable>
      <View style={{ alignItems: 'center', flex: 1 }}>
        <T v="caption">{label}</T>
        <Text style={[type.number, { fontSize: 22, color: colors.ink }]} accessibilityLabel={`${label} ${value} часа`}>{String(value).padStart(2, '0')}:00</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} по-късно`} onPress={() => onChange((value + 1) % 24)} style={styles.stepBtn} hitSlop={6}>
        <Text style={styles.stepSign}>+</Text>
      </Pressable>
    </View>
  );
}

function Terms({ done }: { done: () => void }) {
  const { data } = usePoll(() => api<{ version: string; terms: string[] }>('/api/responder/terms'), 60_000);
  const [read, setRead] = useState(false);
  const [loc, setLoc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <T v="caption">Зареждане…</T>;
  return (
    <View style={styles.inset}>
      <T v="heading">Условия за доброволци</T>
      {data.terms.map((t, i) => (
        <Row key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={10}>
          <Text style={styles.termNum}>{i + 1}</Text>
          <T style={{ flex: 1 }}>{t}</T>
        </Row>
      ))}
      <Toggle value={read} onChange={setRead} label={`Прочетох и приемам условията (версия ${data.version})`} />
      <Toggle value={loc} onChange={setLoc} label="Съгласен съм позицията ми да се ползва за известия, докато съм „достъпен“" />
      <ErrorText>{err}</ErrorText>
      <Button size="lg" title="Приемам" disabled={!read || !loc} onPress={() => api('/api/rpc/accept_terms', { version: data.version, locationConsent: true }).then(done, (x: Error) => setErr(x.message))} />
    </View>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggle}>
      <T style={{ flex: 1 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.green, false: colors.lineStrong }} thumbColor="#fff" />
    </Pressable>
  );
}

function Quiz({ done }: { done: () => void }) {
  const { data } = usePoll(() => api<{ questions: { q: string; options: string[] }[] }>('/api/responder/quiz'), 60_000);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ passed: boolean; correct: number; total: number; wrong: number[] } | null>(null);
  if (!data) return <T v="caption">Зареждане…</T>;
  const answered = answers.filter((x) => x !== undefined).length;
  return (
    <View style={styles.inset}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="heading">Проверка на знанията</T>
        <T v="label" color={colors.ink2}>{answered}/{data.questions.length}</T>
      </Row>
      {data.questions.map((q, i) => (
        <View key={i} style={[styles.q, result?.wrong.includes(i) && { borderColor: colors.red, backgroundColor: colors.redSoft }]}>
          <T v="bodyStrong">{i + 1}. {q.q}</T>
          {q.options.map((o, j) => {
            const on = answers[i] === j;
            return (
              <Pressable
                key={j}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.opt, on && styles.optOn]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  const n = [...answers];
                  n[i] = j;
                  setAnswers(n);
                  setResult(null);
                }}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                <T style={{ flex: 1 }}>{o}</T>
              </Pressable>
            );
          })}
        </View>
      ))}
      {result && !result.passed && <Banner kind="danger">{result.correct} от {result.total}. Отбелязаните въпроси са грешни — опитай пак.</Banner>}
      <Button
        size="lg"
        title="Провери"
        disabled={answered < data.questions.length}
        onPress={async () => {
          const r = await api('/api/rpc/pass_quiz', { answers });
          setResult(r);
          Haptics.notificationAsync(r.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
          if (r.passed) done();
        }}
      />
      <T v="caption">Проверката не замества курса — само напомня основното.</T>
    </View>
  );
}

/** Mentor's question 3: see what we hold and delete it. */
function MyData() {
  const { logout } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const row = (Icon: LucideIcon, title: string, onPress: () => void, danger?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.dataRow, pressed && { opacity: 0.6 }]}>
      <Icon size={20} color={danger ? colors.redDark : colors.ink} strokeWidth={2.2} />
      <T v="bodyStrong" color={danger ? colors.redDark : colors.ink} style={{ flex: 1 }}>{title}</T>
    </Pressable>
  );
  return (
    <Card>
      <T v="heading">Моите данни</T>
      <T v="caption">Пазим имейл, година на раждане (само за 18+), удостоверение, приети условия и позиция, докато си „достъпен“. Маршрутът в случай се трие при затварянето му; мястото се закръгля до ~100 м след 30 дни.</T>
      <Divider />
      {row(Download, 'Изтегли моите данни', async () => Share.share({ message: JSON.stringify(await api('/api/me/data'), null, 2) }))}
      {row(LogOut, 'Изход', async () => { await logout(); router.replace('/'); })}
      {row(Trash, 'Изтрий профила', () =>
        Alert.alert('Изтриване', 'Изтриване на профила и всички данни за теб?', [
          { text: 'Отказ', style: 'cancel' },
          { text: 'Изтрий', style: 'destructive', onPress: () => api('/api/rpc/delete_me', {}).then(async () => { await logout(); router.replace('/'); }, (x: Error) => setErr(x.message)) },
        ]), true)}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.lg, padding: 20, borderRadius: radius.xl, backgroundColor: colors.ink },
  heroOn: { backgroundColor: '#06261A' },
  orb: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  takeover: { flex: 1, backgroundColor: colors.night, paddingHorizontal: space.lg, gap: space.lg, justifyContent: 'space-between' },
  offerCenter: { alignItems: 'center', gap: 14, paddingVertical: 12 },
  offerSec: { ...(type.number as object), fontSize: 64, lineHeight: 68, color: colors.nightText, letterSpacing: -2 },
  offerDist: { ...(type.display as object), fontSize: 36, color: colors.nightText, textAlign: 'center', marginTop: 18 },
  sheetWrap: { position: 'absolute', left: 10, right: 10, bottom: 0 },
  dist: { ...(type.number as object), fontSize: 34, lineHeight: 38, color: colors.ink, letterSpacing: -1 },
  unsafe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  quiet: { flexDirection: 'row', gap: space.sm },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderRadius: radius.md, padding: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  stepSign: { ...(type.heading as object), color: colors.ink },
  inset: { gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.paper },
  termNum: { ...(type.number as object), fontSize: 14, color: colors.ink2, width: 18, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  q: { gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  optOn: { borderColor: colors.ink, backgroundColor: colors.paper },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.ink3, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
});
