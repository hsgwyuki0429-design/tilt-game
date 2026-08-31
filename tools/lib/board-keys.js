'use strict';
/*
 * TILT — board identity, in one place.
 *
 * Three tools already agreed on what makes two boards "the same board", and
 * they each carried their own copy of the answer: tools/level-search.js,
 * tools/build-stages.js and tools/test.js. The fun search needs the same
 * answers and there was no reason for a fourth copy, so the new code shares
 * this module. The existing three are untouched — they are load-bearing and
 * their copies are correct — and every key here is defined to agree with them.
 *
 * A board is a square grid of characters:
 *
 *     '.'  floor   '#'  wall   'x'  cracked ice
 *     'a'  aurora A      'A'  penguin A
 *     'b'  aurora B      'B'  penguin B
 *     'G'  drifter
 *
 * Four keys, coarsest last:
 *
 *   canonBoard    the whole board, up to the square's eight symmetries and
 *                 renaming the two penguin colours. Two boards with the same
 *                 key are the same puzzle presented differently.
 *   skeletonKey   the same, with every movable piece lifted off: the room.
 *   plainWallKey  coarser still — only the immovable blocks, no colour.
 *   positionKey   a POSITION expressed as a board: what a mid-game arrangement
 *                 would look like if it were somebody's opening screen.
 */

var permCache = Object.create(null);

/** The eight symmetries of a square of side n, as cell permutations. */
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

/* The side comes from the string rather than from a constant: an index holds
   boards of more than one size, and a key that assumed 5×5 would read a 4×4 as
   a short one. */
function sideOf(flat) { return Math.round(Math.sqrt(flat.length)); }

var SWAP = { '.': '.', '#': '#', 'x': 'x', 'G': 'G', 'A': 'B', 'B': 'A', 'a': 'b', 'b': 'a' };

function swapColours(flat) {
  return flat.split('').map(function (ch) { return SWAP[ch] || ch; }).join('');
}

/** Smallest of the eight symmetry images. Colour plays no part. */
function symmetryKey(flat) {
  var perms = permsFor(sideOf(flat)), best = null;
  for (var i = 0; i < 8; i++) {
    var p = perms[i], out = new Array(flat.length);
    for (var c = 0; c < flat.length; c++) out[p[c]] = flat[c];
    var t = out.join('');
    if (best === null || t < best) best = t;
  }
  return best;
}

/** Smallest of the eight symmetries × two colour namings. */
function canonFlat(flat) {
  var a = symmetryKey(flat), b = symmetryKey(swapColours(flat));
  return a < b ? a : b;
}

function rowsToFlat(rows) { return rows.join(''); }
function flatToRows(flat) {
  var n = sideOf(flat), rows = [];
  for (var y = 0; y < n; y++) rows.push(flat.slice(y * n, y * n + n));
  return rows;
}

/** The board's identity. */
function canonBoard(rows) { return canonFlat(rowsToFlat(rows)); }

/** The room: walls, cracked ice and auroras, with the pieces lifted off. */
function skeletonKey(rows) {
  return canonFlat(rowsToFlat(rows).replace(/[ABG]/g, '.'));
}

/** Coarser still: the immovable blocks alone. */
function plainWallKey(rows) {
  return symmetryKey(rowsToFlat(rows).replace(/[^#x]/g, '.'));
}

/**
 * Re-present a board under one of its sixteen symmetries.
 *
 * Variant 0–7 are the rotations and reflections; adding 8 also swaps the two
 * penguin colours. Same puzzle, different picture — used by the tests to prove
 * the analysis does not depend on which way up a board was enumerated.
 */
function present(rows, variant) {
  var flat = rowsToFlat(rows);
  if (variant & 8) flat = swapColours(flat);
  var n = sideOf(flat);
  var p = permsFor(n)[variant & 7], out = new Array(flat.length);
  for (var c = 0; c < flat.length; c++) out[p[c]] = flat[c];
  return flatToRows(out.join(''));
}

/**
 * A position, written as the board it would be if it were an opening.
 *
 * Returns null when the position could not be somebody's opening screen —
 * something has been collected or lost, or a block is standing on an aurora —
 * which are exactly the positions no stage could begin from. This is the key
 * tools/build-stages.js and tools/test.js use to refuse a stage that is
 * another stage's leftovers, and the fun search reuses it to flag a candidate
 * that the shipped campaign already walks through.
 */
function positionKey(E, stage, st) {
  if (st.collected || (st.lost || 0)) return null;
  var cells = new Array(stage.w * stage.h), c, i;
  for (c = 0; c < cells.length; c++) {
    cells[c] = stage.terrain[c] === E.WALL ? '#'
      : stage.terrain[c] === E.HAZARD ? 'x'
      : stage.goal[c] ? (stage.goalColour[c] === 1 ? 'a' : 'b') : '.';
  }
  for (i = 0; i < st.pos.length; i++) {
    if (!st.alive[i]) return null;
    c = st.pos[i][1] * stage.w + st.pos[i][0];
    if (cells[c] !== '.') return null;              // on an aurora: not an opening
    cells[c] = stage.colour[i] === 1 ? 'A' : stage.colour[i] === 2 ? 'B' : 'G';
  }
  return canonFlat(cells.join(''));
}

module.exports = {
  permsFor: permsFor,
  sideOf: sideOf,
  SWAP: SWAP,
  swapColours: swapColours,
  symmetryKey: symmetryKey,
  canonFlat: canonFlat,
  canonBoard: canonBoard,
  skeletonKey: skeletonKey,
  plainWallKey: plainWallKey,
  present: present,
  positionKey: positionKey,
  rowsToFlat: rowsToFlat,
  flatToRows: flatToRows
};
