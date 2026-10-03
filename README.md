# TILT

A gravity puzzle on a floating floe of ice. Swipe in one of four directions to change gravity; every cube penguin glides until the edge of the ice — the rim or a hole — or the other penguin stops it.

## Current campaign

100 boards, **all 4×4**, found by searching every 4×4 floe exhaustively. Levels 1–3 have one penguin; levels 4–100 have two. **94 of the 97 pair boards are mutual: each penguin has to stop the other at least once in every solution.** The other three teach the brake with one helper first.

There are no walls. A cell with no ice is open water, and the edge of the ice stops a penguin exactly as the outer rim does — the engine's rules are unchanged. The ice of every board is one connected piece that spans the full 4×4 with its centre of mass within half a cell of the centre, so it reads, and sits, as one solid floe.

The order is set by how hard a board is to *find*, not by how long it is. A simulated explorer — it remembers where it has been, leans towards the auroras, grabs collections it is offered, recovers from dead ends and restarts when lost — plays every shortlisted board 600 times, and the campaign climbs its cost geometrically from 2 to 186 swipes while par wanders between 2 and 13. A long board of obvious moves comes early; a short board that needs a penguin parked as a floor for its partner comes late. See [the search report](docs/CAMPAIGN.md).

The game is drawn in real 3D with three.js (WebGL): a thick, bevelled slab of ice floating in a pool of water, rounded cube penguins with faces, beaks, feet and flippers, auroras that glow on the ice, real lights, shadows and reflections. The floe leans in 3D while a swipe is held.

**The ice is made to look like ice.** Looking into it you see fractures and trapped bubbles at several depths, each deeper layer shifted by parallax and bluer, because ice absorbs red first; frosted patches glitter; thin edges glow cyan; the joints between cells are chiselled grooves; the flanks run from pale at the lip to glacier blue and catch caustics under the water; the water has a shelf of turquoise, a broken line of foam and the floe's shadow. See [rendering](docs/RENDERING.md).

**It sounds like ice too.** A slide is a glassy scrape that is bright and loud while the penguin is fast, and sinks in pitch and dulls as it slows. A penguin stopping against another knocks like two ice cubes. All of it is synthesised, with no audio files. See [sound](docs/SOUND.md).

**Two graphics tiers.** *High* draws all of that. *Light* draws the same ice flat, with a smaller shadow map, a lower pixel ratio and fewer particles. Settings has an **Auto / High / Light** picker. *Auto* starts in the tier the device suggests, then watches real frames: if a device cannot keep up it drops to Light once, says so, and remembers for two weeks. It has not been measured on real phones yet.

New campaign scores are stored separately (`tilt.save.floe.v4`). Sound, haptics and reduced-motion preferences carry over; the old progress remains in storage.

## The cracked-ice band (stages 101–160)

Sixty more boards follow the hundred, in chapters 11–16 (THIN ICE to ABYSS). They are bigger, **4×4 up to 6×6**, with two penguins, a floe full of holes, and **cracked ice**: a penguin may slide across a cracked tile but is lost if it comes to rest on one, and the game offers to step back to the last solvable position. Shortest solutions run from 12 to 54 moves, in order. Every board was re-solved on the engine, is fair (an ordinary move never strands the pair), is one connected floe, and has no wall or crack that changes nothing. Nobody has played them yet; see [the report](docs/HAZARD-CAMPAIGN.md) for what was and was not measured.

`src/stages-cracked.js` is loaded after `src/stages.js` and extends `TiltStages` in place, so the base campaign file is untouched and the game needs no special code for the band. Stage ids, chapters, progress and the stage list all treat it as part of one campaign of 160.

## Building the campaign

```sh
npm run levels:search    # every 4×4 floe, every aurora pair, every start (~2 min)
node tools/floe-campaign.js --pool tools/.floe-cache/pool-4x4.json
npm run levels:build     # rebuild src/stages.js from tools/floe-selection.json
```

`tools/floe-search.js` enumerates all 1,051 floe shapes (up to symmetry), 64,323 aurora layouts and 3,992,244 starts, builds each layout's complete position graph once, and measures interaction necessity, fairness, temptations and the explorer's cost. `tools/floe-campaign.js` re-measures a shortlist and chooses the hundred with distinct floes and piece placements. Both are seeded and reproduce the shipped selection exactly.

## Building the cracked-ice band

```sh
node tools/hazard-search.js --minutes 60 --seed 1 --out tools/hazard-pool/w1.json   # one worker; run four
node tools/hazard-merge.js tools/hazard-pool --per 6 --whole-floe                   # re-check on the engine
npm run levels:cracked                                                              # curate 60, write src/stages-cracked.js
node tools/hazard-selftest.js                                                       # search graph vs engine
```

`tools/hazard-pool/` is ignored: the raw pools are 19 MB and can be regenerated. `tools/hazard-shortlist.json` and `tools/hazard-campaign.json` are kept.

## Rebuilding three.js

```sh
npm install
node tools/build-three.mjs   # writes src/vendor/three.js
```

The game itself has no build step: three.js is vendored as one classic script so `index.html` still opens straight off disk.

## Additional research tools (legacy square search)

These tools predate the floe campaign and search wall boards; they do not build
it. An earlier campaign was built by looking for **long** boards. `tools/fun-search.js`
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

That runs the campaign/engine tests (every board re-proved by the engine,
fairness over the full reachable graph, the mutual-interaction claims), the
floe accelerator agreement check, the graphics-quality decisions, the ice's cell
map and distance field, analysis tests, rectangular accelerator
agreement checks, and save migration tests. The analysis tests prove the
analysis agrees with the solver on all hundred stages and a slice of the index,
that it does not care which way up a board is drawn or which colour is called A,
that it spots an idle wall and a penguin used as a brake, that a repeating
solution is penalised, and that no category has drifted into meaning nothing.

Run the WebGL scene, projection, floe geometry (ice under every ice cell,
water under every hole), shadow, penguin model, tilt and 3×3–5×5 responsive
contracts with:

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

The runtime needs nothing but the vendored three.js. Browser QA uses Playwright
only as a development dependency, with SwiftShader WebGL on machines without a
GPU (`tools/lib/browser.js`); game rules still come from the deterministic
engine and solver.
