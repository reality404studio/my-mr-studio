import {SplatBatch} from './ink.js?v=bns-phase3';
import {TAU, random, clamp, mix, smooth, lerp3, sub, unit, len} from './gesture.js?v=bns-phase3';

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

  // Helper: Draw a curved-eave Joseon mountain pavilion (몽유도원도 기와 누각) in crisp dark ink
  function pavilion(cx,cy,cz,sc){
    // Stone terrace foundation
    out.put(cx,cy-sc*.18,cz, 1,0,0, sc*.52,sc*.14, 1.8,.42, 0, r());
    // Four slender pillars + warm dim lantern ember inside
    for(const px of [-.34,-.12,.12,.34]){
      stroke(out,[cx+px*sc,cy-sc*.12,cz+.01],[cx+px*sc,cy+sc*.20,cz+.01],sc*.034,0,2.1,.28,r(),.1);
    }
    out.put(cx,cy+sc*.06,cz+.015, 1,0,0, sc*.11,sc*.08, .95,.72, 7, r());
    // Lower & upper upturned sweeping tiled roofs (추녀 곡선 기와지붕)
    for(const [ry,rw,rh] of [[.22,.56,.11],[.39,.40,.10]]){
      stroke(out,[cx-rw*sc,cy+(ry+.05)*sc,cz+.02],[cx,cy+(ry+rh)*sc,cz+.02],sc*.055,0,2.3,.28,r(),.2);
      stroke(out,[cx,cy+(ry+rh)*sc,cz+.02],[cx+rw*sc,cy+(ry+.05)*sc,cz+.02],sc*.055,0,2.3,.28,r(),.2);
      stroke(out,[cx-rw*.88*sc,cy+ry*sc,cz+.025],[cx+rw*.88*sc,cy+ry*sc,cz+.025],sc*.032,1,1.6,.42,r(),.1);
    }
    // Warm golden rim kiss on roof ridge facing the upper-right god-rays
    stroke(out,[cx+sc*.02,cy+sc*.49,cz+.03],[cx+sc*.36,cy+sc*.42,cz+.03],sc*.018,7,1.25,.55,r(),.3);
  }

  // Helper: Draw gnarled Dark-Souls / Mongyudowondo twisted plum-peach branches with glowing golden blossoms
  function blossomTree(ox,oy,oz,dirX,scale,blossomDensity=1){
    let cur=[ox,oy,oz];
    const segs=7;
    for(let s=0;s<segs;s++){
      const t=s/(segs-1);
      const nx=cur[0]+dirX*scale*(.34+.14*Math.sin(s*1.9))*(.92-.38*t);
      const ny=cur[1]+scale*(.20+.18*Math.cos(s*1.4)-.10*t);
      const nz=cur[2]+(r()-.5)*.08;
      const w=scale*(.078*(1-.62*t));
      stroke(out,cur,[nx,ny,nz],w,0,2.45,.26,r(),.25);
      // Sub-twig forking upward/outward with luminous warm peach-gold blossoms
      if(s>=2){
        const side=s%2===0?1:-1;
        const tx=nx+dirX*scale*(.22+r()*.20), ty=ny+scale*(.14+side*.12+r()*.14), tz=nz+.04;
        stroke(out,[nx,ny,nz],[tx,ty,tz],w*.58,0,2.1,.30,r(),.4);
        const buds=Math.round((5+r()*6)*blossomDensity);
        for(let b=0;b<buds;b++){
          const q=.25+r()*.85;
          const bx=mix(nx,tx,q)+(r()-.5)*scale*.18;
          const by=mix(ny,ty,q)+(r()-.5)*scale*.16;
          const bz=tz+.02+(r()-.5)*.05;
          const br=scale*(.034+r()*.030);
          out.put(bx,by,bz, 1,0,0, br*1.12,br, 1.55,.58, b%4===0?6:7, r());
          if(b%3===0){
            out.put(bx,by,bz+.01, 1,0,0, br*1.45,br*1.45, .92,.92, 12, r());
          }
        }
      }
      cur=[nx,ny,nz];
    }
  }

  // 1. Massive Dark-Ink Gyeomjae Jeong Seon Craggy Granite Peaks (인왕제색도/금강전도 다크 부벽준)
  // Framing cathedral-like valleys: towering peaks left & right, stepping back into golden-lit central spires
  const peaks=[
    // Far golden-lit Mongyudowondo central spires (catching warm god-rays!)
    [-3.8,-2.1,-13.8,4.6,1.35,1,.35],[-1.6,-2.0,-14.4,3.8,1.05,4,.65],[.2,-1.9,-13.6,3.4,.95,4,.95],
    [1.9,-2.0,-14.2,4.1,1.15,4,.85],[3.9,-2.1,-13.5,4.8,1.35,1,.55],
    // Midground towering dark crags (left & right cathedral cliffs)
    [-8.4,-2.2,-10.2,5.8,1.85,0,.15],[-5.6,-2.1,-10.6,5.2,1.55,0,.22],[-2.9,-2.0,-11.2,4.9,1.35,0,.35],
    [3.1,-2.0,-10.8,4.6,1.45,0,.50],[5.8,-2.1,-10.0,5.3,1.65,0,.35],[8.6,-2.2,-9.6,5.9,1.85,0,.20],
    // Near dramatic cliff buttresses framing the dark valley edges
    [-6.2,-2.2,-6.8,3.6,1.35,0,.12],[5.8,-2.2,-6.6,3.5,1.30,0,.18]
  ];
  for(const [px,base,pz,h,w,bodyTone,sunKiss] of peaks){
    // Broad pyramidal Sumi-e rocky silhouette built from overlapping vertical axe-cut strokes (부벽준)
    for(let col=-3;col<=3;col++){
      const u=col/3, colH=h*(1-Math.abs(u)*.42)*(.88+r()*.22);
      const cx=px+u*w*.68;
      for(let k=0;k<7;k++){
        const q=k/6, py=base+colH*q;
        const segW=w*(.28+.18*(1-q))*(1-Math.abs(u)*.25);
        // Dark obsidian core on shadow side, smoky slate-teal on mist side
        const tCol=col>0&&sunKiss>.55&&q>.55?4:(bodyTone===0&&col<=0?0:1);
        out.put(cx+(r()-.5)*.09,py,pz+col*.03, .06*u,1,0, colH*.20,segW, 1.35,.55, tCol, r());
      }
      // Organic diagonal Jeong Seon axe-cut granite facets (부벽준 — no thin straight poles!)
      const ribTilt=(u<0?-1:1)*.26+(r()-.5)*.14;
      for(let k=1;k<=5;k++){
        const q=k/6, py=base+colH*q;
        const ribW=w*(.13+.08*(1-q));
        out.put(cx+ribTilt*q*.25,py,pz+.08, ribTilt,1,0, colH*.16,ribW, 1.55,.58, 0, r());
      }
    }
    // Golden god-ray rim kiss along the sunlit slope of central/right peaks
    if(sunKiss>.30){
      const rx=px+w*.16;
      for(let k=0;k<5;k++){
        const q=k/4, gy=base+h*(.48+.42*q);
        out.put(mix(rx,px+.04,q),gy,pz+.11, -.22,1,0, h*.14,w*.12*sunKiss, .85*sunKiss,.72, 7, r());
      }
    }
    // Signature dark moss dots (미점) scattered across shoulders
    for(let d=0;d<10;d++){
      const dx=px+(r()-.5)*w*1.15, dy=base+h*(.28+r()*.56);
      out.put(dx,dy,pz+.10, 1,.2*(r()-.5),0, .075+r()*.065,.024+r()*.020, 1.8,.36, 0, r());
    }
  }

  // 2. Mongyudowondo Perched Korean Pavilions & Dark Souls Ruined Fortress Wall + Waterfall
  pavilion(-3.95,0.68,-7.8,.52);    // Left cliffside dark pavilion overlooking the valley
  pavilion(-0.85,-0.55,-10.2,.36);  // Distant misty valley sanctuary pavilion
  pavilion(4.75,0.38,-7.4,.44);     // Right upper cliff pavilion

  // Right-side ruined stone fortress battlements & arched aqueduct bridge (고성벽과 아치교)
  const fx=2.45, fy=-0.18, fz=-8.8;
  stroke(out,[fx-.55,fy,fz],[fx+1.35,fy+.22,fz],.12,0,2.2,.34,r(),.08);
  stroke(out,[fx-.55,fy+.16,fz+.02],[fx+1.35,fy+.36,fz+.02],.05,1,1.6,.44,r(),.1);
  for(let b=0;b<7;b++){
    const bx=fx-.48+b*.29, by=fy+.18+b*.034;
    out.put(bx,by+.09,fz+.03, 0,1,0, .11,.055, 2.2,.30, 0, r()); // crenellations
  }
  // Tower keep on fortress left edge
  out.put(fx-.38,fy+.34,fz+.02, 0,1,0, .36,.18, 2.3,.32, 0, r());
  stroke(out,[fx-.56,fy+.56,fz+.04],[fx-.20,fy+.56,fz+.04],.045,7,.95,.55,r(),.1);
  // Cascading silver-mist waterfall plunging beneath the ruined bridge!
  for(let k=0;k<22;k++){
    const q=k/21, wy=mix(fy-.08,-1.95,q), sway=.035*Math.sin(q*10);
    out.put(fx+.32+sway,wy,fz+.08, .04,-1,0, .15,.038+.024*q, 1.05,.78, 5, r());
    if(k%2===0)out.put(fx+.32+sway+(r()-.5)*.06,wy,fz+.10, 0,-1,0, .12,.018, 1.15,.65, 3, r());
  }

  // 3. Layered Dark Ink Valley Ridges & Mirror-Pond Shoreline (어두운 산맥과 먹빛 수면)
  const banks=[
    [-12.6,-2.35,1.15,1,.78,1.1],[-9.2,-2.18,1.02,1,.94,2.3],
    [-6.4,-2.04,.84,0,.86,4.0],[-4.4,-1.88,.68,0,1.08,5.6]
  ];
  for(let k=0;k<banks.length;k++){
    const [z,base,amp,tone,f,seed]=banks[k], extent=-z*1.70;
    for(let j=0;j<240;j++){
      const x=mix(-extent,extent,j/239), u=x/(-z), edgeLift=.25+Math.min(1.1,Math.abs(u)*1.85);
      const wave=.50*Math.sin(x*f*.90+seed)+.24*Math.sin(x*f*2.1+seed*2);
      const y=base+amp*(.38+wave)*edgeLift-.22*Math.cos(u*2.2), brush=.34+r()*.42;
      out.put(x,y-brush*.68,z, .14*Math.sin(x*3+seed),1,0, brush,(-z)*.018, .48+k*.18,.78, tone, r());
      if(j%3===0){
        out.put(x+(r()-.5)*.06,y-.02,z+.04, 1,.16*Math.sin(x*3),0, .065+r()*.075,.020+r()*.022, 1.35,.38, 0, r());
      }
    }
  }

  // 4. Framing Gnarled Dark Peach-Blossom Branches (좌·우 전경/중경 몽유도원도 복사꽃 고목!)
  blossomTree(-4.35,-1.45,-5.1, 1.0, 1.18, 1.30);  // Left curving upward from rocky crag
  blossomTree(4.25, 1.18,-4.8,-1.0, 1.12, 1.35);   // Right sweeping organically across upper-right corner!
  blossomTree(4.35,-1.35,-5.8,-1.0, 0.88, 0.90);   // Right lower cliff bonsai branch

  // 5. Ethereal Mongyudowondo Misty Valley Fog Banks (운해 — 깊이와 대비를 살리는 연무)
  const mistBands=[[-11.8,-1.18,13.5,.46],[-8.6,-1.40,10.2,.38],[-5.9,-1.58,7.6,.30],[-4.1,-1.70,5.6,.22]];
  for(const [mz,my,mext,mh] of mistBands){
    for(let i=0;i<56;i++){
      const u=i/55*2-1, mx=u*mext+(r()-.5)*.45;
      const myOff=my+.09*Math.sin(mx*.75+mz)+(r()-.5)*mh*.42;
      const nearCenter=Math.exp(-u*u*2.5);
      out.put(mx,myOff,mz, 1,.04*Math.cos(mx),0, .44+r()*.48,mh*(.42+r()*.48), (.32+.28*nearCenter),.86, 11, r());
    }
  }

  // 6. Drifting Warm Golden Peach Petals Floating Through the God-Rays (흩날리는 금빛 복사꽃잎)
  for(let i=0;i<42;i++){
    const px=(r()*2-1)*4.6, py=-.95+r()*2.85, pz=-4.4-r()*3.4;
    const ang=r()*TAU, sz=.022+r()*.020;
    out.put(px,py,pz, Math.cos(ang),Math.sin(ang),0, sz*1.45,sz*.65, 1.35,.55, i%4===0?6:7, r());
    if(i%3===0){
      out.put(px,py,pz+.02, 1,0,0, sz*1.8,sz*1.8, .90,.92, 12, r());
    }
  }
  return out;
}

