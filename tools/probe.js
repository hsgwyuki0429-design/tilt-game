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
 *
 * This is the tool for the last question, the one no measurement answers: look
 * at the first frame and ask whether somebody meeting it for the first time
 * would have any idea what to do. The numbers in each header say whether a
 * board is well-formed. The filmstrip is where you find out whether it is good.
 */

var path = require('path');
var E = require('../src/engine.js');
var D_ = require('./lib/design.js');

var file = process.argv[2] || path.join(__dirname, '..', 'src', 'stages.js');
var mod = require(path.resolve(process.cwd(), file));
var defs = Array.isArray(mod) ? mod : mod.STAGES;
var only = process.argv.slice(3).filter(function (a) { return /^\d+$/.test(a); }).map(Number);

var D = function (s) { return '\u001b[2m' + s + '\u001b[0m'; };
var BD = function (s) { return '\u001b[1m' + s + '\u001b[0m'; };
var R = function (s) { return '\u001b[31m' + s + '\u001b[0m'; };
var G = function (s) { return '\u001b[32m' + s + '\u001b[0m'; };
var Y = function (s) { return '\u001b[33m' + s + '\u001b[0m'; };
var CY = function (s) { return '\u001b[36m' + s + '\u001b[0m'; };
var MG = function (s) { return '\u001b[35m' + s + '\u001b[0m'; };

// Colour 0 is the plain block, 1 and 2 are the two coloured ones, and the
// drifter is dim because it is the one piece the board never asks you to
// deliver. The terminal palette mirrors the game's — cyan / amber / violet —
// and each carries its own letter, so a strip piped to a file is still
// readable.
var BLOCK_INK = [function (s) { return CY(BD(s)); },
                 function (s) { return Y(BD(s)); },
                 function (s) { return MG(BD(s)); }];
BLOCK_INK[E.GRAY] = function (s) { return D(BD(s)); };
var GOAL_INK = [G, Y, MG];
var BLOCK_CH = ['@', 'A', 'B'];
BLOCK_CH[E.GRAY] = 'G';
var GOAL_CH = ['o', 'a', 'b'];

function render(stage, state) {
  var rows = [];
  var occ = {};
  for (var i = 0; i < stage.blocks.length; i++) {
    if (state.alive[i]) occ[state.pos[i][0] + ',' + state.pos[i][1]] = stage.colour[i];
  }
  for (var y = 0; y < stage.h; y++) {
    var line = '';
    for (var x = 0; x < stage.w; x++) {
      var idx = y * stage.w + x;
      var here = occ[x + ',' + y];
      if (here !== undefined) line += BLOCK_INK[here](BLOCK_CH[here]);
      else if (stage.terrain[idx] === E.WALL) line += D('▓');
      else if (stage.terrain[idx] === E.HAZARD) line += R('╳');
      else if (stage.goal[idx]) line += GOAL_INK[stage.goalColour[idx]](GOAL_CH[stage.goalColour[idx]]);
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
    var lost = r.events.filter(function (e) { return e.type === 'lost'; }).length;
    strips.push(render(stage, s));
    labels.push(path[i] + (chain > 1 ? ' ×' + chain : '') + (lost ? ' !' + lost : ''));
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
    try { st = E.compile({ board: variant, win: def.win }); }
    catch (e) { lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it leaves no board at all)')); return; }
    if (E.isClear(st, E.initialState(st))) {
      lines.push('    ' + G('load-bearing') + '  ' + label + D(' (removing it solves the stage outright)')); return;
    }
    var m = D_.measure(st, 200000);
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
      v[y] = D_.setCh(v[y], x, '.');
      var kind = ch === '#' ? 'wall  ' : ch === 'x' ? 'hazard' :
                 D_.isBlockChar(ch) ? 'block ' : 'goal  ';
      check(kind + ' ' + x + ',' + y, v);
    }
  }
  return lines;
}

defs.forEach(function (def) {
  if (only.length && only.indexOf(def.id) < 0) return;
  var stage;
  try { stage = E.compile(def); }
  catch (e) { console.log(R('#' + def.id + ' ' + def.name + '  COMPILE FAILED: ' + e.message) + '\n'); return; }

  var p = D_.profile(def.board, { quick: true, cap: 300000 });
  if (!p) {
    console.log(R('#' + def.id + ' ' + def.name + '  UNSOLVABLE (or too large to measure)') + '\n');
    return;
  }
  var sol = E.solve(stage, null, 300000);
  var device = stage.rules.hazard ? R(' +hazard') : stage.rules.colour ? MG(' +colour') : '';

  console.log(BD('#' + def.id + ' ' + def.name) + '  ' + D(stage.w + '×' + stage.h) + device +
    '  par ' + BD(String(p.par)) +
    D('  unlock ') + BD(String(p.unlock)) + D('/flow ') + p.flow +
    D('  blind ') + (p.blindness >= 2 ? Y(String(p.blindness)) : String(p.blindness)) +
    D('  traps ') + p.traps + '/' + p.live +
    D('  ways ') + p.ways +
    D('  states ') + p.states +
    D('  jam ') + (p.jam ? Y((p.jam * 100).toFixed(0) + '%') : '0') +
    D('  luck ') + (p.luck * 100).toFixed(2) + '%');
  if (def.idea) console.log('  ' + CY('idea  ') + D(def.idea));
  console.log(filmstrip(stage, sol.path));
  elementReport(def, p.par, p.ways).forEach(function (l) { console.log(l); });
  console.log('');
});
