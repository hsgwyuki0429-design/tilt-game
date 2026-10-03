'use strict';
/*
 * TILT — audio.
 *
 * Synthesised on the fly: no files to load, nothing to block the first frame,
 * and the pitch of every sound can carry information. Collecting the third
 * block of a chain sounds higher than the first, so a cascade is audible as a
 * rising figure rather than three identical blips.
 *
 * The context is created lazily on the first real gesture, which is what mobile
 * autoplay policies require anyway.
 */
(function (root) {

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.failed = false;
  }

  Audio.prototype.ensure = function () {
    if (this.ctx || this.failed) return this.ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.failed = true; return null; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.26;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.failed = true;
    }
    return this.ctx;
  };

  Audio.prototype.resume = function () {
    var c = this.ensure();
    if (c && c.state === 'suspended') c.resume().catch(function () {});
  };

  Audio.prototype.setMuted = function (m) { this.muted = m; };

  Audio.prototype.tone = function (opts) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);

    var vol = (opts.vol == null ? 0.5 : opts.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, opts.dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    var node = osc;
    if (opts.filter) {
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.filter, t0);
      osc.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  };

  Audio.prototype.noise = function (dur, vol, freq) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c) return;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 900;
    f.Q.value = 0.8;
    var g = c.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  };

  // -- the vocabulary ---------------------------------------------------------

  /* One shared bed of ice texture, built once: white noise roughened by a
     slowly wandering grain, with sparse crystalline ticks scattered through it
     (the tiny chips and ridges a sliding body runs over). Every slide plays a
     different stretch of it, at a slightly different speed, so no two slides
     sound the same and nothing is allocated per move. */
  Audio.prototype.iceBed = function () {
    if (this._ice) return this._ice;
    var c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 2.5);
    var buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var rough = 0, tickAmp = 0, decay = Math.exp(-1 / (sr * 0.0006)), i;
    for (i = 0; i < len; i++) {
      // Grain: a random walk, low-passed to tens of hertz, modulates the depth.
      rough += ((Math.random() * 2 - 1) - rough) * (360 / sr);
      var n = (Math.random() * 2 - 1) * (0.62 + 0.38 * Math.max(-1, Math.min(1, rough * 3)));
      // Ticks: ~900 a second, each a very short, sharp, decaying spike.
      if (Math.random() < 900 / sr) tickAmp = (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1);
      var tick = tickAmp * (Math.random() * 0.6 + 0.4); tickAmp *= decay;
      d[i] = n * 0.55 + tick;
    }
    // Fade both ends so a random start never clicks.
    for (i = 0; i < 256; i++) { d[i] *= i / 256; d[len - 1 - i] *= i / 256; }
    this._ice = buf;
    return buf;
  };

  /* Values for setValueCurveAtTime that follow a slide's speed. The renderer
     eases position as 1 - (1 - u)^2.45, so speed goes as (1 - u)^1.45. */
  function speedCurve(n, lo, hi, power) {
    var a = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var v = Math.pow(1 - i / (n - 1), 1.45);
      a[i] = lo + (hi - lo) * Math.pow(v, power || 1);
    }
    return a;
  }

  /**
   * A body sliding on ice: a hiss that is bright and loud while it is fast and
   * dulls as it slows, a faint glassy ring from the sheet itself, and the low
   * weight of the body pressing on it.
   *   start  seconds from now      dur   seconds until it comes to rest
   *   cells  how far it travels    pan   -1 (left) .. 1 (right)
   */
  Audio.prototype.slide = function (start, dur, cells, pan) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c || !(dur > 0)) return;
    var t0 = c.currentTime + Math.max(0, start || 0), tail = 0.07, span = dur + tail;
    var bed = this.iceBed(), d = Math.min(cells || 1, 5), k;
    var src = c.createBufferSource();
    src.buffer = bed;
    // A faster body runs over more of the sheet's grain per second, so the
    // texture itself sinks in pitch and thins out as it slows.
    var rate = 0.92 + Math.random() * 0.16;
    src.playbackRate.setValueCurveAtTime(speedCurve(48, rate * 0.55, rate * 1.25, 1), t0, span);
    var out = c.createGain();
    out.gain.value = 0.62 + d * 0.07;
    if (c.createStereoPanner && pan) {
      var panner = c.createStereoPanner();
      panner.pan.value = Math.max(-0.6, Math.min(0.6, pan * 0.6));
      out.connect(panner); panner.connect(this.master);
    } else {
      out.connect(this.master);
    }

    // 1. The scrape: high-passed grain whose brightness follows the speed.
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300; hp.Q.value = 0.6;
    var pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 4600; pk.Q.value = 0.9; pk.gain.value = 7;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    var scrape = c.createGain();
    src.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(scrape); scrape.connect(out);

    // 2. The ring: narrow resonances of the sheet, sinking a little as the
    //    body slows. Quiet, but it is what makes the hiss sound like glass.
    var ring = c.createGain(), ringLp = c.createBiquadFilter();
    ringLp.type = 'lowpass'; ringLp.Q.value = 0.5;
    ring.connect(ringLp); ringLp.connect(out);
    var base = 2350 + Math.random() * 300, ratios = [1, 1.61, 2.47, 3.38], levels = [1, 0.7, 0.45, 0.3];
    for (k = 0; k < ratios.length; k++) {
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 38 + k * 6;
      bp.frequency.setValueAtTime(base * ratios[k], t0);
      bp.frequency.linearRampToValueAtTime(base * ratios[k] * 0.93, t0 + span);
      var bg = c.createGain(); bg.gain.value = levels[k] * 6;
      src.connect(bp); bp.connect(bg); bg.connect(ring);
    }

    // 3. The weight: a low rumble of the body on the sheet.
    var low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 280; low.Q.value = 0.7;
    var body = c.createGain();
    src.connect(low); low.connect(body); body.connect(out);

    // Every level rides the speed curve, after a few ms of attack (no click).
    function ride(param, hi, power) {
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(hi, t0 + 0.012);
      param.setValueCurveAtTime(speedCurve(48, 0.0001, hi, power), t0 + 0.013, Math.max(0.02, span - 0.013));
    }
    ride(scrape.gain, 0.55, 1.1);
    ride(ring.gain, 0.5, 0.8);
    ride(body.gain, 0.9, 1.4);
    lp.frequency.setValueCurveAtTime(speedCurve(48, 2200, 12000, 1), t0, span);
    ringLp.frequency.setValueCurveAtTime(speedCurve(48, 2600, 14000, 1), t0, span);

    var offset = Math.random() * Math.max(0, bed.duration - span * 1.3 - 0.1);
    src.start(t0, offset);
    src.stop(t0 + span + 0.05);
  };

  /* A swipe: a breath of air as the floe leans. The slide carries the rest. */
  Audio.prototype.tilt = function () {
    this.noise(0.12, 0.035, 1800);
  };

  /* Struck ice: the inharmonic partials of a small block, each dying fast. */
  Audio.prototype.clink = function (when, f0, vol) {
    var c = this.ctx, t0 = c.currentTime + when;
    var ratios = [1, 2.32, 4.25, 6.63, 9.1], decays = [0.16, 0.1, 0.06, 0.04, 0.025];
    for (var k = 0; k < ratios.length; k++) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f0 * ratios[k] * (1 + (Math.random() - 0.5) * 0.01);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol / (1 + k * 0.6), t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decays[k]);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + decays[k] + 0.02);
    }
  };

  /**
   * A slide ending. At the edge of the ice: a short scrape-stop and a soft
   * thump. Against another penguin: two blocks of ice knocking. A longer slide
   * lands heavier.
   */
  Audio.prototype.impact = function (distance, knock) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c) return;
    var d = Math.min(distance || 1, 5);
    if (knock) {
      this.clink(0, 760 + Math.random() * 90, 0.09 + d * 0.012);
      this.noise(0.03, 0.10 + d * 0.015, 3800);
    } else {
      this.noise(0.07, 0.06 + d * 0.012, 2600);
    }
    this.tone({ type: 'sine', freq: 150 - d * 8, to: 62, dur: 0.09, vol: 0.10 + d * 0.02, filter: 400 });
  };

  /** Rising through a chain: index 0 is the root, each further piece a step up. */
  Audio.prototype.goal = function (index) {
    var scale = [0, 4, 7, 11, 14, 16, 19];
    var semi = scale[Math.min(index || 0, scale.length - 1)];
    var f = 523.25 * Math.pow(2, semi / 12);
    this.tone({ type: 'sine', freq: f, dur: 0.34, vol: 0.30 });
    this.tone({ type: 'sine', freq: f * 2, dur: 0.22, vol: 0.10, delay: 0.01 });
  };

  /**
   * A block destroyed on a hazard.
   *
   * Deliberately the ugliest sound in the game, and deliberately short. The
   * player has lost nothing they cannot get back with one tap of undo, so this
   * is a piece of information — "that is what stopping there does" — and not a
   * punishment to be sat through.
   */
  Audio.prototype.lost = function () {
    this.noise(0.26, 0.30, 220);
    this.tone({ type: 'sawtooth', freq: 180, to: 40, dur: 0.26, vol: 0.20, filter: 900 });
    this.tone({ type: 'square', freq: 92, to: 38, dur: 0.20, vol: 0.10, delay: 0.03 });
  };

  Audio.prototype.blocked = function () {
    this.tone({ type: 'sine', freq: 120, to: 96, dur: 0.09, vol: 0.16 });
  };

  Audio.prototype.clear = function () {
    var self = this;
    [0, 4, 7, 12, 16].forEach(function (semi, i) {
      self.tone({ type: 'sine', freq: 523.25 * Math.pow(2, semi / 12), dur: 0.5, vol: 0.24, delay: i * 0.075 });
    });
  };

  Audio.prototype.ui = function (up) {
    this.tone({ type: 'sine', freq: up ? 660 : 440, dur: 0.07, vol: 0.14 });
  };

  Audio.prototype.undo = function () {
    this.tone({ type: 'sine', freq: 420, to: 300, dur: 0.14, vol: 0.16 });
  };

  root.TiltAudio = { Audio: Audio };

})(typeof window !== 'undefined' ? window : globalThis);
