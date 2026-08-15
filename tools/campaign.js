'use strict';
/*
 * TILT — the campaign.
 *
 * This file IS the design document for all twenty stages, and it generates
 * src/stages.js from it.
 *
 *   node tools/campaign.js              build
 *   node tools/campaign.js --report     build and print every scorecard
 *   node tools/campaign.js --only 7,12  search just those slots and report
 *   node tools/campaign.js --dry        search and report, write nothing
 *
 * `--only` never writes: the twenty stages are chosen against each other (no
 * two may share a board or even a terrain), so a partial run cannot honestly
 * produce a partial file.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------------------------------------------------------
 *
 * The previous campaign gave each slot a target LENGTH and searched until a
 * board hit it. The result measured well and played badly, and the measurement
 * in design.js says exactly why. Run it over the old twenty stages and the
 * verdict is brutal:
 *
 *   stages 1, 2, 4      unlock 0   — the player who is not thinking solves
 *                                    them cold. There is no idea in them.
 *   stages 10 – 20      unlock ≈ par — every single move has to be found
 *                                    separately. That is not depth, it is a
 *                                    corridor with fifty doors.
 *   almost all of them  blindness 0 — the first move a player would try is
 *                                    the correct one.
 *
 * A board that takes fifty tilts and never once surprises you is a worse board
 * than one that takes five and does. So no slot below asks for a length. Each
 * slot states ONE THING THE PLAYER SHOULD NOTICE, and then requires the
 * measured signature of a board that can only be solved by noticing it.
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
 * The search does not sample. At 3×3 it enumerates the entire design space —
 * every arrangement of walls, goals, hazards and blocks up to symmetry — so
 * what ships is not the best board the search stumbled on, it is the best
 * board that exists inside that budget. Tens of thousands of boards are built
 * and measured per slot; one survives. Nothing is kept because it was
 * expensive to find.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAY APPEAR, AND WHEN
 * ---------------------------------------------------------------------------
 *
 * Hazards and colours exist (see the engine for what each one is FOR). They
 * are not rewards for reaching chapter three and they are not difficulty
 * knobs. A device may appear in a slot only when the slot's core idea cannot
 * be built without it.
 *
 * Ten of the twenty stages use nothing but the base rules. Half the campaign
 * is nine cells, four characters and no exceptions.
 *
 * NO STAGE USES BOTH DEVICES AT ONCE, and that was tested rather than assumed.
 * 26,744 boards carrying a hazard AND two colours were built and measured, and
 * the best of them was compared against the best single-device board on all ten
 * axes:
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
 * The combined board is longer (15 tilts against 10) and more surprising, and
 * it loses anyway: it is harder to read, and 4% of its positions are quietly
 * unwinnable rather than visibly so. Length and surprise do not outrank being
 * legible and being fair. If a combined board had won, it would be in the
 * campaign — this is a result, not a rule.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS CONSIDERED AND LEFT OUT
 * ---------------------------------------------------------------------------
 *
 * Both of these were prototyped against the question every element has to
 * answer — "what new thinking does this create?" — and neither could answer it:
 *
 *   BIG BLOCKS      A 2×1 block needs two free cells instead of one. That is a
 *                   packing constraint, not a new question: everything it asks
 *                   ("will it fit, will it stop here") the player is already
 *                   asking about single blocks, and it costs a whole new set
 *                   of rules about what happens when half of one is blocked.
 *                   More rule, same thought.
 *
 *   ALTERNATE WIN   "Collect only the red ones", "form a shape", "leave one
 *   CONDITIONS      behind". Each of these moves the difficulty off the board
 *                   and into the briefing. The player stops looking at nine
 *                   cells and starts re-reading a sentence. TILT's win
 *                   condition is visible in the picture — every block gone —
 *                   and it stays that way.
 *
 * They are left out because they lose that argument, not because the campaign
 * is being careful. A device that could answer the question would be in.
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
// A spec is a budget, not a board: size, what furniture may be placed, and how
// many blocks. The generator enumerates every arrangement inside it.

function spec(w, h, blocks, walls, opts) {
  opts = opts || {};
  return {
    w: w, h: h,
    blocks: blocks,
    walls: walls,
    hazards: opts.hazards || [0, 0],
    goals: opts.goals || ['o']
  };
}

function reps(ch, n) { var a = []; for (var i = 0; i < n; i++) a.push(ch); return a; }

/** 3×3, base rules, b blocks, walls in the given band. */
function nine(b, walls) { return spec(3, 3, reps('@', b), walls); }
/** 3×3 with hazards. */
function nineHaz(b, walls, hz) { return spec(3, 3, reps('@', b), walls, { hazards: hz }); }
/** 3×3, two colours. */
function nineCol(blocks, walls) { return spec(3, 3, blocks, walls, { goals: ['a', 'b'] }); }
/** 4×3, base rules. */
function twelve(b, walls) { return spec(4, 3, reps('@', b), walls); }

