import { lengthSetting, singlePhase } from './shared.js';

export default {
  id: 'fractal',
  name: 'Fractal',
  blurb: 'A Julia set changing shape very slowly. Take in the whole thing; there is nothing to follow.',
  settings: [lengthSetting(10)],
  plan: singlePhase('Watching'),
  fragment: `
const int   ITERATIONS = 96;
// c swings along |c| = 0.7885 inside the period-2 bulb, so the set stays connected
// (smooth, no dust that would shimmer on a small screen).
const float C_RADIUS   = 0.7885;
const float C_CENTRE   = 3.14159;
const float C_SWING    = 0.13;
const float MORPH_RATE = 0.012;   // radians per second
const float SPIN_RATE  = 0.01;
const float ZOOM       = 3.0;     // complex-plane units per screen height

// Muted cosine palette (Inigo Quilez).
vec3 palette(float x) {
  return vec3(0.3, 0.28, 0.34) + vec3(0.25, 0.22, 0.2) * cos(6.2832 * (x + vec3(0.0, 0.15, 0.3)));
}

void main() {
  float t = u_time;
  vec2 z = rot(1.5708 + t * SPIN_RATE) * screenUV() * ZOOM; // long axis starts vertical
  float a = C_CENTRE + C_SWING * sin(t * MORPH_RATE);
  vec2 c = C_RADIUS * vec2(cos(a), sin(a));

  vec2 dz = vec2(1.0, 0.0);
  float n = 0.0;
  float m2 = 0.0;
  float trap = 1e3; // closest the orbit comes to the origin: smooth shading inside the set
  for (int i = 0; i < ITERATIONS; i++) {
    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x);
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    m2 = dot(z, z);
    trap = min(trap, m2);
    if (m2 > 256.0) break;
    n += 1.0;
  }

  vec3 col = vec3(0.0);
  if (m2 > 256.0) {
    // Smooth iteration count for colour; distance estimate for a soft glow
    // that stays stable instead of shimmering at fine detail.
    float sn = n - log2(log2(m2)) + 4.0;
    float dist = 0.5 * sqrt(m2 / dot(dz, dz)) * log(m2);
    float edge = exp(-dist * 30.0);
    col = palette(sn * 0.04 + t * 0.004) * (0.12 + 0.5 * edge);
  } else {
    col = palette(0.5 + sqrt(trap) * 0.8 + t * 0.004) * (0.12 + 0.35 * exp(-trap * 6.0));
  }
  gl_FragColor = finish(col);
}
`,
};
