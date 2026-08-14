# TILT

**重力を操り、盤面の未来を読むパズル。100ステージ。**
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

That is the whole thing. Five lines, and there is no sixth coming.

**Nothing here can go wrong.** No cell is forbidden. Nothing destroys a block. There is
no failure state to learn, no hazard to memorise, no colour to match. You cannot lose —
you can only take more moves than you needed to.

That is a deliberate constraint, not an omission. Everything the late game does —
ordering puzzles, blocks used as walls, routes that go the wrong way first, twenty-eight
tilts on a board of twelve pieces — falls out of the geometry of those five lines. If a
stage were not interesting, the answer would be a better arrangement of walls, blocks and
goals, never a fourth kind of thing.

`tools/audit.js` enforces this. A board may contain the characters `.` `#` `o` `@` and
nothing else, and a stage may carry no field the rules do not have. Reintroduce a hazard
cell or a coloured goal and the test suite fails before anyone plays it.

## How the 100 stages were made

Difficulty has exactly one axis, and it is the honest one: the **proven shortest number
of tilts**. Stage 1 takes two. Stage 100 takes twenty-eight, on a 6×5 board carrying four
blocks, five walls and one goal.

Long solutions are a vanishing fraction of random layouts, but they sit a short walk from
ordinary ones — nudge a single wall and a six-move board becomes a nine-move board. So
boards are not sampled, they are **climbed**: throw down a random board on a fixed element
budget, then move ONE element at a time for as long as the shortest solution keeps
growing. The budget never grows during a climb, so what comes out is not a busier board.
It is the same handful of pieces arranged until they finally have something to say.

A board ships only if **all** of the following hold:

| Gate | Meaning |
|---|---|
| solvable | breadth-first search finds a solution at all |
| par in band | its shortest solution is the length the slot wants |
| not pre-solved | the board does not begin cleared |
| few optimal lines | 1–3 distinct shortest solutions, so there is one clean idea |
| low luck | random par-length tilting almost never clears it |
| not jammable | at most a quarter of reachable positions are unsolvable (all 100 shipped stages have none at all) |
| **every element load-bearing** | delete any wall, block or goal and the puzzle measurably changes |
| distinct | not a rotation or reflection of any other stage in the campaign |

**All 100 stages ship with zero inert elements.** The deletion test is the one that
matters: `tools/audit.js` removes each element in turn and re-solves. If the shortest
solution *and* the number of optimal lines are both unchanged, that element was decoration
and the board is rejected.

Because every block is identical, two positions that differ only by swapping blocks *are*
the same position, and the solver says so. That is not an optimisation — it is what "all
blocks are the same" means, and it is why the par printed on screen is the real one.

Chapter 1 is hand-authored: the first ten boards introduce gravity, walls, one goal
serving many blocks, and blocks getting in each other's way, one idea at a time on a board
simple enough to see it on. Chapters 2–10 are searched. `tools/campaign.js` is the design
document for all of it and regenerates `src/stages.js` from a fixed seed.

## The campaign

| Ch | Name | Stages | Par | Board | What it is |
|---|---|---|---|---|---|
| 1 | AWAKEN | 1–10 | 2–7 | 3×3 | gravity, walls, blocks blocking blocks |
| 2 | NINE | 11–20 | 6–10 | 3×3 | ten moves out of nine cells |
| 3 | TWELVE | 21–30 | 9–12 | 4×3 | three cells wider, and the long way round appears |
| 4 | SIXTEEN | 31–40 | 11–14 | 4×4 | the board doubles; nothing else does |
| 5 | ORDER | 41–50 | 14–17 | 4×4 | the chapter of the wrong first move |
| 6 | TWENTY | 51–60 | 16–19 | 5×4 | routes too long to see all at once |
| 7 | TRAFFIC | 61–70 | 18–21 | 5×4–5×5 | four blocks, one exit, and each is the next one's wall |
| 8 | LATTICE | 71–80 | 20–23 | 5×5 | a nearly empty board — walls are the only brakes you own |
| 9 | DEPTH | 81–90 | 23–25 | 6×5 | boards that look like four moves and are not |
| 10 | TILT | 91–100 | 25–28 | 6×5 | the same gravity as stage 1, folded as far as it goes |

Par rises 2 → 28 and never falls between chapters. Within a chapter, boards of equal
length are ordered by how few pieces they carry, so the clearest statement of an idea
comes first.

