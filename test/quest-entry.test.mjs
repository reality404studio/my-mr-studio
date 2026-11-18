import test from 'node:test';
import assert from 'node:assert/strict';
import {Immersion,HandReader,supportedModes} from '../public/ink-crow/xr.js';
import {identity} from '../public/ink-crow/render.js';

const pending=()=>new Promise(()=>{});
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,options={}){
  const events=[],messages=[],progress=[],colors=[],passes=[],session=new EventTarget();
  const space=new EventTarget(),view={projectionMatrix:identity(),transform:{inverse:{matrix:identity()}}};
  const pose={transform:{matrix:identity()},views:[view,view]};
  const gl={FRAMEBUFFER:1,COLOR_BUFFER_BIT:2,FRAMEBUFFER_COMPLETE:3,NO_ERROR:0,
    getContextAttributes:()=>({xrCompatible:false}),makeXRCompatible:options.makeCompatible??(async()=>{}),
    clearColor:(...rgba)=>colors.push(rgba),clear(){},bindFramebuffer(){},viewport(){},isContextLost:()=>false,
    checkFramebufferStatus:()=>3,getError:()=>options.glError??0};
  Object.assign(session,{enabledFeatures:[],visibilityState:'visible',inputSources:[],supportedFrameRates:[72],
    environmentBlendMode:options.blend??'opaque',requestReferenceSpace:async type=>{assert.equal(type,'local');return space;},
    updateRenderState(){},requestAnimationFrame(cb){session.cb=cb;},updateTargetFrameRate(){events.push('refresh');return pending();},
    async end(){events.push('end');session.dispatchEvent(new Event('end'));}});
  const api={isSessionSupported:async()=>true,requestSession:(mode,opts)=>{
    events.push('request');assert.deepEqual(opts,{optionalFeatures:['hand-tracking']});return options.request?.()??Promise.resolve(session);
  }};
  const oldXR=Object.getOwnPropertyDescriptor(navigator,'xr'),oldSecure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');
  const oldLayer=Object.getOwnPropertyDescriptor(globalThis,'XRWebGLLayer');
  Object.defineProperty(navigator,'xr',{value:api,configurable:true});
  Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
  Object.defineProperty(globalThis,'XRWebGLLayer',{configurable:true,value:class{
    constructor(s,g,init){assert.equal(g,gl);this.framebuffer={};this.alpha=init.alpha;}
    getViewport(){return {x:0,y:0,width:1000,height:900};}
  }});
  t.after(()=>{for(const [obj,key,desc] of [[navigator,'xr',oldXR],[globalThis,'isSecureContext',oldSecure],[globalThis,'XRWebGLLayer',oldLayer]]){
    if(desc)Object.defineProperty(obj,key,desc);else delete obj[key];
  }});
  const painter={gl,label(){},eye(_v,_p,_g,_t,pass){events.push('eye');passes.push(pass);}};
  const game={reset(){},interruptTracking(){},tick(){},info:()=>['먹진',''],phase:'ready'};
  const xr=new Immersion(painter,game,()=>{},()=>false,m=>messages.push(m),s=>progress.push(s));
  t.after(()=>xr.stop());
  const draw=(withPose=true)=>session.cb(10,{session,getViewerPose:()=>withPose?pose:null});
  return {events,messages,progress,colors,passes,xr,session,draw,painter,gl};
}
test('button starts a VR request in the click turn, renders stereo without hands, then asks for 72 Hz',async t=>{
  const f=fixture(t);assert.deepEqual(await supportedModes(),['immersive-vr','immersive-ar']);
  const start=f.xr.start('immersive-vr');assert.deepEqual(f.events,['request']);
  await start;assert.equal(f.xr.layer.alpha,false);
  f.draw(false);assert.equal(f.progress.at(-1),'pose');assert.ok(f.colors.at(-1)[0]>.9);
  f.draw();assert.deepEqual(f.events,['request','eye','eye']);
  await Promise.resolve();assert.deepEqual(f.events,['request','eye','eye','refresh']);
  assert.deepEqual(f.passes,[false,false]);assert.equal(f.progress.at(-1),'ready');f.xr.stop();
  assert.deepEqual(f.messages,['']);
});
test('passthrough keeps its transparent alpha and can start with no hand input',async t=>{
  const f=fixture(t,{blend:'alpha-blend'});await f.xr.start('immersive-ar');
  assert.equal(f.xr.layer.alpha,true);f.draw();assert.deepEqual(f.colors[0],[0,0,0,0]);assert.deepEqual(f.passes,[true,true]);
});
test('denial before any first frame reports the request stage and permits a retry',async t=>{
  let deny=true;
  const f=fixture(t,{request:()=>deny?Promise.reject(new DOMException('denied','NotAllowedError')):undefined});
  await f.xr.start('immersive-vr');assert.match(f.messages[0],/XR-request \/ NotAllowedError/);assert.equal(f.xr.attempt,null);
  deny=false;await f.xr.start('immersive-vr');f.draw();assert.equal(f.xr.presented,true);
});
test('cancelling a pending permission request cleans up a session granted later',async t=>{
  let grant;const f=fixture(t,{request:()=>new Promise(resolve=>{grant=resolve;})});
  const start=f.xr.start('immersive-vr');f.xr.stop();grant(f.session);await start;
  assert.deepEqual(f.events,['request','end']);assert.deepEqual(f.messages,['']);assert.equal(f.xr.session,null);
});
test('a stalled GPU setup or missing first headset pose returns to the page with its stage code',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const stage of ['graphics','pose']){
    await t.test(stage,async sub=>{
      const f=fixture(sub,stage==='graphics'?{makeCompatible:pending}:{});
      f.xr.start('immersive-vr');await nextTurn();
      if(stage==='pose')f.draw(false);
      t.mock.timers.tick(10001);await nextTurn();
      assert.equal(f.xr.session,null);assert.match(f.messages[0],new RegExp('XR-'+stage+' / Timeout'));
    });
  }
});
test('frame exceptions and first-frame GL errors end once instead of looping in black',async t=>{
  for(const kind of ['exception','gl-error'])await t.test(kind,async sub=>{
    const f=fixture(sub,kind==='gl-error'?{glError:0x0506}:{});
    if(kind==='exception')f.painter.eye=()=>{throw Error('render');};
    await f.xr.start('immersive-vr');f.draw();await nextTurn();
    assert.equal(f.xr.session,null);assert.equal(f.messages.length,1);assert.match(f.messages[0],/XR-draw/);
  });
});
test('partial hand tracking cannot take down rendering when batch and individual joint reads throw',()=>{
  const ref={},stage={local(){}},reader=new HandReader();
  const source={hand:new Map([['wrist',{}]]),handedness:'left'};
  const frame={fillPoses(){throw Error('unavailable');},getJointPose(){throw Error('joint unavailable');}};
  assert.deepEqual(reader.read(frame,ref,stage,[source]),[]);
});
test('controller input sources provide a drawing and charging fallback when bare-hand tracking is inactive',()=>{
  const stage={matrix:identity(),local:(x,y,z)=>[x,y,z]},reader=new HandReader();
  const space={},m=identity();
  const frame={getPose:()=>({transform:{position:{x:.1,y:-.05,z:-.55},matrix:m}})};
  const idle=reader.read(frame,{},stage,[{gripSpace:space,handedness:'right',gamepad:{buttons:[{pressed:false,value:0}]}}]);
  assert.equal(idle.length,1);assert.equal(idle[0].draw,false);assert.equal(idle[0].open,true);
  const drawing=reader.read(frame,{},stage,[{gripSpace:space,handedness:'right',gamepad:{buttons:[{pressed:true,value:1}]}}]);
  assert.equal(drawing[0].draw,true);assert.equal(drawing[0].open,false);
});

