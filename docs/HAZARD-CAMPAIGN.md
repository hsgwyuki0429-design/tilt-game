# Cracked-ice campaign (high level)

60 boards, 4×4 to 6×6, two penguins, many walls, cracked ice. Shortest solutions run **12 to 54 moves** (largest step between neighbours: 3).

Nothing here is wired into the game. `tools/hazard-campaign.json` holds stage-shaped entries (`id`, `name`, `par`, `idea`, `hint`, `board`) plus the solution and notes; copying them into a chapter is a separate step.

## Rules this campaign uses

- Walls and penguins behave as in the main campaign.
- **Cracked ice (`x`)**: sliding across it is free; a penguin that comes to rest on it is lost, and the game rewinds to the last solvable position.
- No drifters.

## What was checked

- The search's own position graph agrees with `src/engine.js` on 1.2 million transitions over random walls/cracks boards (`node tools/hazard-selftest.js`).
- Every board here was re-solved by the engine: its shortest solution equals the stated par, and the stored solution is replayed to a clear.
- From every reachable solvable position, every move that neither collects a penguin nor cracks one leads to another solvable position (cracking is excluded because the game rewinds it; collecting a brake too early remains the one irreversible mistake, as in the main campaign).
- Every wall and every cracked tile changes the shortest route or a move taken along it. A tile whose removal changes nothing is rejected.
- Each room (walls and cracks, up to rotation, reflection and swapping colours) appears at most once.

## Search scale

Four parallel workers, local search over layouts (move a wall, a crack or an aurora, keep what scores better). 357 million layouts were evaluated over 272 minutes (4.5 hours) across three runs of four workers; the third run was stopped at 62 of its planned 90 minutes and its last checkpoint used. 846 engine-verified boards were shortlisted from 38,160 distinct candidates, and 60 were curated from those. Longest solutions found: 6×6 54, 6×5 44, 5×5 40, 5×4 33, 4×4 23. These are search results, not proofs of a maximum.

## Honest limits

- "Fun" is not measured. The notes below are read off the solution by the engine (reversals, partner braking, crossings, lure moves). They say where a puzzle's ideas are, not whether it is enjoyable.
- No one has played these yet. Play a handful from each tray before trusting the order.
- The renderer's responsive contracts cover 3×3–5×5; 6×5 and 6×6 have not been checked on screen.

## Mix

| tray | boards | pars |
|---|---:|---|
| 6x6 | 18 | 12–54 |
| 5x5 | 12 | 12–40 |
| 6x5 | 16 | 12–44 |
| 5x4 | 8 | 12–33 |
| 4x4 | 6 | 12–23 |

## Boards

`#` wall, `x` cracked ice, `A`/`B` penguins, `a`/`b` their auroras.

### 1. 6x6 · 12 moves

```
.###.#
ab..x.
....#.
###.Ax
..#x..
B...#.
```

Solution: `DRULDRDRURUL`

- 7手目(下): ゴールから最も遠ざかる逆走
- 4手目(左): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 2. 5x5 · 12 moves

```
#..x.
..#.a
.x#.#
#B.A.
.#x#b
```

Solution: `LULURDLDLURD`

- 2手目(上): ゴールから最も遠ざかる逆走
- 1手目(左): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 3. 6x5 · 12 moves

```
.#..ax
##.Ax#
.#.B.b
.x....
#.#x.#
```

Solution: `LDLDRULDLDRU`

- 7手目(左): ゴールから最も遠ざかる逆走
- 2手目(下): AがBに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 4. 5x4 · 12 moves

```
...#x
a#...
x.xA#
b#B.#
```

Solution: `URDLULULDLUD`

- 5手目(上): ゴールから最も遠ざかる逆走
- 5手目(上): BがAに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が6回

### 5. 4x4 · 12 moves

```
..A.
.B#b
#x.x
..#a
```

Solution: `ULDRURURDRUD`

- 5手目(上): ゴールから最も遠ざかる逆走
- 2手目(左): AがBに当たって止まる
- 解の中で割れる氷を3回すべって通過
- 解の途中に「止まれば割れる」誘い手が3回

### 6. 6x5 · 14 moves

```
xb#..#
..x..a
#A.#..
.xB..#
..#..#
```

Solution: `RDLURURULDLDRU`

- 9手目(左): ゴールから最も遠ざかる逆走
- 5手目(右): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 7. 6x6 · 14 moves

```
.#.###
#..Ax.
#..x.#
..#B..
....##
.#..ba
```

Solution: `DRULURULDRDLDR`

