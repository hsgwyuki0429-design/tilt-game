'use strict';
/*
 * TILT — a complete census of the 4x4 tray.
 *
 *   node tools/search-4x4.js --plans "2,1,2" --out tools/4x4-index.json
 *   node tools/search-4x4.js --sweep --out tools/4x4-index.json
 *
 * tools/level-search.js exists to feed the campaign: it measures boards and
 * keeps the EMPTIEST few at every length, because an empty board is the one a
 * player wants to look at. This tool answers a different question — what does
 * the whole 4x4 tray look like, from a one-swipe board to the longest one there
 * is? — so it differs from that tool in three ways:
 *
 *   1. It counts EVERY board it measures, solvable or not, into a par
 *      histogram. The shortlist is a sample; the histogram is the census, and
 *      it is what "the difficulty distribution of the 4x4 tray" actually means.
 *
 *   2. What it keeps is chosen for VARIETY rather than for emptiness. A length
 *      whose shortlist is a hundred boards standing in one room with one
 *      solution has told you almost nothing about that length. Candidates are
 *      sampled by reservoir so a slot is not simply the first hundred boards
 *      the enumeration happened to reach, and eviction always takes from the
 *      biggest crowd — first by obstacle plan (how many penguins, drifters and
 *      immovables), then by the room, then by the walls-and-auroras skeleton,
 *      then by the solution itself.
 *
 *   3. It stores the SHORTEST SOLUTION with every board it keeps, read straight
 *      off the same distance table that measured the board.
 *
 * The measurement is the backward breadth-first search from tools/level-search.js:
 * fix the walls and the auroras, build the position graph once, and walk it
 * backwards from every cleared position at once. That hands back the exact
 * minimum move count of EVERY starting arrangement on that layout for the price
 * of one traversal, which is what makes a census affordable at all.
 *
 * Nothing here is trusted. tools/verify-4x4.js re-compiles every board it keeps
 * with src/engine.js, re-solves it, and replays the stored solution.
 */

var fs = require('fs');
var path = require('path');

var N = 4, NN = 16, LAST = 3, BASE = 17;
var DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
var DIRS = ['U', 'R', 'D', 'L'];
var GRAY = 9;

// ---------------------------------------------------------------------------
// symmetry
// ---------------------------------------------------------------------------
var PERMS = (function () {
  var e = N - 1;
  var fns = [
    function (x, y) { return [x, y]; }, function (x, y) { return [e - x, y]; },
    function (x, y) { return [x, e - y]; }, function (x, y) { return [e - x, e - y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [e - y, x]; },
    function (x, y) { return [y, e - x]; }, function (x, y) { return [e - y, e - x]; }
  ];
  return fns.map(function (f) {
    var p = new Int8Array(NN);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var r = f(x, y); p[y * N + x] = r[1] * N + r[0];
    }
    return p;
  });
})();

function permMask(mask, p) {
  var m = 0;
  for (var c = 0; c < NN; c++) if ((mask >>> c) & 1) m |= 1 << p[c];
  return m;
}

var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

