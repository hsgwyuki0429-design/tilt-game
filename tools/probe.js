'use strict';
/*
 * TILT — design probe.
 *
 * Analyses stages and prints the shortest solution as a filmstrip, so a board
 * can be judged the way a player meets it rather than as a table of numbers.
 *
 *   node tools/probe.js <file.js> [id...]
 *
 * The file must export an array of stage defs (same shape as src/stages.js).
 * With no arguments it probes the shipped campaign.
 */

var path = require('path');
var E = require('../src/engine.js');
var B = require('./lib/boards.js');

var file = process.argv[2] || path.join(__dirname, '..', 'src', 'stages.js');
var mod = require(path.resolve(process.cwd(), file));
var defs = Array.isArray(mod) ? mod : mod.STAGES;
var only = process.argv.slice(3).filter(function (a) { return /^\d+$/.test(a); }).map(Number);

var D = function (s) { return '[2m' + s + '[0m'; };
var BD = function (s) { return '[1m' + s + '[0m'; };
var R = function (s) { return '[31m' + s + '[0m'; };
var G = function (s) { return '[32m' + s + '[0m'; };
var Y = function (s) { return '[33m' + s + '[0m'; };
var CY = function (s) { return '[36m' + s + '[0m'; };

function render(stage, state) {
  var rows = [];
  var occ = {};
  for (var i = 0; i < stage.blocks.length; i++) {
    if (state.alive[i]) occ[state.pos[i][0] + ',' + state.pos[i][1]] = true;
  }
  for (var y = 0; y < stage.h; y++) {
    var line = '';
    for (var x = 0; x < stage.w; x++) {
      var idx = y * stage.w + x;
      if (occ[x + ',' + y]) line += CY(BD('@'));
      else if (stage.terrain[idx] === E.WALL) line += D('▓');
      else if (stage.goal[idx]) line += G('o');
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
  // A long solution wraps rather than running off the terminal.
  var perRow = Math.max(1, Math.floor(110 / (stage.w + 3)));
  var out = [];
  for (var start = 0; start < strips.length; start += perRow) {
    var slice = strips.slice(start, start + perRow);
    var labs = labels.slice(start, start + perRow);
    var head = '  ';
    for (var j = 0; j < labs.length; j++) head += labs[j].padEnd(stage.w + 3);
    out.push(D(head));
    for (var y = 0; y < stage.h; y++) {
      var line = '  ';
      for (var k = 0; k < slice.length; k++) {
        var pad = Math.max(3, labs[k].length - stage.w + 3);
        line += slice[k][y] + ' '.repeat(pad);
      }
      out.push(line);
    }
    out.push('');
  }
  return out.join('\n');
}

function elementReport(def, par, ways) {
  var lines = [];
  var rows = def.board;
  var check = function (label, variant) {
    var st;
    try { st = E.compile({ board: variant }); }
    catch (e) { lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it leaves no board at all)')); return; }
    if (E.isClear(E.initialState(st))) {
      lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it solves the stage outright)')); return;
    }
    var m = B.measure(st, 200000);
    if (!m) { lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it makes the stage impossible)')); return; }
    if (m.par !== par) { lines.push('    ' + G('reshapes    ') + '  ' + label + D(' (par ' + par + '→' + m.par + ')')); return; }
    if (m.ways !== ways) { lines.push('    ' + Y('narrows     ') + '  ' + label + D(' (ways ' + ways + '→' + m.ways + ')')); return; }
    lines.push('    ' + R('INERT       ') + '  ' + label);
  };
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch === '.') continue;
      var v = rows.slice();
      v[y] = B.setCh(v[y], x, '.');
      check((ch === '#' ? 'wall ' : ch === '@' ? 'block' : 'goal ') + ' ' + x + ',' + y, v);
    }
  }
  return lines;
}

defs.forEach(function (def) {
  if (only.length && only.indexOf(def.id) < 0) return;
  var stage;
  try { stage = E.compile(def); }
  catch (e) { console.log(R('#' + def.id + ' ' + def.name + '  COMPILE FAILED: ' + e.message) + '\n'); return; }

  var m = B.measure(stage, 300000);
  if (!m) {
    console.log(R('#' + def.id + ' ' + def.name + '  UNSOLVABLE (or too large to measure)') + '\n');
    return;
  }
  var sol = E.solve(stage, null, 300000);
  var shape = B.shapeOf(stage, sol.path);

  console.log(BD('#' + def.id + ' ' + def.name) + '  ' + D(stage.w + '×' + stage.h) +
    '   par ' + BD(String(m.par)) +
    D('   ways ') + m.ways +
    D('   luck ') + (m.luck * 100).toFixed(3) + '%' +
    D('   states ') + m.states +
    D('   dead ') + (m.dead ? Y((m.dead * 100).toFixed(0) + '%') : '0') +
    D('   set-up ') + shape.opening +
    D('   chain ') + (shape.chain > 1 ? Y('×' + shape.chain) : '1'));
  if (def.note) console.log('  ' + D(def.note));
  console.log(filmstrip(stage, sol.path));
  elementReport(def, m.par, m.ways).forEach(function (l) { console.log(l); });
  console.log('');
});
