import type { LatLon } from '@defikarta/core';
import { useEffect, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import WebViewBase, { type WebViewMessageEvent } from 'react-native-webview';
import type { AndroidWebViewProps } from 'react-native-webview/lib/WebViewTypes';

interface WebViewHandle {
  injectJavaScript(js: string): void;
}
// The package's combined iOS & Android & Windows props type collapses to `never` with React 19.3 types.
const WebView = WebViewBase as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebViewHandle> }>;

export interface Pin extends LatLon {
  id: string;
  color: string;
  /** Emoji or a short symbol drawn inside the pin. */
  text?: string;
  size?: number;
  /** Plain text (never HTML); new lines are kept. */
  label?: string;
}

export interface Line {
  points: LatLon[];
  color: string;
  dashed?: boolean;
}

/**
 * OpenStreetMap tiles drawn by Leaflet inside a WebView: no Google Maps API key needed, and the same map as the website.
 * Everything around the map is native. Pins and lines are pushed in with injectJavaScript, so panning is never reset.
 */
export function LeafletMap({
  center,
  zoom = 14,
  pins,
  lines = [],
  onPress,
  onPinPress,
  style,
}: {
  center: LatLon;
  zoom?: number;
  pins: Pin[];
  lines?: Line[];
  onPress?: (p: LatLon) => void;
  onPinPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  // The page is built once; later changes go through setData.
  const html = useMemo(() => page(center, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps
  const data = JSON.stringify({ pins, lines });

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.setData(${data});true;`);
  }, [data]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { t: string; lat?: number; lon?: number; id?: string };
    if (m.t === 'ready') {
      ready.current = true;
      ref.current?.injectJavaScript(`window.setData(${data});true;`);
    } else if (m.t === 'press' && m.lat != null && m.lon != null) onPress?.({ lat: m.lat, lon: m.lon });
    else if (m.t === 'pin' && m.id) onPinPress?.(m.id);
  };

  return (
    <WebView
      ref={ref}
      style={[styles.map, style]}
      originWhitelist={['*']}
      // OSM's tile policy wants a Referer; a base URL gives the page one.
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

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: '#eef0f2' } });

function page(c: LatLon, zoom: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{margin:0;height:100%;background:#eef0f2}
.pin{border-radius:50%;border:3px solid #fff;color:#fff;display:grid;place-items:center;font:700 14px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.leaflet-control-attribution{font-size:10px}</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const post = (o) => window.ReactNativeWebView.postMessage(JSON.stringify(o));
const map = L.map('m', { zoomControl: false, attributionControl: true }).setView([${c.lat}, ${c.lon}], ${zoom});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
map.on('click', (e) => post({ t: 'press', lat: e.latlng.lat, lon: e.latlng.lng }));
const layer = L.layerGroup().addTo(map);
window.setData = (d) => {
  layer.clearLayers();
  for (const l of d.lines) L.polyline(l.points.map((p) => [p.lat, p.lon]), { color: l.color, weight: 4, opacity: 0.7, dashArray: l.dashed ? '6 8' : null }).addTo(layer);
  for (const p of d.pins) {
    const s = p.size || 26;
    const icon = L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: '<div class="pin" style="width:' + (s - 6) + 'px;height:' + (s - 6) + 'px;background:' + p.color + '">' + (p.text || '') + '</div>' });
    const m = L.marker([p.lat, p.lon], { icon }).addTo(layer);
    if (p.label) { const el = document.createElement('div'); el.style.whiteSpace = 'pre-line'; el.textContent = p.label; m.bindPopup(el); }
    m.on('click', () => post({ t: 'pin', id: p.id }));
  }
};
post({ t: 'ready' });
</script></body></html>`;
}
