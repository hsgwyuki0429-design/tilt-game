# TILT

A small gravity puzzle for phones. Swipe in one of four directions to change gravity; every movable block slides until the board edge, a wall, or another block stops it.

## Current campaign

The campaign contains five levels and one consistent objective:

- A board has one or two movable blocks, never more.
- Every block has exactly one goal with the same colour and symbol.
- A block is collected only when it comes to rest on its matching goal.
- Blocks can stop each other, but touching blocks never clears a level.
- Swipe, keyboard, and optional device-tilt controls keep the same movement behaviour.

Run the logic tests with:

```sh
npm test
```

Serve the game locally with:

```sh
npm run serve
```

The runtime is dependency-free. The test suite uses the same deterministic engine and breadth-first solver as the browser game.

