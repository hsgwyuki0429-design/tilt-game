# TILT — the rule book, and the argument for every rule in it

This document exists to answer one question about every rule TILT has or could have:

> **What does the player think about, that they would not have thought about otherwise?**

A rule that cannot answer it is not in the game, however clever it is. A rule that answers
it well is in the game even if it makes things complicated.

Everything below is **measured, not asserted**. The generator (`tools/lib/generate.js`)
enumerates the entire design space for a given budget — every arrangement of walls, goals,
hazards, pins and blocks, up to rotation, reflection and colour relabelling — and the
measurement library (`tools/lib/design.js`) scores each one. So when this document says a
rule is weak, that is a number from a sweep of tens of thousands of boards, not taste. The
tables state their sample sizes and you can reproduce any of them with `tools/forge.js`.

---

## 1. The foundation everything answers to

TILT's absolute base is this: **the player changes the direction of gravity, and the blocks
move as a consequence.** The player never touches a block.

Every rule is therefore judged on whether it makes *gravity-shaped thinking* richer. A rule
that creates a good puzzle which happens to sit on a TILT board, but which would be just as
good in a game where you drag pieces around, scores low here no matter how good the puzzle
is.

There is one further rule that is not negotiable, because the entire current design rests
on it:

> **A block is collected only if it comes to a complete stop on a goal.** Sliding over a
> goal does nothing at all.

This is the single most consequential decision in the game, so it gets its own analysis
below (§3.3). Its main effect on every other rule is this: **the scarce resource in TILT is
not distance, it is things that stop blocks.** Read every rule below through that lens.

---

## 2. The categories, and what is actually in each

| Category | In the game | Considered, not in |
|---|---|---|
| **A · Movement** | gravity; slide-until-blocked; block-on-block collision; the settle→resolve→settle loop | momentum, ice, variable speed |
| **B · Terrain** | wall `#`; **pin `+`** | one-way gates, teleports, breakable walls, moving walls |
| **C · Goals** | collect every block, at rest, colour-matched | "collect only red", form a shape, fill a region, leave one behind, touch same colours |
| **D · Block shape** | one cell, always | 2×1, 1×2, 2×2 |
| **E · Colour** | two colours, **two blocks per colour maximum**; colour-matched goals | three+ colours, colour mixing, colour change |
| **F · Failure** | hazard `x` | instant-fail cells, forbidden regions, fail-on-touch |
| **G · State change** | collection frees a cell and the board re-settles | blocks that transform, goals that move, switches |
| **H · Limits** | none | move limits, time limits, direction locks |

Five terrain/element rules ship. Everything in the right-hand column was considered and is
argued about below — most of them lose, and §7 says exactly why for each.

---

## 3. The rules that ship

### 3.1 GRAVITY — the verb  ★★★★★ CORE

**Rule.** A tilt sends gravity one of four ways. Every block slides until something stops
it: the board edge, a wall, or another block.

**What the player thinks about.** "If I tilt right, where does *everything* end up?" Not one
block — all of them, simultaneously, including the ones that will collide with each other on
the way. This is the whole game and every other rule is a modifier on this sentence.

**Why it is interesting.** Because the player's input is one bit of direction and the output
is a whole board rearranging. The gap between the size of the input and the size of the
consequence is where the entire game lives.

**Thinking type.** Prediction · causality · simultaneity.

---

### 3.2 WALL `#` — the fixed brake  ★★★★★ CORE

**Rule.** A block cannot enter a wall cell.

**What the player thinks about.** Where things *stop*. Under the stop-on-goal rule, a wall is
not primarily an obstacle — it is the free backstop that makes a nearby goal collectable at
all. The player learns to read a goal by looking at the cell *behind* it.

**Measured.** At 4×3 with two blocks, boards built from walls alone: **300+ viable, max par
9, average blindness 0.71, average flow 2.6, 0% silent jams, clarity 9.5.** Walls are the
only element that produces good boards entirely on its own.

**Good use.** A wall placed so that exactly one of the four approach directions to a goal is
backed. That single wall turns a free goal into a one-answer question.

**Bad use.** A wall in a corner that nothing ever reaches. `tools/audit.js` fails the build
on these: delete any piece and the puzzle must measurably change. **88% of otherwise-good
candidate boards fail this test**, which is how much decorative geometry a search produces
if you let it.

**Mini-stage (3×3), and why it works:**

```
 . o #      L: block slides to the left wall — nothing.
 . . .      R: block crosses the goal and is stopped by the wall.  COLLECT.
 @ . .
```
Solution `R`. The wall is doing 100% of the work: remove it and the block sails off the
right edge past the goal, and the stage is unsolvable.

