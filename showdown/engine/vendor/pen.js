// Pen-and-ink drawing with a real 3D camera.
// Sets and figures are simple 3D geometry; every frame they are projected through the camera
// and drawn as hand-wobbly ink lines on cream paper, with hatching, blue-pencil perspective guides
// and one colour: a gold watercolour wash.
(function () {
  const W = (window.PEN_SIZE || [1080, 1920])[0], H = (window.PEN_SIZE || [1080, 1920])[1]; // the reel is 1080x1920; the model sheet asks for a wider canvas
  const PEN = (window.PEN = { W, H });
  const INK = (PEN.INK = "#1c1915");
  PEN.BLUE = "rgba(70,125,205,";
  PEN.GOLD = "#e0a526";
  PEN.GOLD_DK = "#b27a10";
  // the look: "fine" = thin clean fine-liner on near-white (grease-pencil reference); "ink" = the first hatched pen look
  const ST = (PEN.STYLE = (new URLSearchParams(location.search).get("style") || "fine") === "ink"
    ? { name: "ink", wMul: 1, wob: 1, double: true, hatchMul: 1, guideMul: 1, paperNoise: 10, vignette: 0.22, paper: "#f3ead7" }
    : { name: "fine", wMul: 0.6, wob: 0.45, double: false, hatchMul: 0.3, guideMul: 0, paperNoise: 3, vignette: 0.05, paper: "#fbf8f3" });
  PEN.PAPER = ST.paper;

  // ---------- small math ----------
  const clamp = (PEN.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)));
  const mix = (PEN.mix = (a, b, u) => a + (b - a) * u);
  const sat = (PEN.sat = (t, s, d) => clamp((t - s) / d));
  PEN.ease = {
    io: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
    out: (u) => 1 - Math.pow(1 - u, 3),
    in: (u) => u * u * u,
    sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
    back: (u) => { const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => scl(a, 1 / (len(a) || 1));
  const lerp3 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  Object.assign(PEN, { add, sub, scl, dot, cross, len, norm, lerp3 });

  // seeded noise
  const hash = (PEN.hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); });
  const vnoise = (PEN.vnoise = (x, s = 0) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return mix(hash(i + s * 57.31), hash(i + 1 + s * 57.31), u) * 2 - 1;
  });
  PEN.rng = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

  // the "boil": lines are redrawn 12 times a second, as hand-drawn animation is
  PEN.boil = 0;
  PEN.setTime = (t) => { PEN.t = t; PEN.boil = Math.floor(t * 12); };


  // ---------- colour, light and air ----------
  const hex = (h) => { if (Array.isArray(h)) return h; if (!h || h[0] !== "#") return null; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const mixc = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  Object.assign(PEN, { hex, css, mixc });
  // the direction sunlight travels: from high behind-left of most cameras
  PEN.SUN = norm([-0.38, -0.62, 0.69]);
  // environments: sky top -> horizon, ground near -> far, haze colour and distance
  PEN.ENVS = {
    valley: { sky: ["#bcd6e6", "#eef1ea"], ground: ["#d8d6b4", "#e7e6d2"], haze: "#e9ede8", hazeZ: 420 },
    town: { sky: ["#c4d9e6", "#f2eee4"], ground: ["#e1cfae", "#ece2cc"], haze: "#efeae0", hazeZ: 260 },
    canyon: { sky: ["#c9dbe5", "#f3eadc"], ground: ["#e6cfaa", "#efe0c6"], haze: "#f1e8da", hazeZ: 300 },
    desert: { sky: ["#bed6e8", "#f4ecdc"], ground: ["#e9d6b2", "#f2e6cf"], haze: "#f3ead9", hazeZ: 900 },
    river: { sky: ["#c4dbe8", "#eef2f0"], ground: ["#c9dde6", "#dfeaee"], haze: "#e6eef0", hazeZ: 60 },
    interior: { sky: ["#dcc49c", "#e9d6b4"], ground: ["#c39f70", "#d6b88c"], haze: "#e6d3b2", hazeZ: 200 },
    office: { sky: ["#dde3e6", "#eef0ec"], ground: ["#b4b9bd", "#cdd1d3"], haze: "#e9ecea", hazeZ: 200 },
    city: { sky: ["#bed4e3", "#eef0ec"], ground: ["#c6c4bf", "#dcd9d2"], haze: "#e6eaeb", hazeZ: 600 },
  };
  PEN.env = null;
  PEN.setEnv = (name) => { PEN.env = name ? PEN.ENVS[name] : null; };
  // a surface colour lit by the sun (n = the face's outward normal), then faded into the haze with distance
  PEN.lit = (color, n, z = 0, o = {}) => {
    let c = hex(color); if (!c) return color;
    if (n) { const k = clamp(-dot(n, PEN.SUN)), amb = o.amb ?? 0.78; c = c.map((v) => v * (amb + (1 - amb) * k) + (o.warm ? (1 - k) * -4 : 0)); }
    const E = PEN.env;
    if (E && z > 0 && o.haze !== false) c = mixc(c, hex(E.haze), clamp(z / E.hazeZ) * 0.85);
    return css(c);
  };
  PEN.hazeOnly = (color, z) => PEN.lit(color, null, z);
  // sky and ground, drawn as soon as a shot sets its camera
  PEN.backdrop = function (g) {
    const E = PEN.env; if (!E) return;
    const f = C.f, fh = norm([f[0], 0, f[2]].map((v, i) => (Math.abs(f[0]) + Math.abs(f[2]) < 1e-3 && i === 2 ? 1 : v)));
    const side = norm(cross(fh, [0, 1, 0]));
    const h1 = PEN.vanish(norm(add(fh, scl(side, 0.7)))), h2 = PEN.vanish(norm(add(fh, scl(side, -0.7))));
    g.save();
    // the whole frame starts as sky
    let gr;
    if (h1 && h2) {
      const mx = (h1[0] + h2[0]) / 2, my = (h1[1] + h2[1]) / 2, dx = h2[0] - h1[0], dy = h2[1] - h1[1], L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L; // towards the ground side
      const below = PEN.project(add(C.pos, add(scl(fh, 50), [0, -40, 0])));
      if (below && (below[0] - mx) * nx + (below[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
      gr = g.createLinearGradient(mx - nx * 1500, my - ny * 1500, mx, my);
      gr.addColorStop(0, E.sky[0]); gr.addColorStop(1, E.sky[1]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const gp = PEN.projectPoly([[C.pos[0] - 3000, 0, C.pos[2] - 3000], [C.pos[0] + 3000, 0, C.pos[2] - 3000], [C.pos[0] + 3000, 0, C.pos[2] + 3000], [C.pos[0] - 3000, 0, C.pos[2] + 3000]]);
      if (gp && C.pos[1] > 0) {
        const g2 = g.createLinearGradient(mx, my, mx + nx * 1400, my + ny * 1400);
        g2.addColorStop(0, E.ground[1]); g2.addColorStop(1, E.ground[0]);
        g.fillStyle = g2; g.fill(PEN.path(clipPolyRect(gp)));
      }
    } else {
      // looking straight down: all ground
      g.fillStyle = E.ground[0]; g.fillRect(0, 0, W, H);
    }
    g.restore();
    g.save(); g.globalAlpha = 0.35; g.drawImage(PEN.paperTex || PEN.makePaper(), 0, 0); g.restore();
  };

  // ---------- camera ----------
  let C = null;
  PEN.camera = function (pos, look, fov = 50, roll = 0, up = [0, 1, 0]) {
    const f = norm(sub(look, pos));
    let upv = Math.abs(dot(f, norm(up))) > 0.995 ? [0, 0, 1] : up;
    let r = norm(cross(f, upv));
    let u = cross(r, f);
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      const r2 = add(scl(r, c), scl(u, s)), u2 = add(scl(u, c), scl(r, -s));
      r = r2; u = u2;
    }
    const foc = H / 2 / Math.tan((fov * Math.PI) / 360);
    C = { pos, f, r, u, foc, near: 0.08, shakeX: 0, shakeY: 0 };
    PEN.cam = C;
    if (PEN.pendingBackdrop && PEN.__g) { PEN.pendingBackdrop = false; PEN.backdrop(PEN.__g); }
    return C;
  };
  PEN.shake = (amp, t, seed = 1) => {
    if (!C || amp <= 0) return;
    C.shakeX = vnoise(t * 24, seed) * amp;
    C.shakeY = vnoise(t * 24, seed + 9) * amp;
  };
  const toCam = (PEN.toCam = (p) => { const d = sub(p, C.pos); return [dot(d, C.r), dot(d, C.u), dot(d, C.f)]; });
  const camToScreen = (q) => [W / 2 + (q[0] * C.foc) / q[2] + C.shakeX, H / 2 - (q[1] * C.foc) / q[2] + C.shakeY, q[2]];
  PEN.project = (p) => { const q = toCam(p); if (q[2] < C.near) return null; return camToScreen(q); };
  PEN.depth = (p) => toCam(p)[2];
  // a direction (point at infinity) -> where its vanishing point sits on screen
  PEN.vanish = (d) => { const q = [dot(d, C.r), dot(d, C.u), dot(d, C.f)]; if (q[2] <= 1e-4) return null; return camToScreen(q); };
  // screen size of a length L at point p
  PEN.pxAt = (p, L) => { const z = toCam(p)[2]; return z > C.near ? (L * C.foc) / z : 0; };

  // project a 3D polyline into visible screen runs (near-plane clipped)
  PEN.projectLine = function (pts, closed = false) {
    const q = pts.map(toCam);
    if (closed) q.push(q[0]);
    const runs = [];
    let cur = null;
    for (let i = 0; i < q.length - 1; i++) {
      let a = q[i], b = q[i + 1];
      const ina = a[2] >= C.near, inb = b[2] >= C.near;
      if (!ina && !inb) { cur = null; continue; }
      if (!ina) { const u = (C.near - a[2]) / (b[2] - a[2]); a = [mix(a[0], b[0], u), mix(a[1], b[1], u), C.near]; cur = null; }
      let bb = b;
      if (!inb) { const u = (C.near - a[2]) / (b[2] - a[2]); bb = [mix(a[0], b[0], u), mix(a[1], b[1], u), C.near]; }
      if (!cur) { cur = [camToScreen(a)]; runs.push(cur); }
      cur.push(camToScreen(bb));
      if (!inb) cur = null;
    }
    return runs;
  };
  // clip a 3D polygon against the near plane and project it
  PEN.projectPoly = function (pts) {
    const q = pts.map(toCam), out = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const ina = a[2] >= C.near, inb = b[2] >= C.near;
      if (ina) out.push(a);
      if (ina !== inb) { const u = (C.near - a[2]) / (b[2] - a[2]); out.push([mix(a[0], b[0], u), mix(a[1], b[1], u), C.near]); }
    }
    return out.length >= 3 ? out.map(camToScreen) : null;
  };

  // ---------- 2D helpers ----------
  function resample(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 1; k <= n; k++) out.push([mix(a[0], b[0], k / n), mix(a[1], b[1], k / n)]);
    }
    return out;
  }
  PEN.resample = resample;
  const offscreen = (pts) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return x1 < -200 || x0 > W + 200 || y1 < -200 || y0 > H + 200; };


  // ---------- keep everything near the screen (huge coordinates make the GPU canvas drop the frame) ----------
  const BX0 = -500, BY0 = -500, BX1 = W + 500, BY1 = H + 500;
  function clipPolyRect(pts) {
    let out = pts;
    const edges = [[(p) => p[0] >= BX0, (a, b) => { const u = (BX0 - a[0]) / (b[0] - a[0]); return [BX0, a[1] + (b[1] - a[1]) * u]; }],
      [(p) => p[0] <= BX1, (a, b) => { const u = (BX1 - a[0]) / (b[0] - a[0]); return [BX1, a[1] + (b[1] - a[1]) * u]; }],
      [(p) => p[1] >= BY0, (a, b) => { const u = (BY0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * u, BY0]; }],
      [(p) => p[1] <= BY1, (a, b) => { const u = (BY1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * u, BY1]; }]];
    for (const [inside, cut] of edges) {
      if (out.length < 3) return [];
      const src = out; out = [];
      for (let i = 0; i < src.length; i++) {
        const a = src[i], b = src[(i + 1) % src.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) out.push(cut(a, b));
      }
    }
    return out;
  }
  function clipLineRect(pts) {
    const runs = []; let cur = null;
    for (let i = 0; i < pts.length - 1; i++) {
      let a = pts[i], b = pts[i + 1], t0 = 0, t1 = 1;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const P_ = [-dx, dx, -dy, dy], Q = [a[0] - BX0, BX1 - a[0], a[1] - BY0, BY1 - a[1]];
      let ok = true;
      for (let k = 0; k < 4; k++) {
        if (P_[k] === 0) { if (Q[k] < 0) { ok = false; break; } continue; }
        const r = Q[k] / P_[k];
        if (P_[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
      if (!ok) { cur = null; continue; }
      const A = [a[0] + dx * t0, a[1] + dy * t0], B = [a[0] + dx * t1, a[1] + dy * t1];
      if (!cur || t0 > 0) { cur = [A]; runs.push(cur); }
      cur.push(B);
      if (t1 < 1) cur = null;
    }
    return runs;
  }
  const inRect = (pts) => pts.every((p) => p[0] >= BX0 && p[0] <= BX1 && p[1] >= BY0 && p[1] <= BY1);
  PEN.clipPolyRect = clipPolyRect; PEN.clipLineRect = clipLineRect;

  // One ink line in screen space: a ribbon of varying width with a slow hand wobble,
  // a fast boil, a little overshoot at the ends and a faint second pass.
  PEN.ink = function (g, pts, o = {}) {
    if (!pts || pts.length < 2 || offscreen(pts)) return;
    if (!o._clipped && !inRect(pts)) { for (const r of clipLineRect(pts)) if (r.length >= 2) PEN.ink(g, r, Object.assign({}, o, { closed: false, _clipped: true })); return; }
    const w = (o.w ?? 2.6) * (ST.inFigure ? 1 : ST.wMul), seed = o.seed ?? 0, wob = o.wob ?? ST.wob, color = o.color || INK, alpha = o.alpha ?? 1;
    let P = resample(pts, o.step || 10);
    // total length
    let L = 0; const acc = [0];
    for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); acc.push(L); }
    if (L < 0.8) return;
    const over = o.over ?? Math.min(9, L * 0.05);
    if (over > 0 && !o.closed) {
      const a = P[0], b = P[1], dA = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const y = P[P.length - 1], x = P[P.length - 2], dB = Math.hypot(y[0] - x[0], y[1] - x[1]) || 1;
      P = [[a[0] - ((b[0] - a[0]) / dA) * over * hash(seed + 1), a[1] - ((b[1] - a[1]) / dA) * over * hash(seed + 1)], ...P,
        [y[0] + ((y[0] - x[0]) / dB) * over * hash(seed + 2), y[1] + ((y[1] - x[1]) / dB) * over * hash(seed + 2)]];
      acc.unshift(-over); acc.push(L + over);
    }
    const b = PEN.boil, n = P.length, left = [], right = [];
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[Math.min(n - 1, i + 1)], r = P[Math.max(0, i - 1)];
      let tx = q[0] - r[0], ty = q[1] - r[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx, s = acc[i] || 0;
      const off = wob * (vnoise(s / 140, seed) * 1.6 + vnoise(s / 22 + b * 3.1, seed + b * 7.7) * 0.75);
      const u = n > 1 ? i / (n - 1) : 0;
      const taper = o.closed ? 1 : Math.min(1, 0.25 + Math.min(u, 1 - u) * 7);
      const ww = (w * taper * (0.82 + 0.36 * hash(seed * 3.3 + Math.floor(s / 30) + b * 0.37))) / 2;
      const cx = p[0] + nx * off, cy = p[1] + ny * off;
      left.push([cx + nx * ww, cy + ny * ww]);
      right.push([cx - nx * ww, cy - ny * ww]);
    }
    g.save();
    g.globalAlpha *= alpha;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(left[i][0], left[i][1]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath();
    g.fill();
    if ((o.double ?? ST.double) && w > 1.4) {
      // a faint second stroke, as when a pen goes over a line twice
      g.globalAlpha *= 0.32;
      g.lineWidth = Math.max(0.7, w * 0.4);
      g.strokeStyle = color;
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const s = acc[i] || 0, d = vnoise(s / 60 + 40, seed + 3 + b * 1.3) * 2.2;
        const x = (left[i][0] + right[i][0]) / 2 + d, y = (left[i][1] + right[i][1]) / 2 - d * 0.6;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  };

  // a path for filling / clipping, slightly wobbly so fills and lines don't line up exactly
  PEN.path = function (pts, jit = 0, seed = 0) {
    const p = new Path2D();
    pts.forEach((q, i) => {
      const dx = jit ? vnoise(i * 0.7 + PEN.boil * 0.9, seed) * jit : 0, dy = jit ? vnoise(i * 0.7 + 50 + PEN.boil * 0.9, seed) * jit : 0;
      i ? p.lineTo(q[0] + dx, q[1] + dy) : p.moveTo(q[0] + dx, q[1] + dy);
    });
    p.closePath();
    return p;
  };
  PEN.fill = (g, pts, color = PEN.PAPER, alpha = 1) => {
    if (!pts || pts.length < 3) return;
    if (!inRect(pts)) pts = clipPolyRect(pts);
    if (pts.length < 3) return;
    g.save(); g.globalAlpha *= alpha; g.fillStyle = color; g.fill(PEN.path(pts)); g.restore();
  };

  // Parallel hatching inside a screen polygon. gap in px; angle in radians (screen); cross adds a second set.
  PEN.hatch = function (g, pts, o = {}) {
    if (!pts || pts.length < 3 || offscreen(pts)) return;
    if (!inRect(pts)) pts = clipPolyRect(pts);
    if (pts.length < 3) return;
    const gap = Math.max(2.2, o.gap ?? 9), ang = o.angle ?? -0.9, seed = o.seed ?? 0, w = (o.w ?? 1.25) * (ST.inFigure ? 1 : Math.max(0.75, ST.wMul)), alpha = (o.alpha ?? 0.85) * (ST.inFigure ? 1 : ST.hatchMul);
    if (alpha < 0.02) return;
    g.save();
    g.clip(PEN.path(pts));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(x0, -50); y0 = Math.max(y0, -50); x1 = Math.min(x1, W + 50); y1 = Math.min(y1, H + 50);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
    const sets = o.cross ? [ang, ang + (o.crossAngle ?? 1.25)] : [ang];
    g.strokeStyle = o.color || INK;
    g.lineCap = "round";
    const b = PEN.boil;
    sets.forEach((a, si) => {
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      const N = Math.ceil((2 * R) / gap);
      g.globalAlpha = alpha * (si ? 0.8 : 1);
      g.lineWidth = w;
      g.beginPath();
      for (let k = 0; k <= N; k++) {
        const off = -R + k * gap + vnoise(k * 0.9 + b * 0.5, seed + si * 11) * gap * 0.22;
        const sx = cx + nx * off, sy = cy + ny * off;
        const e0 = R * (0.9 + 0.2 * hash(k + seed + b * 0.1)), e1 = R * (0.9 + 0.2 * hash(k * 1.7 + seed));
        const tilt = vnoise(k * 1.3 + b * 0.4, seed + 5) * 0.03;
        g.moveTo(sx - (dx + tilt) * e0, sy - (dy - tilt) * e0);
        g.lineTo(sx + (dx - tilt) * e1, sy + (dy + tilt) * e1);
      }
      g.stroke();
    });
    g.restore();
  };

  // Gold watercolour: layered translucent fills with ragged edges and a darker rim.
  PEN.wash = function (g, pts, o = {}) {
    if (!pts || pts.length < 3 || offscreen(pts)) return;
    if (!inRect(pts)) pts = clipPolyRect(pts);
    if (pts.length < 3) return;
    const color = o.color || PEN.GOLD, seed = o.seed ?? 0, alpha = o.alpha ?? 1;
    let cx = 0, cy = 0; pts.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
    const sh = o.offset ?? 3; // the wash never sits exactly inside the lines
    g.save();
    g.globalAlpha = alpha;
    for (let l = 0; l < 3; l++) {
      const ox = vnoise(l * 3.1, seed) * sh, oy = vnoise(l * 3.1 + 9, seed) * sh, k = 1 - l * 0.05;
      const q = pts.map((p) => [cx + (p[0] - cx) * k + ox, cy + (p[1] - cy) * k + oy]);
      g.globalAlpha = alpha * (l ? 0.33 : 0.55);
      g.fillStyle = color;
      g.fill(PEN.path(q, 2.2, seed + l));
    }
    g.globalAlpha = alpha * 0.45;
    g.strokeStyle = o.rim || PEN.GOLD_DK;
    g.lineWidth = 2;
    g.stroke(PEN.path(pts.map((p) => [p[0] + vnoise(1, seed) * sh, p[1] + vnoise(2, seed) * sh]), 1.5, seed + 9));
    g.restore();
  };

  // ---------- 3D drawing ----------
  // ink width that falls off with distance (refZ = where o.w is the true width)
  const wAt = (z, o) => (o.wpx != null ? o.wpx : clamp((o.w ?? 2.6) * ((o.refZ ?? 6) / Math.max(0.1, z)), o.wmin ?? 0.55, o.wmax ?? 6));
  PEN.line3 = function (g, pts, o = {}) {
    const runs = PEN.projectLine(pts, o.closed);
    for (const r of runs) {
      if (r.length < 2) continue;
      const z = r.reduce((a, p) => a + p[2], 0) / r.length;
      PEN.ink(g, r, Object.assign({}, o, { w: wAt(z, o), closed: false, alpha: (o.alpha ?? 1) * fog(z, o) }));
    }
  };
  // distant lines fade, like a lighter hand
  const fog = (z, o) => (o.fog === false ? 1 : clamp(1.15 - z / (o.fogZ ?? 400), 0.28, 1));
  PEN.fog = fog;
  // a filled 3D face: paper (to hide what's behind), optional hatch / wash, ink outline
  PEN.face3 = function (g, pts, o = {}) {
    const s = PEN.projectPoly(pts);
    if (!s) return null;
    const z = s.reduce((a, p) => a + p[2], 0) / s.length;
    let fillC = o.fill || PEN.PAPER;
    if (o.lit && o.fill) { const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))); fillC = PEN.lit(o.fill, o.n || n, z, o); }
    if (o.fill !== false) PEN.fill(g, s, fillC);
    if (o.wash) PEN.wash(g, s, Object.assign({ seed: o.seed }, o.wash === true ? {} : o.wash));
    if (o.hatch) PEN.hatch(g, s, Object.assign({ seed: o.seed, alpha: 0.85 * fog(z, o) }, o.hatch, { gap: (o.hatch.gap ?? 8) * (o.hatch.fixed ? 1 : clamp(Math.sqrt((o.refZ ?? 6) / z), 0.45, 1.6)) }));
    if (o.stroke !== false) {
      if ((o.sketch ?? ST.name === "fine") && s.length <= 8) {
        // like a hand-drawn box: every edge its own stroke, running a little past the corners
        for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue; PEN.ink(g, [a, b], Object.assign({}, o, { w: wAt(z, o), closed: false, alpha: (o.alpha ?? 1) * fog(z, o), over: Math.min(10, L * 0.07), seed: (o.seed || 1) * 7 + i, wob: 0.8 })); }
      } else PEN.ink(g, s.concat([s[0]]), Object.assign({}, o, { w: wAt(z, o), closed: true, alpha: (o.alpha ?? 1) * fog(z, o), over: 0 }));
    }
    return s;
  };
  // ring of points (circle) in 3D: centre, radius, axis normal
  PEN.ring = function (c, r, n = [0, 1, 0], k = 20, rz = null) {
    const nn = norm(n);
    let a = Math.abs(nn[1]) < 0.9 ? norm(cross(nn, [0, 1, 0])) : norm(cross(nn, [1, 0, 0]));
    const b = cross(nn, a), out = [];
    for (let i = 0; i < k; i++) {
      const t = (i / k) * Math.PI * 2;
      out.push(add(c, add(scl(a, Math.cos(t) * r), scl(b, Math.sin(t) * (rz ?? r)))));
    }
    return out;
  };
  // convex hull of 2D points (for silhouettes of volumes)
  PEN.hull = function (pts) {
    const p = pts.filter(Boolean).map((q) => [q[0], q[1], q[2]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  // a solid drawn as the hull of its projected points (paper fill + outline)
  PEN.solid = function (g, pts3, o = {}) {
    const s = pts3.map((p) => PEN.project(p)).filter(Boolean);
    if (s.length < 3) return null;
    const h = PEN.hull(s);
    const z = s.reduce((a, p) => a + p[2], 0) / s.length;
    if (o.fill !== false) PEN.fill(g, h, o.fill || PEN.PAPER);
    if (o.wash) PEN.wash(g, h, Object.assign({ seed: o.seed }, o.wash === true ? {} : o.wash));
    if (o.hatch) PEN.hatch(g, h, Object.assign({ seed: o.seed }, o.hatch, { gap: (o.hatch.gap ?? 8) * clamp(Math.sqrt((o.refZ ?? 6) / z), 0.45, 1.6) }));
    if (o.stroke !== false) PEN.ink(g, h.concat([h[0]]), Object.assign({}, o, { w: wAt(z, o), closed: true, over: 0, alpha: (o.alpha ?? 1) * fog(z, o) }));
    return h;
  };

  // ---------- blue-pencil construction ----------
  // a light blue line, thin and even, that runs long past the drawing
  PEN.guide = function (g, a, b, o = {}) {
    if (!ST.guideMul) return;
    const runs = PEN.projectLine([a, b]);
    for (const r of runs) {
      if (r.length < 2) continue;
      g.save();
      g.strokeStyle = PEN.BLUE + (o.alpha ?? 0.32) + ")";
      g.lineWidth = o.w ?? 1.6;
      g.lineCap = "round";
      g.beginPath();
      const P = resample(r, 40);
      P.forEach((p, i) => { const d = vnoise(i * 0.4, (o.seed ?? 0) + PEN.boil * 0.3) * 1.1; i ? g.lineTo(p[0] + d, p[1] - d) : g.moveTo(p[0] + d, p[1] - d); });
      g.stroke();
      g.restore();
    }
  };
  PEN.guide2 = function (g, a, b, o = {}) {
    if (!ST.guideMul) return;
    g.save();
    g.strokeStyle = PEN.BLUE + (o.alpha ?? 0.32) + ")";
    g.lineWidth = o.w ?? 1.6;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.restore();
  };
  // the horizon line, and an x on the vanishing points of the given ground directions
  PEN.horizon = function (g, dirs = [[0, 0, 1]], o = {}) {
    if (!ST.guideMul) return;
    const A = PEN.vanish([1, 0, 0.0001]) || PEN.vanish([-1, 0, 0.0001]);
    const p1 = PEN.vanish(norm([1, 0, 1])), p2 = PEN.vanish(norm([-1, 0, 1]));
    const h1 = PEN.vanish(norm(add(C.f.map((v, i) => (i === 1 ? 0 : v)), [0.6, 0, 0]))), h2 = PEN.vanish(norm(add(C.f.map((v, i) => (i === 1 ? 0 : v)), [-0.6, 0, 0])));
    if (h1 && h2) {
      const dx = h2[0] - h1[0], dy = h2[1] - h1[1], k = 3000 / (Math.hypot(dx, dy) || 1);
      PEN.guide2(g, [h1[0] - dx * k, h1[1] - dy * k], [h1[0] + dx * k, h1[1] + dy * k], { alpha: o.alpha ?? 0.38, w: 1.8 });
    }
    for (const d of dirs) {
      const v = PEN.vanish(norm(d));
      if (!v || v[0] < -300 || v[0] > W + 300 || v[1] < -300 || v[1] > H + 300) continue;
      g.save();
      g.strokeStyle = PEN.BLUE + "0.55)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(v[0] - 12, v[1] - 12); g.lineTo(v[0] + 12, v[1] + 12);
      g.moveTo(v[0] + 12, v[1] - 12); g.lineTo(v[0] - 12, v[1] + 12);
      g.stroke();
      g.restore();
    }
  };
  // a perspective grid on the ground plane (y = h), running to the vanishing point
  PEN.grid = function (g, o = {}) {
    const x0 = o.x0 ?? -60, x1 = o.x1 ?? 60, z0 = o.z0 ?? -10, z1 = o.z1 ?? 600, step = o.step ?? 6, h = o.y ?? 0;
    for (let x = x0; x <= x1; x += step) PEN.guide(g, [x, h, z0], [x, h, z1], { alpha: o.alpha ?? 0.2, w: 1.2, seed: x });
    if (o.cross !== false) for (let z = Math.max(z0, 0); z <= Math.min(z1, o.zc ?? 120); z += step * (o.zk ?? 2)) PEN.guide(g, [x0, h, z], [x1, h, z], { alpha: (o.alpha ?? 0.2) * 0.8, w: 1.1, seed: z + 3 });
  };

  // ---------- paper ----------
  PEN.makePaper = function () {
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const x = c.getContext("2d");
    x.fillStyle = PEN.PAPER;
    x.fillRect(0, 0, W, H);
    const img = x.getImageData(0, 0, W, H), d = img.data, R = PEN.rng(7);
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % W, py = Math.floor(i / 4 / W);
      const k = ST.paperNoise / 10, n = ((R() - 0.5) * 10 + vnoise(px / 90 + py / 300, 3) * 4 + vnoise(py / 70, 8) * 2) * k;
      d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
    }
    x.putImageData(img, 0, 0);
    // fibres
    x.strokeStyle = "rgba(120,100,70," + (0.06 * ST.paperNoise / 10).toFixed(3) + ")";
    for (let i = 0; i < 260; i++) {
      const sx = R() * W, sy = R() * H, a = R() * 6.28, l = 6 + R() * 18;
      x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * l * 0.5 + 3, sy + Math.sin(a) * l * 0.5, sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
    }
    // soft darker edges, like a page under a lamp
    const gr = x.createRadialGradient(W / 2, H * 0.46, H * 0.25, W / 2, H / 2, H * 0.75);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(70,50,20," + ST.vignette + ")");
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
    return c;
  };
})();
