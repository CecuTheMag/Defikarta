import { distanceM, formatDistance, nativeWalkingUrl, type LatLon } from '@defikarta/core';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, Vibration, View } from 'react-native';
import { LeafletMap, type Pin } from '@/components/LeafletMap';
import { Banner, Button, Card, Chip, DrillTag, ErrorText, H1, H3, P, Row, Small } from '@/components/ui';
import { useAedState } from '@/lib/AedContext';
import { api, usePoll } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Volunteer (responder) mode: the same flow as the website's „Доброволец“, built for the phone. */
export default function Volunteer() {
  const { ready, me, refresh } = useSession();
  if (!ready) return <Wrap><P>Зареждане…</P></Wrap>;
  if (!me)
    return (
      <Wrap>
        <H1>Доброволец</H1>
        <P>Влез, за да получаваш известия за сърдечен арест наблизо. Можеш да откажеш по всяко време.</P>
        <Button title="Вход" onPress={() => router.push('/login')} />
      </Wrap>
    );
  if (!me.responder) return <Register done={refresh} />;
  if (me.responder.status !== 'verified')
    return (
      <Wrap>
        <H1>Чакаме проверка</H1>
        <P>Удостоверението ти ({me.responder.certificate?.issuer}) е при верификатор. Щом бъде одобрено, ще можеш да получаваш известия.</P>
        <Small>В демото: на компютъра влез като verifier@drill.defikarta.bg → Конзола → Проверка.</Small>
        <Button kind="next" title="Обнови" onPress={refresh} />
      </Wrap>
    );
  return <Console />;
}

const Wrap = ({ children }: { children: ReactNode }) => <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">{children}</ScrollView>;

