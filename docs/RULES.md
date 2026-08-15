# TILT — the rule book, and the argument for every rule in it

This document exists to answer one question about every rule TILT has or could have:

> **What does the player think about, that they would not have thought about otherwise?**

A rule that cannot answer it is not in the game, however clever it is. A rule that answers
it well is in the game even if it makes things complicated.

Everything below is **measured, not asserted**. The generator (`tools/lib/generate.js`)
enumerates the entire design space for a given budget — every arrangement of walls, goals,
hazards and blocks, up to rotation, reflection and colour relabelling — and the measurement
library (`tools/lib/design.js`) scores each one. So when this document says a rule is weak,
that is a number from a sweep of tens of thousands of boards, not taste. The tables state
their sample sizes and you can reproduce any of them with `tools/forge.js`.

Two rules that were in earlier versions of this document are gone, and the sections that
killed them are still here (§7). A document that only records what survived is a sales
brochure.

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

> **Nothing resolves mid-slide.** Everything a cell does to a block, it does when the board
> comes to rest, and only then. A block is collected only if it comes to a complete stop on
> a goal; a block is destroyed only if it is left standing on a hazard.

This is the single most consequential decision in the game, so it gets its own analysis
below (§3.3). Its main effect on every other rule is this: **the scarce resource in TILT is
not distance, it is things that stop blocks.** Read every rule below through that lens.

---

## 2. The categories, and what is actually in each

| Category | In the game | Considered, not in |
|---|---|---|
| **A · Movement** | gravity; slide-until-blocked; block-on-block collision; the settle→resolve→settle loop | momentum, ice, variable speed, ~~pins~~ (§7.1) |
| **B · Terrain** | wall `#`; hazard `x` | one-way gates, teleports, breakable walls, moving walls, ~~pin `+`~~ (§7.1) |
| **C · Win condition** | **ALL IN**, **SELECT**, **MATCH**, **FORM** | fill a region, leave exactly one behind, reach a move count |
| **D · Block shape** | one cell, always | 2×1, 1×2, 2×2 (§7.2) |
| **E · Colour** | three colours, **two blocks per colour maximum**; colour-matched goals | colour mixing, colour change |
| **F · Failure** | hazard `x` — and stopping on one ends the run | fail-on-touch, forbidden regions |
| **G · State change** | collection frees a cell and the board re-settles | blocks that transform, goals that move, switches |
| **H · Limits** | none | move limits, time limits, direction locks |

Row C is the substantial change since the first draft of this document, which rejected
alternative win conditions on the grounds that they "move the difficulty off the board and
into the briefing". That argument was wrong, and §5 says exactly how the measurement
disproved it.

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

**What the player thinks about.** Where things *stop*. Under the stop-at-rest rule, a wall is
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

### 3.3 RESOLVED AT REST — the decision the game is built on  ★★★★★ CORE

**Rule.** When the board comes to rest, a block standing on a goal it fits is collected. The
cell frees, gravity has not gone away, and the board settles again — which is where chains
come from. The same timing governs the hazard.

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

### 3.4 HAZARD `x` — the mirror of a goal  ★★★★☆ ADVANCED

**Rule.** A block left standing on a hazard when the board settles is destroyed, **and the
run ends there**. Sliding straight across one is completely safe.

**Why this version and not "touch it and die".** The obvious hazard is a wall that lies about
being a wall: it only ever asks the player to route around a region, which walls already do
better. This version asks the game's central question — *where does this block stop?* — and
answers it in the opposite direction to a goal. Both resolve at rest and only at rest. That
symmetry is the whole design: one rule, two signs.

**Why it ends the run rather than merely spoiling the board.** Losing a block already made
the stage unwinnable — the only question was whether the game said so. The earlier version
put a DEAD END badge on the undo button and left the player to notice it, which asks them to
read a label, understand it, and then perform the only move available. A game-over card that
names the rule is shorter, clearer, and costs the same one tap.

