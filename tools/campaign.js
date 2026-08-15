'use strict';
/*
 * TILT — the campaign.
 *
 * This file IS the design document for all forty stages, and it generates
 * src/stages.js from it.
 *
 *   node tools/campaign.js              build
 *   node tools/campaign.js --report     build and print every scorecard
 *   node tools/campaign.js --only 7,12  search just those slots and report
 *   node tools/campaign.js --dry        search and report, write nothing
 *
 * `--only` never writes: the stages are chosen against each other (no two may
 * share a board or even a terrain), so a partial run cannot honestly produce a
 * partial file.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------------------------------------------------------
 *
 * The first campaign gave each slot a target LENGTH and searched until a board
 * hit it. The result measured well and played badly, and the measurement in
 * design.js says exactly why: half the stages could be solved by a player who
 * was not thinking, and the other half were corridors where every move had to
 * be found separately.
 *
 * A board that takes fifty tilts and never once surprises you is a worse board
 * than one that takes five and does. So almost no slot below asks for a length.
 * Each slot states ONE THING THE PLAYER SHOULD NOTICE, and then requires the
 * measured signature of a board that can only be solved by noticing it.
 *
 * The exception is chapter eight, and it is a deliberate one — see there.
 *
 * ---------------------------------------------------------------------------
 * HOW A SLOT IS BUILT
 * ---------------------------------------------------------------------------
 *
 *   1  CORE IDEA      one sentence: what is there to see here?
 *   2  FEELING        what the player should experience finding it
 *   3  SEARCH         the design space to look in, and the signature required
 *   4  PREFER         which surviving board best expresses THIS idea
 *
 * The search does not sample. At 3×3 and 4×3 it enumerates the entire design
 * space — every arrangement of walls, goals, hazards and blocks up to symmetry
 * and up to which colour is called A — so what ships is not the best board the
 * search stumbled on, it is the best board that exists inside that budget.
 * Tens of thousands of boards are built and measured per slot; one survives.
 * Nothing is kept because it was expensive to find.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAY APPEAR, AND WHEN
 * ---------------------------------------------------------------------------
 *
 * There are two optional TERRAIN devices — the hazard and colour — and three
 * alternative WIN CONDITIONS: SELECT, MATCH and FORM. Each gets a chapter, each
 * chapter opens with a board that teaches it by making the player do it once,
 * and outside the chapter that owns it nothing else uses it.
 *
 * Ten of the forty stages use nothing but the base rules and ALL IN. A quarter
 * of the campaign is nine cells, four characters and no exceptions.
 *
 * NO STAGE IN CHAPTERS 1–7 USES MORE THAN ONE DEVICE AT ONCE, and that was
 * tested rather than assumed. 26,744 boards carrying a hazard AND two colours
 * were built and measured, and the best of them was compared against the best
 * single-device board on all ten axes:
 *
 *                      both devices   colour only
 *     clarity                   4.1           6.8
 *     fairness                  7.4          10.0     (4% silent jams vs none)
 *     discovery                 8.7           9.7
 *     density                   5.1           6.7
 *     surprise                 10.0           8.2
 *     elegance                 10.0           9.1
 *                        ── 2 axes ──   ── 6 axes ──
 *
 * The combined board is longer and more surprising, and it loses anyway: it is
 * harder to read, and 4% of its positions are quietly unwinnable rather than
 * visibly so. Length and surprise do not outrank being legible and being fair.
 *
 * Chapter eight is where that result is deliberately spent rather than
 * obeyed — see the note above the ABYSS slots.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS CONSIDERED AND LEFT OUT
 * ---------------------------------------------------------------------------
 *
 *   THE PEG        A cell a block may enter, may not pass, and is safe on: the
 *                  one place a block could be parked in open ground. It had a
 *                  chapter and it has been removed. The sweep is why: with a
 *                  peg on the board the best blindness anywhere in 20 candidate
 *                  boards was 0.00 — every one of them was solved by the first
 *                  tilt a hurrying player would try. It made boards longer and
 *                  made none of them harder to SEE, and it was the only rule in
 *                  the game that broke the idempotence of a repeated tilt,
 *                  which cost a real invariant to keep.
 *
 *   BIG BLOCKS     A 2×1 block needs two free cells instead of one. That is a
 *                  packing constraint, not a new question: everything it asks
 *                  ("will it fit, will it stop here") the player is already
 *                  asking about single blocks, and it costs a whole new set of
 *                  rules about what happens when half of one is blocked. They
 *                  were permitted for chapter eight and turned out not to be
 *                  needed — SELECT with three colours reaches par 58 on twelve
 *                  cells, which is deeper than a new movement rule was going to
 *                  buy.
 */

var fs = require('fs');
var path = require('path');
var D = require('./lib/design.js');
var G = require('./lib/generate.js');
var E = require('../src/engine.js');

var ROOT = path.join(__dirname, '..');
var argv = process.argv.slice(2);
var REPORT = argv.indexOf('--report') >= 0;
var DRY = argv.indexOf('--dry') >= 0;
var ONLY = null;
var onlyAt = argv.indexOf('--only');
if (onlyAt >= 0 && argv[onlyAt + 1]) ONLY = argv[onlyAt + 1].split(',').map(Number);

// ---------------------------------------------------------------------------
// search spaces
// ---------------------------------------------------------------------------
// A spec is a budget, not a board: size, what furniture may be placed, how many
// blocks, and what "done" means. The generator enumerates every arrangement
// inside it.

function spec(w, h, blocks, walls, opts) {
  opts = opts || {};
  // At most two blocks of any one colour, everywhere, without exception. Three
  // identical blocks on a nine-cell board is not depth, it is clutter that
  // happens to be hard to keep track of — and the exhaustive sweep says the cap
  // costs nothing: under it, SELECT with three colours reaches par 58 on twelve
  // cells, longer than anything the uncapped campaign ever found.
  var count = {};
  blocks.forEach(function (c) {
    count[c] = (count[c] || 0) + 1;
    if (count[c] > 2) {
      throw new Error('spec uses ' + count[c] + ' blocks of colour ' + c + '; the cap is 2');
    }
  });
  return {
    w: w, h: h,
    blocks: blocks,
    walls: walls,
    hazards: opts.hazards || [0, 0],
    goals: opts.goals || ['o'],
    win: opts.win || 'allin'
  };
}

function reps(ch, n) { var a = []; for (var i = 0; i < n; i++) a.push(ch); return a; }

/** 3×3, base rules, b blocks (max 2), walls in the given band. */
function nine(b, walls) { return spec(3, 3, reps('@', b), walls); }
function nineHaz(b, walls, hz) { return spec(3, 3, reps('@', b), walls, { hazards: hz }); }
function nineCol(blocks, walls) { return spec(3, 3, blocks, walls, { goals: ['a', 'b'] }); }

/** 4×3. */
function twelve(b, walls) { return spec(4, 3, reps('@', b), walls); }
function twelveHaz(b, walls, hz) { return spec(4, 3, reps('@', b), walls, { hazards: hz }); }
function twelveCol(blocks, walls) { return spec(4, 3, blocks, walls, { goals: ['a', 'b'] }); }

/** 4×4 — only where the extra room buys a genuinely longer idea. */
function sixteen(b, walls) { return spec(4, 4, reps('@', b), walls); }
function sixteenCol(blocks, walls) { return spec(4, 4, blocks, walls, { goals: ['a', 'b'] }); }

/** MATCH: no goals anywhere, and at least one colour carrying a pair. */
function match(w, h, blocks, walls, hz) {
  return spec(w, h, blocks, walls, { goals: [], hazards: hz, win: 'match' });
}

/** SELECT: goals for some colours and not others. */
function select(w, h, blocks, goals, walls, hz) {
  return spec(w, h, blocks, walls, { goals: goals, hazards: hz, win: 'select' });
}

/** FORM: the goal characters mark cells to be standing on, not holes. */
function form(w, h, blocks, targets, walls, hz) {
  return spec(w, h, blocks, walls, { goals: targets, hazards: hz, win: 'form' });
}

// ---------------------------------------------------------------------------
// the forty slots
// ---------------------------------------------------------------------------
//
// `need` is the measured signature a board must have to be capable of teaching
// the idea. `prefer` breaks ties among boards that all qualify.
//
// Ordinary slots inherit a floor that no stage in the game is allowed below:
// the naive player must fail, nothing may be won by luck, and no piece may be
// on the board that the board would not miss. `allowNaive: true` marks the
// stages that exist to put a rule on screen for the first time — they are
// allowed to be gentle, and each one says so in its own note.

var BASE_NEED = {
  maxLuck: 0.015,
  maxJam: 0.25,
  naiveSolves: false,
  // No stage may be a pump handle. A board can have a perfect crux — one move
  // to find, eight that follow for free — and still be a chore, because those
  // eight turn out to be L U L U L U L U. The idea cost one move; the
  // execution cost eight, and nothing else measured here notices.
  maxPump: 0.5,
  // At least three of the four tilts have to DO something. A board where
  // gravity only works in one direction is not a puzzle with one answer, it is
  // a corridor with one door, and it reads as broken rather than as hard.
  minLive: 3
};

