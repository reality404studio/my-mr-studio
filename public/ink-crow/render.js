import {STRIDE} from './ink.js?v=bns-phase3';
import {random} from './gesture.js?v=bns-phase3';
import {RIBBON_STRIDE} from './ribbon.js?v=bns-phase3';

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
  // Subtle metallic gold shimmer for Tone 7 (금분) & SplatGlint microfacet sparkle on dark Sumi-e feathers (Tone 0/1)
  if(ink.z>6.5 && ink.z<7.5){
    float glint=pow(tex.b,2.4)*(.6+.4*sin(time*7.5+ink.w*31.4));
    pigment+=vec3(.35,.28,.12)*glint;
  } else if(ink.z<1.5){
    float facet=pow(max(0.,sin(ink.w*41.+time*3.8+tex.r*6.28)),16.)*exp(-edge*4.2);
    pigment+=mix(vec3(.20,.92,.88),vec3(1.,.86,.48),step(.55,fract(ink.w*13.7)))*facet*.48;
  }
  color=vec4(pigment*a,a);
}`;

// Dedicated Layer 2 (0cm) 3D SVG-SDF 鳥 Seal Shader (razor-sharp jet-black calligraphy + true 11-stroke brush reveal + hand ripple)
const sealVert=`#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 view,projection;
uniform vec3 sealCenter,sealRight,sealUp,sealNormal;
uniform float sealRadius,sealScale,time;
uniform vec4 sealParams; // x: writeProgress, y: charge, z: dissolve, w: alpha
out vec2 uv;
out vec3 worldPos;
flat out float eyeSafe;
void main(){
  float charge=sealParams.y;
  float tremor=(sin(time*44.)*.0018+cos(time*61.)*.0012)*charge*charge*sealRadius;
  float span=sealRadius*.93*sealScale*(1.+.045*sealParams.z);
  vec3 world=sealCenter
    +sealRight*(corner.x*span+tremor)
    +sealUp*(corner.y*span-tremor*.7)
    +sealNormal*(.0045+.008*charge);
  worldPos=world;
  vec4 vp=view*vec4(world,1.);
  vec4 vc=view*vec4(sealCenter,1.);
  eyeSafe=clamp((-vc.z-.12)/.16,0.,1.);
  gl_Position=projection*vp;
  uv=vec2(corner.x*.5+.5,.5-corner.y*.5);
}`;

const sealFrag=`#version 300 es
precision mediump float;
in vec2 uv;
in vec3 worldPos;
flat in float eyeSafe;
uniform sampler2D grain;
uniform sampler2D glyphSdf;
uniform highp float time;
uniform float passthrough;
uniform highp vec4 sealParams; // x: writeProgress, y: charge, z: dissolve, w: alpha
uniform highp vec4 handRipple; // xyz: hand world pos, w: smoothed ripple energy
out vec4 color;

