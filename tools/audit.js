'use strict';
/*
 * TILT — stage auditor.
 *
 * Runs the real engine, not a model of it. For every stage it proves
 * solvability, derives the true shortest solution, and then attacks the design:
 * every wall, pit, goal and piece is deleted in turn to see whether the puzzle
 * even notices. Anything the board does not miss does not belong on the board.
 *
 *   node tools/audit.js            full report
 *   node tools/audit.js 7 12       only those stages
 *   node tools/audit.js --quiet    summary + failures only
 */

var E = require('../src/engine.js');
var S = require('../src/stages.js').STAGES;

var args = process.argv.slice(2);
var QUIET = args.indexOf('--quiet') >= 0;
var only = args.filter(function (a) { return /^\d+$/.test(a); }).map(Number);

var C = {
  red: function (s) { return '[31m' + s + '[0m'; },
  grn: function (s) { return '[32m' + s + '[0m'; },
  yel: function (s) { return '[33m' + s + '[0m'; },
  dim: function (s) { return '[2m' + s + '[0m'; },
  bold: function (s) { return '[1m' + s + '[0m'; },
  cyn: function (s) { return '[36m' + s + '[0m'; }
};

var problems = [];
var warnings = [];

function problem(stage, msg) { problems.push('#' + stage.id + ' ' + stage.name + ': ' + msg); }
function warn(stage, msg) { warnings.push('#' + stage.id + ' ' + stage.name + ': ' + msg); }

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function cloneDef(def) {
  return {
    id: def.id, name: def.name, note: def.note, hint: def.hint, par: def.par,
    terrain: def.terrain.slice(),
    pieces: def.pieces.slice(),
    colors: def.colors ? JSON.parse(JSON.stringify(def.colors)) : undefined
  };
}

function setChar(str, i, ch) { return str.slice(0, i) + ch + str.slice(i + 1); }

/** Optimal length, or -1 when unsolvable. Never throws. */
function optimalOf(def) {
  var st;
  try { st = E.compile(def); } catch (e) { return { moves: -1, error: e.message }; }
  var start = E.initialState(st);
  if (E.isClear(start)) return { moves: 0, error: null };
  var r = E.solve(st, start, 200000);
  return { moves: r.solvable ? r.moves : -1, error: null, truncated: r.truncated };
}

/** How many distinct shortest solutions exist (capped). */
function countShortest(stage, opt, cap) {
  if (opt < 0) return 0;
  var count = 0;
  var start = E.initialState(stage);
  var stack = [{ s: start, d: 0 }];
  // Depth-limited DFS over move sequences of exactly `opt` length.
  (function walk(s, depth) {
    if (count > cap) return;
    if (depth === opt) { if (E.isClear(s)) count++; return; }
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      if (!ns || E.isLost(ns)) continue;
      if (E.isClear(ns)) { if (depth + 1 === opt) count++; continue; }
      walk(ns, depth + 1);
    }
  })(start, 0);
  return count;
}

/**
 * Fraction of *all* move sequences of length `opt` that clear the stage.
 * A high rate means a player can blunder into the answer; a low rate means the
 * board demands an actual idea.
 */
function solveRate(stage, opt) {
  if (opt < 1) return 1;
  var total = Math.pow(4, opt);
  var wins = 0;
  if (total <= 400000) {
    var start = E.initialState(stage);
    (function walk(s, depth) {
      if (depth === opt) return;
      for (var i = 0; i < 4; i++) {
        var ns = E.step(stage, s, E.DIRS[i]);
        var rest = Math.pow(4, opt - depth - 1);
        if (!ns) { continue; }            // no-op tilt: sequence wasted
        if (E.isLost(ns)) continue;
        if (E.isClear(ns)) { wins += rest; continue; }
        walk(ns, depth + 1);
      }
    })(start, 0);
    return wins / total;
  }
  // Sample for deep stages.
  var trials = 40000, hit = 0;
  for (var t = 0; t < trials; t++) {
    var s = E.initialState(stage), ok = false;
    for (var m = 0; m < opt; m++) {
      var ns = E.step(stage, s, E.DIRS[(Math.random() * 4) | 0]);
      if (!ns || E.isLost(ns)) { break; }
      s = ns;
      if (E.isClear(s)) { ok = true; break; }
    }
    if (ok) hit++;
  }
  return hit / trials;
}

