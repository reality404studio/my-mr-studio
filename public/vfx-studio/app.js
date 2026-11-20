import {
  SPLAT_FEEL_AXES,
  SPLAT_FEEL_PRESETS,
  buildLlmSystemPrompt,
  computeRecipeDiff,
  exportUnitySplatTuning,
  getByPath,
  normalizeRecipe,
  setByPath,
} from './schema.js';
import { SHOWCASE_PRESETS, compilePrompt, getPresetById } from './compiler.js';
import { VfxEngine } from './sim.js';
import { VfxPainter, identity, lookAt, perspective } from './renderer.js';
import { VfxImmersion, supportedModes } from './xr-bridge.js';
import { BACKDROP_PRESETS, VIEW_PRESETS, evaluateViewSafety, ortho } from './stage.js';
import { PixelArtPass } from './pixel-pass.js';

const $ = (id) => document.getElementById(id);

const LS_KEY = 'my-mr-studio:vfx-dataset-v1';

// ── 상태 ─────────────────────────────────────────────────────────────
let initialRecipe = getPresetById('dokkaebi-flame');
let currentRecipe = structuredClone(initialRecipe);
let currentSource = 'preset';
let currentRating = 4;
let datasetItems = [];
let serverAvailable = true;

let activeViewId = 'mmo-3p';
let activeBackdropId = 'dungeon';
let showActorSilhouette = true;
let pixelState = { enabled: false, resolution: 128, colors: 16, fps: 12, outline: true, dither: 0.35 };
let pixelAccumDt = 0;

let pointerMode = 'orbit'; // 'orbit' | 'hand'
const camera = { ...VIEW_PRESETS['mmo-3p'].camera, target: [...VIEW_PRESETS['mmo-3p'].camera.target] };
const viewMat = identity();
let projMat = perspective(16 / 9, (46 * Math.PI) / 180);
let viewportKey = '';

let fpsFrames = 0;
let fpsClock = 0;
let displayFps = 60;
let lastFrameMs = null;
let rafId = 0;

const canvas = $('viewport');
const engine = new VfxEngine(currentRecipe);
let painter = null;
let pixelPass = null;
let xrModes = [];
let xrSession = null;

// ── 토스트 알림 ──────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ── 시점 · 배경 · 2D 도트 무대 제어 ──────────────────────────────────
function applyViewPreset(viewId, silent = false) {
  const preset = VIEW_PRESETS[viewId] || VIEW_PRESETS['mmo-3p'];
  activeViewId = preset.id;
  camera.yaw = preset.camera.yaw;
  camera.pitch = preset.camera.pitch;
  camera.dist = preset.camera.dist;
  camera.target = [...preset.camera.target];
  viewportKey = '';

  document.querySelectorAll('#viewSwitchGroup .seg').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === activeViewId);
  });

  setPixelMode(Boolean(preset.pixelDefault), true);
  updateViewSafetyHint();
  if (!silent) toast(`시점 전환: ${preset.label}`);
}

function applyBackdrop(backdropId) {
  const bd = BACKDROP_PRESETS[backdropId] || BACKDROP_PRESETS.dungeon;
  activeBackdropId = bd.id;
  const stageEl = $('stageSection');
  if (stageEl) stageEl.style.background = bd.cssBg;
  const sel = $('backdropSelect');
  if (sel && sel.value !== bd.id) sel.value = bd.id;
}

function setPixelMode(on, silent = false) {
  pixelState.enabled = Boolean(on);
  pixelAccumDt = 0;
  viewportKey = '';
  const btn = $('pixelToggleBtn');
  if (btn) btn.classList.toggle('is-active', pixelState.enabled);
  const bar = $('pixelBar');
  if (bar) bar.hidden = !pixelState.enabled;
  if (!silent) {
    toast(pixelState.enabled ? `도트 필터 켜짐 (${pixelState.resolution}px · ${pixelState.colors}색 · ${pixelState.fps}fps)` : '도트 필터 꺼짐');
  }
}

function computeStageProjection(aspect) {
  const viewPreset = VIEW_PRESETS[activeViewId] || VIEW_PRESETS['mmo-3p'];
  if (viewPreset.projection === 'ortho') {
    const zoomScale = camera.dist / (viewPreset.camera.dist || 3.5);
    const halfH = (viewPreset.orthoHalfH || 1.05) * zoomScale;
    const halfW = halfH * aspect;
    return ortho(halfW, halfH, 0.05, 40);
  }
  return perspective(aspect, ((viewPreset.fovDeg || 46) * Math.PI) / 180);
}

