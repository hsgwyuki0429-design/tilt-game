'use strict';
/*
 * TILT — board forge.
 *
 * Hand-placing walls until a board "feels" right produces exactly the decorative
 * geometry the design brief forbids. So instead: generate boards to a budget,
 * then keep only the ones where deleting ANY single wall, pit, goal or piece
 * provably damages the puzzle. Everything that survives is dense by construction.
 *
 *   node tools/forge.js --w 3 --h 3 --walls 2 --pieces 2 --goals 1 \
 *                       --par 4:5 --tries 40000 --top 6
 *
 * Options:
 *   --w --h            board size
 *   --walls --pits --goals --pieces   element budget ("2" or "1:3" for a range)
 *   --colors N         number of distinct piece colours (goals get colours too)
 *   --big N            number of 2-cell pieces among --pieces
 *   --par a:b          required shortest-solution length
 *   --ways a:b         required number of distinct shortest solutions
 *   --luck f           maximum fraction of random par-length sequences that win
 *   --danger           require at least one tilt somewhere that loses a piece
 *   --strict           reject boards with ANY inert element (default on)
 *   --tries N --top N --seed N
 */

var E = require('../src/engine.js');

// -- args -------------------------------------------------------------------
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

var W = Number(opt('w', 3)), H = Number(opt('h', 3));
var NWALL = range(opt('walls'), [0, 0]);
var NPIT = range(opt('pits'), [0, 0]);
var NGOAL = range(opt('goals'), [1, 1]);
var NPIECE = range(opt('pieces'), [1, 1]);
var NCOLOR = Number(opt('colors', 1));
var NBIG = Number(opt('big', 0));
var PAR = range(opt('par'), [1, 99]);
var WAYS = range(opt('ways'), [1, 999]);
var LUCK = Number(opt('luck', 1));
var DANGER = !!opt('danger', false);
var CHAIN = Number(opt('chain', 0));
var CHAIN_LAST = Number(opt('chain-last', 0));
var LOOSE = !!opt('loose', false);
var TRIES = Number(opt('tries', 20000));
var TOP = Number(opt('top', 5));
var SEED = Number(opt('seed', 12345));

// Deterministic RNG so a good run can be reproduced exactly.
var seed = SEED >>> 0;
function rnd() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
function ri(n) { return Math.floor(rnd() * n); }
function pick(arr) { return arr[ri(arr.length)]; }
function inRange(v, r) { return v >= r[0] && v <= r[1]; }

// -- generation -------------------------------------------------------------

var LETTERS = 'ABCDEFGH';

function generate() {
  var terrain = [], pieces = [];
  for (var y = 0; y < H; y++) { terrain.push('.'.repeat(W)); pieces.push('.'.repeat(W)); }
  var free = [];
  for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) free.push([xx, yy]);
  shuffle(free);

  var set = function (layer, x, y, ch) { layer[y] = layer[y].slice(0, x) + ch + layer[y].slice(x + 1); };
  var take = function () { return free.pop(); };

  var nWall = NWALL[0] + ri(NWALL[1] - NWALL[0] + 1);
  var nPit = NPIT[0] + ri(NPIT[1] - NPIT[0] + 1);
  var nGoal = NGOAL[0] + ri(NGOAL[1] - NGOAL[0] + 1);
  var nPiece = NPIECE[0] + ri(NPIECE[1] - NPIECE[0] + 1);
  if (nWall + nPit + nGoal + nPiece + NBIG > W * H) return null;

  var i, c;
  for (i = 0; i < nWall; i++) { c = take(); if (!c) return null; set(terrain, c[0], c[1], '#'); }
  for (i = 0; i < nPit; i++) { c = take(); if (!c) return null; set(terrain, c[0], c[1], '*'); }

  var colors = {};
  var goalColors = [];
  for (i = 0; i < nGoal; i++) {
    c = take(); if (!c) return null;
    var gc = NCOLOR > 1 ? ri(NCOLOR) : -1;
    goalColors.push(gc);
    set(terrain, c[0], c[1], gc < 0 ? 'o' : String(gc));
  }

  // Multi-cell pieces need an adjacent free pair.
  var used = {};
  free.forEach(function (f) { used[f[0] + ',' + f[1]] = true; });
  var placed = 0;
  for (i = 0; i < NBIG; i++) {
    var pairs = [];
    free.forEach(function (f) {
      [[1, 0], [0, 1]].forEach(function (d) {
        var k = (f[0] + d[0]) + ',' + (f[1] + d[1]);
        if (used[k]) pairs.push([f, [f[0] + d[0], f[1] + d[1]]]);
      });
    });
    if (!pairs.length) return null;
    var pr = pick(pairs);
    var L = LETTERS[placed++];
    pr.forEach(function (cc) {
      set(pieces, cc[0], cc[1], L);
      delete used[cc[0] + ',' + cc[1]];
      free = free.filter(function (f) { return !(f[0] === cc[0] && f[1] === cc[1]); });
    });
    colors[L] = NCOLOR > 1 ? ri(NCOLOR) : 0;
  }
  for (i = 0; i < nPiece - NBIG; i++) {
    c = take(); if (!c) return null;
    var L2 = LETTERS[placed++];
    set(pieces, c[0], c[1], L2);
    colors[L2] = NCOLOR > 1 ? ri(NCOLOR) : 0;
  }
  if (placed === 0) return null;

  return { id: 0, name: 'forged', terrain: terrain, pieces: pieces, colors: colors };
}

