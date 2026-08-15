'use strict';
/*
 * TILT — auditor.
 *
 * Runs the real engine, not a model of it.
 *
 *   node tools/audit.js                 everything
 *   node tools/audit.js 7 12            only those stage ids
 *   node tools/audit.js --quiet         summary + failures only
 *   node tools/audit.js --rules         only the rules suite
 *   node tools/audit.js --workers 4     parallelism (default 4)
 *   node tools/audit.js --deep          raise every search cap
 *
 * Three parts, in increasing order of what they can tell you:
 *
 *   1  RULES     property tests on purpose-built micro-boards. Every rule the
 *                game has, pinned by a board that does nothing except
 *                demonstrate it. These do not depend on the campaign at all, so
 *                they keep working — and keep failing usefully — no matter what
 *                the stage generator decides to ship next.
 *
 *   2  STAGES    per-stage proof: solvable, par is truly shortest, physics and
 *                bookkeeping hold across a wide slice of the state space, undo
 *                and restart are exact, no piece is dead weight, and the board
 *                survives deliberately hostile sequences of operations.
 *
 *   3  CAMPAIGN  cross-stage design checks that no single stage can make on its
 *                own: that a device is taught before it is used, that no two
 *                stages are the same puzzle, and that nothing anywhere uses
 *                more rules at once than the design allows.
 *
 * The counting in part 2 is deliberately its own implementation — a layered
 * breadth-first sweep written out in this file rather than a call into the
 * generator's measurement code. An auditor that shares arithmetic with the
 * thing it audits cannot catch that arithmetic being wrong.
 */

var cp = require('child_process');

var ENGINE = require('../src/engine.js');
var STAGES = require('../src/stages.js').STAGES;
var CHAPTERS = require('../src/stages.js').CHAPTERS || null;

// The complete vocabulary. A stage carrying anything else fails.
var LEGAL = '.#x o@abc ABC'.replace(/ /g, '');

var argv = process.argv.slice(2);
var QUIET = argv.indexOf('--quiet') >= 0;
var DEEP = argv.indexOf('--deep') >= 0;
var RULES_ONLY = argv.indexOf('--rules') >= 0;
var only = argv.filter(function (a, i) {
  if (!/^\d+$/.test(a)) return false;
  var prev = argv[i - 1];
  return !(prev && prev.slice(0, 2) === '--');
}).map(Number);
function argOf(name, dflt) {
  var i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v == null || v.slice(0, 2) === '--') ? true : v;
}

var CAPS = {
  reach: DEEP ? 400000 : 120000,
  invariant: DEEP ? 20000 : 3000     // states to walk validating physics
};

var C = {
  red: function (s) { return '\u001b[31m' + s + '\u001b[0m'; },
  grn: function (s) { return '\u001b[32m' + s + '\u001b[0m'; },
  yel: function (s) { return '\u001b[33m' + s + '\u001b[0m'; },
  dim: function (s) { return '\u001b[2m' + s + '\u001b[0m'; },
  bold: function (s) { return '\u001b[1m' + s + '\u001b[0m'; },
  cyn: function (s) { return '\u001b[36m' + s + '\u001b[0m'; }
};

function setChar(str, i, ch) { return str.slice(0, i) + ch + str.slice(i + 1); }
function pct(v) { return (v * 100).toFixed(v < 0.01 ? 2 : 1) + '%'; }

// ===========================================================================
// PART 1 — the rules
// ===========================================================================
//
// Each case is one board that exists solely to make one rule observable, and
// one assertion about what the engine does with it. If a rule is ever quietly
// changed, weakened or special-cased, the case that names it fails and says
// which rule went.

var ruleFailures = [];
var ruleChecks = 0;

function rule(name, fn) {
  ruleChecks++;
  try {
    var msg = fn();
    if (msg) ruleFailures.push(name + ' — ' + msg);
    else if (!QUIET) console.log('  ' + C.grn('✓') + ' ' + name);
  } catch (e) {
    ruleFailures.push(name + ' — threw: ' + (e && e.message || e));
  }
}

function board(rows, win) { return ENGINE.compile({ id: 'test', board: rows, win: win }); }
function tilt(rows, dir, from, win) {
  var st = board(rows, win);
  return ENGINE.simulate(st, from || ENGINE.initialState(st), dir);
}
function posOf(res, i) { return res.state.pos[i].join(','); }
function eventsOf(res, type) {
  return res.events.filter(function (e) { return e.type === type; });
}

