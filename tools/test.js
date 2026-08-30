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
// no stage is another stage's leftovers
// ---------------------------------------------------------------------------
// Matching openings is the easy half. The hard half is a short board that IS a
// position a longer board passes through: solve the long one and you have
// already solved the short one from there, so meeting it later is replaying a
// stage rather than playing one. A board is therefore identified by every
// position it can reach that could itself be an opening — nothing collected,
// nothing lost, no block on an aurora — compared up to the square's eight
// symmetries and renaming the two colours.
var PERMS = (function () {
  var fns = [
    function (x, y) { return [x, y]; }, function (x, y) { return [4 - x, y]; },
    function (x, y) { return [x, 4 - y]; }, function (x, y) { return [4 - x, 4 - y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [4 - y, x]; },
    function (x, y) { return [y, 4 - x]; }, function (x, y) { return [4 - y, 4 - x]; }
  ];
  return fns.map(function (f) {
    var p = new Array(25);
    for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++) {
      var r = f(x, y); p[y * 5 + x] = r[1] * 5 + r[0];
    }
    return p;
  });
})();
var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

function canonical(flat) {
  var best = null, swap, i, c;
  for (swap = 0; swap < 2; swap++) {
    var src = swap ? flat.split('').map(function (ch) { return SWAP[ch]; }).join('') : flat;
    for (i = 0; i < 8; i++) {
      var p = PERMS[i], out = new Array(25);
      for (c = 0; c < 25; c++) out[p[c]] = src[c];
      var s = out.join('');
      if (best === null || s < best) best = s;
    }
  }
  return best;
}
function positionKey(stage, st) {
  if (st.collected || (st.lost || 0)) return null;
  var cells = new Array(25), c, i;
  for (c = 0; c < 25; c++) {
    cells[c] = stage.terrain[c] === E.WALL ? '#'
      : stage.terrain[c] === E.HAZARD ? 'x'
      : stage.goal[c] ? (stage.goalColour[c] === 1 ? 'a' : 'b') : '.';
  }
  for (i = 0; i < st.pos.length; i++) {
    if (!st.alive[i]) return null;
    c = st.pos[i][1] * 5 + st.pos[i][0];
    if (cells[c] !== '.') return null;
    cells[c] = stage.colour[i] === 1 ? 'A' : stage.colour[i] === 2 ? 'B' : 'G';
  }
  return canonical(cells.join(''));
}

var openings = Object.create(null);
STAGES.forEach(function (def) {
  var key = canonical(def.board.join(''));
  assert(!openings[key], 'stage ' + def.id + ' opens on the same board as stage ' + openings[key]);
  openings[key] = def.id;
});

// And no two stages stand in the same room. A board's skeleton is what is left
// once every movable piece is lifted off it: the immovable blocks and the
// auroras. Two boards sharing one can be different puzzles and still look like
// the same level twice.
var skeletons = Object.create(null);
STAGES.forEach(function (def) {
  var key = canonical(def.board.join('').replace(/[ABG]/g, '.'));
  assert(!skeletons[key], 'stage ' + def.id + ' has the same walls and auroras as stage ' +
    skeletons[key]);
  skeletons[key] = def.id;
});

// Coarser still, and by far the scarcest: the immovable blocks alone. Only one
// arrangement has none and six have one, so at most seven stages can be that
// open — the rest of the ladder is built out of walls, and no two stages may
// stand on the same ones. Colour plays no part, so these keys are taken over
// the eight symmetries only.
//
// Two keys, and a stage has to be new under both. Counting every wall stops two
// stages LOOKING alike; counting only the walls that change the par stops two
// being the same puzzle behind a wall that does nothing. Neither implies the
// other — the same walls with different pieces can leave different ones idle —
// and with only the first, eight stages once duplicated another's real walls by
// carrying a wall that did no work.
function symmetryKey(flat) {
  var best = null;
  for (var i = 0; i < 8; i++) {
    var p = PERMS[i], out = new Array(25);
    for (var c = 0; c < 25; c++) out[p[c]] = flat[c];
    var t = out.join('');
    if (best === null || t < best) best = t;
  }
  return best;
}
var plainWalls = Object.create(null), realWalls = Object.create(null);
var inertWalls = 0;
STAGES.forEach(function (def) {
  var flat = def.board.join(''), cells = flat.split(''), c;
  for (c = 0; c < 25; c++) {
    if (cells[c] !== '#' && cells[c] !== 'x') { cells[c] = '.'; continue; }
    var probe = flat.split('');
    probe[c] = '.';
    var rows = [];
    for (var y = 0; y < 5; y++) rows.push(probe.slice(y * 5, y * 5 + 5).join(''));
    var without = E.solve(E.compile({ id: def.id, board: rows }), null, 400000);
    if (without.solvable && without.moves === def.par) { cells[c] = '.'; inertWalls++; }
  }
  var plain = symmetryKey(flat.replace(/[^#x]/g, '.'));
  assert(!plainWalls[plain], 'stage ' + def.id + ' stands on the same walls as stage ' +
    plainWalls[plain]);
  plainWalls[plain] = def.id;

  var real = symmetryKey(cells.join(''));
  assert(!realWalls[real], 'stage ' + def.id + ' solves against the same walls as stage ' +
    realWalls[real]);
  realWalls[real] = def.id;
});
STAGES.forEach(function (def) {
  var stage = E.compile(def);
  E.reachable(stage, null, 80000).forEach(function (st) {
    var key = positionKey(stage, st);
    if (!key || openings[key] === undefined || openings[key] === def.id) return;
    assert.fail('stage ' + def.id + ' passes through the opening position of stage ' + openings[key]);
  });
});

// ---------------------------------------------------------------------------
// obstacles that earn their place, and the few the wall rule forces
// ---------------------------------------------------------------------------
// Take each wall, hazard and drifter off in turn: if the par is unchanged and
// the board still solvable, that obstacle does nothing.
//
// Drifters are held to it absolutely. Walls cannot be, and the reason is the
// uniqueness rule above rather than a slack search: a hundred stages need a
// hundred wall plans, only seven arrangements have fewer than two walls, and a
// two-move board has no use for three of them. Something has to give, and the
// campaign gives here — but the count is asserted rather than ignored, so the
// price stays visible and cannot quietly grow.
var INERT_WALL_BUDGET = 25;
STAGES.forEach(function (def) {
  def.board.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      if (row[x] !== 'G') continue;
      var board = def.board.slice();
      board[y] = row.slice(0, x) + '.' + row.slice(x + 1);
      var without = E.solve(E.compile({ id: def.id, board: board }), null, 400000);
      assert(!without.solvable || without.moves !== def.par,
        'stage ' + def.id + ': the drifter at ' + x + ',' + y +
        ' changes nothing — par is still ' + def.par + ' without it');
    }
  });
});
assert(inertWalls <= INERT_WALL_BUDGET,
  inertWalls + ' walls change nothing, over the budget of ' + INERT_WALL_BUDGET);

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
  ' on a straight line (' + step.toFixed(3) + ' moves per stage), no stage inside\n'  +
  '     another and none on shared walls, ' + inertWalls + ' inert walls, rules verified');