function Register({ done }: { done: () => void }) {
  const [f, setF] = useState({ birthYear: '2000', issuer: '', issuedOn: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Wrap>
      <H1>Стани доброволец</H1>
      <P>Нужно е валидно удостоверение за курс по първа помощ. Верификатор (БЧК / „Първите три минути“) го одобрява. Улични известия — само за пълнолетни; под 18 г. — само ученията в училището ти.</P>
      <Field label="Година на раждане" value={f.birthYear} onChange={(v) => setF({ ...f, birthYear: v })} numeric />
      <Field label="Издател на удостоверението" value={f.issuer} onChange={(v) => setF({ ...f, issuer: v })} placeholder="БЧК Стара Загора" />
      <Field label="Дата на издаване (ГГГГ-ММ-ДД)" value={f.issuedOn} onChange={(v) => setF({ ...f, issuedOn: v })} placeholder="2026-09-01" />
      <ErrorText>{err}</ErrorText>
      <Button
        title="Изпрати за проверка"
        disabled={!f.issuer || !/^\d{4}-\d{2}-\d{2}$/.test(f.issuedOn)}
        onPress={() => api('/api/rpc/register_responder', { ...f, birthYear: Number(f.birthYear) }).then(done, (x: Error) => setErr(x.message))}
      />
    </Wrap>
  );
}

function Field({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={numeric ? 'number-pad' : 'default'} autoCorrect={false} />
    </View>
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

  // Moving: either the phone's real GPS, or (demo, when you are not in Stara Zagora) a walk toward the target.
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

  if (!data) return <Wrap><P>{error ?? 'Зареждане…'}</P></Wrap>;
  const r = data.responder;

  if (active) {
    const steps: Record<string, string> = { on_scene: 'На място съм', aed_collected: 'Взех AED-то', aed_on_scene: 'AED-то е на място' };
    const next = a.role === 'cpr' ? (a.status === 'en_route' ? 'on_scene' : null) : a.status === 'en_route' ? 'aed_collected' : a.status === 'aed_collected' ? 'aed_on_scene' : null;
    const pins: Pin[] = [{ id: 'patient', ...active.incident.pos, color: colors.red, text: '✚', size: 34 }];
    if (active.aed) pins.push({ id: 'aed', lat: active.aed.lat, lon: active.aed.lon, color: colors.green, text: '⚡', label: active.aed.name });
    if (pos) pins.push({ id: 'me', ...pos, color: '#1A73E8', text: '🏃', size: 30 });
    return (
      <Wrap>
        <DrillTag />
        <H1>{a.role === 'cpr' ? 'Към пациента — масаж' : a.status === 'en_route' ? 'Вземи AED-то' : 'Занеси AED-то'}</H1>
        {active.incident.scene === 'unsafe' && <Banner kind="danger">⚠ Мястото е отбелязано като опасно. Не се приближавай — изчакай 112.</Banner>}
        {active.incident.scene === 'unknown' && <Banner kind="caution">Безопасността не е потвърдена. Огледай се, преди да се приближиш.</Banner>}
        {a.role === 'aed_runner' && active.aed && <P>AED: <Text style={{ fontWeight: '700' }}>{active.aed.name}</Text>{active.aed.locationHint ? ` · ${active.aed.locationHint}` : ''}</P>}
        <P>{pos && target ? `До целта: ${formatDistance(distanceM(pos, target))}. ` : ''}{active.incident.called112 ? '112 е уведомен.' : 'Обади се на 112, ако още никой не е.'}</P>
        <View style={styles.map}>
          <LeafletMap center={target ?? active.incident.pos} zoom={16} pins={pins} lines={pos && target ? [{ points: [pos, target], color: '#1A73E8', dashed: true }] : []} />
        </View>
        {target && <Button kind="next" title="Маршрут пеша в Google Maps →" onPress={() => Linking.openURL(nativeWalkingUrl('android', target))} />}
        {next && <Button title={steps[next]!} onPress={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: next }))} style={{ paddingVertical: 18 }} />}
        <Row>
          <Switch value={sim} onValueChange={setSim} />
          <Small style={{ flex: 1 }}>Симулирай придвижване (демо, ако не си в Стара Загора). Иначе споделяме GPS позицията ти, докато случаят е активен.</Small>
        </Row>
        <Button kind="ghost" title="Линейката дойде" onPress={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: 'ems_on_scene' }))} />
        <Button
          kind="ghost"
          title="⚠ Опасно е — оттеглям се"
          onPress={() =>
            Alert.alert('Опасно ли е мястото?', 'Ще се оттеглиш и известяването на други ще спре. Това не се брои като отказ.', [
              { text: 'Не', style: 'cancel' },
              { text: 'Оттеглям се', style: 'destructive', onPress: () => act(() => api('/api/rpc/withdraw_unsafe', { assignmentId: a.id })) },
            ])
          }
        />
        <Small>Ролята ти: {a.role === 'cpr' ? 'масаж' : 'AED'} · {a.status}</Small>
        <ErrorText>{err}</ErrorText>
      </Wrap>
    );
  }

  const myPins: Pin[] = pos ? [{ id: 'me', ...pos, color: '#1A73E8', text: '🏃', size: 28 }] : [];
  return (
    <Wrap>
      <H1>Здравей, доброволец</H1>
      {data.offers.map((o: any) => {
        const left = Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 1000));
        return (
          <View key={o.id} style={styles.offer}>
            <DrillTag />
            <Text style={styles.offerTitle}>Сърдечен арест на {o.band}</Text>
            <P>Можеш ли да помогнеш? Остават {left} с.</P>
            {o.called112 && <Banner kind="ok">✓ 112 е уведомен</Banner>}
            {o.caution && <Banner kind="caution">Безопасността на мястото не е потвърдена. Огледай се, преди да се приближиш.</Banner>}
            {o.role === 'aed_runner' && <P>📍 Предлагаме ти да вземеш: <Text style={{ fontWeight: '700' }}>{o.suggestedAed?.name}</Text></P>}
            {o.role === 'aed_runner' ? (
              <>
                <Button title="Нося AED" onPress={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept' }))} />
                <Button kind="next" title="Тръгвам (само масаж)" onPress={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept', role: 'cpr' }))} />
              </>
            ) : (
              <Button title="Тръгвам" onPress={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept' }))} />
            )}
            <Button kind="ghost" title="Не мога" onPress={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'decline' }))} />
            <Small>Отказът е без последствия.</Small>
          </View>
        );
      })}
      {data.debrief && (
        <Card>
          <H3>{data.debrief.unsafe ? 'Добре, че се пази.' : 'Благодарим ти.'}</H3>
          <Small>Ако случаят те е разтърсил, говори с някого. Свържи се с координатора на доброволците (контакт за подкрепа — уточнява се с БЧК).</Small>
        </Card>
      )}
      <Readiness r={r} reload={reload} />
      <Card>
        <H3>Наличност</H3>
        <Small>Известия получаваш само когато си „достъпен“. Без следене на живо — точната позиция се споделя само в приет случай и се трие при затваряне.</Small>
        <View style={styles.mapSmall}>
          <LeafletMap center={pos ?? gps ?? { lat: 42.4258, lon: 25.6345 }} pins={myPins} onPress={setPos} />
        </View>
        <Small>Докосни картата, за да зададеш позиция, или ползвай GPS.</Small>
        <Button kind="ghost" title="📍 Моята позиция (GPS)" disabled={!gps} onPress={() => gps && setPos(gps)} />
        {r.availability === 'around' ? (
          <>
            <Button kind="next" title="Изключи известията" onPress={() => act(() => api('/api/rpc/set_availability', { mode: 'off' }))} />
            {pos && <Button kind="ghost" title="Обнови позицията" onPress={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))} />}
          </>
        ) : (
          <Button title="Достъпен съм около мен" disabled={!pos || r.readiness.missing.length > 0} onPress={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))} />
        )}
        {r.readiness.missing.length > 0 && <Small>Довърши „Готовност“ отгоре, за да включиш известията.</Small>}
        <Small>Сега: {r.availability === 'around' ? 'включени' : 'изключени'} · приети {r.acceptCount} от {r.offerCount} оферти. Известията идват, докато приложението е отворено.</Small>
        <ErrorText>{err}</ErrorText>
      </Card>
      <MyData />
    </Wrap>
  );
}

