// 자연어(한국어/영어) → 멀티-레이어 Quest 3S 시뮬레이션 VFX 레시피 컴파일러 + 6종 레퍼런스 프리셋.
// API 키 없이도 어떤 프롬프트든 "네온 직선"이 아닌 3~5 레이어 물리·광학 시뮬레이션 레시피와
// 맞춤 슬라이더 세트로 컴파일한다.
import { SPLAT_FEEL_PRESETS, normalizeRecipe, applyQuestBudget } from './schema.js';

export const SHOWCASE_PRESETS = [
  {
    id: 'dokkaebi-flame',
    name: '도깨비불 흑염 소용돌이',
    archetype: 'fire',
    prompt: '검은 연기와 불꽃이 소용돌이치며 솟구치는 도깨비불, 튀는 불티와 바닥 열기 파동',
    summary: '어두운 그을음 연기(Alpha) + 흑체 복사 난류 화염 + 나선 불길 아크 + 튀는 불티 + 바닥 열파 5레이어',
    scale: 1.0,
    timeScale: 1.0,
    floorY: -0.42,
    floorGlow: 1.05,
    floorColor: '#f05a1e',
    loopPeriod: 2.8,
    timing: { anticipation: 0.14, impact: 0.24, decay: 1.8 },
    feel: { ...SPLAT_FEEL_PRESETS.Ember, weight: 0.14, viscosity: 0.28, bounce: 0.48 },
    layers: [
      {
        id: 'soot_smoke', name: '흑염 그을음 연기', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'sphere', count: 320, rate: 110, burst: 0, radius: 0.20, height: 0.18,
        lifeMin: 1.1, lifeMax: 2.4, sizeStart: 0.055, sizeEnd: 0.145, stretch: 1.15,
        speed: 0.35, spread: 0.9, gravity: -0.58, drag: 1.4, curlAmp: 1.35, curlFreq: 1.7,
        vortex: 1.35, radial: 0.22, homeSpring: 0, floorBounce: 0, subEmit: 0,
        origin: [0, -0.10, 0],
        colorCore: '#1c1816', colorRim: '#0a0b0e', opacity: 0.62, emission: 0.08, erosion: 0.45, glint: 0.0,
      },
      {
        id: 'flame_body', name: '난류 화염 볼륨', type: 'emitter', kernel: 'flame', blend: 'additive',
        shape: 'cone', count: 520, rate: 260, burst: 0, radius: 0.16, height: 0.12,
        lifeMin: 0.45, lifeMax: 1.15, sizeStart: 0.048, sizeEnd: 0.015, stretch: 2.1,
        speed: 0.72, spread: 0.65, gravity: -1.35, drag: 0.95, curlAmp: 1.65, curlFreq: 2.6,
        vortex: 1.85, radial: -0.25, homeSpring: 0, floorBounce: 0.1, subEmit: 0,
        origin: [0, -0.18, 0],
        colorCore: '#fff6d1', colorRim: '#e03912', opacity: 0.92, emission: 1.95, erosion: 0.46, glint: 0.2,
      },
      {
        id: 'flame_tendrils', name: '휘감기는 불길 촉수', type: 'arc', mode: 'helix', kernel: 'flame', blend: 'additive',
        strands: 6, segments: 34, radius: 0.24, height: 0.58, helixTurns: 1.9, helixRadius: 0.085,
        jitter: 0.055, flowSpeed: 1.75, width: 0.019, branches: 2, origin: [0, -0.22, 0],
        colorCore: '#fff3c4', colorRim: '#ff521b', opacity: 0.85, emission: 2.1, erosion: 0.36, glint: 0.1,
      },
      {
        id: 'ember_sparks', name: '비산 불티 & 바닥 튕김', type: 'emitter', kernel: 'matter', blend: 'additive',
        shape: 'sphere', count: 260, rate: 85, burst: 48, radius: 0.12, height: 0.10,
        lifeMin: 0.85, lifeMax: 2.1, sizeStart: 0.013, sizeEnd: 0.004, stretch: 3.4,
        speed: 1.25, spread: 1.6, gravity: 1.65, drag: 0.65, curlAmp: 1.9, curlFreq: 3.2,
        vortex: 1.1, radial: 0.35, homeSpring: 0, floorBounce: 0.55, subEmit: 1,
        origin: [0, -0.05, 0],
        colorCore: '#fff9e0', colorRim: '#ff7a24', opacity: 1.0, emission: 2.4, erosion: 0.15, glint: 0.9,
      },
      {
        id: 'heat_wave', name: '바닥 열기 파동', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 64, radiusStart: 0.08, radiusEnd: 0.82, thickness: 0.036, period: 2.4, swirl: 1.5, tilt: 0,
        origin: [0, -0.40, 0],
        colorCore: '#ffd99e', colorRim: '#d93d14', opacity: 0.68, emission: 1.45, erosion: 0.42, glint: 0.15,
      },
    ],
    controls: [
      { label: '화염 난류 (Curl)', path: 'layers.1.curlAmp', min: 0, max: 3.5, step: 0.05, group: '시뮬레이션' },
      { label: '소용돌이 회전', path: 'layers.1.vortex', min: -4.5, max: 4.5, step: 0.1, group: '시뮬레이션' },
      { label: '상승 열기 (중력)', path: 'layers.1.gravity', min: -3.0, max: 1.0, step: 0.05, group: '시뮬레이션' },
      { label: '촉수 지글거림', path: 'layers.2.jitter', min: 0, max: 0.18, step: 0.005, group: '곡선 에너지' },
      { label: '불티 튕김 (탄성)', path: 'layers.3.floorBounce', min: 0, max: 0.95, step: 0.05, group: '2차 입자' },
      { label: '연기 농도', path: 'layers.0.opacity', min: 0, max: 1.2, step: 0.04, group: '쉐이더' },
      { label: '화염 침식 (Erosion)', path: 'layers.1.erosion', min: 0.05, max: 0.9, step: 0.02, group: '쉐이더' },
      { label: '바닥 반사광', path: 'floorGlow', min: 0, max: 1.8, step: 0.05, group: '광학' },
    ],
  },

  {
    id: 'azure-lightning-slash',
    name: '청룡 뇌전 참격',
    archetype: 'lightning',
    prompt: '날카로운 푸른 번개가 분기하며 찢어지는 검기 참격, 이온 안개와 튀는 전기 스파크',
    summary: '분기 뇌전 아크(Electric) + 날카로운 호형 참격(Blade) + Curl 스파크 + 저채도 이온 연무 + 충격파',
    scale: 1.05,
    timeScale: 1.1,
    floorY: -0.42,
    floorGlow: 1.15,
    floorColor: '#3699ff',
    loopPeriod: 2.1,
    timing: { anticipation: 0.09, impact: 0.16, decay: 1.45 },
    feel: { ...SPLAT_FEEL_PRESETS.Sand, weight: 0.22, cohesion: 0.15, viscosity: 0.18, bounce: 0.72 },
    layers: [
      {
        id: 'ion_mist', name: '이온 암운 연무', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'ring', count: 240, rate: 95, burst: 30, radius: 0.34, height: 0.12,
        lifeMin: 0.9, lifeMax: 1.9, sizeStart: 0.06, sizeEnd: 0.14, stretch: 1.25,
        speed: 0.28, spread: 1.1, gravity: -0.15, drag: 1.6, curlAmp: 1.1, curlFreq: 1.9,
        vortex: 1.6, radial: 0.3, homeSpring: 0, floorBounce: 0, subEmit: 0,
        origin: [0, 0.0, 0],
        colorCore: '#182b44', colorRim: '#0a1220', opacity: 0.54, emission: 0.25, erosion: 0.4, glint: 0,
      },
      {
        id: 'bolt_branches', name: '분기 뇌전 줄기', type: 'arc', mode: 'bolt', kernel: 'electric', blend: 'additive',
        strands: 6, segments: 38, radius: 0.44, height: 0.56, helixTurns: 0.9, helixRadius: 0.07,
        jitter: 0.115, flowSpeed: 3.4, width: 0.015, branches: 4, origin: [0, -0.02, 0],
        colorCore: '#f2fbff', colorRim: '#2484ff', opacity: 1.0, emission: 2.6, erosion: 0.28, glint: 0.4,
      },
      {
        id: 'blade_slash', name: '날카로운 호형 참격', type: 'arc', mode: 'slash', kernel: 'blade', blend: 'additive',
        strands: 4, segments: 36, radius: 0.52, height: 0.24, helixTurns: 0.65, helixRadius: 0.04,
        jitter: 0.028, flowSpeed: 2.3, width: 0.022, branches: 1, origin: [0, 0.04, 0],
        colorCore: '#ffffff', colorRim: '#58c4ff', opacity: 0.95, emission: 2.4, erosion: 0.22, glint: 0.5,
      },
      {
        id: 'arc_sparks', name: '고속 전기 스파크', type: 'emitter', kernel: 'blade', blend: 'additive',
        shape: 'ring', count: 340, rate: 140, burst: 90, radius: 0.28, height: 0.14,
        lifeMin: 0.35, lifeMax: 1.15, sizeStart: 0.012, sizeEnd: 0.004, stretch: 4.8,
        speed: 1.75, spread: 1.8, gravity: 2.4, drag: 0.75, curlAmp: 2.2, curlFreq: 3.8,
        vortex: 1.4, radial: 0.65, homeSpring: 0, floorBounce: 0.68, subEmit: 2,
        origin: [0, 0.02, 0],
        colorCore: '#ffffff', colorRim: '#4db8ff', opacity: 1.0, emission: 2.5, erosion: 0.12, glint: 1.1,
      },
      {
        id: 'thunder_ring', name: '뇌격 충격파', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 76, radiusStart: 0.06, radiusEnd: 0.98, thickness: 0.032, period: 2.1, swirl: 2.2, tilt: 0.22,
        origin: [0, -0.36, 0],
        colorCore: '#e6f7ff', colorRim: '#1f7aff', opacity: 0.86, emission: 2.0, erosion: 0.32, glint: 0.3,
      },
    ],
    controls: [
      { label: '번개 꺾임 (Jitter)', path: 'layers.1.jitter', min: 0.01, max: 0.24, step: 0.005, group: '뇌전' },
      { label: '잔가지 분기 수', path: 'layers.1.branches', min: 0, max: 6, step: 1, group: '뇌전' },
      { label: '참격 반경', path: 'layers.2.radius', min: 0.2, max: 0.95, step: 0.02, group: '참격' },
      { label: '스파크 난류', path: 'layers.3.curlAmp', min: 0, max: 4.0, step: 0.1, group: '스파크' },
      { label: '스파크 신축 (Stretch)', path: 'layers.3.stretch', min: 1.0, max: 7.0, step: 0.2, group: '스파크' },
      { label: '충격파 주기', path: 'layers.4.period', min: 0.7, max: 4.5, step: 0.1, group: '타이밍' },
      { label: '코어 발광', path: 'layers.1.emission', min: 0.6, max: 3.2, step: 0.1, group: '광학' },
    ],
  },

  {
    id: 'rift-portal',
    name: '황금 차원 균열 포털',
    archetype: 'portal',
    prompt: '금빛 스파크가 원형으로 휘감아 돌며 열리고 안쪽에 어두운 공간 왜곡 안개가 흐르는 차원문 포털',
    summary: '어두운 중심 공간 안개(Alpha) + 링 소용돌이 불티(SplatSim) + 궤도 헬릭스 아크 + 외곽 불꽃 파편',
    scale: 1.0,
    timeScale: 1.0,
    floorY: -0.46,
    floorGlow: 0.95,
    floorColor: '#f59c36',
    loopPeriod: 3.4,
    timing: { anticipation: 0.2, impact: 0.3, decay: 2.2 },
    feel: { ...SPLAT_FEEL_PRESETS.Sand, weight: 0.32, cohesion: 0.35, viscosity: 0.24, bounce: 0.62 },
    layers: [
      {
        id: 'void_core', name: '차원 내부 암흑 안개', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'sphere', count: 220, rate: 85, burst: 0, radius: 0.28, height: 0.28,
        lifeMin: 1.2, lifeMax: 2.5, sizeStart: 0.095, sizeEnd: 0.06, stretch: 1.15,
        speed: 0.14, spread: 1.4, gravity: 0.0, drag: 1.9, curlAmp: 0.65, curlFreq: 1.8,
        vortex: 2.2, radial: -0.65, homeSpring: 0.25, floorBounce: 0, subEmit: 0,
        origin: [0, 0.06, 0],
        colorCore: '#14171f', colorRim: '#090b10', opacity: 0.74, emission: 0.05, erosion: 0.38, glint: 0,
      },
      {
        id: 'portal_orbit', name: '황금 궤도 스트림', type: 'arc', mode: 'orbit', kernel: 'blade', blend: 'additive',
        strands: 8, segments: 34, radius: 0.42, height: 0.06, helixTurns: 2.4, helixRadius: 0.048,
        jitter: 0.032, flowSpeed: 2.2, width: 0.015, branches: 1, origin: [0, 0.06, 0],
        colorCore: '#fff6d8', colorRim: '#f08222', opacity: 0.94, emission: 2.1, erosion: 0.3, glint: 0.45,
      },
      {
        id: 'ring_sparks', name: '접선 비산 스파크', type: 'emitter', kernel: 'matter', blend: 'additive',
        shape: 'torus', count: 540, rate: 260, burst: 0, radius: 0.42, height: 0.05,
        lifeMin: 0.45, lifeMax: 1.35, sizeStart: 0.015, sizeEnd: 0.004, stretch: 4.2,
        speed: 0.85, spread: 0.55, gravity: 1.95, drag: 0.72, curlAmp: 1.25, curlFreq: 2.8,
        vortex: 3.4, radial: 0.58, homeSpring: 0, floorBounce: 0.62, subEmit: 1,
        origin: [0, 0.06, 0],
        colorCore: '#fff8de', colorRim: '#ff7d1a', opacity: 1.0, emission: 2.35, erosion: 0.14, glint: 1.0,
      },
      {
        id: 'edge_flame', name: '가장자리 열기 플라즈마', type: 'emitter', kernel: 'flame', blend: 'additive',
        shape: 'torus', count: 280, rate: 130, burst: 0, radius: 0.41, height: 0.05,
        lifeMin: 0.38, lifeMax: 0.92, sizeStart: 0.042, sizeEnd: 0.014, stretch: 1.75,
        speed: 0.32, spread: 0.8, gravity: -0.35, drag: 1.3, curlAmp: 1.15, curlFreq: 2.5,
        vortex: 2.6, radial: 0.12, homeSpring: 0, floorBounce: 0, subEmit: 0,
        origin: [0, 0.06, 0],
        colorCore: '#ffefc2', colorRim: '#d94816', opacity: 0.75, emission: 1.65, erosion: 0.52, glint: 0.2,
      },
    ],
    controls: [
      { label: '포털 반경', path: 'layers.1.radius', min: 0.2, max: 0.85, step: 0.02, group: '포털' },
      { label: '스파크 회전 속도', path: 'layers.2.vortex', min: -5, max: 5, step: 0.1, group: '시뮬레이션' },
      { label: '접선 방출 (Radial)', path: 'layers.2.radial', min: -1.5, max: 2.5, step: 0.05, group: '시뮬레이션' },
      { label: '스파크 중력', path: 'layers.2.gravity', min: -1.0, max: 4.5, step: 0.1, group: '시뮬레이션' },
      { label: '궤도 흔들림', path: 'layers.1.jitter', min: 0, max: 0.14, step: 0.004, group: '곡선 에너지' },
      { label: '바닥 튕김', path: 'layers.2.floorBounce', min: 0, max: 0.95, step: 0.05, group: '충돌' },
      { label: '내부 암흑 안개', path: 'layers.0.opacity', min: 0, max: 1.2, step: 0.05, group: '쉐이더' },
    ],
  },

  {
    id: 'ink-crow-burst',
    name: '수묵 먹깃털 소환진',
    archetype: 'ink',
    prompt: '농묵 먹물 방울과 깃털이 한지 안개 속에서 휘몰아치며 주홍 인장과 날카로운 백광 참격이 터지는 소환',
    summary: '농묵 먹깃털(Matter Alpha) + 담묵 한지 운기(Mist) + 주홍/백광 참격 아크 + 비산 먹방울 + 인장 파동',
    scale: 1.0,
    timeScale: 0.95,
    floorY: -0.42,
    floorGlow: 0.45,
    floorColor: '#c93822',
    loopPeriod: 3.0,
    timing: { anticipation: 0.18, impact: 0.2, decay: 2.0 },
    feel: { ...SPLAT_FEEL_PRESETS.Fur, weight: 0.24, cohesion: 0.48, viscosity: 0.42, grain: 0.9, fluff: 0.82 },
    layers: [
      {
        id: 'ink_feathers', name: '농묵 먹깃털 군집', type: 'emitter', kernel: 'matter', blend: 'alpha',
        shape: 'ring', count: 520, rate: 170, burst: 90, radius: 0.34, height: 0.12,
        lifeMin: 0.95, lifeMax: 2.2, sizeStart: 0.026, sizeEnd: 0.012, stretch: 3.2,
        speed: 0.72, spread: 1.1, gravity: 0.28, drag: 1.25, curlAmp: 1.45, curlFreq: 2.2,
        vortex: 2.1, radial: 0.2, homeSpring: 0.18, floorBounce: 0.15, subEmit: 1,
        origin: [0, 0.0, 0],
        colorCore: '#0c0f12', colorRim: '#2c393c', opacity: 0.95, emission: 0.04, erosion: 0.36, glint: 0.12,
      },
      {
        id: 'sumi_mist', name: '담묵 운기 안개', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'sphere', count: 240, rate: 80, burst: 0, radius: 0.32, height: 0.18,
        lifeMin: 1.4, lifeMax: 2.9, sizeStart: 0.075, sizeEnd: 0.15, stretch: 1.4,
        speed: 0.24, spread: 1.2, gravity: -0.18, drag: 1.6, curlAmp: 0.95, curlFreq: 1.5,
        vortex: 1.15, radial: 0.18, homeSpring: 0, floorBounce: 0, subEmit: 0,
        origin: [0, -0.08, 0],
        colorCore: '#d9ddd4', colorRim: '#6d7874', opacity: 0.36, emission: 0.15, erosion: 0.42, glint: 0,
      },
      {
        id: 'cinnabar_slash', name: '주홍 인장 · 백광 참격', type: 'arc', mode: 'slash', kernel: 'blade', blend: 'additive',
        strands: 5, segments: 34, radius: 0.44, height: 0.22, helixTurns: 1.25, helixRadius: 0.055,
        jitter: 0.034, flowSpeed: 2.1, width: 0.014, branches: 1, origin: [0, 0.02, 0],
        colorCore: '#fff9e6', colorRim: '#d43a20', opacity: 0.9, emission: 1.95, erosion: 0.25, glint: 0.3,
      },
      {
        id: 'seal_wave', name: '소환진 확산 파동', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 72, radiusStart: 0.10, radiusEnd: 0.90, thickness: 0.028, period: 3.0, swirl: 1.1, tilt: 0,
        origin: [0, -0.35, 0],
        colorCore: '#fff2d2', colorRim: '#b8321c', opacity: 0.72, emission: 1.5, erosion: 0.38, glint: 0.2,
      },
    ],
    controls: [
      { label: '먹깃털 난류', path: 'layers.0.curlAmp', min: 0, max: 3.2, step: 0.05, group: '수묵 시뮬' },
      { label: '먹깃털 소용돌이', path: 'layers.0.vortex', min: -4, max: 4, step: 0.1, group: '수묵 시뮬' },
      { label: '형태 복원 (HomeSpring)', path: 'layers.0.homeSpring', min: 0, max: 0.9, step: 0.05, group: '수묵 시뮬' },
      { label: '깃털 신축 (Stretch)', path: 'layers.0.stretch', min: 1.0, max: 5.5, step: 0.1, group: '형태' },
      { label: '담묵 안개 농도', path: 'layers.1.opacity', min: 0, max: 0.9, step: 0.03, group: '쉐이더' },
      { label: '주홍 참격 발광', path: 'layers.2.emission', min: 0.2, max: 3.0, step: 0.1, group: '광학' },
    ],
  },

  {
    id: 'frost-crystal-nova',
    name: '서리 결정 폭발 노바',
    archetype: 'frost',
    prompt: '차가운 서리 안개가 응축되었다가 반짝이는 얼음 결정 파편과 육각 충격파로 터져 나오는 노바',
    summary: '마이크로패싯 반짝임 얼음 파편(Matter+Glint) + 냉기 하강 안개 + 결정 파열 아크 + 서리 충격파',
    scale: 1.0,
    timeScale: 0.95,
    floorY: -0.42,
    floorGlow: 0.85,
    floorColor: '#6bd2ff',
    loopPeriod: 2.9,
    timing: { anticipation: 0.22, impact: 0.18, decay: 2.1 },
    feel: { ...SPLAT_FEEL_PRESETS.Starch, weight: 0.55, cohesion: 0.38, viscosity: 0.35, bounce: 0.75, grain: 0.95 },
    layers: [
      {
        id: 'frost_mist', name: '하강 냉기 서리 안개', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'sphere', count: 280, rate: 105, burst: 40, radius: 0.24, height: 0.16,
        lifeMin: 1.1, lifeMax: 2.4, sizeStart: 0.06, sizeEnd: 0.15, stretch: 1.1,
        speed: 0.42, spread: 1.5, gravity: 0.42, drag: 1.75, curlAmp: 0.95, curlFreq: 1.6,
        vortex: 0.75, radial: 0.45, homeSpring: 0, floorBounce: 0.05, subEmit: 0,
        origin: [0, 0.02, 0],
        colorCore: '#d9f4ff', colorRim: '#4a8cb5', opacity: 0.42, emission: 0.35, erosion: 0.45, glint: 0.3,
      },
      {
        id: 'ice_shards', name: '반짝이는 얼음 결정 파편', type: 'emitter', kernel: 'matter', blend: 'additive',
        shape: 'sphere', count: 440, rate: 120, burst: 140, radius: 0.14, height: 0.14,
        lifeMin: 0.75, lifeMax: 1.95, sizeStart: 0.021, sizeEnd: 0.008, stretch: 2.35,
        speed: 1.35, spread: 2.4, gravity: 1.85, drag: 0.92, curlAmp: 0.85, curlFreq: 2.6,
        vortex: 0.85, radial: 0.72, homeSpring: 0, floorBounce: 0.72, subEmit: 2,
        origin: [0, 0.04, 0],
        colorCore: '#ffffff', colorRim: '#5cc8ff', opacity: 0.95, emission: 1.65, erosion: 0.22, glint: 1.75,
      },
      {
        id: 'crystal_cracks', name: '결정 균열 섬광', type: 'arc', mode: 'bolt', kernel: 'blade', blend: 'additive',
        strands: 6, segments: 28, radius: 0.48, height: 0.32, helixTurns: 0.35, helixRadius: 0.03,
        jitter: 0.072, flowSpeed: 1.45, width: 0.013, branches: 3, origin: [0, 0.04, 0],
        colorCore: '#ffffff', colorRim: '#78dbff', opacity: 0.88, emission: 2.05, erosion: 0.3, glint: 1.2,
      },
      {
        id: 'frost_wave', name: '지표 서리 확산 링', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 76, radiusStart: 0.04, radiusEnd: 1.05, thickness: 0.045, period: 2.9, swirl: 0.65, tilt: 0,
        origin: [0, -0.40, 0],
        colorCore: '#f0fbff', colorRim: '#3ea8e8', opacity: 0.82, emission: 1.75, erosion: 0.4, glint: 0.9,
      },
    ],
    controls: [
      { label: '결정 반짝임 (Glint)', path: 'layers.1.glint', min: 0, max: 2.0, step: 0.05, group: '광학' },
      { label: '파편 폭발 속도', path: 'layers.1.speed', min: 0.2, max: 3.0, step: 0.05, group: '폭발' },
      { label: '파편 바닥 튕김', path: 'layers.1.floorBounce', min: 0, max: 0.95, step: 0.05, group: '물리' },
      { label: '냉기 하강 중력', path: 'layers.0.gravity', min: -0.8, max: 1.6, step: 0.05, group: '물리' },
      { label: '균열 각짐 (Jitter)', path: 'layers.2.jitter', min: 0.01, max: 0.18, step: 0.005, group: '균열' },
      { label: '서리 링 반경', path: 'layers.3.radiusEnd', min: 0.35, max: 1.8, step: 0.05, group: '충격파' },
    ],
  },

  {
    id: 'yunseul-water-aura',
    name: '윤슬 물보라 · 반짝임 오라',
    archetype: 'water',
    prompt: '햇살에 반짝이는 윤슬 물방울이 부드럽게 맴돌며 물결 파동과 촉촉한 비말이 튀는 오라',
    summary: '유체 물방울 군집(Water SplatFeel + SplatGlint) + 나선 물줄기 리본 + 미세 수증기 + 수면 잔물결',
    scale: 1.0,
    timeScale: 0.9,
    floorY: -0.42,
    floorGlow: 0.75,
    floorColor: '#4cc4d4',
    loopPeriod: 3.2,
    timing: { anticipation: 0.16, impact: 0.26, decay: 2.2 },
    feel: { ...SPLAT_FEEL_PRESETS.Water, cohesion: 0.38, viscosity: 0.16, bounce: 0.52, grain: 0.42 },
    layers: [
      {
        id: 'water_spray', name: '윤슬 물방울 비말', type: 'emitter', kernel: 'matter', blend: 'additive',
        shape: 'torus', count: 520, rate: 210, burst: 30, radius: 0.34, height: 0.14,
        lifeMin: 0.8, lifeMax: 2.0, sizeStart: 0.019, sizeEnd: 0.007, stretch: 2.6,
        speed: 0.65, spread: 1.2, gravity: 1.15, drag: 0.85, curlAmp: 1.3, curlFreq: 2.1,
        vortex: 1.85, radial: 0.18, homeSpring: 0.24, floorBounce: 0.45, subEmit: 2,
        origin: [0, -0.02, 0],
        colorCore: '#f2ffff', colorRim: '#2ca9c9', opacity: 0.88, emission: 1.45, erosion: 0.24, glint: 1.85,
      },
      {
        id: 'water_ribbon', name: '휘감기는 물줄기 나선', type: 'arc', mode: 'helix', kernel: 'blade', blend: 'additive',
        strands: 5, segments: 38, radius: 0.36, height: 0.46, helixTurns: 2.2, helixRadius: 0.075,
        jitter: 0.024, flowSpeed: 1.4, width: 0.02, branches: 0, origin: [0, -0.18, 0],
        colorCore: '#e8ffff', colorRim: '#2d9bb8', opacity: 0.72, emission: 1.35, erosion: 0.34, glint: 1.1,
      },
      {
        id: 'sea_mist', name: '촉촉한 수증기 안개', type: 'emitter', kernel: 'mist', blend: 'alpha',
        shape: 'ring', count: 220, rate: 75, burst: 0, radius: 0.36, height: 0.12,
        lifeMin: 1.2, lifeMax: 2.6, sizeStart: 0.07, sizeEnd: 0.14, stretch: 1.3,
        speed: 0.25, spread: 1.0, gravity: -0.15, drag: 1.5, curlAmp: 0.9, curlFreq: 1.4,
        vortex: 1.05, radial: 0.2, homeSpring: 0, floorBounce: 0, subEmit: 0,
        origin: [0, -0.18, 0],
        colorCore: '#d8f2f5', colorRim: '#3f7c8a', opacity: 0.32, emission: 0.2, erosion: 0.4, glint: 0.2,
      },
      {
        id: 'water_ripple', name: '수면 잔물결', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 68, radiusStart: 0.08, radiusEnd: 0.96, thickness: 0.032, period: 2.6, swirl: 0.7, tilt: 0,
        origin: [0, -0.40, 0],
        colorCore: '#e8feff', colorRim: '#38b5cc', opacity: 0.72, emission: 1.3, erosion: 0.32, glint: 1.0,
      },
    ],
    controls: [
      { label: '윤슬 반짝임 (Glint)', path: 'layers.0.glint', min: 0, max: 2.0, step: 0.05, group: '윤슬 광학' },
      { label: '물보라 난류', path: 'layers.0.curlAmp', min: 0, max: 3.2, step: 0.05, group: '유체' },
      { label: '물결 소용돌이', path: 'layers.0.vortex', min: -4, max: 4, step: 0.1, group: '유체' },
      { label: '물줄기 감김', path: 'layers.1.helixTurns', min: -4, max: 4, step: 0.1, group: '물줄기' },
      { label: '물방울 복원력', path: 'layers.0.homeSpring', min: 0, max: 0.85, step: 0.05, group: '유체' },
      { label: '수면 파동 주기', path: 'layers.3.period', min: 0.8, max: 5.0, step: 0.1, group: '잔물결' },
    ],
  },
];

