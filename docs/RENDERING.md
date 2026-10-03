# A floe in real 3D

The engine remains a deterministic 2D grid and the single source of truth.
`src/render.js` turns it into a WebGL scene with three.js: one thick slab of
ice in the shape of the board's floor, floating in a pool of water, lit by a
sky, a sun and the auroras. The previous renderer faked depth by painting
projected faces onto a 2D canvas; this one has real geometry, real lights,
real shadows and reflections, which is why it no longer looks thin.

## Loading

three.js is vendored as one classic script, `src/vendor/three.js`, bundled by
`tools/build-three.mjs` from the `three` dev dependency with only the classes
the renderer uses. The game keeps no build step and still opens straight off
disk, where ES modules would be refused. `src/vendor/three.LICENSE` carries
its MIT licence.

## Coordinates and camera

World units are cells. Board x is world +X, board y is world +Z (towards the
camera), height is +Y, and the ice surface is at 0. A perspective camera looks
down the board from the front at a fixed 52° elevation with no yaw, so rows
stay level, the centre column stays upright, and the four swipe directions
still map straight to the screen. `frameCamera()` fits the floe, the far row's
penguins and the aim markers into whatever canvas it gets — phone, landscape
or desktop.

## The floe

`floorLoops()` walks the boundary of the ice cells into closed loops: the
outer rim and one loop per hole. Where two cells touch only at a corner the
walk turns back around its own cell, so ice never joins through a point. Each
loop is inset, its corners rounded (generously outside, tightly inside), and
extruded with a bevel into one slab 1.5 cells thick, 0.36 of it above the
water line.

- **Top:** melt-polished ice with frosted patches, computed per pixel into
  typed arrays: a tint and soft drift per tile, fine grain and sparkle,
  hairline fractures and trapped air bubbles, a roughness map (glossy where
  polished, dull where frosted or cracked), and the seams between
  neighbouring cells engraved into a matching normal map, so the grid is
  something the light falls into rather than a line drawn on top.
- **Sides:** vertex colours from white at the lip through clear blue at the
  waterline to deep blue below, with clearcoat, so the slab reads as ice. They
  carry no texture: a top-down projection would only streak them vertically.
- **Water:** a level pool that fades into the page at the edge of what the
  camera sees. The submerged part of the floe shows through it; a soft dark
  ring marks the waterline; slow ripples drift across it.

When a swipe is held, the floe — not the canvas — leans up to 5° in 3D towards
the direction gravity is about to go, and the water stays level around it.

## Penguins

Each penguin is a rounded cube in its colour (amber or violet) with plumage
textures, a white bib and face on the front, its colour's glyph on the crown, a
real beak, feet and two flippers. They cast real shadows and sit on a soft
contact shadow. The nine expressions are drawn procedurally into canvas
textures (cached per colour) and swapped onto the front face; poses from
`src/expression.js` move and scale the whole penguin. While gliding a penguin
leans back and lifts its flippers; on impact it squashes along the slide; when
collected it spins up into the aurora and vanishes.

## Auroras

The original `goal-top.png` artwork, recoloured to the penguin's colour and
emissive, lies on the cell with a soft glow; motes of coloured light drift up
off it. Collection flashes it and sends a coloured ring across the ice.

## Effects

A sliding penguin tears ice from its whole footprint, every 0.03 cell it
travels: tumbling shards and larger chips thrown up, back and to the sides, fine
frost clouds, and six lanes of scratches that stay on the ice for a second. A
stop throws about a hundred more. Budget 3,600 particles, each living 0.6–1.1 s
(scratches 1 s), all drawn as instanced meshes. A shaving that
lands on water sinks. A penguin stopped at the edge of the ice sends a ring
across the water. A clear rings the whole pool. Reduced motion turns off
tilt, shake, particles and idle motion; expressions stay.

## Performance

- Device pixel ratio is capped at 2; one 2048² shadow map from one light.
- Geometry and textures are rebuilt only when a stage loads.
- Reflections come from a small painted sky turned into an environment map
  once per renderer.
- The game loop still drops to about 20 fps while the board is at rest.

## Verification

- `npm test`: engine, campaign, floe accelerator and analysis contracts.
- `npm run test:render`: WebGL scene, projection and screen-aligned axes,
  ice under every ice cell and water under every hole (by ray cast), shadows,
  penguin model, nine distinct expression drawings, a pixel check that a hole
  is drawn as water, ice shavings, 3D tilt and its cancellation, reduced
  motion, and fit at 320 px, 390 px, landscape and desktop.
- `npm run test:expression`, `npm run test:recovery`, `npm run qa`: reactions,
  recovery and every campaign stage played through real input.

Headless browsers on machines without a GPU get WebGL through SwiftShader;
`tools/lib/browser.js` asks for it explicitly.
