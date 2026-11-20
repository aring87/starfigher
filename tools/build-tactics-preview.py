"""Private v148 weapon-loss comparisons using actual encounter attacks/drawing.

The fixture owns frozen scenarios and isolated storage. It never imports a real
pilot, runs the live combat loop, or changes production functions on disk.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / 'game.js').read_text(encoding='utf-8')
CONTROLS = r'''
  update=()=>{};loop=()=>{};
  const tacticsModel=window.StarfighterEncounterTactics;
  if(!tacticsModel)throw new Error('Load encounter tactics before the private comparison.');
  const tacticsPanel=document.createElement('aside');tacticsPanel.id='tactics-controls';
  tacticsPanel.innerHTML='<b>PRIVATE WEAPON TACTICS REVIEW</b><label>ENCOUNTER <select id="tactics-encounter" aria-label="Review encounter"></select></label><label>PHASE <select id="tactics-phase" aria-label="Review phase"></select></label><label>BREAK <select id="tactics-part" aria-label="Weapon part to break"></select></label><label>CYCLE <input id="tactics-cycle" aria-label="Attack cycle" type="number" min="0" max="19" value="0"></label><button id="tactics-fire">BUILD COMPARISON</button><button id="tactics-next">NEXT ATTACK</button><label><input id="tactics-break-during" type="checkbox">BREAK AFTER QUEUE</label><label><input id="tactics-beam-frame" type="checkbox">ACTIVE BEAM VIEW</label><button id="tactics-maw">TWIN MAW</button><button id="tactics-hydra">HYDRA FAN</button><button id="tactics-beam">HYDRA BEAM</button><button id="tactics-grave">GRAVEBELL RAIN</button><output id="tactics-status" role="status">PREPARING PRIVATE SCENES</output>';
  const tacticsView=document.createElement('main');tacticsView.id='tactics-comparison';tacticsView.dataset.ready='false';tacticsView.setAttribute('aria-label','Intact and broken weapon comparison');
  tacticsView.innerHTML='<div id="tactics-title"></div><div id="tactics-cards"><article><h2>INTACT WEAPONS</h2><canvas id="tactics-intact" width="960" height="540" aria-label="Intact encounter attack snapshot"></canvas><p id="tactics-intact-status">WAITING</p></article><article><h2 id="tactics-broken-title">WEAPON DESTROYED</h2><canvas id="tactics-broken" width="960" height="540" aria-label="Broken weapon encounter attack snapshot"></canvas><p id="tactics-broken-status">WAITING</p></article></div><p id="tactics-note">Both snapshots use the same seeded attack and 0.85 seconds of actual projectile motion. Surviving paths and timing are unchanged. Private simulator storage only.</p>';
  const tacticsToggle=document.createElement('button');tacticsToggle.id='tactics-toggle';tacticsToggle.textContent='HIDE QA';
  document.body.append(tacticsPanel,tacticsView,tacticsToggle);
  const tacticsStyle=document.createElement('style');tacticsStyle.textContent=`#game-shell{visibility:hidden!important}#tactics-controls{position:fixed;inset:4px 4px auto;z-index:9800;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;padding:7px;background:#08121ff5;border:1px solid #41677a;color:#bbd5e1;font:10px monospace}#tactics-controls label{display:flex;align-items:center;gap:4px}#tactics-controls select,#tactics-controls button,#tactics-controls input[type=number]{background:#102539;border:1px solid #426a81;color:#d2e9f5;padding:4px;font:10px monospace;letter-spacing:0}#tactics-cycle{width:42px}#tactics-status{color:#9fe0be;min-width:220px;text-align:center}#tactics-comparison{position:fixed;inset:105px 0 0;z-index:9700;background:#050b14;color:#d1e6ef;overflow:auto;padding:12px}#tactics-title{color:#b1dce7;font:700 14px 'Oxanium',sans-serif;letter-spacing:.06em;text-align:center;padding:4px 0 12px}#tactics-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#tactics-cards article{min-width:0;border:1px solid #345367;background:#0a1825}#tactics-cards h2{color:#bddde9;margin:0;padding:8px 10px;font:700 11px monospace}#tactics-cards canvas{display:block;width:100%;height:auto}#tactics-cards p{margin:0;padding:9px;color:#9ec6d6;font:11px monospace;line-height:1.45}#tactics-note{max-width:1040px;margin:12px auto;color:#859eae;font:11px/1.5 monospace;text-align:center}#tactics-toggle{position:fixed;bottom:3px;right:3px;z-index:9900;background:#07111fd9;border:1px solid #2e4e64;color:#8eacbc;padding:4px;font:9px monospace}body.tactics-proof #tactics-controls{visibility:hidden}body.tactics-proof #tactics-comparison{top:18px}@media(max-width:700px){#tactics-comparison{top:180px}#tactics-cards{grid-template-columns:1fr}}`;document.head.appendChild(tacticsStyle);
  const tacticsSelect=tacticsPanel.querySelector('#tactics-encounter'),tacticsPhase=tacticsPanel.querySelector('#tactics-phase'),tacticsPart=tacticsPanel.querySelector('#tactics-part'),tacticsCycle=tacticsPanel.querySelector('#tactics-cycle');
  for(const row of tacticsModel.catalogue){const option=document.createElement('option');option.value=row.id;option.textContent=(row.kind==='mini'?'ELITE / ':row.epicId!==undefined?'SECRET / ':'APEX / ')+row.name;tacticsSelect.appendChild(option)}
  let tacticsJob=null,tacticsLastPaint=-1000;
  const tacticsRow=()=>tacticsModel.catalogue.find(row=>row.id===tacticsSelect.value)||tacticsModel.catalogue[11];
  function tacticsDefinition(){const row=tacticsRow(),phase=Number(tacticsPhase.value)||1;return tacticsModel.describe({...row,phase})}
  function tacticsPhases(selected=1){const row=tacticsRow(),maximum=row.kind==='mini'?1:row.epicId!==undefined?4:2;tacticsPhase.replaceChildren();for(let p=1;p<=maximum;p++){const option=document.createElement('option');option.value=String(p);option.textContent=String(p);tacticsPhase.appendChild(option)}tacticsPhase.value=String(clamp(selected,1,maximum))}
  function tacticsParts(selected){const def=tacticsDefinition();tacticsPart.replaceChildren();for(const part of def.parts){const option=document.createElement('option');option.value=part.id;option.textContent=part.label.toUpperCase();tacticsPart.appendChild(option)}const all=document.createElement('option');all.value='all';all.textContent='ALL OUTER WEAPONS';tacticsPart.appendChild(all);if(selected&&[...tacticsPart.options].some(option=>option.value===selected))tacticsPart.value=selected}
  function tacticsSafety(){state='paused';bossLab=true;bossLabLevel=false;runActive=false;pendingUpgrade=null;victoryDelay=null;stageIntro=0;stageCue=null;stageApexIntro=-1;stageHazards=[];stageFlash=0;shake=0;mouse.firing=false;mouse.move=false;clearInput();pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden')}
  function tacticsSeed(seed,work){const previous=Math.random;let state=seed>>>0;Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let v=state;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return((v^(v>>>14))>>>0)/4294967296};try{return work()}finally{Math.random=previous}}
  function tacticsScene(){
    const row=tacticsRow(),phase=Number(tacticsPhase.value)||1;
    tacticsSeed(148101,()=>{if(row.kind==='mini')startMiniBossLab(row.type);else if(row.epicId!==undefined)startEpicBossLab(row.epicId);else startBossLab(row.type)});
    wave=row.epicId!==undefined?(row.epicId===0?10:9):row.type+1;
    const enemy=boss||miniBoss;Object.assign(enemy,{phase,x:W*.77,y:H*.5,anchorY:H*.5,targetY:H*.5,clock:1.2,animOffset:0,intro:0,phaseFlash:0,phaseTransition:0,hitFlash:0,hidden:false,ritual:null,weakOpen:true,weakTimer:Math.max(.3,weakExposureDuration(enemy)-.5),weakTelegraph:0,coreAperture:1,recoil:0,visualAngle:0,movePhase:0,cool:0,laser:null,attackCycle:clamp(Math.floor(Number(tacticsCycle.value)||0),0,19),attackAngle:.08});
    if(enemy.kind==='boss')enemy.hp=enemy.max*(1-(phase-1)/(enemy.epic?4:2));
    for(const node of activeWeakNodes(enemy)){node.destroyed=false;node.hp=node.max;node.hitTime=-100;node.detached=false}
    player.x=150;player.y=H*.5;player.hp=player.maxHp;player.inv=0;player.shield=0;player.shieldWake=player.shieldHit=player.hullHit=0;player.deltaFlash=0;player.bits=0;player.charge=0;player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide='front';player.pod.phase=.4;player.pod.x=200;player.pod.y=player.y;player.laserColor='red';player.laserLevel=1;
    t=1.2;scroll=320;enemies=[];epicHeavies=[];bossFragments=[];debris=[];particles=[];pickups=[];shots=[];enemyShots=[];tacticsSafety();return enemy;
  }
  function tacticsArtStatus(enemy){
    const background=stageArt[wave-1];if(!background?.ready)return'LOADING MISSION ART';
    if(!spriteAtlas.complete||!spriteAtlas.naturalWidth)return'LOADING FIGHTER ATLAS';
    const art=enemy.kind==='mini'?miniBossSpriteFor(enemy.type):enemy.epic||enemy.type>=5?lateBossMaterialFrame(enemy).source:enemy.type===0?bloodstarPhaseSprites[enemy.phase-1]:enemy.type<=2?bossSprites[enemy.type]:enemy.type===3?(enemy.phase===1&&riftFrame(enemy)%2?riftPhase1InbetweenSprite:riftPhaseSprites[enemy.phase-1]):ironBloomFrame(enemy)%2?ironBloomInbetweenSprites[enemy.phase-1]:ironBloomPhaseSprites[enemy.phase-1];
    if(!art?.ready)return'LOADING NATIVE ENCOUNTER ART';
    if(!enemy.epic&&enemy.kind==='boss'&&enemy.type===0)return null;
    const destruction=window.StarfighterDestruction;if(destruction?.has(art)){destruction.preload(art);if(!destruction.ready(art))return'LOADING REGISTERED CORE / LIMB ART'}
    return null;
  }
  function tacticsBreak(enemy){
    const def=tacticsModel.describe({...enemy,nodeCount:activeWeakNodes(enemy).length}),chosen=def.parts.filter(part=>tacticsPart.value==='all'||part.id===tacticsPart.value),nodes=activeWeakNodes(enemy);
    tacticsSeed(148202,()=>{for(const index of new Set(chosen.flatMap(part=>part.indices))){const node=nodes[index];if(node&&!node.destroyed)damageWeakNode(enemy,node,node.hp)}});
    flushNativeSpriteParts(enemy);enemy.hitFlash=0;return chosen.map(part=>part.label).join(' + ');
  }
  function tacticsEmit(enemy){
    tacticsSeed(148303+Number(tacticsCycle.value||0),()=>{if(enemy.kind==='mini')miniBossAttack(enemy);else if(enemy.epic)epicBossAttack(enemy);else{bossAttack(enemy);if(enemy.queuedAttack)bossAttack(enemy)}});
  }
  function tacticsSnapshot(side){
    const enemy=boss||miniBoss,broken=side==='broken',after=tacticsPanel.querySelector('#tactics-break-during').checked;
    if(broken&&!after)tacticsBreak(enemy);
    tacticsEmit(enemy);if(broken&&after)tacticsBreak(enemy);
    // Project only the existing hostile objects; no collision loop or new attack.
    for(let tick=0;tick<102;tick++)for(const shot of enemyShots)updateHostileShot(shot,1/120);
    if(enemy.laser){enemy.laser.t=Math.max(0,enemy.laser.t-.85);if(tacticsPanel.querySelector('#tactics-beam-frame').checked)enemy.laser.t=.7;}
    // Keep the missing native silhouette visible instead of covering it with debris.
    particles=[];debris=[];bossFragments=[];enemy.hitFlash=0;shake=0;tacticsSafety();draw();
    const target=tacticsView.querySelector('#tactics-'+side),paint=target.getContext('2d');paint.clearRect(0,0,target.width,target.height);paint.drawImage(canvas,0,0,target.width,target.height);
    const count=enemyShots.filter(shot=>!shot.dead&&!(shot.warn>0)).length,queued=enemyShots.filter(shot=>!shot.dead&&shot.warn>0).length,beam=!!enemy.laser,statement=count+' ACTIVE SHOTS'+(queued?' / '+queued+' CHARGING LANCE':'')+' / BEAM '+(beam?'ONLINE':'OFFLINE');
    tacticsView.querySelector('#tactics-'+side+'-status').textContent=statement;
    target.dataset.count=String(count);target.dataset.queued=String(queued);target.dataset.beam=String(beam);target.dataset.ready='true';
    return{count,queued,beam};
  }
  function tacticsBuild(){
    const row=tacticsRow(),def=tacticsDefinition(),selected=def.parts.filter(part=>tacticsPart.value==='all'||part.id===tacticsPart.value).map(part=>part.label).join(' + ');
    tacticsView.dataset.ready='false';tacticsView.querySelector('#tactics-intact').dataset.ready='false';tacticsView.querySelector('#tactics-broken').dataset.ready='false';
    tacticsView.querySelector('#tactics-title').textContent=row.name+' / PHASE '+tacticsPhase.value+' / ATTACK '+tacticsCycle.value;
    tacticsView.querySelector('#tactics-broken-title').textContent=selected.toUpperCase()+' DESTROYED';
    tacticsView.querySelector('#tactics-note').textContent=def.tactic+' Both snapshots use the same seeded volley and 0.85 seconds of projectile motion.'+(tacticsPanel.querySelector('#tactics-break-during').checked?' The right weapon is broken after its attack queues.':' The right weapon is broken before firing.')+(tacticsPanel.querySelector('#tactics-beam-frame').checked?' Beam view selects the actual active rendering frame.':'')+' Private simulator storage only.';
    tacticsJob={side:'intact',enemy:tacticsScene(),counts:{}};tacticsPanel.querySelector('#tactics-status').textContent='PREPARING INTACT SCENE';
  }
  function tacticsPreset(id,phase,part,beam=false){tacticsSelect.value=id;tacticsPhases(phase);tacticsParts(part);tacticsCycle.value='0';tacticsPanel.querySelector('#tactics-break-during').checked=beam;tacticsPanel.querySelector('#tactics-beam-frame').checked=beam;tacticsBuild()}
  tacticsSelect.onchange=()=>{tacticsPhases();tacticsParts();tacticsBuild()};tacticsPhase.onchange=()=>{tacticsParts();tacticsBuild()};
  for(const node of[tacticsPart,tacticsCycle,tacticsPanel.querySelector('#tactics-break-during'),tacticsPanel.querySelector('#tactics-beam-frame')])node.onchange=tacticsBuild;
  tacticsPanel.querySelector('#tactics-fire').onclick=tacticsBuild;tacticsPanel.querySelector('#tactics-next').onclick=()=>{tacticsCycle.value=String((Number(tacticsCycle.value)+1)%20);tacticsBuild()};
  tacticsPanel.querySelector('#tactics-maw').onclick=()=>tacticsPreset('boss-1',2,'upper-jaw');tacticsPanel.querySelector('#tactics-hydra').onclick=()=>tacticsPreset('boss-8',1,'hydra-head-0');tacticsPanel.querySelector('#tactics-beam').onclick=()=>tacticsPreset('boss-8',2,'hydra-head-1',true);tacticsPanel.querySelector('#tactics-grave').onclick=()=>tacticsPreset('boss-7',2,'grave-left-weight');
  tacticsToggle.onclick=()=>{const hidden=document.body.classList.toggle('tactics-proof');tacticsToggle.textContent=hidden?'SHOW QA':'HIDE QA'};
  function tacticsFrame(now){
    if(tacticsJob&&now-tacticsLastPaint>100){tacticsLastPaint=now;draw();const waiting=tacticsArtStatus(tacticsJob.enemy);if(waiting)tacticsPanel.querySelector('#tactics-status').textContent=waiting;else{const job=tacticsJob;job.counts[job.side]=tacticsSnapshot(job.side);if(job.side==='intact'){job.side='broken';job.enemy=tacticsScene();tacticsPanel.querySelector('#tactics-status').textContent='PREPARING BROKEN SCENE'}else{tacticsView.dataset.ready='true';tacticsView.dataset.intact=String(job.counts.intact.count);tacticsView.dataset.broken=String(job.counts.broken.count);tacticsPanel.querySelector('#tactics-status').textContent='READY / '+job.counts.intact.count+' → '+job.counts.broken.count+' ACTIVE SHOTS / PRIVATE STORAGE';tacticsJob=null}}}
    requestAnimationFrame(tacticsFrame)
  }
  tacticsPreset('boss-1',2,'upper-jaw');requestAnimationFrame(tacticsFrame);
'''
end = source.rfind('})();')
assert end >= 0, 'Game closure not found'
(ROOT / 'artifacts/tactics-preview-game.js').write_text(source[:end] + CONTROLS + source[end:], encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
if 'encounter-tactics.js' not in html:
    html = re.sub(r'(<script src="game.js\?v=\d+"></script>)', '<script src="encounter-tactics.js?v=148"></script>\n  '+r'\1', html)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', '<script src="artifacts/tactics-preview-game.js?v=148"></script>', html)
storage = '''<script>const tacticsMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:key=>tacticsMemory.get(String(key))??null,setItem:(key,value)=>tacticsMemory.set(String(key),String(value)),removeItem:key=>tacticsMemory.delete(String(key))}});</script>'''
(ROOT / 'artifacts/tactics-preview.html').write_text(html.replace('<body>', '<body>'+storage, 1), encoding='utf-8')
print('Built artifacts/tactics-preview.html with private storage and actual intact/broken attack snapshots.')