function updateViewSafetyHint() {
  const safety = evaluateViewSafety(engine, activeViewId);
  const el = $('stageHint');
  if (!el) return;
  el.textContent = safety.text;
  el.classList.toggle('is-warn', safety.level === 'warn');
}

// ── 렌더링 & 업로드 ──────────────────────────────────────────────────
function uploadAll() {
  if (!painter) return;
  const bd = BACKDROP_PRESETS[activeBackdropId] || BACKDROP_PRESETS.dungeon;
  const viewPreset = VIEW_PRESETS[activeViewId] || VIEW_PRESETS['mmo-3p'];
  painter.setFloor(
    engine.recipe.floorY * engine.recipe.scale,
    engine.stageOrigin,
    engine.floorGlowColor,
    engine.floorGlowIntensity,
    { floorBase: bd.floorBase, ringTint: bd.ringTint, showRings: viewPreset.showRings },
  );
  for (const g of engine.groups) painter.upload(g.batch);
}

function updateDesktopCamera() {
  const cp = Math.cos(camera.pitch);
  const eye = [
    camera.target[0] + Math.sin(camera.yaw) * cp * camera.dist,
    camera.target[1] + Math.sin(camera.pitch) * camera.dist,
    camera.target[2] + Math.cos(camera.yaw) * cp * camera.dist,
  ];
  lookAt(viewMat, eye, camera.target, [0, 1, 0]);
  return eye;
}

function renderDesktop(ms) {
  if (xrSession?.session || painter?.gl?.isContextLost()) return;
  rafId = requestAnimationFrame(renderDesktop);
  const dt = lastFrameMs === null ? 1 / 60 : Math.min(0.05, Math.max(0.001, (ms - lastFrameMs) / 1000));
  lastFrameMs = ms;

  fpsFrames++;
  fpsClock += dt;
  if (fpsClock >= 0.45) {
    displayFps = Math.round(fpsFrames / fpsClock);
    fpsFrames = 0;
    fpsClock = 0;
    updateTelemetry();
    updateViewSafetyHint();
  }

  // 도트 모드에서는 12fps/15fps/24fps 프레임 스텝 클록으로 도트 특유의 끊어지는 타격감 재현
  if (pixelState.enabled && pixelState.fps < 55) {
    pixelAccumDt += dt;
    const stepDt = 1 / pixelState.fps;
    if (pixelAccumDt >= stepDt) {
      engine.tick(stepDt, []);
      pixelAccumDt = pixelAccumDt % stepDt;
    }
  } else {
    engine.tick(dt, []);
  }
  uploadAll();

  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const key = `${w}x${h}@${dpr}:${activeViewId}:${pixelState.enabled}:${camera.dist.toFixed(2)}`;
  if (viewportKey !== key) {
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    projMat = computeStageProjection(pixelState.enabled ? 1.0 : w / h);
    viewportKey = key;
  }

  const gl = painter.gl;
  const bd = BACKDROP_PRESETS[activeBackdropId] || BACKDROP_PRESETS.dungeon;
  const viewPreset = VIEW_PRESETS[activeViewId] || VIEW_PRESETS['mmo-3p'];
  const actorOverlay = (showActorSilhouette && viewPreset.showActor)
    ? { actor: engine.actor, color: bd.actorColor }
    : null;

  updateDesktopCamera();

  if (pixelState.enabled && pixelPass) {
    pixelPass.beginCapture(pixelState.resolution);
    painter.eye(viewMat, projMat, engine.groups, engine.time, !viewPreset.showFloor, actorOverlay);
    pixelPass.present(canvas.width, canvas.height, {
      colors: pixelState.colors,
      dither: pixelState.dither,
      outline: pixelState.outline,
      bgColor: bd.clear,
    }, false);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(bd.clear[0], bd.clear[1], bd.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    painter.eye(viewMat, projMat, engine.groups, engine.time, !viewPreset.showFloor, actorOverlay);
  }
}

function updateTelemetry() {
  const m = engine.metrics;
  $('statFps').textContent = xrSession?.hz
    ? `${Math.round(xrSession.hz)} XR`
    : pixelState.enabled ? `${pixelState.fps} px` : `${displayFps}`;
  $('statSplats').textContent = `${m.splatCount} / 4800`;
  $('statOverdraw').textContent = `${m.estOverdraw.toFixed(2)} m²`;
  $('statSimMs').textContent = `${m.simMs.toFixed(1)} ms`;

  const badge = $('questBadge');
  badge.classList.remove('is-tight', 'is-clamped');
  if (m.questGrade === 'CLAMPED') {
    badge.textContent = 'CLAMPED 72fps';
    badge.classList.add('is-clamped');
  } else if (m.questGrade === 'TIGHT') {
    badge.textContent = 'TIGHT 72fps';
    badge.classList.add('is-tight');
  } else {
    badge.textContent = 'OK 72fps';
  }
}

// ── 포인터: 오빗 회전 & 가상 손 콜라이더 ─────────────────────────────
let dragging = false;
let dragMode = 'orbit';
let prevPtrX = 0;
let prevPtrY = 0;
let prevHandWorld = null;
let prevHandTime = 0;

function screenToStagePoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
  const halfH = Math.tan((48 * Math.PI) / 360) * camera.dist;
  const halfW = halfH * (rect.width / Math.max(1, rect.height));
  // 카메라 기준 right / up 벡터로 원점 평면 위 3D 좌표 계산
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const right = [cy, 0, -sy];
  const up = [-sy * sp, cp, -cy * sp];
  const sx = ndcX * halfW;
  const syOff = ndcY * halfH;
  return [
    camera.target[0] + right[0] * sx + up[0] * syOff,
    camera.target[1] + right[1] * sx + up[1] * syOff,
    camera.target[2] + right[2] * sx + up[2] * syOff,
  ];
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  dragMode = (pointerMode === 'hand' || e.shiftKey) ? 'hand' : 'orbit';
  prevPtrX = e.clientX;
  prevPtrY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('is-dragging');
  if (dragMode === 'hand') {
    const p = screenToStagePoint(e.clientX, e.clientY);
    prevHandWorld = p;
    prevHandTime = performance.now();
    engine.setPointerCollider(p, [0, 0, 0], true, 0.14);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (dragMode === 'orbit') {
    const dx = e.clientX - prevPtrX;
    const dy = e.clientY - prevPtrY;
    prevPtrX = e.clientX;
    prevPtrY = e.clientY;
    camera.yaw -= dx * 0.0075;
    camera.pitch = Math.max(-0.55, Math.min(1.25, camera.pitch + dy * 0.0065));
  } else {
    const now = performance.now();
    const dt = Math.max(0.008, (now - prevHandTime) / 1000);
    const p = screenToStagePoint(e.clientX, e.clientY);
    const vel = prevHandWorld
      ? [(p[0] - prevHandWorld[0]) / dt, (p[1] - prevHandWorld[1]) / dt, (p[2] - prevHandWorld[2]) / dt]
      : [0, 0, 0];
    prevHandWorld = p;
    prevHandTime = now;
    engine.setPointerCollider(p, vel, true, 0.14);
  }
});

