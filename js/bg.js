/* ==========================================================================
   CLUTCH — bg.js
   Site-wide animated synthwave background on one fixed <canvas>.
   Layers (back to front): parallax pixel starfield · neon horizon glow ·
   perspective grid floor scrolling toward the viewer · comet streaks ·
   faint pixel power-up sprites drifting up.
   Respects prefers-reduced-motion (draws one still frame), pauses when the
   tab is hidden, lowers particle counts on phones, caps DPR at 1.5.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__clutchBg) return; window.__clutchBg = true;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PAL = { pink: '#FF5FA2', violet: '#7C5CFF', cyan: '#3EC6FF', yellow: '#FFD23F', text: '#F1F4FF' };

  const cv = document.createElement('canvas');
  cv.id = 'bg-canvas'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block';
  document.body.prepend(cv);
  document.body.classList.add('has-bg');
  const ctx = cv.getContext('2d', { alpha: true });

  let W = 0, H = 0, DPR = 1, mobile = false;
  let stars = [], sprites = [], comets = [];
  let t0 = performance.now(), last = t0, gridOff = 0, running = false, raf = 0;

  /* ----------------------------- pixel sprites ---------------------------- */
  // 8x8 pixel-art power-ups. Letters map to PAL keys; '.' empty.
  const SPR = {
    bolt:  ['...yy...', '..yy....', '.yy.....', 'yyyyyy..', '..yyyy..', '...yy...', '..yy....', '.y......'],
    star:  ['...y....', '...y....', '.yyyyy..', '..yyy...', '.yy.yy..', 'y.....y.', '........', '........'],
    heart: ['.pp..pp.', 'pppppppp', 'pppppppp', '.pppppp.', '..pppp..', '...pp...', '........', '........'],
    pad:   ['.vvvvvv.', 'vvtvvvyv', 'vtttvyvy', 'vvtvvvyv', 'vvvvvvvv', 'vv....vv', '........', '........'],
    coin:  ['..yyyy..', '.yyyyyy.', 'yyy..yyy', 'yyy..yyy', 'yyy..yyy', '.yyyyyy.', '..yyyy..', '........'],
    aim:   ['..cccc..', '.c....c.', 'c..cc..c', 'c.cccc.c', 'c..cc..c', '.c....c.', '..cccc..', '........'],
  };
  const COLOR = { y: PAL.yellow, p: PAL.pink, v: PAL.violet, c: PAL.cyan, t: PAL.text };
  const spriteCache = {};
  function spriteCanvas(name, px) {
    const key = name + px; if (spriteCache[key]) return spriteCache[key];
    const map = SPR[name], c = document.createElement('canvas'); c.width = c.height = 8 * px;
    const g = c.getContext('2d');
    map.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = COLOR[ch]; g.fillRect(x * px, y * px, px, px); } }));
    return spriteCache[key] = c;
  }

  /* ------------------------------- setup --------------------------------- */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    mobile = W < 700;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
    if (!running) frame(performance.now(), true);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function seed() {
    const n = mobile ? 70 : 150;
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.72,
      z: Math.random(),                      // depth: 0 far, 1 near
      s: Math.random() < 0.15 ? 2 : 1,       // pixel size
      ph: Math.random() * Math.PI * 2, tw: rnd(0.6, 1.8),
      c: Math.random() < 0.72 ? PAL.text : (Math.random() < 0.5 ? PAL.cyan : PAL.pink),
    }));
    const names = Object.keys(SPR);
    sprites = Array.from({ length: mobile ? 4 : 7 }, (_, i) => newSprite(names[i % names.length], true));
    comets = [];
  }
  function newSprite(name, anywhere) {
    const px = mobile ? 3 : 4;
    return { name, px, x: rnd(0.04, 0.96) * W, y: anywhere ? rnd(0, H) : H + 40, vy: rnd(8, 16), vx: rnd(-4, 4), a: rnd(0.10, 0.22), rot: rnd(-0.25, 0.25), sway: rnd(0, 6.28) };
  }
  function newComet() {
    const fromLeft = Math.random() < 0.5;
    const y = rnd(H * 0.05, H * 0.45);
    return { x: fromLeft ? -60 : W + 60, y, vx: (fromLeft ? 1 : -1) * rnd(420, 700), vy: rnd(60, 160), life: 0, max: rnd(0.9, 1.5), c: Math.random() < 0.5 ? PAL.cyan : PAL.pink };
  }

  /* -------------------------------- draw --------------------------------- */
  function frame(now, still) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const T = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // --- horizon glow (sun behind the grid) ---
    const hy = H * 0.72;
    const g = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, Math.max(W, H) * 0.55);
    g.addColorStop(0, 'rgba(124,92,255,0.22)'); g.addColorStop(0.45, 'rgba(255,95,162,0.07)'); g.addColorStop(1, 'rgba(13,19,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // --- stars (pixel squares, twinkle, slow parallax drift) ---
    for (const s of stars) {
      if (!still) { s.x -= (2 + s.z * 6) * dt; if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H * 0.72; } }
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(T * s.tw + s.ph));
      ctx.globalAlpha = (0.25 + 0.55 * s.z) * tw;
      ctx.fillStyle = s.c; ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // --- perspective grid floor ---
    if (!still) gridOff = (gridOff + dt * 0.55) % 1;
    const floorTop = hy, floorH = H - hy;
    ctx.lineWidth = 1;
    // horizontal lines: spacing grows toward the viewer (perspective), scrolling down
    const rows = 14;
    for (let i = 0; i <= rows; i++) {
      const k = ((i + gridOff) / rows);            // 0 at horizon → 1 at bottom
      const y = floorTop + Math.pow(k, 2.2) * floorH;
      if (y > H + 2) continue;
      const a = Math.min(1, k * 1.4) * 0.55;
      ctx.strokeStyle = `rgba(124,92,255,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // vertical lines fan out from a vanishing point above the horizon
    const vpX = W / 2, vpY = floorTop - floorH * 0.35, cols = mobile ? 14 : 24;
    const spread = W * 2.6;
    for (let i = -cols; i <= cols; i++) {
      const xBottom = W / 2 + (i / cols) * spread;
      // where this line crosses the horizon
      const tHz = (floorTop - vpY) / (H - vpY);
      const xHz = vpX + (xBottom - vpX) * tHz;
      const a = 0.42 * (1 - Math.min(1, Math.abs(i) / cols) * 0.5);
      ctx.strokeStyle = `rgba(62,198,255,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(xHz, floorTop); ctx.lineTo(xBottom, H); ctx.stroke();
    }
    // horizon line + fade so the grid doesn't fight page content
    ctx.strokeStyle = 'rgba(255,95,162,0.55)'; ctx.beginPath(); ctx.moveTo(0, floorTop); ctx.lineTo(W, floorTop); ctx.stroke();
    const fade = ctx.createLinearGradient(0, floorTop, 0, H);
    fade.addColorStop(0, 'rgba(13,19,40,0)'); fade.addColorStop(1, 'rgba(13,19,40,0.55)');
    ctx.fillStyle = fade; ctx.fillRect(0, floorTop, W, floorH);

    // --- comets ---
    if (!still) {
      if (comets.length < 2 && Math.random() < dt * (mobile ? 0.12 : 0.22)) comets.push(newComet());
      for (const c of comets) { c.x += c.vx * dt; c.y += c.vy * dt; c.life += dt; }
      comets = comets.filter(c => c.life < c.max);
    }
    for (const c of comets) {
      const k = 1 - c.life / c.max;
      const len = 90 * k + 30, dx = -c.vx, dy = -c.vy, L = Math.hypot(dx, dy) || 1;
      const ex = c.x + dx / L * len, ey = c.y + dy / L * len;
      const cg = ctx.createLinearGradient(c.x, c.y, ex, ey);
      cg.addColorStop(0, c.c); cg.addColorStop(1, 'rgba(13,19,40,0)');
      ctx.strokeStyle = cg; ctx.lineWidth = 2; ctx.globalAlpha = 0.9 * k;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = PAL.text; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3);
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;

    // --- drifting pixel sprites ---
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (!still) {
        s.y -= s.vy * dt; s.x += (s.vx + Math.sin(T * 0.6 + s.sway) * 6) * dt;
        if (s.y < -60) sprites[i] = newSprite(s.name, false);
      }
      const img = spriteCanvas(s.name, s.px);
      ctx.save(); ctx.globalAlpha = s.a; ctx.translate(s.x, s.y); ctx.rotate(s.rot + Math.sin(T * 0.4 + s.sway) * 0.08);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
    }

    // --- faint scanlines over everything (CRT feel, very light) ---
    if (!mobile) {
      ctx.globalAlpha = 0.06; ctx.fillStyle = '#000';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 1;
    }
  }

  /* -------------------------------- loop --------------------------------- */
  function loop(now) { frame(now, false); raf = requestAnimationFrame(loop); }
  function start() { if (running || reduce.matches) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  window.addEventListener('resize', () => { clearTimeout(window.__bgR); window.__bgR = setTimeout(resize, 120); });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  if (reduce.addEventListener) reduce.addEventListener('change', () => { reduce.matches ? (stop(), frame(performance.now(), true)) : start(); });

  resize();
  if (reduce.matches) frame(performance.now(), true); else start();
})();
