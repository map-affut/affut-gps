'use strict';
/* Affût GPS — carte GPS hors ligne pour la chasse */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D2R = Math.PI / 180;
/* Pont vers l'application Android (absent dans le navigateur) */
const NATIVE = window.AffutNative || null;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Mémoire pleine : enregistrement impossible"); } }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800);
}

/* ---------- Géométrie ---------- */
function dist(a1, o1, a2, o2) {
  const R = 6371008.8, dA = (a2 - a1) * D2R, dO = (o2 - o1) * D2R;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * D2R) * Math.cos(a2 * D2R) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a1, o1, a2, o2) {
  const y = Math.sin((o2 - o1) * D2R) * Math.cos(a2 * D2R);
  const x = Math.cos(a1 * D2R) * Math.sin(a2 * D2R) - Math.sin(a1 * D2R) * Math.cos(a2 * D2R) * Math.cos((o2 - o1) * D2R);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const card = b => CARD[Math.round(b / 22.5) % 16];
const fmtDist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km';
const fmtCoord = (lat, lon) => `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'O'}`;
const fmtTime = d => d ? d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = t => new Date(t).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });

/* UTM (WGS84) */
function toUTM(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const zone = Math.floor((lon + 180) / 6) + 1, lon0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const p = lat * D2R, sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
  const N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (lon * D2R - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let Nn = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) Nn += 10000000;
  const band = 'CDEFGHJKLMNPQRSTUVWXX'[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))];
  return `UTM ${zone}${band} ${Math.round(E)} E ${Math.round(Nn)} N`;
}

/* Lever / coucher du soleil (algorithme de l'Almanac, précision ~1-2 min) */
function sunTime(date, lat, lon, rising) {
  const z = 90.833, y = date.getFullYear();
  const N = Math.round((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 0)) / 864e5);
  const lh = lon / 15, t = N + ((rising ? 6 : 18) - lh) / 24;
  const M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * D2R) + 0.020 * Math.sin(2 * M * D2R) + 282.634) % 360; if (L < 0) L += 360;
  let RA = Math.atan(0.91764 * Math.tan(L * D2R)) / D2R; RA = (RA % 360 + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sd = 0.39782 * Math.sin(L * D2R), cd = Math.cos(Math.asin(sd));
  const cH = (Math.cos(z * D2R) - sd * Math.sin(lat * D2R)) / (cd * Math.cos(lat * D2R));
  if (cH > 1 || cH < -1) return null;
  const H = (rising ? 360 - Math.acos(cH) / D2R : Math.acos(cH) / D2R) / 15;
  const UT = ((H + RA - 0.06571 * t - 6.622 - lh) % 24 + 24) % 24;
  return new Date(Date.UTC(y, date.getMonth(), date.getDate()) + UT * 3600e3);
}

