// Clucko · the one WebGL canvas. Every 3D act is pinned to a DOM element with [data-stage].
// The two journey eggs are a pure function of scroll once laid, so scrolling back up retraces the trip.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Hen, StrawPuff } from './three/hen.js';
import { Egg, EGG } from './three/egg.js';
import { Carton } from './three/carton.js';
import { Farm } from './three/farm.js';
import { rng, glowTexture } from './three/textures.js';

const { MathUtils: M } = THREE;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const UP = V(0, 1, 0);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const R = rng(2024);
const $ = (s) => document.querySelector(s);

function signalReady(ok) {
  window.__cluckoWorld = { ready: true, ok };
  window.dispatchEvent(new CustomEvent('clucko:world-ready', { detail: { ok } }));
}

/* ---------------------------------------------------------------- renderer */

const canvas = document.getElementById('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  console.warn('[clucko] WebGL unavailable, running without the 3D world.', err);
  root.classList.add('no-webgl');
  signalReady(false);
  throw err;
}
function setupRenderer(r) {
  r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
setupRenderer(renderer);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const CAM_Z = 12;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0, CAM_Z);

/* ------------------------------------------------------------------ lights */

function addLights(target) {
  target.add(new THREE.HemisphereLight('#fff2da', '#cf8c4c', 0.9));
  const key = new THREE.DirectionalLight('#ffe3ba', 2.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 40;
  const rim = new THREE.DirectionalLight('#a6d4ff', 1.5);
  rim.position.set(-6, 4, -6);
  const fill = new THREE.DirectionalLight('#ffc48c', 0.55);
  fill.position.set(-7, 1, 5);
  target.add(key, key.target, rim, fill);
  return key;
}
const key = addLights(scene);
const KEY_OFFSET = V(3.6, 6.8, 6.2);

/* ------------------------------------------------------------ stage system */

const view = { w: 1, h: 1, phone: false };
const acts = [];

class Act {
  constructor(name, el, layout, shadow = 2.6) {
    this.name = name;
    this.el = el;
    this.layoutFn = layout;
    this.shadow = shadow;
    this.group = new THREE.Group();
    this.x = 0; this.y = 0; this.s = 1;
    this.dist = Infinity;
    this.onScreen = false;
    this.rect = null;
    scene.add(this.group);
    acts.push(this);
  }
  layout() {
    Object.assign(this, this.layoutFn(view));
  }
  /** World y = the stage's offset from the viewport centre, converted to world units. Placed even off screen. */
  place() {
    const r = (this.rect = this.el.getBoundingClientRect());
    const ih = window.innerHeight;
    const centre = r.top + r.height / 2;
    this.group.position.set(this.x, (-(centre - ih / 2) / ih) * view.h + this.y, 0);
    this.group.scale.setScalar(this.s);
    this.onScreen = r.bottom > -ih * 0.6 && r.top < ih * 1.6;
    this.group.visible = this.onScreen;
    this.dist = Math.abs(centre - ih / 2);
    this.group.updateMatrixWorld(true);
  }
}

const progressOf = (el) => {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? clamp01(-r.top / span) : r.top <= 0 ? 1 : 0;
};

const heroEl = $('[data-stage="hero"]');
const eggsSec = $('#eggs'), boxSec = $('#box'), farmSec = $('#farm');
const packsGrid = $('.packs__grid');

/* ---------------------------------------------------------------- hero act */

const hero = new Act('hero', heroEl, (v) =>
  v.phone
    ? { x: 0, y: -v.h * 0.29, s: Math.min(0.86, v.w * 0.24) }
    : { x: v.w * 0.21, y: -v.h * 0.12, s: Math.min(v.h * 0.235, v.w * 0.125) }
);
hero.group.rotation.x = 0.2; // look slightly down into the nest

const hen = new Hen();
hen.group.rotation.y = -2.62; // three-quarter view, beak toward the copy
hero.group.add(hen.group);

const puff = new StrawPuff();
hero.group.add(puff.mesh);

/* ---------------------------------------------------------------- eggs act */

const eggsAct = new Act('eggs', $('[data-stage="eggs"]'), (v) =>
  v.phone
    ? { x: 0, y: -v.h * 0.01, s: v.w * 0.2 }
    : { x: 0, y: -v.h * 0.03, s: Math.min(v.h * 0.2, v.w * 0.11) },
  2.4
);
const STAGE_S = 1.5;
const slotX = () => (view.phone ? 1.1 : 1.3);
const blobs = [0, 1].map(() => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#6b3410', transparent: true, opacity: 0, depthWrite: false })
  );
  m.scale.set(1.15, 0.24, 1);
  eggsAct.group.add(m);
  return m;
});

