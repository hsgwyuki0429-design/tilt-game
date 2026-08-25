# Supplied ice-world face textures

The live renderer uses the 16 standalone PNGs in `faces/`. They are the supplied
game assets, resized from 1254×1254 to 512×512 for mobile decode cost. No artwork
is regenerated and no contact sheet is sliced at runtime.

## Semantic face map

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
- `penguin-top-orange.png`, `penguin-top-purple.png`: colour-specific penguin
  tops used for A and B respectively.

The previous `atlas.jpg` files are retained as historical source material, but
the game no longer preloads, crops, or renders them.
