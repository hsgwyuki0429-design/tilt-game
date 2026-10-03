'use strict';
var assert=require('assert');
var fs=require('fs'),path=require('path');
var E=require('../src/engine.js');
var X=require('../src/expression.js');
require('./campaign-test.js');

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

// ---------------------------------------------------------------------------
// penguin expressions
// ---------------------------------------------------------------------------
//
// The rendering half is proved in the browser (tools/expression-test.js). What
// belongs here is the half that decides anything: the move evaluator, whose
// entire job is to never call a move good or bad unless the solver said so.

assert.strictEqual(X.EXPRESSIONS.length, 9, 'nine named expressions');
var faceFiles = Object.create(null);
X.EXPRESSIONS.forEach(function (name) {
  var file = X.FACE_FILES[name];
  assert(file, name + ' must name a face asset');
  assert(!faceFiles[file], name + ' must have a drawing of its own, not ' +
    faceFiles[file] + "'s");
  faceFiles[file] = name;
  assert(X.PRIORITY[name] != null, name + ' must have a priority');
});

// The per-colour sets are drawings of the same nine expressions with the body
// in the penguin's own colour. Only files that exist may be declared — a path
// named here that is not on disk is a 404 on every load — and a set is used
// only once it is whole, so a penguin can never change body colour halfway
// through its own expressions.
var declared = Object.create(null);
Object.keys(X.COLOUR_FACE_FILES).forEach(function (setName) {
  var set = X.COLOUR_FACE_FILES[setName];
  Object.keys(set).forEach(function (name) {
    assert(X.EXPRESSIONS.indexOf(name) >= 0,
      setName + ' names an expression that does not exist: ' + name);
    assert(fs.existsSync(path.join(__dirname, '..', set[name])),
      setName + '.' + name + ' names a file that is not on disk: ' + set[name]);
    assert(!declared[set[name]], set[name] + ' is declared twice');
    declared[set[name]] = true;
  });
  var missing = X.missingFor(setName);
  assert.strictEqual(missing.length, 9 - Object.keys(set).length,
    setName + ': missingFor must name exactly what is not declared');
});
assert(Object.keys(X.COLOUR_SETS).length >= 1, 'a colour must map to a set');

// FAIL > CLEAR > DANGER > PERFECT > MISS > SURPRISE > GOOD > BAD > NORMAL
var order = ['fail', 'clear', 'danger', 'perfect', 'miss', 'surprise', 'good', 'bad', 'normal'];
order.forEach(function (name, i) {
  if (!i) return;
  assert(X.PRIORITY[order[i - 1]] > X.PRIORITY[name],
    name + ' must rank below ' + order[i - 1]);
});

// Every reaction pose starts and ends exactly where the penguin already was,
// so no reaction can leave a block drawn off its own cell.
X.EXPRESSIONS.forEach(function (name) {
  var anim = X.ANIM[name];
  if (!anim) return;
  assert(anim.ms >= 200 && anim.ms <= 500, name + ': a beat, not a performance');
  [0, 1].forEach(function (p) {
    var q = X.pose(anim.kind, p, 'L');
    assert(Math.abs(q.scale - 1) < 1e-9 && Math.abs(q.dx) < 1e-9 && Math.abs(q.dy) < 1e-9,
      name + ': the pose must rest at the block\'s own cell at p=' + p);
  });
});

function dist(moves, opts) {
  return {
    solvable: !opts || opts.solvable !== false,
    exact: !opts || opts.exact !== false,
    moves: moves
  };
}
function verdict(from, to, ctx) {
  ctx = ctx || {};
  ctx.beforeDist = dist(from.moves != null ? from.moves : from, from);
  ctx.afterDist = dist(to.moves != null ? to.moves : to, to);
  return X.evaluateMove(null, null, ctx);
}

// A move is good only when it provably shortened the solution by one.
assert.strictEqual(verdict({ moves: 6 }, { moves: 5 }).type, 'good',
  'one move off the solution length is a good move');
assert.strictEqual(verdict({ moves: 6 }, { moves: 6 }).type, 'normal',
  'a move that changes nothing is not a verdict');
assert.strictEqual(verdict({ moves: 6 }, { moves: 8 }).type, 'bad',
  'a move that lengthens the solution is a bad move');

// PERFECT is a good move plus a reason.
assert.strictEqual(verdict({ moves: 2 }, { moves: 1 }).type, 'perfect',
  'a move that leaves one to go is perfect');
assert.strictEqual(verdict({ moves: 6 }, { moves: 5 }, { streak: 2 }).type, 'perfect',
  'a run of shortest moves is perfect');
assert.strictEqual(verdict({ moves: 6 }, { moves: 5 }, { bigMovers: 2 }).type, 'perfect',
  'two penguins carried a long way on a shortest move is perfect');

// And nothing at all is claimed when the solver could not answer exactly. This
// is the rule the whole feature rests on: a wrong BAD is worse than silence.
[
  [{ moves: -1, exact: false }, { moves: 5 }],
  [{ moves: 6 }, { moves: -1, exact: false }],
  [{ moves: 6 }, { moves: -1, solvable: false }],
  [{ moves: -1, solvable: false }, { moves: 5 }]
].forEach(function (pair) {
  var v = verdict(pair[0], pair[1]);
  assert.strictEqual(v.confidence, 0, 'an unanswered solver produces no verdict');
  assert.strictEqual(v.type, 'normal', 'and shows the normal face');
});

console.log('ok - engine rules and all nine expression contracts');
