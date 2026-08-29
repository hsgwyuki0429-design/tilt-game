'use strict';
/*
 * TILT — the ice campaign. GENERATED FILE: see tools/build-stages.js.
 *
 * 100 boards, all 5×5, laid out along one straight difficulty line:
 * stage 1 is one swipe, stage 100 is the longest board an exhaustive
 * search of the 5×5 space could find (57 moves), and each stage in
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
      board: ['.....',
              '.....',
              'a...A',
              '.....',
              '.....']
    },
    {
      id: 2, name: 'DRIFT', par: 2,
      idea: 'one penguin, an empty tray; 2 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短2手。', en: 'A penguin is collected only when it stops on its aurora. Best: 2.' },
      board: ['....a',
              '.....',
              '.....',
              '.....',
              'A....']
    },
    {
      id: 3, name: 'GLIDE', par: 2,
      idea: 'one penguin, an empty tray; 2 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短2手。', en: 'A penguin is collected only when it stops on its aurora. Best: 2.' },
      board: ['.....',
              '....A',
              '.....',
              '.....',
              'a....']
    },
    {
      id: 4, name: 'FLOE', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['...b.',
              '...B.',
              '.....',
              '...A.',
              '....a']
    },
    {
      id: 5, name: 'SLIP', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['b....',
              '.A...',
              '.....',
              '.a...',
              '.B...']
    },
    {
      id: 6, name: 'CALM', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['....a',
              '.B...',
              '...A.',
              'b....',
              '.....']
    },
    {
      id: 7, name: 'FROST', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['...b.',
              '.B...',
              '..A..',
              '.....',
              'a....']
    },
    {
      id: 8, name: 'SHELF', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['.....',
              '.....',
              '.....',
              'aG...',
              'A..bB']
    },
    {
      id: 9, name: 'CRISP', par: 6,
      idea: 'two penguins, 1 drifter; 6 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短6手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 6.' },
      board: ['.a..B',
              'bA.G.',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 10, name: 'DAWN', par: 6,
      idea: 'two penguins, 1 drifter; 6 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短6手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 6.' },
      board: ['....a',
              '...G.',
              '.....',
              '...AB',
              '...b.']
    },
    {
      id: 11, name: 'RIME', par: 7,
      idea: 'two penguins, 1 drifter; 7 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短7手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 7.' },
      board: ['.....',
              '.....',
              '.....',
              'B.G.a',
              '.b.A.']
    },
    {
      id: 12, name: 'THAW', par: 7,
      idea: 'two penguins, 1 drifter; 7 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短7手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 7.' },
      board: ['..G.A',
              '.....',
              '.....',
              '...Bb',
              '...a.']
    },
    {
      id: 13, name: 'SLEET', par: 8,
      idea: 'two penguins, 1 drifter; 8 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短8手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 8.' },
      board: ['a....',
              '.BG..',
              '.....',
              '.A...',
              '.b...']
    },
    {
      id: 14, name: 'BERG', par: 8,
      idea: 'two penguins, 1 drifter; 8 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短8手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 8.' },
      board: ['....b',
              'a.BA.',
              '...G.',
              '.....',
              '.....']
    },
    {
      id: 15, name: 'CRAG', par: 9,
      idea: 'two penguins, 1 drifter; 9 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短9手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 9.' },
      board: ['.a...',
              '.B...',
              '.A...',
              '.....',
              'b.G..']
    },
    {
      id: 16, name: 'PALE', par: 9,
      idea: 'two penguins, 1 drifter; 9 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短9手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 9.' },
      board: ['.....',
              '.....',
              'G....',
              'bA.B.',
              '....a']
    },
    {
      id: 17, name: 'HUSH', par: 10,
      idea: 'two penguins, 1 drifter; 10 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短10手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 10.' },
      board: ['b...B',
              '...G.',
              '....A',
              '....a',
              '.....']
    },
    {
      id: 18, name: 'VEIL', par: 11,
      idea: 'two penguins, 1 drifter; 11 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短11手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 11.' },
      board: ['....b',
              '..A..',
              '..G..',
              '...B.',
              '...a.']
    },
    {
      id: 19, name: 'SPUR', par: 11,
      idea: 'two penguins, 1 drifter; 11 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短11手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 11.' },
      board: ['.....',
              '.....',
              '.B.G.',
              '..A.b',
              'a....']
    },
    {
      id: 20, name: 'NORTH', par: 12,
      idea: 'two penguins, 1 drifter; 12 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短12手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 12.' },
      board: ['...b.',
              '..G..',
              '.....',
              '.....',
              'BA..a']
    },
    {
      id: 21, name: 'GLEAM', par: 12,
      idea: 'two penguins, 1 drifter; 12 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短12手。', en: 'The grey drifter slides with the same gravity — and it can sit on an aurora. Best: 12.' },
      board: ['b..BA',
              '.....',
              '..G..',
              '.....',
              '.a...']
    },
    {
      id: 22, name: 'SNAP', par: 13,
      idea: 'two penguins, 2 drifters; 13 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短13手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 13.' },
      board: ['Ab..a',
              'G.GB.',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 23, name: 'RIDGE', par: 13,
      idea: 'two penguins, 2 drifters; 13 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短13手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 13.' },
      board: ['b....',
              'AG...',
              '.B...',
              '.G...',
              'a....']
    },
    {
      id: 24, name: 'BASIN', par: 14,
      idea: 'two penguins, 2 drifters; 14 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短14手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 14.' },
      board: ['.....',
              '.....',
              '.....',
              'G.AG.',
              'aB..b']
    },
    {
      id: 25, name: 'FJORD', par: 15,
      idea: 'two penguins, 2 drifters; 15 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短15手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 15.' },
      board: ['a.AGb',
              '.B...',
              'G....',
              '.....',
              '.....']
    },
    {
      id: 26, name: 'SHARD', par: 15,
      idea: 'two penguins, 2 drifters; 15 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短15手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 15.' },
      board: ['..GAa',
              '...B.',
              '.....',
              '....G',
              '....b']
    },
    {
      id: 27, name: 'PRISM', par: 16,
      idea: 'two penguins, 2 drifters; 16 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短16手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 16.' },
      board: ['.....',
              '.....',
              '.....',
              'GGA..',
              'b..aB']
    },
    {
      id: 28, name: 'GLINT', par: 16,
      idea: 'two penguins, 2 drifters; 16 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短16手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 16.' },
      board: ['...aB',
              '...G.',
              '...A.',
              '...G.',
              '....b']
    },
    {
      id: 29, name: 'HOAR', par: 17,
      idea: 'two penguins, 2 drifters; 17 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短17手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 17.' },
      board: ['a.G..',
              '.AB..',
              '.....',
              'G....',
              '.b...']
    },
    {
      id: 30, name: 'BLUE', par: 17,
      idea: 'two penguins, 2 drifters; 17 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短17手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 17.' },
      board: ['....b',
              'aB.G.',
              'GA...',
              '.....',
              '.....']
    },
    {
      id: 31, name: 'CLEFT', par: 18,
      idea: 'two penguins, 2 drifters; 18 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短18手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 18.' },
      board: ['G..a.',
              '..A..',
              '.G...',
              '.B...',
              'b....']
    },
    {
      id: 32, name: 'WAKE', par: 19,
      idea: 'two penguins, 1 wall; 19 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短19手。', en: 'The wall and the other penguin are both brakes. Best: 19.' },
      board: ['..b..',
              '....a',
              '.....',
              '.....',
              'AB.#.']
    },
    {
      id: 33, name: 'SHOAL', par: 19,
      idea: 'two penguins, 1 wall; 19 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短19手。', en: 'The wall and the other penguin are both brakes. Best: 19.' },
      board: ['A#.B.',
              '.....',
              '.....',
              '....b',
              '..a..']
    },
    {
      id: 34, name: 'PACK', par: 20,
      idea: 'two penguins, 1 wall; 20 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短20手。', en: 'The wall and the other penguin are both brakes. Best: 20.' },
      board: ['.b...',
              '....#',
              'a...A',
              '.....',
              '....B']
    },
    {
      id: 35, name: 'TIDE', par: 20,
      idea: 'two penguins, 1 wall; 20 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短20手。', en: 'The wall and the other penguin are both brakes. Best: 20.' },
      board: ['..b..',
              '....a',
              '.....',
              '.....',
              '.#BA.']
    },
    {
      id: 36, name: 'SPIRE', par: 21,
      idea: 'two penguins, 1 drifter, 1 wall; 21 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短21手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 21.' },
      board: ['B.a..',
              '..A..',
              'b....',
              '.G...',
              '....#']
    },
    {
      id: 37, name: 'BRINE', par: 21,
      idea: 'two penguins, 1 drifter, 1 wall; 21 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短21手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 21.' },
      board: ['#....',
              '....G',
              '...A.',
              '..B.a',
              '..b..']
    },
    {
      id: 38, name: 'CROWN', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短22手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 22.' },
      board: ['...#.',
              '.a...',
              '.....',
              '.....',
              'bAG.B']
    },
    {
      id: 39, name: 'STILL', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短22手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 22.' },
      board: ['....A',
              '.a...',
              '....G',
              '#...b',
              '....B']
    },
    {
      id: 40, name: 'FLARE', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短23手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 23.' },
      board: ['a.G.A',
              'B....',
              '.....',
              '.b...',
              '...#.']
    },
    {
      id: 41, name: 'QUARTZ', par: 24,
      idea: 'two penguins, 1 drifter, 1 wall; 24 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短24手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 24.' },
      board: ['.#...',
              '...a.',
              '.....',
              '..BAb',
              'G....']
    },
    {
      id: 42, name: 'LEDGE', par: 24,
      idea: 'two penguins, 1 drifter, 1 wall; 24 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短24手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 24.' },
      board: ['B....',
              '....#',
              '.G...',
              '.A.a.',
              '.b...']
    },
    {
      id: 43, name: 'SLATE', par: 25,
      idea: 'two penguins, 1 drifter, 1 wall; 25 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短25手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 25.' },
      board: ['AGB..',
              '....a',
              '.....',
              '...b.',
              '.#...']
    },
    {
      id: 44, name: 'MIST', par: 25,
      idea: 'two penguins, 1 drifter, 1 wall; 25 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短25手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 25.' },
      board: ['Ba...',
              '...b.',
              '.....',
              'G...#',
              'A....']
    },
    {
      id: 45, name: 'ARCH', par: 26,
      idea: 'two penguins, 1 drifter, 1 wall; 26 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短26手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 26.' },
      board: ['....B',
              '#....',
              '....G',
              '.a...',
              '...bA']
    },
    {
      id: 46, name: 'FLINT', par: 26,
      idea: 'two penguins, 1 drifter, 1 wall; 26 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短26手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 26.' },
      board: ['...#.',
              '.b...',
              '.....',
              'B....',
              '..AaG']
    },
    {
      id: 47, name: 'GLACE', par: 27,
      idea: 'two penguins, 1 drifter, 1 wall; 27 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短27手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 27.' },
      board: ['...aB',
              '.b...',
              '...A.',
              '#....',
              '....G']
    },
    {
      id: 48, name: 'SIREN', par: 28,
      idea: 'two penguins, 1 drifter, 1 wall; 28 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短28手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 28.' },
      board: ['B.G..',
              '....b',
              'A....',
              '.a...',
              '...#.']
    },
    {
      id: 49, name: 'HOLLOW', par: 28,
      idea: 'two penguins, 1 drifter, 1 wall; 28 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短28手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 28.' },
      board: ['.#...',
              '...b.',
              '....A',
              'a....',
              '..G.B']
    },
    {
      id: 50, name: 'HALF', par: 29,
      idea: 'two penguins, 1 drifter, 1 wall; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['AG...',
              'a...#',
              '.....',
              '...b.',
              'B....']
    },
    {
      id: 51, name: 'AURORA', par: 29,
      idea: 'two penguins, 1 drifter, 1 wall; 29 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短29手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 29.' },
      board: ['GA...',
              'B...b',
              '.....',
              '...a.',
              '.#...']
    },
    {
      id: 52, name: 'CINDER', par: 30,
      idea: 'two penguins, 1 drifter, 1 wall; 30 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短30手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 30.' },
      board: ['Bb...',
              '...a.',
              'G....',
              '....#',
              '.A...']
    },
    {
      id: 53, name: 'BEACON', par: 30,
      idea: 'two penguins, 1 drifter, 1 wall; 30 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短30手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 30.' },
      board: ['...B.',
              '#....',
              '....G',
              '.b..A',
              '...a.']
    },
    {
      id: 54, name: 'LANTERN', par: 31,
      idea: 'two penguins, 1 drifter, 1 wall; 31 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短31手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 31.' },
      board: ['...#.',
              '.a...',
              '....A',
              'b.B..',
              '....G']
    },
    {
      id: 55, name: 'HARBOUR', par: 32,
      idea: 'two penguins, 1 drifter, 1 wall; 32 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短32手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 32.' },
      board: ['...b.',
              '.a.B.',
              '....G',
              '#....',
              '...A.']
    },
    {
      id: 56, name: 'KEEL', par: 32,
      idea: 'two penguins, 1 drifter, 1 wall; 32 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短32手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 32.' },
      board: ['...G.',
              'a.A.B',
              '.....',
              '.b...',
              '...#.']
    },
    {
      id: 57, name: 'ANCHOR', par: 33,
      idea: 'two penguins, 1 drifter, 1 wall; 33 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短33手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 33.' },
      board: ['.#...',
              '...a.',
              'A....',
              '..B.b',
              '.G...']
    },
    {
      id: 58, name: 'MARINER', par: 33,
      idea: 'two penguins, 1 drifter, 1 wall; 33 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短33手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 33.' },
      board: ['A....',
              'G...#',
              'B....',
              '...a.',
              '.b...']
    },
    {
      id: 59, name: 'COMPASS', par: 34,
      idea: 'two penguins, 1 drifter, 1 wall; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['B.G.A',
              '....a',
              '.....',
              '...b.',
              '.#...']
    },
    {
      id: 60, name: 'MERIDIAN', par: 34,
      idea: 'two penguins, 1 drifter, 1 wall; 34 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短34手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 34.' },
      board: ['.a...',
              'A..b.',
              'G....',
              '....#',
              'B....']
    },
    {
      id: 61, name: 'SOLSTICE', par: 35,
      idea: 'two penguins, 1 drifter, 1 wall; 35 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短35手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 35.' },
      board: ['..A..',
              '#....',
              '....G',
              '.a.B.',
              '...b.']
    },
    {
      id: 62, name: 'ZENITH', par: 36,
      idea: 'two penguins, 1 drifter, 1 wall; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['A.G#.',
              '.b...',
              '.....',
              'a....',
              'B....']
    },
    {
      id: 63, name: 'LATITUDE', par: 36,
      idea: 'two penguins, 1 drifter, 1 wall; 36 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短36手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 36.' },
      board: ['A.Ba.',
              '.b...',
              'G....',
              '#....',
              '.....']
    },
    {
      id: 64, name: 'CURRENT', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短37手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 37.' },
      board: ['.G...',
              '.B...',
              '.A...',
              'b..a.',
              '..#.#']
    },
    {
      id: 65, name: 'DRAUGHT', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短37手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 37.' },
      board: ['#.#..',
              '.b.Ba',
              '.....',
              '...A.',
              '...G.']
    },
    {
      id: 66, name: 'CAVERN', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短38手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 38.' },
      board: ['..#b.',
              '.....',
              '.....',
              '..#aA',
              '...GB']
    },
    {
      id: 67, name: 'CHASM', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短38手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 38.' },
      board: ['.....',
              '.....',
              '...b.',
              '#G.#.',
              'AB.a.']
    },
    {
      id: 68, name: 'FISSURE', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['bB...',
              'G....',
              'G....',
              '.a..#',
              'A...#']
    },
    {
      id: 69, name: 'MORAINE', par: 39,
      idea: 'two penguins, 2 drifters, 2 walls; 39 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短39手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 39.' },
      board: ['#...a',
              '#..b.',
              '....B',
              '....G',
              '...AG']
    },
    {
      id: 70, name: 'CIRQUE', par: 40,
      idea: 'two penguins, 2 drifters, 2 walls; 40 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短40手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 40.' },
      board: ['...##',
              '.....',
              '.....',
              'B..a.',
              'GGb.A']
    },
    {
      id: 71, name: 'SERAC', par: 41,
      idea: 'two penguins, 2 drifters, 2 walls; 41 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短41手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 41.' },
      board: ['...GG',
              '....B',
              '....b',
              '#..a.',
              '#...A']
    },
    {
      id: 72, name: 'CREVASSE', par: 41,
      idea: 'two penguins, 2 drifters, 2 walls; 41 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短41手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 41.' },
      board: ['BG..a',
              'G.Ab.',
              '.....',
              '.....',
              '...##']
    },
    {
      id: 73, name: 'CORNICE', par: 42,
      idea: 'two penguins, 2 drifters, 2 walls; 42 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短42手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 42.' },
      board: ['##...',
              '.....',
              '.....',
              '.a.BG',
              'A.b.G']
    },
    {
      id: 74, name: 'SUMMIT', par: 42,
      idea: 'two penguins, 2 drifters, 2 walls; 42 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短42手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 42.' },
      board: ['....#',
              'Aa..#',
              'b....',
              '.B...',
              'GG...']
    },
    {
      id: 75, name: 'TRAVERSE', par: 43,
      idea: 'two penguins, 2 drifters, 2 walls; 43 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短43手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 43.' },
      board: ['..BGa',
              '.b...',
              '...GA',
              '.....',
              '##...']
    },
    {
      id: 76, name: 'ASCENT', par: 43,
      idea: 'two penguins, 2 drifters, 2 walls; 43 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短43手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 43.' },
      board: ['aA...',
              '.G...',
              'B....',
              '.b..#',
              'G...#']
    },
    {
      id: 77, name: 'PITON', par: 44,
      idea: 'two penguins, 2 drifters, 2 walls; 44 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短44手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 44.' },
      board: ['#...G',
              '#..b.',
              '.....',
              '....A',
              '..aGB']
    },
    {
      id: 78, name: 'BELAY', par: 45,
      idea: 'two penguins, 2 drifters, 2 walls; 45 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短45手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 45.' },
      board: ['...##',
              '.....',
              'b....',
              'G.Ba.',
              '.A..G']
    },
    {
      id: 79, name: 'CAIRN', par: 45,
      idea: 'two penguins, 2 drifters, 2 walls; 45 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短45手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 45.' },
      board: ['..bGA',
              '...B.',
              '....G',
              '#..a.',
              '#....']
    },
    {
      id: 80, name: 'BEARING', par: 46,
      idea: 'two penguins, 2 drifters, 2 walls; 46 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短46手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 46.' },
      board: ['.BbAG',
              '...a.',
              'G....',
              '.....',
              '...##']
    },
    {
      id: 81, name: 'POLARIS', par: 46,
      idea: 'two penguins, 2 drifters, 2 walls; 46 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短46手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 46.' },
      board: ['##...',
              '.....',
              '...AG',
              '.b...',
              'GBa..']
    },
    {
      id: 82, name: 'MIDNIGHT', par: 47,
      idea: 'two penguins, 2 drifters, 2 walls; 47 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短47手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 47.' },
      board: ['G...#',
              '....#',
              '.B...',
              'AGb..',
              'a....']
    },
    {
      id: 83, name: 'LONGNIGHT', par: 47,
      idea: 'two penguins, 2 drifters, 2 walls; 47 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短47手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 47.' },
      board: ['G.A.b',
              '..GB.',
              '...a.',
              '.....',
              '##...']
    },
    {
      id: 84, name: 'WHITEOUT', par: 48,
      idea: 'two penguins, 2 drifters, 2 walls; 48 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短48手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 48.' },
      board: ['b...B',
              '..a..',
              '..G..',
              '.A..#',
              'G...#']
    },
    {
      id: 85, name: 'BLIZZARD', par: 49,
      idea: 'two penguins, 2 drifters, 2 walls; 49 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短49手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 49.' },
      board: ['#....',
              '#....',
              '.AGBG',
              '..b..',
              '....a']
    },
    {
      id: 86, name: 'SQUALL', par: 49,
      idea: 'two penguins, 2 drifters, 2 walls; 49 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短49手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 49.' },
      board: ['...##',
              'B....',
              '.a..G',
              '....A',
              'b...G']
    },
    {
      id: 87, name: 'TEMPEST', par: 50,
      idea: 'two penguins, 2 drifters, 2 walls; 50 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短50手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 50.' },
      board: ['.B..b',
              '..a..',
              '..G..',
              '#..A.',
              '#...G']
    },
    {
      id: 88, name: 'GALE', par: 50,
      idea: 'two penguins, 2 drifters, 2 walls; 50 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短50手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 50.' },
      board: ['a...G',
              '..B..',
              '.b.G.',
              'A....',
              '...##']
    },
    {
      id: 89, name: 'DRIFTWOOD', par: 51,
      idea: 'two penguins, 2 drifters, 2 walls; 51 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短51手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 51.' },
      board: ['##..a',
              '.....',
              '.b...',
              '..BG.',
              'G...A']
    },
    {
      id: 90, name: 'ICEFALL', par: 51,
      idea: 'two penguins, 2 drifters, 2 walls; 51 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短51手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 51.' },
      board: ['B...#',
              'A...#',
              '..G..',
              '.b...',
              '..G.a']
    },
    {
      id: 91, name: 'DEEPFROST', par: 52,
      idea: 'two penguins, 2 drifters, 2 walls; 52 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短52手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 52.' },
      board: ['A.GB.',
              '.a.G.',
              '.....',
              '.....',
              '##..b']
    },
    {
      id: 92, name: 'COLDIRON', par: 52,
      idea: 'two penguins, 2 drifters, 2 walls; 52 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短52手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 52.' },
      board: ['....b',
              'BG...',
              'G....',
              'Aa..#',
              '....#']
    },
    {
      id: 93, name: 'STARFIELD', par: 53,
      idea: 'two penguins, 2 drifters, 2 walls; 53 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短53手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 53.' },
      board: ['#...B',
              '#....',
              '....G',
              '...b.',
              'a..GA']
    },
    {
      id: 94, name: 'NIGHTFALL', par: 54,
      idea: 'two penguins, 2 drifters, 2 walls; 54 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短54手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 54.' },
      board: ['b..##',
              '.....',
              '.....',
              '.aG.G',
              'B...A']
    },
    {
      id: 95, name: 'FARSHORE', par: 54,
      idea: 'two penguins, 2 drifters, 2 walls; 54 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短54手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 54.' },
      board: ['b...B',
              '...a.',
              '...G.',
              '#..G.',
              '#...A']
    },
    {
      id: 96, name: 'LASTLIGHT', par: 55,
      idea: 'two penguins, 2 drifters, 2 walls; 55 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短55手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 55.' },
      board: ['A...G',
              '.BG..',
              '...b.',
              '.....',
              'a..##']
    },
    {
      id: 97, name: 'ENDLESS', par: 55,
      idea: 'two penguins, 2 drifters, 2 walls; 55 moves.',
      hint: { ja: '灰色の流氷が2つ。どちらも回収されず、動かせる壁としてだけ働く。最短55手。', en: 'Two grey drifters. Neither is ever collected; both work only as movable walls. Best: 55.' },
      board: ['##..b',
              '.....',
              '.a...',
              '...GA',
              '..G.B']
    },
    {
      id: 98, name: 'THRESHOLD', par: 56,
      idea: 'two penguins, 1 drifter, 3 walls; 56 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短56手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 56.' },
      board: ['GA...',
              '.a..#',
              '..##.',
              '.B..b',
              '.....']
    },
    {
      id: 99, name: 'CROSSING', par: 56,
      idea: 'two penguins, 1 drifter, 3 walls; 56 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短56手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 56.' },
      board: ['...G.',
              '.b.BA',
              '..#..',
              '..#..',
              '.#.a.']
    },
    {
      id: 100, name: 'TILT', par: 57,
      idea: 'two penguins, 1 drifter, 3 walls; 57 moves.',
      hint: { ja: '壁・流氷・もう一羽。止まれる場所は三種類、あとは順番だけ。最短57手。', en: 'Wall, drifter, other penguin — three brakes, and the rest is the order. Best: 57.' },
      board: ['GA...',
              '.B..a',
              '..##.',
              '.b..#',
              '.....']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
