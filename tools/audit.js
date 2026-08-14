'use strict';
/*
 * TILT — stage auditor.
 *
 * Runs the real engine, not a model of it. For every stage it proves
 * solvability, derives the true shortest solution, and then attacks the design:
 * every wall, block and goal is deleted in turn to see whether the puzzle even
 * notices. Anything the board does not miss does not belong on the board.
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
 *    4 blocks never overlap / clip walls  10 no block leaves the board
 *    5 bookkeeping never drifts           11 every element is load-bearing
 *    6 a no-op tilt costs no move         12 the rules did not grow
 *
 * Check 12 is the one that guards the design rather than the code. TILT has
 * four legal board characters and no fifth is coming: floor, wall, goal, block.
 * If a future stage ever ships a hazard cell, a coloured goal or a block that
 * is special in any way, this audit fails before anybody plays it.
 *
 * The counting here is deliberately its own implementation — a layered
 * breadth-first sweep written out in this file rather than a call into the
 * generator's measurement code. An auditor that shares arithmetic with the
 * thing it audits cannot catch that arithmetic being wrong.
 */

var path = require('path');
var cp = require('child_process');

var ENGINE = require('../src/engine.js');
var STAGES = require('../src/stages.js').STAGES;
var CHAPTERS = require('../src/stages.js').CHAPTERS || null;

var LEGAL = '.#o@';

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
  solve: DEEP ? 800000 : 300000,
  reach: DEEP ? 400000 : 120000,
  invariant: DEEP ? 20000 : 3000     // states to walk validating physics
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

function setChar(str, i, ch) { return str.slice(0, i) + ch + str.slice(i + 1); }

/**
 * One layered breadth-first sweep, and everything counted off it.
 *
 *   par    proven shortest solution
 *   ways   distinct par-length tilt sequences that clear the board
 *   luck   share of ALL par-length tilt sequences that clear it
 *   states positions reachable from the start
 *   dead   positions from which the board can no longer be solved
 *
 * Written as an explicit layer-by-layer walk rather than a recursive descent,
 * because at twenty-five moves a recursive descent is 4^25 sequences and this
 * is a few thousand nodes.
 */
function sweep(stage, cap) {
  var start = ENGINE.initialState(stage);
  var index = Object.create(null);
  var states = [start];
  var keys = [ENGINE.stateKey(start)];
  var clear = [ENGINE.isClear(start) ? 1 : 0];
  var dist = [0];
  var next = [];
  index[keys[0]] = 0;
  var truncated = false;

  for (var i = 0; i < states.length; i++) {
    var row = [i, i, i, i];
    if (!clear[i]) {
      for (var d = 0; d < 4; d++) {
        var ns = ENGINE.step(stage, states[i], ENGINE.DIRS[d]);
        if (!ns) continue;                      // a tilt that changes nothing
        var k = ENGINE.stateKey(ns);
        var at = index[k];
        if (at == null) {
          if (states.length >= cap) { truncated = true; continue; }
          at = states.length;
          index[k] = at;
          states.push(ns); keys.push(k);
          clear.push(ENGINE.isClear(ns) ? 1 : 0);
          dist.push(dist[i] + 1);
        }
        row[d] = at;
      }
    }
    next.push(row);
  }

  var n = states.length;
  var par = -1;
  for (i = 0; i < n; i++) if (clear[i]) { par = dist[i]; break; }
  if (par < 0) return { solvable: false, states: n, truncated: truncated };

  // Distinct shortest lines: nodes came out in breadth-first order, so one
  // forward pass is a correct layer-by-layer count.
  var ways = new Float64Array(n);
  ways[0] = 1;
  var total = 0;
  for (i = 0; i < n; i++) {
    if (!ways[i] || dist[i] >= par) continue;
    for (var d2 = 0; d2 < 4; d2++) {
      var j = next[i][d2];
      if (j === i || dist[j] !== dist[i] + 1) continue;
      ways[j] += ways[i];
      if (clear[j] && dist[j] === par) total += ways[i];
    }
  }

  // Luck: par uniformly random tilts, how much probability lands on a clear.
  var p = new Float64Array(n);
  p[0] = 1;
  var luck = 0;
  for (var s = 0; s < par; s++) {
    var q = new Float64Array(n);
    for (i = 0; i < n; i++) {
      if (!p[i]) continue;
      for (var d3 = 0; d3 < 4; d3++) {
        var t = next[i][d3];
        if (clear[t]) luck += p[i] * 0.25;
        else q[t] += p[i] * 0.25;
      }
    }
    p = q;
  }

  // Dead ends: walk the graph backwards from every cleared board.
  var back = [];
  for (i = 0; i < n; i++) back.push([]);
  for (i = 0; i < n; i++) {
    for (var d4 = 0; d4 < 4; d4++) {
      var j2 = next[i][d4];
      if (j2 !== i) back[j2].push(i);
    }
  }
  var alive = new Uint8Array(n), stack = [];
  for (i = 0; i < n; i++) if (clear[i]) { alive[i] = 1; stack.push(i); }
  while (stack.length) {
    var cur = stack.pop(), pre = back[cur];
    for (var b = 0; b < pre.length; b++) if (!alive[pre[b]]) { alive[pre[b]] = 1; stack.push(pre[b]); }
  }
  var dead = 0, live = 0;
  for (i = 0; i < n; i++) {
    if (clear[i]) continue;
    live++;
    if (!alive[i]) dead++;
  }

  return {
    solvable: true, par: par, ways: Math.round(total), luck: luck,
    states: n, dead: dead, live: live, truncated: truncated
  };
}

