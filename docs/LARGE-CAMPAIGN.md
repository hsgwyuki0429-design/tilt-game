# The large-floe band (stages 101–160)

60 boards on floes from 4×4 up to 6×6, two penguins, no cracked ice, picked by the main campaign's own rules. Shortest solutions run **10 to 43 moves**.

## What a board has to be

- One edge-connected floe spanning the board, centre of mass within half a cell of the centre. Open water is the old wall: the engine's rules are unchanged.
- Fair: an ordinary move (one that collects nobody) never strands the pair; collecting a brake too early is the only irreversible mistake.
- A partner must be used as a brake. At most two forced moves in a row, two lone clean-up moves and three fatal "collect now" temptations on the shortest routes; the solution uses at least 60% of the ice.
- Mutual boards (each penguin has to stop the other at least once) first. A shape or piece layout is never used twice, and at most a few boards have touching auroras (23 of 60).
- Re-solved on `src/engine.js`: the shortest solution equals the stated par, and no ordinary move strands the pair anywhere in the reachable graph.

## Order

As in the main campaign, by how hard a simulated player finds a board. The explorer finishes short boards (par up to about 16 here) and its swipes set their place. On longer boards it never finishes — every 4×4–6×6 board with par 15 or more ran into a 3,000-swipe ceiling — so 17 of the 60 boards are ordered by that ceiling, which grows with par, and sit after every board the explorer can solve, with a few short boards the explorer finds very hard placed among them. Par is capped at 45.

## Search

Layouts sampled by local search (move a piece of water or an aurora, keep what scores better); 31808 distinct candidate boards; the explorer measured the best of each tray and par; the final climb is geometric between the difficulty where the main campaign ends and the hardest boards found. These are search results, not proofs of a maximum.

## Honest limits

- Nobody has played these. Order comes from the engine and a simulated player, which is crude: it sees a finish two swipes away and nothing else.
- Not tried on a real phone or GPU.

## Chapters

| # | name | stages | note |
|---|---|---|---|
| 11 | WIDE FLOE | 101–110 | Larger floes, 5x4 · 5x5 · 6x4 · 6x5. Par 10–15. |
| 12 | ARCHIPELAGO | 111–120 | Larger floes, 5x4 · 5x5 · 6x4 · 6x5 · 6x6. Par 12–16. |
| 13 | LABYRINTH | 121–130 | Larger floes, 5x4 · 5x5 · 6x4 · 6x5 · 6x6. Par 12–15. |
| 14 | LONG NIGHT | 131–140 | Larger floes, 4x4 · 5x5 · 6x4 · 6x5 · 6x6. Par 12–14. |
| 15 | DEEP FREEZE | 141–150 | Larger floes, 5x5 · 6x4 · 6x5 · 6x6. Par 13–29. |
| 16 | THE POLE | 151–160 | Larger floes, 6x5 · 6x6. Par 16–43. |

## Boards

`#` open water, `A`/`B` penguins, `a`/`b` their auroras.

### 101 ICEBOUND · 5x4 · par 11 · mutual

```
b....
a.#..
B#.A.
....#
```

Solution `DRURULULDLU` · explorer 152 swipes

### 102 SKERRY · 5x5 · par 11 · mutual

```
ba.B.
..##.
.#.A.
..#..
.....
```

Solution `RDLDLULURUL` · explorer 156 swipes

### 103 FELL · 6x5 · par 10 · mutual

```
#....#
#....#
#B##..
.....#
.#abA#
```

Solution `ULDRDLURDL` · explorer 163 swipes

### 104 ESKER · 5x5 · par 12 · mutual

```
###A.
.....
.#..b
a....
.B###
```

Solution `URDLURDLURDL` · explorer 187 swipes

### 105 OXBOW · 6x4 · par 15 · mutual

```
A.#.#b
..#.#.
B...#a
##....
```

Solution `RDRDLURDRDRURDU` · explorer 198 swipes

### 106 KETTLE · 6x4 · par 12 · mutual

```
#..B..
...A#.
..##.a
.....b
```

Solution `RULDLDRDRURD` · explorer 198 swipes

### 107 DRUMLIN · 5x4 · par 12 · mutual

```
.#...
.B.#.
..#.b
..A.a
```

Solution `LURDLDRDRURD` · explorer 211 swipes

