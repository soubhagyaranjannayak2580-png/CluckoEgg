// Clucko · the floating farm island. Island-local axes: y up, +z faces the camera at rotation 0.
// Features sit at polar angles ψ (x = r·sinψ, z = r·cosψ) so they face the camera in turn as it rotates.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';
import { FarmHen, Chick, BREEDS } from './hen.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));
const polar = (psi, r) => [r * Math.sin(psi), r * Math.cos(psi)];

export const ISLAND_R = 3;
const edgeR = (th) => ISLAND_R + 0.16 * Math.sin(3 * th + 0.4) + 0.09 * Math.sin(7 * th + 1.3) + 0.05 * Math.sin(13 * th);

/* --------------------------------------------------------------- layout */

const [BX, BZ] = polar(-0.85, 1.55); // barn
const [SX, SZ] = polar(-1.45, 1.95); // silo
const [CX, CZ] = polar(-0.2, 1.72); // coop
const [PX, PZ] = polar(0.42, 1.32); // pasture centre
const [WX, WZ] = polar(0.92, 1.85); // wind pump
const PASTURE_R = 0.62;
const POND = { x: 1.42, z: -0.48, r: 0.55, sx: 1.15 };

const rawH = (x, z) => {
  const r = Math.hypot(x, z) / ISLAND_R;
  return 0.12 * (1 - r * r) + 0.05 * Math.sin(x * 1.3 + 0.5) * Math.cos(z * 1.1) + 0.035 * Math.sin(x * 2.7 - z * 1.9) + 0.025 * Math.cos(z * 3.1 + x);
};
const POND_FLOOR = rawH(POND.x, POND.z) - 0.1;
export const WATER_Y = POND_FLOOR + 0.07;
const pondD = (x, z) => Math.hypot((x - POND.x) / POND.sx, z - POND.z) / POND.r;

/** Ground height on the island top. */
export function groundH(x, z) {
  const h = rawH(x, z);
  const w = smooth((1.25 - pondD(x, z)) / 0.4);
  return h * (1 - w) + POND_FLOOR * w;
}

const KEEP_OUT = [
  [BX, BZ, 0.75], [SX, SZ, 0.42], [CX, CZ, 0.5], [WX, WZ, 0.3], [POND.x, POND.z, POND.r * POND.sx * 1.25],
];
const free = (x, z, pad = 0) => KEEP_OUT.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) > r + pad);

/* -------------------------------------------------------------- helpers */

// materials are shared by colour + options, so the static island can be baked into one mesh per material
const MATS = new Map();
const std = (color, extra = {}) => {
  const k = color + JSON.stringify(extra);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
  return MATS.get(k);
};

/**
 * Merges every static, opaque mesh under `root` (except those under `keep`) into one mesh per material.
 * Turns hundreds of draw calls into a few dozen.
 */
export function bake(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const dead = [];
  const kept = (o) => {
    for (let p = o; p && p !== root; p = p.parent) if (keep.includes(p)) return true;
    return false;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.material.transparent || kept(o)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    Object.keys(g.attributes).forEach((name) => {
      if (name !== 'position' && name !== 'normal' && !(name === 'color' && o.material.vertexColors)) g.deleteAttribute(name);
    });
    if (!buckets.has(o.material)) buckets.set(o.material, { list: [], cast: false, receive: false });
    const b = buckets.get(o.material);
    b.list.push(g);
    b.cast ||= o.castShadow;
    b.receive ||= o.receiveShadow;
    dead.push(o);
  });
  dead.forEach((o) => o.parent.remove(o));
  buckets.forEach((b, mat) => {
    const merged = mergeGeometries(b.list);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  });
}
const lowpoly = (color, extra = {}) => std(color, { flatShading: true, ...extra });
const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
function rod(parent, a, b, r, mat, seg = 6) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, r);

/* ------------------------------------------------------------- terrain */

