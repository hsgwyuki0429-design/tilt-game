'use strict';
/*
 * TILT — the ice campaign. GENERATED FILE: see tools/build-stages.js.
 *
 * 100 boards, all 5×5, laid out along one straight difficulty line:
 * stage 1 is one swipe, stage 100 is the longest board an exhaustive
 * search of the 5×5 space could find (38 moves), and each stage in
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
      idea: 'one penguin, an empty tray; 1 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短1手。', en: 'A penguin is collected only when it stops on its aurora. Best: 1.' },
      board: ['.....',
              '.....',
              'a...A',
              '.....',
              '.....']
    },
    {
      id: 2, name: 'DRIFT', par: 1,
      idea: 'one penguin, an empty tray; 1 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短1手。', en: 'A penguin is collected only when it stops on its aurora. Best: 1.' },
      board: ['.....',
              'A...a',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 3, name: 'GLIDE', par: 2,
      idea: 'one penguin, an empty tray; 2 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短2手。', en: 'A penguin is collected only when it stops on its aurora. Best: 2.' },
      board: ['....A',
              '.....',
              '.....',
              '.....',
              'a....']
    },
    {
      id: 4, name: 'FLOE', par: 2,
      idea: 'one penguin, an empty tray; 2 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短2手。', en: 'A penguin is collected only when it stops on its aurora. Best: 2.' },
      board: ['.A...',
              '.....',
              '.....',
              '.....',
              '....a']
    },
    {
      id: 5, name: 'SLIP', par: 2,
      idea: 'one penguin, an empty tray; 2 moves.',
      hint: { ja: 'オーロラの上で止まって初めて回収される。最短2手。', en: 'A penguin is collected only when it stops on its aurora. Best: 2.' },
      board: ['a....',
              '.....',
              '.....',
              '...A.',
              '.....']
    },
    {
      id: 6, name: 'CALM', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['....a',
              'bB.A.',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 7, name: 'FROST', par: 3,
      idea: 'two penguins, an empty tray; 3 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短3手。', en: 'The only brakes here are the edge and the other penguin. Best: 3.' },
      board: ['.A...',
              '.b...',
              '.....',
              '.B...',
              'a....']
    },
    {
      id: 8, name: 'SHELF', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['.....',
              'a....',
              '...B.',
              '.A...',
              '....b']
    },
    {
      id: 9, name: 'CRISP', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['a....',
              '...B.',
              '..A..',
              '....b',
              '.....']
    },
    {
      id: 10, name: 'DAWN', par: 4,
      idea: 'two penguins, an empty tray; 4 moves.',
      hint: { ja: '止められるのは盤の端ともう一羽だけ。最短4手。', en: 'The only brakes here are the edge and the other penguin. Best: 4.' },
      board: ['....a',
              '.....',
              '...B.',
              '..A..',
              '.b...']
    },
    {
      id: 11, name: 'RIME', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['.....',
              '.....',
              '.....',
              '...Ga',
              'Bb..A']
    },
    {
      id: 12, name: 'THAW', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['....A',
              '....B',
              '.....',
              '...Gb',
              '...a.']
    },
    {
      id: 13, name: 'SLEET', par: 5,
      idea: 'two penguins, 1 drifter; 5 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短5手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 5.' },
      board: ['.b...',
              'aG...',
              'A....',
              '.....',
              'B....']
    },
    {
      id: 14, name: 'BERG', par: 6,
      idea: 'two penguins, 1 drifter; 6 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短6手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 6.' },
      board: ['A..b.',
              '.G.Ba',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 15, name: 'CRAG', par: 6,
      idea: 'two penguins, 1 drifter; 6 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短6手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 6.' },
      board: ['.a...',
              'AB...',
              '.....',
              '.G...',
              'b....']
    },
    {
      id: 16, name: 'PALE', par: 7,
      idea: 'two penguins, 1 drifter; 7 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短7手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 7.' },
      board: ['.....',
              '.....',
              '.....',
              'b.G.A',
              '.B.a.']
    },
    {
      id: 17, name: 'HUSH', par: 7,
      idea: 'two penguins, 1 drifter; 7 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短7手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 7.' },
      board: ['.b..A',
              'aB...',
              '....G',
              '.....',
              '.....']
    },
    {
      id: 18, name: 'VEIL', par: 7,
      idea: 'two penguins, 1 drifter; 7 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短7手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 7.' },
      board: ['...B.',
              '....b',
              '.....',
              '...G.',
              '...aA']
    },
    {
      id: 19, name: 'SPUR', par: 8,
      idea: 'two penguins, 1 drifter; 8 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短8手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 8.' },
      board: ['.....',
              '.....',
              '.G...',
              '.B.Ab',
              'a....']
    },
    {
      id: 20, name: 'NORTH', par: 8,
      idea: 'two penguins, 1 drifter; 8 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短8手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 8.' },
      board: ['...b.',
              '.....',
              '...A.',
              '..GB.',
              '....a']
    },
    {
      id: 21, name: 'GLEAM', par: 8,
      idea: 'two penguins, 1 drifter; 8 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短8手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 8.' },
      board: ['bAG..',
              '.....',
              '.....',
              '.B...',
              '.a...']
    },
    {
      id: 22, name: 'SNAP', par: 9,
      idea: 'two penguins, 1 drifter; 9 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短9手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 9.' },
      board: ['....a',
              'bAB..',
              '....G',
              '.....',
              '.....']
    },
    {
      id: 23, name: 'RIDGE', par: 9,
      idea: 'two penguins, 1 drifter; 9 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短9手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 9.' },
      board: ['.bG..',
              '.A...',
              '.....',
              '.B...',
              'a....']
    },
    {
      id: 24, name: 'BASIN', par: 10,
      idea: 'two penguins, 1 drifter; 10 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短10手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 10.' },
      board: ['.....',
              'a....',
              'A....',
              '.G...',
              'B...b']
    },
    {
      id: 25, name: 'FJORD', par: 10,
      idea: 'two penguins, 1 drifter; 10 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短10手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 10.' },
      board: ['a....',
              '...Ab',
              '.B.G.',
              '.....',
              '.....']
    },
    {
      id: 26, name: 'SHARD', par: 10,
      idea: 'two penguins, 1 drifter; 10 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短10手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 10.' },
      board: ['....a',
              '.....',
              '..B..',
              '..GA.',
              '...b.']
    },
    {
      id: 27, name: 'PRISM', par: 11,
      idea: 'two penguins, 1 drifter; 11 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短11手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 11.' },
      board: ['.....',
              '.....',
              '.AG..',
              '...Ba',
              'b....']
    },
    {
      id: 28, name: 'GLINT', par: 11,
      idea: 'two penguins, 1 drifter; 11 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短11手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 11.' },
      board: ['...a.',
              '..G..',
              '...B.',
              '..A..',
              '....b']
    },
    {
      id: 29, name: 'HOAR', par: 11,
      idea: 'two penguins, 1 drifter; 11 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短11手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 11.' },
      board: ['a....',
              '..B..',
              '.....',
              '.A...',
              '.bG..']
    },
    {
      id: 30, name: 'BLUE', par: 12,
      idea: 'two penguins, 1 drifter; 12 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短12手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 12.' },
      board: ['....b',
              'a....',
              '.G...',
              '....B',
              '....A']
    },
    {
      id: 31, name: 'CLEFT', par: 12,
      idea: 'two penguins, 1 drifter; 12 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短12手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 12.' },
      board: ['.a...',
              '.....',
              '..G..',
              '.....',
              'b..BA']
    },
    {
      id: 32, name: 'WAKE', par: 13,
      idea: 'two penguins, 2 drifters; 13 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短13手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 13.' },
      board: ['.....',
              '.....',
              '.....',
              'G.GB.',
              'Ab..a']
    },
    {
      id: 33, name: 'SHOAL', par: 13,
      idea: 'two penguins, 2 drifters; 13 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短13手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 13.' },
      board: ['b..Ba',
              '.GAG.',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 34, name: 'PACK', par: 13,
      idea: 'two penguins, 2 drifters; 13 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短13手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 13.' },
      board: ['...Ab',
              '...G.',
              '.....',
              '....a',
              '...GB']
    },
    {
      id: 35, name: 'TIDE', par: 14,
      idea: 'two penguins, 2 drifters; 14 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短14手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 14.' },
      board: ['.....',
              '.....',
              '.....',
              '.GB.G',
              'a..Ab']
    },
    {
      id: 36, name: 'SPIRE', par: 14,
      idea: 'two penguins, 2 drifters; 14 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短14手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 14.' },
      board: ['....b',
              '....A',
              '...G.',
              '...B.',
              '...Ga']
    },
    {
      id: 37, name: 'BRINE', par: 14,
      idea: 'two penguins, 2 drifters; 14 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短14手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 14.' },
      board: ['bA...',
              '.G...',
              '.G...',
              'a....',
              'B....']
    },
    {
      id: 38, name: 'CROWN', par: 15,
      idea: 'two penguins, 2 drifters; 15 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短15手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 15.' },
      board: ['bGA.a',
              '...B.',
              '....G',
              '.....',
              '.....']
    },
    {
      id: 39, name: 'STILL', par: 15,
      idea: 'two penguins, 2 drifters; 15 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短15手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 15.' },
      board: ['b....',
              'G....',
              '.....',
              '.B...',
              'aAG..']
    },
    {
      id: 40, name: 'FLARE', par: 16,
      idea: 'two penguins, 2 drifters; 16 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短16手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 16.' },
      board: ['.....',
              '.....',
              '.....',
              '..AGG',
              'Ba..b']
    },
    {
      id: 41, name: 'QUARTZ', par: 16,
      idea: 'two penguins, 2 drifters; 16 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短16手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 16.' },
      board: ['a...A',
              '.GBGb',
              '.....',
              '.....',
              '.....']
    },
    {
      id: 42, name: 'LEDGE', par: 16,
      idea: 'two penguins, 2 drifters; 16 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短16手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 16.' },
      board: ['...Ga',
              '...B.',
              '...G.',
              '....A',
              '...b.']
    },
    {
      id: 43, name: 'SLATE', par: 17,
      idea: 'two penguins, 2 drifters; 17 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短17手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 17.' },
      board: ['.....',
              '.....',
              'GA...',
              '.B..a',
              'b..G.']
    },
    {
      id: 44, name: 'MIST', par: 17,
      idea: 'two penguins, 2 drifters; 17 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短17手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 17.' },
      board: ['..Ga.',
              '..AB.',
              '.....',
              '...G.',
              '....b']
    },
    {
      id: 45, name: 'ARCH', par: 17,
      idea: 'two penguins, 2 drifters; 17 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短17手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 17.' },
      board: ['a....',
              '.....',
              '.G...',
              '.AB..',
              '.bG..']
    },
    {
      id: 46, name: 'FLINT', par: 18,
      idea: 'two penguins, 2 drifters; 18 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短18手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 18.' },
      board: ['G...b',
              '..GB.',
              '.A...',
              'a....',
              '.....']
    },
    {
      id: 47, name: 'GLACE', par: 18,
      idea: 'two penguins, 2 drifters; 18 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短18手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 18.' },
      board: ['G..a.',
              '..A..',
              '.....',
              '.G...',
              'bB...']
    },
    {
      id: 48, name: 'SIREN', par: 19,
      idea: 'two penguins, 1 wall; 19 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短19手。', en: 'The wall and the other penguin are both brakes. Best: 19.' },
      board: ['..b..',
              '....a',
              '.....',
              '.....',
              'AB.#.']
    },
    {
      id: 49, name: 'HOLLOW', par: 19,
      idea: 'two penguins, 1 wall; 19 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短19手。', en: 'The wall and the other penguin are both brakes. Best: 19.' },
      board: ['A#.B.',
              '.....',
              '.....',
              '....b',
              '..a..']
    },
    {
      id: 50, name: 'HALF', par: 19,
      idea: 'two penguins, 1 wall; 19 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短19手。', en: 'The wall and the other penguin are both brakes. Best: 19.' },
      board: ['....A',
              '....#',
              'a....',
              '.....',
              '.b..B']
    },
    {
      id: 51, name: 'AURORA', par: 20,
      idea: 'two penguins, 1 wall; 20 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短20手。', en: 'The wall and the other penguin are both brakes. Best: 20.' },
      board: ['..b..',
              'a....',
              '.....',
              '.....',
              '.#B.A']
    },
    {
      id: 52, name: 'CINDER', par: 20,
      idea: 'two penguins, 1 wall; 20 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短20手。', en: 'The wall and the other penguin are both brakes. Best: 20.' },
      board: ['.a...',
              '....A',
              'b...B',
              '....#',
              '.....']
    },
    {
      id: 53, name: 'BEACON', par: 20,
      idea: 'two penguins, 1 wall; 20 moves.',
      hint: { ja: '壁ともう一羽、どちらもストッパーになる。最短20手。', en: 'The wall and the other penguin are both brakes. Best: 20.' },
      board: ['...b.',
              '#....',
              'A...a',
              'B....',
              '.....']
    },
    {
      id: 54, name: 'LANTERN', par: 21,
      idea: 'two penguins, 1 drifter, 1 wall; 21 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短21手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 21.' },
      board: ['....#',
              '.....',
              'aA...',
              '...G.',
              'B.b..']
    },
    {
      id: 55, name: 'HARBOUR', par: 21,
      idea: 'two penguins, 1 drifter, 1 wall; 21 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短21手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 21.' },
      board: ['..a..',
              '..A.b',
              '...B.',
              '....G',
              '#....']
    },
    {
      id: 56, name: 'KEEL', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短22手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 22.' },
      board: ['aBG.A',
              '.....',
              '.....',
              '.b...',
              '...#.']
    },
    {
      id: 57, name: 'ANCHOR', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短22手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 22.' },
      board: ['.#...',
              '...a.',
              '.....',
              '.....',
              'BbG.A']
    },
    {
      id: 58, name: 'MARINER', par: 22,
      idea: 'two penguins, 1 drifter, 1 wall; 22 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短22手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 22.' },
      board: ['G....',
              'b...#',
              'A....',
              '...a.',
              'B....']
    },
    {
      id: 59, name: 'COMPASS', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短23手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 23.' },
      board: ['A.G.a',
              '....B',
              '.....',
              '...b.',
              '.#...']
    },
    {
      id: 60, name: 'MERIDIAN', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短23手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 23.' },
      board: ['.B...',
              '...b.',
              'G....',
              'a...#',
              'A....']
    },
    {
      id: 61, name: 'SOLSTICE', par: 23,
      idea: 'two penguins, 1 drifter, 1 wall; 23 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短23手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 23.' },
      board: ['....B',
              '#....',
              '....G',
              '.a.A.',
              '....b']
    },
    {
      id: 62, name: 'ZENITH', par: 24,
      idea: 'two penguins, 1 drifter, 1 wall; 24 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短24手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 24.' },
      board: ['...#.',
              '.b...',
              '.....',
              'aBA..',
              '....G']
    },
    {
      id: 63, name: 'LATITUDE', par: 24,
      idea: 'two penguins, 1 drifter, 1 wall; 24 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短24手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 24.' },
      board: ['...a.',
              '.b.B.',
              '...G.',
              '#....',
              '....A']
    },
    {
      id: 64, name: 'CURRENT', par: 25,
      idea: 'two penguins, 1 drifter, 1 wall; 25 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短25手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 25.' },
      board: ['..AGB',
              'b....',
              '.....',
              '.a...',
              '...#.']
    },
    {
      id: 65, name: 'DRAUGHT', par: 25,
      idea: 'two penguins, 1 drifter, 1 wall; 25 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短25手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 25.' },
      board: ['.#...',
              '...b.',
              '.....',
              '....a',
              'AG..B']
    },
    {
      id: 66, name: 'CAVERN', par: 25,
      idea: 'two penguins, 1 drifter, 1 wall; 25 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短25手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 25.' },
      board: ['G....',
              'A...#',
              '.....',
              '...b.',
              'Ba...']
    },
    {
      id: 67, name: 'CHASM', par: 26,
      idea: 'two penguins, 1 drifter, 1 wall; 26 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短26手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 26.' },
      board: ['B.G.A',
              '....b',
              '.....',
              '...a.',
              '.#...']
    },
    {
      id: 68, name: 'FISSURE', par: 26,
      idea: 'two penguins, 1 drifter, 1 wall; 26 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短26手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 26.' },
      board: ['.A...',
              '...a.',
              'B....',
              'b...#',
              'G....']
    },
    {
      id: 69, name: 'MORAINE', par: 26,
      idea: 'two penguins, 1 drifter, 1 wall; 26 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短26手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 26.' },
      board: ['....A',
              '#....',
              '....G',
              '.b..B',
              '...a.']
    },
    {
      id: 70, name: 'CIRQUE', par: 27,
      idea: 'two penguins, 1 drifter, 1 wall; 27 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短27手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 27.' },
      board: ['...#.',
              '.a...',
              '.....',
              'b.B..',
              'A...G']
    },
    {
      id: 71, name: 'SERAC', par: 27,
      idea: 'two penguins, 1 drifter, 1 wall; 27 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短27手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 27.' },
      board: ['...b.',
              '.a.A.',
              '....B',
              '#....',
              '....G']
    },
    {
      id: 72, name: 'CREVASSE', par: 28,
      idea: 'two penguins, 1 drifter, 1 wall; 28 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短28手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 28.' },
      board: ['A.G..',
              '....a',
              'B....',
              '.b...',
              '...#.']
    },
    {
      id: 73, name: 'CORNICE', par: 28,
      idea: 'two penguins, 1 drifter, 1 wall; 28 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短28手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 28.' },
      board: ['.#...',
              '...a.',
              '....B',
              'b....',
              '..G.A']
    },
    {
      id: 74, name: 'SUMMIT', par: 28,
      idea: 'two penguins, 1 drifter, 1 wall; 28 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短28手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 28.' },
      board: ['.b...',
              '....#',
              'G....',
              '...a.',
              'BA...']
    },
    {
      id: 75, name: 'TRAVERSE', par: 29,
      idea: 'two penguins, 1 drifter, 1 wall; 29 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短29手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 29.' },
      board: ['Aa..B',
              'G....',
              '.....',
              '...b.',
              '.#...']
    },
    {
      id: 76, name: 'ASCENT', par: 29,
      idea: 'two penguins, 1 drifter, 1 wall; 29 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短29手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 29.' },
      board: ['.a...',
              '...b.',
              '.....',
              'B...#',
              'GA...']
    },
    {
      id: 77, name: 'PITON', par: 29,
      idea: 'two penguins, 1 drifter, 1 wall; 29 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短29手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 29.' },
      board: ['...G.',
              '#..Bb',
              '.....',
              '.a...',
              '...A.']
    },
    {
      id: 78, name: 'BELAY', par: 30,
      idea: 'two penguins, 1 drifter, 1 wall; 30 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短30手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 30.' },
      board: ['...#.',
              '.b...',
              '.....',
              'a...B',
              'A.G..']
    },
    {
      id: 79, name: 'CAIRN', par: 30,
      idea: 'two penguins, 1 drifter, 1 wall; 30 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短30手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 30.' },
      board: ['...a.',
              '.b..A',
              '....G',
              '#....',
              '...B.']
    },
    {
      id: 80, name: 'BEARING', par: 31,
      idea: 'two penguins, 1 drifter, 1 wall; 31 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短31手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 31.' },
      board: ['....G',
              'b.B..',
              '....A',
              '.a...',
              '...#.']
    },
    {
      id: 81, name: 'POLARIS', par: 31,
      idea: 'two penguins, 1 drifter, 1 wall; 31 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短31手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 31.' },
      board: ['.#...',
              '...b.',
              'B....',
              '...Aa',
              'G....']
    },
    {
      id: 82, name: 'MIDNIGHT', par: 31,
      idea: 'two penguins, 1 drifter, 1 wall; 31 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短31手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 31.' },
      board: ['G..B.',
              '....#',
              '.A...',
              '...b.',
              '.a...']
    },
    {
      id: 83, name: 'LONGNIGHT', par: 32,
      idea: 'two penguins, 1 drifter, 1 wall; 32 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短32手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 32.' },
      board: ['..G..',
              'A..Bb',
              '.....',
              '...a.',
              '.#...']
    },
    {
      id: 84, name: 'WHITEOUT', par: 32,
      idea: 'two penguins, 1 drifter, 1 wall; 32 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短32手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 32.' },
      board: ['.b...',
              '...a.',
              '.B...',
              'G...#',
              '.A...']
    },
    {
      id: 85, name: 'BLIZZARD', par: 32,
      idea: 'two penguins, 1 drifter, 1 wall; 32 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短32手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 32.' },
      board: ['..B..',
              '#....',
              '...G.',
              '.b.A.',
              '...a.']
    },
    {
      id: 86, name: 'SQUALL', par: 33,
      idea: 'two penguins, 1 drifter, 1 wall; 33 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短33手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 33.' },
      board: ['...#.',
              '.a...',
              '....A',
              'b.B..',
              '...G.']
    },
    {
      id: 87, name: 'TEMPEST', par: 33,
      idea: 'two penguins, 1 drifter, 1 wall; 33 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短33手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 33.' },
      board: ['...b.',
              '.a...',
              '....B',
              '#...G',
              '....A']
    },
    {
      id: 88, name: 'GALE', par: 34,
      idea: 'two penguins, 1 drifter, 1 wall; 34 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短34手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 34.' },
      board: ['A.G.B',
              'a....',
              '.....',
              '.b...',
              '...#.']
    },
    {
      id: 89, name: 'DRIFTWOOD', par: 34,
      idea: 'two penguins, 1 drifter, 1 wall; 34 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短34手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 34.' },
      board: ['.#...',
              '...a.',
              '.....',
              '....b',
              'A.GB.']
    },
    {
      id: 90, name: 'ICEFALL', par: 34,
      idea: 'two penguins, 1 drifter, 1 wall; 34 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短34手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 34.' },
      board: ['A....',
              '....#',
              '.....',
              'G..a.',
              'Bb...']
    },
    {
      id: 91, name: 'DEEPFROST', par: 35,
      idea: 'two penguins, 1 drifter, 1 wall; 35 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短35手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 35.' },
      board: ['..G..',
              '...Aa',
              'B....',
              '...b.',
              '.#...']
    },
    {
      id: 92, name: 'COLDIRON', par: 35,
      idea: 'two penguins, 1 drifter, 1 wall; 35 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短35手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 35.' },
      board: ['.a...',
              '...b.',
              '.....',
              '....#',
              'GAB..']
    },
    {
      id: 93, name: 'STARFIELD', par: 35,
      idea: 'two penguins, 1 drifter, 1 wall; 35 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短35手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 35.' },
      board: ['.A...',
              '#....',
              '....G',
              '.a.B.',
              '...b.']
    },
    {
      id: 94, name: 'NIGHTFALL', par: 36,
      idea: 'two penguins, 1 drifter, 1 wall; 36 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短36手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 36.' },
      board: ['A.G#.',
              '.b...',
              '.....',
              'a....',
              'B....']
    },
    {
      id: 95, name: 'FARSHORE', par: 36,
      idea: 'two penguins, 1 drifter, 1 wall; 36 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短36手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 36.' },
      board: ['A.Ba.',
              '.b...',
              'G....',
              '#....',
              '.....']
    },
    {
      id: 96, name: 'LASTLIGHT', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短37手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 37.' },
      board: ['.G...',
              '.B...',
              '.A...',
              'b..a.',
              '..#.#']
    },
    {
      id: 97, name: 'ENDLESS', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短37手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 37.' },
      board: ['#.#..',
              '.b.Ba',
              '.....',
              '...A.',
              '...G.']
    },
    {
      id: 98, name: 'THRESHOLD', par: 37,
      idea: 'two penguins, 1 drifter, 2 walls; 37 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短37手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 37.' },
      board: ['....#',
              'GABb.',
              '....#',
              '.....',
              '...a.']
    },
    {
      id: 99, name: 'CROSSING', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短38手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 38.' },
      board: ['.....',
              '.....',
              '#..#.',
              'a..bG',
              '...BA']
    },
    {
      id: 100, name: 'TILT', par: 38,
      idea: 'two penguins, 1 drifter, 2 walls; 38 moves.',
      hint: { ja: '灰色の流氷も同じ重力で滑る。オーロラをふさぐこともある。最短38手。', en: 'The grey floe slides with the same gravity — and it can sit on an aurora. Best: 38.' },
      board: ['.....',
              '..b#a',
              '.....',
              '...GB',
              '...#A']
    }
  ];

  return { STAGES: STAGES, CHAPTERS: CHAPTERS };
});
