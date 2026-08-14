'use strict';
/*
 * TILT — board generation and measurement.
 *
 * Shared by tools/forge.js (interactive search) and tools/campaign.js (builds
 * the campaign). Nothing here knows about the campaign layout; it only knows
 * how to make a board to a budget and how to tell whether that board is any
 * good.
 *
 * There are exactly three things to place — walls, blocks, goals — and the
 * budget for each is fixed before the search starts. Nothing here can invent a
 * new kind of element to make a board harder, because there is no such thing
 * to invent. Depth has to come from WHERE the three things go.
 *
 * That constraint is also why the search hill-climbs instead of merely
 * sampling. Boards that need twelve or fifty tilts are a vanishing fraction of
 * random layouts, but they are a short walk from ordinary ones: nudge a single
 * wall and a six-move board becomes a nine-move board. So the generator throws
 * a random board down, then keeps moving one element at a time until the
 * shortest solution lands in the band the caller asked for. The element budget
 * never grows — only the thinking does.
 *
 * "Any good", though, is emphatically NOT "long". Length is something a caller
 * REQUIRES; it is never what this file optimises, because optimising it
 * produces long corridors with one line through them and a corridor is not a
 * puzzle. What is measured and rewarded instead is the shape of the thinking a
 * board demands — see `shapeOf`, `greedyRun` and `openingTraps` below.
 *
 * The quality bar, cheapest test first:
 *
 *   compiles → not already solved → shortest solution inside the target band
 *   → low enough luck → not jammable → produces the required feeling →
 *   and finally: every single element is load-bearing.
 *
 * That last test is the expensive one and the one that matters. A board ships
 * only if deleting ANY wall, block or goal measurably changes the puzzle — and
 * on crowded boards, only if a fixed share of them change its LENGTH.
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

// ---------------------------------------------------------------------------
// how a board FEELS to play
// ---------------------------------------------------------------------------
//
// Length is not difficulty. A twenty-move board with one line through it is a
// corridor you find by trial and error, and finding a corridor is not the
// feeling this game is for. The feeling this game is for is:
//
//     "obvious" → try it → wrong → look again → oh. OH. → it all falls in
//
// Everything below exists to measure that, so the search can select for it
// instead of selecting for a big number.

/** Manhattan distance from a cell to the nearest goal — what a player eyeballs. */
function goalCells(stage) {
  var out = [];
  for (var y = 0; y < stage.h; y++) {
    for (var x = 0; x < stage.w; x++) if (stage.goal[y * stage.w + x]) out.push([x, y]);
  }
  return out;
}

function distSum(stage, goals, s) {
  var total = 0;
  for (var i = 0; i < s.pos.length; i++) {
    if (!s.alive[i]) continue;
    var best = Infinity;
    for (var g = 0; g < goals.length; g++) {
      var d = Math.abs(s.pos[i][0] - goals[g][0]) + Math.abs(s.pos[i][1] - goals[g][1]);
      if (d < best) best = d;
    }
    total += best;
  }
  return total;
}

/**
 * The player who is not thinking yet.
 *
 * Tilts toward the goal: collect if you can, otherwise close the distance. This
 * is the first thing anybody tries, and a board worth shipping should punish it
 * — either by taking far longer than it needs to, or by walking in a circle
 * forever.
 *
 * Returns { solved, moves } — moves is Infinity when greedy loops.
 */
function greedyRun(stage, limit) {
  var goals = goalCells(stage);
  var s = E.initialState(stage);
  var seen = Object.create(null);
  seen[E.stateKey(s)] = true;
  var moves = 0;
  var cap = limit || 400;

  while (moves < cap) {
    if (E.isClear(s)) return { solved: true, moves: moves };
    var best = null;
    for (var d = 0; d < 4; d++) {
      var r = E.simulate(stage, s, E.DIRS[d], { frames: false });
      if (!r.moved) continue;
      var got = r.state.collected - s.collected;
      // Collecting beats closing distance, exactly as a hurrying player would.
      var score = got * 1000 - distSum(stage, goals, r.state);
      if (!best || score > best.score) best = { score: score, state: r.state };
    }
    if (!best) return { solved: false, moves: Infinity };
    s = best.state;
    moves++;
    var key = E.stateKey(s);
    if (seen[key]) return { solved: false, moves: Infinity };   // walking in a circle
    seen[key] = true;
  }
  return { solved: false, moves: Infinity };
}

/**
 * What the optimal line actually asks of the player.
 *
 *   chain      most blocks collected by a single tilt
 *   chainLast  blocks collected by the FINAL tilt — the payoff
 *   setup      tilts played before the first block is collected
 *   retreat    tilts that move blocks FURTHER from the goal. This is the one
 *              that matters most: a board with no retreat can be solved by
 *              always heading for the exit, and a board with two or three
 *              cannot be solved without the "wrong way first" realisation.
 */
