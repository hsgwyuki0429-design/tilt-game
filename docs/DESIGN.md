# TILT — interface design

> The board is the game. Everything in this document exists to keep the interface
> out of its way.

This is the record of a full redesign of TILT's interface against Apple's Human
Interface Guidelines. It states what was wrong, what changed, what deliberately
did **not** change, and the exact numbers a developer needs.

Two things are fixed and were never up for negotiation:

- **The rules of the game.** Gravity, the settle→resolve loop, the four win
  conditions, the campaign, every `par`. `docs/RULES.md` owns those and nothing
  here contradicts it.
- **The one-bit input.** A swipe is a direction. There is no drag, no tap-to-move,
  no undo gesture. Anything that made the input richer would make the game
  poorer.

---

## A · What was wrong

Ranked by how much each one costs a real player, not by how obvious it is.

### A1 · A wall and a block were the same picture — *severity: critical*

Both were drawn as glossy rounded tiles lit from above, differing only in hue.
On a SELECT board, where an uncollectable block is drained toward slate, a wall
and a movable block landed in the same colour family and became nearly
indistinguishable.

"What can I still push around?" is the first question the player asks on every
board in this game. The art was answering it ambiguously. This is a **gameplay**
defect wearing a visual-design costume, and it was the single most important
thing to fix.

### A2 · The rule that defines the game was never shown — *severity: critical*

TILT rests on one rule: **a block is collected only if it comes to a complete
stop on a goal.** Stage 2 exists to teach it. But when a block slid straight
across a goal, *nothing happened on screen* — no mark, no sound, no change. The
game's central rule was taught by absence, and the only backup was a sentence in
a hint that disappeared after six seconds.

### A3 · The hint was a six-second toast — *severity: high*

Every rule the game teaches was delivered as a transient line that vanished and
could never be recalled. Look away, get a phone call, come back tomorrow — the
rule is gone and there is no "how to play" anywhere in the product. Meanwhile the
win-condition chip (`ONLY MARKED`, `BUILD THE SHAPE`) was set at **9px**, below
any legible minimum, in a corner of the HUD.

### A4 · Restart was an irreversible twin of Undo — *severity: high*

`[UNDO] [RESTART] [TILT] [SOUND]` — four buttons, one row, identical treatment.
Undo and Restart were adjacent, the same size, the same colour, the same weight.
On stage 40 (par 57) a mis-tap threw away an afternoon with no way back.

### A5 · Settings were living in the gameplay dock — *severity: medium*

Half the dock was `TILT` and `SOUND` — things a player sets once, occupying
permanent screen real estate on the surface they stare at for an hour, at equal
visual weight to the two actions that actually matter.

### A6 · Game Over made the expensive choice the obvious one — *severity: medium*

`RETRY` was the filled primary button; `UNDO` was the quiet ghost. One tap of
undo puts the block back and returns a live position. The interface was steering
players toward discarding the run.

### A7 · Typography was genre costume, not type design — *severity: medium*

Everything was uppercase with heavy tracking at tiny sizes: `STAGE 01 · GRAVITY`
(10px/0.16em), `MOVES` `PAR` `BEST` (9px/0.14em), `UNDO` `RESTART` (9px/0.13em).
That is a sci-fi HUD trope, not a type system. Nothing supported Dynamic Type;
every size was a hard-coded pixel value.

### A8 · Three counters, permanently, for one useful number — *severity: medium*

`MOVES` / `PAR` / `BEST` all carried equal weight in the HUD. `BEST` showed `—`
on any unplayed stage — a permanent slot for "no information yet".

### A9 · `window.confirm()` — *severity: medium*

Erasing all progress used the browser's native dialog. It renders as a system
alert with the page's URL in it. Nothing says "not a real app" faster.

### A10 · Structural and platform issues — *severity: assorted*

