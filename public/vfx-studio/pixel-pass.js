// 2D 도트(픽셀아트) 실시간 후처리 FBO 패스 + PNG 스프라이트 시트 & 메타 JSON Bake.
// 저해상도 렌더 타깃(64/128/256px) → NEAREST 필터 → 4x4 Bayer 디더링 → 팔레트 양자화 →
// 알파 하드 컷아웃 + 선택적 1px 외곽선으로 2D/도트 게임용 VFX를 실시간 제작·내보내기한다.

const POST_VERT = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 vUv;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
  vUv = corner * 0.5 + 0.5;
}`;

const POST_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexSize;
uniform float uLevels;
uniform float uDither;
uniform float uAlphaCut;
uniform float uOutline;
uniform vec4 uBgColor;
uniform float uTransparentBg;
out vec4 outColor;

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = y * 4 + x;
  const float m[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (m[idx] + 0.5) / 16.0 - 0.5;
}

void main() {
  vec2 px = floor(vUv * uTexSize);
  vec2 uv = (px + 0.5) / uTexSize;
  vec4 s = texture(uScene, uv);
  float d = bayer4(px) * uDither;

  // 프리멀티플라이드 알파 복원 (가산 발광으로 RGB가 알파보다 큰 경우도 보존)
  float lum = max(s.r, max(s.g, s.b));
  float effAlpha = clamp(max(s.a, lum * 0.92), 0.0, 1.0);

  if (effAlpha + d * 0.25 < uAlphaCut) {
    // 1px 도트 외곽선 옵션
    if (uOutline > 0.5) {
      vec2 stepUv = 1.0 / uTexSize;
      float nA = 0.0;
      vec4 t1 = texture(uScene, uv + vec2(stepUv.x, 0.0));
      vec4 t2 = texture(uScene, uv - vec2(stepUv.x, 0.0));
      vec4 t3 = texture(uScene, uv + vec2(0.0, stepUv.y));
      vec4 t4 = texture(uScene, uv - vec2(0.0, stepUv.y));
      nA = max(nA, max(t1.a, max(t1.r, max(t1.g, t1.b))));
      nA = max(nA, max(t2.a, max(t2.r, max(t2.g, t2.b))));
      nA = max(nA, max(t3.a, max(t3.r, max(t3.g, t3.b))));
      nA = max(nA, max(t4.a, max(t4.r, max(t4.g, t4.b))));
      if (nA >= uAlphaCut) {
        outColor = vec4(0.05, 0.05, 0.08, 1.0);
        return;
      }
    }
    if (uTransparentBg > 0.5) {
      outColor = vec4(0.0);
    } else {
      // 미세한 도트 작업판 체커보드 배경
      float chk = mod(floor(px.x / 8.0) + floor(px.y / 8.0), 2.0);
      vec3 bg = uBgColor.rgb + vec3(chk * 0.018);
      outColor = vec4(bg, 1.0);
    }
    return;
  }

  vec3 unpremul = s.a > 0.02 ? s.rgb / max(s.a, 0.15) : s.rgb;
  // 색감 보정 + 팔레트 레벨 양자화
  vec3 col = clamp(unpremul, 0.0, 1.0);
  float lv = max(2.0, uLevels);
  col = floor(clamp(col + d / lv, 0.0, 1.0) * (lv - 1.0) + 0.5) / (lv - 1.0);
  outColor = vec4(col, 1.0);
}`;

function compilePost(gl) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, POST_VERT], [gl.FRAGMENT_SHADER, POST_FRAG]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'Pixel post shader error');
    }
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Pixel post link error');
  }
  return prog;
}

export class PixelArtPass {
  constructor(gl, quadBuffer) {
    this.gl = gl;
    this.prog = compilePost(gl);
    this.u = {
      scene: gl.getUniformLocation(this.prog, 'uScene'),
      texSize: gl.getUniformLocation(this.prog, 'uTexSize'),
      levels: gl.getUniformLocation(this.prog, 'uLevels'),
      dither: gl.getUniformLocation(this.prog, 'uDither'),
      alphaCut: gl.getUniformLocation(this.prog, 'uAlphaCut'),
      outline: gl.getUniformLocation(this.prog, 'uOutline'),
      bgColor: gl.getUniformLocation(this.prog, 'uBgColor'),
      transparentBg: gl.getUniformLocation(this.prog, 'uTransparentBg'),
    };
    gl.useProgram(this.prog);
    gl.uniform1i(this.u.scene, 2);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    this.bakeFbo = gl.createFramebuffer();
    this.bakeTex = gl.createTexture();
    this.size = 0;
    this.ensureSize(128);
  }

