import {SplatBatch} from './ink.js';
import {TAU, random, clamp, mix, smooth, lerp3, sub, unit, len} from './gesture.js';

// A tapered stroke consists of oriented pigment deposits along a spatial curve.
export function stroke(batch,a,b,width,tone,mass,water,seed,taper=.55) {
  const d=sub(b,a),l=len(d);if(l<.00001)return;
  const n=Math.max(2,Math.min(18,Math.ceil(l/(width*2.4)))),axis=unit(d);
  for(let j=0;j<n;j++){
    const t=(j+.5)/n,p=lerp3(a,b,t);
    batch.put(...p,...axis,l/n*.85,width*(1-t*taper),mass,water,tone,(seed+t*.31)%1);
  }
}
export function landscape() {
  const out=new SplatBatch(10000), r=random(4433);
  // Distant ranges are large, dilute vertical washes. Close ledges retain
  // short, dark, broken marks in the direction of the slope.
  const banks=[
    [-15, -2.45,1.5,5, .85, 1.22],[-11,-2.4,1.55,5,1.0,2.4],
    [-7.5,-2.2,1.17,4,.86,4.1],[-5.0,-1.9,1.04,4,1.05,5.7]
  ];
  for(let k=0;k<banks.length;k++){
    const [z,base,amp,tone,f,seed]=banks[k];const extent=-z*1.75;
    for(let j=0;j<770;j++){
      const x=mix(-extent,extent,j/769),u=x/(-z),w=.2+Math.min(1,Math.abs(u)*1.85);
      const wave=.53*Math.sin(x*f*.92+seed)+.25*Math.sin(x*f*2.17+seed*2)+.11*Math.sin(x*5.3+seed);
      const y=base+amp*(.40+wave)*w-.17*Math.cos(u*2.4), brush=.41+r()*.52;
      if(j%2===0){
        const depth=.36+r()*.90, angle=.19*Math.cos(x*2.3+seed);
        out.put(x+angle*depth,y-depth*.83-.11,z,angle,1,0,depth,(-z)*.022,.39,.69,tone,r());
      }
      out.put(x,y-brush*.74,z, .13*Math.sin(x*3.3+seed),1,0,brush,(-z)*.014, .29+k*.13,.89,tone,r());
      if(j%3===0)out.put(x,y-.05,z+.025,1,.25*Math.sin(x*3),0,.08+r()*.12,.012+r()*.035,.28,.61,tone,r());
    }
  }
  function pine(x,y,z,h,tone) {
    stroke(out,[x,y,z],[x+.04*h,y+h,z],h*.018,tone,1.75,.30,r());
    for(let tier=0;tier<7;tier++)for(const side of [-1,1]){
      const t=tier/7,reach=h*(.26-.19*t)*(.65+r()*.55),by=y+h*(.18+t*.81);
      stroke(out,[x+h*.026,by,z],[x+side*reach,by+h*(.016+.043*r()),z],h*(.021-.011*t),tone,1.15,.45,r());
      for(let i=0;i<7;i++){
        const q=r(),w=(.105-.060*t)*h;
        out.put(x+side*reach*q,by+h*.03+r()*w*.44,z+.006,1,.17*side,0,w*(.45+r()),w*.36,.70,.58,tone,r());
      }
    }
  }
  for(const side of [-1,1]){
    for(let i=0;i<7;i++){
      const x=side*(2.18+r()*3.1),z=-4.3-r()*.75;
      pine(x,-1.30+.14*Math.sin(x*3.4),z,.14+r()*.57, i%3?4:1);
    }
  }
  // The sun's overlap is intentionally flat and dusty. The rim is broken into splats.
  const sun=[2.75,1.34,-7.9],rad=.34;
  out.put(...sun,1,0,0,rad,rad,2.1,.35,6,.19);
  for(let i=0;i<720;i++){
    const a=r()*TAU,rr=Math.sqrt(r())*rad;
    out.put(sun[0]+Math.cos(a)*rr,sun[1]+Math.sin(a)*rr,sun[2],1,0,0,.045+r()*.033,.026+r()*.024,.63,.46,6,r());
  }
  for(let i=0;i<8;i++){
    const x=-2.7+r()*1.7,y=.53+r()*.38,z=-6.5-r();
    stroke(out,[x-.05,y+.018,z],[x,y,z],.005,4,.8,.3,r());
    stroke(out,[x,y,z],[x+.043,y+.022,z],.004,4,.8,.3,r());
  }
  return out;
}

