// Clucko · the procedural hen and her nest.
// Hen-local axes: +x forward (beak), +y up, ±z her sides. Nest centred on the origin.
// The feathered nest hen (hero), plus low-poly farm hens in six breeds and chicks (farm island).
import * as THREE from 'three';
import { featherTexture, rng } from './textures.js';

const { MathUtils: M } = THREE;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));

export const HEN_COLORS = {
  cream: '#f6e2b6',
  gold: '#e7a441',
  russet: '#a3471b',
  deep: '#6a2711',
  hackle: '#eb9b34',
  hackleDark: '#b9581d',
  covert: '#9a3f17',
  secondary: '#7a2f12',
  primary: '#3e1b0d',
  comb: '#e1272b',
  face: '#d63a2d',
  beak: '#eab55c',
  iris: '#f39a1a',
  tail: '#3c150a',
  straw: ['#ecc96e', '#ddb050', '#c99339', '#f3dc95', '#b67f30', '#e3be62'],
};

const BODY_C = V(0, 0.66, 0);
const BODY_R = V(0.68, 0.54, 0.5);
const NECK_A = V(0.42, 0.98, 0);
const HEAD_P = V(0.66, 1.37, 0);
const HEAD_R = V(0.2, 0.18, 0.165);

/* ------------------------------------------------------------- helpers */

const fib = (i, n) => {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const th = i * 2.399963229728653;
  return V(r * Math.cos(th), y, r * Math.sin(th));
};
const onEllipsoid = (C, R, p) => V(C.x + p.x * R.x, C.y + p.y * R.y, C.z + p.z * R.z);
const ellNormal = (R, p) => V(p.x / R.x, p.y / R.y, p.z / R.z).normalize();

function ramp(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return new THREE.Color(c0).lerp(new THREE.Color(c1), (t - t0) / (t1 - t0));
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

const hsl = {};
function jitter(color, R, dh = 0.015, ds = 0.07, dl = 0.06) {
  const c = new THREE.Color(color);
  c.getHSL(hsl);
  return c.setHSL(hsl.h + (R() - 0.5) * 2 * dh, clamp01(hsl.s + (R() - 0.5) * 2 * ds), clamp01(hsl.l + (R() - 0.5) * 2 * dl));
}

const BODY_STOPS = [
  [0, HEN_COLORS.cream],
  [0.36, HEN_COLORS.gold],
  [0.68, HEN_COLORS.russet],
  [1, HEN_COLORS.deep],
];
const bodyT = (p) => 0.6 + 0.5 * p.y - 0.3 * p.x;

let FEATHER_GEO = null;
function featherGeometry() {
  if (FEATHER_GEO) return FEATHER_GEO;
  const g = new THREE.PlaneGeometry(1, 1, 2, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, 0.09 * (1 - 4 * x * x) - 0.07 * y * y); // cupped across, tip curls back to the body
  }
  g.computeVertexNormals();
  return (FEATHER_GEO = g);
}

let FEATHER_MAT = null;
function featherMaterial() {
  return (FEATHER_MAT ||= new THREE.MeshPhysicalMaterial({
    map: featherTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffd9a0'),
  }));
}

/**
 * Instanced feather cards. Each item: { pos, normal, flow, len, wid, lift, color }.
 * The card's long axis follows `flow` projected onto the surface, its face looks along the normal,
 * and the tip lifts off the surface by `lift` so neighbours shingle.
 */
const _m = new THREE.Matrix4(), _X = V(), _Y = V(), _Z = V(), _T = V();
function featherField(items) {
  const mesh = new THREE.InstancedMesh(featherGeometry(), featherMaterial(), items.length);
  items.forEach((f, i) => {
    const n = f.normal;
    _T.copy(f.flow).addScaledVector(n, -n.dot(f.flow));
    if (_T.lengthSq() < 1e-6) _T.set(0, -1, 0).addScaledVector(n, n.y);
    _T.normalize();
    _X.crossVectors(_T, n).normalize();
    _Y.copy(_T).addScaledVector(n, f.lift ?? 0.3).normalize();
    _Z.crossVectors(_X, _Y).normalize();
    _m.makeBasis(_X.multiplyScalar(f.wid), _Y.multiplyScalar(f.len), _Z.multiplyScalar(f.len));
    _m.setPosition(f.pos);
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, f.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** A tapering ribbon along a curve, for the sickle feathers. */
function ribbon(curve, width, segs = 32) {
  const pos = [], uv = [], idx = [];
  const side = V(), zAxis = V(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    side.crossVectors(tan, zAxis).normalize();
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.82)), 0.6) * 0.5;
    pos.push(p.x - side.x * w, p.y - side.y * w, p.z, p.x + side.x * w, p.y + side.y * w, p.z);
    uv.push(0, t, 1, t);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ellipsoid = (rx, ry, rz, mat, w = 32, h = 24) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, w, h), mat);
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/* ------------------------------------------------------------------ nest */

