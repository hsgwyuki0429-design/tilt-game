'use strict';

var assert = require('assert');
var E = require('../src/engine.js');
var MOD = require('../src/stages.js');
var STAGES = MOD.STAGES;
var CHAPTERS = MOD.CHAPTERS;

// ---------------------------------------------------------------------------
// the campaign
// ---------------------------------------------------------------------------
assert.strictEqual(STAGES.length, 100, 'the campaign contains one hundred stages');

var seen = Object.create(null);
var pars = [];

STAGES.forEach(function (def, index) {
  var stage = E.compile(def);
  var where = 'stage ' + def.id;

  assert.strictEqual(def.id, index + 1, 'stage ids must be sequential');
  assert.strictEqual(stage.w, 5, where + ': boards are five cells wide');
  assert.strictEqual(stage.h, 5, where + ': boards are five cells tall');

  // One penguin per colour, at most two colours, one matching aurora each.
  assert(stage.penguins >= 1 && stage.penguins <= 2, where + ': one or two penguins');
  assert.strictEqual(stage.goalCells.length, stage.penguins, where + ': one aurora per penguin');
  var colours = stage.colour.filter(function (c) { return c !== E.GRAY; });
  assert.strictEqual(new Set(colours).size, colours.length, where + ': a colour carries one penguin');

  // No two stages ship the same puzzle.
  var key = def.board.join('|');
  assert(!seen[key], where + ': duplicates stage ' + seen[key]);
  seen[key] = def.id;

  // The par printed in the HUD is the one the solver proves, not a guess.
  var solved = E.solve(stage, null, 400000);
  assert(solved.solvable, where + ' must be solvable');
  assert.strictEqual(solved.moves, def.par, where + ': par must match the solver');
  pars.push(def.par);
});

// ---------------------------------------------------------------------------
// every obstacle earns its place
// ---------------------------------------------------------------------------
// The campaign is built by ranking boards of equal par by how empty they are,
// so a board carrying an obstacle it does not need means the search measured
// something other than the game. Take each wall, hazard and drifter away in
// turn: the par has to change, or the board has to stop being solvable.
STAGES.forEach(function (def) {
  def.board.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      if ('#xG'.indexOf(row[x]) < 0) continue;
      var board = def.board.slice();
      board[y] = row.slice(0, x) + '.' + row.slice(x + 1);
      var without = E.solve(E.compile({ id: def.id, board: board }), null, 400000);
      assert(!without.solvable || without.moves !== def.par,
        'stage ' + def.id + ': the ' + row[x] + ' at ' + x + ',' + y +
        ' changes nothing — par is still ' + def.par + ' without it');
    }
  });
});

// ---------------------------------------------------------------------------
// the difficulty curve
// ---------------------------------------------------------------------------
// The campaign is laid out along a straight line: stage 1 is one swipe, the
// last stage is the longest board the search found, and the step from one
// stage to the next is constant. Rounding to whole moves is the only thing
// allowed to bend it, so no stage may sit more than half a step off the line.
var first = pars[0], last = pars[pars.length - 1];
assert.strictEqual(first, 1, 'the campaign opens on a one-move board');
assert.strictEqual(last, Math.max.apply(null, pars), 'the last stage is the longest board');

var step = (last - first) / (STAGES.length - 1);
pars.forEach(function (par, i) {
  var line = first + i * step;
  assert(Math.abs(par - line) <= 0.5 + 1e-9,
    'stage ' + (i + 1) + ': par ' + par + ' is off the difficulty line (' + line.toFixed(2) + ')');
});
for (var i = 1; i < pars.length; i++) {
  assert(pars[i] >= pars[i - 1], 'stage ' + (i + 1) + ' is shorter than the stage before it');
}

// ---------------------------------------------------------------------------
// chapters cover the campaign exactly once
// ---------------------------------------------------------------------------
var covered = 0;
CHAPTERS.forEach(function (chap, i) {
  assert(chap.from <= chap.to, 'chapter ' + chap.number + ' is empty');
  if (i) assert.strictEqual(chap.from, CHAPTERS[i - 1].to + 1, 'chapters must not leave a gap');
  covered += chap.to - chap.from + 1;
});
assert.strictEqual(CHAPTERS[0].from, 1, 'the first chapter starts at stage 1');
assert.strictEqual(covered, STAGES.length, 'every stage belongs to exactly one chapter');

