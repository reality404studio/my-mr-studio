import {STRIDE} from './ink.js?v=d556bb3';
import {random} from './gesture.js?v=d556bb3';

const quadVert=`#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 center;
layout(location=2) in vec3 axis;
layout(location=3) in vec2 halfSize;
layout(location=4) in vec4 material;
layout(location=5) in float born;
uniform mat4 view,projection;
uniform float time;
uniform vec3 sheetDown;
out vec2 uv;
flat out vec4 ink;
flat out float spread;
flat out float eyeSafe;
void main(){
  if(material.x<=.002 || halfSize.x<=0. || halfSize.y<=0.){
    gl_Position=vec4(0.,0.,-2.,1.);uv=vec2(0.);ink=material;spread=1.;eyeSafe=0.;return;
  }
  if(material.z>7.5 && material.z<8.5){
    vec3 world=center+axis*(corner.x*halfSize.x)+sheetDown*(corner.y*halfSize.y);
    vec4 vp=view*vec4(world,1.);
    gl_Position=projection*vp;uv=corner;ink=material;spread=1.;eyeSafe=1.;return;
  }
  vec4 p=view*vec4(center,1.);
  if(p.z>-.035){
    gl_Position=vec4(0.,0.,-2.,1.);uv=vec2(0.);ink=material;spread=1.;eyeSafe=0.;return;
  }
  vec3 cameraAxis=mat3(view)*axis;
  vec2 a=cameraAxis.xy-cameraAxis.z*p.xy/min(-.035,p.z);
  float l=length(a);
  vec2 along=l>.0001?a/l:vec2(1.,0.);
  float isFx=step(8.5,material.z);
  float dried=1.-exp(-max(time-born,0.)*1.65);
  spread=mix(1.+material.y*.62*dried,1.,isFx);
  vec2 extent=halfSize*vec2(mix(max(.26,min(l,1.)),1.,step(11.5,material.z)),spread);
  // Quest 3S AddEyeSafe: smoothly fade oversized mist/glow splats near the eyes.
  float maxR=max(extent.x,extent.y);
  float safe=clamp((-p.z-maxR*1.35-.085)/max(.06,maxR*.9),0.,1.);
  if(safe<=.004){
    gl_Position=vec4(0.,0.,-2.,1.);uv=vec2(0.);ink=material;spread=1.;eyeSafe=0.;return;
  }
  p.xy+=along*corner.x*extent.x+vec2(-along.y,along.x)*corner.y*extent.y;
  gl_Position=projection*p; uv=corner; ink=material; eyeSafe=safe;
}`;

