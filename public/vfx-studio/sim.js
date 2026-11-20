// 실시간 3D/2D 멀티-레이어 VFX 시뮬레이션 엔진 (Node 테스트 + 브라우저 + Quest WebXR 공용).
// Phase 1+2 업그레이드:
// - meta-mr-picker/ritual SplatFeel / SplatSimKernel 물리 커널 + 3D Curl Noise
// - Rankine 결합 와류(H07: r<=R 강체 회전 / r>R 반비례 감쇠)
// - 온도 냉각 → 흑염/그을음 연기 자동 전환(A·B) + Beer-Lambert 흡수/산란(B10)
// - 가상 테스트 액터(ActorRig) 소켓 바인딩 + 소켓 히스토리 Catmull-Rom 리본(I01/I04)
// - 전극→타깃 Leader-Branch 번개(E02/E07) + OnHit 충돌 이벤트 발화(I02/G05)
import {
  KERNEL_IDS,
  QUEST_BUDGET,
  applyQuestBudget,
  compileSplatFeel,
  hexToRgb01,
  normalizeRecipe,
} from './schema.js';
import { ActorRig } from './actors.js';

export const STRIDE = 21;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const c = clamp(x); return c * c * (3 - 2 * c); };

function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// H07: Rankine 결합 와류 접선 속도 (r=R에서 연속, 중심 무한 발산 제거 + 태풍의 눈 형성)
export function rankineTangential(r, coreR, strength) {
  const R = Math.max(0.04, coreR || 0.28);
  if (r <= R) return strength * (r / R);
  return strength * (R / r);
}

// 발산이 0인 해석적 3D Curl Noise (H08, 할당 없음)
export function curlNoise3(out, x, y, z, t, freq) {
  const fx = x * freq;
  const fy = y * freq;
  const fz = z * freq;
  const t1 = t * 1.15;
  const t2 = t * 0.78;
  const dPz_dy = -0.5 * 1.8 * Math.sin(fy * 1.8 + t2);
  const dPy_dz = Math.cos(fz + t2);
  const dPx_dz = -0.5 * 1.7 * Math.sin(fz * 1.7 - t2);
  const dPz_dx = Math.cos(fx - t1);
  const dPy_dx = -0.5 * 1.6 * Math.sin(fx * 1.6 + t1);
  const dPx_dy = Math.cos(fy + t1);

  const fx2 = fx * 2.13 + 3.1;
  const fy2 = fy * 2.13 - 1.7;
  const fz2 = fz * 2.13 + 2.4;
  const cx2 = -0.35 * (Math.cos(fz2 - t1 * 1.4) + Math.sin(fy2 + t2 * 1.7));
  const cy2 = -0.35 * (Math.cos(fx2 + t2 * 1.5) + Math.sin(fz2 - t1 * 1.3));
  const cz2 = -0.35 * (Math.cos(fy2 - t1 * 1.6) + Math.sin(fx2 + t2 * 1.4));

  out[0] = (dPz_dy - dPy_dz) + cx2;
  out[1] = (dPx_dz - dPz_dx) + cy2;
  out[2] = (dPy_dx - dPx_dy) + cz2;
  return out;
}

export class VfxSplatBatch {
  constructor(limit = 5200) {
    this.limit = limit;
    this.data = new Float32Array(limit * STRIDE);
    this.count = 0;
    this.areaSum = 0;
  }

  clear() {
    this.count = 0;
    this.areaSum = 0;
  }

  put(
    x, y, z,
    dx, dy, dz,
    longR, wideR,
    cr, cg, cb,
    rr, rg, rb,
    kernelId, opacity, erosion, emission,
    seed, lifeT, glint,
  ) {
    if (this.count >= this.limit || opacity <= 0.004 || longR <= 0.0005 || wideR <= 0.0005) return;
    let j = this.count++ * STRIDE;
    const d = this.data;
    d[j++] = x; d[j++] = y; d[j++] = z;
    d[j++] = dx; d[j++] = dy; d[j++] = dz;
    d[j++] = longR; d[j++] = wideR;
    d[j++] = cr; d[j++] = cg; d[j++] = cb;
    d[j++] = rr; d[j++] = rg; d[j++] = rb;
    d[j++] = kernelId; d[j++] = opacity; d[j++] = erosion; d[j++] = emission;
    d[j++] = seed; d[j++] = lifeT; d[j] = glint;
    this.areaSum += longR * wideR * 3.14159;
  }
}

function createEmitterState(layer, seedOffset = 0) {
  const cap = Math.max(24, Math.min(2400, Math.round(layer.count * (1 + (layer.subEmit || 0) * 0.45))));
  const particles = Array.from({ length: cap }, () => ({
    alive: false,
    sub: false,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    hx: 0, hy: 0, hz: 0,
    age: 0, life: 1,
    size0: 0.02, size1: 0.01,
    seed: 0.5, stick: 0, glow: 0,
    temp: 1.0,
  }));
  return {
    layerId: layer.id,
    cap,
    cursor: 0,
    credit: 0,
    burstClock: 0,
    rng: makeRng(7919 + seedOffset * 1013),
    particles,
  };
}

export class VfxEngine {
  constructor(initialRecipe) {
    this.alphaBatch = new VfxSplatBatch(5200);
    this.addBatch = new VfxSplatBatch(5200);
    this.groups = [
      { batch: this.alphaBatch, blend: 'alpha', alpha: 1 },
      { batch: this.addBatch, blend: 'additive', alpha: 1 },
    ];
    this.actor = new ActorRig();
    this.time = 0;
    this.lastHitTime = -10;
    this.frame = 0;
    this.paused = false;
    this.speedMultiplier = 1.0;
    this.stageOrigin = [0, 0, 0];
    this.colliders = [];
    this.pointerCollider = null;
    this.prevHandPos = new Map();
    this.emitterStates = new Map();
    this.tmpCurl = [0, 0, 0];
    this.floorGlowColor = [1, 0.55, 0.25];
    this.floorGlowIntensity = 0.7;
    this.budgetReport = null;
    this.metrics = {
      splatCount: 0,
      alphaSplats: 0,
      addSplats: 0,
      estOverdraw: 0,
      simMs: 0,
      questGrade: 'OK',
      activeColliders: 0,
      smokeConverted: 0,
    };
    this.loadRecipe(initialRecipe || { layers: [] }, true);
  }

