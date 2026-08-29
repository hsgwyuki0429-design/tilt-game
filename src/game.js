'use strict';
/*
 * TILT — game shell.
 *
 * Owns exactly one mutable thing: `this.state`, the engine state for the stage
 * in play. Everything else (history, HUD, overlays) is derived from it. Undo is
 * therefore a stack of whole states rather than a list of reversed operations,
 * which is the only version of undo that cannot drift out of sync.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE INTERFACE, AND WHY IT IS THIS SHAPE
 * ---------------------------------------------------------------------------
 *
 * There are three surfaces in this game and no more:
 *
 *   THE BOARD      permanent. A status line above it, an objective line below
 *                  it, two actions under that. Nothing else is ever on screen
 *                  while a player is thinking.
 *
 *   THE STAGES     a sheet. It is also the pause screen, because a puzzle with
 *   SHEET          no clock has nothing to pause — "stop and look at where I
 *                  am" and "open the menu" are one intention, so they are one
 *                  screen.
 *
 *   A CARD         a clear or a run ending. Anchored to the bottom so the board
 *                  you just played stays visible above it, and so the buttons
 *                  land where a thumb already is.
 *
 * Settings and the rules live one level down from the stages sheet. They are
 * things a player touches once, and a control you touch once a month has no
 * business on the screen you look at for an hour — which is why preferences
 * live in Settings and the dock keeps only the two actions the board itself
 * cannot express.
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

  // Sentence case everywhere except a stage nameplate and a stat label. In this
  // interface uppercase is a signal, not a default.
  var TXT = {
    moves:      { ja: '手数', en: 'Moves' },
    par:        { ja: '最短', en: 'Par' },
    parShort:   { ja: '最短', en: 'PAR' },
    best:       { ja: '自己ベスト', en: 'Best' },
    bestShort:  { ja: 'ベスト', en: 'Best' },
    clear:      { ja: 'クリア', en: 'Solved' },
    perfect:    { ja: '最短クリア', en: 'Perfect' },
    next:       { ja: '次のステージ', en: 'Next stage' },
    retry:      { ja: 'もう一度', en: 'Try again' },
    undo:       { ja: '一手もどす', en: 'Undo' },
    undoShort:  { ja: 'もどす', en: 'Undo' },
    restart:    { ja: '最初から', en: 'Restart' },
    stages:     { ja: 'ステージ', en: 'Stages' },
    settings:   { ja: '設定', en: 'Settings' },
    home:       { ja: 'ホーム', en: 'Home' },
    homeEyebrow:{ ja: '氷上グラビティパズル', en: 'An ice gravity puzzle' },
    homeLead:   { ja: '指をはらって、ペンギンを同じ色のオーロラへ。',
                  en: 'Swipe and guide each penguin to its matching aurora.' },
    homeStart:  { ja: 'ゲームをはじめる', en: 'Start game' },
    homeContinue:{ ja: 'つづきから', en: 'Continue' },
    homeSelect: { ja: 'ステージを選ぶ', en: 'Choose a stage' },
    close:      { ja: '閉じる', en: 'Close' },
    back:       { ja: 'もどる', en: 'Back' },
    howto:      { ja: 'あそびかた', en: 'How to play' },
    showRules:  { ja: 'ルールを見る', en: 'Show the rules' },
    rewound:    { ja: '手づまり。1手もどしました', en: 'Dead end — that move was taken back' },
    restarted:  { ja: '最初にもどしました', en: 'Stage restarted' },
    gameOver:   { ja: 'ここで終わり', en: 'Run ended' },
    overBody:   { ja: 'ヒビ氷の上で止まると氷が割れます。1手もどせば続けられます。',
                  en: 'The ice cracked under a stopped penguin. One undo puts it back.' },
    allClear:   { ja: '全ステージ制覇', en: 'Every stage solved' },
    allBody:    { ja: '%nステージすべてクリアしました。', en: 'All %n stages, done.' },
    progress:   { ja: 'クリア済み', en: 'solved' },
    chapEnd:    { ja: 'チャプタークリア', en: 'Chapter complete' },
    newBest:    { ja: '自己ベスト更新', en: 'New best' },
    locked:     { ja: 'まだ挑戦できません', en: 'Locked' },
    chain:      { ja: '連鎖', en: 'Chain' },
    swipeCue:   { ja: '指をはらって重力を向けます', en: 'Swipe to aim gravity' },
    parNote:    { ja: '最短は %n 手です。', en: 'It can be done in %n.' },

    // What "done" means. Every board gets a line, including the plain one: a
    // caption that appears on some stages and not others is a caption the player
    // has to keep checking for, and it sits in space the board never wanted.
    winAllin:   { ja: 'それぞれ同じ色のオーロラへ運ぶ', en: 'Bring each penguin to its matching aurora' },

    // Settings
    sound:      { ja: 'サウンド', en: 'Sound' },
    haptics:    { ja: '触覚フィードバック', en: 'Haptics' },
    reduceMo:   { ja: 'アニメーションを減らす', en: 'Reduce motion' },
    reduceNote: { ja: '画面のゆれ、粒子、スライドの演出を止めます。',
                  en: 'Turns off shake, particles and sliding transitions.' },
    resetTitle: { ja: '進行状況を消去しますか？', en: 'Erase all progress?' },
    resetBody:  { ja: 'クリア記録と自己ベストがすべて消え、元に戻せません。',
                  en: 'Every solved stage and best score will be lost. This cannot be undone.' },
    resetDo:    { ja: '消去する', en: 'Erase progress' },
    resetRow:   { ja: '進行状況を消去', en: 'Erase progress' },
    cancel:     { ja: 'キャンセル', en: 'Cancel' },
    stagesFine: { ja: 'TILT · 全%nステージ', en: 'TILT · %n stages' },

    // How to play — the complete rule set, one line at a time.
    r1h: { ja: '重力を向ける', en: 'You aim gravity' },
    r1p: { ja: 'ペンギンは直接動かせません。指をはらった向きへ盤面ごと重力が向き、すべてのペンギンが同時に滑ります。',
          en: 'You never move a penguin directly. Swipe, and the whole world falls that way — every penguin at once.' },
    r2h: { ja: '色を合わせる', en: 'Match each colour' },
    r2p: { ja: '各ペンギンには同じ色・形のオーロラが1つあります。その渦の上で止まると回収されます。',
          en: 'Every penguin has one matching aurora. It is collected when it stops on that vortex.' },
    r3h: { ja: 'くっついてもクリアではない', en: 'Touching is not a win' },
    r3p: { ja: 'ペンギン同士が触れても消えません。互いを止める、動かせる壁として使えます。',
          en: 'Penguins do not clear when they touch. They can stop each other like movable walls.' },
    r4h: { ja: '灰色の流氷', en: 'The grey drifter' },
    r4p: { ja: '灰色の流氷も同じ重力で滑りますが、どのオーロラも受け取りません。動かせる壁として使えますが、渦の上で止まるとその渦をふさぎます。',
          en: 'A grey drifter slides with the same gravity, and no aurora will take it. Use it as a movable wall — but if it stops on a vortex, it plugs it.' },
    r5:  { ja: '手数に制限はありません。いつでも何手でも戻せます。まず試してみるのが正しい遊び方です。',
          en: 'There is no move limit and undo is free. Trying something to see what it does is how this game is meant to be played.' }
  };

  var OBJECTIVE = { allin: 'winAllin' };

  function t(key) { var v = TXT[key]; return v ? (JA ? v.ja : v.en) : key; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  /**
   * How much bigger the player has asked their text to be.
   *
   * Safari resolves `-apple-system-body` to the device's current Dynamic Type
   * size, so measuring it is the one way a web page can honour Larger Text at
   * all. Clamped at 1.3 because past that the board — which is the thing the
   * player actually came for — starts losing rows to the chrome, and a game
   * whose board does not fit is not an accessible game.
   */
  function measureTypeScale() {
    try {
      var el = document.createElement('span');
      el.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font:-apple-system-body';
      el.textContent = 'M';
      document.body.appendChild(el);
      var px = parseFloat(window.getComputedStyle(el).fontSize);
      document.body.removeChild(el);
      if (!isFinite(px) || px <= 0) return 1;
      return Math.max(1, Math.min(1.3, px / 17));
    } catch (e) { return 1; }
  }

  function Game() {
    this.save = new root.TiltSave.Save();
    this.audio = new root.TiltAudio.Audio();
    this.audio.setMuted(!this.save.data.sound);
    this.haptics = new root.TiltHaptics.Haptics();
    this.haptics.mount();
    this.haptics.setEnabled(this.save.data.haptics !== false);

    this.canvas = document.getElementById('board');
    this.renderer = new root.TiltRender.Renderer(this.canvas);

    this.stage = null;
    this.state = null;
    this.history = [];
    this.phase = 'play';        // play | busy | clear | over
    this.queued = null;
    this.animStart = 0;
    this.animLen = 1;
    this.restorePoint = null;   // what an undoable restart would put back
    this.sheets = [];           // presentation stack, topmost last
    this.homeOpen = true;

    this.dom = {
      app: document.getElementById('app'),
      home: document.getElementById('home'),
      homeStage: document.getElementById('home-stage'),
      homeRecord: document.getElementById('home-record'),
      btnHomePlay: document.getElementById('btn-home-play'),
      btnHomeStages: document.getElementById('btn-home-stages'),
      stageLabel: document.getElementById('stage-label'),
      stageName: document.getElementById('stage-name'),
      objective: document.getElementById('objective'),
      coach: document.getElementById('coach'),
      coachHint: document.getElementById('coach-hint'),
      moves: document.getElementById('moves'),
      par: document.getElementById('par'),
      overlay: document.getElementById('overlay'),
      scrim: document.getElementById('scrim'),
      menu: document.getElementById('menu'),
      settings: document.getElementById('settings'),
      settingsList: document.getElementById('settings-list'),
      howto: document.getElementById('howto'),
      howtoBody: document.getElementById('howto-body'),
      grid: document.getElementById('stage-grid'),
      toast: document.getElementById('toast'),
      btnUndo: document.getElementById('btn-undo'),
      btnRestart: document.getElementById('btn-restart'),
      btnMenu: document.getElementById('btn-menu'),
      btnHome: document.getElementById('btn-home'),
      btnClose: document.getElementById('btn-close'),
      btnSettings: document.getElementById('btn-settings'),
      btnSettingsBack: document.getElementById('btn-settings-back'),
      btnSettingsClose: document.getElementById('btn-settings-close'),
      btnHowtoClose: document.getElementById('btn-howto-close'),
      fine: document.getElementById('app-fine')
    };

    // The frame loop is armed FIRST, before anything below can reach wake().
    // applyMotion() does, on the very next line, and an unbound this.loop handed
    // to requestAnimationFrame is called with no receiver at all under strict
    // mode — a boot-time crash that leaves a perfectly playable-looking board
    // with a dead render loop behind it.
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    this.running = false;
    this.busyFrames = false;

    this.motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    document.documentElement.style.setProperty('--tsx', String(measureTypeScale()));
    this.applyStaticText();
    this.applyMotion();

    this.bindUI();
    this.input = new root.TiltInput.Input(document.getElementById('board-area'), {
      commit: this.commit.bind(this),
      aim: this.aim.bind(this),
      tap: this.onTap.bind(this)
    });
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('orientationchange', this.onResize.bind(this));
    document.addEventListener('visibilitychange', this.onVisibility.bind(this));
    if (this.motionQuery && this.motionQuery.addEventListener) {
      this.motionQuery.addEventListener('change', this.applyMotion.bind(this));
    }

    this.loadStage(this.firstUnsolved());
    this.showHome();
  }

  Game.prototype.firstUnsolved = function () {
    for (var i = 0; i < STAGES.length; i++) {
      if (!this.save.isCleared(STAGES[i].id)) return i;
    }
    return 0;
  };

  // -- localisation -----------------------------------------------------------

  Game.prototype.applyStaticText = function () {
    var nodes = document.querySelectorAll('[data-t]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-t'));
    var aria = document.querySelectorAll('[data-t-aria]');
    for (var j = 0; j < aria.length; j++) aria[j].setAttribute('aria-label', t(aria[j].getAttribute('data-t-aria')));
    if (this.dom.fine) this.dom.fine.textContent = t('stagesFine').replace('%n', STAGES.length);
    document.documentElement.lang = JA ? 'ja' : 'en';
  };

  // -- home -------------------------------------------------------------------

  Game.prototype.renderHome = function () {
    if (!this.dom.home) return;
    var def = STAGES[this.index] || STAGES[0];
    this.dom.homeStage.textContent = 'STAGE ' + def.id + ' · ' + def.name;
    this.dom.homeRecord.textContent = this.save.clearedCount() + ' / ' + STAGES.length;
    this.dom.btnHomePlay.textContent = this.save.data.everMoved || this.save.clearedCount() ?
      t('homeContinue') : t('homeStart');
  };

  Game.prototype.showHome = function () {
    this.closeAllSheets();
    this.homeOpen = true;
    this.renderHome();
    this.renderer.aimDir = null;
    this.dom.home.classList.remove('hidden');
    this.dom.home.setAttribute('aria-hidden', 'false');
    this.dom.app.setAttribute('aria-hidden', 'true');
    document.body.classList.add('at-home');
    this.running = false;
  };

  Game.prototype.leaveHome = function () {
    if (!this.homeOpen) return;
    this.homeOpen = false;
    this.dom.home.classList.add('hidden');
    this.dom.home.setAttribute('aria-hidden', 'true');
    this.dom.app.removeAttribute('aria-hidden');
    document.body.classList.remove('at-home');
    this.renderer.layout();
    this.wake();
  };

  Game.prototype.openHomeStages = function () {
    this.leaveHome();
    this.openMenu();
  };

  // -- motion -----------------------------------------------------------------

  /**
   * Reduced motion is a system preference the player may override here.
   *
   * `motion-full` on the root is how an explicit "no, I want the animation" beats
   * the media query in CSS; the canvas is told separately, because a media query
   * cannot reach into a 2D context.
   */
  Game.prototype.motionReduced = function () {
    if (typeof this.save.data.reduceMotion === 'boolean') return this.save.data.reduceMotion;
    return !!(this.motionQuery && this.motionQuery.matches);
  };

  Game.prototype.applyMotion = function () {
    var reduced = this.motionReduced();
    var root_ = document.documentElement;
    root_.classList.toggle('rm', reduced);
    root_.classList.toggle('motion-full', !reduced);
    this.renderer.reduceMotion = reduced;
    this.wake();
  };

  // -- stage lifecycle --------------------------------------------------------

  Game.prototype.loadStage = function (index) {
    this.index = Math.max(0, Math.min(STAGES.length - 1, index));
    var def = STAGES[this.index];
    this.stage = E.compile(def);
    this.state = E.initialState(this.stage);
    this.history = [];
    this.queued = null;
    this.restorePoint = null;
    this.phase = 'play';

    this.renderer.setStage(this.stage, this.state);

    var chap = chapterOf(def.id);
    var chapName = JA ? (chap.ja || chap.name) : chap.name;
    this.dom.stageLabel.textContent = 'STAGE ' + def.id + (chapName ? ' · ' + chapName : '');
    this.dom.stageName.textContent = def.name;
    this.dom.par.textContent = String(def.par);

    this.showCoach(def);
    this.hideOverlay();
    this.syncHud();

    // The only cue the game shows unprompted, and only until it has been
    // answered once in the player's life: there is no way to guess "swipe" from
    // a still picture, and nothing else on this screen is going to say it.
    // The wide layout already explains the interaction beside the board. Keep
    // the animated finger cue for compact touch layouts, where that guide is
    // intentionally folded away.
    this.renderer.gesture = (this.index === 0 && !this.save.data.everMoved &&
      (!window.matchMedia || window.matchMedia('(max-width: 620px)').matches));
    this.renderer.gestureDir = this.demoDirection();
    this.renderer.gestureT = 0;

    this.wake();
  };

  /**
   * A direction the swipe cue can honestly demonstrate.
   *
   * The cue used to sweep right unconditionally, and on stage 1 a rightward move
   * moves nothing at all — so the one instruction the game ever gives was an
   * instruction to do something that does not work. Following a demonstration
   * and being answered with "nothing happened" is a worse first thirty seconds
   * than no demonstration at all.
   *
   * Horizontal is preferred because a sideways sweep is what a swipe looks like,
   * but correctness comes first: whatever is shown has to actually move, and it
   * has to leave the stage winnable. Demonstrating a move the game immediately
   * takes back as a dead end is the same failure in a politer costume.
   */
  Game.prototype.demoDirection = function () {
    var order = ['L', 'R', 'D', 'U'];
    var moved = null, i, r;
    for (i = 0; i < order.length; i++) {
      r = E.simulate(this.stage, this.state, order[i], { frames: false });
      if (!r.moved) continue;
      if (moved === null) moved = order[i];
      if (!r.broken && E.solve(this.stage, r.state, 20000).solvable) return order[i];
    }
    return moved || 'L';
  };

  /**
   * The objective line.
   *
   * It is permanent, it sits in space the board was never going to use, and it
   * is a button — so a rule can be looked up rather than remembered. The teaching
   * line for a stage the player has not yet solved takes precedence over the
   * plain objective, and gives way to it once the stage is behind them.
   */
  Game.prototype.showCoach = function (def) {
    var obj = OBJECTIVE[this.stage.win];
    this.dom.objective.textContent = obj ? t(obj) : '';

    var teach = def.hint && !this.save.isCleared(def.id);
    if (def.id === 1 && !this.save.data.everMoved) {
      this.dom.coachHint.textContent = t('swipeCue');
      this.dom.coach.setAttribute('data-show', 'hint');
    } else if (teach) {
      this.dom.coachHint.textContent = JA ? def.hint.ja : def.hint.en;
      this.dom.coach.setAttribute('data-show', 'hint');
    } else {
      this.dom.coachHint.textContent = '';
      this.dom.coach.setAttribute('data-show', 'obj');
    }
  };

  // -- input ------------------------------------------------------------------

  Game.prototype.aim = function (dir) {
    if (this.homeOpen || this.phase === 'clear' || this.sheets.length) { this.renderer.aimDir = null; return; }
    if (dir && dir !== this.renderer.aimDir) this.haptics.select();
    this.renderer.aimDir = dir;
    this.wake();
  };

  /** A tap is not a move, but it is a question, and it deserves an answer. */
  Game.prototype.onTap = function () {
    if (this.homeOpen || this.phase !== 'play' || this.sheets.length) return;
    this.audio.resume();
    if (!this.save.data.everMoved) {
      // Someone tapping the board has not worked out the gesture yet. Put the
      // cue back rather than leaving them tapping at a board that never answers.
      this.renderer.gesture = true;
      this.renderer.gestureT = 0;
      this.dom.coachHint.textContent = t('swipeCue');
      this.dom.coach.setAttribute('data-show', 'hint');
      this.wake();
    }
  };

  Game.prototype.commit = function (dir) {
    if (this.homeOpen) return;
    this.audio.resume();
    if (this.sheets.length) return;

    if (this.phase === 'clear') {
      // A swipe on the clear screen is almost always "go on then".
      this.next();
      return;
    }

    // A run ending is a decision — take the move back, or start again — and a
    // stray swipe is not an answer to it.
    if (this.phase === 'over') return;

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
    this.renderer.gravity = dir;
    this.restorePoint = null;

    if (!res.moved) {
      // Nothing shifted. Say so — in the board's own language, by leaning it
      // that way and letting it spring back — and do not charge a move for it.
      this.audio.blocked();
      this.haptics.blocked();
      this.renderer.rebuff(dir);
      this.wake();
      return;
    }

    if (!this.save.data.everMoved) {
      this.save.set('everMoved', true);
      this.renderer.gesture = false;
    }

    this.history.push(E.cloneState(this.state));
    this.audio.tilt();
    this.haptics.tilt();

    this.setPhase('busy');
    this.animStart = performance.now();
    this.animLen = Math.max(1, (res.frames.length - 1) * root.TiltRender.TICK + root.TiltRender.TAIL);

    var self = this;
    var goalIndex = 0;
    // Sounds and taps ride the renderer's event clock, so audio, haptics and
    // picture cannot drift apart. A callback rather than a patched method: a
    // stage change mid-slide clears it along with everything else, instead of
    // leaving a stale override behind on the renderer.
    this.renderer.onEvent = function (ev) {
      if (ev.type === 'goal') { self.audio.goal(goalIndex++); self.haptics.collect(); }
      else if (ev.type === 'stop') { self.audio.impact(1); self.haptics.land(); }
      else if (ev.type === 'lost') { self.audio.lost(); self.haptics.over(); }
    };

    var chain = res.events.filter(function (e) { return e.type === 'goal'; }).length;
    var lost = res.events.filter(function (e) { return e.type === 'lost'; }).length;

    this.renderer.playMove(res, function () {
      self.renderer.onEvent = null;
      self.state = res.state;
      self.syncHud();
      // A destroyed block ends the run, and the card that says so is the
      // announcement — a toast underneath it would only be competing with it.
      if (!lost && chain >= 2 && !res.clear) self.showToast(t('chain') + ' ×' + chain);
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
      this.haptics.clear();
      // Long enough for the last block to land and the ring to open; short
      // enough that nobody is waiting for the card.
      //
      // The phase is re-checked when the timer fires, because half a second is
      // plenty of time for the player to have pressed undo or picked another
      // stage — and a card that arrives after the thing it was announcing has
      // been taken back is a card the player cannot explain.
      setTimeout(function () { if (self.phase === 'clear') self.showClear(); }, 460);
      return;
    }

    // A block left standing on a hazard is not a setback, it is the end of the
    // run. The player watched it happen and knows exactly which move did it,
    // which is what makes stopping here fair rather than punitive.
    if (res.broken) {
      this.queued = null;
      this.setPhase('over');
      // A beat before the card, so the shatter is seen in the cell that caused
      // it rather than behind a panel. Guarded for the same reason as above.
      setTimeout(function () { if (self.phase === 'over') self.showGameOver(); }, 340);
      return;
    }

    this.setPhase('play');
    if (this.rewindIfStuck()) return;

    if (this.queued) {
      var d = this.queued;
      this.queued = null;
      this.applyMove(d);
    }
  };

  /**
   * A jammed board takes itself back.
   *
   * The old behaviour was a DEAD END badge on the undo button: correct
   * information, and the wrong shape for it. It asks the player to notice a
   * label, understand what it means, and then perform the only move the game was
   * ever going to accept — three steps to arrive somewhere there was no choice
   * about. Worse, a player who does not read it keeps swiping a board that
   * cannot be won, and the game says nothing while they do.
   *
   * So the game does it: the move that jammed the board is undone, and a toast
   * says that is what happened. The position it lands on is guaranteed winnable,
   * because every position is checked the moment it is reached — so one step
   * back is always enough, and there is no risk of unwinding a run.
   *
   * A truncated search means "we could not tell in time", and the board is given
   * the benefit of the doubt. Refusing a legal position because the solver ran
   * out of nodes would be far worse than missing a jam.
   */
  Game.prototype.rewindIfStuck = function () {
    if (!this.history.length) return false;
    var r = E.solve(this.stage, this.state, 40000);
    if (r.solvable || r.truncated) return false;

    this.state = this.history.pop();
    this.queued = null;
    this.renderer.showState(this.state);
    this.renderer.gravity = null;
    this.audio.undo();
    this.haptics.blocked();
    this.setPhase('play');
    this.showToast(t('rewound'), { icon: 'undo' });
    this.wake();
    return true;
  };

  // -- undo / restart ---------------------------------------------------------

  /**
   * Abandon a slide that is still playing.
   *
   * The logical state is not committed until the animation finishes, so throwing
   * the animation away leaves the board exactly where the move started. That is
   * what makes it safe to interrupt one.
   */
  Game.prototype.cancelSlide = function () {
    if (this.phase !== 'busy') return false;
    this.renderer.anim = null;
    this.renderer.onEvent = null;
    this.queued = null;
    this.setPhase('play');
    return true;
  };

  Game.prototype.undo = function () {
    if (this.phase === 'clear') return;

    // Undo pressed DURING a slide means "take that move back" — and it can be
    // honoured exactly, because the move has not been committed yet. Cancelling
    // the animation and dropping the history entry the move pushed puts the
    // board precisely where the player started. Refusing the press instead, as
    // this used to, made the button feel broken during the very half-second a
    // player is most likely to realise they were wrong.
    if (this.phase === 'busy') {
      this.cancelSlide();
      if (this.history.length) this.history.pop();
      this.renderer.showState(this.state);
      this.renderer.gravity = null;
      this.audio.undo();
      this.haptics.tilt();
      this.syncHud();
      this.wake();
      return;
    }

    if (!this.history.length) return;
    this.audio.resume();
    this.state = this.history.pop();
    this.queued = null;
    this.restorePoint = null;
    this.setPhase('play');
    this.renderer.showState(this.state);
    this.renderer.gravity = null;
    this.hideOverlay();
    this.audio.undo();
    this.haptics.tilt();
    this.syncHud();
    this.wake();
  };

  /**
   * Restart, without a dialog in front of it.
   *
   * Restart used to sit beside Undo as its identical twin, which is how a player
   * throws away forty moves on stage 40 by hitting the wrong half of the dock.
   * The usual fix is a confirmation sheet, and the usual fix is wrong: it taxes
   * the ninety-nine restarts that were meant in order to catch the one that was
   * not.
   *
   * The Apple answer is to let the action happen and offer it back. So restart is
   * instant, and the notice that says it happened carries the way out. Nothing to
   * confirm, nothing lost, one tap either way.
   */
  Game.prototype.restart = function (opts) {
    var silent = !!(opts && opts.silent);
    var worth = !silent && this.state && this.state.moves > 0;
    var snap = worth ? {
      state: E.cloneState(this.state),
      history: this.history.map(E.cloneState),
      phase: this.phase === 'busy' ? 'play' : this.phase
    } : null;

    this.cancelSlide();
    this.audio.resume();
    this.state = E.initialState(this.stage);
    this.history = [];
    this.queued = null;
    this.phase = 'play';
    this.renderer.setStage(this.stage, this.state);
    this.hideOverlay();
    this.audio.ui(false);
    this.syncHud();
    this.wake();

    this.restorePoint = snap;
    if (snap) {
      var self = this;
      this.showToast(t('restarted'), {
        icon: 'restart',
        action: t('undoShort'),
        onAction: function () { self.undoRestart(); },
        ms: 4200
      });
    }
  };

  Game.prototype.undoRestart = function () {
    var rp = this.restorePoint;
    if (!rp) return;
    this.restorePoint = null;
    this.state = rp.state;
    this.history = rp.history;
    this.renderer.showState(this.state);
    this.renderer.gravity = null;
    this.audio.undo();
    this.haptics.tilt();
    this.setPhase(rp.phase === 'over' ? 'over' : 'play');
    if (rp.phase === 'over') this.showGameOver();
    this.hideToast();
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

  // -- HUD & toast ------------------------------------------------------------

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
    var def = STAGES[this.index];
    this.dom.moves.textContent = String(this.state.moves);
    this.dom.moves.classList.toggle('over', this.state.moves > def.par);
    // Enabled during a slide too — an in-flight move is exactly the thing undo
    // can still take back.
    this.dom.btnUndo.disabled = !this.history.length || this.phase === 'clear';
  };

  Game.prototype.showToast = function (text, opts) {
    opts = opts || {};
    var el = this.dom.toast;
    var html = '';
    if (opts.icon) html += icon(opts.icon);
    html += '<span class="t-txt">' + esc(text) + '</span>';
    if (opts.action) html += '<button class="t-act" type="button">' + esc(opts.action) + '</button>';
    el.innerHTML = html;

    if (opts.onAction) {
      var btn = el.querySelector('.t-act');
      var self = this;
      if (btn) btn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.audio.ui(false);
        opts.onAction();
      });
    }

    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    var self2 = this;
    this._toastTimer = setTimeout(function () {
      el.classList.remove('show');
      self2.restorePoint = null;
    }, opts.ms || 1600);
  };

  Game.prototype.hideToast = function () {
    clearTimeout(this._toastTimer);
    this.dom.toast.classList.remove('show');
  };

  // -- cards ------------------------------------------------------------------

  function stat(label, value, cls) {
    return '<div class="ov-stat ' + (cls || '') + '"><span class="k">' + esc(label) +
      '</span><span class="v">' + esc(value == null ? '—' : value) + '</span></div>';
  }

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
    var chapName = JA ? (chap.ja || chap.name) : chap.name;
    var chapDone = def.id === chap.to && STAGES.filter(function (d) {
      return d.id >= chap.from && d.id <= chap.to && self_save.isCleared(d.id);
    }).length === (chap.to - chap.from + 1);

    var lines = [];
    // Star for a perfect line, check for a solve — the same two glyphs the stage
    // list uses, so the result means the same thing in both places without
    // anyone having to tell amber from cyan.
    lines.push('<div class="ov-mark' + (perfect ? ' perfect' : '') + '">' +
      icon(perfect ? 'star' : 'check') + '</div>');
    lines.push('<div class="ov-kicker">' + esc(chapDone
      ? t('chapEnd') + ' · ' + chapName
      : 'STAGE ' + def.id + ' · ' + def.name) + '</div>');
    lines.push('<h2 class="ov-title' + (perfect ? ' perfect' : '') + '">' +
      esc(perfect ? t('perfect') : t('clear')) + '</h2>');
    if (improved && prevBest != null) {
      lines.push('<div class="ov-flag">' + icon('check') + esc(t('newBest')) + '</div>');
    }
    lines.push('<div class="ov-stats">' +
      stat(t('moves'), moves) +
      stat(t('par'), def.par) +
      stat(t('bestShort'), this.save.best(def.id), 'is-best') +
      '</div>');
    if (!perfect) {
      lines.push('<div class="ov-note">' + esc(t('parNote').replace('%n', def.par)) + '</div>');
    }
    lines.push('<div class="ov-actions">' +
      '<button class="btn primary" type="button" data-act="next">' +
        esc(last ? t('allClear') : t('next')) + '</button>' +
      '<button class="btn plain" type="button" data-act="retry">' + esc(t('retry')) + '</button>' +
      '</div>');

    this.openOverlay(lines.join(''), 'clear');
  };

  /**
   * The run ended, and UNDO is the primary action.
   *
   * It used to be RESTART, which on a fifty-move board offers to throw the whole
   * afternoon away as the obvious choice, when one tap puts the block back and
   * the position is live again. The cheap, reversible answer goes first; the
   * expensive one stays available and quiet.
   */
  Game.prototype.showGameOver = function () {
    var lines = [];
    lines.push('<div class="ov-mark over">' + icon('hazard') + '</div>');
    lines.push('<div class="ov-kicker">STAGE ' + STAGES[this.index].id + '</div>');
    lines.push('<h2 class="ov-title over">' + esc(t('gameOver')) + '</h2>');
    lines.push('<div class="ov-note">' + esc(t('overBody')) + '</div>');
    lines.push('<div class="ov-actions">' +
      (this.history.length
        ? '<button class="btn primary" type="button" data-act="undo">' + esc(t('undo')) + '</button>'
        : '') +
      '<button class="btn ' + (this.history.length ? 'plain' : 'primary') + '" type="button" data-act="restart">' +
        esc(t('restart')) + '</button>' +
      '</div>');
    this.openOverlay(lines.join(''), 'over');
  };

  Game.prototype.showAllClear = function () {
    var total = 0, par = 0;
    var self = this;
    STAGES.forEach(function (s) {
      var b = self.save.best(s.id);
      if (b != null) total += b;
      par += s.par;
    });
    var lines = [];
    lines.push('<div class="ov-mark perfect">' + icon('check') + '</div>');
    lines.push('<h2 class="ov-title perfect">' + esc(t('allClear')) + '</h2>');
    lines.push('<div class="ov-note">' + esc(t('allBody').replace('%n', STAGES.length)) + '</div>');
    lines.push('<div class="ov-stats">' + stat(t('moves'), total) + stat(t('par'), par) + '</div>');
    lines.push('<div class="ov-actions">' +
      '<button class="btn primary" type="button" data-act="menu">' + esc(t('stages')) + '</button></div>');
    this.openOverlay(lines.join(''), 'clear');
  };

  Game.prototype.openOverlay = function (html, kind) {
    var ov = this.dom.overlay;
    ov.innerHTML = '<div class="ov-card">' + html + '</div>';
    ov.className = 'overlay show ' + kind;
    document.body.classList.add('carded');
    var self = this;
    ov.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        self.audio.ui(act === 'next');
        if (act === 'next') self.next();
        else if (act === 'retry' || act === 'restart') self.restart({ silent: true });
        else if (act === 'undo') self.undo();
        else if (act === 'menu') self.openMenu();
      });
    });
  };

  Game.prototype.hideOverlay = function () {
    this.dom.overlay.className = 'overlay';
    this.dom.overlay.innerHTML = '';
    document.body.classList.remove('carded');
  };

  // -- sheets -----------------------------------------------------------------

  Game.prototype.openSheet = function (el) {
    if (this.sheets.indexOf(el) >= 0) return;
    var top = this.sheets[this.sheets.length - 1];
    if (top) top.classList.add('behind');
    this.sheets.push(el);
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    this.dom.scrim.classList.add('show');
    this.dom.app.setAttribute('aria-hidden', 'true');
    this.renderer.aimDir = null;
    this.audio.ui(true);
    this.wake();
  };

  Game.prototype.closeSheet = function () {
    var el = this.sheets.pop();
    if (!el) return;
    el.classList.remove('show');
    el.style.transform = '';
    el.setAttribute('aria-hidden', 'true');
    var top = this.sheets[this.sheets.length - 1];
    if (top) top.classList.remove('behind');
    else {
      this.dom.scrim.classList.remove('show');
      this.dom.app.removeAttribute('aria-hidden');
    }
    this.audio.ui(false);
    this.wake();
  };

  Game.prototype.closeAllSheets = function () {
    while (this.sheets.length) this.closeSheet();
  };

  // `menuOpen` stays as the flag the frame loop and input paths read: whether
  // anything is covering the board is one question, not three.
  Object.defineProperty(Game.prototype, 'menuOpen', {
    get: function () { return this.sheets.length > 0; }
  });

  Game.prototype.openMenu = function () {
    // Show first, then fill: the grid scrolls the current stage into view, and
    // that only works once the panel is actually on screen.
    this.openSheet(this.dom.menu);
    this.renderStageGrid();
  };

  Game.prototype.closeMenu = function () { this.closeAllSheets(); };

  Game.prototype.openSettings = function () {
    this.renderSettings();
    this.openSheet(this.dom.settings);
  };

  Game.prototype.openHowTo = function () {
    this.renderHowTo();
    this.openSheet(this.dom.howto);
    this.save.set('seenHowTo', true);
  };

  // -- stage list -------------------------------------------------------------

  Game.prototype.renderStageGrid = function () {
    var grid = this.dom.grid;
    var self = this;
    grid.innerHTML = '';

    var total = STAGES.length;
    var cleared = this.save.clearedCount();
    var summary = document.getElementById('menu-progress');
    if (summary) {
      var pct = Math.round(cleared / total * 100);
      summary.innerHTML =
        '<span class="pv">' + cleared + '</span>' +
        '<span class="pt">/ ' + total + '</span>' +
        '<span class="pbar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="pl">' + esc(t('progress')) + '</span>';
    }

    CHAPTERS.forEach(function (chap) {
      var stages = STAGES.filter(function (d) { return d.id >= chap.from && d.id <= chap.to; });
      if (!stages.length) return;

      var done = stages.filter(function (d) { return self.save.isCleared(d.id); }).length;
      var open = stages.some(function (d) { return self.save.isUnlocked(d.id); });
      var name = JA ? (chap.ja || chap.name) : chap.name;

      var head = document.createElement('div');
      head.className = 'chap-head' + (done === stages.length ? ' done' : '') + (open ? '' : ' locked');
      head.innerHTML =
        '<span class="cn">' + (chap.number < 10 ? '0' + chap.number : chap.number) + '</span>' +
        '<span class="cname">' + esc(name) + '</span>' +
        '<span class="cprog">' + done + '/' + stages.length + '</span>';
      grid.appendChild(head);

      var row = document.createElement('div');
      row.className = 'chap-row';
      stages.forEach(function (def) {
        var unlocked = self.save.isUnlocked(def.id);
        var best = self.save.best(def.id);
        var perfect = best != null && best === def.par;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell' + (unlocked ? '' : ' locked') + (best != null ? ' done' : '') +
          (perfect ? ' perfect' : '') +
          (STAGES[self.index] && STAGES[self.index].id === def.id ? ' current' : '');
        // Three states, three glyphs, three positions — the colour is the last
        // thing carrying the meaning here rather than the first.
        var foot = !unlocked ? icon('lock')
          : best == null ? '<span>' + esc(t('par')) + ' ' + def.par + '</span>'
          : icon(perfect ? 'star' : 'check') + '<span>' + best + '</span>';
        b.innerHTML = '<span class="n">' + def.id + '</span>' +
          '<span class="nm">' + esc(def.name) + '</span>' +
          '<span class="bs">' + foot + '</span>';
        b.disabled = !unlocked;
        b.setAttribute('aria-label', (JA ? 'ステージ ' : 'Stage ') + def.id + ' ' + def.name +
          (unlocked ? (best == null ? '' : ' · ' + t('bestShort') + ' ' + best) : ' · ' + t('locked')));
        b.addEventListener('click', function () {
          if (!unlocked) return;
          self.audio.ui(true);
          self.closeAllSheets();
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

  // -- settings ---------------------------------------------------------------

  Game.prototype.renderSettings = function () {
    var self = this;
    var list = this.dom.settingsList;
    var rows = [];

    function sw(id, label, on, note) {
      return '<button class="row tap" type="button" role="switch" data-set="' + id + '" ' +
        'aria-checked="' + (on ? 'true' : 'false') + '">' +
        '<span class="rl"><span class="rt">' + esc(label) + '</span>' +
        (note ? '<span class="rs">' + esc(note) + '</span>' : '') + '</span>' +
        '<span class="sw"></span></button>';
    }

    rows.push(sw('sound', t('sound'), this.save.data.sound !== false));
    if (this.haptics.supported) {
      rows.push(sw('haptics', t('haptics'), this.save.data.haptics !== false));
    }
    rows.push(sw('motion', t('reduceMo'), this.motionReduced(), t('reduceNote')));

    var html = '<div class="list">' + rows.join('') + '</div>';

    html += '<div class="list">' +
      '<button class="row tap" type="button" data-act="howto">' +
        icon('help') +
        '<span class="rl"><span class="rt">' + esc(t('howto')) + '</span></span>' +
        icon('chevron', 'chev') +
      '</button></div>';

    html += '<div class="list">' +
      '<button class="row tap destructive" type="button" data-act="reset">' +
        '<span class="rl"><span class="rt">' + esc(t('resetRow')) + '</span></span>' +
      '</button></div>';

    list.innerHTML = html;

    list.querySelectorAll('[data-set]').forEach(function (el) {
      el.addEventListener('click', function () { self.toggleSetting(el.getAttribute('data-set')); });
    });
    list.querySelectorAll('[data-act]').forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-act');
        if (act === 'howto') self.openHowTo();
        else if (act === 'reset') self.askReset();
      });
    });
  };

  Game.prototype.toggleSetting = function (key) {
    if (key === 'sound') {
      var on = this.save.data.sound === false;
      this.save.set('sound', on);
      this.audio.setMuted(!on);
      if (on) { this.audio.resume(); this.audio.ui(true); }
    } else if (key === 'haptics') {
      var h = this.save.data.haptics === false;
      this.save.set('haptics', h);
      this.haptics.setEnabled(h);
      if (h) this.haptics.select();
    } else if (key === 'motion') {
      this.save.set('reduceMotion', !this.motionReduced());
      this.applyMotion();
      this.audio.ui(false);
    }
    this.renderSettings();
  };

  /**
   * The one confirmation left in the game.
   *
   * Everything else that could go wrong is undoable, so nothing else asks. This
   * one is not undoable — it erases a campaign — so it asks properly: an action
   * sheet naming the consequence, with the destructive choice in red and Cancel
   * as the safe default. `window.confirm` would have been one line, and it would
   * have looked like a browser had crashed into the game.
   */
  Game.prototype.askReset = function () {
    var self = this;
    var el = document.createElement('div');
    el.className = 'overlay show confirm';
    el.style.position = 'fixed';
    el.style.zIndex = '40';
    el.innerHTML = '<div class="ov-card">' +
      '<h2 class="ov-title" style="font-size:var(--t-title3)">' + esc(t('resetTitle')) + '</h2>' +
      '<div class="ov-note">' + esc(t('resetBody')) + '</div>' +
      '<div class="ov-actions">' +
        '<button class="btn danger" type="button" data-c="yes">' + esc(t('resetDo')) + '</button>' +
        '<button class="btn ghost" type="button" data-c="no">' + esc(t('cancel')) + '</button>' +
      '</div></div>';
    document.body.appendChild(el);

    var done = function (yes) {
      el.remove();
      if (!yes) { self.audio.ui(false); return; }
      self.save.reset();
      self.applyMotion();
      self.haptics.setEnabled(true);
      self.audio.setMuted(false);
      self.closeAllSheets();
      self.loadStage(0);
    };
    el.querySelector('[data-c="yes"]').addEventListener('click', function () { done(true); });
    el.querySelector('[data-c="no"]').addEventListener('click', function () { done(false); });
    el.addEventListener('click', function (e) { if (e.target === el) done(false); });
  };

  // -- how to play ------------------------------------------------------------

  /**
   * Three rules, three pictures, one line each.
   *
   * A player who never opens this should still be able to finish the game — the
   * boards teach every one of these, in the order they are listed, and the
   * objective line carries whichever one is in play. This exists for the player
   * who put the phone down on stage 12 and picked it up a week later.
   */
  Game.prototype.renderHowTo = function () {
    var F = FIGURES;
    var rules = [
      ['r1h', 'r1p', F.gravity],
      ['r2h', 'r2p', F.stop],
      ['r3h', 'r3p', F.brake],
      ['r4h', 'r4p', F.drifter]
    ];
    var html = rules.map(function (r) {
      return '<div class="rule">' +
        '<div class="fig" aria-hidden="true">' + r[2] + '</div>' +
        '<div class="rd"><div class="rh">' + esc(t(r[0])) + '</div>' +
        '<div class="rp">' + esc(t(r[1])) + '</div></div></div>';
    }).join('');
    html += '<p class="group-note" style="margin-top:var(--s4)">' + esc(t('r5')) + '</p>';
    this.dom.howtoBody.innerHTML = html;
  };

  // The figures use the board's own drawing language — same corner radii, same
  // socket ring, same hazard hatch — so the diagram and the game are visibly the
  // same object rather than an illustration of it.
  var FIGURES = (function () {
    function frame(inner) {
      return '<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="1" y="1" width="70" height="70" rx="14" fill="#FFFFFF" ' +
        'stroke="rgba(60,70,120,0.16)"/>' + inner + '</svg>';
    }
    var block = '<rect x="8" y="42" width="22" height="22" rx="6" fill="#0B8DAE"/>' +
                '<circle cx="19" cy="53" r="3.4" fill="rgba(255,255,255,0.92)"/>';
    return {
      gravity: frame(
        '<rect x="8" y="8" width="22" height="22" rx="6" fill="#0B8DAE"/>' +
        '<circle cx="19" cy="19" r="3.4" fill="rgba(255,255,255,0.92)"/>' +
        '<path d="M40 19h18M52 13l6 6-6 6" stroke="#616986" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="42" y="42" width="22" height="22" rx="6" fill="rgba(11,141,174,0.34)"/>'),
      // The block goes THROUGH the socket and stops past it: the one rule the
      // whole game rests on, drawn as the mistake everybody makes once.
      stop: frame(
        '<rect x="26" y="26" width="20" height="20" rx="5" fill="rgba(60,70,120,0.09)" ' +
        'stroke="#5C6484" stroke-width="2.4"/>' +
        '<circle cx="36" cy="36" r="3.4" stroke="#5C6484" stroke-width="2"/>' +
        '<path d="M10 36h10" stroke="#616986" stroke-width="2.4" stroke-linecap="round" ' +
        'stroke-dasharray="4 4"/>' +
        '<rect x="50" y="25" width="22" height="22" rx="6" fill="#0B8DAE" transform="translate(-6,0)"/>' +
        '<circle cx="55" cy="36" r="3.4" fill="rgba(255,255,255,0.92)"/>'),
      // All three brakes at once, in the order the campaign teaches them: a block
      // pressed flat against the tray EDGE on the left, a WALL slab merged into
      // the right-hand edge, and a second BLOCK stopped against it.
      brake: frame(
        '<rect x="1" y="24" width="22" height="24" rx="5" fill="#0B8DAE"/>' +
        '<circle cx="13" cy="36" r="3.4" fill="rgba(255,255,255,0.92)"/>' +
        '<rect x="30" y="26" width="20" height="20" rx="5" fill="#7A4AE8"/>' +
        '<rect x="36" y="32" width="8" height="8" fill="rgba(255,255,255,0.92)"/>' +
        '<rect x="52" y="21" width="19" height="30" rx="2" fill="#78829F"/>'),
      // The grey slab has come to rest ON the socket and the penguin is stacked
      // up behind it. Drawn as the situation rather than as the piece, because
      // the piece on its own looks like a wall and the whole point is that it
      // is not one.
      drifter: frame(
        '<path d="M6 36h9" stroke="#616986" stroke-width="2.4" stroke-linecap="round" ' +
        'stroke-dasharray="4 4"/>' +
        '<rect x="18" y="25" width="22" height="22" rx="6" fill="#0B8DAE"/>' +
        '<circle cx="29" cy="36" r="3.4" fill="rgba(255,255,255,0.92)"/>' +
        '<rect x="44" y="24" width="24" height="24" rx="6" fill="rgba(60,70,120,0.09)" ' +
        'stroke="#5C6484" stroke-width="2.4"/>' +
        '<rect x="48" y="28" width="16" height="16" rx="4" fill="#A8B0BC"/>' +
        '<rect x="51" y="31" width="10" height="10" rx="2" fill="rgba(255,255,255,0.45)"/>'),
      hazard: frame(
        '<clipPath id="hzc"><rect x="26" y="26" width="20" height="20" rx="5"/></clipPath>' +
        '<rect x="26" y="26" width="20" height="20" rx="5" fill="#F8E1E5"/>' +
        '<g clip-path="url(#hzc)" stroke="rgba(195,37,58,0.4)" stroke-width="4">' +
        '<path d="M18 50 38 22M28 50 48 22M38 50 58 22"/></g>' +
        '<rect x="26" y="26" width="20" height="20" rx="5" stroke="rgba(195,37,58,0.6)"/>' +
        '<path d="M12 36h8M52 36h8" stroke="#616986" stroke-width="2.4" stroke-linecap="round" ' +
        'stroke-dasharray="4 4"/>' + block.replace('y="42"', 'y="25"').replace('cy="53"', 'cy="36"')
          .replace('x="8"', 'x="4"').replace('cx="19"', 'cx="15"'))
    };
  })();

  // -- wiring -----------------------------------------------------------------

  Game.prototype.bindUI = function () {
    var self = this;
    var tap = function (el, fn) {
      if (!el) return;
      el.addEventListener('click', function (e) { e.preventDefault(); self.audio.resume(); fn(); });
    };
    tap(this.dom.btnUndo, function () { self.undo(); });
    tap(this.dom.btnRestart, function () { self.restart(); });
    tap(this.dom.btnMenu, function () { self.openMenu(); });
    tap(this.dom.btnHome, function () { self.showHome(); });
    tap(this.dom.btnHomePlay, function () { self.leaveHome(); });
    tap(this.dom.btnHomeStages, function () { self.openHomeStages(); });
    tap(this.dom.btnClose, function () { self.closeAllSheets(); });
    tap(this.dom.btnSettings, function () { self.openSettings(); });
    tap(this.dom.btnSettingsBack, function () { self.closeSheet(); });
    tap(this.dom.btnSettingsClose, function () { self.closeAllSheets(); });
    tap(this.dom.btnHowtoClose, function () { self.closeSheet(); });
    tap(this.dom.coach, function () { self.openHowTo(); });
    tap(this.dom.scrim, function () { self.closeAllSheets(); });

    this.bindSheetDrag(this.dom.menu);
    this.bindSheetDrag(this.dom.settings);
    this.bindSheetDrag(this.dom.howto);

    window.addEventListener('keydown', function (e) {
      if (self.homeOpen) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.leaveHome(); }
        return;
      }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); self.undo(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); self.restart(); }
      else if (e.key === 'Escape') {
        if (self.sheets.length) self.closeSheet(); else self.openMenu();
      } else if (e.key === 'Enter' && self.phase === 'clear') { self.next(); }
    });
  };

  /**
   * Drag a sheet down to dismiss it.
   *
   * Bound to the grabber and the title bar only. Binding it to the whole sheet
   * would mean every attempt to scroll the stage list fights the dismiss
   * gesture, which is the single most common way this interaction is got wrong.
   */
  Game.prototype.bindSheetDrag = function (sheet) {
    if (!sheet) return;
    var self = this;
    var handles = sheet.querySelectorAll('.grabber, .sheet-bar');
    var startY = null, dy = 0, t0 = 0;

    var down = function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      var p = e.touches ? e.touches[0] : e;
      startY = p.clientY; dy = 0; t0 = performance.now();
      sheet.style.transition = 'none';
    };
    var move = function (e) {
      if (startY == null) return;
      var p = e.touches ? e.touches[0] : e;
      dy = Math.max(0, p.clientY - startY);
      if (dy > 2 && e.cancelable) e.preventDefault();
      // Resist upward and past the top: the sheet is already where it goes.
      sheet.style.transform = 'translateY(' + dy + 'px)';
    };
    var up = function () {
      if (startY == null) return;
      var quick = performance.now() - t0 < 300 && dy > 40;
      sheet.style.transition = '';
      sheet.style.transform = '';
      startY = null;
      if (dy > 110 || quick) self.closeSheet();
    };

    for (var i = 0; i < handles.length; i++) {
      handles[i].addEventListener('touchstart', down, { passive: true });
      handles[i].addEventListener('touchmove', move, { passive: false });
      handles[i].addEventListener('touchend', up, { passive: true });
      handles[i].addEventListener('touchcancel', up, { passive: true });
      handles[i].addEventListener('mousedown', down);
    }
    window.addEventListener('mousemove', function (e) { if (startY != null) move(e); });
    window.addEventListener('mouseup', function () { if (startY != null) up(); });
  };

  // -- frame loop -------------------------------------------------------------

  Game.prototype.onResize = function () {
    var self = this;
    clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(function () {
      document.documentElement.style.setProperty('--tsx', String(measureTypeScale()));
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
    if (this.homeOpen) { this.running = false; return; }
    // A sheet covers the board completely; there is nothing to spend frames on.
    if (this.sheets.length) { this.running = false; return; }

    var dt = Math.min(64, now - this.last);

    // While the board is at rest, drop to a low frame rate. Thinking time is the
    // longest part of this game and it should not cost the player battery.
    if (!this.busyFrames && dt < IDLE_FRAME_MS) {
      requestAnimationFrame(this.loop);
      return;
    }

    this.last = now;
    this.busyFrames = this.renderer.frame(dt, now);
    requestAnimationFrame(this.loop);
  };

  root.TiltGame = { Game: Game, TXT: TXT, JA: JA };

  /**
   * The launch curtain.
   *
   * It is the app's own background with the wordmark on it, which is exactly
   * what a system launch screen is: the first frame of the app, not an
   * advertisement in front of it. It costs no time on a return visit — it lifts
   * the moment the board is ready — and is held for a beat exactly once, the
   * first time somebody ever opens the game, so TILT gets to say its name.
   */
  function dropCurtain(first) {
    var c = document.getElementById('launch');
    if (!c) return;
    setTimeout(function () {
      c.classList.add('gone');
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 460);
    }, first ? 620 : 90);
  }

  // Boot once the DOM is parseable. The engine has no async dependencies, so
  // this is the only load-order concern in the whole game.
  function boot() {
    try {
      root.game = new Game();
      dropCurtain(!root.game.save.data.everMoved && !root.game.save.clearedCount());
    } catch (err) {
      var c = document.getElementById('launch');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      var el = document.getElementById('app');
      if (el) {
        el.innerHTML = '<div class="fatal"><h1>TILT</h1><p>' +
          (JA ? 'ゲームを起動できませんでした。' : 'The game failed to start.') +
          '</p><pre>' + esc(String(err && err.message || err)) + '</pre></div>';
      }
      throw err;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : globalThis);

