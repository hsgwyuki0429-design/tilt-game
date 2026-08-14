'use strict';
/*
 * TILT — the campaign.
 *
 * This file IS the design document for all 100 stages, and it generates
 * src/stages.js from it.
 *
 *   node tools/campaign.js              build (uses the cache where possible)
 *   node tools/campaign.js --fresh      ignore the cache and search again
 *   node tools/campaign.js --workers 4  parallelism
 *   node tools/campaign.js --only 5,6   rebuild just those chapters
 *
 * Chapters 1–2 are hand-authored: they introduce the four things the game is
 * made of (gravity, walls, the void, colour, mass) and each new idea gets a
 * board simple enough to see it on. Those boards are written out below,
 * literally, and are never regenerated.
 *
 * Chapters 3–10 are SEARCHED, not sketched. Each declares a board budget and a
 * band of shortest-solution lengths; the generator throws boards at that spec
 * until enough of them survive every quality gate, then the ten that best cover
 * the band become the chapter. Difficulty is ordered by proven optimal length,
 * which is the axis the whole campaign is built on.
 *
 * A generated board ships only if ALL of the following hold:
 *   - it is solvable, and the shortest solution length is inside the band
 *   - it does not begin already solved
 *   - it has few enough distinct optimal lines to have a single clean idea
 *   - random par-length tilting almost never clears it (see `luck`)
 *   - deleting ANY wall, pit, goal or block measurably changes the puzzle
 *   - it is not a rotation or reflection of any other stage in the campaign
 *
 * No new mechanics are introduced after chapter 2. The late chapters are hard
 * because of geometry, not because the rules grew.
 */

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var B = require('./lib/boards.js');
var E = require('../src/engine.js');

var ROOT = path.join(__dirname, '..');
var CACHE_DIR = path.join(__dirname, '.campaign-cache');

// ===========================================================================
// CHAPTERS 1–2 — hand-authored. Every element here was checked by the same
// deletion test the generated boards face.
// ===========================================================================

