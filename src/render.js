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
    trayFill:   'rgba(11, 14, 32, 0.62)',
    trayEdge:   'rgba(150, 170, 255, 0.14)',
    floor:      'rgba(140, 160, 230, 0.040)',
    floorEdge:  'rgba(150, 175, 255, 0.055)',
    // Masonry. Cool, flat, and DARKER than the floor rather than lighter — a
    // wall is mass, and mass does not glow.
    wallFill:   '#232945',
    wallFillLo: '#1A1F38',
    wallEdge:   'rgba(160, 180, 250, 0.20)',
    wallSeam:   'rgba(8, 10, 24, 0.55)',
    hazEdge:    'rgba(255, 116, 116, 0.50)',
    hazDeep:    '#25070F',
    hazStripe:  'rgba(255, 96, 110, 0.30)',
    aim:        'rgba(120, 214, 245, ',
    grav:       'rgba(150, 185, 235, '
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
    { hi: '#AEF3FF', mid: '#38D6F5', lo: '#0A7EA0', glow: 'rgba(56,214,245,0.55)',
      socket: '#B9C6EE', socketGlow: 'rgba(200,215,255,0.45)', shape: 'circle' },
    { hi: '#FFE7AC', mid: '#FFB43D', lo: '#A05A00', glow: 'rgba(255,180,61,0.55)',
      socket: '#FFC766', socketGlow: 'rgba(255,190,90,0.50)', shape: 'triangle' },
    { hi: '#E8CCFF', mid: '#B479FF', lo: '#5A2EA0', glow: 'rgba(180,121,255,0.55)',
      socket: '#C295FF', socketGlow: 'rgba(190,150,255,0.50)', shape: 'square' },
    { hi: '#C6FFE2', mid: '#45E3B0', lo: '#127A55', glow: 'rgba(69,227,176,0.55)',
      socket: '#7FF0C2', socketGlow: 'rgba(120,240,190,0.50)', shape: 'diamond' }
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
          g.fillStyle = THEME.floor;
          g.fill();
          g.strokeStyle = THEME.floorEdge;
          g.lineWidth = 1;
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
    var x = px, y = py, s = cell;
    var r = cell * 0.06;

    roundRect(g, x, y, s, s, r);
    var grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, THEME.wallFill);
    grad.addColorStop(1, THEME.wallFillLo);
    g.fillStyle = grad;
    g.fill();

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
    grad.addColorStop(0, THEME.hazDeep);
    grad.addColorStop(0.55, '#16060F');
    grad.addColorStop(1, '#210A12');
    g.fillStyle = grad;
    g.fill();

    // Diagonal hazard stripes — the meaning is carried by the PATTERN, so the
    // cell still says "do not be caught here" with the colour taken away.
    g.save();
    roundRect(g, x, y, s, s, r);
    g.clip();
    g.strokeStyle = THEME.hazStripe;
    g.lineWidth = Math.max(1.5, cell * 0.05);
    for (var k = -1; k < 4; k++) {
      g.beginPath();
      g.moveTo(x + k * s * 0.38, y + s);
      g.lineTo(x + k * s * 0.38 + s, y);
      g.stroke();
    }
    // Inner shadow along the top, so the cell reads as below the floor.
    var sh = g.createLinearGradient(x, y, x, y + s * 0.5);
    sh.addColorStop(0, 'rgba(0,0,0,0.60)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
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
      this.burst(cx, cy, '#FF6070', 18, this.cell * 0.022);
      this.ripple(cx, cy, 'rgba(255,96,112,0.85)', this.cell * 0.2, this.cell * 1.25, 460);
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
    if (this.gravity && this.gravity !== this.aimDir) dirs.push({ d: this.gravity, a: 0.26, aim: false });
    if (this.aimDir) dirs.push({ d: this.aimDir, a: 0.95, aim: true });

    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i].d, alpha = dirs[i].a, isAim = dirs[i].aim;
      var tint = isAim ? THEME.aim : THEME.grav;
      var thick = this.cell * (isAim ? 0.44 : 0.30);
      var x0, y0, x1, y1, gx0, gy0, gx1, gy1;
      if (d === 'D')      { x0 = this.ox; y0 = this.oy + bh; x1 = bw; y1 = thick; gx0 = 0; gy0 = y0; gx1 = 0; gy1 = y0 + thick; }
      else if (d === 'U') { x0 = this.ox; y0 = this.oy - thick; x1 = bw; y1 = thick; gx0 = 0; gy0 = this.oy; gx1 = 0; gy1 = this.oy - thick; }
      else if (d === 'R') { x0 = this.ox + bw; y0 = this.oy; x1 = thick; y1 = bh; gx0 = x0; gy0 = 0; gx1 = x0 + thick; gy1 = 0; }
      else                { x0 = this.ox - thick; y0 = this.oy; x1 = thick; y1 = bh; gx0 = this.ox; gy0 = 0; gx1 = this.ox - thick; gy1 = 0; }

      var grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      grad.addColorStop(0, tint + (alpha * 0.55) + ')');
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

        ctx.globalAlpha = 0.85;
        // Socket well
        roundRect(ctx, r.x + pad, r.y + pad, r.s - pad * 2, r.s - pad * 2, r.s * 0.2);
        ctx.fillStyle = 'rgba(0,0,10,0.32)';
        ctx.fill();

        ctx.shadowColor = pal.socketGlow;
        ctx.shadowBlur = r.s * (0.12 + pulse * 0.10 + flash * 0.6);
        ctx.strokeStyle = pal.socket;
        ctx.lineWidth = Math.max(1.8, r.s * (0.055 + flash * 0.04));
        ctx.globalAlpha = 0.55 + pulse * 0.25 + flash * 0.45;
        roundRect(ctx, r.x + pad, r.y + pad, r.s - pad * 2, r.s - pad * 2, r.s * 0.2);
        ctx.stroke();

        // The ring the block's dot is shaped to drop into — same shape, same
        // colour, so which socket takes which block is never in doubt.
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.35 + pulse * 0.2 + flash * 0.5;
        glyph(ctx, cx, cy, r.s * 0.15, pal.shape);
        ctx.strokeStyle = pal.socket;
        ctx.lineWidth = Math.max(1.4, r.s * 0.045);
        ctx.stroke();
        ctx.restore();

        if (graze > 0) { ctx.save(); this.drawGraze(ctx, r, graze); ctx.restore(); }
      }
    }
  };

  /** "It went straight through." A grey ring opening outward, and nothing else. */
  Renderer.prototype.drawGraze = function (ctx, r, p) {
    var t = 1 - p;
    ctx.globalAlpha = p * 0.55;
    ctx.strokeStyle = 'rgba(190, 205, 245, 1)';
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
    var pal = paletteOf(colour);
    var cell = this.cell;
    var inset = Math.max(2, cell * 0.075);

    var x = this.ox + pos[0] * cell + inset;
    var y = this.oy + pos[1] * cell + inset;
    var w = cell - inset * 2;
    var h = cell - inset * 2;

    // Impact squash: compress along the axis of travel, bulge across it.
    if (squash && squash.amount > 0.001) {
      var s = squash.amount * 0.12;
      var dw = w * s * (squash.horiz ? -1 : 0.6);
      var dh = h * s * (squash.horiz ? 0.6 : -1);
      x -= dw / 2; w += dw;
      y -= dh / 2; h += dh;
    }

    var rad = cell * 0.26;   // markedly rounder than a wall's 6%
    ctx.save();

    // Every block casts a shadow, inert ones included — that is what says it is
    // an OBJECT resting on the tray rather than part of the tray. It is the one
    // property a wall must never borrow.
    ctx.shadowColor = 'rgba(0,0,12,0.62)';
    ctx.shadowBlur = cell * 0.18;
    ctx.shadowOffsetY = cell * 0.07;
    roundRect(ctx, x, y, w, h, rad);
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, inert ? mix(pal.hi) : pal.hi);
    grad.addColorStop(0.42, inert ? mix(pal.mid) : pal.mid);
    grad.addColorStop(1, inert ? mix(pal.lo) : pal.lo);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Outer glow makes the movable things pop away from the matte terrain
    // instantly — and a block with nowhere to go does not get one. It still
    // slides, it still blocks, and it reads as cargo nobody ordered.
    if (!inert) {
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = cell * 0.3;
      ctx.globalAlpha = 0.55;
      roundRect(ctx, x, y, w, h, rad);
      ctx.strokeStyle = pal.hi;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Gloss
    ctx.save();
    roundRect(ctx, x, y, w, h, rad);
    ctx.clip();
    var gl = ctx.createLinearGradient(x, y, x, y + h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,' + (inert ? 0.14 : 0.42) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, w, h * 0.55);
    ctx.restore();

    // The dot that matches the ring on the goal which will take this block —
    // hollow when no goal anywhere will.
    glyph(ctx, x + w / 2, y + h / 2, cell * 0.15, pal.shape);
    if (inert) {
      ctx.strokeStyle = 'rgba(226,233,255,0.42)';
      ctx.lineWidth = Math.max(1.4, cell * 0.04);
      ctx.setLineDash([cell * 0.055, cell * 0.045]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(6,10,26,0.5)';
      ctx.fill();
    }
    ctx.restore();
  };

  /**
   * Drain a hex colour toward the board's slate, for a block with no home.
   *
   * Toward a DARK slate rather than a pale one, which was the first attempt and
   * was backwards: washing a colour out makes it lighter, and a lighter block on
   * a dark board reads as more important, not less. Furniture has to recede.
   */
  function mix(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var k = 0.70;
    r = Math.round(r * (1 - k) + 0x46 * k);
    g = Math.round(g * (1 - k) + 0x4C * k);
    b = Math.round(b * (1 - k) + 0x74 * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

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
      ctx.strokeStyle = '#DCE6FF';
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
    tg.addColorStop(0, 'rgba(220,232,255,0)');
    tg.addColorStop(1, 'rgba(220,232,255,' + (0.30 * fade) + ')');
    ctx.strokeStyle = tg;
    ctx.lineWidth = this.cell * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    // The fingertip
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(236, 243, 255, 0.92)';
    ctx.shadowColor = 'rgba(160, 200, 255, 0.7)';
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
      this.ripple(cx, cy, 'rgba(190,230,255,0.75)', this.cell * 0.3, this.cell * st.w * 0.8, 620);
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
        'rgba(255,255,255,0.22)', this.cell * st.w * 0.5, this.cell * st.w * 0.56, 240);
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