**What the player thinks about.** Not "avoid that square" but **"what is on the far side of
that square?"** A hazard is crossable, so it is a piece of route you use deliberately; the
puzzle is arranging for something to catch you past it.

**Measured — hazards cannot stand alone:**

| 4×3, two blocks | viable boards | max par | avg flow | silent jams |
|---|---|---|---|---|
| **hazard only (no walls)** | **0** | — | — | — |
| wall × hazard | 300+ | **11** | 4.3 | 3% |
| walls only | 300+ | 9 | 2.6 | 0% |

**Zero.** Not "few" — a hazard with no walls anywhere produces no board that passes the
quality gates at all, because without walls there is nothing to make the crossing meaningful.
Paired with walls it is the strongest single terrain device: it raises the par ceiling from 9
to 11 and flow from 2.6 to 4.3, at a cost of 3% silently-unwinnable positions.

**Good use.** A hazard directly between a block and the only backstop, so the route *must* go
across it and the puzzle is what stops you after.

**Bad use.** A field of hazards fencing off a region. That is a wall drawn in red, and it
scores worse than a wall because it also creates dead ends.

**Mini-stage (3×3):**

```
 @ x o      R: the block crosses the hazard and is stopped on the goal by the
 . . .         right edge.  COLLECT.  Crossing was never the danger.
 . . .      Move the goal one cell left and the same tilt ends the run instead.
```

**Thinking type.** Risk management · prediction · route planning.

---

### 3.5 COLOUR `A`/`a`, `B`/`b`, `C`/`c` — the hole that is a floor  ★★★★★ ADVANCED

**Rule.** A goal collects a block only when the colours match. `o` takes anything; a plain
`@` fits only `o`. **At most two blocks of any one colour, anywhere in the game.**

**What the player thinks about.** A goal is a hole for one block and an ordinary floor tile
for the other. Since collection requires stopping, a wrong-coloured block can come to rest
*right in the socket* and simply sit there — not collected, still a wall, still in the way.
And being in the way is the most valuable thing an uncollected block can do.

So the thought becomes: **"which of these do I want to keep?"** Collecting in the wrong order
does not waste moves, it destroys the backstop you were going to need.

**Measured — colour is the strongest terrain rule and it does not want company:**

| 4×3 | viable | max par | avg blindness | avg flow | silent jams | clarity |
|---|---|---|---|---|---|---|
| colour alone, 3 blocks (AAB) | 300+ | 12 | 0.93 | 7.2 | 6% | 6.9 |
| **colour alone, 4 blocks (AABB)** | 300+ | **16** | **1.17** | **10.5** | 4% | 6.3 |
| hazard × colour | 300+ | 11 | 0.77 | 6.7 | 11% | 4.6 |

**Colour alone beats colour + hazard on every single axis** — longer solutions, more
blindness, more flow, fewer silent dead ends, and far better clarity. This is the strongest
evidence in the document for the "one device at a time" rule, and it was not a preference: it
is what the sweep says.

**Why the two-per-colour cap.** Three identical blocks on a small board is not depth, it is
bookkeeping — the player tracks a crowd rather than a relationship. The cap costs nothing:
under it, SELECT with three colours reaches **par 58 on twelve cells**, deeper than anything
the uncapped search ever produced.

**Why a third colour and not a fourth.** Two colours is enough for ALL IN — the third does
nothing there but multiply bookkeeping, exactly as the first draft of this document said. But
the sweep says something different about the win conditions that came after: MATCH at 4×3
tops out at par 12 with two colours and **par 29 with three**, and SELECT goes from 23 to 58.
The third colour is not more of the same rule; it is what turns "the pair and the obstacle"
into "the pair, the obstacle, and the thing that moves the obstacle".

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

## 4. The four win conditions

The physics are identical in all four. What changes is what "done" means, and each one turns
the same rules into a different question.

### 4.1 ALL IN — collect every block  ★★★★★ CORE

**Rule.** Clear when every block has been collected.

