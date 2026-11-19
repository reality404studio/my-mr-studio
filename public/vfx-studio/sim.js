// 실시간 3D 멀티-레이어 VFX 시뮬레이션 엔진 (Node 테스트 + 브라우저 + Quest WebXR 공용).
// meta-mr-picker/ritual의 SplatFeel / SplatSimKernel 물리 커널 + 3D Curl Noise +
// Bézier/Helix 에너지 아크 + Shockwave 링 + 2차 비산(Sub-emitter) + 손 콜라이더를 통합한다.
import {
  KERNEL_IDS,
  QUEST_BUDGET,
  applyQuestBudget,
  compileSplatFeel,
  hexToRgb01,
  normalizeRecipe,
} from './schema.js';

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

// 발산이 0인 해석적 3D Curl Noise (유체 소용돌이 속도장, 할당 없음)
export function curlNoise3(out, x, y, z, t, freq) {
  const fx = x * freq;
  const fy = y * freq;
  const fz = z * freq;
  const t1 = t * 1.15;
  const t2 = t * 0.78;
  // psi = (sin(fy + t1) + 0.5*cos(fz*1.7 - t2), sin(fz + t2) + 0.5*cos(fx*1.6 + t1), sin(fx - t1) + 0.5*cos(fy*1.8 + t2))
  // curl(psi) = (dPz/dy - dPy/dz, dPx/dz - dPz/dx, dPy/dx - dPx/dy)
  const dPz_dy = -0.5 * 1.8 * Math.sin(fy * 1.8 + t2);
  const dPy_dz = Math.cos(fz + t2);
  const dPx_dz = -0.5 * 1.7 * Math.sin(fz * 1.7 - t2);
  const dPz_dx = Math.cos(fx - t1);
  const dPy_dx = -0.5 * 1.6 * Math.sin(fx * 1.6 + t1);
  const dPx_dy = Math.cos(fy + t1);

  // 2차 옥타브 (고주파 난류)
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
    this.time = 0;
    this.frame = 0;
    this.paused = false;
    this.speedMultiplier = 1.0;
    this.stageOrigin = [0, 0, 0];
    this.colliders = [];
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
    };
    this.loadRecipe(initialRecipe || { layers: [] }, true);
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
      this.triggerBurst();
      // 첫 프레임부터 풍성하게 보이도록 0.65초 워밍업
      for (let i = 0; i < 24; i++) this.stepSimulation(1 / 40, []);
    }
    return { recipe: this.recipe, budgetReport: this.budgetReport };
  }

  updateRecipeLive(rawRecipe) {
    return this.loadRecipe(rawRecipe, false);
  }

  reset() {
    this.time = 0;
    this.prevHandPos.clear();
    this.loadRecipe(this.recipe, true);
  }

  interruptTracking() {
    this.prevHandPos.clear();
    this.colliders = [];
  }

  triggerBurst() {
    const scale = this.recipe.scale;
    for (const layer of this.recipe.layers) {
      if (!layer.enabled || layer.type !== 'emitter') continue;
      const st = this.emitterStates.get(layer.id);
      if (!st) continue;
      const burstN = layer.burst > 0 ? layer.burst : Math.min(48, Math.round(layer.count * 0.16));
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
        // 스테이지 원점 기준으로 변환
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

    const ox = (layer.origin?.[0] || 0) * scale;
    const oy = (layer.origin?.[1] || 0) * scale;
    const oz = (layer.origin?.[2] || 0) * scale;
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
      // sphere
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
  }

  tick(dt, hands = []) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const clampedDt = clamp(dt, 0, 0.05);
    this.frame++;
    this.colliders = this.buildCollidersFromHands(hands, clampedDt);
    if (!this.paused) {
      const simDt = clampedDt * this.recipe.timeScale * this.speedMultiplier;
      this.stepSimulation(simDt, this.colliders);
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

      // 연속 스폰 + 주기적 버스트
      st.credit += layer.rate * dt;
      const spawnCount = Math.min(48, Math.floor(st.credit));
      if (spawnCount > 0) {
        st.credit -= spawnCount;
        for (let i = 0; i < spawnCount; i++) this.spawnParticle(st, layer, scale, false, null, null);
      }

      if (layer.burst > 0 && recipe.loopPeriod > 0.25) {
        st.burstClock += dt;
        if (st.burstClock >= recipe.loopPeriod) {
          st.burstClock -= recipe.loopPeriod;
          const n = Math.min(layer.burst, Math.round(layer.count * 0.55));
          for (let i = 0; i < n; i++) this.spawnParticle(st, layer, scale, false, null, null);
        }
      }

      const ox = (layer.origin?.[0] || 0) * scale;
      const oy = (layer.origin?.[1] || 0) * scale;
      const oz = (layer.origin?.[2] || 0) * scale;
      const dragFactor = Math.exp(-(layer.drag + simFeel.fallDamping * 0.28) * dt);
      const springK = layer.homeSpring * simFeel.homeStiffness;
      const bounceK = clamp(layer.floorBounce * 0.7 + simFeel.bounce * 0.3, 0, 0.92);

      for (let i = 0; i < st.cap; i++) {
        const p = st.particles[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          continue;
        }

        let ax = 0;
        let ay = -layer.gravity - simFeel.weight * 0.14;
        let az = 0;

        // 1. 3D Curl Noise 난류
        if (layer.curlAmp > 0.001) {
          curlNoise3(curl, p.x, p.y, p.z, this.time, layer.curlFreq);
          ax += curl[0] * layer.curlAmp;
          ay += curl[1] * layer.curlAmp;
          az += curl[2] * layer.curlAmp;
        }

        // 2. 소용돌이(Vortex) + 방사형(Radial) 힘
        const rx = p.x - ox;
        const ry = p.y - oy;
        const rz = p.z - oz;
        const rHoriz = Math.hypot(rx, rz);
        if (rHoriz > 0.002) {
          const invR = 1 / rHoriz;
          const nx = rx * invR;
          const nz = rz * invR;
          if (Math.abs(layer.vortex) > 0.001) {
            const swirlGain = layer.vortex / (0.28 + rHoriz);
            ax += -nz * swirlGain;
            az += nx * swirlGain;
          }
          if (Math.abs(layer.radial) > 0.001) {
            ax += nx * layer.radial;
            az += nz * layer.radial;
          }
        }

        // 3. SplatSimKernel Home Spring (응집·복원)
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

        // 4. Hand / Pointer Collider 상호작용 (meta-mr-picker SplatSimKernel.AccumulateCollider 포트)
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
            // SplatSimKernel.Firmness (비뉴턴 전단 농화)
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
        if (speed > 4.2) {
          const capS = 4.2 / speed;
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

        // 스테이지 밖 폭주 방지
        if (Math.hypot(rx, ry, rz) > 4.2 * scale) p.alive = false;
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
        for (let i = 0; i < st.cap; i++) {
          const p = st.particles[i];
          if (!p.alive) continue;
          const lifeT = clamp(p.age / Math.max(p.life, 0.05));
          // 급팽창(Anticipation/Snap) → 완만한 소멸 커브
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

          batch.put(
            p.x + oxStage, p.y + oyStage, p.z + ozStage,
            ax, ay, az,
            longR, wideR,
            coreRgb[0], coreRgb[1], coreRgb[2],
            rimRgb[0], rimRgb[1], rimRgb[2],
            kernelId, alpha, clamp(layer.erosion + lifeT * 0.28), layer.emission * (1 + p.glow * 0.55),
            p.seed, lifeT, layer.glint,
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
    this.metrics.questGrade = this.budgetReport?.clamped
      ? 'CLAMPED'
      : totalSplats > QUEST_BUDGET.tightSplats || estOverdraw > QUEST_BUDGET.tightOverdrawArea
        ? 'TIGHT'
        : 'OK';
  }

  // RitualGlowSplat.shader 베지에+헬릭스 + 후디니 다중 스케일 노이즈/분기 곡선
  paintArcLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage) {
    const ox = (layer.origin?.[0] || 0) * scale + oxStage;
    const oy = (layer.origin?.[1] || 0) * scale + oyStage;
    const oz = (layer.origin?.[2] || 0) * scale + ozStage;
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
          // 블레이드 앤 소울풍 기울어진 초승달 참격 아크
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
          // 중심에서 방사형·상향으로 꺾이며 뻗는 분기 뇌전
          const ang = baseAngle + Math.sin(t * 3.8 + s * 3.1) * 0.25;
          const distR = rad * u;
          const bend = Math.sin(u * Math.PI) * hgt * 0.32;
          x = ox + Math.cos(ang) * distR;
          y = oy + (u - 0.35) * hgt + bend;
          z = oz + Math.sin(ang) * distR;
        } else {
          // helix: 상승 나선 화염/기운 촉수
          const ang = baseAngle + u * TAU * layer.helixTurns * 0.55;
          const rCurve = rad * (0.35 + 0.65 * Math.sin(u * Math.PI * 0.85)) * (1 - 0.28 * u);
          const hAng = phase + u * TAU * layer.helixTurns;
          const hR = layer.helixRadius * scale * Math.sin(u * Math.PI);
          x = ox + Math.cos(ang) * rCurve + Math.cos(hAng) * hR;
          y = oy + u * hgt;
          z = oz + Math.sin(ang) * rCurve + Math.sin(hAng) * hR;
        }

        // 다중 스케일 노이즈 변위 (저주파 굴곡 + 중주파 떨림 + 고주파 지글거림)
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

          // 2차 잔가지 분기 (Houdini Branching)
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

  // RitualSealWave.cs: Anticipation → 폭발적 팽창(Snap) → 완만한 소멸(Slow Decay)
  paintWaveLayer(layer, batch, kernelId, coreRgb, rimRgb, scale, t, oxStage, oyStage, ozStage) {
    const period = Math.max(0.4, layer.period);
    const u = ((t - layer.delay) % period + period) % period / period;
    // 비선형 폭발 커브: 빠르게 팽창하고 길게 잔광 소멸
    const expand = 1 - Math.pow(1 - u, 3.1);
    const fadeIn = smooth(u / 0.08);
    const fadeOut = 1 - smooth((u - 0.18) / 0.82);
    const alpha = layer.opacity * fadeIn * fadeOut;
    if (alpha <= 0.006) return 0;

    const r = mix(layer.radiusStart, layer.radiusEnd, expand) * scale;
    const thick = layer.thickness * scale * (1.2 - 0.55 * u);
    const ox = (layer.origin?.[0] || 0) * scale + oxStage;
    const oy = (layer.origin?.[1] || 0) * scale + oyStage;
    const oz = (layer.origin?.[2] || 0) * scale + ozStage;
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
