# Visual meditation

Visual focus modes for meditation, built for a phone held in portrait.

## Modes

- **Candle.** Trataka: gaze at the flame, close your eyes at the chime, hold the afterimage, repeat.
- **Candle V2.** The same candle, with small changes to the flame at random times (it leans,
  or its height, brightness or blue changes). Tap when you notice one. Changes get subtler as you catch
  them, and the size you can catch is kept between sessions. Hold the screen for the timer.
- **Candle V3.** Trataka with a filmed candle: a video you choose from your phone once. It is kept
  in browser storage (never uploaded or downloaded), and each session plays a random stretch of it.
- **Breath.** A light that grows and shrinks to a breathing pattern (resonance, calm, box, 4-7-8),
  with an optional sound that follows the same rhythm.
- **Bowl.** A singing bowl struck at a set interval. Listen to each strike until it is gone.
- **Fan.** An oscillating fan (air, blade flutter, motor hum) to listen into, detail by detail,
  with an optional tone every few minutes to switch detail.
- **Nature.** Rain on a pond at night, or clouds drifting at dusk.
- **Fractal.** A Julia set that changes shape very slowly.
- **Colour.** A full-screen colour field that shifts slowly (ganzfeld).

`?mode=<id>` opens a mode directly, e.g. `?mode=breath`.

## Run locally

ES modules need a server:

```sh
python3 -m http.server
```

Open http://localhost:8000.

## Adding a mode

Create `js/modes/<name>.js` and add it to `js/modes/index.js`. A mode exports:

- `id`, `name`, `blurb`
- `settings`: steppers (helpers in `js/modes/shared.js`)
- `plan(values)`: the session's phases, `{ label, seconds, visible }`
- `fragment`: GLSL body; `u_time`, `u_resolution` and `js/glsl/lib.js` are prepended
- `uniforms(values, t)` (optional): extra uniforms, called every frame
- `task` (optional): `{ start(values), tap(t), stop(t) }` for a mode that takes taps; `stop` returns
  `{ text, record }`, shown after the session and added to its log entry
- `sound` (optional): `{ start(values), stop() }`, built from `js/audio.js`
- `video` (optional): a source from `createVideoSource(id)` in `js/video.js`. The home screen gets a
  picker and Begin waits for a video. Pass `video.element` from `uniforms` and it arrives as a `sampler2D`

Shared constants are in `js/config.js`.
