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
 *     '+'  pin            (a block that rolls onto one stops there for that tilt)
 *     'a'  goal A         'A'  block A         (colour stages only)
 *     'b'  goal B         'B'  block B
 *
 * No stage uses more than one device — no pin with a hazard, no hazard with a
 * colour — because the sweep says every pairing of two devices is worse than the
 * stronger of the two alone. And no board anywhere carries more than TWO blocks
 * of any one colour.
 *
 * A block is collected ONLY if it comes to a complete stop on a goal it fits —
 * sliding across one does nothing. So every goal below needs something standing
 * one cell beyond it, and half the design of these boards is where that backstop
 * comes from: the edge, a wall, or a block the player has not spent yet.
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
      note: 'The whole vocabulary, one board per idea — and two of the five spent on the ' +
            'rule that defines the game: a goal is not a target, it is a cell you have to ' +
            'be stopped on.' },
    { number: 2, name: 'NINE', ja: '九マス', from: 6, to: 10,
      note: 'Nothing added. Two blocks, four characters, and the hardest things they can ' +
            'be made to say. Every board here fits in a single glance and none can be ' +
            'solved in one.' },
    { number: 3, name: 'PEG', ja: '杭', from: 11, to: 15, device: 'pin',
      note: 'A cell you may enter, may not pass, and are perfectly safe on. It is the ' +
            'only place a block can be left standing in open ground — which makes it the ' +
            'only backstop the player gets to position.' },
    { number: 4, name: 'EDGE', ja: '境界', from: 16, to: 20, device: 'hazard',
      note: 'The exact mirror of a goal: a cell you may cross and must not be caught on. ' +
            'It adds no material to a board, it removes places to rest, and having ' +
            'nowhere to rest is what makes a small board deep.' },
    { number: 5, name: 'PAIR', ja: '対', from: 21, to: 25, device: 'colour',
      note: 'Two colours, two blocks each, and the longest boards in the game. A goal is ' +
            'a hole for one block and a floor tile for the other — so a block collected ' +
            'too early is a backstop you no longer have.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · GRAVITY · 重力  (stages 1–5) ──────────────────────────────────────
    // The whole vocabulary, one board per idea — and two of the five spent on the rule that defines the game: a goal is not a target, it is a cell you have to be stopped on.
    {
      id: 1, name: 'DROP', par: 2,
      // par 2 · unlock 0/flow 2 · blind 0 · traps 0/2 · retreat 0 · ways 2 · states 4 · jam 0% · loss 0% · luck 12.5%
      // scores  cla 10 · dis 0 · ins 0 · sur 0 · pre 1.8 · ele 6.8 · den 0.1 · fai 2.5 · sat 3.4 · rep 3.5
      idea: 'Gravity is a thing you point, and everything obeys it at once.',
      note: 'One block, one goal, two tilts, and the goal is in a corner so the edge does ' +
            'the stopping for free. The only stage in the game a player can solve without ' +
            'thinking, and that is its entire job: it teaches the verb.',
      hint: { ja: 'スワイプして重力を向ける', en: 'Swipe to aim gravity' },
      board: ['o..',
              '...',
              '..@']
    },
    {
      id: 2, name: 'OVER', par: 3,
      // par 3 · unlock 2/flow 1 · blind 1 · traps 1/2 · retreat 1 · ways 1 · states 7 · jam 0% · loss 0% · luck 1.6%
      // scores  cla 10 · dis 6 · ins 7.9 · sur 2.7 · pre 2.2 · ele 6.8 · den 0.8 · fai 9.1 · sat 2.9 · rep 4.9
      idea: 'A goal is not a target. Aim at it and the block sails straight over the top ' +
            'of it.',
      note: 'The most important board in the game, and it is the second one. Pointing ' +
            'gravity at the exit does not work here and cannot be made to work: a block ' +
            'is only collected if it comes to a complete STOP on the goal, so the ' +
            'question is never "which way is the goal" but "what is going to stop me once ' +
            'I get there". A player has to do this wrong exactly once.',
      hint: { ja: 'ゴールの上で止まらないと落ちない', en: 'You must STOP on a goal' },
      board: ['.o@',
              '...',
              '#..']
    },
    {
      id: 3, name: 'BRAKE', par: 4,
      // par 4 · unlock 2/flow 2 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 19 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 10 · dis 8.5 · ins 8.3 · sur 5.3 · pre 4.5 · ele 6.8 · den 2.8 · fai 9.8 · sat 6.1 · rep 6.2
      idea: 'What stops you on a goal is a wall behind it — so come at it from the side ' +
            'that has one.',
      note: 'The answer to the board before it. Only one of the four directions has ' +
            'anything standing one cell past the socket, and that is the only direction ' +
            'that collects. From here on the player reads a goal by looking at what is ' +
            'BEHIND it.',
      hint: { ja: 'ゴールの向こうの壁が止めてくれる', en: 'A wall past the goal stops you on it' },
      board: ['o#@',
              '...',
              '.@.']
    },
    {
      id: 4, name: 'STACK', par: 5,
      // par 5 · unlock 3/flow 2 · blind 1 · traps 2/3 · retreat 1 · ways 1 · states 24 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 7.7 · ins 6.3 · sur 2.7 · pre 0.8 · ele 6.8 · den 2.6 · fai 9.9 · sat 2.9 · rep 5.6
      idea: 'A block is a backstop too — and it is the only backstop you can move.',
      note: 'The last piece of the vocabulary, and the one the rest of the game is built ' +
            'on. Walls make some goals collectable and never move; blocks make the others ' +
            'collectable and the player spends them. This board is required to ' +
            'DEMONSTRATE that — at least one collection on its shortest line is a block ' +
            'stopped by another block, not by the terrain.',
      hint: { ja: 'ブロックも他のブロックを止める', en: 'Blocks stop each other too' },
      board: ['@#..',
              'o...',
              '.@#.']
    },
    {
      id: 5, name: 'AWAY', par: 7,
      // par 7 · unlock 2/flow 5 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 21 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9.5 · dis 8.6 · ins 9.6 · sur 7 · pre 3.2 · ele 8.9 · den 2.7 · fai 10 · sat 4.2 · rep 8.3
      idea: 'The way out is not the way you are facing: a block has to travel away from ' +
            'the goal to reach it.',
      note: 'Chapter one closing its own argument, and the first board that is purely a ' +
            'puzzle. Every tilt that points at the goal makes things worse, and the ' +
            'answer is the direction that looks like giving up ground.',
      board: ['.o@#',
              '#...',
              '..@.']
    },

    // ── CHAPTER 2 · NINE · 九マス  (stages 6–10) ─────────────────────────────────────────
    // Nothing added. Two blocks, four characters, and the hardest things they can be made to say. Every board here fits in a single glance and none can be solved in one.
    {
      id: 6, name: 'WASTE', par: 5,
      // par 5 · unlock 1/flow 4 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 21 · pump 4/5 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 8.6 · ins 9.2 · sur 6 · pre 3.5 · ele 6.8 · den 2.2 · fai 9.9 · sat 2.7 · rep 7.6
      idea: 'The move that appears to accomplish nothing is the one that makes everything ' +
            'possible.',
      note: 'Ranked by how a hurrying player would rate them, the correct opening is the ' +
            'LAST one they would try. Nothing is hidden — the whole board is in plain ' +
            'sight — and it still takes a second look.',
      board: ['#.@.',
              'o#.@',
              '....']
    },
    {
      id: 7, name: 'REFUSE', par: 5,
      // par 5 · unlock 2/flow 3 · blind 2 · traps 2/3 · retreat 1 · ways 1 · states 21 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 7.6 · ins 8.8 · sur 8 · pre 3.3 · ele 5.9 · den 2.2 · fai 9.9 · sat 3.3 · rep 6.6
      idea: 'Collecting a block can be the wrong move. Progress is not the same as ' +
            'winning.',
      note: 'The cruellest shape in the game and the fairest: a tilt that visibly banks a ' +
            'block and quietly ruins the position, because the block it banked was the ' +
            'backstop the other one needed. Once seen it is never forgotten — it rewrites ' +
            'what a good move is.',
      board: ['#o#.',
              '.@#.',
              '...@']
    },
    {
      id: 8, name: 'OTHER', par: 8,
      // par 8 · unlock 2/flow 6 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 23 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 8.9 · dis 8.6 · ins 10 · sur 8.2 · pre 3.1 · ele 8.6 · den 2.1 · fai 10 · sat 5.1 · rep 8.6
      idea: 'The block you have to move first is not the block you are trying to get ' +
            'home.',
      note: 'Every instinct points at the piece nearest the socket. It is the last one ' +
            'that moves. The board is built so the piece furthest from the goal is the ' +
            'one holding the whole position together.',
      board: ['.#..',
              '#o..',
              '@..#',
              '..@.']
    },
    {
      id: 9, name: 'FALL', par: 4,
      // par 4 · unlock 2/flow 2 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 23 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 9.5 · dis 8.6 · ins 8.3 · sur 7 · pre 5.5 · ele 6.8 · den 2.2 · fai 9.8 · sat 6.1 · rep 7.2
      idea: 'One tilt, and the whole board resolves at once — if you built it correctly ' +
            'first.',
      note: 'The payoff stage. Nothing is banked until the end and then the last tilt ' +
            'takes the lot — one block stops on the socket, which frees the cell, which ' +
            'lets the next one settle into it in the same tilt. The pleasure is watching ' +
            'a plan you made three moves ago execute itself.',
      board: ['o#@.',
              '....',
              '.@..']
    },
    {
      id: 10, name: 'NINE', par: 6,
      // par 6 · unlock 2/flow 4 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 16 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 10 · dis 7.4 · ins 9.2 · sur 3.7 · pre 3.8 · ele 7.8 · den 3 · fai 10 · sat 3.8 · rep 5.9
      idea: 'What nine cells can hold when every single one of them is carrying weight.',
      note: 'The chapter closing its argument: the most thinking that fits in nine cells ' +
            'under the base rules with two blocks. Delete any piece and the puzzle ' +
            'measurably changes.',
      board: ['o#@',
              '...',
              '#@.']
    },

    // ── CHAPTER 3 · PEG · 杭  (stages 11–15) ──────────────────────────────────────────
    // A cell you may enter, may not pass, and are perfectly safe on. It is the only place a block can be left standing in open ground — which makes it the only backstop the player gets to position.
    {
      id: 11, name: 'PEG', par: 3,
      // par 3 · unlock 1/flow 2 · blind 1 · traps 3/4 · retreat 0 · ways 1 · states 19 · jam 0% · loss 0% · luck 1.6%
      // scores  cla 7.8 · dis 8.5 · ins 8.3 · sur 5.4 · pre 3.2 · ele 3.4 · den 2.5 · fai 9.1 · sat 6.1 · rep 4.9
      idea: 'A peg catches whatever rolls onto it. Next tilt, the block rolls off again.',
      note: 'Introduced by a board where the peg is simply in the way of a slide the ' +
            'player was going to make anyway, so the rule is learned by watching rather ' +
            'than by reading. The important half of the lesson is the second half: it ' +
            'holds you for this tilt only.',
      hint: { ja: 'ピンは1回だけ止める', en: 'A peg holds a block for one tilt' },
      board: ['o#.',
              '.+@',
              '@..']
    },
    {
      id: 12, name: 'PARK', par: 7,
      // par 7 · unlock 2/flow 5 · blind 0 · traps 2/4 · retreat 2 · ways 3 · states 21 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 7.6 · ins 9.6 · sur 3.2 · pre 3.4 · ele 8.9 · den 2.7 · fai 10 · sat 4.2 · rep 5.3
      idea: 'A peg is the only place you can leave a block standing in open ground — so ' +
            'that is where your backstop goes.',
      note: 'What a pin is actually FOR. Without one, every block ends flush against ' +
            'something and the only backstops are where the terrain put them. A peg lets ' +
            'the player put a block in the middle of the floor and leave it there, which ' +
            'turns it into the wall the goal was missing.',
      board: ['.o@.',
              '#..+',
              '...@']
    },
    {
      id: 13, name: 'STEAL', par: 7,
      // par 7 · unlock 2/flow 5 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 30 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 8.9 · ins 9.6 · sur 7 · pre 3.4 · ele 7.7 · den 3.7 · fai 10 · sat 4.2 · rep 8.3
      idea: 'A peg one cell past a goal is not a backstop. It is a better hole than the ' +
            'goal is.',
      note: 'The trap that only a pin can set. A wall behind a socket catches a block ON ' +
            'the socket; a peg behind a socket catches it one cell late, every time, and ' +
            'the block sits there mocking the goal it just rolled over.',
      board: ['.o+@',
              '#..+',
              '..@.']
    },
    {
      id: 14, name: 'RELAY', par: 8,
      // par 8 · unlock 2/flow 6 · blind 2 · traps 3/4 · retreat 1 · ways 2 · states 33 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 9 · ins 10 · sur 4.3 · pre 3.8 · ele 8.6 · den 4.3 · fai 10 · sat 4.6 · rep 7.6
      idea: 'Held for one tilt, free the next: a peg is a staging post, not a parking ' +
            'space.',
      note: 'The half of the rule the teaching board could only hint at. Because the hold ' +
            'lasts exactly one tilt, a peg lets a block turn a corner in open ground — ' +
            'arrive on it going one way, leave it going another — which nothing else on ' +
            'the board can do.',
      board: ['#@..',
              '.o#.',
              '..+@']
    },
    {
      id: 15, name: 'DETENT', par: 8,
      // par 8 · unlock 1/flow 7 · blind 2 · traps 2/4 · retreat 2 · ways 3 · states 30 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 7.9 · ins 10 · sur 5.3 · pre 3.6 · ele 6.7 · den 3.9 · fai 10 · sat 5.1 · rep 7.6
      idea: 'The pegs, the walls and the two blocks all doing one job each, with nothing ' +
            'left over.',
      note: 'Chapter three\'s finale. Two blocks and a handful of terrain, and the ' +
            'longest solution the base-plus-peg vocabulary can hold at this size.',
      board: ['#.#.',
              '.o#@',
              '.@+.']
    },

    // ── CHAPTER 4 · EDGE · 境界  (stages 16–20) ─────────────────────────────────────────
    // The exact mirror of a goal: a cell you may cross and must not be caught on. It adds no material to a board, it removes places to rest, and having nowhere to rest is what makes a small board deep.
    {
      id: 16, name: 'CROSS', par: 4,
      // par 4 · unlock 2/flow 2 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 11 · jam 10% · loss 20% · luck 0.4%
      // scores  cla 7.8 · dis 8.2 · ins 8.3 · sur 6.4 · pre 3.5 · ele 4.5 · den 1.7 · fai 8.4 · sat 2.9 · rep 5.2
      idea: 'You may slide straight over a hazard. You may not be left standing on one.',
      note: 'The hazard arrives doing the opposite of what a hazard normally does: the ' +
            'solution goes right across it. Stop on it and the block shatters where the ' +
            'player can see exactly why — and undo is one tap, which is the whole lesson.',
      hint: { ja: '危険マスは通れる。止まると壊れる', en: 'Cross a hazard — never stop on one' },
      board: ['#o.',
              '.@x',
              '@..']
    },
    {
      id: 17, name: 'CATCH', par: 11,
      // par 11 · unlock 3/flow 8 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 20 · jam 11% · loss 16% · luck 0.0%
      // scores  cla 7.3 · dis 8.5 · ins 8 · sur 7.5 · pre 4.5 · ele 10 · den 3.6 · fai 8.5 · sat 5.5 · rep 8.7
      idea: 'A hazard is only survivable if something is waiting to stop you past it.',
      note: 'The hazard turns the other block into a brake. This is where the dangerous ' +
            'square stops being an obstacle and becomes equipment: the question is no ' +
            'longer "how do I avoid it" but "what has to be over there first".',
      board: ['@#..',
              '.o@x',
              '..#.']
    },
    {
      id: 18, name: 'LEDGE', par: 9,
      // par 9 · unlock 2/flow 7 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 15 · jam 7% · loss 21% · luck 0.0%
      // scores  cla 6.8 · dis 8.3 · ins 10 · sur 7.5 · pre 3.3 · ele 7.5 · den 2.6 · fai 9 · sat 5.1 · rep 8
      idea: 'Every direction looks fatal. One of them is not, and it is the one that ' +
            'looks worst.',
      note: 'The board a player is most likely to declare broken before solving it. ' +
            'Everything that looks like progress ends with a block standing somewhere it ' +
            'cannot stand.',
      board: ['xo@.',
              '#..@',
              '.x.#']
    },
    {
      id: 19, name: 'THREAD', par: 11,
      // par 11 · unlock 3/flow 8 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 20 · jam 0% · loss 26% · luck 0.0%
      // scores  cla 7.3 · dis 7.5 · ins 8 · sur 3.7 · pre 4.7 · ele 10 · den 3.6 · fai 10 · sat 5.5 · rep 7.7
      idea: 'A hazard adds no material to the board — it removes places to rest, and that ' +
            'is what makes a small board deep.',
      note: 'The densest thing in the game per square. Two blocks, nine or twelve cells, ' +
            'and a solution far longer than the material suggests, purely because half ' +
            'the stopping places are illegal.',
      board: ['#x..',
              '.o#.',
              '.@@.']
    },
    {
      id: 20, name: 'EDGE', par: 9,
      // par 9 · unlock 2/flow 7 · blind 2 · traps 3/4 · retreat 3 · ways 2 · states 21 · jam 5% · loss 15% · luck 0.0%
      // scores  cla 7.3 · dis 8.6 · ins 10 · sur 6.3 · pre 3.1 · ele 9.5 · den 3.2 · fai 9.3 · sat 5.1 · rep 8
      idea: 'The hazard, the walls and the blocks all doing one job each, with nothing ' +
            'left over.',
      note: 'Chapter four\'s finale. Every piece is load-bearing, the dead ends are all ' +
            'loud ones — you watch the block break — and there is exactly one thing to ' +
            'realise.',
      board: ['xo@.',
              '#...',
              '..@#']
    },

    // ── CHAPTER 5 · PAIR · 対  (stages 21–25) ─────────────────────────────────────────
    // Two colours, two blocks each, and the longest boards in the game. A goal is a hole for one block and a floor tile for the other — so a block collected too early is a backstop you no longer have.
    {
      id: 21, name: 'SORT', par: 7,
      // par 7 · unlock 2/flow 5 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 13 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.8 · dis 7.3 · ins 9.6 · sur 3.7 · pre 5.3 · ele 8.9 · den 2.9 · fai 10 · sat 4.7 · rep 6.3
      idea: 'A goal that is not yours does not take you. You can stop right in it and ' +
            'stay there.',
      note: 'Colour arrives in the smallest board that can show what it does. The lesson ' +
            'is not "match the colours" — a child gets that instantly — it is that a ' +
            'block parked in the wrong socket is still a block, still in the way, and now ' +
            'the best backstop on the board.',
      hint: { ja: '色の合うゴールだけが受け取る', en: 'A goal only takes its own colour' },
      board: ['a.#',
              'BAb',
              '...']
    },
    {
      id: 22, name: 'THROUGH', par: 10,
      // par 10 · unlock 2/flow 8 · blind 2 · traps 2/3 · retreat 3 · ways 3 · states 73 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 9 · ins 10 · sur 6.3 · pre 6.4 · ele 9.1 · den 8.9 · fai 10 · sat 8.8 · rep 8.3
      idea: 'You do not want to collect that block yet. You still need it standing there.',
      note: 'The board that turns "collect everything as fast as possible" into a ' +
            'mistake. One block has to stay out long after it could have gone home, ' +
            'because it is the only thing that can stop the other colour on its socket.',
      board: ['aB#.',
              '..Ab',
              '..A#']
    },
    {
      id: 23, name: 'ORDER', par: 11,
      // par 11 · unlock 1/flow 10 · blind 3 · traps 3/4 · retreat 3 · ways 2 · states 70 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 10 · sur 9.2 · pre 5.1 · ele 9.8 · den 8.9 · fai 10 · sat 6 · rep 9.7
      idea: 'Both colours want the same tilt. Only one of them can have it first.',
      note: 'Nothing on this board is difficult to move. The entire puzzle is which of ' +
            'two obvious things happens first, and the two orders do not merely differ in ' +
            'length — one of them does not work at all.',
      board: ['aB#.',
              '..#A',
              '.A.b']
    },
    {
      id: 24, name: 'SWAP', par: 15,
      // par 15 · unlock 1/flow 14 · blind 3 · traps 3/4 · retreat 3 · ways 2 · states 152 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.3 · dis 10 · ins 10 · sur 9.2 · pre 6.3 · ele 10 · den 10 · fai 10 · sat 6 · rep 10
      idea: 'Every tilt that helps one colour hurts the other, and the answer helps ' +
            'neither.',
      note: 'Ranked by instinct the correct opening is dead last, and it is dead last ' +
            'because it appears to abandon both colours at once.',
      board: ['aB#A',
              'B.#.',
              'A..b']
    },
    {
      id: 25, name: 'TILT', par: 15,
      // par 15 · unlock 2/flow 13 · blind 3 · traps 3/4 · retreat 5 · ways 1 · states 382 · jam 10% · loss 0% · luck 0.0%
      // scores  cla 5.2 · dis 10 · ins 10 · sur 10 · pre 8.9 · ele 10 · den 9.2 · fai 8.5 · sat 6 · rep 10
      idea: 'The longest board in the game that is still one idea — and the best board ' +
            'the search could find anywhere.',
      note: 'The finale is not the biggest board — it is whichever board scored highest ' +
            'on the thing this game is actually about, with length used only to break ' +
            'ties between boards that were already good. It may use any single device or ' +
            'none.',
      board: ['#aA.',
              'B.b.',
              '..#.',
              '.#AB']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
