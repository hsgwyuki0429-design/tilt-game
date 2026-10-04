# The large-floe band (stages 101–160)

60 boards on floes from 4×4 up to 6×6, two penguins, no cracked ice, picked by the main campaign's own rules. Shortest solutions run **11 to 44 moves**.

## What a board has to be

- One edge-connected floe spanning the board, centre of mass within half a cell of the centre. Open water is the old wall: the engine's rules are unchanged.
- Fair: an ordinary move (one that collects nobody) never strands the pair; collecting a brake too early is the only irreversible mistake.
- A partner must be used as a brake. At most two forced moves in a row, two lone clean-up moves and three fatal "collect now" temptations on the shortest routes; the solution uses at least 60% of the ice.
- Mutual boards (each penguin has to stop the other at least once) first. A shape or piece layout is never used twice, and boards with touching auroras are rationed, as in the main campaign (23 of 60).
- Re-solved on `src/engine.js`: the shortest solution equals the stated par, and no ordinary move strands the pair anywhere in the reachable graph.

## Order

As in the main campaign, by how hard a simulated player finds a board. The explorer finishes the short boards (par up to 18 here) and its swipes set their place. On the longer boards it mostly does not finish — in a sample of 40 mutual boards per tray, 39 or 40 with par 15–24 ran into a 3,000-swipe ceiling, and some boards as short as par 14 here defeat it — so 16 of the 60 boards are ordered by that ceiling, which grows with par, and sit after every board the explorer can solve, with a few short boards the explorer finds very hard placed among them. Par is capped at 45.

## Search

338 million layouts sampled by local search (move a piece of water or an aurora, keep what scores better) over 1200 worker-minutes; 47243 distinct candidate boards; the explorer measured the best of each tray and par; the final climb is geometric between the difficulty where the main campaign ends and the hardest boards found. These are search results, not proofs of a maximum.

## Honest limits

- Nobody has played these. Order comes from the engine and a simulated player, which is crude: it sees a finish two swipes away and nothing else.
- Not tried on a real phone or GPU.

## Chapters

| # | name | stages | note |
|---|---|---|---|
| 11 | WIDE FLOE | 101–110 | Larger floes, 5x4 · 5x5 · 6x4 · 6x5. Par 11–14. |
| 12 | ARCHIPELAGO | 111–120 | Larger floes, 5x4 · 5x5 · 6x4 · 6x5 · 6x6. Par 11–16. |
| 13 | LABYRINTH | 121–130 | Larger floes, 5x4 · 5x5 · 6x4 · 6x6. Par 12–17. |
| 14 | LONG NIGHT | 131–140 | Larger floes, 5x5 · 6x4 · 6x5. Par 11–18. |
| 15 | DEEP FREEZE | 141–150 | Larger floes, 6x4 · 6x5 · 6x6. Par 12–29. |
| 16 | THE POLE | 151–160 | Larger floes, 6x6. Par 31–44. |

## Boards

`#` open water, `A`/`B` penguins, `a`/`b` their auroras.

### 101 ICEBOUND · 5x5 · par 11 · mutual

```
ba.B.
..##.
.#.A.
..#..
.....
```

Solution `RDLDLULURUL` · explorer 157 swipes

### 102 SKERRY · 5x4 · par 11 · mutual

```
b....
a.#..
B#.A.
....#
```

Solution `DRURULULDLU` · explorer 166 swipes

### 103 FELL · 5x5 · par 13 · mutual

```
baB..
..##.
.#.A.
.#...
...#.
```

Solution `RDLULDLULURUL` · explorer 177 swipes

### 104 ESKER · 6x5 · par 11 · mutual

```
......
...A#B
.###..
..#..a
.....b
```

Solution `ULDLDRDRURD` · explorer 182 swipes

### 105 OXBOW · 5x5 · par 12 · mutual

```
###A.
.....
.#..b
a....
.B###
```

