'use strict';
/*
 * TILT — design probe.
 *
 * Analyses candidate boards and prints the shortest solution as a filmstrip, so
 * a board can be judged the way a player meets it rather than as a table of
 * numbers.
 *
 *   node tools/probe.js <file.js> [id...]
 *
 * The file must export an array of stage defs (same shape as src/stages.js).
 */

var path = require('path');
var E = require('../src/engine.js');

var file = process.argv[2] || path.join(__dirname, '..', 'src', 'stages.js');
var mod = require(path.resolve(process.cwd(), file));
var defs = Array.isArray(mod) ? mod : mod.STAGES;
var only = process.argv.slice(3).filter(function (a) { return /^\d+$/.test(a); }).map(Number);

var D = function (s) { return '[2m' + s + '[0m'; };
var B = function (s) { return '[1m' + s + '[0m'; };
var R = function (s) { return '[31m' + s + '[0m'; };
var G = function (s) { return '[32m' + s + '[0m'; };
var Y = function (s) { return '[33m' + s + '[0m'; };
var CY = function (s) { return '[36m' + s + '[0m'; };

var COLOR_FN = [CY, function (s) { return '[35m' + s + '[0m'; }, Y];

function render(stage, state) {
  var rows = [];
  var occ = {};
  for (var i = 0; i < stage.pieces.length; i++) {
    if (!state.alive[i]) continue;
    var cells = E.pieceCells(stage, state, i);
    for (var k = 0; k < cells.length; k++) occ[cells[k][0] + ',' + cells[k][1]] = i;
  }
  for (var y = 0; y < stage.h; y++) {
    var line = '';
    for (var x = 0; x < stage.w; x++) {
      var idx = y * stage.w + x;
      var p = occ[x + ',' + y];
      if (p != null) {
        line += COLOR_FN[stage.pieces[p].color % 3](B(stage.pieces[p].letter));
      } else if (stage.terrain[idx] === E.WALL) line += D('▓');
      else if (stage.terrain[idx] === E.PIT) line += R('*');
      else if (stage.goal[idx] === E.GOAL_ANY) line += G('o');
      else if (stage.goal[idx] >= 0) line += COLOR_FN[stage.goal[idx] % 3]('o');
      else line += D('·');
    }
    rows.push(line);
  }
  return rows;
}

function filmstrip(stage, path) {
  var s = E.initialState(stage);
  var strips = [render(stage, s)];
  var labels = ['start'];
  for (var i = 0; i < path.length; i++) {
    var r = E.simulate(stage, s, path[i]);
    s = r.state;
    var chain = r.events.filter(function (e) { return e.type === 'goal'; }).length;
    strips.push(render(stage, s));
    labels.push(path[i] + (chain > 1 ? ' ×' + chain : ''));
  }
  var out = [];
  var head = '';
  for (var j = 0; j < labels.length; j++) head += (j ? '  ' : '  ') + labels[j].padEnd(stage.w + 1);
  out.push(D(head));
  for (var y = 0; y < stage.h; y++) {
    var line = '  ';
    for (var k = 0; k < strips.length; k++) line += strips[k][y] + '  ' + ' '.repeat(Math.max(0, labels[k].length - stage.w - 1));
    out.push(line);
  }
  return out.join('\n');
}

function countShortest(stage, opt, cap) {
  if (opt < 0) return 0;
  var count = 0;
  (function walk(s, depth) {
    if (count > cap) return;
    if (depth === opt) return;
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      if (!ns || E.isLost(ns)) continue;
      if (E.isClear(ns)) { if (depth + 1 === opt) count++; continue; }
      walk(ns, depth + 1);
    }
  })(E.initialState(stage), 0);
  return count;
}

function solveRate(stage, opt) {
  if (opt < 1) return 1;
  var total = Math.pow(4, opt), wins = 0;
  if (total > 400000) return -1;
  (function walk(s, depth) {
    if (depth === opt) return;
    for (var i = 0; i < 4; i++) {
      var ns = E.step(stage, s, E.DIRS[i]);
      var rest = Math.pow(4, opt - depth - 1);
      if (!ns || E.isLost(ns)) continue;
      if (E.isClear(ns)) { wins += rest; continue; }
      walk(ns, depth + 1);
    }
  })(E.initialState(stage), 0);
  return wins / total;
}