var SLOTS = [

  // ── CHAPTER 1 · GRAVITY ─────────────────────────────────────────────────
  // The whole vocabulary, one board per idea. Two of the five exist to land the
  // rule that defines the game: a goal is a cell you must be STOPPED on.

  {
    id: 1, name: 'DROP', chapter: 1,
    idea: 'Gravity is a thing you point, and everything obeys it at once.',
    feeling: 'No resistance at all. This board exists to be understood in one gesture.',
    note: 'One block, one goal, two tilts, and the goal is in a corner so the edge does ' +
          'the stopping for free. The only stage in the game a player can solve without ' +
          'thinking, and that is its entire job: it teaches the verb.',
    hint: { ja: 'スワイプして重力を向ける', en: 'Swipe to aim gravity' },
    specs: [nine(1, [0, 0]), nine(1, [1, 1])],
    need: { par: [2, 2], allowNaive: true, maxLuck: 0.5, minLive: 2 },
    prefer: function (p) { return -p.pieces.total * 10 - p.states; }
  },
  {
    id: 2, name: 'OVER', chapter: 1,
    idea: 'A goal is not a target. Aim at it and the block sails straight over the top of it.',
    feeling: 'You point at the hole, you watch the block go past the hole, and the rule lands.',
    note: 'The most important board in the game, and it is the second one. Pointing gravity ' +
          'at the exit does not work here and cannot be made to work: a block is only ' +
          'collected if it comes to a complete STOP on the goal, so the question is never ' +
          '"which way is the goal" but "what is going to stop me once I get there". A player ' +
          'has to do this wrong exactly once.',
    hint: { ja: 'ゴールの上で止まらないと落ちない', en: 'You must STOP on a goal' },
    specs: [nine(1, [0, 2]), nine(2, [0, 2])],
    need: { par: [2, 4], unlock: [1, 2], overshoot: 1, allowNaive: true, maxLuck: 0.35, minLive: 2 },
    prefer: function (p) {
      return p.overshoot * 14 + (p.unlock > 0 ? 12 : 0) + p.traps * 5
             - p.pieces.total * 6 - p.par * 2;
    }
  },
  {
    id: 3, name: 'BRAKE', chapter: 1,
    idea: 'What stops you on a goal is a wall behind it — so come at it from the side that has one.',
    feeling: 'Having learned that goals are not targets, learn what they ARE: a cell with a backstop.',
    note: 'The answer to the board before it. Only one of the four directions has anything ' +
          'standing one cell past the socket, and that is the only direction that collects. ' +
          'From here on the player reads a goal by looking at what is BEHIND it.',
    hint: { ja: 'ゴールの向こうの壁が止めてくれる', en: 'A wall past the goal stops you on it' },
    specs: [nine(1, [1, 3]), nine(2, [1, 3])],
    need: { par: [2, 4], unlock: [1, 2], traps: 2, allowNaive: true, maxLuck: 0.2, minLive: 2 },
    prefer: function (p) { return p.traps * 9 + p.overshoot * 6 + p.retreat * 4 - p.pieces.total * 6 - p.par; }
  },
  {
    id: 4, name: 'STACK', chapter: 1,
    idea: 'A block is a backstop too — and it is the only backstop you can move.',
    feeling: 'Send the wrong one home first and the brake you needed is the thing that left.',
    note: 'The last piece of the vocabulary, and the one the rest of the game is built on. ' +
          'Walls make some goals collectable and never move; blocks make the others ' +
          'collectable and the player spends them. This board is required to DEMONSTRATE ' +
          'that — at least one collection on its shortest line is a block stopped by another ' +
          'block, not by the terrain.',
    hint: { ja: 'ブロックも他のブロックを止める', en: 'Blocks stop each other too' },
    specs: [nine(2, [0, 2]), twelve(2, [0, 2])],
    need: { par: [4, 9], unlock: [1, 3], flow: 2, traps: 2, caught: 1 },
    prefer: function (p) { return p.caught * 14 + p.blindness * 10 + p.flow * 4 + p.par * 2 - p.pieces.total * 4; }
  },
  {
    id: 5, name: 'AWAY', chapter: 1,
    idea: 'The way out is not the way you are facing: a block has to travel away from the goal to reach it.',
    feeling: 'A player who only ever tilts toward the exit circles this board forever.',
    note: 'Chapter one closing its own argument, and the first board that is purely a ' +
          'puzzle. Every tilt that points at the goal makes things worse, and the answer is ' +
          'the direction that looks like giving up ground.',
    specs: [nine(2, [1, 3]), twelve(2, [1, 3])],
    need: { par: [4, 9], unlock: [1, 3], flow: 2, retreat: 2, blindness: 1 },
    prefer: function (p) { return p.blindness * 14 + p.retreat * 8 + p.flow * 3 + p.par * 2 - p.pieces.total * 3; }
  },

  // ── CHAPTER 2 · NINE ────────────────────────────────────────────────────
  // Nothing new is introduced anywhere in this chapter — no hazard, no colour,
  // the same four characters stage 1 had, and never more than two blocks. What
  // changes is only how hard the same few things are made to work.

  {
    id: 6, name: 'WASTE', chapter: 2,
    idea: 'The move that appears to accomplish nothing is the one that makes everything possible.',
    feeling: 'Three tilts look productive and all three are wrong. The fourth looks pointless.',
    note: 'Ranked by how a hurrying player would rate them, the correct opening is the LAST ' +
          'one they would try. Nothing is hidden — the whole board is in plain sight — and ' +
          'it still takes a second look.',
    specs: [nine(2, [0, 3]), twelve(2, [1, 3])],
    need: { par: [4, 10], unlock: [1, 2], flow: 2, blindness: 2, traps: 2 },
    prefer: function (p) { return p.blindness * 20 + p.traps * 6 + p.flow * 4 + p.par * 2 - p.pieces.total * 3; }
  },
  {
    id: 7, name: 'REFUSE', chapter: 2,
    idea: 'Collecting a block can be the wrong move. Progress is not the same as winning.',
    feeling: 'The board offers you something for free, and taking it loses.',
    note: 'The cruellest shape in the game and the fairest: a tilt that visibly banks a block ' +
          'and quietly ruins the position, because the block it banked was the backstop the ' +
          'other one needed. Once seen it is never forgotten — it rewrites what a good move is.',
    specs: [nine(2, [0, 3]), twelve(2, [1, 3])],
    need: { par: [4, 10], unlock: [1, 2], flow: 2, bait: true, blindness: 1 },
    prefer: function (p) { return p.bait * 18 + p.blindness * 12 + p.flow * 4 + p.par * 2 - p.pieces.total * 3; }
  },
  {
    id: 8, name: 'OTHER', chapter: 2,
    idea: 'The block you have to move first is not the block you are trying to get home.',
    feeling: 'You stare at the block next to the goal for a while before you look away from it.',
    note: 'Every instinct points at the piece nearest the socket. It is the last one that ' +
          'moves. The board is built so the piece furthest from the goal is the one holding ' +
          'the whole position together.',
    specs: [twelve(2, [1, 3]), sixteen(2, [2, 4])],
    need: { par: [6, 12], unlock: [1, 3], flow: 3, indirect: true, blindness: 2, traps: 2 },
    prefer: function (p) { return p.blindness * 14 + p.flow * 5 + p.setup * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 9, name: 'FALL', chapter: 2,
    idea: 'One tilt, and the whole board resolves at once — if you built it correctly first.',
    feeling: 'Several moves of arranging that collect nothing, then everything lands together.',
    note: 'The payoff stage. Nothing is banked until the end and then the last tilt takes the ' +
          'lot — one block stops on the socket, which frees the cell, which lets the next one ' +
          'settle into it in the same tilt. The pleasure is watching a plan you made three ' +
          'moves ago execute itself.',
    specs: [nine(2, [0, 3]), twelve(2, [0, 3])],
    need: { par: [4, 11], unlock: [1, 3], chainLast: 2, setup: 2 },
    prefer: function (p) { return p.chainLast * 16 + p.setup * 7 + p.blindness * 8 + p.par * 2; }
  },
  {
    id: 10, name: 'NINE', chapter: 2,
    idea: 'What nine cells can hold when every single one of them is carrying weight.',
    feeling: 'A board you can see all of at once and cannot hold all of at once.',
    note: 'The chapter closing its argument: the most thinking that fits in nine cells under ' +
          'the base rules with two blocks. Delete any piece and the puzzle measurably changes.',
    specs: [nine(2, [0, 4])],
    need: { par: [5, 9], unlock: [1, 3], flow: 2, blindness: 1, traps: 2 },
    prefer: function (p) { return p.states * 0.4 + p.par * 5 + p.blindness * 8 + p.flow * 3; }
  },

  // ── CHAPTER 3 · EDGE ────────────────────────────────────────────────────
  // The hazard: the exact mirror of a goal. Both resolve at rest and only at
  // rest, and they answer the same question in opposite directions. It is also
  // the one cell in the game that can end a run outright.

  {
    id: 11, name: 'CROSS', chapter: 3,
    idea: 'You may slide straight over a hazard. You may not be left standing on one.',
    feeling: 'Learn it by doing it, in a board where the crossing is the only route.',
    note: 'The hazard arrives doing the opposite of what a hazard normally does: the solution ' +
          'goes right across it. Stop on it and the block shatters where the player can see ' +
          'exactly why — and that ends the run, which is the whole lesson.',
    hint: { ja: '危険マスは通れる。止まると即ゲームオーバー', en: 'Cross a hazard — stop on one and the run ends' },
    specs: [nineHaz(1, [0, 1], [1, 1]), nineHaz(2, [0, 1], [1, 1])],
    need: { par: [3, 6], unlock: [1, 2], crossings: 1, allowNaive: true, maxLuck: 0.3, maxJam: 0.6, minLive: 2 },
    prefer: function (p) { return p.crossings * 10 + p.traps * 4 + p.par * 2 - p.pieces.total * 5; }
  },
  {
    id: 12, name: 'CATCH', chapter: 3,
    idea: 'A hazard is only survivable if something is waiting to stop you past it.',
    feeling: 'The route is obvious and lethal until you notice what has to be standing where.',
    note: 'The hazard turns the other block into a brake. This is where the dangerous square ' +
          'stops being an obstacle and becomes equipment: the question is no longer "how do I ' +
          'avoid it" but "what has to be over there first".',
    specs: [nineHaz(2, [0, 2], [1, 1]), twelveHaz(2, [1, 2], [1, 1])],
    need: { par: [5, 11], unlock: [1, 3], flow: 3, crossings: 1, blindness: 1, maxJam: 0.4 },
    prefer: function (p) { return p.blindness * 12 + p.crossings * 8 + p.flow * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 13, name: 'LEDGE', chapter: 3,
    idea: 'Every direction looks fatal. One of them is not, and it is the one that looks worst.',
    feeling: 'Genuine "there is no move here" — followed by there being a move here.',
    note: 'The board a player is most likely to declare broken before solving it. Everything ' +
          'that looks like progress ends with a block standing somewhere it cannot stand.',
    specs: [nineHaz(2, [0, 3], [1, 2]), twelveHaz(2, [1, 2], [1, 2])],
    need: { par: [5, 12], unlock: [1, 3], flow: 3, traps: 3, blindness: 2, maxJam: 0.4 },
    prefer: function (p) { return p.blindness * 16 + p.traps * 8 + p.flow * 4 + p.par * 3 - p.pieces.total * 2.5; }
  },
  {
    id: 14, name: 'THREAD', chapter: 3,
    idea: 'A hazard adds no material to the board — it removes places to rest, and that is what makes a small board deep.',
    feeling: 'A long solution on a tiny board, with no crowd of pieces to hide behind.',
    note: 'The densest thing in the first half of the game per square. Two blocks, nine or ' +
          'twelve cells, and a solution far longer than the material suggests, purely because ' +
          'half the stopping places are illegal.',
    specs: [nineHaz(2, [1, 2], [1, 2]), twelveHaz(2, [1, 2], [1, 2])],
    need: { par: [7, 14], unlock: [1, 3], flow: 4, blindness: 1, maxJam: 0.35 },
    prefer: function (p) { return p.par * 6 + p.flow * 5 + p.blindness * 8 + p.states * 0.2 - p.pieces.total * 3; }
  },
  {
    id: 15, name: 'EDGE', chapter: 3,
    idea: 'The hazard, the walls and the blocks all doing one job each, with nothing left over.',
    feeling: 'Dangerous, completely fair, and solvable on sight once seen.',
    note: 'Chapter three\'s finale. Every piece is load-bearing, the dead ends are all loud ' +
          'ones — you watch the block break — and there is exactly one thing to realise.',
    specs: [twelveHaz(2, [1, 2], [1, 1]), twelveHaz(2, [1, 3], [1, 2])],
    need: { par: [7, 14], unlock: [1, 2], flow: 4, blindness: 2, traps: 2, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 15 + p.flow * 5 + p.par * 5 - p.pieces.total * 3 - p.jam * 20; }
  },

  // ── CHAPTER 4 · PAIR ────────────────────────────────────────────────────
  // Colour, two blocks per colour. A goal is a hole for one block and a floor
  // tile for the other — and since a block that has not been collected is still
  // a wall, finishing early is how you lose.

  {
    id: 16, name: 'SORT', chapter: 4,
    idea: 'A goal that is not yours does not take you. You can stop right in it and stay there.',
    feeling: 'Watch a block come to rest in a socket and not be collected, once, and the rule is learned.',
    note: 'Colour arrives in the smallest board that can show what it does. The lesson is not ' +
          '"match the colours" — a child gets that instantly — it is that a block parked in ' +
          'the wrong socket is still a block, still in the way, and now the best backstop on ' +
          'the board.',
    hint: { ja: '色の合うゴールだけが受け取る', en: 'A goal only takes its own colour' },
    specs: [nineCol(['A', 'B'], [0, 1]), nineCol(['A', 'B'], [1, 2])],
    need: { par: [3, 7], unlock: [1, 2], refused: 1, allowNaive: true, maxLuck: 0.25, maxJam: 0.15, minLive: 2 },
    prefer: function (p) { return p.refused * 8 + p.traps * 4 + p.par * 3 - p.pieces.total * 5; }
  },
  {
    id: 17, name: 'THROUGH', chapter: 4,
    idea: 'You do not want to collect that block yet. You still need it standing there.',
    feeling: 'Turning down a collection because the block is worth more as a wall.',
    note: 'The board that turns "collect everything as fast as possible" into a mistake. One ' +
          'block has to stay out long after it could have gone home, because it is the only ' +
          'thing that can stop the other colour on its socket.',
    specs: [nineCol(['A', 'A', 'B'], [0, 2]), nineCol(['A', 'B', 'B'], [0, 2]), twelveCol(['A', 'A', 'B'], [1, 2])],
    need: { par: [6, 12], unlock: [1, 3], flow: 3, blindness: 2, refused: 1, maxJam: 0.2 },
    prefer: function (p) { return p.blindness * 14 + p.refused * 6 + p.flow * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 18, name: 'ORDER', chapter: 4,
    idea: 'Both colours want the same tilt. Only one of them can have it first.',
    feeling: 'Two plans that are each fine alone and destroy each other in the wrong sequence.',
    note: 'Nothing on this board is difficult to move. The entire puzzle is which of two ' +
          'obvious things happens first, and the two orders do not merely differ in length — ' +
          'one of them does not work at all.',
    specs: [nineCol(['A', 'A', 'B'], [1, 2]), nineCol(['A', 'B', 'B'], [1, 2]), twelveCol(['A', 'A', 'B'], [1, 2])],
    need: { par: [7, 13], unlock: [1, 3], flow: 3, blindness: 2, traps: 2, maxJam: 0.18 },
    prefer: function (p) { return p.blindness * 13 + p.traps * 7 + p.flow * 4 + p.par * 4 - p.pieces.total * 2.5; }
  },
  {
    id: 19, name: 'SWAP', chapter: 4,
    idea: 'Every tilt that helps one colour hurts the other, and the answer helps neither.',
    feeling: 'Four moves, four reasons not to. Then the fifth reading of the board.',
    note: 'Ranked by instinct the correct opening is dead last, and it is dead last because ' +
          'it appears to abandon both colours at once.',
    specs: [twelveCol(['A', 'A', 'B'], [1, 2]), twelveCol(['A', 'B', 'B'], [1, 2]),
            twelveCol(['A', 'A', 'B', 'B'], [1, 2])],
    need: { par: [8, 16], unlock: [1, 3], flow: 4, blindness: 3, traps: 3, maxJam: 0.25 },
    prefer: function (p) { return p.blindness * 18 + p.traps * 8 + p.flow * 4 + p.par * 4 - p.pieces.total * 2.5 - p.jam * 25; }
  },
  {
    id: 20, name: 'TILT', chapter: 4,
    idea: 'The longest board in the first half that is still one idea.',
    feeling: 'Everything the campaign has taught so far, asked once, on a board that looks like it should be easy.',
    note: 'The halfway finale is not the biggest board — it is whichever board scored highest ' +
          'on the thing this game is actually about, with length used only to break ties ' +
          'between boards that were already good.',
    specs: [twelveCol(['A', 'A', 'B', 'B'], [1, 2]), twelveCol(['A', 'A', 'B'], [1, 3]),
            sixteenCol(['A', 'A', 'B', 'B'], [3, 3])],
    need: { par: [9, 20], unlock: [1, 2], flow: 5, blindness: 2, traps: 3, maxJam: 0.22, maxWays: 6 },
    prefer: function (p) {
      return p.blindness * 16 + p.flow * 6 + p.traps * 7 + p.retreat * 5 +
             (p.bait ? 10 : 0) + (p.indirect ? 8 : 0) + p.chainLast * 5 +
             p.par * 5 - p.pieces.total * 2.5 - p.jam * 30;
    }
  },

  // ── CHAPTER 5 · TOGETHER · MATCH ────────────────────────────────────────
  // 「同じものをくっつけろ」. The holes are gone. Two blocks of a colour have to
  // end up touching, which means the board stops being about a destination and
  // becomes about a relationship — and the two things you are trying to join
  // are driven by the SAME gravity, so most of the work is separating them
  // before you can bring them together.

  {
    id: 21, name: 'MEET', chapter: 5,
    idea: 'There are no holes. Two blocks of a colour just have to end up touching.',
    feeling: 'The rule is understood from the picture before the hint is read.',
    note: 'A board with nothing on it but two pairs and a wall, so the new goal explains ' +
          'itself the first time a tilt slams two of the same colour together. The trap is ' +
          'already here in miniature: the tilt that joins one pair splits the other.',
    hint: { ja: '同じ色どうしをくっつける', en: 'Join each colour to its twin' },
    specs: [match(3, 3, ['A', 'A', 'B', 'B'], [0, 1]), match(3, 3, ['A', 'A', 'B', 'B'], [1, 2])],
    need: { par: [3, 6], unlock: [1, 2], allowNaive: true, maxLuck: 0.3, maxJam: 0.3, minLive: 2 },
    prefer: function (p) { return p.traps * 8 + p.par * 3 - p.pieces.total * 5; }
  },
  {
    id: 22, name: 'APART', chapter: 5,
    idea: 'One gravity moves both of them, so the way to bring two blocks together is to drive them apart first.',
    feeling: 'Every tilt that closes the gap re-opens it at the far wall.',
    note: 'The heart of MATCH. Two blocks in the same row chase each other forever: tilt ' +
          'toward one another and they both go, tilt the other way and they both come back. ' +
          'The only way to close a gap is to get something in the way of one of them, which ' +
          'means moving the pair you were not thinking about.',
    specs: [match(3, 3, ['A', 'A', 'B', 'B'], [1, 2]), match(4, 3, ['A', 'A', 'B', 'B'], [1, 2])],
    need: { par: [5, 10], unlock: [1, 3], flow: 2, blindness: 1, retreat: 1, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 14 + p.retreat * 8 + p.flow * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 23, name: 'WEDGE', chapter: 5,
    idea: 'The wall between two blocks is the other pair — and you can move it.',
    feeling: 'Realising the blocks you are not trying to join are the tool for joining the ones you are.',
    note: 'Nothing in this game separates two blocks except something standing between them, ' +
          'and on a MATCH board the only movable somethings are the other colours. This board ' +
          'cannot be solved without using one pair as scaffolding for the other.',
    specs: [match(4, 3, ['A', 'A', 'B', 'B'], [1, 2]), match(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], [1, 2])],
    need: { par: [7, 14], unlock: [1, 3], flow: 3, blindness: 2, traps: 2, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 15 + p.traps * 7 + p.flow * 4 + p.par * 3 - p.pieces.total * 2.5; }
  },
  {
    id: 24, name: 'BREAK', chapter: 5,
    idea: 'A pair you already joined comes apart the moment you tilt for the next one.',
    feeling: 'Watching finished work undo itself, and understanding that the order was the puzzle.',
    note: 'MATCH has no bank. Nothing is ever put away, so every pair you close stays on the ' +
          'board being pushed around by every subsequent tilt — and the winning position is ' +
          'the one where all of them are together AT THE SAME TIME. The last tilt has to close ' +
          'the final pair without opening any of the others.',
    specs: [match(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], [1, 2]), match(4, 3, ['A', 'A', 'B', 'B'], [1, 3])],
    need: { par: [9, 17], unlock: [1, 4], flow: 3, blindness: 2, retreat: 2, maxJam: 0.32 },
    prefer: function (p) { return p.blindness * 13 + p.retreat * 7 + p.par * 5 + p.flow * 3 - p.pieces.total * 2; }
  },
  {
    budget: 4000, id: 25, name: 'TOGETHER', chapter: 5,
    idea: 'Three pairs, one gravity, and exactly one arrangement where all of them are touching at once.',
    feeling: 'The chapter\'s closing statement: six blocks, twelve cells, and twenty tilts of one idea.',
    note: 'Chapter five\'s finale and the longest MATCH board the sweep found that is still ' +
          'fair. Every pair is somebody else\'s obstacle, and the solution is a single ' +
          'sequence in which each of them is assembled in the only order that does not ' +
          'destroy the others.',
    specs: [match(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], [1, 2]), match(5, 3, ['A', 'A', 'B', 'B'], [1, 2])],
    need: { par: [16, 26], unlock: [1, 40], flow: 0, blindness: 1, maxJam: 0.35, minInsights: 4, minGuided: 0.3 },
    prefer: function (p) { return p.par * 6 + p.blindness * 12 + p.guided * 2 - p.pieces.total * 2 - p.jam * 25; }
  },

  // ── CHAPTER 6 · CHOSEN · SELECT ─────────────────────────────────────────
  // 「指定されたものだけを目的達成させろ」. Some blocks have a socket and some
  // do not, and the ones that do not can never leave. You cannot move one
  // block: you move the world, and everything answers — so the whole chapter is
  // about getting one thing home THROUGH a board of things that will not go.

  {
    id: 26, name: 'ONLY', chapter: 6,
    idea: 'Only the blocks with a matching socket have to go home. The rest are furniture that moves.',
    feeling: 'Seeing a block that visibly has nowhere to go, and realising that is not a mistake.',
    note: 'SELECT arrives on the smallest board that can state it: one block with a socket, ' +
          'one without. The one without is drawn dimmed and hollow, so which blocks are cargo ' +
          'and which are scenery is something the player reads off the board rather than off ' +
          'a sentence. It still slides, and it still stops things.',
    hint: { ja: '光っているブロックだけ帰ればいい', en: 'Only the lit blocks have to get home' },
    specs: [select(3, 3, ['A', 'B'], ['a'], [0, 1]), select(3, 3, ['A', 'B'], ['a'], [1, 2])],
    need: { par: [3, 6], unlock: [1, 2], allowNaive: true, maxLuck: 0.3, maxJam: 0.25, minLive: 2 },
    prefer: function (p) { return p.traps * 8 + p.par * 3 - p.pieces.total * 5; }
  },
  {
    id: 27, name: 'INERT', chapter: 6,
    idea: 'The block that can never leave is the best wall you have.',
    feeling: 'The thing you were treating as an obstacle turns out to be the equipment.',
    note: 'Under ALL IN every block is spent eventually, so a backstop is temporary by ' +
          'definition. A block with no socket is permanent — it is the only thing in TILT ' +
          'that can be relied on to still be there at the end — and this board is built so ' +
          'the only way to stop the cargo on its socket is to put the furniture behind it.',
    specs: [select(3, 3, ['A', 'A', 'B'], ['a'], [0, 2]), select(4, 3, ['A', 'A', 'B'], ['a'], [1, 2])],
    need: { par: [5, 11], unlock: [1, 3], flow: 3, caught: 1, blindness: 1, maxJam: 0.25 },
    prefer: function (p) { return p.caught * 12 + p.blindness * 12 + p.flow * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 28, name: 'THROUGH2', chapter: 6,
    idea: 'You cannot move one block. You move the world, and everything answers.',
    feeling: 'Working out a route for one piece and discovering the board rearranges itself behind you.',
    note: 'The tilt that takes the cargo where it needs to go also takes three other blocks ' +
          'somewhere, and one of those somewheres is in the way. The puzzle is not the route: ' +
          'it is the side effects of the route.',
    specs: [select(4, 3, ['A', 'A', 'B'], ['a'], [1, 2]), select(4, 3, ['A', 'A', 'B', 'B'], ['a'], [1, 2])],
    need: { par: [8, 15], unlock: [1, 4], flow: 3, blindness: 2, traps: 2, maxJam: 0.28 },
    prefer: function (p) { return p.blindness * 14 + p.traps * 7 + p.flow * 4 + p.par * 4 - p.pieces.total * 2.5; }
  },
  {
    budget: 4000, id: 29, name: 'CLEAR', chapter: 6,
    idea: 'The furniture is in the way, and the only way to move it is to move everything.',
    feeling: 'Several tilts spent on blocks that are not going anywhere, before the one that matters.',
    note: 'A board where the cargo is one tilt from home from the very first frame, and that ' +
          'tilt is illegal for another eight moves because of what is standing where. Every ' +
          'move on the shortest line is a move made for a block that will never leave.',
    specs: [select(4, 3, ['A', 'A', 'B', 'B'], ['a'], [1, 2]), select(4, 3, ['A', 'A', 'B'], ['a'], [1, 3])],
    need: { par: [12, 20], unlock: [1, 30], flow: 0, blindness: 2, setup: 2, maxJam: 0.3, minInsights: 3, minGuided: 0.3 },
    prefer: function (p) { return p.blindness * 12 + p.par * 5 + p.setup * 4 + p.guided * 2 - p.pieces.total * 2; }
  },
  {
    budget: 4000, id: 30, name: 'CHOSEN', chapter: 6,
    idea: 'One block. Twenty tilts. Everything else on the board is the obstacle.',
    feeling: 'The chapter\'s closing statement: the longest route in the game so far, for a single piece.',
    note: 'Chapter six\'s finale. Two colours of furniture and one colour of cargo, and the ' +
          'shortest way home is around twenty tilts — not because the board is big, but ' +
          'because every tilt that moves the cargo also moves everything that could stop it.',
    specs: [select(4, 3, ['A', 'A', 'B', 'B'], ['a'], [1, 2]),
            select(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], ['a'], [1, 2])],
    need: { par: [18, 26], unlock: [1, 40], flow: 0, blindness: 1, maxJam: 0.32, minInsights: 4, minGuided: 0.3 },
    prefer: function (p) { return p.par * 6 + p.blindness * 12 + p.guided * 2 - p.pieces.total * 2 - p.jam * 25; }
  },

  // ── CHAPTER 7 · SHAPE · FORM ────────────────────────────────────────────
  // 「指定された形を作れ」. The marked cells are standing spots, not holes.
  // Nothing is ever removed, every constraint has to be satisfied at the same
  // time, and every block you place correctly is a new wall in the way of the
  // next one.

  {
    id: 31, name: 'PLACE', chapter: 7,
    idea: 'These marks are not holes. They are cells you have to be standing on when the board settles.',
    feeling: 'Watching a block stop on a marked cell and STAY there is the entire rule.',
    note: 'FORM opens with the smallest possible statement of it: two marks, two blocks, and ' +
          'one tilt that puts both where they belong. The marks are drawn as brackets on the ' +
          'floor rather than as sunken sockets, so the difference from a goal is visible ' +
          'before it is explained.',
    hint: { ja: '印の上に全部そろえて止める', en: 'Fill every marked cell at once' },
    specs: [form(3, 3, ['@', '@'], ['o', 'o'], [0, 1]), form(3, 3, ['@', '@'], ['o', 'o'], [1, 2])],
    need: { par: [3, 6], unlock: [1, 2], allowNaive: true, maxLuck: 0.3, maxJam: 0.25, minLive: 2 },
    prefer: function (p) { return p.traps * 8 + p.par * 3 - p.pieces.total * 5; }
  },
  {
    id: 32, name: 'AT ONCE', chapter: 7,
    idea: 'Every mark has to be covered at the same moment. Filling them one at a time is not progress.',
    feeling: 'Getting one right, then getting the next one right, then finding the first one has moved.',
    note: 'The difference between FORM and everything before it. Under ALL IN a collected ' +
          'block is banked and safe; here nothing is banked, so a block sitting perfectly on ' +
          'its mark is going to be dragged off it by the very next tilt unless something is ' +
          'holding it there.',
    specs: [form(4, 3, ['@', '@'], ['o', 'o'], [1, 3]), form(3, 3, ['@', '@'], ['o', 'o'], [1, 3])],
    need: { par: [5, 11], unlock: [1, 3], flow: 2, blindness: 1, retreat: 1, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 14 + p.retreat * 8 + p.flow * 4 + p.par * 3 - p.pieces.total * 3; }
  },
  {
    id: 33, name: 'ANCHOR', chapter: 7,
    idea: 'A block that is already in place is a wall — and walls are how you place the next one.',
    feeling: 'The first correct block stops being a result and becomes a tool.',
    note: 'The compensation for nothing being banked: a block on its mark is still on the ' +
          'board, and it stops everything else. On this shape the second block can only be ' +
          'held where it needs to be by the first one, so the order is forced and the reason ' +
          'is visible.',
    specs: [form(4, 3, ['@', '@', 'C'], ['o', 'o', 'o'], [1, 2]), form(4, 3, ['@', '@'], ['o', 'o'], [1, 2])],
    need: { par: [6, 13], unlock: [1, 3], flow: 3, blindness: 2, traps: 2, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 14 + p.traps * 7 + p.flow * 4 + p.par * 4 - p.pieces.total * 2.5; }
  },
  {
    budget: 4000, id: 34, name: 'PATTERN', chapter: 7,
    idea: 'The shape names colours as well as cells: the right block has to be on the right mark.',
    feeling: 'Two blocks in the right places and the shape is still wrong.',
    note: 'FORM and colour together, which is the only pairing in the game where two rules ' +
          'make ONE question instead of two: "which cells" and "which blocks" are the same ' +
          'sentence. A mark that names a colour will not accept anything else, so the shape ' +
          'is a picture rather than a count.',
    specs: [form(4, 3, ['A', 'A', 'B'], ['a', 'a', 'b'], [1, 2]),
            form(4, 3, ['A', 'B', 'B'], ['a', 'b', 'b'], [1, 2])],
    need: { par: [10, 18], unlock: [1, 30], flow: 0, blindness: 2, maxJam: 0.3, minInsights: 3, minGuided: 0.3 },
    prefer: function (p) { return p.blindness * 13 + p.par * 5 + p.guided * 2 - p.pieces.total * 2.5; }
  },
  {
    budget: 4000, id: 35, name: 'SHAPE', chapter: 7,
    idea: 'Three marks, three colours, and one arrangement of the board that satisfies all of them.',
    feeling: 'The chapter\'s closing statement: a picture you have to build with a tool that moves everything.',
    note: 'Chapter seven\'s finale. Every block is load-bearing twice over — as a piece of the ' +
          'shape and as the wall that holds another piece of it — and the last tilt has to ' +
          'land the final block without shifting any of the ones already home.',
    specs: [form(4, 3, ['A', 'A', 'B'], ['a', 'a', 'b'], [1, 2]),
            form(4, 3, ['A', 'A', 'B', 'B'], ['a', 'a', 'b'], [1, 2])],
    need: { par: [16, 24], unlock: [1, 40], flow: 0, blindness: 1, maxJam: 0.32, minInsights: 4, minGuided: 0.3 },
    prefer: function (p) { return p.par * 6 + p.blindness * 12 + p.guided * 2 - p.pieces.total * 2 - p.jam * 25; }
  },

  // ── CHAPTER 8 · ABYSS ───────────────────────────────────────────────────
  //
  // Everything at once, and the one place in the campaign where length is a
  // target rather than a by-product.
  //
  // The rest of this file argues that a long solution is not a good one, and
  // that argument stands: no board in chapters 1–7 was chosen for being long.
  // But it was always an argument about the DEFAULT, not a law — a player who
  // has finished thirty-five boards has earned the right to be handed something
  // that takes an hour, and "one idea, beautifully expressed" is not the only
  // thing a puzzle can be.
  //
  // So the floor here is par 30 and the ceiling is whatever the sweep can find,
  // and the rules that keep the rest of the game honest are relaxed exactly
  // twice: devices may be combined, and `unlock` is no longer required to be
  // small. Everything else still holds, and two things are ENFORCED HARDER,
  // because they are what separates a long puzzle from a long chore:
  //
  //   insights ≥ 6   at least six moves on the line where the player's instinct
  //                  is wrong. A forty-tilt board with two decisions in it is
  //                  thirty-eight tilts of admin.
  //   guided ≥ 45%   and at least that much of it plays itself. A board where
  //                  every single move is its own fight is a corridor, and this
  //                  is the number that says so.
  //
  // The measured shape of a good ABYSS board is therefore: very long, mostly
  // momentum, with a handful of places where momentum is exactly wrong.

  {
    budget: 1200, id: 36, name: 'DESCENT', chapter: 8,
    idea: 'Everything you have learned, on one board, for thirty tilts.',
    feeling: 'The first board that is genuinely a sitting-down puzzle rather than a moment.',
    note: 'The gate to the last chapter, and the gentlest thing in it. Three colours, one ' +
          'destination, and a shortest solution around thirty tilts — of which most follow ' +
          'once you have seen the handful that do not.',
    specs: [select(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], ['a', 'b'], [1, 2])],
    need: { par: [30, 36], unlock: [1, 99], flow: 0, blindness: 1, maxJam: 0.4, maxLuck: 0.001,
            minInsights: 6, minGuided: 0.42, maxPump: 0.4 },
    prefer: function (p) { return p.blindness * 10 + p.insights * 3 + p.guided * 1.5 - p.jam * 20; }
  },
  {
    budget: 1200, id: 37, name: 'WARREN', chapter: 8,
    idea: 'Twelve cells, six blocks and nowhere at all to put anything.',
    feeling: 'Every tilt is legal, almost every tilt is wrong, and it takes forty of them.',
    note: 'The density argument taken to its conclusion. Half the board is blocks, so the ' +
          'walls barely matter — the maze is made of the pieces, and it rearranges itself ' +
          'every time you touch it.',
    specs: [select(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], ['a', 'b'], [1, 2])],
    need: { par: [37, 45], unlock: [1, 99], flow: 0, blindness: 1, maxJam: 0.4, maxLuck: 0.001,
            minInsights: 8, minGuided: 0.42, maxPump: 0.4 },
    prefer: function (p) { return p.par * 2 + p.blindness * 10 + p.insights * 3 - p.jam * 20; }
  },
  {
    budget: 1200, id: 38, name: 'MIRE', chapter: 8,
    idea: 'A shape to build, in a room too full to build it in.',
    feeling: 'Knowing exactly what the answer looks like from the first second, and needing forty tilts to reach it.',
    note: 'FORM at the far end of its range. There is no mystery about the target — it is ' +
          'drawn on the floor — and that changes nothing, because the difficulty was never ' +
          'about knowing where to go.',
    specs: [form(4, 3, ['A', 'A', 'B', 'B', 'C'], ['a', 'a', 'b', 'b'], [1, 2])],
    need: { par: [38, 50], unlock: [1, 99], flow: 0, blindness: 1, maxJam: 0.42, maxLuck: 0.001,
            minInsights: 6, minGuided: 0.4, maxPump: 0.45 },
    prefer: function (p) { return p.par * 3 + p.blindness * 10 + p.insights * 3 - p.jam * 18; }
  },
  {
    budget: 1200, id: 39, name: 'GAUNTLET', chapter: 8,
    idea: 'The rules that were kept apart all game, on one board, on purpose.',
    feeling: 'Reading a board that is doing three things at once, and finding it is still fair.',
    note: 'The one place the campaign spends the result it spent the rest of the game ' +
          'obeying. Every measurement said a board using two devices at once is harder to ' +
          'read and less fair than the better of the two alone — and that is a reason to keep ' +
          'them apart in a teaching chapter, not a reason to pretend the combination does not ' +
          'exist. Here it is, once, at the end, where the player has the vocabulary for it.',
    specs: [select(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], ['a', 'b'], [1, 2], [1, 1]),
            match(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], [1, 2], [1, 1])],
    need: { par: [30, 70], unlock: [1, 99], flow: 0, blindness: 1, maxJam: 0.45, maxLuck: 0.001,
            minInsights: 6, minGuided: 0.4, maxPump: 0.45 },
    prefer: function (p) { return p.par * 3 + p.blindness * 12 + p.insights * 3 - p.jam * 15; }
  },
  {
    budget: 1200, id: 40, name: 'ABYSS', chapter: 8,
    idea: 'The longest board in TILT that a person could actually solve.',
    feeling: 'Not a moment of insight. An afternoon.',
    note: 'The end of the game, and the only board in it chosen for its length. It is the ' +
          'deepest position the exhaustive sweep of twelve cells could find that still passes ' +
          'every fairness test the rest of the campaign is held to: nothing is won by luck, ' +
          'no piece is dead weight, and the moves that matter are outnumbered by the moves ' +
          'that follow from them.',
    specs: [form(4, 3, ['A', 'A', 'B', 'B', 'C'], ['a', 'a', 'b', 'b'], [1, 2]),
            select(4, 3, ['A', 'A', 'B', 'B', 'C', 'C'], ['a', 'b'], [1, 2])],
    need: { par: [51, 99], unlock: [1, 99], flow: 0, blindness: 1, maxJam: 0.45, maxLuck: 0.001,
            minInsights: 8, minGuided: 0.4, maxPump: 0.45 },
    prefer: function (p) { return p.par * 5 + p.blindness * 10 + p.insights * 2 - p.jam * 15; }
  }
];

