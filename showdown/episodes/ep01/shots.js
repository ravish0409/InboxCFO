// INKCLASH round 01: Sherlock Holmes vs Dracula.
// Story: Dracula is stronger and faster, so Holmes fights for time. He checks his watch before the first blow,
// loses his cane, gets thrown through a chimney, runs, and lets himself be caught under the clock tower at 5:59.
// Then the clock strikes six and the sun comes up.
//
// Times are in frames at 12 fps (the cast moves on twos); F(n) turns a frame number into seconds.
// Every hit lands on a frame boundary, so the impact frame, the shake and the sound share one instant.
(function () {
  const P = PEN, { add, sub, scl, mix, clamp, lerp3 } = PEN, E = ACT.EASE;
  const F = (n) => n / 12;
  const FH = Math.PI / 2 - 0.3, FD = -Math.PI / 2 + 0.3; // facing +x / -x, turned a little to a camera on +z
  const GB = -1.2;                                         // the second roof sits lower

  // ---------- the two performances ----------
  const keys = (list) => list.map(([f, o]) => Object.assign({ t: F(f) }, o));
  const NARROW = { eyes: "narrow", knit: 0.6 }, GRIN = { eyes: "narrow", knit: 0.8, mouth: "grin" }, ROAR = { eyes: "wide", knit: 1, mouth: "open", jaw: 0.02 };
  const SHOCK = { eyes: "wide", brows: [1, 1], mouth: "o" }, SMIRK = { eyes: "narrow", mouth: "smirk", brows: [0.6, 0] }, HURT = { eyes: "shut", knit: -0.6, mouth: "frown" };
  const watchL = { hL: [0.05, -0.04, 0.3], eL: [1, -0.4, 0], headPitch: 0.36, headYaw: 0.15, hR: [-0.2, -0.36, 0.14], prop: [0, -1, 0.05] };
  const strike = ["caneStrike", { prop: [0.25, -0.12, 0.95], hR: [0.08, -0.02, 0.57] }], parry = ["caneParry", { prop: [0.25, 0.8, 0.5], hR: [-0.1, 0.2, 0.4], hL: [0.1, 0.42, 0.5] }];
  const HOLMES = ACT.actor(CAST.holmes, keys([
    [0, { pos: [-2.4, 0, 0], face: FH, pose: "caneRest" }],
    [42, {}], [47, { pose: watchL, ease: "io", flag: { watch: true } }], [56, { expr: NARROW }],
    [59, { pose: "caneRest", flag: { watch: false } }], [80, {}], [83, { pose: "caneGuard" }],
    // round one: dodge, duck, parry, then two clean hits
    [88, {}], [91, { pose: "dodgeBack", pos: [-2.9, 0, 0], expr: SHOCK }], [96, { pose: "caneGuard", pos: [-3.0, 0, 0], expr: NARROW }],
    [98, { pose: "duck" }], [103, { pose: "caneGuard" }], [106, { pose: parry }], [110, {}],
    [112, { pose: "caneWind", pos: [-2.8, 0, 0], ease: "out" }], [114, { pose: strike, pos: [-2.5, 0, 0], ease: "whip" }], [118, {}],
    [120, { pose: "chamber", pos: [-1.9, 0, 0] }], [122, { pose: "kick", pos: [-1.5, 0, 0], ease: "whip" }], [126, {}],
    [129, { pose: "caneGuard", pos: [-1.2, 0, 0] }],
    // round two: the cane is caught and snapped, and Holmes goes through the chimney
    [146, {}], [148, { pose: "caneWind" }], [150, { pose: strike, pos: [-1.0, 0, 0], ease: "whip" }], [151, { expr: SHOCK }], [154, { flag: { noCane: true } }], [156, {}],
    [157, { pose: "hitGut", ease: "pop", expr: HURT }], [158, { pose: "fly", pos: [-1.5, 0.3, 0], ease: "lin" }],
    [165, { pos: [-8.0, 0.35, -1.1], arc: 0.3, ease: "lin" }], [168, { pose: "crashed", pos: [-10.4, 0, -1.1], ease: "out" }],
    [182, { expr: NARROW }], [186, {}], [192, { pose: "kneel", ease: "io" }], [198, { expr: SMIRK }], [204, { pose: "stand", ease: "io" }], [208, { pose: "guard", expr: NARROW }],
    [224, { pose: ["guard", { headPitch: -0.5, lean: -0.05 }], ease: "io", expr: SHOCK }], [255, {}],
    // the run, the jump, the trap
    [257, { cycle: { rate: 16 }, expr: NARROW }], [293, { pos: [9.3, 0, 0], ease: "lin", pose: "leap" }],
    [303, { pos: [14.6, GB, 0], arc: 1.7, ease: "lin" }], [304, { pose: "land", ease: "pop" }], [308, {}],
    [309, { cycle: { rate: 16 } }], [319, { pos: [19.8, GB, -0.6], ease: "lin", pose: ACT.run(1.2) }],
    [322, { pose: "guard", pos: [20.7, GB, -0.8], face: FD, ease: "out" }], [328, { pose: ["guard", { headYaw: -0.7 }] }], [331, {}],
    [332, { pose: "block", face: 0.86, ease: "pop", expr: SHOCK }], [334, { pose: "held", pos: [21.72, GB + 0.36, -0.82], ease: "whip" }],
    [344, { expr: SMIRK }], [379, {}],
    [381, { pose: "land", pos: [21.0, GB, -0.9], face: FH, ease: "pop", expr: NARROW }], [388, { pose: "kneel", ease: "io" }], [400, { pose: "stand", ease: "io", expr: null }],
    [422, {}], [428, { face: FD - 0.25, ease: "io" }], [434, { pose: "tipHat", ease: "io", expr: SMIRK }],
  ]));
  const crouch = ["clawWind", "mirror", { bob: -0.22, lean: 0.25 }], catchP = ["lift", "mirror", { hL: [0.08, 0.02, 0.52], headPitch: 0 }];
  const DRACULA = ACT.actor(CAST.dracula, keys([
    [0, { pos: [2.4, 0, -0.15], face: FD, pose: "loom", hide: true }],
    [29, { hide: false, alpha: 0, pose: "spread" }], [34, { alpha: 1 }], [40, { pose: "loom", ease: "io" }],
    [61, { pose: "spread", expr: GRIN, ease: "io" }], [68, { pose: "loom", ease: "io" }], [84, {}],
    [88, { pose: crouch }], [89, {}], [91, { pose: ["claw", "mirror"], pos: [-1.9, 0, -0.15], ease: "lin", expr: ROAR }], [95, {}],
    [97, { pose: "clawWind", pos: [-2.0, 0, -0.15] }], [99, { pose: ["claw", { hR: [0.16, 0.26, 0.56], lean: 0.15 }], ease: "whip" }], [102, {}],
    [104, { pose: ["clawWind", "mirror", { hL: [0.3, 0.5, -0.05] }] }], [106, { pose: ["claw", "mirror", { hL: [-0.05, 0.4, 0.5], lean: 0.2 }], pos: [-1.8, 0, -0.15], ease: "whip" }], [110, {}],
    [112, { pose: ["hitHead", { lean: -0.25 }], pos: [-1.6, 0, -0.15], ease: "out", expr: SHOCK }],
    [114, { pose: "hitGut", pos: [-1.3, 0, -0.15], ease: "pop", expr: HURT }], [118, { pos: [-0.6, 0, -0.15], ease: "out" }], [121, { pose: ["loom", { lean: 0.25, bob: -0.1 }], pos: [-0.5, 0, -0.15] }],
    [122, { pose: "hitHead", pos: [-0.4, 0, -0.15], ease: "pop", expr: HURT }], [128, { pos: [3.0, 0, -0.15], ease: "out" }], [131, { pose: "land", pos: [3.3, 0, -0.15] }],
    [136, { pose: ["loom", { headPitch: -0.25 }], ease: "io", expr: GRIN }], [138, { expr: ROAR }], [143, {}],
    [144, { pose: crouch, expr: GRIN }], [146, {}], [148, { pose: catchP, pos: [0.5, 0, -0.15], ease: "lin" }], [152, {}],
    [154, { pose: ["lift", "mirror", { hL: [0.24, 0.12, 0.3], twist: -0.5 }] }], [155, { pose: ["cross", { twist: -0.6, hR: [-0.3, 0.1, -0.12], lean: 0 }] }],
    [157, { pose: "cross", pos: [0.15, 0, -0.15], ease: "whip", expr: ROAR }], [163, {}], [170, { pose: "loom", ease: "io", expr: GRIN }],
    [209, {}], [213, { pose: "spread", expr: ROAR }], [216, { alpha: 1 }], [223, { alpha: 0 }], [224, { hide: true }],
    // out of the swarm, behind him
    [327, { cut: true, hide: false, alpha: 0, pos: [22.1, GB, -0.47], face: -2.28, pose: "spread", expr: GRIN }], [331, { alpha: 1 }],
    [334, { pose: ["lift", "mirror", { hL: [0.04, 0.5, 0.42] }], ease: "whip" }], [340, { expr: ROAR }], [352, { expr: GRIN }],
    // six o'clock
    [363, { expr: SHOCK }], [378, {}], [379, { pose: ["block", { lean: -0.25 }], pos: [22.8, GB, -0.4], face: FD + 0.1, expr: HURT }],
    [388, { pose: "hitHead", pos: [23.4, GB, -0.5], expr: ROAR }], [396, { pose: ["block", { lean: -0.5, bob: -0.2 }], pos: [23.7, GB, -0.5] }],
    [399, { pose: "spread", expr: ROAR }], [403, { alpha: 1 }], [414, { alpha: 0 }], [415, { hide: true }],
  ]));

  // ---------- small helpers ----------
  const k3 = (u, a, b, ease = "io") => lerp3(a, b, E[ease](clamp(u)));
  const k1 = (u, a, b, ease = "io") => mix(a, b, E[ease](clamp(u)));
  const prog = (t, f0, f1) => clamp((t - F(f0)) / (F(f1) - F(f0)));
  const chest = (A, t) => A.J(t).chest;
  // shake that rings out after each listed hit: [frame, amplitude px]
  const rattle = (c, hits) => { let a = 0; for (const [f, amp] of hits) { const d = c.t - F(f); if (d >= 0 && d < 0.45) a += amp * Math.pow(1 - d / 0.45, 2); } if (a > 0.5) c.shake(a, 3); };
  const cast = (c, o = {}) => { c.actor(HOLMES, o.h || o); c.actor(DRACULA, o.d || o); };
  // the two-frame impact: black figures on white, then white figures on colour, then a flash that fades
  function impact(c, f, at, col = "#ff2d55") {
    const d = c.t - F(f); if (d < -1e-6 || d > 0.34) return 0;
    const q = () => P.project(typeof at === "function" ? at() : at) || [P.W / 2, P.H / 2];
    if (d < 1 / 24 - 1e-6) { c.blank = "#fffdf5"; c.actorOpts = { solid: "#16121f", rim: false, ground: false, ghosts: 0 }; c.noChip = true; c.over((g) => { const p = q(); FX.speedLines(g, { cx: p[0], cy: p[1], color: "#16121f", n: 60, inner: 0.16, seed: f, thick: 1.5 }); FX.burst(g, p, 150, { color: "#16121f", core: "#fffdf5", edge: false, seed: f, spikes: 11 }); }); return 1; }
    if (d < 2 / 24 - 1e-6) { c.blank = col; c.actorOpts = { solid: "#fffdf5", rim: false, ground: false, ghosts: 0 }; c.noChip = true; c.over((g) => { const p = q(); FX.speedLines(g, { cx: p[0], cy: p[1], color: "#fffdf5", n: 44, inner: 0.22, seed: f + 1 }); FX.burst(g, p, 230, { color: "#fffdf5", core: col, edge: false, seed: f + 2, spikes: 13 }); }); return 2; }
    const u = (d - 2 / 24) / (0.34 - 2 / 24);
    c.over((g) => { const p = q(); FX.burst(g, p, 190 * (1 - u * 0.5), { seed: f + Math.floor(u * 4), alpha: 1 - u, spikes: 10 }); FX.speedLines(g, { cx: p[0], cy: p[1], alpha: (1 - u) * 0.8, n: 36, inner: 0.3 + u * 0.3, seed: f + 3 }); FX.flash(g, "#fff", 0.35 * (1 - u)); });
    return 3;
  }
  // bats flying from one place to another in a spiral; they wait unseen before t0 and vanish on arrival
  function flock(c, n, t0, dur, from, to, o = {}) {
    const t = c.step(o.fps || 24);
    c.add(o.z ?? lerp3(from, to, 0.5), (g) => FX.swarm(g, n, t, (off, sp, i, j) => {
      const u = (t - t0 - off * dur * (o.stagger ?? 0.5)) / (dur * (1 - (o.stagger ?? 0.5) * 0.5)); if (u <= 0 || u >= 1) return o.keep && u >= 1 ? add(to, scl(j, o.cloud || 2)) : null;
      const e = P.ease.io(u), a = (1 - e) * (o.turns ?? 5) + i * 2.4, r = (o.radius ?? 2.5) * Math.sin(u * Math.PI) + (1 - e) * (o.r0 || 0) + e * (o.r1 || 0);
      return add(lerp3(add(from, scl(j, o.spread0 ?? 1)), add(to, scl(j, o.spread1 ?? 0.6)), e), [Math.cos(a) * r, Math.sin(a * 0.7) * r * 0.5, Math.sin(a) * r]);
    }, { size: o.size || 0.34, seed: o.seed || 3, wobble: 0.3, color: o.color }));
  }
  const sunAt = (dawn) => { const d = P.norm([-1, -0.1 + dawn * 0.28, -0.42]); return P.project(add(P.cam.pos, scl(d, 800))); };
  const goldRim = { rim: "#ffe9a8", rimDir: [-4, -1.5] };

  // ---------- the film ----------
  const CUTS = [["est", 0], ["face", 39], ["eyeH", 68], ["eyeD", 76], ["dash", 84], ["exch", 96], ["hit1", 114], ["hit2", 122], ["laugh", 132], ["catch", 144], ["throw", 157], ["rubble", 174], ["clock1", 188], ["rise", 196], ["dissolve", 209], ["giant", 224], ["chase", 257], ["leap", 293], ["land", 304], ["vortex", 321], ["gloat", 334], ["smirk", 344], ["clock2", 353], ["dawn", 363], ["burn", 379], ["ash", 399], ["end", 416], [null, 462]];
  const S = (window.SHOTS = {});
  window.EP = {
    title: "Sherlock Holmes vs Dracula", set: "london", fps: 24,
    shots: CUTS.slice(0, -1).map(([id, f], i) => ({ id, s: F(f), e: F(CUTS[i + 1][1]) })),
    ground: (p) => (p[0] > 11.8 ? GB : 0), actorDefaults: {},
    cast: { HOLMES, DRACULA },
    // sound: [frame at 12 fps, sound, loudness 0..1, pan -1..1]; tools/audio.py plays these. Music follows `score`.
    cues: [
      [6, "slam", 0.7, -0.3], [10, "slam", 0.5, 0], [14, "slam", 0.9, 0.3], [12, "bats", 0.5, 0.3, 1.8], [29, "whoosh", 0.5, 0.3],
      [47, "tick", 0.8, -0.3], [59, "tick", 1, -0.3], [61, "cloth", 0.7, 0.4], [68, "sting", 0.6, -0.2], [76, "sting", 0.8, 0.2],
      [89, "dash", 1, 0.2], [91, "swish", 0.9, -0.1], [98, "swish", 0.8, -0.2], [106, "clack", 1, -0.2], [111, "whoosh", 0.6, -0.2],
      [114, "hit", 0.95, -0.1], [121, "swish", 0.7, 0], [122, "hit", 1, 0], [123, "slide", 0.6, 0.3], [131, "thud", 0.5, 0.4],
      [138, "growl", 0.7, 0.3], [146, "dash", 1, 0.2], [150, "smack", 0.9, 0], [154, "crack", 1, 0], [156, "whoosh", 0.7, 0],
      [157, "hit", 1, 0], [158, "whoosh", 0.8, -0.3, 0.6], [165, "crash", 1, -0.5], [176, "rubble", 0.5, -0.3],
      [188, "tick", 0.9, 0.4], [190, "tick", 0.7, 0.4], [192, "tick", 0.9, 0.4], [194, "tick", 0.7, 0.4],
      [213, "cloth", 0.9, 0.1], [213, "bats", 0.8, 0, 3.6], [226, "riser", 0.8, 0, 2.4], [236, "screech", 0.9, 0], [247, "dash", 0.9, -0.2], [254, "hit", 0.6, -0.3],
      [257, "bats", 0.7, -0.3, 6.2], [257, "steps", 0.8, -0.2, 3.0], [293, "whoosh", 0.9, 0, 0.8], [304, "thud", 0.9, 0], [309, "steps", 0.8, 0.2, 0.85], [320, "slide", 0.7, 0.3],
      [321, "bats", 0.9, 0.2, 0.9], [331, "sting", 0.9, 0.2], [334, "smack", 1, 0.1],
      [345, "tick", 0.8, 0.3], [347, "tick", 0.6, 0.3], [349, "tick", 0.8, 0.3], [351, "tick", 0.6, 0.3], [353, "tick", 0.9, 0.3], [354.5, "tick", 0.7, 0.3], [356, "bong", 1, 0.2],
      [379, "sizzle", 0.8, 0.3, 1.7], [381, "thud", 0.6, -0.1], [388, "growl", 0.9, 0.3], [399, "hit", 0.9, 0.2], [399, "burst", 1, 0.2], [436, "cloth", 0.4, 0], [438, "slam", 0.9, 0],
    ],
    // music sections by frame: what the score is doing
    score: [[0, "tense"], [84, "fight"], [174, "still"], [209, "dread"], [257, "chase"], [334, "hush"], [363, "sunrise"], [416, "theme"], [462, "end"]],
    // the channel tag
    chip(g) { g.save(); g.setTransform(1, 0, -0.18, 1, 0, 0); g.fillStyle = "#0b0630"; g.fillRect(78, 46, 222, 50); g.fillStyle = "#ff2d55"; g.fillRect(72, 40, 222, 50); g.restore(); FX.text(g, "INKCLASH", 178, 67, 40, { shadow: false, color: "#fff", track: 0.04 }); },
  };

  // 1. the city, the roof, the bats arriving; the title
  S.est = (c) => {
    const u = c.u;
    c.cam(k3(u, [-10, 20, 50], [-1.5, 4.2, 17]), k3(u, [16, 6, -20], [0, 1.6, 0]), k1(u, 44, 36));
    c.env.clock = 5.75;
    cast(c);
    flock(c, 70, F(12), F(22), [14, 22, -26], [2.4, 1.2, -0.15], { radius: 5, turns: 4, size: 0.4, spread0: 6, seed: 4 });
    c.over((g) => {
      const a = E.back(prog(c.t, 6, 12)), b = E.back(prog(c.t, 10, 16)), d = E.back(prog(c.t, 14, 20)), out = 1 - P.ease.in(prog(c.t, 33, 38));
      if (out <= 0) return;
      g.save(); g.globalAlpha = out;
      if (a > 0) FX.text(g, "SHERLOCK HOLMES", mix(-700, 960, a), 700, 150, { color: "#ffc978", stroke: "#0b0630" });
      if (b > 0) FX.text(g, "VS", 960, 815, 86 * b, { color: "#fff", stroke: "#ff2d55", skew: 0 });
      if (d > 0) FX.text(g, "DRACULA", mix(2620, 960, d), 940, 170, { color: "#ff2d55", stroke: "#0b0630" });
      g.restore();
    });
  };
  // 2. the stand-off: he checks his watch
  S.face = (c) => {
    c.cam(k3(c.u, [0.3, 1.5, 9.2], [0, 1.25, 7.2]), [0, 1.15, 0], 33);
    c.env.clock = 5.75; cast(c);
    c.over((g) => FX.bars(g, P.ease.out(clamp(c.lt / 0.4))));
  };
  S.eyeH = (c) => {
    const J = HOLMES.J(c.tq);
    c.cam(add(J.head, [1.5 - c.u * 0.12, 0.02, 1.25]), add(J.head, [0, 0.01, 0]), 20);
    c.actor(HOLMES); c.over((g) => { FX.speedLines(g, { color: "#fff", alpha: 0.5, n: 30, inner: 0.5, seed: Math.floor(c.t * 8) }); FX.bars(g, 1); });
  };
  S.eyeD = (c) => {
    const J = DRACULA.J(c.tq);
    c.cam(add(J.head, [-1.5 + c.u * 0.12, -0.05, 1.3]), add(J.head, [0, 0.0, 0]), 20);
    c.actor(DRACULA); c.over((g) => { FX.speedLines(g, { color: "#ff2d55", alpha: 0.55, n: 30, inner: 0.5, seed: Math.floor(c.t * 8) }); FX.bars(g, 1); });
  };
  // 3. the first lunge
  S.dash = (c) => {
    const d = DRACULA.at(c.t).pos, cx = mix(0.6, -1.6, P.ease.io(prog(c.t, 88, 93)));
    c.cam([cx, 1.2, 7.4], [cx - 0.3, 1.15, 0], 36);
    rattle(c, [[91, 26]]);
    const go = c.t >= F(89) && c.t < F(92);
    cast(c, { h: { fps: 24 }, d: { fps: 24, ghosts: go ? 5 : 0, ghostColor: "#ff2d55", ghostStep: 1 / 48 } });
    c.under((g) => { FX.dust(g, [2.4, 0, -0.15], c.t - F(89), { seed: 2, push: [1.2, 0, 0], n: 9 }); FX.dust(g, [-1.9, 0, -0.15], c.t - F(91), { seed: 5, n: 6, spread: 0.6 }); });
    c.over((g) => {
      if (go) FX.streaks(g, { alpha: 0.75, seed: Math.floor(c.t * 24), n: 40 });
      const s = prog(c.t, 90, 93); if (s > 0 && s < 1) { const J = DRACULA.J(F(91)), a = P.project(add(J.hL, [0.5, 0.75, 0])), b = P.project(add(J.hL, [-0.75, -0.55, 0])); if (a && b) FX.slash(g, a, b, { color: "#fff", edge: "#ff2d55", u: clamp(s * 2.2), alpha: 1 - s * s, w: 20, gap: 30 }); }
    });
  };
  // 4. the exchange: a duck, then claws on the cane
  S.exch = (c) => {
    c.cam(k3(c.u, [-1.2, 1.5, 6.6], [-3.2, 1.25, 5.6]), k3(c.u, [-2.4, 1.15, 0], [-2.5, 1.2, 0]), 34);
    rattle(c, [[99, 10], [106, 30]]);
    cast(c, { fps: 24 });
    c.over((g) => {
      const s = prog(c.t, 98, 101); if (s > 0 && s < 1) { const J = DRACULA.J(F(99)), a = P.project(add(J.hR, [1.0, 0.2, 0])), b = P.project(add(J.hR, [-0.8, 0.05, 0])); if (a && b) FX.slash(g, a, b, { color: "#fff", edge: "#ff2d55", u: clamp(s * 2.2), alpha: 1 - s * s, bulge: 0.12, w: 18 }); }
      const p = c.t - F(106); if (p >= 0 && p < 0.3) { const J = HOLMES.J(F(106)), q = P.project(add(J.hR, scl(J.propDir, 0.5))); FX.burst(g, q, 120 * (1 - p), { seed: 6 + Math.floor(p * 24), alpha: 1 - p / 0.3 }); if (p < 1 / 12) FX.flash(g, "#fff", 0.4); }
    });
    c.add(100, (g) => { const p = c.t - F(106); if (p >= 0 && p < 0.4) FX.ring(g, [-2.6, 0.03, 0], 0.5 + p * 6, { alpha: 1 - p / 0.4, color: "#dff3ff" }); });
  };
  // 5. cane to the ribs
  S.hit1 = (c) => {
    c.cam(k3(c.u, [-2.6, 0.75, 4.2], [-2.3, 0.8, 4.6], "out"), [-1.7, 1.2, 0], 40, -0.06);
    rattle(c, [[114, 44]]);
    const tip = () => { const J = HOLMES.J(F(114)); return add(J.hR, scl(J.propDir, 0.7)); };
    impact(c, 114, tip);
    cast(c, { fps: 24 });
    c.add(0.5, (g) => FX.trail(g, (tt) => { const J = HOLMES.J(Math.min(tt, F(114))); return add(J.hR, scl(J.propDir, 0.8)); }, Math.min(c.t, F(115)), 0.11, { w: 0.07, color: "#fff", alpha: c.t < F(116) ? 0.9 : 0 }));
    c.under((g) => FX.dust(g, [-0.9, 0, -0.15], c.t - F(115), { seed: 8, push: [1.4, 0, 0] }));
  };
  // 6. the kick that sends him sliding
  S.hit2 = (c) => {
    const dx = DRACULA.at(c.t).pos[0];
    c.cam([mix(-0.6, 1.2, P.ease.out(c.u)), 1.3, 8.2], [mix(-0.9, 1.4, P.ease.out(c.u)), 1.1, 0], 36);
    rattle(c, [[122, 50]]);
    impact(c, 122, () => { const J = HOLMES.J(F(122)); return J.toeR; }, "#ffd23f");
    cast(c, { h: { fps: 24 }, d: { fps: 24, ghosts: c.t < F(126) ? 3 : 0 } });
    c.under((g) => { for (let i = 0; i < 4; i++) FX.dust(g, [0.4 + i * 0.8, 0, -0.15], c.t - F(123 + i), { seed: 11 + i, n: 4, spread: 0.4, r: 0.24 }); });
  };
  // 7. he laughs it off
  S.laugh = (c) => {
    const J = DRACULA.J(c.tq);
    c.cam(add(J.head, [-2.2 + c.u * 0.3, -0.5, 2.6]), add(J.head, [0, -0.12, 0]), 30, 0.07);
    c.actor(DRACULA); c.over((g) => { FX.vignette(g, "#2a0018", 0.6); FX.bars(g, 1); });
  };
  // 8. the cane is caught and broken
  S.catch = (c) => {
    c.cam(k3(c.u, [0.4, 1.35, 6.2], [-0.2, 1.3, 4.8]), [-0.2, 1.2, 0], 34);
    rattle(c, [[150, 24], [154, 16]]);
    const go = c.t >= F(146) && c.t < F(149);
    cast(c, { h: { fps: 24 }, d: { fps: 24, ghosts: go ? 5 : 0, ghostColor: "#ff2d55", ghostStep: 1 / 48 } });
    c.over((g) => {
      if (go) FX.streaks(g, { alpha: 0.7, seed: Math.floor(c.t * 24), n: 36 });
      const p = c.t - F(150); if (p >= 0 && p < 0.25) { FX.burst(g, P.project(DRACULA.J(F(150)).hL), 90 * (1 - p), { seed: 9, alpha: 1 - p / 0.25 }); }
      const s = c.t - F(154); if (s >= 0 && s < 0.3) { const q = P.project(DRACULA.J(F(154)).hL); FX.burst(g, q, 130 * (1 - s), { seed: 14 + Math.floor(s * 24), core: "#fff", color: "#ffd23f", alpha: 1 - s / 0.3 }); if (s < 1 / 12) FX.flash(g, "#fff", 0.5); FX.text(g, "CRACK", q[0] + 150, q[1] - 170, 120 + s * 120, { color: "#ffd23f", stroke: "#0b0630", rot: -0.14, alpha: 1 - s / 0.3 }); }
    });
    c.add(0.5, (g) => FX.debris(g, add(DRACULA.J(F(154)).hL, [0, 0, 0.2]), c.t - F(154), { n: 5, colors: ["#5a3420", "#7a4a2c"], size: 0.16, speed: 3, dir: 1.2, cone: 4 }));
  };
  // 9. one blow, and Holmes goes through the chimney
  S.throw = (c) => {
    const hx = HOLMES.at(c.t).pos[0], fx = mix(-0.5, -8.2, P.ease.io(prog(c.t, 157, 166)));
    c.cam([fx + 1.5, 1.5, k1(prog(c.t, 157, 168), 6.5, 10.5)], [fx, 1.2, -0.6], 38);
    rattle(c, [[157, 50], [165, 60]]);
    c.env.smash = c.t >= F(165);
    impact(c, 157, () => DRACULA.J(F(157)).hR);
    cast(c, { h: { fps: 24, ghosts: c.t > F(157.5) && c.t < F(166) ? 4 : 0, ghostStep: 1 / 36 }, d: { fps: 24 } });
    c.add([-8.2, 1.3, -0.4], (g) => FX.debris(g, [-8.2, 1.4, -1.2], c.t - F(165), { n: 26, dir: Math.PI, cone: 2.4, speed: 7, size: 0.26, seed: 3 }));
    c.add([-8.2, 1.3, 0.2], (g) => { FX.dust(g, [-8.3, 0.3, -1.2], c.t - F(165), { n: 12, r: 0.8, spread: 2.2, life: 1.2, push: [-2.2, 0, 0], color: "#f3c9b2", seed: 21 }); FX.dust(g, [-10.4, 0, -1.1], c.t - F(167), { n: 8, r: 0.5, spread: 1.2, life: 1.0, seed: 22 }); });
    c.over((g) => { const p = c.t - F(165); if (p >= 0 && p < 0.3) { FX.flash(g, "#fff", 0.6 * (1 - p / 0.3)); FX.text(g, "KRAKOOM", 620, 330, 190 + p * 160, { color: "#ff8a3d", stroke: "#0b0630", rot: -0.1, alpha: 1 - p / 0.3 }); } });
  };
  // 10. in the rubble
  S.rubble = (c) => {
    const J = HOLMES.J(c.tq);
    c.cam(add(J.head, [2.1 - c.u * 0.25, -0.15, 2.3]), add(J.head, [0.1, -0.12, 0]), 34, -0.05);
    c.env.smash = true; c.near = true;
    c.actor(HOLMES);
    c.under((g) => FX.dust(g, add(J.pelvis, [-0.9, -0.4, -1.0]), c.lt + 0.5, { n: 8, r: 0.5, spread: 1.8, life: 1.9, color: "#f3c9b2", seed: 31, rise: 0.7, alpha: 0.7 }));
    c.over((g) => FX.bars(g, 1));
  };
  // 11. 5:55
  S.clock1 = (c) => { c.cam([30 - c.u * 0.8, 17.5, -4], [46.7, 20, -10], 26); c.env.clock = 5.917 + c.u * 0.004; c.env.smash = true; c.noChip = false; };
  // 12. he gets up; the count waits
  S.rise = (c) => {
    c.cam(k3(c.u, [-13.4, 1.0, 1.4], [-13.0, 1.35, 1.2]), [-4, 1.6, -1.4], 40);
    c.env.smash = true; c.env.clock = 5.92; cast(c);
  };
  // 13. the count comes apart into bats
  S.dissolve = (c) => {
    const J = DRACULA.J(c.tq), up = P.ease.in(prog(c.t, 214, 224));
    c.cam([-2.6, 0.7, 4.4], [0.1, 1.5 + up * 5, 0], 44, 0.05);
    c.env.smash = true; c.actor(DRACULA);
    flock(c, 150, F(213), F(13), [0.15, 1.2, -0.15], [1, 16, -8], { radius: 2.2, turns: 3, stagger: 0.7, spread0: 0.3, spread1: 4, size: 0.32, keep: true, cloud: 5, seed: 7 });
    c.over((g) => { const p = prog(c.t, 213, 215); if (p > 0 && p < 1) FX.flash(g, "#ff2d55", 0.35 * (1 - p)); });
  };
  // 14. scale: what a vampire really is
  S.giant = (c) => {
    const t8 = c.step(8), dive = P.ease.in(prog(c.t, 247, 257)), form = P.ease.out(prog(c.t, 224, 236));
    const bp = lerp3([-3, 19, -30], [-11, 3.5, 0], dive), size = mix(27, 8, dive);
    c.cam(k3(c.u, [-17, 0.9, 13], [-16.2, 0.8, 12]), k3(c.u, [-6, 10.5, -20], [-7, 11.5, -20]), 52, -0.04);
    c.env.smash = true; rattle(c, [[250, 20], [254, 40]]);
    c.actor(HOLMES, { solid: "#1a1338", rim: "#c9f1ff" });
    c.add(60, (g) => {
      g.save(); g.globalAlpha = form;
      FX.bat(g, bp, size * (0.8 + 0.2 * form), t8 * 2.4, "#120a2a");
      // the eyes: two slits of red
      for (const k of [1, -1]) { const q = P.project(add(bp, [k * size * 0.07, size * -0.12, 0.5])), r = P.pxAt(bp, size * 0.035); if (q) { FX.poly(g, [[q[0] - r * 1.6 * k, q[1] - r * 0.5], [q[0] + r * 1.4 * k, q[1] + r * 0.2], [q[0] - r * 0.6 * k, q[1] + r * 0.9]], "#ff2d55"); } }
      g.restore();
    });
    c.add(40, (g) => FX.swarm(g, 170, c.step(12), (off, sp, i, j) => { const a = i * 2.4 + c.t * (0.5 + sp * 0.5), r = size * (0.5 + off * 1.3); return add(bp, [Math.cos(a) * r * 1.5, Math.sin(a * 1.3) * r * 0.45 + j[1] * 4, Math.sin(a) * r * 0.5 + 2]); }, { size: 0.5, seed: 12, wobble: 0.6 }));
    c.over((g) => { const q = P.project(bp); FX.speedLines(g, { cx: q ? q[0] : 960, cy: q ? q[1] : 400, color: "#ff2d55", alpha: 0.28 + 0.5 * dive, n: 40, inner: 0.5 - dive * 0.2, seed: Math.floor(c.t * 8) }); if (dive > 0.75) FX.flash(g, "#120a2a", (dive - 0.75) * 4); });
  };
  // the swarm that hunts him across the roofs
  const hunt = (c, n, lag = 0.2, o = {}) => c.add(o.z ?? HOLMES.J(c.t).chest, (g) => FX.swarm(g, n, c.t, (off, sp, i, j) => { const tt = c.t - lag - off * (o.len || 1.0), p = HOLMES.at(Math.max(tt, F(257))).pos; return add(p, [j[0] * 1.4 - 1.2 - off * 2.2, 1.3 + j[1] * 1.8 + off * 1.2, j[2] * 2.4 + (o.dz || 0)]); }, { size: o.size || 0.3, seed: o.seed || 17, wobble: 0.45 }));
  // 15. run
  S.chase = (c) => {
    const hp = HOLMES.at(c.t).pos;
    c.cam([hp[0] + 1.6, 0.95, 7.0], [hp[0] + 0.4, 1.55, 0], 40, 0.03);
    c.env.smash = true; c.shake(5, 7);
    c.actor(HOLMES, { fps: 24, ghosts: 2, ghostStep: 1 / 24 });
    hunt(c, 120, 0.12, { len: 1.5 }); hunt(c, 12, 0.3, { z: 3, seed: 5, size: 0.42, dz: 3.2, len: 2 });
    c.under((g) => { for (let i = 0; i < 9; i++) { const ts = F(257) + 0.2 + i * 0.36; FX.dust(g, [HOLMES.at(ts).pos[0], 0, 0.1], c.t - ts, { seed: 40 + i, n: 3, r: 0.2, spread: 0.3, life: 0.45 }); } });
    c.over((g) => FX.streaks(g, { alpha: 0.22, seed: Math.floor(c.t * 12), n: 16, thick: 0.7 }));
  };
  // 16. the jump, against the moon
  S.leap = (c) => {
    const hp = HOLMES.at(c.t).pos;
    c.cam([11.0 + c.u * 1.2, -0.7, 7.4], [11.6 + c.u * 0.8, 1.3, 0], 46, -0.05);
    c.actor(HOLMES, { fps: 24, ghosts: 3, ghostStep: 1 / 24, ground: false });
    hunt(c, 90, 0.14, { len: 1.1 });
    c.under((g) => FX.dust(g, [9.3, 0, 0], c.t - F(293), { seed: 51, n: 6, push: [-0.8, 0, 0] }));
  };
  // 17. he lands, runs, and turns with nowhere left to go
  S.land = (c) => {
    const hp = HOLMES.at(c.t).pos, cx = Math.max(15.5, hp[0] - 0.4);
    c.cam([cx + 1.2, GB + 1.4, 8.6], [cx + 0.6, GB + 1.15, -0.4], 40);
    rattle(c, [[304, 22]]);
    c.actor(HOLMES, { fps: 24 });
    hunt(c, 100, 0.2, { len: 1.3 });
    c.under((g) => { const p = c.t - F(304); if (p >= 0 && p < 0.4) FX.ring(g, [14.6, GB + 0.03, 0], 0.4 + p * 5, { alpha: 1 - p / 0.4, color: "#dff3ff" }); FX.dust(g, [14.6, GB, 0], p, { seed: 52, n: 8 }); FX.dust(g, [20.2, GB, -0.8], c.t - F(320), { seed: 53, n: 7, push: [1.2, 0, 0] }); });
  };
  // 18. the swarm closes; the count is behind him
  S.vortex = (c) => {
    const u = c.u;
    c.cam(k3(u, [19.2, GB + 2.6, 6.4], [19.6, GB + 1.2, 4.6]), [21.3, GB + 1.25, -0.8], 42, 0.04);
    rattle(c, [[334, 30]]);
    cast(c, { fps: 24 });
    const tt = c.t;
    c.add(2, (g) => FX.swarm(g, 130, tt, (off, sp, i, j) => { const k = prog(tt, 321, 331), a = i * 2.4 + tt * (5 + sp * 3), r = mix(3.3, 0.7, P.ease.in(k)) * (0.55 + off * 0.6), ctr = lerp3([20.7, GB + 1.1, -0.8], [22.2, GB + 1.2, -0.8], k); if (k >= 1 && off < 0.9) return null; return add(ctr, [Math.cos(a) * r, j[1] * 1.6 * (1 - k * 0.6), Math.sin(a) * r]); }, { size: 0.28, seed: 23, wobble: 0.3 }));
    c.over((g) => { const p = c.t - F(331); if (p >= 0 && p < 0.2) FX.flash(g, "#ff2d55", 0.4 * (1 - p / 0.2)); });
  };
  // 19. caught, under the clock
  S.gloat = (c) => {
    c.cam(k3(c.u, [18.0, GB + 0.42, 1.1], [18.4, GB + 0.4, 0.95]), [22.6, GB + 2.25, -1.1], 44, 0.05);
    c.env.clock = 5.975; cast(c);
    c.over((g) => { FX.vignette(g, "#2a0018", 0.5); FX.bars(g, 1); });
  };
  S.smirk = (c) => {
    const J = HOLMES.J(c.tq);
    c.cam(add(J.head, [1.15, 0.0, 1.45 - c.u * 0.1]), add(J.head, [0.05, -0.02, 0]), 20);
    c.actor(HOLMES); c.over((g) => { FX.speedLines(g, { color: "#fff", alpha: 0.4, n: 26, inner: 0.55, seed: Math.floor(c.t * 8) }); FX.bars(g, 1); });
  };
  // 20. six
  S.clock2 = (c) => {
    const hit = c.t >= F(356);
    c.cam([31 - c.u * 0.6, 17.6, -4.4], [46.7, 20, -10], 22);
    c.env.clock = hit ? 6 : 5.992; rattle(c, [[356, 26]]);
    c.over((g) => { const p = c.t - F(356); if (p < 0) return; const q = P.project([46.7, 20, -10]); for (let i = 0; i < 3; i++) { const r = (p * 900 + i * 170) % 620; g.save(); g.strokeStyle = "#fff2c0"; g.globalAlpha = clamp(1 - r / 620) * 0.9; g.lineWidth = 14; g.beginPath(); g.arc(q[0], q[1], 230 + r, 0, 6.3); g.stroke(); g.restore(); } FX.text(g, "BONG", 520, 300, 230 + Math.min(p, 0.2) * 300, { color: "#ffd23f", stroke: "#0b0630", rot: -0.12, alpha: clamp(1.4 - p * 1.2) }); });
  };
  // 21. sunrise
  S.dawn = (c) => {
    const dawn = P.ease.io(c.u);
    c.cam(k3(c.u, [30, GB + 5.5, 13], [28, GB + 3.2, 10]), k3(c.u, [14, 1.5, -6], [18, 1, -3]), 46);
    c.env.dawn = dawn; c.env.clock = 6; c.env.smash = true; c.actorOpts = dawn > 0.4 ? goldRim : {};
    cast(c);
    c.over((g) => { const s = sunAt(dawn); if (s) FX.rays(g, s, { dir: 0.25, spread: 1.0, alpha: 0.34 * dawn, n: 11, seed: 3 }); FX.flash(g, "#fff3c2", 0.25 * Math.sin(c.u * Math.PI)); });
  };
  // 22. the light finds him
  S.burn = (c) => {
    c.cam(k3(c.u, [20.4, GB + 1.25, 5.8], [20.9, GB + 1.3, 5.2]), [22.3, GB + 1.25, -0.8], 40, -0.04);
    c.env.dawn = 1; c.env.clock = 6; c.actorOpts = goldRim; rattle(c, [[379, 20], [388, 14]]);
    cast(c, { fps: 24 });
    const J = DRACULA.J(c.tq);
    c.add(J.chest, (g) => { FX.embers(g, add(J.pelvis, [0, -0.4, 0]), c.lt, { n: 70, window: 1.6, h: 1.7, wind: 0.9, seed: 61 }); FX.dust(g, add(J.chest, [0, 0.2, 0]), (c.lt * 1.2) % 0.7, { n: 5, r: 0.3, spread: 0.5, life: 0.7, color: "#3a2a4a", hi: "#6a5a7a", seed: 62 + Math.floor(c.lt * 1.7), rise: 2.2 }); });
    c.over((g) => { FX.rays(g, [-200, 260], { dir: 0.22, spread: 0.7, alpha: 0.3, n: 8, seed: 4 }); });
  };
  // 23. ash
  S.ash = (c) => {
    c.cam(k3(c.u, [20.6, GB + 0.9, 5.0], [20.2, GB + 1.2, 6.4], "out"), [22.6, GB + 1.5, -0.8], 42, 0.05);
    c.env.dawn = 1; c.env.clock = 6; c.actorOpts = goldRim; rattle(c, [[399, 46]]);
    const ctr = () => add(DRACULA.J(F(399)).chest, [0, 0.1, 0]);
    impact(c, 399, ctr, "#ffb627");
    cast(c, { fps: 24 });
    c.add(ctr(), (g) => { FX.embers(g, add(ctr(), [0, -1.2, 0]), c.lt, { n: 160, window: 0.9, h: 2.2, r: 0.7, wind: 1.6, size: 0.07, seed: 71 }); FX.dust(g, ctr(), c.lt - 0.08, { n: 9, r: 0.34, spread: 1.5, life: 0.8, color: "#ffb627", hi: "#fff3c2", seed: 72, rise: 2.2, push: [1.5, 0, 0] }); const p = c.lt; if (p < 0.5) FX.ring(g, add(ctr(), [0, -1.2, 0]), 0.4 + p * 7, { alpha: 1 - p / 0.5, color: "#fff3c2" }); });
    flock(c, 26, F(400), F(16), ctr(), [34, 14, -12], { radius: 1.5, turns: 2, color: "#ff8a3d", size: 0.3, stagger: 0.3, spread1: 5, seed: 9 });
    c.over((g) => FX.rays(g, [-200, 200], { dir: 0.2, spread: 0.7, alpha: 0.3, n: 8, seed: 4 }));
  };
  // 24. good morning
  S.end = (c) => {
    const u = c.u, J = HOLMES.J(c.tq);
    c.cam(k3(u, [22.6, GB + 1.5, 3.6], [25.5, GB + 2.6, 8.5]), k3(u, [20.6, GB + 1.3, -0.8], [19.5, GB + 1.6, -1.5]), k1(u, 36, 40));
    c.env.dawn = 1; c.env.clock = 6.02; c.actorOpts = goldRim;
    c.actor(HOLMES);
    c.over((g) => {
      const s = sunAt(1); if (s) FX.rays(g, s, { dir: 0.2, spread: 1.0, alpha: 0.26, n: 11, seed: 3 });
      const a = E.back(prog(c.t, 438, 444)), b = E.out(prog(c.t, 442, 448)), d = E.out(prog(c.t, 450, 456));
      if (a > 0) { g.save(); g.globalAlpha = clamp(a); g.setTransform(1, 0, -0.18, 1, 0, 0); g.fillStyle = "#0b0630"; g.fillRect(290, 196, 1500, 270); g.restore(); FX.text(g, "WINNER", 960, 262, 74, { color: "#ffd23f", track: 0.3, shadow: false, alpha: clamp(a) }); FX.text(g, "SHERLOCK HOLMES", 960, 380, 150 * a, { color: "#fff", stroke: "#ff2d55", strokeW: 0.05 }); }
      if (b > 0) FX.text(g, "\u201CELEMENTARY.\u201D", 960, 540, 78, { color: "#fff", stroke: "#0b0630", alpha: b, track: 0.12 });
      if (d > 0) { FX.text(g, "NEXT ROUND  ·  YOU PICK THE FIGHT", 960, 960, 76, { color: "#fff", stroke: "#0b0630", alpha: d, track: 0.12 }); }
    });
  };
})();
