import {TAU,smooth,onSeal,lerp3,mul} from './gesture.js?v=a2c3cb2';

// Desktop rehearsal feeds the same gesture recognizer and combat clock as XR.
export class Rehearsal {
  constructor(){this.age=0;this.palmAge=0;this.lastPhase=null;}
  hands(game,dt){
    const p=game.phase;
    if(p==='ready'&&this.lastPhase!=='ready'){this.age=0;this.palmAge=0;}
    this.lastPhase=p;
    if(p==='ready'||p==='trace'){
      this.age+=dt;if(this.age<.24)return [];
      // Linger at the shoulder of the seal, then flick through its lower arc.
      // This preview feeds timed hand samples through the ordinary wash and spray.
      const t=this.age-.24;
      const q=.24*smooth(t/.60)+.39*smooth((t-.92)/.55)+.37*smooth((t-1.47)/.83);
      const a=TAU*q+.54,rr=.257*(1+.044*Math.sin(a*3+.3)+.047*Math.cos(a*2));
      const tip=[-.225+Math.cos(a)*rr,-.048+Math.sin(a)*rr*.93,-1.22+.034*Math.sin(a+.4)];
      return [{side:'right',draw:true,pinch:false,open:false,tip,palm:tip,normal:[0,0,-1]}];
    }
    if(p==='seal'||p==='charge'){
      this.palmAge+=dt;const s=game.seal,q=smooth((this.palmAge-.32)/.57);
      const palm=lerp3(onSeal(s,s.r*1.06,0,.26),onSeal(s,.008,-.005,.095),q);
      return [{side:'right',draw:false,open:true,pinch:false,palm,tip:palm,normal:mul(s.n,-1)}];
    }
    return [];
  }
}
