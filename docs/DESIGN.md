# Campaign design

The campaign is a hundred 5×5 boards, and it is generated rather than authored.
Two tools produce it: `tools/level-search.js` measures the design space, and
`tools/build-stages.js` lays the result out and writes `src/stages.js`.

## The pieces

| Character | Piece | Notes |
|---|---|---|
| `A` `B` | penguin | at most one per colour, so at most two on a board |
| `a` `b` | aurora | exactly one matching aurora per penguin |
| `G` | drifter | slides, is never collected, can plug an aurora it stops on |
| `#` | ice wall | immovable |
| `x` | cracked ice | safe to cross, fatal to stop on |

## What the search measures

For every board inside a given budget, the search computes the exact minimum
number of moves — its **par** — using the same rules the player plays. It is an
enumeration, not a sample: inside the budget nothing is skipped, and boards that
differ only by a rotation, a reflection, or which colour is called A are counted
once.

The trick that makes that affordable is that a board's *rules* are its static
layout plus its aurora placement; the starting arrangement is just a position in
the resulting graph. So the search fixes the layout and the auroras, builds the
position graph once, and runs a multi-source backward breadth-first search from
the cleared positions. One traversal yields the exact par of every possible
start.

## What makes one board better than another

Par is the axis the campaign is laid out along, not a measure of quality. Among
boards of the same par, the emptier board wins:

1. **fewer immovable obstacles** — interior `#` walls and `x` cracked ice
2. **fewer drifters** — the grey `G` blocks
3. **fewer penguins**
4. **more of the tray actually used** — a pure tie-break, so that a board whose
   pieces all sit in one column loses to one that reads as a designed layout

The first two criteria are the reason no board in the campaign uses cracked ice:
a hazard is an immovable obstacle, so it can only ever lose a tie, and adding it
to the search never raised the longest par reachable. The rule is still in the
engine, still documented, and still exercised — `tools/qa.js` builds a board for
it.

What the ranking produces is a footprint that grows only when the length forces
it to:

| par | the emptiest board of that length |
|---|---|
| 1–4 | nothing but penguins and auroras |
| 5–12 | 1 drifter |
| 13–18 | 2 drifters |
| 19–20 | 1 wall |
| 21–36 | 1 wall, 1 drifter |
| 37–38 | 2 walls, 1 drifter |
| 39–55 | 2 walls, 2 drifters |
| 56–57 | 3 walls, 1 drifter |

`npm test` re-checks this from the other direction: it takes every wall and
every drifter off every shipped board in turn and requires the par to change.
An obstacle that changes nothing is a board the search mis-measured.

## The curve

Stage 1 is one swipe. Stage 100 is the longest board the search found. Every
stage in between sits on the straight line between them:

    par(n) = round( 1 + (n - 1) × (longest - 1) / 99 )

Rounding to whole moves is the only thing allowed to bend that line, so
`tools/build-stages.js` refuses to write a campaign where any stage sits more
than half a move off it, and `npm test` checks the same thing again. One or two
stages share each par; each takes the next-best board of that length, so no
puzzle ships twice.

## The obstacle budget

Longest par found, by how much was added to an empty tray. Two penguins unless
noted; `tools/level-index.json` carries the same table as data.

| immovable | drifters | longest par |
|---:|---:|---:|
| 0 | 0 | 4 |
| 1 | 0 | 20 |
| 2 | 0 | 25 |
| 3 | 0 | 34 |
| 4 | 0 | 33 |
| 0 | 1 | 12 |
| 1 | 1 | 36 |
| 2 | 1 | 38 |
| 3 | 1 | **57** |
| 0 | 2 | 18 |
| 1 | 2 | 33 |
| 2 | 2 | 55 |

Three things this table settles. Obstacles do not simply make boards longer — a
*fourth* wall makes them shorter, because it starts taking away the room a long
solution needs. A drifter buys far more length than a wall does, which is why
the long end of the campaign is walls *plus* a drifter rather than a tray full
of walls. And the ceiling is a statement about the budget, not about 5×5: every
combination measured is listed in the index, and a wider budget would raise it
again. That is the reason the campaign is generated — widen the search, re-run
`tools/build-stages.js`, and all hundred stages move onto the new line.

Combinations not measured are the drifter-heavy, wall-light corners (three or
more drifters) and anything past five added pieces; the first are far too slow
to enumerate with five movable blocks, and the trend along that axis — 4, 12, 18
for zero, one and two drifters on an open tray — puts them nowhere near 57.

## Chapters

Ten chapters of ten stages, named for what the boards at that length are made
of rather than for a difficulty rating. The stage-select sheet groups by
chapter, and `src/save.js` lets a stuck player reach two stages past their
frontier so one board can never end the game for them.
