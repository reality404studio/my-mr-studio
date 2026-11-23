// Bookmark anchor, masking-tape pull/rewind, and 40-node sea-snake bilateral finger-weaving physics.
// Pure JS (Zero WebGL dependency) so it can be deterministically unit-tested in Node.

import {
  add,
  clamp,
  closestPointOnSegment,
  cross,
  curlNoise3,
  dist,
  dot,
  len,
  lerp3,
  mix,
  mul,
  random,
  smooth,
  sub,
  TAU,
  unit,
} from './gesture.js?v=ad1cff5';
import { HandMaskData } from './hand-mask.js?v=ad1cff5';
import { RIBBON_HEIGHT_M, RIBBON_LENGTH_M } from './text-atlas.js?v=ad1cff5';

export const NODE_COUNT = 40;
export const RIBBON_VERT_STRIDE = 10; // px,py,pz, nx,ny,nz, u,v, edgeFade, tension
export const MAX_GLINTS = 64;
export const GLINT_STRIDE = 10; // x,y,z, size, alpha, seed, hueMix, vx,vy,vz (packed for render)

export const PHASE = {
  FLOATING: 'floating',
  ANCHORING: 'anchoring',
  ANCHORED: 'anchored',
  PULLING: 'pulling',
  REWINDING: 'rewinding',
  SWIMMING: 'swimming',
  READING: 'reading',
};

const DETACH_RATIO = 0.96;
const GRAB_FLOAT_RADIUS = 0.075;
const GRAB_TAB_RADIUS = 0.062;
const FINGER_CLEARANCE = 0.0042; // 4.2mm skin clearance so ribbon hugs finger without z-clipping

export class BookmarkSnakeScene {
  constructor() {
    this.handMask = new HandMaskData();
    this.rng = random(4049);

    // 40 spine nodes: i=0 (anchor/tail, u=0) -> i=NODE_COUNT-1 (pulled tip / sea-snake head, u=pullRatio..1)
    this.nodes = Array.from({ length: NODE_COUNT }, () => [0, 0, -0.45]);
    this.prevNodes = Array.from({ length: NODE_COUNT }, () => [0, 0, -0.45]);
    this.normals = Array.from({ length: NODE_COUNT }, () => [0, 0, 1]);
    this.sides = Array.from({ length: NODE_COUNT }, () => [0, 1, 0]);

    // Pre-allocated ribbon mesh buffers (2 verts per spine node, 2 tris per segment)
    this.ribbonVerts = new Float32Array(NODE_COUNT * 2 * RIBBON_VERT_STRIDE);
    this.ribbonIndices = new Uint16Array((NODE_COUNT - 1) * 6);
    for (let i = 0; i < NODE_COUNT - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const o = i * 6;
      this.ribbonIndices[o] = a;
      this.ribbonIndices[o + 1] = b;
      this.ribbonIndices[o + 2] = c;
      this.ribbonIndices[o + 3] = c;
      this.ribbonIndices[o + 4] = b;
      this.ribbonIndices[o + 5] = d;
    }
    this.ribbonVisible = false;

    // Sparkle glint pool (윤슬 water droplets emitted on anchor lock, peeling, detach & finger brush)
    this.glintPool = Array.from({ length: MAX_GLINTS }, () => ({
      alive: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      age: 0, life: 0.9,
      size: 0.012, seed: 0.5, hue: 0.2,
    }));
    this.glintData = new Float32Array(MAX_GLINTS * 7); // x,y,z, size, alpha, seed, hue
    this.glintCount = 0;
    this.glintCursor = 0;

    // Visual toggles
    this.tapeEnabled = true;
    this.tapeBlend = 1.0;
    this.shimmerPreset = 0; // 0: silver sunlit water, 1: golden sunset, 2: ocean aqua

    // Scratch arrays (zero-GC hot path)
    this._curl = [0, 0, 0];
    this._closest = [0, 0, 0];

    this.reset();
  }

