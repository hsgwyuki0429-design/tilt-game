'use strict';
/*
 * TILT — what makes a board GOOD.
 *
 * This file is the argument of the whole redesign, so it is worth stating the
 * position it replaces.
 *
 * The old generator asked "how long is the shortest solution?" and treated a
 * bigger answer as a better board. That is measurable, it is easy, and it is
 * wrong. A fifty-move board with one line through it is a corridor. The player
 * does not solve a corridor, they feel along it, and arriving at the end feels
 * like nothing because there was never a moment of SEEING anything.
 *
 * The number of solutions is no better as a target, in either direction. Ten
 * easy lines through a board is not richness, it is slack. One line through a
 * board is not rigour, it is a corridor again. Neither number knows anything
 * about the only thing that matters:
 *
 *     you look at it → every direction looks wrong → you look again →
 *     oh. OH. → you play it → all of it lands at once
 *
 * Everything below exists to measure THAT, so a search can select for it. The
 * four measurements that carry the file:
 *
 *   blindness   how far down the player's own list of instincts the correct
 *               move is sitting. Zero means the obvious move is the answer.
 *   unlock      how many moves of insight the board costs before it starts
 *               playing itself. This is the crux, and it is the single number
 *               this whole redesign is built around.
 *   flow        how much board is left AFTER the crux — the part that lands.
 *   jam         how much of the board is silently unwinnable. Not difficulty:
 *               unfairness. A stage is allowed to be brutal and is not allowed
 *               to be sly.
 *
 * A note on `unlock`, because it is the idea the rest hangs off.
 *
 * Model the player who has not seen it yet as someone who collects a block if
 * they can and otherwise tilts whichever way brings blocks nearest the goal —
 * the first thing anybody does, and the thing they keep doing until the board
 * refuses. Now ask a question no length metric can ask:
 *
 *     how many correct moves does that player need to be GIVEN before the
 *     rest of the board falls to them for free?
 *
 * If the answer is zero, the board has no idea in it. If the answer is "all of
 * them", every single move is its own separate fight and the board is a
 * corridor with extra steps. If the answer is one or two, then there is
 * exactly one thing to see, seeing it is the whole puzzle, and everything
 * after it is the reward for having seen it. That is the shape this game is
 * for, and now it is a number a search can hill-climb.
 */

var E = require('../../src/engine.js');

var WALL = '#', GOAL = 'o', BLOCK = '@', FLOOR = '.', HAZARD = 'x', PIN = '+';
var PIECES = '#ox+@ABab';   // everything that is not floor

function isBlockChar(ch) { return E.BLOCK_CHARS[ch] !== undefined; }
function isGoalChar(ch) { return E.GOAL_CHARS[ch] !== undefined; }

// ---------------------------------------------------------------------------
// board plumbing
// ---------------------------------------------------------------------------

function setCh(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }
function cloneBoard(rows) { return rows.slice(); }
function put(rows, c, ch) { rows[c[1]] = setCh(rows[c[1]], c[0], ch); }

function cellsOf(rows, ch) {
  var out = [];
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) if (rows[y][x] === ch) out.push([x, y]);
  }
  return out;
}

function countPieces(rows) {
  var n = { wall: 0, goal: 0, block: 0, hazard: 0, pin: 0, total: 0 };
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch === FLOOR) continue;
      n.total++;
      if (ch === WALL) n.wall++;
      else if (ch === HAZARD) n.hazard++;
      else if (ch === PIN) n.pin++;
      else if (isGoalChar(ch)) n.goal++;
      else if (isBlockChar(ch)) n.block++;
    }
  }
  return n;
}

/** Boards that differ only by rotation or reflection are one puzzle. */
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

/** Swap the two colours. Which one is called A is not a design decision. */
function recolour(rows) {
  return rows.map(function (r) {
    return r.replace(/[ABab]/g, function (ch) {
      return ch === 'A' ? 'B' : ch === 'B' ? 'A' : ch === 'a' ? 'b' : 'a';
    });
  });
}

/**
 * One name for one puzzle.
 *
 * Two boards that differ only by a rotation, a reflection, or by which colour
 * is called A are not two boards. Without the colour half of this, a campaign
 * will happily ship the same puzzle twice wearing different paint.
 */
