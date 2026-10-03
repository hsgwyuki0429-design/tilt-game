'use strict';
/*
 * Every floe board, measured.
 *
 *   node tools/floe-search.js [--w 4] [--h 4] [--out file.json] [--runs 240]
 *
 * Enumerates every edge-connected ice shape that spans the full W×H rectangle
 * (water where the old campaign had walls), every placement of one or two
 * auroras, and every start. Nothing is sampled: on 4×4 that is 1,051 shapes
 * up to symmetry, about 53,000 aurora layouts, and every start on each.
 *
 * For each start it measures what the board asks of the player rather than
 * how long it is:
 *
 *   interaction   must a partner be used as a brake? by one penguin, or by
 *                 both for each other (mutual)? can each penguin get home on
 *                 its own at all? how many brakes does the cheapest solution
 *                 need, and must one of them stop a penguin on its aurora?
 *   fairness      can an ordinary move (one that collects nobody) strand the
 *                 pair? Boards where it can are dropped.
 *   temptation    positions on the shortest routes where collecting a penguin
 *                 right now looks right and is fatal.
 *   explorer      a simulated player with memory, a pull towards the auroras
 *                 and a weakness for collecting whatever it can. The number of
 *                 swipes it needs is the difficulty: a long corridor costs it
 *                 little more than its length, a short board that wants one
 *                 move the wrong way costs it a great deal.
 *
 * Writes the measured pool; tools/floe-campaign.js chooses from it.
 */
var fs = require('fs');
var path = require('path');
var F = require('./lib/floe.js');
var EV = F.EV;

