'use strict';
// Long-running search for high-level boards: two penguins, many walls, cracked
// ice, 4x4 up to 6x6. Layouts are improved by local search (move a wall, a
// crack or an aurora; keep what scores better), and every layout evaluated
// also feeds a pool of candidates, bucketed by tray and shortest solution.
//
//   node tools/hazard-search.js --minutes 100 --seed 1 --out tools/hazard-pool/w1.json
//
// Nothing here touches src/stages.js. The pool is read by tools/hazard-merge.js.
const fs = require('fs');
const path = require('path');
const H = require('./lib/hazard-search');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const minutes = Number(args.minutes || 1);
let seed = Number(args.seed || 1) * 2654435761 >>> 0 || 1;
const out = args.out || 'tools/hazard-pool/worker.json';
const minPar = Number(args['min-par'] || 9);
const only = args.sizes ? args.sizes.split(',') : null;
const rng = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const pick = a => a[rng() * a.length | 0];

// size: [w, h, weight, wallMin, wallMax, crackMin, crackMax]
const SIZES = [
  [4, 4, 1.0, 3, 6, 1, 3],
  [5, 4, 1.0, 4, 8, 1, 3],
  [5, 5, 2.0, 5, 10, 1, 4],
  [6, 5, 2.0, 6, 12, 1, 4],
  [6, 6, 3.0, 7, 14, 2, 5],
].filter(s => !only || only.includes(s[0] + 'x' + s[1]));
const totalWeight = SIZES.reduce((s, z) => s + z[2], 0);
function chooseSize() { let r = rng() * totalWeight; for (const z of SIZES) { if ((r -= z[2]) < 0) return z; } return SIZES[0]; }

const pool = new Map();            // "WxH|par" -> entries
const seenBoards = new Set();
const stats = { layouts: 0, graphs: 0, picks: 0, cheap: 0, qualified: 0, kept: 0, bestPar: {}, episodes: 0 };
const started = Date.now();
const deadline = started + minutes * 60000;

function randomLayout(z) {
  const [w, h, , wmin, wmax, cmin, cmax] = z, n = w * h;
  const cells = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[cells[i], cells[j]] = [cells[j], cells[i]]; }
  const wc = wmin + (rng() * (wmax - wmin + 1) | 0), cc = cmin + (rng() * (cmax - cmin + 1) | 0);
  return { z, w, h, walls: cells.slice(0, wc), cracks: cells.slice(wc, wc + cc), goals: cells.slice(wc + cc, wc + cc + 2) };
}
function mutate(L) {
  const [, , , wmin, wmax, cmin, cmax] = L.z, n = L.w * L.h;
  const m = { z: L.z, w: L.w, h: L.h, walls: L.walls.slice(), cracks: L.cracks.slice(), goals: L.goals.slice() };
  const used = new Set([...m.walls, ...m.cracks, ...m.goals]);
  const freeCell = () => { for (let t = 0; t < 40; t++) { const c = rng() * n | 0; if (!used.has(c)) return c; } return -1; };
  const steps = 1 + (rng() < .3 ? 1 : 0);
  for (let s = 0; s < steps; s++) {
    const r = rng();
    if (r < .45) {                      // move a wall
      const i = rng() * m.walls.length | 0, c = freeCell(); if (c < 0) continue;
      used.delete(m.walls[i]); m.walls[i] = c; used.add(c);
    } else if (r < .65) {               // move a crack
      const i = rng() * m.cracks.length | 0, c = freeCell(); if (c < 0) continue;
      used.delete(m.cracks[i]); m.cracks[i] = c; used.add(c);
    } else if (r < .78) {               // move an aurora
      const i = rng() * 2 | 0, c = freeCell(); if (c < 0) continue;
      used.delete(m.goals[i]); m.goals[i] = c; used.add(c);
    } else if (r < .86) {               // swap a wall and a crack
      if (!m.cracks.length) continue;
      const i = rng() * m.walls.length | 0, j = rng() * m.cracks.length | 0;
      const t = m.walls[i]; m.walls[i] = m.cracks[j]; m.cracks[j] = t;
    } else if (r < .93) {               // add or drop a wall
      if (m.walls.length < wmax && rng() < .5) { const c = freeCell(); if (c >= 0) { m.walls.push(c); used.add(c); } }
      else if (m.walls.length > wmin) { used.delete(m.walls.splice(rng() * m.walls.length | 0, 1)[0]); }
    } else {                            // add or drop a crack
      if (m.cracks.length < cmax && rng() < .5) { const c = freeCell(); if (c >= 0) { m.cracks.push(c); used.add(c); } }
      else if (m.cracks.length > cmin) { used.delete(m.cracks.splice(rng() * m.cracks.length | 0, 1)[0]); }
    }
  }
  return m;
}

