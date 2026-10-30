// Three.js scene: Earth, Moon, Sun, stars, shadow cones and helper geometry.
import * as THREE from 'three';
import { bodyVert, earthFrag, moonFrag, atmoVert, atmoFrag, starVert, starFrag } from './shaders.js';
import * as AS from './astro.js';
import dayURL from '../tex/day.jpg';
import nightURL from '../tex/night.jpg';
import specURL from '../tex/spec.jpg';
import moonURL from '../tex/moon.jpg';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function unitCircle(n = 160) {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p[i * 3] = Math.cos(a); p[i * 3 + 2] = Math.sin(a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.08, 'rgba(255,236,190,.95)');
  gr.addColorStop(0.22, 'rgba(255,205,120,.45)'); gr.addColorStop(0.5, 'rgba(255,160,60,.12)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeStars(prSetter) {
  const rnd = mulberry32(20261028);
  const gal = (() => { // galactic basis in EQJ
    const rd = (ra, dec) => { ra *= DEG; dec *= DEG; return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]; };
    const x = rd(266.405, -28.936), z = rd(192.8595, 27.1283); const y = AS.cross(z, x);
    return { x, y, z };
  })();
  const toW = (v) => AS.eqjDirToWorld(v[0], v[1], v[2]);
  const pts = [];
  const push = (v, size, r, g, b) => pts.push([toW(v), size, r, g, b]);
  const randDir = () => { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(a), s * Math.sin(a), u]; };
  const tint = () => { const k = rnd(); return k < 0.25 ? [0.72, 0.82, 1] : k < 0.8 ? [1, 1, 1] : k < 0.93 ? [1, 0.9, 0.72] : [1, 0.74, 0.55]; };
  for (let i = 0; i < 2300; i++) { const m = Math.pow(rnd(), 5); const t = tint(); const b = 0.35 + 0.65 * m; push(randDir(), 1.0 + 2.4 * m, t[0] * b, t[1] * b, t[2] * b); }
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(rnd() * 6.2831853);
  for (let i = 0; i < 3200; i++) {
    const l = rnd() * Math.PI * 2, b = gauss() * 6.5 * DEG;
    const w = Math.exp(-Math.pow(Math.cos(l - 0.0) * 0.0, 2));
    const cb = Math.cos(b), sb = Math.sin(b);
    const v = [0, 0, 0]; for (let k = 0; k < 3; k++) v[k] = cb * Math.cos(l) * gal.x[k] + cb * Math.sin(l) * gal.y[k] + sb * gal.z[k];
    const t = tint(); const bb = 0.22 + 0.4 * rnd();
    push(v, 0.9 + 1.2 * rnd(), t[0] * bb, t[1] * bb, t[2] * bb);
  }
  for (let i = 0; i < 320; i++) { // soft Milky-Way glow
    const l = rnd() * Math.PI * 2, b = gauss() * 9 * DEG, cb = Math.cos(b), sb = Math.sin(b);
    const v = [0, 0, 0]; for (let k = 0; k < 3; k++) v[k] = cb * Math.cos(l) * gal.x[k] + cb * Math.sin(l) * gal.y[k] + sb * gal.z[k];
    const near = 0.5 + 0.5 * Math.cos(l);
    push(v, 40 + 40 * rnd(), 0.030 * (0.5 + near), 0.032 * (0.5 + near), 0.045 * (0.5 + near));
  }
  const n = pts.length; const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
  pts.forEach((p, i) => { pos.set(p[0].map((x) => x * 900), i * 3); size[i] = p[1]; col.set([p[2], p[3], p[4]], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, uniforms: { uPR: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pts3 = new THREE.Points(g, m); pts3.frustumCulled = false; pts3.renderOrder = -10;
  return pts3;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setClearColor(0x02030a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 40000);
  const insetCam = new THREE.PerspectiveCamera(5, 1, 0.05, 6000);

  const stars = makeStars(); scene.add(stars);

  // ---------- textures ----------
  const tl = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loadTex = (url, srgb) => new Promise((res, rej) => tl.load(url, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; res(t);
  }, undefined, rej));

  // ---------- Sun ----------
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.74), toneMapped: false }));
  scene.add(sunMesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  scene.add(glow);

  // ---------- Earth ----------
  const earthU = {
    uDay: { value: null }, uNight: { value: null }, uSpec: { value: null },
    uSunPos: { value: new V3(0, 0, 1e4) }, uSunR: { value: 109 }, uOccPos: { value: new V3() }, uOccR: { value: 0.27 }, uEclipse: { value: 0 },
  };
  const earthMat = new THREE.ShaderMaterial({ uniforms: earthU, vertexShader: bodyVert, fragmentShader: earthFrag });
  const earthG = new THREE.Group(); earthG.matrixAutoUpdate = false; scene.add(earthG);
  const earthGeo = new THREE.SphereGeometry(1, 128, 96);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat); earthG.add(earthMesh);
  const atmoU = { uSunPos: { value: new V3(0, 0, 1e4) }, uCenter: { value: new V3() } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 48), new THREE.ShaderMaterial({
    uniforms: atmoU, vertexShader: atmoVert, fragmentShader: atmoFrag,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  earthG.add(atmo);

  // axis + grid (mesh-local frame: +y = geographic north)
  const axisMat = new THREE.LineBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.95 });
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new V3(0, -1.55, 0), new V3(0, 1.55, 0)]);
  const axisLine = new THREE.Line(axisGeo, axisMat); axisLine.renderOrder = 3;
  const northTip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 16), new THREE.MeshBasicMaterial({ color: 0xff5b5b }));
  northTip.position.set(0, 1.58, 0);
  const southTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6fb7ff }));
  southTip.position.set(0, -1.56, 0);
  const axisG = new THREE.Group(); axisG.add(axisLine, northTip, southTip); earthG.add(axisG);

  const circ = unitCircle();
  const mkRing = (color, op) => { const l = new THREE.LineLoop(circ, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })); l.renderOrder = 2; return l; };
  const gridG = new THREE.Group(); earthG.add(gridG);
  const eq = mkRing(0xffd36b, 0.85); eq.scale.setScalar(1.004); gridG.add(eq);
  const tropN = mkRing(0xff9a5c, 0.7), tropS = mkRing(0xff9a5c, 0.7), polN = mkRing(0x8fd0ff, 0.7), polS = mkRing(0x8fd0ff, 0.7);
  gridG.add(tropN, tropS, polN, polS);
  const pmPts = []; for (let i = 0; i <= 90; i++) { const a = -Math.PI / 2 + i / 90 * Math.PI; pmPts.push(new V3(Math.cos(a) * 1.004, Math.sin(a) * 1.004, 0)); }
  const meridian = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pmPts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  gridG.add(meridian);
  function setTilt(tiltDeg) {
    const put = (m, lat) => { const p = lat * DEG; m.scale.set(Math.cos(p) * 1.004, 1, Math.cos(p) * 1.004); m.position.y = Math.sin(p) * 1.004; };
    put(tropN, tiltDeg); put(tropS, -tiltDeg); put(polN, 90 - tiltDeg); put(polS, -(90 - tiltDeg));
    polN.visible = polS.visible = tiltDeg < 89.5; tropN.visible = tropS.visible = tiltDeg > 0.2;
  }
  setTilt(AS.OBLIQUITY);

  // observer pin
  const pin = new THREE.Group();
  const pinStem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  pinStem.position.y = 0.045 + 0.0;
  const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  pinHead.position.y = 0.095;
  pin.add(pinStem, pinHead); earthG.add(pin);
  function setPin(lat, lon, visible = true) {
    const p = new V3(...AS.localFromLatLon(lat, lon));
    pin.position.copy(p); pin.quaternion.setFromUnitVectors(new V3(0, 1, 0), p); pin.visible = visible;
  }

  // ---------- Moon ----------
  const moonU = {
    uTex: { value: null }, uSunPos: { value: new V3(0, 0, 1e4) }, uSunR: { value: 109 },
    uOccPos: { value: new V3() }, uOccR: { value: 1 }, uEclipse: { value: 0 }, uFlat: { value: 0 }, uTint: { value: 1 },
  };
  const moonMat = new THREE.ShaderMaterial({ uniforms: moonU, vertexShader: bodyVert, fragmentShader: moonFrag });
  const moonG = new THREE.Group(); moonG.matrixAutoUpdate = false; scene.add(moonG);
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), moonMat); moonG.add(moonMesh);
  // near-side marker (sub-Earth point at lon 0, lat 0 => local +x) and rotation axis
  const marker = new THREE.Group();
  const mkDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  mkDot.position.set(1.0, 0, 0);
  const mkArrow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(1, 0, 0), new V3(2.6, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xff5a5a }));
  const mkHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 14), new THREE.MeshBasicMaterial({ color: 0xff5a5a }));
  mkHead.position.set(2.6, 0, 0); mkHead.rotation.z = -Math.PI / 2;
  const farDot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5bb6ff }));
  farDot.position.set(-1.0, 0, 0);
  marker.add(mkDot, mkArrow, mkHead, farDot); moonG.add(marker);
  const markerExtras = [mkArrow, mkHead, farDot];
  const moonAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(0, -1.6, 0), new V3(0, 1.6, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
  moonG.add(moonAxis);

  // ---------- orbit helpers (world frame, geocentric RE, scaled by group) ----------
  const orbitG = new THREE.Group(); scene.add(orbitG);
  const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fa6ff, transparent: true, opacity: 0.75 }));
  orbitLine.frustumCulled = false; orbitG.add(orbitLine);
  const eclDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x4f78ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  eclDisc.rotation.x = -Math.PI / 2; orbitG.add(eclDisc);
  const eclRing = new THREE.LineLoop(circ, new THREE.LineBasicMaterial({ color: 0x6f8fff, transparent: true, opacity: 0.55 })); orbitG.add(eclRing);
  const nodeA = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x7be0a4 }));
  const nodeD = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff9f6b }));
  orbitG.add(nodeA, nodeD);
  const dropLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  dropLine.frustumCulled = false; scene.add(dropLine);
  const sightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(1, 0, 0)]), new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 0.4, gapSize: 0.3 }));
  sightLine.frustumCulled = false; scene.add(sightLine);

  let orbitBase = null; let orbitT = -1e18;
  function updateOrbit(ms) {
    if (Math.abs(ms - orbitT) < 12 * 864e5) return;
    orbitT = ms;
    const pts = AS.moonOrbitPoints(ms - 13.66 * 864e5, 160);
    // close the loop smoothly
    orbitBase = pts;
    const arr = new Float32Array(pts.length * 3); pts.forEach((p, i) => arr.set(p, i * 3));
    orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3)); orbitLine.geometry.computeBoundingSphere();
    let rmean = 0; pts.forEach((p) => { rmean += AS.len(p); }); rmean /= pts.length;
    // nodes
    let asc = null, desc = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[1] < 0 && b[1] >= 0) { const f = -a[1] / (b[1] - a[1]); asc = AS.add(a, AS.scale(AS.sub(b, a), f)); }
      if (a[1] >= 0 && b[1] < 0) { const f = a[1] / (a[1] - b[1]); desc = AS.add(a, AS.scale(AS.sub(b, a), f)); }
    }
    orbitState.asc = asc; orbitState.desc = desc; orbitState.rmean = rmean;
  }
  const orbitState = { asc: null, desc: null, rmean: 60 };

  // ---------- shadow cones ----------
  function coneGeo(kind, ratio) {
    let g;
    if (kind === 'umbra') { g = new THREE.CylinderGeometry(0, 1, 1, 64, 1, true); g.translate(0, 0.5, 0); }          // base r=1 at y=0, apex y=1
    else { g = new THREE.CylinderGeometry(ratio, 1, 1, 64, 1, true); g.translate(0, 0.5, 0); }                        // frustum 1 -> ratio
    return g;
  }
  const umbraMat = () => new THREE.MeshBasicMaterial({ color: 0x6a7fc4, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const penMat = () => new THREE.MeshBasicMaterial({ color: 0x9fb2ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const earthUmbra = new THREE.Mesh(coneGeo('umbra'), umbraMat());
  const earthPen = new THREE.Mesh(coneGeo('pen', 1.4), penMat());
  const moonUmbra = new THREE.Mesh(coneGeo('umbra'), umbraMat());
  const moonPen = new THREE.Mesh(coneGeo('pen', 2.3), penMat());
  const coneG = new THREE.Group(); coneG.add(earthUmbra, earthPen, moonUmbra, moonPen); scene.add(coneG);
  [earthUmbra, earthPen, moonUmbra, moonPen].forEach((m) => { m.renderOrder = 5; m.frustumCulled = false; });
  const UP = new V3(0, 1, 0);
  function placeCone(mesh, origin, dir, r0, len, startBack = 0) {
    mesh.position.set(origin[0] - dir[0] * startBack, origin[1] - dir[1] * startBack, origin[2] - dir[2] * startBack);
    mesh.quaternion.setFromUnitVectors(UP, new V3(dir[0], dir[1], dir[2]));
    mesh.scale.set(r0, len, r0);
  }

  // ---------- sun rays ----------
  const RAYN = 18;
  const rayPos = new Float32Array(RAYN * 3 * 2 * 3);
  const rayGeo = new THREE.BufferGeometry(); rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
  const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.8 }));
  rays.frustumCulled = false; scene.add(rays);
  function setRays(sunDir, targets) { // targets: [{c:[x,y,z], r}]
    let k = 0; const w = rayPos;
    const sd = new V3(...sunDir); const side = new V3().crossVectors(sd, new V3(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const up = new V3().crossVectors(side, sd).normalize();
    const offs = [[0, 0], [0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62], [0.9, 0.9 * 0.0], [-0.9, 0], [0.45, 0.45], [-0.45, -0.45]];
    for (const t of targets) {
      for (const [a, b] of offs) {
        const rho2 = a * a + b * b; const dz = Math.sqrt(Math.max(0, 1 - rho2)) * t.r;
        const o = new V3().addScaledVector(side, a * t.r).addScaledVector(up, b * t.r);
        const start = new V3(...t.c).addScaledVector(sd, t.r * 4.2 + dz).add(o);
        const end = new V3(...t.c).addScaledVector(sd, dz * 1.02 + t.r * 0.05).add(o);
        const dirv = new V3().subVectors(end, start).normalize();
        const hl = t.r * 0.26;
        const h1 = end.clone().addScaledVector(dirv, -hl).addScaledVector(side, hl * 0.35);
        const h2 = end.clone().addScaledVector(dirv, -hl).addScaledVector(side, -hl * 0.35);
        const segs = [start, end, end, h1, end, h2];
        for (const s of segs) { w[k++] = s.x; w[k++] = s.y; w[k++] = s.z; }
      }
    }
    rayGeo.setDrawRange(0, k / 3); rayGeo.attributes.position.needsUpdate = true;
  }

  // ---------- season-mode helpers ----------
  const helio = {};
  helio.group = new THREE.Group(); scene.add(helio.group);
  helio.orbit = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6f9bff, transparent: true, opacity: 0.6 }));
  helio.orbit.frustumCulled = false; helio.group.add(helio.orbit);
  helio.polar = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55, dashSize: 4, gapSize: 3 }));
  helio.polar.frustumCulled = false; helio.group.add(helio.polar);
  helio.ghosts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), earthMat);
    const ax = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(0, -1.9, 0), new V3(0, 1.9, 0)]), axisMat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 12), new THREE.MeshBasicMaterial({ color: 0xff5b5b })); tip.position.set(0, 1.95, 0);
    g.add(m, ax, tip); helio.group.add(g); helio.ghosts.push(g);
  }
  helio.sunRing = new THREE.LineLoop(circ, new THREE.LineBasicMaterial({ color: 0xffd37a, transparent: true, opacity: 0.0 }));

  // ---------- apply layout ----------
  const m4 = new THREE.Matrix4();
  function basisMatrix(M, pos, s, target) {
    target.makeBasis(new V3(...M[0]).multiplyScalar(s), new V3(...M[1]).multiplyScalar(s), new V3(...M[2]).multiplyScalar(s));
    target.setPosition(pos.x, pos.y, pos.z);
  }

  return {
    renderer, scene, camera, insetCam, stars, tl, loadTex, textureURLs: { day: dayURL, night: nightURL, spec: specURL, moon: moonURL },
    sunMesh, glow, earthG, earthMesh, earthMat, earthU, atmo, atmoU, axisG, gridG, pin, setPin, setTilt,
    moonG, moonMesh, moonMat, moonU, marker, markerExtras, moonAxis,
    orbitG, orbitLine, eclDisc, eclRing, nodeA, nodeD, dropLine, sightLine, updateOrbit, orbitState,
    coneG, earthUmbra, earthPen, moonUmbra, moonPen, placeCone, rays, setRays, helio, basisMatrix, m4,
    async loadAll() {
      const [d, n, s, m] = await Promise.all([loadTex(dayURL, true), loadTex(nightURL, true), loadTex(specURL, false), loadTex(moonURL, true)]);
      earthU.uDay.value = d; earthU.uNight.value = n; earthU.uSpec.value = s; moonU.uTex.value = m;
      this.images = { moon: m.image };
    },
  };
}
