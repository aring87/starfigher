"""Private deterministic visual-hierarchy review using the production painter.

Only the generated preview owns scenario controls and a stopped game loop.
Its localStorage is replaced before any game script loads. Regenerate after
production changes. No live pilot, inventory, checkpoint, or input preferences
are imported or changed.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / "game.js").read_text(encoding="utf-8")
CONTROLS = r'''
  // Freeze simulation, not painting: all screenshots use the shipping draw().
  update=()=>{};loop=()=>{};
  const readPanel=document.createElement('aside');readPanel.id='readability-controls';
  readPanel.innerHTML='<b>PRIVATE READABILITY REVIEW</b><label>MISSION <select id="readability-stage" aria-label="Review mission"></select></label><label>ENCOUNTER <select id="readability-target" aria-label="Review encounter"><option value="main">APEX / EXPOSED CORES</option><option value="mini">MINIBOSS / EXPOSED CORES</option><option value="field">FIELD / MIXED FIRE</option></select></label><label><input id="readability-normal" type="checkbox" checked>NORMAL</label><label><input id="readability-clear" type="checkbox">CLEAR COMBAT</label><label><input id="readability-reduced" type="checkbox">REDUCED MOTION</label><label>SHIP <select id="readability-lane" aria-label="Fighter lane"><option value="mid">MID FIELD</option><option value="top">TOP / y45</option><option value="bottom">BOTTOM / H−45</option></select></label><button id="readability-invuln" aria-pressed="false">INVULNERABLE: OFF</button><label><input id="readability-smoke" type="checkbox" checked>SMOKE / SPARKS</label><label><input id="readability-open" type="checkbox" checked>CORES OPEN</label><button id="readability-gallery-build">BUILD TEN-MISSION GALLERY</button><button id="readability-gallery-close" hidden>RETURN TO FLIGHT</button><output id="readability-status" role="status"></output>';
  document.body.appendChild(readPanel);
  const readToggle=document.createElement('button');readToggle.id='readability-toggle';readToggle.textContent='HIDE QA';document.body.appendChild(readToggle);
  const readGallery=document.createElement('section');readGallery.id='readability-gallery';readGallery.hidden=true;readGallery.setAttribute('aria-label','Ten mission readability gallery');document.body.appendChild(readGallery);
  const readStyle=document.createElement('style');readStyle.textContent=`#readability-controls{position:fixed;top:4px;left:4px;right:4px;z-index:9500;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;padding:7px;background:#08121ff2;border:1px solid #42677c;color:#b9d3e1;font:10px monospace}#readability-controls label{display:flex;align-items:center;gap:4px}#readability-controls button,#readability-controls select{background:#102539;border:1px solid #426a81;color:#d2e9f5;padding:4px;font:10px monospace;letter-spacing:0}#readability-status{color:#a7e0c8;min-width:180px;text-align:center}#readability-toggle{position:fixed;bottom:3px;right:3px;z-index:9600;background:#07111fd9;border:1px solid #2e4e64;color:#8eacbc;padding:4px;font:9px monospace}#readability-gallery{position:fixed;inset:95px 0 0;z-index:9400;overflow:auto;background:#050b14;padding:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-content:start}#readability-gallery[hidden]{display:none}#readability-gallery article{border:1px solid #304e63;min-width:0;background:#0b1826}#readability-gallery h2{font:700 11px monospace;color:#b7dbe9;padding:8px;margin:0}#readability-gallery canvas{display:block;width:100%;height:auto}body.readability-proof #readability-controls{visibility:hidden}#game-shell #hud,#game-shell .utility-bar,#game-shell #controller-hint,#game-shell #loot-toast{visibility:hidden!important}`;document.head.appendChild(readStyle);
  const readStage=readPanel.querySelector('#readability-stage'),readTarget=readPanel.querySelector('#readability-target'),readLane=readPanel.querySelector('#readability-lane');
  for(const stage of stageDefs){const option=document.createElement('option');option.value=String(stage.id);option.textContent=String(stage.id).padStart(2,'0')+' / '+stage.name;readStage.appendChild(option)}
  const readParams=new URLSearchParams(location.search);readStage.value=String(clamp(Number(readParams.get('stage'))||1,1,10));
  if(['main','mini','field'].includes(readParams.get('encounter')))readTarget.value=readParams.get('encounter');
  if(['mid','top','bottom'].includes(readParams.get('lane')))readLane.value=readParams.get('lane');
  let readInvulnerable=false,readGalleryJob=null,readLastPaint=-1000,readDirty=true;
  function readSetSafety(){state='paused';bossLab=true;bossLabLevel=false;runActive=false;pendingUpgrade=null;victoryDelay=null;stageIntro=0;stageCue=null;stageApexIntro=-1;stageHazards=[];stageFlash=0;shake=0;mouse.firing=false;mouse.move=false;clearInput();pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden')}
  function readSetLane(){player.x=175;player.y=readLane.value==='top'?45:readLane.value==='bottom'?H-45:H*.53;player.pod.x=player.x+50;player.pod.y=player.y;player.inv=readInvulnerable?2:0;player.charge=0;readDirty=true}
  function readSmoke(){
    particles=[];if(!readPanel.querySelector('#readability-smoke').checked)return;
    const seeds=[{x:player.x+11,y:player.y+1,heavy:true},{x:W*.45,y:H*.33,heavy:false},{x:W*.64,y:H*.71,heavy:true}],enemy=boss||miniBoss;
    if(enemy)for(const node of activeWeakNodes(enemy).filter(n=>!n.destroyed)){const p=worldWeakNode(enemy,node);seeds.push({x:p.x,y:p.y,heavy:true});}
    seeds.forEach((point,index)=>{for(let puff=0;puff<3;puff++)particles.push({x:point.x+puff*5-3,y:point.y-puff*3,smoke:true,damageSmoke:true,heavy:point.heavy,turn:index*.23,s:12+puff*4,life:.8-puff*.11,max:1,vx:0,vy:0,c:'#56616e'})});
    for(let index=0;index<30;index++)particles.push({x:W*.34+(index%10)*27,y:H*.24+Math.floor(index/10)*94,s:2+(index%3),life:.45+(index%5)*.06,max:.8,vx:0,vy:0,c:index%2?'#ffe8b1':'#7f9bad'});
  }
  function readScene(){
    const mission=Number(readStage.value),family=readTarget.value;startLevelLab(mission-1);wave=mission;
    if(family==='main')makeBoss();else if(family==='mini')makeMiniBoss();
    const enemy=boss||miniBoss;if(enemy){const open=readPanel.querySelector('#readability-open').checked;Object.assign(enemy,{x:W*.78,y:H*.52,anchorY:H*.52,targetY:H*.52,clock:.83,animOffset:0,intro:0,phaseFlash:0,phaseTransition:0,hitFlash:0,hidden:false,weakOpen:open,weakTimer:open?Math.max(.3,weakExposureDuration(enemy)-.5):999,weakTelegraph:0,coreAperture:open?1:0,recoil:0,visualAngle:0,movePhase:0,cool:99,laser:null});for(const node of activeWeakNodes(enemy)){node.destroyed=false;node.hp=node.max*.55;node.hitTime=-100}}
    t=.2617993878;scroll=320;enemies=[];epicHeavies=[];bossFragments=[];debris=[];pickups=[];
    for(const[type,index]of[['wing',0],['drone',1],['turret',2]])enemies.push({type,x:W*(.40+index*.115),y:H*(index===0?.20:index===1?.73:.17),r:type==='turret'?23:20,hp:7,maxHp:10,speed:0,phase:.3+index,animOffset:index*.2,stageStyle:currentStage().enemyStyle,threat:sectorThreat(mission),c:'#ff4f88',cool:99,fireAnim:0,fireReleased:false,telegraphFire:true});
    player.hp=player.maxHp;player.shield=0;player.shieldWake=player.shieldHit=player.hullHit=0;player.deltaFlash=0;player.bits=1;player.laserColor='red';player.laserLevel=1;player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide='front';player.pod.phase=.7;readSetLane();
    enemyShots=[];for(let index=0;index<9;index++){const x=W*(.28+(index%3)*.13),y=H*(.14+Math.floor(index/3)*.29);enemyShots.push({x,y,px:x,py:y,vx:-165,vy:index%2?35:-35,r:5+(index%2),life:3,damage:1,warn:0});}
    for(let index=0;index<5;index++){const x=W*(.36+index*.105),y=H*(index%2?.64:.38);enemyShots.push({x,y,px:x,py:y,vx:-220,vy:index%2?55:-35,r:4.5,life:3,damage:1,warn:0,piercing:true,pressureLance:true});}
    // A live round and dart near the fighter's selected lane expose edge coverage.
    enemyShots.push({x:player.x+108,y:player.y+2,px:player.x+108,py:player.y+2,vx:-165,vy:0,r:5,life:3,damage:1,warn:0},{x:player.x+190,y:player.y+13,px:player.x+190,py:player.y+13,vx:-220,vy:0,r:4.5,life:3,damage:1,warn:0,piercing:true});
    shots=[{x:player.x+100,y:player.y-14,vx:620,vy:0,r:3,d:1,charge:0},{x:W*.43,y:H*.50,vx:490,vy:0,r:11,d:3,charge:.8},{x:W*.55,y:H*.56,vx:360,vy:-55,r:4.2,d:.75,missile:true},{x:W*.35,y:H*.81,vx:620,vy:0,r:4,d:1,forceColor:'#ff416f'}];
    readSetSafety();readSmoke();hud();$('#hud').classList.add('hidden');readDirty=true;
  }
  function readAssetStatus(){
    const stage=stageArt[Number(readStage.value)-1];if(!stage?.ready)return'LOADING MISSION ART';
    if(!spriteAtlas.complete||!spriteAtlas.naturalWidth)return'LOADING FIGHTER / ENEMY ATLAS';
    const e=boss||miniBoss;if(!e)return null;
    const art=e.kind==='mini'?miniBossSpriteFor(e.type):e.type>=5?lateBossMaterialFrame(e).source:e.type===0?bloodstarPhaseSprites[e.phase-1]:e.type<=2?bossSprites[e.type]:e.type===3?(e.phase===1&&riftFrame(e)%2?riftPhase1InbetweenSprite:riftPhaseSprites[e.phase-1]):ironBloomFrame(e)%2?ironBloomInbetweenSprites[e.phase-1]:ironBloomPhaseSprites[e.phase-1];
    if(!art?.ready)return'LOADING NATIVE ENCOUNTER ART';
    if(e.type===0&&e.kind==='boss')return null;
    const destruction=window.StarfighterDestruction;if(destruction?.has(art)){destruction.preload(art);if(!destruction.ready(art))return'LOADING REGISTERED CORE / LIMB ART'}
    return null;
  }
  function readRender(){readSetSafety();draw();const loading=readAssetStatus();readPanel.querySelector('#readability-status').textContent=loading||(readGalleryJob?'GALLERY '+(readGalleryJob.next-1)+' / 10':!readGallery.hidden&&readGallery.dataset.ready==='true'?'GALLERY READY / 10 MISSIONS / PRIVATE STORAGE':'READY / FROZEN MISSION '+readStage.value+' / PRIVATE STORAGE');return!loading}
  function readStopGallery(){readGalleryJob=null;readGallery.hidden=true;readPanel.querySelector('#readability-gallery-close').hidden=true;readDirty=true}
  for(const node of[readStage,readTarget])node.onchange=()=>{readStopGallery();readScene()};
  readLane.onchange=()=>{readStopGallery();readSetLane();readScene()};
  readPanel.querySelector('#readability-normal').onchange=event=>{event.target.checked=true;readPanel.querySelector('#readability-clear').checked=false;settings.clearCombat=false;readDirty=true};
  readPanel.querySelector('#readability-clear').onchange=event=>{settings.clearCombat=event.target.checked;readPanel.querySelector('#readability-normal').checked=!event.target.checked;readDirty=true};
  readPanel.querySelector('#readability-reduced').onchange=event=>{settings.reducedMotion=event.target.checked;readDirty=true};
  for(const id of['#readability-smoke','#readability-open'])readPanel.querySelector(id).onchange=()=>{readStopGallery();readScene()};
  readPanel.querySelector('#readability-invuln').onclick=event=>{readInvulnerable=!readInvulnerable;event.target.textContent='INVULNERABLE: '+(readInvulnerable?'ON':'OFF');event.target.setAttribute('aria-pressed',String(readInvulnerable));readSetLane();readSmoke()};
  readToggle.onclick=()=>{const hidden=document.body.classList.toggle('readability-proof');readToggle.textContent=hidden?'SHOW QA':'HIDE QA'};
  readPanel.querySelector('#readability-gallery-close').onclick=readStopGallery;
  readPanel.querySelector('#readability-gallery-build').onclick=()=>{readGallery.replaceChildren();readGallery.hidden=false;readGallery.dataset.ready='false';readGallery.dataset.count='0';readPanel.querySelector('#readability-gallery-close').hidden=false;readGalleryJob={next:1,previous:Number(readStage.value),started:performance.now()};readStage.value='1';readScene()};
  readScene();
  function readFrame(now){
    if(readDirty||now-readLastPaint>200){readDirty=false;readLastPaint=now;const ready=readRender();
      if(readGalleryJob&&ready){const job=readGalleryJob,card=document.createElement('article'),heading=document.createElement('h2'),copy=document.createElement('canvas');heading.textContent=String(job.next).padStart(2,'0')+' / '+stageDefs[job.next-1].name+' / '+(settings.clearCombat?'CLEAR COMBAT':'NORMAL')+' / '+readLane.value.toUpperCase();copy.width=960;copy.height=540;copy.getContext('2d').drawImage(canvas,0,0,copy.width,copy.height);card.append(heading,copy);readGallery.appendChild(card);readGallery.dataset.count=String(job.next);job.next++;if(job.next<=10){readStage.value=String(job.next);readScene()}else{const previous=job.previous;readGalleryJob=null;readStage.value=String(previous);readScene();readGallery.dataset.ready='true';readPanel.querySelector('#readability-status').textContent='GALLERY READY / 10 MISSIONS / PRIVATE STORAGE'}}
    }
    requestAnimationFrame(readFrame)
  }
  requestAnimationFrame(readFrame);
'''
end = source.rfind('})();')
assert end >= 0, 'Game closure not found'
(ROOT / 'artifacts/readability-preview-game.js').write_text(source[:end] + CONTROLS + source[end:], encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', '<script src="artifacts/readability-preview-game.js?v=147"></script>', html)
storage = '''<script>const readabilityMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:key=>readabilityMemory.get(String(key))??null,setItem:(key,value)=>readabilityMemory.set(String(key),String(value)),removeItem:key=>readabilityMemory.delete(String(key))}});</script>'''
(ROOT / 'artifacts/readability-preview.html').write_text(html.replace('<body>', '<body>'+storage, 1), encoding='utf-8')
print('Built artifacts/readability-preview.html with frozen production painting and private memory storage.')