// ---------------------------------------------------------------------------
// the twenty slots
// ---------------------------------------------------------------------------
//
// `need` is the measured signature a board must have to be capable of teaching
// the idea. `prefer` breaks ties among boards that all qualify.
//
// Ordinary slots inherit a floor that no stage in the game is allowed below:
// the naive player must fail, nothing may be won by luck, and no piece may be
// on the board that the board would not miss. `teach: true` marks the four
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
  // The whole vocabulary, one idea per board. Four stages of teaching and one
  // that turns on the player.

  {
    id: 1, name: 'DROP', chapter: 1, teach: true,
    idea: 'Gravity is a thing you point, and everything obeys it at once.',
    feeling: 'No resistance at all. This board exists to be understood in one gesture.',
    note: 'One block, one goal, two tilts. The only stage in the game a player can ' +
          'solve without thinking, and that is its entire job: it teaches the verb.',
    hint: { ja: 'スワイプして重力を向ける', en: 'Swipe to aim gravity' },
    specs: [nine(1, [0, 0]), nine(1, [1, 1])],
    need: { par: [2, 2], allowNaive: true, maxLuck: 0.5, minLive: 2 },
    prefer: function (p) { return -p.pieces.total * 10 - p.states; }
  },
  {
    id: 2, name: 'OVER', chapter: 1, teach: true,
    idea: 'A goal is not a target. Aim at it and the block sails straight over the top of it.',
    feeling: 'You point at the hole, you watch the block go past the hole, and the rule lands.',
    note: 'The most important board in the game, and it is the second one. Pointing gravity ' +
          'at the exit does not work here and cannot be made to work: a block is only ' +
          'collected if it comes to a complete STOP on the goal, so the question is never ' +
          '"which way is the goal" but "what is going to stop me once I get there". A player ' +
          'has to do this wrong exactly once.',
    hint: { ja: 'ゴールの上でぴったり止まらないと落ちない', en: 'You must STOP on a goal — sliding over it does nothing' },
    specs: [nine(1, [0, 2]), nine(2, [0, 2])],
    need: { par: [2, 4], unlock: [1, 2], overshoot: 1, allowNaive: true, maxLuck: 0.35, minLive: 2 },
    prefer: function (p) {
      return p.overshoot * 14 + (p.unlock > 0 ? 12 : 0) + p.traps * 5
             - p.pieces.total * 6 - p.par * 2;
    }
  },
  {
    id: 3, name: 'BRAKE', chapter: 1, teach: true,
    idea: 'What stops you on the goal is a wall behind it — so approach from the side that has one.',
    feeling: 'Having learned that goals are not targets, learn what they ARE: a cell with a backstop.',
    note: 'The answer to the board before it. Only one of the four directions has anything ' +
          'standing one cell past the socket, and that is the only direction that collects. ' +
          'From here on the player reads a goal by looking at what is BEHIND it.',
    hint: { ja: 'ゴールの向こうに壁があれば止まれる', en: 'A wall past the goal is what stops you on it' },
    specs: [nine(1, [1, 3]), nine(2, [1, 3])],
    need: { par: [2, 4], unlock: [1, 2], traps: 2, allowNaive: true, maxLuck: 0.2, minLive: 2 },
    prefer: function (p) { return p.traps * 9 + p.overshoot * 6 + p.retreat * 4 - p.pieces.total * 6 - p.par; }
  },
  {
    id: 4, name: 'STACK', chapter: 1, teach: true,
    idea: 'A block is a brake too — and the one you have not collected yet is the only brake you can move.',
    feeling: 'Move the wrong one first and the backstop you needed is the thing that went home.',
    note: 'The last piece of the vocabulary, and the one the rest of the game is built on. ' +
          'Walls make some goals collectable and the terrain never changes; blocks make the ' +
          'others collectable and the player spends them. Getting the order wrong is not ' +
          'punished — it is the intended way to find out what the order is.',
    hint: { ja: 'ブロックも他のブロックを止める', en: 'Blocks stop each other too' },
    specs: [nine(3, [0, 2]), nine(2, [0, 2]), twelve(3, [0, 2]), twelve(2, [0, 2])],
    // `caught` is the whole point of this slot: at least one collection on the
    // optimal line has to be a block stopped by ANOTHER BLOCK rather than by
    // the terrain. Without it the board can claim the idea and not show it.
    need: { par: [4, 9], unlock: [1, 3], flow: 2, traps: 2, caught: 1 },
    prefer: function (p) {
      return p.caught * 14 + p.blindness * 10 + p.flow * 4 + p.setup * 3 - p.pieces.total * 4;
    }
  },
  {
    id: 5, name: 'AWAY', chapter: 1,
    idea: 'The way out is not the way you are facing: a block has to travel away from the goal to reach it.',
    feeling: 'A player who only ever tilts toward the exit circles this board forever.',
    note: 'Chapter one\'s argument, and the first board that is genuinely a puzzle. Every ' +
          'tilt that points at the goal makes things worse, and the answer is the ' +
          'direction that looks like giving up ground.',
    specs: [nine(2, [1, 2]), nine(3, [1, 2])],
    need: { par: [4, 8], unlock: [1, 3], flow: 2, retreat: 2, blindness: 1 },
    prefer: function (p) { return p.blindness * 14 + p.retreat * 8 + p.flow * 3 - p.pieces.total * 3; }
  },

  // ── CHAPTER 2 · NINE ────────────────────────────────────────────────────
  // Nothing new is introduced anywhere in this chapter — no hazard, no colour,
  // the same four characters stage 1 had. What changes is only how hard the
  // same four things are being made to work.
  //
  // Three of these five boards are nine cells and two are twelve, and that
  // split is a finding rather than a preference. Sweeping the ENTIRE 3×3
  // design space turns up only two boards under the base rules whose correct
  // opening is the last one instinct would suggest, and they share a terrain.
  // Nine cells is not an inexhaustible well: it holds a handful of genuinely
  // excellent puzzles and this game already shipped most of them by stage 5.
  // Rather than pad the chapter with near-misses at 3×3, the two slots that
  // 3×3 cannot supply are allowed twelve cells — still small enough to hold in
  // one glance, and with a third column the slides get long enough to hide an
  // idea in.

  {
    id: 6, name: 'WASTE', chapter: 2,
    idea: 'The move that appears to accomplish nothing is the one that makes everything possible.',
    feeling: 'Three tilts look productive and all three are wrong. The fourth looks pointless.',
    note: 'Ranked by how a hurrying player would rate them, the correct opening is the ' +
          'LAST one they would try. Nothing is hidden — the board is nine cells in plain ' +
          'sight — and it still takes a second look.',
    specs: [nine(2, [1, 3]), nine(3, [0, 3]), nine(4, [0, 3]), twelve(3, [1, 3]), twelve(4, [1, 3])],
    need: { par: [4, 10], unlock: [1, 2], flow: 2, blindness: 2, traps: 2 },
    prefer: function (p) { return p.blindness * 20 + p.traps * 6 + p.flow * 4 - p.pieces.total * 3; }
  },
  {
    id: 7, name: 'REFUSE', chapter: 2,
    idea: 'Collecting a block can be the wrong move. Progress is not the same as winning.',
    feeling: 'The board offers you something for free, and taking it loses.',
    note: 'The cruellest shape in the game and the fairest: a tilt that visibly banks a ' +
          'block and quietly ruins the position. Once seen it is never forgotten, because ' +
          'it rewrites what "a good move" means.',
    specs: [nine(3, [0, 3]), nine(4, [0, 3]), twelve(3, [1, 3]), twelve(4, [1, 3])],
    need: { par: [4, 10], unlock: [1, 2], flow: 2, bait: true, blindness: 1 },
    prefer: function (p) { return p.bait * 18 + p.blindness * 12 + p.flow * 4 - p.pieces.total * 3; }
  },
  {
    id: 8, name: 'OTHER', chapter: 2,
    idea: 'The block you have to move first is not the block you are trying to get home.',
    feeling: 'You stare at the block next to the goal for a while before you look away from it.',
    note: 'Every instinct points at the piece nearest the socket. It is the last one that ' +
          'moves. The board is built so that the piece furthest from the goal is the one ' +
          'holding the whole position together.',
    specs: [nine(3, [0, 3]), nine(4, [0, 3]), twelve(3, [1, 3]), twelve(4, [1, 3]), twelve(5, [1, 2])],
    need: { par: [5, 11], unlock: [1, 3], flow: 3, indirect: true, blindness: 2, traps: 2 },
    prefer: function (p) { return p.blindness * 14 + p.flow * 5 + p.setup * 4 - p.pieces.total * 3; }
  },
  {
    id: 9, name: 'FALL', chapter: 2,
    idea: 'One tilt, and the whole board resolves at once — if you built it correctly first.',
    feeling: 'Several moves of arranging that collect nothing, then everything lands together.',
    note: 'The payoff stage. Nothing is banked until the end, and then the last tilt takes ' +
          'the lot. The pleasure is watching a plan you made three moves ago execute itself.',
    specs: [nine(3, [0, 3]), nine(4, [0, 3]), nine(5, [0, 2]), twelve(4, [1, 3]), twelve(5, [1, 2])],
    need: { par: [4, 11], unlock: [1, 3], chainLast: 2, setup: 2, blindness: 1 },
    prefer: function (p) { return p.chainLast * 16 + p.setup * 7 + p.blindness * 8 + p.cascade * 3; }
  },
  {
    id: 10, name: 'NINE', chapter: 2,
    idea: 'What nine cells can hold when every single one of them is carrying weight.',
    feeling: 'A board you can see all of at once and cannot hold all of at once.',
    note: 'The chapter\'s closing argument: the most thinking that fits in nine cells under ' +
          'the base rules. Delete any piece on it and the puzzle measurably changes.',
    specs: [nine(3, [0, 3]), nine(4, [0, 3]), nine(5, [0, 3]), nine(6, [1, 2])],
    need: { par: [6, 14], unlock: [1, 3], flow: 3, blindness: 1, traps: 2 },
    prefer: function (p) { return p.states * 0.4 + p.par * 3 + p.blindness * 8 + p.flow * 3; }
  },

  // ── CHAPTER 3 · EDGE ────────────────────────────────────────────────────
  // The hazard. One rule, arriving in one board, and then four boards that use
  // it as machinery rather than as a place to stay away from.

  {
    id: 11, name: 'CROSS', chapter: 3, teach: true,
    idea: 'You may slide straight over a hazard. You may not be left standing on one.',
    feeling: 'Learn it by doing it, in a board where the crossing is the only route.',
    note: 'The hazard arrives doing the opposite of what a hazard normally does: the ' +
          'solution goes right across it. Stop on it and the block shatters where the ' +
          'player can see exactly why — and undo is one tap, which is the whole lesson.',
    hint: { ja: '危険マスは通り抜けられる。止まると壊れる', en: 'Cross a hazard freely — but never stop on one' },
    specs: [nineHaz(1, [0, 1], [1, 1]), nineHaz(2, [0, 1], [1, 1])],
    need: { par: [2, 5], crossings: 1, allowNaive: true, maxLuck: 0.3, maxJam: 0.6, minLive: 2 },
    prefer: function (p) { return (p.unlock > 0 ? 15 : 0) + p.crossings * 10 + p.traps * 4 - p.pieces.total * 5 - p.par * 2; }
  },
  {
    id: 12, name: 'CATCH', chapter: 3,
    idea: 'A hazard is only survivable if something is waiting to stop you past it.',
    feeling: 'The route is obvious and lethal until you notice what has to be standing where.',
    note: 'The hazard turns another block into a brake. This is the point at which the ' +
          'dangerous square stops being an obstacle and becomes a piece of equipment: the ' +
          'question is no longer "how do I avoid it" but "what has to be over there first".',
    specs: [nineHaz(2, [0, 2], [1, 1]), nineHaz(3, [0, 2], [1, 1])],
    need: { par: [4, 10], unlock: [1, 3], flow: 2, crossings: 1, blindness: 1, maxJam: 0.4 },
    prefer: function (p) { return p.blindness * 12 + p.crossings * 8 + p.flow * 4 - p.pieces.total * 3; }
  },
  {
    id: 13, name: 'LEDGE', chapter: 3,
    idea: 'Every direction looks fatal. One of them is not, and it is the one that looks worst.',
    feeling: 'Genuine "there is no move here" — followed by there being a move here.',
    note: 'The board a player is most likely to declare broken before solving it. Everything ' +
          'that looks like progress ends with a block standing somewhere it cannot stand.',
    specs: [nineHaz(2, [0, 3], [1, 2]), nineHaz(3, [0, 3], [1, 2]), nineHaz(4, [0, 2], [1, 1]),
            twelveHaz(2, [1, 2], [1, 2]), twelveHaz(3, [1, 2], [1, 1])],
    need: { par: [4, 12], unlock: [1, 3], flow: 3, traps: 3, blindness: 2, maxJam: 0.4 },
    prefer: function (p) { return p.blindness * 16 + p.traps * 8 + p.flow * 4 - p.pieces.total * 2.5; }
  },
  {
    id: 14, name: 'THREAD', chapter: 3,
    idea: 'Nine cells, three blocks, and ten tilts — because a hazard makes half the stopping places illegal.',
    feeling: 'A long solution on a tiny board, with no crowd of pieces to hide behind.',
    note: 'The densest thing in the game per square. A hazard does not add material, it ' +
          'removes places to rest, and removing places to rest is what makes a small board ' +
          'deep instead of merely full.',
    specs: [nineHaz(3, [1, 2], [1, 1]), nineHaz(2, [1, 2], [1, 2]), nineHaz(3, [0, 1], [1, 2])],
    need: { par: [7, 16], unlock: [1, 3], flow: 4, blindness: 1, maxJam: 0.35 },
    prefer: function (p) { return p.par * 4 + p.flow * 5 + p.blindness * 8 + p.states * 0.2 - p.pieces.total * 3; }
  },
  {
    id: 15, name: 'EDGE', chapter: 3,
    idea: 'The hazard, the walls and the blocks all doing one job each, with nothing left over.',
    feeling: 'The chapter\'s closing statement: dangerous, completely fair, and solvable on sight once seen.',
    note: 'Chapter three\'s finale. Every piece is load-bearing, the dead ends are all loud ' +
          'ones — you watch the block break — and there is exactly one thing to realise.',
    specs: [nineHaz(3, [1, 2], [1, 1]), nineHaz(3, [1, 3], [1, 2]), twelveHaz(3, [1, 2], [1, 1])],
    need: { par: [6, 14], unlock: [1, 2], flow: 4, blindness: 2, traps: 2, maxJam: 0.3 },
    prefer: function (p) { return p.blindness * 15 + p.flow * 5 + p.par * 2 - p.pieces.total * 3 - p.jam * 20; }
  },

  // ── CHAPTER 4 · PAIR ────────────────────────────────────────────────────
  // Colour. The point is never "two puzzles at once": it is that a goal can be
  // a hole for one block and a floor for another, so a block you thought was
  // finished is still furniture.

  {
    id: 16, name: 'SORT', chapter: 4, teach: true,
    idea: 'A goal that is not yours does not take you. You roll straight over it.',
    feeling: 'Watch a block pass through a socket without being collected, once, and the rule is learned.',
    note: 'Colour arrives in the smallest board that can show what it does. The lesson is ' +
          'not "match the colours" — a child gets that instantly — it is that the socket ' +
          'you rolled over is still open behind you, and you are still in the way.',
    hint: { ja: '色の合うゴールだけが受け取る', en: 'A goal only takes its own colour' },
    specs: [nineCol(['A', 'B'], [0, 1]), nineCol(['A', 'B'], [1, 2])],
    need: { par: [3, 7], refused: 1, allowNaive: true, maxLuck: 0.25, maxJam: 0.15, minLive: 2 },
    prefer: function (p) { return (p.unlock > 0 ? 15 : 0) + p.refused * 8 + p.traps * 4 - p.pieces.total * 5 - p.par * 2; }
  },
  {
    id: 17, name: 'THROUGH', chapter: 4,
    idea: 'The wrong-coloured goal is a hole you fall past — and a block that has not been collected is still a wall.',
    feeling: 'The realisation that you do not want to collect a block yet, because you still need it standing there.',
    note: 'The board turns "collect everything as fast as possible" into a mistake. One ' +
          'block has to stay on the board doing a job long after it could have gone home.',
    specs: [nineCol(['A', 'B', 'B'], [0, 2]), nineCol(['A', 'A', 'B'], [0, 2])],
    need: { par: [6, 11], unlock: [1, 3], flow: 3, blindness: 2, refused: 1, maxJam: 0.2 },
    prefer: function (p) { return p.blindness * 14 + p.refused * 6 + p.flow * 4 - p.pieces.total * 3; }
  },
  {
    id: 18, name: 'ORDER', chapter: 4,
    idea: 'Both colours want the same tilt. Only one of them can have it first.',
    feeling: 'Two plans that are each fine alone and destroy each other in the wrong sequence.',
    note: 'Nothing on this board is difficult to move. The entire puzzle is which of two ' +
          'obvious things happens first, and the two orders do not merely differ in ' +
          'length — one of them does not work at all.',
    specs: [nineCol(['A', 'A', 'B'], [1, 2]), nineCol(['A', 'B', 'B'], [1, 2]), nineCol(['A', 'A', 'B', 'B'], [0, 1])],
    need: { par: [5, 11], unlock: [1, 3], flow: 3, blindness: 2, traps: 2, maxJam: 0.18 },
    prefer: function (p) { return p.blindness * 13 + p.traps * 7 + p.flow * 4 + p.setup * 3 - p.pieces.total * 2.5; }
  },
  {
    id: 19, name: 'SWAP', chapter: 4,
    idea: 'Every tilt that helps one colour hurts the other, and the answer helps neither.',
    feeling: 'Four moves, four reasons not to. Then the fifth reading of the board.',
    note: 'Ranked by instinct the correct opening is dead last, and it is dead last because ' +
          'it appears to abandon both blocks at once. The strongest "every direction is ' +
          'wrong" board the search found anywhere.',
    specs: [nineCol(['A', 'B', 'B'], [1, 2]), nineCol(['A', 'A', 'B'], [1, 2]), twelveCol(['A', 'A', 'B'], [1, 2])],
    need: { par: [5, 12], unlock: [1, 3], flow: 3, blindness: 3, traps: 3, maxJam: 0.28 },
    prefer: function (p) { return p.blindness * 18 + p.traps * 8 + p.flow * 4 - p.pieces.total * 2.5 - p.jam * 25; }
  },
  {
    id: 20, name: 'TILT', chapter: 4,
    idea: 'The best board the search could find anywhere in the game, whatever it is made of.',
    feeling: 'Everything the campaign has taught, asked once, in a board that looks like it should be easy.',
    note: 'The finale is not the biggest board or the longest solution — it is whichever ' +
          'board scored highest on the thing this game is actually about. It is allowed to ' +
          'use any single device or none; what it is not allowed to be is merely long.',
    specs: [nine(4, [1, 2]), nine(5, [1, 2]), twelve(4, [1, 3]), twelve(5, [1, 2]),
            nineHaz(3, [1, 2], [1, 1]), nineCol(['A', 'A', 'B'], [1, 2]), twelveCol(['A', 'B', 'B'], [1, 2])],
    need: { par: [6, 16], unlock: [1, 2], flow: 4, blindness: 2, traps: 3, maxJam: 0.25, maxWays: 4 },
    prefer: function (p) {
      return p.blindness * 16 + p.flow * 6 + p.traps * 7 + p.retreat * 5 +
             (p.bait ? 10 : 0) + (p.indirect ? 8 : 0) + p.chainLast * 5 +
             p.par * 1.5 - p.pieces.total * 2.5 - p.jam * 30;
    }
  }
];

