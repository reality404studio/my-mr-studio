// 헤드셋 메모 모듈 (three.js WebXR). 헤드셋을 쓴 채로 말 한마디를 남기면,
// 그 순간 보던 것과 거리·각도를 같이 스튜디오로 보낸다.
//
// 다른 three.js 프로토타입에도 이 파일 하나만 복사해서 붙일 수 있어요.
//
//   import { createSpatialNotes } from './spatial-notes.js';
//   const notes = createSpatialNotes({
//     renderer, scene, camera,
//     server: 'https://<맥 IP>:5173',       // 스튜디오 주소. 같은 서버에서 열었으면 ''
//     app: 'desk-dream',                     // 스튜디오 앱 id (또는 () => id)
//     source: 'my-prototype',
//     targets: () => [{ object: mesh, id: 'objects.cd_player', label: 'CD 플레이어' }],   // 명세 경로를 id 로
//     deskFrame: () => deskGroup,            // 책상 좌표 그룹 (없으면 세션 좌표로 남김)
//     getParams: () => ({ panel_dist_m: 0.45 }),   // 지금 조절 값 (없어도 됨)
//   });
//   startButton.onclick = () => notes.prepareMic();   // 헤드셋에 들어가기 전, 사용자 클릭 안에서
//   renderer.setAnimationLoop((t, frame) => { notes.update(t); renderer.render(scene, camera); });
//
// 헤드셋 안에서 쓰는 법 (핸드트래킹)
//   왼손 손바닥을 얼굴 쪽으로 0.3초 → 손바닥 위에 빨간 버튼이 뜬다
//   오른손 검지로 버튼을 찌르면 녹음 시작. 말하고, 다시 찌르면 저장 (30초가 지나면 자동 저장)
//   녹음을 시작한 순간 보던 것(시선 25° 안에서 가장 가까운 것, 또는 오른손 검지 10cm 안의 것)이 대상이 된다
//
// 책상 좌표는 명세와 같은 규칙이다: 원점 = 책상 앞 모서리 가운데, x 오른쪽, y 위, z 책상 안쪽 (Unity 처럼 왼손 좌표).
// three.js 는 오른손 좌표라서, 책상 그룹 안의 로컬 좌표 (x, y, z) 는 명세의 (x, y, -z) 와 같다.
import * as THREE from 'three';

const PALM_HOLD_S = 0.3;      // 핸드 패턴: 손바닥 위로 0.3초
const PRESS_R = 0.02;         // 손끝이 버튼 중심 2cm 안에 들어오면 눌림
const RELEASE_R = 0.035;      // 3.5cm 밖으로 나가야 다시 누를 수 있음
const MAX_RECORD_S = 30;
const GAZE_DEG = 25;
const POINT_M = 0.10;

