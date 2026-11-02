export type WarpSettings = {
  speed: number;
  density: number;
  trail: number;
  sound: boolean;
  phrase: string;
};

export type WarpBridge = {
  settings: { current: WarpSettings };
  boost: { current: boolean };
  readout: { current: HTMLElement | null };
  status: { current: HTMLElement | null };
  boostButton: { current: HTMLElement | null };
  stage: { current: HTMLElement | null };
  onSpeedDelta: (delta: number) => void;
};

export type WarpTest = {
  setPointer: (nx: number, ny: number) => void;
  getAim: () => { x: number; y: number };
  getSpeed: () => number;
  setBoost: (v: boolean) => void;
  getFrame: () => number;
  getCount: () => number;
  getFps: () => number;
  getForm: () => number;
};

declare global {
  interface Window {
    __warpTest?: WarpTest;
  }
}

const NEAR = 1.35;
const FAR = 118;
const MAX_STARS = 18000;
const BASE_SLIDER = 0.48;
const STEER_X = 0.55;
const STEER_Y = 0.4;
const FORM_Z = 18;
const GLYPH_SIZE = 360;
const MAX_GLYPH_POINTS = 4200;

const STAR_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aMeta;
layout(location = 2) in vec2 aCorner;

uniform vec3 uVel;
uniform float uTrailTime;
uniform float uRoll;
uniform float uFovX;
uniform float uFovY;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uBoost;
uniform float uNear;
uniform float uFar;
uniform float uMaxPx;
uniform float uForm;

out vec2 vHead;
out vec2 vTail;
out float vRadius;
out float vSeed;
out float vZ;
out float vAlongBright;

vec2 project(vec3 p) {
  float c = cos(uRoll);
  float s = sin(uRoll);
  float x = p.x * c - p.y * s;
  float y = p.x * s + p.y * c;
  float inv = 1.0 / max(p.z, 0.08);
  vec2 ndc = vec2(x * inv * uFovX, y * inv * uFovY);
  return (ndc * 0.5 + 0.5) * uResolution;
}

void main() {
  float seed = aMeta.x;
  float scale = aMeta.y;
  float trailJitter = mix(0.72, 1.22, fract(seed * 9.17));
  vec3 headW = aPos;
  vec3 tailW = aPos - uVel * scale * uTrailTime * trailJitter;
  vec2 head = project(headW);
  vec2 tail = project(tailW);
  vec2 delta = head - tail;
  float len = length(delta);
  vec2 dir = len > 0.5 ? delta / len : vec2(1.0, 0.0);
  if (len > uMaxPx) {
    tail = head - dir * uMaxPx;
    delta = head - tail;
    len = uMaxPx;
  }

  float bright = mix(0.4, 1.0, fract(seed * 13.71));
  bright = mix(bright, 1.55, step(0.986, seed));
  float radius = (0.85 + bright * 1.55) * clamp(15.0 / headW.z, 0.5, 2.35);
  radius *= uDpr;
  radius *= 1.0 + uBoost * 0.22;
  float nearFade = smoothstep(uNear, uNear * 2.4, headW.z);
  radius *= mix(0.65, 1.0, nearFade);
  float spark = fract(seed * 17.0);
  radius = mix(radius, (1.85 + spark * 1.2) * uDpr, uForm);

  float pad = max(radius * 2.2, 1.5);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 along = mix(tail - dir * pad * 0.25, head + dir * pad * 0.45, aCorner.x);
  vec2 pos = along + perp * aCorner.y * pad;
  vec2 ndc = (pos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);

  vHead = head;
  vTail = tail;
  vRadius = radius;
  vSeed = seed;
  vZ = headW.z;
  float farFade = 1.0 - smoothstep(uFar * 0.86, uFar, headW.z);
  vAlongBright = bright * nearFade * farFade;
}
`;

const STAR_FRAG = `#version 300 es
precision highp float;
in vec2 vHead;
in vec2 vTail;
in float vRadius;
in float vSeed;
in float vZ;
in float vAlongBright;
uniform float uBoost;
uniform float uGain;
uniform float uForm;
out vec4 fragColor;