const stopDrag = () => {
  dragging = false;
  prevHandWorld = null;
  canvas.classList.remove('is-dragging');
  engine.setPointerCollider(null, null, false);
};
canvas.addEventListener('pointerup', stopDrag);
canvas.addEventListener('pointercancel', stopDrag);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.dist = Math.max(0.7, Math.min(4.2, camera.dist * (1 + e.deltaY * 0.0012)));
}, { passive: false });

// ── 레시피 로드 & UI 동기화 ──────────────────────────────────────────
function loadNewRecipe(recipe, source = 'compiler', resetSim = true) {
  const { recipe: applied, budgetReport } = engine.loadRecipe(recipe, resetSim);
  initialRecipe = structuredClone(applied);
  currentRecipe = structuredClone(applied);
  currentSource = source;

  const targetActor = applied.previewStage?.actor || 'idle';
  engine.setActorMode(targetActor);
  const actorSel = $('actorSelect');
  if (actorSel) actorSel.value = targetActor;
  if (applied.previewStage?.backdrop && source === 'preset') {
    applyBackdrop(applied.previewStage.backdrop);
  }

  $('promptInput').value = applied.prompt || '';
  $('saveName').value = applied.name || '';
  $('saveTags').value = [applied.archetype, applied.category, budgetReport.questGrade === 'OK' ? 'quest-72fps' : 'clamped'].filter(Boolean).join(', ');
  $('jsonEditor').value = JSON.stringify(currentRecipe, null, 2);

  renderMeta();
  renderLayerChips();
  renderDynamicSliders();
  renderFeelControls();
  renderLayerEditors();
  updateTelemetry();

  if (budgetReport.clamped) {
    toast('Quest 3S 72fps 예산 초과분을 자동으로 안전 범위로 조정했습니다.');
  }
}

function applyLiveEdit() {
  const { recipe } = engine.updateRecipeLive(currentRecipe);
  currentRecipe = structuredClone(recipe);
  renderMeta();
  updateTelemetry();
}

