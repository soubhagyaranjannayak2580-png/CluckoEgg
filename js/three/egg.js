// Clucko · the egg, built from its true profile.
//   r = b·sinφ·(1 + k·cosφ),  y = −a·cosφ   (φ = 0 at the blunt bottom, π at the pointed top)
// A crackable egg is two patches split along a jagged crack, each with an inner shell and a rim,
// plus a hairline, a hinged cap, crumbs, albumen, a yolk, a glow sprite and a warm light.
import * as THREE from 'three';
import { shellTexture, poreTexture, glowTexture, rng } from './textures.js';

export const EGG = { a: 0.42, b: 0.315, k: 0.13 };
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));
const backOut = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

export const eggRadius = (phi) => EGG.b * Math.sin(phi) * (1 + EGG.k * Math.cos(phi));
export const eggY = (phi) => -EGG.a * Math.cos(phi);

/** Surface point at (φ, θ). x = r·sinθ, z = r·cosθ (same convention as THREE.LatheGeometry). */
export const eggPoint = (phi, th, out = V()) => {
  const r = eggRadius(phi);
  return out.set(r * Math.sin(th), eggY(phi), r * Math.cos(th));
};

/** Analytic normal at (φ, θ). */
function eggNormal(phi, th, out) {
  const { a, b, k } = EGG;
  const s = Math.sin(phi), c = Math.cos(phi);
  const dr = b * (c * (1 + k * c) - k * s * s);
  const dy = a * s;
  const l = Math.hypot(dy, dr) || 1;
  const nr = dy / l, ny = -dr / l;
  return out.set(nr * Math.sin(th), ny, nr * Math.cos(th));
}

