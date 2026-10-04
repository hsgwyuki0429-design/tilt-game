'use strict';
/*
 * Search for larger floe boards (4x4 up to 6x6) with the same eyes as the main
 * campaign. Layouts (the shape of the ice and the two auroras) are improved by
 * local search, and every layout evaluated feeds a pool of starts, bucketed by
 * tray, shortest solution and kind.
 *
 *   node tools/large-search.js --minutes 100 --seed 1 --out tools/large-pool/w1.json
 *
 * A start is kept only if it passes what tools/floe-campaign.js asks of a pair:
 * one edge-connected floe spanning the board with its centre of mass within
 * half a cell of the centre; fair (an ordinary move never strands the pair);
 * a partner has to be used as a brake; at most two forced moves in a row; at
 * most two lone clean-up moves; at most three fatal "collect now" temptations
 * on the shortest routes; at least 60% of the ice used by the solution.
 * Quality is the main campaign's own quality(). The explorer's difficulty is
 * measured later, by tools/large-campaign.js, on the best of each bucket.
 */
var fs = require('fs');
var path = require('path');
var F = require('./lib/floe.js');
var S = require('./floe-search.js');
var K = require('./lib/rect-keys.js');
var EV = F.EV, BR = EV.BRAKE_A | EV.BRAKE_B;

var args = {};
for (var i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
var minutes = Number(args.minutes || 1);
var seed = (Number(args.seed || 1) * 2654435761) >>> 0 || 1;
var out = args.out || 'tools/large-pool/worker.json';
var MIN_PAR = Number(args['min-par'] || 6);
var only = args.sizes ? args.sizes.split(',') : null;
function rng() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }

// [w, h, weight, waterMin, waterMax]
var SIZES = [
  [4, 4, .4, 2, 6], [5, 4, .8, 3, 8], [5, 5, 2, 4, 10], [6, 4, .6, 4, 9], [6, 5, 2, 5, 12], [6, 6, 3, 6, 14]
].filter(function (z) { return !only || only.indexOf(z[0] + 'x' + z[1]) >= 0; });
var totalWeight = SIZES.reduce(function (s, z) { return s + z[2]; }, 0);
function chooseSize() { var r = rng() * totalWeight; for (var k = 0; k < SIZES.length; k++) { if ((r -= SIZES[k][2]) < 0) return SIZES[k]; } return SIZES[0]; }

function balanceOf(w, h, floor) {
  var sx = 0, sy = 0, n = 0;
  for (var c = 0; c < w * h; c++) if (floor[c]) { sx += c % w; sy += (c / w) | 0; n++; }
  return Math.hypot(sx / n - (w - 1) / 2, sy / n - (h - 1) / 2);
}
function validShape(w, h, floor) { return F.isWholeFloe(w, h, floor) && balanceOf(w, h, floor) <= 0.5; }

