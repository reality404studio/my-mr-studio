// 헤드셋 그레이박스: 앱 명세(scene_spec.yaml)의 objects 를 책상 위 회색 상자로 띄운다.
// 빌드 없이 Quest 브라우저에서 배치·거리·높이를 바로 만져 보고, 그 자리에서 헤드셋 메모를 남기는 용도.
// 에이전트가 명세 값을 고치면 헤드셋 안의 상자가 바로 움직인다 (스튜디오의 파일 변경 알림을 듣는다).
//
// 주소: /xr.html?app=<앱 id>
//
// 명세 해석 (그레이박스 기준, 실제 앱 구현과 다를 수 있음)
//   desk.size_m = [가로(x), 깊이(z)], 원점 = 앞 모서리 가운데, y = 책상 윗면
//   objects[].pos_m = 바닥 가운데 점, size_m = [x, y, z]. size_m 이 없으면 10cm 상자
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSpatialNotes, makeLabel, setLabel } from './spatial-notes.js';

const DWELL_S = 0.6;          // 핸드 패턴: 드웰 0.6초
const DWELL_TOL_M = 0.008;    // 그동안 8mm 안에서 멈춰 있으면 확정
const FALLBACK_DESK_H = 0.75;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const setStatus = (t, rec = false) => { statusEl.textContent = t; statusEl.classList.toggle('is-rec', rec); };

const params = new URLSearchParams(location.search);
let app = params.get('app');

// ---------- 장면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, 1.22, 0.42);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a7a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.4, 2, 0.6);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, FALLBACK_DESK_H, -0.25);
controls.update();

// 책상 좌표 그룹. 로컬 (x, y, z) = 명세 (x, y, -z)
const desk = new THREE.Group();
desk.position.set(0, FALLBACK_DESK_H, 0);
scene.add(desk);
const deskDecor = new THREE.Group();
const content = new THREE.Group();
desk.add(deskDecor, content);

let spec = null;
let targets = [];

function buildDesk(d = {}) {
  deskDecor.clear();
  const [w, depth] = Array.isArray(d.size_m) ? d.size_m : [1.0, 0.5];
  const pts = [[-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, 0, -depth], [-w / 2, 0, -depth]].map((p) => new THREE.Vector3(...p));
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.8 }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, depth), new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.z = -depth / 2;
  const grid = new THREE.GridHelper(Math.max(w, depth), Math.round(Math.max(w, depth) / 0.1), 0x8fb6ff, 0x8fb6ff);
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  grid.position.z = -depth / 2;
  grid.scale.set(w / Math.max(w, depth), 1, depth / Math.max(w, depth));
  const origin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  deskDecor.add(fill, grid, outline, origin);
}

function buildObjects(list = []) {
  content.clear();
  targets = [];
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || !Array.isArray(o.pos_m)) continue;
    const [x, y, z] = o.pos_m.map(Number);
    const [sx, sy, sz] = Array.isArray(o.size_m) ? o.size_m.map(Number) : [0.1, 0.1, 0.1];
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color: 0xb8b8c4, transparent: true, opacity: 0.88 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    g.add(box, edges);
    g.position.set(x, y + sy / 2, -z);
    const tag = makeLabel(o.id || '?', { size: 0.016 });
    tag.position.set(0, sy / 2 + 0.03, 0);
    g.add(tag);
    g.userData.tag = tag;
    content.add(g);
    targets.push({ object: g, id: `objects.${o.id}`, label: o.role ? `${o.id}` : o.id });
  }
}

async function loadSpec() {
  if (!app) {
    const r = await fetch('/api/projects').then((x) => x.json());
    app = r.apps?.[0]?.id;
    if (!app) { setStatus('앱이 없어요. 스튜디오에서 앱을 먼저 만들어요.'); return; }
    history.replaceState(null, '', `?app=${encodeURIComponent(app)}`);
  }
  const res = await fetch(`/api/p/${encodeURIComponent(app)}/spec`);
  const data = await res.json();
  if (!res.ok) { setStatus(data.error || '명세를 못 읽었어요.'); return; }
  spec = data.data || {};
  $('title').textContent = spec.meta?.title ? `${spec.meta.title} · 그레이박스` : '헤드셋 그레이박스';
  document.title = $('title').textContent;
  buildDesk(spec.desk);
  buildObjects(spec.objects);
  if (!calibrated && !renderer.xr.isPresenting) desk.position.y = Number(spec.desk?.height_m) || FALLBACK_DESK_H;
  $('sub').textContent = `${app} · 상자 ${targets.length}개. 에이전트가 명세를 고치면 바로 움직여요.`;
}

