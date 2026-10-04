'use strict';
/*
 * Choose the large-floe band from the measured pools and build src/stages-large.js.
 *
 *   node tools/large-campaign.js                    # pools in tools/large-pool -> selection + stages
 *   node tools/large-campaign.js --from-selection   # rebuild src/stages-large.js from tools/large-selection.json
 *
 * The same rules as tools/floe-campaign.js: boards are ordered by how hard a
 * simulated player finds them (the explorer's swipes, not the par), four in
 * five are MUTUAL, a shape or piece layout is never used twice, and the climb
 * is geometric. The band starts where the main campaign's hardest board ends.
 * Every chosen board is re-solved on src/engine.js and checked for fairness
 * over its whole reachable graph before it is written.
 */
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var E = require('../src/engine.js');
var F = require('./lib/floe.js');
var S = require('./floe-search.js');
var K = require('./lib/rect-keys.js');
var base = require('../src/stages.js');

var ROOT = path.resolve(__dirname, '..');
var args = process.argv.slice(2);
function arg(name, def) { var i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }
var POOL_DIR = arg('pool-dir', path.join(__dirname, 'large-pool'));
var SELECTION = path.join(__dirname, 'large-selection.json');
var COUNT = +arg('count', 60), ROUGH_PER = +arg('rough-per', 10), ROUGH_RUNS = +arg('rough-runs', 12);
var FINAL_RUNS = +arg('runs', 200), BAND_KEEP = +arg('band-keep', 40), MAX_PAR = +arg('max-par', 45);
var FIRST_ID = base.STAGES[base.STAGES.length - 1].id + 1;
var FIRST_CHAPTER = base.CHAPTERS[base.CHAPTERS.length - 1].number + 1;

var NAMES = ('ICEBOUND SKERRY FELL ESKER OXBOW KETTLE DRUMLIN TARN COL ARETE SASTRUGI NEVE FIRN TALUS SCREE PINGO FJELD ' +
  'LEEWARD WINDWARD PERIGEE KELVIN ARCTIC ALPINE TAIGA STEPPE MESA BUTTE GORGE RAVINE CIRRUS HALO SWELL DEW FOG SNOWFALL ' +
  'DRIZZLE VERGLAS SLUSH BRASH FLURRY SHEEN HOARFROST ICICLE GLAZE SEAM SPLINTER WEDGE GAP SPLIT LEAD POLYNYA CHIP RIFT ' +
  'FRACTURE CLEAVE TREMOR QUAKE GROWLER BERGY RUPTURE LULL ECHO VIGIL NADIR UMBRA WANE DUSK FACET CRYSTAL GLACIER ' +
  'PERMAFROST TUNDRA DRIFT NUNATAK FIRNLINE ICECAP SNOWLINE POLE').split(' ');
var CHAPTER_DEF = [['WIDE FLOE', 'ひろい氷'], ['ARCHIPELAGO', '群島'], ['LABYRINTH', '迷路'],
  ['LONG NIGHT', '長い夜'], ['DEEP FREEZE', '氷結'], ['THE POLE', '極点']];
var HINTS = {
  hole: { ja: '穴のふちでも止まれます。水には落ちません。', en: 'A hole stops you just like the outer edge. Nobody falls in.' },
  brakeHome: { ja: 'もう一羽をオーロラの先に置くと、その上で止まれます。', en: 'Park the other penguin just past an aurora to stop on it.' },
  mutual: { ja: 'おたがいに一度ずつ、相手の足場になります。', en: 'Each penguin has to stop the other at least once.' },
  tempt: { ja: '回収できても、すぐに入れるとは限りません。相手の足場が残っているか確かめよう。', en: 'Being able to collect is not a reason to. Check the partner still has a brake.' },
  away: { ja: '一度オーロラから遠ざかると、別の止まり方が見えてきます。', en: 'Moving away from an aurora can reveal a new place to stop.' },
  help: { ja: 'もう一羽が止まるための足場になります。', en: 'The other penguin can be the brake you need.' }
};

