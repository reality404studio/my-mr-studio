// Metres and seconds at the input boundary. Water and pigment are separate
// relative loads, integrated over area; there is no pressure sensor requirement.
export const BRUSH_STEP = 1 / 120;
export const PAPER_STEP = 1 / 30;
export const BRUSH_WIDTH = 0.12;
const PACKET_SIZE = 10;
const TUFTS = 29;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, k) => a + (b - a) * k;
const smooth = x => x * x * (3 - 2 * x);

function hash(x, y, seed) {
  let h = Math.imul(x + seed, 0x45d9f3b) ^ Math.imul(y + 137, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
function noise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y), a = smooth(x-i), b = smooth(y-j);
  return mix(mix(hash(i,j,seed),hash(i+1,j,seed),a),mix(hash(i,j+1,seed),hash(i+1,j+1,seed),a),b);
}

// Particle-to-surface transfer. No photograph is used in the simulated paper.
export class InkPaper {
  constructor(width, height, metresPerCell, seed = 1281) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || !(metresPerCell > 0))
      throw new RangeError('Invalid paper dimensions');
    this.width=width; this.height=height; this.cell=metresPerCell; this.area=metresPerCell**2;
    const n=width*height;
    this.water=new Float32Array(n); this.mobile=new Float32Array(n); this.fixed=new Float32Array(n);
    this.dw=new Float32Array(n); this.dm=new Float32Array(n);
    this.tooth=new Float32Array(n); this.permX=new Float32Array(n); this.permY=new Float32Array(n);
    this.paperRGB=new Uint8ClampedArray(n*4);
    this.diffusionRate=.000040/(metresPerCell**2);
    this.packets=new Float64Array(PACKET_SIZE*384);
    this.buildPaper(seed); this.clear();
  }
  buildPaper(seed) {
    const {width,height}=this;
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const j=y*width+x, sx=x*this.cell*465, sy=y*this.cell*465;
      const fiber=noise(sx*.11+sy*.09,sy*.83-sx*.23,seed);
      const cross=noise(sx*.64+sy*.31,sy*.18-sx*.076,seed+7);
      const fleck=hash(x,y,seed+2), cloud=noise(sx*.062,sy*.059,seed+12);
      const tooth=clamp(.34*fiber+.21*cross+.25*fleck+.20*cloud);
      this.tooth[j]=tooth;
      this.permX[j]=.32+1.25*fiber**2+.32*cloud;
      this.permY[j]=.22+1.40*cross**2+.29*(1-cloud);
      const grain=(tooth-.5)*26+(cloud-.5)*8+(fleck-.5)*5;
      this.paperRGB.set([239+grain,233+grain,217+grain,255],j*4);
    }
  }
  clear() {
    for (const a of [this.water,this.mobile,this.fixed,this.dw,this.dm]) a.fill(0);
    this.count=0; this.emitted=0; this.lostWater=0; this.wetClock=0;
    this.bounds=[this.width,this.height,-1,-1]; this.changed=true;
  }
  wetAt(x,y) {
    const ix=clamp(Math.floor(x/this.cell),0,this.width-1), iy=clamp(Math.floor(y/this.cell),0,this.height-1);
    return this.water[iy*this.width+ix];
  }
  parcel(x,y,tx,ty,major,minor,water,pigment,mobility,split) {
    if (this.count===this.packets.length/PACKET_SIZE) this.flush();
    const a=this.packets;let j=this.count++*PACKET_SIZE;
    a[j++]=clamp(x,0,(this.width-1)*this.cell); a[j++]=clamp(y,0,(this.height-1)*this.cell);
    a[j++]=tx; a[j++]=ty; a[j++]=major; a[j++]=minor;
    a[j++]=water; a[j++]=pigment; a[j++]=mobility; a[j]=split;
    this.emitted++;
  }
  flush() {
    for (let i=0;i<this.count;i++) this.scatter(i*PACKET_SIZE);
    this.count=0;
  }
  scatter(j) {
    const a=this.packets, px=a[j]/this.cell, py=a[j+1]/this.cell, tx=a[j+2],ty=a[j+3];
    const long=Math.max(1.06,a[j+4]/this.cell), wide=Math.max(1.01,a[j+5]/this.cell);
    const ex=1.12*(Math.abs(tx)*long+Math.abs(ty)*wide), ey=1.12*(Math.abs(ty)*long+Math.abs(tx)*wide);
    const x0=Math.max(0,Math.floor(px-ex)),x1=Math.min(this.width-1,Math.ceil(px+ex));
    const y0=Math.max(0,Math.floor(py-ey)),y1=Math.min(this.height-1,Math.ceil(py+ey));
    const gain=a[j+9],invL=1/long,invW=1/wide, n=this.width;
    let sum=0;
    // Normalize the grain-masked footprint before it receives any mass.
    // A clipped stroke has a closed boundary at the edge of the study sheet.
    for(let pass=0;pass<2;pass++){
      const water=a[j+6]/(sum*this.area||1),m=a[j+7]/(sum*this.area||1),mobile=a[j+8];
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const dx=x-px,dy=y-py,along=(dx*tx+dy*ty)*invL,across=(-dx*ty+dy*tx)*invW;
        const r2=along*along+across*across;
        const k=y*n+x, edge=.79+.43*this.tooth[k];
        if(r2>=edge)continue;
        const grain=clamp((this.tooth[k]-.22)*2.3,.10,1.25);
        const weight=(1-r2/edge)**1.35*mix(1,grain*grain,gain);
        if(!pass){sum+=weight;continue;}
        this.water[k]+=water*weight; this.mobile[k]+=m*weight*mobile; this.fixed[k]+=m*weight*(1-mobile);
      }
      if(!sum)break;
    }
    if(!sum){
      const k=Math.round(py)*n+Math.round(px);
      this.water[k]+=a[j+6]/this.area;this.fixed[k]+=a[j+7]/this.area;
    }
    const b=this.bounds;b[0]=Math.min(b[0],x0);b[1]=Math.min(b[1],y0);b[2]=Math.max(b[2],x1);b[3]=Math.max(b[3],y1);
    this.changed=true;
  }
  transfer(i,j,permeability,dt) {
    const w=this.water,gap=w[i]-w[j];
    if(Math.abs(gap)<.00004)return;
    const source=gap>0?i:j, dest=gap>0?j:i, sourceWater=w[source];
    const wet=sourceWater/(sourceWater+.32);
    // Four neighbour edges read the same old state. Each may withdraw at most 1/4.
    const flow=Math.min(.245*sourceWater,Math.abs(gap)*dt*this.diffusionRate*permeability*(.14+.86*wet));
    const pigment=flow/(sourceWater+.000001)*this.mobile[source]*(.17+.81*wet);
    this.dw[source]-=flow;this.dw[dest]+=flow;this.dm[source]-=pigment;this.dm[dest]+=pigment;
  }
  step(dt=PAPER_STEP) {
    if(!(dt>=0&&Number.isFinite(dt)))throw new RangeError('Invalid simulation duration');
    this.flush(); this.wetClock+=dt;
    while(this.wetClock+1e-9>=PAPER_STEP){ this.wetClock-=PAPER_STEP; this.soak(PAPER_STEP); }
  }
  soak(dt) {
    const b=this.bounds;if(b[2]<b[0])return;
    const w=this.water,m=this.mobile,f=this.fixed,n=this.width;
    const x0=Math.max(0,b[0]-1),y0=Math.max(0,b[1]-1),x1=Math.min(n-1,b[2]+1),y1=Math.min(this.height-1,b[3]+1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const i=y*n+x;
      if(x<x1)this.transfer(i,i+1,this.permX[i],dt);
      if(y<y1)this.transfer(i,i+n,this.permY[i],dt);
    }
    let activeX=n,activeY=this.height,right=-1,bottom=-1;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const i=y*n+x,water=Math.max(0,w[i]+this.dw[i]),ink=Math.max(0,m[i]+this.dm[i]);
      this.dw[i]=0;this.dm[i]=0;
      if(water===0&&ink===0)continue;
      const prev=w[i]; const sink=Math.min(water,dt*((.085+.23*this.tooth[i])*water/(water+.065)+.20*water));
      let remain=water-sink;
      const front=clamp((water-prev)/(dt+.0001)*.9);
      const fraction=Math.min(1,dt*(.38+.68/(.16+water)+.82*front)*(0.55+.86*this.tooth[i]));
      let mobile=ink*(1-fraction);
      if(remain<.0006){remain=0;mobile=0;}
      if(mobile<1e-7)mobile=0;
      this.lostWater+=(water-remain)*this.area;w[i]=remain;m[i]=mobile;f[i]+=ink-mobile;
      if(remain>0||mobile>0){activeX=Math.min(activeX,x);right=Math.max(right,x);activeY=Math.min(activeY,y);bottom=Math.max(bottom,y);}
    }
    b[0]=activeX;b[1]=activeY;b[2]=right;b[3]=bottom;this.changed=true;
  }
  render(pixels) {
    const bg=this.paperRGB,m=this.mobile,f=this.fixed;
    for(let i=0,j=0;i<f.length;i++,j+=4){
      const tr=Math.exp(-1.58*(f[i]+m[i]));
      pixels[j]=17+(bg[j]-17)*tr;pixels[j+1]=18+(bg[j+1]-18)*tr;pixels[j+2]=17+(bg[j+2]-17)*tr;pixels[j+3]=255;
    }
    this.changed=false;
  }
  mass() {
    this.flush();let water=0,mobile=0,fixed=0;
    for(let i=0;i<this.fixed.length;i++){water+=this.water[i];mobile+=this.mobile[i];fixed+=this.fixed[i];}
    return {water:water*this.area,mobile:mobile*this.area,fixed:fixed*this.area,lostWater:this.lostWater};
  }
}

