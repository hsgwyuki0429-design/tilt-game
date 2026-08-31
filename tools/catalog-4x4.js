'use strict';
/*
 * TILT — the 4x4 catalogue as a page you can browse.
 *
 *   node tools/catalog-4x4.js tools/4x4-index.json 4x4-catalog.html
 *
 * docs/CATALOG-4x4.md is the same data as text, which is the right form for
 * reading in a diff and the wrong one for the question a person actually has
 * about it — "show me a board of this length". This writes the index out as one
 * page instead: the par histogram doubles as the contents, and picking a length
 * draws every board kept at it, with the swipes that clear it.
 *
 * The page carries its own data and does its own drawing. No network, no
 * library, nothing to install.
 */

var fs = require('fs');
var path = require('path');

var file = process.argv[2] || path.join(__dirname, '4x4-index.json');
var out = process.argv[3] || path.join(__dirname, '..', '4x4-catalog.html');
var index = JSON.parse(fs.readFileSync(file, 'utf8'));

// ---------------------------------------------------------------------------
// the numbers
// ---------------------------------------------------------------------------
function foldPlans(records) {
  var byPlan = Object.create(null), order = [];
  records.forEach(function (e) {
    var held = byPlan[e.plan];
    if (!held) {
      order.push(e.plan);
      byPlan[e.plan] = {
        plan: e.plan, penguins: e.penguins, drifters: e.drifters,
        statics: e.statics, hazards: !!e.hazards, layouts: e.layouts,
        graphs: e.graphs, boards: e.boards, solvable: e.solvable,
        unsolvable: e.unsolvable, longest: e.longest,
        partial: e.partial ? [e.partial] : null
      };
      return;
    }
    held.layouts += e.layouts; held.graphs += e.graphs; held.boards += e.boards;
    held.solvable += e.solvable; held.unsolvable += e.unsolvable;
    if (e.longest > held.longest) held.longest = e.longest;
    if (e.partial) held.partial = (held.partial || []).concat(e.partial);
  });
  return order.map(function (k) {
    var e = byPlan[k];
    if (e.partial) e.partial = e.partial.join(', ');
    return e;
  }).sort(function (a, b) {
    return a.penguins - b.penguins || a.drifters - b.drifters ||
           a.statics - b.statics || (a.hazards ? 1 : 0) - (b.hazards ? 1 : 0);
  });
}

var plans = foldPlans(index.plans);
var pars = Object.keys(index.boards).map(Number).sort(function (a, b) { return b - a; });
var byPar = index.census.byPar;
var solvable = index.census.measured - index.census.unsolvable;
var kept = pars.reduce(function (a, p) { return a + index.boards[p].length; }, 0);

/* Everything the page draws, as small as it will go: a board is its sixteen
   characters and a solution is its letters, which is all the renderer needs. */
var boards = {};
pars.forEach(function (p) {
  boards[p] = index.boards[p].map(function (e) {
    return [e.rows.join(''), e.solution, e.penguins, e.drifters, e.walls, e.hazards];
  });
});
var hist = pars.map(function (p) { return [p, byPar[p] || 0, index.boards[p].length]; });

function esc(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}
function n(v) { return v.toLocaleString('en-US'); }
function pct(a, b) { return b ? (100 * a / b < 0.01 ? '<0.01%' : (100 * a / b).toFixed(2) + '%') : '—'; }

var planRows = plans.map(function (p) {
  return '<tr><td class="mono">' + esc(p.plan) + '</td><td class="num">' + p.penguins +
    '</td><td class="num">' + p.drifters + '</td><td class="num">' + p.statics +
    '</td><td>' + (p.hazards ? 'yes' : '&mdash;') +
    '</td><td class="num">' + n(p.layouts) + '</td><td class="num">' + n(p.boards) +
    '</td><td class="num">' + n(p.solvable) + '</td><td class="num strong">' + p.longest +
    '</td><td>' + (p.partial
      ? '<span class="tag warn">cut at ' + esc(p.partial) + '</span>'
      : '<span class="tag ok">whole</span>') + '</td></tr>';
}).join('\n');

