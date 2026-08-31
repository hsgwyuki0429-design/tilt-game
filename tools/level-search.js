'use strict';
/*
 * TILT — exhaustive level search, on a square tray of any side.
 *
 *   node tools/level-search.js --plans "2,1,1;2,0,2" --out tools/level-index.json
 *   node tools/level-search.js --size 4 --plans "2,1,2" --out tools/index-4.json
 *
 * The campaign wants a board of an EXACT length, over and over, a hundred
 * times. That is a different question from "find me a good board", and it is
 * answered by enumeration rather than by search: inside the budget it is given
 * this tool measures every board of the given size that satisfies the rules —
 * one or two penguins, one aurora each, some obstacles — and keeps the best
 * few at every length it finds.
 *
 * "Best" is not length. Length is the axis the campaign is laid out along, and
 * within one length a board is better when it is emptier:
 *
 *   1. fewer immovable obstacles  (interior walls '#' and cracked ice 'x')
 *   2. fewer drifters             (grey 'G' blocks, which slide but are never
 *                                  collected and can plug an aurora)
 *   3. fewer penguins
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS FAST ENOUGH TO BE EXHAUSTIVE
 * ---------------------------------------------------------------------------
 *
 * The naive shape of this is "for every board, BFS from its start". But a board
 * is a static layout plus an aurora placement plus a starting arrangement, and
 * only the first two change the RULES — the starting arrangement is just a
 * vertex of the same graph. So we fix the layout and the auroras, build the
 * whole position graph once, and run a multi-source BACKWARD BFS from the
 * winning positions. That hands back the exact minimum move count of every
 * possible start at once, for the price of one traversal.
 *
 * Layouts are also deduplicated up to the square's eight symmetries, and the
 * two penguin colours are interchangeable, so auroras are enumerated ordered.
 *
 * The simulation below is a specialised copy of the one in src/engine.js —
 * same passes, same front-most-first ordering, same settle/resolve loop. It is
 * kept honest by tools/test.js, which re-solves every shipped board with the
 * real engine and refuses any board whose par does not match.
 */

var fs = require('fs');
var path = require('path');

var DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
var GRAY = 9;

// ---------------------------------------------------------------------------
// the tray
// ---------------------------------------------------------------------------
/* The board is square but its side is not fixed. A smaller tray is a different
   space rather than a subset of a bigger one — a wall on a 4×4 is against a
   different set of edges — and it is enormously cheaper to enumerate, so the
   campaign is free to spend the short lengths there. N is set once, from
   --size, before anything is measured. */
var N = 5, NN = 25, LAST = 4;
/* A position is k digits, one per block: a cell, or NN for "collected". So the
   digits are base NN+1. */
var BASE = NN + 1;

/** The eight symmetries of the square, as cell permutations, for a given side. */
var permCache = Object.create(null);
function permsFor(n) {
  if (permCache[n]) return permCache[n];
  var e = n - 1;
  var fns = [
    function (x, y) { return [x, y]; }, function (x, y) { return [e - x, y]; },
    function (x, y) { return [x, e - y]; }, function (x, y) { return [e - x, e - y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [e - y, x]; },
    function (x, y) { return [y, e - x]; }, function (x, y) { return [e - y, e - x]; }
  ];
  return (permCache[n] = fns.map(function (f) {
    var p = new Int8Array(n * n);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var r = f(x, y); p[y * n + x] = r[1] * n + r[0];
    }
    return p;
  }));
}
var PERMS = permsFor(N);

/* Everything sized by the tray, in one place, so --size cannot half-apply. */
var occ, ctx;
function setSize(n) {
  N = n; NN = n * n; LAST = n - 1; BASE = NN + 1;
  PERMS = permsFor(n);
  occ = new Int8Array(NN);
  ctx = { wall: new Uint8Array(NN), haz: new Uint8Array(NN), gcol: new Int8Array(NN) };
}

