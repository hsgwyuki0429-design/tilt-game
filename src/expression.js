'use strict';
/*
 * TILT — penguin expressions and reactions.
 *
 * The board already says what happened. This says how the penguin felt about
 * it — and nothing else. Nothing in here is allowed to touch the engine state,
 * the history, the phase, or a block's grid position: every value it produces
 * is a face to draw and a sub-cell offset to draw it at, and the renderer is
 * free to ignore both.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE NO setTimeouts IN THIS FILE
 * ---------------------------------------------------------------------------
 *
 * The obvious way to hold a face for 600ms is a timer that puts it back. It is
 * also the way to get this wrong: swipe again at 300ms and the second face is
 * on screen when the first one's timer fires and reverts it. Every fix for
 * that is a fix for cancelling timers correctly, forever.
 *
 * So a reaction does not schedule anything. It records the wall-clock instant
 * it expires at, and the frame loop — which is already running, because a
 * reaction is animating — notices. Setting a new reaction overwrites that
 * instant. There is nothing left behind to cancel, so there is nothing to get
 * wrong: the most recent reaction is the only one that exists.
 *
 * A monotonically increasing `token` is still stamped on each reaction, so any
 * caller that does want to check "is the thing I started still the current
 * one?" can, and so a stale animation frame can identify itself.
 *
 * ---------------------------------------------------------------------------
 * ONE PENGUIN, ONE FACE
 * ---------------------------------------------------------------------------
 *
 * State is per block index, never per board. A collected penguin and a penguin
 * standing one swipe away from cracked ice are having completely different days
 * and the board should show that. Where a judgement really is about the whole
 * move — "that was the shortest move available" is a fact about the position,
 * not about one block — the caller proposes it to every live penguin and the
 * priority table lets each penguin's own news win.
 *
 * ---------------------------------------------------------------------------
 * GOOD, BAD AND PERFECT ARE NOT GUESSES
 * ---------------------------------------------------------------------------
 *
 * This is a puzzle. Moving away from the aurora is routinely the only way to
 * solve a board, so "closer is good, further is bad" would be wrong more often
 * than a reaction is worth. `evaluateMove` therefore never measures distance on
 * the board. It compares the number of moves the position still needs — the
 * engine's own breadth-first solver, the same one the campaign was built with —
 * before and after. A move is GOOD only when it provably shortened the solution
 * by one, and BAD only when it provably lengthened it. When the solver could
 * not answer exactly, the verdict is NORMAL and the penguin says nothing.
 */
