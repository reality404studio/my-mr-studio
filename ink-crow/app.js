import {Duel} from './duel.js?v=9431b4a';
import {Painter,perspective,identity} from './render.js?v=9431b4a';
import {clamp,mul,dist,lerp3,random} from './gesture.js?v=9431b4a';
import {PaperPreview} from './paper-preview.js?v=9431b4a';
import {Rehearsal} from './rehearsal.js?v=9431b4a';
import {Immersion,supportedModes} from './xr.js?v=9431b4a';
import {loadGlyphSdf} from './glyph-sdf.js?v=9431b4a';

const $=id=>document.getElementById(id),canvas=$('field'),guide=$('guide');
const game=new Duel(),FOV=51*Math.PI/180,view=identity();
let painter,xr,modes=[],mode='cover',demo=new Rehearsal(),last=null,anim=0,viewportKey='',proj;
let paintedCover='',modesChecked=false,loadedGlyphSdf=null;
let pointer=null,down=false,afterLift=false,lean=0,lastHint='',manualClock=0;
function prepare(){
  game.paint();
  if(painter?.gl){
    painter.uploadWash(game.brush);
    painter.uploadRibbons(game.backRibbons);
    painter.uploadRibbons(game.frontRibbons);
  }
  for(const g of game.groups){
    if(g.sheet&&painter?.gl)continue;
    const revision=g.scenery?0:g.batch===game.brush.marks?game.brush.revision:game.frame;
    painter.upload(g.batch,revision,Boolean(g.scenery));
  }
}
function showHud(){
  const p=game.phase,cover=mode==='cover',stage=p==='ready'||p==='trace'?1:p==='seal'||p==='charge'?2:3;
  const headline=cover?'까마귀를 부르세요':'';
  const hint=cover?'한 손으로 먹진을 그리고, 손바닥으로 기운을 불어넣으세요.':'';
  const key=[mode,headline,hint,game.selfHP,game.enemyHP].join('|');
  if(key!==lastHint){
    lastHint=key;$('phaseTitle').textContent=headline;$('instruction').textContent=hint;
    $('phaseTitle').hidden=!cover;$('instruction').hidden=!cover;
    const prog=document.querySelector('#caption .progress');if(prog)prog.hidden=!cover;
    for(let i=1;i<=3;i++)$('step'+i).classList.toggle('active',i<=(cover?1:stage));
    $('playButton').innerHTML=mode==='play'?'다시 시작 <span aria-hidden="true">↻</span>':'직접 그리기 <span aria-hidden="true">↗</span>';
    $('demoButton').innerHTML=mode==='demo'?'시연 처음부터 <span aria-hidden="true">↺</span>':'시연 보기 <span aria-hidden="true">▷</span>';
    $('vitals').hidden=cover;
    $('enemyHp').textContent='●'.repeat(game.enemyHP)+'○'.repeat(3-game.enemyHP);
    $('playerHp').textContent='●'.repeat(game.selfHP)+'○'.repeat(3-game.selfHP);
  }
  const meter=$('holdMeter');
  if(mode==='play'&&down&&p==='charge'&&pointer){
    meter.style.display='block';meter.style.left=pointer.x+'px';meter.style.top=pointer.y+'px';meter.style.setProperty('--fill',game.charge*360+'deg');
  }else meter.style.display='none';
}
function beginMode(next){
  mode=next;game.reset();demo=new Rehearsal();lean=0;down=false;pointer=null;afterLift=false;last=null;manualClock=performance.now();
  document.body.classList.toggle('manual',mode==='play');document.body.classList.toggle('watching',mode==='demo');
  if(mode==='cover'){
    for(let i=0;i<540;i++){
      game.tick(1/72,demo.hands(game,1/72));
      if(game.phase==='release'&&game.phaseTime>=1.14)break;
    }
  }
  viewportKey='';paintedCover='';prepare();showHud();
}
function screenFov(width,height){
  return 2*Math.atan(Math.tan(FOV/2)*Math.max(1,.98*height/width));
}
function desktopPoint(e){
  const rect=canvas.getBoundingClientRect(),z=-1.22,half=-z*Math.tan(screenFov(rect.width,rect.height)/2);
  const x=e.clientX-rect.left,y=e.clientY-rect.top;
  return {x,y,p:[lean+(2*x/rect.width-1)*half*rect.width/rect.height,(1-2*y/rect.height)*half,z]};
}
function mouseHands(){
  if(!pointer)return [];
  const casting=game.phase==='seal'||game.phase==='charge',p=pointer.p;
  return [{side:'right',draw:down&&!casting,tip:p,palm:p,normal:game.seal?mul(game.seal.n,-1):[0,0,-1],open:casting&&afterLift&&down}];
}
// Consume captured pointer positions on their own clock, including a quick
// flick entirely between two display frames. Each interval is simulated once.
function advanceManual(ms, target=null){
  const dt=clamp((ms-manualClock)/1000,0,.05);
  manualClock=Math.max(ms,manualClock);
  const from=pointer, trace=down && from && target && (game.phase==='ready'||game.phase==='trace');
  const steps=trace?Math.min(96,Math.max(1,Math.ceil(dist(from.p,target.p)/.032))):1;
  for(let i=1;i<=steps&&dt>0;i++){
    if(target)pointer=trace && i<steps?{...target,p:lerp3(from.p,target.p,i/steps)}:target;
    const phase=game.phase;
    game.tick(dt/steps,mouseHands(),[lean,0,0]);
    if(phase==='trace'&&game.seal)afterLift=!down;
  }
  if(target)pointer=target;
}
function desktop(ms){
  if(xr?.session||painter?.gl?.isContextLost())return;
  anim=requestAnimationFrame(desktop);
  if(document.hidden){game.interruptTracking();last=null;manualClock=ms;paintedCover='';return;}
  if(mode==='demo'&&last!==null && ms-last>150)last=null;
  const dt=last===null?1/72:clamp((ms-last)/1000,0,.05);last=ms;
  if(mode!=='cover'){
    if(mode==='play'&&!down){
      const target=game.shot&&pointer?clamp(pointer.x/canvas.clientWidth*2-1,-1,1)*.40:0;
      lean+=(target-lean)*(1-Math.exp(-dt*10));
    }
    if(mode==='play')advanceManual(ms);
    else game.tick(dt,demo.hands(game,dt),[lean,0,0]);
    prepare();showHud();
  }
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,1.65);
  const key=w+'x'+h+'@'+dpr;
  if(viewportKey!==key){canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));proj=perspective(w/h,screenFov(w,h));viewportKey=key;}
  if(mode==='cover'&&paintedCover===key)return;
  if(mode==='cover')paintedCover=key;
  const gl=painter.gl;if(gl){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);}
  view[12]=-lean;painter.eye(view,proj,game.groups,game.time,false,null,game.sealVisual,{
    backRibbons:game.backRibbons,frontRibbons:game.frontRibbons,handRipple:game.handRipple,circleVisual:game.circleVisual
  });
}
async function refreshModes(){
  modes=painter?.gl?await supportedModes():[];modesChecked=true;
  $('questText').textContent=modes.includes('immersive-vr')?'VR 대련 시작':modes.includes('immersive-ar')?'패스스루로 시작':'Quest에서 열기';
  if($('vrAlternative'))$('vrAlternative').hidden=!modes.includes('immersive-vr');
  if($('arAlternative'))$('arAlternative').hidden=!modes.includes('immersive-ar');
}
function showProgress(){
  const box=$('entryStatus');
  if(box)box.hidden=true;
}
function enterXR(chosen=modes[0]){
  game.sound.unlock();
  if(xr?.attempt)return;
  if(!chosen&&!modesChecked&&navigator.xr&&painter?.gl&&window.isSecureContext)chosen='immersive-vr';
  if(!chosen){beginMode('play');return;}
  if(guide?.open)guide.close();
  $('questButton').disabled=true;
  // Keep the regular window painting while the browser decides the request.
  xr.start(chosen);
}
function resumePage(){
  $('questButton').disabled=false;
  if($('entryStatus'))$('entryStatus').hidden=true;
  if(!painter.gl?.isContextLost()){
    beginMode('play');cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);
  }
}
function boot(){
  try{
    painter=new Painter(canvas);
    game.brush.skipSplatBake=true;
  }catch(e){
    if(!e.message.includes('WebGL 2'))throw e;
    painter=new PaperPreview(canvas);
    game.brush.skipSplatBake=false;
  }
  xr=new Immersion(painter,game,prepare,()=>Boolean($('metrics')?.checked),resumePage,showProgress);
  beginMode('cover');anim=requestAnimationFrame(desktop);refreshModes();
  loadGlyphSdf('./assets/glyph-bird.svg?v=9431b4a').then(sdf=>{
    loadedGlyphSdf=sdf;
    painter?.setGlyphSdf?.(sdf);
    game.setGlyphSdfMeta(sdf);
    const samples=sdf.sample(game.bird.length,random(7703));
    if(samples)game.setGlyphSamples(samples);
    if(mode==='cover'){beginMode('cover');}
  }).catch(err=>console.warn('Glyph SDF load fallback:',err));
}
let activePointer=null;
canvas.addEventListener('pointerdown',e=>{
  game.sound.unlock();
  if(!painter||activePointer!==null)return;
  if(mode!=='play')beginMode('play');
  canvas.focus({preventScroll:true});activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);
  advanceManual(performance.now());pointer=desktopPoint(e);down=true;
  if(game.phase==='ready')game.drawInput(0,mouseHands(),[lean,0,0]);
});
canvas.addEventListener('pointermove',e=>{
  if(mode!=='play'||(activePointer!==null&&activePointer!==e.pointerId))return;
  if(down)advanceManual(performance.now(),desktopPoint(e));else pointer=desktopPoint(e);
});
function lift(e){
  if(e.pointerId!==activePointer)return;
  if(e.type==='pointerup')advanceManual(performance.now(),desktopPoint(e));
  else game.interruptTracking();
  down=false;afterLift=true;activePointer=null;
}
for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,lift);
window.addEventListener('blur',()=>{game.interruptTracking();down=false;activePointer=null;afterLift=true;paintedCover='';});
$('playButton').onclick=()=>{game.sound.unlock();if(painter){beginMode('play');canvas.focus({preventScroll:true});}};
$('demoButton').onclick=()=>{game.sound.unlock();if(painter)beginMode('demo');};
if($('helpButton'))$('helpButton').hidden=true;
$('questButton').onclick=()=>enterXR();
if($('vrAlternative'))$('vrAlternative').onclick=()=>enterXR('immersive-vr');
if($('arAlternative'))$('arAlternative').onclick=()=>enterXR('immersive-ar');
if($('backToPage'))$('backToPage').onclick=()=>xr?.stop();
if($('closeGuide'))$('closeGuide').onclick=()=>guide?.close();
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();cancelAnimationFrame(anim);
  if(xr?.attempt && xr.step!=='graphics')xr.stop('그래픽 연결이 끊겼습니다. 복구 후 다시 입장해 주세요. [XR-context]');
});
canvas.addEventListener('webglcontextrestored',()=>{
  try{
    painter=new Painter(canvas);xr.painter=painter;
    game.brush.skipSplatBake=true;
    if(loadedGlyphSdf)painter.setGlyphSdf(loadedGlyphSdf);
    viewportKey='';paintedCover='';prepare();
    if(!xr.session){cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);}
  }catch{xr?.stop('그래픽을 다시 준비하지 못했습니다. [XR-restore]');}
});
navigator.xr?.addEventListener('devicechange',refreshModes);
try{boot();}catch(e){$('failure').hidden=false;$('failure').textContent='대련장을 열 수 없습니다. '+e.message;}