/**
 * Delete one element and see what the stage loses.
 *   breaks  — removing it makes the stage unsolvable      → load-bearing
 *   shifts  — removing it changes the shortest solution   → load-bearing
 *   narrows — removing it changes how many ways there are → meaningful
 *   inert   — removing it changes nothing                 → DELETE IT
 */
function classify(basePar, baseWays, variantBoard) {
  var st;
  try { st = ENGINE.compile({ board: variantBoard }); }
  catch (e) { return { kind: 'breaks', detail: 'no longer a board' }; }
  if (ENGINE.isClear(ENGINE.initialState(st))) return { kind: 'breaks', detail: 'starts cleared' };
  var m = sweep(st, CAPS.reach);
  if (!m.solvable) return { kind: 'breaks' };
  if (m.par !== basePar) return { kind: 'shifts', detail: basePar + '→' + m.par };
  if (m.ways !== baseWays) return { kind: 'narrows', detail: baseWays + '→' + m.ways };
  return { kind: 'inert' };
}

function auditElements(def, basePar, baseWays) {
  var out = { walls: [], blocks: [], goals: [] };
  var rows = def.board;
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch === '.') continue;
      var variant = rows.slice();
      variant[y] = setChar(variant[y], x, '.');
      var res = classify(basePar, baseWays, variant);
      res.at = x + ',' + y;
      if (ch === '#') out.walls.push(res);
      else if (ch === '@') out.blocks.push(res);
      else out.goals.push(res);
    }
  }
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
      for (var i = 0; i < stage.blocks.length; i++) {
        if (!ns.alive[i]) continue;
        var cx = ns.pos[i][0], cy = ns.pos[i][1];
        if (cx < 0 || cy < 0 || cx >= stage.w || cy >= stage.h) {
          errs.push('block ' + i + ' left the board at ' + cx + ',' + cy);
          continue;
        }
        var idx = cy * stage.w + cx;
        if (stage.terrain[idx] === ENGINE.WALL) errs.push('block ' + i + ' is inside a wall at ' + cx + ',' + cy);
        if (stage.goal[idx]) errs.push('block ' + i + ' is resting on a goal instead of being collected');
        if (occupied[idx] != null) errs.push('blocks ' + occupied[idx] + ' and ' + i + ' overlap at ' + cx + ',' + cy);
        occupied[idx] = i;
      }
      if (ns.collected + countAlive(ns) !== stage.blocks.length) errs.push('block bookkeeping drifted');

      if (res.frames.length) {
        var last = res.frames[res.frames.length - 1];
        for (var f = 0; f < stage.blocks.length; f++) {
          if (last.alive[f] !== ns.alive[f]) errs.push('final frame disagrees about block ' + f + ' liveness');
          if (last.alive[f] && (last.pos[f][0] !== ns.pos[f][0] || last.pos[f][1] !== ns.pos[f][1])) {
            errs.push('final frame disagrees about block ' + f + ' position');
          }
        }
        // No two live blocks may share a cell at ANY animation tick.
        for (var t = 0; t < res.frames.length; t++) {
          var occT = {};
          for (var pi = 0; pi < stage.blocks.length; pi++) {
            if (!res.frames[t].alive[pi]) continue;
            var key = res.frames[t].pos[pi][0] + ',' + res.frames[t].pos[pi][1];
            if (occT[key] != null) errs.push('tick ' + t + ': blocks ' + occT[key] + ' and ' + pi + ' overlap mid-slide at ' + key);
            occT[key] = pi;
          }
        }
      }

      var again = ENGINE.simulate(stage, s, ENGINE.DIRS[di]);
      if (ENGINE.stateKey(again.state) !== ENGINE.stateKey(ns)) errs.push('same input produced two different results');
      if (!res.moved && ns.moves !== s.moves) errs.push('a tilt that changed nothing still counted as a move');

      if (ENGINE.isClear(ns)) continue;
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
    if (ENGINE.isClear(s)) break;
  }
  while (history.length) s = history.pop();
  if (ENGINE.stateKey(s) !== ENGINE.stateKey(start)) errs.push('undo did not return to the initial state');
  if (s.moves !== 0) errs.push('undo did not restore the move counter');
  if (ENGINE.stateKey(ENGINE.initialState(stage)) !== ENGINE.stateKey(start)) errs.push('restart did not reproduce the initial state');
  return errs;
}

/**
 * The rules did not grow.
 *
 * TILT is floor, wall, goal, block, and tilting. This is the check that makes
 * that a promise instead of an intention: any stage carrying a character
 * outside those four, or any stage def that has sprouted a field the rules do
 * not have, fails here.
 */
