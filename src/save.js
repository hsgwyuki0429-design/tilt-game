'use strict';
/*
 * TILT — persistence.
 *
 * Everything here is best-effort. Private browsing, a full quota or a corrupted
 * blob must degrade to "you can still play, you just start from stage 1" — never
 * to a broken game. Every read is validated rather than trusted, because a save
 * file written by an older build is exactly the kind of thing that produces an
 * unreproducible bug report.
 */
(function (root) {

  // The ice-world campaign replaces the original compact boards, so progress
  // from that campaign must not be shown as a best score on these new stages.
  var KEY = 'tilt.save.ice.v2';

  function defaults() {
    return {
      version: 2,
      cleared: {},        // stageId -> best move count
      unlocked: 1,        // highest stage the player may enter
      sound: true,
      haptics: true,
      tilt: false,
      invertTilt: false,
      // null means "follow the system", which is different from `false` and has
      // to survive a round trip: a player who has never touched the switch must
      // keep tracking their device, and one who has must not.
      reduceMotion: null,
      // Has this person ever completed a single tilt? It is the difference
      // between somebody who needs to be shown the gesture and somebody who has
      // been playing for a week, and it is the only thing the first-run cue asks.
      everMoved: false,
      seenHowTo: false
    };
  }

  function Save() {
    this.data = defaults();
    this.available = true;
    this.load();
  }

  Save.prototype.load = function () {
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      this.available = false;
      return;
    }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      var d = defaults();
      if (parsed.cleared && typeof parsed.cleared === 'object') {
        Object.keys(parsed.cleared).forEach(function (k) {
          var v = parsed.cleared[k];
          if (/^\d+$/.test(k) && typeof v === 'number' && isFinite(v) && v > 0) d.cleared[k] = Math.floor(v);
        });
      }
      if (typeof parsed.unlocked === 'number' && isFinite(parsed.unlocked)) d.unlocked = Math.max(1, Math.floor(parsed.unlocked));
      if (typeof parsed.sound === 'boolean') d.sound = parsed.sound;
      if (typeof parsed.haptics === 'boolean') d.haptics = parsed.haptics;
      if (typeof parsed.tilt === 'boolean') d.tilt = parsed.tilt;
      if (typeof parsed.invertTilt === 'boolean') d.invertTilt = parsed.invertTilt;
      // Only a real boolean overrides the system; anything else leaves it null.
      if (typeof parsed.reduceMotion === 'boolean') d.reduceMotion = parsed.reduceMotion;
      if (typeof parsed.everMoved === 'boolean') d.everMoved = parsed.everMoved;
      if (typeof parsed.seenHowTo === 'boolean') d.seenHowTo = parsed.seenHowTo;
      this.data = d;
    } catch (e) {
      // A save we cannot read is worse than no save: start clean rather than
      // half-restoring something inconsistent.
      this.data = defaults();
      this.flush();
    }
  };

  Save.prototype.flush = function () {
    if (!this.available) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      this.available = false;
    }
  };

  Save.prototype.best = function (id) {
    var v = this.data.cleared[String(id)];
    return typeof v === 'number' ? v : null;
  };

  Save.prototype.isCleared = function (id) { return this.best(id) != null; };

  Save.prototype.recordClear = function (id, moves, total) {
    var key = String(id);
    var prev = this.data.cleared[key];
    var improved = prev == null || moves < prev;
    if (improved) this.data.cleared[key] = moves;
    if (id + 1 <= total && this.data.unlocked < id + 1) this.data.unlocked = id + 1;
    this.flush();
    return improved;
  };

  /**
   * How far ahead of your progress you may reach.
   *
   * With a hundred stages, strict one-at-a-time progression means a single
   * board you cannot see the trick to ends the game for you. A small window
   * past the frontier keeps the sequence meaningful while making sure nobody is
   * ever completely walled off by one puzzle.
   */
  Save.SKIP_WINDOW = 2;

  Save.prototype.isUnlocked = function (id) {
    return id <= this.data.unlocked + Save.SKIP_WINDOW;
  };

  /** The next stage the player has not beaten — where "continue" should land. */
  Save.prototype.frontier = function () { return this.data.unlocked; };

  Save.prototype.clearedCount = function () { return Object.keys(this.data.cleared).length; };

  Save.prototype.set = function (key, value) {
    this.data[key] = value;
    this.flush();
  };

  Save.prototype.reset = function () {
    this.data = defaults();
    this.flush();
  };

  root.TiltSave = { Save: Save };

})(typeof window !== 'undefined' ? window : globalThis);
