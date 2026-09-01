'use strict';
/*
 * TILT — the good-board search.
 *
 *   node tools/fun-search.js                      the standard pass
 *   node tools/fun-search.js --size 4             the small tray only
 *   node tools/fun-search.js --category AHA       one kind of board
 *   node tools/fun-search.js --min-par 5 --keep 30
 *   node tools/fun-search.js --quick              a two-second smoke run
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DIFFERENT ABOUT THIS SEARCH
 * ---------------------------------------------------------------------------
 *
 * tools/level-search.js measures how LONG every board is and keeps the emptiest
 * few at each length. That is the right tool for laying a hundred stages along
 * a straight line, and the wrong one for finding a board worth playing: a
 * fifty-move board can be fifty moves of one idea, and an eight-move board can
 * be the best thing on the ice.
 *
 * This tool keeps the same measurement — the same enumeration, the same
 * backward BFS, the same exact pars, imported from that file rather than
 * rewritten — and changes what happens next. Every board that survives is
 * analysed for what it ASKS (tools/lib/level-analysis.js), given a kind and a
 * difficulty (tools/lib/fun-score.js), and filed in a bucket of its own kind,
 * its own difficulty and its own tray. Nothing is kept for being long.
 *
 * The output, tools/fun-level-index.json, is a shortlist for a person to play,
 * not a campaign. tools/fun-browser.html is where it gets played, and what
 * comes out of THAT is the thing worth trusting.
 *
 * ---------------------------------------------------------------------------
 * NO DRIFTERS, NO CRACKED ICE
 * ---------------------------------------------------------------------------
 *
 * The main pool is two penguins, some walls and nothing else. Both extra
 * pieces make a board harder to hold in your head rather than harder to see
 * into — a drifter is a fourth object to track, cracked ice is a rule to
 * remember — and TILT's depth is supposed to come from gravity meeting itself.
 * The engine still supports both, `--drifters` and `--hazards` still search
 * them, and neither is in a default pass.
 *
 * ---------------------------------------------------------------------------
 * PHASES
 * ---------------------------------------------------------------------------
 *
 * Boards outnumber the time available by four orders of magnitude, so nothing
 * expensive ever runs on a board a cheap test could have refused:
 *
 *   A  free.    Par, tray, wall budget, drifters — decided from the numbers the
 *               enumerator already has, before a board is even built.
 *   B  0.1 ms.  One position graph and one backward BFS: dead ends, forced
 *               moves, branching, whether the opening is a coin flip with three
 *               fatal sides. Exact, and enough to throw most boards away.
 *   C  0.5 ms.  The full analysis — every move replayed, every wall tested by
 *               removing it — and only then a category and a bucket.
 */

var fs = require('fs');
var path = require('path');

var E = require('../src/engine.js');
var LS = require('./level-search.js');
var A = require('./lib/level-analysis.js');
var SCORE = require('./lib/fun-score.js');
var K = require('./lib/board-keys.js');

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------
var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf('--' + name);
  return i < 0 ? dflt : argv[i + 1];
}
function flag(name) { return argv.indexOf('--' + name) >= 0; }
function num(name, dflt) { var v = arg(name, null); return v === null ? dflt : Number(v); }

var QUICK = flag('quick');

/* tools/level-search.js keeps one bit per cell in a 32-bit occupancy mask, so a
   tray of side 6 (thirty-six cells) would silently mis-encode. Five is the
   ceiling until that mask changes. */
var MAX_TRAY = 5;

