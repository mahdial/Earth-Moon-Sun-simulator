// Astronomy core: all positions come from astronomy-engine (VSOP87 + ELP-style Moon series).
// World frame used by the renderer: x = vernal equinox (J2000 ecliptic), y = ecliptic north, z = -(ecliptic y).
// Units of "RE" = mean Earth radius (6371 km).
import * as A from 'astronomy-engine';

export const RE_KM = 6371.0;
export const R_SUN_KM = 695700;
export const R_MOON_KM = 1737.4;
export const AU_KM = A.KM_PER_AU;
export const OBLIQUITY = 23.4392911;
export const SYNODIC = 29.530588;
export const SIDEREAL_MONTH = 27.321662;

const DEG = Math.PI / 180;
const ECL_ROT = A.Rotation_EQJ_ECL();

const toWorld = (v) => {
  const e = A.RotateVector(ECL_ROT, v);
  return [e.x, e.z, -e.y];
};
const vec = (x, y, z, t) => new A.Vector(x, y, z, t);

// ---- small vector helpers (arrays) ----
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function rotAxis(v, axis, ang) { // Rodrigues, axis must be unit
  const c = Math.cos(ang), s = Math.sin(ang), k = dot(axis, v) * (1 - c);
  const cr = cross(axis, v);
  return [v[0] * c + cr[0] * s + axis[0] * k, v[1] * c + cr[1] * s + axis[1] * k, v[2] * c + cr[2] * s + axis[2] * k];
}

export function makeTime(ms) { return A.MakeTime(new Date(ms)); }

// Earth: columns of the local->world matrix (mesh local: lon0 on +x, north on +y, east toward -z)
function earthBasis(time, gastRad) {
  const eqd2eqj = A.Rotation_EQD_EQJ(time);
  const c = Math.cos(gastRad), s = Math.sin(gastRad);
  const col = (lx, ly, lz) => {
    // mesh-local -> EQD body frame
    let x = lx, y = -lz, z = ly;
    // spin about the pole by GAST
    const xr = x * c - y * s, yr = x * s + y * c;
    const r = A.RotateVector(eqd2eqj, vec(xr, yr, z, time));
    return toWorld(r);
  };
  return [col(1, 0, 0), col(0, 1, 0), col(0, 0, 1)];
}

// Moon pole in world coordinates (Cassini state, mean node)
function moonPole(time) {
  const T = time.tt / 36525;
  const om = (125.04452 - 1934.136261 * T) * DEG;
  const e = 1.5424 * DEG;
  const ecl = [-Math.sin(e) * Math.sin(om), Math.sin(e) * Math.cos(om), Math.cos(e)];
  return [ecl[0], ecl[2], -ecl[1]];
}


// Moon orientation: pole from the Cassini state, prime meridian from the library's sub-Earth longitude.
function moonBasisFrom(time, moonRE, lib, extra) {
  const N = moonPole(time);
  const u = norm(scale(moonRE, -1));              // moon -> earth
  const eSub = norm(sub(u, scale(N, dot(u, N))));
  let X = rotAxis(eSub, N, -lib.elon * DEG);
  if (extra) X = rotAxis(X, N, extra);            // hypothetical extra spin (rad)
  return [X, N, cross(X, N)];
}
export function moonStateAt(ms, extra = 0) {
  const time = makeTime(ms);
  const moonRE = scale(toWorld(A.GeoMoon(time)), AU_KM / RE_KM);
  const lib = A.Libration(time);
  return { moonRE, moonM: moonBasisFrom(time, moonRE, lib, extra), lib };
}

// Full frame at a given instant (ms since epoch).
export function frameAt(ms, opts = {}) {
  const time = makeTime(ms);
  const gastH = A.SiderealTime(time);
  const gast = gastH * 15 * DEG;

  const sunGeo = A.GeoVector(A.Body.Sun, time, true);
  const moonGeo = A.GeoMoon(time);
  const earthHel = A.HelioVector(A.Body.Earth, time);

  const sunAU = toWorld(sunGeo);
  const sunDistAU = len(sunAU);
  const sunDir = scale(sunAU, 1 / sunDistAU);
  const moonKm = scale(toWorld(moonGeo), AU_KM);
  const moonRE = scale(moonKm, 1 / RE_KM);
  const moonDistKm = len(moonKm);
  const earthHelAU = toWorld(earthHel);

  const earthM = earthBasis(time, opts.spinMs !== undefined ? gastForMs(opts.spinMs) : gast);
  const axis = earthM[1];

  // Moon orientation
  const lib = A.Libration(time);
  const moonM = moonBasisFrom(time, moonRE, lib, opts.moonExtraSpin || 0);

  return {
    ms, time, gast, sunDir, sunDistKm: sunDistAU * AU_KM, sunDistRE: sunDistAU * AU_KM / RE_KM,
    moonRE, moonDistKm, earthHelAU, earthDistAU: len(earthHelAU), earthM, axis, moonM, lib,
    moonDir: norm(moonRE),
  };
}