Solution `URDLURDLURDL` · explorer 190 swipes

### 106 KETTLE · 6x5 · par 11 · mutual

```
##.b..
..a.#.
......
A##B.#
.....#
```

Solution `DRURULDLURU` · explorer 200 swipes

### 107 DRUMLIN · 5x5 · par 14 · mutual

```
.A..#
..#..
..##.
.##.a
..B.b
```

Solution `LURDRDLDRDRURD` · explorer 209 swipes

### 108 TARN · 5x5 · par 13 · mutual

```
#.a..
#...#
....#
#.#AB
.b..#
```

Solution `ULULDRULDRULD` · explorer 220 swipes

### 109 COL · 6x4 · par 12 · mutual

```
##.a.B
.#...#
.A.#.#
#.b..#
```

Solution `RULDRULDRULD` · explorer 229 swipes

### 110 ARETE · 6x4 · par 12 · mutual

```
#....#
#..#.A
..#.b#
#.B.a#
```

Solution `LULDLDRDRURD` · explorer 233 swipes

### 111 SASTRUGI · 5x4 · par 13 · mutual

```
...##
#..B.
..b#.
#aA..
```

Solution `RULDRULDLURDL` · explorer 269 swipes

### 112 NEVE · 5x5 · par 12 · mutual

```
##A#.
....b
a.##B
.....
.##.#
```

Solution `DLURDLURDLUR` · explorer 272 swipes

### 113 FIRN · 6x6 · par 11 · mutual

```
.b###.
.a.#..
......
..#.B.
..#...
#...A#
```

Solution `URDLULULDRU` · explorer 286 swipes

### 114 TALUS · 5x4 · par 12 · mutual

```
#..b.
B.#..
#..A#
..a.#
```

Solution `RDRULDRULDRU` · explorer 307 swipes

### 115 SCREE · 6x5 · par 13 · mutual

```
..#..b
#A#a##
B.#...
......
#..#.#
```

Solution `RDRULDRULULUR` · explorer 324 swipes

### 116 PINGO · 6x4 · par 14 · mutual

```
...#..
.#.A..
..#.#.
ba..B.
```

Solution `DRULDLULDLDRDL` · explorer 331 swipes

### 117 FJELD · 6x4 · par 14 · mutual

```
#.a..#
#...#.
#.#.AB
.b..##
```

Solution `LULULDRULDRULD` · explorer 376 swipes

### 118 LEEWARD · 5x5 · par 14 · mutual

```
#....
#.##a
..##.
.#B.b
A..##
```

Solution `DLULURURURDRUD` · explorer 389 swipes

### 119 WINDWARD · 6x4 · par 15 · mutual

```
abA.#.
..#.#B
.#....
...#..
```

Solution `RDLULULDLULURUL` · explorer 400 swipes

### 120 PERIGEE · 6x4 · par 16 · mutual

```
#....#
#..#b.
B#A#..
...#a#
```

Solution `DRURULDRURURDRUD` · explorer 430 swipes

### 121 KELVIN · 5x5 · par 13 · mutual

```
.A###
b....
.##.a
..B..
##.#.
```

Solution `RDRULDRULDRUL` · explorer 445 swipes

### 122 ARCTIC · 5x5 · par 14 · mutual

```
#.A#.
...#B
.#...
..b..
#.a##
```

Solution `LDLDRDRURDLURD` · explorer 464 swipes

### 123 ALPINE · 5x4 · par 12 · mutual

```
#.###
...bA
...#B
##.#a
```

Solution `LULDRDRURURD` · explorer 511 swipes

### 124 TAIGA · 6x4 · par 15 · mutual

```
....ab
.B##..
....#.
..#..A
```

Solution `LULDRURDRURULUR` · explorer 525 swipes

### 125 STEPPE · 6x4 · par 17 · mutual

```
...#.#
B#..b.
A#....
....#a
```

