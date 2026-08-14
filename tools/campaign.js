'use strict';
/*
 * TILT — the campaign.
 *
 * This file IS the design document for all twenty stages, and it generates
 * src/stages.js from it.
 *
 *   node tools/campaign.js              build (uses the cache where possible)
 *   node tools/campaign.js --fresh      ignore the cache and search again
 *   node tools/campaign.js --workers 5  parallelism
 *   node tools/campaign.js --only 12,13 rebuild just those stages
 *
 * ---------------------------------------------------------------------------
 * WHAT WENT WRONG BEFORE, AND WHAT THIS FIXES
 * ---------------------------------------------------------------------------
 *
 * The previous campaign searched for the LONGEST solution it could find and
 * shipped whatever came back. That was the wrong target. A twenty-eight move
 * board with exactly one line through it is a corridor: the player does not
 * work it out, they feel their way along it, and being right feels like nothing
 * because there was never a moment of seeing.
 *
 * The feeling this game is for is not "that was long". It is:
 *
 *     obvious → try it → wrong → look again → oh. OH. → it all falls in
 *
 * So length is now a REQUIREMENT of a slot, never the thing being optimised.
 * What the search optimises is the shape of the thinking:
 *
 *   retreat    tilts on the optimal line that move blocks AWAY from the goal.
 *              A board with none can be solved by always heading for the exit.
 *              A board with two or three cannot be solved without the "wrong
 *              way first" realisation — which IS the moment this game is for.
 *   traps      how many opening tilts fail to make progress. Three out of four
 *              means the first move is a decision, not a formality.
 *   greedy     what happens to the player who is not thinking yet. On the best
 *              boards they walk in a circle forever.
 *   setup      tilts spent arranging before anything is collected at all.
 *   chainLast  blocks collected by the final tilt — the payoff landing at once.
 *   elements   taxed, always. The board has to LOOK simple or none of it lands.
 *
 * ---------------------------------------------------------------------------
 * TWENTY STAGES, NOT A HUNDRED
 * ---------------------------------------------------------------------------
 *
 * Twenty stages that are all worth playing, rather than a hundred that are
 * mostly filler. Every slot below is a design brief — a purpose, a board
 * budget, a proven solution length, and the specific feeling it has to produce
 * — and the search runs per slot until a board satisfies all of it.
 *
 * Boards stay small on purpose. Nothing here is bigger than 5×5 and the
 * twenty-move stages are 4×3. Length comes from DENSITY: more blocks in a small
 * space get in each other's way, and the order you unpack them in is the
 * puzzle. A big board with a long route is not the same thing and is not as
 * good.
 *
 * The rules never grow. Walls, blocks, goals, gravity — that is the entire
 * vocabulary from stage 1 to stage 20, and tools/audit.js fails the build if
 * anything else ever appears.
 */

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var B = require('./lib/boards.js');
var E = require('../src/engine.js');

var ROOT = path.join(__dirname, '..');
var CACHE_DIR = path.join(__dirname, '.campaign-cache');

// ===========================================================================
// CHAPTER 1 — hand-authored, because teaching is not a search problem.
//
// Five boards, five ideas, in the order they have to arrive. Every par below is
// solver-proven at build time and every element faced the same deletion test
// the generated boards face.
// ===========================================================================

