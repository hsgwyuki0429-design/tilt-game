# A floe in real 3D

The engine remains a deterministic 2D grid and the single source of truth.
`src/render.js` turns it into a WebGL scene with three.js: one thick slab of
ice in the shape of the board's floor, floating in a pool of water, lit by a
sky, a sun and the auroras. The previous renderer faked depth by painting
projected faces onto a 2D canvas; this one has real geometry, real lights,
real shadows and reflections, which is why it no longer looks thin.

Three files share the work:

| File | Owns |
|---|---|
| `src/render.js` | the scene, the camera, the clock, penguins, auroras, particles |
| `src/ice.js` | the ice and water materials and the textures they read |
| `src/quality.js` | which graphics tier to use, and when to give up on HIGH (no WebGL; unit-tested in node) |

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

## The floe's shape

`floorLoops()` walks the boundary of the ice cells into closed loops: the
outer rim and one loop per hole. Where two cells touch only at a corner the
walk turns back around its own cell, so ice never joins through a point. Each
loop is inset, its corners rounded (generously outside, tightly inside), and
extruded with a bevel into one slab 1.5 cells thick, 0.36 of it above the
water line. The extruder gives every triangle its own flat normal, which
facets the rounded corners, so the vertices are welded and the normals
averaged. The triangles are then split into two groups, what faces up and
what does not, which take two materials.

## The ice (`src/ice.js`)

Everything is worked out in the floe's own space from the point's position, so
the ice stays put on the mesh while the whole world leans, and the rounded
corners and the bevel need no UV coordinates.

**What the player sees**

- The top is melt-polished ice with white frosted veils. Looking into it you
  see fractures and trapped bubbles at several depths. Each deeper layer is
  shifted by parallax and tinted bluer, because ice absorbs red light first.
- Near an edge the ice is thin and glows cyan, and is more polished.
- The joints between cells are chiselled grooves with slightly wavering
  walls, which the light falls into.
- Frosted patches glitter. The sun wanders a hair, so the glitter twinkles.
- The flanks run from pale at the lip to deep glacier blue, with a lapping line
  of slush at the water. Below the water they catch moving caustics.
- The top takes more of the sky's reflection than the flanks, so the top
  looks glossy and the flanks stay deep.
- The water is turquoise on the shelf around the ice and deeper away from it.
  It is see-through close to the wall so the submerged ice shows, with a
  broken line of foam where it meets the wall and a little slush. The floe's
  shadow falls on it. A broad water plane extends towards the viewer rather
  than filling the height of the screen. Its pale far side, deeper blue
  foreground and fine horizontal wavelets give the sea perspective.

**How it is made**

- *Detail bank.* One tileable detail texture and one bump texture, generated
  once, in slices of a few milliseconds, and shared by every stage and
  renderer. The detail texture's channels are grain, frost, hairline fractures
  (long branching lines with a faint halo, drawn nine times so they wrap) and
  bubbles (clusters and scatter of soft discs). The bump texture is the
  grain's gradient. 512² on HIGH, 256² on LITE. Until it arrives the ice is
  drawn flat, which the launch curtain and the home screen cover.
- *Per stage.* Only two tiny textures: a w×h **cell map** (ice or water,
  cracked, a random tint) and a 16-texels-per-cell **signed-distance field**
  of the floe (negative in the water, 0 at the wall, positive inside). The
  field drives the edge glow, where frost may sit, the foam, the shelf colour
  and how see-through the water is. Loading a stage costs a few milliseconds
  however detailed the ice is.
- *The shading* is a patch to three.js's own physical material, so lights,
  shadows, reflections, clear coat and tone mapping are still its own. The
  patch sets the albedo, roughness, a bump and a little emission. The water is
  patched the same way.
- *Looking in.* HIGH follows the refracted view ray down through five layers
  of the detail texture, each sampled with a larger mip bias (deeper layers
  are blurrier) and dimmed by Beer–Lambert absorption with a different
  coefficient per colour channel.

## Graphics tiers (`src/quality.js`)

| | HIGH | LITE |
|---|---|---|
| pixel ratio cap | 2 | 1.5 |
| shadow map | 2048² | 1024² |
| particle budget | 5,000 | 2,600 |
| layers looked into | 5 | 0 (one flat layer of fractures) |
| detail texture | 512² | 256² |
| caustics, glitter, foam | yes | no |

Same shader and textures; only `#define`s differ, so changing tier is one
recompile.

