// Set for episode 1: Victorian London rooftops, moonlit, low-poly.
// y = 0 is the surface of the fight roof (roof A). The fight plays along x; most cameras sit at +z looking -z.
// env: { dawn: 0..1 (night -> sunrise), smash: bool (the chimney is gone), clock: hours as a float }
STAGE.sets.london = function (K) {
  const { T, scene, col, flat, lambert, jitter, tex, mesh, boxUV, prism, rng } = K;
  const P = PEN, R = rng(41), rr = (a, b) => a + (b - a) * R();
  const STREET = -22;

  // ---------- palette: night values, each with the colour it turns at dawn ----------
  const NIGHT = { top: "#120c46", mid: "#4b1f93", hor: "#e8497e", fog: "#6a3399", hemiSky: "#8f84ff", hemiGround: "#40205f", key: "#b9ccff", cloud: "#8a4fc0" };
  const DAWN = { top: "#3d7fe6", mid: "#ffa66b", hor: "#ffe7a0", fog: "#ffc8a2", hemiSky: "#ffe2bd", hemiGround: "#b0623f", key: "#ffc46b", cloud: "#ffb7a0" };
  const WALLS = ["#4a3a96", "#35509e", "#5b3396", "#2f6a9c", "#6a3f8f", "#3c4fb0"], ROOFS = ["#1f7a8c", "#24508c", "#167a72", "#2c3f8f", "#19658f"];

  // ---------- textures: a few simple shapes, hard pixels ----------
  // walls: 4 x 4 cells, each with one window; some lit
  const lit = []; for (let i = 0; i < 16; i++) lit.push(R() < 0.42);
  const wallDraw = (emissive) => (g, w, h) => {
    g.fillStyle = emissive ? "#000" : "#e9e4f2"; g.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 4;
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      if (!emissive) { g.fillStyle = "rgba(0,0,40,0.10)"; g.fillRect(x, y + ch - 2, cw, 2); }
      g.fillStyle = lit[i] ? (emissive ? (i % 3 ? "#ffc75a" : "#ff9a3d") : "#ffe9ad") : emissive ? "#000" : "#2a2466";
      g.fillRect(x + cw * 0.3, y + ch * 0.22, cw * 0.4, ch * 0.5);
      if (!emissive) { g.fillStyle = "rgba(0,0,30,0.35)"; g.fillRect(x + cw * 0.48, y + ch * 0.22, 1, ch * 0.5); }
    }
  };
  const wallMap = tex(64, 64, wallDraw(false), true), wallGlow = tex(64, 64, wallDraw(true), true);
  const tileMap = tex(32, 32, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#cfe3ea"; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.fillStyle = "rgba(0,30,60,0.25)"; g.fillRect(0, 0, w, 1); g.fillRect(0, h / 2, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w / 2, 0, 1, h); }, true);
  const brickMap = tex(32, 32, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(60,0,0,0.3)"; for (let r = 0; r < 4; r++) { g.fillRect(0, r * 8, w, 1); for (let c = 0; c < 2; c++) g.fillRect(((c * 16 + (r % 2) * 8) % 32), r * 8, 1, 8); } }, true);

  const wallMats = WALLS.map((c) => lambert(c, { map: wallMap, emissive: "#ffffff", emissiveMap: wallGlow }));
  const roofMats = ROOFS.map((c) => lambert(c));
  const brick = lambert("#e0623c", { map: brickMap }), stone = lambert("#7a5fc0"), dark = lambert("#2a2466");

  // ---------- sky ----------
  const skyGeo = new T.SphereGeometry(900, 20, 12), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute("color", new T.BufferAttribute(skyCol, 3));
  const sky = mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }), null, { cast: false, receive: false });
  const disc = (r, c, dir, o = {}) => { const m = mesh(new T.CircleGeometry(r, o.seg || 28), new T.MeshBasicMaterial({ color: c, fog: false, transparent: true, opacity: o.opacity ?? 1, depthWrite: false }), dir.map((v) => v * (o.dist || 860)), { cast: false, receive: false }); m.lookAt(0, 0, 0); return m; };
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const MOON = nrm([-0.16, 0.2, -1]);
  const moonHalo = disc(118, "#ff86b6", MOON, { opacity: 0.2, dist: 870 }), moonHalo2 = disc(84, "#ffc2d8", MOON, { opacity: 0.25, dist: 866 });
  const moon = disc(60, "#fff3c7", MOON, { seg: 14 });
  const craters = [[-0.3, 0.25, 0.2], [0.25, -0.1, 0.28], [-0.05, -0.45, 0.15], [0.4, 0.4, 0.12]].map(([x, y, r]) => { const m = mesh(new T.CircleGeometry(60 * r, 7), new T.MeshBasicMaterial({ color: "#f3d9a4", fog: false, transparent: true, depthWrite: false }), null, { cast: false, receive: false, parent: moon }); m.position.set(60 * x, 60 * y, 1); return m; });
  const sun = disc(60, "#fff6d0", [0, 0, -1], { seg: 16, dist: 850 }), sunHalo = disc(190, "#ffd98a", [0, 0, -1], { opacity: 0.3, dist: 856 });
  const starGeo = new T.BufferGeometry(), sp = [];
  for (let i = 0; i < 320; i++) { const a = R() * 6.283, e = 0.08 + R() * 1.3; sp.push(Math.cos(a) * Math.cos(e) * 880, Math.sin(e) * 880, Math.sin(a) * Math.cos(e) * 880); }
  starGeo.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false })); scene.add(stars);
  // clouds: squashed low-poly lumps that drift
  const cloudMat = lambert(NIGHT.cloud, { fog: false }), clouds = [];
  for (let i = 0; i < 9; i++) {
    const grp = new T.Group(), a = -2.6 + i * 0.52 + rr(-0.1, 0.1), d = rr(380, 620);
    grp.position.set(Math.sin(a) * d, rr(70, 190), -Math.cos(a) * d * (i % 4 === 3 ? -0.6 : 1));
    for (let k = 0; k < 5; k++) mesh(flat(new T.IcosahedronGeometry(rr(22, 46), 0)), cloudMat, [k * 34 - 68 + rr(-8, 8), rr(-6, 6), rr(-14, 14)], { parent: grp, cast: false, receive: false, scale: [1.5, 0.42, 1] });
    scene.add(grp); clouds.push(grp);
  }

  // ---------- lights ----------
  const hemi = new T.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, 2.2); scene.add(hemi);
  const key = new T.DirectionalLight(NIGHT.key, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -45, right: 60, top: 50, bottom: -40, near: 10, far: 400 }); key.shadow.bias = -0.0015;
  scene.add(key); scene.add(key.target);
  scene.fog = new T.Fog(NIGHT.fog, 70, 520);

  // ---------- buildings ----------
  function building(x, z, w, d, top, o = {}) {
    const h = top - STREET, wm = wallMats[Math.floor(R() * wallMats.length)];
    mesh(boxUV(w, h, d, 10.4, 12.8), o.wall || wm, [x, STREET + h / 2, z], { rot: [0, o.rot || 0, 0] });
    if (o.flat) return;
    const rh = rr(2.2, 4.5), roofM = roofMats[Math.floor(R() * roofMats.length)];
    const pr = mesh(jitter(prism(w, d, rh), "#ffffff", 0.16, x + z), new T.MeshLambertMaterial({ color: roofM.color, vertexColors: true, flatShading: true }), [x, top, z], { rot: [0, (o.rot || 0) + (R() < 0.5 ? 0 : Math.PI / 2) * (Math.abs(w - d) < 2 ? 1 : 0), 0] });
    if (R() < 0.75) mesh(new T.BoxGeometry(0.9, rh + 1.4, 0.9), brick, [x + rr(-w / 3, w / 3), top + rh / 2 + 0.3, z + rr(-d / 4, d / 4)]);
    return pr;
  }
  // the city: scattered blocks all round, lower than the fight roof nearby, a few taller far off
  for (let i = 0; i < 210; i++) {
    const a = R() * 6.283, d = 22 + Math.pow(R(), 0.8) * 260, x = 10 + Math.cos(a) * d, z = Math.sin(a) * d * 0.9;
    const w = rr(8, 17), dd = rr(8, 15);
    if (x > -19 - w / 2 && x < 37 + w / 2 && Math.abs(z) < 12 + dd / 2) continue;          // the two fight roofs
    if (Math.hypot(x - 52, z + 10) < 12 + w / 2) continue;                               // the clock tower
    if (z < -128 && z > -168) continue;                                                  // the river
    const far = d > 120;
    building(x, z, w, dd, far ? rr(-17, R() < 0.12 ? 8 : -3) : rr(-17, -4.5), { rot: rr(-0.12, 0.12) });
  }
  mesh(new T.PlaneGeometry(2400, 2400), lambert("#2b1a5e"), [0, STREET, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  // the river and a bridge, far back
  mesh(new T.PlaneGeometry(2400, 34), new T.MeshLambertMaterial({ color: "#3f7fe8", emissive: "#2244aa", emissiveIntensity: 0.5 }), [0, STREET + 0.3, -148], { rot: [-Math.PI / 2, 0, 0], cast: false });
  for (const bx of [-64, -36]) { mesh(new T.BoxGeometry(7, 30, 9), stone, [bx, STREET + 15, -148]); mesh(flat(new T.ConeGeometry(5.6, 9, 4)), roofMats[0], [bx, STREET + 34.5, -148], { rot: [0, Math.PI / 4, 0] }); }
  mesh(new T.BoxGeometry(110, 2.2, 6), dark, [-50, STREET + 8, -148]);
  // a great dome on the skyline
  mesh(new T.CylinderGeometry(15, 16, 22, 10), stone, [-92, STREET + 11, -92]); mesh(flat(new T.SphereGeometry(15, 10, 6, 0, 6.283, 0, 1.571)), roofMats[1], [-92, STREET + 22, -92]); mesh(flat(new T.ConeGeometry(2.4, 9, 6)), stone, [-92, STREET + 41, -92]);

  // ---------- the fight roofs ----------
  const deckMat = (c) => lambert(c, { map: tileMap });
  function roof(x0, x1, z0, z1, top, c, wallM, openSides = "") {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = top - STREET;
    mesh(boxUV(w, h - 0.3, d, 10.4, 12.8), wallM, [cx, STREET + (h - 0.3) / 2, cz]);
    const slab = new T.BoxGeometry(w + 0.5, 0.3, d + 0.5), uv = slab.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2.4, uv.getY(i) * d / 2.4);
    mesh(slab, deckMat(c), [cx, top - 0.15, cz]);
    const pm = lambert("#8d7fe0"), ph = 0.5, pw = 0.4;
    if (!openSides.includes("n")) mesh(new T.BoxGeometry(w + 0.5, ph, pw), pm, [cx, top + ph / 2, z0 - 0.05]);
    if (!openSides.includes("s")) mesh(new T.BoxGeometry(w + 0.5, ph, pw), pm, [cx, top + ph / 2, z1 + 0.05]);
    if (!openSides.includes("w")) mesh(new T.BoxGeometry(pw, ph, d + 0.5), pm, [x0 - 0.05, top + ph / 2, cz]);
    if (!openSides.includes("e")) mesh(new T.BoxGeometry(pw, ph, d + 0.5), pm, [x1 + 0.05, top + ph / 2, cz]);
  }
  roof(-13, 10, -7, 7, 0, "#4fb3bf", wallMats[1], "e");
  roof(13.5, 31, -8, 8, -1.2, "#5aa0d8", wallMats[4], "w");
  // roof furniture: the chimney that gets smashed, another one, a glowing skylight, vents
  const chimney = new T.Group(); chimney.position.set(-8.2, 0, -1.2); scene.add(chimney);
  const brickTall = () => { const g = new T.BoxGeometry(1.4, 2.6, 1.4), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3); return g; };
  mesh(brickTall(), brick, [0, 1.3, 0], { parent: chimney }); mesh(new T.BoxGeometry(1.7, 0.25, 1.7), stone, [0, 2.72, 0], { parent: chimney });
  for (const px of [-0.35, 0.35]) mesh(flat(new T.CylinderGeometry(0.2, 0.26, 0.7, 6)), lambert("#ff9a5c"), [px, 3.2, 0], { parent: chimney });
  const stub = new T.Group(); stub.position.copy(chimney.position); stub.visible = false; scene.add(stub);
  mesh(new T.BoxGeometry(1.4, 0.5, 1.4), brick, [0, 0.25, 0], { parent: stub });
  for (let i = 0; i < 7; i++) mesh(new T.BoxGeometry(rr(0.25, 0.5), rr(0.15, 0.3), rr(0.2, 0.4)), brick, [rr(-1.6, 1.2), 0.12, rr(-1.3, 1.3)], { parent: stub, rot: [0, rr(0, 3), rr(-0.3, 0.3)] });
  mesh(brickTall(), brick, [7.2, 1.3, -5.2]); mesh(new T.BoxGeometry(1.7, 0.25, 1.7), stone, [7.2, 2.72, -5.2]);
  mesh(prism(2.4, 1.5, 0.7, 0), new T.MeshLambertMaterial({ color: "#ffc86b", emissive: "#ff9a2e", emissiveIntensity: 0.45, flatShading: true }), [2.5, 0, -5.6]);
  for (let i = 0; i < 3; i++) mesh(flat(new T.CylinderGeometry(0.22, 0.3, 0.8, 6)), dark, [-3.5 + i * 0.9, 0.4, -6]);
  mesh(brickTall(), brick, [27.5, 0.1, -6]); mesh(new T.BoxGeometry(1.7, 0.25, 1.7), stone, [27.5, 1.52, -6]);
  mesh(new T.BoxGeometry(3, 1.6, 2.2), lambert("#7d6ad6"), [19, -0.4, -6.4]);

  // ---------- the clock tower ----------
  const tower = new T.Group(); tower.position.set(52, 0, -10); scene.add(tower);
  const towerStone = lambert("#7b5cd6");
  mesh(jitter(flat(new T.BoxGeometry(9, 15.5 - STREET, 9, 1, 6, 1)), "#ffffff", 0.1, 5), new T.MeshLambertMaterial({ color: "#6f52c8", vertexColors: true, flatShading: true }), [0, (15.5 + STREET) / 2, 0], { parent: tower });
  for (const [bx, bz] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) { mesh(new T.BoxGeometry(1.5, 46 - STREET - 22, 1.5), towerStone, [bx, (24 + STREET) / 2, bz], { parent: tower }); mesh(flat(new T.ConeGeometry(1.2, 4, 4)), roofMats[0], [bx, 27.5, bz], { parent: tower, rot: [0, Math.PI / 4, 0] }); }
  mesh(new T.BoxGeometry(10.4, 9.5, 10.4), towerStone, [0, 20, 0], { parent: tower });
  mesh(new T.BoxGeometry(11.2, 0.6, 11.2), lambert("#a892f0"), [0, 15.4, 0], { parent: tower }); mesh(new T.BoxGeometry(11.2, 0.6, 11.2), lambert("#a892f0"), [0, 24.9, 0], { parent: tower });
  mesh(new T.BoxGeometry(7.6, 5, 7.6), lambert("#5a43b0"), [0, 27.6, 0], { parent: tower });
  mesh(flat(new T.ConeGeometry(6.6, 15, 4)), roofMats[0], [0, 37.6, 0], { parent: tower, rot: [0, Math.PI / 4, 0] });
  mesh(flat(new T.SphereGeometry(0.7, 6, 4)), lambert("#ffd166", { emissive: "#ffb000", emissiveIntensity: 0.6 }), [0, 45.6, 0], { parent: tower });
  // four clock faces with hands
  const faceMat = new T.MeshBasicMaterial({ color: "#fff2c0" }), hands = [];
  for (let k = 0; k < 4; k++) {
    const f = new T.Group(); f.rotation.y = (k * Math.PI) / 2; f.position.set(Math.sin(f.rotation.y) * 5.25, 20, Math.cos(f.rotation.y) * 5.25); tower.add(f);
    mesh(new T.CircleGeometry(4.0, 12), new T.MeshBasicMaterial({ color: "#2a1f66" }), [0, 0, 0], { parent: f, cast: false });
    mesh(new T.CircleGeometry(3.55, 24), faceMat, [0, 0, 0.03], { parent: f, cast: false });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; mesh(new T.BoxGeometry(0.16, i % 3 ? 0.45 : 0.8, 0.02), dark, [Math.sin(a) * 3.0, Math.cos(a) * 3.0, 0.06], { parent: f, rot: [0, 0, -a], cast: false }); }
    const mk = (len, wd) => { const piv = new T.Group(); piv.position.z = 0.09; f.add(piv); mesh(new T.BoxGeometry(wd, len, 0.03), dark, [0, len / 2 - 0.3, 0], { parent: piv, cast: false }); return piv; };
    hands.push({ h: mk(2.0, 0.34), m: mk(3.0, 0.2) });
  }

  const skyPos = skyGeo.attributes.position, c3 = (a, b, u) => col(a).lerp(col(b), u);
  let lastDawn = -1;
  return {
    sky,
    update(env, t) {
      const dawn = env.dawn || 0;
      if (dawn !== lastDawn) {
        lastDawn = dawn;
        const top = c3(NIGHT.top, DAWN.top, dawn), mid = c3(NIGHT.mid, DAWN.mid, dawn), hor = c3(NIGHT.hor, DAWN.hor, dawn);
        for (let i = 0; i < skyPos.count; i++) {
          const h = skyPos.getY(i) / 900, x = skyPos.getX(i) / 900;
          // dawn breaks on the -x side first
          const side = P.clamp(0.5 - x * 0.5), d2 = P.clamp(dawn * (0.55 + side * 0.9));
          const tp = c3(NIGHT.top, DAWN.top, d2), md = c3(NIGHT.mid, DAWN.mid, d2), hr = c3(NIGHT.hor, DAWN.hor, d2);
          const c = h < 0 ? hr.clone().multiplyScalar(1 + h * 0.6) : h < 0.1 ? hr.clone().lerp(md, h / 0.1) : md.clone().lerp(tp, Math.pow(P.clamp((h - 0.1) / 0.42), 0.8));
          skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
        }
        skyGeo.attributes.color.needsUpdate = true;
        scene.fog.color.copy(c3(NIGHT.fog, DAWN.fog, dawn));
        hemi.color.copy(c3(NIGHT.hemiSky, DAWN.hemiSky, dawn)); hemi.groundColor.copy(c3(NIGHT.hemiGround, DAWN.hemiGround, dawn)); hemi.intensity = 2.2 + dawn * 0.5;
        key.color.copy(c3(NIGHT.key, DAWN.key, dawn)); key.intensity = 2.4 + dawn * 2.4;
        cloudMat.color.copy(c3(NIGHT.cloud, DAWN.cloud, dawn));
        const sd = nrm([-1, -0.1 + dawn * 0.28, -0.42]);
        sun.position.set(sd[0] * 850, sd[1] * 850, sd[2] * 850); sun.lookAt(0, 0, 0); sunHalo.position.set(sd[0] * 856, sd[1] * 856, sd[2] * 856); sunHalo.lookAt(0, 0, 0);
        sun.visible = sunHalo.visible = dawn > 0.02; sunHalo.material.opacity = 0.35 * dawn;
        // the key light swings from the moon to the low sun
        const kd = nrm([P.mix(MOON[0], sd[0], dawn), P.mix(MOON[1] + 0.25, Math.max(0.22, sd[1] + 0.2), dawn), P.mix(MOON[2] * -0.6, 0.35, dawn)]);
        key.position.set(10 + kd[0] * 150, kd[1] * 150, kd[2] * 150); key.target.position.set(10, 0, 0);
        moon.material.opacity = 1 - dawn * 0.8; moonHalo.material.opacity = 0.22 * (1 - dawn); moonHalo2.material.opacity = 0.25 * (1 - dawn);
        craters.forEach((m) => (m.material.opacity = 1 - dawn * 0.8));
        stars.material.opacity = 1 - P.clamp(dawn * 1.6);
        wallMats.forEach((m) => (m.emissiveIntensity = 1.15 * (1 - dawn * 0.85)));
      }
      // positions are a function of t, so frames are repeatable
      clouds.forEach((c, i) => { if (c.userData.x0 == null) c.userData.x0 = c.position.x; c.position.x = c.userData.x0 + t * (1.2 + (i % 3) * 0.5); });
      chimney.visible = !env.smash; stub.visible = !!env.smash;
      const hr = env.clock ?? 5.2;
      for (const k of hands) { k.h.rotation.z = -(hr / 12) * 6.283; k.m.rotation.z = -(hr % 1) * 6.283; }
    },
  };
};
