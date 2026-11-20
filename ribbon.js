import {TAU, cross, len, mul, sub, unit} from './gesture.js?v=a2c3cb2';

export const RIBBON_STRIDE=9; // px,py,pz, u,v, mode,alpha,seed,energy

export class RibbonBatch {
  constructor(maxVerts=12000,maxIndices=36000){
    this.maxVerts=maxVerts;
    this.maxIndices=maxIndices;
    this.verts=new Float32Array(maxVerts*RIBBON_STRIDE);
    this.indices=new Uint16Array(maxIndices);
    this.vertCount=0;
    this.indexCount=0;
  }
  clear(){
    this.vertCount=0;
    this.indexCount=0;
  }
  pushVert(x,y,z,u,v,mode,alpha,seed,energy){
    const o=this.vertCount*RIBBON_STRIDE;
    const d=this.verts;
    d[o]=x;d[o+1]=y;d[o+2]=z;
    d[o+3]=u;d[o+4]=v;
    d[o+5]=mode;d[o+6]=alpha;d[o+7]=seed;d[o+8]=energy;
    return this.vertCount++;
  }
  // Core curved strip builder: points[k] = [x,y,z], sides[k] = [sx,sy,sz] (unit half-width axis), widths[k] = half-width
  addStrip(points,widths,sides,mode,alpha,seed,energy=1){
    const n=points.length;
    if(n<2||alpha<=.002)return;
    if(this.vertCount+n*2>this.maxVerts||this.indexCount+(n-1)*6>this.maxIndices)return;
    const base=this.vertCount;
    const invN=1/(n-1);
    for(let i=0;i<n;i++){
      const p=points[i],s=sides[i],w=widths[i],u=i*invN;
      const sx=s[0]*w,sy=s[1]*w,sz=s[2]*w;
      this.pushVert(p[0]-sx,p[1]-sy,p[2]-sz,u,-1,mode,alpha,seed,energy);
      this.pushVert(p[0]+sx,p[1]+sy,p[2]+sz,u, 1,mode,alpha,seed,energy);
    }
    const idx=this.indices;
    let ic=this.indexCount;
    for(let i=0;i<n-1;i++){
      const a=base+i*2,b=a+1,c=a+2,d=a+3;
      idx[ic++]=a;idx[ic++]=b;idx[ic++]=c;
      idx[ic++]=c;idx[ic++]=b;idx[ic++]=d;
    }
    this.indexCount=ic;
  }
  // Eye-facing 3D curved trail (for 9 crows flight wakes & curved palm streams)
  addBillboardTrail(points,eye,widthHead,widthTail,mode,alpha,seed,energy=1){
    const n=points.length;
    if(n<2||alpha<=.002)return;
    const widths=new Array(n);
    const sides=new Array(n);
    let prevSide=[0,1,0];
    for(let i=0;i<n;i++){
      const u=i/(n-1); // 0 = tail (oldest), 1 = head (newest)
      const pPrev=points[Math.max(0,i-1)];
      const pNext=points[Math.min(n-1,i+1)];
      const tang=sub(pNext,pPrev);
      const toEye=sub(eye,points[i]);
      let side=cross(tang,toEye);
      const sl=len(side);
      if(sl>1e-5){
        side=[side[0]/sl,side[1]/sl,side[2]/sl];
        // Prevent sudden sign flip along tight curves
        if(i>0 && side[0]*prevSide[0]+side[1]*prevSide[1]+side[2]*prevSide[2]<0){
          side=[-side[0],-side[1],-side[2]];
        }
        prevSide=side;
      }else{
        side=prevSide;
      }
      sides[i]=side;
      // Graceful calligraphic brush taper: thin frayed tail -> lush mid-body -> crisp tapered tip
      const env=Math.pow(Math.sin(Math.PI*Math.min(1,Math.max(0,u))),.58);
      widths[i]=(widthTail+(widthHead-widthTail)*u)*(.22+.78*env);
    }
    this.addStrip(points,widths,sides,mode,alpha,seed,energy);
  }
  // Curved calligraphic orbital arc flowing around a 3D seal ring (replaces straight neon needles!)
  addOrbitalArc(seal,radius,startA,arcSpan,maxWidth,wobble,zOffset,mode,alpha,seed,energy=1,segs=34){
    if(alpha<=.002)return;
    const points=new Array(segs+1);
    const widths=new Array(segs+1);
    const sides=new Array(segs+1);
    const c=seal.c,su=seal.u,sv=seal.v,sn=seal.n;
    for(let i=0;i<=segs;i++){
      const u=i/segs;
      const a=startA+u*arcSpan;
      const rr=radius+wobble*Math.sin(u*TAU*1.5+seed*6.28);
      const co=Math.cos(a),si=Math.sin(a);
      const dz=zOffset+Math.sin(u*Math.PI)*wobble*.55;
      points[i]=[
        c[0]+su[0]*co*rr+sv[0]*si*rr+sn[0]*dz,
        c[1]+su[1]*co*rr+sv[1]*si*rr+sn[1]*dz,
        c[2]+su[2]*co*rr+sv[2]*si*rr+sn[2]*dz
      ];
      // Radial outward vector lies right in the curved orbital plane
      sides[i]=[su[0]*co+sv[0]*si,su[1]*co+sv[1]*si,su[2]*co+sv[2]*si];
      // Calligraphic brush stroke swell: sharp entry -> lush curved belly -> whip-thin dry-brush tail
      const taper=Math.pow(Math.sin(Math.PI*u),.68)*(.75+.25*Math.sin(u*Math.PI*.65));
      widths[i]=maxWidth*taper;
    }
    this.addStrip(points,widths,sides,mode,alpha,seed,energy);
  }
  // Smooth continuous 3D Bezier-helix qi ribbon from palm to outer Enso rim
  addBezierHelix(from,ctrl,to,uAxis,vAxis,eye,maxWidth,swirlRad,turns,phase,mode,alpha,seed,energy=1,segs=28){
    if(alpha<=.002)return;
    const points=new Array(segs+1);
    for(let i=0;i<=segs;i++){
      const u=i/segs,inv=1-u;
      const bx=inv*inv*from[0]+2*inv*u*ctrl[0]+u*u*to[0];
      const by=inv*inv*from[1]+2*inv*u*ctrl[1]+u*u*to[1];
      const bz=inv*inv*from[2]+2*inv*u*ctrl[2]+u*u*to[2];
      const phi=u*TAU*turns+phase;
      const rr=swirlRad*Math.sin(Math.PI*u)*(1-.35*u);
      const co=Math.cos(phi)*rr,si=Math.sin(phi)*rr;
      points[i]=[
        bx+uAxis[0]*co+vAxis[0]*si,
        by+uAxis[1]*co+vAxis[1]*si,
        bz+uAxis[2]*co+vAxis[2]*si
      ];
    }
    this.addBillboardTrail(points,eye,maxWidth*1.05,maxWidth*.35,mode,alpha,seed,energy);
  }
  // Classic Blade & Soul 3D Crescent Sword-Arc Slash (zero straight X-sticks!)
  addCrescentSlash(center,right,up,normal,radius,startA,arcSpan,maxWidth,cupDepth,mode,alpha,seed,energy=1,segs=32){
    if(alpha<=.002)return;
    const points=new Array(segs+1);
    const widths=new Array(segs+1);
    const sides=new Array(segs+1);
    for(let i=0;i<=segs;i++){
      const u=i/segs; // 0 = trailing tail, 1 = razor cutting tip
      const a=startA+u*arcSpan;
      const co=Math.cos(a),si=Math.sin(a);
      // Slight spiral expansion toward cutting tip + 3D dish curvature for VR depth
      const rr=radius*(.88+.18*u);
      const dz=Math.sin(Math.PI*u)*cupDepth;
      points[i]=[
        center[0]+right[0]*co*rr+up[0]*si*rr+normal[0]*dz,
        center[1]+right[1]*co*rr+up[1]*si*rr+normal[1]*dz,
        center[2]+right[2]*co*rr+up[2]*si*rr+normal[2]*dz
      ];
      sides[i]=[right[0]*co+up[0]*si,right[1]*co+up[1]*si,right[2]*co+up[2]*si];
      // Asymmetric sword-slash crescent: long tapering tail -> bold crescent belly near u=0.68 -> razor point at u=1
      const crescent=Math.pow(u,.55)*Math.pow(1-u,.38)*2.15;
      widths[i]=maxWidth*Math.min(1.15,crescent);
    }
    this.addStrip(points,widths,sides,mode,alpha,seed,energy);
  }
  // Expanding curved shockwave ring arc for release & impact bursts
  addShockwaveArc(center,right,up,normal,radius,thickness,startA,arcSpan,mode,alpha,seed,energy=1,segs=38){
    if(alpha<=.002)return;
    const points=new Array(segs+1);
    const widths=new Array(segs+1);
    const sides=new Array(segs+1);
    for(let i=0;i<=segs;i++){
      const u=i/segs,a=startA+u*arcSpan,co=Math.cos(a),si=Math.sin(a);
      const rr=radius*(1+.03*Math.sin(u*TAU*2+seed*5));
      points[i]=[
        center[0]+right[0]*co*rr+up[0]*si*rr,
        center[1]+right[1]*co*rr+up[1]*si*rr,
        center[2]+right[2]*co*rr+up[2]*si*rr
      ];
      sides[i]=[right[0]*co+up[0]*si,right[1]*co+up[1]*si,right[2]*co+up[2]*si];
      widths[i]=thickness*Math.pow(Math.sin(Math.PI*u),.52);
    }
    this.addStrip(points,widths,sides,mode,alpha,seed,energy);
  }
}
