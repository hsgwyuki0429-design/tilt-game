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

  /* One soft bed of air, built once and shared: smooth noise with no ticks
     or grit, so a slide is a breath and never a scrape. Every slide plays a
     different stretch of it. */
  Audio.prototype.airBed = function () {
    if (this._air) return this._air;
    var c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 2), i;
    var buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0), last = 0;
    for (i = 0; i < len; i++) {
      // A touch of smoothing takes the fizz off the top.
      last = last * 0.35 + (Math.random() * 2 - 1) * 0.65;
      d[i] = last;
    }
    for (i = 0; i < 256; i++) { d[i] *= i / 256; d[len - 1 - i] *= i / 256; }
    this._air = buf;
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
   * A slide: a soft, rounded "shhh" that swells in and settles as the penguin
   * slows, with a quiet, gliding hum underneath that makes it feel smooth
   * rather than noisy. Nothing harsh: no grit, no clicks, no top end.
   *   start  seconds from now      dur   seconds until it comes to rest
   *   cells  how far it travels    pan   -1 (left) .. 1 (right)
   */
  Audio.prototype.slide = function (start, dur, cells, pan) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c || !(dur > 0)) return;
    var t0 = c.currentTime + Math.max(0, start || 0), tail = 0.09, span = dur + tail;
    var d = Math.min(cells || 1, 5);
    var out = c.createGain();
    out.gain.value = 0.5 + d * 0.06;
    if (c.createStereoPanner && pan) {
      var panner = c.createStereoPanner();
      panner.pan.value = Math.max(-0.45, Math.min(0.45, pan * 0.45));
      out.connect(panner); panner.connect(this.master);
    } else {
      out.connect(this.master);
    }

    // The breath: band-passed air whose centre follows the speed.
    var bed = this.airBed(), src = c.createBufferSource();
    src.buffer = bed;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    var soft = c.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200; soft.Q.value = 0.4;
    var air = c.createGain();
    src.connect(bp); bp.connect(soft); soft.connect(air); air.connect(out);
    var centre = 1700 + Math.random() * 200;
    bp.frequency.setValueCurveAtTime(speedCurve(48, centre * 0.45, centre, 1), t0, span);

    // The hum: a mellow glide down a fourth, quiet, an octave set by distance
    // so a long slide sits a little lower than a short one.
    var hum = c.createOscillator(), humGain = c.createGain(), humLp = c.createBiquadFilter();
    hum.type = 'triangle';
    var f = 392 * Math.pow(2, -(d - 1) / 12);
    hum.frequency.setValueCurveAtTime(speedCurve(32, f * 0.75, f, 1), t0, span);
    humLp.type = 'lowpass'; humLp.frequency.value = 1200; humLp.Q.value = 0.3;
    hum.connect(humLp); humLp.connect(humGain); humGain.connect(out);

    // Envelopes: a rounded swell in (no click), then ride the speed down.
    function ride(param, hi, power, attack) {
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(hi, t0 + attack);
      param.setValueCurveAtTime(speedCurve(48, 0.0001, hi, power), t0 + attack + 0.001, Math.max(0.02, span - attack - 0.001));
    }
    ride(air.gain, 0.75, 1.2, 0.03);
    ride(humGain.gain, 0.05, 0.9, 0.04);

    var offset = Math.random() * Math.max(0, bed.duration - span - 0.1);
    src.start(t0, offset);
    src.stop(t0 + span + 0.05);
    hum.start(t0);
    hum.stop(t0 + span + 0.05);
  };

  /* A swipe: a breath of air as the floe leans. The slide carries the rest. */
  Audio.prototype.tilt = function () {
    this.noise(0.12, 0.03, 1400);
  };

  /* A soft, round, pitched knock: a sine that drops a little as it dies, with
     its octave on top for body. Marimba-ish, never a click. */
  Audio.prototype.pluck = function (f, dur, vol) {
    this.tone({ type: 'sine', freq: f, to: f * 0.92, dur: dur, vol: vol });
    this.tone({ type: 'sine', freq: f * 2, to: f * 1.86, dur: dur * 0.45, vol: vol * 0.28 });
  };

  /**
   * A slide ending. At the edge of the ice: a round, soft "tok" that lands
   * lower after a longer slide. Against another penguin: a springy "pon", a
   * quick upward blip, like two soft toys bumping.
   */
  Audio.prototype.impact = function (distance, knock) {
    if (this.muted) return;
    var c = this.ensure();
    if (!c) return;
    var d = Math.min(distance || 1, 5);
    if (knock) {
      this.tone({ type: 'sine', freq: 300, to: 460, dur: 0.07, vol: 0.16 });
      this.pluck(440, 0.22, 0.12);
    } else {
      this.pluck(220 * Math.pow(2, -(d - 1) / 24), 0.16, 0.18 + d * 0.015);
    }
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