**Thinking type.** Spatial reasoning · prediction.

---

### 3.3 GOAL `o` — collected only at rest  ★★★★★ CORE

**Rule.** When the board comes to rest, a block standing on a goal it fits is collected. The
cell frees, gravity has not gone away, and the board settles again — which is where chains
come from.

**What the player thinks about.** This rule replaces "steer the block to the hole" with
**"arrange for the block to be stopped on the hole"**, which is a completely different
question and a much better one. The player must now think about two cells at once: the goal,
and the cell one step beyond it.

**Why it is interesting.** It converts the goal from a destination into a *constraint*, and
it makes uncollected blocks valuable. A block you have not collected is the only backstop
you can move. Collecting greedily is therefore how you lose — the game punishes hurrying
with a mechanism rather than with a scolding.

**Good use.** A goal in open floor with no wall behind it, solvable only by parking another
block beyond it first. Measured as `caught` — collections where the backstop was a block
rather than terrain.

**Bad use.** Every goal in a corner. Corners back themselves, so the rule never bites and
the board plays like the old "steer at the hole" game.

**Mini-stage (3×3):**

```
 @ o @      L: right block crosses the goal, is stopped by the left block.  COLLECT.
 . . .         the left block is now the only one left — and it is in the corner.
 . . #      Then D, R: it is backed by the wall.  COLLECT.
```
The first collection is only possible because of a block the player has *not* collected. That
is the whole rule set in three cells.

**Thinking type.** Reverse reasoning · dependency · resource management.

---

### 3.4 PIN `+` — the place you may stand  ★★★★☆ BASIC

**Rule.** A block that rolls onto a pin stops there for the rest of that tilt. Next tilt it
is completely free. Nothing else happens to it.

**Why it exists — the completion argument.** The pin was not added because the game needed
more. It was added because the other four cells leave exactly one case empty:

| cell | may enter? | may pass through? | what happens at rest |
|---|---|---|---|
| floor | yes | yes | nothing |
| wall `#` | **no** | — | — |
| **pin `+`** | yes | **no** | **nothing** |
| hazard `x` | yes | yes | destroyed |
| goal `o` | yes | yes | collected |

Floor, wall, hazard and goal cover three of the four combinations of "can you enter" and
"can you pass". The pin is the fourth. It is a completion of a matrix, not an addition to a
list.

**What the player thinks about.** *Where can I leave something?* Without pins, every block
ends flush against a wall, an edge or another block — the board's resting positions are
entirely dictated by its terrain. A pin is the only cell where a block can be left standing
in open ground, which means it is the only backstop the player gets to *position*.

**Measured — and the caveat is the interesting part.**

| 4×3, two blocks | viable boards | max par | avg blindness | avg flow | clarity |
|---|---|---|---|---|---|
| walls only (2 walls) | 300+ | 9 | 0.71 | 2.6 | 9.5 |
| **pin only (no walls)** | **20** | **4** | **0.00** | **1.0** | 7.3 |
| wall × pin | 300+ | 9 | 0.73 | **4.3** | 7.3 |
| wall × wall (3 walls, control) | 300+ | 8 | 0.80 | 3.4 | 9.5 |

Read that carefully. **A pin on its own is nearly dead** — twenty viable boards in the entire
space, average blindness zero, average flow 1.0. It does not raise the par ceiling either
(9 → 9). What it does is raise **flow from 2.6 to 4.3**, and the control row is what makes
that meaningful: simply adding a *third wall* only reaches 3.4. So the pin is doing
something a wall cannot, and it is doing it as a **multiplier on walls, never as a
headliner**.

At 3×3 the effect is starker: walls alone yield 12 viable boards, a pin alone yields 4, and
wall+pin yields **71**. The pin's real contribution is that it makes small boards viable at
all.

**Good use.** A pin far from any goal, where the point is to park the *other* block on it as
a backstop. Or a pin used twice in one solution, from two different directions — the
one-tilt hold is what lets a block turn a corner in open ground.

**Bad use.** A pin adjacent to a goal. It steals the block instead of backing it up (see the
trap below), which is a fine puzzle once but reads as a bug if it is the only thing pins ever
do.

**The trap only a pin can set:**

```
 @ o +      R: the block crosses the goal and is caught on the peg — one cell late.
```
A wall behind a goal is a backstop. A **pin** behind a goal is a *better hole than the goal
is*. This is genuinely surprising the first time and completely fair the second.