- 8手目(左): ゴールから最も遠ざかる逆走
- 1手目(下): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が6回

### 8. 4x4 · 14 moves

```
#..B
#x..
.A#b
ax..
```

Solution: `URDRDLURURDRDL`

- 6手目(左): ゴールから最も遠ざかる逆走
- 2手目(右): AがBに当たって止まる
- 解の中で割れる氷を3回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 9. 5x5 · 15 moves

```
..#ax
#..b.
#x.B#
...A#
#...#
```

Solution: `ULDLURDLURDLDRU`

- 3手目(下): ゴールから最も遠ざかる逆走
- 1手目(上): AがBに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 10. 5x4 · 15 moves

```
.A.#b
#Bx.x
...#a
x#...
```

Solution: `LDRDLURDRDRURDU`

- 8手目(下): ゴールから最も遠ざかる逆走
- 4手目(下): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 11. 6x5 · 16 moves

```
##.#.b
A#.#..
.#...x
.xB.#a
#.#...
```

Solution: `DRULDLDRDRDRURDU`

- 3手目(上): ゴールから最も遠ざかる逆走
- 2手目(右): AがBに当たって止まる
- 解の中で割れる氷を4回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 12. 4x4 · 16 moves

```
#...
..#x
.#BA
.xab
```

Solution: `ULDLURURURDRDLDR`

- 4手目(左): ゴールから最も遠ざかる逆走
- 5手目(上): BがAに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が3回

### 13. 6x6 · 17 moves

```
#..##.
......
.##...
..Ax#x
#B#.b.
#.x.a#
```

Solution: `ULULURDLURDLDLDRU`

- 9手目(上): ゴールから最も遠ざかる逆走
- 2手目(左): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 14. 5x5 · 17 moves

```
a.xx.
.b.#.
#B...
.x#.#
#..xA
```

Solution: `LURDRURULDRDLDLUL`

- 3手目(右): ゴールから最も遠ざかる逆走
- 2手目(上): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が11回

### 15. 6x5 · 18 moves

```
.#..#.
#.x...
b.A#.#
a#.B..
.x..#x
```

Solution: `ULDRULULDRURULDLDU`

- 4手目(右): ゴールから最も遠ざかる逆走
- 3手目(下): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が10回

### 16. 5x4 · 18 moves

```
b.xx.
.aA#.
#....
#B#.#
```

Solution: `DLURDRURULDRDLDLUL`

- 4手目(右): ゴールから最も遠ざかる逆走
- 3手目(上): BがAに当たって止まる
- 解の中で割れる氷を3回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 17. 6x6 · 19 moves

```
#..#.b
Ax..#.
.#..ax
.x....
B.##.#
..##..
```

Solution: `URURDRDLULDLURURDRU`

- 8手目(左): ゴールから最も遠ざかる逆走
- 1手目(上): BがAに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が10回

### 18. 4x4 · 19 moves

```
#a.#
.x..
#b#.
#A.B
```

Solution: `RURULURULDRDLDLULDU`

- 11手目(右): ゴールから最も遠ざかる逆走
- 1手目(右): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が3回

### 19. 5x5 · 20 moves

```
...#x
.#x#.
..A..
b#B..
a.#x#
```

Solution: `LURDRDLULURURDRDLULD`

- 2手目(上): ゴールから最も遠ざかる逆走
- 3手目(右): AがBに当たって止まる
- 解の中で割れる氷を10回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 20. 6x5 · 21 moves

```
#...#.
..#x..
.x..#A
##.aB.
b....#
```

Solution: `LULDLDRULURDLDRULURDL`

- 2手目(上): ゴールから最も遠ざかる逆走
- 12手目(下): BがAに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 21. 5x4 · 21 moves

```
B.x..
.#Ab.
...#.
#x##a
```

Solution: `DLULURURDRULDLULURURD`

- 12手目(左): ゴールから最も遠ざかる逆走
- 2手目(左): AがBに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 22. 4x4 · 21 moves

```
B.aA
x##.
b.#x
#...
```

Solution: `RDLURDLULURDRURULURLD`

- 12手目(下): ゴールから最も遠ざかる逆走
- 1手目(右): BがAに当たって止まる
- 解の中で割れる氷を9回すべって通過
- 解の途中に「止まれば割れる」誘い手が2回

### 23. 6x6 · 22 moves

```
#B..#.
...#.b
.A.#.#
.x....
#x..#.
..a...
```

Solution: `LDRULULURDRURULDRULURD`

- 7手目(左): ゴールから最も遠ざかる逆走
- 4手目(上): BがAに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 24. 5x5 · 22 moves