/* ---------- Fonds de carte ---------- */
const LAYERS = {
  sat: { label: 'Sat', name: 'Satellite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 18, kb: 28,
    attr: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
  topo: { label: 'Topo', name: 'Topographique (OpenTopoMap)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub: 'abc', max: 17, kb: 22,
    attr: '© OpenTopoMap (CC-BY-SA) · © contributeurs OpenStreetMap' }
};
const TILE_CACHE = 'affut-tiles-v1';
const tileKey = u => u.replace(/\/\/[abc]\.tile\.opentopomap\.org/, '//tile.opentopomap.org');
function tileUrl(Ld, z, x, y) {
  return Ld.url.replace('{s}', Ld.sub ? Ld.sub[(x + y) % Ld.sub.length] : '').replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

const view = store.get('view', { c: [48.418, -71.25], z: 11 });
const map = L.map('map', { zoomControl: false, maxZoom: 19, tap: false }).setView(view.c, view.z);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
map.on('moveend', () => { const c = map.getCenter(); store.set('view', { c: [c.lat, c.lng], z: map.getZoom() }); if (!$('#sOff').hidden) updateOff(); });

let layerId = store.get('layer', 'sat'), baseLayer = null;
function setLayer(id) {
  if (baseLayer) map.removeLayer(baseLayer);
  const Ld = LAYERS[id];
  baseLayer = L.tileLayer(Ld.url, { maxZoom: 19, maxNativeZoom: Ld.max, subdomains: Ld.sub || 'abc', crossOrigin: true, attribution: Ld.attr }).addTo(map);
  baseLayer.bringToBack();
  layerId = id; store.set('layer', id);
  $('#bLayer').textContent = Ld.label;
  if (!$('#sOff').hidden) updateOff();
}
setLayer(LAYERS[layerId] ? layerId : 'sat');
$('#bLayer').onclick = () => { setLayer(layerId === 'sat' ? 'topo' : 'sat'); toast(LAYERS[layerId].name); };

/* ---------- GPS ---------- */
let me = null, follow = true, gpsHeading = null, compass = null, meMarker = null, accCircle = null;
const meIcon = L.divIcon({ className: 'me', html: '<div class="me-arrow"></div><div class="me-dot"></div>', iconSize: [44, 44], iconAnchor: [22, 22] });

function heading() { return compass ?? gpsHeading; }
function updateArrow() {
  const el = meMarker?.getElement()?.querySelector('.me-arrow'); const h = heading();
  if (el) { el.style.display = h == null ? 'none' : ''; if (h != null) el.style.transform = `rotate(${h}deg)`; }
  updateGuide();
}

function onPos(p) {
  const c = p.coords;
  me = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude, t: p.timestamp };
  if (c.heading != null && !isNaN(c.heading) && (c.speed ?? 0) > 0.8) gpsHeading = c.heading;
  const ll = [me.lat, me.lon];
  if (!meMarker) {
    accCircle = L.circle(ll, { radius: c.accuracy, className: 'acc', interactive: false }).addTo(map);
    meMarker = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000, keyboard: false }).addTo(map);
    if (follow) map.setView(ll, Math.max(map.getZoom(), 15));
    updateSun();
  } else {
    meMarker.setLatLng(ll); accCircle.setLatLng(ll).setRadius(c.accuracy);
    if (follow) map.panTo(ll, { animate: true });
  }
  updateHud(); recordPoint(); updateArrow();
}
function onErr(e) {
  $('#coord').textContent = e.code === 1 ? 'Localisation refusée — autorise-la pour ce site' : 'Signal GPS faible, nouvel essai…';
}
if ('geolocation' in navigator) navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
else $('#coord').textContent = "Cet appareil n'offre pas de GPS au navigateur";

function updateHud() {
  if (!me) return;
  $('#coord').textContent = fmtCoord(me.lat, me.lon);
  const a = $('#acc'); a.textContent = '±' + Math.round(me.acc) + ' m';
  a.className = 'pill ' + (me.acc <= 10 ? 'good' : me.acc <= 30 ? 'ok' : 'bad');
  $('#utm').textContent = toUTM(me.lat, me.lon);
  $('#alt').textContent = me.alt != null ? 'Alt. ' + Math.round(me.alt) + ' m' : '';
}
function updateSun() {
  const c = me || { lat: map.getCenter().lat, lon: map.getCenter().lng };
  const d = new Date(), r = sunTime(d, c.lat, c.lon, true), s = sunTime(d, c.lat, c.lon, false);
  if (!r || !s) { $('#sun').textContent = ''; return; }
  const h = 30 * 60e3;
  $('#sun').innerHTML = `Lever <b>${fmtTime(r)}</b> · Coucher <b>${fmtTime(s)}</b> · Tir permis* <b>${fmtTime(new Date(r - h))}–${fmtTime(new Date(+s + h))}</b>`;
}
updateSun(); setInterval(updateSun, 10 * 60e3);

/* Boussole */
let compassOn = false;
function onOrient(e) {
  let h = null;
  if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = (360 - e.alpha + (screen.orientation?.angle || 0)) % 360;
  if (h != null) { compass = h; updateArrow(); }
}
function startCompass() {
  if (compassOn) return; compassOn = true;
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onOrient); }).catch(() => {});
  } else if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onOrient);
  else addEventListener('deviceorientation', onOrient);
}
if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) startCompass();