/** The smallest of a board's 8 symmetries x 2 colour namings. */
function canonFlat(flat) {
  var best = null;
  for (var swap = 0; swap < 2; swap++) {
    var src = swap ? flat.split('').map(function (ch) { return SWAP[ch]; }).join('') : flat;
    for (var i = 0; i < 8; i++) {
      var p = PERMS[i], out = new Array(NN);
      for (var c = 0; c < NN; c++) out[p[c]] = src[c];
      var s = out.join('');
      if (best === null || s < best) best = s;
    }
  }
  return best;
}
function canonBoard(rows) { return canonFlat(rows.join('')); }
/** The board with every movable piece lifted off: walls and auroras only. */
function skeleton(rows) { return canonFlat(rows.join('').replace(/[ABG]/g, '.')); }
/** Coarser still: the room the puzzle is played in. */
function wallPlanFlat(flat) {
  var bare = flat.replace(/[^#x]/g, '.'), best = null;
  for (var i = 0; i < 8; i++) {
    var p = PERMS[i], out = new Array(NN);
    for (var c = 0; c < NN; c++) out[p[c]] = bare[c];
    var t = out.join('');
    if (best === null || t < best) best = t;
  }
  return best;
}
function wallPlanFromMask(wallMask, hazMask) {
  var flat = new Array(NN);
  for (var c = 0; c < NN; c++) {
    flat[c] = (wallMask >>> c) & 1 ? '#' : (((hazMask >>> c) & 1) ? 'x' : '.');
  }
  return wallPlanFlat(flat.join(''));
}

// ---------------------------------------------------------------------------
// simulation — the same settle/resolve loop as src/engine.js
// ---------------------------------------------------------------------------
var occ = new Int8Array(NN);
var order = new Int8Array(8);

/**
 * One tilt. Returns -1 if a block was lost on cracked ice, 0 if nothing moved,
 * 1 otherwise. `pos` is updated in place; -1 means collected, -2 means lost.
 */
function tilt(ctx, col, k, pos, d) {
  var dx = DV[d][0], dy = DV[d][1];
  var wall = ctx.wall, haz = ctx.haz, gcol = ctx.gcol;
  var moved = 0, broken = 0, i, round;

  occ.fill(-1);
  for (i = 0; i < k; i++) if (pos[i] >= 0) occ[pos[i]] = i;

  for (round = 0; round <= k + 1; round++) {
    // ── SETTLE — front-most first, then each block glides the whole way ────
    var live = 0;
    for (i = 0; i < k; i++) if (pos[i] >= 0) order[live++] = i;
    for (var a = 1; a < live; a++) {
      var v = order[a];
      var lv = (pos[v] % N) * dx + ((pos[v] / N) | 0) * dy;
      var b = a - 1;
      while (b >= 0) {
        var u = order[b];
        if ((pos[u] % N) * dx + ((pos[u] / N) | 0) * dy >= lv) break;
        order[b + 1] = u; b--;
      }
      order[b + 1] = v;
    }
    for (var q = 0; q < live; q++) {
      i = order[q];
      var c = pos[i], x = c % N, y = (c / N) | 0;
      for (;;) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > LAST || ny > LAST) break;
        var nc = ny * N + nx;
        if (wall[nc] || occ[nc] !== -1) break;
        x = nx; y = ny;
      }
      var end = y * N + x;
      if (end !== c) { occ[c] = -1; occ[end] = i; pos[i] = end; moved = 1; }
    }
    // ── RESOLVE — only now does a cell do anything to the block on it ─────
    var removed = 0;
    for (i = 0; i < k; i++) {
      if (pos[i] < 0) continue;
      var at = pos[i];
      if (gcol[at] !== 0 && gcol[at] === col[i]) { occ[at] = -1; pos[i] = -1; removed++; }
      else if (haz[at]) { occ[at] = -1; pos[i] = -2; removed++; broken = 1; }
    }
    if (!removed) break;
  }
  return broken ? -1 : moved;
}

