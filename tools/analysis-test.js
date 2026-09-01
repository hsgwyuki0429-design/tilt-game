'use strict';
/*
 * TILT — tests for the good-board search.
 *
 *   node tools/analysis-test.js          (also run by `npm test`)
 *
 * tools/test.js proves the shipped campaign is what it says it is. This file
 * proves the machinery that will choose the NEXT campaign is: that the analysis
 * agrees with the solver, that it does not care which way up a board is drawn
 * or which colour is called A, that it notices the specific things it claims to
 * notice, and that its labels still mean something after somebody adjusts a
 * threshold.
 *
 * The last one is the one that will actually catch a mistake. A category is
 * only useful while it is unusual; a well-meant tweak that makes AHA true of
 * four boards in five has deleted the category without deleting any code, and
 * nothing but a membership assertion notices.
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var E = require('../src/engine.js');
var A = require('./lib/level-analysis.js');
var SCORE = require('./lib/fun-score.js');
var K = require('./lib/board-keys.js');
var LS = require('./level-search.js');

var checks = 0;
function ok(what) { checks++; if (process.env.TILT_VERBOSE) console.log('  · ' + what); }

// ---------------------------------------------------------------------------
// a fixed set of boards to test against
// ---------------------------------------------------------------------------
/* Hand-written, small, and each one there for a reason. Anything drawn from the
   index instead would move the day somebody re-runs a search. */
var BOARDS = {
  // One penguin, one wall, and the wall is the only thing that can stop it on
  // its aurora — take the wall away and the board is unsolvable.
  stopShort:   ['#a..', 'A...', '....', '....'],
  // Two penguins on an empty tray. The only brakes here are the edge and each
  // other, so any braking at all is one penguin stopping the other.
  bareTwo:     ['abB.', 'A...', '....', '....'],
  // The long 4×4 the enumeration finds with a single wall.
  long4:       ['B#A.', '....', 'a...', '..b.'],
  // Four moves, one wall, and both penguins in each other's way.
  tight4:      ['#.A.', '...a', '..Bb', '....'],
  // The same puzzle as stopShort, drawn on the bigger tray it does not need.
  cornered5:   ['#a...', 'A....', '.....', '.....', '.....'],
  // One swipe.
  trivial:     ['aA..', '....', '....', '....']
};

function analyse(rows) { return A.analyzeLevel(rows, { noCache: true }); }

// ---------------------------------------------------------------------------
// 1. the analysis and the solver agree about how long a board is
// ---------------------------------------------------------------------------
/* The whole thing rests on this. Every number below is read off a graph this
   file builds itself, and if that graph disagreed with src/engine.js about the
   shortest solution then nothing else it says would be about the game people
   play. Checked on hand-written boards, on every shipped stage, and on a slice
   of the measured index — and the solution it reports is replayed move by move
   through the engine, so it is a solution and not merely the right length. */
function agreesWithSolver(rows, where) {
  var r = analyse(rows);
  var stage = E.compile({ id: 'check', board: rows });
  var solved = E.solve(stage, null, 400000);
  assert.strictEqual(r.solvable, solved.solvable, where + ': solvable must agree');
  if (!solved.solvable) return;
  assert.strictEqual(r.par, solved.moves, where + ': par must match the solver');

  var state = E.initialState(stage);
  for (var i = 0; i < r.solution.length; i++) {
    var res = E.simulate(stage, state, r.solution[i], { frames: false });
    assert(res.moved, where + ': move ' + (i + 1) + ' of the reported solution does nothing');
    state = res.state;
  }
  assert(E.isClear(stage, state), where + ': the reported solution must clear the board');
  assert.strictEqual(r.solution.length, r.par, where + ': the solution must be par long');
}

Object.keys(BOARDS).forEach(function (name) { agreesWithSolver(BOARDS[name], name); });
ok('hand-written boards agree with the solver');

require('../src/stages.js').STAGES.forEach(function (def) {
  var r = analyse(def.board);
  assert.strictEqual(r.par, def.par,
    'stage ' + def.id + ': the analysis says par ' + r.par + ', the campaign says ' + def.par);
});
ok('all 100 shipped stages agree with the solver');