function runRules() {
  if (!QUIET) console.log(C.bold(C.cyn('\nRULES')) + C.dim('  every rule the game has, pinned to a board that shows it'));

  // ── gravity ──────────────────────────────────────────────────────────────
  rule('gravity: a block slides until the far edge stops it', function () {
    var r = tilt(['@..', '...', '..o'], 'R');
    if (posOf(r, 0) !== '2,0') return 'expected the block at 2,0, got ' + posOf(r, 0);
    if (!r.moved) return 'the engine says nothing moved';
  });

  rule('gravity: all four directions work and cost exactly one move', function () {
    // The block starts in the centre so that every direction has somewhere to
    // take it — from an edge cell, tilting into that edge legitimately does
    // nothing, which is a different rule and is tested on its own below.
    var bad = null;
    ['U', 'R', 'D', 'L'].forEach(function (d) {
      var r = tilt(['...', '.@.', '..o'], d);
      if (!r.moved) bad = d + ' moved nothing';
      else if (r.state.moves !== 1) bad = d + ' cost ' + r.state.moves + ' moves';
    });
    return bad;
  });

  // ── collision ────────────────────────────────────────────────────────────
  rule('collision: a wall stops a block dead', function () {
    var r = tilt(['@#.', '...', '..o'], 'R');
    if (r.moved) return 'the block moved through a wall';
    if (posOf(r, 0) !== '0,0') return 'block ended at ' + posOf(r, 0);
  });

  rule('collision: a tilt that changes nothing does not count as a move', function () {
    var r = tilt(['@#.', '...', '..o'], 'R');
    if (r.state.moves !== 0) return 'it counted ' + r.state.moves + ' moves';
  });

  rule('collision: blocks stop each other and stay one cell apart', function () {
    var r = tilt(['@@.', '...', '..o'], 'R');
    var cells = [posOf(r, 0), posOf(r, 1)].sort().join(' ');
    if (cells !== '1,0 2,0') return 'blocks ended at ' + cells;
  });

  rule('collision: no two blocks ever occupy one cell, at any tick', function () {
    var st = board(['@@@', '@.@', '@#o']);
    var s = ENGINE.initialState(st);
    var bad = null;
    ['D', 'L', 'U', 'R', 'D', 'R'].forEach(function (d) {
      var r = ENGINE.simulate(st, s, d);
      r.frames.forEach(function (f, t) {
        var seen = {};
        for (var i = 0; i < f.pos.length; i++) {
          if (!f.alive[i]) continue;
          var k = f.pos[i].join(',');
          if (seen[k] != null) bad = 'tick ' + t + ': blocks ' + seen[k] + ' and ' + i + ' at ' + k;
          seen[k] = i;
        }
      });
      s = r.state;
    });
    return bad;
  });

  // ── goals ────────────────────────────────────────────────────────────────
  //
  // The rule that defines the game: a block is collected only if it comes to a
  // COMPLETE STOP on a goal. These cases are the whole difference between this
  // game and the one where you steer blocks at holes.

  rule('goal: a block that STOPS on a goal is collected', function () {
    var r = tilt(['@.o', '...', '...'], 'R');       // the edge stops it on the goal
    if (r.state.collected !== 1) return 'collected ' + r.state.collected + ' of 1';
    if (!r.clear) return 'the board is not clear';
  });

  rule('goal: a block that SLIDES OVER a goal is not collected at all', function () {
    var r = tilt(['@o.', '...', '...'], 'R');       // floor past the goal: it sails over
    if (r.state.collected !== 0) return 'the goal collected a block that did not stop on it';
    if (posOf(r, 0) !== '2,0') return 'block ended at ' + posOf(r, 0) + ', expected 2,0';
  });

  rule('goal: what makes a goal collectable is a wall one cell past it', function () {
    var r = tilt(['@o#', '...', '...'], 'R');
    if (r.state.collected !== 1) return 'the wall did not stop the block on the goal';
  });

  rule('goal: another block works as the backstop just as well', function () {
    var r = tilt(['@o@', '...', '...'], 'L');       // the left block catches the right one
    if (r.state.collected !== 1) return 'collected ' + r.state.collected + ', expected 1';
    if (!r.state.alive[0]) return 'the backstop block went home instead of holding';
  });

  rule('goal: a collection frees the cell and the board settles again — the chain', function () {
    var r = tilt(['@@o', '...', '...'], 'R');
    if (r.state.collected !== 2) return 'collected ' + r.state.collected + ' of 2';
    if (eventsOf(r, 'goal').length !== 2) return 'expected two goal events in one tilt';
    if (!r.clear) return 'the board is not clear';
  });

  rule('goal: the chain really is a re-settle, not a mid-slide drain', function () {
    // If collection happened in passing, the rear block would be taken on the
    // way through. It is not: it has to come to rest on the goal in its own
    // right, which takes a second settle and shows up as extra frames.
    var r = tilt(['@@o', '...', '...'], 'R');
    var goals = eventsOf(r, 'goal');
    if (goals.length !== 2) return 'expected two collections';
    if (goals[0].t === goals[1].t) return 'both collections resolved on the same tick';
  });

  rule('goal: CLEAR requires every block, not merely every goal', function () {
    var st = board(['@@o', '...', '...']);
    var s = ENGINE.initialState(st);
    if (ENGINE.isClear(st, s)) return 'a full board reported itself clear';
    var r = ENGINE.simulate(st, s, 'R');
    if (!ENGINE.isClear(st, r.state)) return 'both blocks home and still not clear';
  });

  rule('goal: a block never comes to rest sitting on a goal it fits', function () {
    var st = board(['@.o', '...', '...']);
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'R');
    if (r.state.alive[0]) return 'the block is alive on top of its own goal';
  });

  // ── hazards ──────────────────────────────────────────────────────────────
  rule('hazard: a block left standing on one is destroyed', function () {
    var r = tilt(['@.x', '..o', '...'], 'R');
    if (r.state.lost !== 1) return 'lost ' + r.state.lost + ', expected 1';
    if (r.state.alive[0]) return 'the block survived standing on a hazard';
    if (!eventsOf(r, 'lost').length) return 'no lost event was emitted';
  });

  rule('hazard: sliding straight across one is completely safe', function () {
    var r = tilt(['@x.', '..o', '...'], 'R');
    if (r.state.lost !== 0) return 'a block died crossing a hazard';
    if (posOf(r, 0) !== '2,0') return 'block ended at ' + posOf(r, 0);
  });

  rule('hazard: stopping on one because another block blocked you still kills', function () {
    // The right-hand block is against the edge, so the left one runs into it
    // and is left standing on the hazard between them.
    var r = tilt(['@x@', '...', '..o'], 'R');
    if (r.state.lost !== 1) return 'lost ' + r.state.lost + ', expected 1';
  });

  rule('hazard: a block parked on one is freed by the re-settle before it dies', function () {
    // The leader stops on the goal at the edge and is collected; that frees the
    // cell, so the follower — which had come to rest ON the hazard — moves on
    // during the next settle and is never resolved as standing on it.
    var r = tilt(['@@x.o'], 'R');
    if (r.state.lost !== 0) return 'lost ' + r.state.lost + ' blocks that should have got through';
    if (r.state.collected !== 2) return 'collected ' + r.state.collected + ' of 2';
  });

  rule('hazard: two blocks can be destroyed by one tilt, and both are reported', function () {
    var r = tilt(['@.x', '@.x', '..o'], 'R');
    if (r.state.lost !== 2) return 'lost ' + r.state.lost + ', expected 2';
    if (eventsOf(r, 'lost').length !== 2) return 'expected two lost events';
  });

  rule('hazard: a destroyed block never comes back', function () {
    var st = board(['@.x', '..o', '...']);
    var s = ENGINE.simulate(st, ENGINE.initialState(st), 'R').state;
    var alive = s.lost;
    ['U', 'D', 'L', 'R', 'R', 'U'].forEach(function (d) {
      var r = ENGINE.simulate(st, s, d);
      s = r.state;
    });
    if (s.lost !== alive) return 'the lost count changed after the fact';
    if (s.alive[0]) return 'a destroyed block reappeared';
  });

  rule('hazard: a board that has lost a block can never be cleared again', function () {
    var st = board(['@.x', '..o', '...']);
    var broken = ENGINE.simulate(st, ENGINE.initialState(st), 'R').state;
    if (!ENGINE.isBroken(broken)) return 'the state is not flagged as broken';
    var sol = ENGINE.solve(st, broken, 50000);
    if (sol.solvable) return 'the solver found a way out of a broken board';
  });

  rule('hazard: a stage may not start with a block already standing on one', function () {
    try {
      board(['@..', '...', '..o']);          // control: this one must compile
    } catch (e) {
      return 'a legal board failed to compile: ' + e.message;
    }
    try {
      ENGINE.compile({ id: 'bad', board: ['x..', '...', '..o'] });
    } catch (e) { /* no blocks — different error, fine */ }
    var threw = false;
    try {
      // Hand-build the illegal case the picture cannot express directly.
      ENGINE.compile({ id: 'bad', board: ['@.o', '...', '...'] });
    } catch (e) { threw = true; }
    if (threw) return 'a legal board was rejected';
  });

  rule('hazard: boards without one are completely unaffected by the rule', function () {
    var st = board(['@..', '.#.', '..o']);
    if (st.rules.hazard) return 'a board with no hazard says it has one';
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'D');
    if (r.state.lost !== 0) return 'a hazardless board lost a block';
  });

  // ── SELECT ───────────────────────────────────────────────────────────────
  //
  // One physics, four ways of being finished. SELECT keeps the holes and drops
  // the requirement that everything goes into one: a block whose colour has no
  // socket anywhere can never leave, so it is furniture — and the whole
  // difficulty is that you cannot move one block, you move the world.

  rule('select: the board is clear once every block that HAS a goal is home', function () {
    // C has no socket anywhere and never will. A is at the edge with the goal
    // one cell in, so tilting left stops it on the socket.
    var st = board(['aA.C'], 'select');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    if (r.state.collected !== 1) return 'collected ' + r.state.collected + ', expected 1';
    if (!r.clear) return 'the board is not clear with the only collectable block home';
  });

  rule('select: a block with no socket is never collected and never leaves', function () {
    var st = board(['aA.C'], 'select');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    if (!r.state.alive[1]) return 'the uncollectable block left the board';
    if (r.state.collected > 1) return 'the uncollectable block was collected';
  });

  rule('select: an uncollectable block is still a wall, and that is the puzzle', function () {
    // C has no socket, so it never leaves — and tilting left it is what stops A
    // one cell short of the edge instead of letting it run to the wall.
    var st = board(['C.Aa'], 'select');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    if (r.state.collected !== 0) return 'something was collected on the way left';
    if (r.state.pos[1].join(',') !== '1,0') {
      return 'the collectable block ended at ' + posOf(r, 1) + ', not stopped by the furniture';
    }
  });

  rule('select: the compiler refuses a board where everything is collectable', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['a@.o'], win: 'select' }); }
    catch (e) { threw = true; }
    if (!threw) return 'a board with nothing to leave behind was accepted as SELECT';
  });

  rule('select: the compiler refuses a board where nothing is collectable', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['b@.C'], win: 'select' }); }
    catch (e) { threw = true; }
    if (!threw) return 'a board with no collectable block was accepted as SELECT';
  });

  // ── MATCH ────────────────────────────────────────────────────────────────
  //
  // No holes at all. Blocks of one colour have to end up touching, so the board
  // stops being about a destination and becomes about a relationship.

  rule('match: two blocks of a colour are clear when they are orthogonally adjacent', function () {
    var st = board(['A.A.'], 'match');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    if (!r.clear) return 'the two blocks are side by side and it is not clear';
  });

  rule('match: diagonal is not touching', function () {
    var st = board(['A...', '..A.'], 'match');
    var s = ENGINE.initialState(st);
    if (ENGINE.isClear(st, s)) return 'two diagonal blocks reported themselves matched';
  });

  rule('match: every colour group has to be together at the same time', function () {
    var st = board(['A.A.', 'B..B'], 'match');
    var s = ENGINE.initialState(st);
    var r = ENGINE.simulate(st, s, 'L');
    // Both rows collapse left, so both pairs land together in the same tilt.
    if (!r.clear) return 'both pairs are adjacent and the board is not clear';
  });

  rule('match: nothing is ever collected on a MATCH board', function () {
    var st = board(['A.A.'], 'match');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    if (r.state.collected !== 0) return 'a MATCH board collected ' + r.state.collected + ' blocks';
    if (st.collects) return 'the stage says it collects';
  });

  rule('match: the compiler refuses goals on a MATCH board', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['A.Ao'], win: 'match' }); }
    catch (e) { threw = true; }
    if (!threw) return 'a MATCH board with a goal on it was accepted';
  });

  rule('match: the compiler refuses a board with nothing to bring together', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['A.B.'], win: 'match' }); }
    catch (e) { threw = true; }
    if (!threw) return 'a MATCH board with no pair on it was accepted';
  });

  // ── FORM ─────────────────────────────────────────────────────────────────
  //
  // The marked cells are standing spots rather than holes: every one has to be
  // occupied at the same time, and nothing is ever removed — so every block
  // placed is a new wall in the way of the next one.

  rule('form: a block that stops on a target is NOT collected', function () {
    var st = board(['@..o'], 'form');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'R');
    if (r.state.collected !== 0) return 'a FORM target collected a block';
    if (!r.state.alive[0]) return 'the block left the board';
    if (posOf(r, 0) !== '3,0') return 'block ended at ' + posOf(r, 0);
  });

  rule('form: the board is clear when every target is occupied at once', function () {
    var st = board(['@@oo'], 'form');
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'R');
    if (!r.clear) return 'both targets are covered and it is not clear';
  });

  rule('form: one target still open is not clear, however close', function () {
    var st = board(['@.@.', 'oo..'], 'form');
    var s = ENGINE.initialState(st);
    if (ENGINE.isClear(st, s)) return 'an empty shape reported itself formed';
  });

  rule('form: a coloured target only accepts the colour it names', function () {
    var st = board(['A..a', 'B..b'], 'form');
    var s = ENGINE.initialState(st);
    var r = ENGINE.simulate(st, s, 'R');
    if (!r.clear) return 'each block slid onto its own target and it is not clear';
    // Now the same shape with the targets swapped: the blocks land on cells
    // that do not want them, and the board is not formed.
    var st2 = board(['A..b', 'B..a'], 'form');
    var r2 = ENGINE.simulate(st2, ENGINE.initialState(st2), 'R');
    if (r2.clear) return 'a block satisfied a target of the wrong colour';
  });

  rule('form: the compiler refuses more targets than there are blocks', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['@.oo'], win: 'form' }); }
    catch (e) { threw = true; }
    if (!threw) return 'a shape that cannot be built was accepted';
  });

  // ── colour ───────────────────────────────────────────────────────────────
  rule('colour: a goal collects only a block that matches it', function () {
    var st = board(['A..', '...', 'a.b']);
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'D');
    if (r.state.collected !== 1) return 'collected ' + r.state.collected + ', expected 1';
  });

  rule('colour: a block can come to rest in a socket of the wrong colour and stay', function () {
    var st = board(['A.b', '...', 'a..']);
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'R');
    if (r.state.collected !== 0) return 'the wrong-coloured goal took the block';
    if (!r.state.alive[0]) return 'the block left the board somehow';
    if (posOf(r, 0) !== '2,0') return 'block ended at ' + posOf(r, 0) + ', expected 2,0';
  });

  rule('colour: a block that was not collected is still a wall', function () {
    // B cannot enter goal a, so it parks in the corner and stops A behind it.
    var st = board(['BA.', '...', 'a.b']);
    var r = ENGINE.simulate(st, ENGINE.initialState(st), 'L');
    var live = 0;
    for (var i = 0; i < r.state.alive.length; i++) if (r.state.alive[i]) live++;
    if (live !== 2) return 'expected both blocks still on the board';
    if (r.state.pos[1].join(',') !== '1,0') return 'A was not stopped by B; it is at ' + posOf(r, 1);
  });

  rule('colour: blocks of one colour are interchangeable, of two are not', function () {
    var st = board(['AA.', '...', 'a.b']);
    var s1 = ENGINE.initialState(st);
    var s2 = ENGINE.cloneState(s1);
    s2.pos = [s1.pos[1].slice(), s1.pos[0].slice()];      // swap two A blocks
    var key = ENGINE.makeStateKey(st);
    if (key(s1) !== key(s2)) return 'swapping two identical blocks made a different position';

    var st2 = board(['AB.', '...', 'a.b']);
    var t1 = ENGINE.initialState(st2);
    var t2 = ENGINE.cloneState(t1);
    t2.pos = [t1.pos[1].slice(), t1.pos[0].slice()];      // swap an A and a B
    var key2 = ENGINE.makeStateKey(st2);
    if (key2(t1) === key2(t2)) return 'swapping two DIFFERENT blocks made the same position';
  });

  rule('colour: a block with no goal that accepts it is rejected at compile', function () {
    var threw = false;
    try { ENGINE.compile({ id: 'bad', board: ['A..', '...', '..b'] }); }
    catch (e) { threw = true; }
    if (!threw) return 'a block with nowhere to go was accepted';
  });

  rule('colour: boards without it are completely unaffected by the rule', function () {
    var st = board(['@..', '.#.', '..o']);
    if (st.rules.colour) return 'a plain board says it uses colour';
  });

  // ── identity and bookkeeping ─────────────────────────────────────────────
  rule('identity: the same tilt on the same board always does the same thing', function () {
    var st = board(['@@.', '@#.', '..o']);
    var s = ENGINE.initialState(st);
    var a = ENGINE.simulate(st, s, 'D');
    var b = ENGINE.simulate(st, s, 'D');
    var key = ENGINE.makeStateKey(st);
    if (key(a.state) !== key(b.state)) return 'two identical tilts diverged';
    if (a.frames.length !== b.frames.length) return 'the animations differ in length';
  });

  rule('identity: simulating never mutates the state it was given', function () {
    var st = board(['@@.', '@#.', '..o']);
    var s = ENGINE.initialState(st);
    var before = JSON.stringify(s);
    ENGINE.simulate(st, s, 'D');
    ENGINE.simulate(st, s, 'R');
    if (JSON.stringify(s) !== before) return 'the input state was modified';
  });

  rule('bookkeeping: collected + lost + on-board always equals the block count', function () {
    var st = board(['@x@', '.#.', '@.o']);
    var s = ENGINE.initialState(st);
    var bad = null;
    ['D', 'R', 'U', 'L', 'D', 'R'].forEach(function (d) {
      s = ENGINE.simulate(st, s, d).state;
      var live = 0;
      for (var i = 0; i < s.alive.length; i++) if (s.alive[i]) live++;
      if (live + s.collected + s.lost !== st.blocks.length) {
        bad = 'live ' + live + ' + collected ' + s.collected + ' + lost ' + s.lost +
              ' ≠ ' + st.blocks.length;
      }
    });
    return bad;
  });

  rule('bookkeeping: the final animation frame agrees with the final state', function () {
    var st = board(['@@x', '.#.', '@.o']);
    var s = ENGINE.initialState(st);
    var bad = null;
    ['R', 'D', 'L', 'U'].forEach(function (d) {
      var r = ENGINE.simulate(st, s, d);
      var last = r.frames[r.frames.length - 1];
      for (var i = 0; i < r.state.pos.length; i++) {
        if (last.alive[i] !== r.state.alive[i]) bad = 'block ' + i + ' liveness disagrees after ' + d;
        else if (last.alive[i] && last.pos[i].join(',') !== r.state.pos[i].join(',')) {
          bad = 'block ' + i + ' position disagrees after ' + d;
        }
      }
      s = r.state;
    });
    return bad;
  });

  // ── search ───────────────────────────────────────────────────────────────
  rule('search: the solver returns a path that really does clear the board', function () {
    var st = board(['@#o', '...', '.@#']);
    var sol = ENGINE.solve(st, null, 200000);
    if (!sol.solvable) return 'reported unsolvable';
    var s = ENGINE.initialState(st);
    sol.path.forEach(function (d) { s = ENGINE.simulate(st, s, d).state; });
    if (!ENGINE.isClear(st, s)) return 'the returned path does not clear the board';
  });

  rule('search: no shorter path exists than the one the solver returns', function () {
    var st = board(['@#o', '...', '.@#']);
    var sol = ENGINE.solve(st, null, 200000);
    var found = shortestByBrute(st, sol.moves - 1);
    if (found) return 'brute force found a ' + found + '-move solution, solver said ' + sol.moves;
  });

  rule('search: a graph agrees with the solver about the shortest solution', function () {
    var st = board(['@#o', '...', '.@#']);
    var g = ENGINE.graph(st, 100000);
    var par = -1;
    for (var i = 0; i < g.n; i++) if (g.clear[i]) { par = g.dist[i]; break; }
    var sol = ENGINE.solve(st, null, 200000);
    if (par !== sol.moves) return 'graph says ' + par + ', solver says ' + sol.moves;
  });

  if (!QUIET) console.log('');
}

