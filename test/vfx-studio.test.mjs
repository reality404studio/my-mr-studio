import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  KERNEL_IDS,
  QUEST_BUDGET,
  SPLAT_FEEL_PRESETS,
  applyQuestBudget,
  compileSplatFeel,
  computeRecipeDiff,
  exportUnitySplatTuning,
  getByPath,
  normalizeRecipe,
  setByPath,
} from '../public/vfx-studio/schema.js';
import { SHOWCASE_PRESETS, compilePrompt, getPresetById } from '../public/vfx-studio/compiler.js';
import { VfxEngine, curlNoise3, rankineTangential } from '../public/vfx-studio/sim.js';
import { ActorRig } from '../public/vfx-studio/actors.js';
import { buildMaskPackPixels, generateReactionDiffusionField } from '../public/vfx-studio/masks.js';
import { VIEW_PRESETS, evaluateViewSafety, ortho } from '../public/vfx-studio/stage.js';
import { createVfxStore, extractJsonObject } from '../server/vfx-store.mjs';

test('SplatFeel 1:1 port matches meta-mr-picker/ritual SplatFeelMap formulas', () => {
  const fur = compileSplatFeel(SPLAT_FEEL_PRESETS.Fur);
  assert.ok(Math.abs(fur.sim.homeStiffness - 242) < 1e-4);
  assert.ok(Math.abs(fur.sim.homeDamping - 4.4) < 1e-4);
  assert.ok(Math.abs(fur.sim.clusterViscosity - 35) < 1e-4);
  assert.ok(Math.abs(fur.look.grain - 0.45) < 1e-4);
  assert.equal(fur.sim.comb, 1);

  const slime = compileSplatFeel(SPLAT_FEEL_PRESETS.Slime);
  assert.equal(slime.sim.field, 1);
  assert.ok(slime.sim.stickFraction > 0.45);
  assert.ok(slime.sim.plastic > 7.9);
  assert.equal(slime.look.detach, 0.5);

  const starch = compileSplatFeel(SPLAT_FEEL_PRESETS.Starch);
  assert.equal(starch.sim.crack, 1);
  assert.equal(starch.sim.thicken, 1);
});

test('Quest 3S budget governor clamps oversized splat count and overdraw area', () => {
  const bloated = normalizeRecipe({
    name: 'Over Budget Test',
    layers: [
      { id: 'a', type: 'emitter', count: 2200, sizeStart: 0.42, sizeEnd: 0.42, stretch: 3 },
      { id: 'b', type: 'emitter', count: 2200, sizeStart: 0.42, sizeEnd: 0.42, stretch: 3 },
      { id: 'c', type: 'emitter', count: 2200, sizeStart: 0.42, sizeEnd: 0.42, stretch: 3 },
    ],
  });
  const { recipe, budgetReport } = applyQuestBudget(bloated, QUEST_BUDGET);
  assert.equal(budgetReport.clamped, true);
  assert.equal(budgetReport.questGrade, 'CLAMPED');
  assert.ok(budgetReport.totalSplats <= QUEST_BUDGET.maxSplats);
  assert.ok(budgetReport.estOverdraw <= QUEST_BUDGET.maxOverdrawArea + 0.01);
  for (const l of recipe.layers) {
    assert.ok(l.count >= 16);
    assert.ok(l.sizeStart > 0 && l.sizeStart < 0.42);
  }
});

test('natural-language compiler produces multi-layer recipes with valid slider paths (Korean & English)', () => {
  const prompts = [
    '푸른 번개가 분기하며 찢어지는 검기 참격과 튀는 스파크',
    '황금 차원 균열 포털이 소용돌이치며 열리는 폭발',
    '끈적한 초록 독성 슬라임 화염과 어두운 연기',
    'sakura petals swirling gently with shimmering moonlight',
  ];
  for (const p of prompts) {
    const recipe = compilePrompt(p);
    assert.ok(recipe.layers.length >= 3, `Expected >= 3 layers for "${p}", got ${recipe.layers.length}`);
    assert.ok(recipe.controls.length >= 4, `Expected >= 4 sliders for "${p}"`);
    for (const c of recipe.controls) {
      const val = getByPath(recipe, c.path);
      assert.equal(typeof val, 'number', `Slider path ${c.path} must resolve to a number`);
    }
    const { budgetReport } = applyQuestBudget(recipe);
    assert.ok(budgetReport.totalSplats <= QUEST_BUDGET.maxSplats);
  }
});

