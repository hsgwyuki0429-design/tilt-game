'use strict';
/*
 * TILT — stage auditor.
 *
 * Runs the real engine, not a model of it. For every stage it proves
 * solvability, derives the true shortest solution, and then attacks the design:
 * every wall, pit, goal and block is deleted in turn to see whether the puzzle
 * even notices. Anything the board does not miss does not belong on the board.
 *
 *   node tools/audit.js                 full report
 *   node tools/audit.js 7 12            only those stage ids
 *   node tools/audit.js --quiet         summary + failures only
 *   node tools/audit.js --workers 4     parallelism (default 4)
 *   node tools/audit.js --deep          raise every search cap
 *
 * The checks, per stage:
 *    1 solvable at all                    7 same input → same result
 *    2 declared par is the true shortest   8 undo restores state exactly
 *    3 does not begin already cleared      9 restart restores state exactly
 *    4 blocks never overlap / clip walls  10 no piece leaves the board
 *    5 bookkeeping never drifts           11 every element is load-bearing
 *    6 a no-op tilt costs no move         12 board carries enough to think about
 */

var path = require('path');
var cp = require('child_process');

var ENGINE = require('../src/engine.js');
var STAGES = require('../src/stages.js').STAGES;
var CHAPTERS = require('../src/stages.js').CHAPTERS || null;

var argv = process.argv.slice(2);
var QUIET = argv.indexOf('--quiet') >= 0;
var DEEP = argv.indexOf('--deep') >= 0;
// Bare numbers select stage ids — but a number that is the VALUE of a flag
// (`--workers 4`) is not a stage id.
var only = argv.filter(function (a, i) {
  if (!/^\d+$/.test(a)) return false;
  var prev = argv[i - 1];
  return !(prev && prev.slice(0, 2) === '--');
}).map(Number);
function argOf(name, dflt) {
  var i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v == null || v.slice(0, 2) === '--') ? true : v;
}

var CAPS = {
  solve: DEEP ? 800000 : 250000,
  reach: DEEP ? 200000 : 20000,
  deadProbe: DEEP ? 100000 : 4000,   // states to test for "can no longer be solved"
  invariant: DEEP ? 20000 : 2500,    // states to walk validating physics
  ways: 4000
};

var C = {
  red: function (s) { return '[31m' + s + '[0m'; },
  grn: function (s) { return '[32m' + s + '[0m'; },
  yel: function (s) { return '[33m' + s + '[0m'; },
  dim: function (s) { return '[2m' + s + '[0m'; },
  bold: function (s) { return '[1m' + s + '[0m'; },
  cyn: function (s) { return '[36m' + s + '[0m'; }
};

// ===========================================================================
// per-stage checks (run in a worker)
// ===========================================================================

function cloneDef(def) {
  return {
    id: def.id, name: def.name, note: def.note, hint: def.hint, par: def.par,
    terrain: def.terrain.slice(),
    pieces: def.pieces.slice(),
    colors: def.colors ? JSON.parse(JSON.stringify(def.colors)) : undefined
  };
}
function setChar(str, i, ch) { return str.slice(0, i) + ch + str.slice(i + 1); }

function countShortest(stage, opt, cap) {
  if (opt < 0) return 0;
  var count = 0;
  (function walk(s, depth) {
    if (count > cap || depth === opt) return;
    for (var i = 0; i < 4; i++) {
      var ns = ENGINE.step(stage, s, ENGINE.DIRS[i]);
      if (!ns || ENGINE.isLost(ns)) continue;
      if (ENGINE.isClear(ns)) { if (depth + 1 === opt) count++; continue; }
      walk(ns, depth + 1);
    }
  })(ENGINE.initialState(stage), 0);
  return count;
}

