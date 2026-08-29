'use strict';
/*
 * TILT — the ice campaign. GENERATED FILE: see tools/build-stages.js.
 *
 * 100 boards, all 5×5, laid out along one straight difficulty line:
 * stage 1 is one swipe, stage 100 is the longest board an exhaustive
 * search of the 5×5 space could find (61 moves), and each stage in
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
      idea: 'two penguins, an empty tray; 1 move.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短1手。', en: 'The only brakes here are the edge and the other penguin. Best: 1.' },
      board: ['aA...',
              '.....',
              '.....',
              '.....',
              'bB...']
    },
    {
      id: 2, name: 'DRIFT', par: 2,
      idea: 'two penguins, an empty tray; 2 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短2手。', en: 'The only brakes here are the edge and the other penguin. Best: 2.' },
      board: ['....b',
              '....B',
              '...Aa',
              '.....',
              '.....']
    },
    {
      id: 3, name: 'GLIDE', par: 2,
      idea: 'two penguins, an empty tray; 2 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短2手。', en: 'The only brakes here are the edge and the other penguin. Best: 2.' },
      board: ['.....',
              '.....',
              '.B...',
              '.b...',
              'aA...']
    },
    {
      id: 4, name: 'FLOE', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['...b.',
              '...B.',
              '...A.',
              '.....',
              '....a']
    },
    {
      id: 5, name: 'SLIP', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['bA...',
              'B....',
              '.....',
              'a....',
              '.....']
    },
    {
      id: 6, name: 'CALM', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['.B..a',
              'A....',
              '.....',
              'b....',
              '.....']
    },
    {
      id: 7, name: 'FROST', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['Gb...',
              'BA...',
              '.....',
              'a....',
              '.....']
    },
    {
      id: 8, name: 'SHELF', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['.....',
              '.....',
              '.....',
              '...Ga',
              '..AbB']
    },
    {
      id: 9, name: 'CRISP', par: 6,
      idea: 'two penguins, 1 drifter; 6 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短6手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 6.' },
      board: ['abG..',
              'BA...',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 10, name: 'DAWN', par: 6,
      idea: 'two penguins, 2 drifters; 6 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短6手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 6.' },
      board: ['.....',
              '....a',
              '....A',
              '...Bb',
              '...GG']
    },
    {
      id: 11, name: 'RIME', par: 7,
      idea: 'two penguins, 2 drifters; 7 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短7手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 7.' },
      board: ['.....',
              'G....',
              'a....',
              'AB...',
              'Gb...']
    },
    {
      id: 12, name: 'THAW', par: 8,
      idea: 'two penguins, 2 drifters; 8 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短8手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 8.' },
      board: ['.....',
              '....G',
              '....a',
              '...Bb',
              '...AG']
    },
    {
      id: 13, name: 'SLEET', par: 8,
      idea: 'two penguins, 1 wall; 8 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短8手。', en: 'The wall and the other penguin are both brakes. Best: 8.' },
      board: ['#....',
              '.....',
              '....b',
              'B....',
              'a...A']
    },
    {
      id: 14, name: 'BERG', par: 9,
      idea: 'two penguins, 1 wall; 9 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短9手。', en: 'The wall and the other penguin are both brakes. Best: 9.' },
      board: ['....#',
              '.....',
              'b....',
              '..B..',
              'aA...']
    },
    {
      id: 15, name: 'CRAG', par: 9,
      idea: 'two penguins, 1 wall; 9 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短9手。', en: 'The wall and the other penguin are both brakes. Best: 9.' },
      board: ['...Aa',
              '..B..',
              'b....',
              '.....',
              '#....']
    },
    {
      id: 16, name: 'PALE', par: 10,
      idea: 'two penguins, 1 wall; 10 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短10手。', en: 'The wall and the other penguin are both brakes. Best: 10.' },
      board: ['Bb...',
              '.....',
              '.....',
              'aA...',
              '....#']
    },
    {
      id: 17, name: 'HUSH', par: 11,
      idea: 'two penguins, 1 wall; 11 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短11手。', en: 'The wall and the other penguin are both brakes. Best: 11.' },
      board: ['.#...',
              '.b...',
              '.....',
              '....A',
              '..a.B']
    },
    {
      id: 18, name: 'VEIL', par: 11,
      idea: 'two penguins, 1 wall; 11 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短11手。', en: 'The wall and the other penguin are both brakes. Best: 11.' },
      board: ['B....',
              '....#',
              'aA...',
              '.....',
              '.b...']
    },
    {
      id: 19, name: 'SPUR', par: 12,
      idea: 'two penguins, 1 wall; 12 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短12手。', en: 'The wall and the other penguin are both brakes. Best: 12.' },
      board: ['..b.B',
              '...A.',
              '.....',
              '....a',
              '.#...']
    },
    {
      id: 20, name: 'NORTH', par: 13,
      idea: 'two penguins, 1 wall; 13 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短13手。', en: 'The wall and the other penguin are both brakes. Best: 13.' },
      board: ['AB...',
              '.....',
              'b....',
              '....#',
              '.a...']
    },
    {
      id: 21, name: 'GLEAM', par: 13,
      idea: 'two penguins, 1 wall; 13 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短13手。', en: 'The wall and the other penguin are both brakes. Best: 13.' },
      board: ['.....',
              '#...b',
              '....a',
              '....B',
              '....A']
    },
    {
      id: 22, name: 'SNAP', par: 14,
      idea: 'two penguins, 1 drifter, 1 wall; 14 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短14手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 14.' },
      board: ['....#',
              '.....',
              'a....',
              'BG...',
              'Ab...']
    },
    {
      id: 23, name: 'RIDGE', par: 14,
      idea: 'two penguins, 1 drifter, 1 wall; 14 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短14手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 14.' },
      board: ['a.G.A',
              '...Bb',
              '.....',
              '.....',
              '#....']
    },
    {
      id: 24, name: 'BASIN', par: 15,
      idea: 'two penguins, 1 wall; 15 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短15手。', en: 'The wall and the other penguin are both brakes. Best: 15.' },
      board: ['..A..',
              '.....',
              '.....',
              'a....',
              'bB.#.']
    },
    {
      id: 25, name: 'FJORD', par: 16,
      idea: 'two penguins, 1 wall; 16 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短16手。', en: 'The wall and the other penguin are both brakes. Best: 16.' },
      board: ['.#...',
              'a....',
              '.....',
              '.....',
              '..bAB']
    },
    {
      id: 26, name: 'SHARD', par: 16,
      idea: 'two penguins, 1 wall; 16 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短16手。', en: 'The wall and the other penguin are both brakes. Best: 16.' },
      board: ['.....',
              '....#',
              '....a',
              '....B',
              '...bA']
    },
    {
      id: 27, name: 'PRISM', par: 17,
      idea: 'two penguins, 1 drifter, 1 wall; 17 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短17手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 17.' },
      board: ['..a.A',
              '....G',
              '....b',
              '.....',
              '#...B']
    },
    {
      id: 28, name: 'GLINT', par: 17,
      idea: 'two penguins, 1 drifter, 1 wall; 17 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短17手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 17.' },
      board: ['GBa.A',
              '....b',
              '.....',
              '.....',
              '....#']
    },
    {
      id: 29, name: 'HOAR', par: 18,
      idea: 'two penguins, 1 drifter, 1 wall; 18 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短18手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 18.' },
      board: ['#....',
              '.....',
              'a...A',
              '....B',
              '..Gb.']
    },
    {
      id: 30, name: 'BLUE', par: 19,
      idea: 'two penguins, 1 drifter, 1 wall; 19 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短19手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 19.' },
      board: ['.b..#',
              'a....',
              'G....',
              'B....',
              '.A...']
    },
    {
      id: 31, name: 'CLEFT', par: 19,
      idea: 'two penguins, 2 drifters, 1 wall; 19 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短19手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 19.' },
      board: ['b.Ga.',
              '..GBA',
              '.....',
              '.....',
              '#....']
    },
    {
      id: 32, name: 'WAKE', par: 20,
      idea: 'two penguins, 1 drifter, 1 wall; 20 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短20手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 20.' },
      board: ['ABb.G',
              '.....',
              '.....',
              '.a...',
              '...#.']
    },
    {
      id: 33, name: 'SHOAL', par: 20,
      idea: 'two penguins, 1 drifter, 1 wall; 20 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短20手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 20.' },
      board: ['.#...',
              '...b.',
              '.....',
              '...G.',
              '..AaB']
    },
    {
      id: 34, name: 'PACK', par: 21,
      idea: 'two penguins, 1 drifter, 1 wall; 21 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短21手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 21.' },
      board: ['....#',
              '.....',
              'B...b',
              '.GA..',
              '..a..']
    },
    {
      id: 35, name: 'TIDE', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短22手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 22.' },
      board: ['..BG.',
              '...Ab',
              '.....',
              '...a.',
              '.#...']
    },
    {
      id: 36, name: 'SPIRE', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短22手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 22.' },
      board: ['b....',
              'A..a.',
              'G....',
              'B...#',
              '.....']
    },
    {
      id: 37, name: 'BRINE', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短23手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 23.' },
      board: ['...a.',
              '#....',
              '.....',
              '.b.AG',
              '...B.']
    },
    {
      id: 38, name: 'CROWN', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短23手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 23.' },
      board: ['...#.',
              '.a...',
              '.....',
              'A....',
              '.GBb.']
    },
    {
      id: 39, name: 'STILL', par: 24,
      idea: 'two penguins, 2 drifters, 1 wall; 24 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短24手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 24.' },
      board: ['...ab',
              '.A.BG',
              '..G..',
              '.....',
              '#....']
    },
    {
      id: 40, name: 'FLARE', par: 25,
      idea: 'two penguins, 2 walls; 25 moves.',
      hint: { ja: '壁が2つ。どちらの手前で止めるかがすべて。最短25手。', en: 'Two walls. Which one you stop against is the whole decision. Best: 25.' },
      board: ['...B.',
              'a..A.',
              '...b#',
              '.....',
              '#....']
    },
    {
      id: 41, name: 'QUARTZ', par: 25,
      idea: 'two penguins, 1 drifter, 2 walls; 25 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短25手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 25.' },
      board: ['#.#..',
              '.....',
              '....B',
              '.a.A.',
              '.G..b']
    },
    {
      id: 42, name: 'LEDGE', par: 26,
      idea: 'two penguins, 2 drifters, 1 wall; 26 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短26手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 26.' },
      board: ['.a...',
              '.....',
              'GAGB#',
              '.b...',
              '.....']
    },
    {
      id: 43, name: 'SLATE', par: 26,
      idea: 'two penguins, 2 drifters, 1 wall; 26 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短26手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 26.' },
      board: ['G.G..',
              'a.A..',
              '..B..',
              '.b...',
              '..#..']
    },
    {
      id: 44, name: 'MIST', par: 27,
      idea: 'two penguins, 2 drifters, 1 wall; 27 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短27手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 27.' },
      board: ['.a...',
              'G....',
              '....#',
              '...b.',
              'BAG..']
    },
    {
      id: 45, name: 'ARCH', par: 28,
      idea: 'two penguins, 2 drifters, 1 wall; 28 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短28手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 28.' },
      board: ['.....',
              '...a.',
              '#..B.',
              '...Gb',
              '..AG.']
    },
    {
      id: 46, name: 'FLINT', par: 28,
      idea: 'two penguins, 1 drifter, 2 walls; 28 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短28手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 28.' },
      board: ['..#.#',
              '.b...',
              'A....',
              '.B...',
              'a..G.']
    },
    {
      id: 47, name: 'GLACE', par: 29,
      idea: 'two penguins, 1 drifter, 2 walls; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['.bB..',
              '.....',
              '#..AG',
              '...a.',
              '#....']
    },
    {
      id: 48, name: 'SIREN', par: 29,
      idea: 'two penguins, 1 drifter, 2 walls; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['...Bb',
              '.G.a.',
              'A....',
              '.....',
              '..#.#']
    },
    {
      id: 49, name: 'HOLLOW', par: 30,
      idea: 'two penguins, 1 drifter, 1 wall; 30 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短30手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 30.' },
      board: ['.#...',
              '.b.a.',
              '.....',
              'G....',
              'B...A']
    },
    {
      id: 50, name: 'HALF', par: 31,
      idea: 'two penguins, 1 drifter, 2 walls; 31 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短31手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 31.' },
      board: ['....#',
              '...b.',
              'B...#',
              '..G..',
              '.A.a.']
    },
    {
      id: 51, name: 'AURORA', par: 31,
      idea: 'two penguins, 1 drifter, 2 walls; 31 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短31手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 31.' },
      board: ['b...B',
              '...AG',
              '.....',
              '.a...',
              '#.#..']
    },
    {
      id: 52, name: 'CINDER', par: 32,
      idea: 'two penguins, 1 drifter, 2 walls; 32 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短32手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 32.' },
      board: ['..B..',
              'G....',
              '....#',
              '.b...',
              '.A.a#']
    },
    {
      id: 53, name: 'BEACON', par: 33,
      idea: 'two penguins, 2 drifters, 2 walls; 33 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短33手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 33.' },
      board: ['#....',
              '#...G',
              '....G',
              '...bA',
              '...Ba']
    },
    {
      id: 54, name: 'LANTERN', par: 33,
      idea: 'two penguins, 2 drifters, 2 walls; 33 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短33手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 33.' },
      board: ['...##',
              '.....',
              '.....',
              'Ba...',
              'GGA.b']
    },
    {
      id: 55, name: 'HARBOUR', par: 34,
      idea: 'two penguins, 1 drifter, 2 walls; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['#....',
              '.....',
              '.....',
              '.a.b.',
              'BAG#.']
    },
    {
      id: 56, name: 'KEEL', par: 34,
      idea: 'two penguins, 1 drifter, 2 walls; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['.G...',
              'a....',
              '.A...',
              '.B.b.',
              '.#..#']
    },
    {
      id: 57, name: 'ANCHOR', par: 35,
      idea: 'two penguins, 1 drifter, 2 walls; 35 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短35手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 35.' },
      board: ['#.#..',
              'ab...',
              '.....',
              '.....',
              '.A.BG']
    },
    {
      id: 58, name: 'MARINER', par: 36,
      idea: 'two penguins, 1 drifter, 2 walls; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['.....',
              '....#',
              'G..#.',
              '.b.a.',
              'AB...']
    },
    {
      id: 59, name: 'COMPASS', par: 36,
      idea: 'two penguins, 1 drifter, 3 walls; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['...G.',
              '....B',
              '...aA',
              '#.#b.',
              '#....']
    },
    {
      id: 60, name: 'MERIDIAN', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短37手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 37.' },
      board: ['.....',
              '..a#b',
              'G.A..',
              '.....',
              '...#B']
    },
    {
      id: 61, name: 'SOLSTICE', par: 37,
      idea: 'two penguins, 2 drifters, 2 walls; 37 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短37手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 37.' },
      board: ['#...G',
              '#..a.',
              '....b',
              '....B',
              '...GA']
    },
    {
      id: 62, name: 'ZENITH', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短38手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 38.' },
      board: ['BA...',
              'Ga..b',
              '.#..#',
              '.....',
              '.....']
    },
    {
      id: 63, name: 'LATITUDE', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['.....',
              'G#GBA',
              '....a',
              '...b.',
              '.#...']
    },
    {
      id: 64, name: 'CURRENT', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['G....',
              'G....',
              '.....',
              '.#.b#',
              'AB.a.']
    },
    {
      id: 65, name: 'DRAUGHT', par: 40,
      idea: 'two penguins, 2 drifters, 2 walls; 40 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短40手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 40.' },
      board: ['.b.B.',
              '#.a#.',
              '...A.',
              '...G.',
              '...G.']
    },
    {
      id: 66, name: 'CAVERN', par: 40,
      idea: 'two penguins, 2 drifters, 2 walls; 40 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短40手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 40.' },
      board: ['...#.',
              '.a...',
              '....b',
              'BAG#G',
              '.....']
    },
    {
      id: 67, name: 'CHASM', par: 41,
      idea: 'two penguins, 2 drifters, 2 walls; 41 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短41手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 41.' },
      board: ['.Gb.A',
              '....B',
              '...aG',
              '.#...',
              '.#...']
    },
    {
      id: 68, name: 'FISSURE', par: 42,
      idea: 'two penguins, 2 drifters, 2 walls; 42 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短42手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 42.' },
      board: ['...GA',
              'b.aGB',
              '.....',
              '...##',
              '.....']
    },
    {
      id: 69, name: 'MORAINE', par: 42,
      idea: 'two penguins, 2 drifters, 2 walls; 42 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短42手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 42.' },
      board: ['..b..',
              '##...',
              '.....',
              '..aAG',
              'BG...']
    },
    {
      id: 70, name: 'CIRQUE', par: 43,
      idea: 'two penguins, 2 drifters, 2 walls; 43 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短43手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 43.' },
      board: ['BG.#.',
              'AG.#.',
              '.a...',
              '.....',
              '....b']
    },
    {
      id: 71, name: 'SERAC', par: 43,
      idea: 'two penguins, 2 drifters, 2 walls; 43 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短43手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 43.' },
      board: ['GGB.A',
              '.....',
              '#....',
              '#.a..',
              '...b.']
    },
    {
      id: 72, name: 'CREVASSE', par: 44,
      idea: 'two penguins, 2 drifters, 2 walls; 44 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短44手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 44.' },
      board: ['GB.AG',
              '...a.',
              '.....',
              '.....',
              '..b##']
    },
    {
      id: 73, name: 'CORNICE', par: 45,
      idea: 'two penguins, 2 drifters, 2 walls; 45 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短45手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 45.' },
      board: ['##.Aa',
              '.....',
              '.b.G.',
              '...G.',
              '...B.']
    },
    {
      id: 74, name: 'SUMMIT', par: 45,
      idea: 'two penguins, 2 drifters, 2 walls; 45 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短45手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 45.' },
      board: ['bB..#',
              '.G..#',
              '.....',
              '.Aa..',
              '.G...']
    },
    {
      id: 75, name: 'TRAVERSE', par: 46,
      idea: 'two penguins, 2 drifters, 2 walls; 46 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短46手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 46.' },
      board: ['..B.A',
              '.a.GG',
              '.....',
              '.....',
              '##..b']
    },
    {
      id: 76, name: 'ASCENT', par: 46,
      idea: 'two penguins, 2 drifters, 2 walls; 46 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短46手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 46.' },
      board: ['a....',
              'AGb..',
              'B....',
              'G...#',
              '....#']
    },
    {
      id: 77, name: 'PITON', par: 47,
      idea: 'two penguins, 2 drifters, 2 walls; 47 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短47手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 47.' },
      board: ['#....',
              '#....',
              '...GA',
              '...bG',
              'a..B.']
    },
    {
      id: 78, name: 'BELAY', par: 48,
      idea: 'two penguins, 2 drifters, 2 walls; 48 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短48手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 48.' },
      board: ['A..##',
              '.....',
              'G..b.',
              '.G...',
              'aB...']
    },
    {
      id: 79, name: 'CAIRN', par: 48,
      idea: 'two penguins, 1 drifter, 3 walls; 48 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短48手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 48.' },
      board: ['....G',
              'b..B.',
              '.##.A',
              '#..a.',
              '.....']
    },
    {
      id: 80, name: 'BEARING', par: 49,
      idea: 'two penguins, 1 drifter, 3 walls; 49 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短49手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 49.' },
      board: ['...Bb',
              '...a.',
              '...#.',
              '..#G.',
              '..#A.']
    },
    {
      id: 81, name: 'POLARIS', par: 49,
      idea: 'two penguins, 1 drifter, 4 walls; 49 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短49手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 49.' },
      board: ['..#.#',
              '..b..',
              '.#...',
              '#..a.',
              '..BAG']
    },
    {
      id: 82, name: 'MIDNIGHT', par: 50,
      idea: 'two penguins, 1 drifter, 4 walls; 50 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短50手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 50.' },
      board: ['.a#.b',
              '.#..#',
              '.....',
              '.....',
              'GAB.#']
    },
    {
      id: 83, name: 'LONGNIGHT', par: 51,
      idea: 'two penguins, 1 drifter, 4 walls; 51 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短51手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 51.' },
      board: ['BG...',
              '...b.',
              '#..#.',
              'Aa..#',
              '..#..']
    },
    {
      id: 84, name: 'WHITEOUT', par: 51,
      idea: 'two penguins, 1 drifter, 4 walls; 51 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短51手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 51.' },
      board: ['...#.',
              '..#..',
              '....#',
              'A..b.',
              'G.#Ba']
    },
    {
      id: 85, name: 'BLIZZARD', par: 52,
      idea: 'two penguins, 1 drifter, 4 walls; 52 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短52手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 52.' },
      board: ['Ab#.G',
              'Ba...',
              '#....',
              '..#..',
              '.#...']
    },
    {
      id: 86, name: 'SQUALL', par: 53,
      idea: 'two penguins, 1 drifter, 4 walls; 53 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短53手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 53.' },
      board: ['B....',
              '..#..',
              '.#a#.',
              '.G..#',
              '.bA..']
    },
    {
      id: 87, name: 'TEMPEST', par: 53,
      idea: 'two penguins, 1 drifter, 4 walls; 53 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短53手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 53.' },
      board: ['.#...',
              '..#.b',
              '#....',
              'Aa...',
              'G.#.B']
    },
    {
      id: 88, name: 'GALE', par: 54,
      idea: 'two penguins, 1 drifter, 4 walls; 54 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短54手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 54.' },
      board: ['.GA.B',
              '...#.',
              '....#',
              '.ab..',
              '#.#..']
    },
    {
      id: 89, name: 'DRIFTWOOD', par: 54,
      idea: 'two penguins, 1 drifter, 4 walls; 54 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短54手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 54.' },
      board: ['.....',
              '..##.',
              '##...',
              '...a.',
              'b.BGA']
    },
    {
      id: 90, name: 'ICEFALL', par: 55,
      idea: 'two penguins, 1 drifter, 4 walls; 55 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短55手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 55.' },
      board: ['bB#.G',
              '...aA',
              '....#',
              '..#..',
              '...#.']
    },
    {
      id: 91, name: 'DEEPFROST', par: 56,
      idea: 'two penguins, 1 drifter, 4 walls; 56 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短56手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 56.' },
      board: ['a....',
              '.b..A',
              '##...',
              '..##B',
              '....G']
    },
    {
      id: 92, name: 'COLDIRON', par: 56,
      idea: 'two penguins, 1 drifter, 4 walls; 56 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短56手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 56.' },
      board: ['G...#',
              'Aa...',
              '...b#',
              '.#...',
              '.B#..']
    },
    {
      id: 93, name: 'STARFIELD', par: 57,
      idea: 'two penguins, 1 drifter, 4 walls; 57 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短57手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 57.' },
      board: ['..#..',
              '.A.#G',
              '#....',
              '...ab',
              '#...B']
    },
    {
      id: 94, name: 'NIGHTFALL', par: 57,
      idea: 'two penguins, 1 drifter, 4 walls; 57 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短57手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 57.' },
      board: ['.#...',
              '.#...',
              '.G.#A',
              '.Bab#',
              '.....']
    },
    {
      id: 95, name: 'FARSHORE', par: 58,
      idea: 'two penguins, 1 drifter, 4 walls; 58 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短58手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 58.' },
      board: ['...a.',
              '##...',
              '...bG',
              '..#.B',
              '...#A']
    },
    {
      id: 96, name: 'LASTLIGHT', par: 59,
      idea: 'two penguins, 1 drifter, 4 walls; 59 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短59手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 59.' },
      board: ['.....',
              '....#',
              'b..#.',
              '.#aG.',
              'B#.A.']
    },
    {
      id: 97, name: 'ENDLESS', par: 59,
      idea: 'two penguins, 1 drifter, 4 walls; 59 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短59手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 59.' },
      board: ['BG.#.',
              'A.b#.',
              '.#...',
              '#a...',
              '.....']
    },
    {
      id: 98, name: 'THRESHOLD', par: 60,
      idea: 'two penguins, 1 drifter, 4 walls; 60 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短60手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 60.' },
      board: ['.#A..',
              'GB#..',
              '...b.',
              '..a##',
              '.....']
    },
    {
      id: 99, name: 'CROSSING', par: 60,
      idea: 'two penguins, 1 drifter, 4 walls; 60 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短60手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 60.' },
      board: ['.G...',
              '#B...',
              'A#b..',
              '.a.#.',
              '...#.']
    },
    {
      id: 100, name: 'TILT', par: 61,
      idea: 'two penguins, 1 drifter, 4 walls; 61 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短61手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 61.' },
      board: ['..GBA',
              '...##',
              '..b..',
              '..#.a',
              '.#...']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
