/* Clucko · page chrome: smooth scroll, loader, nav, reveals.
   A classic script, so it runs before the 3D module and owns the shared clock. */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------- one clock for everything */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); // registered first, so the 3D reads the updated scroll
    lenis.stop();
  }
  gsap.ticker.lagSmoothing(0);
  window.clucko = { lenis, reduce };

  // in-page links go through Lenis
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else window.scrollTo({ top: target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
  });

  /* -------------------------------------------------------------- loader */
  const loader = document.getElementById('loader');
  const countEl = document.getElementById('loaderCount');
  const msgEl = document.getElementById('loaderMsg');
  const yolk = document.getElementById('loaderYolkFill');
  const crack = loader.querySelector('.loader__crack');
  const MESSAGES = [
    [0, 'Waking up the hens'],
    [34, 'Fluffing the straw'],
    [67, 'Warming the nest'],
  ];
  const CAP = 9000;

  let worldReady = !!(window.__cluckoWorld && window.__cluckoWorld.ready);
  window.addEventListener('clucko:world-ready', () => (worldReady = true));

  const t0 = performance.now();
  let last = t0, shown = 0, msg = -1, done = false;

  function yolkPath(p, time) {
    // a wobbly yolk surface rising from the bottom of the egg
    const y = 150 - 146 * p;
    const amp = p > 0.02 && p < 0.99 ? 3 : 0;
    let d = `M0 ${y.toFixed(1)}`;
    for (let x = 0; x <= 120; x += 10) {
      d += ` L${x} ${(y + Math.sin(x * 0.09 + time * 0.006) * amp).toFixed(1)}`;
    }
    return d + ' L120 300 L0 300 Z';
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;
    const target = worldReady || elapsed > CAP ? 100 : Math.min(92, (elapsed / 2600) * 92);
    shown = Math.min(target, shown + Math.max((target - shown) * dt * 5, dt * 28));
    const p = shown / 100;
    countEl.textContent = String(Math.floor(shown)).padStart(3, '0');
    yolk.setAttribute('d', yolkPath(p, now));
    const m = MESSAGES.reduce((acc, [at], i) => (shown >= at ? i : acc), 0);
    if (m !== msg) {
      msg = m;
      msgEl.textContent = MESSAGES[m][1];
    }
    if (shown >= 100 && !done) {
      done = true;
      finish();
      return;
    }
    requestAnimationFrame(tick);
  }

  function finish() {
    const tl = gsap.timeline({ onComplete: begin });
    if (reduce) {
      tl.to(loader, { autoAlpha: 0, duration: 0.3 });
      return;
    }
    tl.to(crack, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, 0.15)
      .to('.loader__egg', { scale: 1.06, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 0.55)
      .to(loader, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, 0.8)
      .set(loader, { autoAlpha: 0 });
  }

  function begin() {
    root.classList.remove('is-loading');
    if (lenis) lenis.start();
    window.__cluckoStarted = true;
    window.dispatchEvent(new CustomEvent('clucko:start'));
    heroIn();
    ScrollTrigger.refresh();
  }

  requestAnimationFrame(tick);

  /* ------------------------------------------------------- hero reveal */
  function heroIn() {
    const lines = document.querySelectorAll('.hero__title .line > span');
    const bits = document.querySelectorAll('[data-hero-in]');
    if (reduce) {
      gsap.set(lines, { yPercent: 0, y: 0 });
      gsap.set(bits, { opacity: 1 });
      return;
    }
    gsap.fromTo(lines, { yPercent: 110 }, { yPercent: 0, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12 });
    gsap.fromTo(bits, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.25 });
  }

  /* ------------------------------------------------------- block reveals */
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (reduce) return;
    gsap.from(el, {
      y: 28,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  /* ----------------------------------------------------- nav over dark */
  // checked every frame, so even a jump straight into the section (anchor, reduced motion) is caught
  const nav = document.getElementById('nav');
  const darkZones = [...document.querySelectorAll('[data-nav-dark]')];
  let navDark = false;
  gsap.ticker.add(() => {
    const y = nav.offsetTop + nav.offsetHeight / 2;
    const dark = darkZones.some((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= y && r.bottom >= y;
    });
    if (dark !== navDark) nav.classList.toggle('is-dark', (navDark = dark));
  });

  /* ------------------------------------------- stage UI, read from scroll */
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const smooth = (t) => (t = clamp01(t), t * t * (3 - 2 * t));
  const progressOf = (el) => {
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? clamp01(-r.top / span) : r.top <= 0 ? 1 : 0;
  };
  const near = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -100 && r.top < window.innerHeight + 100;
  };

  const eggsSec = document.getElementById('eggs');
  const heads = eggsSec ? [...eggsSec.querySelectorAll('[data-head]')] : [];
  const pills = eggsSec && eggsSec.querySelector('.pills');
  const boxSec = document.getElementById('box');
  const steps = boxSec ? [...boxSec.querySelectorAll('[data-step]')] : [];
  const cartonCountEl = boxSec && boxSec.querySelector('[data-carton-count]');
  const farmSec = document.getElementById('farm');

  const SKY = [
    // top, bottom, sun
    ['#ffb38a', '#ffe8cc', '#ffcf70'], // dawn peach
    ['#7cc6ff', '#e2f4ff', '#fff3b0'], // noon blue
    ['#ff9548', '#ffd98c', '#ffb347'], // golden hour
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  };

  let lastHead = -1, lastCount = -1;
  gsap.ticker.add(() => {
    if (eggsSec && near(eggsSec)) {
      const e = progressOf(eggsSec);
      const h = e < 0.45 ? 0 : e < 0.8 ? 1 : 2;
      if (h !== lastHead) {
        lastHead = h;
        heads.forEach((el, i) => {
          el.classList.toggle('is-on', i === h);
          el.setAttribute('aria-hidden', i === h ? 'false' : 'true');
        });
      }
      const warm = smooth(seg(e, 0.42, 0.6)) * (1 - 0.55 * smooth(seg(e, 0.8, 0.93)));
      eggsSec.style.setProperty('--warm', warm.toFixed(3));
      if (pills) pills.classList.toggle('is-on', e > 0.52 && e < 0.82);
    }
    if (boxSec && near(boxSec)) {
      const P = progressOf(boxSec);
      const world = window.cluckoWorld;
      const arrived = world ? world.state.journeyIn : P > 0;
      const fill = reduce ? 1 : seg(P, 0.02, 0.32);
      const count = (arrived ? 2 : 0) + Math.round(fill * 10);
      if (count !== lastCount && cartonCountEl) cartonCountEl.textContent = lastCount = count;
      const done = [reduce || fill >= 1, reduce || P >= 0.55, reduce || P >= 0.72];
      const active = P < 0.35 ? 0 : P < 0.58 ? 1 : 2;
      steps.forEach((s, i) => {
        s.classList.toggle('is-active', i === active);
        s.classList.toggle('is-done', done[i]);
      });
      boxSec.style.setProperty('--fill', fill.toFixed(3));
    }
    if (farmSec && near(farmSec)) {
      const f = progressOf(farmSec);
      const a = f < 0.5 ? 0 : 1, t = f < 0.5 ? smooth(f / 0.5) : smooth((f - 0.5) / 0.5);
      const [t0, b0, s0] = SKY[a], [t1, b1, s1] = SKY[a + 1];
      farmSec.style.setProperty('--sky-top', mix(t0, t1, t));
      farmSec.style.setProperty('--sky-bot', mix(b0, b1, t));
      farmSec.style.setProperty('--sun', mix(s0, s1, t));
      farmSec.style.setProperty('--sun-x', `${(12 + 76 * f).toFixed(2)}%`);
      farmSec.style.setProperty('--sun-y', `${(74 - 56 * Math.sin(Math.PI * f)).toFixed(2)}%`);
    }
  });

  /* ------------------------------------------------------ counted stats */
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const to = +el.dataset.countTo;
    const fmt = (v) => Math.round(v).toLocaleString('en-IN');
    if (reduce) { el.textContent = fmt(to); return; }
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => (el.textContent = fmt(o.v)) }),
    });
  });

  /* ------------------------------------------------------ packs & basket */
  const shots = () => window.cluckoShots || null;
  let packKind = 'brown';
  const packs = [...document.querySelectorAll('.pack')];

  function renderPacks() {
    const s = shots();
    packs.forEach((card) => {
      const n = card.dataset.size;
      card.querySelector('[data-price]').textContent = card.dataset['price' + (packKind === 'brown' ? 'Brown' : 'White')];
      const img = card.querySelector('img');
      img.alt = img.alt.replace(/brown|white/, packKind);
      const src = s && s[`${packKind}-${n}`];
      if (src && img.getAttribute('src') !== src) {
        img.onload = () => img.classList.add('is-ready');
        img.src = src;
      }
    });
  }
  window.addEventListener('clucko:shots', renderPacks);
  renderPacks();

  function bindToggle(group, onPick) {
    if (!group) return;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(b.dataset.kind);
    });
  }
  bindToggle(document.querySelector('[data-kind-toggle="packs"]'), (k) => {
    packKind = k;
    renderPacks();
  });
  bindToggle(document.querySelector('[data-kind-toggle="box"]'), (k) => {
    window.dispatchEvent(new CustomEvent('clucko:box-kind', { detail: { kind: k } }));
  });

  const basket = document.querySelector('.basket');
  const basketCount = document.querySelector('[data-basket-count]');
  let items = 0;
  try { items = +(localStorage.getItem('clucko-basket') || 0) || 0; } catch (err) { items = 0; }
  const showCount = () => {
    basketCount.textContent = items;
    basket.setAttribute('aria-label', `Basket, ${items} item${items === 1 ? '' : 's'}`);
  };
  showCount();

  const toast = document.getElementById('toast');
  let toastTimer = 0;
  function say(text) {
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2600);
  }

  const PACK_NAMES = { 6: 'half dozen', 10: 'weekender', 12: 'full dozen' };
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.pack');
      const n = card.dataset.size;
      const done = () => {
        items++;
        try { localStorage.setItem('clucko-basket', String(items)); } catch (err) { /* private mode */ }
        showCount();
        basket.classList.remove('is-bump');
        void basket.offsetWidth;
        basket.classList.add('is-bump');
      };
      say(`A ${PACK_NAMES[n] || n + '-pack'} of ${packKind} eggs, in the basket. Good choice.`);
      if (reduce) return done();
      const from = btn.getBoundingClientRect(), to = basket.getBoundingClientRect();
      const egg = document.createElement('div');
      egg.className = `fly-egg fly-egg--${packKind}`;
      document.body.appendChild(egg);
      const x0 = from.left + from.width / 2 - 11, y0 = from.top - 14;
      const x1 = to.left + to.width / 2 - 11, y1 = to.top + to.height / 2 - 14;
      const lift = Math.min(260, Math.abs(y1 - y0) * 0.4 + 120);
      const o = { t: 0 };
      gsap.to(o, {
        t: 1,
        duration: 0.85,
        ease: 'power1.inOut',
        onUpdate: () => {
          const t = o.t;
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t - lift * 4 * t * (1 - t);
          egg.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${t * 540}deg) scale(${1 - t * 0.35})`;
        },
        onComplete: () => { egg.remove(); done(); },
      });
    });
  });
  basket.addEventListener('click', () => say(items ? `${items} box${items === 1 ? '' : 'es'} in your basket, keeping warm.` : 'Your basket is empty. The hens are ready when you are.'));

  /* ---------------------------------------------------------- newsletter */
  const news = document.querySelector('.news');
  if (news) {
    news.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = news.querySelector('input');
      const msg = news.querySelector('.news__msg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        msg.textContent = 'That one looks a little scrambled. Try again?';
        input.focus();
        return;
      }
      msg.textContent = "You're on the list. First letter lands Sunday.";
      input.value = '';
    });
  }

  /* -------------------------------------------- drifting feathers, motes */
  const drift = document.getElementById('drift');
  if (drift && !reduce) {
    const g = drift.getContext('2d');
    const COLORS = ['#ffe07f', '#ffb36b', '#ff8f70', '#fff3df', '#93d8b6', '#9fd8ff', '#f7b7d2'];
    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      drift.width = W * dpr;
      drift.height = H * dpr;
    };
    size();
    window.addEventListener('resize', size);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const feathers = Array.from({ length: W < 760 ? 9 : 16 }, (_, i) => ({
      x: rnd(0, W), y: rnd(-H, H), s: rnd(9, 20), vy: rnd(14, 30), ph: rnd(0, 6.3), rot: rnd(-1, 1), c: COLORS[i % COLORS.length],
    }));
    const motes = Array.from({ length: W < 760 ? 14 : 28 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2.4), vy: rnd(4, 12), ph: rnd(0, 6.3) }));
    let lastY = window.scrollY;
    let speed = 0;
    gsap.ticker.add((time, dms) => {
      const dt = Math.min(dms / 1000, 0.05);
      const sy = window.scrollY;
      const v = lenis ? Math.abs(lenis.velocity) : Math.abs(sy - lastY) / Math.max(dt, 0.001) / 60;
      lastY = sy;
      speed += (Math.min(v, 60) - speed) * Math.min(1, dt * 4);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      motes.forEach((m) => {
        m.y -= (m.vy + speed * 0.6) * dt;
        if (m.y < -10) { m.y = H + 10; m.x = rnd(0, W); }
        const a = 0.25 + 0.25 * Math.sin(time * 1.6 + m.ph);
        g.fillStyle = `rgba(255,205,110,${a.toFixed(3)})`;
        g.beginPath();
        g.arc(m.x + Math.sin(time * 0.6 + m.ph) * 6, m.y, m.r, 0, Math.PI * 2);
        g.fill();
      });
      feathers.forEach((f) => {
        f.y += (f.vy + speed * 6) * dt;
        if (f.y > H + 40) { f.y = -40; f.x = rnd(0, W); }
        const x = f.x + Math.sin(time * 0.9 + f.ph) * 26;
        const r = f.rot + Math.sin(time * 1.3 + f.ph) * 0.5;
        g.save();
        g.translate(x, f.y);
        g.rotate(r);
        g.globalAlpha = 0.75;
        g.fillStyle = f.c;
        g.beginPath();
        g.moveTo(0, -f.s);
        g.bezierCurveTo(f.s * 0.55, -f.s * 0.5, f.s * 0.45, f.s * 0.6, 0, f.s);
        g.bezierCurveTo(-f.s * 0.45, f.s * 0.6, -f.s * 0.55, -f.s * 0.5, 0, -f.s);
        g.fill();
        g.globalAlpha = 0.5;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, -f.s * 0.8);
        g.lineTo(0, f.s * 1.25);
        g.stroke();
        g.restore();
      });
    });
  } else if (drift) {
    drift.style.display = 'none';
  }
})();