// ---------------------------------------------------------------------------
// every start position's exact par, in one traversal
// ---------------------------------------------------------------------------
/* A position is k base-17 digits, one per block: a cell, or 16 for "collected". */
var solverCache = Object.create(null);
function makeSolver(k) {
  if (solverCache[k]) return solverCache[k];
  var n = Math.pow(BASE, k);
  var dist = new Int16Array(n);
  var next = new Int32Array(n * 4);
  var deg = new Int32Array(n + 1);
  var radj = new Int32Array(n * 4);
  var queue = new Int32Array(n);
  var cursor = new Int32Array(n);
  var digits = new Int8Array(k);
  var work = new Int8Array(k);
  var POW = [];
  for (var i = 0, p = 1; i < k; i++, p *= BASE) POW.push(p);

  var solver = {
    k: k, n: n, dist: dist, next: next, POW: POW,
    run: function (ctx, col, nPenguin) {
      dist.fill(-1);
      next.fill(-2);                                 // -2 illegal, -1 no edge
      var wall = ctx.wall, haz = ctx.haz, gcol = ctx.gcol;
      var s, d, j;

      for (s = 0; s < n; s++) {
        var ok = true, collected = 0, seen = 0, t = s;
        for (j = 0; j < k; j++) { digits[j] = t % BASE; t = (t / BASE) | 0; }
        for (j = 0; j < k; j++) {
          var val = digits[j];
          if (val === NN) {
            if (col[j] === GRAY) { ok = false; break; }      // never collected
            collected++;
            continue;
          }
          if (wall[val] || haz[val]) { ok = false; break; }   // cannot rest there
          if (gcol[val] !== 0 && gcol[val] === col[j]) { ok = false; break; }
          if (seen & (1 << val)) { ok = false; break; }       // two in one cell
          seen |= 1 << val;
        }
        if (!ok) continue;
        var base = s * 4;
        if (collected === nPenguin) {                        // a cleared board
          dist[s] = 0;
          next[base] = next[base + 1] = next[base + 2] = next[base + 3] = -1;
          continue;
        }
        for (d = 0; d < 4; d++) {
          for (j = 0; j < k; j++) work[j] = digits[j] === NN ? -1 : digits[j];
          // A tilt that loses a block reaches a position no move can ever
          // clear, so it is not an edge of the graph we are measuring.
          if (tilt(ctx, col, k, work, d) <= 0) { next[base + d] = -1; continue; }
          var ns = 0;
          for (j = 0; j < k; j++) ns += (work[j] < 0 ? NN : work[j]) * POW[j];
          next[base + d] = ns;
        }
      }

      // reverse adjacency, by counting sort
      deg.fill(0);
      for (s = 0; s < n; s++) {
        if (next[s * 4] === -2) continue;
        for (d = 0; d < 4; d++) { var w = next[s * 4 + d]; if (w >= 0) deg[w]++; }
      }
      var acc = 0;
      for (s = 0; s < n; s++) { var cnt = deg[s]; deg[s] = acc; acc += cnt; }
      deg[n] = acc;
      cursor.fill(0);
      for (s = 0; s < n; s++) {
        if (next[s * 4] === -2) continue;
        for (d = 0; d < 4; d++) {
          var e = next[s * 4 + d];
          if (e >= 0) radj[deg[e] + cursor[e]++] = s;
        }
      }

      // multi-source backward BFS from every cleared position
      var head = 0, tail = 0;
      for (s = 0; s < n; s++) if (dist[s] === 0) queue[tail++] = s;
      while (head < tail) {
        var node = queue[head++], dv = dist[node] + 1, stop = deg[node + 1];
        for (var idx = deg[node]; idx < stop; idx++) {
          var pre = radj[idx];
          if (dist[pre] !== -1) continue;
          dist[pre] = dv;
          queue[tail++] = pre;
        }
      }
      return dist;
    },
    /* One shortest solution, read off the table that measured the board: at
       every step take a move that lands one closer to a cleared position. */
    path: function (code) {
      var out = [], s = code, guard = 4096;
      while (dist[s] > 0 && guard-- > 0) {
        var want = dist[s] - 1, took = -1;
        for (var d = 0; d < 4; d++) {
          var ns = next[s * 4 + d];
          if (ns >= 0 && dist[ns] === want) { took = d; break; }
        }
        if (took < 0) return null;
        out.push(DIRS[took]);
        s = next[s * 4 + took];
      }
      return dist[s] === 0 ? out : null;
    }
  };
  solverCache[k] = solver;
  return solver;
}

// ---------------------------------------------------------------------------
// boards
// ---------------------------------------------------------------------------
function boardRows(wallMask, hazMask, goals, blocks) {
  var cells = new Array(NN);
  for (var c = 0; c < NN; c++) {
    cells[c] = ((wallMask >>> c) & 1) ? '#' : (((hazMask >>> c) & 1) ? 'x' : '.');
  }
  goals.forEach(function (g) { cells[g.cell] = g.colour === 1 ? 'a' : 'b'; });
  blocks.forEach(function (b) {
    cells[b.cell] = b.colour === 1 ? 'A' : (b.colour === 2 ? 'B' : 'G');
  });
  var rows = [];
  for (var y = 0; y < N; y++) rows.push(cells.slice(y * N, y * N + N).join(''));
  return rows;
}