var AUTHORED = {
  chapter: { number: 1, name: 'GRAVITY', ja: '重力' },
  note: 'Everything the game is made of, one idea per board: gravity moves things, walls stop them, ' +
        'blocks stop each other, and the way out is rarely the way you are facing.',
  stages: [
    {
      name: 'DROP',
      purpose: 'Gravity exists and it answers to you.',
      note: 'One block, one goal, nothing to be afraid of. The only stage in the game you can solve ' +
            'without thinking, and that is its job.',
      hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
      board: ['@..',
              '...',
              '..o']
    },
    {
      name: 'TWO',
      purpose: 'Every block is the same block, and one goal takes them all.',
      note: 'The last tilt sends both home at once — the first chain in the game, on the third move ' +
            'you will ever make.',
      hint: { ja: 'ブロックはすべて同じ。ゴールはどれでも受け取る', en: 'Every block is the same' },
      board: ['@..',
              '@..',
              '..o']
    },
    {
      name: 'STOP',
      purpose: 'Walls stop blocks — so the straight line is not always open.',
      note: 'The goal is two cells away in a straight line and that line is closed. The detour is ' +
            'the player\'s own idea, which is the point.',
      hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
      board: ['@#o',
              '...',
              '...']
    },
    {
      name: 'SHUNT',
      purpose: 'A block is a wall for another block — so order starts to matter.',
      note: 'Move the wrong one first and the other has nowhere to go. Nothing is lost by finding ' +
            'that out: undo costs nothing and is meant to be used.',
      hint: { ja: 'ブロックは他のブロックも止める', en: 'Blocks stop each other too' },
      board: ['.@.',
              '@#o',
              '.#.']
    },
    {
      name: 'LAP',
      purpose: 'The way out is not the way you are facing.',
      note: 'Two walls on opposite corners. Both blocks have to travel away from the goal before ' +
            'they can reach it — and a player who only ever tilts toward the goal circles this board ' +
            'forever without solving it. Six moves, one line, nine cells.',
      board: ['@#o',
              '...',
              '.@#']
    }
  ]
};

// ===========================================================================
// CHAPTERS 2–4 — searched, one slot at a time.
//
// `par` is a requirement, never a goal. `want` is what the board has to make
// the player feel; it is enforced as a hard filter AND is what the score
// rewards, so within a slot the winner is the board that does it hardest.
// ===========================================================================

var CHAPTERS = [
  {
    number: 2, name: 'NINE', ja: '九マス',
    note: 'Nine cells and nothing added. Every board in this chapter fits in a single glance and ' +
          'none of them can be solved in a single glance — which is the whole argument of the game, ' +
          'made on the smallest board it owns.'
  },
  {
    number: 3, name: 'ORDER', ja: '順番',
    note: 'Blocks are each other\'s walls. Now there are enough of them that the question stops ' +
          'being "which way" and becomes "which one, first".'
  },
  {
    number: 4, name: 'CONVERGENCE', ja: '収束',
    note: 'One goal, and a small board packed with blocks that all have to reach it. Nothing new — ' +
          'the boards barely even get bigger. There is just no slack left anywhere in them.'
  }
];