var OPT = {
  sizes: (function () {
    /* The main pool is 4×4 and 5×5 and that is a design decision, not a limit
       of the code — so `all` means those two, and asking for another tray gets
       it rather than getting silence. Three is real: it is where a tutorial
       board would come from. Six is refused with a reason, because the
       enumerator packs a cell index into a 32-bit occupancy mask and a 6×6 has
       thirty-six cells; that is a fact about tools/level-search.js, not a
       preference, and a run that quietly measured nothing would hide it. */
    var v = arg('size', 'all');
    if (v === 'all') return [4, 5];
    var list = String(v).split(',').map(Number);
    var bad = list.filter(function (n) { return !(n >= 3 && n <= MAX_TRAY); });
    if (bad.length) {
      console.error('cannot search a ' + bad[0] + 'x' + bad[0] + ' tray — the enumerator ' +
        'handles 3 to ' + MAX_TRAY + ' (the main pool is 4 and 5)');
      process.exit(1);
    }
    return list;
  })(),
  minPar: num('min-par', QUICK ? 4 : 3),
  maxPar: num('max-par', 0),
  keep: num('keep', QUICK ? 4 : 20),
  limit: num('limit', QUICK ? 60 : 1500),
  statics4: num('statics4', QUICK ? 1 : 3),
  statics5: num('statics5', QUICK ? 1 : 2),
  penguins: num('penguins', 0),                 // 0 = both 1 and 2
  drifters: flag('drifters'),
  hazards: flag('hazards'),
  enumerate: !flag('no-enumerate'),
  fromIndex: arg('from-index', QUICK ? '' : path.join(__dirname, 'level-index.json')),
  out: arg('out', path.join(__dirname, 'fun-level-index.json')),
  category: arg('category', null),
  band: arg('difficulty', null),
  budget: num('budget', QUICK ? 2000 : 0),      // phase C cap per corner, 0 = none
  allowCruel: flag('allow-cruel'),
  maxWalls: num('max-walls', 4),
  why: flag('why'),
  campaign: !flag('no-campaign-check')
};

if (flag('help') || flag('h')) {
  console.log([
    'node tools/fun-search.js [options]',
    '',
    '  --size N[,N]|all      which tray: 3, 4 or 5 (default all = the 4 and 5 main pool)',
    '  --min-par N           shortest board to consider (default 3)',
    '  --max-par N           longest board to consider (default no cap)',
    '  --keep N              candidates per category/difficulty/size bucket (default 20)',
    '  --limit N             total candidates written (default 1500)',
    '  --category NAME       only this kind of board (' + SCORE.CATEGORIES.join(', ') + ')',
    '  --difficulty BAND     only this band (' + SCORE.BANDS.join(', ') + ')',
    '  --statics4 N          wall budget for the 4x4 enumeration (default 3)',
    '  --statics5 N          wall budget for the 5x5 enumeration (default 2)',
    '  --max-walls N         reject boards with more immovable blocks (default 4)',
    '  --penguins 1|2        only boards with this many penguins',
    '  --drifters            allow grey drifters (off: they are not main-pool material)',
    '  --hazards             allow cracked ice (off, same reason)',
    '  --from-index FILE     also analyse an existing level index ("" to skip)',
    '  --no-enumerate        do not run a fresh enumeration',
    '  --no-campaign-check   skip the overlap test against src/stages.js',
    '  --allow-cruel         keep boards whose opening is three-quarters fatal',
    '  --budget N            analyse at most N boards per corner (truncates the sweep)',
    '  --out FILE            default tools/fun-level-index.json',
    '  --quick               a tiny run, for smoke tests',
    '  --why                 report what each phase threw away'
  ].join('\n'));
  process.exit(0);
}

