# Ice-world texture atlases

The six `atlas.jpg` files are the supplied visual references, kept by material:

- `ice`: normal floor
- `wall-smooth`: interior wall
- `wall-brick`: perimeter wall
- `cracked`: cracked-ice top
- `goal`: aurora goal top
- `penguin`: movable penguin cube

Each source is a 1280×960 contact sheet. `src/render.js` extracts only the six
label-free face rectangles into transparent 256×256 in-memory canvases named
`top`, `bottom`, `north`, `south`, `east`, and `west`. The source headings and
direction labels are never drawn.

The material API is face-oriented even though the fixed camera currently shows
only `top`, `south`, and `east`. A future standalone face PNG can replace an
atlas rectangle without changing cube projection or game logic. Cracked ice and
goals intentionally replace only `top`; their side/bottom faces inherit normal
ice so both remain full-height, traversable floor blocks rather than holes.