vec3 starColor(float seed) {
  float warm = smoothstep(0.9, 0.99, seed);
  float k = fract(seed * 4.13);
  vec3 cool = vec3(0.74, 0.86, 1.0);
  vec3 white = vec3(0.96, 0.97, 0.99);
  vec3 amber = vec3(1.0, 0.9, 0.8);
  vec3 col = mix(cool, white, smoothstep(0.15, 0.8, k));
  return mix(col, amber, warm * 0.85);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 ab = vHead - vTail;
  float ab2 = dot(ab, ab);
  float t = ab2 > 0.25 ? clamp(dot(p - vTail, ab) / ab2, 0.0, 1.0) : 1.0;
  vec2 closest = vTail + ab * t;
  float d = length(p - closest);
  float reach = mix(1.95, 1.22, uForm);
  if (d > vRadius * reach) discard;

  float core = exp(-(d * d) / max(vRadius * vRadius * mix(0.32, 0.42, uForm), 0.25));
  float halo = smoothstep(vRadius * reach, vRadius * 0.15, d);
  float taper = mix(0.16, 1.0, t * t);
  vec3 col = starColor(vSeed);
  col = mix(col, vec3(0.9, 0.95, 1.0), uBoost * 0.5);
  float intensity = (halo * mix(0.28, 0.08, uForm) + core) * taper * vAlongBright * uGain;
  intensity *= mix(0.82, 1.0, t);
  fragColor = vec4(col * intensity, 1.0);
}
`;

const BG_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aClip;
out vec2 vUv;
void main() {
  gl_Position = vec4(aClip, 0.0, 1.0);
  vUv = aClip * 0.5 + 0.5;
}
`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uRoll;
uniform vec2 uAim;
uniform float uFovX;
uniform float uFovY;
uniform float uAspect;
uniform float uGlow;
uniform float uBoost;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  float n = noise(uv * 2.4 + vec2(uTime * 0.006, 0.2));
  float n2 = noise(uv * 5.0 - vec2(uTime * 0.004, 0.7));
  float dust = n * 0.65 + n2 * 0.35;
  vec3 col = mix(vec3(0.027, 0.031, 0.047), vec3(0.045, 0.055, 0.078), dust * 0.55);
  float bandArg = (uv.y - 0.48 - (uv.x - 0.5) * 0.07) * 6.2;
  float band = exp(-bandArg * bandArg);
  col += vec3(0.035, 0.05, 0.08) * band * (0.35 + dust * 0.4);

  float c = cos(uRoll);
  float s = sin(uRoll);
  float ax = uAim.x * c - uAim.y * s;
  float ay = uAim.x * s + uAim.y * c;
  vec2 vp = vec2(ax * uFovX, ay * uFovY) * 0.5 + 0.5;
  vec2 d = (uv - vp) * vec2(uAspect, 1.0);
  float dist = length(d);
  vec3 glowCol = mix(vec3(0.62, 0.76, 1.0), vec3(0.9, 0.95, 1.0), uBoost);
  col += glowCol * exp(-dist * 8.5) * uGlow;
  col += vec3(0.95, 0.97, 1.0) * exp(-dist * 26.0) * uGlow * 0.85;

  float vig = length((uv - 0.5) * vec2(1.05, 0.92));
  col *= smoothstep(1.05, 0.28, vig);
  col += vec3(0.55, 0.7, 1.0) * uBoost * 0.035;
  fragColor = vec4(col, 1.0);
}
`;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    const pushWord = (word: string) => {
      if (ctx.measureText(word).width <= maxW) {
        line = word;
        return;
      }
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (ctx.measureText(next).width <= maxW) chunk = next;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    };
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width <= maxW) line = trial;
      else {
        if (line) lines.push(line);
        pushWord(word);
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [text];
}

function rasterPhrase(text: string) {
  const shown = text.trim();
  if (!shown) return new Float32Array(0);
  const canvas = document.createElement("canvas");
  canvas.width = GLYPH_SIZE;
  canvas.height = GLYPH_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(0);
  const maxW = GLYPH_SIZE * 0.92;
  const maxH = GLYPH_SIZE * 0.9;
  let lo = 18;
  let hi = 280;
  let best = 72;
  let bestLines = [shown];
  for (let iter = 0; iter < 12; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `600 ${mid}px Outfit, sans-serif`;
    const lines = wrapLines(ctx, shown, maxW);
    const block = lines.length * mid * 1.08;
    const fits = block <= maxH && lines.every((line) => ctx.measureText(line).width <= maxW + 1);
    if (fits) {
      best = mid;
      bestLines = lines;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  ctx.clearRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);
  ctx.font = `600 ${best}px Outfit, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineH = best * 1.08;
  const startY = (GLYPH_SIZE - bestLines.length * lineH) / 2 + lineH / 2;
  for (let i = 0; i < bestLines.length; i++) {
    ctx.fillText(bestLines[i], GLYPH_SIZE / 2, startY + i * lineH);
  }
  const img = ctx.getImageData(0, 0, GLYPH_SIZE, GLYPH_SIZE).data;
  const inkAt = (x: number, y: number) => (img[(y * GLYPH_SIZE + x) * 4 + 3] ?? 0) > 130;
  let step = best < 56 ? 1 : 2;
  let raw: number[] = [];
  let minX = GLYPH_SIZE;
  let minY = GLYPH_SIZE;
  let maxX = 0;
  let maxY = 0;
  const collect = (grid: number) => {
    raw = [];
    minX = GLYPH_SIZE;
    minY = GLYPH_SIZE;
    maxX = 0;
    maxY = 0;
    for (let y = 0; y < GLYPH_SIZE; y += grid) {
      for (let x = 0; x < GLYPH_SIZE; x += grid) {
        if (!inkAt(x, y)) continue;
        raw.push(x, y);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  };
  collect(step);
  while (raw.length / 2 > MAX_GLYPH_POINTS && step < 8) {
    step += 1;
    collect(step);
  }
  const count = raw.length / 2;
  if (count < 1) return new Float32Array(0);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pts = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = raw[i * 2] ?? cx;
    const y = raw[i * 2 + 1] ?? cy;
    pts[i * 2] = ((x - cx) / span) * 2;
    pts[i * 2 + 1] = -((y - cy) / span) * 2;
  }
  return pts;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, [contenteditable='true']");
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number) {
  return clamp(v, 0, 1);
}