function makeTop() {
  const SEG = 128, RINGS = 40;
  const pos = [], col = [], idx = [];
  const greens = ['#7cc35a', '#62ad46', '#97d36b', '#5aa040'].map((c) => new THREE.Color(c));
  const mud = new THREE.Color('#8f7c4c'), dark = new THREE.Color('#4d8a37');
  const c = new THREE.Color();
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * TAU;
      const r = edgeR(th) * t;
      const x = r * Math.sin(th), z = r * Math.cos(th);
      let y = groundH(x, z) - 0.05 * smooth((t - 0.9) / 0.1);
      pos.push(x, y, z);
      const n = 0.5 + 0.5 * Math.sin(x * 2.1 + z * 1.3) * Math.cos(z * 2.7 - x);
      const k = n * (greens.length - 1);
      c.copy(greens[Math.floor(k)]).lerp(greens[Math.min(greens.length - 1, Math.floor(k) + 1)], k % 1);
      c.lerp(mud, smooth((1.3 - pondD(x, z)) / 0.3) * 0.8);
      c.lerp(dark, smooth((t - 0.85) / 0.15) * 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = SEG + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, std('#ffffff', { vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

function makeUnderside() {
  const SEG = 72;
  // [radius scale, y, colour, rocky]
  const levels = [
    [1.0, null, '#5f3d22', 0], [0.995, -0.14, '#7d5230', 0], [0.985, -0.24, '#6b4428', 0], [0.97, -0.36, '#8a5e38', 0],
    [0.9, -0.62, '#a08a74', 1], [0.78, -0.96, '#857464', 1], [0.63, -1.3, '#b09a84', 1], [0.47, -1.68, '#7a6a5c', 1],
    [0.3, -2.02, '#958270', 1], [0.14, -2.34, '#6f6053', 1], [0.0, -2.56, '#6f6053', 1],
  ];
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  levels.forEach(([s, y, color, rocky], i) => {
    c.set(color);
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * TAU;
      const n = rocky ? Math.sin(th * 5 + i * 1.7) * 0.5 + Math.sin(th * 11 + i * 0.6) * 0.35 : 0;
      const r = edgeR(th) * s * (1 + n * 0.09);
      const x = r * Math.sin(th), z = r * Math.cos(th);
      const yy = y === null ? groundH(x, z) - 0.05 : y + n * 0.08;
      pos.push(x, yy, z);
      const shade = 0.88 + 0.12 * Math.sin(th * 3 + i);
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  });
  const row = SEG + 1;
  for (let i = 0; i < levels.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, std('#ffffff', { vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

function makeRoots(group, R) {
  const mat = std('#5a3820', { roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const th = R() * TAU;
    const r = edgeR(th) * 0.96;
    const o = V(Math.sin(th), 0, Math.cos(th));
    const start = o.clone().multiplyScalar(r).setY(-0.3);
    const pts = [start];
    for (let k = 1; k <= 4; k++) pts.push(start.clone().addScaledVector(o, 0.04 * k + (R() - 0.5) * 0.08).add(V((R() - 0.5) * 0.08, -0.16 * k, (R() - 0.5) * 0.08)));
    add(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.014 * (0.6 + R() * 0.6), 5), mat);
  }
}

/* ------------------------------------------------------------ buildings */

function makeBarn() {
  const g = new THREE.Group();
  const W = 0.95, D = 0.8, H = 0.55, RH = 0.36;
  const red = std('#c4402c', { roughness: 0.75 }), white = std('#fff6ea'), roofMat = std('#5a3b34', { roughness: 0.7 });
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(0, H + RH); s.lineTo(-W / 2, H); s.closePath();
  add(g, new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false }).translate(0, 0, -D / 2), red);
  const slope = Math.hypot(W / 2, RH) + 0.1, ang = Math.atan2(RH, W / 2);
  [-1, 1].forEach((sd) => {
    const slab = add(g, new THREE.BoxGeometry(slope, 0.05, D + 0.14), roofMat, (sd * W) / 4, H + RH / 2 + 0.03, 0);
    slab.rotation.z = -sd * ang;
    const trim = add(g, new THREE.BoxGeometry(slope - 0.08, 0.035, 0.03), white, (sd * W) / 4, H + RH / 2 - 0.01, D / 2 + 0.02);
    trim.rotation.z = -sd * ang;
  });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(g, new THREE.BoxGeometry(0.04, H, 0.04), white, (sx * W) / 2, H / 2, (sz * D) / 2));
  // crossed doors
  const dw = 0.44, dh = 0.4, fz = D / 2 + 0.014;
  const door = new THREE.Group();
  door.position.set(0, 0, fz);
  g.add(door);
  add(door, new THREE.BoxGeometry(dw, dh, 0.01), std('#a8321f'), 0, dh / 2, -0.004);
  add(door, new THREE.BoxGeometry(dw + 0.04, 0.03, 0.02), white, 0, dh, 0);
  add(door, new THREE.BoxGeometry(dw + 0.04, 0.03, 0.02), white, 0, 0.015, 0);
  [-dw / 2, 0, dw / 2].forEach((x) => add(door, new THREE.BoxGeometry(0.03, dh, 0.02), white, x, dh / 2, 0));
  const diag = Math.hypot(dw / 2, dh), dAng = Math.atan2(dh, dw / 2);
  [-1, 1].forEach((half) => [-1, 1].forEach((dir) => {
    const b = add(door, new THREE.BoxGeometry(diag - 0.03, 0.022, 0.02), white, (half * dw) / 4, dh / 2, 0.004);
    b.rotation.z = dir * dAng;
  }));
  // hayloft
  add(g, new THREE.BoxGeometry(0.2, 0.18, 0.01), std('#3a1f16'), 0, H + 0.1, D / 2 + 0.006);
  add(g, new THREE.BoxGeometry(0.24, 0.025, 0.02), white, 0, H + 0.2, D / 2 + 0.01);
  add(g, new THREE.BoxGeometry(0.24, 0.025, 0.02), white, 0, H + 0.005, D / 2 + 0.01);
  // weather vane
  const dark = std('#2b1a10', { metalness: 0.4, roughness: 0.4 });
  rod(g, V(0, H + RH, 0), V(0, H + RH + 0.32, 0), 0.008, dark);
  const vane = new THREE.Group();
  vane.position.set(0, H + RH + 0.26, 0);
  add(vane, new THREE.BoxGeometry(0.28, 0.012, 0.012), dark);
  const head = add(vane, new THREE.ConeGeometry(0.025, 0.06, 4), dark, 0.16, 0, 0);
  head.rotation.z = -Math.PI / 2;
  add(vane, new THREE.BoxGeometry(0.05, 0.06, 0.006), dark, -0.13, 0.02, 0);
  add(g, new THREE.SphereGeometry(0.02, 10, 8), std('#ffb703', { metalness: 0.6, roughness: 0.3 }), 0, H + RH + 0.33, 0);
  g.add(vane);
  g.userData.vane = vane;
  return g;
}

function makeSilo() {
  const g = new THREE.Group();
  const metal = std('#c7cfd4', { metalness: 0.6, roughness: 0.35 });
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 1.35, 36), metal, 0, 0.675, 0);
  add(g, new THREE.SphereGeometry(0.31, 32, 12, 0, TAU, 0, Math.PI / 2), std('#b23a2a', { metalness: 0.3, roughness: 0.45 }), 0, 1.35, 0);
  for (let k = 1; k <= 5; k++) {
    const ring = add(g, new THREE.TorusGeometry(0.303, 0.012, 6, 48), metal, 0, k * 0.25, 0);
    ring.rotation.x = Math.PI / 2;
  }
  const rail = std('#7e878d', { metalness: 0.5, roughness: 0.4 });
  [-0.06, 0.06].forEach((x) => rod(g, V(x, 0.05, 0.32), V(x, 1.3, 0.32), 0.008, rail));
  for (let y = 0.12; y < 1.3; y += 0.09) rod(g, V(-0.06, y, 0.32), V(0.06, y, 0.32), 0.006, rail);
  return g;
}

function makeCoop() {
  const g = new THREE.Group();
  const yellow = std('#ffd45c', { roughness: 0.7 }), teal = std('#2a9d8f', { roughness: 0.6 }), wood = std('#8a5a35');
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => rod(g, V(sx * 0.26, -0.05, sz * 0.17), V(sx * 0.26, 0.3, sz * 0.17), 0.025, wood));
  add(g, rbox(0.62, 0.38, 0.42, 0.03), yellow, 0, 0.47, 0);
  const roof = new THREE.Shape();
  roof.moveTo(-0.38, 0); roof.lineTo(0.38, 0); roof.lineTo(0, 0.25); roof.closePath();
  add(g, new THREE.ExtrudeGeometry(roof, { depth: 0.54, bevelEnabled: false }).translate(0, 0, -0.27), teal, 0, 0.66, 0);
  const panel = add(g, new THREE.BoxGeometry(0.28, 0.016, 0.36), std('#1d3d7a', { metalness: 0.55, roughness: 0.22 }), 0.19, 0.66 + 0.135, 0);
  panel.rotation.z = -Math.atan2(0.25, 0.38);
  const grid = add(g, new THREE.BoxGeometry(0.004, 0.018, 0.36), std('#c9d6ea', { metalness: 0.6 }), 0.19, 0.66 + 0.137, 0);
  grid.rotation.z = panel.rotation.z;
  add(g, new THREE.BoxGeometry(0.14, 0.19, 0.012), std('#3a1f16'), 0.12, 0.4, 0.214);
  const win = add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), std('#3a1f16'), -0.15, 0.52, 0.214);
  win.rotation.x = Math.PI / 2;
  const ring = add(g, new THREE.TorusGeometry(0.052, 0.01, 6, 24), std('#fff6ea'), -0.15, 0.52, 0.22);
  ring.rotation.z = 0;
  const ramp = add(g, new THREE.BoxGeometry(0.14, 0.015, 0.46), wood, 0.12, 0.15, 0.42);
  ramp.rotation.x = 0.7;
  for (let k = 0; k < 4; k++) {
    const slat = add(g, new THREE.BoxGeometry(0.14, 0.012, 0.012), std('#6b4426'), 0, 0.09 * k - 0.15, 0.012);
    ramp.add(slat);
    slat.position.set(0, 0.012, -0.15 + k * 0.1);
  }
  return g;
}

