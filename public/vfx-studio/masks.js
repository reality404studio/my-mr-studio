// 절차적 2D 광학 마스크 팩 생성기 (외부 이미지 0개, 100% 독자 절차 생성).
// 엑셀 MMORPG_VFX_현실레퍼런스_100.xlsx의 카테고리 D(서리/균열), F(오로라 커튼), G(암석 파편), J(Gray-Scott 반응-확산)을
// 단일 RGBA 256x256 텍스처(uMasks)의 4채널에 패킹해 Quest 3S 텍스처 샘플링 비용을 최소화한다.

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 1. Gray-Scott 반응-확산 2D 시뮬레이션 (J07: 독/치유/생체 오염 유기적 문양)
// 부팅 시 1회 64x64 130스텝만 계산(~4ms) 후 부드럽게 256x256으로 업샘플링한다.
export function generateReactionDiffusionField(n = 64, steps = 180) {
  let A = new Float32Array(n * n).fill(1.0);
  let B = new Float32Array(n * n).fill(0.0);
  let nextA = new Float32Array(n * n);
  let nextB = new Float32Array(n * n);

  const rng = makeRng(90211);
  // 주기적 경계 조건 위에 18개 유기적 시드 스팟 배치
  for (let s = 0; s < 18; s++) {
    const cx = Math.floor(rng() * n);
    const cy = Math.floor(rng() * n);
    const r = 2 + Math.floor(rng() * 3);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const x = (cx + dx + n) % n;
          const y = (cy + dy + n) % n;
          B[y * n + x] = 0.92 + rng() * 0.08;
          A[y * n + x] = 0.35;
        }
      }
    }
  }

  // 산호/세포 잎맥형 Gray-Scott 파라미터 (F=0.055, k=0.062)
  const dA = 1.0;
  const dB = 0.5;
  const feed = 0.055;
  const kill = 0.062;
  const dt = 1.0;

  for (let iter = 0; iter < steps; iter++) {
    for (let y = 0; y < n; y++) {
      const ym = ((y - 1 + n) % n) * n;
      const y0 = y * n;
      const yp = ((y + 1) % n) * n;
      for (let x = 0; x < n; x++) {
        const xm = (x - 1 + n) % n;
        const xp = (x + 1) % n;
        const i = y0 + x;
        const a = A[i];
        const b = B[i];
        const lapA =
          0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x])
          + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp])
          - a;
        const lapB =
          0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x])
          + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp])
          - b;
        const abb = a * b * b;
        nextA[i] = clamp01(a + (dA * lapA - abb + feed * (1 - a)) * dt);
        nextB[i] = clamp01(b + (dB * lapB + abb - (kill + feed) * b) * dt);
      }
    }
    const tmpA = A; A = nextA; nextA = tmpA;
    const tmpB = B; B = nextB; nextB = tmpB;
  }

  // 대비 정규화 (0..1 풀 레인지)
  let lo = 1, hi = 0;
  for (let i = 0; i < B.length; i++) {
    if (B[i] < lo) lo = B[i];
    if (B[i] > hi) hi = B[i];
  }
  const span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < B.length; i++) {
    B[i] = (B[i] - lo) / span;
  }

  return { n, data: B };
}

function sampleBilinear(field, u, v) {
  const { n, data } = field;
  const gx = ((u % 1) + 1) % 1 * n;
  const gy = ((v % 1) + 1) % 1 * n;
  const x0 = Math.floor(gx) % n;
  const y0 = Math.floor(gy) % n;
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  const a = data[y0 * n + x0] * (1 - fx) + data[y0 * n + x1] * fx;
  const b = data[y1 * n + x0] * (1 - fx) + data[y1 * n + x1] * fx;
  return a * (1 - fy) + b * fy;
}

// 256x256 RGBA 절차적 마스크 팩 생성 (CPU 배열 반환 -> 테스트 & WebGL2 업로드 공용)
export function buildMaskPackPixels(size = 256) {
  const bytes = new Uint8Array(size * size * 4);
  const rng = makeRng(40499);
  const cells = 12;
  const pts = Array.from({ length: cells * cells }, () => [rng(), rng()]);
  const rd = generateReactionDiffusionField(64, 130);

  // 각진 암석 파편 다각형(7각형 비대칭) 반경 프로파일 (G05/G08)
  const polyAngles = 7;
  const polyRadii = Array.from({ length: polyAngles }, () => 0.62 + rng() * 0.32);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = (y * size + x) * 4;

      // R: Voronoi F2 - F1 서리 결정 / 균열 엣지 (D03, D05)
      const gx = u * cells;
      const gy = v * cells;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      let d1 = 10;
      let d2 = 10;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ((ix + ox) % cells + cells) % cells;
          const cy = ((iy + oy) % cells + cells) % cells;
          const p = pts[cy * cells + cx];
          const dx = (ix + ox + p[0]) - gx;
          const dy = (iy + oy + p[1]) - gy;
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
      const crackEdge = clamp01(1.0 - (d2 - d1) * 4.2);
      const crystalFacet = clamp01(1.0 - d1 * 1.15);
      const frostVal = clamp01(crackEdge * 0.68 + crystalFacet * 0.42);

      // G: 오로라 수직 커튼 드레이퍼리 (F01, F09: 수평 줄무늬 + 수직 감쇠)
      const ribbon =
        0.5
        + 0.28 * Math.sin(u * TAU * 5 + Math.sin(v * TAU * 2) * 0.7)
        + 0.16 * Math.sin(u * TAU * 11 - v * TAU * 1.5)
        + 0.08 * Math.cos(u * TAU * 19 + v * TAU * 3);
      const vertProfile = Math.pow(clamp01(1 - v), 0.75) * clamp01(v * 5.0);
      const auroraVal = clamp01(ribbon * (0.45 + 0.55 * vertProfile));

      // B: Gray-Scott 반응-확산 생체/독/치유 마스크 (J07)
      const rdVal = clamp01(sampleBilinear(rd, u, v));

      // A: 각진 암석/결정 파편 실루엣 SDF (G05)
      const dxC = u * 2 - 1;
      const dyC = v * 2 - 1;
      const ang = (Math.atan2(dyC, dxC) + TAU) % TAU;
      const sector = (ang / TAU) * polyAngles;
      const s0 = Math.floor(sector) % polyAngles;
      const s1 = (s0 + 1) % polyAngles;
      const frac = sector - Math.floor(sector);
      const edgeR = polyRadii[s0] * (1 - frac) + polyRadii[s1] * frac;
      const distC = Math.hypot(dxC, dyC);
      const rockMask = clamp01((edgeR - distC) * 4.5 + 0.5);

      bytes[i] = Math.round(frostVal * 255);
      bytes[i + 1] = Math.round(auroraVal * 255);
      bytes[i + 2] = Math.round(rdVal * 255);
      bytes[i + 3] = Math.round(rockMask * 255);
    }
  }
  return bytes;
}

export function createMaskPackTexture(gl, size = 256) {
  const bytes = buildMaskPackPixels(size);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}