function balance(board) {
  var sx = 0, sy = 0, n = 0, w = board[0].length, h = board.length;
  board.forEach(function (r, y) { for (var x = 0; x < w; x++) if (r[x] !== '#') { sx += x; sy += y; n++; } });
  return Math.hypot(sx / n - (w - 1) / 2, sy / n - (h - 1) / 2);
}
function goalsTouch(board) {
  var flat = board.join(''), w = board[0].length, a = flat.indexOf('a'), b = flat.indexOf('b');
  return Math.abs(a % w - b % w) + Math.abs(((a / w) | 0) - ((b / w) | 0)) === 1;
}
/*
 * Difficulty is the explorer's cost where the explorer can finish: log2 of its
 * geometric-mean swipes, as in the main campaign. Past par ~14 it cannot (on
 * 4x4 and up, every board with par 15+ ran into a 3,000-swipe ceiling), so a
 * board the explorer fails on is ranked by that ceiling, which grows with par,
 * and sits above every board it can solve. Short boards the explorer solves
 * keep the main campaign's meaning; long ones are ordered by length.
 */
function measureAgain(c, runs, cap) {
  var p = F.parseRows(c.board), g = p.floe.graph(p.gA, p.gB), start = p.a * g.B + p.b;
  var m = S.measure(g, start, { runs: runs, cap: cap });
  ['explorerGeo', 'explorerMedian', 'explorer', 'quick', 'capped'].forEach(function (k) { c[k] = m[k]; });
  c.runs = runs; c.cap = cap;
  c.hard = c.capped > runs * 0.5;
  c.difficulty = c.hard ? Math.log2(cap) + c.par * 0.01 : Math.log2(c.explorerGeo);
  return c;
}

// The one fairness check that matters, on the real engine: no ordinary move
// (collecting nobody) may take a solvable position to an unsolvable one.
function engineCheck(c, id) {
  var st = E.compile({ id: id, board: c.board });
  var r = E.solve(st, null, 400000);
  assert(r.solvable && r.moves === c.par, 'stage ' + id + ': engine par ' + r.moves + ' vs ' + c.par);
  assert(!st.rules.hazard, 'stage ' + id + ' has cracked ice');
  var g = E.graph(st, 200000);
  assert(g, 'graph too large');
  var rev = g.states.map(function () { return []; });
  for (var s = 0; s < g.n; s++) for (var k = 0; k < 4; k++) if (g.next[s][k] !== s) rev[g.next[s][k]].push(s);
  var ok = new Uint8Array(g.n), q = [];
  for (s = 0; s < g.n; s++) if (g.clear[s]) { ok[s] = 1; q.push(s); }
  for (var h = 0; h < q.length; h++) rev[q[h]].forEach(function (p) { if (!ok[p] && !g.broken[p]) { ok[p] = 1; q.push(p); } });
  for (s = 0; s < g.n; s++) {
    if (!ok[s] || g.clear[s]) continue;
    for (k = 0; k < 4; k++) {
      var j = g.next[s][k];
      if (j === s || g.broken[j] || ok[j]) continue;
      assert(g.states[j].collected !== g.states[s].collected, 'stage ' + id + ' has an ordinary-move trap');
    }
  }
}

