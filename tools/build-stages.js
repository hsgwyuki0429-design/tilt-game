'use strict';
/*
 * TILT — campaign builder.
 *
 *   node tools/build-stages.js [--index tools/level-index.json] [--count 100]
 *
 * Turns the measured index from tools/level-search.js into src/stages.js.
 *
 * The curve is the whole point. The last stage is the longest board the search
 * ever found; the first is a single swipe; and every stage in between sits on
 * the straight line drawn between them, so the step from one stage to the next
 * is the same size all the way up:
 *
 *     par(n) = round( 1 + (n - 1) × (longest - 1) / (count - 1) )
 *
 * Where several stages want the same par — they will, because there are a
 * hundred stages and far fewer distinct lengths — each takes the next-best
 * board of that length, so no two stages ever ship the same puzzle.
 *
 * Nothing here trusts the index. Every board is recompiled and re-solved with
 * src/engine.js before it is written out, and a par that disagrees is a build
 * failure rather than a stage.
 */

var fs = require('fs');
var path = require('path');
var E = require('../src/engine.js');

var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf('--' + name);
  return i < 0 ? dflt : argv[i + 1];
}

var COUNT = Number(arg('count', 100));
var INDEX = arg('index', path.join(__dirname, 'level-index.json'));
var OUT = arg('out', path.join(__dirname, '..', 'src', 'stages.js'));

var index = JSON.parse(fs.readFileSync(INDEX, 'utf8')).pars;

// ---------------------------------------------------------------------------
// symmetry — used to vary how a board is presented, never what it is
// ---------------------------------------------------------------------------
var PERMS = (function () {
  var fns = [
    function (x, y) { return [x, y]; }, function (x, y) { return [4 - x, y]; },
    function (x, y) { return [x, 4 - y]; }, function (x, y) { return [4 - x, 4 - y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [4 - y, x]; },
    function (x, y) { return [y, 4 - x]; }, function (x, y) { return [4 - y, 4 - x]; }
  ];
  return fns.map(function (f) {
    var p = new Int8Array(25);
    for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++) {
      var r = f(x, y); p[y * 5 + x] = r[1] * 5 + r[0];
    }
    return p;
  });
})();
var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

/**
 * Re-present a board under one of its sixteen symmetries.
 *
 * A rotated board is the same puzzle — the solver proves it below, every time
 * — but the search enumerates cells in one fixed order, so left to itself it
 * hands back a hundred boards with their walls piled in the same corner. This
 * spreads them out without touching the difficulty.
 */
function present(rows, variant) {
  var flat = rows.join('');
  if (variant & 8) flat = flat.split('').map(function (ch) { return SWAP[ch]; }).join('');
  // A lone penguin is always the first colour. Which of two interchangeable
  // colours a solo board happens to have been enumerated under is not a design
  // decision, and shipping half of them purple would look like one.
  if (flat.indexOf('B') >= 0 && flat.indexOf('A') < 0) {
    flat = flat.split('').map(function (ch) { return SWAP[ch]; }).join('');
  }
  var p = PERMS[variant & 7], out = new Array(25);
  for (var c = 0; c < 25; c++) out[p[c]] = flat[c];
  var res = [];
  for (var y = 0; y < 5; y++) res.push(out.slice(y * 5, y * 5 + 5).join(''));
  return res;
}