**Small boards stay hard.** Chapter 2 is all 3×3: par up to 10 with unique solutions.
Nine cells hold ten moves of thinking. A hundred stages did not mean bigger boards — the
largest in the game is 6×5, and the average board carries under half a dozen walls.

Par is a target, not a requirement. Clearing in more moves is a normal clear, and your
best is kept so you can come back and shave it down.

## Playing

- **Swipe** anywhere on the board. The direction you are aiming at lights up on the
  board edge *before* you release, so a mis-swipe is something you see rather than
  something that happens to you.
- **Tilt** the device, if you enable it. A tilt must be held briefly before it commits
  and must return to centre before it fires again. Swipe alone plays the whole game.
- **Arrow keys / WASD** on a desktop. `Z` undo, `R` restart, `Esc` stage list.
- **UNDO** costs nothing and is meant to be used. Nothing can be destroyed, so undo always
  gets you all the way back. The game also watches for positions it can no longer solve
  and flags them on the undo button — as it happens, none of the 100 shipped stages has
  one, but the design gate permits a board with a few, so the guard stays.
- **You are never walled off.** Stages unlock in sequence, but you may always reach two
  stages past your frontier — one puzzle you cannot see the trick to never ends the run.

## Layout

```
index.html            markup and script order
styles.css            interface
src/engine.js         pure rules: compile, simulate, solve. No DOM, no timers.
src/stages.js         GENERATED — the 100 boards, one ASCII picture each
src/render.js         canvas renderer and effects
src/input.js          swipe, device tilt, keyboard
src/audio.js          synthesised sound — no asset files
src/save.js           localStorage, defensively parsed
src/game.js           state machine, HUD, overlays
tools/campaign.js     the campaign design; regenerates src/stages.js
tools/lib/boards.js   board generation, hill-climbing and measurement
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
npm run audit      # all 100 stages: par, solvability, physics invariants, no inert elements
npm run qa         # real browser: UI, undo, layout, touch, tilt, save
npm run qa:all     # the same, but plays every one of the 100 stages
npm test           # audit + qa
npm run campaign   # rebuild src/stages.js from tools/campaign.js
```

`audit` walks each stage's reachable state space checking that blocks never overlap, never
enter walls, never leave the board and never sit on a goal instead of being collected —
**including at every intermediate animation tick** — that the same input always produces
the same result, that undo and restart restore state exactly, and that a tilt which
changes nothing never costs a move. It also proves the rules did not grow: any board
character outside `.#o@`, or any stage field outside the five the rules define, is a
failure.

Counting is done as a layered breadth-first sweep rather than a recursive descent, because
at twenty-eight moves a descent is 4²⁸ sequences and the state space is a few hundred
nodes. The auditor writes its own sweep rather than calling the generator's — an auditor
that shares arithmetic with the thing it audits cannot catch that arithmetic being wrong.

`qa` drives a mobile-sized Chromium: plays stages through the real keyboard and touch
paths, checks undo/restart, input hammering, the stage menu across ten chapters, the
unlock window, reload persistence, corrupted-save recovery, and the device-tilt handler's
mapping, debounce and re-arm. It also verifies the thing the rules promise — that no
reachable position anywhere ever loses a block.

## Inspecting a stage

```
node tools/probe.js "" 9
```

prints the board, its solution as a filmstrip, and a verdict on every element:

```
#9 LAP  3×3   par 6   ways 1   luck 0.024%   states 16   dead 0   set-up 3   chain 1

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

`luck` is the share of random par-length tilt sequences that happen to clear the stage —
the lower it is, the more the board demands an actual idea. `set-up` is how many tilts run
before the first block is collected: on the late boards it is most of the solution, which
is the arranging-before-anything-pays-off that the whole campaign is built on.

## Rebuilding the campaign

```
node tools/campaign.js --fresh --workers 5
```

Searches every generated chapter from scratch (about six minutes on five cores) and
rewrites `src/stages.js`. Results are cached per chapter under `tools/.campaign-cache/`, so
re-running without `--fresh` only redoes the selection and emission. Editing a chapter's
par band or element budget and re-running is the intended way to change the campaign —
`src/stages.js` is an artifact, not a source file.

To make the game harder, raise a par band or move a wall. Do not add a fifth thing.