test('3D curlNoise3 produces finite divergence-free swirl vectors', () => {
  const eps = 1e-4;
  const x = 0.37, y = -0.21, z = 0.48, t = 1.7, freq = 2.2;
  const xp = curlNoise3([0, 0, 0], x + eps, y, z, t, freq);
  const xm = curlNoise3([0, 0, 0], x - eps, y, z, t, freq);
  const yp = curlNoise3([0, 0, 0], x, y + eps, z, t, freq);
  const ym = curlNoise3([0, 0, 0], x, y - eps, z, t, freq);
  const zp = curlNoise3([0, 0, 0], x, y, z + eps, t, freq);
  const zm = curlNoise3([0, 0, 0], x, y, z - eps, t, freq);
  const div = (xp[0] - xm[0]) / (2 * eps) + (yp[1] - ym[1]) / (2 * eps) + (zp[2] - zm[2]) / (2 * eps);
  assert.ok(Number.isFinite(div));
  assert.ok(Math.abs(div) < 1e-3, `curl noise divergence should be ~0, got ${div}`);
});

test('VfxEngine simulates all showcase presets, hand colliders, and sub-emitters within Quest budget', () => {
  for (const preset of SHOWCASE_PRESETS) {
    const engine = new VfxEngine(getPresetById(preset.id));
    for (let i = 0; i < 20; i++) {
      engine.tick(1 / 60, [
        { side: 'right', palm: [Math.sin(i * 0.2) * 0.2, 0.0, 0.0], tip: [0.1, 0.05, 0.0] },
      ]);
    }
    assert.ok(engine.metrics.splatCount > 40, `${preset.id} should emit active splats`);
    assert.ok(engine.metrics.splatCount <= QUEST_BUDGET.maxSplats + 600);
    assert.ok(engine.alphaBatch.count + engine.addBatch.count === engine.metrics.splatCount);
    assert.ok(Number.isFinite(engine.floorGlowIntensity));
  }
});

test('Unity SplatTuning export & recipe diff capture user slider edits cleanly', () => {
  const base = getPresetById('dokkaebi-flame');
  const edited = structuredClone(base);
  setByPath(edited, 'layers.1.curlAmp', 2.85);
  setByPath(edited, 'feel.viscosity', 0.72);
  const diffs = computeRecipeDiff(base, edited);
  assert.equal(diffs.length, 2);
  assert.ok(diffs.some((d) => d.path === 'layers.1.curlAmp' && d.to === 2.85));
  assert.ok(diffs.some((d) => d.path === 'feel.viscosity' && d.to === 0.72));

  const unity = exportUnitySplatTuning(edited);
  assert.equal(unity._format, 'meta-mr-picker/SplatTuning+VfxRecipe/1');
  assert.equal(unity.feelViscosity, 0.72);
  assert.ok(unity.vfxComposer.layers.length === edited.layers.length);
});

test('vfx-store persists dataset JSON + JSONL and extracts fenced LLM JSON', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vfx-store-'));
  try {
    const store = createVfxStore(tmpRoot);
    const recipe = getPresetById('azure-lightning-slash');
    const saved = store.save({
      name: 'Azure Slash Test',
      prompt: '푸른 번개 참격',
      source: 'compiler',
      rating: 5,
      tags: ['lightning', 'quest-72fps'],
      sliderEdits: [{ path: 'layers.1.jitter', from: 0.115, to: 0.16 }],
      initialRecipe: recipe,
      tunedRecipe: recipe,
      unityTuning: exportUnitySplatTuning(recipe),
    });

    const list = store.list();
    assert.equal(list.stats.count, 1);
    assert.equal(list.stats.avgRating, 5);
    assert.equal(list.items[0].id, saved.id);

    const jsonl = store.exportJsonl();
    const lines = jsonl.trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).prompt, '푸른 번개 참격');

    store.remove(saved.id);
    assert.equal(store.list().stats.count, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  const parsed = extractJsonObject('Here is your recipe:\n```json\n{"name":"Test","layers":[]}\n```');
  assert.deepEqual(parsed, { name: 'Test', layers: [] });
});