function renderMeta() {
  const diffs = computeRecipeDiff(initialRecipe, currentRecipe);
  $('recipeTitle').textContent = currentRecipe.name;
  $('recipeSummary').textContent = currentRecipe.summary || `${currentRecipe.layers.length}개 시뮬레이션 레이어`;
  const sourceLabels = { preset: '레퍼런스 프리셋', compiler: '내장 컴파일러', llm: 'LLM 생성', paste: 'JSON 붙여넣기', dataset: '저장된 샘플' };
  $('recipeSourceTag').textContent = sourceLabels[currentSource] || currentSource;
  const editEl = $('editCountTag');
  editEl.textContent = `수정 ${diffs.length}건`;
  editEl.classList.toggle('is-dirty', diffs.length > 0);
  $('resetEditsBtn').hidden = diffs.length === 0;
}

function renderLayerChips() {
  const wrap = $('layerChips');
  wrap.innerHTML = '';
  currentRecipe.layers.forEach((layer, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `layer-chip${layer.enabled ? '' : ' is-off'}`;
    btn.innerHTML = `
      <span class="layer-chip__swatch" style="background:${layer.colorRim}"></span>
      <span>${escapeHtml(layer.name)}</span>
      <span class="layer-chip__kind">${layer.kernel}·${layer.blend === 'additive' ? 'ADD' : 'ALP'}</span>
    `;
    btn.onclick = () => {
      currentRecipe.layers[idx].enabled = !currentRecipe.layers[idx].enabled;
      btn.classList.toggle('is-off', !currentRecipe.layers[idx].enabled);
      applyLiveEdit();
    };
    wrap.appendChild(btn);
  });
}

function formatNum(v, step) {
  const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return Number(v).toFixed(dec);
}

function renderDynamicSliders() {
  const wrap = $('dynamicSliders');
  wrap.innerHTML = '';
  let lastGroup = '';

  for (const ctrl of currentRecipe.controls) {
    const curVal = getByPath(currentRecipe, ctrl.path);
    if (typeof curVal !== 'number') continue;
    if (ctrl.group && ctrl.group !== lastGroup) {
      lastGroup = ctrl.group;
      const g = document.createElement('div');
      g.className = 'slider-group-label';
      g.textContent = ctrl.group;
      wrap.appendChild(g);
    }

    const row = document.createElement('label');
    row.className = 'slider-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'slider-row__label';
    nameSpan.textContent = ctrl.label;

    const valSpan = document.createElement('span');
    valSpan.className = 'slider-row__val';
    valSpan.textContent = formatNum(curVal, ctrl.step);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(ctrl.min);
    input.max = String(ctrl.max);
    input.step = String(ctrl.step);
    input.value = String(curVal);
    input.oninput = () => {
      const next = Number(input.value);
      setByPath(currentRecipe, ctrl.path, next);
      valSpan.textContent = formatNum(next, ctrl.step);
      applyLiveEdit();
    };

    row.append(nameSpan, valSpan, input);
    wrap.appendChild(row);
  }
}

