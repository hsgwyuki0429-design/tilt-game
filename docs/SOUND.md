# Sound

Everything is synthesised in `src/audio.js` with Web Audio. No files are
loaded, and the context starts on the first tap, as mobile browsers require.

## Sliding on ice

Each stretch a penguin slides gets its own sound. The game schedules it on the
renderer's clock: it starts at the first tick and lasts `(cells × TICK + TAIL)`.
It is panned to where on the board the slide happens. The sound follows the
same ease-out as the picture, so its speed goes as `(1 − u)^1.45`, and every
layer rides that curve.

- **Ice bed.** One 2.5 s buffer is built once and shared. It is white noise
  whose depth wanders slowly (the grain of the sheet), with about 900 short,
  sharp ticks a second (chips and ridges). Each slide plays a random stretch
  of it.
- **Scrape.** The bed, high-passed at 1.3 kHz with a lift around 4.6 kHz. A
  low-pass follows the speed from 12 kHz down to 2.2 kHz, so the hiss is bright
  while the penguin is fast and dull as it stops.
- **Grain rate.** The bed's playback rate also follows the speed (1.25× down
  to 0.55×). A faster body runs over more ridges a second, so the texture
  itself sinks in pitch and thins out.
- **Glassy ring.** Four narrow resonances of the sheet (about 2.4, 3.9, 5.9
  and 8 kHz, Q ≈ 40) are fed by the same bed and sink 7 % over the slide. This
  is what makes the hiss sound like glass or ice rather than sand.
- **Weight.** The bed, low-passed at 280 Hz: the body pressing on the sheet.

## Stopping

- At the edge of the ice: a short band of noise (a scrape-stop) and a soft,
  low thump.
- Against another penguin: two blocks of ice knocking. This is five
  inharmonic partials (×1, 2.32, 4.25, 6.63, 9.1 around 800 Hz), each dying
  within 25–160 ms.

A longer slide lands heavier.

## Verification

`npm run test:audio` renders the sounds offline in Chromium and checks that:

- a slide is audible and does not clip;
- it fades by more than 2.5× and loses more than half its 8 kHz-to-1.8 kHz
  brightness as it slows;
- it falls silent when the penguin stops;
- the glassy partials stand above the hiss;
- a knock rings on where an edge stop does not;
- in the real game, every moving penguin gets its own slide on the renderer's
  clock, and each stop knows whether a penguin or the edge stopped it.