const inkFrag=`#version 300 es
precision mediump float;
in vec2 uv;
flat in vec4 ink;
flat in float spread;
flat in float eyeSafe;
uniform sampler2D grain;
uniform float opacity;
uniform highp float time;
uniform float passthrough;
out vec4 color;

// Option A Palette: Deep Sumi-e Black Ink + Celadon/Cyan (#38F5E6) + Pure White + Gold Dust
vec3 palette(float i){
  if(i<.5) return vec3(.026,.035,.044);   // 0: Deep obsidian sumi-e black (농묵)
  if(i<1.5) return vec3(.095,.168,.196);  // 1: Cool slate-teal mid-ink (청중묵)
  if(i<2.5) return vec3(.78,.145,.075);   // 2: Dokkaebi crimson (귀화 진주홍)
  if(i<3.5) return vec3(.96,.985,.985);   // 3: Pure luminous ivory-white
  if(i<4.5) return vec3(.19,.355,.395);   // 4: Celadon ink wash (청담묵)
  if(i<5.5) return vec3(.48,.635,.655);   // 5: Misty jade-silver (은청)
  if(i<6.5) return vec3(.84,.285,.165);   // 6: Cinnabar seal sun
  return vec3(.95,.77,.35);               // 7: Antique gold-dust (금분)
}

void main(){
  float op=opacity*eyeSafe;
  if(op<=.002) discard;

  // Tone 8: WorldWash Enso paper deposit
  if(ink.z>7.5 && ink.z<8.5){
    vec2 weights=max(vec2(0.),1.-abs(uv));
    float tooth=texture(grain,uv*.35+ink.w*vec2(5.3,3.1)).r;
    float alpha=1.-exp(-1.72*ink.x*weights.x*weights.y*(.84+.32*tooth)*op);
    vec3 sumi=vec3(.026,.035,.043)+vec3(.012,.024,.028)*(tooth*.5);
    color=vec4(sumi*alpha,alpha);return;
  }

  // Tone 9: Blade & Soul Razor Celadon/Cyan Light Slash (청옥/순백 섬광 참격)
  if(ink.z>=8.5 && ink.z<9.5){
    float flow=texture(grain,vec2(uv.x*.45-time*.85,uv.y*.9)+ink.w*vec2(3.7,6.1)).a;
    float yWarp=uv.y+(flow-.5)*.14;
    float taper=1.-smoothstep(.45,1.,abs(uv.x));
    float core=exp(-30.*yWarp*yWarp)*exp(-1.7*uv.x*uv.x);
    float blade=exp(-5.8*yWarp*yWarp)*exp(-1.15*uv.x*uv.x)*(.65+.35*taper);
    float a=clamp(ink.x*(core*1.45+blade*.62),0.,1.)*op;
    vec3 cyan=vec3(.14,.95,.90);
    vec3 deepTeal=vec3(.04,.58,.64);
    vec3 hot=vec3(.96,1.,1.);
    vec3 col=mix(mix(deepTeal,cyan,clamp(blade*1.3,0.,1.)),hot,clamp(core*1.35,0.,1.));
    // _AlphaShare single-pass dual blend: crisp on paper, radiant additive glow on passthrough
    float alphaShare=mix(.46,.16,passthrough);
    float boost=mix(1.45,1.95,passthrough);
    color=vec4(col*a*boost,a*alphaShare);return;
  }

  // Tone 10: Dokkaebi-bul Crimson/Amber Spirit Flame (도깨비불 귀화)
  if(ink.z>=9.5 && ink.z<10.5){
    float r2=dot(uv,uv);if(r2>1.)discard;
    vec2 j=texture(grain,uv*.42+vec2(0.,-time*.55)+ink.w*vec2(5.1,3.7)).ra;
    float edge=max(0.,r2+(j.x-.5)*.30+(j.y-.5)*.14);
    float core=exp(-5.6*edge);
    float flame=exp(-1.85*edge)*(1.-smoothstep(.62,1.,edge));
    float a=clamp(ink.x*(core*1.05+flame*.62),0.,1.)*op;
    vec3 fire=mix(vec3(.88,.14,.05),vec3(1.,.78,.24),clamp(core*1.25,0.,1.));
    fire=mix(fire,vec3(1.,.97,.82),clamp(core*core*1.4,0.,1.));
    float alphaShare=mix(.52,.24,passthrough);
    color=vec4(fire*a*1.55,a*alphaShare);return;
  }

  // Tone 11: Living Sumi-e Spirit Mist (유동하는 수묵 운기)
  if(ink.z>=10.5 && ink.z<11.5){
    float r2=dot(uv,uv);if(r2>1.)discard;
    vec2 flowUv=uv*vec2(.32,.46)+vec2(time*.09,-time*.05)+ink.w*vec2(3.1,6.7);
    vec4 n1=texture(grain,flowUv);
    vec4 n2=texture(grain,flowUv*1.65+vec2(-time*.06,n1.a*.28));
    float cloud=n1.r*.58+n2.r*.42;
    float wisp=exp(-1.95*max(0.,r2+(cloud-.5)*.34))*(.45+.55*cloud)*(1.-smoothstep(.58,1.,r2));
    float a=(1.-exp(-ink.x*wisp*.78))*op;
    vec3 mistDark=mix(vec3(.16,.30,.34),vec3(.07,.16,.20),passthrough);
    vec3 mistLight=mix(vec3(.80,.93,.92),vec3(.24,.78,.78),passthrough*.55);
    vec3 mist=mix(mistDark,mistLight,clamp(cloud*1.15,0.,1.));
    float alphaShare=mix(.68,.38,passthrough);
    color=vec4(mist*a,a*alphaShare);return;
  }

  // Tone 12: Procedural 4-Point Star Flare & Gold-Dust Glint (성광/금분 글린트)
  if(ink.z>=11.5){
    float r2=dot(uv,uv);if(r2>1.)discard;
    float twinkle=.74+.26*sin(time*10.5+ink.w*47.1);
    float crossFlare=pow(max(0.,1.-abs(uv.x*uv.y)*20.),5.)*exp(-2.6*r2);
    float diagFlare=pow(max(0.,1.-abs((uv.x+uv.y)*(uv.x-uv.y))*14.),6.)*exp(-4.2*r2)*.42;
    float halo=exp(-7.2*r2);
    float intensity=clamp(ink.x*(crossFlare*1.35+diagFlare+halo*.88)*twinkle,0.,1.5)*op;
    // ink.y (water) selects hue: 0 = Electric Cyan/White, 1 = Gold Dust
    vec3 cyanCore=mix(vec3(.18,.96,.90),vec3(.98,1.,1.),clamp(halo*1.3+crossFlare*.6,0.,1.));
    vec3 goldCore=mix(vec3(.96,.72,.22),vec3(1.,.97,.82),clamp(halo*1.3+crossFlare*.6,0.,1.));
    vec3 col=mix(cyanCore,goldCore,clamp(ink.y,0.,1.));
    float alphaShare=mix(.42,.10,passthrough);
    float boost=mix(1.45,2.10,passthrough);
    color=vec4(col*intensity*boost,clamp(intensity,0.,1.)*alphaShare);return;
  }

  // Standard Sumi-e Brush & Ink Splats (Tones 0..7)
  float r2=dot(uv,uv);
  if(r2>1.) discard;
  vec4 tex=texture(grain,uv*vec2(.28,.62)+ink.w*vec2(7.37,2.71));
  float edge=max(0.,r2+(tex.r-.5)*.28);
  float water=ink.y;
  float core=exp(-2.45*edge*spread*spread);
  float wash=exp(-1.65*edge)/spread;
  // Anisotropic bristle tooth (tex.g) produces authentic dry-brush splits at low water
  float drySplit=mix(.24,1.,smoothstep(.16,.62,tex.g+.40*water));
  float stain=water*(.10+clamp((spread-1.)*1.4,0.,1.)*.16);
  float rimOffset=sqrt(max(.001,edge))-.70;
  // Soft organic sumi-e water edge (no hard bullseye ring!)
  float rim=exp(-16.*rimOffset*rimOffset)/spread;
  float density=ink.x*(core*.78+wash*(.22-stain*.45)+rim*stain*.55)*drySplit*(1.-smoothstep(.64,1.,edge));
  float a=(1.-exp(-density))*op;
  vec3 pigment=palette(ink.z)*(1.+.16*(tex.r-.5));
  // Subtle metallic gold shimmer for Tone 7 (금분)
  if(ink.z>6.5 && ink.z<7.5){
    float glint=pow(tex.b,2.4)*(.6+.4*sin(time*7.5+ink.w*31.4));
    pigment+=vec3(.35,.28,.12)*glint;
  }
  color=vec4(pigment*a,a);
}`;

