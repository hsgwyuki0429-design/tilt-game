'use strict';
/*
 * The two small per-stage textures the ice shader reads, without a GPU: the
 * cell map and the signed-distance field of the floe. The shader trusts both
 * completely, so they are checked against the plain geometry they describe.
 */
var assert = require('assert');
globalThis.TiltEngine = require('../src/engine.js');
var E = globalThis.TiltEngine;
require('../src/ice.js');
var Ice = globalThis.TiltIce;

// A 4×4 floe: one hole at the top right, one in the middle, a cracked cell.
var stage = E.compile({ id: 'ice', board: ['A..#', '.#..', '..xb', 'aB..'] });

// ── the cell map ─────────────────────────────────────────────────────────────
var cells = Ice.cellData(stage);
assert.strictEqual(cells.length, 4 * 4 * 4, 'RGBA per cell');
for (var i = 0; i < 16; i++) {
  var wall = stage.terrain[i] === E.WALL, crack = stage.terrain[i] === E.HAZARD;
  assert.strictEqual(cells[i * 4], wall ? 0 : 255, 'cell ' + i + ': ice or water');
  assert.strictEqual(cells[i * 4 + 1], crack ? 255 : 0, 'cell ' + i + ': cracked or not');
  assert.strictEqual(cells[i * 4 + 3], 255);
}
var tints = {};
for (i = 0; i < 16; i++) tints[cells[i * 4 + 2]] = 1;
assert(Object.keys(tints).length >= 12, 'every cell gets its own tint');
assert.deepStrictEqual(Array.from(Ice.cellData(stage)), Array.from(cells), 'deterministic');

// ── the distance field ───────────────────────────────────────────────────────
var f = Ice.sdfData(stage), M = Ice.MARGIN, S = Ice.SDF_RES, R = Ice.SDF_RANGE, INSET = Ice.INSET;
assert.strictEqual(f.w, Math.round((4 + 2 * M) * S));
assert.strictEqual(f.h, Math.round((4 + 2 * M) * S));
assert.strictEqual(f.data.length, f.w * f.h);
assert.deepStrictEqual(f.rect, [-4 / 2 - M, -4 / 2 - M, 4 + 2 * M, 4 + 2 * M], 'covers the board plus the margin, in floe space');

// Decode the nearest texel to a point given in board cells (0..4).
function sd(x, y) {
  var i = Math.min(f.w - 1, Math.max(0, Math.floor((x + M) * S))), j = Math.min(f.h - 1, Math.max(0, Math.floor((y + M) * S)));
  return f.data[j * f.w + i] / 255 * 2 * R - R;
}
var tol = 1 / S + 0.01;   // one texel, plus the 8-bit step

// Inside the ice it is the distance to the nearest edge, less the wall's inset.
assert(Math.abs(sd(0.5, 0.5) - (0.5 - INSET)) < tol, 'corner cell: half a cell from the rim: ' + sd(0.5, 0.5));
assert(Math.abs(sd(1.5, 3.5) - (0.5 - INSET)) < tol, 'next to the bottom rim');
// In a hole it is minus the distance to the nearest ice.
assert(Math.abs(sd(3.5, 0.5) - (-0.5 - INSET)) < tol, 'the corner hole: ' + sd(3.5, 0.5));
assert(Math.abs(sd(1.5, 1.5) - (-0.5 - INSET)) < tol, 'the middle hole: ' + sd(1.5, 1.5));
// Outside the board, in the water.
assert(Math.abs(sd(-1.0, 1.5) - (-1.0 - INSET)) < tol, 'a cell out from the rim: ' + sd(-1.0, 1.5));
// It crosses zero at the wall, which stands INSET inside the cell edge.
assert(Math.abs(sd(3 - INSET, 0.5)) < tol, 'zero at the wall of the corner hole: ' + sd(3 - INSET, 0.5));
assert(Math.abs(sd(1 - INSET, 1.5)) < tol, 'zero at the wall of the middle hole: ' + sd(1 - INSET, 1.5));
// Signed: ice positive, water negative, everywhere it is checked.
[[0.5, 0.5], [2.5, 0.5], [0.5, 2.5], [3.5, 3.5], [2.5, 2.5]].forEach(function (p) {
  var t = stage.terrain[Math.floor(p[1]) * 4 + Math.floor(p[0])];
  assert(t === E.WALL ? sd(p[0], p[1]) < 0 : sd(p[0], p[1]) > 0, 'sign at ' + p);
});
[[-1, -1], [5, 2], [2, 5], [4.5, 4.5]].forEach(function (p) { assert(sd(p[0], p[1]) < 0, 'water at ' + p); });
// Far outside it saturates rather than wrapping.
assert(sd(-M + 0.05, -M + 0.05) <= -R + 2 * R / 255 + 0.001 || sd(-M + 0.05, -M + 0.05) < -1.0, 'saturates at the edge of the range');
// The field is continuous: neighbouring texels differ by at most a texel.
var worst = 0;
for (var j = 0; j < f.h; j++) for (i = 1; i < f.w; i++) {
  worst = Math.max(worst, Math.abs(f.data[j * f.w + i] - f.data[j * f.w + i - 1]));
}
assert(worst <= Math.ceil(255 / (2 * R) / S) + 2, 'a 1-Lipschitz field changes by at most a texel step: ' + worst);

// A different board gets a different field of the right size.
var g = Ice.sdfData(E.compile({ id: 'w5', board: ['A...a', '.....', '.....', 'B...b'] }));
assert.strictEqual(g.w, Math.round((5 + 2 * M) * S));
assert.strictEqual(g.h, Math.round((4 + 2 * M) * S));

console.log('PASS: ice cell map and floe distance field match the geometry (' + f.w + '×' + f.h + ' texels)');