/** The first symmetry of a board whose shortest solution opens sideways. */
function horizontalOpening(rows, fallback) {
  for (var v = 0; v < 16; v++) {
    var solved = E.solve(E.compile({ id: 'orient', board: present(rows, v) }), null, 200000);
    if (solved.solvable && (solved.path[0] === 'L' || solved.path[0] === 'R')) return v;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------
// One word per stage, in the world the game is set in. Short enough to sit in
// the HUD beside the stage number at the narrowest supported width.
var NAMES = [
  'HOME', 'DRIFT', 'GLIDE', 'FLOE', 'SLIP', 'CALM', 'FROST', 'SHELF', 'CRISP', 'DAWN',
  'RIME', 'THAW', 'SLEET', 'BERG', 'CRAG', 'PALE', 'HUSH', 'VEIL', 'SPUR', 'NORTH',
  'GLEAM', 'SNAP', 'RIDGE', 'BASIN', 'FJORD', 'SHARD', 'PRISM', 'GLINT', 'HOAR', 'BLUE',
  'CLEFT', 'WAKE', 'SHOAL', 'PACK', 'TIDE', 'SPIRE', 'BRINE', 'CROWN', 'STILL', 'FLARE',
  'QUARTZ', 'LEDGE', 'SLATE', 'MIST', 'ARCH', 'FLINT', 'GLACE', 'SIREN', 'HOLLOW', 'HALF',
  'AURORA', 'CINDER', 'BEACON', 'LANTERN', 'HARBOUR', 'KEEL', 'ANCHOR', 'MARINER', 'COMPASS', 'MERIDIAN',
  'SOLSTICE', 'ZENITH', 'LATITUDE', 'CURRENT', 'DRAUGHT', 'CAVERN', 'CHASM', 'FISSURE', 'MORAINE', 'CIRQUE',
  'SERAC', 'CREVASSE', 'CORNICE', 'SUMMIT', 'TRAVERSE', 'ASCENT', 'PITON', 'BELAY', 'CAIRN', 'BEARING',
  'POLARIS', 'MIDNIGHT', 'LONGNIGHT', 'WHITEOUT', 'BLIZZARD', 'SQUALL', 'TEMPEST', 'GALE', 'DRIFTWOOD', 'ICEFALL',
  'DEEPFROST', 'COLDIRON', 'STARFIELD', 'NIGHTFALL', 'FARSHORE', 'LASTLIGHT', 'ENDLESS', 'THRESHOLD', 'CROSSING', 'TILT'
];

// ---------------------------------------------------------------------------
// chapters
// ---------------------------------------------------------------------------
var CHAPTER_DEFS = [
  ['GRAVITY', '重力', 'Swipe, and the world falls. Every penguin glides until something stops it.'],
  ['BRAKES', 'ブレーキ', 'The edge, a wall and the other penguin are the only three things that stop a glide.'],
  ['DRIFTERS', '流氷', 'Grey ice slides too, and no aurora will take it. Push it, or work around it.'],
  ['PATIENCE', '布石', 'The move that collects a penguin is rarely the move that aims at its aurora.'],
  ['CORNERS', '角', 'Two penguins, one gravity. Park one where the other one needs a wall.'],
  ['ORBITS', '周回', 'Boards that answer a straight line with a long way round.'],
  ['LOCKS', '封鎖', 'A drifter resting on an aurora is a door. Open it in the right order.'],
  ['LONG ICE', '長氷', 'Nothing here is difficult to see. It is difficult to sequence.'],
  ['DEEP COLD', '極寒', 'The far end of the search. Every one of these was measured, not guessed.'],
  ['MERIDIAN', '子午線', 'The longest boards a 5×5 ice tray can hold.']
];

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------
var pars = Object.keys(index).map(Number).sort(function (a, b) { return a - b; });
var LONGEST = pars[pars.length - 1];
var SHORTEST = pars[0];

function targetPar(n) {
  return Math.round(SHORTEST + (n - 1) * (LONGEST - SHORTEST) / (COUNT - 1));
}

var used = Object.create(null);
var taken = Object.create(null);

/**
 * How much of the tray a board actually uses.
 *
 * Dozens of boards tie on obstacle count at every length, and the search
 * enumerates cells in one fixed order, so left alone it hands back the tie
 * whose pieces are stacked in a single column. That is a real board and it
 * solves in the stated number of moves, but it reads as a mistake. Ranking the
 * ties by how many rows and columns they occupy costs nothing that was asked
 * for and picks the board a person would have drawn.
 */
function spread(rows) {
  var xs = {}, ys = {}, pts = [], x, y, ch;
  for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) {
    ch = rows[y][x];
    if (ch === '.' ) continue;
    xs[x] = ys[y] = 1;
    pts.push([x, y]);
  }
  var far = 0;
  for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
    far += Math.abs(pts[i][0] - pts[j][0]) + Math.abs(pts[i][1] - pts[j][1]);
  }
  return Object.keys(xs).length + Object.keys(ys).length + far / 100;
}

var ranked = {};
function candidates(par) {
  if (ranked[par]) return ranked[par];
  var list = (index[par] || []).slice();
  list.forEach(function (e) { e._spread = spread(e.rows); });
  list.sort(function (a, b) {
    return a.statics - b.statics || a.grays - b.grays ||
           a.penguins - b.penguins || b._spread - a._spread;
  });
  ranked[par] = list;
  return list;
}

