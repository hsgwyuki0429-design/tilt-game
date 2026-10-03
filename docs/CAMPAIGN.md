# One floe, two penguins · October 2026 campaign

## What changed

Walls are gone. Where the old boards had an ice wall, the new ones have **open
water**: the floe simply has no ice there. A penguin gliding towards a hole
stops at the edge of the ice exactly as it always stopped at the rim of the
board, so the engine and its rules are untouched — `#` still means "nothing to
stand on". What changed is what the picture says, and which boards are worth
playing on it.

Every board is 4×4. Levels 1–3 have one penguin; levels 4–100 have two, one of
each colour, each with one matching aurora.

## One solid floe

The ice has to read as a single object you could pick up, so a board is only
considered when:

- its ice is **one edge-connected piece** — two cells touching only at a
  corner do not hold each other up;
- the ice **spans the full 4×4** — every row and column has some, otherwise it
  is a smaller board in a bigger frame;
- its **centre of mass is within half a cell of the board's centre**, so the
  slab sits level instead of hanging off one side.

Up to rotation and reflection that leaves **1,051 floe shapes**.

## Searched exhaustively, not sampled

`tools/floe-search.js` enumerates every one of those shapes, every placement
of one or two auroras, and every start: **64,323 aurora layouts and 3,992,244
starts**. For each layout it builds the complete position graph once — every
legal placement of both penguins, including half-collected positions — and
answers every start from it. The accelerator in `tools/lib/floe.js` is checked
transition by transition against `src/engine.js` (`tools/floe-test.js`), and
every shipped board is re-solved by the engine itself (`tools/campaign-test.js`).

## What a board must have

| Rule | Why | Starts removed |
|---|---|---:|
| fair: no ordinary move — one that collects nobody — can make the board unsolvable | exploring must be safe; only collecting too early may strand a partner | 380,138 |
| the penguins need each other: **no solution exists in which neither ever stops the other** | the point of two penguins is the interaction | 1,038,058 |
| no corridor: at most two forced moves in a row on the shortest route | a long forced line is length, not thought | (in selection) |
| at most two moves of lone clean-up after the first collection | the ending stays a duet | (in selection) |
| at most three fatal "collect now" temptations on the shortest routes | a temptation is an idea; many are a trap | (in selection) |
| the solution uses at least 60% of the ice | no decorative ice | (in selection) |

A **brake** is counted only when it decides where the braked penguin stays: a
penguin that stops behind its partner and glides on when the partner is
collected was not braked.

Among the boards where interaction is necessary, **MUTUAL** boards are the
ones where *each* penguin must stop the other at some point in every solution
— neither can do its job alone. 83,676 starts are mutual. The campaign is
built from them: 94 of the 97 pair boards are mutual; the three that are not
(levels 4, 5 and 7) teach the brake with one helper first.

## Difficulty is not par

A long board can be easy — one obvious move after another — and a five-move
board can stop people for minutes. So the campaign is ordered by a simulated
player, not by length.

The **explorer** sees only the board and the par the HUD shows. It:

- plays a finish it can see two swipes away;
- otherwise prefers positions it has not been in, leans towards moves that
  bring penguins nearer their auroras, and usually grabs a collection when one
  is offered (exactly the instinct a mutual board punishes);
- pays for a dead end, remembers it, and uses the recovery button;
- restarts after a few swipes more than par without finishing, keeping what it
  learnt.

Its cost — the geometric mean of swipes to solve over 600 seeded runs per
board — is the difficulty. A twelve-move board where every move is natural
(`B#../a.../...b/..#A`) costs it about 16 swipes; a six-move board that needs
one penguin parked as a floor for the other (`aB../b#../A.../..#.`) costs it
about 125. The campaign climbs that cost
geometrically from 2 swipes to 186, with par anywhere from 2 to 13 along the
way:

| Chapter | Levels | Par | Explorer swipes | Mutual |
|---|---|---|---|---:|
| 1 FIRST LIGHT | 1–10 | 2–6 | 2–7 | 4 |
| 2 PARTNERS | 11–20 | 5–7 | 7–11 | 10 |
| 3 BRAKES | 21–30 | 4–8 | 11–15 | 10 |
| 4 CROSSROADS | 31–40 | 6–10 | 16–20 | 10 |
| 5 SETUP | 41–50 | 7–11 | 22–30 | 10 |
| 6 EXCHANGE | 51–60 | 8–11 | 30–41 | 10 |
| 7 BALANCE | 61–70 | 9–12 | 43–59 | 10 |
| 8 PATIENCE | 71–80 | 8–12 | 61–88 | 10 |
| 9 DISCOVERY | 81–90 | 8–13 | 89–118 | 10 |
| 10 FINALE | 91–100 | 10–12 | 129–186 | 10 |

The explorer is a model, not a person. It is a better ruler than par because
it charges for what people find hard — moves that look wrong, collections that
must wait, a partner parked as a floor — and not for length.

## Choosing among the good ones

Within each quarter-step of difficulty the builder ranks boards by:
mutual over one-sided help; more brakes in the cheapest solution; a penguin
that can only be collected by being braked onto its aurora; one or two fatal
temptations; at least one move away from the auroras; a single shortest route;
then fewer forced moves, a shorter lone ending, more of the ice used, and a
better-balanced floe.

Variety is enforced, not hoped for:

- every level has a **different floe shape** and a **different placement of
  pieces** (both under rotation, reflection and colour swap), so no board is
  another with one hole moved;
- boards whose two auroras touch are capped at about a third of the campaign
  (36 of 100), because "stack them and drop them together" is one idea;
- a shortest route already used costs a board its place to an equal one.

The shipped hundred: 91 have a single shortest solution, 95 need a penguin to
be braked onto its aurora, 68 need at least three brakes, and every mutual
board has at least one tempting collection that strands the partner.

## Reproduce

```sh
node tools/floe-search.js            # every 4×4 floe → tools/.floe-cache/pool-4x4.json (~2 min)
node tools/floe-campaign.js --pool tools/.floe-cache/pool-4x4.json
node tools/floe-campaign.js          # rebuild src/stages.js from tools/floe-selection.json
npm test
```

The search and the explorer are seeded; running the two commands above
reproduces `tools/floe-selection.json` and `src/stages.js` byte for byte.
`tools/floe-selection.json` keeps every measurement the choice was made on.

Scores use `tilt.save.floe.v4`. The previous `tilt.save.duo.v3` stays intact;
sound, haptics and reduced-motion preferences carry over.
