'use strict';
/*
 * Exact position graphs for floe boards.
 *
 * A floe board is a rectangle of ice with cells missing. A missing cell is
 * open water: nothing stands on it, and a penguin gliding towards it stops at
 * the edge of the ice exactly as it stops at the rim of the board. For the
 * engine that is the old wall ('#'), so the rules are untouched; only the
 * picture changes.
 *
 * This file is a search accelerator. Every board it proposes is re-solved by
 * src/engine.js before it ships, and tools/floe-test.js compares every
 * transition here with the engine on thousands of positions.
 *
 * A position is one integer: a * B + b, where a and b are the cells of the A
 * and B penguins and the value n (= w*h) means "already home". A one-penguin
 * board simply keeps b = n for ever.
 */

var DIRS = ['U', 'R', 'D', 'L'];
var DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* Bits on every transition. A brake is counted only when it decided where the
   braked penguin finally stayed — stopping behind a partner that is then
   collected, and gliding on, is not a brake. */
var EV = {
  BRAKE_A: 1,      // A came to rest against B
  BRAKE_B: 2,      // B came to rest against A
  HOME_A: 4,       // A collected on this move
  HOME_B: 8,       // B collected on this move
  BRAKE_HOME_A: 16, // A collected because B stopped it on its aurora
  BRAKE_HOME_B: 32,
  CHAIN: 64        // a collection freed the other penguin, which glided on
};

function Floe(w, h, floor) {
  var n = w * h, c, d;
  this.w = w; this.h = h; this.n = n; this.B = n + 1;
  this.floor = floor;                       // Uint8Array(n), 1 = ice
  this.X = new Int8Array(n); this.Y = new Int8Array(n);
  for (c = 0; c < n; c++) { this.X[c] = c % w; this.Y[c] = (c / w) | 0; }
  // stop[c*4+d]: where a lone penguin on c ends up when gravity points d.
  this.stop = new Int16Array(n * 4).fill(-1);
  for (c = 0; c < n; c++) {
    if (!floor[c]) continue;
    for (d = 0; d < 4; d++) {
      var x = c % w, y = (c / w) | 0, dx = DV[d][0], dy = DV[d][1];
      while (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && floor[(y + dy) * w + x + dx]) {
        x += dx; y += dy;
      }
      this.stop[c * 4 + d] = y * w + x;
    }
  }
  this.cells = [];
  for (c = 0; c < n; c++) if (floor[c]) this.cells.push(c);
}

/* Is `other` on the stretch of ice `c` would glide over towards `end`? */
Floe.prototype.ahead = function (c, other, end, d) {
  var X = this.X, Y = this.Y;
  if (d === 0) return X[other] === X[c] && Y[other] < Y[c] && Y[other] >= Y[end];
  if (d === 2) return X[other] === X[c] && Y[other] > Y[c] && Y[other] <= Y[end];
  if (d === 1) return Y[other] === Y[c] && X[other] > X[c] && X[other] <= X[end];
  return Y[other] === Y[c] && X[other] < X[c] && X[other] >= X[end];
};

/* The cell one step back against gravity. */
Floe.prototype.behind = function (c, d) {
  return c - DV[d][0] - DV[d][1] * this.w;
};

/**
 * One swipe from (a, b). Returns the new position id; the event bits are left
 * in this.lastEvents. Mirrors engine.simulate: settle, resolve, and settle
 * again when a collection freed space.
 */
Floe.prototype.tilt = function (a, b, d, gA, gB) {
  var n = this.n, ev = 0, ea, eb, brakeA = false, brakeB = false;
  if (a !== n && b !== n) {
    ea = this.stop[a * 4 + d]; eb = this.stop[b * 4 + d];
    if (this.ahead(a, b, ea, d)) { b = eb; a = this.behind(eb, d); brakeA = true; }
    else if (this.ahead(b, a, eb, d)) { a = ea; b = this.behind(ea, d); brakeB = true; }
    else { a = ea; b = eb; }
  } else if (a !== n) a = this.stop[a * 4 + d];
  else if (b !== n) b = this.stop[b * 4 + d];

  var homeA = a !== n && a === gA, homeB = b !== n && b === gB;
  if (homeA) { ev |= EV.HOME_A; if (brakeA) ev |= EV.BRAKE_HOME_A; }
  if (homeB) { ev |= EV.HOME_B; if (brakeB) ev |= EV.BRAKE_HOME_B; }
  if (brakeA && (homeA || !homeB)) ev |= EV.BRAKE_A;
  if (brakeB && (homeB || !homeA)) ev |= EV.BRAKE_B;
  if (homeA) a = n;
  if (homeB) b = n;
  if (homeA !== homeB) {
    // The survivor lost what was holding it, if anything was, and glides on.
    if (a !== n) {
      var a2 = this.stop[a * 4 + d];
      if (a2 !== a) ev |= EV.CHAIN;
      a = a2; if (a === gA) { a = n; ev |= EV.HOME_A; }
    } else if (b !== n) {
      var b2 = this.stop[b * 4 + d];
      if (b2 !== b) ev |= EV.CHAIN;
      b = b2; if (b === gB) { b = n; ev |= EV.HOME_B; }
    }
  }
  this.lastEvents = ev;
  return a * this.B + b;
};

