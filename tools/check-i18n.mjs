import fs from 'fs';
import { DICT } from '../src/dict.js';
const dir = new URL('../src/', import.meta.url).pathname; let bad = 0;
const files = ['modes.js', 'main.js', 'ui.js', 'i18n.js'];
const src = files.map((f) => fs.readFileSync(dir + f, 'utf8')).join('\n');
// 1. every entry has 3 non-empty strings; list entries have equal counts
for (const [k, v] of Object.entries(DICT)) {
  if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== 'string' || !x.trim())) { console.log('BAD ENTRY', k); bad++; continue; }
  const n = v.map((x) => x.split('|').length);
  if (v[0].includes('|') && new Set(n).size > 1) { console.log('LIST LENGTH MISMATCH', k, n); bad++; }
  const ph = v.map((x) => (x.match(/\{\d+\}/g) || []).sort().join(','));
  if (new Set(ph).size > 1) { console.log('PLACEHOLDER MISMATCH', k, ph); bad++; }
}
// 2. keys referenced from code
const used = new Set();
for (const m of src.matchAll(/\btl?\(\s*([^)]*?)\)/g)) { for (const q of m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) used.add(q[1]); }
for (const m of src.matchAll(/(?:nameKey|label):\s*'([A-Za-z_0-9]+)'/g)) used.add(m[1]);
for (const m of src.matchAll(/env\.setInset\('(?:gl|2d)',\s*'([^']*)'(?:,\s*'([^']*)')?/g)) { used.add(m[1]); if (m[2]) used.add(m[2]); }
for (const m of src.matchAll(/\?\s*'(i_[a-z]+)'\s*:\s*'(i_[a-z]+)'/g)) { used.add(m[1]); used.add(m[2]); }
for (const m of src.matchAll(/'(kinds(?:Lunar|Solar))'/g)) used.add(m[1]);
for (const id of ['locked', 'fixed', 'daily']) { used.add(`t_${id}_b`); used.add(`t_${id}_s`); }
for (const k of used) if (!['t_','_b','_s'].includes(k) && !(k in DICT)) { console.log('MISSING KEY', k); bad++; }
// 3. template keys
const tpl = fs.readFileSync(dir + 'template.html', 'utf8');
for (const m of tpl.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)) if (!(m[1] in DICT)) { console.log('TEMPLATE MISSING', m[1]); bad++; }
// 4. unused
const tplKeys = new Set([...tpl.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]));
const extra = ['doc_title', 'doc_desc', 'steps_txt', 'steps_title', 'lang_a', 'dirN', 'dirS', 'dirE', 'dirW', 'hOnly', 'hm', 'minOnly', 'cities', 'rates'];
const unused = Object.keys(DICT).filter((k) => !used.has(k) && !tplKeys.has(k) && !extra.includes(k));
console.log('entries:', Object.keys(DICT).length, 'used:', used.size, 'unused:', unused.join(' ') || '-');
// 5. leftover Persian literals in code
for (const f of files) { const lines = fs.readFileSync(dir + f, 'utf8').split('\n'); lines.forEach((l, i) => { if (/[؀-ۿ]/.test(l) && !/^\s*\/\//.test(l)) console.log('PERSIAN IN', f, i + 1, l.trim().slice(0, 80)); }); }
console.log(bad ? `FAILED: ${bad} problems` : 'OK: dictionary complete');
process.exit(bad ? 1 : 0);