/* ----------------------------------------------------------------- box act */

const box = new Act('box', $('[data-stage="box"]'), (v) =>
  v.phone
    ? { x: 0, y: -v.h * 0.16, s: v.w * 0.17 }
    : { x: v.w * 0.19, y: -v.h * 0.02, s: Math.min(v.w * 0.074, v.h * 0.15) },
  3.4
);
const RESERVED = [2, 3]; // the two middle front cups
const carton = new Carton({ cols: 6, kind: 'brown', reserved: RESERVED });
box.group.add(carton.group);
let boxKind = 'brown';
window.addEventListener('clucko:box-kind', (e) => {
  boxKind = e.detail.kind;
  carton.setKind(boxKind);
});

/* ---------------------------------------------------------------- farm act */

const farmAct = new Act('farm', $('[data-stage="farm"]'), (v) =>
  v.phone
    ? { x: 0, y: -v.h * 0.17, s: v.w * 0.125 }
    : { x: v.w * 0.2, y: -v.h * 0.03, s: Math.min(v.w * 0.068, v.h * 0.125) },
  4.2
);
farmAct.group.rotation.x = 0.3;
const farm = new Farm();
farmAct.group.add(farm.group);

/* ----------------------------------------------------------- laying eggs */

const EGG_S = 0.5; // egg scale in the hero, relative to the hen
const BED = 0.05;
const LAY_FROM = V(-0.05, 0.42, 0.62); // pops out from under her, at the front of the nest

class LaidEgg {
  constructor(egg, land, { instant = false, tilt = 0 } = {}) {
    this.egg = egg;
    this.land = land.clone();
    this.u = instant ? 1 : -1; // -1 = not laid yet, 0..1 in flight, 1 landed
    this.age = instant ? 99 : 0;
    this.yaw = R() * TAU;
    this.tilt = tilt;
    this.spin = (R() < 0.5 ? -1 : 1) * TAU;
    this.pos = V();
    this.quat = new THREE.Quaternion();
    this.scale = 0;
    this.sy = this.sxz = 1;
    this.onLand = null;
    this._e = new THREE.Euler();
    this._o = V();
  }
  launch() { if (this.u < 0) { this.u = 0; this.age = 0; } }
  /** Scrolled away mid-intro: finish the flight quickly instead of snapping, so nothing pops. */
  hurry() { this.launch(); this.rush = 3; }