function gastForMs(ms) { return A.SiderealTime(makeTime(ms)) * 15 * DEG; }

export function toLocalEarth(frame, wv) { // world vector (any length) -> earth-local
  const [ex, ey, ez] = frame.earthM;
  return [dot(wv, ex), dot(wv, ey), dot(wv, ez)];
}
export function latLonOf(local) {
  const l = norm(local);
  return { lat: Math.asin(Math.max(-1, Math.min(1, l[1]))) / DEG, lon: Math.atan2(-l[2], l[0]) / DEG };
}
export function localFromLatLon(lat, lon) {
  const p = lat * DEG, l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}
export function worldFromLocal(frame, loc) {
  const [ex, ey, ez] = frame.earthM;
  return [ex[0] * loc[0] + ey[0] * loc[1] + ez[0] * loc[2],
          ex[1] * loc[0] + ey[1] * loc[1] + ez[1] * loc[2],
          ex[2] * loc[0] + ey[2] * loc[1] + ez[2] * loc[2]];
}

// Sun's ecliptic longitude of date (deg)
export function sunLongitude(ms) { return A.SunPosition(makeTime(ms)).elon; }
export function sunDeclination(ms) {
  const lon = sunLongitude(ms) * DEG;
  return Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(lon)) / DEG;
}
export function dayLengthHours(latDeg, decDeg) {
  const phi = latDeg * DEG, d = decDeg * DEG, h0 = -0.833 * DEG;
  const c = (Math.sin(h0) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
  if (c >= 1) return 0;
  if (c <= -1) return 24;
  return 2 * Math.acos(c) / DEG / 15;
}

export function seasonsOfYear(year) { return A.Seasons(year); }
export function helioWorldAt(time) { return toWorld(A.HelioVector(A.Body.Earth, time)); }

// Moon phase helpers
export function moonPhaseAngle(ms) { return A.MoonPhase(new Date(ms)); }
export function moonIllumination(ms) { return A.Illumination(A.Body.Moon, new Date(ms)); }
export function nextPhase(ms, targetDeg) { return A.SearchMoonPhase(targetDeg, new Date(ms), 40); }
export function moonOrbitPoints(ms, n = 120) {
  // one sidereal month of geocentric Moon positions in RE (world frame)
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = makeTime(ms + (i / n) * SIDEREAL_MONTH * 864e5);
    pts.push(scale(toWorld(A.GeoMoon(t)), AU_KM / RE_KM));
  }
  return pts;
}
export function earthOrbitPoints(ms, n = 240) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(helioWorldAt(makeTime(ms + (i / n) * 365.2564 * 864e5)));
  return pts;
}

// Star frame helper: EQJ direction -> world
export function eqjDirToWorld(x, y, z) { return toWorld(vec(x, y, z, undefined)); }

// Topocentric sky geometry for solar-eclipse view
export function sunMoonSky(ms, latDeg, lonDeg) {
  const date = new Date(ms);
  const obs = new A.Observer(latDeg, lonDeg, 0);
  const sun = A.Equator(A.Body.Sun, date, obs, true, true);
  const moon = A.Equator(A.Body.Moon, date, obs, true, true);
  const hs = A.Horizon(date, obs, sun.ra, sun.dec, null);
  const hm = A.Horizon(date, obs, moon.ra, moon.dec, null);
  const rs = Math.asin(R_SUN_KM / (sun.dist * AU_KM));
  const rm = Math.asin(R_MOON_KM / (moon.dist * AU_KM));
  const dAz = ((hm.azimuth - hs.azimuth + 540) % 360) - 180;
  const cosAlt = Math.cos(hs.altitude * DEG);
  const dx = dAz * DEG * cosAlt, dy = (hm.altitude - hs.altitude) * DEG;
  const sep = Math.hypot(dx, dy);
  return { sunAlt: hs.altitude, sunAz: hs.azimuth, moonAlt: hm.altitude, rs, rm, dx, dy, sep,
    obscuration: overlapFraction(rs, rm, sep) };
}
export function overlapFraction(rs, rm, d) {
  if (d >= rs + rm) return 0;
  if (d <= Math.abs(rs - rm)) return rm >= rs ? 1 : (rm * rm) / (rs * rs);
  const a0 = Math.acos((d * d + rs * rs - rm * rm) / (2 * d * rs));
  const a1 = Math.acos((d * d + rm * rm - rs * rs) / (2 * d * rm));
  const area = rs * rs * (a0 - Math.sin(2 * a0) / 2) + rm * rm * (a1 - Math.sin(2 * a1) / 2);
  return area / (Math.PI * rs * rs);
}

