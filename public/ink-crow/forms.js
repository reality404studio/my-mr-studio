import {SplatBatch} from './ink.js?v=bns-phase2';
import {TAU, random, clamp, mix, smooth, lerp3, sub, unit, len} from './gesture.js?v=bns-phase2';

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
  // 1. Jeong Seon (겸재 정선 신묘년풍악도첩) vertical white/celadon granite crags (금강산 암봉과 수직 준법)
  for(let i=0;i<38;i++){
    const u=i/37*2-1, x=u*11.5+(r()-.5)*.35;
    const cluster=Math.exp(-u*u*2.2), spire=(.45+.55*Math.abs(Math.sin(x*1.7+.4)))*cluster;
    if(spire<.12)continue;
    const z=-10.8+Math.cos(x*.8)*.9+(r()-.5)*.4, base=-1.85+.35*cluster;
    const h=1.45+spire*2.95+r()*.45, w=.16+r()*.14;
    // Luminous white-jade granite face (백색/청백 화강암면)
    for(let k=0;k<7;k++){
      const q=k/6, py=base+h*q;
      out.put(x+(r()-.5)*.06,py,z, .04*(r()-.5),1,0, h*.19,w*(1.05-.42*q), .78,.72, k%3===0?5:3, r());
    }
    // Crisp dark vertical texture strokes (수직 준법 / 철선묘)
    for(let s=-1;s<=1;s+=2){
      const sx=x+s*w*(.48+r()*.18);
      stroke(out,[sx,base+.12,z+.04],[sx-.03*s,base+h*.96,z+.04],.032+r()*.014, i%3===0?0:1, 1.85,.32, r(),.35);
    }
    if(i%2===0){
      stroke(out,[x,base+.25,z+.05],[x+.02,base+h*.88,z+.05],.028,4,1.35,.48,r(),.4);
    }
  }
  // 2. Central cascading waterfall (비로봉/금강 폭포) & splash mist
  for(const wx of [-.65, 1.45]){
    const wz=-9.4, top=.75, bot=-1.75;
    for(let k=0;k<24;k++){
      const q=k/23, py=mix(top,bot,q), sway=.03*Math.sin(q*11+wx);
      out.put(wx+sway,py,wz+.08, .05,-1,0, .14,.032+.022*q, 1.35,.78, 3, r());
      if(k%2===0)out.put(wx+sway+(r()-.5)*.08,py,wz+.06, 0,-1,0, .11,.018, 1.1,.45, 1, r());
    }
    for(let m=0;m<16;m++){
      out.put(wx+(r()-.5)*.55,bot+.08+r()*.22,wz+.12, 1,0,0, .28+r()*.22,.11+r()*.08, .85,.82, 11, r());
    }
  }
  // 3. Layered rounded hills with hemp-fiber strokes (피마준) & rhythmic moss dots (미점)
  const banks=[
    [-14.2,-2.28,1.38,5,.82,1.2],[-10.4,-2.18,1.32,5,.98,2.4],
    [-7.4,-2.02,1.08,4,.88,4.1],[-5.1,-1.84,.94,4,1.06,5.7]
  ];
  for(let k=0;k<banks.length;k++){
    const [z,base,amp,tone,f,seed]=banks[k], extent=-z*1.72;
    for(let j=0;j<420;j++){
      const x=mix(-extent,extent,j/419), u=x/(-z), w=.22+Math.min(1,Math.abs(u)*1.75);
      const wave=.52*Math.sin(x*f*.92+seed)+.26*Math.sin(x*f*2.17+seed*2)+.11*Math.sin(x*5.1+seed);
      const y=base+amp*(.42+wave)*w-.15*Math.cos(u*2.4), brush=.38+r()*.48;
      // Soft bright wash body (담묵/청록/황토 담채)
      const washTone=k>=2&&j%7===0?7:k===1&&j%9===0?3:tone;
      out.put(x,y-brush*.72,z, .15*Math.sin(x*3.1+seed),1,0, brush,(-z)*.015, .26+k*.11,.88, washTone, r());
      // Long sweeping hemp-fiber ridge ribs (피마준 능선 결)
      if(j%2===0){
        const depth=.34+r()*.78, angle=.22*Math.cos(x*2.2+seed);
        out.put(x+angle*depth,y-depth*.80-.09,z+.02, angle,1,0, depth,(-z)*.016, .42,.62, k>=2?1:tone, r());
      }
      // Jeong Seon signature horizontal dark moss dots along ridge crests (능선 미점)
      if(j%3===0){
        out.put(x+(r()-.5)*.06,y-.03,z+.04, 1,.18*Math.sin(x*3),0, .065+r()*.085,.018+r()*.024, .82+k*.18,.42, k>=2?0:1, r());
      }
    }
  }
  // 4. Haegeumgang sea stacks (해금강 기암 바위섬) on left and right horizons
  for(const sx of [-5.8,-4.9, 4.7, 5.9, 6.6]){
    const sz=-6.4-r()*1.8, sy=-1.82, sh=.68+r()*.85, sw=.14+r()*.10;
    for(let k=0;k<7;k++){
      const q=k/6;
      out.put(sx+(r()-.5)*.04,sy+sh*q,sz, .06,1,0, sh*.18,sw*(1-.35*q), .95,.55, k%2?4:1, r());
    }
    stroke(out,[sx-sw*.4,sy,sz+.03],[sx-.02,sy+sh,sz+.03],.024,0,2.1,.30,r(),.3);
    for(let d=0;d<6;d++){
      out.put(sx+(r()-.5)*sw,sy+sh*(.65+r()*.38),sz+.04, 1,0,0, .035,.018, 1.6,.35, 0, r());
    }
  }
  // 5. Crooked Joseon pine groves (겸재 정선풍 소나무 솔숲)
  function pine(x,y,z,h,tone) {
    const bend=(r()-.45)*h*.28;
    stroke(out,[x,y,z],[x+bend*.5,y+h*.55,z],h*.026,7,1.65,.35,r(),.25);
    stroke(out,[x+bend*.5,y+h*.55,z],[x+bend,y+h,z],h*.020,tone,1.95,.28,r(),.35);
    for(let tier=0;tier<5;tier++)for(const side of [-1,1]){
      const t=tier/4, reach=h*(.28-.16*t)*(.68+r()*.48), by=y+h*(.26+t*.72), bx=x+bend*t;
      stroke(out,[bx,by,z],[bx+side*reach,by+h*(.015+.035*r()),z],h*(.024-.010*t),tone,1.35,.38,r());
      for(let i=0;i<5;i++){
        const q=r(), w=(.11-.055*t)*h;
        out.put(bx+side*reach*q,by+h*.028+r()*w*.40,z+.01, 1,.12*side,0, w*(.48+r()*.65),w*.32, 1.15,.44, i%3===0?0:tone, r());
      }
    }
  }
  for(const side of [-1,1]){
    for(let i=0;i<7;i++){
      const x=side*(1.95+r()*3.6), z=-4.2-r()*1.35;
      pine(x,-1.32+.16*Math.sin(x*2.9),z,.18+r()*.58, i%3===0?0:1);
    }
  }
  // 6. Drifting horizontal mountain mist bands (산허리를 감싸는 밝은 운해와 안개)
  const mistBands=[[-11.5,-1.15,14.5,.42],[-8.2,-1.35,11.0,.36],[-5.6,-1.52,8.2,.30],[-3.9,-1.62,5.8,.24]];
  for(const [mz,my,mext,mh] of mistBands){
    for(let i=0;i<85;i++){
      const u=i/84*2-1, mx=u*mext+(r()-.5)*.45;
      const myOff=my+.08*Math.sin(mx*.75+mz)+(r()-.5)*mh*.45;
      out.put(mx,myOff,mz, 1,.04*Math.cos(mx),0, .42+r()*.55,mh*(.45+r()*.55), .62+r()*.35,.85, i%4===0?3:11, r());
    }
  }
  // 7. Warm cinnabar seal sun & distant ink-wash birds in the sky
  const sun=[2.85,1.42,-8.2],rad=.32;
  out.put(...sun,1,0,0,rad,rad,1.65,.45,6,.19);
  for(let i=0;i<260;i++){
    const a=r()*TAU,rr=Math.sqrt(r())*rad;
    out.put(sun[0]+Math.cos(a)*rr,sun[1]+Math.sin(a)*rr,sun[2],1,0,0,.042+r()*.030,.024+r()*.022,.52,.52,6,r());
  }
  for(let i=0;i<12;i++){
    const x=-3.1+r()*2.4,y=.62+r()*.52,z=-6.8-r()*1.4,s=.045+r()*.035;
    stroke(out,[x-s,y+s*.38,z],[x,y,z],.006,0,1.4,.28,r());
    stroke(out,[x,y,z],[x+s*.92,y+s*.44,z],.005,1,1.1,.45,r());
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
  // 1. Eerie floating mist aura around the Dokkaebi-bul (요기 서린 안개 장막)
  for(let i=0;i<44;i++){
    const a=rng()*TAU+t*.35, rr=(.16+rng()*.38)*pulse;
    const mx=x+Math.cos(a)*rr, my=y-.12+(rng()-.45)*.34+.04*Math.sin(a*2+t), mz=z+Math.sin(a)*rr*.55;
    batch.put(mx,my,mz, Math.cos(a),.18*Math.sin(t+i),0, .14+rng()*.16,.065+rng()*.075, .70+threat*.38,.82, 11, rng());
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