**What the player thinks about.** "How do I get all of them home?" — and, because of §3.3,
mostly: "which of these am I allowed to spend, and in what order?"

**Why it is the default.** It is the only win condition that is legible from the picture
alone. Nothing has to be said. Every other row in this section costs the player a phrase in
the HUD, and has to earn that phrase.

**Measured ceiling.** 4×3, four blocks under the two-per-colour cap: **par 16**.

---

### 4.2 SELECT — only the marked blocks  ★★★★★ ADVANCED

**Rule.** Clear when every block whose colour has a goal somewhere has been collected. A
block whose colour has no socket anywhere can never leave the board.

**What the player thinks about.** **"You cannot move one block. You move the world, and
everything answers."** The route for the cargo is usually obvious within seconds; the puzzle
is entirely in the side effects of taking it.

**Why it is the strongest rule in the game.** It creates something no other rule in TILT can:
a **permanent** backstop. Under ALL IN every block is spent eventually, so every brake is
temporary by definition. A block with no socket is the only thing in the game guaranteed to
still be there at the end — and it is still fully mobile, so it is a wall the player carries
around with them.

**Measured — SELECT is deeper than ALL IN at every size:**

| 4×3, walls 1–2 | candidate boards | max par | best blindness |
|---|---|---|---|
| ALL IN, AABB (baseline) | 300+ | 16 | 3 @ par 12 |
| SELECT, AAB → goal `a` | 27,694 | 19 | 3 @ par 18 |
| SELECT, AABB → goal `a` | 105,350 | 23 | 3 @ par 21 |
| **SELECT, AABBCC → goals `a`,`b`** | 11,623 *(par ≥ 26 only)* | **58** | **3 @ par 57** |

Note the last row is filtered at par ≥ 26 and still returns eleven thousand boards. This is
not a rule that occasionally produces a long board; the long boards are the bulk of the
space.

**Good use.** A board where the cargo is one tilt from home in the opening frame, and that
tilt stays illegal for another eight moves because of what is standing where.

**Bad use.** Furniture that never touches the cargo's route. Then it is ALL IN with
decoration, and the player has been made to read a phrase for nothing.

**The over-constraint result.** Giving three colours *three* goal colours instead of two
collapses the space: **zero** boards at par ≥ 50, where two goal colours reach 58. More
constraint is not more depth — past a point it is less, because the furniture that made the
board deep has been turned into cargo.

**And adding a hazard costs length too.** The same SELECT space with one hazard added:
7,476 terrains, 6,479 boards at par ≥ 28, **ceiling 48**. Deep enough for the extreme chapter
to use once, and measurably shallower than SELECT on its own — which is the compatibility
result of §6 showing up one more time, in the one place the campaign spends it anyway.

**Mini-stage (3×3):**

```
 a # A      C has no socket anywhere: it can never leave, and it is the only
 . . .      thing on this board that will still be there at the end.
 . C .      The puzzle is getting A stopped on 'a' — which needs C behind it.
```

**Thinking type.** Interference avoidance · side-effect reasoning · dependency · ordering.

---

### 4.3 MATCH — bring the same things together  ★★★★☆ ADVANCED

**Rule.** No goals at all. Clear when every colour that has more than one block has all of
them orthogonally touching, at the same time.

**What the player thinks about.** **"How do I make these two meet?"** The board stops being
about a destination and becomes about a *relationship* — and the two things you are trying to
join are driven by the same gravity, so most of the work is separating them first.

**Why it is interesting.** It is the only win condition where nothing is ever banked. A pair
you closed three moves ago is still on the board being pushed around by every subsequent
tilt, so the winning position is one where all of them are together *simultaneously*. That
turns the last tilt into a real constraint rather than a formality.

**Measured — MATCH does not exist in one colour:**

