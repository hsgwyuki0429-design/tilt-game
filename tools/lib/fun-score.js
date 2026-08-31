'use strict';
/*
 * TILT — turning measurements into an opinion, and admitting it is one.
 *
 * tools/lib/level-analysis.js counts what happens on a board. Every number it
 * produces is exact. This file weighs those counts against each other, and
 * every number IT produces is an estimate — which is why the two headline
 * numbers are called `funPotential` and `ahaPotential` rather than a score.
 * `ahaPotential` 0.81 means "worth going and playing"; it does not mean the
 * board is fun, and nothing downstream is allowed to treat it as if it did.
 * The candidate browser exists because a person still has to decide.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT REWARDED
 * ---------------------------------------------------------------------------
 *
 * None of the following raises a score anywhere in this file, and several of
 * them lower one:
 *
 *   a long par            length is an axis, not a virtue. Every event count
 *                         below is divided by par, so a fifty-move corridor
 *                         scores under an eight-move board with one idea.
 *   more walls            a wall that changes nothing is a flaw and is priced
 *                         as one; walls count against simplicity either way.
 *   a bigger board        5×5 is not 4×4 with more difficulty. It is 4×4 with
 *                         nine more cells to look at, and `sizeEfficiency`
 *                         charges for every one that does no work.
 *   more reachable states a wide graph is load, not depth. It appears only in
 *                         `cognitiveLoadScore`, which is never added to fun.
 *   more dead ends        an unrecoverable move is not difficulty, it is a
 *                         trap. A few make a board sharp; many make it unfair.
 *   more special pieces   `simplicityScore` and `depthPerElement` both push
 *                         the other way.
 *
 * ---------------------------------------------------------------------------
 * BOUNDED, NOT ADDITIVE
 * ---------------------------------------------------------------------------
 *
 * Event counts go through `saturate` — x/(x+k) — before they are weighed, so no
 * single count can run away with a score. Three counter-intuitive moves is a
 * lot; thirty is not ten times as much, it is a board that has stopped making
 * sense.
 */

// ---------------------------------------------------------------------------
// shaping
// ---------------------------------------------------------------------------

function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/** 0 at 0, 0.5 at k, and never past 1 however large x gets. */
function saturate(x, k) { return x <= 0 ? 0 : x / (x + k); }

