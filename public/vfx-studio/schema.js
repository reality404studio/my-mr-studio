// Unity meta-mr-picker/ritual의 SplatFeel(10축) + 멀티-레이어 VFX 레시피 스키마 v1.
// 브라우저에서 모은 모든 레시피와 슬라이더 튜닝 데이터가 그대로 Unity SplatTuning / VFX Composer로
// 이식될 수 있도록 1:1 호환 필드를 유지한다.

export const KERNEL_IDS = Object.freeze({
  matter: 0,
  flame: 1,
  mist: 2,
  blade: 3,
  electric: 4,
  ring: 5,
});

export const KERNEL_NAMES = Object.keys(KERNEL_IDS);

export const QUEST_BUDGET = Object.freeze({
  maxSplats: 4800,
  tightSplats: 3600,
  maxOverdrawArea: 4.5, // 합산 스플랫 면적(m^2) 상한 (Quest 3S 72fps 필레이트 가드)
  tightOverdrawArea: 3.1,
  targetMs: 13.8,
});

// meta-mr-picker/ritual/Assets/Scripts/Splatter/Sim/SplatFeel.cs 1:1 포트
export const SPLAT_FEEL_AXES = [
  { key: 'weight', label: '무게 (Weight)', min: 0, max: 1, step: 0.02, hint: '중력·낙하 감각' },
  { key: 'cohesion', label: '응집도 (Cohesion)', min: 0, max: 1, step: 0.02, hint: '입자 뭉침·클러스터 결합' },
  { key: 'viscosity', label: '점성 (Viscosity)', min: 0, max: 1, step: 0.02, hint: '감쇠·흐름 저항' },
  { key: 'bounce', label: '탄성 (Bounce)', min: 0, max: 1, step: 0.02, hint: '복원력·바닥 튕김' },
  { key: 'grain', label: '입자감 (Grain)', min: 0, max: 1, step: 0.02, hint: '거친 알갱이 ↔ 매끈한 유체' },
  { key: 'fluff', label: '깃/결 (Fluff)', min: 0, max: 1, step: 0.02, hint: '털·깃털 결 및 방향성' },
  { key: 'squish', label: '탄성체 (Squish)', min: 0, max: 1, step: 0.02, hint: '연속체 젤리 변형' },
  { key: 'plastic', label: '소성 (Plastic)', min: 0, max: 1, step: 0.02, hint: '밀린 형태가 남는 정도' },
  { key: 'tack', label: '끈적임 (Tack)', min: 0, max: 1, step: 0.02, hint: '손·표면에 들러붙는 힘' },
  { key: 'thicken', label: '전단 농화 (Thicken)', min: 0, max: 1, step: 0.02, hint: '빠르게 치면 단단해지는 저항' },
];

