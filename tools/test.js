'use strict';

var assert = require('assert');
var E = require('../src/engine.js');
var STAGES = require('../src/stages.js').STAGES;

assert.strictEqual(STAGES.length, 5, 'campaign must contain five stages');

STAGES.forEach(function (def, index) {
  var stage = E.compile(def);
  assert.strictEqual(def.id, index + 1, 'stage ids must be sequential');
  assert.strictEqual(stage.w, 5, 'ice campaign boards are five cells wide');
  assert.strictEqual(stage.h, 5, 'ice campaign boards are five cells tall');
  assert.strictEqual(stage.rules.hazard, true, 'every stage teaches or reinforces cracked ice');
  assert(stage.blocks.length >= 1 && stage.blocks.length <= 2, 'stage has at most two blocks');
  assert.strictEqual(stage.goalCells.length, stage.blocks.length, 'one goal per block');

  var solved = E.solve(stage, null, 50000);
  assert(solved.solvable, 'stage ' + def.id + ' must be solvable');
  assert.strictEqual(solved.moves, def.par, 'stage ' + def.id + ' par must match the solver');
});

// Adjacent blocks are only physical obstacles; contact is never a clear state.
var contact = E.compile({ id: 'contact', board: ['A.B.', 'a.b.'] });
var touching = E.simulate(contact, E.initialState(contact), 'R', { frames: false });
assert.strictEqual(touching.clear, false, 'touching blocks must not clear a stage');
assert.strictEqual(touching.state.collected, 0, 'touching blocks must not be collected');

// A block may stand on the other block's goal without being collected.
var colours = E.compile({ id: 'colours', board: ['aB', 'A.', 'b.'] });
var wrongGoal = E.simulate(colours, E.initialState(colours), 'L', { frames: false });
assert.strictEqual(wrongGoal.state.collected, 0, 'a wrong-colour goal must not collect');

assert.throws(function () {
  E.compile({ id: 'old-match', win: 'match', board: ['A.B', 'a.b'] });
}, /unknown win condition/, 'the removed contact-clear mode must be rejected');

assert.throws(function () {
  E.compile({ id: 'too-many', board: ['AAB', 'ab.'] });
}, /one or two movable blocks/, 'more than two blocks must be rejected');

assert.throws(function () {
  E.compile({ id: 'missing-goal', board: ['AB', 'a.'] });
}, /one goal per block/, 'every block must have a goal');

// Cracked ice may be crossed, but ending a move on it breaks the penguin's run.
var hazard = E.compile({ id: 'hazard', board: ['a.', '.A', '.x'] });
var broken = E.simulate(hazard, E.initialState(hazard), 'D', { frames: false });
assert.strictEqual(hazard.rules.hazard, true, 'x must compile as cracked ice');
assert.strictEqual(broken.broken, true, 'stopping on cracked ice must end the run');
assert.strictEqual(broken.state.lost, 1, 'the stopped penguin must be marked lost');

console.log('ok - five ice stages, matching goals, and cracked-ice rules are valid');

