# TILT

A gravity puzzle set in a soft, crystalline ice world. Swipe in one of four directions to change gravity; every cube penguin glides until a snowy wall or another block stops it.

## Current campaign

100 newly searched levels: **78 on 4×4, 22 on 5×4**, ordered by exact shortest solution from **3 to 31 moves**. Only the introductory level has one penguin; every later level has two. The campaign uses stationary ice walls and matching auroras, with no grey drifters or cracked ice.

The selection favours recoverable choices and cooperation, rather than long corridors. From any reachable solvable position, an ordinary move that collects no penguin cannot create a dead end. Collecting a penguin too early may still remove a brake its partner needs. Every selected two-penguin solution has actual cooperation, multiple useful choices, and at most three consecutive forced moves after excluding the immediate undo direction. Each wall arrangement is distinct under reflection and rotation.

Shortest paths are nondecreasing. The late curve is allowed to follow the available good puzzles rather than padding it to an arbitrary move count. A 37-move candidate was found but rejected because nine final moves were a one-penguin cleanup. No 40-move board was found in this bounded search; this is not a proof that none exists. See [the search report](docs/CAMPAIGN.md).

The Canvas renderer gives the ice tray and penguins visible depth with an elevated frontal view, contact shadows, shallow obstacles, original aurora artwork, and distance-spaced ice shavings during a swipe. Rows stay horizontal and columns stay vertical. Home and gameplay share the renderer and fit phones, landscape and desktop.

New campaign scores are stored separately from the old lineup. Sound, haptics and reduced-motion preferences carry over; the old progress remains in storage.

## Building the campaign

`src/stages.js` is generated from the reviewed, reproducible shortlist in `tools/campaign-selection.json`:

```sh
npm run levels:build
# Fresh seeded searches: width, attempts, output, seed, min walls, max walls
node tools/refresh-search.js 4 50000 pool-4.json 791333 2 5
node tools/refresh-search.js 5 800000 pool-5.json 875390 2 6
node tools/refresh-campaign.js pool-4.json pool-5.json
```

The rectangular search builds the complete two-penguin position graph for each sampled wall/goal layout and runs reverse BFS to prove the minimum length of every start. It does not exhaustively enumerate every layout. It filters ordinary-move traps, then measures useful choices, forced runs, real mutual braking, repetition and the single-penguin tail. The builder reserves scarce long puzzles and different wall layouts while prioritising 4×4. The shipped shortlist combines several runs, so the two example runs alone need not recreate it.

The previous square-only enumerator and builder remain available as legacy research tools; they do not build the current campaign.

## Additional research tools (legacy square search)

The campaign above was built by looking for **long** boards. `tools/fun-search.js`
looks for **good** ones, which is a different search and wants a different
answer — a four-by-four with two penguins and one wall that you have to go
backwards on beats a fifty-move corridor, and nothing in this pipeline scores a
board for being long.

```sh
# sweep both trays, analyse what survives, and shortlist by kind
npm run search:fun

# a four-second smoke run
node tools/fun-search.js --quick

# narrower passes
node tools/fun-search.js --size 4
node tools/fun-search.js --category AHA --min-par 5 --keep 30
node tools/fun-search.js --help
```

It reuses the existing enumeration, backward BFS and solver rather than
replacing them — `tools/level-search.js` is now a library as well as a command —
and adds three things on top:

- `tools/lib/level-analysis.js` measures what a board *asks*: moves that go the
  wrong way on purpose, penguins sliding over their own aurora, one penguin
  braking the other, positions where the choice actually matters, walls that do
  nothing, and how much of the tray is ever used. All exact, all read off the
  engine's own position graph.
- `tools/lib/fun-score.js` turns those counts into estimates — `funPotential`,
  `ahaPotential`, `interactionScore`, `difficultyScore`, `cognitiveLoadScore`
  and the rest — and into a *kind*: AHA, INTERACTION, CHOICE, SEQUENCE,
  PRECISION, ELEGANT, TRAP, ORBIT, HAZARD, MASTER. Every count is divided by par
  first, so length is never a reason to like a board.
- `tools/fun-level-index.json` is the shortlist, filed by kind × difficulty ×
  tray rather than ranked on one number.

The main pool is 4×4 and 5×5, two penguins, walls, and nothing else — no
drifters and no cracked ice, because both add things to keep track of rather
than things to see into. 4×4 is the primary tray and gets the deeper sweep. The
same puzzle on a 4×4 always scores better than on a 5×5.

Then play them:

```sh
node tools/serve.js
# open http://localhost:8080/tools/fun-browser.html
```

The candidate browser runs the shortlist on the game's own engine, renderer and
input, shows every measurement beside the board, and records what you thought —
FUN 1–5, DIFFICULTY 1–5, AHA yes or no, the flags TOO CONFUSING / TOO LINEAR /
UNFAIR, and a verdict of KEEP, MAYBE or REJECT. Verdicts are kept in `localStorage` under
a stable per-board id, so re-running the search does not lose them, and **EXPORT
REVIEWS** writes them out as `tilt-fun-reviews.json` (**COPY** puts the same JSON
on the clipboard, **IMPORT** reads one back).

Nothing here rewrites `src/stages.js` or `tools/level-index.json`. The shipped
hundred stay put as the thing to beat, the measured index is only read, and
turning reviewed candidates into a campaign is a separate step that has not been
built yet — on purpose, so the machine finds boards and a person decides which
are good.

The scores, the kinds, the phases and what is still approximate are all written
up in [docs/FUN-SEARCH.md](docs/FUN-SEARCH.md).

## Checks

Run the logic tests — every board re-solved, the difficulty line verified, and
the board analysis checked against the solver — with:

```sh
npm test
```

That runs the campaign/engine tests, analysis tests, rectangular accelerator
agreement checks, and save migration tests. The analysis tests prove the
analysis agrees with the solver on all hundred stages and a slice of the index,
that it does not care which way up a board is drawn or which colour is called A,
that it spots an idle wall and a penguin used as a brake, that a repeating
solution is penalised, and that no category has drifted into meaning nothing.

Run the projection, six-face texture, depth-order, and 3×3–5×5 responsive
contracts with (this environment needs `CHROME_PATH` pointed at the installed
Chromium):

```sh
npm run test:render
```

Run the penguin expression contracts — every face preloaded, every trigger
fired on a real board, the stale-timer race, and a pixel check that swapping a
face moves nothing — with:

```sh
npm run test:expression
```

Run the complete browser campaign and interaction harness with:

```sh
npm run qa
```

Serve the game locally with:

```sh
npm run serve
```

The runtime is dependency-free. Browser QA uses Playwright only as a development
dependency; game rules still come from the deterministic engine and solver.
