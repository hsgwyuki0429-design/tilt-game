'use strict';
/*
 * TILT — board generation.
 *
 * Five methods, because no single one of them finds everything:
 *
 *   A  SEED       a board a human wrote down to express one specific idea
 *   B  SWEEP      solve an entire terrain at once and read off every good
 *                 starting position it contains
 *   C  CLIMB      random board, then move one piece at a time toward a target
 *   D  EXHAUST    enumerate the whole design space of a small board
 *   E  VARY       take something that nearly worked and shake it
 *
 * B is the one that matters, and it is worth explaining because it inverts the
 * obvious approach.
 *
 * The obvious approach makes a board, solves it, scores it, throws it away, and
 * starts again — one full breadth-first search per candidate. That is enormously
 * wasteful, because every board that shares a terrain (the same walls, goals and
 * hazards, with the blocks somewhere else) shares almost all of its search.
 *
 * So instead: fix the terrain, and solve the game ONCE for every possible
 * placement of the blocks simultaneously. One graph, built from all starts at
 * the same time, gives:
 *
 *   - the exact shortest solution for every placement, from one backward sweep
 *   - which positions are dead, and whether they are dead loudly or silently
 *   - what the player-who-has-not-seen-it-yet does from every position, as a
 *     single pass over a functional graph
 *
 * After that, scoring a candidate board is arithmetic on lookup tables rather
 * than a search, and a whole terrain's worth of boards — every placement of
 * every block — costs about what ONE board used to cost. That is what makes
 * D affordable: at 3×3 the design space is small enough that this can sweep
 * ALL of it and hand back the best boards that exist, not the best boards it
 * happened to stumble on.
 *
 * Nothing here optimises for length. Length is a constraint a caller may
 * impose; the thing being selected for is always the shape of the thinking, as
 * defined in design.js.
 */

var E = require('../../src/engine.js');
var D = require('./design.js');

// ---------------------------------------------------------------------------
// deterministic RNG — a campaign must rebuild byte-identically from its seed
// ---------------------------------------------------------------------------

function Rng(seed) { this.s = (seed >>> 0) || 1; }
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
// terrain: a board with no blocks on it yet
// ---------------------------------------------------------------------------

function blankRows(w, h) {
  var rows = [];
  for (var y = 0; y < h; y++) rows.push(new Array(w + 1).join('.'));
  return rows;
}

/** Cells a block is allowed to start on: floor, and not a goal or hazard. */
function freeCells(terrain) {
  var out = [];
  for (var y = 0; y < terrain.length; y++) {
    for (var x = 0; x < terrain[y].length; x++) if (terrain[y][x] === '.') out.push([x, y]);
  }
  return out;
}

/**
 * Every terrain of a given size with a given budget of furniture.
 *
 * `spec` = { w, h, goals: ['o'] | ['a','b'], walls: [min,max], hazards: [min,max] }
 * Yields canonical terrains only — two terrains that differ by a rotation
 * describe the same puzzle and only one of them is worth searching.
 */
