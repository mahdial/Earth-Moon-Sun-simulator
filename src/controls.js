// Orbit camera with mouse, touch (rotate / pinch-zoom / two-finger pan) and keyboard support.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

export class OrbitRig {
  constructor(camera, dom, hooks = {}) {
    this.camera = camera; this.dom = dom; this.hooks = hooks;
    this.goal = { theta: 0, phi: 1.1, r: 10, pan: new THREE.Vector3() };
    this.cur = { theta: 0, phi: 1.1, r: 10, pan: new THREE.Vector3() };
    this.limits = { rMin: 1.3, rMax: 500 };
    this.follow = null;              // () => THREE.Vector3
    this.lock = null;                // () => unit vector the azimuth/polar angle are measured relative to
    this.base = new THREE.Vector3(); // resolved follow position
    this.blendFrom = null; this.blendT = 1;
    this.keys = new Set();
    this.pointers = new Map();
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.tmp3 = new THREE.Vector3();
    this.eff = new THREE.Vector3();
    this.down = null;
    this._bind();
  }

  setPreset(p, immediate = false) {
    const g = this.goal;
    if (p.theta !== undefined) g.theta = p.theta;
    if (p.phi !== undefined) g.phi = p.phi;
    if (p.r !== undefined) g.r = p.r;
    if (p.pan) g.pan.copy(p.pan); else if (p.resetPan !== false) g.pan.set(0, 0, 0);
    if (p.follow !== undefined && p.follow !== this.follow) {
      this.blendFrom = this.eff.clone(); this.blendT = immediate ? 1 : 0;
      this.follow = p.follow;
    }
    if (p.limits) this.limits = p.limits;
    if (p.lock !== undefined) this.lock = p.lock;
    if (immediate) {
      this.cur.theta = g.theta; this.cur.phi = g.phi; this.cur.r = g.r; this.cur.pan.copy(g.pan);
      this.blendT = 1;
    } else {
      // take the shortest way round for the azimuth
      let d = ((g.theta - this.cur.theta + Math.PI) % TAU + TAU) % TAU - Math.PI;
      g.theta = this.cur.theta + d;
    }
  }

  isSettling() {
    const g = this.goal, c = this.cur;
    return this.keys.size > 0 || this.blendT < 1 || Math.abs(g.theta - c.theta) > 1e-4 || Math.abs(g.phi - c.phi) > 1e-4 ||
      Math.abs(g.r - c.r) > g.r * 1e-4 || g.pan.distanceToSquared(c.pan) > 1e-6;
  }

  zoomBy(f) { this.goal.r = clamp(this.goal.r * f, this.limits.rMin, this.limits.rMax); }

  update(dt) {
    const g = this.goal, c = this.cur;
    // keyboard
    if (this.keys.size) {
      const rot = 1.5 * dt, zoom = Math.exp(1.2 * dt);
      const k = this.keys;
      if (k.has('ArrowLeft')) g.theta += rot;
      if (k.has('ArrowRight')) g.theta -= rot;
      if (k.has('ArrowUp')) g.phi -= rot;
      if (k.has('ArrowDown')) g.phi += rot;
      if (k.has('Equal') || k.has('NumpadAdd') || k.has('PageUp')) this.zoomBy(1 / zoom);
      if (k.has('Minus') || k.has('NumpadSubtract') || k.has('PageDown')) this.zoomBy(zoom);
      const pan = 0.8 * dt * g.r;
      if (k.has('KeyW')) this._pan(0, pan);
      if (k.has('KeyS')) this._pan(0, -pan);
      if (k.has('KeyA')) this._pan(-pan, 0);
      if (k.has('KeyD')) this._pan(pan, 0);
    }
    g.phi = clamp(g.phi, 0.04, Math.PI - 0.04);
    g.r = clamp(g.r, this.limits.rMin, this.limits.rMax);

    const a = 1 - Math.exp(-dt * 9);
    c.theta += (g.theta - c.theta) * a;
    c.phi += (g.phi - c.phi) * a;
    c.r += (g.r - c.r) * (1 - Math.exp(-dt * 8));
    c.pan.lerp(g.pan, a);

    // target
    if (this.follow) this.base.copy(this.follow()); else this.base.set(0, 0, 0);
    this.eff.copy(this.base).add(c.pan);
    if (this.blendT < 1 && this.blendFrom) {
      this.blendT = Math.min(1, this.blendT + dt / 0.9);
      this.eff.lerpVectors(this.blendFrom, this.eff, ease(this.blendT));
    }
    let thE = c.theta, phE = c.phi;
    if (this.lock) {
      const d = this.lock();
      if (d) { thE += Math.atan2(d.x, d.z); phE = clamp(c.phi + Math.acos(clamp(d.y, -1, 1)) - Math.PI / 2, 0.02, Math.PI - 0.02); }
    }
    const sp = Math.sin(phE);
    this.camera.position.set(
      this.eff.x + c.r * sp * Math.sin(thE),
      this.eff.y + c.r * Math.cos(phE),
      this.eff.z + c.r * sp * Math.cos(thE));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.eff);
    this.camera.near = Math.max(0.005, c.r * 0.01);
    this.camera.far = 40000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  _pan(dx, dy) {
    const cam = this.camera;
    const right = this.tmp.setFromMatrixColumn(cam.matrixWorld, 0);
    const up = this.tmp2.setFromMatrixColumn(cam.matrixWorld, 1);
    this.goal.pan.addScaledVector(right, dx).addScaledVector(up, dy);
    // keep the pan from drifting off to nowhere
    const m = this.goal.r * 8 + 20;
    if (this.goal.pan.length() > m) this.goal.pan.setLength(m);
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      d.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey || e.ctrlKey || e.metaKey });
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), n: this.pointers.size, moved: 0 };
      if (this.pointers.size === 2) { this.down.n = 2; this._pinchInit(); }
      this.hooks.onInteract && this.hooks.onInteract();
    });
    d.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.down) this.down.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 1) {
        if (p.button === 2 || p.button === 1 || p.shift) {
          const k = this.goal.r * 0.0016;
          this._pan(-dx * k, dy * k);
        } else {
          this.goal.theta -= dx * 0.0055;
          this.goal.phi -= dy * 0.0055;
        }
        p.x = e.clientX; p.y = e.clientY;
      } else if (this.pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        this._pinchMove();
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.down && this.pointers.size === 0 && this.down.n === 1) {
        const dt = performance.now() - this.down.t;
        if (this.down.moved < 8 && dt < 450 && e.type === 'pointerup' && p.button === 0 && !p.shift)
          this.hooks.onTap && this.hooks.onTap(e.clientX, e.clientY);
      }
      if (this.pointers.size === 1) { this._pinch = null; }
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0016;
      this.zoomBy(Math.exp(e.deltaY * k));
      this.hooks.onInteract && this.hooks.onInteract();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) {
        if (!(t.type === 'range' && false)) return;
      }
      const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
        'PageUp', 'PageDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
      if (handled.includes(e.code)) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        this.keys.add(e.code); e.preventDefault();
        this.hooks.onInteract && this.hooks.onInteract();
      } else {
        this.hooks.onKey && this.hooks.onKey(e);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _pinchInit() {
    const [a, b] = [...this.pointers.values()];
    this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  _pinchMove() {
    if (!this._pinch) return this._pinchInit();
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    this.zoomBy(this._pinch.d / d);
    const k = this.goal.r * 0.0016;
    this._pan(-(cx - this._pinch.cx) * k, (cy - this._pinch.cy) * k);
    this._pinch = { d, cx, cy };
  }
}
