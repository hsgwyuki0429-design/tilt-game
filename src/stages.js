'use strict';
/*
 * TILT — five-stage campaign.
 *
 * Every board uses the same rule set:
 *   - one or two movable blocks (never more)
 *   - exactly one matching goal for each block
 *   - a block is collected only when it stops on its own goal
 *   - blocks may stop each other, but touching is never a win condition
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TiltStages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var CHAPTERS = [
    {
      number: 1,
      name: 'TWO PATHS',
      ja: 'ふたつの道',
      from: 1,
      to: 5,
      note: 'Up to two blocks, with one matching goal each. Move the world with a swipe and bring every colour home.'
    }
  ];

  var STAGES = [
    {
      id: 1, name: 'HOME', par: 1,
      idea: 'A swipe changes gravity and moves every block.',
      hint: { ja: 'スワイプした方向へブロックが動く', en: 'Swipe to move the block with gravity.' },
      board: ['a..',
              '...',
              'A..']
    },
    {
      id: 2, name: 'TURN', par: 3,
      idea: 'A block only disappears on the goal with the same colour.',
      hint: { ja: 'ブロックと同じ色・形のゴールだけが対応する', en: 'Only the matching colour and shape accepts a block.' },
      board: ['abB',
              'A..',
              '#..']
    },
    {
      id: 3, name: 'BRAKE', par: 4,
      idea: 'Touching blocks are useful as brakes, but touching never clears the stage.',
      hint: { ja: 'ブロック同士が触れてもクリアではない。止める壁として使える', en: 'Touching is not a win. Use the other block as a brake.' },
      board: ['abB',
              'A..',
              '..#']
    },
    {
      id: 4, name: 'CROSS', par: 6,
      idea: 'The two routes share one gravity, so order matters.',
      board: ['#a..',
              '.A.#',
              '.b.B']
    },
    {
      id: 5, name: 'TWO PATHS', par: 8,
      idea: 'The final board asks you to plan both routes together.',
      board: ['aA#.',
              'B.#b',
              '....']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});