function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
}

// -- evaluation -------------------------------------------------------------

function countShortest(stage, opt_, cap) {
  var count = 0;
  (function walk(s, depth) {
    if (count > cap || depth === opt_) return;
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      if (!ns || E.isLost(ns)) continue;
      if (E.isClear(ns)) { if (depth + 1 === opt_) count++; continue; }
      walk(ns, depth + 1);
    }
  })(E.initialState(stage), 0);
  return count;
}

function solveRate(stage, o) {
  if (o < 1 || Math.pow(4, o) > 300000) return 0;
  var wins = 0;
  (function walk(s, depth) {
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      if (!ns || E.isLost(ns)) continue;
      var rest = Math.pow(4, o - depth - 1);
      if (E.isClear(ns)) { wins += rest; continue; }
      if (depth + 1 < o) walk(ns, depth + 1);
    }
  })(E.initialState(stage), 0);
  return wins / Math.pow(4, o);
}

function cloneDef(d) {
  return { id: d.id, name: d.name, terrain: d.terrain.slice(), pieces: d.pieces.slice(), colors: JSON.parse(JSON.stringify(d.colors || {})) };
}
function setCh(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }

/** Returns null if every element matters, otherwise the first inert element found. */
function findInert(def, stage, o, ways) {
  var probe = function (v, label) {
    var st;
    try { st = E.compile(v); } catch (e) { return null; }
    var sol = E.solve(st, E.initialState(st), 60000);
    if (!sol.solvable || sol.moves !== o) return null;
    if (countShortest(st, sol.moves, 500) !== ways) return null;
    return label;
  };
  var y, x, hit;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var ch = def.terrain[y][x];
    if (ch === '.') continue;
    var v = cloneDef(def);
    v.terrain[y] = setCh(v.terrain[y], x, '.');
    hit = probe(v, (ch === '#' ? 'wall' : ch === '*' ? 'pit' : 'goal') + '@' + x + ',' + y);
    if (hit) return hit;
  }
  for (var pi = 0; pi < stage.pieces.length; pi++) {
    var L = stage.pieces[pi].letter;
    var v2 = cloneDef(def);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (v2.pieces[y][x] === L) v2.pieces[y] = setCh(v2.pieces[y], x, '.');
    hit = probe(v2, 'piece ' + L);
    if (hit) return hit;
  }
  return null;
}

function danger(stage) {
  var states = E.reachable(stage, null, 4000), kills = 0, dead = 0;
  for (var i = 0; i < states.length; i++) {
    if (E.isClear(states[i])) continue;
    for (var d = 0; d < 4; d++) {
      var r = E.simulate(stage, states[i], E.DIRS[d], { frames: false });
      if (r.moved && r.state.lost > 0) kills++;
    }
  }
  return { kills: kills, states: states.length };
}

function evaluate(def) {
  var stage;
  try { stage = E.compile(def); } catch (e) { return null; }
  var start = E.initialState(stage);
  if (E.isClear(start)) return null;

  var sol = E.solve(stage, start, 40000);
  if (!sol.solvable) return null;
  var o = sol.moves;
  if (!inRange(o, PAR)) return null;

  var ways = countShortest(stage, o, 500);
  if (!inRange(ways, WAYS)) return null;

  var luck = solveRate(stage, o);
  if (luck > LUCK) return null;

  var dg = danger(stage);
  if (DANGER && dg.kills === 0) return null;

  // Biggest cascade along the optimal line: how many pieces a single tilt
  // sends home. This is the moment the whole game is selling.
  var chain = 0, chainLast = 0, cs = start;
  for (var ci = 0; ci < sol.path.length; ci++) {
    var cr = E.simulate(stage, cs, sol.path[ci]);
    var got = cr.events.filter(function (e) { return e.type === 'goal'; }).length;
    if (got > chain) chain = got;
    if (ci === sol.path.length - 1) chainLast = got;
    cs = cr.state;
  }
  if (chain < CHAIN) return null;
  // A cascade is a finale, not a mid-game event: --chain-last demands that the
  // last tilt of the shortest solution is the one that empties the board.
  if (chainLast < CHAIN_LAST) return null;

  var inert = LOOSE ? null : findInert(def, stage, o, ways);
  if (inert) return null;

  // Prefer: longer solutions, fewer lucky wins, a healthy state space, few
  // alternative optimal lines (a single clean idea beats a fuzzy one).
  var score = o * 10 - luck * 400 - ways * 2 + Math.min(dg.states, 60) * 0.15 + (dg.kills ? 3 : 0);
  return { def: def, stage: stage, par: o, ways: ways, luck: luck, states: dg.states, kills: dg.kills, chain: chain, chainLast: chainLast, path: sol.path, score: score };
}