function randomLayout(z) {
  var w = z[0], h = z[1], n = w * h;
  for (var attempt = 0; attempt < 200; attempt++) {
    var floor = new Uint8Array(n).fill(1), water = z[3] + (rng() * (z[4] - z[3] + 1) | 0);
    for (var k = 0; k < water; k++) floor[rng() * n | 0] = 0;
    if (!validShape(w, h, floor)) continue;
    var cells = []; for (var c = 0; c < n; c++) if (floor[c]) cells.push(c);
    if (cells.length < 9) continue;
    var gA = cells.splice(rng() * cells.length | 0, 1)[0], gB = cells[rng() * cells.length | 0];
    return { z: z, w: w, h: h, floor: floor, gA: gA, gB: gB };
  }
  return null;
}
function mutate(L) {
  var w = L.w, h = L.h, n = w * h;
  for (var attempt = 0; attempt < 30; attempt++) {
    var m = { z: L.z, w: w, h: h, floor: L.floor.slice(), gA: L.gA, gB: L.gB };
    var steps = 1 + (rng() < .3 ? 1 : 0);
    for (var s = 0; s < steps; s++) {
      var r = rng();
      if (r < .5) {                       // move a piece of water
        var ice = [], wet = [];
        for (var c = 0; c < n; c++) { if (m.floor[c] && c !== m.gA && c !== m.gB) ice.push(c); else if (!m.floor[c]) wet.push(c); }
        if (!ice.length) continue;
        m.floor[ice[rng() * ice.length | 0]] = 0;
        if (wet.length) m.floor[wet[rng() * wet.length | 0]] = 1;
      } else if (r < .72) {               // add or drop water
        var count = 0; for (c = 0; c < n; c++) if (!m.floor[c]) count++;
        if (rng() < .5 && count < L.z[4]) { var q = rng() * n | 0; if (q !== m.gA && q !== m.gB) m.floor[q] = 0; }
        else if (count > L.z[3]) { var wc = []; for (c = 0; c < n; c++) if (!m.floor[c]) wc.push(c); m.floor[wc[rng() * wc.length | 0]] = 1; }
      } else {                            // move an aurora
        var which = rng() < .5, pool = [];
        for (c = 0; c < n; c++) if (m.floor[c] && c !== m.gA && c !== m.gB) pool.push(c);
        if (!pool.length) continue;
        if (which) m.gA = pool[rng() * pool.length | 0]; else m.gB = pool[rng() * pool.length | 0];
      }
    }
    if (!m.floor[m.gA] || !m.floor[m.gB] || m.gA === m.gB) continue;
    if (!validShape(w, h, m.floor)) continue;
    return m;
  }
  return L;
}

// The main campaign's own ranking of a pair board.
function quality(c) {
  var q = c.kind === 'MUTUAL' ? 3 : c.kind === 'HELP' ? 1 : 0;
  q += 0.6 * Math.min(Math.max(0, (c.minBrakes || 0) - 1), 3);
  if (c.needBrakeHome) q += 1;
  if (c.tempt >= 1 && c.tempt <= 2) q += 0.8; else if (c.tempt === 3) q += 0.3;
  if (c.away >= 1) q += 0.5;
  q += c.ways === 1 ? 0.6 : c.ways === 2 ? 0.3 : 0;
  q -= 0.3 * c.maxForced + 0.3 * c.tail;
  q += c.usedCells / c.cells;
  q -= 1.2 * c.balance;
  return q;
}

var pool = new Map(), seen = new Set();
var stats = { layouts: 0, starts: 0, measured: 0, gated: 0, kept: 0, bestPar: {}, episodes: 0 };
var started = Date.now(), deadline = started + minutes * 60000;
var BUCKET = 16;
/* Long mutual boards drift towards auroras that touch, because the braking penguin sits just past
   the aurora. The main campaign allows only a few of those, so they are scored down here and kept
   in buckets of their own, leaving room for boards whose auroras are apart. */
function touching(L) { return Math.abs(L.gA % L.w - L.gB % L.w) + Math.abs(((L.gA / L.w) | 0) - ((L.gB / L.w) | 0)) === 1; }