// Expressive cursive/semi-cursive 鳥 (새 조) modeled after Image 1 reference:
// 11 strokes in authentic brush order: top crown press & long sweeping dry-brush left skirt,
// folded head chamber with two inner slits, central spine, dramatic rising right-wing slash
// with heavy wedge fold, wide sweeping lower body hook, and 4 bold 연화발 dots.
export const glyphStrokes=[
  // 0: Top head press -> long sweeping left diagonal with dry-brush tail (좌측 긴 갈필 삐침)
  [[.44,.06],[.47,.10],[.41,.22],[.31,.40],[.20,.61],[.11,.79],[.06,.91]],
  // 1: Head upper horizontal & right vertical turn
  [[.39,.13],[.56,.11],[.64,.14],[.60,.26],[.56,.36]],
  // 2: Inner head eye horizontal 1
  [[.37,.22],[.49,.20],[.59,.21]],
  // 3: Inner head horizontal closure 2
  [[.33,.34],[.46,.32],[.57,.33]],
  // 4: Central neck/chest vertical spine
  [[.34,.34],[.31,.47],[.28,.59]],
  // 5: Dramatic rising right-wing slash & thick wedge return (우측 위로 솟는 날개 꺾임획)
  [[.30,.47],[.53,.39],[.77,.30],[.91,.25],[.94,.29],[.78,.37],[.54,.45]],
  // 6: Wide curved lower body & upward dry-brush tail hook (하단 둥근 몸통 및 갈고리)
  [[.28,.57],[.52,.53],[.75,.52],[.84,.58],[.83,.73],[.74,.88],[.62,.94],[.53,.86],[.49,.74]],
  // 7..10: Four expressive bottom dots (연화발 4점)
  [[.24,.67],[.21,.76],[.18,.83]],
  [[.36,.66],[.36,.75],[.35,.82]],
  [[.48,.64],[.50,.73],[.50,.80]],
  [[.60,.62],[.65,.70],[.67,.77]]
];

