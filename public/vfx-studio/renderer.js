// 순수 WebGL2 GPU 인스턴싱 11-커널 스플랫 렌더러 (MMO 3인칭 / Quest 3S WebXR / 2D·도트 공용).
// STRIDE = 21 floats/splat 유지 (Quest 3S 메모리 대역폭 최적화).
// Texture 0: uNoise (다중 옥타브/섬유/보로노이), Texture 1: uMasks (서리SDF/오로라커튼/Gray-Scott반응확산/암석파편).
import { STRIDE } from './sim.js';
import { createMaskPackTexture } from './masks.js';

const SPLAT_VERT = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 center;
layout(location=2) in vec3 axis;
layout(location=3) in vec2 halfSize;
layout(location=4) in vec3 coreColor;
layout(location=5) in vec3 rimColor;
layout(location=6) in vec4 mat;   // x: kernel, y: opacity, z: erosion, w: emission
layout(location=7) in vec3 aux;   // x: seed, y: lifeT, z: glint (or absorption for mist)

uniform mat4 uView;
uniform mat4 uProj;

out vec2 vUv;
flat out vec3 vCore;
flat out vec3 vRim;
flat out vec4 vMat;
flat out vec3 vAux;

void main() {
  vec4 p = uView * vec4(center, 1.0);
  vec3 camAxis = mat3(uView) * axis;
  // 원근/직교 모두 안정적으로 동작하는 카메라 공간 방향성 빌보드
  float safeZ = min(-0.04, p.z);
  vec2 a = camAxis.xy - camAxis.z * p.xy / safeZ;
  float l = length(a);
  vec2 along = l > 0.0002 ? a / l : vec2(1.0, 0.0);
  vec2 perp = vec2(-along.y, along.x);
  vec2 extent = halfSize * vec2(max(0.28, min(l, 1.0)), 1.0);
  p.xy += along * (corner.x * extent.x) + perp * (corner.y * extent.y);
  gl_Position = uProj * p;
  vUv = corner;
  vCore = coreColor;
  vRim = rimColor;
  vMat = mat;
  vAux = aux;
}`;

const SPLAT_FRAG = `#version 300 es
precision mediump float;

in vec2 vUv;
flat in vec3 vCore;
flat in vec3 vRim;
flat in vec4 vMat;
flat in vec3 vAux;

uniform sampler2D uNoise;
uniform sampler2D uMasks;
uniform float uTime;
uniform float uGroupAlpha;

out vec4 outColor;