function evaluate(L, wPar) {
  var floe = new F.Floe(L.w, L.h, L.floor), g = floe.graph(L.gA, L.gB);
  stats.layouts++;
  var unfair = F.unfairFrom(g), noBrake = F.backward(g, BR);
  var starts = [], cells = floe.cells, n = floe.n, B = floe.B, maxPar = 0;
  for (var x = 0; x < cells.length; x++) for (var y = 0; y < cells.length; y++) {
    var a = cells[x], b = cells[y];
    if (a === b || a === L.gA || a === L.gB || b === L.gA || b === L.gB) continue;
    var s = a * B + b, par = g.dist[s];
    if (par < MIN_PAR || noBrake[s] >= 0 || unfair[s]) continue;
    starts.push(s); if (par > maxPar) maxPar = par;
  }
  stats.starts += starts.length;
  if (!starts.length) return 0;
  var size = L.w + 'x' + L.h;
  if (maxPar > (stats.bestPar[size] || 0)) stats.bestPar[size] = maxPar;
  starts.sort(function (p, q) { return g.dist[q] - g.dist[p]; });
  var picks = new Set(starts.slice(0, 3));
  for (var k = 0; k < 4; k++) picks.add(starts[rng() * starts.length | 0]);
  var best = maxPar * .15, lazy = null, touch = touching(L);
  picks.forEach(function (s) {
    var m = S.measure(g, s, { runs: 0 });
    stats.measured++;
    if (m.maxForced > 2 || m.tail > 2 || m.tempt > 3 || m.usedCells / floe.cells.length < 0.6) return;
    stats.gated++;
    if (!lazy) lazy = {
      noAB: F.backward(g, EV.BRAKE_A), noBA: F.backward(g, EV.BRAKE_B),
      noHome: F.backward(g, EV.BRAKE_HOME_A | EV.BRAKE_HOME_B), fewest: F.fewestBrakes(g)
    };
    var a = (s / B) | 0, b = s % B;
    var rows = F.boardRows(floe, L.gA, L.gB, a, b);
    var c = {
      board: rows, size: size, par: m.par, route: m.route, ways: m.ways, tempt: m.tempt, tail: m.tail,
      maxForced: m.maxForced, away: m.away, usedCells: m.usedCells, cells: floe.cells.length,
      choice: m.choice, reach: m.reach, traps: m.traps, brakeMoves: m.brakeMoves, brakeHome: m.brakeHome,
      kind: lazy.noAB[s] < 0 && lazy.noBA[s] < 0 ? 'MUTUAL' : 'HELP',
      needAB: lazy.noAB[s] < 0, needBA: lazy.noBA[s] < 0, minBrakes: lazy.fewest[s], needBrakeHome: lazy.noHome[s] < 0,
      balance: +balanceOf(L.w, L.h, L.floor).toFixed(3)
    };
    c.quality = +quality(c).toFixed(3);
    var score = c.quality + wPar * c.par;
    best = Math.max(best, 5 + score - (touch ? 4 : 0));
    var canon = K.canonical(rows);
    if (seen.has(canon)) return;
    c.touch = touch;
    var key = size + '|' + c.par + '|' + c.kind + '|' + (touch ? 'T' : 'N'), list = pool.get(key) || [];
    if (list.length >= BUCKET && list[list.length - 1].quality >= c.quality) return;
    seen.add(canon);
    c.canon = canon; c.room = K.canonical(rows, 'room');
    list.push(c); list.sort(function (p, q) { return q.quality - p.quality; });
    var perRoom = new Map();
    list = list.filter(function (e) { var u = perRoom.get(e.room) || 0; perRoom.set(e.room, u + 1); return u < 2; }).slice(0, BUCKET);
    pool.set(key, list); stats.kept++;
  });
  return best;
}

function save() {
  var entries = []; pool.forEach(function (v) { entries = entries.concat(v); });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out + '.tmp', JSON.stringify({ seed: args.seed, minPar: MIN_PAR, minutes: minutes, stats: stats, candidates: entries }));
  fs.renameSync(out + '.tmp', out);
}
function report() {
  var sec = (Date.now() - started) / 1000, bySize = {};
  pool.forEach(function (v, k) { var s = k.split('|')[0]; bySize[s] = (bySize[s] || 0) + v.length; });
  console.log(JSON.stringify(Object.assign({ min: +(sec / 60).toFixed(1), layoutsPerSec: Math.round(stats.layouts / sec) }, stats, { bySize: bySize })));
}

var lastSave = Date.now(), lastReport = Date.now();
var WPAR = [0, .1, .25, .45];
while (Date.now() < deadline) {
  stats.episodes++;
  var z = chooseSize(), cur = randomLayout(z);
  if (!cur) continue;
  var wPar = WPAR[rng() * WPAR.length | 0], curScore = evaluate(cur, wPar), stale = 0, limit = 300 + (rng() * 500 | 0);
  for (var it = 0; it < limit && stale < 150 && Date.now() < deadline; it++) {
    var cand = mutate(cur), sc = evaluate(cand, wPar);
    if (sc >= curScore - (rng() < .1 ? 2 : 0)) { if (sc > curScore) stale = 0; else stale++; cur = cand; curScore = sc; } else stale++;
    if (Date.now() - lastReport > 60000) { report(); lastReport = Date.now(); }
    if (Date.now() - lastSave > 120000) { save(); lastSave = Date.now(); }
  }
}
save(); report();
