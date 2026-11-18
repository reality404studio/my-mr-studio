import {InkPaper,InkBrush,BRUSH_STEP,PAPER_STEP} from './ink-engine.js';

// Each comparison traverses exactly the same line, with the same fresh brush and
// grain seed. The first and last 24 mm can use taper only in the leaf study.
export class InkTrial {
  constructor({speed=.68,hold=0,water=.65,pigment=.80,cells=360,taper=false,fill=1}={}) {
    this.paper=new InkPaper(cells,Math.round(cells*.31),.90/cells);
    this.brush=new InkBrush(this.paper,{water,pigment,fill});
    this.speed=speed;this.hold=hold;this.taper=taper;
    this.path=.62;this.half=this.path*.5/speed;this.end=2*this.half+hold;
    this.frame=0;this.t=0;this.ended=false;
    this.brush.begin(.14,.144,0,taper?.08:1);
  }
  step(){
    const t=++this.frame*BRUSH_STEP;this.t=t;
    const distance=t<this.half?t*this.speed:t<this.half+this.hold?this.path/2:
      Math.min(this.path,(t-this.hold)*this.speed);
    const q=distance/this.path;
    const contact=this.taper?Math.max(.035,Math.min(1,q/.19,(1-q)/.24)):1;
    const x=.14+distance,y=.144;
    if(!this.ended){
      this.brush.sample(x,y,Math.min(t,this.end),contact);
      if(t>=this.end){this.brush.lift();this.ended=true;}
    }
    if(this.frame%4===0)this.paper.step(PAPER_STEP);
  }
  finish(settle=.8){
    while(this.t<this.end+settle)this.step();
    this.paper.flush();
    return this;
  }
}