export function makeNest(seed = 41) {
  const R = rng(seed);
  const nest = new THREE.Group();
  const RING = 1100, BED = 520;
  const geo = new THREE.CylinderGeometry(0.011, 0.008, 1, 5, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  const straws = new THREE.InstancedMesh(geo, mat, RING + BED);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V(), dir = V();
  const yAxis = V(0, 1, 0);
  let n = 0;
  const put = (pos, d, len, col) => {
    q.setFromUnitVectors(yAxis, d.normalize());
    s.set(1 + R() * 0.6, len, 1 + R() * 0.6);
    m.compose(pos, q, s);
    straws.setMatrixAt(n, m);
    straws.setColorAt(n, jitter(HEN_COLORS.straw[Math.floor(R() * HEN_COLORS.straw.length)], R, 0.01, 0.08, 0.07));
    n++;
  };
  for (let i = 0; i < RING; i++) {
    const a = R() * Math.PI * 2;
    const b = -0.2 * Math.PI + R() * 1.3 * Math.PI; // outer side, over the top, into the bowl
    const tr = 0.23 * (0.72 + R() * 0.36);
    const rad = 0.8 + tr * Math.cos(b);
    p.set(rad * Math.cos(a), 0.2 + tr * Math.sin(b), rad * Math.sin(a));
    const tangent = V(-Math.sin(a), 0, Math.cos(a));
    const out = V(Math.cos(a), 0, Math.sin(a));
    dir.copy(tangent).addScaledVector(yAxis, (R() - 0.5) * 1.1).addScaledVector(out, (R() - 0.5) * 0.7);
    put(p, dir, 0.2 + R() * 0.3, null);
  }
  for (let i = 0; i < BED; i++) {
    const a = R() * Math.PI * 2;
    const r = 0.55 + Math.sqrt(R()) * 0.8;
    p.set(r * Math.cos(a), 0.03 + R() * 0.035, r * Math.sin(a));
    const h = R() * Math.PI * 2;
    dir.set(Math.cos(h), (R() - 0.5) * 0.25, Math.sin(h));
    put(p, dir, 0.18 + R() * 0.3, null);
  }
  straws.instanceMatrix.needsUpdate = true;
  straws.instanceColor.needsUpdate = true;
  straws.castShadow = true;
  straws.receiveShadow = true;
  straws.computeBoundingSphere();
  nest.add(straws);

  const bed = ellipsoid(1.38, 0.05, 1.38, new THREE.MeshStandardMaterial({ color: '#d4a54e', roughness: 1 }), 64, 12);
  bed.position.y = 0.0;
  bed.castShadow = false;
  nest.add(bed);

  const bowl = ellipsoid(0.82, 0.14, 0.82, new THREE.MeshStandardMaterial({ color: '#8b5f2b', roughness: 1 }), 48, 12);
  bowl.position.y = 0.16;
  nest.add(bowl);

  const catcher = new THREE.Mesh(new THREE.CircleGeometry(2.8, 64), new THREE.ShadowMaterial({ opacity: 0.16, transparent: true }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -0.04;
  catcher.receiveShadow = true;
  nest.add(catcher);

  nest.userData.bedTop = 0.05;
  return nest;
}

/* ---------------------------------------------------------- straw puff */

export class StrawPuff {
  constructor(count = 48) {
    const geo = new THREE.CylinderGeometry(0.008, 0.006, 0.12, 4, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.p = Array.from({ length: count }, () => ({ pos: V(), vel: V(), spin: V(), rot: new THREE.Euler(), life: 0 }));
    this.R = rng(77);
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = V();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, jitter(HEN_COLORS.straw[i % HEN_COLORS.straw.length], this.R));
    this.update(0);
  }
  burst(at, n = 16, power = 1) {
    const R = this.R;
    for (let k = 0; k < n; k++) {
      const p = this.p[this.next];
      this.next = (this.next + 1) % this.p.length;
      const a = R() * Math.PI * 2;
      p.pos.copy(at).add(V(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08));
      p.vel.set(Math.cos(a) * (0.5 + R()) * power, (1.3 + R() * 1.4) * power, Math.sin(a) * (0.5 + R()) * power);
      p.spin.set((R() - 0.5) * 18, (R() - 0.5) * 18, (R() - 0.5) * 18);
      p.rot.set(R() * 6, R() * 6, R() * 6);
      p.life = 0.75 + R() * 0.4;
    }
  }
  update(dt) {
    this.p.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 6.5 * dt;
        p.vel.multiplyScalar(Math.exp(-1.8 * dt));
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.05) { p.pos.y = 0.05; p.vel.set(0, 0, 0); }
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      const s = p.life > 0 ? Math.min(1, p.life * 3) : 0;
      this._q.setFromEuler(p.rot);
      this._s.setScalar(s);
      this._m.compose(p.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------- hen */

export class Hen {
  constructor({ seed = 3 } = {}) {
    const R = (this.R = rng(seed));
    this.group = new THREE.Group(); // nest + bird
    this.nest = makeNest(seed + 38);
    this.group.add(this.nest);

    this.bird = new THREE.Group(); // squats and breathes
    this.group.add(this.bird);
    this.body = new THREE.Group();
    this.body.rotation.z = 0.08;
    this.bird.add(this.body);

    this._buildBody(R);
    this._buildNeck(R);
    this._buildHead(R);
    this.wings = [1, -1].map((s) => this._buildWing(s, R));
    this._buildTail(R);

    // invisible hit volume for pointer picking
    this.hit = ellipsoid(0.95, 0.9, 0.7, new THREE.MeshBasicMaterial());
    this.hit.position.set(0.05, 0.85, 0);
    this.hit.visible = false;
    this.body.add(this.hit);

    // animation state
    this.layT = -1;
    this.queue = [];
    this.headTimer = 0.4;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.tYaw = 0; this.tPitch = -0.1; this.tRoll = 0;
    this.blinkT = 1 + R() * 2;
    this.blink = 0;
    this.cluck = 0;
  }

  /* ---------- build ---------- */

  _buildBody(R) {
    // underlay, vertex-coloured like the feathers so gaps read as depth
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const pos = geo.attributes.position, col = [];
    const p = V();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const c = ramp(BODY_STOPS, bodyT(p)).multiplyScalar(0.72);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.scale(BODY_R.x * 0.97, BODY_R.y * 0.97, BODY_R.z * 0.97);
    geo.translate(BODY_C.x, BODY_C.y, BODY_C.z);
    const under = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    under.castShadow = under.receiveShadow = true;
    this.body.add(under);

    const N = 1500, items = [];
    for (let i = 0; i < N; i++) {
      const u = fib(i, N);
      if (u.y < -0.66) continue; // buried in the nest
      const n = ellNormal(BODY_R, u);
      const pos = onEllipsoid(BODY_C, BODY_R, u).addScaledVector(n, 0.004 + R() * 0.006);
      const front = Math.max(0, u.x);
      const flow = V(-0.9 + front * 0.6, -0.45 - front * 0.9, (R() - 0.5) * 0.15);
      const big = clamp01(0.5 + 0.5 * u.y - 0.5 * u.x);
      const len = (0.12 + 0.06 * big) * (0.9 + R() * 0.2);
      items.push({
        pos, normal: n, flow, len, wid: len * 0.58, lift: 0.22 + R() * 0.16,
        color: jitter(ramp(BODY_STOPS, bodyT(u) + (R() - 0.5) * 0.16), R, 0.02, 0.1, 0.09),
      });
    }
    this.bodyFeathers = featherField(items);
    this.body.add(this.bodyFeathers);
  }

  _buildNeck(R) {
    const axis = HEAD_P.clone().sub(NECK_A);
    const L = axis.length();
    axis.normalize();
    const neck = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, L, 8, 20),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(HEN_COLORS.hackleDark).multiplyScalar(0.8), roughness: 0.95 })
    );
    neck.position.copy(NECK_A).addScaledVector(axis, L / 2);
    neck.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
    neck.castShadow = true;
    this.body.add(neck);

    const p1 = V(0, 0, 1), p2 = V().crossVectors(axis, p1).normalize();
    const items = [];
    for (let i = 0; i < 420; i++) {
      const u = -0.35 + R() * 1.15;
      const ang = R() * Math.PI * 2;
      const dir = p1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(p2, Math.sin(ang));
      const r = (0.2 - 0.06 * clamp01(u)) * (u < 0 ? 1 + -u * 0.9 : 1);
      const pos = NECK_A.clone().addScaledVector(axis, u * L).addScaledVector(dir, r);
      const len = (0.24 - 0.07 * clamp01(u)) * (0.85 + R() * 0.3);
      items.push({
        pos, normal: dir, flow: V(-0.55, -1, 0), len, wid: len * 0.5, lift: 0.12 + R() * 0.08,
        color: jitter(new THREE.Color(HEN_COLORS.hackle).lerp(new THREE.Color(HEN_COLORS.hackleDark), R() * 0.6 + clamp01(-u) * 0.3), R),
      });
    }
    this.body.add(featherField(items));
  }

  _buildHead(R) {
    const head = (this.head = new THREE.Group());
    head.position.copy(HEAD_P);
    this.body.add(head);

    const skinMat = new THREE.MeshPhysicalMaterial({ color: HEN_COLORS.face, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ff9a8a') });
    const combMat = new THREE.MeshPhysicalMaterial({ color: HEN_COLORS.comb, roughness: 0.42, sheen: 0.5, sheenColor: new THREE.Color('#ff8f80'), clearcoat: 0.2 });
    const skull = ellipsoid(HEAD_R.x, HEAD_R.y, HEAD_R.z, skinMat, 40, 28);
    head.add(skull);

    // ~500 tiny feathers, leaving the red face bare
    const items = [];
    const N = 560;
    for (let i = 0; i < N; i++) {
      const u = fib(i, N);
      const face = (u.x > -0.02 && u.y < 0.5 && u.y > -0.72) || u.x > 0.72;
      if (face) continue;
      const n = ellNormal(HEAD_R, u);
      const pos = onEllipsoid(V(), HEAD_R, u).addScaledVector(n, 0.002);
      const len = (0.05 + 0.015 * clamp01(-u.x)) * (0.85 + R() * 0.3);
      items.push({
        pos, normal: n, flow: V(-1, -0.25, 0), len, wid: len * 0.72, lift: 0.32,
        color: jitter(new THREE.Color(HEN_COLORS.hackle).lerp(new THREE.Color(HEN_COLORS.russet), 0.25 + R() * 0.35), R),
      });
    }
    head.add(featherField(items));

    // eyes
    const irisMat = new THREE.MeshPhysicalMaterial({ color: HEN_COLORS.iris, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
    const pupilMat = new THREE.MeshPhysicalMaterial({ color: '#0b0503', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
    const ringMat = new THREE.MeshStandardMaterial({ color: '#b52a22', roughness: 0.6 });
    this.eyes = [1, -1].map((s) => {
      const u = V(0.34, 0.26, s * 0.9).normalize();
      const n = ellNormal(HEAD_R, u);
      const eye = new THREE.Group();
      eye.position.copy(onEllipsoid(V(), HEAD_R, u));
      eye.quaternion.setFromUnitVectors(V(0, 0, 1), n);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.031, 24, 16), irisMat);
      iris.position.z = -0.008;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 16, 12), pupilMat);
      pupil.position.z = 0.019;
      pupil.scale.z = 0.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 8, 24), ringMat);
      ring.position.z = 0.004;
      eye.add(iris, pupil, ring);
      head.add(eye);
      return eye;
    });

    // beak and jaw
    const beakMat = new THREE.MeshPhysicalMaterial({ color: HEN_COLORS.beak, roughness: 0.35, clearcoat: 0.4 });
    const upperGeo = new THREE.ConeGeometry(0.05, 0.13, 20, 4);
    upperGeo.rotateZ(-Math.PI / 2);
    upperGeo.translate(0.065, 0, 0);
    upperGeo.scale(1, 0.9, 0.78);
    const up = upperGeo.attributes.position;
    for (let i = 0; i < up.count; i++) up.setY(i, up.getY(i) - 1.6 * up.getX(i) * up.getX(i));
    upperGeo.computeVertexNormals();
    const beak = new THREE.Mesh(upperGeo, beakMat);
    beak.position.set(0.17, 0.0, 0);
    beak.castShadow = true;
    head.add(beak);

    this.jaw = new THREE.Group();
    this.jaw.position.set(0.165, -0.028, 0);
    const lowerGeo = new THREE.ConeGeometry(0.034, 0.095, 16, 1);
    lowerGeo.rotateZ(-Math.PI / 2);
    lowerGeo.translate(0.047, 0, 0);
    lowerGeo.scale(1, 0.5, 0.8);
    const jawMesh = new THREE.Mesh(lowerGeo, beakMat);
    this.jaw.add(jawMesh);
    head.add(this.jaw);

    // five-lobed comb
    const comb = new THREE.Group();
    const heights = [0.065, 0.095, 0.105, 0.09, 0.07];
    heights.forEach((h, i) => {
      const a = 0.72 - i * 0.32;
      const base = V(Math.sin(a) * HEAD_R.x * 0.92, Math.cos(a) * HEAD_R.y * 0.92, 0);
      const dir = V(Math.sin(a) * 0.6, 1, 0).normalize();
      const lobe = ellipsoid(0.034, h, 0.016, combMat, 20, 14);
      lobe.position.copy(base).addScaledVector(dir, h * 0.55);
      lobe.rotation.z = -Math.atan2(dir.x, dir.y);
      comb.add(lobe);
    });
    const blade = ellipsoid(0.15, 0.045, 0.018, combMat, 24, 12);
    blade.position.set(0.02, HEAD_R.y * 0.95, 0);
    blade.rotation.z = -0.15;
    comb.add(blade);
    head.add(comb);

    // wattles and ear lobes
    [1, -1].forEach((s) => {
      const w = ellipsoid(0.034, 0.062, 0.02, combMat, 18, 14);
      w.position.set(0.14, -0.16, s * 0.03);
      w.rotation.z = 0.25;
      head.add(w);
      const lobe = ellipsoid(0.026, 0.034, 0.012, combMat, 14, 10);
      lobe.position.set(-0.045, -0.035, s * 0.158);
      lobe.rotation.y = s * 0.3;
      head.add(lobe);
    });
  }

  _buildWing(side, R) {
    const shoulder = V(0.3, 0.93, 0);
    const surfZ = (x, y) => {
      const q = 1 - ((x - BODY_C.x) / BODY_R.x) ** 2 - ((y - BODY_C.y) / BODY_R.y) ** 2;
      return side * BODY_R.z * Math.sqrt(Math.max(q, 0.03));
    };
    shoulder.z = surfZ(shoulder.x, shoulder.y);
    const wing = new THREE.Group();
    wing.position.copy(shoulder);
    wing.userData.side = side;

    const rows = [
      { count: 6, len: 0.36, wid: 0.09, dy: -0.21, u0: 0.48, u1: 1.0, off: 0.0, col: HEN_COLORS.primary },
      { count: 8, len: 0.3, wid: 0.105, dy: -0.17, u0: 0.04, u1: 0.76, off: 0.012, col: HEN_COLORS.secondary },
      { count: 9, len: 0.17, wid: 0.1, dy: -0.09, u0: 0.0, u1: 0.7, off: 0.026, col: HEN_COLORS.covert },
      { count: 9, len: 0.145, wid: 0.095, dy: -0.025, u0: 0.0, u1: 0.62, off: 0.036, col: HEN_COLORS.russet },
      { count: 7, len: 0.12, wid: 0.09, dy: 0.035, u0: 0.03, u1: 0.5, off: 0.044, col: HEN_COLORS.gold },
    ];
    const items = [];
    rows.forEach((row) => {
      for (let j = 0; j < row.count; j++) {
        const u = row.u0 + ((row.u1 - row.u0) * j) / Math.max(1, row.count - 1);
        const x = shoulder.x - u * 0.72;
        const y = shoulder.y + row.dy - 0.05 * u;
        const z = surfZ(x, y);
        const p = V(x, y, z);
        const n = V((x - BODY_C.x) / BODY_R.x ** 2, (y - BODY_C.y) / BODY_R.y ** 2, z / BODY_R.z ** 2).normalize();
        p.addScaledVector(n, 0.012 + row.off);
        items.push({
          pos: p.sub(shoulder), normal: n, flow: V(-1, -0.28, 0), len: row.len * (0.92 + R() * 0.16), wid: row.wid,
          lift: 0.12, color: jitter(row.col, R, 0.01, 0.06, 0.05),
        });
      }
    });
    wing.add(featherField(items));
    this.body.add(wing);
    return wing;
  }

  _buildTail(R) {
    const tail = (this.tail = new THREE.Group());
    const base = V(-0.56, 0.98, 0);
    tail.position.copy(base);
    this.body.add(tail);

    // golden coverts and darker main tail feathers, fanned
    const items = [];
    for (let i = 0; i < 46; i++) {
      const zs = (R() - 0.5) * 2;
      const pos = V(R() * 0.1, -R() * 0.14, zs * 0.18);
      const normal = V(0.15, 0.25, Math.sign(zs) || 1).normalize();
      items.push({
        pos, normal, flow: V(-0.7, 0.8, zs * 0.45), len: 0.26 + R() * 0.08, wid: 0.11, lift: 0.1,
        color: jitter(new THREE.Color(HEN_COLORS.gold).lerp(new THREE.Color(HEN_COLORS.russet), R() * 0.7), R),
      });
    }
    for (let i = 0; i < 10; i++) {
      const zs = (i / 9 - 0.5) * 2;
      items.push({
        pos: V(-0.02, 0.02, zs * 0.1), normal: V(0, 0.2, Math.sign(zs) || 1).normalize(),
        flow: V(-0.55, 0.85, zs * 0.5), len: 0.44 + R() * 0.06, wid: 0.11, lift: 0.05,
        color: jitter(HEN_COLORS.tail, R, 0.01, 0.05, 0.04),
      });
    }
    tail.add(featherField(items));

    // iridescent chestnut sickles
    const sickleMat = new THREE.MeshPhysicalMaterial({
      color: HEN_COLORS.tail, roughness: 0.3, metalness: 0.15, side: THREE.DoubleSide,
      iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 650],
      sheen: 0.6, sheenColor: new THREE.Color('#c8622c'), clearcoat: 0.35, clearcoatRoughness: 0.3,
    });
    for (let i = 0; i < 9; i++) {
      const zs = (i / 8 - 0.5) * 0.34;
      const reach = 1.2 * (1 - Math.abs(i - 4) * 0.07) * (0.92 + R() * 0.16);
      const curve = new THREE.CubicBezierCurve3(
        V(0.02, 0, zs * 0.5),
        V(-0.16 * reach, 0.55 * reach, zs * 1.2),
        V(-0.58 * reach, 0.68 * reach, zs * 1.8),
        V(-0.78 * reach, 0.16 * reach, zs * 2.4)
      );
      const m = new THREE.Mesh(ribbon(curve, 0.085), sickleMat);
      m.castShadow = true;
      tail.add(m);
    }
  }

  /* ---------- behaviour ---------- */

  /** Squat, rise, flap, open beak; `cb` fires at the midpoint (when the egg comes out). */
  lay(cb) {
    this.queue.push(cb);
    if (this.layT < 0) this._next();
  }
  _next() {
    this.layCb = this.queue.shift();
    this.layT = 0;
    this.cbDone = false;
  }
  get busy() {
    return this.layT >= 0 || this.queue.length > 0;
  }

  headWorld(out) {
    return this.head.getWorldPosition(out);
  }

  _pickHead(ctx) {
    const R = this.R;
    const roll = R();
    let target = null;
    if (ctx) {
      if (roll < 0.5 && ctx.pointer) target = ctx.pointer;
      else if (roll < 0.78 && ctx.eggs && ctx.eggs.length) target = ctx.eggs[Math.floor(R() * ctx.eggs.length)];
    }
    if (target) {
      const d = this.body.worldToLocal(target.clone()).sub(this.head.position);
      this.tYaw = M.clamp(Math.atan2(-d.z, d.x), -1.15, 1.15);
      this.tPitch = M.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.75, 0.5);
    } else {
      this.tYaw = (R() - 0.5) * 1.6;
      this.tPitch = (R() - 0.6) * 0.6;
    }
    this.tRoll = (R() - 0.5) * 0.5;
    this.headTimer = 0.45 + R() * 1.7;
  }

  update(dt, time, ctx) {
    let sq = 0, flap = 0, beak = 0, look = 0;
    if (this.layT >= 0) {
      this.layT += dt / 1.5;
      const s = this.layT;
      sq = s < 0.28 ? smooth(s / 0.28) : s < 0.5 ? 1 - 1.6 * smooth((s - 0.28) / 0.22) : -0.6 * (1 - smooth((s - 0.5) / 0.5));
      const env = s > 0.3 && s < 0.95 ? Math.sin((Math.PI * (s - 0.3)) / 0.65) : 0;
      flap = env * (0.55 + 0.45 * Math.sin((s - 0.3) * Math.PI * 2 * 5.5));
      beak = s > 0.3 && s < 0.85 ? Math.sin((Math.PI * (s - 0.3)) / 0.55) : 0;
      look = env;
      if (!this.cbDone && s >= 0.5) {
        this.cbDone = true;
        this.layCb && this.layCb();
      }
      if (s >= 1) {
        this.layT = -1;
        if (this.queue.length) this._next();
      }
    }

    // breathing and squat
    const br = Math.sin(time * 2.3) * 0.5 + 0.5;
    this.bird.position.y = -0.075 * sq;
    const sx = 1 + 0.022 * sq + 0.008 * br;
    this.bird.scale.set(sx, 1 - 0.045 * sq + 0.012 * br, sx);

    this.wings.forEach((w) => {
      const s = w.userData.side;
      w.rotation.x = -s * (flap * 0.95 + 0.015 * br);
      w.rotation.y = s * flap * 0.18;
    });
    this.tail.rotation.z = -0.14 * Math.max(0, sq) - 0.12 * flap + 0.025 * Math.sin(time * 1.3);

    // cluck (beak chatter when poked)
    this.cluck = Math.max(0, this.cluck - dt);
    const chatter = this.cluck > 0 ? 0.5 + 0.5 * Math.sin(this.cluck * 40) : 0;
    this.jaw.rotation.z = -Math.max(beak, chatter) * 0.5;

    // quick chicken head jerks: hold still, then snap
    this.headTimer -= dt;
    if (this.headTimer <= 0) this._pickHead(ctx);
    const lam = 28;
    this.yaw = M.damp(this.yaw, this.tYaw * (1 - look * 0.6), lam, dt);
    this.pitch = M.damp(this.pitch, this.tPitch + look * 0.45, lam, dt);
    this.roll = M.damp(this.roll, this.tRoll * (1 - look), lam, dt);
    this.head.rotation.set(this.roll, this.yaw, this.pitch, 'YZX');

    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.14;
      this.blinkT = 1.6 + this.R() * 3.4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.blink > 0 ? 0.12 + 0.88 * Math.abs(this.blink - 0.07) / 0.07 : 1;
    this.eyes.forEach((e) => (e.scale.y = lid));
  }
}