| | |
|---|---|
| `user-scalable=no, maximum-scale=1` | Disables pinch zoom — an accessibility failure Apple explicitly calls out. The gesture that actually interferes with play is double-tap, and `touch-action` kills that one on its own. |
| Dock sat on the home indicator | `padding-bottom: 12px` inside the safe-area inset put buttons directly in the home-gesture strip. |
| HUD crowded the Dynamic Island | 10px of padding under a 59pt inset. |
| A 3×3 board got 230pt cells | Width-constrained to nearly edge-to-edge; it read as nine giant buttons rather than as a board. |
| Reduce Motion only reached CSS | The canvas kept shaking, bursting and squashing regardless. |
| `🔒` emoji in the stage list | A yellow system emoji dropped into a hand-drawn monochrome icon set. |
| Reset Progress in a fixed footer | The most destructive action in the product, given the most persistent position on the screen. |
| No haptics at all | The one feedback channel that costs zero pixels. |

---

## B · The approach

**Keep.** The dark space-navy world. The four-colour palette *with its shapes* —
circle/triangle/square/diamond, matched between block and socket, is genuinely
excellent colour-blind-safe design and predates this pass. The sunken socket vs.
floor-bracket distinction between a goal and a FORM target. The hazard drawn as a
striped pit. The automatic rewind on a jammed board. Synthesised audio that rises
through a chain. Idle frame-rate throttling.

**Delete.** The 6-second hint. The `BEST` counter in the HUD. `TILT` and `SOUND`
from the dock. `window.confirm`. The `RESET PROGRESS` footer. Uppercase as a
default. Gradient-and-glow buttons. The gradient wordmark. Every emoji.

**Change.** Walls, so they read as terrain. The dock, to two actions with a
hierarchy. Game Over, so Undo leads. The hint, into a permanent objective line
that is also the entry point to the rules. Restart, into an undoable action. The
whole type system, to the iOS scale in sentence case with Dynamic Type support.
Board sizing, to a capped and optically-centred composition.

**Add.** Pass-over feedback (§C3) — the single most valuable addition here.
Haptics. A Settings sheet. A How-to-play sheet. A launch curtain. A first-run
gesture cue drawn on the board. Drag-to-dismiss sheets. Canvas-level Reduce
Motion.

### What was considered and rejected

| Idea | Why not |
|---|---|
| **Show a ghost preview of where blocks will land while aiming** | This is the game. TILT's entire difficulty is predicting the consequence of a tilt; `docs/RULES.md` §3.1 is explicit that the gap between a one-bit input and a whole-board consequence "is where the entire game lives". A landing preview is a beautiful piece of UX that would delete the product. **The board leans toward the aim instead** — physical, immediate, and reveals nothing. |
| **A hint / solution button** | Undo is free and there is no move limit; the game's own answer to being stuck is "try it and see". A hint button would replace the intended verb with a worse one. |
| **A separate title/home screen** | A returning player should be one launch from the board they were on. The launch curtain gives TILT its name without costing a tap; the Stages sheet does everything a home screen would. |
| **A pause screen** | There is no clock. "Stop and look at where I am" and "open the menu" are one intention, so they are one sheet. |
| **A retry screen** | The Game Over card *is* the retry screen. |
| ~~**A light theme**~~ | Originally rejected — "the game is a lit object in a dark room". That was overturned on request, and §H records what the inversion actually cost and taught. The game is now light-only, held to the same AA contrast. |
| **A confirmation on Restart** | It taxes the ninety-nine intended restarts to catch the one that was not. Undoing it is strictly better (§C7). |

---

## C · The screens

Five surfaces, and no more.

### C1 · Launch

**Purpose.** Give the game its name without costing the player a second.

The app's own background (`--bg`) with `TILT` in the wordmark treatment, letter-
spacing easing from `0.28em` to `0.42em` over 620 ms. It is removed the moment
the board is ready: a **90 ms** hold on any normal launch, **620 ms** exactly
once — the first time this person has ever opened the game — so the name is seen
once and never again. Nothing loads behind it. It is the first frame of the app,
not an advertisement in front of it.

**First-run.** No tutorial screen, no carousel, no permission prompt. The board
appears with a finger-shaped cue sweeping across it (§C2) and the objective line
reading *"Swipe to aim gravity"*.

### C2 · Game — the only screen that matters

```
┌─────────────────────────────────────┐  ← safe-area top (Dynamic Island)
│ [▦]  STAGE 1 · GRAVITY         0    │     HUD, 52pt
│      DROP                    PAR 2  │
├─────────────────────────────────────┤
│                                     │
│                                     │
│            ▢  ▢  ▢                  │
│            ▢  ▢  ▢    ← the board   │     flexible, gets everything
│            ▢  ▢  ▣                  │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ ◎  Collect every block           ?  │     objective line, 44pt
├─────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────┐     │
│ │  ↩  Undo      │ │  ↻ Restart│     │     dock, 54pt buttons
│ └───────────────┘ └───────────┘     │
└─────────────────────────────────────┘  ← safe-area bottom + 10pt
```