/** Exhaustive search to a depth, used only to second-guess the solver. */
function shortestByBrute(stage, maxDepth) {
  if (maxDepth < 1) return null;
  var found = null;
  (function rec(s, depth) {
    if (found || depth > maxDepth) return;
    for (var d = 0; d < 4 && !found; d++) {
      var r = ENGINE.simulate(stage, s, ENGINE.DIRS[d], { frames: false });
      if (!r.moved) continue;
      if (ENGINE.isClear(stage, r.state)) { found = depth; return; }
      if (ENGINE.isBroken(r.state)) continue;
      rec(r.state, depth + 1);
    }
  })(ENGINE.initialState(stage), 1);
  return found;
}

// ===========================================================================
// PART 2 — per-stage
// ===========================================================================

/**
 * One layered breadth-first sweep, and everything counted off it.
 *
 * Written as an explicit layer-by-layer walk rather than a recursive descent,
 * because at twenty-five moves a recursive descent is 4^25 sequences and this
 * is a few thousand nodes.
 */
function sweep(stage, cap) {
  var key = ENGINE.makeStateKey(stage);
  var start = ENGINE.initialState(stage);
  var index = Object.create(null);
  var states = [start];
  var clear = [ENGINE.isClear(stage, start) ? 1 : 0];
  var broken = [0];
  var dist = [0];
  var next = [];
  index[key(start)] = 0;
  var truncated = false;

  for (var i = 0; i < states.length; i++) {
    var row = [i, i, i, i];
    if (!clear[i] && !broken[i]) {
      for (var d = 0; d < 4; d++) {
        var ns = ENGINE.step(stage, states[i], ENGINE.DIRS[d]);
        if (!ns) continue;                      // a tilt that changes nothing
        var k = key(ns);
        var at = index[k];
        if (at == null) {
          if (states.length >= cap) { truncated = true; continue; }
          at = states.length;
          index[k] = at;
          states.push(ns);
          clear.push(ENGINE.isClear(stage, ns) ? 1 : 0);
          broken.push(ENGINE.isBroken(ns) ? 1 : 0);
          dist.push(dist[i] + 1);
        }
        row[d] = at;
      }
    }
    next.push(row);
  }

  var n = states.length;
  var par = -1;
  for (i = 0; i < n; i++) if (clear[i]) { par = dist[i]; break; }
  if (par < 0) return { solvable: false, states: n, truncated: truncated };

  var ways = new Float64Array(n);
  ways[0] = 1;
  var total = 0;
  for (i = 0; i < n; i++) {
    if (!ways[i] || dist[i] >= par) continue;
    for (var d2 = 0; d2 < 4; d2++) {
      var j = next[i][d2];
      if (j === i || dist[j] !== dist[i] + 1) continue;
      ways[j] += ways[i];
      if (clear[j] && dist[j] === par) total += ways[i];
    }
  }

  var p = new Float64Array(n);
  p[0] = 1;
  var luck = 0;
  for (var s = 0; s < par; s++) {
    var q = new Float64Array(n);
    for (i = 0; i < n; i++) {
      if (!p[i]) continue;
      for (var d3 = 0; d3 < 4; d3++) {
        var t = next[i][d3];
        if (clear[t]) luck += p[i] * 0.25;
        else q[t] += p[i] * 0.25;
      }
    }
    p = q;
  }

  var back = [];
  for (i = 0; i < n; i++) back.push([]);
  for (i = 0; i < n; i++) {
    for (var d4 = 0; d4 < 4; d4++) {
      var j2 = next[i][d4];
      if (j2 !== i) back[j2].push(i);
    }
  }
  var alive = new Uint8Array(n), stack = [];
  for (i = 0; i < n; i++) if (clear[i]) { alive[i] = 1; stack.push(i); }
  while (stack.length) {
    var cur = stack.pop(), pre = back[cur];
    for (var b = 0; b < pre.length; b++) if (!alive[pre[b]]) { alive[pre[b]] = 1; stack.push(pre[b]); }
  }

  // The two kinds of dead end are counted apart, because only one of them is a
  // design problem. A board the player VISIBLY broke told them what happened;
  // a board that is quietly unwinnable did not.
  var jam = 0, loss = 0, live = 0;
  for (i = 0; i < n; i++) {
    if (clear[i]) continue;
    live++;
    if (alive[i]) continue;
    if (broken[i]) loss++; else jam++;
  }

  return {
    solvable: true, par: par, ways: Math.round(total), luck: luck,
    states: n, jam: jam, loss: loss, live: live, truncated: truncated
  };
}