// 자연어 의미 매칭 테이블 (한국어 + 영어)
const ARCHETYPE_RULES = [
  { id: 'lightning', base: 'azure-lightning-slash', re: /(번개|뇌전|전기|벼락|스파크|플라즈마|검기|참격|레이저|lightning|thunder|electric|plasma|slash|bolt|arc)/i },
  { id: 'portal',    base: 'rift-portal',           re: /(포털|차원|워프|블랙홀|마법진|게이트|portal|rift|warp|vortex|black\s*hole|gate)/i },
  { id: 'ink',       base: 'ink-crow-burst',        re: /(수묵|먹물|먹|까마귀|깃털|한지|동양|붓|ink|sumi|crow|feather|calligraphy)/i },
  { id: 'frost',     base: 'frost-crystal-nova',    re: /(얼음|서리|눈|빙결|결정|크리스탈|유리|노바|frost|ice|snow|crystal|shard|glacier|nova)/i },
  { id: 'water',     base: 'yunseul-water-aura',    re: /(물|윤슬|파도|물보라|비말|거품|치유|힐|바다|water|wave|splash|droplet|ocean|heal|aqua)/i },
  { id: 'fire',      base: 'dokkaebi-flame',        re: /(불|화염|도깨비불|폭발|용암|불티|화구|불꽃|연기|fire|flame|inferno|explosion|ember|lava|pyro|smoke)/i },
];