/* ======================================================= farm hens & chicks */

export const BREEDS = [
  { name: 'Rhode Island Red', body: '#a0431b', neck: '#c96a2b', wing: '#7e3214', tail: '#3a150a' },
  { name: 'White Leghorn', body: '#f7f2e8', neck: '#fffaf0', wing: '#ebe3d4', tail: '#f1eadc' },
  { name: 'Australorp', body: '#232027', neck: '#2d2833', wing: '#1b181f', tail: '#15131a', iri: true },
  { name: 'Buff Orpington', body: '#e2ab5c', neck: '#eec17a', wing: '#d0954a', tail: '#c38638' },
  { name: 'Speckled Sussex', body: '#7a3a1a', neck: '#93502a', wing: '#5e2a12', tail: '#24120a', speck: true },
  { name: 'Light Brahma', body: '#f1ebdf', neck: '#3b3a3c', wing: '#e3dccd', tail: '#232224' },
];

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
const ico = (r, mat, detail = 1) => {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function buildLeg(mat) {
  const leg = new THREE.Group();
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 5), mat);
  shin.position.y = -0.055;
  shin.castShadow = true;
  leg.add(shin);
  [-0.45, 0, 0.45].forEach((a) => {
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.01), mat);
    toe.position.set(0.018 * Math.cos(a), -0.11, -0.018 * Math.sin(a));
    toe.rotation.y = a;
    leg.add(toe);
  });
  return leg;
}