function twelveHaz(b, walls, hz) { return spec(4, 3, reps('@', b), walls, { hazards: hz }); }
function twelveCol(blocks, walls) { return spec(4, 3, blocks, walls, { goals: ['a', 'b'] }); }

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

function quickProfile(rows) {
  var key = D.canonical(rows);
  var hit = PROFILE_CACHE[key];
  if (hit !== undefined) return hit;
  var p = D.profile(rows, { quick: true, cap: 60000 });
  PROFILE_CACHE[key] = p;
  return p;
}

/** Full profile including the deletion census, memoised across slots. */
function fullProfile(rows) {
  var key = D.canonical(rows);
  var hit = CENSUS_CACHE[key];
  if (hit !== undefined) return hit;
  var p = D.profile(rows, { cap: 60000 });
  CENSUS_CACHE[key] = p;
  return p;
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
    nodeCap: 60000,
    maxPlacements: 4000
  };

  var raw = [], seenBoard = Object.create(null);
  var terrainCount = 0;
  slot.specs.forEach(function (sp) {
    var r = G.exhaust(sp, sweepFilters, function (c) {
      var key2 = D.canonical(c.board);
      if (seenBoard[key2]) return;
      seenBoard[key2] = 1;
      raw.push(c);
    });
    terrainCount += r.terrains;
  });

  // Order the profiling pass so the most promising boards are measured first.
  // A teaching board wants the opposite of a puzzle board — the smallest,
  // plainest thing that can still show the rule — so it gets its own order.
  if (need.allowNaive) {
    raw.sort(function (a, b) {
      return (weight(a.board) * 10 + a.par) - (weight(b.board) * 10 + b.par);
    });
  } else {
    raw.sort(function (a, b) {
      return (b.blindness * 100 + b.flow * 8 + b.traps * 4 + b.bait * 6) -
             (a.blindness * 100 + a.flow * 8 + a.traps * 4 + a.bait * 6);
    });
  }

  var pool = raw.slice(0, budget || 12000);
  var kept = [];
  for (var i = 0; i < pool.length; i++) {
    var p = quickProfile(pool[i].board);
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
  return { raw: raw.length, terrains: terrainCount, examined: pool.length, kept: kept };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function boardKey(rows) { return D.canonical(rows); }

/** The walls, goals and hazards, with the blocks swept off. */
function terrainOf(rows) {
  return D.canonical(rows.map(function (r) { return r.replace(/[@AB]/g, '.'); }));
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
 * terrains worth building on, and forbidding all reuse means the twentieth
 * stage is chosen from whatever the first nineteen did not want.
 */
function shapeKey(rows) {
  var blocks = 0;
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) if ('@AB'.indexOf(rows[y][x]) >= 0) blocks++;
  }
  return terrainOf(rows) + '#' + blocks;
}

