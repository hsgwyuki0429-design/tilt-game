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
 * ---------------------------------------------------------------------------
 * THE DESIGN RULE
 * ---------------------------------------------------------------------------
 *
 * There are three things on a TILT board: walls, blocks and goals. Every block
 * is identical, no cell is forbidden, nothing can be destroyed, and tilting is
 * the only verb. That list is closed. A later chapter may not introduce a new
 * element, a new colour, a new hazard or a new exception — if a stage is not
 * interesting, the answer is a better arrangement of the same three things, not
 * a fourth thing.
 *
 * So difficulty here has exactly one axis, and it is the honest one: the proven
 * shortest number of tilts. Chapter 1 asks for two moves. Chapter 10 asks for
 * twenty-five, on a board you can still take in at a glance. Nothing in between
 * is a new rule — it is the same rule, folded further.
 *
 * Chapter 1 is hand-authored, because the first ten boards have a job the
 * search cannot do: introduce gravity, walls, one goal serving many blocks, and
 * blocks getting in each other's way, one idea at a time and each on a board
 * simple enough to see it on.
 *
 * Chapters 2–10 are SEARCHED, and they are searched by hill-climbing: throw
 * down a random board on a fixed element budget, then move ONE element at a
 * time for as long as the shortest solution keeps growing. The budget never
 * grows during a climb, so what the search produces is not a busier board — it
 * is the same handful of pieces arranged so they finally have something to say.
 *
 * A generated board ships only if ALL of the following hold:
 *   - it is solvable, and the shortest solution length is inside the band
 *   - it does not begin already solved
 *   - it has few enough distinct optimal lines to have a single clean idea
 *   - random tilting almost never clears it (see `luck`)
 *   - it cannot be jammed: at most a quarter of the positions you can wander
 *     into are unsolvable, because a board you can ruin by exploring it is a
 *     failure state wearing a different hat
 *   - deleting ANY wall, block or goal measurably changes the puzzle
 *   - it is not a rotation or reflection of any other stage in the campaign
 */

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var B = require('./lib/boards.js');
var E = require('../src/engine.js');

var ROOT = path.join(__dirname, '..');
var CACHE_DIR = path.join(__dirname, '.campaign-cache');

// ===========================================================================
// CHAPTER 1 — hand-authored. Every element here faced the same deletion test
// the generated boards face, and every par below is solver-proven.
// ===========================================================================

var AUTHORED = [
  {
    number: 1, name: 'AWAKEN',
    note: 'Gravity, walls, and blocks that get in each other\'s way. Everything the game is made of, ' +
          'one idea at a time.',
    stages: [
      {
        name: 'DROP',
        note: 'Gravity exists and it answers to you. One block, one goal, nothing to be afraid of.',
        hint: { ja: 'スワイプして重力を変える', en: 'Swipe to tilt gravity' },
        board: ['@..',
                '...',
                '..o']
      },
      {
        name: 'TWO',
        note: 'A second block. The goal takes any block — so the last tilt sends both home at once, ' +
              'and that is the first chain you will ever see.',
        hint: { ja: 'ブロックはすべて同じ。ゴールはどれでも受け取る', en: 'Every block is the same' },
        board: ['@..',
                '@..',
                '..o']
      },
      {
        name: 'STOP',
        note: 'A wall closes the straight line, so the player invents the detour.',
        hint: { ja: '壁はブロックを止める', en: 'Walls stop blocks' },
        board: ['@#o',
                '...',
                '...']
      },
      {
        name: 'NOTCH',
        note: 'The goal sits in the top edge behind a wall. Neither block can arrive straight at it.',
        board: ['.o.',
                '.#.',
                '@@.']
      },
      {
        name: 'FOLLOW',
        note: 'One block waits above the wall while the other travels. They arrive together.',
        board: ['..@',
                '..#',
                '@.o']
      },
      {
        name: 'PAIR',
        note: 'Two blocks, two walls, and the first board where the answer is not the direction you ' +
              'wanted to swipe.',
        board: ['@.#',
                '.#o',
                '..@']
      },
      {
        name: 'SHUNT',
        note: 'A block is a wall for another block. Move the wrong one first and the other has nowhere ' +
              'to go.',
        board: ['.@.',
                '@#o',
                '.#.']
      },
      {
        name: 'CORNER',
        note: 'The goal is one cell away and completely out of reach. Five moves to travel two.',
        board: ['@#o',
                '...',
                '..#']
      },
      {
        name: 'LAP',
        note: 'Two walls on opposite corners. Six moves out of nine cells, and exactly one line works.',
        board: ['@#o',
                '...',
                '.@#']
      },
      {
        name: 'TIGHT',
        note: 'The end of the introduction: three cells of wall, two blocks, one goal, seven tilts. ' +
              'Everything from here is this, folded further.',
        board: ['@@#',
                '.#o',
                '...']
      }
    ]
  }
];

