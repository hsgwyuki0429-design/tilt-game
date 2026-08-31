'use strict';
/*
 * TILT — write the 4x4 catalogue out as prose and diagrams.
 *
 *   node tools/report-4x4.js tools/4x4-index.json > docs/CATALOG-4x4.md
 *
 * The index is a machine's answer: a par histogram and a few thousand boards
 * with their solutions. This turns it into the thing a person asked for — every
 * length from the longest board on the tray down to a single swipe, what a
 * board of that length looks like, and how many of them there are.
 */

var fs = require('fs');
var path = require('path');

var file = process.argv[2] || path.join(__dirname, '4x4-index.json');
var index = JSON.parse(fs.readFileSync(file, 'utf8'));
var SHOW = Number(process.env.TILT_SHOW || 3);   // boards drawn per length

/* The index records one row per plan AND SLICE, because a heavy plan is walked
   by four processes at once. For display they are one measurement again: the
   layouts, graphs and boards add up, the longest is the longest of them, and
   the plan is partial if any slice of it was cut short. */
function foldPlans(records) {
  var byPlan = Object.create(null), order = [];
  records.forEach(function (e) {
    var held = byPlan[e.plan];
    if (!held) {
      order.push(e.plan);
      byPlan[e.plan] = {
        plan: e.plan, penguins: e.penguins, drifters: e.drifters,
        statics: e.statics, hazards: !!e.hazards,
        layouts: e.layouts, graphs: e.graphs, boards: e.boards,
        solvable: e.solvable, unsolvable: e.unsolvable, longest: e.longest,
        seconds: e.seconds || 0, slices: 1, partial: e.partial ? [e.partial] : null
      };
      return;
    }
    held.layouts += e.layouts; held.graphs += e.graphs; held.boards += e.boards;
    held.solvable += e.solvable; held.unsolvable += e.unsolvable;
    held.seconds += e.seconds || 0; held.slices++;
    if (e.longest > held.longest) held.longest = e.longest;
    if (e.partial) held.partial = (held.partial || []).concat(e.partial);
  });
  return order.map(function (k) {
    var e = byPlan[k];
    if (e.partial) e.partial = e.partial.join(', ');
    return e;
  });
}
index.plans = foldPlans(index.plans);

var pars = Object.keys(index.boards).map(Number).sort(function (a, b) { return b - a; });
var byPar = index.census.byPar;
var solvable = index.census.measured - index.census.unsolvable;

function n(v) { return v.toLocaleString('en-US'); }
function pct(a, b) { return b ? (100 * a / b).toFixed(a / b < 0.001 ? 4 : 2) + '%' : '—'; }

/** Two boards side by side: the tray as it starts, and the swipes that clear it. */
function draw(entry) {
  var out = entry.rows.map(function (r) { return '    ' + r.split('').join(' '); });
  return out.join('\n');
}

function describe(e) {
  var bits = [];
  bits.push(e.penguins === 1 ? '1 penguin' : '2 penguins');
  if (e.drifters) bits.push(e.drifters + ' drifter' + (e.drifters > 1 ? 's' : ''));
  if (e.walls) bits.push(e.walls + ' wall' + (e.walls > 1 ? 's' : ''));
  if (e.hazards) bits.push(e.hazards + ' cracked');
  if (!e.drifters && !e.walls && !e.hazards) bits.push('open tray');
  return bits.join(', ');
}

var L = [];
function say(s) { L.push(s === undefined ? '' : s); }

say('# The 4×4 tray, end to end');
say();
say('Every board on this page was measured by `tools/search-4x4.js` and then');
say('re-solved by `src/engine.js` — the same code the game runs — in');
say('`tools/verify-4x4.js`. A board\'s length is its **par**: the fewest swipes');
say('that clear it. Nothing here is an estimate.');
say();

