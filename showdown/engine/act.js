// ACT: action on top of the penline rig.
// The stock rig poses legs with two angles and keeps the body upright. Fights need more, so this adds:
//   - a solver with foot and hand IK, a whole-body tumble (pitch / roll) and a side bend
//   - named key poses, and keyframe tracks that move pose-to-pose with snap, hold and arc
//   - capes and coat tails that trail by sampling the actor's own past
//   - a compositor that draws each figure with a one-sided rim light, afterimages and silhouettes
// The figure itself is still drawn by rig_fine.js: ACT hands it finished joints through F.J.
(function () {
  const P = PEN, R = RIG, { add, sub, scl, dot, cross, norm, len, clamp, mix } = PEN, { rx, ry, rz } = RIG;
  const ACT = (window.ACT = {});
  const baseSolve = R.solve;
  R.solve = (F) => F.J || baseSolve(F);

  function ik2(S, T, a, b, pole) {
    const d = sub(T, S), L = clamp(len(d), 0.02, a + b - 1e-3), dn = norm(d), x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    let pp = sub(pole, scl(dn, dot(pole, dn))); if (len(pp) < 1e-4) pp = [0, 0, 1]; pp = norm(pp);
    return [add(S, add(scl(dn, x), scl(pp, h))), add(S, scl(dn, L))];
  }

  // ---------- poses ----------
  // Body frame: +x is the figure's left, +y up, +z forward. Metres.
  //   hL hR  hand targets, relative to the chest and turning with the spine (so a twist throws a punch)
  //   fL fR  ankle targets, relative to the ground point under the pelvis
  //   kL kR  which way the knees point; eL eR which way the elbows point
  //   bob sx sz  pelvis offset; lean twist side: the spine; pitch roll: the whole body tumbling about the pelvis
  //   tL tR  toes pointed down (radians); prop: the direction a held prop points, in the chest's frame
  const REST = { bob: 0, sx: 0, sz: 0, pitch: 0, roll: 0, lean: 0.02, twist: 0, side: 0, headYaw: 0, headPitch: 0,
    hL: [0.23, -0.43, 0.05], hR: [-0.23, -0.43, 0.05], fL: [0.11, 0.05, 0.02], fR: [-0.11, 0.05, -0.02],
    kL: [0.25, 0, 1], kR: [-0.25, 0, 1], eL: [0.7, -0.5, -0.6], eR: [-0.7, -0.5, -0.6], tL: 0, tR: 0, prop: [0, -1, 0.1] };
  const STANCE = { fL: [0.15, 0.05, 0.27], fR: [-0.17, 0.05, -0.27], tR: 0.25, bob: -0.07 };
  const POSES = (ACT.POSES = {
    stand: {},
    guard: { ...STANCE, twist: -0.35, lean: 0.12, headYaw: 0.3, hL: [0.12, 0.16, 0.36], hR: [-0.1, 0.12, 0.22] },
    jab: { ...STANCE, twist: -0.62, lean: 0.2, headYaw: 0.55, sz: 0.08, hL: [0.05, 0.14, 0.62], hR: [-0.1, 0.12, 0.2] },
    cross: { ...STANCE, twist: 0.55, lean: 0.28, headYaw: -0.45, sz: 0.14, tR: 0.6, fR: [-0.15, 0.08, -0.3], hR: [-0.02, 0.12, 0.62], hL: [0.16, 0.12, 0.2] },
    upper: { ...STANCE, bob: 0.02, twist: 0.45, lean: -0.1, headYaw: -0.35, hR: [-0.04, 0.4, 0.36], hL: [0.18, 0.08, 0.18], eR: [-0.3, -1, 0] },
    block: { ...STANCE, bob: -0.12, lean: -0.1, twist: -0.2, headYaw: 0.2, headPitch: 0.15, hL: [0.09, 0.3, 0.27], hR: [-0.09, 0.28, 0.25], eL: [0.5, -1, 0], eR: [-0.5, -1, 0] },
    dodgeBack: { ...STANCE, bob: -0.14, lean: -0.6, headPitch: 0.35, sz: -0.12, hL: [0.36, 0.0, 0.12], hR: [-0.36, 0.03, 0.1] },
    duck: { bob: -0.44, lean: 0.5, headPitch: -0.4, fL: [0.22, 0.05, 0.26], fR: [-0.22, 0.05, -0.22], tR: 0.3, hL: [0.16, 0.1, 0.3], hR: [-0.16, 0.08, 0.26] },
    chamber: { bob: -0.02, lean: -0.1, twist: -0.2, headYaw: 0.2, fL: [0.04, 0.05, 0], fR: [-0.12, 0.62, 0.24], tR: 0.6, hL: [0.12, 0.16, 0.34], hR: [-0.12, 0.1, 0.22] },
    kick: { bob: 0, lean: -0.34, twist: 0.2, headYaw: -0.15, headPitch: 0.25, fL: [0.04, 0.05, -0.04], fR: [-0.08, 0.98, 0.82], tR: -0.1, hL: [0.22, 0.02, 0.26], hR: [-0.32, -0.12, -0.2] },
    // claws (Dracula): a wind-up and a raking strike with each hand
    loom: { lean: -0.05, headPitch: 0.16, hL: [0.34, -0.3, 0.1], hR: [-0.34, -0.3, 0.1], eL: [1, 0, -0.4], eR: [-1, 0, -0.4] },
    spread: { lean: -0.16, headPitch: -0.22, bob: 0.02, hL: [0.52, 0.26, 0.02], hR: [-0.52, 0.26, 0.02], eL: [0.4, -1, -0.2], eR: [-0.4, -1, -0.2] },
    clawWind: { ...STANCE, twist: -0.65, lean: -0.05, headYaw: 0.55, hR: [-0.36, 0.36, -0.16], hL: [0.2, 0.04, 0.3], eR: [-1, 0.2, -0.3] },
    claw: { bob: -0.14, twist: 0.75, lean: 0.36, headYaw: -0.6, sz: 0.2, fL: [0.13, 0.05, 0.52], fR: [-0.16, 0.07, -0.36], tR: 0.6, hR: [0.16, -0.02, 0.56], hL: [0.3, -0.1, -0.2] },
    lift: { ...STANCE, bob: 0, twist: 0.3, lean: -0.05, headYaw: -0.25, headPitch: -0.12, hR: [-0.06, 0.34, 0.5], hL: [0.3, -0.32, 0.0] },
    // getting hit
    hitGut: { ...STANCE, bob: -0.14, lean: 0.62, headPitch: 0.3, sz: -0.12, hL: [0.08, -0.16, 0.2], hR: [-0.08, -0.18, 0.2] },
    hitHead: { ...STANCE, bob: -0.04, lean: -0.46, twist: 0.4, headPitch: -0.5, sz: -0.1, hL: [0.4, 0.1, -0.1], hR: [-0.36, 0.3, 0] },
    fly: { pitch: -1.15, lean: 0.55, headPitch: 0.4, hL: [0.2, 0.02, 0.46], hR: [-0.2, 0.0, 0.46], fL: [0.1, 0.62, 0.6], fR: [-0.1, 0.5, 0.72], kL: [0, 1, 0.3], kR: [0, 1, 0.3] },
    crashed: { bob: -0.7, lean: 0.34, headPitch: 0.5, fL: [0.2, 0.06, 0.72], fR: [-0.16, 0.06, 0.6], kL: [0.1, 1, 0.2], kR: [-0.1, 1, 0.2], hL: [0.32, -0.46, -0.05], hR: [-0.32, -0.46, -0.05] },
    kneel: { bob: -0.44, lean: 0.26, headPitch: -0.1, fL: [0.14, 0.05, 0.3], fR: [-0.14, 0.07, -0.42], tR: 0.9, kR: [-0.1, -1, 0.6], hR: [-0.2, -0.3, 0.2], hL: [0.18, -0.12, 0.3] },
    held: { lean: -0.12, headPitch: -0.2, hL: [0.22, -0.4, 0.0], hR: [-0.22, -0.4, 0.02], fL: [0.1, 0.14, -0.06], fR: [-0.1, 0.18, 0.06], tL: 0.8, tR: 0.8 },
    // moving
    leap: { lean: 0.3, bob: 0.02, headPitch: -0.1, fL: [0.1, 0.36, 0.72], fR: [-0.1, 0.32, -0.7], tR: 0.9, tL: 0.2, kR: [-0.1, -0.4, 1], hL: [0.3, 0.2, -0.26], hR: [-0.2, 0.26, 0.4] },
    land: { bob: -0.42, lean: 0.52, headPitch: -0.3, fL: [0.19, 0.05, 0.26], fR: [-0.19, 0.05, -0.16], tR: 0.3, hL: [0.3, -0.3, 0.2], hR: [-0.3, -0.34, 0.15] },
    // Holmes and his cane (held in the right hand; prop = where it points)
    watch: { hR: [-0.04, -0.04, 0.3], headPitch: 0.36, eR: [-1, -0.4, 0], lean: 0.04 },
    caneRest: { hR: [-0.03, -0.3, 0.24], hL: [0.03, -0.27, 0.25], prop: [0, -1, 0.04], fL: [0.13, 0.05, 0.04], fR: [-0.13, 0.05, -0.02] },
    caneGuard: { ...STANCE, twist: -0.3, lean: 0.1, headYaw: 0.28, hR: [-0.1, 0.06, 0.36], hL: [0.16, 0.0, 0.24], prop: [0.1, 0.85, 0.5] },
    caneWind: { ...STANCE, twist: -0.72, lean: 0.0, headYaw: 0.6, hR: [-0.32, 0.36, -0.1], hL: [0.14, 0.1, 0.3], prop: [-0.3, 0.75, -0.6], eR: [-1, 0.2, -0.3] },
    caneStrike: { ...STANCE, bob: -0.12, twist: 0.78, lean: 0.3, headYaw: -0.6, sz: 0.16, tR: 0.6, hR: [0.14, -0.04, 0.55], hL: [0.3, -0.05, -0.15], prop: [0.85, -0.12, 0.5] },
    caneParry: { ...STANCE, bob: -0.1, lean: -0.08, hR: [-0.12, 0.36, 0.3], hL: [0.2, 0.3, 0.3], prop: [1, 0.1, 0.05], eL: [0.5, -1, 0], eR: [-0.5, -1, 0] },
    tipHat: { hR: [-0.1, 0.4, 0.17], eR: [-1, -0.3, 0.2], headPitch: 0.12, lean: 0.03 },
  });
  // a run cycle as a pose: ph is the stride phase in radians
  ACT.run = (ph, o = {}) => Object.assign({}, REST, { lean: 0.38, bob: -0.05 + 0.05 * Math.abs(Math.sin(ph)), twist: 0.18 * Math.sin(ph),
    fL: [0.1, 0.07 + 0.34 * Math.max(0, Math.cos(ph)), 0.5 * Math.sin(ph) - 0.06], fR: [-0.1, 0.07 + 0.34 * Math.max(0, -Math.cos(ph)), -0.5 * Math.sin(ph) - 0.06],
    tL: 0.5 * Math.max(0, -Math.sin(ph)) + 0.2, tR: 0.5 * Math.max(0, Math.sin(ph)) + 0.2,
    hL: [0.2, -0.16, -0.3 * Math.sin(ph) + 0.12], hR: [-0.2, -0.16, 0.3 * Math.sin(ph) + 0.12], eL: [0.4, -0.4, -1], eR: [-0.4, -0.4, -1] }, o);
  // left <-> right
  ACT.mirror = (p) => { const o = Object.assign({}, p), fx = (v) => [-v[0], v[1], v[2]]; for (const [a, b] of [["hL", "hR"], ["fL", "fR"], ["kL", "kR"], ["eL", "eR"]]) { o[a] = fx(p[b]); o[b] = fx(p[a]); } o.tL = p.tR; o.tR = p.tL; o.twist = -p.twist; o.side = -p.side; o.roll = -p.roll; o.sx = -p.sx; o.headYaw = -p.headYaw; o.prop = fx(p.prop); return o; };
  // "guard" | { ...fields } | ["guard", { ...overrides }] | ["guard", "mirror"]  ->  a full pose
  ACT.pose = (spec) => {
    if (!spec) return Object.assign({}, REST);
    if (typeof spec === "string") { if (!POSES[spec]) throw new Error("no pose " + spec); return Object.assign({}, REST, POSES[spec]); }
    if (Array.isArray(spec)) { let p = ACT.pose(spec[0]); for (const o of spec.slice(1)) p = o === "mirror" ? ACT.mirror(p) : Object.assign(p, o); return p; }
    return Object.assign({}, REST, spec);
  };
  const mixPose = (ACT.mixPose = (A, B, u) => { const o = {}; for (const k in A) { const a = A[k], b = B[k]; o[k] = Array.isArray(a) ? [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)] : mix(a, b, u); } return o; });

  // ---------- the skeleton ----------
  ACT.solve = function (S) {
    const p = S.pose, s = S.scale || 1, L = {};
    const pel = [p.sx, 0.95 + p.bob, p.sz];
    const sp = (v) => ry(rx(rz(v, p.side), p.lean), p.twist);
    L.pelvis = pel; L.chest = add(pel, sp([0, 0.32, 0])); L.neck = add(pel, sp([0, 0.5, 0]));
    L.head = add(L.neck, sp(rx([0, 0.13, 0.01], p.headPitch)));
    L.shL = add(pel, sp([0.168, 0.425, -0.01])); L.shR = add(pel, sp([-0.168, 0.425, -0.01]));
    [L.elL, L.hL] = ik2(L.shL, add(L.chest, sp(p.hL)), 0.3, 0.28, sp(p.eL));
    [L.elR, L.hR] = ik2(L.shR, add(L.chest, sp(p.hR)), 0.3, 0.28, sp(p.eR));
    const footUp = {};
    let free = Math.abs(p.pitch) > 0.4 || Math.abs(p.roll) > 0.4;
    for (const sd of ["L", "R"]) {
      const k = sd === "L" ? 1 : -1, hip = add(pel, [0.095 * k, -0.04, 0]);
      const [kn, an] = ik2(hip, p["f" + sd], 0.45, 0.43, p["k" + sd]);
      const d = norm(sub(an, kn));
      let f0 = cross(cross(d, [0, 0, 1]), d); f0 = len(f0) < 0.2 ? [0, 1, 0] : norm(f0);
      const t = p["t" + sd], foot = norm(add(scl(f0, Math.cos(t)), scl(d, Math.sin(t))));
      const up = norm(sub(scl(foot, dot(d, foot)), d));
      L["hip" + sd] = hip; L["kn" + sd] = kn; L["an" + sd] = an; L["toe" + sd] = add(an, add(scl(foot, 0.16), scl(up, -0.04)));
      footUp[sd] = up;
      if (kn[2] - hip[2] > 0.22 || an[1] > 0.3) free = true;
    }
    // the whole body tumbles about the pelvis, then turns to face and goes to its place in the world
    const root = (v) => rx(rz(v, p.roll), p.pitch), face = S.face || 0;
    const toW = (v) => add(S.pos, ry(scl(add(pel, root(sub(v, pel))), s), face)), dirW = (v) => ry(root(v), face);
    const J = {}; for (const k in L) J[k] = toW(L[k]);
    J.headFwd = dirW(sp(rx(ry([0, 0, 1], p.headYaw), p.headPitch))); J.headUp = dirW(sp(rx([0, 1, 0], p.headPitch)));
    J.spineUp = dirW(sp([0, 1, 0])); J.spineFwd = dirW(sp([0, 0, 1])); J.right = dirW([1, 0, 0]); J.fwd = dirW([0, 0, 1]); J.rootUp = dirW([0, 1, 0]);
    J.footUp = { L: dirW(footUp.L), R: dirW(footUp.R) }; J.propDir = norm(dirW(sp(p.prop))); J.legsFree = free;
    return J;
  };

  // ---------- tracks ----------
  const EASE = { lin: (u) => u, io: P.ease.io, out: P.ease.out, in: P.ease.in, back: P.ease.back, snap: (u) => 1 - Math.pow(1 - u, 4), hold: (u) => (u >= 1 ? 1 : 0), pop: () => 1,
    // a hit: nothing, then all at once, then a small settle
    whip: (u) => (u < 0.35 ? 0.06 * (u / 0.35) : 1 - 0.94 * Math.pow(1 - (u - 0.35) / 0.65, 5)) };
  ACT.EASE = EASE;
  const angMix = (a, b, u) => a + (b - a) * u;
  // keys: [{ t, pos, face, pose, ease, arc, expr, cut, hide, alpha, flag, cycle }]; anything left out carries over from the key before.
  //   flag: { ... } free-form switches a prop can read (carried over); cycle: { rate } runs until the next key
  ACT.track = function (keys) {
    const K = []; let prev = { pos: [0, 0, 0], face: 0, pose: ACT.pose(), expr: null, hide: false, alpha: 1, flag: {} };
    for (const k of keys.slice().sort((a, b) => a.t - b.t)) {
      const q = { t: k.t, pos: k.pos || prev.pos, face: k.face ?? prev.face, pose: k.pose ? ACT.pose(k.pose) : prev.pose, ease: k.ease || "snap", arc: k.arc || 0, expr: k.expr !== undefined ? k.expr : prev.expr, cut: !!k.cut, hide: k.hide ?? prev.hide, alpha: k.alpha ?? prev.alpha, flag: k.flag ? Object.assign({}, prev.flag, k.flag) : prev.flag, cycle: k.cycle || null };
      K.push(q); prev = q;
    }
    const at = (t) => {
      if (t <= K[0].t) return Object.assign({ since: K[0].t }, K[0]);
      let i = K.length - 1; while (i > 0 && K[i].t > t) i--;
      let since = K[0].t; for (let j = i; j >= 0; j--) if (K[j].cut) { since = K[j].t; break; }
      const a = K[i], b = K[i + 1];
      if (!b || b.cut) return Object.assign({}, a, { since });
      const lin = (t - a.t) / (b.t - a.t), u = (EASE[b.ease] || EASE.snap)(lin), up = b.arc ? lin : u;
      const pos = [mix(a.pos[0], b.pos[0], up), mix(a.pos[1], b.pos[1], up) + b.arc * 4 * lin * (1 - lin), mix(a.pos[2], b.pos[2], up)];
      const late = u > 0.5 ? b : a;
      const pose = a.cycle ? ACT.run((t - a.t) * a.cycle.rate, a.cycle.o) : u <= 0 ? a.pose : u >= 1 ? b.pose : mixPose(a.pose, b.pose, u);
      return { t, pos, face: angMix(a.face, b.face, u), pose, expr: late.expr, hide: a.hide, flag: a.flag, alpha: mix(a.alpha, b.alpha, u), since };
    };
    at.keys = K;
    return at;
  };

  // ---------- capes and coat tails ----------
  // Each row of the cloth hangs from where the body was a moment earlier, so it streams behind a dash and settles after it.
  function cloth(g, A, t, cfg, w) {
    const N = cfg.rows || 6, Lp = [], Rp = [], st0 = A.at(t);
    let back0 = null, a0 = null, b0 = null;
    // cloth trails, but it does not stretch: no row gets further from the body than its own length along the cloth
    const leash = (p, root, max) => { const d = sub(p, root), l = len(d); return l > max ? add(root, scl(d, max / l)) : p; };
    for (let k = 0; k <= N; k++) {
      const tk = Math.max(st0.since, t - k * (cfg.lag ?? 0.045)), J = ACT.solve(Object.assign({ scale: A.scale }, A.at(tk))), u = k / N;
      const back = scl(J.spineFwd, -1), side = J.right; if (!back0) back0 = back;
      const [a, b] = cfg.from === "waist" ? [add(J.hipL, scl(J.rootUp, 0.1)), add(J.hipR, scl(J.rootUp, 0.1))] : [add(J.shL, scl(J.spineUp, 0.06)), add(J.shR, scl(J.spineUp, 0.06))];
      const fl = 0.035 * Math.sin(t * 9 + k * 1.3 + (cfg.seed || 0)) * u + (cfg.wind || 0) * u * u;
      const off = add(add([0, -cfg.len * u, 0], scl(back, (cfg.out ?? 0.07) + (cfg.flare ?? 0.2) * u + fl)), [0, 0, 0]);
      const wide = (cfg.w0 ?? 0.02) + (cfg.w1 ?? 0.3) * Math.pow(u, 0.8);
      if (!a0) { a0 = a; b0 = b; }
      const reach = cfg.len * u * 1.12 + (cfg.out ?? 0.07) + (cfg.flare ?? 0.2) * u + wide + 0.02;
      Lp.push(leash(add(add(a, off), scl(side, wide)), a0, reach)); Rp.push(leash(add(add(b, off), scl(side, -wide)), b0, reach));
    }
    // a scalloped hem, like a bat's wing
    const hem = []; const M = cfg.scallop || 0;
    for (let i = 1; i < M; i++) { const u = i / M, q = P.lerp3(Lp[N], Rp[N], u); hem.push(add(q, [0, i % 2 ? cfg.len * 0.1 : -cfg.len * 0.03, 0])); }
    const ring = Lp.concat(hem).concat(Rp.slice().reverse());
    const s = ring.map(P.project); if (s.some((q) => !q)) return;
    const mid = P.lerp3(Lp[Math.floor(N / 2)], Rp[Math.floor(N / 2)], 0.5), outside = dot(back0, sub(P.cam.pos, mid)) > 0;
    const pts = R.chaikin(s.map((q) => [q[0], q[1]]), 1);
    P.fill(g, pts, outside ? cfg.color : cfg.lining || cfg.color);
    P.ink(g, pts.concat([pts[0]]), { w, color: "#1d1b19", seed: (cfg.seed || 0) + 300, closed: true, over: 0, double: false, wob: 0.35 });
    for (const u of [0.3, 0.7]) { const fold = []; for (let k = 1; k <= N; k++) { const q = P.project(P.lerp3(Lp[k], Rp[k], u)); if (q) fold.push(q); } if (fold.length > 2) P.ink(g, fold, { w: w * 0.6, color: outside ? "#55505c" : "#1d1b19", seed: (cfg.seed || 0) + 310 + u * 10, double: false, wob: 0.3, alpha: 0.6 }); }
    if (cfg.collar) for (const sd of [1, -1]) { const J = ACT.solve(Object.assign({ scale: A.scale }, st0)), sh = sd > 0 ? J.shL : J.shR, c = [add(sh, scl(J.spineUp, 0.02)), add(add(J.neck, scl(J.right, 0.15 * sd)), add(scl(J.spineUp, 0.2), scl(J.spineFwd, -0.05))), add(J.neck, add(scl(J.spineUp, 0.05), scl(J.spineFwd, -0.09)))].map(P.project); if (c.every(Boolean)) { P.fill(g, c, outside ? cfg.color : cfg.lining || cfg.color); P.ink(g, c.concat([c[0]]), { w, color: "#1d1b19", seed: 320 + sd, closed: true, over: 0, double: false }); } }
    return outside;
  }

  // ---------- actors ----------
  const scratch = () => Object.assign(document.createElement("canvas"), { width: P.W, height: P.H });
  let figC = null, silC = null;
  // def: { kind, look, seed, scale, cloth: [cfg], prop(g, J, w), rim }
  ACT.actor = function (def, keys) {
    const A = Object.assign({ scale: 1, cloth: [] }, def);
    A.at = ACT.track(keys);
    A.J = (t) => ACT.solve(Object.assign({ scale: A.scale }, A.at(t)));
    // paint the figure alone on a clear canvas
    function figure(t) {
      if (!figC) { figC = scratch(); silC = scratch(); }
      const g = figC.getContext("2d"), st = A.at(t), J = ACT.solve(Object.assign({ scale: A.scale }, st));
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, P.W, P.H);
      const hpx = P.pxAt(st.pos, 1.8 * A.scale), w = clamp(2.5 * Math.pow(hpx / 900, 0.3), 0.7, 3.4);
      const camFront = dot(J.spineFwd, sub(P.cam.pos, J.chest)) > 0;
      P.STYLE.inFigure = true;
      try { if (camFront) for (const c of A.cloth) cloth(g, A, t, c, w); } finally { P.STYLE.inFigure = false; }
      const look = Object.assign({}, A.look, st.expr ? { expr: st.expr } : {});
      R.draw(g, { pos: st.pos, face: st.face, pose: {}, J, legsFree: J.legsFree, kind: A.kind, look, seed: A.seed, scale: A.scale, shadow: false });
      P.STYLE.inFigure = true;
      try { if (!camFront) for (const c of A.cloth) cloth(g, A, t, c, w); if (A.prop) A.prop(g, J, w, st); } finally { P.STYLE.inFigure = false; }
      return { st, J };
    }
    function silhouette(color) {
      const s = silC.getContext("2d");
      s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = "source-over"; s.clearRect(0, 0, P.W, P.H); s.drawImage(figC, 0, 0);
      s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, P.W, P.H); s.globalCompositeOperation = "source-over";
    }
    // o: { rim: colour | false, rimDir: [dx, dy] px, alpha, solid: colour (flat silhouette), ghosts: n, ghostColor, ghostStep, ground: y | false }
    A.draw = function (g, t, o = {}) {
      const st0 = A.at(t); if (st0.hide) return null;
      const alpha = (o.alpha ?? 1) * st0.alpha; if (alpha <= 0.01) return null;
      // afterimages first: where the body was, as flat shapes
      for (let k = o.ghosts || 0; k >= 1; k--) {
        const tg = Math.max(st0.since, t - k * (o.ghostStep ?? 1 / 24)); if (tg >= t) continue;
        figure(tg); silhouette(o.ghostColor || "#ffffff");
        g.save(); g.globalAlpha = alpha * 0.5 * (1 - k / ((o.ghosts || 0) + 1)); g.drawImage(silC, 0, 0); g.restore();
      }
      const { st, J } = figure(t);
      // a soft contact shadow on whatever the actor stands over
      if (o.ground !== false) {
        const gy = typeof o.ground === "function" ? o.ground(st.pos) : o.ground || 0, hgt = clamp((J.pelvis[1] - gy - 0.5) / 4), r = 0.42 * A.scale * (1 - hgt * 0.5);
        const ring = P.projectPoly(P.ring([J.pelvis[0], gy + 0.02, J.pelvis[2]], r, [0, 1, 0], 18, r * 0.62));
        if (ring) P.fill(g, ring, "rgba(14,4,48," + (0.4 * alpha * (1 - hgt * 0.7)).toFixed(3) + ")");
      }
      g.save(); g.globalAlpha = alpha;
      const rim = o.rim === undefined ? A.rim : o.rim;
      if (rim) { silhouette(rim); const [dx, dy] = o.rimDir || [-3, -2.5], k = clamp(P.pxAt(st.pos, 1.8) / 600, 0.35, 1.6); g.drawImage(silC, dx * k, dy * k); g.drawImage(silC, dx * k * 0.5, dy * k); }
      if (o.solid) { silhouette(o.solid); g.drawImage(silC, 0, 0); } else g.drawImage(figC, 0, 0);
      g.restore();
      return J;
    };
    return A;
  };
})();