// Every slot: a name, the feeling it exists to produce, its proven length, its
// element budget, and the hard requirements that go with the feeling.
var SLOTS = [
  // ── CHAPTER 2 · NINE — 3×3, and every one of them earns its length ────────
  //
  // Every `want` below is set from a measured sample of what boards of that
  // length and budget actually look like, at roughly the median. Asking for
  // more than the population contains is how a slot searches forever and finds
  // nothing — the first draft of this file asked every 3×3 board for a
  // two-block finale, which on nine cells with one goal essentially never
  // happens.
  {
    chapter: 2, name: 'DETOUR', par: [7, 7],
    purpose: 'The first board that punishes heading straight for the goal.',
    spec: { w: 3, h: 3, walls: [1, 3], blocks: [2, 3], goals: [1, 1] },
    want: { retreat: 1, greedyGap: 999 },      // 999 = greedy must fail outright
    filters: { ways: [1, 3], luck: 0.02, minShift: 0.5 },
    tries: 900
  },
  {
    chapter: 2, name: 'PIVOT', par: [8, 8],
    purpose: 'Most of the openings are wrong. Choosing between them is the puzzle.',
    spec: { w: 3, h: 3, walls: [1, 3], blocks: [2, 3], goals: [1, 1] },
    want: { traps: 2, retreat: 1 },
    filters: { ways: [1, 3], luck: 0.015, minShift: 0.5 },
    tries: 1100
  },
  {
    chapter: 2, name: 'THREAD', par: [9, 9],
    purpose: 'Nine moves, and only one way to make them.',
    spec: { w: 3, h: 3, walls: [1, 3], blocks: [3, 4], goals: [1, 1] },
    want: { retreat: 2 },
    filters: { ways: [1, 2], luck: 0.015, minShift: 0.5 },
    tries: 1100
  },
  {
    chapter: 2, name: 'CIRCLE', par: [10, 11],
    purpose: 'A player who never thinks walks this board in a loop forever.',
    spec: { w: 3, h: 3, walls: [2, 3], blocks: [3, 4], goals: [1, 1] },
    want: { greedyGap: 999, retreat: 2 },
    filters: { ways: [1, 4], luck: 0.01, minShift: 0.5 },
    tries: 700
  },
  {
    chapter: 2, name: 'NINE', par: [12, 13],
    purpose: 'What nine cells can hold when every one of them is doing work.',
    spec: { w: 3, h: 3, walls: [2, 3], blocks: [3, 5], goals: [1, 1] },
    want: { retreat: 2, greedyGap: 999 },
    filters: { ways: [1, 4], luck: 0.01, minShift: 0.5 },
    tries: 900
  },

  // ── CHAPTER 3 · ORDER — 4×3 and 4×4, the unpacking problem ────────────────
  {
    chapter: 3, name: 'QUEUE', par: [14, 15],
    purpose: 'One cell wider than chapter two, and the extra room is where the detours live.',
    spec: { w: 4, h: 3, walls: [2, 4], blocks: [3, 5], goals: [1, 1] },
    want: { retreat: 3, traps: 1, greedyGap: 999 },
    filters: { ways: [1, 6], luck: 0.008, minShift: 0.5 },
    tries: 900
  },
  {
    chapter: 3, name: 'INTERLOCK', par: [16, 17],
    purpose: 'Every block is in another block\'s way. Very few release orders work.',
    spec: { w: 4, h: 3, walls: [2, 4], blocks: [4, 5], goals: [1, 1] },
    want: { retreat: 5, traps: 2 },
    filters: { ways: [1, 8], luck: 0.008, minShift: 0.5 },
    tries: 1400
  },
  {
    chapter: 3, name: 'TUMBLER', par: [18, 19],
    purpose: 'Sixteen cells, and the first board you cannot hold whole in your head.',
    spec: { w: 4, h: 4, walls: [3, 5], blocks: [4, 5], goals: [1, 1] },
    want: { retreat: 5, traps: 2 },
    filters: { ways: [1, 12], luck: 0.006, minShift: 0.45 },
    tries: 700
  },
  {
    chapter: 3, name: 'ESCAPEMENT', par: [21, 22],
    purpose: 'A long arrangement before anything at all is collected.',
    spec: { w: 4, h: 4, walls: [3, 5], blocks: [4, 6], goals: [1, 1] },
    want: { retreat: 6, setup: 3 },
    filters: { ways: [1, 20], luck: 0.005, minShift: 0.45 },
    tries: 1100
  },
  {
    chapter: 3, name: 'ORDER', par: [24, 26],
    purpose: 'The chapter\'s thesis: same three things, and the only question is which one first.',
    spec: { w: 4, h: 4, walls: [3, 6], blocks: [5, 7], goals: [1, 1] },
    want: { retreat: 6, traps: 2 },
    filters: { ways: [1, 40], luck: 0.004, minShift: 0.45 },
    tries: 1600
  },

  // ── CHAPTER 4 · CONVERGENCE — density, not size ───────────────────────────
  //
  // From here the boards barely grow but the block count does, and the number
  // of distinct optimal lines runs into the hundreds. That is fine — a hundred
  // fifty-move lines out of 4^50 sequences is still a needle — but it does mean
  // "no inert elements" stops being a real standard on its own, which is what
  // `minShift` is for: a fixed share of the elements have to change the
  // solution LENGTH when deleted, not merely the number of lines.
  {
    chapter: 4, name: 'PRESSURE', par: [28, 30],
    purpose: 'Sixteen cells, half of them full. Nothing can move until something else has.',
    spec: { w: 4, h: 4, walls: [4, 6], blocks: [6, 8], goals: [1, 1] },
    want: { retreat: 8, traps: 2 },
    filters: { ways: [1, 60], luck: 0.004, minShift: 0.4 },
    tries: 1800
  },
  {
    chapter: 4, name: 'FUNNEL', par: [32, 34],
    purpose: 'Many blocks, one exit, and a queue that has to be built before it can be emptied.',
    spec: { w: 5, h: 4, walls: [4, 6], blocks: [6, 9], goals: [1, 1] },
    want: { retreat: 10, traps: 2 },
    filters: { ways: [1, 250], luck: 0.003, minShift: 0.4 },
    tries: 800
  },
  {
    chapter: 4, name: 'MARSHAL', par: [37, 39],
    purpose: 'Twenty cells and nine blocks: the board is the traffic jam.',
    spec: { w: 5, h: 4, walls: [4, 7], blocks: [7, 10], goals: [1, 1] },
    want: { retreat: 11 },
    filters: { ways: [1, 400], luck: 0.003, minShift: 0.4 },
    tries: 800
  },
  {
    chapter: 4, name: 'KEYSTONE', par: [43, 45],
    purpose: 'One block is the plug. Everything waits on working out which.',
    spec: { w: 5, h: 4, walls: [4, 7], blocks: [8, 11], goals: [1, 1] },
    want: { retreat: 12 },
    filters: { ways: [1, 800], luck: 0.002, minShift: 0.35 },
    tries: 700
  },
  {
    chapter: 4, name: 'TILT', par: [49, 52],
    purpose: 'The finale. Twenty-five cells, one goal, and about fifty tilts of nothing but ' +
             'gravity, walls and blocks.',
    spec: { w: 5, h: 5, walls: [5, 8], blocks: [9, 13], goals: [1, 1] },
    want: { retreat: 13 },
    filters: { ways: [1, 1500], luck: 0.002, minShift: 0.35 },
    tries: 600
  }
];