function renderFeelControls() {
  const pills = $('feelPresets');
  pills.innerHTML = '';
  for (const [name, feelObj] of Object.entries(SPLAT_FEEL_PRESETS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill';
    btn.textContent = name;
    btn.onclick = () => {
      currentRecipe.feel = { ...feelObj };
      applyLiveEdit();
      renderFeelSlidersOnly();
      pills.querySelectorAll('.pill').forEach((el) => el.classList.toggle('is-active', el === btn));
      toast(`SplatFeel 물성 → ${name} 적용`);
    };
    pills.appendChild(btn);
  }
  renderFeelSlidersOnly();
}

function renderFeelSlidersOnly() {
  const wrap = $('feelSliders');
  wrap.innerHTML = '';
  for (const axis of SPLAT_FEEL_AXES) {
    const curVal = currentRecipe.feel[axis.key] ?? 0;
    const row = document.createElement('label');
    row.className = 'slider-row';
    row.title = axis.hint;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'slider-row__label';
    nameSpan.textContent = axis.label;

    const valSpan = document.createElement('span');
    valSpan.className = 'slider-row__val';
    valSpan.textContent = curVal.toFixed(2);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(axis.min);
    input.max = String(axis.max);
    input.step = String(axis.step);
    input.value = String(curVal);
    input.oninput = () => {
      const next = Number(input.value);
      currentRecipe.feel[axis.key] = next;
      valSpan.textContent = next.toFixed(2);
      applyLiveEdit();
    };

    row.append(nameSpan, valSpan, input);
    wrap.appendChild(row);
  }
}

function renderLayerEditors() {
  const wrap = $('layerEditors');
  wrap.innerHTML = '';
  currentRecipe.layers.forEach((layer, idx) => {
    const card = document.createElement('div');
    card.className = 'layer-card';
    card.innerHTML = `
      <div class="layer-card__top">
        <span>${escapeHtml(layer.name)}</span>
        <span class="layer-chip__kind">${layer.type} · ${layer.kernel}</span>
      </div>
      <div class="layer-card__colors">
        <label class="color-pick">코어 <input type="color" data-field="colorCore" value="${layer.colorCore}"></label>
        <label class="color-pick">외곽 <input type="color" data-field="colorRim" value="${layer.colorRim}"></label>
      </div>
      <label class="slider-row">
        <span class="slider-row__label">투명도 (Opacity)</span>
        <span class="slider-row__val" data-val="opacity">${layer.opacity.toFixed(2)}</span>
        <input type="range" data-field="opacity" min="0.05" max="1.6" step="0.05" value="${layer.opacity}">
      </label>
      <label class="slider-row">
        <span class="slider-row__label">발광 (Emission)</span>
        <span class="slider-row__val" data-val="emission">${layer.emission.toFixed(2)}</span>
        <input type="range" data-field="emission" min="0" max="3.2" step="0.05" value="${layer.emission}">
      </label>
    `;
    card.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => {
        const f = inp.dataset.field;
        if (inp.type === 'color') {
          currentRecipe.layers[idx][f] = inp.value;
          renderLayerChips();
        } else {
          const val = Number(inp.value);
          currentRecipe.layers[idx][f] = val;
          const vEl = card.querySelector(`[data-val="${f}"]`);
          if (vEl) vEl.textContent = val.toFixed(2);
        }
        applyLiveEdit();
      };
    });
    wrap.appendChild(card);
  });
}

// ── 데이터셋 저장 / 조회 (로컬 서버 API + localStorage 폴백) ──────────
async function refreshDataset() {
  try {
    const res = await fetch('/api/vfx/dataset');
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();
    serverAvailable = true;
    datasetItems = data.items || [];
    $('storageBadge').textContent = data.stats?.storagePath || 'studio/vfx-data/';
  } catch {
    serverAvailable = false;
    $('storageBadge').textContent = 'localStorage (오프라인)';
    try { datasetItems = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { datasetItems = []; }
  }
  $('datasetCount').textContent = String(datasetItems.length);
  renderDatasetList();
}

async function saveCurrentToDataset() {
  const sliderEdits = computeRecipeDiff(initialRecipe, currentRecipe);
  const payload = {
    name: $('saveName').value.trim() || currentRecipe.name,
    prompt: $('promptInput').value.trim() || currentRecipe.prompt || currentRecipe.name,
    source: currentSource,
    rating: currentRating,
    tags: $('saveTags').value.split(',').map((s) => s.trim()).filter(Boolean),
    notes: $('saveNotes').value.trim(),
    metrics: { ...engine.metrics },
    sliderEdits,
    initialRecipe,
    tunedRecipe: currentRecipe,
    unityTuning: exportUnitySplatTuning(currentRecipe),
  };

  if (serverAvailable) {
    try {
      const res = await fetch('/api/vfx/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '저장 실패');
      const saved = await res.json();
      await refreshDataset();
      toast(`레포에 저장됨: studio/vfx-data/recipes/${saved.id}.json`);
      return;
    } catch (e) {
      toast(`서버 저장 실패 (${e.message}) — 로컬에 보관합니다.`);
    }
  }

  const localRecord = { ...payload, id: `local-${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  datasetItems = [localRecord, ...datasetItems];
  localStorage.setItem(LS_KEY, JSON.stringify(datasetItems));
  $('datasetCount').textContent = String(datasetItems.length);
  renderDatasetList();
  toast('브라우저 localStorage에 저장되었습니다.');
}

async function deleteSample(id) {
  if (serverAvailable) {
    try {
      const res = await fetch(`/api/vfx/dataset/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshDataset();
        toast('샘플을 삭제했습니다.');
        return;
      }
    } catch {}
  }
  datasetItems = datasetItems.filter((x) => x.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(datasetItems));
  $('datasetCount').textContent = String(datasetItems.length);
  renderDatasetList();
  toast('샘플을 삭제했습니다.');
}

