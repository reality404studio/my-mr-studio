import test from 'node:test';
import assert from 'node:assert/strict';
import {Duel} from '../public/ink-crow/duel.js';
import {STRIDE} from '../public/ink-crow/ink.js';

const dt=1/72;
const hand=(p,draw=true)=>[{side:'right',draw,open:false,tip:p,palm:p}];
function swipe(speed,frames=24){
  const g=new Duel();let p=[-.32,.02,-.78];
  g.tick(dt,hand(p));
  for(let i=0;i<frames;i++){p=[p[0]+speed*dt,p[1],p[2]];g.tick(dt,hand(p));}
  return {g,p};
}
test('the live world brush pools at rest and slow movement sheds no drops',()=>{
  const {g,p}=swipe(.15);
  const a=g.brush.paper.mass(),rev=g.brush.revision;
  for(let i=0;i<72;i++)g.tick(dt,hand(p));
  const b=g.brush.paper.mass();
  assert.ok(b.fixed+b.mobile>a.fixed+a.mobile+.001);
  assert.ok(g.brush.revision>rev && g.brush.marks.count>100);
  assert.equal(g.spray.spawned,0);
  const data=g.brush.marks.data;
  for(let j=0;j<g.brush.marks.count*STRIDE;j+=STRIDE)assert.equal(data[j+10],8);
});
test('a fast lift sheds forward-moving ink with both loads deducted from the brush',()=>{
  const {g,p}=swipe(1.6,18);
  assert.ok(g.spray.spawned>0);
  const before=g.spray.spawned;
  g.tick(dt,hand(p,false));
  assert.ok(g.spray.spawned>before);
  const wet=g.brush.paper.mass(), b=g.brush.brush;
  const ink=g.spray.drops.reduce((s,d)=>s+(d.phase?d.ink:0),0);
  const water=g.spray.drops.reduce((s,d)=>s+(d.phase?d.water:0),0);
  assert.ok(Math.abs(wet.mobile+wet.fixed+b.pigment+ink-b.fullPigment)<1e-5);
  assert.ok(Math.abs(wet.water+wet.lostWater+b.water+water-b.fullWater)<1e-5);
  assert.ok(g.spray.drops.some(d=>d.phase===1 && d.vx>.7));
  let impact=false;
  for(let i=0;i<90;i++){g.tick(dt,[]);impact ||= g.spray.drops.some(d=>d.phase===2);}
  assert.ok(impact);assert.ok(g.spray.marks.count>0);
  for(let i=0;i<145;i++)g.tick(dt,[]);
  assert.equal(g.spray.marks.count,0);
});
test('braking retains the incoming tangent; tracking loss and hover have no lift burst',()=>{
  const {g,p}=swipe(1.5,19);
  const before=g.spray.spawned;
  g.tick(dt,hand([p[0]-.012,p[1]+.010,p[2]]));
  assert.ok(g.spray.spawned>before);
  const priorLoss=g.spray.spawned;g.tick(dt,[]);
  assert.equal(g.spray.spawned,priorLoss);
  const pigment=g.brush.brush.pigment;
  for(let i=0;i<6;i++)g.tick(dt,[]);
  assert.equal(g.brush.brush.pigment,pigment);
  g.tick(dt,hand([p[0]+.30,p[1],p[2]]));
  assert.equal(g.spray.spawned,priorLoss);assert.equal(g.phase,'ready');
});
test('tilted strokes keep their depth in both views and the display buffers are bounded',()=>{
  const g=new Duel();
  for(let i=0;i<=45;i++)g.tick(dt,hand([-.19+i*.008,0,-.81+i*.004]));
  let lo=Infinity,hi=-Infinity;
  const {data,count,limit}=g.brush.marks;
  for(let i=0;i<count;i++){
    lo=Math.min(lo,data[i*STRIDE+2]);hi=Math.max(hi,data[i*STRIDE+2]);
  }
  assert.ok(hi-lo>.12 && count<limit);
  const before=g.spray.spawned;
  g.tick(.5,hand([1,0,-.1]));
  assert.equal(g.spray.spawned,before);
  g.paint();assert.ok(g.groups.some(group=>group.batch===g.spray.marks));
  g.reset();assert.equal(g.spray.marks.count,0);assert.equal(g.brush.marks.count,0);
});
