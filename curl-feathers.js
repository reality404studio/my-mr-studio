// Zero-GC 3D Curl Noise + Vortex/Radial + Hand Collider Feather Swarm for ink-crow Phase 3.
// Cherry-picked physics core from prototype/splat-vfx-studio (sim.js curlNoise3 + SplatSimKernel hand collider).
import {TAU, clamp, mix, random, add, sub, mul, dot, onSeal} from './gesture.js?v=a2c3cb2';

// Divergence-free 2-octave analytical 3D Curl Noise (zero heap allocations).
export function curlNoise3(out, x, y, z, t, freq) {
  const fx = x * freq, fy = y * freq, fz = z * freq;
  const t1 = t * 1.15, t2 = t * 0.78;
  const dPz_dy = -0.9 * Math.sin(fy * 1.8 + t2);
  const dPy_dz = Math.cos(fz + t2);
  const dPx_dz = -0.85 * Math.sin(fz * 1.7 - t2);
  const dPz_dx = Math.cos(fx - t1);
  const dPy_dx = -0.8 * Math.sin(fx * 1.6 + t1);
  const dPx_dy = Math.cos(fy + t1);

  const fx2 = fx * 2.13 + 3.1, fy2 = fy * 2.13 - 1.7, fz2 = fz * 2.13 + 2.4;
  const cx2 = -0.35 * (Math.cos(fz2 - t1 * 1.4) + Math.sin(fy2 + t2 * 1.7));
  const cy2 = -0.35 * (Math.cos(fx2 + t2 * 1.5) + Math.sin(fz2 - t1 * 1.3));
  const cz2 = -0.35 * (Math.cos(fy2 - t1 * 1.6) + Math.sin(fx2 + t2 * 1.4));

  out[0] = (dPz_dy - dPy_dz) + cx2;
  out[1] = (dPx_dz - dPz_dx) + cy2;
  out[2] = (dPy_dx - dPx_dy) + cz2;
  return out;
}

const POOL_SIZE = 96;

export class FeatherSwarm {
  constructor() {
    this.rng = random(4909);
    this.curl = [0, 0, 0];
    this.prevHands = new Map();
    this.colliders = [];
    this.credit = 0;
    this.cursor = 0;
    this.activeCount = 0;
    this.blasted = false;
    this.pool = Array.from({length: POOL_SIZE}, () => ({
      alive: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      age: 0, life: 1.4,
      len: 0.036, wid: 0.011,
      seed: 0.5, glow: 0, spin: 0
    }));
  }

  reset() {
    for (let i = 0; i < POOL_SIZE; i++) this.pool[i].alive = false;
    this.prevHands.clear();
    this.colliders.length = 0;
    this.credit = 0;
    this.cursor = 0;
    this.activeCount = 0;
    this.blasted = false;
  }

