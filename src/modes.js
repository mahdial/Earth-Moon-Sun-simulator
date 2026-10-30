// The six teaching modes. Each mode supplies: panel HTML, layout (display transforms), labels, readouts and an inset.
// All user-visible text goes through t()/tl() (see i18n.js / dict.js).
import * as THREE from 'three';
import * as AS from './astro.js';
import * as U from './ui.js';
import { t, tl, getLang } from './i18n.js';
const { fa, sgn, pct, slider, check, setText, setHTML, fmtHM, fmtDayShortJ, fmtTimeTz, fmtLat, fmtLL, clamp, DEG } = U;

const V3 = THREE.Vector3;
const RE = AS.RE_KM, R_SUN = AS.R_SUN_KM / RE, R_MOON = AS.R_MOON_KM / RE;
const ARR = (v) => [v.x, v.y, v.z];
const wrap180 = (a) => ((a + 540) % 360) - 180;
const compass = (az) => tl('compass')[Math.round(((az % 360) + 360) % 360 / 45) % 8];
const zero = () => (getLang() === 'fa' ? '۰' : '0');

export const CITIES = [
  { id: 'tehran', lat: 35.69, lon: 51.39, tz: 'Asia/Tehran' },
  { id: 'mashhad', lat: 36.30, lon: 59.60, tz: 'Asia/Tehran' },
  { id: 'tabriz', lat: 38.08, lon: 46.29, tz: 'Asia/Tehran' },
  { id: 'shiraz', lat: 29.59, lon: 52.58, tz: 'Asia/Tehran' },
  { id: 'isfahan', lat: 32.65, lon: 51.67, tz: 'Asia/Tehran' },
  { id: 'london', lat: 51.51, lon: -0.13, tz: 'Europe/London' },
  { id: 'nyc', lat: 40.71, lon: -74.01, tz: 'America/New_York' },
  { id: 'tokyo', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
  { id: 'sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
  { id: 'capetown', lat: -33.92, lon: 18.42, tz: 'Africa/Johannesburg' },
  { id: 'quito', lat: -0.18, lon: -78.47, tz: 'America/Guayaquil' },
  { id: 'tromso', lat: 69.65, lon: 18.96, tz: 'Europe/Oslo' },
  { id: 'madrid', lat: 40.42, lon: -3.70, tz: 'Europe/Madrid' },
  { id: 'mexico', lat: 19.43, lon: -99.13, tz: 'America/Mexico_City' },
  { id: 'npole', lat: 89.9, lon: 0, tz: null },
  { id: 'spole', lat: -89.9, lon: 0, tz: null },
];
// display name of an observer, in the active language
export const obsName = (o) => {
  if (!o) return '';
  if (o.id === 'custom') return t(o.nameKey || 'c_picked');
  const i = CITIES.findIndex((c) => c.id === o.id);
  return i >= 0 ? tl('cities')[i] : (o.name || '');
};

const about = () => `<details class="about"><summary style="cursor:pointer;color:var(--mut);margin-top:14px">${t('about_h')}</summary><p style="font-size:12.5px;color:var(--mut)">${t('about_p')}</p></details>`;

function newD() {
  return {
    earth: null, moon: null,
    sun: { shaderPos: new V3(0, 0, 1e4), shaderR: R_SUN, pos: new V3(0, 0, 1e4), r: 1, glow: 1, sphere: false },
    eclEarth: false, eclMoon: false, cones: { earth: false, moon: false }, orbit: false, rays: null, helio: false,
    marker: false, grid: true, axis: true, pin: false, drop: false, sight: false, moonAxis: false, shadowPt: null,
  };
}

export function createModes(env) {
  const { S, W, rig } = env;
  const cam = W.camera;
  const o = S.opt;

  // ---------- shared helpers ----------
  function earthState(F, tilt = null, hold = false) {
    let M = F.earthM, axis = F.axis;
    if (tilt !== null && Math.abs(tilt - AS.OBLIQUITY) > 0.005) { const tt = AS.tiltedBasis(M, tilt); M = tt.M; axis = tt.axis; }
    if (hold) M = AS.holdSpin(M, axis, F.sunDir, 45);
    return { M, axis };
  }
  function realSunFields(D, F, sphere = true) {
    D.sun.shaderPos.set(...AS.scale(F.sunDir, F.sunDistRE)); D.sun.shaderR = R_SUN;
    D.sun.pos.copy(D.sun.shaderPos); D.sun.r = R_SUN; D.sun.glow = F.sunDistRE * 0.07; D.sun.sphere = sphere;
  }
  function farSunFields(D, F, dist, glow) {
    D.sun.shaderPos.set(...AS.scale(F.sunDir, F.sunDistRE)); D.sun.shaderR = R_SUN;
    D.sun.pos.set(...AS.scale(F.sunDir, dist)); D.sun.glow = glow; D.sun.sphere = false; D.sun.r = 1;
  }
  function shadowGeom(F, D) {
    const Dsun = F.sunDistRE;
    const dirE = AS.scale(F.sunDir, -1);
    const Lu = Dsun / (R_SUN - 1), Lp = Dsun / (R_SUN + 1);
    W.placeCone(W.earthUmbra, [0, 0, 0], dirE, 1, Lu);
    W.placeCone(W.earthPen, [0, 0, 0], dirE, 1, 0.4 * Lp);
    const mp = F.moonRE, sm = AS.sub(mp, AS.scale(F.sunDir, Dsun)), Dsm = AS.len(sm), dirM = AS.scale(sm, 1 / Dsm);
    const Lum = R_MOON * Dsm / (R_SUN - R_MOON), Lpm = R_MOON * Dsm / (R_SUN + R_MOON);
    W.placeCone(W.moonUmbra, mp, dirM, R_MOON, Lum);
    W.placeCone(W.moonPen, mp, dirM, R_MOON, 1.3 * Lpm);
    // where does the Moon's shadow axis meet the Earth?
    const b = AS.dot(mp, dirM), c = AS.dot(mp, mp) - 1, disc = b * b - c;
    let pt, hit = false, tHit = 0;
    if (disc >= 0) { tHit = -b - Math.sqrt(disc); hit = tHit > 0; }
    if (hit) pt = AS.add(mp, AS.scale(dirM, tHit)); else { const t0 = -b; pt = AS.norm(AS.add(mp, AS.scale(dirM, t0))); }
    const miss = Math.sqrt(Math.max(0, AS.dot(mp, mp) - b * b));
    D.shadowPt = { p: pt, hit, tHit, Lum, miss, dirM, Dsm };
  }
  const showOrbit = (D, F, kd, on) => {
    D.orbit = on;
    if (!on) return;
    W.updateOrbit(F.ms);
    W.orbitG.position.set(0, 0, 0); W.orbitG.scale.setScalar(kd);
    const rm = W.orbitState.rmean;
    W.eclDisc.scale.setScalar(rm * 1.22); W.eclRing.scale.setScalar(rm * 1.22);
    const ns = 0.09 / kd;
    for (const [mesh, p] of [[W.nodeA, W.orbitState.asc], [W.nodeD, W.orbitState.desc]]) { mesh.visible = !!p; if (p) { mesh.position.set(...p); mesh.scale.setScalar(ns); } }
  };
  function dropAndSight(D) {
    const mp = D.moon.pos;
    const a = W.dropLine.geometry.attributes.position; a.setXYZ(0, mp.x, mp.y, mp.z); a.setXYZ(1, mp.x, 0, mp.z); a.needsUpdate = true;
    const b = W.sightLine.geometry.attributes.position; b.setXYZ(0, D.earth.pos.x, D.earth.pos.y, D.earth.pos.z); b.setXYZ(1, mp.x, mp.y, mp.z); b.needsUpdate = true; W.sightLine.computeLineDistances();
  }
  const cityOptions = () => tl('cities').map((n, i) => `<option value="${CITIES[i].id}">${n}</option>`).join('') + `<option value="custom">${t('c_custom')}</option>`;
  const obsHTML = () => `<div class="row"><select id="citySel" aria-label="${t('c_place')}">${cityOptions()}</select><span id="obsTxt" style="color:var(--mut);font-size:12.5px"></span></div>`;
  function bindObs(root) {
    const sel = root.querySelector('#citySel'); if (!sel) return;
    sel.value = S.obs.id || 'custom';
    sel.onchange = () => { const c = CITIES.find((x) => x.id === sel.value); if (c) env.setObs(c); };
  }
  function obsUpdate() {
    const sel = document.getElementById('citySel'); if (sel && sel.value !== (S.obs.id || 'custom')) sel.value = S.obs.id || 'custom';
    setText('obsTxt', fmtLL(S.obs.lat, S.obs.lon));
  }
  const bindCommon = (root, pairs) => {
    for (const [id, key] of pairs) {
      const el = root.querySelector('#' + id); if (!el) continue;
      el.onchange = () => { o[key] = el.checked; env.dirty(); };
    }
  };
  const bindLabelsChk = (root) => { const el = root.querySelector('#o_labels'); if (el) el.onchange = (e) => { o.labels = e.target.checked; env.labels.enabled = o.labels; env.dirty(); }; };
  const bindSlider = (root, id, fn) => {
    const el = root.querySelector('#' + id); if (!el) return;
    const out = root.querySelector('#' + id + '_o'); const unit = out ? out.dataset.unit : '';
    el.oninput = () => { const v = +el.value; if (out) out.textContent = fa(v, +el.step < 1 ? 1 : 0) + unit; fn(v); env.dirty(); };
  };
  const act = (root, handler) => root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; handler(b.dataset.act, b.dataset, b); env.dirty();
  });

  const MODES = {};

  // =====================================================================================
  // 1. SEASONS
  // =====================================================================================
  const seasonCache = { year: null, ev: null, lam: null, apsides: null };
  function seasonEvents(year) {
    if (seasonCache.year !== year) {
      const s = AS.seasonsOfYear(year);
      seasonCache.ev = [s.mar_equinox, s.jun_solstice, s.sep_equinox, s.dec_solstice].map((x) => x.date.getTime());
      const y0 = Date.UTC(year, 0, 1), n = (Date.UTC(year + 1, 0, 1) - y0) / 864e5;
      seasonCache.lam = []; for (let i = 0; i < n; i++) seasonCache.lam.push(AS.sunLongitude(y0 + (i + 0.5) * 864e5));
      seasonCache.year = year; seasonCache.apsides = AS.earthApsides(year);
    }
    return seasonCache;
  }
  const ghostFrames = { key: '', list: [] };
  MODES.seasons = {
    id: 'seasons', label: 'm_seasons',
    enter() {
      S.rateIdx = 8; S.playing = true;
      this.view('overview', true);
      env.setInset('2d', 'i_daylen', '');
      W.setTilt(o.tilt);
    },
    view(v, imm) {
      if (v === 'overview') rig.setPreset({ theta: 0.45, phi: 1.02, r: 245, follow: () => new V3(0, 0, 0), lock: null, limits: { rMin: 14, rMax: 900 } }, imm);
      else rig.setPreset({ theta: 1.25, phi: 1.2, r: 30, follow: () => (env.D.earth ? env.D.earth.pos : new V3()), lock: () => env.F && new V3(...env.F.sunDir), limits: { rMin: 9, rMax: 900 } }, imm);
      S.seasonView = v;
    },
    html() {
      return `<h2>${t('s_h2')}</h2>
<p>${t('s_p1')}</p>
<div class="row"><button class="btn ${S.seasonView === 'earth' ? '' : 'on'}" data-act="vOverview">${t('s_vAll')}</button><button class="btn ${S.seasonView === 'earth' ? 'on' : ''}" data-act="vEarth">${t('s_vEarth')}</button></div>
<h3>${t('s_h3a')}</h3>
<ol><li>${t('s_li1')}</li><li>${t('s_li2')}</li><li>${t('s_li3')}</li></ol>
<div class="note">${t('s_note')}</div>
<h3>${t('s_h3b')}</h3>
<div class="row" id="seasonJumps"></div>
<h3>${t('s_h3c')}</h3>
${slider('tilt', t('s_tilt'), 0, 90, 0.1, o.tilt, '°')}
<div class="row"><button class="btn sm" data-act="tilt" data-v="0">${t('s_t0')}</button><button class="btn sm" data-act="tilt" data-v="23.4392911">${t('s_t23')}</button><button class="btn sm" data-act="tilt" data-v="45">${t('s_t45')}</button><button class="btn sm" data-act="tilt" data-v="90">${t('s_t90')}</button></div>
<h3>${t('c_live')}</h3>
<dl class="kv">
<dt>${t('s_rN')}</dt><dd id="r_sn">—</dd>
<dt>${t('s_rS')}</dt><dd id="r_ss">—</dd>
<dt>${t('s_rDec')}</dt><dd id="r_dec">—</dd>
<dt>${t('s_rDist')}</dt><dd id="r_dist">—</dd>
<dt>${t('s_rLen')}</dt><dd id="r_dl">—</dd>
<dt>${t('s_rNoon')}</dt><dd id="r_noon">—</dd></dl>
${slider('slat', t('s_lat'), -90, 90, 1, o.slat, '°')}
<div class="row"><button class="btn sm" data-act="lat" data-v="35.7">${t('s_lTeh')}</button><button class="btn sm" data-act="lat" data-v="0">${t('s_lEq')}</button><button class="btn sm" data-act="lat" data-v="-34">${t('s_lS34')}</button><button class="btn sm" data-act="lat" data-v="69.6">${t('s_lN70')}</button><button class="btn sm" data-act="lat" data-v="90">${t('s_lNP')}</button></div>
<h3>${t('c_show')}</h3>
${check('o_axis', t('s_cAxis'), o.axis)}${check('o_grid', t('s_cGrid'), o.grid)}${check('o_ghost', t('s_cGhost'), o.ghost)}${check('o_labels', t('c_labels'), o.labels)}
<div class="tip">${t('s_tip1')}</div>
<div class="tip">${t('s_tip2')}</div>${about()}`;
    },
    bind(root) {
      bindCommon(root, [['o_axis', 'axis'], ['o_grid', 'grid'], ['o_ghost', 'ghost']]); bindLabelsChk(root);
      bindSlider(root, 'tilt', (v) => { o.tilt = v; W.setTilt(v); });
      bindSlider(root, 'slat', (v) => { o.slat = v; });
      const setOn = (b) => root.querySelectorAll('[data-act=vOverview],[data-act=vEarth]').forEach((x) => x.classList.toggle('on', x === b));
      act(root, (a, d, b) => {
        if (a === 'vOverview') { this.view('overview'); setOn(b); }
        if (a === 'vEarth') { this.view('earth'); setOn(b); }
        if (a === 'tilt') { const e = root.querySelector('#tilt'); e.value = d.v; e.dispatchEvent(new Event('input')); }
        if (a === 'lat') { const e = root.querySelector('#slat'); e.value = d.v; e.dispatchEvent(new Event('input')); }
        if (a === 'ev') { env.setTime(+d.ms); env.setPlaying(false); }
      });
      this.jumpsYear = null;
    },
    layout(F) {
      const D = newD(); const K = 100;
      const pos = new V3(F.earthHelAU[0] * K, F.earthHelAU[1] * K, F.earthHelAU[2] * K);
      const hold = S.playing && env.rate() >= 86400;
      const es = earthState(F, o.tilt, hold);
      D.earth = { pos, s: 6, M: es.M, axis: es.axis };
      D.sun.shaderPos.set(0, 0, 0); D.sun.pos.set(0, 0, 0); D.sun.r = 14; D.sun.glow = 95; D.sun.sphere = true;
      D.helio = true; D.axis = o.axis; D.grid = o.grid;
      return D;
    },
    placeHelio(F, D) {
      const H = W.helio; const year = new Date(F.ms).getUTCFullYear(); const sc = seasonEvents(year);
      if (!H.orbitSet) {
        const pts = AS.earthOrbitPoints(Date.UTC(2026, 0, 1), 240); const a = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => a.set([p[0] * 100, p[1] * 100, p[2] * 100], i * 3));
        H.orbit.geometry.setAttribute('position', new THREE.BufferAttribute(a, 3)); H.orbit.geometry.computeBoundingSphere(); H.orbitSet = true;
      }
      const key = year + '|' + o.tilt.toFixed(2);
      if (ghostFrames.key !== key) {
        ghostFrames.key = key;
        ghostFrames.list = sc.ev.map((ms) => { const f = AS.frameAt(ms); const es = earthState(f, o.tilt, true); return { M: es.M, pos: new V3(f.earthHelAU[0] * 100, f.earthHelAU[1] * 100, f.earthHelAU[2] * 100), ms }; });
      }
      H.ghosts.forEach((g, i) => {
        const gf = ghostFrames.list[i]; const near = gf.pos.distanceTo(D.earth.pos) < 13;
        g.visible = o.ghost && !near;
        W.basisMatrix(gf.M, gf.pos, 3.6, g.matrix); g.matrixWorldNeedsUpdate = true;
      });
      const pa = D.earth.axis; const p = D.earth.pos;
      const a = H.polar.geometry.attributes.position; a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, p.x + pa[0] * 75, p.y + pa[1] * 75, p.z + pa[2] * 75); a.needsUpdate = true; H.polar.computeLineDistances();
      H.polar.visible = o.axis;
    },
    labels(F, D, L) {
      const sc = seasonEvents(new Date(F.ms).getUTCFullYear());
      L.add('sun', t('l_sun'), new V3(0, 17, 0), 'sun');
      L.add('earth', t('l_earth'), D.earth.pos.clone().add(new V3(0, 9, 0)), 'earth');
      if (o.ghost) ghostFrames.list.forEach((gf, i) => {
        if (gf.pos.distanceTo(D.earth.pos) < 13) return;
        L.add('g' + i, tl('ev_k')[i], gf.pos.clone().add(new V3(0, 6.5, 0)), 'tiny', `${fmtDayShortJ(sc.ev[i])} · ${tl('ev_sub')[i]}`);
      });
      if (o.axis) { const pa = D.earth.axis, p = D.earth.pos; L.add('pol', t('s_polaris'), new V3(p.x + pa[0] * 75, p.y + pa[1] * 75, p.z + pa[2] * 75), 'tiny'); }
      if (sc.apsides) sc.apsides.forEach((a, i) => {
        const hp = AS.helioWorldAt(AS.makeTime(a.ms)); L.add('aps' + i, t(i === 0 ? 's_peri' : 's_aph'), new V3(hp[0] * 100, hp[1] * 100 - 9, hp[2] * 100), 'tiny', fmtDayShortJ(a.ms));
      });
    },
    update(F) {
      const year = new Date(F.ms).getUTCFullYear(); const sc = seasonEvents(year);
      const jk = year + getLang();
      if (this.jumpsYear !== jk) {
        this.jumpsYear = jk;
        setHTML('seasonJumps', sc.ev.map((ms, i) => `<button class="btn sm" data-act="ev" data-ms="${ms}">${tl('ev_k')[i]}<small style="color:var(--mut)"> · ${fmtDayShortJ(ms)}</small></button>`).join(''));
      }
      const lam = AS.sunLongitude(F.ms); const q = Math.floor(((lam % 360) + 360) % 360 / 90);
      const sn = tl('seasonNames');
      setText('r_sn', sn[q]); setText('r_ss', sn[(q + 2) % 4]);
      const dec = AS.declinationFromLon(lam, o.tilt);
      setText('r_dec', `${sgn(dec, 1)}° ${t(dec >= 0 ? 's_north' : 's_south')}`);
      setText('r_dist', t('s_mkm', fa(F.sunDistKm / 1e6, 2)));
      setText('r_dl', fmtHM(AS.dayLengthHours(o.slat, dec)));
      setText('r_noon', `${fa(90 - Math.abs(o.slat - dec), 1)}°`);
    },
    insetKind: () => '2d',
    draw2d(g, w, h, F) {
      const year = new Date(F.ms).getUTCFullYear(); const sc = seasonEvents(year); const n = sc.lam.length;
      const pl = 30, pr = 8, pt = 28, pb = 22; const cw = w - pl - pr, ch = h - pt - pb;
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(5,8,18,.82)'; g.fillRect(0, 0, w, h);
      g.font = '10px system-ui,Tahoma'; g.textAlign = 'right'; g.fillStyle = '#8d9bc0'; g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
      for (const hh of [0, 6, 12, 18, 24]) { const y = pt + ch * (1 - hh / 24); g.beginPath(); g.moveTo(pl, y); g.lineTo(w - pr, y); g.stroke(); g.fillText(fa(hh), pl - 4, y + 3); }
      const y0 = Date.UTC(year, 0, 1), yl = Date.UTC(year + 1, 0, 1) - y0;
      g.textAlign = 'center';
      const sl = tl(w < 260 ? 'ev_abbr' : 'ev_short');
      sc.ev.forEach((ms, i) => { const x = pl + cw * (ms - y0) / yl; g.strokeStyle = i % 2 ? 'rgba(255,184,77,.35)' : 'rgba(92,200,255,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ch); g.stroke(); g.setLineDash([]); g.fillStyle = '#9fb0d8'; g.fillText(sl[i % 2], x, h - 8); });
      const dl = (i) => AS.dayLengthHours(o.slat, AS.declinationFromLon(sc.lam[i], o.tilt));
      g.beginPath(); for (let i = 0; i < n; i++) { const x = pl + cw * (i + 0.5) / n, y = pt + ch * (1 - dl(i) / 24); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = '#ffb84d'; g.lineWidth = 2; g.stroke();
      g.lineTo(pl + cw, pt + ch); g.lineTo(pl, pt + ch); g.closePath(); g.fillStyle = 'rgba(255,184,77,.16)'; g.fill();
      const idx = clamp(Math.floor((F.ms - y0) / 864e5), 0, n - 1); const cx = pl + cw * (idx + 0.5) / n, cy = pt + ch * (1 - dl(idx) / 24);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, pt); g.lineTo(cx, pt + ch); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
      g.textAlign = 'left'; g.fillStyle = '#ffd9a0'; g.font = '11px system-ui,Tahoma'; g.fillText(fmtLat(o.slat, 0), pl + 4, pt + 12);
    },
  };

  // =====================================================================================
  // 2. DAY & NIGHT
  // =====================================================================================
  const pathCache = { key: '', pts: [] };
  MODES.daynight = {
    id: 'daynight', label: 'm_daynight',
    enter() {
      S.rateIdx = 5; S.playing = true; this.setLock(o.lock || 'sun', true);
      env.setInset('2d', 'i_sunalt', '');
      env.setObs(S.obs);
    },
    setLock(l, imm) {
      o.lock = l;
      const F0 = () => env.F;
      if (l === 'sun') rig.setPreset({ theta: 1.1, phi: 1.25, r: 3.7, follow: () => new V3(), lock: () => F0() && new V3(...F0().sunDir), limits: { rMin: 1.4, rMax: 60 } }, imm);
      else if (l === 'obs') rig.setPreset({ theta: 0, phi: Math.PI / 2, r: 3.1, follow: () => new V3(), lock: () => { const f = F0(); if (!f) return null; const w = AS.worldFromLocal(f, AS.localFromLatLon(S.obs.lat, S.obs.lon)); return new V3(...w); }, limits: { rMin: 1.4, rMax: 60 } }, imm);
      else rig.setPreset({ theta: 0.9, phi: 1.2, r: 3.7, follow: () => new V3(), lock: null, limits: { rMin: 1.4, rMax: 60 } }, imm);
    },
    html() {
      return `<h2>${t('d_h2')}</h2>
<p>${t('d_p1')}</p>
<h3>${t('d_h3a')}</h3>${obsHTML()}
<div class="tip">${t('d_tip')}</div>
<h3>${t('d_h3b')}</h3>
<div class="seg" id="lockSeg"><button data-act="lock" data-v="sun">${t('d_lSun')}</button><button data-act="lock" data-v="obs">${t('d_lObs')}</button><button data-act="lock" data-v="free">${t('d_lFree')}</button></div>
<h3>${t('c_live')}</h3>
<dl class="kv"><dt>${t('d_rState')}</dt><dd id="r_state">—</dd><dt>${t('d_rSolar')}</dt><dd id="r_solar">—</dd><dt>${t('d_rClock')}</dt><dd id="r_clock">—</dd>
<dt>${t('d_rAlt')}</dt><dd id="r_alt">—</dd><dt>${t('d_rAz')}</dt><dd id="r_az">—</dd>
<dt>${t('d_rRise')}</dt><dd id="r_rise">—</dd><dt>${t('d_rSet')}</dt><dd id="r_set">—</dd><dt>${t('d_rLen')}</dt><dd id="r_len">—</dd>
<dt>${t('d_rSub')}</dt><dd id="r_sub">—</dd></dl>
<h3>${t('d_h3c')}</h3>
<ol><li>${t('d_q1')}</li><li>${t('d_q2')}</li></ol>
<h3>${t('c_show')}</h3>${check('o_grid', t('d_cGrid'), o.grid)}${check('o_axis', t('d_cAxis'), o.axis)}${check('o_rays', t('d_cRays'), o.rays)}${check('o_labels', t('c_labels'), o.labels)}${about()}`;
    },
    bind(root) {
      bindObs(root); bindCommon(root, [['o_grid', 'grid'], ['o_axis', 'axis'], ['o_rays', 'rays']]); bindLabelsChk(root);
      const sync = () => root.querySelectorAll('#lockSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === o.lock));
      sync();
      act(root, (a, d) => { if (a === 'lock') { this.setLock(d.v); sync(); } });
    },
    layout(F) {
      const D = newD(); const es = earthState(F);
      D.earth = { pos: new V3(), s: 1, M: es.M, axis: es.axis };
      farSunFields(D, F, 90, 26);
      D.pin = true; D.grid = o.grid; D.axis = o.axis;
      if (o.rays) D.rays = [{ c: [0, 0, 0], r: 1 }];
      return D;
    },
    labels(F, D, L) {
      const sd = new V3(...F.sunDir);
      L.add('sun', t('l_sun'), sd.clone().multiplyScalar(90).add(new V3(0, 8, 0)), 'sun');
      const pw = new V3(...AS.worldFromLocal(F, AS.localFromLatLon(S.obs.lat, S.obs.lon)));
      const facing = pw.dot(new V3().subVectors(cam.position, D.earth.pos)) > -0.1;
      if (facing) L.add('obs', obsName(S.obs), pw.multiplyScalar(1.1), 'earth');
      const nl = new V3(...AS.worldFromLocal(F, [0, 1.5, 0])); L.add('npole', t('l_npole'), nl, 'tiny');
    },
    sub(F) { return AS.latLonOf(AS.toLocalEarth(F, F.sunDir)); },
    update(F) {
      obsUpdate();
      const { lat, lon, tz } = S.obs;
      const sub = this.sub(F); const hs = AS.sunHorizon(F.ms, lat, lon);
      const st = tl('dn_states');
      setText('r_state', hs.alt > 0 ? st[0] : hs.alt > -6 ? st[1] : hs.alt > -12 ? st[2] : hs.alt > -18 ? st[3] : st[4]);
      const solar = (12 + wrap180(lon - sub.lon) / 15 + 24) % 24; const sh = Math.floor(solar), sm = Math.floor((solar - sh) * 60);
      setText('r_solar', `${fa(sh).padStart(2, zero())}:${fa(sm).padStart(2, zero())}`);
      setText('r_clock', fmtTimeTz(F.ms, tz, lon));
      setText('r_alt', `${sgn(hs.alt, 1)}°`); setText('r_az', `${fa(hs.az, 0)}° (${compass(hs.az)})`);
      setText('r_sub', fmtLL(sub.lat, sub.lon));
      const dec = AS.sunDeclination(F.ms); const dl = AS.dayLengthHours(lat, dec);
      setText('r_len', fmtHM(dl));
      const stt = AS.sunTimes(F.ms, lat, lon);
      if (dl <= 0) { setText('r_rise', t('d_polarNight')); setText('r_set', '—'); }
      else if (dl >= 24) { setText('r_rise', t('d_polarDay')); setText('r_set', '—'); }
      else { setText('r_rise', stt.rise ? fmtTimeTz(stt.rise, tz, lon) : '—'); setText('r_set', stt.set ? fmtTimeTz(stt.set, tz, lon) : '—'); }
    },
    insetKind: () => '2d',
    draw2d(g, w, h, F) {
      const { lat, lon } = S.obs; const lonOff = lon / 15 * 3600e3;
      const day = Math.floor((F.ms + lonOff) / 864e5);
      const key = day + '|' + lat.toFixed(2) + '|' + lon.toFixed(2);
      if (pathCache.key !== key) {
        pathCache.key = key; pathCache.pts = [];
        const t0 = day * 864e5 - lonOff;
        for (let i = 0; i <= 96; i++) pathCache.pts.push(AS.sunHorizon(t0 + i * 15 * 60e3, lat, lon).alt);
      }
      const pl = 28, pr = 8, pt = 28, pb = 22; const cw = w - pl - pr, ch = h - pt - pb;
      const amin = -40, amax = 90; const Y = (a) => pt + ch * (1 - (a - amin) / (amax - amin)); const X = (hh) => pl + cw * hh / 24;
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(5,8,18,.82)'; g.fillRect(0, 0, w, h);
      const band = (a0, a1, c) => { g.fillStyle = c; g.fillRect(pl, Y(a1), cw, Y(a0) - Y(a1)); };
      band(0, 90, 'rgba(90,150,255,.20)'); band(-6, 0, 'rgba(255,150,80,.20)'); band(-12, -6, 'rgba(120,80,200,.18)'); band(-18, -12, 'rgba(60,50,140,.20)'); band(-40, -18, 'rgba(0,0,0,.35)');
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(pl, Y(0)); g.lineTo(pl + cw, Y(0)); g.stroke();
      g.font = '10px system-ui,Tahoma'; g.fillStyle = '#8d9bc0'; g.textAlign = 'center';
      for (const hh of [0, 6, 12, 18, 24]) g.fillText(fa(hh), X(hh), h - 8);
      g.textAlign = 'right'; for (const a of [-30, 0, 30, 60, 90]) g.fillText(fa(a) + '°', pl - 3, Y(a) + 3);
      g.beginPath(); pathCache.pts.forEach((a, i) => { const x = X(i / 4), y = Y(a); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = '#ffd66b'; g.lineWidth = 2; g.stroke();
      const hs = AS.sunHorizon(F.ms, lat, lon); const solarH = ((F.ms + lonOff) % 864e5 + 864e5) % 864e5 / 36e5;
      const x = X(solarH), y = Y(hs.alt); g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ch); g.stroke();
      g.fillStyle = hs.alt > -0.8 ? '#fff3b0' : '#7b86a8'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
    },
    onTap(ll) { if (ll) env.setObs({ id: 'custom', nameKey: 'c_picked', lat: ll.lat, lon: ll.lon, tz: null }); },
  };

  // =====================================================================================
  // 3. MOON PHASES
  // =====================================================================================
  const PH_T = [0, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const phaseName = (a) => { const nm = tl('phaseNames'); let n = nm[0]; PH_T.forEach((tt, i) => { if (a >= tt) n = nm[i]; }); return n; };
  const EDU = { kd: 0.28, es: 1.8, ms: 0.62 };
  function eduLayout(F, real) {
    const D = newD(); const es = earthState(F);
    const k = real ? { kd: 1, es: 1, ms: R_MOON } : EDU;
    D.earth = { pos: new V3(), s: k.es, M: es.M, axis: es.axis };
    D.moon = { pos: new V3(...AS.scale(F.moonRE, k.kd)), s: k.ms, M: F.moonM };
    if (real) realSunFields(D, F, true); else farSunFields(D, F, 120, 34);
    D.kd = k.kd; D.real = real; return D;
  }
  function moonGLCam(F, D, fillFrac = 0.62) {
    const c = W.insetCam; const e = D.earth.pos, m = D.moon.pos; const dist = e.distanceTo(m);
    c.position.copy(e); c.up.set(...F.axis); c.lookAt(m);
    c.fov = 2 * Math.atan((D.moon.s / dist) / fillFrac) / DEG; c.near = Math.max(0.01, dist * 0.2); c.far = 2000; c.updateProjectionMatrix();
  }
  MODES.phases = {
    id: 'phases', label: 'm_phases',
    enter() {
      S.rateIdx = 6; S.playing = true; this.view(S.pview || 'top', true);
      env.setInset('gl', 'i_moonfromearth', 'i_moonfoot');
    },
    view(v, imm) {
      const real = o.real;
      const lim = real ? { rMin: 2, rMax: 400 } : { rMin: 5, rMax: 140 };
      const r = real ? 150 : 34;
      if (v === 'top') rig.setPreset({ theta: -Math.PI / 2, phi: 0.3, r, follow: () => new V3(), lock: () => env.F && new V3(...env.F.sunDir), limits: lim }, imm);
      else rig.setPreset({ theta: -Math.PI / 2, phi: 1.25, r, follow: () => new V3(), lock: () => env.F && new V3(...env.F.sunDir), limits: lim }, imm);
    },
    html() {
      return `<h2>${t('p_h2')}</h2>
<p>${t('p_p1')}</p>
<div class="seg"><button data-act="v" data-v="top" class="${S.pview === 'side' ? '' : 'on'}">${t('p_vTop')}</button><button data-act="v" data-v="side" class="${S.pview === 'side' ? 'on' : ''}">${t('p_vSide')}</button></div>
<h3>${t('c_live')}</h3>
<dl class="kv"><dt>${t('p_rPhase')}</dt><dd id="r_ph">—</dd><dt>${t('p_rIll')}</dt><dd id="r_il">—</dd><dt>${t('p_rAge')}</dt><dd id="r_age">—</dd>
<dt>${t('p_rDist')}</dt><dd id="r_md">—</dd><dt>${t('p_rAng')}</dt><dd id="r_ang">—</dd><dt>${t('p_rEl')}</dt><dd id="r_el">—</dd></dl>
<div class="row"><button class="btn sm" data-act="ph" data-v="0">${t('p_bNew')}</button><button class="btn sm" data-act="ph" data-v="90">${t('p_bFQ')}</button><button class="btn sm" data-act="ph" data-v="180">${t('p_bFull')}</button><button class="btn sm" data-act="ph" data-v="270">${t('p_bLQ')}</button></div>
<h3>${t('p_h3a')}</h3>
<ol><li>${t('p_li1')}</li><li>${t('p_li2')}</li><li>${t('p_li3')}</li><li>${t('p_li4')}</li></ol>
<div class="note">${t('p_note')}</div>
<div class="tip">${t('p_tip')}</div>
<h3>${t('c_show')}</h3>
${check('o_real', t('p_cReal'), o.real)}${check('o_rays', t('p_cRays'), o.rays)}${check('o_orbit', t('p_cOrbit'), o.orbit)}${check('o_labels', t('c_labels'), o.labels)}${about()}`;
    },
    bind(root) {
      bindCommon(root, [['o_rays', 'rays'], ['o_orbit', 'orbit']]); bindLabelsChk(root);
      root.querySelector('#o_real').onchange = (e) => { o.real = e.target.checked; this.view(S.pview || 'top'); env.dirty(); };
      act(root, (a, d, b) => {
        if (a === 'v') { S.pview = d.v; this.view(d.v); root.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b)); }
        if (a === 'ph') { env.setTime(AS.nextPhase(S.t, +d.v).date.getTime()); env.setPlaying(false); }
      });
    },
    layout(F) {
      const D = eduLayout(F, o.real); D.moonAxis = false; D.eclMoon = o.real; D.eclEarth = o.real;
      if (o.rays) D.rays = [{ c: ARR(D.earth.pos), r: D.earth.s }, { c: ARR(D.moon.pos), r: D.moon.s }];
      showOrbit(D, F, D.kd, o.orbit); D.drop = o.orbit; dropAndSight(D); D.sight = true;
      if (o.real) { shadowGeom(F, D); D.cones.earth = true; }
      D.grid = false; D.axis = false;
      return D;
    },
    labels(F, D, L) {
      if (!o.real) L.add('sun', t('l_sunArrow'), new V3(...F.sunDir).multiplyScalar(30), 'sun');
      L.add('earth', t('l_earth'), D.earth.pos.clone().add(new V3(0, D.earth.s * 1.25, 0)), 'earth');
      L.add('moon', t('l_moon'), D.moon.pos.clone().add(new V3(0, D.moon.s * 1.6, 0)), 'moon');
      if (o.orbit && W.orbitState.asc) { L.add('na', t('l_nodeA'), new V3(...AS.scale(W.orbitState.asc, D.kd)), 'tiny'); L.add('nd', t('l_nodeD'), new V3(...AS.scale(W.orbitState.desc, D.kd)), 'tiny'); }
    },
    update(F) {
      const ang = AS.moonPhaseAngle(F.ms); const ill = AS.moonIllumination(F.ms);
      setText('r_ph', phaseName(ang)); setText('r_il', pct(ill.phase_fraction * 100, 0));
      setText('r_age', t('p_days', fa(ang / 360 * AS.SYNODIC, 1)));
      setText('r_md', t('p_kkm', fa(F.moonDistKm / 1000, 0)));
      setText('r_ang', `${fa(2 * Math.atan(AS.R_MOON_KM / F.moonDistKm) / DEG, 2)}°`);
      const el = Math.acos(clamp(AS.dot(F.sunDir, F.moonDir), -1, 1)) / DEG; setText('r_el', `${fa(el, 0)}°`);
    },
    insetKind: () => 'gl', glCam(F, D) { moonGLCam(F, D); },
  };

  // =====================================================================================
  // 4. TIDAL LOCK
  // =====================================================================================
  const tidalSVG = () => `<svg viewBox="0 0 300 130" width="100%" role="img" aria-label="${t('t_svgAria')}"><rect width="300" height="130" rx="10" fill="rgba(255,255,255,.04)"/>
<circle cx="48" cy="65" r="30" fill="#2a6fc0"/><text x="48" y="108" fill="#bcd" font-size="11" text-anchor="middle">${t('l_earth')}</text>
<line x1="80" y1="65" x2="250" y2="65" stroke="#778" stroke-dasharray="3 3"/>
<g transform="translate(232 65)"><circle r="20" fill="#9a9aa6"/><ellipse rx="30" ry="17" fill="rgba(255,150,60,.45)" transform="rotate(-24)"/><circle r="3" cx="-20" fill="#ff4d4d"/></g>
<text x="232" y="108" fill="#ccd" font-size="11" text-anchor="middle">${t('l_moon')}</text>
<path d="M196 43 q-14 -2 -22 4" stroke="#ffcf7a" stroke-width="2" fill="none" marker-end="url(#a)"/><text x="150" y="30" fill="#ffcf7a" font-size="10.5" text-anchor="middle">${t('t_svgPull')}</text>
<path d="M252 30 q14 10 4 28" stroke="#7be0a4" stroke-width="2" fill="none" marker-end="url(#b)"/><text x="294" y="20" fill="#7be0a4" font-size="10.5" text-anchor="end">${t('t_svgTorque')}</text>
<defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#ffcf7a"/></marker><marker id="b" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#7be0a4"/></marker></defs></svg>`;
  MODES.tidal = {
    id: 'tidal', label: 'm_tidal',
    enter() {
      S.rateIdx = 6; S.playing = true; S.tidal.t0 = S.t; S.tidal.lam0 = null;
      this.view(false, true);
      env.setInset('gl', 'i_moonfromearth', 'i_redfoot');
    },
    view(follow, imm) {
      S.tidal.follow = follow;
      rig.setPreset({ theta: -Math.PI / 2, phi: 0.3, r: 40, follow: () => new V3(), lock: follow ? () => env.F && new V3(...env.F.moonDir) : () => env.F && new V3(...env.F.sunDir), limits: { rMin: 5, rMax: 140 } }, imm);
    },
    html() {
      const m = S.tidal.mode;
      const rad = (id) => `<label class="rad ${m === id ? 'on' : ''}" data-mode="${id}"><input type="radio" name="tmode" ${m === id ? 'checked' : ''}><div><b>${t('t_' + id + '_b')}</b><span>${t('t_' + id + '_s')}</span></div></label>`;
      return `<h2>${t('t_h2')}</h2>
<p>${t('t_p1')}</p>
<h3>${t('t_h3a')}</h3>
${rad('locked')}${rad('fixed')}${rad('daily')}
<h3>${t('t_h3b')}</h3>
<dl class="kv"><dt>${t('t_rOrb')}</dt><dd id="r_orb">—</dd><dt>${t('t_rSpin')}</dt><dd id="r_spin">—</dd><dt>${t('t_rFace')}</dt><dd id="r_face">—</dd></dl>
<div class="row"><button class="btn sm" data-act="reset">${t('t_reset')}</button></div>
${check('o_follow', t('t_cFollow'), S.tidal.follow)}${check('o_axis2', t('t_cAxis'), o.moonAxis)}${check('o_orbit', t('p_cOrbitShort'), o.orbit)}${check('o_labels', t('c_labels'), o.labels)}
<div class="tip">${t('t_tip')}</div>
<h3>${t('t_h3c')}</h3>
<p>${t('t_p2')}</p>
${tidalSVG()}
<ol><li>${t('t_li1')}</li><li>${t('t_li2')}</li></ol>${about()}`;
    },
    bind(root) {
      bindCommon(root, [['o_orbit', 'orbit']]); bindLabelsChk(root);
      root.querySelector('#o_axis2').onchange = (e) => { o.moonAxis = e.target.checked; env.dirty(); };
      root.querySelector('#o_follow').onchange = (e) => { this.view(e.target.checked); env.dirty(); };
      root.querySelectorAll('.rad').forEach((r) => r.addEventListener('click', () => {
        root.querySelectorAll('.rad').forEach((x) => { x.classList.toggle('on', x === r); x.querySelector('input').checked = x === r; });
        S.tidal.mode = r.dataset.mode; this.reset(); env.dirty();
      }));
      act(root, (a) => { if (a === 'reset') this.reset(); });
    },
    reset() { S.tidal.t0 = S.t; S.tidal.lam0 = null; },
    layout(F0) {
      // orientation depends on the hypothetical spin mode: recompute the frame with extra spin
      const T = S.tidal; const lam = Math.atan2(-F0.moonRE[2], F0.moonRE[0]);
      if (T.lam0 === null) T.lam0 = lam;
      let extra = 0;
      if (T.mode === 'fixed') extra = -(lam - T.lam0);
      else if (T.mode === 'daily') extra = -(lam - T.lam0) + 2 * Math.PI * (F0.ms - T.t0) / 864e5;
      const st = extra ? AS.moonStateAt(F0.ms, extra) : null;
      const F = st ? Object.assign({}, F0, { moonM: st.moonM }) : F0;
      const D = eduLayout(F, false); D.marker = true; D.moonAxis = o.moonAxis; D.sight = true; D.grid = false; D.axis = false;
      showOrbit(D, F, D.kd, o.orbit); dropAndSight(D); D.drop = false;
      D.rays = null; return D;
    },
    labels(F, D, L) {
      L.add('sun', t('l_sunArrow'), new V3(...F.sunDir).multiplyScalar(30), 'sun');
      L.add('earth', t('l_earth'), D.earth.pos.clone().add(new V3(0, D.earth.s * 1.25, 0)), 'earth');
      L.add('moon', t('l_moon'), D.moon.pos.clone().add(new V3(0, D.moon.s * 3.6, 0)), 'moon');
    },
    update(F, D) {
      const T = S.tidal; const days = (F.ms - T.t0) / 864e5;
      const orb = 360 * days / AS.SIDEREAL_MONTH; const spin = T.mode === 'locked' ? orb : T.mode === 'fixed' ? 0 : 360 * days;
      setText('r_orb', `${fa(orb, 0)}°`); setText('r_spin', `${fa(spin, 0)}°`);
      // which longitude faces the Earth?
      const M = D.moon.M; const u = AS.norm(AS.scale(F.moonRE, -1));
      const loc = [AS.dot(u, M[0]), AS.dot(u, M[1]), AS.dot(u, M[2])]; const ll = AS.latLonOf(loc);
      const dl = wrap180(ll.lon);
      setText('r_face', Math.abs(dl) < 25 ? t('t_faceSame') : t('t_faceOther', fa(Math.abs(dl), 0), t(dl > 0 ? 'dirEfull' : 'dirWfull')));
    },
    insetKind: () => 'gl', glCam(F, D) { moonGLCam(F, D, 0.7); },
  };

  // =====================================================================================
  // 5 & 6. ECLIPSES (shared helpers)
  // =====================================================================================
  const KIND_L = { total: 0, partial: 1, penumbral: 2 }; const CLS_L = { total: 't', partial: 'a', penumbral: 'p' };
  const KIND_S = { total: 0, annular: 1, partial: 2, hybrid: 3 }; const CLS_S = { total: 't', annular: 'a', partial: 'p', hybrid: 't' };
  let lunarList = null, solarList = null;
  function lists() {
    if (!lunarList) { lunarList = AS.lunarEclipses(Date.UTC(2025, 0, 1), 16); solarList = AS.solarEclipses(Date.UTC(2025, 0, 1), 16); }
  }
  function nextOfKind(list, kind, from) { return list.find((e) => e.kind === kind && e.ms > from) || list.find((e) => e.ms > from) || list[list.length - 1]; }
  function eclList(list, K, CLS, kindKey, sel) {
    const names = tl(kindKey);
    return list.map((e, i) => `<button data-act="ecl" data-i="${i}" class="${i === sel ? 'on' : ''}"><span>${U.fmtDateJnoWd(e.ms)}</span><span class="tag ${CLS[e.kind] || ''}">${K[e.kind] !== undefined ? names[K[e.kind]] : e.kind}</span></button>`).join('');
  }
  const scrollSel = () => { const b = document.querySelector('#eclList .on'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); };
  function shadowPlane(F) {
    const a = AS.scale(F.sunDir, -1); const m = F.moonRE; const x = AS.dot(m, a);
    const wv = AS.sub(m, AS.scale(a, x)); const e1 = AS.norm(AS.cross([0, 1, 0], a));
    const px = AS.dot(wv, e1), py = wv[1]; const d = Math.hypot(px, py);
    const ru = 1 - x * (R_SUN - 1) / F.sunDistRE, rp = 1 + x * (R_SUN + 1) / F.sunDistRE;
    return { x, px, py, d, ru, rp, umbralMag: (ru + R_MOON - d) / (2 * R_MOON), penMag: (rp + R_MOON - d) / (2 * R_MOON) };
  }

  // =====================================================================================
  // 5. LUNAR ECLIPSE
  // =====================================================================================
  MODES.lunar = {
    id: 'lunar', label: 'm_lunar',
    enter() {
      lists();
      const e = nextOfKind(lunarList, 'total', Date.now()); S.lun.sel = lunarList.indexOf(e);
      this.jump(e, true);
      this.setInsetUI();
    },
    setInsetUI() { const m = S.lun.inset === 'moon'; env.setInset(m ? 'gl' : '2d', m ? 'i_moonfromearth' : 'i_shadowsec', m ? 'i_shadowonmoon' : 'i_circles'); },
    jump(e, quiet) { env.setTime(e.ms - 150 * 60e3); S.rateIdx = 3; S.playing = true; env.setRateUI && env.setRateUI(); if (!quiet) this.refreshList(); this.view(S.lun.view || 'close', true); },
    refreshList() { setHTML('eclList', eclList(lunarList, KIND_L, CLS_L, 'kindsLunar', S.lun.sel)); scrollSel(); },
    view(v, imm) {
      S.lun.view = v; const F0 = () => env.F; const sunLock = () => F0() && new V3(...F0().sunDir);
      if (v === 'close') rig.setPreset({ theta: Math.PI / 2, phi: 1.05, r: 7, follow: () => (env.D.moon ? env.D.moon.pos : new V3()), lock: sunLock, limits: { rMin: 0.8, rMax: 400 } }, imm);
      else if (v === 'top') rig.setPreset({ theta: Math.PI / 2, phi: 0.1, r: 7, follow: () => (env.D.moon ? env.D.moon.pos : new V3()), lock: sunLock, limits: { rMin: 0.8, rMax: 400 } }, imm);
      else rig.setPreset({ theta: Math.PI / 2, phi: Math.PI / 2 - 0.12, r: 105, follow: () => (env.D.moon ? env.D.moon.pos.clone().multiplyScalar(0.5) : new V3()), lock: sunLock, limits: { rMin: 0.8, rMax: 600 } }, imm);
    },
    html() {
      lists();
      return `<h2>${t('l_h2')}</h2>
<p>${t('l_p1')}</p>
<ol><li>${t('l_li1')}</li><li>${t('l_li2')}</li><li>${t('l_li3')}</li></ol>
<div class="tip">${t('l_tip1')}</div>
<h3>${t('l_h3a')}</h3>
<div class="elist" id="eclList" style="max-height:200px;overflow:auto">${eclList(lunarList, KIND_L, CLS_L, 'kindsLunar', S.lun.sel)}</div>
<div class="row"><button class="btn sm" data-act="vclose">${t('l_vSide')}</button><button class="btn sm" data-act="vtop">${t('l_vTop')}</button><button class="btn sm" data-act="vwide">${t('l_vWide')}</button></div>
<h3>${t('c_live')}</h3>
<dl class="kv"><dt>${t('l_rState')}</dt><dd id="r_st">—</dd><dt>${t('l_rUm')}</dt><dd id="r_um">—</dd><dt>${t('l_rPm')}</dt><dd id="r_pm">—</dd>
<dt>${t('l_rOff')}</dt><dd id="r_off">—</dd><dt>${t('l_rLat')}</dt><dd id="r_lat">—</dd><dt>${t('l_rVis')}</dt><dd id="r_vis">—</dd></dl>
${obsHTML()}
<h3>${t('l_h3b')}</h3>
<p>${t('l_p2')}</p>
<h3>${t('l_h3c')}</h3>
<div class="seg" id="insSeg"><button data-act="ins" data-v="moon" class="${S.lun.inset === 'moon' ? 'on' : ''}">${t('l_insMoon')}</button><button data-act="ins" data-v="diagram" class="${S.lun.inset === 'diagram' ? 'on' : ''}">${t('l_insDiag')}</button></div>
${check('o_cones', t('l_cCones'), o.cones)}${check('o_orbit', t('l_cOrbit'), o.orbit)}${check('o_labels', t('c_labels'), o.labels)}
<div class="tip">${t('l_tip2')}</div>${about()}`;
    },
    bind(root) {
      bindObs(root); bindCommon(root, [['o_cones', 'cones'], ['o_orbit', 'orbit']]); bindLabelsChk(root);
      act(root, (a, d) => {
        if (a === 'ecl') { S.lun.sel = +d.i; this.jump(lunarList[+d.i]); }
        if (a === 'vclose') this.view('close'); if (a === 'vtop') this.view('top'); if (a === 'vwide') this.view('wide');
        if (a === 'ins') { S.lun.inset = d.v; root.querySelectorAll('#insSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); this.setInsetUI(); }
      });
      scrollSel();
    },
    layout(F) {
      const D = newD(); const es = earthState(F);
      D.earth = { pos: new V3(), s: 1, M: es.M, axis: es.axis }; D.moon = { pos: new V3(...F.moonRE), s: R_MOON, M: F.moonM };
      realSunFields(D, F, true); D.eclEarth = true; D.eclMoon = true;
      shadowGeom(F, D); D.cones.earth = o.cones; D.pin = true; D.grid = false; D.axis = false;
      showOrbit(D, F, 1, o.orbit); D.drop = o.orbit; dropAndSight(D); D.sight = false;
      return D;
    },
    labels(F, D, L) {
      L.add('earth', t('l_earth'), new V3(0, 2.2, 0), 'earth');
      L.add('moon', t('l_moon'), D.moon.pos.clone().add(new V3(0, 0.7, 0)), 'moon');
      L.add('toe', t('l_towardEarth'), D.moon.pos.clone().multiplyScalar(1 - 3.2 / D.moon.pos.length()), 'tiny');
      const a = AS.scale(F.sunDir, -1); L.add('um', t('l_umbra'), new V3(...AS.scale(a, 38)), 'tiny'); L.add('pm', t('l_penumbra'), new V3(...AS.add(AS.scale(a, 30), [0, 1.35, 0])), 'tiny');
      if (o.orbit && W.orbitState.asc) { L.add('na', t('l_nodeA'), new V3(...W.orbitState.asc), 'tiny'); L.add('nd', t('l_nodeD'), new V3(...W.orbitState.desc), 'tiny'); }
      L.add('sunl', t('l_sunDir'), new V3(...AS.scale(F.sunDir, 20)), 'sun');
    },
    update(F) {
      obsUpdate(); const sp = shadowPlane(F);
      const st = tl('l_states');
      setText('r_st', sp.umbralMag >= 1 ? st[0] : sp.umbralMag > 0 ? st[1] : sp.penMag > 0 ? st[2] : st[3]);
      setText('r_um', sp.umbralMag > 0 ? pct(Math.min(sp.umbralMag, 9.99) * 100, 0) : pct(0));
      setText('r_pm', sp.penMag > 0 ? pct(Math.min(sp.penMag, 9.99) * 100, 0) : pct(0));
      setText('r_off', t('l_offFmt', fa(sp.d * RE / 1000, 1), fa(sp.d / R_MOON, 1)));
      setText('r_lat', `${sgn(Math.asin(F.moonDir[1]) / DEG, 1)}°`);
      const mh = AS.moonHorizon(F.ms, S.obs.lat, S.obs.lon); setText('r_vis', t(mh.alt > 0 ? 'l_above' : 'l_below', fa(mh.alt, 0)));
    },
    insetKind: () => (S.lun.inset === 'moon' ? 'gl' : '2d'), glCam(F, D) { moonGLCam(F, D, 0.55); },
    draw2d(g, w, h, F) {
      const sp = shadowPlane(F); g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(5,8,18,.86)'; g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2 + 4; const sc = Math.min(w, h) * 0.42 / Math.max(1.4, sp.rp * 1.05);
      const circle = (x, y, r, fill, stroke) => { g.beginPath(); g.arc(cx + x * sc, cy - y * sc, r * sc, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };
      circle(0, 0, sp.rp, 'rgba(120,140,220,.22)', 'rgba(160,180,255,.6)'); circle(0, 0, sp.ru, 'rgba(60,70,120,.55)', 'rgba(200,210,255,.7)');
      const inU = clamp(sp.umbralMag, 0, 1), inP = clamp(sp.penMag, 0, 1);
      const col = `rgb(${Math.round(225 - inU * 40)},${Math.round(225 - inU * 130 - inP * 20)},${Math.round(235 - inU * 170 - inP * 20)})`;
      const mx = clamp(sp.px, -sp.rp * 3, sp.rp * 3), my = clamp(sp.py, -sp.rp * 3, sp.rp * 3);
      circle(mx, my, R_MOON, col, 'rgba(255,255,255,.7)');
      g.font = '10.5px system-ui,Tahoma'; g.fillStyle = '#b9c6ee'; g.textAlign = 'center'; g.fillText(t('l_penumbra'), cx, cy - sp.rp * sc - 4); g.fillText(t('l_umbra'), cx, cy + sp.ru * sc * 0.55);
      g.fillStyle = '#8d9bc0'; g.textAlign = 'right'; g.fillText(t('l_moonMotion'), w - 6, h - 20); g.textAlign = 'left'; g.fillText(t('l_axisNote'), 6, h - 6);
    },
  };

  // =====================================================================================
  // 6. SOLAR ECLIPSE
  // =====================================================================================
  MODES.solar = {
    id: 'solar', label: 'm_solar',
    enter() {
      lists();
      const e = nextOfKind(solarList, 'total', Date.now()); S.sol.sel = solarList.indexOf(e);
      this.jump(e, true);
      env.setInset('2d', 'i_skyview', '');
    },
    jump(e, quiet) {
      env.setObs({ id: 'custom', nameKey: 'o_maxpoint', lat: e.lat, lon: e.lon, tz: null });
      env.setTime(e.ms - 80 * 60e3); S.rateIdx = 2; S.playing = true; env.setRateUI && env.setRateUI();
      if (!quiet) this.refreshList(); this.view(S.sol.view || 'earth', true);
    },
    refreshList() { setHTML('eclList', eclList(solarList, KIND_S, CLS_S, 'kindsSolar', S.sol.sel)); scrollSel(); },
    view(v, imm) {
      S.sol.view = v; const F0 = () => env.F; const D0 = () => env.D;
      const spot = () => { const d = D0() && D0().shadowPt; return d ? new V3(...d.p) : new V3(); };
      const sunLock = () => F0() && new V3(...F0().sunDir);
      if (v === 'earth') rig.setPreset({ theta: 0, phi: Math.PI / 2, r: 3.4, follow: () => new V3(), lock: () => spot().clone().normalize(), limits: { rMin: 1.3, rMax: 400 } }, imm);
      else if (v === 'spot') rig.setPreset({ theta: 0, phi: Math.PI / 2, r: 0.55, follow: spot, lock: () => spot().clone().normalize(), limits: { rMin: 0.08, rMax: 400 } }, imm);
      else rig.setPreset({ theta: Math.PI / 2, phi: Math.PI / 2 - 0.12, r: 105, follow: () => (D0() && D0().moon ? D0().moon.pos.clone().multiplyScalar(0.5) : new V3()), lock: sunLock, limits: { rMin: 0.8, rMax: 600 } }, imm);
    },
    html() {
      lists();
      return `<h2>${t('o_h2')}</h2>
<p>${t('o_p1')}</p>
<div class="note">${t('o_warn')}</div>
<h3>${t('o_h3a')}</h3>
<p>${t('o_p2')}</p>
<h3>${t('l_h3a')}</h3>
<div class="elist" id="eclList" style="max-height:200px;overflow:auto">${eclList(solarList, KIND_S, CLS_S, 'kindsSolar', S.sol.sel)}</div>
<div class="row"><button class="btn sm" data-act="vearth">${t('o_vEarth')}</button><button class="btn sm" data-act="vspot">${t('o_vSpot')}</button><button class="btn sm" data-act="vwide">${t('l_vWide')}</button></div>
<h3>${t('o_h3b')}</h3>${obsHTML()}
<div class="tip">${t('o_tip1')}</div>
<dl class="kv"><dt>${t('o_rState')}</dt><dd id="r_st">—</dd><dt>${t('o_rObs')}</dt><dd id="r_ob">—</dd><dt>${t('d_rAlt')}</dt><dd id="r_alt">—</dd>
<dt>${t('o_rShadow')}</dt><dd id="r_sh">—</dd><dt>${t('o_rRatio')}</dt><dd id="r_ratio">—</dd><dt>${t('o_rDist')}</dt><dd id="r_md">—</dd></dl>
<h3>${t('o_h3c')}</h3>
<p>${t('o_p3')}</p>
${check('o_cones', t('o_cCones'), o.cones)}${check('o_orbit', t('l_cOrbit'), o.orbit)}${check('o_labels', t('c_labels'), o.labels)}
<div class="tip">${t('o_tip2')}</div>${about()}`;
    },
    bind(root) {
      bindObs(root); bindCommon(root, [['o_cones', 'cones'], ['o_orbit', 'orbit']]); bindLabelsChk(root);
      act(root, (a, d) => {
        if (a === 'ecl') { S.sol.sel = +d.i; this.jump(solarList[+d.i]); }
        if (a === 'vearth') this.view('earth'); if (a === 'vspot') this.view('spot'); if (a === 'vwide') this.view('wide');
      });
      scrollSel();
    },
    layout(F) {
      const D = newD(); const es = earthState(F);
      D.earth = { pos: new V3(), s: 1, M: es.M, axis: es.axis }; D.moon = { pos: new V3(...F.moonRE), s: R_MOON, M: F.moonM };
      realSunFields(D, F, true); D.eclEarth = true; D.eclMoon = true;
      shadowGeom(F, D); D.pin = true; D.grid = false; D.axis = false;
      D.cones.moon = o.cones && cam.position.length() > 6;
      showOrbit(D, F, 1, o.orbit); D.drop = o.orbit; dropAndSight(D); D.sight = false;
      return D;
    },
    labels(F, D, L) {
      L.add('moon', t('l_moon'), D.moon.pos.clone().add(new V3(0, 0.9, 0)), 'moon');
      L.add('earth', t('l_earth'), new V3(0, 1.9, 0), 'earth');
      const sp = D.shadowPt; if (sp) { const p = new V3(...sp.p); L.add('spot', sp.hit ? t(sp.tHit < sp.Lum ? 'o_lblTotal' : 'o_lblAnnular') : t('l_penumbra'), p.multiplyScalar(1.01), 'warn'); }
      const pw = new V3(...AS.worldFromLocal(F, AS.localFromLatLon(S.obs.lat, S.obs.lon)));
      if (pw.dot(new V3().subVectors(cam.position, D.earth.pos)) > 0) L.add('obs', obsName(S.obs) || t('o_observer'), pw.multiplyScalar(1.06), 'earth');
      if (o.orbit && W.orbitState.asc) { L.add('na', t('l_nodeA'), new V3(...W.orbitState.asc), 'tiny'); L.add('nd', t('l_nodeD'), new V3(...W.orbitState.desc), 'tiny'); }
    },
    update(F, D) {
      obsUpdate(); const sk = AS.sunMoonSky(F.ms, S.obs.lat, S.obs.lon); this.sky = sk;
      const ob = sk.obscuration;
      setText('r_ob', pct(ob * 100, ob > 0.995 ? 1 : 0)); setText('r_alt', `${sgn(sk.sunAlt, 1)}°`);
      const st = tl('o_states');
      setText('r_st', sk.sunAlt < -0.8 ? st[0] : ob <= 0 ? st[1] : ob >= 0.9995 && sk.rm >= sk.rs ? st[2] : sk.sep < sk.rs - sk.rm + 1e-7 && sk.rm < sk.rs ? st[3] : st[4]);
      const sp = D.shadowPt; const sh = tl('o_shadow');
      setText('r_sh', sp.hit ? (sp.tHit < sp.Lum ? sh[0] : sh[1]) : sp.miss < 1.3 ? sh[2] : sh[3]);
      setText('r_ratio', `${fa(sk.rm / sk.rs, 3)}`); setText('r_md', t('p_kkm', fa(F.moonDistKm / 1000, 0)));
    },
    insetKind: () => '2d',
    draw2d(g, w, h, F) {
      const sk = this.sky || AS.sunMoonSky(F.ms, S.obs.lat, S.obs.lon); const ob = sk.obscuration;
      g.clearRect(0, 0, w, h);
      const alt = sk.sunAlt; const dayK = clamp((alt + 6) / 14, 0, 1); const dim = Math.pow(1 - ob, 0.6);
      const k = dayK * (0.12 + 0.88 * dim);
      const top = `rgb(${Math.round(8 + 85 * k)},${Math.round(12 + 135 * k)},${Math.round(28 + 200 * k)})`, bot = `rgb(${Math.round(14 + 190 * k + (1 - dim) * 70 * dayK)},${Math.round(18 + 160 * k + (1 - dim) * 20 * dayK)},${Math.round(36 + 160 * k)})`;
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2 + 6; const R = Math.min(w, h) * 0.17; const pxr = R / sk.rs;
      if (ob > 0.97 && sk.rm >= sk.rs * 0.995) {
        const c = clamp((ob - 0.97) / 0.03, 0, 1); const cg = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 3.6);
        cg.addColorStop(0, `rgba(255,255,255,${0.9 * c})`); cg.addColorStop(0.15, `rgba(235,240,255,${0.5 * c})`); cg.addColorStop(1, 'rgba(180,200,255,0)'); g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, R * 3.6, 0, 7); g.fill();
        g.strokeStyle = `rgba(230,235,255,${0.35 * c})`; g.lineWidth = 1.2;
        for (let i = 0; i < 18; i++) { const a = i * 0.349 + 0.3, L = R * (1.6 + 1.4 * Math.abs(Math.sin(i * 2.7))); g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke(); }
      }
      if (alt > -1) {
        const sg = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R); sg.addColorStop(0, '#fffbe8'); sg.addColorStop(0.85, '#ffe27a'); sg.addColorStop(1, '#ffb43a');
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.fillStyle = sg; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
        g.restore();
        const mx = cx + sk.dx * pxr, my = cy - sk.dy * pxr, mr = sk.rm * pxr;
        g.fillStyle = '#05060b'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,200,120,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      } else { g.fillStyle = '#9fb0d8'; g.font = '12px system-ui,Tahoma'; g.textAlign = 'center'; g.fillText(t('o_sunBelow'), cx, cy); }
      g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, h - 22, w, 22); g.fillStyle = '#ffe9b5'; g.font = '12px system-ui,Tahoma'; g.textAlign = 'center';
      const cap = t('o_cap', pct(ob * 100, 0), fa(alt, 0)); let fs = 12;
      while (fs > 7 && (g.font = `${fs}px system-ui,Tahoma`, g.measureText(cap).width > w - 8)) fs--;
      g.fillText(cap, w / 2, h - 7);
    },
    onTap(ll) { if (ll) env.setObs({ id: 'custom', nameKey: 'c_picked', lat: ll.lat, lon: ll.lon, tz: null }); },
  };

  MODES.order = ['seasons', 'daynight', 'phases', 'tidal', 'lunar', 'solar'];
  return MODES;
}
