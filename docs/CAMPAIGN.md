# Two penguins · October 2026 campaign

## Delivered lineup

100 newly selected puzzles, 78 on 4×4 and 22 on 5×4. Level 1 is a
three-move, single-penguin introduction. Levels 2–100 have exactly two
penguins, one of each colour, and one matching aurora apiece. Only static ice
walls are used. The shortest solutions rise monotonically from 3 to 31 moves;
the largest adjacent increase is two moves. All wall plans are different under
the board's legal symmetries, so one stage cannot be another's remaining route.

The movement rules are unchanged: glide to rest, collect matching penguins,
then continue settling if collection freed space. All directions use the same
rule. No special direction or hidden rule is introduced to make a puzzle work.

## Ordinary movement must be safe to explore

For every reachable state that is still solvable, every move that collects no
penguin must lead to another solvable state. This is checked over the complete
reachable graph, not just the intended solution. A premature collection may
still strand the partner by removing a needed brake. That consequence is now
explained in the rules and remains recoverable with the recovery button.

The shipping engine independently checked **5,180 reachable states and 9,917
ordinary transitions**, with zero ordinary-move dead ends. It found 472
transitions where premature collection loses the ability to finish. Already
unsolvable positions are not counted as new traps.

## Choosing puzzles rather than corridors

Candidate routes exclude the immediate undo when counting useful alternatives.
The chosen shortest route must have:

- at least two useful options at its opening;
- choices on at least 48% of its moves (the delivered minimum is 65.5%);
- at least 1.5 useful exits on average (delivered minimum: 1.72);
- no more than three consecutive forced moves;
- actual mutual braking, measured against the blocks' solo resting positions;
- no more than four final moves with only one penguin remaining;
- limited repeated four-direction patterns.

The ranking rewards branching, changes of role and moves away from a goal that
prepare a later approach. These are design heuristics, not a claim that a
numeric score proves enjoyment. They remove identifiable sources of tedium and
leave a varied, playable lineup for further feedback.

## Search scope and long puzzles

Six retained runs evaluated **2,319,767 wall/goal graph instances** in total;
different runs can overlap, so this is not a unique-layout count. Each graph
contains every legal two-penguin position for that layout. The layouts were
seeded samples, not an exhaustive search of every board. The final combined
pool contained 6,494 distinct qualifying candidates before campaign selection.

| Retained run | Seed | Attempts | Dimensions | Walls |
|---|---:|---:|---|---|
| fair-pool-4 | 791333 | 50,000 | 4×4 | 2–5 |
| pool-4-wide | 981724 | 400,000 | 4×4 | 2–5 |
| fair-pool-5 | 317955 | 50,000 | 5×4 | 2–6 |
| fair-pool-5-wide | 875390 | 800,000 | 5×4 | 2–6 |
| pool-5-wide | 418792 | 1,500,000 | 5×4 | 2–6 |
| fair-pool-5-dense | 235623 | 500,000 | 5×4 | 5–9 |

The two `pool-*-wide` runs began before the ordinary-move filter was introduced;
every imported candidate was re-evaluated with that filter and the final
cooperation measurement. The current search applies both while generating.

A 37-move board was found and verified with the actual solver:

```text
.B#A.
.b.#a
.#...
###..
```

It has no ordinary-move trap but ends with nine moves by a lone penguin, so it
was not selected. The final stage is a verified 31-move cooperative puzzle.
No 40-move board was found in these samples; no global maximum is claimed.

## Reproduction and checks

`tools/campaign-selection.json` contains the shipped selection, exact route and
design measurements. `npm run levels:build` reconstructs `src/stages.js` from
that file. A new set can be searched and curated using `refresh-search.js` and
`refresh-campaign.js`; README contains invocation examples.

`npm test` proves each par, roster, size, increasing curve, ordinary-move safety,
actual cooperation, branch limits and symmetry using the shipping engine. It
also compares 98,528 accelerator transitions against that engine and checks
preference migration and save isolation. Browser QA plays all 100 solutions
through real input and checks layouts, recovery, menus and persistence: all 171
browser checks passed on the final campaign.
The final 31-move level was also played at normal animation speed. Fresh-touch
testing caught and fixed a renderer clock edge case: a RAF timestamp can precede
the input event that started a slide. Elapsed animation time now clamps to zero,
with a regression test to prevent negative particle-frame indices.

Scores use `tilt.save.duo.v3`. The former `tilt.save.ice.v2` remains intact;
only sound, haptics and reduced-motion preferences carry over. Old best scores
and unlocked level numbers do not mark the replacement puzzles as completed.