/**
 * The complete position graph for one pair of auroras (gB = -1 for a single
 * penguin). Every legal position is a node, not only those reachable from
 * one start, so a single build answers every start on this layout.
 */
Floe.prototype.graph = function (gA, gB) {
  var n = this.n, B = this.B, total = B * B, cells = this.cells;
  var valid = new Uint8Array(total);
  var next = new Int32Array(total * 4).fill(-1);
  var ev = new Uint8Array(total * 4);
  var aList = cells.filter(function (c) { return c !== gA; }).concat([n]);
  var bList = gB < 0 ? [n] : cells.filter(function (c) { return c !== gB; }).concat([n]);
  var ids = [], i, j, d;
  for (i = 0; i < aList.length; i++) for (j = 0; j < bList.length; j++) {
    var a = aList[i], b = bList[j];
    if (a === b && a !== n) continue;
    var id = a * B + b;
    valid[id] = 1; ids.push(id);
  }
  var clearId = n * B + n;
  for (i = 0; i < ids.length; i++) {
    var s = ids[i];
    if (s === clearId) continue;
    var sa = (s / B) | 0, sb = s % B;
    for (d = 0; d < 4; d++) {
      var t = this.tilt(sa, sb, d, gA, gB);
      if (t === s) continue;
      next[s * 4 + d] = t; ev[s * 4 + d] = this.lastEvents;
    }
  }
  // Reverse adjacency, built once and shared by every backward search.
  var inHead = new Int32Array(total).fill(-1), inFrom = new Int32Array(ids.length * 4);
  var inLink = new Int32Array(ids.length * 4), inEdge = new Int32Array(ids.length * 4), m = 0;
  for (i = 0; i < ids.length; i++) {
    s = ids[i];
    for (d = 0; d < 4; d++) {
      var tt = next[s * 4 + d];
      if (tt < 0) continue;
      inFrom[m] = s; inEdge[m] = s * 4 + d; inLink[m] = inHead[tt]; inHead[tt] = m++;
    }
  }
  var g = {
    floe: this, gA: gA, gB: gB, n: n, B: B, total: total, ids: ids, valid: valid,
    next: next, ev: ev, clearId: clearId,
    inHead: inHead, inFrom: inFrom, inLink: inLink, inEdge: inEdge
  };
  g.dist = backward(g, 0);
  return g;
};

/* Moves to clear from every position, using only edges whose event bits avoid
   `forbid`. -1 means it cannot be done that way. */
function backward(g, forbid) {
  var dist = new Int16Array(g.total).fill(-1), queue = new Int32Array(g.total);
  var r = 0, wr = 0;
  dist[g.clearId] = 0; queue[wr++] = g.clearId;
  while (r < wr) {
    var s = queue[r++];
    for (var e = g.inHead[s]; e >= 0; e = g.inLink[e]) {
      if (forbid && (g.ev[g.inEdge[e]] & forbid)) continue;
      var p = g.inFrom[e];
      if (dist[p] < 0) { dist[p] = dist[s] + 1; queue[wr++] = p; }
    }
  }
  return dist;
}

/* Fewest moves on which a partner has to act as the brake, over every
   solution (0-1 BFS backwards). */
function fewestBrakes(g) {
  var BR = EV.BRAKE_A | EV.BRAKE_B;
  var best = new Int16Array(g.total).fill(-1), deque = new Int32Array(g.total * 8);
  var head = g.total * 4, tail = head;
  best[g.clearId] = 0; deque[tail++] = g.clearId;
  var done = new Uint8Array(g.total);
  while (head < tail) {
    var s = deque[head++];
    if (done[s]) continue; done[s] = 1;
    for (var e = g.inHead[s]; e >= 0; e = g.inLink[e]) {
      var p = g.inFrom[e], w = (g.ev[g.inEdge[e]] & BR) ? 1 : 0, v = best[s] + w;
      if (best[p] < 0 || v < best[p]) {
        best[p] = v;
        if (w) deque[tail++] = p; else deque[--head] = p;
      }
    }
  }
  return best;
}

/* Collected penguins in a position. */
function homeCount(g, s) {
  return (((s / g.B) | 0) === g.n ? 1 : 0) + (s % g.B === g.n ? 1 : 0);
}