function select() {
  var files = fs.readdirSync(POOL_DIR).filter(function (f) { return /\.json$/.test(f); });
  var best = new Map(), total = 0, scale = { layouts: 0, workerMinutes: 0 };
  files.forEach(function (f) {
    var d = JSON.parse(fs.readFileSync(path.join(POOL_DIR, f), 'utf8'));
    scale.layouts += d.stats.layouts; scale.workerMinutes += d.minutes;
    d.candidates.forEach(function (c) {
      total++; var o = best.get(c.canon); if (!o || c.quality > o.quality) best.set(c.canon, c);
    });
  });
  var baseKeys = new Set(base.STAGES.map(function (s) { return K.canonical(s.board); }));
  var pool = [...best.values()].filter(function (c) { return !baseKeys.has(c.canon) && c.par <= MAX_PAR; });
  console.log('pool: ' + files.length + ' files, ' + total + ' entries, ' + pool.length + ' distinct');

  // Rough difficulty on the best few of each tray and shortest solution.
  // Boards whose auroras touch outrank the rest on quality, so each kind gets its own slots.
  var groups = new Map();
  pool.forEach(function (c) {
    c.touch = goalsTouch(c.board);
    var k = c.size + '|' + c.par + '|' + (c.touch ? 'T' : 'N'); (groups.get(k) || groups.set(k, []).get(k)).push(c);
  });
  var rough = [];
  groups.forEach(function (list) {
    list.sort(function (a, b) { return b.quality - a.quality; });
    list.slice(0, ROUGH_PER).forEach(function (c) { rough.push(c); });
  });
  console.log('rough explorer (' + ROUGH_RUNS + ' runs) on ' + rough.length + ' boards');
  rough.forEach(function (c) { measureAgain(c, ROUGH_RUNS, Math.max(1500, c.par * 60)); c.shape = K.canonical(c.board, 'room'); c.pieces = K.canonical(c.board, 'ice'); });

  var bands = {};
  rough.forEach(function (c) { var k = Math.floor(c.difficulty * 4) + (c.touch ? 'T' : 'N'); (bands[k] = bands[k] || []).push(c); });
  var shortlist = [];
  Object.keys(bands).forEach(function (k) {
    var seen = new Set();
    bands[k].sort(function (a, b) { return b.quality - a.quality; }).forEach(function (c) {
      if (seen.size >= BAND_KEEP || seen.has(c.shape)) return;
      seen.add(c.shape); shortlist.push(c);
    });
  });
  console.log('re-measuring ' + shortlist.length + ' shortlisted boards with ' + FINAL_RUNS + ' runs');
  shortlist.forEach(function (c) { if (!c.hard) measureAgain(c, FINAL_RUNS, Math.max(3000, c.par * 100)); });

  var sorted = shortlist.slice().sort(function (x, y) { return x.difficulty - y.difficulty; });
  var lastBase = require('./floe-selection.json').stages.slice(-1)[0].difficulty;
  var lo = +arg('lo', Math.max(lastBase - 0.3, sorted[0].difficulty));
  var hi = +arg('hi', sorted[Math.max(0, sorted.length - 5)].difficulty);
  console.log('difficulty ' + sorted[0].difficulty.toFixed(2) + '..' + sorted[sorted.length - 1].difficulty.toFixed(2) +
    ' (' + shortlist.filter(function (c) { return c.hard; }).length + ' of ' + shortlist.length + ' beyond the explorer); band ' + lo.toFixed(2) + '..' + hi.toFixed(2) + '; main campaign ends at ' + lastBase.toFixed(2));

  console.log('shortlist: ' + sorted.length + ' boards, ' + new Set(sorted.map(function (c) { return c.shape; })).size + ' room shapes, ' + new Set(sorted.map(function (c) { return c.pieces; })).size + ' piece layouts, ' + sorted.filter(function (c) { return c.touch; }).length + ' with touching auroras');
  var chosen = [], used = new Set(), piecesUsed = new Set(), routes = new Set(), touches = 0;
  for (var i = 0; i < COUNT; i++) {
    var target = lo + (hi - lo) * i / (COUNT - 1), wantMutual = i % 5 !== 4, touchRoom = touches < 2 + 0.35 * i;
    var pick = null, pickScore = -Infinity;
    for (var width = 0.2; !pick && width < 4; width += 0.2) {
      sorted.forEach(function (c) {
        if (used.has(c.shape) || piecesUsed.has(c.pieces) || Math.abs(c.difficulty - target) > width) return;
        if (c.touch && !touchRoom) return;
        var sc = c.quality - Math.abs(c.difficulty - target) * 2;
        if (wantMutual && c.kind !== 'MUTUAL') sc -= 3;
        if (!wantMutual && c.kind === 'MUTUAL') sc -= 2.5;
        if (routes.has(c.route)) sc -= 1;
        if (sc > pickScore) { pickScore = sc; pick = c; }
      });
    }
    assert(pick, 'nothing left near difficulty ' + target.toFixed(2));
    chosen.push(pick); used.add(pick.shape); piecesUsed.add(pick.pieces); routes.add(pick.route);
    if (pick.touch) touches++;
  }
  chosen.sort(function (x, y) { return x.difficulty - y.difficulty; });
  chosen.forEach(function (c, i) { engineCheck(c, FIRST_ID + i); });
  var keep = ['board', 'size', 'kind', 'par', 'route', 'ways', 'difficulty', 'explorerGeo', 'explorerMedian', 'quick', 'minBrakes',
    'hard', 'needBrakeHome', 'needAB', 'needBA', 'tempt', 'away', 'tail', 'maxForced', 'choice', 'reach', 'traps', 'cells', 'usedCells', 'balance', 'quality'];
  var out = {
    version: 'large-2026-10',
    source: { pools: files.length, layouts: scale.layouts, workerMinutes: scale.workerMinutes, entries: total, distinct: pool.length, rough: rough.length, shortlist: shortlist.length, finalRuns: FINAL_RUNS, band: [lo, hi] },
    stages: chosen.map(function (c) {
      var o = {}; keep.forEach(function (k) { if (c[k] !== undefined) o[k] = typeof c[k] === 'number' ? +c[k].toFixed(3) : c[k]; }); return o;
    })
  };
  fs.writeFileSync(SELECTION, JSON.stringify(out, null, 1) + '\n');
  return out;
}