// Dedicated Layer 1 3D SVG-SDF 鳥 Seal Shader (single quad, razor-sharp jet-black calligraphy + BnS cyan/gold rim)
const sealVert=`#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 view,projection;
uniform vec3 sealCenter,sealRight,sealUp,sealNormal;
uniform float sealRadius,time;
uniform vec4 sealParams; // x: writeProgress, y: charge, z: dissolve, w: alpha
out vec2 uv;
flat out float eyeSafe;
void main(){
  float charge=sealParams.y;
  float tremor=(sin(time*44.)*.0018+cos(time*61.)*.0012)*charge*charge*sealRadius;
  float span=sealRadius*.93*(1.+.045*sealParams.z);
  vec3 world=sealCenter
    +sealRight*(corner.x*span+tremor)
    +sealUp*(corner.y*span-tremor*.7)
    +sealNormal*(.0045+.008*charge);
  vec4 vp=view*vec4(world,1.);
  vec4 vc=view*vec4(sealCenter,1.);
  eyeSafe=clamp((-vc.z-.12)/.16,0.,1.);
  gl_Position=projection*vp;
  uv=vec2(corner.x*.5+.5,.5-corner.y*.5);
}`;

const sealFrag=`#version 300 es
precision mediump float;
in vec2 uv;
flat in float eyeSafe;
uniform sampler2D grain;
uniform sampler2D glyphSdf;
uniform highp float time;
uniform float passthrough;
uniform highp vec4 sealParams; // x: writeProgress, y: charge, z: dissolve, w: alpha
out vec4 color;

void main(){
  float masterAlpha=sealParams.w*eyeSafe;
  if(masterAlpha<=.002) discard;

  vec4 g=texture(glyphSdf,uv);
  float sdf=g.r;         // 0.5 = exact calligraphy contour, >0.5 inside, <0.5 outside
  float inkMask=g.g;     // crisp rasterized brush mask & dry-brush splatters
  float strokeOrd=g.b;   // 0..1 top-to-bottom calligraphic ignition order
  float radial=g.a;      // 0..1 radial distance from seal center

  // Multi-scale ink & energy noise
  vec4 nBase=texture(grain,uv*2.4);
  vec4 nFlow=texture(grain,uv*1.9+vec2(time*.16,-time*.22));
  vec4 nSpark=texture(grain,uv*5.4+vec2(-time*.12,time*.10));

  float writeP=sealParams.x;
  float charge=sealParams.y;
  float dissolve=sealParams.z;

  // 1. Calligraphic reveal sweep
  float revealEdge=writeP*1.22-(nBase.r-.5)*.14;
  float reveal=smoothstep(strokeOrd-.10,strokeOrd+.03,revealEdge);
  float writeFront=exp(-pow((strokeOrd-revealEdge)*14.,2.))*smoothstep(.02,.18,writeP)*(1.-smoothstep(.88,1.,writeP));

  // 2. Noise-eroded ink dissolve into 9 crows during release
  float erodeField=nBase.r*.62+(1.-radial)*.38;
  float dissCut=dissolve*1.28;
  float dissMask=1.-smoothstep(erodeField-.14,erodeField+.05,dissCut);
  float burnEdge=smoothstep(.02,.52,dissMask)*(1.-smoothstep(.52,.98,dissMask))*smoothstep(.01,.10,dissolve);

  float vis=reveal*dissMask*masterAlpha;
  if(vis<=.002) discard;

  // 3. True Jet-Black Sumi-e Ink Core (preserve real dry-brush 갈필 holes via inkMask!)
  float sdfCore=smoothstep(.492,.514,sdf+(nBase.r-.5)*.010);
  // Honor actual SVG cutouts & dry-brush texture from inkMask while keeping edges anti-aliased
  float body=clamp(min(sdfCore,smoothstep(.12,.68,inkMask)+smoothstep(.54,.64,sdf)*.25)*(.90+.10*nBase.g),0.,1.);
  // Also preserve detached ink splatters from original SVG
  body=max(body,smoothstep(.35,.75,inkMask)*(.88+.12*nBase.g));
  float inkA=body*vis;

  // 4. Blade & Soul Option A Luminous Rim strictly outside the obsidian ink silhouette!
  float outsideOnly=smoothstep(.512,.490,sdf);
  float hotRim=exp(-pow((sdf-.492)*46.,2.))*smoothstep(.38,.514,sdf);
  float outerDist=max(0.,.496-sdf);
  float outerHalo=exp(-pow(outerDist*7.8,2.))*smoothstep(.16,.500,sdf)*outsideOnly*(.74+.26*nFlow.r);
  // Traveling radial energy wave sweeping across the rim during charge
  float wavePos=fract(time*.58+charge*.35);
  float waveBand=exp(-pow((radial-wavePos)*5.5,2.))*(.20+.95*charge);
  // Very subtle metallic cyan sheen on the ink surface only right on the traveling wave crest
  float innerSheen=body*waveBand*pow(charge,1.5)*nBase.g*.14;
  // Gold-dust (금분) micro-sparkle dancing on the rim, dry-brush edges, and burn front
  float goldSpark=pow(nSpark.b,3.1)*(.65+.35*sin(time*11.+nBase.b*30.))*(hotRim*1.65+burnEdge*2.2+writeFront*1.6+body*.22*charge);

  // True obsidian Sumi-e ink (#04060A) with subtle wet-brush tonal depth
  vec3 inkCol=vec3(.014,.018,.024)+vec3(.018,.026,.032)*(nBase.g*.45);
  vec3 cyan=vec3(.14,.96,.90);       // #24F5E6 Electric Celadon/Cyan
  vec3 deepTeal=vec3(.01,.58,.64);   // High-contrast teal-cyan backing on light paper
  vec3 hotWhite=vec3(.97,1.,1.);
  vec3 gold=vec3(1.,.80,.34);

  vec3 haloTone=mix(mix(deepTeal,cyan,clamp(.42+charge*.58,0.,1.)),cyan,passthrough);
  vec3 rimGlow=
    haloTone*outerHalo*(.68+1.35*charge+waveBand*.90)*vis +
    mix(cyan,hotWhite,.62)*hotRim*(.55+1.35*charge+waveBand*.85)*vis*outsideOnly;

  vec3 accentGlow=
    cyan*innerSheen*vis +
    hotWhite*(writeFront*.95+burnEdge*1.5)*body*vis +
    gold*(goldSpark*2.2+burnEdge*.85*body)*vis;

  vec3 totalGlow=rimGlow+accentGlow;
  float glowBoost=mix(1.18,1.72,passthrough);
  float glowAlphaShare=mix(.54,.16,passthrough);
  float glowLum=clamp(max(totalGlow.r,max(totalGlow.g,totalGlow.b)),0.,1.);

  // Premultiplied single-pass composite: pure obsidian ink silhouette framed by blazing cyan/white/gold rim
  vec3 outRgb=inkCol*inkA + totalGlow*glowBoost;
  float outA=clamp(inkA + glowLum*glowAlphaShare*(1.-inkA),0.,1.);
  color=vec4(outRgb,outA);
}`;