**Mini-stage (3×3):**

```
 @ @ +      R: the leading block parks on the peg; the second stops against it.
 . . .      Now the second block is standing in open ground, where nothing could
 o . .      have held it — and it is the backstop the goal on row 3 needs.
```

**Thinking type.** Spatial reasoning · staging · dependency · resource management.

---

### 3.5 HAZARD `x` — the mirror of a goal  ★★★★☆ ADVANCED

**Rule.** A block left standing on a hazard when the board settles is lost, and the board can
never be cleared. Sliding straight across one is completely safe.

**Why this version and not "touch it and die".** The obvious hazard is a wall that lies about
being a wall: it only ever asks the player to route around a region, which walls already do
better. This version asks the game's central question — *where does this block stop?* — and
answers it in the opposite direction to a goal. Both resolve at rest and only at rest. That
symmetry is the whole design: one rule, two signs.

**What the player thinks about.** Not "avoid that square" but **"what is on the far side of
that square?"** A hazard is crossable, so it is a piece of route you use deliberately; the
puzzle is arranging for something to catch you past it.

**Measured — hazards cannot stand alone either, and more severely than pins:**

| 4×3, two blocks | viable boards | max par | avg flow | silent jams |
|---|---|---|---|---|
| **hazard only (no walls)** | **0** | — | — | — |
| wall × hazard | 300+ | **11** | 4.3 | 3% |
| walls only | 300+ | 9 | 2.6 | 0% |

**Zero.** Not "few" — a hazard with no walls anywhere produces no board that passes the
quality gates at all, because without walls there is nothing to make the crossing meaningful.
Paired with walls it is the strongest single device in the game: it raises the par ceiling
from 9 to 11 and flow from 2.6 to 4.3, at a cost of 3% silently-unwinnable positions.

**Good use.** A hazard directly between a block and the only backstop, so the route *must* go
across it and the puzzle is what stops you after.

**Bad use.** A field of hazards fencing off a region. That is a wall drawn in red, and it
scores worse than a wall because it also creates dead ends.

**Mini-stage (3×3):**

```
 @ x o      R: the block crosses the hazard and is stopped on the goal by the
 . . .         right edge.  COLLECT.  Crossing was never the danger.
 . . .      Move the goal one cell left and the same tilt kills the block instead.
```

**Thinking type.** Risk management · prediction · route planning.

---

### 3.6 COLOUR `A`/`a`, `B`/`b` — the hole that is a floor  ★★★★★ ADVANCED

**Rule.** A goal collects a block only when the colours match. `o` takes anything; a plain
`@` fits only `o`. **At most two blocks of any one colour, anywhere in the game.**

**What the player thinks about.** A goal is a hole for one block and an ordinary floor tile
for the other. Since collection now requires stopping, a wrong-coloured block can come to
rest *right in the socket* and simply sit there — not collected, still a wall, still in the
way. And being in the way is the most valuable thing an uncollected block can do.

So the thought becomes: **"which of these do I want to keep?"** Collecting in the wrong order
does not waste moves, it destroys the backstop you were going to need.

**Measured — colour is the strongest rule in the game and it does not want company:**

| 4×3 | viable | max par | avg blindness | avg flow | silent jams | clarity |
|---|---|---|---|---|---|---|
| colour alone, 3 blocks (AAB) | 300+ | 12 | 0.93 | 7.2 | 6% | 6.9 |
| **colour alone, 4 blocks (AABB)** | 300+ | **16** | **1.17** | **10.5** | 4% | 6.3 |
| pin × colour | 300+ | 11 | 0.93 | 6.7 | 7% | 4.6 |
| hazard × colour | 300+ | 11 | 0.77 | 6.7 | 11% | 4.6 |

**Colour alone beats both colour pairings on every single axis** — longer solutions, more
blindness, more flow, fewer silent dead ends, and far better clarity. This is the strongest
evidence in the document for the "one device at a time" rule, and it was not a preference: it
is what the sweep says.

**Why the two-per-colour cap.** Three identical blocks on a small board is not depth, it is
bookkeeping — the player tracks a crowd rather than a relationship. The cap costs nothing:
the longest well-formed board in the entire project is four blocks under the cap (AABB) at
par 16, longer than anything the uncapped search ever produced under the base rules.

**Good use.** A board where one colour's goal is only reachable by using the *other* colour's
block as a backstop, so the correct order is forced and the wrong order is silent.

**Bad use.** Two independent single-colour puzzles side by side. If the colours never
interact, you have shipped two easy stages in one screen.