export function glyphSamples(n,rng) {
  const segments=[];let sum=0;
  glyphStrokes.forEach((s,id)=>{
    for(let k=1;k<s.length;k++){
      const a=s[k-1],b=s[k],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);
      sum+=l;segments.push({a,dx,dy,l,end:sum,id,seg:k-1,segs:s.length-1});
    }
  });
  return Array.from({length:n},()=>{
    const value=rng()*sum,g=segments.find(s=>s.end>=value),t=1-(g.end-value)/g.l;
    const progress=(g.seg+t)/g.segs;
    const nx=g.dx/g.l,ny=g.dy/g.l;
    // Heavy press at wing corner (id 5), lower hook (id 6), and dots (id 7..10);
    // Dry-brush bristle split (갈필) at the tail of stroke 0 and stroke 6.
    const baseW=g.id===5?.096:g.id===6?.088:g.id===0?.084:g.id>=7?.076:.064;
    const dry=(g.id===0&&progress>.58)||(g.id===6&&progress>.72);
    const split=dry?(rng()>.5?.42:-.42)*(progress-.55):(rng()-.5);
    const w=split*baseW*(.68+.52*Math.sin(Math.PI*t));
    return {
      x:g.a[0]+g.dx*t-ny*w-.49,
      y:.49-(g.a[1]+g.dy*t+nx*w),
      dx:nx,dy:-ny,
      order:value/sum,
      strokeId:g.id,
      dry
    };
  });
}

