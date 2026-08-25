'use strict';
/*
 * TILT — browser QA.
 *
 * Drives the real page in a real mobile-sized browser and plays stages through
 * the actual input path. The point is to catch what the pure logic audit
 * cannot: DOM wiring, overlay states, layout at phone sizes, and anything that
 * only breaks once a canvas is involved.
 *
 * tools/audit.js proves the rules. This proves the player is TOLD about them —
 * that destroying a block announces itself and offers the way back, that a goal
 * which refuses a block looks different from one that takes it, and that none
 * of it comes apart when the buttons are hammered.
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
var SHOT_DIR = path.join(ROOT, '.qa');

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

var failures = [];
var checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) failures.push(name + (detail ? ' — ' + detail : ''));
  console.log((cond ? '  \u001b[32m✓\u001b[0m ' : '  \u001b[31m✗\u001b[0m ') + name + (cond || !detail ? '' : '  \u001b[2m' + detail + '\u001b[0m'));
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

  console.log('\n\u001b[1mBOOT\u001b[0m');
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
  console.log('\n\u001b[1mPLAY STAGES (engine-proved optimal lines, driven as key input)\u001b[0m');

  var stageCount = await page.evaluate(function () { return window.TiltStages.STAGES.length; });
  ok('the campaign ships ' + stageCount + ' stages', stageCount >= 20, 'found ' + stageCount);

  // Solvability is proven by tools/audit.js; this harness is here to exercise
  // the UI. The campaign is short enough that the default plays all of it —
  // there is no filler to skip. (--all is kept as a no-op alias so the npm
  // script and old habits keep working.)
  var playList = await page.evaluate(function () {
    return window.TiltStages.STAGES.map(function (d, i) { return i; });
  });

  console.log('  ' + '\u001b[2m' + 'playing all ' + playList.length + ' stages\u001b[0m');

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

    if (SHOTS && (plan.id === 5 || plan.id === 10 || plan.id === 20)) {
      await page.screenshot({ path: path.join(SHOT_DIR, 'clear-' + String(plan.id).padStart(3, '0') + '.png') });
    }
  }

  // ── undo / restart integrity ───────────────────────────────────────────────
  console.log('\n\u001b[1mUNDO / RESTART\u001b[0m');
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

  // ── the devices, in the real game ─────────────────────────────────────────
  // The logic for all of them is proved exhaustively by tools/audit.js. What can
  // only be checked here is that the PLAYER is told: that a destroyed block ends
  // the run and says why, that a jammed board takes itself back, that a goal
  // which refuses a block looks different from one that takes it, and that a
  // board whose definition of "done" is not the usual one says so on screen.
  console.log('\n\u001b[1mDEVICES\u001b[0m');
  var vocabulary = await page.evaluate(function () {
    var LEGAL = '.#xo@abcABC';
    var allowed = ['id', 'name', 'par', 'win', 'idea', 'purpose', 'note', 'hint', 'board'];
    var CHAPTERS = window.TiltStages.CHAPTERS || [];
    var extreme = function (id) {
      return CHAPTERS.some(function (c) { return c.extreme && id >= c.from && id <= c.to; });
    };
    var bad = [], both = [], untaught = [], first = {};
    window.TiltStages.STAGES.forEach(function (d) {
      Object.keys(d).forEach(function (k) {
        if (allowed.indexOf(k) < 0) bad.push(d.id + ':field ' + k);
      });
      d.board.forEach(function (row) {
        for (var i = 0; i < row.length; i++) if (LEGAL.indexOf(row[i]) < 0) bad.push(d.id + ':char ' + row[i]);
      });
      var st = window.TiltEngine.compile(d);
      // Colour is the substrate of MATCH, SELECT and FORM rather than a second
      // rule stacked on them, so it only counts as a device of its own on an
      // ALL IN board. See tools/lib/design.js devicesOf().
      var used = [];
      if (st.rules.hazard) used.push('hazard');
      if (st.rules.colour) used.push('colour');
      if (st.win !== 'allin') used.push(st.win);
      var devices = (st.rules.hazard ? 1 : 0) + (st.win !== 'allin' ? 1 : 0) +
                    (st.rules.colour && st.win === 'allin' ? 1 : 0);
      if (devices > 1 && !extreme(d.id)) both.push(d.id);
      used.forEach(function (what) {
        if (first[what] !== undefined) return;
        first[what] = d.id;
        if (!d.hint) untaught.push(what + '@' + d.id);
      });
    });
    return { bad: bad.slice(0, 5), badCount: bad.length, both: both, first: first, untaught: untaught };
  });
  ok('every stage uses only the documented board characters', vocabulary.badCount === 0,
    vocabulary.bad.join(' '));
  ok('no stage outside the last chapter puts two new rules on screen at once',
    vocabulary.both.length === 0, 'both on stages ' + vocabulary.both.join(','));
  ok('each device is introduced by a stage that explains it',
    vocabulary.untaught.length === 0, vocabulary.untaught.join(' '));

  // Every alternative win condition names itself in the HUD. Without this the
  // difficulty moves off the board and into a sentence nobody read.
  var objectives = await page.evaluate(async function () {
    var g = window.game, S = window.TiltStages.STAGES, out = [];
    g.save.data.unlocked = 99;
    for (var i = 0; i < S.length; i++) {
      var win = window.TiltEngine.compile(S[i]).win;
      if (win === 'allin') continue;
      g.loadStage(i);
      var label = (document.getElementById('objective') || {}).textContent || '';
      out.push({ id: S[i].id, win: win, label: label });
    }
    return out;
  });
  var unlabelled = objectives.filter(function (o) { return !o.label; });
  ok('every board with an unusual win condition says so in the HUD  (' +
    objectives.length + ' stages)',
    objectives.length > 0 && unlabelled.length === 0,
    unlabelled.map(function (o) { return o.id + ':' + o.win; }).join(' '));

  // Destroy a block on purpose and watch what the game does about it.
  var killed = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    for (var idx = 0; idx < S.length; idx++) {
      var st = E.compile(S[idx]);
      if (!st.rules.hazard) continue;
      g.save.data.unlocked = 99;
      g.loadStage(idx);
      // Find any reachable position with a tilt that costs a block.
      var states = E.reachable(g.stage, null, 2000);
      for (var i = 0; i < states.length; i++) {
        if (E.isTerminal(g.stage, states[i])) continue;
        for (var d = 0; d < 4; d++) {
          var r = E.simulate(g.stage, states[i], E.DIRS[d], { frames: false });
          if (!r.moved || (r.state.lost || 0) <= (states[i].lost || 0)) continue;
          g.state = E.cloneState(states[i]);
          g.history = [E.initialState(g.stage)];
          g.renderer.showState(g.state);
          return { stage: S[idx].id, dir: E.DIRS[d], ready: true };
        }
      }
    }
    return { ready: false };
  });

  if (killed.ready) {
    var keyOf = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
    await page.keyboard.press(keyOf[killed.dir]);
    await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
    // The card is held back a beat so the shatter is seen in the cell that
    // caused it, rather than behind the panel announcing it. Wait for the card
    // itself rather than for a fixed delay — the delay is a design choice that
    // may change, the card appearing is the thing being tested.
    await page.waitForFunction(function () {
      return document.getElementById('overlay').classList.contains('show');
    }, null, { timeout: 4000 }).catch(function () {});
    var after = await page.evaluate(function () {
      var ov = document.getElementById('overlay');
      return {
        lost: window.game.state.lost,
        phase: window.game.phase,
        overlay: ov.className,
        title: (ov.querySelector('.ov-title') || {}).textContent || '',
        body: (ov.querySelector('.ov-note') || {}).textContent || '',
        actions: Array.prototype.map.call(ov.querySelectorAll('[data-act]'), function (b) {
          return b.getAttribute('data-act');
        })
      };
    });
    ok('stopping on a hazard destroys the block  (stage ' + killed.stage + ', tilt ' + killed.dir + ')',
      after.lost > 0, 'lost=' + after.lost);
    ok('and ends the run there and then', after.phase === 'over' &&
      /show/.test(after.overlay) && /over/.test(after.overlay), JSON.stringify(after));
    ok('the game says which rule ended it', after.title.length > 0 && after.body.length > 0,
      after.title + ' / ' + after.body);
    ok('with both ways out offered', after.actions.indexOf('restart') >= 0 &&
      after.actions.indexOf('undo') >= 0, after.actions.join(','));

    await page.click('#btn-undo');
    await page.waitForTimeout(180);
    var recovered = await page.evaluate(function () {
      return {
        lost: window.game.state.lost,
        phase: window.game.phase,
        overlay: document.getElementById('overlay').className
      };
    });
    ok('undo brings the destroyed block back', recovered.lost === 0, 'lost=' + recovered.lost);
    ok('and puts the board back in play', recovered.phase === 'play' &&
      !/show/.test(recovered.overlay), JSON.stringify(recovered));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'hazard.png') });
  } else {
    ok('a hazard stage exists to test', false, 'no stage in the campaign uses a hazard');
  }

  // A goal that will not take a block has to LOOK different from one that will.
  var colour = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    var idx = -1;
    for (var i = 0; i < S.length; i++) if (E.compile(S[i]).rules.colour) { idx = i; break; }
    if (idx < 0) return { ok: false };
    g.loadStage(idx);
    var st = g.stage;
    // Is there a goal on this board that refuses at least one block colour?
    var refuses = false, accepts = false;
    for (var c = 0; c < st.w * st.h; c++) {
      if (!st.goal[c]) continue;
      for (var b = 0; b < st.colour.length; b++) {
        if (E.accepts(st.goalColour[c], st.colour[b])) accepts = true; else refuses = true;
      }
    }
    var pal = window.TiltRender.PALETTE;
    var shapes = {}, hues = {};
    pal.forEach(function (p) { shapes[p.shape] = 1; hues[p.mid] = 1; });
    return {
      ok: true, id: S[idx].id, refuses: refuses, accepts: accepts,
      shapes: Object.keys(shapes).length, hues: Object.keys(hues).length,
      palettes: pal.length
    };
  });
  ok('a colour stage has goals that accept and goals that refuse',
    colour.ok && colour.refuses && colour.accepts, JSON.stringify(colour));
  ok('each colour has its own SHAPE, not only its own hue  (colour-blind safe)',
    colour.shapes === colour.palettes && colour.hues === colour.palettes,
    colour.shapes + ' shapes / ' + colour.hues + ' hues for ' + colour.palettes + ' colours');

  // ── input robustness ───────────────────────────────────────────────────────
  console.log('\n\u001b[1mINPUT ROBUSTNESS\u001b[0m');
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
    for (var i = 0; i < st.blocks.length; i++) {
      if (!s.alive[i]) continue;
      var x = s.pos[i][0], y = s.pos[i][1];
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) bad++;
      var key = x + ',' + y;
      if (seen[key]) bad++;
      seen[key] = 1;
      if (st.terrain[y * st.w + x] === E.WALL) bad++;
    }
    return { bad: bad, moves: s.moves, hist: g.history.length, phase: g.phase };
  });
  ok('rapid input never corrupts the board', hammered.bad === 0, 'violations=' + hammered.bad);
  ok('move counter matches history depth', hammered.phase === 'clear' || hammered.moves === hammered.hist,
    'moves=' + hammered.moves + ' history=' + hammered.hist);

  // Find a stage and a direction where gravity genuinely has nowhere to take
  // anything, rather than hard-coding one — the campaign is regenerated from a
  // search, so any board this file names by number will eventually be a
  // different board.
  var deadTilt = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    g.save.data.unlocked = 99;
    for (var i = 0; i < S.length; i++) {
      g.loadStage(i);
      for (var d = 0; d < 4; d++) {
        if (!E.step(g.stage, g.state, E.DIRS[d])) return { index: i, dir: E.DIRS[d], id: S[i].id };
      }
    }
    return null;
  });
  ok('some board has a tilt with nowhere to go', !!deadTilt);
  if (deadTilt) {
    await page.evaluate(function (i) { window.game.loadStage(i); }, deadTilt.index);
    await page.waitForTimeout(150);
    await page.keyboard.press({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[deadTilt.dir]);
    await page.waitForTimeout(300);
    var noop = await page.evaluate(function () {
      return { moves: window.game.state.moves, hist: window.game.history.length };
    });
    ok('a tilt that changes nothing costs no move  (stage ' + deadTilt.id + ', ' + deadTilt.dir + ')',
      noop.moves === 0 && noop.hist === 0, 'moves=' + noop.moves);
  }

  // Sequences no real player would perform, which is exactly why they break
  // things: buttons hammered during animations, undo held down past the start
  // of the stage, restart pressed on the winning move.
  console.log('\n\u001b[1mHOSTILE OPERATION\u001b[0m');
  await page.evaluate(function () { window.game.save.data.unlocked = 99; window.game.loadStage(4); });
  await page.waitForTimeout(150);
  var baseKey = await page.evaluate(function () {
    return window.TiltEngine.makeStateKey(window.game.stage)(window.game.state);
  });

  // Undo hammered DURING a slide. The first press cancels the move in flight;
  // the rest walk back through whatever history is left. What must never happen
  // is a half-applied move — a board that animated somewhere the state does not
  // agree it went.
  await page.keyboard.press('ArrowDown');
  for (var q0 = 0; q0 < 8; q0++) await page.evaluate(function () { window.game.undo(); });
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
  await page.waitForTimeout(200);
  var midSlide = await page.evaluate(function () {
    var g = window.game;
    return {
      moves: g.state.moves, hist: g.history.length, phase: g.phase,
      key: window.TiltEngine.makeStateKey(g.stage)(g.state)
    };
  });
  ok('undo during a slide cancels the move rather than half-applying it',
    midSlide.moves === midSlide.hist && midSlide.phase === 'play', JSON.stringify(midSlide));
  ok('and lands back on the start of the stage', midSlide.key === baseKey,
    midSlide.key + ' vs ' + baseKey);

  // Now undo held down past the start of the stage.
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
  for (var q = 0; q < 12; q++) {
    await page.evaluate(function () { window.game.undo(); });
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(300);
  var spam = await page.evaluate(function () {
    var g = window.game;
    return {
      key: window.TiltEngine.makeStateKey(g.stage)(g.state),
      moves: g.state.moves, hist: g.history.length, phase: g.phase,
      undoDisabled: document.getElementById('btn-undo').disabled
    };
  });
  ok('undo held past the beginning lands exactly on the start', spam.key === baseKey,
    spam.key + ' vs ' + baseKey);
  ok('and leaves the counters clean', spam.moves === 0 && spam.hist === 0,
    'moves=' + spam.moves + ' history=' + spam.hist);
  ok('and the dock agrees there is nothing to undo', spam.undoDisabled === true);
  ok('the game is playable again afterwards', spam.phase === 'play', 'phase=' + spam.phase);

  // Restart spam, including during a slide. Unlike undo there is nothing to
  // decide here — the beginning is the beginning — so it must be honoured
  // immediately however many times it is pressed.
  await page.keyboard.press('ArrowDown');
  for (var rz = 0; rz < 8; rz++) await page.evaluate(function () { window.game.restart(); });
  await page.waitForTimeout(500);
  var respam = await page.evaluate(function () {
    var g = window.game;
    return {
      key: window.TiltEngine.makeStateKey(g.stage)(g.state),
      moves: g.state.moves, hist: g.history.length, phase: g.phase
    };
  });
  ok('restart hammered mid-slide still lands on the start', respam.key === baseKey);
  ok('restart hammered leaves the game playable', respam.phase === 'play' && respam.moves === 0,
    JSON.stringify(respam));

  // Undo on the winning move: the clear must be re-winnable, not consumed.
  var replay = await page.evaluate(async function () {
    var g = window.game, E = window.TiltEngine;
    g.loadStage(4);
    var sol = E.solve(g.stage, null, 200000);
    // Fast-forward to one move short of the win without animating.
    var s = E.initialState(g.stage), hist = [];
    for (var i = 0; i < sol.path.length - 1; i++) {
      hist.push(E.cloneState(s));
      s = E.simulate(g.stage, s, sol.path[i], { frames: false }).state;
    }
    g.state = s; g.history = hist; g.renderer.showState(s);
    return { last: sol.path[sol.path.length - 1], par: sol.moves };
  });
  var keyMap = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
  await page.keyboard.press(keyMap[replay.last]);
  await page.waitForTimeout(900);
  var won = await page.evaluate(function () { return window.game.phase; });
  ok('the stage can be won', won === 'clear', 'phase=' + won);

  // Undo is deliberately inert once the stage is won: the clear screen is a
  // stopping point, and the way back into the board from there is RETRY, which
  // restarts it. Hammering undo on the overlay must not half-dismiss it or
  // leave the game in a phase where neither the board nor the buttons respond.
  for (var uz = 0; uz < 6; uz++) await page.evaluate(function () { window.game.undo(); });
  await page.waitForTimeout(200);
  var atClear = await page.evaluate(function () {
    return {
      phase: window.game.phase,
      overlay: document.getElementById('overlay').classList.contains('show'),
      retry: !!document.querySelector('[data-act="retry"]')
    };
  });
  ok('undo on the clear screen changes nothing', atClear.phase === 'clear' && atClear.overlay === true,
    JSON.stringify(atClear));
  ok('and the clear screen offers the way back in', atClear.retry === true);

  await page.click('[data-act="retry"]');
  await page.waitForTimeout(300);
  var afterRetry = await page.evaluate(function () {
    var g = window.game;
    return {
      phase: g.phase, moves: g.state.moves, hist: g.history.length,
      key: window.TiltEngine.makeStateKey(g.stage)(g.state),
      overlay: document.getElementById('overlay').classList.contains('show')
    };
  });
  ok('RETRY puts the stage back exactly as it started',
    afterRetry.key === baseKey && afterRetry.moves === 0 && afterRetry.hist === 0,
    JSON.stringify(afterRetry));
  ok('and takes the overlay down', afterRetry.overlay === false && afterRetry.phase === 'play');

  // ── dead ends take themselves back ─────────────────────────────────────────
  // The game no longer labels a jammed board and hopes the player reads it. It
  // undoes the move that jammed it and says so. That is only safe because every
  // position is checked the moment it is reached — so the position one step back
  // is always winnable — and this is where that is verified against the real
  // shell rather than against the theory.
  console.log('\n\u001b[1mDEAD ENDS\u001b[0m');
  var jammed = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    g.save.data.unlocked = 99;
    for (var idx = 0; idx < S.length; idx++) {
      g.loadStage(idx);
      var states = E.reachable(g.stage, null, 3000);
      for (var i = 1; i < states.length; i++) {
        if (E.isTerminal(g.stage, states[i])) continue;
        if (E.solve(g.stage, states[i], 20000).solvable) continue;
        // Reproduce what the shell would be holding: the jammed position, with
        // the position before it on the history stack.
        var safe = E.initialState(g.stage);
        g.state = E.cloneState(states[i]);
        g.history = [safe];
        g.renderer.showState(g.state);
        var key = E.makeStateKey(g.stage);
        var rewound = g.rewindIfStuck();
        return {
          found: true, stage: S[idx].id, rewound: rewound,
          landed: key(g.state) === key(safe),
          history: g.history.length,
          phase: g.phase,
          toast: (document.getElementById('toast') || {}).textContent || '',
          solvableNow: E.solve(g.stage, g.state, 20000).solvable
        };
      }
    }
    return { found: false };
  });

  if (jammed.found) {
    ok('a jammed board undoes the move that jammed it  (stage ' + jammed.stage + ')',
      jammed.rewound === true && jammed.landed === true, JSON.stringify(jammed));
    ok('and lands somewhere that can still be won', jammed.solvableNow === true);
    ok('and says what it did', jammed.toast.length > 0, 'toast="' + jammed.toast + '"');
    ok('and leaves the board in play', jammed.phase === 'play' && jammed.history === 0,
      JSON.stringify(jammed));
  } else {
    ok('no sampled stage can be jammed at all', true, 'nothing reachable is unwinnable');
  }

  // …and it must not fire on an ordinary position. A rewind the player did not
  // earn is worse than no rewind at all: it takes moves away for no reason.
  var quiet = await page.evaluate(function () {
    var g = window.game;
    g.loadStage(0);
    var E = window.TiltEngine;
    var before = E.makeStateKey(g.stage)(g.state);
    g.history = [E.initialState(g.stage)];
    return { rewound: g.rewindIfStuck(), same: E.makeStateKey(g.stage)(g.state) === before };
  });
  ok('a solvable board is never rewound', quiet.rewound === false && quiet.same === true,
    JSON.stringify(quiet));

  // ── layout across viewports ────────────────────────────────────────────────
  console.log('\n\u001b[1mLAYOUT\u001b[0m');
  var viewports = [
    { name: 'iPhone SE  320×568', w: 320, h: 568 },
    { name: 'iPhone 12  390×844', w: 390, h: 844 },
    { name: 'Pixel 7    412×915', w: 412, h: 915 },
    { name: 'landscape  844×390', w: 844, h: 390 },
    { name: 'tablet     768×1024', w: 768, h: 1024 }
  ];
  // Whichever stage has the most cells — the one layout is most likely to fail on.
  var biggest = await page.evaluate(function () {
    var S = window.TiltStages.STAGES, best = 0, at = 0;
    S.forEach(function (d, i) {
      var area = d.board.length * d.board[0].length;
      if (area > best) { best = area; at = i; }
    });
    return { index: at, label: S[at].board[0].length + '×' + S[at].board.length };
  });

  for (var v = 0; v < viewports.length; v++) {
    var vp = viewports[v];
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate(function (i) { window.game.loadStage(i); }, biggest.index);
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
    ok(biggest.label + ' board fits · ' + vp.name, fit.fits && !fit.hScroll && !fit.vScroll,
      'cell=' + fit.cell + ' fits=' + fit.fits + ' hscroll=' + fit.hScroll + ' vscroll=' + fit.vScroll);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'vp-' + vp.w + 'x' + vp.h + '.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ── menu ───────────────────────────────────────────────────────────────────
  console.log('\n\u001b[1mSTAGE MENU\u001b[0m');
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
  ok('menu lists every stage', menu.cells === stageCount, 'cells=' + menu.cells + ' of ' + stageCount);
  ok('menu groups them into chapters', menu.chapters === menu.expectChapters && menu.chapters > 1,
    'chapters=' + menu.chapters);
  ok('cleared stages are marked', menu.done > 0, 'done=' + menu.done);
  ok('menu shows overall progress', /\d+/.test(menu.progress), menu.progress);
  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'menu.png') });
  await page.click('#btn-close');
  await page.waitForTimeout(340);

  // ── persistence ────────────────────────────────────────────────────────────
  console.log('\n\u001b[1mPROGRESSION\u001b[0m');
  var unlock = await page.evaluate(function () {
    var g = window.game;
    var total = window.TiltStages.STAGES.length;
    g.save.reset();
    var W = window.TiltSave.Save.SKIP_WINDOW;
    return {
      window: W,
      firstOpen: g.save.isUnlocked(1),
      windowOpen: g.save.isUnlocked(1 + W),
      beyondShut: g.save.isUnlocked(2 + W),
      lastShut: g.save.isUnlocked(total)
    };
  });
  ok('stage 1 is open on a fresh save', unlock.firstOpen === true);
  ok('a stuck player may still reach ' + unlock.window + ' stages ahead', unlock.windowOpen === true);
  ok('but no further than that', unlock.beyondShut === false);
  ok('the late campaign stays locked', unlock.lastShut === false);
  await page.evaluate(function () { window.game.save.data.unlocked = 99; window.game.save.flush(); });

  console.log('\n\u001b[1mPERSISTENCE\u001b[0m');
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
  console.log('\n\u001b[1mTOUCH SWIPE\u001b[0m');
  await page.evaluate(function () { window.game.save.data.unlocked = 99; window.game.loadStage(0); });
  await page.waitForTimeout(180);
  var box = await page.locator('#board-area').boundingBox();
  var cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(250);
  var afterTap = await page.evaluate(function () { return window.game.state.moves; });
  ok('a plain tap does not move anything', afterTap === 0, 'moves=' + afterTap);

  // Swipe the stage's real solution rather than a fixed direction: which way
  // stage 1 opens is a property of a generated board, not of the input code
  // this section is here to test.
  var SWIPE = { U: [0, -120], D: [0, 120], L: [-120, 0], R: [120, 0] };
  var plan1 = await page.evaluate(function () {
    var g = window.game;
    var r = window.TiltEngine.solve(g.stage, g.state, 200000);
    return { path: r.path, par: r.moves };
  });

  await swipe(page, cx, cy, SWIPE[plan1.path[0]][0], SWIPE[plan1.path[0]][1]);
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; }, null, { timeout: 6000 });
  var afterSwipe = await page.evaluate(function () {
    return { moves: window.game.state.moves, grav: window.game.renderer.gravity };
  });
  ok('a swipe ' + plan1.path[0] + ' tilts ' + plan1.path[0],
    afterSwipe.moves === 1 && afterSwipe.grav === plan1.path[0], JSON.stringify(afterSwipe));

  for (var sp = 1; sp < plan1.path.length; sp++) {
    await swipe(page, cx, cy, SWIPE[plan1.path[sp]][0], SWIPE[plan1.path[sp]][1]);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(700);
  var afterDown = await page.evaluate(function () {
    return { phase: window.game.phase, moves: window.game.state.moves };
  });
  ok('swiping the solution finishes stage 1 in par ' + plan1.par,
    afterDown.phase === 'clear' && afterDown.moves === plan1.par, JSON.stringify(afterDown));

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
  console.log('\n\u001b[1mDEVICE TILT\u001b[0m');
  var tiltResult = await page.evaluate(async function () {
    var g = window.game;
    var input = g.input;
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    g.loadStage(0);
    input.tilt.enabled = true;
    input.tilt.neutral = null;
    input.tilt.armed = true;
    input.tilt.invert = false;
    var realCommit = input.on.commit;
    var emitted = [];
    input.on.commit = function (dir) { emitted.push(dir); };

    var fire = function (beta, gamma) { input.onOrientation({ beta: beta, gamma: gamma }); };

    // Neutral is beta 50, gamma 0. The final pose selects the direction; the
    // intermediate pose lets this test prove motion itself never commits.
    var aim = function (d, amount) {
      var POSE = {
        R: [50, amount], L: [50, -amount],
        D: [50 + amount, 0], U: [50 - amount, 0]
      };
      fire(POSE[d][0], POSE[d][1]);
    };

    var firstDir = 'R';
    var accepted = function () { return emitted.length; };

    fire(50, 0);                    // first reading captures the neutral pose
    var neutralCaptured = !!input.tilt.neutral;

    fire(50, 4);                    // inside the deadzone
    await sleep(140);
    fire(50, 4);
    var deadzoneQuiet = accepted() === 0;

    aim(firstDir, 18);              // movement starts and direction is visible
    var aimedRight = g.renderer.aimDir === firstDir;
    await sleep(28);
    aim(firstDir, 30);              // still moving: settle timer restarts
    await sleep(38);
    var quietWhileMoving = accepted() === 0;
    await sleep(62);                // no further event: final pose is now still
    var committed = accepted() === 1;

    // Still held over: must not fire again until the device returns to centre.
    aim(firstDir, 30);
    await sleep(100);
    var noRepeatWhileHeld = accepted() === 1;

    fire(50, 0);                    // back to neutral re-arms
    var rearmed = input.tilt.armed === true;

    // Use the other axis so screen-space direction mapping is also covered.
    var secondDir = 'D';
    var vertical = true;

    await sleep(120);
    aim(secondDir, 18);
    var aimedDown = g.renderer.aimDir === secondDir;
    await sleep(28);
    aim(secondDir, 30);
    await sleep(100);
    var firesAgain = accepted() === 2;

    input.disableTilt();
    input.on.commit = realCommit;
    return {
      neutralCaptured: neutralCaptured,
      deadzoneQuiet: deadzoneQuiet,
      aimedRight: aimedRight,
      quietWhileMoving: quietWhileMoving,
      committed: committed,
      noRepeatWhileHeld: noRepeatWhileHeld,
      rearmed: rearmed,
      firesAgain: firesAgain,
      aimedDown: aimedDown,
      firstDir: firstDir, secondDir: secondDir, vertical: vertical
    };
  });
  ok('tilt captures a neutral pose on enable', tiltResult.neutralCaptured);
  ok('small tilts inside the deadzone do nothing', tiltResult.deadzoneQuiet);
  ok('tilt shows the aimed direction before committing  (' + tiltResult.firstDir + ')',
    tiltResult.aimedRight);
  ok('moving the phone does not emit a tilt', tiltResult.quietWhileMoving);
  ok('the final settled pose commits without another sensor event', tiltResult.committed);
  ok('holding the tilt does not machine-gun moves', tiltResult.noRepeatWhileHeld);
  ok('returning to centre re-arms the tilt', tiltResult.rearmed);
  ok('a re-armed tilt accepts the next move  (' + tiltResult.secondDir + ')', tiltResult.firesAgain);
  ok('both tilt axes map to the direction asked for', tiltResult.aimedDown,
    'second direction was ' + tiltResult.secondDir);

  console.log('\n\u001b[1mCONSOLE\u001b[0m');
  ok('no console errors across the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();

  console.log('');
  if (failures.length) {
    console.log('\u001b[31m\u001b[1m' + failures.length + ' of ' + checks + ' checks failed\u001b[0m');
    failures.forEach(function (f) { console.log('  \u001b[31m✗\u001b[0m ' + f); });
    process.exit(1);
  } else {
    console.log('\u001b[32m\u001b[1m✓ all ' + checks + ' browser checks passed\u001b[0m');
  }
})().catch(function (e) {
  console.error('\u001b[31mQA harness crashed:\u001b[0m', e);
  process.exit(1);
});
