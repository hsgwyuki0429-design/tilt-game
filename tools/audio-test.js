'use strict';
/*
 * The ice sounds, rendered offline in Chromium (no speakers needed):
 *   - a slide swells in, then fades and mellows as the penguin slows,
 *   - it is soft: no harsh top end,
 *   - nothing clips, nothing is silent, nothing is NaN,
 *   - a bump into a penguin is pitched higher than a stop at the edge,
 *   - and in the game every penguin that moves gets its own slide.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' };

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    fs.readFile(path.join(root, p), (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(d);
    });
  });
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(require('./lib/browser').launchOptions());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ── offline: what the sounds are ───────────────────────────────────────────
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'src/audio.js'), 'utf8') });
  const offline = await page.evaluate(async () => {
    const SR = 44100;
    async function render(fn, len) {
      const off = new OfflineAudioContext(1, Math.ceil(SR * len), SR);
      const a = new TiltAudio.Audio();
      a.ctx = off; a.master = off.createGain(); a.master.gain.value = 0.26; a.master.connect(off.destination);
      fn(a);
      return Array.from((await off.startRendering()).getChannelData(0));
    }
    function stats(x, from, to) {
      let e = 0, zc = 0, peak = 0, bad = 0;
      for (let i = from; i < to; i++) {
        if (!isFinite(x[i])) bad++;
        e += x[i] * x[i]; peak = Math.max(peak, Math.abs(x[i]));
        if (i > from && (x[i] >= 0) !== (x[i - 1] >= 0)) zc++;
      }
      return { rms: Math.sqrt(e / (to - from)), zcr: zc / (to - from), peak, bad };
    }
    // Magnitude at a frequency (Goertzel), over a window.
    function mag(x, from, n, f) {
      const w = 2 * Math.PI * f / SR, k = 2 * Math.cos(w); let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
        const s0 = x[from + i] * h + k * s1 - s2; s2 = s1; s1 = s0;
      }
      return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2);
    }
    const dur = 0.27, slide = await render(a => a.slide(0, dur, 4, 0), dur + 0.15);
    const q = Math.floor(SR * dur / 4);
    const first = stats(slide, 0, q), last = stats(slide, 3 * q, 4 * q), all = stats(slide, 0, slide.length);
    const after = stats(slide, Math.floor(SR * (dur + 0.12)), slide.length);
    // Softness: little energy above 6 kHz compared with the body of the sound.
    let top = 0, body = 0;
    for (let f = 6000; f <= 10000; f += 250) top += mag(slide, 0, 4096, f);
    for (let f = 500; f <= 2500; f += 125) body += mag(slide, 0, 4096, f);
    const harsh = top / body;
    // Brightness: energy around 3 kHz against energy around 800 Hz.
    const tilt = (from) => {
      let hi = 0, mid = 0;
      for (let f = 2500; f <= 3500; f += 100) hi += mag(slide, from, 2048, f);
      for (let f = 600; f <= 1000; f += 40) mid += mag(slide, from, 2048, f);
      return hi / mid;
    };
    const brightFirst = tilt(0), brightLast = tilt(Math.max(0, 4 * q - 2048));
    const edge = await render(a => a.impact(4, false), 0.3), knock = await render(a => a.impact(4, true), 0.3);
    // Pitch: where the struck note sits.
    const pitch = (x) => { let best = 0, at = 0; for (let f = 150; f <= 700; f += 5) { const m = mag(x, 0, 4096, f); if (m > best) { best = m; at = f; } } return at; };
    return { first, last, all, after, harsh, brightFirst, brightLast, edge: stats(edge, 0, edge.length), knock: stats(knock, 0, knock.length),
      edgePitch: pitch(edge), knockPitch: pitch(knock) };
  });

  assert.strictEqual(offline.all.bad, 0, 'no NaN samples');
  assert(offline.all.rms > 0.003, 'a slide is audible: ' + offline.all.rms);
  assert(offline.all.peak < 0.9, 'and does not clip: ' + offline.all.peak);
  assert(offline.first.rms > offline.last.rms * 2.5, 'it fades as the penguin slows: ' + offline.first.rms + ' vs ' + offline.last.rms);
  assert(offline.brightFirst > offline.brightLast * 1.4, 'and mellows: ' + offline.brightFirst + ' vs ' + offline.brightLast);
  assert(offline.after.rms < 1e-4, 'and stops when the penguin does: ' + offline.after.rms);
  assert(offline.harsh < 0.12, 'and soft, with no harsh top end: ' + offline.harsh);
  assert(offline.edge.rms > 0.002 && offline.knock.rms > 0.002, 'both stops are audible');
  assert(offline.edge.peak < 0.9 && offline.knock.peak < 0.9, 'neither stop clips');
  assert(offline.knockPitch > offline.edgePitch * 1.5, 'a bump into a penguin is pitched above a stop at the edge: ' +
    offline.knockPitch + ' vs ' + offline.edgePitch);
  console.log('PASS: a slide is soft, fades and mellows with speed, stops cleanly; a bump and an edge stop differ');

  // ── in the game: one slide per moving penguin, on the renderer's clock ─────
  await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.game, null, { timeout: 90000 });
  const wired = await page.evaluate(() => {
    const E = TiltEngine, g = game, calls = [], stops = [];
    g.closeHome && g.closeHome();
    const st = E.compile({ id: 'audio-probe', board: ['A.B..', '.....', '....a', '....b'] });
    g.stage = st; g.state = E.initialState(st); g.renderer.setStage(st, g.state); g.phase = 'play'; g.homeOpen = false;
    g.audio.slide = (start, dur, cells, pan) => calls.push({ start, dur, cells, pan });
    g.audio.impact = (d, knock) => stops.push({ d, knock });
    g.applyMove('R');
    // Fire the renderer's events without waiting on the wall clock.
    const a = g.renderer.anim;
    a.events.forEach(ev => g.renderer.onEvent && g.renderer.onEvent(ev));
    return { calls, stops };
  });
  assert.strictEqual(wired.calls.length, 2, 'both penguins slide: ' + JSON.stringify(wired.calls));
  const A = wired.calls.find(c => c.pan < 0.5), B = wired.calls.find(c => c !== A);
  assert(A && B, 'two distinct slides');
  assert.strictEqual(A.start, 0, 'the slides start with the move');
  assert(B.cells === 2 && Math.abs(B.dur - (2 * 0.054 + 0.048)) < 1e-9, 'B slides two cells, on the renderer clock: ' + JSON.stringify(B));
  assert(A.cells === 3, 'A follows B and slides three cells up to it: ' + JSON.stringify(A));
  assert(wired.stops.some(s => s.knock) && wired.stops.some(s => !s.knock), 'A knocks into B, B stops at the edge: ' + JSON.stringify(wired.stops));
  console.log('PASS: every moving penguin gets its own slide, and a stop knows what stopped it');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
