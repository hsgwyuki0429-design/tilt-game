'use strict';
/*
 * TILT — re-check a 4x4 index against the engine the player actually runs.
 *
 *   node tools/verify-4x4.js tools/4x4-index.json
 *
 * tools/search-4x4.js measures boards with its own specialised copy of the
 * simulation, because a census of tens of millions of boards cannot afford the
 * general one. This tool exists so that nothing in the census has to be taken
 * on trust: every board it kept is compiled with src/engine.js, solved again by
 * the engine's own breadth-first search, and then played through the stored
 * solution one swipe at a time.
 *
 * Three things have to agree, per board:
 *
 *   1. the engine compiles it — one or two penguins, one aurora each, and no
 *      block standing anywhere it could not legally start;
 *   2. the engine's shortest solution is the same length as the stored par;
 *   3. replaying the stored solution move by move clears the board, and no
 *      shorter prefix of it does.
 */

var fs = require('fs');
var path = require('path');
var Engine = require(path.join(__dirname, '..', 'src', 'engine.js'));

var file = process.argv[2] || path.join(__dirname, '4x4-index.json');
var index = JSON.parse(fs.readFileSync(file, 'utf8'));

var checked = 0, failures = [];
var pars = Object.keys(index.boards).map(Number).sort(function (a, b) { return a - b; });

pars.forEach(function (par) {
  index.boards[par].forEach(function (entry, i) {
    var where = 'par ' + par + ' #' + i + ' [' + entry.rows.join('/') + ']';
    var stage;
    try {
      stage = Engine.compile({ id: where, board: entry.rows });
    } catch (e) {
      failures.push(where + ': will not compile — ' + e.message);
      return;
    }
    if (entry.rows.length !== 4 || entry.rows.some(function (r) { return r.length !== 4; })) {
      failures.push(where + ': not a 4x4 board');
      return;
    }
    if (entry.moves !== par) {
      failures.push(where + ': stored under par ' + par + ' but says ' + entry.moves);
    }

    var solved = Engine.solve(stage, null, 4000000);
    if (!solved.solvable) {
      failures.push(where + ': the engine cannot solve it');
      return;
    }
    if (solved.moves !== par) {
      failures.push(where + ': par ' + par + ', engine finds ' + solved.moves);
      return;
    }

    // replay the stored solution, and check nothing shorter already cleared
    var s = Engine.initialState(stage), moves = entry.solution.split('');
    if (moves.length !== par) {
      failures.push(where + ': solution is ' + moves.length + ' moves, par ' + par);
      return;
    }
    for (var m = 0; m < moves.length; m++) {
      if (Engine.isClear(stage, s)) {
        failures.push(where + ': already clear after ' + m + ' of ' + par + ' moves');
        return;
      }
      var r = Engine.simulate(stage, s, moves[m], { frames: false });
      if (!r.moved) { failures.push(where + ': move ' + (m + 1) + ' (' + moves[m] + ') moves nothing'); return; }
      if (r.broken) { failures.push(where + ': move ' + (m + 1) + ' breaks the run'); return; }
      s = r.state;
    }
    if (!Engine.isClear(stage, s)) {
      failures.push(where + ': the stored solution does not clear the board');
      return;
    }
    checked++;
  });
});

// The census is a claim about counts, and a wrong one is invisible. Re-derive
// the two totals that have to hold whatever was measured.
var byPar = index.census.byPar, sum = 0;
Object.keys(byPar).forEach(function (m) { sum += byPar[m]; });
if (sum + index.census.unsolvable !== index.census.measured) {
  failures.push('census: ' + sum + ' solvable + ' + index.census.unsolvable +
    ' unsolvable does not equal ' + index.census.measured + ' measured');
}

console.log(checked + ' boards re-solved with src/engine.js across par ' +
  pars[0] + '…' + pars[pars.length - 1]);
if (failures.length) {
  console.error('\n' + failures.length + ' FAILURES:');
  failures.slice(0, 40).forEach(function (f) { console.error('  ' + f); });
  if (failures.length > 40) console.error('  … and ' + (failures.length - 40) + ' more');
  process.exit(1);
}
console.log('every board compiles, re-solves to its stored par, and is cleared by its stored solution.');
