'use strict';
/*
 * TILT — graphics quality.
 *
 * Two tiers: HIGH draws the floe's ice with a layered interior (fractures and
 * bubbles at several depths), caustics on the submerged flanks, glitter and a
 * foam line; LITE keeps the same ice but flat, with a smaller shadow map, a
 * lower pixel ratio and fewer particles. Nothing here touches WebGL: it only
 * decides which tier to use, so it can be unit-tested in node
 * (tools/quality-test.js).
 *
 *   detect()        the tier a device should START in, from what the browser
 *                   says about it. Deliberately conservative: it only sends a
 *                   device to LITE when it is plainly weak.
 *   FrameMonitor    watches real frames while the board is animating and says
 *                   when the device cannot keep up, so a phone that looked fine
 *                   on paper still ends up on LITE.
 *
 * The player can override both in Settings: AUTO follows the two above, HIGH
 * and LITE are fixed.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TiltQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var MODES = ['auto', 'high', 'lite'];
  var TIERS = ['high', 'lite'];

  /* What each tier costs and buys. The renderer reads this table and nothing
     else, so adding a knob means adding a column here. */
  var TIER = {
    high: { dpr: 2,   shadow: 2048, particles: 3600, interior: 5, detail: 512, anisotropy: 8,
            caustics: true, glitter: true, foam: true },
    lite: { dpr: 1.5, shadow: 1024, particles: 1400, interior: 0, detail: 256, anisotropy: 2,
            caustics: false, glitter: false, foam: false }
  };

  /* GPUs that are software rasterisers, or old enough that a layered shader
     will not hold 30 fps at phone resolution. Matched against the unmasked
     renderer string, which Chromium exposes and Safari and Firefox mostly hide;
     where it is hidden only the monitor below can tell. */
  var WEAK_GPU = new RegExp([
    'swiftshader', 'llvmpipe', 'softpipe', 'software', 'basic render', 'microsoft basic',
    'mali-(?:4|t[0-7])', 'mali-g(?:31|51|52)\\b',
    'adreno[^0-9]*(?:2\\d\\d|30\\d|40\\d|50\\d)\\b',
    'powervr (?:sgx|rogue g)', 'videocore', 'vivante', 'tegra [2-4]\\b',
    'intel[^,]*(?:hd graphics [2-4]\\d{3}\\b|gma)'
  ].join('|'), 'i');

  /**
   * The tier to start in.
   *   info = { renderer, cores, memory, maxTexture, saveData }
   * Every field may be missing; a missing field never counts against the device.
   * Returns { tier, reason }.
   */
  function detect(info) {
    info = info || {};
    var renderer = String(info.renderer || '');
    if (WEAK_GPU.test(renderer)) return { tier: 'lite', reason: 'gpu' };
    if (info.maxTexture && info.maxTexture < 4096) return { tier: 'lite', reason: 'texture-limit' };
    var cores = info.cores || 0, memory = info.memory || 0;
    if (memory && memory <= 2 && (!cores || cores <= 4)) return { tier: 'lite', reason: 'memory' };
    if (cores && cores <= 2) return { tier: 'lite', reason: 'cores' };
    return { tier: 'high', reason: 'default' };
  }

  /**
   * Which tier a mode means right now.
   *   mode    'auto' | 'high' | 'lite'
   *   hint    detect()'s answer for this device
   *   learned { at } if the monitor once dropped this device to LITE, or null
   *   now     epoch ms
   * AUTO honours a learned downgrade for two weeks, then tries HIGH again.
   */
  var LEARNED_DAYS = 14;
  function resolve(mode, hint, learned, now) {
    if (mode === 'high' || mode === 'lite') return { tier: mode, reason: 'chosen' };
    if (learned && typeof learned.at === 'number' && now - learned.at < LEARNED_DAYS * 864e5 && now >= learned.at) {
      return { tier: 'lite', reason: 'learned' };
    }
    return hint || { tier: 'high', reason: 'default' };
  }

  function validMode(m) { return MODES.indexOf(m) >= 0 ? m : 'auto'; }

  /**
   * Watches the gap between animation frames.
   *
   * Only frames that follow a busy frame count: when the board is at rest the
   * game loop idles at about 20 fps on purpose, and a gap there says nothing
   * about the GPU. A frame the game clamped (>= 64 ms) counts as a very slow
   * one. The first frames after a stage loads or a context is created are
   * skipped, because compiling shaders and uploading textures is a hitch every
   * device has once.
   *
   * The verdict needs a sustained average over a full window, not one bad
   * frame. 38 ms is above iOS Low Power Mode and 30 Hz battery savers (33 ms),
   * which are choices and not weakness, and below anything a player calls slow.
   * A device that is plainly struggling (the last ten frames average 80 ms,
   * about 12 fps) is told sooner, because waiting out a full window at that
   * speed is itself the bad experience.
   */
  var WINDOW = 36;          // frames in a verdict
  var SLOW_MS = 38;         // average gap that fails it
  var SEVERE_N = 10;        // the latest frames judged on their own...
  var SEVERE_MS = 80;       // ...and the average that fails them
  var WARMUP = 12;          // busy frames ignored after start() / reset()
  var MAX_SAMPLE = 120;     // one frame never speaks for more than this

  function FrameMonitor(opts) {
    opts = opts || {};
    this.window = opts.window || WINDOW;
    this.slow = opts.slow || SLOW_MS;
    this.warmup = opts.warmup != null ? opts.warmup : WARMUP;
    this.reset();
  }
  FrameMonitor.prototype.reset = function () {
    this.samples = [];
    this.skip = this.warmup;
    this.prevBusy = false;
    this.verdict = null;
  };
  /* A new stage is loading: ignore the next few busy frames (geometry and
     textures are being uploaded) but keep what has been measured so far, so a
     player who solves short stages still builds up a verdict. */
  FrameMonitor.prototype.settle = function (frames) {
    this.skip = Math.max(this.skip, frames == null ? 8 : frames);
    this.prevBusy = false;
  };
  /**
   * Feed one frame. `dt` is the gap since the previous frame in ms, `busy` is
   * what the renderer returned for it. Returns 'slow' once, when the window
   * average fails; otherwise null.
   */
  FrameMonitor.prototype.observe = function (dt, busy) {
    var counted = this.prevBusy && dt > 0;
    this.prevBusy = !!busy;
    if (!counted || this.verdict) return null;
    if (this.skip > 0) { this.skip--; return null; }
    this.samples.push(Math.min(dt, MAX_SAMPLE));
    if (this.samples.length > this.window) this.samples.shift();
    var n = this.samples.length, i, sum = 0;
    if (n >= SEVERE_N) {
      for (i = n - SEVERE_N; i < n; i++) sum += this.samples[i];
      if (sum / SEVERE_N > SEVERE_MS) { this.verdict = 'slow'; return 'slow'; }
    }
    if (n < this.window) return null;
    for (sum = 0, i = 0; i < n; i++) sum += this.samples[i];
    if (sum / n > this.slow) { this.verdict = 'slow'; return 'slow'; }
    return null;
  };

  return {
    MODES: MODES, TIERS: TIERS, TIER: TIER, WEAK_GPU: WEAK_GPU, LEARNED_DAYS: LEARNED_DAYS,
    detect: detect, resolve: resolve, validMode: validMode, FrameMonitor: FrameMonitor
  };
});
