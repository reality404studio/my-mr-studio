// Canvas fallback for the flat rehearsal on browsers without WebGL 2.
// The metre-space particle buffers, glyph, wing rig and combat logic are shared.
import {STRIDE} from './ink.js?v=bns-phase3';
import {WashPreview} from './wash-preview.js?v=bns-phase3';
import {random} from './gesture.js?v=bns-phase3';
const tones=[[8,11,14],[26,45,52],[198,38,19],[245,251,251],[50,91,101],[122,162,167],[214,73,42],[242,196,90],[10,13,16],[42,238,228],[238,84,36],[172,216,218],[255,228,132]];
const masses=[.42,1,2,3.65];
function atlas(){
  const size=44,tex=document.createElement('canvas');tex.width=size*12;tex.height=size*tones.length;
  const c=tex.getContext('2d'),data=c.createImageData(tex.width,tex.height),r=random(981);
  for(let tone=0;tone<tones.length;tone++)for(let m=0;m<4;m++)for(let w=0;w<3;w++){
    const cell=m*3+w,spread=1+w*.24;
    for(let y=0;y<size;y++){
      let fibre=.5+r()*.30;
      for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r2=u*u+v*v;
        fibre=fibre*.80+r()*.20;
        const edge=Math.max(0,r2+(r()-.5)*.15);
        const stain=.095*w;
        const g=.76*Math.exp(-2.2*edge*spread*spread)+((.24-stain)*Math.exp(-1.65*edge)+stain*Math.exp(-56*(Math.sqrt(edge)-.72)**2))/spread;
        const density=masses[m]*g*Math.min(1,Math.max(0,(1-edge)/.29))*(.37+.83*fibre);
        const i=((tone*size+y)*tex.width+cell*size+x)*4;
        for(let k=0;k<3;k++)data.data[i+k]=tones[tone][k];
        data.data[i+3]=r2>1?0:(1-Math.exp(-density))*255;
      }
    }
  }
  c.putImageData(data,0,0);return tex;
}
export class PaperPreview {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw Error('이 브라우저에서 미리보기를 열 수 없습니다.');
    this.wash=new WashPreview();this.atlas=atlas();this.background=document.createElement('canvas');this.key='';
  }
  setGlyphSdf(sdf){this.glyphCanvas=sdf?.canvas??null;}
  upload(){}
  draw(ctx,b,opacity,time,f,w,h,eyeX,sheet){
    if(sheet){this.wash.draw(ctx,b,sheet,opacity,f,w,h,eyeX);return;}
    const data=b.data;
    for(let j=0;j<b.count*STRIDE;j+=STRIDE){
      const depth=-data[j+2];if(depth<.035)continue;
      const px=f/depth,x=w*.5+(data[j]-eyeX)*px,y=h*.5-data[j+1]*px;
      const dz=data[j+5],dx=data[j+3]+dz*(data[j]-eyeX)/depth,dy=-(data[j+4]+dz*data[j+1]/depth),l=Math.hypot(dx,dy);
      const wet=data[j+9],spread=1+wet*.68*(1-Math.exp(-Math.max(0,time-data[j+12])*1.65));
      const a=data[j+6]*px*Math.max(.22,Math.min(1,l)),b=data[j+7]*px*spread;
      const pad=Math.max(a,b);if(x+pad<0||y+pad<0||x-pad>w||y-pad>h)continue;
      const cs=l>.0001?dx/l:1,sn=l>.0001?dy/l:0;
      const mass=data[j+8],m=mass<=.42?0:mass<=1?1:mass<=2?2:3,cell=m*3+Math.round(wet*2);
      ctx.globalAlpha=opacity*Math.min(1,mass/masses[m]);
      ctx.setTransform(cs*a,sn*a,-sn*b,cs*b,x,y);
      ctx.drawImage(this.atlas,cell*44,Math.min(tones.length-1,Math.max(0,Math.round(data[j+10])))*44,44,44,-1,-1,2,2);
    }
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
  }
  eye(view,proj,groups,time,passthrough,hudView,sealVisual=null){
    const w=this.canvas.width,h=this.canvas.height,c=this.ctx,f=h*proj[5]*.5,eyeX=-view[12];
    const key=w+'x'+h+':'+Math.round(eyeX*35);
    if(this.key!==key){
      this.key=key;const bg=this.background;bg.width=w;bg.height=h;
      const b=bg.getContext('2d');
      const fill=b.createRadialGradient(w*.43,h*.32,h*.05,w*.5,h*.48,Math.max(w,h)*.73);
      fill.addColorStop(0,'#f9f5eb');fill.addColorStop(1,'#eae4d3');b.fillStyle=fill;b.fillRect(0,0,w,h);
      const noise=document.createElement('canvas');noise.width=noise.height=96;const n=noise.getContext('2d'),p=n.createImageData(96,96),rng=random(701);
      for(let i=0;i<p.data.length;i+=4){p.data[i]=p.data[i+1]=p.data[i+2]=rng()>.5?235:58;p.data[i+3]=rng()*13;}
      n.putImageData(p,0,0);b.fillStyle=b.createPattern(noise,'repeat');b.fillRect(0,0,w,h);
      this.draw(b,groups[0].batch,1,time,f,w,h,eyeX);
    }
    c.drawImage(this.background,0,0);
    for(const item of groups){
      if(!item.scenery&&item.alpha>0)this.draw(c,item.batch,item.alpha,time,f,w,h,eyeX,item.sheet);
      if(item.sheet&&sealVisual&&this.glyphCanvas&&sealVisual.alpha>.002){
        const s=sealVisual.seal,depth=-s.c[2];
        if(depth>.05){
          const px=f/depth,sx=w*.5+(s.c[0]-eyeX)*px,sy=h*.5-s.c[1]*px,rad=s.r*.88*px;
          c.save();c.globalAlpha=sealVisual.alpha*(1-sealVisual.dissolve);
          c.drawImage(this.glyphCanvas,sx-rad,sy-rad,rad*2,rad*2);c.restore();
        }
      }
    }
  }
}