export function sunTimes(ms, latDeg, lonDeg) {
  const obs = new A.Observer(latDeg, lonDeg, 0);
  const d = new Date(ms - 12 * 3600e3);
  const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, d, 2);
  const set = A.SearchRiseSet(A.Body.Sun, obs, -1, d, 2);
  return { rise: rise ? rise.date.getTime() : null, set: set ? set.date.getTime() : null };
}
export function sunAltitude(ms, latDeg, lonDeg) {
  const date = new Date(ms);
  const obs = new A.Observer(latDeg, lonDeg, 0);
  const sun = A.Equator(A.Body.Sun, date, obs, true, true);
  return A.Horizon(date, obs, sun.ra, sun.dec, 'normal').altitude;
}

// Eclipse catalogues
export function lunarEclipses(ms, count = 4) {
  const out = [];
  let e = A.SearchLunarEclipse(new Date(ms));
  for (let i = 0; i < count; i++) {
    out.push({ ms: e.peak.date.getTime(), kind: e.kind, obscuration: e.obscuration,
      semiPen: e.sd_penum, semiPart: e.sd_partial, semiTotal: e.sd_total });
    e = A.NextLunarEclipse(e.peak);
  }
  return out;
}
// Point on Earth closest to the Moon's shadow axis (used for partial eclipses, which have no central point).
export function shadowAxisSpot(ms) {
  const f = frameAt(ms);
  const sm = sub(f.moonRE, scale(f.sunDir, f.sunDistRE));
  const dirM = norm(sm);
  const b = dot(f.moonRE, dirM), c = dot(f.moonRE, f.moonRE) - 1, disc = b * b - c;
  let pt;
  if (disc >= 0 && -b - Math.sqrt(disc) > 0) pt = add(f.moonRE, scale(dirM, -b - Math.sqrt(disc)));
  else pt = norm(add(f.moonRE, scale(dirM, -b)));
  return latLonOf(toLocalEarth(f, pt));
}
export function solarEclipses(ms, count = 4) {
  const out = [];
  let e = A.SearchGlobalSolarEclipse(new Date(ms));
  for (let i = 0; i < count; i++) {
    const pk = e.peak.date.getTime();
    let lat = e.latitude, lon = e.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { const s = shadowAxisSpot(pk); lat = s.lat; lon = s.lon; }
    out.push({ ms: pk, kind: e.kind, obscuration: e.obscuration,
      lat, lon, dist: e.distance });
    e = A.NextGlobalSolarEclipse(e.peak);
  }
  return out;
}

// ---- extra helpers for the UI ----
export function sunHorizon(ms, latDeg, lonDeg) {
  const date = new Date(ms); const obs = new A.Observer(latDeg, lonDeg, 0);
  const sun = A.Equator(A.Body.Sun, date, obs, true, true);
  const h = A.Horizon(date, obs, sun.ra, sun.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
export function moonHorizon(ms, latDeg, lonDeg) {
  const date = new Date(ms); const obs = new A.Observer(latDeg, lonDeg, 0);
  const m = A.Equator(A.Body.Moon, date, obs, true, true);
  const h = A.Horizon(date, obs, m.ra, m.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
// Tilt the Earth's axis to a hypothetical obliquity (deg), keeping its azimuth in the ecliptic.
export function tiltedBasis(M, tiltDeg) {
  const axis = M[1];
  const h = norm([axis[0], 0, axis[2]]);
  const t = tiltDeg * DEG;
  const na = [h[0] * Math.sin(t), Math.cos(t), h[2] * Math.sin(t)];
  const k = cross(axis, na); const s = len(k);
  if (s < 1e-9) return { M, axis };
  const ang = Math.atan2(s, dot(axis, na));
  const ax = scale(k, 1 / s);
  return { M: M.map((c) => rotAxis(c, ax, ang)), axis: na };
}
// Rotate the Earth about its axis so that longitude L0 (deg) lies under the Sun.
export function holdSpin(M, axis, sunDir, L0) {
  const sl = [dot(sunDir, M[0]), dot(sunDir, M[1]), dot(sunDir, M[2])];
  const lonS = Math.atan2(-sl[2], sl[0]);
  const d = lonS - L0 * DEG;
  return M.map((c) => rotAxis(c, axis, d));
}
export function declinationFromLon(lonDeg, tiltDeg) { return Math.asin(Math.sin(tiltDeg * DEG) * Math.sin(lonDeg * DEG)) / DEG; }
export function earthApsides(year) {
  try {
    let a = A.SearchPlanetApsis(A.Body.Earth, new Date(Date.UTC(year, 0, 1)));
    const out = [a];
    a = A.NextPlanetApsis(A.Body.Earth, a); out.push(a);
    return out.map((x) => ({ ms: x.time.date.getTime(), kind: x.kind, distAU: x.dist_au }));
  } catch (e) { return null; }
}
