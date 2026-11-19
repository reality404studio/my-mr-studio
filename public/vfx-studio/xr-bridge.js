// Quest 3S WebXR 브릿지: 기존 ink-crow/xr.js의 StageSpace, HandReader, supportedModes를 그대로 재사용하고,
// VFX 스튜디오용 어두운 VR 배경 / 투명 패스스루(AR) 및 전방 0.85m 손 상호작용 배치를 제공한다.
import { StageSpace, HandReader, supportedModes, entrySteps } from '../ink-crow/xr.js';
import { identity, multiply } from './renderer.js';

export { supportedModes, entrySteps };

const STARTUP_MS = 10000;

export class VfxImmersion {
  constructor(painter, engine, uploadAll, onEnd, onProgress = () => {}) {
    this.painter = painter;
    this.engine = engine;
    this.uploadAll = uploadAll;
    this.onEnd = onEnd;
    this.onProgress = onProgress;
    this.viewMatrix = identity();
    this.handReader = new HandReader();
    this.stage = new StageSpace();
    this.session = null;
    this.attempt = null;
    this.timer = null;
    this.hz = 0;
    this.reset = this.reset.bind(this);
    this.draw = this.draw.bind(this);
  }

  progress(step) {
    if (step === this.step) return;
    this.step = step;
    this.onProgress(step);
  }

  async start(mode) {
    if (this.attempt) return;
    const attempt = { session: null, message: '', finished: false, stopping: false };
    this.attempt = attempt;
    this.mode = mode;
    this.presented = false;
    this.step = null;
    this.progress('request');
    try {
      const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['hand-tracking'] });
      if (this.attempt !== attempt) { await session.end(); return; }
      attempt.session = session;
      this.session = session;
      session.addEventListener('end', () => this.finish(attempt), { once: true });
      this.armTimeout(attempt);
      this.progress('graphics');
      const gl = this.painter.gl;
      if (!gl.getContextAttributes()?.xrCompatible) await gl.makeXRCompatible();
      if (this.attempt !== attempt || attempt.stopping) return;
      this.progress('layer');
      this.layer = new XRWebGLLayer(session, gl, {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        framebufferScaleFactor: 0.86,
      });
      session.updateRenderState({ baseLayer: this.layer, depthNear: 0.035, depthFar: 80 });
      this.progress('space');
      const space = await session.requestReferenceSpace('local');
      if (this.attempt !== attempt || attempt.stopping) return;
      this.space = space;
      space.addEventListener('reset', this.reset);
      // Quest 착용 시 눈앞 0.85m 앞에 VFX 배치 → 두 손으로 바로 휘저을 수 있음
      this.engine.stageOrigin = [0, -0.08, -0.85];
      this.reset();
      this.progress('frame');
      session.requestAnimationFrame(this.draw);
    } catch (e) {
      if (this.attempt === attempt) this.fail(e);
    }
  }

  armTimeout(attempt) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.attempt !== attempt || this.presented || attempt.stopping) return;
      const vis = this.session?.visibilityState;
      if (vis === 'hidden' || vis === 'visible-blurred') { this.armTimeout(attempt); return; }
      this.fail({ name: 'Timeout' });
    }, STARTUP_MS);
  }

  fail(error) {
    const code = String(error?.name || 'Error');
    const hint = code === 'NotAllowedError' || code === 'SecurityError'
      ? 'Meta Quest Browser에서 직접 열고 사이트 XR 권한을 허용해 주세요.'
      : code === 'NotSupportedError'
        ? '다른 XR 모드(AR/VR)를 시도해 주세요.'
        : '브라우저로 돌아와 다시 시도할 수 있습니다.';
    this.stop(`${entrySteps[this.step] || 'XR'} 단계 실패: ${hint} [XR-${this.step} / ${code}]`);
  }

  stop(message = '') {
    const a = this.attempt;
    if (!a || a.stopping) return;
    a.message = message;
    a.stopping = true;
    clearTimeout(this.timer);
    if (!a.session) { this.finish(a); return; }
    try { Promise.resolve(a.session.end()).then(() => this.finish(a), () => this.finish(a)); }
    catch { this.finish(a); }
  }

  finish(a) {
    if (this.attempt !== a || a.finished) return;
    a.finished = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.space?.removeEventListener('reset', this.reset);
    this.space = null;
    this.layer = null;
    this.session = null;
    this.attempt = null;
    this.engine.stageOrigin = [0, 0, 0];
    const gl = this.painter.gl;
    if (!gl.isContextLost?.()) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.onEnd(a.message);
  }

  reset() {
    this.stage = new StageSpace();
    this.last = null;
    this.totalTime = 0;
    this.samples = 0;
    this.hz = 0;
  }

  draw(ms, frame) {
    const sess = this.session;
    if (!sess || this.attempt?.stopping || (frame.session && frame.session !== sess)) return;
    try {
      this.renderFrame(ms, frame, sess);
      if (this.session === sess && !this.attempt?.stopping) sess.requestAnimationFrame(this.draw);
    } catch (e) {
      this.fail(e);
    }
  }

  renderFrame(ms, frame, sess) {
    if (sess.visibilityState === 'hidden') {
      this.engine.interruptTracking();
      this.last = null;
      return;
    }
    const layer = sess.renderState?.baseLayer || this.layer;
    const gl = this.painter.gl;
    if (!layer) return;

    const passthrough = this.mode !== 'immersive-vr' && sess.environmentBlendMode === 'alpha-blend';
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    if (passthrough) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(0.045, 0.052, 0.064, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const pose = frame.getViewerPose(this.space);
    if (!pose?.views.length) {
      this.engine.interruptTracking();
      this.last = null;
      if (!this.presented) this.progress('pose');
      return;
    }
    if (!this.presented) this.progress('draw');

    const dt = this.last === null ? 1 / 72 : (ms - this.last) / 1000;
    this.last = ms;
    if (dt > 0 && dt < 0.25) { this.totalTime += dt; this.samples++; }
    if (this.totalTime >= 1.2) { this.hz = this.samples / this.totalTime; this.totalTime = 0; this.samples = 0; }

    const m = pose.transform.matrix;
    if (!this.stage.origin) this.stage.anchor(m);
    const hands = this.presented ? this.handReader.read(frame, this.space, this.stage, sess.inputSources) : [];

    this.engine.tick(dt, hands);
    this.uploadAll();

    let viewsDrawn = 0;
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      if (!vp || !vp.width || !vp.height) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      multiply(this.viewMatrix, view.transform.inverse.matrix, this.stage.matrix);
      this.painter.eye(this.viewMatrix, view.projectionMatrix, this.engine.groups, this.engine.time, passthrough);
      viewsDrawn++;
    }

    if (!this.presented && viewsDrawn === pose.views.length) {
      if (gl.isContextLost?.()) throw new DOMException('WebGL context lost', 'InvalidStateError');
      this.presented = true;
      clearTimeout(this.timer);
      this.onProgress('ready');
      if (sess.supportedFrameRates?.includes(72) && typeof sess.updateTargetFrameRate === 'function') {
        Promise.resolve().then(() => sess.updateTargetFrameRate(72)).catch(() => {});
      }
    }
  }
}
