# TILT

**重力を操り、盤面の未来を読むパズル。100ステージ。**
You never move the blocks. You move the world.

A gravity puzzle for phones. Swipe (or tilt the device) to change which way gravity
pulls; every block slides as far as it can. A block that reaches a matching goal is
collected — mid-slide, which is where the chain reactions come from. Clear a stage by
collecting every block without losing one to the void.

No build step, no dependencies, no network. Open `index.html` and play.

```
node tools/serve.js        # then open the printed LAN address on a phone
```

---

## The rules, in full

1. The board is a grid of **floor**, **wall** and **pit** cells. Some floor cells carry a **goal**.
2. **Blocks** are rigid shapes with a colour. Most are 1×1; some are 2 cells.
3. Tilting sends gravity one of four ways. Every block slides until something stops it.
4. A block whose cells all rest on goals **accepting its colour** is collected.
   A block whose cells all rest on pits is **lost**.
   Both resolve *during* the slide, so a collected block frees the one queued behind it.
5. **CLEAR** when every block is collected and none was lost.

That is the entire ruleset, and it does not grow after stage 20. Everything the late
game does — ordering puzzles, blocks used as walls, routing by colour, shapes that only
fit one way, positions you cannot recover from — falls out of the geometry.

## How the 100 stages were made

Difficulty is ordered by **proven shortest-solution length**. Every chapter declares a
band of solution lengths and an element budget; boards are generated against that spec
and only the survivors of every quality gate are kept.

A board ships only if **all** of the following hold:

| Gate | Meaning |
|---|---|
| solvable | breadth-first search finds a solution at all |
| par in band | its shortest solution is the length the slot wants |
| not pre-solved | the board does not begin cleared |
| few optimal lines | 1–2 distinct shortest solutions, so there is one clean idea |
| low luck | random par-length tilting almost never clears it |
| **every element load-bearing** | delete any wall, pit, goal or block and the puzzle measurably changes |
| distinct | not a rotation or reflection of any other stage in the campaign |

**All 100 stages ship with zero inert elements.** The deletion test is the one that
matters: `tools/audit.js` removes each element in turn and re-solves. If the shortest
solution *and* the number of optimal lines are both unchanged, that element was
decoration and the board is rejected.

Chapters 1–2 are hand-authored — they introduce gravity, walls, the void, colour and
mass, and each new idea gets a board simple enough to see it on. Chapters 3–10 are
searched. `tools/campaign.js` is the design document for all of it and regenerates
`src/stages.js` from a fixed seed.

## The campaign

| Ch | Name | Stages | Par | Boards | What it is |
|---|---|---|---|---|---|
| 1 | AWAKEN | 1–10 | 2–6 | 3×3 | gravity, walls, blocks blocking blocks, the void |
| 2 | SPECTRUM | 11–20 | 4–10 | 3×3–5×5 | colour and mass arrive; the rules stop growing |
| 3 | NINE | 21–30 | 5–8 | 3×3 | everything that fits in nine cells |
| 4 | SIXTEEN | 31–40 | 6–9 | 4×3–4×4 | the board doubles; longer routes, more traffic |
| 5 | PALETTE | 41–50 | 7–10 | 4×4–5×4 | two colours sharing one gravity |
| 6 | ABYSS | 51–60 | 7–11 | 4×4–5×4 | every board here has a fatal tilt in it |
| 7 | MASS | 61–70 | 8–11 | 4×4–5×5 | two-cell blocks: they cannot turn |
| 8 | BLEND | 71–80 | 9–12 | 4×4–5×5 | colour and the void together |
| 9 | STRUCTURE | 81–90 | 9–13 | 5×4–5×5 | mass with a colour that decides where it must end |
| 10 | CONVERGENCE | 91–100 | 10–14 | 5×5–6×5 | everything at once, on the largest grids |