(function () {
  var idx = JSON.parse(fs.readFileSync(path.join(__dirname, 'level-index.json'), 'utf8')).pars;
  var n = 0;
  Object.keys(idx).map(Number).sort(function (a, b) { return a - b; }).forEach(function (par) {
    idx[par].forEach(function (e, i) {
      if (i % 40) return;                            // a fixed slice, not a sample
      n++;
      var r = analyse(e.rows);
      assert.strictEqual(r.par, e.moves,
        'index par ' + par + ': analysis says ' + r.par + ', the index says ' + e.moves);
    });
  });
  ok(n + ' boards from the measured index agree with the solver');
})();

// ---------------------------------------------------------------------------
// 2. which way up the board is drawn changes nothing
// ---------------------------------------------------------------------------
/* All sixteen presentations: eight symmetries of the square, each with the two
   colour namings. A board turned round is the same puzzle, so every judgement
   about it has to be the same — including the chosen shortest solution, which
   is why tools/lib/level-analysis.js breaks ties on an invariant key rather
   than on compass order. */
var INVARIANT = [
  'par', 'funPotential', 'ahaPotential', 'interactionScore', 'choiceScore',
  'solutionEleganceScore', 'simplicityScore', 'sizeEfficiency', 'difficultyScore',
  'cognitiveLoadScore', 'difficulty', 'canonicalId', 'skeletonId',
  'solutionFingerprint', 'activeAreaRatio', 'activeBoundingSide',
  'meaningfulDecisionCount', 'forcedMoveRatio', 'penguinBrakeCount',
  'dependencyCount', 'collectionOrderDependency', 'meaningfulWallCount',
  'redundantWallCount', 'moveAwayFromGoalCount', 'goalPassThroughCount',
  'counterIntuitiveMoveCount', 'delayedCollectionCount', 'requiredLookahead',
  'repeatedPatternPenalty', 'directionEntropy', 'revisitCount',
  'deadEndMoveCount', 'wrongButRecoverableCount', 'openingDeadEndRate',
  'reachableStateCount'
];

Object.keys(BOARDS).forEach(function (name) {
  var rows = BOARDS[name];
  var ref = analyse(rows);
  if (!ref.solvable) return;
  for (var v = 0; v < 16; v++) {
    var other = analyse(K.present(rows, v));
    INVARIANT.forEach(function (key) {
      assert.deepStrictEqual(other[key], ref[key],
        name + ' presented as variant ' + v + ': ' + key + ' changed from ' +
        ref[key] + ' to ' + other[key]);
    });
    assert.deepStrictEqual(other.categories, ref.categories,
      name + ' variant ' + v + ': the categories changed');
  }
});
ok('rotation, reflection and colour swap leave every judgement unchanged');

// The colour swap on its own, spelled out: it is variant 8, and it is the one
// people get wrong, because half the code has a reason to look at colour 1.
(function () {
  var rows = BOARDS.long4;
  var swapped = K.present(rows, 8);
  assert.notStrictEqual(swapped.join(''), rows.join(''), 'variant 8 must actually swap');
  var a = analyse(rows), b = analyse(swapped);
  assert.strictEqual(a.par, b.par, 'a colour swap must not change par');
  assert.strictEqual(a.interactionScore, b.interactionScore,
    'a colour swap must not change the interaction score');
  assert.strictEqual(a.canonicalId, b.canonicalId, 'a colour swap must not change identity');
})();
ok('renaming the two penguins changes nothing');

// ---------------------------------------------------------------------------
// 3. a wall that does nothing is found
// ---------------------------------------------------------------------------
/* Take a board, add a wall somewhere the puzzle never touches, and check the
   par is unchanged — that is what "does nothing" means — and then that the
   analysis says so and prices it. This is the rule the shipped campaign already
   lives under, applied before a board is ever shortlisted. */