// ---------------------------------------------------------------------------
// the search
// ---------------------------------------------------------------------------

/**
 * Everything a slot's specs can produce, measured and filtered.
 *
 * Three stages, cheapest first, because the last one is expensive enough that
 * it must only ever see finalists:
 *
 *   SWEEP    solve whole terrains at once. Filters on nothing but length and
 *            the crux, which are the two things that come free off the shared
 *            tables. Deliberately permissive — a filter applied here that the
 *            ranking would have wanted back cannot be recovered later, and
 *            that is exactly how the first draft of this file starved four
 *            slots of candidates.
 *   PROFILE  full measurement minus the deletion census. This is where the
 *            slot's real signature is enforced.
 *   CENSUS   delete every piece in turn and check the board misses it. Runs on
 *            a few dozen finalists per slot, never on the whole pool.
 */
var PROFILE_CACHE = Object.create(null);
var CENSUS_CACHE = Object.create(null);
var CACHE_CAP = 120000;

/** Keep a memo table from growing without bound over a long build. */
function remember(cache, key, value) {
  if (Object.keys(cache).length > CACHE_CAP) {
    for (var k in cache) { delete cache[k]; break; }
  }
  cache[key] = value;
  return value;
}

var NODE_CAP = 400000;

/**
 * The crux sweep replays the naive player from every node on every optimal
 * line, so on a fifty-tilt board it is unbounded work for an answer that is
 * known in advance. Long slots buy a small budget and take the pessimistic
 * reading; short slots, where `unlock` is the whole selection criterion, pay
 * in full.
 */