void main() {
  float kernel = vMat.x;
  float opacity = vMat.y * uGroupAlpha;
  float erosion = vMat.z;
  float emission = vMat.w;
  float seed = vAux.x;
  float lifeT = vAux.y;
  float glintAmt = vAux.z;

  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;

  vec2 seedOff = vec2(seed * 7.31, seed * 4.19);
  vec4 n1 = texture(uNoise, vUv * 0.42 + seedOff + vec2(0.0, -uTime * 0.14));
  vec4 n2 = texture(uNoise, vUv * 0.85 - seedOff * 0.7 + vec2(uTime * 0.09, -uTime * 0.22));

  // 0: matter (유기적 입자 + 테두리 농담 + 마이크로패싯 SplatGlint)
  if (kernel < 0.5) {
    float edge = r2 + (n1.r - 0.5) * 0.28 + (n2.a - 0.5) * 0.16;
    if (edge > 1.0) discard;
    float tooth = mix(0.45, 1.0, smoothstep(0.12 + erosion * 0.45, 0.78, n1.g * 0.6 + n2.b * 0.4));
    float body = exp(-2.1 * max(0.0, edge)) * (1.0 - smoothstep(0.66, 1.0, edge));
    float rimBand = exp(-34.0 * pow(sqrt(max(0.001, edge)) - 0.72, 2.0)) * 0.32;
    float a = clamp((1.0 - exp(-(body + rimBand) * tooth * opacity * 1.45)), 0.0, 1.0);
    float facet = pow(max(0.0, sin(seed * 41.0 + uTime * 3.8 + n1.r * 6.28)), 16.0);
    float glint = facet * glintAmt * exp(-r2 * 4.5);
    vec3 col = mix(vRim, vCore, clamp(body * 1.25 - lifeT * 0.35, 0.0, 1.0));
    col = col * (0.92 + 0.16 * n1.b) * (1.0 + emission * 0.45) + vec3(1.0, 0.98, 0.94) * glint * 1.4;
    outColor = vec4(col * a, a);
    return;
  }

  // 1: flame (흑체 온도 코어→외곽 + 스크롤 난류 + 알파 침식)
  if (kernel < 1.5) {
    vec2 flowUv = vUv * vec2(0.48, 0.38) + seedOff + vec2(0.0, -uTime * 0.55);
    vec4 nf = texture(uNoise, flowUv);
    float dist = max(0.0, r2 + (nf.b - 0.5) * 0.44 + (n2.a - 0.5) * 0.22);
    if (dist > 1.0) discard;
    float dissolve = smoothstep(erosion * 0.72, erosion * 0.72 + 0.35, nf.b * 0.65 + n2.r * 0.35 + (1.0 - dist) * 0.45);
    float core = exp(-5.6 * dist);
    float outer = exp(-1.85 * dist) * (1.0 - smoothstep(0.62, 1.0, dist));
    float a = clamp(opacity * (core * 0.95 + outer * 0.65) * dissolve, 0.0, 1.0);
    float temp = clamp(core * 1.45 * (1.0 - lifeT * 0.48), 0.0, 1.0);
    vec3 col = mix(vRim, vCore, temp) * (0.75 + 0.55 * emission);
    outColor = vec4(col * a, a * 0.45);
    return;
  }

  // 2: mist (B10: Beer-Lambert 투과 T=exp(-sigma_t*s) + 흡수(그을음) vs 산란(안개) 분리)
  if (kernel < 2.5) {
    float absorption = clamp(glintAmt, 0.0, 1.0);
    float turb = (n1.b - 0.5) * 0.36 + (n2.b - 0.5) * 0.22;
    float dist = max(0.0, r2 + turb);
    float density = exp(-1.95 * dist) * (0.50 + 0.50 * n1.b) * (1.0 - smoothstep(0.58, 1.0, r2));
    float erode = smoothstep(erosion * 0.52, 1.0, n2.b * 0.7 + (1.0 - r2) * 0.55);
    float opticalDepth = opacity * density * erode * (1.15 + absorption * 0.85);
    float transmittance = exp(-opticalDepth);
    float a = clamp(1.0 - transmittance, 0.0, 1.0);
    // 높은 흡수율(그을음)은 내부가 어둡게 잠기고, 낮은 흡수율(산란 안개)은 가장자리가 밝게 빛남
    float scatterLight = mix(n1.b * 0.8 + (1.0 - r2) * 0.35, (1.0 - density) * 0.45, absorption);
    vec3 col = mix(vRim, vCore, clamp(scatterLight, 0.0, 1.0));
    col *= mix(1.0 + emission * 0.35, 0.55 + emission * 0.18, absorption);
    outColor = vec4(col * a, a * 0.92);
    return;
  }

  // 3: blade (지수 감쇠 날카로운 코어 + 광학 헤일로)
  if (kernel < 3.5) {
    float core = exp(-24.0 * vUv.y * vUv.y) * exp(-1.85 * vUv.x * vUv.x);
    float halo = exp(-4.4 * vUv.y * vUv.y) * exp(-1.1 * vUv.x * vUv.x);
    float breakup = mix(1.0, 0.55 + 0.45 * n1.g, erosion);
    float a = clamp(opacity * (core * 1.3 + halo * 0.46) * breakup, 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(core * 1.5, 0.0, 1.0)) * (0.85 + 0.65 * emission);
    outColor = vec4(col * a, a * 0.25);
    return;
  }

  // 4: electric (E01/E02: 고주파 플라즈마 뇌전 필라멘트 + 이온 코로나)
  if (kernel < 4.5) {
    float warp = (texture(uNoise, vec2(vUv.x * 0.65 + uTime * 2.1, seed * 3.7)).r - 0.5) * 0.48;
    float dy = vUv.y + warp;
    float bolt = exp(-38.0 * dy * dy) * exp(-1.4 * vUv.x * vUv.x);
    float corona = exp(-5.2 * dy * dy) * exp(-1.0 * vUv.x * vUv.x) * (0.65 + 0.35 * n2.r);
    float flicker = 0.78 + 0.22 * sin(uTime * 34.0 + seed * 29.0);
    float a = clamp(opacity * (bolt * 1.45 + corona * 0.52) * flicker, 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(bolt * 1.65, 0.0, 1.0)) * (0.9 + 0.7 * emission);
    outColor = vec4(col * a, a * 0.2);
    return;
  }

  // 5: ring (충격파 아크 + 노이즈 침식 꼬리)
  if (kernel < 5.5) {
    float band = exp(-14.0 * vUv.y * vUv.y) * (1.0 - smoothstep(0.65, 1.0, abs(vUv.x)));
    float trail = exp(-3.5 * max(0.0, vUv.y + 0.15) * max(0.0, vUv.y + 0.15)) * (0.5 + 0.5 * n1.b);
    float dissolve = smoothstep(erosion * 0.65, 1.0, n2.a * 0.6 + (1.0 - abs(vUv.y)) * 0.65);
    float a = clamp(opacity * (band * 1.15 + trail * 0.42) * dissolve, 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(band * 1.4, 0.0, 1.0)) * (0.8 + 0.6 * emission);
    outColor = vec4(col * a, a * 0.35);
    return;
  }

  // 6: frost (D03/D05: Voronoi 서리 결정 SDF + 날카로운 균열 + 크리스탈 반짝임)
  if (kernel < 6.5) {
    vec2 mUv = vUv * 0.5 + 0.5 + seedOff * 0.37;
    float frost = texture(uMasks, mUv).r;
    float edgeMask = 1.0 - smoothstep(0.52, 1.0, r2 + (1.0 - frost) * 0.32);
    float crystal = smoothstep(0.22 + erosion * 0.42, 0.85, frost) * edgeMask;
    if (crystal < 0.02) discard;
    float rimSpec = exp(-22.0 * pow(sqrt(max(0.001, r2)) - 0.70, 2.0)) * 0.55;
    float facet = pow(max(0.0, sin(seed * 53.0 + uTime * 4.2 + frost * 9.4)), 14.0) * glintAmt;
    float a = clamp(opacity * (crystal * 1.05 + rimSpec * 0.6), 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(frost * 1.15 + rimSpec, 0.0, 1.0)) * (0.85 + 0.55 * emission);
    col += vec3(0.95, 0.99, 1.0) * facet * 1.65;
    outColor = vec4(col * a, a * 0.65);
    return;
  }

  // 7: aurora (F01/F09: 접히는 수직 오로라 커튼 드레이퍼리 + 높이별 발광 분포)
  if (kernel < 7.5) {
    vec2 aUv = vec2(vUv.x * 0.42 + seed * 1.7 + sin(uTime * 0.45 + vUv.y * 2.0) * 0.12, vUv.y * 0.5 + 0.5);
    float curtain = texture(uMasks, aUv).g;
    float horizFade = 1.0 - smoothstep(0.35, 1.0, abs(vUv.x));
    float bottomSharp = smoothstep(-0.95, -0.35, vUv.y) * (1.0 - smoothstep(-0.1, 1.0, vUv.y));
    float a = clamp(opacity * curtain * horizFade * (0.35 + 0.95 * bottomSharp) * (1.0 - erosion * 0.4), 0.0, 1.0);
    if (a < 0.01) discard;
    // 고도별 색 전이 (하단 코어 → 상단 외곽)
    vec3 col = mix(vCore, vRim, clamp((vUv.y + 0.6) * 0.72, 0.0, 1.0)) * (0.85 + 0.65 * emission);
    outColor = vec4(col * a, a * 0.32);
    return;
  }

  // 8: shield (F02/F08: 얇은 막 간섭색 Thin-Film Iridescence + 프레넬 실드 테두리)
  if (kernel < 8.5) {
    float r = sqrt(r2);
    float fresnel = pow(clamp(r, 0.0, 1.0), 2.4);
    float rim = exp(-36.0 * pow(r - 0.84, 2.0));
    float phase = r * 5.2 + seed * 6.28 + uTime * 1.35 + n1.b * 1.8;
    vec3 irid = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.094, 4.188));
    float hexNoise = texture(uMasks, vUv * 0.55 + seedOff).r;
    float a = clamp(opacity * (rim * 1.15 + fresnel * 0.52 + hexNoise * 0.22 * (1.0 - erosion)), 0.0, 1.0);
    vec3 baseCol = mix(vRim, vCore, clamp(rim * 1.3 + fresnel * 0.4, 0.0, 1.0));
    vec3 col = mix(baseCol, irid * 1.25, 0.42 + 0.3 * glintAmt) * (0.8 + 0.55 * emission);
    outColor = vec4(col * a, a * 0.42);
    return;
  }

  // 9: debris (G05/G08: 각진 다각형 암석/강체 파편 + 단면 명암)
  if (kernel < 9.5) {
    float ang = seed * 6.2831 + uTime * (seed - 0.5) * 9.0;
    float cs = cos(ang), sn = sin(ang);
    vec2 rotUv = vec2(vUv.x * cs - vUv.y * sn, vUv.x * sn + vUv.y * cs) * 0.5 + 0.5;
    float rock = texture(uMasks, rotUv).a;
    if (rock < 0.42) discard;
    float shade = clamp(0.55 + (rotUv.y - 0.5) * 0.95 + (n1.r - 0.5) * 0.25, 0.2, 1.25);
    float a = clamp(opacity * smoothstep(0.42, 0.58, rock), 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(shade - 0.25, 0.0, 1.0)) * shade * (1.0 + emission * 0.25);
    outColor = vec4(col * a, a);
    return;
  }

  // 10: bio (J07: Gray-Scott 반응-확산 생체/독/치유 맥동 마스크)
  vec2 bUv = vUv * 0.52 + seedOff * 0.41 + vec2(0.0, -uTime * 0.08);
  float rd = texture(uMasks, bUv).b;
  float radialFade = 1.0 - smoothstep(0.45, 1.0, r2);
  float veins = smoothstep(0.18 + erosion * 0.48, 0.78, rd + (1.0 - r2) * 0.22);
  float pulse = 0.82 + 0.18 * sin(uTime * 5.2 + seed * 12.0 + rd * 4.0);
  float a = clamp(opacity * veins * radialFade * 1.15, 0.0, 1.0);
  if (a < 0.01) discard;
  vec3 col = mix(vRim, vCore, clamp(rd * 1.35 * pulse, 0.0, 1.0)) * (0.8 + 0.65 * emission);
  outColor = vec4(col * a, a * 0.72);
}`;

const FLOOR_VERT = `#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uFloorY;
uniform vec3 uStageOrigin;
out vec2 vWorldXZ;
void main() {
  vec2 xz = corner * 3.2;
  vec3 wp = vec3(xz.x + uStageOrigin.x, uFloorY + uStageOrigin.y, xz.y + uStageOrigin.z);
  gl_Position = uProj * uView * vec4(wp, 1.0);
  vWorldXZ = xz;
}`;

const FLOOR_FRAG = `#version 300 es
precision mediump float;
in vec2 vWorldXZ;
uniform sampler2D uNoise;
uniform vec3 uFloorBase;
uniform vec3 uRingTint;
uniform float uShowRings;
uniform vec3 uGlowColor;
uniform float uGlowIntensity;
out vec4 outColor;
void main() {
  float r = length(vWorldXZ);
  if (r > 3.1) discard;
  float fade = 1.0 - smoothstep(1.3, 3.1, r);
  float grain = texture(uNoise, vWorldXZ * 0.65).r;
  float ring05 = exp(-950.0 * pow(r - 0.5, 2.0)) * 0.14;
  float ring10 = exp(-950.0 * pow(r - 1.0, 2.0)) * 0.18;
  float ring20 = exp(-950.0 * pow(r - 2.0, 2.0)) * 0.12;
  float axisX = exp(-1200.0 * vWorldXZ.y * vWorldXZ.y) * smoothstep(2.2, 0.4, r) * 0.06;
  float axisZ = exp(-1200.0 * vWorldXZ.x * vWorldXZ.x) * smoothstep(2.2, 0.4, r) * 0.06;
  float guides = (ring05 + ring10 + ring20 + axisX + axisZ) * uShowRings;
  float bounce = (exp(-2.8 * r * r) * 0.72 + exp(-0.85 * r * r) * 0.28) * uGlowIntensity;
  vec3 base = uFloorBase + (grain - 0.5) * 0.015;
  vec3 col = base + uRingTint * guides + uGlowColor * bounce * 0.48;
  float alpha = clamp(fade * (0.78 + bounce * 0.22), 0.0, 0.96);
  outColor = vec4(col * alpha, alpha);
}`;

const LINE_VERT = `#version 300 es
layout(location=0) in vec3 pos;
uniform mat4 uView;
uniform mat4 uProj;
void main() {
  gl_Position = uProj * uView * vec4(pos, 1.0);
}`;

const LINE_FRAG = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor.rgb * uColor.a, uColor.a);
}`;

function compileProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vertSrc], [gl.FRAGMENT_SHADER, fragSrc]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'Shader compile error');
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

export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export function multiply(out, a, b) {
  for (let j = 0; j < 4; j++) {
    const bi = j * 4;
    const x = b[bi], y = b[bi + 1], z = b[bi + 2], w = b[bi + 3];
    for (let i = 0; i < 4; i++) {
      out[bi + i] = a[i] * x + a[i + 4] * y + a[i + 8] * z + a[i + 12] * w;
    }
  }
  return out;
}

export function perspective(aspect, fovRad) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const n = 0.035;
  const z = 80;
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (z + n) / (n - z), -1,
    0, 0, (2 * z * n) / (n - z), 0,
  ]);
}

export function lookAt(out, eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
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

function buildNoiseTexture(gl) {
  const size = 256;
  const bytes = new Uint8Array(size * size * 4);
  let seed = 40491;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cells = 10;
  const pts = Array.from({ length: cells * cells }, () => [rng(), rng()]);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    let fiber = rng();
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = (y * size + x) * 4;
      fiber = fiber * 0.78 + rng() * 0.22;
      const tau = Math.PI * 2;
      const cloud =
        0.5
        + 0.22 * Math.sin(u * tau * 2 + Math.cos(v * tau * 2))
        + 0.14 * Math.cos(v * tau * 4 - Math.sin(u * tau * 3))
        + 0.09 * Math.sin((u + v) * tau * 6)
        + 0.05 * Math.cos((u - v) * tau * 11);

      const gx = u * cells;
      const gy = v * cells;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      let dMin = 10;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ((ix + ox) % cells + cells) % cells;
          const cy = ((iy + oy) % cells + cells) % cells;
          const p = pts[cy * cells + cx];
          const dx = (ix + ox + p[0]) - gx;
          const dy = (iy + oy + p[1]) - gy;
          const d = dx * dx + dy * dy;
          if (d < dMin) dMin = d;
        }
      }
      const vor = Math.max(0, Math.min(1, 1 - Math.sqrt(dMin) * 1.15));

      bytes[i] = Math.round(rng() * 255);
      bytes[i + 1] = Math.round(Math.max(0, Math.min(1, (fiber - 0.22) * 1.9)) * 255);
      bytes[i + 2] = Math.round(Math.max(0, Math.min(1, cloud)) * 255);
      bytes[i + 3] = Math.round(vor * 255);
    }
  }

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