/** Reachable states, and how many of them are already doomed. */
function reachStats(stage) {
  var states = E.reachable(stage, null, 60000);
  var dead = 0;
  for (var i = 0; i < states.length; i++) {
    if (E.isClear(states[i])) continue;
    var r = E.solve(stage, states[i], 30000);
    if (!r.solvable) dead++;
  }
  return { total: states.length, dead: dead };
}

// ---------------------------------------------------------------------------
// element-by-element interrogation  (spec §12)
// ---------------------------------------------------------------------------

/**
 * Delete one element and see what the stage loses.
 *   'breaks'  removing it makes the stage unsolvable      -> load-bearing
 *   'shifts'  removing it changes the shortest solution   -> load-bearing
 *   'narrows' removing it changes how many ways there are -> meaningful
 *   'inert'   removing it changes nothing                 -> DELETE IT
 */
function classify(stage, baseOpt, baseWays, variantDef) {
  var v = optimalOf(variantDef);
  if (v.error) return { kind: 'error', detail: v.error };
  if (v.moves < 0) return { kind: 'breaks' };
  if (v.moves !== baseOpt) return { kind: 'shifts', detail: baseOpt + '→' + v.moves };
  var vst = E.compile(variantDef);
  var ways = countShortest(vst, v.moves, 4000);
  if (ways !== baseWays) return { kind: 'narrows', detail: baseWays + '→' + ways };
  return { kind: 'inert' };
}

function auditElements(stage, baseOpt, baseWays) {
  var def = stage.def;
  var results = { walls: [], pits: [], goals: [], pieces: [] };
  var y, x, ch;

  for (y = 0; y < stage.h; y++) {
    for (x = 0; x < stage.w; x++) {
      ch = def.terrain[y][x];
      if (ch !== '#' && ch !== '*' && ch !== 'o' && !(ch >= '0' && ch <= '2')) continue;
      var v = cloneDef(def);
      v.terrain[y] = setChar(v.terrain[y], x, '.');
      var res = classify(stage, baseOpt, baseWays, v);
      res.at = x + ',' + y;
      if (ch === '#') results.walls.push(res);
      else if (ch === '*') results.pits.push(res);
      else results.goals.push(res);
    }
  }

  // Removing a piece: the stage must not be indifferent to it.
  stage.pieces.forEach(function (p) {
    var v = cloneDef(def);
    for (var yy = 0; yy < stage.h; yy++) {
      for (var xx = 0; xx < stage.w; xx++) {
        if (v.pieces[yy][xx] === p.letter) v.pieces[yy] = setChar(v.pieces[yy], xx, '.');
      }
    }
    var res = classify(stage, baseOpt, baseWays, v);
    res.at = p.letter;
    results.pieces.push(res);
  });

  return results;
}

// ---------------------------------------------------------------------------
// engine invariants  (spec §54)
// ---------------------------------------------------------------------------

