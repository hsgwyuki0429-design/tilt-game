'use strict';
// Turn the engine-verified shortlist into an ordered high-level campaign with
// machine-derived notes, using only the real engine to read each solution.
//
//   node tools/hazard-curate.js [--count 60] [--min-par 12]
//
// Writes tools/hazard-campaign.json (stage-shaped entries, not wired into the
// game) and docs/HAZARD-CAMPAIGN.md.
const fs = require('fs');
const E = require('../src/engine.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const COUNT = Number(opt('count', 60)), MIN_PAR = Number(opt('min-par', 12));
const QUOTA = { '4x4': .10, '5x4': .13, '5x5': .20, '6x5': .27, '6x6': .30 };
const DIR_JA = { U: '上', R: '右', D: '下', L: '左' };
const NAME = { 1: 'A', 2: 'B' };

const list = JSON.parse(fs.readFileSync('tools/hazard-shortlist.json', 'utf8')).boards.filter(b => b.par >= MIN_PAR);

// --- choose: per size, evenly spaced par targets, best score at each --------
const bySize = {};
for (const b of list) (bySize[b.size] = bySize[b.size] || []).push(b);
const chosen = [], usedRooms = new Set();
for (const size of Object.keys(QUOTA)) {
  const pool = (bySize[size] || []).slice();
  if (!pool.length) continue;
  const want = Math.max(1, Math.round(COUNT * QUOTA[size]));
  const pars = [...new Set(pool.map(b => b.par))].sort((a, b) => a - b);
  const lo = pars[0], hi = pars[pars.length - 1];
  for (let k = 0; k < want; k++) {
    const target = want === 1 ? hi : lo + (hi - lo) * k / (want - 1);
    const best = pool.filter(b => !usedRooms.has(b.room) && !chosen.includes(b))
      .sort((a, b) => (Math.abs(a.par - target) - Math.abs(b.par - target)) * 100 + (b.score - a.score))[0];
    if (best) { chosen.push(best); usedRooms.add(best.room); }
  }
}
chosen.sort((a, b) => a.par - b.par || b.score - a.score);

// --- read each solution on the real engine ----------------------------------
function annotate(entry) {
  const stage = E.compile({ id: 'c', board: entry.board });
  const idx = {};
  stage.blocks.forEach((blk, i) => { idx[blk[2]] = i; });
  let s = E.initialState(stage);
  const dist = (st, i) => {
    const g = stage.goalCells.find(c => stage.goalColour[c] === stage.colour[i]);
    return Math.abs(st.pos[i][0] - g % stage.w) + Math.abs(st.pos[i][1] - (g / stage.w | 0));
  };
  const info = { away: [], brake: [], cross: 0, bites: 0, collect: [] };
  const path = entry.path.split('');
  path.forEach((dir, k) => {
    const before = s, r = E.simulate(stage, before, dir, { frames: false });
    const after = r.state, d = E.DV[dir];
    // distance to goal, both penguins that are still on the board
    let was = 0, now = 0;
    for (const i of [idx[1], idx[2]]) if (before.alive[i]) { was += dist(before, i); now += after.alive[i] ? dist(after, i) : 0; }
    if (now > was) info.away.push({ move: k + 1, dir, gain: now - was });
    // would each penguin have stopped elsewhere on its own?
    for (const i of [idx[1], idx[2]]) {
      if (!before.alive[i]) continue;
      const solo = E.cloneState(before);
      for (const o of [idx[1], idx[2]]) if (o !== i) solo.alive[o] = 0;
      const rs = E.simulate(stage, solo, dir, { frames: false }).state;
      const ends = after.alive[i] ? after.pos[i] : null, soloEnds = rs.alive[i] ? rs.pos[i] : null;
      const differs = (!ends) !== (!soloEnds) || (ends && (ends[0] !== soloEnds[0] || ends[1] !== soloEnds[1]));
      if (differs && before.alive[idx[1]] && before.alive[idx[2]]) info.brake.push({ move: k + 1, dir, by: NAME[stage.colour[i] === 1 ? 2 : 1], stopped: NAME[stage.colour[i]] });
    }
    // crossing cracked ice without stopping
    for (const i of [idx[1], idx[2]]) {
      if (!before.alive[i]) continue;
      const a = before.pos[i], b = after.alive[i] ? after.pos[i] : null;
      if (!b) continue;
      let x = a[0] + d[0], y = a[1] + d[1], hit = false;
      while (!(x === b[0] && y === b[1]) && x >= 0 && y >= 0 && x < stage.w && y < stage.h) {
        if (stage.terrain[y * stage.w + x] === E.HAZARD) hit = true; x += d[0]; y += d[1];
      }
      if (hit) info.cross++;
    }
    // how many of the other three moves would have cracked a penguin here
    for (const od of E.DIRS) if (od !== dir && E.simulate(stage, before, od, { frames: false }).broken) info.bites++;
    if (after.collected > before.collected) info.collect.push({ move: k + 1, n: after.collected - before.collected });
    s = after;
  });
  if (!E.isClear(stage, s)) throw new Error('path does not clear: ' + entry.board.join('/'));
  return info;
}

const stages = chosen.map((entry, n) => {
  const info = annotate(entry);
  const top = info.away.slice().sort((a, b) => b.gain - a.gain)[0];
  const firstBrake = info.brake[0];
  const lines = [];
  if (top) lines.push(`${top.move}手目(${DIR_JA[top.dir]}): ゴールから最も遠ざかる逆走`);
  if (firstBrake) lines.push(`${firstBrake.move}手目(${DIR_JA[firstBrake.dir]}): ${firstBrake.stopped}が${firstBrake.by}に当たって止まる`);
  if (info.cross) lines.push(`解の中で割れる氷を${info.cross}回すべって通過`);
  if (info.bites) lines.push(`解の途中に「止まれば割れる」誘い手が${info.bites}回`);
  return {
    id: n + 1, name: `${entry.size} / ${entry.par}`, size: entry.size, par: entry.par,
    idea: 'Cracked ice: slide across it, never stop on it.',
    hint: { ja: '割れる氷の上で止まると失敗。通り過ぎるだけなら大丈夫です。',
      en: 'Cracked ice breaks if you stop on it. Sliding across is safe.' },
    board: entry.board, solution: entry.path,
    notes: { ja: lines, away: info.away.length, brakes: info.brake.length, crossings: info.cross, lureMoves: info.bites },
    measures: { score: entry.score, decisionRate: entry.decisionRate, cruxRate: entry.cruxRate, branching: entry.branching,
      maxForced: entry.maxForced, walls: entry.walls, cracks: entry.cracks, coverage: entry.coverage }
  };
});
fs.writeFileSync('tools/hazard-campaign.json', JSON.stringify({ made: new Date().toISOString(), count: stages.length, stages }, null, 1));

// --- report ------------------------------------------------------------------
const bySz = {};
for (const st of stages) { const o = bySz[st.size] || (bySz[st.size] = { n: 0, lo: 99, hi: 0 }); o.n++; o.lo = Math.min(o.lo, st.par); o.hi = Math.max(o.hi, st.par); }
let jump = 0;
for (let i = 1; i < stages.length; i++) jump = Math.max(jump, stages[i].par - stages[i - 1].par);
const pool = JSON.parse(fs.readFileSync('tools/hazard-shortlist.json', 'utf8'));
let md = `# Cracked-ice campaign (high level)\n\n`;
md += `${stages.length} boards, 4×4 to 6×6, two penguins, many walls, cracked ice. Shortest solutions run **${stages[0].par} to ${stages[stages.length - 1].par} moves** (largest step between neighbours: ${jump}).\n\n`;
md += `In the game these are stages 101–160 (chapters 11–16): \`node tools/cracked-campaign.js\` turns \`tools/hazard-campaign.json\` into \`src/stages-cracked.js\`, which extends \`TiltStages\` after \`src/stages.js\`. \`tools/hazard-campaign.json\` also holds each solution and the notes below.\n\n`;
md += `## Rules this campaign uses\n\n- Walls and penguins behave as in the main campaign.\n- **Cracked ice (\`x\`)**: sliding across it is free; a penguin that comes to rest on it is lost, and the game rewinds to the last solvable position.\n- No drifters.\n\n`;
md += `## What was checked\n\n- The search's own position graph agrees with \`src/engine.js\` on 1.2 million transitions over random walls/cracks boards (\`node tools/hazard-selftest.js\`).\n- Every board here was re-solved by the engine: its shortest solution equals the stated par, and the stored solution is replayed to a clear.\n- From every reachable solvable position, every move that neither collects a penguin nor cracks one leads to another solvable position (cracking is excluded because the game rewinds it; collecting a brake too early remains the one irreversible mistake, as in the main campaign).\n- Every wall and every cracked tile changes the shortest route or a move taken along it. A tile whose removal changes nothing is rejected.\n- Each room (walls and cracks, up to rotation, reflection and swapping colours) appears at most once.\n- The ice of every board is one edge-connected piece spanning the board, which is what the floe renderer draws (\`hazard-merge.js --whole-floe\`). A wall is open water in the current game.\n\n`;
md += `## Search scale\n\nFour parallel workers, local search over layouts (move a wall, a crack or an aurora, keep what scores better). 357 million layouts were evaluated over 272 minutes (4.5 hours) across three runs of four workers; the third run was stopped at 62 of its planned 90 minutes and its last checkpoint used. ${pool.boards.length} engine-verified boards were shortlisted from 31,272 distinct candidates whose ice is one floe (38,160 before that filter), and ${stages.length} were curated from those. Longest solutions found: 6×6 ${Math.max(...pool.boards.filter(b => b.size === '6x6').map(b => b.par))}, 6×5 ${Math.max(...pool.boards.filter(b => b.size === '6x5').map(b => b.par))}, 5×5 ${Math.max(...pool.boards.filter(b => b.size === '5x5').map(b => b.par))}, 5×4 ${Math.max(...pool.boards.filter(b => b.size === '5x4').map(b => b.par))}, 4×4 ${Math.max(...pool.boards.filter(b => b.size === '4x4').map(b => b.par))}. These are search results, not proofs of a maximum.\n\n`;
md += `## Honest limits\n\n- "Fun" is not measured. The notes below are read off the solution by the engine (reversals, partner braking, crossings, lure moves). They say where a puzzle's ideas are, not whether it is enjoyable.\n- No one has played these yet. Play a handful from each tray before trusting the order.\n- 6×6 fits a 390×844 phone viewport (stages 101 and 160 were loaded in headless Chromium with software WebGL and every board was played to a clear through keyboard input in the browser QA). It has not been tried on a real phone or GPU.\n- Cracked tiles are drawn with a violet-blue tint and white fracture lines. They are readable but still the quietest thing on the board; if playtesters stop on them by surprise, raise the contrast in \`src/ice.js\`.\n\n`;
md += `## Mix\n\n| tray | boards | pars |\n|---|---:|---|\n`;
for (const k of Object.keys(bySz)) md += `| ${k} | ${bySz[k].n} | ${bySz[k].lo}–${bySz[k].hi} |\n`;
md += `\n## Boards\n\n\`#\` wall, \`x\` cracked ice, \`A\`/\`B\` penguins, \`a\`/\`b\` their auroras.\n\n`;
for (const st of stages) {
  md += `### ${st.id}. ${st.size} · ${st.par} moves\n\n\`\`\`\n${st.board.join('\n')}\n\`\`\`\n\n`;
  md += `Solution: \`${st.solution}\`\n\n`;
  for (const l of st.notes.ja) md += `- ${l}\n`;
  md += `\n`;
}
fs.writeFileSync('docs/HAZARD-CAMPAIGN.md', md);
console.log(JSON.stringify({ stages: stages.length, bySz, jump, firstPar: stages[0].par, lastPar: stages[stages.length - 1].par }));