// ===========================================================================
// CHAPTERS 2–10 — searched. Each is an element budget plus a band of proven
// solution lengths. The bands only ever go up.
// ===========================================================================

var SEARCHED = [
  {
    number: 2, name: 'NINE',
    note: 'Nine cells, and nothing else will be added. Proof that a 3×3 board already holds ten moves ' +
          'of thinking if the walls are in the right places.',
    par: [6, 10],
    names: ['PIVOT', 'SHUNT II', 'ORBIT', 'CLASP', 'THREAD', 'RELAY', 'KNOT', 'CINCH', 'SPIRE', 'NINE'],
    filters: { ways: [1, 2], luck: 0.01, maxDead: 0.25, nodeCap: 60000 },
    specs: [
      { w: 3, h: 3, walls: [1, 2], blocks: [2, 3], goals: [1, 1], tries: 1500 },
      { w: 3, h: 3, walls: [2, 3], blocks: [2, 3], goals: [1, 2], tries: 1500 }
    ]
  },
  {
    number: 3, name: 'TWELVE',
    note: 'Three cells wider. The extra room is not a kindness — it is where the long way round lives.',
    par: [9, 12],
    names: ['LATCH', 'SLALOM', 'HINGE', 'FERRY', 'RATCHET', 'DETOUR', 'SIEVE', 'CRADLE', 'WINCH', 'ANVIL'],
    filters: { ways: [1, 2], luck: 0.008, maxDead: 0.25, nodeCap: 80000 },
    specs: [
      { w: 4, h: 3, walls: [2, 3], blocks: [2, 3], goals: [1, 2], tries: 1500 },
      { w: 4, h: 3, walls: [3, 4], blocks: [3, 3], goals: [1, 1], tries: 1500 }
    ]
  },
  {
    number: 4, name: 'SIXTEEN',
    note: 'The board doubles. Same three things on it, twice as much room for them to be in the wrong ' +
          'place.',
    par: [11, 14],
    names: ['GRID', 'CAROUSEL', 'PENDULUM', 'SHUTTLE', 'TRAVERSE', 'MEANDER', 'CIRCUIT', 'GANTRY',
            'ESCARP', 'SIXTEEN'],
    filters: { ways: [1, 2], luck: 0.006, maxDead: 0.25, opening: 1, nodeCap: 100000 },
    specs: [
      { w: 4, h: 4, walls: [2, 4], blocks: [2, 3], goals: [1, 2], tries: 1500 },
      { w: 4, h: 4, walls: [3, 5], blocks: [3, 4], goals: [1, 2], tries: 1500 }
    ]
  },
  {
    number: 5, name: 'ORDER',
    note: 'Chapter of the wrong first move. Every board here has a block that cannot go anywhere until ' +
          'a different block has been dealt with first, and finding out which is the whole puzzle.',
    par: [14, 17],
    names: ['PRECEDENCE', 'QUEUE', 'INTERLOCK', 'DEADBOLT', 'SEQUENCE', 'TUMBLER', 'ESCAPEMENT',
            'RATCHET II', 'CASCADE', 'ORDER'],
    filters: { ways: [1, 2], luck: 0.005, maxDead: 0.25, opening: 2, nodeCap: 120000 },
    specs: [
      { w: 4, h: 4, walls: [3, 5], blocks: [3, 4], goals: [1, 2], tries: 1500 },
      { w: 4, h: 4, walls: [4, 6], blocks: [3, 4], goals: [1, 1], tries: 1500 }
    ]
  },
  {
    number: 6, name: 'TWENTY',
    note: 'Twenty cells. Long enough that the route stops being visible and has to be worked out one ' +
          'consequence at a time.',
    par: [16, 19],
    names: ['CONVEYOR', 'SWITCHBACK', 'TRESTLE', 'CATWALK', 'FUNNEL', 'AQUEDUCT', 'PORTAGE', 'SLUICE',
            'CAPSTAN', 'TWENTY'],
    filters: { ways: [1, 3], luck: 0.004, maxDead: 0.25, opening: 2, nodeCap: 150000 },
    specs: [
      { w: 5, h: 4, walls: [3, 5], blocks: [3, 4], goals: [1, 2], tries: 1200 },
      { w: 5, h: 4, walls: [4, 6], blocks: [3, 4], goals: [1, 1], tries: 1200 }
    ]
  },
  {
    number: 7, name: 'TRAFFIC',
    note: 'Four blocks sharing one exit. They are identical, so it does not matter which goes first — ' +
          'except that it does, because each one is the wall the next has to work around.',
    par: [18, 21],
    names: ['CONGESTION', 'BOTTLENECK', 'ROTARY', 'SIDING', 'MARSHAL', 'JUNCTION', 'TURNTABLE',
            'INTERCHANGE', 'GRIDLOCK', 'TRAFFIC'],
    filters: { ways: [1, 3], luck: 0.003, maxDead: 0.25, opening: 2, nodeCap: 180000 },
    specs: [
      { w: 5, h: 4, walls: [4, 6], blocks: [4, 4], goals: [1, 1], tries: 1000 },
      { w: 5, h: 5, walls: [4, 6], blocks: [3, 4], goals: [1, 2], tries: 1000 }
    ]
  },
  {
    number: 8, name: 'LATTICE',
    note: 'Twenty-five cells and about six walls. Almost the whole board is empty, and that is the ' +
          'trick: with nothing to stop them, blocks travel too far, and the walls you do have are the ' +
          'only brakes you own.',
    par: [20, 23],
    names: ['SCAFFOLD', 'FILIGREE', 'ARMATURE', 'BUTTRESS', 'CANTILEVER', 'TRUSS', 'PYLON', 'MULLION',
            'VAULT', 'LATTICE'],
    filters: { ways: [1, 3], luck: 0.002, maxDead: 0.25, opening: 3, nodeCap: 220000 },
    specs: [
      { w: 5, h: 5, walls: [4, 6], blocks: [3, 4], goals: [1, 2], tries: 900 },
      { w: 5, h: 5, walls: [5, 7], blocks: [4, 5], goals: [1, 1], tries: 900 }
    ]
  },
  {
    number: 9, name: 'DEPTH',
    note: 'Twenty-plus tilts on a board of a dozen things. Every stage in this chapter looks like it ' +
          'should take four moves, and none of them do.',
    par: [23, 25],
    names: ['PLUMB', 'FATHOM', 'SOUNDING', 'UNDERTOW', 'KEEL', 'BALLAST', 'TRENCH', 'ABYSSAL',
            'PRESSURE', 'DEPTH'],
    filters: { ways: [1, 3], luck: 0.002, maxDead: 0.25, opening: 3, nodeCap: 260000 },
    specs: [
      { w: 5, h: 5, walls: [5, 7], blocks: [4, 5], goals: [1, 2], tries: 900 },
      { w: 6, h: 5, walls: [5, 7], blocks: [3, 4], goals: [1, 1], tries: 900 }
    ]
  },
  {
    number: 10, name: 'TILT',
    note: 'Thirty cells, four blocks, one goal, and twenty-five moves. Nothing here that was not in ' +
          'stage one — the same gravity, the same walls, the same blocks. Only the folding is deeper.',
    par: [25, 28],
    names: ['CONFLUENCE', 'MERIDIAN', 'GYRE', 'LABYRINTH', 'CALIBRATE', 'ASCENDANT', 'TERMINUS',
            'ZENITH', 'SOLSTICE', 'TILT'],
    filters: { ways: [1, 3], luck: 0.002, maxDead: 0.25, opening: 3, nodeCap: 300000 },
    specs: [
      { w: 6, h: 5, walls: [5, 7], blocks: [3, 4], goals: [1, 2], tries: 800 },
      { w: 6, h: 5, walls: [6, 8], blocks: [4, 5], goals: [1, 1], tries: 800 }
    ]
  }
];

