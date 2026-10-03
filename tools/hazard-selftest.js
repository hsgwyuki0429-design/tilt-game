'use strict';
// The hazard accelerator must agree with the real engine on every transition.
// Usage: node tools/hazard-selftest.js [layouts] [seed]
const E = require('../src/engine.js');
const H = require('./lib/hazard-search');

const layouts = Number(process.argv[2] || 300);
let seed = Number(process.argv[3] || 12345);
const rng = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const sizes = [[4, 4], [5, 4], [5, 5], [6, 5], [6, 6]];
let transitions = 0, mismatches = 0, boards = 0;

function boardRows(g, a, b) {
  const out = Array(g.n).fill('.');
  g.walls.forEach(c => out[c] = '#');
  g.hazards.forEach(c => out[c] = 'x');
  if (a < g.n) { out[g.goals[0]] = 'a'; out[a] = 'A'; }
  if (b < g.n) { out[g.goals[1]] = 'b'; out[b] = 'B'; }
  const r = [];
  for (let y = 0; y < g.h; y++) r.push(out.slice(y * g.w, (y + 1) * g.w).join(''));
  return r;
}

for (let it = 0; it < layouts; it++) {
  const [w, h] = sizes[rng() * sizes.length | 0], n = w * h;
  const cells = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[cells[i], cells[j]] = [cells[j], cells[i]]; }
  const wc = 2 + (rng() * (n / 3) | 0), hc = 1 + (rng() * 4 | 0);
  const walls = cells.slice(0, wc), hazards = cells.slice(wc, wc + hc), goals = cells.slice(wc + hc, wc + hc + 2);
  const g = H.graph(w, h, walls, hazards, goals);
  boards++;
  // One stage per layout; positions are set on the state directly because a
  // penguin may rest on the other penguin's aurora, which a character board
  // cannot show.
  const spots = g.rest.filter(c => c !== goals[0] && c !== goals[1]);
  if (spots.length < 2) continue;
  let stage;
  try { stage = E.compile({ id: 't', board: boardRows(g, spots[0], spots[1]) }); } catch (e) { continue; }
  const idx = {};
  stage.blocks.forEach((blk, i) => { idx[blk[2]] = i; });
  const ids = [];
  for (let id = 0; id < g.total; id++) if (g.valid[id] && !(id === g.n * g.B + g.n)) ids.push(id);
  for (const id of ids) {
    if (ids.length > 400 && rng() > 400 / ids.length) continue;
    const a = id / g.B | 0, b = id % g.B;
    const s0 = E.initialState(stage);
    s0.pos[idx[1]] = [a % w, a / w | 0]; s0.alive[idx[1]] = a < g.n ? 1 : 0;
    s0.pos[idx[2]] = [b % w, b / w | 0]; s0.alive[idx[2]] = b < g.n ? 1 : 0;
    s0.collected = (a === g.n ? 1 : 0) + (b === g.n ? 1 : 0);
    for (let d = 0; d < 4; d++) {
      transitions++;
      const r = E.simulate(stage, s0, H.DIRS[d], { frames: false });
      const expectLose = g.lose[id * 4 + d], expectNext = g.next[id * 4 + d];
      let got;
      if (r.broken) got = 'lose';
      else if (!r.moved) got = 'still';
      else {
        const cellOf = i => r.state.alive[i] ? r.state.pos[i][1] * w + r.state.pos[i][0] : g.n;
        got = cellOf(idx[1]) * g.B + cellOf(idx[2]);
      }
      const want = expectLose ? 'lose' : (expectNext < 0 ? 'still' : expectNext);
      if (got !== want) {
        mismatches++;
        if (mismatches <= 5) console.log('MISMATCH', JSON.stringify(H.rows(g, id)), a, b, H.DIRS[d], 'engine', got, 'graph', want);
      }
    }
  }
}
console.log(JSON.stringify({ boards, transitions, mismatches }));
process.exit(mismatches ? 1 : 0);
