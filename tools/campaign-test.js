'use strict';
/*
 * The shipped floe campaign is what tools/floe-selection.json says it is, and
 * what the README promises: every board re-proved by the engine itself.
 */
const assert = require('assert');
const E = require('../src/engine');
const F = require('./lib/floe');
const { STAGES, CHAPTERS } = require('../src/stages');
const selection = require('./floe-selection.json');

assert.strictEqual(STAGES.length, 100);
assert.strictEqual(CHAPTERS.length, 10);
assert.strictEqual(selection.stages.length, 100);

const boards = new Set(), shapes = new Set(), pieces = new Set();
let examined = 0, ordinary = 0, collectionTraps = 0, mutual = 0, touching = 0;
STAGES.forEach((def, i) => {
  const st = E.compile(def), where = 'stage ' + def.id, pick = selection.stages[i];
  assert.strictEqual(def.id, i + 1);
  assert.deepStrictEqual(def.board, pick.board, where + ': stages.js matches the selection');
  assert(st.w === 4 && st.h === 4, where + ': every board is 4×4');
  assert.strictEqual(st.penguins, i < 3 ? 1 : 2, where + ': three solo boards, then pairs');
  assert.strictEqual(st.drifters, 0, where + ': no drifters');
  assert(!def.board.join('').match(/[^.#ABab]/), where + ': only ice, water, penguins and auroras');

  // One floe: the ice is a single piece spanning the full 4×4, centred.
  const floor = new Uint8Array(16);
  def.board.join('').split('').forEach((ch, c) => { floor[c] = ch === '#' ? 0 : 1; });
  assert(F.isWholeFloe(4, 4, floor), where + ': one connected floe spanning the board');
  let sx = 0, sy = 0, n = 0;
  floor.forEach((v, c) => { if (v) { sx += c % 4; sy += c >> 2; n++; } });
  assert(Math.hypot(sx / n - 1.5, sy / n - 1.5) <= 0.5 + 1e-9, where + ': the floe is balanced');

  // Distinct under the square's symmetries and the colour swap — the board,
  // the shape of the ice, and the placement of the pieces.
  const key = F.canonicalKey(def.board);
  const shape = F.canonicalKey(def.board.map(r => r.replace(/[^#]/g, '.')));
  const piece = F.canonicalKey(def.board.map(r => r.replace(/#/g, '.')));
  assert(!boards.has(key) && !shapes.has(shape) && !pieces.has(piece), where + ': distinct board, floe and piece layout');
  boards.add(key); shapes.add(shape); pieces.add(piece);

  // The engine's own shortest solution.
  assert.strictEqual(E.solve(st).moves, def.par, where + ': exact shortest path');

  // Fairness over the complete reachable graph, in the engine.
  const g = E.graph(st);
  examined += g.n;
  const toWin = new Array(g.n).fill(Infinity), rev = Array.from({ length: g.n }, () => []);
  for (let at = 0; at < g.n; at++) for (const nx of g.next[at]) if (nx !== at) rev[nx].push(at);
  const queue = [];
  for (let at = 0; at < g.n; at++) if (g.clear[at]) { toWin[at] = 0; queue.push(at); }
  for (let q = 0; q < queue.length; q++) for (const p of rev[queue[q]]) {
    if (toWin[p] === Infinity) { toWin[p] = toWin[queue[q]] + 1; queue.push(p); }
  }
  assert.strictEqual(toWin[0], def.par, where + ': graph agrees with the solver');
  for (let at = 0; at < g.n; at++) if (Number.isFinite(toWin[at])) for (const nx of g.next[at]) {
    if (nx === at) continue;
    if (g.states[nx].collected === g.states[at].collected) {
      ordinary++;
      assert(Number.isFinite(toWin[nx]), where + ': an ordinary move must never create a dead end');
    } else if (!Number.isFinite(toWin[nx])) collectionTraps++;
  }

  // The accelerator's interaction claims, re-derived and checked.
  if (st.penguins === 2) {
    const p = F.parseRows(def.board), fg = p.floe.graph(p.gA, p.gB), s = p.a * fg.B + p.b;
    assert.strictEqual(fg.dist[s], def.par, where + ': accelerator par');
    const noBrake = F.backward(fg, F.EV.BRAKE_A | F.EV.BRAKE_B);
    assert(noBrake[s] < 0, where + ': no solution without one penguin stopping the other');
    const noAB = F.backward(fg, F.EV.BRAKE_A), noBA = F.backward(fg, F.EV.BRAKE_B);
    const isMutual = noAB[s] < 0 && noBA[s] < 0;
    assert.strictEqual(isMutual, pick.kind === 'MUTUAL', where + ': mutual claim');
    if (isMutual) mutual++;
    const flat = def.board.join(''), a = flat.indexOf('a'), b = flat.indexOf('b');
    if (Math.abs(a % 4 - b % 4) + Math.abs((a >> 2) - (b >> 2)) === 1) touching++;
  }
  // Difficulty climbs with the explorer, not with par.
  if (i) assert(pick.difficulty >= selection.stages[i - 1].difficulty || i === 3, where + ': difficulty never falls');
});

assert(mutual >= 80, 'most pairs must need each other (mutual: ' + mutual + ')');
assert(touching <= 45, 'adjacent auroras must not dominate (' + touching + ')');
CHAPTERS.forEach((ch, i) => { assert.strictEqual(ch.from, i * 10 + 1); assert.strictEqual(ch.to, i * 10 + 10); });

console.log('PASS: 100 floe boards, ' + mutual + ' mutual; ' + examined + ' reachable positions, ' +
  ordinary + ' ordinary moves with no dead end, ' + collectionTraps + ' premature-collection traps');
