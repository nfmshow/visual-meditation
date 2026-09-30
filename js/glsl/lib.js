// GLSL helpers prepended to every mode's fragment shader.
export const GLSL_LIB = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 0..1
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v / 0.9375;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Screen-height units, origin at the centre.
vec2 screenUV() {
  return (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
}

// Breaks up 8-bit banding in slow dark gradients.
vec4 dither(vec3 col) {
  return vec4(col + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}

// Filmic tone map, then dither.
vec4 finish(vec3 col) {
  return dither(clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0));
}
`;
