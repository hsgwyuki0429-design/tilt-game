# Finding good boards

The shipped campaign was built by looking for **long** boards. This is the
system for looking for **good** ones.

They are not the same search and they do not want the same answer. A fifty-move
board can be fifty moves of one idea; an eight-move board can be the best thing
on the ice. The board this system is hunting looks like nothing at all —

> four by four, two penguins, one wall. You look at it and think *is that it?*
> You swipe once and find that going straight at the aurora sails over the top
> of it. You look again and see that if the other penguin is parked *there*, it
> becomes a wall. You go one square the wrong way on purpose, and it works.
>
> **Ah — I see.**

Everything below exists to find more of those.

## What is deliberately not rewarded

These are the rules the whole system is built to obey, and several of them are
asserted in `tools/analysis-test.js` so a later change cannot quietly drop one:

| Not a virtue | Why |
|---|---|
| a long par | length is the axis, not the quality. Every event count is divided by par, so a short board with an idea beats a long board with one. |
| more walls | a wall that changes nothing is a flaw and is priced as one; walls count against simplicity either way. |
| a bigger board | 5×5 is not 4×4 plus difficulty. It is 4×4 plus nine cells to look at. |
| more reachable positions | a wide graph is load, not depth. It appears only in `cognitiveLoadScore`, which is never added to fun or difficulty. |
| more dead ends | an unrecoverable move is a trap, not a challenge. A few make a board sharp; many make it unfair. |
| more special pieces | both `simplicityScore` and `depthPerElement` push the other way. |

## Board size

**4×4 is the main tray.** It is small enough to sweep exhaustively to three
walls in a couple of minutes, and it is where the "small but deep" board lives.
The search spends its budget accordingly: 4×4 to three walls, 5×5 to two,
because a 5×5 with the same budget is a hundred times the work for boards that
are, cell for cell, emptier.

**5×5 is for what 4×4 cannot hold** — a longer interaction, a real orbit, a
setup that needs the room. It is never treated as "the harder tray"; a 5×5
whose whole game happens inside a 4×4 corner is charged twice for it, once for
the cells that do nothing (`activeAreaRatio`) and once for the empty band
(`sizeEfficiency`).

**6×6 and larger are not searched.** A wider tray adds search space and visual
load faster than it adds depth. Nothing in the analysis is hard-wired to 4 or 5
— `--size` takes what the enumerator supports — but the main pool is these two.

**3×3 is not in the main pool.** It is too small to hold a second idea. If a
tutorial ever wants one- and two-move boards, `--size` and `--min-par 1` will
produce them; the campaign pool starts at par 3.

**Drifters and cracked ice are not in the main pool either.** Both make a board
harder to *hold in your head* rather than harder to see into — a drifter is a
third object to track, cracked ice is a rule to remember — and TILT's depth is
supposed to come from gravity meeting itself. The engine still supports both and
`--drifters` / `--hazards` still search them; neither is in a default pass.

## The pipeline

```
tools/level-search.js   the same enumeration, the same backward BFS, the same
   (as a library)       exact pars — imported, not rewritten
        │
        ▼
tools/fun-search.js     phase A → phase B → phase C, then buckets
        │
        ├── tools/lib/level-analysis.js   what the board asks   (exact)
        │      └── tools/lib/fun-score.js  what that is worth   (estimated)
        │
        ▼
tools/fun-level-index.json               a shortlist, not a campaign
        │
        ▼
tools/fun-browser.html                   a person plays them and decides
        │
        ▼
tilt-fun-reviews.json                    the only opinion worth trusting
```

Nothing expensive runs on a board a cheap test could have refused:

| Phase | Cost | What it decides |
|---|---|---|
| **A** | free | par, tray, wall budget, drifters — from the numbers the enumerator already has, before a board is built at all |
| **B** | ~0.1 ms | one position graph and one backward BFS: dead ends, forced moves, branching, whether three of the four opening swipes are fatal |
| **C** | ~0.5 ms | the full analysis — every move replayed, every wall tested by removing it — then a kind, a difficulty and a bucket |

Everything phase B refuses, it refuses for a reason that is exactly true rather
than estimated: the graph says so.

## The measurements

All exact, all read off the position graph `src/engine.js` builds. `par` here is
the same number `E.solve` returns, and `tools/analysis-test.js` checks that on
every shipped stage and on a slice of the measured index.

### Basics

