import { CHECK_LABEL, KIND_LABEL, type CheckKey, type EquipmentKind } from '@defikarta/core';
import { router } from 'expo-router';
import { Bell, BriefcaseMedical, FileSpreadsheet, FireExtinguisher, LogOut, MapPin, Wrench, Zap, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, Chip, Divider, DrillTag, ErrorText, Field, Pill, Row, Screen, Stat, statusColor, T, type Status } from '@/components/ui';
import { api, apiText, usePoll } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, radius, space, type } from '@/theme';

const STATUS_BG: Record<string, string> = { ok: 'Наред', soon: 'Скоро', overdue: 'Просрочено', missing: 'Няма запис' };
const KIND_ICON: Record<EquipmentKind, LucideIcon> = { aed: Zap, extinguisher: FireExtinguisher, first_aid_kit: BriefcaseMedical };
const KIND_SHORT: Record<EquipmentKind, string> = { aed: 'Дефибрилатори', extinguisher: 'Пожарогасители', first_aid_kit: 'Аптечки' };
const ACTIONS: Record<EquipmentKind, [CheckKey, string][]> = {
  aed: [['inspection', 'Оглед'], ['battery', 'Нова батерия'], ['pads', 'Нови електроди'], ['service', 'Сервиз']],
  extinguisher: [['inspection', 'Оглед'], ['service', 'Обслужване'], ['hydro', 'Изпитване']],
  first_aid_kit: [['inspection', 'Проверка'], ['contents', 'Подновено съдържание']],
};
const EXPIRY: CheckKey[] = ['battery', 'pads', 'contents'];
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const left = (d: number | null) => (d === null ? 'няма запис' : d < 0 ? `${-d} дни просрочено` : d === 0 ? 'днес' : `след ${d} дни`);
const today = () => new Date().toISOString().slice(0, 10);

/** Organisation registry (role aed_owner), the paid side of the hybrid model. */
export default function Org() {
  const { me } = useSession();
  const roles = me?.user.roles ?? [];
  if (!me || !(roles.includes('aed_owner') || roles.includes('admin')))
    return (
      <Screen title="За организации">
        <T v="overline">ДефиКарта за организации</T>
        <T v="display">Всеки уред — готов, когато потрябва.</T>
        <T color={colors.ink2}>Дефибрилатори, пожарогасители и аптечки на всички обекти на едно място. Напомняния преди срока, дневник на поддръжката и отчет за одит. Чеклист по проекта на наредбата на МЗ.</T>
        <Button size="lg" title="Вход за отговорник" onPress={() => router.push('/login')} />
      </Screen>
    );
  return <Body />;
}

