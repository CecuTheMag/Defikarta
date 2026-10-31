import { CHECK_LABEL, KIND_LABEL, type CheckKey, type EquipmentKind } from '@defikarta/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, DrillTag, ErrorText, H1, H3, P, Row, Small } from '@/components/ui';
import { api, apiText, usePoll } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

const STATUS_BG = { ok: 'наред', soon: 'скоро', overdue: 'просрочено', missing: 'няма запис' } as const;
const STATUS_COLOR = { ok: colors.green, soon: colors.amber, missing: colors.amber, overdue: colors.redDark } as const;
const KIND_ICON: Record<EquipmentKind, string> = { aed: '⚡', extinguisher: '🧯', first_aid_kit: '✚' };
const ACTIONS: Record<EquipmentKind, [CheckKey, string][]> = {
  aed: [['inspection', 'Оглед'], ['battery', 'Нова батерия'], ['pads', 'Нови електроди'], ['service', 'Сервиз']],
  extinguisher: [['inspection', 'Оглед'], ['service', 'Обслужване'], ['hydro', 'Изпитване под налягане']],
  first_aid_kit: [['inspection', 'Проверка'], ['contents', 'Подновено съдържание']],
};
const EXPIRY: CheckKey[] = ['battery', 'pads', 'contents'];
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('bg-BG') : '—');
const left = (d: number | null) => (d === null ? 'няма запис' : d < 0 ? `просрочено ${-d} дни` : d === 0 ? 'днес' : `след ${d} дни`);
const today = () => new Date().toISOString().slice(0, 10);

/** Organisation registry (role aed_owner), the paid side of the hybrid model: what is due, log the work, reminders. */
export default function Org() {
  const { me } = useSession();
  const roles = me?.user.roles ?? [];
  if (!me || !(roles.includes('aed_owner') || roles.includes('admin')))
    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <H1>Организация</H1>
        <P>Регистър на дефибрилатори, пожарогасители и аптечки за фирми, училища и общини: срокове, напомняния и отчет.</P>
        <Button title="Вход като отговорник" onPress={() => router.push('/login')} />
      </ScrollView>
    );
  return <Body />;
}

