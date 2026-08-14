'use strict';
/*
 * TILT — stage data.
 *
 *   terrain: '.' floor  '#' wall  '*' pit
 *            'o' goal (any colour)   '0' '1' '2' goal (that colour only)
 *   pieces:  '.' empty  'A'..'Z'  one letter = one piece
 *            (a letter repeated across adjacent cells = one rigid multi-cell piece)
 *   colors:  { A: 0, B: 1, ... }  — defaults to 0
 *
 * `note` is the design purpose: what this board exists to make the player realise.
 * `hint` is the only text the player is ever shown, and only where a new idea lands.
 * `par` is the proven shortest solution — every value here is verified by
 * tools/audit.js against the real engine, not asserted by hand.
 *
 * Every wall, pit, goal and piece below survived the deletion test in
 * tools/audit.js: remove any one of them and the puzzle measurably changes.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var STAGES = [

    // ── ACT I ── the gravity is yours ────────────────────────────────────────
    {
      id: 1, name: 'DROP', par: 2,
      note: 'Gravity exists and it answers to you. One piece, one goal, nothing to fear.',
      hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
      terrain: ['...',
                '...',
                '..o'],
      pieces:  ['A..',
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
      pieces:  ['A..',
                '...',
                '...']
    },
    {
      id: 3, name: 'TWO', par: 2,
      note: 'A second piece. One goal serves both — and pieces pile up against each other.',
      terrain: ['..o',
                '...',
                '...'],
      pieces:  ['A..',
                'B..',
                '...']
    },
    {
      id: 4, name: 'FOLLOW', par: 4,
      note: 'The last tilt sends both pieces home at once. First taste of a chain.',
      terrain: ['...',
                '..#',
                '..o'],
      pieces:  ['..B',
                'A..',
                '...']
    },
    {
      id: 5, name: 'NOTCH', par: 4,
      note: 'The goal sits in the top edge behind a wall. Neither piece can arrive straight.',
      terrain: ['.o.',
                '.#.',
                '...'],
      pieces:  ['...',
                '...',
                'AB.']
    },

    // ── ACT II ── pieces are furniture ───────────────────────────────────────
    {
      id: 6, name: 'STACK', par: 5,
      note: 'Three pieces in one column. They are each other\'s floor — the order they unstack is the puzzle.',
      terrain: ['..#',
                '#.o',
                '...'],
      pieces:  ['.C.',
                '.B.',
                '.A.']
    },
    {
      id: 7, name: 'LAP', par: 6,
      note: 'Two walls on opposite corners. Six moves out of nine cells, and exactly one line works.',
      terrain: ['.#o',
                '...',
                '..#'],
      pieces:  ['A..',
                '...',
                '.B.']
    },

    // ── ACT III ── the void ──────────────────────────────────────────────────
    {
      id: 8, name: 'VOID', par: 3,
      note: 'The pit. The most obvious first tilt deletes your only piece — learned in one tap, undone in one tap.',
      hint: { ja: '穴に落ちたブロックは消える', en: 'Pits swallow blocks' },
      terrain: ['..*',
                '..o',
                '...'],
      pieces:  ['A..',
                '...',
                '...']
    },
    {
      id: 9, name: 'LEDGE', par: 5,
      note: 'A pit above, a wall beside the goal. Half of all tilts here cost you a piece.',
      terrain: ['..*',
                '.#o',
                '...'],
      pieces:  ['.A.',
                '...',
                '..B']
    },
    {
      id: 10, name: 'BRINK', par: 5,
      note: 'The pit sits mid-board where both pieces must cross it. Survival is a matter of order.',
      terrain: ['.o#',
                '...',
                '.*.'],
      pieces:  ['...',
                '..B',
                'A..']
    },

    // ── ACT IV ── colour ─────────────────────────────────────────────────────
    {
      id: 11, name: 'HUE', par: 4,
      note: 'Colour is taught by disappointment: a piece lands squarely on a goal and nothing happens.',
      hint: { ja: '色が合ったゴールだけ入る', en: 'Colours must match' },
      terrain: ['...',
                '...',
                '01.'],
      pieces:  ['A..',
                'B..',
                '...'],
      colors:  { A: 0, B: 1 }
    },
    {
      id: 12, name: 'SPLIT', par: 5,
      note: 'Two goals side by side in the wrong order. The wall between them is the whole problem.',
      terrain: ['1#0',
                '...',
                '...'],
      pieces:  ['...',
                '.B.',
                '.A.'],
      colors:  { A: 0, B: 1 }
    },
    {
      id: 13, name: 'SORT', par: 6,
      note: 'Wrong-coloured goals are just floor. Sliding over one is free; stopping on one is a wasted move.',
      terrain: ['....',
                '1.#.',
                '.#0.',
                '....'],
      pieces:  ['.B..',
                '....',
                'A...',
                '....'],
      colors:  { A: 0, B: 1 }
    },

    // ── ACT V ── bigger bodies ───────────────────────────────────────────────
    {
      id: 14, name: 'WIDE', par: 4,
      note: 'A two-cell piece. It only counts when the whole body is home — half in is not in.',
      hint: { ja: '大きなブロックは全部入れる', en: 'The whole block must fit' },
      terrain: ['....',
                '....',
                '...#',
                '#.oo'],
      pieces:  ['AA..',
                '....',
                '....',
                '....']
    },
    {
      id: 15, name: 'LEVER', par: 7,
      note: 'The wide piece is also the best wall you own. Park it, then use it.',
      terrain: ['....',
                '#...',
                'oo..',
                '#...'],
      pieces:  ['....',
                '...B',
                '....',
                '.AA.']
    },
    {
      id: 16, name: 'FIT', par: 7,
      note: 'A tall goal and a wide goal. Pieces cannot turn, so each shape has exactly one home.',
      terrain: ['....',
                '.#.o',
                '...o',
                '.oo#'],
      pieces:  ['BBA.',
                '..A.',
                '....',
                '....']
    },

    // ── ACT VI ── everything at once ─────────────────────────────────────────
    {
      id: 17, name: 'CASCADE', par: 6,
      note: 'Four pieces, one goal, and the LAST tilt sends three of them home in a single sweep. ' +
            'Searched specifically for a board whose cascade is the finale rather than a mid-game accident.',
      terrain: ['..#o',
                '....',
                '.#..',
                '..#.'],
      pieces:  ['C...',
                '.ABD',
                '....',
                '....']
    },
    {
      id: 18, name: 'NERVE', par: 8,
      note: 'Colour, a pit and a chain on one small board. Thirty-seven different tilts here will cost you a piece.',
      terrain: ['....',
                '..#.',
                '*.1.',
                '0...'],
      pieces:  ['....',
                '.B..',
                '...A',
                '...C'],
      colors:  { A: 1, B: 0, C: 1 }
    },
    {
      id: 19, name: 'PRISM', par: 9,
      note: 'Three colours, three goals, three separate laps around the same board.',
      terrain: ['.....',
                '#....',
                '2.1.#',
                '##...',
                '.0...'],
      pieces:  ['..B..',
                '.....',
                '.....',
                '..A..',
                'C....'],
      colors:  { A: 1, B: 0, C: 2 }
    },
    {
      id: 20, name: 'TILT', par: 10,
      note: 'The finale. A wide piece, a pit, two colours, ten moves, and exactly one line through it.',
      terrain: ['.....',
                '..11#',
                '.*..#',
                '...#.',
                '.0...'],
      pieces:  ['AA...',
                '.....',
                '..C..',
                '.....',
                'B....'],
      colors:  { A: 1, B: 0, C: 0 }
    }
  ];

  return { STAGES: STAGES };
});