void main(){
  float masterAlpha=sealParams.w*eyeSafe;
  if(masterAlpha<=.002) discard;

  vec4 g=texture(glyphSdf,uv);
  float sdf=g.r;         // 0.5 = exact calligraphy contour, >0.5 inside, <0.5 outside
  float inkMask=g.g;     // crisp rasterized brush mask & dry-brush splatters
  float strokeOrd=g.b;   // 0..1 true 11-stroke calligraphic brush order
  float radial=g.a;      // 0..1 radial distance from seal center

  vec4 nBase=texture(grain,uv*2.4);
  vec4 nFlow=texture(grain,uv*1.9+vec2(time*.16,-time*.22));
  vec4 nSpark=texture(grain,uv*5.4+vec2(-time*.12,time*.10));

  float writeP=sealParams.x;
  float charge=sealParams.y;
  float dissolve=sealParams.z;

  // Hand-velocity radial qi ripple propagating across the 3D seal surface
  float hDist=length(worldPos-handRipple.xyz);
  float hWave=(.5+.5*sin(hDist*22.-time*11.))*exp(-hDist*3.2)*handRipple.w;

  // 1. True 11-stroke calligraphic brush reveal with vivid wet-ink + cyan/gold leading tip edge
  float revealEdge=writeP*1.12-(nBase.r-.5)*.065;
  float reveal=smoothstep(strokeOrd-.055,strokeOrd+.018,revealEdge);
  float writeFront=exp(-pow((strokeOrd-revealEdge)*22.,2.))*smoothstep(.005,.08,writeP)*(1.-smoothstep(.94,1.,writeP));

  // 2. Noise-eroded ink dissolve into 9 crows during release
  float erodeField=nBase.r*.62+(1.-radial)*.38;
  float dissCut=dissolve*1.28;
  float dissMask=1.-smoothstep(erodeField-.14,erodeField+.05,dissCut);
  float burnEdge=smoothstep(.02,.52,dissMask)*(1.-smoothstep(.52,.98,dissMask))*smoothstep(.01,.10,dissolve);

  float vis=reveal*dissMask*masterAlpha;
  if(vis<=.002) discard;

  // 3. True Jet-Black Sumi-e Ink Core (preserve real dry-brush 갈필 holes via inkMask!)
  float sdfCore=smoothstep(.492,.514,sdf+(nBase.r-.5)*.010);
  float body=clamp(min(sdfCore,smoothstep(.12,.68,inkMask)+smoothstep(.54,.64,sdf)*.25)*(.90+.10*nBase.g),0.,1.);
  body=max(body,smoothstep(.35,.75,inkMask)*(.88+.12*nBase.g));
  float inkA=body*vis;

  // 4. Blade & Soul Option A Luminous Rim strictly outside the obsidian ink silhouette!
  float outsideOnly=smoothstep(.512,.490,sdf);
  float hotRim=exp(-pow((sdf-.492)*46.,2.))*smoothstep(.38,.514,sdf);
  float outerDist=max(0.,.496-sdf);
  float outerHalo=exp(-pow(outerDist*7.8,2.))*smoothstep(.16,.500,sdf)*outsideOnly*(.74+.26*nFlow.r);
  float wavePos=fract(time*.58+charge*.35);
  float waveBand=exp(-pow((radial-wavePos)*5.5,2.))*(.20+.95*charge)+hWave*1.15;
  float innerSheen=body*waveBand*pow(clamp(charge+hWave*.5,0.,1.),1.4)*nBase.g*.14;
  float goldSpark=pow(nSpark.b,3.1)*(.65+.35*sin(time*11.+nBase.b*30.))*(hotRim*(1.65+hWave*1.2)+burnEdge*2.2+writeFront*2.6+body*(.22*charge+hWave*.35));

  vec3 inkCol=vec3(.014,.018,.024)+vec3(.018,.026,.032)*(nBase.g*.45);
  vec3 cyan=vec3(.14,.96,.90);
  vec3 deepTeal=vec3(.01,.58,.64);
  vec3 hotWhite=vec3(.97,1.,1.);
  vec3 gold=vec3(1.,.80,.34);

  vec3 haloTone=mix(mix(deepTeal,cyan,clamp(.42+charge*.58,0.,1.)),cyan,passthrough);
  vec3 rimGlow=
    haloTone*outerHalo*(.68+1.35*charge+waveBand*.90+writeFront*1.2)*vis +
    mix(cyan,hotWhite,.62)*hotRim*(.55+1.35*charge+waveBand*.85+writeFront*1.6)*vis*outsideOnly;

  vec3 accentGlow=
    cyan*(innerSheen+writeFront*.85*body)*vis +
    hotWhite*(writeFront*1.35+burnEdge*1.5)*body*vis +
    gold*(goldSpark*2.2+(writeFront*.65+burnEdge*.85)*body)*vis;

  vec3 totalGlow=rimGlow+accentGlow;
  float glowBoost=mix(1.18,1.72,passthrough);
  float glowAlphaShare=mix(.54,.16,passthrough);
  float glowLum=clamp(max(totalGlow.r,max(totalGlow.g,totalGlow.b)),0.,1.);

  vec3 outRgb=inkCol*inkA + totalGlow*glowBoost;
  float outA=clamp(inkA + glowLum*glowAlphaShare*(1.-inkA),0.,1.);
  color=vec4(outRgb,outA);
}`;

// Dedicated Layer 0 (-9cm) & Layer 3 (+7cm) Procedural Eastern Taoist Magic Circle Shader
// (Bagua trigrams + Cloud-scroll scallops + Talisman curved arcs — 100% curved polar geometry, ZERO straight needles!)
const circleVert=`#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 view,projection;
uniform vec3 circleCenter,circleRight,circleUp,circleNormal;
uniform float circleRadius,circleZOff;
uniform highp vec4 circleParams; // x: rotAngle, y: scale, z: alpha, w: charge
out vec2 pUv;
out vec3 worldPos;
flat out float eyeSafe;
void main(){
  float span=circleRadius*circleParams.y;
  float c=cos(circleParams.x), s=sin(circleParams.x);
  vec2 rc=vec2(corner.x*c-corner.y*s, corner.x*s+corner.y*c);
  vec3 world=circleCenter
    +circleRight*(rc.x*span)
    +circleUp*(rc.y*span)
    +circleNormal*circleZOff;
  worldPos=world;
  vec4 vp=view*vec4(world,1.);
  vec4 vc=view*vec4(circleCenter,1.);
  eyeSafe=clamp((-vc.z-.10)/.16,0.,1.);
  gl_Position=projection*vp;
  pUv=corner;
}`;

const circleFrag=`#version 300 es
precision mediump float;
in vec2 pUv;
in vec3 worldPos;
flat in float eyeSafe;
uniform sampler2D grain;
uniform highp float time;
uniform float passthrough;
uniform float circleLayer;       // 0.0 = Layer 0 (-9cm Bagua/Cloud outer), 1.0 = Layer 3 (+7cm hollow Talisman inner)
uniform highp vec4 circleParams; // x: rotAngle, y: scale, z: alpha, w: charge
uniform highp vec4 handRipple;
out vec4 color;

