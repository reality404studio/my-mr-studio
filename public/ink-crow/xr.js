import {classifyHand} from './gesture.js';
import {identity,multiply} from './render.js';

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
      if(!src.hand)continue;
      let cache=this.sources.get(src);
      if(!cache){
        const names=JOINTS.filter(n=>src.hand.get(n));
        cache={names,spaces:names.map(n=>src.hand.get(n)),poses:new Float32Array(names.length*16),
          coords:Object.fromEntries(names.map(n=>[n,[0,0,0]])),pinch:false};
        this.sources.set(src,cache);
      }
      const {names,spaces,poses,coords}=cache, joints={};
      const filled=frame.fillPoses?.(spaces,ref,poses);
      for(let i=0;i<names.length;i++){
        let x,y,z;
        if(filled){const j=i*16;x=poses[j+12];y=poses[j+13];z=poses[j+14];}
        else{
          const p=frame.getJointPose?.(spaces[i],ref)?.transform.position;
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
  const modes=['immersive-ar','immersive-vr'];
  const flags=await Promise.all(modes.map(async m=>{try{return await navigator.xr.isSessionSupported(m);}catch{return false;}}));
  return modes.filter((_,i)=>flags[i]);
}

export class Immersion {
  constructor(painter,game,update,metrics,onEnd){
    this.painter=painter;this.game=game;this.update=update;this.metrics=metrics;this.onEnd=onEnd;
    this.viewMatrix=identity();this.hudMatrix=identity();this.handReader=new HandReader();
    this.draw=this.draw.bind(this);this.done=this.done.bind(this);this.reset=this.reset.bind(this);
  }
  async start(mode){
    // requestSession is invoked synchronously from the user's button before any await.
    const session=await navigator.xr.requestSession(mode,{requiredFeatures:['hand-tracking'],optionalFeatures:['local-floor']});
    this.session=session;
    session.addEventListener('end',this.done,{once:true});
    try{
      await this.painter.gl.makeXRCompatible();
      const gl=this.painter.gl;
      const layer=new XRWebGLLayer(session,gl,{alpha:true,antialias:false,depth:false,stencil:false,framebufferScaleFactor:.86});
      session.updateRenderState({baseLayer:layer,depthNear:.035,depthFar:90});
      try{this.space=await session.requestReferenceSpace('local-floor');}
      catch{this.space=await session.requestReferenceSpace('local');}
      if(session.supportedFrameRates?.includes(72))await session.updateTargetFrameRate(72).catch(()=>{});
      this.layer=layer;this.space.addEventListener('reset',this.reset);
      this.reset();session.requestAnimationFrame(this.draw);
    }catch(e){await session.end().catch(()=>{});throw e;}
  }
  reset(){this.stage=new StageSpace();this.game.reset();this.last=null;this.totalTime=0;this.samples=0;this.hz=0;}
  done(){
    this.space?.removeEventListener('reset',this.reset);this.session=null;
    this.painter.gl.bindFramebuffer(this.painter.gl.FRAMEBUFFER,null);this.onEnd();
  }
  draw(ms,frame){
    const sess=this.session;if(!sess)return;sess.requestAnimationFrame(this.draw);
    const pose=frame.getViewerPose(this.space);
    if(!pose||sess.visibilityState==='hidden'){this.game.interruptTracking();this.last=null;return;}
    const delta=this.last===null?1/72:(ms-this.last)/1000;this.last=ms;
    if(delta>0&&delta<.25){this.totalTime+=delta;this.samples++;}
    if(this.totalTime>=1.6){this.hz=this.samples/this.totalTime;this.totalTime=0;this.samples=0;}
    const m=pose.transform.matrix;if(!this.stage.origin)this.stage.anchor(m);
    const hands=this.handReader.read(frame,this.space,this.stage,sess.inputSources);
    const head=this.stage.local(m[12],m[13],m[14]);
    this.game.tick(delta,hands,head);this.update();
    let [title,hint]=this.game.info();
    if(!hands.length&&['ready','trace','seal','charge'].includes(this.game.phase))hint='손을 시야 안에 들어 주세요.';
    if(this.game.phase==='charge')title+=' · '+(Math.floor(this.game.charge*10)*10)+'%';
    if(this.game.shot)hint='붉은 먹이 다가옵니다. 고개를 옆으로 피하세요.';
    const health='나 '+this.game.selfHP+'  /  상대 '+this.game.enemyHP;
    if(this.metrics()&&this.hz)hint=health+'   '+this.hz.toFixed(0)+' Hz · '+(1000/this.hz).toFixed(1)+' ms';
    else if(!hint)hint=health;
    this.painter.label(title,hint);
    const gl=this.painter.gl,layer=this.layer;gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    for(const view of pose.views){
      const v=layer.getViewport(view);gl.viewport(v.x,v.y,v.width,v.height);
      multiply(this.viewMatrix,view.transform.inverse.matrix,this.stage.matrix);
      multiply(this.hudMatrix,view.transform.inverse.matrix,m);
      this.painter.eye(this.viewMatrix,view.projectionMatrix,this.game.groups,this.game.time,sess.environmentBlendMode==='alpha-blend',this.hudMatrix);
    }
  }
}