| board | candidates | max par | best blindness |
|---|---|---|---|
| 3×3, `@@` (one colour) | **0** | — | — |
| 3×3, AABB | 614 | 8 | 3 @ par 4 |
| 4×3, `@@` (one colour) | 60 | 4 | 2 @ par 3 |
| 4×3, AABB | 10,154 | 12 | 3 @ par 9 |
| 4×4, AABB | 3,170 | 10 | 3 @ par 8 |
| 5×3, AABB | 9,654 | 18 | 3 @ par 17 |
| **4×3, AABBCC** | 160,314 | **29** | **3 @ par 29** |

**Zero at 3×3 with one colour.** Two blocks on nine cells under one gravity are adjacent
almost immediately, whatever the walls do — there is no puzzle to have. MATCH is the one rule
in the game that is *born* needing another rule, and the third colour more than doubles its
ceiling because the second pair is the only tool for separating the first.

**Good use.** A board where the tilt that closes one pair opens another, so the order is the
entire question.

**Bad use.** Two pairs that never share a row or column. Then it is two trivial boards, and
the player solves them one at a time in either order.

**Mini-stage (3×3):**

```
 # A B      Every tilt moves both A's and both B's. The tilt that brings the
 B . #      A's together drives the B's apart, and vice versa — so the answer
 . A .      is the one that does neither, first.
```

**Thinking type.** Relationship reasoning · ordering · simultaneity · reverse reasoning.

---

### 4.4 FORM — build the named shape  ★★★★☆ ADVANCED

**Rule.** The goal characters mark **cells to be standing on**, not holes. Nothing is ever
collected. Clear when every marked cell is occupied by a block it accepts, all at once.

**What the player thinks about.** **"How do I satisfy all of these at the same time?"** Where
ALL IN drains the board one block at a time, FORM has to land every constraint
simultaneously — and every block placed correctly is a new wall in the way of the next one.

**Why it is interesting.** It is the only pairing in the game where two rules make *one*
question instead of two. On a coloured FORM board, "which cells" and "which blocks" are the
same sentence, so the shape is a picture rather than a count. It is also the only win
condition where the answer is fully visible from the first frame and that changes nothing —
which is a good demonstration that the difficulty in TILT was never about knowing where to
go.

**Measured:**

| 4×3, walls 1–2 | candidates | max par | best blindness |
|---|---|---|---|
| `@@` → 2 targets | 10,188 | 11 | 3 @ par 7 |
| `@@C` → 3 targets | 25,833 | 10 | 3 @ par 8 |
| AAB → 3 targets | 91,860 | 22 | 3 @ par 19 |
| **AABBC → 4 targets** | 95,554 *(par ≥ 24 only)* | **60** | **3 @ par 59** |
| AABBCC → 5 targets | — | **0 at par ≥ 40** | — |

The same over-constraint cliff as SELECT, and in the same place: four targets out of five
blocks is the deepest space in the entire game; five targets out of six kills it. The block
that is *not* part of the shape is what makes the shape hard to build.

**Good use.** A shape whose second cell can only be held by the block already standing on the
first.

**Bad use.** A shape in a corner. Corners hold themselves, and the "everything at once"
constraint never bites.

**Mini-stage (3×3):**

```
 o o #      Both marks are in the top row with a wall past them, so one tilt
 @ . .      up-and-right would do it — except the two blocks arrive in the
 . . @      wrong order and the second one has nothing to stop it.
```

**Thinking type.** Constraint satisfaction · simultaneity · spatial reasoning · ordering.

---

## 5. What the win conditions disproved

The first version of this document rejected every alternative win condition in one paragraph:

> *Each moves the difficulty off the board and into the briefing: the player stops looking at
> nine cells and starts re-reading a sentence.*

That argument was reasonable and it was wrong, in a way worth recording because the mistake
is a general one.

**What was wrong.** The claim assumed the briefing cost is paid *per board*. It is not — it
is paid once, on the first board of the chapter, and only if the rule cannot be shown. All
three of the new win conditions can be shown:

- **SELECT** draws a block with no socket dimmed and hollow. "This one is not cargo" is a
  visual fact about the board, not a sentence.
