# TILT

**重力を操り、ひらめきで答えを見つけるパズル。**
You never move the blocks. You move the world.

A gravity puzzle for phones. Swipe (or tilt the device) to change which way gravity pulls;
every block slides as far as it can. A block that reaches a goal it fits is collected —
mid-slide, which is where the chain reactions come from. Clear a stage by collecting every
block.

No build step, no runtime dependencies, no network. Open `index.html` and play.

```
node tools/serve.js        # then open the printed LAN address on a phone
```

---

## The rules

**The base rules. Ten of the twenty stages use nothing else.**

1. The board is a grid of **floor** and **wall** cells. Some floor cells are **goals**.
2. Tilting sends gravity one of four ways. Every block slides until something stops it —
   the edge, a wall, or another block.
3. A block that arrives on a goal it fits is **collected** and leaves. This resolves
   *during* the slide, so a collected block frees the one queued behind it.
4. **CLEAR** when every block has been collected.

**The two devices. A stage may use one, or neither. No stage uses both.**

A device is not a difficulty setting and not a reward for reaching chapter three. Each one
exists because it creates a kind of thinking the base rules cannot ask for, and a stage may
use one only when that thinking is the entire point of the stage.

| | Rule | Why it exists |
|---|---|---|
| **HAZARD** `x` | A block **left standing** on a hazard when the board settles is lost. Sliding straight across one is completely safe. | The obvious version of a hazard — touch it and die — is a wall that lies about being a wall, and it only ever asks the player to avoid a region. This version asks the one question the whole game is built on, and asks it much harder: **where does this block stop?** A hazard is not a place to keep away from; it is a place you are free to cross and forbidden to park on. That turns the dangerous square from an obstacle into a piece of equipment — you route blocks straight over it on purpose, and the puzzle is arranging for something to be there to catch them. |
| **COLOUR** `A`/`a`, `B`/`b` | A goal collects a block only when they match. `o` takes any block; a plain `@` fits only `o`. | Not "two puzzles side by side". The point is that a goal is a hole for one block and an ordinary floor tile for the other. A block of the wrong colour rolls straight over it and carries on being a **wall** somewhere else — so collecting in the wrong order does not merely waste moves, it removes a wall you needed. |

Nothing else is coming: no cell that teleports, no block that behaves differently from
another block of its own colour, no hidden state, and no randomness anywhere. A stage is
hard because of where things are and the order they have to be moved in.

`tools/audit.js` enforces this. Any board character outside `.` `#` `x` `o` `@` `a` `b`
`A` `B` fails, any stage field the rules do not define fails, and **any board using a
hazard and a colour at the same time fails** — two new rules at once means the player is
reading rules instead of reading the board.

## What makes a board good

Not length. Not the number of solutions. This:

> every direction looks wrong → you look again → oh. **OH.** → you play it → it all lands

An earlier version of this campaign searched for the *longest* solution it could find and
shipped whatever came back. The measurement that replaced it renders a brutal verdict on
the result:

| Old stages | Diagnosis |
|---|---|
| 1, 2, 4 | **unlock 0** — a player who is not thinking solves them cold. There is no idea in them. |
| 10 – 20 | **unlock ≈ par** — every single move has to be found separately. That is not depth, it is a corridor with fifty doors. |
| almost all | **blindness 0** — the first move anybody would try is the correct one. |

A board that takes fifty tilts and never once surprises you is worse than one that takes
five and does. So no slot asks for a length any more. Each states **one thing the player
should notice**, and requires the measured signature of a board that can only be solved by
noticing it.

### The five measurements that carry the design

| Measured | What it means |
|---|---|
| **unlock** | How many correct moves the board costs before it starts playing itself. Model the player who has not seen it yet — collect if you can, otherwise tilt toward the goal — and ask how many correct moves they must be *given* before the rest falls to them for free. **0** means the board contains no idea. **≈ par** means every move is its own separate fight: a corridor. **1 or 2** means there is exactly one thing to see, seeing it is the whole puzzle, and everything after it is the reward for having seen it. |
| **flow** | `par − unlock`: how much stage is left to enjoy having seen it. |
| **blindness** | Where the correct opening sits in the order a hurrying player would try the four tilts. **0** means their instinct is right and the board has nothing to say. **3** means every appealing move is a lie and the answer is the one that looks like a waste of time. |
| **jam** | How much of the board is *silently* unwinnable. Not difficulty — unfairness. A stage is allowed to be brutal and is not allowed to be sly. Dead ends where the player watched a block shatter are counted separately, because those told them something. |
| **pump** | How much of the solution is one pair of directions repeated. A board can score perfectly on all of the above and still be a chore, because the eight free moves after the crux turn out to be `L U L U L U L U`. The idea cost one move; the execution cost eight. |

