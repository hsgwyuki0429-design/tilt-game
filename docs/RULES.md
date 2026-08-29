# TILT rules

## Movement

A swipe changes gravity to up, right, down, or left. Every live block moves at the same time and glides until it reaches the board edge, a snowy wall, or another block.

## Penguins and auroras

A level contains one or two penguins, never two of a colour. Each penguin has one matching aurora, identified by the same small colour-and-shape badge. A penguin is collected only when it stops on its own aurora; crossing an aurora or stopping on the other badge does nothing.

## Drifters

A drifter is the grey slab. It obeys gravity like everything else, but no aurora accepts it, so it is never collected and never has to be — a drifter left anywhere on the board does not stop a level clearing.

It is on the board to be in the way. It can brake a penguin in the middle of the tray where nothing else would, and because an aurora only collects a block it accepts, a drifter that comes to rest on an aurora sits there and plugs it until a later swipe pushes it off.

## Cracked ice

A block may glide across cracked ice. If it comes to rest there — penguin or drifter — the tile breaks and the run ends. Undo returns to the state before that move.

## Clear condition

A level clears after every penguin has been collected by its matching aurora. Blocks touching each other is not a clear condition. Contact only matters because one block can stop another.

There are no SELECT, MATCH, or FORM objectives in the current campaign.

## Board vocabulary

| Character | Meaning |
|---|---|
| `.` | plain ice |
| `#` | ice wall — immovable, blocks movement |
| `x` | cracked ice — safe to cross, fatal to stop on |
| `A` `B` | penguins, one per colour |
| `a` `b` | the matching aurora for `A` and `B` |
| `G` | drifter — slides, never collected |