const paperVert=`#version 300 es
layout(location=0) in vec2 a;out vec2 uv;
void main(){gl_Position=vec4(a,0.,1.);uv=a*.5+.5;}`;

const paperFrag=`#version 300 es
precision mediump float;
in vec2 uv;uniform sampler2D grain;out vec4 color;
void main(){
  float g=texture(grain,gl_FragCoord.xy/256.).r;
  float fiber=texture(grain,gl_FragCoord.xy/vec2(380.,190.)).g;
  float cloud=texture(grain,uv*1.25).a;
  float edge=dot(uv-.5,uv-.5);
  // Subtle cool-warm antique hanji paper that makes deep black ink & cyan glow pop cleanly
  vec3 paper=mix(vec3(.958,.952,.918),vec3(.868,.862,.822),clamp(.12+edge*.62+cloud*.18,0.,1.));
  color=vec4(paper+(g-.5)*.024+(fiber-.5)*.012,1.);
}`;

const hudVert=`#version 300 es
layout(location=0) in vec2 a;uniform mat4 view,projection;out vec2 uv;
void main(){vec3 p=vec3(a.x*.38,-.29+a.y*.055,-1.12);gl_Position=projection*view*vec4(p,1.);uv=vec2(a.x*.5+.5,.5-a.y*.5);}`;