const COLOR_MODIFIERS = [
  { name: '청록/시안', core: '#ebffff', rim: '#1cbcd4', floor: '#28c4d9', re: /(청록|시안|민트|옥색|에메랄드|cyan|teal|turquoise|aqua)/i },
  { name: '푸른/청색', core: '#eef8ff', rim: '#2078f0', floor: '#2a84ff', re: /(파란|푸른|청색|청룡|파랑|코발트|blue|azure|cobalt|sapphire)/i },
  { name: '에메랄드/녹색', core: '#eefff2', rim: '#22b862', floor: '#2cc96e', re: /(초록|녹색|독|비취|연두|숲|green|emerald|poison|toxic|jade)/i },
  { name: '붉은/주홍', core: '#fff2d8', rim: '#dc3218', floor: '#e84420', re: /(붉은|빨간|적색|주홍|핏빛|홍염|용암|red|crimson|scarlet|ruby)/i },
  { name: '황금/호박', core: '#fff9e0', rim: '#e69422', floor: '#f2a42e', re: /(금빛|황금|노란|호박|태양|신성|gold|golden|amber|solar|yellow|holy)/i },
  { name: '자주/보라', core: '#fff0fb', rim: '#9c36d4', floor: '#a642dc', re: /(보라|자주|마력|공허|은하|purple|violet|magenta|arcane|void)/i },
  { name: '벚꽃/분홍', core: '#fff4f7', rim: '#e86892', floor: '#eb749c', re: /(벚꽃|분홍|핑크|꽃잎|로즈|pink|sakura|rose|blossom|petal)/i },
  { name: '백색/은빛', core: '#ffffff', rim: '#a8bac9', floor: '#b8ccdc', re: /(하얀|백색|은빛|달빛|별빛|white|silver|moon|star)/i },
  { name: '흑염/암흑', core: '#242930', rim: '#0a0c10', floor: '#384050', re: /(검은|흑염|암흑|그림자|어둠|black|dark|shadow|obsidian)/i, darkOverride: true },
];