// ---------------------------------------------------------------------------
// the shortlist — kept for variety, not for emptiness
// ---------------------------------------------------------------------------
var KEEP = 80;
var best = new Map();                                // par -> slot

/* Four axes, coarsest first. Eviction takes from whichever crowd is biggest on
   the earliest axis that has a crowd at all, so a slot spreads across obstacle
   plans before it spreads across rooms, and across rooms before it spends its
   last places on two boards that differ only in where one drifter started. */
var AXES = ['plan', 'wallPlan', 'skeleton', 'pathSig'];

function slotFor(moves) {
  var slot = best.get(moves);
  if (!slot) {
    slot = { list: [], seen: new Set(), offered: 0, counts: {} };
    AXES.forEach(function (a) { slot.counts[a] = Object.create(null); });
    best.set(moves, slot);
  }
  return slot;
}

/* Seeded, so two runs over the same corner of the space keep the same boards. */
var rngState = 0x9e3779b9;
function rnd() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* The cheap gate. Building a board and its sixteen symmetry images is by far
   the expensive part and there can be tens of millions of candidates at one
   length, so most are turned away without being built.
 *
 * Reservoir sampling, not "the first KEEP": taking the first hundred gives a
 * slot filled entirely by whichever plan the sweep happens to run first, and at
 * the short lengths that is one penguin on an empty tray, over and over. A
 * layout carrying an obstacle plan or a room the length has never seen is
 * always built — that is how a rare corner of the space gets in at all. */
function worthBuilding(slot, planSig, layoutPlan) {
  slot.offered++;
  if (slot.list.length < KEEP) return true;
  if (!slot.counts.plan[planSig]) return true;
  if (!slot.counts.wallPlan[layoutPlan]) return true;
  return rnd() < KEEP / slot.offered;
}

function offer(slot, entry) {
  if (slot.seen.has(entry.canon)) return;
  slot.seen.add(entry.canon);
  slot.list.push(entry);
  AXES.forEach(function (a) {
    slot.counts[a][entry[a]] = (slot.counts[a][entry[a]] || 0) + 1;
  });

  while (slot.list.length > KEEP) {
    var drop = -1;
    for (var ai = 0; ai < AXES.length && drop < 0; ai++) {
      var axis = AXES[ai], worst = 1;
      for (var i = slot.list.length - 1; i >= 0; i--) {
        var n = slot.counts[axis][slot.list[i][axis]];
        if (n > worst) { worst = n; drop = i; }
      }
    }
    if (drop < 0) drop = slot.list.length - 1;
    var gone = slot.list.splice(drop, 1)[0];
    slot.seen.delete(gone.canon);
    AXES.forEach(function (a) { slot.counts[a][gone[a]]--; });
  }
}

// ---------------------------------------------------------------------------
// the census
// ---------------------------------------------------------------------------
var census = { byPar: Object.create(null), unsolvable: 0, measured: 0 };

// ---------------------------------------------------------------------------
// enumeration
// ---------------------------------------------------------------------------
function combinations(list, n) {
  var out = [], pick = new Array(n);
  (function rec(start, depth) {
    if (depth === n) { out.push(pick.slice()); return; }
    for (var i = start; i < list.length; i++) { pick[depth] = list[i]; rec(i + 1, depth + 1); }
  })(0, 0);
  return out;
}
function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }

function planSignature(plan) {
  return plan.penguins + 'p' + plan.gray + 'g' + plan.statics + 's' + (plan.hazards ? 'x' : '');
}

/* A slice is a share of the layouts, taken every `of`-th one. The layouts of a
   plan are independent — each builds its own position graph and asks it its own
   questions — so a plan that takes two hours on one core takes half an hour on
   four, and the four shortlists and the four histograms fold back together
   exactly as if one process had walked the lot. Slices are interleaved rather
   than cut into blocks because layout cost climbs steeply with the index: a
   contiguous last quarter is far more work than a contiguous first one. */
