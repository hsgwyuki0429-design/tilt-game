'use strict';
/*
 * Choose the campaign from the measured floe pool, and build src/stages.js.
 *
 *   node tools/floe-search.js                      # measure every 4×4 board
 *   node tools/floe-campaign.js --pool tools/.floe-cache/pool-4x4.json
 *   node tools/floe-campaign.js                    # rebuild from the selection
 *
 * The order is set by how hard a board is to find, not by how long it is: the
 * explorer in floe-search.js is re-run 600 times on every shortlisted board,
 * and the campaign climbs that cost geometrically. Par is still shown, and is
 * proved by the engine, but it no longer decides where a board goes.
 *
 * What a board must have to be considered at all:
 *
 *   - one floe: the ice is one edge-connected piece spanning the full 4×4,
 *     with its centre of mass within half a cell of the centre, so it sits
 *     level as a solid slab rather than hanging off one side;
 *   - fair: an ordinary move can never strand the pair;
 *   - two penguins that need each other: no solution exists in which neither
 *     ever stops the other (one-penguin boards only open the campaign);
 *   - no corridors: at most two forced moves in a row on the shortest route,
 *     and at most two moves of lone clean-up after the first collection;
 *   - at most three fatal "collect now" temptations on the shortest routes;
 *   - the solution uses at least 60% of the ice.
 *
 * Among those it prefers MUTUAL boards (each penguin must stop the other at
 * least once), boards whose cheapest solution needs more brakes, boards where
 * a penguin can only be collected by being braked onto its aurora, a single
 * shortest route, and moves that go the wrong way on purpose.
 */
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var E = require('../src/engine.js');
var F = require('./lib/floe.js');
var S = require('./floe-search.js');
var EV = F.EV;

var ROOT = path.resolve(__dirname, '..');
var SELECTION = path.join(__dirname, 'floe-selection.json');
var FINAL_RUNS = 600;
var COUNT = 100;
var SOLO_INTRO = 3;

var args = process.argv.slice(2);
function arg(name, def) { var i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }

