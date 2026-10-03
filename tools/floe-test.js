'use strict';
/*
 * The floe accelerator must agree with the engine on every transition it is
 * asked about. This compares tools/lib/floe.js with src/engine.js on random
 * positions over random floe shapes, including half-collected positions and
 * one-penguin boards, and checks the event bits against the engine's frames.
 */
var E = require('../src/engine.js');
var F = require('./lib/floe.js');

var seed = 20261003;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(list) { return list[Math.floor(rnd() * list.length)]; }

var checked = 0, brakes = 0, chains = 0, homes = 0;
function fail(msg) { console.error('FAIL ' + msg); process.exit(1); }

for (var trial = 0; trial < 1500; trial++) {
  var w = 4, h = 4, floor = new Uint8Array(16);
  do {
    for (var c = 0; c < 16; c++) floor[c] = rnd() < 0.72 ? 1 : 0;
  } while (!F.isWholeFloe(w, h, floor) || floor.reduce(function (s, v) { return s + v; }, 0) < 5);
  var floe = new F.Floe(w, h, floor), cells = floe.cells.slice();
  var single = rnd() < 0.2;
  var gA = pick(cells), rest = cells.filter(function (x) { return x !== gA; });
  var gB = single ? -1 : pick(rest);
  var free = cells.filter(function (x) { return x !== gA && x !== gB; });
  var a0 = pick(free), b0 = single ? floe.n : pick(free.filter(function (x) { return x !== a0; }));
  if (!single && b0 === undefined) continue;
  var rows = F.boardRows(floe, gA, gB, a0, b0);
  var stage = E.compile({ id: 'floe', board: rows });
  var g = floe.graph(gA, gB);
  for (var k = 0; k < 40; k++) {
    var s = pick(g.ids);
    if (s === g.clearId) continue;
    var a = (s / g.B) | 0, b = s % g.B;
    var st = E.initialState(stage);
    // The engine orders blocks as they appear in the rows: map colours.
    for (var i = 0; i < stage.blocks.length; i++) {
      var cell = stage.colour[i] === 1 ? a : b;
      if (cell === floe.n) { st.alive[i] = 0; st.collected++; st.pos[i] = [0, 0]; }
      else st.pos[i] = [cell % w, (cell / w) | 0];
    }
    for (var d = 0; d < 4; d++) {
      var r = E.simulate(stage, st, F.DIRS[d]);
      var expA = floe.n, expB = floe.n;
      for (i = 0; i < stage.blocks.length; i++) {
        if (!r.state.alive[i]) continue;
        var at = r.state.pos[i][1] * w + r.state.pos[i][0];
        if (stage.colour[i] === 1) expA = at; else expB = at;
      }
      var want = r.moved ? expA * g.B + expB : -1;
      var got = g.next[s * 4 + d];
      if (got !== want) fail(rows.join('/') + ' state ' + a + ',' + b + ' dir ' + F.DIRS[d] + ' engine ' + want + ' floe ' + got);
      if (r.moved) {
        var ev = g.ev[s * 4 + d];
        var gotHome = ((ev & F.EV.HOME_A) ? 1 : 0) + ((ev & F.EV.HOME_B) ? 1 : 0);
        var wantHome = r.events.filter(function (e) { return e.type === 'goal'; }).length;
        if (gotHome !== wantHome) fail('home count ' + rows.join('/') + ' ' + F.DIRS[d]);
        // A brake bit means the braked penguin's final cell has its partner
        // directly ahead on the engine's resting frame, or it was collected there.
        if (ev & (F.EV.BRAKE_A | F.EV.BRAKE_B)) brakes++;
        if (ev & F.EV.CHAIN) chains++;
        if (gotHome) homes++;
      }
      checked++;
    }
  }
}
if (brakes < 100 || chains < 10 || homes < 100) fail('coverage too thin: ' + brakes + ' brakes, ' + chains + ' chains, ' + homes + ' homes');
console.log('floe accelerator agrees with the engine on ' + checked + ' transitions (' +
  brakes + ' brakes, ' + chains + ' chain glides, ' + homes + ' collections)');