/** Share of all par-length tilt sequences that clear the board. */
function solveRate(stage, opt) {
  if (opt < 1) return 1;
  var total = Math.pow(4, opt), wins = 0;
  if (total <= 300000) {
    (function walk(s, depth) {
      for (var i = 0; i < 4; i++) {
        var ns = ENGINE.step(stage, s, ENGINE.DIRS[i]);
        if (!ns || ENGINE.isLost(ns)) continue;
        var rest = Math.pow(4, opt - depth - 1);
        if (ENGINE.isClear(ns)) { wins += rest; continue; }
        if (depth + 1 < opt) walk(ns, depth + 1);
      }
    })(ENGINE.initialState(stage), 0);
    return wins / total;
  }
  var trials = 20000, hit = 0;
  for (var t = 0; t < trials; t++) {
    var s = ENGINE.initialState(stage);
    for (var m = 0; m < opt; m++) {
      var ns2 = ENGINE.step(stage, s, ENGINE.DIRS[(Math.random() * 4) | 0]);
      if (!ns2 || ENGINE.isLost(ns2)) break;
      s = ns2;
      if (ENGINE.isClear(s)) { hit++; break; }
    }
  }
  return hit / trials;
}

function reachStats(stage) {
  var states = ENGINE.reachable(stage, null, CAPS.reach);
  var dead = 0, probed = 0;
  for (var i = 0; i < states.length && probed < CAPS.deadProbe; i++) {
    if (ENGINE.isClear(states[i])) continue;
    probed++;
    if (!ENGINE.solve(stage, states[i], 30000).solvable) dead++;
  }
  return { total: states.length, dead: dead, probed: probed };
}

/**
 * Delete one element and see what the stage loses.
 *   breaks  — removing it makes the stage unsolvable      → load-bearing
 *   shifts  — removing it changes the shortest solution   → load-bearing
 *   narrows — removing it changes how many ways there are → meaningful
 *   inert   — removing it changes nothing                 → DELETE IT
 */
function classify(baseOpt, baseWays, variantDef) {
  var st;
  try { st = ENGINE.compile(variantDef); } catch (e) { return { kind: 'error', detail: e.message }; }
  var sol = ENGINE.solve(st, ENGINE.initialState(st), CAPS.solve);
  if (!sol.solvable) return { kind: 'breaks' };
  if (sol.moves !== baseOpt) return { kind: 'shifts', detail: baseOpt + '→' + sol.moves };
  var ways = countShortest(st, sol.moves, CAPS.ways);
  if (ways !== baseWays) return { kind: 'narrows', detail: baseWays + '→' + ways };
  return { kind: 'inert' };
}

function auditElements(def, stage, baseOpt, baseWays) {
  var out = { walls: [], pits: [], goals: [], pieces: [] };
  var y, x, ch;
  for (y = 0; y < stage.h; y++) {
    for (x = 0; x < stage.w; x++) {
      ch = def.terrain[y][x];
      if (ch === '.') continue;
      var v = cloneDef(def);
      v.terrain[y] = setChar(v.terrain[y], x, '.');
      var res = classify(baseOpt, baseWays, v);
      res.at = x + ',' + y;
      if (ch === '#') out.walls.push(res);
      else if (ch === '*') out.pits.push(res);
      else out.goals.push(res);
    }
  }
  stage.pieces.forEach(function (p) {
    var v = cloneDef(def);
    for (var yy = 0; yy < stage.h; yy++) {
      for (var xx = 0; xx < stage.w; xx++) {
        if (v.pieces[yy][xx] === p.letter) v.pieces[yy] = setChar(v.pieces[yy], xx, '.');
      }
    }
    var r = classify(baseOpt, baseWays, v);
    r.at = p.letter;
    out.pieces.push(r);
  });
  return out;
}

function countAlive(s) {
  var n = 0;
  for (var i = 0; i < s.alive.length; i++) if (s.alive[i]) n++;
  return n;
}

