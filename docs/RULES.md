# TILT rules

## Movement

A swipe changes gravity to up, right, down, or left. Every penguin moves at the
same time and glides until something stops it: the edge of the ice, or another
penguin.

## The floe

The board is one floating piece of ice. Some cells have no ice: they are open
water. The edge of the ice stops a penguin wherever it is — the outer rim or
the rim of a hole — and nobody ever falls in.

## Penguins and auroras

The first three levels have one penguin; all others have two, one of each
colour. Each penguin has one matching aurora. A penguin is collected only when
it stops on its own aurora; gliding across it, or stopping on the other
colour's, does nothing.

## Shared brakes

The edge of the ice and the other penguin are the two brakes. Collecting a
penguin removes it from the floe, so collection order matters: a penguin that
is collected too early is no longer there to stop its partner.

## Dead ends

Ordinary moves that do not collect a penguin always preserve solvability.
Collecting a penguin too early can still leave its partner without a needed
brake. Reaching one is not a loss and does not end the run: the position stands
exactly where you put it, the game says so once, and recovery and restart are
both available. The “手詰まりの前に戻す” button (also Z or Backspace) skips all
moves made after the dead end and restores the last proven-solvable position,
including its move count. Recovery is always explicit; the game never takes a
move back for you.

## Clear condition

A level clears after every penguin has been collected by its matching aurora.
Penguins touching each other is not a clear condition. Contact only matters
because one penguin can stop another.

## Board vocabulary

| Character | Meaning |
|---|---|
| `.` | ice |
| `#` | open water — no ice; stops a glide like the outer rim |
| `A` `B` | penguins, one per colour |
| `a` `b` | the matching aurora for `A` and `B` |

The engine retains legacy `G` (drifter) and `x` (cracked ice) support for
research fixtures and regression tests; neither appears in the campaign.
