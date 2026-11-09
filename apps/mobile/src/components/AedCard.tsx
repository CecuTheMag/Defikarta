import { formatDistance, nativeWalkingUrl, openLabel, type RankedAed } from '@defikarta/core';
import * as Linking from 'expo-linking';
import { MapPin, Route } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '@/theme';
import { Button, Pill, Row, T, type Tone } from './ui';

/**
 * One defibrillator: how far, whether it can be used now, where exactly it is, and a route.
 * The distance is the largest thing on the card, because it is the decision ("send someone or not").
 * Home's sheet shows `AedHeader` collapsed and adds `AedDetails` when it opens; elsewhere `AedCard` is both.
 */
export function AedCard({ aed, tone = 'calm', overline }: { aed: RankedAed; tone?: Tone; overline?: string }) {
  return (
    <View style={{ gap: 10 }} accessible={false}>
      <AedHeader aed={aed} tone={tone} overline={overline} />
      <AedDetails aed={aed} tone={tone} />
    </View>
  );
}

export function AedHeader({ aed, tone = 'calm', overline, compact }: { aed: RankedAed; tone?: Tone; overline?: string; compact?: boolean }) {
  const night = tone === 'night';
  const hasDistance = Number.isFinite(aed.distanceM);
  return (
    <View style={{ gap: 2 }}>
      {overline && <T v="overline" tone={tone}>{overline}</T>}
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" tone={tone} numberOfLines={compact ? 1 : 2}>{aed.name}</T>
          {aed.locationHint && !compact ? (
            <Row gap={6} style={{ flexWrap: 'nowrap' }}>
              <MapPin size={15} color={night ? colors.nightText2 : colors.ink2} strokeWidth={2.2} />
              <T v="caption" tone={tone} style={{ flex: 1 }} numberOfLines={2}>{aed.locationHint}</T>
            </Row>
          ) : null}
        </View>
        {hasDistance && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.number, compact ? styles.distSmall : styles.dist, { color: night ? colors.nightText : colors.ink }]} maxFontSizeMultiplier={1.3}>{formatDistance(aed.distanceM)}</Text>
            <T v="caption" tone={tone}>~{aed.walkMin} мин пеша</T>
          </View>
        )}
      </View>
    </View>
  );
}

export function AedDetails({ aed, tone = 'calm' }: { aed: RankedAed; tone?: Tone }) {
  const night = tone === 'night';
  const route = () => Linking.openURL(nativeWalkingUrl(Platform.OS === 'ios' ? 'ios' : 'android', aed));
  return (
    <View style={{ gap: 10 }}>
      <Row>
        <Pill status={aed.open} label={openLabel(aed.open)} />
        {aed.maintenance === 'tracked' && <Pill status="ok" label="Поддръжката се следи" />}
        {aed.maintenance === 'overdue' && <Pill status="overdue" label="Поддръжката е просрочена" />}
        {aed.source === 'demo' && <Pill status="unknown" label="ДЕМО" />}
      </Row>
      {aed.note && !night ? <T v="caption" tone={tone} numberOfLines={3}>{aed.note}</T> : null}
      <Button kind={night ? 'nightGhost' : 'glass'} icon={Route} title="Маршрут пеша" onPress={route} label={`Маршрут пеша до ${aed.name}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dist: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  distSmall: { fontSize: 22, lineHeight: 26, letterSpacing: -0.6 },
});