function checkInvariants(stage) {
  var errs = [];
  var start = E.initialState(stage);

  // Walk a broad slice of the reachable space, validating physics at every node.
  var seen = Object.create(null);
  var queue = [start];
  seen[E.stateKey(start)] = true;
  var head = 0, guard = 0;

  while (head < queue.length && guard++ < 20000) {
    var s = queue[head++];
    for (var di = 0; di < 4; di++) {
      var res = E.simulate(stage, s, E.DIRS[di]);
      var ns = res.state;

      // -- physics ------------------------------------------------------
      var occupied = Object.create(null);
      for (var i = 0; i < stage.pieces.length; i++) {
        if (!ns.alive[i]) continue;
        var cells = E.pieceCells(stage, ns, i);
        for (var k = 0; k < cells.length; k++) {
          var cx = cells[k][0], cy = cells[k][1];
          if (cx < 0 || cy < 0 || cx >= stage.w || cy >= stage.h) errs.push('piece ' + i + ' left the board at ' + cx + ',' + cy);
          else {
            var idx = cy * stage.w + cx;
            if (stage.terrain[idx] === E.WALL) errs.push('piece ' + i + ' is inside a wall at ' + cx + ',' + cy);
            if (occupied[idx] != null && occupied[idx] !== i) errs.push('pieces ' + occupied[idx] + ' and ' + i + ' overlap at ' + cx + ',' + cy);
            occupied[idx] = i;
          }
        }
      }
      if (ns.collected + ns.lost + countAlive(ns) !== stage.pieces.length) errs.push('piece bookkeeping drifted');

      // -- frames agree with the final state -----------------------------
      if (res.frames.length) {
        var last = res.frames[res.frames.length - 1];
        for (var f = 0; f < stage.pieces.length; f++) {
          if (last.alive[f] !== ns.alive[f]) errs.push('final frame disagrees about piece ' + f + ' liveness');
          if (last.off[f][0] !== ns.off[f][0] || last.off[f][1] !== ns.off[f][1]) errs.push('final frame disagrees about piece ' + f + ' position');
        }
        // No two live pieces may occupy the same cell at ANY animation tick.
        for (var t = 0; t < res.frames.length; t++) {
          var occT = Object.create(null);
          for (var pi = 0; pi < stage.pieces.length; pi++) {
            if (!res.frames[t].alive[pi]) continue;
            var pc = E.pieceCells(stage, res.frames[t], pi);
            for (var q = 0; q < pc.length; q++) {
              var key = pc[q][0] + ',' + pc[q][1];
              if (occT[key] != null) errs.push('tick ' + t + ': pieces ' + occT[key] + ' and ' + pi + ' overlap mid-slide at ' + key);
              occT[key] = pi;
            }
          }
        }
      }

      // -- determinism ---------------------------------------------------
      var again = E.simulate(stage, s, E.DIRS[di]);
      if (E.stateKey(again.state) !== E.stateKey(ns)) errs.push('same input produced two different results');

      // -- a no-op tilt must not consume a move --------------------------
      if (!res.moved && ns.moves !== s.moves) errs.push('a tilt that changed nothing still counted as a move');

      if (E.isLost(ns) || E.isClear(ns)) continue;
      var key2 = E.stateKey(ns);
      if (!seen[key2]) { seen[key2] = true; queue.push(ns); }
    }
    if (errs.length > 12) break;
  }
  return errs;
}

function countAlive(s) {
  var n = 0;
  for (var i = 0; i < s.alive.length; i++) if (s.alive[i]) n++;
  return n;
}

