// Clucko · procedural textures, painted on canvases (no image files).
import * as THREE from 'three';

/** Small seeded RNG (mulberry32) so every model is identical on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { color = true, repeatX = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeatX) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Draws at x and, when the shape crosses an edge, again on the other side so the seam is invisible. */
function wrapped(W, x, r, draw) {
  draw(x);
  if (x - r < 0) draw(x + W);
  if (x + r > W) draw(x - W);
}

function blob(g, x, y, r, rgb, alpha) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${rgb},${alpha})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ------------------------------------------------------------------ shells */

export const shellTexture = (kind) =>
  memo('shell-' + kind, () => {
    const W = 1024, H = 512;
    const [c, g] = makeCanvas(W, H);
    const R = rng(kind === 'brown' ? 7 : 11);
    const brown = kind === 'brown';

    const grd = g.createLinearGradient(0, 0, 0, H);
    if (brown) {
      grd.addColorStop(0, '#b4643a');
      grd.addColorStop(0.45, '#c87e4b');
      grd.addColorStop(1, '#a6582e');
    } else {
      grd.addColorStop(0, '#fbf6ee');
      grd.addColorStop(0.5, '#f5ede1');
      grd.addColorStop(1, '#ece1d1');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // soft mottling, wrapped round the seam
    const blobs = brown ? 170 : 90;
    for (let i = 0; i < blobs; i++) {
      const x = R() * W, y = R() * H, r = 30 + R() * 120;
      const light = R() < 0.5;
      const rgb = brown ? (light ? '255,212,168' : '118,50,22') : light ? '255,255,255' : '214,196,172';
      const a = brown ? 0.05 + R() * 0.08 : 0.04 + R() * 0.05;
      wrapped(W, x, r, (xx) => blob(g, xx, y, r, rgb, a));
    }

    // freckles
    const freckles = brown ? 1600 : 420;
    for (let i = 0; i < freckles; i++) {
      const x = R() * W, y = R() * H;
      const rx = brown ? 0.6 + R() * R() * 2.6 : 0.4 + R() * 1.1;
      const ry = rx * (0.65 + R() * 0.7);
      const a = brown ? 0.15 + R() * 0.5 : 0.06 + R() * 0.14;
      const rgb = brown ? (R() < 0.7 ? '92,38,16' : '58,22,8') : '150,128,104';
      const rot = R() * Math.PI;
      wrapped(W, x, rx, (xx) => {
        g.fillStyle = `rgba(${rgb},${a})`;
        g.beginPath();
        g.ellipse(xx, y, rx, ry, rot, 0, Math.PI * 2);
        g.fill();
      });
    }
    return toTexture(c, { repeatX: true });
  });

/** Fine pores for the shell bump map (data texture, not colour). */
export const poreTexture = () =>
  memo('pores', () => {
    const W = 1024, H = 512;
    const [c, g] = makeCanvas(W, H);
    const R = rng(23);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16000; i++) {
      const x = R() * W, y = R() * H, r = 0.5 + R() * 1.3;
      const dark = R() < 0.75;
      g.fillStyle = dark ? `rgba(0,0,0,${0.18 + R() * 0.35})` : `rgba(255,255,255,${0.1 + R() * 0.2})`;
      wrapped(W, x, r, (xx) => {
        g.beginPath();
        g.arc(xx, y, r, 0, Math.PI * 2);
        g.fill();
      });
    }
    return toTexture(c, { color: false, repeatX: true });
  });

/* ----------------------------------------------------------------- feather */

/** A contour feather, painted white so instance colours tint it. Base at the bottom, tip at the top. */
export const featherTexture = () =>
  memo('feather', () => {
    const W = 128, H = 256;
    const [c, g] = makeCanvas(W, H);
    const R = rng(5);
    const cx = W / 2;
    const half = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.07 + t * 0.95)), 0.72) * (0.47 - 0.07 * t) * W;
    const yOf = (t) => H - 3 - t * (H - 8);

    const path = new Path2D();
    const steps = 46;
    path.moveTo(cx, H - 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const nick = R() < 0.14 ? 1 - R() * 0.28 : 1 - R() * 0.05;
      path.lineTo(cx - half(t) * nick, yOf(t));
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const nick = R() < 0.14 ? 1 - R() * 0.28 : 1 - R() * 0.05;
      path.lineTo(cx + half(t) * nick, yOf(t));
    }
    path.closePath();

    g.fillStyle = '#fff';
    g.fill(path);

    g.save();
    g.clip(path);
    // soft darker lace edge
    for (const [w, a] of [[26, 0.08], [16, 0.12], [8, 0.18]]) {
      g.lineWidth = w;
      g.strokeStyle = `rgba(60,34,20,${a})`;
      g.stroke(path);
    }
    // barbs
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const y = yOf(t);
      const hw = half(t);
      g.lineWidth = 1;
      g.strokeStyle = i % 2 ? 'rgba(80,50,30,0.10)' : 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(cx, y);
      g.lineTo(cx - hw, y - 16);
      g.moveTo(cx, y);
      g.lineTo(cx + hw, y - 16);
      g.stroke();
    }
    // a soft centre sheen
    const sh = g.createLinearGradient(cx - 30, 0, cx + 30, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    g.restore();

    // shaft
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(70,40,24,0.25)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + 1, H - 2);
    g.lineTo(cx + 1, H * 0.12);
    g.stroke();
    g.strokeStyle = 'rgba(255,252,240,0.95)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, H - 2);
    g.lineTo(cx, H * 0.12);
    g.stroke();

    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });

/* -------------------------------------------------------------------- glow */

export const glowTexture = () =>
  memo('glow', () => {
    const S = 128;
    const [c, g] = makeCanvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return toTexture(c);
  });

/* ------------------------------------------------------------ paper fibre */

/** Bump map for the moulded pulp carton. */
export const paperTexture = () =>
  memo('paper', () => {
    const S = 512;
    const [c, g] = makeCanvas(S, S);
    const R = rng(31);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) blob(g, R() * S, R() * S, 10 + R() * 40, R() < 0.5 ? '0,0,0' : '255,255,255', 0.06);
    for (let i = 0; i < 7500; i++) {
      const x = R() * S, y = R() * S, l = 3 + R() * 12, a = R() * Math.PI;
      g.strokeStyle = R() < 0.6 ? `rgba(0,0,0,${0.08 + R() * 0.18})` : `rgba(255,255,255,${0.08 + R() * 0.18})`;
      g.lineWidth = 0.6 + R() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    const t = toTexture(c, { color: false });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  });

/* ---------------------------------------------------------------- sticker */

export const todayStamp = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

function drawTinyHen(g, x, y) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#24140c';
  g.beginPath(); // tail
  g.moveTo(-62, -6);
  g.quadraticCurveTo(-122, -84, -84, -112);
  g.quadraticCurveTo(-62, -60, -26, -30);
  g.fill();
  g.beginPath(); // body
  g.ellipse(-4, 12, 80, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath(); // neck
  g.moveTo(28, -40); g.lineTo(82, -42); g.lineTo(54, 22); g.lineTo(8, 12);
  g.fill();
  g.beginPath(); // head
  g.arc(60, -52, 32, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff6b4a';
  [[46, -88, 13], [62, -93, 14], [78, -85, 12]].forEach(([a, b, r]) => { g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fill(); });
  g.beginPath();
  g.ellipse(86, -26, 8, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffa20f';
  g.beginPath(); // beak
  g.moveTo(88, -60); g.lineTo(114, -50); g.lineTo(88, -40);
  g.fill();
  g.fillStyle = '#fff3df';
  g.beginPath();
  g.arc(68, -58, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#24140c';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath(); // nest
  g.moveTo(-96, 64);
  g.quadraticCurveTo(0, 96, 96, 64);
  g.stroke();
  g.restore();
}

function drawSticker(g, W, H, kind, count) {
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 16, 70);
  g.fillStyle = '#1d4a35';
  g.fill();

  const cx = 250, cy = H / 2;
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255,224,127,0.13)';
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 760, a0, a0 + Math.PI / 24);
    g.closePath();
    g.fill();
  }
  g.restore();

  g.beginPath();
  g.roundRect(30, 30, W - 60, H - 60, 52);
  g.strokeStyle = 'rgba(255,243,223,0.5)';
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.stroke();
  g.setLineDash([]);

  g.beginPath();
  g.arc(cx, cy, 152, 0, Math.PI * 2);
  g.fillStyle = '#ffe07f';
  g.fill();
  drawTinyHen(g, cx, cy + 16);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff3df';
  g.font = '700 142px Fraunces, Georgia, serif';
  g.fillText('Clucko', 440, 250, 380);
  g.fillStyle = '#ffe07f';
  g.font = 'italic 500 46px Fraunces, Georgia, serif';
  g.fillText(`free-range ${kind} eggs`, 444, 328, 540);
  g.fillStyle = 'rgba(255,243,223,0.88)';
  g.font = '600 30px Outfit, system-ui, sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  g.fillText(`LAID ${todayStamp()}`, 444, 420, 340);
  g.fillText('FARM 07 · PUNE', 444, 462, 340);
  if ('letterSpacing' in g) g.letterSpacing = '0px';

  const bx = W - 132, by = H - 132;
  g.beginPath();
  g.arc(bx, by, 86, 0, Math.PI * 2);
  g.fillStyle = '#ffa20f';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#fff3df';
  g.stroke();
  g.fillStyle = '#24140c';
  g.textAlign = 'center';
  g.font = '800 80px Fraunces, Georgia, serif';
  g.fillText(String(count), bx, by + 14);
  g.font = '700 22px Outfit, system-ui, sans-serif';
  g.fillText('EGGS', bx, by + 50);
  g.textAlign = 'left';
}

/** The carton label, drawn with the page fonts once they load (redrawn when they arrive). */
export const stickerTexture = (kind = 'brown', count = 12) =>
  memo(`sticker-${kind}-${count}`, () => {
    const W = 1024, H = 640;
    const [c, g] = makeCanvas(W, H);
    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const draw = () => {
      drawSticker(g, W, H, kind, count);
      t.needsUpdate = true;
    };
    draw();
    if (document.fonts) {
      Promise.all([
        document.fonts.load('700 100px Fraunces'),
        document.fonts.load('italic 500 46px Fraunces'),
        document.fonts.load('600 30px Outfit'),
      ]).then(draw, () => {});
    }
    return t;
  });
