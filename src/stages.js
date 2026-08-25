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
 *     'c'  goal C         'C'  block C
 *
 * `win` says what DONE means, and it is the only thing that changes between the
 * four kinds of board. The physics are identical in all of them.
 *
 *     allin   (default)  collect every block
 *     select              collect every block whose colour has a goal; the rest
 *                         can never leave and are drawn dimmed
 *     match               no goals — blocks of one colour must end up touching
 *     form                the goal characters mark cells to be STOOD on, all at
 *                         once; nothing is ever collected
 *
 * Outside chapter 8, no stage puts more than one NEW idea on screen at a time:
 * no hazard with an alternative win condition, and no two terrain devices
 * together, because the sweep says every such pairing is worse than the stronger
 * of the two alone. Chapter 8 spends that result deliberately, once.
 *
 * Colour is not counted as a second device on a SELECT, MATCH or FORM board,
 * because it is what those win conditions are MADE of — MATCH with a single
 * colour produces zero viable boards anywhere, and SELECT is definitionally
 * "some colours have a socket and some do not". No board anywhere carries more
 * than TWO blocks of any one colour.
 *
 * A block is collected ONLY if it comes to a complete stop on a goal it fits —
 * sliding across one does nothing. So every goal below needs something standing
 * one cell beyond it, and half the design of these boards is where that backstop
 * comes from: the edge, a wall, or a block the player has not spent yet.
 *
 * Every `par` is a breadth-first-proven shortest solution. Every piece on every
 * board survived deletion testing: remove any one of them and the puzzle measurably
 * changes. The numbers in each comment are the measured signature — see
 * tools/lib/design.js for what they mean:
 *
 *   unlock  how many correct moves the board costs before it starts playing itself.
 *           0 would mean a player who is not thinking solves it cold, and no
 *           stage in the game is allowed that. On the short boards it is the
 *           whole selection criterion and is kept to 1-4; past about fifteen
 *           tilts it stops meaning anything — nobody expects a fifty-move
 *           solution to fall out of one realisation — and `insight` takes over.
 *   flow    how much stage is left after that — the part that is the reward.
 *   insight how many moves on the shortest line the player has to overrule their
 *           own instinct on. On the long boards this is the axis that matters:
 *           the rest of the line is momentum.
 *   blind   where the correct opening sits in the order a hurrying player would
 *           try the four tilts. 3 means it is the very last one they would pick.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CHAPTERS = [
    { number: 1, name: 'GRAVITY', ja: '重力', from: 1, to: 10,
      note: 'The whole vocabulary, one board per idea — and two of the five spent on the ' +
            'rule that defines the game: a goal is not a target, it is a cell you have to ' +
            'be stopped on.' },
    { number: 2, name: 'NINE', ja: '九マス', from: 11, to: 20,
      note: 'Nothing added. Two blocks, four characters, and the hardest things they can ' +
            'be made to say. Every board here fits in a single glance and none can be ' +
            'solved in one.' },
    { number: 3, name: 'EDGE', ja: '境界', from: 21, to: 30, device: 'hazard',
      note: 'The exact mirror of a goal: a cell you may cross and must not be caught on. ' +
            'It adds no material to a board, it removes places to rest, and being caught ' +
            'on one ends the run.' },
    { number: 4, name: 'PAIR', ja: '対', from: 31, to: 40, device: 'colour',
      note: 'Two colours, two blocks each. A goal is a hole for one block and a floor ' +
            'tile for the other — so a block collected too early is a backstop you no ' +
            'longer have.' },
    { number: 5, name: 'TOGETHER', ja: '結', from: 41, to: 50, device: 'match',
      note: 'No holes at all: blocks of one colour have to end up touching. One gravity ' +
            'moves both of them, so almost every way of closing a gap opens it again ' +
            'somewhere else.' },
    { number: 6, name: 'CHOSEN', ja: '選', from: 51, to: 60, device: 'select',
      note: 'Only the marked blocks have to get home; the rest can never leave and are ' +
            'drawn dimmed to say so. You cannot move one block — you move the world, and ' +
            'everything answers.' },
    { number: 7, name: 'SHAPE', ja: '形', from: 61, to: 70, device: 'form',
      note: 'The marks are standing spots, not holes. Nothing is banked, every mark has ' +
            'to be covered at the same moment, and every block placed is a new wall in ' +
            'the way of the next.' },
    { number: 8, name: 'ABYSS', ja: '深淵', from: 71, to: 80, extreme: true,
      note: 'The rules that were kept apart all game, together, and the only chapter ' +
            'where length is the target. Thirty tilts at the shallow end. Nothing here is ' +
            'a moment of insight — it is an afternoon.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · GRAVITY · 重力  (stages 1–10) ──────────────────────────────────────
    // The whole vocabulary, one board per idea — and two of the five spent on the rule that defines the game: a goal is not a target, it is a cell you have to be stopped on.
    {
      id: 1, name: 'DROP', par: 2,
      // par 2 · unlock 0/flow 2 · insight 0/2 · blind 0 · traps 0/2 · retreat 0 · ways 2 · states 4 · jam 0% · loss 0% · luck 12.5%
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
      // par 3 · unlock 2/flow 1 · insight 2/3 · blind 1 · traps 1/2 · retreat 1 · ways 1 · states 7 · jam 0% · loss 0% · luck 1.6%
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
      // par 4 · unlock 2/flow 2 · insight 2/4 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 19 · jam 0% · loss 0% · luck 0.4%
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
      // par 5 · unlock 3/flow 2 · insight 1/5 · blind 0 · traps 3/4 · retreat 2 · ways 1 · states 22 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 8.6 · ins 6.3 · sur 3.2 · pre 0.6 · ele 6.8 · den 2.3 · fai 9.9 · sat 2.9 · rep 4.6
      idea: 'A block is a backstop too — and it is the only backstop you can move.',
      note: 'The last piece of the vocabulary, and the one the rest of the game is built ' +
            'on. Walls make some goals collectable and never move; blocks make the others ' +
            'collectable and the player spends them. This board is required to ' +
            'DEMONSTRATE that — at least one collection on its shortest line is a block ' +
            'stopped by another block, not by the terrain.',
      hint: { ja: 'ブロックも他のブロックを止める', en: 'Blocks stop each other too' },
      board: ['#...',
              '@o@.',
              '.#..']
    },
    {
      id: 5, name: 'AWAY', par: 4,
      // par 4 · unlock 2/flow 2 · insight 2/4 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 23 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 9.5 · dis 8.6 · ins 8.3 · sur 7 · pre 5.5 · ele 6.8 · den 2.2 · fai 9.8 · sat 6.1 · rep 7.2
      idea: 'The way out is not the way you are facing: a block has to travel away from ' +
            'the goal to reach it.',
      note: 'Chapter one closing its own argument, and the first board that is purely a ' +
            'puzzle. Every tilt that points at the goal makes things worse, and the ' +
            'answer is the direction that looks like giving up ground.',
      board: ['o#@.',
              '....',
              '.@..']
    },
    {
      id: 6, name: 'RIM', par: 4,
      // par 4 · unlock 2/flow 2 · insight 2/4 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 19 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 9.5 · dis 8.5 · ins 8.3 · sur 5.3 · pre 5.5 · ele 6.8 · den 1.8 · fai 9.8 · sat 7.1 · rep 6.2
      idea: 'The board edge is a backstop you never have to build — and it only works ' +
            'from one side.',
      note: 'BRAKE taught that a wall behind a socket collects. This board has no walls ' +
            'at all, so the only thing standing behind anything is the edge of the board ' +
            '— and a goal on the rim is collectable from one direction and inert from the ' +
            'other three.',
      board: ['o...',
              '#.@.',
              '@...']
    },
    {
      id: 7, name: 'BOTH', par: 4,
      // par 4 · unlock 2/flow 2 · insight 2/4 · blind 0 · traps 1/3 · retreat 2 · ways 2 · states 19 · jam 0% · loss 0% · luck 0.8%
      // scores  cla 9.5 · dis 6.5 · ins 8.3 · sur 3.2 · pre 5.5 · ele 5.7 · den 1.8 · fai 9.5 · sat 7.1 · rep 4.2
      idea: 'One tilt can bank two blocks. Arranging for that is a different job from ' +
            'banking one.',
      note: 'A collection frees its cell, and gravity has not gone away — so whatever was ' +
            'queued behind slides into the same socket and is taken in the same tilt. ' +
            'This is the first board that requires it, which means the player has to line ' +
            'two blocks up before pointing them anywhere.',
      board: ['o.@.',
              '##..',
              '.@..']
    },
    {
      id: 8, name: 'PUSH', par: 5,
      // par 5 · unlock 3/flow 2 · insight 3/5 · blind 1 · traps 2/3 · retreat 1 · ways 1 · states 24 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 7.7 · ins 6.3 · sur 2.7 · pre 0.8 · ele 6.8 · den 2.6 · fai 9.9 · sat 2.9 · rep 5.6
      idea: 'You cannot shove one block into another. Gravity moves the front one first.',
      note: 'Both blocks answer the same tilt, and the leader always moves first, so a ' +
            'gap between two blocks travelling the same way never closes on its own. It ' +
            'closes when the leader runs out of floor — which means the question is never ' +
            'how to push, it is where to stop the one in front.',
      board: ['@#..',
              'o...',
              '.@#.']
    },
    {
      id: 9, name: 'ROUND', par: 5,
      // par 5 · unlock 3/flow 2 · insight 3/5 · blind 0 · traps 1/3 · retreat 3 · ways 2 · states 18 · jam 0% · loss 0% · luck 0.2%
      // scores  cla 9.5 · dis 6.4 · ins 6.3 · sur 3 · pre 5.8 · ele 5.6 · den 1.9 · fai 9.9 · sat 6.1 · rep 4.6
      idea: 'A block has to come back to a cell it has already left, travelling the other ' +
            'way.',
      note: 'The board a player solves by accident and then cannot reproduce, until they ' +
            'notice that one block goes out and comes back. Nothing is collected on the ' +
            'way out — the whole excursion exists to change what is standing where.',
      board: ['@o@.',
              '#...',
              '#...']
    },
    {
      id: 10, name: 'VOCAB', par: 5,
      // par 5 · unlock 1/flow 4 · insight 1/5 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 21 · pump 4/5 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 8.6 · ins 9.2 · sur 6 · pre 3.5 · ele 6.8 · den 2.2 · fai 9.9 · sat 2.7 · rep 7.6
      idea: 'Gravity, the edge, a wall and a block — each doing exactly one job, with ' +
            'nothing spare.',
      note: 'The finale of the vocabulary chapter, and the last board before the game ' +
            'stops being gentle. Everything the first five stages introduced separately ' +
            'has to be used here at once, and nothing else is on the board.',
      board: ['#.@.',
              'o#.@',
              '....']
    },

    // ── CHAPTER 2 · NINE · 九マス  (stages 11–20) ─────────────────────────────────────────
    // Nothing added. Two blocks, four characters, and the hardest things they can be made to say. Every board here fits in a single glance and none can be solved in one.
    {
      id: 11, name: 'WASTE', par: 6,
      // par 6 · unlock 2/flow 4 · insight 2/6 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 22 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9.5 · dis 8.6 · ins 9.2 · sur 7.2 · pre 3.9 · ele 6.8 · den 2.6 · fai 10 · sat 3.8 · rep 7.9
      idea: 'The move that appears to accomplish nothing is the one that makes everything ' +
            'possible.',
      note: 'Ranked by how a hurrying player would rate them, the correct opening is the ' +
            'LAST one they would try. Nothing is hidden — the whole board is in plain ' +
            'sight — and it still takes a second look.',
      board: ['#o.#',
              '.#.@',
              '@...']
    },
    {
      id: 12, name: 'REFUSE', par: 5,
      // par 5 · unlock 2/flow 3 · insight 2/5 · blind 2 · traps 2/3 · retreat 1 · ways 1 · states 21 · jam 0% · loss 0% · luck 0.1%
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
      id: 13, name: 'OTHER', par: 8,
      // par 8 · unlock 2/flow 6 · insight 2/8 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 23 · jam 0% · loss 0% · luck 0.0%
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
      id: 14, name: 'FALL', par: 5,
      // par 5 · unlock 3/flow 2 · insight 3/5 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 24 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 7.7 · ins 6.3 · sur 3.7 · pre 5 · ele 5.9 · den 2.6 · fai 9.9 · sat 6.1 · rep 5.6
      idea: 'One tilt, and the whole board resolves at once — if you built it correctly ' +
            'first.',
      note: 'The payoff stage. Nothing is banked until the end and then the last tilt ' +
            'takes the lot — one block stops on the socket, which frees the cell, which ' +
            'lets the next one settle into it in the same tilt. The pleasure is watching ' +
            'a plan you made three moves ago execute itself.',
      board: ['#o..',
              '@#@.',
              '...#']
    },
    {
      id: 15, name: 'NINE', par: 6,
      // par 6 · unlock 2/flow 4 · insight 2/6 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 16 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 10 · dis 7.4 · ins 9.2 · sur 3.7 · pre 3.8 · ele 7.8 · den 3 · fai 10 · sat 3.8 · rep 5.9
      idea: 'What nine cells can hold when every single one of them is carrying weight.',
      note: 'The chapter closing its argument: the most thinking that fits in nine cells ' +
            'under the base rules with two blocks. Delete any piece and the puzzle ' +
            'measurably changes.',
      board: ['o#@',
              '...',
              '#@.']
    },
    {
      id: 16, name: 'SLOW', par: 10,
      // par 10 · unlock 1/flow 9 · insight 3/10 · blind 2 · traps 2/3 · retreat 3 · ways 1 · states 30 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 8.4 · dis 7.9 · ins 10 · sur 6.3 · pre 5 · ele 9.1 · den 3 · fai 10 · sat 8.8 · rep 8.3
      idea: 'The shortest line is the one that looks longest.',
      note: 'Every tilt on the correct line sends something further from where it needs ' +
            'to be, and the route that heads straight at the sockets takes longer or ' +
            'fails outright. It is the clearest board in the game for the difference ' +
            'between distance and progress.',
      board: ['#o..',
              '...#',
              '.##@',
              '..@.']
    },
    {
      id: 17, name: 'TWELVE', par: 9,
      // par 9 · unlock 1/flow 8 · insight 2/9 · blind 2 · traps 2/3 · retreat 2 · ways 1 · states 19 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9.5 · dis 7.5 · ins 10 · sur 5.3 · pre 3.1 · ele 10 · den 3 · fai 10 · sat 5.5 · rep 8
      idea: 'Three more cells, and the same two blocks have somewhere new to be wrong.',
      note: 'Four by three under the base rules with two blocks, and nothing else. The ' +
            'extra column does not make the board easier — it gives a block one more ' +
            'place to stop that is not the place it needed to stop.',
      board: ['@#..',
              '.o.@',
              '..#.']
    },
    {
      id: 18, name: 'SIXTEEN', par: 9,
      // par 9 · unlock 1/flow 8 · insight 3/9 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 35 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 8.4 · dis 9.1 · ins 10 · sur 7 · pre 2.9 · ele 8.3 · den 3.2 · fai 10 · sat 5.5 · rep 9
      idea: 'What sixteen cells hold under nothing but the base rules.',
      note: 'The only 4×4 base-rules board in the game. It is here to prove a point the ' +
            'rest of the chapter argues the other way round: the board did not need to be ' +
            'bigger, and when it is, the difficulty comes from the same four characters ' +
            'doing the same four things.',
      board: ['.#..',
              '@o..',
              '..#.',
              '##.@']
    },
    {
      id: 19, name: 'DOORS', par: 5,
      // par 5 · unlock 2/flow 3 · insight 2/5 · blind 2 · traps 3/4 · retreat 1 · ways 1 · states 17 · jam 0% · loss 0% · luck 0.1%
      // scores  cla 9.5 · dis 8.4 · ins 8.8 · sur 5.5 · pre 3.9 · ele 6.8 · den 1.8 · fai 9.9 · sat 3.8 · rep 6.6
      idea: 'Two sockets, two blocks, and it matters enormously which goes in which.',
      note: 'The only base-rules boards in the game with more than one socket. A second ' +
            'hole is not a second chance: each one is collectable from its own single ' +
            'direction, so choosing which block goes where is choosing which two ' +
            'directions the rest of the board has to survive.',
      board: ['@o.#',
              '....',
              '..o@']
    },
    {
      id: 20, name: 'TEN', par: 7,
      // par 7 · unlock 2/flow 5 · insight 2/7 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 21 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 9.5 · dis 8.6 · ins 9.6 · sur 7 · pre 3.2 · ele 8.9 · den 2.7 · fai 10 · sat 4.2 · rep 8.3
      idea: 'Four tilts, four reasons to try them, and the right one is the fourth.',
      note: 'The most misleading opening the base rules can produce. Ranked by how a ' +
            'hurrying player would rate them, the correct tilt is dead last — and there ' +
            'is nothing on the board except walls, blocks and a socket.',
      board: ['.o@#',
              '#...',
              '..@.']
    },

    // ── CHAPTER 3 · EDGE · 境界  (stages 21–30) ─────────────────────────────────────────
    // The exact mirror of a goal: a cell you may cross and must not be caught on. It adds no material to a board, it removes places to rest, and being caught on one ends the run.
    {
      id: 21, name: 'CROSS', par: 4,
      // par 4 · unlock 2/flow 2 · insight 2/4 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 11 · jam 10% · loss 20% · luck 0.4%
      // scores  cla 7.8 · dis 8.2 · ins 8.3 · sur 6.4 · pre 3.5 · ele 4.5 · den 1.7 · fai 8.4 · sat 2.9 · rep 5.2
      idea: 'You may slide straight over a hazard. You may not be left standing on one.',
      note: 'The hazard arrives doing the opposite of what a hazard normally does: the ' +
            'solution goes right across it. Stop on it and the block shatters where the ' +
            'player can see exactly why — and that ends the run, which is the whole ' +
            'lesson.',
      hint: { ja: '危険マスは通れる。止まると即ゲームオーバー', en: 'Cross a hazard — stop on one and the run ends' },
      board: ['#o.',
              '.@x',
              '@..']
    },
    {
      id: 22, name: 'CATCH', par: 8,
      // par 8 · unlock 3/flow 5 · insight 3/8 · blind 1 · traps 3/4 · retreat 3 · ways 1 · states 19 · jam 0% · loss 11% · luck 0.0%
      // scores  cla 7.3 · dis 8.5 · ins 7.6 · sur 5.9 · pre 4.3 · ele 8.6 · den 2.8 · fai 10 · sat 4.2 · rep 6.6
      idea: 'A hazard is only survivable if something is waiting to stop you past it.',
      note: 'The hazard turns the other block into a brake. This is where the dangerous ' +
            'square stops being an obstacle and becomes equipment: the question is no ' +
            'longer "how do I avoid it" but "what has to be over there first".',
      board: ['.o@#',
              '#.x.',
              '..@.']
    },
    {
      id: 23, name: 'LEDGE', par: 7,
      // par 7 · unlock 1/flow 6 · insight 1/7 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 19 · jam 0% · loss 17% · luck 0.0%
      // scores  cla 7.3 · dis 8.5 · ins 10 · sur 7.5 · pre 4.5 · ele 7.7 · den 2.5 · fai 10 · sat 5.6 · rep 7.3
      idea: 'Every direction looks fatal. One of them is not, and it is the one that ' +
            'looks worst.',
      note: 'The board a player is most likely to declare broken before solving it. ' +
            'Everything that looks like progress ends with a block standing somewhere it ' +
            'cannot stand.',
      board: ['ox..',
              '.@#.',
              '#.@.']
    },
    {
      id: 24, name: 'THREAD', par: 11,
      // par 11 · unlock 3/flow 8 · insight 4/11 · blind 1 · traps 2/3 · retreat 2 · ways 1 · states 20 · jam 0% · loss 26% · luck 0.0%
      // scores  cla 7.3 · dis 7.5 · ins 8 · sur 3.7 · pre 4.7 · ele 10 · den 3.6 · fai 10 · sat 5.5 · rep 7.7
      idea: 'A hazard adds no material to the board — it removes places to rest, and that ' +
            'is what makes a small board deep.',
      note: 'The densest thing in the first half of the game per square. Two blocks, nine ' +
            'or twelve cells, and a solution far longer than the material suggests, ' +
            'purely because half the stopping places are illegal.',
      board: ['#x..',
              '.o#.',
              '.@@.']
    },
    {
      id: 25, name: 'EDGE', par: 9,
      // par 9 · unlock 2/flow 7 · insight 2/9 · blind 2 · traps 3/4 · retreat 3 · ways 2 · states 21 · jam 5% · loss 15% · luck 0.0%
      // scores  cla 7.3 · dis 8.6 · ins 10 · sur 6.3 · pre 3.1 · ele 9.5 · den 3.2 · fai 9.3 · sat 5.1 · rep 8
      idea: 'The hazard, the walls and the blocks all doing one job each, with nothing ' +
            'left over.',
      note: 'Chapter three\'s finale. Every piece is load-bearing, the dead ends are all ' +
            'loud ones — you watch the block break — and there is exactly one thing to ' +
            'realise.',
      board: ['xo@.',
              '#...',
              '..@#']
    },
    {
      id: 26, name: 'BRINK', par: 11,
      // par 11 · unlock 3/flow 8 · insight 4/11 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 20 · jam 11% · loss 16% · luck 0.0%
      // scores  cla 7.3 · dis 8.5 · ins 8 · sur 7.5 · pre 4.5 · ele 10 · den 3.6 · fai 8.5 · sat 5.5 · rep 8.7
      idea: 'A hazard one cell past a goal turns overshooting from a waste of time into ' +
            'the end of the run.',
      note: 'Everywhere else in the game, sliding past a socket costs a tilt. Here the ' +
            'cell past it is a hazard, so the block that sails over the hole does not ' +
            'come back — which makes this the sharpest statement in the game of the rule ' +
            'chapter one is built on.',
      board: ['@#..',
              '.o@x',
              '..#.']
    },
    {
      id: 27, name: 'BRIDGE', par: 7,
      // par 7 · unlock 3/flow 4 · insight 1/7 · blind 0 · traps 3/4 · retreat 2 · ways 1 · states 19 · jam 6% · loss 22% · luck 0.0%
      // scores  cla 7.3 · dis 8.5 · ins 7.2 · sur 3.2 · pre 0.4 · ele 7.7 · den 2.5 · fai 9.2 · sat 3.8 · rep 5.3
      idea: 'The other block is the only safe place to stop, and it has to be over there ' +
            'first.',
      note: 'CATCH made a block into a brake past a hazard. This board makes it the ONLY ' +
            'brake: no wall and no edge is in the right place, so the route across is ' +
            'impossible until a block that is not going anywhere yet has been parked on ' +
            'the far side.',
      board: ['#..x',
              '@o@.',
              '.#..']
    },
    {
      id: 28, name: 'NARROW', par: 9,
      // par 9 · unlock 2/flow 7 · insight 2/9 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 18 · jam 6% · loss 18% · luck 0.0%
      // scores  cla 6.8 · dis 8.4 · ins 10 · sur 6.3 · pre 3.1 · ele 7.5 · den 2.9 · fai 9.2 · sat 5.1 · rep 8
      idea: 'Two hazards, and the only lane between them runs the wrong way.',
      note: 'A hazard removes resting places rather than adding material, and two of them ' +
            'on a small board remove most of them. What is left is not a corridor — every ' +
            'direction still works — it is a board where almost every direction ends ' +
            'somewhere illegal.',
      board: ['xo@.',
              '#...',
              '.x@#']
    },
    {
      id: 29, name: 'LURE', par: 7,
      // par 7 · unlock 2/flow 5 · insight 2/7 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 14 · jam 15% · loss 15% · luck 0.0%
      // scores  cla 6.8 · dis 8.3 · ins 9.6 · sur 9 · pre 4.5 · ele 6.8 · den 2 · fai 7.8 · sat 5.2 · rep 7.3
      idea: 'The tilt that banks a block is the tilt that kills the other one.',
      note: 'REFUSE asked the player to turn down a collection that ruined the position. ' +
            'Here the collection destroys a block outright, in the same tilt, visibly — ' +
            'which makes it the fairest cruel board in the game: the mistake explains ' +
            'itself the moment it happens.',
      board: ['ox@.',
              '.#x@',
              '#...']
    },
    {
      id: 30, name: 'SHARD', par: 12,
      // par 12 · unlock 1/flow 11 · insight 2/12 · blind 2 · traps 3/4 · retreat 2 · ways 1 · states 33 · jam 0% · loss 19% · luck 0.0%
      // scores  cla 6.2 · dis 9 · ins 6 · sur 6.5 · pre 4.7 · ele 10 · den 3.6 · fai 10 · sat 5.5 · rep 9
      idea: 'The hazard, the walls and the blocks all load-bearing, on the biggest board ' +
            'the chapter uses.',
      note: 'Four by four with a hazard on it, which is the most room any board in the ' +
            'first half of the game gets. The extra space is not generosity — it is more ' +
            'places to be left standing somewhere you cannot stand.',
      board: ['.#@.',
              '.o..',
              '..#.',
              '#x.@']
    },

    // ── CHAPTER 4 · PAIR · 対  (stages 31–40) ─────────────────────────────────────────
    // Two colours, two blocks each. A goal is a hole for one block and a floor tile for the other — so a block collected too early is a backstop you no longer have.
    {
      id: 31, name: 'SORT', par: 7,
      // par 7 · unlock 2/flow 5 · insight 2/7 · blind 1 · traps 2/3 · retreat 1 · ways 1 · states 13 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.8 · dis 7.3 · ins 9.6 · sur 2.7 · pre 5.3 · ele 8.9 · den 2.9 · fai 10 · sat 4.7 · rep 6.3
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
      id: 32, name: 'THROUGH', par: 10,
      // par 10 · unlock 2/flow 8 · insight 5/10 · blind 2 · traps 2/3 · retreat 3 · ways 3 · states 73 · jam 0% · loss 0% · luck 0.0%
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
      id: 33, name: 'ORDER', par: 11,
      // par 11 · unlock 1/flow 10 · insight 2/11 · blind 3 · traps 3/4 · retreat 3 · ways 2 · states 70 · jam 0% · loss 0% · luck 0.0%
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
      id: 34, name: 'SWAP', par: 15,
      // par 15 · unlock 1/flow 14 · insight 2/15 · blind 3 · traps 3/4 · retreat 3 · ways 2 · states 152 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.3 · dis 10 · ins 6 · sur 9.2 · pre 6.3 · ele 10 · den 10 · fai 10 · sat 6 · rep 10
      idea: 'Every tilt that helps one colour hurts the other, and the answer helps ' +
            'neither.',
      note: 'Ranked by instinct the correct opening is dead last, and it is dead last ' +
            'because it appears to abandon both colours at once.',
      board: ['aB#A',
              'B.#.',
              'A..b']
    },
    {
      id: 35, name: 'TILT', par: 15,
      // par 15 · unlock 2/flow 13 · insight 4/15 · blind 3 · traps 3/4 · retreat 5 · ways 1 · states 382 · jam 10% · loss 0% · luck 0.0%
      // scores  cla 5.2 · dis 10 · ins 6.3 · sur 10 · pre 8.9 · ele 10 · den 9.2 · fai 8.5 · sat 6 · rep 10
      idea: 'The longest board in the first half that is still one idea.',
      note: 'The halfway finale is not the biggest board — it is whichever board scored ' +
            'highest on the thing this game is actually about, with length used only to ' +
            'break ties between boards that were already good.',
      board: ['#aA.',
              'B.b.',
              '..#.',
              '.#AB']
    },
    {
      id: 36, name: 'WRONG', par: 7,
      // par 7 · unlock 2/flow 5 · insight 3/7 · blind 3 · traps 3/4 · retreat 3 · ways 1 · states 27 · jam 19% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 8.8 · ins 9.6 · sur 10 · pre 7.9 · ele 6.8 · den 3.4 · fai 7.3 · sat 8.4 · rep 8.3
      idea: 'A block sitting in the wrong socket is the best wall on the board, and it is ' +
            'free.',
      note: 'SORT showed a block coming to rest in a socket that refuses it. This board ' +
            'requires that twice on the shortest line: a socket in open floor is the one ' +
            'place the terrain lets you leave a block standing exactly where you want it, ' +
            'and only the wrong colour can use it.',
      board: ['aA.b',
              '....',
              '##BA']
    },
    {
      id: 37, name: 'QUEUE', par: 11,
      // par 11 · unlock 1/flow 10 · insight 1/11 · blind 3 · traps 3/4 · retreat 1 · ways 2 · states 86 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 10 · sur 6 · pre 5.2 · ele 9.8 · den 9.2 · fai 10 · sat 5.5 · rep 9.7
      idea: 'Three blocks, three sockets, and exactly one order that works.',
      note: 'Nothing on this board is hard to reach. Every block can be banked in two or ' +
            'three tilts if you ignore the others, and every order except one leaves ' +
            'something with nothing behind it.',
      board: ['.#.A',
              'Bab.',
              '..#B']
    },
    {
      id: 38, name: 'TANDEM', par: 7,
      // par 7 · unlock 2/flow 5 · insight 4/7 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 75 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 9.6 · sur 8.2 · pre 6.9 · ele 6.8 · den 8.2 · fai 10 · sat 10 · rep 8.3
      idea: 'One tilt, two colours, two sockets, both taken.',
      note: 'The payoff board of the colour chapter. Two different colours have to arrive ' +
            'on two different sockets in the same tilt, which means the whole board is ' +
            'arranged before anything at all is banked.',
      board: ['a.#A',
              '.Bb.',
              '.#A.']
    },
    {
      id: 39, name: 'PATIENCE', par: 13,
      // par 13 · unlock 3/flow 10 · insight 3/13 · blind 2 · traps 2/4 · retreat 4 · ways 4 · states 154 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 9 · ins 6.2 · sur 6.3 · pre 8.5 · ele 10 · den 9.6 · fai 10 · sat 6 · rep 9
      idea: 'Nothing at all is banked for the first four tilts, and every one of them ' +
            'matters.',
      note: 'The longest setup in the first half of the game. A player who measures ' +
            'progress by the counter will abandon this board; a player who measures it by ' +
            'where the blocks are standing will not.',
      board: ['a#..',
              'BA..',
              'B.Ab']
    },
    {
      id: 40, name: 'FOUR', par: 18,
      // par 18 · unlock 3/flow 15 · insight 6/18 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 148 · jam 15% · loss 0% · luck 0.0%
      // scores  cla 5.8 · dis 10 · ins 6.5 · sur 8.2 · pre 5.1 · ele 10 · den 10 · fai 7.9 · sat 5.5 · rep 10
      idea: 'Two colours, two blocks each, sixteen cells, and one line through all of it.',
      note: 'The largest colour board in the game. Four blocks under the two-per-colour ' +
            'cap on sixteen cells is the deepest thing the ALL IN win condition reaches ' +
            'anywhere, and everything after this stage changes what DONE means rather ' +
            'than adding material.',
      board: ['#.AA',
              'aB#b',
              'B.#.']
    },

    // ── CHAPTER 5 · TOGETHER · 結  (stages 41–50) ─────────────────────────────────────
    // No holes at all: blocks of one colour have to end up touching. One gravity moves both of them, so almost every way of closing a gap opens it again somewhere else.
    {
      id: 41, name: 'MEET', par: 4,
      win: 'match',
      // MATCH · par 4 · unlock 1/flow 3 · insight 1/4 · blind 1 · traps 3/4 · retreat 0 · ways 2 · states 19 · jam 0% · loss 0% · luck 0.8%
      // scores  cla 7.8 · dis 8.5 · ins 8.8 · sur 1.7 · pre 5.8 · ele 5.7 · den 2.8 · fai 9.5 · sat 3.3 · rep 5.2
      idea: 'There are no holes. Two blocks of a colour just have to end up touching.',
      note: 'A board with nothing on it but two pairs and a wall, so the new goal ' +
            'explains itself the first time a tilt slams two of the same colour together. ' +
            'The trap is already here in miniature: the tilt that joins one pair splits ' +
            'the other.',
      hint: { ja: '同じ色どうしをくっつける', en: 'Join each colour to its twin' },
      board: ['#AB',
              '..A',
              '.B.']
    },
    {
      id: 42, name: 'APART', par: 6,
      win: 'match',
      // MATCH · par 6 · unlock 1/flow 5 · insight 2/6 · blind 2 · traps 2/3 · retreat 3 · ways 1 · states 170 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 9 · ins 9.6 · sur 6.3 · pre 6.8 · ele 7.8 · den 7.9 · fai 10 · sat 4.2 · rep 6.9
      idea: 'One gravity moves both of them, so the way to bring two blocks together is ' +
            'to drive them apart first.',
      note: 'The heart of MATCH. Two blocks in the same row chase each other forever: ' +
            'tilt toward one another and they both go, tilt the other way and they both ' +
            'come back. The only way to close a gap is to get something in the way of one ' +
            'of them, which means moving the pair you were not thinking about.',
      board: ['A.B.',
              '.#A.',
              '..B.']
    },
    {
      id: 43, name: 'WEDGE', par: 8,
      win: 'match',
      // MATCH · par 8 · unlock 1/flow 7 · insight 1/8 · blind 3 · traps 3/4 · retreat 0 · ways 1 · states 1921 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.3 · dis 10 · ins 10 · sur 7.5 · pre 7.5 · ele 6.8 · den 8.4 · fai 10 · sat 5.6 · rep 8.6
      idea: 'The wall between two blocks is the other pair — and you can move it.',
      note: 'Nothing in this game separates two blocks except something standing between ' +
            'them, and on a MATCH board the only movable somethings are the other ' +
            'colours. This board cannot be solved without using one pair as scaffolding ' +
            'for the other.',
      board: ['#.AB',
              'AC.#',
              'CB..']
    },
    {
      id: 44, name: 'BREAK', par: 10,
      win: 'match',
      // MATCH · par 10 · unlock 4/flow 6 · insight 3/10 · blind 3 · traps 3/4 · retreat 3 · ways 6 · states 4741 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 6 · sur 8 · pre 7.6 · ele 9.1 · den 8.9 · fai 10 · sat 7.4 · rep 6.8
      idea: 'A pair you already joined comes apart the moment you tilt for the next one.',
      note: 'MATCH has no bank. Nothing is ever put away, so every pair you close stays ' +
            'on the board being pushed around by every subsequent tilt — and the winning ' +
            'position is the one where all of them are together AT THE SAME TIME. The ' +
            'last tilt has to close the final pair without opening any of the others.',
      board: ['ABA.',
              '.#.C',
              'CB..']
    },
    {
      id: 45, name: 'TOGETHER', par: 22,
      win: 'match',
      // MATCH · par 22 · unlock 20/flow 2 · insight 14/22 · blind 2 · traps 2/3 · retreat 6 · ways 1 · states 46 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.3 · dis 8.5 · ins 5.2 · sur 8.8 · pre 6.8 · ele 10 · den 7.2 · fai 10 · sat 5.6 · rep 9
      idea: 'Three pairs, one gravity, and exactly one arrangement where all of them are ' +
            'touching at once.',
      note: 'Chapter five\'s finale and the longest MATCH board the sweep found that is ' +
            'still fair. Every pair is somebody else\'s obstacle, and the solution is a ' +
            'single sequence in which each of them is assembled in the only order that ' +
            'does not destroy the others.',
      board: ['#A.A',
              '#B.C',
              'CB..']
    },
    {
      id: 46, name: 'CROSSING', par: 6,
      win: 'match',
      // MATCH · par 6 · unlock 1/flow 5 · insight 4/6 · blind 3 · traps 3/4 · retreat 2 · ways 2 · states 155 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 10 · ins 9.6 · sur 9.5 · pre 6.8 · ele 6.8 · den 7.9 · fai 10 · sat 4.2 · rep 7.9
      idea: 'The two pairs are in each other\'s way in both directions at once.',
      note: 'One pair sharing a row and one sharing a column, so no single tilt can be ' +
            'right for both — and the answer is a tilt that is right for neither, which ' +
            'puts something between one pair so the next tilt only moves the other.',
      board: ['A#A.',
              '.#..',
              'B..B']
    },
    {
      id: 47, name: 'THIRD', par: 9,
      win: 'match',
      // MATCH · par 9 · unlock 4/flow 5 · insight 3/9 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 2667 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 5.6 · sur 8.5 · pre 9.8 · ele 8.3 · den 8.7 · fai 10 · sat 6.2 · rep 9
      idea: 'The third colour is not a third puzzle. It is the tool the first two needed.',
      note: 'With two colours the only thing that can separate a pair is the other pair, ' +
            'and it is usually busy. A third pair is the first spare part the chapter ' +
            'gets — and this board is built so it is not spare at all.',
      board: ['.#..',
              '.ABA',
              'CBC.']
    },
    {
      id: 48, name: 'ADRIFT', par: 10,
      win: 'match',
      // MATCH · par 10 · unlock 4/flow 6 · insight 4/10 · blind 3 · traps 3/4 · retreat 3 · ways 1 · states 2395 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.3 · dis 10 · ins 6 · sur 10 · pre 5.9 · ele 8.1 · den 8.9 · fai 10 · sat 5.1 · rep 9.3
      idea: 'A pair that starts one cell apart and cannot be closed for another eight ' +
            'tilts.',
      note: 'The cruellest picture the chapter can draw. Everything about the board says ' +
            'the answer is one tilt away, and the gap is the one thing on the board that ' +
            'a tilt cannot change until something is standing in the right place.',
      board: ['#.A.',
              'BB..',
              'C#AC']
    },
    {
      id: 49, name: 'ORBIT', par: 17,
      win: 'match',
      // MATCH · par 17 · unlock 15/flow 2 · insight 11/17 · blind 3 · traps 3/4 · retreat 6 · ways 2 · states 98 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 5.1 · sur 8 · pre 6.5 · ele 10 · den 9.8 · fai 10 · sat 3.4 · rep 10
      idea: 'A block has to go all the way round the board to arrive next to where it ' +
            'began.',
      note: 'Under one gravity the short way between two blocks is usually shut, and the ' +
            'way that is open is the long one. This board is the extreme case: the ' +
            'shortest line takes a block around three sides of the board to end up ' +
            'adjacent to its twin.',
      board: ['AB#..',
              'A#.B.',
              '.....']
    },
    {
      id: 50, name: 'KNOT', par: 18,
      win: 'match',
      // MATCH · par 18 · unlock 17/flow 1 · insight 9/18 · blind 3 · traps 3/4 · retreat 4 · ways 1 · states 795 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 6.2 · sur 10 · pre 6.6 · ele 10 · den 10 · fai 10 · sat 6.2 · rep 10
      idea: 'Three pairs that can only be assembled in one order, and the order is not ' +
            'visible.',
      note: 'Every pair is somebody else\'s obstacle and every obstacle is somebody ' +
            'else\'s pair. It is the densest MATCH board that still has one clean line ' +
            'through it.',
      board: ['#A.B',
              '.CC.',
              '.AB.']
    },

    // ── CHAPTER 6 · CHOSEN · 選  (stages 51–60) ───────────────────────────────────────
    // Only the marked blocks have to get home; the rest can never leave and are drawn dimmed to say so. You cannot move one block — you move the world, and everything answers.
    {
      id: 51, name: 'ONLY', par: 4,
      win: 'select',
      // SELECT · par 4 · unlock 2/flow 2 · insight 2/4 · blind 1 · traps 3/4 · retreat 1 · ways 1 · states 26 · jam 0% · loss 0% · luck 0.4%
      // scores  cla 7.8 · dis 8.7 · ins 8.3 · sur 2.7 · pre 4.5 · ele 6.8 · den 3.8 · fai 9.8 · sat 3.9 · rep 5.2
      idea: 'Only the blocks with a matching socket have to go home. The rest are ' +
            'furniture that moves.',
      note: 'SELECT arrives on the smallest board that can state it: one block with a ' +
            'socket, one without. The one without is drawn dimmed and hollow, so which ' +
            'blocks are cargo and which are scenery is something the player reads off the ' +
            'board rather than off a sentence. It still slides, and it still stops ' +
            'things.',
      hint: { ja: '光っているブロックだけ帰ればいい', en: 'Only the lit blocks have to get home' },
      board: ['a#A',
              '...',
              '.B.']
    },
    {
      id: 52, name: 'INERT', par: 8,
      win: 'select',
      // SELECT · par 8 · unlock 2/flow 6 · insight 4/8 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 51 · jam 8% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 9.7 · ins 10 · sur 7 · pre 6.1 · ele 8.6 · den 6.2 · fai 8.9 · sat 4.6 · rep 8.6
      idea: 'The block that can never leave is the best wall you have.',
      note: 'Under ALL IN every block is spent eventually, so a backstop is temporary by ' +
            'definition. A block with no socket is permanent — it is the only thing in ' +
            'TILT that can be relied on to still be there at the end — and this board is ' +
            'built so the only way to stop the cargo on its socket is to put the ' +
            'furniture behind it.',
      board: ['.a..',
              '##.A',
              'AB..']
    },
    {
      id: 53, name: 'THROUGH2', par: 11,
      win: 'select',
      // SELECT · par 11 · unlock 2/flow 9 · insight 2/11 · blind 3 · traps 3/4 · retreat 3 · ways 1 · states 198 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 10 · ins 10 · sur 9.2 · pre 7.2 · ele 10 · den 9.2 · fai 10 · sat 7.5 · rep 9.7
      idea: 'You cannot move one block. You move the world, and everything answers.',
      note: 'The tilt that takes the cargo where it needs to go also takes three other ' +
            'blocks somewhere, and one of those somewheres is in the way. The puzzle is ' +
            'not the route: it is the side effects of the route.',
      board: ['aB..',
              '.B#A',
              '.A..']
    },
    {
      id: 54, name: 'CLEAR', par: 20,
      win: 'select',
      // SELECT · par 20 · unlock 17/flow 3 · insight 11/20 · blind 3 · traps 3/4 · retreat 4 · ways 2 · states 101 · jam 25% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 6.2 · sur 8 · pre 7.7 · ele 10 · den 10 · fai 6.5 · sat 4.3 · rep 10
      idea: 'The furniture is in the way, and the only way to move it is to move ' +
            'everything.',
      note: 'A board where the cargo is one tilt from home from the very first frame, and ' +
            'that tilt is illegal for another eight moves because of what is standing ' +
            'where. Every move on the shortest line is a move made for a block that will ' +
            'never leave.',
      board: ['.#.A',
              '.a#.',
              'AB.B']
    },
    {
      id: 55, name: 'CHOSEN', par: 26,
      win: 'select',
      // SELECT · par 26 · unlock 21/flow 5 · insight 13/26 · blind 3 · traps 3/4 · retreat 4 · ways 3 · states 2181 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.8 · dis 10 · ins 6.7 · sur 8 · pre 8 · ele 10 · den 10 · fai 10 · sat 4.7 · rep 10
      idea: 'One block. Twenty tilts. Everything else on the board is the obstacle.',
      note: 'Chapter six\'s finale. Two colours of furniture and one colour of cargo, and ' +
            'the shortest way home is around twenty tilts — not because the board is big, ' +
            'but because every tilt that moves the cargo also moves everything that could ' +
            'stop it.',
      board: ['BB#.',
              'aC#A',
              '.AC.']
    },
    {
      id: 56, name: 'CARGO', par: 12,
      win: 'select',
      // SELECT · par 12 · unlock 3/flow 9 · insight 7/12 · blind 2 · traps 3/4 · retreat 4 · ways 2 · states 239 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 10 · ins 4.3 · sur 7.5 · pre 6.8 · ele 10 · den 9.4 · fai 10 · sat 6 · rep 9
      idea: 'The marked block never moves the way you want. Everything else does.',
      note: 'Every tilt that would take the cargo somewhere useful is blocked, and every ' +
            'tilt that is legal takes it somewhere else. The route exists — it is made ' +
            'entirely out of the positions the furniture is left in.',
      board: ['.a.B',
              'B##.',
              '.A.A']
    },
    {
      id: 57, name: 'DOOR', par: 9,
      win: 'select',
      // SELECT · par 9 · unlock 1/flow 8 · insight 3/9 · blind 3 · traps 3/4 · retreat 1 · ways 1 · states 90 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 10 · ins 10 · sur 6 · pre 6 · ele 9.5 · den 8.7 · fai 10 · sat 5.5 · rep 9
      idea: 'The socket takes you from one direction only, and something is always ' +
            'standing in it.',
      note: 'A socket with a backstop on exactly one side, and a piece of furniture that ' +
            'keeps arriving in the way of that approach. The puzzle is not the last tilt, ' +
            'it is arranging for the last tilt to be legal.',
      board: ['.#..',
              'a#AA',
              '.B..']
    },
    {
      id: 58, name: 'BALLAST', par: 17,
      win: 'select',
      // SELECT · par 17 · unlock 15/flow 2 · insight 7/17 · blind 2 · traps 3/4 · retreat 8 · ways 1 · states 63 · jam 15% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 10 · ins 6.2 · sur 6.3 · pre 9.8 · ele 10 · den 9 · fai 8 · sat 4.9 · rep 9
      idea: 'The furniture has to be moved out of the way and then put back.',
      note: 'A block with no socket is permanent, which cuts both ways: it is the only ' +
            'reliable backstop in the game and it is the only obstacle that never ' +
            'disappears. Here the same piece is both, in that order, and it has to make ' +
            'the return journey.',
      board: ['aB.#',
              '.AA.',
              '.B..']
    },
    {
      id: 59, name: 'TWO OF', par: 23,
      win: 'select',
      // SELECT · par 23 · unlock 13/flow 10 · insight 7/23 · blind 3 · traps 3/4 · retreat 5 · ways 1 · states 2612 · jam 15% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 7.4 · sur 9.2 · pre 8.3 · ele 10 · den 10 · fai 7.9 · sat 7.5 · rep 10
      idea: 'Two blocks have sockets and two do not, and the two that do cannot both go ' +
            'first.',
      note: 'Every SELECT board so far has had one thing to deliver. With two, the first ' +
            'delivery removes a block from the board — which is fine until you notice ' +
            'that the block being removed was the backstop the second one needed.',
      board: ['BaC.',
              '##AB',
              'AbC.']
    },
    {
      id: 60, name: 'PICKED', par: 28,
      win: 'select',
      // SELECT · par 28 · unlock 24/flow 4 · insight 13/28 · blind 3 · traps 3/4 · retreat 5 · ways 1 · states 347 · jam 10% · loss 0% · luck 0.0%
      // scores  cla 5.8 · dis 10 · ins 7.1 · sur 8 · pre 9.5 · ele 10 · den 10 · fai 8.5 · sat 5.8 · rep 10
      idea: 'One block home, and every other block on the board spent getting it there.',
      note: 'The chapter\'s hardest single-cargo board. Nothing is collected until the ' +
            'very last tilt and every move before it is made on behalf of something that ' +
            'is never going anywhere.',
      board: ['BaBA',
              'C...',
              '##CA']
    },

    // ── CHAPTER 7 · SHAPE · 形  (stages 61–70) ────────────────────────────────────────
    // The marks are standing spots, not holes. Nothing is banked, every mark has to be covered at the same moment, and every block placed is a new wall in the way of the next.
    {
      id: 61, name: 'PLACE', par: 3,
      win: 'form',
      // FORM · par 3 · unlock 2/flow 1 · insight 2/3 · blind 2 · traps 3/4 · retreat 1 · ways 1 · states 10 · jam 0% · loss 0% · luck 1.6%
      // scores  cla 7.8 · dis 8.1 · ins 7.9 · sur 6.8 · pre 3.5 · ele 4.6 · den 1.2 · fai 9.1 · sat 6.2 · rep 5.9
      idea: 'These marks are not holes. They are cells you have to be standing on when ' +
            'the board settles.',
      note: 'FORM opens with the smallest possible statement of it: two marks, two ' +
            'blocks, and one tilt that puts both where they belong. The marks are drawn ' +
            'as brackets on the floor rather than as sunken sockets, so the difference ' +
            'from a goal is visible before it is explained.',
      hint: { ja: '印の上に全部そろえて止める', en: 'Fill every marked cell at once' },
      board: ['oo#',
              '@..',
              '..@']
    },
    {
      id: 62, name: 'AT ONCE', par: 7,
      win: 'form',
      // FORM · par 7 · unlock 1/flow 6 · insight 1/7 · blind 2 · traps 3/4 · retreat 3 · ways 1 · states 21 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 8.6 · ins 10 · sur 6.3 · pre 3.1 · ele 6.8 · den 2.7 · fai 10 · sat 4.6 · rep 7.3
      idea: 'Every mark has to be covered at the same moment. Filling them one at a time ' +
            'is not progress.',
      note: 'The difference between FORM and everything before it. Under ALL IN a ' +
            'collected block is banked and safe; here nothing is banked, so a block ' +
            'sitting perfectly on its mark is going to be dragged off it by the very next ' +
            'tilt unless something is holding it there.',
      board: ['o...',
              'o##@',
              '#.@.']
    },
    {
      id: 63, name: 'ANCHOR', par: 7,
      win: 'form',
      // FORM · par 7 · unlock 1/flow 6 · insight 1/7 · blind 3 · traps 3/4 · retreat 2 · ways 1 · states 24 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 7.3 · dis 8.7 · ins 10 · sur 8.2 · pre 3.2 · ele 7.7 · den 3.1 · fai 10 · sat 4.6 · rep 8.3
      idea: 'A block that is already in place is a wall — and walls are how you place the ' +
            'next one.',
      note: 'The compensation for nothing being banked: a block on its mark is still on ' +
            'the board, and it stops everything else. On this shape the second block can ' +
            'only be held where it needs to be by the first one, so the order is forced ' +
            'and the reason is visible.',
      board: ['oo#@',
              '.#..',
              '..@.']
    },
    {
      id: 64, name: 'PATTERN', par: 16,
      win: 'form',
      // FORM · par 16 · unlock 14/flow 2 · insight 7/16 · blind 3 · traps 3/4 · retreat 8 · ways 2 · states 54 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 9.8 · ins 5.9 · sur 10 · pre 6.1 · ele 10 · den 8.1 · fai 10 · sat 6.1 · rep 10
      idea: 'The shape names colours as well as cells: the right block has to be on the ' +
            'right mark.',
      note: 'FORM and colour together, which is the only pairing in the game where two ' +
            'rules make ONE question instead of two: "which cells" and "which blocks" are ' +
            'the same sentence. A mark that names a colour will not accept anything else, ' +
            'so the shape is a picture rather than a count.',
      board: ['a.#a',
              'bBA.',
              '..A.']
    },
    {
      id: 65, name: 'SHAPE', par: 24,
      win: 'form',
      // FORM · par 24 · unlock 23/flow 1 · insight 13/24 · blind 3 · traps 3/4 · retreat 6 · ways 1 · states 75 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.8 · dis 10 · ins 6.3 · sur 10 · pre 5.1 · ele 10 · den 10 · fai 10 · sat 5.7 · rep 10
      idea: 'Three marks, three colours, and one arrangement of the board that satisfies ' +
            'all of them.',
      note: 'Chapter seven\'s finale. Every block is load-bearing twice over — as a piece ' +
            'of the shape and as the wall that holds another piece of it — and the last ' +
            'tilt has to land the final block without shifting any of the ones already ' +
            'home.',
      board: ['a#AB',
              '.a#.',
              'A.bB']
    },
    {
      id: 66, name: 'ROW', par: 10,
      win: 'form',
      // FORM · par 10 · unlock 1/flow 9 · insight 3/10 · blind 2 · traps 2/3 · retreat 2 · ways 1 · states 98 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.8 · dis 9 · ins 10 · sur 6.5 · pre 2.6 · ele 7.4 · den 8.9 · fai 10 · sat 5.5 · rep 8.3
      idea: 'A shape in a straight line, which is the hardest shape to hold under one ' +
            'gravity.',
      note: 'A line of marks along one axis is the shape most easily destroyed by the ' +
            'next tilt, because every block in it answers that tilt the same way. Holding ' +
            'it requires the line to be built against something.',
      board: ['o#@.',
              'o#@C',
              'o..#']
    },
    {
      id: 67, name: 'LAST', par: 15,
      win: 'form',
      // FORM · par 15 · unlock 14/flow 1 · insight 10/15 · blind 3 · traps 3/4 · retreat 6 · ways 2 · states 49 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 6.8 · dis 9.6 · ins 4.9 · sur 10 · pre 6 · ele 10 · den 7.6 · fai 10 · sat 8.9 · rep 10
      idea: 'The final block has to land without moving any of the ones already placed.',
      note: 'Nothing is banked on a FORM board, so the last tilt is a constraint rather ' +
            'than a formality: it has to be a direction in which every block already home ' +
            'is already against something.',
      board: ['a#a.',
              'Ab.B',
              'A...']
    },
    {
      id: 68, name: 'SPARE', par: 20,
      win: 'form',
      // FORM · par 20 · unlock 13/flow 7 · insight 8/20 · blind 3 · traps 3/4 · retreat 4 · ways 1 · states 1381 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 4.8 · dis 10 · ins 6.8 · sur 10 · pre 7.7 · ele 10 · den 10 · fai 10 · sat 9.3 · rep 10
      idea: 'The block that is not part of the shape is the only reason the shape can be ' +
            'built.',
      note: 'The measured heart of FORM: the sweep says a shape that uses every block on ' +
            'the board is shallow, and one with a piece left over is deep. This board is ' +
            'that result made playable — the spare block is the wall that holds every ' +
            'other one in place.',
      board: ['Bab#',
              'a#CA',
              'B.bA']
    },
    {
      id: 69, name: 'SCATTER', par: 24,
      win: 'form',
      // FORM · par 24 · unlock 19/flow 5 · insight 11/24 · blind 3 · traps 3/4 · retreat 9 · ways 1 · states 475 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 7.2 · sur 10 · pre 8.1 · ele 10 · den 10 · fai 10 · sat 8.4 · rep 10
      idea: 'Marks in four corners of the board, all to be covered at the same moment.',
      note: 'The hardest kind of shape to hold: cells far enough apart that no single ' +
            'tilt ever brings two blocks toward two of them. Every mark is satisfied ' +
            'separately, and every one that is satisfied makes the next harder.',
      board: ['aCAA',
              'b.B.',
              '#abB']
    },
    {
      id: 70, name: 'BUILT', par: 32,
      win: 'form',
      // FORM · par 32 · unlock 31/flow 1 · insight 15/32 · blind 3 · traps 3/4 · retreat 13 · ways 1 · states 483 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 7.1 · sur 10 · pre 7.8 · ele 10 · den 10 · fai 10 · sat 8.9 · rep 10
      idea: 'A picture with four cells and four colours, and one arrangement of the board ' +
            'that is it.',
      note: 'The hardest coloured shape the sweep found that is still fair. Knowing ' +
            'exactly what the finished board looks like changes nothing, which is the ' +
            'clearest demonstration in the game that the difficulty here was never about ' +
            'knowing where to go.',
      board: ['CabA',
              'abBB',
              '#..A']
    },

    // ── CHAPTER 8 · ABYSS · 深淵  (stages 71–80) ────────────────────────────────────────
    // The rules that were kept apart all game, together, and the only chapter where length is the target. Thirty tilts at the shallow end. Nothing here is a moment of insight — it is an afternoon.
    {
      id: 71, name: 'DESCENT', par: 35,
      win: 'select',
      // SELECT · par 35 · unlock 33/flow 2 · insight 16/35 · blind 3 · traps 3/4 · retreat 12 · ways 3 · states 2287 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 7.2 · sur 9.2 · pre 7.8 · ele 10 · den 10 · fai 10 · sat 4.9 · rep 10
      idea: 'Everything you have learned, on one board, for thirty tilts.',
      note: 'The gate to the last chapter, and the gentlest thing in it. Three colours, ' +
            'one destination, and a shortest solution around thirty tilts — of which most ' +
            'follow once you have seen the handful that do not.',
      board: ['a#Ab',
              'B#CC',
              '..BA']
    },
    {
      id: 72, name: 'WARREN', par: 42,
      win: 'select',
      // SELECT · par 42 · unlock 36/flow 6 · insight 24/42 · blind 3 · traps 3/4 · retreat 11 · ways 2 · states 2308 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 5.9 · sur 9.2 · pre 7.7 · ele 10 · den 10 · fai 10 · sat 4.6 · rep 10
      idea: 'Twelve cells, six blocks and nowhere at all to put anything.',
      note: 'The density argument taken to its conclusion. Half the board is blocks, so ' +
            'the walls barely matter — the maze is made of the pieces, and it rearranges ' +
            'itself every time you touch it.',
      board: ['a#.A',
              'B#Ab',
              'B.CC']
    },
    {
      id: 73, name: 'MIRE', par: 49,
      win: 'form',
      // FORM · par 49 · unlock 48/flow 1 · insight 29/49 · blind 3 · traps 3/4 · retreat 18 · ways 1 · states 488 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 5.7 · sur 10 · pre 9.1 · ele 10 · den 10 · fai 10 · sat 8.9 · rep 10
      idea: 'A shape to build, in a room too full to build it in.',
      note: 'FORM at the far end of its range. There is no mystery about the target — it ' +
            'is drawn on the floor — and that changes nothing, because the difficulty was ' +
            'never about knowing where to go.',
      board: ['#aCB',
              'bb..',
              'BaAA']
    },
    {
      id: 74, name: 'GAUNTLET', par: 48,
      win: 'select',
      // SELECT · par 48 · unlock 46/flow 2 · insight 24/48 · blind 1 · traps 3/4 · retreat 15 · ways 1 · states 168 · jam 32% · loss 22% · luck 0.0%
      // scores  cla 2.6 · dis 10 · ins 6.7 · sur 7.2 · pre 8.1 · ele 10 · den 10 · fai 3.5 · sat 4.9 · rep 8
      idea: 'The rules that were kept apart all game, on one board, on purpose.',
      note: 'The one place the campaign spends the result it spent the rest of the game ' +
            'obeying. Every measurement said a board using two devices at once is harder ' +
            'to read and less fair than the better of the two alone — and that is a ' +
            'reason to keep them apart in a teaching chapter, not a reason to pretend the ' +
            'combination does not exist. Here it is, once, at the end, where the player ' +
            'has the vocabulary for it.',
      board: ['aCB.',
              '##CB',
              'AxAb']
    },
    {
      id: 75, name: 'CRUCIBLE', par: 34,
      win: 'select',
      // SELECT · par 34 · unlock 34/flow 0 · insight 19/34 · blind 3 · traps 3/4 · retreat 13 · ways 6 · states 2245 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 6.1 · sur 9.2 · pre 7.8 · ele 10 · den 10 · fai 10 · sat 6 · rep 7.5
      idea: 'The gentlest board in the last chapter is still thirty tilts long.',
      note: 'Chapter eight opens twice: DESCENT is the shortest thing in it and this is ' +
            'the second, so the player crosses the thirty-tilt line before anything asks ' +
            'them to hold forty. Same six blocks, same twelve cells, one fewer idea to ' +
            'find.',
      board: ['a#bC',
              'B#.C',
              'BAA.']
    },
    {
      id: 76, name: 'THICKET', par: 45,
      win: 'form',
      // FORM · par 45 · unlock 44/flow 1 · insight 26/45 · blind 3 · traps 3/4 · retreat 15 · ways 2 · states 486 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 5.9 · sur 10 · pre 8.4 · ele 10 · den 10 · fai 10 · sat 8.9 · rep 10
      idea: 'Four marks, five blocks, and the fifth one is in the way of all four.',
      note: 'FORM is deep because of the block that is NOT in the shape — the sweep says ' +
            'a shape using every block on the board is shallow and one with a piece left ' +
            'over is not. This is that result at the end of its range: the spare block is ' +
            'both the only thing that can hold the shape together and the only thing ' +
            'standing where the shape goes. This slot was going to be a long MATCH ' +
            'board — the one win condition chapter eight otherwise never uses. It is ' +
            'not, ' +
            'because MATCH does not survive the length. Every board in that space past ' +
            'par 22 measures jam 61% and guided 31%: unwinnable from most of its own ' +
            'positions, and a fight at almost every tilt. Nothing is ever banked on a ' +
            'MATCH board, so a long one is not a long puzzle, it is a short puzzle that ' +
            'keeps coming undone.',
      board: ['Aab.',
              'abAB',
              'C.B#']
    },
    {
      id: 77, name: 'LATTICE', par: 38,
      win: 'form',
      // FORM · par 38 · unlock 37/flow 1 · insight 22/38 · blind 3 · traps 3/4 · retreat 17 · ways 2 · states 481 · jam 0% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 5.9 · sur 10 · pre 7.6 · ele 10 · den 10 · fai 10 · sat 8.9 · rep 10
      idea: 'A shape to build, at the length of a route.',
      note: 'FORM in the middle of its range, where the target is visible from the first ' +
            'frame and stays exactly as far away for the first twenty tilts. The progress ' +
            'is real and none of it shows.',
      board: ['abbB',
              'AaC.',
              'BA.#']
    },
    {
      id: 78, name: 'SIEVE', par: 46,
      win: 'select',
      // SELECT · par 46 · unlock 42/flow 4 · insight 26/46 · blind 3 · traps 3/4 · retreat 14 · ways 8 · states 340 · jam 30% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 6 · sur 8 · pre 7.6 · ele 10 · den 10 · fai 5.7 · sat 3.8 · rep 7.5
      idea: 'Two deliveries, forty tilts, and the first one is what makes the second ' +
            'hard.',
      note: 'A collection is irreversible: the block is gone and whatever it was holding ' +
            'up is not held up any more. On a board this long that is a decision made ' +
            'half an hour before its consequence.',
      board: ['BaCC',
              '.#Ab',
              'BA#.']
    },
    {
      id: 79, name: 'VAULT', par: 52,
      win: 'select',
      // SELECT · par 52 · unlock 48/flow 4 · insight 23/52 · blind 3 · traps 3/4 · retreat 16 · ways 2 · states 411 · jam 33% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 7.4 · sur 10 · pre 7.3 · ele 10 · den 10 · fai 5.4 · sat 4.3 · rep 10
      idea: 'Fifty tilts, one of which is wrong in a way you will not find out about for ' +
            'twenty more.',
      note: 'Past fifty tilts the board stops being something held in the head. This is ' +
            'the point in the campaign where writing the line down is a reasonable thing ' +
            'to do, and the automatic rewind is the only reason that is a puzzle rather ' +
            'than a punishment.',
      board: ['aB#A',
              'C#bB',
              '.C.A']
    },
    {
      id: 80, name: 'ABYSS', par: 57,
      win: 'select',
      // SELECT · par 57 · unlock 50/flow 7 · insight 28/57 · blind 3 · traps 3/4 · retreat 16 · ways 2 · states 461 · jam 28% · loss 0% · luck 0.0%
      // scores  cla 5.3 · dis 10 · ins 6.8 · sur 9.2 · pre 7.4 · ele 10 · den 10 · fai 6.1 · sat 5.6 · rep 10
      idea: 'The longest board in TILT that a person could actually solve.',
      note: 'The end of the game, and the only board in it chosen for its length. It is ' +
            'the deepest position the exhaustive sweep of twelve cells could find that ' +
            'still passes every fairness test the rest of the campaign is held to: ' +
            'nothing is won by luck, no piece is dead weight, and the moves that matter ' +
            'are outnumbered by the moves that follow from them.',
      board: ['aB#A',
              'C#BA',
              '.bC.']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