function quality(a, cov) {
  return a.decisionRate * 30 + a.branching * 12 + Math.min(a.interactions, 10) + Math.min(a.away, 6) * 2
    - a.maxForced * 3 - a.solo - a.repeated * 1.5
    + Math.min(a.bites, 8) * 1.5 + Math.min(a.passes, 6) * 2 + cov * 10 + (a.brakes >= 2 ? 3 : 0)
    + Math.min(a.cruxRate, .8) * 20 + Math.max(0, 5 - a.log2ways) * 1.2;
}
function cheapGate(a) {
  return a.openingSafe >= 2 && a.maxForced <= 3 && a.decisionRate >= .42 && a.branching >= 1.4
    && a.solo <= 4 && a.brakes >= 1 && a.repeated <= .38 && a.passes + a.bites >= 2 && a.cruxRate >= .3;
}

function addToPool(g, L, id, a, cov, score) {
  const board = H.rows(g, id), canon = H.canonical(board, 'board');
  if (seenBoards.has(canon)) return false;
  seenBoards.add(canon);
  const key = L.w + 'x' + L.h + '|' + a.par, room = H.canonical(board, 'room');
  let list = pool.get(key) || [];
  const entry = {
    board, canon, room, size: L.w + 'x' + L.h, par: a.par, score: +score.toFixed(2), path: a.path,
    decisionRate: +a.decisionRate.toFixed(3), branching: +a.branching.toFixed(2), maxForced: a.maxForced,
    interactions: a.interactions, brakes: a.brakes, solo: a.solo, away: a.away, bites: a.bites, passes: a.passes,
    cracks: g.hazards.length, walls: g.walls.length, coverage: +cov.toFixed(2),
    cruxRate: +a.cruxRate.toFixed(2), log2ways: +a.log2ways.toFixed(1)
  };
  list.push(entry);
  list.sort((x, y) => y.score - x.score);
  const perRoom = new Map();
  list = list.filter(x => { const k = perRoom.get(x.room) || 0; perRoom.set(x.room, k + 1); return k < 2; }).slice(0, 40);
  pool.set(key, list);
  stats.kept++;
  return true;
}

// Evaluate one layout: returns its score for the local search.
function evaluate(L) {
  const g = H.graph(L.w, L.h, L.walls, L.cracks, L.goals);
  stats.layouts++;
  const starts = [];
  let maxPar = 0;
  for (const a of g.rest) for (const b of g.rest) {
    // A start may not sit on either aurora: a board is drawn in characters.
    if (a === b || a === g.goals[0] || a === g.goals[1] || b === g.goals[0] || b === g.goals[1]) continue;
    const id = a * g.B + b, par = g.dist[id];
    if (par < minPar || g.unfair[id]) continue;
    starts.push(id);
    if (par > maxPar) maxPar = par;
  }
  if (!starts.length) return 0;
  if (maxPar > (stats.bestPar[L.w + 'x' + L.h] || 0)) stats.bestPar[L.w + 'x' + L.h] = maxPar;
  starts.sort((x, y) => g.dist[y] - g.dist[x]);
  const picks = new Set(starts.slice(0, 4));
  for (let k = 0; k < 4; k++) picks.add(starts[rng() * starts.length | 0]);
  let best = maxPar * .2;
  for (const id of picks) {
    stats.picks++;
    const a = H.assess(g, id);
    if (!cheapGate(a)) continue;
    stats.cheap++;
    const r = H.reach(g, id);
    if (r.coverage < .4) continue;
    const score = quality(a, r.coverage);
    best = Math.max(best, 10 + score * .5);
    // Skip the costly relevance test when the pool already holds something better.
    const key = L.w + 'x' + L.h + '|' + a.par, list = pool.get(key);
    if (list && list.length >= 40 && list[list.length - 1].score >= score) continue;
    const rel = H.relevance(g, id, a);
    if (rel.idleWalls || rel.idleCracks) continue;
    stats.qualified++;
    if (addToPool(g, L, id, a, r.coverage, score)) best = Math.max(best, 20 + score);
  }
  return best;
}

function save() {
  const entries = [...pool.values()].flat();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ seed: args.seed, minPar, minutes, stats, candidates: entries }));
  fs.renameSync(tmp, out);
}
function report() {
  const sec = (Date.now() - started) / 1000;
  const bySize = {};
  for (const [k, v] of pool) { const s = k.split('|')[0]; bySize[s] = (bySize[s] || 0) + v.length; }
  console.log(JSON.stringify({ min: +(sec / 60).toFixed(1), layoutsPerSec: Math.round(stats.layouts / sec), ...stats, bySize }));
}

let lastSave = Date.now(), lastReport = Date.now();
while (Date.now() < deadline) {
  stats.episodes++;
  const z = chooseSize();
  let cur = randomLayout(z), curScore = evaluate(cur), stale = 0;
  const limit = 300 + (rng() * 500 | 0);
  for (let it = 0; it < limit && stale < 150 && Date.now() < deadline; it++) {
    const cand = mutate(cur), s = evaluate(cand);
    if (s >= curScore - (rng() < .1 ? 3 : 0)) { if (s > curScore) stale = 0; else stale++; cur = cand; curScore = s; } else stale++;
    if (Date.now() - lastReport > 60000) { report(); lastReport = Date.now(); }
    if (Date.now() - lastSave > 120000) { save(); lastSave = Date.now(); }
  }
}
save();
report();
