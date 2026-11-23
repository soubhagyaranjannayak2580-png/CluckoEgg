// Clucko · the moulded-pulp egg carton.
// Carton-local axes: x along the length, z across the two rows (+z = front row), y up; cup rims at y = 0.
// Cup index: front row 0..cols-1 (left to right), back row cols..2·cols-1.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Egg, EGG } from './egg.js';
import { paperTexture, stickerTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function bounceOut(x) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

export const PITCH = 0.8;
const RIM_R = 0.37;
const SEAT = -0.36; // egg bottom
const LID_H = 0.66;
const OPEN = 1.95; // lid open angle (rad)

let PULP = null;
const pulp = () =>
  (PULP ||= new THREE.MeshStandardMaterial({
    color: '#dcc7a3', roughness: 0.95, metalness: 0, bumpMap: paperTexture(), bumpScale: 2, side: THREE.DoubleSide,
  }));

let CUP = null;
function cupGeometry() {
  if (CUP) return CUP;
  const prof = [[0, -0.44], [0.08, -0.435], [0.17, -0.4], [0.26, -0.32], [0.315, -0.2], [0.35, -0.08], [0.365, -0.02], [RIM_R, 0]];
  return (CUP = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40));
}

const rounded = (w, h, d, r = 0.015) => new RoundedBoxGeometry(w, h, d, 2, r);
const mk = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export class Carton {
  constructor({ cols = 6, kind = 'brown', reserved = [] } = {}) {
    this.cols = cols;
    this.kind = kind;
    this.reserved = new Set(reserved);
    this.group = new THREE.Group();
    const mat = pulp();
    const L = cols * PITCH, Wd = 2 * PITCH;
    const PW = L + 0.18, PD = Wd + 0.18;
    this.size = { L, Wd, PW, PD };

    // cups
    this.cups = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const p = V((c - (cols - 1) / 2) * PITCH, 0, r === 0 ? PITCH / 2 : -PITCH / 2);
        this.cups.push(p);
        const cup = mk(cupGeometry(), mat);
        cup.position.copy(p);
        this.group.add(cup);
      }
    }

    // top plate with a hole per cup
    const rect = (w, d) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
      return s;
    };
    const plateShape = rect(PW, PD);
    this.cups.forEach((p) => {
      const h = new THREE.Path();
      h.absarc(p.x, -p.z, RIM_R - 0.005, 0, Math.PI * 2, true);
      plateShape.holes.push(h);
    });
    const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.035, bevelEnabled: false, curveSegments: 28 });
    plateGeo.rotateX(-Math.PI / 2).translate(0, -0.035, 0);
    this.group.add(mk(plateGeo, mat));

    // skirt
    const skirtShape = rect(PW, PD);
    const hole = new THREE.Path();
    const iw = PW / 2 - 0.035, id = PD / 2 - 0.035;
    hole.moveTo(-iw, -id); hole.lineTo(-iw, id); hole.lineTo(iw, id); hole.lineTo(iw, -id); hole.closePath();
    skirtShape.holes.push(hole);
    const skirtGeo = new THREE.ExtrudeGeometry(skirtShape, { depth: 0.42, bevelEnabled: false });
    skirtGeo.rotateX(-Math.PI / 2).translate(0, -0.455, 0);
    this.group.add(mk(skirtGeo, mat));

    // separator posts between the rows
    const postGeo = new THREE.CylinderGeometry(0.05, 0.1, 0.56, 14);
    for (let c = 0; c < cols - 1; c++) {
      const post = mk(postGeo, mat);
      post.position.set((c + 1 - cols / 2) * PITCH, -0.16, 0);
      this.group.add(post);
    }

    // hinged lid (pivot on the back edge)
    const LW = PW + 0.04, LD = PD + 0.04;
    this.lid = new THREE.Group();
    this.lid.position.set(0, 0, -PD / 2);
    const top = mk(rounded(LW, 0.045, LD, 0.02), mat);
    top.position.set(0, LID_H, LD / 2 - 0.02);
    const front = mk(rounded(LW, LID_H, 0.04), mat);
    front.position.set(0, LID_H / 2, LD - 0.02);
    const back = mk(rounded(LW, LID_H, 0.04), mat);
    back.position.set(0, LID_H / 2, -0.02);
    const sideGeo = rounded(0.04, LID_H, LD);
    const left = mk(sideGeo, mat), right = mk(sideGeo, mat);
    left.position.set(-LW / 2, LID_H / 2, LD / 2 - 0.02);
    right.position.set(LW / 2, LID_H / 2, LD / 2 - 0.02);
    this.lid.add(top, front, back, left, right);
    [0.12, 0.88].forEach((f) => {
      const ridge = mk(rounded(LW * 0.9, 0.05, 0.07, 0.02), mat);
      ridge.position.set(0, LID_H + 0.04, LD * f - 0.02);
      this.lid.add(ridge);
    });
    const tab = mk(rounded(0.55, 0.16, 0.05), mat);
    tab.position.set(0, -0.04, LD - 0.01);
    this.lid.add(tab);

    // the sticker and its flash
    const sw = Math.min(1.6, LW * 0.62), sh = sw * 0.625;
    this.stickerRest = new THREE.Vector3(0, LID_H + 0.03, LD / 2 - 0.02);
    this.sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, sh),
      new THREE.MeshStandardMaterial({ map: stickerTexture(kind, cols * 2), roughness: 0.55, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    this.sticker.rotation.x = -Math.PI / 2;
    this.sticker.position.copy(this.stickerRest);
    this.sticker.castShadow = true;
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(sw * 1.25, sh * 1.25),
      new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.position.copy(this.stickerRest).add(V(0, 0.01, 0));
    this.lid.add(this.sticker, this.flash);
    this.group.add(this.lid);

    // eggs: one per cup that isn't reserved for an egg arriving from elsewhere
    this.eggs = this.cups.map((p, i) => {
      if (this.reserved.has(i)) return null;
      const e = new Egg(kind);
      e.group.position.set(p.x, SEAT + EGG.a, p.z);
      e.group.rotation.y = i * 1.7;
      e.group.visible = false;
      this.group.add(e.group);
      return e;
    });
    // fill order: back row left to right, then the front row from the outside in
    const backRow = this.cups.map((_, i) => i).filter((i) => i >= cols);
    const frontRow = this.cups.map((_, i) => i).filter((i) => i < cols).sort((a, b) => Math.abs(b - (cols - 1) / 2) - Math.abs(a - (cols - 1) / 2));
    this.order = [...backRow, ...frontRow].filter((i) => !this.reserved.has(i));

    this.dropped = 0;
    this.setLid(0);
    this.setSticker(0);
    this._v = V();
    this._s = V();
  }

  /** Drops the eggs in one after another with a bounce. */
  setFill(p) {
    const n = this.order.length;
    let dropped = 0;
    this.order.forEach((cup, k) => {
      const e = this.eggs[cup];
      const q = clamp01((p - (k / n) * 0.78) / 0.22);
      e.group.visible = q > 0;
      e.group.position.y = SEAT + EGG.a + 1.5 * (1 - bounceOut(q));
      if (q > 0.5) dropped++;
    });
    this.dropped = dropped;
    return dropped;
  }

  /** Closes the lid with a little settle. */
  setLid(p) {
    p = clamp01(p);
    const e = inOut(clamp01(p / 0.82));
    const settle = p > 0.82 ? Math.sin(((p - 0.82) / 0.18) * Math.PI) * 0.07 : 0;
    this.lid.rotation.x = -(OPEN * (1 - e) + settle);
  }

  /** Slaps the sticker down with a squash and a flash. */
  setSticker(p) {
    p = clamp01(p);
    const s = this.sticker;
    s.visible = p > 0;
    const q = clamp01(p / 0.6);
    const fall = 1 - q * q;
    s.position.copy(this.stickerRest);
    s.position.y += fall * 1.3;
    s.rotation.z = fall * 0.7;
    const squash = p > 0.6 ? Math.sin(clamp01((p - 0.6) / 0.3) * Math.PI) * 0.12 : 0;
    const sc = 1 + fall * 0.3;
    s.scale.set(sc + squash, sc - squash * 0.6, 1);
    const f = Math.max(0, 1 - Math.abs(p - 0.64) / 0.14) * 0.85;
    this.flash.material.opacity = f;
    this.flash.visible = f > 0.01;
  }

  setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.eggs.forEach((e) => e && e.setKind(kind));
    this.sticker.material.map = stickerTexture(kind, this.cols * 2);
    this.sticker.material.needsUpdate = true;
  }

  /** A cup's egg pose in world space: { p, q, s }. Call after the carton's matrices are current. */
  cupPose(i, out) {
    const c = this.cups[i];
    out.p.set(c.x, SEAT + EGG.a, c.z).applyMatrix4(this.group.matrixWorld);
    this.group.getWorldQuaternion(out.q);
    out.s = this.group.getWorldScale(this._s).x;
    out.sy = out.sxz = 1;
    return out;
  }
}