```
...#B
.#...
.Ax.#
#.#..
axb.#
```

Solution: `LDLULDRULULDLDRDRDLDRL`

- 4手目(上): ゴールから最も遠ざかる逆走
- 5手目(左): BがAに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 25. 6x5 · 23 moves

```
#.#..b
..#..x
..x.#a
.#.B..
.A.#.#
```

Solution: `LDLURDRDLDLULURDRDRURDU`

- 9手目(左): ゴールから最も遠ざかる逆走
- 3手目(左): BがAに当たって止まる
- 解の中で割れる氷を4回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 26. 4x4 · 23 moves

```
.#aA
..#.
.bxB
#..#
```

Solution: `DLDLULDRDLULDRULURDLRUL`

- 15手目(上): ゴールから最も遠ざかる逆走
- 1手目(下): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が3回

### 27. 6x6 · 24 moves

```
#..x..
...A#.
b##...
x#..B#
a#.#x.
#....#
```

Solution: `DRURURULDRDRURULULDLDLUD`

- 13手目(上): ゴールから最も遠ざかる逆走
- 3手目(上): BがAに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 28. 5x4 · 24 moves

```
..B.#
.#..A
...#.
#axb.
```

Solution: `LULDLDRULDLURDRURDRDLDRL`

- 8手目(上): ゴールから最も遠ざかる逆走
- 3手目(左): AがBに当たって止まる
- 解の中で割れる氷を1回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 29. 6x5 · 25 moves

```
#.xB#a
#.#.Ax
..x.#b
.#....
...#x#
```

Solution: `LDLDLURDLDLULURURDRDRURDU`

- 1手目(左): ゴールから最も遠ざかる逆走
- 5手目(左): AがBに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が11回

### 30. 5x5 · 25 moves

```
#.#..
....#
.ax..
.#..B
b#A#x
```

Solution: `URULURDLDRURULDLULURDLULD`

- 6手目(右): ゴールから最も遠ざかる逆走
- 18手目(左): BがAに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 31. 6x6 · 27 moves

```
bx.a.#
B.##..
...A.#
###x..
....#.
#.....
```

Solution: `DRDRDLURURDRDLDLURURURULURL`

- 2手目(右): ゴールから最も遠ざかる逆走
- 5手目(下): BがAに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 32. 6x5 · 27 moves

```
x.#...
#.x.#.
...##x
b#....
a#B.A#
```

Solution: `RURULDLDRDRURURULULDLDLDLUD`

- 4手目(上): ゴールから最も遠ざかる逆走
- 1手目(右): BがAに当たって止まる
- 解の中で割れる氷を9回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 33. 5x5 · 27 moves

```
...#b
.#..a
BAx#.
#....
.#...
```

Solution: `ULURURDRDLULULURURDRDRULDRU`

- 7手目(下): ゴールから最も遠ざかる逆走
- 3手目(上): AがBに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が5回

### 34. 5x4 · 27 moves

```
....#
.#..B
.x.#.
#axbA
```

Solution: `ULULULDLDRULDLURDRURDRDLDRL`

- 11手目(上): ゴールから最も遠ざかる逆走
- 1手目(上): AがBに当たって止まる
- 解の中で割れる氷を7回すべって通過
- 解の途中に「止まれば割れる」誘い手が11回

### 35. 6x6 · 29 moves

```
...#x#
.#B.A.
....#.
#.x..x
#.##..
.#.xba
```

Solution: `LULULDRULULDLDRDLDRURURDRDLDR`

- 3手目(左): ゴールから最も遠ざかる逆走
- 1手目(左): AがBに当たって止まる
- 解の中で割れる氷を4回すべって通過
- 解の途中に「止まれば割れる」誘い手が15回

### 36. 6x5 · 29 moves

```
#..x..
.b#.A#
Ba..x.
...#.#
.#.#..
```

Solution: `LDLURDRULURURDLULDRDLDRURULUR`

- 19手目(右): ゴールから最も遠ざかる逆走
- 4手目(上): BがAに当たって止まる
- 解の中で割れる氷を11回すべって通過
- 解の途中に「止まれば割れる」誘い手が5回

### 37. 5x5 · 30 moves

```
#...#
a.#..
#.x.b
..B#.
.#A..
```

Solution: `RDRULDLDRDRURULURDLURURDLULRDR`

- 1手目(右): ゴールから最も遠ざかる逆走
- 3手目(右): BがAに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 38. 5x4 · 30 moves

```
A#...
...#a
#..Bx
#b##.
```

