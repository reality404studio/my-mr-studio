import {Duel} from './duel.js';
import {Painter,perspective,identity} from './render.js?v=quest-entry-4';
import {clamp,mul,dist,lerp3} from './gesture.js';
import {PaperPreview} from './paper-preview.js';
import {Rehearsal} from './rehearsal.js';
import {Immersion,supportedModes,entrySteps} from './xr.js?v=quest-entry-4';

const $=id=>document.getElementById(id),canvas=$('field'),guide=$('guide');
const game=new Duel(),FOV=51*Math.PI/180,view=identity();
let painter,xr,modes=[],mode='cover',demo=new Rehearsal(),last=null,anim=0,viewportKey='',proj;
let paintedCover='',modesChecked=false;
let pointer=null,down=false,afterLift=false,lean=0,lastHint='',manualClock=0;
const ds={ready:'빈 곳을 누르고 드래그해서 원을 그리세요.',trace:'처음 그은 자리 가까이 돌아오세요.',
  seal:'손을 뗀 뒤 원 가운데를 길게 누르세요.',charge:'손을 그대로 두면 까마귀가 깨어납니다.',
  release:'먹깃이 펼쳐지면 까마귀가 상대를 향해 날아갑니다.',recover:'다음 먹진을 그릴 준비를 하세요.'};
function prepare(){
  game.paint();
  for(const g of game.groups){
    const revision=g.scenery?0:g.batch===game.brush.marks?game.brush.revision:game.frame;
    painter.upload(g.batch,revision);
  }
}
function showHud(){
  const p=game.phase,cover=mode==='cover',stage=p==='ready'||p==='trace'?1:p==='seal'||p==='charge'?2:3;
  const headline=cover?'까마귀를 부르세요':game.info()[0];
  let hint=cover?'한 손으로 먹진을 그리고, 손바닥으로 기운을 불어넣으세요.':mode==='demo'?(game.info()[1]||ds[p]||''):ds[p]||game.info()[1];
  if(!cover&&game.shot)hint='붉은 먹이 다가옵니다. 포인터를 화면 옆으로 움직여 피하세요.';
  if(!cover&&p==='charge')hint+='  '+Math.floor(game.charge*100)+'%';
  const key=[mode,headline,hint,game.selfHP,game.enemyHP].join('|');
  if(key!==lastHint){
    lastHint=key;$('phaseTitle').textContent=headline;$('instruction').textContent=hint;
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
  if(document.hidden||guide.open){game.interruptTracking();last=null;manualClock=ms;paintedCover='';return;}
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
  view[12]=-lean;painter.eye(view,proj,game.groups,game.time,false,null);
}
function showGuide(message=''){
  $('notice').textContent=message;
  $('vrAlternative').hidden=!modes.includes('immersive-vr');$('arAlternative').hidden=!modes.includes('immersive-ar');
  if(!guide.open)guide.showModal();
}
function unavailable(){
  if(!window.isSecureContext)return 'XR 입장에는 HTTPS 주소가 필요합니다. [XR-https]';
  if(!navigator.xr)return '이 브라우저에서 WebXR을 찾을 수 없습니다. 퀘스트의 Meta Quest Browser에서 이 주소를 직접 열어 주세요. [XR-browser]';
  if(!painter?.gl)return 'WebGL 2 화면을 만들 수 없습니다. 브라우저에서 페이지를 다시 열어 주세요. [XR-webgl]';
  if(document.featurePolicy?.allowsFeature('xr-spatial-tracking')===false)
    return '현재 페이지에서는 XR 공간 추적이 차단되어 있습니다. 링크를 새 탭에서 직접 열어 주세요. [XR-policy]';
  return '브라우저에서 사용할 수 있는 몰입 모드가 없습니다. 퀘스트의 Meta Quest Browser에서 다시 열어 주세요. [XR-mode]';
}
async function refreshModes(){
  modes=painter?.gl?await supportedModes():[];modesChecked=true;
  $('questText').textContent=modes.includes('immersive-vr')?'VR 대련 시작':modes.includes('immersive-ar')?'패스스루로 시작':'Quest에서 열기';
  $('vrAlternative').hidden=!modes.includes('immersive-vr');$('arAlternative').hidden=!modes.includes('immersive-ar');
}
const traceKey='mukjeon-xr-entry-v2';
function showProgress(step){
  const box=$('entryStatus');
  box.hidden=step==='ready';
  if(step==='ready'){
    try{sessionStorage.removeItem(traceKey);}catch{}
    return;
  }
  $('entryText').textContent=entrySteps[step]+' 기다리는 중…';
  try{sessionStorage.setItem(traceKey,step);}catch{}
}
function enterXR(chosen=modes[0]){
  if(xr?.attempt)return;
  if(!chosen&&!modesChecked&&navigator.xr&&painter?.gl&&window.isSecureContext)chosen='immersive-vr';
  if(!chosen){showGuide(unavailable());return;}
  if(guide.open)guide.close();
  $('questButton').disabled=true;
  // Keep the regular window painting while the browser decides the request.
  xr.start(chosen);
}
function resumePage(message){
  $('questButton').disabled=false;$('entryStatus').hidden=true;
  try{sessionStorage.removeItem(traceKey);}catch{}
  if(!painter.gl?.isContextLost()){
    beginMode('play');cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);
  }
  if(message)showGuide(message);
}
function boot(){
  try{painter=new Painter(canvas);}catch(e){
    if(!e.message.includes('WebGL 2'))throw e;
    painter=new PaperPreview(canvas);
  }
  xr=new Immersion(painter,game,prepare,()=>$('metrics').checked,resumePage,showProgress);
  beginMode('cover');anim=requestAnimationFrame(desktop);refreshModes();
  let interrupted='';
  try{interrupted=sessionStorage.getItem(traceKey);sessionStorage.removeItem(traceKey);}catch{}
  if(Object.hasOwn(entrySteps,interrupted))showGuide('이전 입장은 '+entrySteps[interrupted]+' 단계에서 중단됐습니다. [XR-'+interrupted+']');
}
let activePointer=null;
canvas.addEventListener('pointerdown',e=>{
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
$('playButton').onclick=()=>{if(painter){beginMode('play');canvas.focus({preventScroll:true});}};
$('demoButton').onclick=()=>{if(painter)beginMode('demo');};
$('helpButton').onclick=()=>showGuide();
$('questButton').onclick=()=>enterXR();$('vrAlternative').onclick=()=>enterXR('immersive-vr');
$('arAlternative').onclick=()=>enterXR('immersive-ar');
$('backToPage').onclick=()=>xr?.stop();
$('closeGuide').onclick=()=>guide.close();
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('notice').textContent='접속 주소를 복사했습니다.';}
  catch{$('notice').textContent=location.href;}};
guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();cancelAnimationFrame(anim);
  if(xr?.attempt && xr.step!=='graphics')xr.stop('그래픽 연결이 끊겼습니다. 복구 후 다시 입장해 주세요. [XR-context]');
});
canvas.addEventListener('webglcontextrestored',()=>{
  try{
    painter=new Painter(canvas);xr.painter=painter;
    viewportKey='';paintedCover='';prepare();
    if(!xr.session){cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);}
  }catch{xr?.stop('그래픽을 다시 준비하지 못했습니다. [XR-restore]');showGuide('페이지를 새로고침해 주세요. [XR-restore]');}
});
navigator.xr?.addEventListener('devicechange',refreshModes);
try{boot();}catch(e){$('failure').hidden=false;$('failure').textContent='대련장을 열 수 없습니다. '+e.message;}
