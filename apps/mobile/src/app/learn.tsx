import { LEARN_REELS, type LearnReel } from '@defikarta/core';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Volume2, VolumeX } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Share, StyleSheet, Text, View, type ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reel, shareText } from '@/components/Reel';
import { SosButton } from '@/components/SosButton';
import { Chip, IconButton } from '@/components/ui';
import { learn, useLearn } from '@/lib/learn';
import { colors, type } from '@/theme';

/**
 * „Научи“: first aid as a vertical feed, one idea per screen. Swipe up (or press „Следващо“) for the
 * next; tap to pause; tap twice for „Полезно“. The SOS button stays pinned over every reel, because
 * someone learning about cardiac arrest may be the one who has to act on it.
 */
export default function Learn() {
  const insets = useSafeAreaInsets();
  const { seen, liked, voice } = useLearn();
  const [h, setH] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [answers, setAnswers] = useState<Record<string, 0 | 1>>({});
  const [rhythmDone, setRhythmDone] = useState(false);
  const list = useRef<FlatList<LearnReel>>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const total = LEARN_REELS.length;
  const current = LEARN_REELS[index];
  const padTop = insets.top + 92;
  const padBottom = insets.bottom + 10 + 64 + 12;

  useEffect(() => {
    learn.markSeen(current.id);
  }, [current.id]);
  useEffect(() => () => {
    Speech.stop();
  }, []);

  const shown = useRef(0);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (i == null || i === shown.current) return;
    shown.current = i;
    Haptics.selectionAsync().catch(() => undefined);
    progress.setValue(0);
    setPaused(false);
    setIndex(i);
  }).current;

  const go = useCallback((i: number) => list.current?.scrollToIndex({ index: i, animated: true }), []);
  const right = LEARN_REELS.filter((r) => r.kind === 'choice' && answers[r.id] === r.answer).length;
  const asked = Object.keys(answers).length;
  const score = useMemo(() => ({ right, asked, seen: Math.min(seen.length, total), total }), [right, asked, seen.length, total]);

  return (
    <View style={styles.fill} onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}>
      <StatusBar style="light" />
      {h > 0 && (
        <FlatList
          ref={list}
          data={LEARN_REELS}
          keyExtractor={(r) => r.id}
          extraData={[index, paused, voice, liked, answers, rhythmDone, score]}
          renderItem={({ item, index: i }) => (
            <Reel
              reel={item}
              height={h}
              padTop={padTop}
              padBottom={padBottom}
              active={i === index}
              paused={paused}
              voice={voice}
              liked={liked.includes(item.id)}
              first={i === 0}
              last={i === total - 1}
              answer={answers[item.id]}
              rhythmDone={rhythmDone}
              score={score}
              progress={progress}
              onTogglePause={() => setPaused((x) => !x)}
              onLike={() => learn.toggleLike(item.id)}
              onDoubleTap={() => learn.like(item.id)}
              onShare={() => Share.share({ message: shareText(item) }).catch(() => undefined)}
              onNext={() => go(i === total - 1 ? 0 : i + 1)}
              onAnswer={(pick) => setAnswers((a) => ({ ...a, [item.id]: pick }))}
              onRhythmDone={() => setRhythmDone(true)}
            />
          )}
          pagingEnabled
          snapToInterval={h}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      )}

      {/* fixed header: back, where you are, sound */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <IconButton icon={ChevronLeft} label="Назад" tone="night" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`Научи. Съвет ${index + 1} от ${total}`}>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>Научи</Text>
            <Text style={styles.headerSub} maxFontSizeMultiplier={1.3}>{index + 1} от {total}</Text>
          </View>
          <Chip tone="night" icon={voice ? Volume2 : VolumeX} label={voice ? 'Звук' : 'Без звук'} on={voice} onPress={() => learn.setVoice(!voice)} />
        </View>
        <View style={styles.segments} importantForAccessibility="no-hide-descendants">
          {LEARN_REELS.map((r, i) => (
            <View key={r.id} style={styles.seg}>
              {i < index ? (
                <View style={[styles.segFill, { width: '100%' }]} />
              ) : i === index ? (
                <Animated.View style={[styles.segFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]} />
              ) : null}
            </View>
          ))}
        </View>
      </View>

      {/* the help button, always one tap away */}
      <View style={[styles.sos, { bottom: insets.bottom + 10 }]}>
        <SosButton compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.night },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { ...(type.heading as object), color: '#fff', fontSize: 18, lineHeight: 22 },
  headerSub: { ...(type.caption as object), color: 'rgba(255,255,255,0.8)' },
  segments: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  segFill: { height: 3, backgroundColor: '#fff' },
  sos: { position: 'absolute', left: 12, right: 12 },
});