**HUD.** Menu button (44×44, optically aligned with −6pt margin), stage kicker +
nameplate, and one number. Moves is 22pt/650; par is an 11pt caption beneath it.
Past par, moves turns amber and nothing else happens — it is information, not a
failure. `BEST` is gone from here entirely; it appears on the stage card and the
clear card, where it is something you are looking at rather than something in
your peripheral vision.

**Board.** Cells capped at **112pt** and optically centred (4% of the slack above
mathematical centre, max 10pt, because the eye weights the top of a tall box).
Margin `max(18, min(w,h) × 0.055)` so the gravity chevron lives outside the grid
without touching the screen edge.

**Objective line.** *Permanent.* Sits in space the board was never going to use.
Carries the win condition for every board — including ALL IN, because a caption
that appears on some stages and not others is one the player has to keep checking
for. On a stage that teaches a rule and has not yet been solved, the teaching
line takes precedence, tinted with the accent; it gives way to the plain
objective once the stage is behind them. The whole row is a button: tap it and
the rules open.

**Dock.** Two actions, and they are the only two the board itself cannot express.
Undo is `flex: 1.7` against Restart's `1`, filled against outlined — pressed a
hundred times more often, so it is twice the target and visually louder. Restart
is quiet, and undoable (§C7).

**Empty / error states.** There is no empty state — a board always has blocks. If
the engine fails to compile a stage, the shell replaces itself with the fatal
card naming the error rather than showing a blank canvas.

### C3 · Feedback on the board

This is where the "no reading required" requirement is actually met.

| Event | What the player sees | Sound | Haptic |
|---|---|---|---|
| **Aiming** | Board leans up to **7pt** toward the direction (`min(7, cell × 0.055)`, lerped at `dt/90`). Accent-tinted edge band + large chevron outside the board. | — | `select` |
| **Committed tilt** | Blocks slide, 54 ms per cell, `easeOut` 2.4. | rising sweep | `tilt` |
| **Block lands** | Squash along the axis of travel, 130 ms, strength scaled by distance travelled. | pitch drops with distance | `land` |
| **Collected** | Socket flashes, ring expands, 12 particles. | rising scale — 3rd of a chain is higher than the 1st | `collect` |
| **Chain ≥ 2** | Toast: `Chain ×3` | — | — |
| **Passed over a goal** ⭐ | **A grey dashed ring opens at the socket it went through.** | — | — |
| **Tilt changed nothing** | Board strains that way and springs back (`sin(πt)(1−t) × cell × 0.13`, 300 ms). **No move is charged.** | low thud | `blocked` |
| **Stopped on a hazard** | Red burst at that exact cell, ring, shake — *then* 340 ms later the card. | the ugliest sound in the game, and short | `over` |
| **Jammed board** | The move is auto-undone; toast: *"Dead end — that move was taken back"* | undo | `blocked` |
| **Solved** | One clean ring from the centre, 14 sparks, then the card at 460 ms. | rising chord | `clear` |

⭐ **The pass-over ring is the most important addition in this redesign.** When a
block slides across a goal it fits without stopping, the socket answers with a
grey dashed ring. Grey, not red — nothing went wrong and nothing was lost. It is
the board saying *"that one was not taken"*, which is a fact about the rules and
not a scolding.

That single effect teaches TILT's defining rule by demonstration, on the first
try, in any language — and keeps teaching it forty stages later when the player
does it by accident. It replaces a sentence nobody re-reads with a picture nobody
has to. Capped at **4 rings per move** and only for goals the passing block
actually fits, so a dense late board does not flicker.

Both deferred cards (clear, game over) **re-check the phase when their timer
fires**. Half a second is plenty of time to press undo, and a card announcing
something that has since been taken back is a card the player cannot explain.

### C4 · Stages sheet — also the pause screen