// ===========================================================================
// search
// ===========================================================================

/**
 * Fill one chapter's candidate pool. Runs inside a worker process.
 *
 * Each attempt picks its own target length from inside the band before it
 * starts climbing, which is what spreads the pool across the whole band instead
 * of piling every board up against the ceiling.
 */
function searchChapter(chapter, seedBase) {
  var pool = [];
  var seen = {};
  chapter.specs.forEach(function (spec, si) {
    var rng = new B.Rng(seedBase + chapter.number * 7919 + si * 104729);
    var filters = {};
    Object.keys(chapter.filters).forEach(function (k) { filters[k] = chapter.filters[k]; });
    filters.par = chapter.par;

    for (var t = 0; t < spec.tries; t++) {
      var target = rng.range(chapter.par);
      var rows = B.climb(spec, rng, target, 500, filters.nodeCap);
      if (!rows) continue;
      var key = B.canonical(rows);
      if (seen[key]) continue;
      seen[key] = 1;
      var res = B.evaluate(rows, filters, rng);
      if (!res) continue;
      pool.push({
        key: key, board: res.board,
        par: res.par, ways: res.ways, luck: res.luck, states: res.states, dead: res.dead,
        chain: res.chain, chainLast: res.chainLast, opening: res.opening,
        walls: res.walls, goals: res.goals, blocks: res.blocks, elements: res.elements,
        score: res.score
      });
    }
  });
  return pool;
}

