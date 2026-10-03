'use strict';
/*
 * The cracked-ice band (stages 101-160, chapters 11-16) must be what the game
 * claims: each board solvable in exactly its stated par on the real engine,
 * fair (an ordinary move never strands the pair), one floe, and wired into
 * TiltStages with contiguous ids and chapters.
 */
var assert = require('assert');
var E = require('../src/engine.js');
var F = require('./lib/floe.js');
require('../src/stages.js');
require('../src/stages-cracked.js');
var S = require('../src/stages.js');
var cracked = globalThis.TiltCrackedStages;

function fail(msg) { console.error('FAIL ' + msg); process.exit(1); }
assert(cracked && cracked.STAGES.length === 60, 'sixty cracked stages');
assert.strictEqual(S.STAGES.length, 160, 'TiltStages holds the base 100 plus the 60');
assert.strictEqual(S.CHAPTERS.length, 16, 'ten base chapters plus six');
require('../src/stages-cracked.js');
assert.strictEqual(S.STAGES.length, 160, 'loading twice must not duplicate stages');

var names = {}, lastPar = 0, trays = {}, solved = 0;
S.STAGES.forEach(function (d, i) {
  assert.strictEqual(d.id, i + 1, 'ids are contiguous at ' + d.id);
  assert(!names[d.name], 'duplicate stage name ' + d.name);
  names[d.name] = true;
});
S.CHAPTERS.forEach(function (c, i) {
  assert.strictEqual(c.number, i + 1, 'chapter numbers are contiguous');
  assert.strictEqual(c.from, i ? S.CHAPTERS[i - 1].to + 1 : 1, 'chapter ' + c.number + ' starts where the last ended');
});
assert.strictEqual(S.CHAPTERS[15].to, 160, 'the last chapter ends at the last stage');

cracked.STAGES.forEach(function (d) {
  var stage;
  try { stage = E.compile({ id: d.id, board: d.board }); } catch (e) { fail(d.id + ' does not compile: ' + e.message); }
  if (!stage.rules.hazard) fail(d.id + ' has no cracked ice');
  var w = stage.w, h = stage.h;
  if (w < 4 || w > 6 || h < 4 || h > 6) fail(d.id + ' is ' + w + '×' + h);
  trays[w + 'x' + h] = (trays[w + 'x' + h] || 0) + 1;
  var floor = new Uint8Array(w * h);
  for (var i = 0; i < w * h; i++) floor[i] = stage.terrain[i] === E.WALL ? 0 : 1;
  if (!F.isWholeFloe(w, h, floor)) fail(d.id + ' is not one floe');
  var penguins = stage.colour.filter(function (c) { return c === 1 || c === 2; }).length;
  if (penguins !== 2) fail(d.id + ' needs two penguins');
  var r = E.solve(stage, null, 400000);
  if (!r.solvable || r.moves !== d.par) fail(d.id + ' par ' + d.par + ' but engine found ' + r.moves);
  if (d.par < lastPar) fail(d.id + ' breaks the par order');
  lastPar = d.par;

  // Fairness over the whole reachable graph. Cracking a penguin is excluded
  // (the game rewinds it); so is collecting, which may remove a needed brake.
  var g = E.graph(stage, 200000);
  if (!g) fail(d.id + ' graph too large');
  var rev = g.states.map(function () { return []; });
  for (var s = 0; s < g.n; s++) for (var k = 0; k < 4; k++) if (g.next[s][k] !== s) rev[g.next[s][k]].push(s);
  var ok = new Uint8Array(g.n), q = [];
  for (s = 0; s < g.n; s++) if (g.clear[s]) { ok[s] = 1; q.push(s); }
  for (var head = 0; head < q.length; head++) rev[q[head]].forEach(function (p) { if (!ok[p] && !g.broken[p]) { ok[p] = 1; q.push(p); } });
  for (s = 0; s < g.n; s++) {
    if (!ok[s] || g.clear[s]) continue;
    for (k = 0; k < 4; k++) {
      var j = g.next[s][k];
      if (j === s || g.broken[j] || ok[j]) continue;
      if (g.states[j].collected === g.states[s].collected) fail(d.id + ' has an ordinary-move trap');
    }
  }
  solved++;
});
for (var id = 101; id <= 160; id++) assert(S.STAGES[id - 1].hint && S.STAGES[id - 1].hint.ja && S.STAGES[id - 1].hint.en, 'hint on ' + id);
console.log('cracked band ok: ' + solved + ' stages, trays ' + JSON.stringify(trays) + ', par ' + cracked.STAGES[0].par + '-' + lastPar);
