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

The Canvas renderer keeps those rules on the original 2D grid, then projects the
world through a fixed orthographic 2.5D camera. Textured ice cubes, snow walls,
cracked tops, aurora goals, and cube penguins share one depth-sorted painter
queue. The same focused game shell scales from iPhone portrait to desktop.

Run the logic tests with:

```sh
npm test
```

Run the projection, six-face texture, depth-order, and 3×3–5×5 responsive
contracts with:

```sh
npm run test:render
```

Run the complete browser campaign and interaction harness with:

```sh
npm run qa
```

Serve the game locally with:

```sh
npm run serve
```

The runtime is dependency-free. Browser QA uses Playwright only as a development
dependency; game rules still come from the deterministic engine and solver.

