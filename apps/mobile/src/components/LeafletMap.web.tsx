import type { LatLon } from '@defikarta/core';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Line, Pin } from './LeafletMap';
import { focusJs, page, type Focus } from './leafletPage';

export type { Line, Pin, PinKind } from './LeafletMap';
export type { Focus } from './leafletPage';

type MapWindow = Window & { setData?: (d: unknown) => void; eval?: (js: string) => unknown };

/** Web build: the same Leaflet page as the native WebView, in an iframe. A shim stands in for window.ReactNativeWebView. */
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
  focus?: Focus | null;
  onPress?: (p: LatLon) => void;
  onPinPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  padBottom?: number;
  padTop?: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const html = useMemo(
    () => page(center, zoom).replace('<div id="m"></div>', '<div id="m"></div><script>window.ReactNativeWebView={postMessage:(s)=>parent.postMessage({leaflet:s},"*")}</script>'),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const data = { pins, lines };
  const dataKey = JSON.stringify(data);
  const win = () => frame.current?.contentWindow as MapWindow | null | undefined;

  useEffect(() => {
    if (ready.current) win()?.setData?.(data);
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef({ padTop, padBottom, focus });
  latest.current = { padTop, padBottom, focus };
  useEffect(() => {
    if (ready.current && focus) win()?.eval?.(focusJs(focus, latest.current.padTop, latest.current.padBottom));
  }, [focus]);

  const handlers = useRef({ onPress, onPinPress, data });
  handlers.current = { onPress, onPinPress, data };
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data?.leaflet !== 'string') return;
      const m = JSON.parse(e.data.leaflet) as { t: string; lat?: number; lon?: number; id?: string };
      const h = handlers.current;
      if (m.t === 'ready') {
        ready.current = true;
        win()?.setData?.(h.data);
        const f = latest.current.focus;
        if (f) win()?.eval?.(focusJs(f, latest.current.padTop, latest.current.padBottom));
      } else if (m.t === 'press' && m.lat != null && m.lon != null) h.onPress?.({ lat: m.lat, lon: m.lon });
      else if (m.t === 'pin' && m.id) h.onPinPress?.(m.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[styles.map, style]}>
      <iframe ref={frame} srcDoc={html} title="map" style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
}

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: '#EEF0F2', overflow: 'hidden' } });