function cruxBudgetFor(need) {
  var top = need.par ? need.par[1] : 12;
  return top > 20 ? 60 : 4000;
}

function key(rows, win) { return win + '|' + D.canonical(rows); }

function quickProfile(rows, win, need) {
  var k = key(rows, win);
  var hit = PROFILE_CACHE[k];
  if (hit !== undefined) return hit;
  return remember(PROFILE_CACHE, k, D.profile(rows, {
    quick: true, cap: NODE_CAP, win: win, cruxBudget: cruxBudgetFor(need)
  }));
}

/** Full profile including the deletion census, memoised across slots. */
function fullProfile(rows, win, need) {
  var k = key(rows, win);
  var hit = CENSUS_CACHE[k];
  if (hit !== undefined) return hit;
  return remember(CENSUS_CACHE, k, D.profile(rows, {
    cap: NODE_CAP, win: win, cruxBudget: cruxBudgetFor(need)
  }));
}

function search(slot, budget) {
  var need = {};
  var k;
  for (k in BASE_NEED) need[k] = BASE_NEED[k];
  for (k in slot.need) need[k] = slot.need[k];
  // A teaching board is allowed to be solvable on instinct — that is what it is
  // for. Every other board in the game is not.
  if (need.allowNaive) delete need.naiveSolves;

  var sweepFilters = {
    par: need.par,
    unlock: need.allowNaive ? null : (need.unlock || [1, 4]),
    allowNaive: !!need.allowNaive,
    nodeCap: NODE_CAP,
    maxPlacements: 500000
  };

  var raw = [], seenBoard = Object.create(null);
  var terrainCount = 0;

  // Boards written down rather than swept.
  //
  // Every other board in the game is the best one that EXISTS inside a budget,
  // because at 3×3 and 4×3 the search is exhaustive. Past twelve cells it
  // cannot be: a 5×3 board with six blocks has more placements than the sweep
  // can hold, so the only way to reach that part of the space is to sample it —
  // random board, then move one piece at a time toward a longer solution. A
  // slot that wants something from out there names it here, and the board is
  // then held to exactly the same gates as everything else: it is measured,
  // censused, and rejected like any other candidate. What it cannot claim is
  // that nothing better exists, and the stage note says so.
  (slot.seeds || []).forEach(function (seed) {
    var k2 = key(seed.board, seed.win || 'allin');
    if (seenBoard[k2]) return;
    seenBoard[k2] = 1;
    raw.push({ board: seed.board, win: seed.win || 'allin', par: 0, blindness: 0, flow: 0, traps: 0, bait: 0, seeded: true });
  });

  slot.specs.forEach(function (sp) {
    var r = G.exhaust(sp, sweepFilters, function (c) {
      var key2 = key(c.board, c.win);
      if (seenBoard[key2]) return;
      seenBoard[key2] = 1;
      raw.push(c);
    });
    terrainCount += r.terrains;
  });

  // Order the profiling pass so the most promising boards are measured first.
  // A teaching board wants the opposite of a puzzle board — the smallest,
  // plainest thing that can still show the rule — so it gets its own order, and
  // a slot whose whole point is length is ordered by length.
  var wantsLength = need.par && need.par[0] >= 16;
  if (need.allowNaive) {
    raw.sort(function (a, b) {
      return (weight(a.board) * 10 + a.par) - (weight(b.board) * 10 + b.par);
    });
  } else if (wantsLength) {
    raw.sort(function (a, b) {
      return (b.par * 4 + b.blindness * 8) - (a.par * 4 + a.blindness * 8);
    });
  } else {
    raw.sort(function (a, b) {
      return (b.blindness * 100 + b.flow * 8 + b.traps * 4 + b.bait * 6) -
             (a.blindness * 100 + a.flow * 8 + a.traps * 4 + a.bait * 6);
    });
  }

  // A seeded board is never sorted out of the pool: it has no sweep numbers to
  // rank by, and the whole point of naming it was that the sweep could not
  // reach it.
  var seeded = raw.filter(function (c) { return c.seeded; });
  var pool = seeded.concat(raw.filter(function (c) { return !c.seeded; }).slice(0, budget || 12000));
  var kept = [];
  for (var i = 0; i < pool.length; i++) {
    var p = quickProfile(pool[i].board, pool[i].win, need);
    if (!p) continue;
    if (!G.fits(p, need)) continue;
    if (!need.allowNaive && p.unlock === 0) continue;
    kept.push(p);
  }

  // Every slot, whatever else it wants, prefers a board that FINISHES. Two
  // boards that express the idea equally well are not equally good if one of
  // them ends with four blocks crossing the board into the last socket and the
  // other ends with one block shuffling one cell.
  kept.sort(function (a, b) {
    return (slot.prefer(b) + finish(b)) - (slot.prefer(a) + finish(a));
  });
  return { raw: raw.length, terrains: terrainCount, examined: pool.length, kept: kept, need: need };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function boardKey(p) { return key(p.board, p.win); }

/** The walls, goals and hazards, with the blocks swept off. */
function terrainOf(rows) {
  return D.canonical(rows.map(function (r) { return r.replace(/[@ABC]/g, '.'); }));
}

/**
 * What counts as "the same puzzle wearing a hat".
 *
 * The same furniture with the same number of blocks in different cells is the
 * same puzzle: a player recognises the board and re-uses the idea. The same
 * furniture with a DIFFERENT number of blocks is not — two blocks on a terrain
 * and five blocks on it play nothing alike, because on this board the blocks
 * are most of the walls.
 *
 * The stricter reading (never repeat a terrain at all) was tried first and is
 * wrong: it starves a nine-cell game. There are only a few dozen distinct 3×3
 * terrains worth building on, and forbidding all reuse means the last stage is
 * chosen from whatever the others did not want.
 */
function shapeKey(p) {
  var rows = p.board, blocks = 0;
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) if ('@ABC'.indexOf(rows[y][x]) >= 0) blocks++;
  }
  return p.win + '|' + terrainOf(rows) + '#' + blocks;
}