  setActorMode(mode) {
    this.actor.setMode(mode);
  }

  resolveSocketOrigin(layer, scale) {
    const ox = (layer.origin?.[0] || 0) * scale;
    const oy = (layer.origin?.[1] || 0) * scale;
    const oz = (layer.origin?.[2] || 0) * scale;
    const s = this.actor.sockets;
    if (layer.socket === 'projectile' && this.actor.mode === 'projectile-hit') {
      return [s.projectile[0] + ox * 0.25, s.projectile[1] + oy * 0.25, s.projectile[2] + oz * 0.25];
    }
    if (layer.socket === 'impact' && (this.actor.mode === 'projectile-hit' || this.actor.mode === 'sword-swing')) {
      return [s.impact[0] + ox * 0.25, s.impact[1] + oy * 0.25, s.impact[2] + oz * 0.25];
    }
    if (layer.socket === 'bladeTrail' && this.actor.mode === 'sword-swing') {
      return [s.bladeTip[0] + ox * 0.2, s.bladeTip[1] + oy * 0.2, s.bladeTip[2] + oz * 0.2];
    }
    if (layer.socket === 'casterHand' && this.actor.mode !== 'idle') {
      return [s.casterHand[0] + ox * 0.2, s.casterHand[1] + oy * 0.2, s.casterHand[2] + oz * 0.2];
    }
    return [ox, oy, oz];
  }

  loadRecipe(rawRecipe, resetSim = false) {
    const normalized = normalizeRecipe(rawRecipe);
    const { recipe, budgetReport } = applyQuestBudget(normalized, QUEST_BUDGET);
    this.recipe = recipe;
    this.budgetReport = budgetReport;
    this.feelCompiled = compileSplatFeel(recipe.feel);
    this.floorGlowColor = hexToRgb01(recipe.floorColor);

    const activeIds = new Set();
    recipe.layers.forEach((layer, idx) => {
      if (layer.type !== 'emitter') return;
      activeIds.add(layer.id);
      const existing = this.emitterStates.get(layer.id);
      const needCap = Math.max(24, Math.min(2400, Math.round(layer.count * (1 + (layer.subEmit || 0) * 0.45))));
      if (resetSim || !existing || existing.cap < needCap) {
        this.emitterStates.set(layer.id, createEmitterState(layer, idx + 1));
      }
    });
    for (const id of [...this.emitterStates.keys()]) {
      if (!activeIds.has(id)) this.emitterStates.delete(id);
    }

    if (resetSim) {
      this.time = 0;
      this.lastHitTime = -10;
      this.actor.reset();
      this.triggerBurst();
      for (let i = 0; i < 24; i++) this.stepSimulation(1 / 40, []);
    }
    return { recipe: this.recipe, budgetReport: this.budgetReport };
  }

  updateRecipeLive(rawRecipe) {
    return this.loadRecipe(rawRecipe, false);
  }

  reset() {
    this.time = 0;
    this.lastHitTime = -10;
    this.prevHandPos.clear();
    this.loadRecipe(this.recipe, true);
  }

  interruptTracking() {
    this.prevHandPos.clear();
    this.colliders = [];
  }

  triggerBurst(onlyOnHit = false) {
    const scale = this.recipe.scale;
    if (onlyOnHit) this.lastHitTime = this.time;
    for (const layer of this.recipe.layers) {
      if (!layer.enabled || layer.type !== 'emitter') continue;
      if (onlyOnHit && layer.trigger !== 'onHit') continue;
      const st = this.emitterStates.get(layer.id);
      if (!st) continue;
      const burstN = layer.burst > 0 ? layer.burst : Math.min(56, Math.round(layer.count * 0.22));
      for (let i = 0; i < burstN; i++) this.spawnParticle(st, layer, scale, false, null, null);
    }
  }

  setPointerCollider(pos, vel, active = false, radius = 0.095) {
    if (!active || !pos) {
      this.pointerCollider = null;
      return;
    }
    this.pointerCollider = {
      position: pos,
      velocity: vel || [0, 0, 0],
      radius,
      strength: 1.0,
    };
  }

  buildCollidersFromHands(hands, dt) {
    const out = [];
    if (this.pointerCollider) out.push(this.pointerCollider);
    if (this.actor.autoHandCollider) out.push(this.actor.autoHandCollider);
    if (!Array.isArray(hands) || !hands.length) return out;
    const invDt = dt > 1e-4 ? 1 / dt : 72;
    for (const h of hands) {
      const pts = [
        [h.side + ':palm', h.palm, 0.068],
        [h.side + ':tip', h.tip, 0.036],
      ];
      for (const [key, p, radius] of pts) {
        if (!p) continue;
        const prev = this.prevHandPos.get(key);
        const vx = prev ? clamp((p[0] - prev[0]) * invDt, -5, 5) : 0;
        const vy = prev ? clamp((p[1] - prev[1]) * invDt, -5, 5) : 0;
        const vz = prev ? clamp((p[2] - prev[2]) * invDt, -5, 5) : 0;
        this.prevHandPos.set(key, [p[0], p[1], p[2]]);
        out.push({
          position: [p[0] - this.stageOrigin[0], p[1] - this.stageOrigin[1], p[2] - this.stageOrigin[2]],
          velocity: [vx, vy, vz],
          radius,
          strength: 1.0,
        });
      }
    }
    return out;
  }