  ensureSize(size) {
    const clamped = Math.max(32, Math.min(512, Math.round(size || 128)));
    if (this.size === clamped) return;
    this.size = clamped;
    const gl = this.gl;
    for (const [fbo, tex] of [[this.fbo, this.tex], [this.bakeFbo, this.bakeTex]]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, clamped, clamped, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // 1단계: 저해상도 FBO 바인딩 후 투명 클리어
  beginCapture(resolution) {
    this.ensureSize(resolution);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // 2단계: 뷰포트 중앙 정사각 프레임에 픽셀아트 결과 출력 (또는 Bake용 투명 출력)
  present(targetW, targetH, opts = {}, toBakeFbo = false) {
    const gl = this.gl;
    if (toBakeFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bakeFbo);
      gl.viewport(0, 0, this.size, this.size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const bg = opts.bgColor || [0.043, 0.051, 0.063, 1.0];
      gl.viewport(0, 0, targetW, targetH);
      gl.clearColor(bg[0], bg[1], bg[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // 정사각 도트 캔버스를 화면 중앙에 정수배 느낌으로 크게 배치
      const side = Math.min(targetW, targetH) * 0.92;
      const vx = Math.round((targetW - side) * 0.5);
      const vy = Math.round((targetH - side) * 0.5);
      gl.viewport(vx, vy, Math.round(side), Math.round(side));
    }

    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform2f(this.u.texSize, this.size, this.size);
    // 팔레트 색 수(8/16/32)를 채널별 레벨(3/5/7)로 매핑
    const colorCount = opts.colors || 16;
    const levels = colorCount <= 8 ? 3.0 : colorCount <= 16 ? 5.0 : 8.0;
    gl.uniform1f(this.u.levels, levels);
    gl.uniform1f(this.u.dither, opts.dither ?? 0.35);
    gl.uniform1f(this.u.alphaCut, opts.alphaCut ?? 0.14);
    gl.uniform1f(this.u.outline, opts.outline ? 1.0 : 0.0);
    const bg = opts.bgColor || [0.06, 0.07, 0.09, 1.0];
    gl.uniform4f(this.u.bgColor, bg[0], bg[1], bg[2], 1.0);
    gl.uniform1f(this.u.transparentBg, toBakeFbo ? 1.0 : 0.0);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // 전체 타임라인을 투명 PNG 스프라이트 시트 아틀라스 + 프레임 메타 JSON으로 굽기(Bake)
  bakeSpriteSheet({
    engine,
    painter,
    viewMat,
    projMat,
    resolution = 128,
    fps = 12,
    duration = 1.5,
    pixelOpts = {},
  }) {
    const gl = this.gl;
    this.ensureSize(resolution);
    const frameCount = Math.max(4, Math.min(36, Math.round(fps * duration)));
    const cols = Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / cols);

    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = cols * this.size;
    atlasCanvas.height = rows * this.size;
    const ctx = atlasCanvas.getContext('2d');
    const pixels = new Uint8Array(this.size * this.size * 4);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = this.size;
    frameCanvas.height = this.size;
    const fctx = frameCanvas.getContext('2d');
    const imgData = fctx.createImageData(this.size, this.size);

    // 원본 시뮬레이션 리셋 후 결정론적 스텝 캡처
    const wasPaused = engine.paused;
    engine.paused = false;
    engine.loadRecipe(engine.recipe, true);

    const stepDt = 1 / fps;
    const subSteps = 2;
    for (let f = 0; f < frameCount; f++) {
      for (let s = 0; s < subSteps; s++) {
        engine.tick(stepDt / subSteps, []);
      }
      for (const g of engine.groups) painter.upload(g.batch);

      this.beginCapture(this.size);
      painter.eye(viewMat, projMat, engine.groups, engine.time, true, null);
      this.present(this.size, this.size, pixelOpts, true);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bakeFbo);
      gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // WebGL Y축 반전 복사
      const rowBytes = this.size * 4;
      for (let y = 0; y < this.size; y++) {
        const srcOff = (this.size - 1 - y) * rowBytes;
        const dstOff = y * rowBytes;
        imgData.data.set(pixels.subarray(srcOff, srcOff + rowBytes), dstOff);
      }
      fctx.putImageData(imgData, 0, 0);
      const col = f % cols;
      const row = Math.floor(f / cols);
      ctx.drawImage(frameCanvas, col * this.size, row * this.size);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    engine.paused = wasPaused;

    const meta = {
      format: 'splat-vfx-studio/spritesheet/1',
      recipeId: engine.recipe.id,
      name: engine.recipe.name,
      frameWidth: this.size,
      frameHeight: this.size,
      columns: cols,
      rows,
      frameCount,
      fps,
      duration: Number((frameCount / fps).toFixed(3)),
      colors: pixelOpts.colors || 16,
      outline: Boolean(pixelOpts.outline),
      pivot: [0.5, 0.5],
    };

    return {
      pngDataUrl: atlasCanvas.toDataURL('image/png'),
      meta,
    };
  }
}