(function () {
  var plain = ['A...', '....', '....', '...a'];
  var before = analyse(plain);
  assert.strictEqual(before.redundantWallCount, 0, 'a board with no walls has no idle walls');

  var padded = ['A...', '....', '.#..', '...a'];
  var solvedPlain = E.solve(E.compile({ id: 'a', board: plain }), null, 400000);
  var solvedPadded = E.solve(E.compile({ id: 'b', board: padded }), null, 400000);
  assert.strictEqual(solvedPadded.moves, solvedPlain.moves,
    'the test wall must genuinely change nothing — otherwise this proves nothing');

  var after = analyse(padded);
  assert.strictEqual(after.wallCount, 1, 'the wall is on the board');
  assert.strictEqual(after.redundantWallCount, 1, 'and the analysis must call it idle');
  assert.strictEqual(after.meaningfulWallCount, 0, 'no wall here earns its place');
  assert(after.funPotential < before.funPotential,
    'a board carrying an idle wall must not score better than the same board without it');
})();
ok('a wall that changes nothing is detected and priced');

// A wall that does earn its place is not mistaken for one that does not.
(function () {
  var r = analyse(BOARDS.stopShort);
  assert.strictEqual(r.wallCount, 1, 'stopShort has one wall');
  assert.strictEqual(r.redundantWallCount, 0, 'and it is doing the work');
  assert.strictEqual(r.meaningfulWallCount, 1, 'so it counts as meaningful');
})();
ok('a wall that earns its place is kept');

// ---------------------------------------------------------------------------
// 4. one penguin stopping the other is seen
// ---------------------------------------------------------------------------
/* A board built so that the answer is impossible without one penguin standing
   in the other's way. Nothing about it is subtle: if `penguinBrakeCount` and
   `dependencyCount` are both zero here, the interaction analysis is broken. */
(function () {
  [BOARDS.bareTwo, BOARDS.tight4].forEach(function (rows) {
    var r = analyse(rows);
    var where = rows.join('/');
    assert.strictEqual(r.penguinCount, 2, where + ' has two penguins');
    assert(r.penguinBrakeCount >= 1,
      where + ': one penguin must be seen stopping the other (got ' + r.penguinBrakeCount + ')');
    assert(r.dependencyCount >= 1,
      where + ': at least one move must depend on the other penguin (got ' +
      r.dependencyCount + ')');
    assert.strictEqual(r.soloIndependent, false, where + ': the penguins are not independent');
    assert(r.interactionScore > 0, where + ': the interaction score must be above zero');
  });

  // The counterfactual the score rests on, done by hand: take the other penguin
  // off the ice and the survivor ends somewhere else.
  var rows = BOARDS.bareTwo;
  var pair = E.compile({ id: 'pair', board: rows });
  var solo = E.compile({ id: 'solo', board: rows.map(function (row) {
    return row.replace(/[Bb]/g, '.');
  }) });
  var differs = E.DIRS.filter(function (dir) {
    var withBoth = E.simulate(pair, E.initialState(pair), dir, { frames: false }).state;
    var alone = E.simulate(solo, E.initialState(solo), dir, { frames: false }).state;
    return withBoth.pos[0][0] !== alone.pos[0][0] || withBoth.pos[0][1] !== alone.pos[0][1];
  });
  assert(differs.length >= 1,
    'the fixture must actually play differently with and without the other penguin');
})();
ok('a penguin used as a brake is detected');

// A one-penguin board can never score for interaction.
(function () {
  var r = analyse(BOARDS.stopShort);
  assert.strictEqual(r.interactionScore, 0, 'one penguin cannot interact with itself');
  assert.strictEqual(r.penguinBrakeCount, 0, 'and nothing brakes it but walls and edges');
  assert.strictEqual(r.categories.indexOf('INTERACTION'), -1,
    'a one-penguin board is never an INTERACTION board');
})();
ok('a single penguin scores no interaction');

// ---------------------------------------------------------------------------
// 5. a repetitive solution is penalised, a short one is not
// ---------------------------------------------------------------------------
(function () {
  assert.strictEqual(A.repeatedPatternPenalty('RDLU'), 0,
    'four moves in four directions is a solution, not a repetition');
  assert.strictEqual(A.repeatedPatternPenalty('RDL'), 0, 'three moves cannot repeat');
  assert(A.repeatedPatternPenalty('RDLURDLURDLU') > 0.5,
    'three laps of the same four moves must be penalised');
  assert(A.repeatedPatternPenalty('RLRLRLRL') > 0.8, 'a two-move cycle must be penalised hard');
  assert(A.repeatedPatternPenalty('RRRRRR') > 0.9, 'the same move six times is the worst case');
  assert(A.repeatedPatternPenalty('RDLURDLURDLU') > A.repeatedPatternPenalty('RDLUDRLU'),
    'a repeating solution must score worse than a varied one of the same length');

  // And it reaches the score: two boards, same everything else, the repetitive
  // one must come out lower on elegance.
  var varied = SCORE.solutionEleganceScore({
    directionEntropy: 1, stateChangeDensity: 0.5, repeatedPatternPenalty: 0
  });
  var repeats = SCORE.solutionEleganceScore({
    directionEntropy: 1, stateChangeDensity: 0.5, repeatedPatternPenalty: 0.9
  });
  assert(repeats < varied, 'the penalty must lower the elegance score');
})();
ok('short-period repetition in a solution is penalised');

