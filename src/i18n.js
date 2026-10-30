// Tiny i18n layer: fa / en / es. Dictionary entries are [fa, en, es]; placeholders are {0}, {1}...
import { DICT } from './dict.js';

export const LANGS = {
  fa: { name: 'فارسی', dir: 'rtl', locale: 'fa-IR' },
  en: { name: 'English', dir: 'ltr', locale: 'en-US' },
  es: { name: 'Español', dir: 'ltr', locale: 'es-ES' },
};
const ORDER = ['fa', 'en', 'es'];
let cur = 'fa';

export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang'); if (q && LANGS[q]) return q;
    const s = localStorage.getItem('sim-lang'); if (s && LANGS[s]) return s;
  } catch (e) { /* storage may be blocked */ }
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'fa').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'fa';
}
export function setLang(l) {
  if (!LANGS[l]) return; cur = l;
  try { localStorage.setItem('sim-lang', l); } catch (e) { /* ignore */ }
  const d = document.documentElement; d.lang = l; d.dir = LANGS[l].dir;
}
export const getLang = () => cur;
export const locale = () => LANGS[cur].locale;
export const isRTL = () => LANGS[cur].dir === 'rtl';

export function t(key, ...a) {
  const e = DICT[key];
  if (!e) return key;
  const s = e[ORDER.indexOf(cur)] || e[1] || e[0] || key;
  return a.length ? s.replace(/\{(\d+)\}/g, (_, i) => (a[+i] === undefined ? '' : a[+i])) : s;
}
// list entries are stored as "a|b|c"
export const tl = (key) => t(key).split('|');