var AUTHORED = [
  {
    number: 1, name: 'AWAKEN',
    note: 'Gravity, walls, blocks that block each other, and the void. One idea at a time.',
    stages: [
      {
        id: 1, name: 'DROP', par: 2,
        note: 'Gravity exists and it answers to you. One block, one goal, nothing to fear.',
        hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
        terrain: ['...', '...', '..o'],
        pieces: ['A..', '...', '...']
      },
      {
        id: 2, name: 'STOP', par: 3,
        note: 'Walls stop things. The straight line is closed, so the player invents the detour.',
        hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
        terrain: ['.#o', '...', '...'],
        pieces: ['A..', '...', '...']
      },
      {
        id: 3, name: 'TWO', par: 2,
        note: 'A second block. One goal serves both — and blocks pile up against each other.',
        terrain: ['..o', '...', '...'],
        pieces: ['A..', 'B..', '...']
      },
      {
        id: 4, name: 'FOLLOW', par: 4,
        note: 'The last tilt sends both blocks home at once. First taste of a chain.',
        terrain: ['...', '..#', '..o'],
        pieces: ['..B', 'A..', '...']
      },
      {
        id: 5, name: 'NOTCH', par: 4,
        note: 'The goal sits in the top edge behind a wall. Neither block can arrive straight.',
        terrain: ['.o.', '.#.', '...'],
        pieces: ['...', '...', 'AB.']
      },
      {
        id: 6, name: 'STACK', par: 5,
        note: 'Three blocks in one column. They are each other\'s floor — the order they unstack is the puzzle.',
        terrain: ['..#', '#.o', '...'],
        pieces: ['.C.', '.B.', '.A.']
      },
      {
        id: 7, name: 'LAP', par: 6,
        note: 'Two walls on opposite corners. Six moves out of nine cells, and exactly one line works.',
        terrain: ['.#o', '...', '..#'],
        pieces: ['A..', '...', '.B.']
      },
      {
        id: 8, name: 'VOID', par: 3,
        note: 'The pit. The most obvious first tilt deletes your only block — learned in one tap, undone in one tap.',
        hint: { ja: '穴に落ちたブロックは消える', en: 'Pits swallow blocks' },
        terrain: ['..*', '..o', '...'],
        pieces: ['A..', '...', '...']
      },
      {
        id: 9, name: 'LEDGE', par: 5,
        note: 'A pit above, a wall beside the goal. Half of all tilts here cost you a block.',
        terrain: ['..*', '.#o', '...'],
        pieces: ['.A.', '...', '..B']
      },
      {
        id: 10, name: 'BRINK', par: 5,
        note: 'The pit sits mid-board where both blocks must cross it. Survival is a matter of order.',
        terrain: ['.o#', '...', '.*.'],
        pieces: ['...', '..B', 'A..']
      }
    ]
  },
  {
    number: 2, name: 'SPECTRUM',
    note: 'Colour and mass arrive. After this chapter the rules never grow again.',
    stages: [
      {
        id: 11, name: 'HUE', par: 4,
        note: 'Colour is taught by disappointment: a block lands squarely on a goal and nothing happens.',
        hint: { ja: '色が合ったゴールだけ入る', en: 'Colours must match' },
        terrain: ['...', '...', '01.'],
        pieces: ['A..', 'B..', '...'],
        colors: { A: 0, B: 1 }
      },
      {
        id: 12, name: 'SPLIT', par: 5,
        note: 'Two goals side by side in the wrong order. The wall between them is the whole problem.',
        terrain: ['1#0', '...', '...'],
        pieces: ['...', '.B.', '.A.'],
        colors: { A: 0, B: 1 }
      },
      {
        id: 13, name: 'SORT', par: 6,
        note: 'Wrong-coloured goals are just floor. Sliding over one is free; stopping on one is a wasted move.',
        terrain: ['....', '1.#.', '.#0.', '....'],
        pieces: ['.B..', '....', 'A...', '....'],
        colors: { A: 0, B: 1 }
      },
      {
        id: 14, name: 'WIDE', par: 4,
        note: 'A two-cell block. It only counts when the whole body is home — half in is not in.',
        hint: { ja: '大きなブロックは全部入れる', en: 'The whole block must fit' },
        terrain: ['....', '....', '...#', '#.oo'],
        pieces: ['AA..', '....', '....', '....']
      },
      {
        id: 15, name: 'LEVER', par: 7,
        note: 'The wide block is also the best wall you own. Park it, then use it.',
        terrain: ['....', '#...', 'oo..', '#...'],
        pieces: ['....', '...B', '....', '.AA.']
      },
      {
        id: 16, name: 'FIT', par: 7,
        note: 'A tall goal and a wide goal. Blocks cannot turn, so each shape has exactly one home.',
        terrain: ['....', '.#.o', '...o', '.oo#'],
        pieces: ['BBA.', '..A.', '....', '....']
      },
      {
        id: 17, name: 'CASCADE', par: 6,
        note: 'Four blocks, one goal, and the LAST tilt sends three of them home in a single sweep. ' +
              'Searched specifically for a board whose cascade is the finale rather than a mid-game accident.',
        terrain: ['..#o', '....', '.#..', '..#.'],
        pieces: ['C...', '.ABD', '....', '....']
      },
      {
        id: 18, name: 'NERVE', par: 8,
        note: 'Colour, a pit and a chain on one small board. Thirty-seven different tilts here will cost you a block.',
        terrain: ['....', '..#.', '*.1.', '0...'],
        pieces: ['....', '.B..', '...A', '...C'],
        colors: { A: 1, B: 0, C: 1 }
      },
      {
        id: 19, name: 'PRISM', par: 9,
        note: 'Three colours, three goals, three separate laps around the same board.',
        terrain: ['.....', '#....', '2.1.#', '##...', '.0...'],
        pieces: ['..B..', '.....', '.....', '..A..', 'C....'],
        colors: { A: 1, B: 0, C: 2 }
      },
      {
        id: 20, name: 'TILT', par: 10,
        note: 'The end of the tutorial arc: a wide block, a pit, two colours, ten moves, one line through it.',
        terrain: ['.....', '..11#', '.*..#', '...#.', '.0...'],
        pieces: ['AA...', '.....', '..C..', '.....', 'B....'],
        colors: { A: 1, B: 0, C: 0 }
      }
    ]
  }
];

