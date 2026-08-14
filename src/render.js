'use strict';
/*
 * TILT — canvas renderer and effects.
 *
 * Two jobs, in this order of priority:
 *   1. Never hide information. Every piece, wall, pit and goal stays legible
 *      through every effect.
 *   2. Make the result of a tilt feel like it weighed something.
 *
 * Movement is replayed from the engine's tick frames, so what you watch is
 * exactly what the solver proved — the animation is a view of the simulation,
 * never a second implementation of it.
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
    pitRim: 'rgba(120,60,110,0.55)',
    neutralHi: '#eef3ff',
    neutralMid: '#b9c6ee',
    neutralLo: '#5a6595',
    neutralGlow: 'rgba(200,215,255,0.45)'
  };

  // Colour AND shape carry the identity, so the puzzle stays readable without
  // relying on hue discrimination.
  var COLORS = [
    { hi: '#a9f4ff', mid: '#2ed3f2', lo: '#0a7fa0', glow: 'rgba(46,211,242,0.55)', glyph: 'circle' },
    { hi: '#ffb6d4', mid: '#ff5c9e', lo: '#a92559', glow: 'rgba(255,92,158,0.52)', glyph: 'diamond' },
    { hi: '#ffe3ab', mid: '#ffb43d', lo: '#a86c14', glow: 'rgba(255,180,61,0.52)', glyph: 'triangle' }
  ];

  function colorOf(i) { return COLORS[i % COLORS.length]; }

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
    this.lostGlow = 0;
    this.time = 0;
    // Set by the game to hear about goals, pits and impacts as they appear on
    // screen, so audio is driven by the same clock as the picture.
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
    this.lostGlow = 0;
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
        var t = st.terrain[i];

        if (t === E.WALL) {
          drawWall(g, px, py, cell);
        } else if (t === E.PIT) {
          drawPit(g, px, py, cell);
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

  function drawPit(g, px, py, cell) {
    var cx = px + cell / 2, cy = py + cell / 2;
    var rad = cell * 0.44;
    var grad = g.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    grad.addColorStop(0, '#000005');
    grad.addColorStop(0.55, '#0b0716');
    grad.addColorStop(1, 'rgba(30,10,40,0.35)');
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = THEME.pitRim;
    g.lineWidth = Math.max(2, cell * 0.045);
    g.stroke();
    // Concentric rings read as depth rather than as a dark tile, and the taper
    // gives the hole a direction: inward.
    for (var ri = 0; ri < 2; ri++) {
      g.beginPath();
      g.arc(cx, cy, rad * (0.70 - ri * 0.22), 0, Math.PI * 2);
      g.strokeStyle = 'rgba(150,80,160,' + (0.26 - ri * 0.10) + ')';
      g.lineWidth = Math.max(1, cell * 0.018);
      g.stroke();
    }
  }

  // -- animation --------------------------------------------------------------

  /**
   * Turn engine tick-frames into per-piece motion runs. A run is a stretch of
   * consecutive ticks during which the piece is actually sliding; between runs
   * it is genuinely stopped, waiting for whatever is in front of it to clear.
   */
  Renderer.prototype.playMove = function (result, onDone) {
    var frames = result.frames;
    var st = this.stage;
    var n = st.pieces.length;
    var runs = [];
    var deaths = [];

    for (var i = 0; i < n; i++) {
      var pieceRuns = [];
      var runStart = -1;
      for (var t = 1; t < frames.length; t++) {
        var prev = frames[t - 1].off[i], cur = frames[t].off[i];
        var moved = frames[t - 1].alive[i] && (prev[0] !== cur[0] || prev[1] !== cur[1]);
        if (moved && runStart < 0) runStart = t - 1;
        if (!moved && runStart >= 0) { pieceRuns.push([runStart, t - 1]); runStart = -1; }
      }
      if (runStart >= 0) pieceRuns.push([runStart, frames.length - 1]);
      runs.push(pieceRuns);
    }

    result.events.forEach(function (ev) {
      if (ev.type === 'goal' || ev.type === 'pit') deaths.push(ev);
    });

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

  Renderer.prototype.animOffset = function (i, elapsed) {
    var a = this.anim;
    var rs = a.runs[i];
    var frames = a.frames;
    if (!rs.length) return frames[0].off[i];
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1];
      var t0 = s * TICK, t1 = e * TICK + TAIL;
      if (elapsed <= t0) return frames[s].off[i];
      if (elapsed < t1) {
        var p = easeOut(clamp01((elapsed - t0) / (t1 - t0)));
        var a0 = frames[s].off[i], a1 = frames[e].off[i];
        return [a0[0] + (a1[0] - a0[0]) * p, a0[1] + (a1[1] - a0[1]) * p];
      }
      if (k === rs.length - 1) return frames[e].off[i];
      // otherwise fall through to the next run
    }
    return frames[frames.length - 1].off[i];
  };

  /** Squash factor for a piece that just slammed into something. */
  Renderer.prototype.impactOf = function (i, elapsed) {
    var a = this.anim;
    var rs = a.runs[i];
    if (!rs.length) return 0;
    for (var k = 0; k < rs.length; k++) {
      var e = rs[k][1], s = rs[k][0];
      var end = e * TICK + TAIL;
      var dt = elapsed - end;
      if (dt >= 0 && dt < SQUASH) {
        var dist = Math.abs(a.frames[e].off[i][0] - a.frames[s].off[i][0]) +
                   Math.abs(a.frames[e].off[i][1] - a.frames[s].off[i][1]);
        var strength = Math.min(1, dist / 3) * 0.85 + 0.15;
        return (1 - dt / SQUASH) * strength;
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
    var st = this.stage;
    var cells = ev.cells;
    var cx = 0, cy = 0;
    for (var i = 0; i < cells.length; i++) {
      var r = this.cellRect(cells[i][0], cells[i][1]);
      cx += r.x + r.s / 2; cy += r.y + r.s / 2;
    }
    cx /= cells.length; cy /= cells.length;

    if (ev.type === 'goal') {
      var col = colorOf(st.pieces[ev.piece].color);
      this.burst(cx, cy, col.mid, 9 + cells.length * 3, this.cell * 0.013);
      this.ripple(cx, cy, col.mid, this.cell * 0.22, this.cell * 0.9, 360);
      this.flashes.push({ cells: cells, life: 0, max: 420, col: col.mid });
      this.shake = Math.min(this.shake + 1.1, 3);
    } else if (ev.type === 'pit') {
      this.burst(cx, cy, '#8f4a9c', 10, this.cell * 0.008);
      this.ripple(cx, cy, 'rgba(160,80,170,0.9)', this.cell * 0.5, this.cell * 0.12, 340);
      this.shake = Math.min(this.shake + 2.2, 4);
    } else if (ev.type === 'stop') {
      this.shake = Math.min(this.shake + 0.5, 2.5);
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

    var sh = 0;
    if (this.shake > 0.01) {
      sh = this.shake;
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

    this.drawGoals(ctx, dt);
    this.drawPieces(ctx, elapsed);
    if (this.drawEffects(ctx, dt)) busy = true;

    ctx.restore();

    if (this.clearGlow > 0) { this.clearGlow -= dt / 900; busy = true; }
    if (this.lostGlow > 0) { this.lostGlow -= dt / 900; busy = true; }

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

  Renderer.prototype.drawGoals = function (ctx, dt) {
    var st = this.stage;
    var pulse = 0.5 + 0.5 * Math.sin(this.time / 620);
    for (var y = 0; y < st.h; y++) {
      for (var x = 0; x < st.w; x++) {
        var i = y * st.w + x;
        var g = st.goal[i];
        if (g === E.GOAL_NONE) continue;
        var col = g === E.GOAL_ANY
          ? { hi: THEME.neutralHi, mid: THEME.neutralMid, lo: THEME.neutralLo, glow: THEME.neutralGlow, glyph: 'ring' }
          : colorOf(g);
        var r = this.cellRect(x, y);
        var cx = r.x + r.s / 2, cy = r.y + r.s / 2;
        var pad = r.s * 0.17;

        var flash = 0;
        for (var f = 0; f < this.flashes.length; f++) {
          var fl = this.flashes[f];
          for (var c = 0; c < fl.cells.length; c++) {
            if (fl.cells[c][0] === x && fl.cells[c][1] === y) flash = Math.max(flash, 1 - fl.life / fl.max);
          }
        }

        ctx.save();
        ctx.globalAlpha = 0.85;
        // Socket well
        roundRect(ctx, r.x + pad, r.y + pad, r.s - pad * 2, r.s - pad * 2, r.s * 0.2);
        ctx.fillStyle = 'rgba(0,0,10,0.30)';
        ctx.fill();

        ctx.shadowColor = col.glow;
        ctx.shadowBlur = r.s * (0.12 + pulse * 0.10 + flash * 0.6);
        ctx.strokeStyle = col.mid;
        ctx.lineWidth = Math.max(1.8, r.s * (0.055 + flash * 0.04));
        ctx.globalAlpha = 0.55 + pulse * 0.25 + flash * 0.45;
        roundRect(ctx, r.x + pad, r.y + pad, r.s - pad * 2, r.s - pad * 2, r.s * 0.2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        if (col.glyph !== 'ring') {
          ctx.globalAlpha = 0.4 + pulse * 0.2 + flash * 0.5;
          drawGlyph(ctx, col.glyph, cx, cy, r.s * 0.16, col.mid, true);
        }
        ctx.restore();
      }
    }
  };

  Renderer.prototype.drawPieces = function (ctx, elapsed) {
    var st = this.stage;
    var state = this.anim ? null : this.state;
    var frames = this.anim ? this.anim.frames : null;

    for (var i = 0; i < st.pieces.length; i++) {
      var off, alive, squash = 0;
      if (this.anim) {
        // A piece stays on screen until the tick it is drained on.
        var deadAt = -1;
        for (var k = 0; k < frames.length; k++) {
          if (!frames[k].alive[i]) { deadAt = k; break; }
        }
        if (deadAt >= 0 && elapsed >= deadAt * TICK + TICK * 0.55) continue;
        off = this.animOffset(i, elapsed);
        squash = this.impactOf(i, elapsed);
        alive = true;
      } else {
        if (!state.alive[i]) continue;
        off = state.off[i];
        alive = true;
      }
      if (!alive) continue;
      this.drawPiece(ctx, st.pieces[i], off, squash);
    }
  };

  Renderer.prototype.drawPiece = function (ctx, piece, off, squash) {
    var col = colorOf(piece.color);
    var cell = this.cell;
    var inset = Math.max(2, cell * 0.075);

    // Bounding box of the (rigid) shape, drawn as one body so multi-cell pieces
    // read as a single object rather than two blocks that happen to touch.
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var i = 0; i < piece.cells.length; i++) {
      var cx = piece.cells[i][0] + off[0], cy = piece.cells[i][1] + off[1];
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
    }
    var x = this.ox + minx * cell + inset;
    var y = this.oy + miny * cell + inset;
    var w = (maxx - minx + 1) * cell - inset * 2;
    var h = (maxy - miny + 1) * cell - inset * 2;

    // Impact squash: compress along the axis of travel, bulge across it.
    if (squash > 0.001) {
      var horiz = Math.abs(maxx - minx) >= Math.abs(maxy - miny);
      var s = squash * 0.12;
      var dw = w * s * (horiz ? 1 : -0.6);
      var dh = h * s * (horiz ? -0.6 : 1);
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
    grad.addColorStop(0, col.hi);
    grad.addColorStop(0.42, col.mid);
    grad.addColorStop(1, col.lo);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Outer glow makes movable pieces pop away from the matte walls instantly.
    ctx.shadowColor = col.glow;
    ctx.shadowBlur = cell * 0.3;
    ctx.globalAlpha = 0.55;
    roundRect(ctx, x, y, w, h, rad);
    ctx.strokeStyle = col.hi;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Gloss
    ctx.save();
    roundRect(ctx, x, y, w, h, rad);
    ctx.clip();
    var gl = ctx.createLinearGradient(x, y, x, y + h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.42)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, w, h * 0.55);
    ctx.restore();

    drawGlyph(ctx, col.glyph, x + w / 2, y + h / 2, cell * 0.15, 'rgba(6,10,26,0.5)', false);
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

    return busy;
  };

  /**
   * Celebration that stays out of the way of the board.
   *
   * The pieces draining into their goals already carry the moment, and they
   * fire at the same instant as this does. So the clear itself is one clean
   * ring and a handful of sparks — and only in colours the stage actually
   * used, because inventing a colour the player never saw is a lie about the
   * puzzle they just solved.
   */
  Renderer.prototype.celebrate = function () {
    var st = this.stage;
    var cx = this.ox + this.cell * st.w / 2;
    var cy = this.oy + this.cell * st.h / 2;
    this.ripple(cx, cy, 'rgba(190,230,255,0.75)', this.cell * 0.3, this.cell * st.w * 0.8, 620);

    var used = [];
    st.pieces.forEach(function (p) { if (used.indexOf(p.color) < 0) used.push(p.color); });
    for (var i = 0; i < used.length; i++) {
      this.burst(cx, cy, colorOf(used[i]).mid, 8, this.cell * 0.018);
    }
    this.clearGlow = 1;
    this.shake = 2.0;
  };

  Renderer.prototype.mourn = function () {
    this.lostGlow = 1;
    this.shake = 3;
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

  function drawGlyph(g, kind, cx, cy, r, color, stroke) {
    g.save();
    g.beginPath();
    if (kind === 'circle') {
      g.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (kind === 'diamond') {
      g.moveTo(cx, cy - r * 1.15); g.lineTo(cx + r * 1.15, cy);
      g.lineTo(cx, cy + r * 1.15); g.lineTo(cx - r * 1.15, cy);
      g.closePath();
    } else if (kind === 'triangle') {
      g.moveTo(cx, cy - r * 1.15); g.lineTo(cx + r, cy + r * 0.75);
      g.lineTo(cx - r, cy + r * 0.75);
      g.closePath();
    } else { // ring
      g.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
      g.moveTo(cx + r * 0.5, cy);
      g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    }
    if (stroke) {
      g.strokeStyle = color;
      g.lineWidth = Math.max(1.4, r * 0.34);
      g.stroke();
    } else {
      g.fillStyle = color;
      g.fill();
    }
    g.restore();
  }

  root.TiltRender = { Renderer: Renderer, COLORS: COLORS, THEME: THEME, TICK: TICK, TAIL: TAIL };

})(typeof window !== 'undefined' ? window : globalThis);
