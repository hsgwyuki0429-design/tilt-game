'use strict';
/*
 * TILT — board forge (interactive search).
 *
 * Hand-placing walls until a board "feels" right produces exactly the
 * decorative geometry the design rules forbid. So instead: generate boards to a
 * budget, then keep only the ones where deleting ANY single wall, pit, goal or
 * block provably damages the puzzle.
 *
 * This is the exploratory front-end to tools/lib/boards.js. The actual campaign
 * is built by tools/campaign.js, which uses the same machinery with a fixed
 * seed; use this to find a one-off board or to sanity-check a spec before
 * committing it to a chapter.
 *
 *   node tools/forge.js --w 3 --h 3 --walls 2 --pieces 2 --goals 1 \
 *                       --par 4:5 --tries 40000 --top 6
 *
 * Options:
 *   --w --h              board size
 *   --walls --pits --goals --pieces --big   element budget ("2" or "1:3" range)
 *   --colors N           number of distinct block colours
 *   --par a:b            required shortest-solution length
 *   --ways a:b           required number of distinct shortest solutions
 *   --luck f             max share of random par-length sequences that win
 *   --danger             require at least one tilt somewhere that costs a block
 *   --chain N            require a tilt that collects N blocks at once
 *   --chain-last N       require the FINAL tilt to collect N at once
 *   --loose              skip the load-bearing test (for exploring only)
 *   --tries N --top N --seed N
 */

var B = require('./lib/boards.js');

var argv = process.argv.slice(2);
function opt(name, dflt) {
  var i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v == null || v.slice(0, 2) === '--') ? true : v;
}
function range(v, dflt) {
  if (v == null) return dflt;
  var s = String(v).split(':');
  return s.length > 1 ? [Number(s[0]), Number(s[1])] : [Number(s[0]), Number(s[0])];
}

var spec = {
  w: Number(opt('w', 3)),
  h: Number(opt('h', 3)),
  walls: range(opt('walls'), [0, 0]),
  pits: range(opt('pits'), [0, 0]),
  goals: range(opt('goals'), [1, 1]),
  pieces: range(opt('pieces'), [1, 1]),
  big: range(opt('big'), [0, 0]),
  colors: Number(opt('colors', 1))
};

var filters = {
  par: range(opt('par'), [1, 99]),
  ways: range(opt('ways'), [1, 999]),
  luck: Number(opt('luck', 1)),
  danger: !!opt('danger', false),
  chain: Number(opt('chain', 0)),
  chainLast: Number(opt('chain-last', 0)),
  loose: !!opt('loose', false),
  exactDanger: true,
  nodeCap: 250000
};

var TRIES = Number(opt('tries', 20000));
var TOP = Number(opt('top', 5));
var rng = new B.Rng(Number(opt('seed', 12345)));

var D = function (s) { return '[2m' + s + '[0m'; };

var results = [];
var seen = {};
var t0 = Date.now();

for (var t = 0; t < TRIES; t++) {
  var def = B.generate(spec, rng);
  if (!def) continue;
  // Two boards that differ only by rotation are the same puzzle.
  var key = B.canonical(def);
  if (seen[key]) continue;
  seen[key] = 1;
  var r = B.evaluate(def, filters, rng);
  if (r) results.push(r);
}

results.sort(function (a, b) { return b.score - a.score; });

console.log(D('forge: ' + results.length + ' boards passed every filter out of ' + TRIES +
  ' tries in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'));
console.log('');

results.slice(0, TOP).forEach(function (r, i) {
  console.log('[1m#' + (i + 1) + '[0m  par ' + r.par + '  ways ' + r.ways +
    '  luck ' + (r.luck * 100).toFixed(2) + '%  states ' + r.states +
    (r.kills ? '  fatal ' + r.kills : '') +
    (r.chain > 1 ? '  chain ×' + r.chain : '') +
    (r.chainLast > 1 ? '  finale ×' + r.chainLast : '') +
    D('  score ' + r.score.toFixed(1)));
  console.log('      terrain: [' + r.def.terrain.map(q).join(',\n                ') + '],');
  console.log('      pieces:  [' + r.def.pieces.map(q).join(',\n                ') + '],');
  if (spec.colors > 1) console.log('      colors:  ' + JSON.stringify(r.def.colors) + ',');
  console.log(D('      solution: ' + r.path.join(' ')));
  console.log('');
});

function q(s) { return "'" + s + "'"; }