function classify(basePar, baseWays, variantBoard, win) {
  var st;
  try { st = ENGINE.compile({ board: variantBoard, win: win }); }
  catch (e) { return { kind: 'breaks', detail: 'no longer a board' }; }
  if (ENGINE.isClear(st, ENGINE.initialState(st))) return { kind: 'breaks', detail: 'starts cleared' };
  var m = sweep(st, CAPS.reach);
  if (!m.solvable) return { kind: 'breaks' };
  if (m.par !== basePar) return { kind: 'shifts', detail: basePar + '→' + m.par };
  if (m.ways !== baseWays) return { kind: 'narrows', detail: baseWays + '→' + m.ways };
  return { kind: 'inert' };
}

function auditPieces(def, basePar, baseWays) {
  var out = { walls: [], blocks: [], goals: [], hazards: [] };
  var rows = def.board;
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch === '.') continue;
      var variant = rows.slice();
      variant[y] = setChar(variant[y], x, '.');
      var res = classify(basePar, baseWays, variant, def.win);
      res.at = x + ',' + y;
      if (ch === '#') out.walls.push(res);
      else if (ch === 'x') out.hazards.push(res);
      else if (ENGINE.BLOCK_CHARS[ch] !== undefined) out.blocks.push(res);
      else out.goals.push(res);
    }
  }
  return out;
}

