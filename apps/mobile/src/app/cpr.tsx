import { BEAT_INTERVAL_MS, BEFORE_CPR, cueFor, CPR_BPM, DURING_CPR_TIPS } from '@defikarta/core';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AedCard } from '@/components/AedCard';
import { AlertPeople } from '@/components/AlertPeople';
import { Call112 } from '@/components/Call112';
import { Pulse } from '@/components/Pulse';
import { Steps } from '@/components/Steps';
import { Chip, Screen, T } from '@/components/ui';
import { useAedState } from '@/lib/AedContext';
import { useMetronome } from '@/lib/useMetronome';
import { useSession } from '@/lib/session';
import { colors, radius, type } from '@/theme';

const say = (text: string) => Speech.speak(text, { language: 'bg-BG', rate: 1.0 });

/** Step 2: hands-only CPR with a 110/min metronome, voice and haptics. Urgent mood, the circle is the whole screen. */
export default function Cpr() {
  useKeepAwake();
  const { ranked, coords } = useAedState();
  const { config } = useSession();
  const click = useAudioPlayer(require('../../assets/click.wav'));
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [voice, setVoice] = useState(true);
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
    say(BEFORE_CPR.map((s) => s.say).join(' '));
    return () => {
      Speech.stop();
    };
  }, []);

  useMetronome(running, BEAT_INTERVAL_MS, (n) => {
    click.seekTo(0);
    click.play();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    pulse.setValue(0.9);
    Animated.timing(pulse, { toValue: 1, duration: BEAT_INTERVAL_MS * 0.8, useNativeDriver: true }).start();
    setCount(n);
    const cue = cueFor(n);
    if (cue && voice) say(cue);
  });

  const toggle = () => {
    Speech.stop();
    if (!running) {
      setCount(0);
      if (voice) say('Натискай силно и бързо, в ритъма на сигнала.');
    }
    setRunning(!running);
  };

  const nearest = coords ? ranked[0] : undefined;
  const cycle = count % 30; // ERC hands-only: swap rescuers about every 2 minutes; 30 shows rhythm progress

  return (
    <Screen tone="night" title="Сърдечен масаж" footer={<Call112 />} right={<Chip tone="night" icon={voice ? Volume2 : VolumeX} label={voice ? 'Глас' : 'Без глас'} on={voice} onPress={() => setVoice(!voice)} />}>
      {!running && (
        <>
          <Steps step={2} />
          <View style={{ gap: 14 }}>
            {BEFORE_CPR.map((s, i) => (
              <View key={s.title} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" tone="night">{s.title}</T>
                  <T v="body" tone="night" color={colors.nightText2}>{s.body}</T>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.circleWrap}>
        <Pulse key={running ? "on" : "off"} color={colors.red} size={260} rings={running ? 1 : 2} period={running ? BEAT_INTERVAL_MS * 4 : 2400}>
          <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={running ? `Спри метронома. ${count} натискания` : 'Започни масаж'}>
            <Animated.View style={[styles.circle, running && styles.circleOn, { transform: [{ scale: pulse }] }]}>
              {running ? (
                <>
                  <Text style={styles.count} maxFontSizeMultiplier={1.1}>{count}</Text>
                  <T v="label" tone="night">натискания · {CPR_BPM}/мин</T>
                  <View style={styles.beats}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <View key={i} style={[styles.beat, i < Math.floor(cycle / 3) + 1 && { backgroundColor: colors.red }]} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.start} maxFontSizeMultiplier={1.2}>Започни{'\n'}масаж</Text>
                  <T v="label" tone="night" color="rgba(255,255,255,0.8)">докосни за метронома</T>
                </>
              )}
            </Animated.View>
          </Pressable>
        </Pulse>
      </View>
      {running && <T v="caption" tone="night" center>Докосни кръга, за да спреш.</T>}

      {running && (
        <View style={styles.tips}>
          {DURING_CPR_TIPS.map((t) => (
            <View key={t} style={styles.tipRow}>
              <View style={styles.tipDot} />
              <T v="body" tone="night" style={{ flex: 1 }}>{t}</T>
            </View>
          ))}
        </View>
      )}

      {/* Only reached through „Обадих се“ on step 1, so 112 has been called. Hidden when the server is unreachable. */}
      {config?.flags.public_alerts && <AlertPeople coords={coords} />}

      {nearest && (
        <View style={styles.aed}>
          <AedCard aed={nearest} tone="night" overline="Пратете някой за този дефибрилатор" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', gap: 14 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.nightEdge, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { ...(type.number as object), fontSize: 15, color: colors.nightText },
  circleWrap: { alignItems: 'center', paddingVertical: 40 },
  circle: { width: 260, height: 260, borderRadius: 130, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 6, borderColor: 'rgba(255,255,255,0.12)' },
  circleOn: { backgroundColor: colors.night2, borderColor: colors.red },
  start: { ...(type.title as object), fontSize: 34, lineHeight: 38, color: '#fff', textAlign: 'center' },
  count: { ...(type.number as object), fontSize: 84, lineHeight: 88, color: colors.nightText, letterSpacing: -2 },
  beats: { flexDirection: 'row', gap: 4, marginTop: 8 },
  beat: { width: 10, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  tips: { gap: 12, padding: 18, borderRadius: radius.lg, backgroundColor: colors.nightGlass, borderWidth: 1, borderColor: colors.nightEdge },
  tipRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red, marginTop: 9 },
  aed: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.night2, borderWidth: 1, borderColor: colors.nightEdge },
});