Presented as a system sheet: grabber, 28pt top corners, stopping `safe-top + 12`
short of the screen edge so the strip behind it says there is something
underneath. Four ways out — grabber drag, close button, scrim tap, Escape.

Header: title + gear (→ Settings) + close. Then a progress row — big number,
`/ 40`, and a bar, because the bar is the same fact in a form you read without
counting. Then chapter sections with a card per stage.

Stage card, 76pt tall, `minmax(98px, 1fr)` grid:

| State | Footer glyph | Colour |
|---|---|---|
| Locked | lock icon | quaternary label, 40% opacity |
| Unlocked, unplayed | `Par 7` | tertiary label |
| Solved | ✓ + move count | accent |
| Perfect | ★ + move count | amber |

Three states, three glyphs, three positions. **Colour is the last thing carrying
the meaning here rather than the first.** Every card also carries an `aria-label`
naming stage, name and result.

Drag-to-dismiss is bound to the grabber and title bar **only** — binding it to
the whole sheet means every attempt to scroll forty stages fights the dismiss
gesture, which is the most common way this interaction is got wrong.

### C5 · Settings sheet

Pushed from the Stages sheet; the parent slides back `14pt` and scales to `0.965`
under a dim, so the stack is legible and Back obviously goes somewhere that still
exists. iOS grouped-list idiom throughout: 52pt rows, hairline separators,
explanations *under* a group rather than inside it, system-dimension switches
(51×31, 27pt knob, 20pt travel).

- **Sound** — switch
- **Haptics** — switch; the row is **hidden entirely** when the platform offers
  nothing, because a switch that does nothing is worse than no switch
- **Tilt controls** — switch, with a footnote saying swiping always works too;
  hidden when `DeviceOrientationEvent` is absent
- **Reduce motion** — switch, defaulting to the system preference
- **How to play** — row with chevron
- **Erase progress** — destructive row, red label

### C6 · How to play

Four rules, four figures, one line each; a player who wants the rules gets them
in fifteen seconds, and a player who does not never opens this screen. The
figures are drawn in the **board's own language** — same corner radii, same
socket ring, same hazard hatch — so the diagram and the game are visibly the same
object rather than an illustration of it.

1. **You aim gravity** — a block, an arrow, the same block arrived
2. **A goal is not a target** — a block passing *through* a socket and stopping
   past it: the mistake everybody makes once, drawn
3. **What stops you** — the edge, a wall, a block, in the order the campaign
   teaches them
4. **The hazard** — a block crossing a striped pit safely

Closing line: *there is no move limit and undo is free; trying something to see
what it does is how this game is meant to be played.*

### C7 · Clear / Game Over card

Bottom-anchored inside the board area, not centred. Two reasons: the buttons land
in the thumb arc, and the top of the board — the position you just solved — stays
visible above it. The backdrop is a **gradient**, transparent at the top and
solid behind the card.

The HUD and dock stay live and reachable behind it, deliberately: muscle memory
for Undo keeps working.

**Clear card.** Result mark (52pt disc, glyph inside — a *shape* before it is a
word, so cleared/perfect/ended do not depend on telling cyan from amber from
red), kicker, title, optional `New best` flag, a stats block (moves · par · best),
a par note if not perfect, then `Next stage` filled and `Try again` plain.

**Game Over card.** Hazard triangle in a red disc, *"Run ended"*, and a body line
that **names the rule**: "A block was left standing on a hazard. One undo puts it
back." **`Undo` is the filled primary action**; `Restart` is plain beneath it.
The cheap reversible answer goes first.

**Restart is undoable, and there is no dialog.** Restart is instant, and the
toast that says it happened carries `Undo` inside it for 4.2 s. That is the Apple
pattern (Undo Send), and it removes a confirmation without removing the safety.
Confirmations are for things that cannot be taken back — which in this game is
exactly one thing.

### C8 · Erase progress confirm

The one dialog in the product. An action-sheet card naming the consequence, with
the destructive choice in red and Cancel as the safe default. Dismissible by
tapping outside.

---

## D · UX flow