test('Rankine combined vortex is continuous at core radius R and avoids center singularity', () => {
  const R = 0.3;
  const S = 3.5;
  assert.equal(rankineTangential(0, R, S), 0);
  const vInside = rankineTangential(R * 0.5, R, S);
  const vCore = rankineTangential(R, R, S);
  const vOutside = rankineTangential(R * 2.0, R, S);
  assert.ok(Math.abs(vInside - S * 0.5) < 1e-6);
  assert.ok(Math.abs(vCore - S) < 1e-6);
  assert.ok(Math.abs(vOutside - S * 0.5) < 1e-6);
});

test('Fire-to-soot smoke cooling transition converts cooled flame particles into alpha smoke', () => {
  const engine = new VfxEngine(getPresetById('dokkaebi-flame'));
  for (let i = 0; i < 45; i++) engine.tick(1 / 30, []);
  assert.ok(engine.metrics.smokeConverted > 0, `Expected cooled flame particles to convert to smoke, got ${engine.metrics.smokeConverted}`);
  assert.ok(engine.alphaBatch.count > 40);
});

test('ActorRig sword-swing builds Catmull-Rom blade ribbon and projectile-hit fires OnHit events', () => {
  const rig = new ActorRig();
  rig.setMode('sword-swing');
  for (let i = 0; i < 20; i++) rig.update(1 / 40, -0.42);
  const ribbon = rig.sampleBladeRibbon(24);
  assert.equal(ribbon.length, 25);
  assert.ok(rig.lineCount > 10);

  const slashEngine = new VfxEngine(getPresetById('sword-ribbon-slash'));
  slashEngine.setActorMode('sword-swing');
  for (let i = 0; i < 30; i++) slashEngine.tick(1 / 40, []);
  assert.ok(slashEngine.metrics.splatCount > 60);

  const chainEngine = new VfxEngine(getPresetById('chain-lightning-bolt'));
  chainEngine.setActorMode('projectile-hit');
  let hitSeen = false;
  for (let i = 0; i < 90; i++) {
    chainEngine.tick(1 / 30, []);
    if (chainEngine.actor.justHit) hitSeen = true;
  }
  assert.equal(hitSeen, true, 'projectile-hit actor should emit justHit impulse event');
  assert.ok(chainEngine.metrics.splatCount > 50);
});

test('Procedural 2D mask pack generates rich non-flat RGBA channels (Frost, Aurora, Gray-Scott RD, Debris)', () => {
  const rd = generateReactionDiffusionField(32, 60);
  let rdMin = 1, rdMax = 0;
  for (let i = 0; i < rd.data.length; i++) {
    if (rd.data[i] < rdMin) rdMin = rd.data[i];
    if (rd.data[i] > rdMax) rdMax = rd.data[i];
  }
  assert.ok(rdMax - rdMin > 0.15, `Gray-Scott field should have visible pattern contrast, got ${rdMax - rdMin}`);

  const pixels = buildMaskPackPixels(64);
  assert.equal(pixels.length, 64 * 64 * 4);
  for (let ch = 0; ch < 4; ch++) {
    let lo = 255, hi = 0;
    for (let i = ch; i < pixels.length; i += 4) {
      if (pixels[i] < lo) lo = pixels[i];
      if (pixels[i] > hi) hi = pixels[i];
    }
    assert.ok(hi - lo > 80, `Mask channel ${ch} should have wide dynamic range, got ${lo}..${hi}`);
  }
  assert.equal(Object.keys(KERNEL_IDS).length, 11);
});

test('Stage multi-view orthographic projection and VR 1st-person safety warnings work properly', () => {
  assert.ok(VIEW_PRESETS['mmo-3p'] && VIEW_PRESETS['vr-1p'] && VIEW_PRESETS['2d-side']);
  const m = ortho(1.2, 1.0, 0.05, 40);
  assert.equal(m.length, 16);
  assert.ok(m.every((v) => Number.isFinite(v)));

  const warn = evaluateViewSafety(
    { metrics: { splatCount: 1000, addSplats: 900, estOverdraw: 3.1 } },
    'vr-1p',
  );
  assert.equal(warn.level, 'warn');

  const safe = evaluateViewSafety(
    { metrics: { splatCount: 800, addSplats: 400, estOverdraw: 1.2 } },
    'vr-1p',
  );
  assert.equal(safe.level, 'ok');
});

