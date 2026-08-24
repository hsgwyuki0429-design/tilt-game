'use strict';
/*
 * TILT — canvas renderer.
 *
 * Two jobs, in this order of priority:
 *   1. Never hide information. Every block, wall and goal stays legible through
 *      every effect.
 *   2. Make the result of a tilt feel like it weighed something.
 *
 * Movement is replayed from the engine's tick frames, so what you watch is
 * exactly what the solver proved — the animation is a view of the simulation,
 * never a second implementation of it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS FILE IS BUILT ON
 * ---------------------------------------------------------------------------
 *
 *   Things that MOVE and things that DO NOT must not share a look.
 *
 * That sounds obvious and the previous version of this file broke it: walls and
 * blocks were both glossy rounded tiles with a light from above, differing only
 * in hue. On a SELECT board — where an uncollectable block is drained toward
 * slate — a wall and a movable block became almost the same picture, and "what
 * can I still push around?" is the first question the player asks on every
 * single board.
 *
 * So the two are now separated on four axes at once, not one:
 *
 *              corner      surface     shadow      sits
 *   WALL       tight       matte       none        IN the tray  (part of the floor)
 *   BLOCK      round       lit gloss   cast        ON the tray  (an object)
 *
 * A wall is masonry set into the board. A block is a thing resting on top of it.
 * You can tell them apart in a photograph, in greyscale, and out of the corner
 * of your eye — which is the standard, because that is how they are actually
 * read during play.
 *
 * Everything else here follows the same discipline: every colour carries its own
 * SHAPE as well as its own hue, and the dot on a block is the same glyph as the
 * ring on the socket that will take it. That is the whole of the game's
 * iconography, and the whole of how a player learns what matches what without
 * being told.
 */