### 108 TARN · 6x4 · par 12 · mutual

```
b#....
.#..AB
....##
.a....
```

Solution `LDLULDRULDLU` · explorer 227 swipes

### 109 COL · 5x4 · par 13 · mutual

```
...##
#..B.
..b#.
#aA..
```

Solution `RULDRULDLURDL` · explorer 235 swipes

### 110 ARETE · 6x4 · par 12 · mutual

```
#....#
#..#.A
..#.b#
#.B.a#
```

Solution `LULDLDRDRURD` · explorer 250 swipes

### 111 SASTRUGI · 5x5 · par 12 · mutual

```
#.b..
#..B#
....#
#.#.A
.a..#
```

Solution `LULDRULDRULD` · explorer 253 swipes

### 112 NEVE · 6x5 · par 12 · mutual

```
.....#
B.#..a
A.#...
....b.
#..#..
```

Solution `RDRURULULDRU` · explorer 272 swipes

### 113 FIRN · 5x4 · par 12 · mutual

```
#..b.
B.#..
#..A#
..a.#
```

Solution `RDRULDRULDRU` · explorer 308 swipes

### 114 TALUS · 6x4 · par 14 · mutual

```
...#..
.#.A..
..#.#.
ba..B.
```

Solution `DRULDLULDLDRDL` · explorer 311 swipes

### 115 SCREE · 6x6 · par 13 · mutual

```
...#..
.#...#
b...B.
.a#.#.
..#...
#..A..
```

Solution `RDLULULDLDRUL` · explorer 341 swipes

### 116 PINGO · 6x5 · par 13 · mutual

```
..#.ab
A.##..
......
...##.
#...B.
```

Solution `RDLULDRURULUR` · explorer 344 swipes

### 117 FJELD · 5x5 · par 12 · mutual

```
.a..#
#....
#.#.#
....#
#BbA.
```

Solution `LURURDLDRDLU` · explorer 366 swipes

### 118 LEEWARD · 6x4 · par 16 · mutual

```
#....#
#..#b.
B#A#..
...#a#
```

Solution `DRURULDRURURDRUD` · explorer 408 swipes

### 119 WINDWARD · 5x5 · par 14 · mutual

```
#.A#.
...#B
.#...
..b..
#.a##
```

Solution `LDLDRDRURDLURD` · explorer 415 swipes

### 120 PERIGEE · 6x6 · par 16 · mutual

```
##A...
....#.
..#...
.##.a.
.#.B.#
....b#
```

Solution `DLURURURDRDLDRUD` · explorer 428 swipes

### 121 KELVIN · 5x5 · par 14 · mutual

```
#....
#.##a
..##.
.#B.b
A..##
```

Solution `DLULURURURDRUD` · explorer 445 swipes

### 122 ARCTIC · 5x4 · par 15 · mutual

```
.#..B
...#.
A##..
...ba
```

Solution `LDLURDRURDRDLDR` · explorer 466 swipes

### 123 ALPINE · 5x5 · par 13 · mutual

```
A.###
b....
.##.a
..B..
##.#.
```

Solution `RDRULDRULDRUL` · explorer 510 swipes

### 124 TAIGA · 6x6 · par 14 · mutual

```
.....#
B#..A.
.#....
...#..
..#...
ba.#..
```

Solution `URDRULDLDLDRDL` · explorer 529 swipes

### 125 STEPPE · 6x5 · par 12 · mutual

```
.B#a..
.##...
..b.#.
..A...
#....#
```

Solution `LDRULDLDLURU` · explorer 535 swipes

### 126 MESA · 5x5 · par 13 · mutual

```
.a..#
B.#A.
..#..
#...#
#.b..
```

Solution `DRDLURDLURDLU` · explorer 585 swipes

### 127 BUTTE · 6x4 · par 13 · mutual

```
.#.Bab
...#..
..#.#A
......
```

Solution `LDLDRDRURULUR` · explorer 641 swipes

### 128 GORGE · 5x4 · par 14 · mutual

```
#a.b.
.A##.
.#...
B..##
```

Solution `LDRDRURURULURL` · explorer 657 swipes

### 129 RAVINE · 6x6 · par 15 · mutual

```
#.....
#..A.#
.b.#..
.a.#..
.#..#B
....#.
```

Solution `ULURDLULDLURULD` · explorer 722 swipes

