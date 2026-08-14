'use strict';
/*
 * TILT — board forge (interactive search).
 *
 * Hand-placing walls until a board "feels" right produces exactly the
 * decorative geometry the design rules forbid. So instead: fix an element
 * budget, hill-climb boards towards a longer solution, and keep only the ones
 * where deleting ANY single wall, block or goal provably damages the puzzle.
 *
 * There are three things to place and there will never be a fourth, so every
 * knob below is about WHERE they go and how long the answer has to be.
 *
 * This is the exploratory front-end to tools/lib/boards.js. The actual campaign
 * is built by tools/campaign.js, which uses the same machinery with a fixed
 * seed; use this to find a one-off board or to sanity-check a spec before
 * committing it to a chapter.
 *
 *   node tools/forge.js --w 4 --h 4 --walls 3:5 --blocks 3 --goals 1 \
 *                       --par 12:16 --tries 400 --top 6
 *
 * Options:
 *   --w --h                   board size
 *   --walls --blocks --goals  element budget ("2" or "1:3" range)
 *   --par a:b                 required shortest-solution length
 *   --ways a:b                required number of distinct shortest solutions
 *   --luck f                  max share of random par-length sequences that win
 *   --chain N                 require a tilt that collects N blocks at once
 *   --chain-last N            require the FINAL tilt to collect N at once
 *   --opening N               require N set-up tilts before anything is collected
 *   --loose                   skip the load-bearing test (for exploring only)
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
  w: Number(opt('w', 4)),
  h: Number(opt('h', 4)),
  walls: range(opt('walls'), [2, 4]),
  blocks: range(opt('blocks'), [2, 3]),
  goals: range(opt('goals'), [1, 1])
};

var filters = {
  par: range(opt('par'), [1, 99]),
  ways: range(opt('ways'), [1, 999]),
  luck: Number(opt('luck', 1)),
  chain: Number(opt('chain', 0)),
  chainLast: Number(opt('chain-last', 0)),
  opening: Number(opt('opening', 0)),
  loose: !!opt('loose', false),
  nodeCap: 250000
};

var TRIES = Number(opt('tries', 400));
var TOP = Number(opt('top', 5));
var rng = new B.Rng(Number(opt('seed', 12345)));

var D = function (s) { return '[2m' + s + '[0m'; };

var results = [];
var seen = {};
var t0 = Date.now();

for (var t = 0; t < TRIES; t++) {
  var rows = B.climb(spec, rng, filters.par, 500, filters.nodeCap);
  if (!rows) continue;
  // Two boards that differ only by rotation are the same puzzle.
  var key = B.canonical(rows);
  if (seen[key]) continue;
  seen[key] = 1;
  var r = B.evaluate(rows, filters, rng);
  if (r) results.push(r);
}

results.sort(function (a, b) { return b.score - a.score; });

console.log(D('forge: ' + results.length + ' boards passed every filter out of ' + TRIES +
  ' climbs in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'));
console.log('');

results.slice(0, TOP).forEach(function (r, i) {
  console.log('[1m#' + (i + 1) + '[0m  par ' + r.par + '  ways ' + r.ways +
    '  luck ' + (r.luck * 100).toFixed(2) + '%  states ' + r.states +
    '  pieces ' + r.elements +
    (r.opening ? '  set-up ' + r.opening : '') +
    (r.chain > 1 ? '  chain ×' + r.chain : '') +
    (r.chainLast > 1 ? '  finale ×' + r.chainLast : '') +
    D('  score ' + r.score.toFixed(1)));
  console.log('      board: [' + r.board.map(q).join(',\n              ') + ']');
  console.log(D('      solution: ' + r.path.join(' ')));
  console.log('');
});

function q(s) { return "'" + s + "'"; }
