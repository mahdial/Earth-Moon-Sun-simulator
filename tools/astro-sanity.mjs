import * as S from '../src/astro.js';
const DEG=Math.PI/180;
const ms = Date.UTC(2026,9,28,12,0,0);
const f = S.frameAt(ms);
// subsolar point via earth-local transform
const loc = S.toLocalEarth(f, f.sunDir);
const ll = S.latLonOf(loc);
console.log('subsolar lat/lon', ll.lat.toFixed(2), ll.lon.toFixed(2), '(expect ~ -12.9, ~ -3.9)');
console.log('declination formula', S.sunDeclination(ms).toFixed(2));
console.log('earth-sun AU', f.earthDistAU.toFixed(4), 'sun dist AU', (f.sunDistKm/149597870.7).toFixed(4));
console.log('axis', f.axis.map(v=>v.toFixed(3)).join(','), 'tilt from ecl north', (Math.acos(f.axis[1])/DEG).toFixed(2));
console.log('moon dist km', f.moonDistKm.toFixed(0), 'libration', f.lib.elat.toFixed(2), f.lib.elon.toFixed(2));
// Moon orientation check: sub-Earth point in moon-local coords should equal libration (lat, lon)
const [X,N,Z] = f.moonM; const u = S.norm(S.scale(f.moonRE,-1));
const lo=[S.dot(u,X),S.dot(u,N),S.dot(u,Z)];
const mll=S.latLonOf(lo);
console.log('sub-earth moon lat/lon', mll.lat.toFixed(2), mll.lon.toFixed(2), 'libration lib.elat/elon', f.lib.elat.toFixed(2), f.lib.elon.toFixed(2));
// solstice: Sun's declination and axis lean toward sun (Dec 2026 solstice and Jun)
for (const [y,m,d] of [[2026,5,21],[2026,11,21],[2026,2,20],[2026,8,23]]) {
  const t=Date.UTC(y,m,d,12); const g=S.frameAt(t);
  const dec = S.latLonOf(S.toLocalEarth(g,g.sunDir)).lat;
  console.log(y,m+1,d,'subsolar lat',dec.toFixed(2),'axis.sun',S.dot(g.axis,g.sunDir).toFixed(3));
}
console.log('seasons 2026', ['mar_equinox','jun_solstice','sep_equinox','dec_solstice'].map(k=>S.seasonsOfYear(2026)[k].date.toISOString()));
console.log('lunar', S.lunarEclipses(ms,3).map(e=>new Date(e.ms).toISOString()+' '+e.kind));
console.log('solar', S.solarEclipses(ms,3).map(e=>new Date(e.ms).toISOString()+' '+e.kind+' '+e.lat.toFixed(1)+','+e.lon.toFixed(1)));
// time cost
let t0=performance.now(); for(let i=0;i<200;i++) S.frameAt(ms+i*3600e3); console.log('frameAt ms', ((performance.now()-t0)/200).toFixed(3));
// Day length Tehran at solstice
console.log('daylen Tehran Jun21', S.dayLengthHours(35.7,23.44).toFixed(2), 'Dec21', S.dayLengthHours(35.7,-23.44).toFixed(2));
// sky geometry at a solar eclipse: 2026-08-12 total over Spain
const e = S.solarEclipses(Date.UTC(2026,7,1),1)[0];
console.log('eclipse', new Date(e.ms).toISOString(), e.kind, e.lat, e.lon);
const sk = S.sunMoonSky(e.ms, e.lat, e.lon);
console.log('sky at greatest', JSON.stringify(sk));