export class VfxPainter {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      xrCompatible: Boolean(navigator.xr),
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2를 사용할 수 없습니다.');
    this.gl = gl;

    this.splatProg = compileProgram(gl, SPLAT_VERT, SPLAT_FRAG);
    this.floorProg = compileProgram(gl, FLOOR_VERT, FLOOR_FRAG);
    this.lineProg = compileProgram(gl, LINE_VERT, LINE_FRAG);

    this.uSplat = {
      view: gl.getUniformLocation(this.splatProg, 'uView'),
      proj: gl.getUniformLocation(this.splatProg, 'uProj'),
      time: gl.getUniformLocation(this.splatProg, 'uTime'),
      groupAlpha: gl.getUniformLocation(this.splatProg, 'uGroupAlpha'),
      noise: gl.getUniformLocation(this.splatProg, 'uNoise'),
      masks: gl.getUniformLocation(this.splatProg, 'uMasks'),
    };
    this.uFloor = {
      view: gl.getUniformLocation(this.floorProg, 'uView'),
      proj: gl.getUniformLocation(this.floorProg, 'uProj'),
      floorY: gl.getUniformLocation(this.floorProg, 'uFloorY'),
      stageOrigin: gl.getUniformLocation(this.floorProg, 'uStageOrigin'),
      floorBase: gl.getUniformLocation(this.floorProg, 'uFloorBase'),
      ringTint: gl.getUniformLocation(this.floorProg, 'uRingTint'),
      showRings: gl.getUniformLocation(this.floorProg, 'uShowRings'),
      glowColor: gl.getUniformLocation(this.floorProg, 'uGlowColor'),
      glowIntensity: gl.getUniformLocation(this.floorProg, 'uGlowIntensity'),
      noise: gl.getUniformLocation(this.floorProg, 'uNoise'),
    };
    this.uLine = {
      view: gl.getUniformLocation(this.lineProg, 'uView'),
      proj: gl.getUniformLocation(this.lineProg, 'uProj'),
      color: gl.getUniformLocation(this.lineProg, 'uColor'),
    };