function makeWindpump() {
  const g = new THREE.Group();
  const steel = std('#8d99a3', { metalness: 0.5, roughness: 0.45 });
  const H = 1.7;
  const corner = (y, sx, sz) => {
    const w = 0.2 - (0.15 * y) / H;
    return V(sx * w, y, sz * w);
  };
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  C.forEach(([sx, sz]) => rod(g, corner(0, sx, sz), corner(H, sx, sz), 0.017, steel));
  const levels = [0.02, 0.4, 0.8, 1.2, 1.55];
  levels.forEach((y, li) => {
    C.forEach(([sx, sz], i) => {
      const [nx, nz] = C[(i + 1) % 4];
      rod(g, corner(y, sx, sz), corner(y, nx, nz), 0.008, steel, 4);
      if (li < levels.length - 1) rod(g, corner(y, sx, sz), corner(levels[li + 1], nx, nz), 0.006, steel, 4);
    });
  });
  add(g, new THREE.BoxGeometry(0.2, 0.02, 0.2), steel, 0, H, 0);
  rod(g, V(0, 0, 0), V(0, H, 0), 0.012, steel);
  const hub = add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), steel, 0, H + 0.1, 0.04);
  hub.rotation.x = Math.PI / 2;
  const rotor = new THREE.Group();
  rotor.position.set(0, H + 0.1, 0.12);
  const blade = std('#eef1f3', { metalness: 0.3, roughness: 0.4 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const holder = new THREE.Group();
    holder.rotation.z = a;
    const b = add(holder, new THREE.BoxGeometry(0.045, 0.24, 0.008), blade, 0, 0.21, 0);
    b.rotation.y = 0.4;
    rotor.add(holder);
  }
  [0.33, 0.1].forEach((r) => add(rotor, new THREE.TorusGeometry(r, 0.008, 6, 40), steel));
  g.add(rotor);
  rod(g, V(0, H + 0.1, 0), V(0, H + 0.1, -0.5), 0.01, steel);
  add(g, new THREE.BoxGeometry(0.01, 0.2, 0.3), std('#c4402c'), 0, H + 0.12, -0.58);
  g.userData.rotor = rotor;
  return g;
}