Par rises 2 → 14 across the campaign, dipping by a move or two at each chapter opening
so a new element combination lands on a board you can read. Within a chapter, boards of
equal length are ordered by how forgiving they are, so a chapter never opens with its
cruellest position.

**Small boards stay hard.** Chapter 3 is all 3×3: par up to 8, unique solutions, luck
below 0.02%, and up to 78% of the nine cells carrying something. A hundred stages did
not mean bigger boards — only stages 91–100 exceed 5×5.

Par is a target, not a requirement. Clearing in more moves is a normal clear, and your
best is kept so you can come back and shave it down.

## Playing

- **Swipe** anywhere on the board. The direction you are aiming at lights up on the
  board edge *before* you release, so a mis-swipe is something you see rather than
  something that happens to you.
- **Tilt** the device, if you enable it. A tilt must be held briefly before it commits
  and must return to centre before it fires again. Swipe alone plays the whole game.
- **Arrow keys / WASD** on a desktop. `Z` undo, `R` restart, `Esc` stage list.
- **UNDO** costs nothing and is meant to be used. If a position becomes unsolvable the
  game says so on the undo button rather than letting you grind at a dead board.
- **You are never walled off.** Stages unlock in sequence, but you may always reach two
  stages past your frontier — one puzzle you cannot see the trick to never ends the run.

## Layout

```
index.html            markup and script order
styles.css            interface
src/engine.js         pure rules: compile, simulate, solve. No DOM, no timers.
src/stages.js         GENERATED — the 100 boards, as ASCII layers
src/render.js         canvas renderer and effects
src/input.js          swipe, device tilt, keyboard
src/audio.js          synthesised sound — no asset files
src/save.js           localStorage, defensively parsed
src/game.js           state machine, HUD, overlays
tools/campaign.js     the campaign design; regenerates src/stages.js
tools/lib/boards.js   board generation and measurement
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

`audit` walks each stage's reachable state space checking that blocks never overlap,
never enter walls and never leave the board — **including at every intermediate
animation tick** — that the same input always produces the same result, that undo and
restart restore state exactly, and that a tilt which changes nothing never costs a move.
Four workers, about 14 seconds for the full campaign.

`qa` drives a mobile-sized Chromium: plays stages through the real keyboard and touch
paths, checks undo/restart, pit recovery, input hammering, the stage menu across ten
chapters, the unlock window, reload persistence, corrupted-save recovery, and the
device-tilt handler's mapping, debounce and re-arm.

Measured on a simulated iPhone 12: 59fps while animating, ~19fps at rest (the render
loop throttles while you think), worst-case move animation 264ms.

## Inspecting a stage

```
node tools/probe.js "" 7
```

prints the board, its solution as a filmstrip, and a verdict on every element:

```
#7 LAP  3×3   par 6   ways 1   luck 0.02%   states 27   dead 0

  start  L     D     R     U     R     U
  A▓o    A▓o   ·▓o   ·▓o   ·▓o   ·▓o   ·▓o
  ···    ···   A··   ··A   ·B·   ··B   ···
  ·B▓    B·▓   B·▓   ·B▓   ··▓   ··▓   ··▓

    reshapes      wall 1,0   (par 6→2)
    load-bearing  goal 2,0   (removing it makes the stage impossible)
    reshapes      wall 2,2   (par 6→4)
    reshapes      piece A    (par 6→3)
    reshapes      piece B    (par 6→5)
```

`luck` is the share of random par-length tilt sequences that happen to clear the stage —
the lower it is, the more the board demands an actual idea.

## Rebuilding the campaign

```
node tools/campaign.js --fresh --workers 4
```

Searches every generated chapter from scratch (about 12 minutes on four cores) and
rewrites `src/stages.js`. Results are cached per chapter under `tools/.campaign-cache/`,
so re-running without `--fresh` only redoes the selection and emission. Editing a
chapter's par band, element budget or names and re-running is the intended way to change
the campaign — `src/stages.js` is an artifact, not a source file.
