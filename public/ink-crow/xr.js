import {classifyHand,unit} from './gesture.js?v=bns-phase2';
import {identity,multiply} from './render.js?v=bns-phase2';

const JOINTS=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'];
for(const f of ['index','middle','ring','pinky'])
  for(const s of ['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'])JOINTS.push(f+'-finger-'+s);

export class StageSpace {
  constructor(){this.matrix=identity();this.origin=null;}
  anchor(m){
    const length=Math.hypot(m[8],m[10]);
    const bx=length>.001?m[8]/length:0,bz=length>.001?m[10]/length:1;
    this.matrix.set([bz,0,-bx,0,0,1,0,0,bx,0,bz,0,m[12],m[13],m[14],1]);
    this.origin=[m[12],m[13],m[14]];
  }
  local(x,y,z,out=[0,0,0]){
    const m=this.matrix; x-=m[12];y-=m[13];z-=m[14];
    out[0]=x*m[0]+z*m[2];out[1]=y;out[2]=x*m[8]+z*m[10];return out;
  }
}
export class HandReader {
  constructor(){this.sources=new WeakMap();}
  read(frame,ref,stage,sources){
    const found=[];
    for(const src of sources){
      if(!src.hand){
        const space=src.gripSpace||src.targetRaySpace;
        if(!space)continue;
        let pose;
        try{pose=frame.getPose?.(space,ref);}catch{continue;}
        const p=pose?.transform?.position,m=pose?.transform?.matrix;
        if(!p||!Number.isFinite(p.x+p.y+p.z))continue;
        const tip=stage.local(p.x,p.y,p.z),sm=stage.matrix;
        const normal=m?unit([-(m[8]*sm[0]+m[10]*sm[2]),-m[9],-(m[8]*sm[8]+m[10]*sm[10])]):[0,0,-1];
        const btns=src.gamepad?.buttons,trigger=Boolean(btns?.[0]?.pressed||btns?.[0]?.value>.35);
        const side=src.handedness==='left'?'left':'right';
        found.push({side,palm:tip,normal,tip,pinch:trigger,draw:trigger,open:!trigger,joints:null});
        continue;
      }
      let cache=this.sources.get(src);
      if(!cache){
        const names=JOINTS.filter(n=>src.hand.get(n));
        cache={names,spaces:names.map(n=>src.hand.get(n)),poses:new Float32Array(names.length*16),
          coords:Object.fromEntries(names.map(n=>[n,[0,0,0]])),pinch:false};
        this.sources.set(src,cache);
      }
      const {names,spaces,poses,coords}=cache, joints={};
      if(!spaces.length)continue;
      // Some runtimes expose the batch API before every joint is available.
      let filled=false;
      try{filled=frame.fillPoses?.(spaces,ref,poses);}catch{/* Try individual visible joints. */}
      for(let i=0;i<names.length;i++){
        let x,y,z;
        if(filled){const j=i*16;x=poses[j+12];y=poses[j+13];z=poses[j+14];}
        else{
          let p;
          try{p=frame.getJointPose?.(spaces[i],ref)?.transform.position;}catch{continue;}
          if(!p)continue;
          x=p.x;y=p.y;z=p.z;
        }
        if(Number.isFinite(x+y+z))joints[names[i]]=stage.local(x,y,z,coords[names[i]]);
      }
      const hand=classifyHand(joints,src.handedness,cache.pinch);cache.pinch=hand?.pinch??false;
      if(hand)found.push(hand);
    }
    return found;
  }
}

export async function supportedModes(){
  if(!globalThis.isSecureContext||!navigator.xr)return [];
  const modes=['immersive-vr','immersive-ar'];
  const flags=await Promise.all(modes.map(async m=>{try{return await navigator.xr.isSessionSupported(m);}catch{return false;}}));
  return modes.filter((_,i)=>flags[i]);
}

const STARTUP_MS=10000;
export const entrySteps={
  request:'브라우저의 XR 세션 응답',graphics:'헤드셋 그래픽 연결',layer:'양안 화면 준비',
  space:'시점 좌표 준비',frame:'첫 XR 프레임',pose:'헤드셋 위치 추적',draw:'대련장 그리기'
};