function eachTerrain(spec, emit) {
  var w = spec.w, h = spec.h, n = w * h;
  var goalChars = spec.goals || ['o'];
  var wallLo = spec.walls[0], wallHi = spec.walls[1];
  var hazLo = spec.hazards ? spec.hazards[0] : 0;
  var hazHi = spec.hazards ? spec.hazards[1] : 0;
  var pinLo = spec.pins ? spec.pins[0] : 0;
  var pinHi = spec.pins ? spec.pins[1] : 0;

  var cells = [];
  for (var i = 0; i < n; i++) cells.push(i);
  var seen = Object.create(null);

  // Choose goal cells, then walls, then hazards, from what is left.
  //
  // The goal LABELS are permuted, not just their cells. With two colours,
  // putting 'a' on the left and 'b' on the right is a different puzzle from the
  // other way round the moment the blocks are not evenly split — enumerating
  // combinations alone would silently search half the colour space.
  chooseN(cells, goalChars.length, function (goalAt) {
    var rest1 = cells.filter(function (c) { return goalAt.indexOf(c) < 0; });
    eachLabelling(goalChars, function (labels) {
      for (var nw = wallLo; nw <= wallHi; nw++) {
        chooseN(rest1, nw, function (wallAt) {
          var rest2 = rest1.filter(function (c) { return wallAt.indexOf(c) < 0; });
          for (var nh = hazLo; nh <= hazHi; nh++) {
            chooseN(rest2, nh, function (hazAt) {
              var rest3 = rest2.filter(function (c) { return hazAt.indexOf(c) < 0; });
              for (var np = pinLo; np <= pinHi; np++) {
                chooseN(rest3, np, function (pinAt) {
                  var rows = blankRows(w, h);
                  var k;
                  for (k = 0; k < goalAt.length; k++) rows[(goalAt[k] / w) | 0] = D.setCh(rows[(goalAt[k] / w) | 0], goalAt[k] % w, labels[k]);
                  for (k = 0; k < wallAt.length; k++) rows[(wallAt[k] / w) | 0] = D.setCh(rows[(wallAt[k] / w) | 0], wallAt[k] % w, '#');
                  for (k = 0; k < hazAt.length; k++) rows[(hazAt[k] / w) | 0] = D.setCh(rows[(hazAt[k] / w) | 0], hazAt[k] % w, 'x');
                  for (k = 0; k < pinAt.length; k++) rows[(pinAt[k] / w) | 0] = D.setCh(rows[(pinAt[k] / w) | 0], pinAt[k] % w, '+');
                  var key = D.canonical(rows);
                  if (seen[key]) return;
                  seen[key] = 1;
                  emit(rows);
                });
              }
            });
          }
        });
      }
    });
  });

  /** Every distinct ordering of the goal characters. */
  function eachLabelling(chars, fn) {
    var out = [], used = new Array(chars.length).fill(false), acc = [];
    var seenPerm = Object.create(null);
    (function rec() {
      if (acc.length === chars.length) {
        var k = acc.join('');
        if (!seenPerm[k]) { seenPerm[k] = 1; out.push(acc.slice()); }
        return;
      }
      for (var i = 0; i < chars.length; i++) {
        if (used[i]) continue;
        used[i] = true; acc.push(chars[i]);
        rec();
        acc.pop(); used[i] = false;
      }
    })();
    out.forEach(fn);
  }

  function chooseN(pool, k, fn) {
    var acc = [];
    (function rec(start) {
      if (acc.length === k) { fn(acc.slice()); return; }
      for (var i = start; i < pool.length; i++) {
        acc.push(pool[i]);
        rec(i + 1);
        acc.pop();
      }
    })(0);
  }
}

/** All ways to drop `colours` (e.g. ['@','@','A']) onto the free cells. */
function eachPlacement(free, colours, emit) {
  // Same-coloured blocks are interchangeable, so enumerate each colour's cells
  // as an unordered choice and never generate the same board twice.
  var groups = {}, order = [];
  colours.forEach(function (c) {
    if (!groups[c]) { groups[c] = 0; order.push(c); }
    groups[c]++;
  });

  (function rec(gi, remaining, acc) {
    if (gi === order.length) { emit(acc.slice()); return; }
    var c = order[gi], k = groups[c];
    var pick = [];
    (function sub(start) {
      if (pick.length === k) {
        var left = remaining.filter(function (cell) { return pick.indexOf(cell) < 0; });
        for (var i = 0; i < pick.length; i++) acc.push([pick[i], c]);
        rec(gi + 1, left, acc);
        for (i = 0; i < pick.length; i++) acc.pop();
        return;
      }
      for (var i = start; i < remaining.length; i++) {
        pick.push(remaining[i]);
        sub(i + 1);
        pick.pop();
      }
    })(0);
  })(0, free, []);
}