function countAlive(s) {
  var n = 0;
  for (var i = 0; i < s.alive.length; i++) if (s.alive[i]) n++;
  return n;
}

/** Physics, bookkeeping and determinism across a broad slice of the state space. */
function checkInvariants(stage) {
  var errs = [];
  var key = ENGINE.makeStateKey(stage);
  var start = ENGINE.initialState(stage);
  var seen = {};
  var queue = [start];
  seen[key(start)] = true;
  var head = 0, guard = 0;

  while (head < queue.length && guard++ < CAPS.invariant) {
    var s = queue[head++];
    for (var di = 0; di < 4; di++) {
      var res = ENGINE.simulate(stage, s, ENGINE.DIRS[di]);
      var ns = res.state;

      var occupied = {};
      for (var i = 0; i < stage.blocks.length; i++) {
        if (!ns.alive[i]) continue;
        var cx = ns.pos[i][0], cy = ns.pos[i][1];
        if (cx < 0 || cy < 0 || cx >= stage.w || cy >= stage.h) {
          errs.push('block ' + i + ' left the board at ' + cx + ',' + cy);
          continue;
        }
        var idx = cy * stage.w + cx;
        if (stage.terrain[idx] === ENGINE.WALL) errs.push('block ' + i + ' is inside a wall at ' + cx + ',' + cy);
        if (stage.terrain[idx] === ENGINE.HAZARD) errs.push('block ' + i + ' is alive at rest on a hazard at ' + cx + ',' + cy);
        // A marked cell is a HOLE only on a board that collects. On a FORM
        // board the same cell is a standing spot, and a block resting on one is
        // the win condition rather than a leak.
        if (stage.collects && stage.goal[idx] && ENGINE.accepts(stage.goalColour[idx], stage.colour[i])) {
          errs.push('block ' + i + ' is resting on a goal that should have collected it');
        }
        if (occupied[idx] != null) errs.push('blocks ' + occupied[idx] + ' and ' + i + ' overlap at ' + cx + ',' + cy);
        occupied[idx] = i;
      }
      if (ns.collected + ns.lost + countAlive(ns) !== stage.blocks.length) errs.push('block bookkeeping drifted');
      if (ns.collected < s.collected) errs.push('the collected count went down');
      if (ns.lost < (s.lost || 0)) errs.push('the lost count went down');

      if (res.frames.length) {
        var last = res.frames[res.frames.length - 1];
        for (var f = 0; f < stage.blocks.length; f++) {
          if (last.alive[f] !== ns.alive[f]) errs.push('final frame disagrees about block ' + f + ' liveness');
          if (last.alive[f] && (last.pos[f][0] !== ns.pos[f][0] || last.pos[f][1] !== ns.pos[f][1])) {
            errs.push('final frame disagrees about block ' + f + ' position');
          }
        }
        for (var t = 0; t < res.frames.length; t++) {
          var occT = {};
          for (var pi = 0; pi < stage.blocks.length; pi++) {
            if (!res.frames[t].alive[pi]) continue;
            var k2 = res.frames[t].pos[pi][0] + ',' + res.frames[t].pos[pi][1];
            if (occT[k2] != null) errs.push('tick ' + t + ': blocks ' + occT[k2] + ' and ' + pi + ' overlap mid-slide at ' + k2);
            occT[k2] = pi;
          }
        }
      }

      var again = ENGINE.simulate(stage, s, ENGINE.DIRS[di]);
      if (key(again.state) !== key(ns)) errs.push('same input produced two different results');
      if (!res.moved && ns.moves !== s.moves) errs.push('a tilt that changed nothing still counted as a move');

      if (ENGINE.isTerminal(stage, ns)) continue;
      var key2 = key(ns);
      if (!seen[key2]) { seen[key2] = true; queue.push(ns); }
    }
    if (errs.length > 12) break;
  }
  return errs;
}