function Body() {
  const { data, error, reload } = usePoll(() => api<any>('/api/org'), 6000);
  const { logout } = useSession();
  const [kind, setKind] = useState<EquipmentKind | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!data) return <ScrollView contentContainerStyle={styles.wrap}><P>{error ?? 'Зареждане…'}</P></ScrollView>;
  const siteName = (id: string) => data.sites.find((s: any) => s.id === id)?.name ?? '';
  const order: Record<string, number> = { overdue: 0, missing: 1, soon: 2, ok: 3 };
  const items: any[] = data.equipment.filter((e: any) => kind === 'all' || e.kind === kind).sort((a: any, b: any) => order[a.status]! - order[b.status]!);
  const s = data.summary;

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <DrillTag />
      <H1>{data.org.name}</H1>
      <View style={styles.tiles}>
        <Tile n={s.total} label="общо" />
        <Tile n={s.overdue} label="просрочени" color={colors.redDark} />
        <Tile n={s.missing} label="без запис" color={colors.amber} />
        <Tile n={s.soon} label="до 30 дни" color={colors.amber} />
        <Tile n={s.ok} label="наред" color={colors.green} />
      </View>
      <Row>
        {(['all', 'aed', 'extinguisher', 'first_aid_kit'] as const).map((k) => (
          <Chip key={k} label={k === 'all' ? 'Всичко' : `${KIND_ICON[k]} ${KIND_LABEL[k]}`} on={kind === k} onPress={() => setKind(k)} />
        ))}
      </Row>

      {items.map((e) => (
        <Card key={e.id} style={{ borderLeftWidth: 5, borderLeftColor: STATUS_COLOR[e.status as keyof typeof STATUS_COLOR] }}>
          <View style={styles.cardRow}>
            <H3>{KIND_ICON[e.kind as EquipmentKind]} {e.model}</H3>
            <Text style={[styles.badge, { color: STATUS_COLOR[e.status as keyof typeof STATUS_COLOR] }]}>{STATUS_BG[e.status as keyof typeof STATUS_BG]}</Text>
          </View>
          <Small>{siteName(e.siteId)} · {e.locationHint}{e.serial ? ` · № ${e.serial}` : ''}{e.listedAedId ? ' · 📍 на публичната карта' : ''}</Small>
          {e.checks.map((c: any) => (
            <View key={c.key} style={styles.check}>
              <Text style={[styles.checkText, { color: c.status === 'ok' ? colors.ink : STATUS_COLOR[c.status as keyof typeof STATUS_COLOR] }]}>{c.label}</Text>
              <Text style={[styles.checkText, { color: c.status === 'ok' ? colors.ink : STATUS_COLOR[c.status as keyof typeof STATUS_COLOR] }]}>{fmt(c.due)} · {left(c.daysLeft)}</Text>
            </View>
          ))}
          {e.kind === 'aed' && e.listedAedId && e.gaps.length > 0 && <Small style={{ color: colors.amber }}>По проекта на наредбата на МЗ липсва: {e.gaps.map((g: string) => data.checklistLabels[g]).join('; ')}.</Small>}
          {open === e.id ? <LogForm eq={e} done={() => (setOpen(null), reload())} /> : <Button kind="ghost" title="Отбележи дейност" onPress={() => setOpen(e.id)} />}
        </Card>
      ))}

      <Card>
        <H3>Напомняния</H3>
        <Small>При 30, 7 и 0 дни преди срока и всяка седмица след това. В учебната среда имейлите не излизат — показваме ги тук.</Small>
        <Button kind="ghost" title="Провери сега" onPress={async () => { const r = await api('/api/rpc/run_reminders', {}); setMsg(r.sent ? `Изпратени: ${r.sent}` : 'Няма нови напомняния.'); reload(); }} />
        {msg && <Small>{msg}</Small>}
        {data.outbox.slice(0, 8).map((m: any) => (
          <View key={m.id} style={styles.mail}>
            <Text style={styles.mailSubject}>{m.subject}</Text>
            <Small>{m.body}</Small>
          </View>
        ))}
      </Card>

      <Card>
        <H3>Отчет</H3>
        <Small>CSV по обект, вид, срок и статус — за ръководството, одитора или пожарната.</Small>
        <Button
          title="Сподели отчета (CSV)"
          onPress={async () => Share.share({ title: 'defikarta-otchet.csv', message: (await apiText('/api/org/report.csv')).replace(/^\uFEFF/, '') })}
        />
        {data.log.slice(0, 6).map((l: any) => (
          <Small key={l.id}>{fmt(l.date)} · {l.by} · {CHECK_LABEL[l.action as CheckKey]} · {data.equipment.find((x: any) => x.id === l.equipmentId)?.model}{l.note ? ` — ${l.note}` : ''}</Small>
        ))}
      </Card>
      <Button kind="ghost" title="Изход" onPress={async () => { await logout(); router.replace('/'); }} />
    </ScrollView>
  );
}

const Tile = ({ n, label, color = colors.ink }: { n: number; label: string; color?: string }) => (
  <View style={styles.tile}>
    <Text style={[styles.tileN, { color }]}>{n}</Text>
    <Text style={styles.tileL}>{label}</Text>
  </View>
);

function LogForm({ eq, done }: { eq: any; done: () => void }) {
  const actions = ACTIONS[eq.kind as EquipmentKind];
  const [action, setAction] = useState<CheckKey>(actions[0]![0]);
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const needsExpiry = EXPIRY.includes(action);
  return (
    <View style={{ gap: 8 }}>
      <Row>{actions.map(([k, l]) => <Chip key={k} label={l} on={action === k} onPress={() => setAction(k)} />)}</Row>
      <Text style={styles.label}>Дата (ГГГГ-ММ-ДД)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} autoCorrect={false} />
      {needsExpiry && (
        <>
          <Text style={styles.label}>Нов срок на годност от етикета (ГГГГ-ММ-ДД)</Text>
          <TextInput style={styles.input} value={expiry} onChangeText={setExpiry} placeholder="2030-06-01" autoCorrect={false} />
        </>
      )}
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Бележка (фирма, протокол №)" />
      <ErrorText>{err}</ErrorText>
      <Row>
        <Button title="Запиши" onPress={() => api('/api/rpc/log_maintenance', { equipmentId: eq.id, action, date, newExpiry: needsExpiry ? expiry : undefined, note }).then(done, (x: Error) => setErr(x.message))} />
        <Button kind="ghost" title="Откажи" onPress={done} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, minWidth: 90, backgroundColor: colors.soft, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10 },
  tileN: { fontSize: 24, fontWeight: '800' },
  tileL: { fontSize: 13, color: colors.muted },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { fontWeight: '800', fontSize: 13 },
  check: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 5 },
  checkText: { fontSize: 14 },
  mail: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 },
  mailSubject: { fontSize: 14, fontWeight: '700', color: colors.ink },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, fontSize: 16, color: colors.ink },
});
