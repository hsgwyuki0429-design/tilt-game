# Frontal ice diorama

The engine remains a deterministic 2D grid. The Canvas renderer gives objects
height while keeping the view square to the board: rows horizontal, columns
vertical, and no sideways camera angle. All four swipe directions still map
directly to the screen.

## Geometry and materials

```text
screenX = originX + x * cell
screenY = originY + y * cell * 0.90 - z * cell * 0.52
```

Penguins are constructed as 0.76-cell cubes, with gradients and joined rounded
geometry for their upward and front planes. The upward face is drawn with
vector eyes, cheeks, and a white bib. A small faceted beak projects above that
plane. No penguin image is pasted onto the geometry. Nine expression drawings
follow the existing reaction controller and retain its movement poses.

Snow obstacles are 0.21 cells high and grey drifters are 0.19 cells high: one
quarter of their full-height versions. They use the same solid geometry and
lighting, with a small bevel and contact shadow. Lower obstacles keep adjacent
goals readable and distinguish the penguins from the scenery.

The tray has a continuous snowy rim, a translucent blue side, and a soft cast
shadow. Floor texture is softly blended from the original ice artwork, sampling
its interior to avoid repeated baked borders. Cracked ice retains stronger
contrast. Goals retain the original `goal-top.png` aurora artwork, colour filter,
pulse, and collection flash. A rounded clip trims the asset's black corner
padding without replacing the aurora design.

## Swipe response

The whole canvas tilts by up to 4.5 degrees around X or Y in CSS perspective.
Drag progress controls the angle; a committed slide carries that lean through
its movement, then settles exactly to level. Cancelling a drag returns to level
without changing game state. Existing fractional previews only move pieces
that the engine would actually allow to move.

Tilt never changes engine coordinates, move counts, history, or swipe axes.
Layout reads untransformed client dimensions, so resizing during a gesture
cannot feed perspective distortion back into sizing. Reduced motion immediately
clears the tilt and retains expression changes without poses.

## Expressions and home

`src/expression.js` owns the nine reaction states, their priorities, and their
expiry times. The renderer reads `visualFor().expression` and draws the matching
vector eyes on the same top plane. The existing image bank remains available
for compatibility; the current penguin renderer does not use its artwork.
Expressions expire on the frame clock, so no stale timer can replace a newer
reaction. Poses never feed back into the engine's grid position.

Home uses a static instance of the same renderer and a small 4×4 composition.
It repaints on asset decode or ResizeObserver notifications without an extra
animation loop. Its cubes, shallow obstacles, and original auroras match play.

## Ordering and performance

Floor and goals paint first. Raised walls and penguins share a pass sorted by
their ground footprint, so floor tiles cannot paint over a sliding piece.
Soft radial contact shadows anchor the pieces; particles paint last.

- Device pixel ratio is capped at 2.
- Five terrain variants and the complete tray are cached on layout or decode.
- No per-frame canvas allocation or image decode is needed.
- No runtime dependency or build step is added.

## Verification

- `npm test`: campaign rules, solver agreement, and expression decisions.
- `npm run test:render`: frontal geometry, cube proportions, shallow obstacles,
  no raster penguin/wall art, nine distinct vector expressions, real touch drags
  and cancellation in all four directions, reduced motion, and responsive fit.
- `npm run test:expression`: reaction triggers, expiry, poses, and silhouette.
- `npm run test:recovery`: multiple dead-end moves, nearest solvable recovery,
  restart reversal, keyboard input, cancellation, unknown solver results, and
  recovery-button fit at 320px, 390px, and landscape widths.
- `npm run qa`: all 100 campaign stages and interaction checks.
- `npm run qa -- --fast-campaign`: the same checks with only campaign animations
  advanced to their endpoints; interruption and gesture probes keep real timing.