/** A small low-poly hen that walks to random points and pecks. Forward is +x. */
export class FarmHen {
  constructor(breed, seed = 1) {
    const R = (this.R = rng(seed));
    this.group = new THREE.Group();
    const body = (this.body = new THREE.Group());
    body.position.y = 0.2;
    this.group.add(body);

    const bodyMat = flat(breed.body), neckMat = flat(breed.neck), wingMat = flat(breed.wing);
    const red = flat('#e1272b'), beakMat = flat('#f2b340'), legMat = flat('#e8a33a'), eyeMat = flat('#120a06', { roughness: 0.2 });
    const tailMat = breed.iri
      ? new THREE.MeshPhysicalMaterial({ color: breed.tail, roughness: 0.3, metalness: 0.2, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [300, 700], flatShading: true })
      : flat(breed.tail);

    const torso = ico(1, bodyMat);
    torso.scale.set(0.17, 0.125, 0.12);
    body.add(torso);
    const breast = ico(1, neckMat);
    breast.scale.set(0.09, 0.1, 0.095);
    breast.position.set(0.09, 0.03, 0);
    body.add(breast);
    [1, -1].forEach((s) => {
      const w = ico(1, wingMat);
      w.scale.set(0.12, 0.07, 0.03);
      w.position.set(-0.02, 0.01, s * 0.105);
      w.rotation.z = 0.2;
      body.add(w);
    });
    const tail = new THREE.Group();
    tail.position.set(-0.13, 0.05, 0);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), tailMat);
      f.scale.z = 0.35;
      f.position.y = 0.07;
      f.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.z = 0.55 + i * 0.22;
      holder.rotation.x = (i - 1) * 0.25;
      holder.add(f);
      tail.add(holder);
    }
    body.add(tail);
    if (breed.speck) {
      const dot = flat('#fff7ea');
      for (let i = 0; i < 18; i++) {
        const d = ico(0.012, dot, 0);
        const a = R() * Math.PI * 2, b = (R() - 0.3) * 1.2;
        d.position.set(0.168 * Math.cos(a) * Math.cos(b), 0.124 * Math.sin(b), 0.119 * Math.sin(a) * Math.cos(b));
        body.add(d);
      }
    }

    const head = (this.head = new THREE.Group());
    head.position.set(0.12, 0.08, 0);
    body.add(head);
    const neck = ico(1, neckMat);
    neck.scale.set(0.05, 0.08, 0.05);
    neck.position.set(0.02, 0.04, 0);
    head.add(neck);
    const skull = ico(0.06, neckMat);
    skull.position.set(0.04, 0.1, 0);
    head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.055, 4), beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.12, 0.095, 0);
    head.add(beak);
    [[0.03, 0.17], [0.055, 0.165], [0.01, 0.16]].forEach(([x, y], i) => {
      const c = ico(0.022 - i * 0.003, red, 0);
      c.position.set(x, y, 0);
      head.add(c);
    });
    const wattle = ico(0.018, red, 0);
    wattle.position.set(0.09, 0.05, 0);
    head.add(wattle);
    [1, -1].forEach((s) => {
      const eye = ico(0.01, eyeMat, 0);
      eye.position.set(0.075, 0.115, s * 0.04);
      head.add(eye);
    });

    this.legs = [1, -1].map((s) => {
      const leg = buildLeg(legMat);
      leg.position.set(0, 0.11, s * 0.045);
      this.group.add(leg);
      return leg;
    });

    this.x = 0; this.z = 0; this.heading = R() * Math.PI * 2;
    this.mode = 'peck';
    this.timer = R() * 2;
    this.phase = 0;
    this.tx = 0; this.tz = 0;
    this.speed = 0;
  }

  place(x, z) { this.x = this.tx = x; this.z = this.tz = z; }

  update(dt, time, pickTarget, heightAt) {
    this.timer -= dt;
    let peck = 0;
    if (this.mode === 'walk') {
      const dx = this.tx - this.x, dz = this.tz - this.z;
      const dist = Math.hypot(dx, dz);
      this.heading += angleDiff(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 6);
      this.speed = M.damp(this.speed, dist > 0.04 ? 0.3 : 0, 6, dt);
      if (dist < 0.05 || this.timer < 0) {
        this.mode = 'peck';
        this.timer = 1 + this.R() * 2.5;
      }
    } else {
      this.speed = M.damp(this.speed, 0, 8, dt);
      peck = Math.max(0, Math.sin(time * 9 + this.tx * 7));
      if (this.timer < 0) {
        const [tx, tz] = pickTarget(this.R);
        this.tx = tx; this.tz = tz;
        this.mode = 'walk';
        this.timer = 6;
      }
    }
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z -= Math.sin(this.heading) * this.speed * dt;
    const gait = Math.min(1, this.speed * 4);
    this.phase += dt * this.speed * 38;
    const swing = Math.sin(this.phase) * gait * 0.7;
    this.legs[0].rotation.z = swing;
    this.legs[1].rotation.z = -swing;
    this.body.position.y = 0.2 + Math.abs(Math.sin(this.phase)) * 0.012 * gait;
    this.head.rotation.z = -peck * 0.9;
    this.head.position.x = 0.12 + Math.sin(this.phase * 2) * 0.012 * gait;
    this.group.position.set(this.x, heightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
  }
}

