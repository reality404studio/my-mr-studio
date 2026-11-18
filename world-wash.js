import {InkBrush, InkPaper, PAPER_STEP} from './ink-study/ink-engine.js';
import {SplatBatch} from './ink.js';
import {cross, dist, dot, lerp3, sub, unit} from './gesture.js';

const CELLS=472, CELL=.0056, HALF=CELLS*CELL*.5, SPACING=.012;
export class WorldWash {
  constructor(){
    this.paper=new InkPaper(CELLS,CELLS,CELL);
    this.brush=new InkBrush(this.paper,{water:.65,pigment:.80});
    this.marks=new SplatBatch(6100);this.revision=0;
    this.depth=new Float32Array(CELLS*CELLS);
    this.nearest=new Float32Array(CELLS*CELLS);
    this.reset();
  }
  reset(){
    this.brush.lift();this.brush.reload();this.paper.clear();this.marks.clear();
    this.depth.fill(0);this.nearest.fill(Infinity);this.points=[];this.travel=0;
    this.origin=null;this.local=null;this.clock=0;this.revision++;
    this.extent=[CELLS,CELLS,-1,-1];
  }
  begin(p,time,eye){
    this.reset();this.origin=p.slice();
    this.normal=unit(sub(eye,p));
    if(!this.normal.some(Boolean))this.normal=[0,0,1];
    this.right=unit(cross(Math.abs(this.normal[1])>.94?[0,0,1]:[0,1,0],this.normal));
    this.down=cross(this.right,this.normal);
    this.local=[HALF,HALF,0];this.points.push(p.slice());
    this.brush.begin(HALF,HALF,time);
  }
  project(p){
    const d=sub(p,this.origin);
    return [HALF+dot(d,this.right),HALF+dot(d,this.down),dot(d,this.normal)];
  }
  line(p,time,record=true){
    if(record){
      const from=this.points.at(-1),distance=dist(from,p),count=Math.floor(distance/SPACING);
      for(let i=1;i<=count;i++)this.points.push(lerp3(from,p,i*SPACING/distance));
      this.travel+=count*SPACING;
    }
    const next=this.project(p);
    const inside=next[0]>.10 && next[1]>.10 && next[0]<2*HALF-.10 && next[1]<2*HALF-.10;
    if(inside){
      if(!this.brush.down)this.brush.begin(next[0],next[1],time);
      else this.brush.sample(next[0],next[1],time);
      this.setDepth(this.local??next,next);
      this.local=next;
    } else {this.brush.lift();this.local=null;}
  }
  setDepth(a,b){
    // Keep the depth of the nearest authored segment under each wet bristle.
    // A tilted ring stays where it was drawn after the viewer moves.
    const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    if(length2<1e-12 && this.nearest[Math.round(b[1]/CELL)*CELLS+Math.round(b[0]/CELL)]===0 &&
       Math.abs(a[2]-b[2])<.0005)return;
    const margin=.124,loX=Math.max(0,Math.floor((Math.min(a[0],b[0])-margin)/CELL));
    const hiX=Math.min(CELLS-1,Math.ceil((Math.max(a[0],b[0])+margin)/CELL));
    const loY=Math.max(0,Math.floor((Math.min(a[1],b[1])-margin)/CELL));
    const hiY=Math.min(CELLS-1,Math.ceil((Math.max(a[1],b[1])+margin)/CELL));
    for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
      const rx=x*CELL-a[0],ry=y*CELL-a[1],q=length2?Math.max(0,Math.min(1,(rx*dx+ry*dy)/length2)):1;
      const ex=rx-dx*q,ey=ry-dy*q,d2=ex*ex+ey*ey,i=y*CELLS+x;
      if(d2<=this.nearest[i]){this.nearest[i]=d2;this.depth[i]=a[2]+(b[2]-a[2])*q;}
    }
    const e=this.extent;e[0]=Math.min(e[0],loX);e[1]=Math.min(e[1],loY);e[2]=Math.max(e[2],hiX);e[3]=Math.max(e[3],hiY);
  }
  end(){this.brush.lift();}
  close(to,time){
    // The small assisted seam uses the same brush, with its remaining ink.
    // Virtual timestamps are local to the seam and never enter flick detection.
    const from=this.points.at(-1),distance=dist(from,to);
    if(distance>.004){
      const start=this.project(from);
      this.brush.lift();this.brush.begin(start[0],start[1],time);
      const steps=Math.ceil(distance/.009);
      for(let i=1;i<=steps;i++)this.line(lerp3(from,to,i/steps),time+i/120,false);
    }
    this.end();this.paper.flush();this.bake();
  }
  tick(dt){
    if(!this.origin)return;
    this.clock+=dt;
    if(this.clock+1e-9<PAPER_STEP)return;
    const steps=Math.floor((this.clock+1e-9)/PAPER_STEP);
    this.clock-=steps*PAPER_STEP;
    const p=this.paper;
    if(!p.count && p.bounds[2]<p.bounds[0])return;
    p.step(steps*PAPER_STEP);this.bake();
  }
  bake(){
    const e=this.extent,s=this.paper,m=this.marks;
    const [x0,y0,x1,y1]=e;
    const u=this.right,v=this.down,n=this.normal,o=this.origin;
    let stride=1;
    // A typical ring fits at full resolution. For a long stroke, aggregate
    // all cells in each block, preserving mean density and pigment-weighted depth.
    for(;;){
      m.clear();
      for(let y=y0;y<=y1 && m.count<m.limit;y+=stride)for(let x=x0;x<=x1 && m.count<m.limit;x+=stride){
        let ink=0,pz=0;
        for(let yy=y;yy<Math.min(y+stride,y1+1);yy++)for(let xx=x;xx<Math.min(x+stride,x1+1);xx++){
          const i=yy*CELLS+xx,v=s.mobile[i]+s.fixed[i];
          ink+=v;pz+=this.depth[i]*v;
        }
        const density=ink/(stride*stride);
        if(density<.009)continue;
        const px=(x+(stride-1)*.5)*CELL-HALF,py=(y+(stride-1)*.5)*CELL-HALF;
        pz/=ink;
        const half=CELL*stride;
        m.put(o[0]+px*u[0]+py*v[0]+pz*n[0],o[1]+px*u[1]+py*v[1]+pz*n[1],
          o[2]+px*u[2]+py*v[2]+pz*n[2],u[0],u[1],u[2],half,half,
          density,0,8,((x*113+y*317)%997)/997);
      }
      if(m.count<m.limit)break;
      stride*=2;
    }
    this.revision++;
  }
}
