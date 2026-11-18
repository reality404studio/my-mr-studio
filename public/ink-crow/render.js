import {STRIDE} from './ink.js';
import {random} from './gesture.js';

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
void main(){
  if(material.z>7.5){
    vec3 world=center+axis*(corner.x*halfSize.x)+sheetDown*(corner.y*halfSize.y);
    gl_Position=projection*view*vec4(world,1.);uv=corner;ink=material;spread=1.;return;
  }
  vec4 p=view*vec4(center,1);
  vec3 cameraAxis=mat3(view)*axis;
  vec2 a=cameraAxis.xy-cameraAxis.z*p.xy/min(-.035,p.z);
  float l=length(a);
  vec2 along=l>.0001?a/l:vec2(1,0);
  float dried=1.-exp(-max(time-born,0.)*1.65);
  spread=1.+material.y*.68*dried;
  vec2 extent=halfSize*vec2(max(.22,min(l,1.)),spread);
  p.xy+=along*corner.x*extent.x+vec2(-along.y,along.x)*corner.y*extent.y;
  gl_Position=projection*p; uv=corner; ink=material;
}`;
const inkFrag=`#version 300 es
precision mediump float;
in vec2 uv;
flat in vec4 ink;
flat in float spread;
uniform sampler2D grain;
uniform float opacity;
out vec4 color;
vec3 palette(float i){
  if(i<.5) return vec3(.053,.065,.066);
  if(i<1.5) return vec3(.18,.245,.255);
  if(i<2.5) return vec3(.59,.141,.084);
  if(i<3.5) return vec3(.94,.895,.766);
  if(i<4.5) return vec3(.32,.405,.416);
  if(i<5.5) return vec3(.58,.625,.591);
  if(i<6.5) return vec3(.72,.274,.173);
  return vec3(.73,.52,.246);
}
void main(){
  if(ink.z>7.5){
    // Tent kernels sum to one between four deposits. Optical depths add,
    // preserving a smooth wet wash even as the whole seal fades.
    vec2 weights=max(vec2(0.),1.-abs(uv));
    float alpha=1.-exp(-1.58*ink.x*weights.x*weights.y*opacity);
    color=vec4(vec3(.067,.071,.067)*alpha,alpha);return;
  }
  float r2=dot(uv,uv);
  if(r2>1.) discard;
  vec2 jitter=texture(grain,uv*vec2(.17,.46)+ink.w*vec2(7.37,2.71)).rg;
  float edge=r2+(jitter.x-.5)*.19;
  float water=ink.y;
  float core=exp(-2.2*max(0.,edge)*spread*spread);
  float wash=exp(-1.65*max(0.,edge))/spread;
  float tooth=mix(.25,1.,smoothstep(.14,.60,jitter.y+.30*water));
  float stain=water*clamp((spread-1.)*1.9,0.,1.)*.23;
  float rimOffset=sqrt(max(.001,edge))-.72;
  float rim=exp(-56.*rimOffset*rimOffset)/spread;
  float density=ink.x*(core*.76+wash*(.24-stain)+rim*stain)*tooth*(1.-smoothstep(.69,1.,edge));
  float a=(1.-exp(-density))*opacity;
  vec3 pigment=palette(ink.z)*(1.+.20*(jitter.x-.5));
  color=vec4(pigment*a,a);
}`;
const paperVert=`#version 300 es
layout(location=0) in vec2 a;out vec2 uv;
void main(){gl_Position=vec4(a,0.,1.);uv=a*.5+.5;}`;
const paperFrag=`#version 300 es
precision mediump float;
in vec2 uv;uniform sampler2D grain;out vec4 color;
void main(){
  float g=texture(grain,gl_FragCoord.xy/128.).r;
  float cloud=texture(grain,uv*1.3).b;
  float edge=dot(uv-.5,uv-.5);
  vec3 paper=mix(vec3(.958,.942,.891),vec3(.876,.861,.805),clamp(.16+edge*.70+cloud*.24,0.,1.));
  color=vec4(paper+(g-.5)*.033,1.);
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
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true,depth:false,stencil:false,powerPreference:'high-performance'});
    if (!gl) throw Error('WebGL 2를 사용할 수 없습니다.');
    this.gl=gl; this.cloud=program(gl,quadVert,inkFrag);this.paper=program(gl,paperVert,paperFrag);this.hud=program(gl,hudVert,hudFrag);
    this.uniforms={};
    for (const name of ['view','projection','time','opacity','sheetDown']) this.uniforms[name]=gl.getUniformLocation(this.cloud,name);
    this.hudView=gl.getUniformLocation(this.hud,'view');this.hudProjection=gl.getUniformLocation(this.hud,'projection');
    gl.useProgram(this.cloud);gl.uniform1i(gl.getUniformLocation(this.cloud,'grain'),0);
    gl.useProgram(this.paper);gl.uniform1i(gl.getUniformLocation(this.paper,'grain'),0);
    gl.useProgram(this.hud);gl.uniform1i(gl.getUniformLocation(this.hud,'label'),1);
    this.corners=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.corners);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.flat=this.makeVao(null);
    const size=128,bytes=new Uint8Array(size*size*4),rng=random(39);
    for (let y=0;y<size;y++) {
      let fibre=rng();
      for(let x=0;x<size;x++) {
        const i=(y*size+x)*4;fibre=fibre*.80+rng()*.2;
        bytes[i]=rng()*255;bytes[i+1]=Math.max(0,Math.min(255,(fibre-.23)*490));
        bytes[i+2]=(Math.sin(x*.049+Math.sin(y*.098))+1)*90+35;bytes[i+3]=255;
      }
    }
    const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    this.labelCanvas=document.createElement('canvas');this.labelCanvas.width=896;this.labelCanvas.height=132;
    this.labelTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.labelTexture);
    for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    this.buffers=new Map();
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
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
  eye(view,projection,groups,time,passthrough,hudView) {
    const g=this.gl;
    if(!passthrough){g.disable(g.BLEND);g.useProgram(this.paper);g.bindVertexArray(this.flat);g.drawArrays(g.TRIANGLE_STRIP,0,4);}
    g.enable(g.BLEND);g.useProgram(this.cloud);
    g.uniformMatrix4fv(this.uniforms.view,false,view);g.uniformMatrix4fv(this.uniforms.projection,false,projection);g.uniform1f(this.uniforms.time,time);
    for(const item of groups){
      if(passthrough&&item.scenery || !item.batch.count || item.alpha<=0)continue;
      if(item.sheet)g.uniform3fv(this.uniforms.sheetDown,item.sheet.down);
      g.bindVertexArray(this.buffers.get(item.batch).vao);g.uniform1f(this.uniforms.opacity,item.alpha);
      g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,item.batch.count);
    }
    if(hudView&&this.lastLabel){
      g.useProgram(this.hud);g.bindVertexArray(this.flat);g.uniformMatrix4fv(this.hudView,false,hudView);
      g.uniformMatrix4fv(this.hudProjection,false,projection);g.drawArrays(g.TRIANGLE_STRIP,0,4);
    }
    g.bindVertexArray(null);
  }
}
