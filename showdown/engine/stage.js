// STAGE: the low-poly world behind the pen-drawn cast.
// A three.js scene is rendered with exactly the camera PEN uses for the figures, then copied onto the 2D canvas,
// so drawn characters and 3D backgrounds share one perspective, one shake and one depth order.
// A set is a function (kit) => { update(env, t) } that fills kit.scene; see episodes/*/set.js.
(function () {
  const P = PEN, { W, H } = PEN, T = THREE;
  const STAGE = (window.STAGE = { sets: {} });
  const gl = Object.assign(document.createElement("canvas"), { width: W, height: H });
  let renderer = null, scene = null, cam = null, current = null;

  // ---------- helpers every set uses ----------
  const col = (c) => new T.Color(c);
  const mixHex = (a, b, u) => col(a).lerp(col(b), u);
  // flat-shaded: every face gets its own normal, so facets catch the light like cut paper
  const flat = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; };
  const lambert = (color, o = {}) => new T.MeshLambertMaterial(Object.assign({ color, flatShading: true }, o));
  // tint each face a little differently so big surfaces don't read as one slab
  function jitter(geo, base, amt, seed) {
    const n = geo.attributes.position.count, c = new Float32Array(n * 3), R = P.rng(seed), b = col(base);
    for (let i = 0; i < n; i += 3) { const k = 1 + (R() - 0.5) * amt, h = (R() - 0.5) * amt * 0.25; for (let j = 0; j < 3; j++) { c[(i + j) * 3] = b.r * k + h; c[(i + j) * 3 + 1] = b.g * k; c[(i + j) * 3 + 2] = b.b * k - h; } }
    geo.setAttribute("color", new T.BufferAttribute(c, 3));
    return geo;
  }
  // a tiny hand-made texture: simple shapes, hard pixels
  function tex(w, h, draw, repeat) {
    const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.magFilter = T.NearestFilter; t.minFilter = T.LinearMipmapLinearFilter; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  function mesh(geo, mat, pos, o = {}) {
    const m = new T.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (o.rot) m.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0);
    if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
    (o.parent || scene).add(m);
    return m;
  }
  // a box whose wall texture repeats by its real size (u: metres across, v: metres up)
  function boxUV(w, h, d, du, dv) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const su = ny > 0.5 ? w / du : nx > 0.5 ? d / du : w / du, sv = ny > 0.5 ? d / dv : h / dv;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(su)), uv.getY(i) * Math.max(1, Math.round(sv)));
    }
    return g;
  }
  // a pitched roof (triangular prism) over a w x d footprint
  function prism(w, d, h, over = 0.4) {
    const x = w / 2 + over, z = d / 2 + over;
    const v = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, 0], [x, h, 0]];
    const f = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [0, 3, 4], [2, 1, 5], [0, 1, 2], [0, 2, 3]];
    const pos = []; for (const t of f) for (const i of t) pos.push(...v[i]);
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }
  STAGE.kit = () => ({ T, scene, col, mixHex, flat, lambert, jitter, tex, mesh, boxUV, prism, rng: P.rng });

  // ---------- lifecycle ----------
  STAGE.use = function (name) {
    if (!renderer) {
      renderer = new T.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setSize(W, H, false);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
      cam = new T.PerspectiveCamera(50, W / H, 0.1, 2000);
    }
    if (current && current.name === name) return current;
    scene = new T.Scene();
    current = Object.assign({ name, scene }, STAGE.sets[name](STAGE.kit()));
    return current;
  };
  function syncCamera(far) {
    const C = P.cam, m = new T.Matrix4().makeBasis(new T.Vector3(...C.r), new T.Vector3(...C.u), new T.Vector3(...C.f).negate());
    cam.position.set(...C.pos); cam.quaternion.setFromRotationMatrix(m);
    cam.fov = (2 * Math.atan(H / 2 / C.foc) * 180) / Math.PI;
    cam.near = 0.1; cam.far = far || 2000;
    // the same screen-space shake the pen lines get
    cam.setViewOffset(W, H, -C.shakeX, -C.shakeY, W, H);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  // the full background for this frame, painted onto the 2D canvas
  STAGE.paint = function (g, env, t) {
    current.update(env || {}, t);
    syncCamera();
    renderer.setClearColor(0x000000, 1); renderer.render(scene, cam);
    g.drawImage(gl, 0, 0);
  };
  // everything nearer than `depth`, painted again over the figures (a chimney or a parapet in front of someone)
  STAGE.paintNear = function (g, depth) {
    if (depth < 0.3) return;
    const bg = scene.background, sky = current.sky; scene.background = null; if (sky) sky.visible = false;
    syncCamera(depth);
    renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
    g.drawImage(gl, 0, 0);
    scene.background = bg; if (sky) sky.visible = true;
  };
})();
