'use strict';
/*
 * TILT — core engine.
 *
 * Pure, deterministic puzzle logic. No DOM, no canvas, no timers.
 * Loadable both as a browser global (window.TiltEngine) and as a CommonJS
 * module (tools/audit.js), so the solver validates the *exact* same code the
 * player runs.
 *
 * THE RULES (all of them):
 *   1. The board is a grid of FLOOR / WALL / PIT cells. Some cells carry a GOAL.
 *   2. Pieces are rigid groups of cells with a colour.
 *   3. Tilting sends gravity one of four ways; every piece slides as far as it can.
 *   4. A piece whose cells all rest on goals accepting its colour is COLLECTED.
 *      A piece whose cells all rest on pits is LOST.
 *      Both happen mid-slide — that is where chain reactions come from.
 *   5. CLEAR when every piece is collected and none was lost.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var DIRS = ['U', 'R', 'D', 'L'];
  var DV = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };

  var FLOOR = 0, WALL = 1, PIT = 2;
  var GOAL_NONE = -1, GOAL_ANY = -2;
  var MAX_COLORS = 3;

  // ---------------------------------------------------------------------------
  // Stage compilation
  // ---------------------------------------------------------------------------
  //
  // Stages are authored as two aligned ASCII layers so they can be read and
  // edited as pictures:
  //
  //   terrain: '.' floor   '#' wall   '*' pit
  //            'o' goal (any colour)  '0'/'1'/'2' goal (that colour only)
  //   pieces:  '.' empty   'A'..'Z'  one letter = one piece
  //            (a letter repeated over adjacent cells = one multi-cell piece)
  //   colors:  { A: 0, B: 1, ... }   defaults to colour 0

  function fail(def, msg) {
    throw new Error('stage ' + (def && def.id != null ? def.id : '?') + ': ' + msg);
  }

  function compile(def) {
    if (!def.terrain || !def.terrain.length) fail(def, 'terrain missing');
    if (!def.pieces) fail(def, 'pieces layer missing');

    var h = def.terrain.length;
    var w = def.terrain[0].length;
    if (def.pieces.length !== h) fail(def, 'pieces layer has ' + def.pieces.length + ' rows, terrain has ' + h);

    var terrain = new Uint8Array(w * h);
    var goal = new Int8Array(w * h);
    var y, x, i, ch;

    for (y = 0; y < h; y++) {
      if (def.terrain[y].length !== w) fail(def, 'terrain row ' + y + ' is ' + def.terrain[y].length + ' wide, expected ' + w);
      if (def.pieces[y].length !== w) fail(def, 'pieces row ' + y + ' is ' + def.pieces[y].length + ' wide, expected ' + w);
      for (x = 0; x < w; x++) {
        i = y * w + x;
        ch = def.terrain[y][x];
        goal[i] = GOAL_NONE;
        if (ch === '.') { terrain[i] = FLOOR; }
        else if (ch === '#') { terrain[i] = WALL; }
        else if (ch === '*') { terrain[i] = PIT; }
        else if (ch === 'o') { terrain[i] = FLOOR; goal[i] = GOAL_ANY; }
        else if (ch >= '0' && ch <= '2') { terrain[i] = FLOOR; goal[i] = ch.charCodeAt(0) - 48; }
        else fail(def, 'unknown terrain char "' + ch + '" at ' + x + ',' + y);
      }
    }

    // Gather pieces by letter.
    var byLetter = Object.create(null);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        ch = def.pieces[y][x];
        if (ch === '.') continue;
        if (!(ch >= 'A' && ch <= 'Z')) fail(def, 'unknown piece char "' + ch + '" at ' + x + ',' + y);
        if (!byLetter[ch]) byLetter[ch] = [];
        byLetter[ch].push([x, y]);
      }
    }

    var letters = Object.keys(byLetter).sort();
    var pieces = letters.map(function (L, idx) {
      var cells = byLetter[L];
      var color = (def.colors && def.colors[L] != null) ? def.colors[L] : 0;
      if (!(color >= 0 && color < MAX_COLORS)) fail(def, 'piece ' + L + ' has invalid colour ' + color);
      cells.forEach(function (c) {
        var t = terrain[c[1] * w + c[0]];
        if (t === WALL) fail(def, 'piece ' + L + ' starts inside a wall at ' + c[0] + ',' + c[1]);
        if (t === PIT) fail(def, 'piece ' + L + ' starts inside a pit at ' + c[0] + ',' + c[1]);
      });
      if (!isConnected(cells)) fail(def, 'piece ' + L + ' is not a single connected shape');
      return { id: idx, letter: L, color: color, cells: cells };
    });

    if (!pieces.length) fail(def, 'no pieces');

    // No two pieces may share a cell.
    var seen = Object.create(null);
    pieces.forEach(function (p) {
      p.cells.forEach(function (c) {
        var k = c[0] + ',' + c[1];
        if (seen[k]) fail(def, 'pieces ' + seen[k] + ' and ' + p.letter + ' overlap at ' + k);
        seen[k] = p.letter;
      });
    });

    // A cell may not be both a goal and a pit — the outcome would be ambiguous.
    for (i = 0; i < w * h; i++) {
      if (terrain[i] === PIT && goal[i] !== GOAL_NONE) fail(def, 'cell ' + (i % w) + ',' + Math.floor(i / w) + ' is both pit and goal');
      if (terrain[i] === WALL && goal[i] !== GOAL_NONE) fail(def, 'cell ' + (i % w) + ',' + Math.floor(i / w) + ' is both wall and goal');
    }

    return {
      id: def.id,
      name: def.name || '',
      note: def.note || '',
      hint: def.hint || '',
      w: w, h: h,
      terrain: terrain,
      goal: goal,
      pieces: pieces,
      par: def.par != null ? def.par : null,
      def: def
    };
  }

  function isConnected(cells) {
    if (cells.length <= 1) return true;
    var key = function (c) { return c[0] + ',' + c[1]; };
    var set = Object.create(null);
    cells.forEach(function (c) { set[key(c)] = true; });
    var stack = [cells[0]], seen = Object.create(null);
    seen[key(cells[0])] = true;
    var n = 1;
    while (stack.length) {
      var c = stack.pop();
      var nb = [[c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]];
      for (var i = 0; i < nb.length; i++) {
        var k = key(nb[i]);
        if (set[k] && !seen[k]) { seen[k] = true; n++; stack.push(nb[i]); }
      }
    }
    return n === cells.length;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  // A state is just an offset per piece plus liveness. Shapes are rigid, so an
  // (dx,dy) offset from the authored cells is a complete description.

  function initialState(stage) {
    var n = stage.pieces.length;
    return {
      off: stage.pieces.map(function () { return [0, 0]; }),
      alive: stage.pieces.map(function () { return 1; }),
      lost: 0,
      collected: 0,
      moves: 0
    };
  }

  function cloneState(s) {
    return {
      off: s.off.map(function (o) { return [o[0], o[1]]; }),
      alive: s.alive.slice(),
      lost: s.lost,
      collected: s.collected,
      moves: s.moves
    };
  }

  function stateKey(s) {
    var parts = [];
    for (var i = 0; i < s.off.length; i++) {
      parts.push(s.alive[i] ? (s.off[i][0] + '.' + s.off[i][1]) : 'x');
    }
    return parts.join('|');
  }

  function pieceCells(stage, s, i) {
    var o = s.off[i], base = stage.pieces[i].cells, out = new Array(base.length);
    for (var k = 0; k < base.length; k++) out[k] = [base[k][0] + o[0], base[k][1] + o[1]];
    return out;
  }

  function isClear(s) { return s.lost === 0 && s.collected === s.alive.length; }
  function isLost(s) { return s.lost > 0; }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  //
  // One "tick" = one pass in which every piece advances at most one cell,
  // front-most first. Repeating passes until nothing moves reproduces
  // simultaneous sliding exactly, keeps trains of pieces spaced correctly, and
  // lets a collected piece free the cell behind it inside the same slide —
  // which is precisely the chain reaction.
  //
  // Returns { state, moved, frames, events, clear, lost }.
  //   frames[t] = { off, alive } snapshot after t ticks (frames[0] = start)
  //   events    = [{ t, type: 'goal'|'pit'|'stop', piece, cells }]

  function simulate(stage, s0, dir, opts) {
    var wantFrames = !opts || opts.frames !== false;
    var d = DV[dir];
    if (!d) throw new Error('bad direction ' + dir);
    var dx = d[0], dy = d[1];
    var w = stage.w, h = stage.h, n = stage.pieces.length;

    var off = s0.off.map(function (o) { return [o[0], o[1]]; });
    var alive = s0.alive.slice();
    var lost = s0.lost, collected = s0.collected;

    // Live occupancy grid: -1 empty, else piece index.
    var occ = new Int16Array(w * h).fill(-1);
    var i, k, cells;
    for (i = 0; i < n; i++) {
      if (!alive[i]) continue;
      cells = stage.pieces[i].cells;
      for (k = 0; k < cells.length; k++) {
        occ[(cells[k][1] + off[i][1]) * w + cells[k][0] + off[i][0]] = i;
      }
    }

    var frames = [];
    var events = [];
    var snapshot = function () {
      return { off: off.map(function (o) { return [o[0], o[1]]; }), alive: alive.slice() };
    };
    if (wantFrames) frames.push(snapshot());

    var movedTotal = new Array(n).fill(0);
    var movingLast = new Array(n).fill(false);
    var order = [];
    for (i = 0; i < n; i++) order.push(i);

    // Leading edge along the gravity axis — how far "downstream" the piece is.
    var lead = function (idx) {
      var c = stage.pieces[idx].cells, best = -Infinity, v;
      for (var q = 0; q < c.length; q++) {
        v = (c[q][0] + off[idx][0]) * dx + (c[q][1] + off[idx][1]) * dy;
        if (v > best) best = v;
      }
      return best;
    };

    var guard = w * h * (n + 1) + 16;
    var anythingMoved = false;

    while (guard-- > 0) {
      var tIndex = frames.length; // frame index this pass will produce
      var live = order.filter(function (idx) { return alive[idx]; });
      // Front-most first; ties broken by id so the result is fully deterministic.
      live.sort(function (a, b) {
        var la = lead(a), lb = lead(b);
        return lb !== la ? lb - la : a - b;
      });

      var movedThisPass = false;
      var movingNow = new Array(n).fill(false);

      for (var q = 0; q < live.length; q++) {
        i = live[q];
        if (!alive[i]) continue;
        cells = pieceCells(stage, { off: off }, i);

        var can = true;
        for (k = 0; k < cells.length; k++) {
          var nx = cells[k][0] + dx, ny = cells[k][1] + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) { can = false; break; }
          var ni = ny * w + nx;
          if (stage.terrain[ni] === WALL) { can = false; break; }
          var o = occ[ni];
          if (o !== -1 && o !== i) { can = false; break; }
        }
        if (!can) continue;

        for (k = 0; k < cells.length; k++) occ[cells[k][1] * w + cells[k][0]] = -1;
        off[i][0] += dx; off[i][1] += dy;
        var moved = [];
        for (k = 0; k < cells.length; k++) moved.push([cells[k][0] + dx, cells[k][1] + dy]);
        for (k = 0; k < moved.length; k++) occ[moved[k][1] * w + moved[k][0]] = i;

        movedThisPass = true;
        anythingMoved = true;
        movedTotal[i]++;
        movingNow[i] = true;

        // Drains resolve the instant the piece arrives, so the piece behind can
        // keep going in this very slide.
        var allGoal = true, allPit = true;
        for (k = 0; k < moved.length; k++) {
          var mi = moved[k][1] * w + moved[k][0];
          var g = stage.goal[mi];
          if (!(g === GOAL_ANY || g === stage.pieces[i].color)) allGoal = false;
          if (stage.terrain[mi] !== PIT) allPit = false;
        }
        if (allGoal) {
          alive[i] = 0; collected++;
          for (k = 0; k < moved.length; k++) occ[moved[k][1] * w + moved[k][0]] = -1;
          events.push({ t: tIndex, type: 'goal', piece: i, cells: moved });
        } else if (allPit) {
          alive[i] = 0; lost++;
          for (k = 0; k < moved.length; k++) occ[moved[k][1] * w + moved[k][0]] = -1;
          events.push({ t: tIndex, type: 'pit', piece: i, cells: moved });
        }
      }

      // A piece that was sliding and has now stopped: that is an impact.
      if (wantFrames) {
        for (i = 0; i < n; i++) {
          if (movingLast[i] && !movingNow[i] && alive[i]) {
            events.push({ t: tIndex - 1, type: 'stop', piece: i, cells: pieceCells(stage, { off: off }, i) });
          }
        }
        movingLast = movingNow;
      }

      if (!movedThisPass) break;
      if (wantFrames) frames.push(snapshot());
    }

    var state = {
      off: off,
      alive: alive,
      lost: lost,
      collected: collected,
      moves: s0.moves + (anythingMoved ? 1 : 0)
    };

    return {
      state: state,
      moved: anythingMoved,
      frames: frames,
      events: events,
      clear: isClear(state),
      lost: state.lost > 0
    };
  }

  /** Fast path for search: returns the next state only, or null if nothing moved. */
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
    if (isLost(start)) return { solvable: false, moves: -1, path: null, visited: 0, truncated: false };
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
        if (isLost(ns)) continue; // losing a piece can never be undone
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

  /** All states reachable from the start without losing a piece. */
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
        if (!ns || isLost(ns)) continue;
        var key = stateKey(ns);
        if (seen[key]) continue;
        seen[key] = true;
        queue.push(ns);
      }
    }
    return list;
  }

  return {
    DIRS: DIRS, DV: DV,
    FLOOR: FLOOR, WALL: WALL, PIT: PIT,
    GOAL_NONE: GOAL_NONE, GOAL_ANY: GOAL_ANY,
    MAX_COLORS: MAX_COLORS,
    compile: compile,
    initialState: initialState,
    cloneState: cloneState,
    stateKey: stateKey,
    pieceCells: pieceCells,
    isClear: isClear,
    isLost: isLost,
    simulate: simulate,
    step: step,
    solve: solve,
    reachable: reachable
  };
});