**Mini-stage (3×3):**

```
 a . B      L: B crosses goal 'a' — which refuses it — and stops in the corner.
 . . .         It is now the backstop for A.
 A . b      L then U: A is stopped on 'a' by nothing... so it must come from the
               right instead, and B has to be somewhere else first.
```

**Thinking type.** Ordering · dependency · resource management · reverse reasoning.

---

## 4. Compatibility table

Measured at 4×3 with two blocks (or three for colour rows), same quality gates throughout,
300-board samples.

| A | B | Verdict | Why |
|---|---|---|---|
| wall | goal | ◎ | A wall behind a goal is what makes it collectable. This pairing *is* the base game. |
| wall | pin | ◎ | Flow 2.6 → 4.3, where a third wall only reaches 3.4. The pin adds resting places the wall cannot. |
| wall | hazard | ◎ | Par ceiling 9 → 11, flow 2.6 → 4.3. The strongest single-device pairing. |
| wall | colour | ◎ | Colour needs walls for the same reason everything does: something has to stop things. |
| block | goal | ◎ | The block-as-backstop is the signature move of the whole rule set. |
| pin | goal | ○ | Sharp trap (the pin steals the block) but a one-joke pairing if overused. |
| pin | — (alone) | ✕ | 20 viable boards, blindness 0.00, flow 1.0. Nearly dead without walls. |
| hazard | — (alone) | ✕✕ | **Zero** viable boards. Meaningless without walls. |
| pin | hazard | △ | Works (par 10) but clarity 5.1: two at-rest rules at once and the player is reading rules. |
| pin | colour | ✕ | Strictly worse than colour alone on every axis. Par 12→11, flow 7.2→6.7, clarity 6.9→4.6. |
| hazard | colour | ✕ | Strictly worse than colour alone on every axis, and jams 6%→11%. |
| colour | — (alone) | ◎◎ | Par 16, flow 10.5, the best boards in the game. |

**The rule that falls out of this table:** every device pairs well with *walls* and badly
with *other devices*. So the campaign ships **one device per board, never two**, and the
audit fails the build if that is ever violated.

---

## 5. Thinking-type table

Which kind of thought each rule actually forces, as opposed to which it sounds like it should.

| Rule | Prediction | Ordering | Spatial | Causality | Reverse | Risk | Dependency | Insight |
|---|---|---|---|---|---|---|---|---|
| gravity | ●●● | ○ | ●● | ●●● | ○ | ○ | ● | ●● |
| wall | ●● | ○ | ●●● | ●● | ● | ○ | ○ | ●● |
| goal (at rest) | ●●● | ●● | ●● | ●● | ●●● | ○ | ●●● | ●●● |
| pin | ●● | ●● | ●●● | ● | ●● | ○ | ●● | ●● |
| hazard | ●●● | ●● | ●● | ●● | ● | ●●● | ● | ●●● |
| colour | ●● | ●●● | ● | ●● | ●●● | ○ | ●●● | ●●● |

The two rules that generate **insight** rather than mere difficulty are the hazard and
colour, and they do it the same way: both make the obvious move visibly attractive and
actually wrong. That is what `blindness` measures, and it is why those two chapters have the
highest surprise scores in the campaign.

---

## 6. Teaching order

No rule is ever explained in more than one short line. Each arrives in a board where doing
the wrong thing is cheap, obvious, and instructive.

| Stage | Rule arriving | How it teaches |
|---|---|---|
| 1 DROP | gravity | One block, one goal in a corner, two tilts. Impossible to get wrong. |
| 2 OVER | **goals are not targets** | The obvious tilt sends the block visibly *past* the socket. The player does this wrong exactly once. |
| 3 BRAKE | walls as backstops | Only one of four directions has anything behind the goal. Answers the board before it. |
| 4 STACK | blocks as backstops | Required by measurement to contain a collection where a block was the brake. |
| 11 PEG | pin | The peg simply interrupts a slide the player was going to make anyway. |
| 16 CROSS | hazard | The solution goes *across* it. Stopping on it shatters the block where you can see why, and undo is one tap. |
| 21 SORT | colour | Watch a block come to rest in a socket and not be taken. |

**The principle:** a rule is introduced by a board where the rule is the only thing that
happens, and where being wrong costs one tap of undo. Nothing is introduced in a board that
is also hard.

---

## 7. What is not in the game, and why

Each of these was tested against the question in the title of this document. None could
answer it.

