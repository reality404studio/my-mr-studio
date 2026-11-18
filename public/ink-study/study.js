import {InkBrush, InkPaper, BRUSH_STEP, PAPER_STEP} from './ink-engine.js';
import {InkTrial} from './replay.js';

const byId = id => document.getElementById(id);
const presets = {
  loaded: [.65, .80, 1], wash: [.95, .26, 1],
  dry: [.08, .93, .65], depleted: [.50, .89, .16]
};
let fill = 1, comparing = true, pending = 0, animation = 0;
const options = () => ({water: Number(byId('water').value)/100, pigment: Number(byId('pigment').value)/100, fill});
const holdDuration = () => Number(byId('hold').value);
function updateLabels() {
  byId('waterText').value = byId('water').value + '%';
  byId('pigmentText').value = byId('pigment').value + '%';
  byId('holdText').value = holdDuration().toFixed(1) + '초';
  byId('parkCaption').textContent = '68 cm/s · ' + byId('holdText').value;
}
const painters = new Map();
function paint(id, paper) {
  let painter = painters.get(id);
  if (!painter) {
    const canvas = byId(id);
    canvas.width = paper.width;
    canvas.height = paper.height;
    const ctx = canvas.getContext('2d', {alpha: false});
    painter = {ctx, image: ctx.createImageData(paper.width, paper.height)};
    painters.set(id, painter);
  }
  paper.render(painter.image.data);
  painter.ctx.putImageData(painter.image, 0, 0);
}
const ids = ['fast', 'slow', 'parked'];
function compareStrokes(animate = false) {
  clearTimeout(pending);
  cancelAnimationFrame(animation);
  if (!comparing) return;
  const settings = options();
  const trials = [new InkTrial({...settings, speed: .68}), new InkTrial({...settings, speed: .16}),
    new InkTrial({...settings, speed: .68, hold: holdDuration()})];
  const drawAll = () => trials.forEach((trial, i) => paint(ids[i], trial.paper));
  const summarize = () => {
    const masses = trials.map(t => {const m = t.paper.mass(); return m.fixed + m.mobile;});
    byId('readout').textContent = masses[0] > 0
      ? '느린 획이 종이에 남긴 안료는 빠른 획의 ' + (masses[1]/masses[0]).toFixed(2) + '배입니다.'
      : '먹 농도가 0%여서 종이에 남은 안료가 없습니다.';
  };
  if (!animate) {
    for (const trial of trials) trial.finish();
    drawAll(); summarize(); return;
  }
  drawAll();
  byId('readout').textContent = '같은 길이의 세 획을 그리고 있습니다.';
  let last = performance.now(), credit = 0, lastPaint = 0;
  function step(now) {
    credit += Math.min(.10, (now-last)/1000);
    last = now;
    while (credit >= BRUSH_STEP) {
      credit -= BRUSH_STEP;
      for (const trial of trials) if (trial.t < trial.end + .8) trial.step();
    }
    const done = trials.every(t => t.t >= t.end + .8);
    if (done || now-lastPaint >= 32) {drawAll(); lastPaint = now;}
    if (done) {summarize(); return;}
    animation = requestAnimationFrame(step);
  }
  animation = requestAnimationFrame(step);
}