void main(){
  float alpha=circleParams.z*eyeSafe;
  if(alpha<=.002) discard;

  float r=length(pUv);
  if(r>1.0) discard;
  if(circleLayer>.5 && r<.68) discard; // Layer 3 stays strictly hollow so 鳥 is never obscured!
  if(circleLayer<.5 && r<.46) discard; // Layer 0 frames outside the Enso & 鳥 cleanly

  float charge=circleParams.w;
  float ang=atan(pUv.y,pUv.x); // -PI..PI
  float normAng=fract((ang+3.14159265)/6.2831853);

  vec4 nBrush=texture(grain,pUv*2.1+vec2(time*.04,-time*.03));
  vec4 nSpark=texture(grain,pUv*5.8+vec2(-time*.08,time*.06));
  float tooth=mix(.78,1.16,nBrush.g);

  // Hand-velocity radial qi ripple across the multi-layer magic circle
  float hDist=length(worldPos-handRipple.xyz);
  float hWave=(.5+.5*sin(hDist*20.-time*10.))*exp(-hDist*2.6)*handRipple.w;

  float inkMask=0.;
  float cyanMask=0.;
  float goldMask=0.;

  if(circleLayer<.5){
    // === LAYER 0 (-9cm): Taoist Bagua (팔괘) + Eastern Cloud-Scroll (운문) Outer Circle ===
    // 1. Outer double calligraphic concentric rings (organic brush thickness)
    float wOut=.014+.005*sin(ang*5.+nBrush.r*2.);
    float outerRing=exp(-pow((r-.945)/wOut,2.))+exp(-pow((r-.875)/.009,2.))*.78;
    float innerFrame=exp(-pow((r-.645)/.010,2.))*.85;

    // 2. Authentic 8 Bagua Trigrams (☰☱☲☳☴☵☶☷) rendered as curved polar arcs!
    float secF=normAng*8.;
    float secIdx=floor(secF);
    float secU=fract(secF); // 0..1 within one trigram sector
    // Curved angular span of each trigram bar (leaves clean space between the 8 trigrams)
    float inBar=smoothstep(.16,.21,secU)*(1.-smoothstep(.79,.84,secU));
    // Central yin break gap (curved!)
    float yinGap=1.-(smoothstep(.44,.47,secU)*(1.-smoothstep(.53,.56,secU)));
    // Decode 3-bit Bagua pattern for sector 0..7 (Heaven, Lake, Fire, Thunder, Wind, Water, Mountain, Earth)
    float code=mod(secIdx*3.+1.,8.); // rich alternating yin/yang distribution across all 8 sectors
    float b0=mod(floor(code),2.);
    float b1=mod(floor(code*.5),2.);
    float b2=mod(floor(code*.25),2.);
    float trigram=
      exp(-pow((r-.710)/.013,2.))*inBar*mix(yinGap,1.,b0) +
      exp(-pow((r-.760)/.013,2.))*inBar*mix(yinGap,1.,b1) +
      exp(-pow((r-.810)/.013,2.))*inBar*mix(yinGap,1.,b2);

    // 3. Flowing Eastern Cloud-Scroll Scallops (구름문양/연화파) hugging inner & outer rim
    float cloudR1=.575+.034*abs(sin(ang*8.));
    float cloudWave1=exp(-pow((r-cloudR1)/.011,2.))*.82;
    float cloudR2=.908+.016*sin(ang*16.);
    float cloudWave2=exp(-pow((r-cloudR2)/.008,2.))*.55;

    // 4. 8 Rotating Antique Gold Celestial Beads nestled between Bagua sectors
    float beadDist=length(vec2((secU-.04)*2.4, (r-.760)*4.8));
    float beadDist2=length(vec2((secU-.96)*2.4, (r-.760)*4.8));
    float beads=exp(-beadDist*beadDist*14.)+exp(-beadDist2*beadDist2*14.);

    float totalLine=clamp((outerRing+innerFrame+trigram*1.15+cloudWave1+cloudWave2)*tooth,0.,1.5);
    inkMask=clamp((outerRing*.55+innerFrame*.45+trigram*.70+cloudWave1*.35)*tooth,0.,1.)*mix(.62,.38,passthrough);
    cyanMask=clamp(totalLine*(.42+.58*charge+hWave*.85),0.,1.6);
    goldMask=clamp((beads*1.35+cloudWave2*.65+pow(nSpark.b,3.2)*totalLine*1.4)*(.55+.65*charge+hWave*.7),0.,1.6);
  } else {
    // === LAYER 3 (+7cm): Counter-Rotating Hollow Front Talisman & Cloud Ring ===
    float outerRing=exp(-pow((r-.945)/.010,2.))+exp(-pow((r-.765)/.009,2.))*.85;

    // 12 Curved Talisman Seal Arcs (curved polar calligraphy — ZERO straight ticks!)
    float secF=normAng*12.;
    float secU=fract(secF);
    float secIdx=floor(secF);
    float glyphSpan=smoothstep(.18,.24,secU)*(1.-smoothstep(.76,.82,secU));
    float arc1=exp(-pow((r-.855-.026*sin(secU*9.424+secIdx))/.010,2.))*glyphSpan;
    float arc2=exp(-pow((r-.855+.022*cos(secU*6.283))/.008,2.))*glyphSpan*.72;

    // Flowing scalloped outer cloud-crest wave
    float crestR=.960+.018*sin(ang*12.);
    float crest=exp(-pow((r-crestR)/.008,2.))*.65;

    // 12 Antique Gold Shimmer Beads between the curved talisman glyphs
    float b1=length(vec2((secU-.05)*3.2, (r-.855)*5.5));
    float b2=length(vec2((secU-.95)*3.2, (r-.855)*5.5));
    float beads=exp(-b1*b1*16.)+exp(-b2*b2*16.);

    float totalLine=clamp((outerRing+arc1*1.15+arc2+crest)*tooth,0.,1.5);
    inkMask=clamp((outerRing*.32+arc1*.45)*tooth,0.,1.)*mix(.46,.22,passthrough);
    cyanMask=clamp((outerRing*.85+arc1*1.1+crest*.75)*tooth*(.50+.65*charge+hWave*.95),0.,1.6);
    goldMask=clamp((beads*1.45+arc2*.90+pow(nSpark.b,3.0)*totalLine*1.5)*(.60+.70*charge+hWave*.85),0.,1.6);
  }

  vec3 inkCol=vec3(.020,.028,.036);
  vec3 cyan=vec3(.14,.96,.90);
  vec3 deepTeal=vec3(.01,.58,.64);
  vec3 hotWhite=vec3(.96,1.,1.);
  vec3 gold=vec3(1.,.80,.36);

  float inkA=inkMask*alpha;
  vec3 glowCol=mix(deepTeal,cyan,clamp(.45+charge*.55+passthrough*.35,0.,1.))*cyanMask*alpha
    + mix(gold,hotWhite,.35)*goldMask*alpha;
  float boost=mix(.88,1.38,passthrough);
  float glowLum=clamp(max(glowCol.r,max(glowCol.g,glowCol.b)),0.,1.);
  float alphaShare=mix(.46,.16,passthrough);

  vec3 outRgb=inkCol*inkA + glowCol*boost;
  float outA=clamp(inkA + glowLum*alphaShare*(1.-inkA),0.,1.);
  if(outA<=.003 && glowLum<=.003) discard;
  color=vec4(outRgb,outA);
}`;

// Dedicated Layer 1 (-3cm) 1-Draw-Call WorldWash Enso Quad Shader (replaces ~4,465 splats with crisp fluid ink texture!)
const washVert=`#version 300 es
layout(location=0) in vec2 corner;
uniform mat4 view,projection;
uniform vec3 washOrigin,washRight,washDown,washNormal;
uniform float washHalfSpan,washZOffset,washScale;
out vec2 uv;
out vec3 worldPos;
flat out float eyeSafe;
void main(){
  float span=washHalfSpan*washScale;
  vec3 world=washOrigin
    +washRight*(corner.x*span)
    +washDown*(corner.y*span)
    +washNormal*washZOffset;
  worldPos=world;
  vec4 vp=view*vec4(world,1.);
  vec4 vc=view*vec4(washOrigin,1.);
  eyeSafe=clamp((-vc.z-.10)/.16,0.,1.);
  gl_Position=projection*vp;
  uv=corner*.5+.5;
}`;

const washFrag=`#version 300 es
precision mediump float;
in vec2 uv;
in vec3 worldPos;
flat in float eyeSafe;
uniform sampler2D grain;
uniform sampler2D washTex;
uniform highp float time;
uniform float passthrough;
uniform float washAlpha;
uniform float washCharge;
uniform highp vec4 handRipple;
out vec4 color;