  /** Pose in act-local space: arc out of the hen, land with a squash and a puff, rock to rest. */
  update(dt) {
    if (this.u < 0) { this.scale = 0; return; }
    if (this.u < 1) {
      this.u = Math.min(1, this.u + (dt * (this.rush || 1)) / 0.9);
      if (this.u >= 1) { this.age = 0; this.onLand && this.onLand(this); }
    } else this.age += dt;

    const u = this.u, a = this.age;
    const landed = u >= 1;
    const sq = landed ? Math.exp(-a * 7) * Math.cos(a * 22) * 0.24 : 0;
    this.sy = 1 - sq;
    this.sxz = 1 + sq * 0.5;
    const rock = landed ? Math.exp(-a * 3.1) * Math.sin(a * 12.5) : 0;
    this._e.set(rock * 0.3 + (landed ? this.tilt : 0), this.yaw, rock * 0.22 + (landed ? 0 : (1 - u) * this.spin), 'YXZ');
    this.quat.setFromEuler(this._e);
    if (!landed) {
      this.pos.lerpVectors(LAY_FROM, this.land, u);
      this.pos.y = M.lerp(LAY_FROM.y, this.land.y + EGG.a * EGG_S, u) + Math.sin(Math.PI * u) * 1.05;
    } else {
      this._o.set(0, EGG.a * EGG_S * this.sy, 0).applyQuaternion(this.quat); // rock about the contact point
      this.pos.copy(this.land).add(this._o);
    }
    this.scale = EGG_S * Math.min(1, 0.3 + u * 2.6);
  }
}

// The two journey eggs live in world space.
const LAND = [V(-0.5, BED, 1.12), V(0.22, BED, 1.2)];
const journey = [
  new LaidEgg(new Egg('brown', { crackable: true, hinge: -1, seed: 5 }), LAND[0], { instant: reduce, tilt: 0.06 }),
  new LaidEgg(new Egg('white', { crackable: true, hinge: 1, seed: 9 }), LAND[1], { instant: reduce, tilt: -0.05 }),
];
journey.forEach((j) => {
  j.onLand = (e) => puff.burst(e.land, 18, 1);
  scene.add(j.egg.group);
});

// bonus eggs: laid on request, they shrink away after a few seconds
const bonus = [];
function spawnBonus() {
  let land = null;
  for (let tries = 0; tries < 14 && !land; tries++) {
    const c = V(-0.95 + R() * 1.75, BED, 0.95 + R() * 0.35);
    if ([...journey, ...bonus].every((e) => e.land.distanceTo(c) > 0.36) || tries === 13) land = c;
  }
  const e = new LaidEgg(new Egg(R() < 0.5 ? 'brown' : 'white'), land, { tilt: (R() - 0.5) * 0.12 });
  e.onLand = (x) => puff.burst(x.land, 14, 0.9);
  e.launch();
  hero.group.add(e.egg.group);
  bonus.push(e);
}
function updateBonus(dt) {
  for (let i = bonus.length - 1; i >= 0; i--) {
    const e = bonus[i];
    e.update(dt);
    if (e.u >= 1 && e.age > 3.2) {
      const k = Math.min(1, (e.age - 3.2) / 0.45);
      e.scale *= 1 - smooth(k);
      if (k >= 1) {
        hero.group.remove(e.egg.group);
        bonus.splice(i, 1);
        continue;
      }
    }
    const g = e.egg.group;
    g.visible = e.scale > 0.001;
    g.position.copy(e.pos);
    g.quaternion.copy(e.quat);
    g.scale.set(e.scale * e.sxz, e.scale * e.sy, e.scale * e.sxz);
  }
}

/* ------------------------------------------------------------- the journey */

const pose = () => ({ p: V(), q: new THREE.Quaternion(), s: 1, sy: 1, sxz: 1 });
const A = [pose(), pose()], B = [pose(), pose()], C = [pose(), pose()], D = [pose(), pose()], OUT = [pose(), pose()];
const _e = new THREE.Euler(), _qs = new THREE.Quaternion();
let gutterLeft = 64;

