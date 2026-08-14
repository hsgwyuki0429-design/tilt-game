'use strict';
/*
 * TILT — core engine.
 *
 * Pure, deterministic puzzle logic. No DOM, no canvas, no timers.
 * Loadable both as a browser global (window.TiltEngine) and as a CommonJS
 * module (tools/), so the solver validates the *exact* same code the player
 * runs.
 *
 * THE RULES. All of them:
 *
 *   1. The board is a grid of floor and wall cells. Some floor cells are goals.
 *   2. Every block is the same block: one cell, no colour, no special case.
 *   3. Tilting sends gravity one of four ways. Every block slides until
 *      something stops it — the edge, a wall, or another block.
 *   4. A block that arrives on a goal is collected and leaves, mid-slide.
 *      That is where chain reactions come from.
 *   5. CLEAR when every block has been collected.
 *
 * There is no sixth rule, and there will not be one. Nothing on the board can
 * destroy a block, no block behaves differently from any other, and no cell is
 * forbidden. A stage is hard because of where the walls, blocks and goals are
 * and because of the order they have to be moved in — never because the rules
 * grew.
 *
 * Because every block is identical, two positions that differ only by swapping
 * blocks ARE the same position, and `stateKey` says so. That is not an
 * optimisation bolted on afterwards; it is what "all blocks are the same"
 * means, and it is why the solver agrees with the player about how long a
 * stage really is.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var DIRS = ['U', 'R', 'D', 'L'];
  var DV = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };

  var FLOOR = 0, WALL = 1;

  // ---------------------------------------------------------------------------
  // Stage compilation
  // ---------------------------------------------------------------------------
  //
  // A stage is one ASCII picture, because there is only one kind of everything:
  //
  //     '.'  floor        '#'  wall
  //     'o'  goal         '@'  block (standing on floor)
  //
  //   board: ['@..',
  //           '.#.',
  //           '..o']

  function fail(def, msg) {
    throw new Error('stage ' + (def && def.id != null ? def.id : '?') + ': ' + msg);
  }

  function compile(def) {
    var rows = def.board;
    if (!rows || !rows.length) fail(def, 'board missing');

    var h = rows.length;
    var w = rows[0].length;
    var terrain = new Uint8Array(w * h);
    var goal = new Uint8Array(w * h);
    var blocks = [];
    var y, x, i, ch;

    for (y = 0; y < h; y++) {
      if (rows[y].length !== w) fail(def, 'row ' + y + ' is ' + rows[y].length + ' wide, expected ' + w);
      for (x = 0; x < w; x++) {
        i = y * w + x;
        ch = rows[y][x];
        if (ch === '.') { /* floor */ }
        else if (ch === '#') { terrain[i] = WALL; }
        else if (ch === 'o') { goal[i] = 1; }
        else if (ch === '@') { blocks.push([x, y]); }
        else fail(def, 'unknown board character "' + ch + '" at ' + x + ',' + y);
      }
    }

    if (!blocks.length) fail(def, 'no blocks');

    var goalCount = 0;
    for (i = 0; i < w * h; i++) if (goal[i]) goalCount++;
    if (!goalCount) fail(def, 'no goals');

    return {
      id: def.id,
      name: def.name || '',
      note: def.note || '',
      hint: def.hint || '',
      w: w, h: h,
      terrain: terrain,
      goal: goal,
      blocks: blocks,
      par: def.par != null ? def.par : null,
      def: def
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  // A state is a live position per block. `alive[i] === 0` means block i has
  // already been collected, and its position is then meaningless.

  function initialState(stage) {
    return {
      pos: stage.blocks.map(function (b) { return [b[0], b[1]]; }),
      alive: stage.blocks.map(function () { return 1; }),
      collected: 0,
      moves: 0
    };
  }

  function cloneState(s) {
    return {
      pos: s.pos.map(function (p) { return [p[0], p[1]]; }),
      alive: s.alive.slice(),
      collected: s.collected,
      moves: s.moves
    };
  }

  /**
   * The identity of a position, as the player sees it.
   *
   * Blocks are interchangeable, so the key is the SET of occupied cells, not
   * which block is where. Sorting is what makes two boards that differ only by
   * a swap compare equal — and since the physics treats every block the same,
   * they really do have the same future.
   */
  function stateKey(s) {
    var cells = [];
    for (var i = 0; i < s.pos.length; i++) {
      if (s.alive[i]) cells.push(s.pos[i][0] + '.' + s.pos[i][1]);
    }
    cells.sort();
    return cells.join('|');
  }

  function isClear(s) { return s.collected === s.pos.length; }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  //
  // One "tick" = one pass in which every block advances at most one cell,
  // front-most first. Repeating passes until nothing moves reproduces
  // simultaneous sliding exactly, keeps trains of blocks correctly spaced, and
  // lets a collected block free the cell behind it inside the same slide —
  // which is precisely the chain reaction.
  //
  // Returns { state, moved, frames, events, clear }.
  //   frames[t] = { pos, alive } snapshot after t ticks (frames[0] = start)
  //   events    = [{ t, type: 'goal'|'stop', block, cell }]

  function simulate(stage, s0, dir, opts) {
    var wantFrames = !opts || opts.frames !== false;
    var d = DV[dir];
    if (!d) throw new Error('bad direction ' + dir);
    var dx = d[0], dy = d[1];
    var w = stage.w, h = stage.h, n = s0.pos.length;

    var pos = s0.pos.map(function (p) { return [p[0], p[1]]; });
    var alive = s0.alive.slice();
    var collected = s0.collected;
    var i, k;

    // Live occupancy grid: -1 empty, else block index.
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

    // How far "downstream" a block is along the gravity axis.
    var lead = function (idx) { return pos[idx][0] * dx + pos[idx][1] * dy; };

    var guard = w * h * (n + 1) + 16;
    var anythingMoved = false;

    while (guard-- > 0) {
      var tIndex = frames.length;   // the frame index this pass will produce
      var live = order.filter(function (idx) { return alive[idx]; });
      // Front-most first; ties broken by index so a run is fully deterministic.
      // Blocks that tie are in parallel lanes and cannot interact, so the
      // tiebreak never changes the outcome — only the trace.
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

        // The goal drains the instant the block arrives, so whatever is behind
        // it can keep going inside this same slide.
        if (stage.goal[ni]) {
          alive[i] = 0;
          collected++;
          occ[ni] = -1;
          events.push({ t: tIndex, type: 'goal', block: i, cell: [nx, ny] });
        }
      }

      // A block that was sliding and has now stopped: that is an impact.
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

    var state = {
      pos: pos,
      alive: alive,
      collected: collected,
      moves: s0.moves + (anythingMoved ? 1 : 0)
    };

    return {
      state: state,
      moved: anythingMoved,
      frames: frames,
      events: events,
      clear: isClear(state)
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
    var start = from ? cloneState(from) : initialState(stage);
    var cap = limitNodes || 400000;
    if (isClear(start)) return { solvable: true, moves: 0, path: [], visited: 1, truncated: false };

    var seen = Object.create(null);
    seen[stateKey(start)] = true;
    var queue = [{ s: start, path: [] }];
    var head = 0, visited = 1;

    while (head < queue.length) {
      if (visited > cap) return { solvable: false, moves: -1, path: null, visited: visited, truncated: true };
      var node = queue[head++];
      for (var di = 0; di < 4; di++) {
        var dir = DIRS[di];
        var ns = step(stage, node.s, dir);
        if (!ns) continue;
        var key = stateKey(ns);
        if (seen[key]) continue;
        seen[key] = true;
        visited++;
        var path = node.path.concat(dir);
        if (isClear(ns)) return { solvable: true, moves: path.length, path: path, visited: visited, truncated: false };
        queue.push({ s: ns, path: path });
      }
    }
    return { solvable: false, moves: -1, path: null, visited: visited, truncated: false };
  }

  /** Every position reachable from the start. */
  function reachable(stage, from, limitNodes) {
    var start = from ? cloneState(from) : initialState(stage);
    var cap = limitNodes || 400000;
    var seen = Object.create(null);
    var list = [];
    seen[stateKey(start)] = true;
    var queue = [start];
    var head = 0;
    while (head < queue.length && list.length <= cap) {
      var s = queue[head++];
      list.push(s);
      if (isClear(s)) continue;
      for (var di = 0; di < 4; di++) {
        var ns = step(stage, s, DIRS[di]);
        if (!ns) continue;
        var key = stateKey(ns);
        if (seen[key]) continue;
        seen[key] = true;
        queue.push(ns);
      }
    }
    return list;
  }

  /**
   * The whole reachable position graph in one pass.
   *
   * Everything the design tools want to know — how long the stage really is,
   * how many optimal lines it has, how much of it is a dead end, how lucky a
   * random player could get — is a question about this graph. Building it once
   * and answering from it is both exact and far cheaper than re-walking the
   * board per question.
   *
   * Returns null if the graph exceeds `cap`, which is the tools' signal that a
   * board is too sprawling to be worth measuring.
   *
   *   keys    canonical key per node, in breadth-first order from the start
   *   next    next[i][d] = node index after tilting DIRS[d], or i if nothing moved
   *   clear   1 if the node is a cleared board
   *   dist    moves from the start (breadth-first, so shortest)
   */
  function graph(stage, cap) {
    cap = cap || 200000;
    var start = initialState(stage);
    var index = Object.create(null);
    var states = [start], keys = [stateKey(start)];
    var next = [], clear = [isClear(start) ? 1 : 0], dist = [0];
    index[keys[0]] = 0;

    for (var i = 0; i < states.length; i++) {
      var row = [0, 0, 0, 0];
      if (!clear[i]) {
        for (var d = 0; d < 4; d++) {
          var ns = step(stage, states[i], DIRS[d]);
          if (!ns) { row[d] = i; continue; }     // a tilt that changes nothing
          var k = stateKey(ns);
          var at = index[k];
          if (at == null) {
            if (states.length >= cap) return null;
            at = states.length;
            index[k] = at;
            states.push(ns); keys.push(k);
            clear.push(isClear(ns) ? 1 : 0);
            dist.push(dist[i] + 1);
          }
          row[d] = at;
        }
      } else {
        row = [i, i, i, i];
      }
      next.push(row);
    }

    return { states: states, keys: keys, next: next, clear: clear, dist: dist, n: states.length };
  }

  return {
    DIRS: DIRS, DV: DV,
    FLOOR: FLOOR, WALL: WALL,
    compile: compile,
    initialState: initialState,
    cloneState: cloneState,
    stateKey: stateKey,
    isClear: isClear,
    simulate: simulate,
    step: step,
    solve: solve,
    reachable: reachable,
    graph: graph
  };
});