// Latest verified hand sample is fed again while contact continues, even at zero
// velocity. End contact or call lift() immediately when the hand becomes untracked.
export class InkBrush {
  constructor(paper,{diameter=BRUSH_WIDTH,water=.64,pigment=.78,fill=1,seed=32}={}) {
    if(!(diameter>0))throw new RangeError('Brush diameter must be positive');
    this.paper=paper;this.diameter=diameter;this.seed=seed;this.down=false;
    this.weights=new Float64Array(TUFTS);
    this.bundle=Array.from({length:TUFTS},(_,i)=>({
      offset:((i+.32+.36*hash(i,1,seed))/TUFTS)*2-1,
      phase:hash(i,2,seed)*Math.PI*2,
      length:hash(i,3,seed), split:hash(i,4,seed)
    }));
    this.reload(water,pigment,fill);
  }
  reload(water=this.wetness,pigment=this.strength,fill=this.fill) {
    this.wetness=clamp(water);this.strength=clamp(pigment);this.fill=clamp(fill,.01,1);
    const area=this.diameter**2*this.fill;
    this.fullWater=this.water=area*13*this.wetness;
    this.fullPigment=this.pigment=area*14*this.strength;
  }
  begin(x,y,t=0,contact=1) {
    if(this.down)this.lift();
    if(!Number.isFinite(x+y+t+contact))return;
    this.down=true;this.inputX=this.x=x;this.inputY=this.y=y;this.time=t;this.next=t+BRUSH_STEP;
    this.contact=clamp(contact);this.speed=0;this.dwell=0;this.elapsed=0;this.path=0;
    this.tx=1;this.ty=0;this.hasDirection=false;this.stationary=true;
    this.bucketDistance=0;this.bucketTime=0;
  }
  sample(x,y,t,contact=1) {
    if(!this.down||!Number.isFinite(x+y+t+contact)||t<=this.time)return;
    const gap=t-this.time;
    if(gap>.15||Math.hypot(x-this.inputX,y-this.inputY)>.065+3.2*gap){this.lift();return;}
    while(this.next<=t+1e-9){
      const k=clamp((this.next-this.time)/gap);
      this.advance(mix(this.inputX,x,k),mix(this.inputY,y,k),mix(this.contact,clamp(contact),k));
      this.next+=BRUSH_STEP;
    }
    this.time=t;this.inputX=x;this.inputY=y;this.contact=clamp(contact);
  }
  lift() {
    if(this.down && (this.bucketDistance||this.bucketTime))
      this.feed(this.bucketDistance,this.bucketTime,this.contact);
    this.down=false;this.bucketTime=0;this.bucketDistance=0;
  }
  advance(x,y,contact) {
    const dt=BRUSH_STEP,d=this.diameter;
    // The deadband is centred on the last accepted point, so slow motion
    // accumulates instead of being mistaken for indefinite dwell.
    const dx=x-this.x,dy=y-this.y;
    let ds=Math.hypot(dx,dy);
    if(ds<.009*d)ds=0;
    this.speed+=(ds/dt-this.speed)*(1-Math.exp(-dt/.048));
    if(this.speed>.067)this.stationary=false;
    if(this.speed<.030)this.stationary=true;
    this.dwell=this.stationary?this.dwell+dt:0;this.elapsed+=dt;
    const bx=this.x,by=this.y;
    if(ds){
      const follow=this.hasDirection?1-Math.exp(-ds/(d*.085)):1;
      this.tx=mix(this.tx,dx/ds,follow);this.ty=mix(this.ty,dy/ds,follow);
      const norm=Math.hypot(this.tx,this.ty);
      if(norm<.01){this.tx=dx/ds;this.ty=dy/ds;}else{this.tx/=norm;this.ty/=norm;}
      this.hasDirection=true;
    }
    const pieces=Math.max(1,Math.ceil(ds/(d*.033)));
    for(let k=1;k<=pieces;k++){
      if(ds){this.x=bx+dx*k/pieces;this.y=by+dy*k/pieces;}
      this.path+=ds/pieces;this.bucketDistance+=ds/pieces;this.bucketTime+=dt/pieces;
      if(this.bucketDistance>=d*.031 || this.bucketTime>=1/30-1e-9){
        this.feed(this.bucketDistance,this.bucketTime,contact);
        this.bucketDistance=0;this.bucketTime=0;
      }
    }
  }
  feed(ds,dt,contact) {
    if(contact<=0||(!this.water&&!this.pigment))return;
    const d=this.diameter, load=this.fullWater?this.water/this.fullWater:0;
    const wet=this.wetness*(.20+.80*load), pool=1-Math.exp(-this.dwell/.50);
    const wetPaper=this.paper.wetAt(this.x,this.y);
    const timed=dt/(1+.76*wetPaper+.80*this.dwell);
    const scale=contact**.92;
    const wm=Math.min(this.water,(.54*d*ds+2.35*d*d*timed)*wet*scale);
    const inkLoad=this.fullPigment?this.pigment/this.fullPigment:0;
    const pm=Math.min(this.pigment,(.49*d*ds+2.40*d*d*timed)*this.strength*(.12+.88*inkLoad)*scale);
    if(wm+pm<1e-12)return;
    const dry=clamp(1-wet+.16*clamp(this.speed/.8)-.10*pool);
    const press=(.35+.65*(1-Math.exp(-this.elapsed/.07-this.path/(d*.16))))*Math.sqrt(contact);
    const half=d*.5*press*(.80+.19*wet+.17*pool)/(1+.20*Math.min(1.3,this.speed));
    let weightSum=0;
    for(let i=0;i<TUFTS;i++){
      const b=this.bundle[i],outer=Math.abs(b.offset);
      const rhythm=.5+.5*Math.sin(this.path/d*4.2+b.phase);
      const open=clamp((b.split+.36*rhythm+.30*wet-.79*dry)*5,.008,1);
      const weight=(1-.62*outer**1.7)*open;
      this.weights[i]=weight;weightSum+=weight;
    }
    // At rest most of the time-fed load joins one rounded puddle. The brush
    // bundles still print their individual tracks underneath that wet volume.
    const parked=pool*pool*wet/(wet+.11)*.97;
    if(parked>.0001){
      const r=d*(.26+.69*Math.sqrt(pool))*(.68+.34*wet)*Math.sqrt(contact);
      this.paper.parcel(this.x,this.y,this.tx,this.ty,r*1.04,r,wm*parked,pm*parked,.70+.24*wet,.75);
    }
    for(let i=0;i<TUFTS;i++){
      const b=this.bundle[i],w=this.weights[i]/weightSum*(parked>.0001?1-parked:1);
      const sway=.018*Math.sin(this.path/d*3.2+b.phase);
      const lateral=half*(b.offset+sway)*(1-.47*pool);
      const lag=d*((b.length-.52)*(.095+.14*dry)+.070*Math.abs(b.offset));
      const x=this.x-this.ty*lateral-this.tx*lag,y=this.y+this.tx*lateral-this.ty*lag;
      const major=d*(.048+.072*wet+.030*b.length+.22*pool)+ds*.56;
      const minor=d*(.009+.052*wet+.010*(1-Math.abs(b.offset))+.140*pool)*(.65+.35*press);
      this.paper.parcel(x,y,this.tx,this.ty,major,minor,wm*w,pm*w,.10+.77*wet,dry);
    }
    this.water-=wm;this.pigment-=pm;
  }
}

