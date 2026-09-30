# Visual meditation

Visual focus modes for meditation, built for a phone held in portrait.

## Modes

- **Candle.** Trataka: gaze at the flame, close your eyes at the chime, hold the afterimage, repeat.
- **Breath.** A light that grows and shrinks to a breathing pattern (resonance, calm, box, 4-7-8),
  with an optional sound that follows the same rhythm.
- **Bowl.** A singing bowl struck at a set interval. Listen to each strike until it is gone.
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
- `sound` (optional): `{ start(values), stop() }`, built from `js/audio.js`

Shared constants are in `js/config.js`.