(function (root, factory) {
  // Dual-loadable for the same reason the engine is: the reaction rules are
  // logic, and logic the player runs should be the logic the tests run.
  var engine = (root && root.TiltEngine) ||
    (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(engine);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.TiltExpression = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {

  // ---------------------------------------------------------------------------
  // The nine faces
  // ---------------------------------------------------------------------------
  //
  // One drawing each. `normal` is the face the game has always used and stays
  // the file the renderer already had loaded; the other eight were drawn for
  // this feature. Nothing reads a face by anything but its expression name, so
  // replacing one is a single line here.

  var FACE_FILES = {
    normal:   'assets/textures/faces/penguin-front.png',
    good:     'assets/textures/faces/penguin-face-good.png',
    perfect:  'assets/textures/faces/penguin-face-perfect.png',
    clear:    'assets/textures/faces/penguin-face-clear.png',
    surprise: 'assets/textures/faces/penguin-face-surprise.png',
    danger:   'assets/textures/faces/penguin-face-danger.png',
    miss:     'assets/textures/faces/penguin-face-miss.png',
    bad:      'assets/textures/faces/penguin-face-bad.png',
    fail:     'assets/textures/faces/penguin-face-fail.png'
  };

  var EXPRESSIONS = ['normal', 'good', 'perfect', 'clear', 'surprise',
    'danger', 'miss', 'bad', 'fail'];

  /**
   * Which news wins when two things happen to one penguin in one move.
   *
   * Read downwards: a run that ended is the only thing worth saying, a stage
   * cleared beats a good move that also cleared it, and standing one swipe from
   * cracked ice beats any compliment about the move that put you there.
   */
  var PRIORITY = {
    normal: 0, bad: 1, good: 2, surprise: 3, miss: 4,
    perfect: 5, danger: 6, clear: 7, fail: 8
  };

  /** How long a face is held before it goes back to normal, in ms. */
  var HOLD = {
    good: 600, perfect: 820, surprise: 400, danger: 600, miss: 400, bad: 520
  };

  /** Faces that are a standing condition rather than a reaction. */
  var STICKY = { clear: true, fail: true };

  /**
   * The movement that goes with each face.
   *
   * `scale` is about the block's own centre and `dx`/`dy` are in cells, so both
   * are applied by the renderer to the quad it was going to draw anyway. A cell
   * is 24–112px, which puts every offset below in the two-to-eight pixel range
   * the brief asked for, at every board size, without a pixel appearing here.
   */
  var ANIM = {
    good:     { ms: 300, kind: 'pop' },
    perfect:  { ms: 460, kind: 'overshoot' },
    clear:    { ms: 480, kind: 'hop' },
    surprise: { ms: 280, kind: 'startle' },
    danger:   { ms: 420, kind: 'shiver' },
    miss:     { ms: 320, kind: 'recoil' },
    bad:      { ms: 340, kind: 'sink' },
    fail:     { ms: 500, kind: 'wobble' }
  };

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function easeOut(p) { return 1 - Math.pow(1 - p, 2.4); }
  /** A 0 → 1 → 0 arc: what almost every one of these beats is made of. */
  function arc(p) { return Math.sin(clamp01(p) * Math.PI); }

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  /**
   * The pose at `p` (0..1) through a reaction, as a flat scale-and-offset.
   *
   * Everything is small on purpose. The board is the thing being read; a
   * penguin that leaps about is a penguin covering the cell behind it.
   */
  function pose(kind, p, dir) {
    var out = { scale: 1, dx: 0, dy: 0, lift: 0 };
    var a, d;
    if (kind === 'pop') {
      out.scale = 1 + .07 * arc(p);
    } else if (kind === 'startle') {
      out.scale = 1 + .10 * arc(p);
    } else if (kind === 'overshoot') {
      // 1 → 1.12 → 0.97 → 1, so the rebound is felt rather than just the pop.
      if (p < .34) out.scale = 1 + .12 * easeOut(p / .34);
      else if (p < .66) out.scale = 1.12 - .15 * easeOut((p - .34) / .32);
      else out.scale = .97 + .03 * easeOut((p - .66) / .34);
    } else if (kind === 'hop') {
      out.scale = 1 + .10 * arc(p);
      out.dy = -.13 * arc(p);
      out.lift = arc(p);
    } else if (kind === 'shiver') {
      // Small, fast and decaying: a shiver, not a dance.
      out.dx = .026 * Math.sin(p * Math.PI * 6) * (1 - p);
    } else if (kind === 'recoil') {
      // Back the way the swipe came from, and settle.
      d = E.DV[dir] || [0, 0];
      a = .06 * arc(p);
      out.dx = -d[0] * a; out.dy = -d[1] * a;
    } else if (kind === 'sink') {
      out.dy = .05 * arc(p);
      out.scale = 1 - .045 * arc(p);
    } else if (kind === 'wobble') {
      out.dx = .038 * Math.sin(p * Math.PI * 4) * (1 - p);
    }
    return out;
  }

  var REST = { face: null, expression: 'normal', scale: 1, dx: 0, dy: 0, lift: 0 };

  // ---------------------------------------------------------------------------
  // Preloading
  // ---------------------------------------------------------------------------

  /**
   * All nine faces, decoded before any of them is needed.
   *
   * The first frame a face is used is mid-move, and an image that starts
   * loading there is a hitch in the one animation the player is watching. Paths
   * are deduplicated rather than assumed distinct, so two expressions may share
   * one drawing without costing a second request; `normal` is the file the
   * renderer already had in cache.
   */
  function FaceBank(onReady) {
    this.images = {};
    this.paths = [];
    this.loaded = 0;
    this.onReady = onReady || function () {};
    var seen = {}, self = this;
    EXPRESSIONS.forEach(function (name) {
      var src = FACE_FILES[name];
      if (seen[src]) return;
      seen[src] = true;
      self.paths.push(src);
    });
    this.expected = this.paths.length;
    this.load();
  }
  FaceBank.prototype.load = function () {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      this.loaded = this.expected;
      return;
    }
    var self = this;
    this.paths.forEach(function (src) {
      var img = new Image();
      img.decoding = 'async';
      var done = function (ok) {
        if (ok) self.images[src] = img;
        self.loaded++;
        if (self.loaded === self.expected) self.onReady();
      };
      img.onload = function () { done(true); };
      // A face that will not decode is not a reason to stop the game: the
      // renderer falls back to the face it was already drawing.
      img.onerror = function () { done(false); };
      img.src = src;
    });
  };
  FaceBank.prototype.ready = function () { return this.loaded >= this.expected; };
  FaceBank.prototype.face = function (expression) {
    var src = FACE_FILES[expression];
    return src ? (this.images[src] || null) : null;
  };

  // ---------------------------------------------------------------------------
  // Judging a move
  // ---------------------------------------------------------------------------

  /**
   * Was that a good move?
   *
   * Deliberately a free function over two states plus whatever the caller
   * already knows, so it can be tested on its own and replaced wholesale. It
   * takes the two distances rather than computing them because the caller is
   * already solving the settled position for the dead-end notice, and solving
   * the same board twice a move to say the same thing would be a waste.
   *
   *   ctx.beforeDist / ctx.afterDist  { solvable, exact, moves } — moves left
   *   ctx.streak                      optimal moves in a row before this one
   *   ctx.bigMovers                   penguins that slid three or more cells
   *
   * Returns { type, confidence, reason }. A confidence of 0 means "no idea",
   * and the caller must show nothing rather than guess — a wrong BAD is worse
   * than no reaction at all.
   */
  function evaluateMove(before, after, ctx) {
    ctx = ctx || {};
    var b = ctx.beforeDist, a = ctx.afterDist;

    if (!b || !a || !b.exact || !a.exact || !b.solvable) {
      return { type: 'normal', confidence: 0, reason: 'no-solver-answer' };
    }
    if (!a.solvable) {
      // The position can no longer be won. That is a dead end, which the game
      // reports in its own words; it is not this function's business to grade.
      return { type: 'normal', confidence: 0, reason: 'dead-end' };
    }

    // A move changes the remaining distance by at most one in the good
    // direction, so this is exactly "the move was on a shortest solution".
    if (a.moves === b.moves - 1) {
      if (a.moves <= 1) {
        return { type: 'perfect', confidence: 1, reason: 'one-move-from-clear' };
      }
      if ((ctx.streak || 0) >= 2) {
        return { type: 'perfect', confidence: 1, reason: 'optimal-streak' };
      }
      if ((ctx.bigMovers || 0) >= 2) {
        return { type: 'perfect', confidence: 1, reason: 'optimal-and-far' };
      }
      return { type: 'good', confidence: 1, reason: 'optimal' };
    }

    if (a.moves > b.moves) {
      return { type: 'bad', confidence: 1, reason: 'lengthened-the-solution' };
    }

    // Same distance: not progress, not a setback. Say nothing.
    return { type: 'normal', confidence: 1, reason: 'neutral' };
  }

  // ---------------------------------------------------------------------------
  // The controller
  // ---------------------------------------------------------------------------

  /**
   * Per-penguin expression state for the stage in play.
   *
   * A penguin's position is not copied in here. The engine state is the only
   * place a block's cell is allowed to live, so `positionOf` reads it back
   * through the accessor the game handed over; a mirrored copy would be one
   * more thing to keep in step and one more way to be wrong.
   */
  function PenguinReactions(opts) {
    opts = opts || {};
    this.bank = opts.bank || new FaceBank(opts.onReady);
    this.reduceMotion = false;
    this.stage = null;
    this.readState = null;
    this.pens = [];        // index-aligned with stage.blocks; null where a drifter is
    this.batch = null;
    this.tokens = 0;
  }

  PenguinReactions.prototype.setStage = function (stage, readState) {
    this.stage = stage;
    this.readState = readState || null;
    this.pens = [];
    this.batch = null;
    if (!stage) return;

    for (var i = 0; i < stage.blocks.length; i++) {
      var colour = stage.colour[i];
      if (colour === E.GRAY) { this.pens.push(null); continue; }   // a drifter has no face
      this.pens.push({
        index: i,
        id: 'penguin-' + (E.COLOUR_NAME[colour] || colour),
        colour: colour,
        goal: goalCellFor(stage, colour),
        expression: 'normal',
        token: 0,
        until: 0,
        anim: null,
        animId: 0,
        animStart: 0,
        dir: null
      });
    }
  };

  function goalCellFor(stage, colour) {
    for (var g = 0; g < stage.goalCells.length; g++) {
      var cell = stage.goalCells[g];
      if (E.accepts(stage.goalColour[cell], colour)) {
        return [cell % stage.w, Math.floor(cell / stage.w)];
      }
    }
    return null;
  }

  /** Where this penguin is right now, straight from the engine state. */
  PenguinReactions.prototype.positionOf = function (index) {
    var s = this.readState ? this.readState() : null;
    if (!s || !s.pos[index] || !s.alive[index]) return null;
    return [s.pos[index][0], s.pos[index][1]];
  };

  PenguinReactions.prototype.get = function (index) { return this.pens[index] || null; };

  /** Every penguin still on the board, as block indices. */
  PenguinReactions.prototype.live = function () {
    var s = this.readState ? this.readState() : null, out = [];
    for (var i = 0; i < this.pens.length; i++) {
      if (!this.pens[i]) continue;
      if (s && !s.alive[i]) continue;
      out.push(i);
    }
    return out;
  };

  /** Back to a board nobody has swiped yet. */
  PenguinReactions.prototype.reset = function () {
    this.batch = null;
    for (var i = 0; i < this.pens.length; i++) {
      var p = this.pens[i];
      if (!p) continue;
      p.token = ++this.tokens;      // anything still holding an older token is void
      p.expression = 'normal';
      p.until = 0;
      p.anim = null;
      p.animId = 0;
      p.dir = null;
    }
  };

  /**
   * Set a face directly. `showPenguinReaction` in the brief's terms — the face
   * plus the beat that goes with it.
   *
   * Overwriting is the whole cancellation story: the previous reaction's expiry
   * instant is gone the moment this one records its own.
   */
  PenguinReactions.prototype.setExpression = function (index, expression, opts) {
    var p = this.pens[index];
    if (!p || !FACE_FILES[expression]) return null;
    opts = opts || {};
    var t = opts.now == null ? now() : opts.now;

    p.token = ++this.tokens;
    p.expression = expression;
    p.dir = opts.dir || null;
    p.until = STICKY[expression] ? Infinity
      : (HOLD[expression] ? t + HOLD[expression] : 0);
    p.anim = ANIM[expression] || null;
    p.animId = p.anim ? p.token : 0;
    p.animStart = t;
    return p.token;
  };

  /** The batch: everything one move did to one penguin, resolved by priority. */
  PenguinReactions.prototype.begin = function () { this.batch = {}; return this; };

  PenguinReactions.prototype.propose = function (index, expression, opts) {
    if (!this.pens[index] || !FACE_FILES[expression]) return this;
    if (!this.batch) this.begin();
    var held = this.batch[index];
    if (held && PRIORITY[held.expression] >= PRIORITY[expression]) return this;
    this.batch[index] = { expression: expression, opts: opts || {} };
    return this;
  };

  PenguinReactions.prototype.commit = function () {
    var batch = this.batch, t = now();
    this.batch = null;
    if (!batch) return this;
    for (var key in batch) {
      if (!Object.prototype.hasOwnProperty.call(batch, key)) continue;
      var entry = batch[key], opts = entry.opts;
      this.setExpression(Number(key), entry.expression,
        { dir: opts.dir, now: t });
    }
    return this;
  };

  /** Propose the same thing to every penguin still on the board. */
  PenguinReactions.prototype.proposeLive = function (expression, opts) {
    var live = this.live();
    for (var i = 0; i < live.length; i++) this.propose(live[i], expression, opts);
    return this;
  };

  /** Propose to every penguin on the stage, collected or not. */
  PenguinReactions.prototype.proposeAll = function (expression, opts) {
    for (var i = 0; i < this.pens.length; i++) {
      if (this.pens[i]) this.propose(i, expression, opts);
    }
    return this;
  };

  /**
   * Retire faces whose hold has run out. Called once per frame; returns true
   * while anything is still animating, so the frame loop knows to stay awake.
   *
   * This is where the missing timers went. An expiry that passed while the tab
   * was hidden or a sheet was open simply resolves on the next tick, because
   * `until` is an instant and not a countdown.
   */
  PenguinReactions.prototype.tick = function (t) {
    if (t == null) t = now();
    var busy = false;
    for (var i = 0; i < this.pens.length; i++) {
      var p = this.pens[i];
      if (!p) continue;
      if (p.expression !== 'normal' && t >= p.until) {
        p.expression = 'normal';
        p.until = 0;
        p.anim = null;
        p.animId = 0;
        p.dir = null;
      }
      // Stay awake while the pose is still moving, and while a hold is still
      // counting down so its expiry lands on time. A sticky face that has
      // finished its beat is a still picture, and the loop may idle again.
      if (p.anim && t - p.animStart < p.anim.ms) busy = true;
      if (p.expression !== 'normal' && p.until !== Infinity) busy = true;
    }
    return busy;
  };

  /**
   * What to draw for this penguin: a face image and a pose.
   *
   * Every face is the same 512px square mapped onto the same quad, so switching
   * between them cannot move or resize anything; the pose is the only thing
   * that does, it is applied about the block's centre, and reduced motion turns
   * it off entirely while leaving the expression itself intact.
   */
  PenguinReactions.prototype.visualFor = function (index, t) {
    var p = this.pens[index];
    if (!p || p.expression === 'normal') return REST;
    if (t == null) t = now();

    var out = { face: this.bank.face(p.expression), expression: p.expression,
      scale: 1, dx: 0, dy: 0, lift: 0 };
    if (this.reduceMotion || !p.anim) return out;

    var phase = (t - p.animStart) / p.anim.ms;
    if (phase < 0 || phase >= 1) return out;
    var q = pose(p.anim.kind, phase, p.dir);
    out.scale = q.scale; out.dx = q.dx; out.dy = q.dy; out.lift = q.lift;
    return out;
  };

  /** A plain snapshot, for tests and for the QA harness. */
  PenguinReactions.prototype.snapshot = function () {
    var out = [], self = this;
    this.pens.forEach(function (p) {
      if (!p) return;
      out.push({ id: p.id, colour: p.colour, goal: p.goal,
        position: self.positionOf(p.index), expression: p.expression,
        token: p.token });
    });
    return out;
  };

  return {
    EXPRESSIONS: EXPRESSIONS,
    FACE_FILES: FACE_FILES,
    PRIORITY: PRIORITY,
    HOLD: HOLD,
    STICKY: STICKY,
    ANIM: ANIM,
    FaceBank: FaceBank,
    PenguinReactions: PenguinReactions,
    evaluateMove: evaluateMove,
    pose: pose
  };

});