function shapeKey(board) { return F.canonicalKey(board.map(function (r) { return r.replace(/[^#]/g, '.'); })); }
/* Where the penguins and auroras are, ignoring the ice. Two boards with the
   same pieces and a hole moved are one puzzle wearing two coats. */
function pieceKey(board) { return F.canonicalKey(board.map(function (r) { return r.replace(/#/g, '.'); })); }
function balance(board) {
  var sx = 0, sy = 0, n = 0, w = board[0].length, h = board.length;
  board.forEach(function (r, y) { for (var x = 0; x < w; x++) if (r[x] !== '#') { sx += x; sy += y; n++; } });
  return Math.hypot(sx / n - (w - 1) / 2, sy / n - (h - 1) / 2);
}
function goalsTouch(board) {
  var flat = board.join(''), w = board[0].length, a = flat.indexOf('a'), b = flat.indexOf('b');
  if (a < 0 || b < 0) return false;
  return Math.abs(a % w - b % w) + Math.abs(((a / w) | 0) - ((b / w) | 0)) === 1;
}
/* Does the route stop a penguin against open water inside the floe, rather
   than only at the rim? The first boards should teach that a hole is an edge. */
function usesHole(board, route) {
  var p = F.parseRows(board), floe = p.floe, g = floe.graph(p.gA, p.gB), s = p.a * g.B + p.b;
  for (var i = 0; i < route.length; i++) {
    var d = F.DIRS.indexOf(route[i]), t = g.next[s * 4 + d];
    var cells = [(t / g.B) | 0, t % g.B];
    for (var k = 0; k < 2; k++) {
      var c = cells[k];
      if (c === g.n) continue;
      var x = floe.X[c] + F.DV[d][0], y = floe.Y[c] + F.DV[d][1];
      if (x >= 0 && y >= 0 && x < floe.w && y < floe.h && !floe.floor[y * floe.w + x]) return true;
    }
    s = t;
  }
  return false;
}

function quality(c) {
  var q = c.kind === 'MUTUAL' ? 3 : c.kind === 'HELP' ? 1 : 0;
  q += 0.6 * Math.min(Math.max(0, (c.minBrakes || 0) - 1), 3);
  if (c.needBrakeHome) q += 1;
  if (c.tempt >= 1 && c.tempt <= 2) q += 0.8; else if (c.tempt === 3) q += 0.3;
  if (c.away >= 1) q += 0.5;
  q += c.ways === 1 ? 0.6 : c.ways === 2 ? 0.3 : 0;
  q -= 0.3 * c.maxForced + 0.3 * c.tail;
  q += c.usedCells / c.cells;
  q -= 1.2 * c.balance;
  return q;
}

function remeasure(c) {
  var p = F.parseRows(c.board), g = p.floe.graph(p.gA, p.gB), start = p.a * g.B + p.b;
  var m = S.measure(g, start, { runs: FINAL_RUNS, cap: Math.max(1000, c.par * 80) });
  ['explorer', 'explorerMedian', 'explorerGeo', 'quick', 'capped'].forEach(function (k) { c[k] = m[k]; });
  c.difficulty = +Math.log2(c.explorerGeo).toFixed(3);
  return c;
}

function select(poolFile) {
  var data = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  var pool = data.pool;
  pool.forEach(function (c) {
    c.shape = shapeKey(c.board);
    c.pieces = pieceKey(c.board);
    c.balance = +balance(c.board).toFixed(3);
    c.touch = goalsTouch(c.board);
    c.difficulty = Math.log2(c.explorerGeo);
  });
  var duo = pool.filter(function (c) {
    return c.penguins === 2 && c.balance <= 0.5 && c.maxForced <= 2 && c.tail <= 2 && c.tempt <= 3 &&
      c.usedCells / c.cells >= 0.6 && c.capped <= 1;
  });
  var solo = pool.filter(function (c) { return c.penguins === 1 && c.balance <= 0.5 && c.maxForced <= 1; });
  duo.forEach(function (c) { c.quality = quality(c); });
  console.log('pool ' + pool.length + ', eligible pairs ' + duo.length + ' (' +
    duo.filter(function (c) { return c.kind === 'MUTUAL'; }).length + ' mutual), eligible solos ' + solo.length);

  // Shortlist: the best few per quarter-step of rough difficulty, then measure
  // those properly.
  var bands = {};
  duo.forEach(function (c) { var k = Math.floor(c.difficulty * 4); (bands[k] = bands[k] || []).push(c); });
  var shortlist = [];
  Object.keys(bands).forEach(function (k) {
    var seenShapes = new Set();
    bands[k].sort(function (x, y) { return y.quality - x.quality; }).forEach(function (c) {
      if (seenShapes.size >= 60 || seenShapes.has(c.shape)) return;
      seenShapes.add(c.shape); shortlist.push(c);
    });
  });
  console.log('re-measuring ' + shortlist.length + ' shortlisted boards with ' + FINAL_RUNS + ' explorer runs');
  shortlist.forEach(remeasure);
  shortlist = shortlist.filter(function (c) { return c.capped <= FINAL_RUNS * 0.005; });

  // The one-penguin introduction: an edge stop, a hole stop, a turn.
  var intro = [], used = new Set();
  [[2, false], [3, true], [4, true]].forEach(function (want) {
    var options = solo.filter(function (c) {
      return c.par === want[0] && !used.has(c.shape) && c.ways === 1 && c.cells >= 11 &&
        (!want[1] || usesHole(c.board, c.route));
    }).sort(function (x, y) {
      return (y.usedCells / y.cells - x.usedCells / x.cells) || (x.balance - y.balance) ||
        (x.board.join('') < y.board.join('') ? -1 : 1);
    });
    assert(options.length, 'no introduction board with par ' + want[0]);
    var c = remeasure(options[0]);
    c.quality = 0; intro.push(c); used.add(c.shape);
  });

  // The climb: a geometric ramp in explorer cost from a few swipes to the
  // hardest boards the pool holds. The first three pairs teach the brake with
  // one helper; after that four boards in five are mutual.
  var sorted = shortlist.slice().sort(function (x, y) { return x.difficulty - y.difficulty; });
  var lo = Math.max(2.2, intro[intro.length - 1].difficulty + 0.15);
  var hi = sorted[Math.max(0, sorted.length - 5)].difficulty;
  var chosen = [], n = COUNT - intro.length, touches = 0, routes = new Set(), piecesUsed = new Set();
  intro.forEach(function (c) { piecesUsed.add(c.pieces); });
  for (var i = 0; i < n; i++) {
    var target = lo + (hi - lo) * i / (n - 1);
    var teach = i < 3, wantMutual = !teach && i % 5 !== 4;
    var touchRoom = touches < 2 + 0.35 * i;
    var best = null, bestScore = -Infinity;
    for (var width = 0.2; !best && width < 3; width += 0.2) {
      sorted.forEach(function (c) {
        if (used.has(c.shape) || piecesUsed.has(c.pieces) || Math.abs(c.difficulty - target) > width) return;
        if (teach && (c.kind !== 'HELP' || !c.needBrakeHome || c.tempt)) return;
        if (c.touch && !touchRoom) return;
        var sc = c.quality - Math.abs(c.difficulty - target) * 2;
        if (wantMutual && c.kind !== 'MUTUAL') sc -= 3;
        if (!wantMutual && c.kind === 'MUTUAL') sc -= 2.5;
        if (routes.has(c.route)) sc -= 1;
        if (sc > bestScore) { bestScore = sc; best = c; }
      });
    }
    assert(best, 'nothing left near difficulty ' + target.toFixed(2));
    chosen.push(best); used.add(best.shape); piecesUsed.add(best.pieces); routes.add(best.route);
    if (best.touch) touches++;
  }
  chosen.sort(function (x, y) { return x.difficulty - y.difficulty; });
  var stages = intro.concat(chosen).map(function (c) {
    var keep = {};
    ['board', 'kind', 'par', 'route', 'ways', 'difficulty', 'explorerGeo', 'explorerMedian', 'quick',
      'minBrakes', 'needBrakeHome', 'needAB', 'needBA', 'soloA', 'soloB', 'tempt', 'away', 'tail',
      'maxForced', 'choice', 'reach', 'traps', 'cells', 'usedCells', 'balance', 'quality'].forEach(function (k) {
      if (c[k] !== undefined) keep[k] = typeof c[k] === 'number' ? +c[k].toFixed(3) : c[k];
    });
    return keep;
  });
  var out = {
    version: 'floe-2026-10',
    source: {
      board: data.w + 'x' + data.h, shapes: data.shapes, layouts: data.layouts, starts: data.starts,
      kept: data.pool.length, stats: data.stats, roughRuns: data.runs, finalRuns: FINAL_RUNS,
      eligiblePairs: duo.length, shortlist: shortlist.length
    },
    stages: stages
  };
  fs.writeFileSync(SELECTION, JSON.stringify(out, null, 1) + '\n');
  return out;
}

// ── stages.js ─────────────────────────────────────────────────────────────
var NAMES = ('HOME PAIR GLIDE FLOE CROSS CALM FROST SHELF CRISP DAWN RIME THAW SLEET BERG CRAG PALE HUSH ' +
  'VEIL SPUR NORTH GLEAM SNAP RIDGE BASIN FJORD SHARD PRISM GLINT HOAR BLUE CLEFT WAKE SHOAL PACK TIDE ' +
  'SPIRE BRINE CROWN STILL FLARE QUARTZ LEDGE SLATE MIST ARCH FLINT GLACE SIREN HOLLOW HALF AURORA ' +
  'CINDER BEACON LANTERN HARBOUR KEEL ANCHOR MARINER COMPASS MERIDIAN SOLSTICE ZENITH LATITUDE CURRENT ' +
  'DRAUGHT CAVERN CHASM FISSURE MORAINE CIRQUE SERAC CREVASSE CORNICE SUMMIT TRAVERSE ASCENT PITON ' +
  'BELAY CAIRN BEARING POLARIS MIDNIGHT LONGNIGHT WHITEOUT BLIZZARD SQUALL TEMPEST GALE PASSAGE ' +
  'ICEFALL DEEPFROST COLDIRON STARFIELD NIGHTFALL FARSHORE LASTLIGHT ENDLESS THRESHOLD CROSSING TILT').split(' ');
var CHAPTERS = [['FIRST LIGHT', 'はじまり'], ['PARTNERS', 'ふたり'], ['BRAKES', '止まり木'], ['CROSSROADS', '分かれ道'],
  ['SETUP', '布石'], ['EXCHANGE', '入れ替え'], ['BALANCE', '釣り合い'], ['PATIENCE', '順番'],
  ['DISCOVERY', '発見'], ['FINALE', '結晶']];
var HINTS = {
  edge: { ja: '氷のふちで止まります。オーロラの上で止まれば回収です。',
    en: 'The edge of the ice stops you. Stop on the aurora to collect.' },
  hole: { ja: '穴のふちでも止まれます。水には落ちません。',
    en: 'A hole stops you just like the outer edge. Nobody falls in.' },
  turn: { ja: '一度別の場所で止まってから、向きを変えてみよう。',
    en: 'Stop somewhere else first, then change direction.' },
  brakeHome: { ja: 'もう一羽をオーロラの先に置くと、その上で止まれます。',
    en: 'Park the other penguin just past an aurora to stop on it.' },
  mutual: { ja: 'おたがいに一度ずつ、相手の足場になります。',
    en: 'Each penguin has to stop the other at least once.' },
  tempt: { ja: '回収できても、すぐに入れるとは限りません。相手の足場が残っているか確かめよう。',
    en: 'Being able to collect is not a reason to. Check the partner still has a brake.' },
  away: { ja: '一度オーロラから遠ざかると、別の止まり方が見えてきます。',
    en: 'Moving away from an aurora can reveal a new place to stop.' },
  help: { ja: 'もう一羽が止まるための足場になります。',
    en: 'The other penguin can be the brake you need.' }
};
function hintFor(c, i) {
  if (c.kind === 'SOLO') return HINTS[['edge', 'hole', 'turn'][Math.min(i, 2)]];
  if (c.tempt >= 1 && i % 3 === 1) return HINTS.tempt;
  if (c.kind === 'MUTUAL' && i % 3 !== 2) return HINTS.mutual;
  if (c.needBrakeHome) return HINTS.brakeHome;
  if (c.away >= 2) return HINTS.away;
  return HINTS.help;
}
function ideaFor(c) {
  if (c.kind === 'SOLO') return 'One penguin; the edge of the ice — the rim or a hole — is the only brake.';
  var bits = [c.kind === 'MUTUAL' ? 'Each penguin must stop the other at least once' : 'One penguin must stop the other'];
  if (c.needBrakeHome) bits.push('a penguin can only be collected by being braked onto its aurora');
  if (c.tempt) bits.push(c.tempt + ' fatal early collection' + (c.tempt > 1 ? 's' : '') + ' on the shortest routes');
  return bits.join('; ') + '.';
}

function build(data) {
  var chosen = data.stages;
  assert.strictEqual(chosen.length, COUNT);
  var stages = chosen.map(function (c, i) {
    var st = E.compile({ id: i + 1, board: c.board });
    var r = E.solve(st);
    assert.strictEqual(r.moves, c.par, 'stage ' + (i + 1) + ': engine par');
    return { id: i + 1, name: NAMES[i], par: c.par, idea: ideaFor(c), hint: hintFor(c, i), board: c.board };
  });
  var chapters = CHAPTERS.map(function (ch, i) {
    return { number: i + 1, name: ch[0], ja: ch[1], from: i * 10 + 1, to: i * 10 + 10,
      note: 'Two penguins on one floe; the ice edge and each other are the only brakes.' };
  });
  var js = "'use strict';\n// Generated by tools/floe-campaign.js from tools/floe-selection.json.\n" +
    "(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TiltStages=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){\n" +
    '  var CHAPTERS = ' + JSON.stringify(chapters, null, 2) + ';\n  var STAGES = ' + JSON.stringify(stages, null, 2) + ';\n' +
    '  return { STAGES:STAGES, CHAPTERS:CHAPTERS };\n});\n';
  fs.writeFileSync(path.join(ROOT, 'src/stages.js'), js);
  var kinds = {};
  chosen.forEach(function (c) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
  console.log(JSON.stringify({
    count: stages.length, kinds: kinds,
    par: [Math.min.apply(null, chosen.map(function (c) { return c.par; })), Math.max.apply(null, chosen.map(function (c) { return c.par; }))],
    explorer: [chosen[0].explorerGeo, chosen[chosen.length - 1].explorerGeo]
  }));
}

if (require.main === module) {
  var poolFile = arg('pool', null);
  build(poolFile ? select(poolFile) : JSON.parse(fs.readFileSync(SELECTION, 'utf8')));
}
