'use strict';
/*
 * TILT — browser QA.
 *
 * Drives the real page in a real mobile-sized browser and plays all twenty
 * stages through the actual input path. The point is to catch what the pure
 * logic audit cannot: DOM wiring, overlay states, layout at phone sizes, and
 * anything that only breaks once a canvas is involved.
 *
 *   node tools/qa.js            headless run, exits non-zero on any failure
 *   node tools/qa.js --shots    also write screenshots to .qa/
 */

var path = require('path');
var fs = require('fs');
var http = require('http');
var pw = require('playwright');
var chromium = pw.chromium, devices = pw.devices;

var ROOT = path.join(__dirname, '..');
var SHOTS = process.argv.indexOf('--shots') >= 0;
var ALL = process.argv.indexOf('--all') >= 0;
var SHOT_DIR = path.join(ROOT, '.qa');

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

var failures = [];
var checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) failures.push(name + (detail ? ' — ' + detail : ''));
  console.log((cond ? '  [32m✓[0m ' : '  [31m✗[0m ') + name + (cond || !detail ? '' : '  [2m' + detail + '[0m'));
}

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      var file = path.join(ROOT, rel);
      if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

async function swipe(page, x, y, dx, dy) {
  await page.evaluate(function (a) {
    var el = document.getElementById('board-area');
    function mk(type, cx, cy) {
      var t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
      return new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true
      });
    }
    el.dispatchEvent(mk('touchstart', a.x, a.y));
    for (var i = 1; i <= a.steps; i++) {
      el.dispatchEvent(mk('touchmove', a.x + a.dx * i / a.steps, a.y + a.dy * i / a.steps));
    }
    el.dispatchEvent(mk('touchend', a.x + a.dx, a.y + a.dy));
  }, { x: x, y: y, dx: dx, dy: dy, steps: 6 });
}