/** Physics, bookkeeping and determinism across a broad slice of the state space. */
function checkInvariants(stage) {
  var errs = [];
  var start = ENGINE.initialState(stage);
  var seen = {};
  var queue = [start];
  seen[ENGINE.stateKey(start)] = true;
  var head = 0, guard = 0;

  while (head < queue.length && guard++ < CAPS.invariant) {
    var s = queue[head++];
    for (var di = 0; di < 4; di++) {
      var res = ENGINE.simulate(stage, s, ENGINE.DIRS[di]);
      var ns = res.state;

      var occupied = {};
      for (var i = 0; i < stage.pieces.length; i++) {
        if (!ns.alive[i]) continue;
        var cells = ENGINE.pieceCells(stage, ns, i);
        for (var k = 0; k < cells.length; k++) {
          var cx = cells[k][0], cy = cells[k][1];
          if (cx < 0 || cy < 0 || cx >= stage.w || cy >= stage.h) {
            errs.push('block ' + i + ' left the board at ' + cx + ',' + cy);
          } else {
            var idx = cy * stage.w + cx;
            if (stage.terrain[idx] === ENGINE.WALL) errs.push('block ' + i + ' is inside a wall at ' + cx + ',' + cy);
            if (occupied[idx] != null && occupied[idx] !== i) errs.push('blocks ' + occupied[idx] + ' and ' + i + ' overlap at ' + cx + ',' + cy);
            occupied[idx] = i;
          }
        }
      }
      if (ns.collected + ns.lost + countAlive(ns) !== stage.pieces.length) errs.push('block bookkeeping drifted');

      if (res.frames.length) {
        var last = res.frames[res.frames.length - 1];
        for (var f = 0; f < stage.pieces.length; f++) {
          if (last.alive[f] !== ns.alive[f]) errs.push('final frame disagrees about block ' + f + ' liveness');
          if (last.off[f][0] !== ns.off[f][0] || last.off[f][1] !== ns.off[f][1]) errs.push('final frame disagrees about block ' + f + ' position');
        }
        // No two live blocks may share a cell at ANY animation tick.
        for (var t = 0; t < res.frames.length; t++) {
          var occT = {};
          for (var pi = 0; pi < stage.pieces.length; pi++) {
            if (!res.frames[t].alive[pi]) continue;
            var pc = ENGINE.pieceCells(stage, res.frames[t], pi);
            for (var q = 0; q < pc.length; q++) {
              var key = pc[q][0] + ',' + pc[q][1];
              if (occT[key] != null) errs.push('tick ' + t + ': blocks ' + occT[key] + ' and ' + pi + ' overlap mid-slide at ' + key);
              occT[key] = pi;
            }
          }
        }
      }

      var again = ENGINE.simulate(stage, s, ENGINE.DIRS[di]);
      if (ENGINE.stateKey(again.state) !== ENGINE.stateKey(ns)) errs.push('same input produced two different results');
      if (!res.moved && ns.moves !== s.moves) errs.push('a tilt that changed nothing still counted as a move');

      if (ENGINE.isLost(ns) || ENGINE.isClear(ns)) continue;
      var key2 = ENGINE.stateKey(ns);
      if (!seen[key2]) { seen[key2] = true; queue.push(ns); }
    }
    if (errs.length > 12) break;
  }
  return errs;
}

/** Undo must restore the past exactly; restart must restore the beginning exactly. */
function checkUndoRestart(stage) {
  var errs = [];
  var start = ENGINE.initialState(stage);
  var history = [];
  var s = start;
  var seq = ['R', 'D', 'L', 'U', 'D', 'R', 'U', 'L'];
  for (var i = 0; i < seq.length; i++) {
    var snap = ENGINE.cloneState(s);
    var res = ENGINE.simulate(stage, s, seq[i]);
    if (!res.moved) continue;
    history.push(snap);
    s = res.state;
    if (ENGINE.isClear(s) || ENGINE.isLost(s)) break;
  }
  while (history.length) s = history.pop();
  if (ENGINE.stateKey(s) !== ENGINE.stateKey(start)) errs.push('undo did not return to the initial state');
  if (s.moves !== 0) errs.push('undo did not restore the move counter');
  if (ENGINE.stateKey(ENGINE.initialState(stage)) !== ENGINE.stateKey(start)) errs.push('restart did not reproduce the initial state');
  return errs;
}