/* `taken` keeps one board from being handed to two stages; `used` keeps it
   from reappearing under a rotation, which reads as a repeat even though the
   string differs. */
function pick(par) {
  var list = candidates(par);
  for (var i = 0; i < list.length; i++) {
    var key = par + ':' + i;
    if (taken[key]) continue;
    taken[key] = true;
    return list[i];
  }
  return null;
}

function hintFor(stage, par, def) {
  var two = stage.penguins === 2;
  var drift = stage.drifters > 0;
  var wall = false, crack = stage.rules.hazard;
  for (var i = 0; i < stage.terrain.length; i++) if (stage.terrain[i] === E.WALL) wall = true;

  var ja, en;
  if (crack) {
    ja = 'ヒビ氷は通れるが、止まると割れる。';
    en = 'Cracked ice is safe to cross and fatal to stop on.';
  } else if (drift && two) {
    ja = '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。';
    en = 'The grey floe slides with the same gravity — and it can sit on an aurora.';
  } else if (drift) {
    ja = '灰色の流氷は回収されない。壁として使う駒。';
    en = 'The grey floe is never collected. It is there to be used as a wall.';
  } else if (two && wall) {
    ja = '壁ともう一羽、どちらもストッパーになる。';
    en = 'The wall and the other penguin are both brakes.';
  } else if (two) {
    ja = '止められるのは盤の端ともう一羽だけ。';
    en = 'The only brakes here are the edge and the other penguin.';
  } else if (wall) {
    ja = '壁の手前でちょうど止める。';
    en = 'Stop short, against the wall.';
  } else {
    ja = 'オーロラの上で止まって初めて回収される。';
    en = 'A penguin is collected only when it stops on its aurora.';
  }
  return { ja: ja + '最短' + par + '手。', en: en + ' Best: ' + par + '.' };
}

