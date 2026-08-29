'use strict';
/*
 * TILT — exhaustive 5×5 level search.
 *
 *   node tools/level-search.js --plans "2,1,1;2,0,2" --out tools/level-index.json
 *   node tools/level-search.js --statics 2 --gray 1 --hazards
 *
 * The campaign wants a board of an EXACT length, over and over, a hundred
 * times. That is a different question from "find me a good board", and it is
 * answered by enumeration rather than by search: inside the budget it is given
 * this tool measures every 5×5 board that satisfies the campaign's rules —
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
// the eight symmetries of the square
// ---------------------------------------------------------------------------
var PERMS = (function () {
  var fns = [
    function (x, y) { return [x, y]; }, function (x, y) { return [4 - x, y]; },
    function (x, y) { return [x, 4 - y]; }, function (x, y) { return [4 - x, 4 - y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [4 - y, x]; },
    function (x, y) { return [y, 4 - x]; }, function (x, y) { return [4 - y, 4 - x]; }
  ];
  return fns.map(function (f) {
    var p = new Int8Array(25);
    for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++) {
      var r = f(x, y); p[y * 5 + x] = r[1] * 5 + r[0];
    }
    return p;
  });
})();

function permMask(mask, p) {
  var m = 0;
  for (var c = 0; c < 25; c++) if ((mask >>> c) & 1) m |= 1 << p[c];
  return m;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------
var occ = new Int8Array(25);
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
      var lv = (pos[v] % 5) * dx + ((pos[v] / 5) | 0) * dy;
      var b = a - 1;
      while (b >= 0) {
        var u = order[b];
        if ((pos[u] % 5) * dx + ((pos[u] / 5) | 0) * dy >= lv) break;
        order[b + 1] = u; b--;
      }
      order[b + 1] = v;
    }
    for (var q = 0; q < live; q++) {
      i = order[q];
      var c = pos[i], x = c % 5, y = (c / 5) | 0;
      for (;;) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 4 || ny > 4) break;
        var nc = ny * 5 + nx;
        if (wall[nc] || occ[nc] !== -1) break;
        x = nx; y = ny;
      }
      var end = y * 5 + x;
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
// A position is k base-26 digits, one per block: 0..24 a cell, 25 collected.
function makeSolver(k) {
  var n = Math.pow(26, k);
  var dist = new Int16Array(n);
  var next = new Int32Array(n * 4);
  var deg = new Int32Array(n + 1);
  var radj = new Int32Array(n * 4);
  var queue = new Int32Array(n);
  var cursor = new Int32Array(n);
  var digits = new Int8Array(k);
  var work = new Int8Array(k);
  var POW = [];
  for (var i = 0, p = 1; i < k; i++, p *= 26) POW.push(p);

  return function solveAll(ctx, col, nPenguin) {
    dist.fill(-1);
    next.fill(-2);                                   // -2 illegal, -1 no edge
    var wall = ctx.wall, haz = ctx.haz, gcol = ctx.gcol;
    var s, d, j;

    for (s = 0; s < n; s++) {
      var ok = true, collected = 0, seen = 0, t = s;
      for (j = 0; j < k; j++) { digits[j] = t % 26; t = (t / 26) | 0; }
      for (j = 0; j < k; j++) {
        var val = digits[j];
        if (val === 25) {
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
        for (j = 0; j < k; j++) work[j] = digits[j] === 25 ? -1 : digits[j];
        if (tilt(ctx, col, k, work, d) <= 0) { next[base + d] = -1; continue; }
        var ns = 0;
        for (j = 0; j < k; j++) ns += (work[j] < 0 ? 25 : work[j]) * POW[j];
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
  var cells = new Array(25);
  for (var c = 0; c < 25; c++) {
    cells[c] = ((wallMask >>> c) & 1) ? '#' : (((hazMask >>> c) & 1) ? 'x' : '.');
  }
  goals.forEach(function (g) { cells[g.cell] = g.colour === 1 ? 'a' : 'b'; });
  blocks.forEach(function (b) {
    cells[b.cell] = b.colour === 1 ? 'A' : (b.colour === 2 ? 'B' : 'G');
  });
  var rows = [];
  for (var y = 0; y < 5; y++) rows.push(cells.slice(y * 5, y * 5 + 5).join(''));
  return rows;
}

var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

/** The board's identity: smallest of its 8 symmetries × 2 colour namings. */
function canonBoard(rows) {
  var flat = rows.join(''), best = null;
  for (var swap = 0; swap < 2; swap++) {
    var src = swap ? flat.split('').map(function (ch) { return SWAP[ch]; }).join('') : flat;
    for (var i = 0; i < 8; i++) {
      var p = PERMS[i], out = new Array(25);
      for (var c = 0; c < 25; c++) out[p[c]] = src[c];
      var s = out.join('');
      if (best === null || s < best) best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// the shortlist
// ---------------------------------------------------------------------------
var KEEP = 12;
var best = new Map();                              // par -> { list, seen }

function better(a, b) {
  if (a.statics !== b.statics) return a.statics - b.statics;
  if (a.grays !== b.grays) return a.grays - b.grays;
  if (a.penguins !== b.penguins) return a.penguins - b.penguins;
  return a.canon < b.canon ? -1 : (a.canon > b.canon ? 1 : 0);
}
function slotFor(moves) {
  var slot = best.get(moves);
  if (!slot) { slot = { list: [], seen: new Set() }; best.set(moves, slot); }
  return slot;
}
/* The cheap gate. Most candidates lose on obstacle count alone, and building a
   board plus its sixteen symmetry images is by far the expensive part. */
function worthBuilding(slot, statics, grays, penguins) {
  if (slot.list.length < KEEP) return true;
  var tail = slot.list[slot.list.length - 1];
  if (statics !== tail.statics) return statics < tail.statics;
  if (grays !== tail.grays) return grays < tail.grays;
  if (penguins !== tail.penguins) return penguins < tail.penguins;
  return true;
}
function offer(slot, entry) {
  if (slot.seen.has(entry.canon)) return;
  if (slot.list.length >= KEEP && better(entry, slot.list[slot.list.length - 1]) >= 0) return;
  slot.seen.add(entry.canon);
  slot.list.push(entry);
  slot.list.sort(better);
  while (slot.list.length > KEEP) slot.seen.delete(slot.list.pop().canon);
}

// ---------------------------------------------------------------------------
// enumeration
// ---------------------------------------------------------------------------
var ctx = { wall: new Uint8Array(25), haz: new Uint8Array(25), gcol: new Int8Array(25) };

function combinations(list, n) {
  var out = [], pick = new Array(n);
  (function rec(start, depth) {
    if (depth === n) { out.push(pick.slice()); return; }
    for (var i = start; i < list.length; i++) { pick[depth] = list[i]; rec(i + 1, depth + 1); }
  })(0, 0);
  return out;
}
function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }

function run(plan) {
  var nPenguin = plan.penguins, nGray = plan.gray, k = nPenguin + nGray;
  var col = new Int8Array(k), i;
  for (i = 0; i < nPenguin; i++) col[i] = i + 1;
  for (i = nPenguin; i < k; i++) col[i] = GRAY;
  var solveAll = makeSolver(k);
  var POW = []; for (i = 0; i < k; i++) POW.push(Math.pow(26, i));

  var allCells = []; for (i = 0; i < 25; i++) allCells.push(i);
  var sets = combinations(allCells, plan.statics);
  var graphs = 0, boards = 0, maxSeen = 0;

  sets.forEach(function (set) {
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

      var free = [];
      for (var c = 0; c < 25; c++) {
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
            if (moves <= 0) return;
            boards++;
            if (moves > maxSeen) maxSeen = moves;
            var slot = slotFor(moves);
            if (!worthBuilding(slot, set.length, nGray, nPenguin)) return;
            var blocks = [], t = code;
            for (var b = 0; b < k; b++) { blocks.push({ cell: t % 26, colour: col[b] }); t = (t / 26) | 0; }
            var rows = boardRows(wallMask, hazMask,
              gp.map(function (cell, idx) { return { cell: cell, colour: idx + 1 }; }), blocks);
            offer(slot, {
              moves: moves, statics: set.length, grays: nGray, penguins: nPenguin,
              walls: popcount(wallMask), hazards: popcount(hazMask),
              rows: rows, canon: canonBoard(rows)
            });
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
var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf('--' + name);
  return i < 0 ? dflt : argv[i + 1];
}
var flag = function (name) { return argv.indexOf('--' + name) >= 0; };

var plans = [];
var spec = arg('plans', null);
if (spec) {
  spec.split(';').forEach(function (part) {
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
  // fold an existing index back in, so several runs can be accumulated
  var prev = JSON.parse(fs.readFileSync(merge, 'utf8'));
  if (prev.plans) covered = prev.plans.slice();
  Object.keys(prev.pars || prev).forEach(function (m) {
    var list = (prev.pars || prev)[m];
    list.forEach(function (e) {
      e.canon = e.canon || canonBoard(e.rows);
      offer(slotFor(Number(m)), e);
    });
  });
}

plans.forEach(function (plan) {
  var t0 = Date.now();
  var r = run(plan);
  console.log('penguins=' + plan.penguins + ' drifters=' + plan.gray +
    ' statics=' + plan.statics + (plan.hazards ? ' +cracked-ice' : '') +
    '  graphs=' + r.graphs + ' boards=' + r.boards + ' longest=' + r.maxSeen +
    '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  // The index records exactly which corners of the space were measured, so a
  // claim about "the longest board there is" can be checked rather than taken
  // on trust.
  covered.push({
    penguins: plan.penguins, drifters: plan.gray, statics: plan.statics,
    crackedIce: !!plan.hazards, longest: r.maxSeen, boards: r.boards
  });
});

var out = arg('out', path.join(__dirname, 'level-index.json'));
var pars = {};
Array.from(best.keys()).sort(function (a, b) { return a - b; }).forEach(function (m) {
  pars[m] = best.get(m).list.map(function (e) {
    return {
      moves: e.moves, statics: e.statics, walls: e.walls, hazards: e.hazards,
      grays: e.grays, penguins: e.penguins, rows: e.rows
    };
  });
});
covered.sort(function (a, b) {
  return a.penguins - b.penguins || a.drifters - b.drifters || a.statics - b.statics;
});
fs.writeFileSync(out, JSON.stringify({ plans: covered, pars: pars }, null, 1));
var keys = Object.keys(pars).map(Number).sort(function (a, b) { return a - b; });
console.log('wrote ' + out + ' — par ' + keys[0] + '…' + keys[keys.length - 1]);