// On a real board, found rather than asserted: some board in the index solves
// by repeating itself, and it must carry the penalty.
(function () {
  var idx = JSON.parse(fs.readFileSync(path.join(__dirname, 'level-index.json'), 'utf8')).pars;
  var found = null;
  Object.keys(idx).map(Number).sort(function (a, b) { return a - b; }).some(function (par) {
    if (par < 8 || par > 16) return false;         // long enough to repeat, cheap to analyse
    return idx[par].some(function (e) {
      if (e.grays || e.hazards) return false;
      var r = analyse(e.rows);
      if (r.solvable && r.repeatedPatternPenalty >= 0.8) { found = r; return true; }
      return false;
    });
  });
  assert(found, 'no board in the index solves by repetition — the fixture has gone stale');
  assert(found.solutionEleganceScore < 0.7,
    'a board that solves by repetition must not read as elegant');
})();
ok('a real board with a repeating solution is caught');

// ---------------------------------------------------------------------------
// 6. length alone is never a reason to like a board
// ---------------------------------------------------------------------------
/* The mistake the whole exercise exists to stop making. A long board with
   nothing in it must not out-score a short board with something in it, and the
   only way to be sure is to hand the scorer the two shapes directly. */
(function () {
  var corridor = {
    par: 40, penguinCount: 2, drifterCount: 0, wallCount: 4, hazardCount: 0,
    elementCount: 6, boardSize: 5, reachableStateCount: 500,
    moveAwayFromGoalCount: 1, goalPassThroughCount: 0, delayedCollectionCount: 0,
    counterIntuitiveMoveCount: 1, deceptiveChoiceRatio: 0.05, requiredLookahead: 1,
    penguinBrakeCount: 1, dependencyCount: 0, collectionOrderDependency: 0,
    sharedGravityInteractionCount: 30, soloIndependent: true,
    meaningfulDecisionCount: 1, forcedMoveRatio: 0.7, singleSafeMoveRatio: 0.1,
    averageUsefulBranching: 1.2, wrongButRecoverableCount: 4, deadEndMoveCount: 2,
    openingDeadEndRate: 0.25, directionEntropy: 0.5, repeatedPatternPenalty: 0.8,
    stateChangeDensity: 0.2, revisitCount: 0, activeAreaRatio: 0.5,
    activeBoundingSide: 5, meaningfulWallCount: 2, redundantWallCount: 2
  };
  var jewel = {
    par: 8, penguinCount: 2, drifterCount: 0, wallCount: 1, hazardCount: 0,
    elementCount: 3, boardSize: 4, reachableStateCount: 80,
    moveAwayFromGoalCount: 3, goalPassThroughCount: 2, delayedCollectionCount: 2,
    counterIntuitiveMoveCount: 3, deceptiveChoiceRatio: 0.5, requiredLookahead: 3,
    penguinBrakeCount: 3, dependencyCount: 3, collectionOrderDependency: 1,
    sharedGravityInteractionCount: 5, soloIndependent: false,
    meaningfulDecisionCount: 4, forcedMoveRatio: 0, singleSafeMoveRatio: 0.2,
    averageUsefulBranching: 2.5, wrongButRecoverableCount: 9, deadEndMoveCount: 2,
    openingDeadEndRate: 0.25, directionEntropy: 0.95, repeatedPatternPenalty: 0,
    stateChangeDensity: 0.6, revisitCount: 2, activeAreaRatio: 0.9,
    activeBoundingSide: 4, meaningfulWallCount: 1, redundantWallCount: 0
  };
  var a = SCORE.scoreLevel(corridor), b = SCORE.scoreLevel(jewel);
  assert(b.funPotential > a.funPotential,
    'the eight-move 4×4 must beat the forty-move 5×5 corridor (' +
    b.funPotential + ' vs ' + a.funPotential + ')');
  assert(b.difficultyScore > 0, 'and it must not be called trivial');
  assert(a.cognitiveLoadScore > b.cognitiveLoadScore,
    'the busier board must carry the higher cognitive load');
  assert(b.sizeEfficiency > a.sizeEfficiency, 'and the smaller board must use its tray better');
})();
ok('a long empty board does not out-score a short deep one');

