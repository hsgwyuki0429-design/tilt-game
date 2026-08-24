# TILT

A gravity puzzle set in a soft, crystalline ice world. Swipe in one of four directions to change gravity; every cube penguin glides until a snowy wall or another penguin stops it.

## Current campaign

The campaign contains five 5×5 levels and one consistent objective:

- A board has one or two cube penguins, never more.
- Every penguin has exactly one matching aurora vortex.
- A penguin is collected only when it comes to rest on its aurora; crossing it is not enough.
- Cracked ice is safe to cross, but ending a move on it breaks the run.
- Penguins can stop each other, but touching never clears a level.
- Swipe, keyboard, and optional device-tilt controls keep the same movement behaviour.

The responsive desktop composition mirrors the ice-world visual direction: a dominant 5×5 tray enclosed by a 7×7 snow-wall ring, a compact stage HUD, a tile guide, and supporting reference panels. On phones those supporting panels fold away so the board and controls stay touch-first.

Run the logic tests with:

```sh
npm test
```

Serve the game locally with:

```sh
npm run serve
```

The runtime is dependency-free. The test suite uses the same deterministic engine and breadth-first solver as the browser game.