function auditStage(def) {
  var r = { id: def.id, name: def.name, problems: [], warnings: [] };
  var stage;
  try { stage = ENGINE.compile(def); }
  catch (e) { r.problems.push('COMPILE FAILED: ' + e.message); return r; }

  r.w = stage.w; r.h = stage.h;
  var start = ENGINE.initialState(stage);

  if (ENGINE.isClear(start)) r.problems.push('starts already cleared');

  var sol = ENGINE.solve(stage, start, CAPS.solve);
  if (!sol.solvable) r.problems.push('UNSOLVABLE');
  r.par = sol.solvable ? sol.moves : -1;
  r.ways = sol.solvable ? countShortest(stage, r.par, CAPS.ways) : 0;
  r.luck = sol.solvable ? solveRate(stage, r.par) : 0;

  var reach = reachStats(stage);
  r.states = reach.total; r.dead = reach.dead;

  if (def.par != null && def.par !== r.par) {
    r.problems.push('par says ' + def.par + ' but shortest solution is ' + r.par);
  }

  checkInvariants(stage).forEach(function (e) { r.problems.push(e); });
  checkUndoRestart(stage).forEach(function (e) { r.problems.push(e); });

  r.elements = sol.solvable ? auditElements(def, stage, r.par, r.ways)
                            : { walls: [], pits: [], goals: [], pieces: [] };
  ['walls', 'pits', 'goals', 'pieces'].forEach(function (kind) {
    r.elements[kind].forEach(function (el) {
      if (el.kind === 'inert') r.warnings.push('INERT ' + kind.slice(0, -1) + ' ' + el.at + ' — removing it changes nothing');
    });
  });

  var cells = stage.w * stage.h, used = 0;
  for (var i = 0; i < cells; i++) if (stage.terrain[i] !== ENGINE.FLOOR || stage.goal[i] !== ENGINE.GOAL_NONE) used++;
  stage.pieces.forEach(function (p) { used += p.cells.length; });
  r.cells = cells; r.used = used;
  r.fill = used / cells;

  // The opening board is deliberately near-empty: it exists so the very first
  // swipe has exactly one thing to notice.
  if (r.fill < 0.3 && r.par > 2) r.warnings.push('sparse board — only ' + pct(r.fill) + ' of cells carry anything');
  if (r.par >= 3 && r.luck > 0.25) {
    r.warnings.push('easy to blunder into — ' + pct(r.luck) + ' of random ' + r.par + '-move sequences clear it');
  }
  return r;
}

function pct(v) { return (v * 100).toFixed(v < 0.01 ? 2 : 1) + '%'; }

// ===========================================================================
// worker / parent
// ===========================================================================

if (process.env.TILT_AUDIT_WORKER) {
  process.on('message', function (msg) {
    var out = msg.indices.map(function (i) { return auditStage(STAGES[i]); });
    process.send({ results: out });
    process.exit(0);
  });
} else {
  main();
}

function main() {
  var list = [];
  STAGES.forEach(function (def, i) {
    if (only.length && only.indexOf(def.id) < 0) return;
    list.push(i);
  });

  var workers = Math.max(1, Math.min(Number(argOf('workers', 4)), list.length));
  if (workers === 1) {
    report(list.map(function (i) { return auditStage(STAGES[i]); }));
    return;
  }

  var buckets = [];
  for (var w = 0; w < workers; w++) buckets.push([]);
  // Round-robin keeps the heavy late chapters spread across workers.
  list.forEach(function (idx, n) { buckets[n % workers].push(idx); });

  var results = [];
  var pending = buckets.length;
  var t0 = Date.now();
  buckets.forEach(function (indices) {
    var child = cp.fork(__filename, [], {
      env: Object.assign({}, process.env, { TILT_AUDIT_WORKER: '1' })
    });
    child.on('message', function (m) {
      results = results.concat(m.results);
      if (--pending === 0) {
        results.sort(function (a, b) { return a.id - b.id; });
        report(results, Date.now() - t0);
      }
    });
    child.send({ indices: indices });
  });
}