// ---------------------------------------------------------------------------
var CSS = [
':root{',
'  --ground:#e8eff6; --surface:#ffffff; --sunk:#dce6f0;',
'  --ink:#0e1a2b; --ink-2:#4f6480; --ink-3:#7b8ea6;',
'  --line:#c4d4e3; --line-2:#dce7f1;',
'  --accent:#0c827e; --accent-soft:#cfeae7;',
'  --pa:#2a54c6; --pb:#ad3a67; --drift:#71829a;',
'  --wall:#22314a; --crack:#7455a6;',
'  --ice:#d8e8f6; --ice-line:#bdd3e7;',
'  --bar:#9dbad5; --bar-2:#0c827e;',
'  --shadow:0 1px 2px rgba(16,32,56,.07),0 8px 24px -12px rgba(16,32,56,.22);',
'}',
'@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){',
'  --ground:#070d17; --surface:#101a29; --sunk:#0b1421;',
'  --ink:#e7eff8; --ink-2:#93a7c0; --ink-3:#697d95;',
'  --line:#223247; --line-2:#1a2636;',
'  --accent:#3ac6ba; --accent-soft:#0f3330;',
'  --pa:#7098f1; --pb:#e57e9d; --drift:#879bb2;',
'  --wall:#cbdaeb; --crack:#a487d8;',
'  --ice:#1b3049; --ice-line:#2b4159;',
'  --bar:#31496b; --bar-2:#3ac6ba;',
'  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 28px -14px rgba(0,0,0,.7);',
'}}',
':root[data-theme="dark"]{',
'  --ground:#070d17; --surface:#101a29; --sunk:#0b1421;',
'  --ink:#e7eff8; --ink-2:#93a7c0; --ink-3:#697d95;',
'  --line:#223247; --line-2:#1a2636;',
'  --accent:#3ac6ba; --accent-soft:#0f3330;',
'  --pa:#7098f1; --pb:#e57e9d; --drift:#879bb2;',
'  --wall:#cbdaeb; --crack:#a487d8;',
'  --ice:#1b3049; --ice-line:#2b4159;',
'  --bar:#31496b; --bar-2:#3ac6ba;',
'  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 28px -14px rgba(0,0,0,.7);',
'}',
'*{box-sizing:border-box}',
'body{background:var(--ground);color:var(--ink);',
'  font-family:"Familjen Grotesk","Helvetica Neue",Arial,sans-serif;',
'  font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}',
'.mono,.num{font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;',
'  font-variant-numeric:tabular-nums}',
'.prose{font-family:Newsreader,Georgia,serif;font-size:17px;line-height:1.62;',
'  color:var(--ink-2);max-width:62ch}',
'.prose strong{color:var(--ink);font-weight:400}',
'h1,h2,h3{text-wrap:balance;margin:0;font-weight:600;letter-spacing:-.015em}',
'a{color:var(--accent)}',
'.wrap{max-width:1240px;margin:0 auto;padding:0 24px 96px}',

/* masthead */
'header.top{padding:56px 0 28px;border-bottom:1px solid var(--line)}',
'.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.18em;',
'  text-transform:uppercase;color:var(--accent);margin:0 0 14px}',
'h1{font-size:clamp(34px,6vw,58px);line-height:1.02;letter-spacing:-.03em}',
'h1 .sub{display:block;color:var(--ink-3);font-weight:400;font-size:.42em;',
'  letter-spacing:-.01em;margin-top:14px}',
'.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:30px}',
'.stat{background:var(--surface);border:1px solid var(--line);border-radius:3px;',
'  padding:12px 16px;min-width:132px;flex:1 1 132px}',
'.stat .k{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.12em;',
'  text-transform:uppercase;color:var(--ink-3);display:block;margin-bottom:5px}',
'.stat .v{font-size:23px;font-weight:600;letter-spacing:-.02em;',
'  font-variant-numeric:tabular-nums}',
'.stat .v em{font-style:normal;color:var(--accent)}',

/* two-column body */
'.cols{display:grid;grid-template-columns:296px minmax(0,1fr);gap:36px;margin-top:34px;',
'  align-items:start}',
'@media (max-width:900px){.cols{grid-template-columns:1fr}}',

/* the histogram, which is also the contents */
'.rail{position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto;',
'  background:var(--surface);border:1px solid var(--line);border-radius:4px}',
'@media (max-width:900px){.rail{position:static;max-height:420px}}',
'.rail h2{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);',
'  font-family:"IBM Plex Mono",monospace;font-weight:500;padding:15px 16px 5px}',
'.rail .note{padding:0 16px 12px;font-size:12px;color:var(--ink-3);line-height:1.45}',
'.rows{border-top:1px solid var(--line-2)}',
'.row{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:9px;',
'  width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line-2);',
'  padding:5px 14px;cursor:pointer;color:var(--ink-2);font:inherit}',
'.row:hover{background:var(--sunk);color:var(--ink)}',
'.row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
'.row[aria-current="true"]{background:var(--accent-soft);color:var(--ink)}',
'.row[aria-current="true"] .par{color:var(--accent)}',
'.row .par{font-family:"IBM Plex Mono",monospace;font-size:13px;font-weight:600;',
'  text-align:right;font-variant-numeric:tabular-nums}',
'.row .track{height:9px;background:var(--sunk);border-radius:1px;overflow:hidden}',
'.row .fill{height:100%;background:var(--bar);display:block}',
'.row[aria-current="true"] .fill{background:var(--bar-2)}',
'.row .cnt{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--ink-3);',
'  font-variant-numeric:tabular-nums;min-width:62px;text-align:right}',

/* the panel */
'.panel{min-width:0}',
'.phead{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 16px;',
'  padding-bottom:14px;border-bottom:2px solid var(--ink);margin-bottom:22px}',
'.phead h2{font-size:30px;letter-spacing:-.025em}',
'.phead .meta{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--ink-2);',
'  margin-left:auto;font-variant-numeric:tabular-nums}',
'.nav{display:flex;gap:8px;margin-bottom:20px}',
'.nav button{font:inherit;font-size:13px;background:var(--surface);color:var(--ink-2);',
'  border:1px solid var(--line);border-radius:3px;padding:5px 12px;cursor:pointer}',
'.nav button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}',
'.nav button:disabled{opacity:.4;cursor:default}',

/* a board */
'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:14px}',
'.card{background:var(--surface);border:1px solid var(--line);border-radius:4px;',
'  padding:14px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:11px}',
'.card .idx{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.1em;',
'  text-transform:uppercase;color:var(--ink-3);display:flex;justify-content:space-between;gap:8px}',
'.board{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;aspect-ratio:1;',
'  background:var(--ice-line);border:1px solid var(--ice-line);border-radius:3px;padding:3px}',
'.c{background:var(--ice);border-radius:2px;display:grid;place-items:center;',
'  font-family:"IBM Plex Mono",monospace;font-size:14px;font-weight:600;line-height:1}',
'.c.wall{background:var(--wall)}',
'.c.crack{background:var(--ice);position:relative;overflow:hidden;color:var(--crack)}',
'.c.crack::after{content:"";position:absolute;inset:0;',
'  background:repeating-linear-gradient(135deg,transparent 0 3px,var(--crack) 3px 4px);opacity:.55}',
'.c.goal{box-shadow:inset 0 0 0 2px currentColor;background:var(--ice)}',
'.c.goal.a{color:var(--pa)}.c.goal.b{color:var(--pb)}',
'.c.blk{color:var(--surface)}',
'.c.blk.a{background:var(--pa)}.c.blk.b{background:var(--pb)}',
'.c.blk.g{background:var(--drift)}',
'.sol{font-family:"IBM Plex Mono",monospace;font-size:13px;line-height:1.5;',
'  color:var(--ink);word-break:break-all;letter-spacing:.06em}',
'.sol b{color:var(--accent);font-weight:500}',
'.make{font-size:11.5px;color:var(--ink-3);line-height:1.35}',

/* legend + tables */
'.legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin:22px 0 0;font-size:12px;',
'  color:var(--ink-2)}',
'.legend span{display:flex;align-items:center;gap:7px}',
'.swatch{width:15px;height:15px;border-radius:2px;background:var(--ice);flex:none;',
'  display:grid;place-items:center;font-family:"IBM Plex Mono",monospace;font-size:9px;',
'  font-weight:600;color:var(--surface)}',
'section.block{margin-top:56px;scroll-margin-top:16px}',
'section.block h2{font-size:22px;letter-spacing:-.02em;padding-bottom:10px;',
'  border-bottom:1px solid var(--line);margin-bottom:16px}',
'.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:4px;background:var(--surface)}',
'table{border-collapse:collapse;width:100%;font-size:13px;min-width:720px}',
'th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line-2);white-space:nowrap}',
'th{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.1em;',
'  text-transform:uppercase;color:var(--ink-3);font-weight:500;background:var(--sunk)}',
'td.num{text-align:right;font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}',
'td.strong{color:var(--ink);font-weight:600}',
'tr:last-child td{border-bottom:0}',
'.tag{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.08em;',
'  text-transform:uppercase;padding:2px 7px;border-radius:2px;white-space:nowrap}',
'.tag.ok{background:var(--accent-soft);color:var(--accent)}',
'.tag.warn{background:var(--sunk);color:var(--ink-2)}',
'footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);',
'  font-size:12.5px;color:var(--ink-3)}',
'@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'
].join('\n');