Alongside these, every stage is scored 0–10 on ten axes: clarity, discovery, insight,
surprise, prediction, elegance, density, fairness, satisfaction, replayability. There is
deliberately **no single total** — a board that is 10 for surprise and 2 for fairness is not
"a 6", it is a board that cheats, and averaging would hide that. Every stage in
`src/stages.js` carries its scorecard in a comment, so the data file explains its own
contents.

## How the boards are found

The obvious approach makes a board, solves it, scores it, throws it away, and starts again
— one full breadth-first search per candidate. That is enormously wasteful, because every
board sharing a terrain (the same walls, goals and hazards, blocks elsewhere) shares almost
all of its search.

So instead: **fix the terrain and solve the game once for every placement of the blocks
simultaneously.** One graph, seeded from all starts at once, yields the exact shortest
solution for every placement from a single backward sweep, which positions are dead and
whether they are dead loudly or silently, and what the naive player does from every
position as one pass over a functional graph. Scoring a candidate afterwards is arithmetic
on lookup tables rather than a search.

That is what makes the expensive thing affordable: **at 3×3 and 4×3 the search is
exhaustive.** Every arrangement of walls, goals, hazards and blocks inside a budget, up to
rotation, reflection, and which colour is called A. When the campaign says a board is the
best one for a slot, that is a statement about the design space, not about the search.

A board ships only if all of these hold:

| Gate | Meaning |
|---|---|
| solvable | breadth-first search finds a solution at all |
| has an idea | `unlock ≥ 1` — the naive player cannot solve it cold |
| the right idea | it meets that slot's unlock / flow / blindness / trap / device signature |
| at least three live tilts | a board where gravity works in one direction is a corridor with one door |
| low luck | random par-length tilting essentially never clears it |
| honest dead ends | silent unwinnable positions stay under the slot's ceiling |
| **no dead weight** | delete any wall, block, goal or hazard and the puzzle measurably changes |
| distinct | not a rotation, reflection or recolouring of another stage, and never the same terrain *and* block count |

### Three things the exhaustive search turned up

Worth recording, because each one changed the design rather than merely confirming it:

- **Nine cells is not an inexhaustible well.** Sweeping the *entire* 3×3 design space under
  the base rules finds exactly **two** boards whose correct opening is the last one instinct
  would suggest and which carry no dead weight — and they share a terrain. The game already
  ships most of the genuinely excellent 3×3 base boards by stage 5. Rather than pad chapter
  two with near-misses, the two slots 3×3 cannot supply are allowed twelve cells.
- **About six boards in seven are carrying a piece the board would not miss.** Across the
  campaign's finalists the deletion test rejects **88%**. It is the most expensive gate and
  by a distance the most useful.
- **A perfect crux is not enough.** Two stages passed every measurement above and were
  still wrong, and it took looking at the filmstrips to see it: `unlock 1`, `flow 8`, and a
  tail that was `L U L U L U L U`. Nothing being measured could tell a reward from a pump
  handle. Adding that one measurement and re-running the search replaced both boards — and
  the replacement for stage 8 is *longer* than what it replaced (11 tilts against 10) while
  scoring higher on discovery, density and satisfaction. Length was never the thing that
  was wrong with them.
- **Combining both devices loses.** 26,744 boards carrying a hazard *and* two colours were
  built and measured, and the best was compared against the best single-device board across
  all ten axes. The combined board is longer (15 tilts against 10) and more surprising — and
  loses **6 axes to 2**, because it is harder to read and 4% of its positions are quietly
  unwinnable rather than visibly so. Length and surprise do not outrank being legible and
  being fair. Had it won, it would be in the campaign; this is a result, not a rule.

Because blocks of one colour are identical, two positions differing only by swapping two of
them *are* the same position, and the solver says so. That is not an optimisation — it is
what "these two blocks are the same block" means, and it is why the par on screen is real.

## The campaign

**Twenty stages, all of which are worth playing** — rather than a hundred that are mostly
filler. Every slot is a stated idea with a required signature; the search runs against it
and one board out of tens of thousands survives.

