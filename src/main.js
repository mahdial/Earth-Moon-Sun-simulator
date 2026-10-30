import * as THREE from 'three';
import * as AS from './astro.js';
import { createWorld } from './world.js';
import { OrbitRig } from './controls.js';
import * as U from './ui.js';
import { createModes, CITIES } from './modes.js';
import { t, tl, detectLang, setLang, getLang, LANGS } from './i18n.js';

setLang(detectLang());

const { $, $$, fa, clamp, DEG } = U;
const V3 = THREE.Vector3;

const RATES = [1, 10, 60, 600, 3600, 10800, 86400, 259200, 864000, 2592000, 8640000];
const T_MIN = Date.UTC(1900, 0, 1), T_MAX = Date.UTC(2100, 11, 31);

const S = {
  t: Date.now(), playing: true, dir: 1, rateIdx: 8, mode: 'seasons',
  obs: { ...CITIES[0] },
  insetKind: 'none',
  opt: { axis: true, grid: true, rays: false, orbit: true, ghost: true, labels: true, tilt: AS.OBLIQUITY, slat: 35.7, real: false, lock: 'sun', moonAxis: false, cones: true },
  tidal: { mode: 'locked', t0: Date.now(), lam0: null, follow: false },
  lun: { sel: 0, view: 'close', inset: 'moon' }, sol: { sel: 0, view: 'earth' },
};

let errTimer = 0;
function showError(msg) { const e = $('#err'); e.style.display = 'block'; e.textContent = t('err_prefix', msg); clearTimeout(errTimer); errTimer = setTimeout(() => { e.style.display = 'none'; }, 7000); }
$('#err').addEventListener('click', () => { $('#err').style.display = 'none'; });
window.addEventListener('error', (e) => showError(e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && e.reason.message || e.reason)));

const canvas = $('#gl');
let W;
try { W = createWorld(canvas); } catch (e) { showError(t('err_webgl', e.message)); throw e; }
const rig = new OrbitRig(W.camera, canvas, {
  onTap: (x, y) => { const ll = pickEarth(x, y); const m = modes[S.mode]; if (m.onTap) { m.onTap(ll); dirty(); } },
  onInteract: () => dirty(),
  onKey: (e) => onKey(e),
});
const origSet = rig.setPreset.bind(rig);
rig.setPreset = (p, imm) => { rig._last = p; origSet(p, imm); };
const labels = new U.Labels($('#labels'));
const inset2d = new U.Inset2D($('#insetCanvas'));

let dirtyFrames = 3;
function dirty() { dirtyFrames = Math.max(dirtyFrames, 3); }

const env = {
  S, W, rig, labels, D: null, F: null, dirty, CITIES,
  rate: () => RATES[S.rateIdx],
  setTime(ms) { S.t = clamp(ms, T_MIN, T_MAX); dirty(); },
  setPlaying(b) { S.playing = b; syncPlay(); dirty(); },
  setRateUI() { syncRate(); syncPlay(); },
  setObs(c) {
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return;
    S.obs = { ...c, lat: clamp(c.lat, -90, 90), lon: ((c.lon + 540) % 360) - 180 }; W.setPin(S.obs.lat, S.obs.lon, true); dirty();
  },
  setInset(kind, titleKey, footKey) {
    S.insetKind = kind; S.insetKeys = [titleKey || '', footKey || '']; const el = $('#inset');
    el.style.display = kind === 'none' ? 'none' : 'block'; el.classList.toggle('gl', kind === 'gl');
    $('#insetCanvas').style.display = kind === '2d' ? 'block' : 'none';
    applyInsetText();
    requestAnimationFrame(() => { measure(); inset2d.resize(); dirty(); });
  },
};
function applyInsetText() {
  const k = S.insetKeys || ['', ''];
  $('#insetTitle').textContent = k[0] ? t(k[0]) : ''; $('#insetFoot').textContent = k[1] ? t(k[1]) : '';
}
const modes = createModes(env);

