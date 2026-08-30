'use strict';
/*
 * TILT — the ice campaign. GENERATED FILE: see tools/build-stages.js.
 *
 * 100 boards, all 5×5, laid out along one straight difficulty line:
 * stage 1 is one swipe, stage 100 is the longest board an exhaustive
 * search of the 5×5 space could find (53 moves), and each stage in
 * between sits on the line between them.
 *
 * Every board obeys the same rules:
 *   - one or two penguins, never two of a colour
 *   - exactly one matching aurora for each penguin
 *   - a penguin is collected only when it STOPS on its own aurora
 *   - a grey drifter (G) slides but is never collected, and can plug an aurora
 *
 * Within a given length the emptiest board wins: fewest immovable obstacles
 * first, then fewest drifters. Every par below was verified by re-solving the
 * board with src/engine.js.
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
      to: 10,
      note: 'Swipe, and the world falls. Every penguin glides until something stops it.'
    },
    {
      number: 2,
      name: 'BRAKES',
      ja: 'ブレーキ',
      from: 11,
      to: 20,
      note: 'The edge, a wall and the other penguin are the only three things that stop a glide.'
    },
    {
      number: 3,
      name: 'DRIFTERS',
      ja: '流氷',
      from: 21,
      to: 30,
      note: 'Grey ice slides too, and no aurora will take it. Push it, or work around it.'
    },
    {
      number: 4,
      name: 'PATIENCE',
      ja: '布石',
      from: 31,
      to: 40,
      note: 'The move that collects a penguin is rarely the move that aims at its aurora.'
    },
    {
      number: 5,
      name: 'CORNERS',
      ja: '角',
      from: 41,
      to: 50,
      note: 'Two penguins, one gravity. Park one where the other one needs a wall.'
    },
    {
      number: 6,
      name: 'ORBITS',
      ja: '周回',
      from: 51,
      to: 60,
      note: 'Boards that answer a straight line with a long way round.'
    },
    {
      number: 7,
      name: 'LOCKS',
      ja: '封鎖',
      from: 61,
      to: 70,
      note: 'A drifter resting on an aurora is a door. Open it in the right order.'
    },
    {
      number: 8,
      name: 'LONG ICE',
      ja: '長氷',
      from: 71,
      to: 80,
      note: 'Nothing here is difficult to see. It is difficult to sequence.'
    },
    {
      number: 9,
      name: 'DEEP COLD',
      ja: '極寒',
      from: 81,
      to: 90,
      note: 'The far end of the search. Every one of these was measured, not guessed.'
    },
    {
      number: 10,
      name: 'MERIDIAN',
      ja: '子午線',
      from: 91,
      to: 100,
      note: 'The longest boards a 5×5 ice tray can hold.'
    }
  ];

  var STAGES = [
    {
      id: 1, name: 'HOME', par: 1,
      idea: 'one penguin, an empty tray; 1 move.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短1手。', en: 'A penguin is collected only when it stops on its aurora. Best: 1.' },
      board: ['aA...',
              '.....',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 2, name: 'DRIFT', par: 2,
      idea: 'two penguins, 1 drifter, 2 walls; 2 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短2手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 2.' },
      board: ['A...#',
              'G...#',
              'b....',
              'a....',
              'B....']
    },
    {
      id: 3, name: 'GLIDE', par: 2,
      idea: 'two penguins, 3 walls; 2 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短2手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 2.' },
      board: ['....b',
              '.#..A',
              '....B',
              '...#a',
              '#....']
    },
    {
      id: 4, name: 'FLOE', par: 3,
      idea: 'two penguins, 3 walls; 3 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短3手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 3.' },
      board: ['baB..',
              'A.#..',
              '.....',
              '.#...',
              '....#']
    },
    {
      id: 5, name: 'SLIP', par: 3,
      idea: 'two penguins, 3 walls; 3 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短3手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 3.' },
      board: ['#....',
              '...#.',
              '.....',
              '.....',
              'ba#BA']
    },
    {
      id: 6, name: 'CALM', par: 4,
      idea: 'two penguins, 3 walls; 4 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短4手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 4.' },
      board: ['#....',
              '...#.',
              '.....',
              '....#',
              '.bBAa']
    },
    {
      id: 7, name: 'FROST', par: 4,
      idea: 'two penguins, 3 walls; 4 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短4手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 4.' },
      board: ['#BabA',
              '.....',
              '.....',
              '.#...',
              '....#']
    },
    {
      id: 8, name: 'SHELF', par: 5,
      idea: 'two penguins, 1 wall; 5 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短5手。', en: 'The wall and the other penguin are both brakes. Best: 5.' },
      board: ['a....',
              'B....',
              'b....',
              '.....',
              'A...#']
    },
    {
      id: 9, name: 'CRISP', par: 5,
      idea: 'one penguin, 1 wall; 5 moves.',
      hint: { ja: '壁の手前でちょうど止める。最短5手。', en: 'Stop short, against the wall. Best: 5.' },
      board: ['..#.A',
              '.....',
              '.....',
              '.....',
              '.a...']
    },
    {
      id: 10, name: 'DAWN', par: 6,
      idea: 'two penguins, 3 walls; 6 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短6手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 6.' },
      board: ['AB...',
              'a#...',
              '...#.',
              'b....',
              '....#']
    },
    {
      id: 11, name: 'RIME', par: 6,
      idea: 'two penguins, 3 walls; 6 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短6手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 6.' },
      board: ['a....',
              '#....',
              'B..#.',
              'A....',
              'b...#']
    },
    {
      id: 12, name: 'THAW', par: 7,
      idea: 'two penguins, 3 walls; 7 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短7手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 7.' },
      board: ['....#',
              'a....',
              'B....',
              'b#...',
              'A..#.']
    },
    {
      id: 13, name: 'SLEET', par: 7,
      idea: 'two penguins, 3 walls; 7 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短7手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 7.' },
      board: ['....#',
              '#....',
              'A....',
              'a....',
              'bB.#.']
    },
    {
      id: 14, name: 'BERG', par: 8,
      idea: 'two penguins, 3 walls; 8 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短8手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 8.' },
      board: ['A...#',
              '#....',
              '.....',
              'b..#.',
              'Ba...']
    },
    {
      id: 15, name: 'CRAG', par: 8,
      idea: 'two penguins, 3 walls; 8 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短8手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 8.' },
      board: ['A.Bba',
              '.#...',
              '.....',
              '..#..',
              '#....']
    },
    {
      id: 16, name: 'PALE', par: 9,
      idea: 'two penguins, 3 walls; 9 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短9手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 9.' },
      board: ['A....',
              'b....',
              'a...#',
              'B#...',
              '....#']
    },
    {
      id: 17, name: 'HUSH', par: 9,
      idea: 'two penguins, 3 walls; 9 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短9手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 9.' },
      board: ['....#',
              '..#..',
              '.#...',
              '.....',
              '.bBaA']
    },
    {
      id: 18, name: 'VEIL', par: 10,
      idea: 'two penguins, 3 walls; 10 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短10手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 10.' },
      board: ['.B#..',
              'b..#.',
              'A....',
              'a....',
              '....#']
    },
    {
      id: 19, name: 'SPUR', par: 10,
      idea: 'two penguins, 3 walls; 10 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短10手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 10.' },
      board: ['#....',
              '....b',
              '.....',
              '...a#',
              '.#.AB']
    },
    {
      id: 20, name: 'NORTH', par: 11,
      idea: 'two penguins, 1 wall; 11 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短11手。', en: 'The wall and the other penguin are both brakes. Best: 11.' },
      board: ['.a...',
              '.....',
              'bB...',
              '....#',
              'A....']
    },
    {
      id: 21, name: 'GLEAM', par: 12,
      idea: 'two penguins, 3 walls; 12 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短12手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 12.' },
      board: ['..#AB',
              '#....',
              '....b',
              '.....',
              '.#..a']
    },
    {
      id: 22, name: 'SNAP', par: 12,
      idea: 'two penguins, 3 walls; 12 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短12手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 12.' },
      board: ['b.a..',
              '...#.',
              '#....',
              'B...#',
              'A....']
    },
    {
      id: 23, name: 'RIDGE', par: 13,
      idea: 'two penguins, 3 walls; 13 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短13手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 13.' },
      board: ['.#...',
              '.....',
              '#...b',
              '..#aB',
              '....A']
    },
    {
      id: 24, name: 'BASIN', par: 13,
      idea: 'two penguins, 3 walls; 13 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短13手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 13.' },
      board: ['B..A.',
              'a....',
              'b...#',
              '.#...',
              '...#.']
    },
    {
      id: 25, name: 'FJORD', par: 14,
      idea: 'two penguins, 3 walls; 14 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短14手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 14.' },
      board: ['..#..',
              '....#',
              'aA...',
              '.#...',
              'Bb...']
    },
    {
      id: 26, name: 'SHARD', par: 14,
      idea: 'two penguins, 3 walls; 14 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短14手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 14.' },
      board: ['.#...',
              '...#.',
              '..b..',
              '..#a.',
              'A..B.']
    },
    {
      id: 27, name: 'PRISM', par: 15,
      idea: 'two penguins, 3 walls; 15 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短15手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 15.' },
      board: ['.....',
              '#a...',
              '....#',
              '....A',
              '.b.#B']
    },
    {
      id: 28, name: 'GLINT', par: 15,
      idea: 'two penguins, 3 walls; 15 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短15手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 15.' },
      board: ['.....',
              '.A.#.',
              '.B..#',
              '.#...',
              '.ab..']
    },
    {
      id: 29, name: 'HOAR', par: 16,
      idea: 'two penguins, 3 walls; 16 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短16手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 16.' },
      board: ['....A',
              '...#B',
              '#...a',
              '..#.b',
              '.....']
    },
    {
      id: 30, name: 'BLUE', par: 16,
      idea: 'two penguins, 3 walls; 16 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短16手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 16.' },
      board: ['....#',
              '#A...',
              '...#.',
              '.....',
              'Ba.b.']
    },
    {
      id: 31, name: 'CLEFT', par: 17,
      idea: 'two penguins, 2 walls; 17 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短17手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 17.' },
      board: ['..bB.',
              '.....',
              '.#...',
              '.....',
              '#..Aa']
    },
    {
      id: 32, name: 'WAKE', par: 17,
      idea: 'two penguins, 2 walls; 17 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短17手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 17.' },
      board: ['Bb.aA',
              '.....',
              '...#.',
              '.....',
              '#....']
    },
    {
      id: 33, name: 'SHOAL', par: 18,
      idea: 'two penguins, 2 walls; 18 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短18手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 18.' },
      board: ['#...b',
              '.#...',
              '....a',
              '.....',
              '...AB']
    },
    {
      id: 34, name: 'PACK', par: 18,
      idea: 'two penguins, 3 walls; 18 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短18手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 18.' },
      board: ['.#...',
              '.....',
              '....b',
              '.AB#.',
              '.a#..']
    },
    {
      id: 35, name: 'TIDE', par: 19,
      idea: 'two penguins, 2 walls; 19 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短19手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 19.' },
      board: ['ABab.',
              '.....',
              '#....',
              '.....',
              '....#']
    },
    {
      id: 36, name: 'SPIRE', par: 19,
      idea: 'two penguins, 2 walls; 19 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短19手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 19.' },
      board: ['..a.#',
              '.....',
              '.....',
              '.b...',
              '.#AB.']
    },
    {
      id: 37, name: 'BRINE', par: 20,
      idea: 'two penguins, 2 walls; 20 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短20手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 20.' },
      board: ['...#.',
              '.....',
              '.....',
              '.#b..',
              'BAa..']
    },
    {
      id: 38, name: 'CROWN', par: 20,
      idea: 'two penguins, 2 walls; 20 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短20手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 20.' },
      board: ['...#.',
              '...ba',
              '..#..',
              '.....',
              'AB...']
    },
    {
      id: 39, name: 'STILL', par: 21,
      idea: 'two penguins, 3 walls; 21 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短21手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 21.' },
      board: ['.#...',
              'b#...',
              'a...A',
              '..#..',
              '....B']
    },
    {
      id: 40, name: 'FLARE', par: 21,
      idea: 'two penguins, 3 walls; 21 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短21手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 21.' },
      board: ['.a.bB',
              '....A',
              '...##',
              '#....',
              '.....']
    },
    {
      id: 41, name: 'QUARTZ', par: 22,
      idea: 'two penguins, 3 walls; 22 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短22手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 22.' },
      board: ['....#',
              '#....',
              '.#A.B',
              '.a...',
              '...b.']
    },
    {
      id: 42, name: 'LEDGE', par: 23,
      idea: 'two penguins, 3 walls; 23 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短23手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 23.' },
      board: ['.#.BA',
              '.....',
              '...#.',
              '..#..',
              '...ba']
    },
    {
      id: 43, name: 'SLATE', par: 23,
      idea: 'two penguins, 3 walls; 23 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短23手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 23.' },
      board: ['aA..B',
              '.....',
              '.#b..',
              '...#.',
              '..#..']
    },
    {
      id: 44, name: 'MIST', par: 24,
      idea: 'two penguins, 1 drifter, 2 walls; 24 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短24手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 24.' },
      board: ['.b...',
              'AG...',
              '....#',
              '.B...',
              'a...#']
    },
    {
      id: 45, name: 'ARCH', par: 24,
      idea: 'two penguins, 3 walls; 24 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短24手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 24.' },
      board: ['#....',
              '.#..A',
              '.....',
              'B...b',
              '#..a.']
    },
    {
      id: 46, name: 'FLINT', par: 25,
      idea: 'two penguins, 3 walls; 25 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短25手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 25.' },
      board: ['.#...',
              '.#A.B',
              '.b...',
              '...#.',
              '..a..']
    },
    {
      id: 47, name: 'GLACE', par: 25,
      idea: 'two penguins, 3 walls; 25 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短25手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 25.' },
      board: ['.#...',
              '....a',
              '.B...',
              '...b.',
              '#A..#']
    },
    {
      id: 48, name: 'SIREN', par: 26,
      idea: 'two penguins, 3 walls; 26 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短26手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 26.' },
      board: ['A.ba.',
              'B....',
              '.....',
              '.#.#.',
              '...#.']
    },
    {
      id: 49, name: 'HOLLOW', par: 26,
      idea: 'two penguins, 3 walls; 26 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短26手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 26.' },
      board: ['....#',
              '.....',
              '#....',
              '.#b..',
              'BA.a.']
    },
    {
      id: 50, name: 'HALF', par: 27,
      idea: 'two penguins, 3 walls; 27 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短27手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 27.' },
      board: ['..b..',
              '...#.',
              '..#.#',
              'a.B..',
              '..A..']
    },
    {
      id: 51, name: 'AURORA', par: 27,
      idea: 'two penguins, 1 drifter, 3 walls; 27 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短27手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 27.' },
      board: ['Gb...',
              '.....',
              '#....',
              'Ba..#',
              'A.#..']
    },
    {
      id: 52, name: 'CINDER', par: 28,
      idea: 'two penguins, 1 drifter, 3 walls; 28 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短28手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 28.' },
      board: ['..#..',
              'A....',
              '...a#',
              '....G',
              '.#b.B']
    },
    {
      id: 53, name: 'BEACON', par: 28,
      idea: 'two penguins, 1 drifter, 3 walls; 28 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短28手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 28.' },
      board: ['.....',
              '#.#..',
              '.#...',
              '...aA',
              '.b.GB']
    },
    {
      id: 54, name: 'LANTERN', par: 29,
      idea: 'two penguins, 1 drifter, 3 walls; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['GB.#.',
              'A....',
              '#..ba',
              '....#',
              '.....']
    },
    {
      id: 55, name: 'HARBOUR', par: 29,
      idea: 'two penguins, 1 drifter, 3 walls; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['#...B',
              '.#..A',
              '...b.',
              '..#a.',
              '....G']
    },
    {
      id: 56, name: 'KEEL', par: 30,
      idea: 'two penguins, 1 drifter, 3 walls; 30 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短30手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 30.' },
      board: ['B.A..',
              '.aG..',
              '....#',
              'b.#..',
              '...#.']
    },
    {
      id: 57, name: 'ANCHOR', par: 30,
      idea: 'two penguins, 1 drifter, 3 walls; 30 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短30手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 30.' },
      board: ['..#.#',
              '.....',
              '.....',
              '.#.a.',
              'BGb.A']
    },
    {
      id: 58, name: 'MARINER', par: 31,
      idea: 'two penguins, 1 drifter, 3 walls; 31 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短31手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 31.' },
      board: ['BA...',
              '.#.G.',
              '...#.',
              '..a..',
              'b..#.']
    },
    {
      id: 59, name: 'COMPASS', par: 31,
      idea: 'two penguins, 1 drifter, 3 walls; 31 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短31手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 31.' },
      board: ['.AaG.',
              '..Bb.',
              '.#...',
              '.....',
              '#...#']
    },
    {
      id: 60, name: 'MERIDIAN', par: 32,
      idea: 'two penguins, 1 drifter, 3 walls; 32 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短32手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 32.' },
      board: ['....#',
              '.b...',
              '....#',
              '..#.B',
              'aG..A']
    },
    {
      id: 61, name: 'SOLSTICE', par: 33,
      idea: 'two penguins, 1 drifter, 3 walls; 33 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短33手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 33.' },
      board: ['...#.',
              'a#...',
              '....b',
              '.....',
              'A#GB.']
    },
    {
      id: 62, name: 'ZENITH', par: 33,
      idea: 'two penguins, 1 drifter, 3 walls; 33 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短33手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 33.' },
      board: ['...#.',
              '#.b..',
              'A....',
              'B..#a',
              'G....']
    },
    {
      id: 63, name: 'LATITUDE', par: 34,
      idea: 'two penguins, 1 drifter, 2 walls; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['...a.',
              '#BA.G',
              '.....',
              '.b...',
              '#....']
    },
    {
      id: 64, name: 'CURRENT', par: 34,
      idea: 'two penguins, 1 drifter, 3 walls; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['...GA',
              'Bb.#a',
              '.....',
              '.....',
              '#...#']
    },
    {
      id: 65, name: 'DRAUGHT', par: 35,
      idea: 'two penguins, 1 drifter, 3 walls; 35 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短35手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 35.' },
      board: ['Ab..#',
              '.a...',
              'B.G..',
              '#..#.',
              '.....']
    },
    {
      id: 66, name: 'CAVERN', par: 35,
      idea: 'two penguins, 1 drifter, 3 walls; 35 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短35手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 35.' },
      board: ['AG#..',
              '.abB.',
              '.....',
              '...#.',
              '...#.']
    },
    {
      id: 67, name: 'CHASM', par: 36,
      idea: 'two penguins, 1 drifter, 2 walls; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['..G.A',
              '...b.',
              '....B',
              '..#a.',
              '.#...']
    },
    {
      id: 68, name: 'FISSURE', par: 36,
      idea: 'two penguins, 1 drifter, 3 walls; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['G....',
              'A.ba#',
              '...#.',
              '.B.#.',
              '.....']
    },
    {
      id: 69, name: 'MORAINE', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短37手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 37.' },
      board: ['B#...',
              '.....',
              '..A.G',
              'b#a..',
              '.....']
    },
    {
      id: 70, name: 'CIRQUE', par: 37,
      idea: 'two penguins, 1 drifter, 3 walls; 37 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短37手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 37.' },
      board: ['.a.B.',
              'A#.#.',
              '.b..#',
              '.....',
              'G....']
    },
    {
      id: 71, name: 'SERAC', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短38手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 38.' },
      board: ['AG...',
              'Bb#..',
              '.....',
              '.....',
              '.a#..']
    },
    {
      id: 72, name: 'CREVASSE', par: 38,
      idea: 'two penguins, 2 drifters, 2 walls; 38 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短38手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 38.' },
      board: ['AG...',
              'Ga...',
              'B....',
              '...#.',
              'b.#..']
    },
    {
      id: 73, name: 'CORNICE', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['.#...',
              '.#...',
              '...a.',
              '....G',
              'GAb.B']
    },
    {
      id: 74, name: 'SUMMIT', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['Gb...',
              '..a.#',
              '....#',
              '.....',
              'ABG..']
    },
    {
      id: 75, name: 'TRAVERSE', par: 40,
      idea: 'two penguins, 1 drifter, 3 walls; 40 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短40手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 40.' },
      board: ['GA...',
              'Ba...',
              '....b',
              '#.#..',
              '.#...']
    },
    {
      id: 76, name: 'ASCENT', par: 40,
      idea: 'two penguins, 1 drifter, 3 walls; 40 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短40手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 40.' },
      board: ['.....',
              '..a..',
              'GB.##',
              'A.b#.',
              '.....']
    },
    {
      id: 77, name: 'PITON', par: 41,
      idea: 'two penguins, 1 drifter, 3 walls; 41 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短41手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 41.' },
      board: ['..#..',
              '.....',
              '..#.G',
              '.#...',
              'A.aBb']
    },
    {
      id: 78, name: 'BELAY', par: 41,
      idea: 'two penguins, 1 drifter, 3 walls; 41 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短41手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 41.' },
      board: ['#..#.',
              '.b.B.',
              '...G#',
              '....A',
              '....a']
    },
    {
      id: 79, name: 'CAIRN', par: 42,
      idea: 'two penguins, 1 drifter, 3 walls; 42 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短42手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 42.' },
      board: ['.....',
              '.....',
              '.##..',
              '#..aB',
              '.b.AG']
    },
    {
      id: 80, name: 'BEARING', par: 42,
      idea: 'two penguins, 1 drifter, 3 walls; 42 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短42手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 42.' },
      board: ['..BA.',
              '.....',
              '.#..#',
              '.....',
              '#bGa.']
    },
    {
      id: 81, name: 'POLARIS', par: 43,
      idea: 'two penguins, 1 drifter, 3 walls; 43 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短43手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 43.' },
      board: ['.G#.#',
              '...b.',
              'aB...',
              '.A...',
              '#....']
    },
    {
      id: 82, name: 'MIDNIGHT', par: 44,
      idea: 'two penguins, 1 drifter, 3 walls; 44 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短44手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 44.' },
      board: ['a..A.',
              '.b#B.',
              'G..##',
              '.....',
              '.....']
    },
    {
      id: 83, name: 'LONGNIGHT', par: 44,
      idea: 'two penguins, 1 drifter, 3 walls; 44 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短44手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 44.' },
      board: ['.B..b',
              '.G...',
              '#....',
              '#..a.',
              '.A..#']
    },
    {
      id: 84, name: 'WHITEOUT', par: 45,
      idea: 'two penguins, 1 drifter, 4 walls; 45 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短45手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 45.' },
      board: ['...BA',
              '.b#..',
              '..G#a',
              '..#..',
              '.#...']
    },
    {
      id: 85, name: 'BLIZZARD', par: 45,
      idea: 'two penguins, 1 drifter, 4 walls; 45 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短45手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 45.' },
      board: ['...#.',
              '.#...',
              '...aG',
              '.#b.B',
              '..#.A']
    },
    {
      id: 86, name: 'SQUALL', par: 46,
      idea: 'two penguins, 1 drifter, 4 walls; 46 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短46手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 46.' },
      board: ['a.#..',
              '#ABb.',
              '.#..#',
              'G....',
              '.....']
    },
    {
      id: 87, name: 'TEMPEST', par: 46,
      idea: 'two penguins, 1 drifter, 4 walls; 46 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短46手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 46.' },
      board: ['....G',
              '..#bB',
              '...aA',
              '.##..',
              '#....']
    },
    {
      id: 88, name: 'GALE', par: 47,
      idea: 'two penguins, 1 drifter, 4 walls; 47 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短47手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 47.' },
      board: ['...B.',
              '.a.A#',
              '...#G',
              '..b..',
              '#.#..']
    },
    {
      id: 89, name: 'DRIFTWOOD', par: 47,
      idea: 'two penguins, 1 drifter, 4 walls; 47 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短47手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 47.' },
      board: ['.#...',
              '.#.#.',
              'AG#B.',
              '..a..',
              '....b']
    },
    {
      id: 90, name: 'ICEFALL', par: 48,
      idea: 'two penguins, 1 drifter, 4 walls; 48 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短48手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 48.' },
      board: ['Gb#.a',
              'B#A.#',
              '.....',
              '.....',
              '....#']
    },
    {
      id: 91, name: 'DEEPFROST', par: 48,
      idea: 'two penguins, 1 drifter, 4 walls; 48 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短48手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 48.' },
      board: ['a...A',
              '...bG',
              '##...',
              '..##.',
              '...B.']
    },
    {
      id: 92, name: 'COLDIRON', par: 49,
      idea: 'two penguins, 1 drifter, 4 walls; 49 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短49手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 49.' },
      board: ['....#',
              '.G.a.',
              '...b#',
              '.#A..',
              'B.#..']
    },
    {
      id: 93, name: 'STARFIELD', par: 49,
      idea: 'two penguins, 1 drifter, 4 walls; 49 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短49手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 49.' },
      board: ['G...#',
              'A#.a.',
              '#.B..',
              '.....',
              '.#..b']
    },
    {
      id: 94, name: 'NIGHTFALL', par: 50,
      idea: 'two penguins, 1 drifter, 4 walls; 50 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短50手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 50.' },
      board: ['.....',
              '..#..',
              'G#.##',
              'B..b.',
              '.A..a']
    },
    {
      id: 95, name: 'FARSHORE', par: 50,
      idea: 'two penguins, 1 drifter, 4 walls; 50 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短50手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 50.' },
      board: ['#....',
              'ba...',
              '.....',
              'B##..',
              'A..#G']
    },
    {
      id: 96, name: 'LASTLIGHT', par: 51,
      idea: 'two penguins, 1 drifter, 4 walls; 51 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短51手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 51.' },
      board: ['.....',
              'B#..#',
              '#.b..',
              '.G...',
              'aA#..']
    },
    {
      id: 97, name: 'ENDLESS', par: 51,
      idea: 'two penguins, 1 drifter, 4 walls; 51 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短51手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 51.' },
      board: ['..B#.',
              '.bA.#',
              '#....',
              '...G.',
              '.#.a.']
    },
    {
      id: 98, name: 'THRESHOLD', par: 52,
      idea: 'two penguins, 1 drifter, 4 walls; 52 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短52手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 52.' },
      board: ['.#...',
              'Bb#..',
              '.a...',
              'GA.##',
              '.....']
    },
    {
      id: 99, name: 'CROSSING', par: 52,
      idea: 'two penguins, 1 drifter, 4 walls; 52 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短52手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 52.' },
      board: ['#....',
              'ab..A',
              '#...#',
              '.....',
              '.BG#.']
    },
    {
      id: 100, name: 'TILT', par: 53,
      idea: 'two penguins, 1 drifter, 4 walls; 53 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短53手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 53.' },
      board: ['Ga...',
              '...#.',
              'b.B..',
              '..#.#',
              '.#A..']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