function renderDatasetList() {
  const wrap = $('datasetList');
  wrap.innerHTML = '';
  if (!datasetItems.length) {
    wrap.innerHTML = '<div class="dataset-empty">아직 저장된 VFX 데이터가 없습니다.<br>자연어로 생성하고 슬라이더를 조율한 뒤 저장해 보세요.</div>';
    return;
  }
  for (const item of datasetItems) {
    const el = document.createElement('article');
    el.className = 'dataset-item';
    const stars = '★'.repeat(item.rating || 0) + '☆'.repeat(Math.max(0, 5 - (item.rating || 0)));
    const edits = Array.isArray(item.sliderEdits) ? item.sliderEdits.length : 0;
    const grade = item.metrics?.questGrade || 'OK';
    el.innerHTML = `
      <div class="dataset-item__head">
        <span class="dataset-item__name">${escapeHtml(item.name)}</span>
        <span class="dataset-item__stars">${stars}</span>
      </div>
      <p class="dataset-item__prompt">${escapeHtml(item.prompt || '')}</p>
      <div class="dataset-item__foot">
        <span>${item.source} · 수정 ${edits}건 · ${grade}</span>
        <div class="dataset-item__actions">
          <button class="link-btn" data-act="load" type="button">불러오기</button>
          <button class="link-btn" data-act="unity" type="button">Unity</button>
          <button class="link-btn" data-act="del" type="button">삭제</button>
        </div>
      </div>
    `;
    el.querySelector('[data-act="load"]').onclick = () => {
      if (!item.tunedRecipe) return;
      loadNewRecipe(item.tunedRecipe, 'dataset', true);
      switchTab('sliders');
      toast(`불러옴: ${item.name}`);
    };
    el.querySelector('[data-act="unity"]').onclick = async () => {
      const u = item.unityTuning || exportUnitySplatTuning(item.tunedRecipe);
      await copyText(JSON.stringify(u, null, 2));
      toast('Unity SplatTuning JSON을 클립보드에 복사했습니다.');
    };
    el.querySelector('[data-act="del"]').onclick = () => deleteSample(item.id);
    wrap.appendChild(el);
  }
}