function bar(v, n) {
  n = n || 8;
  var f = Math.max(0, Math.min(n, Math.round(v * n)));
  return new Array(f + 1).join('█') + C.dim(new Array(n - f + 1).join('░'));
}

function report(results, ms) {
  var problems = [], warnings = [];
  var totalCells = 0, usedCells = 0;

  if (!QUIET) {
    var chapterOf = function (id) {
      if (!CHAPTERS) return null;
      for (var i = 0; i < CHAPTERS.length; i++) {
        if (id >= CHAPTERS[i].from && id <= CHAPTERS[i].to) return CHAPTERS[i];
      }
      return null;
    };
    var lastChapter = null;

    results.forEach(function (r) {
      var chap = chapterOf(r.id);
      if (chap && chap !== lastChapter) {
        lastChapter = chap;
        console.log('');
        console.log(C.bold(C.cyn('CHAPTER ' + chap.number + ' · ' + chap.name)) +
          C.dim('  stages ' + chap.from + '–' + chap.to));
      }
      if (r.problems.length && r.par == null) {
        console.log(C.red('#' + r.id + ' ' + r.name + '  ' + r.problems[0]));
        return;
      }
      var line = C.bold(('#' + r.id).padEnd(5)) + C.cyn((r.name || '').padEnd(11)) +
        C.dim((r.w + '×' + r.h).padEnd(4)) + '  ' +
        'par ' + C.bold(String(r.par).padStart(2)) + '  ' +
        C.dim('ways ') + String(r.ways).padStart(3) + '  ' +
        C.dim('luck ') + pct(r.luck).padStart(7) + ' ' + bar(1 - Math.min(1, r.luck * 4)) + '  ' +
        C.dim('states ') + String(r.states).padStart(4) +
        C.dim(' dead ') + String(r.dead).padStart(3) +
        C.dim('  fill ') + pct(r.fill).padStart(6);

      var tally = [];
      ['walls', 'pits', 'goals', 'pieces'].forEach(function (kind) {
        var arr = r.elements[kind];
        if (!arr.length) return;
        var m = { breaks: 0, shifts: 0, narrows: 0, inert: 0 };
        arr.forEach(function (el) { if (m[el.kind] != null) m[el.kind]++; });
        if (m.inert) tally.push(C.red(m.inert + ' inert ' + kind));
      });
      console.log(line + (tally.length ? '  ' + tally.join(' ') : ''));
    });
  }

  results.forEach(function (r) {
    r.problems.forEach(function (p) { problems.push('#' + r.id + ' ' + r.name + ': ' + p); });
    r.warnings.forEach(function (w) { warnings.push('#' + r.id + ' ' + r.name + ': ' + w); });
    if (r.cells) { totalCells += r.cells; usedCells += r.used; }
  });

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
    return;
  }

  var pars = results.map(function (r) { return r.par; });
  var inert = 0;
  results.forEach(function (r) {
    ['walls', 'pits', 'goals', 'pieces'].forEach(function (k) {
      (r.elements[k] || []).forEach(function (el) { if (el.kind === 'inert') inert++; });
    });
  });

  console.log(C.grn(C.bold('✓ ' + results.length + ' stages: solvable, deterministic, internally consistent')));
  console.log(C.dim('  every declared par is a proven shortest solution'));
  console.log(C.dim('  inert elements: ' + inert));
  console.log(C.dim('  par range ' + Math.min.apply(null, pars) + '–' + Math.max.apply(null, pars) +
    ', total ' + pars.reduce(function (a, b) { return a + b; }, 0) + ' moves'));
  if (totalCells) console.log(C.dim('  average board fill: ' + pct(usedCells / totalCells)));
  if (ms) console.log(C.dim('  audited in ' + (ms / 1000).toFixed(1) + 's'));
  console.log('');
}
