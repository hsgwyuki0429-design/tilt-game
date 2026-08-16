'use strict';
/*
 * TILT — canvas renderer and effects.
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
 * Two things look different here only when they BEHAVE differently. Blocks of
 * one colour are one look; a hazard cell is drawn as a pit and a wall as a
 * raised block, because one is a place you may slide across and the other is
 * not; and every colour carries its own SHAPE as well as its own hue, so the
 * board is readable without relying on colour vision at all. The dot on a block
 * and the ring on the goal that will take it are always the same shape — which
 * is the whole of the game's iconography, and the whole of how a player learns
 * what matches what without being told.
 */
(function (root) {

  var E = root.TiltEngine;

  // -- theme ------------------------------------------------------------------

  var THEME = {
    bg0: '#0a0b18',
    bg1: '#141733',
    boardEdge: 'rgba(150,170,255,0.16)',
    floor: 'rgba(140,160,230,0.045)',
    floorEdge: 'rgba(150,175,255,0.07)',
    wallTop: '#4a5480',
    wallMid: '#2e3557',
    wallLow: '#1b2040',
    wallEdge: 'rgba(180,200,255,0.30)',
    hazEdge: 'rgba(255,120,120,0.55)',
    hazDeep: '#2a0c14',
    hazStripe: 'rgba(255,96,110,0.34)'
  };

  // One palette and one SHAPE per colour of block, and the socket that will
  // take it wears the same shape as an outline. Nothing on the board is
  // distinguished by hue alone.
  //
  //   0  any     cyan     circle
  //   1  A       amber    triangle
  //   2  B       violet   square
  //   3  C       mint     diamond
  var PALETTE = [
    { hi: '#a9f4ff', mid: '#2ed3f2', lo: '#0a7fa0', glow: 'rgba(46,211,242,0.55)',
      socket: '#b9c6ee', socketGlow: 'rgba(200,215,255,0.45)', shape: 'circle' },
    { hi: '#ffe6a8', mid: '#ffb43d', lo: '#a05a00', glow: 'rgba(255,180,61,0.55)',
      socket: '#ffc766', socketGlow: 'rgba(255,190,90,0.50)', shape: 'triangle' },
    { hi: '#e8ccff', mid: '#b479ff', lo: '#5a2ea0', glow: 'rgba(180,121,255,0.55)',
      socket: '#c295ff', socketGlow: 'rgba(190,150,255,0.50)', shape: 'square' },
    { hi: '#c6ffe2', mid: '#3fe0a0', lo: '#127a55', glow: 'rgba(63,224,160,0.55)',
      socket: '#7ff0c2', socketGlow: 'rgba(120,240,190,0.50)', shape: 'diamond' }
  ];

  var BLOCK = PALETTE[0];
  var SOCKET = { mid: PALETTE[0].socket, glow: PALETTE[0].socketGlow };

  function paletteOf(c) { return PALETTE[c] || PALETTE[0]; }

  /**
   * The one glyph the whole game is built on.
   *
   * A block carries it filled; the goal that accepts that block carries the
   * same glyph as a ring. Matching is therefore something a player sees rather
   * than something they are told, and it survives both colour blindness and a
   * phone screen in sunlight.
   */
  function glyph(g, cx, cy, r, shape) {
    g.beginPath();
    if (shape === 'square') {
      var s = r * 0.88;
      g.rect(cx - s, cy - s, s * 2, s * 2);
    } else if (shape === 'triangle') {
      var h = r * 1.15;
      g.moveTo(cx, cy - h);
      g.lineTo(cx + h * 0.93, cy + h * 0.62);
      g.lineTo(cx - h * 0.93, cy + h * 0.62);
      g.closePath();
    } else if (shape === 'diamond') {
      var d = r * 1.24;
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

  function easeOut(p) { return 1 - Math.pow(1 - p, 2.4); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

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
    this.shake = 0;
    this.dpr = 1;
    this.cell = 40;
    this.ox = 0; this.oy = 0;
    this.terrainCache = null;
    this.gravity = null;     // last applied direction, shown on the board edge
    this.aimDir = null;      // live swipe direction, shown before commit
    this.clearGlow = 0;
    this.time = 0;
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
    this.anim = null;
    this.gravity = null;
    this.aimDir = null;
    this.clearGlow = 0;
    this.shake = 0;
    this.onEvent = null;
    this.layout();
  };

  Renderer.prototype.showState = function (state) {
    this.state = state;
    this.anim = null;
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

    // The board is the whole point: give it every pixel that fits, and keep a
    // margin wide enough for the gravity indicator to live outside the grid.
    var pad = Math.max(14, Math.min(w, h) * 0.055);
    var cell = Math.floor(Math.min((w - pad * 2) / this.stage.w, (h - pad * 2) / this.stage.h));
    this.cell = Math.max(24, cell);
    var bw = this.cell * this.stage.w, bh = this.cell * this.stage.h;
    this.ox = Math.round((w - bw) / 2);
    this.oy = Math.round((h - bh) / 2);
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

    var r = cell * 0.16;

    // Board plate
    roundRect(g, -6, -6, bw + 12, bh + 12, r + 6);
    g.fillStyle = 'rgba(10,14,34,0.55)';
    g.fill();
    g.strokeStyle = THEME.boardEdge;
    g.lineWidth = 1.5;
    g.stroke();

    for (var y = 0; y < st.h; y++) {
      for (var x = 0; x < st.w; x++) {
        var i = y * st.w + x;
        var px = x * cell, py = y * cell;
        var inset = Math.max(1.5, cell * 0.035);

        if (st.terrain[i] === E.WALL) {
          drawWall(g, px, py, cell);
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

  function drawWall(g, px, py, cell) {
    var inset = Math.max(1, cell * 0.02);
    var x = px + inset, y = py + inset, s = cell - inset * 2;
    roundRect(g, x, y, s, s, cell * 0.14);
    var grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, THEME.wallTop);
    grad.addColorStop(0.45, THEME.wallMid);
    grad.addColorStop(1, THEME.wallLow);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = THEME.wallEdge;
    g.lineWidth = 1;
    g.stroke();
    // A light chamfer along the top edge reads as "solid, bolted down".
    g.save();
    roundRect(g, x, y, s, s, cell * 0.14);
    g.clip();
    g.beginPath();
    g.moveTo(x, y + s * 0.16);
    g.lineTo(x + s, y);
    g.lineTo(x + s, y + s * 0.06);
    g.lineTo(x, y + s * 0.24);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fill();
    g.restore();
  }

  /**
   * A hazard is drawn as a PIT, never as an object.
   *
   * This is the one piece of art in the game that has to carry a rule on its
   * own. A wall is raised, lit from above and bolted down: it stops things. A
   * hazard is sunk below the floor with the light falling into it: things pass
   * over it, and what falls in does not come out. A player who has never read
   * the rule should still expect to be able to slide across this, and should
   * still not want to stop on it.
   */
  function drawHazard(g, px, py, cell) {
    var inset = Math.max(1.5, cell * 0.035);
    var x = px + inset, y = py + inset, s = cell - inset * 2;
    var r = cell * 0.13;

    roundRect(g, x, y, s, s, r);
    var grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, THEME.hazDeep);
    grad.addColorStop(0.55, '#160610');
    grad.addColorStop(1, '#210a12');
    g.fillStyle = grad;
    g.fill();

    // Diagonal warning stripes, clipped to the well.
    g.save();
    roundRect(g, x, y, s, s, r);
    g.clip();
    g.strokeStyle = THEME.hazStripe;
    g.lineWidth = Math.max(1.5, cell * 0.055);
    for (var k = -1; k < 4; k++) {
      g.beginPath();
      g.moveTo(x + k * s * 0.42, y + s);
      g.lineTo(x + k * s * 0.42 + s, y);
      g.stroke();
    }
    // An inner shadow along the top, so the cell reads as below the floor.
    var sh = g.createLinearGradient(x, y, x, y + s * 0.45);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, s, s * 0.45);
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
      fired: {},
      t0: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      duration: Math.max(TICK, maxTick * TICK + TAIL),
      endState: result.state,
      onDone: onDone,
      done: false
    };
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
    if (!rs.length) return 0;
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1];
      var end = e * TICK + TAIL;
      var dt = elapsed - end;
      if (dt >= 0 && dt < SQUASH) {
        var dist = Math.abs(a.frames[e].pos[i][0] - a.frames[s].pos[i][0]) +
                   Math.abs(a.frames[e].pos[i][1] - a.frames[s].pos[i][1]);
        var strength = Math.min(1, dist / 3) * 0.85 + 0.15;
        // Which way it was travelling, so the squash compresses along the
        // direction of impact rather than always the same way.
        var horiz = a.frames[e].pos[i][0] !== a.frames[s].pos[i][0];
        return { amount: (1 - dt / SQUASH) * strength, horiz: horiz };
      }
    }
    return 0;
  };

  // -- effects ----------------------------------------------------------------

  Renderer.prototype.burst = function (cx, cy, col, count, power) {
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

  Renderer.prototype.fireEvent = function (ev) {
    var r = this.cellRect(ev.cell[0], ev.cell[1]);
    var cx = r.x + r.s / 2, cy = r.y + r.s / 2;

    var pal = paletteOf(this.stage && this.stage.colour ? this.stage.colour[ev.block] : 0);

    if (ev.type === 'goal') {
      this.burst(cx, cy, pal.mid, 12, this.cell * 0.013);
      this.ripple(cx, cy, pal.mid, this.cell * 0.22, this.cell * 0.9, 360);
      this.flashes.push({ cell: ev.cell, life: 0, max: 420 });
      this.shake = Math.min(this.shake + 1.1, 3);
    } else if (ev.type === 'stop') {
      this.shake = Math.min(this.shake + 0.5, 2.5);
    } else if (ev.type === 'lost') {
      // Losing a block has to be unmistakable and has to be legible: the player
      // must know instantly WHICH cell did it, or the rule has not been taught.
      // It costs one tap of undo, so this is information, not punishment.
      this.burst(cx, cy, '#ff5f6d', 18, this.cell * 0.022);
      this.ripple(cx, cy, 'rgba(255,95,109,0.85)', this.cell * 0.2, this.cell * 1.25, 460);
      this.shake = Math.min(this.shake + 2.6, 4);
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
      if (elapsed >= this.anim.duration) {
        var cb = this.anim.onDone;
        this.state = this.anim.endState;
        this.anim = null;
        if (cb) cb();
      } else {
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

    ctx.restore();

    if (this.clearGlow > 0) { this.clearGlow -= dt / 900; busy = true; }

    // `busy` means there is motion that must be drawn at full rate. When it is
    // false the only thing still changing is the slow breathing of the goal
    // sockets, which the game deliberately renders at a much lower rate — a
    // player can sit on one board for minutes, and burning a phone battery at
    // 60fps to animate a glow is exactly the waste the brief rules out.
    return busy;
  };

  /** The edge glow that says which way gravity last pulled, and which way a swipe is aiming. */
  Renderer.prototype.drawGravityField = function (ctx) {
    var st = this.stage;
    var bw = this.cell * st.w, bh = this.cell * st.h;
    var dirs = [];
    if (this.gravity) dirs.push({ d: this.gravity, a: 0.34 });
    if (this.aimDir) dirs.push({ d: this.aimDir, a: 0.85 });

    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i].d, alpha = dirs[i].a;
      var thick = this.cell * 0.5;
      var x0, y0, x1, y1, gx0, gy0, gx1, gy1;
      if (d === 'D') { x0 = this.ox; y0 = this.oy + bh; x1 = bw; y1 = thick; gx0 = 0; gy0 = y0; gx1 = 0; gy1 = y0 + thick; }
      else if (d === 'U') { x0 = this.ox; y0 = this.oy - thick; x1 = bw; y1 = thick; gx0 = 0; gy0 = this.oy; gx1 = 0; gy1 = this.oy - thick; }
      else if (d === 'R') { x0 = this.ox + bw; y0 = this.oy; x1 = thick; y1 = bh; gx0 = x0; gy0 = 0; gx1 = x0 + thick; gy1 = 0; }
      else { x0 = this.ox - thick; y0 = this.oy; x1 = thick; y1 = bh; gx0 = this.ox; gy0 = 0; gx1 = this.ox - thick; gy1 = 0; }

      var grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      grad.addColorStop(0, 'rgba(120,190,255,' + (alpha * 0.5) + ')');
      grad.addColorStop(1, 'rgba(120,190,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, x1, y1);

      // Chevrons pointing the way the world is falling.
      ctx.save();
      ctx.strokeStyle = 'rgba(190,225,255,' + alpha + ')';
      ctx.lineWidth = Math.max(2, this.cell * 0.055);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      var cx = this.ox + bw / 2, cy = this.oy + bh / 2;
      var off = this.cell * 0.34;
      var ax = d === 'L' ? this.ox - off : d === 'R' ? this.ox + bw + off : cx;
      var ay = d === 'U' ? this.oy - off : d === 'D' ? this.oy + bh + off : cy;
      var s = this.cell * 0.17;
      ctx.beginPath();
      if (d === 'D') { ctx.moveTo(ax - s, ay - s * 0.6); ctx.lineTo(ax, ay + s * 0.5); ctx.lineTo(ax + s, ay - s * 0.6); }
      else if (d === 'U') { ctx.moveTo(ax - s, ay + s * 0.6); ctx.lineTo(ax, ay - s * 0.5); ctx.lineTo(ax + s, ay + s * 0.6); }
      else if (d === 'R') { ctx.moveTo(ax - s * 0.6, ay - s); ctx.lineTo(ax + s * 0.5, ay); ctx.lineTo(ax - s * 0.6, ay + s); }
      else { ctx.moveTo(ax + s * 0.6, ay - s); ctx.lineTo(ax - s * 0.5, ay); ctx.lineTo(ax + s * 0.6, ay + s); }
      ctx.stroke();
      ctx.restore();
    }
  };

  /**
   * The marked cells — and what they mean depends on the win condition.
   *
   * On an ALL IN or SELECT board a marked cell is a HOLE: a block that stops on
   * it is gone, so it is drawn sunk below the floor with a lit rim. On a FORM
   * board the same cell is a STANDING SPOT: nothing is ever removed, and a
   * block has to be left there. Drawing both the same way would be a lie about
   * the rules, so a FORM target is drawn as four corner brackets sitting ON the
   * floor — a place to park, not a place to fall.
   */
  Renderer.prototype.drawGoals = function (ctx) {
    var st = this.stage;
    var pulse = 0.5 + 0.5 * Math.sin(this.time / 620);
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

        var flash = 0;
        for (var f = 0; f < this.flashes.length; f++) {
          var fl = this.flashes[f];
          if (fl.cell[0] === x && fl.cell[1] === y) flash = Math.max(flash, 1 - fl.life / fl.max);
        }

        ctx.save();
        if (form) {
          var done = filled[i] !== undefined && E.accepts(st.goalColour[i], filled[i]);
          drawTarget(ctx, r, pal, pulse, done);
          ctx.restore();
          continue;
        }

        ctx.globalAlpha = 0.85;
        // Socket well
        roundRect(ctx, r.x + pad, r.y + pad, r.s - pad * 2, r.s - pad * 2, r.s * 0.2);
        ctx.fillStyle = 'rgba(0,0,10,0.30)';
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
      }
    }
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

    var rad = cell * 0.19;
    ctx.save();

    ctx.shadowColor = 'rgba(0,0,12,0.6)';
    ctx.shadowBlur = cell * 0.16;
    ctx.shadowOffsetY = cell * 0.06;
    roundRect(ctx, x, y, w, h, rad);
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, inert ? mix(pal.hi) : pal.hi);
    grad.addColorStop(0.42, inert ? mix(pal.mid) : pal.mid);
    grad.addColorStop(1, inert ? mix(pal.lo) : pal.lo);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Outer glow makes the movable things pop away from the matte walls
    // instantly — and a block with nowhere to go does not get one. It still
    // slides, it still blocks, and it reads as scenery rather than as cargo.
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
    gl.addColorStop(0, 'rgba(255,255,255,' + (inert ? 0.16 : 0.42) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, w, h * 0.55);
    ctx.restore();

    // The dot that matches the ring on the goal which will take this block —
    // hollow when no goal anywhere will.
    glyph(ctx, x + w / 2, y + h / 2, cell * 0.15, pal.shape);
    if (inert) {
      ctx.strokeStyle = 'rgba(6,10,26,0.55)';
      ctx.lineWidth = Math.max(1.4, cell * 0.04);
      ctx.stroke();
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
    var k = 0.72;
    r = Math.round(r * (1 - k) + 0x39 * k);
    g = Math.round(g * (1 - k) + 0x40 * k);
    b = Math.round(b * (1 - k) + 0x62 * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

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
    this.ripple(cx, cy, 'rgba(190,230,255,0.75)', this.cell * 0.3, this.cell * st.w * 0.8, 620);
    this.burst(cx, cy, paletteOf(st.colour ? st.colour[0] : 0).mid, 14, this.cell * 0.018);
    this.clearGlow = 1;
    this.shake = 2.0;
  };

  /** A tilt that changes nothing still deserves an answer. */
  Renderer.prototype.rebuff = function (dir) {
    var st = this.stage;
    var cx = this.ox + this.cell * st.w / 2;
    var cy = this.oy + this.cell * st.h / 2;
    this.ripple(cx, cy, 'rgba(255,255,255,0.22)', this.cell * st.w * 0.5, this.cell * st.w * 0.58, 260);
    this.shake = 1.2;
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
    THEME: THEME, TICK: TICK, TAIL: TAIL
  };

})(typeof window !== 'undefined' ? window : globalThis);