var FIRST_SEARCHED = AUTHORED.stages.length + 1;   // stage number of SLOTS[0]

// ===========================================================================
// search
// ===========================================================================

/**
 * Fill one slot's candidate pool. Runs inside a worker process.
 *
 * The climb aims at the slot's length; the gate then throws away everything
 * that hits the length without producing the feeling. That order matters — the
 * length is cheap to test and the feeling is not.
 */
function searchSlot(slot, index, seedBase) {
  var rng = new B.Rng(seedBase + index * 104729 + 7919);
  var filters = { par: slot.par, maxDead: 0, nodeCap: 300000 };
  Object.keys(slot.filters).forEach(function (k) { filters[k] = slot.filters[k]; });
  Object.keys(slot.want).forEach(function (k) { filters[k] = slot.want[k]; });

  var pool = [];
  var seen = {};

  for (var t = 0; t < slot.tries; t++) {
    var rows = B.climb(slot.spec, rng, slot.par, 600, filters.nodeCap);
    if (!rows) continue;
    var key = B.canonical(rows);
    if (seen[key]) continue;
    seen[key] = 1;
    var res = B.evaluate(rows, filters, rng);
    if (!res) continue;
    pool.push({
      key: key, board: res.board,
      par: res.par, ways: res.ways, luck: res.luck, states: res.states, dead: res.dead,
      chain: res.chain, chainLast: res.chainLast, setup: res.setup, retreat: res.retreat,
      traps: res.traps, liveOpenings: res.liveOpenings, greedy: res.greedy,
      walls: res.walls, goals: res.goals, blocks: res.blocks, elements: res.elements,
      score: res.score
    });
    // Only the best are ever handed back; there is no point growing the pool
    // without bound once a slot is comfortably filled.
    if (pool.length > 400) {
      pool.sort(function (a, b) { return b.score - a.score; });
      pool = pool.slice(0, 120);
    }
  }
  pool.sort(function (a, b) { return b.score - a.score; });
  return pool.slice(0, 120);
}

// ===========================================================================
// emit
// ===========================================================================