| Name | Meaning |
|---|---|
| `par` | shortest solution, in swipes |
| `boardSize` | 4 or 5 |
| `penguinCount`, `wallCount`, `hazardCount`, `drifterCount` | what is on the board |
| `elementCount` | all of the above added up: how many things the player is looking at |
| `reachableStateCount` | positions reachable from the opening |
| `activeAreaRatio` | share of cells the puzzle actually uses — a penguin passes through or stops on it, it holds an aurora, or it holds a wall something stops against |
| `activeBoundingSide` | the side of the smallest square those cells fit in. Less than `boardSize` means the board has a border drawn round it. |

### Aha

The naive read of a position is the total Manhattan distance from each penguin
to its own aurora — deliberately the wrong model of the game, because penguins
slide rather than walk. A move the naive read hates and the solver needs is the
shape of an aha.

| Name | Meaning |
|---|---|
| `moveAwayFromGoalCount` | times a penguin's own distance to its aurora goes **up** on the shortest line |
| `goalPassThroughCount` | times a penguin slides across its own aurora without stopping on it |
| `delayedCollectionCount` | positions where a penguin could be collected right now and the shortest solution does something else first |
| `counterIntuitiveMoveCount` | moves where the swipe the solver needs looks worse than another one on offer |
| `deceptiveChoiceRatio` | share of positions where a **non-optimal** move looks better than every optimal one |
| `requiredLookahead` | longest run of moves that neither collects anything nor even looks like progress — how far you have to commit on faith |

### Penguins on each other

| Name | Meaning |
|---|---|
| `penguinBrakeCount` | times a penguin moved, stopped, and the thing that stopped it was the other penguin |
| `dependencyCount` | times a move ended differently than it would have with the other penguin taken off the ice — measured one move at a time, not once over the whole run, because two trajectories that diverge once never come back together and the whole-run version scores every board the same |
| `collectionOrderDependency` | `1` only one order ever wins, `0.5` both can win but only one is shortest, `0` free |
| `sharedGravityInteractionCount` | tilts in which both penguins moved |
| `soloIndependent` | true when the penguins never affect each other — two penguins, one puzzle's worth of thinking, and heavily penalised |

### Choice

| Name | Meaning |
|---|---|
| `meaningfulDecisionCount` | positions where the four swipes are worth **three** distinguishable amounts — the line, a detour you can still win from, and something you cannot. Two is not a decision; on an open tray every position has two. |
| `forcedMoveRatio` | share of positions with no choice at all |
| `averageUsefulBranching` | average number of swipes that keep the board winnable |
| `wrongButRecoverableCount` | moves off the shortest line you can still win from |
| `deadEndMoveCount` | moves after which the board can never be cleared |
| `openingDeadEndRate` | share of the four opening swipes that lose the board outright |
| `singleSafeMoveRatio` | share of positions with exactly one swipe that keeps you alive |

### Shape of the answer

| Name | Meaning |
|---|---|
| `directionEntropy` | how evenly the solution spends the four directions, 0…1 |
| `repeatedPatternPenalty` | short-period repetition, periods 1 to 4. `R D L U` three times over is twelve moves and one idea. Solutions under six moves score 0 — being short is not being repetitive. |
| `stateChangeDensity` | how much each tilt actually changed: pieces moved, a collection, a new brake, the set of safe swipes |
| `revisitCount` | times a penguin comes back to a cell it has already rested on — the long way round |
| `turnShape` | the solution written as turns instead of compass points, so it survives rotating the board |

### Walls

| Name | Meaning |
|---|---|
| `meaningfulWallCount` | walls that, removed, change the par or break the board |
| `redundantWallCount` | walls that change nothing. **A board with any of these is heavily penalised** — this is the same rule the shipped campaign is held to. |

## The estimates

These are **not** measurements, and they are named so you can tell. `funPotential`
0.74 means "worth going and playing"; it does not mean the board is fun. Nothing
downstream treats it as if it did.

Every event count is divided by par and passed through `x / (x + k)` before it
is weighed, so no single count can run away with a score and a long board never
scores merely for being long.