```
LAUNCH ─── curtain (90ms; 620ms on the very first launch ever)
   │
   ├── first ever ──► Stage 1, finger cue sweeping the board,
   │                  objective line: "Swipe to aim gravity"
   │                       │
   │                  tap the board? ──► cue replays. A poke is a question.
   │                       │
   │                  first successful swipe ──► cue never appears again
   │
   └── returning ───► first unsolved stage, straight in. Zero taps.
                            │
        ┌───────────────────┴────────────────────┐
        │              PLAY                       │
        │  swipe → lean → commit → slide → settle │
        │  wrong? undo (free, unlimited)          │
        │  lost the thread? restart (undoable)    │
        │  jammed? the game rewinds itself        │
        └───────────────────┬────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
     SOLVED            HAZARD                 MENU
        │                   │                    │
   card @460ms         card @340ms         Stages sheet
   Next / Try again    Undo / Restart      ├── stage → play
        │                   │              └── gear → Settings
   Next ─► next stage  Undo ─► live board       ├── switches
                                                ├── How to play
                                                └── Erase (confirm)
```

### Where a player could get stuck, and what handles it

| Moment | The risk | The answer |
|---|---|---|
| First launch | "What do I do?" | Finger cue on the board; a tap replays it |
| Stage 2 | Aims at the goal, sails past, no idea why | **The pass-over ring** |
| Stage 11 | Loses a block, does not know why | Red burst *in the exact cell*, card names the rule, Undo is primary |
| Stage 21/26/31 | New win condition | Objective line, permanent, in plain language |
| Any stage, later | "What was the rule again?" | Objective line is a button → How to play |
| Jammed | Tilting a dead board forever | Auto-rewind + toast |
| Hard stage | Walled off from the rest of the game | 2-stage skip window (pre-existing) |
| Mis-tapped Restart | Loses 40 moves | Toast with Undo, 4.2 s |
| Wants sound off | — | Stages → gear → Sound |

### Taps removed

| Task | Before | After |
|---|---|---|
| Launch → playing | 0 | 0 |
| Undo a mis-tapped restart | **impossible** | 1 |
| Recover a hazard death | 2 (read, find ghost Undo) | 1 (primary) |
| Re-read a rule you forgot | **impossible** | 1 |
| Change a setting | 1 | 3 — *deliberately*, to buy back the dock |

---

## E · Design system

### Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F1F3F9` | ground — a light cool grey, so white can sit *on* it |
| `--bg-raise` | `#FFFFFF` | cards, list rows, dock keys |
| `--bg-sheet` | `#F5F6FB` | sheets |
| `--bg-card` | `rgba(255,255,255,0.92)` | cards, over blur |
| `--fill-1/2/3` | `rgba(60,70,120, .055/.10/.16)` | control · pressed · active |
| `--sep` | `rgba(60,70,120,0.14)` | hairline |
| `--shade`/`-2`/`-3` | `rgba(28,36,76, .10/.14/.20)` | the only thing that says "above" |
| `--label` | `#10132A` | primary — **16.5:1** |
| `--label-2` | `#474E6C` | secondary — **7.4:1** |
| `--label-3` | `#616986` | tertiary — **4.9:1** |
| `--label-4` | `#A9AFC3` | disabled only (exempt from AA) |
| `--accent` | `#06718F` | the only interactive colour — **5.0:1** |
| `--amber` | `#AF6E08` | perfect, past par — **3.7:1**, large text and glyphs only |
| `--mint` | `#0A7D59` | new best — **4.6:1** |
| `--red` | `#C3253A` | run ended — **5.2:1** |

Every label colour above passes WCAG AA on `--bg` *and* on white; `--label-4` is
used only for disabled controls, which the standard exempts. `--amber` is the one
value held to the 3:1 large-text threshold rather than 4.5 — orange on white
cannot reach 4.5 without ceasing to be orange — and it is never used for body
text, only for a 28pt title, a stat glyph and a badge fill.

Every number in that table was **measured, not chosen**: the palette was run
through a WCAG contrast script before it was written into the code, and four of
the first-draft values failed and were replaced.

**No state anywhere is carried by colour alone.**

| Meaning | Colour | *and* |
|---|---|---|
| Hazard cell | red | sunken pit + diagonal hatch |
| Wall | slate | square corners, matte, no shadow, merged seams |
| Block colour | 4 hues | 4 shapes — circle / triangle / square / diamond |
| Uncollectable block | desaturated | dashed hollow glyph, no glow |
| FORM target vs. goal | same hue | brackets *on* the floor vs. sunken socket |
| Solved stage | accent | ✓ glyph |
| Perfect stage | amber | ★ glyph |
| Locked stage | dim | lock glyph |
| Past par | amber | — (redundant; the number itself is the information) |
| Run ended | red | hazard triangle in the result mark |

