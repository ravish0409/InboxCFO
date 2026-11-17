// Draw an episode frame by frame in headless Chromium.
//   node tools/render.js snap 1.0 3.5 6.0          stills              -> out/tmp/snap/t_<time>.jpg
//   node tools/render.js sheet 0.5 1.5 ...         contact sheet       -> out/tmp/snap/sheet.jpg
//   node tools/render.js poses guard,jab holmes    key-pose check      -> out/tmp/snap/poses.jpg
//   node tools/render.js cues                      the sound cue sheet -> out/tmp/cues.json (read by tools/audio.py)
//   node tools/render.js all [from] [to]           every frame, 24 fps -> out/tmp/frames/f_00000.jpg
//   EP=ep01 picks the episode (default ep01). PART=i/n renders the i-th of n slices (for parallel runs).
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), EP = process.env.EP || 'ep01', FPS = 24;
const [mode, ...rest] = process.argv.slice(2);
if (!mode) { console.log('usage: node tools/render.js snap|sheet|poses|all ...'); process.exit(1); }
function playwright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  try { return require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  throw new Error('Playwright not found: npm i -g playwright');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
const serve = (dir) => new Promise((res) => {
  const srv = http.createServer((q, r) => {
    const p = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(r);
  });
  srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => srv.close() }));
});
(async () => {
  const srv = await serve(ROOT);
  // WebGL in software (SwiftShader) so it renders the same on any machine, with or without a GPU
  const b = await playwright().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e.message || e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
  await p.goto(`http://127.0.0.1:${srv.port}/player.html?ep=${EP}&t=0`, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const fail = await p.evaluate(() => window.__error);
  if (fail) { console.error('page failed:', fail); await b.close(); srv.close(); process.exit(1); }
  const D = await p.evaluate(() => window.EP.D);
  const grab = async (t, q = 0.93) => {
    const url = await p.evaluate(async ([t, q]) => { await window.__frameAt(t); return document.getElementById('stage').toDataURL('image/jpeg', q); }, [t, q]);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  const dir = path.join(ROOT, 'out', 'tmp', mode === 'all' ? 'frames' : 'snap');
  fs.mkdirSync(dir, { recursive: true });
  if (mode === 'snap') {
    for (const s of rest) { const t0 = Date.now(); fs.writeFileSync(path.join(dir, `t_${(+s).toFixed(2)}.jpg`), await grab(+s)); console.log(s, (Date.now() - t0) + ' ms'); }
  } else if (mode === 'sheet') {
    const imgs = []; for (const s of rest) imgs.push((await grab(+s, 0.8)).toString('base64'));
    const cols = Math.min(+process.env.COLS || 4, imgs.length), cw = +process.env.CW || 480, chh = Math.round(cw * 9 / 16);
    const html = `<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;width:${cw * cols}px">${imgs.map((d, i) => `<div style="position:relative"><img src="data:image/jpeg;base64,${d}" style="width:${cw}px;height:${chh}px;display:block"><span style="position:absolute;left:4px;top:2px;color:#ff0;font:bold 16px sans-serif;text-shadow:0 0 3px #000">${rest[i]}</span></div>`).join('')}</body>`;
    const pg = await b.newPage({ viewport: { width: cw * cols, height: chh * Math.ceil(imgs.length / cols) } });
    await pg.setContent(html);
    await pg.screenshot({ path: path.join(dir, process.env.OUT || 'sheet.jpg'), type: 'jpeg', quality: 85 });
  } else if (mode === 'poses') {
    await p.goto(`http://127.0.0.1:${srv.port}/player.html?ep=${EP}&poses=${rest[0]}&who=${rest[1] || ''}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ready || window.__error); await p.waitForTimeout(400);
    fs.writeFileSync(path.join(dir, process.env.OUT || 'poses.jpg'), Buffer.from((await p.evaluate(() => document.getElementById('stage').toDataURL('image/jpeg', 0.85))).split(',')[1], 'base64'));
  } else if (mode === 'cues') {
    const out = path.join(ROOT, 'out', 'tmp', 'cues.json');
    fs.writeFileSync(out, JSON.stringify(await p.evaluate(() => ({ D: window.EP.D, title: window.EP.title, cues: window.EP.cues || [], score: window.EP.score || [] }))));
    console.log('cues ->', out);
  } else if (mode === 'all') {
    const [pi, pn] = (process.env.PART || '0/1').split('/').map(Number);
    const F0 = Math.round((+rest[0] || 0) * FPS), F1 = Math.round((rest[1] != null ? +rest[1] : D) * FPS);
    if (pi === 0) for (const f of fs.readdirSync(dir)) if (/^f_\d+\.jpg$/.test(f)) { const n = +f.slice(2, 7); if (n >= F1 - F0) fs.unlinkSync(path.join(dir, f)); }
    const t0 = Date.now();
    for (let f = F0; f < F1; f++) {
      if ((f - F0) % pn !== pi) continue;
      fs.writeFileSync(path.join(dir, `f_${String(f - F0).padStart(5, '0')}.jpg`), await grab(f / FPS));
      if (pi === 0 && f % FPS === 0) process.stdout.write(`${(f / FPS).toFixed(0)}s `);
    }
    console.log(`\npart ${pi}/${pn}: frames ${F0}-${F1} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } else console.log('unknown mode', mode);
  if (errs.length) console.log('errors:', errs.slice(0, 6));
  await b.close(); srv.close();
})();