  spawnParticle(st, layer, scale, isSub, posOverride, velOverride) {
    const rng = st.rng;
    let p = null;
    for (let n = 0; n < st.cap; n++) {
      const cand = st.particles[st.cursor];
      st.cursor = (st.cursor + 1) % st.cap;
      if (!cand.alive) { p = cand; break; }
    }
    if (!p) return;

    const [ox, oy, oz] = this.resolveSocketOrigin(layer, scale);
    const rad = layer.radius * scale;
    const hgt = layer.height * scale;

    let x = ox, y = oy, z = oz;
    let dirX = 0, dirY = 1, dirZ = 0;

    if (posOverride) {
      x = posOverride[0]; y = posOverride[1]; z = posOverride[2];
    } else if (layer.shape === 'ring' || layer.shape === 'torus') {
      const a = rng() * TAU;
      const tube = layer.shape === 'torus' ? (rng() - 0.5) * hgt : 0;
      const rr = rad + (rng() - 0.5) * (layer.shape === 'torus' ? hgt : rad * 0.16);
      x = ox + Math.cos(a) * rr;
      y = oy + tube;
      z = oz + Math.sin(a) * rr;
      dirX = Math.cos(a);
      dirY = (rng() - 0.5) * 0.5;
      dirZ = Math.sin(a);
    } else if (layer.shape === 'cone') {
      const a = rng() * TAU;
      const r = Math.sqrt(rng()) * rad;
      x = ox + Math.cos(a) * r;
      y = oy + (rng() - 0.5) * hgt;
      z = oz + Math.sin(a) * r;
      const tilt = layer.spread * 0.5 * (r / (rad || 1));
      dirX = Math.cos(a) * Math.sin(tilt);
      dirY = Math.cos(tilt);
      dirZ = Math.sin(a) * Math.sin(tilt);
    } else if (layer.shape === 'spline') {
      const u = rng();
      const a = u * TAU * 1.5;
      x = ox + Math.cos(a) * rad * (0.4 + 0.6 * u);
      y = oy + (u - 0.5) * Math.max(0.35, hgt * 2.5);
      z = oz + Math.sin(a) * rad * (0.4 + 0.6 * u);
      dirX = -Math.sin(a); dirY = 0.45; dirZ = Math.cos(a);
    } else if (layer.shape === 'point') {
      const theta = rng() * TAU;
      const u = rng() * 2 - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      dirX = Math.cos(theta) * s; dirY = u; dirZ = Math.sin(theta) * s;
      x = ox + dirX * 0.015; y = oy + dirY * 0.015; z = oz + dirZ * 0.015;
    } else {
      const theta = rng() * TAU;
      const u = rng() * 2 - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = Math.cbrt(rng()) * rad;
      dirX = Math.cos(theta) * s; dirY = u; dirZ = Math.sin(theta) * s;
      x = ox + dirX * rr; y = oy + dirY * rr; z = oz + dirZ * rr;
    }

    p.alive = true;
    p.sub = isSub;
    p.x = x; p.y = y; p.z = z;
    p.hx = x; p.hy = y; p.hz = z;

    if (velOverride) {
      p.vx = velOverride[0]; p.vy = velOverride[1]; p.vz = velOverride[2];
    } else {
      const spd = layer.speed * scale * (0.65 + 0.7 * rng());
      const j = layer.spread * 0.42;
      p.vx = (dirX + (rng() - 0.5) * j) * spd;
      p.vy = (dirY + (rng() - 0.5) * j) * spd;
      p.vz = (dirZ + (rng() - 0.5) * j) * spd;
      // 투사체 적중 시 타깃 반발 노멀 방향 임펄스 가미 (I02/I05)
      if (layer.trigger === 'onHit' && this.actor.mode === 'projectile-hit') {
        const n = this.actor.sockets.impactNormal;
        p.vx += n[0] * spd * 0.65;
        p.vy += n[1] * spd * 0.45;
        p.vz += n[2] * spd * 0.65;
      }
    }

    p.age = 0;
    const minL = Math.min(layer.lifeMin, layer.lifeMax);
    const maxL = Math.max(layer.lifeMin, layer.lifeMax);
    p.life = (minL + (maxL - minL) * rng()) * (isSub ? 0.48 : 1.0);
    p.size0 = layer.sizeStart * scale * (0.72 + 0.56 * rng()) * (isSub ? 0.52 : 1.0);
    p.size1 = layer.sizeEnd * scale * (0.72 + 0.56 * rng()) * (isSub ? 0.4 : 1.0);
    p.seed = rng();
    p.stick = 0;
    p.glow = isSub ? 0.85 : 0;
    p.temp = layer.tempStart > 0 ? layer.tempStart * (0.82 + 0.36 * rng()) : 0;
  }

