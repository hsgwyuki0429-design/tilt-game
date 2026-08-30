# Campaign design

The campaign is a hundred boards on two square trays — 4×4 for the short
lengths, 5×5 once they outrun it — and it is generated rather than authored.
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
boards of the same par:

1. **the smaller tray** — a 4×4 beats a 5×5
2. **fewer immovable obstacles** — interior `#` walls and `x` cracked ice
3. **fewer drifters** — the grey `G` blocks
4. **fewer penguins**
5. **more of the tray actually used** — a pure tie-break, so that a board whose
   pieces all sit in one column loses to one that reads as a designed layout

The first of those is ahead of emptiness rather than a tie-break, and that is
deliberate: a four-move puzzle on a 5×5 spends most of the board on nothing, the
pieces in one corner and seventeen cells there to be looked at. The same puzzle
on a 4×4 is the same puzzle with the empty space taken away, so a 4×4 carrying a
wall beats an empty 5×5 of the same length. Sixteen cells run out at 37 moves,
and the campaign grows into the 5×5 exactly where they do: stages 1–53 are 4×4,
stages 54–100 are 5×5, and the seam falls at par 29.

Mixing sizes costs the uniqueness rules nothing. Every key below is derived from
the board's own flattened string, and a 4×4 flattens to sixteen characters
against a 5×5's twenty-five, so no key of one size can equal a key of the other.

A board also has to be a puzzle the campaign has not already asked. Matching
openings is the easy half of that; the hard half is that the search ranks by
emptiness, so a run of consecutive lengths comes back on the same terrain, and a
short board on that terrain is routinely the exact position a longer one passes
through. Before the rule below, stage 43's opening sat on the shortest line of
eleven other stages: solve any of them and you have already solved 43 from
there, so meeting it later is replaying a stage rather than playing one.

So a board is identified by every position it can reach that could **itself be
an opening** — nothing collected, nothing lost, no block standing on an aurora,
which is exactly what a starting board looks like. Two boards conflict when
either one's opening appears in the other's set, compared up to the square's
eight symmetries and renaming the two colours.

A board also may not stand in a room another stage has taken, at three levels
of detail. Its **skeleton** is the immovable blocks plus where the auroras sit.
Its **wall plan** is the immovable blocks alone. And its **working walls** are
only those whose removal would change the par or break the board.

The last of those exists because the second has a loophole: hand a board a wall
that changes nothing and it counts as a new layout while playing exactly like
the one it copied. Eight stages duplicated another's working walls that way
before the rule came in. Neither key implies the other — the same walls with
different pieces can leave different ones idle — so a stage has to be new under
both: one stops two stages looking alike, the other stops them being the same
puzzle. Two boards sharing one can be genuinely different
puzzles, but they look alike, and a player meeting the fourth board with a wall
in that corner and auroras on those two cells has stopped seeing a new level.
The first hundred stood on twenty-eight skeletons and twenty-four wall plans;
they now stand on a hundred of each.

The wall plan is the scarcest thing the campaign spends, and it is what turns
the emptiness preference on its head. There are 2041 ways to place up to four
immovable blocks on a 5×5 up to rotation and reflection, but exactly **one**
with none and **six** with one — so at most seven of the hundred stages can be
that open. The shipped ladder runs 1 board with no walls, 3 with one, 31 with
two, 49 with three and 16 with four.

That still forces a wall or two onto boards too short to need them, but far
fewer than it used to: 2 of the campaign's walls can be removed without changing
the par, down from 15. The second tray is what bought that. A hundred stages
need a hundred plans, and the 4×4 brings its own set of them — a room the 5×5
cannot copy — so the short lengths no longer have to be padded into
distinctness. `npm test` asserts the count stays under budget rather than
ignoring it, and those walls buy nothing on the working-walls key: padding
cannot manufacture a layout. Drifters are held to the old standard: every one of
them earns its place.

`tools/build-stages.js` walks past a candidate that breaks any of these rules,
and `npm test` checks the shipped hundred every way.