// Cognitive load is measured, and never added to fun or difficulty.
(function () {
  var base = {
    par: 8, penguinCount: 2, drifterCount: 0, wallCount: 1, hazardCount: 0,
    elementCount: 3, boardSize: 4, reachableStateCount: 80,
    moveAwayFromGoalCount: 2, goalPassThroughCount: 1, delayedCollectionCount: 1,
    counterIntuitiveMoveCount: 2, deceptiveChoiceRatio: 0.3, requiredLookahead: 2,
    penguinBrakeCount: 2, dependencyCount: 2, collectionOrderDependency: 1,
    sharedGravityInteractionCount: 4, soloIndependent: false,
    meaningfulDecisionCount: 3, forcedMoveRatio: 0, singleSafeMoveRatio: 0.1,
    averageUsefulBranching: 2.4, wrongButRecoverableCount: 8, deadEndMoveCount: 1,
    openingDeadEndRate: 0.25, directionEntropy: 0.9, repeatedPatternPenalty: 0,
    stateChangeDensity: 0.5, revisitCount: 1, activeAreaRatio: 0.9,
    activeBoundingSide: 4, meaningfulWallCount: 1, redundantWallCount: 0
  };
  var busier = JSON.parse(JSON.stringify(base));
  busier.drifterCount = 2; busier.wallCount = 4; busier.elementCount = 8;
  busier.reachableStateCount = 600;
  var a = SCORE.scoreLevel(base), b = SCORE.scoreLevel(busier);
  assert(b.cognitiveLoadScore > a.cognitiveLoadScore, 'more pieces is more to hold in mind');
  assert(b.difficultyScore <= a.difficultyScore + 1e-9,
    'but it must not make the board count as harder');
  assert(b.funPotential < a.funPotential, 'and it must not make the board count as better');
})();
ok('cognitive load is separate from difficulty and from fun');

// ---------------------------------------------------------------------------
// 7. every score stays inside its range
// ---------------------------------------------------------------------------
var BOUNDED = ['funPotential', 'ahaPotential', 'interactionScore', 'choiceScore',
  'solutionEleganceScore', 'simplicityScore', 'sizeEfficiency', 'difficultyScore',
  'cognitiveLoadScore', 'activeAreaRatio', 'forcedMoveRatio', 'openingDeadEndRate',
  'directionEntropy', 'repeatedPatternPenalty', 'stateChangeDensity', 'deadEndStateRatio'];

// ---------------------------------------------------------------------------
// 8. the labels still mean something
// ---------------------------------------------------------------------------
/* Measured over a fixed, reproducible population: every 4×4 two-penguin board
   of par 4 or more with at most two walls, every twenty-third one taken. The
   bounds are wide on purpose — this is not pinning the thresholds, it is
   noticing when a category has become either universal or extinct, which is
   the way a scoring change quietly destroys the shortlist. */