/** How often does a careless tilt actually cost you a piece? A pit nobody can fall into is decoration. */
function dangerStats(stage) {
  var states = E.reachable(stage, null, 40000);
  var killMoves = 0, total = 0, deadStates = 0;
  states.forEach(function (s) {
    if (E.isClear(s)) return;
    for (var i = 0; i < 4; i++) {
      var r = E.simulate(stage, s, E.DIRS[i], { frames: false });
      if (!r.moved) continue;
      total++;
      if (r.state.lost > 0) killMoves++;
    }
    var sr = E.solve(stage, s, 30000);
    if (!sr.solvable) deadStates++;
  });
  return { killMoves: killMoves, moves: total, deadStates: deadStates, states: states.length };
}

function cloneDef(def) {
  return {
    id: def.id, name: def.name, terrain: def.terrain.slice(), pieces: def.pieces.slice(),
    colors: def.colors ? JSON.parse(JSON.stringify(def.colors)) : undefined
  };
}
function setChar(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }

function elementReport(stage, opt, ways) {
  var def = stage.def, lines = [];
  var check = function (label, variantDef) {
    var st, sol;
    try { st = E.compile(variantDef); } catch (e) { return; }
    sol = E.solve(st, E.initialState(st), 200000);
    if (!sol.solvable) { lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it makes the stage impossible)')); return; }
    if (sol.moves !== opt) { lines.push('    ' + G('reshapes    ') + '  ' + label + D(' (par ' + opt + '→' + sol.moves + ')')); return; }
    var w2 = countShortest(st, sol.moves, 4000);
    if (w2 !== ways) { lines.push('    ' + Y('narrows     ') + '  ' + label + D(' (ways ' + ways + '→' + w2 + ')')); return; }
    lines.push('    ' + R('INERT       ') + '  ' + label);
  };
  for (var y = 0; y < stage.h; y++) {
    for (var x = 0; x < stage.w; x++) {
      var ch = def.terrain[y][x];
      if (ch === '.') continue;
      var v = cloneDef(def);
      v.terrain[y] = setChar(v.terrain[y], x, '.');
      check((ch === '#' ? 'wall' : ch === '*' ? 'pit ' : 'goal') + ' ' + x + ',' + y, v);
    }
  }
  stage.pieces.forEach(function (p) {
    var v = cloneDef(def);
    for (var yy = 0; yy < stage.h; yy++)
      for (var xx = 0; xx < stage.w; xx++)
        if (v.pieces[yy][xx] === p.letter) v.pieces[yy] = setChar(v.pieces[yy], xx, '.');
    check('piece ' + p.letter, v);
  });
  return lines;
}

defs.forEach(function (def) {
  if (only.length && only.indexOf(def.id) < 0) return;
  var stage;
  try { stage = E.compile(def); }
  catch (e) { console.log(R('#' + def.id + ' ' + def.name + '  COMPILE FAILED: ' + e.message) + '\n'); return; }

  var sol = E.solve(stage, E.initialState(stage), 400000);
  var opt = sol.solvable ? sol.moves : -1;
  var ways = sol.solvable ? countShortest(stage, opt, 4000) : 0;
  var rate = sol.solvable ? solveRate(stage, opt) : 0;
  var dg = dangerStats(stage);

  console.log(B('#' + def.id + ' ' + def.name) + '  ' + D(stage.w + '×' + stage.h) +
    '   par ' + (opt < 0 ? R('UNSOLVABLE') : B(String(opt))) +
    D('   ways ') + ways +
    D('   luck ') + (rate < 0 ? '—' : (rate * 100).toFixed(2) + '%') +
    D('   states ') + dg.states +
    D('   dead ') + (dg.deadStates ? R(String(dg.deadStates)) : '0') +
    D('   fatal tilts ') + (dg.killMoves ? Y(dg.killMoves + '/' + dg.moves) : '0'));
  if (def.note) console.log('  ' + D(def.note));
  if (sol.solvable) console.log(filmstrip(stage, sol.path));
  elementReport(stage, opt, ways).forEach(function (l) { console.log(l); });
  console.log('');
});
