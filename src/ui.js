// UI helpers: locale-aware formatting, DOM labels, small 2-D canvases.
import * as THREE from 'three';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const DEG = Math.PI / 180;

import { t, getLang, locale } from './i18n.js';

// number formatting follows the active language (Persian digits for fa)
export const fa = (n, d = 0) => {
  if (!isFinite(n)) return '—';
  return Number(n).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
};
export const sgn = (n, d = 1) => (n >= 0 ? '+' : '−') + fa(Math.abs(n), d);
export const pct = (v, d = 0) => fa(v, d) + (getLang() === 'fa' ? '٪' : '%');
export const fmtLat = (lat, d = 1) => `${fa(Math.abs(lat), d)}° ${t(lat >= 0 ? 'dirN' : 'dirS')}`;
export const fmtLon = (lon, d = 1) => `${fa(Math.abs(lon), d)}° ${t(lon >= 0 ? 'dirE' : 'dirW')}`;
export const fmtLL = (lat, lon, d = 1) => `${fmtLat(lat, d)}${getLang() === 'fa' ? '، ' : ', '}${fmtLon(lon, d)}`;

const dfCache = {};
function df(kind) {
  const l = getLang(); const k = l + kind; if (dfCache[k]) return dfCache[k];
  const loc = l === 'fa' ? 'fa-IR-u-ca-persian' : locale();
  const opts = { full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }, nowd: { year: 'numeric', month: 'long', day: 'numeric' }, short: { month: 'long', day: 'numeric' } }[kind];
  let f; try { f = new Intl.DateTimeFormat(loc, opts); } catch (e) { f = new Intl.DateTimeFormat(locale(), opts); }
  return (dfCache[k] = f);
}
const jp = (f, ms) => { const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value; return p; };
export const fmtDateJ = (ms) => { if (getLang() !== 'fa') return df('full').format(new Date(ms)); const p = jp(df('full'), ms); return `${p.weekday} ${p.day} ${p.month} ${p.year}`; };
export const fmtDateJnoWd = (ms) => { if (getLang() !== 'fa') return df('nowd').format(new Date(ms)); const p = jp(df('nowd'), ms); return `${p.day} ${p.month} ${p.year}`; };
export const fmtDayShortJ = (ms) => { if (getLang() !== 'fa') return df('short').format(new Date(ms)); const p = jp(df('short'), ms); return `${p.day} ${p.month}`; };
const hm = (tz) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false, ...(tz ? { timeZone: tz } : {}) });
export const fmtTimeLocal = (ms) => hm().format(new Date(ms));
export const fmtUTC = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
export function fmtTimeTz(ms, tz, lon) {
  try { if (tz) return hm(tz).format(new Date(ms)); } catch (e) { /* fall through */ }
  const off = Math.round(lon / 15) * 3600e3;
  return hm('UTC').format(new Date(ms + off));
}
export function fmtHM(hours) {
  if (hours <= 0.0001) return t('hOnly', fa(0));
  if (hours >= 23.999) return t('hOnly', fa(24));
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  return m === 60 ? t('hOnly', fa(h + 1)) : t('hm', fa(h), fa(m));
}
export function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? t('hm', fa(h), fa(m)) : t('minOnly', fa(m));
}
export function localInputValue(ms) {
  const d = new Date(ms); const o = d.getTimezoneOffset() * 60000;
  return new Date(ms - o).toISOString().slice(0, 16);
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function slider(id, label, min, max, step, value, unit = '') {
  return `<div class="sl"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="${id}_o" data-unit="${unit}">${fa(value, step < 1 ? 1 : 0)}${unit}</output></div>`;
}
export const check = (id, label, on) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
export const setText = (id, t) => { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; };
export const setHTML = (id, t) => { const e = document.getElementById(id); if (e && e.innerHTML !== t) e.innerHTML = t; };

// ---------- DOM labels projected from 3-D ----------
export class Labels {
  constructor(root) { this.root = root; this.pool = new Map(); this.used = new Set(); this.v = new THREE.Vector3(); this.enabled = true; }
  begin() { this.used.clear(); }
  add(id, text, pos, cls = '', sub = '', cam, w, h) {
    if (!this.enabled) return;
    this.v.copy(pos).project(cam);
    let e = this.pool.get(id);
    if (!e) { e = document.createElement('div'); e.className = 'lbl'; this.root.appendChild(e); this.pool.set(id, e); }
    this.used.add(id);
    const html = text + (sub ? `<small>${sub}</small>` : '');
    if (e._h !== html) { e.innerHTML = html; e._h = html; }
    const c = 'lbl ' + cls; if (e._c !== c) { e.className = c; e._c = c; }
    if (this.v.z > 1 || this.v.z < -1) { e.style.display = 'none'; return; }
    const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
    if (x < -60 || x > w + 60 || y < -30 || y > h + 30) { e.style.display = 'none'; return; }
    e.style.display = 'block';
    e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-135%)`;
  }
  end() { for (const [id, e] of this.pool) if (!this.used.has(id) && e.style.display !== 'none') e.style.display = 'none'; }
  clear() { for (const e of this.pool.values()) e.remove(); this.pool.clear(); }
}

// ---------- 2-D inset canvas ----------
export class Inset2D {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.w = 0; this.h = 0; this.dpr = 1; }
  resize() {
    const r = this.c.getBoundingClientRect(); this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (w !== this.w || h !== this.h || this.c.width !== w * this.dpr) {
      this.w = w; this.h = h; this.c.width = w * this.dpr; this.c.height = h * this.dpr;
    }
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return this.g;
  }
}
