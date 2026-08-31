'use strict';
/*
 * TILT — what a board actually asks of the player.
 *
 *   var A = require('./tools/lib/level-analysis.js');
 *   A.analyzeLevel(['A..#', '....', '.b.B', 'a...']);
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 *
 * tools/level-search.js answers "how long is this board". That is the wrong
 * question to pick a level with, and the campaign it built shows it: a board is
 * kept for being fifty moves long whether those fifty moves are a discovery or
 * a corridor. Length is a *side effect* of a good puzzle, never the reason it
 * is good.
 *
 * This module answers a different question — what happens while you solve it —
 * and it answers it exactly rather than by estimate. Everything below is read
 * off the reachable position graph that src/engine.js builds, so the par it
 * reports is the par the player will meet, the dead ends it counts are dead
 * ends, and no board is ever simulated by anything but the shipping engine.
 *
 * The measurements are exact. The SCORES built on them (tools/lib/fun-score.js)
 * are estimates, and they are named so you can tell: `ahaPotential`, not
 * `ahaScore`. A number here is a reason to go and play a board, never a verdict
 * on it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE GRAPH EVERYTHING COMES FROM
 * ---------------------------------------------------------------------------
 *
 * `E.graph(stage)` gives every position reachable from the opening, the four
 * moves out of each, and each one's distance FROM the opening. One backward BFS
 * from the cleared positions adds each one's distance TO a win, and with both
 * numbers in hand almost every question is arithmetic:
 *
 *   par                 toWin[start]
 *   on the best line    dist[i] + toWin[i] === par
 *   a dead end          toWin[i] is Infinity
 *   an optimal move     toWin[next] === toWin[i] - 1
 *   a recoverable slip  toWin[next] is finite but not that
 *
 * The per-move detail — what braked what, what slid over its own aurora — comes
 * from replaying the move through `E.simulate` with frames on, which is the
 * same code the animation uses.
 */

var E = require('../../src/engine.js');
var K = require('./board-keys.js');
var SCORE = require('./fun-score.js');

var DIRS = E.DIRS;                                   // ['U','R','D','L'] clockwise
var GRAPH_CAP = 40000;                               // a 5×5 with two penguins is ≤ 676

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function countChar(flat, re) { var m = flat.match(re); return m ? m.length : 0; }

/** The cell of the aurora that accepts a colour, or -1. */
function goalOfColour(stage, colour) {
  for (var i = 0; i < stage.goalCells.length; i++) {
    if (stage.goalColour[stage.goalCells[i]] === colour) return stage.goalCells[i];
  }
  return -1;
}

/**
 * The naive read of a position: how far every penguin still is from its own
 * aurora, in steps, ignoring everything in the way.
 *
 * This is deliberately the WRONG model of the game — a penguin does not walk,
 * it slides until something stops it — and that is exactly what makes it
 * useful. A move the naive read hates and the solver needs is the move a player
 * has to see past, which is what an "aha" is made of.
 */
function naiveDistance(stage, st, goals) {
  var total = 0;
  for (var i = 0; i < st.pos.length; i++) {
    if (!st.alive[i]) continue;
    var g = goals[i];
    if (g < 0) continue;                              // a drifter has no aurora
    total += Math.abs(st.pos[i][0] - (g % stage.w)) + Math.abs(st.pos[i][1] - ((g / stage.w) | 0));
  }
  return total;
}

