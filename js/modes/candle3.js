import { rounds, CANDLE_SCENE } from './flame.js';
import { choiceSetting } from './shared.js';
import { createVideoSource } from '../video.js';

const ID = 'candle3';

// How much of the video's width spans the screen. Smaller is closer.
const FRAMING = [{ name: 'Whole', span: 1 }, { name: 'Close', span: 0.55 }, { name: 'Closer', span: 0.35 }];

const video = createVideoSource(ID);

// Trataka with a filmed candle: a video picked from the phone, a different stretch each session.
export default {
  id: ID,
  name: 'Candle V3',
  blurb: `A filmed candle from a video on your phone. Choose it once and it stays on the phone. Each session plays a different stretch of it. ${rounds.blurb}`,
  settings: [...rounds.settings, choiceSetting('framing', 'Framing', FRAMING.map((f) => f.name), 1)],
  plan: rounds.plan,
  video,
  uniforms: ({ framing }) => ({
    u_video: video.element,
    u_videoSize: video.size(),
    u_fade: video.fade(),
    u_span: FRAMING[framing].span,
  }),
  // The drawn candle stands in until a video is chosen.
  fragment: `
uniform sampler2D u_video;
uniform vec2 u_videoSize; // pixels; zero while none is chosen
uniform float u_fade;
uniform float u_span;

const float EDGE = 0.12; // video heights over which its edges fade to black

${CANDLE_SCENE}
void main() {
  vec2 p = screenUV();
  if (u_videoSize.y < 1.0) {
    gl_FragColor = finish(candleScene(p, u_time, vec4(0.0)));
    return;
  }
  // Fit the centre u_span of the video, in both directions, on the screen.
  float aspect = u_videoSize.x / u_videoSize.y;
  float h = min(u_resolution.x / u_resolution.y / (aspect * u_span), 1.0 / u_span);
  vec2 uv = p / vec2(h * aspect, h) + 0.5;
  vec2 edge = min(uv, 1.0 - uv) * vec2(aspect, 1.0);
  float k = smoothstep(0.0, EDGE, min(edge.x, edge.y)) * u_fade;
  gl_FragColor = dither(texture2D(u_video, clamp(uv, 0.0, 1.0)).rgb * k);
}
`,
};