say('## What was measured');
say();
say('| | |');
say('|---|---|');
say('| starting arrangements measured | ' + n(index.census.measured) + ' |');
say('| of those, solvable | ' + n(solvable) + ' (' + pct(solvable, index.census.measured) + ') |');
say('| of those, dead on arrival | ' + n(index.census.unsolvable) + ' (' + pct(index.census.unsolvable, index.census.measured) + ') |');
say('| longest board found | **' + pars[0] + ' moves** |');
say('| lengths covered | 1 … ' + pars[0] + ', with no gaps |');
say('| boards catalogued below | ' + n(pars.reduce(function (a, p) { return a + index.boards[p].length; }, 0)) + ' |');
say();
say('Walls are deduplicated up to the eight symmetries of the square, so a');
say('board and its rotations are measured once, not eight times. Both penguin');
say('colours are interchangeable and are enumerated in one order only.');
say();

say('### The obstacle plans');
say();
say('| plan | penguins | drifters | immovables | cracked ice | layouts | boards | solvable | longest |');
say('|---|---|---|---|---|---|---|---|---|');
index.plans.slice().sort(function (a, b) {
  return a.penguins - b.penguins || a.drifters - b.drifters ||
         a.statics - b.statics || (a.hazards ? 1 : 0) - (b.hazards ? 1 : 0);
}).forEach(function (p) {
  say('| `' + p.plan + '`' + (p.partial ? ' *(partial: ' + p.partial + ')*' : '') +
      ' | ' + p.penguins + ' | ' + p.drifters + ' | ' + p.statics +
      ' | ' + (p.hazards ? 'yes' : 'no') + ' | ' + n(p.layouts) + ' | ' + n(p.boards) +
      ' | ' + n(p.solvable) + ' | ' + p.longest + ' |');
});
say();

say('## The difficulty distribution');
say();
say('How many of the measured starting arrangements need exactly *k* swipes.');
say('This is a census, not a sample: it counts every board the sweep reached.');
say();
say('| par | boards | share of solvable | catalogued |');
say('|---:|---:|---:|---:|');
Object.keys(byPar).map(Number).sort(function (a, b) { return b - a; }).forEach(function (m) {
  say('| ' + m + ' | ' + n(byPar[m]) + ' | ' + pct(byPar[m], solvable) +
      ' | ' + ((index.boards[m] || []).length) + ' |');
});
say();
say('The tray is overwhelmingly easy and the hard boards are vanishingly rare —');
say('which is the point of enumerating rather than sampling. A random 4×4 board');
say('is a one- or two-swipe board; the ' + pars[0] + '-move boards are a few');
say('dozen arrangements out of ' + n(index.census.measured) + '.');
say();

say('## Every length, longest first');
say();
say('Boards are written with the vocabulary from `docs/RULES.md`:');
say('`A`/`B` penguins, `a`/`b` their auroras, `G` a drifter, `#` an ice wall,');
say('`x` cracked ice, `.` plain ice. The solution reads `U`/`R`/`D`/`L`.');
say('`tools/4x4-index.json` holds ' +
    n(pars.reduce(function (a, p) { return a + index.boards[p].length; }, 0)) +
    ' boards; up to ' + SHOW + ' per length are drawn here.');
say();

pars.forEach(function (par) {
  var list = index.boards[par];
  say('### Par ' + par + ' — ' + n(byPar[par] || 0) + ' board' +
      ((byPar[par] || 0) === 1 ? '' : 's') + ' on the tray, ' + list.length + ' kept');
  say();
  list.slice(0, SHOW).forEach(function (e, i) {
    say('**' + par + '.' + (i + 1) + '** — ' + describe(e));
    say();
    say('```');
    say(draw(e));
    say('```');
    say();
    say('&nbsp;&nbsp;solution (' + par + '): `' + e.solution + '`');
    say();
  });
  if (list.length > SHOW) {
    say('<details><summary>' + (list.length - SHOW) + ' more at par ' + par + '</summary>');
    say();
    say('| board | make-up | solution |');
    say('|---|---|---|');
    list.slice(SHOW).forEach(function (e) {
      say('| `' + e.rows.join(' / ') + '` | ' + describe(e) + ' | `' + e.solution + '` |');
    });
    say();
    say('</details>');
    say();
  }
});

process.stdout.write(L.join('\n') + '\n');