export const SPLAT_FEEL_PRESETS = Object.freeze({
  Water:  { weight: 0.2, cohesion: 0.2, viscosity: 0.1, bounce: 0.2, grain: 1.0, fluff: 0.0, squish: 0.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
  Sand:   { weight: 0.7, cohesion: 0.3, viscosity: 0.7, bounce: 0.8, grain: 1.0, fluff: 0.0, squish: 0.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
  Leaf:   { weight: 0.3, cohesion: 0.25, viscosity: 0.55, bounce: 0.35, grain: 0.65, fluff: 0.0, squish: 0.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
  Jelly:  { weight: 0.4, cohesion: 1.0, viscosity: 0.25, bounce: 0.9, grain: 0.0, fluff: 0.0, squish: 1.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
  Slime:  { weight: 0.5, cohesion: 0.9, viscosity: 0.8, bounce: 0.3, grain: 0.0, fluff: 0.0, squish: 1.0, plastic: 0.8, tack: 0.8, thicken: 0.0 },
  Starch: { weight: 0.8, cohesion: 0.5, viscosity: 0.6, bounce: 0.2, grain: 0.8, fluff: 0.0, squish: 1.0, plastic: 0.5, tack: 0.0, thicken: 1.0 },
  Fur:    { weight: 0.1, cohesion: 0.7, viscosity: 0.2, bounce: 0.7, grain: 1.0, fluff: 1.0, squish: 0.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
  Ember:  { weight: 0.08, cohesion: 0.18, viscosity: 0.22, bounce: 0.45, grain: 0.88, fluff: 0.15, squish: 0.0, plastic: 0.0, tack: 0.0, thicken: 0.0 },
});

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0));
const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};
const lerp = (a, b, t) => a + (b - a) * t;
const step = (edge, x) => (x < edge ? 0 : 1);

export function clampFeel(feel = {}) {
  return {
    weight: clamp01(feel.weight ?? 0.25),
    cohesion: clamp01(feel.cohesion ?? 0.3),
    viscosity: clamp01(feel.viscosity ?? 0.3),
    bounce: clamp01(feel.bounce ?? 0.4),
    grain: clamp01(feel.grain ?? 0.8),
    fluff: clamp01(feel.fluff ?? 0.0),
    squish: clamp01(feel.squish ?? 0.0),
    plastic: clamp01(feel.plastic ?? 0.0),
    tack: clamp01(feel.tack ?? 0.0),
    thicken: clamp01(feel.thicken ?? 0.0),
  };
}

// SplatFeelMap.Apply + Look + Morph (meta-mr-picker/ritual C#과 1:1 수식 일치)
export function compileSplatFeel(feel) {
  const f = clampFeel(feel);
  const slime = step(1e-3, f.tack) * step(0.5, f.squish);
  return {
    feel: f,
    sim: {
      homeStiffness: lerp(60, 320, f.bounce),
      homeDamping: lerp(1.5, 16, f.viscosity),
      maxSpringAccel: lerp(40, 14, f.weight),
      cohesion: f.cohesion,
      clusterStiffness: lerp(40, 160, f.cohesion),
      clusterDamping: lerp(1.5, 8, f.viscosity),
      clusterViscosity: lerp(0, 50, f.cohesion),
      clusterGather: lerp(0.9, 0.45, f.cohesion),
      handPush: lerp(90, 40, f.weight),
      handDrag: lerp(6, 30, f.viscosity),
      stickFraction: 0.25 * f.cohesion * (1 - f.grain) + 0.35 * f.tack,
      stickDecay: lerp(1.2, 0.25, f.tack),
      stickReach: lerp(0.06, 0.12, f.tack),
      field: f.squish,
      fieldStiffness: lerp(150, 900, f.bounce),
      fieldAnchor: lerp(2, 30, f.bounce),
      fieldDamping: lerp(0.6, 6, f.viscosity),
      fieldTack: f.tack,
      crack: f.thicken * step(0.5, f.squish),
      comb: f.fluff * (1 - step(0.5, f.squish)),
      plastic: lerp(0, 10, f.plastic),
      plasticYield: 0.02 * (1 - f.plastic) * (1 - f.plastic) + 0.001,
      thicken: f.thicken,
      thickenSpeed: 0.35,
      weight: f.weight * 3,
      fallGravity: lerp(1.2, 6, f.weight),
      fallDamping: lerp(0.2, 1.5, f.viscosity),
      bounce: f.bounce * 0.6,
      burstDamping: lerp(3.5, 7, f.viscosity),
      burstGravity: lerp(0, 5, f.weight),
      gatherRamp: lerp(0.18, 0.6, f.viscosity),
    },
    look: {
      grain: lerp(1, 0.45, f.grain),
      stretchMax: lerp(4, 0, f.grain) * (1 - 0.85 * slime),
      stretchSeconds: lerp(0.012, 0, f.grain) * (1 - 0.85 * slime),
      fluff: f.fluff,
      detach: lerp(0.012, 0.5, step(0.5, f.squish) * step(1e-3, f.tack + f.thicken)),
    },
    morph: {
      burstSpeed: lerp(0.3, 0.16, f.weight) * lerp(1.1, 0.85, f.viscosity),
      burstSeconds: lerp(0.32, 0.5, f.weight),
      gatherSpread: lerp(0.55, 1.1, f.grain),
      settleSeconds: lerp(0.5, 1.1, f.viscosity),
    },
  };
}

export function normalizeHex(hex, fallback = '#ffaa44') {
  if (typeof hex !== 'string') return fallback;
  const s = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgb01(hex) {
  const h = normalizeHex(hex, '#ffffff');
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

function normalizeLayer(raw = {}, idx = 0) {
  const type = ['emitter', 'arc', 'wave'].includes(raw.type) ? raw.type : 'emitter';
  const kernel = KERNEL_NAMES.includes(raw.kernel)
    ? raw.kernel
    : type === 'arc' ? 'blade' : type === 'wave' ? 'ring' : 'flame';
  const blend = raw.blend === 'alpha' || raw.blend === 'additive'
    ? raw.blend
    : (kernel === 'mist' || kernel === 'matter' ? 'alpha' : 'additive');

  const base = {
    id: String(raw.id || `layer_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
    name: String(raw.name || `Layer ${idx + 1}`).slice(0, 48),
    enabled: raw.enabled !== false,
    type,
    kernel,
    blend,
    colorCore: normalizeHex(raw.colorCore, '#fff3d6'),
    colorRim: normalizeHex(raw.colorRim, '#e05a28'),
    opacity: clampNum(raw.opacity, 0.02, 2.0, 0.85),
    emission: clampNum(raw.emission, 0.0, 3.5, blend === 'additive' ? 1.5 : 0.3),
    erosion: clampNum(raw.erosion, 0.0, 1.0, 0.35),
    glint: clampNum(raw.glint, 0.0, 2.0, kernel === 'matter' ? 0.55 : 0.15),
    delay: clampNum(raw.delay, 0, 5, 0),
  };

  if (type === 'emitter') {
    const shape = ['point', 'sphere', 'ring', 'cone', 'torus', 'spline'].includes(raw.shape) ? raw.shape : 'sphere';
    return {
      ...base,
      shape,
      count: Math.round(clampNum(raw.count, 16, 2200, 360)),
      rate: clampNum(raw.rate, 0, 1600, 180),
      burst: Math.round(clampNum(raw.burst, 0, 1200, 0)),
      radius: clampNum(raw.radius, 0.01, 2.2, 0.22),
      height: clampNum(raw.height, 0.0, 2.0, 0.12),
      lifeMin: clampNum(raw.lifeMin, 0.15, 8.0, 0.65),
      lifeMax: clampNum(raw.lifeMax, 0.2, 10.0, 1.65),
      sizeStart: clampNum(raw.sizeStart, 0.004, 0.45, 0.036),
      sizeEnd: clampNum(raw.sizeEnd, 0.002, 0.65, 0.012),
      stretch: clampNum(raw.stretch, 0.2, 8.0, 1.6),
      speed: clampNum(raw.speed, 0.0, 5.0, 0.65),
      spread: clampNum(raw.spread, 0.0, 3.14, 0.9),
      gravity: clampNum(raw.gravity, -6.0, 6.0, 0.45),
      drag: clampNum(raw.drag, 0.0, 8.0, 1.15),
      curlAmp: clampNum(raw.curlAmp, 0.0, 4.5, 0.95),
      curlFreq: clampNum(raw.curlFreq, 0.2, 8.0, 2.1),
      vortex: clampNum(raw.vortex, -6.0, 6.0, 0.9),
      radial: clampNum(raw.radial, -5.0, 5.0, 0.15),
      homeSpring: clampNum(raw.homeSpring, 0.0, 1.0, 0.0),
      floorBounce: clampNum(raw.floorBounce, 0.0, 1.0, 0.25),
      subEmit: Math.round(clampNum(raw.subEmit, 0, 4, 0)),
      origin: Array.isArray(raw.origin) && raw.origin.length === 3
        ? raw.origin.map((v) => clampNum(v, -2, 2, 0))
        : [0, 0, 0],
    };
  }

  if (type === 'arc') {
    return {
      ...base,
      strands: Math.round(clampNum(raw.strands, 1, 18, 5)),
      segments: Math.round(clampNum(raw.segments, 8, 96, 34)),
      radius: clampNum(raw.radius, 0.05, 1.8, 0.42),
      height: clampNum(raw.height, -1.2, 1.8, 0.55),
      helixTurns: clampNum(raw.helixTurns, -5, 5, 1.8),
      helixRadius: clampNum(raw.helixRadius, 0.0, 0.55, 0.09),
      jitter: clampNum(raw.jitter, 0.0, 0.35, 0.055),
      flowSpeed: clampNum(raw.flowSpeed, 0.1, 8.0, 1.6),
      width: clampNum(raw.width, 0.003, 0.12, 0.016),
      branches: Math.round(clampNum(raw.branches, 0, 6, 2)),
      mode: ['helix', 'orbit', 'bolt', 'slash'].includes(raw.mode) ? raw.mode : 'helix',
      origin: Array.isArray(raw.origin) && raw.origin.length === 3
        ? raw.origin.map((v) => clampNum(v, -2, 2, 0))
        : [0, 0, 0],
    };
  }

  // wave
  return {
    ...base,
    splats: Math.round(clampNum(raw.splats, 16, 220, 72)),
    radiusStart: clampNum(raw.radiusStart, 0.01, 0.8, 0.05),
    radiusEnd: clampNum(raw.radiusEnd, 0.15, 2.5, 0.88),
    thickness: clampNum(raw.thickness, 0.005, 0.22, 0.045),
    period: clampNum(raw.period, 0.4, 8.0, 2.2),
    swirl: clampNum(raw.swirl, -5.0, 5.0, 1.2),
    tilt: clampNum(raw.tilt, -1.57, 1.57, 0.0),
    origin: Array.isArray(raw.origin) && raw.origin.length === 3
      ? raw.origin.map((v) => clampNum(v, -2, 2, 0))
      : [0, -0.25, 0],
  };
}

export function buildDefaultControls(recipe) {
  const controls = [];
  const layers = recipe.layers || [];
  const firstEmitter = layers.findIndex((l) => l.type === 'emitter');
  const firstArc = layers.findIndex((l) => l.type === 'arc');
  const firstWave = layers.findIndex((l) => l.type === 'wave');

  controls.push(
    { label: '전체 규모', path: 'scale', min: 0.4, max: 1.8, step: 0.05, group: '전체' },
    { label: '재생 속도', path: 'timeScale', min: 0.2, max: 2.2, step: 0.05, group: '전체' },
    { label: '바닥 반사광', path: 'floorGlow', min: 0, max: 1.6, step: 0.05, group: '광학' },
  );

  if (firstEmitter >= 0) {
    const p = `layers.${firstEmitter}`;
    controls.push(
      { label: `${layers[firstEmitter].name} · 난류(Curl)`, path: `${p}.curlAmp`, min: 0, max: 3.5, step: 0.05, group: '시뮬레이션' },
      { label: `${layers[firstEmitter].name} · 소용돌이`, path: `${p}.vortex`, min: -4.5, max: 4.5, step: 0.1, group: '시뮬레이션' },
      { label: `${layers[firstEmitter].name} · 입자 크기`, path: `${p}.sizeStart`, min: 0.006, max: 0.18, step: 0.002, group: '형태' },
      { label: `${layers[firstEmitter].name} · 알파 침식`, path: `${p}.erosion`, min: 0, max: 0.95, step: 0.02, group: '쉐이더' },
    );
  }
  if (firstArc >= 0) {
    const p = `layers.${firstArc}`;
    controls.push(
      { label: `${layers[firstArc].name} · 지글거림`, path: `${p}.jitter`, min: 0, max: 0.25, step: 0.005, group: '곡선 에너지' },
      { label: `${layers[firstArc].name} · 나선 감김`, path: `${p}.helixTurns`, min: -4, max: 4, step: 0.1, group: '곡선 에너지' },
      { label: `${layers[firstArc].name} · 코어 발광`, path: `${p}.emission`, min: 0.3, max: 3.0, step: 0.05, group: '광학' },
    );
  }
  if (firstWave >= 0) {
    const p = `layers.${firstWave}`;
    controls.push(
      { label: `${layers[firstWave].name} · 확산 반경`, path: `${p}.radiusEnd`, min: 0.25, max: 2.0, step: 0.05, group: '충격파' },
    );
  }
  return controls;
}

export function normalizeRecipe(raw = {}) {
  const layersRaw = Array.isArray(raw.layers) && raw.layers.length > 0
    ? raw.layers.slice(0, 8)
    : [{ id: 'core', name: 'Energy Core', type: 'emitter', kernel: 'flame', blend: 'additive' }];

  const layers = layersRaw.map((l, i) => normalizeLayer(l, i));
  const feel = clampFeel(raw.feel || SPLAT_FEEL_PRESETS.Ember);

  const recipe = {
    schemaVersion: 'vfx-recipe/1',
    id: String(raw.id || 'custom-vfx').replace(/[^a-zA-Z0-9_-]/g, '-'),
    name: String(raw.name || '커스텀 VFX').slice(0, 64),
    prompt: String(raw.prompt || '').slice(0, 600),
    archetype: String(raw.archetype || 'custom').slice(0, 32),
    summary: String(raw.summary || '').slice(0, 240),
    scale: clampNum(raw.scale, 0.35, 2.2, 1.0),
    timeScale: clampNum(raw.timeScale, 0.1, 2.5, 1.0),
    floorY: clampNum(raw.floorY, -1.2, 0.2, -0.42),
    floorGlow: clampNum(raw.floorGlow, 0.0, 2.0, 0.75),
    floorColor: normalizeHex(raw.floorColor, layers[0]?.colorRim || '#ff8844'),
    loopPeriod: clampNum(raw.loopPeriod, 0.0, 12.0, 2.8),
    timing: {
      anticipation: clampNum(raw.timing?.anticipation, 0.02, 0.6, 0.14),
      impact: clampNum(raw.timing?.impact, 0.04, 0.8, 0.22),
      decay: clampNum(raw.timing?.decay, 0.3, 5.0, 1.8),
    },
    feel,
    layers,
    controls: [],
  };

  if (Array.isArray(raw.controls) && raw.controls.length > 0) {
    recipe.controls = raw.controls
      .filter((c) => c && typeof c.path === 'string' && getByPath(recipe, c.path) !== undefined)
      .slice(0, 14)
      .map((c) => ({
        label: String(c.label || c.path).slice(0, 42),
        path: c.path,
        min: Number.isFinite(Number(c.min)) ? Number(c.min) : 0,
        max: Number.isFinite(Number(c.max)) ? Number(c.max) : 1,
        step: Number.isFinite(Number(c.step)) && Number(c.step) > 0 ? Number(c.step) : 0.02,
        group: String(c.group || '주요 조절').slice(0, 24),
      }));
  }
  if (!recipe.controls.length) {
    recipe.controls = buildDefaultControls(recipe);
  }
  return recipe;
}

// Quest 3S 72fps 예산 가드: AI가 무리한 스플랫 수/거대 반투명 면적을 생성해도 자동 클램핑
export function applyQuestBudget(recipe, budget = QUEST_BUDGET) {
  const cloned = structuredClone(recipe);
  let totalSplats = 0;
  let estOverdraw = 0;

  const estimateLayer = (l) => {
    if (!l.enabled) return { splats: 0, area: 0 };
    if (l.type === 'emitter') {
      const subFactor = 1 + (l.subEmit || 0) * 0.35;
      const splats = Math.round(l.count * subFactor);
      const r = (l.sizeStart + l.sizeEnd) * 0.5 * cloned.scale;
      const area = splats * r * r * Math.max(1, l.stretch * 0.7) * 3.14;
      return { splats, area };
    }
    if (l.type === 'arc') {
      const splats = l.strands * l.segments + l.branches * Math.round(l.segments * 0.45);
      const r = l.width * cloned.scale;
      const area = splats * r * r * 6.0;
      return { splats, area };
    }
    const splats = l.splats;
    const r = l.thickness * cloned.scale;
    const area = splats * r * r * 5.0;
    return { splats, area };
  };

  for (const l of cloned.layers) {
    const e = estimateLayer(l);
    totalSplats += e.splats;
    estOverdraw += e.area;
  }

  let clamped = false;
  if (totalSplats > budget.maxSplats) {
    const ratio = budget.maxSplats / totalSplats;
    clamped = true;
    for (const l of cloned.layers) {
      if (!l.enabled) continue;
      if (l.type === 'emitter') {
        l.count = Math.max(16, Math.floor(l.count * ratio));
        l.burst = Math.min(l.count, Math.floor(l.burst * ratio));
      } else if (l.type === 'arc') {
        l.segments = Math.max(10, Math.floor(l.segments * Math.sqrt(ratio)));
      } else {
        l.splats = Math.max(16, Math.floor(l.splats * ratio));
      }
    }
  }

  // 재계산 + 오버드로우 면적 가드
  totalSplats = 0;
  estOverdraw = 0;
  for (const l of cloned.layers) {
    const e = estimateLayer(l);
    totalSplats += e.splats;
    estOverdraw += e.area;
  }

  if (estOverdraw > budget.maxOverdrawArea) {
    const sizeScale = Math.sqrt(budget.maxOverdrawArea / estOverdraw);
    clamped = true;
    for (const l of cloned.layers) {
      if (!l.enabled) continue;
      if (l.type === 'emitter') {
        l.sizeStart = Number((l.sizeStart * sizeScale).toFixed(4));
        l.sizeEnd = Number((l.sizeEnd * sizeScale).toFixed(4));
      } else if (l.type === 'wave') {
        l.thickness = Number((l.thickness * sizeScale).toFixed(4));
      }
    }
    estOverdraw = budget.maxOverdrawArea;
  }

  const questGrade = clamped
    ? 'CLAMPED'
    : totalSplats > budget.tightSplats || estOverdraw > budget.tightOverdrawArea
      ? 'TIGHT'
      : 'OK';

  return {
    recipe: cloned,
    budgetReport: {
      totalSplats,
      maxSplats: budget.maxSplats,
      estOverdraw: Number(estOverdraw.toFixed(2)),
      maxOverdrawArea: budget.maxOverdrawArea,
      clamped,
      questGrade,
    },
  };
}

// Unity meta-mr-picker/ritual SplatTuning.cs 1:1 호환 JSON 내보내기
export function exportUnitySplatTuning(recipe) {
  const compiled = compileSplatFeel(recipe.feel);
  const s = compiled.sim;
  const lk = compiled.look;
  const primary = recipe.layers.find((l) => l.enabled && l.type === 'emitter') || recipe.layers[0];
  return {
    _format: 'meta-mr-picker/SplatTuning+VfxRecipe/1',
    _sourceRecipeId: recipe.id,
    feelWeight: compiled.feel.weight,
    feelCohesion: compiled.feel.cohesion,
    feelViscosity: compiled.feel.viscosity,
    feelBounce: compiled.feel.bounce,
    feelGrain: compiled.feel.grain,
    feelFluff: compiled.feel.fluff,
    homeStiffness: s.homeStiffness,
    homeDamping: s.homeDamping,
    maxSpringAccel: s.maxSpringAccel,
    cohesion: s.cohesion,
    clusterStiffness: s.clusterStiffness,
    clusterDamping: s.clusterDamping,
    clusterViscosity: s.clusterViscosity,
    clusterGather: s.clusterGather,
    handPush: s.handPush,
    handDrag: s.handDrag,
    stickFraction: s.stickFraction,
    stickDecay: s.stickDecay,
    stickReach: s.stickReach,
    weight: s.weight,
    fallGravity: s.fallGravity,
    fallDamping: s.fallDamping,
    bounce: s.bounce,
    burstDamping: s.burstDamping,
    burstGravity: s.burstGravity,
    gatherRamp: s.gatherRamp,
    grain: lk.grain,
    stretchMax: lk.stretchMax,
    stretchSeconds: lk.stretchSeconds,
    fluff: lk.fluff,
    detachDistance: lk.detach,
    glowGain: primary ? primary.emission * 0.35 : 0.4,
    glintAmount: primary ? (primary.glint || 0) : 0.3,
    vfxComposer: {
      scale: recipe.scale,
      timeScale: recipe.timeScale,
      floorY: recipe.floorY,
      floorGlow: recipe.floorGlow,
      floorColor: recipe.floorColor,
      timing: recipe.timing,
      layers: recipe.layers,
    },
  };
}

export function getByPath(obj, pathStr) {
  const parts = String(pathStr || '').split('.').filter(Boolean);
  let cur = obj;
  for (const key of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

export function setByPath(obj, pathStr, value) {
  const parts = String(pathStr || '').split('.').filter(Boolean);
  if (!parts.length) return false;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') return false;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return true;
}

export function computeRecipeDiff(before, after, prefix = '') {
  const diffs = [];
  if (!before || !after) return diffs;
  const walk = (a, b, p) => {
    if (a === b) return;
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-5) {
        diffs.push({ path: p, from: Number(a.toFixed(4)), to: Number(b.toFixed(4)) });
      }
      return;
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
      if (a !== b) diffs.push({ path: p, from: a, to: b });
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (k === 'controls' || k === 'prompt') continue;
      walk(a[k], b[k], p ? `${p}.${k}` : k);
    }
  };
  walk(before, after, prefix);
  return diffs;
}

export function buildLlmSystemPrompt() {
  return `You are a Houdini & Quest 3S real-time 3D VFX Director.
Convert the user's natural-language request into a SINGLE valid JSON object following schema "vfx-recipe/1".
NEVER output markdown fences or commentary—ONLY raw JSON.

CRITICAL VFX ART RULES (NEVER make single neon straight lines):
1. Always compose 3 to 5 layered physical/optical elements:
   - Core/Energy ("arc" with helix/bolt/slash & multi-scale jitter, or tight bright "emitter")
   - Turbulent Body ("emitter" with 3D curlAmp > 0.6, flame/mist/matter kernel, blackbody/contrasting colorCore -> colorRim)
   - Secondary Sparks/Debris ("emitter" with gravity, stretch, floorBounce, optional subEmit: 1..3)
   - Optional Shockwave/Ring ("wave" with anticipation->impact->decay) or Ambient Mist ("emitter" with kernel:"mist", blend:"alpha")
2. Use realistic light/temperature contrast: bright near-white core (#fff4db, #e8fbff) transitioning to saturated/dark rim (#c93414, #1a58d8, #121518).
3. Stay within Quest 3S 72fps budget: total splats across all layers <= 4200.
4. Set all 10 Unity SplatFeel axes ("feel": weight, cohesion, viscosity, bounce, grain, fluff, squish, plastic, tack, thicken in 0..1).
5. Include 6 to 9 user-facing "controls" (sliders) pointing to real dot-paths in your JSON (e.g. "layers.0.curlAmp", "layers.1.jitter", "feel.viscosity").

SCHEMA OUTLINE:
{
  "schemaVersion": "vfx-recipe/1",
  "name": "Short evocative title",
  "archetype": "fire|lightning|portal|ink|frost|water|cosmic|slash|smoke|custom",
  "summary": "1-sentence breakdown of layers & motion",
  "scale": 1.0,
  "timeScale": 1.0,
  "floorY": -0.42,
  "floorGlow": 0.85,
  "floorColor": "#ff6a28",
  "loopPeriod": 2.8,
  "timing": { "anticipation": 0.14, "impact": 0.22, "decay": 1.8 },
  "feel": { "weight":0.2, "cohesion":0.3, "viscosity":0.25, "bounce":0.4, "grain":0.85, "fluff":0.1, "squish":0, "plastic":0, "tack":0, "thicken":0 },
  "layers": [
    {
      "id":"body", "name":"Turbulent Flame", "type":"emitter", "kernel":"flame|matter|mist|blade|electric|ring",
      "blend":"additive|alpha", "shape":"point|sphere|ring|cone|torus|spline",
      "count":480, "rate":220, "burst":0, "radius":0.22, "height":0.15,
      "lifeMin":0.55, "lifeMax":1.45, "sizeStart":0.045, "sizeEnd":0.012, "stretch":1.9,
      "speed":0.65, "spread":0.85, "gravity":-0.9, "drag":1.1, "curlAmp":1.35, "curlFreq":2.3,
      "vortex":1.2, "radial":0.1, "homeSpring":0.0, "floorBounce":0.2, "subEmit":1,
      "colorCore":"#fff2cc", "colorRim":"#d93814", "opacity":0.85, "emission":1.7, "erosion":0.42, "glint":0.35
    },
    {
      "id":"arcs", "name":"Helix Arcs", "type":"arc", "mode":"helix|orbit|bolt|slash", "kernel":"electric|blade|flame",
      "blend":"additive", "strands":5, "segments":34, "radius":0.34, "height":0.52,
      "helixTurns":2.1, "helixRadius":0.08, "jitter":0.065, "flowSpeed":1.9, "width":0.015, "branches":2,
      "colorCore":"#ffffff", "colorRim":"#38a6ff", "opacity":0.95, "emission":2.2, "erosion":0.25
    },
    {
      "id":"shock", "name":"Impact Wave", "type":"wave", "kernel":"ring|blade|mist", "blend":"additive",
      "splats":72, "radiusStart":0.05, "radiusEnd":0.92, "thickness":0.042, "period":2.4, "swirl":1.4, "tilt":0.0,
      "colorCore":"#fff0d0", "colorRim":"#ff6a22", "opacity":0.85, "emission":1.8, "erosion":0.35
    }
  ],
  "controls": [
    { "label":"난류 강도", "path":"layers.0.curlAmp", "min":0, "max":3.5, "step":0.05, "group":"시뮬레이션" }
  ]
}`;
}
