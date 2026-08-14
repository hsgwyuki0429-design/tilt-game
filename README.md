# TILT

**重力を操り、ひらめきで答えを見つけるパズル。**
You never move the blocks. You move the world.

A gravity puzzle for phones. Swipe (or tilt the device) to change which way gravity
pulls; every block slides as far as it can. A block that reaches a goal is collected —
mid-slide, which is where the chain reactions come from. Clear a stage by collecting
every block.

No build step, no dependencies, no network. Open `index.html` and play.

```
node tools/serve.js        # then open the printed LAN address on a phone
```

---

## The rules, in full

1. The board is a grid of **floor** and **wall** cells. Some floor cells are **goals**.
2. Every **block** is the same block: one cell, no colour, no special case.
3. Tilting sends gravity one of four ways. Every block slides until something stops it —
   the edge, a wall, or another block.
4. A block that arrives on a goal is **collected** and leaves. This resolves *during* the
   slide, so a collected block frees the one queued behind it.
5. **CLEAR** when every block has been collected.

That is the whole thing, and there is no sixth rule coming.

**Nothing here can go wrong.** No cell is forbidden. Nothing destroys a block. There is no
failure state to learn, no hazard to memorise, no colour to match. You cannot lose — you
can only take more moves than you needed to, which is what makes undo something to use
rather than something to avoid.

`tools/audit.js` enforces the vocabulary: a board may contain the characters `.` `#` `o`
`@` and nothing else, and a stage may carry no field the rules do not have. Reintroduce a
hazard cell or a coloured goal and the test suite fails before anyone plays it.

## What the stages are for

The point of a stage is not that it is long. It is:

> obvious → try it → wrong → look again → oh. **OH.** → it all falls in

An earlier version of this campaign searched for the *longest* solution it could find and
shipped whatever came back. That was the wrong target, and it produced exactly what you
would expect: twenty-eight move boards with one line through them, which the player does
not solve so much as feel their way along. Being right at the end of a corridor feels like
nothing, because there was never a moment of seeing.

So length is now a **requirement** of each slot and never the thing being optimised. What
the search optimises is the shape of the thinking:

| Measured | What it means |
|---|---|
| **retreat** | tilts on the optimal line that move blocks *away* from the goal. A board with none can be solved by always heading for the exit. A board with several cannot be solved without the "wrong way first" realisation. |
| **traps** | how many opening tilts fail to make progress. Three of four means the first move is a decision, not a formality. |
| **greedy** | what happens to the player who is not thinking yet — the one who always tilts toward the goal. On the good boards they walk in a circle forever. |
| **set-up** | tilts spent arranging before *anything* is collected. |
| **finale** | blocks collected by the last tilt — the payoff landing all at once. |
| **pieces** | taxed, always. The board has to *look* simple or none of the above lands. |

Each stage in `src/stages.js` carries the numbers that chose it, so the data file explains
its own contents.

## How the boards are found

Boards that need twenty or fifty tilts are a vanishing fraction of random layouts, but
they sit a short walk from ordinary ones — nudge one wall and a six-move board becomes a
nine-move board. So boards are not sampled, they are **climbed**: throw down a random
board on a **fixed** element budget, then move ONE element at a time until the shortest
solution lands inside the slot's target band. The budget never grows during a climb, so
what comes out is not a busier board. It is the same handful of pieces arranged until they
finally have something to say.

A board ships only if **all** of the following hold:

| Gate | Meaning |
|---|---|
| solvable | breadth-first search finds a solution at all |
| par in band | its shortest solution is the length the slot wants |
| not pre-solved | the board does not begin cleared |
| low luck | random par-length tilting essentially never clears it |
| not jammable | **no** reachable position is unsolvable — exploring can never ruin a board |
| produces the feeling | it meets that slot's retreat / traps / greedy / set-up requirement |
| **no inert elements** | delete any wall, block or goal and the puzzle measurably changes |
| **elements carry length** | a fixed share of them change the solution *length* when deleted |
| distinct | not a rotation or reflection of any other stage |

That last pair is the one that matters most, and the second half of it is newer. On a
nine-cell board almost every wall changes the solution length, so "no inert elements" is a
real standard. On a twenty-five cell board with twelve blocks there are hundreds of
optimal lines, the count moves if you breathe on it, and "no inert elements" quietly
becomes free. Requiring a fixed share of elements to change the *length* keeps the
standard honest at both sizes.

Because every block is identical, two positions that differ only by swapping blocks *are*
the same position, and the solver says so. That is not an optimisation — it is what "all
blocks are the same" means, and it is why the par printed on screen is the real one.

## The campaign

**Twenty stages, all of which are worth playing** — rather than a hundred that are mostly
filler. Chapter 1 is hand-authored, because teaching is not a search problem: five boards,
five ideas, in the order they have to arrive. Chapters 2–4 are searched per slot against
the brief above.

Boards stay small on purpose. Nothing exceeds 5×5, and the twenty-move stages are 4×3.
Length comes from **density**: more blocks in a small space get in each other's way, and
the order you unpack them in is the puzzle. A big board with a long route is not the same
thing and is not as good.