  updateColliders(hands, dt) {
    this.colliders.length = 0;
    if (!hands || !hands.length) return;
    const invDt = 1 / Math.max(dt, 0.008);
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      const p = h.open ? h.palm : h.tip;
      if (!p) continue;
      const key = h.side || ('h' + i);
      const prev = this.prevHands.get(key);
      let vx = 0, vy = 0, vz = 0;
      if (prev) {
        vx = clamp((p[0] - prev[0]) * invDt, -5, 5);
        vy = clamp((p[1] - prev[1]) * invDt, -5, 5);
        vz = clamp((p[2] - prev[2]) * invDt, -5, 5);
        prev[0] = p[0]; prev[1] = p[1]; prev[2] = p[2];
      } else {
        this.prevHands.set(key, [p[0], p[1], p[2]]);
      }
      this.colliders.push({
        x: p[0], y: p[1], z: p[2],
        vx, vy, vz,
        radius: h.open ? 0.14 : 0.09
      });
    }
  }

  spawnOne(seal, charge) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    const rng = this.rng;
    const a = rng() * TAU;
    const r = seal.r * (1.28 + rng() * 1.25);
    const zOff = (rng() - 0.5) * 0.36;
    const pos = onSeal(seal, Math.cos(a) * r, Math.sin(a) * r, zOff);
    // Tangent + mild inward drift on spawn
    const tx = -Math.sin(a), ty = Math.cos(a);
    const tang = add(mul(seal.u, tx), mul(seal.v, ty));
    const inw = add(mul(seal.u, -Math.cos(a)), mul(seal.v, -Math.sin(a)));
    const spd = 0.42 + 0.55 * charge + rng() * 0.35;

    p.alive = true;
    p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
    p.vx = tang[0] * spd + inw[0] * 0.32;
    p.vy = tang[1] * spd + inw[1] * 0.32;
    p.vz = tang[2] * spd + inw[2] * 0.32;
    p.age = 0;
    p.life = 1.05 + rng() * 0.95;
    p.len = seal.r * (0.145 + rng() * 0.115);
    p.wid = p.len * (0.14 + rng() * 0.06);
    p.seed = rng();
    p.glow = 0.12;
    p.spin = (rng() - 0.5) * 5.0;
  }

  blastOutward(seal) {
    if (this.blasted) return;
    this.blasted = true;
    const c = seal.c, rng = this.rng;
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      let dx = p.x - c[0], dy = p.y - c[1], dz = p.z - c[2];
      let d = Math.hypot(dx, dy, dz);
      if (d < 0.01) {
        const a = rng() * TAU;
        dx = seal.u[0] * Math.cos(a) + seal.v[0] * Math.sin(a);
        dy = seal.u[1] * Math.cos(a) + seal.v[1] * Math.sin(a);
        dz = seal.u[2] * Math.cos(a) + seal.v[2] * Math.sin(a);
        d = 1;
      }
      const inv = 1 / d;
      const impulse = 1.55 + rng() * 1.45;
      p.vx = dx * inv * impulse + seal.n[0] * (rng() - 0.35) * 0.6;
      p.vy = dy * inv * impulse + seal.n[1] * (rng() - 0.35) * 0.6;
      p.vz = dz * inv * impulse + seal.n[2] * (rng() - 0.35) * 0.6;
      p.age = Math.min(p.age, p.life * 0.35);
      p.life = p.age + 0.62 + rng() * 0.45;
      p.glow = 1.0;
    }
  }

  step(dt, seal, charge, implosion, exploded, hands, time) {
    if (!seal || dt <= 0) { this.activeCount = 0; return; }
    this.updateColliders(hands, dt);

    // Spawn feathers when charge >= 0.65 (Stage 5 feather gathering)
    if (!exploded && (charge >= 0.65 || implosion > 0)) {
      const rate = implosion > 0 ? 110 : mix(42, 105, clamp((charge - 0.65) / 0.35));
      this.credit += rate * dt;
      const toSpawn = Math.min(8, Math.floor(this.credit));
      if (toSpawn > 0) {
        this.credit -= toSpawn;
        for (let k = 0; k < toSpawn; k++) this.spawnOne(seal, Math.max(charge, implosion));
      }
    }
    if (exploded && !this.blasted) this.blastOutward(seal);

    const sc = seal.c, su = seal.u, sv = seal.v, sn = seal.n;
    const curl = this.curl;
    const drag = Math.exp(-(exploded ? 1.85 : implosion > 0 ? 1.15 : 1.55) * dt);
    const cols = this.colliders;
    let alive = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      alive++;

      // Local coordinates relative to seal plane (u, v, n)
      const rx = p.x - sc[0], ry = p.y - sc[1], rz = p.z - sc[2];
      const lu = rx * su[0] + ry * su[1] + rz * su[2];
      const lv = rx * sv[0] + ry * sv[1] + rz * sv[2];
      const ln = rx * sn[0] + ry * sn[1] + rz * sn[2];
      const rPlane = Math.hypot(lu, lv);

      let ax = 0, ay = exploded ? -0.45 : 0, az = 0;

      // 1. 3D Curl Noise aerodynamic turbulence
      const curlAmp = exploded ? 2.1 : implosion > 0 ? 1.0 : 1.45 + charge * 0.75;
      curlNoise3(curl, p.x, p.y, p.z, time, 2.35);
      ax += curl[0] * curlAmp;
      ay += curl[1] * curlAmp;
      az += curl[2] * curlAmp;

      // 2. Vortex swirl + Inward radial pull (extreme suction during 0.14s implosion!)
      if (!exploded && rPlane > 0.008) {
        const invR = 1 / rPlane;
        const ru = lu * invR, rv = lv * invR;
        const tu = -rv, tv = ru;
        const vortexK = implosion > 0 ? 8.8 : (2.6 + charge * 2.4) / (0.28 + rPlane);
        const radialK = implosion > 0 ? -15.5 : -(1.9 + charge * 2.5);
        const planePull = implosion > 0 ? -14.0 * ln : -3.2 * ln;

        const fu = tu * vortexK + ru * radialK;
        const fv = tv * vortexK + rv * radialK;
        ax += su[0] * fu + sv[0] * fv + sn[0] * planePull;
        ay += su[1] * fu + sv[1] * fv + sn[1] * planePull;
        az += su[2] * fu + sv[2] * fv + sn[2] * planePull;
      }

      // 3. Hand Collider push / drag / contact spark (vfx-studio SplatSimKernel parity)
      let touch = 0;
      for (let cIdx = 0; cIdx < cols.length; cIdx++) {
        const c = cols[cIdx];
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const outer = c.radius * 2.2;
        if (d2 >= outer * outer) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-4 ? dx / d : 0;
        const ny = d > 1e-4 ? dy / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const rvx = c.vx - p.vx, rvy = c.vy - p.vy, rvz = c.vz - p.vz;
        if (d < c.radius) {
          const w = 1 - d / c.radius;
          const relSpd = Math.hypot(rvx, rvy, rvz);
          const firm = mix(1, mix(0.35, 2.2, clamp(relSpd / 0.35)), 0.55);
          ax += nx * (14.0 * w * firm) + rvx * (6.2 * w * firm);
          ay += ny * (14.0 * w * firm) + rvy * (6.2 * w * firm);
          az += nz * (14.0 * w * firm) + rvz * (6.2 * w * firm);
          touch = Math.max(touch, w);
        } else {
          const s = 1 - (d - c.radius) / Math.max(outer - c.radius, 1e-4);
          ax += rvx * (2.6 * s);
          ay += rvy * (2.6 * s);
          az += rvz * (2.6 * s);
          touch = Math.max(touch, s * 0.45);
        }
      }

      p.vx = (p.vx + ax * dt) * drag;
      p.vy = (p.vy + ay * dt) * drag;
      p.vz = (p.vz + az * dt) * drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.glow = Math.max(touch, p.glow * Math.exp(-3.5 * dt));
      if (implosion > 0) p.glow = Math.max(p.glow, implosion * 0.85);
    }
    this.activeCount = alive;
  }

  paint(batch, fxBatch, alpha = 1) {
    if (alpha <= 0.005 || this.activeCount === 0) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      const lifeT = p.age / p.life;
      const env = Math.min(1, lifeT * 5.0) * (1 - Math.max(0, (lifeT - 0.72) / 0.28));
      const a = env * alpha;
      if (a <= 0.01) continue;

      const spd = Math.hypot(p.vx, p.vy, p.vz);
      const ax = spd > 0.02 ? p.vx / spd : 1;
      const ay = spd > 0.02 ? p.vy / spd : 0;
      const az = spd > 0.02 ? p.vz / spd : 0;

      // Primary jet-black Sumi-e crow feather quill + slender asymmetric ink vane
      batch.put(p.x, p.y, p.z, ax, ay, az, p.len, p.wid * 0.65, 2.45 * a, 0.30, 0, p.seed);
      batch.put(p.x - ay * p.wid * 0.35, p.y + ax * p.wid * 0.35, p.z, ax + ay * 0.14, ay - ax * 0.14, az,
        p.len * 0.88, p.wid * 1.18, 1.48 * a, 0.58, p.glow > 0.45 && (i % 3 === 0) ? 4 : 1, (p.seed + 0.37) % 1);

      // Selective cyan/gold star-glint on 1-in-4 hand-touched or imploding feathers (keeps silhouettes crisp!)
      if (p.glow > 0.48 && (i % 4 === 0) && fxBatch) {
        const sr = p.len * (0.34 + 0.28 * p.glow);
        fxBatch.put(p.x, p.y, p.z, 1, 0, 0, sr, sr, 1.45 * a * p.glow, p.seed > 0.5 ? 0.92 : 0.08, 12, p.seed);
      }
    }
  }
}