// ===========================================================================
// CHAPTERS 3–10 — searched. Each is a budget plus a band of solution lengths.
// ===========================================================================

var SEARCHED = [
  {
    number: 3, name: 'NINE',
    note: 'Everything that fits in nine cells. No new ideas — just proof that a 3×3 board can hold ' +
          'eight moves of thinking.',
    par: [5, 8],
    names: ['PIVOT', 'CORNER', 'SHUNT', 'TANGLE', 'ORBIT', 'CLASP', 'THREAD', 'RELAY', 'KNOT', 'CINCH'],
    filters: { ways: [1, 2], luck: 0.03, nodeCap: 120000 },
    specs: [
      { w: 3, h: 3, walls: [1, 2], pits: [0, 0], goals: [1, 1], pieces: [2, 3], colors: 1, tries: 40000 },
      { w: 3, h: 3, walls: [0, 2], pits: [1, 1], goals: [1, 1], pieces: [2, 3], colors: 1, tries: 40000, danger: true },
      { w: 3, h: 3, walls: [0, 1], pits: [0, 1], goals: [2, 2], pieces: [2, 2], colors: 2, tries: 40000 }
    ]
  },
  {
    number: 4, name: 'SIXTEEN',
    note: 'The board doubles. More cells means longer routes and more blocks in each other\'s way, ' +
          'without a single new rule.',
    par: [6, 9],
    names: ['LATTICE', 'SLALOM', 'HINGE', 'FERRY', 'RATCHET', 'DETOUR', 'SIEVE', 'CRADLE', 'SPIRAL', 'ANVIL'],
    filters: { ways: [1, 2], luck: 0.01, nodeCap: 150000 },
    specs: [
      { w: 4, h: 4, walls: [2, 4], pits: [0, 0], goals: [1, 2], pieces: [2, 3], colors: 1, tries: 55000 },
      { w: 4, h: 4, walls: [1, 3], pits: [0, 0], goals: [1, 2], pieces: [3, 4], colors: 1, tries: 55000 },
      { w: 4, h: 3, walls: [1, 3], pits: [0, 0], goals: [1, 2], pieces: [2, 3], colors: 1, tries: 45000 }
    ]
  },
  {
    number: 5, name: 'PALETTE',
    note: 'Two colours on a board big enough for them to get in each other\'s way. Every block needs ' +
          'its own route and they share the same gravity.',
    par: [7, 10],
    names: ['SWATCH', 'DECANT', 'SPLICE', 'FILTER', 'DIVIDE', 'ROTATE', 'EXCHANGE', 'MIRROR', 'PARTITION', 'RESOLVE'],
    filters: { ways: [1, 2], luck: 0.01, nodeCap: 200000 },
    specs: [
      { w: 4, h: 4, walls: [1, 3], pits: [0, 0], goals: [2, 3], pieces: [2, 3], colors: 2, tries: 55000 },
      { w: 4, h: 4, walls: [2, 4], pits: [0, 0], goals: [2, 2], pieces: [3, 3], colors: 2, tries: 55000 },
      { w: 5, h: 4, walls: [2, 4], pits: [0, 0], goals: [2, 3], pieces: [2, 3], colors: 2, tries: 45000 }
    ]
  },
  {
    number: 6, name: 'ABYSS',
    note: 'Boards where the wrong tilt costs you a block. Every stage in this chapter has at least one ' +
          'fatal move, so lookahead stops being optional.',
    par: [7, 11],
    names: ['CHASM', 'TIGHTROPE', 'GANTRY', 'PRECIPICE', 'SCAFFOLD', 'TRESTLE', 'CATWALK', 'FISSURE', 'PLUMMET', 'KEYSTONE'],
    filters: { ways: [1, 2], luck: 0.01, danger: true, nodeCap: 200000 },
    specs: [
      { w: 4, h: 4, walls: [1, 3], pits: [1, 2], goals: [1, 2], pieces: [2, 3], colors: 1, tries: 55000 },
      { w: 5, h: 4, walls: [1, 3], pits: [1, 2], goals: [1, 2], pieces: [2, 3], colors: 1, tries: 50000 },
      { w: 4, h: 4, walls: [0, 2], pits: [1, 2], goals: [2, 2], pieces: [3, 3], colors: 1, tries: 50000 }
    ]
  },
  {
    number: 7, name: 'MASS',
    note: 'Two-cell blocks. They cannot turn, they need a matching gap to pass and a matching goal to ' +
          'land in — and they make the best walls in the game.',
    par: [8, 11],
    names: ['GIRDER', 'BEAM', 'PISTON', 'BULKHEAD', 'CARRIAGE', 'TRUSS', 'BALLAST', 'COUPLING', 'DERRICK', 'KEEL'],
    filters: { ways: [1, 2], luck: 0.01, nodeCap: 200000 },
    specs: [
      { w: 4, h: 4, walls: [2, 4], pits: [0, 0], goals: [2, 3], pieces: [2, 3], big: [1, 1], colors: 1, tries: 35000 },
      { w: 5, h: 4, walls: [2, 4], pits: [0, 0], goals: [2, 4], pieces: [2, 3], big: [1, 2], colors: 1, tries: 35000 },
      { w: 5, h: 5, walls: [3, 5], pits: [0, 0], goals: [2, 4], pieces: [2, 3], big: [1, 2], colors: 1, tries: 30000 }
    ]
  },
  {
    number: 8, name: 'BLEND',
    note: 'Colour and the void together. A block can be routed correctly and still be destroyed on the ' +
          'way, so the order you solve the colours in becomes a survival question.',
    par: [9, 12],
    names: ['ALLOY', 'CRUCIBLE', 'QUENCH', 'DECAY', 'ISOTOPE', 'FERMENT', 'CATALYST', 'REAGENT', 'DISTIL', 'SYNTHESIS'],
    filters: { ways: [1, 2], luck: 0.008, danger: true, nodeCap: 250000 },
    specs: [
      { w: 5, h: 4, walls: [1, 3], pits: [1, 2], goals: [2, 3], pieces: [2, 3], colors: 2, tries: 55000 },
      { w: 5, h: 5, walls: [2, 4], pits: [1, 2], goals: [2, 3], pieces: [2, 3], colors: 2, tries: 50000 },
      { w: 4, h: 4, walls: [1, 3], pits: [1, 1], goals: [2, 3], pieces: [3, 3], colors: 2, tries: 50000 }
    ]
  },
  {
    number: 9, name: 'STRUCTURE',
    note: 'Mass and colour. A wide block that will not fit through a gap is a wall you have to plan ' +
          'around, and now it has a colour that decides where it must end up.',
    par: [9, 13],
    names: ['ARMATURE', 'BUTTRESS', 'CANTILEVER', 'LINTEL', 'PYLON', 'MULLION', 'ARCHITRAVE', 'SPANDREL', 'VAULT', 'CAPSTONE'],
    filters: { ways: [1, 2], luck: 0.008, nodeCap: 250000 },
    specs: [
      { w: 5, h: 5, walls: [3, 5], pits: [0, 0], goals: [3, 4], pieces: [2, 3], big: [1, 1], colors: 2, tries: 25000 },
      { w: 5, h: 4, walls: [2, 4], pits: [0, 0], goals: [3, 4], pieces: [3, 3], big: [1, 1], colors: 2, tries: 25000 },
      { w: 5, h: 5, walls: [3, 6], pits: [0, 0], goals: [2, 4], pieces: [3, 3], big: [1, 2], colors: 2, tries: 22000 }
    ]
  },
  {
    number: 10, name: 'CONVERGENCE',
    note: 'Mass, colour and the void on one board, on the largest grids in the game. Nothing new — ' +
          'everything at once, and up to fourteen moves of it.',
    par: [10, 14],
    names: ['CONFLUENCE', 'MERIDIAN', 'ESCAPEMENT', 'GYRE', 'LABYRINTH', 'CALIBRATE', 'ASCENDANT', 'TERMINUS', 'ZENITH', 'TILT II'],
    filters: { ways: [1, 2], luck: 0.006, danger: true, nodeCap: 300000 },
    specs: [
      { w: 5, h: 5, walls: [3, 6], pits: [1, 2], goals: [2, 4], pieces: [3, 3], big: [1, 1], colors: 2, tries: 22000 },
      { w: 6, h: 5, walls: [3, 6], pits: [1, 2], goals: [2, 4], pieces: [3, 4], big: [1, 1], colors: 2, tries: 16000 },
      { w: 5, h: 5, walls: [2, 5], pits: [1, 2], goals: [3, 4], pieces: [3, 4], big: [0, 1], colors: 2, tries: 18000 }
    ]
  }
];

