'use strict';
/*
 * TILT — core engine.
 *
 * Pure, deterministic puzzle logic. No DOM, no canvas, no timers.
 * Loadable both as a browser global (window.TiltEngine) and as a CommonJS
 * module (tools/), so the solver validates the *exact* same code the player
 * runs.
 *
 * ---------------------------------------------------------------------------
 * THE MOVEMENT RULES — every stage has these
 * ---------------------------------------------------------------------------
 *
 *   1. The board is a grid of floor and wall cells.
 *   2. Tilting sends gravity one of four ways. Every block slides until
 *      something stops it — the edge, a wall, or another block.
 *   3. Nothing resolves mid-slide. Everything a cell does to a block, it does
 *      WHEN THE BOARD COMES TO REST, and only then.
 *   4. If resolving removed a block, gravity has not gone away — whatever was
 *      held up behind it now slides and the board settles again. That is where
 *      chain reactions come from.
 *
 * Rule 3 is the whole game. A goal is not a target you steer at; it is a cell a
 * block must be STOPPED on. Point gravity at the exit and the block sails over
 * the top of it into the far wall. To collect anything you first have to
 * arrange for something to be standing one cell beyond — the edge, a wall, or
 * another block you have not collected yet.
 *
 * Every board has one or two uniquely coloured blocks and exactly one matching
 * goal for each. A stage clears only when every block has stopped on its goal.
 * Blocks may stop each other, but contact itself never resolves or clears.
 *
 * ---------------------------------------------------------------------------
 * IDENTICAL BLOCKS ARE IDENTICAL
 * ---------------------------------------------------------------------------
 *
 * Two positions that differ only by swapping blocks OF THE SAME COLOUR are the
 * same position, and `stateKey` says so. That is not an optimisation bolted on
 * afterwards; it is what "these two blocks are the same block" means, and it
 * is why the solver agrees with the player about how long a stage really is.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var DIRS = ['U', 'R', 'D', 'L'];
  var DV = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };

  var FLOOR = 0, WALL = 1, HAZARD = 2;

  var ANY = 0;

  var BLOCK_CHARS = { 'A': 1, 'B': 2 };
  var GOAL_CHARS  = { 'a': 1, 'b': 2 };
  var COLOUR_NAME = ['any', 'A', 'B', 'C'];

  // The campaign has one win condition: both blocks reach their own goals.
  var WINS = ['allin'];

  /** Does a goal of this colour take a block of that colour? */
  function accepts(goalColour, blockColour) {
    return goalColour === blockColour;
  }

  // ---------------------------------------------------------------------------
  // Stage compilation
  // ---------------------------------------------------------------------------
  //
  //     '.'  floor            '#'  wall
  //     'a'  goal A           'A'  block A
  //     'b'  goal B           'B'  block B
  //     'c'  goal C           'C'  block C
  //
  // On a FORM board the goal characters mark TARGET cells rather than holes:
  // nothing is collected, and a block has to be left standing on each of them.

  function fail(def, msg) {
    throw new Error('stage ' + (def && def.id != null ? def.id : '?') + ': ' + msg);
  }

  function compile(def) {
    var rows = def.board;
    if (!rows || !rows.length) fail(def, 'board missing');

    var win = def.win || 'allin';
    if (WINS.indexOf(win) < 0) fail(def, 'unknown win condition "' + win + '"');

    var h = rows.length;
    var w = rows[0].length;
    var terrain = new Uint8Array(w * h);
    var goal = new Uint8Array(w * h);
    var goalColour = new Uint8Array(w * h);
    var blocks = [];                          // [x, y, colour]
    var y, x, i, ch;

    for (y = 0; y < h; y++) {
      if (rows[y].length !== w) fail(def, 'row ' + y + ' is ' + rows[y].length + ' wide, expected ' + w);
      for (x = 0; x < w; x++) {
        i = y * w + x;
        ch = rows[y][x];
        if (ch === '.') { /* floor */ }
        else if (ch === '#') { terrain[i] = WALL; }
        else if (ch === 'x') { terrain[i] = HAZARD; }
        else if (GOAL_CHARS[ch] !== undefined) { goal[i] = 1; goalColour[i] = GOAL_CHARS[ch]; }
        else if (BLOCK_CHARS[ch] !== undefined) { blocks.push([x, y, BLOCK_CHARS[ch]]); }
        else fail(def, 'unknown board character "' + ch + '" at ' + x + ',' + y);
      }
    }

    if (!blocks.length) fail(def, 'no blocks');

    var goalCells = [];
    for (i = 0; i < w * h; i++) if (goal[i]) goalCells.push(i);

    var colour = blocks.map(function (b) { return b[2]; });
    var collects = true;

    // Which blocks can ever leave the board? Under ALL IN and SELECT that is
    // the blocks whose colour some goal accepts; under MATCH and FORM nothing
    // is ever collected at all.
    var collectable = colour.map(function (c) {
      if (!collects) return 0;
      for (var g = 0; g < goalCells.length; g++) {
        if (accepts(goalColour[goalCells[g]], c)) return 1;
      }
      return 0;
    });
    var mustCollect = 0;
    for (i = 0; i < collectable.length; i++) mustCollect += collectable[i];

    // Every stage is deliberately the same small ruleset: one or two uniquely
    // coloured blocks, with exactly one matching goal each. Plain or wildcard
    // pieces are not accepted.
    if (blocks.length < 1 || blocks.length > 2) fail(def, 'needs one or two movable blocks');
    if (goalCells.length !== blocks.length) fail(def, 'needs exactly one goal per block');
    var blockCounts = { 1: 0, 2: 0 };
    var goalCounts = { 1: 0, 2: 0 };
    for (i = 0; i < colour.length; i++) blockCounts[colour[i]] = (blockCounts[colour[i]] || 0) + 1;
    for (i = 0; i < goalCells.length; i++) {
      var gc = goalColour[goalCells[i]];
      goalCounts[gc] = (goalCounts[gc] || 0) + 1;
    }
    if (blockCounts[1] > 1 || blockCounts[2] > 1 || blockCounts[0] || blockCounts[3]) {
      fail(def, 'blocks must be unique A/B colours');
    }
    if (goalCounts[1] !== blockCounts[1] || goalCounts[2] !== blockCounts[2] || goalCounts[0] || goalCounts[3]) {
      fail(def, 'each block needs exactly one matching goal');
    }

    var usesHazard = false;
    for (i = 0; i < terrain.length; i++) {
      if (terrain[i] === HAZARD) { usesHazard = true; break; }
    }
    var seen = {};
    for (i = 0; i < colour.length; i++) seen[colour[i]] = true;
    for (i = 0; i < goalCells.length; i++) seen[goalColour[goalCells[i]]] = true;
    var usesColour = !seen[ANY] || Object.keys(seen).length > 1;

    // A block cannot begin the stage standing somewhere it would immediately
    // die: that is not a puzzle, it is a typo.
    for (i = 0; i < blocks.length; i++) {
      if (terrain[blocks[i][1] * w + blocks[i][0]] === HAZARD) {
        fail(def, 'block starts on a hazard at ' + blocks[i][0] + ',' + blocks[i][1]);
      }
    }

    return {
      id: def.id,
      name: def.name || '',
      note: def.note || '',
      hint: def.hint || '',
      w: w, h: h,
      terrain: terrain,
      goal: goal,
      goalColour: goalColour,
      goalCells: goalCells,
      blocks: blocks,
      colour: colour,
      collectable: collectable,
      mustCollect: mustCollect,
      win: win,
      collects: collects,
      rules: { hazard: usesHazard, colour: usesColour, win: win },
      par: def.par != null ? def.par : null,
      def: def
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  function initialState(stage) {
    return {
      pos: stage.blocks.map(function (b) { return [b[0], b[1]]; }),
      alive: stage.blocks.map(function () { return 1; }),
      collected: 0,
      lost: 0,
      moves: 0
    };
  }

  function cloneState(s) {
    return {
      pos: s.pos.map(function (p) { return [p[0], p[1]]; }),
      alive: s.alive.slice(),
      collected: s.collected,
      lost: s.lost || 0,
      moves: s.moves
    };
  }

  /**
   * The identity of a position, as the player sees it.
   *
   * Blocks of one colour are interchangeable, so the key is the SET of cells
   * each colour occupies, not which block is where. The trailing count keeps a
   * hazard board honest: two positions can show the same blocks in the same
   * cells and have completely different futures, because one got here by
   * collecting and the other by losing.
   */
  function stateKey(s) {
    var cells = [];
    for (var i = 0; i < s.pos.length; i++) {
      if (s.alive[i]) cells.push(s.pos[i][0] + '.' + s.pos[i][1]);
    }
    cells.sort();
    return cells.join('|') + '~' + s.collected;
  }

  /** Colour-aware key. Falls back to the cheap one on single-colour stages. */
  function makeStateKey(stage) {
    if (!stage.rules.colour) return stateKey;
    var colour = stage.colour;
    return function (s) {
      var cells = [];
      for (var i = 0; i < s.pos.length; i++) {
        if (s.alive[i]) cells.push(colour[i] + ':' + s.pos[i][0] + '.' + s.pos[i][1]);
      }
      cells.sort();
      return cells.join('|') + '~' + s.collected;
    };
  }

  // ---------------------------------------------------------------------------
  // Winning
  // ---------------------------------------------------------------------------

  /** A non-zero lost count is retained for compatibility with saved states. */
  function isBroken(s) { return (s.lost || 0) > 0; }

  /** A position is clear only after every starting block reached its own goal. */
  function isClear(stage, s) {
    if (isBroken(s)) return false;
    return s.collected === s.pos.length;
  }

  function isTerminal(stage, s) { return isClear(stage, s) || isBroken(s); }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  //
  // A tilt is two things alternating until neither has anything left to do:
  //
  //   SETTLE   one "tick" = one pass in which every block advances at most one
  //            cell, front-most first. Repeating passes until nothing moves
  //            reproduces simultaneous sliding exactly and keeps trains of
  //            blocks correctly spaced.
  //
  //   RESOLVE  the board is now at rest. A block stopped on its matching goal
  //            is collected and frees its cell.
  //
  // If RESOLVE removed anything, gravity has not gone away, so SETTLE runs
  // again. That loop is the chain reaction — and it is the only way a chain can
  // happen, because nothing is ever collected in passing.
  //
  // Returns { state, moved, frames, events, clear, broken }.
  //   frames[t] = { pos, alive } snapshot after t ticks (frames[0] = start)
  //   events    = [{ t, type: 'goal'|'stop'|'lost', block, cell }]

  function simulate(stage, s0, dir, opts) {
    var wantFrames = !opts || opts.frames !== false;
    var d = DV[dir];
    if (!d) throw new Error('bad direction ' + dir);
    var dx = d[0], dy = d[1];
    var w = stage.w, h = stage.h, n = s0.pos.length;
    var colour = stage.colour;

    var pos = s0.pos.map(function (p) { return [p[0], p[1]]; });
    var alive = s0.alive.slice();
    var collected = s0.collected;
    var lost = s0.lost || 0;
    var i;

    var occ = new Int16Array(w * h).fill(-1);
    for (i = 0; i < n; i++) {
      if (alive[i]) occ[pos[i][1] * w + pos[i][0]] = i;
    }

    var frames = [];
    var events = [];
    var snapshot = function () {
      return { pos: pos.map(function (p) { return [p[0], p[1]]; }), alive: alive.slice() };
    };
    if (wantFrames) frames.push(snapshot());

    var movingLast = new Array(n).fill(false);
    var order = [];
    for (i = 0; i < n; i++) order.push(i);

    var lead = function (idx) { return pos[idx][0] * dx + pos[idx][1] * dy; };

    var guard = w * h * (n + 1) + 16;
    var anythingMoved = false;

    for (var round = 0; round <= n + 1; round++) {

      // ── SETTLE ────────────────────────────────────────────────────────────
      while (guard-- > 0) {
        var tIndex = frames.length;
        var live = order.filter(function (idx) { return alive[idx]; });
        // Front-most first; ties broken by index so a run is fully
        // deterministic. Blocks that tie are in parallel lanes and cannot
        // interact, so the tiebreak never changes the outcome — only the trace.
        live.sort(function (a, b) {
          var la = lead(a), lb = lead(b);
          return lb !== la ? lb - la : a - b;
        });

        var movedThisPass = false;
        var movingNow = new Array(n).fill(false);

        for (var q = 0; q < live.length; q++) {
          i = live[q];
          var nx = pos[i][0] + dx, ny = pos[i][1] + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (stage.terrain[ni] === WALL) continue;
          if (occ[ni] !== -1) continue;

          occ[pos[i][1] * w + pos[i][0]] = -1;
          pos[i][0] = nx; pos[i][1] = ny;
          occ[ni] = i;

          movedThisPass = true;
          anythingMoved = true;
          movingNow[i] = true;
        }

        if (wantFrames) {
          for (i = 0; i < n; i++) {
            if (movingLast[i] && !movingNow[i] && alive[i]) {
              events.push({ t: tIndex - 1, type: 'stop', block: i, cell: [pos[i][0], pos[i][1]] });
            }
          }
          movingLast = movingNow;
        }

        if (!movedThisPass) break;
        if (wantFrames) frames.push(snapshot());
      }

      // ── RESOLVE ───────────────────────────────────────────────────────────
      var restTick = frames.length;
      var removed = 0;
      for (i = 0; i < n; i++) {
        if (!alive[i]) continue;
        var at = pos[i][1] * w + pos[i][0];

        if (stage.collects && stage.goal[at] && accepts(stage.goalColour[at], colour[i])) {
          alive[i] = 0;
          collected++;
          occ[at] = -1;
          removed++;
          events.push({ t: restTick, type: 'goal', block: i, cell: [pos[i][0], pos[i][1]] });
        } else if (stage.terrain[at] === HAZARD) {
          alive[i] = 0;
          lost++;
          occ[at] = -1;
          removed++;
          events.push({ t: restTick, type: 'lost', block: i, cell: [pos[i][0], pos[i][1]] });
        }
      }

      if (!removed) break;
      if (wantFrames) frames.push(snapshot());
      movingLast = new Array(n).fill(false);
    }

    var state = {
      pos: pos,
      alive: alive,
      collected: collected,
      lost: lost,
      moves: s0.moves + (anythingMoved ? 1 : 0)
    };

    return {
      state: state,
      moved: anythingMoved,
      frames: frames,
      events: events,
      clear: isClear(stage, state),
      broken: isBroken(state)
    };
  }

  /** Fast path for search: the next state only, or null if nothing moved. */
  function step(stage, s, dir) {
    var r = simulate(stage, s, dir, { frames: false });
    return r.moved ? r.state : null;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Breadth-first search for the shortest solution.
   * Returns { solvable, moves, path, visited, truncated }.
   */
  function solve(stage, from, limitNodes) {
    var key = makeStateKey(stage);
    var start = from ? cloneState(from) : initialState(stage);
    var cap = limitNodes || 400000;
    if (isClear(stage, start)) return { solvable: true, moves: 0, path: [], visited: 1, truncated: false };
    if (isBroken(start)) return { solvable: false, moves: -1, path: null, visited: 1, truncated: false };

    var seen = Object.create(null);
    seen[key(start)] = true;
    var queue = [{ s: start, path: [] }];
    var head = 0, visited = 1;

    while (head < queue.length) {
      if (visited > cap) return { solvable: false, moves: -1, path: null, visited: visited, truncated: true };
      var node = queue[head++];
      for (var di = 0; di < 4; di++) {
        var dir = DIRS[di];
        var ns = step(stage, node.s, dir);
        if (!ns) continue;
        var k = key(ns);
        if (seen[k]) continue;
        seen[k] = true;
        visited++;
        var path = node.path.concat(dir);
        if (isClear(stage, ns)) return { solvable: true, moves: path.length, path: path, visited: visited, truncated: false };
        if (isBroken(ns)) continue;
        queue.push({ s: ns, path: path });
      }
    }
    return { solvable: false, moves: -1, path: null, visited: visited, truncated: false };
  }

  /** Every position reachable from the start. */
  function reachable(stage, from, limitNodes) {
    var key = makeStateKey(stage);
    var start = from ? cloneState(from) : initialState(stage);
    var cap = limitNodes || 400000;
    var seen = Object.create(null);
    var list = [];
    seen[key(start)] = true;
    var queue = [start];
    var head = 0;
    while (head < queue.length && list.length <= cap) {
      var s = queue[head++];
      list.push(s);
      if (isTerminal(stage, s)) continue;
      for (var di = 0; di < 4; di++) {
        var ns = step(stage, s, DIRS[di]);
        if (!ns) continue;
        var k = key(ns);
        if (seen[k]) continue;
        seen[k] = true;
        queue.push(ns);
      }
    }
    return list;
  }

  /**
   * The whole reachable position graph in one pass.
   *
   * Everything the design tools want to know is a question about this graph.
   * Building it once and answering from it is both exact and far cheaper than
   * re-walking the board per question. Returns null if the graph exceeds `cap`.
   */
  function graph(stage, cap) {
    cap = cap || 200000;
    var key = makeStateKey(stage);
    var start = initialState(stage);
    var index = Object.create(null);
    var states = [start], keys = [key(start)];
    var next = [], clear = [isClear(stage, start) ? 1 : 0], broken = [0], dist = [0];
    index[keys[0]] = 0;

    for (var i = 0; i < states.length; i++) {
      var row = [0, 0, 0, 0];
      if (!clear[i] && !broken[i]) {
        for (var d = 0; d < 4; d++) {
          var ns = step(stage, states[i], DIRS[d]);
          if (!ns) { row[d] = i; continue; }
          var k = key(ns);
          var at = index[k];
          if (at == null) {
            if (states.length >= cap) return null;
            at = states.length;
            index[k] = at;
            states.push(ns); keys.push(k);
            clear.push(isClear(stage, ns) ? 1 : 0);
            broken.push(isBroken(ns) ? 1 : 0);
            dist.push(dist[i] + 1);
          }
          row[d] = at;
        }
      } else {
        row = [i, i, i, i];
      }
      next.push(row);
    }

    return {
      states: states, keys: keys, next: next,
      clear: clear, broken: broken, dist: dist, n: states.length
    };
  }

  return {
    DIRS: DIRS, DV: DV,
    FLOOR: FLOOR, WALL: WALL, HAZARD: HAZARD, ANY: ANY,
    BLOCK_CHARS: BLOCK_CHARS, GOAL_CHARS: GOAL_CHARS, COLOUR_NAME: COLOUR_NAME,
    WINS: WINS,
    accepts: accepts,
    compile: compile,
    initialState: initialState,
    cloneState: cloneState,
    stateKey: stateKey,
    makeStateKey: makeStateKey,
    isClear: isClear,
    isBroken: isBroken,
    isTerminal: isTerminal,
    simulate: simulate,
    step: step,
    solve: solve,
    reachable: reachable,
    graph: graph
  };
});

