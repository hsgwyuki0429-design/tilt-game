'use strict';
// Merge the worker pools, re-check every kept board against the real engine,
// and write a shortlist filed by tray and shortest solution.
//
//   node tools/hazard-merge.js [pool-dir] [--per 3] [--whole-floe] [--out tools/hazard-shortlist.json]
//
// Engine checks, per board:
//   * compiles, two penguins, one aurora each, at least one cracked tile
//   * the engine's own breadth-first solve agrees with the accelerator's par
//   * every ordinary move (no penguin collected, no penguin cracked) from any
//     reachable solvable position leads to another solvable position
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const F = require('./lib/floe.js');

const argv = process.argv.slice(2);
const dir = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'tools/hazard-pool';
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const per = Number(opt('per') || 3);
const outFile = opt('out') || 'tools/hazard-shortlist.json';
// The game draws the ice as one floe: edge-connected and spanning the board.
const wholeFloe = argv.includes('--whole-floe');
function isWhole(board) {
  const w = board[0].length, h = board.length, fl = new Uint8Array(w * h);
  board.forEach((r, y) => { for (let x = 0; x < w; x++) fl[y * w + x] = r[x] === '#' ? 0 : 1; });
  return F.isWholeFloe(w, h, fl);
}

function verify(entry) {
  let stage;
  try { stage = E.compile({ id: 'h', board: entry.board }); } catch (e) { return 'compile: ' + e.message; }
  if (!stage.rules.hazard) return 'no cracked ice';
  const solved = E.solve(stage, null, 400000);
  if (!solved.solvable) return 'unsolvable';
  if (solved.moves !== entry.par) return 'par ' + solved.moves + ' != ' + entry.par;
  const g = E.graph(stage, 200000);
  if (!g) return 'graph too large';
  // Solvable = can reach a clear state. Walk the reversed edges.
  const rev = g.states.map(() => []);
  for (let i = 0; i < g.n; i++) for (let d = 0; d < 4; d++) if (g.next[i][d] !== i) rev[g.next[i][d]].push(i);
  const ok = new Uint8Array(g.n), q = [];
  for (let i = 0; i < g.n; i++) if (g.clear[i]) { ok[i] = 1; q.push(i); }
  for (let h = 0; h < q.length; h++) for (const p of rev[q[h]]) if (!ok[p] && !g.broken[p]) { ok[p] = 1; q.push(p); }
  let trapped = 0;
  for (let i = 0; i < g.n; i++) {
    if (!ok[i] || g.clear[i]) continue;
    for (let d = 0; d < 4; d++) {
      const j = g.next[i][d];
      if (j === i || g.broken[j] || ok[j]) continue;
      if (g.states[j].collected === g.states[i].collected) trapped++;
    }
  }
  if (trapped) return 'ordinary-move trap x' + trapped;
  return null;
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
const best = new Map();
let total = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.log('skip', f, e.message); continue; }
  for (const c of d.candidates) { if (wholeFloe && !isWhole(c.board)) continue; total++; const o = best.get(c.canon); if (!o || c.score > o.score) best.set(c.canon, c); }
}
console.log(JSON.stringify({ files: files.length, candidates: total, distinct: best.size }));

// Walk each bucket best-first, verify on the engine until `per` boards pass,
// never taking a third board from one room.
const buckets = new Map();
for (const c of best.values()) { const k = c.size + '|' + c.par; (buckets.get(k) || buckets.set(k, []).get(k)).push(c); }
const picked = [], rejected = {};
for (const [k, list] of buckets) {
  list.sort((a, b) => b.score - a.score);
  const rooms = new Map();
  let took = 0;
  for (const c of list) {
    if (took >= per) break;
    const r = rooms.get(c.room) || 0;
    if (r >= 1) continue;
    const bad = verify(c);
    if (bad) { rejected[bad.split(' ')[0]] = (rejected[bad.split(' ')[0]] || 0) + 1; continue; }
    rooms.set(c.room, r + 1);
    picked.push(c); took++;
  }
}
picked.sort((a, b) => a.par - b.par || b.score - a.score);
fs.writeFileSync(outFile, JSON.stringify({ made: new Date().toISOString(), per, count: picked.length, rejected, boards: picked }, null, 1));
const bySize = {};
for (const p of picked) { const s = bySize[p.size] || (bySize[p.size] = { n: 0, minPar: 99, maxPar: 0 }); s.n++; s.minPar = Math.min(s.minPar, p.par); s.maxPar = Math.max(s.maxPar, p.par); }
console.log(JSON.stringify({ outFile, picked: picked.length, rejected, bySize }));
