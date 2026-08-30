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
 *
 * Swipe alone plays the entire game. Keyboard input is retained for desktop
 * accessibility and automated testing.
 */
(function (root) {

  var SWIPE_MIN = 18;        // px before a drag counts as aimed
  var FLICK_MIN = 10;        // px, if it was fast enough
  var FLICK_MS = 260;
  var AIM_FULL = 90;         // px of travel that reaches a full aim preview

  // How far along the aimed axis the finger has travelled, 0 at the moment the
  // aim registers and 1 once the drag is unmistakable. The board answers this
  // continuously — the penguins lean the way gravity is about to go — so the
  // player sees the move building instead of only its result.
  function progress(dir, dx, dy) {
    if (!dir) return 0;
    var d = (dir === 'L' || dir === 'R') ? Math.abs(dx) : Math.abs(dy);
    var t = (d - SWIPE_MIN) / (AIM_FULL - SWIPE_MIN);
    return t < 0 ? 0 : (t > 1 ? 1 : t);
  }

  function Input(el, handlers) {
    this.el = el;
    // { commit(dir), aim(dirOrNull), tap() } — `tap` is optional and exists for
    // one reason: a first-time player who has not worked out the gesture pokes
    // the board, and a board that answers a poke with silence has told them
    // nothing. See Game#onTap.
    this.on = handlers;
    this.start = null;
    this.aimed = null;
    this.aimMag = 0;
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
      self.aimMag = 0;
    };
    var move = function (e) {
      if (!self.start) return;
      if (e.cancelable) e.preventDefault();
      var p = point(e);
      if (!p) return;
      var dx = p.x - self.start.x, dy = p.y - self.start.y;
      var dir = self.classify(dx, dy, false);
      var mag = progress(dir, dx, dy);
      if (dir !== self.aimed || Math.abs(mag - self.aimMag) > .004) {
        self.aimed = dir; self.aimMag = mag; self.on.aim(dir, mag);
      }
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
      self.aimMag = 0;
      self.on.aim(null, 0);
      if (dir) self.on.commit(dir);
      else if (still && self.on.tap) self.on.tap();
    };
    var cancel = function () {
      self.start = null;
      self.aimed = null;
      self.aimMag = 0;
      self.on.aim(null, 0);
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

  root.TiltInput = { Input: Input };

})(typeof window !== 'undefined' ? window : globalThis);