const FEEL_MODIFIERS = [
  { re: /(젤리|말랑|탱글|jelly|bouncy|rubbery)/i, feel: SPLAT_FEEL_PRESETS.Jelly },
  { re: /(슬라임|끈적|점액|점성|slime|sticky|goo|viscous)/i, feel: SPLAT_FEEL_PRESETS.Slime },
  { re: /(모래|먼지|가루|모래폭풍|sand|dust|powder|ash)/i, feel: SPLAT_FEEL_PRESETS.Sand },
  { re: /(털|깃털|솜털|부드러운|fur|fluff|feather|velvet)/i, feel: SPLAT_FEEL_PRESETS.Fur },
  { re: /(전분|단단|파열|갈라지|균열|starch|crack|brittle|shatter)/i, feel: SPLAT_FEEL_PRESETS.Starch },
  { re: /(꽃잎|나뭇잎|낙엽|leaf|petal|blossom|flutter)/i, feel: SPLAT_FEEL_PRESETS.Leaf },
  { re: /(물방울|액체|촉촉|water|liquid|wet|fluid)/i, feel: SPLAT_FEEL_PRESETS.Water },
];

export function getPresetById(id) {
  const found = SHOWCASE_PRESETS.find((p) => p.id === id) || SHOWCASE_PRESETS[0];
  return applyQuestBudget(normalizeRecipe(structuredClone(found))).recipe;
}

