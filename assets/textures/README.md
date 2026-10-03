# Supplied ice-world face textures

The WebGL floe renderer maps one of these images: `goal-top.png`, recoloured
per penguin, is the aurora on the ice. The ice, water and penguins are geometry
and procedural textures, and there are no walls any more, so the other face
PNGs below are retained as supplied source material but not loaded by the game.
The expression drawings (`penguin-face-*`, `penguin-orange-*`,
`penguin-purple-*`) are still preloaded by `src/expression.js`.

They were resized from 1254×1254 to 512×512 for mobile decode cost.

## Semantic face map (the earlier 2D renderer)

- `ice-top.png`: normal ice top; reused on normal-ice sides because no separate
  side was supplied.
- `wall-top-ice.png`, `wall-top-snow.png`: smooth and perimeter wall tops.
- `wall-south-a.png`, `wall-south-b.png`: visible front faces for the two snow
  wall variants.
- `wall-east-a.png`, `wall-east-b.png`: visible right faces for the two snow
  wall variants.
- `cracked-top.png`: cracked hazard top only. Its other faces inherit normal ice.
- `goal-top.png`: aurora goal top only. Its other faces inherit normal ice.
- `penguin-front.png`, `penguin-back.png`, `penguin-west.png`,
  `penguin-east.png`, `penguin-bottom.png`: matching penguin cube faces.
- `penguin-front.png`: visible top-down penguin face. The beak is colour-filtered
  at runtime to match its destination.
- `penguin-top-orange.png`, `penguin-top-purple.png`: retained supplied variants;
  no longer used as the visible face.

The previous `atlas.jpg` files are retained as historical source material, but
the game no longer preloads, crops, or renders them.
