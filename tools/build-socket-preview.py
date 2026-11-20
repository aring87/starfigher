"""Build private native-material review pages. Never imports real pilot storage.

Run again after renderer edits. Current and frozen-before pages share the same
controls and use the real game's draw functions, stage art, source frames and
body/material/fracture composite. This is a visual fixture, not a pixel test.
"""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--baseline", type=Path, default=ROOT / "artifacts/socket-preview-before-source.js")
args = parser.parse_args()
source = (ROOT / "game.js").read_text(encoding="utf-8")
if not args.baseline.exists():
    args.baseline.write_text(source, encoding="utf-8")

CONTROLS = r'''
  // Private visual fixture. The shipping update loop is held; no combat or
  // save transition advances. Every pixel below comes from production paint.
  let socketReviewAnimate=false,socketReviewClock=.17,socketReviewContact=false,socketReviewPose=0;
  update=()=>{};
  const socketPanel=document.createElement('aside');socketPanel.id='socket-review-controls';
  socketPanel.innerHTML='<b>PRIVATE SOCKET REVIEW</b><select id="socket-enemy" aria-label="Socket review enemy"></select><button id="socket-load">LOAD</button><button id="socket-phase">NEXT PHASE</button><button id="socket-step">NEXT POSE</button><button id="socket-motion">PLAY MOTION</button><label><input type="checkbox" id="socket-detail">2× DETAIL</label><label><input type="checkbox" id="socket-damaged">DAMAGED</label><button id="socket-contact">ALL 22 CONTACT SHEET</button><span id="socket-status"></span><a href="artifacts/socket-preview-before.html">BEFORE</a><a href="artifacts/socket-preview.html">CURRENT</a>';
  document.body.appendChild(socketPanel);
  const socketSelect=socketPanel.querySelector('#socket-enemy');
  const socketRoster=[];
  for(const[family,defs]of[['mini',miniBossDefs],['main',bossTypes],['epic',epicBossTypes]])defs.forEach((def,index)=>{const key=family+':'+index;socketRoster.push({family,index,key,name:def.name});const option=document.createElement('option');option.value=key;option.textContent=family.toUpperCase()+' / '+def.name;socketSelect.appendChild(option)});
  const socketArea=document.createElement('main');socketArea.id='socket-review-area';
  socketArea.innerHTML='<header><h1 id="socket-heading">NATIVE WEAKPOINT STUDY</h1><p>Identical poses and actual stage art. Left: sealed. Right: fully exposed. Normal view uses the shipping 960 × 540 world scale; 2× Detail is explicitly enlarged. The first boss is the approved reference.</p></header><div class="socket-pair"><section><h2>SEALED / IN THE ARMOR</h2><canvas id="socket-sealed" width="960" height="540"></canvas></section><section><h2>EXPOSED / SAME ANATOMY</h2><canvas id="socket-open" width="960" height="540"></canvas></section></div><canvas id="socket-contact-sheet" width="1920" height="3520" hidden></canvas><p id="socket-scope">Practice storage only · rendering fixture · no loot or progression</p>';
  document.body.appendChild(socketArea);
  const socketSealed=socketArea.querySelector('#socket-sealed'),socketOpen=socketArea.querySelector('#socket-open'),socketSheet=socketArea.querySelector('#socket-contact-sheet');
  const socketStyle=document.createElement('style');socketStyle.textContent=`
    html,body{background:#050b14!important;overflow:auto!important;color:#d8edf8!important;font:13px sans-serif!important}#game-shell{visibility:hidden!important;position:fixed!important;pointer-events:none!important}#socket-review-controls{position:sticky;top:0;z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:9px;background:#0b1726;border-bottom:1px solid #315268}#socket-review-controls button,#socket-review-controls select{background:#12283a;color:#d9f5ff;border:1px solid #46697b;padding:7px;font:700 11px sans-serif}#socket-review-controls a{color:#79dce9;margin-left:5px}#socket-review-area{padding:12px;max-width:1920px;margin:auto}#socket-review-area h1{font-size:20px;margin:3px 0 6px}#socket-review-area p{color:#8faebf;line-height:1.5;margin:0 0 12px}.socket-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.socket-pair section{min-width:0;border:1px solid #28475a;background:#08101b}.socket-pair h2{font:700 12px sans-serif;letter-spacing:.12em;padding:10px;margin:0;color:#a9e2e9}.socket-pair canvas{width:100%;display:block}#socket-contact-sheet{width:100%;height:auto}#socket-review-area [hidden]{display:none!important}#socket-status{font:11px monospace;color:#eac182}
  `;document.head.appendChild(socketStyle);
  const socketParams=new URLSearchParams(location.search),wanted=socketParams.get('enemy');
  socketSelect.value=socketRoster.some(item=>item.key===wanted)?wanted:'main:0';
  let socketCurrent=null,socketAll=null,socketReadySignature='',socketLastFrame=0,socketRenderDue=true;
  function socketSetClock(e,clock){
    e.clock=clock;
    if(e.kind==='boss'&&!e.epic){
      if(e.type===3){const period=e.phase===2?1.25:1.3;e.cool=period-clock%period}
      else if(e.type===4){e.attackCycle=1;e.ironCycle=clock%(e.phase===2?.86:1.05)}
      else if(e.type===5){e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-clock%1.35}
    }
  }
  function socketBegin(item){
    if(item.family==='mini')startMiniBossLab(item.index);else if(item.family==='main')startBossLab(item.index);else startEpicBossLab(item.index);
    const e=boss||miniBoss;Object.assign(e,{x:W*.68,y:H*.5,intro:0,hitFlash:0,phaseFlash:0,weakTimer:.3,weakTelegraph:0,cool:99,hidden:false});
    player.inv=0;player.shield=0;player.pod.owned=false;player.bits=0;player.hp=player.maxHp=3;player.x=W*.18;player.y=H*.5;
    pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden');
    return{...item,e,wave};
  }
  function socketActivate(record){
    boss=record.e.kind==='boss'?record.e:null;miniBoss=record.e.kind==='mini'?record.e:null;wave=record.wave;
  }
  function socketReady(record){
    const stage=stageArt[(Math.max(1,record.wave)-1)%stageArt.length];if(!stage?.ready)return false;
    const e=record.e;if(e.kind==='mini')return miniBossSpriteFor(e.type)?.ready;
    if(e.epic)return lateBossMaterialFrame(e).source?.ready;
    if(e.type===0)return bloodstarPhaseSprites[e.phase-1]?.ready;
    if(e.type===1||e.type===2)return bossSprites[e.type]?.ready;
    if(e.type===3)return riftPhaseSprites[e.phase-1]?.ready;
    if(e.type===4)return ironBloomPhaseSprites[e.phase-1]?.ready;
    return lateBossMaterialFrame(e).source?.ready;
  }
  function socketAssetSignature(record){
    const e=record.e,asset=e.kind==='boss'&&(e.epic||e.type>=5)?lateBossMaterialFrame(e).source:null;
    return Number(!!socketReady(record))+'|'+(asset?.sourcePath||asset?.src||'native')
  }
  function socketPaintScene(record,target,open,detail=false){
    const e=record.e,destination=ctx,backup={weakOpen:e.weakOpen,weakTelegraph:e.weakTelegraph,weakTimer:e.weakTimer,coreAperture:e.coreAperture},nodes=activeWeakNodes(e),hp=nodes.map(n=>n.hp),originalMiniFrame=miniBossFrame;
    socketActivate(record);socketSetClock(e,socketReviewClock);ctx=target;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
    try{
      e.weakOpen=open;e.weakTelegraph=0;e.weakTimer=.3;e.coreAperture=open?1:0;nodes.forEach(n=>{n.hp=n.max*(socketPanel.querySelector('#socket-damaged').checked?.32:1)});
      if(!socketReviewAnimate)miniBossFrame=()=>socketReviewPose%16;
      if(detail){ctx.translate(W/2,H/2);ctx.scale(2,2);ctx.translate(-e.x,-e.y)}
      drawDepthBackground();drawEpicAtmosphere();drawStageMidground();
      ctx.save();applyEnemyPose(e,false);drawNativeFracturedBody(e,()=>paintNativeFractureBody(e),e.kind==='mini'?miniBossFrame(e):undefined);ctx.restore();
      if(e.kind==='boss')drawWeakPoints(e);drawPlayerAndPod();
    }finally{ctx.restore();ctx=destination;miniBossFrame=originalMiniFrame;Object.assign(e,backup);nodes.forEach((n,index)=>n.hp=hp[index])}
  }
  function socketRenderPair(){
    if(!socketCurrent)return;socketActivate(socketCurrent);
    const detail=socketPanel.querySelector('#socket-detail').checked;
    socketPaintScene(socketCurrent,socketSealed.getContext('2d'),false,detail);socketPaintScene(socketCurrent,socketOpen.getContext('2d'),true,detail);
    socketArea.querySelector('#socket-heading').textContent=socketCurrent.name+' / PHASE '+(socketCurrent.e.phase||1)+(detail?' / 2× DETAIL':' / FIGHT SCALE');
    for(const link of socketPanel.querySelectorAll('a')){const path=link.textContent==='BEFORE'?'artifacts/socket-preview-before.html':'artifacts/socket-preview.html';link.href=path+'?enemy='+encodeURIComponent(socketCurrent.key)+'&phase='+(socketCurrent.e.phase||1)}
    socketPanel.querySelector('#socket-status').textContent='POSE '+inspectionFrame(socketCurrent.e)+' · t '+socketReviewClock.toFixed(2)+' · '+(socketReady(socketCurrent)?'ART READY':'LOADING ART');
  }
  const contactScratch=document.createElement('canvas');contactScratch.width=W;contactScratch.height=H;
  function socketRenderContact(){
    if(!socketAll)return;const c=socketSheet.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#07111f';c.fillRect(0,0,socketSheet.width,socketSheet.height);
    c.fillStyle='#d5eef8';c.font='700 24px sans-serif';c.fillText('22 ENCOUNTERS / SEALED & EXPOSED / SAME NATIVE POSE',20,36);
    socketAll.forEach((record,index)=>{
      const cardW=960,cardH=310,col=index%2,row=Math.floor(index/2),x=col*cardW,y=60+row*cardH;
      c.fillStyle='#122334';c.fillRect(x+6,y+3,cardW-12,cardH-8);c.fillStyle='#c7e7ef';c.font='700 17px sans-serif';c.fillText(record.family.toUpperCase()+' / '+record.name+' / P'+(record.e.phase||1),x+18,y+25);
      for(let open=0;open<2;open++){
        socketPaintScene(record,contactScratch.getContext('2d'),!!open,true);
        c.drawImage(contactScratch,0,0,W,H,x+open*480+8,y+40,464,261);
        c.fillStyle=open?'#f0d483':'#9ec5cd';c.font='12px monospace';c.fillText(open?'EXPOSED':'SEALED',x+open*480+16,y+55)
      }
    });
    socketActivate(socketCurrent);socketArea.querySelector('#socket-heading').textContent='ALL 22 / PHASE ONE CONTACT SHEET / 2× DETAIL';
    socketPanel.querySelector('#socket-status').textContent=socketAll.filter(socketReady).length+' / 22 ART READY';
  }
  function socketLoad(){
    socketReviewContact=false;socketAll=null;socketArea.querySelector('.socket-pair').hidden=false;socketSheet.hidden=true;
    const item=socketRoster.find(item=>item.key===socketSelect.value);socketCurrent=socketBegin(item);socketReviewClock=.17;socketReviewPose=0;socketRenderDue=true;
    const phase=Number(socketParams.get('phase'));if(Number.isInteger(phase)&&phase>=1&&phase<=(socketCurrent.e.epic?4:socketCurrent.e.kind==='mini'?1:2))socketCurrent.e.phase=phase;
  }
  socketPanel.querySelector('#socket-load').onclick=socketLoad;
  socketPanel.querySelector('#socket-phase').onclick=()=>{if(!socketCurrent||socketCurrent.e.kind==='mini')return;socketCurrent.e.phase=socketCurrent.e.phase%(socketCurrent.e.epic?4:2)+1;socketRenderDue=true};
  socketPanel.querySelector('#socket-step').onclick=()=>{socketReviewPose=(socketReviewPose+1)%32;socketReviewClock=.17+socketReviewPose*.073;socketRenderDue=true};
  socketPanel.querySelector('#socket-motion').onclick=()=>{socketReviewAnimate=!socketReviewAnimate;socketPanel.querySelector('#socket-motion').textContent=socketReviewAnimate?'FREEZE MOTION':'PLAY MOTION';socketRenderDue=true};
  for(const id of['#socket-detail','#socket-damaged'])socketPanel.querySelector(id).onchange=()=>socketRenderDue=true;
  socketPanel.querySelector('#socket-contact').onclick=()=>{
    socketReviewAnimate=false;socketPanel.querySelector('#socket-motion').textContent='PLAY MOTION';socketReviewContact=true;
    const current=socketCurrent;socketAll=socketRoster.map(socketBegin);socketCurrent=current;socketActivate(current);
    socketArea.querySelector('.socket-pair').hidden=true;socketSheet.hidden=false;socketRenderDue=true
  };
  socketLoad();
  function socketLoop(now){
    const dt=Math.min(.05,Math.max(0,(now-socketLastFrame)/1000));socketLastFrame=now;
    if(socketReviewAnimate&&!socketReviewContact){socketReviewClock+=dt;socketRenderDue=true}
    const signature=(socketReviewContact?socketAll:[socketCurrent]).map(socketAssetSignature).join('/');
    if(signature!==socketReadySignature){socketReadySignature=signature;socketRenderDue=true}
    if(socketRenderDue){socketRenderDue=false;if(socketReviewContact)socketRenderContact();else socketRenderPair()}
    requestAnimationFrame(socketLoop)
  }requestAnimationFrame(socketLoop);
'''

memory = """<script>const memory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});</script>"""
html_template = (ROOT / "index.html").read_text(encoding="utf-8")
html_template = html_template.replace("<head>", '<head><base href="../">', 1)
html_template = html_template.replace("<body>", "<body>" + memory, 1)

for name, game_source in [("socket-preview", source), ("socket-preview-before", args.baseline.read_text(encoding="utf-8"))]:
    end = game_source.rfind("})();")
    if end < 0:
        raise ValueError("Expected game IIFE ending")
    game_source = game_source[:end] + CONTROLS + game_source[end:]
    (ROOT / f"artifacts/{name}-game.js").write_text(game_source, encoding="utf-8")
    html = re.sub(r'<script src="game.js\?v=\d+"></script>', f'<script src="artifacts/{name}-game.js?v=133"></script>', html_template)
    (ROOT / f"artifacts/{name}.html").write_text(html, encoding="utf-8")

print("Built private current/before socket previews with all 22 encounters.")
