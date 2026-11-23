// Main entry for Bookmark Sea-Snake WebXR Passthrough Prototype.

import { clamp } from './gesture.js?v=d7059e7';
import {
  BookmarkSnakeRenderer,
  identity,
  lookAt,
  perspective,
  SHIMMER_PRESETS,
} from './render.js?v=d7059e7';
import { buildSyntheticHand, DesktopRehearsal } from './rehearsal.js?v=d7059e7';
import { BookmarkSnakeScene, PHASE } from './snake.js?v=d7059e7';
import {
  BOOKMARK_TEXT,
  buildTextAtlasCanvas,
  exportAtlasPng,
  loadBakedAtlasImage,
  loadCustomFontFile,
  loadPearSansFont,
} from './text-atlas.js?v=d7059e7';
import { Immersion, supportedModes } from './xr.js?v=d7059e7';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');

const scene = new BookmarkSnakeScene();
const renderer = new BookmarkSnakeRenderer(canvas);
const rehearsal = new DesktopRehearsal();

const viewMat = identity();
let projMat = identity();
const desktopEye = [0.0, 0.02, 0.04];
const desktopTarget = [0.0, -0.06, -0.44];
const FOV = (50 * Math.PI) / 180;

let mode = 'demo'; // 'demo' | 'manual'
let showHandVisualDesktop = true;
let pointerDown = false;
let pointerWorld = [0.08, -0.08, -0.44];
let lastMs = 0;
let xr = null;
let xrModes = [];
let currentAtlasCanvas = null;

const PHASE_COPY = {
  [PHASE.FLOATING]: ['1단계 · 책갈피 집기', '공중의 책갈피를 핀치해 실제 책 위에 가져다 놓으세요.'],
  [PHASE.ANCHORING]: ['2단계 · 책에 붙이기', '책 위에 맞춘 뒤 핀치를 놓으면 그 위치에 앵커됩니다.'],
  [PHASE.ANCHORED]: ['3단계 · 문장 뽑기', '책갈피를 핀치해서 30cm 끝까지 마스킹테이프처럼 당겨보세요.'],
  [PHASE.PULLING]: ['뽑는 중...', '끝까지 당기면 분리되어 유영합니다. 중간에 놓으면 되감깁니다.'],
  [PHASE.REWINDING]: ['되감기는 중...', '끝까지 당기지 않아 책갈피 안으로 되감기고 있어요.'],
  [PHASE.SWIMMING]: ['4단계 · 바다뱀 유영', '양손 손가락을 가까이 대 보세요. 손가락 사이를 감으며 유영합니다.'],
};

function updateHud(hz = 0) {
  const [title, hint] = PHASE_COPY[scene.phase] || ['', ''];
  $('phaseTitle').textContent = title;
  const pct = scene.phase === PHASE.PULLING || scene.phase === PHASE.REWINDING
    ? ` (${Math.round(scene.pullRatio * 100)}%)`
    : '';
  $('phaseHint').textContent = hint + pct;
  $('tapeToggle').textContent = `테이프 띠: ${scene.tapeEnabled ? 'ON' : 'OFF'}`;
  $('tapeToggle').classList.toggle('is-on', scene.tapeEnabled);
  $('handToggle').textContent = `손 마스크 보기: ${showHandVisualDesktop ? 'ON' : 'OFF'}`;
  $('handToggle').classList.toggle('is-on', showHandVisualDesktop);
  $('modeToggle').textContent = mode === 'demo' ? '직접 조작 전환' : '자동 시연 보기';
  const preset = SHIMMER_PRESETS[scene.shimmerPreset] || SHIMMER_PRESETS[0];
  $('presetToggle').textContent = `윤슬: ${preset.name}`;
  if (hz > 0) {
    $('fpsBadge').textContent = `${Math.round(hz)} Hz`;
  }
}

function rebuildAtlas(fontInfo = null) {
  const { canvas: atlasCanvas } = buildTextAtlasCanvas(BOOKMARK_TEXT, 2048, 256);
  currentAtlasCanvas = atlasCanvas;
  renderer.uploadTextAtlas(atlasCanvas);
  if (fontInfo) {
    const label =
      fontInfo.source === 'system-fallback'
        ? '폰트: 시스템 폴백 (PearSans 불러온 뒤 PNG 굽기 가능)'
        : `폰트: PearSans (${fontInfo.source}) · 아틀라스 PNG 굽기 준비됨`;
    $('fontStatus').textContent = label;
  }
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  projMat = perspective(FOV, w / h, 0.035, 25.0);
}

function clientToPlane(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
  const zDist = Math.abs(desktopEye[2] - -0.44);
  const halfH = zDist * Math.tan(FOV * 0.5);
  const halfW = halfH * (rect.width / Math.max(1, rect.height));
  return [
    clamp(desktopEye[0] + nx * halfW, -0.42, 0.42),
    clamp(desktopEye[1] + ny * halfH, -0.34, 0.28),
    -0.44,
  ];
}