// ---------------------------------------------------------------------------
// the rules themselves
// ---------------------------------------------------------------------------

// Adjacent blocks are only physical obstacles; contact is never a clear state.
var contact = E.compile({ id: 'contact', board: ['A.B.', 'a.b.'] });
var touching = E.simulate(contact, E.initialState(contact), 'R', { frames: false });
assert.strictEqual(touching.clear, false, 'touching blocks must not clear a stage');
assert.strictEqual(touching.state.collected, 0, 'touching blocks must not be collected');

// A block may stand on the other block's goal without being collected.
var colours = E.compile({ id: 'colours', board: ['aB', 'A.', 'b.'] });
var wrongGoal = E.simulate(colours, E.initialState(colours), 'L', { frames: false });
assert.strictEqual(wrongGoal.state.collected, 0, 'a wrong-colour goal must not collect');

// A drifter slides, is never collected, and does not hold up a clear.
var drift = E.compile({ id: 'drift', board: ['G..', 'A.a'] });
assert.strictEqual(drift.drifters, 1, 'G must compile as a drifter');
assert.strictEqual(drift.penguins, 1, 'a drifter is not a penguin');
assert.strictEqual(drift.mustCollect, 1, 'only the penguin has to be collected');
var drifted = E.simulate(drift, E.initialState(drift), 'R', { frames: false });
assert.deepStrictEqual(drifted.state.pos[0], [2, 0], 'the drifter must slide with gravity');
assert.strictEqual(drifted.state.alive[0], 1, 'the drifter must not be collected');
assert.strictEqual(drifted.clear, true, 'a drifter left on the board must not block a clear');

// A drifter resting on an aurora plugs it: the aurora does not accept it, and
// the cell is occupied, so the penguin cannot reach its own goal.
var plug = E.compile({ id: 'plug', board: ['.Ga', '..A']  });
var plugged = E.simulate(plug, E.initialState(plug), 'R', { frames: false });
assert.strictEqual(plugged.state.collected, 0, 'a drifter must not be collected by an aurora');
assert.deepStrictEqual(plugged.state.pos[0], [2, 0], 'the drifter must stop on the aurora');
assert.strictEqual(plugged.clear, false, 'a plugged aurora must not clear the stage');

// A drifter is still a block, so cracked ice takes it and ends the run.
var brittle = E.compile({ id: 'brittle', board: ['G.', 'x.', '#a', '.A'] });
var sank = E.simulate(brittle, E.initialState(brittle), 'D', { frames: false });
assert.strictEqual(sank.broken, true, 'a drifter stopped on cracked ice ends the run');
assert.strictEqual(sank.state.lost, 1, 'the drifter is what was lost');

// Board vocabulary.
assert.throws(function () {
  E.compile({ id: 'old-match', win: 'match', board: ['A.B', 'a.b'] });
}, /unknown win condition/, 'the removed contact-clear mode must be rejected');

assert.throws(function () {
  E.compile({ id: 'too-many', board: ['AAB', 'ab.'] });
}, /one or two movable penguins/, 'more than two penguins must be rejected');

assert.throws(function () {
  E.compile({ id: 'twin', board: ['A.A', 'a..'] });
}, /at most one penguin/, 'two penguins of one colour must be rejected');

assert.throws(function () {
  E.compile({ id: 'missing-goal', board: ['AB', 'a.'] });
}, /one goal per penguin/, 'every penguin must have an aurora');

assert.throws(function () {
  E.compile({ id: 'drift-only', board: ['G.', 'a.'] });
}, /one or two movable penguins/, 'a board of nothing but drifters is not a stage');

// Cracked ice may be crossed, but ending a move on it breaks the penguin's run.
var hazard = E.compile({ id: 'hazard', board: ['a.', '.A', '.x'] });
var broken = E.simulate(hazard, E.initialState(hazard), 'D', { frames: false });
assert.strictEqual(hazard.rules.hazard, true, 'x must compile as cracked ice');
assert.strictEqual(broken.broken, true, 'stopping on cracked ice must end the run');
assert.strictEqual(broken.state.lost, 1, 'the stopped penguin must be marked lost');

console.log('ok - ' + STAGES.length + ' stages, par ' + first + '…' + last +
  ' on a straight line (' + step.toFixed(3) + ' moves per stage), rules verified');