function paint(terrain, placement) {
  var rows = D.cloneBoard(terrain);
  for (var i = 0; i < placement.length; i++) {
    var cell = placement[i][0], ch = placement[i][1];
    rows[cell[1]] = D.setCh(rows[cell[1]], cell[0], ch);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// METHOD B — solve a whole terrain at once
// ---------------------------------------------------------------------------

/**
 * Every board that this terrain can hold, measured.
 *
 * Builds one state graph seeded from ALL block placements at once, then reads
 * every candidate's numbers off shared tables:
 *
 *   dist[]        exact shortest solution from every position
 *   naiveEnds[]   where the player who is not thinking yet ends up from every
 *                 position, as one pass over the policy's functional graph
 *
 * `emit(candidate)` is called for every placement that survives `filters`.
 * Candidates carry only the cheap numbers; a caller that wants the deletion
 * census and the scorecard runs design.profile() on the survivors.
 */
function sweepTerrain(terrain, colours, filters, emit) {
  filters = filters || {};
  var free = freeCells(terrain);
  if (free.length <= colours.length) return 0;

  // One compiled stage stands in for every board on this terrain: the engine
  // only ever reads terrain, goals and per-block colour from it, and those do
  // not change as the blocks move around.
  var template = paint(terrain, free.slice(0, colours.length).map(function (c, i) { return [c, colours[i]]; }));
  var stage = D.compile(template);
  if (!stage) return 0;

  var key = E.makeStateKey(stage);
  var goals = D.goalCells(stage);
  var nodeCap = filters.nodeCap || 200000;

  var index = Object.create(null);
  var states = [], next = [], clear = [], broken = [];
  var starts = [];

  function intern(s) {
    var k = key(s);
    var at = index[k];
    if (at != null) return at;
    at = states.length;
    if (at >= nodeCap) return -1;
    index[k] = at;
    states.push(s);
    next.push(null);
    clear.push(E.isClear(s) ? 1 : 0);
    broken.push(E.isBroken(s) ? 1 : 0);
    return at;
  }

  // Seed with every placement of the blocks.
  var placements = [];
  eachPlacement(free, colours, function (place) {
    placements.push(place.slice());
  });
  if (filters.maxPlacements && placements.length > filters.maxPlacements) return 0;

  for (var pi = 0; pi < placements.length; pi++) {
    var s = {
      pos: placements[pi].map(function (p) { return [p[0][0], p[0][1]]; }),
      alive: placements[pi].map(function () { return 1; }),
      collected: 0, lost: 0, moves: 0
    };
    // The engine identifies a block's colour by its index, so the state's block
    // order has to match the template's.
    var at = intern(s);
    starts.push(at);
  }

  // Expand. `states` grows as we go; this is a breadth-first sweep over the
  // union of every start's reachable set.
  for (var i = 0; i < states.length; i++) {
    if (clear[i] || broken[i]) { next[i] = [i, i, i, i]; continue; }
    var row = [0, 0, 0, 0];
    for (var d = 0; d < 4; d++) {
      var ns = E.step(stage, states[i], E.DIRS[d]);
      if (!ns) { row[d] = i; continue; }
      var at2 = intern(ns);
      if (at2 < 0) return 0;                 // terrain too sprawling to measure
      row[d] = at2;
    }
    next[i] = row;
  }

  var n = states.length;

  // ── shortest solution from every position, in one backward sweep ──────────
  var dist = new Int32Array(n).fill(-1);
  var back = [];
  for (i = 0; i < n; i++) back.push([]);
  for (i = 0; i < n; i++) {
    for (d = 0; d < 4; d++) if (next[i][d] !== i) back[next[i][d]].push(i);
  }
  var queue = [], head = 0;
  for (i = 0; i < n; i++) if (clear[i]) { dist[i] = 0; queue.push(i); }
  while (head < queue.length) {
    var cur = queue[head++];
    var pre = back[cur];
    for (var k = 0; k < pre.length; k++) {
      if (dist[pre[k]] < 0) { dist[pre[k]] = dist[cur] + 1; queue.push(pre[k]); }
    }
  }

  // ── where the naive player ends up, from every position ───────────────────
  // The policy is deterministic, so this is a functional graph: follow it and
  // every node either reaches a cleared board or falls into a cycle. Resolved
  // iteratively with an explicit stack so no board can blow the call stack.
  var policy = new Int32Array(n).fill(-1);
  for (i = 0; i < n; i++) {
    if (clear[i] || broken[i]) continue;
    var best = null;
    for (d = 0; d < 4; d++) {
      var j = next[i][d];
      if (j === i) continue;
      var got = states[j].collected - states[i].collected;
      var died = (states[j].lost || 0) - (states[i].lost || 0);
      var appeal = got * 1000 - D.distSum(stage, goals, states[j]) - died * 10000;
      if (!best || appeal > best.appeal) best = { appeal: appeal, to: j };
    }
    policy[i] = best ? best.to : i;
  }
  var naiveWins = new Int8Array(n).fill(-1);   // -1 unknown, 1 wins, 0 does not
  for (i = 0; i < n; i++) {
    if (naiveWins[i] >= 0) continue;
    var chain = [], at3 = i;
    var mark = Object.create(null);
    while (at3 >= 0 && naiveWins[at3] < 0 && !mark[at3]) {
      mark[at3] = 1;
      chain.push(at3);
      if (clear[at3] || broken[at3] || policy[at3] === at3) break;
      at3 = policy[at3];
    }
    var verdict;
    if (at3 < 0) verdict = 0;
    else if (naiveWins[at3] >= 0) verdict = naiveWins[at3];
    else if (clear[at3]) verdict = 1;
    else verdict = 0;                          // broken, stuck, or looping
    for (k = 0; k < chain.length; k++) naiveWins[chain[k]] = verdict;
  }

  // ── read off every candidate ──────────────────────────────────────────────
  var kept = 0;
  for (pi = 0; pi < placements.length; pi++) {
    var start = starts[pi];
    var par = dist[start];
    if (par < 1) continue;
    if (clear[start]) continue;
    if (filters.par && (par < filters.par[0] || par > filters.par[1])) continue;
    if (naiveWins[start] && !filters.allowNaive) continue;   // no idea in it

    // Openings, straight off the tables.
    var live = 0, traps = 0, bait = 0, ranked = [];
    for (d = 0; d < 4; d++) {
      var to = next[start][d];
      if (to === start) continue;
      live++;
      var good = dist[to] >= 0 && dist[to] === par - 1;
      if (!good) { traps++; if (states[to].collected > 0) bait++; }
      ranked.push({
        appeal: states[to].collected * 1000 - D.distSum(stage, goals, states[to]) -
                (states[to].lost || 0) * 10000,
        good: good
      });
    }
    if (filters.traps != null && traps < filters.traps) continue;
    ranked.sort(function (p, q) { return q.appeal - p.appeal; });
    var blindness = 0;
    for (k = 0; k < ranked.length; k++) if (ranked[k].good) { blindness = k; break; }
    if (filters.blindness != null && blindness < filters.blindness) continue;

    // The crux: the FEWEST correct moves after which the naive player can
    // finish. Swept level by level across every optimal line at once, because
    // following one arbitrary optimal line reports a board as deeper than it
    // is purely because of which direction the search tried first.
    var unlock = par, layer = [start], mark = Object.create(null);
    mark[start] = 1;
    if (naiveWins[start]) unlock = 0;                 // no idea in it at all
    for (var depth = 1; depth <= par && unlock === par; depth++) {
      var nextLayer = [], hit = false;
      for (k = 0; k < layer.length; k++) {
        for (d = 0; d < 4; d++) {
          var nx = next[layer[k]][d];
          if (nx === layer[k] || dist[nx] !== dist[layer[k]] - 1) continue;
          if (mark[nx]) continue;
          mark[nx] = 1;
          nextLayer.push(nx);
          if (naiveWins[nx] || clear[nx]) hit = true;
        }
      }
      if (hit) { unlock = depth; break; }
      if (!nextLayer.length) break;
      layer = nextLayer;
    }
    if (filters.unlock && (unlock < filters.unlock[0] || unlock > filters.unlock[1])) continue;
    var flow = par - unlock;
    if (filters.flow != null && flow < filters.flow) continue;

    // One optimal line, for the caller to print.
    var path = [], node = start;
    while (dist[node] > 0) {
      var moved = false;
      for (d = 0; d < 4; d++) {
        var nx2 = next[node][d];
        if (nx2 !== node && dist[nx2] === dist[node] - 1) {
          path.push(E.DIRS[d]); node = nx2; moved = true; break;
        }
      }
      if (!moved) break;
    }

    kept++;
    emit({
      board: paint(terrain, placements[pi]),
      par: par, unlock: unlock, flow: flow,
      traps: traps, live: live, bait: bait, blindness: blindness,
      path: path
    });
  }
  return kept;
}

// ---------------------------------------------------------------------------
// METHOD D — the whole design space of a small board
// ---------------------------------------------------------------------------

/**
 * Sweep every terrain of a size, and inside each one every placement of the
 * blocks. At 3×3 this really is exhaustive: what comes back is not the best
 * board the search stumbled on, it is the best board that exists inside the
 * budget it was given.
 */
function exhaust(spec, filters, onFound, onProgress) {
  var found = 0, terrains = 0;
  eachTerrain(spec, function (terrain) {
    terrains++;
    sweepTerrain(terrain, spec.blocks, filters, function (cand) {
      found++;
      onFound(cand);
    });
    if (onProgress && terrains % 200 === 0) onProgress(terrains, found);
  });
  return { terrains: terrains, found: found };
}

// ---------------------------------------------------------------------------
// METHOD C / E — random boards, and variations on near-misses
// ---------------------------------------------------------------------------

/** A random board to a fixed budget. */
function randomBoard(spec, rng) {
  var rows = blankRows(spec.w, spec.h);
  var cells = [];
  for (var y = 0; y < spec.h; y++) for (var x = 0; x < spec.w; x++) cells.push([x, y]);
  rng.shuffle(cells);

  var want = []
    .concat(spec.blocks)
    .concat(spec.goals || ['o'])
    .concat(fill('#', rng.range(spec.walls)))
    .concat(fill('x', spec.hazards ? rng.range(spec.hazards) : 0));
  if (want.length > cells.length - 1) return null;    // leave gravity somewhere to go
  for (var i = 0; i < want.length; i++) D.put(rows, cells[i], want[i]);
  return rows;
}

function fill(ch, n) { var a = []; for (var i = 0; i < n; i++) a.push(ch); return a; }

/** Move one piece to a random empty cell. */
function vary(rows, rng) {
  var out = D.cloneBoard(rows);
  var occupied = [], empty = [];
  for (var y = 0; y < out.length; y++) {
    for (var x = 0; x < out[y].length; x++) {
      if (out[y][x] === '.') empty.push([x, y]);
      else occupied.push([x, y]);
    }
  }
  if (!occupied.length || !empty.length) return out;
  var from = rng.pick(occupied), to = rng.pick(empty);
  var ch = out[from[1]][from[0]];
  D.put(out, from, '.');
  D.put(out, to, ch);
  return out;
}

/**
 * Hill-climb toward the shape we want rather than toward a big number.
 *
 * The objective is the crux: a board that costs one or two moves of insight
 * and then plays itself. Length only enters as a band the caller requires,
 * never as something to maximise.
 */
function shapeScore(p, want) {
  if (!p) return -Infinity;
  if (p.unlock === 0) return -Infinity;                   // no idea in it at all
  var s = 0;
  s -= Math.abs(p.unlock - (want && want.unlock != null ? want.unlock : 2)) * 12;
  s += Math.min(p.flow, 6) * 5;
  s += p.blindness * 9;
  s += p.traps * 5;
  s += p.retreat * 6;
  s += (p.bait ? 8 : 0);
  s += (p.indirect ? 5 : 0);
  s += Math.min(p.caught, 3) * 7;      // goals the player had to build a buffer for
  s += Math.min(p.chainLast, 3) * 4;
  s -= p.pieces.total * 2.5;
  s -= p.jam * 30;
  s -= p.luck * 400;
  s -= Math.max(0, p.ways - 3) * 3;
  s -= Math.max(0, p.pump - 0.3) * 45;
  return s;
}

function climb(spec, rng, filters, steps) {
  var rows = randomBoard(spec, rng);
  if (!rows) return null;
  var best = D.profile(rows, { quick: true, cap: filters.nodeCap || 60000 });
  var bestScore = fits(best, filters) ? shapeScore(best, filters) : -Infinity;
  var stall = 0;

  for (var i = 0; i < steps; i++) {
    var cand = vary(rows, rng);
    var p = D.profile(cand, { quick: true, cap: filters.nodeCap || 60000 });
    if (!p) continue;
    var sc = fits(p, filters) ? shapeScore(p, filters) : -Infinity;
    if (sc > bestScore || (sc === bestScore && sc > -Infinity && rng.next() < 0.3)) {
      if (sc > bestScore) stall = 0;
      rows = cand; best = p; bestScore = sc;
    } else if (++stall > 90) {
      break;
    }
  }
  return bestScore > -Infinity ? best : null;
}

/** Does a profile satisfy a filter set? Shared by climb and the campaign. */
function fits(p, f) {
  if (!p) return false;
  if (!f) return true;
  if (f.par && (p.par < f.par[0] || p.par > f.par[1])) return false;
  if (f.unlock && (p.unlock < f.unlock[0] || p.unlock > f.unlock[1])) return false;
  if (f.flow != null && p.flow < f.flow) return false;
  if (f.blindness != null && p.blindness < f.blindness) return false;
  if (f.traps != null && p.traps < f.traps) return false;
  if (f.retreat != null && p.retreat < f.retreat) return false;
  if (f.bait && !p.bait) return false;
  if (f.indirect && !p.indirect) return false;
  if (f.chainLast != null && p.chainLast < f.chainLast) return false;
  if (f.cascade != null && p.cascade < f.cascade) return false;
  if (f.crossings != null && p.crossings < f.crossings) return false;
  if (f.refused != null && p.refused < f.refused) return false;
  if (f.caught != null && p.caught < f.caught) return false;
  if (f.overshoot != null && p.overshoot < f.overshoot) return false;
  if (f.setup != null && p.setup < f.setup) return false;
  if (f.maxWays != null && p.ways > f.maxWays) return false;
  if (f.maxLuck != null && p.luck > f.maxLuck) return false;
  if (f.maxJam != null && p.jam > f.maxJam) return false;
  if (f.maxPieces != null && p.pieces.total > f.maxPieces) return false;
  if (f.minStates != null && p.states < f.minStates) return false;
  if (f.minLive != null && p.live < f.minLive) return false;
  if (f.maxPump != null && p.pump > f.maxPump) return false;
  if (f.naiveSolves === false && p.naiveSolved) return false;
  if (f.floors) {
    for (var axis in f.floors) if (p.score[axis] < f.floors[axis]) return false;
  }
  return true;
}

module.exports = {
  Rng: Rng,
  blankRows: blankRows, freeCells: freeCells, paint: paint,
  eachTerrain: eachTerrain, eachPlacement: eachPlacement,
  sweepTerrain: sweepTerrain, exhaust: exhaust,
  randomBoard: randomBoard, vary: vary, climb: climb,
  shapeScore: shapeScore, fits: fits
};