(function (root) {

  var E = root.TiltEngine;

  // -- theme ------------------------------------------------------------------

  var THEME = {
    // The tray is the grey; the cells are the white. Inverting that — white tray,
    // grey cells — makes the board read as a hole rather than as a surface.
    trayFill:   '#D9EDF5',
    trayEdge:   'rgba(32, 92, 126, 0.22)',
    floor:      '#DFF7FC',
    floorEdge:  'rgba(58, 139, 174, 0.25)',

    // Masonry. Mid-dark, flat, and the ONLY grey object on the board — every
    // other solid thing carries a hue, so "is that a wall?" is answerable
    // without reading a shape. 3.8:1 against the white floor.
    wallHi:     '#F8FDFF',
    wallLo:     '#78B8D2',
    wallEdge:   'rgba(255, 255, 255, 0.34)',   // the lit top edge, now light
    wallSeam:   'rgba(38, 112, 148, 0.30)',

    // A pit in a white floor: paler than the paper is wrong, so the well is a
    // tinted recess with the shadow falling IN from the top.
    hazFill:    '#BDECF6',
    hazFillLo:  '#79C5DC',
    hazStripe:  'rgba(16, 76, 118, 0.82)',
    hazShade:   'rgba(9, 54, 91, 0.28)',
    hazEdge:    'rgba(15, 91, 132, 0.72)',

    socketWell: 'rgba(60, 70, 120, 0.11)',
    socketShade: 'rgba(38, 48, 92, 0.26)',
    blockShade: 'rgba(28, 36, 76, 0.30)',
    // White ink on a saturated block: 3.3:1 at the worst colour, and it is a
    // glyph rather than text. A dark glyph on these mid-tones would not clear 3.
    glyphInk:   'rgba(255, 255, 255, 0.92)',
    inertEdge:  '#5A6280',
    grazeRing:  'rgba(70, 80, 124, 1)',
    cueInk:     'rgba(24, 32, 68, 0.82)',
    cueTrail:   'rgba(24, 32, 68, ',
    cueGlow:    'rgba(90, 110, 170, 0.35)',
    clearRing:  'rgba(6, 113, 143, 0.6)',
    rebuffRing: 'rgba(60, 70, 120, 0.3)',
    lost:       '#2E8DB4',
    lostRing:   'rgba(20, 92, 134, 0.85)',
    // On a light ground a thing recedes by moving TOWARD the paper, so an
    // uncollectable block drains to a pale tint — and gets an outline, because a
    // pale shape on white with no edge is not a shape.
    inertDrain: '#FFFFFF',
    inertDrainK: 0.72,
    inertEdgeK:  0.35,

    aim:        'rgba(6, 113, 143, ',
    grav:       'rgba(70, 80, 124, '
  };

  // One palette and one SHAPE per colour of block, and the socket that will take
  // it wears the same shape as an outline. Nothing on the board is distinguished
  // by hue alone.
  //
  //   0  any     cyan     circle
  //   1  A       amber    triangle
  //   2  B       violet   square
  //   3  C       mint     diamond
  var PALETTE = [
    { hi: '#5FC7E2', mid: '#0B8DAE', lo: '#05637C', rim: 'rgba(5, 99, 124, 0.6)',
      socket: '#5C6484', socketGlow: 'rgba(60, 70, 120, 0.30)', shape: 'circle' },
    { hi: '#F0AE47', mid: '#C87C08', lo: '#8A5300', rim: 'rgba(138, 83, 0, 0.6)',
      socket: '#AF6E08', socketGlow: 'rgba(175, 110, 8, 0.32)', shape: 'triangle' },
    { hi: '#B79BFF', mid: '#7A4AE8', lo: '#4A249B', rim: 'rgba(74, 36, 155, 0.6)',
      socket: '#6D3FD4', socketGlow: 'rgba(109, 63, 212, 0.32)', shape: 'square' },
    { hi: '#5FD3AE', mid: '#0D9469', lo: '#06674A', rim: 'rgba(6, 103, 74, 0.6)',
      socket: '#0A7D59', socketGlow: 'rgba(10, 125, 89, 0.32)', shape: 'diamond' }
  ];

  var BLOCK = PALETTE[0];
  var SOCKET = { mid: PALETTE[0].socket, glow: PALETTE[0].socketGlow };

  function paletteOf(c) { return PALETTE[c] || PALETTE[0]; }

  /**
   * The one glyph the whole game is built on.
   *
   * A block carries it filled; the goal that accepts that block carries the same
   * glyph as a ring. Matching is therefore something a player sees rather than
   * something they are told, and it survives both colour blindness and a phone
   * screen in sunlight.
   */
  function glyph(g, cx, cy, r, shape) {
    g.beginPath();
    if (shape === 'square') {
      var s = r * 0.86;
      g.rect(cx - s, cy - s, s * 2, s * 2);
    } else if (shape === 'triangle') {
      var h = r * 1.14;
      g.moveTo(cx, cy - h);
      g.lineTo(cx + h * 0.93, cy + h * 0.62);
      g.lineTo(cx - h * 0.93, cy + h * 0.62);
      g.closePath();
    } else if (shape === 'diamond') {
      var d = r * 1.22;
      g.moveTo(cx, cy - d);
      g.lineTo(cx + d, cy);
      g.lineTo(cx, cy + d);
      g.lineTo(cx - d, cy);
      g.closePath();
    } else {
      g.arc(cx, cy, r, 0, Math.PI * 2);
    }
  }

  // -- timing -----------------------------------------------------------------

  var TICK = 54;      // ms per cell of travel
  var TAIL = 48;      // settle time at the end of a slide
  var SQUASH = 130;   // impact deformation

  // A 3×3 board on a 6.7" phone can be given 230pt cells, and it looks like nine
  // buttons rather than like a board. Past about 112 the extra size stops buying
  // legibility — the blocks are already five times the minimum target — and
  // starts costing composition, so the board is capped and centred instead.
  var MAX_CELL = 112;

  // How much room, in cells, the gravity chevron needs on each side of the grid.
  // Derived from the drawing below, not guessed: the aimed chevron sits
  // 0.27 cells outside the edge, reaches a further 0.078 back toward the screen,
  // and is stroked at 0.062 — 0.38 in total, rounded up.
  var GUTTER = 0.40;

  function easeOut(p) { return 1 - Math.pow(1 - p, 2.4); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // -- renderer ---------------------------------------------------------------

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stage = null;
    this.state = null;
    this.anim = null;
    this.particles = [];
    this.ripples = [];
    this.flashes = [];       // goal sockets lighting up
    this.grazes = [];        // goals a block slid across without stopping
    this.shake = 0;
    this.dpr = 1;
    this.cell = 40;
    this.ox = 0; this.oy = 0;
    this.terrainCache = null;
    this.gravity = null;     // last applied direction, shown on the board edge
    this.aimDir = null;      // live swipe direction, shown before commit
    this.clearGlow = 0;
    this.time = 0;
    this.reduceMotion = false;
    this.gesture = false;    // the first-run "swipe" cue
    this.gestureDir = 'L';   // and a direction that actually does something
    this.gestureT = 0;
    // The board leans into the direction being aimed and springs back off one
    // that goes nowhere. Both are physical answers to a physical gesture.
    this.shift = { x: 0, y: 0 };
    this.nudge = null;
    // Set by the game to hear about goals and impacts as they appear on screen,
    // so audio is driven by the same clock as the picture.
    this.onEvent = null;
  }

  Renderer.prototype.setStage = function (stage, state) {
    this.stage = stage;
    this.state = state;
    this.particles.length = 0;
    this.ripples.length = 0;
    this.flashes.length = 0;
    this.grazes.length = 0;
    this.anim = null;
    this.gravity = null;
    this.aimDir = null;
    this.clearGlow = 0;
    this.shake = 0;
    this.nudge = null;
    this.shift.x = this.shift.y = 0;
    this.onEvent = null;
    this.layout();
  };

  Renderer.prototype.showState = function (state) {
    this.state = state;
    this.anim = null;
    this.grazes.length = 0;
  };

  Renderer.prototype.layout = function () {
    var c = this.canvas;
    var rect = c.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.cssW = w; this.cssH = h;
    if (!this.stage) return;

    // The gravity indicator lives OUTSIDE the grid, so the gutter it needs is
    // part of the board's size — not a margin left over after the board has
    // taken what it wants. Sizing the cell first and hoping the arrow fits is
    // how it ends up drawn off the edge of the canvas on a four-wide board,
    // which is exactly where the player most needs to see which way is down.
    var margin = Math.max(10, Math.min(w, h) * 0.03);
    var cell = Math.floor(Math.min(
      (w - margin * 2) / (this.stage.w + GUTTER * 2),
      (h - margin * 2) / (this.stage.h + GUTTER * 2)
    ));
    this.cell = Math.max(24, Math.min(MAX_CELL, cell));
    var bw = this.cell * this.stage.w, bh = this.cell * this.stage.h;
    this.ox = Math.round((w - bw) / 2);
    // Optically centred rather than mathematically: a board sitting dead centre
    // in a tall box reads as low, because the eye weights the top.
    this.oy = Math.round((h - bh) / 2 - Math.min(10, (h - bh) * 0.04));
    this.buildTerrain();
  };

  Renderer.prototype.cellRect = function (x, y) {
    return { x: this.ox + x * this.cell, y: this.oy + y * this.cell, s: this.cell };
  };

  // -- static terrain layer ---------------------------------------------------

  Renderer.prototype.buildTerrain = function () {
    var st = this.stage;
    if (!st) return;
    var cell = this.cell, dpr = this.dpr;
    var bw = cell * st.w, bh = cell * st.h;
    var pad = Math.ceil(cell * 0.5);
    var cvs = document.createElement('canvas');
    cvs.width = Math.ceil((bw + pad * 2) * dpr);
    cvs.height = Math.ceil((bh + pad * 2) * dpr);
    var g = cvs.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(pad, pad);

    var r = cell * 0.17;
    var lip = Math.max(5, cell * 0.075);

    // The tray. One recessed plate with a hairline lip: it gives the board a
    // physical edge, which is what makes "the block stopped at the wall of the
    // world" a thing you can see rather than a thing you deduce.
    roundRect(g, -lip, -lip, bw + lip * 2, bh + lip * 2, r + lip * 0.8);
    g.fillStyle = THEME.trayFill;
    g.fill();
    g.strokeStyle = THEME.trayEdge;
    g.lineWidth = 1;
    g.stroke();

    for (var y = 0; y < st.h; y++) {
      for (var x = 0; x < st.w; x++) {
        var i = y * st.w + x;
        var px = x * cell, py = y * cell;
        var inset = Math.max(1.5, cell * 0.035);

        if (st.terrain[i] === E.WALL) {
          drawWall(g, px, py, cell, st, x, y);
        } else if (st.terrain[i] === E.HAZARD) {
          drawHazard(g, px, py, cell);
        } else {
          roundRect(g, px + inset, py + inset, cell - inset * 2, cell - inset * 2, cell * 0.13);
          var ice = g.createLinearGradient(px, py, px + cell, py + cell);
          ice.addColorStop(0, '#F4FDFF'); ice.addColorStop(0.48, THEME.floor); ice.addColorStop(1, '#BFE8F3');
          g.fillStyle = ice;
          g.fill();
          g.strokeStyle = THEME.floorEdge;
          g.lineWidth = 1;
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.58)';
          g.lineWidth = Math.max(1, cell * 0.012);
          g.beginPath();
          g.moveTo(px + cell * 0.18, py + cell * 0.34);
          g.quadraticCurveTo(px + cell * 0.46, py + cell * 0.22, px + cell * 0.78, py + cell * 0.31);
          g.stroke();
        }
      }
    }
    this.terrainCache = { canvas: cvs, pad: pad };
  };

  /**
   * A wall is masonry, and masonry is not an object.
   *
   * It fills its cell edge to edge with a tight 6% corner, it is matte, it casts
   * nothing, and adjacent walls merge into one mass with a seam rather than
   * sitting side by side as two tiles. A block is round, lit, and floating. At a
   * glance, in greyscale, and at the edge of vision, the two are different
   * kinds of thing — which is the only property of this drawing that matters.
   */
  function drawWall(g, px, py, cell, st, gx, gy) {
    var lift = cell * 0.10, x = px + cell * 0.025, y = py - lift, s = cell * 0.95;
    var r = cell * 0.10;

    g.save();
    g.shadowColor = 'rgba(20,70,105,0.24)'; g.shadowBlur = cell * 0.12; g.shadowOffsetY = cell * 0.1;

    roundRect(g, x, y, s, s, r);
    var grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, THEME.wallHi);
    grad.addColorStop(1, THEME.wallLo);
    g.fillStyle = grad;
    g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;

    // A hairline along the top and left only — the same single light source the
    // whole board uses, and far too subtle to read as gloss.
    g.save();
    roundRect(g, x, y, s, s, r);
    g.clip();
    g.strokeStyle = THEME.wallEdge;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + 0.5, y + s); g.lineTo(x + 0.5, y + 0.5); g.lineTo(x + s, y + 0.5);
    g.stroke();

    // Seams where two walls meet, so a run of them reads as one built mass with
    // courses in it rather than as a row of loose bricks.
    g.strokeStyle = THEME.wallSeam;
    g.lineWidth = Math.max(1, cell * 0.02);
    g.beginPath();
    if (isWall(st, gx + 1, gy)) { g.moveTo(x + s, y + s * 0.12); g.lineTo(x + s, y + s * 0.88); }
    if (isWall(st, gx, gy + 1)) { g.moveTo(x + s * 0.12, y + s); g.lineTo(x + s * 0.88, y + s); }
    g.stroke();
    g.restore();
    // A soft, irregular snow cap makes the obstruction taller than the penguin.
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.moveTo(x + r, y + cell * 0.14);
    g.quadraticCurveTo(x + s * 0.28, y + cell * 0.20, x + s * 0.48, y + cell * 0.12);
    g.quadraticCurveTo(x + s * 0.72, y + cell * 0.04, x + s - r, y + cell * 0.13);
    g.lineTo(x + s - r, y); g.lineTo(x + r, y); g.closePath(); g.fill();
    g.restore();
  }

  function isWall(st, x, y) {
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
    return st.terrain[y * st.w + x] === E.WALL;
  }

  /**
   * A hazard is drawn as a PIT, never as an object.
   *
   * A wall is mass set into the floor: it stops things. A hazard is sunk below
   * the floor with the light falling into it: things pass over it, and what
   * falls in does not come out. A player who has never read the rule should
   * still expect to be able to slide across this, and should still not want to
   * stop on it.
   */
  function drawHazard(g, px, py, cell) {
    var inset = Math.max(1.5, cell * 0.035);
    var x = px + inset, y = py + inset, s = cell - inset * 2;
    var r = cell * 0.13;

    roundRect(g, x, y, s, s, r);
    var grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, THEME.hazFillLo);
    grad.addColorStop(0.5, THEME.hazFill);
    grad.addColorStop(1, THEME.hazFill);
    g.fillStyle = grad;
    g.fill();

    // A deep radial fracture: still traversable ice, but unmistakably unsafe to stop on.
    g.save();
    roundRect(g, x, y, s, s, r);
    g.clip();
    g.strokeStyle = THEME.hazStripe;
    g.lineWidth = Math.max(1.6, cell * 0.035); g.lineCap = 'round'; g.lineJoin = 'round';
    var cx = x + s * 0.51, cy = y + s * 0.53;
    var cracks = [[.08,.18,.30,.38],[.86,.10,.67,.34],[.94,.63,.69,.57],[.76,.94,.61,.70],[.24,.92,.39,.68],[.04,.60,.32,.55]];
    for (var k = 0; k < cracks.length; k++) {
      var c = cracks[k]; g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(x+s*c[2], y+s*c[3]); g.lineTo(x+s*c[0], y+s*c[1]); g.stroke();
    }
    g.fillStyle = 'rgba(16,72,110,0.30)'; g.beginPath(); g.ellipse(cx, cy, s*.14, s*.10, -.2, 0, Math.PI*2); g.fill();
    // Inner shadow along the top, so the cell reads as below the floor.
    var sh = g.createLinearGradient(x, y, x, y + s * 0.5);
    sh.addColorStop(0, THEME.hazShade);
    sh.addColorStop(1, 'rgba(120,20,34,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, s, s * 0.5);
    g.restore();

    roundRect(g, x, y, s, s, r);
    g.strokeStyle = THEME.hazEdge;
    g.lineWidth = 1.2;
    g.stroke();
  }

  // -- animation --------------------------------------------------------------

  /**
   * Turn engine tick-frames into per-block motion runs. A run is a stretch of
   * consecutive ticks during which the block is actually sliding; between runs
   * it is genuinely stopped, waiting for whatever is in front of it to clear.
   */
  Renderer.prototype.playMove = function (result, onDone) {
    var frames = result.frames;
    var n = this.stage.blocks.length;
    var runs = [];

    for (var i = 0; i < n; i++) {
      var blockRuns = [];
      var runStart = -1;
      for (var t = 1; t < frames.length; t++) {
        var prev = frames[t - 1].pos[i], cur = frames[t].pos[i];
        var moved = frames[t - 1].alive[i] && (prev[0] !== cur[0] || prev[1] !== cur[1]);
        if (moved && runStart < 0) runStart = t - 1;
        if (!moved && runStart >= 0) { blockRuns.push([runStart, t - 1]); runStart = -1; }
      }
      if (runStart >= 0) blockRuns.push([runStart, frames.length - 1]);
      runs.push(blockRuns);
    }

    var maxTick = frames.length - 1;
    this.anim = {
      frames: frames,
      runs: runs,
      events: result.events.slice(),
      passes: this.findPasses(frames),
      firedPass: {},
      fired: {},
      t0: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      duration: Math.max(TICK, maxTick * TICK + TAIL),
      endState: result.state,
      onDone: onDone,
      done: false
    };
  };

  /**
   * Every goal a block slid straight across without being stopped on it.
   *
   * This is the single most important thing the game has to teach and the one
   * thing the old build never showed: a goal is not a target, it is a cell you
   * have to come to REST on. Aim at the exit and the block sails over the top of
   * it. A player learns that from a sentence, or they learn it from watching it
   * happen — and watching it happen works on the first try, in any language,
   * and keeps working forty stages later when they do it by accident.
   *
   * So the socket answers: a grey ring opens where the block went through. Grey,
   * not red — nothing went wrong, and nothing was lost. It is the board saying
   * "that one was not taken", which is a fact about the rules and not a scolding.
   */
  Renderer.prototype.findPasses = function (frames) {
    var st = this.stage, out = [], seen = {};
    if (!st.goalCells.length) return out;
    var n = frames[0].pos.length;
    for (var i = 0; i < n; i++) {
      for (var t = 1; t + 1 < frames.length; t++) {
        if (!frames[t].alive[i]) break;
        var p = frames[t].pos[i];
        var ci = p[1] * st.w + p[0];
        if (!st.goal[ci]) continue;
        if (!E.accepts(st.goalColour[ci], st.colour[i])) continue;
        var q = frames[t + 1].pos[i];
        // Standing still on it at the next tick means it stopped here — that is
        // a collection or a rest, not a pass.
        if (q[0] === p[0] && q[1] === p[1]) continue;
        var key = ci + '@' + t;
        if (seen[key]) continue;
        seen[key] = 1;
        out.push({ t: t, cell: [p[0], p[1]] });
        // A dense late board can produce a dozen of these in one tilt, and a
        // dozen rings is noise rather than information.
        if (out.length >= 4) return out;
      }
    }
    return out;
  };

  Renderer.prototype.animPos = function (i, elapsed) {
    var a = this.anim;
    var rs = a.runs[i];
    var frames = a.frames;
    if (!rs.length) return frames[0].pos[i];
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1];
      var t0 = s * TICK, t1 = e * TICK + TAIL;
      if (elapsed <= t0) return frames[s].pos[i];
      if (elapsed < t1) {
        var p = easeOut(clamp01((elapsed - t0) / (t1 - t0)));
        var a0 = frames[s].pos[i], a1 = frames[e].pos[i];
        return [a0[0] + (a1[0] - a0[0]) * p, a0[1] + (a1[1] - a0[1]) * p];
      }
      if (k === rs.length - 1) return frames[e].pos[i];
      // otherwise fall through to the next run
    }
    return frames[frames.length - 1].pos[i];
  };

  /** Squash factor for a block that just slammed into something. */
  Renderer.prototype.impactOf = function (i, elapsed) {
    var a = this.anim;
    var rs = a.runs[i];
    if (!rs.length || this.reduceMotion) return 0;
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1];
      var end = e * TICK + TAIL;
      var dt = elapsed - end;
      if (dt >= 0 && dt < SQUASH) {
        var dist = Math.abs(a.frames[e].pos[i][0] - a.frames[s].pos[i][0]) +
                   Math.abs(a.frames[e].pos[i][1] - a.frames[s].pos[i][1]);
        var strength = Math.min(1, dist / 3) * 0.85 + 0.15;
        var horiz = a.frames[e].pos[i][0] !== a.frames[s].pos[i][0];
        return { amount: (1 - dt / SQUASH) * strength, horiz: horiz };
      }
    }
    return 0;
  };

  // -- effects ----------------------------------------------------------------

  Renderer.prototype.burst = function (cx, cy, col, count, power) {
    if (this.reduceMotion) return;
    var n = Math.min(count, 18);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      var sp = (0.35 + Math.random() * 0.85) * power;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 240 + Math.random() * 180,
        size: this.cell * (0.032 + Math.random() * 0.042),
        col: col, grav: 0.0006 * this.cell
      });
    }
    // Hard ceiling. A cascade fires several bursts at once, and the board has to
    // stay readable through all of them — spectacle never outranks information.
    if (this.particles.length > 110) this.particles.splice(0, this.particles.length - 110);
  };

  Renderer.prototype.ripple = function (cx, cy, col, r0, r1, ms) {
    this.ripples.push({ x: cx, y: cy, r0: r0, r1: r1, life: 0, max: ms, col: col });
  };

  Renderer.prototype.addShake = function (amount, cap) {
    if (this.reduceMotion) return;
    this.shake = Math.min(this.shake + amount, cap);
  };

  Renderer.prototype.fireEvent = function (ev) {
    var r = this.cellRect(ev.cell[0], ev.cell[1]);
    var cx = r.x + r.s / 2, cy = r.y + r.s / 2;

    var pal = paletteOf(this.stage && this.stage.colour ? this.stage.colour[ev.block] : 0);

    if (ev.type === 'goal') {
      this.burst(cx, cy, pal.mid, 12, this.cell * 0.013);
      this.ripple(cx, cy, pal.mid, this.cell * 0.22, this.cell * 0.9, 360);
      this.flashes.push({ cell: ev.cell, life: 0, max: 420 });
      this.addShake(1.1, 3);
    } else if (ev.type === 'stop') {
      this.addShake(0.5, 2.5);
    } else if (ev.type === 'lost') {
      // Losing a block has to be unmistakable and has to be legible: the player
      // must know instantly WHICH cell did it, or the rule has not been taught.
      // It costs one tap of undo, so this is information, not punishment.
      this.burst(cx, cy, THEME.lost, 18, this.cell * 0.022);
      this.ripple(cx, cy, THEME.lostRing, this.cell * 0.2, this.cell * 1.25, 460);
      this.addShake(2.6, 4);
    }
    if (this.onEvent) this.onEvent(ev);
  };

  // -- main draw --------------------------------------------------------------

  Renderer.prototype.frame = function (dt, now) {
    this.time = now;
    var ctx = this.ctx, st = this.stage;
    if (!st) return false;

    var busy = false;
    var elapsed = 0;

    if (this.anim) {
      elapsed = now - this.anim.t0;
      // Fire each event exactly when its tick arrives on screen.
      for (var i = 0; i < this.anim.events.length; i++) {
        var ev = this.anim.events[i];
        if (this.anim.fired[i]) continue;
        var when = ev.t * TICK + (ev.type === 'stop' ? TAIL : TICK * 0.55);
        if (elapsed >= when) { this.anim.fired[i] = true; this.fireEvent(ev); }
      }
      for (var pi = 0; pi < this.anim.passes.length; pi++) {
        if (this.anim.firedPass[pi]) continue;
        var pv = this.anim.passes[pi];
        if (elapsed >= pv.t * TICK + TICK * 0.4) {
          this.anim.firedPass[pi] = true;
          this.grazes.push({ cell: pv.cell, life: 0, max: 520 });
        }
      }
      if (elapsed >= this.anim.duration) {
        var cb = this.anim.onDone;
        this.state = this.anim.endState;
        this.anim = null;
        if (cb) cb();
      } else {
        busy = true;
      }
    }

    // The board leans toward the direction being aimed: a physical answer to the
    // finger, given before the move is committed and taken back if it is not.
    var want = { x: 0, y: 0 };
    if (this.aimDir && !this.reduceMotion) {
      var lean = Math.min(7, this.cell * 0.055);
      if (this.aimDir === 'L') want.x = -lean;
      else if (this.aimDir === 'R') want.x = lean;
      else if (this.aimDir === 'U') want.y = -lean;
      else want.y = lean;
    }
    var k = Math.min(1, dt / 90);
    if (Math.abs(this.shift.x - want.x) > 0.05 || Math.abs(this.shift.y - want.y) > 0.05) {
      this.shift.x = lerp(this.shift.x, want.x, k);
      this.shift.y = lerp(this.shift.y, want.y, k);
      busy = true;
    } else { this.shift.x = want.x; this.shift.y = want.y; }

    // A tilt that changes nothing: the board strains that way and comes back.
    var nx = 0, ny = 0;
    if (this.nudge) {
      this.nudge.life += dt;
      var np = this.nudge.life / this.nudge.max;
      if (np >= 1) { this.nudge = null; }
      else {
        var amp = Math.sin(np * Math.PI) * (1 - np) * this.cell * 0.13;
        var d = this.nudge.dir;
        nx = d === 'L' ? -amp : d === 'R' ? amp : 0;
        ny = d === 'U' ? -amp : d === 'D' ? amp : 0;
        busy = true;
      }
    }

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    if (this.shake > 0.01) {
      var sh = this.shake;
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      this.shake *= Math.pow(0.0025, dt / 1000);
      if (this.shake < 0.05) this.shake = 0;
      busy = true;
    }
    ctx.translate(this.shift.x + nx, this.shift.y + ny);

    this.drawGravityField(ctx);

    if (this.terrainCache) {
      var tc = this.terrainCache;
      ctx.drawImage(tc.canvas, 0, 0, tc.canvas.width, tc.canvas.height,
        this.ox - tc.pad, this.oy - tc.pad,
        tc.canvas.width / this.dpr, tc.canvas.height / this.dpr);
    }

    this.drawGoals(ctx);
    this.drawBlocks(ctx, elapsed);
    if (this.drawEffects(ctx, dt)) busy = true;
    if (this.gesture) { this.drawGesture(ctx, dt); busy = !this.reduceMotion || busy; }

    ctx.restore();

    if (this.clearGlow > 0) { this.clearGlow -= dt / 900; busy = true; }

    // `busy` means there is motion that must be drawn at full rate. When it is
    // false the only thing still changing is the slow breathing of the goal
    // sockets, which the game deliberately renders at a much lower rate — a
    // player can sit on one board for minutes, and burning a phone battery at
    // 60fps to animate a glow is exactly the waste the brief rules out.
    return busy;
  };

  /**
   * Which way the world is falling.
   *
   * Two states with deliberately different weights: the direction last APPLIED
   * is a quiet mark on one edge, and the direction being AIMED at right now is
   * loud — brighter, thicker, with a chevron outside the board. The player has
   * to be able to tell "this is where I am about to send everything" from "this
   * is where it went last time" without reading anything.
   */
  Renderer.prototype.drawGravityField = function (ctx) {
    var st = this.stage;
    var bw = this.cell * st.w, bh = this.cell * st.h;
    var dirs = [];
    // Quieter than on the dark board, and deliberately. There the band was light
    // ON dark and blended away at both ends; here it is dark ON light with a hard
    // edge where the tray begins, and at the old weight that edge reads as a
    // rendering fault rather than as a pull. The chevron carries the direction;
    // the band only has to say which side it is on.
    if (this.gravity && this.gravity !== this.aimDir) dirs.push({ d: this.gravity, a: 0.16, aim: false });
    if (this.aimDir) dirs.push({ d: this.aimDir, a: 0.72, aim: true });

    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i].d, alpha = dirs[i].a, isAim = dirs[i].aim;
      var tint = isAim ? THEME.aim : THEME.grav;
      var thick = this.cell * (isAim ? 0.40 : 0.26);
      var x0, y0, x1, y1, gx0, gy0, gx1, gy1;
      if (d === 'D')      { x0 = this.ox; y0 = this.oy + bh; x1 = bw; y1 = thick; gx0 = 0; gy0 = y0; gx1 = 0; gy1 = y0 + thick; }
      else if (d === 'U') { x0 = this.ox; y0 = this.oy - thick; x1 = bw; y1 = thick; gx0 = 0; gy0 = this.oy; gx1 = 0; gy1 = this.oy - thick; }
      else if (d === 'R') { x0 = this.ox + bw; y0 = this.oy; x1 = thick; y1 = bh; gx0 = x0; gy0 = 0; gx1 = x0 + thick; gy1 = 0; }
      else                { x0 = this.ox - thick; y0 = this.oy; x1 = thick; y1 = bh; gx0 = this.ox; gy0 = 0; gx1 = this.ox - thick; gy1 = 0; }

      var grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      grad.addColorStop(0, tint + (alpha * 0.42) + ')');
      grad.addColorStop(1, tint + '0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, x1, y1);

      // The chevron that points the way the world is falling.
      ctx.save();
      ctx.strokeStyle = tint + alpha + ')';
      ctx.lineWidth = Math.max(2, this.cell * (isAim ? 0.062 : 0.05));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      var cx = this.ox + bw / 2, cy = this.oy + bh / 2;
      var off = this.cell * (isAim ? 0.27 : 0.23);
      var s = this.cell * (isAim ? 0.155 : 0.12);
      var ax = d === 'L' ? this.ox - off : d === 'R' ? this.ox + bw + off : cx;
      var ay = d === 'U' ? this.oy - off : d === 'D' ? this.oy + bh + off : cy;
      // Belt and braces over the gutter reserved in layout(): a chevron that has
      // been pushed off the canvas by a rounding error tells the player nothing
      // at all, so it is kept on screen even at the cost of hugging the edge.
      var keep = s + ctx.lineWidth;
      ax = Math.max(keep, Math.min(this.cssW - keep, ax));
      ay = Math.max(keep, Math.min(this.cssH - keep, ay));
      ctx.beginPath();
      if (d === 'D')      { ctx.moveTo(ax - s, ay - s * 0.6); ctx.lineTo(ax, ay + s * 0.5); ctx.lineTo(ax + s, ay - s * 0.6); }
      else if (d === 'U') { ctx.moveTo(ax - s, ay + s * 0.6); ctx.lineTo(ax, ay - s * 0.5); ctx.lineTo(ax + s, ay + s * 0.6); }
      else if (d === 'R') { ctx.moveTo(ax - s * 0.6, ay - s); ctx.lineTo(ax + s * 0.5, ay); ctx.lineTo(ax - s * 0.6, ay + s); }
      else                { ctx.moveTo(ax + s * 0.6, ay - s); ctx.lineTo(ax - s * 0.5, ay); ctx.lineTo(ax + s * 0.6, ay + s); }
      ctx.stroke();
      ctx.restore();
    }
  };

  /**
   * The marked cells — and what they mean depends on the win condition.
   *
   * On an ALL IN or SELECT board a marked cell is a HOLE: a block that stops on
   * it is gone, so it is drawn sunk below the floor with a lit rim. On a FORM
   * board the same cell is a STANDING SPOT: nothing is ever removed, and a block
   * has to be left there. Drawing both the same way would be a lie about the
   * rules, so a FORM target is drawn as four corner brackets sitting ON the
   * floor — a place to park, not a place to fall.
   */
  Renderer.prototype.drawGoals = function (ctx) {
    var st = this.stage;
    var pulse = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time / 620);
    var form = st.win === 'form';
    var filled = form ? this.occupancy() : null;

    for (var y = 0; y < st.h; y++) {
      for (var x = 0; x < st.w; x++) {
        var i = y * st.w + x;
        if (!st.goal[i]) continue;
        var pal = paletteOf(st.goalColour ? st.goalColour[i] : 0);
        var r = this.cellRect(x, y);
        var cx = r.x + r.s / 2, cy = r.y + r.s / 2;
        var pad = r.s * 0.17;

        var flash = 0, graze = 0;
        for (var f = 0; f < this.flashes.length; f++) {
          var fl = this.flashes[f];
          if (fl.cell[0] === x && fl.cell[1] === y) flash = Math.max(flash, 1 - fl.life / fl.max);
        }
        for (var gz = 0; gz < this.grazes.length; gz++) {
          var gr = this.grazes[gz];
          if (gr.cell[0] === x && gr.cell[1] === y) graze = Math.max(graze, 1 - gr.life / gr.max);
        }

        ctx.save();
        if (form) {
          var done = filled[i] !== undefined && E.accepts(st.goalColour[i], filled[i]);
          drawTarget(ctx, r, pal, pulse, done);
          if (graze > 0) this.drawGraze(ctx, r, graze);
          ctx.restore();
          continue;
        }

        drawAurora(ctx, r, pal, pulse, flash, this.time);
        ctx.restore();
        if (graze > 0) { ctx.save(); this.drawGraze(ctx, r, graze); ctx.restore(); }
        continue;

      }
    }
  };

  function drawAurora(g, r, pal, pulse, flash, time) {
    var cx = r.x + r.s / 2, cy = r.y + r.s / 2;
    var glow = g.createRadialGradient(cx, cy, r.s*.03, cx, cy, r.s*.39);
    glow.addColorStop(0, 'rgba(244,222,255,' + (.44 + flash*.35) + ')');
    glow.addColorStop(.38, 'rgba(70,225,235,' + (.30 + pulse*.16) + ')');
    glow.addColorStop(.72, 'rgba(82,108,218,.22)'); glow.addColorStop(1, 'rgba(82,108,218,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, r.s*.42, 0, Math.PI*2); g.fill();
    g.save(); g.translate(cx, cy); g.rotate((time || 0) / 5200);
    g.lineCap = 'round';
    var colours = ['rgba(72,222,230,.72)','rgba(111,108,225,.62)','rgba(231,137,222,.42)'];
    for (var i=0;i<3;i++) {
      g.strokeStyle = colours[i]; g.lineWidth = r.s*(.025+i*.008); g.shadowColor=colours[i]; g.shadowBlur=r.s*.09;
      g.beginPath(); g.arc(0,0,r.s*(.15+i*.075),-.4+i*.7,Math.PI*1.28+i*.5); g.stroke();
    }
    g.rotate(-(time || 0) / 2700);
    for (i=0;i<4;i++) { var a=i*Math.PI/2+.4; g.fillStyle='rgba(240,255,255,.72)'; g.beginPath(); g.arc(Math.cos(a)*r.s*.31,Math.sin(a)*r.s*.31,r.s*.018,0,Math.PI*2); g.fill(); }
    g.restore();
    // The small chest-shaped sign preserves colour/shape matching without recolouring the penguin.
    g.globalAlpha=.72; g.strokeStyle=pal.socket; g.lineWidth=Math.max(1.3,r.s*.025); glyph(g,cx,cy,r.s*.09,pal.shape); g.stroke();
  }

  /** "It went straight through." A grey ring opening outward, and nothing else. */
  Renderer.prototype.drawGraze = function (ctx, r, p) {
    var t = 1 - p;
    ctx.globalAlpha = p * 0.55;
    ctx.strokeStyle = THEME.grazeRing;
    ctx.lineWidth = Math.max(1.4, r.s * 0.035 * p);
    ctx.setLineDash([r.s * 0.11, r.s * 0.09]);
    ctx.beginPath();
    ctx.arc(r.x + r.s / 2, r.y + r.s / 2, r.s * (0.26 + easeOut(t) * 0.28), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };

  /** Which colour is standing on each cell right now, for the FORM readout. */
  Renderer.prototype.occupancy = function () {
    var st = this.stage, out = {};
    var frames = this.anim ? this.anim.frames : null;
    var snap = frames ? frames[frames.length - 1] : this.state;
    if (!snap) return out;
    for (var i = 0; i < snap.pos.length; i++) {
      if (snap.alive[i]) out[snap.pos[i][1] * st.w + snap.pos[i][0]] = st.colour[i];
    }
    return out;
  };

  function drawTarget(g, r, pal, pulse, done) {
    var pad = r.s * 0.14;
    var x = r.x + pad, y = r.y + pad, s = r.s - pad * 2;
    var arm = s * 0.3;

    g.globalAlpha = done ? 0.95 : 0.30 + pulse * 0.22;
    g.strokeStyle = pal.socket;
    g.shadowColor = pal.socketGlow;
    g.shadowBlur = r.s * (done ? 0.35 : 0.08 + pulse * 0.06);
    g.lineWidth = Math.max(2, r.s * 0.06);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y + arm); g.lineTo(x, y); g.lineTo(x + arm, y);
    g.moveTo(x + s - arm, y); g.lineTo(x + s, y); g.lineTo(x + s, y + arm);
    g.moveTo(x + s, y + s - arm); g.lineTo(x + s, y + s); g.lineTo(x + s - arm, y + s);
    g.moveTo(x + arm, y + s); g.lineTo(x, y + s); g.lineTo(x, y + s - arm);
    g.stroke();

    // The glyph stays, because on a coloured FORM board the target still says
    // WHICH block belongs here — but it goes hollow once the spot is taken, so
    // "how many are still open" is countable at a glance.
    g.shadowBlur = 0;
    g.globalAlpha = done ? 0.25 : 0.45 + pulse * 0.2;
    glyph(g, r.x + r.s / 2, r.y + r.s / 2, r.s * 0.15, pal.shape);
    g.lineWidth = Math.max(1.4, r.s * 0.045);
    g.stroke();
  }

  Renderer.prototype.drawBlocks = function (ctx, elapsed) {
    var st = this.stage;
    var state = this.anim ? null : this.state;
    var frames = this.anim ? this.anim.frames : null;

    for (var i = 0; i < st.blocks.length; i++) {
      var pos, squash = 0;
      if (this.anim) {
        // A block stays on screen until the tick it is collected on.
        var goneAt = -1;
        for (var k = 0; k < frames.length; k++) {
          if (!frames[k].alive[i]) { goneAt = k; break; }
        }
        if (goneAt >= 0 && elapsed >= goneAt * TICK + TICK * 0.55) continue;
        pos = this.animPos(i, elapsed);
        squash = this.impactOf(i, elapsed);
      } else {
        if (!state.alive[i]) continue;
        pos = state.pos[i];
      }
      // On a SELECT board some blocks have no socket anywhere and can never
      // leave. The player has to be able to SEE which ones those are, or the
      // puzzle moves off the board and into the briefing.
      var inert = st.win === 'select' && st.collectable && !st.collectable[i];
      this.drawBlock(ctx, pos, squash, st.colour ? st.colour[i] : 0, inert);
    }
  };

  Renderer.prototype.drawBlock = function (ctx, pos, squash, colour, inert) {
    var pal = paletteOf(colour), cell = this.cell, inset = Math.max(2, cell * 0.09);
    var x = this.ox + pos[0] * cell + inset, y = this.oy + pos[1] * cell + inset;
    var w = cell - inset * 2, h = cell - inset * 2;
    if (squash && squash.amount > 0.001) {
      var q=squash.amount*.1, dw=w*q*(squash.horiz?-1:.55), dh=h*q*(squash.horiz?.55:-1);
      x-=dw/2; y-=dh/2; w+=dw; h+=dh;
    }
    var rad=cell*.25;
    ctx.save();
    // Feet remain visible below the cube, grounding the piece without implying walking.
    ctx.fillStyle='#E6A72B';
    roundRect(ctx,x+w*.16,y+h*.88,w*.25,h*.13,cell*.05); ctx.fill();
    roundRect(ctx,x+w*.59,y+h*.88,w*.25,h*.13,cell*.05); ctx.fill();
    ctx.shadowColor=THEME.blockShade; ctx.shadowBlur=cell*.18; ctx.shadowOffsetY=cell*.07;
    roundRect(ctx,x,y,w,h,rad);
    var body=ctx.createLinearGradient(x,y,x+w,y+h);
    body.addColorStop(0,inert?'#607786':'#243947'); body.addColorStop(.5,inert?'#405766':'#102633'); body.addColorStop(1,'#071722');
    ctx.fillStyle=body; ctx.fill(); ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    // The white face and belly are one quiet pear-shaped panel.
    ctx.fillStyle=inert?'#D8E7EA':'#F7FCFC';
    ctx.beginPath(); ctx.ellipse(x+w*.5,y+h*.57,w*.31,h*.36,0,0,Math.PI*2); ctx.fill();
    // Eyes and tiny warm beak.
    ctx.fillStyle='#07131B';
    ctx.beginPath(); ctx.arc(x+w*.39,y+h*.36,cell*.028,0,Math.PI*2); ctx.arc(x+w*.61,y+h*.36,cell*.028,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#F2A62A'; ctx.beginPath(); ctx.moveTo(x+w*.5,y+h*.43); ctx.lineTo(x+w*.41,y+h*.50); ctx.lineTo(x+w*.59,y+h*.50); ctx.closePath(); ctx.fill();
    // Colour identity lives in a restrained scarf and matching chest mark.
    ctx.strokeStyle=pal.mid; ctx.lineWidth=cell*.055; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x+w*.22,y+h*.28); ctx.quadraticCurveTo(x+w*.5,y+h*.34,x+w*.78,y+h*.28); ctx.stroke();
    glyph(ctx,x+w*.5,y+h*.68,cell*.075,pal.shape); ctx.fillStyle=pal.mid; inert?ctx.stroke():ctx.fill();
    // A narrow highlight gives the rounded cube its polished ice-world finish.
    ctx.strokeStyle='rgba(255,255,255,.24)'; ctx.lineWidth=Math.max(1,cell*.014);
    ctx.beginPath(); ctx.arc(x+w*.5,y+h*.45,w*.45,Math.PI*1.08,Math.PI*1.72); ctx.stroke();
    ctx.restore();
  };

  function blend(hex, target, k) {
    var n = parseInt(hex.slice(1), 16), t = parseInt(target.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * (1 - k) + ((t >> 16) & 255) * k);
    var g = Math.round(((n >> 8) & 255) * (1 - k) + ((t >> 8) & 255) * k);
    var b = Math.round((n & 255) * (1 - k) + (t & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /**
   * Drain a colour toward the paper, for a block with no home.
   *
   * The dark board drained toward a DARK slate, and had to: washing a colour out
   * makes it lighter, and a lighter block on a black board reads as more
   * important rather than less. On white the same argument runs the other way
   * and lands on the opposite answer — here a thing recedes by approaching the
   * background, so furniture goes pale.
   *
   * Measured, because "pale" is one step from "gone": the drained fills sit at
   * 1.4:1 against the floor, which is why `drainEdge` exists and is not
   * optional, and 2.6:1 against the wall they must never be mistaken for.
   */
  function pale(hex) { return blend(hex, THEME.inertDrain, THEME.inertDrainK); }

  /** The outline that makes a drained block a shape again. 4.2:1 or better. */
  function drainEdge(hex) { return blend(hex, THEME.inertEdge, THEME.inertEdgeK); }

  /**
   * The first-run cue: how to play, shown rather than written.
   *
   * There is no way to guess "swipe" from a static picture, and a sentence
   * saying so is a sentence in a language somebody does not read. A finger
   * crossing the board, once every couple of seconds, is not.
   */
  Renderer.prototype.drawGesture = function (ctx, dt) {
    var st = this.stage;
    var bw = this.cell * st.w, bh = this.cell * st.h;
    var cx = this.ox + bw / 2, cy = this.oy + bh / 2;
    var d = this.gestureDir;
    var horiz = (d === 'L' || d === 'R');
    var sign = (d === 'R' || d === 'D') ? 1 : -1;
    var span = (horiz ? bw : bh) * 0.52;

    if (this.reduceMotion) {
      // Motion is the message, so with motion off it becomes a symbol instead:
      // a static arrow pointing the way, which says the same thing in one glance.
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = THEME.cueInk;
      ctx.lineWidth = Math.max(2, this.cell * 0.05);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var a = this.cell * 0.2;
      var hx = horiz ? span * 0.5 * sign : 0, hy = horiz ? 0 : span * 0.5 * sign;
      ctx.beginPath();
      ctx.moveTo(cx - hx, cy - hy); ctx.lineTo(cx + hx, cy + hy);
      if (horiz) {
        ctx.moveTo(cx + hx - a * sign, cy - a); ctx.lineTo(cx + hx, cy); ctx.lineTo(cx + hx - a * sign, cy + a);
      } else {
        ctx.moveTo(cx - a, cy + hy - a * sign); ctx.lineTo(cx, cy + hy); ctx.lineTo(cx + a, cy + hy - a * sign);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    this.gestureT += dt;
    var cycle = 2100;
    var p = (this.gestureT % cycle) / cycle;
    // Travel for the first 55% of the cycle, rest for the remainder — a real
    // hand does not slide back and forth without pausing.
    var travel = clamp01(p / 0.55);
    var e = travel < 1 ? easeOut(travel) : 1;
    var fade = travel < 0.08 ? travel / 0.08 : (travel > 0.86 ? Math.max(0, (1 - travel) / 0.14) : 1);
    var trail = this.cell * 0.75;
    var x = horiz ? cx - span * 0.5 * sign + span * e * sign : cx;
    var y = horiz ? cy : cy - span * 0.5 * sign + span * e * sign;
    var tx = horiz ? x - trail * sign : x;
    var ty = horiz ? y : y - trail * sign;

    ctx.save();
    // Trail
    var tg = ctx.createLinearGradient(tx, ty, x, y);
    tg.addColorStop(0, THEME.cueTrail + '0)');
    tg.addColorStop(1, THEME.cueTrail + (0.28 * fade) + ')');
    ctx.strokeStyle = tg;
    ctx.lineWidth = this.cell * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    // The fingertip
    ctx.globalAlpha = fade;
    ctx.fillStyle = THEME.cueInk;
    ctx.shadowColor = THEME.cueGlow;
    ctx.shadowBlur = this.cell * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, this.cell * 0.115, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Renderer.prototype.drawEffects = function (ctx, dt) {
    var busy = false;
    var i, p;

    for (i = this.ripples.length - 1; i >= 0; i--) {
      var rp = this.ripples[i];
      rp.life += dt;
      if (rp.life >= rp.max) { this.ripples.splice(i, 1); continue; }
      var t = rp.life / rp.max;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = rp.col;
      ctx.lineWidth = Math.max(1.5, this.cell * 0.06 * (1 - t));
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r0 + (rp.r1 - rp.r0) * easeOut(t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      busy = true;
    }

    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt * 0.06;
      p.vx *= 0.995; p.vy *= 0.995;
      var a = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.col;
      ctx.shadowColor = p.col;
      ctx.shadowBlur = p.size * 2.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.65), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      busy = true;
    }

    for (i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life += dt;
      if (this.flashes[i].life >= this.flashes[i].max) this.flashes.splice(i, 1);
      else busy = true;
    }

    for (i = this.grazes.length - 1; i >= 0; i--) {
      this.grazes[i].life += dt;
      if (this.grazes[i].life >= this.grazes[i].max) this.grazes.splice(i, 1);
      else busy = true;
    }

    return busy;
  };

  /**
   * Celebration that stays out of the way of the board.
   *
   * The blocks draining into their goals already carry the moment, and they fire
   * at the same instant as this does. So the clear itself is one clean ring and
   * a handful of sparks — no more.
   */
  Renderer.prototype.celebrate = function () {
    var st = this.stage;
    var cx = this.ox + this.cell * st.w / 2;
    var cy = this.oy + this.cell * st.h / 2;
    if (!this.reduceMotion) {
      this.ripple(cx, cy, THEME.clearRing, this.cell * 0.3, this.cell * st.w * 0.8, 620);
      this.burst(cx, cy, paletteOf(st.colour ? st.colour[0] : 0).mid, 14, this.cell * 0.018);
      this.addShake(2.0, 4);
    }
    this.clearGlow = 1;
  };

  /** A tilt that changes nothing still deserves an answer. */
  Renderer.prototype.rebuff = function (dir) {
    if (this.reduceMotion) {
      var st = this.stage;
      this.ripple(this.ox + this.cell * st.w / 2, this.oy + this.cell * st.h / 2,
        THEME.rebuffRing, this.cell * st.w * 0.5, this.cell * st.w * 0.56, 240);
      return;
    }
    this.nudge = { dir: dir, life: 0, max: 300 };
  };

  // -- primitives -------------------------------------------------------------

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  root.TiltRender = {
    Renderer: Renderer, BLOCK: BLOCK, SOCKET: SOCKET, PALETTE: PALETTE,
    THEME: THEME, TICK: TICK, TAIL: TAIL, MAX_CELL: MAX_CELL
  };

})(typeof window !== 'undefined' ? window : globalThis);
