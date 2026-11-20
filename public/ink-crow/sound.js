// Asset-driven Web Audio soundscape for 묵전 (Ink-Wash & Eastern Action SFX + BGM).
// Uses exclusively the curated studio assets (bgm.mp3 + 01..13 WAVs) with zero synthetic oscillators.
import {clamp} from './gesture.js?v=bns-phase3';

const SFX_FILES = {
  summon:   './assets/01_summoning_circle.wav?v=audio-1',
  energy:   './assets/02_gauge_energy.wav?v=audio-1',
  focus:    './assets/03_gauge_focus.wav?v=audio-1',
  swell:    './assets/04_charge_reverse_swell.wav?v=audio-1',
  release:  './assets/05_raven_release.wav?v=audio-1',
  air:      './assets/06_release_air.wav?v=audio-1',
  flapHi:   './assets/07_wing_flap.wav?v=audio-1',
  flapLo:   './assets/08_wing_flap_low.wav?v=audio-1',
  caw:      './assets/09_crow_caw.wav?v=audio-1',
  hit:      './assets/10_magic_hit.wav?v=audio-1',
  hitMetal: './assets/11_hit_metallic_detail.wav?v=audio-1',
  scatter:  './assets/12_feather_scatter.wav?v=audio-1',
  soft:     './assets/13_feather_soft.wav?v=audio-1',
};

const BGM_URL = './assets/bgm.mp3?v=audio-1';

export class InkSound {
  constructor(){
    this.ctx=null;
    this.master=null;
    this.sfxBus=null;
    this.buffers=new Map();
    this.loading=false;
    this.bgmEl=null;
    this.bgmGain=null;
    this.bgmFailed=false;

    // Gameplay cue state trackers
    this.lastPhase='ready';
    this.lastHitSerial=0;
    this.lastSelfHP=3;
    this.shotLaunched=false;
    this.flapClock=0;
    this.flapToggle=0;
    this.releaseBurstPlayed=false;
    this.cawStage=0;

    // Cancellable voice trackers for trace & charge escalation
    this.traceVoice=null;
    this.chargeVoices=[];
    this.chargeStage=0; // 0: none, 1: energy, 2: focus, 3: scatter, 4: reverse swell
  }

  unlock(){
    if(typeof window==='undefined')return null;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    if(!this.ctx){
      try{
        this.ctx=new Ctx();
        this.master=this.ctx.createGain();
        this.master.gain.value=0.88;
        this.master.connect(this.ctx.destination);

        this.sfxBus=this.ctx.createGain();
        this.sfxBus.gain.value=0.92;
        this.sfxBus.connect(this.master);

        this.preloadAll();
        this.setupBgm();
      }catch{return null;}
    }
    if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    if(this.bgmEl&&!this.bgmFailed&&this.bgmEl.paused){
      this.bgmEl.play().then(()=>{
        if(this.bgmGain&&this.ctx){
          this.bgmGain.gain.setTargetAtTime(0.34,this.ctx.currentTime,0.55);
        }
      }).catch(()=>{});
    }
    return this.ctx;
  }

