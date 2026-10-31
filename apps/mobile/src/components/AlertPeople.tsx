import { STARA_ZAGORA_CENTER, type LatLon, type SceneSafety } from '@defikarta/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Radio } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, deviceId, fmtDur, usePoll } from '@/lib/api';
import { colors, radius, type } from '@/theme';
import { Banner, Button, Chip, DrillTag, ErrorText, Row, Stat, T } from './ui';

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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
        <T v="heading" tone="night">{s.state === 'DISPATCH_FAILED' ? 'Няма свободни доброволци наблизо. Продължавай масажа.' : s.state === 'EMS_ON_SCENE' ? 'Линейката е на място' : s.state === 'CLOSED' ? 'Сигналът е затворен' : 'Доброволци са известени'}</T>
        <Row gap={24}>
          <Stat tone="night" value={s.notified} label="известени" />
          <Stat tone="night" value={s.enRoute} label="тръгнали" />
          <Stat tone="night" value={s.aedEtaS === null ? '—' : s.aedEtaS === 0 ? 'тук' : fmtDur(s.aedEtaS)} label="до AED" color={s.aedEtaS === 0 ? '#6CE9A6' : undefined} />
        </Row>
        <T v="caption" tone="night">Не спирай масажа. Обаждането на 112 остава най-важното.</T>
        {!finished && <Button kind="nightGhost" title="Линейката дойде" onPress={() => api('/api/rpc/report_event', { incidentId: id, type: 'ems_on_scene', deviceId: deviceId() }).then(status.reload)} />}
        {!finished && <Button kind="nightGhost" title="Отмени сигнала" onPress={() => api('/api/rpc/close_incident', { incidentId: id, cancel: true, deviceId: deviceId() }).then(status.reload)} />}
        {finished && <Button kind="nightGhost" title="Готово" onPress={() => remember(null)} />}
      </View>
    );
  }

  const blocked = busy || !scene || scene === 'unsafe';
  return (
    <View style={styles.box}>
      <T v="overline" tone="night">Обучени хора наблизо</T>
      <T v="bodyStrong" tone="night">Безопасно ли е да се приближат?</T>
      <Row>
        <Chip tone="night" label="Да" on={scene === 'safe'} onPress={() => setScene('safe')} />
        <Chip tone="night" label="Не знам" on={scene === 'unknown'} onPress={() => setScene('unknown')} />
        <Chip tone="night" label="Не — ток, огън, коли" danger on={scene === 'unsafe'} onPress={() => setScene('unsafe')} />
      </Row>
      {scene === 'unsafe' && <Banner tone="night" kind="danger">Не изпращаме доброволци на опасно място. Пази се и кажи на 112 какво виждаш.</Banner>}
      <Pressable style={[styles.btn, blocked && { opacity: 0.4 }]} disabled={blocked} onPress={start} accessibilityRole="button" accessibilityState={{ disabled: blocked }}>
        <View style={styles.btnIcon}>
          <Radio size={22} color={colors.ink} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.btnText} maxFontSizeMultiplier={1.3}>Извикай обучени хора</Text>
          <Text style={styles.btnSub} maxFontSizeMultiplier={1.3}>{coords ? 'мястото ти се споделя само за този случай' : 'без GPS: демо местоположение (центъра)'}</Text>
        </View>
      </Pressable>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.nightGlass, borderWidth: 1, borderColor: colors.nightEdge },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, borderRadius: radius.md, backgroundColor: '#fff', paddingHorizontal: 14 },
  btnIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  btnText: { ...(type.bodyStrong as object), fontSize: 18, color: colors.ink },
  btnSub: { ...(type.caption as object), color: colors.ink2 },
});
