'use strict';
/*
 * TILT — board generation and measurement.
 *
 * Shared by tools/forge.js (interactive search) and tools/campaign.js (builds
 * the whole 100-stage campaign). Nothing here knows about the campaign layout;
 * it only knows how to make a board to a budget and how to tell whether that
 * board is any good.
 *
 * The quality bar, in the order it is applied (cheapest test first):
 *
 *   compiles → not already solved → shortest solution inside the target band
 *   → few enough distinct optimal lines → low enough luck → required chain /
 *   danger properties → and finally: every single element is load-bearing.
 *
 * That last test is the expensive one and the one that matters. A board passes
 * only if deleting ANY wall, pit, goal or block measurably changes the puzzle.
 */

var E = require('../../src/engine.js');

var LETTERS = 'ABCDEFGH';

// ---------------------------------------------------------------------------
// deterministic RNG — a campaign must rebuild byte-identically from its seed
// ---------------------------------------------------------------------------

function Rng(seed) {
  this.s = (seed >>> 0) || 1;
}
Rng.prototype.next = function () {
  this.s ^= this.s << 13; this.s >>>= 0;
  this.s ^= this.s >>> 17;
  this.s ^= this.s << 5; this.s >>>= 0;
  return this.s / 4294967296;
};
Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
Rng.prototype.pick = function (a) { return a[this.int(a.length)]; };
Rng.prototype.range = function (r) { return r[0] + this.int(r[1] - r[0] + 1); };
Rng.prototype.shuffle = function (a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = this.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
};

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

function setCh(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }

/**
 * spec: { w, h, walls, pits, goals, pieces, big, colors }
 * where the element counts are [min,max] pairs and `goals` counts goal CELLS.
 *
 * Placement order is deliberate. Blocks go down first, then goals shaped to
 * receive them, then walls and pits fill what is left.
 *
 * The reason is multi-cell blocks. A horizontal 2-cell block can only ever be
 * collected on two horizontally adjacent goals of its colour — scatter the
 * goals at random and almost every board with a wide block is born unsolvable.
 * Reserving a matching-orientation goal pair per big block is what makes the
 * search for those chapters productive instead of a lottery.
 */
function generate(spec, rng) {
  var W = spec.w, H = spec.h;
  var terrain = [], pieces = [], y;
  for (y = 0; y < H; y++) {
    terrain.push(new Array(W + 1).join('.'));
    pieces.push(new Array(W + 1).join('.'));
  }

  var free = [];
  for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) free.push([xx, yy]);
  rng.shuffle(free);

  var nWall = rng.range(spec.walls);
  var nPit = rng.range(spec.pits);
  var nPiece = rng.range(spec.pieces);
  var nBig = spec.big ? rng.range(spec.big) : 0;
  var nColor = spec.colors || 1;
  if (nBig > nPiece) nBig = nPiece;
  var nGoal = Math.max(rng.range(spec.goals), nBig * 2);

  // Cells consumed: blocks (big ones take two), goals, walls, pits — plus at
  // least one cell of slack so gravity has somewhere to move things.
  if (nPiece + nBig + nGoal + nWall + nPit > W * H - 1) return null;

  var open = {};
  free.forEach(function (f) { open[f[0] + ',' + f[1]] = true; });
  var claim = function (c) {
    delete open[c[0] + ',' + c[1]];
    free = free.filter(function (f) { return !(f[0] === c[0] && f[1] === c[1]); });
  };
  var put = function (layer, c, ch) { layer[c[1]] = setCh(layer[c[1]], c[0], ch); };

  /** All free adjacent cell pairs, optionally restricted to one orientation. */
  var pairsOf = function (horizOnly) {
    var out = [];
    free.forEach(function (f) {
      var dirs = horizOnly === true ? [[1, 0]] : horizOnly === false ? [[0, 1]] : [[1, 0], [0, 1]];
      dirs.forEach(function (d) {
        var nx = f[0] + d[0], ny = f[1] + d[1];
        if (open[nx + ',' + ny]) out.push({ cells: [f, [nx, ny]], horiz: d[0] === 1 });
      });
    });
    return out;
  };

  var i, c;
  var bigs = [];
  var colors = {};
  var placed = 0;

  // 1. multi-cell blocks
  for (i = 0; i < nBig; i++) {
    var ps = pairsOf(null);
    if (!ps.length) return null;
    var pr = rng.pick(ps);
    var L = LETTERS[placed++];
    pr.cells.forEach(function (cc) { put(pieces, cc, L); claim(cc); });
    colors[L] = nColor > 1 ? rng.int(nColor) : 0;
    bigs.push({ letter: L, horiz: pr.horiz, color: colors[L] });
  }

  // 2. single-cell blocks
  for (i = 0; i < nPiece - nBig; i++) {
    c = free.pop(); if (!c) return null;
    var L2 = LETTERS[placed++];
    put(pieces, c, L2);
    claim(c);
    colors[L2] = nColor > 1 ? rng.int(nColor) : 0;
  }
  if (!placed) return null;

  // 3. one shape-matched goal pair per multi-cell block
  var goalsLeft = nGoal;
  for (i = 0; i < bigs.length; i++) {
    var fit = pairsOf(bigs[i].horiz);
    if (!fit.length) return null;
    var gp = rng.pick(fit);
    var ch = nColor > 1 ? String(bigs[i].color) : 'o';
    gp.cells.forEach(function (cc) { put(terrain, cc, ch); claim(cc); });
    goalsLeft -= 2;
  }

  // 4. remaining goal cells, covering every single-block colour first
  var needColors = [];
  if (nColor > 1) {
    Object.keys(colors).forEach(function (k) {
      var isBig = bigs.some(function (b) { return b.letter === k; });
      if (!isBig && needColors.indexOf(colors[k]) < 0) needColors.push(colors[k]);
    });
  }
  if (goalsLeft < needColors.length) goalsLeft = needColors.length;
  for (i = 0; i < goalsLeft; i++) {
    c = free.pop(); if (!c) return null;
    var gc = i < needColors.length ? String(needColors[i]) : (nColor > 1 ? String(rng.int(nColor)) : 'o');
    put(terrain, c, gc);
    claim(c);
  }

  // 5. walls and pits fill what is left
  for (i = 0; i < nWall; i++) { c = free.pop(); if (!c) return null; put(terrain, c, '#'); claim(c); }
  for (i = 0; i < nPit; i++) { c = free.pop(); if (!c) return null; put(terrain, c, '*'); claim(c); }

  return { terrain: terrain, pieces: pieces, colors: colors };
}