function heroPose(i, out) {
  const L = journey[i];
  out.p.copy(L.pos).applyMatrix4(hero.group.matrixWorld);
  out.q.copy(hero.group.quaternion).multiply(L.quat);
  out.s = L.scale * hero.s;
  out.sy = L.sy;
  out.sxz = L.sxz;
  return out;
}
function stagePose(i, out, time, open) {
  const side = i ? 1 : -1;
  out.p.set(side * slotX(), Math.sin(time * 1.4 + i * 1.7) * 0.06, 0).applyMatrix4(eggsAct.group.matrixWorld);
  out.q.setFromEuler(_e.set(0.5 * open, -side * 0.18 * (1 - open), 0, 'XYZ'));
  out.s = STAGE_S * eggsAct.s;
  out.sy = out.sxz = 1;
  return out;
}
/** In the middle of the page margin, never closer than its own width to the edge, at z = 0. */
function gutterPose(i, out, time) {
  const ppw = window.innerHeight / view.h;
  const sG = M.clamp((gutterLeft * 0.55) / (2 * EGG.b * ppw), 0.42, 0.95);
  const eggW = 2 * EGG.b * sG * ppw;
  const xpx = Math.max(gutterLeft / 2, eggW);
  const side = i ? 1 : -1;
  out.p.set(-side * (xpx / window.innerWidth - 0.5) * view.w, -side * view.h * 0.06 + Math.sin(time * 1.2 + i * 2) * 0.08, 0);
  out.q.setFromEuler(_e.set(0.15, time * 0.7 + i * 2, side * 0.18, 'YXZ'));
  out.s = sG;
  out.sy = out.sxz = 1;
  return out;
}
function blend(a, b, t, arc, out) {
  out.p.lerpVectors(a.p, b.p, t);
  out.p.y += Math.sin(Math.PI * t) * arc;
  out.q.slerpQuaternions(a.q, b.q, t);
  out.s = M.lerp(a.s, b.s, t);
  out.sy = M.lerp(a.sy, b.sy, t);
  out.sxz = M.lerp(a.sxz, b.sxz, t);
  return out;
}
const crackAt = (e) => (e < 0.8 ? seg(e, 0.42, 0.64) : 1 - seg(e, 0.8, 0.93));

function updateJourney(dt, time, k, e, j) {
  const c = crackAt(e);
  const open = smooth((c - 0.35) / 0.65);
  journey.forEach((L, i) => {
    if (k > 0.001 && L.u < 1) L.hurry(); // scrolled before she finished laying
    L.update(dt);
    L.egg.setCrack(j > 0 ? 0 : c);
    heroPose(i, A[i]);
    stagePose(i, B[i], time, open);
    let out;
    if (j <= 0) {
      if (k <= 0) out = A[i];
      else if (k >= 1) out = B[i];
      else {
        out = blend(A[i], B[i], k, 1.3, OUT[i]);
        out.q.premultiply(_qs.setFromAxisAngle(UP, TAU * k)); // one full spin on the way
      }
    } else {
      gutterPose(i, C[i], time);
      carton.cupPose(RESERVED[i], D[i]);
      if (j < 0.22) out = blend(B[i], C[i], smooth(j / 0.22), 0.4, OUT[i]);
      else if (j < 0.56) out = C[i];
      else out = blend(C[i], D[i], smooth((j - 0.56) / 0.44), 1.1, OUT[i]);
    }
    const g = L.egg.group;
    g.visible = out.s > 0.001;
    g.position.copy(out.p);
    g.quaternion.copy(out.q);
    g.scale.set(out.s * out.sxz, out.s * out.sy, out.s * out.sxz);
    g.updateMatrixWorld(true);
    // the journey eggs keep their own colours in the box, so you can always spot them
  });

  // soft blob shadows under the floating eggs
  const w = smooth(k) * (1 - smooth(j / 0.15));
  blobs.forEach((b, i) => {
    const bob = Math.sin(time * 1.4 + i * 1.7) * 0.06;
    b.position.set((i ? 1 : -1) * slotX(), -EGG.a * STAGE_S - 0.22, -0.4);
    b.material.opacity = 0.42 * w * (1 - bob * 2);
    b.visible = w > 0.01;
  });
}

/* ------------------------------------------------ tags and leader lines */

