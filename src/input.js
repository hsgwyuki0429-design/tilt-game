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
 *   - device tilt fires from the current pose, regardless of how it got there
 *   - a captured neutral and return-to-centre gate prevent repeated moves
 *
 * Swipe alone plays the entire game. Tilt is strictly an alternative.
 */
(function (root) {

  var SWIPE_MIN = 18;        // px before a drag counts as aimed
  var FLICK_MIN = 10;        // px, if it was fast enough
  var FLICK_MS = 260;

  var TILT_ON = 9;           // degrees from neutral to fire immediately
  var TILT_OFF = 4;          // degrees to re-arm

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
      self.resetTiltPose();
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
    this.resetTiltPose();
    this.on.aim(null);
  };

  Input.prototype.resetTiltPose = function () {
    var t = this.tilt;
    t.neutral = null;
    t.armed = true;
    t.dir = null;
  };

  Input.prototype.recentre = function () {
    this.resetTiltPose();
    this.on.aim(null);
  };

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

    if (mag < TILT_OFF) {
      t.armed = true;
      t.dir = null;
      this.on.aim(null);
      return;
    }
    if (!dir) return;
    // Holding one direction emits once. A genuinely different direction is a
    // new command even when the phone never passed back through neutral.
    if (!t.armed && t.dir === dir) return;

    // The pose is the command. It does not matter whether the player moved
    // quickly, slowly, paused on the way, or the sensor skipped intermediate
    // samples: the first reading beyond the threshold fires that direction.
    t.armed = false;
    t.dir = dir;
    this.on.aim(dir);
    this.on.commit(dir);
    this.on.aim(null);
  };

  root.TiltInput = { Input: Input };

})(typeof window !== 'undefined' ? window : globalThis);
