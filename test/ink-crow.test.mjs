import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSeal,TAU,unit,cross,onSeal,palmAtSeal,classifyHand,dist,add,mul} from '../public/ink-crow/gesture.js';
import {Duel,CHARGE_SECONDS} from '../public/ink-crow/duel.js';
import {springStep,spiral,BRUSH_DIAMETER} from '../public/ink-crow/ink.js';
import {identity} from '../public/ink-crow/render.js';
import {StageSpace,HandReader,Immersion} from '../public/ink-crow/xr.js';
import {Rehearsal} from '../public/ink-crow/rehearsal.js';

const dt=1/72;
const n=unit([.38,.23,1]),u=unit(cross([0,1,0],n));
const plane={c:[-.07,-.02,-.52],n,u,v:cross(n,u),r:.196};
function circle(reverse=false,turn=1){
  return Array.from({length:109},(_,i)=>{
    const a=(reverse?-1:1)*turn*TAU*i/108,r=plane.r*(1+.087*Math.sin(a*3));
    return onSeal(plane,r*Math.cos(a)*1.14,r*Math.sin(a)*.93,.012*Math.sin(3*a+.7));
  });
}
function skeleton(base,side,gesture){
  const mirror=side==='left'?-1:1;
  const offset=(x,y,z=0)=>add(base,[x*mirror,y,z]);
  const j={wrist:offset(0,0),'thumb-tip':offset(-.061,.043,.016)};
  const fingers=['index','middle','ring','pinky'];
  for(let i=0;i<4;i++){
    const x=(i-1.5)*.020,y=.080-.002*i;
    j[fingers[i]+'-finger-phalanx-proximal']=offset(x,y);
    const extended=gesture==='open'||gesture==='point'&&i===0;
    j[fingers[i]+'-finger-tip']=extended?offset(x*1.2,y+.066):offset(x*.85,.062,-.02);
  }
  if(gesture==='pinch')j['thumb-tip']=add(j['index-finger-tip'],[.006,0,0]);
  return j;
}
function draw(g,points=circle(),side='right'){
  for(const tip of points)g.tick(dt,[{side,draw:true,open:false,tip,palm:tip,normal:[0,0,-1]}]);
}
function palm(g){return {side:'left',draw:false,open:true,normal:mul(g.seal.n,-1),palm:onSeal(g.seal,0,0,.055)};}
function tickN(g,count,h=[]){for(let i=0;i<count;i++)g.tick(dt,h);}
test('both windings of a tilted, irregular, slightly open ellipse keep the metre-space plane',()=>{
  for(const reverse of [false,true]){
    const s=fitSeal(circle(reverse,.94));assert.ok(s);assert.ok(dist(s.c,plane.c)<.035);
    assert.ok(dist(s.n,plane.n)<.06);assert.ok(Math.abs(s.r-.205)<.027);
  }
  assert.equal(BRUSH_DIAMETER,.12);
});
test('reject lines, partial arcs, backtracking, a figure eight and hand-tracking depth jumps',()=>{
  const base=circle();const line=base.map((_,i)=>[i*.002,0,-.5]);
  const eight=base.map((_,i)=>[.17*Math.sin(i*TAU/108),.15*Math.sin(2*i*TAU/108),-.5]);
  assert.equal(fitSeal(line),null);assert.equal(fitSeal(circle(false,.64)),null);
  assert.equal(fitSeal([...base.slice(0,65),...base.slice(0,64).reverse()]),null);assert.equal(fitSeal(eight),null);
  assert.equal(fitSeal(base.map((p,i)=>[p[0],p[1],p[2]+.16*Math.sin(i*1.7)])),null);
});
test('left and right hand anatomy discriminates point, pinch, palm, fist and wrong-facing palm',()=>{
  for(const side of ['left','right']){
    const j=skeleton([0,0,0],side,'open'),h=classifyHand(j,side);
    assert.ok(h.open&&!h.draw&&h.normal[2]<-.97);
    assert.ok(classifyHand(skeleton([0,0,0],side,'point'),side).draw);
    assert.ok(classifyHand(skeleton([0,0,0],side,'pinch'),side).pinch);
    assert.equal(classifyHand(skeleton([0,0,0],side,'fist'),side).draw,false);
  }
  const h={open:true,normal:mul(n,-1),palm:onSeal(plane,0,0,.05)};
  assert.ok(palmAtSeal(h,plane));assert.ok(!palmAtSeal({...h,normal:n},plane));
  assert.ok(!palmAtSeal({...h,palm:onSeal(plane,.18,0,0)},plane));
  assert.ok(!palmAtSeal({...h,palm:onSeal(plane,0,0,.28)},plane));
});
test('acquisition locks a hand, retains the authored stroke and recovers after tracking loss',()=>{
  const g=new Duel(),ps=circle();draw(g,ps.slice(0,38),'left');const path=g.brush.points.slice(),start=g.brush.points[0];
  draw(g,ps.slice(38,45),'right');assert.deepEqual(g.brush.points,path);
  tickN(g,30);assert.equal(g.phase,'ready');draw(g,ps,'right');assert.equal(g.phase,'seal');
  assert.deepEqual(g.brush.points[0],start);assert.ok(g.brush.marks.count>500);
});
test('an interrupted charge drains, holds require dwell, one cast produces one hit and the next cast rearms',()=>{
  const g=new Duel();draw(g);const h=palm(g);
  tickN(g,32,[h]);const partial=g.charge;assert.ok(partial>.2&&partial<.5);
  tickN(g,12);assert.ok(g.charge<partial);tickN(g,60);assert.equal(g.charge,0);
  tickN(g,Math.floor(CHARGE_SECONDS/dt)-1,[h]);assert.notEqual(g.phase,'release');
  tickN(g,4,[h]);assert.equal(g.phase,'release');tickN(g,310);
  assert.equal(g.hitSerial,1);assert.equal(g.enemyHP,2);assert.equal(g.phase,'ready');
  draw(g);assert.equal(g.phase,'seal');
});
test('counterattack can hit or miss a moving head, and a defeated player can replay',()=>{
  for(const dodge of [false,true]){
    const g=new Duel();g.hasCast=true;g.nextShot=0;g.selfHP=1;
    tickN(g,89);assert.ok(g.shot.to);
    for(let i=0;i<115;i++)g.tick(dt,[],dodge?[.4,0,0]:[0,0,0]);
    assert.equal(g.selfHP,dodge?1:0);
    if(!dodge){assert.equal(g.phase,'lose');tickN(g,230);assert.equal(g.selfHP,3);assert.equal(g.phase,'ready');}
  }
});
test('ported spiral converges and the capped home spring settles at different frame rates',()=>{
  const to=spiral([0,0,0],.26,.02,-.1,1,1,.9,.25);assert.ok(Math.hypot(...to)<1e-6);
  for(const fps of [30,72,90]){
    const p=[0,0,0],v=[0,0,0],home=[.42,-.02,.11];
    for(let i=0;i<fps*3;i++){springStep(p,v,home,265,12,22,4,1/fps);assert.ok(Math.hypot(...v)<=4.000001);}
    assert.ok(dist(home,p)<.00001);
  }
});
test('three rehearsal casts win through the gameplay inputs and every effect stays in its pool',()=>{
  const g=new Duel(),d=new Rehearsal();let peak=0;
  for(let f=0;f<2100&&g.phase!=='win';f++){
    g.tick(dt,d.hands(g,dt));
    if(f%12!==0)continue;
    g.paint();peak=Math.max(peak,g.flow.count);
    for(const item of g.groups)assert.ok(item.batch.count<item.batch.limit);
  }
  assert.equal(g.phase,'win');assert.equal(g.hitSerial,3);assert.ok(peak>=g.bird.length);
});
test('batched poses and partial getJointPose reads both transform hand joints from an offset, yawed XR room',()=>{
  const stage=new StageSpace(),m=identity(),a=.54; m[0]=m[10]=Math.cos(a);m[2]=-Math.sin(a);m[8]=Math.sin(a);
  m[12]=1;m[13]=1.5;m[14]=-.3;stage.anchor(m);
  const pose=skeleton([.13,-.18,-.56],'left','open');const hand=new Map(Object.keys(pose).map(k=>[k,k]));
  const src={hand,handedness:'left'},world=name=>{const [x,y,z]=pose[name];return {x:m[12]+m[0]*x+m[8]*z,y:m[13]+y,z:m[14]+m[2]*x+m[10]*z};};
  for(const batched of [true,false]){
    const frame={fillPoses(spaces,ref,buf){if(!batched)return false;spaces.forEach((n,i)=>{const p=world(n);buf.set([p.x,p.y,p.z],i*16+12);});return true;},
      getJointPose(n){return {transform:{position:world(n)}};}};
    const [h]=new HandReader().read(frame,{},stage,[src]);
    assert.ok(h.open);assert.ok(dist(h.tip,pose['index-finger-tip'])<1e-6);
  }
  assert.equal(new HandReader().read({getJointPose:()=>null},{},stage,[src]).length,0);
});
test('immersive frame updates the game once, samples both eye views, and renders alpha passthrough',()=>{
  const calls=[],matrix=identity(),views=[-.03,.03].map(x=>{const inv=identity();inv[12]=x;return{transform:{inverse:{matrix:inv}},projectionMatrix:matrix};});
  const painter={gl:{FRAMEBUFFER:1,COLOR_BUFFER_BIT:2,bindFramebuffer(){},clearColor(){},clear(){},viewport(){}},label(){},
    eye(view,projection,groups,time,pass){calls.push([view[12],pass]);}};
  const g=new Duel(),xr=new Immersion(painter,g,()=>{},()=>false,()=>{});
  xr.session={requestAnimationFrame(){},inputSources:[],environmentBlendMode:'alpha-blend'};xr.space={};
  xr.layer={getViewport:()=>({x:0,y:0,width:800,height:800})};xr.reset();
  xr.draw(100,{getViewerPose:()=>({transform:{matrix},views})});
  assert.equal(g.frame,1);assert.equal(calls.length,2);assert.ok(calls[0][0]<0&&calls[1][0]>0);
  assert.ok(calls.every(x=>x[1]));
});
test('messy potato loop snaps to a calligraphic circle, writes 鳥 stroke-by-stroke, and launches a 9-bird ink flock',()=>{
  const g=new Duel(),messy=[];
  for(let i=0;i<72;i++){
    const a=TAU*.86*i/71, rx=.24+.045*Math.sin(a*3)+.028*Math.cos(a*5), ry=.115+.025*Math.cos(a*2);
    messy.push(onSeal(plane,Math.cos(a)*rx,Math.sin(a)*ry,.015*Math.sin(a*2)));
  }
  draw(g,messy,'right');
  assert.equal(g.phase,'seal');
  assert.ok(g.brush.glyphQueue.length>100);
  const initialCursor=g.brush.glyphCursor;
  assert.ok(initialCursor>0&&initialCursor<g.brush.glyphQueue.length);
  const h=palm(g);
  tickN(g,40,[h]);g.paint();
  assert.ok(g.brush.glyphCursor>initialCursor);
  const flockIds=new Set(g.bird.map(b=>b.flockId));
  assert.equal(flockIds.size,9);
});
test('no middle guide popup in ready phase, natural hand mask volume, and summoned birds face enemy from frame 0',()=>{
  const g=new Duel();
  const handPose=classifyHand(skeleton([0,-.08,-.52],'right','open'),'right');
  g.tick(dt,[handPose]);
  g.paint();
  assert.equal(g.decor.count,0);
  assert.ok(g.handsCloud.count>120&&g.handsCloud.count<g.handsCloud.limit);
  draw(g,circle(),'right');
  const h=palm(g);
  while(g.phase!=='release')g.tick(dt,[h]);
  const f0=g.flight(0.01);
  const toEnemy=unit([g.enemy[0]-f0.root[0],0,g.enemy[2]-f0.root[2]]);
  const heading=[Math.cos(f0.yaw),0,Math.sin(f0.yaw)];
  assert.ok(heading[0]*toEnemy[0]+heading[2]*toEnemy[2]>.99);
  for(let k=1;k<9;k++){
    const fk=g.flockFlight(0.01,f0)[k];
    const dirK=unit([g.enemy[0]-fk.root[0],0,g.enemy[2]-fk.root[2]]);
    const headK=[Math.cos(fk.yaw),0,Math.sin(fk.yaw)];
    assert.ok(headK[0]*dirK[0]+headK[2]*dirK[2]>.99);
  }
});