// ===========================================================================
// search
// ===========================================================================

/** Fill one chapter's candidate pool. Runs inside a worker process. */
function searchChapter(chapter, seedBase) {
  var pool = [];
  var seen = {};
  chapter.specs.forEach(function (spec, si) {
    var rng = new B.Rng(seedBase + chapter.number * 7919 + si * 104729);
    var filters = {};
    Object.keys(chapter.filters).forEach(function (k) { filters[k] = chapter.filters[k]; });
    filters.par = chapter.par;
    if (spec.danger) filters.danger = true;

    for (var t = 0; t < spec.tries; t++) {
      var def = B.generate(spec, rng);
      if (!def) continue;
      var key = B.canonical(def);
      if (seen[key]) continue;
      seen[key] = 1;
      var res = B.evaluate(def, filters, rng);
      if (!res) continue;
      pool.push({
        key: key,
        terrain: def.terrain, pieces: def.pieces, colors: def.colors,
        par: res.par, ways: res.ways, luck: res.luck, states: res.states,
        kills: res.kills, chain: res.chain, score: res.score
      });
    }
  });
  return pool;
}

/**
 * What share of reachable positions can no longer be solved.
 *
 * A high number is not a bug — undo is free and the game flags a dead board the
 * moment it happens — but it is a measure of how unforgiving a stage feels, and
 * the first board of a chapter should not be the harshest one in it.
 */