- **MATCH** has no goals on it at all. A board with two red blocks, two blue blocks and no
  holes has exactly one plausible objective, and slamming two of a colour together on tilt
  one confirms it.
- **FORM** draws its marks as brackets on the floor rather than sunken sockets, and the
  bracket goes hollow when the cell is satisfied. The difference from a goal is visible
  before it is explained.

**What it cost to find out.** One HUD chip, three words long, on 15 boards out of 40.

**What it bought.** The three deepest spaces in the game. ALL IN's ceiling under the
two-per-colour cap is par 16 in the sweep, 15 after the deletion test. SELECT reaches 58 and
FORM reaches 60 — on the same twelve cells, with the same physics, and with blindness 3
available at the top of both ranges. What actually shipped is par 26 for the SELECT chapter,
24 for FORM, 22 for MATCH, and 35 to 57 for the five extreme boards built out of them. The
rejected category was, measurably, where the game was.

**The general lesson.** "It moves difficulty into the briefing" is a claim about *how a rule
is presented*, and it was being used as a claim about *what a rule is*. Those are different
questions, and only one of them was tested.

---

## 6. Compatibility table

Measured at 4×3, same quality gates throughout.

| A | B | Verdict | Why |
|---|---|---|---|
| wall | goal | ◎ | A wall behind a goal is what makes it collectable. This pairing *is* the base game. |
| wall | hazard | ◎ | Par ceiling 9 → 11, flow 2.6 → 4.3. The strongest terrain pairing. |
| wall | colour | ◎ | Colour needs walls for the same reason everything does: something has to stop things. |
| block | goal | ◎ | The block-as-backstop is the signature move of the whole rule set. |
| hazard | — (alone) | ✕✕ | **Zero** viable boards. Meaningless without walls. |
| hazard | colour | ✕ | Strictly worse than colour alone on every axis, and jams 6% → 11%. |
| colour | — (alone) | ◎◎ | Par 16 under ALL IN, and the precondition for everything in §4. |
| colour | MATCH | ◎◎ | **Required.** One colour produces zero viable MATCH boards; three produce 160,314. |
| colour | SELECT | ◎◎ | **Required.** SELECT *is* "some colours have sockets and some do not". |
| colour | FORM | ◎ | Optional and strong: it turns a count into a picture, and lifts the ceiling 22 → 60. |
| hazard | SELECT | ✕ | Par ceiling 48 where SELECT alone reaches 58, over a space five times larger. The combination is shorter *and* less clear. |
| SELECT | 3 goal colours | ✕ | Zero boards at par ≥ 50. Turning the furniture into cargo removes what made it deep. |
| FORM | 5 targets of 6 | ✕ | Zero boards at par ≥ 40. Same cliff, same cause. |

**The rule that falls out of this table**, and it changed since the first draft: terrain
devices pair well with *walls* and badly with *each other*, exactly as before — but win
conditions pair with **colour** and badly with *terrain devices*. So the campaign ships one
device per board through chapter 7, and spends the result deliberately in chapter 8 (§9).

There is a second, sharper pattern. Every ✕ in the bottom three rows is the **same mistake**:
adding constraint to a space that was deep *because* it had slack. SELECT is deep because
some blocks are furniture; make them all cargo and it dies. FORM is deep because one block is
spare; make every block load-bearing and it dies. **The free piece is the puzzle.**

---

## 7. What is not in the game, and why

### 7.1 The pin `+`  ★★☆☆☆ — REMOVED after shipping

A cell a block may enter, may not pass, and is perfectly safe on: the only place in TILT a
block could be parked in open ground. It had a five-stage chapter. It is gone.

**The argument for it** was a matrix-completion argument, and it was elegant:

| cell | may enter | may pass | at rest |
|---|---|---|---|
| floor | yes | yes | nothing |
| wall | **no** | no | — |
| goal | yes | yes | **collected** |
| hazard | yes | yes | **destroyed** |
| **pin** | yes | **no** | **nothing** |

