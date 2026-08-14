'use strict';
/*
 * TILT — board generation and measurement.
 *
 * Shared by tools/forge.js (interactive search) and tools/campaign.js (builds
 * the whole 100-stage campaign). Nothing here knows about the campaign layout;
 * it only knows how to make a board to a budget and how to tell whether that
 * board is any good.
 *
 * There are exactly three things to place — walls, blocks, goals — and the
 * budget for each is fixed before the search starts. Nothing here can invent a
 * new kind of element to make a board harder, because there is no such thing
 * to invent. Depth has to come from WHERE the three things go.
 *
 * That constraint is also why the search hill-climbs instead of merely
 * sampling. Boards that need twelve or twenty tilts are a vanishing fraction of
 * random layouts, but they are a short walk from ordinary ones: nudge a single
 * wall and a six-move board becomes a nine-move board. So the generator throws
 * a random board down, then keeps moving one element at a time for as long as
 * the shortest solution keeps getting longer. The element budget never grows —
 * only the thinking does.
 *
 * The quality bar, cheapest test first:
 *
 *   compiles → not already solved → shortest solution inside the target band
 *   → few enough distinct optimal lines → low enough luck → and finally:
 *   every single element is load-bearing.
 *
 * That last test is the expensive one and the one that matters. A board ships
 * only if deleting ANY wall, block or goal measurably changes the puzzle.
 */

var E = require('../../src/engine.js');

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
// boards as pictures
// ---------------------------------------------------------------------------

var WALL = '#', GOAL = 'o', BLOCK = '@', FLOOR = '.';

function setCh(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }

function cloneBoard(rows) { return rows.slice(); }

function cellsOf(rows, ch) {
  var out = [];
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) if (rows[y][x] === ch) out.push([x, y]);
  }
  return out;
}

function put(rows, c, ch) { rows[c[1]] = setCh(rows[c[1]], c[0], ch); }

/** spec: { w, h, walls, blocks, goals } — each count a [min,max] pair. */
function generate(spec, rng) {
  var W = spec.w, H = spec.h, rows = [], y;
  for (y = 0; y < H; y++) rows.push(new Array(W + 1).join(FLOOR));

  var nWall = rng.range(spec.walls);
  var nBlock = rng.range(spec.blocks);
  var nGoal = rng.range(spec.goals);
  // At least one empty cell, or gravity has nowhere to take anything.
  if (nWall + nBlock + nGoal > W * H - 1) return null;

  var free = [];
  for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) free.push([xx, yy]);
  rng.shuffle(free);

  var i;
  for (i = 0; i < nBlock; i++) put(rows, free.pop(), BLOCK);
  for (i = 0; i < nGoal; i++) put(rows, free.pop(), GOAL);
  for (i = 0; i < nWall; i++) put(rows, free.pop(), WALL);
  return rows;
}

/** Move one randomly chosen element to a randomly chosen empty cell. */
function mutate(rows, rng) {
  var out = cloneBoard(rows);
  var occupied = [], empty = [];
  for (var y = 0; y < out.length; y++) {
    for (var x = 0; x < out[y].length; x++) {
      if (out[y][x] === FLOOR) empty.push([x, y]);
      else occupied.push([x, y]);
    }
  }
  if (!occupied.length || !empty.length) return out;
  var from = rng.pick(occupied);
  var to = rng.pick(empty);
  var ch = out[from[1]][from[0]];
  put(out, from, FLOOR);
  put(out, to, ch);
  return out;
}

// ---------------------------------------------------------------------------
// canonical form — boards that differ only by rotation are one puzzle
// ---------------------------------------------------------------------------

