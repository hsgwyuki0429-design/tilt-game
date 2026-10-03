# Sound

Everything is synthesised in `src/audio.js` with Web Audio. No files are
loaded, and the context starts on the first tap, as mobile browsers require.

The aim is a game that feels good to play, not a field recording. Sounds are
soft and rounded, pitched where it helps, and never harsh, gritty or clicky,
so a hundred swipes in a row stay pleasant.

## Sliding

Each stretch a penguin slides gets its own sound. The game schedules it on the
renderer's clock: it starts at the first tick and lasts `(cells × TICK + TAIL)`.
It is panned gently towards where on the board the slide happens. It follows
the picture's ease-out, so its speed goes as `(1 − u)^1.45`, and every layer
rides that curve.

- **Breath.** One 2 s buffer of smooth, lightly low-passed noise is built once
  and shared. It is band-passed (Q 1.1) with its centre following the speed,
  from about 1.8 kHz down to 0.8 kHz, and capped at 5.2 kHz. The result is a
  soft "shhh" that swells in over 30 ms and settles as the penguin slows.
- **Hum.** A quiet triangle around G4, low-passed and gliding down a fourth
  with the speed. A longer slide starts a little lower. It makes a slide feel
  smooth rather than noisy.

## Stopping

- **At the edge of the ice:** a round, soft "tok", a sine around 220 Hz with
  its octave on top that drops slightly as it dies. A longer slide lands a
  little lower and heavier.
- **Against another penguin:** a springy "pon", a quick upward blip and then a
  soft A4 pluck, like two soft toys bumping.

The notes sit with the goal chime (a C-major figure from C5), so a slide, a
stop and a collection sound like one instrument.

## Verification

`npm run test:audio` renders the sounds offline in Chromium and checks that:

- a slide is audible and does not clip;
- it is soft, with little energy above 6 kHz;
- it fades by more than 2.5× and mellows as it slows;
- it falls silent when the penguin stops;
- a bump into a penguin is pitched above a stop at the edge;
- in the real game, every moving penguin gets its own slide on the renderer's
  clock, and each stop knows whether a penguin or the edge stopped it.