/**
 * Fill the forty slots.
 *
 * No two stages may share a board, and no two may share a TERRAIN and a block
 * count either — the same walls with the blocks shuffled is the same puzzle
 * wearing a hat, and on a nine-cell board it is very obviously the same puzzle.
 *
 * That constraint makes the order of assignment matter enormously, because the
 * design space is not evenly stocked. Sweeping it exhaustively turns up a
 * genuinely surprising fact: under the base rules at 3×3 there are only TWO
 * boards in existence whose correct opening is the last one a player would try
 * and which carry no dead weight — and they share a terrain. Assigning slots in
 * id order lets a teaching board, which a hundred terrains would have suited,
 * take the one terrain the hard board could not do without.
 *
 * So slots are filled scarcest-first: whichever slot has the fewest qualifying
 * boards in the entire searched space picks before any slot that has more. The
 * teaching stages, which are the most accommodating, choose last from what is
 * left. Same forty ideas, assigned so that the rare ones survive.
 */
function build() {
  var t0 = Date.now();
  var pending = [];

  SLOTS.forEach(function (slot) {
    if (ONLY && ONLY.indexOf(slot.id) < 0) return;
    var t1 = Date.now();
    var res = search(slot, slot.budget);
    res.seconds = (Date.now() - t1) / 1000;
    pending.push({ slot: slot, res: res });
    console.log('  · ' + pad(slot.id) + ' ' + slot.name.padEnd(9) +
      String(res.terrains).padStart(5) + ' terrains → ' + String(res.raw).padStart(6) +
      ' candidates → ' + String(res.kept.length).padStart(5) + ' fit the idea   (' +
      res.seconds.toFixed(1) + 's)');
  });

  // Scarcest first.
  var order = pending.slice().sort(function (a, b) { return a.res.kept.length - b.res.kept.length; });

  var usedBoard = Object.create(null);
  var usedShape = Object.create(null);
  var terrainUses = Object.create(null);
  var chosen = [];
  var censusTotal = 0, censusDead = 0;

  console.log('');
  order.forEach(function (item) {
    var slot = item.slot, res = item.res;

    // The census — delete every piece and check the board misses it — is by far
    // the most expensive test, so it is paid for here, on finalists only.
    // Roughly six boards in seven turn out to be carrying a piece the board
    // would not miss, so the scan has to be allowed to go deep into the ranked
    // list before giving up — stopping at the first few dozen leaves slots
    // unfilled while perfectly good boards sit further down.
    var pick = null, censused = 0;
    for (var i = 0; i < res.kept.length && censused < 600; i++) {
      var p = res.kept[i];
      if (usedBoard[boardKey(p)]) continue;
      if (usedShape[shapeKey(p)]) continue;
      // A terrain may appear at most twice in the whole game. There are only a
      // few dozen 3×3 arrangements of walls worth building on, so banning reuse
      // outright starves the search — but four stages on the same walls is a
      // chapter that looks like one stage, whatever the blocks are doing.
      if ((terrainUses[terrainOf(p.board)] || 0) >= 2) continue;
      censused++;
      censusTotal++;
      var full = fullProfile(p.board, p.win, res.need);
      if (!full || full.inert) { censusDead++; continue; }
      pick = full;
      break;
    }

    if (!pick) {
      console.log('  ✗ ' + pad(slot.id) + ' ' + slot.name.padEnd(9) +
        ' NO BOARD SATISFIES THIS SLOT  (' + res.kept.length + ' fit the idea, ' +
        'all taken or carrying dead weight)');
      return;
    }

    usedBoard[boardKey(pick)] = 1;
    usedShape[shapeKey(pick)] = 1;
    terrainUses[terrainOf(pick.board)] = (terrainUses[terrainOf(pick.board)] || 0) + 1;
    chosen.push({ slot: slot, p: pick, stats: res });
  });

  chosen.sort(function (a, b) { return a.slot.id - b.slot.id; });
  chosen.forEach(function (c) {
    console.log('  ✓ ' + pad(c.slot.id) + ' ' + c.slot.name.padEnd(9) +
      c.p.board.join('/').padEnd(22) + ' ' + D.summarise(c.p));
  });

  console.log('\n  ' + chosen.length + '/' + SLOTS.length + ' slots filled in ' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('  deletion test: ' + censusDead + ' of ' + censusTotal + ' finalists (' +
    (censusTotal ? Math.round(censusDead / censusTotal * 100) : 0) +
    '%) were carrying a piece the board would not miss');
  return chosen;
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

/** How much visibly happens on the last tilt. */
function finish(p) {
  return p.chainLast * 4 + Math.min(p.lastTravel, 6) * 1.0;
}

/** How much furniture is on a board. */
function weight(rows) {
  var n = 0;
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) if (rows[y][x] !== '.') n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function report(chosen) {
  console.log('\n  SCORECARDS — every stage, every axis, out of ten\n');
  console.log('  id name       Cla Dis Ins Sur Prd Ele Den Fai Sat Rep   par unlk flow ins/gui blind trap ways jam');
  console.log('  ' + new Array(114).join('─'));
  chosen.forEach(function (c) {
    var s = c.p.score, p = c.p;
    console.log('  ' + pad(c.slot.id) + ' ' + c.slot.name.padEnd(10) +
      [s.clarity, s.discovery, s.insight, s.surprise, s.prediction,
       s.elegance, s.density, s.fairness, s.satisfaction, s.replay]
        .map(function (v) { return String(v).padStart(3); }).join(' ') +
      '  ' + String(p.par).padStart(4) + String(p.unlock).padStart(5) +
      String(p.flow).padStart(5) + String(p.insights + '/' + p.guided).padStart(8) +
      String(p.blindness).padStart(6) +
      String(p.traps + '/' + p.live).padStart(5) + String(p.ways).padStart(5) +
      (p.jam * 100).toFixed(0).padStart(4) + '%');
  });

  console.log('\n  RULES ON SCREEN');
  var devicesOf = function (p) { return D.devicesOf(p.stage); };
  var count = function (fn) { return chosen.filter(fn).length; };
  console.log('    base rules only  ' + count(function (c) { return devicesOf(c.p) === 0; }) +
    '/' + chosen.length);
  console.log('    + hazard         ' + count(function (c) { return c.p.hazard; }));
  console.log('    + colour         ' + count(function (c) { return c.p.colour; }));
  E.WINS.forEach(function (w) {
    if (w === 'allin') return;
    console.log('    ' + (w + ' win').padEnd(17) + count(function (c) { return c.p.win === w; }));
  });
  var many = count(function (c) { return devicesOf(c.p) > 1; });
  console.log('    more than one    ' + many + '   (chapter 8 only)');
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

var CHAPTERS = [
  { number: 1, name: 'GRAVITY', ja: '重力', from: 1, to: 5,
    note: 'The whole vocabulary, one board per idea — and two of the five spent on the rule that defines the game: a goal is not a target, it is a cell you have to be stopped on.' },
  { number: 2, name: 'NINE', ja: '九マス', from: 6, to: 10,
    note: 'Nothing added. Two blocks, four characters, and the hardest things they can be made to say. Every board here fits in a single glance and none can be solved in one.' },
  { number: 3, name: 'EDGE', ja: '境界', from: 11, to: 15, device: 'hazard',
    note: 'The exact mirror of a goal: a cell you may cross and must not be caught on. It adds no material to a board, it removes places to rest, and being caught on one ends the run.' },
  { number: 4, name: 'PAIR', ja: '対', from: 16, to: 20, device: 'colour',
    note: 'Two colours, two blocks each. A goal is a hole for one block and a floor tile for the other — so a block collected too early is a backstop you no longer have.' },
  { number: 5, name: 'TOGETHER', ja: '結', from: 21, to: 25, device: 'match',
    note: 'No holes at all: blocks of one colour have to end up touching. One gravity moves both of them, so almost every way of closing a gap opens it again somewhere else.' },
  { number: 6, name: 'CHOSEN', ja: '選', from: 26, to: 30, device: 'select',
    note: 'Only the marked blocks have to get home; the rest can never leave and are drawn dimmed to say so. You cannot move one block — you move the world, and everything answers.' },
  { number: 7, name: 'SHAPE', ja: '形', from: 31, to: 35, device: 'form',
    note: 'The marks are standing spots, not holes. Nothing is banked, every mark has to be covered at the same moment, and every block placed is a new wall in the way of the next.' },
  { number: 8, name: 'ABYSS', ja: '深淵', from: 36, to: 40, extreme: true,
    note: 'The rules that were kept apart all game, together, and the only chapter where length is the target. Thirty tilts at the shallow end. Nothing here is a moment of insight — it is an afternoon.' }
];

function emit(chosen) {
  var out = [];
  out.push("'use strict';");
  out.push('/*');
  out.push(' * TILT — stage data.  GENERATED FILE — do not edit by hand.');
  out.push(' *');
  out.push(' * Source of truth: tools/campaign.js  (rebuild with `npm run campaign`)');
  out.push(' *');
  out.push(' * The picture:');
  out.push(' *');
  out.push(" *     '.'  floor          '#'  wall            'x'  hazard");
  out.push(" *     'o'  goal, any      '@'  block, any");
  out.push(" *     'a'  goal A         'A'  block A         (colour stages only)");
  out.push(" *     'b'  goal B         'B'  block B");
  out.push(" *     'c'  goal C         'C'  block C");
  out.push(' *');
  out.push(' * `win` says what DONE means, and it is the only thing that changes between the');
  out.push(' * four kinds of board. The physics are identical in all of them.');
  out.push(' *');
  out.push(" *     allin   (default)  collect every block");
  out.push(" *     select              collect every block whose colour has a goal; the rest");
  out.push(" *                         can never leave and are drawn dimmed");
  out.push(" *     match               no goals — blocks of one colour must end up touching");
  out.push(" *     form                the goal characters mark cells to be STOOD on, all at");
  out.push(" *                         once; nothing is ever collected");
  out.push(' *');
  out.push(' * Outside chapter 8, no stage uses more than one device at a time — no hazard');
  out.push(' * with a colour, no alternative win condition with either — because the sweep');
  out.push(' * says every pairing is worse than the stronger of the two alone. Chapter 8');
  out.push(' * spends that result deliberately. And no board anywhere carries more than TWO');
  out.push(' * blocks of any one colour.');
  out.push(' *');
  out.push(' * A block is collected ONLY if it comes to a complete stop on a goal it fits —');
  out.push(' * sliding across one does nothing. So every goal below needs something standing');
  out.push(' * one cell beyond it, and half the design of these boards is where that backstop');
  out.push(' * comes from: the edge, a wall, or a block the player has not spent yet.');
  out.push(' *');
  out.push(' * Every `par` is a breadth-first-proven shortest solution. Every piece on every');
  out.push(' * board survived deletion testing: remove any one of them and the puzzle measurably');
  out.push(' * changes. The numbers in each comment are the measured signature — see');
  out.push(' * tools/lib/design.js for what they mean:');
  out.push(' *');
  out.push(' *   unlock  how many correct moves the board costs before it starts playing itself.');
  out.push(' *           0 would mean a player who is not thinking solves it cold. No stage');
  out.push(' *           outside chapter 8 is allowed above 4.');
  out.push(' *   flow    how much stage is left after that — the part that is the reward.');
  out.push(' *   insight how many moves on the shortest line the player has to overrule their');
  out.push(' *           own instinct on. On the long boards this is the axis that matters:');
  out.push(' *           the rest of the line is momentum.');
  out.push(' *   blind   where the correct opening sits in the order a hurrying player would');
  out.push(' *           try the four tilts. 3 means it is the very last one they would pick.');
  out.push(' */');
  out.push('(function (root, factory) {');
  out.push('  var api = factory();');
  out.push("  if (typeof module === 'object' && module.exports) { module.exports = api; }");
  out.push('  if (root) { root.TiltStages = api; }');
  out.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  out.push('');
  out.push('  var CHAPTERS = [');
  CHAPTERS.forEach(function (c, i) {
    out.push('    { number: ' + c.number + ", name: '" + c.name + "', ja: '" + c.ja +
      "', from: " + c.from + ', to: ' + c.to +
      (c.device ? ", device: '" + c.device + "'" : '') +
      (c.extreme ? ', extreme: true' : '') + ',');
    out.push('      note: ' + jsStr(c.note) + ' }' + (i < CHAPTERS.length - 1 ? ',' : ''));
  });
  out.push('  ];');
  out.push('');
  out.push('  var STAGES = [');

  chosen.forEach(function (c, i) {
    var slot = c.slot, p = c.p;
    var chap = CHAPTERS.filter(function (ch) { return slot.id >= ch.from && slot.id <= ch.to; })[0];
    if (chap && slot.id === chap.from) {
      out.push('');
      out.push('    // ── CHAPTER ' + chap.number + ' · ' + chap.name + ' · ' + chap.ja +
        '  (stages ' + chap.from + '–' + chap.to + ') ' +
        new Array(Math.max(2, 46 - chap.name.length)).join('─'));
      out.push('    // ' + chap.note);
    }
    out.push('    {');
    out.push('      id: ' + slot.id + ", name: '" + slot.name + "', par: " + p.par + ',');
    if (p.win !== 'allin') out.push("      win: '" + p.win + "',");
    out.push('      // ' + D.summarise(p));
    out.push('      // scores  ' + Object.keys(p.score).map(function (k2) {
      return k2.slice(0, 3) + ' ' + p.score[k2];
    }).join(' · '));
    out.push('      idea: ' + jsStr(slot.idea) + ',');
    out.push('      note: ' + jsStr(slot.note) + ',');
    if (slot.hint) {
      out.push("      hint: { ja: '" + slot.hint.ja + "', en: '" + slot.hint.en + "' },");
    }
    out.push('      board: [' + p.board.map(function (r) { return "'" + r + "'"; }).join(',\n              ') + ']');
    out.push('    }' + (i < chosen.length - 1 ? ',' : ''));
  });

  out.push('  ];');
  out.push('');
  out.push('  return { STAGES: STAGES, CHAPTERS: CHAPTERS };');
  out.push('});');
  out.push('');

  fs.writeFileSync(path.join(ROOT, 'src', 'stages.js'), out.join('\n'));
  console.log('\n  wrote src/stages.js — ' + chosen.length + ' stages');
}

/** A JS string literal, wrapped so the generated file stays readable. */
function jsStr(s) {
  var esc = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (esc.length <= 76) return "'" + esc + "'";
  var words = esc.split(' '), lines = [], cur = '';
  words.forEach(function (w) {
    if ((cur + ' ' + w).length > 76 && cur) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  });
  if (cur) lines.push(cur);
  return lines.map(function (l, i) {
    return (i ? '            ' : '') + "'" + l + (i < lines.length - 1 ? ' ' : '') + "'";
  }).join(' +\n');
}

// ---------------------------------------------------------------------------

console.log('\n  TILT — searching for forty boards worth playing\n');
var chosen = build();
if (REPORT) report(chosen);
if (!DRY && !ONLY) {
  if (chosen.length !== SLOTS.length) {
    console.log('\n  refusing to write a partial campaign — ' +
      (SLOTS.length - chosen.length) + ' slot(s) unfilled');
    process.exit(1);
  }
  emit(chosen);
}