Solution: `LURURDRULDLDLULURURDRURDRULDLD`

- 8手目(上): ゴールから最も遠ざかる逆走
- 9手目(左): BがAに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が11回

### 39. 6x5 · 31 moves

```
.....#
...#ax
A#x..#
.#...b
.##B#.
```

Solution: `URULULDLURDLDRURULULDLURDLURUDR`

- 18手目(左): ゴールから最も遠ざかる逆走
- 3手目(上): BがAに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 40. 6x6 · 32 moves

```
#B#.A.
.....#
..a.#.
##...x
.x.b..
..##..
```

Solution: `LDLURDLULULDRDRULDLULURDLULULDRD`

- 3手目(左): ゴールから最も遠ざかる逆走
- 11手目(左): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が10回

### 41. 5x5 · 32 moves

```
..###
#....
..B#.
.#aA.
.bx.#
```

Solution: `RULULDLDRDLURURULULDLDRDLDRDLRUL`

- 2手目(上): ゴールから最も遠ざかる逆走
- 3手目(左): AがBに当たって止まる
- 解の中で割れる氷を6回すべって通過
- 解の途中に「止まれば割れる」誘い手が12回

### 42. 6x5 · 33 moves

```
B..#.#
.#A...
..x.#.
#.#.#.
#.abx.
```

Solution: `ULDRULULDLDRDRURDRDLURURDRDLDLURD`

- 15手目(上): ゴールから最も遠ざかる逆走
- 2手目(左): AがBに当たって止まる
- 解の中で割れる氷を10回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 43. 5x4 · 33 moves

```
..a..
BA.#.
#..b#
.x.#.
```

Solution: `URDLDRDLULDRDRURDLURDLDRDLULDRDRU`

- 4手目(左): ゴールから最も遠ざかる逆走
- 2手目(右): BがAに当たって止まる
- 解の中で割れる氷を4回すべって通過
- 解の途中に「止まれば割れる」誘い手が4回

### 44. 6x6 · 34 moves

```
.#.B..
x..#x.
.....#
#.#...
A.#.#.
x#axb.
```

Solution: `RURULDLDLDRURULDLDLDRDRURDRDRDLDRL`

- 12手目(上): ゴールから最も遠ざかる逆走
- 5手目(左): BがAに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が8回

### 45. 6x5 · 35 moves

```
##.#x#
A#....
.#.a..
..x.##
#.Bxb#
```

Solution: `LURURDRULURDLURURDLULDLURURDRURDLDR`

- 20手目(上): ゴールから最も遠ざかる逆走
- 9手目(左): BがAに当たって止まる
- 解の中で割れる氷を12回すべって通過
- 解の途中に「止まれば割れる」誘い手が14回

### 46. 5x5 · 35 moves

```
.#..#
#x#..
.b.xB
A#...
a#.#x
```

Solution: `ULURULDLDRDLULULDRULURULDLDRDLULULD`

- 4手目(右): ゴールから最も遠ざかる逆走
- 13手目(上): AがBに当たって止まる
- 解の中で割れる氷を10回すべって通過
- 解の途中に「止まれば割れる」誘い手が13回

### 47. 6x6 · 37 moves

```
#....#
#.#...
#.b.#.
.#Ax..
xBx#.#
...a.#
```

Solution: `DRURURULULULDLDRULDLURDRURDRDLDLDRULU`

- 17手目(上): ゴールから最も遠ざかる逆走
- 2手目(右): BがAに当たって止まる
- 解の中で割れる氷を9回すべって通過
- 解の途中に「止まれば割れる」誘い手が10回

### 48. 5x5 · 37 moves

```
.#x.A
..#..
xab.#
.#...
...#B
```

Solution: `DLDLDLULDLULURDRURDRDLDLDLULDLULURDRU`

- 18手目(右): ゴールから最も遠ざかる逆走
- 10手目(左): BがAに当たって止まる
- 解の中で割れる氷を12回すべって通過
- 解の途中に「止まれば割れる」誘い手が5回

### 49. 6x5 · 38 moves

```
#...#b
#.##..
..x.#.
.#..aB
.A.#x#
```

Solution: `LDLURDLDLULURULURDRULDRDRURULDLDLURDRU`

- 1手目(左): ゴールから最も遠ざかる逆走
- 3手目(左): BがAに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が12回

### 50. 6x6 · 39 moves

```
##.B..
...A#.
..#..#
#..x..
...##a
.#x.#b
```

Solution: `RURDLDLDRDLULDLDRDRURULULDLDRDRURURDRUD`

