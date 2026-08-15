'use strict';
/*
 * TILT — stage data.  GENERATED FILE — do not edit by hand.
 *
 * Source of truth: tools/campaign.js  (rebuild with `npm run campaign`)
 *
 * The picture:
 *
 *     '.'  floor          '#'  wall            'x'  hazard
 *     'o'  goal, any      '@'  block, any
 *     'a'  goal A         'A'  block A         (colour stages only)
 *     'b'  goal B         'B'  block B
 *
 * Ten of the twenty stages use nothing but floor, wall, goal and block. No stage
 * uses a hazard and a colour at the same time.
 *
 * Every `par` is a breadth-first-proven shortest solution. Every piece on every
 * board survived deletion testing: remove any one of them and the puzzle measurably
 * changes. The numbers in each comment are the measured signature — see
 * tools/lib/design.js for what they mean, and why "unlock" is the one that matters:
 *
 *   unlock  how many correct moves the board costs before it starts playing itself.
 *           0 would mean a player who is not thinking solves it cold. No stage
 *           past the four teaching boards is allowed to be above 3.
 *   flow    how much stage is left after that — the part that is the reward.
 *   blind   where the correct opening sits in the order a hurrying player would
 *           try the four tilts. 3 means it is the very last one they would pick.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CHAPTERS = [
    { number: 1, name: 'GRAVITY', ja: '重力', from: 1, to: 5,
      note: 'The whole vocabulary of the game, one idea per board: gravity moves ' +
            'everything at once, walls stop it, blocks stop each other, and the way out ' +
            'is rarely the way you are facing.' },
    { number: 2, name: 'NINE', ja: '九マス', from: 6, to: 10,
      note: 'Nine cells and nothing added. Every board here fits in a single glance and ' +
            'none of them can be solved in a single glance — which is the whole argument ' +
            'of the game, made on the smallest board it owns.' },
    { number: 3, name: 'EDGE', ja: '境界', from: 11, to: 15,
      note: 'A square you may cross and may not stop on. It adds no material to the board ' +
            '— it removes places to rest, and having nowhere to rest is what makes nine ' +
            'cells deep.' },
    { number: 4, name: 'PAIR', ja: '対', from: 16, to: 20,
      note: 'Two colours, and a goal that is a hole for one block and a floor for the ' +
            'other. A block that has not been collected is still a wall — so finishing ' +
            'early is how you lose.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · GRAVITY · 重力  (stages 1–5) ──────────────────────────────────────
    // The whole vocabulary of the game, one idea per board: gravity moves everything at once, walls stop it, blocks stop each other, and the way out is rarely the way you are facing.
    {
      id: 1, name: 'DROP', par: 2,
      // par 2 · unlock 0/flow 2 · blind 0 · traps 0/2 · retreat 0 · ways 2 · states 4 · jam 0% · loss 0% · luck 12.5%
      // scores  cla 10 · dis 0 · ins 0 · sur 0 · pre 1.8 · ele 6.8 · den 0.1 · fai 2.5 · sat 3.4 · rep 3.5
      idea: 'Gravity is a thing you point, and everything obeys it at once.',
      note: 'One block, one goal, two tilts. The only stage in the game a player can ' +
            'solve without thinking, and that is its entire job: it teaches the verb.',
      hint: { ja: 'スワイプして重力を向ける', en: 'Swipe to aim gravity' },
      board: ['o..',
              '...',
              '..@']
    },
    {
      id: 2, name: 'PAIR', par: 2,
      // par 2 · unlock 0/flow 2 · blind 0 · traps 2/3 · retreat 0 · ways 1 · states 11 · jam 0% · loss 0% · luck 6.3%
      // scores  cla 10 · dis 2.2 · ins 0 · sur 0 · pre 3.3 · ele 2 · den 1 · fai 6.3 · sat 6.1 · rep 3.5
      idea: 'Every block is the same block, and one goal will take them all.',
      note: 'Two blocks and one socket. The finish collects both at once, which is the ' +
            'first time the board does more in one tilt than the player asked it to.',
      hint: { ja: 'ブロックはすべて同じ。ゴールはどれでも受け取る', en: 'Every block is the same' },
      board: ['o..',
              '.@@',
              '...']
    },
    {
      id: 3, name: 'SHUT', par: 3,
      // par 3 · unlock 1/flow 2 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 10 · jam 0% · loss 0% · luck 1.6%
      // scores  cla 10 · dis 8.1 · ins 8.3 · sur 5.2 · pre 1.3 · ele 3.4 · den 1.2 · fai 9.1 · sat 2.9 · rep 4.9
      idea: 'A wall stops a block dead — so the straight line is not always open.',
      note: 'The goal sits two cells away in a straight line, and that line has a wall in ' +
            'it. Nothing here is hidden; the player simply has to accept that pointing at ' +
            'the exit is not the same as reaching it.',
      hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
      board: ['##.',
              '.o@',
              '.@.']
    },
    {
      id: 4, name: 'STACK', par: 5,
      // par 5 · unlock 2/flow 3 · blind 0 · traps 2/4 · retreat 1 · ways 2 · states 19 · jam 0% · loss 0% · luck 0.2%
      // scores  cla 10 · dis 7.5 · ins 8.8 · sur 2.2 · pre 1.6 · ele 5.9 · den 3.1 · fai 9.9 · sat 3.3 · rep 4.6
      idea: 'A block is a wall for another block — so which one moves first is a ' +
            'question.',
      note: 'The first board where the obstacles are the pieces themselves. Getting the ' +
            'order wrong is not punished — it is the intended way to learn what the order ' +
            'is.',
      hint: { ja: 'ブロックは他のブロックも止める', en: 'Blocks stop each other too' },
      board: ['##@',
              '@o.',
              '.@.']
    },
    {
      id: 5, name: 'AWAY', par: 4,
      // par 4 · unlock 2/flow 2 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 19 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 10 · dis 8.5 · ins 8.3 · sur 5.3 · pre 4.5 · ele 6.8 · den 2.8 · fai 9.8 · sat 6.1 · rep 6.2
      idea: 'The way out is not the way you are facing: a block has to travel away from ' +
            'the goal to reach it.',
      note: 'Chapter one\'s argument, and the first board that is genuinely a puzzle. ' +
            'Every tilt that points at the goal makes things worse, and the answer is the ' +
            'direction that looks like giving up ground.',
      board: ['o#@',
              '...',
              '.@.']
    },

    // ── CHAPTER 2 · NINE · 九マス  (stages 6–10) ─────────────────────────────────────────
    // Nine cells and nothing added. Every board here fits in a single glance and none of them can be solved in a single glance — which is the whole argument of the game, made on the smallest board it owns.
    {
      id: 6, name: 'WASTE', par: 7,
      // par 7 · unlock 1/flow 6 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 33 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9 · dis 9 · ins 10 · sur 9.7 · pre 4 · ele 4.2 · den 4 · fai 10 · sat 5.1 · rep 8.3
      idea: 'The move that appears to accomplish nothing is the one that makes everything ' +
            'possible.',
      note: 'Ranked by how a hurrying player would rate them, the correct opening is the ' +
            'LAST one they would try. Nothing is hidden — the board is nine cells in ' +
            'plain sight — and it still takes a second look.',
      board: ['@@.#',
              '#o..',
              '..@@']
    },
    {
      id: 7, name: 'REFUSE', par: 7,
      // par 7 · unlock 2/flow 5 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 38 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9.5 · dis 9.2 · ins 9.6 · sur 10 · pre 6.1 · ele 5.7 · den 4.5 · fai 10 · sat 4.2 · rep 8.3
      idea: 'Collecting a block can be the wrong move. Progress is not the same as ' +
            'winning.',
      note: 'The cruellest shape in the game and the fairest: a tilt that visibly banks a ' +
            'block and quietly ruins the position. Once seen it is never forgotten, ' +
            'because it rewrites what "a good move" means.',
      board: ['@o#@',
              '.@..',
              '.#..']
    },
    {
      id: 8, name: 'OTHER', par: 11,
      // par 11 · unlock 2/flow 9 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 59 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 8.5 · dis 10 · ins 10 · sur 8.2 · pre 4.2 · ele 8.8 · den 7.8 · fai 10 · sat 5.5 · rep 9.7
      idea: 'The block you have to move first is not the block you are trying to get ' +
            'home.',
      note: 'Every instinct points at the piece nearest the socket. It is the last one ' +
            'that moves. The board is built so that the piece furthest from the goal is ' +
            'the one holding the whole position together.',
      board: ['o.#@',
              '#@..',
              '@.@#']
    },
    {
      id: 9, name: 'FALL', par: 6,
      // par 6 · unlock 3/flow 3 · blind 1 · traps 2/3 · retreat 1 · ways 1 · states 73 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9 · dis 9 · ins 6.8 · sur 5.2 · pre 5.9 · ele 5.1 · den 7.9 · fai 10 · sat 6.6 · rep 5.9
      idea: 'One tilt, and the whole board resolves at once — if you built it correctly ' +
            'first.',
      note: 'The payoff stage. Nothing is banked until the end, and then the last tilt ' +
            'takes the lot. The pleasure is watching a plan you made three moves ago ' +
            'execute itself.',
      board: ['o#..',
              '@@#@',
              '...@']
    },
    {
      id: 10, name: 'NINE', par: 7,
      // par 7 · unlock 3/flow 4 · blind 1 · traps 2/3 · retreat 1 · ways 1 · states 45 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9 · dis 8.4 · ins 7.2 · sur 5.2 · pre 5.5 · ele 3.8 · den 7.5 · fai 10 · sat 7 · rep 6.3
      idea: 'What nine cells can hold when every single one of them is carrying weight.',
      note: 'The chapter\'s closing argument: the most thinking that fits in nine cells ' +
            'under the base rules. Delete any piece on it and the puzzle measurably ' +
            'changes.',
      board: ['o#@',
              '@@@',
              '.@@']
    },

    // ── CHAPTER 3 · EDGE · 境界  (stages 11–15) ─────────────────────────────────────────
    // A square you may cross and may not stop on. It adds no material to the board — it removes places to rest, and having nowhere to rest is what makes nine cells deep.
    {
      id: 11, name: 'CROSS', par: 4,
      // par 4 · unlock 2/flow 2 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 11 · jam 10% · loss 20% · luck 0.4%
      // scores  cla 7.8 · dis 8.2 · ins 8.3 · sur 6.4 · pre 3.5 · ele 4.5 · den 1.7 · fai 8.4 · sat 2.9 · rep 5.2
      idea: 'You may slide straight over a hazard. You may not be left standing on one.',
      note: 'The hazard arrives doing the opposite of what a hazard normally does: the ' +
            'solution goes right across it. Stop on it and the block shatters where the ' +
            'player can see exactly why — and undo is one tap, which is the whole lesson.',
      hint: { ja: '危険マスは通り抜けられる。止まると壊れる', en: 'Cross a hazard freely — but never stop on one' },
      board: ['#o.',
              '.@x',
              '@..']
    },
    {
      id: 12, name: 'CATCH', par: 10,
      // par 10 · unlock 2/flow 8 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 23 · jam 0% · loss 18% · luck 0.0%
      // scores  cla 7.3 · dis 8.6 · ins 10 · sur 3.9 · pre 3.8 · ele 9.1 · den 5.3 · fai 10 · sat 5.5 · rep 7.3
      idea: 'A hazard is only survivable if something is waiting to stop you past it.',
      note: 'The hazard turns another block into a brake. This is the point at which the ' +
            'dangerous square stops being an obstacle and becomes a piece of equipment: ' +
            'the question is no longer "how do I avoid it" but "what has to be over there ' +
            'first".',
      board: ['#o.',
              '@x@',
              '.#@']
    },
    {
      id: 13, name: 'LEDGE', par: 7,
      // par 7 · unlock 2/flow 5 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 21 · jam 0% · loss 10% · luck 0.0%
      // scores  cla 7.3 · dis 8.6 · ins 9.6 · sur 6 · pre 4.9 · ele 7.7 · den 2.7 · fai 10 · sat 4.2 · rep 8.3
      idea: 'Every direction looks fatal. One of them is not, and it is the one that ' +
            'looks worst.',
      note: 'The board a player is most likely to declare broken before solving it. ' +
            'Everything that looks like progress ends with a block standing somewhere it ' +
            'cannot stand.',
      board: ['#@..',
              'ox..',
              '..@@']
    },
    {
      id: 14, name: 'THREAD', par: 9,
      // par 9 · unlock 1/flow 8 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 31 · jam 13% · loss 23% · luck 0.0%
      // scores  cla 7.8 · dis 7.9 · ins 10 · sur 4.9 · pre 3.7 · ele 9.5 · den 6.1 · fai 8.1 · sat 5.5 · rep 7
      idea: 'Nine cells, three blocks, and ten tilts — because a hazard makes half the ' +
            'stopping places illegal.',
      note: 'The densest thing in the game per square. A hazard does not add material, it ' +
            'removes places to rest, and removing places to rest is what makes a small ' +
            'board deep instead of merely full.',
      board: ['xo.',
              '@#@',
              '..@']
    },
    {
      id: 15, name: 'EDGE', par: 10,
      // par 10 · unlock 1/flow 9 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 46 · jam 9% · loss 18% · luck 0.0%
      // scores  cla 7.3 · dis 9.5 · ins 10 · sur 7.8 · pre 5.8 · ele 10 · den 6.1 · fai 8.8 · sat 5.5 · rep 8.3
      idea: 'The hazard, the walls and the blocks all doing one job each, with nothing ' +
            'left over.',
      note: 'Chapter three\'s finale. Every piece is load-bearing, the dead ends are all ' +
            'loud ones — you watch the block break — and there is exactly one thing to ' +
            'realise.',
      board: ['x.@.',
              'o@#.',
              '..@.']
    },

    // ── CHAPTER 4 · PAIR · 対  (stages 16–20) ─────────────────────────────────────────
    // Two colours, and a goal that is a hole for one block and a floor for the other. A block that has not been collected is still a wall — so finishing early is how you lose.
    {
      id: 16, name: 'SORT', par: 3,
      // par 3 · unlock 0/flow 3 · blind 0 · traps 3/4 · retreat 1 · ways 1 · states 14 · jam 0% · loss 0% · luck 1.6%
      // scores  cla 7.8 · dis 3.3 · ins 0 · sur 1 · pre 3.1 · ele 5.4 · den 1.7 · fai 9.1 · sat 3.8 · rep 3.9
      idea: 'A goal that is not yours does not take you. You roll straight over it.',
      note: 'Colour arrives in the smallest board that can show what it does. The lesson ' +
            'is not "match the colours" — a child gets that instantly — it is that the ' +
            'socket you rolled over is still open behind you, and you are still in the ' +
            'way.',
      hint: { ja: '色の合うゴールだけが受け取る', en: 'A goal only takes its own colour' },
      board: ['ab.',
              'B..',
              '.A.']
    },
    {
      id: 17, name: 'THROUGH', par: 9,
      // par 9 · unlock 2/flow 7 · blind 2 · traps 2/3 · retreat 2 · ways 2 · states 28 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 7.8 · ins 10 · sur 5.3 · pre 4.6 · ele 8.3 · den 5.7 · fai 10 · sat 5.6 · rep 8
      idea: 'The wrong-coloured goal is a hole you fall past — and a block that has not ' +
            'been collected is still a wall.',
      note: 'The board turns "collect everything as fast as possible" into a mistake. One ' +
            'block has to stay on the board doing a job long after it could have gone ' +
            'home.',
      board: ['aBA',
              'B#b',
              '#..']
    },
    {
      id: 18, name: 'ORDER', par: 8,
      // par 8 · unlock 2/flow 6 · blind 3 · traps 3/4 · retreat 2 · ways 4 · states 51 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.8 · dis 9.7 · ins 10 · sur 7 · pre 6 · ele 8.6 · den 8.6 · fai 10 · sat 5.1 · rep 8.6
      idea: 'Both colours want the same tilt. Only one of them can have it first.',
      note: 'Nothing on this board is difficult to move. The entire puzzle is which of ' +
            'two obvious things happens first, and the two orders do not merely differ in ' +
            'length — one of them does not work at all.',
      board: ['a#.',
              'B.A',
              'A.b']
    },
    {
      id: 19, name: 'SWAP', par: 11,
      // par 11 · unlock 1/flow 10 · blind 3 · traps 3/4 · retreat 3 · ways 2 · states 70 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 10 · sur 9.2 · pre 5.1 · ele 9.8 · den 8.9 · fai 10 · sat 6 · rep 9.7
      idea: 'Every tilt that helps one colour hurts the other, and the answer helps ' +
            'neither.',
      note: 'Ranked by instinct the correct opening is dead last, and it is dead last ' +
            'because it appears to abandon both blocks at once. The strongest "every ' +
            'direction is wrong" board the search found anywhere.',
      board: ['aB#.',
              '..#A',
              '.A.b']
    },
    {
      id: 20, name: 'TILT', par: 10,
      // par 10 · unlock 1/flow 9 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 51 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 9.7 · ins 10 · sur 8.2 · pre 6.3 · ele 9.1 · den 6.7 · fai 10 · sat 6 · rep 9.3
      idea: 'The best board the search could find anywhere in the game, whatever it is ' +
            'made of.',
      note: 'The finale is not the biggest board or the longest solution — it is ' +
            'whichever board scored highest on the thing this game is actually about. It ' +
            'is allowed to use any single device or none; what it is not allowed to be is ' +
            'merely long.',
      board: ['aB#.',
              'B#A.',
              '...b']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
