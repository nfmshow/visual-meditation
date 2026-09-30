import { choiceSetting, lengthSetting, singlePhase } from './shared.js';

const SCENES = ['Water', 'Clouds'];

export default {
  id: 'nature',
  name: 'Nature',
  blurb: 'Let your eyes rest on the scene. When your mind wanders, notice it and come back.',
  settings: [choiceSetting('scene', 'Scene', SCENES), lengthSetting(10)],
  plan: singlePhase('Watching'),
  uniforms: ({ scene }) => ({ u_scene: scene }),
  fragment: `
uniform float u_scene;

// Water: rain drops on a still pond at night, seen from above.
const float DROP_DENSITY = 3.0;  // cells per screen height
const float DROP_EVERY   = 7.0;  // mean seconds between drops per cell
const float RING_SPEED   = 0.06;
const float RING_FREQ    = 160.0;
const float RING_WIDTH   = 2500.0; // inverse square width of the wave packet
const float RING_DAMP    = 1.1;
const vec3 WATER_DEEP = vec3(0.01, 0.03, 0.05);
const vec3 WATER_SKY  = vec3(0.1, 0.18, 0.26);
const vec3 MOON       = vec3(0.9, 0.92, 1.0);

vec2 ripples(vec2 p, float t) {
  vec2 grad = vec2(0.0);
  vec2 cell = floor(p * DROP_DENSITY);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 c = cell + vec2(float(i), float(j));
      float period = DROP_EVERY * (0.7 + 0.6 * hash12(c));
      float phase = t / period + hash12(c + 19.1);
      float id = floor(phase);
      float age = fract(phase) * period;
      vec2 centre = (c + vec2(hash12(c + id * 1.3), hash12(c + id * 2.7 + 5.0))) / DROP_DENSITY;
      vec2 d = p - centre;
      float r = length(d) + 1e-4;
      float x = r - age * RING_SPEED;
      float env = exp(-x * x * RING_WIDTH) * exp(-age * RING_DAMP) * smoothstep(0.0, 0.2, age);
      grad += (d / r) * cos(x * RING_FREQ) * env;
    }
  }
  return grad;
}

vec3 water(vec2 p, float t) {
  vec2 swell = vec2(fbm(p * 2.0 + t * 0.03), fbm(p * 2.0 - t * 0.03 + 9.0)) - 0.5;
  vec2 grad = ripples(p, t) * 0.3 + swell * 0.25;
  vec3 n = normalize(vec3(-grad, 1.0));
  // Reflected sky brightens toward the top; the moon sits above the frame.
  float sky = smoothstep(-0.6, 0.6, p.y + n.y * 0.8);
  vec3 col = mix(WATER_DEEP, WATER_SKY, sky * 0.6);
  vec3 toMoon = normalize(vec3(0.0, 0.35, 1.0));
  vec3 view = vec3(0.0, 0.0, 1.0);
  float spec = pow(max(dot(reflect(-view, n), toMoon), 0.0), 60.0);
  col += MOON * spec * 0.35;
  col += MOON * pow(max(dot(reflect(-view, n), toMoon), 0.0), 8.0) * 0.05;
  return col;
}

// Clouds: slow drift across a dusk sky.
const vec3 SKY_HIGH = vec3(0.05, 0.08, 0.2);
const vec3 SKY_LOW  = vec3(0.55, 0.3, 0.3);
const vec3 CLOUD_LIT  = vec3(1.0, 0.72, 0.55);
const vec3 CLOUD_DARK = vec3(0.2, 0.18, 0.28);

vec3 clouds(vec2 p, float t) {
  vec3 sky = mix(SKY_LOW, SKY_HIGH, smoothstep(-0.5, 0.5, p.y));
  vec2 q = p * vec2(1.6, 3.0) + vec2(t * 0.012, 0.0);
  vec2 warp = vec2(fbm(q + t * 0.004), fbm(q + 7.3 - t * 0.004));
  float density = fbm(q + warp * 1.4);
  float cover = smoothstep(0.42, 0.72, density);
  // Lit from below by the set sun.
  float light = smoothstep(0.35, 0.8, fbm(q + warp * 1.4 - vec2(0.0, 0.06)));
  vec3 cloud = mix(CLOUD_LIT, CLOUD_DARK, light) * mix(0.45, 0.9, smoothstep(0.5, -0.5, p.y));
  return mix(sky, cloud, cover * 0.85);
}

void main() {
  vec2 p = screenUV();
  vec3 col = u_scene < 0.5 ? water(p, u_time) : clouds(p, u_time);
  gl_FragColor = finish(col);
}
`,
};