function riskOf(def) {
  var st;
  try { st = E.compile(def); } catch (e) { return 0; }
  var states = E.reachable(st, null, 2500);
  var dead = 0, n = 0;
  for (var i = 0; i < states.length; i++) {
    if (E.isClear(states[i])) continue;
    n++;
    if (!E.solve(st, states[i], 20000).solvable) dead++;
  }
  return n ? dead / n : 0;
}

/**
 * Choose ten boards that cover the chapter's par band as evenly as possible,
 * best-scoring first at each length, skipping anything that duplicates a stage
 * already in the campaign.
 */
function selectTen(pool, band, used) {
  var chosen = [];
  var taken = {};
  var lo = band[0], hi = band[1];

  for (var slot = 0; slot < 10; slot++) {
    var target = lo + Math.round((hi - lo) * slot / 9);
    var best = null, bestIdx = -1;
    for (var i = 0; i < pool.length; i++) {
      if (taken[i] || used[pool[i].key]) continue;
      var c = pool[i];
      var d = Math.abs(c.par - target);
      if (!best || d < best.d || (d === best.d && c.score > best.score)) {
        best = { d: d, score: c.score, c: c };
        bestIdx = i;
      }
    }
    if (!best) return null;
    taken[bestIdx] = 1;
    used[best.c.key] = 1;
    chosen.push(best.c);
  }
  // Present each chapter in ascending difficulty. Solution length is the
  // primary axis; among boards of equal length the more forgiving one comes
  // first, so a chapter never opens with its cruellest position.
  chosen.forEach(function (c) { c.risk = riskOf(c); });
  chosen.sort(function (a, b) { return a.par - b.par || a.risk - b.risk || b.score - a.score; });
  return chosen;
}

// ===========================================================================
// emit
// ===========================================================================

