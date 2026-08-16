'use strict';
/*
 * TILT — board forge.
 *
 * The exploratory front-end to the same machinery tools/campaign.js uses. Use
 * it to answer "what is even IN this corner of the design space?" before
 * committing a slot to it.
 *
 *   node tools/forge.js --w 3 --h 3 --blocks 3 --walls 1:2 --top 8
 *   node tools/forge.js --w 3 --h 3 --blocks 3 --hazards 1 --unlock 1:2
 *   node tools/forge.js --w 4 --h 3 --colours AAB --walls 1:2 --blind 3
 *   node tools/forge.js --w 4 --h 3 --colours AABBCC --win select --goals ab
 *   node tools/forge.js --w 4 --h 3 --colours AABB --win match --par 6:30
 *   node tools/forge.js --w 4 --h 3 --colours AABBC --win form --goals aabb
 *
 * At 3×3 and 4×3 this is not a sample. It enumerates every arrangement of the
 * budget you give it, up to rotation, reflection and which colour is called A,
 * and measures all of them. When it says a board is the best one available,
 * that is a statement about the design space rather than about the search.
 *
 * What it ranks by is deliberately NOT length. See tools/lib/design.js for the
 * argument, and `--sort` below to override it:
 *
 *   shape    (default) how much like an idea the board is: one or two moves of
 *            insight, a long tail that plays itself, the right move being the
 *            last one instinct would suggest
 *   par      longest shortest-solution. Kept only because it is occasionally
 *            useful to see what optimising for length actually produces — it
 *            produces corridors, which is the whole reason for the rest of this
 *   states   most positions to think about
 *   density  most thinking per cell
 */

var D = require('./lib/design.js');
var G = require('./lib/generate.js');

var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v == null || v.slice(0, 2) === '--') ? true : v;
}
function range(v, dflt) {
  if (v == null) return dflt;
  var p = String(v).split(':').map(Number);
  return p.length === 1 ? [p[0], p[0]] : [p[0], p[1]];
}
function num(v, dflt) { return v == null ? dflt : Number(v); }

var W = num(arg('w'), 3), H = num(arg('h'), 3);
var WALLS = range(arg('walls'), [1, 2]);
var HAZ = range(arg('hazards'), [0, 0]);
var COLOURS = arg('colours', null);          // e.g. "AAB"
var NBLOCKS = num(arg('blocks'), 3);
var PAR = range(arg('par'), [3, 20]);
var UNLOCK = range(arg('unlock'), [1, 3]);
var MINFLOW = num(arg('flow'), 1);
var MINBLIND = num(arg('blind'), 0);
var MINTRAPS = num(arg('traps'), 0);
var TOP = num(arg('top'), 8);
var SORT = arg('sort', 'shape');
var LOOSE = argv.indexOf('--loose') >= 0;    // skip the deletion test
var WIN = arg('win', 'allin');
var GOALS = arg('goals', null);              // e.g. "ab" or "aabb"; MATCH takes none

var blocks = COLOURS ? String(COLOURS).split('') : new Array(NBLOCKS).fill('@');

// What the marked cells should be. A MATCH board has none at all; otherwise the
// default is one socket per colour present, or a single 'o' on a plain board.
var goals;
if (GOALS != null && GOALS !== true) goals = String(GOALS).split('');
else if (WIN === 'match') goals = [];
else if (COLOURS && /[ABC]/.test(COLOURS)) {
  goals = [];
  ['A', 'B', 'C'].forEach(function (c) {
    if (COLOURS.indexOf(c) >= 0) goals.push(c.toLowerCase());
  });
} else goals = ['o'];

var spec = { w: W, h: H, blocks: blocks, walls: WALLS, hazards: HAZ, goals: goals, win: WIN };

var ESC = '';
var dim = function (s) { return ESC + '[2m' + s + ESC + '[0m'; };
var bold = function (s) { return ESC + '[1m' + s + ESC + '[0m'; };
var yel = function (s) { return ESC + '[33m' + s + ESC + '[0m'; };

console.log('\n  forging ' + W + '×' + H + '  blocks ' + blocks.join('') +
  '  walls ' + WALLS.join('–') + '  hazards ' + HAZ.join('–') +
  '  goals ' + (goals.join('') || '—') + '  win ' + WIN + '\n');

var t0 = Date.now();
var raw = [], seen = Object.create(null);
var stats = G.exhaust(spec, {
  par: PAR, unlock: UNLOCK, allowNaive: false, nodeCap: 80000, maxPlacements: 6000
}, function (c) {
  var k = D.canonical(c.board);
  if (seen[k]) return;
  seen[k] = 1;
  raw.push(c);
});

console.log(dim('  ' + stats.terrains + ' terrains → ' + raw.length +
  ' distinct boards with an idea in them'));

var kept = [];
raw.forEach(function (c) {
  var p = D.profile(c.board, { quick: true, cap: 200000, win: WIN, cruxBudget: PAR[1] > 20 ? 60 : 4000 });
  if (!p) return;
  if (p.flow < MINFLOW || p.blindness < MINBLIND || p.traps < MINTRAPS) return;
  if (p.luck > 0.03) return;
  kept.push(p);
});

var SORTS = {
  shape: function (p) { return G.shapeScore(p); },
  par: function (p) { return p.par; },
  states: function (p) { return p.states; },
  density: function (p) { return p.score.density; }
};
var rank = SORTS[SORT] || SORTS.shape;
kept.sort(function (a, b) { return rank(b) - rank(a); });

console.log(dim('  ' + kept.length + ' pass the filters, ranked by ' + SORT + '\n'));

var shown = 0;
for (var i = 0; i < kept.length && shown < TOP; i++) {
  var p = kept[i];
  if (!LOOSE) {
    var full = D.profile(p.board, { cap: 200000, win: WIN, cruxBudget: PAR[1] > 20 ? 60 : 4000 });
    if (!full || full.inert) continue;         // carrying a piece it would not miss
    p = full;
  }
  shown++;
  console.log('  ' + bold('#' + shown) + '  ' + D.summarise(p));
  console.log('       ' + dim('scores  ') + Object.keys(p.score).map(function (k) {
    return k.slice(0, 3) + ' ' + p.score[k];
  }).join(dim(' · ')));
  p.board.forEach(function (row, y) {
    console.log('       ' + (y === 0 ? dim('board: ') : '       ') + "'" + row + "'");
  });
  console.log('       ' + dim('solution: ') + p.path.join(' ') +
    (p.chainLast > 1 ? '   ' + yel('finale ×' + p.chainLast) : ''));
  console.log('');
}

if (!shown) console.log('  nothing in this budget survives the filters.\n');
console.log(dim('  searched in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's\n'));
