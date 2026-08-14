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
 * Every `par` is a breadth-first-proven shortest solution. Every wall, block and goal
 * survived deletion testing: remove any one of them and the puzzle measurably changes.
 * The comment on each stage is why THAT board was chosen over the thousands of others
 * of the same length. Verified by tools/audit.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltStages = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CHAPTERS = [
    { number: 1, name: 'GRAVITY', ja: '重力', from: 1, to: 5,
      note: 'Everything the game is made of, one idea per board: gravity moves things, walls stop them, blocks stop each other, and the way out is rarely the way you are facing.' },
    { number: 2, name: 'NINE', ja: '九マス', from: 6, to: 10,
      note: 'Nine cells and nothing added. Every board in this chapter fits in a single glance and none of them can be solved in a single glance — which is the whole argument of the game, made on the smallest board it owns.' },
    { number: 3, name: 'ORDER', ja: '順番', from: 11, to: 15,
      note: 'Blocks are each other\'s walls. Now there are enough of them that the question stops being "which way" and becomes "which one, first".' },
    { number: 4, name: 'CONVERGENCE', ja: '収束', from: 16, to: 20,
      note: 'One goal, and a small board packed with blocks that all have to reach it. Nothing new — the boards barely even get bigger. There is just no slack left anywhere in them.' }
  ];

  var STAGES = [

    // ── CHAPTER 1 · GRAVITY · 重力  (stages 1–5, par 2–6) ────────────────────────────────
    // Everything the game is made of, one idea per board: gravity moves things, walls stop them, blocks stop each other, and the way out is rarely the way you are facing.
    {
      id: 1, name: 'DROP', par: 2,   // 2 pieces · 0 wrong-way tilts · 0/2 openings wrong · greedy takes 2 · 1 set-up · 4 states · ways 2
      purpose: 'Gravity exists and it answers to you.',
      note: 'One block, one goal, nothing to be afraid of. The only stage in the game you can solve ' +
            'without thinking, and that is its job.',
      hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
      board: ['@..',
              '...',
              '..o']
    },
    {
      id: 2, name: 'TWO', par: 2,   // 3 pieces · 0 wrong-way tilts · 1/2 openings wrong · greedy takes 2 · 1 set-up · 9 states · finale ×2 · ways 1
      purpose: 'Every block is the same block, and one goal takes them all.',
      note: 'The last tilt sends both home at once — the first chain in the game, on the third move ' +
            'you will ever make.',
      hint: { ja: 'ブロックはすべて同じ。ゴールはどれでも受け取る', en: 'Every block is the same' },
      board: ['@..',
              '@..',
              '..o']
    },
    {
      id: 3, name: 'STOP', par: 3,   // 3 pieces · 1 wrong-way tilts · 0/1 openings wrong · greedy loops forever · 2 set-up · 4 states · ways 1
      purpose: 'Walls stop blocks — so the straight line is not always open.',
      note: 'The goal is two cells away in a straight line and that line is closed. The detour is the ' +
            'player\'s own idea, which is the point.',
      hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
      board: ['@#o',
              '...',
              '...']
    },
    {
      id: 4, name: 'SHUNT', par: 5,   // 5 pieces · 1 wrong-way tilts · 2/4 openings wrong · greedy takes 5 · 2 set-up · 15 states · ways 2
      purpose: 'A block is a wall for another block — so order starts to matter.',
      note: 'Move the wrong one first and the other has nowhere to go. Nothing is lost by finding ' +
            'that out: undo costs nothing and is meant to be used.',
      hint: { ja: 'ブロックは他のブロックも止める', en: 'Blocks stop each other too' },
      board: ['.@.',
              '@#o',
              '.#.']
    },
    {
      id: 5, name: 'LAP', par: 6,   // 5 pieces · 2 wrong-way tilts · 2/3 openings wrong · greedy loops forever · 3 set-up · 16 states · ways 1
      purpose: 'The way out is not the way you are facing.',
      note: 'Two walls on opposite corners. Both blocks have to travel away from the goal before they ' +
            'can reach it — and a player who only ever tilts toward the goal circles this board ' +
            'forever without solving it. Six moves, one line, nine cells.',
      board: ['@#o',
              '...',
              '.@#']
    },

    // ── CHAPTER 2 · NINE · 九マス  (stages 6–10, par 7–13) ───────────────────────────────────
    // Nine cells and nothing added. Every board in this chapter fits in a single glance and none of them can be solved in a single glance — which is the whole argument of the game, made on the smallest board it owns.
    {
      id: 6, name: 'DETOUR', par: 7,   // 6 pieces · 2 wrong-way tilts · 2/3 openings wrong · greedy loops forever · 0 set-up · 21 states · ways 1
      purpose: 'The first board that punishes heading straight for the goal.',
      board: ['@#o',
              '@#.',
              '..@']
    },
    {
      id: 7, name: 'PIVOT', par: 8,   // 6 pieces · 2 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 1 set-up · 21 states · ways 2
      purpose: 'Most of the openings are wrong. Choosing between them is the puzzle.',
      board: ['#.@',
              '.@.',
              'o#@']
    },
    {
      id: 8, name: 'THREAD', par: 9,   // 7 pieces · 2 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 0 set-up · 31 states · ways 2
      purpose: 'Nine moves, and only one way to make them.',
      board: ['@@.',
              '#.@',
              'o@#']
    },
    {
      id: 9, name: 'CIRCLE', par: 10,   // 7 pieces · 2 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 1 set-up · 31 states · ways 2
      purpose: 'A player who never thinks walks this board in a loop forever.',
      board: ['o#@',
              '.@.',
              '#@@']
    },
    {
      id: 10, name: 'NINE', par: 13,   // 8 pieces · 2 wrong-way tilts · 2/3 openings wrong · greedy loops forever · 0 set-up · 49 states · ways 1
      purpose: 'What nine cells can hold when every one of them is doing work.',
      board: ['@o#',
              '.#@',
              '@@@']
    },

    // ── CHAPTER 3 · ORDER · 順番  (stages 11–15, par 14–24) ──────────────────────────────────
    // Blocks are each other's walls. Now there are enough of them that the question stops being "which way" and becomes "which one, first".
    {
      id: 11, name: 'QUEUE', par: 14,   // 8 pieces · 5 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 0 set-up · 98 states · ways 1
      purpose: 'One cell wider than chapter two, and the extra room is where the detours live.',
      board: ['.@@@',
              '@.#.',
              '.#o@']
    },
    {
      id: 12, name: 'INTERLOCK', par: 17,   // 8 pieces · 6 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 2 set-up · 105 states · ways 2
      purpose: 'Every block is in another block\'s way. Very few release orders work.',
      board: ['.o#@',
              '.#@.',
              '.@@@']
    },
    {
      id: 13, name: 'TUMBLER', par: 18,   // 10 pieces · 8 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 2 set-up · 171 states · finale ×2 · ways 2
      purpose: 'Sixteen cells, and the first board you cannot hold whole in your head.',
      board: ['.@..',
              '@#..',
              '.@#o',
              '#@@#']
    },
    {
      id: 14, name: 'ESCAPEMENT', par: 21,   // 11 pieces · 7 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 3 set-up · 271 states · ways 1
      purpose: 'A long arrangement before anything at all is collected.',
      board: ['...#',
              'o#@@',
              '#@@.',
              '.@#@']
    },
    {
      id: 15, name: 'ORDER', par: 24,   // 12 pieces · 9 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 1 set-up · 283 states · ways 2
      purpose: 'The chapter\'s thesis: same three things, and the only question is which one first.',
      board: ['@@.@',
              '.@#.',
              '@#o.',
              '@@##']
    },

    // ── CHAPTER 4 · CONVERGENCE · 収束  (stages 16–20, par 28–50) ────────────────────────────
    // One goal, and a small board packed with blocks that all have to reach it. Nothing new — the boards barely even get bigger. There is just no slack left anywhere in them.
    {
      id: 16, name: 'PRESSURE', par: 28,   // 13 pieces · 10 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 1 set-up · 392 states · ways 9
      purpose: 'Sixteen cells, half of them full. Nothing can move until something else has.',
      board: ['@@#@',
              '#@@.',
              'o#@@',
              '..@#']
    },
    {
      id: 17, name: 'FUNNEL', par: 34,   // 13 pieces · 12 wrong-way tilts · 2/4 openings wrong · greedy loops forever · 4 set-up · 351 states · ways 2
      purpose: 'Many blocks, one exit, and a queue that has to be built before it can be emptied.',
      board: ['##@..',
              '@@@#.',
              '@.#.@',
              '.#o.#']
    },
    {
      id: 18, name: 'MARSHAL', par: 37,   // 15 pieces · 14 wrong-way tilts · 1/3 openings wrong · greedy loops forever · 3 set-up · 789 states · ways 5
      purpose: 'Twenty cells and nine blocks: the board is the traffic jam.',
      board: ['.o#@@',
              '.#@@@',
              '.#@@@',
              '.@@.#']
    },
    {
      id: 19, name: 'KEYSTONE', par: 45,   // 14 pieces · 12 wrong-way tilts · 3/4 openings wrong · greedy loops forever · 4 set-up · 599 states · ways 2
      purpose: 'One block is the plug. Everything waits on working out which.',
      board: ['@.@#.',
              '.#@@@',
              '..#@.',
              '#o#@@']
    },
    {
      id: 20, name: 'TILT', par: 50,   // 18 pieces · 19 wrong-way tilts · 2/3 openings wrong · greedy loops forever · 3 set-up · 1255 states · ways 1
      purpose: 'The finale. Twenty-five cells, one goal, and about fifty tilts of nothing but gravity, ' +
               'walls and blocks.',
      board: ['.o#@@',
              '.#@@@',
              '..@@#',
              '#..@@',
              '.#@@@']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