// Minimalist Sumi-e ink-wash bird flock (먹 농담 새떼, modeled after Image 2 top-right birds).
// Returns a flock of 9 calligraphic birds with dark 농묵 leading wing edges and head/spine,
// fading into translucent 중묵/담묵 trailing wing washes, forked tails, and trailing ink feathers.
export function crowForm() {
  const rng=random(5701),out=[];
  const flock=[
    {id:0,scale:1.00,delay:0.00,offset:[0,0,0],flapPhase:0.0,flapRate:1.00},
    {id:1,scale:0.84,delay:0.05,offset:[-.15, .13,-.19],flapPhase:0.9,flapRate:1.08},
    {id:2,scale:0.82,delay:0.08,offset:[ .18, .10,-.22],flapPhase:2.1,flapRate:1.05},
    {id:3,scale:0.76,delay:0.12,offset:[-.28,-.07,-.32],flapPhase:3.4,flapRate:1.14},
    {id:4,scale:0.74,delay:0.15,offset:[ .26,-.11,-.36],flapPhase:1.6,flapRate:1.12},
    {id:5,scale:0.68,delay:0.19,offset:[-.11, .24,-.44],flapPhase:4.2,flapRate:1.18},
    {id:6,scale:0.66,delay:0.22,offset:[ .14, .22,-.49],flapPhase:5.1,flapRate:1.20},
    {id:7,scale:0.62,delay:0.25,offset:[-.35, .09,-.56],flapPhase:2.8,flapRate:1.24},
    {id:8,scale:0.60,delay:0.28,offset:[ .34, .06,-.61],flapPhase:0.5,flapRate:1.26}
  ];
  for(const bird of flock){
    const bs=bird.scale;
    function splat(p,axis,l,w,tone,mass,wing=0,water=.48){
      out.push({
        p:[p[0]*bs,p[1]*bs,p[2]*bs],
        axis:unit(axis),
        l:l*bs,w:w*bs,tone,mass,wing,water,seed:rng(),
        flockId:bird.id,birdScale:bs,delay:bird.delay,
        offset:bird.offset,flapPhase:bird.flapPhase,flapRate:bird.flapRate
      });
    }
    // 1. Sleek dark 농묵 head, sharp beak, and brush-stroke spine (먹 농담 몸통과 머리)
    for(let i=0;i<24;i++){
      const t=i/23, x=-.16+.38*t, y=.005+.042*Math.sin(t*Math.PI)+.018*t;
      const w=.034*(.45+.75*Math.sin(t*Math.PI))*(1-.25*t);
      splat([x,y,(rng()-.5)*.012],[1,.15,0],.038+rng()*.018,w, i>18?0:i%5===0?1:0, 3.4, 0, .26+.22*rng());
    }
    // Sharp calligraphy beak & luminous cyan/white BnS eye star-flare
    for(let i=0;i<8;i++){
      const t=i/7;
      splat([.22+t*.11,.032-.014*t,0],[1,-.14,0],.024*(1-.3*t),.012*(1-.72*t),0,3.6,0,.18);
    }
    for(const s of [-1,1]){
      splat([.185,.042,s*.026],[1,0,0],.019,.019,12,2.4,0,.05);
    }
    // Soft 담묵/중묵 belly & back ink wash halo (몸통 농담 번짐)
    for(let i=0;i<22;i++){
      const u=rng(), a=rng()*TAU;
      splat([-.10+u*.26, .01+.022*Math.sin(a), .028*Math.cos(a)],[1,.08,0],
        .042+rng()*.026,.022+rng()*.016, i%3===0?4:1, 1.35, 0, .74+.20*rng());
    }
    // 2. Swept-back crescent Sumi-e wings (초승달/낫 모양 먹 농담 날개)
    // Leading edge: crisp dark 농묵 (Tone 0) + electric cyan/white energy filament (Tone 9).
    for(const s of [-1,1]){
      // Leading edge dark ink bone stroke (날개 앞전 농묵 뼈대획)
      for(let i=0;i<20;i++){
        const t=i/19, reach=.03+t*.54;
        const wx=.09-.24*t*t-.06*t, wy=.022+.055*Math.sin(t*Math.PI)-.035*t, wz=s*reach;
        const ax=[-.38-.35*t, .12-.28*t, s*.85];
        splat([wx,wy,wz],ax,.046*(1-.25*t),.022*(1-.48*t), 0, 3.6, s, .24+.18*t);
        if(i%6===2){
          // Soft organic celadon/cyan spirit glint along leading wing curve (no straight needles; curved 3D trails handle motion!)
          splat([wx+.010,wy+.008,wz],ax,.020,.020, 12, 1.15, s, .08);
        }
      }
      // Layered ink-wash feather strokes trailing backward (농담 그라데이션 깃털 번짐)
      for(let k=0;k<11;k++){
        const t=k/10, reach=.05+t*.50;
        const leadX=.08-.23*t*t-.05*t, leadY=.020+.052*Math.sin(t*Math.PI)-.032*t, wz=s*reach;
        const chord=(.22-.11*t)*(.78+.35*Math.sin(t*Math.PI));
        for(let row=0;row<7;row++){
          const v=(row+.25+rng()*.4)/7; // 0 = leading edge (농묵), 1 = trailing edge (담묵)
          const fx=leadX-v*chord, fy=leadY-.018*v+.008*Math.sin(v*Math.PI), fz=wz+s*v*.035*(1-t);
          const fAxis=[-.86, -.12-.14*v, s*(.28+.24*t)];
          const tone=v<.26?0:v<.58?1:v<.82?4:5;
          const mass=v<.26?2.9:v<.58?1.85:v<.82?1.15:.72;
          const water=v<.26?.32:v<.58?.64:.86;
          splat([fx,fy,fz],fAxis,.036+v*.024,(.018+.014*(1-v))*(1-.35*t), tone, mass, s, water);
        }
      }
      // Detached ink-feather tips & subtle gold-dust / cyan glint off the wingtips
      for(let d=0;d<8;d++){
        const t=.35+rng()*.65, reach=.06+t*.52;
        const fx=-.12-.26*t-(rng()*.09), fy=.01+(rng()-.5)*.04, fz=s*(reach+.03*rng());
        const isGlint=d===7;
        splat([fx,fy,fz],[-.92,(rng()-.5)*.3,s*.25],
          isGlint?.022:.028+rng()*.022, isGlint?.022:.007+rng()*.007,
          isGlint?12:d%3===0?0:1, isGlint?1.5:1.75, s, isGlint?.82:.58+.32*rng());
      }
    }
    // 3. Forked swallow/crow calligraphic tail (날렵한 갈래 먹선 꼬리)
    for(const s of [-1,0,1]){
      const spread=s*.095;
      for(let i=0;i<8;i++){
        const t=i/7, tx=-.15-t*(s===0?.20:.31), ty=-.005-.032*t, tz=spread*t*(.7+.3*t);
        splat([tx,ty,tz],[-1,-.12,spread*.35],.034*(1-.2*t),.013*(1-.55*t), i<4?0:1, 2.4*(1-.3*t), 0, .35+.45*t);
      }
    }
  }
  return out;
}