Four of the five combinations of "can you enter / can you pass / what happens at rest" were
occupied and the pin was the fifth. That is a real observation and it is not a reason.

**What the measurement said.** At 4×3 with two blocks: a pin alone produces **20 viable
boards with average blindness 0.00** — every one of them solved by the first tilt a hurrying
player would try. Paired with walls it produced longer boards (flow 2.6 → 4.3 where a third
wall reaches 3.4) and *still* never produced a board that was hard to see. It made boards
bigger without making them harder, which is precisely the failure mode this whole project
exists to avoid.

**What it cost.** The pin was the only rule in the game that broke the idempotence of a
repeated tilt — it held a block for exactly one tilt, so "right, right" was a legitimate
two-move plan. That is defensible in isolation, and it forced the audit's strongest physics
invariant to be weakened from *"the second identical tilt does nothing"* to *"repeating a
direction converges"*. A rule that buys length, buys no insight, and costs an invariant is
not a close call.

*Would be reconsidered if:* a board were found where a pin creates blindness that walls
cannot. 20 boards were checked; none did.

### 7.2 Big blocks (2×1, 2×2)  ★☆☆☆☆ — rejected twice

A 2×1 block needs two free cells instead of one. Every question it asks — will it fit, will
it stop here — the player is already asking about single blocks. It costs a large new rule
surface (what happens when half of it is over a goal? over a hazard? blocked?) and returns
the same kind of thought. **More rule, same thinking.**

It was explicitly permitted for the extreme chapter, on the grounds that par 30+ might not be
reachable without it. It was not needed: SELECT with three colours reaches par 58 in the
sweep and 57 after the deletion test, on twelve cells, with single-cell blocks.

*Would be reconsidered if:* a size gave a block a genuinely different relationship to
gravity, rather than a bigger footprint.

### 7.3 More blocks  ★☆☆☆☆ — measured and rejected

Not a rule so much as the obvious next knob, and it is worth recording because it does the
opposite of what everyone expects. The two-per-colour cap plus three colours plus the plain
`@` allows eight blocks. Sampled search over 4×4 and 5×3 boards with eight blocks:

| blocks | board | longest solution seen at all |
|---|---|---|
| 6 | 4×3 | **58** |
| 6 | 5×3 (sampled) | 50 |
| 6 | 4×4 (sampled) | 51 |
| **8** | 4×4 / 5×3 (sampled) | **23** |

Eight blocks on sixteen cells is not a deeper puzzle, it is a jammed one. Half the board
cannot move, most tilts do nothing, the reachable state space collapses, and the longest
thing in it is shorter than a good 3×3 colour board. **More material makes boards shorter**,
which is the two-per-colour cap arriving at the same answer from the other direction.

### 7.4 Move limits / time limits  ★☆☆☆☆ — rejected, and actively harmful
Undo is free and exploration is the intended way to play. A move limit converts "try it and
see" into "be careful", which is exactly the wrong instinct for a game whose whole pleasure
is discovering what a tilt does. Par already exists as a target with no penalty attached.

### 7.5 Direction locks ("you may not tilt left")  ★★☆☆☆ — not adopted
Genuinely changes the search and is cheap to implement, but the rule lives *outside* the
board — nothing you can see explains it, so it fails the "read the board, not the manual"
standard the rest of the design holds to.

### 7.6 A fourth colour  ★★☆☆☆ — not adopted
Three earns its place (§3.5). A fourth would have to show the same thing again: a space it
opens that three cannot reach. Nothing in the sweeps suggests one, and clarity is already the
weakest axis on the deepest boards.

### 7.7 One-way cells, teleports, breakable walls, moving walls  ★★☆☆☆ — not adopted
All are implementable and all are legible. They are excluded on a budget argument rather than
a quality one: the terrain matrix in §7.1 is *complete* once the pin is struck from it, and
each of these adds a row to a table that currently explains itself in one glance. If one of them replaced an existing rule
rather than joining it, it would deserve a fresh measurement.

---

