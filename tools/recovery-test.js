'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const E = require('../src/engine.js');
const { STAGES } = require('../src/stages.js');

// Find a real campaign position with safe progress, then three dead-end moves.
function fixture() {
  for (let index = 0; index < STAGES.length; index++) {
    const stage = E.compile(STAGES[index]);
    const plan = E.solve(stage, null, 400000).path;
    let safe = E.initialState(stage);
    for (let n = 0; n < plan.length; n++) {
      if (n > 0) for (const dir of E.DIRS) {
        let dead = E.step(stage, safe, dir);
        if (!dead || E.isBroken(dead)) continue;
        const probe = E.solve(stage, dead, 400000);
        if (probe.solvable || probe.truncated) continue;
        const tail = [dir];
        for (let j = 0; j < 2; j++) {
          const next = E.DIRS.map(d => ({ d, s: E.step(stage, dead, d) }))
            .find(x => x.s && !E.isBroken(x.s));
          if (!next) break;
          tail.push(next.d); dead = next.s;
        }
        if (tail.length === 3) return { index, safe: plan.slice(0, n), tail, key: E.stateKey(safe) };
      }
      safe = E.step(stage, safe, plan[n]);
    }
  }
  throw new Error('No recovery fixture found');
}

(async () => {
  const test = fixture();
  const root = path.resolve(__dirname, '..');
  const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.png':'image/png' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(err ? '' : data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch(require('./lib/browser').launchOptions());
    const page = await browser.newPage({ viewport:{ width:390,height:844 }, locale:'ja-JP' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.click('#btn-home-play');
    async function load() { await page.evaluate(i => game.loadStage(i), test.index); }
    async function move(d) {
      await page.keyboard.press({ U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight' }[d]);
      await page.evaluate(() => {
        const r = game.renderer;
        if (r.anim) { r.anim.t0 -= r.anim.duration; r.frame(16,performance.now()); }
      });
      await page.waitForFunction(() => game.phase !== 'busy');
    }
    async function reachDead() {
      await load();
      for (const d of test.safe) await move(d);
      assert(await page.locator('#btn-undo').isDisabled(), 'safe progress must not enable recovery');
      for (const d of test.tail) await move(d);
      assert(await page.locator('#btn-undo').isEnabled(), 'dead end must enable recovery');
    }
    async function verifyRecovered() {
      const got = await page.evaluate(() => ({ key:TiltEngine.stateKey(game.state), moves:game.state.moves,
        history:game.history.length, phase:game.phase, stuck:game.stuck, queued:game.queued, anim:!!game.renderer.anim }));
      assert.deepStrictEqual(got, { key:test.key,moves:test.safe.length,history:test.safe.length,
        phase:'play',stuck:false,queued:null,anim:false });
      assert(await page.locator('#btn-undo').isDisabled());
    }
    await reachDead();
    assert.strictEqual(await page.locator('#btn-undo .lbl').innerText(), '手詰まりの前に戻す');
    for (const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(size);
      const fits = await page.locator('#btn-undo').evaluate(el => {
        const b=el.getBoundingClientRect(), t=el.querySelector('.lbl').getBoundingClientRect();
        return b.height>=44 && b.x>=0 && b.right<=innerWidth && b.bottom<=innerHeight && t.right<=b.right && t.left>=b.left && t.bottom<=b.bottom;
      });
      assert(fits, 'recovery label fits ' + size.width);
      if (process.env.RECOVERY_CAPTURE) {
        await page.waitForTimeout(1800);
        await page.screenshot({path:path.join(process.env.RECOVERY_CAPTURE, 'tilt-recovery-' + size.width + '.png')});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.click('#btn-undo');
    await verifyRecovered();
    await page.keyboard.press('z');
    await verifyRecovered();
    console.log('PASS: three dead-end moves recover to the nearest safe position; repeat is a no-op; responsive label fits');

    await reachDead();
    await page.evaluate(() => { game.restart(); game.undoRestart(); });
    assert(await page.locator('#btn-undo').isEnabled(), 'restoring a restarted dead end preserves recovery');
    await page.keyboard.press('Backspace');
    await verifyRecovered();
    console.log('PASS: restart reversal and keyboard recovery');

    await reachDead();
    await page.evaluate(() => {
      const d=TiltEngine.DIRS.find(d => TiltEngine.step(game.stage,game.state,d));
      game.applyMove(d); game.queued='R';
    });
    await page.click('#btn-undo');
    await page.waitForTimeout(900);
    await verifyRecovered();
    console.log('PASS: recovery cancels a moving dead end and discards queued input');

    await reachDead();
    const unverified = await page.evaluate(() => {
      const old=game.remaining, before=TiltEngine.stateKey(game.state);
      game.remaining=() => ({solvable:false,exact:false,moves:-1});
      game.recover(); game.remaining=old;
      return before===TiltEngine.stateKey(game.state);
    });
    assert(unverified, 'an unproven search result must never become a recovery target');
    assert.deepStrictEqual(errors, []);
    console.log('PASS: unknown solver results leave the board intact; no browser errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode=1; });