const pad = byId('pad'), sheet = new InkPaper(440, 200, .90/440);
const brush = new InkBrush(sheet, options());
let pointer = null, pos = null, directFrame = 0, lastTime = 0, paperClock = 0;
function telemetry() {
  const fraction = brush.fullPigment ? brush.pigment/brush.fullPigment : 0;
  byId('telemetry').value = '속도 ' + Math.round(brush.down ? brush.speed*100 : 0) + ' cm/s · 체류 ' +
    (brush.down ? brush.dwell : 0).toFixed(1) + '초 · 남은 먹 ' + Math.round(100*fraction) + '%';
}
function tick(now) {
  directFrame = 0;
  if (comparing) return;
  if (pointer !== null && brush.down) brush.sample(pos.x, pos.y, now/1000, pos.contact);
  paperClock += Math.min(.12, Math.max(0, (now-lastTime)/1000));
  lastTime = now;
  if (paperClock >= PAPER_STEP) {
    sheet.step(paperClock);
    paperClock = 0;
    if (sheet.changed) paint('pad', sheet);
    telemetry();
  }
  if (pointer !== null || sheet.count || sheet.bounds[0] <= sheet.bounds[2] || sheet.changed) wake();
}
function wake() {if (!directFrame && !comparing) directFrame = requestAnimationFrame(tick);}
function stopPointer() {
  if (pointer === null) return;
  const id = pointer;
  pointer = null;
  brush.lift();
  if (pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  wake();
}
function point(event) {
  const rect = pad.getBoundingClientRect();
  const unit = v => Math.min(1, Math.max(0, v));
  return {x: unit((event.clientX-rect.left)/rect.width)*(sheet.width-1)*sheet.cell,
    y: unit((event.clientY-rect.top)/rect.height)*(sheet.height-1)*sheet.cell,
    contact: event.pointerType === 'pen' ? unit(event.pressure) : 1};
}
pad.addEventListener('pointerdown', e => {
  if (pointer !== null || e.button !== 0) return;
  e.preventDefault();
  pos = point(e); pointer = e.pointerId;
  const now = performance.now();
  if (!directFrame) {lastTime = now; paperClock = 0;}
  brush.begin(pos.x, pos.y, now/1000, pos.contact);
  pad.setPointerCapture(pointer); wake();
});
pad.addEventListener('pointermove', e => {
  if (e.pointerId !== pointer) return;
  pos = point(e);
  brush.sample(pos.x, pos.y, performance.now()/1000, pos.contact);
});
pad.addEventListener('pointerup', e => {
  if (e.pointerId !== pointer) return;
  const end = point(e);
  brush.sample(end.x, end.y, performance.now()/1000, pos.contact);
  stopPointer();
});
for (const event of ['pointercancel', 'lostpointercapture']) pad.addEventListener(event, e => {
  if (e.pointerId === pointer) stopPointer();
});
window.addEventListener('blur', stopPointer);
document.addEventListener('visibilitychange', () => {if (document.hidden) stopPointer();});
function reloadBrush() {
  stopPointer();
  const o = options();
  brush.reload(o.water, o.pigment, o.fill); telemetry();
}
function mode(compare) {
  if (comparing === compare) return;
  stopPointer(); comparing = compare;
  byId('compare').hidden = !compare;
  byId('draw').hidden = compare;
  byId('holdLabel').hidden = !compare;
  byId('compareBtn').setAttribute('aria-pressed', String(compare));
  byId('drawBtn').setAttribute('aria-pressed', String(!compare));
  cancelAnimationFrame(animation);
  if (compare) {compareStrokes(); return;}
  lastTime = performance.now(); paint('pad', sheet); wake();
}
byId('replay').onclick = () => compareStrokes(true);
byId('drawBtn').onclick = () => mode(false);
byId('compareBtn').onclick = () => mode(true);
byId('reload').onclick = reloadBrush;
byId('clear').onclick = () => {stopPointer(); sheet.clear(); reloadBrush(); paint('pad', sheet);};
function adjust() {
  updateLabels();
  clearTimeout(pending);
  if (comparing) pending = setTimeout(() => compareStrokes(), 110);
}
byId('recipe').onchange = e => {
  const [water, pigment, load] = presets[e.target.value];
  fill = load; byId('water').value = Math.round(100*water);
  byId('pigment').value = Math.round(100*pigment);
  reloadBrush(); adjust();
};
for (const id of ['water', 'pigment']) byId(id).oninput = () => {
  byId('recipe').value = 'custom'; reloadBrush(); adjust();
};
byId('hold').oninput = adjust;
updateLabels();
compareStrokes();