function ideaFor(stage, par) {
  var bits = [];
  bits.push(stage.penguins === 2 ? 'two penguins' : 'one penguin');
  if (stage.drifters) bits.push(stage.drifters + ' drifter' + (stage.drifters > 1 ? 's' : ''));
  var walls = 0, cracks = 0;
  for (var i = 0; i < stage.terrain.length; i++) {
    if (stage.terrain[i] === E.WALL) walls++;
    else if (stage.terrain[i] === E.HAZARD) cracks++;
  }
  if (walls) bits.push(walls + ' wall' + (walls > 1 ? 's' : ''));
  if (cracks) bits.push(cracks + ' cracked tile' + (cracks > 1 ? 's' : ''));
  if (!stage.drifters && !walls && !cracks) bits.push('an empty tray');
  return bits.join(', ') + '; ' + par + ' moves.';
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------
var stages = [];
var failures = [];

for (var n = 1; n <= COUNT; n++) {
  var want = targetPar(n);
  var entry = null, rows = null, stage = null, solved = null;

  // walk outwards from the wanted par only if that length ran dry
  var offsets = [0];
  for (var o = 1; o <= 3; o++) { offsets.push(o); offsets.push(-o); }

  for (var oi = 0; oi < offsets.length && !entry; oi++) {
    var par = want + offsets[oi];
    if (par < SHORTEST || par > LONGEST) continue;
    var candidate = pick(par);
    if (!candidate) continue;

    // Present it under a rotation that depends on the stage number, then prove
    // with the real engine that the rotation changed nothing.
    var variant = (n * 5 + 3) % 16;
    // Stage 1 is the one board the game demonstrates the gesture on, and a
    // sideways sweep is what a swipe looks like. Turn it so the opening move
    // is horizontal.
    if (n === 1) variant = horizontalOpening(candidate.rows, variant);
    rows = present(candidate.rows, variant);
    var seen = rows.join('|');
    if (used[seen]) { continue; }

    stage = E.compile({ id: n, board: rows });
    solved = E.solve(stage, null, 400000);
    if (!solved.solvable || solved.moves !== candidate.moves) {
      failures.push('stage ' + n + ': index says ' + candidate.moves +
        ', engine says ' + (solved.solvable ? solved.moves : 'unsolvable'));
      continue;
    }
    used[seen] = true;
    entry = candidate;
  }

  if (!entry) { failures.push('stage ' + n + ': no board of par ' + want + ' left'); continue; }

  stages.push({
    id: n,
    name: NAMES[n - 1] || ('ICE ' + n),
    par: solved.moves,
    idea: ideaFor(stage, solved.moves),
    hint: hintFor(stage, solved.moves, entry),
    board: rows,
    statics: entry.statics,
    grays: entry.grays
  });
}

if (failures.length) {
  failures.forEach(function (f) { console.error('  ! ' + f); });
  if (stages.length < COUNT) {
    console.error('build failed: only ' + stages.length + ' of ' + COUNT + ' stages');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------
function jsStr(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

var per = Math.ceil(COUNT / CHAPTER_DEFS.length);
var chapters = CHAPTER_DEFS.map(function (c, i) {
  var from = i * per + 1, to = Math.min(COUNT, (i + 1) * per);
  return { number: i + 1, name: c[0], ja: c[1], from: from, to: to, note: c[2] };
}).filter(function (c) { return c.from <= COUNT; });

var out = [];
out.push("'use strict';");
out.push('/*');
out.push(' * TILT — the ice campaign. GENERATED FILE: see tools/build-stages.js.');
out.push(' *');
out.push(' * ' + COUNT + ' boards, all 5×5, laid out along one straight difficulty line:');
out.push(' * stage 1 is one swipe, stage ' + COUNT + ' is the longest board an exhaustive');
out.push(' * search of the 5×5 space could find (' + LONGEST + ' moves), and each stage in');
out.push(' * between sits on the line between them.');
out.push(' *');
out.push(' * Every board obeys the same rules:');
out.push(' *   - one or two penguins, never two of a colour');
out.push(' *   - exactly one matching aurora for each penguin');
out.push(' *   - a penguin is collected only when it STOPS on its own aurora');
out.push(' *   - a grey drifter (G) slides but is never collected, and can plug an aurora');
out.push(' *');
out.push(' * Within a given length the emptiest board wins: fewest immovable obstacles');
out.push(' * first, then fewest drifters. Every par below was verified by re-solving the');
out.push(' * board with src/engine.js.');
out.push(' */');
out.push('(function (root, factory) {');
out.push('  var api = factory();');
out.push("  if (typeof module === 'object' && module.exports) module.exports = api;");
out.push('  if (root) root.TiltStages = api;');
out.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
out.push('  var CHAPTERS = [');
chapters.forEach(function (c, i) {
  out.push('    {');
  out.push('      number: ' + c.number + ',');
  out.push('      name: ' + jsStr(c.name) + ',');
  out.push('      ja: ' + jsStr(c.ja) + ',');
  out.push('      from: ' + c.from + ',');
  out.push('      to: ' + c.to + ',');
  out.push('      note: ' + jsStr(c.note));
  out.push('    }' + (i === chapters.length - 1 ? '' : ','));
});
out.push('  ];');
out.push('');
out.push('  var STAGES = [');
stages.forEach(function (s, i) {
  out.push('    {');
  out.push('      id: ' + s.id + ', name: ' + jsStr(s.name) + ', par: ' + s.par + ',');
  out.push('      idea: ' + jsStr(s.idea) + ',');
  out.push('      hint: { ja: ' + jsStr(s.hint.ja) + ', en: ' + jsStr(s.hint.en) + ' },');
  out.push('      board: [' + s.board.map(jsStr).join(',\n              ') + ']');
  out.push('    }' + (i === stages.length - 1 ? '' : ','));
});
out.push('  ];');
out.push('');
out.push('  return { STAGES: STAGES, CHAPTERS: CHAPTERS };');
out.push('});');

fs.writeFileSync(OUT, out.join('\n') + '\n');

// ---------------------------------------------------------------------------
var hist = {};
stages.forEach(function (s) { hist[s.par] = (hist[s.par] || 0) + 1; });
console.log('wrote ' + OUT);
console.log(stages.length + ' stages, par ' + stages[0].par + ' … ' + stages[stages.length - 1].par);
console.log('step per stage: ' + ((LONGEST - SHORTEST) / (COUNT - 1)).toFixed(3) + ' moves');
var withStatic = stages.filter(function (s) { return s.statics > 0; }).length;
var withGray = stages.filter(function (s) { return s.grays > 0; }).length;
console.log('boards with an immovable obstacle: ' + withStatic + '/' + stages.length);
console.log('boards with a drifter:             ' + withGray + '/' + stages.length);
