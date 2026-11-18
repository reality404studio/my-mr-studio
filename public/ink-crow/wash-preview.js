import {STRIDE} from './ink.js?v=quest-entry-6';

// Software equivalent of the world-space wash shader. Sum optical depth in
// screen space before converting it to alpha, so individual quads leave no grid.
export class WashPreview {
  constructor(){
    this.canvas=document.createElement('canvas');
    this.particles=new Float32Array(0);
  }
  draw(ctx,batch,sheet,opacity,f,w,h,eye){
    if(!batch.count)return;
    const scale=Math.min(1,1080/Math.max(w,h)),width=Math.ceil(w*scale),height=Math.ceil(h*scale);
    if(width!==this.canvas.width || height!==this.canvas.height || !this.image){
      this.canvas.width=width;this.canvas.height=height;
      this.context=this.canvas.getContext('2d');
      this.image=this.context.createImageData(width,height);
      this.density=new Float32Array(width*height);this.revision=-1;
    }
    const focal=f*scale;
    if(this.revision!==sheet.revision || this.eye!==eye || this.focal!==focal){
      this.rebuild(batch,sheet,focal,w*.5*scale,h*.5*scale,eye);
      this.revision=sheet.revision;this.eye=eye;this.focal=focal;
    }
    if(!this.rect)return;
    const [x,y,rw,rh]=this.rect;
    ctx.globalAlpha=opacity;
    ctx.drawImage(this.canvas,x,y,rw,rh,x/scale,y/scale,rw/scale,rh/scale);
    ctx.globalAlpha=1;
  }
  rebuild(batch,sheet,f,cx,cy,eye){
    const width=this.canvas.width,height=this.canvas.height, down=sheet.down;
    if(this.particles.length<batch.limit*7)this.particles=new Float32Array(batch.limit*7);
    const positions=this.particles,data=batch.data;
    let x0=width,y0=height,x1=-1,y1=-1,written=0;
    for(let i=0;i<batch.count*STRIDE;i+=STRIDE){
      const z=-data[i+2];if(z<.035)continue;
      const x=(data[i]-eye)/z,y=data[i+1]/z;
      const px=cx+x*f,py=cy-y*f;
      const a=data[i+6]*f/z,b=data[i+7]*f/z;
      const ux=(data[i+3]+data[i+5]*x)*a,uy=-(data[i+4]+data[i+5]*y)*a;
      const vx=(down[0]+down[2]*x)*b,vy=-(down[1]+down[2]*y)*b;
      if(Math.abs(ux*vy-uy*vx)<.0001)continue;
      const ex=Math.abs(ux)+Math.abs(vx),ey=Math.abs(uy)+Math.abs(vy);
      x0=Math.min(x0,Math.floor(px-ex));x1=Math.max(x1,Math.ceil(px+ex));
      y0=Math.min(y0,Math.floor(py-ey));y1=Math.max(y1,Math.ceil(py+ey));
      let j=written++*7;
      positions[j++]=px;positions[j++]=py;positions[j++]=ux;positions[j++]=uy;
      positions[j++]=vx;positions[j++]=vy;positions[j]=data[i+8];
    }
    x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(width-1,x1);y1=Math.min(height-1,y1);
    if(x1<x0 || y1<y0){this.rect=null;return;}
    const density=this.density;
    for(let y=y0;y<=y1;y++)density.fill(0,y*width+x0,y*width+x1+1);
    for(let i=0;i<written*7;i+=7){
      const px=positions[i],py=positions[i+1],ux=positions[i+2],uy=positions[i+3],
        vx=positions[i+4],vy=positions[i+5],mass=positions[i+6];
      const inv=1/(ux*vy-uy*vx),ex=Math.abs(ux)+Math.abs(vx),ey=Math.abs(uy)+Math.abs(vy);
      const left=Math.max(x0,Math.floor(px-ex)),right=Math.min(x1,Math.ceil(px+ex));
      const top=Math.max(y0,Math.floor(py-ey)),bottom=Math.min(y1,Math.ceil(py+ey));
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const dx=x+.5-px,dy=y+.5-py;
        const u=Math.abs((dx*vy-dy*vx)*inv),v=Math.abs((dy*ux-dx*uy)*inv);
        if(u<1 && v<1)density[y*width+x]+=mass*(1-u)*(1-v);
      }
    }
    const pixels=this.image.data;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const i=y*width+x,j=i*4;
      pixels[j]=17;pixels[j+1]=18;pixels[j+2]=17;pixels[j+3]=255*(1-Math.exp(-1.58*density[i]));
    }
    const rw=x1-x0+1,rh=y1-y0+1;
    this.context.putImageData(this.image,0,0,x0,y0,rw,rh);
    this.rect=[x0,y0,rw,rh];
  }
}