function permMask(mask, p) {
  var m = 0;
  for (var c = 0; c < NN; c++) if ((mask >>> c) & 1) m |= 1 << p[c];
  return m;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------
var order = new Int8Array(8);

/**
 * One tilt. Returns -1 if a block was lost, 0 if nothing moved, 1 otherwise.
 * `pos` is updated in place; -1 means collected, -2 means lost.
 */
function tilt(ctx, col, k, pos, d) {
  var dx = DV[d][0], dy = DV[d][1];
  var wall = ctx.wall, haz = ctx.haz, gcol = ctx.gcol;
  var moved = 0, broken = 0, i, round;

  occ.fill(-1);
  for (i = 0; i < k; i++) if (pos[i] >= 0) occ[pos[i]] = i;

  for (round = 0; round <= k + 1; round++) {
    // ── SETTLE ────────────────────────────────────────────────────────────
    // Front-most first, and then each block glides the whole way. Under one
    // shared gravity that is exactly what the engine's one-cell-per-pass loop
    // converges to, because a block behind can never overtake the one ahead.
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
    // ── RESOLVE ───────────────────────────────────────────────────────────
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
// A position is k base-(NN+1) digits, one per block: a cell, or NN collected.
function makeSolver(k) {
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

  return function solveAll(ctx, col, nPenguin) {
    dist.fill(-1);
    next.fill(-2);                                   // -2 illegal, -1 no edge
    var wall = ctx.wall, haz = ctx.haz, gcol = ctx.gcol;
    var s, d, j;

    for (s = 0; s < n; s++) {
      var ok = true, collected = 0, seen = 0, t = s;
      for (j = 0; j < k; j++) { digits[j] = t % BASE; t = (t / BASE) | 0; }
      for (j = 0; j < k; j++) {
        var val = digits[j];
        if (val === NN) {
          if (col[j] === GRAY) { ok = false; break; }        // never collected
          collected++;
          continue;
        }
        if (wall[val] || haz[val]) { ok = false; break; }     // cannot rest there
        if (gcol[val] !== 0 && gcol[val] === col[j]) { ok = false; break; }
        if (seen & (1 << val)) { ok = false; break; }         // two in one cell
        seen |= 1 << val;
      }
      if (!ok) continue;
      var base = s * 4;
      if (collected === nPenguin) {                           // a cleared board
        dist[s] = 0;
        next[base] = next[base + 1] = next[base + 2] = next[base + 3] = -1;
        continue;
      }
      for (d = 0; d < 4; d++) {
        for (j = 0; j < k; j++) work[j] = digits[j] === NN ? -1 : digits[j];
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
  };
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

var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

function canonFlat(flat) {
  // The side comes from the string, not from N: an index can hold boards of
  // more than one size, and merging one must not read a 4x4 as a short 5x5.
  var perms = permsFor(Math.round(Math.sqrt(flat.length))), best = null;
  for (var swap = 0; swap < 2; swap++) {
    var src = swap ? flat.split('').map(function (ch) { return SWAP[ch]; }).join('') : flat;
    for (var i = 0; i < 8; i++) {
      var p = perms[i], out = new Array(flat.length);
      for (var c = 0; c < flat.length; c++) out[p[c]] = src[c];
      var s = out.join('');
      if (best === null || s < best) best = s;
    }
  }
  return best;
}
/** The board's identity: smallest of its 8 symmetries × 2 colour namings. */
function canonBoard(rows) { return canonFlat(rows.join('')); }
/** The same, with every movable piece lifted off: walls and auroras only. */
function skeleton(rows) { return canonFlat(rows.join('').replace(/[ABG]/g, '.')); }
/** Coarser still: only the immovable blocks, in no particular colour. */
function wallPlan(rows) {
  var flat = rows.join('').replace(/[^#x]/g, '.'), best = null;
  var perms = permsFor(Math.round(Math.sqrt(flat.length)));
  for (var i = 0; i < 8; i++) {
    var p = perms[i], out = new Array(flat.length);
    for (var c = 0; c < flat.length; c++) out[p[c]] = flat[c];
    var t = out.join('');
    if (best === null || t < best) best = t;
  }
  return best;
}
/* The same plan, from the masks the enumeration already has. A layout's plan is
   fixed before a single board is placed on it, so worthBuilding can ask whether
   a length has seen this room without building anything. */
function wallPlanFromMask(wallMask, hazMask) {
  var flat = new Array(NN);
  for (var c = 0; c < NN; c++) {
    flat[c] = (wallMask >>> c) & 1 ? '#' : (((hazMask >>> c) & 1) ? 'x' : '.');
  }
  return wallPlan([flat.join('')]);
}

// ---------------------------------------------------------------------------
// the shortlist
// ---------------------------------------------------------------------------
/* Deep enough that tools/build-stages.js can walk past a candidate it has to
   reject. It rejects a lot: a board whose opening position turns up inside
   another board's play is the same puzzle twice, and two boards may not share a
   skeleton — the same walls and auroras under some symmetry — which at several
   lengths rules out all but a handful of an entire shortlist. Raise it with
   --keep when a length runs dry; it costs bookkeeping, not search. */
var KEEP = 120;
/* Only lengths at or above this are shortlisted. The bookkeeping, not the
   enumeration, is what a deep shortlist costs, so aiming a rerun at the top of
   the range buys hundreds of long boards for roughly the price of the original
   pass. */
var MINPAR = 1;
var best = new Map();                              // par -> { list, seen }
/* A four-wall pass takes hours, and the index used to be written only once the
   whole run finished — so a pass that had to be stopped left nothing at all
   behind. The shortlist is complete as far as it got at every layout boundary,
   so writing it out along the way costs a second and makes a stopped pass worth
   what it measured. Set by the CLI section below, once --out is known. */
var CHECKPOINT_MS = Number(process.env.TILT_CHECKPOINT_MS || 120000);
var lastCheckpoint = Date.now();
var checkpoint = null;

function better(a, b) {
  if (a.statics !== b.statics) return a.statics - b.statics;
  if (a.grays !== b.grays) return a.grays - b.grays;
  if (a.penguins !== b.penguins) return a.penguins - b.penguins;
  return a.canon < b.canon ? -1 : (a.canon > b.canon ? 1 : 0);
}
function slotFor(moves) {
  var slot = best.get(moves);
  if (!slot) {
    slot = { list: [], seen: new Set(), skeletons: Object.create(null),
             walls: Object.create(null) };
    best.set(moves, slot);
  }
  return slot;
}
/* The cheap gate. Most candidates lose on obstacle count alone, and building a
   board plus its sixteen symmetry images is by far the expensive part.
 *
 * The exception is a wall plan the length has never seen. offer() is willing
 * to keep a board that loses on emptiness when it brings a new layout — that
 * is how a hundred stages get a hundred different rooms — but this gate runs
 * first, so without the check below the concession is unreachable whenever the
 * candidate is less empty than everything already kept. That is a real gap at
 * the SHORT lengths, where a slot fills with one-wall boards and no four-wall
 * layout can follow, and it matters more now that a 4x4 board must get into a
 * length already full of 5x5 ones.
 *
 * It is not what caps the campaign's ceiling. The list is sorted emptiest
 * first, so the tail is the LEAST empty board kept — at par 45 and up the tail
 * already carries four walls and four-wall candidates were passing this gate
 * all along. Par 55 holds two hundred boards on ten wall plans because ten is
 * close to all there are at that length, not because the shortlist refused the
 * rest: the same pass measured with and without this check produces an
 * identical shortlist there. Raising the ceiling needs a wider search, not a
 * deeper one.
 *
 * The plan is a property of the layout, not of the board, so it is known
 * before any board is built and costs nothing to check. Once a plan is in the
 * slot the old gate takes over again, which bounds this to a few extra builds
 * per layout. */
function worthBuilding(slot, statics, grays, penguins, plan) {
  if (slot.list.length < KEEP) return true;
  if (plan !== undefined && !slot.walls[plan]) return true;
  var tail = slot.list[slot.list.length - 1];
  if (statics !== tail.statics) return statics < tail.statics;
  if (grays !== tail.grays) return grays < tail.grays;
  if (penguins !== tail.penguins) return penguins < tail.penguins;
  return true;                                 // offer() decides on the skeleton
}
/**
 * Trimming drops a REPEAT before it drops the worst board.
 *
 * Ranking by emptiness clusters boards onto the same few layouts, so a
 * shortlist cut off at its tail keeps forty boards standing in one room.
 * tools/build-stages.js will not put two of those in one campaign, so a
 * shortlist that offers it forty of them has offered it one.
 *
 * Two layouts matter, and the coarser one is by far the scarcer. There are
 * 2041 ways to place up to four immovable blocks on a 5×5 up to rotation and
 * reflection, but only ONE with none and six with one, so a wall plan is the
 * first thing to keep distinct; the skeleton — the same walls plus where the
 * auroras sit — comes second. Dropping the most-repeated tail entry keeps the
 * same count while covering far more of the space.
 */
function offer(slot, entry) {
  if (slot.seen.has(entry.canon)) return;
  if (slot.list.length >= KEEP && better(entry, slot.list[slot.list.length - 1]) >= 0 &&
      slot.walls[entry.wallPlan] && slot.skeletons[entry.skeleton]) return;
  slot.seen.add(entry.canon);
  slot.list.push(entry);
  slot.skeletons[entry.skeleton] = (slot.skeletons[entry.skeleton] || 0) + 1;
  slot.walls[entry.wallPlan] = (slot.walls[entry.wallPlan] || 0) + 1;
  slot.list.sort(better);
  while (slot.list.length > KEEP) {
    // Take from the biggest crowd, not from the tail. The emptiest boards all
    // share one wall plan and there can be a hundred and eighty of them, so
    // dropping merely the last DUPLICATE spends the whole shortlist keeping
    // that one plan and evicts the rare layouts instead of the common one.
    var drop = -1, worst = 1, i, n;
    for (i = slot.list.length - 1; i >= 0; i--) {
      n = slot.walls[slot.list[i].wallPlan];
      if (n > worst) { worst = n; drop = i; }
    }
    if (drop < 0) {
      for (i = slot.list.length - 1; i >= 0; i--) {
        n = slot.skeletons[slot.list[i].skeleton];
        if (n > worst) { worst = n; drop = i; }
      }
    }
    if (drop < 0) drop = slot.list.length - 1;
    var gone = slot.list.splice(drop, 1)[0];
    slot.seen.delete(gone.canon);
    slot.skeletons[gone.skeleton]--;
    slot.walls[gone.wallPlan]--;
  }
}

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

/**
 * Measure every board of one plan.
 *
 * With no `sink` this is what the CLI does: each measured board is offered to
 * the shortlist above. A caller that wants the boards themselves — the fun
 * search does — passes `{ gate, emit }` instead, and gets exactly the same
 * enumeration with its own cheap gate and its own destination. The measurement
 * is untouched either way: same layouts, same backward BFS, same pars.
 */
function run(plan, sink) {
  var nPenguin = plan.penguins, nGray = plan.gray, k = nPenguin + nGray;
  var col = new Int8Array(k), i;
  for (i = 0; i < nPenguin; i++) col[i] = i + 1;
  for (i = nPenguin; i < k; i++) col[i] = GRAY;
  var solveAll = makeSolver(k);
  var POW = []; for (i = 0; i < k; i++) POW.push(Math.pow(BASE, i));

  var allCells = []; for (i = 0; i < NN; i++) allCells.push(i);
  var sets = combinations(allCells, plan.statics);
  var graphs = 0, boards = 0, maxSeen = 0;

  sets.forEach(function (set, setIndex) {
    if (checkpoint && Date.now() - lastCheckpoint > CHECKPOINT_MS) {
      lastCheckpoint = Date.now();
      checkpoint({
        size: N, penguins: nPenguin, drifters: nGray, statics: plan.statics,
        crackedIce: !!plan.hazards, longest: maxSeen, boards: boards,
        partial: setIndex + '/' + sets.length
      });
    }
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

      var layoutPlan = wallPlanFromMask(wallMask, hazMask);

      var free = [];
      for (var c = 0; c < NN; c++) {
        ctx.wall[c] = (wallMask >>> c) & 1;
        ctx.haz[c] = (hazMask >>> c) & 1;
        if (!ctx.wall[c] && !ctx.haz[c]) free.push(c);
      }

      var auroras = [];
      if (nPenguin === 1) free.forEach(function (g) { auroras.push([g]); });
      else for (var p = 0; p < free.length; p++)
        for (var q = p + 1; q < free.length; q++) auroras.push([free[p], free[q]]);

      auroras.forEach(function (gp) {
        ctx.gcol.fill(0);
        for (var g = 0; g < gp.length; g++) ctx.gcol[gp[g]] = g + 1;
        var dist = solveAll(ctx, col, nPenguin);
        graphs++;

        var open = free.filter(function (cell) { return gp.indexOf(cell) < 0; });
        (function place(depth, used, code) {
          if (depth === k) {
            var moves = dist[code];
            // A code past the end of dist means the tray size and the digit
            // base disagree — a silent mis-encoding that would otherwise ship
            // as a shortlist of undefined-length boards.
            if (moves === undefined) throw new Error('position ' + code +
              ' is outside a ' + N + 'x' + N + ' graph — size and base disagree');
            if (moves <= 0) return;
            boards++;
            if (moves > maxSeen) maxSeen = moves;
            if (moves < MINPAR) return;
            var slot = null;
            if (sink) {
              if (!sink.gate(moves, set.length, nGray, nPenguin, layoutPlan)) return;
            } else {
              slot = slotFor(moves);
              if (!worthBuilding(slot, set.length, nGray, nPenguin, layoutPlan)) return;
            }
            var blocks = [], t = code;
            for (var b = 0; b < k; b++) { blocks.push({ cell: t % BASE, colour: col[b] }); t = (t / BASE) | 0; }
            var rows = boardRows(wallMask, hazMask,
              gp.map(function (cell, idx) { return { cell: cell, colour: idx + 1 }; }), blocks);
            var entry = {
              moves: moves, statics: set.length, grays: nGray, penguins: nPenguin,
              walls: popcount(wallMask), hazards: popcount(hazMask),
              rows: rows, canon: canonBoard(rows), skeleton: skeleton(rows),
              wallPlan: wallPlan(rows)
            };
            if (sink) sink.emit(entry); else offer(slot, entry);
            return;
          }
          for (var idx = 0; idx < open.length; idx++) {
            var cell = open[idx];
            if (used & (1 << cell)) continue;
            place(depth + 1, used | (1 << cell), code + cell * POW[depth]);
          }
        })(0, 0, 0);
      });
    }
  });
  return { graphs: graphs, boards: boards, maxSeen: maxSeen };
}

// ---------------------------------------------------------------------------
// the command line
// ---------------------------------------------------------------------------
/* Everything below runs only when this file IS the program. Required as a
   module it is an enumeration library and nothing happens on load, which is
   how tools/fun-search.js reuses the exact same measurement. */
function main() {
  var argv = process.argv.slice(2);
  function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i < 0 ? dflt : argv[i + 1];
  }
  var flag = function (name) { return argv.indexOf('--' + name) >= 0; };
  if (arg('keep', null)) KEEP = Number(arg('keep'));
  if (arg('minpar', null)) MINPAR = Number(arg('minpar'));
  /* One side per run. Boards of different sizes live happily in one index — the
     keys are all derived from the board's own string — but the enumeration is
     sized once, up front. */
  setSize(Number(arg('size', 5)));

  var plans = [];
  var spec = arg('plans', null);
  if (spec !== null) {
    // --plans "" measures nothing: useful with --merge, to fold existing runs
    // together through the same shortlist rules.
    spec.split(';').filter(Boolean).forEach(function (part) {
      var v = part.split(',').map(Number);
      plans.push({ penguins: v[0], gray: v[1], statics: v[2], hazards: flag('hazards') });
    });
  } else {
    var maxStatics = Number(arg('statics', 2)), maxGray = Number(arg('gray', 1));
    for (var p = 1; p <= 2; p++) for (var g = 0; g <= maxGray; g++) for (var s = 0; s <= maxStatics; s++) {
      plans.push({ penguins: p, gray: g, statics: s, hazards: flag('hazards') });
    }
  }

  var covered = [];
  var merge = arg('merge', null);
  if (merge) {
    // fold existing runs back in, so several passes can be accumulated. Comma
    // separate them; they go through the same shortlist rules as a fresh search.
    merge.split(',').forEach(function (file) {
      var prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (prev.plans) covered = covered.concat(prev.plans);
      Object.keys(prev.pars || prev).forEach(function (m) {
        (prev.pars || prev)[m].forEach(function (e) {
          e.canon = e.canon || canonBoard(e.rows);
          e.skeleton = e.skeleton || skeleton(e.rows);
          e.wallPlan = e.wallPlan || wallPlan(e.rows);
          offer(slotFor(Number(m)), e);
        });
      });
    });
  }

  var out = arg('out', path.join(__dirname, 'level-index.json'));

  /* The index records exactly which corners of the space were measured, so a
     claim about "the longest board there is" can be checked rather than taken on
     trust. A pass still running is written with the fraction of layouts it had
     reached; a completed pass over the same corner replaces it. */
  function writeIndex(inProgress) {
    var cov = covered.concat(inProgress ? [inProgress] : []), keep = Object.create(null);
    cov.forEach(function (e) {
      var k = (e.size || 5) + ',' + e.penguins + ',' + e.drifters + ',' + e.statics +
              ',' + (e.crackedIce ? 1 : 0);
      var held = keep[k];
      if (!held || (held.partial && !e.partial) ||
          (!held.partial === !e.partial && e.boards > held.boards)) keep[k] = e;
    });
    cov = Object.keys(keep).map(function (k) { return keep[k]; });
    cov.sort(function (a, b) {
      return (a.size || 5) - (b.size || 5) || a.penguins - b.penguins ||
             a.drifters - b.drifters || a.statics - b.statics;
    });
    var pars = {};
    Array.from(best.keys()).sort(function (a, b) { return a - b; }).forEach(function (m) {
      pars[m] = best.get(m).list.map(function (e) {
        return {
          moves: e.moves, statics: e.statics, walls: e.walls, hazards: e.hazards,
          grays: e.grays, penguins: e.penguins, rows: e.rows
        };
      });
    });
    // written aside and renamed, so a run stopped mid-write leaves the previous
    // checkpoint intact rather than a half-written file
    fs.writeFileSync(out + '.tmp', JSON.stringify({ plans: cov, pars: pars }, null, 1));
    fs.renameSync(out + '.tmp', out);
    return Object.keys(pars).map(Number).sort(function (a, b) { return a - b; });
  }

  checkpoint = function (progress) {
    writeIndex(progress);
    console.log('  … ' + progress.partial + ' layouts, longest so far ' +
      progress.longest + ' — checkpointed to ' + out);
  };

  plans.forEach(function (plan) {
    var t0 = Date.now();
    var r = run(plan);
    console.log(N + 'x' + N + ' penguins=' + plan.penguins + ' drifters=' + plan.gray +
      ' statics=' + plan.statics + (plan.hazards ? ' +cracked-ice' : '') +
      '  graphs=' + r.graphs + ' boards=' + r.boards + ' longest=' + r.maxSeen +
      '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    covered.push({
      size: N, penguins: plan.penguins, drifters: plan.gray, statics: plan.statics,
      crackedIce: !!plan.hazards, longest: r.maxSeen, boards: r.boards
    });
    writeIndex();
  });

  var keys = writeIndex();
  console.log('wrote ' + out + ' — par ' + keys[0] + '…' + keys[keys.length - 1]);
}

if (require.main === module) main();

module.exports = {
  setSize: setSize, run: run, permsFor: permsFor,
  boardRows: boardRows, canonBoard: canonBoard, canonFlat: canonFlat,
  skeleton: skeleton, wallPlan: wallPlan, popcount: popcount,
  combinations: combinations,
  size: function () { return N; }
};