/*
 * A board is fair when no ordinary move — one that collects nobody — can turn
 * a solvable position into an unsolvable one. Collecting a penguin too early
 * may still strand its partner; that is the one mistake the board may punish,
 * and the game's recovery button exists for it. unfair[s] = 1 when such a
 * move can be reached from s.
 */
function unfairFrom(g) {
  var unfair = new Uint8Array(g.total), queue = new Int32Array(g.total), r = 0, wr = 0, i, d;
  for (i = 0; i < g.ids.length; i++) {
    var s = g.ids[i];
    if (g.dist[s] <= 0) continue;
    for (d = 0; d < 4; d++) {
      var t = g.next[s * 4 + d];
      if (t >= 0 && g.dist[t] < 0 && homeCount(g, s) === homeCount(g, t)) {
        unfair[s] = 1; queue[wr++] = s; break;
      }
    }
  }
  while (r < wr) {
    var q = queue[r++];
    for (var e = g.inHead[q]; e >= 0; e = g.inLink[e]) {
      var p = g.inFrom[e];
      if (g.dist[p] >= 0 && !unfair[p]) { unfair[p] = 1; queue[wr++] = p; }
    }
  }
  return unfair;
}

/* Board text in the engine's vocabulary. */
function boardRows(floe, gA, gB, a, b) {
  var rows = [];
  for (var y = 0; y < floe.h; y++) {
    var row = '';
    for (var x = 0; x < floe.w; x++) {
      var c = y * floe.w + x;
      row += !floe.floor[c] ? '#' : c === a ? 'A' : c === b ? 'B' : c === gA ? 'a' : c === gB ? 'b' : '.';
    }
    rows.push(row);
  }
  return rows;
}

/* Read engine-vocabulary rows back into a floe, auroras and starts. */
function parseRows(rows) {
  var h = rows.length, w = rows[0].length, floor = new Uint8Array(w * h);
  var out = { gA: -1, gB: -1, a: w * h, b: w * h };
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var ch = rows[y][x], c = y * w + x;
    if (ch !== '#') floor[c] = 1;
    if (ch === 'a') out.gA = c; else if (ch === 'b') out.gB = c;
    else if (ch === 'A') out.a = c; else if (ch === 'B') out.b = c;
  }
  out.floe = new Floe(w, h, floor);
  return out;
}

/* The eight symmetries of a square board, as cell maps. */
function squareSymmetries(w) {
  var maps = [];
  for (var s = 0; s < 8; s++) {
    var m = new Int16Array(w * w);
    for (var c = 0; c < w * w; c++) {
      var x = c % w, y = (c / w) | 0, t;
      if (s & 1) x = w - 1 - x;
      if (s & 2) y = w - 1 - y;
      if (s & 4) { t = x; x = y; y = t; }
      m[c] = y * w + x;
    }
    maps.push(m);
  }
  return maps;
}

/* Smallest text of a board over the square's symmetries and the colour swap,
   so one puzzle is never shipped twice in a mirror. */
function canonicalKey(rows) {
  var w = rows[0].length, h = rows.length, flat = rows.join('');
  var maps = w === h ? squareSymmetries(w) : [null], best = null;
  var swap = { A: 'B', B: 'A', a: 'b', b: 'a' };
  for (var s = 0; s < maps.length; s++) for (var k = 0; k < 2; k++) {
    var out = new Array(w * h);
    for (var c = 0; c < w * h; c++) {
      var ch = flat[c];
      if (k && swap[ch]) ch = swap[ch];
      out[maps[s] ? maps[s][c] : c] = ch;
    }
    var key = out.join('');
    if (best === null || key < best) best = key;
  }
  return best;
}

/* One edge-connected piece of ice that still spans the full rectangle. */
function isWholeFloe(w, h, floor) {
  var n = w * h, first = -1, count = 0, c, x, y;
  for (c = 0; c < n; c++) if (floor[c]) { count++; if (first < 0) first = c; }
  if (first < 0) return false;
  for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) row |= floor[y * w + x]; if (!row) return false; }
  for (x = 0; x < w; x++) { var col = 0; for (y = 0; y < h; y++) col |= floor[y * w + x]; if (!col) return false; }
  var seen = new Uint8Array(n), stack = [first], reached = 0;
  seen[first] = 1;
  while (stack.length) {
    c = stack.pop(); reached++;
    x = c % w; y = (c / w) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = x + DV[d][0], ny = y + DV[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      var j = ny * w + nx;
      if (floor[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  return reached === count;
}

module.exports = {
  DIRS: DIRS, DV: DV, EV: EV, Floe: Floe,
  backward: backward, fewestBrakes: fewestBrakes, unfairFrom: unfairFrom, homeCount: homeCount,
  boardRows: boardRows, parseRows: parseRows, canonicalKey: canonicalKey,
  squareSymmetries: squareSymmetries, isWholeFloe: isWholeFloe
};
