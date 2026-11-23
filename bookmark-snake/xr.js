// WebXR Passthrough (immersive-ar) + Hand Tracking (21 joints + XRJointPose.radius) + Depth Buffer.
// Extended from prototype/ink-crow-webxr/public/ink-crow/xr.js with depth:true and per-joint radius.

import { classifyHand, DEFAULT_JOINT_RADII, unit } from './gesture.js?v=8d6c64b';
import { identity, multiply } from './render.js?v=8d6c64b';

export const JOINTS = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
];
for (const f of ['index', 'middle', 'ring', 'pinky']) {
  for (const s of ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']) {
    JOINTS.push(`${f}-finger-${s}`);
  }
}

export class StageSpace {
  constructor() {
    this.matrix = identity();
    this.origin = null;
  }
  anchor(m) {
    const length = Math.hypot(m[8], m[10]);
    const bx = length > 0.001 ? m[8] / length : 0;
    const bz = length > 0.001 ? m[10] / length : 1;
    this.matrix.set([bz, 0, -bx, 0, 0, 1, 0, 0, bx, 0, bz, 0, m[12], m[13], m[14], 1]);
    this.origin = [m[12], m[13], m[14]];
  }
  local(x, y, z, out = [0, 0, 0]) {
    const m = this.matrix;
    x -= m[12];
    y -= m[13];
    z -= m[14];
    out[0] = x * m[0] + z * m[2];
    out[1] = y;
    out[2] = x * m[8] + z * m[10];
    return out;
  }
}

export class HandReader {
  constructor() {
    this.sources = new WeakMap();
  }
  read(frame, ref, stage, sources) {
    const found = [];
    for (const src of sources) {
      if (!src.hand) {
        // Fallback for controller grip if hand tracking is momentarily unavailable.
        const space = src.gripSpace || src.targetRaySpace;
        if (!space) continue;
        let pose;
        try {
          pose = frame.getPose?.(space, ref);
        } catch {
          continue;
        }
        const p = pose?.transform?.position;
        const m = pose?.transform?.matrix;
        if (!p || !Number.isFinite(p.x + p.y + p.z)) continue;
        const tip = stage.local(p.x, p.y, p.z);
        const sm = stage.matrix;
        const normal = m
          ? unit([-(m[8] * sm[0] + m[10] * sm[2]), -m[9], -(m[8] * sm[8] + m[10] * sm[10])])
          : [0, 0, -1];
        const btns = src.gamepad?.buttons;
        const trigger = Boolean(btns?.[0]?.pressed || btns?.[0]?.value > 0.35);
        const side = src.handedness === 'left' ? 'left' : 'right';
        found.push({
          side,
          palm: tip,
          normal,
          forward: [0, 0, -1],
          across: [1, 0, 0],
          tip,
          thumb: tip,
          pinch: trigger,
          pinchPos: tip,
          pinchStrength: trigger ? 1 : 0,
          open: !trigger,
          width: 0.075,
          joints: null,
          radii: DEFAULT_JOINT_RADII,
        });
        continue;
      }

      let cache = this.sources.get(src);
      if (!cache) {
        const names = JOINTS.filter((n) => src.hand.get(n));
        cache = {
          names,
          spaces: names.map((n) => src.hand.get(n)),
          poses: new Float32Array(names.length * 16),
          radiiArr: new Float32Array(names.length),
          coords: Object.fromEntries(names.map((n) => [n, [0, 0, 0]])),
          radiiMap: Object.fromEntries(names.map((n) => [n, DEFAULT_JOINT_RADII[n] || 0.0085])),
          pinch: false,
        };
        this.sources.set(src, cache);
      }

      const { names, spaces, poses, radiiArr, coords, radiiMap } = cache;
      if (!spaces.length) continue;

      const joints = {};
      let batchOk = false;
      try {
        batchOk = Boolean(frame.fillPoses?.(spaces, ref, poses));
        if (batchOk && frame.fillJointRadii) {
          const radOk = frame.fillJointRadii(spaces, radiiArr);
          if (radOk) {
            for (let i = 0; i < names.length; i++) {
              const r = radiiArr[i];
              if (Number.isFinite(r) && r > 0.003 && r < 0.045) {
                radiiMap[names[i]] = r;
              }
            }
          }
        }
      } catch {
        batchOk = false;
      }

      for (let i = 0; i < names.length; i++) {
        let x;
        let y;
        let z;
        if (batchOk) {
          const j = i * 16;
          x = poses[j + 12];
          y = poses[j + 13];
          z = poses[j + 14];
        } else {
          let jp;
          try {
            jp = frame.getJointPose?.(spaces[i], ref);
          } catch {
            continue;
          }
          const pos = jp?.transform?.position;
          if (!pos) continue;
          x = pos.x;
          y = pos.y;
          z = pos.z;
          if (Number.isFinite(jp.radius) && jp.radius > 0.003 && jp.radius < 0.045) {
            radiiMap[names[i]] = jp.radius;
          }
        }
        if (Number.isFinite(x + y + z)) {
          joints[names[i]] = stage.local(x, y, z, coords[names[i]]);
        }
      }

      const hand = classifyHand(joints, src.handedness, cache.pinch, radiiMap);
      cache.pinch = hand?.pinch ?? false;
      if (hand) found.push(hand);
    }
    return found;
  }
}