The first two criteria are the reason no board in the campaign uses cracked ice:
a hazard is an immovable obstacle, so it can only ever lose a tie, and adding it
to the search never raised the longest par reachable. The rule is still in the
engine, still documented, and still exercised — `tools/qa.js` builds a board for
it.

Drifters are still spent sparingly, because nothing forces them the way the
wall plans force walls: 37 boards carry none, 58 carry one, and 5 carry two.
`npm test` takes every drifter off every board in turn and requires the par to
change, so each one that ships is doing work.

## The curve

Stage 1 is one swipe. Stage 100 is the longest board the search found. Every
stage in between sits on the straight line between them:

    par(n) = round( 1 + (n - 1) × (longest - 1) / 99 )

Rounding to whole moves is the only thing allowed to bend that line, so
`tools/build-stages.js` refuses to write a campaign where any stage sits more
than half a move off it, and `npm test` checks the same thing again. One or two
stages share each par; each takes the next-best board of that length, so no
puzzle ships twice.

`longest` is not the longest board that exists — it is the longest that can be
*filled*. Layouts run out at the top: the very longest lengths have only a
handful of boards and often a single wall plan between them, so the build starts
at the longest board in the index and walks the ceiling down until the whole
hundred fits on the line. The index reaches 79 moves; the campaign tops out at
53. `--why` reports what each rejected ceiling ran out of, and the answer is
always the same narrow band: par 55 and 56, where two hundred measured boards
stand on ten wall plans and a hundred stages need one each. Ten is close to all
the plans there are at that length, so the rung rises with a *wider* search —
another combination measured — rather than with a deeper shortlist of the same
one.

## The obstacle budget

Longest par found, by how much was added to an empty tray. Two penguins;
`tools/level-index.json` carries the same table as data, for both trays and for
the one-penguin corners as well.

On the 4×4:

| immovable | drifters | longest par |
|---:|---:|---:|
| 0 | 0 | 4 |
| 1 | 0 | 19 |
| 2 | 0 | 19 |
| 3 | 0 | 21 |
| 0 | 1 | 12 |
| 1 | 1 | 36 |
| 2 | 1 | **37** |
| 3 | 1 | 36 |
| 0 | 2 | 18 |
| 1 | 2 | 36 |
| 2 | 2 | 36 |

Sixteen cells hold a great deal more than they look like they should: a single
wall and one drifter reach 36 moves, two thirds of what the 5×5 manages with
twice the room. What they do not do is keep climbing — every wider budget lands
back on 36 or 37, because a fourth obstacle starts taking away the space the
long solution needs. That is the ceiling the campaign changes trays at.

On the 5×5:

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
| 4 | 1 | **79** |

Three things these tables settle. Obstacles do not simply make boards longer — a
*fourth* wall makes them shorter, because it starts taking away the room a long
solution needs, and on the 4×4 a third one already does. A drifter buys far more
length than a wall does, which is why the long end of the campaign is walls
*plus* a drifter rather than a tray full of walls. And the ceiling is a statement
about the budget, not about the tray: every combination measured is listed in the
index, and a wider budget would raise it again. That is the reason the campaign is generated — widen the search, re-run
`tools/build-stages.js`, and all hundred stages move onto the new line.

Combinations not measured are the drifter-heavy, wall-light corners (three or
more drifters) and anything past five added pieces; the first are far too slow
to enumerate with five movable blocks, and the trend along that axis — 4, 12, 18
for zero, one and two drifters on an open tray — puts them nowhere near 57.

A pass over the 5×5 four-wall corner takes about three quarters of an hour, so
`tools/level-search.js` writes its shortlist out every few minutes rather than
only at the end. A pass that has to be stopped is then worth what it measured,
and the partial entry in the index records how far it got.

## Chapters

Ten chapters of ten stages, named for what the boards at that length are made
of rather than for a difficulty rating. The stage-select sheet groups by
chapter, and `src/save.js` lets a stuck player reach two stages past their
frontier so one board can never end the game for them.