export function createSpatialNotes(opts) {
  const {
    renderer, scene, camera,
    server = '', app, source = 'webxr',
    targets = () => [], deskFrame = () => null, getParams = () => null,
    extraButtons = [], onStatus = () => {}, sceneName = '',
  } = opts;
  if (!app) throw new Error('createSpatialNotes: app(스튜디오 앱 id, 또는 그걸 돌려주는 함수)이 필요해요.');
  const appId = typeof app === 'function' ? app : () => app;
  const feelUrl = () => `${server.replace(/\/$/, '')}/api/p/${encodeURIComponent(appId())}/feel`;
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

  // ---------- 손 ----------
  const hands = { left: null, right: null };
  for (let i = 0; i < 2; i++) {
    const h = renderer.xr.getHand(i);
    if (!h.parent) scene.add(h);
    h.addEventListener('connected', (e) => { if (e.data?.handedness) hands[e.data.handedness] = h; });
    h.addEventListener('disconnected', (e) => { if (e.data?.handedness && hands[e.data.handedness] === h) hands[e.data.handedness] = null; });
  }
  const joint = (hand, name, out) => {
    const j = hand?.joints?.[name];
    if (!j || !j.visible) return null;
    return j.getWorldPosition(out);
  };

  // ---------- 손바닥 버튼 ----------
  const wrist = new THREE.Group();
  wrist.visible = false;
  scene.add(wrist);
  const buttons = [];
  const makeButton = (label, color, onPress, offset) => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.019, 0.022, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    const tag = makeLabel(label, { size: 0.012 });
    tag.position.set(0, 0.03, 0);
    g.add(ball, ring, tag);
    g.position.copy(offset);
    wrist.add(g);
    const b = { group: g, ball, ring, tag, onPress, armed: true };
    buttons.push(b);
    return b;
  };
  const recBtn = makeButton('메모', 0xe5484d, () => (recording ? stop() : start()), new THREE.Vector3(0, 0, 0));
  extraButtons.forEach((x, i) => makeButton(x.label, x.color ?? 0x8b8d98, x.onPress, new THREE.Vector3(0.05 * (i + 1), 0, 0)));

  const toast = makeLabel('', { size: 0.014 });
  toast.visible = false;
  scene.add(toast);
  let toastUntil = 0;
  function say(text, seconds = 2.2) {
    setLabel(toast, text);
    toast.visible = true;
    toastUntil = performance.now() + seconds * 1000;
    onStatus(text);
  }

  let palmSince = 0;
  // ---------- 녹음 ----------
  let micStream = null;
  let recorder = null;
  let chunks = [];
  let recognizer = null;
  let transcript = '';
  let recording = null; // { startedAt, snapshot }

  async function prepareMic() {
    if (!navigator.mediaDevices?.getUserMedia) { onStatus('이 브라우저는 마이크를 쓸 수 없어요. 글자 메모만 돼요.'); return false; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      onStatus('마이크 준비됨');
      return true;
    } catch (e) {
      onStatus(`마이크를 못 열었어요: ${e.message}`);
      return false;
    }
  }

  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const canTranscribe = !!SR;

  function start() {
    if (recording) return;
    recording = { startedAt: performance.now(), snapshot: snapshot() };
    transcript = '';
    chunks = [];
    if (micStream && typeof MediaRecorder !== 'undefined') {
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      try {
        recorder = new MediaRecorder(micStream, type ? { mimeType: type } : undefined);
        recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        recorder.start(250);
      } catch { recorder = null; }
    }
    if (SR) {
      try {
        recognizer = new SR();
        recognizer.lang = 'ko-KR';
        recognizer.continuous = true;
        recognizer.interimResults = false;
        recognizer.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcript += `${e.results[i][0].transcript} `;
        };
        recognizer.onerror = () => {};
        recognizer.start();
      } catch { recognizer = null; }
    }
    const what = recording.snapshot.target?.label || recording.snapshot.target?.id;
    say(`듣는 중${what ? ` · ${what}` : ''}`, MAX_RECORD_S);
  }

  async function stop() {
    if (!recording) return;
    const rec = recording;
    recording = null;
    const duration = (performance.now() - rec.startedAt) / 1000;
    const audio = await new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') return resolve(null);
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || chunks[0].type }) : null);
      recorder.stop();
    });
    if (recognizer) { try { recognizer.stop(); } catch {} await wait(400); }
    recorder = null;
    recognizer = null;
    say('저장하는 중…', 10);
    try {
      const note = await send({ ...rec.snapshot, text: transcript.trim(), duration_s: duration }, audio);
      say(`${note.id} 저장됨${note.text ? '' : ' (녹음만)'}`);
      return note;
    } catch (e) {
      say(`저장 못 함: ${e.message}`, 4);
      return null;
    }
  }

  // 글자 메모 (헤드셋 밖 미리보기, 단축키 등)
  async function note(text, extra = {}) {
    return send({ ...snapshot(), ...extra, text });
  }

  async function send(body, audio) {
    const api = feelUrl();
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-actor': 'headset' },
      body: JSON.stringify({ ...body, source, scene: sceneName || undefined, textBy: body.text ? 'speech' : undefined, expectAudio: !!audio }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (audio) {
      const up = await fetch(`${api}/${encodeURIComponent(data.id)}/audio`, { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm', 'x-actor': 'headset' }, body: audio });
      if (!up.ok) throw new Error(`녹음 올리기 실패 (HTTP ${up.status})`);
      return up.json();
    }
    return data;
  }

  // ---------- 그 순간의 공간 정보 ----------
  function head() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    cam.updateMatrixWorld();
    const pos = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    return { pos, fwd };
  }

  function snapshot() {
    const h = head();
    const tips = {
      left: joint(hands.left, 'index-finger-tip', new THREE.Vector3()),
      right: joint(hands.right, 'index-finger-tip', new THREE.Vector3()),
    };
    const wristPos = {
      left: joint(hands.left, 'wrist', new THREE.Vector3()),
      right: joint(hands.right, 'wrist', new THREE.Vector3()),
    };

    // 대상 고르기: 오른손 검지 10cm 안의 것이 먼저, 없으면 시선 25° 안에서 각도가 가장 작은 것
    let target = null;
    let how = 'none';
    const list = targets().filter((t) => t.object?.visible !== false);
    const centerOf = (t) => new THREE.Box3().setFromObject(t.object).getCenter(new THREE.Vector3());
    if (tips.right) {
      let best = POINT_M;
      for (const t of list) { const d = centerOf(t).distanceTo(tips.right); if (d < best) { best = d; target = t; how = 'point'; } }
    }
    if (!target) {
      let best = GAZE_DEG;
      for (const t of list) {
        const deg = THREE.MathUtils.radToDeg(h.fwd.angleTo(centerOf(t).sub(h.pos)));
        if (deg < best) { best = deg; target = t; how = 'gaze'; }
      }
    }

    let rel;
    if (target) {
      const c = centerOf(target);
      const flat = new THREE.Vector3(c.x - h.pos.x, 0, c.z - h.pos.z);
      const fwdFlat = new THREE.Vector3(h.fwd.x, 0, h.fwd.z).normalize();
      const side = fwdFlat.lengthSq() && flat.lengthSq() ? THREE.MathUtils.radToDeg(Math.atan2(fwdFlat.clone().cross(flat).y * -1, fwdFlat.dot(flat))) : 0;
      const hand = [tips.left, tips.right].filter(Boolean).map((p) => p.distanceTo(c));
      rel = {
        distance_m: h.pos.distanceTo(c),
        below_eye_deg: THREE.MathUtils.radToDeg(Math.atan2(h.pos.y - c.y, Math.hypot(flat.x, flat.z))),
        side_deg: side,
        hand_m: hand.length ? Math.min(...hand) : undefined,
      };
    }

    // 책상 좌표가 있으면 책상 좌표로 (명세와 같은 규칙), 없으면 세션 좌표로
    const desk = deskFrame();
    const toFrame = desk
      ? (p) => { if (!p) return undefined; desk.updateMatrixWorld(); const l = desk.worldToLocal(p.clone()); return [l.x, l.y, -l.z]; }
      : (p) => (p ? [p.x, p.y, p.z] : undefined);
    const dirFrame = desk
      ? (v) => { const q = desk.getWorldQuaternion(new THREE.Quaternion()).invert(); const l = v.clone().applyQuaternion(q); return [l.x, l.y, -l.z]; }
      : (v) => [v.x, v.y, v.z];

    return {
      target: target ? { id: target.id, label: target.label, how } : { how: 'none' },
      rel,
      pose: {
        frame: desk ? 'desk' : 'session',
        head: { pos: toFrame(h.pos), fwd: dirFrame(h.fwd) },
        left: tips.left ? { tip: toFrame(tips.left), wrist: toFrame(wristPos.left) } : undefined,
        right: tips.right ? { tip: toFrame(tips.right), wrist: toFrame(wristPos.right) } : undefined,
      },
      params: getParams() || undefined,
    };
  }

  // ---------- 매 프레임 ----------
  let last = 0;
  function update(time = performance.now()) {
    const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
    last = time;
    const h = head();

    // 손바닥이 얼굴을 보는지 (왼손: 검지·새끼 손허리뼈와 손목으로 손바닥 면을 만든다)
    const L = hands.left;
    const w = joint(L, 'wrist', tmp.a);
    const im = joint(L, 'index-finger-metacarpal', tmp.b);
    const pm = joint(L, 'pinky-finger-metacarpal', tmp.c);
    let palmUp = false;
    if (w && im && pm) {
      const center = new THREE.Vector3().addVectors(im, pm).multiplyScalar(0.5).lerp(w, 0.4);
      const normal = new THREE.Vector3().subVectors(im, w).cross(new THREE.Vector3().subVectors(pm, w)).normalize();
      const toHead = tmp.d.subVectors(h.pos, center).normalize();
      palmUp = normal.dot(toHead) > 0.55;
      wrist.position.copy(center).addScaledVector(normal, 0.06);
      // 버튼 줄은 손바닥 위에서 머리 쪽을 바라보게, 가로는 수평으로
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toHead).normalize();
      if (right.lengthSq() > 0) wrist.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3().crossVectors(toHead, right), toHead));
    }
    palmSince = palmUp ? palmSince + dt : 0;
    wrist.visible = !!(w && (recording || palmSince >= PALM_HOLD_S));

    // 버튼 찌르기 (오른손 검지 끝)
    const tip = joint(hands.right, 'index-finger-tip', new THREE.Vector3());
    for (const b of buttons) {
      if (!wrist.visible || !tip) { b.armed = true; continue; }
      const d = b.group.getWorldPosition(new THREE.Vector3()).distanceTo(tip);
      if (b.armed && d < PRESS_R) { b.armed = false; b.onPress(); }
      else if (!b.armed && d > RELEASE_R) b.armed = true;
    }

    // 녹음 중 표시
    if (recording) {
      const s = 1 + 0.18 * Math.sin(time / 160);
      recBtn.ring.scale.setScalar(s);
      recBtn.ball.material.color.setHex(0xff2d2d);
      if ((performance.now() - recording.startedAt) / 1000 > MAX_RECORD_S) stop();
    } else {
      recBtn.ring.scale.setScalar(1);
      recBtn.ball.material.color.setHex(0xe5484d);
    }

    // 알림 글자는 머리에 붙이지 않고, 손바닥 버튼 근처(없으면 시선 앞 0.6m)에 둔다
    if (toast.visible) {
      if (performance.now() > toastUntil && !recording) toast.visible = false;
      const anchor = wrist.visible ? wrist.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0)) : h.pos.clone().addScaledVector(h.fwd, 0.6).add(new THREE.Vector3(0, -0.12, 0));
      toast.position.lerp(anchor, toast.userData.placed ? 0.15 : 1);
      toast.userData.placed = true;
      toast.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(h.pos, toast.position, new THREE.Vector3(0, 1, 0))));
    }
  }

  return { prepareMic, start, stop, note, update, snapshot, say, get recording() { return !!recording; }, canTranscribe, hands };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 글자 판 (캔버스 텍스처). size = 글자 높이(m)
export function makeLabel(text, { size = 0.02, color = '#ffffff', bg = 'rgba(20,20,28,0.78)' } = {}) {
  const canvas = document.createElement('canvas');
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 10;
  mesh.userData.label = { canvas, size, color, bg };
  setLabel(mesh, text);
  return mesh;
}

export function setLabel(mesh, text) {
  const { canvas, size, color, bg } = mesh.userData.label;
  const ctx = canvas.getContext('2d');
  const px = 48;
  const font = `500 ${px}px "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.max(8, Math.ceil(ctx.measureText(text || ' ').width) + px);
  const h = Math.ceil(px * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(0, 0, w, h, r) : ctx.rect(0, 0, w, h);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text || '', px / 2, h / 2 + 2);
  mesh.material.map?.dispose();
  mesh.material.map = new THREE.CanvasTexture(canvas);
  mesh.material.map.colorSpace = THREE.SRGBColorSpace;
  mesh.material.needsUpdate = true;
  const scale = size / px;
  mesh.scale.set(w * scale * 1.0, h * scale, 1);
}