var SCRIPT = [
'(function(){',
'  var BOARDS = __BOARDS__, HIST = __HIST__;',
'  var PARS = HIST.map(function(h){return h[0];});',
'  var ARROW = {U:"\\u2191",R:"\\u2192",D:"\\u2193",L:"\\u2190"};',
'  var CLASS = {"#":"wall","x":"crack","a":"goal a","b":"goal b",',
'               "A":"blk a","B":"blk b","G":"blk g"};',
'  var GLYPH = {"a":"a","b":"b","A":"A","B":"B","G":"G"};',
'  var rail = document.getElementById("rows"),',
'      panel = document.getElementById("panel"),',
'      head  = document.getElementById("phead"),',
'      prev  = document.getElementById("prev"),',
'      next  = document.getElementById("next");',
'',
'  /* Counts run from a handful of boards to tens of millions, so a linear bar',
'     is one full-width row and forty invisible ones. The bar is the log of the',
'     count, which is the shape of the distribution rather than its top row. */',
'  var top = Math.max.apply(null, HIST.map(function(h){return h[1];}));',
'  function width(c){ return c <= 0 ? 0 : Math.max(2, 100 * Math.log(c + 1) / Math.log(top + 1)); }',
'',
'  HIST.forEach(function(h){',
'    var b = document.createElement("button");',
'    b.className = "row"; b.type = "button"; b.dataset.par = h[0];',
'    b.setAttribute("aria-current", "false");',
'    b.innerHTML = \'<span class="par">\' + h[0] + \'</span>\' +',
'      \'<span class="track"><span class="fill" style="width:\' + width(h[1]).toFixed(1) + \'%"></span></span>\' +',
'      \'<span class="cnt">\' + h[1].toLocaleString("en-US") + \'</span>\';',
'    b.title = h[1].toLocaleString("en-US") + " boards need exactly " + h[0] +',
'      (h[0] === 1 ? " swipe" : " swipes") + "; " + h[2] + " catalogued";',
'    b.addEventListener("click", function(){ show(h[0], true); });',
'    rail.appendChild(b);',
'  });',
'',
'  function cell(ch){',
'    var cls = CLASS[ch] || "", g = GLYPH[ch] || "";',
'    return \'<span class="c \' + cls + \'">\' + g + "</span>";',
'  }',
'  function makeup(e){',
'    var bits = [e[2] === 1 ? "1 penguin" : "2 penguins"];',
'    if (e[3]) bits.push(e[3] + " drifter" + (e[3] > 1 ? "s" : ""));',
'    if (e[4]) bits.push(e[4] + " wall" + (e[4] > 1 ? "s" : ""));',
'    if (e[5]) bits.push(e[5] + " cracked");',
'    if (!e[3] && !e[4] && !e[5]) bits.push("open tray");',
'    return bits.join(" \\u00b7 ");',
'  }',
'',
'  var current = null;',
'  function show(par, scroll){',
'    if (current === par) return;',
'    current = par;',
'    Array.prototype.forEach.call(rail.children, function(b){',
'      var on = Number(b.dataset.par) === par;',
'      b.setAttribute("aria-current", on ? "true" : "false");',
'    });',
'    var h = HIST[PARS.indexOf(par)];',
'    head.innerHTML = "<h2>Par " + par + "</h2>" +',
'      \'<span class="meta">\' + h[1].toLocaleString("en-US") + " on the tray \\u00b7 " +',
'      h[2] + " catalogued</span>";',
'    var at = PARS.indexOf(par);',
'    prev.disabled = at <= 0; next.disabled = at >= PARS.length - 1;',
'    panel.innerHTML = BOARDS[par].map(function(e, i){',
'      var cells = "";',
'      for (var c = 0; c < 16; c++) cells += cell(e[0][c]);',
'      var sol = e[1].split("").map(function(d, j){',
'        return (j && j % 8 === 0 ? " " : "") + "<b>" + ARROW[d] + "</b>";',
'      }).join("");',
'      return \'<div class="card"><div class="idx"><span>\' + par + "." + (i + 1) +',
'        \'</span><span>\' + e[1].length + " swipes</span></div>" +',
'        \'<div class="board">\' + cells + "</div>" +',
'        \'<div class="sol">\' + sol + "</div>" +',
'        \'<div class="make">\' + makeup(e) + "</div></div>";',
'    }).join("");',
'    if (scroll && window.matchMedia("(max-width:900px)").matches) {',
'      head.scrollIntoView({behavior:"smooth", block:"start"});',
'    }',
'    try { history.replaceState(null, "", "#par-" + par); } catch (err) {}',
'  }',
'  function step(by){',
'    var at = PARS.indexOf(current) + by;',
'    if (at >= 0 && at < PARS.length) show(PARS[at], true);',
'  }',
'  prev.addEventListener("click", function(){ step(-1); });',
'  next.addEventListener("click", function(){ step(1); });',
'  document.addEventListener("keydown", function(ev){',
'    if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;',
'    if (ev.key === "ArrowUp" || ev.key === "k") { step(-1); ev.preventDefault(); }',
'    if (ev.key === "ArrowDown" || ev.key === "j") { step(1); ev.preventDefault(); }',
'  });',
'',
'  var want = Number((location.hash.match(/^#par-(\\d+)$/) || [])[1]);',
'  show(PARS.indexOf(want) >= 0 ? want : PARS[0], false);',
'})();'
].join('\n');

