// Figures: a 3D skeleton posed by a few angles (or hand targets), drawn as inked volumes.
// Body frame: +x is the figure's left, +y up, +z the way it faces. Units are metres.
(function () {
  const P = PEN, { add, sub, scl, dot, cross, norm, len, clamp, mix } = PEN;
  const RIG = (window.RIG = {});
  const cos = Math.cos, sin = Math.sin;
  const rx = (v, a) => [v[0], v[1] * cos(a) - v[2] * sin(a), v[1] * sin(a) + v[2] * cos(a)];
  const ry = (v, a) => [v[0] * cos(a) + v[2] * sin(a), v[1], -v[0] * sin(a) + v[2] * cos(a)];
  const rz = (v, a) => [v[0] * cos(a) - v[1] * sin(a), v[0] * sin(a) + v[1] * cos(a), v[2]];
  RIG.rx = rx; RIG.ry = ry; RIG.rz = rz;

  function ik2(S, T, a, b, pole) {
    const d = sub(T, S); let L = len(d);
    L = clamp(L, 0.02, a + b - 1e-3);
    const dn = norm(d), x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    let pp = sub(pole, scl(dn, dot(pole, dn))); pp = norm(pp);
    return [add(S, add(scl(dn, x), scl(pp, h))), add(S, scl(dn, L))];
  }

  // ---------- poses ----------
  const BASE = { lean: 0, twist: 0, headYaw: 0, headPitch: 0, bob: 0, hipTilt: 0,
    sL: 0.05, sR: 0.05, aL: 0.12, aR: 0.12, eL: 0.2, eR: 0.2,
    hipL: 0, hipR: 0, kL: 0.04, kR: 0.04, wide: 0 };
  // standing at ease: weight on the left leg, right knee soft, hips and shoulders tilted against each other
  const EASE = { hipTilt: 0.6, hipR: 0.08, kR: 0.2, kL: 0.03, sL: 0.08, sR: 0.12, eL: 0.28, eR: 0.38, aL: 0.1, aR: 0.14, twist: 0.04, headPitch: 0.04 };
  RIG.stand = (o = {}) => Object.assign({}, BASE, EASE, o);
  RIG.mixPose = (A, B, u) => { const o = {}; for (const k in A) o[k] = typeof A[k] === "number" && typeof B[k] === "number" ? mix(A[k], B[k], u) : u < 0.5 ? A[k] : B[k]; for (const k in B) if (!(k in o)) o[k] = B[k]; return o; };
  RIG.walk = (ph, o = {}) => Object.assign({}, BASE, {
    hipL: 0.42 * sin(ph), hipR: -0.42 * sin(ph),
    kL: 0.1 + 0.65 * Math.max(0, sin(ph + 2.2)), kR: 0.1 + 0.65 * Math.max(0, sin(ph + 2.2 + Math.PI)),
    sL: -0.38 * sin(ph), sR: 0.38 * sin(ph), eL: 0.3, eR: 0.3, aL: 0.1, aR: 0.1,
    bob: 0.025 * Math.abs(cos(ph)) - 0.02, lean: 0.06,
  }, o);
  RIG.run = (ph, o = {}) => Object.assign({}, BASE, {
    hipL: 0.85 * sin(ph) + 0.15, hipR: -0.85 * sin(ph) + 0.15,
    kL: 0.35 + 1.2 * Math.max(0, sin(ph + 2.0)), kR: 0.35 + 1.2 * Math.max(0, sin(ph + 2.0 + Math.PI)),
    sL: -0.9 * sin(ph), sR: 0.9 * sin(ph), eL: 1.5, eR: 1.5, aL: 0.15, aR: 0.15,
    bob: 0.06 * Math.abs(sin(ph)) - 0.05, lean: 0.32,
  }, o);
  // a pick swing: u runs 0..1 over one swing; returns the pose plus the grip and the pick's direction
  RIG.dig = (u, o = {}) => {
    u = ((u % 1) + 1) % 1;
    let th; // angle of the hands around the shoulders, up from forward-horizontal
    if (u < 0.55) th = mix(-0.95, 2.15, P.ease.io(u / 0.55));
    else if (u < 0.68) th = mix(2.15, -0.95, P.ease.in((u - 0.55) / 0.13));
    else th = -0.95 + 0.06 * sin((u - 0.68) * 30) * (1 - (u - 0.68) / 0.32);
    const lean = mix(0.5, -0.12, clamp((th + 0.95) / 3.1));
    return Object.assign({}, BASE, { lean, hipL: 0.32, hipR: -0.22, kL: 0.35, kR: 0.15, wide: 0.06,
      tool: "pick", th, grip: true }, o);
  };
  RIG.shovel = (u, o = {}) => {
    u = ((u % 1) + 1) % 1;
    const th = u < 0.5 ? mix(0.2, -0.9, P.ease.io(u / 0.5)) : mix(-0.9, 0.2, P.ease.io((u - 0.5) / 0.5));
    return Object.assign({}, BASE, { lean: mix(0.15, 0.6, clamp((0.2 - th) / 1.1)), hipL: 0.35, hipR: -0.25, kL: 0.5, kR: 0.25, wide: 0.05, tool: "shovel", th, grip: true }, o);
  };

  // sitting on the ground, knees up, arms on knees
  RIG.sit = (o = {}) => Object.assign({}, BASE, { bob: -0.78, hipL: 1.35, hipR: 1.25, kL: 1.9, kR: 1.75, lean: 0.35, sL: 0.75, sR: 0.7, eL: 0.6, eR: 0.7, headPitch: 0.45 }, o);
  // worn out: hunched, head down, arms hanging
  RIG.slump = (ph = 0, o = {}) => Object.assign(RIG.walk(ph, {}), { lean: 0.45, headPitch: 0.5, sL: 0.15 + 0.12 * Math.sin(ph), sR: 0.15 - 0.12 * Math.sin(ph), eL: 0.1, eR: 0.1, hipL: 0.22 * Math.sin(ph), hipR: -0.22 * Math.sin(ph) }, o);
  // shouting, one arm thrown up
  RIG.shout = (o = {}) => Object.assign({}, BASE, { lean: -0.15, headPitch: -0.55, sR: 2.9, aR: 0.25, eR: 0.15, sL: 0.5, aL: 0.4, eL: 1.1, hipL: 0.15, hipR: -0.2, kL: 0.15 }, o);

  // ---------- skeleton ----------
  function solve(F) {
    const p = F.pose, s = F.scale || 1, face = F.face || 0;
    const L = {};
    L.pelvis = [0, 0.95 + (p.bob || 0), 0];
    const sp = (v) => ry(rx(v, p.lean), p.twist);
    L.chest = add(L.pelvis, sp([0, 0.32, 0]));
    L.neck = add(L.pelvis, sp([0, 0.5, 0]));
    L.head = add(L.neck, sp(rx([0, 0.13, 0.01], p.headPitch)));
    const tilt = p.hipTilt || 0;
    L.shL = add(L.pelvis, sp([0.168, 0.425 - tilt * 0.018, -0.01]));
    L.shR = add(L.pelvis, sp([-0.168, 0.425 + tilt * 0.018, -0.01]));
    const UA = 0.3, LA = 0.28;
    if (p.grip) {
      // both hands on a handle that swings around the shoulders
      const mid = add(L.pelvis, sp([0, 0.46, 0]));
      const R = p.tool === "shovel" ? 0.5 : 0.56, th = p.th;
      const G = add(mid, [0, sin(th) * R, cos(th) * R + 0.05]);
      const dir = p.tool === "shovel" ? norm([0, sin(th - 0.9), cos(th - 0.9)]) : norm([0, sin(th - 0.55), cos(th - 0.55)]);
      const B = sub(G, scl(dir, 0.26));
      [L.elL, L.hL] = ik2(L.shL, add(G, [0.03, 0, 0]), UA, LA, [0.9, -0.5, -0.4]);
      [L.elR, L.hR] = ik2(L.shR, add(B, [-0.03, 0, 0]), UA, LA, [-0.9, -0.5, -0.4]);
      L.toolA = sub(G, scl(dir, 0.42));
      L.toolB = add(G, scl(dir, p.tool === "shovel" ? 0.62 : 0.5));
      L.toolDir = dir;
    } else if (p.hL || p.hR) {
      if (p.hL) [L.elL, L.hL] = ik2(L.shL, p.hL, UA, LA, p.poleL || [0.6, -0.6, -0.5]);
      if (p.hR) [L.elR, L.hR] = ik2(L.shR, p.hR, UA, LA, p.poleR || [-0.6, -0.6, -0.5]);
    }
    const arm = (side) => {
      const k = side === "L" ? 1 : -1, sw = p["s" + side], ab = p["a" + side] * k, el = p["e" + side];
      const d1 = sp(rx(rz([0, -1, 0], ab), -sw)), d2 = sp(rx(rz([0, -1, 0], ab), -(sw + el)));
      L["el" + side] = add(L["sh" + side], scl(d1, UA));
      L["h" + side] = add(L["el" + side], scl(d2, LA));
    };
    if (!L.hL) arm("L");
    if (!L.hR) arm("R");
    const leg = (side) => {
      const k = side === "L" ? 1 : -1, hp = p["hip" + side], kn = p["k" + side];
      const hip = add(L.pelvis, [0.095 * k + (p.wide || 0) * k, -0.04 + (p.hipTilt || 0) * 0.03 * k, 0]);
      const d1 = rx([0, -1, 0], -hp), d2 = rx([0, -1, 0], -(hp - kn));
      L["hip" + side] = hip;
      L["kn" + side] = add(hip, scl(d1, 0.45));
      L["an" + side] = add(L["kn" + side], scl(d2, 0.43));
      L["toe" + side] = add(L["an" + side], rx([0, -0.04, 0.16], -(hp - kn) * 0.3));
    };
    leg("L"); leg("R");
    // the head's facing, for the face
    L.headFwd = sp(rx(ry([0, 0, 1], p.headYaw || 0), p.headPitch || 0));
    L.headUp = sp(rx([0, 1, 0], p.headPitch || 0));
    const Wd = {};
    const toW = (v) => add(F.pos, ry(scl(v, s), face));
    const dirW = (v) => ry(v, face);
    for (const k in L) Wd[k] = /Fwd|Up|Dir/.test(k) ? dirW(L[k]) : toW(L[k]);
    Wd.spineUp = dirW(sp([0, 1, 0]));
    Wd.spineFwd = dirW(sp([0, 0, 1]));
    Wd.right = dirW([1, 0, 0]);
    Wd.fwd = dirW([0, 0, 1]);
    return Wd;
  }
  RIG.solve = solve;

  // ---------- drawing pieces ----------
  // a limb: a tube between two joints, filled with paper (or tone) and outlined
  function tube(g, a, b, ra, rb, o) {
    const A = P.project(a), B = P.project(b);
    if (!A || !B) return;
    const pa = (ra * P.cam.foc) / A[2], pb = (rb * P.cam.foc) / B[2];
    let dx = B[0] - A[0], dy = B[1] - A[1]; const d = Math.hypot(dx, dy);
    const pts = [];
    if (d < 0.5) { for (let i = 0; i < 14; i++) { const t = (i / 14) * 6.283; pts.push([A[0] + cos(t) * pa, A[1] + sin(t) * pa]); } }
    else {
      dx /= d; dy /= d; const nx = -dy, ny = dx;
      const base = Math.atan2(ny, nx);
      for (let i = 0; i <= 6; i++) { const t = base + (i / 6) * Math.PI; pts.push([B[0] + cos(t) * pb, B[1] + sin(t) * pb]); }
      for (let i = 0; i <= 6; i++) { const t = base + Math.PI + (i / 6) * Math.PI; pts.push([A[0] + cos(t) * pa, A[1] + sin(t) * pa]); }
    }
    P.fill(g, pts, o.fill || P.PAPER);
    if (o.hatch) P.hatch(g, pts, Object.assign({ seed: o.seed }, o.hatch, { gap: o.hatch.gap * o.k }));
    if (o.wash) P.wash(g, pts, { seed: o.seed });
    P.ink(g, pts.concat([pts[0]]), { w: o.w, seed: o.seed, closed: true, over: 0 });
    return pts;
  }

  // a whole limb as one outline: joints in 3D, a radius at each, round ends only at the two tips
  function chain(g, pts3, radii, o) {
    const S = pts3.map((q) => P.project(q));
    if (S.some((q) => !q)) return;
    const rr = S.map((q, i) => (radii[i] * P.cam.foc) / q[2]);
    const n = S.length, left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      left.push([S[i][0] - ty * rr[i], S[i][1] + tx * rr[i]]);
      right.push([S[i][0] + ty * rr[i], S[i][1] - tx * rr[i]]);
    }
    const cap = (c, r, from, to) => { const out = []; for (let k = 1; k < 6; k++) { const t = from + ((to - from) * k) / 6; out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]); } return out; };
    const dirEnd = Math.atan2(S[n - 1][1] - S[n - 2][1], S[n - 1][0] - S[n - 2][0]);
    const dirStart = Math.atan2(S[0][1] - S[1][1], S[0][0] - S[1][0]);
    const pts = left.concat(cap(S[n - 1], rr[n - 1], dirEnd + Math.PI / 2, dirEnd - Math.PI / 2)).concat(right.slice().reverse()).concat(cap(S[0], rr[0], dirStart + Math.PI / 2, dirStart - Math.PI / 2));
    P.fill(g, pts, o.fill || P.PAPER);
    if (o.hatch) P.hatch(g, pts, Object.assign({ seed: o.seed }, o.hatch, { gap: o.hatch.gap * o.k }));
    P.ink(g, pts.concat([pts[0]]), { w: o.w, seed: o.seed, closed: true, over: 0 });
    // a crease at the bend
    if (n === 3 && o.crease !== false && rr[1] > 6) {
      const m = S[1], d = Math.atan2(S[2][1] - S[0][1], S[2][0] - S[0][0]) + Math.PI / 2;
      P.ink(g, [[m[0] + Math.cos(d) * rr[1] * 0.2, m[1] + Math.sin(d) * rr[1] * 0.2], [m[0] + Math.cos(d) * rr[1] * 0.85, m[1] + Math.sin(d) * rr[1] * 0.85]], { w: o.w * 0.6, seed: o.seed + 2 });
    }
    return pts;
  }

  // a volume: the hull of several 3D rings
  function hullOf(rings) {
    const s = [];
    for (const r of rings) for (const p of r) { const q = P.project(p); if (q) s.push(q); }
    return s.length >= 3 ? P.hull(s) : null;
  }
  // ring in the body's frame (centre c, half-width rx, half-depth rz, frame vectors)
  function bodyRing(c, rxx, rzz, right, fwd, k = 12) {
    const out = [];
    for (let i = 0; i < k; i++) { const t = (i / k) * 6.283; out.push(add(c, add(scl(right, cos(t) * rxx), scl(fwd, sin(t) * rzz)))); }
    return out;
  }
  const facing = (pt, n) => dot(n, norm(sub(P.cam.pos, pt)));

  // ---------- the cast ----------
  const LOOK = {
    brannan: { coat: true, hat: "top", gloves: true, sideburns: true, coatHatch: { gap: 5.5, angle: -1.0, cross: true, alpha: 0.75 }, trousers: { gap: 6, angle: 0.9, alpha: 0.6 }, chain: true },
    miner: { coat: false, hat: "floppy", gloves: false, beard: true, coatHatch: null, shirtHatch: { gap: 9, angle: -0.8, alpha: 0.45 }, trousers: { gap: 6.5, angle: 0.9, alpha: 0.7 }, braces: true },
  };
  RIG.LOOK = LOOK;

  RIG.draw = function (g, F) {
    const J = solve(F), look = Object.assign({}, LOOK[F.kind || "miner"], F.look || {}), s = F.scale || 1, seed = F.seed || 1;
    const hpx = P.pxAt(F.pos, 1.8 * s);
    if (hpx < 3) return J;
    const detail = hpx > 70, tiny = hpx < 26;
    const zf = P.depth(J.chest);
    const lw = clamp((F.w ?? 3.0) * Math.pow(hpx / 900, 0.35) * 1.35, 0.7, 5.5);
    const k = clamp(Math.sqrt(hpx / 700), 0.35, 1.4); // hatch spacing scale
    const parts = [];
    const add_ = (pt, fn) => parts.push({ z: P.depth(pt), fn });

    // ground shadow: a few hatch strokes under the feet
    if (F.shadow !== false && !tiny) {
      const c = [F.pos[0], F.pos[1] + 0.005, F.pos[2]];
      const ring = P.projectPoly(P.ring(add(c, scl(J.fwd, 0.04)), 0.34 * s, [0, 1, 0], 14, 0.2 * s));
      if (ring) P.hatch(g, ring, { gap: 4.5 * k, angle: -0.5, alpha: 0.45, seed: seed + 50, w: Math.max(0.8, lw * 0.4) });
    }
    const tone = { gap: 6, angle: 0.9, alpha: 0.6 };
    // legs and boots
    for (const sd of ["L", "R"]) {
      add_(J["kn" + sd], () => chain(g, [J["hip" + sd], J["kn" + sd], J["an" + sd]], [0.085 * s, 0.068 * s, 0.05 * s], { w: lw, seed: seed + (sd === "L" ? 1 : 2), hatch: tiny ? null : look.trousers || tone, k }));
      add_(J["toe" + sd], () => {
        const an = J["an" + sd], fw = norm(sub(J["toe" + sd], an)), up = [0, 1, 0], sd3 = J.right, pts = [];
        for (const w of [0.048, -0.048]) {
          const side = scl(sd3, w * s);
          pts.push(add(add(an, side), scl(up, 0.07 * s)), add(add(an, side), add(scl(fw, -0.07 * s), scl(up, -0.05 * s))),
            add(add(an, scl(side, 0.9)), add(scl(fw, 0.17 * s), scl(up, -0.055 * s))), add(add(an, scl(side, 0.7)), add(scl(fw, 0.19 * s), scl(up, -0.01 * s))));
        }
        const h = hullOf([pts]);
        if (!h) return;
        P.fill(g, h, "#2a251e");
        P.ink(g, h.concat([h[0]]), { w: lw, seed: seed + 5, closed: true, over: 0 });
      });
    }
    // torso / coat
    add_(J.chest, () => {
      const R = J.right, Fw = J.spineFwd, Up = J.spineUp, pel = P.lerp3(J.hipL, J.hipR, 0.5);
      const rings = [];
      const hipFwd = J.fwd;
      if (look.coat) rings.push(bodyRing(add(pel, [0, -0.42 * s, 0]), 0.24 * s, 0.15 * s, R, hipFwd));
      rings.push(bodyRing(add(pel, [0, -0.04 * s, 0]), 0.17 * s, 0.11 * s, R, hipFwd));
      rings.push(bodyRing(add(J.chest, scl(Up, -0.05 * s)), 0.18 * s, 0.12 * s, R, Fw));
      rings.push(bodyRing(add(J.neck, scl(Up, -0.06 * s)), 0.2 * s, 0.1 * s, R, Fw));
      const h = hullOf(rings);
      if (!h) return;
      P.fill(g, h, P.PAPER);
      if (!tiny) {
        if (look.coatHatch) P.hatch(g, h, Object.assign({ seed: seed + 7 }, look.coatHatch, { gap: look.coatHatch.gap * k }));
        else if (look.shirtHatch) P.hatch(g, h, Object.assign({ seed: seed + 7 }, look.shirtHatch, { gap: look.shirtHatch.gap * k }));
      }
      P.ink(g, h.concat([h[0]]), { w: lw, seed: seed + 8, closed: true, over: 0 });
      if (!detail) return;
      const front = facing(J.chest, Fw) > 0.05;
      const surf = (u, side = 0, depth = 0.12) => add(add(P.lerp3(J.neck, pel, u), scl(Fw, depth * s * (front ? 1 : -1))), scl(R, side * s));
      if (look.coat && front) {
        // the coat opens over a pale waistcoat and shirt
        const V = [surf(0.02, 0.07), surf(0.32, 0.0, 0.13), surf(0.02, -0.07)].map(P.project);
        if (V.every(Boolean)) { P.fill(g, V, P.PAPER); P.ink(g, V, { w: lw * 0.8, seed: seed + 9 }); }
        const hem = add(pel, [0, -0.42 * s, 0]);
        const line = [surf(0.32, 0, 0.13), add(hem, scl(Fw, 0.15 * s))].map(P.project);
        if (line.every(Boolean)) P.ink(g, line, { w: lw * 0.8, seed: seed + 10 });
        // lapels
        for (const sd of [1, -1]) {
          const lp = [surf(0.0, 0.1 * sd), surf(0.18, 0.12 * sd, 0.125), surf(0.32, 0.01 * sd, 0.13)].map(P.project);
          if (lp.every(Boolean)) P.ink(g, lp, { w: lw * 0.7, seed: seed + 11 + sd });
        }
        // buttons on the waistcoat
        for (let i = 0; i < 3; i++) { const b = P.project(surf(0.12 + i * 0.07, 0, 0.125)); if (b) { g.save(); g.fillStyle = P.INK; g.beginPath(); g.arc(b[0], b[1], Math.max(1.2, lw * 0.55), 0, 6.28); g.fill(); g.restore(); } }
        if (look.chain) {
          const ch = [surf(0.2, 0.0, 0.13), surf(0.26, 0.05, 0.13), surf(0.24, 0.1, 0.12)].map(P.project);
          if (ch.every(Boolean)) { P.ink(g, ch, { w: lw * 1.6, color: P.GOLD, seed: seed + 13, double: false }); P.ink(g, ch, { w: lw * 0.45, seed: seed + 14 }); }
        }
      } else if (look.coat) {
        const seam = [surf(0.05, 0, 0.11), add(add(pel, [0, -0.42 * s, 0]), scl(Fw, -0.15 * s))].map(P.project);
        if (seam.every(Boolean)) P.ink(g, seam, { w: lw * 0.7, seed: seed + 15 });
      }
      if (look.braces) {
        for (const sd of [1, -1]) {
          const br = [surf(0.0, 0.1 * sd, 0.1), surf(0.5, 0.08 * sd, 0.12), surf(0.95, 0.09 * sd, 0.12)].map(P.project);
          if (br.every(Boolean)) P.ink(g, br, { w: lw * 0.9, seed: seed + 16 + sd });
        }
      }
    });
    // arms and hands
    const sleeve = look.coat ? look.coatHatch : look.shirtHatch;
    for (const sd of ["L", "R"]) {
      add_(J["el" + sd], () => chain(g, [J["sh" + sd], J["el" + sd], J["h" + sd]], [0.068 * s, 0.056 * s, 0.045 * s], { w: lw, seed: seed + 20 + (sd === "L" ? 0 : 1), hatch: tiny ? null : sleeve, k }));
      add_(add(J["h" + sd], scl(norm(sub(J["h" + sd], J["el" + sd])), 0.03 * s)), () => {
        const tip = add(J["h" + sd], scl(norm(sub(J["h" + sd], J["el" + sd])), 0.085 * s));
        tube(g, add(J["h" + sd], scl(norm(sub(J["h" + sd], J["el" + sd])), 0.01 * s)), tip, 0.048 * s, 0.04 * s, { w: lw, seed: seed + 24, k, fill: look.gloves ? "#fbf6ec" : P.PAPER });
      });
    }
    // head
    add_(J.head, () => drawHead(g, J, look, s, seed, lw, detail, tiny, k));
    // tool
    if (F.pose.tool && J.toolA) {
      add_(P.lerp3(J.toolA, J.toolB, 0.6), () => drawTool(g, F.pose.tool, J, s, seed, lw, F.toolGold));
    }
    if (F.extra) add_(J.hL, () => F.extra(g, J, lw));
    parts.sort((a, b) => b.z - a.z);
    for (const p of parts) p.fn();
    return J;
  };

  function drawHead(g, J, look, s, seed, lw, detail, tiny, k) {
    const C = P.project(J.head);
    if (!C) return;
    const r = (0.105 * s * P.cam.foc) / C[2];
    // the neck
    tube(g, J.neck, add(J.head, scl(J.headUp, -0.06 * s)), 0.05 * s, 0.05 * s, { w: lw, seed: seed + 30, k });
    // skull: a slightly long oval, tilted with the head
    const H3 = (x, y, z) => add(J.head, add(add(scl(J.right, x * s), scl(J.headUp, y * s)), scl(J.headFwd, z * s)));
    const ringH = (y, rxx, rzz, dz = 0, k = 12) => { const o = []; for (let i = 0; i < k; i++) { const t = (i / k) * 6.283; o.push(H3(cos(t) * rxx, y, sin(t) * rzz + dz)); } return o; };
    const headRings = [ringH(0.1, 0.06, 0.07, -0.01), ringH(0.055, 0.098, 0.108, -0.005), ringH(0.0, 0.096, 0.112), ringH(-0.055, 0.08, 0.098, 0.01), [H3(0, -0.112, 0.055), H3(0.03, -0.105, 0.05), H3(-0.03, -0.105, 0.05)]];
    const pts = hullOf(headRings);
    if (!pts) return;
    P.fill(g, pts, P.PAPER);
    P.ink(g, pts.concat([pts[0]]), { w: lw, seed: seed + 31, closed: true, over: 0 });
    if (!tiny) {
      const vis = facing(J.head, J.headFwd);
      const at = (x, y, z) => add(J.head, add(add(scl(J.right, x * s), scl(J.headUp, y * s)), scl(J.headFwd, z * s)));
      const dotAt = (p, rr) => { const q = P.project(p); if (!q) return; g.save(); g.fillStyle = P.INK; g.beginPath(); g.ellipse(q[0], q[1], rr, rr * 1.25, 0, 0, 6.28); g.fill(); g.restore(); };
      const showSide = (x) => facing(at(x, 0, 0.05), norm(add(scl(J.right, x), scl(J.headFwd, 0.6)))) > 0;
      if (look.beard && vis > -0.3) {
        const bpts = []; for (let i = 0; i < 12; i++) { const t = (i / 12) * 6.283; bpts.push(at(cos(t) * 0.075, -0.06 + sin(t) * 0.055, 0.06)); }
        const bs = bpts.map(P.project).filter(Boolean);
        if (bs.length > 6) { const h = P.hull(bs); P.fill(g, h, P.PAPER); P.hatch(g, h, { gap: 3.2 * k + 1, angle: 1.3, alpha: 0.85, seed: seed + 33, w: Math.max(0.8, lw * 0.45) }); P.ink(g, h.concat([h[0]]), { w: lw * 0.8, seed: seed + 34, closed: true, over: 0 }); }
      }
      if (look.sideburns) {
        for (const x of [1, -1]) {
          if (!showSide(x)) continue;
          const sb = [at(0.085 * x, 0.03, 0.02), at(0.098 * x, -0.04, 0.03), at(0.07 * x, -0.07, 0.06), at(0.06 * x, 0.0, 0.07)].map(P.project).filter(Boolean);
          if (sb.length === 4) P.hatch(g, sb, { gap: 2.6 * k + 1, angle: 1.4, alpha: 0.9, seed: seed + 35 + x, w: Math.max(0.8, lw * 0.5), cross: true });
        }
      }
      if (vis > 0.05 && detail) {
        const er = Math.max(1.6, r * 0.1);
        for (const x of [0.04, -0.04]) {
          if (facing(at(x, 0.01, 0.09), norm(add(scl(J.headFwd, 1), scl(J.right, x * 6)))) <= 0.05) continue;
          dotAt(at(x, 0.012, 0.097), er);
          const lid = [at(x - 0.018, 0.022, 0.092), at(x, 0.03, 0.1), at(x + 0.018, 0.022, 0.092)].map(P.project);
          if (lid.every(Boolean)) P.ink(g, lid, { w: lw * 0.55, seed: seed + 36 + x * 100 });
        }
        // brows: Brannan's left one raised, a sly look; a miner's pulled down hard
        for (const x of [1, -1]) {
          const lift = look.sideburns && x === 1 ? 0.014 : 0, frown = look.beard ? -0.008 : 0;
          const b = [at(0.064 * x, 0.042 + lift * 0.4, 0.086), at(0.04 * x, 0.05 + lift, 0.097), at(0.016 * x, 0.046 + lift * 0.6 + frown, 0.103)].map(P.project);
          if (b.every(Boolean) && facing(at(0.04 * x, 0.04, 0.09), J.headFwd) > 0.05) P.ink(g, b, { w: lw * 1.05, seed: seed + 37 + x });
        }
        if (look.sideburns) {
          for (const x of [1, -1]) {
            const m = [at(0.004 * x, -0.036, 0.113), at(0.035 * x, -0.046, 0.104), at(0.062 * x, -0.068, 0.084)].map(P.project);
            if (m.every(Boolean) && facing(at(0.03 * x, -0.04, 0.1), J.headFwd) > 0) P.ink(g, m, { w: lw * 1.7, seed: seed + 42 + x, double: false });
          }
        }
        const nose = [at(0, 0.02, 0.105), at(0.004, -0.02, 0.125), at(-0.012, -0.03, 0.108)].map(P.project);
        if (nose.every(Boolean)) P.ink(g, nose, { w: lw * 0.7, seed: seed + 39 });
        if (!look.beard) {
          const m = look.sideburns ? [at(-0.022, -0.066, 0.097), at(0.006, -0.07, 0.101), at(0.03, -0.06, 0.094)] : [at(-0.025, -0.055, 0.095), at(0.025, -0.055, 0.095)];
          const ms = m.map(P.project);
          if (ms.every(Boolean)) P.ink(g, ms, { w: lw * 0.7, seed: seed + 40 });
        }
      }
      // an ear when we see the side of the head
      for (const x of [1, -1]) {
        const n = scl(J.right, x);
        if (facing(at(0.1 * x, 0, 0), n) > 0.35 && detail) {
          const e = []; for (let i = 0; i < 8; i++) { const t = (i / 8) * 6.283; e.push(at(0.102 * x, -0.005 + sin(t) * 0.028, cos(t) * 0.018)); }
          const es = e.map(P.project).filter(Boolean);
          if (es.length > 5) { P.fill(g, es, P.PAPER); P.ink(g, es.concat([es[0]]), { w: lw * 0.7, seed: seed + 41, closed: true, over: 0 }); }
        }
      }
    }
    drawHat(g, J, look, s, seed, lw, k);
  }

  function drawHat(g, J, look, s, seed, lw, k) {
    const up = J.headUp, H0 = add(J.head, scl(up, 0.07 * s));
    const camAbove = (pt) => dot(sub(P.cam.pos, pt), up) > 0;
    if (look.hat === "top") {
      const brim = P.ring(H0, 0.16 * s, up, 22, 0.145 * s);
      const c0 = P.ring(add(H0, scl(up, 0.005 * s)), 0.095 * s, up, 16, 0.088 * s), c1 = P.ring(add(H0, scl(up, 0.24 * s)), 0.1 * s, up, 16, 0.093 * s);
      const crown = () => {
        const h = hullOf([c0, c1]); if (!h) return;
        P.fill(g, h, "#2b2620");
        P.hatch(g, h, { gap: 3.4 * k + 0.8, angle: 1.45, alpha: 0.6, seed: seed + 50, color: "#000", w: Math.max(0.7, lw * 0.4) });
        // a highlight band of bare paper down one side
        P.ink(g, h.concat([h[0]]), { w: lw, seed: seed + 51, closed: true, over: 0 });
        if (camAbove(c1[0])) { const t = c1.map(P.project).filter(Boolean); if (t.length > 8) { P.fill(g, t, "#3a342c"); P.ink(g, t.concat([t[0]]), { w: lw * 0.8, seed: seed + 52, closed: true, over: 0 }); } }
        // hat band
        const band = P.ring(add(H0, scl(up, 0.045 * s)), 0.097 * s, up, 16, 0.09 * s).map(P.project).filter(Boolean);
        if (band.length > 8) P.ink(g, band.slice(0, 9), { w: lw * 0.6, seed: seed + 53, color: "#000" });
      };
      const brimDraw = () => { const b = brim.map(P.project).filter(Boolean); if (b.length < 10) return; P.fill(g, b, "#2b2620"); P.ink(g, b.concat([b[0]]), { w: lw, seed: seed + 54, closed: true, over: 0 }); };
      if (camAbove(H0)) { brimDraw(); crown(); } else { crown(); brimDraw(); }
    } else if (look.hat === "floppy") {
      const brim = P.ring(add(H0, scl(up, -0.01 * s)), 0.2 * s, up, 20, 0.19 * s).map((p, i) => add(p, scl(up, -0.025 * s * (1 + cos((i / 20) * 12.56)) * 0.5)));
      const c0 = P.ring(add(H0, scl(up, 0.0)), 0.105 * s, up, 14), c1 = P.ring(add(H0, scl(up, 0.1 * s)), 0.08 * s, up, 14);
      const crown = () => { const h = hullOf([c0, c1]); if (!h) return; P.fill(g, h, P.PAPER); P.hatch(g, h, { gap: 5 * k + 1, angle: 1.2, alpha: 0.55, seed: seed + 55 }); P.ink(g, h.concat([h[0]]), { w: lw, seed: seed + 56, closed: true, over: 0 }); };
      const brimDraw = () => { const b = brim.map(P.project).filter(Boolean); if (b.length < 10) return; P.fill(g, b, P.PAPER); P.hatch(g, b, { gap: 7 * k + 1, angle: 0.3, alpha: 0.35, seed: seed + 57 }); P.ink(g, b.concat([b[0]]), { w: lw, seed: seed + 58, closed: true, over: 0 }); };
      if (camAbove(H0)) { brimDraw(); crown(); } else { crown(); brimDraw(); }
    }
  }

  function drawTool(g, tool, J, s, seed, lw, gold) {
    const A = J.toolA, B = J.toolB, d = J.toolDir;
    const hs = P.projectLine([A, B])[0];
    if (hs) { P.ink(g, hs, { w: lw * 1.4, seed: seed + 60 }); }
    if (tool === "pick") {
      // a curved iron head across the end of the handle
      const side = norm(cross(d, J.right));
      const head = [add(B, add(scl(side, 0.26 * s), scl(d, -0.06 * s))), add(B, scl(side, 0.1 * s)), add(B, scl(side, -0.1 * s)), add(B, add(scl(side, -0.24 * s), scl(d, -0.07 * s)))];
      const hp = P.projectLine(head)[0];
      if (hp) { P.ink(g, hp, { w: lw * 2.6, seed: seed + 61, color: gold ? P.GOLD : P.INK }); }
    } else if (tool === "shovel") {
      const side = J.right, nrm = norm(cross(d, side));
      const blade = [add(B, scl(side, 0.11 * s)), add(add(B, scl(d, 0.26 * s)), scl(side, 0.1 * s)), add(B, scl(d, 0.34 * s)), add(add(B, scl(d, 0.26 * s)), scl(side, -0.1 * s)), add(B, scl(side, -0.11 * s))];
      const bs = P.projectPoly(blade);
      if (bs) { P.fill(g, bs, P.PAPER); if (gold) P.wash(g, bs, { seed: seed + 62 }); else P.hatch(g, bs, { gap: 5, angle: 0.6, alpha: 0.5, seed: seed + 63 }); P.ink(g, bs.concat([bs[0]]), { w: lw, seed: seed + 64, closed: true, over: 0 }); }
    }
  }
  RIG.drawTool = drawTool;
  RIG.tube = tube;
  RIG.chain = chain;
})();