// Amorphous floating Dokkaebi-bul (부정형의 떠 있는 도깨비불) with deep obsidian ink flames,
// blazing crimson/amber-gold spirit-fire core, gold star-flares, drifting mist, and orbiting ink droplets.
export function adversary(batch,p,t,health,threat,hit) {
  if(health===0&&hit<=0)return;
  const rng=random(333),x=p[0],y=p[1]+.05*Math.sin(t*2.1),z=p[2];
  const pulse=1+.12*Math.sin(t*3.8)+threat*.22+hit*.35;
  // 1. Eerie floating mist aura around the Dokkaebi-bul (tuned for Quest 3S <= 4.5 m^2 overdraw budget)
  for(let i=0;i<20;i++){
    const a=rng()*TAU+t*.35, rr=(.15+rng()*.34)*pulse;
    const mx=x+Math.cos(a)*rr, my=y-.12+(rng()-.45)*.30+.04*Math.sin(a*2+t), mz=z+Math.sin(a)*rr*.55;
    batch.put(mx,my,mz, Math.cos(a),.18*Math.sin(t+i),0, .11+rng()*.09,.052+rng()*.042, .75+threat*.38,.82, 11, rng());
  }
  // 2. Amorphous shifting dark-ink flame body (부정형 흑염/먹물 소용돌이 본체)
  for(let i=0;i<320;i++){
    const u=rng(), a=rng()*TAU;
    const lobe=1+.34*Math.sin(a*3+t*2.4)+.22*Math.cos(a*2-t*3.1)+.15*Math.sin(u*8-t*4.2);
    const rad=(.06+.22*Math.sin(u*Math.PI)*lobe)*pulse*(1-.28*u);
    const sway=.065*Math.sin(u*5.5-t*3.6)*u+.035*Math.cos(u*3.2+t*2.2);
    const px=x+Math.cos(a)*rad+sway;
    const py=y-.22+u*.58+.04*Math.sin(a*2+t*3)*u;
    const pz=z+Math.sin(a)*rad*.75;
    const tx=-Math.sin(a)*.35+sway*1.8, ty=1.1, tz=Math.cos(a)*.25;
    const tone=i%11===0?2:i%5===0?1:0;
    batch.put(px,py,pz, tx,ty,tz, .038+u*.062,.016+rng()*.026, (hit>0?1.35:2.05)*(1-.35*u),.54+.32*rng(), tone, rng());
  }
  // 3. Swirling tendrils of black ink & spirit fire rising from the core (피어오르는 부정형 먹불길 촉수)
  for(let s=0;s<7;s++){
    const baseA=s*TAU/7+t*1.15;
    let prev=[x+Math.cos(baseA)*.08,y-.10,z+Math.sin(baseA)*.06];
    for(let k=1;k<=7;k++){
      const q=k/7, a=baseA+q*2.2+Math.sin(t*2.8+s)*.45;
      const rr=(.09+.19*q)*pulse*(1-.25*q);
      const next=[
        x+Math.cos(a)*rr+.04*Math.sin(q*6-t*4+s),
        y-.08+q*.48+.03*Math.cos(q*5+t*3),
        z+Math.sin(a)*rr*.7
      ];
      stroke(batch,prev,next,.032*(1-.45*q), s%3===0?2:s%2===0?0:1, 1.85,.72, rng(),.52);
      prev=next;
    }
  }
  // 4. Blazing spectral spirit-fire core (도깨비불 귀화 코어 - 붉은 주홍/금빛 광채)
  for(let i=0;i<110;i++){
    const a=rng()*TAU+t*2.6, rr=Math.pow(rng(),.68)*.17*pulse;
    const h=(rng()-.42)*.26*pulse;
    const px=x+Math.cos(a)*rr+.02*Math.sin(t*5+h*12);
    const py=y+.02+h, pz=z+.06+Math.sin(a)*rr*.6;
    const tone=i%3===0?10:i%4===1?7:2;
    batch.put(px,py,pz, .2*Math.cos(a),1,0, .032+rng()*.042,.015+rng()*.022, 2.2+threat*.9,.45, tone, rng());
  }
  // 5. Fiery gold/crimson star-flares & organic flame embers around the Dokkaebi-bul (no rigid needles)
  const sparkCount=18+Math.floor(threat*20+hit*18);
  for(let i=0;i<sparkCount;i++){
    const a=i*TAU/sparkCount+t*2.9, rr=(.12+rng()*.26)*pulse;
    const px=x+Math.cos(a)*rr, py=y+.02+(rng()-.5)*.28, pz=z+.08+Math.sin(a)*rr*.6;
    const isStar=i%2===0;
    const sx=-Math.sin(a)*.4, sy=1., sz=Math.cos(a)*.25;
    batch.put(px,py,pz, sx,sy,sz,
      isStar?.040+rng()*.030:.026+rng()*.018,
      isStar?.040+rng()*.030:.018+rng()*.014,
      1.55+threat*1.15, isStar?.92:.58, isStar?12:10, rng());
  }
  // 6. Floating & dripping round ink droplets (주변에 흩뿌려져 떠다니는 먹물 방울)
  for(let i=0;i<60;i++){
    const a=i*TAU/60-t*(.85+(i%5)*.22), orbit=(.20+.26*((i*17)%29)/29)*pulse;
    const bob=.22*Math.sin(t*2.3+i*1.7);
    const px=x+Math.cos(a)*orbit, py=y+.02+bob, pz=z+Math.sin(a)*orbit*.75;
    const rad=.009+.014*((i*13)%19)/19;
    batch.put(px,py,pz, 1,0,0, rad*1.15,rad, 2.35,.88, i%7===0?2:0, rng());
  }
  // 7. Three orbiting Soul-Fire HP wisps above the Dokkaebi-bul (상단 도깨비 영혼불 체력 표시)
  for(let i=0;i<3;i++){
    const alive=i<health;
    const wx=x+(i-1)*.11, wy=y+.44+.018*Math.sin(t*3.5+i*2.1), wz=z+.05;
    batch.put(wx,wy,wz, 0,1,0, .034,.022, alive?2.8:.45,.45, alive?10:4, .24+i*.17);
    if(alive){
      batch.put(wx,wy+.012,wz+.01, 1,0,0, .048,.048, 1.9,.92, 12, .51+i*.13);
      batch.put(wx,wy-.005,wz-.01, 0,1,0, .045,.028, 1.8,.62, 0, .19+i*.21);
    }
  }
  // 8. Threat charging halo of crimson/gold flame wisps & stars (no flat needle dashes)
  if(threat>0){
    for(let i=0;i<48;i++){
      const a=TAU*i/48+t*3.6, rr=.34*(1-.18*threat);
      const isStar=i%4===0;
      batch.put(x+Math.cos(a)*rr,y+.02+Math.sin(a)*rr,z+.11, -Math.sin(a),Math.cos(a),0,
        isStar?.032+.018*threat:.024+.014*threat, isStar?.032+.018*threat:.018+.008*threat,
        threat*2.1, isStar?.95:.55, isStar?12:i%2===0?10:2, i/48);
    }
  }
}


