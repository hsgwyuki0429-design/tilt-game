# TILT rules

## Movement

A swipe changes gravity to up, right, down, or left. Every live block moves at the same time and glides until it reaches the board edge, a snowy wall, or another block.

## Penguins and auroras

The first level contains one penguin; all other levels contain two, one of each colour. Boards are 4×4 or 5×4. Each penguin has one matching aurora, identified by its colour. A penguin is collected only when it stops on its own aurora; crossing an aurora or stopping on another colour does nothing.

## Shared brakes

The edge, an immovable ice wall, and the other penguin are the three brakes. Collecting a penguin removes it from the board, so collection order matters. Grey drifters and cracked ice are absent from the current campaign.

## Dead ends

Ordinary moves that do not collect a penguin preserve solvability. Collecting
a penguin too early can still leave its partner without a needed brake. Reaching
one is not a loss and does not end the run: the position stands exactly where
you put it, the game says so once, and recovery and restart are both available.
The “手詰まりの前に戻す” button (also Z or Backspace) skips all moves made after
the dead end and restores the last proven-solvable position, including its move
count. It is disabled during ordinary solvable play and after clearing a stage.
Recovery is always explicit; the game never takes a move back for you. A solver
search that reaches its limit is unknown and is never used as a safe checkpoint.

## Clear condition

A level clears after every penguin has been collected by its matching aurora. Blocks touching each other is not a clear condition. Contact only matters because one block can stop another.

There are no SELECT, MATCH, or FORM objectives in the current campaign.

## Board vocabulary

| Character | Meaning |
|---|---|
| `.` | plain ice |
| `#` | ice wall — immovable, blocks movement |
| `A` `B` | penguins, one per colour |
| `a` `b` | the matching aurora for `A` and `B` |

The engine retains legacy `G` and `x` support for research fixtures and regression tests; neither appears in the 100-level campaign.
