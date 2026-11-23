// Stage coordinates are metres, +Y up, -Z forward from initial head pose.
// Shared vector math, Zero-GC 3D Curl Noise, and bilateral hand/pinch classifier.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const unit = (a) => {
  const l = len(a);
  return l > 1e-7 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
export const lerp3 = (a, b, t) => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Divergence-free 2-octave analytical 3D Curl Noise (zero heap allocations).
// Reused from prototype/ink-crow-webxr/public/ink-crow/curl-feathers.js.
export function curlNoise3(out, x, y, z, t, freq = 4.2) {
  const fx = x * freq;
  const fy = y * freq;
  const fz = z * freq;
  const t1 = t * 1.15;
  const t2 = t * 0.78;

  const dPz_dy = -0.9 * Math.sin(fy * 1.8 + t2);
  const dPy_dz = Math.cos(fz + t2);
  const dPx_dz = -0.85 * Math.sin(fz * 1.7 - t2);
  const dPz_dx = Math.cos(fx - t1);
  const dPy_dx = -0.8 * Math.sin(fx * 1.6 + t1);
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

// Shortest distance squared and closest point t in [0, 1] from point p to segment ab.
export function closestPointOnSegment(out, px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t = abLenSq > 1e-10 ? clamp((apx * abx + apy * aby + apz * abz) / abLenSq, 0, 1) : 0;
  out[0] = ax + abx * t;
  out[1] = ay + aby * t;
  out[2] = az + abz * t;
  return t;
}

// Anatomical default joint radii (metres) used when runtime doesn't expose XRJointPose.radius.
export const DEFAULT_JOINT_RADII = {
  wrist: 0.024,
  'thumb-metacarpal': 0.015,
  'thumb-phalanx-proximal': 0.0115,
  'thumb-phalanx-distal': 0.0098,
  'thumb-tip': 0.0082,
  'index-finger-phalanx-proximal': 0.0102,
  'index-finger-phalanx-intermediate': 0.0090,
  'index-finger-phalanx-distal': 0.0079,
  'index-finger-tip': 0.0068,
  'middle-finger-phalanx-proximal': 0.0105,
  'middle-finger-phalanx-intermediate': 0.0092,
  'middle-finger-phalanx-distal': 0.0080,
  'middle-finger-tip': 0.0070,
  'ring-finger-phalanx-proximal': 0.0098,
  'ring-finger-phalanx-intermediate': 0.0086,
  'ring-finger-phalanx-distal': 0.0076,
  'ring-finger-tip': 0.0066,
  'pinky-finger-phalanx-proximal': 0.0088,
  'pinky-finger-phalanx-intermediate': 0.0077,
  'pinky-finger-phalanx-distal': 0.0068,
  'pinky-finger-tip': 0.0059,
};

// Classify WebXR hand joints into palm frame, pinch state with hysteresis, and finger chains.
export function classifyHand(joints, side, wasPinching = false, radii = null) {
  const wrist = joints.wrist;
  const index = joints['index-finger-phalanx-proximal'];
  const pinky = joints['pinky-finger-phalanx-proximal'];
  const tip = joints['index-finger-tip'];
  const thumb = joints['thumb-tip'];
  if (!wrist || !index || !pinky || !tip || !thumb) return null;

  const knuckles = lerp3(index, pinky, 0.49);
  const palm = lerp3(wrist, knuckles, 0.60);
  const width = dist(index, pinky);
  if (width < 0.024) return null;

  const pinchDist = dist(tip, thumb);
  // Hand-size-adaptive pinch hysteresis (enter ~2.4cm, exit ~3.6cm on typical hand).
  const enterThresh = clamp(width * 0.36, 0.020, 0.032);
  const exitThresh = clamp(width * 0.54, 0.030, 0.046);
  const pinch = wasPinching ? pinchDist < exitThresh : pinchDist < enterThresh;
  const pinchStrength = clamp(1 - (pinchDist - enterThresh * 0.65) / (exitThresh * 1.15), 0, 1);
  const pinchPos = lerp3(thumb, tip, 0.52);

  // Palm outward normal (consistent across left/right hands).
  const across = sub(pinky, index);
  const forward = sub(knuckles, wrist);
  let normal = unit(cross(across, forward));
  if (side === 'left') normal = mul(normal, -1);

  const fingers = ['index', 'middle', 'ring', 'pinky'];
  let extendedCount = 0;
  for (const f of fingers) {
    const base = joints[f + '-finger-phalanx-proximal'];
    const end = joints[f + '-finger-tip'];
    if (!base || !end) continue;
    const axis = unit(sub(base, wrist));
    const ext = dot(sub(end, base), axis) / width;
    if (ext > (f === 'pinky' ? 0.36 : 0.48)) extendedCount++;
  }

  return {
    side: side === 'left' ? 'left' : 'right',
    palm,
    normal,
    forward: unit(forward),
    across: unit(across),
    tip,
    thumb,
    pinch,
    pinchPos,
    pinchStrength,
    open: !pinch && extendedCount >= 3,
    width,
    joints,
    radii: radii || DEFAULT_JOINT_RADII,
  };
}