    gl.useProgram(this.splatProg);
    gl.uniform1i(this.uSplat.noise, 0);
    gl.uniform1i(this.uSplat.masks, 1);
    gl.useProgram(this.floorProg);
    gl.uniform1i(this.uFloor.noise, 0);

    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.floorVao = gl.createVertexArray();
    gl.bindVertexArray(this.floorVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 256 * 6 * 4, gl.DYNAMIC_DRAW);
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.noiseTex = buildNoiseTexture(gl);
    this.maskTex = createMaskPackTexture(gl, 256);
    this.buffers = new Map();
    this.floorState = {
      floorY: -0.42,
      stageOrigin: [0, 0, 0],
      glowColor: [1, 0.5, 0.2],
      glowIntensity: 0.7,
      floorBase: [0.068, 0.074, 0.085],
      ringTint: [0.46, 0.44, 0.40],
      showRings: true,
    };

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  makeVao(buffer) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const attrs = [
      [1, 3, 0],   // center
      [2, 3, 3],   // axis
      [3, 2, 6],   // halfSize
      [4, 3, 8],   // coreColor
      [5, 3, 11],  // rimColor
      [6, 4, 14],  // mat
      [7, 3, 18],  // aux
    ];
    for (const [loc, size, offset] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  upload(batch) {
    const gl = this.gl;
    let rec = this.buffers.get(batch);
    if (!rec) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, batch.data.byteLength, gl.DYNAMIC_DRAW);
      rec = { buffer, vao: this.makeVao(buffer) };
      this.buffers.set(batch, rec);
    }
    if (batch.count > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, rec.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, batch.count * STRIDE);
    }
  }

  setFloor(floorY, stageOrigin, glowColor, glowIntensity, style = null) {
    this.floorState.floorY = floorY;
    this.floorState.stageOrigin = stageOrigin;
    this.floorState.glowColor = glowColor;
    this.floorState.glowIntensity = glowIntensity;
    if (style) {
      if (style.floorBase) this.floorState.floorBase = style.floorBase;
      if (style.ringTint) this.floorState.ringTint = style.ringTint;
      if (typeof style.showRings === 'boolean') this.floorState.showRings = style.showRings;
    }
  }

  drawActorLines(view, proj, actor, color = [0.6, 0.64, 0.7, 0.34]) {
    if (!actor || !actor.lineCount) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(this.uLine.view, false, view);
    gl.uniformMatrix4fv(this.uLine.proj, false, proj);
    gl.uniform4fv(this.uLine.color, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, actor.lineVerts, 0, actor.lineCount * 6);
    gl.bindVertexArray(this.lineVao);
    gl.drawArrays(gl.LINES, 0, actor.lineCount * 2);
    gl.bindVertexArray(null);
  }

  eye(view, proj, groups, time, passthrough, actorOverlay = null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.enable(gl.BLEND);

    if (!passthrough) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.floorProg);
      gl.uniformMatrix4fv(this.uFloor.view, false, view);
      gl.uniformMatrix4fv(this.uFloor.proj, false, proj);
      gl.uniform1f(this.uFloor.floorY, this.floorState.floorY);
      gl.uniform3fv(this.uFloor.stageOrigin, this.floorState.stageOrigin);
      gl.uniform3fv(this.uFloor.floorBase, this.floorState.floorBase);
      gl.uniform3fv(this.uFloor.ringTint, this.floorState.ringTint);
      gl.uniform1f(this.uFloor.showRings, this.floorState.showRings ? 1.0 : 0.0);
      gl.uniform3fv(this.uFloor.glowColor, this.floorState.glowColor);
      gl.uniform1f(this.uFloor.glowIntensity, this.floorState.glowIntensity);
      gl.bindVertexArray(this.floorVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (actorOverlay?.actor) {
      this.drawActorLines(view, proj, actorOverlay.actor, actorOverlay.color);
    }

    gl.useProgram(this.splatProg);
    gl.uniformMatrix4fv(this.uSplat.view, false, view);
    gl.uniformMatrix4fv(this.uSplat.proj, false, proj);
    gl.uniform1f(this.uSplat.time, time);

    for (const group of groups) {
      if (!group.batch.count || group.alpha <= 0) continue;
      if (group.blend === 'additive') {
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      const rec = this.buffers.get(group.batch);
      if (!rec) continue;
      gl.uniform1f(this.uSplat.groupAlpha, group.alpha);
      gl.bindVertexArray(rec.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.batch.count);
    }
    gl.bindVertexArray(null);
  }
}