void main(){
  float master=washAlpha*eyeSafe;
  if(master<=.002) discard;

  vec2 w=texture(washTex,uv).rg;
  float density=w.r;
  float wet=w.g;
  if(density<=.004) discard;

  vec4 nPaper=texture(grain,uv*5.5);
  vec4 nBristle=texture(grain,uv*11.0+vec2(0.,uv.x*.35));
  vec4 nSpark=texture(grain,uv*14.0+vec2(-time*.06,time*.05));

  // Hand-velocity radial ripple across the wet calligraphic Enso ring
  float hDist=length(worldPos-handRipple.xyz);
  float hWave=(.5+.5*sin(hDist*20.-time*10.))*exp(-hDist*2.6)*handRipple.w;

  // Authentic hanji ink bleed + dry-brush bristle tooth without circular splat dots
  float tooth=mix(.78,1.16,nBristle.g)*mix(.86,1.12,nPaper.r);
  float inkA=clamp((1.-exp(-density*2.35*tooth))*master,0.,1.);
  if(inkA<=.004) discard;

  // Deep obsidian Sumi-e center transitioning into cool celadon-charcoal wash edge
  float coreMask=smoothstep(.22,.78,density);
  vec3 lightWash=mix(vec3(.13,.19,.23),vec3(.09,.15,.20),passthrough);
  vec3 deepInk=vec3(.018,.024,.032);
  vec3 inkCol=mix(lightWash,deepInk,coreMask);

  // Subtle wet-edge qi shimmer & gold-dust flecks along the Enso contour during charge / hand ripple
  float edgeBand=smoothstep(.04,.34,density)*(1.-smoothstep(.45,.86,density));
  float qiRim=edgeBand*(.16+.55*washCharge+hWave*.85)*(0.65+0.35*wet)*master;
  float goldFlecks=pow(nSpark.b,3.4)*edgeBand*(.25+washCharge*.95+hWave*.9)*master;

  vec3 cyan=vec3(.14,.96,.90);
  vec3 deepTeal=vec3(.01,.58,.64);
  vec3 gold=vec3(1.,.80,.34);
  vec3 rimCol=mix(deepTeal,cyan,clamp(.45+passthrough*.55,0.,1.))*qiRim*mix(.55,.95,passthrough)
    +gold*goldFlecks*1.45;

  float glowLum=clamp(max(rimCol.r,max(rimCol.g,rimCol.b)),0.,1.);
  float alphaShare=mix(.45,.16,passthrough);
  vec3 outRgb=inkCol*inkA + rimCol;
  float outA=clamp(inkA + glowLum*alphaShare*(1.-inkA),0.,1.);
  color=vec4(outRgb,outA);
}`;

// Dedicated 3D Curved Calligraphic Ribbon & Crescent Sword-Arc Slash Shader (ZERO straight needles!)
const ribbonVert=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aMeta; // x: mode, y: alpha, z: seed, w: energy
uniform mat4 view,projection;
out vec2 vUv;
out vec4 vMeta;
out vec3 vWorldPos;
out float vEyeSafe;
void main(){
  vWorldPos=aPos;
  vUv=aUv;
  vMeta=aMeta;
  vec4 vp=view*vec4(aPos,1.);
  vEyeSafe=clamp((-vp.z-.10)/.15,0.,1.);
  gl_Position=projection*vp;
}`;