| Name | What it is |
|---|---|
| `ahaPotential` | the four aha counts, per move |
| `interactionScore` | brakes and dependency, per move; zero for one penguin, quartered when the two penguins never touch |
| `choiceScore` | decisions and recoverable mistakes, less a penalty for a board that is mostly traps |
| `solutionEleganceScore` | direction entropy, state-change density, and the repetition penalty |
| `simplicityScore` | `3 / elementCount`, capped at 1 — three pieces is free, everything after costs |
| `sizeEfficiency` | `activeAreaRatio × (1 − empty band) × (4 / boardSize)`. The minimum-board rule as arithmetic: the same puzzle on a 4×4 scores strictly better than on a 5×5. |
| `depthPerElement` | par, decisions, aha events and interaction events over the number of pieces |
| `difficultyScore` | par is a quarter of it. The rest is decisions, look-ahead, interaction, aha and deception, scaled back down by `forcedMoveRatio`. |
| `cognitiveLoadScore` | moving objects, walls, cracked ice, graph size, tray size. **Never added to difficulty or to fun** — it exists so a board that is merely busy can be told apart from one that is deep. |
| `funPotential` | a weighted blend of the above, then multiplied by the flaws: idle walls, forced moves, repetition, a fatal opening, penguins that ignore each other. The penalties are the part worth trusting — a flaw is far easier to be sure of than a virtue. |

## Kinds

A board is not a point on a difficulty line, it is a *kind* of board, and the
campaign wants a spread of kinds far more than it wants the hundred highest
numbers. A board can be several at once; most of the good ones are two or three.

| Kind | What it means |
|---|---|
| `AHA` | the obvious move is wrong and the right one looks wrong |
| `INTERACTION` | the two penguins are one puzzle |
| `CHOICE` | real decisions, not a corridor |
| `SEQUENCE` | order matters; you have to set up before you collect |
| `PRECISION` | one line through, and it has to be exact |
| `ELEGANT` | almost nothing on the board and a clean answer |
| `TRAP` | the tempting move loses |
| `ORBIT` | somebody has to go the long way round and come back |
| `HAZARD` | cracked ice is doing the work (never in the main pool) |
| `MASTER` | several of the above at once, and hard |

The thresholds are percentiles, not taste: each was set by measuring every 4×4
two-penguin board of par 4 or more — eighty-nine thousand of them — and cutting
where the top fifth to top tenth begins. `tools/analysis-test.js` asserts the
membership rates stay between roughly 0.5% and 45% of that population, because a
category that fits half of everything is not a category and one that fits
nothing is not a shelf.

A board matching **no** kind is not kept. That is the filter, and about a third
to a half of everything the enumeration produces falls through it.

Difficulty bands — `tutorial` `easy` `medium` `hard` `expert` — come from
`difficultyScore`, never from par alone. The cuts sit where the 4×4 population
actually sits, so the top band is reachable on the small tray; a ladder whose
hardest band no 4×4 can reach would hand the end of the campaign to the bigger
tray by accident.

## Buckets

Candidates are filed by **kind × difficulty × tray**, and each bucket keeps its
own best `--keep`. Keeping the N best overall would come back with N boards of
one kind, because whatever the score likes most it likes many times.

Inside a bucket, two more caps stop one idea taking the whole shelf: at most two
boards may share a **solution fingerprint** and at most two may share a
**skeleton**.

The fingerprint is built from the shape of the answer — the turn sequence, and
what each move did — rather than from the board, so it survives rotating,
reflecting and recolouring, and it collides exactly when two different-looking
boards want the same moves for the same reasons.

Ranking inside a bucket is the selection rule from the brief, in order:

1. `funPotential` — an estimate, and it goes first only because something has to
2. fewer pieces
3. the smaller tray
4. fewer idle walls
5. shorter
6. canonical id, so two runs cannot disagree

## Running it

```sh
npm run search:fun                       # the standard pass, a few minutes
node tools/fun-search.js --quick         # a four-second smoke run
node tools/fun-search.js --size 4        # the small tray only
node tools/fun-search.js --category AHA
node tools/fun-search.js --min-par 5 --keep 30 --limit 800
node tools/fun-search.js --help
```

A standard pass sweeps 4×4 to three walls and 5×5 to two, then reads
`tools/level-index.json` — 3.3 billion boards' worth of existing measurement —
for the wall budgets a fresh pass cannot afford. **That index is only read.** It
is never rewritten, replaced or regenerated by this tool.

The output is deterministic. There is no randomness anywhere in the tool and no
seed to set: the enumeration is a sweep, the analysis reads a graph, the output
is sorted and nothing is timestamped, so the same command twice produces the
same file byte for byte.

`--budget N` caps how many boards are analysed **per corner** of the space — one
tray, one piece count, one wall count, or one length of the index — so a capped
run still sees every corner instead of spending the whole cap on the first one.
It truncates each corner's sweep rather than sampling it, and the sweep visits
cells in a fixed order, so a budgeted run sees boards with their pieces in one
part of the tray. That is what `--quick` is for; a pass you intend to draw
conclusions from sets no budget and is exhaustive.

