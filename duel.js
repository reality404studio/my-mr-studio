import {TAU,clamp,mix,smooth,random,add,sub,mul,unit,len,dot,cross,dist,lerp3,onSeal,fitSeal,palmAtSeal} from './gesture.js';
import {WorldWash} from './world-wash.js';
import {InkSpray} from './ink-spray.js';
import {SplatBatch,springStep,spiral} from './ink.js';
import {landscape,crowForm,glyphSamples,adversary,stroke} from './forms.js';

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
    this.brush=new WorldWash();this.spray=new InkSpray();this.land=landscape();this.enemyCloud=new SplatBatch(1450);
    this.flow=new SplatBatch(4100);this.decor=new SplatBatch(2200);this.handsCloud=new SplatBatch(270);
    this.traces=new SplatBatch(750);this.bird=crowForm();
    const rng=random(306),glyph=glyphSamples(this.bird.length,rng);
    this.bird.forEach((b,i)=>{
      const a=rng()*TAU;
      b.g=glyph[i];b.a=a;b.f=rng();b.orbit=.24+.64*rng();
      b.pos=[0,0,0];b.vel=[0,0,0];b.ax=[1,0,0];
    });
    this.groups=[
      {batch:this.land,alpha:1,scenery:true},{batch:this.enemyCloud,alpha:1},{batch:this.traces,alpha:1},
      {batch:this.brush.marks,alpha:1,sheet:this.brush},{batch:this.decor,alpha:1},{batch:this.flow,alpha:1},{batch:this.handsCloud,alpha:1},{batch:this.spray.marks,alpha:1}
    ];
    this.depthOrder=Uint16Array.from(this.bird,(_,i)=>i);
    this.sortDepth=(i,j)=>this.bird[j].depth-this.bird[i].depth;
    this.tmp=[0,0,0];this.home=[0,0,0];this.rootPrev=[0,0,0];this.hitSerial=0;this.frame=0;
    this.reset();
  }
  reset(){
    this.spray.clear();this.time=0;this.enemyHP=3;this.selfHP=3;this.hitFlash=0;this.hurtFlash=0;
    this.enemy=[.83,-.16,-3.42];this.head=[0,0,0];this.shot=null;this.nextShot=Infinity;
    this.hasCast=false;this.handData=[];this.impacts=[];this.demo=false;this.resetCast();
  }
  resetCast(keepInk=false){
    this.phase='ready';this.phaseTime=0;this.charge=0;this.seal=null;this.owner=null;
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
  }
  interruptTracking(){
    if(this.phase==='trace'){this.brush.end();this.spray.stopMotion();this.resetCast(true);this.needLift=true;}
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
          const s=fitSeal(this.brush.points,eye);
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
      const s=fitSeal(this.brush.points,eye);if(s)this.lock(s);
    }
    if(this.phase==='trace'&&(this.brush.points.length>415 || this.phaseTime>10)){this.resetCast(true);this.needLift=true;}
  }
  lock(seal){
    this.seal=seal;this.sealBorn=this.time;const ps=this.brush.points;
    // Only the remaining gap is bridged. All captured metre-space samples stay intact.
    this.brush.close(ps[0],this.time);this.spray.stopMotion();
    this.owner=null;this.enter('seal');
  }
  chargeInput(dt,hands){
    const h=hands.find(h=>palmAtSeal(h,this.seal));
    this.livePalm=h?.palm??null;
    if(h){
      this.charge=Math.min(1,this.charge+dt/CHARGE_SECONDS);
      if(this.phase!=='charge')this.enter('charge');
      if(this.charge>=1){
        this.hasCast=true;this.formation();this.enter('release');this.crowRoot=this.seal.c.slice();this.lastSpringRoot=this.crowRoot.slice();
        if(this.nextShot===Infinity)this.nextShot=this.time+6.3;
      }
    }else{
      this.charge=Math.max(0,this.charge-dt*.68);
      if(this.phase==='charge')this.enter('seal');
    }
  }
  formation(){
    const s=this.seal,t=this.time,charge=this.charge,cloud=this.flow;
    const settled=smooth((t-this.sealBorn)/1.12);
    for(let i=0;i<this.bird.length;i++){
      const b=this.bird[i],g=b.g, decorative=i%7===0;
      let q=clamp((charge-.13*b.f)/(1-.13*b.f));
      const a=b.a+t*(.27+b.f*.22)*(1-smooth(charge)), radius=s.r*mix(.88+.12*b.f,b.orbit*.78,settled)*(.96+.04*Math.sin(t*2+b.a));
      const gx=g.x*s.r*1.15,gy=g.y*s.r*1.15;
      const ox=Math.cos(a)*radius,oy=Math.sin(a)*radius;
      spiral(this.tmp,ox-gx,oy-gy,-s.r*(.28+.36*b.f),q,s.sign,.65+b.f*.42,b.f);
      const x=gx+this.tmp[0],y=gy+this.tmp[1],z=this.tmp[2]+.008;
      const p=b.pos;
      for(let k=0;k<3;k++){p[k]=s.c[k]+s.u[k]*x+s.v[k]*y+s.n[k]*z;b.vel[k]=0;}
      const ax=mix(-Math.sin(a),g.dx,smooth(q)),ay=mix(Math.cos(a),g.dy,smooth(q));
      const mag=(.021+.016*b.f)*s.r;
      cloud.put(...p,s.u[0]*ax+s.v[0]*ay,s.u[1]*ax+s.v[1]*ay,s.u[2]*ax+s.v[2]*ay,
        mag*(1.45+.58*q),mag*(.42+.35*q),(.34+2.3*q)*(decorative?.57:1),
        .28+b.f*.54,decorative&&q<.94?7:0,b.seed);
    }
  }
  flight(t){
    const s=this.seal,far=unit(sub(s.c,this.head)),scale=clamp(s.r/.24,.56,1.24);
    const perch=add(s.c,[.27*scale,.23*scale,-.48*scale]);
    const emerge=smooth((t-.20)/1.05),dive=smooth((t-1.85)/1.18);
    const root=lerp3(lerp3(s.c,perch,emerge),this.enemy,dive);
    const arch=Math.sin(dive*Math.PI);
    root[0]-=.27*arch;root[1]+=.22*arch;
    if(t<1.85)root[2]+=far[2]*.028*Math.sin(emerge*Math.PI);
    return {root,scale:scale*(.14+.68*smooth((t-.23)/.77)),yaw:mix(.49,-1.05,dive),bank:-.34-.38*arch,
      flap:.30+.69*Math.sin((t-.48)*6.5),dive};
  }
  release(dt){
    const t=this.phaseTime;
    if(t<.25)return;
    const pose=this.flight(t),{root,scale,yaw,bank,flap}=pose;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),co=Math.cos(bank),si=Math.sin(bank);
    const carry=sub(root,this.lastSpringRoot),grow=smooth((t-.25)/.65);
    const wingCos=Math.cos(flap),wingSin=Math.sin(flap);
    const sight=unit(sub(root,this.head));
    for(const b of this.bird){
      const side=b.wing, p=b.p;
      const reach=side?Math.max(0,Math.abs(p[2])-.045):0;
      const z=side?side*(.045+reach*wingCos):p[2], y=p[1]+reach*wingSin;
      const ly=(y*co-z*si)*scale,lz=(y*si+z*co)*scale,lx=p[0]*scale;
      const h=this.home;h[0]=root[0]+lx*cy-lz*sy;h[1]=root[1]+ly;h[2]=root[2]+lx*sy+lz*cy;
      for(let k=0;k<3;k++)b.pos[k]+=carry[k]*grow;
      springStep(b.pos,b.vel,h,265*(.91+.18*b.f),12,22,4,dt);
      const ax=b.axis[0],az=side?b.axis[2]*wingCos:b.axis[2],ay=b.axis[1]+(side?b.axis[2]*side*wingSin:0);
      const yy=ay*co-az*si,zz=ay*si+az*co;
      b.depth=dot(b.pos,sight);
      b.ax[0]=ax*cy-zz*sy;b.ax[1]=yy;b.ax[2]=ax*sy+zz*cy;
    }
    this.depthOrder.sort(this.sortDepth);
    this.lastSpringRoot=root.slice();this.crowRoot=root;this.crowScale=scale;this.wingGrow=grow;
    const old=this.trail[this.trail.length-1];
    if(!old||this.time-old.time>.036)this.trail.push({p:root.slice(),time:this.time});
    if(this.trail.length>35)this.trail.shift();
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
    this.flow.clear();this.decor.clear();this.traces.clear();this.enemyCloud.clear();this.handsCloud.clear();
    const s=this.seal,t=this.phaseTime,releasing=this.phase==='release';
    const sealed=this.phase==='seal'||this.phase==='charge',finish=this.phase==='recover'||this.phase==='win'||this.phase==='lose';
    const alpha=finish?0:releasing?1-smooth((t-.60)/1.25):1;this.groups[3].alpha=this.abandoned===null?alpha:1-smooth((this.time-this.abandoned-.85)/1.45);
    if(s && (sealed||releasing)){
      this.sealDetails(s,alpha);
      if(sealed || t<.25)this.formation();
      else {
        const k=this.crowScale??.2,fade=(1-smooth((t-2.86)/.26));
        for(const i of this.depthOrder){
          const b=this.bird[i];
          this.flow.put(...b.pos,...b.ax,Math.max(.002,b.l*k),Math.max(.0015,b.w*k),b.mass*fade,b.water,b.tone,b.seed);
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
    // Unclosed fine concentric strokes and broken cinnabar seals accent the original ink.
    for(let band=0;band<3;band++)for(let i=0;i<118;i++){
      const a=TAU*i/118 + band*.29 + (band===2?t*.12:0);
      if(band===0&&Math.sin(a*4+.8)<-.80||band===1&&Math.sin(a*3-.5)<-.48||band===2&&i%12>3)continue;
      const rr=r*(band===0?.68:band===1?1.21:1.31),co=Math.cos(a),si=Math.sin(a),p=onSeal(s,co*rr,si*rr,.002*band);
      const d=add(mul(s.u,-si),mul(s.v,co)), w=r*(band===0?.011:band===1?.009:.014);
      b.put(...p,...d,r*.046,w,(band===0?.67:1.25)*alpha*(.63+.37*c),.45,band===0?0:2,rng());
    }
    for(let i=0;i<37;i++){const a=TAU*rng()+t*.11,rr=r*(1.24+rng()*.28),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,.012);
      b.put(...p,...s.v,r*.010,r*.008,alpha*.7,.62,0,rng());}
    if(this.phase==='release'){
      // A thin sediment print stays on the seal as the main cloud takes flight.
      for(let i=0;i<this.bird.length;i+=2){
        const b0=this.bird[i],g=b0.g,p=onSeal(s,g.x*r*1.15,g.y*r*1.15,.003),d=add(mul(s.u,g.dx),mul(s.v,g.dy));
        b.put(...p,...d,r*.057,r*.018,2.25*alpha,.40,0,b0.seed);
      }
    }
    if(this.phase==='release'&&this.phaseTime<.75){
      const q=this.phaseTime/.75;
      for(let i=0;i<150;i++){let a=i*TAU/150,rr=r*(1+q*.55),p=onSeal(s,Math.cos(a)*rr,Math.sin(a)*rr,-q*.045);
        b.put(...p,...s.u,r*.024,r*.008,(1-q)*2,.55,i%6===0?2:7,i/150);}
    }
  }
  palmStream(s){
    const a=this.livePalm,c=this.charge,t=this.time,b=this.decor,endpoint=onSeal(s,0,0,-.055);
    for(let i=0;i<176;i++){
      const strand=i%4,u=(Math.floor(i/4)/44+t*(.70+.20*c))%1,phi=u*TAU*1.7+strand*Math.PI*.5-t*3.6;
      const rr=(.012+.027*Math.sin(Math.PI*u))*(1-.6*u);
      const p=add(lerp3(a,endpoint,u),add(mul(s.u,Math.cos(phi)*rr),mul(s.v,Math.sin(phi)*rr)));
      const dir=unit(add(sub(endpoint,a),mul(s.u,.14*Math.sin(phi))));
      b.put(...p,...dir,.010+.006*c,.0036,1.05+.8*c,.55,strand===0?2:strand===1?7:0,i/176);
    }
    for(let i=0;i<38;i++){
      const phi=TAU*i/38-t*2,rr=.037+.008*Math.sin(t*6);
      const p=add(a,add(mul(s.u,Math.cos(phi)*rr),mul(s.v,Math.sin(phi)*rr)));
      b.put(...p,...s.u,.007,.004,1.6,.64,i%3?7:0,i/38);
    }
  }
  paintCombat(){
    const b=this.traces,rng=random(194),shot=this.shot;
    adversary(this.enemyCloud,this.enemy,this.time,this.enemyHP,shot?clamp(shot.age/1.15):0,this.hitFlash);
    if(shot?.p){
      const dir=unit(sub(shot.from,shot.to));
      for(let i=0;i<80;i++){
        const t=rng(),p=add(shot.p,mul(dir,t*.26)),k=(rng()-.5)*.19;
        b.put(p[0]+k,p[1]+.9*k*k-.025*t,p[2],1,.6*k,0,.036,.012,(1-t)*2.5,.62,i%4?2:0,rng());
      }
    }
    if(this.phase==='release')for(const v of this.trail){
      const age=this.time-v.time;if(age>.68)continue;
      for(let j=0;j<4;j++){
        const k=rng()-.5,p=v.p;
        b.put(p[0]+k*.075,p[1]-.14*age*age+k*.046,p[2],1,.4+k,.3,.024,.004,.7*(1-age/.68),.5,j%4?1:7,rng());
      }
    }
    for(const imp of this.impacts){
      const age=this.time-imp.time,fade=1-smooth((age-.4)/1.02);
      for(let i=0;i<190;i++){
        const a=rng()*TAU,h=rng()*2-1,rr=Math.sqrt(1-h*h),speed=(.12+rng()*.84)*Math.min(age,.88),ax=Math.cos(a)*rr,az=Math.sin(a)*rr;
        b.put(imp.p[0]+ax*speed,imp.p[1]+h*speed-age*age*.26,imp.p[2]+az*speed,ax,h-.25*age,az,
          (.013+.056*rng())*(1+age*.33),.004+rng()*.013,fade*2,.55,i%5<2?2:0,rng());
      }
    }
  }
  paintHand(h){
    const b=this.handsCloud, j=h.joints;
    if(j){
      for(const f of ['index','middle','ring','pinky','thumb']){
        const names=f==='thumb'?['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip']:
          ['wrist',...['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'].map(s=>f+'-finger-'+s)];
        for(let i=1;i<names.length;i++)if(j[names[i-1]]&&j[names[i]])stroke(b,j[names[i-1]],j[names[i]],.0035,1,.62,.4,.21,0);
      }
    }
    const p=h.open?h.palm:h.tip;
    if(p) b.put(...p,1,0,0,h.open?.011:.006,h.open?.011:.006,2,.42,2,.5);
  }
}