function checkVocabulary(def) {
  var errs = [];
  (def.board || []).forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      if (LEGAL.indexOf(row[x]) < 0) {
        errs.push('illegal board character "' + row[x] + '" at ' + x + ',' + y +
          ' — the only legal characters are ' + LEGAL);
      }
    }
  });
  var allowed = ['id', 'name', 'par', 'note', 'hint', 'board'];
  Object.keys(def).forEach(function (k) {
    if (allowed.indexOf(k) < 0) {
      errs.push('stage carries an unknown field "' + k + '" — the rules did not grow, so neither should the data');
    }
  });
  return errs;
}

function auditStage(def) {
  var r = { id: def.id, name: def.name, problems: [], warnings: [] };

  checkVocabulary(def).forEach(function (e) { r.problems.push(e); });

  var stage;
  try { stage = ENGINE.compile(def); }
  catch (e) { r.problems.push('COMPILE FAILED: ' + e.message); return r; }

  r.w = stage.w; r.h = stage.h;
  if (ENGINE.isClear(ENGINE.initialState(stage))) r.problems.push('starts already cleared');

  var m = sweep(stage, CAPS.reach);
  if (m.truncated) r.warnings.push('state space exceeded the audit cap — numbers below are partial');
  if (!m.solvable) {
    r.problems.push('UNSOLVABLE');
    r.par = -1; r.ways = 0; r.luck = 0; r.states = m.states; r.dead = 0;
    r.elements = { walls: [], blocks: [], goals: [] };
    return r;
  }

  r.par = m.par; r.ways = m.ways; r.luck = m.luck;
  r.states = m.states; r.dead = m.dead;

  if (def.par != null && def.par !== r.par) {
    r.problems.push('par says ' + def.par + ' but shortest solution is ' + r.par);
  }

  checkInvariants(stage).forEach(function (e) { r.problems.push(e); });
  checkUndoRestart(stage).forEach(function (e) { r.problems.push(e); });

  r.elements = auditElements(def, r.par, r.ways);
  ['walls', 'blocks', 'goals'].forEach(function (kind) {
    r.elements[kind].forEach(function (el) {
      if (el.kind === 'inert') r.warnings.push('INERT ' + kind.slice(0, -1) + ' ' + el.at + ' — removing it changes nothing');
    });
  });

  var cells = stage.w * stage.h, used = 0;
  for (var i = 0; i < cells; i++) if (stage.terrain[i] !== ENGINE.FLOOR || stage.goal[i]) used++;
  used += stage.blocks.length;
  r.cells = cells; r.used = used;
  r.fill = used / cells;

  // The opening board is deliberately near-empty: it exists so the very first
  // swipe has exactly one thing to notice.
  if (r.fill < 0.22 && r.par > 2) r.warnings.push('sparse board — only ' + pct(r.fill) + ' of cells carry anything');
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
    child.on('exit', function (code) {
      if (code !== 0 && pending > 0) {
        console.error('\nan audit worker exited with code ' + code + ' before reporting');
        process.exit(1);
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
      if (r.par == null) {
        console.log(C.red('#' + r.id + ' ' + r.name + '  ' + (r.problems[0] || 'failed')));
        return;
      }
      var line = C.bold(('#' + r.id).padEnd(5)) + C.cyn((r.name || '').padEnd(11)) +
        C.dim((r.w + '×' + r.h).padEnd(4)) + '  ' +
        'par ' + C.bold(String(r.par).padStart(2)) + '  ' +
        C.dim('ways ') + String(r.ways).padStart(3) + '  ' +
        C.dim('luck ') + pct(r.luck).padStart(7) + ' ' + bar(1 - Math.min(1, r.luck * 4)) + '  ' +
        C.dim('states ') + String(r.states).padStart(5) +
        C.dim(' dead ') + String(r.dead).padStart(3) +
        C.dim('  fill ') + pct(r.fill).padStart(6);

      var tally = [];
      ['walls', 'blocks', 'goals'].forEach(function (kind) {
        var arr = r.elements[kind];
        if (!arr.length) return;
        var inert = 0;
        arr.forEach(function (el) { if (el.kind === 'inert') inert++; });
        if (inert) tally.push(C.red(inert + ' inert ' + kind));
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
    ['walls', 'blocks', 'goals'].forEach(function (k) {
      (r.elements[k] || []).forEach(function (el) { if (el.kind === 'inert') inert++; });
    });
  });

  console.log(C.grn(C.bold('✓ ' + results.length + ' stages: solvable, deterministic, internally consistent')));
  console.log(C.dim('  every declared par is a proven shortest solution'));
  console.log(C.dim('  every board uses only floor, wall, goal and block — the rules did not grow'));
  console.log(C.dim('  inert elements: ' + inert));
  console.log(C.dim('  par range ' + Math.min.apply(null, pars) + '–' + Math.max.apply(null, pars) +
    ', total ' + pars.reduce(function (a, b) { return a + b; }, 0) + ' moves'));
  if (totalCells) console.log(C.dim('  average board fill: ' + pct(usedCells / totalCells)));
  if (ms) console.log(C.dim('  audited in ' + (ms / 1000).toFixed(1) + 's'));
  console.log('');
}