### Big blocks (2×1, 2×2)  ★☆☆☆☆ — rejected
A 2×1 block needs two free cells instead of one. Every question it asks — will it fit, will
it stop here — the player is already asking about single blocks. It costs a large new rule
surface (what happens when half of it is over a goal? over a hazard? blocked?) and returns
the same kind of thought. **More rule, same thinking.**
*Would be reconsidered if:* a size gave a block a genuinely different relationship to
gravity, rather than a bigger footprint.

### Alternate win conditions  ★☆☆☆☆ — rejected
"Collect only the red ones", "form a shape", "fill this region", "leave one behind", "make
same colours touch". Each moves the difficulty off the board and into the briefing: the
player stops looking at nine cells and starts re-reading a sentence. TILT's win condition is
visible in the picture — every block gone — and stays that way.
*Note:* "collect only the red ones" is already expressible as colour, without a briefing.

### Move limits / time limits  ★☆☆☆☆ — rejected, and actively harmful
Undo is free and exploration is the intended way to play. A move limit converts "try it and
see" into "be careful", which is exactly the wrong instinct for a game whose whole pleasure
is discovering what a tilt does. Par already exists as a target with no penalty attached.

### Direction locks ("you may not tilt left")  ★★☆☆☆ — not adopted
Genuinely changes the search and is cheap to implement, but the rule lives *outside* the
board — nothing you can see explains it, so it fails the "read the board, not the manual"
standard the rest of the design holds to.

### Three or more colours  ★★☆☆☆ — not adopted
Not a new rule, just more of an existing one. It multiplies bookkeeping without adding a new
question, and clarity is already the weakest axis on colour boards (6.3 at two colours).
The two-per-colour cap plus two colours already reaches par 16.

### One-way cells, teleports, breakable walls, moving walls  ★★☆☆☆ — not adopted
All are implementable and all are legible. They are excluded on a budget argument rather than
a quality one: the terrain matrix in §3.4 is *complete*, and each of these adds a fifth
column to a table that currently explains itself in one glance. If one of them replaced an
existing rule rather than joining it, it would deserve a fresh measurement.

---

## 8. Adoption priority, and when to use each

Strength is not permission. The strongest rules are the ones most capable of ruining a board
by being used where they are not needed.

| Rule | Strength | Tier | Use it when | Do **not** use it when |
|---|---|---|---|---|
| gravity | ★★★★★ | CORE | always | — |
| goal at rest | ★★★★★ | CORE | always | — |
| wall | ★★★★★ | CORE | always; it is the only element that works alone | you were going to put it somewhere nothing reaches |
| colour | ★★★★★ | ADVANCED | the puzzle is about *which block to keep* | the two colours never interact |
| pin | ★★★★☆ | BASIC | the board needs a resting place its terrain cannot provide | there are no walls; it is dead on its own |
| hazard | ★★★★☆ | ADVANCED | the route must cross something and the puzzle is what catches you | there are no walls; it produces nothing |
| big blocks | ★☆☆☆☆ | — | never, on current evidence | — |
| alternate win | ★☆☆☆☆ | — | never | — |
| move/time limits | ★☆☆☆☆ | — | never | — |

**The single most important line in this document:** *every device is worthless without
walls, and worse than useless with another device.* Pin alone: 20 boards. Hazard alone: zero
boards. Colour with a pin or a hazard: worse than colour by itself on every axis measured.

---

## 9. Cognitive load

| Combination | Load | Where it belongs |
|---|---|---|
| gravity + wall | low | chapters 1–2 |
| gravity + wall + pin | medium | chapter 3 |
| gravity + wall + hazard | medium | chapter 4 |
| gravity + wall + colour | medium-high | chapter 5 |
| any two devices | **high, and measurably worse** | nowhere |

High load is not automatically bad. What is bad is load that does not buy thinking, and the
compatibility table shows exactly where that line falls: the second device always costs more
clarity than it returns in depth.

---

## 10. The target state

Everything above serves one end:

> **The rules are understandable. The solution is not.**

A player should be able to state every rule of the board in front of them in one sentence
each, and still not see the answer. When they do see it, it should be because they looked at
the board again — never because they re-read a rule.

And then:

> **"あっ！そういうことか！"**

That moment has a measurement, and it is the one the whole project is built on: `unlock` —
how many correct moves the board costs before it starts playing itself. Zero means there was
nothing to see. Equal to par means every move was its own separate fight. One or two means
there was exactly one thing to see, seeing it was the whole puzzle, and everything after it
was the reward.

Every rule in this document is judged, finally, on whether it can produce a board with
`unlock` of one or two and a long tail after it. That is the only reason any of them are
here.