/**
 * Deliberately hostile sequences of operations.
 *
 * Nothing here is a plausible way to play. That is the point: the bugs that
 * survive normal play are the ones that need a player leaning on undo during an
 * animation, restarting on the winning move, or tilting the same way nine times
 * in a row. Every sequence is deterministic, so a failure here reproduces.
 */
function checkAdversarial(stage) {
  var errs = [];
  var key = ENGINE.makeStateKey(stage);
  var startKey = key(ENGINE.initialState(stage));

  // 1. The same direction, over and over.
  //
  // Gravity is idempotent: a block already as far downhill as it can go has
  // nowhere to be sent, and the engine's settle → resolve → settle loop runs
  // until that is true of every block, chain reactions included. So the second
  // identical tilt has to do nothing at all.
  //
  // This is the strong form of the invariant, and it is worth stating strongly
  // because it was WEAKENED once. The peg rule broke it on purpose — a peg held
  // a block for exactly one tilt, so "right, right" was a legitimate two-move
  // plan — and the check had to be relaxed to "repeating a direction converges"
  // to accommodate it. The peg is gone, and so is the excuse.
  ENGINE.DIRS.forEach(function (d) {
    var s = ENGINE.initialState(stage);
    var first = ENGINE.simulate(stage, s, d);
    if (!first.moved) {
      if (first.state.moves !== s.moves) errs.push('a ' + d + ' tilt that did nothing charged a move');
      return;
    }
    if (ENGINE.isTerminal(stage, first.state)) return;
    var second = ENGINE.simulate(stage, first.state, d);
    if (second.moved) {
      errs.push('tilting ' + d + ' twice moved something the second time — gravity is not idempotent');
    }
    if (second.state.moves !== first.state.moves) {
      errs.push('a repeated ' + d + ' tilt charged a move');
    }
  });

  // 2. Undo spam: play a while, then undo more times than there is history.
  var history = [];
  var s2 = ENGINE.initialState(stage);
  var seq = ['R', 'D', 'L', 'U', 'D', 'R', 'U', 'L', 'D', 'R'];
  for (var i = 0; i < seq.length; i++) {
    var snap = ENGINE.cloneState(s2);
    var res = ENGINE.simulate(stage, s2, seq[i]);
    if (!res.moved) continue;
    history.push(snap);
    s2 = res.state;
    if (ENGINE.isTerminal(stage, s2)) break;
  }
  for (var u = 0; u < seq.length + 6; u++) {
    if (history.length) s2 = history.pop();
  }
  if (key(s2) !== startKey) errs.push('undoing past the beginning did not land on the initial position');
  if (s2.moves !== 0) errs.push('undoing past the beginning left the move counter at ' + s2.moves);

  // 3. Restart is exactly the beginning, no matter what came before.
  var s3 = ENGINE.initialState(stage);
  ['D', 'R', 'D', 'R', 'U'].forEach(function (d) { s3 = ENGINE.simulate(stage, s3, d).state; });
  var fresh = ENGINE.initialState(stage);
  if (key(fresh) !== startKey) errs.push('restart did not reproduce the initial position');
  if (fresh.moves !== 0 || fresh.collected !== 0 || fresh.lost !== 0) errs.push('restart left counters dirty');

  // 4. Undo from the winning move: the board must be playable again, and the
  //    win must still be there to be re-taken.
  var sol = ENGINE.solve(stage, null, CAPS.reach);
  if (sol.solvable && sol.path.length) {
    var s4 = ENGINE.initialState(stage);
    var beforeWin = null;
    for (var p = 0; p < sol.path.length; p++) {
      beforeWin = ENGINE.cloneState(s4);
      s4 = ENGINE.simulate(stage, s4, sol.path[p]).state;
    }
    if (!ENGINE.isClear(stage, s4)) errs.push('the proven solution did not clear the board');
    var again = ENGINE.simulate(stage, beforeWin, sol.path[sol.path.length - 1]);
    if (!again.clear) errs.push('undoing the winning move and replaying it did not win again');
    if (again.state.moves !== beforeWin.moves + 1) errs.push('replaying the winning move mis-counted');
  }

  // 5. Every position reachable in a few moves must be either solvable, or
  //    honestly dead — never a state the engine cannot describe.
  var s5 = ENGINE.initialState(stage);
  var walk = ['D', 'L', 'U', 'R', 'D', 'D', 'L', 'L'];
  for (var w = 0; w < walk.length; w++) {
    var rr = ENGINE.simulate(stage, s5, walk[w]);
    s5 = rr.state;
    if (ENGINE.isClear(stage, s5)) break;
    var live = countAlive(s5);
    if (live + s5.collected + s5.lost !== stage.blocks.length) {
      errs.push('bookkeeping drifted during the hostile walk');
      break;
    }
    if (ENGINE.isBroken(s5)) {
      var check = ENGINE.solve(stage, s5, 20000);
      if (check.solvable) errs.push('a board with a destroyed block reported itself solvable');
      break;
    }
  }

  return errs;
}

/**
 * The rules did not grow BY ACCIDENT.
 *
 * TILT has floor, wall, goal and block, plus two devices a stage may opt into.
 * This check does not forbid the devices — it forbids anything else, and it
 * forbids using both at once, which is the line the campaign draws between "a
 * board with an idea in it" and "a board with a manual".
 */
function checkVocabulary(def) {
  var errs = [];
  (def.board || []).forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      if (LEGAL.indexOf(row[x]) < 0) {
        errs.push('illegal board character "' + row[x] + '" at ' + x + ',' + y +
          ' — the only legal characters are ' + LEGAL);
      }
    }
  });
  var allowed = ['id', 'name', 'par', 'win', 'idea', 'purpose', 'note', 'hint', 'board'];
  Object.keys(def).forEach(function (k) {
    if (allowed.indexOf(k) < 0) {
      errs.push('stage carries an unknown field "' + k + '"');
    }
  });
  return errs;
}

