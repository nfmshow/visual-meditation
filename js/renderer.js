import { RENDER } from './config.js';
import { GLSL_LIB } from './glsl/lib.js';

// Prepended to every mode's fragment shader.
const HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
${GLSL_LIB}
`;

const VERTEX = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, powerPreference: 'low-power',
  });
  if (!gl) throw new Error('WebGL is not available on this device.');

  // One triangle covering the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const programs = new Map();
  let t0 = performance.now();
  let current = null;
  let values = {};
  let raf = 0;

  const clock = (now = performance.now()) => Math.max(0, (now - t0) / 1000);

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function link(mode) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HEADER + mode.fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return { mode, program, aPos: gl.getAttribLocation(program, 'a_pos'), locations: new Map() };
  }

  function setUniform(name, v) {
    if (!current.locations.has(name)) current.locations.set(name, gl.getUniformLocation(current.program, name));
    const loc = current.locations.get(name);
    if (loc === null) return;
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else gl[`uniform${v.length}fv`](loc, v);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    resize();
    const t = clock(now);
    setUniform('u_resolution', [canvas.width, canvas.height]);
    setUniform('u_time', t);
    const extra = current.mode.uniforms?.(values, t) ?? {};
    for (const name in extra) setUniform(name, extra[name]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    // Also call when the mode's settings change.
    setMode(mode, modeValues) {
      if (!programs.has(mode.id)) programs.set(mode.id, link(mode));
      current = programs.get(mode.id);
      values = modeValues;
      gl.useProgram(current.program);
      gl.enableVertexAttribArray(current.aPos);
      gl.vertexAttribPointer(current.aPos, 2, gl.FLOAT, false, 0, 0);
    },
    // u_time restarts at 0, so a session's visuals and sound share one clock.
    resetClock() {
      t0 = performance.now();
    },
    // Seconds on the clock u_time reads.
    time: () => clock(),
    start() {
      if (!raf) raf = requestAnimationFrame(draw);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
