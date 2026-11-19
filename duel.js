import {TAU,clamp,mix,smooth,random,add,sub,mul,unit,len,dot,cross,dist,lerp3,onSeal,fitSeal,palmAtSeal} from './gesture.js?v=d556bb3';
import {WorldWash} from './world-wash.js?v=d556bb3';
import {InkSpray} from './ink-spray.js?v=d556bb3';
import {SplatBatch,springStep,spiral} from './ink.js?v=d556bb3';
import {landscape,crowForm,glyphSamples,adversary,stroke} from './forms.js?v=d556bb3';
import {InkSound} from './sound.js?v=d556bb3';

export const CHARGE_SECONDS=1.35;
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
    this.hasSdfGlyph=false;this.sealVisual=null;
    const rng=random(306),glyph=glyphSamples(this.bird.length,rng);
    this.bird.forEach((b,i)=>{
      const a=rng()*TAU;
      b.g=glyph[i];b.a=a;b.f=rng();b.orbit=.24+.64*rng();
      b.pos=[0,0,0];b.vel=[0,0,0];b.ax=[1,0,0];
    });
    this.groups=[
      {batch:this.land,alpha:1,scenery:true},{batch:this.enemyCloud,alpha:1},{batch:this.traces,alpha:1},
      {batch:this.brush.marks,alpha:1,sheet:this.brush},{batch:this.decor,alpha:1},{batch:this.flow,alpha:1},{batch:this.fx,alpha:1},{batch:this.handsCloud,alpha:1},{batch:this.spray.marks,alpha:1}
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
  reset(){
    this.spray.clear();this.time=0;this.enemyHP=3;this.selfHP=3;this.hitFlash=0;this.hurtFlash=0;
    this.enemy=[.83,-.16,-3.42];this.head=[0,0,0];this.shot=null;this.nextShot=Infinity;
    this.hasCast=false;this.handData=[];this.impacts=[];this.demo=false;this.resetCast();
  }
  resetCast(keepInk=false){
    this.phase='ready';this.phaseTime=0;this.charge=0;this.seal=null;this.sealVisual=null;this.owner=null;
    this.brush.end();if(!keepInk)this.brush.reset();
    this.abandoned=keepInk?this.time:null;this.spray.stopMotion();this.wasDrawing=false;this.missing=0;this.previousTip=null;this.trail=[];this.struck=false;
    this.needLift=false;this.livePalm=null;this.lastSpringRoot=null;this.traceAlpha=1;this.checkAt=0;
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
    // Snap user loop into a clean calligraphic Enso ring; Layer 1 SVG-SDF shader renders 鳥 crisply on top.
    this.brush.close(ps[0],this.time,seal,!this.hasSdfGlyph);this.spray.stopMotion();
    this.owner=null;this.enter('seal');
  }
  chargeInput(dt,hands){
    const h=hands.find(h=>palmAtSeal(h,this.seal));
    this.livePalm=h?.palm??null;
    if(h){
      this.charge=Math.min(1,this.charge+dt/CHARGE_SECONDS);
      if(this.phase!=='charge')this.enter('charge');
      if(this.charge>=1){
        this.hasCast=true;this.formation();
        // Stage 1 of Burst -> Gather Morph: explosive outward & forward burst from the 鳥 calligraphy strokes!
        const s=this.seal, toEnemy=unit(sub(this.enemy,s.c));
        for(let i=0;i<this.bird.length;i++){
          const b=this.bird[i], g=b.g;
          const outLen=Math.hypot(g.x,g.y)||.001;
          const rx=g.x/outLen, ry=g.y/outLen;
          const swirlX=-ry*s.sign, swirlY=rx*s.sign;
          const kick=.85+1.35*b.f, fwd=.75+.95*b.f;
          for(let k=0;k<3;k++){
            b.vel[k]=(s.u[k]*(rx*.75+swirlX*.45)+s.v[k]*(ry*.75+swirlY*.45))*kick + toEnemy[k]*fwd;
          }
        }
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
    const writeProgress=clamp(.18+(t-this.sealBorn)*.82+charge*.55,0,1);
    if(!this.hasSdfGlyph)this.brush.writeGlyph(writeProgress,t);
    // Align Layer 2 splat coordinates exactly with the Layer 1 3D SDF quad (span = r * 0.93 -> diameter = r * 1.86)
    const glyphSpan=this.hasSdfGlyph?s.r*1.86:s.r*1.22;
    for(let i=0;i<this.bird.length;i++){
      const b=this.bird[i],g=b.g;
      const strokeReady=clamp((writeProgress-(g.order??0)*.72)*2.1,0,1);
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
        // Layer 1 SVG-SDF quad owns the crisp jet-black 鳥 strokes & blazing cyan rim.
        // Keep Layer 2 ultra-clean: gentle inward-spiraling ink wisps while gathering + sparse jewel-like star glints.
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
        const tone=decorative&&q<.88?(i%14===0?9:7):(g.dry&&i%3===0?1:0);
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
    const pose=this.flight(t),{root,scale}=pose;
    const flockPoses=this.flockFlight(t,pose);
    const grow=smooth(t/.52);
    const sight=unit(sub(root,this.head));
    const carries=flockPoses.map((fp,id)=>sub(fp.root,this.flockPrev[id]));
    const trig=flockPoses.map(fp=>({
      cy:Math.cos(fp.yaw),sy:Math.sin(fp.yaw),
      cp:Math.cos(fp.pitch??0),sp:Math.sin(fp.pitch??0),
      co:Math.cos(fp.bank),si:Math.sin(fp.bank),
      wCos:Math.cos(fp.flap),wSin:Math.sin(fp.flap),
      root:fp.root,scale:fp.scale
    }));
    const burstGather=smooth((t-.06)/.26);
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
      // During early burst, align stretched ink splats along flight velocity before snapping to feather axes
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
    if(!old||this.time-old.time>.038){
      this.trail.push({
        p:root.slice(),
        flock:flockPoses.map(fp=>fp.root.slice()),
        time:this.time
      });
    }
    if(this.trail.length>32)this.trail.shift();
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
    const s=this.seal,t=this.phaseTime,releasing=this.phase==='release';
    const sealed=this.phase==='seal'||this.phase==='charge',finish=this.phase==='recover'||this.phase==='win'||this.phase==='lose';
    const alpha=finish?0:releasing?1-smooth((t-.52)/1.15):1;
    this.groups[3].alpha=this.abandoned===null?alpha:1-smooth((this.time-this.abandoned-.85)/1.45);
    this.sealVisual=null;
    if(s && (sealed||releasing)){
      const writeProgress=sealed?clamp(.18+(this.time-this.sealBorn)*.85+this.charge*.55,0,1):1;
      const dissolve=releasing?clamp(t/.58,0,1):0;
      const sealAlpha=releasing?1-smooth((t-.32)/.42):1;
      if(sealAlpha>.002){
        this.sealVisual={seal:s,writeProgress,charge:sealed?this.charge:1,dissolve,alpha:sealAlpha};
      }
      this.sealDetails(s,alpha);
      if(sealed)this.formation();
      else {
        const k=this.crowScale??.2,fade=(1-smooth((t-2.86)/.26));
        const burstStretch=1+(1-smooth(t/.28))*.85;
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
  sealDetails(s,alpha){
    if(alpha<=0)return;
    const b=this.decor,r=s.r,t=this.time,c=this.charge, rng=random(863);
    // 1. Silky continuous outer summoning mist ring (keeps 鳥 interior completely crisp!)
    for(let i=0;i<30;i++){
      const a=TAU*i/30+t*.22, rr=r*(1.10+.36*((i*7)%13)/13);
      const p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-.022+.014*Math.sin(t*1.8+i));
      const d=add(mul(s.u,-Math.sin(a)),mul(s.v,Math.cos(a)));
      b.put(...p,...d,r*.36,r*.14,alpha*(.28+.24*c),.84,11,rng());
    }
    // 2. Crisp outer calligraphic talisman rings (no inner ring overlapping 鳥!)
    for(let band=0;band<2;band++)for(let i=0;i<104;i++){
      const a=TAU*i/104 + band*.35 + (band===1?t*.16:-t*.08);
      if(band===0&&Math.sin(a*3-.5)<-.45||band===1&&i%10>3)continue;
      const rr=r*(band===0?1.13:1.25),co=Math.cos(a),si=Math.sin(a),p=onSeal(s,co*rr,si*rr,.002*band);
      const d=add(mul(s.u,-si),mul(s.v,co)), w=r*(band===0?.0085:.011);
      // Outer broken ring uses deep obsidian ink (0) + antique gold-dust talisman ticks (7)
      const tone=band===0?0:(i%20<4?7:4);
      b.put(...p,...d,r*.042,w,(band===0?.95:1.15)*alpha*(.65+.35*c),.42,tone,rng());
    }
    // 3. Orbiting wet ink droplets, Option A razor cyan light blades (9), and gold/cyan star flares (12)
    for(let i=0;i<32;i++){
      const a=TAU*rng()+t*(.28+(i%3)*.12),rr=r*(1.06+rng()*.38),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,.012);
      const dropR=r*(.010+.008*rng());
      b.put(...p,...s.u,dropR*1.12,dropR,alpha*1.35,.88,i%7===0?7:0,rng());
    }
    const blades=16+Math.floor(c*24);
    for(let i=0;i<blades;i++){
      const a=TAU*i/blades+t*(1.75+.6*c), rr=r*(1.03+.20*Math.sin(i*2.3+t*3));
      const co=Math.cos(a),si=Math.sin(a),p=onSeal(s,co*rr,si*rr,.016);
      const d=add(mul(s.u,-si+.22*co),mul(s.v,co+.22*si));
      b.put(...p,...d,r*(.13+.10*c),r*.0085,alpha*(1.05+1.35*c),.22,9,i/blades);
      if(i%3===0){
        const starR=r*(.048+.038*c);
        b.put(...p,...s.u,starR,starR,alpha*(.90+1.15*c),i%6===0?.92:.08,12,(i+.5)/blades);
      }
    }
    // 4. Legacy brush-tip flash only if SDF glyph hasn't loaded yet
    const tip=this.brush.activeTip;
    if(tip && !this.hasSdfGlyph){
      const tp=onSeal(s,tip.wx,tip.wy,.009);
      const td=add(mul(s.u,tip.dx),mul(s.v,tip.dy));
      b.put(...tp,...td,r*.12,r*.012,2.4*alpha,.25,9,.37);
      b.put(...tp,...s.v,r*.035,r*.035,2.2*alpha,.85,0,.71);
    }
    if(this.phase==='release' && !this.hasSdfGlyph){
      for(let i=0;i<this.bird.length;i+=4){
        const b0=this.bird[i],g=b0.g,p=onSeal(s,g.x*r*1.22,g.y*r*1.22,.003),d=add(mul(s.u,g.dx),mul(s.v,g.dy));
        b.put(...p,...d,r*.052,r*.016,2.1*alpha,.45,0,b0.seed);
      }
    }
    // 5. Explosive summoning shockwave ring on release: cyan light blades + gold star-flares + ink splatter ring
    if(this.phase==='release'&&this.phaseTime<.82){
      const q=this.phaseTime/.82, fade=(1-q)*(1-q*.35);
      for(let i=0;i<132;i++){
        const a=i*TAU/132,rr=r*(.92+q*.82),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-q*.06);
        const d=add(mul(s.u,-Math.sin(a)),mul(s.v,Math.cos(a)));
        const isStar=i%11===0, isBlade=i%3===0;
        this.fx.put(...p,...d,
          r*(isStar?.068:isBlade?.11:.026),
          r*(isStar?.068:isBlade?.009:.013),
          fade*(isStar?2.1:2.3),
          isStar?(i%22===0?.92:.08):.62,
          isStar?12:isBlade?9:i%5===0?7:0,
          i/132);
      }
    }
  }
  palmStream(s){
    // Flow coherent helical qi ribbons from palm into orbiting points on the outer Enso rim (never cutting across 鳥!)
    const a=this.livePalm,c=this.charge,t=this.time,b=this.decor,r=s.r;
    const strands=4, perStrand=28;
    for(let strand=0;strand<strands;strand++){
      const ringA=strand*TAU/strands+t*(.72+.35*c);
      const target=onSeal(s,Math.cos(ringA)*r*1.04,Math.sin(ringA)*r*1.04,-.015);
      // Outward control point arcs gracefully around the Enso rim instead of crossing the center glyph
      const midA=ringA-.55;
      const ctrl=add(lerp3(a,target,.52),add(mul(s.u,Math.cos(midA)*r*.42),mul(s.v,Math.sin(midA)*r*.42)));
      for(let j=0;j<perStrand;j++){
        const i=strand*perStrand+j;
        const u=(j/perStrand+t*(.72+.28*c))%1;
        const inv=1-u;
        // Quadratic Bezier point + tight helical twist
        const bx=inv*inv*a[0]+2*inv*u*ctrl[0]+u*u*target[0];
        const by=inv*inv*a[1]+2*inv*u*ctrl[1]+u*u*target[1];
        const bz=inv*inv*a[2]+2*inv*u*ctrl[2]+u*u*target[2];
        const tx=2*inv*(ctrl[0]-a[0])+2*u*(target[0]-ctrl[0]);
        const ty=2*inv*(ctrl[1]-a[1])+2*u*(target[1]-ctrl[1]);
        const tz=2*inv*(ctrl[2]-a[2])+2*u*(target[2]-ctrl[2]);
        const phi=u*TAU*1.8+strand*TAU/strands-t*3.8;
        const rr=(.008+.016*Math.sin(Math.PI*u))*(1-.4*u);
        const px=bx+s.u[0]*Math.cos(phi)*rr+s.v[0]*Math.sin(phi)*rr;
        const py=by+s.u[1]*Math.cos(phi)*rr+s.v[1]*Math.sin(phi)*rr;
        const pz=bz+s.u[2]*Math.cos(phi)*rr+s.v[2]*Math.sin(phi)*rr;
        const dir=unit([tx,ty,tz]);
        const isBlade=strand===0||strand===1, isMist=strand===3, isStar=j%10===0, isDrop=j%7===0;
        const lenS=isStar?.018+.010*c:isBlade?.024+.014*c:isMist?.034:isDrop?.007:.013+.005*c;
        const widS=isStar?.018+.010*c:isBlade?.0036:isMist?.016:isDrop?.0065:.004;
        const tone=isStar?12:isBlade?9:isMist?11:strand===2?7:0;
        const envelope=Math.sin(Math.PI*u);
        b.put(px,py,pz,...dir,lenS,widS,(.55+.75*c)*envelope,isStar?(strand%2===0?.92:.08):isDrop?.88:.56,tone,i/(strands*perStrand));
      }
    }
    for(let i=0;i<24;i++){
      const phi=TAU*i/24-t*2.8,rr=.032+.006*Math.sin(t*6+i);
      const p=add(a,add(mul(s.u,Math.cos(phi)*rr),mul(s.v,Math.sin(phi)*rr)));
      const d=add(mul(s.u,-Math.sin(phi)),mul(s.v,Math.cos(phi)));
      const isStar=i%6===0;
      b.put(...p,...d,isStar?.018:i%3===0?.020:.007,isStar?.018:i%3===0?.0038:.006,1.05,isStar?.88:.72,isStar?12:i%3===0?9:i%2===0?7:0,i/24);
    }
  }
  paintCombat(){
    const b=this.traces,fx=this.fx,rng=random(194),shot=this.shot,t=this.time;
    adversary(this.enemyCloud,this.enemy,t,this.enemyHP,shot?clamp(shot.age/1.15):0,this.hitFlash);
    // 1. Ambient Eastern battle-arena mist & subtle floating cyan/gold light motes
    for(let i=0;i<32;i++){
      const u=i/31, mx=mix(-1.35,1.65,u)+.18*Math.sin(t*.45+i), my=-.62+.22*Math.sin(i*1.7+t*.3), mz=-1.45-u*2.2;
      b.put(mx,my,mz, 1,.06*Math.sin(t+i),0, .24+rng()*.22,.085+rng()*.065, .44,.85, 11, rng());
    }
    // 2. Dokkaebi-bul counterattack projectile: dark ink flames, crimson/gold spirit fire & gold star-sparks
    if(shot?.p){
      const dir=unit(sub(shot.from,shot.to));
      for(let i=0;i<110;i++){
        const u=rng(),p=add(shot.p,mul(dir,u*.34)),a=rng()*TAU,k=(.015+.14*u)*Math.sqrt(rng());
        const px=p[0]+Math.cos(a)*k, py=p[1]+Math.sin(a)*k+.04*Math.sin(u*8-t*9), pz=p[2];
        if(i%5===0){
          const isStar=i%10===0;
          fx.put(px,py,pz, dir[0]+.3*(rng()-.5),dir[1]+.3*(rng()-.5),dir[2],
            isStar?.038:.058, isStar?.038:.008, (1-u)*2.4, isStar?.95:.30, isStar?12:10, rng());
        }else if(i%4===1){
          const dr=.008+.011*rng();
          b.put(px,py,pz, 1,0,0, dr*1.12,dr, (1-u)*2.6,.90, 0, rng());
        }else{
          b.put(px,py,pz, dir[0],dir[1]+.4*Math.sin(a),dir[2], .038,.016, (1-u)*2.5,.62, i%3===0?10:i%2===0?2:0, rng());
        }
      }
    }
    // 3. Flock flight wake: ink-feather splatters, wet ink droplets, living mist, and Option A cyan light slashes + gold glints
    if(this.phase==='release'){
      for(const v of this.trail){
        const age=t-v.time;if(age>.78)continue;
        const fade=1-age/.78, pts=v.flock??[v.p];
        for(let f=0;f<pts.length;f++){
          const fp=pts[f];
          const flutter=t*5.5+f*1.9+age*8;
          const fx0=fp[0]+(rng()-.5)*.09+Math.cos(flutter)*.025*age;
          const fy0=fp[1]-.12*age*age+(rng()-.5)*.06+Math.sin(flutter)*.02*age;
          const fz0=fp[2]+(rng()-.5)*.07;
          const ax=Math.cos(flutter*.7), ay=-.35+.45*Math.sin(flutter), az=Math.sin(flutter*.7)*.6;
          const fLen=.032+.022*rng(), fWid=.007+.006*rng();
          b.put(fx0,fy0,fz0, ax,ay,az, fLen,fWid*.55, 2.2*fade,.32, 0, rng());
          b.put(fx0-.004*ay,fy0+.004*ax,fz0, ax+.18*ay,ay-.18*ax,az, fLen*.88,fWid*1.35, 1.45*fade,.78, f%3===0?4:1, rng());
          if((f+Math.floor(age*30))%2===0){
            const dx=fp[0]+(rng()-.5)*.12, dy=fp[1]-.16*age*age+(rng()-.5)*.08, dz=fp[2]+(rng()-.5)*.08;
            const dr=.006+.009*rng();
            b.put(dx,dy,dz, 1,0,0, dr*1.12,dr, 2.1*fade,.92, rng()<.78?0:1, rng());
          }
          if(f<4){
            fx.put(fp[0]+(rng()-.5)*.06,fp[1]+(rng()-.5)*.05,fp[2], -.45,-.15,-1, .095+.055*rng(),.0065, 1.85*fade,.20, 9, rng());
          }
          if(f===0&&age<.48){
            b.put(fp[0],fp[1],fp[2], 1,0,0, .14+.12*age,.06+.05*age, .58*fade,.85, 11, rng());
            if(Math.floor(age*25)%2===0){
              fx.put(fp[0]+(rng()-.5)*.12,fp[1]+(rng()-.5)*.10,fp[2], 1,0,0, .036,.036, 1.9*fade, rng()>.45?.90:.08, 12, rng());
            }
          }
        }
      }
    }
    // 4. Skill impact burst rendered in front layer (fx) so BnS cross-slashes & star flares blaze over the target!
    for(const imp of this.impacts){
      const age=t-imp.time,fade=1-smooth((age-.42)/1.03);
      if(age<.72){
        const sFade=1-age/.72;
        // Core blazing 4-point star-flare flash & X-cross hero slash
        if(age<.38){
          const flash=1-age/.38;
          fx.put(imp.p[0],imp.p[1],imp.p[2]+.14, 1,0,0, .34+.22*age,.34+.22*age, flash*3.0, imp.side<0?.95:.08, 12, .17);
          fx.put(imp.p[0],imp.p[1],imp.p[2]+.12, .82,.56,0, .42+.28*age,.022, flash*2.8, .15, imp.side<0?10:9, .31);
          fx.put(imp.p[0],imp.p[1],imp.p[2]+.12, .74,-.66,0, .38+.24*age,.020, flash*2.6, .15, imp.side<0?10:9, .67);
        }
        for(let i=0;i<40;i++){
          const a=i*TAU/40, h=(rng()-.5)*.85, ax=Math.cos(a), ay=h, az=Math.sin(a)*.7;
          const distR=(.05+.52*age)*(.5+.7*rng());
          const isStar=i%4===0;
          fx.put(imp.p[0]+ax*distR,imp.p[1]+ay*distR,imp.p[2]+.10+az*distR, ax,ay,az,
            isStar?.068+.045*rng():.14+.18*rng(),
            isStar?.068+.045*rng():.008+.006*rng(),
            sFade*2.9,
            isStar?(imp.side<0?.95:(i%8===0?.92:.08)):.18,
            isStar?12:(imp.side<0?10:9), rng());
        }
      }
      for(let i=0;i<22;i++){
        const a=i*TAU/22+age*.8, rr=(.08+.48*age)*(.6+.5*rng());
        b.put(imp.p[0]+Math.cos(a)*rr,imp.p[1]+Math.sin(a)*rr*.7,imp.p[2], -Math.sin(a),Math.cos(a),0,
          .18+.12*age,.08+.05*age, fade*.82,.85, 11, rng());
      }
      for(let i=0;i<180;i++){
        const a=rng()*TAU,h=rng()*2-1,rr=Math.sqrt(1-h*h),speed=(.14+.96*rng())*Math.min(age,.92);
        const ax=Math.cos(a)*rr,az=Math.sin(a)*rr;
        const px=imp.p[0]+ax*speed, py=imp.p[1]+h*speed-age*age*.28, pz=imp.p[2]+az*speed;
        if(i%3===0){
          const dr=(.008+.016*rng())*(1+age*.22);
          b.put(px,py,pz, 1,0,0, dr*1.14,dr, fade*2.4,.92, i%9===0?7:0, rng());
        }else{
          const fLen=(.022+.056*rng())*(1+age*.25), fWid=.005+rng()*.011;
          const isLight=i%7===0;
          (isLight?fx:b).put(px,py,pz, ax+.25*h,h-.3*age,az, fLen,fWid, fade*2.3,i%2===0?.38:.76, isLight?(imp.side<0?10:9):i%4===0?1:0, rng());
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
        b.put(...p,1,0,0,.014,.014,1.35,.55,9,.52);
      }else if(h.draw){
        b.put(...p,1,0,0,.011,.009,2.1,.78,0,.48);
        b.put(...p,1,0,0,.015,.006,1.4,.28,9,.72);
      }else if(!j){
        b.put(...p,1,0,0,.014,.011,1.4,.68,3,.5);
      }
    }
  }
}