## Playing the candidates

```sh
node tools/serve.js
# open http://localhost:8080/tools/fun-browser.html
```

The browser loads `tools/fun-level-index.json` and plays it on the game's own
`src/engine.js`, `src/render.js` and `src/input.js` — so a board that plays
wrong here plays wrong in the game.

- **Play** by swiping the board, or with the arrow keys / WASD. The status line
  says how many moves are left from where you are, and tells you the moment the
  board has become unwinnable.
- **PREVIOUS / NEXT** (or `j` / `k`), **RESTART** (`r`), **UNDO** (`u`),
  **SHOW SOLUTION**, **PLAY SOLUTION**, **COPY BOARD**.
- **Filter** by tray, kind, difficulty, wall count, par range, and review state
  (unreviewed / KEEP only / MAYBE). **Sort** by fun, aha, interaction,
  simplicity or par.
- **Rate** each board: FUN 1–5, DIFFICULTY 1–5, the flags TOO CONFUSING, TOO
  LINEAR, UNFAIR and AHA, and a verdict of KEEP, MAYBE or REJECT.
- Every panel of numbers above is shown beside the board, including a warning
  when a candidate carries an idle wall or is a position the shipped campaign
  already walks through.

Reviews are stored in `localStorage`, keyed by the candidate's stable id — a
hash of its canonical board — so re-running the search with different settings
keeps every verdict already recorded. **EXPORT REVIEWS** writes
`tilt-fun-reviews.json`; **COPY** puts the same JSON on the clipboard; **IMPORT**
reads one back, which is how a review session moves between machines.

## What this does not do

**It does not touch `src/stages.js`.** The shipped hundred stay exactly where
they are, as the thing to beat. Turning reviewed candidates into a campaign is a
separate step and deliberately not coupled to this one — the search finds
boards, a person decides which are good, and only then does anything decide what
order they go in.

When that step is built, the priority order is:

1. what a person thought of playing it
2. a spread of kinds
3. `funPotential`
4. difficulty
5. par

and the curve should be a gentle rise with small waves in it — a hard board,
then a short beautiful one to breathe — rather than a straight line. Chapters
should deepen the existing rules (walls as brakes; the other penguin as a wall;
place first and use later; go backwards once; order matters) rather than adding
new ones.

## Still approximate

Honest about what these numbers are:

- **The naive-distance heuristic** behind every aha count is Manhattan distance,
  which ignores walls entirely. It is a model of a player who has not yet
  understood the board — which is the right model for "would this surprise
  someone" — but it is not a model of a good player.
- **`counterIntuitiveMoveCount` and `deceptiveChoiceRatio`** are measured against
  that same one-move-deep greedy player. A trap that only a two-move-deep player
  would fall into is not counted.
- **`activeAreaRatio`** is computed over every position on a shortest line, but
  falls back to the single canonical solution when a board has more than 240 of
  them. Boards that large are rare on 4×4 and 5×5.
- **`requiredLookahead`** is the longest run of moves that neither collects nor
  reduces naive distance. It is a decent proxy for "how long you are working
  blind" and not a proof that no shorter plan exists.
- **The default pool leans short.** Every event count is divided by par, which
  is deliberate — it is what stops a long corridor beating a short idea — but it
  means a par-4 board with three surprises in it out-scores a par-20 board with
  six, and a standard pass comes back with most of its candidates between par 3
  and par 6. The long end is not unreachable, it just has to be asked for:
  `node tools/fun-search.js --min-par 12` shortlists boards of twelve moves and
  up, and reaches par 26 out of the existing index.
- **The `hard` band is wide.** Because difficulty is not read off par, `hard`
  holds boards from four moves to seventeen, and inside one bucket the shorter
  one usually wins on `funPotential`. That is the intended preference, but it
  does mean "hard" alone does not tell you how long a board is; the par filter
  in the browser does.
- **The category thresholds** were fitted to the 4×4 two-penguin population. The
  5×5 boards that come out of `tools/level-index.json` are a shortlist of *long*
  boards, so kinds that accumulate with length — `AHA`, `ORBIT`, `SEQUENCE` —
  are commoner there than they would be in a fair 5×5 population.
- **`funPotential` is an estimate.** Every weight in it was chosen by hand. It
  decides what you are shown first, and nothing else; the browser exists because
  a person still has to play the board.