/**
 * Choose ten boards that cover the chapter's band as evenly as possible,
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
  // primary axis; among boards of equal length the one with fewer elements
  // comes first, because that is the one whose idea is easiest to see.
  chosen.sort(function (a, b) {
    return a.par - b.par || a.elements - b.elements || b.score - a.score;
  });
  return chosen;
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

function wrapNote(note, ip) {
  if (note.length <= 92) return ip + 'note: ' + q(note) + ',';
  // Wrap long notes so the data file stays readable at 100 columns.
  var words = note.split(' '), line = '', lines = [];
  words.forEach(function (w) {
    if ((line + ' ' + w).length > 88) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  });
  if (line) lines.push(line);
  // Every line but the last keeps a trailing space, or concatenation would glue
  // the last word of one line to the first word of the next.
  return ip + 'note: ' + lines.map(function (l, li) {
    return q(li < lines.length - 1 ? l + ' ' : l);
  }).join(' +\n' + ip + '      ') + ',';
}

function emitStage(st, indent) {
  var pad = new Array(indent + 1).join(' ');
  var inner = indent + 2;
  var ip = new Array(inner + 1).join(' ');
  var out = [];
  out.push(pad + '{');

  var head = ip + 'id: ' + st.id + ', name: ' + q(st.name) + ', par: ' + st.par + ',';
  if (st._m) {
    // Record why this board qualified, so the data file explains itself: how
    // many optimal lines exist, how unlikely a random clear is, how much room
    // there is to think, and how long the set-up runs before anything scores.
    var m = st._m;
    head += '   // ways ' + m.ways +
      ' · luck ' + (m.luck * 100).toFixed(2) + '%' +
      ' · ' + m.states + ' states' +
      ' · ' + m.elements + ' pieces' +
      (m.opening > 0 ? ' · ' + m.opening + ' set-up tilts' : '') +
      (m.chain > 1 ? ' · chain ×' + m.chain : '');
  }
  out.push(head);
  if (st.note) out.push(wrapNote(st.note, ip));
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
  L.push(' * Every `par` below is a breadth-first-proven shortest solution, and every wall, block');
  L.push(' * and goal survived deletion testing: remove any one of them and the puzzle measurably');
  L.push(' * changes. Verified by tools/audit.js.');
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

  if (!need.length) { finish(cache); return; }

  console.log('searching chapters ' + need.join(', ') + ' across ' + WORKERS + ' workers…\n');
  var buckets = [];
  for (var i = 0; i < WORKERS; i++) buckets.push([]);
  // Deal the heaviest chapters out first so no single worker ends up with all
  // of them and holds up the build on its own.
  need.slice().sort(function (a, b) { return b - a; })
    .forEach(function (n, i) { buckets[i % WORKERS].push(n); });
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
        console.log('  chapter ' + String(p.chapter).padStart(2) + ' ' + ch.name.padEnd(12) +
          String(p.found).padStart(5) + ' boards kept (best per solution length)   ' +
          (p.ms / 1000).toFixed(1) + 's');
      }
      if (m.done) {
        m.done.forEach(function (n) {
          cache[n] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, n + '.json'), 'utf8'));
        });
        if (--pending === 0) {
          console.log('\nsearch finished in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
          finish(cache);
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

/** Solver-proven par for a hand-authored board — never a number I typed in. */
function measureAuthored(stage) {
  var st = E.compile({ board: stage.board });
  var m = B.measure(st, 80000);
  if (!m) throw new Error('authored stage ' + stage.name + ' is unsolvable');
  var inert = B.findInert(stage.board, m.par, m.ways, 80000);
  if (inert) throw new Error('authored stage ' + stage.name + ' has an inert ' + inert);
  var shape = B.shapeOf(st, E.solve(st, null, 80000).path);
  return {
    par: m.par, ways: m.ways, luck: m.luck, states: m.states,
    chain: shape.chain, opening: shape.opening,
    elements: B.cellsOf(stage.board, B.WALL).length +
              B.cellsOf(stage.board, B.GOAL).length +
              B.cellsOf(stage.board, B.BLOCK).length
  };
}