Settings has an **Auto / High / Light** picker.

- **Auto** starts in the tier `detect()` suggests and watches real frames.
- **High** and **Light** are fixed.

`detect()` sends a device to LITE only when it is plainly weak: a software
renderer (SwiftShader, llvmpipe), an old Mali, Adreno 50x, PowerVR SGX or
Intel HD 2000–4000 GPU, a texture limit under 4096, two cores or fewer, or 2 GB
of memory with four cores or fewer. Browsers that hide the GPU name (Safari,
Firefox) are trusted; only the monitor can tell there.

The **frame monitor** counts only frames that follow a busy frame, because the
game loop idles at about 20 fps on purpose when the board is at rest. It
skips the first twelve (shaders and textures are being uploaded), then fails a
device whose 36-frame average gap exceeds 38 ms, or whose latest ten average
80 ms. 38 ms is above iOS Low Power Mode and 30 Hz battery savers (33 ms),
which are choices and not weakness. The monitor is fed the real gap between frames (not the 64 ms the animation clamps to), and five busy frames in a row of 200 ms or more fail a device at once, even inside the warm-up, so a very weak phone is not left half a minute with a frozen UI. A verdict drops to LITE once, tells the
player with a toast, and is remembered for two weeks (`qualityLearned` in the
save) so the next launch starts in LITE instead of stuttering through it
again. Any explicit choice in Settings forgets it.

If a shader fails to compile on some GPU, three.js's `onShaderError` swaps the
floe and the water to plain standard materials so the game still shows a
floe and a pool.

The home screen's picture is always LITE, so its second WebGL context costs a
small shadow map and a flat ice. All shaders are compiled at boot
(`compileAsync`), behind the launch curtain.

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

When a swipe is held, the floe — not the canvas — leans up to 5° in 3D towards
the direction gravity is about to go, and the water stays level around it.

A sliding penguin leaves a solid white streak right behind it and, behind that,
a band of **ice flakes** about the penguin's width, copied from the reference
video frame by frame. Every 0.075 cell on HIGH (0.12 on LITE) 46 (44) small
rounded flakes, 0.06–0.12 cell across, are laid on the ice, denser in the middle
than at the ragged edges, enough to hide the floor under the band. They are one
flat white, opaque, unlit and outside tone mapping, so the band stands out from
pale ice and overlapping flakes never show as layers. The streak fades in
0.13 s, so only the stretch just behind the penguin is solid; the flakes creep
outward, shrink and vanish over 0.5–1.1 s, oldest end first. A stop adds
thirty. All are instanced meshes with no depth writes,
within the tier's budget. Emission is distance-based at every
refresh rate and starts only over ice. A flake that lands
on water sinks. A penguin stopped at the edge of the ice sends a ring across
the water. A clear rings the whole pool. Reduced motion turns off tilt, shake,
particles and idle motion; expressions stay.

## Performance

- Geometry and the two small stage textures are rebuilt only when a stage
  loads.
- Reflections come from a small painted sky turned into an environment map
  once per renderer. It is drawn with gradients, not a canvas blur, because
  Safari has no `ctx.filter`.
- The game loop still drops to about 20 fps while the board is at rest.
- Not measured on real phones. The tier system exists so that this does not
  have to be right the first time.

## Verification

- `npm test`: engine, campaign, floe accelerator, **quality decisions**
  (`tools/quality-test.js`) and **the ice's cell map and distance field**
  (`tools/ice-test.js`) and analysis contracts.
- `npm run test:render`: WebGL scene, projection and screen-aligned axes,
  ice under every ice cell and water under every hole (by ray cast), shadows,
  penguin model, nine distinct expression drawings, a pixel check that a hole
  is drawn as water, ice shavings, 3D tilt and its cancellation, reduced
  motion, fit at 320 px, 390 px, landscape and desktop, and **both tiers**: no
  GL error, the right defines, shadow map, pixel ratio and particle budget, the
  two tiers drawing differently, sane detail-texture statistics, the monitor
  keeping HIGH at 60 and 30 fps and dropping it once on a sustained slow rate,
  a chosen tier never taken away, and the shader-failure fallback.
- `npm run test:expression`, `npm run test:recovery`, `npm run qa`: reactions,
  recovery, the Settings picker, and every campaign stage played through real
  input.

Headless browsers on machines without a GPU get WebGL through SwiftShader;
`tools/lib/browser.js` asks for it explicitly, and AUTO correctly calls that
LITE.
