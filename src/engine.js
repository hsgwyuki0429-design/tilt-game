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
 * THE BASE RULES — every stage has these
 * ---------------------------------------------------------------------------
 *
 *   1. The board is a grid of floor and wall cells. Some floor cells are goals.
 *   2. Tilting sends gravity one of four ways. Every block slides until
 *      something stops it — the edge, a wall, or another block.
 *   3. A block that arrives on a goal it fits is collected and leaves,
 *      mid-slide. That is where chain reactions come from.
 *   4. CLEAR when every block has been collected.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEVICES — a stage may use one, or neither
 * ---------------------------------------------------------------------------
 *
 * These are not "advanced modes" and they are not difficulty knobs. Each one
 * exists because it creates a kind of thinking the base rules cannot ask for,
 * and a stage is allowed to use one only when that thinking is the point of
 * the stage. Most stages use neither.
 *
 *   HAZARD  'x'   A block LEFT STANDING on a hazard when the board settles is
 *                 lost. Sliding across one is completely safe.
 *
 *       Why this version. The obvious hazard — "touch it and die" — is a wall
 *       that lies about being a wall, and it only ever asks the player to
 *       avoid a region. This version asks the one question the whole game is
 *       built on, and asks it much harder: WHERE DOES THIS BLOCK STOP? A
 *       hazard cell is not a place you must keep away from; it is a place you
 *       are free to travel through and forbidden to park on. That turns "the
 *       dangerous square" from an obstacle into a piece of machinery — you
 *       route blocks straight over it on purpose, and the puzzle is arranging
 *       for something to be there to catch them.
 *
 *   COLOUR  'A'/'a', 'B'/'b'   A goal collects a block only when they match.
 *                 'o' takes any block; a plain '@' fits only 'o'.
 *
 *       Why. Not "two puzzles side by side" — the point is that a goal is a
 *       hole for one block and an ordinary floor tile for the other. A block
 *       of the wrong colour rolls straight over it and carries on being a
 *       WALL somewhere else. So collecting in the wrong order does not merely
 *       waste moves, it removes a wall you needed, and the blocks stop being
 *       interchangeable in the player's head as well as in the solver's.
 *
 * Nothing else is coming. There is no cell that teleports, no block that
 * behaves differently from another block of its own colour, no hidden state,
 * and no randomness anywhere in this file. A stage is hard because of where
 * things are and the order they have to be moved in.
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

  // Colour 0 means "no colour". On a block it is the plain '@'; on a goal it is
  // the plain 'o', which takes anything.
  var ANY = 0;

  var BLOCK_CHARS = { '@': ANY, 'A': 1, 'B': 2 };
  var GOAL_CHARS  = { 'o': ANY, 'a': 1, 'b': 2 };
  var COLOUR_NAME = ['any', 'A', 'B'];

  /** Does a goal of this colour take a block of that colour? */
  function accepts(goalColour, blockColour) {
    return goalColour === ANY || goalColour === blockColour;
  }

  // ---------------------------------------------------------------------------
  // Stage compilation
  // ---------------------------------------------------------------------------
  //
  // A stage is one ASCII picture:
  //
  //     '.'  floor            '#'  wall           'x'  hazard
  //     'o'  goal, any        '@'  block, any
  //     'a'  goal, colour A   'A'  block, colour A
  //     'b'  goal, colour B   'B'  block, colour B
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
    var goal = new Uint8Array(w * h);        // 0 = not a goal
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

    var goalCount = 0;
    for (i = 0; i < w * h; i++) if (goal[i]) goalCount++;
    if (!goalCount) fail(def, 'no goals');

    // Which devices does this board actually use? The tools read this to keep
    // a stage honest about how many rules it is asking the player to hold.
    var usesHazard = false;
    for (i = 0; i < w * h; i++) if (terrain[i] === HAZARD) usesHazard = true;
    var colours = {};
    for (i = 0; i < blocks.length; i++) colours[blocks[i][2]] = true;
    for (i = 0; i < w * h; i++) if (goal[i]) colours[goalColour[i]] = true;
    var usesColour = !colours[ANY] || Object.keys(colours).length > 1;

    // A block cannot begin the stage standing somewhere it would immediately
    // die: that is not a puzzle, it is a typo.
    for (i = 0; i < blocks.length; i++) {
      if (terrain[blocks[i][1] * w + blocks[i][0]] === HAZARD) {
        fail(def, 'block starts on a hazard at ' + blocks[i][0] + ',' + blocks[i][1]);
      }
    }

    // Every block must have somewhere it could go, or the stage is a lie.
    for (i = 0; i < blocks.length; i++) {
      var c = blocks[i][2], reachable = false;
      for (var g = 0; g < w * h; g++) if (goal[g] && accepts(goalColour[g], c)) reachable = true;
      if (!reachable) fail(def, 'block of colour ' + COLOUR_NAME[c] + ' has no goal that accepts it');
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
      blocks: blocks,
      colour: blocks.map(function (b) { return b[2]; }),
      rules: { hazard: usesHazard, colour: usesColour },
      par: def.par != null ? def.par : null,
      def: def
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  // A state is a live position per block. `alive[i] === 0` means block i is off
  // the board — collected or lost — and its position is then meaningless.

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
   * each colour occupies, not which block is where. Sorting is what makes two
   * boards that differ only by a swap compare equal — and since the physics
   * treats same-coloured blocks identically, they really do have the same
   * future.
   *
   * The trailing count is what keeps a hazard board honest. Two positions can
   * show exactly the same blocks in exactly the same cells and still have
   * completely different futures — one got here by collecting a block, the
   * other by losing one. Without the count the solver would happily plan a
   * route through a board it had already broken.
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

  function isClear(s) { return s.collected === s.pos.length; }

  /**
   * A position with a lost block can never be cleared again, because clearing
   * needs every block. Such a state is a leaf: the player must undo. Search
   * treats it as terminal rather than pretending there is something past it.
   */
  function isBroken(s) { return (s.lost || 0) > 0; }
  function isTerminal(s) { return isClear(s) || isBroken(s); }

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
  // Hazards resolve only once the whole board has come to rest, which is what
  // makes "you may cross one, you may not park on one" true rather than
  // approximately true. A block that pauses mid-slide because something is in
  // its way has not stopped; it is waiting, and it is safe while it waits.
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
    var tIndex = 0;

    while (guard-- > 0) {
      tIndex = frames.length;   // the frame index this pass will produce
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
        // it can keep going inside this same slide. A goal that does not take
        // this colour is not a goal to this block: it is floor, and the block
        // rolls straight over it.
        if (stage.goal[ni] && accepts(stage.goalColour[ni], colour[i])) {
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

    // ── the board is now at rest ──────────────────────────────────────────────
    // Anything still standing on a hazard has stopped there, and stopping there
    // is the one thing a hazard does not allow.
    if (stage.rules.hazard && anythingMoved) {
      var died = [];
      for (i = 0; i < n; i++) {
        if (!alive[i]) continue;
        if (stage.terrain[pos[i][1] * w + pos[i][0]] === HAZARD) died.push(i);
      }
      if (died.length) {
        var lostTick = frames.length;   // one extra tick, so the loss is seen
        for (k = 0; k < died.length; k++) {
          i = died[k];
          alive[i] = 0;
          lost++;
          occ[pos[i][1] * w + pos[i][0]] = -1;
          events.push({ t: lostTick, type: 'lost', block: i, cell: [pos[i][0], pos[i][1]] });
        }
        if (wantFrames) frames.push(snapshot());
      }
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
      clear: isClear(state),
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
    if (isClear(start)) return { solvable: true, moves: 0, path: [], visited: 1, truncated: false };
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
        if (isClear(ns)) return { solvable: true, moves: path.length, path: path, visited: visited, truncated: false };
        if (isBroken(ns)) continue;                   // nothing lies past a broken board
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
      if (isTerminal(s)) continue;
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
   *   broken  1 if the node has lost a block and can never clear
   *   dist    moves from the start (breadth-first, so shortest)
   */
  function graph(stage, cap) {
    cap = cap || 200000;
    var key = makeStateKey(stage);
    var start = initialState(stage);
    var index = Object.create(null);
    var states = [start], keys = [key(start)];
    var next = [], clear = [isClear(start) ? 1 : 0], broken = [0], dist = [0];
    index[keys[0]] = 0;

    for (var i = 0; i < states.length; i++) {
      var row = [0, 0, 0, 0];
      if (!clear[i] && !broken[i]) {
        for (var d = 0; d < 4; d++) {
          var ns = step(stage, states[i], DIRS[d]);
          if (!ns) { row[d] = i; continue; }     // a tilt that changes nothing
          var k = key(ns);
          var at = index[k];
          if (at == null) {
            if (states.length >= cap) return null;
            at = states.length;
            index[k] = at;
            states.push(ns); keys.push(k);
            clear.push(isClear(ns) ? 1 : 0);
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
