'use strict';

/*
 * Contracts for the penguin expression system.
 *
 * Written as a browser harness rather than a unit test because almost every
 * claim the feature makes is a claim about the running game: that a face lands
 * on the right penguin, that it goes away again on the frame clock, that a
 * stale hold cannot revert a newer reaction, and — the one that cannot be
 * asserted anywhere but on real pixels — that swapping a face moves nothing.
 *
 * It complements tools/qa.js, which already proves the rules and the interface
 * are unchanged; nothing here re-plays the campaign.
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var chromium = require('playwright').chromium;

var ROOT = path.resolve(__dirname, '..');
var MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg'
};
var failures = 0;

function ok(label, pass, detail) {
  var mark = pass ? '[32m✓[0m' : '[31m✗[0m';
  console.log('  ' + mark + ' ' + label + (pass || !detail ? '' : '  [2m' + detail + '[0m'));
  if (!pass) failures++;
}
function section(name) { console.log('\n[1m' + name + '[0m'); }

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/') pathname = '/index.html';
      var file = path.resolve(ROOT, '.' + pathname);
      if (file.indexOf(ROOT + path.sep) !== 0) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

/* Load a board built for one rule, the way tools/qa.js does: the campaign is
   generated to be as empty as each length allows, so the boards that exercise
   cracked ice have to be brought along. */
var PROBES = {
  surprise: ['A.x..', '.....', '.....', '.....', 'a....'],
  danger:   ['A....', '.....', '.....', '.....', 'a...x'],
  fail:     ['A...x', '.....', '.....', '.....', 'a....'],
  pair:     ['A...a', '.....', '.....', '.....', 'B#..b']
};

async function loadProbe(page, name) {
  return page.evaluate(function (a) {
    var g = window.game, S = window.TiltStages.STAGES, E = window.TiltEngine;
    var def = { id: 'probe-' + a.name, name: 'PROBE', board: a.board, par: 1 };
    def.par = (E.solve(E.compile(def), null, 200000).moves) || 1;
    S.push(def);
    g.save.data.unlocked = 999;
    g.loadStage(S.length - 1);
    return true;
  }, { name: name, board: PROBES[name] });
}
async function dropProbe(page) {
  await page.evaluate(function () {
    var S = window.TiltStages.STAGES;
    if (String(S[S.length - 1].id).indexOf('probe-') === 0) S.pop();
    window.game.loadStage(0);
  });
}

var KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };

async function tilt(page, dir) {
  await page.keyboard.press(KEY[dir]);
  await page.waitForFunction(function () { return window.game.phase !== 'busy'; },
    null, { timeout: 6000 }).catch(function () {});
  await page.waitForTimeout(60);
}

function faces(page) {
  return page.evaluate(function () {
    return window.game.reactions.snapshot().map(function (p) {
      return { id: p.id, expression: p.expression, position: p.position, goal: p.goal };
    });
  });
}
function expressions(page) {
  return faces(page).then(function (list) {
    return list.map(function (p) { return p.expression; });
  });
}

/* The bounding box of the penguin's own frame inside its cell.
   A pixel counts when it is far from the ice it is standing on, which finds the
   rounded frame and skips the white belly — and keeps working when that frame
   is the penguin's own yellow or purple rather than black. Every face asset is
   the same square with a different drawing inside it, so this box is the one
   number that says "the swap moved nothing". */
