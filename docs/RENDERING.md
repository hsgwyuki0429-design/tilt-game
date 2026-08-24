# 2.5D rendering architecture

`src/engine.js` owns the canonical 2D grid. The renderer does not alter stage
coordinates, collision, gravity, hazards, or goal resolution.

## Camera

The fixed orthographic camera projects a world point with the basis below, where
`S` is the responsive cell scale:

```text
screenX = originX + (x - y) * 0.50S
screenY = originY + (x + y) * 0.28S - z * 0.34S
```

The top of every floor is `z = 0`. Floors extend downward, while walls and
penguin cubes extend upward. Movement animation interpolates the engine's
floating grid position first and calls `project()` second.

## Materials and faces

Every box material exposes `top`, `bottom`, `north`, `south`, `east`, and `west`
faces. The fixed south-east camera currently draws the visible `top`, `south`,
and `east` faces. Texture atlases are decoded once into 256×256 face canvases;
procedural fills remain available while they load or if a file is unavailable.

Cracked ice and goal cells replace only the top face. Their sides inherit normal
ice, preserving the rule that both are traversable floor blocks—not pits.

## Occlusion

Floor cells, goal effects, walls, penguins, ripples, and particles enter one
painter queue. Commands sort by the projected Y coordinate of their world-space
footprint, then by layer and projected X. This allows a foreground wall to cover
a penguin behind it while retaining deterministic ordering on equal diagonals.

## Performance

- Device pixel ratio is capped at 2.
- Atlas crops are generated once after image decode.
- The diorama base and broad shadow are cached on layout/resize.
- Floor, cracked, goal-base, and wall cubes are rasterized into seven small
  static sprites on layout/texture decode. They stay as individual depth
  commands, but a frame only blits them instead of remapping three faces.
- No per-frame canvases or texture decoding are performed.
- The game loop keeps its existing full-rate animation and low-rate idle modes.
