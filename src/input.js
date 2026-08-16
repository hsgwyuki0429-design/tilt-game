'use strict';
/*
 * TILT — input.
 *
 * Design rule from the brief: a player should never lose because the game
 * misread them. Everything here is biased toward being generous —
 *
 *   - a swipe commits at 18px, or at any speed if the flick was fast
 *   - the dominant axis wins outright; there is no diagonal to get wrong
 *   - the direction being aimed at is drawn on the board *before* release
 *   - device tilt uses a captured neutral and needs a return to centre before
 *     it will fire again, so a held tilt cannot machine-gun moves
 *
 * Swipe alone plays the entire game. Tilt is strictly an alternative.
 */
(function (root) {

  var SWIPE_MIN = 18;        // px before a drag counts as aimed
  var FLICK_MIN = 10;        // px, if it was fast enough
  var FLICK_MS = 260;

  var TILT_ON = 14;          // degrees from neutral to fire
  var TILT_OFF = 7;          // degrees to re-arm
  var TILT_HOLD = 90;        // ms held past threshold before committing

  function Input(el, handlers) {
    this.el = el;
    // { commit(dir), aim(dirOrNull), tap() } — `tap` is optional and exists for
    // one reason: a first-time player who has not worked out the gesture pokes
    // the board, and a board that answers a poke with silence has told them
    // nothing. See Game#onTap.
    this.on = handlers;
    this.start = null;
    this.aimed = null;
    this.tilt = {
      enabled: false,
      neutral: null,
      armed: true,
      dir: null,
      since: 0,
      invert: false,
      supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
    };
    this.bind();
  }

  Input.prototype.bind = function () {
    var self = this;
    var el = this.el;

    var down = function (e) {
      var p = point(e);
      if (!p) return;
      self.start = { x: p.x, y: p.y, t: performance.now() };
      self.aimed = null;
    };
    var move = function (e) {
      if (!self.start) return;
      if (e.cancelable) e.preventDefault();
      var p = point(e);
      if (!p) return;
      var dir = self.classify(p.x - self.start.x, p.y - self.start.y, false);
      if (dir !== self.aimed) { self.aimed = dir; self.on.aim(dir); }
    };
    var up = function (e) {
      if (!self.start) return;
      var p = point(e) || self.lastPoint || null;
      var dx = 0, dy = 0;
      if (p) { dx = p.x - self.start.x; dy = p.y - self.start.y; }
      var quick = performance.now() - self.start.t < FLICK_MS;
      var dir = self.classify(dx, dy, quick);
      var still = Math.abs(dx) < 10 && Math.abs(dy) < 10;
      self.start = null;
      self.aimed = null;
      self.on.aim(null);
      if (dir) self.on.commit(dir);
      else if (still && self.on.tap) self.on.tap();
    };
    var cancel = function () {
      self.start = null;
      self.aimed = null;
      self.on.aim(null);
    };

    var point = function (e) {
      var t = e.touches && e.touches.length ? e.touches[0]
        : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
      if (t == null || t.clientX == null) return null;
      var p = { x: t.clientX, y: t.clientY };
      self.lastPoint = p;
      return p;
    };

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });

    el.addEventListener('mousedown', function (e) { e.preventDefault(); down(e); });
    window.addEventListener('mousemove', function (e) { if (self.start) move(e); });
    window.addEventListener('mouseup', function (e) { if (self.start) up(e); });

    // Keyboard is not a design target, but it makes the game testable and
    // costs nothing.
    window.addEventListener('keydown', function (e) {
      var map = {
        ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L',
        w: 'U', d: 'R', s: 'D', a: 'L', W: 'U', D: 'R', S: 'D', A: 'L'
      };
      var dir = map[e.key];
      if (dir) { e.preventDefault(); self.on.commit(dir); }
    });
  };

  Input.prototype.classify = function (dx, dy, quick) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    var need = quick ? FLICK_MIN : SWIPE_MIN;
    if (Math.max(ax, ay) < need) return null;
    // Dominant axis wins outright — there is no diagonal, so there is nothing
    // for the player to get subtly wrong.
    if (ax >= ay) return dx > 0 ? 'R' : 'L';
    return dy > 0 ? 'D' : 'U';
  };

  // -- device tilt ------------------------------------------------------------

  Input.prototype.enableTilt = function (cb) {
    var self = this;
    if (!this.tilt.supported) { cb(false, 'unsupported'); return; }

    var attach = function () {
      self.tilt.enabled = true;
      self.tilt.neutral = null;
      if (!self.tiltHandler) {
        self.tiltHandler = function (e) { self.onOrientation(e); };
        window.addEventListener('deviceorientation', self.tiltHandler);
      }
      cb(true);
    };

    // iOS 13+ requires an explicit grant, and only from a user gesture.
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(function (res) {
        if (res === 'granted') attach();
        else cb(false, 'denied');
      }).catch(function () { cb(false, 'denied'); });
    } else {
      attach();
    }
  };

  Input.prototype.disableTilt = function () {
    this.tilt.enabled = false;
    this.tilt.dir = null;
    this.on.aim(null);
  };

  Input.prototype.recentre = function () { this.tilt.neutral = null; };

  Input.prototype.onOrientation = function (e) {
    var t = this.tilt;
    if (!t.enabled || e.beta == null || e.gamma == null) return;

    if (!t.neutral) {
      t.neutral = { beta: e.beta, gamma: e.gamma };
      return;
    }

    var dBeta = e.beta - t.neutral.beta;
    var dGamma = e.gamma - t.neutral.gamma;

    // Compensate for the device being held sideways, so "tilt right" always
    // means right *on the screen*.
    var angle = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') angle = screen.orientation.angle;
    else if (typeof window.orientation === 'number') angle = window.orientation;
    var rad = -angle * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var gx = dGamma * cos - dBeta * sin;
    var gy = dBeta * cos + dGamma * sin;
    if (t.invert) gy = -gy;

    var ax = Math.abs(gx), ay = Math.abs(gy);
    var mag = Math.max(ax, ay);
    var dir = null;
    if (mag >= TILT_ON) dir = ax >= ay ? (gx > 0 ? 'R' : 'L') : (gy > 0 ? 'D' : 'U');

    if (mag < TILT_OFF) { t.armed = true; t.dir = null; this.on.aim(null); return; }
    if (!dir || !t.armed) return;

    // A brief hold before committing means the on-board arrow is always seen
    // first — which is how the tilt mapping teaches itself.
    var now = performance.now();
    if (t.dir !== dir) { t.dir = dir; t.since = now; this.on.aim(dir); return; }
    if (now - t.since >= TILT_HOLD) {
      t.armed = false;
      t.dir = null;
      this.on.aim(null);
      this.on.commit(dir);
    }
  };

  root.TiltInput = { Input: Input };

})(typeof window !== 'undefined' ? window : globalThis);