function hintFor(c, i) {
  if (c.tempt >= 1 && i % 3 === 1) return HINTS.tempt;
  if (c.kind === 'MUTUAL' && i % 3 !== 2) return HINTS.mutual;
  if (c.needBrakeHome) return HINTS.brakeHome;
  if (c.away >= 2) return HINTS.away;
  return HINTS.help;
}
function ideaFor(c) {
  var bits = [c.kind === 'MUTUAL' ? 'Each penguin must stop the other at least once' : 'One penguin must stop the other'];
  if (c.needBrakeHome) bits.push('a penguin can only be collected by being braked onto its aurora');
  if (c.tempt) bits.push(c.tempt + ' fatal early collection' + (c.tempt > 1 ? 's' : '') + ' on the shortest routes');
  return bits.join('; ') + '.';
}

function writeReport(data, stages, chapters, chosen, sizes) {
  var src = data.source || {}, touching = chosen.filter(function (c) { return goalsTouch(c.board); }).length;
  var beyond = chosen.filter(function (c) { return c.hard; }).length;
  var md = '# The large-floe band (stages ' + stages[0].id + '–' + stages[stages.length - 1].id + ')\n\n';
  md += stages.length + ' boards on floes from 4×4 up to 6×6, two penguins, no cracked ice, picked by the main campaign\'s own rules. Shortest solutions run **' +
    Math.min.apply(null, chosen.map(function (c) { return c.par; })) + ' to ' + Math.max.apply(null, chosen.map(function (c) { return c.par; })) + ' moves**.\n\n';
  md += '## What a board has to be\n\n- One edge-connected floe spanning the board, centre of mass within half a cell of the centre. Open water is the old wall: the engine\'s rules are unchanged.\n' +
    '- Fair: an ordinary move (one that collects nobody) never strands the pair; collecting a brake too early is the only irreversible mistake.\n' +
    '- A partner must be used as a brake. At most two forced moves in a row, two lone clean-up moves and three fatal "collect now" temptations on the shortest routes; the solution uses at least 60% of the ice.\n' +
    '- Mutual boards (each penguin has to stop the other at least once) first. A shape or piece layout is never used twice, and boards with touching auroras are rationed, as in the main campaign (' + touching + ' of ' + stages.length + ').\n' +
    '- Re-solved on `src/engine.js`: the shortest solution equals the stated par, and no ordinary move strands the pair anywhere in the reachable graph.\n\n';
  md += '## Order\n\nAs in the main campaign, by how hard a simulated player finds a board. The explorer finishes the short boards (par up to ' + Math.max.apply(null, chosen.filter(function (c) { return !c.hard; }).map(function (c) { return c.par; })) + ' here) and its swipes set their place. On the longer boards it mostly does not finish — in a sample of 40 mutual boards per tray, 39 or 40 with par 15–24 ran into a 3,000-swipe ceiling, and some boards as short as par ' + Math.min.apply(null, chosen.filter(function (c) { return c.hard; }).map(function (c) { return c.par; })) + ' here defeat it — so ' +
    beyond + ' of the ' + stages.length + ' boards are ordered by that ceiling, which grows with par, and sit after every board the explorer can solve, with a few short boards the explorer finds very hard placed among them. Par is capped at 45.\n\n';
  md += '## Search\n\n' + (src.layouts ? (src.layouts / 1e6).toFixed(0) + ' million layouts' : 'Layouts') + ' sampled by local search (move a piece of water or an aurora, keep what scores better)' +
    (src.workerMinutes ? ' over ' + src.workerMinutes + ' worker-minutes' : '') + '; ' + (src.distinct || '?') + ' distinct candidate boards; the explorer measured the best of each tray and par; the final climb is geometric between the difficulty where the main campaign ends and the hardest boards found. These are search results, not proofs of a maximum.\n\n';
  md += '## Honest limits\n\n- Nobody has played these. Order comes from the engine and a simulated player, which is crude: it sees a finish two swipes away and nothing else.\n- Not tried on a real phone or GPU.\n\n';
  md += '## Chapters\n\n| # | name | stages | note |\n|---|---|---|---|\n';
  chapters.forEach(function (c) { md += '| ' + c.number + ' | ' + c.name + ' | ' + c.from + '–' + c.to + ' | ' + c.note + ' |\n'; });
  md += '\n## Boards\n\n`#` open water, `A`/`B` penguins, `a`/`b` their auroras.\n\n';
  stages.forEach(function (st, i) {
    var c = chosen[i];
    md += '### ' + st.id + ' ' + st.name + ' · ' + c.size + ' · par ' + c.par + (c.kind === 'MUTUAL' ? ' · mutual' : '') + '\n\n```\n' + st.board.join('\n') + '\n```\n\n' +
      'Solution `' + c.route + '` · explorer ' + (c.hard ? 'cannot finish' : Math.round(c.explorerGeo) + ' swipes') + '\n\n';
  });
  fs.writeFileSync(path.join(ROOT, 'docs', 'LARGE-CAMPAIGN.md'), md);
}