function shapeOf(stage, path) {
  var goals = goalCells(stage);
  var s = E.initialState(stage);
  var max = 0, last = 0, setup = path.length, retreat = 0;
  var before = distSum(stage, goals, s);

  for (var i = 0; i < path.length; i++) {
    var r = E.simulate(stage, s, path[i], { frames: false });
    var got = 0;
    for (var k = 0; k < r.events.length; k++) if (r.events[k].type === 'goal') got++;
    if (got > max) max = got;
    if (got && setup === path.length) setup = i;
    if (i === path.length - 1) last = got;

    // Compare like with like: a collected block leaves the sum, which is not a
    // retreat. Only count when the blocks still on the board got further away.
    var after = distSum(stage, goals, r.state);
    var survivors = distSum(stage, goals, { pos: s.pos, alive: r.state.alive });
    if (got === 0 && after > before) retreat++;
    else if (got > 0 && after > survivors) retreat++;

    before = after;
    s = r.state;
  }
  return { chain: max, chainLast: last, setup: setup, opening: setup, retreat: retreat };
}

/**
 * How much the first move matters.
 *
 * Of the tilts that do anything at all, how many fail to make progress? Three
 * out of four means the opening is a genuine decision rather than a formality —
 * and because nothing in this game can be destroyed, being wrong costs one tap
 * of undo, which is exactly the price a player should pay for exploring.
 */
function openingTraps(stage, par, cap) {
  var live = 0, traps = 0;
  for (var d = 0; d < 4; d++) {
    var ns = E.step(stage, E.initialState(stage), E.DIRS[d]);
    if (!ns) continue;
    live++;
    if (E.isClear(ns)) continue;
    var sol = E.solve(stage, ns, cap || 60000);
    if (!sol.solvable || sol.moves >= par) traps++;
  }
  return { live: live, traps: traps };
}

/**
 * The deletion test, run over every element on the board.
 *
 * Take one wall, block or goal away and ask what the puzzle lost:
 *
 *   breaks   it no longer compiles, or can no longer be solved  → load-bearing
 *   shifts   the shortest solution changes length               → load-bearing
 *   narrows  only the NUMBER of optimal lines changes           → it matters, but
 *            only a little
 *   inert    nothing measurable changes                         → delete it
 *
 * The split between `shifts` and `narrows` is the part that earns its keep on a
 * crowded board. On a nine-cell puzzle almost every wall changes the length, so
 * "no inert elements" is a real standard. On a twenty-five cell puzzle with
 * twelve blocks there are hundreds of optimal lines, the count moves if you
 * breathe on it, and "no inert elements" quietly becomes free. Counting how many
 * elements actually change the LENGTH keeps the standard honest at both sizes —
 * `minShift` is what stops a dense board from smuggling in decorative walls.
 */
function elementCensus(rows, par, ways, cap) {
  var out = { inert: null, breaks: 0, shifts: 0, narrows: 0, total: 0 };
  var h = rows.length, w = rows[0].length;

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ch = rows[y][x];
      if (ch === FLOOR) continue;
      out.total++;
      var label = (ch === WALL ? 'wall' : ch === GOAL ? 'goal' : 'block') + ' ' + x + ',' + y;
      var v = cloneBoard(rows);
      v[y] = setCh(v[y], x, FLOOR);

      var st;
      try { st = E.compile({ board: v }); } catch (e) { out.breaks++; continue; }
      if (E.isClear(E.initialState(st))) { out.breaks++; continue; }
      var m = measure(st, cap || 60000);
      if (!m) { out.breaks++; continue; }
      if (m.par !== par) { out.shifts++; continue; }
      if (m.ways !== ways) { out.narrows++; continue; }
      if (!out.inert) out.inert = label;
    }
  }
  return out;
}

/**
 * The label of the first element the board turns out not to need, or null if
 * every one of them is load-bearing. Kept as its own entry point because the
 * tools want the quick yes/no far more often than the full census.
 */
function findInert(rows, par, ways, cap) {
  return elementCensus(rows, par, ways, cap).inert;
}

// ---------------------------------------------------------------------------
// the full gate
// ---------------------------------------------------------------------------

/**
 * Returns a scored record, or null if the board fails any requirement.
 *
 * `filters` may set: par, ways, luck, maxDead, minStates, chain, chainLast,
 * setup, retreat, greedyGap, traps, loose, nodeCap.
 */
