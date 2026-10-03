'use strict';
/*
 * The ice sounds, rendered offline in Chromium (no speakers needed):
 *   - a slide is loud and bright while fast and fades and dulls as it slows,
 *   - its glassy ring is really there (narrow peaks above the hiss),
 *   - nothing clips, nothing is silent, nothing is NaN,
 *   - a knock against a penguin and a stop at the edge sound different,
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
    // Ring: the sheet's partials stand clear of the hiss around them. The
    // fundamental is random in 2350–2650 Hz; scan it and take the best ratio.
    let ring = 0;
    for (let f = 2300; f <= 2700; f += 10) {
      const on = mag(slide, 0, 4096, f), off = (mag(slide, 0, 4096, f * 1.3) + mag(slide, 0, 4096, f * 0.8)) / 2;
      ring = Math.max(ring, on / off);
    }
    // Brightness: energy around 8 kHz against energy around 1.8 kHz.
    const tilt = (from) => {
      let hi = 0, mid = 0;
      for (let f = 7000; f <= 9000; f += 250) hi += mag(slide, from, 2048, f);
      for (let f = 1500; f <= 2100; f += 75) mid += mag(slide, from, 2048, f);
      return hi / mid;
    };
    const brightFirst = tilt(0), brightLast = tilt(Math.max(0, 4 * q - 2048));
    const edge = await render(a => a.impact(4, false), 0.3), knock = await render(a => a.impact(4, true), 0.3);
    // A knock rings on: compare 40–120 ms after it lands.
    const ringOn = (x) => stats(x, Math.floor(SR * 0.04), Math.floor(SR * 0.12)).rms;
    return { first, last, all, after, ring, brightFirst, brightLast, edge: stats(edge, 0, edge.length), knock: stats(knock, 0, knock.length),
      edgeTail: ringOn(edge), knockTail: ringOn(knock) };
  });

  assert.strictEqual(offline.all.bad, 0, 'no NaN samples');
  assert(offline.all.rms > 0.003, 'a slide is audible: ' + offline.all.rms);
  assert(offline.all.peak < 0.9, 'and does not clip: ' + offline.all.peak);
  assert(offline.first.rms > offline.last.rms * 2.5, 'it fades as the penguin slows: ' + offline.first.rms + ' vs ' + offline.last.rms);
  assert(offline.brightFirst > offline.brightLast * 2, 'and dulls: ' + offline.brightFirst + ' vs ' + offline.brightLast);
  assert(offline.after.rms < 1e-4, 'and stops when the penguin does: ' + offline.after.rms);
  assert(offline.ring > 2, 'the glassy ring stands above the hiss: ' + offline.ring);
  assert(offline.edge.rms > 0.002 && offline.knock.rms > 0.002, 'both stops are audible');
  assert(offline.edge.peak < 0.9 && offline.knock.peak < 0.9, 'neither stop clips');
  assert(offline.knockTail > offline.edgeTail * 1.5, 'a knock on a penguin rings; a stop at the edge does not: ' +
    offline.knockTail + ' vs ' + offline.edgeTail);
  console.log('PASS: a slide fades and dulls with speed, rings like glass, stops cleanly; edge and knock differ');

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