const MISSING_BG = { certificate: 'Валидно удостоверение', terms: 'Условия за доброволци', consent: 'Съгласие за местоположение', quiz: 'Проверка на знанията' } as const;

/** The mentor's questions 1–3 and 5 as one checklist: nothing reaches the volunteer until every row is green. */
function Readiness({ r, reload }: { r: any; reload: () => void }) {
  const [open, setOpen] = useState<'terms' | 'quiz' | null>(null);
  const [quiet, setQuiet] = useState({ from: r.quiet?.from ?? 23, to: r.quiet?.to ?? 7 });
  const miss = new Set<string>(r.readiness.missing);
  const row = (k: keyof typeof MISSING_BG, detail: string, action?: ReactNode) => (
    <View style={styles.readyRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.readyTitle}>{MISSING_BG[k]}</Text>
        <Small>{detail}</Small>
      </View>
      {miss.has(k) ? action ?? <Text style={styles.todo}>липсва</Text> : <Text style={styles.ok}>✓</Text>}
    </View>
  );
  const hour = (h: number, d: number) => (h + d + 24) % 24;
  return (
    <Card>
      <H3>Готовност</H3>
      {row('certificate', `${r.certificate?.issuer ?? '—'} · валидно до ${r.verifiedUntil ?? '—'}`)}
      {row('terms', `версия ${r.readiness.termsVersion}`, <Chip label="Прочети" onPress={() => setOpen('terms')} />)}
      {row('consent', r.locationConsentAt ? 'позицията се ползва само за известия' : 'отделно съгласие', <Chip label="Дай" onPress={() => setOpen('terms')} />)}
      {row('quiz', r.readiness.quizValidUntil ? `валидна до ${new Date(r.readiness.quizValidUntil).toLocaleDateString('bg-BG')}` : '5 въпроса, на всеки 6 месеца', <Chip label="Започни" onPress={() => setOpen('quiz')} />)}
      <View style={styles.readyRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.readyTitle}>Тихи часове</Text>
          <Small>{r.quiet ? `без известия ${r.quiet.from}:00–${r.quiet.to}:00` : 'няма'}</Small>
        </View>
      </View>
      <Row>
        <Chip label="−" onPress={() => setQuiet({ ...quiet, from: hour(quiet.from, -1) })} />
        <Text style={styles.hour}>от {quiet.from}:00</Text>
        <Chip label="+" onPress={() => setQuiet({ ...quiet, from: hour(quiet.from, 1) })} />
        <Chip label="−" onPress={() => setQuiet({ ...quiet, to: hour(quiet.to, -1) })} />
        <Text style={styles.hour}>до {quiet.to}:00</Text>
        <Chip label="+" onPress={() => setQuiet({ ...quiet, to: hour(quiet.to, 1) })} />
      </Row>
      <Row>
        <Chip label="Запази тихите часове" onPress={() => api('/api/rpc/set_quiet_hours', quiet).then(reload)} />
        {r.quiet && <Chip label="Махни" onPress={() => api('/api/rpc/set_quiet_hours', { from: null }).then(reload)} />}
      </Row>
      {r.locationConsentAt && !miss.has('consent') && (
        <Button
          kind="ghost"
          title="Оттегли съгласието за местоположение"
          onPress={() =>
            Alert.alert('Оттегляне', 'Известията спират и позицията ти се изтрива.', [
              { text: 'Отказ', style: 'cancel' },
              { text: 'Оттегли', style: 'destructive', onPress: () => api('/api/rpc/withdraw_consent', {}).then(reload) },
            ])
          }
        />
      )}
      {open === 'terms' && <Terms done={() => (setOpen(null), reload())} />}
      {open === 'quiz' && <Quiz done={() => (setOpen(null), reload())} />}
    </Card>
  );
}

