'use strict';
/*
 * The large-floe band (stages 101-160, chapters 11-16) must be what the game
 * claims. Every board is re-solved on the engine to exactly its par, is fair
 * over its whole reachable graph, is one floe with no cracked ice, and keeps
 * the limits tools/large-campaign.js chose it under. Ids, chapters and names
 * must line up with the main campaign.
 */
var assert = require('assert');
var E = require('../src/engine.js');
var F = require('./lib/floe.js');
var S = require('./floe-search.js');
var K = require('./lib/rect-keys.js');
require('../src/stages.js');
var S0 = require('../src/stages.js');
var baseBoards = S0.STAGES.map(function (s) { return K.canonical(s.board); });
var baseCount = S0.STAGES.length;
require('../src/stages-large.js');
var band = globalThis.TiltLargeStages;

function fail(msg) { console.error('FAIL ' + msg); process.exit(1); }
assert(band && band.STAGES.length === 60, 'sixty large-floe stages');
assert.strictEqual(S0.STAGES.length, baseCount + 60, 'TiltStages holds the base campaign plus the band');
assert.strictEqual(S0.CHAPTERS.length, 16, 'ten base chapters plus six');
require('../src/stages-large.js');
assert.strictEqual(S0.STAGES.length, baseCount + 60, 'loading twice must not duplicate stages');

var names = {};
S0.STAGES.forEach(function (d, i) {
  assert.strictEqual(d.id, i + 1, 'ids are contiguous at ' + d.id);
  assert(!names[d.name], 'duplicate stage name ' + d.name);
  names[d.name] = true;
});
S0.CHAPTERS.forEach(function (c, i) {
  assert.strictEqual(c.number, i + 1, 'chapter numbers are contiguous');
  assert.strictEqual(c.from, i ? S0.CHAPTERS[i - 1].to + 1 : 1, 'chapter ' + c.number + ' starts where the last ended');
});
assert.strictEqual(S0.CHAPTERS[15].to, S0.STAGES[S0.STAGES.length - 1].id, 'the last chapter ends at the last stage');

var seenBoards = new Set(baseBoards), shapes = new Set(), pieces = new Set(), touching = 0, trays = {}, maxPar = 0, minPar = 99;
band.STAGES.forEach(function (d, k) {
  var stage;
  try { stage = E.compile({ id: d.id, board: d.board }); } catch (e) { fail(d.id + ' does not compile: ' + e.message); }
  if (stage.rules.hazard) fail(d.id + ' has cracked ice');
  var w = stage.w, h = stage.h;
  if (w < 4 || w > 6 || h < 4 || h > 6) fail(d.id + ' is ' + w + '×' + h);
  trays[w + 'x' + h] = (trays[w + 'x' + h] || 0) + 1;
  var floor = new Uint8Array(w * h);
  for (var i = 0; i < w * h; i++) floor[i] = stage.terrain[i] === E.WALL ? 0 : 1;
  if (!F.isWholeFloe(w, h, floor)) fail(d.id + ' is not one floe');
  var penguins = stage.colour.filter(function (c) { return c === 1 || c === 2; }).length;
  if (penguins !== 2 || stage.colour.length !== 2) fail(d.id + ' needs exactly two penguins');
  var key = K.canonical(d.board);
  if (seenBoards.has(key)) fail(d.id + ' repeats another board');
  seenBoards.add(key);
  var shape = K.canonical(d.board, 'room'), piece = K.canonical(d.board, 'ice');
  if (shapes.has(shape)) fail(d.id + ' reuses a floe shape');
  if (pieces.has(piece)) fail(d.id + ' reuses a piece layout');
  shapes.add(shape); pieces.add(piece);
  var r = E.solve(stage, null, 400000);
  if (!r.solvable || r.moves !== d.par) fail(d.id + ' par ' + d.par + ' but engine found ' + r.moves);
  minPar = Math.min(minPar, d.par); maxPar = Math.max(maxPar, d.par);

  // The limits the band was chosen under, measured again from the board alone.
  var p = F.parseRows(d.board), g = p.floe.graph(p.gA, p.gB), start = p.a * g.B + p.b;
  var m = S.measure(g, start, { runs: 0 });
  if (m.par !== d.par) fail(d.id + ' accelerator par ' + m.par);
  if (m.maxForced > 2 || m.tail > 2 || m.tempt > 3) fail(d.id + ' forced ' + m.maxForced + ' tail ' + m.tail + ' tempt ' + m.tempt);
  if (m.usedCells / p.floe.cells.length < 0.6) fail(d.id + ' uses too little of the ice');
  if (F.unfairFrom(g)[start]) fail(d.id + ' is not fair');
  var flat = d.board.join(''), a = flat.indexOf('a'), b = flat.indexOf('b');
  if (Math.abs(a % w - b % w) + Math.abs(((a / w) | 0) - ((b / w) | 0)) === 1) touching++;

  // Fairness on the real engine over the whole reachable graph.
  var eg = E.graph(stage, 200000);
  if (!eg) fail(d.id + ' graph too large');
  var rev = eg.states.map(function () { return []; });
  for (var s = 0; s < eg.n; s++) for (var q = 0; q < 4; q++) if (eg.next[s][q] !== s) rev[eg.next[s][q]].push(s);
  var ok = new Uint8Array(eg.n), queue = [];
  for (s = 0; s < eg.n; s++) if (eg.clear[s]) { ok[s] = 1; queue.push(s); }
  for (var head = 0; head < queue.length; head++) rev[queue[head]].forEach(function (pp) { if (!ok[pp] && !eg.broken[pp]) { ok[pp] = 1; queue.push(pp); } });
  for (s = 0; s < eg.n; s++) {
    if (!ok[s] || eg.clear[s]) continue;
    for (q = 0; q < 4; q++) {
      var j = eg.next[s][q];
      if (j === s || eg.broken[j] || ok[j]) continue;
      if (eg.states[j].collected === eg.states[s].collected) fail(d.id + ' has an ordinary-move trap');
    }
  }
  assert(d.hint && d.hint.ja && d.hint.en, 'hint on ' + d.id);
});
assert(touching <= 2 + 0.35 * 60, 'too many boards with touching auroras: ' + touching);
console.log('large-floe band ok: 60 stages, trays ' + JSON.stringify(trays) + ', par ' + minPar + '-' + maxPar + ', touching auroras ' + touching);
