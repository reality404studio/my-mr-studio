// WebGL2 Renderer for Bookmark Sea-Snake (Quest 3S 72fps budget: 4 draw calls, <0.5ms GPU).
//   Pass 1: Hybrid 3D Tapered Capsule & Palm Depth Pre-pass (colorMask off, depthMask on)
//   Pass 2A: Iridescent Virtual Bookmark Tab
//   Pass 2B: 30cm x 3cm Text & Masking-Tape Ribbon with SplatGlint water-shimmer (from vfx-studio/renderer.js L77-L90)
//            + analytical finger-capsule soft feathering & contact AO
//   Pass 3: Floating 윤슬 micro-glint splats

import {
  createUnitCapsuleGeometry,
  MASK_INSTANCE_STRIDE,
  MAX_MASK_INSTANCES,
  MAX_SHADER_CAPSULES,
} from './hand-mask.js?v=bs-1';
import {
  MAX_GLINTS,
  NODE_COUNT,
  PHASE,
  RIBBON_VERT_STRIDE,
} from './snake.js?v=bs-1';

export const identity = () =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const c4 = c * 4;
    const b0 = b[c4];
    const b1 = b[c4 + 1];
    const b2 = b[c4 + 2];
    const b3 = b[c4 + 3];
    out[c4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(out, eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

// ---------- SHADERS ----------

// Pass 1: Instanced 3D Tapered Capsule & Palm Depth Mask (Early-Z friendly, zero Z-fighting)
const HAND_MASK_VERT = `#version 300 es
layout(location=0) in vec4 aVert;     // xyz: unit sphere dir, w: endFlag (0=a, 1=b)
layout(location=1) in vec4 iEndA;     // xyz: point a, w: radius a
layout(location=2) in vec4 iEndB;     // xyz: point b, w: radius b
layout(location=3) in vec2 iMeta;     // x: flattenY, y: handIndex

uniform mat4 uView;
uniform mat4 uProj;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
  vec3 a = iEndA.xyz;
  vec3 b = iEndB.xyz;
  vec3 diff = b - a;
  float segLen = length(diff);
  vec3 axis = segLen > 1e-5 ? diff / segLen : vec3(0.0, 1.0, 0.0);
  vec3 refUp = abs(axis.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 side = normalize(cross(refUp, axis));
  vec3 ortho = cross(axis, side);

  vec3 localDir = aVert.xyz;
  float endFlag = aVert.w;
  float r = mix(iEndA.w, iEndB.w, endFlag);
  vec3 center = mix(a, b, endFlag);

  vec3 offset = (side * localDir.x + axis * localDir.y + ortho * (localDir.z * iMeta.x)) * r;
  vec3 world = center + offset;

  vWorldPos = world;
  vNormal = normalize(side * localDir.x + axis * localDir.y + ortho * (localDir.z / max(0.35, iMeta.x)));
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const HAND_MASK_FRAG = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
uniform vec3 uEyePos;
uniform float uVisualAlpha; // 0 in Quest AR passthrough (colorMask=false), ~0.28 in desktop preview
out vec4 outColor;

void main() {
  if (uVisualAlpha <= 0.001) {
    outColor = vec4(0.0);
    return;
  }
  vec3 V = normalize(uEyePos - vWorldPos);
  vec3 N = normalize(vNormal);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.2);
  vec3 skinBase = vec3(0.76, 0.68, 0.63);
  vec3 col = mix(skinBase * (0.45 + 0.55 * ndv), vec3(0.88, 0.94, 0.98), rim * 0.45);
  float a = clamp(uVisualAlpha + rim * 0.28, 0.0, 0.72);
  outColor = vec4(col * a, a);
}`;

// Pass 2A: Iridescent Virtual Bookmark Tab + optional Desktop Book Stand
const BOOKMARK_VERT = `#version 300 es
layout(location=0) in vec2 aCorner; // [-1,1] x [-1,1]
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uHalfSize;
out vec2 vUv;
out vec3 vWorldPos;
out vec3 vNormal;
void main() {
  vec3 world = uPos + uRight * (aCorner.x * uHalfSize.x) + uUp * (aCorner.y * uHalfSize.y);
  vWorldPos = world;
  vNormal = normalize(cross(uRight, uUp));
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const BOOKMARK_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vNormal;
uniform sampler2D uNoise;
uniform vec3 uEyePos;
uniform highp float uTime;
uniform float uHover;
uniform float uPulse;
uniform float uAnchored;
uniform float uPassthrough;
uniform vec3 uCoreTint;
uniform vec3 uRimTint;
out vec4 outColor;

void main() {
  // Elegant bookmark ribbon silhouette with subtle V-notch at the bottom tail
  float notch = (1.0 - vUv.y) * 0.24;
  float cx = abs(vUv.x - 0.5) * 2.0;
  if (vUv.y < 0.22 && (0.22 - vUv.y) > cx * 0.22) discard;

  // Rounded top corners
  vec2 topCorner = max(vec2(0.0), vec2(cx - 0.76, vUv.y - 0.88));
  if (length(topCorner * vec2(1.0, 2.0)) > 0.24) discard;

  vec3 V = normalize(uEyePos - vWorldPos);
  vec3 N = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
  float ndv = abs(dot(N, V));
  float fresnel = pow(1.0 - ndv, 2.0);

  vec4 n1 = texture(uNoise, vUv * vec2(1.8, 2.6) + vec2(0.0, -uTime * 0.14));
  vec4 n2 = texture(uNoise, vUv * vec2(3.6, 5.2) + vec2(uTime * 0.09, -uTime * 0.22));
  float facet = pow(max(0.0, sin(vUv.y * 34.0 + uTime * 3.8 + n1.r * 6.28 + ndv * 3.5)), 16.0);
  float glint = facet * (0.85 + uHover * 0.9 + uPulse * 1.3);

  float border = smoothstep(0.78, 0.96, max(cx, abs(vUv.y - 0.5) * 2.0));
  float thread = exp(-120.0 * pow(vUv.x - 0.5, 2.0)) * smoothstep(0.18, 0.35, vUv.y) * 0.55;

  vec3 base = mix(uRimTint * 0.55, uCoreTint, 0.45 + 0.35 * n1.b);
  vec3 col = base * (0.82 + 0.35 * uHover + 0.55 * uPulse)
    + mix(uCoreTint, vec3(1.0, 0.98, 0.94), 0.7) * (border * 0.75 + fresnel * 0.65 + thread)
    + vec3(1.0, 0.98, 0.94) * glint * 1.45;

  float baseAlpha = mix(0.62, 0.82, uAnchored) + border * 0.22 + uHover * 0.12 + glint * 0.2;
  float a = clamp(baseAlpha, 0.0, 0.96);
  float alphaShare = mix(0.85, 0.52, uPassthrough);
  outColor = vec4(col * a, a * alphaShare);
}`;

// Pass 2B: 30cm x 3cm Masking-Tape & PearSans Text Ribbon with 윤슬 SplatGlint + Hybrid Soft Finger Occlusion
const RIBBON_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec2 aMeta; // x: edgeFade, y: tension

uniform mat4 uView;
uniform mat4 uProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;
out vec2 vMeta;
out float vEyeSafe;

void main() {
  vWorldPos = aPos;
  vNormal = aNormal;
  vUv = aUv;
  vMeta = aMeta;
  vec4 vp = uView * vec4(aPos, 1.0);
  vEyeSafe = clamp((-vp.z - 0.065) / 0.08, 0.0, 1.0);
  gl_Position = uProj * vp;
}`;

const RIBBON_FRAG = `#version 300 es
precision mediump float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;
in vec2 vMeta;
in float vEyeSafe;

uniform sampler2D uTextAtlas; // R: crisp PearSans glyph, G: halo+thread, B: washi fiber, A: tape silhouette
uniform sampler2D uNoise;     // 256x256 procedural noise (same layout as vfx-studio/renderer.js)
uniform vec3 uEyePos;
uniform highp float uTime;
uniform float uTapeOpacity;   // 0..1 toggle for translucent masking-tape backing
uniform float uPassthrough;   // 0 desktop, 1 Quest AR passthrough
uniform float uDetachFlash;
uniform vec3 uCoreTint;
uniform vec3 uRimTint;

// Hybrid Soft Occlusion: bilateral finger bone capsules (Pass 1 already wrote exact 3D depth)
uniform int uFingerCount;
uniform vec4 uFingerA[${MAX_SHADER_CAPSULES}]; // xyz: endpoint A, w: radius A
uniform vec4 uFingerB[${MAX_SHADER_CAPSULES}]; // xyz: endpoint B, w: radius B

out vec4 outColor;

// Shortest signed distance to nearest finger capsule + eye-occlusion grazing weight
void evalFingerProximity(vec3 p, vec3 eye, out float minSurfDist, out float backBias) {
  minSurfDist = 1.0;
  backBias = 0.0;
  vec3 toP = p - eye;
  float eyeDist = length(toP);
  for (int i = 0; i < ${MAX_SHADER_CAPSULES}; i++) {
    if (i >= uFingerCount) break;
    vec3 a = uFingerA[i].xyz;
    vec3 b = uFingerB[i].xyz;
    vec3 ab = b - a;
    float denom = max(dot(ab, ab), 1e-7);
    float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
    vec3 c = a + ab * t;
    float r = mix(uFingerA[i].w, uFingerB[i].w, t);
    float d = length(p - c) - r;
    if (d < minSurfDist) {
      minSurfDist = d;
      float fingerEyeDist = length(c - eye);
      // 1.0 when ribbon fragment is behind/beside finger center relative to viewer eye
      backBias = smoothstep(-0.004, 0.008, eyeDist - fingerEyeDist);
    }
  }
}

void main() {
  if (vEyeSafe <= 0.003) discard;

  vec4 atlas = texture(uTextAtlas, vUv);
  float glyphMask = atlas.r;
  float haloThread = atlas.g;
  float washiFiber = atlas.b;
  float tapeSil = atlas.a;

  // --- 윤슬 (Sunlit Water Shimmer) adapted directly from prototype/splat-vfx-studio renderer.js L77-L90 ---
  vec3 V = normalize(uEyePos - vWorldPos);
  vec3 N = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
  float ndv = abs(dot(N, V));
  float fresnel = pow(1.0 - ndv, 2.0);

  // Dual scrolling noise octaves (vfx-studio/renderer.js L74-L75 adapted to 10:1 ribbon UV aspect)
  vec2 uv1 = vec2(vUv.x * 7.2, vUv.y * 1.15) + vec2(-uTime * 0.14, uTime * 0.06);
  vec2 uv2 = vec2(vUv.x * 14.5, vUv.y * 2.3) + vec2(uTime * 0.09, -uTime * 0.22);
  vec4 n1 = texture(uNoise, uv1);
  vec4 n2 = texture(uNoise, uv2);

  // Organic tooth & rimBand (renderer.js L81-L83)
  float tooth = mix(0.62, 1.0, smoothstep(0.16, 0.78, n1.g * 0.6 + n2.b * 0.4));
  float vEdge = abs(vUv.y - 0.5) * 2.0;
  float rimBand = exp(-28.0 * pow(vEdge - 0.86, 2.0)) * 0.42;

  // Multi-layer microfacet SplatGlint (renderer.js L85-L86) + grazing angle water-wave glint
  float wavePhase = vUv.x * 96.0 + vUv.y * 11.0 + ndv * 5.2;
  float facetA = pow(max(0.0, sin(wavePhase + uTime * 3.8 + n1.r * 6.28)), 14.0);
  float facetB = pow(max(0.0, sin(vUv.x * 168.0 - vUv.y * 19.0 - uTime * 5.1 + n2.a * 6.28 - ndv * 6.4)), 18.0);
  float facetC = pow(max(0.0, sin(vUv.x * 260.0 + uTime * 7.2 + n1.b * 6.28 + n2.r * 3.14)), 24.0);
  float causticWave = 0.5 + 0.5 * sin(vUv.x * 28.0 - uTime * 2.9 + n1.g * 4.2);
  float glintAmt = (facetA * 1.35 + facetB * 1.75 + facetC * 2.25) * (0.85 + 1.05 * fresnel + uDetachFlash * 0.9);

  // Hybrid finger-proximity soft feather + contact AO + grazing rim glint
  float fingerDist;
  float backBias;
  evalFingerProximity(vWorldPos, uEyePos, fingerDist, backBias);
  float nearFinger = 1.0 - smoothstep(0.0, 0.011, max(0.0, fingerDist));
  float softOcclude = mix(1.0, smoothstep(-0.0012, 0.0036, fingerDist), backBias * 0.92);
  float contactAO = mix(1.0, 0.68, nearFinger * backBias);
  float touchSparkle = nearFinger * (1.0 - backBias * 0.5) * (0.45 + 0.55 * facetB);

  // 1) Translucent masking-tape backing (toggleable via uTapeOpacity)
  float tapeAlpha = tapeSil * uTapeOpacity * (0.24 + 0.14 * washiFiber + rimBand * 0.45) * tooth;
  vec3 tapeCol = mix(uRimTint * 0.72, vec3(0.95, 0.97, 0.99), 0.58 + 0.22 * washiFiber);
  tapeCol += vec3(1.0, 0.98, 0.94) * (glintAmt * 0.30 + rimBand * 0.45);

  // 2) Luminous connected PearSans text with dazzling 윤슬 shimmer (renderer.js L87-L88)
  float textCore = smoothstep(0.18, 0.78, glyphMask);
  float textHalo = haloThread * mix(0.76, 0.48, uTapeOpacity);
  float emission = 1.05 + 0.65 * uPassthrough + uDetachFlash * 0.8;

  vec3 letterBase = mix(uRimTint, uCoreTint, clamp(0.45 + 0.55 * textCore, 0.0, 1.0));
  vec3 letterCol = letterBase * (0.94 + 0.22 * n1.b + 0.18 * causticWave) * (1.0 + emission * 0.52)
    + vec3(1.0, 0.98, 0.94) * (glintAmt * 2.05 + touchSparkle * 0.95)
    + mix(uCoreTint, vec3(1.0), 0.65) * fresnel * 0.78;

  float letterAlpha = clamp(textCore * 0.98 + textHalo * (0.48 + 0.35 * glintAmt), 0.0, 1.0);
  float combinedAlpha = clamp(max(tapeAlpha, letterAlpha), 0.0, 1.0) * vMeta.x * vEyeSafe * softOcclude;
  if (combinedAlpha <= 0.004) discard;

  vec3 finalCol = mix(tapeCol, letterCol, clamp(textCore * 1.15 + textHalo * 0.65, 0.0, 1.0));
  finalCol *= contactAO;

  // _AlphaShare dual-blend for Quest 3S passthrough radiance without dark halos
  float glowBoost = mix(1.05, 1.48, uPassthrough);
  float outA = clamp(
    tapeAlpha * 0.85 + textCore * 0.96 + textHalo * mix(0.42, 0.22, uPassthrough),
    0.0,
    1.0
  ) * vMeta.x * vEyeSafe * softOcclude;

  outColor = vec4(finalCol * combinedAlpha * glowBoost, outA);
}`;

// Pass 3: 윤슬 Micro-Glint Splats (4-point star flare + water droplet sparkle)
const GLINT_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;   // xyz, size
layout(location=2) in vec3 iMeta;      // x: alpha, y: seed, z: hue

uniform mat4 uView;
uniform mat4 uProj;

out vec2 vUv;
out vec3 vMeta;

void main() {
  vec4 vp = uView * vec4(iPosSize.xyz, 1.0);
  vp.xy += aCorner * iPosSize.w;
  vUv = aCorner;
  vMeta = iMeta;
  gl_Position = uProj * vp;
}`;

const GLINT_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec3 vMeta;
uniform highp float uTime;
uniform float uPassthrough;
uniform vec3 uCoreTint;
uniform vec3 uRimTint;
out vec4 outColor;

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float alpha = vMeta.x;
  float seed = vMeta.y;
  float hue = vMeta.z;

  float twinkle = 0.72 + 0.28 * sin(uTime * 11.0 + seed * 47.1);
  float crossFlare = pow(max(0.0, 1.0 - abs(vUv.x * vUv.y) * 20.0), 5.0) * exp(-2.6 * r2);
  float diagFlare = pow(max(0.0, 1.0 - abs((vUv.x + vUv.y) * (vUv.x - vUv.y)) * 14.0), 6.0) * exp(-4.2 * r2) * 0.45;
  float halo = exp(-6.8 * r2);
  float intensity = clamp(alpha * (crossFlare * 1.4 + diagFlare + halo * 0.9) * twinkle, 0.0, 1.5);
  if (intensity <= 0.004) discard;

  vec3 col = mix(uCoreTint, uRimTint, hue * 0.55);
  col = mix(col, vec3(1.0, 0.985, 0.95), clamp(halo * 1.2 + crossFlare * 0.7, 0.0, 1.0));
  float boost = mix(1.35, 1.95, uPassthrough);
  float alphaShare = mix(0.45, 0.14, uPassthrough);
  outColor = vec4(col * intensity * boost, clamp(intensity, 0.0, 1.0) * alphaShare);
}`;

// Desktop backdrop subtle dark desk & virtual book hint (only rendered when passthrough=false)
const BG_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.999, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform highp float uTime;
out vec4 outColor;
void main() {
  vec2 d = vUv - vec2(0.5, 0.46);
  float r = length(d * vec2(1.2, 1.0));
  vec3 top = vec3(0.055, 0.075, 0.105);
  vec3 mid = vec3(0.032, 0.045, 0.068);
  vec3 bot = vec3(0.016, 0.022, 0.034);
  vec3 col = mix(top, bot, smoothstep(0.0, 1.0, 1.0 - vUv.y));
  col = mix(col, mid * 1.5, exp(-r * r * 3.2) * 0.65);
  float subtleWave = 0.008 * sin(vUv.x * 12.0 + uTime * 0.5) * cos(vUv.y * 8.0 - uTime * 0.35);
  outColor = vec4(col + subtleWave, 1.0);
}`;

// ---------- SHADER & TEXTURE HELPERS ----------

function compileProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vertSrc],
    [gl.FRAGMENT_SHADER, fragSrc],
  ]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh) || 'Shader compile error';
      gl.deleteShader(sh);
      throw new Error(info);
    }
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Program link error');
  }
  return prog;
}

