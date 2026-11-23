// Hybrid 3D Hand Occlusion Mask Builder:
// 1) Packs up to 96 anatomical 3D tapered capsules + palm ellipsoids for Pass 1 Depth Pre-pass (1 instanced draw call).
// 2) Packs up to 32 bilateral finger bone capsules for Pass 2 ribbon shader soft-feathering & contact AO.
// 3) Exposes clean finger capsule list for snake collision & helical weaving in snake.js.

import { add, DEFAULT_JOINT_RADII, dist, lerp3, mul, sub, unit } from './gesture.js?v=bs-1';

export const MASK_INSTANCE_STRIDE = 10; // a.xyz, rA, b.xyz, rB, flattenY, pad
export const MAX_MASK_INSTANCES = 96;
export const MAX_SHADER_CAPSULES = 32;

export const FINGER_CHAINS = [
  ['thumb', ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']],
  ['index', ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip']],
  ['middle', ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip']],
  ['ring', ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip']],
  ['pinky', ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip']],
];

function jointRadius(radii, name) {
  const r = radii?.[name];
  if (Number.isFinite(r) && r > 0.003) return r;
  return DEFAULT_JOINT_RADII[name] || 0.0085;
}

export class HandMaskData {
  constructor() {
    this.instances = new Float32Array(MAX_MASK_INSTANCES * MASK_INSTANCE_STRIDE);
    this.instanceCount = 0;

    // Uniform arrays for Pass 2 ribbon shader soft occlusion & contact AO
    this.shaderA = new Float32Array(MAX_SHADER_CAPSULES * 4);
    this.shaderB = new Float32Array(MAX_SHADER_CAPSULES * 4);
    this.shaderCount = 0;

    // Structured finger bone & finger axis records for snake weaving + collision
    this.fingerCapsules = [];
    this.fingerAxes = [];
  }

  clear() {
    this.instanceCount = 0;
    this.shaderCount = 0;
    this.fingerCapsules.length = 0;
    this.fingerAxes.length = 0;
  }

  pushInstance(ax, ay, az, rA, bx, by, bz, rB, flatten = 1.0, handIndex = 0) {
    if (this.instanceCount >= MAX_MASK_INSTANCES) return;
    if (
      !Number.isFinite(ax + ay + az + rA + bx + by + bz + rB) ||
      rA <= 0 ||
      rB <= 0
    ) {
      return;
    }
    const o = this.instanceCount++ * MASK_INSTANCE_STRIDE;
    const d = this.instances;
    d[o] = ax;
    d[o + 1] = ay;
    d[o + 2] = az;
    d[o + 3] = rA;
    d[o + 4] = bx;
    d[o + 5] = by;
    d[o + 6] = bz;
    d[o + 7] = rB;
    d[o + 8] = flatten;
    d[o + 9] = handIndex;
  }

  pushShaderCapsule(ax, ay, az, rA, bx, by, bz, rB) {
    if (this.shaderCount >= MAX_SHADER_CAPSULES) return;
    const o = this.shaderCount++ * 4;
    this.shaderA[o] = ax;
    this.shaderA[o + 1] = ay;
    this.shaderA[o + 2] = az;
    this.shaderA[o + 3] = rA;
    this.shaderB[o] = bx;
    this.shaderB[o + 1] = by;
    this.shaderB[o + 2] = bz;
    this.shaderB[o + 3] = rB;
  }

  build(hands = []) {
    this.clear();
    if (!hands || !hands.length) return;

    for (let hIdx = 0; hIdx < hands.length; hIdx++) {
      const h = hands[hIdx];
      const j = h?.joints;
      const radii = h?.radii || DEFAULT_JOINT_RADII;

      if (!j) {
        // Minimal controller fallback: single sphere at tip
        if (h?.tip) {
          const p = h.tip;
          this.pushInstance(p[0], p[1], p[2], 0.016, p[0], p[1] + 0.002, p[2], 0.016, 1.0, hIdx);
        }
        continue;
      }

      // 1. Finger phalanx tapered capsules (exact anatomical radii from XRJointPose.radius)
      for (let fIdx = 0; fIdx < FINGER_CHAINS.length; fIdx++) {
        const [fName, names] = FINGER_CHAINS[fIdx];
        const pts = [];
        const rs = [];
        for (const n of names) {
          if (j[n]) {
            pts.push(j[n]);
            rs.push(jointRadius(radii, n));
          }
        }
        if (pts.length < 2) continue;

        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          // Slight 1.06x padding avoids bright fringes along real skin boundary in passthrough
          const rA = rs[i] * 1.06;
          const rB = rs[i + 1] * 1.06;
          this.pushInstance(a[0], a[1], a[2], rA, b[0], b[1], b[2], rB, 1.0, hIdx);
          this.pushShaderCapsule(a[0], a[1], a[2], rA, b[0], b[1], b[2], rB);
          this.fingerCapsules.push({
            handSide: h.side,
            finger: fName,
            seg: i,
            a,
            b,
            rA,
            rB,
          });
        }

        // Whole finger axis descriptor for sea-snake helical weaving
        const base = pts[0];
        const tip = pts[pts.length - 1];
        const length = dist(base, tip);
        if (length > 0.02) {
          this.fingerAxes.push({
            id: `${h.side}-${fName}`,
            handSide: h.side,
            finger: fName,
            base,
            tip,
            mid: lerp3(base, tip, 0.55),
            axis: unit(sub(tip, base)),
            length,
            radius: (rs[0] + rs[rs.length - 1]) * 0.52,
            palmNormal: h.normal || [0, 1, 0],
          });
        }
      }

      // 2. Palm anatomical volume (metacarpal ribs + knuckle arch + thenar eminence)
      const wrist = j.wrist;
      const idx = j['index-finger-phalanx-proximal'];
      const mid = j['middle-finger-phalanx-proximal'] || (idx && j['pinky-finger-phalanx-proximal'] ? lerp3(idx, j['pinky-finger-phalanx-proximal'], 0.34) : null);
      const rng = j['ring-finger-phalanx-proximal'] || (idx && j['pinky-finger-phalanx-proximal'] ? lerp3(idx, j['pinky-finger-phalanx-proximal'], 0.67) : null);
      const pnk = j['pinky-finger-phalanx-proximal'];
      const thMeta = j['thumb-metacarpal'];
      const thProx = j['thumb-phalanx-proximal'];

      if (wrist && idx && pnk) {
        const across = sub(pnk, idx);
        const palmW = Math.max(0.055, dist(idx, pnk));
        const uAxis = unit(across);
        const knuckles = [idx, mid || lerp3(idx, pnk, 0.34), rng || lerp3(idx, pnk, 0.67), pnk];
        const palmThick = clampPalmRadius(palmW * 0.24);

        // Four longitudinal metacarpal volume capsules spanning wrist to knuckles
        for (let k = 0; k < 4; k++) {
          const u = k / 3;
          const wristPt = add(wrist, mul(uAxis, (u - 0.5) * palmW * 0.66));
          const topPt = knuckles[k];
          const midPt = lerp3(wristPt, topPt, 0.52);
          this.pushInstance(
            wristPt[0], wristPt[1], wristPt[2], palmThick * 1.05,
            midPt[0], midPt[1], midPt[2], palmThick * 1.15,
            0.66, hIdx,
          );
          this.pushInstance(
            midPt[0], midPt[1], midPt[2], palmThick * 1.12,
            topPt[0], topPt[1], topPt[2], palmThick * 0.94,
            0.68, hIdx,
          );
        }

        // Three cross-palm bridges to completely seal gaps between metacarpals
        for (let row = 0; row < 3; row++) {
          const v = 0.24 + row * 0.28;
          const leftPt = lerp3(add(wrist, mul(uAxis, -palmW * 0.34)), idx, v);
          const rightPt = lerp3(add(wrist, mul(uAxis, palmW * 0.34)), pnk, v);
          this.pushInstance(
            leftPt[0], leftPt[1], leftPt[2], palmThick * 1.06,
            rightPt[0], rightPt[1], rightPt[2], palmThick * 1.02,
            0.64, hIdx,
          );
        }

        // Thenar eminence (thumb-base fleshy pad)
        if (thMeta || thProx) {
          const tA = lerp3(wrist, thMeta || idx, 0.55);
          const tB = lerp3(thProx || idx, idx, 0.38);
          this.pushInstance(
            tA[0], tA[1], tA[2], palmThick * 1.08,
            tB[0], tB[1], tB[2], palmThick * 0.92,
            0.84, hIdx,
          );
        }
      }
    }
  }
}

function clampPalmRadius(r) {
  return Math.max(0.011, Math.min(0.020, r));
}

// Build a unit tapered-capsule geometry (y-axis aligned, aEnd in {0, 1} selects endpoint a vs b).
// Used for Pass 1 3D Depth Pre-pass in a single instanced draw call (~60 tris per capsule).
export function createUnitCapsuleGeometry(radialSegs = 10, capRings = 2) {
  const verts = []; // nx, ny, nz, endFlag (0 for a-hemisphere, 1 for b-hemisphere)
  const indices = [];

  const ringCount = capRings * 2 + 2; // bottom pole..equator(end=0) + equator(end=1)..top pole
  const pushRing = (latAngle, endFlag) => {
    const cy = Math.sin(latAngle);
    const r = Math.cos(latAngle);
    for (let i = 0; i <= radialSegs; i++) {
      const phi = (i / radialSegs) * Math.PI * 2;
      verts.push(Math.cos(phi) * r, cy, Math.sin(phi) * r, endFlag);
    }
  };

  // Bottom hemisphere (endFlag = 0): -PI/2 -> 0
  for (let r = 0; r <= capRings; r++) {
    const lat = -Math.PI * 0.5 + (r / capRings) * (Math.PI * 0.5);
    pushRing(lat, 0);
  }
  // Top hemisphere (endFlag = 1): 0 -> +PI/2
  for (let r = 0; r <= capRings; r++) {
    const lat = (r / capRings) * (Math.PI * 0.5);
    pushRing(lat, 1);
  }

  const stride = radialSegs + 1;
  for (let ring = 0; ring < ringCount - 1; ring++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = ring * stride + i;
      const b = a + 1;
      const c = (ring + 1) * stride + i;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(indices),
    vertexStride: 4,
    indexCount: indices.length,
  };
}