function canonical(rows) {
  var best = null;
  var forms = [rows, recolour(rows)];
  for (var f = 0; f < forms.length; f++) {
    for (var k = 0; k < 8; k++) {
      var key = transform(forms[f], k).join('/');
      if (best === null || key < best) best = key;
    }
  }
  return best;
}

function compile(rows) {
  try { return E.compile({ board: rows }); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// graph facts
// ---------------------------------------------------------------------------

/**
 * Everything derivable from the reachable position graph, computed exactly.
 *
 *   par     shortest solution, in tilts
 *   ways    how many distinct par-length tilt sequences clear the board
 *   luck    chance that `par` uniformly random tilts happen to clear it — the
 *           probability the player wins without thinking at all
 *   states  how much board there is to think about
 *   jam     share of live positions that can no longer be cleared and show no
 *           sign of it. The unfair kind of dead end.
 *   loss    share of live positions that are dead because a block was visibly
 *           destroyed. The fair kind: the player watched it happen.
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

  // Distinct shortest lines. Nodes are in breadth-first order, so one forward
  // sweep is a correct dynamic program over the layers.
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
  // ends up on a cleared board.
  var p = new Float64Array(n);
  p[0] = 1;
  var luck = 0;
  for (var stepI = 0; stepI < par; stepI++) {
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

  // Which positions can still reach a cleared board? Walk backwards from every
  // clear node.
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

  // The split that matters. Both kinds of dead end cost one tap of undo, but
  // only one of them told the player anything.
  var jam = 0, loss = 0, live = 0;
  for (i = 0; i < n; i++) {
    if (g.clear[i]) continue;
    live++;
    if (alive[i]) continue;
    if (g.broken[i]) loss++; else jam++;
  }

  // Distance to a cleared board from every position, so the crux can walk
  // EVERY optimal line rather than one arbitrary one.
  var toClear = new Int32Array(n).fill(-1);
  var q2 = [], h2 = 0;
  for (i = 0; i < n; i++) if (g.clear[i]) { toClear[i] = 0; q2.push(i); }
  while (h2 < q2.length) {
    var c2 = q2[h2++];
    var pre2 = back[c2];
    for (k = 0; k < pre2.length; k++) {
      if (toClear[pre2[k]] < 0) { toClear[pre2[k]] = toClear[c2] + 1; q2.push(pre2[k]); }
    }
  }

  return {
    par: par,
    ways: Math.round(total),
    luck: luck,
    states: n,
    jam: live ? jam / live : 0,
    loss: live ? loss / live : 0,
    graph: g,
    toClear: toClear
  };
}

// ---------------------------------------------------------------------------
// the player who has not seen it yet
// ---------------------------------------------------------------------------

/** Goal cells, split by which colour of block each will actually take. */
function goalCells(stage) {
  var out = [];
  for (var y = 0; y < stage.h; y++) {
    for (var x = 0; x < stage.w; x++) {
      var i = y * stage.w + x;
      if (stage.goal[i]) out.push({ x: x, y: y, colour: stage.goalColour[i] });
    }
  }
  return out;
}

/** How far every live block is from a goal that would actually take it. */
function distSum(stage, goals, s) {
  var total = 0;
  for (var i = 0; i < s.pos.length; i++) {
    if (!s.alive[i]) continue;
    var c = stage.colour[i];
    var best = Infinity;
    for (var g = 0; g < goals.length; g++) {
      if (!E.accepts(goals[g].colour, c)) continue;
      var d = Math.abs(s.pos[i][0] - goals[g].x) + Math.abs(s.pos[i][1] - goals[g].y);
      if (d < best) best = d;
    }
    total += best === Infinity ? 0 : best;
  }
  return total;
}

/**
 * Times a block slides over a goal that would have taken it, and does not stop.
 *
 * This is the new rule made visible. Under "collected only at rest" a goal is
 * not a target you steer towards — aim at it and the block sails over the top
 * and into the far wall. A board where that can happen is a board that can
 * TEACH the rule, because the player does it once, watches the block go past
 * the hole, and never mistakes a goal for a target again.
 */
function overshootsIn(stage, res) {
  var n = 0;
  var frames = res.frames;
  if (!frames || frames.length < 2) return 0;
  var last = frames[frames.length - 1];
  for (var b = 0; b < stage.colour.length; b++) {
    if (!last.alive[b]) continue;                 // collected or destroyed: not an overshoot
    for (var t = 1; t < frames.length; t++) {
      if (!frames[t].alive[b]) break;
      var q = frames[t].pos[b], p = frames[t - 1].pos[b];
      if (q[0] === p[0] && q[1] === p[1]) continue;
      var i = q[1] * stage.w + q[0];
      if (!stage.goal[i] || !E.accepts(stage.goalColour[i], stage.colour[b])) continue;
      // It was ON a goal it fits at tick t. Did it stay there?
      if (last.pos[b][0] !== q[0] || last.pos[b][1] !== q[1]) n++;
    }
  }
  return n;
}

/**
 * How attractive a tilt LOOKS, before any thinking.
 *
 * Collecting beats everything; otherwise, closer to the exit is better. This is
 * not a good heuristic and is not meant to be — it is a model of the player's
 * first instinct, and the boards worth shipping are exactly the ones it fails
 * on. Losing a block is scored as catastrophic because the player can see it
 * happen and would never choose it twice.
 */
function appealOf(stage, goals, s, dir) {
  var r = E.simulate(stage, s, dir, { frames: false });
  if (!r.moved) return null;
  var got = r.state.collected - s.collected;
  var died = (r.state.lost || 0) - (s.lost || 0);
  return {
    dir: dir,
    state: r.state,
    got: got,
    appeal: got * 1000 - distSum(stage, goals, r.state) - died * 10000
  };
}

/**
 * Run that player until they win, loop, or run out of patience.
 * Returns { solved, moves } — moves is Infinity when they never get there.
 */
function naiveRun(stage, from, limit) {
  var goals = goalCells(stage);
  var key = E.makeStateKey(stage);
  var s = from ? E.cloneState(from) : E.initialState(stage);
  var seen = Object.create(null);
  seen[key(s)] = true;
  var moves = 0;
  var cap = limit || 400;

  while (moves < cap) {
    if (E.isClear(s)) return { solved: true, moves: moves };
    if (E.isBroken(s)) return { solved: false, moves: Infinity };
    var best = null;
    for (var d = 0; d < 4; d++) {
      var a = appealOf(stage, goals, s, E.DIRS[d]);
      if (!a) continue;
      if (!best || a.appeal > best.appeal) best = a;
    }
    if (!best) return { solved: false, moves: Infinity };
    s = best.state;
    moves++;
    var k = key(s);
    if (seen[k]) return { solved: false, moves: Infinity };   // walking in a circle
    seen[k] = true;
  }
  return { solved: false, moves: Infinity };
}

// ---------------------------------------------------------------------------
// the opening — "every direction looks wrong"
// ---------------------------------------------------------------------------

/**
 * What the four tilts offer at the start, and how badly instinct is misled.
 *
 *   live       tilts that do anything at all
 *   traps      tilts that do something and lose time doing it
 *   blindness  where the best CORRECT tilt sits in the player's own order of
 *              preference. 0 means their first instinct is right and the board
 *              has nothing to say. 2 or 3 means every appealing move is a lie
 *              and the answer is the move that looks like a waste of time —
 *              which is the moment this game exists to sell.
 *   bait       an appealing tilt that COLLECTS a block and is still wrong. The
 *              cruellest and best trap in the game: progress you have to
 *              refuse.
 */
function openings(stage, par, cap) {
  var goals = goalCells(stage);
  var s0 = E.initialState(stage);
  var scored = [];
  for (var d = 0; d < 4; d++) {
    var a = appealOf(stage, goals, s0, E.DIRS[d]);
    if (!a) continue;
    var optimal, solvable;
    if (E.isClear(a.state)) { optimal = par === 1; solvable = true; }
    else {
      var sol = E.solve(stage, a.state, cap || 60000);
      solvable = sol.solvable;
      optimal = sol.solvable && sol.moves === par - 1;
    }
    var over = overshootsIn(stage, E.simulate(stage, s0, a.dir));
    scored.push({
      dir: a.dir, appeal: a.appeal, got: a.got,
      optimal: optimal, solvable: solvable, overshoot: over
    });
  }
  if (!scored.length) return null;

  scored.sort(function (p, q) { return q.appeal - p.appeal; });

  var blindness = -1, traps = 0, bait = 0, overshoot = 0;
  for (var i = 0; i < scored.length; i++) {
    if (scored[i].optimal && blindness < 0) blindness = i;
    if (scored[i].overshoot) overshoot++;
    if (!scored[i].optimal) {
      traps++;
      if (scored[i].got > 0) bait++;
    }
  }
  return {
    live: scored.length,
    traps: traps,
    bait: bait,
    overshoot: overshoot,
    blindness: blindness < 0 ? 0 : blindness,
    order: scored
  };
}

// ---------------------------------------------------------------------------
// the crux
// ---------------------------------------------------------------------------

/**
 * How many moves of insight the board costs.
 *
 * Walk the optimal line. After each prefix, hand the board to the player who
 * has not seen it yet and ask whether they can finish from there. The first
 * depth at which they can is where the puzzle stops being a puzzle.
 *
 *   unlock  that depth. 1 means a single move is the whole idea.
 *   flow    par - unlock: how much stage is left to enjoy having seen it.
 *   clean   whether, once unlocked, the naive player finishes OPTIMALLY —
 *           the difference between "now it works" and "now it is obvious".
 *
 * `unlock === 0` means the naive player solves it cold: the board contains no
 * idea and no amount of length will put one there. That is the single most
 * important rejection this file makes.
 */
function crux(stage, m) {
  var par = m.par, g = m.graph, toClear = m.toClear;
  var patience = Math.max(200, par * 8);

  var first = naiveRun(stage, null, patience);
  if (first.solved) return { unlock: 0, flow: par, clean: true, naive: first.moves };

  // Sweep the optimal lines LEVEL BY LEVEL. `unlock` has to be the smallest
  // number of correct moves that works on ANY optimal line — taking the first
  // line the solver happened to return would report a board as deeper than it
  // is, purely because of which direction the search tried first.
  var layer = [0];
  var seen = Object.create(null);
  seen[0] = 1;

  for (var depth = 1; depth <= par; depth++) {
    var nextLayer = [];
    for (var i = 0; i < layer.length; i++) {
      for (var d = 0; d < 4; d++) {
        var j = g.next[layer[i]][d];
        if (j === layer[i]) continue;
        if (toClear[j] !== toClear[layer[i]] - 1) continue;   // not an optimal move
        if (seen[j]) continue;
        seen[j] = 1;
        nextLayer.push(j);
      }
    }
    if (!nextLayer.length) break;

    for (i = 0; i < nextLayer.length; i++) {
      var node = nextLayer[i];
      if (g.clear[node]) return { unlock: depth, flow: par - depth, clean: true, naive: Infinity };
      var run = naiveRun(stage, g.states[node], patience);
      if (run.solved) {
        return {
          unlock: depth,
          flow: par - depth,
          clean: run.moves === par - depth,
          naive: Infinity
        };
      }
    }
    layer = nextLayer;
  }

  // Never unlocks: every single move has to be found on its own. That is a
  // corridor, and a long one is still a corridor.
  return { unlock: par, flow: 0, clean: false, naive: Infinity };
}

// ---------------------------------------------------------------------------
// the shape of the solution
// ---------------------------------------------------------------------------

/**
 * What the optimal line actually asks of the player, move by move.
 *
 *   retreat    tilts that send blocks FURTHER from the exit. A board with none
 *              can be solved by always heading for the door.
 *   setup      tilts spent before anything at all is collected.
 *   chain      most blocks collected by one tilt
 *   chainLast  blocks collected by the FINAL tilt — the payoff landing at once
 *   cascade    most blocks set in motion by one tilt: "one move, many results"
 *   travel     mean cells of movement per tilt — how much the board rearranges
 *   indirect   the first block collected is NOT the one that started nearest a
 *              goal. The "move the other one first" shape, as a flag.
 *   crossings  times a block slides straight over a hazard and lives. This is
 *              the entire justification for hazards existing: not a region
 *              avoided, a region used.
 *   caught     collections where the thing that stopped the block on the goal
 *              was ANOTHER BLOCK rather than a wall or the board edge. Since a
 *              block is only collected if it comes to a complete stop, every
 *              goal needs a buffer one cell beyond it; when the terrain does
 *              not supply one the player has to build it out of a block they
 *              have not collected yet. That is the signature move of this rule
 *              set and the thing worth selecting for.
 *   refused    times a block comes to REST on a goal that will not take its
 *              colour. The entire justification for colours: it is sitting in
 *              the socket, it is not going anywhere, and it is still a wall.
 */
function lineShape(stage, path) {
  var goals = goalCells(stage);
  var s = E.initialState(stage);
  var max = 0, last = 0, setup = path.length, retreat = 0, cascade = 0;
  var travel = 0, crossings = 0, refused = 0, caught = 0, lastMovers = 0, lastTravel = 0;
  var before = distSum(stage, goals, s);
  var firstCollected = -1;

  for (var i = 0; i < path.length; i++) {
    var r = E.simulate(stage, s, path[i]);
    var got = 0, k;
    for (k = 0; k < r.events.length; k++) {
      if (r.events[k].type === 'goal') {
        got++;
        if (firstCollected < 0) firstCollected = r.events[k].block;
      }
    }
    if (got > max) max = got;
    if (got && setup === path.length) setup = i;
    if (i === path.length - 1) last = got;

    // How much of the board actually moved, and how far.
    var movers = 0, cells = 0;
    for (var b = 0; b < s.pos.length; b++) {
      if (!s.alive[b]) continue;
      var d = walkOf(r.frames, b);
      if (d > 0) { movers++; cells += d; }
      crossings += hazardCrossings(stage, r.frames, b);
    }
    caught += caughtByBlock(stage, r, path[i]);
    refused += goalRefusals(stage, r.state);
    if (movers > cascade) cascade = movers;
    travel += cells;
    if (i === path.length - 1) { lastMovers = movers; lastTravel = cells; }

    // Compare like with like: a collected block leaves the sum, which is not a
    // retreat. Only count when the blocks still on the board got further away.
    var after = distSum(stage, goals, r.state);
    var survivors = distSum(stage, goals, { pos: s.pos, alive: r.state.alive });
    if (got === 0 && after > before) retreat++;
    else if (got > 0 && after > survivors) retreat++;

    before = after;
    s = r.state;
  }

  // Which block began closest to a goal that would take it?
  var s0 = E.initialState(stage);
  var nearest = -1, nearestD = Infinity;
  for (var j = 0; j < s0.pos.length; j++) {
    var c = stage.colour[j];
    for (var g = 0; g < goals.length; g++) {
      if (!E.accepts(goals[g].colour, c)) continue;
      var dd = Math.abs(s0.pos[j][0] - goals[g].x) + Math.abs(s0.pos[j][1] - goals[g].y);
      if (dd < nearestD) { nearestD = dd; nearest = j; }
    }
  }

  return {
    chain: max, chainLast: last, setup: setup, retreat: retreat,
    cascade: cascade, travel: path.length ? travel / path.length : 0,
    lastMovers: lastMovers, lastTravel: lastTravel,
    ratchet: ratchetOf(path),
    indirect: firstCollected >= 0 && nearest >= 0 && firstCollected !== nearest ? 1 : 0,
    crossings: crossings, refused: refused, caught: caught
  };
}

/**
 * The longest stretch of the solution that uses only two directions.
 *
 * A board can have a perfect crux — one move to find, everything after it free
 * — and still be a chore, because "everything after it" turns out to be
 * L U L U L U L U. The idea took one move; the execution took eight, and eight
 * taps of a two-stroke ratchet is not a reward for having seen anything.
 *
 * No other measurement here notices that. `unlock` is 1 and `flow` is 8, which
 * is the ideal shape by every number the file had before this one. So the tail
 * has to be measured on its own: how much of the solution is a pump handle.
 */
function ratchetOf(path) {
  var best = 0;
  for (var i = 0; i < path.length; i++) {
    var seen = {}, distinct = 0;
    for (var j = i; j < path.length; j++) {
      if (!seen[path[j]]) { seen[path[j]] = 1; distinct++; }
      if (distinct > 2) break;
      if (j - i + 1 > best) best = j - i + 1;
    }
  }
  return best;
}

/** Total cells block b travelled across a set of tick frames. */
function walkOf(frames, b) {
  var d = 0;
  for (var t = 1; t < frames.length; t++) {
    if (!frames[t - 1].alive[b]) break;
    var p = frames[t - 1].pos[b], c = frames[t].pos[b];
    d += Math.abs(c[0] - p[0]) + Math.abs(c[1] - p[1]);
  }
  return d;
}

/**
 * Collections where another block, rather than the terrain, was the buffer.
 *
 * A block is only collected if it STOPS on the goal, so something has to be
 * standing one cell beyond it. When that something is a wall or the board edge
 * the goal is self-serving and the player only has to aim. When it is another
 * block, the player had to put it there first — and had to not collect it —
 * which is where the thinking lives under this rule.
 */
function caughtByBlock(stage, res, dir) {
  var dv = E.DV[dir], n = 0;
  for (var e = 0; e < res.events.length; e++) {
    var ev = res.events[e];
    if (ev.type !== 'goal') continue;
    // The settled frame in which the block was still standing on the goal.
    var f = res.frames[ev.t - 1];
    if (!f) continue;
    var bx = ev.cell[0] + dv[0], by = ev.cell[1] + dv[1];
    if (bx < 0 || by < 0 || bx >= stage.w || by >= stage.h) continue;   // the edge
    if (stage.terrain[by * stage.w + bx] === E.WALL) continue;          // a wall
    for (var b = 0; b < f.pos.length; b++) {
      if (f.alive[b] && f.pos[b][0] === bx && f.pos[b][1] === by) { n++; break; }
    }
  }
  return n;
}

/** Times block b passed over a hazard cell without being left on it. */
function hazardCrossings(stage, frames, b) {
  if (!stage.rules.hazard) return 0;
  var n = 0;
  for (var t = 1; t < frames.length; t++) {
    if (!frames[t].alive[b]) break;
    var c = frames[t].pos[b], p = frames[t - 1].pos[b];
    if (c[0] === p[0] && c[1] === p[1]) continue;
    if (stage.terrain[c[1] * stage.w + c[0]] !== E.HAZARD) continue;
    // Only a crossing if it did not end its slide there.
    if (t < frames.length - 1 && frames[frames.length - 1].alive[b]) {
      var end = frames[frames.length - 1].pos[b];
      if (end[0] !== c[0] || end[1] !== c[1]) n++;
    }
  }
  return n;
}

/**
 * Blocks left sitting in a socket that will not take them.
 *
 * Under this rule set a block is only collected if it comes to rest on a goal,
 * so the interesting colour moment is no longer a block rolling past a socket —
 * everything rolls past every socket. It is a block that STOPPED in one and
 * stayed: parked in the hole, not collected, and still in the way.
 */
function goalRefusals(stage, state) {
  if (!stage.rules.colour) return 0;
  var n = 0;
  for (var b = 0; b < state.pos.length; b++) {
    if (!state.alive[b]) continue;
    var i = state.pos[b][1] * stage.w + state.pos[b][0];
    if (stage.goal[i] && !E.accepts(stage.goalColour[i], stage.colour[b])) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// every piece has to be load-bearing
// ---------------------------------------------------------------------------

/**
 * Delete one piece at a time and ask what the puzzle lost.
 *
 *   breaks   it no longer compiles or can no longer be solved  → load-bearing
 *   shifts   the shortest solution changes length              → load-bearing
 *   narrows  only the NUMBER of optimal lines changed          → weakly useful
 *   inert    nothing measurable changed                        → delete it
 *
 * A wall nobody would miss is not decoration, it is a lie about where the
 * difficulty lives, and on a nine-cell board there is nowhere for it to hide.
 */
function census(rows, par, ways, cap) {
  var out = { inert: null, breaks: 0, shifts: 0, narrows: 0, total: 0 };
  var h = rows.length, w = rows[0].length;

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ch = rows[y][x];
      if (ch === FLOOR) continue;
      out.total++;
      var label = ch + '@' + x + ',' + y;
      var v = cloneBoard(rows);
      v[y] = setCh(v[y], x, FLOOR);

      var st = compile(v);
      if (!st) { out.breaks++; continue; }
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

// ---------------------------------------------------------------------------
// the profile — everything, plus a scorecard
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Map a value through a soft ramp to 0..10. */
function ramp(v, at0, at10) {
  if (at10 === at0) return v >= at10 ? 10 : 0;
  return clamp(((v - at0) / (at10 - at0)) * 10, 0, 10);
}

/**
 * The ten axes, each 0–10, each one an honest reading of a measured quantity.
 *
 * There is deliberately no single total. A board that is 10 for Surprise and 2
 * for Fairness is not "a 6" — it is a board that cheats, and averaging would
 * hide that. The campaign sets a floor per axis instead, so a stage has to be
 * at least decent at everything and outstanding at the thing it was built for.
 */
function scorecard(p) {
  var cells = p.w * p.h;
  var s = {};

  // Can you tell what you are looking at? Small board, few pieces, few rules.
  s.clarity = clamp(
    10 - (p.rulesUsed - 1) * 2.2 - Math.max(0, cells - 9) * 0.16 - Math.max(0, p.pieces.total - 6) * 0.5,
    0, 10);

  // Is there something to find? The naive player has to fail, and the board has
  // to be big enough in thought to have somewhere to hide an answer.
  s.discovery = clamp(
    (p.naiveSolved ? 0 : 5) + ramp(p.traps, 0, 3) * 0.3 + ramp(p.states, 6, 60) * 0.2,
    0, 10);

  // Is the answer a thing you SEE, or a thing you grind out? One or two moves
  // of insight opening a long tail is the ideal; needing insight at every step
  // is a corridor and scores badly however long it is.
  s.insight = p.unlock === 0 ? 0 : clamp(
    8.5 - Math.abs(p.unlock - 1.5) * 2 + Math.min(p.flow, 6) * 0.42,
    0, 10);

  // Does it surprise you? The correct move sitting at the bottom of your own
  // list of instincts, moves that go the wrong way, progress you must refuse.
  s.surprise = clamp(
    ramp(p.blindness, 0, 3) * 0.5 + ramp(p.retreat, 0, 3) * 0.3 + (p.bait ? 2.5 : 0) +
    (p.indirect ? 1.2 : 0),
    0, 10);

  // Do you have to see ahead? Long slides, several blocks moving at once, a
  // stretch of board arranged before anything is collected.
  s.prediction = clamp(
    ramp(p.travel, 1, 5) * 0.4 + ramp(p.cascade, 1, 4) * 0.3 + ramp(p.setup, 0, 4) * 0.3,
    0, 10);

  // Is it made of few things doing a lot? Depth per piece, and no piece the
  // board would not miss.
  s.elegance = clamp(
    ramp(p.par / Math.max(1, p.pieces.total), 0.3, 1.6) * 0.7 +
    ramp(p.loadBearing, 0.5, 1) * 0.3 - (p.inert ? 6 : 0),
    0, 10);

  // How much thinking per square. This is the whole case for a 3×3 board:
  // nine cells are not a beginner's board, they are a board where every cell
  // has to be carrying something.
  s.density = clamp(ramp(p.states / cells, 0.5, 6) * 0.7 + ramp(p.par / cells, 0.2, 1.2) * 0.3, 0, 10);

  // Can the player always understand what happened to them? Silent dead ends
  // and winning by accident are the two ways a board cheats.
  s.fairness = clamp(10 - p.jam * 14 - p.luck * 60 - (p.rulesUsed > 2 ? 2 : 0), 0, 10);

  // Does playing it out feel good?
  //
  // The first draft of this axis was chainLast alone plus flow, and it gave
  // almost every stage in the game the identical score — because on a small
  // board the last tilt usually collects exactly one block, and then only flow
  // was moving. What actually distinguishes a finish that lands from one that
  // dribbles out is how much of the board is still MOVING at the end: a final
  // tilt that sends four blocks across the board and banks the last one feels
  // nothing like a final tilt that nudges one block one cell.
  // Note what is NOT rewarded here, after two attempts that were: "how many
  // blocks are moving on the final tilt". A TILT board is nearly empty by the
  // time it is won — the win condition is that every block has gone — so
  // asking for a crowded finish is asking for something the rules make
  // impossible, and it scored every stage in the game identically. What is
  // left is the three things that genuinely separate a finish that lands from
  // one that dribbles out: several blocks home at once, a last block that
  // crosses the board rather than nudging one cell, and a long stretch of
  // stage that played itself once the idea was seen.
  s.satisfaction = clamp(
    2 +
    ramp(p.chainLast, 1, 3) * 0.35 +
    ramp(p.lastTravel, 1, 5) * 0.2 +
    ramp(p.chain, 1, 3) * 0.1 +
    ramp(p.flow, 0, 8) * 0.35
    // …minus the pump handle. A tail that is one pair of directions repeated is
    // not the reward for seeing the idea, it is the bill for it.
    - Math.max(0, p.pump - 0.4) * 11,
    0, 10);

  // Would you play it again, or show it to somebody? A line you can hold in
  // your head, that is not the line you first tried.
  s.replay = clamp(
    ramp(p.par, 2, 12) * 0.35 + (p.ways >= 1 && p.ways <= 4 ? 3.5 : 1) +
    ramp(p.blindness, 0, 3) * 0.3,
    0, 10);

  for (var k in s) s[k] = Math.round(s[k] * 10) / 10;
  return s;
}

/**
 * Full analysis of one board.
 *
 * `opts.quick` skips the deletion census, which is by far the most expensive
 * part and only matters once a board is a serious candidate.
 */
function profile(rows, opts) {
  opts = opts || {};
  var cap = opts.cap || 60000;

  var stage = compile(rows);
  if (!stage) return null;
  var s0 = E.initialState(stage);
  if (E.isClear(s0)) return null;

  var m = measure(stage, cap);
  if (!m) return null;

  var sol = E.solve(stage, null, cap);
  if (!sol.solvable) return null;

  var shape = lineShape(stage, sol.path);
  var open = openings(stage, m.par, cap);
  if (!open) return null;
  var cx = crux(stage, m);
  var naive = naiveRun(stage, null, Math.max(200, m.par * 8));
  var pieces = countPieces(rows);
  var rulesUsed = 1 + (stage.rules.hazard ? 1 : 0) + (stage.rules.colour ? 1 : 0) +
                  (stage.rules.pin ? 1 : 0);

  var cen = { inert: null, breaks: 0, shifts: 0, narrows: 0, total: pieces.total };
  if (!opts.quick) cen = census(rows, m.par, m.ways, cap);
  var loadBearing = cen.total ? (cen.breaks + cen.shifts) / cen.total : 0;

  var p = {
    board: rows,
    stage: stage,
    path: sol.path,
    w: stage.w, h: stage.h,
    par: m.par, ways: m.ways, luck: m.luck, states: m.states,
    jam: m.jam, loss: m.loss,
    pieces: pieces, rulesUsed: rulesUsed,
    hazard: stage.rules.hazard, colour: stage.rules.colour, pin: stage.rules.pin,
    traps: open.traps, bait: open.bait, blindness: open.blindness, live: open.live,
    overshoot: open.overshoot,
    unlock: cx.unlock, flow: cx.flow, cleanFlow: cx.clean,
    naiveSolved: naive.solved, naiveMoves: naive.solved ? naive.moves : -1,
    chain: shape.chain, chainLast: shape.chainLast, setup: shape.setup,
    retreat: shape.retreat, cascade: shape.cascade, travel: shape.travel,
    indirect: shape.indirect, crossings: shape.crossings, refused: shape.refused,
    caught: shape.caught,
    lastMovers: shape.lastMovers, lastTravel: shape.lastTravel,
    ratchet: shape.ratchet,
    // How much of the LONG part of the solution is a two-direction run. A run
    // of two or three tilts is never a pump handle — every short solution has
    // one and it costs nothing to play. A run of eight is the whole stage.
    pump: Math.max(0, shape.ratchet - 3) / Math.max(1, m.par - 3),
    inert: cen.inert, loadBearing: loadBearing, census: cen
  };
  p.score = scorecard(p);
  return p;
}

/**
 * A one-line summary of what a board actually is, for the tools to print.
 */
function summarise(p) {
  return 'par ' + p.par +
    ' · unlock ' + p.unlock + '/flow ' + p.flow +
    ' · blind ' + p.blindness +
    ' · traps ' + p.traps + '/' + p.live +
    ' · retreat ' + p.retreat +
    ' · ways ' + p.ways +
    ' · states ' + p.states +
    (p.pump > 0.4 ? ' · pump ' + p.ratchet + '/' + p.par : '') +
    ' · jam ' + (p.jam * 100).toFixed(0) + '%' +
    ' · loss ' + (p.loss * 100).toFixed(0) + '%' +
    ' · luck ' + (p.luck * 100).toFixed(1) + '%';
}

module.exports = {
  WALL: WALL, GOAL: GOAL, BLOCK: BLOCK, FLOOR: FLOOR, HAZARD: HAZARD, PIN: PIN, PIECES: PIECES,
  setCh: setCh, put: put, cloneBoard: cloneBoard, cellsOf: cellsOf, countPieces: countPieces,
  transform: transform, canonical: canonical, recolour: recolour, compile: compile,
  measure: measure, goalCells: goalCells, distSum: distSum,
  naiveRun: naiveRun, openings: openings, crux: crux, lineShape: lineShape,
  census: census, profile: profile, scorecard: scorecard, summarise: summarise,
  isBlockChar: isBlockChar, isGoalChar: isGoalChar
};