  reset() {
    this.time = 0;
    this.frame = 0;
    this.phase = PHASE.FLOATING;
    this.phaseTime = 0;

    // Bookmark pose: floats gently in front of user until pinched and placed onto a real book.
    this.bookmarkPos = [0.0, -0.07, -0.44];
    this.bookmarkRight = [1, 0, 0];
    this.bookmarkUp = [0, 0.92, 0.39];
    this.bookmarkNormal = unit(cross(this.bookmarkRight, this.bookmarkUp));
    this.anchorPos = this.bookmarkPos.slice();
    this.anchorRight = this.bookmarkRight.slice();
    this.anchorUp = this.bookmarkUp.slice();
    this.anchorNormal = this.bookmarkNormal.slice();

    this.grabSide = null;
    this.pullRatio = 0;
    this.pullVelocity = 0;
    this.pullTipPos = this.bookmarkPos.slice();
    this.hoverAmount = 0;
    this.detachFlash = 0;
    this.anchorPulse = 0;

    // Sea-snake steering state
    this.headVel = [0.09, 0.015, 0.0];
    this._seedSide = null;
    this.readLeft = null;
    this.readRight = null;
    this.targetFingerId = null;
    this.targetFingerTimer = 0;
    this.orbitAngle = 0;
    this.orbitDir = 1;
    this.orbitSlide = 0.5;
    this.ribbonVisible = false;
    this.headPos = [0, 0, 0];

    for (const g of this.glintPool) g.alive = false;
    this.glintCount = 0;
    this.handMask.clear();
  }

  reanchor() {
    this.reset();
  }

  // Helper to place bookmark directly at an anchor pose (used by tests & quick-start button).
  placeBookmarkAt(pos, right = [1, 0, 0], up = [0, 0.85, 0.52]) {
    this.anchorPos = pos.slice();
    this.anchorRight = unit(right);
    this.anchorNormal = unit(cross(this.anchorRight, up));
    this.anchorUp = unit(cross(this.anchorNormal, this.anchorRight));
    this.bookmarkPos = this.anchorPos.slice();
    this.bookmarkRight = this.anchorRight.slice();
    this.bookmarkUp = this.anchorUp.slice();
    this.bookmarkNormal = this.anchorNormal.slice();
    this.phase = PHASE.ANCHORED;
    this.phaseTime = 0;
    this.pullRatio = 0;
    this.pullVelocity = 0;
    this.ribbonVisible = false;
    this.anchorPulse = 1.0;
    this.emitBurst(this.anchorPos, 14, 0.14);
  }

  enterPhase(next) {
    this.phase = next;
    this.phaseTime = 0;
  }

  spawnGlint(x, y, z, vx, vy, vz, size = 0.011, life = 0.75, hue = 0.15) {
    const g = this.glintPool[this.glintCursor];
    this.glintCursor = (this.glintCursor + 1) % MAX_GLINTS;
    g.alive = true;
    g.x = x;
    g.y = y;
    g.z = z;
    g.vx = vx;
    g.vy = vy;
    g.vz = vz;
    g.age = 0;
    g.life = life;
    g.size = size;
    g.seed = this.rng();
    g.hue = hue;
  }

