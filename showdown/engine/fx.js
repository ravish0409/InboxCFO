// FX: drawn effects in the anime tradition. Flat shapes, hard edges, held for two or three frames.
// World-anchored effects take 3D points and go through PEN's camera; screen effects take pixels.
// Everything is seeded and a pure function of the time you pass in, so frames are repeatable.
(function () {
  const P = PEN, { W, H, add, sub, scl, norm, cross, clamp, mix } = PEN;
  const FX = (window.FX = {});
  const TAU = Math.PI * 2;
  const poly = (g, pts, fill, alpha = 1) => { if (pts.length < 3) return; g.save(); g.globalAlpha *= alpha; g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); g.restore(); };
  FX.poly = poly;

  // ---------- screen ----------
  FX.flash = (g, color, alpha = 1) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, W, H); g.restore(); };
  FX.invert = (g) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "difference"; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.restore(); };
  FX.tint = (g, color, mode = "multiply", alpha = 1) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = mode; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, W, H); g.restore(); };
  FX.bars = (g, k = 1, color = "#07051a") => { const h = H * 0.105 * k; if (h < 1) return; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = color; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h); g.restore(); };
  FX.vignette = (g, color = "#0a0530", alpha = 0.5) => { const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, color); g.save(); g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore(); };
  // wedges racing in from the frame edge toward a point: the "something is coming" lines
  FX.speedLines = function (g, o = {}) {
    const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, n = o.n || 46, Rn = P.rng((o.seed || 1) * 13 + 5), far = Math.hypot(W, H);
    g.save(); g.globalAlpha *= o.alpha ?? 1; g.fillStyle = o.color || "#fff";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Rn() * 0.12, wd = (0.004 + Rn() * 0.014) * (o.thick || 1), r0 = (o.inner ?? 0.36) * H * (0.75 + Rn() * 0.7);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a - wd) * far, cy + Math.sin(a - wd) * far); g.lineTo(cx + Math.cos(a + wd) * far, cy + Math.sin(a + wd) * far); g.closePath(); g.fill();
    }
    g.restore();
  };
  // parallel streaks across the frame: the background of a dash
  FX.streaks = function (g, o = {}) {
    const ang = o.angle || 0, n = o.n || 34, Rn = P.rng((o.seed || 1) * 7 + 2), dx = Math.cos(ang), dy = Math.sin(ang);
    g.save(); g.globalAlpha *= o.alpha ?? 1; g.fillStyle = o.color || "#fff"; g.translate(W / 2, H / 2); g.rotate(ang);
    for (let i = 0; i < n; i++) { const y = (Rn() - 0.5) * H * 1.5, x = (Rn() - 0.5) * W * 1.6, l = W * (0.15 + Rn() * 0.6), t = (1 + Rn() * 7) * (o.thick || 1); g.beginPath(); g.moveTo(x, y - t / 2); g.lineTo(x + l, y); g.lineTo(x, y + t / 2); g.closePath(); g.fill(); }
    g.restore();
  };
  // a hit spark: a spiky star with a hot core
  FX.burst = function (g, c, r, o = {}) {
    if (!c || r < 1) return;
    const n = o.spikes || 9, Rn = P.rng((o.seed || 1) * 31 + 7), rot = o.rot ?? Rn() * TAU;
    const star = (rad, inner, col) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? rad * inner : rad * (0.7 + 0.5 * P.hash(i * 3.3 + (o.seed || 1))); pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]); } poly(g, pts, col, o.alpha ?? 1); };
    if (o.edge !== false) star(r * 1.18, 0.3, o.edge || "#1d1b19");
    star(r, 0.26, o.color || "#fff"); star(r * 0.5, 0.45, o.core || "#ffe76b");
  };
  // three raking claw marks (or one cut) between two screen points
  FX.slash = function (g, a, b, o = {}) {
    const n = o.n || 3, gap = o.gap || 26, bulge = o.bulge ?? 0.22, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, u = clamp(o.u ?? 1);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * gap, top = [], bot = [], S = 14, wd = (o.w || 16) * (1 - Math.abs(k - (n - 1) / 2) * 0.18);
      for (let i = 0; i <= S; i++) { const s = (i / S) * u, bow = Math.sin(s * Math.PI) * bulge * L, th = Math.sin((i / S) * Math.PI) * wd; const x = a[0] + dx * s + nx * (off + bow), y = a[1] + dy * s + ny * (off + bow); top.push([x + nx * th * 0.5, y + ny * th * 0.5]); bot.push([x - nx * th * 0.5, y - ny * th * 0.5]); }
      const pts = top.concat(bot.reverse());
      if (o.edge) { g.save(); g.lineWidth = 5; g.strokeStyle = o.edge; g.lineJoin = "round"; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); g.restore(); }
      poly(g, pts, o.color || "#fff", o.alpha ?? 1);
    }
  };
  // light shafts fanning from a point
  FX.rays = function (g, c, o = {}) {
    const n = o.n || 9, Rn = P.rng((o.seed || 1) * 5 + 1), dir = o.dir ?? 0, spread = o.spread ?? 1.1, L = o.len || W * 1.4;
    g.save(); g.globalCompositeOperation = o.mode || "screen"; g.fillStyle = o.color || "#ffd98a";
    for (let i = 0; i < n; i++) { const a = dir + (i / (n - 1) - 0.5) * spread + (Rn() - 0.5) * 0.05, wd = 0.02 + Rn() * 0.05; g.globalAlpha = (o.alpha ?? 0.3) * (0.5 + Rn() * 0.7); g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(c[0] + Math.cos(a - wd) * L, c[1] + Math.sin(a - wd) * L); g.lineTo(c[0] + Math.cos(a + wd) * L, c[1] + Math.sin(a + wd) * L); g.closePath(); g.fill(); }
    g.restore();
  };
  // display lettering: heavy, condensed, slanted, with a hard offset shadow
  FX.text = function (g, str, x, y, size, o = {}) {
    g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); g.transform(1, 0, o.skew ?? -0.18, 1, 0, 0); if (o.scale) g.scale(o.scale, o.scale);
    g.font = `${o.weight || 900} ${size}px "Archivo"`; g.fontStretch = o.stretch || "extra-condensed"; g.letterSpacing = ((o.track ?? 0.01) * size).toFixed(1) + "px";
    g.textAlign = o.align || "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.globalAlpha *= o.alpha ?? 1;
    if (o.shadow !== false) { g.fillStyle = o.shadow || "#0b0630"; g.fillText(str, size * 0.05, size * 0.06); }
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = size * (o.strokeW || 0.09); g.strokeText(str, 0, 0); }
    g.fillStyle = o.color || "#fff"; g.fillText(str, 0, 0);
    g.restore();
  };

  // ---------- world ----------
  // a ribbon through where a point has just been: fists, feet, a cane tip, a whole body
  FX.trail = function (g, fn, t, dur, o = {}) {
    const n = o.n || 10, L = [], Rr = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = fn(t - dur * (1 - u)); if (!p) return;
      const q = P.project(p); if (!q) return;
      L.push({ q, w: P.pxAt(p, o.w || 0.08) * Math.pow(u, o.taper ?? 0.8) });
    }
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) { const a = L[Math.max(0, i - 1)].q, b = L[Math.min(n, i + 1)].q; let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; top.push([L[i].q[0] - ty * L[i].w, L[i].q[1] + tx * L[i].w]); bot.push([L[i].q[0] + ty * L[i].w, L[i].q[1] - tx * L[i].w]); }
    poly(g, top.concat(bot.reverse()), o.color || "#fff", o.alpha ?? 0.9);
  };
  // an expanding ring in the world (a shockwave on a roof, a landing)
  FX.ring = function (g, c, r, o = {}) {
    const outer = P.projectPoly(P.ring(c, r, o.axis || [0, 1, 0], 28)), inner = P.projectPoly(P.ring(c, r * (o.thin ?? 0.82), o.axis || [0, 1, 0], 28));
    if (!outer || !inner) return;
    g.save(); g.globalAlpha *= o.alpha ?? 1; g.fillStyle = o.color || "#fff"; g.beginPath();
    outer.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    inner.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    g.fill("evenodd"); g.restore();
  };
  // chunky dust: a few faceted puffs that swell, rise and thin out. age in seconds.
  FX.dust = function (g, c, age, o = {}) {
    const life = o.life || 0.7; if (age < 0 || age > life) return;
    const u = age / life, n = o.n || 7, Rn = P.rng((o.seed || 1) * 17 + 3), col = o.color || "#e9e4f7";
    for (let i = 0; i < n; i++) {
      const a = Rn() * TAU, d = (o.spread || 0.9) * (0.3 + Rn() * 0.7) * P.ease.out(u), r = (o.r || 0.32) * (0.5 + Rn() * 0.8) * (0.4 + 0.9 * P.ease.out(u)) * (1 - u * 0.35);
      const p = add(c, [Math.cos(a) * d + (o.push ? o.push[0] * u : 0), 0.1 + (0.25 + Rn() * 0.6) * u * (o.rise ?? 1), Math.sin(a) * d * 0.7 + (o.push ? o.push[2] * u : 0)]);
      const q = P.project(p); if (!q) continue;
      const rp = P.pxAt(p, r), k = 7, pts = [], rot = Rn() * TAU;
      for (let j = 0; j < k; j++) { const t = rot + (j / k) * TAU; pts.push([q[0] + Math.cos(t) * rp * (0.8 + 0.4 * P.hash(i * 7 + j)), q[1] + Math.sin(t) * rp * 0.72 * (0.8 + 0.4 * P.hash(i * 3 + j * 5))]); }
      poly(g, pts, col, (o.alpha ?? 0.85) * (1 - Math.pow(u, 1.6)));
      if (rp > 14) poly(g, pts.map((p2) => [q[0] + (p2[0] - q[0]) * 0.55 - rp * 0.14, q[1] + (p2[1] - q[1]) * 0.55 - rp * 0.16]), o.hi || "#ffffff", 0.55 * (1 - u));
    }
  };
  // tumbling chunks on ballistic paths (bricks, tiles). Returns nothing; draw it depth-sorted with the cast.
  FX.debris = function (g, c, age, o = {}) {
    if (age < 0) return;
    const n = o.n || 14, Rn = P.rng((o.seed || 1) * 23 + 9), cols = o.colors || ["#e0623c", "#c44f2e", "#f08a55"], gy = o.ground ?? 0;
    for (let i = 0; i < n; i++) {
      const a = (o.dir ?? 0) + (Rn() - 0.5) * (o.cone ?? 2.2), sp = (o.speed || 6) * (0.4 + Rn()), vy = 2.5 + Rn() * 5, s = (o.size || 0.2) * (0.5 + Rn());
      const t = age, x = c[0] + Math.cos(a) * sp * t, z = c[2] + Math.sin(a) * sp * t * 0.6, y = Math.max(gy + s * 0.5, c[1] + (Rn() - 0.3) * 1.2 + vy * t - 7 * t * t);
      const rot = Rn() * TAU + t * (4 + Rn() * 9) * (y > gy + s * 0.6 ? 1 : 0.05), q = P.project([x, y, z]); if (!q) continue;
      const rp = P.pxAt([x, y, z], s), pts = [];
      for (let j = 0; j < 4; j++) { const tt = rot + (j / 4) * TAU + (j % 2) * 0.35; pts.push([q[0] + Math.cos(tt) * rp, q[1] + Math.sin(tt) * rp * 0.75]); }
      poly(g, pts, cols[i % cols.length]);
      g.save(); g.strokeStyle = "#1d1b19"; g.lineWidth = Math.max(1, rp * 0.09); g.lineJoin = "round"; g.beginPath(); pts.forEach((p2, j) => (j ? g.lineTo(p2[0], p2[1]) : g.moveTo(p2[0], p2[1]))); g.closePath(); g.stroke(); g.restore();
    }
  };
  // one bat: a body and two wings that beat
  FX.bat = function (g, p, size, ph, color = "#140a2e", heading = 0) {
    const q = P.project(p); if (!q) return;
    const s = P.pxAt(p, size); if (s < 0.8) return;
    if (s < 3) { g.fillStyle = color; g.fillRect(q[0] - s, q[1] - s * 0.5, s * 2, s); return; }
    const f = Math.sin(ph), c = Math.cos(heading), sn = Math.sin(heading);
    const T2 = (x, y) => [q[0] + (x * c - y * sn) * s, q[1] + (x * sn + y * c) * s];
    const wing = (k) => [T2(0, -0.1), T2(0.55 * k, -0.25 - f * 0.55), T2(1.25 * k, -0.05 - f * 0.9), T2(0.95 * k, 0.12 - f * 0.45), T2(0.7 * k, 0.02 - f * 0.3), T2(0.5 * k, 0.24 - f * 0.12), T2(0.28 * k, 0.1), T2(0, 0.26)];
    poly(g, wing(1), color); poly(g, wing(-1), color);
    poly(g, [T2(-0.13, -0.3), T2(-0.07, -0.16), T2(0.07, -0.16), T2(0.13, -0.3), T2(0.11, 0.1), T2(0, 0.3), T2(-0.11, 0.1)], color);
  };
  // a swarm: n bats flowing along path(u, i) -> 3D point, each with its own wobble. u01 advances them.
  FX.swarm = function (g, n, t, pathFn, o = {}) {
    const Rn = P.rng((o.seed || 1) * 41 + 11), list = [];
    for (let i = 0; i < n; i++) {
      const off = Rn(), sp = 0.6 + Rn() * 0.8, sz = (o.size || 0.3) * (0.6 + Rn() * 0.9), jx = Rn() - 0.5, jy = Rn() - 0.5, jz = Rn() - 0.5, ph0 = Rn() * TAU;
      const p = pathFn(off, sp, i, [jx, jy, jz]); if (!p) continue;
      const wob = o.wobble ?? 0.5;
      list.push({ p: add(p, [Math.sin(t * 3.1 + ph0) * wob * jx * 2, Math.cos(t * 2.6 + ph0) * wob * 0.6, Math.sin(t * 2.2 + ph0 * 2) * wob * jz * 2]), sz, ph: t * (16 + sp * 8) + ph0, hd: (jx + jy) * 0.6 });
    }
    list.sort((a, b) => P.depth(b.p) - P.depth(a.p));
    for (const b of list) FX.bat(g, b.p, b.sz, b.ph, o.color, b.hd);
  };
  // embers / ash rising from a point
  FX.embers = function (g, c, age, o = {}) {
    if (age < 0) return;
    const n = o.n || 40, Rn = P.rng((o.seed || 1) * 29 + 1), cols = o.colors || ["#ffd166", "#ff8a3d", "#2a1b3d"];
    for (let i = 0; i < n; i++) {
      const born = Rn() * (o.window || 0.8), life = 0.6 + Rn() * 0.9, a = age - born; if (a < 0 || a > life) { Rn(); Rn(); Rn(); Rn(); continue; }
      const u = a / life, ang = Rn() * TAU, rad = Rn() * (o.r || 0.4), hgt = Rn() * (o.h || 1.6), drift = Rn();
      const p = add(c, [Math.cos(ang) * rad + (o.wind || 0) * a * (0.5 + drift), hgt + a * (0.8 + drift * 1.4), Math.sin(ang) * rad]);
      const q = P.project(p); if (!q) continue;
      const s = Math.max(1.5, P.pxAt(p, (o.size || 0.05) * (1 - u * 0.6)));
      g.save(); g.globalAlpha = 1 - u * u; g.fillStyle = cols[i % cols.length]; g.translate(q[0], q[1]); g.rotate(ang + a * 5); g.fillRect(-s, -s * 0.6, s * 2, s * 1.2); g.restore();
    }
  };
})();
