'use strict';
/*
 * TILT — five-stage ice campaign.
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
      name: 'GRAVITY',
      ja: '重力',
      from: 1,
      to: 5,
      note: 'Swipe the ice world. Glide each penguin onto its aurora while avoiding cracked ice.'
    }
  ];

  var STAGES = [
    {
      id: 1, name: 'HOME', par: 1,
      idea: 'A swipe changes gravity and makes the penguin glide.',
      hint: { ja: 'スワイプした方向へペンギンが滑る', en: 'Swipe to make the penguin glide with gravity.' },
      board: ['.....',
              '.....',
              '.#...',
              '..A.a',
              '..x..']
    },
    {
      id: 2, name: 'GLIDE', par: 3,
      idea: 'Every penguin shares the same gravity.',
      hint: { ja: 'すべてのペンギンが同じ方向へ滑る', en: 'Every penguin glides in the same direction.' },
      board: ['b....',
              '...xa',
              '.....',
              '.x.#B',
              '..A..']
    },
    {
      id: 3, name: 'CRACK', par: 4,
      idea: 'Cracked ice is safe to cross, but unsafe to stop on.',
      hint: { ja: 'ヒビ氷は通過できる。止まると氷が割れる', en: 'Cross cracked ice, but do not stop on it.' },
      board: ['.....',
              'A..#x',
              '.....',
              '...Ba',
              'bx...']
    },
    {
      id: 4, name: 'AURORA', par: 5,
      idea: 'Passing over an aurora is not enough; the penguin must stop there.',
      hint: { ja: 'オーロラ渦の上にちょうど止める', en: 'Come to rest exactly on the aurora.' },
      board: ['#B.b.',
              'a....',
              '....x',
              '...A.',
              '..x..']
    },
    {
      id: 5, name: 'AWAY', par: 7,
      idea: 'Use the wall, the other penguin and both safe routes together.',
      hint: { ja: '壁ともう一羽をストッパーにして最短7手を目指す', en: 'Use the wall and the other penguin as brakes. Best: 7.' },
      board: ['.....',
              '.....',
              'b...a',
              '.xA.#',
              'B..x.']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});