function makeTree(kind, R) {
  const g = new THREE.Group();
  const bark = lowpoly('#7a4e2c');
  add(g, new THREE.CylinderGeometry(0.035, 0.06, 0.62, 7), bark, 0, 0.31, 0);
  rod(g, V(0, 0.42, 0), V(0.16, 0.62, 0.04), 0.022, bark, 5);
  rod(g, V(0, 0.48, 0), V(-0.14, 0.66, -0.06), 0.02, bark, 5);
  const blossom = kind === 'blossom';
  const leaves = (blossom ? ['#f9a8c6', '#ffc4d8', '#f48fb8'] : ['#5fae4a', '#4f9a3e', '#78c05a']).map((c) => lowpoly(c));
  for (let i = 0; i < 7; i++) {
    const r = 0.18 + R() * 0.13;
    const a = R() * TAU;
    add(g, new THREE.IcosahedronGeometry(r, 1), leaves[i % 3], Math.cos(a) * 0.2 * R(), 0.78 + R() * 0.28, Math.sin(a) * 0.2 * R());
  }
  const dots = blossom ? lowpoly('#fffaf3') : lowpoly(R() < 0.5 ? '#ff8a2a' : '#e8452c');
  for (let i = 0; i < (blossom ? 16 : 11); i++) {
    const a = R() * TAU, b = R() * 1.2 - 0.2;
    const r = 0.34;
    add(g, new THREE.IcosahedronGeometry(blossom ? 0.022 : 0.035, 0), dots, Math.cos(a) * Math.cos(b) * r, 0.88 + Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r);
  }
  return g;
}

