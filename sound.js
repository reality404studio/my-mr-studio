// Procedural Web Audio soundscape for 묵전 (Ink-Wash & Eastern Action SFX).
// Synthesizes brush-on-Hanji friction, calligraphy stroke swishes, bronze seal chime,
// qi charging resonance, flock wing-flaps & crow calls, and Dokkaebi-bul impacts.
import {clamp, dist} from './gesture.js?v=quest-entry-7';

export class InkSound {
  constructor(){
    this.ctx=null;
    this.noiseBuffer=null;
    this.lastPhase='ready';
    this.lastStrokeId=-1;
    this.lastHitSerial=0;
    this.lastSelfHP=3;
    this.shotLaunched=false;
    this.lastTip=null;
    this.flapClock=0;
    this.brushNode=null;
    this.chargeNode=null;
  }
  unlock(){
    if(typeof window==='undefined')return null;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    if(!this.ctx){
      try{
        this.ctx=new Ctx();
        this.master=this.ctx.createGain();
        this.master.gain.value=0.72;
        this.master.connect(this.ctx.destination);
        this.buildNoise();
        this.setupContinuous();
      }catch{return null;}
    }
    if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    return this.ctx;
  }
  buildNoise(){
    const ctx=this.ctx, len=ctx.sampleRate*2;
    const buf=ctx.createBuffer(1,len,ctx.sampleRate), data=buf.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<len;i++){
      const w=Math.random()*2-1;
      b0=.997*b0+w*.029; b1=.985*b1+w*.032; b2=.950*b2+w*.045;
      data[i]=clamp((b0+b1+b2+w*.18)*1.8,-1,1);
    }
    this.noiseBuffer=buf;
  }
  setupContinuous(){
    const ctx=this.ctx;
    // 1. Continuous Hanji brush friction node
    const src=ctx.createBufferSource();
    src.buffer=this.noiseBuffer;src.loop=true;
    const filter=ctx.createBiquadFilter();
    filter.type='bandpass';filter.frequency.value=680;filter.Q.value=1.8;
    const gain=ctx.createGain();gain.gain.value=0;
    src.connect(filter);filter.connect(gain);gain.connect(this.master);
    src.start();
    this.brushNode={filter,gain};

    // 2. Continuous Qi charge harmonic drone
    const osc1=ctx.createOscillator(), osc2=ctx.createOscillator();
    osc1.type='sine';osc2.type='triangle';
    osc1.frequency.value=196;osc2.frequency.value=294;
    const cFilter=ctx.createBiquadFilter();
    cFilter.type='lowpass';cFilter.frequency.value=720;
    const cGain=ctx.createGain();cGain.gain.value=0;
    osc1.connect(cFilter);osc2.connect(cFilter);cFilter.connect(cGain);cGain.connect(this.master);
    osc1.start();osc2.start();
    this.chargeNode={osc1,osc2,filter:cFilter,gain:cGain};
  }
  sync(game,dt){
    const ctx=this.ctx;
    if(!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime, p=game.phase;

    // 1. Brush drawing friction sound
    if(this.brushNode){
      let speed=0;
      if(p==='trace'&&game.previousTip){
        if(this.lastTip)speed=dist(game.previousTip,this.lastTip)/Math.max(.004,dt);
        this.lastTip=game.previousTip.slice();
      }else this.lastTip=null;
      const active=p==='trace'&&game.missing===0;
      const targetGain=active?clamp(.035+speed*.14,0,.22):0;
      this.brushNode.gain.gain.setTargetAtTime(targetGain,now,.025);
      this.brushNode.filter.frequency.setTargetAtTime(clamp(480+speed*520,420,1650),now,.03);
    }

    // 2. Qi charging harmonic swell
    if(this.chargeNode){
      const charging=(p==='charge'||p==='seal')&&game.charge>0.01;
      const c=game.charge;
      this.chargeNode.gain.gain.setTargetAtTime(charging?.04+.14*c:0,now,.04);
      this.chargeNode.osc1.frequency.setTargetAtTime(174.6+87.3*c,now,.05);
      this.chargeNode.osc2.frequency.setTargetAtTime(261.6+130.8*c,now,.05);
      this.chargeNode.filter.frequency.setTargetAtTime(520+1100*c,now,.05);
    }

    // 3. Phase transitions
    if(p!==this.lastPhase){
      if(p==='seal'){this.playSealLock();this.lastStrokeId=-1;}
      if(p==='release'){this.playFlockRelease();this.flapClock=0;}
      if(p==='win')this.playVictory();
      if(p==='lose')this.playDefeat();
      this.lastPhase=p;
    }

    // 4. Stroke-by-stroke 鳥 calligraphy swishes
    const tip=game.brush?.activeTip;
    if((p==='seal'||p==='charge')&&tip&&tip.strokeId!==this.lastStrokeId){
      this.lastStrokeId=tip.strokeId;
      this.playBrushStroke(tip.strokeId);
    }

    // 5. Flock wing flaps during release flight
    if(p==='release'&&game.phaseTime>.28&&game.phaseTime<2.75){
      this.flapClock+=dt;
      if(this.flapClock>=.145){
        this.flapClock=0;
        this.playWingFlap(1-clamp((game.phaseTime-.28)/2.6,0,.7));
      }
    }

    // 6. Dokkaebi-bul hit impact
    if(game.hitSerial!==this.lastHitSerial){
      if(game.hitSerial>this.lastHitSerial)this.playHitImpact();
      this.lastHitSerial=game.hitSerial;
    }

    // 7. Dokkaebi-bul counterattack launch & player hurt
    const shotReady=Boolean(game.shot?.to);
    if(shotReady&&!this.shotLaunched)this.playEnemyShot();
    this.shotLaunched=shotReady;

    if(game.selfHP<this.lastSelfHP)this.playPlayerHurt();
    this.lastSelfHP=game.selfHP;
  }
  playBrushStroke(strokeId=0){
    const ctx=this.ctx, now=ctx.currentTime;
    const src=ctx.createBufferSource();src.buffer=this.noiseBuffer;
    const f=ctx.createBiquadFilter();f.type='bandpass';
    const baseF=540+(strokeId%5)*110;
    f.frequency.setValueAtTime(baseF,now);
    f.frequency.exponentialRampToValueAtTime(baseF*1.55,now+.09);
    f.Q.value=2.4;
    const g=ctx.createGain();
    g.gain.setValueAtTime(.001,now);
    g.gain.linearRampToValueAtTime(.11,now+.018);
    g.gain.exponentialRampToValueAtTime(.001,now+.11);
    src.connect(f);f.connect(g);g.connect(this.master);
    src.start(now,Math.random()*.8,.12);
  }
  playSealLock(){
    const ctx=this.ctx, now=ctx.currentTime;
    // Resonant Eastern bronze bell chime + wet brush press
    const freqs=[220, 330, 495, 660];
    freqs.forEach((freq,i)=>{
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type=i===0?'sine':'triangle';
      osc.frequency.setValueAtTime(freq,now);
      osc.frequency.exponentialRampToValueAtTime(freq*.994,now+.95);
      const peak=.13/(i+1);
      g.gain.setValueAtTime(.001,now);
      g.gain.linearRampToValueAtTime(peak,now+.012);
      g.gain.exponentialRampToValueAtTime(.0008,now+.85-i*.12);
      osc.connect(g);g.connect(this.master);
      osc.start(now);osc.stop(now+.9);
    });
    this.playBrushStroke(0);
  }
  playFlockRelease(){
    const ctx=this.ctx, now=ctx.currentTime;
    // 1. Razor-sharp Blade & Soul style light slash ring
    for(const [freq,delay,dur] of [[587.3,0,.45],[880,.02,.52],[1318.5,.04,.60],[1760,.06,.48]]){
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(freq*.92,now+delay);
      osc.frequency.exponentialRampToValueAtTime(freq*1.04,now+delay+.06);
      g.gain.setValueAtTime(.001,now+delay);
      g.gain.linearRampToValueAtTime(.085,now+delay+.015);
      g.gain.exponentialRampToValueAtTime(.0008,now+delay+dur);
      osc.connect(g);g.connect(this.master);
      osc.start(now+delay);osc.stop(now+delay+dur+.02);
    }
    // 2. Staggered flock crow calls (까마귀/새떼 울음소리)
    for(let i=0;i<4;i++){
      this.playCrowCall(now+.04+i*.13, 1-.12*i);
    }
  }
  playCrowCall(startTime,scale=1){
    const ctx=this.ctx;
    const osc=ctx.createOscillator(), mod=ctx.createOscillator(), modGain=ctx.createGain();
    const filter=ctx.createBiquadFilter(), g=ctx.createGain();
    osc.type='sawtooth';
    const f0=520+Math.random()*90;
    osc.frequency.setValueAtTime(f0,startTime);
    osc.frequency.linearRampToValueAtTime(f0*1.12,startTime+.045);
    osc.frequency.exponentialRampToValueAtTime(f0*.68,startTime+.22);
    // Rough throat vibrato
    mod.type='sine';mod.frequency.value=42+Math.random()*12;
    modGain.gain.value=28;
    mod.connect(modGain);modGain.connect(osc.frequency);
    filter.type='bandpass';filter.frequency.setValueAtTime(1150,startTime);
    filter.frequency.exponentialRampToValueAtTime(760,startTime+.22);
    filter.Q.value=3.2;
    g.gain.setValueAtTime(.001,startTime);
    g.gain.linearRampToValueAtTime(.095*scale,startTime+.025);
    g.gain.exponentialRampToValueAtTime(.001,startTime+.24);
    osc.connect(filter);filter.connect(g);g.connect(this.master);
    osc.start(startTime);mod.start(startTime);
    osc.stop(startTime+.25);mod.stop(startTime+.25);
  }
  playWingFlap(scale=1){
    const ctx=this.ctx, now=ctx.currentTime;
    const src=ctx.createBufferSource();src.buffer=this.noiseBuffer;
    const f=ctx.createBiquadFilter();f.type='bandpass';
    f.frequency.setValueAtTime(320,now);
    f.frequency.exponentialRampToValueAtTime(780,now+.055);
    f.Q.value=1.4;
    const g=ctx.createGain();
    g.gain.setValueAtTime(.001,now);
    g.gain.linearRampToValueAtTime(.12*scale,now+.018);
    g.gain.exponentialRampToValueAtTime(.001,now+.085);
    src.connect(f);f.connect(g);g.connect(this.master);
    src.start(now,Math.random()*.9,.09);
  }
  playHitImpact(){
    const ctx=this.ctx, now=ctx.currentTime;
    // 1. Deep ink-burst sub impact
    const sub=ctx.createOscillator(), sg=ctx.createGain();
    sub.type='sine';
    sub.frequency.setValueAtTime(155,now);
    sub.frequency.exponentialRampToValueAtTime(38,now+.32);
    sg.gain.setValueAtTime(.32,now);
    sg.gain.exponentialRampToValueAtTime(.001,now+.35);
    sub.connect(sg);sg.connect(this.master);
    sub.start(now);sub.stop(now+.36);
    // 2. Razor-sharp light slash & ink splatter burst
    const src=ctx.createBufferSource();src.buffer=this.noiseBuffer;
    const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=420;
    const ng=ctx.createGain();
    ng.gain.setValueAtTime(.22,now);
    ng.gain.exponentialRampToValueAtTime(.001,now+.28);
    src.connect(f);f.connect(ng);ng.connect(this.master);
    src.start(now,0,.3);
    // 3. Metallic jade blade ring
    for(const freq of [1046.5, 1568, 2093]){
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(freq,now);
      osc.frequency.exponentialRampToValueAtTime(freq*.88,now+.26);
      g.gain.setValueAtTime(.08,now);
      g.gain.exponentialRampToValueAtTime(.001,now+.26);
      osc.connect(g);g.connect(this.master);
      osc.start(now);osc.stop(now+.28);
    }
  }
  playEnemyShot(){
    const ctx=this.ctx, now=ctx.currentTime;
    // Dokkaebi-bul ghostly spirit-fire launch whoosh
    const osc=ctx.createOscillator(), g=ctx.createGain();
    osc.type='sawtooth';
    osc.frequency.setValueAtTime(180,now);
    osc.frequency.exponentialRampToValueAtTime(420,now+.18);
    osc.frequency.exponentialRampToValueAtTime(130,now+.55);
    const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;
    g.gain.setValueAtTime(.001,now);
    g.gain.linearRampToValueAtTime(.14,now+.05);
    g.gain.exponentialRampToValueAtTime(.001,now+.58);
    osc.connect(f);f.connect(g);g.connect(this.master);
    osc.start(now);osc.stop(now+.6);
  }
  playPlayerHurt(){
    const ctx=this.ctx, now=ctx.currentTime;
    const osc=ctx.createOscillator(), g=ctx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(120,now);
    osc.frequency.exponentialRampToValueAtTime(34,now+.35);
    g.gain.setValueAtTime(.28,now);
    g.gain.exponentialRampToValueAtTime(.001,now+.38);
    osc.connect(g);g.connect(this.master);
    osc.start(now);osc.stop(now+.4);
  }
  playVictory(){
    const ctx=this.ctx, now=ctx.currentTime;
    // Pentatonic victory chime (궁-상-각-치-우)
    [261.6, 293.7, 329.6, 392.0, 523.3].forEach((freq,i)=>{
      const t=now+i*.09, osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(freq,t);
      g.gain.setValueAtTime(.001,t);
      g.gain.linearRampToValueAtTime(.11,t+.015);
      g.gain.exponentialRampToValueAtTime(.0008,t+.85);
      osc.connect(g);g.connect(this.master);
      osc.start(t);osc.stop(t+.9);
    });
  }
  playDefeat(){
    const ctx=this.ctx, now=ctx.currentTime;
    [220, 196, 164.8].forEach((freq,i)=>{
      const t=now+i*.14, osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(freq,t);
      g.gain.setValueAtTime(.001,t);
      g.gain.linearRampToValueAtTime(.10,t+.02);
      g.gain.exponentialRampToValueAtTime(.0008,t+.7);
      osc.connect(g);g.connect(this.master);
      osc.start(t);osc.stop(t+.75);
    });
  }
}