export function compilePrompt(promptText) {
  const prompt = String(promptText || '').trim();
  if (!prompt) return getPresetById('dokkaebi-flame');

  // 1. 기본 아키타입 선택
  const matchedArch = ARCHETYPE_RULES.find((r) => r.re.test(prompt));
  const baseTemplate = SHOWCASE_PRESETS.find((p) => p.id === (matchedArch?.base || 'dokkaebi-flame')) || SHOWCASE_PRESETS[0];
  const recipe = structuredClone(baseTemplate);
  recipe.id = `prompt-${Date.now().toString(36).slice(-5)}`;
  recipe.prompt = prompt;
  recipe.name = prompt.length > 26 ? `${prompt.slice(0, 26).trim()}…` : prompt;

  const notes = [];

  // 2. 색상 오버라이드 (흑염 같은 어두운 색은 alpha/smoke 레이어 강화, 밝은 색은 에너지 레이어에 반영)
  const matchedColors = COLOR_MODIFIERS.filter((c) => c.re.test(prompt));
  if (matchedColors.length > 0) {
    const primary = matchedColors.find((c) => !c.darkOverride) || matchedColors[0];
    const hasDark = matchedColors.some((c) => c.darkOverride);
    recipe.floorColor = primary.floor;
    notes.push(`색감:${primary.name}`);
    for (const l of recipe.layers) {
      if (l.blend === 'alpha' && l.kernel === 'mist') {
        if (hasDark) {
          l.colorCore = '#1b1d24';
          l.colorRim = '#090b0f';
          l.opacity = Math.min(0.88, l.opacity + 0.16);
        }
        continue;
      }
      if (!primary.darkOverride) {
        l.colorCore = primary.core;
        l.colorRim = primary.rim;
      } else if (l.blend === 'alpha') {
        l.colorCore = '#181c22';
        l.colorRim = '#07080b';
      }
    }
  }

  // 3. 물성(SplatFeel) 보정
  for (const fm of FEEL_MODIFIERS) {
    if (fm.re.test(prompt)) {
      recipe.feel = { ...fm.feel };
      notes.push('SplatFeel 물성 반영');
      break;
    }
  }

  // 4. 움직임 · 밀도 · 광학 수식어 반영
  if (/(폭발|터지|충격파|노바|burst|explod|blast|shockwave|impact)/i.test(prompt)) {
    notes.push('폭발 버스트');
    for (const l of recipe.layers) {
      if (l.type === 'emitter') {
        l.burst = Math.max(l.burst || 0, Math.round(l.count * 0.35));
        l.speed = Math.min(3.5, l.speed * 1.45);
        l.radial = Math.max(l.radial, 0.75);
      }
    }
    if (!recipe.layers.some((l) => l.type === 'wave')) {
      recipe.layers.push({
        id: 'prompt_wave', name: '충격파 링', type: 'wave', kernel: 'ring', blend: 'additive',
        splats: 72, radiusStart: 0.05, radiusEnd: 1.05, thickness: 0.038, period: 2.2, swirl: 1.4, tilt: 0,
        origin: [0, recipe.floorY + 0.04, 0],
        colorCore: recipe.layers[1]?.colorCore || '#fff4d6',
        colorRim: recipe.floorColor, opacity: 0.85, emission: 1.9, erosion: 0.35, glint: 0.3,
      });
    }
  }

  if (/(소용돌이|회오리|휘감|나선|토네이도|swirl|vortex|spiral|tornado|cyclone)/i.test(prompt)) {
    notes.push('강한 소용돌이');
    for (const l of recipe.layers) {
      if (l.type === 'emitter') {
        l.vortex = (l.vortex >= 0 ? 1 : -1) * Math.min(4.8, Math.abs(l.vortex) + 1.45);
        l.curlAmp = Math.min(3.4, l.curlAmp + 0.45);
      } else if (l.type === 'arc') {
        l.helixTurns = Math.min(4.2, Math.abs(l.helixTurns) + 1.1);
        l.helixRadius = Math.min(0.24, l.helixRadius + 0.035);
      }
    }
  }

  if (/(솟구치|상승|피어오르|기둥|pillar|rise|rising|ascend|upward)/i.test(prompt)) {
    notes.push('상승 기류');
    for (const l of recipe.layers) {
      if (l.type === 'emitter') l.gravity = Math.min(l.gravity, -1.15);
      if (l.type === 'arc') l.height = Math.max(l.height, 0.75);
    }
  }

  if (/(비|떨어지|낙하|흩날리|우박|눈발|rain|fall|falling|shower|drift)/i.test(prompt)) {
    notes.push('낙하/흩날림');
    for (const l of recipe.layers) {
      if (l.type === 'emitter') {
        l.gravity = Math.max(0.85, l.gravity + 0.9);
        l.origin = [0, 0.32, 0];
        l.radius = Math.max(0.42, l.radius);
      }
    }
  }

  if (/(반짝|윤슬|별빛|은하|보석|글린트|sparkle|glint|shimmer|star|galaxy|glitter)/i.test(prompt)) {
    notes.push('마이크로패싯 반짝임');
    for (const l of recipe.layers) {
      l.glint = Math.min(2.0, (l.glint || 0.2) + 0.95);
    }
  }

  if (/(느린|몽환|잔잔|고요|부드러운|slow|calm|gentle|dreamy|soft)/i.test(prompt)) {
    notes.push('느린 리듬');
    recipe.timeScale = 0.65;
  } else if (/(빠른|격렬|광폭|폭주|날카로운|fast|intense|fierce|violent|sharp)/i.test(prompt)) {
    notes.push('고속 격렬');
    recipe.timeScale = 1.35;
    for (const l of recipe.layers) {
      if (l.type === 'emitter') l.curlAmp = Math.min(3.5, l.curlAmp * 1.28);
      if (l.type === 'arc') l.jitter = Math.min(0.22, l.jitter * 1.3);
    }
  }

  if (/(거대한|광활|큰|giant|massive|huge|large)/i.test(prompt)) {
    recipe.scale = 1.35;
  } else if (/(미세한|작은|손바닥|아담|tiny|small|palm|subtle)/i.test(prompt)) {
    recipe.scale = 0.72;
  }

  // 벚꽃/꽃잎/별가루 요청 시 입자 커널을 matter + 부드러운 낙하로 특화
  if (/(벚꽃|꽃잎|낙엽|sakura|petal|blossom|leaf)/i.test(prompt)) {
    const primary = recipe.layers.find((l) => l.type === 'emitter');
    if (primary) {
      primary.kernel = 'matter';
      primary.blend = 'alpha';
      primary.stretch = 1.9;
      primary.gravity = 0.45;
      primary.curlAmp = 1.55;
      primary.colorCore = '#fff0f5';
      primary.colorRim = '#e86a92';
      primary.opacity = 0.95;
    }
  }

  recipe.summary = `${recipe.layers.length}개 시뮬레이션 레이어 · ${notes.length ? notes.join(' / ') : '다층 노이즈·난류·광학 합성'}`;

  const normalized = normalizeRecipe(recipe);
  const { recipe: budgeted } = applyQuestBudget(normalized);
  return budgeted;
}