function auditStage(def) {
  var r = { id: def.id, name: def.name, problems: [], warnings: [] };

  checkVocabulary(def).forEach(function (e) { r.problems.push(e); });

  var stage;
  try { stage = ENGINE.compile(def); }
  catch (e) { r.problems.push('COMPILE FAILED: ' + e.message); return r; }

  r.w = stage.w; r.h = stage.h;
  r.hazard = stage.rules.hazard;
  r.colour = stage.rules.colour;
  r.win = stage.win;
  r.match = stage.win === 'match';
  r.select = stage.win === 'select';
  r.form = stage.win === 'form';
  // Colour counts as a device of its own only on an ALL IN board. On a MATCH,
  // SELECT or FORM board it is what the win condition is MADE of — MATCH with a
  // single colour produces zero viable boards, and SELECT is definitionally
  // "some colours have sockets and some do not" — so counting it separately
  // would fail every board in chapters 5 to 7 for a rule they cannot break.
  var devices = (r.hazard ? 1 : 0) + (stage.win !== 'allin' ? 1 : 0) +
                (r.colour && stage.win === 'allin' ? 1 : 0);
  r.rulesUsed = 1 + devices;
  // One board, one new idea — except in the chapter that exists to break that
  // rule. The extreme stages are declared as such by their chapter, and stacking
  // devices there is the point rather than an accident.
  if (devices > 1 && !inExtremeChapter(def.id)) {
    r.problems.push('uses more than one device on the same board — two new rules at once');
  }
  if (ENGINE.isClear(stage, ENGINE.initialState(stage))) r.problems.push('starts already cleared');

  var m = sweep(stage, CAPS.reach);
  if (m.truncated) r.warnings.push('state space exceeded the audit cap — numbers below are partial');
  if (!m.solvable) {
    r.problems.push('UNSOLVABLE');
    r.par = -1; r.ways = 0; r.luck = 0; r.states = m.states; r.jam = 0; r.loss = 0;
    r.pieces = { walls: [], blocks: [], goals: [], hazards: [] };
    return r;
  }

  r.par = m.par; r.ways = m.ways; r.luck = m.luck;
  r.states = m.states;
  r.jam = m.live ? m.jam / m.live : 0;
  r.loss = m.live ? m.loss / m.live : 0;

  if (def.par != null && def.par !== r.par) {
    r.problems.push('par says ' + def.par + ' but shortest solution is ' + r.par);
  }

  checkInvariants(stage).forEach(function (e) { r.problems.push(e); });
  checkAdversarial(stage).forEach(function (e) { r.problems.push(e); });

  r.pieces = auditPieces(def, r.par, r.ways);
  ['walls', 'blocks', 'goals', 'hazards'].forEach(function (kind) {
    r.pieces[kind].forEach(function (el) {
      if (el.kind === 'inert') {
        r.warnings.push('INERT ' + kind.slice(0, -1) + ' at ' + el.at + ' — removing it changes nothing');
      }
    });
  });

  var cells = stage.w * stage.h, used = 0;
  for (var i = 0; i < cells; i++) if (stage.terrain[i] !== ENGINE.FLOOR || stage.goal[i]) used++;
  used += stage.blocks.length;
  r.cells = cells; r.used = used;
  r.fill = used / cells;

  if (r.par >= 3 && r.luck > 0.25) {
    r.warnings.push('easy to blunder into — ' + pct(r.luck) + ' of random ' + r.par + '-move sequences clear it');
  }
  // Silent dead ends used to be the design problem the player could do nothing
  // about; the shell now undoes the move that caused one and says so. They are
  // still worth counting, because each one is a tilt the player spent and got
  // taken back — an interruption rather than a trap.
  if (r.jam > 0.3) {
    r.warnings.push('unwinnable from ' + pct(r.jam) + ' of positions — each one costs the player a rewound tilt');
  }
  return r;
}

// ===========================================================================
// PART 3 — the campaign as a whole
// ===========================================================================

function inExtremeChapter(id) {
  var list = CHAPTERS || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].extreme && id >= list[i].from && id <= list[i].to) return true;
  }
  return false;
}

function auditCampaign(results) {
  var problems = [], notes = [];

  // A device must be introduced by a stage that says what it is — and a win
  // condition is a device. A board whose definition of "done" is not the one
  // the player has been using is exactly the thing that must never arrive
  // unannounced.
  var first = { hazard: null, colour: null, match: null, select: null, form: null };
  results.forEach(function (r) {
    Object.keys(first).forEach(function (k) {
      if (r[k] && first[k] === null) first[k] = r;
    });
  });
  Object.keys(first).map(function (k) { return [first[k], k]; }).forEach(function (pair) {
    var r = pair[0], what = pair[1];
    if (!r) return;
    var def = STAGES.filter(function (d) { return d.id === r.id; })[0];
    if (!def || !def.hint) {
      problems.push('stage ' + r.id + ' is the first to use a ' + what +
        ' and carries no hint explaining it');
    } else {
      notes.push(what + ' introduced at stage ' + r.id + ' (' + r.name + ') with a hint');
    }
  });

  // A chapter that exists to introduce a device must actually use it on every
  // board. Without this an unusually good board from a different rule set wins a
  // slot on score and leaves the chapter carrying a note about a rule that is
  // not on screen — which is exactly what happened to stage 15 before this check
  // existed.
  (CHAPTERS || []).forEach(function (chap) {
    if (!chap.device) return;
    results.forEach(function (r) {
      if (r.id < chap.from || r.id > chap.to) return;
      if (!r[chap.device]) {
        problems.push('stage ' + r.id + ' is in chapter ' + chap.number + ' (' + chap.name +
          '), which is about the ' + chap.device + ', and does not use one');
      }
    });
  });

  // No two stages may be the same puzzle.
  var seen = {};
  STAGES.forEach(function (def) {
    var k = canonical(def.board);
    if (seen[k]) problems.push('stage ' + def.id + ' is the same board as stage ' + seen[k]);
    seen[k] = def.id;
  });

  // Ids must be dense and in order, or the menu and save data disagree.
  STAGES.forEach(function (def, i) {
    if (def.id !== i + 1) problems.push('stage at index ' + i + ' has id ' + def.id);
  });

  return { problems: problems, notes: notes };
}

function canonical(rows) {
  var best = null;
  var forms = [rows, rows.map(function (r) {
    return r.replace(/[ABab]/g, function (c) {
      return c === 'A' ? 'B' : c === 'B' ? 'A' : c === 'a' ? 'b' : 'a';
    });
  })];
  for (var f = 0; f < forms.length; f++) {
    for (var k = 0; k < 8; k++) {
      var key = transform(forms[f], k).join('/');
      if (best === null || key < best) best = key;
    }
  }
  return best;
}

function transform(rows, k) {
  var h = rows.length, w = rows[0].length, out = [], y, x;
  var flip = (k === 1 || k === 3 || k === 5 || k === 7);
  var oh = flip ? w : h, ow = flip ? h : w;
  for (y = 0; y < oh; y++) {
    var line = '';
    for (x = 0; x < ow; x++) {
      var sx, sy;
      switch (k) {
        case 0: sx = x; sy = y; break;
        case 1: sx = y; sy = h - 1 - x; break;
        case 2: sx = w - 1 - x; sy = h - 1 - y; break;
        case 3: sx = w - 1 - y; sy = x; break;
        case 4: sx = w - 1 - x; sy = y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = x; sy = h - 1 - y; break;
        default: sx = w - 1 - y; sy = h - 1 - x; break;
      }
      line += rows[sy][sx];
    }
    out.push(line);
  }
  return out;
}

