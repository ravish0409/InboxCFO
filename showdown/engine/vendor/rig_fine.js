// [showdown] vendored from penline-studio with small action patches, each marked [showdown].
// penline-studio figure renderer (from the Ledger Tales gold-rush reel, Nov 2026).
// The fine-liner look (after a grease-pencil reference Rav liked): thin clean outlines on near-white,
// almost no shading, coloured pen lines for clothes, big heads, scribbled hair, sleepy half-lidded eyes.
// Overrides RIG.draw; the first ink look stays as RIG.drawInk.
(function () {
  const P = PEN, R = RIG, { add, sub, scl, dot, cross, norm, clamp, mix } = PEN;
  const cos = Math.cos, sin = Math.sin;
  R.drawInk = R.draw;
  const BLK = "#1d1b19", RED = "#cf3a2e", BLUE = "#2f5fd0", BROWN = "#7a5532", WHITE = "#fdfbf7";
  P.FINE = { BLK, RED, BLUE, BROWN, WHITE };

  const LOOKS = {
    brannan: { shirt: BLK, coat: true, coatFill: "#2e3038", trousers: "#3b3936", trouserFill: "#d9d5ce", shoes: "black", hat: "top", gloves: true, mustache: true, sideburns: true, chain: true, hair: "sides", collar: true, hairColor: "#3a2c23", vest: "#5b4c40" },
    miner: { shirt: RED, coat: false, trousers: BLUE, shoes: "boot", hat: "floppy", gloves: false, beard: true, braces: true, hair: "under", rolled: true, hairColor: "#4a3829" },
  };
  // modern people for money stories
  LOOKS.suit = { shirt: BLK, coat: true, jacket: true, coatFill: "#2f3a52", trousers: BLK, trouserFill: "#36425c", shoes: "black", hat: "none", hair: "full", hairColor: "#2a211b", collar: true, tie: "#a8322d", vest: false, gloves: false };
  LOOKS.clerk = { shirt: "#5d7a99", coat: false, trousers: "#3b3936", shoes: "black", hat: "none", hair: "full", hairColor: "#4a3829", tie: "#2f5fd0", glasses: true, beard: false, braces: false, rolled: false };
  LOOKS.worker = { shirt: BLUE, coat: false, trousers: "#3b3936", shoes: "boot", hat: "cap", capColor: RED, hair: "under", hairColor: "#4a3829", beard: false, braces: false, rolled: true };
  R.LOOKS = LOOKS;

  const facing = (pt, n) => dot(n, norm(sub(P.cam.pos, pt)));
  function hullOf(rings) { const s = []; for (const r of rings) for (const p of r) { const q = P.project(p); if (q) s.push(q); } return s.length >= 3 ? P.hull(s) : null; }
  function bodyRing(c, rx, rz, right, fwd, k = 12) { const o = []; for (let i = 0; i < k; i++) { const t = (i / k) * 6.283; o.push(add(c, add(scl(right, cos(t) * rx), scl(fwd, sin(t) * rz)))); } return o; }
  const line = (g, pts, o) => { const s = pts.map(P.project); if (s.every(Boolean)) P.ink(g, s, Object.assign({ double: false, wob: 0.35, over: 1.5 }, o)); };
  // corner-cutting, so hulls and limbs read as drawn curves rather than polygons
  function chaikin(pts, it = 2) {
    for (let k = 0; k < it; k++) {
      const o = [], n = pts.length;
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      pts = o;
    }
    return pts;
  }
  const outline = (g, pts, color, w, seed, fill = WHITE, smooth = 2) => {
    if (!pts || pts.length < 3) return;
    if (smooth) pts = chaikin(pts, smooth);
    P.fill(g, pts, fill);
    P.ink(g, pts.concat([pts[0]]), { w, color, seed, closed: true, over: 0, double: false, wob: 0.35 });
  };

  // a limb as one outline (fill white, coloured line)
  function limb(g, pts3, radii, color, w, seed, fill = WHITE) {
    const S = pts3.map((q) => P.project(q));
    if (S.some((q) => !q)) return null;
    const rr = S.map((q, i) => (radii[i] * P.cam.foc) / q[2]);
    const n = S.length, left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      left.push([S[i][0] - ty * rr[i], S[i][1] + tx * rr[i]]); right.push([S[i][0] + ty * rr[i], S[i][1] - tx * rr[i]]);
    }
    const cap = (c, r, from, to) => { const o = []; for (let k = 1; k < 6; k++) { const t = from + ((to - from) * k) / 6; o.push([c[0] + cos(t) * r, c[1] + sin(t) * r]); } return o; };
    const dE = Math.atan2(S[n - 1][1] - S[n - 2][1], S[n - 1][0] - S[n - 2][0]), dS = Math.atan2(S[0][1] - S[1][1], S[0][0] - S[1][0]);
    const pts = left.concat(cap(S[n - 1], rr[n - 1], dE + Math.PI / 2, dE - Math.PI / 2)).concat(right.slice().reverse()).concat(cap(S[0], rr[0], dS + Math.PI / 2, dS - Math.PI / 2));
    outline(g, pts, color, w, seed, fill);
    return { S, rr };
  }
  // ---------- organic shapes ----------
  const catmull = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return [0, 1, 2].map((i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)); };
  // a smooth path through the joints (rounded at the elbow / knee), n samples per bone
  function through(joints, n = 7) {
    const J2 = [joints[0], ...joints, joints[joints.length - 1]], out = [];
    for (let k = 0; k < joints.length - 1; k++) for (let i = 0; i < n; i++) out.push(catmull(J2[k], J2[k + 1], J2[k + 2], J2[k + 3], i / n));
    out.push(joints[joints.length - 1]);
    return out;
  }
  // a limb swept along a path with a radius profile r(u) (u = 0..1 along the whole limb): tapers and muscles, not tubes
  function sweep(g, pts3, rad, color, w, seed, fill = WHITE, o = {}) {
    const S = pts3.map((q) => P.project(q));
    if (S.some((q) => !q)) return null;
    const n = S.length, rr = S.map((q, i) => (rad(i / (n - 1)) * P.cam.foc) / q[2]);
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      left.push([S[i][0] - ty * rr[i], S[i][1] + tx * rr[i]]); right.push([S[i][0] + ty * rr[i], S[i][1] - tx * rr[i]]);
    }
    const cap = (c, r, from, to) => { const out = []; for (let k = 1; k < 7; k++) { const t = from + ((to - from) * k) / 7; out.push([c[0] + cos(t) * r, c[1] + sin(t) * r]); } return out; };
    const dE = Math.atan2(S[n - 1][1] - S[n - 2][1], S[n - 1][0] - S[n - 2][0]), dS = Math.atan2(S[0][1] - S[1][1], S[0][0] - S[1][0]);
    const endCap = o.capEnd === false ? [] : cap(S[n - 1], rr[n - 1], dE + Math.PI / 2, dE - Math.PI / 2);
    if (o.capStart === false) {
      const pts = chaikin(left.concat(endCap).concat(right.slice().reverse()), 1).slice(1, -1);
      P.fill(g, pts, fill);
      P.ink(g, pts, { w, color, seed, double: false, wob: 0.35, over: 0 });
      return { S, rr, left, right };
    }
    const pts = left.concat(endCap).concat(right.slice().reverse()).concat(cap(S[0], rr[0], dS + Math.PI / 2, dS - Math.PI / 2));
    outline(g, pts, color, w, seed, fill, 1);
    return { S, rr, left, right };
  }
  const smooth = (u) => u * u * (3 - 2 * u);
  // piecewise-smooth profile through [u, value] keys
  const prof = (keys) => (u) => { if (u <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return mix(a[1], b[1], smooth((u - a[0]) / (b[0] - a[0]))); } return keys[keys.length - 1][1]; };
  // body profiles (metres): a leg from hip to ankle, an arm from shoulder to wrist
  const LEG = prof([[0, 0.086], [0.12, 0.088], [0.42, 0.064], [0.5, 0.054], [0.62, 0.06], [0.72, 0.058], [0.92, 0.04], [1, 0.037]]);
  const ARM = prof([[0, 0.06], [0.1, 0.063], [0.28, 0.047], [0.48, 0.039], [0.62, 0.043], [0.8, 0.034], [1, 0.028]]);
  // a torso silhouette swept up the spine through elliptical sections (hips, waist, chest, shoulders, neck)
  function torso(g, J, s, look, w, seed, fill, color) {
    const pel = P.lerp3(J.hipL, J.hipR, 0.5), up = J.spineUp, Fw = J.spineFwd, Rv = J.right;
    const lowFwd = J.fwd, RU = J.rootUp || [0, 1, 0], dn = (k) => scl(RU, k * s); // [showdown] body-up, not world-up
    // spine centre line: from below the hips (or the coat hem) up to the neck, bending with the lean
    const secs = [];
    const add_ = (c, rx, rz, f) => secs.push({ c, rx: rx * s, rz: rz * s, f });
    if (look.coat && !look.jacket) { add_(add(pel, dn(-0.44)), 0.228, 0.15, lowFwd); add_(add(pel, dn(-0.25)), 0.21, 0.135, lowFwd); }
    if (look.coat && look.jacket) add_(add(pel, dn(-0.13)), 0.194, 0.116, lowFwd);
    add_(add(pel, dn(-0.07)), look.coat ? 0.196 : 0.142, look.coat ? 0.115 : 0.102, lowFwd);
    add_(add(pel, dn(0.03)), look.coat ? 0.168 : 0.136, look.coat ? 0.108 : 0.098, lowFwd);
    const sp = (h) => P.lerp3(pel, J.neck, h);
    add_(add(sp(0.2), scl(Fw, 0.0)), look.coat ? 0.13 : 0.142, 0.1, Fw);
    add_(add(sp(0.34), scl(Fw, 0.0)), 0.128, 0.098, Fw);
    add_(add(sp(0.56), scl(Fw, 0.012 * s)), 0.146, 0.114, Fw);
    add_(add(sp(0.74), scl(Fw, 0.006 * s)), 0.15, 0.106, Fw);
    add_(add(sp(0.86), scl(up, 0.0)), look.coat ? 0.152 : 0.14, look.coat ? 0.095 : 0.092, Fw);
    add_(add(sp(0.94), scl(up, 0.0)), look.coat ? 0.114 : 0.105, look.coat ? 0.075 : 0.073, Fw);
    add_(add(J.neck, scl(up, -0.02 * s)), 0.06, 0.056, Fw);
    add_(add(J.neck, scl(up, 0.01 * s)), 0.048, 0.048, Fw);
    // project each section and take its extremes across the screen-space spine
    const C = secs.map((q) => P.project(q.c));
    if (C.some((q) => !q)) return null;
    const L = [], Rt = [], rings = [];
    for (let i = 0; i < secs.length; i++) {
      const a = C[Math.max(0, i - 1)], b = C[Math.min(secs.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx, sec = secs[i], side = norm(cross(sec.f, [0, 1, 0])).map((v) => -v);
      const ring = [];
      for (let k = 0; k < 18; k++) { const t = (k / 18) * 6.283; const q = P.project(add(sec.c, add(scl(Rv, cos(t) * sec.rx), scl(sec.f, sin(t) * sec.rz)))); if (q) ring.push(q); }
      if (ring.length < 10) return null;
      let mn = 1e9, mx = -1e9, pmn = null, pmx = null;
      for (const q of ring) { const d = (q[0] - C[i][0]) * nx + (q[1] - C[i][1]) * ny; if (d < mn) { mn = d; pmn = q; } if (d > mx) { mx = d; pmx = q; } }
      L.push(pmn); Rt.push(pmx); rings.push({ ring, tx, ty });
    }
    // round the bottom with the lowest section's near arc, and the top with the neck
    const bottom = rings[0], top = rings[rings.length - 1];
    const arc = (rg, dirx, diry) => rg.ring.filter((q, k) => true).map((q) => ({ q, d: (q[0] - 0) * 0 })).length && rg.ring.filter((q) => ((q[0] - rg.ring.reduce((a, b) => a + b[0], 0) / rg.ring.length) * dirx + (q[1] - rg.ring.reduce((a, b) => a + b[1], 0) / rg.ring.length) * diry) > 0);
    const order = (pts, ax, ay) => pts.slice().sort((p1, p2) => (p1[0] * ax + p1[1] * ay) - (p2[0] * ax + p2[1] * ay));
    const nb = [-bottom.ty, bottom.tx];
    const bot = order(arc(bottom, -bottom.tx, -bottom.ty), nb[0], nb[1]);
    const nt = [-top.ty, top.tx];
    const tp = order(arc(top, top.tx, top.ty), -nt[0], -nt[1]);
    const outlinePts = Rt.concat(tp).concat(L.slice().reverse()).concat(bot);
    outline(g, outlinePts, color, w, seed, fill, 2);
    return outlinePts;
  }
  // a short fold mark across a limb at u (0..1 along segment a->b), in screen space
  function fold(g, S, rr, i, u, side, color, w, seed) {
    const a = S[i], b = S[i + 1], c = [mix(a[0], b[0], u), mix(a[1], b[1], u)], r = mix(rr[i], rr[i + 1], u);
    const d = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    const p0 = [c[0] + cos(d) * r * side, c[1] + sin(d) * r * side], p1 = [c[0] + cos(d) * r * side * 0.25 + (b[0] - a[0]) * 0.04, c[1] + sin(d) * r * side * 0.25 + (b[1] - a[1]) * 0.04];
    P.ink(g, [p0, p1], { w: w * 0.8, color, seed, double: false, wob: 0.3, over: 0 });
  }
  // a hand drawn flat, pointing along the forearm
  function hand(g, E, H, s, w, seed, glove) {
    const e = P.project(E), h = P.project(H);
    if (!e || !h) return;
    const size = P.pxAt(H, 0.1 * s);
    const a = Math.atan2(h[1] - e[1], h[0] - e[0]);
    const T = (u, v) => [h[0] + (u * cos(a) - v * sin(a)) * size, h[1] + (u * sin(a) + v * cos(a)) * size];
    if (size < 7) { const pts = []; for (let k = 0; k < 8; k++) { const t = (k / 8) * 6.283; pts.push([h[0] + cos(t) * size * 0.4, h[1] + sin(t) * size * 0.4]); } outline(g, pts, BLK, w, seed); return; }
    if (size < 16) {
      const palm = [T(-0.1, -0.32), T(0.35, -0.38), T(0.78, -0.3), T(0.95, -0.1), T(0.92, 0.12), T(0.72, 0.3), T(0.45, 0.36), T(0.4, 0.55), T(0.22, 0.6), T(0.1, 0.38), T(-0.1, 0.3)];
      outline(g, palm, BLK, w, seed, WHITE);
      for (const v of [-0.14, 0.04, 0.2]) P.ink(g, [T(0.62, v), T(0.92, v * 0.9)], { w: w * 0.7, color: BLK, seed: seed + v * 10, double: false, wob: 0.2, over: 0 });
    } else {
      // fingers first (slightly curled), then the palm over their roots, then the thumb
      const finger = (bu, bv, len, curl, wid, sd) => {
        const pts = [[bu, bv]]; let a = 0, u = bu, v = bv;
        for (let k = 0; k < 3; k++) { a += curl * (k ? 1 : 0.5); const l = len * [0.45, 0.32, 0.25][k]; u += cos(a) * l; v += sin(a) * l * 0.6 + (k === 2 ? 0 : 0); pts.push([u, v]); }
        const L2 = [], R2 = [];
        pts.forEach((q, i) => { const r = wid * (1 - i * 0.12); L2.push(T(q[0], q[1] - r)); R2.push(T(q[0], q[1] + r)); });
        const tip = T(u + wid * 0.6, v);
        outline(g, L2.concat([tip]).concat(R2.reverse()), BLK, w * 0.8, sd, WHITE, 1);
      };
      if (glove) outline(g, [T(-0.32, -0.43), T(-0.08, -0.35), T(-0.08, 0.35), T(-0.32, 0.43)], BLK, w * 0.85, seed + 9, WHITE, 1);
      [[0.55, -0.27, 0.62, 0.25], [0.6, -0.09, 0.7, 0.3], [0.58, 0.09, 0.66, 0.35], [0.52, 0.25, 0.52, 0.4]].forEach((f, i) => finger(f[0], f[1], f[2], f[3], 0.085, seed + i * 3));
      const palm = [T(-0.12, -0.28), T(0.3, -0.36), T(0.62, -0.34), T(0.66, 0.0), T(0.6, 0.33), T(0.3, 0.36), T(-0.12, 0.28)];
      outline(g, palm, BLK, w, seed, WHITE);
      if (glove) for (const v of [-0.15, 0, 0.15]) P.ink(g, [T(0.1, v), T(0.46, v * 0.85)], { w: w * 0.55, color: BLK, seed: seed + 3 + v * 10, double: false, wob: 0.2, over: 0, alpha: 0.75 });
      finger(0.18, -0.34, 0.55, -0.35, 0.1, seed + 20);
    }
  }
  function shoe(g, J, sd, s, w, seed, kind) {
    const an = J["an" + sd], fw = norm(sub(J["toe" + sd], an)), up = (J.footUp && J.footUp[sd]) || [0, 1, 0], side3 = J.right, pts = []; // [showdown]
    for (const ww of [0.042, -0.042]) {
      const sv = scl(side3, ww * s);
      pts.push(add(add(an, scl(sv, 0.85)), scl(up, 0.05 * s)), add(add(an, sv), add(scl(fw, -0.06 * s), scl(up, -0.05 * s))),
        add(add(an, scl(sv, 0.85)), add(scl(fw, 0.15 * s), scl(up, -0.055 * s))), add(add(an, scl(sv, 0.45)), add(scl(fw, 0.18 * s), scl(up, -0.02 * s))));
    }
    const h = hullOf([pts]);
    if (!h) return;
    outline(g, h, BLK, w, seed, kind === "black" ? "#262320" : WHITE);
    // the sole line and a couple of laces
    line(g, [add(an, add(scl(fw, -0.07 * s), scl(up, -0.035 * s))), add(an, add(scl(fw, 0.19 * s), scl(up, -0.04 * s)))], { w: w * 0.7, color: kind === "black" ? "#6b665e" : BLK, seed: seed + 1 });
    if (kind === "black") line(g, [add(an, add(scl(fw, 0.06 * s), scl(up, -0.008 * s))), add(an, add(scl(fw, 0.135 * s), scl(up, -0.026 * s)))], { w: w * 0.9, color: "#8d877e", seed: seed + 5, alpha: 0.85 });
    if (kind !== "black") for (let i = 0; i < 2; i++) line(g, [add(an, add(scl(fw, 0.03 + i * 0.04), scl(up, 0.012 - i * 0.012))), add(an, add(add(scl(fw, 0.05 + i * 0.04), scl(up, 0.0 - i * 0.012)), scl(side3, 0.02)))], { w: w * 0.6, color: BLK, seed: seed + 2 + i });
  }

  R.draw = function (g, F) {
    if (P.STYLE.name !== "fine") return R.drawInk(g, F);
    P.STYLE.inFigure = true;
    try { return drawFine(g, F); } finally { P.STYLE.inFigure = false; }
  };
  function drawFine(g, F) {
    const J = R.solve(F), look = Object.assign({}, LOOKS[F.kind || "miner"], F.look || {}), s = F.scale || 1, seed = F.seed || 1;
    const tint = (c, u) => (P.hex(c) ? P.css(P.mixc(P.hex(c), [253, 251, 247], u)) : WHITE);
    if (!look.coat && !look.shirtFill) look.shirtFill = tint(look.shirt, 0.8);
    if (!look.trouserFill) look.trouserFill = tint(look.trousers, 0.78);
    const hpx = P.pxAt(F.pos, 1.8 * s);
    if (hpx < 3) return J;
    const detail = hpx > 90, tiny = hpx < 30;
    const w = clamp(2.5 * Math.pow(hpx / 900, 0.3) * (F.w ? F.w / 3 : 1), 0.7, 3.4);
    const parts = [], push = (pt, fn) => parts.push({ z: P.depth(pt), fn });

    // a soft grey ground shadow (the reference has none, but it keeps feet on the ground in 3D)
    if (!tiny && F.shadow !== false) {
      const ring = P.projectPoly(P.ring(add([F.pos[0], F.pos[1] + 0.004, F.pos[2]], scl(J.fwd, 0.03)), 0.3 * s, [0, 1, 0], 16, 0.18 * s));
      if (ring) P.fill(g, ring, "rgba(40,30,20,0.08)");
    }
    // legs
    for (const sd of ["L", "R"]) {
      // legs always go under the coat or shirt, unless the thigh is lifted in front of the body (sitting)
      const lifted = F.legsFree || Math.max(F.pose.hipL || 0, F.pose.hipR || 0) > 0.9; // [showdown]
      parts.push({ z: lifted ? P.depth(J["kn" + sd]) + 0.08 * s : 1e6 - (sd === "L" ? P.depth(J.knL) : P.depth(J.knR)), fn: () => {
        // trousers hang looser than the leg under them: soften the muscle shape
        const loose = look.trousers === BLUE ? 0.55 : 0.75, base = look.trousers === BLUE ? 0.012 : 0.004;
        const path = through([J["hip" + sd], J["kn" + sd], J["an" + sd]], 7);
        const L = sweep(g, path, (u) => (mix(0.07, LEG(u), loose) + base + (u > 0.9 ? 0.006 : 0)) * s, look.trousers, w, seed + (sd === "L" ? 1 : 2), look.trouserFill || WHITE, { capStart: false });
        if (L && !tiny) { const n = L.S.length - 1; for (const [u, side] of [[0.46, 1], [0.54, -1], [0.92, 1]]) { const i = Math.round(u * n); fold(g, L.S, L.rr, Math.min(i, n - 1), 0.5, side, look.trousers, w, seed + 3 + u * 10); } }
        // pressed trousers: a crease down the front of each leg
        if (L && detail && look.coat && facing(J["kn" + sd], J.fwd) > 0.1) { const f = scl(J.fwd, 0.055 * s); line(g, [add(P.lerp3(J["hip" + sd], J["kn" + sd], 0.55), f), add(J["kn" + sd], f), add(J["an" + sd], scl(f, 0.8))], { w: w * 0.6, color: "#8a857d", seed: seed + 40 }); }
      } });
      parts.push({ z: lifted ? P.depth(J["toe" + sd]) : 1e6 - 1 - P.depth(J["toe" + sd]) * 0.001, fn: () => shoe(g, J, sd, s, w, seed + 7 + (sd === "L" ? 0 : 3), look.shoes) });
    }
    // torso
    push(J.chest, () => {
      const Rv = J.right, Fw = J.spineFwd, Up = J.spineUp, pel = P.lerp3(J.hipL, J.hipR, 0.5);
      const h = torso(g, J, s, look, w, seed + 8, look.coatFill || look.shirtFill || WHITE, look.coat ? BLK : look.shirt);
      if (!h) return;
      if (tiny) return;
      const front = facing(J.chest, Fw) > 0.05, sg = front ? 1 : -1;
      const surf = (u, side = 0, depth = 0.11) => add(add(P.lerp3(J.neck, pel, u), scl(Fw, depth * s * sg)), scl(Rv, side * s));
      if (detail) {
        const fc = look.coat ? "#9aa0ad" : look.shirt;
        for (const sd of [1, -1]) {
          line(g, [surf(0.22, 0.125 * sd, 0.07), surf(0.3, 0.095 * sd, 0.1), surf(0.36, 0.085 * sd, 0.105)], { w: w * 0.7, color: fc, seed: seed + 60 + sd });
          if (!look.coat) { line(g, [surf(0.78, 0.12 * sd, 0.085), surf(0.84, 0.07 * sd, 0.1)], { w: w * 0.65, color: fc, seed: seed + 62 + sd }); line(g, [surf(0.86, 0.11 * sd, 0.09), surf(0.88, 0.05 * sd, 0.105)], { w: w * 0.6, color: fc, seed: seed + 64 + sd }); }
        }
      }
      if (look.coat) {
        const PALE = "#9aa0ad", LAP = look.lapel || (look.coatFill ? P.css(P.mixc(P.hex(look.coatFill), [255, 255, 255], 0.07)) : "#3b3e49");
        const VEST = look.vest === false ? null : look.vest || "#5b4c40", jk = !!look.jacket, hem = jk ? 1.24 : 1.81, VB = jk ? 0.6 : 0.5;
        // the front of the body as an ellipse at each height u (0 = neck, 1 = hips), so details sit on the cloth
        const FD = prof([[0, 0.06], [0.06, 0.075], [0.14, 0.093], [0.26, 0.111], [0.44, 0.124], [0.66, 0.101], [0.8, 0.101], [0.94, 0.108], [1.13, 0.115], [1.46, 0.135], [1.81, 0.15]]);
        const FWD = prof([[0, 0.05], [0.06, 0.098], [0.14, 0.13], [0.26, 0.15], [0.44, 0.146], [0.66, 0.128], [0.8, 0.13], [0.94, 0.168], [1.13, 0.196], [1.46, 0.21], [1.81, 0.228]]);
        const on = (u, x, lift = 0.006) => surf(u, x, FD(u) * Math.sqrt(Math.max(0.05, 1 - (x / FWD(u)) ** 2)) + lift);
        const shape = (pts, fill, ww, sd) => { const q = pts.map(P.project); if (q.every(Boolean)) outline(g, q, BLK, ww, seed + 100 + sd, fill, 0); };
        const btn = (pt, r, fill, ring) => { const b = P.project(pt); if (!b) return; g.save(); g.fillStyle = fill; g.beginPath(); g.arc(b[0], b[1], r, 0, 6.28); g.fill(); if (ring) { g.strokeStyle = ring; g.lineWidth = Math.max(0.8, w * 0.5); g.stroke(); } g.restore(); };
        const pale = (pts, sd, ww = 0.75) => line(g, pts, { w: w * ww, color: PALE, seed: seed + 110 + sd });
        if (front) {
          // the opening: shirt front, then a waistcoat with its own V neck, gold buttons and the watch chain
          const hw = (u) => (0.062 + 0.25 * u) * Math.pow(Math.max(0, 1 - u / VB), 0.9), N = 8;
          const opening = (sd) => { const o = []; for (let k = 0; k <= N; k++) { const u = (k / N) * VB; o.push(on(u, hw(u) * sd)); } return o; };
          const oR = opening(1), oL = opening(-1);
          shape(oR.concat(oL.slice(0, N).reverse()), WHITE, w * 0.85, 1);
          // a long tie down the shirt front, tucked away where the coat closes
          if (look.tie) shape([[0.035, 0.013], [0.1, 0.02], [VB - 0.09, 0.022], [VB - 0.015, 0], [VB - 0.09, -0.022], [0.1, -0.02], [0.035, -0.013]].map(([u, x]) => on(u, x, 0.01)), look.tie, w * 0.8, 5);
          if (!VEST) {} else if (!detail) shape([on(0.2, 0)].concat(oR.slice(1)).concat(oL.slice(1, N).reverse()), VEST, w * 0.8, 2);
          else {
            shape([on(0.2, 0)].concat(oR.slice(1)).concat(oL.slice(1, N).reverse()), VEST, w * 0.8, 2);
            for (let i = 0; i < 3; i++) btn(on(0.27 + i * 0.07, 0, 0.009), Math.max(1.1, w * 0.62), P.GOLD_DK);
            if (look.chain) { line(g, [on(0.34, 0.003, 0.01), on(0.385, 0.012, 0.01), on(0.405, 0.022, 0.01), on(0.385, 0.036, 0.01)], { w: w * 1.4, color: P.GOLD, seed: seed + 13 }); btn(on(0.34, 0.003, 0.011), Math.max(1.2, w * 0.8), P.GOLD); }
          }
          // notched lapels, a shade lighter than the coat, covering the edges of the opening
          for (const sd of [1, -1]) {
            const inner = sd > 0 ? oR : oL;
            const outer = [[0.47, 0.03], [0.4, 0.075], [0.3, 0.104], [0.2, 0.118], [0.145, 0.12], [0.128, 0.096], [0.11, 0.108], [0.05, 0.096], [0.0, 0.078]].map(([u, x]) => on(u, x * sd, 0.008));
            shape(inner.concat(outer), LAP, w * 0.85, 3 + sd);
            if (detail && sd > 0) pale([on(0.19, 0.085, 0.01), on(0.205, 0.1, 0.01)], 9, 0.6); // buttonhole
          }
          if (!look.chain) {} else if (!detail) line(g, [on(0.3, 0.0, 0.01), on(0.36, 0.03, 0.01)], { w: w * 1.5, color: P.GOLD, seed: seed + 13 });
          // below the opening: the front edges, two buttons, a waist seam, pocket flaps
          pale(jk ? [on(VB, 0), on(0.95, 0), on(1.1, 0.02), on(hem, 0.06)] : [on(VB, 0), on(0.8, 0), on(1.13, 0.004), on(1.6, 0.014), on(hem, 0.03)], 1, 0.9);
          if (detail) {
            for (const u of jk ? [0.68, 0.8] : [0.56, 0.67]) btn(on(u, 0.024, 0.008), Math.max(1.3, w * 0.8), look.coatFill || "#2e3038", PALE);
            if (!jk) pale([on(0.8, 0.125), on(0.8, 0.0), on(0.8, -0.125)], 2, 0.6);
            for (const sd of [1, -1]) pale([on(1.06, 0.075 * sd), on(1.06, 0.168 * sd), on(1.12, 0.165 * sd), on(1.12, 0.078 * sd), on(1.06, 0.075 * sd)], 3 + sd, 0.65);
          }
        } else {
          // the back: centre seam, a vent in the skirt, two buttons at the waist
          pale([on(0.06, 0), on(jk ? 1.02 : 0.8, 0)], 6, 0.7);
          pale(jk ? [on(1.02, 0.012), on(hem, 0.012)] : [on(0.8, 0.012), on(1.3, 0.012), on(hem, 0.012)], 7, 0.8);
          if (detail && !jk) { pale([on(0.8, -0.13), on(0.8, 0.13)], 8, 0.6); for (const sd of [1, -1]) btn(on(0.79, 0.045 * sd, 0.008), Math.max(1.3, w * 0.8), "#2e3038", PALE); }
        }
      } else {
        // shirt: collar, placket, belt
        if (front) {
          line(g, [surf(0.0, 0.07, 0.09), surf(0.08, 0.0, 0.11), surf(0.0, -0.07, 0.09)], { w: w * 0.9, color: look.shirt, seed: seed + 16 });
          line(g, [surf(0.08, 0.0, 0.11), surf(0.45, 0.0, 0.115)], { w: w * 0.7, color: look.shirt, seed: seed + 17 });
          for (let i = 0; i < 2; i++) { const b = P.project(surf(0.18 + i * 0.12, 0.012, 0.115)); if (b) { g.save(); g.fillStyle = look.shirt; g.beginPath(); g.arc(b[0], b[1], Math.max(1, w * 0.7), 0, 6.28); g.fill(); g.restore(); } }
          if (look.tie) {
            const onT = (u, x) => surf(u, x, 0.112 * Math.sqrt(Math.max(0.05, 1 - (x / 0.15) ** 2)) + 0.013);
            const tq = [[0.03, 0.013], [0.09, 0.019], [0.56, 0.024], [0.64, 0], [0.56, -0.024], [0.09, -0.019], [0.03, -0.013]].map(([u, x]) => P.project(onT(u, x)));
            if (tq.every(Boolean)) outline(g, tq, BLK, w * 0.8, seed + 27, look.tie, 0);
          }
          if (detail && !look.apron) {
            const onS = (u, x) => surf(u, x, 0.112 * Math.sqrt(Math.max(0.05, 1 - (x / 0.155) ** 2)) + 0.006);
            line(g, [onS(0.25, 0.042), onS(0.36, 0.044), onS(0.36, 0.1), onS(0.25, 0.1)], { w: w * 0.7, color: look.shirt, seed: seed + 23 });
            line(g, [onS(0.25, 0.04), onS(0.25, 0.102)], { w: w * 0.85, color: look.shirt, seed: seed + 26 });
          }
        }
        const belt = bodyRing(add(pel, [0, 0.03 * s, 0]), 0.152 * s, 0.102 * s, Rv, J.fwd, 16).map(P.project).filter(Boolean);
        const vis = belt.filter((q, i) => true);
        if (vis.length > 8) { const half = []; for (let i = 0; i <= 8; i++) half.push(belt[(i + (front ? 0 : 8)) % 16]); P.ink(g, half, { w: w * (detail ? 2.2 : 1.1), color: detail ? "#4e3523" : BLK, seed: seed + 18, double: false, wob: 0.3 }); }
        if (detail && front && !look.apron) { const c = add(add(pel, [0, 0.03 * s, 0]), scl(J.fwd, 0.106 * s)), bk = [add(c, add(scl(Rv, -0.022 * s), scl(Up, 0.016 * s))), add(c, add(scl(Rv, 0.022 * s), scl(Up, 0.016 * s))), add(c, add(scl(Rv, 0.022 * s), scl(Up, -0.016 * s))), add(c, add(scl(Rv, -0.022 * s), scl(Up, -0.016 * s)))].map(P.project); if (bk.every(Boolean)) outline(g, bk, BLK, w * 0.7, seed + 19, "#c9a24a", 0); }
        if (look.braces) for (const sd of [1, -1]) line(g, [surf(0.0, 0.085 * sd, 0.09), surf(0.5, 0.075 * sd, 0.11), surf(0.94, 0.08 * sd, 0.105)], { w: w * 1.0, color: BROWN, seed: seed + 19 + sd });
        // a fold or two in the shirt
        line(g, [surf(0.6, 0.11, 0.1), surf(0.72, 0.07, 0.11)], { w: w * 0.7, color: look.shirt, seed: seed + 22 });
      }
    });
    // arms
    for (const sd of ["L", "R"]) {
      push(J["el" + sd], () => {
        const sh = J["sh" + sd], el = J["el" + sd], hd = J["h" + sd];
        if (look.rolled) {
          // a rolled sleeve to just past the elbow, then a bare forearm
          // bare forearm, then the rolled sleeve over the upper arm, ending in a thick cuff below the elbow
          const path = through([add(sh, scl(J.spineUp, -0.03 * s)), el, hd], 7), n = path.length - 1, cut = Math.round(n * 0.64);
          sweep(g, path.slice(cut - 1), (u) => ARM(mix((cut - 1) / n, 1, u)) * s, BLK, w, seed + 23);
          const sl = path.slice(0, cut + 1);
          const L = sweep(g, sl, (u) => (ARM(u * cut / n) + 0.004 + (u > 0.84 ? 0.009 * smooth((u - 0.84) / 0.16) : 0) - 0.009 * (u * cut / n < 0.16 ? smooth(1 - (u * cut / n) / 0.16) : 0)) * s, look.shirt, w, seed + 24, look.shirtFill || WHITE);
          if (L && !tiny) { const k = L.S.length - 1, a = L.S[k], b = L.S[k - 2], r = L.rr[k], d = Math.atan2(a[1] - b[1], a[0] - b[0]) + Math.PI / 2; const c = [mix(b[0], a[0], 0.55), mix(b[1], a[1], 0.55)]; P.ink(g, [[c[0] + cos(d) * r, c[1] + sin(d) * r], [c[0] - cos(d) * r, c[1] - sin(d) * r]], { w: w * 0.9, color: look.shirt, seed: seed + 25, double: false, wob: 0.3, over: 0 }); fold(g, L.S, L.rr, Math.round(k * 0.7), 0.5, -1, look.shirt, w, seed + 26); }
        } else {
          // a sleeve: the arm's shape softened, a little wider at the cuff
          const path = through([add(sh, scl(J.spineUp, (look.coat ? -0.042 : -0.03) * s)), el, hd], 7), n = path.length - 1;
          const root = (u) => (u < 0.16 ? smooth(1 - u / 0.16) : 0);
          const rad = (u) => (mix(0.046, ARM(u), 0.7) + (look.coat ? 0.009 : 0.005) + (u > 0.88 ? 0.006 : 0) - (look.coat ? 0.014 : 0.009) * root(u)) * s;
          let L;
          if (look.coat) {
            // the white shirt cuff shows past the end of the coat sleeve
            const k0 = Math.round(n * 0.82), k1 = Math.round(n * 0.92);
            if (!tiny) sweep(g, path.slice(k0), (u) => (ARM(mix(k0 / n, 1, u)) + 0.007) * s, BLK, w * 0.9, seed + 31, WHITE);
            L = sweep(g, path.slice(0, k1 + 1), (u) => rad((u * k1) / n) + (u > 0.85 ? 0.004 * s : 0), BLK, w, seed + 27, look.coatFill || WHITE);
            if (L && detail) { const m = L.S.length - 3, a = L.S[m], b = L.S[m + 1], r = L.rr[m] * 0.92, d = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2; P.ink(g, [[a[0] + cos(d) * r, a[1] + sin(d) * r], [a[0] - cos(d) * r, a[1] - sin(d) * r]], { w: w * 0.7, color: "#9aa0ad", seed: seed + 32, double: false, wob: 0.3, over: 0 }); }
          } else L = sweep(g, path, rad, look.shirt, w, seed + 27, look.shirtFill || WHITE);
          if (L && !tiny) { const nn = L.S.length - 1; fold(g, L.S, L.rr, Math.round(nn * 0.48), 0.5, 1, look.coatFill ? "#9aa0ad" : BLK, w, seed + 28); fold(g, L.S, L.rr, Math.round(nn * 0.55), 0.5, -1, look.coatFill ? "#9aa0ad" : BLK, w, seed + 29); }
        }
      });
      push(add(J["h" + sd], scl(norm(sub(J["h" + sd], J["el" + sd])), 0.04 * s)), () => { if (!tiny) hand(g, J["el" + sd], J["h" + sd], s, w, seed + 29 + (sd === "L" ? 0 : 5), look.gloves); });
    }
    if (P.depth(J.head) > 0.6) parts.push({ z: P.depth(J.head) - 0.1 * s, fn: () => head(g, J, look, s, seed, w, detail, tiny) });
    if (F.pose.tool && J.toolA) push(P.lerp3(J.toolA, J.toolB, 0.6), () => tool(g, F.pose.tool, J, s, seed, w, F.toolGold));
    if (F.extra) push(add(J[F.extraAt || "hR"], scl(norm(sub(P.cam.pos, J[F.extraAt || "hR"])), 0.05)), () => F.extra(g, J, w));
    if (look.apron) push(add(J.chest, scl(J.fwd, 0.12 * s)), () => {
      if (facing(J.chest, J.fwd) < 0) return;
      const pel = P.lerp3(J.hipL, J.hipR, 0.5), f = scl(J.fwd, 0.13 * s), r = J.right;
      const kneeY = P.lerp3(J.knL, J.knR, 0.5);
      const ap = [add(add(J.chest, f), scl(r, 0.09 * s)), add(add(J.chest, f), scl(r, -0.09 * s)), add(add(pel, f), scl(r, -0.16 * s)), add(add(kneeY, f), scl(r, -0.15 * s)), add(add(kneeY, f), scl(r, 0.15 * s)), add(add(pel, f), scl(r, 0.16 * s))].map(P.project);
      if (ap.every(Boolean)) {
        outline(g, ap, BLK, w, seed + 90, "#efe6d3", 1);
        line(g, [add(add(pel, f), scl(r, 0.16 * s)), add(add(pel, f), scl(r, -0.16 * s))], { w: w * 1.4, color: "#7a5532", seed: seed + 91 });
        const pk = P.lerp3(pel, kneeY, 0.35), f2 = scl(J.fwd, 0.135 * s);
        line(g, [add(add(pk, f2), scl(r, 0.1 * s)), add(add(pk, f2), scl(r, -0.1 * s)), add(add(P.lerp3(pel, kneeY, 0.6), f2), scl(r, -0.1 * s)), add(add(P.lerp3(pel, kneeY, 0.6), f2), scl(r, 0.1 * s)), add(add(pk, f2), scl(r, 0.1 * s))], { w: w * 0.7, color: BLK, seed: seed + 92 });
      }
    });
    parts.sort((a, b) => b.z - a.z);
    for (const p of parts) p.fn();
    return J;
  }

  // ---------- hair ----------
  // the head's shape in head units: height y -> [rx, rz, dz], matching the hull the head is drawn from
  const HEADK = [[-0.11, 0.03, 0.045, 0.035], [-0.085, 0.062, 0.082, 0.02], [-0.05, 0.08, 0.097, 0.01], [0, 0.095, 0.11, 0], [0.055, 0.097, 0.106, -0.006], [0.1, 0.064, 0.074, -0.012], [0.117, 0.035, 0.04, -0.014], [0.127, 0.004, 0.004, -0.014]];
  function headR(y) {
    const k = HEADK;
    if (y <= k[0][0]) return [k[0][1], k[0][2], k[0][3]];
    for (let i = 1; i < k.length; i++) if (y <= k[i][0]) { const a = k[i - 1], b = k[i], u = (y - a[0]) / (b[0] - a[0]); return [mix(a[1], b[1], u), mix(a[2], b[2], u), mix(a[3], b[3], u)]; }
    const l = k[k.length - 1]; return [l[1], l[2], l[3]];
  }
  // where hair grows, by angle round the head (sin > 0 is the face side) and height
  function hairZone(look) {
    const full = look.hair === "full", under = look.hair === "under";
    const top = full ? 0.2 : 0.088, nape = under ? -0.1 : -0.095, wave = under ? 0.009 : 0.005;
    return (th, y) => {
      if (y > top) return false;
      const x = cos(th), z = sin(th);
      // mutton chops: down the cheek in front of the ear, widening along the jaw
      if (look.sideburns && z > -0.06 && y < 0.045 && y > -0.08) {
        const zf = mix(0.28, 0.56, smooth(clamp((0.025 - y) / 0.085))), bottom = -0.074 + 0.022 * smooth(clamp((z - 0.36) / 0.22));
        if (z < zf && y > bottom) return true;
      }
      let yb;
      if (z < 0.1) yb = mix(0.028, nape, smooth(clamp((0.1 - z) / 0.85))) + wave * sin(th * 11) * smooth(clamp(-z / 0.5));
      else if (z < 0.74) yb = mix(0.03, full ? 0.07 : 0.06, smooth((z - 0.1) / 0.64));
      else { if (!full) return false; yb = 0.074 + 0.005 * cos(x * 10); }
      return y > yb;
    };
  }
  function relax(pts, it, closed) {
    const n = pts.length;
    for (let k = 0; k < it; k++) pts = pts.map((p, i) => { if (!closed && (i === 0 || i === n - 1)) return p; const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]; return [p[0] * 0.5 + (a[0] + b[0]) * 0.25, p[1] * 0.5 + (a[1] + b[1]) * 0.25]; });
    return pts;
  }
  function chaikinOpen(pts, it = 2) {
    for (let k = 0; k < it; k++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; }
    return pts;
  }
  function hair(g, at, look, s, seed, w, detail) {
    const zone = hairZone(look), full = look.hair === "full", hatOn = look.hat && look.hat !== "none";
    const NT = detail ? 84 : 42, y0 = -0.102, y1 = full ? 0.127 : 0.088;
    const NY = Math.max(3, Math.round((y1 - y0) / (detail ? 0.0045 : 0.009))), DY = (y1 - y0) / NY, DT = 6.283185 / NT;
    // a shell a little off the head (fuller at the back, flatter on the cheeks)
    const hp3 = (th, y) => { const [rx, rz, dz] = headR(y), z = sin(th), f = mix(1.075, 1.03, smooth(clamp(z / 0.35))); return at(cos(th) * rx * f, y, z * rz * f + dz); };
    const V = []; for (let i = 0; i < NT; i++) { const col = []; for (let j = 0; j <= NY; j++) col.push(P.project(hp3(i * DT - Math.PI, y0 + j * DY))); V.push(col); }
    const vtx = (i, j) => V[((i % NT) + NT) % NT][j];
    const IN = new Uint8Array(NT * NY), FC = new Float32Array(NT * NY);
    for (let i = 0; i < NT; i++) for (let j = 0; j < NY; j++) {
      const th = (i + 0.5) * DT - Math.PI, y = y0 + (j + 0.5) * DY;
      if (!zone(th, y)) continue;
      const p = hp3(th, y), n = norm(cross(sub(hp3(th, y + 0.002), hp3(th, y - 0.002)), sub(hp3(th + 0.01, y), hp3(th - 0.01, y))));
      const f = facing(p, n); FC[i * NY + j] = f;
      if (f > -0.06 && vtx(i, j) && vtx(i + 1, j) && vtx(i, j + 1) && vtx(i + 1, j + 1)) IN[i * NY + j] = 1;
    }
    const inn = (i, j) => j >= 0 && j < NY && IN[(((i % NT) + NT) % NT) * NY + j] === 1;
    // the region's edges, chained into loops
    const segs = [];
    for (let i = 0; i < NT; i++) for (let j = 0; j < NY; j++) {
      if (!inn(i, j)) continue;
      if (!inn(i - 1, j)) segs.push([i, j, i, j + 1]);
      if (!inn(i + 1, j)) segs.push([i + 1, j, i + 1, j + 1]);
      if (!inn(i, j - 1)) segs.push([i, j, i + 1, j]);
      if (!inn(i, j + 1)) segs.push([i, j + 1, i + 1, j + 1]);
    }
    if (!segs.length) return;
    const key = (i, j) => (((i % NT) + NT) % NT) * 4096 + j, adj = new Map();
    segs.forEach((sg, k) => { for (const kk of [key(sg[0], sg[1]), key(sg[2], sg[3])]) { if (!adj.has(kk)) adj.set(kk, []); adj.get(kk).push(k); } });
    const used = new Uint8Array(segs.length), loops = [];
    for (let k0 = 0; k0 < segs.length; k0++) {
      if (used[k0]) continue; used[k0] = 1;
      const lp = [[segs[k0][0], segs[k0][1]], [segs[k0][2], segs[k0][3]]];
      for (;;) {
        const e = lp[lp.length - 1], kk = key(e[0], e[1]), nx = (adj.get(kk) || []).find((m) => !used[m]);
        if (nx == null) break;
        used[nx] = 1;
        const sg = segs[nx]; lp.push(key(sg[0], sg[1]) === kk ? [sg[2], sg[3]] : [sg[0], sg[1]]);
      }
      if (lp.length > 4) loops.push(lp.slice(0, -1));
    }
    const fillPath = new Path2D(), inks = [];
    for (const vs of loops) {
      const sm = chaikin(relax(vs.map((v) => vtx(v[0], v[1])), 7, true), 1);
      fillPath.moveTo(sm[0][0], sm[0][1]); for (const q of sm) fillPath.lineTo(q[0], q[1]); fillPath.closePath();
      // ink the edge, but not where it runs under the hat
      const hi = hatOn ? vs.findIndex((v) => v[1] === NY) : -1;
      if (hi < 0) inks.push(sm.concat([sm[0]]));
      else { const rot = vs.slice(hi).concat(vs.slice(0, hi)); let run = []; const out = () => { if (run.length > 2) inks.push(chaikinOpen(relax(run, 7, false), 1)); run = []; }; for (const v of rot) { if (v[1] === NY) out(); else run.push(vtx(v[0], v[1])); } out(); }
    }
    g.save(); g.fillStyle = look.hairColor || "#3f3128"; g.fill(fillPath, "evenodd"); g.restore();
    if (detail) {
      // pen strands, combed down and a little back; short strokes down the whiskers
      g.save(); g.clip(fillPath, "evenodd");
      const rnd = P.rng(seed * 17 + 3);
      const cellF = (th, y) => { let i = Math.floor((th + Math.PI) / DT), j = Math.floor((y - y0) / DY); i = ((i % NT) + NT) % NT; return j >= 0 && j < NY && IN[i * NY + j] ? FC[i * NY + j] : -1; };
      const toBack = (th) => { const d = Math.atan2(sin(-Math.PI / 2 - th), cos(-Math.PI / 2 - th)); return Math.sign(d) * Math.min(1, Math.abs(d)); };
      const strand = (th, y, len, steps, sw, k) => {
        const pts = [];
        for (let t = 0; t <= steps; t++) {
          if (cellF(th, y) > 0.1) { const q = P.project(hp3(th, y)); if (q) pts.push(q); } else if (pts.length) break;
          y -= len / steps; th += toBack(th) * 0.014 + 0.008 * sin(t * 1.3 + k);
        }
        if (pts.length > 2) P.ink(g, chaikinOpen(pts, 1), { w: w * sw, color: "#17120f", seed: seed + 200 + k, double: false, wob: 0.25, over: 0, alpha: 0.85 });
      };
      for (let k = 0; k < 52; k++) strand(-Math.PI + rnd() * 6.283, y1 - 0.003 - rnd() * 0.035, 0.05 + rnd() * 0.1, 10, 0.5, k);
      if (look.sideburns) for (let k = 0; k < 28; k++) { const z = 0.02 + rnd() * 0.56, th0 = Math.asin(z); strand(rnd() < 0.5 ? th0 : Math.PI - th0, 0.035 - rnd() * 0.1, 0.018 + rnd() * 0.02, 4, 0.45, 60 + k); }
      g.restore();
    }
    for (let k = 0; k < inks.length; k++) P.ink(g, inks[k], { w: w * 0.9, color: BLK, seed: seed + 140 + k, double: false, wob: 0.3, over: 0 });
  }
  // a white stand collar with folded wing tips, and a black bow tie
  function collar(g, J, s, w, seed, look = {}) {
    const Fw = J.spineFwd, Rv = J.right, Up = J.spineUp;
    const N = (x, y, z) => add(J.neck, add(add(scl(Rv, x * s), scl(Up, y * s)), scl(Fw, z * s)));
    const band = (y, r) => { const o = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * 6.283; o.push(N(cos(t) * r, y, sin(t) * r * 0.95)); } return o; };
    const h = hullOf([band(-0.012, 0.056), band(0.034, 0.05)]);
    if (h) outline(g, h, BLK, w * 0.9, seed + 160, WHITE);
    if (facing(N(0, 0.01, 0.05), Fw) <= 0.05) return;
    for (const sd of [1, -1]) { const tip = [N(0.008 * sd, 0.034, 0.05), N(0.046 * sd, 0.028, 0.032), N(0.024 * sd, -0.006, 0.05)].map(P.project); if (tip.every(Boolean)) outline(g, tip, BLK, w * 0.8, seed + 161 + sd, WHITE, 0); }
    if (look.tie) { const kt = [N(-0.016, 0.014, 0.058), N(0.016, 0.014, 0.058), N(0.011, -0.016, 0.061), N(-0.011, -0.016, 0.061)].map(P.project); if (kt.every(Boolean)) outline(g, kt, BLK, w * 0.8, seed + 166, look.tie, 0); return; }
    for (const sd of [1, -1]) { const wing = [N(0, 0.004, 0.06), N(0.04 * sd, 0.022, 0.054), N(0.046 * sd, -0.004, 0.055), N(0.04 * sd, -0.016, 0.054)].map(P.project); if (wing.every(Boolean)) outline(g, wing, BLK, w * 0.8, seed + 164 + sd, "#1f1d1b", 1); }
    const kn = P.project(N(0, 0.003, 0.062)); if (kn) { g.save(); g.fillStyle = "#1f1d1b"; g.beginPath(); g.arc(kn[0], kn[1], Math.max(1.5, P.pxAt(J.neck, 0.011 * s)), 0, 6.28); g.fill(); g.restore(); }
  }
  // the top hat's ribbon band and a satin sheen, on the side that faces the camera
  function hatTrim(g, at, s, K, seed, w) {
    const ring = (y, r, rz) => { const o = []; for (let i = 0; i <= 24; i++) { const t = (i / 24) * 6.283, p = at(cos(t) * r, y, sin(t) * rz); o.push(dot(sub(P.cam.pos, p), sub(p, at(0, y, 0))) > 0 ? P.project(p) : null); } return o; };
    const lo = ring(0.082, 0.0912, 0.0852), hi = ring(0.114, 0.0918, 0.0858);
    // the visible run (the ring wraps, so start from a hidden point)
    const st = lo.findIndex((q) => !q);
    if (st >= 0) {
      const A = [], B = [];
      for (let k = 1; k <= 24; k++) { const i = (st + k) % 24; if (lo[i] && hi[i]) { A.push(lo[i]); B.push(hi[i]); } else if (A.length) break; }
      if (A.length > 3) { P.fill(g, A.concat(B.slice().reverse()), "#3d3934"); P.ink(g, A, { w: w * 0.7, color: "#141210", seed: seed + 85, double: false, over: 0 }); P.ink(g, B, { w: w * 0.7, color: "#141210", seed: seed + 86, double: false, over: 0 }); }
    }
    // sheen: two soft vertical strokes a little off the middle
    const d = sub(P.cam.pos, at(0, 0.17, 0)), up = norm(sub(at(0, 1, 0), at(0, 0, 0))), rt = norm(sub(at(1, 0, 0), at(0, 0, 0))), fw = norm(sub(at(0, 0, 1), at(0, 0, 0)));
    const tc = Math.atan2(dot(d, fw), dot(d, rt));
    for (const [off, cw, al] of [[0.62, 2.4, 0.55], [0.82, 1.2, 0.4]]) {
      const t = tc + off, a = P.project(at(cos(t) * 0.0935, 0.124, sin(t) * 0.0875)), b = P.project(at(cos(t) * 0.0948, 0.25, sin(t) * 0.0888));
      if (a && b) P.ink(g, [a, b], { w: w * cw, color: "#5a554e", seed: seed + 87 + off * 10, double: false, wob: 0.3, over: 0, alpha: al });
    }
  }
  function head(g, J, look, s, seed, w, detail, tiny) {
    const up = J.headUp, fw = J.headFwd, rt = norm(cross(up, fw));
    const C0 = add(J.head, scl(up, 0.005 * s)), K = 1.28; // bigger head, set a little higher
    const at = (x, y, z) => add(C0, add(add(scl(rt, x * s * K), scl(up, y * s * K)), scl(fw, z * s * K)));
    // neck
    limb(g, [J.neck, at(0, -0.075, -0.012)], [0.048 * s, 0.042 * s], BLK, w, seed + 30);
    if (look.collar && !tiny) collar(g, J, s, w, seed, look);
    // expressions: eyes lid|wide|happy|narrow|shut, gaze [x,y], brows [lift a, lift b], knit (+ angry, - worried), mouth smile|smirk|open|o|frown|grin, jaw drop
    const E = Object.assign({ eyes: "lid", gaze: [0, 0], brows: [0, 0], knit: 0, mouth: null, jaw: 0 }, look.expr || {});
    const ringH = (y, rx, rz, dz = 0, k = 12) => { const o = []; for (let i = 0; i < k; i++) { const t = (i / k) * 6.283; o.push(at(cos(t) * rx, y, sin(t) * rz + dz)); } return o; };
    const hp = hullOf([ringH(0.1, 0.06, 0.07, -0.012), ringH(0.055, 0.097, 0.106, -0.006), ringH(0.0, 0.095, 0.11), ringH(-0.05, 0.08, 0.097, 0.01), [at(0, -0.108 - E.jaw, 0.058), at(0.032, -0.1 - E.jaw * 0.8, 0.05), at(-0.032, -0.1 - E.jaw * 0.8, 0.05)]]);
    if (!hp) return;
    outline(g, hp, BLK, w, seed + 31);
    if (tiny) { hat(g, at, up, look, s, seed, w, K); return; }
    const vis = (x, y, z) => { const p = at(x, y, z), n = norm(sub(p, C0)); return facing(p, n) > 0.05; };
    const R0 = P.pxAt(C0, 0.1 * s * K);
    // hair: a solid shape on a slightly inflated head shell, outlined, with pen strands combed down; ears go over it
    if (look.hair) hair(g, at, look, s, seed, w, detail);
    function mouth(y0) {
      if (!E.mouth) return false;
      const mw = { w: w * 0.85, color: BLK, seed: seed + 52 };
      const shape = (pts, fill) => { const q = pts.map(P.project); if (!q.every(Boolean)) return null; P.fill(g, chaikin(q, 2), fill); P.ink(g, chaikin(q, 2).concat([chaikin(q, 2)[0]]), { w: w * 0.85, color: BLK, seed: seed + 53, double: false, wob: 0.25, over: 0 }); return q; };
      const crease = (sd) => { if (detail && vis(0.05 * sd, y0, 0.088)) line(g, [at(0.054 * sd, y0 + 0.016, 0.085), at(0.05 * sd, y0 - 0.002, 0.088), at(0.042 * sd, y0 - 0.012, 0.092)], { w: w * 0.6, color: BLK, seed: seed + 54 + sd, alpha: 0.85 }); };
      if (E.mouth === "smile") { line(g, [at(-0.038, y0 + 0.004, 0.093), at(-0.015, y0 - 0.013, 0.102), at(0.015, y0 - 0.013, 0.102), at(0.038, y0 + 0.004, 0.093)], mw); crease(1); crease(-1); }
      else if (E.mouth === "smirk") { line(g, [at(-0.022, y0 - 0.005, 0.1), at(0.01, y0 - 0.007, 0.103), at(0.042, y0 + 0.013, 0.093)], mw); crease(1); }
      else if (E.mouth === "frown") line(g, [at(-0.032, y0 - 0.016, 0.097), at(0, y0 - 0.006, 0.104), at(0.032, y0 - 0.016, 0.097)], mw);
      else if (E.mouth === "o") { const c = []; for (let i = 0; i < 10; i++) { const t = (i / 10) * 6.283; c.push(at(cos(t) * 0.012, y0 - 0.01 + sin(t) * 0.014, 0.104)); } shape(c, "#3b2724"); }
      else if (E.mouth === "open" || E.mouth === "grin") {
        // a dark open mouth under the mustache, a band of teeth along the top
        const c = [], open = E.mouth === "open" ? 0.022 + E.jaw : 0.012, wd = E.mouth === "open" ? 0.026 : 0.034;
        for (let i = 0; i <= 12; i++) { const t = Math.PI * (i / 12); c.push(at(cos(t) * wd, y0 + 0.004 - sin(t) * open, 0.103 - sin(t) * 0.004)); }
        const q = shape(c, "#3b2724");
        if (q) { const tb = [at(-wd * 0.8, y0 + 0.003, 0.104), at(wd * 0.8, y0 + 0.003, 0.104), at(wd * 0.7, y0 - 0.005, 0.104), at(-wd * 0.7, y0 - 0.005, 0.104)].map(P.project); if (tb.every(Boolean)) P.fill(g, tb, WHITE); if (E.mouth === "open") { const tg = []; for (let i = 0; i <= 8; i++) { const t = Math.PI * (i / 8); tg.push(at(cos(t) * wd * 0.55, y0 + 0.004 - open * 0.98 + sin(t) * open * 0.4, 0.1)); } const tq = tg.map(P.project); if (tq.every(Boolean)) P.fill(g, tq, "#b5574a"); } }
      }
      return true;
    }
    // [showdown] fangs: two small white points under the upper lip
    const fangs = (y0) => { if (!look.fangs) return; for (const x of [0.014, -0.014]) { const q = [at(x - 0.006, y0 + 0.002, 0.105), at(x + 0.006, y0 + 0.002, 0.105), at(x, y0 - 0.02, 0.106)].map(P.project); if (q.every(Boolean)) { P.fill(g, q, WHITE); P.ink(g, q.concat([q[0]]), { w: w * 0.55, color: BLK, seed: seed + 57 + x * 100, double: false, wob: 0.1, over: 0 }); } } };
    const faceOn = facing(C0, fw);
    if (faceOn > 0.1) {
      // eyes: a heavy lid with the pupil tucked under it
      for (const x of [0.042, -0.042]) {
        if (!vis(x, 0.01, 0.092)) continue;
        const gx = E.gaze[0] * 0.011, gy = E.gaze[1] * 0.006, sd = seed + 40 + x * 100;
        const dot2 = (pt, rx, ry) => { const p = P.project(pt); if (p) { g.save(); g.fillStyle = look.eyeColor || BLK; g.beginPath(); g.ellipse(p[0], p[1], Math.max(1.3, R0 * rx), Math.max(1, R0 * ry), 0, 0, 6.28); g.fill(); g.restore(); } };
        if (E.eyes === "wide") {
          line(g, [at(x - 0.022, 0.018, 0.088), at(x, 0.031, 0.097), at(x + 0.022, 0.018, 0.088)], { w: w * 1.0, color: BLK, seed: sd });
          line(g, [at(x - 0.018, 0.0, 0.091), at(x, -0.007, 0.096), at(x + 0.018, 0.0, 0.091)], { w: w * 0.6, color: BLK, seed: sd + 1, alpha: 0.8 });
          dot2(at(x + gx, 0.012 + gy, 0.099), 0.075, 0.075);
        } else if (E.eyes === "happy") {
          line(g, [at(x - 0.021, 0.008, 0.089), at(x, 0.021, 0.097), at(x + 0.021, 0.008, 0.089)], { w: w * 1.15, color: BLK, seed: sd });
          if (detail) line(g, [at(x - 0.012, -0.012, 0.094), at(x + 0.012, -0.014, 0.095)], { w: w * 0.5, color: BLK, seed: sd + 2, alpha: 0.6 });
        } else if (E.eyes === "shut") {
          line(g, [at(x - 0.021, 0.013, 0.089), at(x, 0.006, 0.097), at(x + 0.021, 0.013, 0.089)], { w: w * 1.0, color: BLK, seed: sd });
        } else if (E.eyes === "narrow") {
          line(g, [at(x - 0.022, 0.011, 0.088), at(x, 0.014, 0.097), at(x + 0.022, 0.011, 0.088)], { w: w * 1.1, color: BLK, seed: sd });
          dot2(at(x + 0.002 + gx, 0.006, 0.098), 0.085, 0.045);
          line(g, [at(x - 0.016, 0.0, 0.092), at(x + 0.014, -0.001, 0.094)], { w: w * 0.6, color: BLK, seed: sd + 3, alpha: 0.8 });
        } else {
          line(g, [at(x - 0.022, 0.016, 0.088), at(x, 0.022, 0.097), at(x + 0.022, 0.016, 0.088)], { w: w * 1.0, color: BLK, seed: sd });
          dot2(at(x + 0.002 + gx, 0.008 + gy, 0.098), 0.09, 0.07);
          if (detail) { line(g, [at(x - 0.014, -0.006, 0.092), at(x + 0.012, -0.008, 0.094)], { w: w * 0.5, color: BLK, seed: seed + 42 + x * 100, alpha: 0.7 }); line(g, [at(x - 0.017, 0.029, 0.09), at(x + 0.002, 0.034, 0.096), at(x + 0.018, 0.029, 0.09)], { w: w * 0.5, color: BLK, seed: seed + 43 + x * 100, alpha: 0.45 }); }
        }
      }
      // brows
      for (const x of [1, -1]) {
        if (!vis(0.04 * x, 0.045, 0.09)) continue;
        const lift = look.mustache && x === 1 ? 0.012 : 0, frown = look.beard ? -0.01 : 0;
        const bl = (x === 1 ? E.brows[0] : E.brows[1]) * 0.012, kn = E.knit * 0.012;
        line(g, [at(0.064 * x, 0.042 + lift * 0.5 + bl * 0.8, 0.083), at(0.04 * x, 0.052 + lift + bl - kn * 0.3, 0.095), at(0.016 * x, 0.047 + lift * 0.4 + frown + bl * 0.9 - kn, 0.102)], { w: w * (look.mustache ? 1.55 : 1.15), color: BLK, seed: seed + 44 + x });
      }
      // nose: a little hook
      if (vis(0, -0.02, 0.11)) {
        line(g, [at(0.004, 0.012, 0.106), at(0.016, -0.03, 0.12), at(0.002, -0.042, 0.114)], { w: w * 0.9, color: BLK, seed: seed + 46 });
        if (detail) for (const x of [1, -1]) if (vis(0.016 * x, -0.038, 0.108)) line(g, [at(0.01 * x, -0.04, 0.111), at(0.019 * x, -0.037, 0.107), at(0.022 * x, -0.031, 0.104)], { w: w * 0.6, color: BLK, seed: seed + 47 + x * 3, alpha: 0.8 });
      }
      if (look.mustache) {
        for (const x of [1, -1]) {
          const tl = { smile: 0.012, grin: 0.016, open: 0.008, o: 0.002, frown: -0.008, smirk: x === 1 ? 0.022 : -0.002 }[E.mouth] || 0;
          const m = [at(0.003 * x, -0.045, 0.116), at(0.026 * x, -0.047 + tl * 0.2, 0.111), at(0.046 * x, -0.054 + tl * 0.6, 0.1), at(0.06 * x, -0.049 + tl, 0.088), at(0.066 * x, -0.055 + tl, 0.083), at(0.056 * x, -0.064 + tl * 0.9, 0.091), at(0.036 * x, -0.064 + tl * 0.5, 0.103), at(0.014 * x, -0.06 + tl * 0.2, 0.111), at(0.003 * x, -0.056, 0.115)].map(P.project);
          if (m.every(Boolean)) {
            outline(g, m, BLK, w * 0.85, seed + 47 + x, look.hairColor || "#3a2c23", 1);
            if (detail) for (let k = 0; k < 4; k++) { const u = 0.12 + k * 0.21; line(g, [at((0.008 + u * 0.038) * x, -0.048 - u * 0.003 + tl * u * 0.5, 0.113 - u * 0.014), at((0.012 + u * 0.044) * x, -0.059 + tl * u * 0.6, 0.11 - u * 0.016)], { w: w * 0.45, color: BLK, seed: seed + 150 + k * 2 + x, alpha: 0.8 }); }
          }
        }
        if (!mouth(-0.075)) line(g, [at(-0.018, -0.075, 0.1), at(0.006, -0.079, 0.103), at(0.026, -0.071, 0.098)], { w: w * 0.8, color: BLK, seed: seed + 49 });
      } else if (!look.beard && !mouth(-0.068)) line(g, [at(-0.02, -0.068, 0.1), at(0.02, -0.068, 0.1)], { w: w * 0.8, color: BLK, seed: seed + 50 });
      if (!look.mustache && !look.beard) fangs(-0.066);
      if (look.beard) {
        // stubble and a scruffy chin beard, in short strokes
        const rnd = P.rng(seed * 7 + 3);
        for (let i = 0; i < 26; i++) {
          const th = -0.4 + rnd() * (Math.PI + 0.8), yy = -0.05 - rnd() * 0.06;
          const x = cos(th) * 0.07, z = 0.04 + sin(th) * 0.06;
          if (z < 0.02 || !vis(x, yy, z)) continue;
          const c = P.project(at(x, yy, z)); if (!c) continue;
          const L = R0 * 0.12;
          P.ink(g, [[c[0], c[1]], [c[0] + L * 0.3, c[1] + L]], { w: w * 0.6, color: BLK, seed: seed + 60 + i, double: false, wob: 0.1, over: 0 });
        }
        if (!mouth(-0.066)) line(g, [at(-0.018, -0.066, 0.1), at(0.018, -0.066, 0.1)], { w: w * 0.8, color: BLK, seed: seed + 51 });
      }
    }
    // glasses: round rims, a bridge, arms back to the ears
    if (look.glasses && faceOn > 0.1 && !tiny) {
      const gc = look.glasses === true ? BLK : look.glasses;
      for (const x of [0.042, -0.042]) {
        if (!vis(x, 0.01, 0.1)) continue;
        const rim = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * 6.283; rim.push(at(x + cos(t) * 0.026, 0.01 + sin(t) * 0.019, 0.105 - Math.abs(cos(t)) * 0.006)); }
        const q = rim.map(P.project); if (q.every(Boolean)) P.ink(g, q.concat([q[0]]), { w: w * 0.85, color: gc, seed: seed + 170 + x * 100, double: false, wob: 0.2, over: 0, closed: true });
      }
      line(g, [at(0.016, 0.014, 0.109), at(0, 0.017, 0.111), at(-0.016, 0.014, 0.109)], { w: w * 0.8, color: gc, seed: seed + 173 });
      for (const x of [1, -1]) if (facing(at(0.1 * x, 0, 0), scl(rt, x)) > 0.05) line(g, [at(0.068 * x, 0.012, 0.097), at(0.098 * x, 0.012, 0.03), at(0.101 * x, 0.004, -0.012)], { w: w * 0.75, color: gc, seed: seed + 174 + x });
    }
    // ears
    for (const x of [1, -1]) {
      const n = scl(rt, x);
      if (facing(at(0.1 * x, 0, 0), n) < 0.3) continue;
      const e = []; for (let i = 0; i <= 7; i++) { const t = -1.9 + (i / 7) * 3.8; e.push(at(0.1 * x, -0.005 + sin(t) * 0.03, -0.005 + cos(t) * 0.02)); }
      const es = e.map(P.project); if (es.every(Boolean)) { P.fill(g, es, WHITE); P.ink(g, es, { w: w * 0.9, color: BLK, seed: seed + 58, double: false, wob: 0.3, over: 0 }); }
      if (detail) { const ei = []; for (let i = 0; i <= 5; i++) { const t = -1.2 + (i / 5) * 2.4; ei.push(at(0.101 * x, -0.004 + sin(t) * 0.017, -0.002 + cos(t) * 0.01)); } const eq = ei.map(P.project); if (eq.every(Boolean)) P.ink(g, eq, { w: w * 0.6, color: BLK, seed: seed + 59, double: false, wob: 0.3, over: 0, alpha: 0.8 }); }
    }
    hat(g, at, up, look, s, seed, w, K);
  }

  function hat(g, at, up, look, s, seed, w, K) {
    const camAbove = (pt) => dot(sub(P.cam.pos, pt), up) > 0;
    const ringAt = (y, r, rz, k = 22, droop = 0) => { const o = []; for (let i = 0; i < k; i++) { const t = (i / k) * 6.283; o.push(add(at(cos(t) * r, y, sin(t) * rz), scl(up, -droop * (1 + cos(t * 2)) * 0.5 * s))); } return o; };
    if (look.hat === "top") {
      const brim = ringAt(0.07, 0.15, 0.14), c0 = ringAt(0.075, 0.09, 0.084, 16), c1 = ringAt(0.27, 0.095, 0.088, 16);
      const crown = () => { const h = hullOf([c0, c1]); if (!h) return; outline(g, h, BLK, w, seed + 70, "#232120"); hatTrim(g, at, s, K, seed, w); if (camAbove(c1[0])) { const t = c1.map(P.project).filter(Boolean); if (t.length > 8) outline(g, t, BLK, w * 0.9, seed + 72, "#34312d"); } };
      const brimD = () => { const b = brim.map(P.project).filter(Boolean); if (b.length > 10) outline(g, b, BLK, w, seed + 73, "#232120"); };
      if (camAbove(at(0, 0.07, 0))) { brimD(); crown(); } else { crown(); brimD(); }
    } else if (look.hat === "bowler") {
      const brim = ringAt(0.065, 0.135, 0.13, 20), c0 = ringAt(0.07, 0.095, 0.095, 14), c1 = ringAt(0.16, 0.085, 0.085, 14), c2 = ringAt(0.2, 0.05, 0.05, 10);
      const crown = () => { const h = hullOf([c0, c1, c2]); if (h) outline(g, h, BLK, w, seed + 77, "#3a3632"); };
      const brimD = () => { const b = brim.map(P.project).filter(Boolean); if (b.length > 10) outline(g, b, BLK, w, seed + 78, "#3a3632"); };
      if (camAbove(at(0, 0.065, 0))) { brimD(); crown(); } else { crown(); brimD(); }
    } else if (look.hat === "cap") {
      const c0 = ringAt(0.06, 0.102, 0.105, 14), c1 = ringAt(0.12, 0.09, 0.095, 14);
      const peak = [at(-0.08, 0.06, 0.07), at(0.08, 0.06, 0.07), at(0.06, 0.055, 0.16), at(-0.06, 0.055, 0.16)].map(P.project);
      const h = hullOf([c0, c1]); if (h) outline(g, h, look.capColor || BLUE, w, seed + 79);
      if (peak.every(Boolean)) outline(g, peak, look.capColor || BLUE, w, seed + 80, WHITE, 1);
    } else if (look.hat === "deerstalker") {
      // [showdown] a tweed cap with a peak front and back and the ear flaps tied up on top
      const col = look.capColor || "#8a7a5c", c0 = ringAt(0.055, 0.104, 0.112, 16), c1 = ringAt(0.12, 0.094, 0.1, 16), c2 = ringAt(0.158, 0.05, 0.055, 10);
      const pk = (sg) => [at(-0.075, 0.062, 0.075 * sg), at(0.075, 0.062, 0.075 * sg), at(0.05, 0.04, 0.185 * sg), at(-0.05, 0.04, 0.185 * sg)].map(P.project);
      const fr = pk(1), bk = pk(-1), frontNear = facing(at(0, 0.06, 0.1), norm(sub(at(0, 0.06, 1), at(0, 0.06, 0)))) > 0;
      const peak = (q, sd) => { if (q.every(Boolean)) outline(g, q, BLK, w, seed + 80 + sd, P.css(P.mixc(P.hex(col), [0, 0, 0], 0.18)), 1); };
      peak(frontNear ? bk : fr, 1);
      const h = hullOf([c0, c1, c2]); if (h) outline(g, h, BLK, w, seed + 79, col);
      peak(frontNear ? fr : bk, 2);
      const bow = [at(-0.03, 0.166, 0), at(0, 0.158, 0.012), at(0.03, 0.166, 0), at(0.03, 0.15, 0), at(0, 0.156, -0.012), at(-0.03, 0.15, 0)].map(P.project);
      if (bow.every(Boolean)) outline(g, bow, BLK, w * 0.7, seed + 83, P.css(P.mixc(P.hex(col), [0, 0, 0], 0.3)), 0);
      for (const x of [1, -1]) line(g, [at(0.098 * x, 0.062, 0.02), at(0.09 * x, 0.115, 0.01), at(0.045 * x, 0.152, 0)], { w: w * 0.6, color: BLK, seed: seed + 84 + x, alpha: 0.7 });
    } else if (look.hat === "floppy") {
      const brim = ringAt(0.06, 0.19, 0.18, 22, 0.02), c0 = ringAt(0.065, 0.1, 0.1, 14), c1 = ringAt(0.15, 0.078, 0.078, 14);
      const crown = () => { const h = hullOf([c0, c1]); if (!h) return; outline(g, h, BROWN, w, seed + 74); const band = ringAt(0.08, 0.1, 0.1, 14).map(P.project).filter(Boolean); if (band.length > 7) P.ink(g, band.slice(0, 8), { w: w * 0.9, color: BROWN, seed: seed + 75, double: false }); };
      const brimD = () => { const b = brim.map(P.project).filter(Boolean); if (b.length > 10) outline(g, b, BROWN, w, seed + 76); };
      if (camAbove(at(0, 0.06, 0))) { brimD(); crown(); } else { crown(); brimD(); }
    }
  }

  function tool(g, kind, J, s, seed, w, gold) {
    const A = J.toolA, B = J.toolB, d = J.toolDir;
    const hs = P.projectLine([A, B])[0];
    if (hs) { const r = Math.max(1.6, P.pxAt(B, 0.024)); P.ink(g, hs, { w: Math.max(w * 1.6, r), color: BROWN, seed: seed + 80, double: false, wob: 0.25 }); }
    if (kind === "pick") {
      // a curved iron head: a crescent, thick in the middle, pointed at both ends
      const side = norm(cross(d, J.right)), top = [], bot = [];
      for (let k = 0; k <= 8; k++) { const u = k / 8 * 2 - 1, bend = -0.08 * (u * u) * s, th = 0.035 * s * (1 - u * u * 0.85); top.push(add(B, add(scl(side, u * 0.26 * s), scl(d, bend + th)))); bot.push(add(B, add(scl(side, u * 0.26 * s), scl(d, bend - th)))); }
      const hp = P.projectPoly(top.concat(bot.reverse()));
      if (hp) { P.fill(g, hp, gold ? WHITE : "#2b2926"); if (gold) P.wash(g, hp, { seed: seed + 84, offset: 1 }); P.ink(g, hp.concat([hp[0]]), { w, color: BLK, seed: seed + 81, closed: true, over: 0, double: false, wob: 0.2 }); }    } else {
      const side = J.right;
      const blade = [add(B, scl(side, 0.11 * s)), add(add(B, scl(d, 0.25 * s)), scl(side, 0.1 * s)), add(B, scl(d, 0.34 * s)), add(add(B, scl(d, 0.25 * s)), scl(side, -0.1 * s)), add(B, scl(side, -0.11 * s))];
      const bs = P.projectPoly(blade);
      if (bs) { P.fill(g, bs, WHITE); if (gold) P.wash(g, bs, { seed: seed + 82 }); P.ink(g, bs.concat([bs[0]]), { w, color: BLK, seed: seed + 83, closed: true, over: 0, double: false, wob: 0.3 }); }
    }
  }
  R.limbFine = limb; R.handFine = hand; R.outlineFine = outline; R.chaikin = chaikin;
  const toolInk = R.drawTool;
  R.drawTool = (g, kind, J, s, seed, w, gold) => (P.STYLE.name === "fine" ? tool(g, kind, J, s, seed, Math.min(w, 2.6), gold) : toolInk(g, kind, J, s, seed, w, gold));
})();