if (OPT.category && SCORE.CATEGORIES.indexOf(OPT.category) < 0) {
  console.error('unknown category "' + OPT.category + '" — one of ' + SCORE.CATEGORIES.join(', '));
  process.exit(1);
}
if (OPT.band && SCORE.BANDS.indexOf(OPT.band) < 0) {
  console.error('unknown difficulty "' + OPT.band + '" — one of ' + SCORE.BANDS.join(', '));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// stable ids
// ---------------------------------------------------------------------------
/* A candidate's id is a hash of its canonical board — the same board gets the
   same id whichever pass found it, whichever way up it was enumerated and
   whichever colour was called A. That is what lets the browser keep a review
   across a re-run with different settings: the shortlist changes, the verdicts
   already recorded do not.
 *
 * There is no randomness anywhere in this tool and no seed to set. The
 * enumeration is a sweep, the analysis is deterministic, the output is sorted
 * and nothing is timestamped, so the same command twice produces the same file
 * byte for byte. */
function hash32(str) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function shortId(canon) { return hash32(canon).toString(36); }

// ---------------------------------------------------------------------------
// the buckets
// ---------------------------------------------------------------------------
/*
 * category × difficulty × tray, and a cap per bucket.
 *
 * Keeping the N best boards overall would come back with N boards of one kind,
 * because whatever the score likes most it likes many times. Keeping the N best
 * of every KIND is what makes the shortlist worth browsing, and it is also the
 * only arrangement in which a four-move ELEGANT board and a twenty-move MASTER
 * board are both allowed to exist.
 *
 * Inside a bucket, two more caps stop one idea taking the whole shelf: at most
 * two boards may share a solution fingerprint (the same trick twice) and at
 * most two may share a skeleton (the same room twice).
 */
var FINGERPRINT_CAP = 2;
var SKELETON_CAP = 2;

var buckets = new Map();
var records = new Map();                        // canonicalId -> record

function bucketKey(cat, band, size) { return cat + '/' + band + '/' + size + 'x' + size; }

/**
 * "If two boards look about as promising, take the smaller, plainer one."
 *
 * The word doing the work is ABOUT. `funPotential` is an estimate carried to
 * three decimals, and comparing it exactly means two boards are only ever
 * judged on size and simplicity when their estimates collide to the last digit
 * — which is to say almost never, so the rule would read well and never fire.
 * Rounding to a band first is what makes it a real preference: inside a band
 * the estimate has nothing left to say, and the ladder below decides instead.
 *
 * The ladder is the design brief's order, unchanged: smaller tray, fewer
 * pieces, fewer idle walls, stronger aha, stronger interaction, more real
 * choices, and a shorter answer. Everything above the aha rung is a fact about
 * the board rather than an opinion about it. Ties end on the canonical id, so
 * two runs of one command cannot disagree.
 */
var FUN_BAND = 0.02;
function funBand(r) { return Math.round(r.funPotential / FUN_BAND); }

function better(a, b) {
  var band = funBand(b) - funBand(a);
  if (band) return band;
  if (a.boardSize !== b.boardSize) return a.boardSize - b.boardSize;
  if (a.elementCount !== b.elementCount) return a.elementCount - b.elementCount;
  if (a.redundantWallCount !== b.redundantWallCount) {
    return a.redundantWallCount - b.redundantWallCount;
  }
  var A = a.analysis, B = b.analysis;
  if (A.ahaPotential !== B.ahaPotential) return B.ahaPotential - A.ahaPotential;
  if (A.interactionScore !== B.interactionScore) return B.interactionScore - A.interactionScore;
  if (A.choiceScore !== B.choiceScore) return B.choiceScore - A.choiceScore;
  if (a.par !== b.par) return a.par - b.par;
  return a.canonicalId < b.canonicalId ? -1 : (a.canonicalId > b.canonicalId ? 1 : 0);
}

function countIn(list, field, value, skip) {
  var n = 0;
  for (var i = 0; i < list.length; i++) {
    if (skip.indexOf(i) >= 0) continue;
    if (list[i][field] === value) n++;
  }
  return n;
}
function worstIndexWith(list, field, value, skip) {
  var at = -1;
  for (var i = 0; i < list.length; i++) {
    if (skip.indexOf(i) >= 0 || list[i][field] !== value) continue;
    if (at < 0 || better(list[at], list[i]) < 0) at = i;
  }
  return at;
}

function offer(key, rec) {
  var list = buckets.get(key);
  if (!list) { list = []; buckets.set(key, list); }

  /* Decide everything before touching the list. A cap that evicts on behalf of
     a candidate the NEXT cap then refuses has thrown a board away for nothing,
     and the bucket ends the run one board short with no record of why. */
  var evict = [];
  var caps = [
    { field: 'solutionFingerprint', value: rec.solutionFingerprint, cap: FINGERPRINT_CAP },
    { field: 'skeletonId', value: rec.skeletonId, cap: SKELETON_CAP }
  ];
  for (var c = 0; c < caps.length; c++) {
    var cap = caps[c];
    if (countIn(list, cap.field, cap.value, evict) < cap.cap) continue;
    var at = worstIndexWith(list, cap.field, cap.value, evict);
    if (at < 0 || better(list[at], rec) < 0) return false;   // the ones we have are better
    evict.push(at);
  }

  if (!evict.length && list.length >= OPT.keep &&
      better(list[list.length - 1], rec) < 0) return false;

  evict.sort(function (a, b) { return b - a; }).forEach(function (i) { list.splice(i, 1); });
  list.push(rec);
  list.sort(better);
  while (list.length > OPT.keep) list.pop();
  return true;
}

// ---------------------------------------------------------------------------
// the phases
// ---------------------------------------------------------------------------
var stats = {
  seen: 0, phaseA: 0, phaseB: 0, phaseC: 0, filed: 0,
  rejectPar: 0, rejectWalls: 0, rejectPieces: 0, rejectDuplicate: 0,
  rejectCruel: 0, rejectShallow: 0, rejectNoCategory: 0
};
var seenCanon = new Set();

/** Phase A, on the numbers alone — no board is built to fail this. */
function phaseA(moves, statics, grays, penguins) {
  stats.seen++;
  if (moves < OPT.minPar || (OPT.maxPar && moves > OPT.maxPar)) { stats.rejectPar++; return false; }
  if (statics > OPT.maxWalls) { stats.rejectWalls++; return false; }
  if (!OPT.drifters && grays > 0) { stats.rejectPieces++; return false; }
  if (OPT.penguins && penguins !== OPT.penguins) { stats.rejectPieces++; return false; }
  stats.phaseA++;
  return true;
}

/**
 * Phase B, on the position graph: is there a puzzle here at all?
 *
 * Everything refused here is refused for a reason that is exactly true, not
 * estimated — the graph says so. A board with three of four opening swipes
 * fatal is not difficult, it is a guess; a board whose every position offers
 * one real move is a corridor however long it is.
 */
function phaseB(rows) {
  var s = A.survey(rows);
  if (!s) { stats.rejectShallow++; return null; }

  // Three of the four opening swipes end the board for good. That is not a
  // difficult puzzle, it is a coin with three bad sides.
  if (!OPT.allowCruel && s.openingDeadEndRate >= 0.75) { stats.rejectCruel++; return null; }

  // A corridor: on most of the best line the swipes are all worth the same, so
  // there is nothing to get right. Length does not redeem this.
  if (s.forcedRatio > 0.5) { stats.rejectShallow++; return null; }

  // Nowhere on the whole shortest line do the four swipes lead to three
  // distinguishable outcomes — nothing is ever a decision.
  if (s.decisionCount < 1 && s.par > 3) { stats.rejectShallow++; return null; }

  // Almost every position you can reach is already lost. Sharp is good;
  // this is a minefield.
  if (s.deadEndStateRatio >= 0.85) { stats.rejectShallow++; return null; }

  if (s.averageUsefulBranching < 1.5) { stats.rejectShallow++; return null; }
  stats.phaseB++;
  return s;
}

/* The budget is spent per CORNER of the space — one tray, one piece count, one
   wall count, or one length of the index — and not globally. A single global
   cap is spent entirely by whichever corner the loop reaches first, which on a
   run ordered 4×4-then-5×5 means a capped run never looks at a 5×5 at all.
 *
 * It truncates the sweep of each corner rather than sampling it, and the sweep
 * visits cells in a fixed order, so a budgeted run sees boards whose pieces sit
 * in one part of the tray. That is fine for what it is for — a smoke run, or a
 * first look at a corner nobody has searched yet — and it is not a pass to draw
 * conclusions from. A real pass sets no budget and is exhaustive. */
var budgetSpent = 0;
function resetBudget() { budgetSpent = 0; }
function budgetLeft() { return !OPT.budget || budgetSpent < OPT.budget; }

/** Phase C: the full analysis, a kind, and a shelf. */
function phaseC(rows) {
  budgetSpent++;
  stats.phaseC++;

  /* No memo: `consider` has already refused every repeat by canonical id, so
     nothing here is ever analysed twice and a cache would only hold a per-move
     trace for half a million boards. */
  var r = A.analyzeLevel(rows, { noCache: true });
  if (!r.solvable) return;
  if (!r.categories.length) { stats.rejectNoCategory++; return; }

  var cats = r.categories;
  if (OPT.category && cats.indexOf(OPT.category) < 0) return;
  if (OPT.band && r.difficulty !== OPT.band) return;

  var rec = {
    id: shortId(r.canonicalId),
    board: r.board,
    boardSize: r.boardSize,
    par: r.par,
    solution: r.solution,
    categories: cats,
    difficulty: r.difficulty,
    canonicalId: r.canonicalId,
    skeletonId: r.skeletonId,
    solutionFingerprint: r.solutionFingerprint,
    funPotential: r.funPotential,
    elementCount: r.elementCount,
    redundantWallCount: r.redundantWallCount,
    analysis: analysisOf(r)
  };

  var filed = false;
  cats.forEach(function (cat) {
    if (OPT.category && cat !== OPT.category) return;
    if (offer(bucketKey(cat, r.difficulty, r.boardSize), rec)) filed = true;
  });
  if (filed) {
    records.set(rec.canonicalId, rec);
    stats.filed++;
  }
}

/** The numbers a person reviewing a board actually wants in front of them. */
function analysisOf(r) {
  return {
    par: r.par,
    boardSize: r.boardSize,
    penguinCount: r.penguinCount,
    drifterCount: r.drifterCount,
    wallCount: r.wallCount,
    hazardCount: r.hazardCount,
    elementCount: r.elementCount,

    funPotential: r.funPotential,
    ahaPotential: r.ahaPotential,
    interactionScore: r.interactionScore,
    choiceScore: r.choiceScore,
    solutionEleganceScore: r.solutionEleganceScore,
    simplicityScore: r.simplicityScore,
    sizeEfficiency: r.sizeEfficiency,
    depthPerElement: r.depthPerElement,
    difficultyScore: r.difficultyScore,
    cognitiveLoadScore: r.cognitiveLoadScore,

    moveAwayFromGoalCount: r.moveAwayFromGoalCount,
    goalPassThroughCount: r.goalPassThroughCount,
    delayedCollectionCount: r.delayedCollectionCount,
    counterIntuitiveMoveCount: r.counterIntuitiveMoveCount,
    deceptiveChoiceRatio: round(r.deceptiveChoiceRatio),
    requiredLookahead: r.requiredLookahead,

    penguinBrakeCount: r.penguinBrakeCount,
    dependencyCount: r.dependencyCount,
    collectionOrderDependency: r.collectionOrderDependency,
    sharedGravityInteractionCount: r.sharedGravityInteractionCount,
    soloIndependent: r.soloIndependent,

    meaningfulDecisionCount: r.meaningfulDecisionCount,
    forcedMoveRatio: round(r.forcedMoveRatio),
    singleSafeMoveRatio: round(r.singleSafeMoveRatio),
    averageUsefulBranching: round(r.averageUsefulBranching, 2),
    wrongButRecoverableCount: r.wrongButRecoverableCount,
    deadEndMoveCount: r.deadEndMoveCount,
    openingDeadEndRate: round(r.openingDeadEndRate),

    directionEntropy: round(r.directionEntropy),
    repeatedPatternPenalty: round(r.repeatedPatternPenalty),
    stateChangeDensity: round(r.stateChangeDensity),
    revisitCount: r.revisitCount,

    activeAreaRatio: round(r.activeAreaRatio),
    activeBoundingSide: r.activeBoundingSide,
    meaningfulWallCount: r.meaningfulWallCount,
    redundantWallCount: r.redundantWallCount,

    reachableStateCount: r.reachableStateCount,
    deadEndStateRatio: round(r.deadEndStateRatio)
  };
}
function round(x, places) {
  var f = Math.pow(10, places === undefined ? 3 : places);
  return Math.round(x * f) / f;
}

/** A board goes A → B → C, and stops at the first phase that says no. */
function consider(rows, canon) {
  if (seenCanon.has(canon)) { stats.rejectDuplicate++; return; }
  seenCanon.add(canon);
  if (!budgetLeft()) return;
  if (!phaseB(rows)) return;
  phaseC(rows);
}

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
/**
 * Source one: a fresh enumeration, drifter-free.
 *
 * The tray decides the budget. A 4×4 is small enough to sweep to three walls in
 * a couple of seconds, so it is swept; a 5×5 with the same budget is a hundred
 * times the work for boards that are, cell for cell, emptier. That asymmetry is
 * the point rather than a compromise — the campaign should be discovering how
 * much a 4×4 can hold, not how much room a 5×5 has.
 */
function enumerateFresh() {
  var penguinPlans = OPT.penguins ? [OPT.penguins] : [1, 2];
  var drifterPlans = OPT.drifters ? [0, 1] : [0];

  OPT.sizes.forEach(function (size) {
    var maxStatics = size === 4 ? OPT.statics4 : OPT.statics5;
    LS.setSize(size);
    penguinPlans.forEach(function (penguins) {
      drifterPlans.forEach(function (gray) {
        for (var statics = 0; statics <= maxStatics; statics++) {
          var t0 = Date.now(), before = stats.filed;
          resetBudget();
          LS.run({ penguins: penguins, gray: gray, statics: statics, hazards: OPT.hazards }, {
            gate: function (moves, st, grays, pens) { return phaseA(moves, st, grays, pens); },
            emit: function (entry) { consider(entry.rows, entry.canon); }
          });
          if (OPT.why) {
            console.log('  ' + size + 'x' + size + ' penguins=' + penguins +
              ' drifters=' + gray + ' walls=' + statics +
              '  filed ' + (stats.filed - before) +
              '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
          }
        }
      });
    });
  });
}

/**
 * Source two: the index that already exists.
 *
 * tools/level-index.json is 3.3 billion boards' worth of measurement and it is
 * not regenerated here, or touched, or replaced — it is read. Its shortlist
 * reaches wall budgets a fresh pass cannot afford, so it contributes exactly
 * the boards the enumeration above is too poor to visit.
 */
function readIndex(file) {
  if (!file) return;
  if (!fs.existsSync(file)) {
    console.error('no index at ' + file + ' — skipping');
    return;
  }
  var idx = JSON.parse(fs.readFileSync(file, 'utf8'));
  var pars = idx.pars || idx;
  Object.keys(pars).map(Number).sort(function (a, b) { return a - b; }).forEach(function (par) {
    resetBudget();                                 // one length is one corner
    pars[par].forEach(function (e) {
      var size = e.rows.length;
      if (OPT.sizes.indexOf(size) < 0) return;
      var statics = e.statics != null ? e.statics : (e.walls || 0) + (e.hazards || 0);
      if (!OPT.hazards && (e.hazards || 0) > 0) { stats.rejectPieces++; return; }
      if (!phaseA(e.moves, statics, e.grays || 0, e.penguins)) return;
      consider(e.rows, K.canonBoard(e.rows));
    });
  });
}

// ---------------------------------------------------------------------------
// does the shipped campaign already walk through this board?
// ---------------------------------------------------------------------------
/**
 * A candidate that the campaign already passes through is a stage you have
 * solved before you meet it.
 *
 * This is the rule tools/build-stages.js enforces between stages, applied
 * between a candidate and the hundred boards already shipping. It does not
 * throw the candidate away — the shipped hundred are a comparison, not a fixed
 * point, and a better board should win — it labels it, so the browser can say
 * which stage it collides with and a person can decide.
 */
function campaignPositions() {
  var stages;
  try { stages = require('../src/stages.js').STAGES; }
  catch (err) { return null; }
  var set = Object.create(null);
  stages.forEach(function (def) {
    var stage = E.compile(def);
    E.reachable(stage, null, 80000).forEach(function (st) {
      var key = K.positionKey(E, stage, st);
      if (key) set[key] = def.id;
    });
  });
  return set;
}

function markCampaignOverlap(list) {
  var set = campaignPositions();
  if (!set) return;
  list.forEach(function (rec) {
    var stage = E.compile({ id: 'cand', board: rec.board });
    var hit = 0;
    E.reachable(stage, null, 80000).some(function (st) {
      var key = K.positionKey(E, stage, st);
      if (key && set[key]) { hit = set[key]; return true; }
      return false;
    });
    rec.overlapsCampaignStage = hit || 0;
  });
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
var started = Date.now();
console.log('TILT fun search — trays ' + OPT.sizes.map(function (n) { return n + 'x' + n; }).join(', ') +
  ', par ' + OPT.minPar + (OPT.maxPar ? '…' + OPT.maxPar : '+') +
  (OPT.drifters ? ', with drifters' : ', no drifters') +
  (OPT.hazards ? ', with cracked ice' : ', no cracked ice'));

if (OPT.enumerate) enumerateFresh();
if (OPT.fromIndex) {
  var before = stats.filed;
  readIndex(OPT.fromIndex);
  if (OPT.why) console.log('  ' + path.basename(OPT.fromIndex) + ': filed ' + (stats.filed - before));
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------
/* Everything below is sorted before it is written. Two runs of the same command
   have to produce the same file — that is what makes a number in it something
   you can argue with rather than something you have to re-derive. Nothing is
   timestamped for the same reason. */
var kept = Array.from(records.values());
kept.sort(better);

/**
 * Trim to `--limit` by going round the buckets, not down the leaderboard.
 *
 * Cutting the globally top N would undo the whole arrangement: `funPotential`
 * runs low in the easy bands and high in the long ones, so a straight cut
 * deletes the tutorial shelf and half the ELEGANT shelf and returns a thousand
 * boards of the two kinds the score happens to like. Taking each bucket's best
 * in turn spends the limit evenly, and a bucket that runs out simply stops
 * being asked. Buckets are visited in sorted order and each is already ranked,
 * so which boards survive does not depend on anything but the limit.
 */
if (OPT.limit && kept.length > OPT.limit) {
  var order = Array.from(buckets.keys()).sort();
  var cursor = Object.create(null);
  order.forEach(function (key) { cursor[key] = 0; });
  var allowed = new Set();
  var moved = true;
  while (allowed.size < OPT.limit && moved) {
    moved = false;
    for (var b = 0; b < order.length && allowed.size < OPT.limit; b++) {
      var list = buckets.get(order[b]);
      while (cursor[order[b]] < list.length &&
             allowed.has(list[cursor[order[b]]].canonicalId)) cursor[order[b]]++;
      if (cursor[order[b]] >= list.length) continue;
      allowed.add(list[cursor[order[b]]++].canonicalId);
      moved = true;
    }
  }
  kept = kept.filter(function (r) { return allowed.has(r.canonicalId); });
  buckets.forEach(function (list, key) {
    buckets.set(key, list.filter(function (r) { return allowed.has(r.canonicalId); }));
  });
}
if (OPT.campaign) markCampaignOverlap(kept);

var bucketOut = {};
Array.from(buckets.keys()).sort().forEach(function (key) {
  var list = buckets.get(key);
  if (!list.length) return;
  bucketOut[key] = list.map(function (r) { return r.id; });
});

kept.sort(function (a, b) { return a.canonicalId < b.canonicalId ? -1 : 1; });

var out = {
  format: 'tilt-fun-index/1',
  settings: {
    sizes: OPT.sizes, minPar: OPT.minPar, maxPar: OPT.maxPar || null,
    keepPerBucket: OPT.keep, limit: OPT.limit,
    statics4: OPT.statics4, statics5: OPT.statics5, maxWalls: OPT.maxWalls,
    drifters: OPT.drifters, hazards: OPT.hazards,
    enumerated: OPT.enumerate, fromIndex: OPT.fromIndex ? path.basename(OPT.fromIndex) : null,
    category: OPT.category, difficulty: OPT.band,
    budgetPerCorner: OPT.budget || null
  },
  counts: {
    measured: stats.seen, passedCheapGate: stats.phaseA,
    surveyed: stats.phaseB, analysed: stats.phaseC, kept: kept.length
  },
  buckets: bucketOut,
  candidates: kept
};

fs.writeFileSync(OPT.out + '.tmp', JSON.stringify(out, null, 1));
fs.renameSync(OPT.out + '.tmp', OPT.out);

// ---------------------------------------------------------------------------
var secs = ((Date.now() - started) / 1000).toFixed(1);
console.log('measured ' + stats.seen + ' boards → ' + stats.phaseA + ' past the cheap gate → ' +
  stats.phaseB + ' surveyed → ' + stats.phaseC + ' analysed → ' + kept.length + ' kept  (' + secs + 's)');
if (OPT.why) {
  console.log('  rejected: par ' + stats.rejectPar + ', walls ' + stats.rejectWalls +
    ', pieces ' + stats.rejectPieces + ', duplicate ' + stats.rejectDuplicate +
    ', shallow ' + stats.rejectShallow + ', cruel opening ' + stats.rejectCruel +
    ', no category ' + stats.rejectNoCategory);
}

var byCat = {}, byBand = {}, bySize = {};
kept.forEach(function (r) {
  r.categories.forEach(function (c) { byCat[c] = (byCat[c] || 0) + 1; });
  byBand[r.difficulty] = (byBand[r.difficulty] || 0) + 1;
  bySize[r.boardSize] = (bySize[r.boardSize] || 0) + 1;
});
console.log('by kind:       ' + SCORE.CATEGORIES.filter(function (c) { return byCat[c]; })
  .map(function (c) { return c + ' ' + byCat[c]; }).join(', '));
console.log('by difficulty: ' + SCORE.BANDS.filter(function (b) { return byBand[b]; })
  .map(function (b) { return b + ' ' + byBand[b]; }).join(', '));
console.log('by tray:       ' + Object.keys(bySize).sort()
  .map(function (s) { return s + 'x' + s + ' ' + bySize[s]; }).join(', '));
console.log(Object.keys(bucketOut).length + ' buckets, wrote ' + OPT.out);
console.log('play them: node tools/serve.js  then open /tools/fun-browser.html');