function manualHands() {
  const rightWrist = [pointerWorld[0] + 0.025, pointerWorld[1] - 0.125, pointerWorld[2] + 0.01];
  const right = buildSyntheticHand({
    side: 'right',
    wristPos: rightWrist,
    pinch: pointerDown,
    spread: pointerDown ? 0.85 : 1.28,
    curl: 0.11,
    yaw: -0.26,
    pitch: 0.22,
  });
  if (scene.phase === PHASE.SWIMMING) {
    const left = buildSyntheticHand({
      side: 'left',
      wristPos: [-0.11, -0.14, -0.44],
      pinch: false,
      spread: 1.32,
      curl: 0.10,
      yaw: 0.34,
      pitch: 0.18,
    });
    return [left, right];
  }
  return [right];
}

function renderDesktop(ms) {
  requestAnimationFrame(renderDesktop);
  if (xr?.session) return;

  const dt = lastMs ? clamp((ms - lastMs) / 1000, 0.001, 0.05) : 1 / 60;
  lastMs = ms;

  resizeCanvas();
  const hands = mode === 'demo' ? rehearsal.hands(dt, scene) : manualHands();
  scene.tick(dt, hands, desktopEye);
  renderer.uploadScene(scene);

  const gl = renderer.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.colorMask(true, true, true, true);
  gl.depthMask(true);
  gl.clearColor(0.02, 0.03, 0.05, 1);
  gl.clearDepth(1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  lookAt(viewMat, desktopEye, desktopTarget, [0, 1, 0]);
  renderer.renderEye(viewMat, projMat, scene, {
    passthrough: false,
    showHandVisual: showHandVisualDesktop,
    eyePos: desktopEye,
  });

  updateHud(1 / dt);
}

// ---------- CONTROLS ----------

$('tapeToggle').addEventListener('click', () => {
  scene.tapeEnabled = !scene.tapeEnabled;
  updateHud();
});

$('handToggle').addEventListener('click', () => {
  showHandVisualDesktop = !showHandVisualDesktop;
  updateHud();
});

$('presetToggle').addEventListener('click', () => {
  scene.shimmerPreset = (scene.shimmerPreset + 1) % SHIMMER_PRESETS.length;
  updateHud();
});

$('resetBtn').addEventListener('click', () => {
  scene.reanchor();
  rehearsal.reset();
  updateHud();
});

$('modeToggle').addEventListener('click', () => {
  mode = mode === 'demo' ? 'manual' : 'demo';
  scene.reanchor();
  rehearsal.reset();
  updateHud();
});

$('fontInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const info = await loadCustomFontFile(file);
    rebuildAtlas(info);
  } catch (err) {
    $('fontStatus').textContent = `폰트 로드 실패: ${err.message}`;
  }
});

$('bakeBtn').addEventListener('click', async () => {
  try {
    if (!currentAtlasCanvas) {
      rebuildAtlas();
    }
    await exportAtlasPng(currentAtlasCanvas, 'sentence-atlas.png');
    $('fontStatus').textContent = 'sentence-atlas.png 저장 완료 -> public/bookmark-snake/assets/에 넣어주세요!';
  } catch (err) {
    $('fontStatus').textContent = `PNG 굽기 실패: ${err.message}`;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'manual') {
    mode = 'manual';
  }
  pointerDown = true;
  pointerWorld = clientToPlane(e.clientX, e.clientY);
  canvas.setPointerCapture?.(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  pointerWorld = clientToPlane(e.clientX, e.clientY);
});

const releasePointer = () => {
  pointerDown = false;
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);

// ---------- BOOTSTRAP ----------

async function init() {
  const bakedImg = await loadBakedAtlasImage();
  if (bakedImg) {
    renderer.uploadTextAtlas(bakedImg);
    $('fontStatus').textContent = '아틀라스: assets/sentence-atlas.png (구운 이미지 사용 중)';
  } else {
    const fontInfo = await loadPearSansFont();
    rebuildAtlas(fontInfo);
  }

  xr = new Immersion(
    renderer,
    scene,
    (_hands, _head, _passthrough, hz) => {
      renderer.uploadScene(scene);
      updateHud(hz);
    },
    () => {
      $('xrBtn').disabled = false;
      $('xrBtn').textContent = xrModes.includes('immersive-ar') ? 'Quest AR 시작' : 'VR 시작';
    },
    (status) => {
      $('xrStatus').textContent = status;
    },
  );

  xrModes = await supportedModes();
  const xrBtn = $('xrBtn');
  if (xrModes.length > 0) {
    const preferred = xrModes.includes('immersive-ar') ? 'immersive-ar' : xrModes[0];
    xrBtn.hidden = false;
    xrBtn.textContent = preferred === 'immersive-ar' ? 'Quest AR 시작' : 'VR 시작';
    xrBtn.addEventListener('click', () => {
      xrBtn.disabled = true;
      scene.reanchor();
      xr.start(preferred);
    });
  } else {
    xrBtn.hidden = true;
    $('xrStatus').textContent = '데스크톱 프리뷰 (Quest 브라우저에서 AR 패스스루 활성화)';
  }

  const stageParam = new URLSearchParams(window.location.search).get('stage');
  if (stageParam === 'pull' || stageParam === 'swim') {
    const targetSec = stageParam === 'pull' ? 5.6 : 9.2;
    const steps = Math.round(targetSec * 60);
    for (let i = 0; i < steps; i++) {
      scene.tick(1 / 60, rehearsal.hands(1 / 60, scene), desktopEye);
    }
  }

  updateHud();
  requestAnimationFrame(renderDesktop);
}

init();
