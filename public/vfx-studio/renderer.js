// 순수 WebGL2 GPU 인스턴싱 멀티-커널 스플랫 렌더러 (Quest 3S WebXR + 데스크톱 공용).
// STRIDE = 21 floats/splat: center(3), axis(3), halfSize(2), coreRGB(3), rimRGB(3), mat(4), aux(3)
// 2-패스 블렌딩(Alpha 연기/물질 → Additive 화염/뇌전/참격) + 바닥 인터랙티브 반사광.
import { STRIDE } from './sim.js';

const SPLAT_VERT = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 center;
layout(location=2) in vec3 axis;
layout(location=3) in vec2 halfSize;
layout(location=4) in vec3 coreColor;
layout(location=5) in vec3 rimColor;
layout(location=6) in vec4 mat;   // x: kernel, y: opacity, z: erosion, w: emission
layout(location=7) in vec3 aux;   // x: seed, y: lifeT, z: glint

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
  // 카메라 공간 원근 투영 방향성 빌보드 (ink-crow quadVert 수학 계승)
  vec2 a = camAxis.xy - camAxis.z * p.xy / min(-0.04, p.z);
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
    // 마이크로패싯 반짝임 (SplatGlint.hlsl 경량 포트)
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
    float temp = clamp(core * 1.45 * (1.0 - lifeT * 0.45), 0.0, 1.0);
    vec3 col = mix(vRim, vCore, temp) * (0.75 + 0.55 * emission);
    outColor = vec4(col * a, a * 0.45);
    return;
  }

  // 2: mist (부드러운 다중 옥타브 연기/운기 볼륨)
  if (kernel < 2.5) {
    float turb = (n1.b - 0.5) * 0.36 + (n2.b - 0.5) * 0.22;
    float dist = max(0.0, r2 + turb);
    float wisp = exp(-2.1 * dist) * (0.52 + 0.48 * n1.b) * (1.0 - smoothstep(0.58, 1.0, r2));
    float erode = smoothstep(erosion * 0.55, 1.0, n2.b * 0.7 + (1.0 - r2) * 0.55);
    float a = clamp((1.0 - exp(-opacity * wisp * erode * 1.15)), 0.0, 1.0);
    vec3 col = mix(vRim, vCore, clamp(n1.b * 0.8 + (1.0 - r2) * 0.35, 0.0, 1.0)) * (1.0 + emission * 0.35);
    outColor = vec4(col * a, a * 0.85);
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

  // 4: electric (고주파 지글거리는 플라즈마 뇌전 필라멘트 + 이온 코로나)
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
  float band = exp(-14.0 * vUv.y * vUv.y) * (1.0 - smoothstep(0.65, 1.0, abs(vUv.x)));
  float trail = exp(-3.5 * max(0.0, vUv.y + 0.15) * max(0.0, vUv.y + 0.15)) * (0.5 + 0.5 * n1.b);
  float dissolve = smoothstep(erosion * 0.65, 1.0, n2.a * 0.6 + (1.0 - abs(vUv.y)) * 0.65);
  float a = clamp(opacity * (band * 1.15 + trail * 0.42) * dissolve, 0.0, 1.0);
  vec3 col = mix(vRim, vCore, clamp(band * 1.4, 0.0, 1.0)) * (0.8 + 0.6 * emission);
  outColor = vec4(col * a, a * 0.35);
}`;

const FLOOR_VERT = `#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uFloorY;
uniform vec3 uStageOrigin;
out vec2 vWorldXZ;
void main() {
  vec2 xz = corner * 2.6;
  vec3 wp = vec3(xz.x + uStageOrigin.x, uFloorY + uStageOrigin.y, xz.y + uStageOrigin.z);
  gl_Position = uProj * uView * vec4(wp, 1.0);
  vWorldXZ = xz;
}`;

const FLOOR_FRAG = `#version 300 es
precision mediump float;
in vec2 vWorldXZ;
uniform sampler2D uNoise;
uniform vec3 uGlowColor;
uniform float uGlowIntensity;
out vec4 outColor;
void main() {
  float r = length(vWorldXZ);
  if (r > 2.55) discard;
  float fade = 1.0 - smoothstep(0.95, 2.55, r);
  float grain = texture(uNoise, vWorldXZ * 0.65).r;
  // 미세한 스튜디오 거리 기준 링 (0.5m, 1.0m) - 과한 그리드 배제
  float ring05 = exp(-950.0 * pow(r - 0.5, 2.0)) * 0.13;
  float ring10 = exp(-950.0 * pow(r - 1.0, 2.0)) * 0.09;
  // 인터랙티브 바닥 반사광 (RitualDeskGlow 스타일 지수 감쇠)
  float bounce = (exp(-2.8 * r * r) * 0.72 + exp(-0.85 * r * r) * 0.28) * uGlowIntensity;
  vec3 base = vec3(0.068, 0.074, 0.085) + (grain - 0.5) * 0.015;
  vec3 col = base + vec3(0.45, 0.43, 0.39) * (ring05 + ring10) + uGlowColor * bounce * 0.48;
  float alpha = clamp(fade * (0.78 + bounce * 0.22), 0.0, 0.96);
  outColor = vec4(col * alpha, alpha);
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
  // 타일링 가능한 다중 주파수 노이즈 + 보로노이 셀 패턴
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

      // 타일링 Voronoi 거리
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

    this.uSplat = {
      view: gl.getUniformLocation(this.splatProg, 'uView'),
      proj: gl.getUniformLocation(this.splatProg, 'uProj'),
      time: gl.getUniformLocation(this.splatProg, 'uTime'),
      groupAlpha: gl.getUniformLocation(this.splatProg, 'uGroupAlpha'),
      noise: gl.getUniformLocation(this.splatProg, 'uNoise'),
    };
    this.uFloor = {
      view: gl.getUniformLocation(this.floorProg, 'uView'),
      proj: gl.getUniformLocation(this.floorProg, 'uProj'),
      floorY: gl.getUniformLocation(this.floorProg, 'uFloorY'),
      stageOrigin: gl.getUniformLocation(this.floorProg, 'uStageOrigin'),
      glowColor: gl.getUniformLocation(this.floorProg, 'uGlowColor'),
      glowIntensity: gl.getUniformLocation(this.floorProg, 'uGlowIntensity'),
      noise: gl.getUniformLocation(this.floorProg, 'uNoise'),
    };

    gl.useProgram(this.splatProg);
    gl.uniform1i(this.uSplat.noise, 0);
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

    this.noiseTex = buildNoiseTexture(gl);
    this.buffers = new Map();
    this.floorState = {
      floorY: -0.42,
      stageOrigin: [0, 0, 0],
      glowColor: [1, 0.5, 0.2],
      glowIntensity: 0.7,
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

  setFloor(floorY, stageOrigin, glowColor, glowIntensity) {
    this.floorState.floorY = floorY;
    this.floorState.stageOrigin = stageOrigin;
    this.floorState.glowColor = glowColor;
    this.floorState.glowIntensity = glowIntensity;
  }

  eye(view, proj, groups, time, passthrough) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.enable(gl.BLEND);

    if (!passthrough) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.floorProg);
      gl.uniformMatrix4fv(this.uFloor.view, false, view);
      gl.uniformMatrix4fv(this.uFloor.proj, false, proj);
      gl.uniform1f(this.uFloor.floorY, this.floorState.floorY);
      gl.uniform3fv(this.uFloor.stageOrigin, this.floorState.stageOrigin);
      gl.uniform3fv(this.uFloor.glowColor, this.floorState.glowColor);
      gl.uniform1f(this.uFloor.glowIntensity, this.floorState.glowIntensity);
      gl.bindVertexArray(this.floorVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