function build(data) {
  var chosen = data.stages;
  assert.strictEqual(chosen.length, COUNT);
  var used = {}; base.STAGES.forEach(function (s) { used[s.name] = true; });
  var names = NAMES.filter(function (n) { return !used[n]; });
  assert(names.length >= COUNT, 'not enough unused stage names');
  var stages = chosen.map(function (c, i) {
    engineCheck(c, FIRST_ID + i);
    return { id: FIRST_ID + i, name: names[i], par: c.par, idea: ideaFor(c), hint: hintFor(c, i), board: c.board };
  });
  var per = Math.ceil(COUNT / CHAPTER_DEF.length);
  var chapters = CHAPTER_DEF.map(function (def, k) {
    var slice = chosen.slice(k * per, k * per + per), sz = {}, lo = 99, hi = 0;
    slice.forEach(function (c) { sz[c.size] = 1; lo = Math.min(lo, c.par); hi = Math.max(hi, c.par); });
    var from = FIRST_ID + k * per;
    return { number: FIRST_CHAPTER + k, name: def[0], ja: def[1], from: from, to: from + slice.length - 1,
      note: 'Larger floes, ' + Object.keys(sz).sort().join(' · ') + '. Par ' + lo + '–' + hi + '.' };
  });
  var js = "'use strict';\n// Generated by tools/large-campaign.js from tools/large-selection.json. Do not edit.\n" +
    '// Extends TiltStages (loaded first) with the large-floe band: stages ' + stages[0].id + '-' + stages[stages.length - 1].id +
    ', chapters ' + chapters[0].number + '-' + chapters[chapters.length - 1].number + '.\n' +
    '(function (root) {\n  var base = root.TiltStages;\n' +
    "  if (!base) throw new Error('stages-large.js must be loaded after stages.js');\n" +
    '  var CHAPTERS = ' + JSON.stringify(chapters, null, 2).replace(/\n/g, '\n  ') + ';\n' +
    '  var STAGES = ' + JSON.stringify(stages, null, 2).replace(/\n/g, '\n  ') + ';\n' +
    '  if (!base.STAGES.some(function (s) { return s.id === STAGES[0].id; })) {\n' +
    '    base.STAGES.push.apply(base.STAGES, STAGES);\n' +
    '    (base.CHAPTERS = base.CHAPTERS || []).push.apply(base.CHAPTERS, CHAPTERS);\n  }\n' +
    '  root.TiltLargeStages = { STAGES: STAGES, CHAPTERS: CHAPTERS };\n' +
    "})(typeof globalThis !== 'undefined' ? globalThis : this);\n";
  fs.writeFileSync(path.join(ROOT, 'src', 'stages-large.js'), js);
  var kinds = {}, sizes = {};
  chosen.forEach(function (c) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; sizes[c.size] = (sizes[c.size] || 0) + 1; });
  writeReport(data, stages, chapters, chosen, sizes);
  console.log(JSON.stringify({ count: stages.length, kinds: kinds, sizes: sizes,
    par: [Math.min.apply(null, chosen.map(function (c) { return c.par; })), Math.max.apply(null, chosen.map(function (c) { return c.par; }))],
    explorer: [chosen[0].explorerGeo, chosen[chosen.length - 1].explorerGeo] }));
}

if (require.main === module) build(args.indexOf('--from-selection') >= 0 ? JSON.parse(fs.readFileSync(SELECTION, 'utf8')) : select());