// 256x256 seamless 4-channel procedural noise texture (matching vfx-studio/renderer.js uNoise channels)
function createNoiseTexture(gl, size = 256) {
  const bytes = new Uint8Array(size * size * 4);
  const hash2 = (x, y, s) => {
    let h = Math.imul(((x % size) + size) % size + s * 17, 374761393)
      ^ Math.imul(((y % size) + size) % size + s * 31, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smoothNoise = (x, y, freq, seed) => {
    const fx = (x / size) * freq;
    const fy = (y / size) * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const x0 = ix % freq;
    const x1 = (ix + 1) % freq;
    const y0 = iy % freq;
    const y1 = (iy + 1) % freq;
    const a = hash2(x0, y0, seed);
    const b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed);
    const d = hash2(x1, y1, seed);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = smoothNoise(x, y, 8, 11) * 0.65 + smoothNoise(x, y, 24, 17) * 0.35;
      const g = smoothNoise(x, y, 16, 29) * 0.6 + smoothNoise(x, y, 48, 37) * 0.4;
      const b = smoothNoise(x, y, 12, 53) * 0.55 + smoothNoise(x, y, 32, 61) * 0.45;
      const a = smoothNoise(x, y, 20, 79) * 0.5 + smoothNoise(x, y, 64, 83) * 0.5;
      bytes[i] = Math.round(r * 255);
      bytes[i + 1] = Math.round(g * 255);
      bytes[i + 2] = Math.round(b * 255);
      bytes[i + 3] = Math.round(a * 255);
    }
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

export const SHIMMER_PRESETS = [
  // 0: 은빛 백금 윤슬 (Silver Sunlit Water)
  { name: '은빛 윤슬', core: [0.95, 0.98, 1.0], rim: [0.58, 0.80, 0.96] },
  // 1: 금빛 석양 윤슬 (Golden Dusk)
  { name: '금빛 석양', core: [1.0, 0.92, 0.72], rim: [0.98, 0.64, 0.28] },
  // 2: 바다 청록 윤슬 (Ocean Aqua)
  { name: '바다 청록', core: [0.76, 1.0, 0.98], rim: [0.16, 0.82, 0.86] },
];

export class BookmarkSnakeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      premultipliedAlpha: true,
      xrCompatible: true,
    });
    if (!gl) throw new Error('WebGL2를 지원하지 않는 브라우저입니다.');
    this.gl = gl;

    // Compile programs
    this.bgProg = compileProgram(gl, BG_VERT, BG_FRAG);
    this.handMaskProg = compileProgram(gl, HAND_MASK_VERT, HAND_MASK_FRAG);
    this.bookmarkProg = compileProgram(gl, BOOKMARK_VERT, BOOKMARK_FRAG);
    this.ribbonProg = compileProgram(gl, RIBBON_VERT, RIBBON_FRAG);
    this.glintProg = compileProgram(gl, GLINT_VERT, GLINT_FRAG);

    // Textures
    this.noiseTex = createNoiseTexture(gl, 256);
    this.textTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );

    // Shared fullscreen/billboard quad VAO
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Pass 1: Tapered Capsule Instanced VAO
    const capGeo = createUnitCapsuleGeometry(10, 2);
    this.capIndexCount = capGeo.indexCount;
    this.capVao = gl.createVertexArray();
    gl.bindVertexArray(this.capVao);

    this.capVertBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.capVertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, capGeo.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);

    this.capIdxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.capIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, capGeo.indices, gl.STATIC_DRAW);

    this.capInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.capInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_MASK_INSTANCES * MASK_INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW);
    const capStrideBytes = MASK_INSTANCE_STRIDE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, capStrideBytes, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, capStrideBytes, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, capStrideBytes, 32);
    gl.vertexAttribDivisor(3, 1);

    // Pass 2B: Dynamic 40-node Ribbon Mesh VAO
    this.ribbonVao = gl.createVertexArray();
    gl.bindVertexArray(this.ribbonVao);

    this.ribbonVertBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, NODE_COUNT * 2 * RIBBON_VERT_STRIDE * 4, gl.DYNAMIC_DRAW);
    const rStride = RIBBON_VERT_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, rStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, rStride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, rStride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, rStride, 32);

    this.ribbonIdxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIdxBuf);
    const idxInit = new Uint16Array((NODE_COUNT - 1) * 6);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxInit, gl.STATIC_DRAW);
    this.ribbonIdxUploaded = false;

    // Pass 3: Instanced Glints VAO
    this.glintVao = gl.createVertexArray();
    gl.bindVertexArray(this.glintVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.glintInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glintInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_GLINTS * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    this.cacheUniforms();
  }

  cacheUniforms() {
    const gl = this.gl;
    const u = (prog, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
    this.bgU = u(this.bgProg, ['uTime']);
    this.handU = u(this.handMaskProg, ['uView', 'uProj', 'uEyePos', 'uVisualAlpha']);
    this.bmU = u(this.bookmarkProg, [
      'uView', 'uProj', 'uPos', 'uRight', 'uUp', 'uHalfSize', 'uNoise',
      'uEyePos', 'uTime', 'uHover', 'uPulse', 'uAnchored', 'uPassthrough', 'uCoreTint', 'uRimTint',
    ]);
    this.ribU = u(this.ribbonProg, [
      'uView', 'uProj', 'uTextAtlas', 'uNoise', 'uEyePos', 'uTime',
      'uTapeOpacity', 'uPassthrough', 'uDetachFlash', 'uCoreTint', 'uRimTint',
      'uFingerCount', 'uFingerA[0]', 'uFingerB[0]',
    ]);
    this.glintU = u(this.glintProg, [
      'uView', 'uProj', 'uTime', 'uPassthrough', 'uCoreTint', 'uRimTint',
    ]);
  }

  uploadTextAtlas(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      const maxA = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxA));
    }
  }

  uploadScene(scene) {
    const gl = this.gl;
    // Hand mask capsule instances
    if (scene.handMask.instanceCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.capInstBuf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        scene.handMask.instances.subarray(0, scene.handMask.instanceCount * MASK_INSTANCE_STRIDE),
      );
    }
    // Ribbon mesh
    if (scene.ribbonVisible) {
      if (!this.ribbonIdxUploaded) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIdxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.ribbonIndices, gl.STATIC_DRAW);
        this.ribbonIdxUploaded = true;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVertBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, scene.ribbonVerts);
    }
    // Sparkle glints
    if (scene.glintCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glintInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, scene.glintData.subarray(0, scene.glintCount * 7));
    }
  }

  renderEye(view, proj, scene, opts = {}) {
    const gl = this.gl;
    const passthrough = Boolean(opts.passthrough);
    const showHandVisual = Boolean(opts.showHandVisual);
    const eyePos = opts.eyePos || scene.headPos || [0, 0, 0];
    const preset = SHIMMER_PRESETS[scene.shimmerPreset] || SHIMMER_PRESETS[0];

    gl.disable(gl.CULL_FACE);

    // 0. Desktop gradient background (skipped in Quest AR passthrough so real room shows through)
    if (!passthrough) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(this.bgProg);
      gl.uniform1f(this.bgU.uTime, scene.time);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // 1. PASS 1: Hybrid 3D Hand Occlusion Depth Pre-pass (1 instanced draw call)
    if (scene.handMask.instanceCount > 0) {
      gl.useProgram(this.handMaskProg);
      gl.bindVertexArray(this.capVao);
      gl.uniformMatrix4fv(this.handU.uView, false, view);
      gl.uniformMatrix4fv(this.handU.uProj, false, proj);
      gl.uniform3fv(this.handU.uEyePos, eyePos);

      // Step 1A (always): pure 3D depth pre-pass for exact hardware finger occlusion
      gl.colorMask(false, false, false, false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(this.handU.uVisualAlpha, 0.0);
      gl.drawElementsInstanced(
        gl.TRIANGLES,
        this.capIndexCount,
        gl.UNSIGNED_SHORT,
        0,
        scene.handMask.instanceCount,
      );
      gl.colorMask(true, true, true, true);

      // Step 1B (desktop / debug only): shade ONLY the closest outer surface (zero joint overlap seams!)
      if (showHandVisual) {
        gl.depthMask(false);
        gl.depthFunc(gl.EQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(this.handU.uVisualAlpha, 0.28);
        gl.drawElementsInstanced(
          gl.TRIANGLES,
          this.capIndexCount,
          gl.UNSIGNED_SHORT,
          0,
          scene.handMask.instanceCount,
        );
        gl.depthFunc(gl.LEQUAL);
      }
    }

    // Standard premultiplied-alpha blend for luminous translucent bookmark, ribbon & glints
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Bind shared textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);

    // 2A. Virtual Bookmark Tab (visible until detached into swimming snake, or subtle ghost at anchor)
    const showBookmark = scene.phase !== PHASE.SWIMMING;
    if (showBookmark) {
      gl.depthMask(false);
      gl.useProgram(this.bookmarkProg);
      gl.bindVertexArray(this.quadVao);
      gl.uniformMatrix4fv(this.bmU.uView, false, view);
      gl.uniformMatrix4fv(this.bmU.uProj, false, proj);
      gl.uniform3fv(this.bmU.uPos, scene.bookmarkPos);
      gl.uniform3fv(this.bmU.uRight, scene.bookmarkRight);
      gl.uniform3fv(this.bmU.uUp, scene.bookmarkUp);
      gl.uniform2f(this.bmU.uHalfSize, 0.017, 0.024); // 3.4cm x 4.8cm bookmark tab
      gl.uniform1i(this.bmU.uNoise, 1);
      gl.uniform3fv(this.bmU.uEyePos, eyePos);
      gl.uniform1f(this.bmU.uTime, scene.time);
      gl.uniform1f(this.bmU.uHover, scene.hoverAmount);
      gl.uniform1f(this.bmU.uPulse, scene.anchorPulse);
      gl.uniform1f(this.bmU.uAnchored, scene.phase === PHASE.ANCHORED ? 1 : 0);
      gl.uniform1f(this.bmU.uPassthrough, passthrough ? 1 : 0);
      gl.uniform3fv(this.bmU.uCoreTint, preset.core);
      gl.uniform3fv(this.bmU.uRimTint, preset.rim);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 2B. 30cm x 3cm Masking-Tape & 윤슬 PearSans Text Ribbon (Depth-tested against Pass 1 Hand Mask!)
    if (scene.ribbonVisible) {
      gl.depthMask(false);
      gl.useProgram(this.ribbonProg);
      gl.bindVertexArray(this.ribbonVao);
      gl.uniformMatrix4fv(this.ribU.uView, false, view);
      gl.uniformMatrix4fv(this.ribU.uProj, false, proj);
      gl.uniform1i(this.ribU.uTextAtlas, 0);
      gl.uniform1i(this.ribU.uNoise, 1);
      gl.uniform3fv(this.ribU.uEyePos, eyePos);
      gl.uniform1f(this.ribU.uTime, scene.time);
      gl.uniform1f(this.ribU.uTapeOpacity, scene.tapeBlend);
      gl.uniform1f(this.ribU.uPassthrough, passthrough ? 1 : 0);
      gl.uniform1f(this.ribU.uDetachFlash, scene.detachFlash);
      gl.uniform3fv(this.ribU.uCoreTint, preset.core);
      gl.uniform3fv(this.ribU.uRimTint, preset.rim);
      gl.uniform1i(this.ribU.uFingerCount, scene.handMask.shaderCount);
      if (scene.handMask.shaderCount > 0) {
        gl.uniform4fv(this.ribU['uFingerA[0]'], scene.handMask.shaderA);
        gl.uniform4fv(this.ribU['uFingerB[0]'], scene.handMask.shaderB);
      }
      gl.drawElements(gl.TRIANGLES, scene.ribbonIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    // 3. PASS 3: Floating 윤슬 Micro-Glint Splats (Depth-tested against hand capsules too)
    if (scene.glintCount > 0) {
      gl.depthMask(false);
      gl.useProgram(this.glintProg);
      gl.bindVertexArray(this.glintVao);
      gl.uniformMatrix4fv(this.glintU.uView, false, view);
      gl.uniformMatrix4fv(this.glintU.uProj, false, proj);
      gl.uniform1f(this.glintU.uTime, scene.time);
      gl.uniform1f(this.glintU.uPassthrough, passthrough ? 1 : 0);
      gl.uniform3fv(this.glintU.uCoreTint, preset.core);
      gl.uniform3fv(this.glintU.uRimTint, preset.rim);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, scene.glintCount);
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
  }
}
