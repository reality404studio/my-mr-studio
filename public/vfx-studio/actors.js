// 가상 테스트 액터(더미 캐릭터 + 무기 소켓 히스토리 + 투사체 발사→충돌) 모듈.
// 엑셀 I01/I04(소켓 히스토리 리본), I02/I05(적중 임펄스 이벤트), E07(전극→타깃 경로)을
// 제자리 루프에 가두지 않고 실전 전투 모션 위에서 즉시 검수하기 위해 사용한다.

export const ACTOR_PRESETS = Object.freeze({
  idle: {
    id: 'idle',
    label: '제자리 (기본)',
    description: '원점 기준 루프 · 오라/폭발/장판/포털 검수',
  },
  'sword-swing': {
    id: 'sword-swing',
    label: '검 휘두르기',
    description: '더미 무기가 호를 그리며 스윙 · 소켓 히스토리 검격 리본 검수',
  },
  'projectile-hit': {
    id: 'projectile-hit',
    label: '발사 → 적중',
    description: '시전→비행→타깃 충돌(OnHit) 이벤트 체인 검수',
  },
  'hand-collider': {
    id: 'hand-collider',
    label: '자동 손 휘젓기',
    description: '가상 손이 8자 궤적으로 파티클을 휘저으며 SplatFeel 물성 테스트',
  },
});

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// Catmull-Rom 1D 보간 (소켓 히스토리 부드러운 리샘플링용)
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export class ActorRig {
  constructor() {
    this.mode = 'idle';
    this.cycleDuration = 2.2;
    this.clock = 0;
    this.phase = 'idle'; // 'anticipation' | 'active' | 'impact' | 'decay' | 'idle'
    this.justHit = false;
    this.hitPulse = 0;

    // 주요 소켓 좌표 (스테이지 로컬 미터 단위)
    this.sockets = {
      origin: [0, 0, 0],
      casterHand: [-0.85, 0.14, 0.0],
      target: [0.95, 0.08, 0.0],
      bladeBase: [0, 0.08, 0],
      bladeTip: [0, 0.72, 0],
      projectile: [0, 0.1, 0],
      projectileVel: [1, 0, 0],
      impact: [0.95, 0.08, 0.0],
      impactNormal: [-1, 0, 0],
    };

    // 무기 소켓 히스토리 버퍼 (검격·리본 리샘플링용, 최근 28샘플)
    this.maxHistory = 28;
    this.bladeHistory = [];

    // 자동 손 휘젓기 콜라이더
    this.autoHandCollider = null;

    // 미니멀 실루엣 렌더링용 라인 세그먼트 버퍼 (x0,y0,z0, x1,y1,z1)
    this.lineVerts = new Float32Array(256 * 6);
    this.lineCount = 0;
  }

  setMode(mode) {
    if (!ACTOR_PRESETS[mode]) mode = 'idle';
    this.mode = mode;
    this.clock = 0;
    this.bladeHistory = [];
    this.justHit = false;
    this.hitPulse = 0;
    this.autoHandCollider = null;
    this.update(0.016, -0.42);
  }

  reset() {
    this.clock = 0;
    this.bladeHistory = [];
    this.justHit = false;
    this.hitPulse = 0;
  }

  pushBladeSample(base, tip, activeWeight) {
    this.bladeHistory.unshift({
      base: [base[0], base[1], base[2]],
      tip: [tip[0], tip[1], tip[2]],
      w: activeWeight,
    });
    if (this.bladeHistory.length > this.maxHistory) {
      this.bladeHistory.length = this.maxHistory;
    }
  }

  // 소켓 히스토리를 Catmull-Rom으로 부드럽게 리샘플링해 반환
  sampleBladeRibbon(steps = 28) {
    const h = this.bladeHistory;
    if (h.length < 4) return [];
    const out = [];
    const last = h.length - 1;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const f = u * (last - 1);
      const idx = Math.min(last - 1, Math.floor(f));
      const t = f - idx;
      const i0 = Math.max(0, idx - 1);
      const i1 = idx;
      const i2 = Math.min(last, idx + 1);
      const i3 = Math.min(last, idx + 2);
      const p0 = h[i0], p1 = h[i1], p2 = h[i2], p3 = h[i3];
      const tip = [
        catmullRom(p0.tip[0], p1.tip[0], p2.tip[0], p3.tip[0], t),
        catmullRom(p0.tip[1], p1.tip[1], p2.tip[1], p3.tip[1], t),
        catmullRom(p0.tip[2], p1.tip[2], p2.tip[2], p3.tip[2], t),
      ];
      const base = [
        catmullRom(p0.base[0], p1.base[0], p2.base[0], p3.base[0], t),
        catmullRom(p0.base[1], p1.base[1], p2.base[1], p3.base[1], t),
        catmullRom(p0.base[2], p1.base[2], p2.base[2], p3.base[2], t),
      ];
      const w = p1.w + (p2.w - p1.w) * t;
      out.push({ tip, base, u, w });
    }
    return out;
  }

  update(dt, floorY = -0.42) {
    const prevCycle = Math.floor(this.clock / this.cycleDuration);
    this.clock += Math.max(0, dt);
    const curCycle = Math.floor(this.clock / this.cycleDuration);
    const u = (this.clock % this.cycleDuration) / this.cycleDuration;
    this.justHit = false;
    this.hitPulse = Math.max(0, this.hitPulse - dt * 2.6);
    this.autoHandCollider = null;

    if (this.mode === 'sword-swing') {
      // 0.00..0.22 예고(뒤로 젖힘) → 0.22..0.52 빠른 대각 참격 → 0.52..1.00 잔심·복귀
      const shoulder = [-0.18, floorY + 0.62, 0.0];
      let angle, tilt, activeWeight;
      if (u < 0.22) {
        this.phase = 'anticipation';
        const k = u / 0.22;
        angle = -1.65 - 0.35 * Math.sin(k * Math.PI * 0.5);
        tilt = 0.28;
        activeWeight = 0.25;
      } else if (u < 0.52) {
        this.phase = 'active';
        const k = (u - 0.22) / 0.30;
        // 급가속 후 감속 (S-curve)
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        angle = -2.0 + ease * 3.75;
        tilt = 0.28 - ease * 0.62;
        activeWeight = Math.sin(k * Math.PI);
        if (Math.abs(k - 0.55) < dt / (this.cycleDuration * 0.30) + 0.03 && this.hitPulse <= 0.1) {
          this.justHit = true;
          this.hitPulse = 1.0;
        }
      } else {
        this.phase = 'decay';
        const k = (u - 0.52) / 0.48;
        angle = 1.75 - k * 3.4;
        tilt = -0.34 + k * 0.62;
        activeWeight = 0.08 * (1 - k);
      }

      const armR = 0.30;
      const bladeLen = 0.72;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const dirY = Math.sin(tilt);
      const bx = shoulder[0] + dirX * armR;
      const by = shoulder[1] + dirY * armR;
      const bz = shoulder[2] + dirZ * armR;
      const tx = bx + dirX * bladeLen;
      const ty = by + dirY * bladeLen * 1.15;
      const tz = bz + dirZ * bladeLen;

      this.sockets.casterHand = [bx, by, bz];
      this.sockets.bladeBase = [bx, by, bz];
      this.sockets.bladeTip = [tx, ty, tz];
      this.sockets.target = [0.68, floorY + 0.52, 0.08];
      this.sockets.impact = [tx, ty, tz];
      this.sockets.origin = [(bx + tx) * 0.5, (by + ty) * 0.5, (bz + tz) * 0.5];
      this.pushBladeSample(this.sockets.bladeBase, this.sockets.bladeTip, activeWeight);
    } else if (this.mode === 'projectile-hit') {
      // 0.00..0.24 시전·차징 → 0.24..0.54 고속 비행 → 0.54 타깃 충돌(OnHit) → 0.54..1.00 잔여
      const start = [-0.92, floorY + 0.58, 0.0];
      const target = [0.92, floorY + 0.52, 0.0];
      this.sockets.casterHand = start;
      this.sockets.target = target;
      this.sockets.impact = target;
      this.sockets.impactNormal = [-1, 0.15, 0];

      const prevU = ((this.clock - dt) % this.cycleDuration + this.cycleDuration) % this.cycleDuration / this.cycleDuration;
      if (u < 0.24) {
        this.phase = 'anticipation';
        this.sockets.projectile = start;
        this.sockets.projectileVel = [0.2, 0, 0];
      } else if (u < 0.54) {
        this.phase = 'active';
        const k = (u - 0.24) / 0.30;
        const arcY = Math.sin(k * Math.PI) * 0.16;
        const px = start[0] + (target[0] - start[0]) * k;
        const py = start[1] + (target[1] - start[1]) * k + arcY;
        this.sockets.projectile = [px, py, 0];
        this.sockets.projectileVel = [(target[0] - start[0]) / (this.cycleDuration * 0.30), Math.cos(k * Math.PI) * 0.4, 0];
      } else {
        this.phase = 'impact';
        this.sockets.projectile = target;
        this.sockets.projectileVel = [0, 0, 0];
        if ((prevU < 0.54 && u >= 0.54) || (curCycle !== prevCycle && u >= 0.54)) {
          this.justHit = true;
          this.hitPulse = 1.0;
        }
      }
      this.sockets.origin = this.sockets.projectile;
    } else if (this.mode === 'hand-collider') {
      // 8자(Lissajous) 가상 손 궤적으로 파티클을 자동 휘저음
      this.phase = 'active';
      const w = this.clock * 2.1;
      const hx = Math.sin(w) * 0.38;
      const hy = Math.sin(w * 2) * 0.16 + 0.02;
      const hz = Math.cos(w) * 0.26;
      const vx = Math.cos(w) * 0.38 * 2.1;
      const vy = Math.cos(w * 2) * 0.16 * 4.2;
      const vz = -Math.sin(w) * 0.26 * 2.1;
      this.autoHandCollider = {
        position: [hx, hy, hz],
        velocity: [vx, vy, vz],
        radius: 0.135,
        strength: 1.0,
      };
      this.sockets.casterHand = [hx, hy, hz];
      this.sockets.origin = [0, 0, 0];
      this.sockets.target = [0.85, floorY + 0.52, 0];
    } else {
      this.phase = 'idle';
      this.sockets.origin = [0, 0, 0];
      this.sockets.casterHand = [-0.55, floorY + 0.58, 0];
      this.sockets.target = [0.85, floorY + 0.52, 0];
      this.sockets.impact = [0, 0, 0];
      this.sockets.projectile = [0, 0, 0];
      // 기본 상태에서도 리본 테스트용 부드러운 가상 궤적 유지
      const a = this.clock * 2.3;
      const bx = Math.cos(a) * 0.22;
      const bz = Math.sin(a) * 0.22;
      const tx = Math.cos(a) * 0.62;
      const ty = Math.sin(a * 1.5) * 0.18 + 0.08;
      const tz = Math.sin(a) * 0.62;
      this.sockets.bladeBase = [bx, 0.0, bz];
      this.sockets.bladeTip = [tx, ty, tz];
      this.pushBladeSample(this.sockets.bladeBase, this.sockets.bladeTip, 0.85);
    }

    this.buildSilhouetteLines(floorY);
  }

  addLine(x0, y0, z0, x1, y1, z1) {
    if (this.lineCount >= 255) return;
    let j = this.lineCount++ * 6;
    const v = this.lineVerts;
    v[j++] = x0; v[j++] = y0; v[j++] = z0;
    v[j++] = x1; v[j++] = y1; v[j] = z1;
  }

  addRing(cx, cy, cz, r, segs = 20) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = ((i + 1) / segs) * TAU;
      this.addLine(
        cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r,
        cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r,
      );
    }
  }

  // 미니멀 반투명 마네킹 실루엣 (캐릭터 스케일 0.95m 컴팩트 스튜디오 비율)
  addMannequin(cx, floorY, cz, height = 0.96) {
    const rTorso = height * 0.13;
    const headY = floorY + height * 0.88;
    const shoulderY = floorY + height * 0.72;
    const waistY = floorY + height * 0.44;
    // 척추/몸통 수직선 2개 + 어깨/골반/발 링
    this.addLine(cx - rTorso, waistY, cz, cx - rTorso, shoulderY, cz);
    this.addLine(cx + rTorso, waistY, cz, cx + rTorso, shoulderY, cz);
    this.addLine(cx, floorY, cz, cx, headY - height * 0.07, cz);
    // 다리
    this.addLine(cx - rTorso * 0.65, floorY, cz, cx - rTorso * 0.55, waistY, cz);
    this.addLine(cx + rTorso * 0.65, floorY, cz, cx + rTorso * 0.55, waistY, cz);
    // 머리·어깨·허리 링
    this.addRing(cx, headY, cz, height * 0.075, 12);
    this.addRing(cx, shoulderY, cz, rTorso, 14);
    this.addRing(cx, waistY, cz, rTorso * 0.82, 12);
    this.addRing(cx, floorY + 0.004, cz, rTorso * 1.25, 16);
  }

  // 타깃 기둥 (피격 임펄스 흔들림 포함)
  addTargetPillar(cx, floorY, cz) {
    const wobble = Math.sin(this.hitPulse * 24) * this.hitPulse * 0.05;
    const h = 0.92;
    const r = 0.14;
    this.addRing(cx, floorY + 0.005, cz, r * 1.15, 16);
    this.addRing(cx + wobble * 0.5, floorY + h * 0.5, cz, r, 14);
    this.addRing(cx + wobble, floorY + h, cz, r * 0.9, 14);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      this.addLine(
        cx + Math.cos(a) * r, floorY, cz + Math.sin(a) * r,
        cx + wobble + Math.cos(a) * r * 0.9, floorY + h, cz + Math.sin(a) * r * 0.9,
      );
    }
  }

  buildSilhouetteLines(floorY) {
    this.lineCount = 0;
    if (this.mode === 'sword-swing') {
      this.addMannequin(-0.22, floorY, 0, 0.96);
      const b = this.sockets.bladeBase;
      const t = this.sockets.bladeTip;
      this.addLine(b[0], b[1], b[2], t[0], t[1], t[2]);
      // 검 코등이(Crossguard)
      this.addLine(b[0], b[1] - 0.07, b[2], b[0], b[1] + 0.07, b[2]);
    } else if (this.mode === 'projectile-hit') {
      this.addMannequin(-0.98, floorY, 0, 0.96);
      this.addTargetPillar(0.92, floorY, 0);
      // 발사선 가이드
      const s = this.sockets.casterHand;
      const e = this.sockets.target;
      this.addLine(s[0], s[1], s[2], e[0], e[1], e[2]);
    } else if (this.mode === 'hand-collider' && this.autoHandCollider) {
      const p = this.autoHandCollider.position;
      this.addRing(p[0], p[1], p[2], this.autoHandCollider.radius, 18);
      this.addLine(p[0] - 0.06, p[1], p[2], p[0] + 0.06, p[1], p[2]);
      this.addLine(p[0], p[1] - 0.06, p[2], p[0], p[1] + 0.06, p[2]);
    } else {
      // idle: 원점 뒤쪽 스케일 비교용 반투명 마네킹 1체 (시야 방해 최소화)
      this.addMannequin(0, floorY, -0.58, 0.96);
    }
  }
}
