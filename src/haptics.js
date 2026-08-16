'use strict';
/*
 * TILT — haptics.
 *
 * Touch feedback is the one channel a puzzle game can use without taking any of
 * the screen, and the one a player notices only when it is missing. Every
 * pattern below is short, and every one of them is tied to something that
 * actually happened on the board — a tick when the aimed direction changes, a
 * knock when a block lands, a double when a run ends. None of them fires on a
 * press that had no consequence.
 *
 * WHAT IS HONESTLY AVAILABLE ON THE WEB
 * -------------------------------------
 * `navigator.vibrate` works on Android; iOS Safari has never implemented it, and
 * there is no Taptic Engine API for web pages. The one lever iOS does give us is
 * the switch control added in Safari 17.4, which plays a system haptic when it
 * is toggled by a real user gesture — so on iOS the game drives a hidden switch
 * inside the same gesture that caused the event.
 *
 * That is a genuine best-effort, not a guarantee: on an iOS build without it,
 * every call below is a silent no-op and nothing else in the game changes. The
 * settings row is hidden entirely when nothing is available, because offering a
 * switch that does nothing is worse than offering nothing.
 */
(function (root) {

  function Haptics() {
    this.enabled = true;
    this.vibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.switchEl = null;
    this.lastAt = 0;

    // Safari's switch checkbox. Presence of the attribute in the DOM is the only
    // feature test available, and a false positive costs a hidden checkbox
    // toggling to no effect.
    try {
      var probe = document.createElement('input');
      probe.type = 'checkbox';
      this.hasSwitch = 'switch' in probe;
    } catch (e) { this.hasSwitch = false; }

    this.supported = this.vibrate || this.hasSwitch;
  }

  Haptics.prototype.mount = function () {
    if (!this.hasSwitch || this.switchEl) return;
    var label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;' +
      'left:-9999px;top:0;overflow:hidden';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    this.switchEl = input;
  };

  Haptics.prototype.setEnabled = function (on) { this.enabled = !!on; };

  /**
   * `ms` is the Android pattern; the iOS path has no intensity control, so a
   * pattern with more than one pulse is played as more than one toggle.
   */
  Haptics.prototype.play = function (pattern) {
    if (!this.enabled || !this.supported) return;
    // Nothing useful comes of stacking taps closer together than the hardware
    // can resolve, and a burst of them feels like a fault rather than feedback.
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - this.lastAt < 28) return;
    this.lastAt = now;

    if (this.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* a denied vibration is not an error */ }
      return;
    }
    if (this.switchEl) {
      var el = this.switchEl;
      var pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
      for (var i = 0; i < Math.min(pulses, 3); i++) {
        (function (n) {
          setTimeout(function () { el.checked = !el.checked; }, n * 90);
        })(i);
      }
    }
  };

  // The vocabulary. Named for what happened, not for how strong it is, so a
  // change of feel later is a change in one place.
  Haptics.prototype.select  = function () { this.play(8); };            // aim crossed into a new direction
  Haptics.prototype.tilt    = function () { this.play(12); };           // a move was committed
  Haptics.prototype.land    = function () { this.play(14); };           // a block came to rest
  Haptics.prototype.collect = function () { this.play(18); };           // a block was taken
  Haptics.prototype.blocked = function () { this.play([9, 40, 9]); };   // that tilt changed nothing
  Haptics.prototype.clear   = function () { this.play([14, 60, 26]); }; // stage solved
  Haptics.prototype.over    = function () { this.play([30, 70, 30]); }; // run ended

  root.TiltHaptics = { Haptics: Haptics };

})(typeof window !== 'undefined' ? window : globalThis);