function Terms({ done }: { done: () => void }) {
  const { data } = usePoll(() => api<{ version: string; terms: string[] }>('/api/responder/terms'), 60_000);
  const [read, setRead] = useState(false);
  const [loc, setLoc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Small>Зареждане…</Small>;
  return (
    <View style={{ gap: 10 }}>
      {data.terms.map((t, i) => (
        <Text key={i} style={styles.term}>{i + 1}. {t}</Text>
      ))}
      <Row>
        <Switch value={read} onValueChange={setRead} />
        <Small style={{ flex: 1 }}>Прочетох и приемам условията (версия {data.version})</Small>
      </Row>
      <Row>
        <Switch value={loc} onValueChange={setLoc} />
        <Small style={{ flex: 1 }}>Съгласен съм позицията ми да се ползва за известия, докато съм „достъпен“</Small>
      </Row>
      <ErrorText>{err}</ErrorText>
      <Button title="Приемам" disabled={!read || !loc} onPress={() => api('/api/rpc/accept_terms', { version: data.version, locationConsent: true }).then(done, (x: Error) => setErr(x.message))} />
    </View>
  );
}

function Quiz({ done }: { done: () => void }) {
  const { data } = usePoll(() => api<{ questions: { q: string; options: string[] }[] }>('/api/responder/quiz'), 60_000);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ passed: boolean; correct: number; total: number; wrong: number[] } | null>(null);
  if (!data) return <Small>Зареждане…</Small>;
  return (
    <View style={{ gap: 12 }}>
      {data.questions.map((q, i) => (
        <View key={i} style={[styles.q, result?.wrong.includes(i) && { borderColor: colors.red }]}>
          <Text style={styles.readyTitle}>{i + 1}. {q.q}</Text>
          {q.options.map((o, j) => (
            <Pressable
              key={j}
              style={styles.opt}
              onPress={() => {
                const next = [...answers];
                next[i] = j;
                setAnswers(next);
                setResult(null);
              }}
            >
              <View style={[styles.radio, answers[i] === j && styles.radioOn]} />
              <Text style={styles.optText}>{o}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {result && !result.passed && <ErrorText>{result.correct} от {result.total}. Отбелязаните въпроси са грешни — опитай пак.</ErrorText>}
      <Button
        title="Провери"
        disabled={answers.filter((x) => x !== undefined).length < data.questions.length}
        onPress={async () => {
          const r = await api('/api/rpc/pass_quiz', { answers });
          setResult(r);
          if (r.passed) done();
        }}
      />
      <Small>Проверката не замества курса — тя само напомня основното.</Small>
    </View>
  );
}

/** Mentor's question 3: see what we hold and delete it. */
function MyData() {
  const { logout } = useSession();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <H3>Моите данни</H3>
      <Small>Пазим: имейл, година на раждане (само за 18+), удостоверение, приети условия, позиция докато си „достъпен“. Маршрутът в случай се трие при затварянето му; мястото на случая се закръгля до ~100 м след 30 дни.</Small>
      <Button kind="ghost" title="Изтегли / сподели моите данни" onPress={async () => Share.share({ message: JSON.stringify(await api('/api/me/data'), null, 2) })} />
      <Button
        kind="ghost"
        title="Изтрий профила"
        onPress={() =>
          Alert.alert('Изтриване', 'Изтриване на профила и всички данни за теб?', [
            { text: 'Отказ', style: 'cancel' },
            { text: 'Изтрий', style: 'destructive', onPress: () => api('/api/rpc/delete_me', {}).then(async () => { await logout(); router.replace('/'); }, (x: Error) => setErr(x.message)) },
          ])
        }
      />
      <Button kind="ghost" title="Изход" onPress={async () => { await logout(); router.replace('/'); }} />
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, fontSize: 16, color: colors.ink },
  map: { height: 300, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  mapSmall: { height: 220, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  offer: { backgroundColor: '#FFF4F5', borderWidth: 2, borderColor: colors.red, borderRadius: 16, padding: 16, gap: 10 },
  offerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  readyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  ok: { color: colors.green, fontWeight: '800', fontSize: 18 },
  todo: { color: colors.amber, fontWeight: '700' },
  hour: { fontSize: 14, color: colors.ink, minWidth: 56, textAlign: 'center' },
  term: { fontSize: 14, lineHeight: 20, color: colors.ink },
  q: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10, gap: 6 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted },
  radioOn: { borderColor: colors.red, backgroundColor: colors.red },
  optText: { flex: 1, fontSize: 15, color: colors.ink },
});