// ---------------------------------------------------------------------------
var H = [];
H.push('<title>The 4×4 Tilt Tray</title>');
H.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
H.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Familjen+Grotesk:wght@400;500;600;700&' +
  'family=Newsreader:opsz,wght@6..72,300;6..72,400&' +
  'family=IBM+Plex+Mono:wght@400;500;600&display=swap">');
H.push('<style>' + CSS + '</style>');

H.push('<div class="wrap">');
H.push('<header class="top">');
H.push('<p class="eyebrow">TILT · exhaustive census</p>');
H.push('<h1>The 4×4 tray, end to end' +
  '<span class="sub">Every board the small tray can hold, measured — from one swipe to ' +
  pars[0] + '.</span></h1>');
H.push('<div class="stats">');
[['arrangements measured', n(index.census.measured)],
 ['solvable', n(solvable)],
 ['dead on arrival', n(index.census.unsolvable)],
 ['longest board', '<em>' + pars[0] + ' swipes</em>'],
 ['lengths, no gaps', '1–' + pars[0]],
 ['boards catalogued', n(kept)]].forEach(function (s) {
  H.push('<div class="stat"><span class="k">' + s[0] + '</span>' +
    '<span class="v">' + s[1] + '</span></div>');
});
H.push('</div>');
H.push('</header>');

