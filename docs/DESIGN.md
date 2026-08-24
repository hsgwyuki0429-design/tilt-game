# Campaign design

The ice campaign is intentionally small: five 5×5 levels, one or two cube penguins per board, and one matching aurora per penguin. Every board also contains cracked ice so the visual language and the rule stay consistent.

The difficulty curve is solver-verified:

| Level | Name | Minimum moves | Purpose |
|---|---|---:|---|
| 1 | HOME | 1 | Learn the swipe-to-gravity input with one penguin. |
| 2 | GLIDE | 3 | Move two penguins through shared gravity. |
| 3 | CRACK | 4 | Cross cracked ice without ending a move on it. |
| 4 | AURORA | 5 | Stop on an aurora instead of merely crossing it. |
| 5 | AWAY | 7 | Coordinate both routes, a wall, and two hazards. |

The engine rejects boards with more than two penguins, duplicate internal colours, missing auroras, extra auroras, wildcard pieces, and removed win modes. The UI presents those internal pieces as black-and-white cube penguins with small matching badges.

## Visual system

- The playable 5×5 ice tray is enclosed by a decorative 7×7 snow-wall ring.
- Ordinary ice uses translucent blue facets and a bright top rim.
- Cracked ice uses a cyan-lit radial fracture; auroras use cyan, violet, and pink spirals.
- The desktop layout pairs the interactive board with the HUD and tile guide from the supplied reference. Supporting visual panels hide below 620px.