function run(plan, budgetMs, onProgress, slice) {
  var sliceAt = slice ? slice.at : 0, sliceOf = slice ? slice.of : 1;
  var nPenguin = plan.penguins, nGray = plan.gray, k = nPenguin + nGray;
  var col = new Int8Array(k), i;
  for (i = 0; i < nPenguin; i++) col[i] = i + 1;
  for (i = nPenguin; i < k; i++) col[i] = GRAY;
  var solver = makeSolver(k);
  var POW = solver.POW;
  var ctx = { wall: new Uint8Array(NN), haz: new Uint8Array(NN), gcol: new Int8Array(NN) };
  var sig = planSignature(plan);

  var allCells = []; for (i = 0; i < NN; i++) allCells.push(i);
  var sets = combinations(allCells, plan.statics);
  var stats = { graphs: 0, layouts: 0, boards: 0, solvable: 0, unsolvable: 0, longest: 0 };
  var t0 = Date.now(), stopped = null, lastReport = t0;

  for (var setIndex = 0; setIndex < sets.length; setIndex++) {
    if (sliceOf > 1 && setIndex % sliceOf !== sliceAt) continue;
    if (budgetMs && Date.now() - t0 > budgetMs) {
      stopped = setIndex + '/' + sets.length;
      break;
    }
    if (onProgress && Date.now() - lastReport > 30000) {
      lastReport = Date.now();
      onProgress(setIndex + '/' + sets.length, stats);
    }
    var set = sets[setIndex];
    // each static cell is either an ice wall or cracked ice
    var splits = plan.hazards ? (1 << set.length) : 1;
    for (var split = 0; split < splits; split++) {
      var wallMask = 0, hazMask = 0, j;
      for (j = 0; j < set.length; j++) {
        if ((split >>> j) & 1) hazMask |= 1 << set[j]; else wallMask |= 1 << set[j];
      }
      var skip = false;
      for (j = 1; j < 8 && !skip; j++) {
        var w2 = permMask(wallMask, PERMS[j]), h2 = permMask(hazMask, PERMS[j]);
        if (w2 < wallMask || (w2 === wallMask && h2 < hazMask)) skip = true;
      }
      if (skip) continue;
      stats.layouts++;

      var layoutPlan = wallPlanFromMask(wallMask, hazMask);
      var nWalls = popcount(wallMask), nHaz = popcount(hazMask);

      var free = [];
      for (var c = 0; c < NN; c++) {
        ctx.wall[c] = (wallMask >>> c) & 1;
        ctx.haz[c] = (hazMask >>> c) & 1;
        if (!ctx.wall[c] && !ctx.haz[c]) free.push(c);
      }
      if (free.length < nPenguin + k) continue;

      var auroras = [];
      if (nPenguin === 1) free.forEach(function (g) { auroras.push([g]); });
      else for (var p = 0; p < free.length; p++)
        for (var q = p + 1; q < free.length; q++) auroras.push([free[p], free[q]]);

      for (var ai = 0; ai < auroras.length; ai++) {
        var gp = auroras[ai];
        ctx.gcol.fill(0);
        for (var g = 0; g < gp.length; g++) ctx.gcol[gp[g]] = g + 1;
        var dist = solver.run(ctx, col, nPenguin);
        stats.graphs++;

        var open = free.filter(function (cell) { return gp.indexOf(cell) < 0; });
        placeAll(open, k, POW, dist, solver, wallMask, hazMask, gp, col,
          plan, sig, layoutPlan, nWalls, nHaz, stats);
      }
    }
  }
  stats.seconds = (Date.now() - t0) / 1000;
  if (stopped) stats.partial = stopped;
  return stats;
}