// ---------------- sizing ----------------
let vw = 1, vh = 1, PR = 1, insetRect = null;
const coarse = matchMedia('(pointer:coarse)').matches;
const PR_MAX = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
PR = PR_MAX;
function measure() {
  vw = window.innerWidth; vh = window.innerHeight;
  W.renderer.setPixelRatio(PR); W.renderer.setSize(vw, vh, false);
  W.camera.aspect = vw / vh;
  // keep the scene centred in the area that is not covered by the panel / dock
  const pr = $('#panel').getBoundingClientRect(), dk = $('#dock').getBoundingClientRect(), tb = $('#top').getBoundingClientRect();
  let fl = 0, fr = vw, ft = tb.height, fb = vh;
  if (vw > 860) { fr = pr.left; fb = dk.top; } else { ft = Math.max(ft, dk.bottom); fb = pr.top; }
  const ox = vw / 2 - (fl + fr) / 2, oy = vh / 2 - (ft + fb) / 2;
  if (Math.abs(ox) > 1 || Math.abs(oy) > 1) W.camera.setViewOffset(vw, vh, ox, oy, vw, vh); else W.camera.clearViewOffset();
  W.camera.updateProjectionMatrix();
  const r = $('#inset').getBoundingClientRect(); insetRect = r.width > 4 ? r : null;
  const dock = $('#dock').getBoundingClientRect(); document.documentElement.style.setProperty('--dockH', Math.round(dock.height) + 'px');
  W.stars.material.uniforms.uPR.value = PR;
  dirty();
}
window.addEventListener('resize', () => { measure(); inset2d.resize(); });
if (window.ResizeObserver) new ResizeObserver(() => { measure(); }).observe($('#dock'));

// ---------------- picking ----------------
function pickEarth(x, y) {
  const D = env.D; if (!D || !D.earth) return null;
  const cam = W.camera;
  const p = new V3(x / vw * 2 - 1, -(y / vh) * 2 + 1, 0.5).unproject(cam); const dir = p.sub(cam.position).normalize();
  const c = D.earth.pos, r = D.earth.s; const oc = cam.position.clone().sub(c);
  const b = oc.dot(dir), cc = oc.lengthSq() - r * r, disc = b * b - cc; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc); if (t < 0) return null;
  const q = cam.position.clone().addScaledVector(dir, t).sub(c).divideScalar(r);
  return AS.latLonOf(AS.toLocalEarth({ earthM: D.earth.M }, [q.x, q.y, q.z]));
}

// ---------------- layout application ----------------
function applyLayout(D, F) {
  const { earthG, moonG } = W;
  if (D.earth) {
    earthG.visible = true; W.basisMatrix(D.earth.M, D.earth.pos, D.earth.s, earthG.matrix); earthG.matrixWorldNeedsUpdate = true;
    W.atmoU.uCenter.value.copy(D.earth.pos);
  } else earthG.visible = false;
  if (D.moon) { moonG.visible = true; W.basisMatrix(D.moon.M, D.moon.pos, D.moon.s, moonG.matrix); moonG.matrixWorldNeedsUpdate = true; } else moonG.visible = false;
  const eu = W.earthU, mu = W.moonU;
  eu.uSunPos.value.copy(D.sun.shaderPos); mu.uSunPos.value.copy(D.sun.shaderPos); W.atmoU.uSunPos.value.copy(D.sun.shaderPos);
  eu.uSunR.value = D.sun.shaderR; mu.uSunR.value = D.sun.shaderR;
  eu.uEclipse.value = D.eclEarth && D.moon ? 1 : 0; mu.uEclipse.value = D.eclMoon && D.earth ? 1 : 0;
  if (D.moon) { eu.uOccPos.value.copy(D.moon.pos); eu.uOccR.value = D.moon.s; }
  if (D.earth) { mu.uOccPos.value.copy(D.earth.pos); mu.uOccR.value = D.earth.s; }
  W.sunMesh.visible = D.sun.sphere; W.sunMesh.position.copy(D.sun.pos); W.sunMesh.scale.setScalar(D.sun.r);
  W.glow.position.copy(D.sun.pos); W.glow.scale.setScalar(D.sun.glow);
  W.helio.group.visible = D.helio; if (D.helio) modes.seasons.placeHelio(F, D);
  if (D.pin && D.earth) { const alt = W.camera.position.distanceTo(D.earth.pos) - D.earth.s; W.pin.scale.setScalar(clamp(alt / (2.4 * D.earth.s), 0.05, 1.6)); }
  W.axisG.visible = D.axis; W.gridG.visible = D.grid; W.pin.visible = D.pin; W.marker.visible = D.marker; W.moonAxis.visible = D.moonAxis;
  W.coneG.visible = D.cones.earth || D.cones.moon; W.earthUmbra.visible = W.earthPen.visible = D.cones.earth; W.moonUmbra.visible = W.moonPen.visible = D.cones.moon;
  W.orbitG.visible = D.orbit; W.dropLine.visible = D.drop; W.sightLine.visible = D.sight;
  W.rays.visible = !!D.rays; if (D.rays) W.setRays(F.sunDir, D.rays);
}