// Original ten-stroke 烏. Coordinates are a square calligraphy grid, Y downward.
// Its upper chamber is open inside (the distinguishing feature of 烏).
const glyphStrokes=[
  [[.49,.03],[.43,.11],[.34,.17]], [[.25,.16],[.245,.38],[.24,.60]],
  [[.25,.17],[.48,.158],[.70,.14],[.685,.27],[.68,.355]],
  [[.24,.355],[.49,.35],[.69,.345]], [[.25,.475],[.52,.46],[.82,.442]],
  [[.24,.592],[.46,.585],[.81,.564],[.79,.73],[.753,.876],[.71,.925],[.60,.855]],
  [[.225,.677],[.202,.773],[.142,.844]], [[.319,.678],[.356,.75],[.35,.817]],
  [[.435,.663],[.493,.72],[.514,.786]], [[.558,.646],[.62,.696],[.644,.748]]
];
export function glyphSamples(n,rng) {
  const segments=[];let sum=0;
  glyphStrokes.forEach((s,id)=>{
    for(let k=1;k<s.length;k++){
      const a=s[k-1],b=s[k],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);
      sum+=l;segments.push({a,dx,dy,l,end:sum,id});
    }
  });
  return Array.from({length:n},()=>{
    const value=rng()*sum,g=segments.find(s=>s.end>=value),t=1-(g.end-value)/g.l;
    const nx=g.dx/g.l,ny=g.dy/g.l,w=(rng()-.5)*(g.id<6?.082:.065)*(.65+.48*Math.sin(Math.PI*t));
    return {x:g.a[0]+g.dx*t-ny*w-.48,y:.49-(g.a[1]+g.dy*t+nx*w),dx:nx,dy:-ny};
  });
}

// Anatomy is sampled directly into the cloud. Local +X is beak-first, +Z the
// right wing; primaries remain individually separated along their outer ends.
export function crowForm() {
  const rng=random(5701),out=[];
  function splat(p,axis,l,w,tone,mass,wing=0,water=.42){
    out.push({p,axis:unit(axis),l,w,tone,mass,wing,water,seed:rng()});
  }
  function ellipsoid(c,r,n,kind){
    for(let i=0;i<n;i++){
      const u=rng()*2-1,a=rng()*TAU,s=Math.sqrt(1-u*u);
      const p=[c[0]+r[0]*s*Math.cos(a),c[1]+r[1]*u,c[2]+r[2]*s*Math.sin(a)];
      const light=u*.58+s*Math.sin(a)*.32, tone=kind===3?3:light>.50&&rng()<.56?1:0;
      splat(p,[-1,-.24+.35*u,.11*Math.sin(a)],.013+rng()*.020,.004+rng()*.011,tone,1.8+rng()*.9);
    }
  }
  function feather(base,tip,width,wing,tone,rows=13) {
    const axis=unit(sub(tip,base)),length=len(sub(tip,base));
    // Overlapping vanes make a continuous blade with dry, serrated barbs at its edges.
    for(let i=0;i<4;i++){
      const t=(i+.5)/4,c=lerp3(base,tip,t);
      c[1]+=.020*Math.sin(t*Math.PI)*(wing?1:-1);
      splat(c,axis,length*.28,width*(.42+.64*Math.sin(t*Math.PI))*(1-.35*t),0,3.7,wing,.16);
    }
    for(let j=0;j<rows;j++){
      const t=(j+.25+rng()*.5)/rows,c=lerp3(base,tip,t),curve=Math.sin(t*Math.PI);
      c[1]+=.025*curve*(wing?1:-1);
      const w=width*(.20+.8*curve**.65)*(1-.45*t);
      for(let k=-1;k<=1;k++){
        const off=w*k*.52;
        splat([c[0]-off*axis[2],c[1]+.003*rng(),c[2]+off*axis[0]],axis,.019+rng()*.022,w*.73+.0015,
          k===1&&j%3===0&&tone!==3?1:tone,2.05,wing,.17+.29*rng());
      }
    }
  }
  // Broad layered fan, long primary fingers and shorter grey-edged coverts.
  for(const s of [-1,1]) {
    for(let k=0;k<10;k++){
      const t=k/9;
      feather([.065-.15*t,.015+.012*t,s*(.065+.07*(1-t))],
        [.046-.40*t,.075-.10*t,s*(.625-.28*t)],.040-.010*t,s,k%4===2?1:0);
    }
    for(let k=0;k<8;k++){
      const t=k/7;
      feather([.07-.13*t,.048,s*.043],[.097-.29*t,.073-.05*t,s*(.39-.15*t)],.033,s,k%3===1?1:0,8);
    }
  }
  for(let k=-3;k<=3;k++){
    feather([-.125,-.045,k*.009],[-.46+.015*Math.abs(k),-.104+.008*Math.abs(k),k*.028],.025,0,0,9);
  }
  for(let i=0;i<18;i++){
    const t=i/17;
    splat([-.18+.37*t,.003+.050*t,0],[1,.14,0],.060,.061*(.64+.6*Math.sin(t*Math.PI)),0,4.0,0,.18);
  }
  ellipsoid([-.012,.012,0],[.213,.093,.093],325);
  ellipsoid([.128,.076,0],[.10,.104,.074],150);
  ellipsoid([.183,.139,0],[.093,.073,.068],180);
  for(let j=0;j<110;j++){
    const t=rng(),s=(rng()*2-1)*(1-t);
    splat([.235+t*.145,.151-.035*t+(rng()-.53)*.053*(1-t),s*.042],
      [1,-.19,0],.018,.005+.008*(1-t),j%6===0?1:0,2.4);
  }
  for(const s of [-1,1]){
    // A tiny bone-coloured catchlight is readable against the black ocular feathering.
    splat([.207,.157,s*.066],[1,0,0],.010,.009,1,4);
    splat([.210,.159,s*.069],[1,0,0],.004,.0037,3,4.5,0,.15);
    feather([-.037,-.059,s*.042],[-.084,-.120,s*.043],.008,0,0,4);
    feather([-.084,-.119,s*.043],[-.126,-.118,s*.052],.004,0,0,3);
  }
  return out;
}