/** Builds a lathed grid where φ for each (row s, column θ) comes from `phiAt(s, θ)`. */
function gridGeometry(radial, rings, phiAt) {
  const pos = [], nor = [], uv = [], idx = [];
  const p = V(), n = V();
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    for (let j = 0; j <= radial; j++) {
      const th = (TAU * j) / radial;
      const phi = phiAt(s, th);
      eggPoint(phi, th, p);
      eggNormal(phi, th, n);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(th / TAU, phi / Math.PI);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const q = i * row + j, w = q + row;
      idx.push(q, q + 1, w, q + 1, w + 1, w);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export const eggGeometry = ({ radial = 72, rings = 56 } = {}) => gridGeometry(radial, rings, (s) => s * Math.PI);

let WHOLE = null;
const wholeGeometry = () => (WHOLE ||= eggGeometry());

/* --------------------------------------------------------------- materials */

const materials = {};
export function shellMaterial(kind) {
  if (materials[kind]) return materials[kind];
  const brown = kind === 'brown';
  return (materials[kind] = new THREE.MeshPhysicalMaterial({
    map: shellTexture(kind),
    bumpMap: poreTexture(),
    bumpScale: brown ? 0.9 : 0.6,
    roughness: brown ? 0.6 : 0.5,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(brown ? '#ffd2a8' : '#ffffff'),
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
  }));
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  return (SHARED = {
    membrane: new THREE.MeshStandardMaterial({ color: '#fbf4e6', roughness: 0.85, side: THREE.BackSide }),
    rim: new THREE.MeshStandardMaterial({ color: '#f6ecdb', roughness: 0.9, side: THREE.DoubleSide }),
    hair: new THREE.MeshBasicMaterial({ color: '#3a2414' }),
    albumen: new THREE.MeshPhysicalMaterial({
      color: '#fff6dc', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.62, depthWrite: false,
    }),
    yolk: new THREE.MeshPhysicalMaterial({
      color: '#ffa20f', roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05,
      emissive: new THREE.Color('#ff7a00'), emissiveIntensity: 0.18, sheen: 0.4, sheenColor: new THREE.Color('#ffd27a'),
    }),
    yolkGeo: new THREE.SphereGeometry(0.135, 40, 28),
    albumenGeo: new THREE.SphereGeometry(1, 40, 16),
    crumbGeo: new THREE.TetrahedronGeometry(0.03),
  });
}

/* ------------------------------------------------------------ crack pieces */

const TEETH = 11;
const PHI_C = Math.PI * 0.6;
const INNER = 0.965;
const RADIAL = TEETH * 2 * 6; // crack corners land exactly on grid columns
const HAIR_SEGS = TEETH * 2 * 12;
const HAIR_RADIAL = 5;

/** A jagged ring: 11 teeth with random heights, wrapped with modulo so the seam never reads NaN. */
function makeCrack(seed) {
  const R = rng(seed);
  const n = TEETH * 2;
  const pts = Array.from({ length: n }, (_, i) => PHI_C + (i % 2 ? -1 : 1) * (0.04 + R() * 0.1));
  return (th) => {
    const u = ((((th / TAU) % 1) + 1) % 1) * n;
    const i = Math.floor(u) % n;
    const f = u - Math.floor(u);
    return pts[i] * (1 - f) + pts[(i + 1) % n] * f;
  };
}

function rimGeometry(crack) {
  const pos = [], idx = [];
  const p = V();
  for (let j = 0; j <= RADIAL; j++) {
    const th = (TAU * j) / RADIAL;
    eggPoint(crack(th), th, p);
    pos.push(p.x, p.y, p.z, p.x * INNER, p.y * INNER, p.z * INNER);
    if (j < RADIAL) {
      const a = j * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class CrackCurve extends THREE.Curve {
  constructor(crack, scale) {
    super();
    this.crack = crack;
    this.scale = scale;
  }
  getPoint(t, target = V()) {
    const th = t * TAU;
    return eggPoint(this.crack(th), th, target).multiplyScalar(this.scale);
  }
}

const mesh = (geo, mat, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
};

/* --------------------------------------------------------------------- egg */

/**
 * `group` is the thing you move; the shell's centre sits at the origin.
 * Options: crackable, hinge (+1 the cap tips to +x, −1 to −x), seed.
 */
export class Egg {
  constructor(kind = 'brown', { crackable = false, hinge = 1, seed = 7 } = {}) {
    this.group = new THREE.Group();
    this.kind = kind;
    this.shells = [];
    this.whole = mesh(wholeGeometry(), shellMaterial(kind));
    this.group.add(this.whole);
    this.shells.push(this.whole);
    this.crackable = crackable;
    this._t = 0;
    if (crackable) this._buildCrack(hinge, seed);
  }

  _buildCrack(hinge, seed) {
    const S = shared();
    const crack = (this.crack = makeCrack(seed));
    const outer = shellMaterial(this.kind);
    const parts = (this.parts = new THREE.Group());
    parts.visible = false;
    this.group.add(parts);

    const bottomGeo = gridGeometry(RADIAL, 30, (s, th) => s * crack(th));
    const capGeo = gridGeometry(RADIAL, 22, (s, th) => crack(th) + s * (Math.PI - crack(th)));
    const rimGeo = rimGeometry(crack);

    // bottom half
    const bOuter = mesh(bottomGeo, outer);
    const bInner = mesh(bottomGeo, S.membrane);
    bInner.scale.setScalar(INNER);
    parts.add(bOuter, bInner, mesh(rimGeo, S.rim));
    this.shells.push(bOuter);

    // cap, pivoting on the hinge tooth
    const thH = hinge > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.hingeP = eggPoint(crack(thH), thH);
    this.hingeAxis = V(Math.cos(thH), 0, -Math.sin(thH));
    this.hingeOut = V(Math.sin(thH), 0, Math.cos(thH));
    this.capPivot = new THREE.Group();
    this.capPivot.position.copy(this.hingeP);
    const capContent = new THREE.Group();
    capContent.position.copy(this.hingeP).negate();
    const cOuter = mesh(capGeo, outer);
    const cInner = mesh(capGeo, S.membrane);
    cInner.scale.setScalar(INNER);
    capContent.add(cOuter, cInner, mesh(rimGeo, S.rim));
    this.capPivot.add(capContent);
    parts.add(this.capPivot);
    this.shells.push(cOuter);

    // hairline that draws itself round the egg
    const tube = new THREE.TubeGeometry(new CrackCurve(crack, 1.006), HAIR_SEGS, 0.0045, HAIR_RADIAL, true);
    this.hair = mesh(tube, S.hair, false);
    parts.add(this.hair);

    // albumen and yolk
    this.albumen = mesh(S.albumenGeo, S.albumen, false);
    this.albumen.scale.set(0.25, 0.065, 0.25);
    this.albumen.position.y = 0.075;
    this.yolk = mesh(S.yolkGeo, S.yolk);
    this.yolk.position.y = 0.04;
    parts.add(this.albumen, this.yolk);

    // glow and warm light
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#ffb43a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
    }));
    this.glow.position.y = 0.3;
    this.glow.scale.setScalar(1.3);
    this.light = new THREE.PointLight('#ffb347', 0, 2.6, 2);
    this.light.position.set(0, 0.35, 0.15);
    this.group.add(this.glow, this.light);

    // crumbs
    const R = rng(seed + 99);
    this.crumbs = Array.from({ length: 10 }, () => {
      const th = R() * TAU;
      const m = mesh(S.crumbGeo, outer, false);
      m.userData.start = eggPoint(crack(th), th);
      m.userData.vel = V(Math.sin(th) * (0.5 + R() * 0.5), 0.6 + R() * 0.6, Math.cos(th) * (0.5 + R() * 0.5));
      m.userData.spin = V(R() * 9, R() * 9, R() * 9);
      m.scale.setScalar(0.6 + R() * 0.8);
      m.userData.s = m.scale.x;
      parts.add(m);
      this.shells.push(m);
      return m;
    });
  }

  setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    const mat = shellMaterial(kind);
    this.shells.forEach((m) => (m.material = mat));
  }

  /** 0 whole · 0–0.35 the hairline races round · 0.35–1 the cap lifts away. Plays backwards too. */
  setCrack(t) {
    if (!this.crackable) return;
    t = clamp01(t);
    if (t === this._t) return;
    this._t = t;
    const on = t > 0.0001;
    this.whole.visible = !on;
    this.parts.visible = on;
    if (!on) {
      this.light.intensity = 0;
      this.glow.material.opacity = 0;
      return;
    }
    const hair = smooth(t / 0.35);
    this.hair.geometry.setDrawRange(0, Math.floor(hair * HAIR_SEGS) * HAIR_RADIAL * 6);
    this.hair.visible = t < 0.55;

    const open = smooth((t - 0.35) / 0.65);
    this.capPivot.quaternion.setFromAxisAngle(this.hingeAxis, open * 2.0);
    this.capPivot.position.copy(this.hingeP).addScaledVector(this.hingeOut, 0.04 * open);
    this.capPivot.position.y += 0.06 * Math.sin(open * Math.PI);

    const pop = clamp01((t - 0.45) / 0.4);
    this.yolk.position.y = 0.04 + 0.1 * (pop > 0 ? backOut(pop) : 0);
    const w = Math.sin(pop * Math.PI * 3) * (1 - pop) * 0.18;
    this.yolk.scale.set(1 - w * 0.5, 1 + w, 1 - w * 0.5);
    this.yolk.visible = this.albumen.visible = t > 0.3;

    this.glow.material.opacity = open * 0.55;
    this.glow.scale.setScalar(1 + open * 0.6);
    this.light.intensity = open * 1.6;

    const tau = clamp01((t - 0.36) / 0.5) * 0.7;
    this.crumbs.forEach((m) => {
      const { start, vel, spin, s } = m.userData;
      m.visible = tau > 0 && tau < 0.69;
      m.position.copy(start).addScaledVector(vel, tau);
      m.position.y -= 1.8 * tau * tau;
      m.rotation.set(spin.x * tau, spin.y * tau, spin.z * tau);
      m.scale.setScalar(s * (1 - tau / 0.7));
    });
  }
}