// ---------------- time UI ----------------
const elPlay = $('#play'), elSpd = $('#spd'), elSpdLab = $('#spdLab'), elDate = $('#dateIn');
function syncPlay() { elPlay.textContent = S.playing ? '❚❚' : '▶'; $('#rev').classList.toggle('on', S.dir < 0); }
function syncRate() { elSpd.value = S.rateIdx; elSpdLab.textContent = tl('rates')[S.rateIdx] + (S.dir < 0 ? t('rev_suffix') : ''); }
elPlay.onclick = () => { S.playing = !S.playing; syncPlay(); dirty(); };
$('#rev').onclick = () => { S.dir = -S.dir; S.playing = true; syncPlay(); syncRate(); dirty(); };
elSpd.oninput = () => { S.rateIdx = +elSpd.value; syncRate(); dirty(); };
$$('#dock [data-step]').forEach((b) => b.addEventListener('click', () => { env.setTime(S.t + +b.dataset.step); }));
$('#now').onclick = () => { env.setTime(Date.now()); };
elDate.onchange = () => { const d = new Date(elDate.value); if (!isNaN(d)) env.setTime(d.getTime()); };
$('#zin').onclick = () => { rig.zoomBy(0.7); dirty(); };
$('#zout').onclick = () => { rig.zoomBy(1 / 0.7); dirty(); };
$('#zreset').onclick = () => { if (rig._last) origSet(rig._last, false); dirty(); };
$('.when').addEventListener('click', () => $('#dock').classList.toggle('expanded'));
$('#sheetToggle').onclick = () => { const p = $('#panel'); p.classList.toggle('collapsed'); $('#sheetToggle').setAttribute('aria-expanded', String(!p.classList.contains('collapsed'))); setTimeout(measure, 280); };

let lastWhen = 0;
function updateWhen() {
  const ms = Math.round(S.t / 1000) * 1000; if (ms === lastWhen) return; lastWhen = ms;
  $('#whenJ').textContent = `${U.fmtDateJ(ms)} — ${U.fmtTimeLocal(ms)}`;
  $('#whenG').textContent = U.fmtUTC(ms);
  if (document.activeElement !== elDate) elDate.value = U.localInputValue(ms);
}

// ---------------- modes / tabs ----------------
const tabs = $('#tabs');
modes.order.forEach((id) => {
  const b = document.createElement('button'); b.dataset.id = id; b.onclick = () => setMode(id); tabs.appendChild(b);
});
const retitleTabs = () => $$('#tabs button').forEach((b) => { b.textContent = t(modes[b.dataset.id].label); });