// Bridge to my-mr-studio's SplatBatch.put layout. The fine sheet remains
// authoritative; compact splats sample deposited density for a frozen 3D plane.
export function writeInkSplats(paper,batch,origin,right,down,now=0) {
  paper.flush();batch.clear();
  if(batch.limit<1)return 0;
  const n=paper.width,h=paper.height,c=paper.cell;
  let stride=Math.max(1,Math.ceil(Math.sqrt(n*h/batch.limit)));
  while(Math.ceil(n/stride)*Math.ceil(h/stride)>batch.limit)stride++;
  for(let y=0;y<h;y+=stride)for(let x=0;x<n;x+=stride){
    const nx=Math.min(stride,n-x),ny=Math.min(stride,h-y);
    let mass=0,sx=0,sy=0;
    for(let dy=0;dy<ny;dy++)for(let dx=0;dx<nx;dx++){
      const i=(y+dy)*n+x+dx,q=paper.mobile[i]+paper.fixed[i];
      mass+=q;sx+=(x+dx)*q;sy+=(y+dy)*q;
    }
    const density=mass/(nx*ny);if(density<.006)continue;
    sx=sx/mass*c;sy=sy/mass*c;
    batch.put(origin[0]+right[0]*sx+down[0]*sy,origin[1]+right[1]*sx+down[1]*sy,
      origin[2]+right[2]*sx+down[2]*sy,right[0],right[1],right[2],
      nx*c*.83,ny*c*.83,density*2.15,0,0,hash(x,y,781),now);
  }
  return batch.count;
}