function setFollow(on) { follow = on; $('#bFollow').classList.toggle('on', on); }
map.on('dragstart', () => setFollow(false));
$('#bFollow').onclick = () => {
  startCompass(); setFollow(true);
  if (me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 15)); else toast('En attente du signal GPS…');
};

/* Écran allumé */
let wake = null, wantWake = false;
async function getWake() {
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); return true; }
  catch (e) { return false; }
}
$('#bWake').onclick = async () => {
  wantWake = !wantWake;
  if (NATIVE) {
    NATIVE.setKeepScreenOn(wantWake);
    toast(wantWake ? "L'écran restera allumé" : 'Mise en veille normale');
    $('#bWake').classList.toggle('on', wantWake); return;
  }
  if (wantWake) {
    if (!('wakeLock' in navigator) || !(await getWake())) { wantWake = false; toast("Impossible de garder l'écran allumé sur cet appareil"); }
    else toast("L'écran restera allumé");
  } else { try { await wake?.release(); } catch (e) {} wake = null; toast('Mise en veille normale'); }
  $('#bWake').classList.toggle('on', wantWake);
};
document.addEventListener('visibilitychange', () => { if (wantWake && !wake && document.visibilityState === 'visible') getWake(); });

/* Réseau */
function updateNet() { $('#net').hidden = navigator.onLine; }
addEventListener('online', updateNet); addEventListener('offline', updateNet); updateNet();

/* ---------- Feuilles ---------- */
function openSheet(id) {
  $$('.sheet').forEach(s => s.hidden = s.id !== id);
  $$('#bar button').forEach(b => b.classList.remove('on'));
  const btn = { sPoint: '#bPoint', sList: '#bList', sOff: '#bOff' }[id]; if (btn) $(btn).classList.add('on');
}
function closeSheets() {
  $$('.sheet').forEach(s => s.hidden = true); $('#cross').hidden = true;
  $$('#bar button').forEach(b => b.classList.remove('on'));
  if (rec) $('#bRec').classList.add('on');
}
$$('.sheet .close').forEach(b => b.onclick = closeSheets);
function toggleSheet(id, open) { if (!$('#' + id).hidden) closeSheets(); else open(); }

/* Armer/confirmer une suppression (deux touches) */
function armConfirm(btn, label, fn) {
  if (btn.classList.contains('arm')) { fn(); return; }
  const old = btn.textContent; btn.classList.add('arm'); btn.textContent = label;
  setTimeout(() => { btn.classList.remove('arm'); btn.textContent = old; }, 3000);
}

