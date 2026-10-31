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
}: {
  center: LatLon;
  zoom?: number;
  pins: Pin[];
  lines?: Line[];
  /** Fly here whenever this object changes (recentre button, selected AED). */
  focus?: (LatLon & { zoom?: number }) | null;
  onPress?: (p: LatLon) => void;
  onPinPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Pixels hidden behind a bottom sheet, so flyTo centres in the visible part. */
  padBottom?: number;
}) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const html = useMemo(() => page(center, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps
  const data = JSON.stringify({ pins, lines });

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.setData(${data});true;`);
  }, [data]);
  useEffect(() => {
    if (ready.current && focus) ref.current?.injectJavaScript(`window.focusOn(${focus.lat},${focus.lon},${focus.zoom ?? 16},${padBottom});true;`);
  }, [focus, padBottom]);

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

const BOLT = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#fff"/></svg>';
const WALK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="m7 21 3-6 3 2v4M9 11l3-3 3 3 3 1M10 15l-1-4"/></svg>';

function page(c: LatLon, zoom: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#m{margin:0;height:100%;background:#EEF0F2;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
.leaflet-tile-pane{filter:grayscale(.9) brightness(1.07) contrast(.86)}
.leaflet-control-attribution{font:500 9px/1.2 sans-serif;background:rgba(255,255,255,.7)!important;border-radius:6px 0 0 0;color:#6B7280}
.leaflet-control-attribution a{color:#6B7280}
.p{position:relative;display:grid;place-items:center;border-radius:50%;transition:transform .2s cubic-bezier(.2,.8,.2,1)}
.aed{width:30px;height:30px;background:#fff;box-shadow:0 2px 10px rgba(11,13,18,.22),inset 0 0 0 3px var(--c);color:var(--c)}
.aed.sel{transform:scale(1.35);background:var(--c);color:#fff;box-shadow:0 6px 18px rgba(11,13,18,.3),0 0 0 4px rgba(255,255,255,.95)}
.me{width:16px;height:16px;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 6px rgba(37,99,235,.5);color:#2563EB}
.me:after,.patient:after{content:'';position:absolute;inset:-14px;border-radius:50%;background:currentColor;opacity:.25;animation:ping 2s ease-out infinite}
.patient{width:40px;height:40px;background:#E1112D;color:#E1112D;border:3px solid #fff;box-shadow:0 6px 18px rgba(225,17,45,.45)}
.runner,.cpr{width:30px;height:30px;border:3px solid #fff;box-shadow:0 3px 10px rgba(11,13,18,.3)}
.runner{background:#0E9F6E}.cpr{background:#2563EB}
@keyframes ping{0%{transform:scale(.4);opacity:.45}100%{transform:scale(1.4);opacity:0}}
@media (prefers-reduced-motion:reduce){.me:after,.patient:after{animation:none}}
</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const post = (o) => window.ReactNativeWebView.postMessage(JSON.stringify(o));
const map = L.map('m', { zoomControl: false, attributionControl: true, zoomSnap: 0.5 }).setView([${c.lat}, ${c.lon}], ${zoom});
map.attributionControl.setPrefix(false);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
map.on('click', (e) => post({ t: 'press', lat: e.latlng.lat, lon: e.latlng.lng }));
const layer = L.layerGroup().addTo(map);
const SIZE = { aed: 30, me: 16, patient: 40, runner: 30, cpr: 30 };
const INNER = { aed: '${BOLT}', me: '', patient: '${CROSS}', runner: '${WALK}', cpr: '${WALK}' };
window.setData = (d) => {
  layer.clearLayers();
  for (const l of d.lines) L.polyline(l.points.map((p) => [p.lat, p.lon]), { color: l.color, weight: 4, opacity: 0.8, dashArray: l.dashed ? '2 10' : null, lineCap: 'round' }).addTo(layer);
  for (const p of d.pins) {
    const s = SIZE[p.kind] || 30;
    const el = '<div class="p ' + p.kind + (p.selected ? ' sel' : '') + '" style="--c:' + (p.color || '#E1112D') + '">' + INNER[p.kind] + '</div>';
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: el }), zIndexOffset: p.selected || p.kind === 'patient' ? 1000 : p.kind === 'me' ? 500 : 0, keyboard: false }).addTo(layer);
    m.on('click', (e) => { L.DomEvent.stopPropagation(e); post({ t: 'pin', id: p.id }); });
  }
};
window.focusOn = (lat, lon, z, padBottom) => {
  const pt = map.project([lat, lon], z).add([0, padBottom / 2]);
  map.flyTo(map.unproject(pt, z), z, { duration: 0.6 });
};
post({ t: 'ready' });
</script></body></html>`;
}