// ---------------------------------------------------------------------------
// canonical form — two boards that differ only by rotation are one puzzle
// ---------------------------------------------------------------------------

function transform(rows, k) {
  var h = rows.length, w = rows[0].length, out = [], y, x;
  var oh = (k === 1 || k === 3 || k === 5 || k === 7) ? w : h;
  var ow = (k === 1 || k === 3 || k === 5 || k === 7) ? h : w;
  for (y = 0; y < oh; y++) {
    var line = '';
    for (x = 0; x < ow; x++) {
      var sx, sy;
      switch (k) {
        case 0: sx = x; sy = y; break;
        case 1: sx = y; sy = h - 1 - x; break;
        case 2: sx = w - 1 - x; sy = h - 1 - y; break;
        case 3: sx = w - 1 - y; sy = x; break;
        case 4: sx = w - 1 - x; sy = y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = x; sy = h - 1 - y; break;
        default: sx = w - 1 - y; sy = h - 1 - x; break;
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
    var map = {}, next = 0, relabelled = [];
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
    // Keyed by the NEW label so swapped letters cannot look like a new board.
    var sig = Object.keys(map).map(function (src) {
      return map[src] + ':' + ((def.colors && def.colors[src]) || 0);
    }).sort().join(',');
    var key = terr.join('/') + '|' + relabelled.join('/') + '|' + sig;
    if (best === null || key < best) best = key;
  }
  return best;
}

// ---------------------------------------------------------------------------
// measurement
// ---------------------------------------------------------------------------

/** Number of distinct shortest solutions, capped. */
function countShortest(stage, par, cap) {
  var count = 0;
  (function walk(s, depth) {
    if (count > cap || depth === par) return;
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      if (!ns || E.isLost(ns)) continue;
      if (E.isClear(ns)) { if (depth + 1 === par) count++; continue; }
      walk(ns, depth + 1);
    }
  })(E.initialState(stage), 0);
  return count;
}

/**
 * Share of ALL par-length tilt sequences that happen to clear the board.
 * The lower this is, the more the stage demands an actual idea rather than
 * a lucky flail. Sampled once the exhaustive walk would get expensive.
 */
function solveRate(stage, par, rng, limit) {
  if (par < 1) return 1;
  var total = Math.pow(4, par);
  if (total <= 300000) {
    var wins = 0;
    (function walk(s, depth) {
      for (var i = 0; i < 4; i++) {
        var ns = E.step(stage, s, E.DIRS[i]);
        if (!ns || E.isLost(ns)) continue;
        var rest = Math.pow(4, par - depth - 1);
        if (E.isClear(ns)) { wins += rest; continue; }
        if (depth + 1 < par) walk(ns, depth + 1);
      }
    })(E.initialState(stage), 0);
    return wins / total;
  }
  // Beyond ~9 moves the exhaustive walk is millions of sequences, so sample.
  // `bail` lets the caller stop the moment the board is already too lucky to
  // ship, which is what makes long-par chapters searchable at all.
  var trials = 5000, hit = 0;
  var bailAt = limit != null ? Math.ceil(limit * trials) + 1 : Infinity;
  for (var t = 0; t < trials; t++) {
    var s = E.initialState(stage);
    for (var m = 0; m < par; m++) {
      var ns2 = E.step(stage, s, E.DIRS[rng ? rng.int(4) : Math.floor(Math.random() * 4)]);
      if (!ns2 || E.isLost(ns2)) break;
      s = ns2;
      if (E.isClear(s)) { hit++; break; }
    }
    if (hit >= bailAt) return hit / (t + 1);
  }
  return hit / trials;
}

/**
 * How many tilts anywhere in the reachable space actually cost you a block.
 * `firstOnly` stops at the first one — during a search we usually just need to
 * know whether the pit is a real threat or decoration.
 */
function danger(stage, cap, firstOnly) {
  var states = E.reachable(stage, null, cap || 4000);
  var kills = 0;
  for (var i = 0; i < states.length; i++) {
    if (E.isClear(states[i])) continue;
    for (var d = 0; d < 4; d++) {
      var r = E.simulate(stage, states[i], E.DIRS[d], { frames: false });
      if (r.moved && r.state.lost > 0) {
        kills++;
        if (firstOnly) return { kills: kills, states: states.length, partial: true };
      }
    }
  }
  return { kills: kills, states: states.length, partial: false };
}

/** Largest single-tilt cascade along the optimal line, and the size of the final one. */
function chainOf(stage, path) {
  var s = E.initialState(stage), max = 0, last = 0;
  for (var i = 0; i < path.length; i++) {
    var r = E.simulate(stage, s, path[i]);
    var got = 0;
    for (var k = 0; k < r.events.length; k++) if (r.events[k].type === 'goal') got++;
    if (got > max) max = got;
    if (i === path.length - 1) last = got;
    s = r.state;
  }
  return { max: max, last: last };
}

function cloneDef(d) {
  return {
    id: d.id, name: d.name,
    terrain: d.terrain.slice(), pieces: d.pieces.slice(),
    colors: JSON.parse(JSON.stringify(d.colors || {}))
  };
}

/**
 * The deletion test. Returns the label of the first element the board turns out
 * not to need, or null if every one of them is load-bearing.
 */
function findInert(def, stage, par, ways, nodeCap) {
  var probe = function (variant, label) {
    var st;
    try { st = E.compile(variant); } catch (e) { return null; }
    var sol = E.solve(st, E.initialState(st), nodeCap || 80000);
    if (!sol.solvable || sol.moves !== par) return null;      // it mattered
    if (countShortest(st, sol.moves, 400) !== ways) return null;
    return label;                                              // it did not
  };

  var h = def.terrain.length, w = def.terrain[0].length, y, x, hit;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      var ch = def.terrain[y][x];
      if (ch === '.') continue;
      var v = cloneDef(def);
      v.terrain[y] = setCh(v.terrain[y], x, '.');
      hit = probe(v, (ch === '#' ? 'wall' : ch === '*' ? 'pit' : 'goal') + ' ' + x + ',' + y);
      if (hit) return hit;
    }
  }
  for (var pi = 0; pi < stage.pieces.length; pi++) {
    var L = stage.pieces[pi].letter;
    var v2 = cloneDef(def);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) if (v2.pieces[y][x] === L) v2.pieces[y] = setCh(v2.pieces[y], x, '.');
    }
    hit = probe(v2, 'block ' + L);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// the full gate
