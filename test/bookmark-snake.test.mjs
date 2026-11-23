import test from 'node:test';
import assert from 'node:assert/strict';

import {
  closestPointOnSegment,
  dist,
  mix,
} from '../public/bookmark-snake/gesture.js';
import {
  createUnitCapsuleGeometry,
  HandMaskData,
  MASK_INSTANCE_STRIDE,
  MAX_SHADER_CAPSULES,
} from '../public/bookmark-snake/hand-mask.js';
import { buildSyntheticHand } from '../public/bookmark-snake/rehearsal.js';
import {
  BookmarkSnakeScene,
  NODE_COUNT,
  PHASE,
} from '../public/bookmark-snake/snake.js';
import {
  BOOKMARK_TEXT,
  RIBBON_HEIGHT_M,
  RIBBON_LENGTH_M,
} from '../public/bookmark-snake/text-atlas.js';

test('sentence text and physical dimensions match specification (30cm x 3cm, no quotes)', () => {
  assert.equal(
    BOOKMARK_TEXT,
    '사람들이 자신의 영혼을 되찾는 또 다른 순간은 서로 사랑할 때입니다. p49.',
  );
  assert.equal(RIBBON_LENGTH_M, 0.30);
  assert.equal(RIBBON_HEIGHT_M, 0.03);
});

test('floating bookmark grabs on pinch and anchors onto real book location on release', () => {
  const scene = new BookmarkSnakeScene();
  const head = [0, 0, 0];
  scene.tick(1 / 72, [], head);
  assert.equal(scene.phase, PHASE.FLOATING);

  // Move right hand to floating bookmark and pinch
  const bm = scene.bookmarkPos.slice();
  const grabHand = buildSyntheticHand({
    side: 'right',
    wristPos: [bm[0] + 0.025, bm[1] - 0.115, bm[2] + 0.005],
    pinch: true,
  });
  // Ensure pinch point is right on the bookmark
  grabHand.pinchPos = bm.slice();
  scene.tick(1 / 72, [grabHand], head);
  assert.equal(scene.phase, PHASE.ANCHORING);

  // Drag to target book location and release pinch -> anchored
  const bookTarget = [-0.14, -0.10, -0.45];
  for (let i = 0; i < 20; i++) {
    grabHand.pinchPos = bookTarget.slice();
    scene.tick(1 / 72, [grabHand], head);
  }
  grabHand.pinch = false;
  scene.tick(1 / 72, [grabHand], head);
  assert.equal(scene.phase, PHASE.ANCHORED);
  assert.ok(dist(scene.anchorPos, bookTarget) < 0.015, 'bookmark should anchor near release point');
});

test('partial pull (<30cm) elastically rewinds back into anchored bookmark', () => {
  const scene = new BookmarkSnakeScene();
  const head = [0, 0, 0];
  const anchor = [-0.12, -0.08, -0.44];
  scene.placeBookmarkAt(anchor);

  const hand = buildSyntheticHand({ side: 'right', pinch: true });
  hand.pinchPos = anchor.slice();
  scene.tick(1 / 72, [hand], head);
  assert.equal(scene.phase, PHASE.PULLING);

  // Pull only 15cm (50% of 30cm)
  for (let i = 0; i < 30; i++) {
    hand.pinchPos = [anchor[0] + 0.15, anchor[1], anchor[2]];
    scene.tick(1 / 72, [hand], head);
  }
  assert.equal(scene.phase, PHASE.PULLING);
  assert.ok(scene.pullRatio > 0.42 && scene.pullRatio < 0.65, `unexpected pullRatio=${scene.pullRatio}`);
  assert.equal(scene.ribbonVisible, true);

  // Release pinch -> must rewind cleanly back to anchored
  hand.pinch = false;
  scene.tick(1 / 72, [hand], head);
  assert.equal(scene.phase, PHASE.REWINDING);

  for (let i = 0; i < 160; i++) {
    scene.tick(1 / 72, [hand], head);
    if (scene.phase === PHASE.ANCHORED) break;
  }
  assert.equal(scene.phase, PHASE.ANCHORED);
  assert.equal(scene.pullRatio, 0);
  assert.equal(scene.ribbonVisible, false);
});

