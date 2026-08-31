'use strict';
/*
 * TILT — the candidate browser.
 *
 *   node tools/serve.js
 *   open http://localhost:8080/tools/fun-browser.html
 *
 * The last step of the search, and the only one that is allowed to be sure.
 *
 * tools/fun-search.js produces numbers, and the numbers are estimates however
 * exactly they were measured. This page puts the boards those numbers picked in
 * front of a person, on the same engine and the same renderer the game ships,
 * and records what the person thought. A board is worth playing because someone
 * played it — `funPotential` only ever decides what gets shown first.
 *
 * Nothing here is part of the game. It reads src/engine.js, src/render.js and
 * src/input.js and adds no rules of its own, so a board that plays wrong here
 * plays wrong in the game.
 *
 * Reviews live in localStorage, keyed by the candidate's stable id — a hash of
 * its canonical board — so re-running the search with different settings keeps
 * every verdict already recorded, and EXPORT hands the whole lot back as JSON.
 */
(function () {

  var E = window.TiltEngine;
  var R = window.TiltRender;
  var INPUT = window.TiltInput;

  var INDEX_URL = 'tools/fun-level-index.json';
  var STORE = 'tilt.fun.reviews.v1';
  var CATEGORIES = ['AHA', 'INTERACTION', 'CHOICE', 'SEQUENCE', 'PRECISION',
                    'ELEGANT', 'TRAP', 'ORBIT', 'HAZARD', 'MASTER'];
  var BANDS = ['tutorial', 'easy', 'medium', 'hard', 'expert'];
  var FLAGS = ['TOO CONFUSING', 'TOO LINEAR', 'UNFAIR', 'AHA'];

  // ---------------------------------------------------------------------------
  // state
  // ---------------------------------------------------------------------------
  var data = null;                       // the whole index
  var pool = [];                         // every candidate
  var view = [];                         // the filtered, sorted list
  var at = 0;                            // where we are in `view`
  var reviews = load();

  var filter = {
    sizes: {}, categories: {}, bands: {}, walls: {},
    parMin: null, parMax: null, review: 'all', sort: 'fun'
  };

  var stage = null, state = null, history = [], busy = false, solutionShown = false;
  var renderer = null, autoplay = null;

  // ---------------------------------------------------------------------------
  // review storage
  // ---------------------------------------------------------------------------
  /* localStorage can throw rather than merely return nothing — a private window,
     a browser set to block site data, a page opened straight off disk — and a
     review tool that dies on load because it could not read its own notes is
     worse than one that starts empty. Every access is guarded and the page works
     either way; EXPORT is what makes a session durable. */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch (err) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(reviews)); }
    catch (err) { note('reviewNote', 'could not save to this browser — use EXPORT'); }
  }
  function reviewOf(id) {
    if (!reviews[id]) reviews[id] = { fun: 0, difficulty: 0, flags: [], verdict: '' };
    return reviews[id];
  }
  function isReviewed(id) {
    var r = reviews[id];
    return !!(r && (r.verdict || r.fun || r.difficulty || (r.flags && r.flags.length)));
  }

  // ---------------------------------------------------------------------------
  // small DOM helpers
  // ---------------------------------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function note(id, text) { el(id).textContent = text; }
  function button(label, on, click, cls) {
    var b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    if (on) b.classList.add('on');
    b.addEventListener('click', click);
    return b;
  }
  function fill(id, nodes) {
    var host = el(id);
    host.textContent = '';
    nodes.forEach(function (n) { host.appendChild(n); });
  }

  // ---------------------------------------------------------------------------
  // filters
  // ---------------------------------------------------------------------------
  function toggleSet(set, key) {
    if (set[key]) delete set[key]; else set[key] = 1;
    apply();
  }
  function anyOrAll(set, value) {
    var keys = Object.keys(set);
    return !keys.length || !!set[value];
  }

  function buildFilters() {
    var sizes = {};
    pool.forEach(function (c) { sizes[c.boardSize] = 1; });

    fill('fSize', Object.keys(sizes).sort().map(function (s) {
      return button(s + '×' + s, filter.sizes[s], function () { toggleSet(filter.sizes, s); });
    }));

    fill('fCategory', CATEGORIES.filter(function (cat) {
      return pool.some(function (c) { return c.categories.indexOf(cat) >= 0; });
    }).map(function (cat) {
      return button(cat, filter.categories[cat], function () { toggleSet(filter.categories, cat); });
    }));

    fill('fBand', BANDS.filter(function (b) {
      return pool.some(function (c) { return c.difficulty === b; });
    }).map(function (b) {
      return button(b, filter.bands[b], function () { toggleSet(filter.bands, b); });
    }));

    var walls = {};
    pool.forEach(function (c) { walls[c.analysis.wallCount] = 1; });
    fill('fWalls', Object.keys(walls).sort().map(function (w) {
      return button(w === '0' ? 'none' : w, filter.walls[w], function () { toggleSet(filter.walls, w); });
    }));

    fill('fReview', [
      button('all', filter.review === 'all', function () { filter.review = 'all'; apply(); }),
      button('unreviewed', filter.review === 'new', function () { filter.review = 'new'; apply(); }),
      button('KEEP only', filter.review === 'keep', function () { filter.review = 'keep'; apply(); }),
      button('MAYBE', filter.review === 'maybe', function () { filter.review = 'maybe'; apply(); })
    ]);

    fill('fSort', [
      button('fun', filter.sort === 'fun', function () { filter.sort = 'fun'; apply(); }),
      button('aha', filter.sort === 'aha', function () { filter.sort = 'aha'; apply(); }),
      button('interaction', filter.sort === 'inter', function () { filter.sort = 'inter'; apply(); }),
      button('simplest', filter.sort === 'simple', function () { filter.sort = 'simple'; apply(); }),
      button('par', filter.sort === 'par', function () { filter.sort = 'par'; apply(); })
    ]);

    el('parMin').addEventListener('input', function () {
      filter.parMin = this.value ? Number(this.value) : null; apply();
    });
    el('parMax').addEventListener('input', function () {
      filter.parMax = this.value ? Number(this.value) : null; apply();
    });
  }

  function matches(c) {
    if (!anyOrAll(filter.sizes, String(c.boardSize))) return false;
    if (!anyOrAll(filter.walls, String(c.analysis.wallCount))) return false;
    if (!anyOrAll(filter.bands, c.difficulty)) return false;
    var cats = Object.keys(filter.categories);
    if (cats.length && !cats.some(function (k) { return c.categories.indexOf(k) >= 0; })) return false;
    if (filter.parMin != null && c.par < filter.parMin) return false;
    if (filter.parMax != null && c.par > filter.parMax) return false;
    var r = reviews[c.id];
    if (filter.review === 'new' && isReviewed(c.id)) return false;
    if (filter.review === 'keep' && (!r || r.verdict !== 'KEEP')) return false;
    if (filter.review === 'maybe' && (!r || r.verdict !== 'MAYBE')) return false;
    return true;
  }

  var SORTS = {
    fun: function (a, b) { return b.funPotential - a.funPotential; },
    aha: function (a, b) { return b.analysis.ahaPotential - a.analysis.ahaPotential; },
    inter: function (a, b) { return b.analysis.interactionScore - a.analysis.interactionScore; },
    simple: function (a, b) {
      return a.analysis.elementCount - b.analysis.elementCount ||
             a.boardSize - b.boardSize || b.funPotential - a.funPotential;
    },
    par: function (a, b) { return a.par - b.par || b.funPotential - a.funPotential; }
  };

  function apply() {
    var keepId = view[at] && view[at].id;
    view = pool.filter(matches);
    view.sort(function (a, b) {
      return SORTS[filter.sort](a, b) || (a.id < b.id ? -1 : 1);
    });
    at = 0;
    if (keepId) {
      for (var i = 0; i < view.length; i++) if (view[i].id === keepId) { at = i; break; }
    }
    buildFilters();
    renderList();
    show();
  }

  function renderList() {
    var head = el('listHead');
    head.textContent = 'Matches (' + view.length + ')';
    var host = el('list');
    host.textContent = '';
    view.slice(0, 300).forEach(function (c, i) {
      var b = document.createElement('button');
      if (i === at) b.className = 'cur';
      var left = document.createElement('span');
      left.textContent = c.boardSize + '×' + c.boardSize + ' · par ' + c.par + ' · ' +
        c.categories.slice(0, 2).join('+');
      var right = document.createElement('span');
      var r = reviews[c.id];
      right.textContent = r && r.verdict ? r.verdict[0] : c.funPotential.toFixed(2);
      if (r && r.verdict) right.className = 'verdict-dot ' + r.verdict;
      b.appendChild(left); b.appendChild(right);
      b.addEventListener('click', function () { at = i; renderList(); show(); });
      host.appendChild(b);
    });
    if (view.length > 300) {
      var more = document.createElement('div');
      more.className = 'note';
      more.textContent = '… and ' + (view.length - 300) + ' more';
      host.appendChild(more);
    }
  }

  // ---------------------------------------------------------------------------
  // playing a candidate
  // ---------------------------------------------------------------------------
  function current() { return view[at] || null; }

  function show() {
    var c = current();
    stopAutoplay();
    solutionShown = false;
    if (!c) {
      fill('headline', []);
      note('status', 'nothing matches these filters');
      el('boardText').textContent = '';
      el('solText').textContent = '';
      fill('scores', []); fill('counts', []);
      return;
    }
    stage = E.compile({ id: c.id, board: c.board });
    state = E.initialState(stage);
    history = [];
    busy = false;
    renderer.setStage(stage, state);
    renderer.layout();
    renderer.showState(state);
    drawHeadline(c);
    drawDetail(c);
    drawVerdict(c);
    syncStatus();
    renderList();
  }

  function drawHeadline(c) {
    var nodes = [];
    var title = document.createElement('strong');
    title.textContent = (at + 1) + ' / ' + view.length + '  ·  ' + c.id;
    nodes.push(title);
    var size = document.createElement('span');
    size.className = 'tag size';
    size.textContent = c.boardSize + '×' + c.boardSize;
    nodes.push(size);
    var band = document.createElement('span');
    band.className = 'tag band';
    band.textContent = c.difficulty;
    nodes.push(band);
    c.categories.forEach(function (cat) {
      var t = document.createElement('span');
      t.className = 'tag';
      t.textContent = cat;
      nodes.push(t);
    });
    if (c.overlapsCampaignStage) {
      var w = document.createElement('span');
      w.className = 'tag warn';
      w.textContent = 'also inside stage ' + c.overlapsCampaignStage;
      nodes.push(w);
    }
    if (c.analysis.redundantWallCount) {
      var rw = document.createElement('span');
      rw.className = 'tag warn';
      rw.textContent = c.analysis.redundantWallCount + ' idle wall';
      nodes.push(rw);
    }
    fill('headline', nodes);
  }

  function metricRow(label, value, bar, barClass) {
    var tr = document.createElement('tr');
    var k = document.createElement('td');
    k.className = 'k';
    k.textContent = label;
    var v = document.createElement('td');
    v.className = 'v';
    v.textContent = value;
    if (bar != null) {
      var box = document.createElement('div');
      box.className = 'bar' + (barClass ? ' ' + barClass : '');
      var i = document.createElement('i');
      i.style.width = Math.round(Math.max(0, Math.min(1, bar)) * 100) + '%';
      box.appendChild(i);
      k.appendChild(box);
    }
    tr.appendChild(k); tr.appendChild(v);
    return tr;
  }

  function drawDetail(c) {
    var a = c.analysis;
    el('boardText').textContent = c.board.join('\n');
    el('solText').textContent = c.solution + '   (' + c.par + ' moves)';

    fill('scores', [
      metricRow('fun potential', a.funPotential, a.funPotential),
      metricRow('aha potential', a.ahaPotential, a.ahaPotential),
      metricRow('interaction', a.interactionScore, a.interactionScore),
      metricRow('choice', a.choiceScore, a.choiceScore),
      metricRow('elegance', a.solutionEleganceScore, a.solutionEleganceScore),
      metricRow('simplicity', a.simplicityScore, a.simplicityScore),
      metricRow('size efficiency', a.sizeEfficiency, a.sizeEfficiency),
      metricRow('depth per element', a.depthPerElement),
      metricRow('difficulty', a.difficultyScore, a.difficultyScore),
      metricRow('cognitive load', a.cognitiveLoadScore, a.cognitiveLoadScore, 'load')
    ]);

    fill('counts', [
      metricRow('par', a.par),
      metricRow('penguins', a.penguinCount),
      metricRow('walls (used / idle)', a.meaningfulWallCount + ' / ' + a.redundantWallCount),
      metricRow('cracked ice', a.hazardCount),
      metricRow('pieces on the board', a.elementCount),
      metricRow('meaningful decisions', a.meaningfulDecisionCount),
      metricRow('forced moves', a.forcedMoveRatio),
      metricRow('useful branching', a.averageUsefulBranching),
      metricRow('moves away from goal', a.moveAwayFromGoalCount),
      metricRow('slid over own aurora', a.goalPassThroughCount),
      metricRow('delayed collections', a.delayedCollectionCount),
      metricRow('counter-intuitive moves', a.counterIntuitiveMoveCount),
      metricRow('look-ahead needed', a.requiredLookahead),
      metricRow('penguin brakes', a.penguinBrakeCount),
      metricRow('dependent moves', a.dependencyCount),
      metricRow('order forced', a.collectionOrderDependency),
      metricRow('both penguins move', a.sharedGravityInteractionCount),
      metricRow('recoverable mistakes', a.wrongButRecoverableCount),
      metricRow('dead-end moves', a.deadEndMoveCount),
      metricRow('opening dead ends', a.openingDeadEndRate),
      metricRow('active area', a.activeAreaRatio, a.activeAreaRatio),
      metricRow('reachable positions', a.reachableStateCount)
    ]);

    var mine = [];
    Object.keys(data.buckets || {}).forEach(function (key) {
      if (data.buckets[key].indexOf(c.id) >= 0) mine.push(key);
    });
    note('bucketNote', mine.join('   ·   ') || '—');
  }

  function drawVerdict(c) {
    var r = reviewOf(c.id);
    fill('vVerdict', ['KEEP', 'MAYBE', 'REJECT'].map(function (v) {
      return button(v, r.verdict === v, function () {
        r.verdict = r.verdict === v ? '' : v;
        r.at = Date.now();
        save(); drawVerdict(c); renderList(); syncReviewNote();
      }, v.toLowerCase());
    }));

    fill('vFun', [1, 2, 3, 4, 5].map(function (n) {
      return button(String(n), r.fun === n, function () {
        r.fun = r.fun === n ? 0 : n; r.at = Date.now();
        save(); drawVerdict(c); renderList(); syncReviewNote();
      });
    }));

    fill('vDifficulty', [1, 2, 3, 4, 5].map(function (n) {
      return button(String(n), r.difficulty === n, function () {
        r.difficulty = r.difficulty === n ? 0 : n; r.at = Date.now();
        save(); drawVerdict(c); syncReviewNote();
      });
    }));

    fill('vFlags', FLAGS.map(function (f) {
      var on = r.flags.indexOf(f) >= 0;
      return button(f, on, function () {
        var i = r.flags.indexOf(f);
        if (i >= 0) r.flags.splice(i, 1); else r.flags.push(f);
        r.at = Date.now();
        save(); drawVerdict(c); syncReviewNote();
      });
    }));
    syncReviewNote();
  }

  function syncReviewNote() {
    var done = pool.filter(function (c) { return isReviewed(c.id); }).length;
    var keep = pool.filter(function (c) {
      return reviews[c.id] && reviews[c.id].verdict === 'KEEP';
    }).length;
    note('reviewNote', done + ' of ' + pool.length + ' reviewed · ' + keep + ' kept');
  }

  // ---------------------------------------------------------------------------
  // moving
  // ---------------------------------------------------------------------------
  function syncStatus() {
    var c = current();
    if (!c) return;
    var solved = E.solve(stage, state, 200000);
    var line = 'move ' + state.moves + ' of ' + c.par;
    if (E.isClear(stage, state)) line += '  ·  CLEAR' + (state.moves === c.par ? ' in par' : '');
    else if (E.isBroken(state)) line += '  ·  lost a penguin — RESTART';
    else if (!solved.solvable) line += '  ·  dead end: this board can no longer be cleared';
    else line += '  ·  ' + solved.moves + ' to go';
    if (solutionShown) line += '  ·  solution ' + c.solution;
    note('status', line);
  }

  function move(dir) {
    if (busy || !stage) return;
    if (E.isClear(stage, state) || E.isBroken(state)) return;
    var res = E.simulate(stage, state, dir, { frames: true });
    if (!res.moved) { renderer.rebuff(dir); return; }
    history.push(E.cloneState(state));
    busy = true;
    renderer.gravity = dir;
    renderer.playMove(res, function () {
      state = res.state;
      busy = false;
      syncStatus();
    });
  }

  function restart() {
    stopAutoplay();
    state = E.initialState(stage);
    history = [];
    busy = false;
    renderer.showState(state);
    renderer.gravity = null;
    syncStatus();
  }
  function undo() {
    stopAutoplay();
    if (!history.length) return;
    state = history.pop();
    busy = false;
    renderer.showState(state);
    syncStatus();
  }

  function stopAutoplay() {
    if (autoplay) { clearTimeout(autoplay); autoplay = null; }
  }
  /**
   * Walk the shortest solution, so the trick can be watched rather than read.
   *
   * Each move waits for the previous animation to finish rather than running on
   * a fixed clock: a long slide across a 5×5 takes longer than a short one, and
   * a timer that fires early would find the board busy, drop that move, and
   * play a different sequence from the one it is supposed to be demonstrating.
   */
  function playSolution() {
    var c = current();
    if (!c) return;
    restart();
    solutionShown = true;
    var i = 0;
    var step = function () {
      if (busy) { autoplay = setTimeout(step, 60); return; }
      if (i >= c.solution.length) { autoplay = null; syncStatus(); return; }
      move(c.solution[i++]);
      autoplay = setTimeout(step, 240);
    };
    autoplay = setTimeout(step, 260);
  }

  function go(delta) {
    if (!view.length) return;
    at = (at + delta + view.length) % view.length;
    show();
  }

  // ---------------------------------------------------------------------------
  // export / import
  // ---------------------------------------------------------------------------
  function reviewPayload() {
    var out = { format: 'tilt-fun-reviews/1', reviews: {} };
    Object.keys(reviews).sort().forEach(function (id) {
      if (!isReviewed(id)) return;
      var c = pool.filter(function (x) { return x.id === id; })[0];
      out.reviews[id] = {
        verdict: reviews[id].verdict || '',
        fun: reviews[id].fun || 0,
        difficulty: reviews[id].difficulty || 0,
        flags: (reviews[id].flags || []).slice(),
        board: c ? c.board : null,
        par: c ? c.par : null,
        categories: c ? c.categories : null
      };
    });
    return JSON.stringify(out, null, 1);
  }

  function exportReviews() {
    var blob = new Blob([reviewPayload()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tilt-fun-reviews.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function copyReviews() {
    var text = reviewPayload();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        note('reviewNote', 'copied ' + text.length + ' bytes to the clipboard');
      }, function () { note('reviewNote', 'could not copy — use EXPORT'); });
    } else {
      note('reviewNote', 'no clipboard here — use EXPORT');
    }
  }

  function importReviews(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        var incoming = parsed.reviews || parsed;
        Object.keys(incoming).forEach(function (id) {
          var r = incoming[id];
          reviews[id] = {
            verdict: r.verdict || '', fun: r.fun || 0,
            difficulty: r.difficulty || 0, flags: (r.flags || []).slice(),
            at: r.at || Date.now()
          };
        });
        save(); apply();
        note('reviewNote', 'imported ' + Object.keys(incoming).length + ' reviews');
      } catch (err) {
        note('reviewNote', 'that file is not a review export');
      }
    };
    reader.readAsText(file);
  }

  function copyBoard() {
    var c = current();
    if (!c) return;
    var text = "['" + c.board.join("',\n '") + "']";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        note('status', 'board copied');
        setTimeout(syncStatus, 1200);
      }, syncStatus);
    }
  }

  // ---------------------------------------------------------------------------
  // wiring
  // ---------------------------------------------------------------------------
  function bind() {
    el('bPrev').addEventListener('click', function () { go(-1); });
    el('bNext').addEventListener('click', function () { go(1); });
    el('bRestart').addEventListener('click', restart);
    el('bUndo').addEventListener('click', undo);
    el('bSolution').addEventListener('click', function () {
      solutionShown = !solutionShown; syncStatus();
    });
    el('bPlay').addEventListener('click', playSolution);
    el('bCopy').addEventListener('click', copyBoard);
    el('bExport').addEventListener('click', exportReviews);
    el('bCopyReviews').addEventListener('click', copyReviews);
    el('bImport').addEventListener('click', function () { el('importFile').click(); });
    el('importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) importReviews(this.files[0]);
      this.value = '';
    });
    el('bClear').addEventListener('click', function () {
      if (!window.confirm('Delete every review stored in this browser?')) return;
      reviews = {};
      save(); apply();
    });

    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'j') { e.preventDefault(); go(1); }
      else if (e.key === 'k') { e.preventDefault(); go(-1); }
      else if (e.key === 'r') { e.preventDefault(); restart(); }
      else if (e.key === 'u') { e.preventDefault(); undo(); }
    });

    // The same input layer the game uses, so a swipe here is the swipe there.
    new INPUT.Input(el('board'), {
      commit: function (dir) { move(dir); },
      aim: function (dir, mag) {
        renderer.aimDir = dir;
        renderer.aimAmount = dir ? (mag == null ? 1 : mag) : 0;
      },
      tap: function () {}
    });

    window.addEventListener('resize', function () { if (stage) renderer.layout(); });
  }

  function loop(now) {
    renderer.frame(16, now);
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // boot
  // ---------------------------------------------------------------------------
  renderer = new R.Renderer(el('board'));
  bind();
  requestAnimationFrame(loop);

  fetch(INDEX_URL).then(function (res) {
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.json();
  }).then(function (json) {
    data = json;
    pool = json.candidates || [];
    note('poolNote', pool.length + ' candidates · ' +
      Object.keys(json.buckets || {}).length + ' buckets · from ' +
      (json.counts ? json.counts.measured.toLocaleString() + ' boards measured' : 'an unknown pass'));
    apply();
  }).catch(function (err) {
    note('poolNote', 'could not load ' + INDEX_URL + ' (' + err.message + ')');
    note('status', 'Run  node tools/fun-search.js  first, then serve the project with ' +
      'node tools/serve.js and open this page through the server.');
  });

})();