## 8. Thinking-type table

Which kind of thought each rule actually forces, as opposed to which it sounds like it should.

| Rule | Prediction | Ordering | Spatial | Causality | Reverse | Risk | Dependency | Insight |
|---|---|---|---|---|---|---|---|---|
| gravity | ●●● | ○ | ●● | ●●● | ○ | ○ | ● | ●● |
| wall | ●● | ○ | ●●● | ●● | ● | ○ | ○ | ●● |
| resolved at rest | ●●● | ●● | ●● | ●● | ●●● | ○ | ●●● | ●●● |
| hazard | ●●● | ●● | ●● | ●● | ● | ●●● | ● | ●●● |
| colour | ●● | ●●● | ● | ●● | ●●● | ○ | ●●● | ●●● |
| **SELECT** | ●● | ●●● | ●● | ●●● | ●●● | ○ | ●●● | ●●● |
| **MATCH** | ●●● | ●●● | ●● | ●●● | ●●● | ○ | ●● | ●●● |
| **FORM** | ●●● | ●●● | ●●● | ●● | ●● | ○ | ●●● | ●● |

The rules that generate **insight** rather than mere difficulty all do it the same way: they
make the obvious move visibly attractive and actually wrong. That is what `blindness`
measures, and it is why those chapters carry the highest surprise scores in the campaign.

FORM is the one row with a lower insight mark than its neighbours, and the reason is
structural rather than a flaw: on a FORM board the target is drawn on the floor, so there is
nothing to *realise* about what you are trying to do. Its difficulty is all execution
ordering. That is a legitimate kind of puzzle and it is why FORM is a chapter rather than the
finale.

---

## 9. Teaching order

No rule is ever explained in more than one short line. Each arrives in a board where doing
the wrong thing is cheap, obvious, and instructive.

| Stage | Rule arriving | How it teaches |
|---|---|---|
| 1 DROP | gravity | One block, one goal in a corner, two tilts. Impossible to get wrong. |
| 2 OVER | **goals are not targets** | The obvious tilt sends the block visibly *past* the socket. The player does this wrong exactly once. |
| 3 BRAKE | walls as backstops | Only one of four directions has anything behind the goal. Answers the board before it. |
| 4 STACK | blocks as backstops | Required by measurement to contain a collection where a block was the brake. |
| 11 CROSS | hazard | The solution goes *across* it. Stopping on it ends the run where you can see exactly why. |
| 16 SORT | colour | Watch a block come to rest in a socket and not be taken. |
| 21 MEET | **MATCH** | No holes on the board at all, and the first tilt slams two of a colour together. |
| 26 ONLY | **SELECT** | One block lit, one block dimmed and hollow. The dim one visibly has nowhere to go. |
| 31 PLACE | **FORM** | Two brackets on the floor, two blocks, one tilt that fills both. |

**The principle:** a rule is introduced by a board where the rule is the only thing that
happens, and where being wrong costs one tap. Nothing is introduced in a board that is also
hard.

---

## 10. Adoption priority, and when to use each

Strength is not permission. The strongest rules are the ones most capable of ruining a board
by being used where they are not needed.

| Rule | Strength | Tier | Use it when | Do **not** use it when |
|---|---|---|---|---|
| gravity | ★★★★★ | CORE | always | — |
| resolved at rest | ★★★★★ | CORE | always | — |
| wall | ★★★★★ | CORE | always; it is the only element that works alone | you were going to put it somewhere nothing reaches |
| ALL IN | ★★★★★ | CORE | the objective should need no words at all | — |
| colour | ★★★★★ | ADVANCED | the puzzle is about *which block to keep* | the two colours never interact |
| SELECT | ★★★★★ | ADVANCED | the puzzle is a route whose side effects are the problem | the furniture never touches the cargo's route |
| MATCH | ★★★★☆ | ADVANCED | two colours minimum, and the pairs must share rows or columns | one pair can be solved without touching the other |
| FORM | ★★★★☆ | ADVANCED | at least one block is spare, and the shape is not in a corner | every block is part of the shape |
| hazard | ★★★★☆ | ADVANCED | the route must cross something and the puzzle is what catches you | there are no walls; it produces nothing |
| pin | ★★☆☆☆ | REMOVED | never — see §7.1 | — |
| big blocks | ★☆☆☆☆ | — | never, on current evidence | — |
| move/time limits | ★☆☆☆☆ | — | never | — |

