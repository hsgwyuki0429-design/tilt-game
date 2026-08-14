'use strict';
/*
 * TILT — game shell.
 *
 * Owns exactly one mutable thing: `this.state`, the engine state for the stage
 * in play. Everything else (history, HUD, overlays) is derived from it. Undo is
 * therefore a stack of whole states rather than a list of reversed operations,
 * which is the only version of undo that cannot drift out of sync.
 */
(function (root) {

  var E = root.TiltEngine;
  var STAGES = root.TiltStages.STAGES;
  var CHAPTERS = root.TiltStages.CHAPTERS || [
    { number: 1, name: '', from: 1, to: STAGES.length, note: '' }
  ];

  function chapterOf(id) {
    for (var i = 0; i < CHAPTERS.length; i++) {
      if (id >= CHAPTERS[i].from && id <= CHAPTERS[i].to) return CHAPTERS[i];
    }
    return CHAPTERS[CHAPTERS.length - 1];
  }

  var JA = /^ja\b/i.test((navigator.language || navigator.userLanguage || 'en'));

  var TXT = {
    moves:     { ja: 'MOVES', en: 'MOVES' },
    par:       { ja: 'PAR', en: 'PAR' },
    best:      { ja: 'BEST', en: 'BEST' },
    clear:     { ja: 'CLEAR', en: 'CLEAR' },
    perfect:   { ja: 'PERFECT', en: 'PERFECT' },
    next:      { ja: 'NEXT', en: 'NEXT' },
    retry:     { ja: 'もう一度', en: 'RETRY' },
    undo:      { ja: 'UNDO', en: 'UNDO' },
    restart:   { ja: 'RESTART', en: 'RESTART' },
    stages:    { ja: 'ステージ', en: 'STAGES' },
    deadEnd:   { ja: '行き止まり', en: 'DEAD END' },
    allClear:  { ja: 'ALL STAGES CLEAR', en: 'ALL STAGES CLEAR' },
    allBody:   { ja: '全ステージ突破。', en: 'Every stage solved.' },
    progress:  { ja: 'クリア', en: 'CLEARED' },
    chapEnd:   { ja: 'CHAPTER CLEAR', en: 'CHAPTER CLEAR' },
    newBest:   { ja: 'NEW BEST', en: 'NEW BEST' },
    tiltOn:    { ja: '傾き操作 ON', en: 'TILT ON' },
    tiltOff:   { ja: '傾き操作 OFF', en: 'TILT OFF' },
    tiltNo:    { ja: 'この端末では傾きを使えません', en: 'Tilt is unavailable on this device' },
    tiltDenied:{ ja: 'センサーの許可が必要です', en: 'Motion permission was declined' },
    resetAsk:  { ja: '進行状況をすべて消去しますか？', en: 'Erase all progress?' },
    locked:    { ja: 'まだ挑戦できません', en: 'Locked' },
    chain:     { ja: 'CHAIN', en: 'CHAIN' }
  };

  function t(key) { var v = TXT[key]; return JA ? v.ja : v.en; }

  function Game() {
    this.save = new root.TiltSave.Save();
    this.audio = new root.TiltAudio.Audio();
    this.audio.setMuted(!this.save.data.sound);

    this.canvas = document.getElementById('board');
    this.renderer = new root.TiltRender.Renderer(this.canvas);

    this.stage = null;
    this.state = null;
    this.history = [];
    this.phase = 'play';        // play | busy | clear
    this.queued = null;
    this.deadEnd = false;
    this.animStart = 0;
    this.animLen = 1;

    this.dom = {
      app: document.getElementById('app'),
      stageLabel: document.getElementById('stage-label'),
      stageName: document.getElementById('stage-name'),
      moves: document.getElementById('moves'),
      par: document.getElementById('par'),
      hint: document.getElementById('hint'),
      overlay: document.getElementById('overlay'),
      menu: document.getElementById('menu'),
      grid: document.getElementById('stage-grid'),
      toast: document.getElementById('toast'),
      btnUndo: document.getElementById('btn-undo'),
      btnRestart: document.getElementById('btn-restart'),
      btnTilt: document.getElementById('btn-tilt'),
      btnSound: document.getElementById('btn-sound'),
      btnMenu: document.getElementById('btn-menu'),
      btnClose: document.getElementById('btn-close'),
      btnReset: document.getElementById('btn-reset')
    };

    this.bindUI();
    this.input = new root.TiltInput.Input(document.getElementById('board-area'), {
      commit: this.commit.bind(this),
      aim: this.aim.bind(this)
    });
    this.input.tilt.invert = !!this.save.data.invertTilt;

    this.applySoundButton();
    this.applyTiltButton(false);

    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('orientationchange', this.onResize.bind(this));
    document.addEventListener('visibilitychange', this.onVisibility.bind(this));

    // The frame loop must be fully armed before anything can call wake() —
    // loadStage() does, and an unbound this.loop would throw on the first frame.
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    this.running = false;
    this.busyFrames = false;

    this.loadStage(this.firstUnsolved());
  }

  Game.prototype.firstUnsolved = function () {
    for (var i = 0; i < STAGES.length; i++) {
      if (!this.save.isCleared(STAGES[i].id)) return i;
    }
    return 0;
  };

  // -- stage lifecycle --------------------------------------------------------

  Game.prototype.loadStage = function (index) {
    this.index = Math.max(0, Math.min(STAGES.length - 1, index));
    var def = STAGES[this.index];
    this.stage = E.compile(def);
    this.state = E.initialState(this.stage);
    this.history = [];
    this.queued = null;
    this.deadEnd = false;
    this.phase = 'play';

    this.renderer.setStage(this.stage, this.state);
    this.input.recentre();

    var chap = chapterOf(def.id);
    this.dom.stageLabel.textContent = 'STAGE ' + pad2(def.id) +
      (chap.name ? ' · ' + chap.name : '');
    this.dom.stageName.textContent = def.name;
    this.dom.par.textContent = String(def.par);
    this.hideOverlay();
    this.showHint(def);
    this.syncHud();
    // Recompute rather than merely resetting the flag: this is what clears the
    // dead-end styling the previous stage may have left on the dock.
    this.checkDeadEnd();
    this.wake();
  };

  Game.prototype.showHint = function (def) {
    var el = this.dom.hint;
    el.classList.remove('show', 'swipe-demo');
    if (!def.hint) { el.textContent = ''; return; }
    el.textContent = JA ? def.hint.ja : def.hint.en;
    // Let the layout settle before animating in, so the hint reads as arriving
    // rather than as already-there furniture.
    var self = this;
    requestAnimationFrame(function () {
      el.classList.add('show');
      if (def.id === 1) el.classList.add('swipe-demo');
    });
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(function () { el.classList.remove('show'); }, 6000);
  };

  Game.prototype.dismissHint = function () {
    this.dom.hint.classList.remove('show');
    clearTimeout(this._hintTimer);
  };

  // -- input ------------------------------------------------------------------

  Game.prototype.aim = function (dir) {
    if (this.phase === 'clear' || this.menuOpen) { this.renderer.aimDir = null; return; }
    this.renderer.aimDir = dir;
    this.wake();
  };

  Game.prototype.commit = function (dir) {
    this.audio.resume();
    if (this.menuOpen) return;

    if (this.phase === 'clear') {
      // A swipe on the clear screen is almost always "go on then".
      this.next();
      return;
    }

    if (this.phase === 'busy') {
      // Accept a follow-up only once the current slide is mostly played, so a
      // fast player is never ignored but a stray double-flick is.
      var p = (performance.now() - this.animStart) / this.animLen;
      if (p > 0.5) this.queued = dir;
      return;
    }
    this.applyMove(dir);
  };

  Game.prototype.applyMove = function (dir) {
    var res = E.simulate(this.stage, this.state, dir);
    this.dismissHint();
    this.renderer.gravity = dir;

    if (!res.moved) {
      // Nothing shifted. Say so, and do not charge a move for it.
      this.audio.blocked();
      this.renderer.rebuff(dir);
      this.wake();
      return;
    }

    this.history.push(E.cloneState(this.state));
    this.audio.tilt();

    this.setPhase('busy');
    this.animStart = performance.now();
    this.animLen = Math.max(1, (res.frames.length - 1) * root.TiltRender.TICK + root.TiltRender.TAIL);

    var self = this;
    var goalIndex = 0;
    // Sounds ride the renderer's event clock, so audio and picture cannot drift
    // apart. A callback rather than a patched method: a stage change mid-slide
    // clears it along with everything else, instead of leaving a stale
    // override behind on the renderer.
    this.renderer.onEvent = function (ev) {
      if (ev.type === 'goal') self.audio.goal(goalIndex++);
      else if (ev.type === 'stop') self.audio.impact(1);
    };

    var chain = res.events.filter(function (e) { return e.type === 'goal'; }).length;

    this.renderer.playMove(res, function () {
      self.renderer.onEvent = null;
      self.state = res.state;
      self.syncHud();
      if (chain >= 2) self.showToast(t('chain') + ' ×' + chain);
      self.settle(res);
    });
    this.syncHud();
    this.wake();
  };

  /** Called once the animation has finished and the board is at rest. */
  Game.prototype.settle = function (res) {
    var self = this;
    if (res.clear) {
      this.queued = null;
      this.setPhase('clear');
      this.renderer.celebrate();
      this.audio.clear();
      setTimeout(function () { self.showClear(); }, 420);
      return;
    }

    this.setPhase('play');
    this.checkDeadEnd();

    if (this.queued) {
      var d = this.queued;
      this.queued = null;
      this.applyMove(d);
    }
  };

  /**
   * If the board can no longer be solved, say so quietly.
   *
   * Nothing in this game can destroy a block, so a board is almost never
   * genuinely stuck — but "almost never" is not "never", and a player who has
   * jammed one should be told rather than left to discover it by exhaustion.
   * Undo is one tap away and costs nothing.
   */
  Game.prototype.checkDeadEnd = function () {
    var r = E.solve(this.stage, this.state, 40000);
    this.deadEnd = !r.solvable && !r.truncated;
    this.dom.btnUndo.classList.toggle('urgent', this.deadEnd);
    this.dom.app.classList.toggle('dead-end', this.deadEnd);
    var badge = this.dom.btnUndo.querySelector('.badge');
    if (badge) badge.textContent = this.deadEnd ? t('deadEnd') : '';
  };

  // -- undo / restart ---------------------------------------------------------

  Game.prototype.undo = function () {
    if (this.phase === 'busy' || this.phase === 'clear') return;
    if (!this.history.length) return;
    this.audio.resume();
    this.state = this.history.pop();
    this.queued = null;
    this.setPhase('play');
    this.renderer.showState(this.state);
    this.renderer.gravity = null;
    this.hideOverlay();
    this.audio.undo();
    this.syncHud();
    this.checkDeadEnd();
    this.wake();
  };

  Game.prototype.restart = function () {
    if (this.phase === 'busy') return;
    this.audio.resume();
    this.state = E.initialState(this.stage);
    this.history = [];
    this.queued = null;
    this.deadEnd = false;
    this.phase = 'play';
    this.renderer.setStage(this.stage, this.state);
    this.hideOverlay();
    this.audio.ui(false);
    this.syncHud();
    this.checkDeadEnd();
    this.wake();
  };

  Game.prototype.next = function () {
    if (this.index + 1 < STAGES.length) {
      this.audio.ui(true);
      this.loadStage(this.index + 1);
    } else {
      this.showAllClear();
    }
  };

  // -- HUD & overlays ---------------------------------------------------------

  /**
   * The only way the phase is allowed to change.
   *
   * Button enablement is derived from the phase, so assigning `phase` directly
   * and syncing the HUD separately means any missed pairing silently leaves the
   * dock in a stale state — which is exactly how UNDO ended up permanently
   * disabled after a move. One door in, no way to forget.
   */
  Game.prototype.setPhase = function (phase) {
    this.phase = phase;
    this.syncHud();
  };

  Game.prototype.syncHud = function () {
    this.dom.moves.textContent = String(this.state.moves);
    var best = this.save.best(STAGES[this.index].id);
    this.dom.moves.classList.toggle('over', this.state.moves > STAGES[this.index].par);
    this.dom.btnUndo.disabled = !this.history.length || this.phase === 'busy' || this.phase === 'clear';
    var bestEl = document.getElementById('best');
    if (bestEl) {
      bestEl.textContent = best == null ? '—' : String(best);
    }
  };

  Game.prototype.showToast = function (text) {
    var el = this.dom.toast;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    var self = this;
    this._toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1100);
  };

  function self_isCleared(save, id) { return save.isCleared(id); }

  Game.prototype.showClear = function () {
    var self_save = this.save;
    var def = STAGES[this.index];
    var moves = this.state.moves;
    var prevBest = this.save.best(def.id);
    var improved = this.save.recordClear(def.id, moves, STAGES.length);
    var perfect = moves === def.par;
    var last = this.index === STAGES.length - 1;
    this.syncHud();

    var chap = chapterOf(def.id);
    var chapDone = def.id === chap.to && STAGES.filter(function (d) {
      return d.id >= chap.from && d.id <= chap.to && self_isCleared(self_save, d.id);
    }).length === (chap.to - chap.from + 1);

    var lines = [];
    lines.push('<div class="ov-kicker">' +
      (chapDone ? t('chapEnd') + ' · ' + chap.name : 'STAGE ' + pad2(def.id) + ' · ' + def.name) +
      '</div>');
    lines.push('<h2 class="ov-title' + (perfect ? ' perfect' : '') + '">' + (perfect ? t('perfect') : t('clear')) + '</h2>');
    lines.push('<div class="ov-stats">' +
      stat(t('moves'), moves) +
      stat(t('par'), def.par) +
      stat(t('best'), this.save.best(def.id)) +
      '</div>');
    if (improved && prevBest != null) lines.push('<div class="ov-flag">' + t('newBest') + '</div>');
    if (!perfect) {
      lines.push('<div class="ov-note">' + (JA
        ? '最短は ' + def.par + ' 手。'
        : 'It can be done in ' + def.par + '.') + '</div>');
    }
    lines.push('<div class="ov-actions">' +
      '<button class="btn primary" data-act="next">' + (last ? t('allClear') : t('next')) + '</button>' +
      '<button class="btn ghost" data-act="retry">' + t('retry') + '</button>' +
      '</div>');

    this.openOverlay(lines.join(''), 'clear');
  };

  Game.prototype.showAllClear = function () {
    var total = 0, par = 0, done = 0;
    var self = this;
    STAGES.forEach(function (s) {
      var b = self.save.best(s.id);
      if (b != null) { total += b; done++; }
      par += s.par;
    });
    var lines = [];
    lines.push('<h2 class="ov-title perfect">' + t('allClear') + '</h2>');
    lines.push('<div class="ov-note">' + t('allBody') + '</div>');
    lines.push('<div class="ov-stats">' + stat(t('moves'), total) + stat(t('par'), par) + '</div>');
    lines.push('<div class="ov-actions">' +
      '<button class="btn primary" data-act="menu">' + t('stages') + '</button></div>');
    this.openOverlay(lines.join(''), 'clear');
  };

  Game.prototype.openOverlay = function (html, kind) {
    var ov = this.dom.overlay;
    ov.innerHTML = '<div class="ov-card">' + html + '</div>';
    ov.className = 'overlay show ' + kind;
    var self = this;
    ov.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        self.audio.ui(act === 'next');
        if (act === 'next') self.next();
        else if (act === 'retry' || act === 'restart') self.restart();
        else if (act === 'undo') self.undo();
        else if (act === 'menu') self.openMenu();
      });
    });
  };

  Game.prototype.hideOverlay = function () {
    this.dom.overlay.className = 'overlay';
    this.dom.overlay.innerHTML = '';
  };

  function stat(label, value) {
    return '<div class="ov-stat"><span class="k">' + label + '</span><span class="v">' + value + '</span></div>';
  }

  // -- menu -------------------------------------------------------------------

  Game.prototype.renderStageGrid = function () {
    var grid = this.dom.grid;
    var self = this;
    grid.innerHTML = '';

    var total = STAGES.length;
    var cleared = this.save.clearedCount();
    var summary = document.getElementById('menu-progress');
    if (summary) {
      summary.innerHTML = '<span class="pv">' + cleared + '</span><span class="pt">/ ' + total + '</span>' +
        '<span class="pl">' + t('progress') + '</span>';
    }

    CHAPTERS.forEach(function (chap) {
      var stages = STAGES.filter(function (d) { return d.id >= chap.from && d.id <= chap.to; });
      if (!stages.length) return;

      var done = stages.filter(function (d) { return self.save.isCleared(d.id); }).length;
      var open = stages.some(function (d) { return self.save.isUnlocked(d.id); });

      var head = document.createElement('div');
      head.className = 'chap-head' + (done === stages.length ? ' done' : '') + (open ? '' : ' locked');
      head.innerHTML =
        '<span class="cn">' + (chap.number < 10 ? '0' + chap.number : chap.number) + '</span>' +
        '<span class="cname">' + chap.name + '</span>' +
        '<span class="cprog">' + done + '/' + stages.length + '</span>';
      grid.appendChild(head);

      var row = document.createElement('div');
      row.className = 'chap-row';
      stages.forEach(function (def) {
        var unlocked = self.save.isUnlocked(def.id);
        var best = self.save.best(def.id);
        var b = document.createElement('button');
        b.className = 'cell' + (unlocked ? '' : ' locked') + (best != null ? ' done' : '') +
          (best != null && best === def.par ? ' perfect' : '') +
          (STAGES[self.index] && STAGES[self.index].id === def.id ? ' current' : '');
        b.innerHTML = '<span class="n">' + pad2(def.id) + '</span>' +
          '<span class="nm">' + def.name + '</span>' +
          '<span class="bs">' + (best == null ? (unlocked ? '—' : '🔒') : best + '/' + def.par) + '</span>';
        b.disabled = !unlocked;
        b.addEventListener('click', function () {
          if (!unlocked) return;
          self.audio.ui(true);
          self.closeMenu();
          self.loadStage(STAGES.indexOf(def));
        });
        row.appendChild(b);
      });
      grid.appendChild(row);
    });

    // Scroll the chapter you are actually playing into view — but only when the
    // panel is really visible, or this is a no-op that can disturb the page.
    var cur = this.menuOpen ? grid.querySelector('.cell.current') : null;
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: 'center' }); } catch (e) { cur.scrollIntoView(); }
    }
  };

  Game.prototype.openMenu = function () {
    // Show first, then fill: the grid scrolls the current stage into view, and
    // that only works once the panel is actually on screen.
    this.menuOpen = true;
    this.dom.menu.classList.add('show');
    this.renderStageGrid();
    this.renderer.aimDir = null;
    this.audio.ui(true);
  };

  Game.prototype.closeMenu = function () {
    this.menuOpen = false;
    this.dom.menu.classList.remove('show');
    this.wake();
  };

  // -- settings ---------------------------------------------------------------

  Game.prototype.applySoundButton = function () {
    var on = this.save.data.sound;
    this.dom.btnSound.classList.toggle('off', !on);
    this.dom.btnSound.setAttribute('aria-pressed', String(on));
    this.dom.btnSound.title = on ? 'Sound on' : 'Sound off';
  };

  Game.prototype.toggleSound = function () {
    var on = !this.save.data.sound;
    this.save.set('sound', on);
    this.audio.setMuted(!on);
    this.applySoundButton();
    if (on) { this.audio.resume(); this.audio.ui(true); }
  };

  Game.prototype.applyTiltButton = function (on) {
    this.dom.btnTilt.classList.toggle('active', !!on);
    this.dom.btnTilt.setAttribute('aria-pressed', String(!!on));
    if (!this.input.tilt.supported) this.dom.btnTilt.classList.add('unavailable');
  };

  Game.prototype.toggleTilt = function () {
    var self = this;
    if (this.input.tilt.enabled) {
      this.input.disableTilt();
      this.save.set('tilt', false);
      this.applyTiltButton(false);
      this.showToast(t('tiltOff'));
      return;
    }
    this.input.enableTilt(function (ok, why) {
      if (ok) {
        self.save.set('tilt', true);
        self.applyTiltButton(true);
        self.showToast(t('tiltOn'));
      } else {
        self.applyTiltButton(false);
        self.showToast(why === 'denied' ? t('tiltDenied') : t('tiltNo'));
      }
    });
  };

  // -- wiring -----------------------------------------------------------------

  Game.prototype.bindUI = function () {
    var self = this;
    var tap = function (el, fn) {
      if (!el) return;
      el.addEventListener('click', function (e) { e.preventDefault(); self.audio.resume(); fn(); });
    };
    tap(this.dom.btnUndo, function () { self.undo(); });
    tap(this.dom.btnRestart, function () { self.restart(); });
    tap(this.dom.btnSound, function () { self.toggleSound(); });
    tap(this.dom.btnTilt, function () { self.toggleTilt(); });
    tap(this.dom.btnMenu, function () { self.openMenu(); });
    tap(this.dom.btnClose, function () { self.closeMenu(); });
    tap(this.dom.btnReset, function () {
      if (window.confirm(t('resetAsk'))) {
        self.save.reset();
        self.renderStageGrid();
        self.closeMenu();
        self.loadStage(0);
      }
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); self.undo(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); self.restart(); }
      else if (e.key === 'Escape') { self.menuOpen ? self.closeMenu() : self.openMenu(); }
      else if (e.key === 'Enter' && self.phase === 'clear') { self.next(); }
    });
  };

  // -- frame loop -------------------------------------------------------------

  Game.prototype.onResize = function () {
    var self = this;
    clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(function () {
      self.renderer.layout();
      self.wake();
    }, 60);
  };

  Game.prototype.onVisibility = function () {
    if (document.hidden) {
      this.running = false;
    } else {
      this.last = performance.now();
      this.wake();
    }
  };

  Game.prototype.wake = function () {
    // Always lift the idle throttle: this is called on every interaction, and a
    // move whose first frame is 50ms late feels like a dropped input.
    this.busyFrames = true;
    if (!this.running && !document.hidden) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }
  };

  var IDLE_FRAME_MS = 50;   // ~20fps is plenty for a slow breathing glow

  Game.prototype.loop = function (now) {
    if (document.hidden) { this.running = false; return; }
    // The menu covers the board completely; there is nothing to spend frames on.
    if (this.menuOpen) { this.running = false; return; }

    var dt = Math.min(64, now - this.last);

    // While the board is at rest, drop to a low frame rate. Thinking time is
    // the longest part of this game and it should not cost the player battery.
    if (!this.busyFrames && dt < IDLE_FRAME_MS) {
      requestAnimationFrame(this.loop);
      return;
    }

    this.last = now;
    this.busyFrames = this.renderer.frame(dt, now);
    requestAnimationFrame(this.loop);
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  root.TiltGame = { Game: Game, TXT: TXT, JA: JA };

  // Boot once the DOM is parseable. The engine has no async dependencies, so
  // this is the only load-order concern in the whole game.
  function boot() {
    try {
      root.game = new Game();
    } catch (err) {
      var el = document.getElementById('app');
      if (el) {
        el.innerHTML = '<div class="fatal"><h1>TILT</h1><p>' +
          (JA ? 'ゲームを起動できませんでした。' : 'The game failed to start.') +
          '</p><pre>' + String(err && err.message || err) + '</pre></div>';
      }
      throw err;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : globalThis);