  emitBurst(origin, count = 24, speed = 0.24) {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * TAU;
      const elev = (this.rng() - 0.35) * 1.4;
      const sp = speed * (0.35 + 0.85 * this.rng());
      this.spawnGlint(
        origin[0] + (this.rng() - 0.5) * 0.015,
        origin[1] + (this.rng() - 0.5) * 0.015,
        origin[2] + (this.rng() - 0.5) * 0.015,
        Math.cos(a) * sp,
        Math.sin(elev) * sp + 0.04,
        Math.sin(a) * sp,
        0.008 + this.rng() * 0.013,
        0.55 + this.rng() * 0.55,
        this.rng(),
      );
    }
  }

  tick(dt, hands = [], head = [0, 0, 0]) {
    const stepDt = clamp(dt, 0.001, 0.05);
    this.time += stepDt;
    this.phaseTime += stepDt;
    this.frame++;
    this.headPos = head;
    this.detachFlash = Math.max(0, this.detachFlash - stepDt * 1.6);
    this.anchorPulse = Math.max(0, this.anchorPulse - stepDt * 1.8);

    const targetTape = this.tapeEnabled ? 1 : 0;
    this.tapeBlend = mix(this.tapeBlend, targetTape, Math.min(1, stepDt * 10));

    // Build hybrid 3D hand occlusion capsules + finger axes for both hands
    this.handMask.build(hands);

    // Track hover proximity to bookmark tab for soft interactive glow
    let minHover = Infinity;
    for (const h of hands) {
      const p = h.pinchPos || h.tip;
      if (!p) continue;
      minHover = Math.min(minHover, dist(p, this.bookmarkPos));
    }
    const hoverTarget = clamp(1 - (minHover - 0.03) / 0.08, 0, 1);
    this.hoverAmount = mix(this.hoverAmount, hoverTarget, Math.min(1, stepDt * 12));

    switch (this.phase) {
      case PHASE.FLOATING:
        this.tickFloating(stepDt, hands, head);
        break;
      case PHASE.ANCHORING:
        this.tickAnchoring(stepDt, hands, head);
        break;
      case PHASE.ANCHORED:
        this.tickAnchored(stepDt, hands);
        break;
      case PHASE.PULLING:
        this.tickPulling(stepDt, hands, head);
        break;
      case PHASE.REWINDING:
        this.tickRewinding(stepDt, head);
        break;
      case PHASE.SWIMMING:
        this.tickSwimming(stepDt, hands, head);
        break;
      case PHASE.READING:
        this.tickReading(stepDt, hands, head);
        break;
      default:
        break;
    }

    this.stepGlints(stepDt);
  }

  findPinchingHand(hands, targetPos, radius) {
    let best = null;
    let bestDist = radius;
    for (const h of hands) {
      if (!h.pinch) continue;
      const p = h.pinchPos || h.tip;
      if (!p) continue;
      const d = dist(p, targetPos);
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  tickFloating(dt, hands, head) {
    this.ribbonVisible = false;
    // Gently bob in front of viewer at comfortable reach distance
    const bob = Math.sin(this.time * 2.1) * 0.008;
    const sway = Math.cos(this.time * 1.3) * 0.006;
    const base = [head[0] + sway, head[1] - 0.10 + bob, head[2] - 0.42];
    this.bookmarkPos = lerp3(this.bookmarkPos, base, Math.min(1, dt * 4.5));
    const toEye = unit(sub(head, this.bookmarkPos));
    const right = unit(cross([0, 1, 0], toEye));
    this.bookmarkRight = right;
    this.bookmarkUp = unit(cross(toEye, right));
    this.bookmarkNormal = toEye;

    const grabber = this.findPinchingHand(hands, this.bookmarkPos, GRAB_FLOAT_RADIUS);
    if (grabber) {
      this.grabSide = grabber.side;
      this.enterPhase(PHASE.ANCHORING);
    }
  }

  tickAnchoring(dt, hands) {
    this.ribbonVisible = false;
    const h = hands.find((x) => x.side === this.grabSide);
    if (!h || !h.pinch) {
      // Released pinch -> lock omnidirectional bookmark orb onto real book position!
      this.placeBookmarkAt(this.bookmarkPos);
      this.grabSide = null;
      return;
    }

    const p = h.pinchPos || h.tip;
    this.bookmarkPos = lerp3(this.bookmarkPos, p, Math.min(1, dt * 24));
  }

  tickAnchored(_dt, hands) {
    this.ribbonVisible = false;
    this.bookmarkPos = this.anchorPos.slice();

    const puller = this.findPinchingHand(hands, this.anchorPos, GRAB_TAB_RADIUS);
    if (puller) {
      this.grabSide = puller.side;
      this.pullRatio = 0.02;
      this.pullVelocity = 0;
      this.pullTipPos = (puller.pinchPos || puller.tip).slice();
      this.enterPhase(PHASE.PULLING);
    }
  }

  tickPulling(dt, hands, head) {
    const h = hands.find((x) => x.side === this.grabSide);
    if (!h || !h.pinch) {
      // Released before full 30cm extraction -> elastic rewind back into bookmark!
      this.grabSide = null;
      this.enterPhase(PHASE.REWINDING);
      return;
    }

    const p = h.pinchPos || h.tip;
    const prevRatio = this.pullRatio;
    this.pullTipPos = lerp3(this.pullTipPos, p, Math.min(1, dt * 26));
    const rawDist = dist(this.anchorPos, this.pullTipPos);
    const targetRatio = clamp(rawDist / RIBBON_LENGTH_M, 0.02, 1.0);
    this.pullRatio = mix(this.pullRatio, targetRatio, Math.min(1, dt * 22));
    this.pullVelocity = (this.pullRatio - prevRatio) / dt;

    // Emit delicate 윤슬 sparkles along the peeling edge while pulling
    if (this.pullVelocity > 0.22 && this.rng() < 0.45) {
      this.spawnGlint(
        this.anchorPos[0] + (this.rng() - 0.5) * 0.012,
        this.anchorPos[1] + (this.rng() - 0.5) * 0.012,
        this.anchorPos[2] + (this.rng() - 0.5) * 0.012,
        (this.rng() - 0.5) * 0.05,
        0.04 + this.rng() * 0.05,
        (this.rng() - 0.5) * 0.05,
        0.008 + this.rng() * 0.007,
        0.55,
        this.rng(),
      );
    }

    this.layoutPulledRibbon(head);

    if (this.pullRatio >= DETACH_RATIO) {
      // Fully pulled out (30cm) -> DETACH into living sea-snake!
      this.pullRatio = 1.0;
      this.layoutPulledRibbon(head);
      this.detachIntoSnake();
    }
  }

  tickRewinding(dt, head) {
    // Elastic spring-damped retraction back into the book anchor
    const springK = 34.0;
    const damping = 8.2;
    this.pullVelocity += (-this.pullRatio * springK - this.pullVelocity * damping) * dt;
    this.pullRatio = clamp(this.pullRatio + this.pullVelocity * dt, 0, 1);

    if (this.pullRatio <= 0.018 && Math.abs(this.pullVelocity) < 0.15) {
      this.pullRatio = 0;
      this.pullVelocity = 0;
      this.ribbonVisible = false;
      this.enterPhase(PHASE.ANCHORED);
      return;
    }

    // Pull tip retracts smoothly along direction toward anchor
    const pullDir = unit(sub(this.pullTipPos, this.anchorPos));
    this.pullTipPos = add(this.anchorPos, mul(pullDir, this.pullRatio * RIBBON_LENGTH_M));
    this.layoutPulledRibbon(head);
  }

  // Construct curved masking-tape peel geometry from anchorPos (i=0, u=0) to pullTipPos (i=N-1, u=pullRatio).
  layoutPulledRibbon(head) {
    const start = this.anchorPos;
    const end = this.pullTipPos;
    const chord = sub(end, start);
    const chordLen = Math.max(0.006, len(chord));
    const pullDir = mul(chord, 1 / chordLen);

    // Direction-agnostic masking-tape peel arch: lifts gently upward (+Y) regardless of pull direction
    const peelLift = Math.min(0.036, chordLen * 0.16) * (1 - 0.35 * this.pullRatio);
    const upHint = [0, 1, 0];
    const ctrl1 = add(add(start, mul(pullDir, chordLen * 0.32)), mul(upHint, peelLift));
    const ctrl2 = add(add(start, mul(pullDir, chordLen * 0.72)), mul(upHint, peelLift * 0.55));

    for (let i = 0; i < NODE_COUNT; i++) {
      const t = i / (NODE_COUNT - 1);
      const omt = 1 - t;
      const b0 = omt * omt * omt;
      const b1 = 3 * omt * omt * t;
      const b2 = 3 * omt * t * t;
      const b3 = t * t * t;
      const n = this.nodes[i];
      n[0] = b0 * start[0] + b1 * ctrl1[0] + b2 * ctrl2[0] + b3 * end[0];
      n[1] = b0 * start[1] + b1 * ctrl1[1] + b2 * ctrl2[1] + b3 * end[1];
      n[2] = b0 * start[2] + b1 * ctrl1[2] + b2 * ctrl2[2] + b3 * end[2];

      const flutter = Math.sin(t * 14 - this.time * 9) * 0.0014 * t * this.pullRatio;
      n[1] += flutter;
      this.prevNodes[i][0] = n[0];
      this.prevNodes[i][1] = n[1];
      this.prevNodes[i][2] = n[2];
    }

    // Keep omnidirectional bookmark pearl resting on the book anchor while ribbon unrolls from it
    this.bookmarkPos = this.anchorPos.slice();

    this.ribbonVisible = true;
    this.buildRibbonMesh(head, this.pullRatio);
  }

  detachIntoSnake() {
    this.grabSide = null;
    this.detachFlash = 1.0;
    const headNode = this.nodes[NODE_COUNT - 1];
    const neckNode = this.nodes[NODE_COUNT - 2];
    const dir = unit(sub(headNode, neckNode));
    this.headVel = mul(dir, 0.11);
    this.targetFingerId = null;
    this.targetFingerTimer = 0;
    this.orbitAngle = 0;
    this.orbitDir = 1;
    this.emitBurst(this.anchorPos, 18, 0.20);
    this.emitBurst(headNode, 22, 0.26);
    this.enterPhase(PHASE.SWIMMING);
  }

  pickWeaveFinger(headNode, dt) {
    const axes = this.handMask.fingerAxes;
    if (!axes.length) {
      this.targetFingerId = null;
      return null;
    }

    // Filter fingers within interaction radius (45cm) of the sea-snake head
    const nearby = [];
    for (const f of axes) {
      const d = dist(headNode, f.mid);
      if (d < 0.45) nearby.push({ f, d });
    }
    if (!nearby.length) {
      this.targetFingerId = null;
      return null;
    }
    nearby.sort((a, b) => a.d - b.d);

    this.targetFingerTimer += dt;
    let current = nearby.find((item) => item.f.id === this.targetFingerId)?.f || null;

    // Linger gracefully (~3.8s) around a finger before gliding over to a neighboring finger
    const switchInterval = 3.8;
    if (!current || this.targetFingerTimer >= switchInterval) {
      let chosen = nearby[0].f;
      if (current && nearby.length > 1) {
        // Prefer a different nearby finger (including crossing to the other hand!) for calm figure-8 weaving
        const alt = nearby.find((item) => item.f.id !== current.id && item.d < 0.24);
        if (alt) chosen = alt.f;
      }
      if (chosen.id !== this.targetFingerId) {
        this.targetFingerId = chosen.id;
        this.targetFingerTimer = 0;
        this.orbitDir = -this.orbitDir; // Alternating clockwise/CCW creates natural figure-8 wrapping
      }
      current = chosen;
    }
    return current;
  }

  getPinchingPair(hands) {
    if (!hands || hands.length < 2) return null;
    let first = null;
    let second = null;
    for (const h of hands) {
      if (!h?.pinch) continue;
      if (!first) first = h;
      else if (h.side !== first.side) {
        second = h;
        break;
      }
    }
    return first && second ? [first, second] : null;
  }

  tickReading(dt, hands, head) {
    const pair = this.getPinchingPair(hands);
    if (!pair) {
      // Released either hand -> resume calm underwater sea-snake swimming seamlessly from held pose
      this.readLeft = null;
      this.readRight = null;
      const headNode = this.nodes[NODE_COUNT - 1];
      const neckNode = this.nodes[NODE_COUNT - 2];
      this.headVel = mul(unit(sub(headNode, neckNode)), 0.085);
      this.enterPhase(PHASE.SWIMMING);
      return;
    }

    const p0 = pair[0].pinchPos || pair[0].tip;
    const p1 = pair[1].pinchPos || pair[1].tip;
    const mid = lerp3(p0, p1, 0.5);

    // Order left -> right relative to the viewer so Korean text ALWAYS reads left-to-right!
    const toEye = unit(sub(head, mid));
    const viewRight = unit(cross([0, 1, 0], toEye));
    const leftHandP = dot(sub(p0, mid), viewRight) <= dot(sub(p1, mid), viewRight) ? p0 : p1;
    const rightHandP = leftHandP === p0 ? p1 : p0;

    // Span exact 30cm centered between the two hands along their natural axis (even if hands are closer together)
    const rawSpan = sub(rightHandP, leftHandP);
    const rawLen = len(rawSpan);
    let axis = rawLen > 0.035 ? mul(rawSpan, 1 / rawLen) : viewRight;
    // Gently keep reading plane facing the viewer rather than edge-on
    const axisFlat = sub(axis, mul(toEye, dot(axis, toEye) * 0.65));
    axis = len(axisFlat) > 0.2 ? unit(axisFlat) : viewRight;
    if (dot(axis, viewRight) < 0) axis = mul(axis, -1);

    const halfL = RIBBON_LENGTH_M * 0.5;
    const targetLeft = add(mid, mul(axis, -halfL));
    const targetRight = add(mid, mul(axis, halfL));

    // Smooth low-pass filter absorbs natural hand tremor so reading is rock-steady
    const smoothK = Math.min(1, dt * 7.5);
    if (!this.readLeft || !this.readRight) {
      this.readLeft = targetLeft.slice();
      this.readRight = targetRight.slice();
    } else {
      this.readLeft = lerp3(this.readLeft, targetLeft, smoothK);
      this.readRight = lerp3(this.readRight, targetRight, smoothK);
    }

    // Gently glide all 40 spine nodes into a serene, slightly breathing reading ribbon
    const nodeLerp = Math.min(1, dt * 10.0);
    const breath = Math.sin(this.time * 1.4) * 0.0018;
    for (let i = 0; i < NODE_COUNT; i++) {
      const t = i / (NODE_COUNT - 1);
      const arch = Math.sin(t * Math.PI) * 0.007; // Subtle poetic ribbon bow toward viewer
      const tx = mix(this.readLeft[0], this.readRight[0], t) + toEye[0] * arch;
      const ty = mix(this.readLeft[1], this.readRight[1], t) + breath;
      const tz = mix(this.readLeft[2], this.readRight[2], t) + toEye[2] * arch;

      const n = this.nodes[i];
      n[0] = mix(n[0], tx, nodeLerp);
      n[1] = mix(n[1], ty, nodeLerp);
      n[2] = mix(n[2], tz, nodeLerp);
      this.prevNodes[i][0] = n[0];
      this.prevNodes[i][1] = n[1];
      this.prevNodes[i][2] = n[2];
    }

    this.ribbonVisible = true;
    this.buildRibbonMesh(head, 1.0);
  }

  tickSwimming(dt, hands, head) {
    // Both hands pinching simultaneously -> smoothly pause & unfurl the sentence to read!
    if (this.getPinchingPair(hands)) {
      this.readLeft = null;
      this.readRight = null;
      this.enterPhase(PHASE.READING);
      this.tickReading(dt, hands, head);
      return;
    }

    const headIdx = NODE_COUNT - 1;
    const headNode = this.nodes[headIdx];
    const segLen = RIBBON_LENGTH_M / (NODE_COUNT - 1);

    // 1. Steer the sea-snake head: serene slow-motion helical finger-wrapping or calm underwater drift
    const targetFinger = this.pickWeaveFinger(headNode, dt);
    const desiredVel = [0, 0, 0];

    if (targetFinger) {
      // Languid underwater helical orbit & gentle longitudinal slide along the finger shaft
      this.orbitAngle += dt * 1.18 * this.orbitDir;
      this.orbitSlide = 0.5 + 0.28 * Math.sin(this.time * 0.62);

      const fAxis = targetFinger.axis;
      let perpA = cross(fAxis, targetFinger.palmNormal);
      if (len(perpA) < 0.15) perpA = cross(fAxis, [0, 1, 0]);
      perpA = unit(perpA);
      const perpB = unit(cross(fAxis, perpA));

      const orbitR = targetFinger.radius + 0.019; // Smooth breathing clearance around skin
      const slidePt = lerp3(targetFinger.base, targetFinger.tip, this.orbitSlide);
      const c = Math.cos(this.orbitAngle);
      const s = Math.sin(this.orbitAngle);
      const radial = add(mul(perpA, c), mul(perpB, s));
      const tangent = mul(add(mul(perpA, -s), mul(perpB, c)), this.orbitDir);
      const targetPt = add(slidePt, mul(radial, orbitR));

      const toTarget = sub(targetPt, headNode);
      const toDist = len(toTarget);
      const pullStrength = clamp(toDist * 1.85, 0.025, 0.14);
      const steer = add(mul(unit(toTarget), pullStrength), mul(tangent, 0.095));
      desiredVel[0] = steer[0];
      desiredVel[1] = steer[1];
      desiredVel[2] = steer[2];
    } else {
      // Serene free-swimming drift near the anchored book & viewer
      const home = [
        this.anchorPos[0] + Math.sin(this.time * 0.32) * 0.13,
        this.anchorPos[1] + 0.08 + Math.cos(this.time * 0.41) * 0.045,
        this.anchorPos[2] + 0.03 + Math.sin(this.time * 0.27) * 0.055,
      ];
      curlNoise3(this._curl, headNode[0] * 1.6, headNode[1] * 1.6, headNode[2] * 1.6, this.time * 0.38, 2.2);
      const toHome = sub(home, headNode);
      const homeDist = len(toHome);
      const homePull = homeDist > 0.05 ? mul(unit(toHome), Math.min(0.11, homeDist * 0.65)) : [0, 0, 0];
      desiredVel[0] = homePull[0] + this._curl[0] * 0.045;
      desiredVel[1] = homePull[1] + this._curl[1] * 0.032;
      desiredVel[2] = homePull[2] + this._curl[2] * 0.045;
    }

    // Silky viscous steering acceleration & readable slow-motion speed band (5.5..13.5 cm/s)
    const steerBlend = Math.min(1, dt * 2.4);
    this.headVel[0] = mix(this.headVel[0], desiredVel[0], steerBlend);
    this.headVel[1] = mix(this.headVel[1], desiredVel[1], steerBlend);
    this.headVel[2] = mix(this.headVel[2], desiredVel[2], steerBlend);
    const spd = len(this.headVel);
    const clampedSpd = clamp(spd, 0.055, 0.135);
    if (spd > 1e-5) {
      const k = clampedSpd / spd;
      this.headVel[0] *= k;
      this.headVel[1] *= k;
      this.headVel[2] *= k;
    }

    // Advance head node
    this.prevNodes[headIdx][0] = headNode[0];
    this.prevNodes[headIdx][1] = headNode[1];
    this.prevNodes[headIdx][2] = headNode[2];
    headNode[0] += this.headVel[0] * dt;
    headNode[1] += this.headVel[1] * dt;
    headNode[2] += this.headVel[2] * dt;

    // 2. Calm, frame-rate-independent underwater sea-snake undulation
    const damping = Math.exp(-7.5 * dt);
    const swimWaveSpeed = 2.6;
    for (let i = headIdx - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const p = this.prevNodes[i];
      const vx = (n[0] - p[0]) * damping;
      const vy = (n[1] - p[1]) * damping;
      const vz = (n[2] - p[2]) * damping;
      p[0] = n[0];
      p[1] = n[1];
      p[2] = n[2];

      const u = i / (NODE_COUNT - 1);
      const tailWeight = 0.2 + 0.8 * (1 - u);
      const wave = Math.sin((1 - u) * 6.4 - this.time * swimWaveSpeed);
      const side = this.sides[i];
      const norm = this.normals[i];
      const lateralAmp = (targetFinger ? 0.014 : 0.026) * dt * tailWeight * wave;
      const verticalAmp = (targetFinger ? 0.008 : 0.015) * dt * tailWeight * Math.cos((1 - u) * 4.8 - this.time * 1.9);

      n[0] += vx + norm[0] * lateralAmp + side[0] * verticalAmp;
      n[1] += vy + norm[1] * lateralAmp + side[1] * verticalAmp;
      n[2] += vz + norm[2] * lateralAmp + side[2] * verticalAmp;
    }

    // 2.5 Gentle Laplacian curve smoothing removes any high-frequency kinks or jitter
    for (let i = 1; i < headIdx; i++) {
      const prev = this.nodes[i - 1];
      const cur = this.nodes[i];
      const next = this.nodes[i + 1];
      const sm = 0.14;
      cur[0] = mix(cur[0], (prev[0] + next[0]) * 0.5, sm);
      cur[1] = mix(cur[1], (prev[1] + next[1]) * 0.5, sm);
      cur[2] = mix(cur[2], (prev[2] + next[2]) * 0.5, sm);
    }

    // 3. Distance constraints + bilateral finger capsule collision projection
    const capsules = this.handMask.fingerCapsules;
    for (let iter = 0; iter < 4; iter++) {
      for (let i = headIdx - 1; i >= 0; i--) {
        const next = this.nodes[i + 1];
        const cur = this.nodes[i];
        const dx = cur[0] - next[0];
        const dy = cur[1] - next[1];
        const dz = cur[2] - next[2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const scale = segLen / d;
        cur[0] = next[0] + dx * scale;
        cur[1] = next[1] + dy * scale;
        cur[2] = next[2] + dz * scale;
      }

      if (capsules.length) {
        for (let i = 0; i < NODE_COUNT; i++) {
          const n = this.nodes[i];
          for (let cIdx = 0; cIdx < capsules.length; cIdx++) {
            const cap = capsules[cIdx];
            const t = closestPointOnSegment(
              this._closest,
              n[0], n[1], n[2],
              cap.a[0], cap.a[1], cap.a[2],
              cap.b[0], cap.b[1], cap.b[2],
            );
            const minR = mix(cap.rA, cap.rB, t) + FINGER_CLEARANCE;
            const ox = n[0] - this._closest[0];
            const oy = n[1] - this._closest[1];
            const oz = n[2] - this._closest[2];
            const dSq = ox * ox + oy * oy + oz * oz;
            if (dSq < minR * minR) {
              const d = Math.sqrt(dSq);
              let nx = 0;
              let ny = 1;
              let nz = 0;
              if (d > 1e-6) {
                nx = ox / d;
                ny = oy / d;
                nz = oz / d;
              }
              n[0] = this._closest[0] + nx * minR;
              n[1] = this._closest[1] + ny * minR;
              n[2] = this._closest[2] + nz * minR;

              if (iter === 3 && i % 8 === 0 && this.rng() < 0.05) {
                this.spawnGlint(
                  n[0], n[1], n[2],
                  nx * 0.025, ny * 0.025 + 0.015, nz * 0.025,
                  0.007 + this.rng() * 0.005,
                  0.55 + this.rng() * 0.35,
                  this.rng(),
                );
              }
            }
          }
        }
      }
    }

    this.ribbonVisible = true;
    this.buildRibbonMesh(head, 1.0);
  }

  // Parallel Transport (Bishop) frame keeps the 3cm ribbon twist-free & readable even around tight finger helices.
  buildRibbonMesh(head, maxU) {
    const halfH = RIBBON_HEIGHT_M * 0.5;
    const verts = this.ribbonVerts;

    let prevTang = unit(sub(this.nodes[1], this.nodes[0]));
    const toEye0 = unit(sub(head, this.nodes[0]));
    let rawSide = cross(toEye0, prevTang);
    if (len(rawSide) < 0.12) rawSide = cross([0, 0, 1], prevTang);
    rawSide = unit(rawSide);
    if (rawSide[1] < 0) rawSide = mul(rawSide, -1);

    // Keep ribbon text upright (+Y) with smooth temporal filtering so it never flips upside down
    if (!this._seedSide) {
      this._seedSide = rawSide.slice();
    } else {
      if (this._seedSide[1] < 0) this._seedSide = mul(this._seedSide, -1);
      this._seedSide = unit(lerp3(this._seedSide, rawSide, 0.18));
      if (this._seedSide[1] < 0) this._seedSide = mul(this._seedSide, -1);
    }
    let side = this._seedSide.slice();

    for (let i = 0; i < NODE_COUNT; i++) {
      const p = this.nodes[i];
      const pPrev = this.nodes[Math.max(0, i - 1)];
      const pNext = this.nodes[Math.min(NODE_COUNT - 1, i + 1)];
      const tang = unit(sub(pNext, pPrev));

      if (i > 0) {
        const proj = sub(side, mul(tang, dot(side, tang)));
        if (len(proj) > 1e-4) {
          side = unit(proj);
        }
        // Keep text gently upright relative to +Y so sentence remains readable while coiling
        const worldUpProj = sub([0, 1, 0], mul(tang, tang[1]));
        if (len(worldUpProj) > 0.2) {
          const desiredUp = unit(worldUpProj);
          if (dot(side, desiredUp) < 0) side = mul(side, -1);
          side = unit(lerp3(side, desiredUp, 0.24));
        }
      }

      const normal = unit(cross(tang, side));
      this.sides[i] = side;
      this.normals[i] = normal;

      const t = i / (NODE_COUNT - 1);
      const u = t * maxU;
      const sx = side[0] * halfH;
      const sy = side[1] * halfH;
      const sz = side[2] * halfH;

      // Subtle taper only at very tips when swimming; crisp masking-tape rectangular width when pulling
      const edgeFade = this.phase === PHASE.SWIMMING ? smooth(Math.min(t, 1 - t) * 14) * 0.2 + 0.8 : 1.0;
      const tension = this.phase === PHASE.PULLING ? this.pullRatio : 1.0;

      // Top vertex (v = 0 in canvas top-down space)
      let o = i * 2 * RIBBON_VERT_STRIDE;
      verts[o] = p[0] + sx;
      verts[o + 1] = p[1] + sy;
      verts[o + 2] = p[2] + sz;
      verts[o + 3] = normal[0];
      verts[o + 4] = normal[1];
      verts[o + 5] = normal[2];
      verts[o + 6] = u;
      verts[o + 7] = 0.0;
      verts[o + 8] = edgeFade;
      verts[o + 9] = tension;

      // Bottom vertex (v = 1)
      o += RIBBON_VERT_STRIDE;
      verts[o] = p[0] - sx;
      verts[o + 1] = p[1] - sy;
      verts[o + 2] = p[2] - sz;
      verts[o + 3] = normal[0];
      verts[o + 4] = normal[1];
      verts[o + 5] = normal[2];
      verts[o + 6] = u;
      verts[o + 7] = 1.0;
      verts[o + 8] = edgeFade;
      verts[o + 9] = tension;

      prevTang = tang;
    }
  }

  stepGlints(dt) {
    let count = 0;
    const out = this.glintData;
    const drag = Math.exp(-2.4 * dt);
    for (let i = 0; i < MAX_GLINTS; i++) {
      const g = this.glintPool[i];
      if (!g.alive) continue;
      g.age += dt;
      if (g.age >= g.life) {
        g.alive = false;
        continue;
      }
      g.vx *= drag;
      g.vy = g.vy * drag + 0.015 * dt;
      g.vz *= drag;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;

      const lifeT = g.age / g.life;
      const alpha = Math.sin(lifeT * Math.PI) * (1 - 0.35 * lifeT);
      const o = count++ * 7;
      out[o] = g.x;
      out[o + 1] = g.y;
      out[o + 2] = g.z;
      out[o + 3] = g.size * (0.7 + 0.55 * Math.sin(lifeT * Math.PI));
      out[o + 4] = alpha;
      out[o + 5] = g.seed;
      out[o + 6] = g.hue;
    }
    this.glintCount = count;
  }

  measureSpineLength() {
    let total = 0;
    for (let i = 1; i < NODE_COUNT; i++) {
      total += dist(this.nodes[i - 1], this.nodes[i]);
    }
    return total;
  }
}