**The two most important lines in this document:**

1. *Every terrain device is worthless without walls, and worse than useless with another
   terrain device.* Hazard alone: zero boards. Colour with a hazard: worse than colour by
   itself on every axis measured.
2. *Every win condition is worthless without colour, and its depth comes from the piece that
   is NOT constrained.* MATCH with one colour: zero boards. SELECT with everything as cargo:
   zero boards past par 50. FORM with every block in the shape: zero boards past par 40.

---

## 11. Cognitive load, and the one place it is spent

| Combination | Load | Where it belongs |
|---|---|---|
| gravity + wall | low | chapters 1–2 |
| gravity + wall + hazard | medium | chapter 3 |
| gravity + wall + colour | medium-high | chapter 4 |
| gravity + wall + colour + MATCH / SELECT / FORM | medium-high | chapters 5–7 |
| any two devices at once | **high, and measurably worse** | **chapter 8, and only there** |

High load is not automatically bad. What is bad is load that does not buy thinking, and §6
shows exactly where that line falls: the second device always costs more clarity than it
returns in depth.

Chapter 8 breaks that rule on purpose, and it is worth being precise about why that is not a
contradiction. The measurement says a combined board is *harder to read and less fair than
the better of its two rules alone*. That is a decisive argument in a chapter whose job is to
teach a rule. It is a much weaker argument at stage 39, addressed to a player who has
finished thirty-eight boards and has the whole vocabulary. The result was never "never do
this" — it was "never do this while someone is still learning".

Chapter 8 relaxes exactly two things: devices may combine, and `unlock` is no longer required
to be small. Everything else still holds, and two gates are enforced *harder* than anywhere
else in the game, because they are what separates a long puzzle from a long chore:

| Gate | Value | Why |
|---|---|---|
| `insights` | ≥ 6 | moves on the line where instinct is wrong. A forty-tilt board with two decisions in it is thirty-eight tilts of admin. |
| `guided` | ≥ 42% | and at least that much of it plays itself. A board where every move is its own fight is a corridor, however long. |

What shipped, measured: par **35 · 42 · 49 · 48 · 57**, with 16 to 29 moves of genuine
decision on each and the rest momentum. Four of the five have blindness 3 — the correct
opening is the very last one instinct would try — which is the same signature the three-tilt
boards in chapter 1 are selected for. Length was added; nothing was given up for it.

The one thing that is genuinely worse at this end of the game is jams: stage 39 is unwinnable
from 32% of its positions and stage 40 from 28%, against 0% almost everywhere else. That is
what a board this dense costs, and it is exactly the cost the automatic rewind was built to
absorb — a jam is now an interruption of one tilt rather than a run quietly ending.

---

## 12. The target state

Everything above serves one end:

> **The rules are understandable. The solution is not.**

A player should be able to state every rule of the board in front of them in one sentence
each, and still not see the answer. When they do see it, it should be because they looked at
the board again — never because they re-read a rule.

And then:

> **「あっ！そういうことか！」**

That moment has a measurement, and it is the one the whole project is built on: `unlock` —
how many correct moves the board costs before it starts playing itself. Zero means there was
nothing to see. Equal to par means every move was its own separate fight. One or two means
there was exactly one thing to see, seeing it was the whole puzzle, and everything after it
was the reward.

Every rule in this document is judged, finally, on whether it can produce a board with
`unlock` of one or two and a long tail after it — with one deliberate exception at the very
end of the game, which is judged on `insights` and `guided` instead, and which had to argue
for that exemption rather than assume it.