// ---------------- language ----------------
function applyStatic() {
  const d = document;
  d.title = t('doc_title');
  const md = d.querySelector('meta[name=description]'); if (md) md.setAttribute('content', t('doc_desc'));
  $$('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  $$('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  $$('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
  const st = tl('steps_txt'), sti = tl('steps_title');
  $$('#dock [data-step]').forEach((b, i) => { b.textContent = st[i]; b.title = sti[i]; });
  retitleTabs();
}
function renderPanel() {
  const m = modes[S.mode]; const pb = $('#panelBody'); const sc = pb.scrollTop;
  labels.clear(); pb.innerHTML = m.html(); m.bind(pb); pb.scrollTop = sc;
  applyInsetText(); obsRefresh(); lastWhen = 0; syncRate(); updateWhen(); dirty();
}
const obsRefresh = () => { try { W.setPin(S.obs.lat, S.obs.lon, true); } catch (e) { /* ignore */ } };
function changeLang(l) {
  setLang(l); const sel = $('#lang'); if (sel) sel.value = getLang();
  applyStatic(); if (modes.seasons) modes.seasons.jumpsYear = null; renderPanel();
  setTimeout(measure, 50);
}
(() => {
  const sel = $('#lang'); if (!sel) return;
  sel.innerHTML = Object.keys(LANGS).map((k) => `<option value="${k}">${LANGS[k].name}</option>`).join('');
  sel.value = getLang(); sel.onchange = () => changeLang(sel.value);
})();
function setMode(id) {
  if (!modes[id]) id = 'seasons';
  S.mode = id; labels.clear(); const m = modes[id];
  $('#panelBody').innerHTML = m.html(); $('#panelBody').scrollTop = 0; m.bind($('#panelBody'));
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  W.setPin(S.obs.lat, S.obs.lon, true);
  m.enter(); syncRate(); syncPlay(); updateWhen();
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
  const act = $(`#tabs button[data-id=${id}]`); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  measure(); inset2d.resize(); dirty();
}
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName; const inCtl = tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT';
  if (e.code === 'Space') { if (inCtl) return; e.preventDefault(); S.playing = !S.playing; syncPlay(); dirty(); return; }
  if (inCtl && tag !== 'BUTTON') return;
  if (e.key === ']') { S.rateIdx = Math.min(RATES.length - 1, S.rateIdx + 1); syncRate(); dirty(); }
  else if (e.key === '[') { S.rateIdx = Math.max(0, S.rateIdx - 1); syncRate(); dirty(); }
  else if (e.code === 'KeyR') { if (rig._last) origSet(rig._last, false); dirty(); }
  else if (e.code === 'KeyN') env.setTime(Date.now());
  else if (/^Digit[1-6]$/.test(e.code)) setMode(modes.order[+e.code.slice(5) - 1]);
}

// ---------------- render loop ----------------
let last = performance.now(), ema = 16, slow = 0, lastUI = 0;
const insetVis = () => [W.earthG, W.coneG, W.rays, W.orbitG, W.dropLine, W.sightLine, W.helio.group, W.glow, W.sunMesh, W.pin];
function renderInset(F, D, m) {
  if (!insetRect || !m.glCam) return;
  m.glCam(F, D);
  const hid = insetVis(); const saved = hid.map((o) => o.visible); hid.forEach((o) => { o.visible = false; });
  const mk = W.marker.visible; if (!D.marker) W.marker.visible = false;
  W.markerExtras.forEach((o) => { o.visible = false; });
  const r = insetRect; const R = W.renderer;
  R.setScissorTest(true); R.setViewport(r.left, vh - r.bottom, r.width, r.height); R.setScissor(r.left, vh - r.bottom, r.width, r.height);
  W.stars.position.copy(W.insetCam.position);
  R.render(W.scene, W.insetCam);
  R.setScissorTest(false); R.setViewport(0, 0, vw, vh);
  hid.forEach((o, i) => { o.visible = saved[i]; }); W.marker.visible = mk; W.markerExtras.forEach((o) => { o.visible = true; });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const settling = rig.isSettling();
  if (S.playing) { S.t = clamp(S.t + S.dir * RATES[S.rateIdx] * 1000 * dt, T_MIN, T_MAX); if (S.t <= T_MIN || S.t >= T_MAX) { S.playing = false; syncPlay(); } }
  if (!S.playing && !settling && dirtyFrames <= 0) return;
  if (dirtyFrames > 0) dirtyFrames--;
  const t0 = performance.now();

  const m = modes[S.mode];
  const F = AS.frameAt(S.t); env.F = F;
  const D = m.layout(F); env.D = D;
  applyLayout(D, F);
  rig.update(dt);
  W.scene.updateMatrixWorld();
  const cam = W.camera;

  W.renderer.setScissorTest(false); W.renderer.setViewport(0, 0, vw, vh);
  W.stars.position.copy(cam.position);
  W.renderer.render(W.scene, cam);
  if (S.insetKind === 'gl') renderInset(F, D, m);
  else if (S.insetKind === '2d' && m.draw2d) m.draw2d(inset2d.resize(), inset2d.w, inset2d.h, F, D);

  labels.begin(); if (o_labels()) m.labels(F, D, { add: (id, text, pos, cls, sub) => labels.add(id, text, pos, cls, sub, cam, vw, vh) }); labels.end();
  updateWhen();
  if (now - lastUI > 120) { lastUI = now; m.update(F, D); }

  // adaptive resolution
  const ft = performance.now() - t0 + 0; ema = ema * 0.94 + (dt * 1000) * 0.06;
  if (S.playing && ema > 30 && PR > 1) { slow++; if (slow > 45) { PR = Math.max(1, PR * 0.8); slow = 0; ema = 16; measure(); } } else slow = Math.max(0, slow - 1);
}
const o_labels = () => S.opt.labels;

// ---------------- start ----------------
(async function start() {
  try {
    applyStatic();   // translate the static page (loader, buttons, tabs) before the textures load
    measure();
    await W.loadAll();
    const id = (location.hash || '').replace('#', '');
    S.mode = modes[id] && modes.order.includes(id) ? id : 'seasons';
    labels.enabled = S.opt.labels;
    applyStatic();
    setMode(S.mode);
    W.setPin(S.obs.lat, S.obs.lon, true);
    syncRate(); syncPlay();
    requestAnimationFrame((n) => { last = n; frame(n); });
    const L = $('#loader'); L.style.opacity = 0; setTimeout(() => L.remove(), 600);
    window.__ready = true;
  } catch (e) { showError(e.message || String(e)); console.error(e); }
})();
window.addEventListener('hashchange', () => { const id = location.hash.replace('#', ''); if (modes.order.includes(id) && id !== S.mode) setMode(id); });
setTimeout(() => { const h = $('#hint'); if (h) h.style.opacity = 0; }, 16000);
window.__sim = { S, env, setMode, W, rig, AS, changeLang };
