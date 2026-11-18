import {Duel} from './duel.js';
import {Painter,perspective,identity} from './render.js';
import {clamp,mul} from './gesture.js';
import {PaperPreview} from './paper-preview.js';
import {Rehearsal} from './rehearsal.js';
import {Immersion,supportedModes} from './xr.js';

const $=id=>document.getElementById(id),canvas=$('field'),guide=$('guide');
const game=new Duel(),FOV=51*Math.PI/180,view=identity();
let painter,xr,modes=[],mode='cover',demo=new Rehearsal(),last=null,anim=0,viewportKey='',proj;
let paintedCover='';
let pointer=null,down=false,afterLift=false,lean=0,lastHint='';
const ds={ready:'빈 곳을 누르고 드래그해서 원을 그리세요.',trace:'처음 그은 자리 가까이 돌아오세요.',
  seal:'손을 뗀 뒤 원 가운데를 길게 누르세요.',charge:'손을 그대로 두면 까마귀가 깨어납니다.',
  release:'먹깃이 펼쳐지면 까마귀가 상대를 향해 날아갑니다.',recover:'다음 먹진을 그릴 준비를 하세요.'};
function prepare(){
  game.paint();
  for(const g of game.groups){
    const revision=g.scenery?0:g.batch===game.brush.marks?game.brush.generation*6000+game.brush.marks.count:game.frame;
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
  mode=next;game.reset();demo=new Rehearsal();lean=0;down=false;pointer=null;afterLift=false;last=null;
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
function desktop(ms){
  if(xr?.session)return;
  anim=requestAnimationFrame(desktop);
  if(document.hidden||guide.open){last=null;return;}
  const dt=last===null?1/72:clamp((ms-last)/1000,0,.05);last=ms;
  if(mode!=='cover'){
    if(mode==='play'&&!down){
      const target=game.shot&&pointer?clamp(pointer.x/canvas.clientWidth*2-1,-1,1)*.40:0;
      lean+=(target-lean)*(1-Math.exp(-dt*10));
    }
    const p=game.phase;
    game.tick(dt,mode==='demo'?demo.hands(game,dt):mouseHands(),[lean,0,0]);
    if(p==='trace'&&game.seal)afterLift=!down;
    prepare();showHud();
  }
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,1.65);
  const key=w+'x'+h+'@'+dpr;
  if(viewportKey!==key){canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));proj=perspective(w/h,screenFov(w,h));viewportKey=key;}
  if(mode==='cover'&&paintedCover===key)return;
  if(mode==='cover')paintedCover=key;
  const gl=painter.gl;if(gl){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);}
  view[12]=-lean;painter.eye(view,proj,game.groups,game.time,false,null);
}
function showGuide(message=''){
  $('notice').textContent=message;$('vrAlternative').hidden=!modes.includes('immersive-vr');
  if(!guide.open)guide.showModal();
}
async function refreshModes(){
  modes=painter?.gl?await supportedModes():[];
  $('questText').textContent=modes.length?'Quest 대련 시작':'Quest에서 열기';
}
async function enterXR(chosen=modes[0]){
  if(!chosen){
    showGuide(window.isSecureContext?'Quest 3S에서 이 주소를 Meta Quest Browser로 열고 손 추적을 켜세요.':'헤드셋에서는 HTTPS 또는 USB로 연결한 localhost 주소로 여세요.');return;
  }
  if(guide.open)guide.close();$('questButton').disabled=true;
  cancelAnimationFrame(anim);
  try{await xr.start(chosen);}
  catch(e){
    const msg=e.name==='NotAllowedError'?'손 추적과 XR 사용 권한을 허용한 뒤 다시 입장하세요.':
      'XR 세션을 시작하지 못했습니다. 손 추적 설정을 확인하거나 VR로 입장해 보세요.';
    showGuide(msg+' ('+e.name+')');
    cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);
  }finally{$('questButton').disabled=false;}
}
function boot(){
  try{painter=new Painter(canvas);}catch(e){
    if(!e.message.includes('WebGL 2'))throw e;
    painter=new PaperPreview(canvas);
  }
  xr=new Immersion(painter,game,prepare,()=>$('metrics').checked,()=>{
    beginMode('play');cancelAnimationFrame(anim);anim=requestAnimationFrame(desktop);
  });
  beginMode('cover');anim=requestAnimationFrame(desktop);refreshModes();
}
let activePointer=null;
canvas.addEventListener('pointerdown',e=>{
  if(!painter||activePointer!==null)return;
  if(mode!=='play')beginMode('play');
  canvas.focus({preventScroll:true});activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);
  pointer=desktopPoint(e);down=true;
});
canvas.addEventListener('pointermove',e=>{if(mode==='play'&&(activePointer===null||activePointer===e.pointerId))pointer=desktopPoint(e);});
function lift(e){if(e.pointerId!==activePointer)return;down=false;afterLift=true;activePointer=null;}
for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,lift);
window.addEventListener('blur',()=>{down=false;activePointer=null;afterLift=true;});
$('playButton').onclick=()=>{if(painter){beginMode('play');canvas.focus({preventScroll:true});}};
$('demoButton').onclick=()=>{if(painter)beginMode('demo');};
$('helpButton').onclick=()=>showGuide();
$('questButton').onclick=()=>enterXR();$('vrAlternative').onclick=()=>enterXR('immersive-vr');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('notice').textContent='접속 주소를 복사했습니다.';}
  catch{$('notice').textContent=location.href;}};
guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(anim);xr?.session?.end().catch(()=>{});});
canvas.addEventListener('webglcontextrestored',()=>{cancelAnimationFrame(anim);boot();});
navigator.xr?.addEventListener('devicechange',refreshModes);
try{boot();}catch(e){$('failure').hidden=false;$('failure').textContent='대련장을 열 수 없습니다. '+e.message;}