function transform(rows, k) {
  var h = rows.length, w = rows[0].length, out = [], y, x;
  var flip = (k === 1 || k === 3 || k === 5 || k === 7);
  var oh = flip ? w : h, ow = flip ? h : w;
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

function canonical(rows) {
  var best = null;
  for (var k = 0; k < 8; k++) {
    var key = transform(rows, k).join('/');
    if (best === null || key < best) best = key;
  }
  return best;
}

// ---------------------------------------------------------------------------
// measurement — every number below is read off one reachability graph
// ---------------------------------------------------------------------------

/** Shortest solution length only. The cheap test, used inside the climb. */
function parOf(rows, cap) {
  var stage;
  try { stage = E.compile({ board: rows }); } catch (e) { return -1; }
  if (E.isClear(E.initialState(stage))) return -1;
  var sol = E.solve(stage, null, cap || 60000);
  return sol.solvable ? sol.moves : -1;
}

/**
 * Everything the design gate wants to know, computed exactly from the graph.
 *
 *   par    shortest solution, in tilts
 *   ways   how many distinct par-length tilt sequences clear the board
 *   luck   share of ALL par-length tilt sequences that happen to clear it —
 *          the probability a player who is not thinking wins anyway
 *   dead   share of reachable positions from which the board can no longer be
 *          solved; undo is free, but this is how unforgiving a stage feels
 *   states how much board there is to think about
 */
function measure(stage, cap) {
  var g = E.graph(stage, cap || 60000);
  if (!g) return null;

  var n = g.n, i, d, j;

  var par = -1;
  for (i = 0; i < n; i++) {
    if (g.clear[i]) { par = g.dist[i]; break; }   // BFS order: first clear is shortest
  }
  if (par < 1) return null;

  // Distinct shortest lines. Nodes are in breadth-first order, so a single
  // forward sweep is a correct dynamic program over the layers.
  var ways = new Float64Array(n);
  ways[0] = 1;
  var total = 0;
  for (i = 0; i < n; i++) {
    if (!ways[i] || g.dist[i] >= par) continue;
    for (d = 0; d < 4; d++) {
      j = g.next[i][d];
      if (j === i) continue;                       // a tilt that changes nothing
      if (g.dist[j] !== g.dist[i] + 1) continue;
      ways[j] += ways[i];
      if (g.clear[j] && g.dist[j] === par) total += ways[i];
    }
  }

  // Luck: walk `par` uniformly random tilts and see how much probability mass
  // ends up on a cleared board. A tilt that moves nothing leaves you where you
  // were and still burns one of the par moves.
  var p = new Float64Array(n);
  p[0] = 1;
  var luck = 0;
  for (var step = 0; step < par; step++) {
    var q = new Float64Array(n);
    for (i = 0; i < n; i++) {
      if (!p[i]) continue;
      for (d = 0; d < 4; d++) {
        j = g.next[i][d];
        if (g.clear[j]) luck += p[i] * 0.25;
        else q[j] += p[i] * 0.25;
      }
    }
    p = q;
  }

  // Dead ends: which positions can still reach a cleared board? Walk the graph
  // backwards from every clear node.
  var back = [];
  for (i = 0; i < n; i++) back.push([]);
  for (i = 0; i < n; i++) {
    for (d = 0; d < 4; d++) {
      j = g.next[i][d];
      if (j !== i) back[j].push(i);
    }
  }
  var alive = new Uint8Array(n);
  var stack = [];
  for (i = 0; i < n; i++) if (g.clear[i]) { alive[i] = 1; stack.push(i); }
  while (stack.length) {
    var cur = stack.pop();
    var pre = back[cur];
    for (var k = 0; k < pre.length; k++) if (!alive[pre[k]]) { alive[pre[k]] = 1; stack.push(pre[k]); }
  }
  var dead = 0, live = 0;
  for (i = 0; i < n; i++) {
    if (g.clear[i]) continue;
    live++;
    if (!alive[i]) dead++;
  }

  return {
    par: par,
    ways: Math.round(total),
    luck: luck,
    states: n,
    dead: live ? dead / live : 0
  };
}

/**
 * What the optimal line actually feels like to play.
 *   chain      most blocks collected by a single tilt
 *   chainLast  blocks collected by the FINAL tilt
 *   opening    tilts played before the first block is collected — how long the
 *              player has to arrange the board before anything pays off
 */
function shapeOf(stage, path) {
  var s = E.initialState(stage), max = 0, last = 0, opening = path.length;
  for (var i = 0; i < path.length; i++) {
    var r = E.simulate(stage, s, path[i], { frames: false });
    var got = 0;
    for (var k = 0; k < r.events.length; k++) if (r.events[k].type === 'goal') got++;
    if (got > max) max = got;
    if (got && opening === path.length) opening = i;
    if (i === path.length - 1) last = got;
    s = r.state;
  }
  return { chain: max, chainLast: last, opening: opening };
}

/**
 * The deletion test. Returns the label of the first element the board turns out
 * not to need, or null if every one of them is load-bearing.
 *
 * Removing the last goal or the last block leaves something that will not
 * compile at all, which is the strongest possible proof it was needed.
 */
function findInert(rows, par, ways, cap) {
  var probe = function (variant, label) {
    var st;
    try { st = E.compile({ board: variant }); } catch (e) { return null; }
    if (E.isClear(E.initialState(st))) return null;
    var m = measure(st, cap || 60000);
    if (!m) return null;
    if (m.par !== par || m.ways !== ways) return null;   // it mattered
    return label;                                        // it did not
  };

  var h = rows.length, w = rows[0].length;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ch = rows[y][x];
      if (ch === FLOOR) continue;
      var v = cloneBoard(rows);
      v[y] = setCh(v[y], x, FLOOR);
      var name = ch === WALL ? 'wall' : ch === GOAL ? 'goal' : 'block';
      var hit = probe(v, name + ' ' + x + ',' + y);
      if (hit) return hit;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// the full gate
// ---------------------------------------------------------------------------

/**
 * Returns a scored record, or null if the board fails any requirement.
 * `filters` may set: par, ways, luck, maxDead, minStates, chain, chainLast,
 * opening, loose, nodeCap.
 */
function evaluate(rows, filters, rng) {
  filters = filters || {};
  var stage;
  try { stage = E.compile({ board: rows }); } catch (e) { return null; }
  if (E.isClear(E.initialState(stage))) return null;

  var cap = filters.nodeCap || 60000;
  var m = measure(stage, cap);
  if (!m) return null;

  if (filters.par && (m.par < filters.par[0] || m.par > filters.par[1])) return null;
  if (filters.ways && (m.ways < filters.ways[0] || m.ways > filters.ways[1])) return null;
  if (filters.luck != null && m.luck > filters.luck) return null;
  if (filters.maxDead != null && m.dead > filters.maxDead) return null;
  if (filters.minStates && m.states < filters.minStates) return null;

  var sol = E.solve(stage, null, cap);
  var shape = shapeOf(stage, sol.path);
  if (filters.chain && shape.chain < filters.chain) return null;
  if (filters.chainLast && shape.chainLast < filters.chainLast) return null;
  if (filters.opening && shape.opening < filters.opening) return null;

  var walls = cellsOf(rows, WALL).length;
  var goals = cellsOf(rows, GOAL).length;
  var blocks = cellsOf(rows, BLOCK).length;
  var elements = walls + goals + blocks;

  if (!filters.loose) {
    var inert = findInert(rows, m.par, m.ways, cap);
    if (inert) return null;
  }

  // What a good board looks like, as a number.
  //
  // Length is the point, so par dominates. But par bought with clutter is not
  // what this game is for: every element on the board costs score, which is how
  // "few pieces, deep puzzle" stops being a slogan and starts being a filter.
  // The rest is polish — one clean line, no lucky wins, plenty of room to think,
  // a long set-up before the first payoff, and a finish that lands more than one
  // block at once.
  var score = m.par * 14
    - elements * 5
    - m.ways * 6
    - m.luck * 900
    + Math.min(m.states, 900) * 0.02
    + shape.opening * 2
    + (shape.chain > 1 ? shape.chain * 5 : 0)
    + (shape.chainLast > 1 ? 6 : 0);

  return {
    board: rows, stage: stage, path: sol.path,
    par: m.par, ways: m.ways, luck: m.luck, states: m.states, dead: m.dead,
    chain: shape.chain, chainLast: shape.chainLast, opening: shape.opening,
    walls: walls, goals: goals, blocks: blocks, elements: elements,
    score: score
  };
}

/**
 * Hill-climb one board towards a longer solution.
 *
 * Moves a single element at a time and keeps the change whenever the shortest
 * solution grows. Sideways moves are accepted too — a board often has to go
 * around a plateau before it can climb again — and the element budget is fixed
 * throughout, so the result is a board that got deeper without getting busier.
 */
function climb(spec, rng, target, steps, cap) {
  var rows = generate(spec, rng);
  if (!rows) return null;
  var best = parOf(rows, cap);
  var stall = 0;

  for (var i = 0; i < steps; i++) {
    if (best >= target) break;
    var cand = mutate(rows, rng);
    var p = parOf(cand, cap);
    if (p > best || (p === best && p > 0 && rng.next() < 0.35)) {
      if (p > best) stall = 0;
      rows = cand;
      best = p;
    } else if (++stall > 60) {
      break;    // this basin has nothing more to give
    }
  }
  return best > 0 ? rows : null;
}

module.exports = {
  Rng: Rng,
  WALL: WALL, GOAL: GOAL, BLOCK: BLOCK, FLOOR: FLOOR,
  generate: generate,
  mutate: mutate,
  climb: climb,
  canonical: canonical,
  transform: transform,
  parOf: parOf,
  measure: measure,
  shapeOf: shapeOf,
  findInert: findInert,
  evaluate: evaluate,
  cellsOf: cellsOf,
  setCh: setCh,
  cloneBoard: cloneBoard
};
