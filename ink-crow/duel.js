import {TAU,clamp,mix,smooth,random,add,sub,mul,unit,len,dot,cross,dist,lerp3,onSeal,fitSeal,palmAtSeal} from './gesture.js?v=6bc0e5d';
import {WorldWash} from './world-wash.js?v=6bc0e5d';
import {InkSpray} from './ink-spray.js?v=6bc0e5d';
import {SplatBatch,springStep,spiral} from './ink.js?v=6bc0e5d';
import {landscape,crowForm,glyphSamples,adversary,stroke} from './forms.js?v=6bc0e5d';
import {InkSound} from './sound.js?v=6bc0e5d';
import {RibbonBatch} from './ribbon.js?v=6bc0e5d';
import {FeatherSwarm} from './curl-feathers.js?v=6bc0e5d';
import {createDefaultTipLookup} from './glyph-sdf.js?v=6bc0e5d';

export const CHARGE_SECONDS=1.35;
export const WRITE_SECONDS=0.65;
export const IMPLOSION_SECONDS=0.14;
const ORIGIN=[0,0,0], FORWARD=[0,0,-1];

const lines={
  ready:['먹진을 그리세요','검지를 펴거나 핀치한 채 한 손으로 원을 그리세요.'],
  trace:['먹선을 이으세요','처음 그은 자리 가까이 돌아오세요.'],
  seal:['손바닥으로 기운을 넣으세요','원을 향해 손바닥을 펴고 중앙에 잠시 머무르세요.'],
  charge:['먹이 차오릅니다','손바닥을 그대로 유지하세요.'],
  release:['까마귀 소환',''],
  recover:['다음 획을 준비하세요',''],
  win:['승리','잠시 후 다시 대련합니다.'],
  lose:['다시 숨을 고르세요','잠시 후 다시 대련합니다.']
};
export class Duel {
  constructor(){
    this.brush=new WorldWash();this.spray=new InkSpray();this.land=landscape();this.enemyCloud=new SplatBatch(1850);
    this.flow=new SplatBatch(4100);this.decor=new SplatBatch(2800);this.fx=new SplatBatch(1400);this.handsCloud=new SplatBatch(1200);
    this.traces=new SplatBatch(2400);this.bird=crowForm();this.sound=new InkSound();
    this.backRibbons=new RibbonBatch(9000,27000);
    this.frontRibbons=new RibbonBatch(6000,18000);
    this.feathers=new FeatherSwarm();
    this.tipLookup=createDefaultTipLookup();
    this.hasSdfGlyph=false;this.sealVisual=null;this.circleVisual=null;
    this.handRipple=[0,0,-10,0];this.prevHandPos=null;
    const rng=random(306),glyph=glyphSamples(this.bird.length,rng);
    this.bird.forEach((b,i)=>{
      const a=rng()*TAU;
      b.g=glyph[i];b.a=a;b.f=rng();b.orbit=.24+.64*rng();
      b.pos=[0,0,0];b.vel=[0,0,0];b.ax=[1,0,0];
    });
    this.groups=[
      {batch:this.land,alpha:1,scenery:true},{batch:this.enemyCloud,alpha:1},{batch:this.traces,alpha:1},
      {batch:this.brush.marks,alpha:1,sheet:this.brush},{batch:this.decor,alpha:1},{batch:this.flow,alpha:1,frontAnchor:true},{batch:this.fx,alpha:1},{batch:this.handsCloud,alpha:1},{batch:this.spray.marks,alpha:1}
    ];
    this.depthOrder=Uint16Array.from(this.bird,(_,i)=>i);
    this.sortDepth=(i,j)=>this.bird[j].depth-this.bird[i].depth;
    this.tmp=[0,0,0];this.home=[0,0,0];this.rootPrev=[0,0,0];this.hitSerial=0;this.frame=0;
    this.flockPrev=Array.from({length:9},()=>[0,0,0]);
    this.reset();
  }
  setGlyphSamples(samples){
    if(!samples||samples.length<this.bird.length)return;
    for(let i=0;i<this.bird.length;i++)this.bird[i].g=samples[i];
    this.hasSdfGlyph=true;
  }
  setGlyphSdfMeta(sdf){
    if(sdf&&typeof sdf.tipAt==='function')this.tipLookup=sdf.tipAt.bind(sdf);
  }
  reset(){
    this.spray.clear();this.time=0;this.enemyHP=3;this.selfHP=3;this.hitFlash=0;this.hurtFlash=0;
    this.enemy=[.83,-.16,-3.42];this.head=[0,0,0];this.shot=null;this.nextShot=Infinity;
    this.hasCast=false;this.handData=[];this.impacts=[];this.demo=false;this.prevHandPos=null;
    this.handRipple=[0,0,-10,0];this.resetCast();
  }
  resetCast(keepInk=false){
    this.phase='ready';this.phaseTime=0;this.charge=0;this.seal=null;this.sealVisual=null;this.circleVisual=null;this.owner=null;
    this.brush.end();if(!keepInk)this.brush.reset();
    this.feathers.reset();
    this.abandoned=keepInk?this.time:null;this.spray.stopMotion();this.wasDrawing=false;this.missing=0;this.previousTip=null;this.trail=[];this.struck=false;
    this.needLift=false;this.livePalm=null;this.lastSpringRoot=null;this.traceAlpha=1;this.checkAt=0;
    this.liveBrushTip=null;this.liveBrushStrokeId=-1;
    this.unlockedTier=0;this.tier1Time=-1;this.tier2Time=-1;
    this.implosion=0;this.exploded=false;
  }
  enter(p){this.phase=p;this.phaseTime=0;}
  info(){
    const l=lines[this.phase];return [l[0],l[1]];
  }
  tick(dt,hands=[],eye=ORIGIN){
    if(dt>.15)this.interruptTracking();
    dt=clamp(dt,0,.05);this.time+=dt;this.phaseTime+=dt;this.frame++;
    this.handData=hands;this.head=eye;this.hitFlash=Math.max(0,this.hitFlash-dt);this.hurtFlash=Math.max(0,this.hurtFlash-dt);
    this.enemy[0]=.83+.085*Math.sin(this.time*.77);this.enemy[1]=-.16+.045*Math.sin(this.time*1.42);
    if(this.phase==='win'||this.phase==='lose'){
      if(this.phaseTime>3){this.reset();return;}
    }else{
      if(this.phase==='ready'||this.phase==='trace')this.drawInput(dt,hands,eye);
      if(this.phase==='seal'||this.phase==='charge')this.chargeInput(dt,hands);
      if(this.phase==='release')this.release(dt);
      if(this.phase==='recover'&&this.phaseTime>1.05)this.resetCast();
      this.enemyTurn(dt);
    }
    const sealed=this.phase==='seal'||this.phase==='charge';
    const releasing=this.phase==='release';
    // Update live 11-stroke brush-tip tracker during 0.65s calligraphy write
    if(sealed && this.seal){
      const wp=clamp((this.time-this.sealBorn)/WRITE_SECONDS,0,1);
      if(wp<.995){
        this.liveBrushTip=this.tipLookup(wp);
        this.liveBrushStrokeId=this.liveBrushTip.strokeId;
      }else{
        this.liveBrushTip=null;
        this.liveBrushStrokeId=-1;
      }
      // Stage 5: Escalation tiers (25% Bagua outer circle, 55% Front talisman ring, 65% Curl feather swarm)
      if(this.charge>=.25 && this.unlockedTier<1){this.unlockedTier=1;this.tier1Time=this.time;}
      if(this.charge>=.55 && this.unlockedTier<2){this.unlockedTier=2;this.tier2Time=this.time;}
      if(this.charge>=.65 && this.unlockedTier<3){this.unlockedTier=3;}
      if(this.charge<.15 && this.unlockedTier>0){this.unlockedTier=0;this.tier1Time=-1;this.tier2Time=-1;}
    }else{
      this.liveBrushTip=null;this.liveBrushStrokeId=-1;
    }
    // Step Zero-GC 3D Curl Noise + Hand Collider Feather Swarm
    if(this.seal && (sealed || releasing)){
      this.feathers.step(dt,this.seal,sealed?this.charge:1,this.implosion,this.exploded,hands,this.time);
    }
    // Track hand position & smoothed velocity for GPU radial qi ripple across all 4 magic circle layers
    const activeHand=this.livePalm ?? hands[0]?.palm ?? hands[0]?.tip ?? null;
    if(activeHand){
      const spd=this.prevHandPos&&dt>.001?dist(activeHand,this.prevHandPos)/dt:0;
      this.prevHandPos=activeHand.slice();
      const target=clamp(spd*.55+this.charge*.55,0,1.4);
      this.handRipple[0]=activeHand[0];this.handRipple[1]=activeHand[1];this.handRipple[2]=activeHand[2];
      this.handRipple[3]=mix(this.handRipple[3],Math.max(this.handRipple[3]*Math.exp(-dt*3.2),target),Math.min(1,dt*10));
    }else{
      this.prevHandPos=null;
      this.handRipple[3]*=Math.exp(-dt*3.5);
    }
    this.brush.tick(dt);this.spray.step(dt);
    if(this.abandoned!==null && this.time-this.abandoned>2.3){this.brush.reset();this.abandoned=null;}
    this.impacts=this.impacts.filter(i=>this.time-i.time<1.45);
    this.sound.sync(this,dt);
  }
  interruptTracking(){
    if(this.phase==='trace'){this.brush.end();this.spray.stopMotion();this.resetCast(true);this.needLift=true;}
  }
  tryFitSeal(eye){
    const ps=this.brush.points;
    let s=fitSeal(ps,eye);
    if(!s&&ps.length>46)s=fitSeal(ps.slice(-Math.min(ps.length,150)),eye);
    return s;
  }
  drawInput(dt,hands,eye){
    if(this.needLift){if(!hands.some(h=>h.draw))this.needLift=false;return;}
    let h=this.owner?hands.find(h=>h.side===this.owner):hands.find(h=>h.draw);
    if(!h||!h.draw){
      if(this.phase==='trace'){
        if(!this.missing){
          if(h && !h.cancelled)this.spray.lift(this.previousTip,this.brush.normal,this.brush.brush);
          else this.spray.stopMotion();
          this.brush.end();
        }
        this.missing+=dt;
        if(this.missing>(h?.14:.23)){
          const s=this.tryFitSeal(eye);
          if(s)this.lock(s);else this.resetCast(true);
        }
      }
      return;
    }
    if(this.missing && this.previousTip && dist(h.tip,this.previousTip)>.04){this.interruptTracking();return;}
    const resumed=this.missing>0;
    this.missing=0;
    if(this.phase==='ready'){
      this.owner=h.side;this.enter('trace');this.abandoned=null;this.brush.begin(h.tip,this.time,eye);this.spray.stopMotion();this.previousTip=h.tip.slice();this.checkAt=0;
      return;
    }
    const delta=dist(h.tip,this.previousTip);
    if(delta>Math.min(.18,.065+3.2*dt)){this.interruptTracking();return;}
    if(!resumed)this.spray.sample(this.previousTip,h.tip,dt,this.brush.normal,this.brush.brush);
    this.brush.line(h.tip,this.time);this.previousTip=h.tip.slice();
    if(this.brush.travel-this.checkAt>.025){
      this.checkAt=this.brush.travel;
      const s=this.tryFitSeal(eye);if(s)this.lock(s);
    }
    if(this.phase==='trace'&&(this.brush.points.length>415 || this.phaseTime>10)){this.resetCast(true);this.needLift=true;}
  }
  lock(seal){
    this.seal=seal;this.sealBorn=this.time;const ps=this.brush.points;
    // Snap user loop into a clean calligraphic Enso ring; Layer 2 SVG-SDF shader writes 鳥 stroke-by-stroke over 0.65s.
    this.brush.close(ps[0],this.time,seal,!this.hasSdfGlyph);this.spray.stopMotion();
    this.feathers.reset();this.unlockedTier=0;this.tier1Time=-1;this.tier2Time=-1;
    this.implosion=0;this.exploded=false;
    this.owner=null;this.enter('seal');
  }
  triggerBurstImpulse(){
    if(this.exploded)return;
    this.exploded=true;this.implosion=0;
    const s=this.seal, toEnemy=unit(sub(this.enemy,s.c));
    for(let i=0;i<this.bird.length;i++){
      const b=this.bird[i], g=b.g;
      const outLen=Math.hypot(g.x,g.y)||.001;
      const rx=g.x/outLen, ry=g.y/outLen;
      const swirlX=-ry*s.sign, swirlY=rx*s.sign;
      const kick=.95+1.45*b.f, fwd=.82+1.05*b.f;
      for(let k=0;k<3;k++){
        b.vel[k]=(s.u[k]*(rx*.75+swirlX*.45)+s.v[k]*(ry*.75+swirlY*.45))*kick + toEnemy[k]*fwd;
      }
    }
    this.feathers.blastOutward(s);
  }
  chargeInput(dt,hands){
    const h=hands.find(h=>palmAtSeal(h,this.seal));
    this.livePalm=h?.palm??null;
    if(h){
      this.charge=Math.min(1,this.charge+dt/CHARGE_SECONDS);
      if(this.phase!=='charge')this.enter('charge');
      if(this.charge>=1){
        this.hasCast=true;this.formation();
        this.unlockedTier=3;
        this.implosion=0.01;this.exploded=false;
        this.enter('release');this.crowRoot=this.seal.c.slice();this.lastSpringRoot=this.crowRoot.slice();
        for(let f=0;f<9;f++)this.flockPrev[f]=this.seal.c.slice();
        if(this.nextShot===Infinity)this.nextShot=this.time+6.3;
      }
    }else{
      this.charge=Math.max(0,this.charge-dt*.68);
      if(this.phase==='charge')this.enter('seal');
    }
  }
  formation(){
    const s=this.seal,t=this.time,charge=this.charge,cloud=this.flow;
    const settled=smooth((t-this.sealBorn)/1.05);
    const writeProgress=clamp((t-this.sealBorn)/WRITE_SECONDS,0,1);
    if(!this.hasSdfGlyph)this.brush.writeGlyph(writeProgress,t);
    // Align Layer 2 splat coordinates exactly with the Layer 2 3D SDF quad (span = r * 0.93 -> diameter = r * 1.86)
    const glyphSpan=this.hasSdfGlyph?s.r*1.86:s.r*1.22;
    for(let i=0;i<this.bird.length;i++){
      const b=this.bird[i],g=b.g;
      const strokeReady=clamp((writeProgress-(g.order??0)*.78)*2.4,0,1);
      let q=clamp((charge*.85+.25*strokeReady-.13*b.f)/(1-.13*b.f));
      const a=b.a+t*(.27+b.f*.22)*(1-smooth(charge)), radius=s.r*mix(.96+.14*b.f,b.orbit*.86,settled)*(.96+.04*Math.sin(t*2+b.a));
      const gx=g.x*glyphSpan,gy=g.y*glyphSpan;
      const ox=Math.cos(a)*radius,oy=Math.sin(a)*radius;
      spiral(this.tmp,ox-gx,oy-gy,-s.r*(.24+.32*b.f),q,s.sign,.65+b.f*.42,b.f);
      const x=gx+this.tmp[0],y=gy+this.tmp[1],z=this.tmp[2]+.009;
      const p=b.pos;
      for(let k=0;k<3;k++){p[k]=s.c[k]+s.u[k]*x+s.v[k]*y+s.n[k]*z;b.vel[k]=0;}
      const ax=mix(-Math.sin(a),g.dx,smooth(q)),ay=mix(Math.cos(a),g.dy,smooth(q));
      if(this.hasSdfGlyph){
        // Layer 2 SVG-SDF quad owns the crisp jet-black 鳥 strokes & blazing cyan rim.
        const isStar=i%72===0;
        const isWisp=(i%8===0) && q<.96;
        if(!isStar && !isWisp)continue;
        const mag=(.011+.009*b.f)*s.r;
        if(isStar){
          cloud.put(...p,s.u[0]*ax+s.v[0]*ay,s.u[1]*ax+s.v[1]*ay,s.u[2]*ax+s.v[2]*ay,
            mag*1.25,mag*1.25,.42+.68*charge,i%144===0?.92:.08,12,b.seed);
        }else{
          const gatherFade=1-smooth((q-.68)/.28);
          cloud.put(...p,s.u[0]*ax+s.v[0]*ay,s.u[1]*ax+s.v[1]*ay,s.u[2]*ax+s.v[2]*ay,
            mag*(1.4+.5*q),mag*(.34+.18*q),(.26+.72*gatherFade)*(.55+.45*charge),.42+b.f*.4,g.dry?1:0,b.seed);
        }
      }else{
        const decorative=i%7===0;
        const mag=(.019+.015*b.f)*s.r;
        const tone=decorative&&q<.88?(i%14===0?12:7):(g.dry&&i%3===0?1:0);
        cloud.put(...p,s.u[0]*ax+s.v[0]*ay,s.u[1]*ax+s.v[1]*ay,s.u[2]*ax+s.v[2]*ay,
          mag*(1.45+.58*q),mag*(.40+.35*q),(.34+2.25*q)*(decorative?.62:1),
          .32+b.f*.54,tone,b.seed);
      }
    }
  }
  flight(t){
    const s=this.seal,scale=clamp(s.r/.24,.56,1.24);
    const toEnemy=unit(sub(this.enemy,s.c));
    // Emerge forward toward the Dokkaebi-bul while rising slightly, then dive into the target.
    const perch=add(s.c,[toEnemy[0]*.42*scale,(.18+toEnemy[1]*.22)*scale,toEnemy[2]*.42*scale]);
    const emerge=smooth(t/1.15),dive=smooth((t-1.85)/1.18);
    const root=lerp3(lerp3(s.c,perch,emerge),this.enemy,dive);
    const arch=Math.sin(dive*Math.PI);
    root[0]-=.16*arch;root[1]+=.20*arch;
    // Always face directly toward the Dokkaebi-bul from the instant of summoning.
    const look=sub(this.enemy,root), horiz=Math.hypot(look[0],look[2]);
    const yaw=horiz>.001?Math.atan2(look[2],look[0]):Math.atan2(toEnemy[2],toEnemy[0]);
    const pitch=horiz>.001?clamp(Math.atan2(look[1],horiz),-.65,.65):0;
    return {root,scale:scale*(.26+.58*smooth(t/.72)),yaw,pitch,bank:-.18-.28*arch,
      flap:.30+.69*Math.sin((t-.15)*6.8),dive};
  }
  flockFlight(t,lead){
    const s=this.seal,baseScale=clamp(s.r/.24,.56,1.24);
    const toEnemy=unit(sub(this.enemy,s.c));
    const poses=[];
    const offsets=[
      [0,0,0],[-.16,.14,-.18],[.19,.11,-.21],[-.29,-.07,-.31],[.27,-.11,-.35],
      [-.12,.25,-.42],[.15,.23,-.47],[-.36,.10,-.54],[.35,.07,-.59]
    ];
    for(let id=0;id<9;id++){
      if(id===0){poses.push({...lead,birdGrow:1});continue;}
      const delay=id*.034, lt=Math.max(0,t-delay);
      const emerge=smooth(lt/1.15), dive=smooth((lt-1.82)/(1.18-delay*.35));
      const off=offsets[id], spread=baseScale*smooth(lt/.55)*(1-dive*.84);
      const swirl=id*1.37+t*2.4, orb=.055*spread;
      const perch=add(s.c,[
        (toEnemy[0]*.42+off[0])*baseScale,
        (.18+toEnemy[1]*.22+off[1])*baseScale,
        (toEnemy[2]*.42+off[2])*baseScale
      ]);
      const root=lerp3(lerp3(s.c,perch,emerge),this.enemy,dive);
      const arch=Math.sin(dive*Math.PI);
      root[0]+=-.16*arch+off[0]*spread+Math.cos(swirl)*orb;
      root[1]+=.20*arch+off[1]*spread+Math.sin(swirl)*orb*.75;
      root[2]+=off[2]*spread*.65;
      // Every bird in the flock looks directly at the Dokkaebi-bul from the moment it appears.
      const look=sub(this.enemy,root), horiz=Math.hypot(look[0],look[2]);
      const yaw=horiz>.001?Math.atan2(look[2],look[0]):lead.yaw;
      const pitch=horiz>.001?clamp(Math.atan2(look[1],horiz),-.65,.65):lead.pitch;
      poses.push({
        root,
        scale:lead.scale*(.92-.03*id),
        yaw,pitch,
        bank:-.16-.28*arch+off[0]*.35,
        flap:.30+.72*Math.sin((lt-.15)*(6.5+id*.22)+id*1.1),
        dive
      });
    }
    return poses;
  }
  release(dt){
    const t=this.phaseTime;
    // Stage 6a: 0.14s Implosion Anticipation Beat — vacuum pull inward before explosive crow burst!
    if(t<IMPLOSION_SECONDS){
      this.implosion=smooth(t/IMPLOSION_SECONDS);
      this.exploded=false;
      const s=this.seal, c=s.c, pull=1-Math.exp(-dt*14);
      const sight=unit(sub(c,this.head));
      for(const b of this.bird){
        for(let k=0;k<3;k++)b.pos[k]=mix(b.pos[k],c[k],pull*.42);
        b.depth=dot(b.pos,sight);
      }
      this.depthOrder.sort(this.sortDepth);
      const p0=this.flight(0);
      this.crowRoot=c.slice();this.lastSpringRoot=c.slice();this.crowScale=p0.scale*.85;this.wingGrow=0;
      for(let id=0;id<9;id++)this.flockPrev[id]=c.slice();
      return;
    }
    if(!this.exploded)this.triggerBurstImpulse();
    // Scale remaining flight clock smoothly so impact & total cast duration (3.12s) match gameplay & tests 1:1
    const ft=(t-IMPLOSION_SECONDS)*(3.12/(3.12-IMPLOSION_SECONDS));
    const pose=this.flight(ft),{root,scale}=pose;
    const flockPoses=this.flockFlight(ft,pose);
    const grow=smooth(ft/.52);
    const sight=unit(sub(root,this.head));
    const carries=flockPoses.map((fp,id)=>sub(fp.root,this.flockPrev[id]));
    const trig=flockPoses.map(fp=>({
      cy:Math.cos(fp.yaw),sy:Math.sin(fp.yaw),
      cp:Math.cos(fp.pitch??0),sp:Math.sin(fp.pitch??0),
      co:Math.cos(fp.bank),si:Math.sin(fp.bank),
      wCos:Math.cos(fp.flap),wSin:Math.sin(fp.flap),
      root:fp.root,scale:fp.scale
    }));
    const burstGather=smooth((ft-.06)/.26);
    const springK=mix(52,330,burstGather), springDamp=mix(6.5,13.5,burstGather);
    for(const b of this.bird){
      const id=b.flockId??0, tr=trig[id], carry=carries[id];
      const side=b.wing, p=b.p;
      const reach=side?Math.max(0,Math.abs(p[2])-.035*b.birdScale):0;
      const z=side?side*(.035*b.birdScale+reach*tr.wCos):p[2], y=p[1]+reach*tr.wSin;
      const ry=y*tr.co-z*tr.si, rz=y*tr.si+z*tr.co;
      const px=(p[0]*tr.cp-ry*tr.sp)*tr.scale, py=(p[0]*tr.sp+ry*tr.cp)*tr.scale, pz=rz*tr.scale;
      const h=this.home;
      h[0]=tr.root[0]+px*tr.cy-pz*tr.sy;
      h[1]=tr.root[1]+py;
      h[2]=tr.root[2]+px*tr.sy+pz*tr.cy;
      for(let k=0;k<3;k++)b.pos[k]+=carry[k]*grow;
      springStep(b.pos,b.vel,h,springK*(.92+.18*b.f),springDamp,26,5.2,dt);
      const ax=b.axis[0],az=side?b.axis[2]*tr.wCos:b.axis[2],ay=b.axis[1]+(side?b.axis[2]*side*tr.wSin:0);
      const ary=ay*tr.co-az*tr.si, arz=ay*tr.si+az*tr.co;
      const apx=ax*tr.cp-ary*tr.sp, apy=ax*tr.sp+ary*tr.cp;
      b.depth=dot(b.pos,sight);
      const fax=apx*tr.cy-arz*tr.sy, fay=apy, faz=apx*tr.sy+arz*tr.cy;
      const spd=Math.hypot(b.vel[0],b.vel[1],b.vel[2]);
      if(burstGather<.98 && spd>.25){
        const inv=1/spd, m=burstGather;
        b.ax[0]=mix(b.vel[0]*inv,fax,m);b.ax[1]=mix(b.vel[1]*inv,fay,m);b.ax[2]=mix(b.vel[2]*inv,faz,m);
      }else{
        b.ax[0]=fax;b.ax[1]=fay;b.ax[2]=faz;
      }
    }
    this.depthOrder.sort(this.sortDepth);
    this.lastSpringRoot=root.slice();this.crowRoot=root;this.crowScale=scale;this.wingGrow=grow;
    for(let id=0;id<9;id++)this.flockPrev[id]=flockPoses[id].root.slice();
    const old=this.trail[this.trail.length-1];
    if(!old||this.time-old.time>.025){
      this.trail.push({
        p:root.slice(),
        flock:flockPoses.map(fp=>fp.root.slice()),
        time:this.time
      });
    }
    if(this.trail.length>26)this.trail.shift();
    if(!this.struck&&t>2.4&&dist(root,this.enemy)<.24){
      this.struck=true;this.enemyHP--;this.hitSerial++;this.hitFlash=.62;
      this.impacts.push({p:this.enemy.slice(),time:this.time,side:1});this.shot=null;
    }
    if(t>3.12){
      this.enter(this.enemyHP===0?'win':'recover');this.nextShot=this.time+3.45;
    }
  }
  enemyTurn(dt){
    if(!this.hasCast||this.enemyHP<=0)return;
    if(!this.shot&&this.time>=this.nextShot){
      this.shot={age:0,from:add(this.enemy,[0,.04,.10]),to:null,prev:null,p:null};
      this.nextShot=Infinity;
    }
    const shot=this.shot;if(!shot)return;
    shot.age+=dt;
    if(shot.age<1.15)return;
    if(!shot.to){shot.to=this.head.slice();shot.prev=shot.from.slice();}
    const q=clamp((shot.age-1.15)/1.35);
    shot.p=lerp3(shot.from,shot.to,q);shot.p[1]+=.13*Math.sin(q*Math.PI);
    // Distance to the swept segment also catches low frame-rate crossings.
    const d=sub(shot.p,shot.prev),u=clamp(dot(sub(this.head,shot.prev),d)/(dot(d,d)||1));
    if(dist(this.head,lerp3(shot.prev,shot.p,u))<.145){
      this.hurtFlash=.78;this.selfHP--;this.impacts.push({p:lerp3(shot.from,shot.to,.80),time:this.time,side:-1});
      this.shot=null;this.nextShot=this.time+7.0;
      if(this.selfHP===0)this.enter('lose');
    }else if(q>=1){this.shot=null;this.nextShot=this.time+7.0;}
    else shot.prev=shot.p.slice();
  }
  paint(){
    this.flow.clear();this.decor.clear();this.fx.clear();this.traces.clear();this.enemyCloud.clear();this.handsCloud.clear();
    this.backRibbons.clear();this.frontRibbons.clear();
    const s=this.seal,t=this.phaseTime,releasing=this.phase==='release';
    const sealed=this.phase==='seal'||this.phase==='charge',finish=this.phase==='recover'||this.phase==='win'||this.phase==='lose';
    const postBlast=releasing?Math.max(0,t-IMPLOSION_SECONDS):0;
    const alpha=finish?0:releasing?1-smooth((postBlast-.42)/1.05):1;
    this.groups[3].alpha=this.abandoned===null?alpha:1-smooth((this.time-this.abandoned-.85)/1.45);
    this.sealVisual=null;
    this.circleVisual=null;
    if(s && (sealed||releasing)){
      const writeProgress=sealed?clamp((this.time-this.sealBorn)/WRITE_SECONDS,0,1):1;
      const imp=releasing?this.implosion:0;
      // Vacuum contraction during 0.14s implosion -> snap expansion on burst!
      const contractScale=releasing
        ?(t<IMPLOSION_SECONDS?mix(1.0,.72,imp):1.0+smooth(postBlast/.32)*.26)
        :1.0;
      const dissolve=releasing?clamp(postBlast/.52,0,1):0;
      const sealAlpha=releasing?1-smooth((postBlast-.24)/.38):1;
      if(sealAlpha>.002){
        this.sealVisual={seal:s,writeProgress,charge:sealed?this.charge:1,dissolve,alpha:sealAlpha,scale:contractScale};
      }
      // Build 4-Layer Z-Stacked Taoist Magic Circle state (18cm total depth: -9cm, -3cm, 0cm, +7cm)
      const c=sealed?this.charge:1;
      const popSpring=(since)=>since<0?0:clamp(1-Math.exp(-since*11)*Math.cos(since*15),0,1.14);
      const t1Age=this.tier1Time>=0?this.time-this.tier1Time:-1;
      const t2Age=this.tier2Time>=0?this.time-this.tier2Time:-1;
      const backUnlocked=t1Age>=0 || releasing;
      const frontUnlocked=t2Age>=0 || releasing;
      const backPop=backUnlocked?(releasing?1:mix(.38,1,popSpring(t1Age))):0.88;
      const frontPop=frontUnlocked?(releasing?1:mix(.34,1,popSpring(t2Age))):0;
      // Subtle translucent preview halo on seal lock -> bold pop-in at 25% charge!
      const backAlpha=alpha*(backUnlocked?mix(.68,.96,c):(.20*smooth((this.time-this.sealBorn)/.35)));
      const frontAlpha=alpha*(frontUnlocked?mix(.58,.96,clamp((c-.50)/.50)):0);
      const spinBoost=1+c*1.45+(releasing&&t<IMPLOSION_SECONDS?3.2:0);
      this.circleVisual={
        seal:s,
        washZOff:-0.03,
        washScale:contractScale,
        back:{
          zOff:-0.09,
          radiusMul:1.54,
          rot:-this.time*(.24+.28*c)*s.sign,
          scale:backPop*contractScale,
          alpha:backAlpha,
          charge:c
        },
        front:{
          zOff:0.07,
          radiusMul:1.08,
          rot:this.time*(.58+.68*c)*spinBoost*s.sign,
          scale:frontPop*contractScale,
          alpha:frontAlpha,
          charge:c
        }
      };
      this.sealDetails(s,alpha,contractScale,postBlast);
      // Paint Zero-GC 3D Curl Noise + Hand Collider Feather Swarm (Stage 5 & 6)
      this.feathers.paint(this.decor,this.fx,releasing?1-smooth((postBlast-.75)/.55):1);
      if(sealed)this.formation();
      else {
        const k=this.crowScale??.2,fade=(1-smooth((t-2.86)/.26));
        const burstStretch=t<IMPLOSION_SECONDS?1:1+(1-smooth(postBlast/.28))*.85;
        for(const i of this.depthOrder){
          const b=this.bird[i];
          const isStar=b.tone>=11.5;
          this.flow.put(...b.pos,...b.ax,
            Math.max(.002,b.l*k*(isStar?1:burstStretch)),
            Math.max(.0015,b.w*k*(isStar?1:1/Math.sqrt(burstStretch))),
            b.mass*fade,b.water,b.tone,b.seed);
        }
      }
    }
    this.paintCombat();
    if(s&&this.livePalm&&sealed)this.palmStream(s);
    for(const h of this.handData)this.paintHand(h);
  }
  sealDetails(s,alpha,contractScale=1,postBlast=0){
    if(alpha<=0)return;
    const b=this.decor,rb=this.backRibbons,rf=this.frontRibbons,r=s.r*contractScale,t=this.time,c=this.charge,rng=random(863);
    const tierBoost=this.unlockedTier>=2?1.45:this.unlockedTier>=1?1.18:1.0;
    // 1. Silky continuous outer summoning mist ring (keeps 鳥 interior completely crisp!)
    for(let i=0;i<24;i++){
      const a=TAU*i/24+t*.22*tierBoost, rr=r*(1.12+.34*((i*7)%13)/13);
      const p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-.042+.014*Math.sin(t*1.8+i));
      const d=add(mul(s.u,-Math.sin(a)),mul(s.v,Math.cos(a)));
      b.put(...p,...d,r*.34,r*.13,alpha*(.24+.22*c),.84,11,rng());
    }
    // 2. Flowing 3D Curved Calligraphic Orbital Ribbons (ZERO straight spiky needles!)
    for(let k=0;k<3;k++){
      const startA=k*(TAU/3)+t*(.68+.36*c)*tierBoost+Math.sin(t*.9+k)*.18;
      rb.addOrbitalArc(s,r*(1.09+.055*k),startA,1.85+.45*c,r*(.044+.022*c),r*.026,-.022+.006*k,
        0,alpha*(.78+.22*c),.13+k*.31,c,36);
    }
    for(let k=0;k<3;k++){
      const startA=k*(TAU/3)+1.1-t*(.95+.52*c)*tierBoost;
      rb.addOrbitalArc(s,r*(1.02+.07*k),startA,1.65+.55*c,r*(.030+.020*c),r*.022,-.014+.005*k,
        1,alpha*(.68+.32*c),.41+k*.27,c,34);
    }
    for(let k=0;k<2;k++){
      const startA=k*Math.PI+t*(.52+.26*c)*tierBoost;
      rb.addOrbitalArc(s,r*(1.20+.04*k),startA,2.15,r*(.018+.012*c),r*.018,-.018,
        2,alpha*(.58+.42*c),.73+k*.19,c,34);
    }
    // 3. Orbiting round wet ink droplets & jewel-like 4-point cyan/gold star-flares riding the curves
    for(let i=0;i<22;i++){
      const a=TAU*rng()+t*(.28+(i%3)*.12)*tierBoost,rr=r*(1.06+rng()*.34),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-.010);
      const dropR=r*(.009+.008*rng());
      b.put(...p,...s.u,dropR*1.10,dropR,alpha*1.35,.88,i%7===0?7:0,rng());
    }
    const stars=8+Math.floor(c*8);
    for(let i=0;i<stars;i++){
      const a=TAU*i/stars+t*(.82+.38*c)*tierBoost, rr=r*(1.06+.14*Math.sin(i*2.1+t*2.4));
      const p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,.018);
      const starR=r*(.044+.034*c);
      b.put(...p,...s.u,starR,starR,alpha*(.82+1.05*c),i%2===0?.92:.08,12,(i+.3)/stars);
    }
    // 4. Stage 3: Live 11-Stroke Calligraphy Brush-Tip Emitter (wet ink splatter + cyan/gold tip spark!)
    if(this.liveBrushTip && (this.phase==='seal'||this.phase==='charge')){
      const tip=this.liveBrushTip;
      const glyphSpan=this.hasSdfGlyph?s.r*1.86:s.r*1.22;
      const tp=onSeal(s,tip.x*glyphSpan,tip.y*glyphSpan,.012);
      const dir=add(mul(s.u,tip.dx),mul(s.v,tip.dy));
      // Blazing cyan-white + gold 4-point brush-tip flare
      this.fx.put(...tp,...s.u,s.r*.11,s.r*.11,2.4*alpha,.08,12,.37);
      this.fx.put(...tp,...s.v,s.r*.075,s.r*.075,1.9*alpha,.92,12,.71);
      // Wet obsidian ink core right under the moving bristle tip + 5 directional ink splatter drops
      b.put(...tp,...dir,s.r*.038,s.r*.024,2.4*alpha,.55,0,.19);
      for(let k=0;k<5;k++){
        const spread=(k-2)*.38, back=.025+k*.018;
        const ox=-tip.dx*back-tip.dy*spread*.04, oy=-tip.dy*back+tip.dx*spread*.04;
        const sp=onSeal(s,tip.x*glyphSpan+ox*s.r,tip.y*glyphSpan+oy*s.r,.010);
        const dr=s.r*(.009+.008*((k*3)%5)/5);
        b.put(...sp,...dir,dr*1.15,dr,2.1*alpha,.85,k===2?7:0,(k+.2)/5);
      }
    }
    // 5. Implosion vacuum glint ring right at the center of 鳥 during the 0.14s hush
    if(this.phase==='release' && this.implosion>0.02){
      const imp=this.implosion;
      const coreP=onSeal(s,0,0,.025);
      const sr=s.r*(.18+.22*imp);
      this.fx.put(...coreP,...s.u,sr,sr,2.6*imp,.08,12,.21);
      this.fx.put(...coreP,...s.v,sr*.72,sr*.72,2.1*imp,.92,12,.63);
    }
    if(this.phase==='release' && !this.hasSdfGlyph){
      for(let i=0;i<this.bird.length;i+=4){
        const b0=this.bird[i],g=b0.g,p=onSeal(s,g.x*r*1.22,g.y*r*1.22,.003),d=add(mul(s.u,g.dx),mul(s.v,g.dy));
        b.put(...p,...d,r*.052,r*.016,2.1*alpha,.45,0,b0.seed);
      }
    }
    // 6. Post-Implosion Explosive Release Shockwave (fires cleanly at t >= 0.14s!)
    if(this.phase==='release'&&this.exploded&&postBlast<.80){
      const q=postBlast/.80, fade=(1-q)*(1-q*.35);
      const shockR=s.r*(.86+q*1.05);
      for(let k=0;k<3;k++){
        const sa=k*(TAU/3)+q*1.5;
        rf.addShockwaveArc(s.c,s.u,s.v,s.n,shockR*(.96+.04*k),s.r*(.060+.038*(1-q)),sa,2.45,
          k===0?0:k===1?1:2,fade*(k===1?1.2:.98),.19+k*.29,1,36);
      }
      for(let i=0;i<36;i++){
        const a=i*TAU/36+q*.5,rr=shockR*(.92+.16*rng()),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-q*.05);
        const isStar=i%3===0;
        const rad=s.r*(isStar?.062:.014+.010*rng());
        this.fx.put(...p,...s.u,rad*(isStar?1:1.12),rad,fade*(isStar?2.1:2.2),isStar?(i%6===0?.92:.08):.88,isStar?12:i%5===0?7:0,i/36);
      }
    }
  }
  palmStream(s){
    // 4 continuous silky 3D Bezier-helix qi ribbons flowing from palm to orbiting points on the outer Enso rim
    const a=this.livePalm,c=this.charge,t=this.time,b=this.decor,rb=this.backRibbons,r=s.r,eye=this.head;
    const modes=[1,0,1,2];
    for(let strand=0;strand<4;strand++){
      const ringA=strand*TAU/4+t*(.74+.36*c);
      const target=onSeal(s,Math.cos(ringA)*r*1.04,Math.sin(ringA)*r*1.04,-.012);
      const midA=ringA-.58;
      const ctrl=add(lerp3(a,target,.52),add(mul(s.u,Math.cos(midA)*r*.44),mul(s.v,Math.sin(midA)*r*.44)));
      rb.addBezierHelix(
        a,ctrl,target,s.u,s.v,eye,
        (.011+.009*c)*(strand===1?1.35:1),
        .010+.014*c,1.6,-t*4.2+strand*1.57,
        modes[strand],.62+.38*c,.17+strand*.23,c,28
      );
      // A few floating star-glints and wet ink droplets riding along the Bezier curve
      for(let k=0;k<3;k++){
        const u=((k/3)+t*(.75+.25*c))%1,inv=1-u;
        const px=inv*inv*a[0]+2*inv*u*ctrl[0]+u*u*target[0];
        const py=inv*inv*a[1]+2*inv*u*ctrl[1]+u*u*target[1];
        const pz=inv*inv*a[2]+2*inv*u*ctrl[2]+u*u*target[2];
        const env=Math.sin(Math.PI*u);
        const isStar=k===0;
        const sz=isStar?.018+.010*c:.007+.004*c;
        b.put(px,py,pz,...s.u,sz*(isStar?1:1.12),sz,(.75+.75*c)*env,isStar?(strand%2===0?.08:.92):.88,isStar?12:strand===2?7:0,(strand*3+k)/12);
      }
    }
    // Soft curved qi halo encircling the palm center
    const palmSeal={c:a,u:s.u,v:s.v,n:s.n};
    rb.addOrbitalArc(palmSeal,.036,t*2.6,3.8,.010+.006*c,.004,0,1,.65+.35*c,.33,c,22);
    rb.addOrbitalArc(palmSeal,.042,-t*2.1+2.2,3.4,.008+.005*c,.003,0,2,.55+.35*c,.71,c,22);
  }
  paintCombat(){
    const b=this.traces,fx=this.fx,rb=this.backRibbons,rf=this.frontRibbons,rng=random(194),shot=this.shot,t=this.time,eye=this.head;
    adversary(this.enemyCloud,this.enemy,t,this.enemyHP,shot?clamp(shot.age/1.15):0,this.hitFlash);
    // 1. Ambient Eastern battle-arena mist (tuned for Quest 3S <= 4.5 m^2 overdraw budget)
    for(let i=0;i<14;i++){
      const u=i/13, mx=mix(-1.25,1.55,u)+.16*Math.sin(t*.45+i), my=-.58+.18*Math.sin(i*1.7+t*.3), mz=-1.45-u*2.1;
      b.put(mx,my,mz, 1,.06*Math.sin(t+i),0, .17+rng()*.12,.062+rng()*.038, .48,.85, 11, rng());
    }
    // 2. Dokkaebi-bul counterattack projectile: curved crimson/amber spirit-flame ribbon + ink flames & gold stars
    if(shot?.p){
      const dir=unit(sub(shot.from,shot.to));
      const pts=[];
      for(let k=0;k<=14;k++){
        const u=k/14,p=add(shot.p,mul(dir,(1-u)*.38));
        pts.push([p[0]+Math.sin(u*8-t*10)*.022*(1-u),p[1]+Math.cos(u*7-t*9)*.022*(1-u),p[2]]);
      }
      rf.addBillboardTrail(pts,eye,.036,.008,3,1.15,.44,1);
      for(let i=0;i<84;i++){
        const u=rng(),p=add(shot.p,mul(dir,u*.34)),a=rng()*TAU,k=(.015+.13*u)*Math.sqrt(rng());
        const px=p[0]+Math.cos(a)*k, py=p[1]+Math.sin(a)*k+.04*Math.sin(u*8-t*9), pz=p[2];
        if(i%6===0){
          fx.put(px,py,pz, 1,0,0, .036,.036, (1-u)*2.2, .95, 12, rng());
        }else if(i%4===1){
          const dr=.008+.011*rng();
          b.put(px,py,pz, 1,0,0, dr*1.12,dr, (1-u)*2.5,.90, 0, rng());
        }else{
          b.put(px,py,pz, dir[0],dir[1]+.4*Math.sin(a),dir[2], .034,.018, (1-u)*2.4,.62, i%3===0?10:i%2===0?2:0, rng());
        }
      }
    }
    // 3. 9-Crow Flock Flight Wake: continuous 3D curved Sumi-e + Electric Cyan ribbons + fluttering ink feathers!
    if(this.phase==='release'){
      const fadeEnd=1-smooth((this.phaseTime-2.75)/.35);
      if(this.trail.length>=3 && fadeEnd>.01){
        for(let f=0;f<9;f++){
          const raw=[];
          for(let k=0;k<this.trail.length;k++){
            const fp=this.trail[k].flock?.[f];
            if(fp)raw.push(fp);
          }
          if(raw.length>=3){
            const nPts=raw.length, isLead=f===0;
            const pts=[];
            // Organic sinuous S-curve calligraphic wave along each crow's wake (zero straight wires!)
            for(let k=0;k<nPts;k++){
              const u=k/(nPts-1), env=Math.sin(Math.PI*u);
              const wave=u*Math.PI*2.4-t*5.4+f*1.37;
              const amp=(isLead?.058:.042)*env;
              const p=raw[k];
              pts.push([
                p[0]+Math.cos(wave)*amp*.65,
                p[1]+Math.sin(wave)*amp,
                p[2]+Math.sin(wave*.7+f)*amp*.35
              ]);
            }
            const mode=isLead?0:(f%3===0?2:0);
            const wHead=isLead?.050:.032-.0014*f;
            const wTail=isLead?.010:.006;
            rb.addBillboardTrail(pts,eye,wHead,wTail,mode,(.86-.038*f)*fadeEnd,.11+f*.11,1.05);
            if(isLead){
              // Braided golden-celadon spirit silk counter-wave around the lead crow
              const silkPts=[];
              for(let k=0;k<nPts;k++){
                const u=k/(nPts-1), env=Math.sin(Math.PI*u);
                const wave=u*Math.PI*2.8-t*6.2+2.4;
                const p=raw[k];
                silkPts.push([
                  p[0]-Math.cos(wave)*.052*env,
                  p[1]-Math.sin(wave)*.064*env,
                  p[2]+Math.cos(wave*.8)*.024*env
                ]);
              }
              rb.addBillboardTrail(silkPts,eye,.028,.005,1,.82*fadeEnd,.83,1.15);
            }
          }
        }
      }
      // Organic fluttering ink feathers, round droplets, and occasional star-glints (ZERO straight needles!)
      for(const v of this.trail){
        const age=t-v.time;if(age>.74)continue;
        const fade=1-age/.74, pts=v.flock??[v.p];
        for(let f=0;f<pts.length;f++){
          const fp=pts[f];
          const flutter=t*5.5+f*1.9+age*8;
          const fx0=fp[0]+(rng()-.5)*.09+Math.cos(flutter)*.025*age;
          const fy0=fp[1]-.12*age*age+(rng()-.5)*.06+Math.sin(flutter)*.02*age;
          const fz0=fp[2]+(rng()-.5)*.07;
          const ax=Math.cos(flutter*.7), ay=-.35+.45*Math.sin(flutter), az=Math.sin(flutter*.7)*.6;
          const fLen=.030+.020*rng(), fWid=.008+.006*rng();
          b.put(fx0,fy0,fz0, ax,ay,az, fLen,fWid*.62, 2.1*fade,.36, 0, rng());
          b.put(fx0-.004*ay,fy0+.004*ax,fz0, ax+.18*ay,ay-.18*ax,az, fLen*.85,fWid*1.32, 1.38*fade,.78, f%3===0?4:1, rng());
          if((f+Math.floor(age*30))%2===0){
            const dx=fp[0]+(rng()-.5)*.12, dy=fp[1]-.16*age*age+(rng()-.5)*.08, dz=fp[2]+(rng()-.5)*.08;
            const dr=.006+.009*rng();
            b.put(dx,dy,dz, 1,0,0, dr*1.10,dr, 2.0*fade,.92, rng()<.78?0:1, rng());
          }
          if(f===0&&age<.48){
            b.put(fp[0],fp[1],fp[2], 1,0,0, .14+.12*age,.06+.05*age, .55*fade,.85, 11, rng());
            if(Math.floor(age*25)%2===0){
              fx.put(fp[0]+(rng()-.5)*.12,fp[1]+(rng()-.5)*.10,fp[2], 1,0,0, .034,.034, 1.85*fade, rng()>.45?.90:.08, 12, rng());
            }
          }
        }
      }
    }
    // 4. Skill Impact Burst: Blade & Soul 3D Crescent Sword-Arc Slashes + Curved Shockwave Rings + 4-Point Star Flash!
    for(const imp of this.impacts){
      const age=t-imp.time,fade=1-smooth((age-.42)/1.03);
      const isEnemy=imp.side<0;
      const toEye=unit(sub(eye,imp.p));
      const baseR=unit(cross([0,1,0],toEye));
      const baseU=cross(toEye,baseR);
      if(age<.78){
        const q=age/.78, sFade=(1-q)*(1-q*.25);
        // 3 crossing tilted 3D Blade & Soul Crescent Sword-Arc Slashes (ZERO straight X-sticks!)
        const slashSpecs=[
          {tilt:.42, yaw:.28, r:.34+.34*q, start:-1.25+q*2.35, span:2.35, w:.115*(1-.45*q), mode:isEnemy?3:1, seed:.19},
          {tilt:-.68, yaw:-.35, r:.30+.30*q, start:1.15-q*2.55, span:2.20, w:.095*(1-.42*q), mode:isEnemy?3:0, seed:.53},
          {tilt:.12, yaw:.52, r:.26+.38*q, start:2.85+q*2.15, span:1.95, w:.068*(1-.48*q), mode:isEnemy?3:2, seed:.81}
        ];
        for(const sl of slashSpecs){
          const ct=Math.cos(sl.tilt),st=Math.sin(sl.tilt);
          const cy=Math.cos(sl.yaw),sy=Math.sin(sl.yaw);
          const r0=add(mul(baseR,ct),mul(baseU,st));
          const u0=add(mul(baseR,-st),mul(baseU,ct));
          const sr=unit(add(mul(r0,cy),mul(toEye,sy)));
          const sn=unit(add(mul(toEye,cy),mul(r0,-sy)));
          const su=unit(cross(sn,sr));
          rf.addCrescentSlash(imp.p,sr,su,sn,sl.r,sl.start,sl.span,sl.w,.065,sl.mode,sFade*1.28,sl.seed,1.3,32);
        }
        // Expanding curved 3D shockwave ring arcs
        const ringR=.16+.58*q;
        rf.addShockwaveArc(imp.p,baseR,baseU,toEye,ringR,.052*(1-.45*q),q*2.2,3.4,isEnemy?3:1,sFade*1.05,.27,1.2,36);
        rf.addShockwaveArc(imp.p,baseR,baseU,toEye,ringR*.90,.042*(1-.45*q),q*2.2+3.14,3.1,0,sFade*.95,.61,1.0,36);
        // Core blazing 4-point star-flare flash & scattering star-sparks
        if(age<.40){
          const flash=1-age/.40;
          fx.put(imp.p[0],imp.p[1],imp.p[2]+.14, 1,0,0, .30+.22*age,.30+.22*age, flash*2.9, isEnemy?.95:.08, 12, .17);
        }
        for(let i=0;i<18;i++){
          const a=i*TAU/18+q*.8, h=(rng()-.5)*.85, ax=Math.cos(a), ay=h, az=Math.sin(a)*.7;
          const distR=(.08+.56*q)*(.55+.65*rng());
          const sr=.045+.040*rng();
          fx.put(imp.p[0]+ax*distR,imp.p[1]+ay*distR,imp.p[2]+.10+az*distR, 1,0,0,
            sr,sr, sFade*2.4, isEnemy?.95:(i%3===0?.92:.08), 12, rng());
        }
      }
      for(let i=0;i<20;i++){
        const a=i*TAU/20+age*.8, rr=(.08+.48*age)*(.6+.5*rng());
        b.put(imp.p[0]+Math.cos(a)*rr,imp.p[1]+Math.sin(a)*rr*.7,imp.p[2], -Math.sin(a),Math.cos(a),0,
          .18+.12*age,.08+.05*age, fade*.78,.85, 11, rng());
      }
      for(let i=0;i<145;i++){
        const a=rng()*TAU,h=rng()*2-1,rr=Math.sqrt(1-h*h),speed=(.14+.94*rng())*Math.min(age,.92);
        const ax=Math.cos(a)*rr,az=Math.sin(a)*rr;
        const px=imp.p[0]+ax*speed, py=imp.p[1]+h*speed-age*age*.28, pz=imp.p[2]+az*speed;
        if(i%3===0){
          const dr=(.008+.015*rng())*(1+age*.22);
          b.put(px,py,pz, 1,0,0, dr*1.12,dr, fade*2.3,.92, i%9===0?7:0, rng());
        }else{
          const fLen=(.020+.046*rng())*(1+age*.22), fWid=.007+rng()*.011;
          b.put(px,py,pz, ax+.25*h,h-.3*age,az, fLen,fWid, fade*2.2,i%2===0?.40:.78, i%4===0?1:0, rng());
        }
      }
    }
  }
  paintHand(h){
    const b=this.handsCloud, j=h.joints;
    if(j){
      const wrist=j.wrist, idx=j['index-finger-phalanx-proximal'], pnk=j['pinky-finger-phalanx-proximal'];
      const mid=j['middle-finger-phalanx-proximal']|| (idx&&pnk?lerp3(idx,pnk,.35):null);
      const rngK=j['ring-finger-phalanx-proximal']|| (idx&&pnk?lerp3(idx,pnk,.68):null);
      // 1. Soft anatomical palm surface mask (손바닥/손등 살결 모양의 자연스러운 입체 마스크)
      if(wrist&&idx&&pnk){
        const across=sub(pnk,idx), palmW=Math.max(.045,len(across));
        const uAxis=unit(across), vAxis=unit(sub(lerp3(idx,pnk,.5),wrist));
        const knuckles=[idx, mid||lerp3(idx,pnk,.33), rngK||lerp3(idx,pnk,.66), pnk];
        // Interpolate a smooth fleshy palm pad from wrist cuff to the curved knuckle arch
        for(let row=0;row<6;row++){
          const v=(row+.35)/6;
          // Wrist is slightly narrower than the metacarpal knuckle arch
          const widthScale=.72+.30*Math.sin(v*Math.PI*.65);
          for(let col=0;col<7;col++){
            const u=col/6;
            const kFloat=u*3, kIdx=Math.min(2,Math.floor(kFloat)), kFrac=kFloat-kIdx;
            const topPt=lerp3(knuckles[kIdx],knuckles[kIdx+1],kFrac);
            const botPt=add(wrist,mul(uAxis,(u-.48)*palmW*widthScale));
            const pt=lerp3(botPt,topPt,v);
            const edge=Math.abs(u-.5)*2;
            const rMajor=palmW*(.21-.03*edge), rMinor=palmW*(.18-.02*edge);
            // Soft warm ivory skin-mask core (Tone 3) with subtle ink-wash contour rim (Tone 5 / Tone 4)
            const isRim=edge>.78||row===0;
            b.put(...pt,...vAxis, rMajor,rMinor, isRim?.95:1.55, .78, isRim?5:3, (row*7+col)/42);
          }
        }
        // Thenar eminence (엄지 뿌리 두툼한 손바닥 근육 볼륨)
        const thMeta=j['thumb-metacarpal']||lerp3(wrist,idx,.42);
        const thProx=j['thumb-phalanx-proximal']||lerp3(wrist,idx,.75);
        for(let k=0;k<6;k++){
          const t=k/5, tp=lerp3(lerp3(wrist,thMeta,.5),lerp3(thProx,idx,.42),t);
          const rad=palmW*(.19-.04*t);
          b.put(...tp,...vAxis, rad*1.15,rad*.92, 1.45,.76, k===5?5:3, .13+k*.11);
        }
      }
      // 2. Fleshy, tapered cylindrical fingers & rounded fingertip pads (뼈다귀 선이 아닌 실제 손가락 볼륨 마스크)
      const fingerSpecs=[
        ['thumb', ['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'], .0125, .0092],
        ['index', ['index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip'], .0108, .0076],
        ['middle',['middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip'], .0114, .0080],
        ['ring',  ['ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip'], .0105, .0074],
        ['pinky', ['pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'], .0092, .0065]
      ];
      for(let fIdx=0;fIdx<fingerSpecs.length;fIdx++){
        const [fName,names,rBase,rTip]=fingerSpecs[fIdx];
        const chain=names.map(n=>j[n]).filter(Boolean);
        if(fName==='thumb'&&chain.length===1&&wrist)chain.unshift(lerp3(wrist,idx||wrist,.38));
        const segs=chain.length-1;
        for(let i=0;i<segs;i++){
          const p0=chain[i], p1=chain[i+1];
          const d=sub(p1,p0), l=len(d);if(l<.0005)continue;
          const axis=unit(d), steps=Math.max(4,Math.ceil(l/.006));
          for(let s=0;s<=steps;s++){
            const t=s/steps, globalT=(i+t)/segs;
            const pt=lerp3(p0,p1,t);
            const rad=mix(rBase,rTip,globalT)*(.96+.06*Math.sin(t*Math.PI));
            // Soft contour shading under each phalanx + warm natural hand mask fill
            b.put(...pt,...axis, rad*1.32,rad*1.06, .75,.72, 5, (fIdx*19+i*7+s)%31/31);
            b.put(...pt,...axis, rad*1.18,rad*.92, 1.65,.68, 3, (fIdx*23+i*11+s)%37/37);
          }
        }
        // Rounded fingertip pad & subtle fingernail highlight
        const tipPt=chain[segs], prevPt=chain[segs-1];
        if(tipPt){
          const dir=prevPt?unit(sub(tipPt,prevPt)):[0,1,0];
          b.put(...tipPt,...dir, rTip*1.12,rTip*.98, 1.75,.62, 3, .41+fIdx*.1);
        }
      }
    }
    // 3. Subtle wet ink-brush tip or palm qi aura
    const p=h.open?h.palm:h.tip;
    if(p){
      if(h.open){
        b.put(...p,1,0,0,.028,.028,1.15,.82,11,.35);
        b.put(...p,1,0,0,.014,.014,1.35,.75,9,.52);
      }else if(h.draw){
        b.put(...p,1,0,0,.011,.009,2.1,.78,0,.48);
        b.put(...p,1,0,0,.012,.012,1.25,.75,9,.72);
      }else if(!j){
        b.put(...p,1,0,0,.014,.011,1.4,.68,3,.5);
      }
    }
  }
}

