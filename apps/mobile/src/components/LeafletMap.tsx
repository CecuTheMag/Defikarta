import type { LatLon } from '@defikarta/core';
import { useEffect, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import WebViewBase, { type WebViewMessageEvent } from 'react-native-webview';
import type { AndroidWebViewProps } from 'react-native-webview/lib/WebViewTypes';
import { focusJs, page, type Focus } from './leafletPage';

export type { Focus } from './leafletPage';

interface WebViewHandle {
  injectJavaScript(js: string): void;
}
// The package's combined iOS & Android & Windows props type collapses to `never` with React 19.3 types.
const WebView = WebViewBase as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebViewHandle> }>;

export type PinKind = 'aed' | 'me' | 'patient' | 'runner' | 'cpr';

export interface Pin extends LatLon {
  id: string;
  kind: PinKind;
  /** Ring colour for AEDs (open / closed / unknown). */
  color?: string;
  selected?: boolean;
}

export interface Line {
  points: LatLon[];
  color: string;
  dashed?: boolean;
}

/**
 * OpenStreetMap tiles, desaturated into a quiet light basemap, drawn by Leaflet inside a WebView:
 * no API key (CARTO's free basemaps now require one), Cyrillic street names, and pins that are drawn shapes, not emoji.
 * Pins and lines are pushed in with injectJavaScript, so the user's panning is never reset.
 */
export function LeafletMap({
  center,
  zoom = 14,
  pins,
  lines = [],
  focus,
  onPress,
  onPinPress,
  style,
  padBottom = 0,
  padTop = 0,
}: {
  center: LatLon;
  zoom?: number;
  pins: Pin[];
  lines?: Line[];
  /** Fly here whenever this object changes (recentre button, selected AED). With `also`, frame both points. */
  focus?: Focus | null;
  onPress?: (p: LatLon) => void;
  onPinPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Pixels hidden behind a bottom sheet, so flyTo centres in the visible part. Read when `focus` changes, so a resizing sheet never moves the map. */
  padBottom?: number;
  /** Pixels hidden behind a top bar (used when framing two points). */
  padTop?: number;
}) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const html = useMemo(() => page(center, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps
  const data = JSON.stringify({ pins, lines });

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.setData(${data});true;`);
  }, [data]);
  const latest = useRef({ padTop, padBottom, focus });
  latest.current = { padTop, padBottom, focus };
  useEffect(() => {
    if (ready.current && focus) ref.current?.injectJavaScript(`${focusJs(focus, latest.current.padTop, latest.current.padBottom)}true;`);
  }, [focus]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { t: string; lat?: number; lon?: number; id?: string };
    if (m.t === 'ready') {
      ready.current = true;
      // A focus that arrived before the page loaded (an early location fix) is applied now.
      const f = latest.current.focus;
      ref.current?.injectJavaScript(`window.setData(${data});${f ? focusJs(f, latest.current.padTop, latest.current.padBottom) : ''}true;`);
    } else if (m.t === 'press' && m.lat != null && m.lon != null) onPress?.({ lat: m.lat, lon: m.lon });
    else if (m.t === 'pin' && m.id) onPinPress?.(m.id);
  };

  return (
    <WebView
      ref={ref}
      style={[styles.map, style]}
      originWhitelist={['*']}
      // Tile servers want a Referer; a base URL gives the page one.
      source={{ html, baseUrl: 'https://defikarta.bg/' }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      nestedScrollEnabled
      overScrollMode="never"
    />
  );
}

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: '#EEF0F2' } });
