'use strict';
/*
 * TILT — stage data.  GENERATED FILE — do not edit by hand.
 *
 * Source of truth: tools/campaign.js  (rebuild with `npm run campaign`)
 *
 * One board, one picture, four characters:
 *
 *     '.'  floor        '#'  wall
 *     'o'  goal         '@'  block
 *
 * There is nothing else. Every block is identical, no cell is forbidden, and no stage
 * anywhere in this file introduces a rule that stage 1 did not already have.
 *
 * Every `par` below is a breadth-first-proven shortest solution, and every wall, block
 * and goal survived deletion testing: remove any one of them and the puzzle measurably
 * changes. Verified by tools/audit.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CHAPTERS = [
    { number: 1, name: 'AWAKEN', from: 1, to: 10,
      note: 'Gravity, walls, and blocks that get in each other\'s way. Everything the game is made of, one idea at a time.' },
    { number: 2, name: 'NINE', from: 11, to: 20,
      note: 'Nine cells, and nothing else will be added. Proof that a 3×3 board already holds ten moves of thinking if the walls are in the right places.' },
    { number: 3, name: 'TWELVE', from: 21, to: 30,
      note: 'Three cells wider. The extra room is not a kindness — it is where the long way round lives.' },
    { number: 4, name: 'SIXTEEN', from: 31, to: 40,
      note: 'The board doubles. Same three things on it, twice as much room for them to be in the wrong place.' },
    { number: 5, name: 'ORDER', from: 41, to: 50,
      note: 'Chapter of the wrong first move. Every board here has a block that cannot go anywhere until a different block has been dealt with first, and finding out which is the whole puzzle.' },
    { number: 6, name: 'TWENTY', from: 51, to: 60,
      note: 'Twenty cells. Long enough that the route stops being visible and has to be worked out one consequence at a time.' },
    { number: 7, name: 'TRAFFIC', from: 61, to: 70,
      note: 'Four blocks sharing one exit. They are identical, so it does not matter which goes first — except that it does, because each one is the wall the next has to work around.' },
    { number: 8, name: 'LATTICE', from: 71, to: 80,
      note: 'Twenty-five cells and about six walls. Almost the whole board is empty, and that is the trick: with nothing to stop them, blocks travel too far, and the walls you do have are the only brakes you own.' },
    { number: 9, name: 'DEPTH', from: 81, to: 90,
      note: 'Twenty-plus tilts on a board of a dozen things. Every stage in this chapter looks like it should take four moves, and none of them do.' },
    { number: 10, name: 'TILT', from: 91, to: 100,
      note: 'Thirty cells, four blocks, one goal, and twenty-five moves. Nothing here that was not in stage one — the same gravity, the same walls, the same blocks. Only the folding is deeper.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · AWAKEN  (stages 1–10, par 2–7) ───────────────────────────────────────
    // Gravity, walls, and blocks that get in each other's way. Everything the game is made of, one idea at a time.
    {
      id: 1, name: 'DROP', par: 2,   // ways 2 · luck 12.50% · 4 states · 2 pieces · 1 set-up tilts
      note: 'Gravity exists and it answers to you. One block, one goal, nothing to be afraid of.',
      hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
      board: ['@..',
              '...',
              '..o']
    },
    {
      id: 2, name: 'TWO', par: 2,   // ways 1 · luck 6.25% · 9 states · 3 pieces · 1 set-up tilts · chain ×2
      note: 'A second block. The goal takes any block — so the last tilt sends both home at once, and ' +
            'that is the first chain you will ever see.',
      hint: { ja: 'ブロックはすべて同じ。ゴールはどれでも受け取る', en: 'Every block is the same' },
      board: ['@..',
              '@..',
              '..o']
    },
    {
      id: 3, name: 'STOP', par: 3,   // ways 1 · luck 1.56% · 4 states · 3 pieces · 2 set-up tilts
      note: 'A wall closes the straight line, so the player invents the detour.',
      hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
      board: ['@#o',
              '...',
              '...']
    },
    {
      id: 4, name: 'NOTCH', par: 4,   // ways 1 · luck 0.39% · 21 states · 4 pieces · 1 set-up tilts
      note: 'The goal sits in the top edge behind a wall. Neither block can arrive straight at it.',
      board: ['.o.',
              '.#.',
              '@@.']
    },
    {
      id: 5, name: 'FOLLOW', par: 4,   // ways 2 · luck 0.78% · 18 states · 4 pieces · 3 set-up tilts · chain ×2
      note: 'One block waits above the wall while the other travels. They arrive together.',
      board: ['..@',
              '..#',
              '@.o']
    },
    {
      id: 6, name: 'PAIR', par: 4,   // ways 1 · luck 0.39% · 19 states · 5 pieces
      note: 'Two blocks, two walls, and the first board where the answer is not the direction you ' +
            'wanted to swipe.',
      board: ['@.#',
              '.#o',
              '..@']
    },
    {
      id: 7, name: 'SHUNT', par: 5,   // ways 2 · luck 0.20% · 15 states · 5 pieces · 2 set-up tilts
      note: 'A block is a wall for another block. Move the wrong one first and the other has nowhere ' +
            'to go.',
      board: ['.@.',
              '@#o',
              '.#.']
    },
    {
      id: 8, name: 'CORNER', par: 5,   // ways 1 · luck 0.10% · 7 states · 4 pieces · 4 set-up tilts
      note: 'The goal is one cell away and completely out of reach. Five moves to travel two.',
      board: ['@#o',
              '...',
              '..#']
    },
    {
      id: 9, name: 'LAP', par: 6,   // ways 1 · luck 0.02% · 16 states · 5 pieces · 3 set-up tilts
      note: 'Two walls on opposite corners. Six moves out of nine cells, and exactly one line works.',
      board: ['@#o',
              '...',
              '.@#']
    },
    {
      id: 10, name: 'TIGHT', par: 7,   // ways 1 · luck 0.01% · 18 states · 5 pieces · 2 set-up tilts
      note: 'The end of the introduction: three cells of wall, two blocks, one goal, seven tilts. ' +
            'Everything from here is this, folded further.',
      board: ['@@#',
              '.#o',
              '...']
    },

    // ── CHAPTER 2 · NINE  (stages 11–20, par 6–10) ─────────────────────────────────────────
    // Nine cells, and nothing else will be added. Proof that a 3×3 board already holds ten moves of thinking if the walls are in the right places.
    {
      id: 11, name: 'PIVOT', par: 6,   // ways 1 · luck 0.02% · 9 states · 4 pieces · 2 set-up tilts
      board: ['#@@',
              'o..',
              '...']
    },
    {
      id: 12, name: 'SHUNT II', par: 6,   // ways 1 · luck 0.02% · 18 states · 5 pieces · 2 set-up tilts
      board: ['#.@',
              'o#@',
              '...']
    },
    {
      id: 13, name: 'ORBIT', par: 7,   // ways 2 · luck 0.01% · 14 states · 5 pieces · 4 set-up tilts
      board: ['@..',
              '@.#',
              '#.o']
    },
    {
      id: 14, name: 'CLASP', par: 7,   // ways 1 · luck 0.01% · 10 states · 5 pieces
      board: ['@@@',
              '..o',
              '..#']
    },
    {
      id: 15, name: 'THREAD', par: 8,   // ways 1 · luck 0.00% · 28 states · 6 pieces · 2 set-up tilts
      board: ['.@.',
              'o#@',
              '#.@']
    },
    {
      id: 16, name: 'RELAY', par: 8,   // ways 1 · luck 0.00% · 34 states · 6 pieces · 1 set-up tilts
      board: ['.o#',
              '@#@',
              '@..']
    },
    {
      id: 17, name: 'KNOT', par: 9,   // ways 1 · luck 0.00% · 32 states · 6 pieces · 1 set-up tilts
      board: ['..@',
              'o#.',
              '#@@']
    },
    {
      id: 18, name: 'CINCH', par: 9,   // ways 1 · luck 0.00% · 30 states · 6 pieces · 1 set-up tilts
      board: ['..@',
              'o#@',
              '#@.']
    },
    {
      id: 19, name: 'SPIRE', par: 9,   // ways 1 · luck 0.00% · 28 states · 6 pieces · 1 set-up tilts
      board: ['.o#',
              '.#.',
              '@@@']
    },
    {
      id: 20, name: 'NINE', par: 10,   // ways 1 · luck 0.00% · 30 states · 6 pieces · 2 set-up tilts
      board: ['#@@',
              'o#@',
              '...']
    },

    // ── CHAPTER 3 · TWELVE  (stages 21–30, par 9–12) ───────────────────────────────────────
    // Three cells wider. The extra room is not a kindness — it is where the long way round lives.
    {
      id: 21, name: 'LATCH', par: 9,   // ways 1 · luck 0.00% · 38 states · 7 pieces · 4 set-up tilts · chain ×2
      board: ['#o..',
              '@#..',
              '@@.#']
    },
    {
      id: 22, name: 'SLALOM', par: 9,   // ways 1 · luck 0.00% · 31 states · 7 pieces · 4 set-up tilts · chain ×2
      board: ['....',
              'oo#@',
              '.#@@']
    },
    {
      id: 23, name: 'HINGE', par: 10,   // ways 1 · luck 0.00% · 25 states · 6 pieces · 7 set-up tilts
      board: ['#...',
              '..#@',
              'o#@.']
    },
    {
      id: 24, name: 'FERRY', par: 10,   // ways 2 · luck 0.00% · 45 states · 6 pieces · 6 set-up tilts
      board: ['@#o.',
              '.@..',
              '.@#.']
    },
    {
      id: 25, name: 'RATCHET', par: 10,   // ways 2 · luck 0.00% · 38 states · 6 pieces · 6 set-up tilts
      board: ['@.#.',
              '@...',
              '@#o.']
    },
    {
      id: 26, name: 'DETOUR', par: 11,   // ways 1 · luck 0.00% · 44 states · 6 pieces · 3 set-up tilts
      board: ['@#o.',
              '@@#.',
              '....']
    },
    {
      id: 27, name: 'SIEVE', par: 11,   // ways 1 · luck 0.00% · 44 states · 7 pieces · 3 set-up tilts
      board: ['.@.#',
              '@#.o',
              '.@#.']
    },
    {
      id: 28, name: 'CRADLE', par: 11,   // ways 1 · luck 0.00% · 43 states · 7 pieces · 3 set-up tilts
      board: ['#.@.',
              'o.#.',
              '.#@@']
    },
    {
      id: 29, name: 'WINCH', par: 12,   // ways 1 · luck 0.00% · 34 states · 7 pieces · 3 set-up tilts
      board: ['@..#',
              '@#.o',
              '@#..']
    },
    {
      id: 30, name: 'ANVIL', par: 12,   // ways 2 · luck 0.00% · 41 states · 7 pieces · 4 set-up tilts
      board: ['#..@',
              'o.#.',
              '.#@@']
    },

    // ── CHAPTER 4 · SIXTEEN  (stages 31–40, par 11–14) ──────────────────────────────────────
    // The board doubles. Same three things on it, twice as much room for them to be in the wrong place.
    {
      id: 31, name: 'GRID', par: 11,   // ways 1 · luck 0.00% · 26 states · 6 pieces · 8 set-up tilts
      board: ['...#',
              '#...',
              '....',
              'o#@@']
    },
    {
      id: 32, name: 'CAROUSEL', par: 11,   // ways 1 · luck 0.00% · 31 states · 7 pieces · 9 set-up tilts
      board: ['....',
              '.#o.',
              '..##',
              '#.@@']
    },
    {
      id: 33, name: 'PENDULUM', par: 12,   // ways 1 · luck 0.00% · 31 states · 6 pieces · 5 set-up tilts
      board: ['o.#@',
              '#...',
              '....',
              '@#..']
    },
    {
      id: 34, name: 'SHUTTLE', par: 12,   // ways 1 · luck 0.00% · 30 states · 6 pieces · 5 set-up tilts
      board: ['..@.',
              '#...',
              '...#',
              'o#.@']
    },
    {
      id: 35, name: 'TRAVERSE', par: 12,   // ways 1 · luck 0.00% · 40 states · 7 pieces · 8 set-up tilts
      board: ['.o#@',
              '.#.@',
              '...#',
              '#...']
    },
    {
      id: 36, name: 'MEANDER', par: 13,   // ways 1 · luck 0.00% · 30 states · 6 pieces · 6 set-up tilts
      board: ['..#@',
              '...@',
              '...#',
              '.#.o']
    },
    {
      id: 37, name: 'CIRCUIT', par: 13,   // ways 1 · luck 0.00% · 72 states · 8 pieces · 3 set-up tilts · chain ×2
      board: ['@.@@',
              '@#..',
              '#o..',
              '...#']
    },
    {
      id: 38, name: 'GANTRY', par: 13,   // ways 1 · luck 0.00% · 76 states · 9 pieces · 5 set-up tilts · chain ×2
      board: ['..@@',
              '@@##',
              '.#oo',
              '....']
    },
    {
      id: 39, name: 'ESCARP', par: 14,   // ways 1 · luck 0.00% · 66 states · 7 pieces · 5 set-up tilts
      board: ['..#@',
              '.@..',
              '...#',
              '@#.o']
    },
    {
      id: 40, name: 'SIXTEEN', par: 14,   // ways 1 · luck 0.00% · 63 states · 7 pieces · 5 set-up tilts
      board: ['..@.',
              '.@.#',
              '#...',
              '@.#o']
    },

    // ── CHAPTER 5 · ORDER  (stages 41–50, par 14–17) ────────────────────────────────────────
    // Chapter of the wrong first move. Every board here has a block that cannot go anywhere until a different block has been dealt with first, and finding out which is the whole puzzle.
    {
      id: 41, name: 'PRECEDENCE', par: 14,   // ways 1 · luck 0.00% · 63 states · 8 pieces · 9 set-up tilts
      board: ['#...',
              '@@#.',
              '.#o.',
              '@#..']
    },
    {
      id: 42, name: 'QUEUE', par: 14,   // ways 1 · luck 0.00% · 63 states · 8 pieces · 9 set-up tilts
      board: ['..#.',
              '.o#@',
              '.#@@',
              '...#']
    },
    {
      id: 43, name: 'INTERLOCK', par: 15,   // ways 1 · luck 0.00% · 65 states · 7 pieces · 6 set-up tilts
      board: ['...@',
              '...#',
              '#...',
              '@@#o']
    },
    {
      id: 44, name: 'DEADBOLT', par: 15,   // ways 1 · luck 0.00% · 62 states · 7 pieces · 6 set-up tilts
      board: ['o#@@',
              '...#',
              '#..@',
              '....']
    },
    {
      id: 45, name: 'SEQUENCE', par: 15,   // ways 1 · luck 0.00% · 62 states · 8 pieces · 10 set-up tilts
      board: ['...#',
              '.#.@',
              '.o#@',
              '..#@']
    },
    {
      id: 46, name: 'TUMBLER', par: 16,   // ways 1 · luck 0.00% · 60 states · 8 pieces · 5 set-up tilts
      board: ['.@#.',
              '.@..',
              '@#..',
              '#o.#']
    },
    {
      id: 47, name: 'ESCAPEMENT', par: 16,   // ways 1 · luck 0.00% · 54 states · 8 pieces · 4 set-up tilts
      board: ['#.o#',
              '..#@',
              '.#.@',
              '...@']
    },
    {
      id: 48, name: 'RATCHET II', par: 16,   // ways 1 · luck 0.00% · 134 states · 8 pieces · 3 set-up tilts
      board: ['....',
              '..#@',
              '.#@@',
              '.o#@']
    },
    {
      id: 49, name: 'CASCADE', par: 17,   // ways 1 · luck 0.00% · 109 states · 8 pieces · 4 set-up tilts
      board: ['o.#@',
              '#...',
              '@...',
              '@#@.']
    },
    {
      id: 50, name: 'ORDER', par: 17,   // ways 1 · luck 0.00% · 64 states · 9 pieces · 6 set-up tilts
      board: ['#@.#',
              '@.#o',
              '@#..',
              '...#']
    },

    // ── CHAPTER 6 · TWENTY  (stages 51–60, par 16–19) ───────────────────────────────────────
    // Twenty cells. Long enough that the route stops being visible and has to be worked out one consequence at a time.
    {
      id: 51, name: 'CONVEYOR', par: 16,   // ways 2 · luck 0.00% · 67 states · 9 pieces · 12 set-up tilts · chain ×2
      board: ['#....',
              'o..#.',
              '..#@.',
              '.#@@#']
    },
    {
      id: 52, name: 'SWITCHBACK', par: 16,   // ways 1 · luck 0.00% · 96 states · 10 pieces · 11 set-up tilts · chain ×2
      board: ['@@#o#',
              '..#..',
              '.#@..',
              '...##']
    },
    {
      id: 53, name: 'TRESTLE', par: 17,   // ways 1 · luck 0.00% · 124 states · 9 pieces · 12 set-up tilts · chain ×2
      board: ['@.#o#',
              '.@#..',
              '.#...',
              '.@.#.']
    },
    {
      id: 54, name: 'CATWALK', par: 17,   // ways 3 · luck 0.00% · 122 states · 9 pieces · 10 set-up tilts · chain ×2
      board: ['#....',
              '...#.',
              '..#@@',
              'o#@@.']
    },
    {
      id: 55, name: 'FUNNEL', par: 17,   // ways 1 · luck 0.00% · 195 states · 10 pieces · 6 set-up tilts · chain ×2
      board: ['#@@@.',
              '..##@',
              '....#',
              '.#o..']
    },
    {
      id: 56, name: 'AQUEDUCT', par: 18,   // ways 3 · luck 0.00% · 136 states · 10 pieces · 14 set-up tilts · chain ×2
      board: ['.#...',
              '@@.#.',
              '..#o.',
              '@@#o.']
    },
    {
      id: 57, name: 'PORTAGE', par: 18,   // ways 1 · luck 0.00% · 144 states · 10 pieces · 6 set-up tilts · chain ×2
      board: ['#.@#o',
              '@@#..',
              '@#...',
              '....#']
    },
    {
      id: 58, name: 'SLUICE', par: 18,   // ways 1 · luck 0.00% · 92 states · 10 pieces · 13 set-up tilts
      board: ['#..@#',
              '.@@#o',
              '.##..',
              '....#']
    },
    {
      id: 59, name: 'CAPSTAN', par: 19,   // ways 1 · luck 0.00% · 113 states · 8 pieces · 9 set-up tilts
      board: ['o.#.@',
              '#..#.',
              '@....',
              '@#...']
    },
    {
      id: 60, name: 'TWENTY', par: 19,   // ways 3 · luck 0.00% · 119 states · 9 pieces · 14 set-up tilts · chain ×2
      board: ['.#...',
              '...#@',
              '..#.@',
              '#o#.@']
    },

    // ── CHAPTER 7 · TRAFFIC  (stages 61–70, par 18–21) ──────────────────────────────────────
    // Four blocks sharing one exit. They are identical, so it does not matter which goes first — except that it does, because each one is the wall the next has to work around.
    {
      id: 61, name: 'CONGESTION', par: 18,   // ways 1 · luck 0.00% · 146 states · 9 pieces · 5 set-up tilts · chain ×2
      board: ['.@#o.',
              '@#..#',
              '@....',
              '@..#.']
    },
    {
      id: 62, name: 'BOTTLENECK', par: 18,   // ways 1 · luck 0.00% · 187 states · 9 pieces · 7 set-up tilts
      board: ['.@#o.',
              '..@#.',
              '@@#..',
              '#....']
    },
    {
      id: 63, name: 'ROTARY', par: 19,   // ways 2 · luck 0.00% · 117 states · 8 pieces · 9 set-up tilts
      board: ['o.#@.',
              '#..#@',
              '@....',
              '.....',
              '.#...']
    },
    {
      id: 64, name: 'SIDING', par: 19,   // ways 1 · luck 0.00% · 122 states · 9 pieces · 11 set-up tilts
      board: ['o.#..',
              '#....',
              '.#..#',
              '@@#@.',
              '.....']
    },
    {
      id: 65, name: 'MARSHAL', par: 19,   // ways 1 · luck 0.00% · 128 states · 10 pieces · 9 set-up tilts · chain ×2
      board: ['@@@#.',
              '@#...',
              '#o...',
              '.#..#']
    },
    {
      id: 66, name: 'JUNCTION', par: 20,   // ways 2 · luck 0.00% · 212 states · 10 pieces · 13 set-up tilts · chain ×2
      board: ['..#o#',
              '.@#..',
              '@#...',
              '@.@#.']
    },
    {
      id: 67, name: 'TURNTABLE', par: 20,   // ways 2 · luck 0.00% · 226 states · 10 pieces · 16 set-up tilts
      board: ['.#...',
              '....#',
              '.o#.@',
              '##@..',
              '@..#.']
    },
    {
      id: 68, name: 'INTERCHANGE', par: 20,   // ways 1 · luck 0.00% · 66 states · 10 pieces · 9 set-up tilts · chain ×2
      board: ['@@#..',
              '@#.o#',
              '@....',
              '##...']
    },
    {
      id: 69, name: 'GRIDLOCK', par: 21,   // ways 2 · luck 0.00% · 212 states · 10 pieces · 14 set-up tilts · chain ×2
      board: ['#o#.@',
              '..#.@',
              '..@#@',
              '.#...']
    },
    {
      id: 70, name: 'TRAFFIC', par: 21,   // ways 3 · luck 0.00% · 204 states · 11 pieces · 14 set-up tilts · chain ×2
      board: ['#...#',
              '@.#.o',
              '.#...',
              '.@#..',
              '@.@#.']
    },

    // ── CHAPTER 8 · LATTICE  (stages 71–80, par 20–23) ──────────────────────────────────────
    // Twenty-five cells and about six walls. Almost the whole board is empty, and that is the trick: with nothing to stop them, blocks travel too far, and the walls you do have are the only brakes you own.
    {
      id: 71, name: 'SCAFFOLD', par: 20,   // ways 1 · luck 0.00% · 258 states · 11 pieces · 8 set-up tilts · chain ×2
      board: ['#...o',
              '...##',
              '..#..',
              '.#@.@',
              '..@#@']
    },
    {
      id: 72, name: 'FILIGREE', par: 20,   // ways 2 · luck 0.00% · 154 states · 11 pieces · 9 set-up tilts · chain ×2
      board: ['#....',
              '..##.',
              'o.#@.',
              '..#..',
              '.#@@@']
    },
    {
      id: 73, name: 'ARMATURE', par: 21,   // ways 1 · luck 0.00% · 206 states · 10 pieces · 9 set-up tilts · chain ×2
      board: ['..#..',
              '.....',
              '#.o..',
              '@.###',
              '.@@.@']
    },
    {
      id: 74, name: 'BUTTRESS', par: 21,   // ways 1 · luck 0.00% · 203 states · 10 pieces · 10 set-up tilts
      board: ['@@#..',
              '.@@#.',
              '.##o.',
              '.....',
              '..#..']
    },
    {
      id: 75, name: 'CANTILEVER', par: 21,   // ways 1 · luck 0.00% · 205 states · 11 pieces · 4 set-up tilts · chain ×2
      board: ['.....',
              '..o.#',
              '###.@',
              '@@@#.',
              '#....']
    },
    {
      id: 76, name: 'TRUSS', par: 22,   // ways 2 · luck 0.00% · 224 states · 9 pieces · 10 set-up tilts
      board: ['.#..@',
              '@....',
              '.....',
              '#..#@',
              'o.#.@']
    },
    {
      id: 77, name: 'PYLON', par: 22,   // ways 1 · luck 0.00% · 285 states · 10 pieces · 10 set-up tilts
      board: ['o#@@@',
              '...##',
              '#....',
              '.#...',
              '.@...']
    },
    {
      id: 78, name: 'MULLION', par: 22,   // ways 1 · luck 0.00% · 262 states · 11 pieces · 13 set-up tilts
      board: ['....#',
              '#....',
              '..##.',
              'o#@@.',
              '#.@.@']
    },
    {
      id: 79, name: 'VAULT', par: 23,   // ways 1 · luck 0.00% · 121 states · 11 pieces · 10 set-up tilts · chain ×2
      board: ['.#.@@',
              '.o#.@',
              '#..#.',
              '....@',
              '...##']
    },
    {
      id: 80, name: 'LATTICE', par: 23,   // ways 2 · luck 0.00% · 122 states · 12 pieces · 11 set-up tilts · chain ×2
      board: ['#@.@#',
              '.@#.#',
              '@#...',
              '##o..',
              '.....']
    },

    // ── CHAPTER 9 · DEPTH  (stages 81–90, par 23–25) ────────────────────────────────────────
    // Twenty-plus tilts on a board of a dozen things. Every stage in this chapter looks like it should take four moves, and none of them do.
    {
      id: 81, name: 'PLUMB', par: 23,   // ways 1 · luck 0.00% · 135 states · 9 pieces · 12 set-up tilts
      board: ['...#@.',
              '....#.',
              '......',
              '#...#@',
              'o.#@..']
    },
    {
      id: 82, name: 'FATHOM', par: 23,   // ways 2 · luck 0.00% · 134 states · 9 pieces · 15 set-up tilts
      board: ['..#@@@',
              '.o#...',
              '.....#',
              '##....',
              '......']
    },
    {
      id: 83, name: 'SOUNDING', par: 23,   // ways 1 · luck 0.00% · 187 states · 11 pieces · 19 set-up tilts
      board: ['.#@.#.',
              '..#.@#',
              '.o.#..',
              '....#@',
              '..#...']
    },
    {
      id: 84, name: 'UNDERTOW', par: 24,   // ways 2 · luck 0.00% · 135 states · 9 pieces · 11 set-up tilts
      board: ['@....#',
              '@#....',
              '#.....',
              '..#..@',
              'o#....']
    },
    {
      id: 85, name: 'KEEL', par: 24,   // ways 2 · luck 0.00% · 372 states · 10 pieces · 9 set-up tilts · chain ×2
      board: ['..#o..',
              '@..#..',
              '#....#',
              '..@.#.',
              '.@.@..']
    },
    {
      id: 86, name: 'BALLAST', par: 24,   // ways 2 · luck 0.00% · 149 states · 10 pieces · 13 set-up tilts
      board: ['#.....',
              '......',
              '@@#...',
              '##...#',
              '.o.#.@']
    },
    {
      id: 87, name: 'TRENCH', par: 24,   // ways 2 · luck 0.00% · 346 states · 12 pieces · 11 set-up tilts · chain ×2
      board: ['..o#@@',
              '#...#@',
              '.##...',
              '....#.',
              '#....@']
    },
    {
      id: 88, name: 'ABYSSAL', par: 25,   // ways 1 · luck 0.00% · 395 states · 11 pieces · 18 set-up tilts · chain ×2
      board: ['@@#...',
              '.#o..#',
              '..##..',
              '....#.',
              '.@...@']
    },
    {
      id: 89, name: 'PRESSURE', par: 25,   // ways 2 · luck 0.00% · 538 states · 12 pieces · 20 set-up tilts · chain ×2
      board: ['.o.#..',
              '..#@.#',
              '...#.@',
              '.#..#.',
              '..#.@@']
    },
    {
      id: 90, name: 'DEPTH', par: 25,   // ways 2 · luck 0.00% · 521 states · 12 pieces · 18 set-up tilts · chain ×2
      board: ['..#...',
              '.#o..#',
              '.@##..',
              '.#@@#.',
              '...@..']
    },

    // ── CHAPTER 10 · TILT  (stages 91–100, par 25–28) ─────────────────────────────────────────
    // Thirty cells, four blocks, one goal, and twenty-five moves. Nothing here that was not in stage one — the same gravity, the same walls, the same blocks. Only the folding is deeper.
    {
      id: 91, name: 'CONFLUENCE', par: 25,   // ways 1 · luck 0.00% · 379 states · 11 pieces · 8 set-up tilts
      board: ['o#@@#.',
              '..#...',
              '#.....',
              '.#....',
              '...@@#']
    },
    {
      id: 92, name: 'MERIDIAN', par: 25,   // ways 1 · luck 0.00% · 221 states · 11 pieces · 8 set-up tilts
      board: ['@.##@.',
              '.@....',
              '#...#@',
              'o#...#',
              '......']
    },
    {
      id: 93, name: 'GYRE', par: 26,   // ways 2 · luck 0.00% · 157 states · 11 pieces · 18 set-up tilts
      board: ['...#..',
              '.#....',
              '.@#o..',
              '..@##.',
              '#@..#.']
    },
    {
      id: 94, name: 'LABYRINTH', par: 26,   // ways 1 · luck 0.00% · 331 states · 12 pieces · 8 set-up tilts · chain ×2
      board: ['..#.@.',
              '..#@.#',
              '.o.#.@',
              '....#@',
              '.##...']
    },
    {
      id: 95, name: 'CALIBRATE', par: 26,   // ways 1 · luck 0.00% · 764 states · 13 pieces · 15 set-up tilts
      board: ['..@.#.',
              '..#..@',
              '...#..',
              '.#@#.#',
              '@@.#.o']
    },
    {
      id: 96, name: 'ASCENDANT', par: 27,   // ways 1 · luck 0.00% · 305 states · 12 pieces · 12 set-up tilts · chain ×2
      board: ['..#@@.',
              '..#@.#',
              '...#..',
              '.#..#.',
              'o.#..@']
    },
    {
      id: 97, name: 'TERMINUS', par: 27,   // ways 2 · luck 0.00% · 207 states · 12 pieces · 12 set-up tilts · chain ×2
      board: ['...#..',
              '.#..#o',
              '..#...',
              '@@.#..',
              '#@.@#.']
    },
    {
      id: 98, name: 'ZENITH', par: 27,   // ways 2 · luck 0.00% · 409 states · 13 pieces · 13 set-up tilts · chain ×2
      board: ['.@#...',
              '....#.',
              '...#..',
              '.###..',
              '@@@#o#']
    },
    {
      id: 99, name: 'SOLSTICE', par: 28,   // ways 1 · luck 0.00% · 318 states · 12 pieces · 13 set-up tilts · chain ×2
      board: ['o..#@.',
              '#..#.@',
              '..#.@.',
              '.#....',
              '...##@']
    },
    {
      id: 100, name: 'TILT', par: 28,   // ways 1 · luck 0.00% · 533 states · 12 pieces · 14 set-up tilts
      board: ['...#..',
              '.#.@..',
              '@.#.@#',
              '#..#.@',
              'o.#...']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