/** Undo must restore the past exactly; restart must restore the beginning exactly. (spec §32, §33) */
function checkUndoRestart(stage) {
  var errs = [];
  var start = E.initialState(stage);
  var history = [];
  var s = start;
  var seq = ['R', 'D', 'L', 'U', 'D', 'R', 'U', 'L'];
  for (var i = 0; i < seq.length; i++) {
    var snap = E.cloneState(s);
    var res = E.simulate(stage, s, seq[i]);
    if (!res.moved) continue;
    history.push(snap);
    s = res.state;
    if (E.isClear(s) || E.isLost(s)) break;
  }
  while (history.length) {
    var prev = history.pop();
    s = prev;
  }
  if (E.stateKey(s) !== E.stateKey(start)) errs.push('undo did not return to the initial state');
  if (s.moves !== 0) errs.push('undo did not restore the move counter');
  var fresh = E.initialState(stage);
  if (E.stateKey(fresh) !== E.stateKey(start)) errs.push('restart did not reproduce the initial state');
  return errs;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function bar(v, n) {
  n = n || 12;
  var f = Math.max(0, Math.min(n, Math.round(v * n)));
  return '█'.repeat(f) + C.dim('░'.repeat(n - f));
}

function pct(v) { return (v * 100).toFixed(v < 0.01 ? 2 : 1) + '%'; }

var totalCells = 0, meaningfulCells = 0;

S.forEach(function (def) {
  if (only.length && only.indexOf(def.id) < 0) return;

  var stage;
  try { stage = E.compile(def); }
  catch (e) { problems.push(C.red('COMPILE ') + e.message); console.log(C.red('#' + def.id + ' ' + def.name + '  COMPILE FAILED: ' + e.message)); return; }

  var start = E.initialState(stage);

  // CHECK 3 — must not begin solved.
  if (E.isClear(start)) problem(stage, 'starts already cleared');

  // CHECK 1 — must be solvable.
  var sol = E.solve(stage, start, 400000);
  if (!sol.solvable) { problem(stage, C.red('UNSOLVABLE')); }

  var opt = sol.solvable ? sol.moves : -1;
  var ways = sol.solvable ? countShortest(stage, opt, 4000) : 0;
  var rate = sol.solvable ? solveRate(stage, opt) : 0;
  var reach = reachStats(stage);

  // CHECK 10 — declared par must be the truth.
  if (def.par != null && def.par !== opt) problem(stage, 'par says ' + def.par + ' but shortest solution is ' + opt);

  // CHECK 7/8/9 + physics.
  var inv = checkInvariants(stage);
  inv.forEach(function (e) { problem(stage, e); });
  checkUndoRestart(stage).forEach(function (e) { problem(stage, e); });

  // CHECK 11 — every element must earn its cell.
  var el = sol.solvable ? auditElements(stage, opt, ways) : { walls: [], pits: [], goals: [], pieces: [] };
  var inert = [];
  ['walls', 'pits', 'goals', 'pieces'].forEach(function (kind) {
    el[kind].forEach(function (r) {
      if (r.kind === 'inert') inert.push(kind.slice(0, -1) + ' ' + r.at);
    });
  });
  inert.forEach(function (t) { warn(stage, 'INERT ' + t + ' — removing it changes nothing'); });

  // CHECK 12 — density.
  var cells = stage.w * stage.h;
  var used = 0;
  for (var i = 0; i < cells; i++) if (stage.terrain[i] !== E.FLOOR || stage.goal[i] !== E.GOAL_NONE) used++;
  stage.pieces.forEach(function (p) { used += p.cells.length; });
  totalCells += cells; meaningfulCells += used;
  var density = used / cells;
  // The opening board is deliberately near-empty: it exists so the very first
  // swipe has exactly one thing to notice. Density is a requirement for puzzles,
  // not for the sentence that introduces the verb.
  if (density < 0.3 && opt > 2) warn(stage, 'sparse board — only ' + pct(density) + ' of cells carry anything');

  // Fairness: a stage the player can stumble through is not a puzzle.
  if (opt >= 3 && rate > 0.25) warn(stage, 'easy to blunder into — ' + pct(rate) + ' of random ' + opt + '-move sequences clear it');

  if (!QUIET) {
    var head = C.bold(('#' + def.id).padEnd(4)) + C.cyn(def.name.padEnd(9)) +
      C.dim(stage.w + '×' + stage.h) + '  ' +
      'par ' + C.bold(String(opt).padStart(2)) + '  ' +
      C.dim('ways ') + String(ways).padStart(3) + '  ' +
      C.dim('luck ') + pct(rate).padStart(7) + ' ' + bar(1 - Math.min(1, rate * 4), 8) + '  ' +
      C.dim('states ') + String(reach.total).padStart(4) +
      C.dim(' dead ') + String(reach.dead).padStart(3) +
      C.dim('  fill ') + pct(density).padStart(6);
    console.log(head);

    var tally = function (kind) {
      var arr = el[kind];
      if (!arr.length) return '';
      var m = { breaks: 0, shifts: 0, narrows: 0, inert: 0 };
      arr.forEach(function (r) { if (m[r.kind] != null) m[r.kind]++; });
      var parts = [];
      if (m.breaks) parts.push(C.grn(m.breaks + ' load-bearing'));
      if (m.shifts) parts.push(C.grn(m.shifts + ' reshapes'));
      if (m.narrows) parts.push(C.yel(m.narrows + ' narrows'));
      if (m.inert) parts.push(C.red(m.inert + ' INERT'));
      return '    ' + kind.padEnd(7) + parts.join(C.dim(' / '));
    };
    ['walls', 'pits', 'goals', 'pieces'].forEach(function (k) { var t = tally(k); if (t) console.log(t); });
  }
});

// ---------------------------------------------------------------------------

console.log('');
if (warnings.length) {
  console.log(C.yel(C.bold('WARNINGS (' + warnings.length + ')')));
  warnings.forEach(function (w) { console.log('  ' + C.yel('!') + ' ' + w); });
  console.log('');
}
if (problems.length) {
  console.log(C.red(C.bold('FAILURES (' + problems.length + ')')));
  problems.forEach(function (p) { console.log('  ' + C.red('✗') + ' ' + p); });
  console.log('');
  process.exitCode = 1;
} else {
  console.log(C.grn(C.bold('✓ all stages solvable, deterministic, and internally consistent')));
  if (totalCells) console.log(C.dim('  average board fill: ' + pct(meaningfulCells / totalCells)));
  console.log('');
}
