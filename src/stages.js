'use strict';
/*
 * TILT — stage data.  GENERATED FILE — do not edit by hand.
 *
 * Source of truth: tools/campaign.js  (rebuild with `npm run campaign`)
 *
 *   terrain: '.' floor  '#' wall  '*' pit
 *            'o' goal (any colour)   '0' '1' '2' goal (that colour only)
 *   pieces:  '.' empty  'A'..'Z'  one letter = one block
 *            (a letter repeated across adjacent cells = one rigid multi-cell block)
 *   colors:  { A: 0, B: 1, ... }  — defaults to 0
 *
 * Every `par` below is a breadth-first-proven shortest solution, and every wall, pit,
 * goal and block survived deletion testing: remove any one of them and the puzzle
 * measurably changes. Verified by tools/audit.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CHAPTERS = [
    { number: 1, name: 'AWAKEN', from: 1, to: 10,
      note: 'Gravity, walls, blocks that block each other, and the void. One idea at a time.' },
    { number: 2, name: 'SPECTRUM', from: 11, to: 20,
      note: 'Colour and mass arrive. After this chapter the rules never grow again.' },
    { number: 3, name: 'NINE', from: 21, to: 30,
      note: 'Everything that fits in nine cells. No new ideas — just proof that a 3×3 board can hold eight moves of thinking.' },
    { number: 4, name: 'SIXTEEN', from: 31, to: 40,
      note: 'The board doubles. More cells means longer routes and more blocks in each other\'s way, without a single new rule.' },
    { number: 5, name: 'PALETTE', from: 41, to: 50,
      note: 'Two colours on a board big enough for them to get in each other\'s way. Every block needs its own route and they share the same gravity.' },
    { number: 6, name: 'ABYSS', from: 51, to: 60,
      note: 'Boards where the wrong tilt costs you a block. Every stage in this chapter has at least one fatal move, so lookahead stops being optional.' },
    { number: 7, name: 'MASS', from: 61, to: 70,
      note: 'Two-cell blocks. They cannot turn, they need a matching gap to pass and a matching goal to land in — and they make the best walls in the game.' },
    { number: 8, name: 'BLEND', from: 71, to: 80,
      note: 'Colour and the void together. A block can be routed correctly and still be destroyed on the way, so the order you solve the colours in becomes a survival question.' },
    { number: 9, name: 'STRUCTURE', from: 81, to: 90,
      note: 'Mass and colour. A wide block that will not fit through a gap is a wall you have to plan around, and now it has a colour that decides where it must end up.' },
    { number: 10, name: 'CONVERGENCE', from: 91, to: 100,
      note: 'Mass, colour and the void on one board, on the largest grids in the game. Nothing new — everything at once, and up to fourteen moves of it.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · AWAKEN  (stages 1–10, par 2–6) ───────────────────────────────────────
    // Gravity, walls, blocks that block each other, and the void. One idea at a time.
    {
      id: 1, name: 'DROP', par: 2,
      note: 'Gravity exists and it answers to you. One block, one goal, nothing to fear.',
      hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
      terrain: ['...',
                '...',
                '..o'],
      pieces: ['A..',
               '...',
               '...']
    },
    {
      id: 2, name: 'STOP', par: 3,
      note: 'Walls stop things. The straight line is closed, so the player invents the detour.',
      hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
      terrain: ['.#o',
                '...',
                '...'],
      pieces: ['A..',
               '...',
               '...']
    },
    {
      id: 3, name: 'TWO', par: 2,
      note: 'A second block. One goal serves both — and blocks pile up against each other.',
      terrain: ['..o',
                '...',
                '...'],
      pieces: ['A..',
               'B..',
               '...']
    },
    {
      id: 4, name: 'FOLLOW', par: 4,
      note: 'The last tilt sends both blocks home at once. First taste of a chain.',
      terrain: ['...',
                '..#',
                '..o'],
      pieces: ['..B',
               'A..',
               '...']
    },
    {
      id: 5, name: 'NOTCH', par: 4,
      note: 'The goal sits in the top edge behind a wall. Neither block can arrive straight.',
      terrain: ['.o.',
                '.#.',
                '...'],
      pieces: ['...',
               '...',
               'AB.']
    },
    {
      id: 6, name: 'STACK', par: 5,
      note: 'Three blocks in one column. They are each other\'s floor — the order they unstack is the ' +
            'puzzle.',
      terrain: ['..#',
                '#.o',
                '...'],
      pieces: ['.C.',
               '.B.',
               '.A.']
    },
    {
      id: 7, name: 'LAP', par: 6,
      note: 'Two walls on opposite corners. Six moves out of nine cells, and exactly one line works.',
      terrain: ['.#o',
                '...',
                '..#'],
      pieces: ['A..',
               '...',
               '.B.']
    },
    {
      id: 8, name: 'VOID', par: 3,
      note: 'The pit. The most obvious first tilt deletes your only block — learned in one tap, ' +
            'undone in one tap.',
      hint: { ja: '穴に落ちたブロックは消える', en: 'Pits swallow blocks' },
      terrain: ['..*',
                '..o',
                '...'],
      pieces: ['A..',
               '...',
               '...']
    },
    {
      id: 9, name: 'LEDGE', par: 5,
      note: 'A pit above, a wall beside the goal. Half of all tilts here cost you a block.',
      terrain: ['..*',
                '.#o',
                '...'],
      pieces: ['.A.',
               '...',
               '..B']
    },
    {
      id: 10, name: 'BRINK', par: 5,
      note: 'The pit sits mid-board where both blocks must cross it. Survival is a matter of order.',
      terrain: ['.o#',
                '...',
                '.*.'],
      pieces: ['...',
               '..B',
               'A..']
    },

    // ── CHAPTER 2 · SPECTRUM  (stages 11–20, par 4–10) ─────────────────────────────────────
    // Colour and mass arrive. After this chapter the rules never grow again.
    {
      id: 11, name: 'HUE', par: 4,
      note: 'Colour is taught by disappointment: a block lands squarely on a goal and nothing happens.',
      hint: { ja: '色が合ったゴールだけ入る', en: 'Colours must match' },
      terrain: ['...',
                '...',
                '01.'],
      pieces: ['A..',
               'B..',
               '...'],
      colors: { A: 0, B: 1 }
    },
    {
      id: 12, name: 'SPLIT', par: 5,
      note: 'Two goals side by side in the wrong order. The wall between them is the whole problem.',
      terrain: ['1#0',
                '...',
                '...'],
      pieces: ['...',
               '.B.',
               '.A.'],
      colors: { A: 0, B: 1 }
    },
    {
      id: 13, name: 'SORT', par: 6,
      note: 'Wrong-coloured goals are just floor. Sliding over one is free; stopping on one is a ' +
            'wasted move.',
      terrain: ['....',
                '1.#.',
                '.#0.',
                '....'],
      pieces: ['.B..',
               '....',
               'A...',
               '....'],
      colors: { A: 0, B: 1 }
    },
    {
      id: 14, name: 'WIDE', par: 4,
      note: 'A two-cell block. It only counts when the whole body is home — half in is not in.',
      hint: { ja: '大きなブロックは全部入れる', en: 'The whole block must fit' },
      terrain: ['....',
                '....',
                '...#',
                '#.oo'],
      pieces: ['AA..',
               '....',
               '....',
               '....']
    },
    {
      id: 15, name: 'LEVER', par: 7,
      note: 'The wide block is also the best wall you own. Park it, then use it.',
      terrain: ['....',
                '#...',
                'oo..',
                '#...'],
      pieces: ['....',
               '...B',
               '....',
               '.AA.']
    },
    {
      id: 16, name: 'FIT', par: 7,
      note: 'A tall goal and a wide goal. Blocks cannot turn, so each shape has exactly one home.',
      terrain: ['....',
                '.#.o',
                '...o',
                '.oo#'],
      pieces: ['BBA.',
               '..A.',
               '....',
               '....']
    },
    {
      id: 17, name: 'CASCADE', par: 6,
      note: 'Four blocks, one goal, and the LAST tilt sends three of them home in a single sweep. ' +
            'Searched specifically for a board whose cascade is the finale rather than a mid-game ' +
            'accident.',
      terrain: ['..#o',
                '....',
                '.#..',
                '..#.'],
      pieces: ['C...',
               '.ABD',
               '....',
               '....']
    },
    {
      id: 18, name: 'NERVE', par: 8,
      note: 'Colour, a pit and a chain on one small board. Thirty-seven different tilts here will ' +
            'cost you a block.',
      terrain: ['....',
                '..#.',
                '*.1.',
                '0...'],
      pieces: ['....',
               '.B..',
               '...A',
               '...C'],
      colors: { A: 1, B: 0, C: 1 }
    },
    {
      id: 19, name: 'PRISM', par: 9,
      note: 'Three colours, three goals, three separate laps around the same board.',
      terrain: ['.....',
                '#....',
                '2.1.#',
                '##...',
                '.0...'],
      pieces: ['..B..',
               '.....',
               '.....',
               '..A..',
               'C....'],
      colors: { A: 1, B: 0, C: 2 }
    },
    {
      id: 20, name: 'TILT', par: 10,
      note: 'The end of the tutorial arc: a wide block, a pit, two colours, ten moves, one line ' +
            'through it.',
      terrain: ['.....',
                '..11#',
                '.*..#',
                '...#.',
                '.0...'],
      pieces: ['AA...',
               '.....',
               '..C..',
               '.....',
               'B....'],
      colors: { A: 1, B: 0, C: 0 }
    },

    // ── CHAPTER 3 · NINE  (stages 21–30, par 5–8) ─────────────────────────────────────────
    // Everything that fits in nine cells. No new ideas — just proof that a 3×3 board can hold eight moves of thinking.
    {
      id: 21, name: 'PIVOT', par: 5,   // ways 1 · luck 0.10% · 18 states · fatal tilts · chain ×2
      terrain: ['..o',
                '*.#',
                '#..'],
      pieces: ['.A.',
               '...',
               '.BC']
    },
    {
      id: 22, name: 'CORNER', par: 5,   // ways 1 · luck 0.10% · 25 states · fatal tilts · chain ×2
      terrain: ['o..',
                '*#.',
                '...'],
      pieces: ['.B.',
               '..A',
               '.C.']
    },
    {
      id: 23, name: 'SHUNT', par: 6,   // ways 1 · luck 0.02% · 13 states · fatal tilts · chain ×2
      terrain: ['o*#',
                '...',
                '.#.'],
      pieces: ['...',
               '.BC',
               '..A']
    },
    {
      id: 24, name: 'TANGLE', par: 6,   // ways 1 · luck 0.02% · 13 states · fatal tilts · chain ×2
      terrain: ['o*#',
                '...',
                '.#.'],
      pieces: ['...',
               'BA.',
               'C..']
    },
    {
      id: 25, name: 'ORBIT', par: 6,   // ways 1 · luck 0.02% · 14 states · fatal tilts · chain ×2 · 31% dead ends
      terrain: ['o..',
                '.#.',
                '*..'],
      pieces: ['.C.',
               '..A',
               '.B.']
    },
    {
      id: 26, name: 'CLASP', par: 7,   // ways 1 · luck 0.01% · 21 states · fatal tilts
      terrain: ['*..',
                'o#.',
                '...'],
      pieces: ['..C',
               '...',
               'A.B']
    },
    {
      id: 27, name: 'THREAD', par: 7,   // ways 1 · luck 0.01% · 21 states · fatal tilts
      terrain: ['o*.',
                '.#.',
                '...'],
      pieces: ['..B',
               '...',
               'C.A']
    },
    {
      id: 28, name: 'RELAY', par: 7,   // ways 1 · luck 0.01% · 21 states · fatal tilts
      terrain: ['...',
                '.#o',
                '.*.'],
      pieces: ['C.B',
               '...',
               'A..']
    },
    {
      id: 29, name: 'KNOT', par: 8,   // ways 1 · luck 0.00% · 21 states · fatal tilts
      terrain: ['...',
                '.#.',
                '.o*'],
      pieces: ['...',
               'C.B',
               'A..']
    },
    {
      id: 30, name: 'CINCH', par: 8,   // ways 1 · luck 0.00% · 19 states · fatal tilts
      terrain: ['...',
                'o#.',
                '*..'],
      pieces: ['.CA',
               '...',
               '..B']
    },

    // ── CHAPTER 4 · SIXTEEN  (stages 31–40, par 6–9) ──────────────────────────────────────
    // The board doubles. More cells means longer routes and more blocks in each other's way, without a single new rule.
    {
      id: 31, name: 'LATTICE', par: 6,   // ways 1 · luck 0.02% · 511 states · chain ×2
      terrain: ['o...',
                '##..',
                '....',
                '....'],
      pieces: ['....',
               '..DB',
               '...C',
               '.A..']
    },
    {
      id: 32, name: 'SLALOM', par: 6,   // ways 1 · luck 0.02% · 648 states · chain ×2
      terrain: ['.#.o',
                '....',
                '..#.',
                '....'],
      pieces: ['C...',
               '.A..',
               'D...',
               '.B..']
    },
    {
      id: 33, name: 'HINGE', par: 7,   // ways 1 · luck 0.01% · 699 states · chain ×2
      terrain: ['..#o',
                '....',
                '....',
                '.#..'],
      pieces: ['D...',
               '.BC.',
               '....',
               'A...']
    },
    {
      id: 34, name: 'FERRY', par: 7,   // ways 1 · luck 0.01% · 700 states · chain ×2
      terrain: ['o...',
                '#.#.',
                '....',
                '....'],
      pieces: ['..D.',
               '....',
               'C...',
               '..AB']
    },
    {
      id: 35, name: 'RATCHET', par: 7,   // ways 1 · luck 0.01% · 1265 states · chain ×2
      terrain: ['...o',
                '...#',
                '..#.',
                '....'],
      pieces: ['A...',
               'B...',
               '...D',
               '...C']
    },
    {
      id: 36, name: 'DETOUR', par: 8,   // ways 1 · luck 0.00% · 529 states · chain ×2
      terrain: ['...#',
                '....',
                '....',
                '.#o#'],
      pieces: ['.B..',
               'DA.C',
               '....',
               '....']
    },
    {
      id: 37, name: 'SIEVE', par: 8,   // ways 1 · luck 0.00% · 1279 states · chain ×2
      terrain: ['...#',
                '..#o',
                '..#.',
                '....'],
      pieces: ['....',
               'B...',
               '.C.D',
               '.A..']
    },
    {
      id: 38, name: 'CRADLE', par: 8,   // ways 1 · luck 0.00% · 704 states · chain ×2
      terrain: ['...#',
                '....',
                '.#o.',
                '..#.'],
      pieces: ['D...',
               'B.AC',
               '....',
               '....']
    },
    {
      id: 39, name: 'SPIRAL', par: 9,   // ways 1 · luck 0.00% · 425 states · chain ×2
      terrain: ['..#.',
                '....',
                '#..#',
                '...o'],
      pieces: ['A...',
               '..BC',
               '..D.',
               '....']
    },
    {
      id: 40, name: 'ANVIL', par: 9,   // ways 1 · luck 0.00% · 1235 states · chain ×2
      terrain: ['....',
                '..#.',
                '...#',
                '#..o'],
      pieces: ['ADBC',
               '....',
               '....',
               '....']
    },

    // ── CHAPTER 5 · PALETTE  (stages 41–50, par 7–10) ──────────────────────────────────────
    // Two colours on a board big enough for them to get in each other's way. Every block needs its own route and they share the same gravity.
    {
      id: 41, name: 'SWATCH', par: 7,   // ways 1 · luck 0.01% · 383 states · chain ×2
      terrain: ['0#.#',
                '....',
                '#...',
                '..#1'],
      pieces: ['....',
               '....',
               '..A.',
               'BC..'],
      colors: { A: 1, B: 0, C: 1 }
    },
    {
      id: 42, name: 'DECANT', par: 7,   // ways 1 · luck 0.01% · 331 states · chain ×3
      terrain: ['1...',
                '..#.',
                '#...',
                '0...'],
      pieces: ['.B..',
               '....',
               '.C..',
               '..A.'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 43, name: 'SPLICE', par: 8,   // ways 1 · luck 0.00% · 449 states · chain ×2
      terrain: ['..1#.',
                '.....',
                '..#0.',
                '#...#'],
      pieces: ['....B',
               '....C',
               '.....',
               '..A..'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 44, name: 'FILTER', par: 8,   // ways 2 · luck 0.00% · 502 states · chain ×2
      terrain: ['1..#0',
                '#....',
                '..#..',
                '....#'],
      pieces: ['..B..',
               '...A.',
               '.....',
               'C....'],
      colors: { A: 1, B: 0, C: 1 }
    },
    {
      id: 45, name: 'DIVIDE', par: 8,   // ways 1 · luck 0.00% · 471 states
      terrain: ['0#1..',
                '.....',
                '#...#',
                '..#..'],
      pieces: ['.....',
               'B...C',
               '.A...',
               '.....'],
      colors: { A: 1, B: 1, C: 0 }
    },
    {
      id: 46, name: 'ROTATE', par: 9,   // ways 1 · luck 0.00% · 420 states · chain ×2
      terrain: ['..#..',
                '#...1',
                '.0..#',
                '..#..'],
      pieces: ['.....',
               '.....',
               '..B..',
               'A...C'],
      colors: { A: 1, B: 1, C: 0 }
    },
    {
      id: 47, name: 'EXCHANGE', par: 9,   // ways 1 · luck 0.00% · 322 states · chain ×2
      terrain: ['....',
                '.#..',
                '.0.#',
                '...1'],
      pieces: ['....',
               '..CA',
               '....',
               'B...'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 48, name: 'MIRROR', par: 9,   // ways 1 · luck 0.00% · 321 states · chain ×2
      terrain: ['....',
                '.0#.',
                '....',
                '1#..'],
      pieces: ['B...',
               '....',
               '...C',
               '..A.'],
      colors: { A: 0, B: 0, C: 1 }
    },
    {
      id: 49, name: 'PARTITION', par: 10,   // ways 2 · luck 0.00% · 472 states · chain ×2
      terrain: ['....#',
                '...#.',
                '#....',
                '1.#0.'],
      pieces: ['...A.',
               '.B...',
               '.....',
               '....C'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 50, name: 'RESOLVE', par: 10,   // ways 1 · luck 0.00% · 439 states
      terrain: ['#....',
                '0..#.',
                '.1.#.',
                '.#...'],
      pieces: ['.....',
               '....C',
               '.....',
               'A.B..'],
      colors: { A: 1, B: 1, C: 0 }
    },

    // ── CHAPTER 6 · ABYSS  (stages 51–60, par 7–11) ────────────────────────────────────────
    // Boards where the wrong tilt costs you a block. Every stage in this chapter has at least one fatal move, so lookahead stops being optional.
    {
      id: 51, name: 'CHASM', par: 7,   // ways 1 · luck 0.01% · 200 states · fatal tilts
      terrain: ['...*',
                '.#.o',
                '.#..',
                '....'],
      pieces: ['B...',
               '..C.',
               '....',
               '...A']
    },
    {
      id: 52, name: 'TIGHTROPE', par: 7,   // ways 1 · luck 0.01% · 113 states · fatal tilts · chain ×2
      terrain: ['*....',
                'o..#.',
                '.....',
                '.##..'],
      pieces: ['.C...',
               '..B.A',
               '.....',
               '.....']
    },
    {
      id: 53, name: 'GANTRY', par: 8,   // ways 2 · luck 0.00% · 275 states · fatal tilts · chain ×2
      terrain: ['...#o',
                '.#.*.',
                '.....',
                '.....'],
      pieces: ['.....',
               '.....',
               '..C..',
               'BA...']
    },
    {
      id: 54, name: 'PRECIPICE', par: 8,   // ways 1 · luck 0.00% · 61 states · fatal tilts · chain ×2
      terrain: ['#.#..',
                '...o*',
                '.....',
                '.....'],
      pieces: ['.....',
               '.....',
               '.C..A',
               '...B.']
    },
    {
      id: 55, name: 'SCAFFOLD', par: 9,   // ways 1 · luck 0.00% · 251 states · fatal tilts
      terrain: ['.....',
                '....#',
                '#....',
                '*.o#.'],
      pieces: ['..C.A',
               '.....',
               '....B',
               '.....']
    },
    {
      id: 56, name: 'TRESTLE', par: 9,   // ways 1 · luck 0.00% · 243 states · fatal tilts
      terrain: ['*o#..',
                '....#',
                '#....',
                '.....'],
      pieces: ['.....',
               '.....',
               '.....',
               'B..CA']
    },
    {
      id: 57, name: 'CATWALK', par: 10,   // ways 2 · luck 0.00% · 280 states · fatal tilts
      terrain: ['..*o.',
                '.....',
                '..##.',
                '.....'],
      pieces: ['C....',
               '....B',
               '.....',
               '..A..']
    },
    {
      id: 58, name: 'FISSURE', par: 10,   // ways 2 · luck 0.00% · 199 states · fatal tilts
      terrain: ['....',
                '.##.',
                '....',
                '.*o.'],
      pieces: ['..BA',
               'C...',
               '....',
               '....']
    },
    {
      id: 59, name: 'PLUMMET', par: 11,   // ways 1 · luck 0.00% · 199 states · fatal tilts
      terrain: ['..#*o',
                '.....',
                '.....',
                '.#..#'],
      pieces: ['.....',
               'C..A.',
               '.B...',
               '.....']
    },
    {
      id: 60, name: 'KEYSTONE', par: 11,   // ways 1 · luck 0.00% · 134 states · fatal tilts
      terrain: ['....',
                'o.#.',
                '..#.',
                '*...'],
      pieces: ['....',
               '....',
               '.A..',
               '..CB']
    },

    // ── CHAPTER 7 · MASS  (stages 61–70, par 8–11) ─────────────────────────────────────────
    // Two-cell blocks. They cannot turn, they need a matching gap to pass and a matching goal to land in — and they make the best walls in the game.
    {
      id: 61, name: 'GIRDER', par: 8,   // ways 2 · luck 0.00% · 284 states · chain ×2
      terrain: ['....#',
                '.....',
                '..#..',
                '.#...',
                '..oo#'],
      pieces: ['.B...',
               '....C',
               'AA...',
               '.....',
               '.....']
    },
    {
      id: 62, name: 'BEAM', par: 8,   // ways 1 · luck 0.00% · 324 states · 42% dead ends
      terrain: ['.....',
                '..o.#',
                '.#o..',
                '..#..',
                '.....'],
      pieces: ['.A..C',
               '.A.B.',
               '.....',
               '.....',
               '.....']
    },
    {
      id: 63, name: 'PISTON', par: 9,   // ways 1 · luck 0.00% · 391 states
      terrain: ['.....',
                '.##..',
                '.....',
                '#..#.',
                '..oo.'],
      pieces: ['C.B..',
               '.....',
               '..AA.',
               '.....',
               '.....']
    },
    {
      id: 64, name: 'BULKHEAD', par: 9,   // ways 1 · luck 0.00% · 281 states · chain ×2
      terrain: ['.....',
                'o#...',
                'o...#',
                '.....',
                '.#...'],
      pieces: ['...C.',
               '.....',
               '.....',
               '..AB.',
               '..A..']
    },
    {
      id: 65, name: 'CARRIAGE', par: 9,   // ways 1 · luck 0.00% · 195 states · chain ×2
      terrain: ['...o.',
                '.#.o#',
                '...#.',
                '#....',
                '.....'],
      pieces: ['.....',
               '.....',
               '..A..',
               '..A..',
               'C.B..']
    },
    {
      id: 66, name: 'TRUSS', par: 10,   // ways 1 · luck 0.00% · 114 states · chain ×2
      terrain: ['.#o..',
                '.#o..',
                '....#',
                '.....',
                '#....'],
      pieces: ['C....',
               'A....',
               'A....',
               '..B..',
               '.....']
    },
    {
      id: 67, name: 'BALLAST', par: 10,   // ways 2 · luck 0.00% · 226 states
      terrain: ['..#..',
                '..o..',
                '#.o##',
                '.....',
                '..#..'],
      pieces: ['.....',
               '.A...',
               '.A...',
               '..CB.',
               '.....']
    },
    {
      id: 68, name: 'COUPLING', par: 10,   // ways 1 · luck 0.00% · 212 states
      terrain: ['.#...',
                '....o',
                '...#o',
                '....#'],
      pieces: ['A....',
               'A....',
               'C....',
               '...B.']
    },
    {
      id: 69, name: 'DERRICK', par: 11,   // ways 2 · luck 0.00% · 80 states · chain ×2
      terrain: ['...#.',
                '.....',
                '.#...',
                'ooo..',
                'o#.#.'],
      pieces: ['.....',
               '..AAB',
               '..C.B',
               '.....',
               '.....']
    },
    {
      id: 70, name: 'KEEL', par: 11,   // ways 1 · luck 0.00% · 244 states · 27% dead ends
      terrain: ['.#..#',
                '..#..',
                '.....',
                '.....',
                '.#oo#'],
      pieces: ['.....',
               'AA...',
               '.C...',
               '.B...',
               '.....']
    },

    // ── CHAPTER 8 · BLEND  (stages 71–80, par 9–12) ────────────────────────────────────────
    // Colour and the void together. A block can be routed correctly and still be destroyed on the way, so the order you solve the colours in becomes a survival question.
    {
      id: 71, name: 'ALLOY', par: 9,   // ways 1 · luck 0.00% · 114 states · fatal tilts · chain ×2
      terrain: ['...#.',
                '..1..',
                '0..#.',
                '#....',
                '.*..#'],
      pieces: ['B....',
               '.....',
               '.....',
               '...AC',
               '.....'],
      colors: { A: 0, B: 0, C: 1 }
    },
    {
      id: 72, name: 'CRUCIBLE', par: 9,   // ways 1 · luck 0.00% · 98 states · fatal tilts · chain ×2 · 41% dead ends
      terrain: ['.....',
                '1.#..',
                '.....',
                '#....',
                '.0*..'],
      pieces: ['...C.',
               '.....',
               'A...B',
               '.....',
               '.....'],
      colors: { A: 0, B: 1, C: 0 }
    },
    {
      id: 73, name: 'QUENCH', par: 10,   // ways 1 · luck 0.00% · 246 states · fatal tilts
      terrain: ['..#.*',
                '.....',
                '....#',
                '.....',
                '1#.#0'],
      pieces: ['...C.',
               '...A.',
               '.....',
               '...B.',
               '.....'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 74, name: 'DECAY', par: 10,   // ways 2 · luck 0.00% · 338 states · fatal tilts
      terrain: ['..#..',
                '.....',
                '..1#0',
                '#..*.',
                '.....'],
      pieces: ['B....',
               '.C...',
               '.A...',
               '.....',
               '.....'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 75, name: 'ISOTOPE', par: 10,   // ways 1 · luck 0.00% · 227 states · fatal tilts
      terrain: ['.#.1.',
                '...#.',
                '...*.',
                '...0.',
                '#....'],
      pieces: ['.....',
               '.....',
               '..A.B',
               '.C...',
               '.....'],
      colors: { A: 0, B: 0, C: 1 }
    },
    {
      id: 76, name: 'FERMENT', par: 11,   // ways 2 · luck 0.00% · 306 states · fatal tilts
      terrain: ['..#1.',
                '....#',
                '.#0..',
                '..*..',
                '..#..'],
      pieces: ['.....',
               'A....',
               '.....',
               '.C...',
               '....B'],
      colors: { A: 0, B: 1, C: 0 }
    },
    {
      id: 77, name: 'CATALYST', par: 11,   // ways 1 · luck 0.00% · 213 states · fatal tilts · 25% dead ends
      terrain: ['.#...',
                '...#.',
                '.#..0',
                '....#',
                '.1.*.'],
      pieces: ['.....',
               '....B',
               'C....',
               '..A..',
               '.....'],
      colors: { A: 0, B: 1, C: 0 }
    },
    {
      id: 78, name: 'REAGENT', par: 11,   // ways 2 · luck 0.00% · 264 states · fatal tilts · 28% dead ends
      terrain: ['...#.',
                '.0...',
                '.*.#.',
                '.....',
                '.##1.'],
      pieces: ['.....',
               '.....',
               '....A',
               '..BC.',
               '.....'],
      colors: { A: 0, B: 0, C: 1 }
    },
    {
      id: 79, name: 'DISTIL', par: 12,   // ways 1 · luck 0.00% · 272 states · fatal tilts
      terrain: ['....#',
                '.....',
                '..#..',
                '0..#.',
                '#*.1.'],
      pieces: ['..C..',
               '.....',
               'B..A.',
               '.....',
               '.....'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 80, name: 'SYNTHESIS', par: 12,   // ways 2 · luck 0.00% · 216 states · fatal tilts · chain ×2
      terrain: ['..#*0',
                '#....',
                '1#...',
                '.....',
                '#....'],
      pieces: ['.....',
               '.....',
               '....B',
               '..AC.',
               '.....'],
      colors: { A: 0, B: 0, C: 1 }
    },

    // ── CHAPTER 9 · STRUCTURE  (stages 81–90, par 9–13) ────────────────────────────────────
    // Mass and colour. A wide block that will not fit through a gap is a wall you have to plan around, and now it has a colour that decides where it must end up.
    {
      id: 81, name: 'ARMATURE', par: 9,   // ways 1 · luck 0.00% · 402 states
      terrain: ['.0...',
                '.0.#.',
                '.#...',
                '.1...',
                '....#'],
      pieces: ['....C',
               'B....',
               '....A',
               '....A',
               '.....'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 82, name: 'BUTTRESS', par: 9,   // ways 1 · luck 0.00% · 278 states · chain ×2
      terrain: ['1...#',
                '.#..1',
                '...#1',
                '.....',
                '.#0..'],
      pieces: ['.....',
               '..B..',
               '.....',
               'A...C',
               'A....'],
      colors: { A: 1, B: 0, C: 1 }
    },
    {
      id: 83, name: 'CANTILEVER', par: 10,   // ways 1 · luck 0.00% · 416 states
      terrain: ['....#',
                '...#.',
                '#...0',
                '...1.',
                '..#1.'],
      pieces: ['.BA..',
               'C.A..',
               '.....',
               '.....',
               '.....'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 84, name: 'LINTEL', par: 10,   // ways 1 · luck 0.00% · 419 states
      terrain: ['.....',
                '....#',
                '.#..1',
                '.0#.1',
                '.....'],
      pieces: ['.....',
               '.....',
               'A....',
               'A..C.',
               '...B.'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 85, name: 'PYLON', par: 11,   // ways 1 · luck 0.00% · 334 states
      terrain: ['...#1',
                '.....',
                '#..00',
                '....#',
                '.....'],
      pieces: ['AAB..',
               '..C..',
               '.....',
               '.....',
               '.....'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 86, name: 'MULLION', par: 11,   // ways 2 · luck 0.00% · 369 states
      terrain: ['.....',
                '.0#..',
                '.#...',
                '.1...',
                '#11#.'],
      pieces: ['.....',
               '...B.',
               '...AA',
               '..C..',
               '.....'],
      colors: { A: 1, B: 1, C: 0 }
    },
    {
      id: 87, name: 'ARCHITRAVE', par: 12,   // ways 1 · luck 0.00% · 544 states
      terrain: ['.....',
                '...#.',
                '#....',
                '0#...',
                '11..#'],
      pieces: ['..AA.',
               '..C..',
               '.....',
               '...B.',
               '.....'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 88, name: 'SPANDREL', par: 12,   // ways 1 · luck 0.00% · 452 states
      terrain: ['..#0.',
                '.....',
                '...#.',
                '#...#',
                '.#.11'],
      pieces: ['B....',
               '...AA',
               '..C..',
               '.....',
               '.....'],
      colors: { A: 1, B: 0, C: 0 }
    },
    {
      id: 89, name: 'VAULT', par: 13,   // ways 2 · luck 0.00% · 379 states
      terrain: ['.....',
                '00#.0',
                '....0',
                '....#',
                '1#...'],
      pieces: ['.....',
               '...C.',
               '.A...',
               '.A...',
               '...BB'],
      colors: { A: 0, B: 0, C: 1 }
    },
    {
      id: 90, name: 'CAPSTONE', par: 13,   // ways 1 · luck 0.00% · 255 states · chain ×2 · 32% dead ends
      terrain: ['.....',
                '.#...',
                '...#.',
                '0...0',
                '0#..1'],
      pieces: ['B.C.A',
               '....A',
               '.....',
               '.....',
               '.....'],
      colors: { A: 0, B: 0, C: 1 }
    },

    // ── CHAPTER 10 · CONVERGENCE  (stages 91–100, par 10–14) ──────────────────────────────────
    // Mass, colour and the void on one board, on the largest grids in the game. Nothing new — everything at once, and up to fourteen moves of it.
    {
      id: 91, name: 'CONFLUENCE', par: 10,   // ways 2 · luck 0.00% · 377 states · fatal tilts · chain ×2
      terrain: ['#...1.',
                '......',
                '.1..#.',
                '.1...#',
                '0#..*.'],
      pieces: ['..DB..',
               '..A...',
               '..A...',
               '......',
               '..C...'],
      colors: { A: 1, B: 0, C: 0, D: 1 }
    },
    {
      id: 92, name: 'MERIDIAN', par: 10,   // ways 1 · luck 0.00% · 678 states · fatal tilts · 84% dead ends
      terrain: ['0..#11',
                '#.1...',
                '..#...',
                '...#..',
                '.*....'],
      pieces: ['......',
               '.....C',
               'BD....',
               'AA....',
               '......'],
      colors: { A: 1, B: 1, C: 0, D: 0 }
    },
    {
      id: 93, name: 'ESCAPEMENT', par: 11,   // ways 1 · luck 0.00% · 430 states · fatal tilts
      terrain: ['#.00.',
                '...#.',
                '..#..',
                '....#',
                '#.1.*'],
      pieces: ['.....',
               '....B',
               '.....',
               '.CAA.',
               '.....'],
      colors: { A: 0, B: 1, C: 1 }
    },
    {
      id: 94, name: 'GYRE', par: 11,   // ways 1 · luck 0.00% · 1057 states · fatal tilts · chain ×2
      terrain: ['.....1',
                '....#1',
                '..*...',
                '..#..0',
                '.....#'],
      pieces: ['..D...',
               'B.....',
               '....A.',
               '...CA.',
               '......'],
      colors: { A: 1, B: 0, C: 0, D: 0 }
    },
    {
      id: 95, name: 'LABYRINTH', par: 12,   // ways 1 · luck 0.00% · 731 states · fatal tilts
      terrain: ['#.....',
                '....0#',
                '......',
                '..1#..',
                '1.1.*.'],
      pieces: ['......',
               '......',
               '..C.A.',
               '....A.',
               '.D.B..'],
      colors: { A: 1, B: 0, C: 0, D: 1 }
    },
    {
      id: 96, name: 'CALIBRATE', par: 12,   // ways 1 · luck 0.00% · 572 states · fatal tilts · chain ×2
      terrain: ['.11*#0',
                '1#....',
                '......',
                '.....#',
                '......'],
      pieces: ['......',
               '..C...',
               'AA.B..',
               '....D.',
               '......'],
      colors: { A: 1, B: 1, C: 1, D: 0 }
    },
    {
      id: 97, name: 'ASCENDANT', par: 13,   // ways 2 · luck 0.00% · 542 states · fatal tilts · chain ×2 · 29% dead ends
      terrain: ['.0#...',
                '00#...',
                '......',
                '1.....',
                '..*.#.'],
      pieces: ['......',
               '......',
               '....D.',
               '.A.BC.',
               '.A....'],
      colors: { A: 0, B: 1, C: 0, D: 0 }
    },
    {
      id: 98, name: 'TERMINUS', par: 13,   // ways 2 · luck 0.00% · 632 states · fatal tilts · chain ×2 · 32% dead ends
      terrain: ['..#.*.',
                '......',
                '....#.',
                '...#1.',
                '00...0'],
      pieces: ['......',
               'C.B...',
               '.AA...',
               'D.....',
               '......'],
      colors: { A: 0, B: 1, C: 1, D: 0 }
    },
    {
      id: 99, name: 'ZENITH', par: 14,   // ways 1 · luck 0.00% · 1111 states · fatal tilts · chain ×2
      terrain: ['#0#...',
                '..#*11',
                '1.....',
                '...##.',
                '.#....'],
      pieces: ['......',
               '......',
               '....C.',
               '.AA...',
               'B..D..'],
      colors: { A: 1, B: 1, C: 0, D: 0 }
    },
    {
      id: 100, name: 'TILT II', par: 14,   // ways 1 · luck 0.00% · 271 states · fatal tilts · chain ×2 · 80% dead ends
      terrain: ['..0##.',
                '....#.',
                '......',
                '.*.1.0',
                '.#.#.0'],
      pieces: ['D.....',
               '......',
               '....AB',
               '....A.',
               '....C.'],
      colors: { A: 0, B: 1, C: 0, D: 1 }
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