export async function supportedModes() {
  if (!globalThis.isSecureContext || !navigator.xr) return [];
  const modes = ['immersive-ar', 'immersive-vr'];
  const flags = await Promise.all(
    modes.map(async (m) => {
      try {
        return await navigator.xr.isSessionSupported(m);
      } catch {
        return false;
      }
    }),
  );
  return modes.filter((_, i) => flags[i]);
}

const STARTUP_MS = 10000;

export class Immersion {
  constructor(renderer, scene, onFrame, onEnd, onStatus = () => {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.onFrame = onFrame;
    this.onEnd = onEnd;
    this.onStatus = onStatus;
    this.viewMatrix = identity();
    this.handReader = new HandReader();
    this.reset = this.reset.bind(this);
    this.draw = this.draw.bind(this);
    this.session = null;
    this.attempt = null;
    this.timer = null;
    this.stage = new StageSpace();
    this.mode = null;
    this.presented = false;
    this.lastTime = 0;
    this.hz = 0;
  }

  async start(mode) {
    if (this.attempt) return;
    const attempt = { session: null, finished: false, stopping: false };
    this.attempt = attempt;
    this.mode = mode;
    this.presented = false;
    this.onStatus('XR 세션 요청 중...');
    try {
      const session = await navigator.xr.requestSession(mode, {
        optionalFeatures: ['hand-tracking', 'local-floor'],
      });
      if (this.attempt !== attempt) {
        await session.end();
        return;
      }
      attempt.session = session;
      this.session = session;
      session.addEventListener('end', () => this.finish(attempt), { once: true });
      this.armTimeout(attempt);

      const gl = this.renderer.gl;
      if (!gl.getContextAttributes()?.xrCompatible) await gl.makeXRCompatible();
      if (this.attempt !== attempt || attempt.stopping) return;

      // Enable hardware 24-bit depth buffer for true 3D inter-finger occlusion!
      this.layer = new XRWebGLLayer(session, gl, {
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
        framebufferScaleFactor: 0.9,
      });
      session.updateRenderState({
        baseLayer: this.layer,
        depthNear: 0.035,
        depthFar: 25.0,
      });

      this.space = await session.requestReferenceSpace('local');
      if (this.attempt !== attempt || attempt.stopping) return;
      this.space.addEventListener('reset', this.reset);
      this.reset();
      this.onStatus('실행 준비 중...');
      session.requestAnimationFrame(this.draw);
    } catch (err) {
      if (this.attempt === attempt) this.fail(err);
    }
  }

  armTimeout(attempt) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.attempt !== attempt || attempt.finished || this.presented) return;
      const vis = this.session?.visibilityState;
      if (vis === 'hidden' || vis === 'visible-blurred') {
        this.armTimeout(attempt);
        return;
      }
      this.fail(new Error('XR 세션 시작 시간 초과'));
    }, STARTUP_MS);
  }

  reset() {
    this.stage = new StageSpace();
    this.lastTime = 0;
  }

  async stop() {
    const attempt = this.attempt;
    if (!attempt || attempt.finished) return;
    attempt.stopping = true;
    clearTimeout(this.timer);
    if (attempt.session) {
      try {
        await attempt.session.end();
      } catch {
        this.finish(attempt);
      }
    } else {
      this.finish(attempt);
    }
  }

  fail(err) {
    const attempt = this.attempt;
    if (!attempt || attempt.finished) return;
    this.onStatus(`XR 진입 실패: ${err?.message || err}`);
    this.finish(attempt);
  }

  finish(attempt) {
    if (attempt.finished) return;
    attempt.finished = true;
    clearTimeout(this.timer);
    if (this.attempt === attempt) {
      this.attempt = null;
      this.session = null;
      this.layer = null;
      this.space = null;
      this.onEnd();
    }
  }

  draw(t, frame) {
    const sess = frame.session;
    if (sess !== this.session) return;
    sess.requestAnimationFrame(this.draw);

    const gl = this.renderer.gl;
    const layer = this.layer;
    const pose = frame.getViewerPose(this.space);
    if (!pose) return;

    const m = pose.transform.matrix;
    if (!this.stage.origin) this.stage.anchor(m);

    const dt = this.lastTime ? Math.min(0.05, Math.max(0.001, (t - this.lastTime) / 1000)) : 1 / 72;
    this.lastTime = t;
    this.hz = this.hz ? this.hz * 0.92 + (1 / dt) * 0.08 : 1 / dt;

    const hands = this.handReader.read(frame, this.space, this.stage, sess.inputSources);
    const head = this.stage.local(m[12], m[13], m[14]);
    const passthrough = this.mode === 'immersive-ar';

    this.scene.tick(dt, hands, head);
    this.onFrame(hands, head, passthrough, this.hz);

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, passthrough ? 0 : 1);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let viewsDrawn = 0;
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      if (!vp || !vp.width || !vp.height) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      multiply(this.viewMatrix, view.transform.inverse.matrix, this.stage.matrix);
      this.renderer.renderEye(this.viewMatrix, view.projectionMatrix, this.scene, {
        passthrough,
        showHandVisual: false,
      });
      viewsDrawn++;
    }

    if (!this.presented && viewsDrawn === pose.views.length) {
      this.presented = true;
      clearTimeout(this.timer);
      this.onStatus(passthrough ? '패스스루 AR 실행 중' : 'VR 실행 중');
    }
  }
}