// 명세가 바뀌면 다시 그린다
try {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'change' && app && m.paths?.some((p) => p === `apps/${app}/scene_spec.yaml`)) loadSpec().then(() => notes.say('명세가 바뀌어서 다시 그렸어요'));
  };
} catch {}

// ---------- 책상 맞추기 (검지 끝 드웰) ----------
let calibrated = false;
let calibrating = false;
const samples = [];
const dwellRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
dwellRing.visible = false;
scene.add(dwellRing);
const hint = makeLabel('검지 끝을 책상 앞 모서리 가운데에 대고 멈춰요', { size: 0.016 });
hint.visible = false;
scene.add(hint);

function beginCalibration() {
  calibrating = true;
  samples.length = 0;
  hint.visible = true;
  setLabel(hint, '검지 끝을 책상 앞 모서리 가운데에 대고 멈춰요');
}

function headPose() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  return { pos: cam.getWorldPosition(new THREE.Vector3()), fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())) };
}

function updateCalibration(time) {
  const h = headPose();
  // 안내 글자는 시선 앞 아래쪽에 천천히 따라오게 (머리에 고정하지 않음)
  if (hint.visible) {
    const want = h.pos.clone().addScaledVector(new THREE.Vector3(h.fwd.x, 0, h.fwd.z).normalize(), 0.55).add(new THREE.Vector3(0, -0.18, 0));
    hint.position.lerp(want, 0.08);
    hint.lookAt(h.pos);
  }
  if (!calibrating) { dwellRing.visible = false; return; }
  const tip = ['right', 'left'].map((k) => notes.hands[k]?.joints?.['index-finger-tip']).find((j) => j?.visible);
  if (!tip) { samples.length = 0; dwellRing.visible = false; return; }
  const p = tip.getWorldPosition(new THREE.Vector3());
  if (h.pos.y - p.y < 0.2) { samples.length = 0; dwellRing.visible = false; return; } // 책상보다 높은 곳은 무시
  samples.push({ t: time, p });
  while (samples.length && time - samples[0].t > DWELL_S * 1000) samples.shift();
  const mean = samples.reduce((a, s) => a.add(s.p), new THREE.Vector3()).multiplyScalar(1 / samples.length);
  const still = samples.every((s) => s.p.distanceTo(mean) < DWELL_TOL_M);
  const span = samples.length ? (time - samples[0].t) / 1000 : 0;
  dwellRing.visible = true;
  dwellRing.position.copy(p);
  dwellRing.lookAt(h.pos);
  dwellRing.scale.setScalar(still ? 1 + 0.6 * (1 - Math.min(span / DWELL_S, 1)) : 1.8);
  if (!still) { samples.splice(0, samples.length - 1); return; }
  if (span < DWELL_S * 0.95) return;

  // 확정: 원점 = 평균 손끝 (손끝 패드 6mm 아래), 앞 = 머리 앞 방향을 수평으로
  const pad = (Number(spec?.desk?.calibration?.fingertip_pad_offset_mm) || 6) / 1000;
  const fwd = new THREE.Vector3(h.fwd.x, 0, h.fwd.z).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const back = fwd.clone().negate();
  desk.position.copy(mean).add(new THREE.Vector3(0, -pad, 0));
  desk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), back));
  calibrated = true;
  calibrating = false;
  samples.length = 0;
  dwellRing.visible = false;
  hint.visible = false;
  notes.say('책상 맞춤 완료');
}