function round(x, places) {
  var f = Math.pow(10, places === undefined ? 3 : places);
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------------------
// the individual estimates
// ---------------------------------------------------------------------------

/**
 * How likely this board is to contain a moment of "oh — I have to go the OTHER
 * way".
 *
 * Divided by par, so the board that gets there in eight moves beats the board
 * that gets there in thirty.
 */
function ahaPotential(f) {
  var events = 1.0 * f.moveAwayFromGoalCount
             + 1.2 * f.goalPassThroughCount
             + 1.0 * f.delayedCollectionCount
             + 1.4 * f.counterIntuitiveMoveCount;
  return saturate(events / Math.max(1, f.par), 0.55);
}

/**
 * How much the two penguins are one puzzle rather than two.
 *
 * `soloIndependent` is the killer: if deleting either penguin leaves the other
 * one doing exactly what it did before, the board has two penguins on it and
 * asks one question, and no amount of braking makes up for that.
 */
function interactionScore(f) {
  if (f.penguinCount < 2) return 0;
  /* Both penguins moving is not interaction — under one gravity they nearly
     always both move, and weighing it heavily made every two-penguin board
     look connected. The weight sits on the two things that only happen when
     one penguin is part of the other's problem: braking it, and changing where
     it ends up. */
  var raw = 2.0 * f.penguinBrakeCount
          + 1.6 * f.dependencyCount
          + 1.5 * f.collectionOrderDependency
          + 0.25 * f.sharedGravityInteractionCount;
  var s = saturate(raw / Math.max(1, f.par), 1.3);
  if (f.soloIndependent) s *= 0.25;
  return s;
}

/**
 * How much of the solving is choosing rather than following.
 *
 * A move you can get wrong and recover from is worth something; a move you can
 * get wrong and lose the board to is worth something too, up to a point, and
 * past that point the board is not hard, it is unforgiving.
 */
function choiceScore(f) {
  var par = Math.max(1, f.par);
  var s = 0.50 * saturate(f.meaningfulDecisionCount / par, 0.45)
        + 0.25 * saturate(f.wrongButRecoverableCount / par, 1.2)
        + 0.25 * (1 - clamp(f.forcedMoveRatio, 0, 1));
  var unfair = saturate(f.deadEndMoveCount / par, 1.5);
  return clamp(s * (1 - 0.35 * unfair), 0, 1);
}

/** Whether the answer is nice to look at written down. */
function solutionEleganceScore(f) {
  return clamp(0.35 * f.directionEntropy
             + 0.30 * clamp(f.stateChangeDensity, 0, 1)
             + 0.35 * (1 - clamp(f.repeatedPatternPenalty, 0, 1)), 0, 1);
}

/** Few pieces on the board. Three is free; every one after that costs. */
function simplicityScore(f) {
  return clamp(3 / Math.max(1, f.elementCount), 0, 1);
}

/**
 * Does the board need the room it takes up?
 *
 * Three things at once: how many cells the puzzle actually uses, whether the
 * used cells even reach the edges of the tray it was drawn on, and the tray
 * itself. A 4×4 that fills its tray scores 1; a 5×5 whose whole game happens
 * inside a 4×4 corner is charged for the empty band AND for being a 5×5, which
 * is the minimum-board rule stated as arithmetic.
 */
function sizeEfficiency(f) {
  var wasted = f.activeBoundingSide > 0
    ? (f.boardSize - f.activeBoundingSide) / f.boardSize : 1;
  return clamp(f.activeAreaRatio * (1 - wasted) * (4 / f.boardSize), 0, 1);
}

/** Depth divided by the number of things on the board. */
function depthPerElement(f) {
  var depth = f.par
            + 2 * f.meaningfulDecisionCount
            + 2 * (f.moveAwayFromGoalCount + f.goalPassThroughCount +
                   f.delayedCollectionCount + f.counterIntuitiveMoveCount)
            + 2 * (f.penguinBrakeCount + f.dependencyCount);
  return depth / Math.max(1, f.elementCount);
}

/**
 * How much the player has to hold in their head — which is NOT difficulty and
 * is never added to it.
 *
 * TILT's depth is meant to come from simple rules interacting, not from asking
 * somebody to track six moving objects at once. This number exists so a board
 * that is merely busy can be told apart from a board that is deep, and so the
 * browser can show both.
 */
function cognitiveLoadScore(f) {
  var movable = f.penguinCount + f.drifterCount;
  return clamp(0.16 * (movable - 1)
             + 0.10 * f.drifterCount
             + 0.07 * f.wallCount
             + 0.12 * f.hazardCount
             + 0.18 * saturate(f.reachableStateCount, 240)
             + 0.12 * (f.boardSize - 4)
             + 0.10 * saturate(f.par, 25), 0, 1);
}

/**
 * Difficulty, and par is only a quarter of it.
 *
 * The rest is what the board asks: how many real decisions it puts in front of
 * you, how far ahead you have to commit before anything confirms you were
 * right, how much the two penguins depend on each other, how often the obvious
 * move is the wrong one. A board that is only long is scaled back down by
 * `forcedMoveRatio` at the end.
 */
function difficultyScore(f, aha, inter) {
  var d = 0.24 * saturate(f.par, 16)
        + 0.16 * saturate(f.meaningfulDecisionCount, 3)
        + 0.14 * saturate(f.requiredLookahead, 4)
        + 0.14 * inter
        + 0.16 * aha
        + 0.10 * clamp(f.deceptiveChoiceRatio, 0, 1)
        + 0.06 * saturate(f.deadEndMoveCount, 4);
  return clamp(d * (1 - 0.20 * clamp(f.forcedMoveRatio, 0, 1)), 0, 1);
}

/** The band a board belongs in. Not read off par. */
function difficultyBand(f, score) {
  /* Cut where the 4×4 population actually sits, not on round numbers. A ladder
     whose top band no 4×4 board can reach would quietly hand the hard end of
     the campaign to the bigger tray, which is the mistake this whole search is
     here to stop making. */
  if (f.par <= 3 && score < 0.30) return 'tutorial';
  if (score < 0.20) return 'tutorial';
  if (score < 0.32) return 'easy';
  if (score < 0.44) return 'medium';
  if (score < 0.56) return 'hard';
  return 'expert';
}

// ---------------------------------------------------------------------------
// the headline estimate
// ---------------------------------------------------------------------------
/**
 * One number, used for ranking inside a category and for nothing else.
 *
 * It is never the sole reason a board is kept — tools/fun-search.js buckets by
 * category, difficulty and board size first — and it is never the reason a
 * board ships, because a person has to play it. The penalties at the end are
 * the part worth trusting: they are all statements about flaws, and a flaw is
 * much easier to be sure of than a virtue.
 */
function funPotential(f, parts) {
  var w = f.penguinCount >= 2
    ? { aha: 0.25, inter: 0.20, choice: 0.15, elegance: 0.15,
        simplicity: 0.10, size: 0.07, depth: 0.08 }
    : { aha: 0.32, inter: 0.00, choice: 0.20, elegance: 0.18,
        simplicity: 0.12, size: 0.08, depth: 0.10 };

  var base = w.aha * parts.ahaPotential
           + w.inter * parts.interactionScore
           + w.choice * parts.choiceScore
           + w.elegance * parts.solutionEleganceScore
           + w.simplicity * parts.simplicityScore
           + w.size * parts.sizeEfficiency
           + w.depth * saturate(parts.depthPerElement, 6);

  // Flaws, priced.
  if (f.redundantWallCount > 0) base *= (1 - 0.45 * clamp(f.redundantWallCount, 0, 1));
  base *= (1 - 0.30 * clamp(f.forcedMoveRatio, 0, 1));
  base *= (1 - 0.25 * clamp(f.repeatedPatternPenalty, 0, 1));
  if (f.openingDeadEndRate >= 0.75) base *= 0.60;
  if (f.penguinCount >= 2 && f.soloIndependent) base *= 0.70;

  return clamp(base, 0, 1);
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------
/*
 * A board is not a point on a difficulty line, it is a KIND of board, and the
 * campaign wants a spread of kinds far more than it wants the hundred highest
 * numbers. Membership overlaps on purpose: the boards worth having are usually
 * in two or three of these at once.
 *
 *   AHA          the obvious move is wrong and the right one looks wrong
 *   INTERACTION  the two penguins are one puzzle
 *   CHOICE       real decisions, not a corridor
 *   SEQUENCE     order matters; you have to set up before you collect
 *   PRECISION    one line through, and it has to be exact
 *   ELEGANT      almost nothing on the board and a clean answer
 *   TRAP         the tempting move loses
 *   ORBIT        somebody has to go the long way round and come back
 *   HAZARD       cracked ice is doing the work (never in the main pool)
 *   MASTER       several of the above at once, and hard
 */
function categorise(f, parts, difficulty) {
  var cats = [];
  var par = Math.max(1, f.par);
  var two = f.penguinCount >= 2;

  /* The thresholds are percentiles, not opinions. Each was set by measuring
     every 4×4 two-penguin board of par 4 or more — eighty-nine thousand of
     them — and cutting where the top fifth to top tenth begins, so a category
     means "unusual in this respect" rather than "has this property at all".
     Membership rates are asserted by tools/analysis-test.js, which is what
     stops a later tweak quietly making a label meaningless. */

  if (parts.ahaPotential >= 0.68 &&
      (f.goalPassThroughCount >= 1 || f.counterIntuitiveMoveCount >= 3)) cats.push('AHA');

  if (two && !f.soloIndependent && f.dependencyCount >= 2 &&
      f.penguinBrakeCount >= 2 && parts.interactionScore >= 0.50) cats.push('INTERACTION');

  if (f.meaningfulDecisionCount >= Math.max(4, par * 0.5) && f.forcedMoveRatio <= 0.2 &&
      f.wrongButRecoverableCount >= par && f.averageUsefulBranching >= 2.2) cats.push('CHOICE');

  if ((f.collectionOrderDependency >= 1 && f.delayedCollectionCount >= 1 &&
       f.requiredLookahead >= 2) || f.requiredLookahead >= 4) cats.push('SEQUENCE');

  if (f.singleSafeMoveRatio >= 0.25 && f.deadEndMoveCount >= 2 &&
      f.openingDeadEndRate < 0.75) cats.push('PRECISION');

  if (f.elementCount <= 3 && f.redundantWallCount === 0 && f.par >= 4 &&
      parts.solutionEleganceScore >= 0.78 && f.repeatedPatternPenalty <= 0.3) {
    cats.push('ELEGANT');
  }

  if (f.deceptiveChoiceRatio >= 0.5 && f.deadEndMoveCount >= 2) cats.push('TRAP');

  if (f.revisitCount >= 2 && f.par >= 6) cats.push('ORBIT');

  if (f.hazardCount > 0) cats.push('HAZARD');

  if (cats.length >= 3 && parts.funPotential >= 0.62 &&
      (difficulty === 'hard' || difficulty === 'expert')) cats.push('MASTER');

  return cats;
}

// ---------------------------------------------------------------------------
// how alike two boards' answers are
// ---------------------------------------------------------------------------
/**
 * A fingerprint of the SOLUTION rather than of the board.
 *
 * Deduplicating boards is not enough. Two different-looking boards can want the
 * same five moves for the same five reasons, and a shortlist that keeps forty
 * of those has kept one idea forty times. This key is built from the shape of
 * the answer — the turn sequence, and what each move did — so it survives
 * rotating, reflecting and recolouring a board, and it collides exactly when
 * two boards are the same trick.
 */
var B32 = '0123456789abcdefghijklmnopqrstuv';
function solutionFingerprint(f) {
  var sig = (f.steps || []).map(function (s) {
    var code = (s.moved >= 2 ? 1 : 0)
             | (s.collected > 0 ? 2 : 0)
             | (s.brakes > 0 ? 4 : 0)
             | (s.passedGoal > 0 ? 8 : 0)
             | (s.away > 0 ? 16 : 0);
    return B32[code];
  }).join('');
  return f.par + ':' + (f.turnShape || '') + ':' + sig;
}

// ---------------------------------------------------------------------------
// the whole opinion, in one call
// ---------------------------------------------------------------------------
function scoreLevel(f) {
  var parts = {
    ahaPotential: ahaPotential(f),
    interactionScore: interactionScore(f),
    choiceScore: choiceScore(f),
    solutionEleganceScore: solutionEleganceScore(f),
    simplicityScore: simplicityScore(f),
    sizeEfficiency: sizeEfficiency(f),
    depthPerElement: depthPerElement(f)
  };
  parts.cognitiveLoadScore = cognitiveLoadScore(f);
  parts.difficultyScore = difficultyScore(f, parts.ahaPotential, parts.interactionScore);
  parts.funPotential = funPotential(f, parts);

  var difficulty = difficultyBand(f, parts.difficultyScore);
  var categories = categorise(f, parts, difficulty);

  return {
    ahaPotential: round(parts.ahaPotential),
    interactionScore: round(parts.interactionScore),
    choiceScore: round(parts.choiceScore),
    solutionEleganceScore: round(parts.solutionEleganceScore),
    simplicityScore: round(parts.simplicityScore),
    sizeEfficiency: round(parts.sizeEfficiency),
    depthPerElement: round(parts.depthPerElement, 2),
    cognitiveLoadScore: round(parts.cognitiveLoadScore),
    difficultyScore: round(parts.difficultyScore),
    funPotential: round(parts.funPotential),
    difficulty: difficulty,
    categories: categories,
    solutionFingerprint: solutionFingerprint(f)
  };
}

module.exports = {
  scoreLevel: scoreLevel,
  saturate: saturate,
  clamp: clamp,
  ahaPotential: ahaPotential,
  interactionScore: interactionScore,
  choiceScore: choiceScore,
  solutionEleganceScore: solutionEleganceScore,
  simplicityScore: simplicityScore,
  sizeEfficiency: sizeEfficiency,
  depthPerElement: depthPerElement,
  cognitiveLoadScore: cognitiveLoadScore,
  difficultyScore: difficultyScore,
  difficultyBand: difficultyBand,
  funPotential: funPotential,
  categorise: categorise,
  solutionFingerprint: solutionFingerprint,
  CATEGORIES: ['AHA', 'INTERACTION', 'CHOICE', 'SEQUENCE', 'PRECISION',
               'ELEGANT', 'TRAP', 'ORBIT', 'HAZARD', 'MASTER'],
  BANDS: ['tutorial', 'easy', 'medium', 'hard', 'expert']
};
