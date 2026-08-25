# Fixed orthographic block rendering

`src/engine.js` remains the canonical 2D grid. The renderer does not change
stage coordinates, collision, gravity, hazards, movement, goals, move counts,
input, or UI layout. It only projects each grid cell into a fixed block view.

## Camera

The camera is a fixed orthographic projection. There is no camera controller,
rotation, zoom, drag-to-look, or automatic orbit. Logical X stays screen-right
and logical Y stays screen-down, so all four swipes still match the visible
penguin movement. Height alone shifts the upper face slightly up-left to expose
shallow south/east faces:

```text
screenX = originX + x * S - z * 0.07S
screenY = originY + y * S - z * 0.50S
```

This produces the slightly elevated reference composition without perspective
foreshortening; blocks in the back row remain the same size as blocks in front.

## Blocks and spacing

Every floor, hazard, goal, wall, and penguin shares that projection and is
positioned from its existing 2D cell. Faces have soft rounded corners and gaps
are deliberately small (`0.012S` for floor and `0.018–0.022S` for walls). A
compact shared shadow grounds the grid; there is no oversized tray or plinth.

## Supplied face assets

The renderer loads the 16 individual 512×512 PNGs in
`assets/textures/faces/`. Each is mapped directly by semantic role. Cracked ice
and auroras replace only the top face, while their sides inherit normal ice.
Orange and purple penguins use their matching supplied top images, and share the
supplied front, back, left, right, and four-foot bottom images.

Procedural cracks, snow, and penguin art remain only as load-error fallbacks.
The aurora texture receives a weak emissive pulse plus a small colour/shape ring
so the A/B matching rule stays readable without repainting the supplied image.

## Lighting and occlusion

The texture artwork supplies most of the light and surface detail. Rendering
adds only soft per-face shade, subtle contact/ambient occlusion, and a broad
low-alpha board shadow to avoid white clipping and crushed blacks.

Floor cells, goals, walls, penguins, ripples, and particles enter one painter
queue. Commands sort by their 2D footprint, then layer and X tie-breaker, so a
foreground wall can cover a penguin behind it without changing game state.

## Performance

- Device pixel ratio is capped at 2.
- Source assets are pre-sized to 512px; no runtime atlas crop occurs.
- Floor, hazard, goal-base, and wall cubes are cached as seven small sprites.
- The background cache contains only the compact board shadow.
- No per-frame canvas allocation or image decode is performed.
