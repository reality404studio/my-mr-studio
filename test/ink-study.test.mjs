import test from 'node:test';
import assert from 'node:assert/strict';
import {InkBrush, InkPaper, writeInkSplats} from '../public/ink-study/ink-engine.js';
import {InkTrial} from '../public/ink-study/replay.js';
import {SplatBatch, STRIDE} from '../public/ink-crow/ink.js';

const totalInk = m => m.mobile + m.fixed;
function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, [actual, expected].join(' ≠ '));
}
function trace(hz, speed, contact = 1) {
  const paper = new InkPaper(160, 72, .005);
  const brush = new InkBrush(paper);
  brush.begin(.15, .17, 0, contact);
  let substrate = 0;
  for (let i = 1; i <= hz; i++) {
    const time = i/hz;
    brush.sample(.15 + speed*time, .17, time, contact);
    while ((substrate+1)/30 <= time) {substrate++; paper.step();}
  }
  brush.lift();
  return {paper, brush, mass: paper.mass()};
}
test('a resting brush supplies pigment over time, including repeated input without motion', () => {
  const {brush, mass} = trace(72, 0);
  assert.ok(totalInk(mass) > .004);
  close(brush.pigment + totalInk(mass), brush.fullPigment);
  close(brush.water + mass.water + mass.lostWater, brush.fullWater);
  close(totalInk(trace(72, .2, 0).mass), 0);
});
test('input cadence preserves stroke dose and tracking gaps cannot bridge two contacts', () => {
  const doses = [30, 72, 90].map(rate => totalInk(trace(rate, .30).mass));
  assert.ok(Math.max(...doses)/Math.min(...doses) < 1.025);
  for (const [x, t] of [[.23, .35], [.76, .12]]) {
    const sheet = new InkPaper(150, 80, .005), brush = new InkBrush(sheet);
    brush.begin(.12, .18, 0); brush.sample(.15, .18, .1); brush.sample(x, .18, t);
    assert.equal(brush.down, false);
    const before = totalInk(sheet.mass());
    brush.sample(.79, .18, t+.04);
    close(totalInk(sheet.mass()), before);
  }
});
test('overflowing the particle queue and clipping to a paper edge conserve pigment and water', () => {
  const sheet = new InkPaper(48, 40, .004);
  for (let i = 0; i < 800; i++) sheet.parcel(0, .062, 1, 0, .014, .007, .000031, .000009, .80, .75);
  sheet.step(.4); const mass = sheet.mass();
  close(mass.water+mass.lostWater, .000031*800);
  close(totalInk(mass), .000009*800);
});
test('after lift unbound pigment becomes fixed and total ink stays on the page', () => {
  const {paper, mass} = trace(72, .28);
  for (let i = 0; i < 180; i++) paper.step();
  const settled = paper.mass();
  assert.ok(settled.fixed > mass.fixed && settled.mobile < mass.mobile);
  close(totalInk(mass), totalInk(settled)); close(settled.water+settled.lostWater, mass.water+mass.lostWater);
});
test('slowing down increases the integrated dose; a pause leaves a local pool on the same path', () => {
  const trial = options => new InkTrial(options).finish().paper;
  const fast = trial({speed: .68}), slow = trial({speed: .16}), pause = trial({speed: .68, hold: 1.2});
  const ratio = totalInk(slow.mass())/totalInk(fast.mass()); assert.ok(ratio > 1.8 && ratio < 2);
  function centralDose(sheet) {
    let total = 0;
    for (let y = 0; y < sheet.height; y++) for (let x = 0; x < sheet.width; x++)
      if (Math.abs(x*sheet.cell-.45)<.023) {
        const i = y*sheet.width+x; total += sheet.mobile[i]+sheet.fixed[i];
      }
    return total;
  }
  assert.ok(centralDose(pause) > 2.8*centralDose(fast));
});
test('low water leaves more nearly bare channels through the body of a loaded stroke', () => {
  function openArea(water) {
    const {paper} = new InkTrial({water, pigment:.9}).finish();
    let open = 0;
    for (let y = 0; y < paper.height; y++) for (let x = 0; x < paper.width; x++) {
      if (x*paper.cell<.27 || x*paper.cell>.59 || Math.abs(y*paper.cell-.144)>.027) continue;
      const i = y*paper.width+x;
      if (paper.fixed[i]+paper.mobile[i]<.15) open++;
    }
    return open;
  }
  assert.ok(openArea(.07) > openArea(.88)+40);
});
test('surface density fits the existing world-space SplatBatch and obeys its cap', () => {
  const {paper} = trace(72, .2), batch = new SplatBatch(80);
  const count = writeInkSplats(paper, batch, [1,2,-3], [1,0,0], [0,-1,0], .25);
  assert.ok(count > 0 && count <= 80);
  for (let i = 0; i < count; i++) {
    const at = i*STRIDE;
    assert.ok(batch.data[at] >= 1 && batch.data[at+1] <= 2);
    close(batch.data[at+2], -3);
    assert.ok(batch.data.slice(at,at+STRIDE).every(Number.isFinite));
  }
  assert.equal(writeInkSplats(paper, new SplatBatch(0), [0,0,0], [1,0,0], [0,1,0]), 0);
});
test('drawing a ring leaves the unwritten centre open after the surrounding line has settled', () => {
  const sheet = new InkPaper(160, 160, .004);
  const brush = new InkBrush(sheet);
  const cx = .32, cy = .32, radius = .18;
  brush.begin(cx+radius, cy, 0);
  for (let i = 1; i <= 216; i++) {
    const a = 2*Math.PI*i/216;
    brush.sample(cx+radius*Math.cos(a), cy+radius*Math.sin(a), i/72);
    if (i%3===0) sheet.step(3/72);
  }
  brush.lift(); sheet.step(2);
  const middle = 80*160+80, rim = 80*160+125;
  close(sheet.fixed[middle]+sheet.mobile[middle], 0);
  assert.ok(sheet.fixed[rim]+sheet.mobile[rim] > .2);
});