function downloadJsonlFallback() {
  const content = datasetItems.map((x) => JSON.stringify(x)).join('\n') + (datasetItems.length ? '\n' : '');
  const blob = new Blob([content], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vfx-dataset.jsonl';
  a.click();
  URL.revokeObjectURL(url);
}

// ── LLM API 호출 ─────────────────────────────────────────────────────
async function generateWithLlm() {
  const prompt = $('promptInput').value.trim();
  if (!prompt) { toast('먼저 자연어 프롬프트를 입력해 주세요.'); return; }
  const apiKey = $('llmApiKey').value.trim();
  if (!apiKey) {
    switchTab('llm');
    toast('LLM · JSON 탭에서 API 키를 입력하거나 시스템 프롬프트를 복사해 주세요.');
    return;
  }

  const btn = $('llmGenerateBtn');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '생성 중…';
  try {
    const res = await fetch('/api/vfx/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemPrompt: buildLlmSystemPrompt(),
        provider: $('llmProvider').value,
        model: $('llmModel').value.trim(),
        endpoint: $('llmEndpoint').value.trim(),
        apiKey,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const recipe = normalizeRecipe({ ...data.recipe, prompt });
    loadNewRecipe(recipe, 'llm', true);
    switchTab('sliders');
    toast(`LLM이 ${recipe.layers.length}레이어 VFX 레시피를 생성했습니다.`);
  } catch (e) {
    toast(`LLM 생성 실패: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

// ── Quest WebXR 연결 ──────────────────────────────────────────────────
async function refreshXrSupport() {
  xrModes = painter?.gl ? await supportedModes() : [];
  const btn = $('xrButton');
  const txt = $('xrButtonText');
  if (xrModes.includes('immersive-ar')) {
    btn.classList.add('is-ready');
    txt.textContent = 'Quest 패스스루 AR';
  } else if (xrModes.includes('immersive-vr')) {
    btn.classList.add('is-ready');
    txt.textContent = 'Quest VR 보기';
  } else {
    btn.classList.remove('is-ready');
    txt.textContent = 'Quest XR (헤드셋 필요)';
  }
}

function enterQuestXr() {
  if (!painter?.gl) return;
  if (xrSession?.session) {
    xrSession.stop();
    return;
  }
  const chosen = xrModes.includes('immersive-ar') ? 'immersive-ar' : xrModes[0];
  if (!chosen) {
    toast('Meta Quest Browser에서 이 주소를 열면 패스스루 AR/VR로 바로 입장할 수 있습니다.');
    return;
  }
  $('xrBanner').hidden = true;
  $('xrButton').disabled = true;
  xrSession = new VfxImmersion(
    painter,
    engine,
    uploadAll,
    (msg) => {
      xrSession = null;
      $('xrButton').disabled = false;
      if (msg) {
        $('xrBanner').textContent = msg;
        $('xrBanner').hidden = false;
      }
      lastFrameMs = null;
      rafId = requestAnimationFrame(renderDesktop);
    },
    (step) => {
      if (step === 'ready') {
        cancelAnimationFrame(rafId);
        $('xrButton').disabled = false;
      }
    },
  );
  xrSession.start(chosen);
}

// ── 탭 · 이벤트 바인딩 ───────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.panel').forEach((p) => {
    const on = p.id === `tab-${name}`;
    p.hidden = !on;
    p.classList.toggle('is-active', on);
  });
  if (name === 'llm') {
    $('jsonEditor').value = JSON.stringify(currentRecipe, null, 2);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initUi() {
  // 프리셋 드롭다운
  const sel = $('presetSelect');
  for (const p of SHOWCASE_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    const recipe = getPresetById(sel.value);
    loadNewRecipe(recipe, 'preset', true);
    toast(`프리셋 로드: ${recipe.name}`);
  };

  // 프롬프트 컴파일
  $('promptForm').onsubmit = (e) => {
    e.preventDefault();
    const prompt = $('promptInput').value.trim();
    const compiled = compilePrompt(prompt);
    loadNewRecipe(compiled, 'compiler', true);
    toast(`컴파일 완료 (${compiled.layers.length}레이어)`);
  };
  $('llmGenerateBtn').onclick = generateWithLlm;
  $('xrButton').onclick = enterQuestXr;

  // 탭 전환
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => switchTab(t.dataset.tab);
  });

  // 시점 · 테스트 액터 · 배경 · 도트 필터 컨트롤
  document.querySelectorAll('#viewSwitchGroup .seg').forEach((btn) => {
    btn.onclick = () => applyViewPreset(btn.dataset.view);
  });
  $('actorSelect').onchange = (e) => {
    engine.setActorMode(e.target.value);
    toast(`테스트 액터 → ${e.target.options[e.target.selectedIndex].text}`);
  };
  $('backdropSelect').onchange = (e) => {
    applyBackdrop(e.target.value);
  };
  $('toggleActorVisBtn').onclick = () => {
    showActorSilhouette = !showActorSilhouette;
    $('toggleActorVisBtn').classList.toggle('is-active', showActorSilhouette);
  };
  $('pixelToggleBtn').onclick = () => setPixelMode(!pixelState.enabled);
  $('pixelRes').onchange = (e) => { pixelState.resolution = Number(e.target.value) || 128; };
  $('pixelColors').onchange = (e) => { pixelState.colors = Number(e.target.value) || 16; };
  $('pixelFps').onchange = (e) => { pixelState.fps = Number(e.target.value) || 12; updateTelemetry(); };
  $('pixelOutline').onchange = (e) => { pixelState.outline = Boolean(e.target.checked); };

  $('bakeSpriteBtn').onclick = () => {
    if (!pixelPass || !painter) return;
    try {
      const squareProj = computeStageProjection(1.0);
      updateDesktopCamera();
      const { pngDataUrl, meta } = pixelPass.bakeSpriteSheet({
        engine,
        painter,
        viewMat,
        projMat: squareProj,
        resolution: pixelState.resolution,
        fps: Math.min(24, pixelState.fps),
        duration: Math.min(2.2, Math.max(1.0, currentRecipe.loopPeriod || 1.6)),
        pixelOpts: {
          colors: pixelState.colors,
          dither: pixelState.dither,
          outline: pixelState.outline,
        },
      });
      // PNG 스프라이트 시트 + 메타 JSON 동시 다운로드
      const aPng = document.createElement('a');
      aPng.href = pngDataUrl;
      aPng.download = `${currentRecipe.id || 'vfx'}-${meta.frameWidth}px-${meta.columns}x${meta.rows}.png`;
      aPng.click();

      const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
      const metaUrl = URL.createObjectURL(metaBlob);
      const aJson = document.createElement('a');
      aJson.href = metaUrl;
      aJson.download = `${currentRecipe.id || 'vfx'}-spritesheet.json`;
      setTimeout(() => { aJson.click(); URL.revokeObjectURL(metaUrl); }, 250);

      toast(`스프라이트 시트 Bake 완료 (${meta.frameCount}프레임 · ${meta.columns}×${meta.rows} · ${meta.frameWidth}px)`);
    } catch (err) {
      toast(`스프라이트 시트 생성 실패: ${err.message}`);
    }
  };

  // 뷰포트 컨트롤
  $('modeOrbitBtn').onclick = () => {
    pointerMode = 'orbit';
    $('modeOrbitBtn').classList.add('is-active');
    $('modeHandBtn').classList.remove('is-active');
    canvas.classList.remove('is-hand');
  };
  $('modeHandBtn').onclick = () => {
    pointerMode = 'hand';
    $('modeHandBtn').classList.add('is-active');
    $('modeOrbitBtn').classList.remove('is-active');
    canvas.classList.add('is-hand');
    toast('손 휘젓기 모드: 캔버스를 드래그해 파티클을 밀고 휘저어 보세요.');
  };

  $('burstBtn').onclick = () => { engine.triggerBurst(); };
  $('pauseBtn').onclick = () => {
    engine.paused = !engine.paused;
    $('pauseBtn').textContent = engine.paused ? '재생 ▶' : '일시정지';
    $('pauseBtn').classList.toggle('is-active', engine.paused);
  };

  const speeds = [1.0, 0.5, 0.25, 1.5];
  let speedIdx = 0;
  $('speedBtn').onclick = () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    engine.speedMultiplier = speeds[speedIdx];
    $('speedBtn').textContent = `${engine.speedMultiplier.toFixed(2).replace(/0$/, '')}×`;
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      engine.triggerBurst();
    }
  });

  // 슬라이더 탭 버튼
  $('resetEditsBtn').onclick = () => {
    loadNewRecipe(initialRecipe, currentSource, false);
    toast('초기 생성 상태로 되돌렸습니다.');
  };
  $('quickSaveBtn').onclick = () => switchTab('dataset');

  // 데이터셋 별점 & 저장
  const updateStars = (n) => {
    currentRating = n;
    $('ratingStars').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-on', Number(b.dataset.star) <= n);
    });
  };
  updateStars(4);
  $('ratingStars').querySelectorAll('button').forEach((b) => {
    b.onclick = () => updateStars(Number(b.dataset.star));
  });
  $('saveDatasetBtn').onclick = saveCurrentToDataset;
  $('copyUnityBtn').onclick = async () => {
    await copyText(JSON.stringify(exportUnitySplatTuning(currentRecipe), null, 2));
    toast('Unity SplatTuning + VFX Composer JSON 복사 완료');
  };
  $('exportJsonlBtn').onclick = () => {
    if (serverAvailable) {
      window.location.href = '/api/vfx/export.jsonl';
    } else {
      downloadJsonlFallback();
    }
  };

  // LLM · JSON 탭
  $('llmProvider').onchange = () => {
    const p = $('llmProvider').value;
    if (p === 'gemini' && $('llmModel').value.startsWith('gpt')) $('llmModel').value = 'gemini-2.5-flash';
    if (p === 'openai' && $('llmModel').value.startsWith('gemini')) $('llmModel').value = 'gpt-4o-mini';
  };
  $('copySysPromptBtn').onclick = async () => {
    await copyText(buildLlmSystemPrompt());
    toast('LLM 시스템 프롬프트를 복사했습니다.');
  };
  $('applyJsonBtn').onclick = () => {
    try {
      const parsed = JSON.parse($('jsonEditor').value);
      loadNewRecipe(parsed, 'paste', true);
      switchTab('sliders');
      toast('JSON 레시피를 시뮬레이션에 적용했습니다.');
    } catch (e) {
      toast(`JSON 오류: ${e.message}`);
    }
  };
  $('syncJsonBtn').onclick = () => {
    $('jsonEditor').value = JSON.stringify(currentRecipe, null, 2);
    toast('현재 레시피 JSON을 불러왔습니다.');
  };
  $('showUnityJsonBtn').onclick = () => {
    $('jsonEditor').value = JSON.stringify(exportUnitySplatTuning(currentRecipe), null, 2);
    toast('Unity meta-mr-picker 호환 JSON 미리보기');
  };
}

// ── 부트스트랩 ────────────────────────────────────────────────────────
initUi();
try {
  painter = new VfxPainter(canvas);
  pixelPass = new PixelArtPass(painter.gl, painter.corners);
  applyBackdrop('dungeon');
  applyViewPreset('mmo-3p', true);
  loadNewRecipe(initialRecipe, 'preset', true);
  refreshDataset();
  refreshXrSupport();
  rafId = requestAnimationFrame(renderDesktop);
} catch (err) {
  $('xrBanner').textContent = err.message || String(err);
  $('xrBanner').hidden = false;
}