function placeAll(open, k, POW, dist, solver, wallMask, hazMask, gp, col,
                  plan, sig, layoutPlan, nWalls, nHaz, stats) {
  (function place(depth, used, code) {
    if (depth === k) {
      var moves = dist[code];
      if (moves === undefined) throw new Error('position ' + code + ' outside the graph');
      stats.boards++;
      census.measured++;
      if (moves <= 0) {
        stats.unsolvable++;
        census.unsolvable++;
        return;
      }
      stats.solvable++;
      if (moves > stats.longest) stats.longest = moves;
      census.byPar[moves] = (census.byPar[moves] || 0) + 1;

      var slot = slotFor(moves);
      if (!worthBuilding(slot, sig, layoutPlan)) return;

      var blocks = [], t = code;
      for (var b = 0; b < k; b++) { blocks.push({ cell: t % BASE, colour: col[b] }); t = (t / BASE) | 0; }
      var rows = boardRows(wallMask, hazMask,
        gp.map(function (cell, idx) { return { cell: cell, colour: idx + 1 }; }), blocks);
      var sol = solver.path(code);
      if (!sol || sol.length !== moves) {
        throw new Error('board ' + rows.join('/') + ' measured ' + moves +
          ' but the table gives ' + (sol ? sol.length : 'no') + ' moves');
      }
      offer(slot, {
        moves: moves, rows: rows, solution: sol.join(''),
        penguins: plan.penguins, drifters: plan.gray,
        statics: plan.statics, walls: nWalls, hazards: nHaz,
        plan: sig, canon: canonBoard(rows), skeleton: skeleton(rows),
        wallPlan: layoutPlan, pathSig: sol.join('')
      });
      return;
    }
    for (var idx = 0; idx < open.length; idx++) {
      var cell = open[idx];
      if (used & (1 << cell)) continue;
      place(depth + 1, used | (1 << cell), code + cell * POW[depth]);
    }
  })(0, 0, 0);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf('--' + name);
  return i < 0 ? dflt : argv[i + 1];
}
function flag(name) { return argv.indexOf('--' + name) >= 0; }

if (arg('keep', null)) KEEP = Number(arg('keep'));
var budgetMs = arg('budget', null) ? Number(arg('budget')) * 1000 : 0;
var out = arg('out', path.join(__dirname, '4x4-index.json'));
var label = arg('label', '');
var slice = null;
if (arg('slice', null)) {
  var sv = arg('slice').split('/').map(Number);
  slice = { at: sv[0], of: sv[1] };
  if (!(slice.of >= 1) || !(slice.at >= 0) || slice.at >= slice.of) {
    console.error('--slice wants "at/of", e.g. 0/4');
    process.exit(1);
  }
}
var sliceTag = slice ? slice.at + '/' + slice.of : '1/1';

/* --sweep is the whole tray: every obstacle plan whose position graph fits in
   memory and whose enumeration finishes in a sane time. Ordered cheapest
   first, so a run that has to be cut short has still measured the widest
   corners. */
var SWEEP = [
  '1,0,0', '1,0,1', '1,0,2', '1,0,3', '1,0,4', '1,0,5', '1,0,6',
  '1,1,0', '1,1,1', '1,1,2', '1,1,3', '1,1,4', '1,1,5',
  '2,0,0', '2,0,1', '2,0,2', '2,0,3', '2,0,4', '2,0,5',
  '1,2,0', '1,2,1', '1,2,2', '1,2,3', '1,2,4',
  '2,1,0', '2,1,1', '2,1,2', '2,1,3', '2,1,4',
  '1,3,0', '1,3,1', '1,3,2', '1,3,3',
  '2,2,0', '2,2,1', '2,2,2', '2,2,3',
  '2,3,0', '2,3,1', '2,3,2'
];

var plans = [];
var spec = arg('plans', flag('sweep') ? SWEEP.join(';') : null);
if (spec === null) { console.error('give --plans "p,g,s;…" or --sweep'); process.exit(1); }
spec.split(';').filter(Boolean).forEach(function (part) {
  var v = part.trim().split(',').map(Number);
  plans.push({ penguins: v[0], gray: v[1], statics: v[2], hazards: v[3] ? true : flag('hazards') });
});

var covered = [];
var merge = arg('merge', null);
if (merge) {
  var mergedAlready = Object.create(null);
  merge.split(',').filter(Boolean).forEach(function (file) {
    if (!fs.existsSync(file)) return;
    var real = fs.realpathSync(file);
    if (mergedAlready[real]) return;             // adding a census twice doubles it
    mergedAlready[real] = true;
    var prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    (prev.plans || []).forEach(function (p) { covered.push(p); });
    if (prev.census) {
      census.measured += prev.census.measured || 0;
      census.unsolvable += prev.census.unsolvable || 0;
      Object.keys(prev.census.byPar || {}).forEach(function (m) {
        census.byPar[m] = (census.byPar[m] || 0) + prev.census.byPar[m];
      });
    }
    Object.keys(prev.boards || {}).forEach(function (m) {
      prev.boards[m].forEach(function (e) {
        var slot = slotFor(Number(m));
        slot.offered++;
        offer(slot, {
          moves: e.moves, rows: e.rows, solution: e.solution,
          penguins: e.penguins, drifters: e.drifters,
          statics: e.statics, walls: e.walls, hazards: e.hazards,
          plan: e.plan, canon: canonBoard(e.rows), skeleton: skeleton(e.rows),
          wallPlan: wallPlanFlat(e.rows.join('')), pathSig: e.solution
        });
      });
    });
  });
}