| Ch | Name | Stages | Board | Rules | What it is |
|---|---|---|---|---|---|
| 1 | GRAVITY · 重力 | 1–5 | 3×3 | base | the whole vocabulary, one idea per board, ending with the first board that turns on you |
| 2 | NINE · 九マス | 6–10 | 3×3, 4×3 | base | nothing new added — just the same four things made to work much harder |
| 3 | EDGE · 境界 | 11–15 | 3×3, 4×3 | + hazard | a square you may cross and may not stop on: it removes places to rest, and having nowhere to rest is what makes nine cells deep |
| 4 | PAIR · 対 | 16–20 | 3×3, 4×3 | + colour | a goal that is a hole for one block and a floor for the other, so finishing early is how you lose |

Boards stay small on purpose — nothing exceeds 4×3, and eleven of the twenty are nine
cells. **Small board, high thought density** is the point, not a beginner's concession: the
hardest hazard board in the game is 3×3 with three blocks and takes nine tilts.

Par is a target, not a requirement. Clearing in more moves is a normal clear, and your best
is kept so you can come back and shave it down.

Four stages exist to put a rule on screen for the first time (1, 2, 11, 16) and are allowed
to be gentle; each says so in its own note. Everything else has to earn its place.

## Playing

- **Swipe** anywhere on the board. The direction you are aiming at lights up on the board
  edge *before* you release, so a mis-swipe is something you see rather than something that
  happens to you.
- **Tilt** the device, if you enable it. A tilt must be held briefly before it commits and
  must return to centre before it fires again. Swipe alone plays the whole game.
- **Arrow keys / WASD** on a desktop. `Z` undo, `R` restart, `Esc` stage list.
- **UNDO costs nothing and is meant to be used.** It works *during* a slide too — pressing
  it while the board is still moving cancels the move rather than being ignored. On the ten
  base-rule stages nothing can be destroyed at all; on a hazard stage a lost block makes the
  board unwinnable, the dock says so immediately, and one tap takes it back.
- **RESTART is always answerable**, mid-slide included.
- **You are never walled off.** Stages unlock in sequence, but you may always reach two
  stages past your frontier — one puzzle you cannot see the trick to never ends the run.

Every colour carries its own **shape** as well as its own hue — the dot on a block and the
ring on the goal that accepts it are always the same shape — so the board is fully readable
without colour vision. A wall is drawn raised and lit from above; a hazard is drawn as a
pit sunk below the floor. One stops things, the other is crossed.

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
tools/campaign.js     the twenty slots as design briefs; regenerates src/stages.js
tools/lib/design.js   what makes a board good — every measurement above
tools/lib/generate.js terrain sweeping, exhaustive enumeration, climbing, variation
tools/audit.js        rules suite, per-stage proof, campaign-wide design checks
tools/forge.js        exhaustive search of one corner of the design space
tools/probe.js        prints a stage's solution as an ASCII filmstrip
tools/qa.js           drives the real page in a real browser
tools/serve.js        static server for playing on a phone
```

`engine.js` and `stages.js` load both as browser globals and as CommonJS modules, so the
solver and the tests exercise the exact code the player runs — there is no second
implementation of the rules to drift out of sync.

## Tests

```
npm run audit      # rules suite, then every stage, then the campaign as a whole
npm run qa         # real browser: plays every stage, then UI, undo, layout, touch, tilt, save
npm test           # both
npm run campaign   # rebuild src/stages.js from tools/campaign.js
```

**`audit` has three parts.** First a **rules suite**: 32 property tests on purpose-built
micro-boards, each pinning one rule to a board that does nothing except demonstrate it.
These do not depend on the campaign at all, so they keep working — and keep failing usefully
— no matter what the generator ships next. Then **per stage**: par is the proven shortest,
blocks never overlap or enter walls or leave the board or rest on a goal that should have
taken them (*including at every intermediate animation tick*), bookkeeping never drifts, the
same input always gives the same result, and every piece is load-bearing. Then the
**campaign as a whole**: each device is introduced by a stage that explains it, no two
stages are the same puzzle, and nothing uses more rules at once than the design allows.

Per-stage checks include deliberately hostile operation sequences — the same direction nine
times, undo held past the beginning of the stage, restart pressed on the winning move — none
of which is a plausible way to play, which is exactly why they are the ones that find bugs.
Two real defects came out of writing them: undo and restart were both being silently ignored
while a slide was animating.

Counting in the audit is deliberately its own implementation rather than a call into the
generator's measurement code. An auditor that shares arithmetic with the thing it audits
cannot catch that arithmetic being wrong — and on 235 boards the two implementations agree
exactly.

`qa` drives a real mobile-sized Chromium through the real input path: it plays all twenty
stages to par, destroys a block on purpose and checks the game announces it and offers the
way back, verifies each colour has a distinct shape and not merely a distinct hue, and
checks the board fits five viewports from a 320px phone to a tablet.