function finish(cache) {
  var used = {};
  var chapters = [];
  var failed = [];

  AUTHORED.forEach(function (c) {
    var stages = c.stages.map(function (s) {
      var m = measureAuthored(s);
      used[B.canonical(s.board)] = 1;
      return {
        name: s.name, note: s.note, hint: s.hint, board: s.board,
        par: m.par, _m: m
      };
    });
    var pars = stages.map(function (s) { return s.par; });
    chapters.push({
      number: c.number, name: c.name, note: c.note, stages: stages,
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
      return { name: c.names[i], par: p.par, board: p.board, _m: p };
    });
    var pars = stages.map(function (s) { return s.par; });
    chapters.push({
      number: c.number, name: c.name, note: c.note, stages: stages,
      parLo: Math.min.apply(null, pars), parHi: Math.max.apply(null, pars)
    });
  });

  if (failed.length) {
    console.error('\ncould not fill: ' + failed.join('; '));
    console.error('raise `tries` for those chapters or widen their par band, then re-run with --fresh --only <n>');
    process.exit(1);
  }

  // Number the stages 1..100 in chapter order.
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
    console.log('  ' + String(c.number).padStart(2) + '  ' + c.name.padEnd(9) +
      'stages ' + String(c.from).padStart(3) + '–' + String(c.to).padStart(3) +
      '   par ' + pars.join(' '));
  });
  console.log('');
}
