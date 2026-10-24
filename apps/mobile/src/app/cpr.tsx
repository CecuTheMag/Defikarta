import { BEAT_INTERVAL_MS, BEFORE_CPR, cueFor, CPR_BPM, DURING_CPR_TIPS } from '@defikarta/core';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AedCard } from '@/components/AedCard';
import { useAedState } from '@/lib/AedContext';
import { useMetronome } from '@/lib/useMetronome';
import { colors } from '@/theme';

const say = (text: string) => Speech.speak(text, { language: 'bg-BG', rate: 1.0 });

export default function Cpr() {
  useKeepAwake();
  const { ranked, coords } = useAedState();
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
    pulse.setValue(0.85);
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

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {!running && (
        <View style={styles.steps}>
          <Text style={styles.stepLabel}>Стъпка 2 от 2</Text>
          {BEFORE_CPR.map((s, i) => (
            <View key={s.title} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={running ? 'Спри метронома' : 'Започни масаж'}>
        <Animated.View style={[styles.circle, running && styles.circleOn, { transform: [{ scale: pulse }] }]}>
          {running ? (
            <>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.circleSub}>натискания · {CPR_BPM}/мин</Text>
            </>
          ) : (
            <Text style={styles.start}>Започни{'\n'}масаж</Text>
          )}
        </Animated.View>
      </Pressable>

      <Pressable onPress={() => setVoice(!voice)} style={styles.voice} accessibilityRole="switch" accessibilityState={{ checked: voice }}>
        <Text style={styles.voiceText}>{voice ? '🔊 Гласови указания: вкл.' : '🔇 Гласови указания: изкл.'}</Text>
      </Pressable>

      {running && (
        <View style={styles.tips}>
          {DURING_CPR_TIPS.map((t) => (
            <Text key={t} style={styles.tip}>
              • {t}
            </Text>
          ))}
        </View>
      )}

      {nearest && (
        <View style={{ gap: 8 }}>
          <Text style={styles.aedTitle}>Пратете някой за този дефибрилатор:</Text>
          <AedCard aed={nearest} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 18, alignItems: 'stretch' },
  steps: { gap: 12 },
  stepLabel: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, color: '#fff', textAlign: 'center', lineHeight: 28, fontWeight: '800' },
  stepTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  stepBody: { fontSize: 15, lineHeight: 21, color: colors.ink },
  circle: { alignSelf: 'center', width: 240, height: 240, borderRadius: 120, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: colors.ink },
  start: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  count: { color: '#fff', fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  circleSub: { color: '#ddd', fontSize: 15 },
  voice: { alignSelf: 'center', padding: 8 },
  voiceText: { fontSize: 15, color: colors.muted },
  tips: { gap: 6, backgroundColor: colors.soft, borderRadius: 14, padding: 14 },
  tip: { fontSize: 16, lineHeight: 22, color: colors.ink },
  aedTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
