// Articulated 21-joint bilateral virtual hand generator for desktop preview, auto-demo, and unit tests.
// Produces anatomically plausible left/right hands with joint radii so hybrid occlusion & finger weaving
// can be verified visually without putting on Quest 3S.

import {
  add,
  classifyHand,
  DEFAULT_JOINT_RADII,
  lerp3,
  mul,
  smooth,
} from './gesture.js?v=8d6c64b';

// Synthesize a full 21-joint hand centered around a palm/pinch pose.
export function buildSyntheticHand({
  side = 'right',
  wristPos = [0.12, -0.14, -0.42],
  pinch = false,
  spread = 1.0,
  curl = 0.12,
  yaw = 0,
  pitch = 0.25,
} = {}) {
  const sgn = side === 'left' ? -1 : 1;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Local hand basis: +x toward pinky (mirrored by sgn), +y along fingers, +z out of palm
  const toWorld = (lx, ly, lz) => {
    const x0 = lx * sgn;
    // Pitch around X, then yaw around Y
    const y1 = ly * cp - lz * sp;
    const z1 = ly * sp + lz * cp;
    const x2 = x0 * cy + z1 * sy;
    const z2 = -x0 * sy + z1 * cy;
    return [wristPos[0] + x2, wristPos[1] + y1, wristPos[2] + z2];
  };

  const joints = {};
  joints.wrist = toWorld(0, 0, 0);

  // Four main fingers: index (-0.032), middle (-0.010), ring (+0.012), pinky (+0.033)
  const specs = [
    ['index', -0.032, 0.082, 0.038, 0.024, 0.019, -0.14 * spread],
    ['middle', -0.010, 0.086, 0.042, 0.026, 0.020, -0.03 * spread],
    ['ring', 0.012, 0.082, 0.038, 0.024, 0.019, 0.08 * spread],
    ['pinky', 0.033, 0.074, 0.030, 0.020, 0.016, 0.19 * spread],
  ];

  for (const [name, kx, ky, l1, l2, l3, splay] of specs) {
    const isIndexPinch = pinch && name === 'index';
    const c = isIndexPinch ? 0.62 : curl;
    const prox = toWorld(kx, ky, 0.0);
    const sx = Math.sin(splay);
    const cy1 = Math.cos(splay);

    const a1 = c * 0.55;
    const a2 = c * 1.15;
    const a3 = c * 1.60;

    const p1 = [
      kx + sx * l1,
      ky + cy1 * l1 * Math.cos(a1),
      l1 * Math.sin(a1),
    ];
    const p2 = [
      p1[0] + sx * l2,
      p1[1] + cy1 * l2 * Math.cos(a2),
      p1[2] + l2 * Math.sin(a2),
    ];
    const p3 = [
      p2[0] + sx * l3,
      p2[1] + cy1 * l3 * Math.cos(a3),
      p2[2] + l3 * Math.sin(a3),
    ];

    joints[`${name}-finger-phalanx-proximal`] = prox;
    joints[`${name}-finger-phalanx-intermediate`] = toWorld(p1[0], p1[1], p1[2]);
    joints[`${name}-finger-phalanx-distal`] = toWorld(p2[0], p2[1], p2[2]);
    joints[`${name}-finger-tip`] = toWorld(p3[0], p3[1], p3[2]);
  }

  // Thumb
  const thMeta = toWorld(-0.024, 0.030, 0.010);
  const thProx = toWorld(-0.044, 0.056, 0.024);
  const thDist = pinch ? lerp3(thProx, joints['index-finger-tip'], 0.58) : toWorld(-0.056, 0.080, 0.036);
  const thTip = pinch
    ? add(joints['index-finger-tip'], mul([0, -0.008, 0.006], 1))
    : toWorld(-0.064, 0.098, 0.044);

  joints['thumb-metacarpal'] = thMeta;
  joints['thumb-phalanx-proximal'] = thProx;
  joints['thumb-phalanx-distal'] = thDist;
  joints['thumb-tip'] = thTip;

  return classifyHand(joints, side, pinch, DEFAULT_JOINT_RADII);
}

// Automated desktop rehearsal choreography demonstrating the entire 4-step story:
//   0.0 - 2.0s: Right hand approaches floating bookmark & pinches
//   2.0 - 3.6s: Carries bookmark to book location (left side) & releases -> anchors!
//   3.6 - 6.8s: Pinches anchored bookmark & pulls rightwards 30cm like masking tape -> detaches!
//   6.8s+     : Both hands spread fingers near center so sea-snake weaves smoothly in & out between all 10 fingers!
export class DesktopRehearsal {
  constructor() {
    this.t = 0;
  }

  reset() {
    this.t = 0;
  }

  hands(dt, scene) {
    this.t += dt;
    const t = this.t;

    const bookAnchor = [-0.15, -0.09, -0.44];
    const pullEnd = [0.17, -0.06, -0.43];

    if (t < 1.6) {
      // Approach floating bookmark
      const q = smooth(t / 1.25);
      const wrist = lerp3([0.22, -0.24, -0.46], [0.03, -0.20, -0.44], q);
      return [
        buildSyntheticHand({
          side: 'right',
          wristPos: wrist,
          pinch: t > 1.28,
          spread: 0.9,
          curl: 0.14,
          yaw: -0.22,
          pitch: 0.25,
        }),
      ];
    }

    if (t < 3.2) {
      // Carry floating bookmark to book anchor & release to attach
      const q = smooth((t - 1.6) / 1.25);
      const wrist = lerp3([0.03, -0.20, -0.44], [bookAnchor[0] + 0.025, bookAnchor[1] - 0.12, bookAnchor[2]], q);
      return [
        buildSyntheticHand({
          side: 'right',
          wristPos: wrist,
          pinch: t < 2.92,
          spread: 0.85,
          curl: 0.14,
          yaw: -0.18,
          pitch: 0.28,
        }),
      ];
    }

    if (t < 6.6) {
      // Re-pinch anchored bookmark & pull masking-tape sentence 30cm to the right
      const q = smooth((t - 3.65) / 2.75);
      const target = lerp3(bookAnchor, pullEnd, q);
      const wrist = [target[0] + 0.025, target[1] - 0.125, target[2] + 0.01];
      return [
        buildSyntheticHand({
          side: 'right',
          wristPos: wrist,
          pinch: t > 3.45 && scene.phase !== 'swimming',
          spread: 0.9,
          curl: 0.12,
          yaw: -0.20,
          pitch: 0.24,
        }),
      ];
    }

    // Both hands present open fingers calmly near center so sea-snake glides between fingers
    const w = t - 6.6;
    const leftWrist = [
      -0.105 + Math.sin(w * 0.35) * 0.014,
      -0.13 + Math.cos(w * 0.42) * 0.008,
      -0.44 + Math.sin(w * 0.28) * 0.008,
    ];
    const rightWrist = [
      0.105 + Math.cos(w * 0.32) * 0.014,
      -0.13 + Math.sin(w * 0.40) * 0.008,
      -0.43 + Math.cos(w * 0.30) * 0.008,
    ];
    return [
      buildSyntheticHand({
        side: 'left',
        wristPos: leftWrist,
        pinch: false,
        spread: 1.35,
        curl: 0.10,
        yaw: 0.35 + Math.sin(w * 0.25) * 0.08,
        pitch: 0.16,
      }),
      buildSyntheticHand({
        side: 'right',
        wristPos: rightWrist,
        pinch: false,
        spread: 1.35,
        curl: 0.10,
        yaw: -0.35 + Math.cos(w * 0.26) * 0.08,
        pitch: 0.16,
      }),
    ];
  }
}