// ---------- 헤드셋 메모 ----------
const notes = createSpatialNotes({
  renderer, scene, camera,
  app: () => app,
  source: 'webxr-greybox',
  sceneName: 'greybox',
  targets: () => targets,
  deskFrame: () => (calibrated || !renderer.xr.isPresenting ? desk : null),
  extraButtons: [{ label: '책상', onPress: () => beginCalibration() }],
  onStatus: (t) => setStatus(t, notes?.recording),
});

// ---------- 화면 버튼 ----------
$('mic').onclick = async () => {
  const ok = await notes.prepareMic();
  $('mic').textContent = ok ? '마이크 준비됨' : '마이크 없이 계속';
  $('enter').disabled = false;
  setStatus(`${ok ? '마이크 준비됨' : '마이크 없음 (글자 메모만)'} · 받아쓰기 ${notes.canTranscribe ? '가능' : '안 됨: 녹음만 올라가고, 스튜디오에서 듣고 적어요'}`);
};

$('enter').onclick = async () => {
  if (!navigator.xr) { setStatus('이 브라우저는 WebXR 을 못 써요. Quest 브라우저에서 열어 주세요.'); return; }
  const mode = (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) ? 'immersive-ar' : 'immersive-vr';
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    calibrated = false;
    // 맞추기 전에는 시선 앞 아래쪽에 임시로 둔다
    setTimeout(() => {
      const h = headPose();
      const fwd = new THREE.Vector3(h.fwd.x, 0, h.fwd.z).normalize();
      desk.position.copy(h.pos).addScaledVector(fwd, 0.3).setY(h.pos.y - 0.45);
      desk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), new THREE.Vector3(0, 1, 0), fwd.clone().negate()));
      beginCalibration();
    }, 300);
    session.addEventListener('end', () => { hint.visible = false; calibrating = false; setStatus('헤드셋에서 나왔어요'); });
    setStatus(mode === 'immersive-ar' ? '패스스루로 들어갔어요' : 'VR 로 들어갔어요 (패스스루를 못 씀)');
  } catch (e) {
    setStatus(`들어가지 못했어요: ${e.message}. 보안 연결(https 또는 localhost)인지 확인해요.`);
  }
};

// 헤드셋 밖 미리보기: 화면 가운데 보던 것에 메모
const hold = $('hold');
const down = (e) => { e.preventDefault(); if (!notes.recording) { notes.start(); hold.classList.add('is-rec'); hold.textContent = '듣는 중… 손을 떼면 저장'; } };
const up = async () => { if (notes.recording) { hold.classList.remove('is-rec'); hold.textContent = '누르고 있는 동안 녹음 (헤드셋 밖 미리보기)'; await notes.stop(); } };
hold.addEventListener('pointerdown', down);
hold.addEventListener('pointerup', up);
hold.addEventListener('pointerleave', up);
$('noteForm').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('noteText').value.trim();
  if (!text) return;
  try {
    const n = await notes.note(text, { textBy: 'typed' });
    $('noteText').value = '';
    setStatus(`${n.id} 저장됨${n.target?.id ? ` · ${n.target.id}` : ''}`);
  } catch (x) { setStatus(`저장 못 함: ${x.message}`); }
};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 미리보기에서는 화면 가운데 상자를 살짝 밝힌다 (무엇에 메모가 붙을지 보이게)
function highlight() {
  const snap = notes.snapshot();
  for (const t of targets) {
    const box = t.object.children[0];
    box.material.color.setHex(snap.target?.id === t.id ? 0xdfe6ff : 0xb8b8c4);
  }
}

let frameN = 0;
renderer.setAnimationLoop((time) => {
  if (!renderer.xr.isPresenting) controls.update();
  notes.update(time);
  if (renderer.xr.isPresenting) updateCalibration(time);
  if (++frameN % 6 === 0) highlight();
  renderer.render(scene, camera);
});

loadSpec().catch((e) => setStatus(`명세를 못 읽었어요: ${e.message}`));

// 콘솔에서 확인용 (헤드셋 원격 디버깅 때 window.greybox.notes.snapshot() 등)
window.greybox = { notes, desk, scene, THREE, get targets() { return targets; } };