function Body() {
  const { data, error, reload } = usePoll(() => api<any>('/api/org'), 6000);
  const { logout } = useSession();
  const [kind, setKind] = useState<EquipmentKind | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!data) return <Screen title="Организация"><T>{error ?? 'Зареждане…'}</T></Screen>;
  const siteName = (id: string) => data.sites.find((s: any) => s.id === id)?.name ?? '';
  const order: Record<string, number> = { overdue: 0, missing: 1, soon: 2, ok: 3 };
  const items: any[] = data.equipment.filter((e: any) => kind === 'all' || e.kind === kind).sort((a: any, b: any) => order[a.status]! - order[b.status]!);
  const s = data.summary;
  const needs = s.overdue + s.missing;

  return (
    <Screen title="Организация" right={<DrillTag />}>
      <View style={{ gap: 6 }}>
        <T v="overline">{data.sites.length} обекта · {s.total} уреда</T>
        <T v="title">{data.org.name}</T>
      </View>

      <Card>
        <Row style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }} gap={10}>
          <Text style={[type.number, styles.big, { color: needs ? colors.redDark : colors.greenDark }]}>{needs}</Text>
          <T v="bodyStrong" style={{ flex: 1, paddingBottom: 8 }}>{needs === 1 ? 'уред изисква действие' : 'уреда изискват действие'}</T>
        </Row>
        <View style={styles.bar} accessibilityLabel={`${s.overdue} просрочени, ${s.missing} без запис, ${s.soon} скоро, ${s.ok} наред`}>
          {(['overdue', 'missing', 'soon', 'ok'] as const).map((k) => (s[k] ? <View key={k} style={{ flex: s[k], backgroundColor: k === 'ok' ? colors.green : k === 'overdue' ? colors.red : k === 'missing' ? '#F79009' : '#FEC84B' }} /> : null))}
        </View>
        <View style={styles.stats}>
          <Stat value={s.overdue} label="просрочени" color={colors.redDark} />
          <Stat value={s.missing} label="без запис" color={colors.amber} />
          <Stat value={s.soon} label="до 30 дни" color={colors.amber} />
          <Stat value={s.ok} label="наред" color={colors.greenDark} />
        </View>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
        <View style={{ width: space.lg - space.sm }} />
        {(['all', 'aed', 'extinguisher', 'first_aid_kit'] as const).map((k) => (
          <Chip key={k} icon={k === 'all' ? undefined : KIND_ICON[k]} label={k === 'all' ? 'Всичко' : KIND_SHORT[k]} on={kind === k} onPress={() => setKind(k)} />
        ))}
        <View style={{ width: space.lg - space.sm }} />
      </ScrollView>

      {items.map((e) => {
        const Icon = KIND_ICON[e.kind as EquipmentKind];
        const st = e.status as Status;
        return (
          <Card key={e.id} style={{ paddingLeft: space.lg + 4 }}>
            <View style={[styles.rail, { backgroundColor: statusColor(st) }]} />
            <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={12}>
              <View style={styles.kindIcon}>
                <Icon size={22} color={colors.ink} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong" numberOfLines={1}>{e.model}</T>
                <T v="caption" numberOfLines={2}>{siteName(e.siteId)} · {e.locationHint}{e.serial ? ` · № ${e.serial}` : ''}</T>
              </View>
              <Pill status={st} label={STATUS_BG[e.status]!} />
            </Row>
            <View>
              {e.checks.map((c: any) => (
                <View key={c.key} style={styles.check}>
                  <T v="label" style={{ flex: 1 }} color={c.status === 'ok' ? colors.ink : statusColor(c.status)}>{c.label}</T>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="label" color={c.status === 'ok' ? colors.ink : statusColor(c.status)}>{left(c.daysLeft)}</T>
                    <T v="caption">{fmt(c.due)}</T>
                  </View>
                </View>
              ))}
            </View>
            {e.listedAedId && (
              <Row gap={8} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <MapPin size={16} color={colors.ink2} strokeWidth={2.2} style={{ marginTop: 1 }} />
                <T v="caption" style={{ flex: 1 }}>На публичната карта{e.status === 'overdue' || e.status === 'missing' ? ' като „поддръжката е просрочена“' : ' като „поддръжката се следи“'}</T>
              </Row>
            )}
            {e.kind === 'aed' && e.listedAedId && e.gaps.length > 0 && <Banner kind="caution">По проекта на наредбата на МЗ липсва: {e.gaps.map((g: string) => data.checklistLabels[g]).join('; ')}.</Banner>}
            {open === e.id ? <LogForm eq={e} done={() => (setOpen(null), reload())} /> : <Button kind="glass" icon={Wrench} title="Отбележи дейност" onPress={() => setOpen(e.id)} />}
          </Card>
        );
      })}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">Напомняния</T>
          <Chip label="Провери сега" onPress={async () => { const r = await api('/api/rpc/run_reminders', {}); setMsg(r.sent ? `Изпратени: ${r.sent}` : 'Няма нови напомняния.'); reload(); }} />
        </Row>
        <T v="caption">30, 7 и 0 дни преди срока, после всяка седмица. В учебната среда имейлите се показват тук.{msg ? ` ${msg}` : ''}</T>
        {data.outbox.slice(0, 6).map((m: any) => (
          <View key={m.id}>
            <Divider />
            <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start', paddingTop: 12 }} gap={12}>
              <Bell size={18} color={colors.ink2} strokeWidth={2.2} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label">{m.subject}</T>
                <T v="caption">{m.body}</T>
              </View>
            </Row>
          </View>
        ))}
      </Card>

      <Card>
        <T v="heading">Отчет и дневник</T>
        <T v="caption">CSV по обект, вид, срок и статус — за ръководството, одитора или пожарната.</T>
        <Button kind="dark" icon={FileSpreadsheet} title="Сподели отчета (CSV)" onPress={async () => Share.share({ title: 'defikarta-otchet.csv', message: (await apiText('/api/org/report.csv')).replace(/^﻿/, '') })} />
        {data.log.slice(0, 6).map((l: any) => (
          <T key={l.id} v="caption">{fmt(l.date)} · {l.by} · {CHECK_LABEL[l.action as CheckKey]} · {data.equipment.find((x: any) => x.id === l.equipmentId)?.model}{l.note ? ` — ${l.note}` : ''}</T>
        ))}
      </Card>

      <Pressable onPress={async () => { await logout(); router.replace('/'); }} accessibilityRole="button" style={styles.logout}>
        <LogOut size={18} color={colors.ink2} strokeWidth={2.2} />
        <T v="label" color={colors.ink2}>Изход</T>
      </Pressable>
    </Screen>
  );
}

function LogForm({ eq, done }: { eq: any; done: () => void }) {
  const actions = ACTIONS[eq.kind as EquipmentKind];
  const [action, setAction] = useState<CheckKey>(actions[0]![0]);
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const needsExpiry = EXPIRY.includes(action);
  return (
    <View style={styles.inset}>
      <T v="label">{KIND_LABEL[eq.kind as EquipmentKind]} · какво направихте?</T>
      <Row>{actions.map(([k, l]) => <Chip key={k} label={l} on={action === k} onPress={() => setAction(k)} />)}</Row>
      <Field label="Дата" value={date} onChange={setDate} placeholder="ГГГГ-ММ-ДД" />
      {needsExpiry && <Field label="Нов срок на годност (от етикета)" value={expiry} onChange={setExpiry} placeholder="ГГГГ-ММ-ДД" />}
      <Field label="Бележка" value={note} onChange={setNote} placeholder="фирма, протокол №" />
      <ErrorText>{err}</ErrorText>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button style={{ flex: 1 }} title="Запиши" onPress={() => api('/api/rpc/log_maintenance', { equipmentId: eq.id, action, date, newExpiry: needsExpiry ? expiry : undefined, note }).then(done, (x: Error) => setErr(x.message))} />
        <Button style={{ flex: 1 }} kind="ghost" title="Откажи" onPress={done} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 56, lineHeight: 60, letterSpacing: -2 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, backgroundColor: colors.paper },
  rail: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  kindIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  inset: { gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.paper },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 },
});