/** A yellow chick that follows whatever is in front of it in the line. */
export class Chick {
  constructor(seed = 1) {
    const R = rng(seed);
    this.group = new THREE.Group();
    const yellow = flat(R() < 0.5 ? '#ffd84d' : '#ffe27a'), beak = flat('#ff9f1c'), eye = flat('#120a06');
    this.body = new THREE.Group();
    this.group.add(this.body);
    const b = ico(1, yellow);
    b.scale.set(0.055, 0.05, 0.048);
    b.position.y = 0.07;
    const h = ico(0.036, yellow);
    h.position.set(0.045, 0.125, 0);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.026, 4), beak);
    bk.rotation.z = -Math.PI / 2;
    bk.position.set(0.088, 0.12, 0);
    this.body.add(b, h, bk);
    [1, -1].forEach((s) => {
      const e = ico(0.006, eye, 0);
      e.position.set(0.07, 0.135, s * 0.022);
      this.body.add(e);
    });
    [1, -1].forEach((s) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 4), beak);
      l.position.set(0, 0.015, s * 0.02);
      this.group.add(l);
    });
    this.x = 0; this.z = 0; this.heading = 0; this.phase = R() * 6; this.speed = 0;
  }
  place(x, z) { this.x = x; this.z = z; }
  follow(dt, lx, lz, heightAt) {
    const dx = lx - this.x, dz = lz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) this.heading += angleDiff(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 8);
    this.speed = M.damp(this.speed, dist > 0.13 ? Math.min(0.5, (dist - 0.1) * 3) : 0, 8, dt);
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z -= Math.sin(this.heading) * this.speed * dt;
    this.phase += dt * (6 + this.speed * 40);
    this.body.position.y = Math.abs(Math.sin(this.phase)) * (this.speed > 0.02 ? 0.02 : 0.004);
    this.group.position.set(this.x, heightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
  }
}