const hudFrag=`#version 300 es
precision mediump float;in vec2 uv;uniform sampler2D label;out vec4 color;
void main(){vec4 c=texture(label,uv);color=vec4(c.rgb*c.a,c.a);}`;

function program(gl,vert,frag) {
  const p=gl.createProgram();
  for (const [kind,source] of [[gl.VERTEX_SHADER,vert],[gl.FRAGMENT_SHADER,frag]]) {
    const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);
    if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s);gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  return p;
}

// Fast tileable 2D periodic value noise for seamless 512x512 procedural Ink/Flow atlas.
function hash2(ix,iy,period,seed){
  const x=((ix%period)+period)%period, y=((iy%period)+period)%period;
  let h=(x*374761393 + y*668265263 + seed*1442695041) | 0;
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967295;
}
function smoothNoise(u,v,period,seed){
  const fx=u*period, fy=v*period;
  const x0=Math.floor(fx), y0=Math.floor(fy);
  const tx=fx-x0, ty=fy-y0;
  const sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);
  const n00=hash2(x0,y0,period,seed), n10=hash2(x0+1,y0,period,seed);
  const n01=hash2(x0,y0+1,period,seed), n11=hash2(x0+1,y0+1,period,seed);
  const nx0=n00+(n10-n00)*sx, nx1=n01+(n11-n01)*sx;
  return nx0+(nx1-nx0)*sy;
}
function buildInkAtlas(size=512){
  const bytes=new Uint8Array(size*size*4);
  const rng=random(3901);
  // Pre-generate anisotropic brush-bristle rows (G channel)
  const bristle=new Float32Array(size*size);
  for(let y=0;y<size;y++){
    let f=rng();
    // Periodic wrap smoothing for seamless horizontal bristles
    for(let pass=0;pass<2;pass++){
      for(let x=0;x<size;x++){
        f=f*.86+rng()*.14;
        if(pass===1)bristle[y*size+x]=f;
      }
    }
  }
  const inv=1/size;
  for(let y=0;y<size;y++){
    const v=y*inv;
    for(let x=0;x<size;x++){
      const u=x*inv;
      // R: 4-octave seamless Sumi-e ink cloud / paper bleed fBM
      const rVal=
        smoothNoise(u,v,8,11)*.48 +
        smoothNoise(u,v,16,23)*.28 +
        smoothNoise(u,v,32,37)*.16 +
        smoothNoise(u,v,64,53)*.08;
      // G: Anisotropic brush-bristle fiber blended with fine vertical streak variation
      const bNoise=smoothNoise(u,v,48,71);
      const gVal=Math.max(0,Math.min(1,(bristle[y*size+x]-.22)*1.95*.78+bNoise*.22));
      // B: Fine granular gold-dust / micro-facet sparkle peaks
      const sp=hash2(x,y,size,97);
      const bVal=Math.pow(sp,1.6)*.72 + smoothNoise(u,v,32,113)*.28;
      // A: Smooth low-frequency curl/flow advection field
      const aVal=smoothNoise(u,v,4,131)*.65 + smoothNoise(u,v,8,157)*.35;

      const i=(y*size+x)*4;
      bytes[i]=Math.round(Math.max(0,Math.min(1,rVal))*255);
      bytes[i+1]=Math.round(Math.max(0,Math.min(1,gVal))*255);
      bytes[i+2]=Math.round(Math.max(0,Math.min(1,bVal))*255);
      bytes[i+3]=Math.round(Math.max(0,Math.min(1,aVal))*255);
    }
  }
  return bytes;
}