function makePond(R) {
  const g = new THREE.Group();
  const water = add(g, new THREE.CircleGeometry(POND.r, 48), new THREE.MeshPhysicalMaterial({
    color: '#5fc0e8', roughness: 0.06, clearcoat: 1, transparent: true, opacity: 0.9,
  }), POND.x, WATER_Y, POND.z);
  water.rotation.x = -Math.PI / 2;
  water.scale.x = POND.sx;
  water.receiveShadow = true;
  const stones = ['#b8b0a4', '#9c948a', '#d0c8bc'].map((c) => lowpoly(c));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + R() * 0.2;
    const x = POND.x + Math.cos(a) * POND.r * POND.sx * 1.05, z = POND.z + Math.sin(a) * POND.r * 1.05;
    const s = add(g, new THREE.DodecahedronGeometry(0.05 + R() * 0.035, 0), stones[i % 3], x, groundH(x, z) + 0.02, z);
    s.scale.y = 0.6;
    s.rotation.set(R(), R(), R());
  }
  const pad = lowpoly('#4caf50');
  for (let i = 0; i < 5; i++) {
    const a = R() * TAU, r = R() * POND.r * 0.7;
    const p = add(g, new THREE.CircleGeometry(0.07 + R() * 0.03, 16, 0.4, 5.6), pad, POND.x + Math.cos(a) * r * POND.sx, WATER_Y + 0.004, POND.z + Math.sin(a) * r);
    p.rotation.set(-Math.PI / 2, 0, R() * TAU);
    if (i === 0) add(g, new THREE.IcosahedronGeometry(0.03, 0), lowpoly('#ff9ec2'), p.position.x, WATER_Y + 0.03, p.position.z);
  }
  return g;
}

/* ----------------------------------------------------------- the island */

