import {clamp, dot, len, mul, random, sub, unit} from './gesture.js';
import {SplatBatch} from './ink.js';

// A drop keeps its mass and the virtual ink surface at its point of departure.
const CAPACITY = 128;
export class InkSpray {
  constructor() {
    this.marks = new SplatBatch(CAPACITY * 5 + 1);
    this.drops = Array.from({length:CAPACITY}, () => ({phase:0}));
    this.clear();
  }
  clear() {
    for (const drop of this.drops) drop.phase = 0;
    this.marks.clear(); this.cursor = 0; this.spawned = 0;
    this.rng = random(39563); this.stopMotion();
  }
  stopMotion() { this.velocity = [0,0,0]; this.credit = 0; this.cooldown = 0; this.elapsed = 0; }
  sample(from, to, dt, normal, brush) {
    if (!(dt > 0 && dt <= .12)) {this.stopMotion(); return;}
    const old = this.velocity, v = sub(to, from), follow = 1-Math.exp(-dt/.033);
    const sampleScale=Math.min(1/dt,4.0/(len(v)||1e-12));
    for (let k=0;k<3;k++) v[k] = old[k] + follow*(v[k]*sampleScale-old[k]);
    this.velocity = v; this.elapsed += dt; this.cooldown = Math.max(0,this.cooldown-dt);
    const speed = len(v), oldSpeed = len(old);
    // A fast sweep sheds small drops. A hard turn or brake throws a larger fan
    // along the incoming tangent instead of reversing it with the hand.
    const bend = oldSpeed>.68 ? Math.max(0,oldSpeed-dot(v,old)/oldSpeed)/dt : 0;
    const wet = brush.fullWater ? brush.wetness*brush.water/brush.fullWater : 0;
    this.credit += dt*clamp((speed-.62)*19,0,31)*wet;
    if (bend>3.8 && !this.cooldown && this.elapsed>.075) {
      this.emit(from,old,normal,brush,Math.ceil(clamp(bend*.55,2,8)*wet));
      this.cooldown=.13;
    }
    const count = Math.floor(this.credit);
    if (count) {this.credit-=count;this.emit(to,v,normal,brush,count);}
  }
  lift(p,normal,brush) {
    const speed=len(this.velocity);
    if (speed>.69 && this.elapsed>.06 && !this.cooldown)
      this.emit(p,this.velocity,normal,brush,Math.ceil(clamp(speed*4,2,10)*brush.wetness));
    this.stopMotion();
  }
  emit(p, v, normal, brush, count) {
    const rng=this.rng, heading=unit(v);
    // The receiving paper is tangent to the local stroke, even on a tilted
    // gesture. A share of the spray grazes it while the rest flies clear.
    const across=sub(normal,mul(heading,dot(normal,heading)));
    if(len(across)>.3)normal=unit(across);
    for(let i=0;i<count;i++) {
      let free=null;
      for(let n=0;n<CAPACITY;n++){
        const d=this.drops[this.cursor]; this.cursor=(this.cursor+1)%CAPACITY;
        if (!d.phase) {free=d;break;}
      }
      if (!free || brush.water<.00004 || brush.pigment<.000012) return;
      const u=rng(), radius=.0024+.0085*u*u;
      const water=Math.min(brush.water,radius*radius*4.2);
      const ink=Math.min(brush.pigment,water*(.18+.66*brush.strength));
      brush.water-=water; brush.pigment-=ink;
      const depthKick=(rng()-.60)*.80, gain=.55+rng()*.39, jitter=.15+.14*len(v);
      const d=free;
      d.phase=1;d.x=p[0];d.y=p[1];d.z=p[2];
      d.vx=v[0]*gain+normal[0]*depthKick+(rng()-.5)*jitter;
      d.vy=v[1]*gain+normal[1]*depthKick+(rng()-.40)*jitter;
      d.vz=v[2]*gain+normal[2]*depthKick+(rng()-.5)*jitter;
      d.nx=normal[0];d.ny=normal[1];d.nz=normal[2];
      d.plane=dot(p,normal)-(.024+.025*rng());
      d.radius=radius;d.age=0;d.seed=rng();d.water=water;d.ink=ink;
      d.density=ink/(radius*radius); d.life=.65+.27*rng(); this.spawned++;
    }
  }
  step(dt) {
    const batch=this.marks;batch.clear();
    const drag=Math.exp(-1.1*dt);
    for(const d of this.drops){
      if(!d.phase)continue;
      d.age+=dt;
      if(d.age>=d.life){d.phase=0;continue;}
      if(d.phase===1){
        const x=d.x,y=d.y,z=d.z, before=x*d.nx+y*d.ny+z*d.nz-d.plane;
        d.vx*=drag;d.vz*=drag;d.vy=d.vy*drag-9.81*dt;
        d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;
        const after=d.x*d.nx+d.y*d.ny+d.z*d.nz-d.plane;
        if(after<=0 && before>0){
          const hit=before/(before-after);
          d.x=x+(d.x-x)*hit;d.y=y+(d.y-y)*hit;d.z=z+(d.z-z)*hit;
          const normalSpeed=d.vx*d.nx+d.vy*d.ny+d.vz*d.nz;
          const tangent=unit([d.vx-normalSpeed*d.nx,d.vy-normalSpeed*d.ny,d.vz-normalSpeed*d.nz]);
          d.ax=tangent[0];d.ay=tangent[1];d.az=tangent[2];d.phase=2;d.life=1.6+d.seed*.8;d.age=0;
        } else {
          const speed=Math.hypot(d.vx,d.vy,d.vz)||1;
          batch.put(d.x,d.y,d.z,d.vx/speed,d.vy/speed,d.vz/speed,
            d.radius*(1.15+Math.min(2,speed*.87)),d.radius,d.density*clamp((d.life-d.age)/.14),.22,0,d.seed);
          continue;
        }
      }
      const bloom=1-Math.exp(-d.age*8), size=d.radius*(1.45+.83*bloom);
      const fade=clamp((d.life-d.age)/.48);
      batch.put(d.x,d.y,d.z,d.ax,d.ay,d.az,size*1.34,size,d.density*.93*fade,.58,0,d.seed);
      // Three smaller, uneven impressions inherit the original impact direction.
      const sx=d.ny*d.az-d.nz*d.ay,sy=d.nz*d.ax-d.nx*d.az,sz=d.nx*d.ay-d.ny*d.ax;
      for(let k=0;k<3;k++){
        const a=(1.6+k*.67+d.seed*.8)*size, b=Math.sin(k*4+d.seed*17)*size*(.44+k*.26);
        const r=size*(.12+.07*k);
        batch.put(d.x+a*d.ax+b*sx,d.y+a*d.ay+b*sy,d.z+a*d.az+b*sz,
          d.ax,d.ay,d.az,r*1.35,r,d.density*.64*fade,.4,0,d.seed);
      }
    }
  }
}