export function worldSpeed(slider: number, boostAmt: number) {
  const base = 7 * Math.pow(15, clamp01(slider));
  return base * (1 + boostAmt * 2.55);
}

export function targetStarCount(density: number, compact: boolean) {
  const max = compact ? 9000 : 16000;
  const min = compact ? 480 : 700;
  return Math.round(min + clamp01(density) * (max - min));
}

function cruiseReference() {
  return worldSpeed(BASE_SLIDER, 0);
}

type AudioHum = {
  start: () => void;
  update: (speedNorm: number, boost: number, muted: boolean) => void;
  suspend: () => void;
  stop: () => void;
};

function createHum(): AudioHum {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let osc: OscillatorNode | null = null;
  let oscGain: GainNode | null = null;
  let started = false;

  function start() {
    if (started) {
      if (ctx && ctx.state === "suspended") void ctx.resume();
      return;
    }
    const AC = window.AudioContext;
    ctx = new AC();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    filter.Q.value = 0.55;
    master = ctx.createGain();
    master.gain.value = 0;
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 48;
    oscGain = ctx.createGain();
    oscGain.gain.value = 0;
    src.connect(filter);
    filter.connect(master);
    osc.connect(oscGain);
    oscGain.connect(master);
    master.connect(ctx.destination);
    src.start();
    osc.start();
    started = true;
  }

  function update(speedNorm: number, boost: number, muted: boolean) {
    if (!started || !ctx || !master || !filter || !osc || !oscGain) return;
    const t = ctx.currentTime;
    const gain = muted ? 0 : 0.01 + speedNorm * 0.028 + boost * 0.036;
    master.gain.setTargetAtTime(gain, t, 0.08);
    filter.frequency.setTargetAtTime(150 + speedNorm * 420 + boost * 780, t, 0.12);
    osc.frequency.setTargetAtTime(42 + boost * 38 + speedNorm * 10, t, 0.12);
    oscGain.gain.setTargetAtTime(muted ? 0 : 0.008 + boost * 0.02, t, 0.1);
  }

  function suspend() {
    if (ctx && ctx.state === "running") void ctx.suspend();
  }

  function stop() {
    if (!ctx) return;
    void ctx.close();
    ctx = null;
    started = false;
  }

  return { start, update, suspend, stop };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("No se pudo crear el shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "shader";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("No se pudo crear el programa");
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "link";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

export function createWarpEngine(canvas: HTMLCanvasElement, bridge: WarpBridge) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    desynchronized: true,
  });
  if (!context) {
    throw new Error("WebGL2 no está disponible en este navegador");
  }
  const gl: WebGL2RenderingContext = context;

  const starProg = link(gl, STAR_VERT, STAR_FRAG);
  const bgProg = link(gl, BG_VERT, BG_FRAG);

  const starLoc = {
    vel: gl.getUniformLocation(starProg, "uVel"),
    trail: gl.getUniformLocation(starProg, "uTrailTime"),
    roll: gl.getUniformLocation(starProg, "uRoll"),
    fovX: gl.getUniformLocation(starProg, "uFovX"),
    fovY: gl.getUniformLocation(starProg, "uFovY"),
    res: gl.getUniformLocation(starProg, "uResolution"),
    dpr: gl.getUniformLocation(starProg, "uDpr"),
    boost: gl.getUniformLocation(starProg, "uBoost"),
    near: gl.getUniformLocation(starProg, "uNear"),
    far: gl.getUniformLocation(starProg, "uFar"),
    maxPx: gl.getUniformLocation(starProg, "uMaxPx"),
    gain: gl.getUniformLocation(starProg, "uGain"),
    form: gl.getUniformLocation(starProg, "uForm"),
  };
  const bgLoc = {
    time: gl.getUniformLocation(bgProg, "uTime"),
    roll: gl.getUniformLocation(bgProg, "uRoll"),
    aim: gl.getUniformLocation(bgProg, "uAim"),
    fovX: gl.getUniformLocation(bgProg, "uFovX"),
    fovY: gl.getUniformLocation(bgProg, "uFovY"),
    aspect: gl.getUniformLocation(bgProg, "uAspect"),
    glow: gl.getUniformLocation(bgProg, "uGlow"),
    boost: gl.getUniformLocation(bgProg, "uBoost"),
  };

  const pos = new Float32Array(MAX_STARS * 3);
  const meta = new Float32Array(MAX_STARS * 2);
  for (let i = 0; i < MAX_STARS; i++) {
    meta[i * 2] = Math.random();
    meta[i * 2 + 1] = 0.78 + Math.random() * 0.48;
  }

  const posBuf = gl.createBuffer();
  const metaBuf = gl.createBuffer();
  const cornerBuf = gl.createBuffer();
  const starVao = gl.createVertexArray();
  if (!posBuf || !metaBuf || !cornerBuf || !starVao) throw new Error("WebGL buffer");

  gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(2, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
  gl.bufferData(gl.ARRAY_BUFFER, meta, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);

  const bgVao = gl.createVertexArray();
  const bgBuf = gl.createBuffer();
  if (!bgVao || !bgBuf) throw new Error("WebGL buffer");
  gl.bindVertexArray(bgVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactQuery = window.matchMedia("(max-width: 800px), (pointer: coarse)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let reduceMotion = motionQuery.matches;

  let aimX = 0;
  let aimY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;
  let keyBoost = false;
  let pointerBoost = false;
  let testBoost = false;
  const keys = new Set<string>();

  let currentSpeed = worldSpeed(bridge.settings.current.speed, 0);
  let boostAmt = 0;
  let fov = (64 * Math.PI) / 180;
  let drawCount = 0;
  let quality = 1;
  let badFrames = 0;
  let elapsed = 0;
  let frame = 0;
  let fps = 60;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let running = true;
  let raf = 0;
  let dpr = 1;
  let viewW = 1;
  let viewH = 1;
  let audioOn = false;
  let formAmt = 0;
  let phraseCache = "\u0000";
  let glyph = new Float32Array(0);
  const hum = createHum();

  void document.fonts?.ready.then(() => {
    phraseCache = "\u0000";
  });

  function place(i: number, z: number, ax: number, ay: number, tanHalf: number, aspect: number) {
    const i3 = i * 3;
    const hw = z * tanHalf * aspect;
    const hh = z * tanHalf;
    pos[i3] = ax * z + (Math.random() * 2 - 1) * hw * 0.98;
    pos[i3 + 1] = ay * z + (Math.random() * 2 - 1) * hh * 0.98;
    pos[i3 + 2] = z;
  }

  function fillAll(ax: number, ay: number, tanHalf: number, aspect: number) {
    for (let i = 0; i < MAX_STARS; i++) {
      const u = Math.pow(Math.random(), 0.72);
      const z = NEAR + (FAR - NEAR) * u;
      place(i, z, ax, ay, tanHalf, aspect);
    }
  }

  const bootTan = Math.tan((64 * Math.PI) / 180 / 2);
  fillAll(0, 0, bootTan, 16 / 9);

  function resize() {
    viewW = Math.max(1, canvas.clientWidth);
    viewH = Math.max(1, canvas.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, compactQuery.matches ? 1.25 : 1.5);
    const bw = Math.max(1, Math.round(viewW * dpr));
    const bh = Math.max(1, Math.round(viewH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function stageSlot() {
    const stage = bridge.stage.current;
    const cr = canvas.getBoundingClientRect();
    if (!stage || cr.width < 2 || cr.height < 2) {
      return { cx: 0, cy: 0.08, hx: 0.34, hy: 0.34 };
    }
    const sr = stage.getBoundingClientRect();
    if (sr.width < 2 || sr.height < 2) return { cx: 0, cy: 0.08, hx: 0.34, hy: 0.34 };
    const cx = ((sr.left + sr.width / 2 - cr.left) / cr.width) * 2 - 1;
    const cy = 1 - ((sr.top + sr.height / 2 - cr.top) / cr.height) * 2;
    return {
      cx,
      cy,
      hx: sr.width / cr.width,
      hy: sr.height / cr.height,
    };
  }

  function pointerToAim(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const ny = -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
    const curve = (v: number) => Math.sign(v) * Math.pow(Math.min(Math.abs(v), 1), 0.88);
    pointerX = clamp(curve(nx), -1, 1) * 0.94;
    pointerY = clamp(curve(ny), -1, 1) * 0.94;
    pointerSeen = true;
  }

  function onPointerMove(e: PointerEvent) {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-ui]")) return;
    pointerToAim(e.clientX, e.clientY);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-ui]")) return;
    pointerToAim(e.clientX, e.clientY);
    hum.start();
    audioOn = true;
    if (!finePointer) return;
    pointerBoost = true;
  }

  function onPointerUp() {
    pointerBoost = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e.target)) return;
    if (e.code === "Space") {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[role='slider']")) return;
      e.preventDefault();
      keyBoost = true;
      hum.start();
      audioOn = true;
    }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "ArrowUp" || e.code === "ArrowDown") {
      e.preventDefault();
      keys.add(e.code);
      pointerSeen = true;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === "Space") keyBoost = false;
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    keyBoost = false;
    pointerBoost = false;
  }

  function onWheel(e: WheelEvent) {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-ui]")) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewH : 1;
    const delta = clamp(-e.deltaY * scale * 0.00055, -0.07, 0.07);
    bridge.onSpeedDelta(delta);
  }

  function onVis() {
    if (document.hidden) hum.suspend();
    else if (audioOn && bridge.settings.current.sound) hum.start();
  }

  function onMotionChange() {
    reduceMotion = motionQuery.matches;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("visibilitychange", onVis);
  motionQuery.addEventListener("change", onMotionChange);
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  resize();

  window.__warpTest = {
    setPointer(nx: number, ny: number) {
      pointerSeen = true;
      pointerX = clamp(nx, -1, 1);
      pointerY = clamp(ny, -1, 1);
      keys.clear();
    },
    getAim: () => ({ x: aimX, y: aimY }),
    getSpeed: () => currentSpeed,
    setBoost: (v: boolean) => {
      testBoost = v;
    },
    getFrame: () => frame,
    getCount: () => drawCount,
    getFps: () => fps,
    getForm: () => formAmt,
  };

  let last = performance.now();

  function tick(now: number) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (!(dt > 0)) dt = 0.001;

    const settings = bridge.settings.current;
    const phrase = settings.phrase ?? "";
    if (phrase !== phraseCache) {
      phraseCache = phrase;
      glyph = rasterPhrase(phrase);
    }
    const wantForm = glyph.length >= 2;
    formAmt += ((wantForm ? 1 : 0) - formAmt) * (1 - Math.exp(-7.5 * dt));

    const keyX = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
    const keyY = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
    const usingKeys = keyX !== 0 || keyY !== 0;
    let targetX = pointerSeen ? pointerX : Math.sin(now * 0.00013) * (reduceMotion ? 0 : 0.16);
    let targetY = pointerSeen ? pointerY : Math.cos(now * 0.0001) * (reduceMotion ? 0 : 0.07);
    if (usingKeys) {
      targetX = keyX * 0.78;
      targetY = keyY * 0.56;
    }
    targetX *= 1 - formAmt;
    targetY *= 1 - formAmt;

    const aimK = 1 - Math.exp(-7.2 * dt);
    aimX += (targetX - aimX) * aimK;
    aimY += (targetY - aimY) * aimK;

    const wantBoost = (bridge.boost.current || keyBoost || pointerBoost || testBoost) && formAmt < 0.35;
    const boostK = 1 - Math.exp((wantBoost ? -6.5 : -3.4) * dt);
    boostAmt += ((wantBoost ? 1 : 0) - boostAmt) * boostK;

    const speedTarget = worldSpeed(settings.speed, reduceMotion ? boostAmt * 0.45 : boostAmt);
    const speedK = 1 - Math.exp(-2.6 * dt);
    currentSpeed += (speedTarget - currentSpeed) * speedK;

    const fovTarget =
      ((reduceMotion ? 60 : 63) + settings.speed * 5 * (1 - formAmt) + (reduceMotion ? 0 : boostAmt * 11)) *
      (Math.PI / 180);
    fov += (fovTarget - fov) * (1 - Math.exp(-4 * dt));

    const aspect = viewW / Math.max(viewH, 1);
    const tanHalf = Math.tan(fov * 0.5);
    const fovY = 1 / Math.max(tanHalf, 0.2);
    const fovX = fovY / Math.max(aspect, 0.2);
    const ax = aimX * STEER_X;
    const ay = aimY * STEER_Y;
    const invLen = 1 / Math.hypot(ax, ay, 1);
    const vx = -ax * invLen * currentSpeed;
    const vy = -ay * invLen * currentSpeed;
    const vz = -invLen * currentSpeed;
    const slot = stageSlot();
    const glyphCount = glyph.length / 2;

    const compact = compactQuery.matches;
    const wanted = targetStarCount(settings.density, compact);
    elapsed += dt;
    if (elapsed > 1.1) {
      if (dt > 0.0205) badFrames = Math.min(40, badFrames + 1);
      else badFrames = Math.max(0, badFrames - 1);
      if (badFrames > 10 && quality > 0.55) quality = Math.max(0.55, quality - dt * 0.2);
      else if (badFrames < 3 && quality < 1) quality = Math.min(1, quality + dt * 0.45);
    }
    const nextCount = Math.max(360, Math.min(MAX_STARS, Math.floor(wanted * quality)));
    if (drawCount === 0) {
      drawCount = nextCount;
    } else if (nextCount > drawCount) {
      for (let i = drawCount; i < nextCount; i++) {
        place(i, FAR * (0.9 + Math.random() * 0.1), ax, ay, tanHalf, aspect);
      }
      drawCount = nextCount;
    } else {
      drawCount = nextCount;
    }

    const warp = (1 - formAmt) * (1 - formAmt);
    const pullK = 1 - Math.exp((reduceMotion ? -10 : -16) * dt);
    const used = glyphCount > 0 ? Math.min(drawCount, glyphCount) : 0;
    for (let i = 0; i < drawCount; i++) {
      const i3 = i * 3;
      const scale = meta[i * 2 + 1] ?? 1;
      let x = pos[i3] ?? 0;
      let y = pos[i3 + 1] ?? 0;
      let z = pos[i3 + 2] ?? FORM_Z;
      if (formAmt > 0.08 && glyphCount > 0 && i >= used) {
        x = 0;
        y = 0;
        z = FAR;
      } else {
        if (warp > 0.004) {
          x += vx * scale * dt * warp;
          y += vy * scale * dt * warp;
          z += vz * scale * dt * warp;
          if (z < NEAR) {
            if (formAmt < 0.2) {
              place(i, FAR * (0.93 + Math.random() * 0.07), ax, ay, tanHalf, aspect);
              continue;
            }
            z = NEAR + 0.2;
          }
        }
        if (formAmt > 0.001 && i < used) {
          const gi = Math.min(glyphCount - 1, Math.floor(((i + 0.5) * glyphCount) / used));
          const nx = glyph[gi * 2] ?? 0;
          const ny = glyph[gi * 2 + 1] ?? 0;
          const ndcX = slot.cx + nx * slot.hx * 0.9;
          const ndcY = slot.cy + ny * slot.hy * 0.9;
          const gx = (ndcX * FORM_Z) / fovX;
          const gy = (ndcY * FORM_Z) / fovY;
          const k = pullK * Math.min(1, 0.35 + formAmt);
          x += (gx - x) * k;
          y += (gy - y) * k;
          z += (FORM_Z - z) * k;
        }
      }
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
    }

    const speedNorm = clamp(currentSpeed / 150, 0, 1);
    if (audioOn) hum.update(speedNorm, boostAmt, !settings.sound);

    const trailBase = reduceMotion ? 0.008 : 0.014;
    const trailScale = 1 - formAmt * 0.94;
    const trail =
      (trailBase + settings.trail * (reduceMotion ? 0.02 : 0.05) + boostAmt * (reduceMotion ? 0.008 : 0.028)) *
      trailScale;
    const maxPx = (70 + settings.trail * 180 + boostAmt * 150) * dpr * Math.max(0.08, trailScale);
    const gain =
      (0.92 - settings.density * 0.25) * (1 + boostAmt * 0.18) * (1 - formAmt * 0.12);
    const roll = (reduceMotion ? 0 : -aimX * 0.055) * (1 - formAmt);
    const glow = (0.04 + speedNorm * 0.07 + boostAmt * 0.15) * (1 - formAmt * 0.94);
    const glowAx = ax * (1 - formAmt) + (slot.cx / fovX) * formAmt;
    const glowAy = ay * (1 - formAmt) + (slot.cy / fovY) * formAmt;
    const drawVel = 1 - formAmt;

    const bw = canvas.width;
    const bh = canvas.height;
    gl.viewport(0, 0, bw, bh);
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(bgLoc.time, now * 0.001);
    gl.uniform1f(bgLoc.roll, roll);
    gl.uniform2f(bgLoc.aim, glowAx, glowAy);
    gl.uniform1f(bgLoc.fovX, fovX);
    gl.uniform1f(bgLoc.fovY, fovY);
    gl.uniform1f(bgLoc.aspect, aspect);
    gl.uniform1f(bgLoc.glow, glow);
    gl.uniform1f(bgLoc.boost, boostAmt * (1 - formAmt));
    gl.bindVertexArray(bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(starProg);
    gl.uniform3f(starLoc.vel, vx * drawVel, vy * drawVel, vz * drawVel);
    gl.uniform1f(starLoc.trail, trail);
    gl.uniform1f(starLoc.roll, roll);
    gl.uniform1f(starLoc.fovX, fovX);
    gl.uniform1f(starLoc.fovY, fovY);
    gl.uniform2f(starLoc.res, bw, bh);
    gl.uniform1f(starLoc.dpr, dpr);
    gl.uniform1f(starLoc.boost, boostAmt * (1 - formAmt));
    gl.uniform1f(starLoc.near, NEAR);
    gl.uniform1f(starLoc.far, FAR);
    gl.uniform1f(starLoc.maxPx, maxPx);
    gl.uniform1f(starLoc.gain, gain);
    gl.uniform1f(starLoc.form, formAmt);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos, 0, drawCount * 3);
    gl.bindVertexArray(starVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, drawCount);
    gl.bindVertexArray(null);

    frame += 1;
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.35) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      const readout = bridge.readout.current;
      if (readout) {
        const mult = currentSpeed / cruiseReference();
        readout.textContent = `×${mult.toFixed(1)}`;
      }
      const status = bridge.status.current;
      if (status) {
        status.textContent =
          formAmt > 0.45
            ? "texto"
            : boostAmt > 0.45
              ? "impulso"
              : currentSpeed > worldSpeed(0.28, 0)
                ? "crucero"
                : "deriva";
      }
      const btn = bridge.boostButton.current;
      if (btn) {
        const hot = boostAmt > 0.22;
        btn.dataset.hot = hot ? "1" : "0";
        btn.setAttribute("aria-pressed", hot ? "true" : "false");
      }
    }

    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVis);
      motionQuery.removeEventListener("change", onMotionChange);
      resizeObserver.disconnect();
      hum.stop();
      if (window.__warpTest) delete window.__warpTest;
      gl.deleteProgram(starProg);
      gl.deleteProgram(bgProg);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(metaBuf);
      gl.deleteBuffer(cornerBuf);
      gl.deleteBuffer(bgBuf);
      gl.deleteVertexArray(starVao);
      gl.deleteVertexArray(bgVao);
    },
  };
}
