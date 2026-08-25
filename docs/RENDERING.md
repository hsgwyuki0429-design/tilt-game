# 2.5D rendering architecture

`src/engine.js` owns the canonical 2D grid. The renderer does not alter stage
coordinates, collision, gravity, hazards, or goal resolution.

## Camera

The fixed orthographic camera keeps the gameplay grid parallel to the display.
Logical X always points screen-right and logical Y always points screen-down,
so the four swipe directions exactly match visible penguin movement. Height is
the only diagonal basis and exposes the south/east cube faces. With responsive
cell scale `S`:

```text
screenX = originX + x * S - z * 0.10S
screenY = originY + y * S - z * 0.20S
```

The top of every floor is `z = 0`. Floors extend only slightly downward, while
walls and penguins use a shallow elevation. Their main square face remains
parallel to the screen; the small south/east strips provide depth without
tilting the board. Movement animation interpolates the engine's floating grid
position first and calls `project()` second.

## Materials and faces

Every box material exposes `top`, `bottom`, `north`, `south`, `east`, and `west`
faces. The screen-aligned camera currently draws the visible `top`, `south`,
and `east` faces. Texture atlases are decoded once into 256×256 face canvases;
procedural fills remain available while they load or if a file is unavailable.

Cracked ice and goal cells replace only the top face. Their sides inherit normal
ice, preserving the rule that both are traversable floor blocks—not pits.

## Occlusion

Floor cells, goal effects, walls, penguins, ripples, and particles enter one
painter queue. Commands sort by the projected Y coordinate of their world-space
footprint, then by layer and projected X. This allows a foreground wall to cover
a penguin behind it while retaining deterministic ordering within equal rows.

## Performance

- Device pixel ratio is capped at 2.
- Atlas crops are generated once after image decode.
- The diorama base and broad shadow are cached on layout/resize.
- Floor, cracked, goal-base, and wall cubes are rasterized into seven small
  static sprites on layout/texture decode. They stay as individual depth
  commands, but a frame only blits them instead of remapping three faces.
- No per-frame canvases or texture decoding are performed.
- The game loop keeps its existing full-rate animation and low-rate idle modes.