### 130 CIRRUS · 5x4 · par 14 · mutual

```
.B..#
.##..
.A##.
#a.b.
```

Solution `LURURDRDRDLDRL` · explorer 731 swipes

### 131 HALO · 6x5 · par 13 · mutual

```
B....#
.#A...
.##...
...a.#
#...b.
```

Solution `ULDRURDLDLURD` · explorer 754 swipes

### 132 SWELL · 6x6 · par 12 · mutual

```
#....#
...b.#
..#..#
#.#A..
.B#...
..#a..
```

Solution `ULDLDRURDLUD` · explorer 808 swipes

### 133 DEW · 5x5 · par 14 · mutual

```
.#..#
ba..B
#.#..
.#..#
.A..#
```

Solution `DLDRURULDLDRUL` · explorer 869 swipes

### 134 FOG · 6x4 · par 14 · mutual

```
..B..#
b#...#
A##...
a#....
```

Solution `URDLURULULDLUD` · explorer 892 swipes

### 135 SNOWFALL · 5x5 · par 14 · mutual

```
.a.b#
.##B.
.###.
..##A
#....
```

Solution `RDLDLULULURULR` · explorer 966 swipes

### 136 DRIZZLE · 5x5 · par 14 · mutual

```
#...A
..##.
..#.#
B..ab
#..#.
```

Solution `URULDLDRURULDR` · explorer 1022 swipes

### 137 VERGLAS · 6x4 · par 13 · mutual

```
....#b
..#.B.
A...#a
#.....
```

Solution `RDLULURDRURDU` · explorer 1085 swipes

### 138 SLUSH · 4x4 · par 14 · mutual

```
..b#
.#..
..aB
A..#
```

Solution `ULDLULURULDRDU` · explorer 1123 swipes

### 139 BRASH · 5x5 · par 14 · mutual

```
...B#
#.#..
#.#.A
...a.
.#.b#
```

Solution `LDRDLULDRURULD` · explorer 1174 swipes

### 140 FLURRY · 6x4 · par 13 · mutual

```
....#b
#...#A
...##B
#...a.
```

Solution `DLDLURDLDRDRU` · explorer 1291 swipes

### 141 SHEEN · 6x5 · par 13 · mutual

```
b#....
.B.#..
...#.A
a#....
.....#
```

Solution `LDRURULDLULDU` · explorer 1321 swipes

### 142 HOARFROST · 6x5 · par 14 · mutual

```
.#..ba
.B.#..
....#A
.##.#.
......
```

Solution `DLURDRDRURULUR` · explorer 1363 swipes

### 143 ICICLE · 5x5 · par 15 · mutual

```
##B..
aA.#.
.###.
b#...
...##
```

Solution `RURDRDLDLDLULDU` · explorer 1538 swipes

### 144 GLAZE · 6x4 · par 14 · mutual

```
...A.#
...#..
.#.B#.
.#b.a.
```

Solution `LULDLURDRDLDRL` · explorer cannot finish

### 145 SEAM · 6x4 · par 16 · mutual

```
..A...
B###..
..#...
ba..#.
```

Solution `URDLURULULDLDRDL` · explorer cannot finish

### 146 SPLINTER · 6x5 · par 22 · mutual

```
#...B.
....#.
.##.##
...##b
#..Aa.
```

Solution `LULURULDRDRULDLDRDRDRU` · explorer cannot finish

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
a...##
A#.b.#
..#..#
#...#.
#.#...
##.B.#
```

Solution `DRURDLULDRDRURDRULURDRURDLURDRURDLUL` · explorer cannot finish

### 156 TREMOR · 6x6 · par 38 · mutual

```
..#..#
.....B
.#..#.
#..##.
#ab..A
.....#
```

Solution `ULULDRURDRDLURURULURDRULDLDLURDRDLDRUL` · explorer cannot finish

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

### 158 GROWLER · 6x5 · par 16 · mutual

```
#....#
....Bb
A..#..
.#.#.a
...#..
```

Solution `ULDRDLDRURURDRDU` · explorer cannot finish

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

### 160 RUPTURE · 6x6 · par 43 · mutual

```
A..#.#
..#...
#...#.
a.##..
.#B#..
.b...#
```

Solution `DRURULDLDRDRURDLDRDLDRDRURURULULURDRDLDLDLU` · explorer cannot finish