### Type

iOS scale × `--tsx`, where `--tsx` is measured from `-apple-system-body` and
clamped to `[1.0, 1.3]`. That is the only way a web page can honour Larger Text
at all; it is clamped because past 1.3 the board starts losing rows to the
chrome, and a game whose board does not fit is not an accessible game.

| Token | px @ 1.0 | Used for |
|---|---|---|
| `--t-title1` | 28 | card titles, progress number |
| `--t-title2` | 22 | sheet titles, move counter |
| `--t-title3` | 20 | stat values, confirm title |
| `--t-body` | 17 | base |
| `--t-callout` | 16 | button labels, settings rows |
| `--t-subhead` | 15 | dock labels, rule headings |
| `--t-footnote` | 13 | objective line, notes, stage names |
| `--t-caption` | 12 | fine print |
| `--t-caption2` | 11 | stat labels, kickers — **the floor** |

**Uppercase appears exactly twice**: a stage nameplate and a stat label. Both are
names, not sentences, both are short, and the tracking reads as engraving rather
than shouting. Everything else is sentence case. Numbers are tabular
(`font-variant-numeric: tabular-nums`) so a counter never jitters as it counts.

### Space, radius, targets

8pt grid (`--s1..--s8` = 4/8/12/16/20/24/32). Radii: `10 / 14 / 18 / 24 / 28`
(sheet) / `999`. **Every tap target ≥ 44×44pt**, including the 34pt round buttons,
which carry a `::after { inset: -5px }` to expand the hit area without changing
how they look.

### Motion

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 110 ms | press-down |
| `--dur` | 240 ms | state change |
| `--dur-sheet` | 420 ms | sheet present / dismiss |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | responding to a finger |
| `--ease-ios` | `cubic-bezier(.32,.72,0,1)` | things entering |
| `--ease-pop` | `cubic-bezier(.2,.9,.28,1.08)` | a result landing |

Every duration is the shortest one that still reads as *caused*. Nothing here is
decorative, and **nothing animates while the player is thinking** — the render
loop drops to ~20 fps whenever the board is at rest.

**Reduce Motion** is honoured in three places at once: CSS via
`@media (prefers-reduced-motion)`, the same rules via `:root.rm` for the in-app
switch, and the canvas via `renderer.reduceMotion` — which turns off shake,
particles, squash, the aim lean and the rebuff spring, and swaps the animated
finger cue for a static double-headed arrow that says the same thing in one
glance. `:root.motion-full` lets an explicit "no, I want the animation" beat the
system default, which is the bug every hand-rolled version of this has.

### The board's material language

The tray is the grey and the cells are the white — inverting that makes the
board read as a hole rather than as a surface.

|  | Corner | Surface | Shadow | Sits |
|---|---|---|---|---|
| **Wall** | `cell × 0.06` | matte grey gradient, lit hairline top/left | none | **in** the tray |
| **Block** | `cell × 0.26` | saturated fill + light gloss + hairline rim | cast, `+5.5%` Y | **on** the tray |
| **Hazard** | `cell × 0.13` | tinted recess, inner shadow, hatched | inward | **below** the floor |
| **Socket** | `cell × 0.20` | tinted well + inner shadow, coloured rim | inward | **in** the floor |
| **Target** | brackets | on-floor corners, hollow when filled | none | **on** the floor |

Four axes separating a wall from a block, not one. You can tell them apart in a
photograph, in greyscale, and out of the corner of your eye — which is the
standard, because that is how they are actually read during play. Adjacent walls
merge with a seam so a run of them reads as one built mass rather than a row of
loose bricks.

Uncollectable blocks (SELECT) keep their **shadow and round corner** — they are
objects — and lose their saturation and their filled glyph, gaining an outline
instead. Since walls no longer look like blocks at all, the confusion in §A1
disappears from both directions.

### Icons

One 24pt grid, `stroke-width: 1.9`, round caps and joins, `fill: none`, drawn as
a single `<symbol>` sprite. **Every icon that names an action is paired with a
text label**; none is asked to carry a meaning on its own. No emoji anywhere.