var args = process.argv.slice(2);
function arg(name, def) {
  var i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
var W = +arg('w', 4), H = +arg('h', 4);
var OUT = arg('out', path.join(__dirname, '.floe-cache', 'pool-' + W + 'x' + H + '.json'));
var RUNS = +arg('runs', 240);
var MIN_PAR = +arg('min-par', 3);
/* How far ahead the explorer sees a finish: once the board is two swipes
   from clear, a person sees it, so the explorer plays it. */
var LOOK = 2;

// ── shapes ─────────────────────────────────────────────────────────────────
function symmetryMaps(w, h) {
  var maps = [], s, c;
  for (s = 0; s < 8; s++) {
    if ((s & 4) && w !== h) continue;
    var m = new Int16Array(w * h);
    for (c = 0; c < w * h; c++) {
      var x = c % w, y = (c / w) | 0, t;
      if (s & 1) x = w - 1 - x;
      if (s & 2) y = h - 1 - y;
      if (s & 4) { t = x; x = y; y = t; }
      m[c] = y * w + x;
    }
    maps.push(m);
  }
  return maps;
}
function shapes(w, h) {
  var n = w * h, maps = symmetryMaps(w, h), out = [];
  for (var mask = 1; mask < (1 << n); mask++) {
    var floor = new Uint8Array(n), c;
    for (c = 0; c < n; c++) floor[c] = (mask >> c) & 1;
    if (!F.isWholeFloe(w, h, floor)) continue;
    var canonical = true;
    for (var s = 1; s < maps.length && canonical; s++) {
      var img = 0;
      for (c = 0; c < n; c++) if (floor[c]) img |= 1 << maps[s][c];
      if (img < mask) canonical = false;
    }
    if (canonical) out.push(floor);
  }
  return out;
}

// ── a seeded generator, so the explorer is reproducible ────────────────────
function Rng(seed) { this.s = seed >>> 0 || 1; }
Rng.prototype.next = function () {
  var x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0;
  return this.s / 4294967296;
};

// ── per-start measurements ────────────────────────────────────────────────
function manhattan(g, s) {
  var f = g.floe, a = (s / g.B) | 0, b = s % g.B, m = 0;
  if (a !== g.n) m += Math.abs(f.X[a] - f.X[g.gA]) + Math.abs(f.Y[a] - f.Y[g.gA]);
  if (b !== g.n && g.gB >= 0) m += Math.abs(f.X[b] - f.X[g.gB]) + Math.abs(f.Y[b] - f.Y[g.gB]);
  return m;
}

/*
 * The explorer. It never sees distances or solvability; it sees the board and
 * the par the HUD shows. It sees a finish two swipes away and plays it.
 * Otherwise, each swipe it prefers positions it has not been in, leans
 * towards moves that bring penguins nearer their auroras, and usually grabs a
 * collection when one is offered. A dead end is announced by the game, so it
 * pays for the swipe, remembers it, and recovers. Once it has spent a few
 * swipes more than par without finishing it restarts, keeping what it learnt
 * — which is how people play these boards, and why a natural first move into
 * a maze is expensive while a long corridor is not.
 */
var PULL = 0.45, GREED = 5, PATIENCE = 3;
function explore(g, start, rng, cap, look) {
  if (look == null) look = LOOK;
  var visited = new Map(), bad = new Set(), s = start, moves = 0, since = 0, d, i;
  var patience = g.dist[start] + PATIENCE;
  visited.set(s, 1);
  var opts = new Int32Array(4), weight = new Float64Array(4);
  while (moves < cap) {
    if (g.dist[s] <= look) return moves + g.dist[s];
    if (since >= patience) { s = start; since = 0; visited.set(s, (visited.get(s) || 0) + 1); }
    var k = 0;
    for (d = 0; d < 4; d++) {
      var t = g.next[s * 4 + d];
      if (t < 0 || bad.has(s * 4 + d)) continue;
      opts[k++] = d;
    }
    if (!k) { since = patience; continue; }
    var base = manhattan(g, s), total = 0, anyFresh = false;
    for (i = 0; i < k; i++) if (!visited.has(g.next[s * 4 + opts[i]])) { anyFresh = true; break; }
    for (i = 0; i < k; i++) {
      var e = s * 4 + opts[i], to = g.next[e];
      var seen = visited.get(to) || 0;
      var wgt = Math.exp(PULL * (base - manhattan(g, to)));
      if (g.ev[e] & (EV.HOME_A | EV.HOME_B)) wgt *= GREED;
      if (anyFresh && seen) wgt *= 0.04; else if (seen) wgt /= (1 + seen);
      weight[i] = wgt; total += wgt;
    }
    var r = rng.next() * total, choice = k - 1;
    for (i = 0; i < k; i++) { r -= weight[i]; if (r <= 0) { choice = i; break; } }
    var edge = s * 4 + opts[choice], nxt = g.next[edge];
    moves++; since++;
    if (g.dist[nxt] < 0) { bad.add(edge); continue; }  // dead end: recover
    s = nxt;
    visited.set(s, (visited.get(s) || 0) + 1);
  }
  return cap;
}

function measure(g, start, extra) {
  var total = g.total, B = g.B, n = g.n, d, i, s, t;
  // Forward distances from the start.
  var fdist = new Int16Array(total).fill(-1), order = [start];
  fdist[start] = 0;
  for (i = 0; i < order.length; i++) {
    s = order[i];
    if (s === g.clearId) continue;
    for (d = 0; d < 4; d++) {
      t = g.next[s * 4 + d];
      if (t >= 0 && fdist[t] < 0) { fdist[t] = fdist[s] + 1; order.push(t); }
    }
  }
  var par = g.dist[start];
  // Shortest-route DAG: count routes, temptations, braking and choices.
  var ways = new Float64Array(total), onPath = new Uint8Array(total);
  ways[start] = 1;
  var traps = 0, tempt = 0, reach = order.length, deadStates = 0;
  for (i = 0; i < order.length; i++) {
    s = order[i];
    if (g.dist[s] < 0) { deadStates++; continue; }
    for (d = 0; d < 4; d++) {
      t = g.next[s * 4 + d];
      if (t >= 0 && g.dist[t] < 0) traps++;
    }
  }
  for (i = 0; i < order.length; i++) {
    s = order[i];
    if (fdist[s] + g.dist[s] !== par || g.dist[s] < 0) continue;
    onPath[s] = 1;
    for (d = 0; d < 4; d++) {
      t = g.next[s * 4 + d];
      if (t < 0) continue;
      if (g.dist[t] < 0 && (g.ev[s * 4 + d] & (EV.HOME_A | EV.HOME_B))) tempt++;
      if (g.dist[t] === g.dist[s] - 1 && fdist[t] === fdist[s] + 1) ways[t] += ways[s];
    }
  }
  // One representative shortest route, preferring brakes where it can.
  var route = [], pathStates = [start], brakeMoves = 0, brakeHome = 0, firstHome = -1;
  var forced = 0, maxForced = 0, choiceSum = 0, away = 0;
  s = start; var prev = -1;
  while (s !== g.clearId) {
    var best = -1, bestScore = -1, useful = 0;
    for (d = 0; d < 4; d++) {
      t = g.next[s * 4 + d];
      if (t < 0 || t === prev || g.dist[t] < 0) continue;
      useful++;
      if (g.dist[t] !== g.dist[s] - 1) continue;
      var sc = (g.ev[s * 4 + d] & (EV.BRAKE_A | EV.BRAKE_B)) ? 2 : 1;
      if (sc > bestScore) { bestScore = sc; best = d; }
    }
    var e = s * 4 + best, ev = g.ev[e];
    t = g.next[e];
    if (ev & (EV.BRAKE_A | EV.BRAKE_B)) brakeMoves++;
    if (ev & (EV.BRAKE_HOME_A | EV.BRAKE_HOME_B)) brakeHome++;
    if (firstHome < 0 && (ev & (EV.HOME_A | EV.HOME_B))) firstHome = route.length + 1;
    if (manhattan(g, t) > manhattan(g, s) && F.homeCount(g, t) === F.homeCount(g, s)) away++;
    choiceSum += useful;
    if (useful <= 1) { forced++; if (forced > maxForced) maxForced = forced; } else forced = 0;
    route.push(F.DIRS[best]);
    prev = s; s = t; pathStates.push(s);
  }
  // Cells the solution actually uses.
  var used = new Set();
  for (i = 0; i < pathStates.length; i++) {
    var pa = (pathStates[i] / B) | 0, pb = pathStates[i] % B;
    if (pa !== n) used.add(pa);
    if (pb !== n) used.add(pb);
  }
  // Explorer runs.
  var rng = new Rng(start * 7919 + g.gA * 104729 + (g.gB + 2) * 1299709 + g.floe.cells.length);
  var runs = extra && extra.runs != null ? extra.runs : RUNS;
  var cap = extra && extra.cap ? extra.cap : Math.max(400, par * 40), costs = [];
  for (i = 0; i < runs; i++) costs.push(explore(g, start, rng, cap));
  if (!costs.length) costs.push(par);
  costs.sort(function (x, y) { return x - y; });
  var mean = costs.reduce(function (x, y) { return x + y; }, 0) / costs.length;
  var logMean = costs.reduce(function (x, y) { return x + Math.log(y); }, 0) / costs.length;
  var quick = costs.filter(function (c) { return c <= par * 2; }).length / costs.length;
  var out = {
    par: par, route: route.join(''), ways: ways[g.clearId], reach: reach, deadStates: deadStates,
    traps: traps, tempt: tempt, brakeMoves: brakeMoves, brakeHome: brakeHome,
    tail: firstHome < 0 ? 0 : par - firstHome, maxForced: maxForced,
    choice: +(choiceSum / par).toFixed(3), away: away, usedCells: used.size,
    explorer: +mean.toFixed(2), explorerMedian: costs[costs.length >> 1],
    explorerGeo: +Math.exp(logMean).toFixed(2), quick: +quick.toFixed(3),
    capped: costs.filter(function (c) { return c >= cap; }).length
  };
  for (var key in extra) if (key !== 'runs' && key !== 'cap') out[key] = extra[key];
  return out;
}

// ── the sweep ─────────────────────────────────────────────────────────────
function main() {
  var t0 = Date.now(), list = shapes(W, H), pool = [], seen = new Set();
  var layouts = 0, starts = 0, stats = { single: 0, help: 0, mutual: 0, unfair: 0, noInteraction: 0 };
  console.log(W + 'x' + H + ': ' + list.length + ' ice shapes up to symmetry');
  list.forEach(function (floor, shapeIndex) {
    var floe = new F.Floe(W, H, floor), cells = floe.cells, n = floe.n, B = floe.B, i, j;
    // One penguin: every aurora and start.
    for (i = 0; i < cells.length; i++) {
      var g1 = floe.graph(cells[i], -1), u1 = F.unfairFrom(g1);
      layouts++;
      for (j = 0; j < cells.length; j++) {
        if (j === i) continue;
        var s1 = cells[j] * B + n, p1 = g1.dist[s1];
        starts++;
        if (p1 < 2) continue;
        if (u1[s1]) { stats.unfair++; continue; }
        var rows1 = F.boardRows(floe, cells[i], -1, cells[j], n), key1 = F.canonicalKey(rows1);
        if (seen.has(key1)) continue;
        seen.add(key1); stats.single++;
        pool.push(measure(g1, s1, { penguins: 1, board: rows1, cells: cells.length, kind: 'SOLO' }));
      }
    }
    // Two penguins: every pair of auroras (the colour swap is covered by
    // letting the starts run over ordered pairs) and every start.
    for (i = 0; i < cells.length; i++) for (j = i + 1; j < cells.length; j++) {
      var gA = cells[i], gB = cells[j], g = floe.graph(gA, gB);
      layouts++;
      var noBrake = F.backward(g, EV.BRAKE_A | EV.BRAKE_B);
      var noAB = F.backward(g, EV.BRAKE_A), noBA = F.backward(g, EV.BRAKE_B);
      var noHomeBrake = F.backward(g, EV.BRAKE_HOME_A | EV.BRAKE_HOME_B);
      var fewest = F.fewestBrakes(g), unfair = F.unfairFrom(g);
      for (var x = 0; x < cells.length; x++) for (var y = 0; y < cells.length; y++) {
        var a = cells[x], b = cells[y];
        if (a === b || a === gA || a === gB || b === gA || b === gB) continue;
        var s = a * B + b, par = g.dist[s];
        starts++;
        if (par < MIN_PAR) continue;
        if (noBrake[s] >= 0) { stats.noInteraction++; continue; }
        if (unfair[s]) { stats.unfair++; continue; }
        var rows = F.boardRows(floe, gA, gB, a, b), key = F.canonicalKey(rows);
        if (seen.has(key)) continue;
        seen.add(key);
        var needAB = noAB[s] < 0, needBA = noBA[s] < 0;
        var soloA = g.dist[a * B + n], soloB = g.dist[n * B + b];
        var mutual = needAB && needBA;
        if (mutual) stats.mutual++; else stats.help++;
        pool.push(measure(g, s, {
          penguins: 2, board: rows, cells: cells.length,
          kind: mutual ? 'MUTUAL' : 'HELP',
          needAB: needAB, needBA: needBA, minBrakes: fewest[s],
          needBrakeHome: noHomeBrake[s] < 0,
          soloA: soloA, soloB: soloB
        }));
      }
    }
    if (shapeIndex % 100 === 99) {
      console.log('  ' + (shapeIndex + 1) + '/' + list.length + ' shapes, ' + pool.length +
        ' boards kept, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  });
  console.log('layouts ' + layouts + ', starts ' + starts + ', kept ' + pool.length + ' ' + JSON.stringify(stats));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    w: W, h: H, shapes: list.length, layouts: layouts, starts: starts, runs: RUNS,
    minPar: MIN_PAR, stats: stats, pool: pool
  }));
  console.log('wrote ' + OUT + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

if (require.main === module) main();
module.exports = { shapes: shapes, measure: measure, explore: explore, Rng: Rng };