| Ch | Name | Stages | Par | Board | What it is |
|---|---|---|---|---|---|
| 1 | GRAVITY · 重力 | 1–5 | 2–6 | 3×3 | gravity, walls, blocks blocking blocks, and the way out not being the way you face |
| 2 | NINE · 九マス | 6–10 | 7–13 | 3×3 | nine cells, and none of them solvable at a glance |
| 3 | ORDER · 順番 | 11–15 | 14–24 | 4×3–4×4 | enough blocks that the question becomes "which one, first" |
| 4 | CONVERGENCE · 収束 | 16–20 | 28–50 | 4×4–5×5 | one goal, no slack left anywhere on the board |

Par is a target, not a requirement. Clearing in more moves is a normal clear, and your best
is kept so you can come back and shave it down.

## Playing

- **Swipe** anywhere on the board. The direction you are aiming at lights up on the board
  edge *before* you release, so a mis-swipe is something you see rather than something that
  happens to you.
- **Tilt** the device, if you enable it. A tilt must be held briefly before it commits and
  must return to centre before it fires again. Swipe alone plays the whole game.
- **Arrow keys / WASD** on a desktop. `Z` undo, `R` restart, `Esc` stage list.
- **UNDO** costs nothing and is meant to be used. Nothing can be destroyed and no stage can
  be jammed, so undo always gets you all the way back — trying a move to see what happens
  is the intended way to play.
- **You are never walled off.** Stages unlock in sequence, but you may always reach two
  stages past your frontier — one puzzle you cannot see the trick to never ends the run.

## Layout

```
index.html            markup and script order
styles.css            interface
src/engine.js         pure rules: compile, simulate, solve. No DOM, no timers.
src/stages.js         GENERATED — the boards, one ASCII picture each
src/render.js         canvas renderer and effects
src/input.js          swipe, device tilt, keyboard
src/audio.js          synthesised sound — no asset files
src/save.js           localStorage, defensively parsed
src/game.js           state machine, HUD, overlays
tools/campaign.js     the campaign design, slot by slot; regenerates src/stages.js
tools/lib/boards.js   generation, hill-climbing, and every measurement above
tools/audit.js        stage verification and the element-deletion test
tools/forge.js        interactive board search
tools/probe.js        prints a stage's solution as an ASCII filmstrip
tools/qa.js           drives the real page in a real browser
tools/serve.js        static server for playing on a phone
```

`engine.js` and `stages.js` load both as browser globals and as CommonJS modules, so the
solver and the tests exercise the exact code the player runs — there is no second
implementation of the rules to drift out of sync.

## Tests

```
npm run audit      # every stage: par, solvability, physics invariants, no inert elements
npm run qa         # real browser: plays every stage, then UI, undo, layout, touch, tilt, save
npm test           # both
npm run campaign   # rebuild src/stages.js from tools/campaign.js
```

`audit` walks each stage's reachable state space checking that blocks never overlap, never
enter walls, never leave the board and never sit on a goal instead of being collected —
**including at every intermediate animation tick** — that the same input always produces
the same result, that undo and restart restore state exactly, and that a tilt which changes
nothing never costs a move. It also proves the rules did not grow: any board character
outside `.#o@`, or any stage field outside the five the rules define, is a failure.

Counting is done as a layered breadth-first sweep rather than a recursive descent, because
at fifty moves a descent is 4⁵⁰ sequences and the state space is a few thousand nodes. The
auditor writes its own sweep rather than calling the generator's — an auditor that shares
arithmetic with the thing it audits cannot catch that arithmetic being wrong.

`qa` drives a mobile-sized Chromium: plays **every** stage through the real keyboard and
touch paths, then checks undo/restart, input hammering, the stage menu, the unlock window,
reload persistence, corrupted-save recovery, and the device-tilt handler's mapping,
debounce and re-arm. It also verifies what the rules promise — that no reachable position
anywhere ever loses a block.

## Inspecting a stage

```
node tools/probe.js "" 5
```

prints the board, its solution as a filmstrip, and a verdict on every element:

```
#5 LAP  3×3   par 6   ways 1   luck 0.024%   states 16   dead 0   set-up 3   chain 1

  start   L       D       R       U       R       U
  @▓o     @▓o     ·▓o     ·▓o     ·▓o     ·▓o     ·▓o
  ···     ···     @··     ··@     ·@·     ··@     ···
  ·@▓     @·▓     @·▓     ·@▓     ··▓     ··▓     ··▓

    reshapes      block 0,0   (par 6→3)
    reshapes      wall  1,0   (par 6→2)
    load-bearing  goal  2,0   (removing it leaves no board at all)
    reshapes      block 1,2   (par 6→5)
    reshapes      wall  2,2   (par 6→4)
```

Five elements, five different puzzles if you take any one away. `luck` is the share of
random par-length tilt sequences that happen to clear the stage. `set-up` is how many tilts
run before the first block is collected.

## Rebuilding the campaign

```
node tools/campaign.js --fresh --workers 5
```

Searches every generated slot from scratch and rewrites `src/stages.js`. Results are cached
per slot under `tools/.campaign-cache/`, so re-running without `--fresh` only redoes
selection and emission, and `--only 17` re-searches a single stage.

Editing a slot's par band, element budget or `want` and re-running is the intended way to
change the campaign — `src/stages.js` is an artifact, not a source file. Every `want` in
that file was set from a measured sample of what boards of that length actually look like;
asking a slot for more than its population contains is how a search runs forever and finds
nothing.

To make the game harder, raise a par band or ask for more retreat. Do not add a fifth
thing.
