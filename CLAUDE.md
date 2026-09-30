# Visual meditation

Static site on GitHub Pages. Plain HTML, CSS, JS. No build step, no framework.
WebGL fragment shaders for the visuals.

## Rules

- Mobile first. Primary device is a phone held in portrait. Desktop is secondary.
- One source of truth. Every constant (timings, colours, durations, shader
  params) and every shared function is defined once and imported or referenced
  everywhere else. No duplicated magic numbers, no copy-pasted logic. If a value
  appears twice, extract it.
- Each mode is self-contained: one module, one shader, registered in a single
  mode list. Adding a mode touches that list and nothing else.
- Keep the screen awake during a session (Screen Wake Lock API) and hide all UI
  until tapped.
- No rapid high-contrast flicker in any mode (photosensitivity).
- Scratch, previews and experiments go in `local/` (gitignored).
