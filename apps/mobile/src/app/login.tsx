import { router } from 'expo-router';
import { Building, ChevronDown, ChevronRight, Hand, Hourglass, Server, UserRound, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, DrillTag, ErrorText, Field, Mark, Screen, T } from '@/components/ui';
import { getServer, setServer } from '@/lib/api';
import { homeFor, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

const ACCOUNTS: [string, string, string, LucideIcon][] = [
  ['ready', 'Доброволец, готов', 'Всичко е попълнено: включи „Достъпен съм“ и чакай случай', Hand],
  ['responder', 'Доброволец, нов', 'Минава условията, съгласието и проверката на знанията', Hand],
  ['pending', 'Доброволец, чака проверка', 'Удостоверението чака одобрение от верификатор', Hourglass],
  ['public', 'Потребител', 'Обикновен профил, още не е доброволец', UserRound],
  ['owner', 'Отговорник безопасност', 'Дефибрилатори, пожарогасители и аптечки на фирмата', Building],
];

export default function Login() {
  const { login, refresh } = useSession();
  const [email, setEmail] = useState('');
  const [server, setSrv] = useState(getServer());
  const [advanced, setAdvanced] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (e: string) => {
    setErr(null);
    setBusy(true);
    try {
      await setServer(server);
      const me = await login(e.trim().toLowerCase());
      router.replace(homeFor(me.user.roles));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen right={<DrillTag />}>
      <View style={{ gap: space.md, paddingTop: 8 }}>
        <Mark size={52} />
        <T v="display">Добре дошъл.</T>
        <T color={colors.ink2}>Учебна среда: тестовите профили са отворени, без парола. В реалната среда входът е с код по имейл.</T>
      </View>

      <View style={{ gap: space.sm }}>
        {ACCOUNTS.map(([id, name, what, Icon]) => (
          <Pressable key={id} disabled={busy} onPress={() => go(`${id}@drill.defikarta.bg`)} accessibilityRole="button" accessibilityLabel={`${name}. ${what}`} android_ripple={{ color: 'rgba(11,13,18,0.06)' }} style={({ pressed }) => [styles.account, pressed && { opacity: 0.7 }]}>
            <View style={styles.accIcon}>
              <Icon size={24} color={colors.ink} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong">{name}</T>
              <T v="caption">{what}</T>
            </View>
            <ChevronRight size={22} color={colors.ink3} strokeWidth={2.2} />
          </Pressable>
        ))}
      </View>

      <Card>
        <Field label="Имейл" value={email} onChange={setEmail} placeholder="ime@example.com" keyboard="email-address" hint="Нов потребител? Влизаш и после ставаш доброволец с удостоверение." />
        <Button size="lg" title="Продължи" disabled={busy || !email.includes('@')} onPress={() => go(email)} />
      </Card>

      <Pressable onPress={() => setAdvanced(!advanced)} accessibilityRole="button" accessibilityState={{ expanded: advanced }} style={styles.adv}>
        <Server size={18} color={colors.ink2} strokeWidth={2.2} />
        <T v="label" color={colors.ink2} style={{ flex: 1 }}>Сървър</T>
        <ChevronDown size={18} color={colors.ink2} strokeWidth={2.2} style={{ transform: [{ rotate: advanced ? '180deg' : '0deg' }] }} />
      </Pressable>
      {advanced && (
        <Card>
          <Field label="Адрес" value={server} onChange={setSrv} keyboard="url" hint="По USB: http://localhost:8791 (след „adb reverse tcp:8791 tcp:8791“). По Wi-Fi: адресът на компютъра." />
          <Button kind="glass" title="Провери връзката" onPress={async () => { await setServer(server); setErr(null); await refresh(); setOk('Адресът е запазен.'); }} />
          {ok && <Banner kind="ok">{ok}</Banner>}
        </Card>
      )}
      <ErrorText>{err}</ErrorText>
      <T v="caption" center>Диспечерската конзола и проверката на удостоверения са на компютъра.</T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, padding: 14, borderRadius: radius.lg, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  accIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  adv: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4 },
});