test('full 30cm pull detaches into 40-node sea-snake that preserves length and avoids finger penetration', () => {
  const scene = new BookmarkSnakeScene();
  const head = [0, 0, 0];
  const anchor = [-0.15, -0.08, -0.44];
  scene.placeBookmarkAt(anchor);

  const pullHand = buildSyntheticHand({ side: 'right', pinch: true });
  pullHand.pinchPos = anchor.slice();
  scene.tick(1 / 72, [pullHand], head);
  assert.equal(scene.phase, PHASE.PULLING);

  // Pull smoothly out to 32cm -> detaches into swimming
  for (let i = 1; i <= 55; i++) {
    const t = i / 55;
    pullHand.pinchPos = [anchor[0] + 0.32 * t, anchor[1] + 0.01 * t, anchor[2]];
    scene.tick(1 / 72, [pullHand], head);
    if (scene.phase === PHASE.SWIMMING) break;
  }
  assert.equal(scene.phase, PHASE.SWIMMING);
  assert.equal(scene.ribbonVisible, true);

  // Present both open hands nearby and simulate 3 seconds of bilateral finger weaving
  const leftHand = buildSyntheticHand({
    side: 'left',
    wristPos: [-0.09, -0.14, -0.44],
    pinch: false,
    spread: 1.3,
    yaw: 0.3,
  });
  const rightHand = buildSyntheticHand({
    side: 'right',
    wristPos: [0.09, -0.14, -0.44],
    pinch: false,
    spread: 1.3,
    yaw: -0.3,
  });

  const visitedFingers = new Set();
  for (let step = 0; step < 240; step++) {
    scene.tick(1 / 72, [leftHand, rightHand], head);
    if (scene.targetFingerId) visitedFingers.add(scene.targetFingerId);
  }

  // Invariant 1: 30cm ribbon length stays intact (+/- 3mm)
  const spineLen = scene.measureSpineLength();
  assert.ok(
    Math.abs(spineLen - RIBBON_LENGTH_M) < 0.005,
    `expected ~0.30m spine length, got ${spineLen.toFixed(4)}m`,
  );

  // Invariant 2: Snake actively weaves across multiple fingers
  assert.ok(visitedFingers.size >= 2, `expected snake to weave across >=2 fingers, saw ${visitedFingers.size}`);

  // Invariant 3: No spine node penetrates deep inside any finger capsule
  const closest = [0, 0, 0];
  for (let i = 0; i < NODE_COUNT; i++) {
    const n = scene.nodes[i];
    assert.ok(Number.isFinite(n[0] + n[1] + n[2]), 'node coords must be finite');
    for (const cap of scene.handMask.fingerCapsules) {
      const t = closestPointOnSegment(
        closest,
        n[0], n[1], n[2],
        cap.a[0], cap.a[1], cap.a[2],
        cap.b[0], cap.b[1], cap.b[2],
      );
      const r = mix(cap.rA, cap.rB, t);
      const d = dist(n, closest);
      assert.ok(d >= r - 0.002, `node ${i} penetrated finger ${cap.finger}: d=${d.toFixed(4)} < r=${r.toFixed(4)}`);
    }
  }
});

test('hybrid hand mask packs finite bilateral capsules and valid unit capsule geometry', () => {
  const mask = new HandMaskData();
  const left = buildSyntheticHand({ side: 'left', wristPos: [-0.12, -0.12, -0.42] });
  const right = buildSyntheticHand({ side: 'right', wristPos: [0.12, -0.12, -0.42] });
  mask.build([left, right]);

  assert.ok(mask.instanceCount >= 50 && mask.instanceCount <= 96, `unexpected instanceCount=${mask.instanceCount}`);
  assert.equal(mask.shaderCount, 30, 'two hands x 5 fingers x 3 phalanges = 30 shader capsules');
  assert.ok(mask.shaderCount <= MAX_SHADER_CAPSULES);
  assert.equal(mask.fingerAxes.length, 10, 'two hands x 5 fingers = 10 weave axes');

  for (let i = 0; i < mask.instanceCount * MASK_INSTANCE_STRIDE; i++) {
    assert.ok(Number.isFinite(mask.instances[i]), `non-finite mask instance float at ${i}`);
  }

  const geo = createUnitCapsuleGeometry(10, 2);
  assert.ok(geo.indexCount > 100 && geo.vertices.length % 4 === 0);
});