function q(s) { return "'" + s.replace(/'/g, "\\'") + "'"; }

function nonDefaultColors(colors) {
  if (!colors) return null;
  var keys = Object.keys(colors);
  if (!keys.length) return null;
  var any = keys.some(function (k) { return colors[k] !== 0; });
  return any ? colors : null;
}

function emitLayer(key, rows, indent) {
  var pad = new Array(indent + 1).join(' ');
  var head = pad + key + ': [';
  var joiner = ',\n' + new Array(head.length + 1).join(' ');
  return head + rows.map(q).join(joiner) + ']';
}

function emitStage(st, indent) {
  var pad = new Array(indent + 1).join(' ');
  var out = [];
  out.push(pad + '{');
  var inner = indent + 2;
  var ip = new Array(inner + 1).join(' ');
  var head = ip + 'id: ' + st.id + ', name: ' + q(st.name) + ', par: ' + st.par + ',';
  if (st._m) {
    // Record why this board qualified, so the data file explains itself:
    // how many optimal lines exist, how unlikely a random clear is, how much
    // room there is to think, and whether the void is a live threat.
    var m = st._m;
    head += '   // ways ' + m.ways +
      ' · luck ' + (m.luck * 100).toFixed(2) + '%' +
      ' · ' + m.states + ' states' +
      (m.kills ? ' · fatal tilts' : '') +
      (m.chain > 1 ? ' · chain ×' + m.chain : '') +
      (m.risk > 0.25 ? ' · ' + Math.round(m.risk * 100) + '% dead ends' : '');
  }
  out.push(head);
  if (st.note) {
    if (typeof st.note === 'string' && st.note.length > 92) {
      // Wrap long notes so the data file stays readable at 100 columns.
      var words = st.note.split(' '), line = '', lines = [];
      words.forEach(function (w) {
        if ((line + ' ' + w).length > 88) { lines.push(line); line = w; }
        else line = line ? line + ' ' + w : w;
      });
      if (line) lines.push(line);
      // Every line but the last keeps a trailing space, or concatenation would
      // glue the last word of one line to the first word of the next.
      out.push(ip + 'note: ' + lines.map(function (l, li) {
        return q(li < lines.length - 1 ? l + ' ' : l);
      }).join(' +\n' + ip + '      ') + ',');
    } else {
      out.push(ip + 'note: ' + q(st.note) + ',');
    }
  }
  if (st.hint) out.push(ip + 'hint: { ja: ' + q(st.hint.ja) + ', en: ' + q(st.hint.en) + ' },');
  out.push(emitLayer('terrain', st.terrain, inner) + ',');
  out.push(emitLayer('pieces', st.pieces, inner) + (st.colors && Object.keys(st.colors).length ? ',' : ''));
  if (st.colors && Object.keys(st.colors).length) {
    var cs = Object.keys(st.colors).sort().map(function (k) { return k + ': ' + st.colors[k]; });
    out.push(ip + 'colors: { ' + cs.join(', ') + ' }');
  }
  out.push(pad + '}');
  return out.join('\n');
}

function emit(chapters) {
  var L = [];
  L.push("'use strict';");
  L.push('/*');
  L.push(' * TILT — stage data.  GENERATED FILE — do not edit by hand.');
  L.push(' *');
  L.push(' * Source of truth: tools/campaign.js  (rebuild with `npm run campaign`)');
  L.push(' *');
  L.push(' *   terrain: \'.\' floor  \'#\' wall  \'*\' pit');
  L.push(' *            \'o\' goal (any colour)   \'0\' \'1\' \'2\' goal (that colour only)');
  L.push(' *   pieces:  \'.\' empty  \'A\'..\'Z\'  one letter = one block');
  L.push(' *            (a letter repeated across adjacent cells = one rigid multi-cell block)');
  L.push(' *   colors:  { A: 0, B: 1, ... }  — defaults to 0');
  L.push(' *');
  L.push(' * Every `par` below is a breadth-first-proven shortest solution, and every wall, pit,');
  L.push(' * goal and block survived deletion testing: remove any one of them and the puzzle');
  L.push(' * measurably changes. Verified by tools/audit.js.');
  L.push(' */');
  L.push('(function (root, factory) {');
  L.push('  var api = factory();');
  L.push("  if (typeof module === 'object' && module.exports) { module.exports = api; }");
  L.push('  if (root) { root.TiltStages = api; }');
  L.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  L.push('');

  L.push('  var CHAPTERS = [');
  L.push(chapters.map(function (c) {
    return '    { number: ' + c.number + ', name: ' + q(c.name) + ', from: ' + c.from + ', to: ' + c.to + ',\n' +
           '      note: ' + q(c.note) + ' }';
  }).join(',\n'));
  L.push('  ];');
  L.push('');

  L.push('  var STAGES = [');
  var parts = [];
  chapters.forEach(function (c) {
    parts.push('\n    // ── CHAPTER ' + c.number + ' · ' + c.name +
      '  (stages ' + c.from + '–' + c.to + ', par ' + c.parLo + '–' + c.parHi + ') ' +
      new Array(Math.max(2, 46 - c.name.length)).join('─'));
    parts.push('    // ' + c.note);
    c.stages.forEach(function (st) { parts.push(emitStage(st, 4)); });
  });
  // Stages are separated by commas; chapter banners are comments, not entries.
  var body = [];
  parts.forEach(function (p) {
    if (p.trim().indexOf('//') === 0 || p.indexOf('\n    //') === 0) body.push(p);
    else body.push(p + ',');
  });
  var joined = body.join('\n');
  joined = joined.replace(/,(\s*)$/, '$1');
  L.push(joined);
  L.push('  ];');
  L.push('');
  L.push('  return { STAGES: STAGES, CHAPTERS: CHAPTERS };');
  L.push('});');
  return L.join('\n') + '\n';
}

// ===========================================================================
// driver
// ===========================================================================

function argOf(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = process.argv[i + 1];
  return (v == null || v.slice(0, 2) === '--') ? true : v;
}

/**
 * Keep the pool bounded and band-covering: the best few dozen boards at each
 * solution length. Handing back every survivor means multi-megabyte payloads
 * for no benefit — selection only ever looks at the top of each par bucket.
 */
function trimPool(pool, perPar) {
  var byPar = {};
  pool.forEach(function (p) { (byPar[p.par] = byPar[p.par] || []).push(p); });
  var out = [];
  Object.keys(byPar).forEach(function (k) {
    byPar[k].sort(function (a, b) { return b.score - a.score; });
    out = out.concat(byPar[k].slice(0, perPar));
  });
  return out;
}

if (process.env.TILT_WORKER) {
  // Worker: search its chapters, write each pool to disk, and hand back only
  // the chapter numbers.
  //
  // Writing to disk rather than sending the pools over IPC is deliberate.
  // process.send() is asynchronous, so a multi-megabyte payload followed by
  // process.exit() races the flush and the parent silently never hears back.
  process.on('message', function (msg) {
    var done = [];
    try {
      msg.chapters.forEach(function (n) {
        var ch = SEARCHED.filter(function (c) { return c.number === n; })[0];
        var t0 = Date.now();
        var pool = trimPool(searchChapter(ch, msg.seed), 60);
        fs.writeFileSync(path.join(CACHE_DIR, n + '.json'), JSON.stringify(pool));
        done.push(n);
        process.send({ progress: { chapter: n, found: pool.length, ms: Date.now() - t0 } });
      });
    } catch (e) {
      process.send({ error: String(e && e.stack || e) });
      process.exit(1);
      return;
    }
    // Exit only once the parent has actually received the message.
    process.send({ done: done }, function () { process.disconnect(); });
  });
} else {
  main();
}

function main() {
  var FRESH = !!argOf('fresh', false);
  var WORKERS = Number(argOf('workers', 4));
  var SEED = Number(argOf('seed', 20260814));
  var ONLY = argOf('only', null);
  var onlyList = ONLY && ONLY !== true ? String(ONLY).split(',').map(Number) : null;

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  var cache = {};
  if (!FRESH) {
    SEARCHED.forEach(function (c) {
      var f = path.join(CACHE_DIR, c.number + '.json');
      if (!fs.existsSync(f)) return;
      try { cache[c.number] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* refetch */ }
    });
  }

  var need = SEARCHED.filter(function (c) {
    if (onlyList && onlyList.indexOf(c.number) < 0) return false;
    return FRESH || !cache[c.number] || !cache[c.number].length;
  }).map(function (c) { return c.number; });

  if (!need.length) { finish(cache, SEED); return; }

  console.log('searching chapters ' + need.join(', ') + ' across ' + WORKERS + ' workers…\n');
  var buckets = [];
  for (var i = 0; i < WORKERS; i++) buckets.push([]);
  need.forEach(function (n, i) { buckets[i % WORKERS].push(n); });
  buckets = buckets.filter(function (b) { return b.length; });

  var pending = buckets.length;
  var t0 = Date.now();

  buckets.forEach(function (chapters) {
    var child = cp.fork(__filename, [], { env: Object.assign({}, process.env, { TILT_WORKER: '1' }) });
    child.on('message', function (m) {
      if (m.error) {
        console.error('\nworker failed:\n' + m.error);
        process.exit(1);
      }
      if (m.progress) {
        var p = m.progress;
        var ch = SEARCHED.filter(function (c) { return c.number === p.chapter; })[0];
        console.log('  chapter ' + p.chapter + ' ' + ch.name.padEnd(12) +
          String(p.found).padStart(5) + ' boards kept (best per solution length)   ' +
          (p.ms / 1000).toFixed(1) + 's');
      }
      if (m.done) {
        m.done.forEach(function (n) {
          cache[n] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, n + '.json'), 'utf8'));
        });
        if (--pending === 0) {
          console.log('\nsearch finished in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
          finish(cache, SEED);
        }
      }
    });
    // A worker that dies without reporting must not look like success.
    child.on('exit', function (code) {
      if (code !== 0 && pending > 0) {
        console.error('\na search worker exited with code ' + code + ' before reporting');
        process.exit(1);
      }
    });
    child.send({ chapters: chapters, seed: SEED });
  });
}

