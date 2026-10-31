import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, DrillTag, ErrorText, H1, H3, P, Small } from '@/components/ui';
import { getServer, setServer } from '@/lib/api';
import { homeFor, useSession } from '@/lib/session';
import { colors } from '@/theme';

const ACCOUNTS = [
  ['responder', 'Доброволец', 'получава известия, „Тръгвам“ / „Нося AED“'],
  ['owner', 'Отговорник безопасност (фирма)', 'AED, пожарогасители, аптечки: срокове и напомняния'],
] as const;

export default function Login() {
  const { login, refresh } = useSession();
  const [email, setEmail] = useState('');
  const [server, setSrv] = useState(getServer());
  const [err, setErr] = useState<string | null>(null);
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
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <DrillTag />
      <H1>Вход</H1>
      <P>Учебна среда: тестовите профили са отворени, без парола. В реалната среда входът е с код по имейл.</P>
      {ACCOUNTS.map(([id, name, what]) => (
        <Pressable key={id} style={({ pressed }) => [styles.account, pressed && { opacity: 0.7 }]} disabled={busy} onPress={() => go(`${id}@drill.defikarta.bg`)}>
          <Text style={styles.accName}>{name}</Text>
          <Text style={styles.accWhat}>{what}</Text>
          <Text style={styles.accMail}>{id}@drill.defikarta.bg</Text>
        </Pressable>
      ))}
      <Card>
        <H3>Нов потребител</H3>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="ime@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Button title="Влез / регистрирай се" disabled={busy || !email.includes('@')} onPress={() => go(email)} />
      </Card>
      <Card>
        <H3>Сървър</H3>
        <TextInput style={styles.input} value={server} onChangeText={setSrv} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Small>По USB: http://localhost:8791 (след „adb reverse tcp:8791 tcp:8791“). По Wi-Fi: адресът на компютъра, напр. http://192.168.1.20:8791.</Small>
        <Button kind="ghost" title="Провери връзката" onPress={async () => { await setServer(server); setErr(null); await refresh(); setErr('Връзката е запазена.'); }} />
      </Card>
      <ErrorText>{err}</ErrorText>
      <Small>Диспечерската конзола и проверката на удостоверения са на компютъра (сайта → Конзола).</Small>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  account: { backgroundColor: colors.soft, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2 },
  accName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  accWhat: { fontSize: 14, color: colors.muted },
  accMail: { fontSize: 12, color: '#444' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, fontSize: 16, color: colors.ink },
});