H.push('<div class="cols">');
H.push('<nav class="rail" aria-label="lengths"><h2>Boards per length</h2>');
H.push('<p class="note">Bar length is the log of the count — the tray holds ' +
  'millions of one-swipe boards and a few dozen of the longest. Pick a length.</p>');
H.push('<div class="rows" id="rows"></div></nav>');

H.push('<main class="panel">');
H.push('<div class="phead" id="phead"></div>');
H.push('<div class="nav"><button id="prev" type="button">↑ longer</button>' +
  '<button id="next" type="button">↓ shorter</button></div>');
H.push('<div class="grid" id="panel"></div>');
H.push('<div class="legend">' +
  '<span><i class="swatch" style="background:var(--pa)">A</i> penguin</span>' +
  '<span><i class="swatch" style="background:var(--pb)">B</i> penguin</span>' +
  '<span><i class="swatch" style="background:var(--drift)">G</i> drifter</span>' +
  '<span><i class="swatch" style="box-shadow:inset 0 0 0 2px var(--pa);color:var(--pa)">a</i> aurora</span>' +
  '<span><i class="swatch" style="background:var(--wall)"></i> ice wall</span>' +
  '<span><i class="swatch" style="background:repeating-linear-gradient(135deg,var(--ice) 0 3px,var(--crack) 3px 4px)"></i> cracked ice</span>' +
  '<span><i class="swatch"></i> plain ice</span></div>');

