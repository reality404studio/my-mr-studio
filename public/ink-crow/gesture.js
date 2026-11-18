// Stage coordinates are metres, +Y up, -Z forward from the initial head pose.
export const TAU = 2 * Math.PI;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const mix = (a, b, t) => a + (b - a) * t;
export const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul = (a,k) => [a[0]*k,a[1]*k,a[2]*k];
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const len = a => Math.hypot(...a);
export const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const unit = a => mul(a,1/(len(a)||1));
export const lerp3 = (a,b,t) => [mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];
export const onSeal = (s,x,y,z=0) => [
  s.c[0]+s.u[0]*x+s.v[0]*y+s.n[0]*z,
  s.c[1]+s.u[1]*x+s.v[1]*y+s.n[1]*z,
  s.c[2]+s.u[2]*x+s.v[2]*y+s.n[2]*z
];
export function random(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}

// Newell's area vector estimates the actual drawing plane. The bounds and angular
// tests act on arc-length samples so a slow corner cannot bias the fitted centre.
export function fitSeal(points, eye=[0,0,0]) {
  const n = points.length;
  if (n < 23) return null;
  let area=[0,0,0], mean=[0,0,0], length=0;
  const first=points[0];
  for (let i=0;i<n;i++) {
    const a=points[i], b=points[(i+1)%n];
    area=add(area,cross(sub(a,first),sub(b,first)));
    mean=add(mean,a);
    if (i+1<n) length+=dist(a,b);
  }
  if (len(area)<0.038) return null;
  mean=mul(mean,1/n);
  let normal=unit(area);
  if (dot(normal,sub(eye,mean))<0) normal=mul(normal,-1);
  let u=cross([0,1,0],normal);
  u=len(u)>.12?unit(u):unit(cross([0,0,1],normal));
  const v=cross(normal,u);
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity,depth2=0;
  for (const p of points) {
    const d=sub(p,mean),x=dot(d,u),y=dot(d,v);
    xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y);
    depth2+=dot(d,normal)**2;
  }
  const w=xmax-xmin,h=ymax-ymin,r=(w+h)*.25;
  if (r<.095 || r>.6 || Math.min(w,h)/Math.max(w,h)<.54 || Math.sqrt(depth2/n)>.27*r) return null;
  if (dist(first,points[n-1])>r*.82 || length<4.65*r || length>8.65*r) return null;
  const c=add(mean,add(mul(u,(xmin+xmax)*.5),mul(v,(ymin+ymax)*.5)));
  let last=0,winding=0,travel=0,error=0;
  for (let i=0;i<n;i++) {
    const d=sub(points[i],c), x=dot(d,u), y=dot(d,v), a=Math.atan2(y,x);
    if (i) { const diff=Math.atan2(Math.sin(a-last),Math.cos(a-last)); winding+=diff; travel+=Math.abs(diff); }
    last=a;
    error+=(Math.hypot(x,y)-r)**2;
  }
  if (Math.abs(winding)<5.36 || Math.abs(winding)<.80*travel || Math.sqrt(error/n)>.31*r) return null;
  return {c,u,v,n:normal,r,sign:Math.sign(winding)};
}

export function palmAtSeal(hand, s) {
  if (!hand?.open || !s) return false;
  const d=sub(hand.palm,s.c), depth=dot(d,s.n);
  return Math.abs(depth)<.19 && Math.hypot(dot(d,s.u),dot(d,s.v))<Math.max(.072,s.r*.58)
    && dot(hand.normal,s.n)<-.38;
}

// A proximal phalanx joint is at the knuckle. Use proximal-to-wrist scale
// for hand-size independence. The palm normal reverses with handedness.
export function classifyHand(joints, side, wasPinching=false) {
  const wrist=joints.wrist, index=joints['index-finger-phalanx-proximal'],
    pinky=joints['pinky-finger-phalanx-proximal'], tip=joints['index-finger-tip'],
    thumb=joints['thumb-tip'];
  if (!wrist||!index||!pinky||!tip||!thumb) return null;
  const knuckles=lerp3(index,pinky,.49);
  const palm=lerp3(wrist,knuckles,.63);
  const width=dist(index,pinky);
  if (width<.025) return null;
  const fingers=['index','middle','ring','pinky'];
  let straight=0,indexStraight=false,otherTracked=0;
  for (const f of fingers) {
    const base=joints[f+'-finger-phalanx-proximal'],end=joints[f+'-finger-tip'];
    if (!base||!end) continue;
    const axis=unit(sub(base,wrist)), extension=dot(sub(end,base),axis)/width;
    const extended=extension>(f==='pinky'?.38:.52);
    if (f==='index') indexStraight=extended; else otherTracked++;
    if (extended) straight++;
  }
  const pinch=dist(thumb,tip)<clamp(width*(wasPinching?.62:.43),wasPinching?.029:.019,wasPinching?.045:.032);
  const normal=mul(unit(cross(sub(index,wrist),sub(pinky,wrist))),side==='left'?-1:1);
  return {side,palm,normal,tip,pinch,draw:pinch||(indexStraight&&otherTracked>=2&&straight===1),
    open:!pinch&&straight>=3,joints};
}