function perPenguinDistance(stage, st, goals) {
  var out = [];
  for (var i = 0; i < st.pos.length; i++) {
    if (goals[i] < 0) { out.push(0); continue; }
    if (!st.alive[i]) { out.push(0); continue; }
    out.push(Math.abs(st.pos[i][0] - (goals[i] % stage.w)) +
             Math.abs(st.pos[i][1] - ((goals[i] / stage.w) | 0)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// distance to a win
// ---------------------------------------------------------------------------
/**
 * One multi-source backward BFS from every cleared position.
 *
 * This is the same trick tools/level-search.js uses to price a whole layout at
 * once, applied to one board: after it, every reachable position knows how many
 * moves it is from a win, and Infinity means it is never getting one.
 */
function distanceToWin(g) {
  var n = g.n, i, d;
  var toWin = new Array(n);
  for (i = 0; i < n; i++) toWin[i] = Infinity;

  var rev = new Array(n);
  for (i = 0; i < n; i++) rev[i] = [];
  for (i = 0; i < n; i++) {
    for (d = 0; d < 4; d++) {
      var j = g.next[i][d];
      if (j !== i) rev[j].push(i);                    // a no-op is not an edge
    }
  }

  var queue = [];
  for (i = 0; i < n; i++) if (g.clear[i]) { toWin[i] = 0; queue.push(i); }
  for (var head = 0; head < queue.length; head++) {
    var cur = queue[head], step = toWin[cur] + 1, list = rev[cur];
    for (var q = 0; q < list.length; q++) {
      var pre = list[q];
      if (toWin[pre] !== Infinity) continue;
      toWin[pre] = step;
      queue.push(pre);
    }
  }
  return toWin;
}

/**
 * A position written out as a board, in whichever of its sixteen presentations
 * sorts first. Two positions that are the same up to turning the tray round or
 * renaming the colours produce the same string.
 */
function positionCanon(stage, st) {
  var cells = new Array(stage.w * stage.h), c, i;
  for (c = 0; c < cells.length; c++) {
    cells[c] = stage.terrain[c] === E.WALL ? '#'
      : stage.terrain[c] === E.HAZARD ? 'x'
      : stage.goal[c] ? (stage.goalColour[c] === 1 ? 'a' : 'b') : '.';
  }
  for (i = 0; i < st.pos.length; i++) {
    if (!st.alive[i]) continue;
    c = st.pos[i][1] * stage.w + st.pos[i][0];
    cells[c] = stage.colour[i] === 1 ? 'A' : stage.colour[i] === 2 ? 'B' : 'G';
  }
  return K.canonFlat(cells.join('')) + '~' + st.collected;
}

/**
 * One shortest solution, picked the same way whichever way up the board is.
 *
 * "First direction in U,R,D,L" is deterministic but not invariant: rotate the
 * tray and U,R,D,L points at different walls, so a board with two equally short
 * answers hands back a different one for each of its sixteen presentations —
 * and every per-move number below it, the solution fingerprint included, moves
 * with it. When exactly one move is optimal there is nothing to choose and the
 * cheap path is taken; only a genuine tie pays for a canonical key, and the key
 * it compares is invariant under rotation, reflection and colour swap, so the
 * same solution comes back every time.
 */
function bestPath(stage, g, toWin) {
  if (toWin[0] === Infinity) return null;
  var path = [], states = [0], at = 0, guard = toWin[0] + 2;
  while (toWin[at] > 0 && guard-- > 0) {
    var options = [];
    for (var d = 0; d < 4; d++) {
      var j = g.next[at][d];
      if (j !== at && toWin[j] === toWin[at] - 1) options.push(d);
    }
    if (!options.length) break;
    var pick = options[0];
    if (options.length > 1) {
      var bestKey = null;
      options.forEach(function (d2) {
        var key = positionCanon(stage, g.states[g.next[at][d2]]);
        if (bestKey === null || key < bestKey) { bestKey = key; pick = d2; }
      });
    }
    path.push(DIRS[pick]);
    at = g.next[at][pick];
    states.push(at);
  }
  return { dirs: path, states: states };
}

// ---------------------------------------------------------------------------
// what one tilt did
// ---------------------------------------------------------------------------
/**
 * Replay a move through the shipping engine and read the mechanics off it.
 *
 *   touched      every cell any block was in at any point during the slide,
 *                which is what "the board actually uses this cell" means
 *   brakes       a block MOVED and then stopped, and the thing it stopped
 *                against was another block rather than a wall or the edge
 *   braked       the same, against a wall or cracked ice — which marks that
 *                wall as one the puzzle is using
 *   passedGoal   a block slid over its own aurora and did not stop on it, so
 *                it was not collected. Rule 3 of the game, made countable.
 *
 * A block that never moved is not "braked" by anything: nothing stopped it this
 * turn, it was already still.
 */
function slideDetail(stage, st, dir) {
  var r = E.simulate(stage, st, dir, { frames: true });
  var frames = r.frames, n = st.pos.length;
  var dv = E.DV[dir], dx = dv[0], dy = dv[1];
  var w = stage.w, h = stage.h;
  var touched = Object.create(null), wallsUsed = Object.create(null);
  var brakes = [], passedGoal = [], moved = [];
  var i, t;

  for (t = 0; t < frames.length; t++) {
    for (i = 0; i < n; i++) {
      if (frames[t].alive[i]) touched[frames[t].pos[i][1] * w + frames[t].pos[i][0]] = 1;
    }
  }

  for (i = 0; i < n; i++) {
    var everMoved = false;
    for (t = 1; t < frames.length; t++) {
      if (!frames[t].alive[i] || !frames[t - 1].alive[i]) continue;
      var a = frames[t - 1].pos[i], b = frames[t].pos[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      everMoved = true;
      // Did it come to rest here, or is it still going?
      var stops = true;
      if (t + 1 < frames.length && frames[t + 1].alive[i]) {
        var c = frames[t + 1].pos[i];
        stops = (c[0] === b[0] && c[1] === b[1]);
      }
      if (!stops) continue;
      var nx = b[0] + dx, ny = b[1] + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;         // the edge
      var ahead = ny * w + nx;
      if (stage.terrain[ahead] === E.WALL || stage.terrain[ahead] === E.HAZARD) {
        wallsUsed[ahead] = 1;
        continue;
      }
      for (var j = 0; j < n; j++) {
        if (j === i || !frames[t].alive[j]) continue;
        if (frames[t].pos[j][0] === nx && frames[t].pos[j][1] === ny) {
          brakes.push({ block: i, by: j });
          break;
        }
      }
    }
    if (everMoved) moved.push(i);
  }

  // A block that slid over its own aurora without stopping on it.
  for (i = 0; i < n; i++) {
    if (stage.colour[i] === E.GRAY) continue;
    var g = goalOfColour(stage, stage.colour[i]);
    if (g < 0) continue;
    if (!r.state.alive[i]) continue;                              // it WAS collected
    for (t = 1; t < frames.length; t++) {
      if (!frames[t].alive[i]) break;
      if (frames[t].pos[i][1] * w + frames[t].pos[i][0] === g) { passedGoal.push(i); break; }
    }
  }

  return {
    result: r, touched: touched, wallsUsed: wallsUsed,
    brakes: brakes, passedGoal: passedGoal, moved: moved
  };
}

// ---------------------------------------------------------------------------
// solution shape
// ---------------------------------------------------------------------------
/**
 * Short-period repetition in the move list.
 *
 *     R D L U  R D L U  R D L U
 *
 * is twelve moves and one idea. Every period from 1 to 4 is checked and the
 * worst one wins; a single R D L U is not repetition, three of them are.
 */
function repeatedPatternPenalty(sol) {
  var m = sol.length;
  // Under six moves there is no room to repeat anything: L R L is a board being
  // short, not a board being repetitive, and scoring it as repetition punished
  // exactly the small boards this whole search exists to find.
  if (m < 6) return 0;
  var weight = [0, 1, 0.95, 0.9, 0.85];
  var worst = 0;
  for (var p = 1; p <= 4 && p < m; p++) {
    var hits = 0;
    for (var i = 0; i + p < m; i++) if (sol[i] === sol[i + p]) hits++;
    var cover = hits / (m - p);
    if (cover * weight[p] > worst) worst = cover * weight[p];
  }
  return Math.min(1, worst);
}

/** How evenly the solution spends the four directions, 0…1. */
function directionEntropy(sol) {
  if (sol.length < 2) return 0;
  var count = { U: 0, R: 0, D: 0, L: 0 }, i;
  for (i = 0; i < sol.length; i++) count[sol[i]]++;
  var h = 0;
  for (var d = 0; d < 4; d++) {
    var p = count[DIRS[d]] / sol.length;
    if (p > 0) h -= p * Math.log(p) / Math.LN2;
  }
  return h / 2;                                        // log2(4) = 2
}

/**
 * The solution as turns rather than as compass points.
 *
 * 0 straight on, 1 a right turn, 2 a reversal, 3 a left turn. Rotating a board
 * does not change this sequence, and reflecting one mirrors it, so taking the
 * smaller of the sequence and its mirror gives a shape that is the same for all
 * sixteen ways of presenting one board. Two boards whose solutions have the
 * same shape are, from the player's side, the same trick twice.
 */
function turnShape(sol) {
  if (sol.length < 2) return '';
  var idx = { U: 0, R: 1, D: 2, L: 3 };
  var fwd = [], mir = [];
  for (var i = 1; i < sol.length; i++) {
    var t = (idx[sol[i]] - idx[sol[i - 1]] + 4) % 4;
    fwd.push(t);
    mir.push((4 - t) % 4);
  }
  var a = fwd.join(''), b = mir.join('');
  return a < b ? a : b;
}

// ---------------------------------------------------------------------------
// walls that do nothing
// ---------------------------------------------------------------------------
/**
 * Take each immovable block off in turn. If the board is still solvable in the
 * same number of moves, that block is furniture: it is on the board, it is in
 * the picture, and the puzzle does not use it.
 *
 * This is the rule tools/build-stages.js and tools/test.js already apply to the
 * shipped campaign; the fun search applies it before a board is ever kept.
 */
function wallUsefulness(rows, par) {
  var flat = rows.join('');
  var meaningful = 0, redundant = 0, redundantCells = [], meaningfulCells = [];
  for (var c = 0; c < flat.length; c++) {
    if (flat[c] !== '#' && flat[c] !== 'x') continue;
    var probe = flat.split('');
    probe[c] = '.';
    var without = E.solve(E.compile({ id: 'walls', board: K.flatToRows(probe.join('')) }), null, 400000);
    if (without.solvable && without.moves === par) { redundant++; redundantCells.push(c); }
    else { meaningful++; meaningfulCells.push(c); }
  }
  return {
    meaningfulWallCount: meaningful, redundantWallCount: redundant,
    redundantWallCells: redundantCells, meaningfulWallCells: meaningfulCells
  };
}

// ---------------------------------------------------------------------------
// does the other penguin matter?
// ---------------------------------------------------------------------------
/**
 * Take the other penguin off the ice for one swipe and see if anything changes.
 *
 * The obvious version of this — delete a penguin, replay the whole solution —
 * measures almost nothing, because two trajectories that diverge once never
 * come back together, so every board scores "dependent from move two onwards".
 * Asking the question one move at a time instead gives the number that was
 * wanted: how many times the other penguin was the reason this move ended
 * where it did.
 *
 * Nothing is recompiled. A block with `alive` cleared is invisible to the
 * simulation, which is exactly the counterfactual, so this is one extra tilt
 * per penguin per move.
 */
function dependencyEvents(stage, st, dir, after) {
  var events = 0, i, j;
  var live = [];
  for (i = 0; i < st.pos.length; i++) if (st.alive[i]) live.push(i);
  if (live.length < 2) return 0;

  for (var q = 0; q < live.length; q++) {
    i = live[q];
    if (stage.colour[i] === E.GRAY) continue;
    var solo = E.cloneState(st);
    for (var r = 0; r < live.length; r++) if (live[r] !== i) solo.alive[live[r]] = 0;
    var out = E.simulate(stage, solo, dir, { frames: false }).state;
    var same = (out.alive[i] === after.alive[i]) &&
      (!after.alive[i] || (out.pos[i][0] === after.pos[i][0] &&
                           out.pos[i][1] === after.pos[i][1]));
    if (!same) events++;
  }
  return events;
}

// ---------------------------------------------------------------------------
// collection order
// ---------------------------------------------------------------------------
/**
 * Does it matter which penguin goes home first?
 *
 *   1.0  only one order ever wins — the board enforces a sequence
 *   0.5  both orders can win, but only one of them is on the shortest line
 *   0.0  the order is free, or there is only one penguin
 */
function collectionOrder(stage, g, toWin, optimalSet) {
  if (stage.penguins < 2) {
    return { collectionOrderDependency: 0, winnableFirsts: 0, optimalFirsts: 0 };
  }
  var winnable = Object.create(null), optimal = Object.create(null);
  for (var i = 0; i < g.n; i++) {
    var st = g.states[i];
    if (st.collected !== 1 || (st.lost || 0)) continue;
    if (toWin[i] === Infinity) continue;
    var gone = -1;
    for (var b = 0; b < st.alive.length; b++) {
      if (!st.alive[b] && stage.colour[b] !== E.GRAY) { gone = stage.colour[b]; break; }
    }
    if (gone < 0) continue;
    winnable[gone] = 1;
    if (optimalSet[i]) optimal[gone] = 1;
  }
  var w = Object.keys(winnable).length, o = Object.keys(optimal).length;
  var dependency = w <= 1 ? (w === 1 ? 1 : 0) : (o <= 1 ? 0.5 : 0);
  return { collectionOrderDependency: dependency, winnableFirsts: w, optimalFirsts: o };
}

// ---------------------------------------------------------------------------
// the analysis
// ---------------------------------------------------------------------------

/* Bounded on purpose. A full sweep analyses hundreds of thousands of boards and
   each result carries a per-move trace, so an unbounded memo is a gigabyte of
   heap spent on boards nothing will ask about twice. Callers that sweep pass
   `noCache` — they deduplicate before they get here — and the cap is what stops
   a caller that forgets from running the machine out of memory. */
var CACHE_LIMIT = 20000;
var cache = new Map();

/**
 * Everything this file knows about one board.
 *
 * `opts.noCache` bypasses the memo, which is what a caller sweeping hundreds of
 * thousands of boards wants — it has deduplicated them already, so a memo would
 * only hold a per-move trace for each one. The cheap phases of
 * tools/fun-search.js call `survey` below instead of this.
 */
function analyzeLevel(rows, opts) {
  opts = opts || {};
  var id = K.canonBoard(rows);
  if (!opts.noCache && cache.has(id)) return cache.get(id);
  var out = compute(rows, id, opts);
  if (!opts.noCache) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(id, out);
  }
  return out;
}

function compute(rows, id, opts) {
  var flat = rows.join('');
  var side = rows.length;
  var cells = side * side;
  var base = {
    board: rows.slice(),
    canonicalId: id,
    skeletonId: K.skeletonKey(rows),
    wallPlanId: K.plainWallKey(rows),
    boardSize: side,
    cellCount: cells,
    penguinCount: countChar(flat, /[AB]/g),
    drifterCount: countChar(flat, /G/g),
    wallCount: countChar(flat, /#/g),
    hazardCount: countChar(flat, /x/g)
  };
  base.elementCount = base.penguinCount + base.drifterCount + base.wallCount + base.hazardCount;

  var stage;
  try { stage = E.compile({ id: 'analysis', board: rows }); }
  catch (err) { return fail(base, 'does not compile: ' + err.message); }

  var g = E.graph(stage, GRAPH_CAP);
  if (!g) return fail(base, 'position graph exceeds ' + GRAPH_CAP + ' states');

  var toWin = distanceToWin(g);
  if (toWin[0] === Infinity) return fail(base, 'unsolvable');

  var par = toWin[0];
  var path = bestPath(stage, g, toWin);
  var solution = path.dirs.join('');

  // Which positions lie on SOME shortest solution.
  var optimalSet = Object.create(null), optimalStates = [];
  for (var i = 0; i < g.n; i++) {
    if (toWin[i] !== Infinity && g.dist[i] + toWin[i] === par) {
      optimalSet[i] = 1; optimalStates.push(i);
    }
  }

  var goals = stage.colour.map(function (c) {
    return c === E.GRAY ? -1 : goalOfColour(stage, c);
  });

  // -------------------------------------------------------------------------
  // the graph, position by position
  // -------------------------------------------------------------------------
  var deadStates = 0, liveStates = 0;
  for (i = 0; i < g.n; i++) {
    if (g.clear[i] || g.broken[i]) continue;
    liveStates++;
    if (toWin[i] === Infinity) deadStates++;
  }

  // -------------------------------------------------------------------------
  // the shortest solution, move by move
  // -------------------------------------------------------------------------
  var steps = [];
  var touchedCells = Object.create(null), usedWalls = Object.create(null);
  var restCells = {};                                  // block -> cells it has rested on
  for (i = 0; i < stage.colour.length; i++) restCells[i] = Object.create(null);
  for (i = 0; i < stage.blocks.length; i++) {
    restCells[i][stage.blocks[i][1] * stage.w + stage.blocks[i][0]] = 1;
  }
  stage.goalCells.forEach(function (c) { touchedCells[c] = 1; });

  var revisitCount = 0;

  for (var t = 0; t < path.dirs.length; t++) {
    var from = path.states[t], to = path.states[t + 1], dir = path.dirs[t];
    var stFrom = g.states[from], stTo = g.states[to];
    var detail = slideDetail(stage, stFrom, dir);
    Object.keys(detail.touched).forEach(function (c) { touchedCells[c] = 1; });
    Object.keys(detail.wallsUsed).forEach(function (c) { usedWalls[c] = 1; touchedCells[c] = 1; });

    for (i = 0; i < stTo.pos.length; i++) {
      if (!stTo.alive[i]) continue;
      var cell = stTo.pos[i][1] * stage.w + stTo.pos[i][0];
      if (restCells[i][cell] && detail.moved.indexOf(i) >= 0) revisitCount++;
      restCells[i][cell] = 1;
    }

    // What else could have been done here.
    var real = [], safe = [], optimal = [], dead = [], recoverable = [];
    var collectAvailable = false;
    for (var d = 0; d < 4; d++) {
      var j = g.next[from][d];
      if (j === from) continue;
      real.push(d);
      if (g.states[j].collected > stFrom.collected) collectAvailable = true;
      if (toWin[j] === Infinity) { dead.push(d); continue; }
      safe.push(d);
      if (toWin[j] === toWin[from] - 1) optimal.push(d); else recoverable.push(d);
    }

    // The naive read, before and after.
    var beforePer = perPenguinDistance(stage, stFrom, goals);
    var afterPer = perPenguinDistance(stage, stTo, goals);
    var awayFromGoal = 0;
    for (i = 0; i < beforePer.length; i++) {
      if (stTo.alive[i] && stFrom.alive[i] && afterPer[i] > beforePer[i]) awayFromGoal++;
    }

    // What a player who only looks one move ahead would pick: collect if you
    // can, otherwise get closer.
    var greedy = real.map(function (dd) {
      var ns = g.states[g.next[from][dd]];
      return {
        dir: dd,
        score: (ns.collected - stFrom.collected) * 1000 - naiveDistance(stage, ns, goals) -
               ((ns.lost || 0) > (stFrom.lost || 0) ? 5000 : 0)
      };
    });
    var bestGreedy = -Infinity, chosenGreedy = -Infinity, bestNonOptimal = -Infinity;
    greedy.forEach(function (o) {
      if (o.score > bestGreedy) bestGreedy = o.score;
      if (o.dir === DIRS.indexOf(dir)) chosenGreedy = o.score;
      if (optimal.indexOf(o.dir) < 0 && o.score > bestNonOptimal) bestNonOptimal = o.score;
    });
    var bestOptimal = -Infinity;
    greedy.forEach(function (o) {
      if (optimal.indexOf(o.dir) >= 0 && o.score > bestOptimal) bestOptimal = o.score;
    });

    steps.push({
      dir: dir,
      from: from, to: to,
      dependency: dependencyEvents(stage, stFrom, dir, stTo),
      movedCount: detail.moved.length,
      collectedNow: stTo.collected - stFrom.collected,
      brakes: detail.brakes.length,
      penguinBrakes: detail.brakes.filter(function (b) {
        return stage.colour[b.by] !== E.GRAY;
      }).length,
      passedGoal: detail.passedGoal.length,
      awayFromGoal: awayFromGoal,
      realMoves: real.length,
      safeMoves: safe.length,
      optimalMoves: optimal.length,
      deadMoves: dead.length,
      recoverableMoves: recoverable.length,
      distinctFutures: distinctOutcomeCount(g, toWin, from),
      collectAvailable: collectAvailable,
      // The move the solver needs looks worse than a move it does not want.
      deceived: bestNonOptimal > bestOptimal,
      // The move the solver needs looks worse than something else on offer.
      counterIntuitive: chosenGreedy < bestGreedy,
      naiveBefore: naiveDistance(stage, stFrom, goals),
      naiveAfter: naiveDistance(stage, stTo, goals)
    });
  }

  // -------------------------------------------------------------------------
  // aha
  // -------------------------------------------------------------------------
  var moveAwayFromGoalCount = 0, goalPassThroughCount = 0;
  var delayedCollectionCount = 0, counterIntuitiveMoveCount = 0, deceptiveSteps = 0;
  var penguinBrakeCount = 0, sharedGravityInteractionCount = 0, dependencyCount = 0;
  var meaningfulDecisionCount = 0, forcedSteps = 0, usefulBranchTotal = 0;
  var wrongButRecoverableCount = 0, deadEndMoveCount = 0, singleSafeSteps = 0;

  steps.forEach(function (s) {
    moveAwayFromGoalCount += s.awayFromGoal;
    goalPassThroughCount += s.passedGoal;
    if (s.collectAvailable && !s.collectedNow) delayedCollectionCount++;
    if (s.counterIntuitive) counterIntuitiveMoveCount++;
    if (s.deceived) deceptiveSteps++;
    penguinBrakeCount += s.penguinBrakes;
    dependencyCount += s.dependency;
    if (s.movedCount >= 2) sharedGravityInteractionCount++;
    /* Three different prices, not two. Every position on an open tray offers a
       best move and a worse one — that is the game, not a decision. A position
       is a decision when the swipes are worth three distinguishable amounts:
       the line, a detour you can still win from, and something you cannot. */
    if (s.distinctFutures >= 3) meaningfulDecisionCount++;
    if (s.realMoves <= 1 || s.distinctFutures <= 1) forcedSteps++;
    if (s.safeMoves === 1) singleSafeSteps++;
    usefulBranchTotal += s.safeMoves;
    wrongButRecoverableCount += s.recoverableMoves;
    deadEndMoveCount += s.deadMoves;
  });

  // How far ahead you have to commit: the longest run of moves that neither
  // collects anything nor even LOOKS like progress.
  var requiredLookahead = 0, run = 0;
  steps.forEach(function (s) {
    if (s.collectedNow > 0 || s.naiveAfter < s.naiveBefore) run = 0;
    else { run++; if (run > requiredLookahead) requiredLookahead = run; }
  });

  // -------------------------------------------------------------------------
  // the opening
  // -------------------------------------------------------------------------
  var openingDead = 0, openingReal = 0;
  for (var d0 = 0; d0 < 4; d0++) {
    var j0 = g.next[0][d0];
    if (j0 === 0) continue;
    openingReal++;
    if (toWin[j0] === Infinity) openingDead++;
  }

  // -------------------------------------------------------------------------
  // how much of the tray is in play
  // -------------------------------------------------------------------------
  /* Counted over every position on a shortest line, not just the one line this
     file happens to print. A cell is in play if a penguin is ever in it, if it
     holds an aurora, or if it holds a wall something actually stops against.
     A 5×5 whose game happens inside a 3×3 is a 3×3 with a border drawn on. */
  if (optimalStates.length <= 240) {
    optimalStates.forEach(function (si) {
      if (g.clear[si] || g.broken[si]) return;
      for (var dd = 0; dd < 4; dd++) {
        var nj = g.next[si][dd];
        if (nj === si || toWin[nj] !== toWin[si] - 1) continue;
        var det = slideDetail(stage, g.states[si], DIRS[dd]);
        Object.keys(det.touched).forEach(function (c) { touchedCells[c] = 1; });
        Object.keys(det.wallsUsed).forEach(function (c) { usedWalls[c] = 1; touchedCells[c] = 1; });
      }
    });
  }
  var activeCells = Object.keys(touchedCells).map(Number);
  var minX = side, maxX = -1, minY = side, maxY = -1;
  activeCells.forEach(function (c) {
    var x = c % side, y = (c / side) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  var boundSide = Math.max(0, maxX - minX + 1, maxY - minY + 1);

  // -------------------------------------------------------------------------
  // penguins on each other
  // -------------------------------------------------------------------------
  var order = collectionOrder(stage, g, toWin, optimalSet);

  // -------------------------------------------------------------------------
  // walls
  // -------------------------------------------------------------------------
  var walls = wallUsefulness(rows, par);

  // -------------------------------------------------------------------------
  // the shape of the answer
  // -------------------------------------------------------------------------
  var changeSignals = steps.map(function (s, si) {
    var prev = si ? steps[si - 1] : null;
    var n = 0;
    if (s.movedCount >= 1) n++;
    if (s.movedCount >= 2) n++;
    if (s.collectedNow > 0) n++;
    if (s.brakes > 0) n++;
    if (prev && s.safeMoves !== prev.safeMoves) n++;
    if (prev && s.dir !== prev.dir) n++;
    return n / 6;
  });
  var stateChangeDensity = changeSignals.length
    ? changeSignals.reduce(function (a, b) { return a + b; }, 0) / changeSignals.length : 0;

  var features = {
    solvable: true,
    par: par,
    solution: solution,
    reachableStateCount: g.n,
    liveStateCount: liveStates,
    deadEndStateRatio: liveStates ? deadStates / liveStates : 0,

    activeCellCount: activeCells.length,
    activeAreaRatio: activeCells.length / cells,
    activeBoundingSide: boundSide,

    moveAwayFromGoalCount: moveAwayFromGoalCount,
    goalPassThroughCount: goalPassThroughCount,
    delayedCollectionCount: delayedCollectionCount,
    counterIntuitiveMoveCount: counterIntuitiveMoveCount,
    deceptiveChoiceRatio: steps.length ? deceptiveSteps / steps.length : 0,
    requiredLookahead: requiredLookahead,

    penguinBrakeCount: penguinBrakeCount,
    dependencyCount: dependencyCount,
    soloIndependent: stage.penguins >= 2 && dependencyCount === 0,
    collectionOrderDependency: order.collectionOrderDependency,
    sharedGravityInteractionCount: sharedGravityInteractionCount,

    meaningfulDecisionCount: meaningfulDecisionCount,
    forcedMoveRatio: steps.length ? forcedSteps / steps.length : 1,
    singleSafeMoveRatio: steps.length ? singleSafeSteps / steps.length : 0,
    averageUsefulBranching: steps.length ? usefulBranchTotal / steps.length : 0,
    wrongButRecoverableCount: wrongButRecoverableCount,
    deadEndMoveCount: deadEndMoveCount,
    openingDeadEndRate: openingDead / 4,
    openingLiveMoves: openingReal,

    directionEntropy: directionEntropy(solution),
    repeatedPatternPenalty: repeatedPatternPenalty(solution),
    stateChangeDensity: stateChangeDensity,
    revisitCount: revisitCount,

    meaningfulWallCount: walls.meaningfulWallCount,
    redundantWallCount: walls.redundantWallCount,
    redundantWallCells: walls.redundantWallCells,
    usedWallCount: Object.keys(usedWalls).length,

    turnShape: turnShape(solution)
  };

  var full = merge(base, features);
  full.steps = steps.map(function (s) {
    return {
      dir: s.dir, moved: s.movedCount, collected: s.collectedNow,
      brakes: s.penguinBrakes, passedGoal: s.passedGoal, away: s.awayFromGoal,
      dependency: s.dependency,
      real: s.realMoves, safe: s.safeMoves, dead: s.deadMoves,
      optimal: s.optimalMoves, deceived: s.deceived
    };
  });

  merge(full, SCORE.scoreLevel(full));
  return full;
}

/**
 * How many genuinely different futures the four swipes lead to from here.
 *
 * Different POSITIONS is the wrong count — on an open 4×4 all four swipes lead
 * somewhere different and every board scores full marks. What makes a choice
 * matter is that the options are worth different amounts, so positions are
 * grouped by what they cost: a win in five, a win in six, or never.
 */
function distinctOutcomeCount(g, toWin, i) {
  var seen = Object.create(null), n = 0;
  for (var d = 0; d < 4; d++) {
    var j = g.next[i][d];
    if (j === i) continue;
    var key = toWin[j] === Infinity ? 'dead' : ('w' + toWin[j]);
    if (!seen[key]) { seen[key] = 1; n++; }
  }
  return n;
}

function merge(target, extra) {
  Object.keys(extra).forEach(function (k) { target[k] = extra[k]; });
  return target;
}

function fail(base, why) {
  var out = merge({}, base);
  out.solvable = false;
  out.reason = why;
  out.par = -1;
  out.solution = '';
  out.categories = [];
  out.funPotential = 0;
  out.difficulty = 'none';
  return out;
}

// ---------------------------------------------------------------------------
// the cheap phases
// ---------------------------------------------------------------------------
/**
 * Phase B: everything the position graph answers, without the per-move replay
 * or the one-solve-per-wall pass.
 *
 * The full analysis costs roughly a solve per wall plus a simulation per move;
 * running it on every board an exhaustive enumeration produces would take
 * days. This is the same graph and the same exact numbers, stopping before the
 * expensive parts, so tools/fun-search.js can throw most boards away for
 * reasons that are still true rather than guessed.
 */
function survey(rows) {
  var stage;
  try { stage = E.compile({ id: 'survey', board: rows }); } catch (err) { return null; }
  var g = E.graph(stage, GRAPH_CAP);
  if (!g) return null;
  var toWin = distanceToWin(g);
  if (toWin[0] === Infinity) return null;

  var par = toWin[0], i, d;
  var live = 0, dead = 0, forced = 0, decisions = 0, branch = 0;
  for (i = 0; i < g.n; i++) {
    if (g.clear[i] || g.broken[i]) continue;
    live++;
    if (toWin[i] === Infinity) { dead++; continue; }
    if (g.dist[i] + toWin[i] !== par) continue;        // only the best lines count
    var real = 0, safe = 0;
    for (d = 0; d < 4; d++) {
      var j = g.next[i][d];
      if (j === i) continue;
      real++;
      if (toWin[j] !== Infinity) safe++;
    }
    branch += safe;
    if (real <= 1 || distinctOutcomeCount(g, toWin, i) <= 1) forced++;
    if (distinctOutcomeCount(g, toWin, i) >= 3) decisions++;
  }
  var onLine = 0;
  for (i = 0; i < g.n; i++) if (toWin[i] !== Infinity && g.dist[i] + toWin[i] === par) onLine++;

  var openingDead = 0;
  for (d = 0; d < 4; d++) {
    var j0 = g.next[0][d];
    if (j0 !== 0 && toWin[j0] === Infinity) openingDead++;
  }

  return {
    par: par,
    reachableStateCount: g.n,
    liveStateCount: live,
    deadEndStateRatio: live ? dead / live : 0,
    optimalStateCount: onLine,
    forcedRatio: onLine ? forced / onLine : 1,
    decisionCount: decisions,
    averageUsefulBranching: onLine ? branch / onLine : 0,
    openingDeadEndRate: openingDead / 4
  };
}

module.exports = {
  analyzeLevel: analyzeLevel,
  survey: survey,
  distanceToWin: distanceToWin,
  repeatedPatternPenalty: repeatedPatternPenalty,
  directionEntropy: directionEntropy,
  turnShape: turnShape,
  wallUsefulness: wallUsefulness,
  slideDetail: slideDetail,
  clearCache: function () { cache.clear(); },
  cacheSize: function () { return cache.size; },
  GRAPH_CAP: GRAPH_CAP
};