(function () {
  var boards = [];
  LS.setSize(4);
  [0, 1, 2].forEach(function (statics) {
    LS.run({ penguins: 2, gray: 0, statics: statics, hazards: false }, {
      gate: function (moves) { return moves >= 4; },
      emit: function (e) { boards.push(e.rows); }
    });
  });
  var sample = boards.filter(function (_, i) { return i % 23 === 0; });
  assert(sample.length > 3000, 'the population should be a few thousand boards, got ' + sample.length);

  var seen = {}, bands = {}, uncategorised = 0, worstScore = null;
  sample.forEach(function (rows) {
    var r = analyse(rows);
    assert(r.solvable, 'every enumerated board is solvable');
    BOUNDED.forEach(function (key) {
      assert(r[key] >= 0 && r[key] <= 1,
        key + ' must stay in 0…1, got ' + r[key] + ' on ' + rows.join('/'));
    });
    if (!r.categories.length) uncategorised++;
    bands[r.difficulty] = (bands[r.difficulty] || 0) + 1;
    r.categories.forEach(function (c) {
      assert(SCORE.CATEGORIES.indexOf(c) >= 0, 'unknown category ' + c);
      seen[c] = (seen[c] || 0) + 1;
    });
    if (worstScore === null || r.funPotential > worstScore) worstScore = r.funPotential;
  });

  var n = sample.length;
  function rate(cat) { return (seen[cat] || 0) / n; }

  // Every category the 4×4 can produce has to actually turn up.
  ['AHA', 'INTERACTION', 'CHOICE', 'SEQUENCE', 'ELEGANT', 'TRAP', 'ORBIT'].forEach(function (cat) {
    assert(rate(cat) > 0.005,
      cat + ' matches ' + (100 * rate(cat)).toFixed(2) + '% of the 4×4 population — ' +
      'it has become too rare to be a shelf');
    assert(rate(cat) < 0.45,
      cat + ' matches ' + (100 * rate(cat)).toFixed(1) + '% of the 4×4 population — ' +
      'a label that fits half of everything is not a label');
  });
  // MASTER is meant to be rare.
  assert(rate('MASTER') < 0.08, 'MASTER must stay rare, got ' + (100 * rate('MASTER')).toFixed(1) + '%');
  // And a good share of boards must fail to be interesting, or nothing is filtered.
  assert(uncategorised / n > 0.15,
    'only ' + (100 * uncategorised / n).toFixed(1) + '% of boards fall through every category — ' +
    'the search would be keeping everything');
  // Cracked ice is not in the main pool, so HAZARD cannot appear in it.
  assert(!seen.HAZARD, 'a drifter-free, ice-free population cannot contain a HAZARD board');
  // The bands have to spread rather than pile into one.
  assert(Object.keys(bands).length >= 3, 'the 4×4 population must span at least three bands');
  ok('category rates over ' + n + ' 4×4 boards: ' + SCORE.CATEGORIES
    .filter(function (c) { return seen[c]; })
    .map(function (c) { return c + ' ' + (100 * rate(c)).toFixed(1) + '%'; }).join(', '));
})();

// ---------------------------------------------------------------------------
// 8b. two boards that look about as good are separated by the design brief
// ---------------------------------------------------------------------------
/* The selection rule is "if two candidates look about as promising, prefer the
   smaller board, then the plainer one, then the one with no idle wall, then the
   stronger aha". The word that makes it work is ABOUT: comparing an estimate
   carried to three decimals exactly would mean the rule never fires. This
   rebuilds the comparator the search uses and checks the ladder rung by rung. */
