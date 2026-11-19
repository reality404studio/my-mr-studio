import {clamp, mix, random, TAU, sub, cross, unit, lerp3, dist} from './gesture.js?v=d556bb3';

export const STRIDE=13;
export const BRUSH_DIAMETER=.12;
// centre xyz, major axis xyz, major/minor half-extent, pigment mass,
// water, palette, stable grain seed, age. Every visible effect uses this layout.
export class SplatBatch {
  constructor(limit) { this.limit=limit; this.data=new Float32Array(limit*STRIDE); this.count=0; }
  clear() { this.count=0; }
  put(x,y,z, dx,dy,dz, long,wide, pigment,water, tone=0,seed=.5,age=0) {
    if (this.count>=this.limit || pigment<=.002 || long<=0 || wide<=0) return;
    let j=this.count++*STRIDE, d=this.data;
    d[j++]=x; d[j++]=y; d[j++]=z; d[j++]=dx; d[j++]=dy; d[j++]=dz; d[j++]=long; d[j++]=wide;
    d[j++]=pigment; d[j++]=water; d[j++]=tone; d[j++]=seed; d[j]=age;
  }
}

// SplatSimKernel.StepParticle, formed mode, reduced to its clamped home
// spring, exponential damping, speed cap and semi-implicit integration.
export function springStep(p,v,h,k,damping,maxAccel,maxSpeed,dt) {
  const dx=(h[0]-p[0])*k,dy=(h[1]-p[1])*k,dz=(h[2]-p[2])*k;
  const scale=Math.min(1,maxAccel/(Math.sqrt(dx*dx+dy*dy+dz*dz)||1));
  const decay=Math.exp(-damping*dt);
  let vx=(v[0]+dx*scale*dt)*decay,vy=(v[1]+dy*scale*dt)*decay,vz=(v[2]+dz*scale*dt)*decay;
  const speed=Math.min(1,maxSpeed/(Math.sqrt(vx*vx+vy*vy+vz*vz)||1));
  v[0]=vx*speed;v[1]=vy*speed;v[2]=vz*speed;
  p[0]+=v[0]*dt;p[1]+=v[1]*dt;p[2]+=v[2]*dt;
}

// RitualVortex.Spiral in local seal coordinates. X/Y is the painted surface,
// Z is depth. Keeping the two powers and quadratic turn preserves its timing.
export function spiral(out,x,y,z,q,sign,turns,seed) {
  const left=1-q,a=Math.atan2(y,x)+sign*q*q*turns*TAU;
  const r=Math.hypot(x,y)*left**1.6+.03*left*Math.sin(q*9+seed*TAU);
  out[0]=Math.cos(a)*r; out[1]=Math.sin(a)*r;
  out[2]=z*left**1.1+.06*Math.sin(q*Math.PI)*(.4+seed);
  return out;
}

export class Brush {
  constructor() { this.marks=new SplatBatch(5500); this.reset(); }
  reset() { this.marks.clear();this.points=[];this.travel=0;this.rng=random(81021);this.generation=(this.generation??0)+1; }
  begin(p) { this.reset();this.points.push(p.slice()); }
  line(to,time,speed,eye,check=true) {
    if (!this.points.length) { this.begin(to);return; }
    const from=this.points[this.points.length-1], distance=dist(from,to);
    const spacing=.012;
    if (distance<spacing) return;
    if (distance>.24 || this.points.length>430) { if (check) this.begin(to);return; }
    const dir=unit(sub(to,from)), side=unit(cross(dir,sub(eye,from))), depth=unit(cross(side,dir));
    const count=Math.floor(distance/spacing);
    for (let i=1;i<=count;i++) {
      const p=lerp3(from,to,i*spacing/distance);
      this.points.push(p); this.travel+=spacing;
      this.stamp(p,dir,side,depth,time,speed);
    }
  }
  stamp(p,t,b,n,time,speed) {
    const rng=this.rng, s=this.travel, radius=BRUSH_DIAMETER/2;
    const press=clamp(1.15-speed*.12+.095*Math.sin(s*8),.76,1.10);
    const load=.44+.56*Math.exp(-s*.88);
    const split=clamp((1-load)*1.5+.28*Math.sin(s*6.6));
    const slowPool=clamp((.55-speed)*1.2);
    for (let k=0;k<14;k++) {
      // The same bristle follows the whole stroke. Longitudinal gaps expose dry paper.
      const u=(k-6.5)/7, edge=Math.abs(u);
      if (edge>.57 && Math.sin(s*14+k*13)+rng()*.55<-.69) continue;
      if ((k===3||k===10||k===12)&&split>.37+.14*Math.sin(s*11+k)) continue;
      const offset=(u+.045*Math.sin(s*14+k*.79)+.038*(rng()-.5))*radius*press;
      const z=(rng()-.5)*.006, along=(rng()-.5)*.009;
      const core=1-edge*edge, wet=clamp(.09+core*.39+load*.33+.12*slowPool+.14*Math.sin(s*7));
      this.marks.put(p[0]+b[0]*offset+n[0]*z+t[0]*along,p[1]+b[1]*offset+n[1]*z+t[1]*along,p[2]+b[2]*offset+n[2]*z+t[2]*along,
        ...t,.018+rng()*.013,.0023+core*.0062*(1-.39*split), (.44+core*2.0)*press*(load+.42+slowPool*.48),wet,k===12?1:0,rng(),time);
    }
    if (rng()<.38) {
      const off=(rng()<.5?-1:1)*radius*(.95+rng()*.65),sz=.0015+rng()*.006;
      this.marks.put(p[0]+b[0]*off,p[1]+b[1]*off,p[2]+b[2]*off,...t,sz*2.5,sz,.5+rng(),.85,0,rng(),time);
    }
  }
}
