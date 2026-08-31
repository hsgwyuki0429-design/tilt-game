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

## The drifter

The drifter has no supplied artwork; it is drawn procedurally in
`Renderer.drawFloeTop`. Because the view is strictly top-down, its side faces
have no area, so the whole piece has to read off one square, and it has to
answer two questions at once:

- **Is it mine?** It is the only desaturated thing on the board. The walls are
  white-blue and the penguins near-black, so a mid blue-grey belongs to neither.
  It carries no face, no beak, and no colour an aurora could match.
- **Can I push it?** It sits *on* the tray rather than being part of it: inset
  from its cell, rounded, with a contact shadow, where a wall fills its cell
  edge to edge and casts none. A wide bevel around a raised inner panel supplies
  the rest, and is sized to stay several pixels wide at the 39px cell an
  iPhone SE gets.

Its ice quality comes from a diagonal sweep and one soft highlight rather than
from drawn frost lines. At cell size any small, countable set of strokes stops
reading as texture and starts reading as a glyph — two frost lines looked like a
slash — so the surface detail is all gradients, which have no shape to misread.
The north-west lighting matches the floor tiles and wall caps.

## Supplied face assets

The renderer loads the 16 individual 512×512 PNGs in
`assets/textures/faces/`. Each visible tile is mapped directly by semantic role.
The supplied penguin face is the visible top-down penguin tile. Its beak receives
the matching goal colour at runtime.

Procedural cracks, snow, and penguin art remain only as load-error fallbacks.
The aurora texture receives a goal-colour filter and a weak emissive pulse; no
symbol or badge is placed over the supplied artwork.

## Penguin expressions

The penguin's upward plane is a face, and which face it is comes from
`src/expression.js` — nine named expressions with one drawing each, held in
`FACE_FILES`. The renderer holds a `PenguinReactions` in `Renderer.reactions`
and asks it two things per penguin per frame: which image, and what pose. It
knows no expression names and no trigger conditions.

Every face asset is the same 512px square, mapped through the same top-face
quad, so a swap cannot change a penguin's size or position — `npm run
test:expression` asserts that on real pixels by comparing the drawn silhouette's
bounding box across all nine. The pose is one scale about the block's own
centre and one offset in cells, applied to the quad the renderer was going to
draw anyway; nothing reads it back, so a penguin mid-flinch still occupies
exactly the cell the rules put it in. Reduced motion drops the pose and keeps
the face.

Expressions expire on the frame clock rather than on timers of their own. A
reaction records the instant it is finished with, and `Renderer.frame` retires
it, which is why a fast player cannot be left with an old reaction's timeout
reverting a newer face. A live reaction reports itself busy, so the idle frame
throttle lifts for as long as one is running.

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