export function adversary(batch,p,t,health,threat,hit) {
  if(health===0&&hit<=0)return;
  const rng=random(333),x=p[0],y=p[1],z=p[2];
  const sway=Math.sin(t*1.65)*.025;
  // Robe folds lengthen into dry-brush tails. A pale mask and cinnabar hem
  // keep the opponent readable behind a nearer black seal.
  for(let i=0;i<345;i++){
    const u=rng()*2-1,v=rng(),base=.093+.17*v;
    const px=x+u*base+sway*v+.024*Math.sin(v*9+t*2)*v;
    const py=y+.10-v*.61+rng()*.035, pz=z+(1-u*u)*.08;
    batch.put(px,py,pz,u*.24+sway,-1,.1,.040+v*.080,.015+rng()*.024,
      hit>0?1.25:1.65,.58,i%9===0?1:0,rng());
  }
  for(let i=0;i<122;i++){
    const a=rng()*TAU,rr=Math.sqrt(rng());
    batch.put(x+Math.cos(a)*rr*.093,y+.19+Math.sin(a)*rr*.127,z+.11, .15,-1,.1,.037,.018,1.8,.46,0,rng());
  }
  for(let i=0;i<70;i++){
    const u=rng()*2-1,v=rng();
    batch.put(x+u*.052*(1-.54*v),y+.183-v*.100,z+.155,.5,-1,0,.017,.009,1.5,.43,i%7?3:4,rng());
  }
  // A tilted bamboo hat, dark left sleeve and wind-borne cinnabar scarf.
  for(let i=0;i<115;i++){
    const u=rng()*2-1,top=1-Math.abs(u),rise=.134*top*rng();
    batch.put(x+u*.214,y+.207+rise+u*.028,z+.125,1,.17,0,.046,.014,2.25,.40,i%6===0?1:0,rng());
  }
  stroke(batch,[x-.253,y+.166,z+.17],[x+.228,y+.239,z+.17],.013,0,3.8,.26,.36,.30);
  stroke(batch,[x-.062,y+.106,z+.16],[x+.057,y+.122,z+.16],.019,2,3.2,.42,.41,.31);
  let tail=[x+.031,y+.10,z+.15];
  for(let k=1;k<=9;k++){
    const q=k/9,end=[x+.031+q*.36,y+.10+q*.065+.040*Math.sin(q*6-t*2.6)*q,z+.15-.07*q];
    stroke(batch,tail,end,.014*(1-.73*q),2,2.25,.35,.33);tail=end;
  }
  stroke(batch,[x-.068,y+.06,z+.11],[x-.240,y-.089,z+.15],.043,0,3,.37,.51);
  stroke(batch,[x-.24,y-.085,z+.15],[x-.295,y-.018,z+.2],.029,0,2.7,.34,.67);
  for(let i=0;i<26;i++){
    const u=i/25;batch.put(x-.110+u*.22,y-.115+.042*u,z+.15,1,.18,0,.018,.008,1.8,.32,2,rng());
  }
  for(const side of [-1,1]){
    stroke(batch,[x+.09*side,y-.43,z+.02],[x+.10*side,y-.54,z+.035],.025,0,2.2,.5,.36);
    stroke(batch,[x+.10*side,y-.54,z+.04],[x+.10*side-.043,y-.556,z+.07],.014,0,2.1,.43,.3);
  }
  for(let i=0;i<3;i++)
    batch.put(x+(i-1)*.058,y+.52,z,1,.55,0,.024,.009,i<health?3:.45,.32,i<health?2:4,.24);
  if(threat>0){
    for(let i=0;i<85;i++){
      const a=TAU*i/85+t*3,r=.37;
      batch.put(x+Math.cos(a)*r,y+Math.sin(a)*r,z+.11,-Math.sin(a),Math.cos(a),0,.026,.009,threat*1.8,.6,2,i/85);
    }
  }
}