export function multiply(out,a,b) {
  for (let j=0;j<4;j++) {
    const bi=j*4,x=b[bi],y=b[bi+1],z=b[bi+2],w=b[bi+3];
    for (let i=0;i<4;i++) out[bi+i]=a[i]*x+a[i+4]*y+a[i+8]*z+a[i+12]*w;
  }
  return out;
}
export const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function perspective(aspect,fov) {
  const f=1/Math.tan(fov/2),n=.035,z=90;
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0]);
}

export class Painter {
  constructor(canvas) {
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,xrCompatible:Boolean(navigator.xr),premultipliedAlpha:true,depth:false,stencil:false,powerPreference:'high-performance'});
    if (!gl) throw Error('WebGL 2를 사용할 수 없습니다.');
    this.gl=gl;
    this.cloud=program(gl,quadVert,inkFrag);
    this.sealProg=program(gl,sealVert,sealFrag);
    this.paper=program(gl,paperVert,paperFrag);
    this.hud=program(gl,hudVert,hudFrag);

    this.uniforms={};
    for (const name of ['view','projection','time','opacity','sheetDown','passthrough'])
      this.uniforms[name]=gl.getUniformLocation(this.cloud,name);

    this.sealU={};
    for (const name of ['view','projection','sealCenter','sealRight','sealUp','sealNormal','sealRadius','time','sealParams','passthrough'])
      this.sealU[name]=gl.getUniformLocation(this.sealProg,name);

    this.hudView=gl.getUniformLocation(this.hud,'view');
    this.hudProjection=gl.getUniformLocation(this.hud,'projection');

    gl.useProgram(this.cloud);gl.uniform1i(gl.getUniformLocation(this.cloud,'grain'),0);
    gl.useProgram(this.sealProg);
    gl.uniform1i(gl.getUniformLocation(this.sealProg,'grain'),0);
    gl.uniform1i(gl.getUniformLocation(this.sealProg,'glyphSdf'),2);
    gl.useProgram(this.paper);gl.uniform1i(gl.getUniformLocation(this.paper,'grain'),0);
    gl.useProgram(this.hud);gl.uniform1i(gl.getUniformLocation(this.hud,'label'),1);

    this.corners=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.corners);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.flat=this.makeVao(null);

    // TEXTURE0: 512x512 seamless procedural Ink/Flow/Bristle/Glint atlas
    const atlasSize=512, bytes=buildInkAtlas(atlasSize);
    const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,atlasSize,atlasSize,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    // TEXTURE1: XR HUD label
    this.labelCanvas=document.createElement('canvas');this.labelCanvas.width=896;this.labelCanvas.height=132;
    this.labelTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.labelTexture);
    for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);

    // TEXTURE2: 512x512 SVG-to-SDF 鳥 glyph texture (starts empty until SVG loads)
    this.glyphReady=false;
    this.glyphTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.glyphTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);

    gl.activeTexture(gl.TEXTURE0);
    this.buffers=new Map();
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  }
  setGlyphSdf(sdfData){
    if(!sdfData||!sdfData.rgba)return;
    const g=this.gl;
    g.activeTexture(g.TEXTURE2);
    g.bindTexture(g.TEXTURE_2D,this.glyphTexture);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,sdfData.size,sdfData.size,0,g.RGBA,g.UNSIGNED_BYTE,sdfData.rgba);
    g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
    g.generateMipmap(g.TEXTURE_2D);
    g.activeTexture(g.TEXTURE0);
    this.glyphReady=true;
  }
  makeVao(buffer) {
    const g=this.gl, vao=g.createVertexArray();g.bindVertexArray(vao);g.bindBuffer(g.ARRAY_BUFFER,this.corners);
    g.enableVertexAttribArray(0);g.vertexAttribPointer(0,2,g.FLOAT,false,0,0);
    if(buffer){g.bindBuffer(g.ARRAY_BUFFER,buffer);
      for(const [index,count,offset] of [[1,3,0],[2,3,3],[3,2,6],[4,4,8],[5,1,12]]){
        g.enableVertexAttribArray(index);g.vertexAttribPointer(index,count,g.FLOAT,false,STRIDE*4,offset*4);g.vertexAttribDivisor(index,1);
      }
    }
    return vao;
  }
  upload(batch,revision) {
    const g=this.gl;let b=this.buffers.get(batch);
    if(!b){
      const buffer=g.createBuffer();b={buffer,vao:this.makeVao(buffer),revision:undefined};this.buffers.set(batch,b);
      g.bufferData(g.ARRAY_BUFFER,batch.data.byteLength,g.DYNAMIC_DRAW);
    }
    if(b.revision===revision) return;
    g.bindBuffer(g.ARRAY_BUFFER,b.buffer);
    if(batch.count) g.bufferSubData(g.ARRAY_BUFFER,0,batch.data,0,batch.count*STRIDE);
    b.revision=revision;
  }
  label(top,bottom) {
    const key=top+'|'+bottom;if(key===this.lastLabel)return;this.lastLabel=key;
    const c=this.labelCanvas,ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle='rgba(238,233,211,.88)';ctx.fillRect(58,9,780,113);ctx.textAlign='center';
    ctx.fillStyle='#292c29';ctx.font='bold 39px serif';ctx.fillText(top,448,55);
    ctx.font='26px sans-serif';ctx.fillText(bottom,448,99);
    const g=this.gl;g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,this.labelTexture);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,c);g.activeTexture(g.TEXTURE0);
  }
  drawSealQuad(view,projection,sealVisual,time,passthrough){
    if(!this.glyphReady||!sealVisual||sealVisual.alpha<=.002)return;
    const g=this.gl, s=sealVisual.seal;
    g.useProgram(this.sealProg);
    g.bindVertexArray(this.flat);
    g.uniformMatrix4fv(this.sealU.view,false,view);
    g.uniformMatrix4fv(this.sealU.projection,false,projection);
    g.uniform3fv(this.sealU.sealCenter,s.c);
    g.uniform3fv(this.sealU.sealRight,s.u);
    g.uniform3fv(this.sealU.sealUp,s.v);
    g.uniform3fv(this.sealU.sealNormal,s.n);
    g.uniform1f(this.sealU.sealRadius,s.r);
    g.uniform1f(this.sealU.time,time);
    g.uniform1f(this.sealU.passthrough,passthrough?1:0);
    g.uniform4f(this.sealU.sealParams,sealVisual.writeProgress,sealVisual.charge,sealVisual.dissolve,sealVisual.alpha);
    g.drawArrays(g.TRIANGLE_STRIP,0,4);
  }
  eye(view,projection,groups,time,passthrough,hudView,sealVisual=null) {
    const g=this.gl;
    if(!passthrough){g.disable(g.BLEND);g.useProgram(this.paper);g.bindVertexArray(this.flat);g.drawArrays(g.TRIANGLE_STRIP,0,4);}
    g.enable(g.BLEND);g.useProgram(this.cloud);
    g.uniformMatrix4fv(this.uniforms.view,false,view);
    g.uniformMatrix4fv(this.uniforms.projection,false,projection);
    g.uniform1f(this.uniforms.time,time);
    g.uniform1f(this.uniforms.passthrough,passthrough?1:0);
    let sealDrawn=false;
    for(const item of groups){
      if(!(passthrough&&item.scenery || !item.batch.count || item.alpha<=0)){
        if(item.sheet)g.uniform3fv(this.uniforms.sheetDown,item.sheet.down);
        g.bindVertexArray(this.buffers.get(item.batch).vao);
        g.uniform1f(this.uniforms.opacity,item.alpha);
        g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,item.batch.count);
      }
      // Draw Layer 1 crisp 3D SVG-SDF 鳥 seal right above the WorldWash Enso ring
      if(item.sheet && sealVisual && !sealDrawn){
        this.drawSealQuad(view,projection,sealVisual,time,passthrough);
        sealDrawn=true;
        g.useProgram(this.cloud);
        g.uniformMatrix4fv(this.uniforms.view,false,view);
        g.uniformMatrix4fv(this.uniforms.projection,false,projection);
        g.uniform1f(this.uniforms.time,time);
        g.uniform1f(this.uniforms.passthrough,passthrough?1:0);
      }
    }
    if(sealVisual && !sealDrawn){
      this.drawSealQuad(view,projection,sealVisual,time,passthrough);
    }
    if(hudView&&this.lastLabel){
      g.useProgram(this.hud);g.bindVertexArray(this.flat);g.uniformMatrix4fv(this.hudView,false,hudView);
      g.uniformMatrix4fv(this.hudProjection,false,projection);g.drawArrays(g.TRIANGLE_STRIP,0,4);
    }
    g.bindVertexArray(null);
  }
}