function evaluate(rows, filters, rng) {
  filters = filters || {};
  var stage;
  try { stage = E.compile({ board: rows }); } catch (e) { return null; }
  if (E.isClear(E.initialState(stage))) return null;

  var cap = filters.nodeCap || 60000;
  var m = measure(stage, cap);
  if (!m) return null;

  // Cheapest rejections first — par and luck cost nothing next to the solve
  // and deletion tests below.
  if (filters.par && (m.par < filters.par[0] || m.par > filters.par[1])) return null;
  if (filters.ways && (m.ways < filters.ways[0] || m.ways > filters.ways[1])) return null;
  if (filters.luck != null && m.luck > filters.luck) return null;
  if (filters.maxDead != null && m.dead > filters.maxDead) return null;
  if (filters.minStates && m.states < filters.minStates) return null;

  var sol = E.solve(stage, null, cap);
  var shape = shapeOf(stage, sol.path);
  if (filters.chain && shape.chain < filters.chain) return null;
  if (filters.chainLast && shape.chainLast < filters.chainLast) return null;
  if (filters.setup && shape.setup < filters.setup) return null;
  if (filters.retreat && shape.retreat < filters.retreat) return null;

  // Does the board survive the player who is not thinking yet?
  var greedy = greedyRun(stage, Math.max(200, m.par * 6));
  var greedyGap = greedy.solved ? greedy.moves - m.par : Infinity;
  if (filters.greedyGap != null && greedyGap < filters.greedyGap) return null;

  var open = openingTraps(stage, m.par, cap);
  if (filters.traps != null && open.traps < filters.traps) return null;

  var walls = cellsOf(rows, WALL).length;
  var goals = cellsOf(rows, GOAL).length;
  var blocks = cellsOf(rows, BLOCK).length;
  var elements = walls + goals + blocks;

  // Every element has to be doing work, and on a crowded board "doing work"
  // has to mean changing the LENGTH, not just jiggling the number of lines.
  var census = { shifts: 0, breaks: 0, narrows: 0, total: 0, inert: null };
  if (!filters.loose) {
    census = elementCensus(rows, m.par, m.ways, cap);
    if (census.inert) return null;
    var carrying = census.breaks + census.shifts;
    if (filters.minShift != null && carrying < filters.minShift * census.total) return null;
  }

  // What a GOOD board looks like, as a number.
  //
  // Note what is not here: par. Length is a slot requirement, filtered above,
  // not something to maximise — selecting on length is exactly what produced a
  // campaign of long corridors. What is rewarded instead is the shape of the
  // thinking: moves you would never try first (retreat), an opening that is a
  // real decision (traps), a naive run that goes badly wrong (greedyGap), a
  // long arrangement before any payoff (setup), and a finish that lands several
  // blocks at once (chainLast). Clutter is still taxed, because the board has
  // to look simple for any of that to land.
  var greedyScore = greedy.solved ? Math.min(greedyGap, 40) : 45;
  var score = shape.retreat * 26
    + open.traps * 16
    + greedyScore * 2.2
    + shape.setup * 1.6
    + (shape.chainLast > 1 ? shape.chainLast * 9 : 0)
    + (shape.chain > 1 ? shape.chain * 4 : 0)
    - elements * 3.5
    - m.ways * 7
    - m.luck * 900;

  return {
    board: rows, stage: stage, path: sol.path,
    par: m.par, ways: m.ways, luck: m.luck, states: m.states, dead: m.dead,
    chain: shape.chain, chainLast: shape.chainLast, setup: shape.setup,
    retreat: shape.retreat, traps: open.traps, liveOpenings: open.live,
    greedy: greedy.solved ? greedy.moves : -1, greedyGap: greedy.solved ? greedyGap : -1,
    walls: walls, goals: goals, blocks: blocks, elements: elements,
    shifts: census.breaks + census.shifts, narrows: census.narrows,
    score: score
  };
}

/**
 * Hill-climb one board until its shortest solution lands INSIDE a target band.
 *
 * Moves a single element at a time and keeps the change whenever the shortest
 * solution grows. Sideways moves are accepted too — a board often has to go
 * around a plateau before it can climb again — and the element budget is fixed
 * throughout, so the result is a board that got deeper without getting busier.
 *
 * The band, rather than a single target, is what makes this affordable. One
 * moved wall can add five moves at a stroke, so a climb that only knows "keep
 * going up" sails straight past a slot that wanted forty-three and hands back
 * fifty-one. Refusing any mutation that overshoots the ceiling, and stopping the
 * moment the floor is reached, turns most of those wasted climbs into usable
 * boards — on the longest slots that is the difference between a search that
 * finishes and one that does not.
 */
function climb(spec, rng, band, steps, cap) {
  var lo = band[0], hi = band[1];
  var rows = generate(spec, rng);
  if (!rows) return null;
  var best = parOf(rows, cap);
  if (best >= lo) return best <= hi ? rows : null;
  var stall = 0;

  for (var i = 0; i < steps; i++) {
    var cand = mutate(rows, rng);
    var p = parOf(cand, cap);
    if (p > hi) continue;                      // overshoots the slot — not useful
    if (p > best || (p === best && p > 0 && rng.next() < 0.35)) {
      if (p > best) stall = 0;
      rows = cand;
      best = p;
      if (best >= lo) return rows;             // landed in the band
    } else if (++stall > 80) {
      break;                                   // this basin has nothing more to give
    }
  }
  return best >= lo && best <= hi ? rows : null;
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
  greedyRun: greedyRun,
  openingTraps: openingTraps,
  goalCells: goalCells,
  findInert: findInert,
  elementCensus: elementCensus,
  evaluate: evaluate,
  cellsOf: cellsOf,
  setCh: setCh,
  cloneBoard: cloneBoard
};