  preloadAll(){
    if(this.loading||!this.ctx)return;
    this.loading=true;
    for(const [key,url] of Object.entries(SFX_FILES)){
      fetch(url)
        .then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();})
        .then(ab=>this.ctx.decodeAudioData(ab))
        .then(buf=>this.buffers.set(key,buf))
        .catch(()=>{/* ignore offline/missing asset gracefully */});
    }
  }

  setupBgm(){
    if(typeof document==='undefined'||this.bgmEl||this.bgmFailed||!this.ctx)return;
    try{
      const el=document.createElement('audio');
      el.src=BGM_URL;
      el.loop=true;
      el.preload='auto';
      el.crossOrigin='anonymous';
      el.volume=1.0;
      el.addEventListener('error',()=>{this.bgmFailed=true;});
      const src=this.ctx.createMediaElementSource(el);
      const gain=this.ctx.createGain();
      gain.gain.value=0.001;
      src.connect(gain);
      gain.connect(this.master);
      this.bgmEl=el;
      this.bgmGain=gain;
      el.play().then(()=>{
        gain.gain.setTargetAtTime(0.34,this.ctx.currentTime,0.65);
      }).catch(()=>{});
    }catch{
      this.bgmFailed=true;
    }
  }

  play(key,{gain=0.85,rate=1.0,delay=0,offset=0,duration=null,fadeIn=0.006,trackCharge=false}={}){
    const ctx=this.ctx, buf=this.buffers.get(key);
    if(!ctx||ctx.state!=='running'||!buf)return null;
    try{
      const src=ctx.createBufferSource();
      src.buffer=buf;
      src.playbackRate.value=rate;
      const g=ctx.createGain();
      const startAt=ctx.currentTime+Math.max(0,delay);
      if(fadeIn>0){
        g.gain.setValueAtTime(0.0008,startAt);
        g.gain.linearRampToValueAtTime(gain,startAt+fadeIn);
      }else{
        g.gain.setValueAtTime(gain,startAt);
      }
      src.connect(g);
      g.connect(this.sfxBus);
      const safeOff=clamp(offset,0,Math.max(0,buf.duration-0.02));
      if(duration!==null){
        src.start(startAt,safeOff,Math.max(0.02,duration));
      }else{
        src.start(startAt,safeOff);
      }
      const voice={src,gain:g,stopped:false};
      src.onended=()=>{voice.stopped=true;};
      if(trackCharge)this.chargeVoices.push(voice);
      return voice;
    }catch{
      return null;
    }
  }

  fadeStop(voice,fadeSec=0.14){
    if(!voice||voice.stopped||!this.ctx)return;
    voice.stopped=true;
    try{
      const now=this.ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0005,now,Math.max(0.015,fadeSec*0.32));
      voice.src.stop(now+fadeSec+0.04);
    }catch{}
  }

  stopChargeVoices(fadeSec=0.14){
    for(const v of this.chargeVoices)this.fadeStop(v,fadeSec);
    this.chargeVoices.length=0;
  }

  sync(game,dt){
    const ctx=this.ctx;
    if(!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime, p=game.phase;

    // 0. Dynamic BGM ducking during the 0.14s implosion hush so the raven burst hits harder
    if(this.bgmGain&&this.bgmEl&&!this.bgmFailed&&!this.bgmEl.paused){
      const hushed=p==='release'&&game.phaseTime<0.14;
      this.bgmGain.gain.setTargetAtTime(hushed?0.07:0.34,now,hushed?0.02:0.30);
    }

    // 1. Phase transition cues
    if(p!==this.lastPhase){
      if(p==='trace'){
        // Stage 1: Soft feather/brush sweep while drawing the circle
        this.fadeStop(this.traceVoice,0.08);
        this.traceVoice=this.play('soft',{gain:0.52,rate:1.05,fadeIn:0.04});
      }else if(this.lastPhase==='trace'){
        this.fadeStop(this.traceVoice,0.18);
        this.traceVoice=null;
      }

      if(p==='seal'){
        // Stage 2-3: Summoning circle locks & 鳥 calligraphy begins writing
        if(this.lastPhase==='trace'||this.lastPhase==='ready'){
          this.stopChargeVoices(0.10);
          this.chargeStage=0;
          this.play('summon',{gain:0.88});
        }else if(this.lastPhase==='charge'){
          // Player dropped palm mid-charge -> fade out charging layers cleanly
          this.stopChargeVoices(0.20);
          this.chargeStage=0;
        }
      }

      if(p==='charge'){
        // Stage 4: Palm enters -> begin energy condensation layer
        if(this.chargeStage<1){
          this.chargeStage=1;
          this.play('energy',{gain:0.74,fadeIn:0.05,trackCharge:true});
        }
      }

      if(p==='release'){
        // Stage 6a: If reverse swell wasn't triggered yet (fast charge), fire its final 0.14s tail
        if(this.chargeStage<4){
          const buf=this.buffers.get('swell');
          const off=buf?Math.max(0,buf.duration-0.22):0;
          this.play('swell',{gain:0.80,offset:off,duration:0.16,trackCharge:true});
        }
        this.releaseBurstPlayed=false;
        this.cawStage=0;
        this.flapClock=0;
        this.flapToggle=0;
      }

      if(p==='recover'){
        // Soft lingering feather settle after cast completes
        this.play('soft',{gain:0.42,rate:0.96,fadeIn:0.06});
      }
      if(p==='win'){
        this.play('summon',{gain:0.78,rate:1.06});
        this.play('soft',{gain:0.58,delay:0.25});
      }
      if(p==='lose'){
        this.play('air',{gain:0.62,rate:0.72});
      }
      if(p==='ready'){
        this.stopChargeVoices(0.12);
        this.chargeStage=0;
      }
      this.lastPhase=p;
    }

    // 2. Stage 5: Charge gauge escalation layers (02 energy -> 03 focus -> 12 feather scatter -> 04 reverse swell)
    if(p==='charge'){
      const c=game.charge;
      if(c>=0.38&&this.chargeStage<2){
        this.chargeStage=2;
        this.play('focus',{gain:0.78,fadeIn:0.05,trackCharge:true});
      }
      if(c>=0.64&&this.chargeStage<3){
        this.chargeStage=3;
        this.play('scatter',{gain:0.66,fadeIn:0.04,trackCharge:true});
      }
      if(c>=0.74&&this.chargeStage<4){
        this.chargeStage=4;
        // Align the climax of 04_charge_reverse_swell.wav directly onto the 0.14s implosion end!
        const buf=this.buffers.get('swell');
        const remainSec=(1-c)*1.35+0.14;
        const off=buf?Math.max(0,buf.duration-remainSec):0;
        this.play('swell',{gain:0.86,offset:off,fadeIn:0.03,trackCharge:true});
      }
    }

    // 3. Stage 6b: Explosive raven release right after the 0.14s implosion hush!
    if(p==='release'){
      if(!this.releaseBurstPlayed&&(game.exploded||game.phaseTime>=0.14)){
        this.releaseBurstPlayed=true;
        // Hard-cut charge/reverse-swell cleanly right at the explosion transient!
        this.stopChargeVoices(0.035);
        this.chargeStage=0;
        this.play('release',{gain:0.96});
        this.play('air',{gain:0.76,delay:0.015});
        this.play('scatter',{gain:0.58,rate:1.08,delay:0.03});
      }
      // Crow caws: immediate battle cry on launch + mid-flight flock cry
      if(this.cawStage===0&&game.phaseTime>=0.20){
        this.cawStage=1;
        this.play('caw',{gain:0.82,rate:1.0});
      }else if(this.cawStage===1&&game.phaseTime>=1.32){
        this.cawStage=2;
        this.play('caw',{gain:0.54,rate:1.08});
      }
      // Alternating high/low stereo crow wing flaps during flock flight
      if(game.phaseTime>=0.36&&game.phaseTime<2.62){
        this.flapClock+=dt;
        if(this.flapClock>=0.31){
          this.flapClock=0;
          const key=(this.flapToggle++%2===0)?'flapHi':'flapLo';
          const scale=1-clamp((game.phaseTime-0.36)/2.4,0,0.55);
          const jitter=0.95+((this.flapToggle*37)%13)/100;
          this.play(key,{gain:0.64*scale,rate:jitter});
        }
      }
    }

    // 4. Dokkaebi-bul impact: 10_magic_hit + 11_hit_metallic_detail (3D crescent sword-arc slash!)
    if(game.hitSerial!==this.lastHitSerial){
      if(game.hitSerial>this.lastHitSerial){
        this.play('hit',{gain:0.96});
        this.play('hitMetal',{gain:0.84,delay:0.025});
      }
      this.lastHitSerial=game.hitSerial;
    }

    // 5. Enemy Dokkaebi-bul shot & player hurt (using asset files only — zero synth!)
    const shotReady=Boolean(game.shot?.to);
    if(shotReady&&!this.shotLaunched){
      this.play('air',{gain:0.58,rate:0.76});
    }
    this.shotLaunched=shotReady;

    if(game.selfHP<this.lastSelfHP){
      this.play('hit',{gain:0.78,rate:0.70});
    }
    this.lastSelfHP=game.selfHP;
  }
}