(function () {
  var FUN_BAND = 0.02;
  function band(r) { return Math.round(r.funPotential / FUN_BAND); }
  function better(a, b) {
    var d = band(b) - band(a);
    if (d) return d;
    if (a.boardSize !== b.boardSize) return a.boardSize - b.boardSize;
    if (a.elementCount !== b.elementCount) return a.elementCount - b.elementCount;
    if (a.redundantWallCount !== b.redundantWallCount) {
      return a.redundantWallCount - b.redundantWallCount;
    }
    var A = a.analysis, B = b.analysis;
    if (A.ahaPotential !== B.ahaPotential) return B.ahaPotential - A.ahaPotential;
    if (A.interactionScore !== B.interactionScore) return B.interactionScore - A.interactionScore;
    if (A.choiceScore !== B.choiceScore) return B.choiceScore - A.choiceScore;
    if (a.par !== b.par) return a.par - b.par;
    return a.canonicalId < b.canonicalId ? -1 : 1;
  }
  function rec(over) {
    var base = {
      funPotential: 0.500, boardSize: 4, elementCount: 3, redundantWallCount: 0,
      par: 8, canonicalId: 'm',
      analysis: { ahaPotential: 0.5, interactionScore: 0.5, choiceScore: 0.5 }
    };
    Object.keys(over).forEach(function (k) {
      if (k === 'analysis') Object.keys(over[k]).forEach(function (j) { base.analysis[j] = over[k][j]; });
      else base[k] = over[k];
    });
    return base;
  }
  var mid = rec({});

  // A clearly better estimate still wins outright — the ladder is a tie-break,
  // not a way to smuggle a worse board past a better one.
  assert(better(rec({ funPotential: 0.70, boardSize: 5, elementCount: 6 }), mid) < 0,
    'a much higher fun potential must win regardless of size');

  // Inside one band, the brief's order decides, rung by rung.
  assert(better(rec({ funPotential: 0.505, boardSize: 4 }),
                rec({ funPotential: 0.495, boardSize: 5 })) < 0,
    'about-equal: the smaller tray wins');
  assert(better(rec({ funPotential: 0.505, elementCount: 3 }),
                rec({ funPotential: 0.495, elementCount: 5 })) < 0,
    'about-equal, same tray: fewer pieces wins');
  assert(better(rec({ funPotential: 0.505, redundantWallCount: 0 }),
                rec({ funPotential: 0.495, redundantWallCount: 1 })) < 0,
    'about-equal, same pieces: no idle wall wins');
  assert(better(rec({ funPotential: 0.505, analysis: { ahaPotential: 0.8 } }),
                rec({ funPotential: 0.495, analysis: { ahaPotential: 0.2 } })) < 0,
    'about-equal, same board: the stronger aha wins');
  assert(better(rec({ funPotential: 0.505, analysis: { interactionScore: 0.8 } }),
                rec({ funPotential: 0.495, analysis: { interactionScore: 0.2 } })) < 0,
    'then the stronger interaction');
  assert(better(rec({ funPotential: 0.505, par: 6 }),
                rec({ funPotential: 0.495, par: 20 })) < 0,
    'and last, the shorter answer');

  // The brief's own worked example, end to end.
  var boardA = rec({ funPotential: 0.50, boardSize: 5, elementCount: 8, par: 20,
                     redundantWallCount: 2 });
  var boardB = rec({ funPotential: 0.51, boardSize: 4, elementCount: 3, par: 8,
                     analysis: { ahaPotential: 0.8, interactionScore: 0.7 } });
  assert(better(boardB, boardA) < 0, 'the 4x4 with one wall must beat the busy 5x5');
})();
ok('about-equal candidates are separated by size, simplicity, then aha');

// ---------------------------------------------------------------------------
// 9. the cheap phase agrees with the expensive one
// ---------------------------------------------------------------------------
/* tools/fun-search.js throws most boards away on the strength of `survey`
   alone. That is only sound while `survey` is the same measurement stopped
   early rather than a second, looser one. */
Object.keys(BOARDS).forEach(function (name) {
  var rows = BOARDS[name];
  var full = analyse(rows);
  var quick = A.survey(rows);
  if (!full.solvable) {
    assert.strictEqual(quick, null, name + ': survey must refuse what the analysis cannot solve');
    return;
  }
  assert.strictEqual(quick.par, full.par, name + ': the cheap pass must agree about par');
  assert.strictEqual(quick.reachableStateCount, full.reachableStateCount,
    name + ': the cheap pass must see the same graph');
  assert.strictEqual(quick.openingDeadEndRate, full.openingDeadEndRate,
    name + ': the cheap pass must agree about the opening');
  assert.strictEqual(quick.deadEndStateRatio, full.deadEndStateRatio,
    name + ': the cheap pass must agree about dead ends');
});
ok('the cheap survey agrees with the full analysis wherever they overlap');

// ---------------------------------------------------------------------------
// 10. the same board gives the same answer twice
// ---------------------------------------------------------------------------
Object.keys(BOARDS).forEach(function (name) {
  var a = JSON.stringify(analyse(BOARDS[name]));
  var b = JSON.stringify(analyse(BOARDS[name]));
  assert.strictEqual(a, b, name + ': two analyses of one board must be identical');
});
ok('the analysis is deterministic');