function q(s) { return "'" + s.replace(/'/g, "\\'") + "'"; }

function emitBoard(rows, indent) {
  var pad = new Array(indent + 1).join(' ');
  var head = pad + 'board: [';
  var joiner = ',\n' + new Array(head.length + 1).join(' ');
  return head + rows.map(q).join(joiner) + ']';
}

function wrapNote(key, note, ip) {
  if (note.length <= 92) return ip + key + ': ' + q(note) + ',';
  // Wrap long notes so the data file stays readable at 100 columns.
  var words = note.split(' '), line = '', lines = [];
  words.forEach(function (w) {
    if ((line + ' ' + w).length > 88) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  });
  if (line) lines.push(line);
  // Every line but the last keeps a trailing space, or concatenation would glue
  // the last word of one line to the first word of the next.
  var cont = '\n' + ip + new Array(key.length + 3).join(' ');
  return ip + key + ': ' + lines.map(function (l, li) {
    return q(li < lines.length - 1 ? l + ' ' : l);
  }).join(' +' + cont) + ',';
}

function emitStage(st, indent) {
  var pad = new Array(indent + 1).join(' ');
  var inner = indent + 2;
  var ip = new Array(inner + 1).join(' ');
  var out = [];
  out.push(pad + '{');

  var head = ip + 'id: ' + st.id + ', name: ' + q(st.name) + ', par: ' + st.par + ',';
  if (st._m) {
    // Say why this board is here, in the numbers that chose it.
    var m = st._m;
    head += '   // ' + m.elements + ' pieces · ' +
      m.retreat + ' wrong-way tilts · ' +
      m.traps + '/' + m.liveOpenings + ' openings wrong · ' +
      (m.greedy < 0 ? 'greedy loops forever' : 'greedy takes ' + m.greedy) +
      ' · ' + m.setup + ' set-up · ' + m.states + ' states' +
      (m.chainLast > 1 ? ' · finale ×' + m.chainLast : '') +
      ' · ways ' + m.ways;
  }
  out.push(head);
  if (st.purpose) out.push(wrapNote('purpose', st.purpose, ip));
  if (st.note) out.push(wrapNote('note', st.note, ip));
  if (st.hint) out.push(ip + 'hint: { ja: ' + q(st.hint.ja) + ', en: ' + q(st.hint.en) + ' },');
  out.push(emitBoard(st.board, inner));
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
  L.push(' * One board, one picture, four characters:');
  L.push(' *');
  L.push(" *     '.'  floor        '#'  wall");
  L.push(" *     'o'  goal         '@'  block");
  L.push(' *');
  L.push(' * There is nothing else. Every block is identical, no cell is forbidden, and no stage');
  L.push(' * anywhere in this file introduces a rule that stage 1 did not already have.');
  L.push(' *');
  L.push(' * Every `par` is a breadth-first-proven shortest solution. Every wall, block and goal');
  L.push(' * survived deletion testing: remove any one of them and the puzzle measurably changes.');
  L.push(' * The comment on each stage is why THAT board was chosen over the thousands of others');
  L.push(' * of the same length. Verified by tools/audit.js.');
  L.push(' */');
  L.push('(function (root, factory) {');
  L.push('  var api = factory();');
  L.push("  if (typeof module === 'object' && module.exports) { module.exports = api; }");
  L.push('  if (root) { root.TiltStages = api; }');
  L.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  L.push('');

  L.push('  var CHAPTERS = [');
  L.push(chapters.map(function (c) {
    return '    { number: ' + c.number + ', name: ' + q(c.name) + ', ja: ' + q(c.ja) +
           ', from: ' + c.from + ', to: ' + c.to + ',\n' +
           '      note: ' + q(c.note) + ' }';
  }).join(',\n'));
  L.push('  ];');
  L.push('');

  L.push('  var STAGES = [');
  var parts = [];
  chapters.forEach(function (c) {
    parts.push('\n    // ── CHAPTER ' + c.number + ' · ' + c.name + ' · ' + c.ja +
      '  (stages ' + c.from + '–' + c.to + ', par ' + c.parLo + '–' + c.parHi + ') ' +
      new Array(Math.max(2, 40 - c.name.length)).join('─'));
    parts.push('    // ' + c.note);
    c.stages.forEach(function (st) { parts.push(emitStage(st, 4)); });
  });
  // Stages are separated by commas; chapter banners are comments, not entries.
  var body = [];
  parts.forEach(function (p) {
    if (p.trim().indexOf('//') === 0 || p.indexOf('\n    //') === 0) body.push(p);
    else body.push(p + ',');
  });
  var joined = body.join('\n').replace(/,(\s*)$/, '$1');
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

if (process.env.TILT_WORKER) {
  // Worker: search its slots, write each pool to disk, hand back slot indices.
  //
  // Writing to disk rather than sending pools over IPC is deliberate:
  // process.send() is asynchronous, so a large payload followed by
  // process.exit() races the flush and the parent silently never hears back.
  process.on('message', function (msg) {
    var done = [];
    try {
      msg.slots.forEach(function (i) {
        var t0 = Date.now();
        var pool = searchSlot(SLOTS[i], i, msg.seed);
        fs.writeFileSync(path.join(CACHE_DIR, 'slot-' + i + '.json'), JSON.stringify(pool));
        done.push(i);
        process.send({ progress: { slot: i, found: pool.length, ms: Date.now() - t0 } });
      });
    } catch (e) {
      process.send({ error: String(e && e.stack || e) });
      process.exit(1);
      return;
    }
    process.send({ done: done }, function () { process.disconnect(); });
  });
} else {
  main();
}

function main() {
  var FRESH = !!argOf('fresh', false);
  var WORKERS = Number(argOf('workers', 5));
  var SEED = Number(argOf('seed', 20260814));
  var ONLY = argOf('only', null);
  var onlyList = ONLY && ONLY !== true ? String(ONLY).split(',').map(Number) : null;

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  var cache = {};
  if (!FRESH) {
    SLOTS.forEach(function (s, i) {
      var f = path.join(CACHE_DIR, 'slot-' + i + '.json');
      if (!fs.existsSync(f)) return;
      try { cache[i] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* research it */ }
    });
  }

  var need = [];
  SLOTS.forEach(function (s, i) {
    // --only names stage numbers, which run ahead of the slot index by the
    // length of the hand-authored chapter.
    if (onlyList && onlyList.indexOf(i + FIRST_SEARCHED) < 0) return;
    if (FRESH || !cache[i] || !cache[i].length) need.push(i);
  });

  if (!need.length) { finish(cache); return; }

  console.log('searching ' + need.length + ' stage slots across ' + WORKERS + ' workers…\n');
  var buckets = [];
  for (var i = 0; i < WORKERS; i++) buckets.push([]);
  // Deal the longest slots out first so no worker ends up holding all of them.
  need.slice().sort(function (a, b) { return b - a; })
    .forEach(function (n, i) { buckets[i % WORKERS].push(n); });
  buckets = buckets.filter(function (b) { return b.length; });

  var pending = buckets.length;
  var t0 = Date.now();

  buckets.forEach(function (slots) {
    var child = cp.fork(__filename, [], { env: Object.assign({}, process.env, { TILT_WORKER: '1' }) });
    child.on('message', function (m) {
      if (m.error) {
        console.error('\nworker failed:\n' + m.error);
        process.exit(1);
      }
      if (m.progress) {
        var p = m.progress;
        var slot = SLOTS[p.slot];
        console.log('  stage ' + String(p.slot + FIRST_SEARCHED).padStart(2) + ' ' +
          slot.name.padEnd(11) + 'par ' + String(slot.par[0]).padStart(2) + '  ' +
          String(p.found).padStart(4) + ' boards passed   ' + (p.ms / 1000).toFixed(1) + 's' +
          (p.found ? '' : '   [31mEMPTY[0m'));
      }
      if (m.done) {
        m.done.forEach(function (n) {
          cache[n] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'slot-' + n + '.json'), 'utf8'));
        });
        if (--pending === 0) {
          console.log('\nsearch finished in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
          finish(cache);
        }
      }
    });
    child.on('exit', function (code) {
      if (code !== 0 && pending > 0) {
        console.error('\na search worker exited with code ' + code + ' before reporting');
        process.exit(1);
      }
    });
    child.send({ slots: slots, seed: SEED });
  });
}

/** Solver-proven numbers for a hand-authored board — never a figure I typed in. */
function measureAuthored(stage) {
  var res = B.evaluate(stage.board, { nodeCap: 80000 }, null);
  if (!res) throw new Error('authored stage ' + stage.name + ' is unsolvable or already clear');
  var inert = B.findInert(stage.board, res.par, res.ways, 80000);
  if (inert) throw new Error('authored stage ' + stage.name + ' has an inert ' + inert);
  return res;
}

function finish(cache) {
  var chapters = [];
  var used = {};
  var failed = [];
  var id = 1;

  var authored = AUTHORED.stages.map(function (s) {
    var m = measureAuthored(s);
    used[B.canonical(s.board)] = 1;
    return {
      id: id++, name: s.name, purpose: s.purpose, note: s.note, hint: s.hint,
      board: s.board, par: m.par, _m: m
    };
  });
  chapters.push({
    number: AUTHORED.chapter.number, name: AUTHORED.chapter.name, ja: AUTHORED.chapter.ja,
    note: AUTHORED.note, stages: authored
  });

  SLOTS.forEach(function (slot, i) {
    var pool = cache[i] || [];
    // Skip anything that is a rotation of a board already in the campaign.
    var pick = null;
    for (var k = 0; k < pool.length; k++) {
      if (!used[pool[k].key]) { pick = pool[k]; break; }
    }
    if (!pick) {
      failed.push('stage ' + (i + FIRST_SEARCHED) + ' ' + slot.name + ' (pool had ' + pool.length + ')');
      return;
    }
    used[pick.key] = 1;

    var chap = chapters.filter(function (c) { return c.number === slot.chapter; })[0];
    if (!chap) {
      var def = CHAPTERS.filter(function (c) { return c.number === slot.chapter; })[0];
      chap = { number: def.number, name: def.name, ja: def.ja, note: def.note, stages: [] };
      chapters.push(chap);
    }
    chap.stages.push({
      id: id++, name: slot.name, purpose: slot.purpose, board: pick.board,
      par: pick.par, _m: pick
    });
  });

  if (failed.length) {
    console.error('\ncould not fill: ' + failed.join('; '));
    console.error('relax that slot\'s `want`, widen its par band, or raise `tries`, then re-run:');
    console.error('  node tools/campaign.js --fresh --only <stage number>');
    process.exit(1);
  }

  chapters.forEach(function (c) {
    var pars = c.stages.map(function (s) { return s.par; });
    c.from = c.stages[0].id;
    c.to = c.stages[c.stages.length - 1].id;
    c.parLo = Math.min.apply(null, pars);
    c.parHi = Math.max.apply(null, pars);
  });

  fs.writeFileSync(path.join(ROOT, 'src', 'stages.js'), emit(chapters));

  console.log('\nwrote src/stages.js — ' + (id - 1) + ' stages\n');
  chapters.forEach(function (c) {
    console.log('  ' + String(c.number).padStart(2) + '  ' + c.name + ' · ' + c.ja +
      '   stages ' + c.from + '–' + c.to);
    c.stages.forEach(function (s) {
      var m = s._m;
      console.log('        ' + String(s.id).padStart(2) + ' ' + s.name.padEnd(11) +
        (s.board[0].length + '×' + s.board.length).padEnd(4) +
        'par ' + String(s.par).padStart(2) +
        '  pieces ' + String(m.elements).padStart(2) +
        '  wrong-way ' + m.retreat +
        '  traps ' + m.traps + '/' + m.liveOpenings +
        '  greedy ' + (m.greedy < 0 ? 'loops' : String(m.greedy)).padStart(5) +
        '  ways ' + m.ways);
    });
    console.log('');
  });
}