Solution `URDRURDRURULDRURD` · explorer 556 swipes

### 126 MESA · 6x4 · par 13 · mutual

```
abA.#.
..#...
.###B.
......
```

Solution `RDRDLDLULURUL` · explorer 603 swipes

### 127 BUTTE · 6x4 · par 13 · mutual

```
##....
..b.#.
......
B.#aA#
```

Solution `URURDRULDLURD` · explorer 619 swipes

### 128 GORGE · 6x4 · par 15 · mutual

```
#.a..#
#...#B
A.#...
.b..##
```

Solution `DLURULDRULDRULD` · explorer 646 swipes

### 129 RAVINE · 5x4 · par 14 · mutual

```
.B..#
.##..
.A##.
#a.b.
```

Solution `LURURDRDRDLDRL` · explorer 714 swipes

### 130 CIRRUS · 6x6 · par 15 · mutual

```
#.....
#..A.#
.b.#..
.a.#..
.#..#B
....#.
```

Solution `ULURDLULDLURULD` · explorer 726 swipes

### 131 HALO · 6x4 · par 13 · mutual

```
#.....
....#b
..#.A.
..B.#a
```

Solution `RULDLDRURDRUD` · explorer 798 swipes

### 132 SWELL · 6x4 · par 13 · mutual

```
.A#...
.##a#.
...B..
..#b#.
```

Solution `LDRURULULDLUD` · explorer 816 swipes

### 133 DEW · 5x5 · par 14 · mutual

```
..#a.
.#.b#
.##..
B....
#..A#
```

Solution `LULDRDRULULDRU` · explorer 852 swipes

### 134 FOG · 5x5 · par 15 · mutual

```
B...#
.##.#
..#..
#A##.
#a.b.
```

Solution `ULURURDRDRDLDRL` · explorer 938 swipes

### 135 SNOWFALL · 6x4 · par 14 · mutual

```
.b#.#B
A.#...
#....#
#.a..#
```

Solution `RDLDRULDRULDLU` · explorer 948 swipes

### 136 DRIZZLE · 6x5 · par 13 · mutual

```
.#.Bab
.A.#..
..###.
..##..
......
```

Solution `LDLDRDRURULUR` · explorer 992 swipes

### 137 VERGLAS · 6x4 · par 18 · mutual

```
#...#a
..#A#.
.#..#b
B#....
```

Solution `URURDRDLURDRDRURDU` · explorer 1091 swipes

### 138 SLUSH · 6x5 · par 14 · mutual

```
#.#...
..##..
A....#
aB.b.#
##...#
```

Solution `RULDRDLDLULDRL` · explorer 1122 swipes

### 139 BRASH · 5x5 · par 14 · mutual

```
...B#
#.#..
#.#.A
...a.
.#.b#
```

Solution `LDRDLULDRURULD` · explorer 1160 swipes

### 140 FLURRY · 6x5 · par 11 · mutual

```
bBaA##
......
#..#..
......
.##...
```

Solution `DRDLURULURL` · explorer 1282 swipes

### 141 SHEEN · 6x5 · par 14 · mutual

```
A.B#..
....#.
.##...
a..b.#
#.....
```

Solution `RDRDRDRULDLURL` · explorer 1355 swipes

### 142 HOARFROST · 6x5 · par 14 · mutual

```
.#..ba
.B.#..
....#A
.##.#.
......
```

Solution `DLURDRDRURULUR` · explorer 1374 swipes

### 143 ICICLE · 6x5 · par 12 · mutual

```
#..#.b
#...#.
..B...
.#A.a.
...###
```

Solution `LDRURULDRDRU` · explorer 1462 swipes

### 144 GLAZE · 6x4 · par 14 · mutual

```
......
B#A.#.
..#...
ba...#
```

Solution `URDRDLULDLDRDL` · explorer 1523 swipes

### 145 SEAM · 6x4 · par 14 · mutual