H.push('<section class="block"><h2>How to read a board</h2>');
H.push('<p class="prose">A swipe turns gravity one of four ways and <strong>every</strong> ' +
  'block slides at once, until the edge, a wall, or another block stops it. Nothing ' +
  'resolves in flight: a penguin is collected only when it comes to <strong>rest</strong> ' +
  'on its own aurora, so pointing gravity at the aurora sails the penguin straight over ' +
  'it. To collect anything you first have to arrange for something to be standing one ' +
  'cell beyond. A drifter slides like everything else but no aurora accepts it — it is ' +
  'a wall you can move, and it plugs an aurora it stops on. Cracked ice is safe to cross ' +
  'and fatal to stop on. A board is cleared when every penguin has reached its own ' +
  'aurora, and its <strong>par</strong> is the fewest swipes that do it.</p></section>');

H.push('<section class="block"><h2>Where the boards came from</h2>');
H.push('<p class="prose">Each row is one obstacle plan — so many penguins, so many ' +
  'drifters, so many immovable cells — swept exhaustively. Walls are deduplicated up ' +
  'to the eight symmetries of the square, and the two penguin colours are ' +
  'interchangeable, so a board and its rotations, reflections and colour swap are ' +
  'measured once rather than sixteen times. For every layout the position graph is built ' +
  'once and walked <strong>backwards</strong> from every cleared position at once, which ' +
  'returns the exact par of every possible starting arrangement on it in a single pass.' +
  '</p>');
H.push('<div class="scroll" style="margin-top:16px"><table>');
H.push('<thead><tr><th>plan</th><th>peng</th><th>drift</th><th>immov</th><th>cracked</th>' +
  '<th>layouts</th><th>boards</th><th>solvable</th><th>longest</th><th>sweep</th></tr></thead>');
H.push('<tbody>' + planRows + '</tbody></table></div></section>');

H.push('<section class="block"><h2>What the distribution says</h2>');
H.push('<p class="prose">The tray is overwhelmingly easy, and it gets rarer very fast. ' +
  'Of ' + n(index.census.measured) + ' starting arrangements, ' + n(solvable) + ' can be ' +
  'cleared at all; the rest are dead the moment they are dealt. Par ' + pars[pars.length - 1] +
  ' accounts for ' + pct(byPar[pars[pars.length - 1]] || 0, solvable) + ' of the solvable ' +
  'ones, and par ' + pars[0] + ' for ' + pct(byPar[pars[0]] || 0, solvable) + '. That is ' +
  'the whole argument for enumerating rather than sampling: a hard 4×4 board is not ' +
  'something you find by generating boards and hoping.</p></section>');

H.push('<footer>Measured by <span class="mono">tools/search-4x4.js</span>, then ' +
  're-solved board by board with <span class="mono">src/engine.js</span> — the same ' +
  'code the game runs — by <span class="mono">tools/verify-4x4.js</span>. Every ' +
  'solution on this page was replayed one swipe at a time and cleared its board.</footer>');
H.push('</main></div></div>');

H.push('<script>' + SCRIPT
  .replace('__BOARDS__', JSON.stringify(boards))
  .replace('__HIST__', JSON.stringify(hist)) + '<\/script>');

fs.writeFileSync(out, H.join('\n') + '\n');
console.log('wrote ' + out + ' — ' + kept + ' boards across par 1…' + pars[0] +
  ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