function finish(cache, seed) {
  var used = {};
  var chapters = [];
  var id = 1;
  var failed = [];

  AUTHORED.forEach(function (c) {
    var stages = c.stages.map(function (s) { id++; return s; });
    stages.forEach(function (s) {
      used[B.canonical({ terrain: s.terrain, pieces: s.pieces, colors: s.colors || {} })] = 1;
    });
    var pars = stages.map(function (s) { return s.par; });
    chapters.push({
      number: c.number, name: c.name, note: c.note, stages: stages,
      from: stages[0].id, to: stages[stages.length - 1].id,
      parLo: Math.min.apply(null, pars), parHi: Math.max.apply(null, pars)
    });
  });

  SEARCHED.forEach(function (c) {
    var pool = cache[c.number] || [];
    var picked = selectTen(pool, c.par, used);
    if (!picked) {
      failed.push(c.number + ' ' + c.name + ' (pool had ' + pool.length + ', needed 10 distinct)');
      return;
    }
    var stages = picked.map(function (p, i) {
      return {
        id: id++, name: c.names[i], par: p.par,
        terrain: p.terrain, pieces: p.pieces,
        // Colour 0 is the default, so an all-zero map is noise in the data file.
        colors: nonDefaultColors(p.colors),
        _m: p
      };
    });
    var pars = stages.map(function (s) { return s.par; });
    chapters.push({
      number: c.number, name: c.name, note: c.note, stages: stages,
      from: stages[0].id, to: stages[stages.length - 1].id,
      parLo: Math.min.apply(null, pars), parHi: Math.max.apply(null, pars)
    });
  });

  if (failed.length) {
    console.error('\ncould not fill: ' + failed.join('; '));
    console.error('raise `tries` for those chapters or widen their par band, then re-run with --fresh --only <n>');
    process.exit(1);
  }

  // Renumber ids so they run 1..100 regardless of chapter ordering.
  var n = 1;
  chapters.forEach(function (c) {
    c.stages.forEach(function (s) { s.id = n++; });
    c.from = c.stages[0].id;
    c.to = c.stages[c.stages.length - 1].id;
  });

  fs.writeFileSync(path.join(ROOT, 'src', 'stages.js'), emit(chapters));

  console.log('\nwrote src/stages.js — ' + (n - 1) + ' stages\n');
  chapters.forEach(function (c) {
    var pars = c.stages.map(function (s) { return s.par; });
    console.log('  ' + String(c.number).padStart(2) + '  ' + c.name.padEnd(13) +
      'stages ' + String(c.from).padStart(3) + '–' + String(c.to).padStart(3) +
      '   par ' + pars.join(' '));
  });
  console.log('');
}
