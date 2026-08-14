# TILT

**重力を操り、盤面の未来を読むパズル。**
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
2. **Blocks** are rigid shapes with a colour. Most are 1×1; a few are 2 cells.
3. Tilting sends gravity one of four ways. Every block slides until something stops it.
4. A block whose cells all rest on goals **accepting its colour** is collected.
   A block whose cells all rest on pits is **lost**.
   Both resolve *during* the slide, so a collected block frees the one queued behind it.
5. **CLEAR** when every block is collected and none was lost.

That is the entire ruleset. Everything else — ordering puzzles, blocks used as walls,
routing by colour, shapes that only fit one way — falls out of the geometry rather than
from extra mechanics.

## Design rules the code actually enforces

**Every wall is load-bearing.** `tools/audit.js` deletes each wall, pit, goal and block
in turn and re-solves the stage. If removing an element leaves the shortest solution and
the number of distinct optimal lines unchanged, it is reported as `INERT` and the board
gets redesigned. All twenty stages currently ship with zero inert elements.

**Every `par` is proven, not asserted.** Breadth-first search over the real engine finds
the true shortest solution for every stage, and the audit fails if a declared par
disagrees. Nothing here is "probably solvable".

**Small boards, dense boards.** Eleven of the twenty stages are 3×3. Average board fill
is 45%. The hardest 3×3 (`LAP`, stage 7) takes six moves and has exactly one solution:
0.02% of random six-tilt sequences clear it.

**Boards are searched, not sketched.** `tools/forge.js` generates candidate boards to an
element budget and keeps only those that survive every filter — solvable, right length,
unique enough, low enough luck, and no inert elements — deduplicated across the eight
square symmetries so no two stages are the same puzzle rotated.

## Stages

Twenty stages, six acts. The par curve dips deliberately at 8, 11 and 14: each of those
introduces a new element, and a new idea gets a board simple enough to see it on.

| # | Name | Board | Par | What it exists to teach |
|---|------|-------|-----|--------------------------|
| 1 | DROP | 3×3 | 2 | gravity answers to you |
| 2 | STOP | 3×3 | 3 | walls stop things; go around |
| 3 | TWO | 3×3 | 2 | two blocks, one goal |
| 4 | FOLLOW | 3×3 | 4 | one tilt can send both home — first chain |
| 5 | NOTCH | 3×3 | 4 | neither block can arrive straight |
| 6 | STACK | 3×3 | 5 | blocks are each other's floor |
| 7 | LAP | 3×3 | 6 | six moves out of nine cells, one line |
| 8 | VOID | 3×3 | 3 | **the pit** — the obvious first tilt kills you |
| 9 | LEDGE | 3×3 | 5 | half of all tilts here cost a block |
| 10 | BRINK | 3×3 | 5 | crossing the pit is a matter of order |
| 11 | HUE | 3×3 | 4 | **colour**, taught by disappointment |
| 12 | SPLIT | 3×3 | 5 | two goals in the wrong order |
| 13 | SORT | 4×4 | 6 | a wrong-coloured goal is just floor |
| 14 | WIDE | 4×4 | 4 | **big blocks** — half in is not in |
| 15 | LEVER | 4×4 | 7 | the wide block is the best wall you own |
| 16 | FIT | 4×4 | 7 | blocks cannot turn; each shape has one home |
| 17 | CASCADE | 4×4 | 6 | the last tilt sends three blocks home at once |
| 18 | NERVE | 4×4 | 8 | colour, a pit and a chain on one board |
| 19 | PRISM | 5×5 | 9 | three colours, three separate laps |
| 20 | TILT | 5×5 | 10 | everything, ten moves, exactly one line |

Par is the shortest solution, not a requirement — clearing in more moves is a normal
clear, and the stage keeps your best so you can come back and shave it down.

## Playing

- **Swipe** anywhere on the board. The direction you are aiming at lights up on the board
  edge *before* you release, so a mis-swipe is something you see rather than something
  that happens to you.
- **Tilt** the device, if you enable it. A tilt must be held briefly before it commits,
  and must return to centre before it will fire again. Swipe alone plays the whole game;
  nothing depends on the sensor.
- **Arrow keys / WASD** on a desktop. `Z` undo, `R` restart, `Esc` stage list.
- **UNDO** costs nothing and is meant to be used — trying a tilt to see what happens is
  how these puzzles are supposed to be played. If a position becomes unsolvable, the game
  says so on the undo button instead of letting you grind at a dead board.

## Layout

```
index.html          markup and script order
styles.css          interface
src/engine.js       pure rules: compile, simulate, solve. No DOM, no timers.
src/stages.js       the twenty boards, as ASCII layers
src/render.js       canvas renderer and effects
src/input.js        swipe, device tilt, keyboard
src/audio.js        synthesised sound — no asset files
src/save.js         localStorage, defensively parsed
src/game.js         state machine, HUD, overlays
tools/audit.js      stage verification and the element-deletion test
tools/forge.js      board generator with quality filters
tools/probe.js      prints a stage's solution as an ASCII filmstrip
tools/qa.js         drives the real page in a real browser
tools/serve.js      static server for playing on a phone
```

`engine.js` and `stages.js` load both as browser globals and as CommonJS modules, so the
solver and the tests exercise the exact code the player runs — there is no second
implementation of the rules to drift out of sync.

## Tests

```
npm run audit    # all 20 stages: solvable, par correct, no inert elements, physics invariants
npm run qa       # real browser: plays all 20 stages, undo/restart, layout, touch, tilt
npm test         # both
```

`audit` walks the reachable state space of every stage checking that blocks never
overlap, never enter walls, never leave the board — including at every intermediate
animation tick — that the same input always produces the same result, and that a tilt
which changes nothing never costs a move.

`qa` plays all twenty stages through the real keyboard/touch path in a mobile-sized
Chromium, then checks undo and restart restore state exactly, the pit failure state
recovers, rapid input cannot corrupt the board, the 5×5 board fits five viewports from
320×568 up, progress survives a reload, a corrupted save recovers instead of crashing,
and the device-tilt handler maps, debounces and re-arms correctly.

Measured on a simulated iPhone 12: 59fps while animating, ~19fps at rest (the render
loop deliberately throttles while you think), worst-case move animation 264ms.

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