(async function main() {
  var server = await serve();
  var port = server.address().port;
  var base = 'http://127.0.0.1:' + port + '/';
  if (SHOTS && !fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  // Use the pre-installed browser rather than downloading one; the bundled
  // revision may not match whatever playwright version is on disk.
  var launchOpts = {};
  ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].forEach(function (p) {
    if (!launchOpts.executablePath && p && fs.existsSync(p)) launchOpts.executablePath = p;
  });
  var browser = await chromium.launch(launchOpts);
  var iphone = devices['iPhone 12'];
  var context = await browser.newContext(Object.assign({}, iphone, { hasTouch: true, isMobile: true }));
  var page = await context.newPage();

  var consoleErrors = [];
  page.on('console', function (m) { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', function (e) { consoleErrors.push('pageerror: ' + e.message); });

  console.log('\n[1mBOOT[0m');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  ok('page boots without errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  ok('game object exists', await page.evaluate(function () { return !!window.game && !!window.game.stage; }));
  ok('canvas has real pixels', await page.evaluate(function () {
    var c = document.getElementById('board');
    return c.width > 100 && c.height > 100;
  }));

  var cellSize = await page.evaluate(function () { return window.game.renderer.cell; });
  ok('3×3 cells are large on a phone (>=90px)', cellSize >= 90, 'cell=' + cellSize + 'px');

  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, '01-stage1.png') });

  // ── play every stage through the real input path ───────────────────────────
  console.log('\n[1mPLAY STAGES (engine-proved optimal lines, driven as key input)[0m');

  var stageCount = await page.evaluate(function () { return window.TiltStages.STAGES.length; });
  ok('one hundred stages ship', stageCount === 100, 'found ' + stageCount);

  // Solvability of all 100 is proven by tools/audit.js; this harness is here to
  // exercise the UI. By default it plays every hand-authored stage plus a
  // spread from each generated chapter, which covers every element combination
  // without spending ten minutes replaying boards the solver already cleared.
  // --all plays the entire campaign.
  var playList = await page.evaluate(function (all) {
    var S = window.TiltStages.STAGES, C = window.TiltStages.CHAPTERS || [];
    if (all) return S.map(function (d, i) { return i; });
    var picked = [];
    S.forEach(function (d, i) { if (d.id <= 20) picked.push(i); });
    C.forEach(function (c) {
      if (c.to <= 20) return;
      var idx = [];
      S.forEach(function (d, i) { if (d.id >= c.from && d.id <= c.to) idx.push(i); });
      // first, middle and last of each chapter: easiest, median and hardest
      [0, Math.floor(idx.length / 2), idx.length - 1].forEach(function (k) {
        if (idx[k] != null && picked.indexOf(idx[k]) < 0) picked.push(idx[k]);
      });
    });
    return picked.sort(function (a, b) { return a - b; });
  }, ALL);

  console.log('  ' + '[2m' + 'playing ' + playList.length + ' of ' + stageCount +
    ' stages' + (ALL ? '' : '  (--all for the full campaign)') + '[0m');

  var keyFor = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };

  for (var pi = 0; pi < playList.length; pi++) {
    var i = playList[pi];
    await page.evaluate(function (idx) {
      window.game.save.data.unlocked = 99;
      window.game.loadStage(idx);
    }, i);
    await page.waitForTimeout(120);

    var plan = await page.evaluate(function () {
      var g = window.game;
      var r = window.TiltEngine.solve(g.stage, g.state, 400000);
      return { path: r.path, name: g.stage.name, id: g.stage.id, par: g.stage.par };
    });

    for (var m = 0; m < plan.path.length; m++) {
      await page.keyboard.press(keyFor[plan.path[m]]);
      await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
    }
    await page.waitForTimeout(650);

    var res = await page.evaluate(function () {
      var g = window.game;
      return {
        phase: g.phase,
        moves: g.state.moves,
        overlayShown: document.getElementById('overlay').classList.contains('show'),
        overlayText: (document.querySelector('.ov-title') || {}).textContent || '',
        best: g.save.best(g.stage.id)
      };
    });

    var good = res.phase === 'clear' && res.overlayShown && res.moves === plan.par && res.best === plan.par;
    ok('stage ' + String(plan.id).padStart(2, '0') + ' ' + plan.name.padEnd(8) + ' cleared in par ' + plan.par,
      good, 'phase=' + res.phase + ' moves=' + res.moves + ' overlay=' + res.overlayText.trim() + ' best=' + res.best);

    if (SHOTS && (plan.id === 7 || plan.id === 20 || plan.id === 100)) {
      await page.screenshot({ path: path.join(SHOT_DIR, 'clear-' + String(plan.id).padStart(3, '0') + '.png') });
    }
  }

  // ── undo / restart integrity ───────────────────────────────────────────────
  console.log('\n[1mUNDO / RESTART[0m');
  await page.evaluate(function () { window.game.loadStage(6); });
  await page.waitForTimeout(180);

  var start = await page.evaluate(function () { return window.TiltEngine.stateKey(window.game.state); });
  var seq = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  for (var k = 0; k < seq.length; k++) {
    await page.keyboard.press(seq[k]);
    await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
  }
  var mid = await page.evaluate(function () {
    return { moves: window.game.state.moves, hist: window.game.history.length };
  });
  ok('moves accumulated', mid.hist > 0, 'history=' + mid.hist + ' moves=' + mid.moves);

  // Undo until the button says there is nothing left, rather than assuming a
  // count — a no-op tilt correctly leaves no history entry behind.
  var guard = 0;
  while (guard++ < 20) {
    var enabled = await page.evaluate(function () { return !document.getElementById('btn-undo').disabled; });
    if (!enabled) break;
    await page.click('#btn-undo');
    await page.waitForTimeout(50);
  }
  var afterUndo = await page.evaluate(function () {
    return {
      key: window.TiltEngine.stateKey(window.game.state),
      moves: window.game.state.moves,
      hist: window.game.history.length,
      disabled: document.getElementById('btn-undo').disabled
    };
  });
  ok('undo restores the exact initial state', afterUndo.key === start, afterUndo.key + ' vs ' + start);
  ok('undo restores the move counter', afterUndo.moves === 0, 'moves=' + afterUndo.moves);
  ok('undo button disables when history is empty', afterUndo.disabled === true);

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; });
  await page.click('#btn-restart');
  await page.waitForTimeout(150);
  var afterRestart = await page.evaluate(function () {
    return {
      key: window.TiltEngine.stateKey(window.game.state),
      moves: window.game.state.moves,
      hist: window.game.history.length
    };
  });
  ok('restart returns to the initial state', afterRestart.key === start);
  ok('restart clears history and counter', afterRestart.hist === 0 && afterRestart.moves === 0);

  // ── pit / loss handling ────────────────────────────────────────────────────
  console.log('\n[1mFAILURE STATES[0m');
  await page.evaluate(function () { window.game.loadStage(7); });   // VOID
  await page.waitForTimeout(180);
  await page.keyboard.press('ArrowRight');                          // the fatal instinct
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; });
  await page.waitForTimeout(700);
  var lost = await page.evaluate(function () {
    return {
      phase: window.game.phase,
      overlay: document.getElementById('overlay').className,
      title: (document.querySelector('.ov-title') || {}).textContent || ''
    };
  });
  ok('losing a block enters the lost state', lost.phase === 'lost', 'phase=' + lost.phase);
  ok('lost overlay appears', /lost/.test(lost.overlay), lost.overlay);
  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'lost.png') });

  await page.click('[data-act="undo"]');
  await page.waitForTimeout(200);
  var recovered = await page.evaluate(function () {
    return { phase: window.game.phase, overlay: document.getElementById('overlay').className };
  });
  ok('undo recovers from a loss', recovered.phase === 'play' && !/show/.test(recovered.overlay), recovered.phase);

  // ── input robustness ───────────────────────────────────────────────────────
  console.log('\n[1mINPUT ROBUSTNESS[0m');
  await page.evaluate(function () { window.game.loadStage(0); });
  await page.waitForTimeout(150);
  for (var s = 0; s < 24; s++) {
    await page.keyboard.press(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][s % 4]);
  }
  await page.waitForTimeout(1400);
  var hammered = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine;
    var st = g.stage, s = g.state;
    var seen = {}, bad = 0;
    for (var i = 0; i < st.pieces.length; i++) {
      if (!s.alive[i]) continue;
      var cells = E.pieceCells(st, s, i);
      for (var k = 0; k < cells.length; k++) {
        var x = cells[k][0], y = cells[k][1];
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) bad++;
        var key = x + ',' + y;
        if (seen[key]) bad++;
        seen[key] = 1;
        if (st.terrain[y * st.w + x] === E.WALL) bad++;
      }
    }
    return { bad: bad, moves: s.moves, hist: g.history.length, phase: g.phase };
  });
  ok('rapid input never corrupts the board', hammered.bad === 0, 'violations=' + hammered.bad);
  ok('move counter matches history depth', hammered.phase === 'clear' || hammered.moves === hammered.hist,
    'moves=' + hammered.moves + ' history=' + hammered.hist);

  await page.evaluate(function () { window.game.loadStage(1); });   // STOP
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowUp');                             // already at the top
  await page.waitForTimeout(300);
  var noop = await page.evaluate(function () {
    return { moves: window.game.state.moves, hist: window.game.history.length };
  });
  ok('a tilt that changes nothing costs no move', noop.moves === 0 && noop.hist === 0, 'moves=' + noop.moves);

  // ── dead end detection ─────────────────────────────────────────────────────
  console.log('\n[1mDEAD END DETECTION[0m');
  var deadFound = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine;
    g.loadStage(14);  // LEVER has genuinely unrecoverable positions
    var states = E.reachable(g.stage, null, 5000);
    for (var i = 0; i < states.length; i++) {
      if (E.isClear(states[i])) continue;
      if (!E.solve(g.stage, states[i], 20000).solvable) {
        g.state = states[i];
        g.history.push(E.initialState(g.stage));
        g.checkDeadEnd();
        return { dead: g.deadEnd, urgent: document.getElementById('btn-undo').classList.contains('urgent') };
      }
    }
    return { dead: null, urgent: null };
  });
  ok('unsolvable positions are detected', deadFound.dead === true, JSON.stringify(deadFound));
  ok('undo button flags the dead end', deadFound.urgent === true);

  // ── layout across viewports ────────────────────────────────────────────────
  console.log('\n[1mLAYOUT[0m');
  var viewports = [
    { name: 'iPhone SE  320×568', w: 320, h: 568 },
    { name: 'iPhone 12  390×844', w: 390, h: 844 },
    { name: 'Pixel 7    412×915', w: 412, h: 915 },
    { name: 'landscape  844×390', w: 844, h: 390 },
    { name: 'tablet     768×1024', w: 768, h: 1024 }
  ];
  for (var v = 0; v < viewports.length; v++) {
    var vp = viewports[v];
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate(function () { window.game.loadStage(19); }); // 5×5, the biggest
    await page.waitForTimeout(260);
    var fit = await page.evaluate(function () {
      var g = window.game, r = g.renderer;
      var bw = r.cell * g.stage.w, bh = r.cell * g.stage.h;
      var doc = document.documentElement;
      return {
        cell: r.cell,
        fits: r.ox >= 0 && r.oy >= 0 && bw <= r.cssW + 0.5 && bh <= r.cssH + 0.5,
        hScroll: doc.scrollWidth > doc.clientWidth,
        vScroll: doc.scrollHeight > doc.clientHeight
      };
    });
    ok('5×5 board fits · ' + vp.name, fit.fits && !fit.hScroll && !fit.vScroll,
      'cell=' + fit.cell + ' fits=' + fit.fits + ' hscroll=' + fit.hScroll + ' vscroll=' + fit.vScroll);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'vp-' + vp.w + 'x' + vp.h + '.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ── menu ───────────────────────────────────────────────────────────────────
  console.log('\n[1mSTAGE MENU[0m');
  await page.click('#btn-menu');
  await page.waitForTimeout(420);
  var menu = await page.evaluate(function () {
    return {
      shown: document.getElementById('menu').classList.contains('show'),
      cells: document.querySelectorAll('#stage-grid .cell').length,
      chapters: document.querySelectorAll('#stage-grid .chap-head').length,
      done: document.querySelectorAll('#stage-grid .cell.done').length,
      expectChapters: (window.TiltStages.CHAPTERS || []).length,
      progress: (document.getElementById('menu-progress') || {}).textContent || ''
    };
  });
  ok('menu opens', menu.shown);
  ok('menu lists all one hundred stages', menu.cells === 100, 'cells=' + menu.cells);
  ok('menu groups them into chapters', menu.chapters === menu.expectChapters && menu.chapters === 10,
    'chapters=' + menu.chapters);
  ok('cleared stages are marked', menu.done > 0, 'done=' + menu.done);
  ok('menu shows overall progress', /\d+/.test(menu.progress), menu.progress);
  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'menu.png') });
  await page.click('#btn-close');
  await page.waitForTimeout(340);

  // ── persistence ────────────────────────────────────────────────────────────
  console.log('\n[1mPROGRESSION[0m');
  var unlock = await page.evaluate(function () {
    var g = window.game;
    g.save.reset();
    var W = window.TiltSave.Save.SKIP_WINDOW;
    return {
      window: W,
      firstOpen: g.save.isUnlocked(1),
      windowOpen: g.save.isUnlocked(1 + W),
      beyondShut: g.save.isUnlocked(2 + W),
      lastShut: g.save.isUnlocked(100)
    };
  });
  ok('stage 1 is open on a fresh save', unlock.firstOpen === true);
  ok('a stuck player may still reach ' + unlock.window + ' stages ahead', unlock.windowOpen === true);
  ok('but no further than that', unlock.beyondShut === false);
  ok('the late campaign stays locked', unlock.lastShut === false);
  await page.evaluate(function () { window.game.save.data.unlocked = 99; window.game.save.flush(); });

  console.log('\n[1mPERSISTENCE[0m');
  var beforeReload = await page.evaluate(function () { return JSON.stringify(window.game.save.data.cleared); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(function () { return !!window.game; }, null, { timeout: 10000 });
  var afterReload = await page.evaluate(function () { return JSON.stringify(window.game.save.data.cleared); });
  ok('progress survives a reload', beforeReload === afterReload);

  await page.evaluate(function () { window.localStorage.setItem('tilt.save.v1', '{{{not json'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(function () { return !!window.game; }, null, { timeout: 10000 });
  var recoveredSave = await page.evaluate(function () {
    return !!window.game && window.game.save.data.unlocked >= 1;
  });
  ok('a corrupt save file recovers instead of crashing', recoveredSave === true);

  // ── real touch swipes ──────────────────────────────────────────────────────
  console.log('\n[1mTOUCH SWIPE[0m');
  await page.evaluate(function () { window.game.save.data.unlocked = 99; window.game.loadStage(0); });
  await page.waitForTimeout(180);
  var box = await page.locator('#board-area').boundingBox();
  var cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(250);
  var afterTap = await page.evaluate(function () { return window.game.state.moves; });
  ok('a plain tap does not move anything', afterTap === 0, 'moves=' + afterTap);

  await swipe(page, cx, cy, 120, 0);
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
  var afterSwipe = await page.evaluate(function () {
    return { moves: window.game.state.moves, grav: window.game.renderer.gravity };
  });
  ok('a right swipe tilts right', afterSwipe.moves === 1 && afterSwipe.grav === 'R', JSON.stringify(afterSwipe));

  await swipe(page, cx, cy, 0, 120);
  await page.waitForTimeout(900);
  var afterDown = await page.evaluate(function () {
    return { phase: window.game.phase, moves: window.game.state.moves };
  });
  ok('a down swipe finishes stage 1', afterDown.phase === 'clear' && afterDown.moves === 2, JSON.stringify(afterDown));

  await page.evaluate(function () { window.game.loadStage(0); });
  await page.waitForTimeout(180);
  await swipe(page, cx, cy, 6, 3);
  await page.waitForTimeout(300);
  var wobble = await page.evaluate(function () { return window.game.state.moves; });
  ok('a tiny wobble is ignored', wobble === 0, 'moves=' + wobble);

  // ── device tilt ────────────────────────────────────────────────────────────
  // No real accelerometer here, so drive the handler directly. This is the one
  // input path a headless run would otherwise never touch, and it is the half
  // of the control scheme that cannot be checked by hand on a desktop.
  console.log('\n[1mDEVICE TILT[0m');
  var tiltResult = await page.evaluate(async function () {
    var g = window.game;
    var input = g.input;
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    g.loadStage(0);
    input.tilt.enabled = true;
    input.tilt.neutral = null;
    input.tilt.armed = true;
    input.tilt.invert = false;

    var fire = function (beta, gamma) { input.onOrientation({ beta: beta, gamma: gamma }); };
    // History depth updates the instant a move is accepted; state.moves only
    // catches up when the slide finishes animating.
    var accepted = function () { return g.history.length; };
    var settled = function () {
      return new Promise(function (r) {
        (function poll() { if (g.phase !== 'busy') r(); else setTimeout(poll, 20); })();
      });
    };

    fire(50, 0);                    // first reading captures the neutral pose
    var neutralCaptured = !!input.tilt.neutral;

    fire(50, 4);                    // inside the deadzone
    await sleep(140);
    fire(50, 4);
    var deadzoneQuiet = accepted() === 0;

    fire(50, 30);                   // clearly tilted right
    var aimedRight = g.renderer.aimDir === 'R';
    await sleep(140);
    fire(50, 30);                   // held past the confirm delay
    var committed = accepted() === 1;
    await settled();

    // Still held over: must not fire again until the device returns to centre.
    fire(50, 30);
    await sleep(140);
    fire(50, 30);
    await sleep(60);
    var noRepeatWhileHeld = accepted() === 1;

    fire(50, 0);                    // back to neutral re-arms
    var rearmed = input.tilt.armed === true;

    // Now the other axis, in a direction that actually has somewhere to go.
    // (Tilting right again would be a legitimate no-op: the piece is already
    // against the right wall.)
    await sleep(120);
    fire(76, 0);
    var aimedDown = g.renderer.aimDir === 'D';
    await sleep(140);
    fire(76, 0);
    var firesAgain = accepted() === 2;
    await settled();

    input.disableTilt();
    return {
      neutralCaptured: neutralCaptured,
      deadzoneQuiet: deadzoneQuiet,
      aimedRight: aimedRight,
      committed: committed,
      noRepeatWhileHeld: noRepeatWhileHeld,
      rearmed: rearmed,
      firesAgain: firesAgain,
      aimedDown: aimedDown
    };
  });
  ok('tilt captures a neutral pose on enable', tiltResult.neutralCaptured);
  ok('small tilts inside the deadzone do nothing', tiltResult.deadzoneQuiet);
  ok('tilt shows the aimed direction before committing', tiltResult.aimedRight);
  ok('a held tilt commits after the confirm delay', tiltResult.committed);
  ok('holding the tilt does not machine-gun moves', tiltResult.noRepeatWhileHeld);
  ok('returning to centre re-arms the tilt', tiltResult.rearmed);
  ok('a re-armed tilt accepts the next move', tiltResult.firesAgain);
  ok('the front/back axis maps to up/down', tiltResult.aimedDown);

  console.log('\n[1mCONSOLE[0m');
  ok('no console errors across the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();

  console.log('');
  if (failures.length) {
    console.log('[31m[1m' + failures.length + ' of ' + checks + ' checks failed[0m');
    failures.forEach(function (f) { console.log('  [31m✗[0m ' + f); });
    process.exit(1);
  } else {
    console.log('[32m[1m✓ all ' + checks + ' browser checks passed[0m');
  }
})().catch(function (e) {
  console.error('[31mQA harness crashed:[0m', e);
  process.exit(1);
});