```
...A.#
...#..
.#.B#.
.#b.a.
```

Solution `LULDLURDRDLDRL` · explorer cannot finish

### 146 SPLINTER · 6x6 · par 20 · mutual

```
.....#
...##.
A#..#.
B.#...
...#.b
##a...
```

Solution `URULDRDRDRDLDRULDRDL` · explorer cannot finish

### 147 WEDGE · 6x6 · par 24 · mutual

```
..B..#
..##..
A##...
..#.#.
..#...
ab.#..
```

Solution `URDRDLULDRULURULULDLDRDL` · explorer cannot finish

### 148 GAP · 6x5 · par 27 · mutual

```
...#.#
.#Ba.b
..##.#
#A....
#...#.
```

Solution `ULDRDRDRURULULDLULURURDRDLR` · explorer cannot finish

### 149 SPLIT · 6x6 · par 28 · mutual

```
.#..B.
A...#.
#.#..#
...#.a
.#.##.
....b.
```

Solution `RDRULDLULDLDRDRDRDLDLULURDRU` · explorer cannot finish

### 150 LEAD · 6x6 · par 29 · mutual

```
#....#
...#..
...#..
.#a.#.
.Ab#B.
..##..
```

Solution `DRULULDLURDRURDLURDLDLULDLURD` · explorer cannot finish

### 151 POLYNYA · 6x6 · par 31 · mutual

```
b.##..
#a.##A
..#...
.B.#..
...#..
##...#
```

Solution `RDRURDLULURDLDLULURULURURDLURUL` · explorer cannot finish

### 152 CHIP · 6x6 · par 32 · mutual

```
...#..
.#...#
.#..#a
.####A
....#b
#B....
```

Solution `DLULULURURDRURDLULULDLDRDRDRURDU` · explorer cannot finish

### 153 RIFT · 6x6 · par 33 · mutual

```
...#..
.#....
A###.#
.#.#..
....##
#.B.ab
```

Solution `LULURURDRDRDLURDLULULDLDRDRDLURDR` · explorer cannot finish

### 154 FRACTURE · 6x6 · par 35 · mutual

```
.b....
.#..#.
a.#B..
#..#.#
.#....
...A..
```

Solution `ULDRDRDLURULULDRDRULULULURURDRDLULD` · explorer cannot finish

### 155 CLEAVE · 6x6 · par 36 · mutual

```
.##b..
B...#a
##.#..
...#..
.#...#
...A##
```

Solution `ULURDRDRURDLDLDLULURDLULDRURDRURURUL` · explorer cannot finish

### 156 TREMOR · 6x6 · par 38 · mutual

```
##B..A
#...#.
..##.b
..#.#a
.#...#
...#.#
```

Solution `LDLDLDLDRDRURURULDLDLULURURURURDRDLURD` · explorer cannot finish

### 157 QUAKE · 6x6 · par 39 · mutual

```
a..b.#
##....
..#A#.
...#B.
.#..#.
..#...
```

Solution `URDRDLDLULULULDRURDRDLURDRDRDRURULULURL` · explorer cannot finish

### 158 GROWLER · 6x6 · par 41 · mutual

```
..#..#
.....#
#..#..
##.##B
#.b.#.
a..#A.
```

Solution `RULULDLULDLDRULDLDRDLULDLURDRDRULURDLDRDL` · explorer cannot finish

### 159 BERGY · 6x6 · par 43 · mutual

```
....#.
.#..A.
..##.#
#...##
##baB.
......
```

Solution `RDLULDRDRDRULULULULURURDRDLULULDLDRDRDRDRUL` · explorer cannot finish

### 160 RUPTURE · 6x6 · par 44 · mutual

```
a.#..A
.b..#.
#.####
..#...
.#.B.#
...#..
```

Solution `DLDLURULDLDLURDLDLDRDRURURDLDLULDLDLULURURUL` · explorer cannot finish