---

## F · Implementation reference

### Files

| File | Role |
|---|---|
| `index.html` | structure, icon sprite, launch curtain, sheets |
| `styles.css` | the token system and every screen |
| `src/render.js` | canvas: terrain, blocks, gravity field, effects, cues |
| `src/game.js` | flow, screens, settings, localisation, coaching |
| `src/haptics.js` | *(new)* touch feedback |
| `src/input.js` | swipe / tilt / keyboard, + tap detection |
| `src/save.js` | + `haptics`, `reduceMotion`, `everMoved`, `seenHowTo` |
| `src/engine.js`, `src/stages.js` | **untouched** — the game itself |

### Layout budget — iPhone 15 Pro (393 × 852, insets 59 / 34)

| | |
|---|---|
| Safe top + HUD | 59 + 52 = 111 |
| Objective line | 44 + 8 |
| Dock + safe bottom | 54 + 10 + 34 = 98 |
| **Board area** | **591** |
| 3×3 board @ 112 | 336 × 336, centred with 127 of slack |
| 4×3 board | `(393 − 2×22)/4 = 87` per cell |

Verified at 320×568, 375×667, 390×844, 393×852 and 430×932, in both orientations.

### Key constants

```js
// render.js
TICK      = 54     // ms per cell of travel
TAIL      = 48     // settle at the end of a slide
SQUASH    = 130    // impact deformation
MAX_CELL  = 112    // cap, so a 3×3 is a board and not nine buttons
lean      = min(7, cell × 0.055)          // aim offset
rebuff    = sin(πt)(1−t) × cell × 0.13    // over 300 ms
grazeRing = 520 ms, ≤ 4 per move
clearCard = 460 ms after settle   (phase re-checked on fire)
overCard  = 340 ms after settle   (phase re-checked on fire)

// input.js
SWIPE_MIN = 18px   |  FLICK_MIN = 10px within 260ms
TILT_ON   = 14°    |  TILT_OFF = 7° to re-arm  |  TILT_HOLD = 90ms
tap       = |dx| < 10 && |dy| < 10
```

### Behaviours worth stating precisely

- **A tilt that changes nothing costs no move** and never enters history.
- **Undo works mid-slide.** The logical state is not committed until the
  animation finishes, so cancelling the animation puts the board exactly where
  the move started.
- **Restart works mid-slide.** Wherever the board is going, the beginning is
  where it is going instead.
- **Restart leaves `history.length === 0`.** The restore point is held separately
  and expires with the toast.
- **The frame loop stops entirely** while a sheet is open and while the tab is
  hidden.
- **Focus rings** appear on `:focus-visible` only — a pointer press must not
  leave one behind, a keyboard one must.
- **`aria-hidden`** moves onto `#app` while a sheet is presented, and sheets carry
  `role="dialog" aria-modal="true"`.

### Verification

`npm test` = `tools/audit.js` (52 rule checks + all 40 stages proven solvable at
the declared par, every piece load-bearing) + `tools/qa.js` (114 checks driving
the real page in a real mobile-sized browser through the real input path).

One QA assertion was changed in this pass: the game-over check now waits for the
card to appear rather than for a fixed 200 ms, because the card is now
deliberately held back a beat. The delay is a design choice that may change; the
card appearing is the thing being tested.

---

## G · Final check

| | |
|---|---|
| **Easy to operate on an iPhone** | Every target ≥ 44pt. Undo is 1.7× Restart and in the thumb arc. 10pt of clearance above the home indicator. Extra padding under the Dynamic Island. Cards are bottom-anchored. |
| **Rules legible on first sight** | Finger cue for the gesture; a tap replays it. The pass-over ring teaches the defining rule by demonstration. The objective line is permanent and is a button to the full rules. |
| **UI stays out of the way** | Two buttons, one number, one caption line. Settings left the dock. `BEST` left the HUD. Nothing animates while the player is thinking. |
| **Transitions are coherent** | One sheet model with one curve, four ways out, a legible stack. Cards rise from the bottom. The launch curtain is the app's own background. |
| **Consistent** | One accent, one type scale, one icon grid, one stroke weight, one press behaviour, one radius family. |
| **Motion is not excessive** | Nothing over 460 ms. Effects capped (110 particles, 4 graze rings). Reduce Motion reaches the canvas, not just the CSS. |
| **Apple-like refinement** | iOS type scale in sentence case. Grouped-list settings. System-dimension switches. Undo-instead-of-confirm. Dynamic Type. `:focus-visible`. Pinch zoom restored. |
| **The game's own character survives** | The dark room, the four shaped colours, the glowing cargo against matte masonry, the wordmark, the stage names. Uppercase became a *signal* instead of a default, which is what made it mean something. |
| **App Store quality** | No emoji, no `window.confirm`, no gradient-glow buttons, no 9px type, no irreversible mis-tap, no rule that can only be read once. |

