/* ДефиКарта: public website. Plain JavaScript, no build step. Needs Leaflet (L) and qrcode-generator (qrcode). */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-bolt"/></svg>';

  /* Same walking assumptions as the app (packages/core/src/geo.ts). */
  var WALK_M_PER_MIN = 75;
  var ROUTE_FACTOR = 1.3;
  var CITY_BBOX = [[42.405, 25.595], [42.445, 25.67]];
  var PROVINCE_BBOX = '41.95,24.95,42.8,26.15';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[„“”"']/g, '').replace(/\s+/g, ' ').trim(); }
  function toRad(d) { return d * Math.PI / 180; }
  function distanceM(a, b) {
    var dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function walkMin(m) { return Math.max(1, Math.ceil(m * ROUTE_FACTOR / WALK_M_PER_MIN)); }
  function fmtDist(m) { return m < 1000 ? (Math.round(m / 10) * 10) + ' м' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' км'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* =============== nav: scroll spy and the QR popover =============== */
  (function nav() {
    var links = $$('.links a[data-spy]');
    var sections = links.map(function (a) { return document.getElementById(a.getAttribute('data-spy')); }).filter(Boolean);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-spy') === e.target.id); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { io.observe(s); });
    }
    links[0] && links[0].classList.add('on');

    var btn = $('#qr-btn'), pop = $('#qr-pop');
    $('#qr-host').textContent = location.host;
    try {
      var qr = qrcode(0, 'M');
      qr.addData(location.origin + '/');
      qr.make();
      $('#qr-code').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { /* the page works without the code */ }
    function setPop(open) { pop.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setPop(pop.hidden); });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { setPop(false); btn.focus(); } });
  })();

  /* =============== app demo: phone frame, tabs, lazy load =============== */
  (function demo() {
    var frame = $('#app-frame'), col = $('.phone-col');
    var tabs = $$('.tab');
    function fit() {
      var k = Math.max(0.6, Math.min(1, (window.innerHeight - 64 - 112 - 60) / 872));
      col.style.setProperty('--k', String(k));
    }
    fit();
    window.addEventListener('resize', fit);

    var loaded = false;
    function load(src) {
      var url = new URL(src, location.origin).href;
      if (frame.src !== url) frame.src = url;
      loaded = true;
    }
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      load(tab.getAttribute('data-src'));
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.tabIndex = i === 0 ? 0 : -1;
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var j = i;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i + tabs.length - 1) % tabs.length;
        else return;
        e.preventDefault();
        select(tabs[j], true);
      });
    });
    /* The app asks for the location as soon as it opens, so it only starts when the visitor reaches it. */
    var sec = $('#prilozhenie');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !loaded) { select(tabs[0], false); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(sec);
    } else {
      select(tabs[0], false);
    }
  })();

  /* =============== map and list =============== */
  var state = { all: [], filter: 'all', q: '', selected: null, user: null, cov: false, covScenario: 'now', listScroll: 0 };
  var data = null;
  var map, markerLayer, covLayer, userLayer, markers = {};
  var els = {
    list: $('#list'), count: $('#count'), empty: $('#empty'), detail: $('#detail'), q: $('#q'), body: $('.side-body'),
    sortHint: $('#sort-hint'), toast: $('#toast'), legend: $('#legend'), listHead: $('.list-head')
  };

  function isAlways(a) { return a.openingHours === '24/7' || a.hours === 'Денонощно'; }
  function isFree(a) { return a.access === 'yes' || a.access === 'permissive' || /^Свободен/.test(a.accessText || ''); }
  function statusOf(a) {
    if (isAlways(a)) return { t: 'Денонощен', c: 'ok' };
    if (/^Само в учебно/.test(a.hours || '')) return { t: 'Учебно време', c: '' };
    if (/^В работн/.test(a.hours || '')) return { t: 'В работно време', c: '' };
    return { t: 'Часове неизвестни', c: '' };
  }
  function accessLabel(a) {
    if (a.accessText) return a.accessText;
    return { yes: 'Свободен достъп', permissive: 'Свободен достъп', customers: 'За посетители', private: 'Частен достъп' }[a.access] || null;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { els.toast.hidden = true; }, 4200);
  }

  function visible() {
    var q = norm(state.q);
    var list = state.all.filter(function (a) {
      if (state.filter === 'always' && !isAlways(a)) return false;
      if (state.filter === 'free' && !isFree(a)) return false;
      if (q && norm([a.name, a.city, a.address, a.kind].join(' ')).indexOf(q) === -1) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (state.user) return a._d - b._d;
      var ra = a.city === 'Стара Загора' ? 0 : 1, rb = b.city === 'Стара Загора' ? 0 : 1;
      return ra - rb || a.name.localeCompare(b.name, 'bg');
    });
    return list;
  }

  function renderChips() {
    var counts = { all: state.all.length, always: state.all.filter(isAlways).length, free: state.all.filter(isFree).length };
    $$('.chip').forEach(function (c) {
      var f = c.getAttribute('data-f');
      $('.n', c).textContent = counts[f];
      c.disabled = f !== 'all' && counts[f] === 0;
      c.setAttribute('aria-pressed', state.filter === f ? 'true' : 'false');
    });
  }

  function renderList() {
    var list = visible();
    els.count.textContent = list.length === state.all.length ? plural(list.length, 'уред', 'уреда') : list.length + ' от ' + state.all.length;
    els.empty.hidden = list.length > 0;
    els.list.innerHTML = list.map(function (a) {
      var st = statusOf(a);
      var end = state.user
        ? '<span class="it-end">' + esc(fmtDist(a._d)) + '<small>~' + walkMin(a._d) + ' мин пеша</small></span>'
        : '<span class="it-end"><span class="st ' + st.c + '">' + esc(st.t) + '</span></span>';
      return '<li><button type="button" class="item" data-id="' + esc(a.id) + '"' + (state.selected === a.id ? ' aria-current="true"' : '') + '>' +
        '<span class="mini' + (isAlways(a) ? ' is24' : '') + '">' + BOLT + '</span>' +
        '<span><span class="it-name">' + esc(a.name) + '</span><span class="it-meta">' + esc([a.city, a.kind].filter(Boolean).join(' · ')) + '</span></span>' + end + '</button></li>';
    }).join('');
    syncMarkers(list);
    renderChips();
  }

  function pinIcon(a) {
    return L.divIcon({ className: 'dk-pin' + (isAlways(a) ? ' is24' : ''), html: '<div class="p">' + BOLT + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }
  function buildMarkers() {
    markerLayer.clearLayers();
    markers = {};
    state.all.forEach(function (a) {
      var m = L.marker([a.lat, a.lon], { icon: pinIcon(a), keyboard: true, title: a.name, alt: a.name, riseOnHover: true });
      m.bindTooltip(esc(a.name), { direction: 'top', offset: [0, -20], className: 'dk-tip', opacity: 1 });
      m.on('click', function () { select(a.id, { fly: false }); });
      m.on('mouseover', function () { hl(a.id, true); });
      m.on('mouseout', function () { hl(a.id, false); });
      markers[a.id] = m;
    });
  }
  function syncMarkers(list) {
    var ids = {};
    list.forEach(function (a) { ids[a.id] = true; });
    Object.keys(markers).forEach(function (id) {
      var on = !!ids[id], m = markers[id];
      if (on && !markerLayer.hasLayer(m)) markerLayer.addLayer(m);
      if (!on && markerLayer.hasLayer(m)) markerLayer.removeLayer(m);
    });
    paintSelected();
  }
  function paintSelected() {
    Object.keys(markers).forEach(function (id) {
      var el = markers[id].getElement();
      if (el) el.classList.toggle('sel', id === state.selected);
    });
  }
  function hl(id, on) {
    var el = markers[id] && markers[id].getElement();
    if (el) el.classList.toggle('hl', on);
    var item = $('.item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]', els.list);
    if (item) item.classList.toggle('hl', on);
  }

  /* ---- detail ---- */
  function row(label, value, muted) { return '<div><dt>' + esc(label) + '</dt><dd' + (muted ? ' class="muted"' : '') + '>' + value + '</dd></div>'; }
  function renderDetail(a) {
    var st = statusOf(a), acc = accessLabel(a);
    var tags = '<span class="tag-g ' + (st.c === 'ok' ? 'ok' : 'warn') + '">' + esc(st.t) + '</span>';
    if (acc) tags += '<span class="tag-g' + (isFree(a) ? ' ok' : '') + '">' + esc(acc) + '</span>';
    if (a.indoor === true) tags += '<span class="tag-g">Вътре в сграда</span>';
    if (a.indoor === false) tags += '<span class="tag-g">Отвън</span>';
    var src = a.sourceUrl ? '<a href="' + esc(a.sourceUrl) + '" target="_blank" rel="noopener">' + esc(a.source) + '</a>' : esc(a.source || '');
    var dist = state.user ? '<div><dt>От вас</dt><dd>' + esc(fmtDist(a._d)) + ', около ' + walkMin(a._d) + ' мин пеша</dd></div>' : '';
    var subject = encodeURIComponent('Промяна за уред: ' + a.name);
    var body = encodeURIComponent('Уред: ' + a.name + '\nНа картата: ' + location.origin + '/site/#aed=' + a.id + '\n\nКакво е променено:\n');
    els.detail.innerHTML =
      '<button type="button" class="back" id="back"><svg class="ic"><use href="#i-back"/></svg>Всички уреди</button>' +
      '<h2>' + esc(a.name) + '</h2>' +
      '<p class="d-sub">' + esc([a.kind, a.city].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="d-tags">' + tags + '</div>' +
      '<dl class="d-list">' + dist +
        (a.address ? row('Адрес', esc(a.address)) : '') +
        row('Място в сградата', a.hint ? esc(a.hint) : 'Не е известно', !a.hint) +
        row('Работно време', a.hours ? esc(a.hours) : (a.openingHours ? esc(a.openingHours) : 'Не е известно. Ще го покажем, когато бъде потвърдено.'), !(a.hours || a.openingHours)) +
        row('Източник', src) +
        row('Проверка на място', a.verifiedAt ? esc(a.verifiedAt) : 'Още не е проверяван от нашия екип', !a.verifiedAt) +
      '</dl>' +
      (a.extra ? '<p class="d-note">' + esc(a.extra) + '</p>' : '') +
      '<div class="d-act">' +
        '<a class="btn btn-solid" style="height:40px;padding:0 16px;font-size:14px" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + a.lat + ',' + a.lon + '&travelmode=walking"><svg class="ic"><use href="#i-route"/></svg>Маршрут пеша</a>' +
        '<a class="btn btn-line" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + a.lat + '&mlon=' + a.lon + '#map=18/' + a.lat + '/' + a.lon + '"><svg class="ic"><use href="#i-out"/></svg>OpenStreetMap</a>' +
        '<a class="btn btn-line" href="mailto:defikarta@gmail.com?subject=' + subject + '&body=' + body + '">Съобщи промяна</a>' +
      '</div>';
    $('#back').addEventListener('click', function () { deselect(true); });
  }

  function setHash(id) {
    var base = location.pathname + location.search;
    try { history.replaceState(null, '', id ? base + '#aed=' + encodeURIComponent(id) : base); } catch (e) { /* ignore */ }
  }

  function select(id, opts) {
    opts = opts || {};
    var a = state.all.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    if (!state.selected) state.listScroll = els.body.scrollTop;
    state.selected = id;
    renderDetail(a);
    els.list.hidden = true; els.listHead.hidden = true; els.empty.hidden = true;
    els.detail.hidden = false;
    els.body.scrollTop = 0;
    $$('.item', els.list).forEach(function (i) { i.removeAttribute('aria-current'); });
    paintSelected();
    setHash(id);
    if (opts.fly !== false) {
      var z = Math.max(map.getZoom(), 16);
      if (reduceMotion) map.setView([a.lat, a.lon], z); else map.flyTo([a.lat, a.lon], z, { duration: 0.7 });
    } else if (!map.getBounds().pad(-0.1).contains([a.lat, a.lon])) {
      map.panTo([a.lat, a.lon]);
    }
    if (opts.focus !== false) { var b = $('#back'); b && b.focus({ preventScroll: true }); }
  }

  function deselect(focusItem) {
    var prev = state.selected;
    state.selected = null;
    els.detail.hidden = true;
    els.list.hidden = false; els.listHead.hidden = false;
    renderList();
    els.body.scrollTop = state.listScroll || 0;
    setHash(null);
    if (focusItem && prev) { var it = $('.item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(prev) : prev) + '"]', els.list); it && it.focus({ preventScroll: true }); }
  }

  /* ---- coverage ---- */
  function covTexts() {
    var s = data.coverage.scenarios[state.covScenario];
    var big = Math.round(s.within5 * 100) + ' %';
    var text;
    if (state.covScenario === 'always') {
      text = s.within5 === 0
        ? 'От площта няма нито една част на 5 минути пеша от денонощен уред. В града няма потвърден такъв.'
        : 'от площта е на най-много 5 минути пеша от денонощен уред. До 10 минути: около ' + Math.round(s.within10 * 100) + ' %.';
    } else {
      text = 'от площта на града е на най-много 5 минути пеша от известен уред. До 10 минути: около ' + Math.round(s.within10 * 100) + ' %.';
    }
    return { big: big, text: text };
  }
  function drawCov() {
    covLayer.clearLayers();
    if (!state.cov) return;
    var cov = data.coverage, half = cov.stepM / 2, dLat = half / 111320, dLon = half / 82500;
    cov.scenarios[state.covScenario].cells.forEach(function (c) {
      var near = c[2] <= 5;
      L.rectangle([[c[0] - dLat, c[1] - dLon], [c[0] + dLat, c[1] + dLon]], { pane: 'cov', stroke: false, interactive: false, fillColor: near ? '#0E9F6E' : '#F5A524', fillOpacity: near ? 0.5 : 0.34 }).addTo(covLayer);
    });
    var t = covTexts();
    $('#cov-big').textContent = t.big;
    $('#cov-text').textContent = t.text;
  }
  function setCov(on) {
    state.cov = on;
    $('#cov-body').hidden = !on;
    els.legend.hidden = !on;
    if (on && (map.getZoom() > 14 || !map.getBounds().intersects(L.latLngBounds(CITY_BBOX)))) {
      if (reduceMotion) map.fitBounds(CITY_BBOX, { padding: [40, 40] }); else map.flyToBounds(CITY_BBOX, { padding: [40, 40], duration: 0.8 });
    }
    drawCov();
  }

  /* ---- my location ---- */
  function locate() {
    var btn = $('#locate');
    if (!navigator.geolocation) { toast('Този браузър не поддържа местоположение.'); return; }
    btn.classList.add('on');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var u = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.user = u;
      state.all.forEach(function (a) { a._d = distanceM(u, a); });
      userLayer.clearLayers();
      L.circle([u.lat, u.lon], { radius: Math.min(pos.coords.accuracy || 50, 800), stroke: false, fillColor: '#1a6ef5', fillOpacity: 0.12, interactive: false }).addTo(userLayer);
      L.marker([u.lat, u.lon], { icon: L.divIcon({ className: '', html: '<div class="dk-me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false }).addTo(userLayer);
      var nearest = state.all.slice().sort(function (a, b) { return a._d - b._d; })[0];
      els.sortHint.hidden = false;
      els.sortHint.textContent = 'По разстояние от вас. Изчисти';
      if (state.selected) renderDetail(state.all.filter(function (x) { return x.id === state.selected; })[0]); else renderList();
      if (nearest) {
        if (nearest._d > 60000) toast('Най-близкият известен уред е на ' + fmtDist(nearest._d) + ' от вас.');
        var b = L.latLngBounds([[u.lat, u.lon], [nearest.lat, nearest.lon]]);
        map.fitBounds(b, { padding: [90, 90], maxZoom: 16, animate: !reduceMotion });
      }
    }, function (err) {
      btn.classList.remove('on');
      toast(err && err.code === 1 ? 'Местоположението не е разрешено в браузъра.' : 'Не успяхме да определим местоположението.');
    }, { timeout: 9000, maximumAge: 60000 });
  }
  function clearUser() {
    state.user = null;
    userLayer.clearLayers();
    $('#locate').classList.remove('on');
    els.sortHint.hidden = true;
    if (state.selected) renderDetail(state.all.filter(function (x) { return x.id === state.selected; })[0]); else renderList();
  }

  /* ---- OpenStreetMap, live (the same query the app uses) ---- */
  function fetchOsm() {
    var q = '[out:json][timeout:25];nwr["emergency"="defibrillator"](' + PROVINCE_BBOX + ');out center tags;';
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { ctl && ctl.abort(); }, 9000);
    return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('osm'); return r.json(); })
      .then(function (j) {
        return (j.elements || []).map(function (el) {
          var lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
          if (lat == null || lon == null) return null;
          var t = el.tags || {};
          var hours = t.opening_hours === '24/7' ? 'Денонощно' : (t.opening_hours ? 'По OpenStreetMap: ' + t.opening_hours : undefined);
          return {
            id: 'osm:' + el.type + '/' + el.id, name: t['name:bg'] || t.name || t.operator || 'Дефибрилатор', lat: lat, lon: lon,
            indoor: t.indoor ? t.indoor !== 'no' : null, access: t.access || null, openingHours: t.opening_hours || null, hours: hours,
            hint: t['defibrillator:location:bg'] || t['defibrillator:location'] || t.description, kind: 'Дефибрилатор', city: '',
            address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || undefined,
            source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/' + el.type + '/' + el.id, verifiedAt: t.check_date || t['survey:date'] || null
          };
        }).filter(Boolean);
      });
  }
  function mergeOsm(osm) {
    if (!osm.length) return;
    var seed = state.all.filter(function (a) { return a.id.indexOf('osm:') !== 0; });
    var close = function (a, b) { return Math.abs(a.lat - b.lat) * 111000 < 40 && Math.abs(a.lon - b.lon) * 82000 < 40; };
    state.all = osm.concat(seed.filter(function (s) { return !osm.some(function (o) { return close(o, s); }); }));
    if (state.user) state.all.forEach(function (a) { a._d = distanceM(state.user, a); });
    buildMarkers();
    renderList();
    if (state.selected && !state.all.some(function (a) { return a.id === state.selected; })) deselect(false);
  }

  /* ---- init ---- */
  function initMap() {
    map = L.map('map', { zoomControl: false, zoomSnap: 0.5, wheelPxPerZoomLevel: 90, minZoom: 8, maxZoom: 19 });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    map.createPane('cov').style.zIndex = 350;
    covLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    fitCity(false);
    $('#z-in').addEventListener('click', function () { map.zoomIn(); });
    $('#z-out').addEventListener('click', function () { map.zoomOut(); });
    $('#fit').addEventListener('click', function () { fitAll(); });
    $('#locate').addEventListener('click', function () { state.user ? fitUser() : locate(); });
    map.on('click', function () { if (state.selected) deselect(false); });
  }
  function fitCity(animate) {
    var pts = state.all.filter(function (a) { return a.lat > CITY_BBOX[0][0] - 0.02 && a.lat < CITY_BBOX[1][0] + 0.02 && a.lon > CITY_BBOX[0][1] - 0.02 && a.lon < CITY_BBOX[1][1] + 0.1; });
    var b = pts.length ? L.latLngBounds(pts.map(function (a) { return [a.lat, a.lon]; })) : L.latLngBounds(CITY_BBOX);
    map.fitBounds(b, { padding: [90, 90], maxZoom: 14, animate: !!animate && !reduceMotion });
  }
  function fitAll() {
    var b = L.latLngBounds(state.all.map(function (a) { return [a.lat, a.lon]; }));
    map.fitBounds(b, { padding: [80, 80], maxZoom: 14, animate: !reduceMotion });
  }
  function fitUser() {
    if (!state.user) return;
    map.setView([state.user.lat, state.user.lon], Math.max(map.getZoom(), 15), { animate: !reduceMotion });
  }

  function bind() {
    els.list.addEventListener('click', function (e) { var b = e.target.closest('.item'); if (b) select(b.getAttribute('data-id'), { fly: true }); });
    els.list.addEventListener('mouseover', function (e) { var b = e.target.closest('.item'); if (b) hl(b.getAttribute('data-id'), true); });
    els.list.addEventListener('mouseout', function (e) { var b = e.target.closest('.item'); if (b) hl(b.getAttribute('data-id'), false); });
    els.list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var items = $$('.item', els.list), i = items.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var j = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      items[j].focus();
    });
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { state.filter = c.getAttribute('data-f'); if (state.selected) deselect(false); else renderList(); }); });
    els.q.addEventListener('input', function () { state.q = els.q.value; if (state.selected) deselect(false); else renderList(); });
    els.q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (els.q.value) { els.q.value = ''; state.q = ''; renderList(); } else els.q.blur(); }
      if (e.key === 'ArrowDown') { var f = $('.item', els.list); if (f) { e.preventDefault(); f.focus(); } }
      if (e.key === 'Enter') { var v = visible(); if (v.length) select(v[0].id, { fly: true }); }
    });
    $('#reset').addEventListener('click', function () { state.filter = 'all'; state.q = ''; els.q.value = ''; renderList(); });
    els.sortHint.addEventListener('click', clearUser);
    $('#cov-on').addEventListener('change', function (e) { setCov(e.target.checked); });
    $$('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.covScenario = b.getAttribute('data-s');
        $$('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        drawCov();
      });
    });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.getElementById('karta').scrollIntoView({ block: 'start' }); els.q.focus(); }
      if (e.key === 'Escape' && state.selected && !typing) deselect(true);
    });
    window.addEventListener('hashchange', function () { var id = hashId(); if (id) select(id, { fly: true, focus: false }); else if (state.selected) deselect(false); });
  }
  function hashId() { var m = /^#aed=(.+)$/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; }

  initMap();
  bind();
  fetch('data/site-data.json')
    .then(function (r) { if (!r.ok) throw new Error('data'); return r.json(); })
    .then(function (d) {
      data = d;
      state.all = d.aeds.map(function (a) { return Object.assign({}, a); });
      buildMarkers();
      renderList();
      fitCity(false);
      var t = covTexts();
      $('#cov-big').textContent = t.big; $('#cov-text').textContent = t.text;
      var id = hashId();
      if (id) select(id, { fly: true, focus: false });
      fetchOsm().then(mergeOsm).catch(function () { /* the confirmed list stays; OSM is a bonus */ });
    })
    .catch(function () {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      els.empty.textContent = 'Не успяхме да заредим данните. Опитайте да презаредите страницата.';
    });

  /* A clean address in the bar: /site/ instead of /site/index.html. */
  try { if (/\/index\.html$/.test(location.pathname)) history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash); } catch (e) { /* ignore */ }
})();