export class Farm {
  constructor(seed = 12) {
    const R = rng(seed);
    this.group = new THREE.Group();
    const G = this.group;
    G.add(makeTop(), makeUnderside());
    makeRoots(G, R);

    const place = (obj, x, z, rotY = 0, lift = 0) => {
      obj.position.set(x, groundH(x, z) + lift, z);
      obj.rotation.y = rotY;
      G.add(obj);
      return obj;
    };

    const barn = place(makeBarn(), BX, BZ, -0.85);
    this.vane = barn.userData.vane;
    place(makeSilo(), SX, SZ, -1.45);
    place(makeCoop(), CX, CZ, -0.2, 0.05);
    const pump = place(makeWindpump(), WX, WZ, 0.92);
    this.rotor = pump.userData.rotor;

    [['fruit', -1.1, -1.55], ['blossom', 0.35, -2.1], ['fruit', 1.75, -1.75], ['blossom', -2.1, -0.95], ['blossom', 2.45, 0.35], ['fruit', 0.2, -0.85]].forEach(
      ([k, x, z], i) => {
        const t = place(makeTree(k, R), x, z, R() * TAU);
        t.scale.setScalar(0.9 + R() * 0.35);
        KEEP_OUT.push([x, z, 0.32]);
        void i;
      }
    );
    G.add(makePond(R));

    // hay bales
    const hay = std('#e8c35a', { roughness: 0.95 });
    [[-0.55, 0.15, 0], [-0.22, -0.05, 0.6], [-0.72, -0.22, 1.2]].forEach(([x, z, r]) => {
      const b = place(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 22), hay), x, z, r, 0.12);
      b.rotation.z = Math.PI / 2;
      KEEP_OUT.push([x, z, 0.2]);
    });

    // stepping-stone path
    const path = new THREE.CatmullRomCurve3([V(-0.75, 0, 0.6), V(-0.15, 0, 0.45), V(0.45, 0, 0.38), V(1.0, 0, 0.25), V(1.25, 0, 0.1)]);
    const stone = lowpoly('#e2d6c2');
    for (let i = 0; i <= 11; i++) {
      const p = path.getPoint(i / 11);
      const s = place(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 9), stone), p.x + (R() - 0.5) * 0.04, p.z + (R() - 0.5) * 0.04, R() * TAU, 0.01);
      s.scale.set(1 + R() * 0.3, 1, 0.8 + R() * 0.3);
    }

    // paddock fence round the pasture, with a gate gap toward the path
    const wood = std('#f2e6cf', { roughness: 0.8 });
    const gate = Math.atan2(0.45 - PX, 0.38 - PZ);
    const posts = [];
    for (let a = 0; a < TAU; a += 0.36) {
      if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.32) { posts.push(null); continue; }
      const x = PX + Math.sin(a) * (PASTURE_R + 0.1), z = PZ + Math.cos(a) * (PASTURE_R + 0.1);
      const p = place(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), wood), x, z, a, 0.1);
      posts.push(p.position.clone());
    }
    posts.forEach((p, i) => {
      const q = posts[(i + 1) % posts.length];
      if (!p || !q) return;
      [0.06, 0.14].forEach((h) => rod(G, p.clone().setY(p.y - 0.1 + h), q.clone().setY(q.y - 0.1 + h), 0.008, wood, 4));
    });

    // 220 flowers and 420 grass tufts
    const scatter = (n, pad, fn) => {
      let made = 0, guard = 0;
      while (made < n && guard++ < n * 20) {
        const th = R() * TAU, r = Math.sqrt(R()) * (edgeR(th) - 0.25);
        const x = r * Math.sin(th), z = r * Math.cos(th);
        if (!free(x, z, pad)) continue;
        fn(x, z, made++);
      }
    };
    const FLOWERS = 220;
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.026, 0), lowpoly('#ffffff'), FLOWERS);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 3), lowpoly('#3f8a34'), FLOWERS);
    const flowerCols = ['#ff6b4a', '#ffe07f', '#fffaf0', '#f7a8c6', '#c9a7ff', '#ffa20f'].map((c) => new THREE.Color(c));
    const m4 = new THREE.Matrix4();
    scatter(FLOWERS, 0.05, (x, z, i) => {
      const y = groundH(x, z);
      m4.makeTranslation(x, y + 0.08, z);
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, flowerCols[i % flowerCols.length]);
      m4.makeTranslation(x, y + 0.04, z);
      stems.setMatrixAt(i, m4);
    });
    const blades = [];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.ConeGeometry(0.016, 0.13, 3);
      c.translate(0, 0.065, 0);
      c.rotateZ((k - 1) * 0.35);
      c.rotateY(k * 2.1);
      blades.push(c);
    }
    const TUFTS = 420;
    const tufts = new THREE.InstancedMesh(mergeGeometries(blades), lowpoly('#ffffff'), TUFTS);
    const tuftCols = ['#5aa040', '#73b950', '#4b9136', '#8cc860'].map((c) => new THREE.Color(c));
    const q = new THREE.Quaternion(), s = V(), p = V();
    scatter(TUFTS, 0.0, (x, z, i) => {
      q.setFromAxisAngle(UP, R() * TAU);
      s.setScalar(0.7 + R() * 0.7);
      m4.compose(p.set(x, groundH(x, z) - 0.01, z), q, s);
      tufts.setMatrixAt(i, m4);
      tufts.setColorAt(i, tuftCols[i % tuftCols.length]);
    });
    [heads, stems, tufts].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      G.add(m);
    });

    // eight hens in six breeds, five chicks in a line behind the first
    this.hens = Array.from({ length: 8 }, (_, i) => {
      const h = new FarmHen(BREEDS[i % BREEDS.length], seed * 10 + i);
      const [x, z] = this.pasturePoint(R);
      h.place(x, z);
      h.group.scale.setScalar(0.62);
      G.add(h.group);
      return h;
    });
    this.chicks = Array.from({ length: 5 }, (_, i) => {
      const c = new Chick(seed * 20 + i);
      c.place(this.hens[0].x - 0.1 * (i + 1), this.hens[0].z);
      c.group.scale.setScalar(0.9);
      G.add(c.group);
      return c;
    });

    // butterflies
    const wingGeo = new THREE.CircleGeometry(0.05, 10);
    wingGeo.translate(0.045, 0, 0);
    this.butterflies = ['#ff6b4a', '#ffe07f', '#9fd8ff', '#f7a8c6', '#ffffff'].map((c, i) => {
      const b = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide });
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      const wl = new THREE.Group(), wr = new THREE.Group();
      wl.add(l); wr.add(r);
      wr.rotation.y = Math.PI;
      l.rotation.x = r.rotation.x = -Math.PI / 2;
      b.add(wl, wr, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4).rotateX(Math.PI / 2), lowpoly('#2b1a10')));
      b.userData = { wl, wr, cx: (R() - 0.5) * 3, cz: (R() - 0.5) * 3, a: 0.4 + R() * 0.5, b: 0.5 + R() * 0.6, ph: R() * TAU, i };
      G.add(b);
      return b;
    });

    // clouds orbiting above
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new THREE.Color('#fff4e0'), emissiveIntensity: 0.25 });
    this.clouds = Array.from({ length: 5 }, (_, i) => {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + R() * 0.18, 1), cloudMat);
        m.position.set((k - 2) * 0.24, R() * 0.12, (R() - 0.5) * 0.2);
        c.add(m);
      }
      c.userData = { r: 3.4 + R() * 0.6, y: 1.55 + R() * 0.6, a: (i / 5) * TAU, speed: 0.04 + R() * 0.03 };
      G.add(c);
      return c;
    });

    this.group.traverse((o) => {
      if (o.isMesh && !o.material.transparent) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.clouds.forEach((c) => c.traverse((o) => (o.castShadow = false)));

    // bake the static island; animals, butterflies, clouds, the rotor and the vane stay live
    bake(G, [...this.hens.map((h) => h.group), ...this.chicks.map((c) => c.group), ...this.butterflies, ...this.clouds, this.rotor, this.vane]);
    this.hens.forEach((h) => {
      bake(h.body, [h.head]);
      bake(h.head);
      h.legs.forEach((l) => bake(l));
    });
    this.chicks.forEach((c) => bake(c.body));

    // hotspots, in island-local space, with their facing angle ψ
    this.hotspots = {
      barn: V(BX, groundH(BX, BZ) + 0.75, BZ),
      coop: V(CX, groundH(CX, CZ) + 0.85, CZ),
      pasture: V(PX, groundH(PX, PZ) + 0.25, PZ),
      pump: V(WX, groundH(WX, WZ) + 1.95, WZ),
    };
    this.psi = Object.fromEntries(Object.entries(this.hotspots).map(([k, v]) => [k, Math.atan2(v.x, v.z)]));
    this.R = R;
  }

  pasturePoint(R) {
    const a = R() * TAU, r = Math.sqrt(R()) * (PASTURE_R - 0.08);
    return [PX + Math.sin(a) * r, PZ + Math.cos(a) * r];
  }

  update(dt, time) {
    this.rotor.rotation.z = -time * 2.4;
    this.vane.rotation.y = 0.5 * Math.sin(time * 0.3);
    const pick = (R) => this.pasturePoint(R);
    this.hens.forEach((h) => h.update(dt, time, pick, groundH));
    let lead = this.hens[0];
    let lx = lead.x - Math.cos(lead.heading) * 0.08, lz = lead.z + Math.sin(lead.heading) * 0.08;
    this.chicks.forEach((c) => {
      c.follow(dt, lx, lz, groundH);
      lx = c.x; lz = c.z;
    });
    this.butterflies.forEach((b) => {
      const u = b.userData, t = time * 0.5 + u.ph;
      const x = u.cx + Math.sin(t * u.a) * 0.7, z = u.cz + Math.cos(t * u.b) * 0.6;
      const y = groundH(x, z) + 0.35 + Math.sin(t * 2.3) * 0.12;
      const nx = u.cx + Math.sin((t + 0.05) * u.a) * 0.7, nz = u.cz + Math.cos((t + 0.05) * u.b) * 0.6;
      b.position.set(x, y, z);
      b.rotation.y = Math.atan2(nx - x, nz - z);
      const flap = Math.sin(time * 22 + u.i) * 1.1;
      u.wl.rotation.z = flap;
      u.wr.rotation.z = -flap;
    });
    this.clouds.forEach((c) => {
      const u = c.userData;
      const a = u.a + time * u.speed;
      c.position.set(Math.sin(a) * u.r, u.y + Math.sin(time * 0.4 + u.a) * 0.08, Math.cos(a) * u.r);
      c.rotation.y = a;
    });
  }
}