- 23手目(左): ゴールから最も遠ざかる逆走
- 3手目(右): AがBに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が13回

### 51. 6x5 · 40 moves

```
##B..#
..##..
....b.
A#...x
#...#a
```

Solution: `RDLURDRULDLDLURDRDLULDLDRURULDLDRDLDRURD`

- 9手目(左): ゴールから最も遠ざかる逆走
- 8手目(上): BがAに当たって止まる
- 解の中で割れる氷を5回すべって通過
- 解の途中に「止まれば割れる」誘い手が12回

### 52. 5x5 · 40 moves

```
#A...
..b#a
.#..x
..#xB
#...#
```

Solution: `ULDLULDLDRDRULULDLDRDRDRULURDRULURDRULDR`

- 11手目(下): ゴールから最も遠ざかる逆走
- 2手目(左): BがAに当たって止まる
- 解の中で割れる氷を11回すべって通過
- 解の途中に「止まれば割れる」誘い手が14回

### 53. 6x6 · 42 moves

```
Abx..#
a.B#.x
###...
.....#
...#x.
#.....
```

Solution: `RDLURULURDRDLURURDLULDRDLURURDLULDRURULULD`

- 5手目(右): ゴールから最も遠ざかる逆走
- 6手目(上): AがBに当たって止まる
- 解の中で割れる氷を12回すべって通過
- 解の途中に「止まれば割れる」誘い手が15回

### 54. 6x5 · 42 moves

```
A..#..
.#..x.
.##..#
B.b#..
#a#...
```

Solution: `URURDRDLDRDRULDLDRURDLURULURDLULULDLDRDLDR`

- 10手目(右): ゴールから最も遠ざかる逆走
- 1手目(上): BがAに当たって止まる
- 解の中で割れる氷を9回すべって通過
- 解の途中に「止まれば割れる」誘い手が6回

### 55. 6x6 · 44 moves

```
.....#
##....
....#a
#..x##
x.#...
B.A.#b
```

Solution: `RURDRULDLURDRURDLDLULDLDRDRURDLDLULDRDRURDRD`

- 7手目(左): ゴールから最も遠ざかる逆走
- 1手目(右): BがAに当たって止まる
- 解の中で割れる氷を12回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

### 56. 6x5 · 44 moves

```
#.#..A
#...#a
..#..x
...#..
##Bxb#
```

Solution: `ULURDLDLURULDRULURURURDRDRULURDLULURURDRUDLD`

- 2手目(左): ゴールから最も遠ざかる逆走
- 14手目(右): AがBに当たって止まる
- 解の中で割れる氷を8回すべって通過
- 解の途中に「止まれば割れる」誘い手が7回

### 57. 6x6 · 47 moves

```
..#Bab
Ax..##
#..##.
..#...
.#.#..
...x.#
```

Solution: `DRDLDLURDLDLDRULDRURDLURDLDLULURURDRURULDRURULR`

- 26手目(左): ゴールから最も遠ざかる逆走
- 2手目(右): AがBに当たって止まる
- 解の中で割れる氷を14回すべって通過
- 解の途中に「止まれば割れる」誘い手が10回

### 58. 6x6 · 49 moves

```
.A.#..
.#....
...x#b
..x.##
#B#...
.xa.#x
```

Solution: `ULURULDRULULDRURULDRDLULDLULDRDRURULDLULDRDLDRURD`

- 10手目(左): ゴールから最も遠ざかる逆走
- 3手目(上): BがAに当たって止まる
- 解の中で割れる氷を19回すべって通過
- 解の途中に「止まれば割れる」誘い手が27回

### 59. 6x6 · 52 moves

```
..xa.#
.#....
#.....
.A##..
b.B.x#
.#....
```

Solution: `DLDRURURDLDRULULURURULDRDLURDLULURURDLURULDRDLURDLUL`

- 40手目(右): ゴールから最も遠ざかる逆走
- 12手目(右): BがAに当たって止まる
- 解の中で割れる氷を9回すべって通過
- 解の途中に「止まれば割れる」誘い手が12回

### 60. 6x6 · 54 moves

```
..#A.a
.#...x
..x...
#..#.b
...#..
.#B..#
```

Solution: `DRDLDLULDLDRULDLURDRULDRDLDLULDLDRULDLURDRULDLULDRDRDU`

- 4手目(左): ゴールから最も遠ざかる逆走
- 6手目(左): AがBに当たって止まる
- 解の中で割れる氷を11回すべって通過
- 解の途中に「止まれば割れる」誘い手が9回