/* One record per plan-and-slice. Slices are kept apart rather than added up
   here: an index may be merged again later, and two records that have already
   been summed cannot be told from two halves of the same measurement. The
   folding is done once, for display, in tools/report-4x4.js. */
function writeIndex(inProgress) {
  var cov = covered.concat(inProgress ? [inProgress] : []);
  var keep = Object.create(null);
  cov.forEach(function (e) {
    var k = e.plan + '#' + (e.slice || '1/1');
    var held = keep[k];
    if (!held || (held.partial && !e.partial) ||
        (!held.partial === !e.partial && e.boards > held.boards)) keep[k] = e;
  });
  cov = Object.keys(keep).map(function (k) { return keep[k]; });
  var boards = {};
  Array.from(best.keys()).sort(function (a, b) { return a - b; }).forEach(function (m) {
    var list = best.get(m).list.slice().sort(function (a, b) {
      return a.statics - b.statics || a.drifters - b.drifters ||
             a.penguins - b.penguins || (a.canon < b.canon ? -1 : 1);
    });
    boards[m] = list.map(function (e) {
      return {
        moves: e.moves, rows: e.rows, solution: e.solution,
        penguins: e.penguins, drifters: e.drifters,
        statics: e.statics, walls: e.walls, hazards: e.hazards, plan: e.plan
      };
    });
  });
  var byPar = {};
  Object.keys(census.byPar).map(Number).sort(function (a, b) { return a - b; })
    .forEach(function (m) { byPar[m] = census.byPar[m]; });
  fs.writeFileSync(out + '.tmp', JSON.stringify({
    size: 4, keep: KEEP, label: label,
    plans: cov.sort(function (a, b) {
      return a.plan < b.plan ? -1 : (a.plan > b.plan ? 1 :
        ((a.slice || '') < (b.slice || '') ? -1 : 1));
    }),
    census: { measured: census.measured, unsolvable: census.unsolvable, byPar: byPar },
    boards: boards
  }, null, 1));
  fs.renameSync(out + '.tmp', out);
}

plans.forEach(function (plan) {
  var sig = planSignature(plan);
  var stats = run(plan, budgetMs, function (where, s) {
    console.log('  … ' + sig + ' [' + sliceTag + '] ' + where + ' layouts, longest so far ' + s.longest);
    writeIndex(Object.assign({ plan: sig, slice: sliceTag, penguins: plan.penguins,
      drifters: plan.gray, statics: plan.statics, hazards: !!plan.hazards,
      partial: where }, s));
  }, slice);
  covered.push(Object.assign({ plan: sig, slice: sliceTag, penguins: plan.penguins,
    drifters: plan.gray, statics: plan.statics, hazards: !!plan.hazards }, stats));
  console.log('4x4 ' + sig + ' [' + sliceTag + ']  layouts=' + stats.layouts + ' graphs=' + stats.graphs +
    ' boards=' + stats.boards + ' solvable=' + stats.solvable +
    ' unsolvable=' + stats.unsolvable + ' longest=' + stats.longest +
    (stats.partial ? ' PARTIAL ' + stats.partial : '') +
    '  (' + stats.seconds.toFixed(1) + 's)');
  writeIndex();
});

writeIndex();
var keys = Array.from(best.keys()).sort(function (a, b) { return a - b; });
console.log('wrote ' + out + ' — par ' + keys[0] + '…' + keys[keys.length - 1] +
  ', ' + census.measured.toLocaleString() + ' boards measured');