const tagEls = [...document.querySelectorAll('.tag')];
const leaderSvg = $('.leaders');
const leaders = tagEls.map(() => {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  leaderSvg && leaderSvg.appendChild(p);
  return p;
});
const tagGeo = tagEls.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
const TAG_PTS = [
  [V(-0.22, 0.24, 0.17), V(-0.3, -0.02, 0.12), V(-0.21, -0.27, 0.18)],
  [V(0.22, 0.24, 0.17), V(0.3, -0.02, 0.12), V(0.21, -0.27, 0.18)],
];
function measureTags() {
  tagEls.forEach((el, n) => Object.assign(tagGeo[n], { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  document.querySelectorAll('[data-spot]').forEach((el) => (el._cardW = el.lastElementChild.offsetWidth));
}
const _p = V();
function updateTags(e) {
  const sr = eggsAct.rect;
  tagEls.forEach((el, n) => {
    const i = +el.dataset.egg, idx = +el.dataset.i;
    const start = 0.04 + (idx * 2 + i) * 0.045;
    const v = smooth((e - start) / 0.06) * (1 - smooth((e - 0.37) / 0.05));
    const dx = (1 - v) * (i ? 26 : -26);
    el.style.opacity = v.toFixed(3);
    el.style.transform = `translate3d(${dx.toFixed(1)}px,0,0)`;
    el.style.visibility = v > 0.005 ? 'visible' : 'hidden';
    const path = leaders[n];
    if (view.phone || v < 0.01) {
      path.style.opacity = 0;
      return;
    }
    journey[i].egg.group.localToWorld(_p.copy(TAG_PTS[i][idx])).project(camera);
    const px = (_p.x * 0.5 + 0.5) * window.innerWidth - sr.left;
    const py = (-_p.y * 0.5 + 0.5) * window.innerHeight - sr.top;
    const g = tagGeo[n];
    const ax = g.x + (i ? 0 : g.w) + dx + (i ? -8 : 8);
    const ay = g.y + g.h / 2;
    const mx = (ax + px) / 2;
    path.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} C${mx.toFixed(1)} ${ay.toFixed(1)} ${mx.toFixed(1)} ${py.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`);
    path.style.opacity = v.toFixed(3);
  });
}

/* ------------------------------------------------------------ the carton */

function updateCarton(P) {
  const all = reduce ? 1 : null;
  carton.setFill(all ?? seg(P, 0.02, 0.32));
  carton.setLid(all ?? seg(P, 0.38, 0.55));
  carton.setSticker(all ?? seg(P, 0.6, 0.72));
  const tip = smooth(seg(P, 0.76, 0.95));
  carton.group.rotation.set(M.lerp(0.5, 1.12, tip), M.lerp(-0.4, -0.05, tip), 0);
  carton.group.position.y = M.lerp(0, 0.5, tip);
  carton.group.updateMatrixWorld(true);
}

/* -------------------------------------------------------------- the farm */

const spotEls = [...document.querySelectorAll('[data-spot]')];
function updateFarm(dt, time, F) {
  const beta = M.lerp(1.15, -0.8, F); // about 110°
  farm.group.rotation.y = beta;
  farm.update(dt, time);
  farm.group.updateMatrixWorld(true);
  const sr = farmAct.rect;
  spotEls.forEach((el) => {
    const keyName = el.dataset.spot;
    const a = Math.atan2(Math.sin(farm.psi[keyName] + beta), Math.cos(farm.psi[keyName] + beta));
    const v = clamp01((0.42 - Math.abs(a)) / 0.14);
    el.classList.toggle('is-on', v > 0.5);
    farm.group.localToWorld(_p.copy(farm.hotspots[keyName])).project(camera);
    const x = (_p.x * 0.5 + 0.5) * window.innerWidth - sr.left;
    const y = (-_p.y * 0.5 + 0.5) * window.innerHeight - sr.top;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    // card beside the dot (right, else left); when neither fits, clamp it inside the stage below the dot
    const cw = el._cardW || 240, pad = 16;
    let off = 22, beside = true;
    if (x + off + cw > sr.width - pad) off = -22 - cw;
    if (x + off < pad) {
      off = Math.min(pad - x, sr.width - pad - cw - x);
      beside = false;
    }
    const card = el.lastElementChild;
    card.style.left = `${off.toFixed(0)}px`;
    card.style.top = beside ? '-14px' : '24px';
    el.classList.toggle('is-flip', beside && off < 0);
  });
}

/* --------------------------------------------------- poke the hen / bubble */

const bubble = document.getElementById('bubble');
const PHRASES = ['Bok bok!', 'Henlo!', 'Fresh one!', 'Still warm!', 'Bawk?'];
let bubbleT = 0, phrase = 0;
function ask() {
  if (!hero.onScreen || hen.queue.length > 1 || bonus.length > 4) return;
  hen.cluck = 0.5;
  hen.lay(spawnBonus);
  if (bubble) {
    bubble.textContent = PHRASES[phrase++ % PHRASES.length];
    bubbleT = 1.8;
  }
}
window.addEventListener('clucko:ask', ask);
document.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', ask));

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitsHen(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(hen.hit, false).length > 0;
}
heroEl.addEventListener('click', (e) => {
  if (e.target.closest('a, button, input')) return;
  if (hero.onScreen && hitsHen(e)) ask();
});
heroEl.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  heroEl.classList.toggle('is-over-hen', !e.target.closest('a, button') && hitsHen(e));
});

/* ----------------------------------------------------------------- pointer */

const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
const pointerWorld = V();
const lookPlane = new THREE.Plane(V(0, 0, 1), -2.5);

/* ------------------------------------------------------------------- start */

let started = false;
function start() {
  if (started) return;
  started = true;
  if (reduce) return;
  gsap.delayedCall(0.5, () => hen.lay(() => journey[0].launch()));
  gsap.delayedCall(2.1, () => hen.lay(() => journey[1].launch()));
}
window.addEventListener('clucko:start', start);
if (window.__cluckoStarted) start();

/* -------------------------------------------------------------------- loop */

const _v = V(), _w = V();
let lightAct = null, canvasFront = false;
const state = { journeyIn: false };

function frame(time, deltaMs) {
  const dt = Math.min(deltaMs / 1000, 1 / 20);
  const ih = window.innerHeight;

  // camera nudged by the pointer
  pointer.sx = M.damp(pointer.sx, pointer.x, 3, dt);
  pointer.sy = M.damp(pointer.sy, pointer.y, 3, dt);
  camera.position.set(pointer.sx * 0.35, pointer.sy * 0.22, CAM_Z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  acts.forEach((a) => a.place());

  // scroll progress for every leg
  const hr = hero.rect;
  const k = smooth(clamp01(-hr.top / hr.height));
  const e = progressOf(eggsSec);
  const er = eggsSec.getBoundingClientRect(), br = boxSec.getBoundingClientRect();
  const j = clamp01((ih - er.bottom) / (br.top - er.bottom + ih));
  const P = progressOf(boxSec);
  state.journeyIn = j >= 1;

  // the carton goes first so the cups are current for the eggs
  updateCarton(P);

  // hero
  ndc.set(pointer.x, pointer.y);
  raycaster.setFromCamera(ndc, camera);
  raycaster.ray.intersectPlane(lookPlane, pointerWorld);
  if (hero.onScreen) {
    const eggPts = journey.filter((L) => L.u >= 1 && k < 0.05).map((L) => L.egg.group.position);
    hen.update(dt, time, { pointer: pointerWorld, eggs: eggPts });
  }
  puff.update(dt);
  updateBonus(dt);

  updateJourney(dt, time, k, e, j);
  if (eggsAct.onScreen) updateTags(e);
  if (farmAct.onScreen) updateFarm(dt, time, progressOf(farmSec));

  // for the gutter leg the transparent, click-through canvas steps in front of the copy
  // (and on the way from the nest to the stage, so they pass over the marquee, not behind it)
  const front = (j > 0 && j < 1) || (k > 0.02 && k < 0.98);
  if (front !== canvasFront) {
    canvasFront = front;
    root.classList.toggle('canvas-front', front);
  }

  // key light and its shadow camera follow the act nearest the viewport centre
  const nearest = acts.reduce((a, b) => (b.dist < a.dist ? b : a));
  key.position.copy(nearest.group.position).addScaledVector(KEY_OFFSET, nearest.s);
  key.target.position.copy(nearest.group.position);
  const ext = nearest.shadow * nearest.s;
  if (lightAct !== nearest || key.shadow.camera.right !== ext) {
    const c = key.shadow.camera;
    c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext;
    c.updateProjectionMatrix();
    lightAct = nearest;
  }

  // speech bubble follows her head
  if (bubble) {
    bubbleT = Math.max(0, bubbleT - dt);
    const on = bubbleT > 0 && hero.onScreen;
    bubble.classList.toggle('is-on', on);
    if (on) {
      hen.headWorld(_v);
      _w.copy(_v).project(camera);
      const x = (_w.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-_w.y * 0.5 + 0.5) * ih - 40 * hero.s;
      bubble.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-30%, -100%)`;
    }
  }

  renderer.render(scene, camera);
}

/* ----------------------------------------------- pack photos from the carton */

/** Renders the real carton (both colours, all three sizes) in an offscreen renderer, as WebP data URLs. */
function renderPackShots() {
  const W = 720, H = 540;
  const off = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  off.setPixelRatio(1);
  off.setSize(W, H, false);
  setupRenderer(off);
  const s = new THREE.Scene();
  s.environment = new THREE.PMREMGenerator(off).fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.6;
  const k = addLights(s);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.2 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -0.46;
  catcher.receiveShadow = true;
  s.add(catcher);
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 60);
  const shots = {};
  [6, 10, 12].forEach((n) => {
    ['brown', 'white'].forEach((kind) => {
      const c = new Carton({ cols: n / 2, kind });
      c.setFill(1);
      c.setLid(0);
      c.group.rotation.y = -0.42;
      s.add(c.group);
      const L = c.size.L;
      const d = 4.2 + L * 1.05;
      cam.position.set(0.3, d * 0.62, d * 0.8);
      cam.lookAt(0, 0.05, -0.3);
      k.position.set(3, 7, 5);
      k.target.position.set(0, 0, 0);
      const e = L * 0.75 + 1.6;
      Object.assign(k.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
      k.shadow.camera.updateProjectionMatrix();
      off.render(s, cam);
      shots[`${kind}-${n}`] = off.domElement.toDataURL('image/webp', 0.86);
      s.remove(c.group);
    });
  });
  off.dispose();
  off.forceContextLoss();
  return shots;
}

/* -------------------------------------------------------------------- boot */

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  view.h = 2 * CAM_Z * Math.tan(M.degToRad(camera.fov / 2));
  view.w = view.h * camera.aspect;
  view.phone = w < 760;
  acts.forEach((a) => a.layout());
  gutterLeft = packsGrid ? Math.max(0, packsGrid.getBoundingClientRect().left) : w * 0.06;
  measureTags();
}
resize();
window.addEventListener('resize', resize);
if (document.fonts) document.fonts.ready.then(resize);

acts.forEach((a) => a.place());
updateCarton(0);
journey.forEach((L, i) => {
  L.update(0);
  heroPose(i, A[i]);
});
renderer.compile(scene, camera);
renderer.render(scene, camera);

try {
  window.cluckoShots = renderPackShots();
  window.dispatchEvent(new CustomEvent('clucko:shots', { detail: window.cluckoShots }));
} catch (err) {
  console.warn('[clucko] pack photos could not be rendered', err);
}

gsap.ticker.add(frame);
requestAnimationFrame(() => signalReady(true));

// handy for tuning in the console
window.cluckoWorld = { scene, camera, renderer, acts, hen, journey, carton, farm, view, ask, state };