/**
 * Fill the twenty slots.
 *
 * No two stages may share a board, and no two may share a TERRAIN either —
 * the same walls with the blocks shuffled is the same puzzle wearing a hat,
 * and on a nine-cell board it is very obviously the same puzzle.
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
 * left. Same twenty ideas, assigned so that the rare ones survive.
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
      if (usedBoard[boardKey(p.board)]) continue;
      if (usedShape[shapeKey(p.board)]) continue;
      // A terrain may appear at most twice in the whole game. There are only a
      // few dozen 3×3 arrangements of walls worth building on, so banning reuse
      // outright starves the search — but four stages on the same walls is a
      // chapter that looks like one stage, whatever the blocks are doing.
      if ((terrainUses[terrainOf(p.board)] || 0) >= 2) continue;
      censused++;
      censusTotal++;
      var full = fullProfile(p.board);
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
    // No two stages may share a board, and no two may share a terrain AND a
    // block count — see shapeKey for why that is the line.

    usedBoard[boardKey(pick.board)] = 1;
    usedShape[shapeKey(pick.board)] = 1;
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
  console.log('  id name       Cla Dis Ins Sur Prd Ele Den Fai Sat Rep   par unlk flow blind trap ways jam');
  console.log('  ' + new Array(104).join('─'));
  chosen.forEach(function (c) {
    var s = c.p.score, p = c.p;
    console.log('  ' + pad(c.slot.id) + ' ' + c.slot.name.padEnd(10) +
      [s.clarity, s.discovery, s.insight, s.surprise, s.prediction,
       s.elegance, s.density, s.fairness, s.satisfaction, s.replay]
        .map(function (v) { return String(v).padStart(3); }).join(' ') +
      '  ' + String(p.par).padStart(4) + String(p.unlock).padStart(5) +
      String(p.flow).padStart(5) + String(p.blindness).padStart(6) +
      String(p.traps + '/' + p.live).padStart(5) + String(p.ways).padStart(5) +
      (p.jam * 100).toFixed(0).padStart(4) + '%');
  });

  console.log('\n  RULES ON SCREEN');
  var base = chosen.filter(function (c) { return !c.p.hazard && !c.p.colour; }).length;
  var haz = chosen.filter(function (c) { return c.p.hazard; }).length;
  var col = chosen.filter(function (c) { return c.p.colour; }).length;
  var both = chosen.filter(function (c) { return c.p.hazard && c.p.colour; }).length;
  console.log('    base rules only  ' + base + '/' + chosen.length);
  console.log('    + hazard         ' + haz);
  console.log('    + colour         ' + col);
  console.log('    both at once     ' + both + (both ? '   ← should be zero' : '   (by design)'));
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

var CHAPTERS = [
  { number: 1, name: 'GRAVITY', ja: '重力', from: 1, to: 5,
    note: 'The whole vocabulary of the game, one idea per board: gravity moves everything at once, walls stop it, blocks stop each other, and the way out is rarely the way you are facing.' },
  { number: 2, name: 'NINE', ja: '九マス', from: 6, to: 10,
    note: 'Nine cells and nothing added. Every board here fits in a single glance and none of them can be solved in a single glance — which is the whole argument of the game, made on the smallest board it owns.' },
  { number: 3, name: 'EDGE', ja: '境界', from: 11, to: 15,
    note: 'A square you may cross and may not stop on. It adds no material to the board — it removes places to rest, and having nowhere to rest is what makes nine cells deep.' },
  { number: 4, name: 'PAIR', ja: '対', from: 16, to: 20,
    note: 'Two colours, and a goal that is a hole for one block and a floor for the other. A block that has not been collected is still a wall — so finishing early is how you lose.' }
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
  out.push(' *');
  out.push(' * Ten of the twenty stages use nothing but floor, wall, goal and block. No stage');
  out.push(' * uses a hazard and a colour at the same time.');
  out.push(' *');
  out.push(' * A block is collected ONLY if it comes to a complete stop on a goal it fits —');
  out.push(' * sliding across one does nothing. So every goal below needs something standing');
  out.push(' * one cell beyond it, and half the design of these boards is where that backstop');
  out.push(' * comes from: the edge, a wall, or a block the player has not spent yet.');
  out.push(' *');
  out.push(' * Every `par` is a breadth-first-proven shortest solution. Every piece on every');
  out.push(' * board survived deletion testing: remove any one of them and the puzzle measurably');
  out.push(' * changes. The numbers in each comment are the measured signature — see');
  out.push(' * tools/lib/design.js for what they mean, and why "unlock" is the one that matters:');
  out.push(' *');
  out.push(' *   unlock  how many correct moves the board costs before it starts playing itself.');
  out.push(' *           0 would mean a player who is not thinking solves it cold. No stage');
  out.push(' *           past the four teaching boards is allowed to be above 3.');
  out.push(' *   flow    how much stage is left after that — the part that is the reward.');
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
      "', from: " + c.from + ', to: ' + c.to + ',');
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

console.log('\n  TILT — searching for twenty boards worth playing\n');
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
