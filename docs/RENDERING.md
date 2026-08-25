# Flat top-down tile rendering

`src/engine.js` remains the canonical 2D grid. The renderer maps every cell
directly to a screen-aligned square so the live board matches the home preview.

## View

There is no perspective, visible side face, camera controller, rotation, zoom,
or orbit. Logical X stays screen-right and logical Y stays screen-down, so all
four swipe directions match the visible penguin movement:

```text
screenX = originX + x * S
screenY = originY + y * S
```

Every row and column uses the same scale.

## Blocks and spacing

Every floor, hazard, goal, wall, and penguin is a softly rounded top-down tile.
The board uses a pale blue rounded tray like the home-screen preview.

## Supplied face assets

The renderer loads the 16 individual 512×512 PNGs in
`assets/textures/faces/`. Each visible tile is mapped directly by semantic role.
The supplied penguin face is the visible top-down penguin tile. Its beak receives
the matching goal colour at runtime.

Procedural cracks, snow, and penguin art remain only as load-error fallbacks.
The aurora texture receives a goal-colour filter and a weak emissive pulse; no
symbol or badge is placed over the supplied artwork.

## Lighting and occlusion

The texture artwork supplies the light and surface detail. Rendering adds a
small contact shadow beneath the penguin and a pale blue board tray.

Floor cells and goals paint first, then walls and penguins, then particles. This
keeps moving penguins visible without changing game state.

## Performance

- Device pixel ratio is capped at 2.
- Source assets are pre-sized to 512px; no runtime atlas crop occurs.
- Floor, hazard, goal-base, and wall tiles are cached as seven small sprites.
- The background cache contains only the rounded board tray.
- No per-frame canvas allocation or image decode is performed.