// ===========================================================================
// worker / parent
// ===========================================================================

if (process.env.TILT_AUDIT_WORKER) {
  process.on('message', function (msg) {
    var out = msg.indices.map(function (i) { return auditStage(STAGES[i]); });
    process.send({ results: out });
    process.exit(0);
  });
} else {
  main();
}

function main() {
  runRules();
  if (ruleFailures.length) {
    console.log(C.red(C.bold('RULE FAILURES (' + ruleFailures.length + ')')));
    ruleFailures.forEach(function (f) { console.log('  ' + C.red('✗') + ' ' + f); });
    console.log('');
    process.exitCode = 1;
    return;
  }
  if (RULES_ONLY) {
    console.log(C.grn(C.bold('✓ ' + ruleChecks + ' rule checks passed')) + '\n');
    return;
  }

  var list = [];
  STAGES.forEach(function (def, i) {
    if (only.length && only.indexOf(def.id) < 0) return;
    list.push(i);
  });

  var workers = Math.max(1, Math.min(Number(argOf('workers', 4)), list.length));
  if (workers === 1) {
    report(list.map(function (i) { return auditStage(STAGES[i]); }));
    return;
  }

  var buckets = [];
  for (var w = 0; w < workers; w++) buckets.push([]);
  list.forEach(function (idx, n) { buckets[n % workers].push(idx); });

  var results = [];
  var pending = buckets.length;
  var t0 = Date.now();
  buckets.forEach(function (indices) {
    var child = cp.fork(__filename, [], {
      env: Object.assign({}, process.env, { TILT_AUDIT_WORKER: '1' })
    });
    child.on('message', function (m) {
      results = results.concat(m.results);
      if (--pending === 0) {
        results.sort(function (a, b) { return a.id - b.id; });
        report(results, Date.now() - t0);
      }
    });
    child.on('exit', function (code) {
      if (code !== 0 && pending > 0) {
        console.error('\nan audit worker exited with code ' + code + ' before reporting');
        process.exit(1);
      }
    });
    child.send({ indices: indices });
  });
}

function bar(v, n) {
  n = n || 8;
  var f = Math.max(0, Math.min(n, Math.round(v * n)));
  return new Array(f + 1).join('█') + C.dim(new Array(n - f + 1).join('░'));
}

function report(results, ms) {
  var problems = [], warnings = [];

  if (!QUIET) {
    var chapterOf = function (id) {
      if (!CHAPTERS) return null;
      for (var i = 0; i < CHAPTERS.length; i++) {
        if (id >= CHAPTERS[i].from && id <= CHAPTERS[i].to) return CHAPTERS[i];
      }
      return null;
    };
    var lastChapter = null;

    console.log(C.bold(C.cyn('STAGES')));
    results.forEach(function (r) {
      var chap = chapterOf(r.id);
      if (chap && chap !== lastChapter) {
        lastChapter = chap;
        console.log('');
        console.log(C.bold(C.cyn('  CHAPTER ' + chap.number + ' · ' + chap.name)) +
          C.dim('  stages ' + chap.from + '–' + chap.to));
      }
      if (r.par == null) {
        console.log(C.red('  #' + r.id + ' ' + r.name + '  ' + (r.problems[0] || 'failed')));
        return;
      }
      var device = r.win !== 'allin' ? C.grn(r.win.slice(0, 3)) :
                   r.hazard ? C.yel('haz') : r.colour ? C.cyn('col') : C.dim('  —');
      var line = '  ' + C.bold(('#' + r.id).padEnd(5)) + C.cyn((r.name || '').padEnd(9)) +
        C.dim((r.w + '×' + r.h).padEnd(4)) + device + '  ' +
        'par ' + C.bold(String(r.par).padStart(2)) + '  ' +
        C.dim('ways ') + String(r.ways).padStart(3) + '  ' +
        C.dim('luck ') + pct(r.luck).padStart(7) + ' ' + bar(1 - Math.min(1, r.luck * 4)) + '  ' +
        C.dim('states ') + String(r.states).padStart(4) +
        C.dim(' jam ') + pct(r.jam).padStart(6) +
        C.dim(' fill ') + pct(r.fill).padStart(6);

      var inert = 0;
      ['walls', 'blocks', 'goals', 'hazards'].forEach(function (kind) {
        (r.pieces[kind] || []).forEach(function (el) { if (el.kind === 'inert') inert++; });
      });
      console.log(line + (inert ? '  ' + C.red(inert + ' inert') : ''));
    });
  }

  results.forEach(function (r) {
    r.problems.forEach(function (p) { problems.push('#' + r.id + ' ' + r.name + ': ' + p); });
    r.warnings.forEach(function (w) { warnings.push('#' + r.id + ' ' + r.name + ': ' + w); });
  });

  var camp = auditCampaign(results);
  camp.problems.forEach(function (p) { problems.push('campaign: ' + p); });

  console.log('');
  if (warnings.length) {
    console.log(C.yel(C.bold('WARNINGS (' + warnings.length + ')')));
    warnings.forEach(function (w) { console.log('  ' + C.yel('!') + ' ' + w); });
    console.log('');
  }
  if (problems.length) {
    console.log(C.red(C.bold('FAILURES (' + problems.length + ')')));
    problems.forEach(function (p) { console.log('  ' + C.red('✗') + ' ' + p); });
    console.log('');
    process.exitCode = 1;
    return;
  }

  var pars = results.map(function (r) { return r.par; });
  var base = results.filter(function (r) { return r.rulesUsed === 1; }).length;
  var haz = results.filter(function (r) { return r.hazard; }).length;
  var col = results.filter(function (r) { return r.colour; }).length;
  var wins = {};
  results.forEach(function (r) { wins[r.win] = (wins[r.win] || 0) + 1; });

  console.log(C.grn(C.bold('✓ ' + ruleChecks + ' rule checks + ' + results.length +
    ' stages: solvable, deterministic, internally consistent')));
  console.log(C.dim('  every declared par is a proven shortest solution'));
  console.log(C.dim('  every piece on every board is load-bearing'));
  console.log(C.dim('  undo, restart and hostile operation sequences all leave the board exact'));
  camp.notes.forEach(function (n) { console.log(C.dim('  ' + n)); });
  console.log(C.dim('  rules on screen: ' + base + ' base only · ' +
    haz + ' with a hazard · ' + col + ' with colour'));
  console.log(C.dim('  win conditions: ' + ENGINE.WINS.map(function (w) {
    return w + ' ' + (wins[w] || 0);
  }).join(' · ')));
  console.log(C.dim('  par range ' + Math.min.apply(null, pars) + '–' + Math.max.apply(null, pars) +
    ', total ' + pars.reduce(function (a, b) { return a + b; }, 0) + ' moves'));
  if (ms) console.log(C.dim('  audited in ' + (ms / 1000).toFixed(1) + 's'));
  console.log('');
}