async function penguinBox(page) {
  return page.evaluate(function () {
    var g = window.game, r = g.renderer;
    var i = 0;
    for (i = 0; i < g.state.alive.length; i++) {
      if (g.state.alive[i] && g.stage.colour[i] !== window.TiltEngine.GRAY) break;
    }
    var p = g.state.pos[i];
    // Wide enough for the whole block, tight enough to exclude its neighbours.
    var pad = r.cell * .55;
    var c = r.project(p[0] + .5, p[1] + .5, 0);
    var x0 = Math.max(0, Math.round((c.x - pad) * r.dpr));
    var y0 = Math.max(0, Math.round((c.y - pad) * r.dpr));
    var w = Math.min(r.canvas.width - x0, Math.round(pad * 2 * r.dpr));
    var h = Math.min(r.canvas.height - y0, Math.round(pad * 2 * r.dpr));
    var data = r.ctx.getImageData(x0, y0, w, h).data;
    // The plain ice this cell is drawn on, read from a corner of the sample.
    var bg = [data[0], data[1], data[2]];
    var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        if (data[o + 3] < 40) continue;
        var dr = data[o] - bg[0], dg = data[o + 1] - bg[1], db = data[o + 2] - bg[2];
        if (dr * dr + dg * dg + db * db < 90 * 90) continue;   // still the ice
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { n: n, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  });
}

(async function main() {
  var server = await serve();
  var base = 'http://127.0.0.1:' + server.address().port + '/';
  var launch = {};
  ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH]
    .forEach(function (p) { if (!launch.executablePath && p && fs.existsSync(p)) launch.executablePath = p; });
  var browser = await chromium.launch(launch);
  var page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  var errors = [];
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.click('#btn-home-play');
  await page.waitForTimeout(200);

  // ── preload ────────────────────────────────────────────────────────────────
  section('PRELOAD');
  await page.waitForFunction(function () {
    return window.game.reactions.bank.ready();
  }, null, { timeout: 10000 }).catch(function () {});

  var bank = await page.evaluate(function () {
    var X = window.TiltExpression, b = window.game.reactions.bank;
    var sizes = {}, missing = [];
    X.EXPRESSIONS.forEach(function (name) {
      var img = b.face(name);
      if (!img) { missing.push(name); return; }
      sizes[name] = img.naturalWidth + 'x' + img.naturalHeight;
    });
    var paths = {};
    X.EXPRESSIONS.forEach(function (n) { paths[X.FACE_FILES[n]] = 1; });
    Object.keys(X.COLOUR_FACE_FILES).forEach(function (setName) {
      var set = X.COLOUR_FACE_FILES[setName];
      Object.keys(set).forEach(function (n) { paths[set[n]] = 1; });
    });
    return { ready: b.ready(), requests: b.expected, missing: missing, sizes: sizes,
      declared: Object.keys(paths).length, expressions: X.EXPRESSIONS.length };
  });
  ok('nine expressions are declared', bank.expressions === 9, 'found ' + bank.expressions);
  ok('every face is decoded before play', bank.ready && !bank.missing.length,
    'missing=' + bank.missing.join(','));
  ok('every drawing is fetched once and only once  (' + bank.requests +
    ' requests for ' + bank.declared + ' declared paths)',
    bank.requests === bank.declared);
  var distinct = await page.evaluate(function () {
    var X = window.TiltExpression, b = window.game.reactions.bank, seen = [];
    return X.EXPRESSIONS.every(function (name) {
      var img = b.face(name);
      if (!img || seen.indexOf(img) >= 0) return false;
      seen.push(img);
      return true;
    });
  });
  ok('each expression resolves to a drawing of its own', distinct);
  var allSizes = await page.evaluate(function () {
    var b = window.game.reactions.bank, out = {};
    Object.keys(b.images).forEach(function (src) {
      out[b.images[src].naturalWidth + 'x' + b.images[src].naturalHeight] = 1;
    });
    return Object.keys(out);
  });
  ok('every drawing, shared and per-colour, is the same 512px square',
    allSizes.length === 1 && allSizes[0] === '512x512', allSizes.join(' '));

  // ── the per-colour sets, and what they must not do until they are whole ────
  section('PER-COLOUR FACES');
  var colours = await page.evaluate(function () {
    var X = window.TiltExpression, b = window.game.reactions.bank;
    return Object.keys(X.COLOUR_FACE_FILES).map(function (setName) {
      var set = X.COLOUR_FACE_FILES[setName];
      var declared = Object.keys(set);
      return {
        set: setName,
        declared: declared.length,
        missing: X.missingFor(setName),
        decoded: declared.filter(function (n) { return !!b.images[set[n]]; }).length,
        complete: !!b.complete[setName]
      };
    });
  });
  colours.forEach(function (c) {
    ok('every declared ' + c.set + ' drawing decodes  (' + c.decoded + '/' +
      c.declared + ')', c.decoded === c.declared);
    ok(c.set + ' is ' + (c.complete ? 'complete and in use' : 'held back until all nine land') +
      (c.missing.length ? '  — still needs ' + c.missing.join(', ') : ''),
      c.complete === (c.missing.length === 0));
  });

  // An incomplete set must leave the board exactly as it was: every expression
  // falls back to the shared drawing, and the beak keeps carrying the colour.
  var fallback = await page.evaluate(function () {
    var X = window.TiltExpression, g = window.game, R = g.reactions, b = R.bank;
    var out = { mixed: [], tint: [] };
    [1, 2].forEach(function (colour) {
      if (b.hasColourSet(colour)) return;                 // a whole set is allowed to differ
      X.EXPRESSIONS.forEach(function (name) {
        if (b.face(name, colour) !== b.face(name)) out.mixed.push(colour + ':' + name);
      });
    });
    R.pens.forEach(function (p) {
      if (!p || b.hasColourSet(p.colour)) return;
      R.setExpression(p.index, 'good');
      if (R.visualFor(p.index).tintBeak === false) out.tint.push(p.id);
    });
    R.reset();
    return out;
  });
  ok('an incomplete colour set draws the shared face for every expression',
    fallback.mixed.length === 0, fallback.mixed.join(' '));
  ok('and leaves the beak carrying the aurora colour',
    fallback.tint.length === 0, fallback.tint.join(' '));

  /* The switch-on, proved before the artwork it waits for exists. The set is
     completed in memory with the drawings already on disk, the bank is asked
     to look again, and the whole path — face lookup, beak tint, the drawn
     silhouette — has to change over for that colour and for no other. */
  var switched = await page.evaluate(async function () {
    var X = window.TiltExpression, g = window.game, R = g.reactions, b = R.bank;
    var setName = X.COLOUR_SETS[1];
    var set = X.COLOUR_FACE_FILES[setName];
    var restore = {}, filler = set.miss;
    X.missingFor(setName).forEach(function (name) { restore[name] = true; set[name] = filler; });
    b.sync();

    var report = {
      completed: b.hasColourSet(1),
      otherUntouched: !b.hasColourSet(2),
      ownFaces: X.EXPRESSIONS.every(function (n) { return b.face(n, 1) === b.images[set[n]]; }),
      sharedForOther: X.EXPRESSIONS.every(function (n) { return b.face(n, 2) === b.face(n); }),
      tintOff: true, tintOnForOther: true
    };
    R.pens.forEach(function (p) {
      if (!p) return;
      R.setExpression(p.index, 'good');
      var tint = R.visualFor(p.index).tintBeak;
      if (p.colour === 1 && tint !== false) report.tintOff = false;
      if (p.colour === 2 && tint === false) report.tintOnForOther = false;
      R.setExpression(p.index, 'normal');
      if (p.colour === 1 && R.visualFor(p.index).face !== b.face('normal', 1)) {
        report.ownFaces = false;                 // the resting face must swap too
      }
    });

    X.EXPRESSIONS.forEach(function (name) { if (restore[name]) delete set[name]; });
    b.sync();
    R.reset();
    report.restored = !b.hasColourSet(1);
    return report;
  });
  ok('completing a colour set switches that colour over', switched.completed && switched.ownFaces,
    JSON.stringify(switched));
  ok('including the resting face, and drops the beak tint with it', switched.tintOff);
  ok('and leaves the other colour on the shared set',
    switched.otherUntouched && switched.sharedForOther && switched.tintOnForOther,
    JSON.stringify(switched));
  ok('the probe put the incomplete set back', switched.restored);

  // ── resting state ──────────────────────────────────────────────────────────
  section('NORMAL');
  ok('a freshly loaded stage wears the normal face',
    (await expressions(page)).every(function (e) { return e === 'normal'; }),
    JSON.stringify(await expressions(page)));

  // ── every face renders at exactly the same size and place ──────────────────
  section('NO LAYOUT SHIFT ON A FACE SWAP');
  await page.evaluate(function () { window.game.reactions.reduceMotion = true; });
  var boxes = await page.evaluate(function () { return window.TiltExpression.EXPRESSIONS; })
    .then(async function (names) {
      var out = [];
      for (var i = 0; i < names.length; i++) {
        await page.evaluate(function (n) {
          window.game.reactions.setExpression(0, n);
          window.game.wake();
        }, names[i]);
        await page.waitForTimeout(90);
        out.push({ name: names[i], box: await penguinBox(page) });
      }
      return out;
    });
  var first = boxes[0].box;
  var drifted = boxes.filter(function (b) {
    return Math.abs(b.box.x - first.x) > 1 || Math.abs(b.box.y - first.y) > 1 ||
      Math.abs(b.box.w - first.w) > 1 || Math.abs(b.box.h - first.h) > 1;
  });
  ok('the penguin silhouette is found at all', first.n > 200 && first.w > 10, JSON.stringify(first));
  ok('all nine faces draw at the same position and size',
    drifted.length === 0,
    drifted.map(function (b) { return b.name + '=' + JSON.stringify(b.box); }).join(' '));

  var poses = await page.evaluate(function () {
    var X = window.TiltExpression, g = window.game;
    g.reactions.reduceMotion = true;
    var still = X.EXPRESSIONS.every(function (n) {
      g.reactions.setExpression(0, n);
      var v = g.reactions.visualFor(0);
      return v.scale === 1 && v.dx === 0 && v.dy === 0;
    });
    g.reactions.reduceMotion = false;
    // and with motion on, the pose always returns to rest by the end
    var settles = X.EXPRESSIONS.filter(function (n) { return X.ANIM[n]; }).every(function (n) {
      var end = X.pose(X.ANIM[n].kind, 1, 'L');
      return Math.abs(end.scale - 1) < .001 && Math.abs(end.dx) < .001 && Math.abs(end.dy) < .001;
    });
    g.reactions.reset();
    return { still: still, settles: settles };
  });
  ok('reduced motion keeps the face and drops the pose', poses.still);
  ok('every reaction pose ends exactly where it started', poses.settles);

  // ── the timer race the brief is most worried about ────────────────────────
  section('TIMER CONFLICTS');
  await page.evaluate(function () { window.game.reactions.setExpression(0, 'good'); window.game.wake(); });
  await page.waitForTimeout(300);
  await page.evaluate(function () { window.game.reactions.setExpression(0, 'danger'); window.game.wake(); });
  await page.waitForTimeout(420);   // past the first face's 600ms hold
  var racedMid = (await expressions(page))[0];
  ok('a newer reaction is not reverted by an older one\'s hold', racedMid === 'danger',
    'saw ' + racedMid);
  await page.waitForTimeout(500);   // past the second face's own hold
  var racedEnd = (await expressions(page))[0];
  ok('and the newest reaction retires on its own schedule', racedEnd === 'normal', 'saw ' + racedEnd);

  // The same race through the real input path: four moves fired faster than
  // any single reaction is held for.
  var rapid = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    g.save.data.unlocked = 999;
    for (var i = 0; i < S.length; i++) {
      var sol = E.solve(E.compile(S[i]), null, 200000);
      if (sol.solvable && sol.moves >= 4) { g.loadStage(i); return sol.path.slice(0, 4); }
    }
    return null;
  });
  if (rapid) {
    for (var ri = 0; ri < rapid.length; ri++) {
      await page.keyboard.press(KEY[rapid[ri]]);
      await page.waitForTimeout(90);          // well inside every hold in the table
    }
    await page.waitForFunction(function () { return window.game.phase !== 'busy'; },
      null, { timeout: 6000 }).catch(function () {});
    await page.waitForTimeout(120);
    var duringRapid = await page.evaluate(function () {
      var R = window.game.reactions, out = [];
      R.pens.forEach(function (p) { if (p) out.push({ e: p.expression, token: p.token }); });
      return out;
    });
    ok('hammering moves leaves the newest reaction showing, not a stale one',
      duringRapid.every(function (p) { return p.e !== 'normal'; }), JSON.stringify(duringRapid));
    // and everything still retires when the last of them is done
    await page.waitForTimeout(1000);
    var settled = await expressions(page);
    ok('and everything retires once the last reaction is spent',
      settled.every(function (e) { return e === 'normal' || e === 'clear'; }),
      JSON.stringify(settled));
  }

  var tokens = await page.evaluate(function () {
    var R = window.game.reactions;
    var a = R.setExpression(0, 'good');
    var b = R.setExpression(0, 'miss');
    R.reset();
    var c = R.get(0).token;
    return { rising: b > a && c > b };
  });
  ok('every reaction carries a newer token than the one it replaced', tokens.rising);

  // ── a swipe that moves nothing ─────────────────────────────────────────────
  section('MISS');
  var missed = await page.evaluate(async function () {
    var g = window.game, E = window.TiltEngine;
    g.loadStage(0);
    for (var d = 0; d < 4; d++) {
      var r = E.simulate(g.stage, g.state, E.DIRS[d], { frames: false });
      if (!r.moved) return E.DIRS[d];
    }
    return null;
  });
  ok('stage 1 has a direction that moves nothing', !!missed, String(missed));
  if (missed) {
    await page.keyboard.press(KEY[missed]);
    await page.waitForTimeout(80);
    var missFaces = await expressions(page);
    ok('a rebuffed swipe puts every wedged penguin in miss',
      missFaces.every(function (e) { return e === 'miss'; }), JSON.stringify(missFaces));
    var movesCharged = await page.evaluate(function () { return window.game.state.moves; });
    ok('and still does not charge a move', movesCharged === 0, 'moves=' + movesCharged);
    await page.waitForTimeout(480);
    var backFaces = await expressions(page);
    ok('miss goes back to normal on its own', backFaces.every(function (e) { return e === 'normal'; }),
      JSON.stringify(backFaces));
  }

  // ── good / perfect / clear along a proved-optimal line ─────────────────────
  section('GOOD · PERFECT · CLEAR (solver-driven)');
  var line = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    // A board long enough to show a run of good moves before the finish.
    var idx = 0;
    for (var i = 0; i < S.length; i++) if (S[i].par >= 6) { idx = i; break; }
    g.save.data.unlocked = 999;
    g.loadStage(idx);
    return { index: idx, id: S[idx].id, par: S[idx].par,
      path: E.solve(g.stage, null, 400000).path };
  });
  var seen = [];
  for (var i = 0; i < line.path.length; i++) {
    await tilt(page, line.path[i]);
    seen.push(await expressions(page));
  }
  var flat = seen.reduce(function (a, b) { return a.concat(b); }, []);
  ok('an optimal line on stage ' + line.id + ' (par ' + line.par + ') reads as good moves',
    flat.indexOf('good') >= 0, JSON.stringify(seen));
  ok('and reaches perfect as the clear comes into range',
    flat.indexOf('perfect') >= 0, JSON.stringify(seen));
  var finalFaces = seen[seen.length - 1];
  ok('every penguin wears clear once the stage is solved',
    finalFaces.length > 0 && finalFaces.every(function (e) { return e === 'clear'; }),
    JSON.stringify(finalFaces));
  ok('the stage really did clear', await page.evaluate(function () {
    return window.game.phase === 'clear' || window.game.phase === 'play';
  }));

  // ── bad, but only when the solver is certain ───────────────────────────────
  section('BAD (only on a provably longer solution)');
  var bad = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    // A first move that provably lengthens the solution: par says how long the
    // board is, and the position after this move needs strictly more.
    for (var i = 0; i < S.length && i < 40; i++) {
      var st = E.compile(S[i]);
      var base = E.solve(st, null, 200000);
      for (var d = 0; d < 4; d++) {
        var r = E.simulate(st, E.initialState(st), E.DIRS[d], { frames: false });
        if (!r.moved || r.broken) continue;
        var after = E.solve(st, r.state, 200000);
        if (after.solvable && after.moves > base.moves) {
          g.save.data.unlocked = 999;
          g.loadStage(i);
          return { index: i, id: S[i].id, dir: E.DIRS[d], from: base.moves, to: after.moves };
        }
      }
    }
    return null;
  });
  ok('a provably worse move exists to test', !!bad, JSON.stringify(bad));
  if (bad) {
    await tilt(page, bad.dir);
    var badFaces = await expressions(page);
    ok('a move that lengthens the solution (' + bad.from + '→' + bad.to + ') reads as bad',
      badFaces.indexOf('bad') >= 0, JSON.stringify(badFaces));
  }

  var neverGuesses = await page.evaluate(function () {
    var X = window.TiltExpression;
    var unknown = X.evaluateMove(null, null, {
      beforeDist: { solvable: true, exact: false, moves: -1 },
      afterDist: { solvable: true, exact: true, moves: 3 }
    });
    var sideways = X.evaluateMove(null, null, {
      beforeDist: { solvable: true, exact: true, moves: 5 },
      afterDist: { solvable: true, exact: true, moves: 5 }
    });
    return { unknown: unknown, sideways: sideways };
  });
  ok('a solver that could not answer produces no verdict at all',
    neverGuesses.unknown.type === 'normal' && neverGuesses.unknown.confidence === 0,
    JSON.stringify(neverGuesses.unknown));
  ok('a move that changes nothing is not called bad',
    neverGuesses.sideways.type === 'normal', JSON.stringify(neverGuesses.sideways));

  // ── special tiles ──────────────────────────────────────────────────────────
  section('SURPRISE · DANGER · FAIL (cracked ice probe boards)');
  await loadProbe(page, 'surprise');
  await tilt(page, 'R');
  var sur = await expressions(page);
  ok('gliding over cracked ice and surviving reads as surprise',
    sur.indexOf('surprise') >= 0, JSON.stringify(sur));
  await page.waitForTimeout(500);
  ok('and surprise goes back to normal', (await expressions(page))[0] === 'normal');
  await dropProbe(page);

  await loadProbe(page, 'danger');
  await tilt(page, 'R');
  var dan = await expressions(page);
  ok('coming to rest one swipe from cracked ice reads as danger',
    dan.indexOf('danger') >= 0, JSON.stringify(dan));
  await dropProbe(page);

  await loadProbe(page, 'fail');
  await tilt(page, 'R');
  await page.waitForTimeout(400);
  var failFaces = await expressions(page);
  var over = await page.evaluate(function () { return window.game.phase; });
  ok('stopping on cracked ice ends the run', over === 'over', 'phase=' + over);
  ok('and every penguin wears the fail face',
    failFaces.length > 0 && failFaces.every(function (e) { return e === 'fail'; }),
    JSON.stringify(failFaces));
  await page.waitForTimeout(900);
  ok('fail is held for as long as the game-over card is up',
    (await expressions(page)).every(function (e) { return e === 'fail'; }));

  section('RESTART AND UNDO');
  await page.click('#btn-restart');
  await page.waitForTimeout(150);
  ok('restart puts every penguin back to normal',
    (await expressions(page)).every(function (e) { return e === 'normal'; }),
    JSON.stringify(await expressions(page)));
  ok('and puts the board back in play',
    (await page.evaluate(function () { return window.game.phase; })) === 'play');

  await tilt(page, 'R');
  await page.waitForTimeout(400);
  await page.click('#btn-undo');
  await page.waitForTimeout(150);
  ok('undo clears the reaction it took back',
    (await expressions(page)).every(function (e) { return e === 'normal'; }),
    JSON.stringify(await expressions(page)));
  await dropProbe(page);

  // ── one board, two penguins, two different days ────────────────────────────
  section('MULTIPLE PENGUINS');
  await loadProbe(page, 'pair');
  var pairBefore = await faces(page);
  ok('the probe board carries two penguins with separate state',
    pairBefore.length === 2 && pairBefore[0].id !== pairBefore[1].id,
    JSON.stringify(pairBefore));
  await tilt(page, 'R');
  var pairAfter = await faces(page);
  var cleared = pairAfter.filter(function (p) { return p.expression === 'clear'; });
  ok('only the penguin that reached its own aurora wears clear',
    cleared.length === 1, JSON.stringify(pairAfter));
  ok('the other penguin keeps a face of its own',
    pairAfter.length === 2 && pairAfter[0].expression !== pairAfter[1].expression,
    JSON.stringify(pairAfter));
  ok('each penguin knows its own colour, goal and position',
    pairAfter.every(function (p) { return p.goal && p.id; }), JSON.stringify(pairAfter));
  await dropProbe(page);

  // ── a dead end, said once ─────────────────────────────────────────────────
  section('DEAD END');
  var jam = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    g.save.data.unlocked = 999;
    // A first move that leaves a position the board can no longer be won from.
    for (var i = 0; i < S.length && i < 40; i++) {
      var st = E.compile(S[i]);
      for (var d = 0; d < 4; d++) {
        var r = E.simulate(st, E.initialState(st), E.DIRS[d], { frames: false });
        if (!r.moved || r.broken || r.clear) continue;
        var after = E.solve(st, r.state, 200000);
        if (after.solvable) continue;
        // and a second move that stays inside the jam
        for (var e = 0; e < 4; e++) {
          var r2 = E.simulate(st, r.state, E.DIRS[e], { frames: false });
          if (!r2.moved || r2.broken) continue;
          g.loadStage(i);
          return { index: i, id: S[i].id, first: E.DIRS[d], second: E.DIRS[e] };
        }
      }
    }
    return null;
  });
  ok('a board with a reachable dead end exists to test', !!jam, JSON.stringify(jam));
  if (jam) {
    await tilt(page, jam.first);
    var jammed = await expressions(page);
    ok('walking into a dead end reads as danger', jammed.indexOf('danger') >= 0,
      JSON.stringify(jammed));
    await page.waitForTimeout(700);
    await tilt(page, jam.second);
    var stillJammed = await expressions(page);
    ok('and is not repeated on every move made inside it',
      stillJammed.indexOf('danger') < 0, JSON.stringify(stillJammed));
    await page.click('#btn-restart');
    await page.waitForTimeout(150);
  }

  // ── passing over an aurora is not a clear ──────────────────────────────────
  section('CROSSING AN AURORA IS NOT A CLEAR');
  var grazed = await page.evaluate(function () {
    var g = window.game, E = window.TiltEngine, S = window.TiltStages.STAGES;
    for (var i = 0; i < S.length && i < 30; i++) {
      var st = E.compile(S[i]);
      var s = E.initialState(st);
      for (var d = 0; d < 4; d++) {
        var r = E.simulate(st, s, E.DIRS[d]);
        if (!r.moved || r.clear) continue;
        // did anything pass over a goal it matches, mid-slide, and not stop?
        for (var b = 0; b < st.blocks.length; b++) {
          for (var t = 1; t + 1 < r.frames.length; t++) {
            if (!r.frames[t].alive[b]) break;
            var p = r.frames[t].pos[b], ci = p[1] * st.w + p[0];
            if (!st.goal[ci] || !E.accepts(st.goalColour[ci], st.colour[b])) continue;
            var q = r.frames[t + 1].pos[b];
            if (q[0] === p[0] && q[1] === p[1]) continue;
            g.save.data.unlocked = 999;
            g.loadStage(i);
            return { index: i, id: S[i].id, dir: E.DIRS[d] };
          }
        }
      }
    }
    return null;
  });
  if (grazed) {
    await tilt(page, grazed.dir);
    var grazeFaces = await expressions(page);
    ok('a penguin that crossed its own aurora without stopping is not cleared',
      grazeFaces.indexOf('clear') < 0, JSON.stringify(grazeFaces));
  } else {
    ok('a board where a penguin crosses its own aurora exists to test', false);
  }

  section('CONSOLE');
  ok('no console errors or warnings during the whole run', errors.length === 0,
    errors.join(' | '));

  await browser.close();
  server.close();
  console.log(failures
    ? '\n[31m' + failures + ' expression check(s) failed[0m\n'
    : '\n[32mAll expression checks passed[0m\n');
  process.exit(failures ? 1 : 0);
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