  tick(dt, hands = []) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const clampedDt = clamp(dt, 0, 0.05);
    this.frame++;
    if (!this.paused) {
      const simDt = clampedDt * this.recipe.timeScale * this.speedMultiplier;
      this.actor.update(simDt, this.recipe.floorY * this.recipe.scale);
      if (this.actor.justHit) {
        this.triggerBurst(true);
      }
      this.colliders = this.buildCollidersFromHands(hands, clampedDt);
      this.stepSimulation(simDt, this.colliders);
    } else {
      this.colliders = this.buildCollidersFromHands(hands, clampedDt);
    }
    this.paint();
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.metrics.simMs = Number((t1 - t0).toFixed(2));
    this.metrics.activeColliders = this.colliders.length;
  }

  stepSimulation(dt, colliders) {
    if (dt <= 0) return;
    this.time += dt;
    const recipe = this.recipe;
    const scale = recipe.scale;
    const simFeel = this.feelCompiled.sim;
    const floorY = recipe.floorY * scale;
    const curl = this.tmpCurl;

    for (const layer of recipe.layers) {
      if (!layer.enabled || layer.type !== 'emitter') continue;
      const st = this.emitterStates.get(layer.id);
      if (!st) continue;

      const isHitOnly = layer.trigger === 'onHit' && (this.actor.mode === 'projectile-hit' || this.actor.mode === 'sword-swing');
      if (!isHitOnly) {
        // 투사체 비행 소켓일 때는 비행/차징 구간에만 연속 방출
        const activeProj = !(layer.socket === 'projectile' && this.actor.mode === 'projectile-hit' && this.actor.phase === 'impact');
        if (activeProj) {
          st.credit += layer.rate * dt;
          const spawnCount = Math.min(48, Math.floor(st.credit));
          if (spawnCount > 0) {
            st.credit -= spawnCount;
            for (let i = 0; i < spawnCount; i++) this.spawnParticle(st, layer, scale, false, null, null);
          }
        }
        if (layer.burst > 0 && recipe.loopPeriod > 0.25) {
          st.burstClock += dt;
          if (st.burstClock >= recipe.loopPeriod) {
            st.burstClock -= recipe.loopPeriod;
            const n = Math.min(layer.burst, Math.round(layer.count * 0.55));
            for (let i = 0; i < n; i++) this.spawnParticle(st, layer, scale, false, null, null);
          }
        }
      }

      const [ox, oy, oz] = this.resolveSocketOrigin(layer, scale);
      const dragFactor = Math.exp(-(layer.drag + simFeel.fallDamping * 0.28) * dt);
      const springK = layer.homeSpring * simFeel.homeStiffness;
      const bounceK = clamp(layer.floorBounce * 0.7 + simFeel.bounce * 0.3, 0, 0.92);
      const coolDecay = layer.coolingRate > 0 ? Math.exp(-layer.coolingRate * dt) : 1;
      const rankineR = Math.max(0.05, (layer.rankineCore || 0.28) * scale);

      for (let i = 0; i < st.cap; i++) {
        const p = st.particles[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          continue;
        }

        // 온도 냉각 (Category A: 점화 → 팽창 → 냉각 → 그을음 연기)
        if (p.temp > 0) p.temp *= coolDecay;

        let ax = 0;
        // 뜨거운 입자일수록 부력이 강하고 식으면 서서히 완만해짐
        const thermalBuoyancy = layer.smokeTransition > 0 ? p.temp * 0.65 : 0;
        let ay = -layer.gravity + thermalBuoyancy - simFeel.weight * 0.14;
        let az = 0;

        // 1. 3D Curl Noise 난류
        if (layer.curlAmp > 0.001) {
          curlNoise3(curl, p.x, p.y, p.z, this.time, layer.curlFreq);
          ax += curl[0] * layer.curlAmp;
          ay += curl[1] * layer.curlAmp;
          az += curl[2] * layer.curlAmp;
        }

        // 2. Rankine 결합 와류(H07) + 방사형(Radial) 힘
        const rx = p.x - ox;
        const ry = p.y - oy;
        const rz = p.z - oz;
        const rHoriz = Math.hypot(rx, rz);
        if (rHoriz > 0.002) {
          const invR = 1 / rHoriz;
          const nx = rx * invR;
          const nz = rz * invR;
          if (Math.abs(layer.vortex) > 0.001) {
            const vTheta = rankineTangential(rHoriz, rankineR, layer.vortex * 1.45);
            ax += -nz * vTheta;
            az += nx * vTheta;
          }
          if (Math.abs(layer.radial) > 0.001) {
            ax += nx * layer.radial;
            az += nz * layer.radial;
          }
        }

        // 3. SplatSimKernel Home Spring
        if (springK > 0.1) {
          const sx = (p.hx - p.x) * springK;
          const sy = (p.hy - p.y) * springK;
          const sz = (p.hz - p.z) * springK;
          const smag = Math.hypot(sx, sy, sz);
          const sCap = smag > simFeel.maxSpringAccel ? simFeel.maxSpringAccel / smag : 1;
          ax += sx * sCap;
          ay += sy * sCap;
          az += sz * sCap;
        }

        // 4. Hand / Pointer Collider 상호작용
        let contactGlow = 0;
        for (let cIdx = 0; cIdx < colliders.length; cIdx++) {
          const c = colliders[cIdx];
          const dx = p.x - c.position[0];
          const dy = p.y - c.position[1];
          const dz = p.z - c.position[2];
          const distSq = dx * dx + dy * dy + dz * dz;
          const outer = c.radius * 2.15;
          if (distSq >= outer * outer) continue;
          const dist = Math.sqrt(distSq);
          const nx = dist > 1e-4 ? dx / dist : 0;
          const ny = dist > 1e-4 ? dy / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          const rvx = c.velocity[0] - p.vx;
          const rvy = c.velocity[1] - p.vy;
          const rvz = c.velocity[2] - p.vz;

          if (dist < c.radius) {
            const w = 1 - dist / c.radius;
            let firm = 1;
            if (simFeel.thicken > 0) {
              const relSpd = Math.hypot(rvx, rvy, rvz);
              const fast = clamp(relSpd / 0.35);
              firm = mix(1, mix(0.18, 2.8, fast), simFeel.thicken);
            }
            const push = simFeel.handPush * 0.16 * w * c.strength * firm;
            const dragH = simFeel.handDrag * 0.45 * w * c.strength * firm;
            ax += nx * push + rvx * dragH;
            ay += ny * push + rvy * dragH;
            az += nz * push + rvz * dragH;
            contactGlow = Math.max(contactGlow, w);
            if (simFeel.stickFraction > 0.05 && p.seed < simFeel.stickFraction) {
              p.stick = Math.min(1, p.stick + 4.5 * dt);
            }
          } else {
            const s = 1 - (dist - c.radius) / Math.max(outer - c.radius, 1e-4);
            ax += rvx * (simFeel.handDrag * 0.12 * s) - nx * (1.2 * s);
            ay += rvy * (simFeel.handDrag * 0.12 * s) - ny * (1.2 * s);
            az += rvz * (simFeel.handDrag * 0.12 * s) - nz * (1.2 * s);
            contactGlow = Math.max(contactGlow, s * 0.55);
          }

          if (p.stick > 0.02) {
            ax += (-nx * 14 + rvx * 10) * p.stick;
            ay += (-ny * 14 + rvy * 10) * p.stick;
            az += (-nz * 14 + rvz * 10) * p.stick;
          }
        }
        p.stick *= Math.exp(-simFeel.stickDecay * dt);
        p.glow = Math.max(contactGlow, p.glow * Math.exp(-4.5 * dt));

        // 5. Semi-implicit 적분 + 속도 제한
        p.vx = (p.vx + ax * dt) * dragFactor;
        p.vy = (p.vy + ay * dt) * dragFactor;
        p.vz = (p.vz + az * dt) * dragFactor;
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        if (speed > 4.4) {
          const capS = 4.4 / speed;
          p.vx *= capS; p.vy *= capS; p.vz *= capS;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        // 6. 바닥 충돌 + 2차 비산(Sub-emitter)
        if (p.y < floorY) {
          p.y = floorY;
          const impactVy = Math.abs(p.vy);
          if (bounceK > 0.02 && impactVy > 0.08) {
            p.vy = impactVy * bounceK;
            p.vx *= 0.8;
            p.vz *= 0.8;
            if (!p.sub && layer.subEmit > 0 && impactVy > 0.55) {
              const subCount = Math.min(layer.subEmit, 3);
              for (let k = 0; k < subCount; k++) {
                const a = st.rng() * TAU;
                const sp = (0.35 + 0.55 * st.rng()) * impactVy;
                this.spawnParticle(
                  st, layer, scale, true,
                  [p.x, floorY + 0.008, p.z],
                  [Math.cos(a) * sp, (0.38 + 0.45 * st.rng()) * impactVy, Math.sin(a) * sp],
                );
              }
            }
          } else {
            p.vy = 0;
            p.vx *= 0.65;
            p.vz *= 0.65;
          }
        }

        if (Math.hypot(rx, ry, rz) > 4.8 * scale) p.alive = false;
      }
    }
  }

  paint() {
    this.alphaBatch.clear();
    this.addBatch.clear();

    const recipe = this.recipe;
    const scale = recipe.scale;
    const oxStage = this.stageOrigin[0];
    const oyStage = this.stageOrigin[1];
    const ozStage = this.stageOrigin[2];
    const lookFeel = this.feelCompiled.look;
    const t = this.time;

    let pulseEnergy = 0;
    let smokeConverted = 0;

    for (let li = 0; li < recipe.layers.length; li++) {
      const layer = recipe.layers[li];
      if (!layer.enabled) continue;
      const batch = layer.blend === 'alpha' ? this.alphaBatch : this.addBatch;
      const kernelId = KERNEL_IDS[layer.kernel] ?? 0;
      const coreRgb = hexToRgb01(layer.colorCore);
      const rimRgb = hexToRgb01(layer.colorRim);

      if (layer.type === 'emitter') {
        const st = this.emitterStates.get(layer.id);
        if (!st) continue;
        const auxZBase = layer.kernel === 'mist' ? layer.absorption : layer.glint;

        for (let i = 0; i < st.cap; i++) {
          const p = st.particles[i];
          if (!p.alive) continue;
          const lifeT = clamp(p.age / Math.max(p.life, 0.05));
          const envIn = smooth(lifeT / 0.11);
          const envOut = 1 - smooth((lifeT - 0.52) / 0.48);
          const alpha = layer.opacity * envIn * envOut * (1 + p.glow * 0.45);
          if (alpha <= 0.005) continue;

          const baseSize = mix(p.size0, p.size1, Math.pow(lifeT, 0.72));
          const speed = Math.hypot(p.vx, p.vy, p.vz);
          const ax = speed > 0.02 ? p.vx / speed : Math.cos(p.seed * TAU);
          const ay = speed > 0.02 ? p.vy / speed : 1;
          const az = speed > 0.02 ? p.vz / speed : Math.sin(p.seed * TAU);

          const velStretch = 1 + Math.min(layer.stretch, speed * (1.2 + lookFeel.stretchMax * 0.4));
          const longR = baseSize * Math.max(1, layer.stretch * 0.55 + velStretch * 0.45);
          const wideR = baseSize * (1 + lookFeel.fluff * 0.15);

          // Category A+B: 뜨거운 화염 입자가 식으면 자동으로 어두운 그을음 연기(Alpha Mist)로 전환
          if (layer.smokeTransition > 0.05 && p.temp < 0.42) {
            const coolBlend = clamp((0.42 - p.temp) / 0.34) * layer.smokeTransition;
            const smokeAlpha = alpha * coolBlend * 0.72;
            if (smokeAlpha > 0.01) {
              smokeConverted++;
              const smokeSize = baseSize * (1.4 + coolBlend * 1.15);
              this.alphaBatch.put(
                p.x + oxStage, p.y + oyStage, p.z + ozStage,
                ax, ay, az,
                smokeSize * 1.18, smokeSize,
                0.14, 0.12, 0.11,
                0.04, 0.045, 0.055,
                KERNEL_IDS.mist, smokeAlpha, clamp(layer.erosion + lifeT * 0.25), 0.06,
                p.seed, lifeT, 0.72, // high absorption soot
              );
            }
            const remFire = alpha * (1 - coolBlend * 0.85);
            if (remFire <= 0.01) continue;
            batch.put(
              p.x + oxStage, p.y + oyStage, p.z + ozStage,
              ax, ay, az,
              longR, wideR,
              coreRgb[0], coreRgb[1], coreRgb[2],
              rimRgb[0], rimRgb[1], rimRgb[2],
              kernelId, remFire, clamp(layer.erosion + lifeT * 0.28), layer.emission * (0.4 + p.temp * 0.8),
              p.seed, clamp(1 - p.temp), auxZBase,
            );
            continue;
          }

          batch.put(
            p.x + oxStage, p.y + oyStage, p.z + ozStage,
            ax, ay, az,
            longR, wideR,
            coreRgb[0], coreRgb[1], coreRgb[2],
            rimRgb[0], rimRgb[1], rimRgb[2],
            kernelId, alpha, clamp(layer.erosion + lifeT * 0.28), layer.emission * (1 + p.glow * 0.55),
            p.seed, lifeT, auxZBase,
          );
        }
        pulseEnergy += layer.emission * 0.22;
      } else if (layer.type === 'arc') {
        this.paintArcLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage);
        pulseEnergy += layer.emission * 0.35;
      } else if (layer.type === 'wave') {
        pulseEnergy += this.paintWaveLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage);
      }
    }

    const flicker = 0.88 + 0.12 * Math.sin(t * 7.4) + 0.07 * Math.sin(t * 15.2);
    this.floorGlowIntensity = clamp(recipe.floorGlow * (0.45 + Math.min(1.1, pulseEnergy * 0.45)) * flicker, 0, 2.2);

    const totalSplats = this.alphaBatch.count + this.addBatch.count;
    const estOverdraw = Number((this.alphaBatch.areaSum + this.addBatch.areaSum).toFixed(2));
    this.metrics.alphaSplats = this.alphaBatch.count;
    this.metrics.addSplats = this.addBatch.count;
    this.metrics.splatCount = totalSplats;
    this.metrics.estOverdraw = estOverdraw;
    this.metrics.smokeConverted = smokeConverted;
    this.metrics.questGrade = this.budgetReport?.clamped
      ? 'CLAMPED'
      : totalSplats > QUEST_BUDGET.tightSplats || estOverdraw > QUEST_BUDGET.tightOverdrawArea
        ? 'TIGHT'
        : 'OK';
  }

  paintArcLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage) {
    // I01/I04: 무기 소켓 히스토리 Catmull-Rom 리본 모드
    if (layer.mode === 'ribbon') {
      const ribbon = this.actor.sampleBladeRibbon(Math.max(16, layer.segments));
      if (ribbon.length >= 2) {
        const width = layer.width * scale;
        const strands = Math.max(1, Math.min(4, layer.strands));
        for (let s = 0; s < strands; s++) {
          const frac = strands === 1 ? 0.82 : mix(0.28, 1.0, s / (strands - 1));
          let prev = null;
          for (let i = 0; i < ribbon.length; i++) {
            const pt = ribbon[i];
            const px = mix(pt.base[0], pt.tip[0], frac) + oxStage;
            const py = mix(pt.base[1], pt.tip[1], frac) + oyStage;
            const pz = mix(pt.base[2], pt.tip[2], frac) + ozStage;
            if (prev) {
              const dx = px - prev[0], dy = py - prev[1], dz = pz - prev[2];
              const segLen = Math.hypot(dx, dy, dz) || 0.001;
              const fade = Math.pow(1 - pt.u, 1.15) * (0.25 + 0.75 * pt.w);
              const edgeBoost = 0.55 + 0.65 * frac;
              const alpha = layer.opacity * fade * edgeBoost;
              if (alpha > 0.01) {
                batch.put(
                  (px + prev[0]) * 0.5, (py + prev[1]) * 0.5, (pz + prev[2]) * 0.5,
                  dx / segLen, dy / segLen, dz / segLen,
                  segLen * 0.88, width * (1.2 + (1 - pt.u) * 1.3) * edgeBoost,
                  coreRgb[0], coreRgb[1], coreRgb[2],
                  rimRgb[0], rimRgb[1], rimRgb[2],
                  kernelId, alpha, layer.erosion + pt.u * 0.35, layer.emission * edgeBoost,
                  (s * 0.23 + pt.u * 0.83) % 1, pt.u, layer.glint,
                );
              }
            }
            prev = [px, py, pz];
          }
        }
        return;
      }
    }

    // E02/E07: 시전자 손/원점 → 타깃 전극 Leader-Branch 방전 모드
    if (layer.mode === 'leader') {
      const start = this.actor.mode === 'projectile-hit'
        ? this.actor.sockets.casterHand
        : [-0.72 * scale, 0.08 * scale, 0];
      const end = this.actor.mode === 'projectile-hit'
        ? (this.actor.phase === 'anticipation' ? this.actor.sockets.casterHand : this.actor.sockets.target)
        : [0.72 * scale, 0.06 * scale, 0];
      const segs = Math.max(12, layer.segments);
      const width = layer.width * scale;
      // E01 연속 다중 섬광 리듬 (짧은 번쩍임 2~3회 + 어두운 간격)
      const strobe = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(t * 13.5)), 0.45);
      const tickQuant = Math.floor(t * 24) * 2.31;

      for (let s = 0; s < Math.min(layer.strands, 5); s++) {
        let prevX = start[0] + oxStage;
        let prevY = start[1] + oyStage;
        let prevZ = start[2] + ozStage;
        const spreadAmp = (s === 0 ? 1.0 : 1.55) * layer.jitter * scale;

        for (let k = 1; k <= segs; k++) {
          const u = k / segs;
          const env = Math.sin(u * Math.PI);
          const j1 = Math.sin(u * 9.3 + tickQuant + s * 3.7) * 0.6;
          const j2 = Math.cos(u * 23.1 - tickQuant * 1.4 + s * 6.1) * 0.4;
          const x = mix(start[0], end[0], u) + oxStage + (j2 * 0.35) * spreadAmp * env;
          const y = mix(start[1], end[1], u) + oyStage + (j1 + j2) * spreadAmp * env;
          const z = mix(start[2], end[2], u) + ozStage + (Math.sin(u * 15.7 + tickQuant * 1.2 + s * 4.9) * 0.8) * spreadAmp * env;

          const dx = x - prevX, dy = y - prevY, dz = z - prevZ;
          const segLen = Math.hypot(dx, dy, dz) || 0.001;
          const isMain = s === 0;
          const w = width * (isMain ? 1.25 : 0.65) * (0.45 + 0.55 * env);
          batch.put(
            (x + prevX) * 0.5, (y + prevY) * 0.5, (z + prevZ) * 0.5,
            dx / segLen, dy / segLen, dz / segLen,
            segLen * 0.85, w,
            coreRgb[0], coreRgb[1], coreRgb[2],
            rimRgb[0], rimRgb[1], rimRgb[2],
            kernelId, layer.opacity * strobe * (isMain ? 1.0 : 0.65), layer.erosion, layer.emission * strobe,
            (s * 0.29 + u * 0.77) % 1, u, layer.glint,
          );

          // 측면 가지 방전 (E02)
          if (isMain && layer.branches > 0 && k > 3 && k < segs - 3 && (k % Math.max(4, Math.floor(segs / (layer.branches + 1))) === 0)) {
            const bSteps = Math.max(4, Math.floor(segs * 0.24));
            let bx = x, by = y, bz = z;
            const sign = (k % 2 === 0 ? 1 : -1);
            for (let b = 1; b <= bSteps; b++) {
              const bu = b / bSteps;
              const nx = bx + (end[0] - start[0]) * 0.045 + Math.sin(b * 7.2 + tickQuant) * spreadAmp * 0.4;
              const ny = by + sign * 0.055 * scale + Math.cos(b * 9.1 - tickQuant) * spreadAmp * 0.65;
              const nz = bz + Math.sin(b * 6.4 + k + tickQuant) * spreadAmp * 0.55;
              const bdx = nx - bx, bdy = ny - by, bdz = nz - bz;
              const bl = Math.hypot(bdx, bdy, bdz) || 0.001;
              const bt = 1 - bu;
              batch.put(
                (nx + bx) * 0.5, (ny + by) * 0.5, (nz + bz) * 0.5,
                bdx / bl, bdy / bl, bdz / bl,
                bl * 0.82, width * 0.5 * bt,
                coreRgb[0], coreRgb[1], coreRgb[2],
                rimRgb[0], rimRgb[1], rimRgb[2],
                kernelId, layer.opacity * strobe * 0.62 * bt, layer.erosion + 0.1, layer.emission * 0.85,
                (bu * 0.63 + k * 0.17) % 1, bu, layer.glint,
              );
              bx = nx; by = ny; bz = nz;
            }
          }
          prevX = x; prevY = y; prevZ = z;
        }
      }
      return;
    }

    const [sox, soy, soz] = this.resolveSocketOrigin(layer, scale);
    const ox = sox + oxStage;
    const oy = soy + oyStage;
    const oz = soz + ozStage;
    const rad = layer.radius * scale;
    const hgt = layer.height * scale;
    const segs = layer.segments;
    const width = layer.width * scale;

    for (let s = 0; s < layer.strands; s++) {
      const sNorm = s / Math.max(1, layer.strands);
      const baseAngle = sNorm * TAU + t * layer.flowSpeed * 0.55;
      const phase = s * 2.17 + t * layer.flowSpeed * 1.45;
      let prevX = 0, prevY = 0, prevZ = 0;

      for (let k = 0; k <= segs; k++) {
        const u = k / segs;
        let x, y, z;

        if (layer.mode === 'orbit') {
          const ang = baseAngle + u * TAU * 0.72;
          const hAng = phase + u * TAU * layer.helixTurns;
          const hR = layer.helixRadius * scale * Math.sin(u * Math.PI);
          const rr = rad + Math.cos(hAng) * hR;
          x = ox + Math.cos(ang) * rr;
          y = oy + Math.sin(hAng) * hR + (u - 0.5) * hgt;
          z = oz + Math.sin(ang) * rr;
        } else if (layer.mode === 'slash') {
          const sweep = (u - 0.5) * 2.45 + Math.sin(t * layer.flowSpeed + s) * 0.25;
          const tilt = (sNorm - 0.5) * 1.35 + 0.35;
          const arcR = rad * (0.85 + 0.25 * Math.sin(u * Math.PI));
          const lx = Math.cos(sweep + baseAngle) * arcR;
          const lz = Math.sin(sweep + baseAngle) * arcR;
          const ly = Math.sin(u * Math.PI) * hgt * 0.45 + Math.sin(sweep * 2 + phase) * layer.helixRadius * scale;
          x = ox + lx;
          y = oy + ly * Math.cos(tilt) - lz * Math.sin(tilt) * 0.55;
          z = oz + lz * Math.cos(tilt) + ly * Math.sin(tilt) * 0.55;
        } else if (layer.mode === 'bolt') {
          const ang = baseAngle + Math.sin(t * 3.8 + s * 3.1) * 0.25;
          const distR = rad * u;
          const bend = Math.sin(u * Math.PI) * hgt * 0.32;
          x = ox + Math.cos(ang) * distR;
          y = oy + (u - 0.35) * hgt + bend;
          z = oz + Math.sin(ang) * distR;
        } else {
          const ang = baseAngle + u * TAU * layer.helixTurns * 0.55;
          const rCurve = rad * (0.35 + 0.65 * Math.sin(u * Math.PI * 0.85)) * (1 - 0.28 * u);
          const hAng = phase + u * TAU * layer.helixTurns;
          const hR = layer.helixRadius * scale * Math.sin(u * Math.PI);
          x = ox + Math.cos(ang) * rCurve + Math.cos(hAng) * hR;
          y = oy + u * hgt;
          z = oz + Math.sin(ang) * rCurve + Math.sin(hAng) * hR;
        }

        const env = Math.sin(u * Math.PI);
        const jit = layer.jitter * scale * env;
        if (jit > 0.0002) {
          const tickFast = layer.mode === 'bolt' ? Math.floor(t * 22) * 1.9 : t * layer.flowSpeed * 2.1;
          const low = Math.sin(u * 5.2 + phase) * 0.55;
          const mid = Math.sin(u * 13.7 - tickFast + s * 4.3) * 0.35;
          const high = Math.cos(u * 29.1 + tickFast * 1.7 + s * 7.1) * 0.25;
          x += (low + mid + high) * jit;
          y += (Math.cos(u * 11.3 + tickFast + s * 2.1) * 0.5 + high) * jit;
          z += (Math.sin(u * 17.9 - tickFast * 1.2 + s * 5.7) * 0.55 - mid) * jit;
        }

        if (k > 0) {
          const dx = x - prevX;
          const dy = y - prevY;
          const dz = z - prevZ;
          const segLen = Math.hypot(dx, dy, dz) || 0.001;
          const taper = Math.pow(Math.max(0.05, env), 0.55);
          const alpha = layer.opacity * (0.25 + 0.75 * taper);
          const midX = (x + prevX) * 0.5;
          const midY = (y + prevY) * 0.5;
          const midZ = (z + prevZ) * 0.5;
          batch.put(
            midX, midY, midZ,
            dx / segLen, dy / segLen, dz / segLen,
            segLen * 0.78, width * taper,
            coreRgb[0], coreRgb[1], coreRgb[2],
            rimRgb[0], rimRgb[1], rimRgb[2],
            kernelId, alpha, layer.erosion, layer.emission * (0.7 + 0.5 * taper),
            (s * 0.173 + u * 0.89) % 1, u, layer.glint,
          );

          if (layer.branches > 0 && k > 4 && k < segs - 4 && (k % Math.max(4, Math.floor(segs / (layer.branches + 1))) === 0) && s < Math.max(2, layer.branches + 1)) {
            const bSteps = Math.max(4, Math.floor(segs * 0.26));
            let bx = midX, by = midY, bz = midZ;
            const bAng = baseAngle + ((k + s) % 2 === 0 ? 0.95 : -0.95);
            const bLen = rad * 0.32;
            for (let b = 1; b <= bSteps; b++) {
              const bu = b / bSteps;
              const jB = jit * 1.15;
              const nx = bx + (Math.cos(bAng) * bLen / bSteps) + Math.sin(b * 6.3 + t * 18 + s) * jB;
              const ny = by + (0.08 * scale / bSteps) + Math.cos(b * 7.1 - t * 15 + k) * jB;
              const nz = bz + (Math.sin(bAng) * bLen / bSteps) + Math.sin(b * 5.7 + t * 21) * jB;
              const bdx = nx - bx, bdy = ny - by, bdz = nz - bz;
              const bl = Math.hypot(bdx, bdy, bdz) || 0.001;
              const bt = 1 - bu;
              batch.put(
                (nx + bx) * 0.5, (ny + by) * 0.5, (nz + bz) * 0.5,
                bdx / bl, bdy / bl, bdz / bl,
                bl * 0.78, width * 0.52 * bt,
                coreRgb[0], coreRgb[1], coreRgb[2],
                rimRgb[0], rimRgb[1], rimRgb[2],
                kernelId, alpha * 0.72 * bt, layer.erosion + 0.1, layer.emission * 0.85,
                (bu * 0.71 + s * 0.31) % 1, bu, layer.glint,
              );
              bx = nx; by = ny; bz = nz;
            }
          }
        }
        prevX = x; prevY = y; prevZ = z;
      }
    }
  }

  paintWaveLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage) {
    const period = Math.max(0.4, layer.period);
    let u;
    if (layer.trigger === 'onHit' && (this.actor.mode === 'projectile-hit' || this.actor.mode === 'sword-swing')) {
      const elapsed = t - this.lastHitTime;
      if (elapsed < 0 || elapsed > period) return 0;
      u = elapsed / period;
    } else {
      u = ((t - layer.delay) % period + period) % period / period;
    }

    const expand = 1 - Math.pow(1 - u, 3.1);
    const fadeIn = smooth(u / 0.08);
    const fadeOut = 1 - smooth((u - 0.18) / 0.82);
    const alpha = layer.opacity * fadeIn * fadeOut;
    if (alpha <= 0.006) return 0;

    const r = mix(layer.radiusStart, layer.radiusEnd, expand) * scale;
    const thick = layer.thickness * scale * (1.2 - 0.55 * u);
    const [sox, soy, soz] = this.resolveSocketOrigin(layer, scale);
    const ox = sox + oxStage;
    const oy = soy + oyStage;
    const oz = soz + ozStage;
    const cosT = Math.cos(layer.tilt);
    const sinT = Math.sin(layer.tilt);
    const n = layer.splats;
    const segArc = (TAU * r) / Math.max(8, n);

    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * layer.swirl * 0.55;
      const wobble = 1 + 0.07 * Math.sin(a * 5 + t * 3.1) + 0.04 * Math.cos(a * 9 - t * 4.4);
      const rr = r * wobble;
      const lx = Math.cos(a) * rr;
      const lz = Math.sin(a) * rr;
      const x = ox + lx;
      const y = oy - lz * sinT;
      const z = oz + lz * cosT;

      const tx = -Math.sin(a);
      const ty = -Math.cos(a) * sinT;
      const tz = Math.cos(a) * cosT;

      batch.put(
        x, y, z,
        tx, ty, tz,
        segArc * 0.92, thick,
        coreRgb[0], coreRgb[1], coreRgb[2],
        rimRgb[0], rimRgb[1], rimRgb[2],
        kernelId, alpha * (0.75 + 0.25 * Math.sin(i * 3.7)), clamp(layer.erosion + u * 0.35), layer.emission * (1.2 - 0.4 * u),
        (i * 0.61803) % 1, u, layer.glint,
      );
    }
    return alpha * layer.emission * 0.5;
  }
}