const ribbonFrag=`#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vMeta;
in vec3 vWorldPos;
in float vEyeSafe;
uniform sampler2D grain;
uniform highp float time;
uniform float passthrough;
uniform highp vec4 handRipple;
out vec4 color;

void main(){
  float alpha=vMeta.y*vEyeSafe;
  if(alpha<=.002) discard;

  float mode=vMeta.x;
  float seed=vMeta.z;
  float energy=vMeta.w;
  float u=vUv.x;        // 0..1 along curve (0 = tail, 1 = cutting head)
  float av=abs(vUv.y);  // 0 = center spine, 1 = outer edge

  // Flowing multi-scale ink/energy advection along the curved ribbon
  vec2 flowUv=vec2(u*2.4-time*(1.45+.55*energy)+seed*3.7, vUv.y*.38+.5+seed*1.3);
  vec4 n1=texture(grain,flowUv);
  vec4 n2=texture(grain,vec2(u*4.8-time*2.2+seed*5.1, vUv.y*.75+.5));
  vec4 nSpark=texture(grain,vec2(u*7.5-time*.8+seed*2.3, vUv.y*1.4+.5));

  // Hand-velocity ripple boost
  float hDist=length(vWorldPos-handRipple.xyz);
  float hWave=(.5+.5*sin(hDist*22.-time*12.))*exp(-hDist*2.8)*handRipple.w;

  // Organic calligraphic brush ends: frayed dry-brush tail (u->0) & sharp blade tip (u->1)
  float endFade=smoothstep(0.,.14,u)*(1.-smoothstep(.88,1.,u));
  float fray=smoothstep(.08,.75,u+(n1.g-.45)*.38);
  float edgeNoise=(n1.r-.5)*.28+(n2.g-.5)*.22;
  float crossProfile=1.-smoothstep(.32+edgeNoise,.98,av);
  if(crossProfile*endFade<=.003) discard;

  vec3 obsidian=vec3(.015,.020,.028);
  vec3 cyan=vec3(.14,.96,.90);
  vec3 deepTeal=vec3(.01,.58,.64);
  vec3 hotWhite=vec3(.97,1.,1.);
  vec3 gold=vec3(1.,.82,.38);
  vec3 crimson=vec3(.95,.18,.08);
  vec3 amber=vec3(1.,.64,.16);

  // Mode 0: Sumi-e Black Ink Brush Ribbon framed by Electric Cyan Cutting Rim (signature BnS!)
  if(mode<.5){
    float inkBody=smoothstep(.76,.24,av+edgeNoise*.65)*endFade*fray*(.82+.18*n1.g);
    float cyanRim=exp(-pow((av-.58)*5.2,2.))*endFade*(.65+.35*n2.r)*(1.+energy*.55+hWave*.9);
    float goldDust=pow(nSpark.b,3.2)*endFade*(1.-smoothstep(.3,.95,av))*(.5+energy);
    float inkA=clamp(inkBody*alpha,0.,1.);
    vec3 rimTone=mix(mix(deepTeal,cyan,.62),mix(cyan,hotWhite,.35),passthrough);
    vec3 glow=rimTone*cyanRim*alpha*mix(.95,1.45,passthrough) + gold*goldDust*alpha*1.3;
    float glowLum=clamp(max(glow.r,max(glow.g,glow.b)),0.,1.);
    float alphaShare=mix(.46,.14,passthrough);
    color=vec4(obsidian*inkA + glow, clamp(inkA+glowLum*alphaShare*(1.-inkA),0.,1.));
    return;
  }

  // Mode 1: Electric Celadon/Cyan Sword-Qi Crescent & Aura Ribbon
  if(mode<1.5){
    float spine=exp(-pow(av*3.4,2.))*endFade*(.75+.25*n2.r);
    float aura=pow(max(0.,1.-av),1.55)*endFade*(.62+.38*n1.r);
    // Subtle dark ink inner shadow on one edge (vUv.y < 0) so sword-arcs read like BnS ink-blades even on bright paper!
    float inkEdge=smoothstep(-.05,-.75,vUv.y)*smoothstep(-1.,-.62,vUv.y)*endFade*(.45+.35*n1.g)*mix(.62,.25,passthrough);
    float goldDust=pow(nSpark.b,3.3)*endFade*aura*(.7+energy*.8+hWave);
    vec3 qiCol=mix(mix(deepTeal,cyan,.58),cyan,passthrough)*aura*(1.05+.55*energy+hWave*.8)
      + mix(cyan,hotWhite,.72)*spine*(1.15+.65*energy+hWave*.9)
      + gold*goldDust*1.6;
    float inkA=clamp(inkEdge*alpha,0.,1.);
    float glowLum=clamp(max(qiCol.r,max(qiCol.g,qiCol.b))*alpha,0.,1.);
    float alphaShare=mix(.50,.12,passthrough);
    vec3 outRgb=obsidian*inkA + qiCol*alpha*mix(1.05,1.55,passthrough);
    color=vec4(outRgb, clamp(inkA+glowLum*alphaShare*(1.-inkA),0.,1.));
    return;
  }

  // Mode 2: Antique Gold-Dust (금분) Silk Qi Filament
  if(mode<2.5){
    float spine=exp(-pow(av*3.2,2.))*endFade;
    float silk=pow(max(0.,1.-av),1.7)*endFade*(.68+.32*n1.g);
    float sparkle=pow(nSpark.b,2.8)*endFade*silk*(1.2+energy*.9+hWave);
    vec3 col=mix(vec3(.78,.54,.14),gold,clamp(.45+passthrough*.55,0.,1.))*silk*(.95+.4*energy)
      + mix(gold,hotWhite,.62)*(spine*.85+sparkle*1.4);
    float lum=clamp(max(col.r,max(col.g,col.b))*alpha,0.,1.);
    float alphaShare=mix(.54,.16,passthrough);
    color=vec4(col*alpha*mix(1.0,1.45,passthrough), lum*alphaShare);
    return;
  }

  // Mode 3: Dokkaebi-bul Crimson/Amber Curved Spirit-Flame Slash
  float spine=exp(-pow(av*3.0,2.))*endFade;
  float flame=pow(max(0.,1.-av),1.5)*endFade*(.62+.38*n1.r);
  float inkEdge=smoothstep(.15,.72,av)*endFade*(.55+.3*n1.g)*mix(.65,.35,passthrough);
  vec3 col=crimson*flame*1.3 + amber*spine*1.5 + hotWhite*pow(spine,2.2)*1.2;
  float inkA=clamp(inkEdge*alpha,0.,1.);
  float lum=clamp(max(col.r,max(col.g,col.b))*alpha,0.,1.);
  float alphaShare=mix(.52,.18,passthrough);
  color=vec4(obsidian*inkA + col*alpha*mix(1.05,1.45,passthrough), clamp(inkA+lum*alphaShare*(1.-inkA),0.,1.));
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
    this.circleProg=program(gl,circleVert,circleFrag);
    this.washProg=program(gl,washVert,washFrag);
    this.ribbonProg=program(gl,ribbonVert,ribbonFrag);
    this.paper=program(gl,paperVert,paperFrag);
    this.hud=program(gl,hudVert,hudFrag);

    this.uniforms={};
    for (const name of ['view','projection','time','opacity','sheetDown','passthrough'])
      this.uniforms[name]=gl.getUniformLocation(this.cloud,name);

    this.sealU={};
    for (const name of ['view','projection','sealCenter','sealRight','sealUp','sealNormal','sealRadius','sealScale','time','sealParams','passthrough','handRipple'])
      this.sealU[name]=gl.getUniformLocation(this.sealProg,name);

    this.circleU={};
    for (const name of ['view','projection','circleCenter','circleRight','circleUp','circleNormal','circleRadius','circleZOff','circleLayer','circleParams','time','passthrough','handRipple'])
      this.circleU[name]=gl.getUniformLocation(this.circleProg,name);

    this.washU={};
    for (const name of ['view','projection','washOrigin','washRight','washDown','washNormal','washHalfSpan','washZOffset','washScale','time','passthrough','washAlpha','washCharge','handRipple'])
      this.washU[name]=gl.getUniformLocation(this.washProg,name);

    this.ribbonU={};
    for (const name of ['view','projection','time','passthrough','handRipple'])
      this.ribbonU[name]=gl.getUniformLocation(this.ribbonProg,name);

    this.hudView=gl.getUniformLocation(this.hud,'view');
    this.hudProjection=gl.getUniformLocation(this.hud,'projection');

    gl.useProgram(this.cloud);gl.uniform1i(gl.getUniformLocation(this.cloud,'grain'),0);
    gl.useProgram(this.sealProg);
    gl.uniform1i(gl.getUniformLocation(this.sealProg,'grain'),0);
    gl.uniform1i(gl.getUniformLocation(this.sealProg,'glyphSdf'),2);
    gl.useProgram(this.circleProg);
    gl.uniform1i(gl.getUniformLocation(this.circleProg,'grain'),0);
    gl.useProgram(this.washProg);
    gl.uniform1i(gl.getUniformLocation(this.washProg,'grain'),0);
    gl.uniform1i(gl.getUniformLocation(this.washProg,'washTex'),3);
    gl.useProgram(this.ribbonProg);
    gl.uniform1i(gl.getUniformLocation(this.ribbonProg,'grain'),0);
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

    // TEXTURE3: 472x472 RG8 WorldWash live ink paper texture (1 draw call Enso!)
    this.washTexture=gl.createTexture();this.washTexSize=0;this.washRevision=-1;
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.washTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RG8,1,1,0,gl.RG,gl.UNSIGNED_BYTE,new Uint8Array([0,0]));
    for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);

    gl.activeTexture(gl.TEXTURE0);
    this.buffers=new Map();
    this.ribbonBuffers=new Map();
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
    g.bindVertexArray(null);
    return vao;
  }
  // Static/Dynamic VBO separation: scenery uploaded once with STATIC_DRAW; dynamic batches streamed via bufferSubData
  upload(batch,revision,isStatic=false) {
    const g=this.gl;let b=this.buffers.get(batch);
    if(!b){
      const buffer=g.createBuffer();
      const vao=this.makeVao(buffer);
      b={buffer,vao,revision:undefined,isStatic,frozen:false};
      this.buffers.set(batch,b);
      g.bindBuffer(g.ARRAY_BUFFER,buffer);
      g.bufferData(g.ARRAY_BUFFER,batch.data.byteLength,isStatic?g.STATIC_DRAW:g.STREAM_DRAW);
    }
    if(b.frozen||b.revision===revision) return;
    g.bindBuffer(g.ARRAY_BUFFER,b.buffer);
    if(batch.count) g.bufferSubData(g.ARRAY_BUFFER,0,batch.data,0,batch.count*STRIDE);
    b.revision=revision;
    if(b.isStatic&&batch.count) b.frozen=true;
  }
  uploadWash(wash){
    if(!wash||!wash.texData||wash.texRevision===this.washRevision)return;
    const g=this.gl,sz=wash.texSize;
    g.activeTexture(g.TEXTURE3);
    g.bindTexture(g.TEXTURE_2D,this.washTexture);
    g.pixelStorei(g.UNPACK_ALIGNMENT,1);
    if(this.washTexSize!==sz){
      g.texImage2D(g.TEXTURE_2D,0,g.RG8,sz,sz,0,g.RG,g.UNSIGNED_BYTE,wash.texData);
      this.washTexSize=sz;
    }else{
      g.texSubImage2D(g.TEXTURE_2D,0,0,0,sz,sz,g.RG,g.UNSIGNED_BYTE,wash.texData);
    }
    g.activeTexture(g.TEXTURE0);
    this.washRevision=wash.texRevision;
  }
  uploadRibbons(batch){
    if(!batch||!batch.indexCount)return;
    const g=this.gl;
    let r=this.ribbonBuffers.get(batch);
    if(!r){
      const vao=g.createVertexArray(),vbo=g.createBuffer(),ibo=g.createBuffer();
      g.bindVertexArray(vao);
      g.bindBuffer(g.ARRAY_BUFFER,vbo);
      g.bufferData(g.ARRAY_BUFFER,batch.verts.byteLength,g.STREAM_DRAW);
      g.enableVertexAttribArray(0);g.vertexAttribPointer(0,3,g.FLOAT,false,RIBBON_STRIDE*4,0);
      g.enableVertexAttribArray(1);g.vertexAttribPointer(1,2,g.FLOAT,false,RIBBON_STRIDE*4,12);
      g.enableVertexAttribArray(2);g.vertexAttribPointer(2,4,g.FLOAT,false,RIBBON_STRIDE*4,20);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,ibo);
      g.bufferData(g.ELEMENT_ARRAY_BUFFER,batch.indices.byteLength,g.STREAM_DRAW);
      g.bindVertexArray(null);
      r={vao,vbo,ibo};
      this.ribbonBuffers.set(batch,r);
    }
    g.bindVertexArray(r.vao);
    g.bindBuffer(g.ARRAY_BUFFER,r.vbo);
    g.bufferSubData(g.ARRAY_BUFFER,0,batch.verts,0,batch.vertCount*RIBBON_STRIDE);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,r.ibo);
    g.bufferSubData(g.ELEMENT_ARRAY_BUFFER,0,batch.indices,0,batch.indexCount);
    g.bindVertexArray(null);
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
  drawCircleLayer(view,projection,seal,cfg,layerId,time,passthrough,ripple){
    if(!seal||!cfg||cfg.alpha<=.002||cfg.scale<=.01)return;
    const g=this.gl;
    g.useProgram(this.circleProg);
    g.bindVertexArray(this.flat);
    g.uniformMatrix4fv(this.circleU.view,false,view);
    g.uniformMatrix4fv(this.circleU.projection,false,projection);
    g.uniform3fv(this.circleU.circleCenter,seal.c);
    g.uniform3fv(this.circleU.circleRight,seal.u);
    g.uniform3fv(this.circleU.circleUp,seal.v);
    g.uniform3fv(this.circleU.circleNormal,seal.n);
    g.uniform1f(this.circleU.circleRadius,seal.r*cfg.radiusMul);
    g.uniform1f(this.circleU.circleZOff,cfg.zOff);
    g.uniform1f(this.circleU.circleLayer,layerId);
    g.uniform4f(this.circleU.circleParams,cfg.rot,cfg.scale,cfg.alpha,cfg.charge);
    g.uniform1f(this.circleU.time,time);
    g.uniform1f(this.circleU.passthrough,passthrough?1:0);
    g.uniform4f(this.circleU.handRipple,ripple[0],ripple[1],ripple[2],ripple[3]);
    g.drawArrays(g.TRIANGLE_STRIP,0,4);
  }
  drawWashQuad(view,projection,wash,alpha,charge,zOff,scale,time,passthrough,ripple){
    if(!wash||!wash.origin||alpha<=.002||this.washTexSize===0)return;
    const g=this.gl;
    g.useProgram(this.washProg);
    g.bindVertexArray(this.flat);
    g.uniformMatrix4fv(this.washU.view,false,view);
    g.uniformMatrix4fv(this.washU.projection,false,projection);
    g.uniform3fv(this.washU.washOrigin,wash.origin);
    g.uniform3fv(this.washU.washRight,wash.right);
    g.uniform3fv(this.washU.washDown,wash.down);
    g.uniform3fv(this.washU.washNormal,wash.normal);
    g.uniform1f(this.washU.washHalfSpan,wash.halfSpan);
    g.uniform1f(this.washU.washZOffset,zOff);
    g.uniform1f(this.washU.washScale,scale);
    g.uniform1f(this.washU.time,time);
    g.uniform1f(this.washU.passthrough,passthrough?1:0);
    g.uniform1f(this.washU.washAlpha,alpha);
    g.uniform1f(this.washU.washCharge,charge);
    g.uniform4f(this.washU.handRipple,ripple[0],ripple[1],ripple[2],ripple[3]);
    g.drawArrays(g.TRIANGLE_STRIP,0,4);
  }
  drawSealQuad(view,projection,sealVisual,time,passthrough,ripple){
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
    g.uniform1f(this.sealU.sealScale,sealVisual.scale??1);
    g.uniform1f(this.sealU.time,time);
    g.uniform1f(this.sealU.passthrough,passthrough?1:0);
    g.uniform4f(this.sealU.sealParams,sealVisual.writeProgress,sealVisual.charge,sealVisual.dissolve,sealVisual.alpha);
    g.uniform4f(this.sealU.handRipple,ripple[0],ripple[1],ripple[2],ripple[3]);
    g.drawArrays(g.TRIANGLE_STRIP,0,4);
  }
  drawRibbons(view,projection,batch,time,passthrough,ripple){
    if(!batch||!batch.indexCount)return;
    const rec=this.ribbonBuffers.get(batch);
    if(!rec)return;
    const g=this.gl;
    g.useProgram(this.ribbonProg);
    g.bindVertexArray(rec.vao);
    g.uniformMatrix4fv(this.ribbonU.view,false,view);
    g.uniformMatrix4fv(this.ribbonU.projection,false,projection);
    g.uniform1f(this.ribbonU.time,time);
    g.uniform1f(this.ribbonU.passthrough,passthrough?1:0);
    g.uniform4f(this.ribbonU.handRipple,ripple[0],ripple[1],ripple[2],ripple[3]);
    g.drawElements(g.TRIANGLES,batch.indexCount,g.UNSIGNED_SHORT,0);
  }
  bindCloud(view,projection,time,passthrough){
    const g=this.gl;
    g.useProgram(this.cloud);
    g.uniformMatrix4fv(this.uniforms.view,false,view);
    g.uniformMatrix4fv(this.uniforms.projection,false,projection);
    g.uniform1f(this.uniforms.time,time);
    g.uniform1f(this.uniforms.passthrough,passthrough?1:0);
  }
  eye(view,projection,groups,time,passthrough,hudView,sealVisual=null,extras=null) {
    const g=this.gl;
    const ripple=extras?.handRipple??[0,0,-10,0];
    const backRibbons=extras?.backRibbons??null;
    const frontRibbons=extras?.frontRibbons??null;
    const circleVisual=extras?.circleVisual??null;
    const washZ=circleVisual?circleVisual.washZOff:0;
    const washScale=circleVisual?circleVisual.washScale:1;
    if(!passthrough){g.disable(g.BLEND);g.useProgram(this.paper);g.bindVertexArray(this.flat);g.drawArrays(g.TRIANGLE_STRIP,0,4);}
    g.enable(g.BLEND);
    this.bindCloud(view,projection,time,passthrough);
    let sealDrawn=false, backRibbonsDrawn=false, frontRibbonsDrawn=false, backCircleDrawn=false, frontCircleDrawn=false;
    for(const item of groups){
      if(item.sheet){
        // Layer 0 (-9cm): Back Taoist Bagua & Cloud-Scroll Outer Magic Circle
        if(circleVisual?.back && !backCircleDrawn){
          this.drawCircleLayer(view,projection,circleVisual.seal,circleVisual.back,0,time,passthrough,ripple);
          backCircleDrawn=true;
        }
        // Layer 1 (-3cm): 1-Draw-Call WorldWash GPU Enso Quad (replaces ~4,465 splats!)
        if(item.alpha>0 && item.sheet.origin){
          this.drawWashQuad(view,projection,item.sheet,item.alpha,sealVisual?.charge??0,washZ,washScale,time,passthrough,ripple);
        }
        // Back 3D curved ribbons (orbital calligraphic arcs, palm helixes, crow flight trails) behind crisp 鳥
        if(backRibbons && !backRibbonsDrawn){
          this.drawRibbons(view,projection,backRibbons,time,passthrough,ripple);
          backRibbonsDrawn=true;
        }
        // Layer 2 (0cm): Crisp 3D SVG-SDF 鳥 calligraphy protagonist (true 11-stroke reveal!)
        if(sealVisual && !sealDrawn){
          this.drawSealQuad(view,projection,sealVisual,time,passthrough,ripple);
          sealDrawn=true;
        }
        this.bindCloud(view,projection,time,passthrough);
        continue;
      }
      if(!(passthrough&&item.scenery || !item.batch.count || item.alpha<=0)){
        const rec=this.buffers.get(item.batch);
        if(rec){
          g.bindVertexArray(rec.vao);
          g.uniform1f(this.uniforms.opacity,item.alpha);
          g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,item.batch.count);
        }
      }
      // Layer 3 (+7cm): Hollow Front Counter-Rotating Talisman/Cloud Ring + Front Crescent Slashes/Shockwaves
      if(item.frontAnchor){
        if(circleVisual?.front && !frontCircleDrawn){
          this.drawCircleLayer(view,projection,circleVisual.seal,circleVisual.front,1,time,passthrough,ripple);
          frontCircleDrawn=true;
        }
        if(frontRibbons && !frontRibbonsDrawn){
          this.drawRibbons(view,projection,frontRibbons,time,passthrough,ripple);
          frontRibbonsDrawn=true;
        }
        this.bindCloud(view,projection,time,passthrough);
      }
    }
    if(circleVisual?.back && !backCircleDrawn) this.drawCircleLayer(view,projection,circleVisual.seal,circleVisual.back,0,time,passthrough,ripple);
    if(backRibbons && !backRibbonsDrawn) this.drawRibbons(view,projection,backRibbons,time,passthrough,ripple);
    if(sealVisual && !sealDrawn) this.drawSealQuad(view,projection,sealVisual,time,passthrough,ripple);
    if(circleVisual?.front && !frontCircleDrawn) this.drawCircleLayer(view,projection,circleVisual.seal,circleVisual.front,1,time,passthrough,ripple);
    if(frontRibbons && !frontRibbonsDrawn) this.drawRibbons(view,projection,frontRibbons,time,passthrough,ripple);
    if(hudView&&this.lastLabel){
      g.useProgram(this.hud);g.bindVertexArray(this.flat);g.uniformMatrix4fv(this.hudView,false,hudView);
      g.uniformMatrix4fv(this.hudProjection,false,projection);g.drawArrays(g.TRIANGLE_STRIP,0,4);
    }
    g.bindVertexArray(null);
  }
}
