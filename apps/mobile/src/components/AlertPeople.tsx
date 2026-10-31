import { STARA_ZAGORA_CENTER, type LatLon, type SceneSafety } from '@defikarta/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, deviceId, fmtDur, usePoll } from '@/lib/api';
import { colors } from '@/theme';
import { Banner, Button, Chip, DrillTag, ErrorText, Row, Small } from './ui';

const KEY = 'defikarta:incident';

/**
 * Bystander alert (flag `public_alerts`), always secondary to 112: the CPR guide above never waits for it.
 * Question 4: it is only shown after „Обадих се“, and that is sent with the alert. Question 5: "unsafe" sends nobody.
 */
export function AlertPeople({ coords }: { coords: LatLon | null }) {
  const [id, setId] = useState<string | null>(null);
  const [scene, setScene] = useState<SceneSafety | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const status = usePoll(() => (id ? api<any>(`/api/public/incident/${id}`) : Promise.resolve(null)), 3000);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(setId, () => undefined);
  }, []);
  const remember = (v: string | null) => {
    setId(v);
    (v ? AsyncStorage.setItem(KEY, v) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
  };

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const pos = coords ?? STARA_ZAGORA_CENTER;
      const r = await api<{ id: string }>('/api/rpc/create_incident', { source: 'bystander', ...pos, deviceId: deviceId(), key: `${deviceId()}-${Date.now()}`, called112: true, scene });
      remember(r.id);
      status.reload();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const s = status.data;
  if (id && s) {
    const finished = s.state === 'CLOSED' || s.state === 'EMS_ON_SCENE';
    return (
      <View style={styles.box}>
        <DrillTag />
        <Text style={styles.h}>{s.state === 'DISPATCH_FAILED' ? 'Няма свободни доброволци наблизо. Продължавай масажа.' : s.state === 'EMS_ON_SCENE' ? 'Линейката е на място' : s.state === 'CLOSED' ? 'Сигналът е затворен' : 'Доброволци са известени'}</Text>
        <Row style={{ gap: 18 }}>
          <Stat n={s.notified} label="известени" />
          <Stat n={s.enRoute} label="тръгнали" />
          <Stat n={s.aedEtaS === null ? '—' : s.aedEtaS === 0 ? 'тук е' : `~${fmtDur(s.aedEtaS)}`} label="AED идва" />
        </Row>
        <Small>Не спирай масажа. Обаждането на 112 остава най-важното.</Small>
        {!finished && <Button kind="ghost" title="Линейката дойде" onPress={() => api('/api/rpc/report_event', { incidentId: id, type: 'ems_on_scene', deviceId: deviceId() }).then(status.reload)} />}
        {!finished && <Button kind="ghost" title="Отмени сигнала" onPress={() => api('/api/rpc/close_incident', { incidentId: id, cancel: true, deviceId: deviceId() }).then(status.reload)} />}
        {finished && <Button kind="next" title="Готово" onPress={() => remember(null)} />}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.q}>Безопасно ли е да се приближат хора?</Text>
      <Row>
        <Chip label="Да" on={scene === 'safe'} onPress={() => setScene('safe')} />
        <Chip label="Не знам" on={scene === 'unknown'} onPress={() => setScene('unknown')} />
        <Chip label="Не (ток, огън, движение…)" danger on={scene === 'unsafe'} onPress={() => setScene('unsafe')} />
      </Row>
      {scene === 'unsafe' && <Banner kind="danger">Не изпращаме доброволци на опасно място. Пази се и кажи на 112 какво виждаш.</Banner>}
      <Pressable style={[styles.btn, (busy || !scene || scene === 'unsafe') && { opacity: 0.4 }]} disabled={busy || !scene || scene === 'unsafe'} onPress={start} accessibilityRole="button">
        <Text style={styles.btnText}>📣 Извикай обучени хора наблизо</Text>
        <Text style={styles.btnSub}>{coords ? 'ще споделим мястото ти само за този случай' : 'без GPS: демо местоположение (центъра)'}</Text>
      </Pressable>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}

const Stat = ({ n, label }: { n: number | string; label: string }) => (
  <View>
    <Text style={styles.statN}>{n}</Text>
    <Small>{label}</Small>
  </View>
);

const styles = StyleSheet.create({
  box: { backgroundColor: colors.soft, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink },
  q: { fontSize: 15, fontWeight: '700', color: colors.ink },
  btn: { backgroundColor: colors.ink, borderRadius: 14, padding: 14, gap: 2 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  btnSub: { color: '#CFCFD6', fontSize: 13 },
  statN: { fontSize: 20, fontWeight: '800', color: colors.ink },
});
