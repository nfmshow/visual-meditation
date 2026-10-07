// Trataka: gaze at the flame, then close your eyes and hold the afterimage.
const STEP_S = 10;

export default {
  id: 'candle',
  name: 'Candle',
  blurb: 'Rest your gaze on the flame. At the chime, close your eyes and watch the afterimage until it fades. Open them at the next chime.',
  settings: [
    { key: 'gaze', label: 'Gaze', type: 'duration', min: 10, max: 300, step: STEP_S, default: 60 },
    { key: 'rest', label: 'Eyes closed', type: 'duration', min: 10, max: 180, step: STEP_S, default: 40 },
    { key: 'rounds', label: 'Rounds', type: 'count', min: 1, max: 10, step: 1, default: 3 },
  ],
  plan: ({ gaze, rest, rounds }) => Array.from({ length: rounds }, (_, i) => [
    { label: `Gaze · ${i + 1} of ${rounds}`, seconds: gaze, visible: true },
    { label: `Eyes closed · ${i + 1} of ${rounds}`, seconds: rest, visible: false },
  ]).flat(),
  fragment: `
// Geometry in screen-height units, origin at screen centre.
const vec2  FLAME_BASE   = vec2(0.0, 0.045);
const float FLAME_RADIUS = 0.03;
const float FLAME_LENGTH = 5.0;   // tip height in flame radii
const float FLAME_TAPER  = 0.32;
const float CANDLE_TOP   = -0.012;
const float CANDLE_HALF  = 0.08;
const float CANDLE_RIM   = 0.016; // vertical half-axis of the top ellipse
const float WICK_HALF    = 0.0022;
const float WICK_BEND    = 0.005;

// Motion. Slow and low amplitude on purpose (photosensitivity).
const float FLICKER_RATE  = 0.6;
const float FLICKER_DEPTH = 0.14;
const float SWAY_RATE     = 0.3;
const float SWAY_AMOUNT   = 0.7;
const float RIPPLE_RATE   = 1.6;
const float RIPPLE_AMOUNT = 0.45;

const vec3 FLAME_BLUE = vec3(0.15, 0.3, 1.0);
const vec3 EMBER      = vec3(1.0, 0.28, 0.04);
const vec3 WAX        = vec3(0.96, 0.9, 0.8);
const vec3 WAX_GLOW   = vec3(1.0, 0.45, 0.12); // light scattered through the wax
const vec3 POOL       = vec3(0.55, 0.3, 0.1);
const vec3 GLOW       = vec3(1.0, 0.5, 0.18);
const vec3 WICK       = vec3(0.02, 0.015, 0.01);

// 1.0 on the outline. q in flame radii, base circle centred at the origin.
float teardrop(vec2 q, float len) {
  vec2 e = vec2(q.x * (1.0 + max(q.y, 0.0) * FLAME_TAPER), q.y > 0.0 ? q.y / len : q.y);
  return length(e);
}

// Emission colour by heat: deep orange, through yellow, to near white.
vec3 flameRamp(float x) {
  vec3 c = mix(vec3(0.5, 0.08, 0.01), vec3(1.0, 0.42, 0.07), smoothstep(0.0, 0.3, x));
  c = mix(c, vec3(1.0, 0.75, 0.32), smoothstep(0.25, 0.6, x));
  return mix(c, vec3(1.0, 0.95, 0.84), smoothstep(0.55, 0.95, x));
}

void main() {
  vec2 p = screenUV();
  float px = 1.0 / u_resolution.y;
  float t = u_time;

  float flicker = fbm(vec2(t * FLICKER_RATE, 3.1));
  float sway = fbm(vec2(t * SWAY_RATE, 7.7)) * 2.0 - 1.0;
  float len = FLAME_LENGTH * (1.0 - 0.5 * FLICKER_DEPTH + FLICKER_DEPTH * flicker);
  float bright = 0.9 + 0.1 * flicker;

  // Flame: bends with the sway, ripples travel up it.
  vec2 q = (p - FLAME_BASE) / FLAME_RADIUS;
  float h = clamp(q.y / len, 0.0, 1.0);
  q.x -= sway * SWAY_AMOUNT * h * h;
  q.x -= (fbm(vec2(q.y * 0.5 - t * RIPPLE_RATE, t * 0.3)) - 0.5) * RIPPLE_AMOUNT * h;
  float d = teardrop(q, len);

  // Heat: crisp edge low down, soft toward the tip; dim at the blue base
  // and in the non-luminous zone round the wick.
  float heat = smoothstep(1.0, 1.0 - mix(0.2, 0.75, h), d);
  heat *= 1.0 - 0.45 * h * h;
  heat *= mix(0.15, 1.0, smoothstep(-0.9, 0.7, q.y));
  vec2 wq = q - vec2(0.0, 0.2);
  heat *= 1.0 - 0.55 * exp(-(wq.x * wq.x * 4.0 + wq.y * wq.y * 1.6));
  float blue = smoothstep(0.5, 0.88, d) * smoothstep(1.1, 0.9, d) * smoothstep(0.1, -0.9, q.y);

  vec3 flame = flameRamp(heat) * heat * 2.6 * bright;
  flame += FLAME_BLUE * blue * 0.2;
  // Photographic bloom hugging the flame.
  flame += GLOW * exp(-max(teardrop(q, len * 0.6) - 0.8, 0.0) * 2.2) * 0.1 * bright;

  // Light from the flame
  vec2 light = FLAME_BASE + vec2(0.0, FLAME_RADIUS * 1.6);
  vec2 dl = p - light;
  float r = length(dl * vec2(1.0, 0.7));
  vec3 halo = GLOW * (exp(-r * 9.0) * 0.22 + exp(-r * 2.6) * 0.06) * bright;
  float lit = bright / (1.0 + dot(dl, dl) * 55.0);

  // Candle: side, plus a top ellipse holding the melt pool.
  float xn = p.x / CANDLE_HALF;
  float side = smoothstep(1.0 + px / CANDLE_HALF, 1.0 - px / CANDLE_HALF, abs(xn))
             * smoothstep(CANDLE_TOP + px, CANDLE_TOP - px, p.y);
  float ty = (p.y - CANDLE_TOP) / CANDLE_RIM;
  float topE = xn * xn + ty * ty;
  float topAA = 2.0 * px / CANDLE_RIM;
  float onTop = smoothstep(1.0 + topAA, 1.0 - topAA, topE);
  float wax = max(side, onTop);
  float cyl = sqrt(max(0.0, 1.0 - xn * xn));
  float depth = CANDLE_TOP - p.y;
  float grain = 0.93 + 0.07 * vnoise(vec2(xn * 5.0, p.y * 14.0));
  vec3 sideCol = WAX * lit * (0.25 + 0.75 * cyl) * 0.75 * grain
               + WAX_GLOW * exp(-depth * 11.0) * (0.25 + 0.3 * cyl) * bright;

  // Melt pool: glossy amber inside a translucent lip, with the flame reflected.
  float pool = smoothstep(0.62, 0.5, topE);
  float lip = smoothstep(0.5, 0.75, topE) * smoothstep(1.0, 0.85, topE);
  vec2 rp = vec2(p.x - WICK_BEND * 0.5, (p.y - CANDLE_TOP + 0.003) * 3.0);
  float reflection = exp(-dot(rp, rp) / (FLAME_RADIUS * FLAME_RADIUS * 0.35));
  vec3 topCol = WAX * lit * 0.8 + WAX_GLOW * 0.35 * bright;
  topCol = mix(topCol, POOL * lit * 1.2 + flameRamp(0.7) * reflection * 0.6 * bright, pool);
  topCol += WAX_GLOW * lip * 0.35 * bright;
  vec3 candle = mix(sideCol, topCol, onTop);

  // Wick: curved, dark at the root, glowing at the tip.
  float wickTop = FLAME_BASE.y + FLAME_RADIUS * 0.45;
  float s = clamp((p.y - CANDLE_TOP) / (wickTop - CANDLE_TOP), 0.0, 1.0);
  float wick = smoothstep(WICK_HALF + px, WICK_HALF - px, abs(p.x - WICK_BEND * s * s))
             * step(CANDLE_TOP, p.y) * smoothstep(wickTop + px, wickTop - px, p.y);
  vec2 de = p - vec2(WICK_BEND, wickTop);
  float ember = exp(-dot(de, de) / (WICK_HALF * WICK_HALF * 3.0));

  vec3 col = halo;
  col = mix(col, candle + halo * 0.3, wax);
  col = mix(col, mix(WICK, EMBER * 0.6, smoothstep(0.4, 1.0, s)), wick);
  col += EMBER * ember * 0.9 * bright;
  col += flame;
  gl_FragColor = finish(col);
}
`,
};
