'use strict';
/*
 * TILT — audio.
 *
 * Synthesised on the fly: no files to load, nothing to block the first frame,
 * and the pitch of every sound can carry information. Collecting the third
 * piece of a chain sounds higher than the first, so a cascade is audible as a
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

  Audio.prototype.tilt = function () {
    this.noise(0.16, 0.10, 1500);
    this.tone({ type: 'sine', freq: 260, to: 170, dur: 0.13, vol: 0.10 });
  };

  /** Distance travelled is in the pitch, so a long slide lands heavier. */
  Audio.prototype.impact = function (distance) {
    var d = Math.min(distance || 1, 5);
    this.tone({ type: 'triangle', freq: 190 - d * 12, to: 70, dur: 0.10, vol: 0.20 });
    this.noise(0.05, 0.05 + d * 0.012, 420);
  };

  /** Rising through a chain: index 0 is the root, each further piece a step up. */
  Audio.prototype.goal = function (index) {
    var scale = [0, 4, 7, 11, 14, 16, 19];
    var semi = scale[Math.min(index || 0, scale.length - 1)];
    var f = 523.25 * Math.pow(2, semi / 12);
    this.tone({ type: 'sine', freq: f, dur: 0.34, vol: 0.30 });
    this.tone({ type: 'sine', freq: f * 2, dur: 0.22, vol: 0.10, delay: 0.01 });
  };

  Audio.prototype.pit = function () {
    this.tone({ type: 'sawtooth', freq: 160, to: 38, dur: 0.42, vol: 0.24, filter: 700 });
    this.noise(0.3, 0.12, 220);
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

  Audio.prototype.lost = function () {
    this.tone({ type: 'triangle', freq: 300, to: 110, dur: 0.5, vol: 0.22, filter: 900 });
  };

  Audio.prototype.ui = function (up) {
    this.tone({ type: 'sine', freq: up ? 660 : 440, dur: 0.07, vol: 0.14 });
  };

  Audio.prototype.undo = function () {
    this.tone({ type: 'sine', freq: 420, to: 300, dur: 0.14, vol: 0.16 });
  };

  root.TiltAudio = { Audio: Audio };

})(typeof window !== 'undefined' ? window : globalThis);