// ---------------------------------------------------------------------------
// 11. board identity behaves
// ---------------------------------------------------------------------------
(function () {
  var rows = BOARDS.long4;
  for (var v = 0; v < 16; v++) {
    assert.strictEqual(K.canonBoard(K.present(rows, v)), K.canonBoard(rows),
      'variant ' + v + ' must have the same identity');
    assert.strictEqual(K.skeletonKey(K.present(rows, v)), K.skeletonKey(rows),
      'variant ' + v + ' must stand in the same room');
  }
  assert.notStrictEqual(K.canonBoard(rows), K.canonBoard(BOARDS.tight4),
    'two different boards must not share an identity');
  // A 4×4 is never read as a short 5×5.
  assert.strictEqual(K.sideOf('A...' + '....' + '....' + '...a'), 4, 'a sixteen-cell board is 4×4');
  assert.strictEqual(K.canonBoard(['A....', '.....', '.....', '.....', '....a']).length, 25,
    'a 5×5 key stays 25 cells long');
})();
ok('board identity survives rotation, reflection and recolouring');

// ---------------------------------------------------------------------------
// 12. the shortlist on disk, if one has been built
// ---------------------------------------------------------------------------
/* Not every checkout has run a search, so this is conditional — but where the
   file exists, everything it claims is re-derived from the board rather than
   trusted, exactly as tools/build-stages.js re-solves the index it is handed. */
(function () {
  var file = path.join(__dirname, 'fun-level-index.json');
  if (!fs.existsSync(file)) { ok('no shortlist on disk yet — skipped'); return; }
  var index = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(index.format, 'tilt-fun-index/1', 'the shortlist must name its format');
  assert(index.candidates.length > 0, 'the shortlist must not be empty');

  var ids = Object.create(null);
  index.candidates.forEach(function (c) {
    assert(!ids[c.id], 'two candidates share the id ' + c.id);
    ids[c.id] = 1;
    /* The default pool is 4×4 and 5×5; a 3×3 pass is a deliberate `--size 3`
       run for tutorial boards. Either way the file has to say which it was, so
       the size is checked against the settings rather than against a constant. */
    assert(index.settings.sizes.indexOf(c.boardSize) >= 0,
      'candidate ' + c.id + ' is ' + c.boardSize + '×' + c.boardSize +
      ' but the file was searched on ' + index.settings.sizes.join('/'));
    assert.strictEqual(c.board.length, c.boardSize, 'candidate ' + c.id + ': board size must match');
    var flat = c.board.join('');
    if (!index.settings.drifters) {
      assert.strictEqual(flat.indexOf('G'), -1, 'candidate ' + c.id + ' carries a drifter');
    }
    if (!index.settings.hazards) {
      assert.strictEqual(flat.indexOf('x'), -1, 'candidate ' + c.id + ' carries cracked ice');
    }
    assert(c.categories.length > 0, 'candidate ' + c.id + ' has no category');
    assert(SCORE.BANDS.indexOf(c.difficulty) >= 0, 'candidate ' + c.id + ' has no difficulty band');
    assert(c.par >= index.settings.minPar, 'candidate ' + c.id + ' is shorter than the floor');
  });

  // Re-solve a slice with the engine rather than believing the file.
  index.candidates.filter(function (_, i) { return i % 7 === 0; }).forEach(function (c) {
    var stage = E.compile({ id: c.id, board: c.board });
    var solved = E.solve(stage, null, 400000);
    assert(solved.solvable, 'candidate ' + c.id + ' must be solvable');
    assert.strictEqual(solved.moves, c.par,
      'candidate ' + c.id + ': the file says par ' + c.par + ', the engine says ' + solved.moves);
  });

  Object.keys(index.buckets).forEach(function (key) {
    var parts = key.split('/');
    assert.strictEqual(parts.length, 3, 'bucket key "' + key + '" must be kind/difficulty/tray');
    assert(SCORE.CATEGORIES.indexOf(parts[0]) >= 0, 'bucket "' + key + '" has an unknown kind');
    assert(SCORE.BANDS.indexOf(parts[1]) >= 0, 'bucket "' + key + '" has an unknown band');
    index.buckets[key].forEach(function (id) {
      assert(ids[id], 'bucket "' + key + '" names a candidate that is not in the file');
    });
  });
  ok(index.candidates.length + ' shortlisted candidates re-checked against the engine');
})();

console.log('ok - ' + checks + ' analysis checks: solver agreement, symmetry and colour-swap\n' +
  '     invariance, idle walls, penguin interaction, repetition, score bounds,\n' +
  '     category rates, cheap/expensive agreement, determinism');