// -- run --------------------------------------------------------------------

/**
 * Two boards that are the same board rotated are the same puzzle — the player
 * would meet the identical idea twice. Fold each candidate into a canonical
 * form over the 8 square symmetries (piece letters relabelled in scan order)
 * so the shortlist is genuinely distinct designs.
 */
function transform(rows, k) {
  var h = rows.length, w = rows[0].length, out = [], y, x, line;
  for (y = 0; y < (k & 1 ? w : h); y++) {
    line = '';
    for (x = 0; x < (k & 1 ? h : w); x++) {
      var sx, sy;
      switch (k) {
        case 0: sx = x; sy = y; break;                    // identity
        case 1: sx = y; sy = h - 1 - x; break;            // rot 90
        case 2: sx = w - 1 - x; sy = h - 1 - y; break;    // rot 180
        case 3: sx = w - 1 - y; sy = x; break;            // rot 270
        case 4: sx = w - 1 - x; sy = y; break;            // mirror
        case 5: sx = y; sy = x; break;                    // transpose
        case 6: sx = x; sy = h - 1 - y; break;            // flip
        default: sx = w - 1 - y; sy = h - 1 - x; break;   // anti-transpose
      }
      line += rows[sy][sx];
    }
    out.push(line);
  }
  return out;
}

function canonical(def) {
  var best = null;
  for (var k = 0; k < 8; k++) {
    var terr = transform(def.terrain, k);
    var pcs = transform(def.pieces, k);
    // Relabel pieces in scan order so letter choice cannot make two identical
    // boards look different.
    var map = Object.create(null), next = 0, relabelled = [];
    for (var y = 0; y < pcs.length; y++) {
      var line = '';
      for (var x = 0; x < pcs[y].length; x++) {
        var ch = pcs[y][x];
        if (ch === '.') { line += '.'; continue; }
        if (map[ch] == null) map[ch] = LETTERS[next++];
        line += map[ch];
      }
      relabelled.push(line);
    }
    // Keyed by the NEW label, not the old one, or two identical boards whose
    // letters happen to be swapped would look different.
    var colorSig = Object.keys(map).map(function (src) {
      return map[src] + ':' + ((def.colors && def.colors[src]) || 0);
    }).sort().join(',');
    var key = terr.join('/') + '|' + relabelled.join('/') + '|' + colorSig;
    if (best === null || key < best) best = key;
  }
  return best;
}

var results = [];
var seenKeys = Object.create(null);
for (var t = 0; t < TRIES; t++) {
  var d = generate();
  if (!d) continue;
  var key = canonical(d);
  if (seenKeys[key]) continue;
  seenKeys[key] = 1;
  var r = evaluate(d);
  if (r) results.push(r);
}

results.sort(function (a, b) { return b.score - a.score; });

var D = function (s) { return '[2m' + s + '[0m'; };
console.log(D('forge: ' + results.length + ' boards passed every filter out of ' + TRIES + ' tries'));
console.log('');

results.slice(0, TOP).forEach(function (r, i) {
  console.log('[1m#' + (i + 1) + '[0m  par ' + r.par + '  ways ' + r.ways +
    '  luck ' + (r.luck * 100).toFixed(2) + '%  states ' + r.states +
    (r.kills ? '  fatal ' + r.kills : '') + (r.chain > 1 ? '  chain x' + r.chain : '') + (r.chainLast > 1 ? '  finale x' + r.chainLast : '') + D('  score ' + r.score.toFixed(1)));
  console.log('      terrain: [' + r.def.terrain.map(function (s) { return "'" + s + "'"; }).join(',\n                ') + '],');
  console.log('      pieces:  [' + r.def.pieces.map(function (s) { return "'" + s + "'"; }).join(',\n                ') + '],');
  if (NCOLOR > 1) console.log('      colors:  ' + JSON.stringify(r.def.colors) + ',');
  console.log(D('      solution: ' + r.path.join(' ')));
  console.log('');
});