/* ---------- Points ---------- */
const TYPES = {
  vehicule: { l: 'Véhicule', g: 'V', c: '#4da3ff' },
  camp: { l: 'Camp', g: 'C', c: '#b98cff' },
  mirador: { l: 'Mirador / cache', g: 'M', c: '#ff6a13' },
  piste: { l: 'Piste / frotté', g: 'P', c: '#f2c94c' },
  salines: { l: 'Saline / appât', g: 'S', c: '#6fd6c4' },
  abattage: { l: 'Abattage', g: 'A', c: '#ff4d4d' },
  autre: { l: 'Autre', g: '•', c: '#e6e6e6' }
};
let wpts = store.get('wpts', []);
const wLayer = L.layerGroup().addTo(map);
const wIcon = t => { const T = TYPES[t] || TYPES.autre; return L.divIcon({ className: 'wp', html: `<div class="wp-pin" style="--c:${T.c}"><span>${T.g}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 34], popupAnchor: [0, -30] }); };
function wpPopup(w) {
  const T = TYPES[w.type] || TYPES.autre;
  const d = me ? `<p class="mono">${fmtDist(dist(me.lat, me.lon, w.lat, w.lon))} · ${Math.round(bearing(me.lat, me.lon, w.lat, w.lon))}° ${card(bearing(me.lat, me.lon, w.lat, w.lon))}</p>` : '';
  return `<div class="pop"><b>${esc(w.name)}</b><small>${T.l} · ${fmtDate(w.t)}</small>${w.note ? `<p>${esc(w.note)}</p>` : ''}${d}<small class="mono">${fmtCoord(w.lat, w.lon)}</small><br><button data-guide="${w.id}">Me guider ici</button></div>`;
}
function drawW() {
  wLayer.clearLayers();
  wpts.forEach(w => L.marker([w.lat, w.lon], { icon: wIcon(w.type) }).bindPopup(() => wpPopup(w)).addTo(wLayer));
}
drawW();
document.addEventListener('click', e => { const g = e.target.closest('[data-guide]'); if (g) { map.closePopup(); startGuide(g.dataset.guide); } });

let pType = 'mirador', pWhere = 'me';
$('#pTypes').innerHTML = Object.entries(TYPES).map(([k, T]) => `<button class="chip" data-t="${k}"><span class="glyph" style="--c:${T.c}">${T.g}</span>${T.l}</button>`).join('');
function syncPoint() {
  $$('#pTypes .chip').forEach(c => c.classList.toggle('on', c.dataset.t === pType));
  $$('#pWhere button').forEach(b => b.classList.toggle('on', b.dataset.v === pWhere));
  $('#cross').hidden = pWhere !== 'center';
}
$('#pTypes').onclick = e => { const c = e.target.closest('.chip'); if (c) { pType = c.dataset.t; syncPoint(); } };
$('#pWhere').onclick = e => { const b = e.target.closest('button'); if (b) { pWhere = b.dataset.v; if (pWhere === 'center') setFollow(false); syncPoint(); } };
$('#bPoint').onclick = () => toggleSheet('sPoint', () => {
  pWhere = me ? 'me' : 'center'; if (!me) setFollow(false);
  $('#pName').value = ''; $('#pNote').value = ''; openSheet('sPoint'); syncPoint();
});
$('#pSave').onclick = () => {
  let lat, lon;
  if (pWhere === 'me') { if (!me) { toast('Pas encore de position GPS — utilise le centre de la carte'); return; } lat = me.lat; lon = me.lon; }
  else { const c = map.getCenter(); lat = c.lat; lon = c.lng; }
  const n = wpts.filter(w => w.type === pType).length + 1;
  const w = { id: uid(), type: pType, name: $('#pName').value.trim() || `${TYPES[pType].l} ${n}`, note: $('#pNote').value.trim(), lat: +lat.toFixed(6), lon: +lon.toFixed(6), t: Date.now() };
  wpts.push(w); store.set('wpts', wpts); drawW(); closeSheets(); toast('Point enregistré : ' + w.name);
};

/* ---------- Guidage ---------- */
let guideTo = store.get('guide', null), guideLine = null;
function startGuide(id) { guideTo = id; store.set('guide', id); closeSheets(); $('#guide').hidden = false; updateGuide(); const w = wpts.find(x => x.id === id); if (w && !me) map.setView([w.lat, w.lon], Math.max(map.getZoom(), 15)); }
function stopGuide() { guideTo = null; store.set('guide', null); $('#guide').hidden = true; if (guideLine) { map.removeLayer(guideLine); guideLine = null; } }
$('#gStop').onclick = stopGuide;
function updateGuide() {
  if (!guideTo) return;
  const w = wpts.find(x => x.id === guideTo); if (!w) { stopGuide(); return; }
  $('#guide').hidden = false; $('#gName').textContent = w.name;
  if (!me) { $('#gInfo').textContent = 'En attente du GPS…'; return; }
  const d = dist(me.lat, me.lon, w.lat, w.lon), b = bearing(me.lat, me.lon, w.lat, w.lon), h = heading();
  $('#gInfo').textContent = `${fmtDist(d)} · cap ${Math.round(b)}° ${card(b)}`;
  $('#gArrow').style.transform = `rotate(${h == null ? b : b - h}deg)`;
  $('#gArrow').title = h == null ? 'Flèche orientée par rapport au nord' : 'Flèche orientée selon ta direction';
  const pts = [[me.lat, me.lon], [w.lat, w.lon]];
  if (!guideLine) guideLine = L.polyline(pts, { color: '#ff6a13', weight: 3, dashArray: '8 8', interactive: false }).addTo(map);
  else guideLine.setLatLngs(pts);
}
if (guideTo) updateGuide();

/* ---------- Traces ---------- */
let tracks = store.get('tracks', []);
let rec = store.get('rec', null), recLine = null;
const tLayer = L.layerGroup().addTo(map);
function drawT() {
  tLayer.clearLayers();
  tracks.forEach(t => L.polyline(t.pts.map(p => [p[0], p[1]]), { color: '#f2c94c', weight: 3, opacity: .85 })
    .bindPopup(`<div class="pop"><b>${esc(t.name)}</b><small>${fmtDate(t.t)} · ${fmtDist(t.dist)}</small></div>`).addTo(tLayer));
}
drawT();
function recUi() {
  $('#recBadge').hidden = !rec; $('#bRec').classList.toggle('on', !!rec);
  $('#bRecTxt').textContent = rec ? 'Arrêter' : 'Trace';
  if (rec) $('#recDist').textContent = fmtDist(rec.dist);
}
function startRec(resume) {
  if (!resume) rec = { pts: [], dist: 0, t: Date.now() };
  recLine = L.polyline(rec.pts.map(p => [p[0], p[1]]), { color: '#ff5a4f', weight: 4 }).addTo(map);
  store.set('rec', rec); recUi();
  // Dans l'application Android, le GPS est enregistré par un service natif (écran éteint compris)
  if (NATIVE) { if (!resume) NATIVE.startTrack(true); else if (!NATIVE.isTracking()) NATIVE.startTrack(false); pullNative(); }
}
function pullNative() {
  if (!NATIVE || !rec || !recLine) return;
  let pts; try { pts = JSON.parse(NATIVE.trackPointsSince(rec.pts.length)); } catch (e) { return; }
  if (!pts.length) return;
  pts.forEach(p => {
    const last = rec.pts[rec.pts.length - 1];
    if (last) rec.dist += dist(last[0], last[1], p[0], p[1]);
    rec.pts.push(p); recLine.addLatLng([p[0], p[1]]);
  });
  $('#recDist').textContent = fmtDist(rec.dist); store.set('rec', rec);
}
if (NATIVE) {
  setInterval(pullNative, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullNative(); });
  window.__nativeResume = pullNative;
  window.__nativeBack = () => { if ($$('.sheet').some(x => !x.hidden)) { closeSheets(); return true; } return false; };
}
function recordPoint() {
  if (NATIVE) return;
  if (!rec || !me || me.acc > 35) return;
  const last = rec.pts[rec.pts.length - 1];
  if (last) { const d = dist(last[0], last[1], me.lat, me.lon); if (d < 5) return; rec.dist += d; }
  rec.pts.push([+me.lat.toFixed(6), +me.lon.toFixed(6), Date.now(), me.alt != null ? Math.round(me.alt) : null]);
  recLine.addLatLng([me.lat, me.lon]); $('#recDist').textContent = fmtDist(rec.dist);
  store.set('rec', rec);
}
if (rec) { startRec(true); toast('Enregistrement de trace repris'); }
$('#bRec').onclick = () => {
  if (!rec) { startRec(false); toast(me ? 'Enregistrement démarré' : 'Enregistrement démarré — en attente du GPS'); return; }
  pullNative();
  const mins = Math.round((Date.now() - rec.t) / 60000);
  $('#tSummary').textContent = `${fmtDist(rec.dist)} parcourus · ${rec.pts.length} points · ${mins} min`;
  $('#tName').value = 'Trace du ' + fmtDate(rec.t);
  openSheet('sTrack');
};
function endRec() { if (NATIVE) NATIVE.stopTrack(); if (recLine) map.removeLayer(recLine); recLine = null; rec = null; store.set('rec', null); recUi(); closeSheets(); }
$('#tResume').onclick = closeSheets;
$('#tDiscard').onclick = e => armConfirm(e.currentTarget, 'Confirmer ?', () => { endRec(); toast('Trace jetée'); });
$('#tSave').onclick = () => {
  pullNative();
  if (rec.pts.length < 2) { toast('Trace trop courte pour être enregistrée'); return; }
  tracks.push({ id: uid(), name: $('#tName').value.trim() || 'Trace', pts: rec.pts, dist: rec.dist, t: rec.t });
  store.set('tracks', tracks); drawT(); endRec(); toast('Trace enregistrée');
};

/* ---------- Liste ---------- */
let lTab = 'pts';
$('#lTabs').onclick = e => { const b = e.target.closest('button'); if (b) { lTab = b.dataset.v; renderList(); } };
$('#bList').onclick = () => toggleSheet('sList', () => { openSheet('sList'); renderList(); });
function renderList() {
  $$('#lTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === lTab));
  const ul = $('#lItems');
  if (lTab === 'pts') {
    if (!wpts.length) { ul.innerHTML = '<li class="empty">Aucun point. Touche « Point » pour marquer ton véhicule, un mirador ou une piste.</li>'; return; }
    const rows = wpts.map(w => ({ w, d: me ? dist(me.lat, me.lon, w.lat, w.lon) : null })).sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || b.w.t - a.w.t);
    ul.innerHTML = rows.map(({ w, d }) => {
      const T = TYPES[w.type] || TYPES.autre, b = me ? bearing(me.lat, me.lon, w.lat, w.lon) : null;
      return `<li><span class="glyph" style="--c:${T.c}">${T.g}</span><div class="meta"><b>${esc(w.name)}</b><small>${T.l} · ${fmtDate(w.t)}</small>${d != null ? `<div class="d">${fmtDist(d)} · ${Math.round(b)}° ${card(b)}</div>` : ''}</div>
        <div class="row-act"><button class="del" data-del="${w.id}">Supprimer</button><button data-see="${w.id}">Voir</button><button class="go" data-guide="${w.id}">Guider</button></div></li>`;
    }).join('');
  } else {
    if (!tracks.length) { ul.innerHTML = '<li class="empty">Aucune trace. Touche « Trace » pour enregistrer ton trajet.</li>'; return; }
    ul.innerHTML = [...tracks].reverse().map(t => `<li><span class="glyph" style="--c:#f2c94c">T</span><div class="meta"><b>${esc(t.name)}</b><small>${fmtDate(t.t)} · ${t.pts.length} points</small><div class="d">${fmtDist(t.dist)}</div></div>
      <div class="row-act"><button class="del" data-tdel="${t.id}">Supprimer</button><button data-tsee="${t.id}">Voir</button></div></li>`).join('');
  }
}
$('#lItems').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.see) { const w = wpts.find(x => x.id === b.dataset.see); setFollow(false); closeSheets(); map.setView([w.lat, w.lon], Math.max(map.getZoom(), 16)); }
  if (b.dataset.del) armConfirm(b, 'Confirmer ?', () => { wpts = wpts.filter(x => x.id !== b.dataset.del); store.set('wpts', wpts); drawW(); if (guideTo === b.dataset.del) stopGuide(); renderList(); });
  if (b.dataset.tsee) { const t = tracks.find(x => x.id === b.dataset.tsee); setFollow(false); closeSheets(); map.fitBounds(t.pts.map(p => [p[0], p[1]]), { padding: [40, 40] }); }
  if (b.dataset.tdel) armConfirm(b, 'Confirmer ?', () => { tracks = tracks.filter(x => x.id !== b.dataset.tdel); store.set('tracks', tracks); drawT(); renderList(); });
};

/* GPX */
function buildGpx() {
  const iso = t => new Date(t).toISOString();
  let s = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Affut GPS" xmlns="http://www.topografix.com/GPX/1/1">\n';
  wpts.forEach(w => { s += `<wpt lat="${w.lat}" lon="${w.lon}"><time>${iso(w.t)}</time><name>${esc(w.name)}</name>${w.note ? `<desc>${esc(w.note)}</desc>` : ''}<type>${esc((TYPES[w.type] || TYPES.autre).l)}</type></wpt>\n`; });
  tracks.forEach(t => {
    s += `<trk><name>${esc(t.name)}</name><trkseg>\n`;
    t.pts.forEach(p => { s += `<trkpt lat="${p[0]}" lon="${p[1]}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}${p[2] ? `<time>${iso(p[2])}</time>` : ''}</trkpt>\n`; });
    s += '</trkseg></trk>\n';
  });
  return s + '</gpx>\n';
}
$('#gpxOut').onclick = async () => {
  if (!wpts.length && !tracks.length) { toast('Rien à exporter pour le moment'); return; }
  const name = `chasse-${new Date().toISOString().slice(0, 10)}.gpx`;
  if (NATIVE) { NATIVE.shareFile(name, buildGpx(), 'application/gpx+xml'); return; }
  const file = new File([buildGpx()], name, { type: 'application/gpx+xml' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
};
const typeFromLabel = l => (Object.entries(TYPES).find(([, T]) => T.l === l) || ['autre'])[0];
$('#gpxIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const doc = new DOMParser().parseFromString(await f.text(), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error();
    const txt = (el, s) => el.getElementsByTagName(s)[0]?.textContent?.trim() || '';
    let nw = 0, nt = 0;
    [...doc.getElementsByTagName('wpt')].forEach(el => {
      const lat = +el.getAttribute('lat'), lon = +el.getAttribute('lon'); if (isNaN(lat) || isNaN(lon)) return;
      wpts.push({ id: uid(), type: typeFromLabel(txt(el, 'type')), name: txt(el, 'name') || 'Point importé', note: txt(el, 'desc'), lat, lon, t: Date.now() }); nw++;
    });
    [...doc.getElementsByTagName('trk'), ...doc.getElementsByTagName('rte')].forEach(el => {
      const pts = [...el.querySelectorAll('trkpt, rtept')].map(p => [+p.getAttribute('lat'), +p.getAttribute('lon'), Date.now(), null]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
      if (pts.length < 2) return;
      let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      tracks.push({ id: uid(), name: txt(el, 'name') || 'Trace importée', pts, dist: d, t: Date.now() }); nt++;
    });
    store.set('wpts', wpts); store.set('tracks', tracks); drawW(); drawT(); renderList();
    toast(`Importé : ${nw} point(s), ${nt} trace(s)`);
  } catch (err) { toast("Ce fichier n'est pas un GPX lisible"); }
};

/* ---------- Hors ligne ---------- */
let zones = store.get('zones', []);
const zLayer = L.layerGroup().addTo(map);
function drawZ() { zLayer.clearLayers(); zones.forEach(z => L.rectangle(z.b, { color: '#ff6a13', weight: 1, dashArray: '4 6', fill: false, interactive: false }).addTo(zLayer)); }
drawZ();
const MAX_TILES = 20000;
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2 * 2 ** z);
function ranges(b, z0, z1) {
  const r = [];
  for (let z = z0; z <= z1; z++) r.push({ z, x0: lon2x(b.getWest(), z), x1: lon2x(b.getEast(), z), y0: lat2y(b.getNorth(), z), y1: lat2y(b.getSouth(), z) });
  return r;
}
const countR = r => r.reduce((n, q) => n + (q.x1 - q.x0 + 1) * (q.y1 - q.y0 + 1), 0);
let dl = null;
function offZooms() { const Ld = LAYERS[layerId]; const zmin = Math.max(8, Math.min(Math.floor(map.getZoom()), Ld.max)); return { zmin, Ld }; }
function updateOff() {
  if (dl) return;
  const { zmin, Ld } = offZooms();
  $('#oLayer').textContent = Ld.name; $('#oZmin').textContent = zmin;
  const sel = $('#oZmax'), prev = +sel.value || Math.min(zmin + 3, Ld.max);
  sel.innerHTML = ''; for (let z = zmin; z <= Ld.max; z++) sel.add(new Option(z, z));
  sel.value = Math.min(Math.max(prev, zmin), Ld.max);
  const n = countR(ranges(map.getBounds(), zmin, +sel.value));
  $('#oCount').textContent = n.toLocaleString('fr-CA') + (n > MAX_TILES ? ' (trop)' : '');
  $('#oSize').textContent = '≈ ' + Math.max(1, Math.round(n * Ld.kb / 1024)).toLocaleString('fr-CA') + ' Mo';
  $('#oGo').disabled = n > MAX_TILES; $('#oGo').textContent = n > MAX_TILES ? 'Zone trop grande : zoome ou baisse le zoom max' : 'Télécharger cette zone';
  $('#oZones').textContent = zones.length;
  if (NATIVE) $('#oUsage').textContent = Math.round(+NATIVE.tileCacheBytes() / 1048576).toLocaleString('fr-CA') + ' Mo';
  else if (navigator.storage?.estimate) navigator.storage.estimate().then(e => { $('#oUsage').textContent = Math.round(e.usage / 1048576).toLocaleString('fr-CA') + ' Mo sur ' + Math.round(e.quota / 1048576).toLocaleString('fr-CA') + ' Mo'; });
}
$('#oZmax').onchange = updateOff;
$('#bOff').onclick = () => toggleSheet('sOff', () => { openSheet('sOff'); updateOff(); });
$('#oGo').onclick = async () => {
  if (!NATIVE && !('caches' in window)) { toast("Ce navigateur ne permet pas le stockage des cartes"); return; }
  if (!navigator.onLine) { toast('Connecte-toi à Internet pour télécharger la zone'); return; }
  if (!NATIVE) navigator.storage?.persist?.();
  const { zmin, Ld } = offZooms(), zmax = +$('#oZmax').value, b = map.getBounds(), rs = ranges(b, zmin, zmax), total = countR(rs);
  const queue = []; rs.forEach(q => { for (let x = q.x0; x <= q.x1; x++) for (let y = q.y0; y <= q.y1; y++) queue.push([q.z, x, y]); });
  const cache = NATIVE ? null : await caches.open(TILE_CACHE);
  dl = { stop: false, done: 0, err: 0 };
  $('#oProg').hidden = false; $('#oCancel').hidden = false; $('#oGo').disabled = true;
  const prog = () => { $('#oBar').style.width = (dl.done / total * 100) + '%'; $('#oProgTxt').textContent = `${dl.done.toLocaleString('fr-CA')} / ${total.toLocaleString('fr-CA')} tuiles${dl.err ? ` · ${dl.err} échec(s)` : ''}`; };
  let i = 0;
  async function worker() {
    while (!dl.stop && i < queue.length) {
      const [z, x, y] = queue[i++], url = tileUrl(Ld, z, x, y), key = tileKey(url);
      try {
        if (NATIVE) {
          // L'application garde chaque tuile sur le téléphone au passage
          const r = await fetch(url);
          if (r.ok) await r.arrayBuffer(); else dl.err++;
        } else if (!(await cache.match(key))) {
          const r = await fetch(url, { mode: 'cors' });
          if (r.ok) await cache.put(key, r); else dl.err++;
        }
      } catch (e) { dl.err++; }
      dl.done++; if (dl.done % 10 === 0 || dl.done === total) prog();
    }
  }
  prog();
  await Promise.all(Array.from({ length: 6 }, worker));
  const stopped = dl.stop, err = dl.err;
  if (!stopped) { zones.push({ b: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], layer: layerId, z: [zmin, zmax], t: Date.now() }); store.set('zones', zones); drawZ(); }
  dl = null; $('#oCancel').hidden = true; $('#oProg').hidden = true; updateOff();
  toast(stopped ? 'Téléchargement arrêté' : err ? `Zone téléchargée (${err} tuile(s) manquante(s))` : 'Zone disponible hors ligne');
};
$('#oCancel').onclick = () => { if (dl) dl.stop = true; };
$('#oClear').onclick = e => armConfirm(e.currentTarget, 'Confirmer : tout effacer ?', async () => {
  if (NATIVE) NATIVE.clearTiles(); else await caches.delete(TILE_CACHE); zones = []; store.set('zones', zones); drawZ(); updateOff(); toast('Cartes téléchargées effacées');
});

/* ---------- Service worker (mode hors ligne) ---------- */
if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
recUi();
