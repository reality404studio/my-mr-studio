// 멀티-뷰 카메라 프리셋(MMO 3인칭 / VR 1인칭 / 2D·도트 / 탑다운) + 배경 조도 + 시점 안전 검수.
// 이펙트 데이터와 무대(카메라·배경·검수 가이드)를 분리해 클릭 한 번으로 시점을 전환한다.

export const VIEW_PRESETS = Object.freeze({
  'mmo-3p': {
    id: 'mmo-3p',
    label: 'MMO 3인칭',
    projection: 'perspective',
    fovDeg: 46,
    camera: { yaw: 0.34, pitch: 0.30, dist: 2.85, target: [0, 0.12, 0] },
    pixelDefault: false,
    showFloor: true,
    showRings: true,
    showActor: true,
    hint: 'MMO 3인칭 백뷰 · 1m/2m/3m 장판 거리 링과 더미 실루엣 기준 가독성 검수',
  },
  'vr-1p': {
    id: 'vr-1p',
    label: 'VR 1인칭',
    projection: 'perspective',
    fovDeg: 68,
    camera: { yaw: 0.06, pitch: 0.08, dist: 0.92, target: [0, 0.04, 0] },
    pixelDefault: false,
    showFloor: true,
    showRings: false,
    showActor: false,
    hint: 'Quest 3S 1인칭 손앞 뷰 · 중앙 시야 가림/화이트아웃 경고 실시간 감시',
  },
  '2d-side': {
    id: '2d-side',
    label: '2D · 도트',
    projection: 'ortho',
    orthoHalfH: 1.05,
    camera: { yaw: 0.0, pitch: 0.0, dist: 3.5, target: [0, 0.05, 0] },
    pixelDefault: true,
    showFloor: false,
    showRings: false,
    showActor: true,
    hint: '2D 직교 사이드뷰 · 도트 양자화/12fps 스텝 프리뷰 및 PNG 스프라이트 시트 Bake',
  },
  '2d-iso': {
    id: '2d-iso',
    label: '2D 쿼터뷰',
    projection: 'ortho',
    orthoHalfH: 1.25,
    camera: { yaw: 0.785, pitch: 0.615, dist: 4.0, target: [0, 0.02, 0] },
    pixelDefault: true,
    showFloor: true,
    showRings: true,
    showActor: true,
    hint: '2.5D 아이소메트릭 쿼터뷰 · 직교 투영 + 도트 필터/스프라이트 시트 출력',
  },
  topdown: {
    id: 'topdown',
    label: '탑다운 장판',
    projection: 'perspective',
    fovDeg: 44,
    camera: { yaw: 0.0, pitch: 1.32, dist: 3.2, target: [0, -0.1, 0] },
    pixelDefault: false,
    showFloor: true,
    showRings: true,
    showActor: true,
    hint: '탑다운 장판 검수 뷰 · 광역 위험 예고 경계와 범위 비율 확인',
  },
});

export const BACKDROP_PRESETS = Object.freeze({
  dungeon: {
    id: 'dungeon',
    label: '던전 (어둠)',
    clear: [0.043, 0.051, 0.063, 1.0],
    floorBase: [0.068, 0.074, 0.085],
    ringTint: [0.46, 0.44, 0.40],
    actorColor: [0.58, 0.62, 0.68, 0.32],
    cssBg: 'radial-gradient(circle at 50% 44%, #141920 0%, #0b0d10 72%)',
  },
  daylight: {
    id: 'daylight',
    label: '낮 (밝음)',
    clear: [0.52, 0.59, 0.67, 1.0],
    floorBase: [0.42, 0.46, 0.50],
    ringTint: [0.16, 0.19, 0.24],
    actorColor: [0.16, 0.20, 0.26, 0.40],
    cssBg: 'linear-gradient(180deg, #7e94ad 0%, #99acc0 60%, #7d878f 100%)',
  },
  passthrough: {
    id: 'passthrough',
    label: '패스스루 (실내)',
    clear: [0.27, 0.25, 0.23, 1.0],
    floorBase: [0.30, 0.28, 0.25],
    ringTint: [0.85, 0.80, 0.70],
    actorColor: [0.84, 0.80, 0.74, 0.28],
    cssBg: 'radial-gradient(circle at 50% 35%, #554f48 0%, #383430 80%)',
  },
});

export function ortho(halfW, halfH, near = 0.05, far = 40) {
  const lr = 1 / Math.max(1e-4, halfW);
  const bt = 1 / Math.max(1e-4, halfH);
  const nf = 1 / (near - far);
  return new Float32Array([
    lr, 0, 0, 0,
    0, bt, 0, 0,
    0, 0, 2 * nf, 0,
    0, 0, (far + near) * nf, 1,
  ]);
}

// VR 1인칭 시점 시야 가림·화이트아웃 위험도 계산 (Quest 3S 멀미/눈부심 방지 가이드)
export function evaluateViewSafety(engine, viewId) {
  const m = engine.metrics;
  if (viewId === 'vr-1p') {
    const addRatio = m.addSplats / Math.max(1, m.splatCount);
    const blinding = m.estOverdraw > 2.6 && addRatio > 0.65;
    const crowded = m.estOverdraw > 3.6;
    if (blinding) {
      return {
        level: 'warn',
        text: 'VR 눈부심 주의: 가산(ADD) 오버드로우가 높아 1인칭 중앙 시야가 하얗게 탈 수 있습니다.',
      };
    }
    if (crowded) {
      return {
        level: 'warn',
        text: 'VR 시야 가림 주의: 손앞 근거리 스플랫 면적이 넓습니다. 크기나 투명도를 줄여보세요.',
      };
    }
    return { level: 'ok', text: 'VR 1인칭 시야 안전 범위 (Quest 3S 72fps)' };
  }
  return { level: 'ok', text: VIEW_PRESETS[viewId]?.hint || '' };
}