export class Immersion {
  constructor(painter,game,update,metrics,onEnd,onProgress=()=>{}){
    this.painter=painter;this.game=game;this.update=update;this.metrics=metrics;this.onEnd=onEnd;this.onProgress=onProgress;
    this.viewMatrix=identity();this.hudMatrix=identity();this.handReader=new HandReader();
    this.reset=this.reset.bind(this);this.draw=this.draw.bind(this);
    this.session=null;this.attempt=null;this.timer=null;
  }
  progress(step){
    if(step===this.step)return;
    this.step=step;this.onProgress(step);
  }
  async start(mode){
    if(this.attempt)return;
    this.game.sound?.unlock?.();
    const attempt={session:null,message:'',finished:false};
    this.attempt=attempt;this.mode=mode;this.presented=false;this.step=null;this.progress('request');
    try{
      // This call stays in the original button event; permission UI belongs to the browser.
      const session=await navigator.xr.requestSession(mode,{optionalFeatures:['hand-tracking']});
      if(this.attempt!==attempt){await session.end();return;}
      attempt.session=session;this.session=session;
      session.addEventListener('end',()=>this.finish(attempt),{once:true});
      this.armTimeout(attempt);
      this.progress('graphics');
      const gl=this.painter.gl;
      if(!gl.getContextAttributes()?.xrCompatible)await gl.makeXRCompatible();
      if(this.attempt!==attempt||attempt.stopping)return;
      this.progress('layer');
      this.layer=new XRWebGLLayer(session,gl,{alpha:true,antialias:false,depth:false,stencil:false,framebufferScaleFactor:.86});
      session.updateRenderState({baseLayer:this.layer,depthNear:.035,depthFar:90});
      this.progress('space');
      const space=await session.requestReferenceSpace('local');
      if(this.attempt!==attempt||attempt.stopping)return;
      this.space=space;space.addEventListener('reset',this.reset);
      this.reset();this.progress('frame');session.requestAnimationFrame(this.draw);
    }catch(e){
      if(this.attempt===attempt)this.fail(e);
    }
  }
  armTimeout(attempt){
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{
      if(this.attempt!==attempt||this.presented||attempt.stopping)return;
      const visibility=this.session?.visibilityState;
      // Leave a system permission dialog or a sleeping headset in control.
      if(visibility==='hidden'||visibility==='visible-blurred'){this.armTimeout(attempt);return;}
      this.fail({name:'Timeout'});
    },STARTUP_MS);
  }
  fail(error){
    const code=String(error?.name||'Error');
    const hint=code==='NotAllowedError'||code==='SecurityError'?'Meta Quest Browser에서 이 주소를 직접 열고 사이트의 XR 권한을 확인해 주세요.':
      code==='NotSupportedError'?'다른 입장 모드를 시도해 주세요.':'브라우저로 돌아와 다시 시도할 수 있습니다.';
    this.stop(entrySteps[this.step]+' 단계에서 멈췄습니다. '+hint+' [XR-'+this.step+' / '+code+']');
  }
  stop(message=''){
    const a=this.attempt;
    if(!a||a.stopping)return;
    a.message=message;a.stopping=true;clearTimeout(this.timer);
    if(!a.session){this.finish(a);return;}
    try{Promise.resolve(a.session.end()).then(()=>this.finish(a),()=>this.finish(a));}
    catch{this.finish(a);}
  }
  finish(a){
    if(this.attempt!==a||a.finished)return;
    a.finished=true;clearTimeout(this.timer);this.timer=null;
    this.space?.removeEventListener('reset',this.reset);this.space=null;this.layer=null;
    this.session=null;this.attempt=null;
    const gl=this.painter.gl;
    if(!gl.isContextLost?.())gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    this.onEnd(a.message);
  }
  reset(){this.stage=new StageSpace();this.game.reset();this.last=null;this.totalTime=0;this.samples=0;this.hz=0;}
  draw(ms,frame){
    const sess=this.session;
    if(!sess||this.attempt?.stopping||(frame.session&&frame.session!==sess))return;
    try{
      this.renderFrame(ms,frame,sess);
      if(this.session===sess&&!this.attempt?.stopping)sess.requestAnimationFrame(this.draw);
    }catch(e){this.fail(e);}
  }
  renderFrame(ms,frame,sess){
    if(sess.visibilityState==='hidden'){this.game.interruptTracking();this.last=null;return;}
    const layer=sess.renderState?.baseLayer||this.layer,gl=this.painter.gl;
    if(!layer)return;
    const passthrough=this.mode!=='immersive-vr'&&sess.environmentBlendMode==='alpha-blend';
    // Clear the actual XR framebuffer, even when the first pose or hands are unavailable.
    gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);
    if(passthrough)gl.clearColor(0,0,0,0);else gl.clearColor(.94,.92,.86,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pose=frame.getViewerPose(this.space);
    if(!pose?.views.length){this.game.interruptTracking();this.last=null;if(!this.presented)this.progress('pose');return;}
    if(!this.presented)this.progress('draw');
    const delta=this.last===null?1/72:(ms-this.last)/1000;this.last=ms;
    if(delta>0&&delta<.25){this.totalTime+=delta;this.samples++;}
    if(this.totalTime>=1.6){this.hz=this.samples/this.totalTime;this.totalTime=0;this.samples=0;}
    const m=pose.transform.matrix;if(!this.stage.origin)this.stage.anchor(m);
    const hands=this.presented?this.handReader.read(frame,this.space,this.stage,sess.inputSources):[];
    const head=this.stage.local(m[12],m[13],m[14]);
    this.game.tick(delta,hands,head);this.update();
    let viewsDrawn=0;
    for(const view of pose.views){
      const v=layer.getViewport(view);if(!v||!v.width||!v.height)continue;
      gl.viewport(v.x,v.y,v.width,v.height);
      multiply(this.viewMatrix,view.transform.inverse.matrix,this.stage.matrix);
      this.painter.eye(this.viewMatrix,view.projectionMatrix,this.game.groups,this.game.time,passthrough,null,this.game.sealVisual,{
        backRibbons:this.game.backRibbons,frontRibbons:this.game.frontRibbons,handRipple:this.game.handRipple
      });
      viewsDrawn++;
    }
    if(!this.presented&&viewsDrawn===pose.views.length){
      if(gl.isContextLost?.())throw new DOMException('WebGL context lost','InvalidStateError');
      this.presented=true;clearTimeout(this.timer);this.onProgress('ready');
      // A refresh-rate hint must never delay the first picture.
      if(sess.supportedFrameRates?.includes(72)&&typeof sess.updateTargetFrameRate==='function')
        Promise.resolve().then(()=>sess.updateTargetFrameRate(72)).catch(()=>{});
    }
  }
}