// ---------------------------------------------------------------------------

/**
 * Returns a scored record, or null if the board fails any requirement.
 * `filters` may set: par, ways, luck, danger, chain, chainLast, minStates, loose.
 */
function evaluate(def, filters, rng) {
  var stage;
  try { stage = E.compile(def); } catch (e) { return null; }

  var start = E.initialState(stage);
  if (E.isClear(start)) return null;

  var sol = E.solve(stage, start, filters.nodeCap || 200000);
  if (!sol.solvable) return null;
  var par = sol.moves;
  if (filters.par && (par < filters.par[0] || par > filters.par[1])) return null;

  var ways = countShortest(stage, par, 400);
  if (filters.ways && (ways < filters.ways[0] || ways > filters.ways[1])) return null;

  var luck = solveRate(stage, par, rng, filters.luck);
  if (filters.luck != null && luck > filters.luck) return null;

  var chain = chainOf(stage, sol.path);
  if (filters.chain && chain.max < filters.chain) return null;
  if (filters.chainLast && chain.last < filters.chainLast) return null;

  var dg = danger(stage, filters.dangerCap || 4000, !!filters.danger && !filters.exactDanger);
  if (filters.danger && dg.kills === 0) return null;
  if (filters.minStates && dg.states < filters.minStates) return null;

  if (!filters.loose) {
    var inert = findInert(def, stage, par, ways, filters.nodeCap);
    if (inert) return null;
  }

  // Prefer long, unlucky, branchy boards with a single clean idea running
  // through them.
  var score = par * 10
    - luck * 500
    - ways * 2.5
    + Math.min(dg.states, 400) * 0.05
    + (dg.kills ? 3 : 0)
    + (chain.max > 1 ? chain.max * 2 : 0);

  return {
    def: def, stage: stage, par: par, ways: ways, luck: luck,
    states: dg.states, kills: dg.kills,
    chain: chain.max, chainLast: chain.last,
    path: sol.path, score: score
  };
}

module.exports = {
  Rng: Rng,
  LETTERS: LETTERS,
  generate: generate,
  canonical: canonical,
  evaluate: evaluate,
  countShortest: countShortest,
  solveRate: solveRate,
  danger: danger,
  chainOf: chainOf,
  findInert: findInert,
  cloneDef: cloneDef,
  setCh: setCh
};