### Known limits, stated honestly

- **Haptics on iOS are best-effort.** `navigator.vibrate` is Android-only and
  there is no Taptic API for web pages. The game drives Safari 17.4's switch
  control inside the causing gesture; on a build without it every call is a
  silent no-op, and the settings row hides itself entirely.
- **Dynamic Type is measured, not native.** `-apple-system-body` is the only
  probe available, and the result is clamped at 1.3.
- **VoiceOver cannot read the board.** Every control is labelled and every state
  is exposed, but the canvas is not narrated cell by cell. Doing it properly
  means a parallel DOM grid with live-region announcements after each settle —
  a real piece of work, and out of scope for this pass.
- **Stage 39 is unwinnable from 32% of its positions.** That is a property of the
  board, flagged by `tools/audit.js`, absorbed by the automatic rewind, and a
  campaign decision rather than an interface one.


---

## H · The light inversion

The interface above was designed dark and then asked to be white. That is not a
palette swap, and the three places it was not are the interesting ones — each is
a case where the dark theme's reasoning was *correct* and its conclusion still had
to be thrown away.

### H1 · Emphasis flips direction

On black, a thing matters by being **lighter** than its surroundings: cargo blocks
carried an outer glow and furniture did not. On white that argument runs backwards
— lighter means closer to the paper, which means *less* present — so the glow was
deleted rather than translated. A glow on white is white on white.

Its job passed to a **rim**, and the emphasis inverted with it: a cargo block is a
solid saturated shape that needs only a hairline to sit off the page, while an
uncollectable one has drained almost to the paper and the rim is now the thing
doing the drawing. Filled is cargo, outlined is furniture — the same two states
and the same meaning, re-derived from the background rather than carried over.

### H2 · A hole does not draw itself

On a dark board any cell darker than the floor is already a hole; the socket got a
lit rim and the rest was free. On white, a pale ring on white paper is a **picture
frame**. The recess had to be built: a tinted well, and then an inner shadow
falling in from the top edge, which is the only cue that separates "sunk into the
surface" from "printed on it" under a light from above.

This was caught by looking at the first light build, not by reasoning — the socket
passed every contrast check and still did not read as a hole.

### H3 · The loudest thing available changed

A wall on black receded by being darker than the room. On white "darker" is the
single loudest move on the screen, and the first light build had walls as
near-black slabs that dominated every board. They were pulled back to a mid grey
that still clears 3:1 against the floor. The same is true of the gravity band:
light-on-dark blended away at both ends, dark-on-light left a hard edge where the
tray began that read as a rendering fault, so it lost a third of its weight and
the chevron took over the job.

### What did not change

The four block colours kept their **hues and their shapes** — circle, triangle,
square, diamond, matched between block and socket. The identity of this game lives
in the hue and the glyph, not in the brightness, so every colour moved to the deep
end of its own family rather than to a different family. The §A1 fix survives
intact and is arguably stronger: the wall is now the only **grey** object on the
board, so "is that a wall?" is answerable without reading a shape at all.

### What this cost

Nothing structural. No layout, no flow, no timing, no copy and no rule changed;
`src/engine.js` and `src/stages.js` were never touched. It is `styles.css`, the
renderer's theme, and the four how-to diagrams. Both suites stayed green
throughout, which is the point of having had them.

**Adding dark back** would be a data change rather than a rewrite: every colour the
canvas uses now lives in one `THEME` object plus `PALETTE`, and every colour the
chrome uses is a custom property in one `:root` block. That was not true before
this pass — nineteen colours were inline literals in drawing code — and making it
true was most of the work.
