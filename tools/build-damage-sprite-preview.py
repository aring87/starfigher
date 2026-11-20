"""Private damage-art review: actual bodies, break combinations and fragments.

Regenerate after production renderer or sprite changes. This fixture runs the
shipping damage/paint paths, has private in-memory storage, and freezes combat.
It is visual evidence only; source-alpha tests do not rate anatomical cuts.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / "game.js").read_text(encoding="utf-8")
CONTROLS = r'''
  update=()=>{};loop=()=>{};
  let damageClock=.17,damageMotion=false,damageLast=0,damageDirty=true,damageLastPaint=0,damageCurrent=null,damageGroups=[],damageMask=0;
  const damagePanel=document.createElement('aside');damagePanel.id='damage-review-controls';
  damagePanel.innerHTML='<b>PRIVATE DAMAGE SPRITE REVIEW</b><select id="damage-enemy" aria-label="Damage review enemy"></select><button id="damage-load">LOAD</button><button id="damage-phase">NEXT PHASE</button><button id="damage-prev">PREVIOUS POSE</button><button id="damage-next">NEXT POSE</button><button id="damage-motion">PLAY MOTION</button><label><input id="damage-detail" type="checkbox" checked>2× DETAIL</label><label><input id="damage-flash" type="checkbox">HIT FLASH</label><label><input id="damage-smoke" type="checkbox">DAMAGE SMOKE</label><label><input id="damage-studio" type="checkbox">STUDIO</label><button id="damage-combo">NEXT COMBINATION</button><button id="damage-reset">RESTORE ALL</button><span id="damage-status"></span>';
  document.body.appendChild(damagePanel);
  const damageRoster=[],damageSelect=damagePanel.querySelector('#damage-enemy');
  for(const[family,defs]of[['mini',miniBossDefs],['main',bossTypes],['epic',epicBossTypes]])defs.forEach((def,index)=>{const item={family,index,key:family+':'+index,name:def.name};damageRoster.push(item);const option=document.createElement('option');option.value=item.key;option.textContent=family.toUpperCase()+' / '+def.name;damageSelect.appendChild(option)});
  const damageArea=document.createElement('main');damageArea.id='damage-review-area';
  damageArea.innerHTML='<h1 id="damage-heading">DAMAGE ART / ACTUAL NATIVE POSE</h1><p>Each control toggles a real break group. The same game pose appears intact and damaged. Check every combination for smooth anatomy, moving rims, exposed interior layers and fragment/body registration. Detail view is explicitly enlarged; disable it for shipping world scale.</p><fieldset id="damage-groups"><legend>DETACHED ASSEMBLIES</legend></fieldset><div class="damage-pair"><section><h2>INTACT / SAME POSE</h2><canvas id="damage-intact" width="960" height="540"></canvas></section><section><h2>DAMAGED / PRODUCTION PAINT</h2><canvas id="damage-broken" width="960" height="540"></canvas></section></div><h2>ACTUAL DETACHED SPRITES / KILL POSE</h2><canvas id="damage-fragments" width="960" height="220"></canvas><p>Private test pilot. No campaign, inventory or checkpoint is imported or saved. Smoke and hit flash are optional so damaged contours can be judged without effects hiding them.</p>';
  document.body.appendChild(damageArea);
  const damageStyle=document.createElement('style');damageStyle.textContent=`body::before{display:none!important}html,body{display:block!important;overflow:auto!important;background:#050a12!important;color:#d1e8f5!important;font:13px sans-serif!important}#game-shell{visibility:hidden!important;position:fixed!important;pointer-events:none!important}#damage-review-controls{position:sticky;top:0;z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:10px;background:#0c1b2b;border-bottom:1px solid #3a6278}#damage-review-controls button,#damage-review-controls select{background:#152b3e;color:#def4ff;border:1px solid #4a738a;padding:7px;font:700 11px sans-serif}#damage-review-area{max-width:1920px;padding:14px;margin:auto}#damage-review-area h1{font-size:20px;margin:4px 0 8px}#damage-review-area h2{font:700 12px sans-serif;letter-spacing:.1em;color:#9fd6e4;margin:0;padding:10px}#damage-review-area p{color:#91acbd;line-height:1.5}.damage-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.damage-pair section{min-width:0;border:1px solid #315267}.damage-pair canvas,#damage-fragments{display:block;width:100%;height:auto;filter:none}#damage-groups{display:flex;flex-wrap:wrap;gap:14px;padding:12px;margin-bottom:12px;border:1px solid #315267}#damage-groups label{color:#f2ce8b}#damage-status{font:11px monospace;color:#efc981}`;document.head.appendChild(damageStyle);
  const damageParams=new URLSearchParams(location.search);damageSelect.value=damageRoster.some(r=>r.key===damageParams.get('enemy'))?damageParams.get('enemy'):'mini:0';
  const damageIntact=damageArea.querySelector('#damage-intact'),damageBroken=damageArea.querySelector('#damage-broken'),damageFragments=damageArea.querySelector('#damage-fragments');
  function damageSetClock(e,clock){e.clock=clock;if(e.kind==='boss'&&!e.epic){if(e.type===3){const period=e.phase===2?1.25:1.3;e.cool=period-clock%period}else if(e.type===4){e.attackCycle=1;e.ironCycle=clock%(e.phase===2?.86:1.05)}else if(e.type===5){e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-clock%1.35}}}
  function damageGroupList(){
    const e=damageCurrent.e,nodes=activeWeakNodes(e),groups=new Map();
    for(const node of nodes){
      const profile=nativeFractureProfile(e,node),bloodstar=e.kind==='boss'&&!e.epic&&e.type===0&&node.tentacleIndex>=0,key=bloodstar?'tentacle-'+node.tentacleIndex:profile?.groupId;
      if(key==null)continue;
      const group=groups.get(key)||{key,name:bloodstar?'Tentacle '+(node.tentacleIndex+1):profile.name||String(key),nodes:[]};group.nodes.push(node);groups.set(key,group)
    }
    damageGroups=[...groups.values()];const field=damageArea.querySelector('#damage-groups');field.replaceChildren();const legend=document.createElement('legend');legend.textContent='DETACHED ASSEMBLIES';field.appendChild(legend);
    damageGroups.forEach((group,index)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.group=String(index);input.onchange=()=>damageChoose(damageMask^(1<<index));label.append(input,document.createTextNode(' '+group.name));field.appendChild(label)})
  }
  function damageChoose(mask){
    if(mask&&!damageArtStatus().ready){damageDirty=true;return}
    damageMask=mask;const e=damageCurrent.e,nodes=activeWeakNodes(e);bossFragments=[];particles=[];e.nativeSeveredGroups={};e.pendingNativeSpriteParts=new Map();
    for(const node of nodes){node.destroyed=false;node.hp=node.max;node.nativeDetached=false;node.detached=false;node.hitTime=-100}
    e.hp=nodes.reduce((n,node)=>n+node.hp,0)+(e.kind==='boss'?(e.epic?e.max*(1-e.phase*.25):e.phase===1?e.max*.5:0):0);
    for(let index=0;index<damageGroups.length;index++)if(mask&(1<<index))for(const node of damageGroups[index].nodes)damageWeakNode(e,node,node.hp);
    for(const input of damageArea.querySelectorAll('[data-group]'))input.checked=!!(mask&(1<<Number(input.dataset.group)));
    // Leave one clean comparison frame before optional smoke accumulates.
    particles=[];damageDirty=true
  }
  function damageLoad(){
    const item=damageRoster.find(r=>r.key===damageSelect.value);if(item.family==='mini')startMiniBossLab(item.index);else if(item.family==='main')startBossLab(item.index);else startEpicBossLab(item.index);
    const e=boss||miniBoss;Object.assign(e,{x:W*.67,y:H*.5,intro:0,clock:.17,hitFlash:0,phaseFlash:0,weakOpen:true,weakTelegraph:0,weakTimer:999,coreAperture:1,cool:99,hidden:false,visualAngle:0});
    const phase=Number(damageParams.get('phase'));if(item.family!=='mini'&&phase>=1&&phase<=(e.epic?4:2))e.phase=phase;
    player.inv=1e6;player.pod.owned=false;player.bits=0;pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden');damageCurrent={...item,e};damageClock=.17;damageGroupList();damageChoose(0)
  }
  function damagePaint(target,intact){
    const e=damageCurrent.e,nodes=activeWeakNodes(e),saved=nodes.map(n=>({destroyed:n.destroyed,hp:n.hp})),savedGroups=e.nativeSeveredGroups,destination=ctx;
    ctx=target;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
    try{
      if(intact){nodes.forEach(n=>{n.destroyed=false;n.hp=n.max});e.nativeSeveredGroups={}}
      damageSetClock(e,damageClock);e.hitFlash=damagePanel.querySelector('#damage-flash').checked?.11:0;
      const detail=damagePanel.querySelector('#damage-detail').checked;if(detail){ctx.translate(W/2,H/2);ctx.scale(2,2);ctx.translate(-e.x,-e.y)}
      if(damagePanel.querySelector('#damage-studio').checked){ctx.fillStyle='#0a1421';ctx.fillRect(-W,-H,W*3,H*3)}else{drawDepthBackground();drawEpicAtmosphere();drawStageMidground()}
      ctx.save();applyEnemyPose(e,false);drawNativeFracturedBody(e,()=>paintNativeFractureBody(e),e.kind==='mini'?miniBossFrame(e):undefined);ctx.restore();if(e.kind==='boss')drawWeakPoints(e);
      if(!intact&&damagePanel.querySelector('#damage-smoke').checked)for(const p of particles){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,p.life/(p.max||.7)))*(p.damageSmoke?.72:.4);if(p.damageSmoke)drawDamageSmoke(p);else if(p.smoke){ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.s,p.s)}ctx.restore()}
    }finally{ctx.restore();ctx=destination;e.nativeSeveredGroups=savedGroups;nodes.forEach((n,index)=>Object.assign(n,saved[index]))}
  }
  function damagePaintFragments(){
    const c=damageFragments.getContext('2d'),destination=ctx;c.clearRect(0,0,960,220);c.fillStyle='#0a1421';c.fillRect(0,0,960,220);ctx=c;
    try{bossFragments.forEach((f,index)=>{const x=(index+.5)*960/Math.max(1,bossFragments.length);ctx.save();ctx.translate(x,105);ctx.scale(1.5,1.5);ctx.translate(-f.x,-f.y);drawBossFragment(f);ctx.restore();ctx.fillStyle='#b3cad8';ctx.textAlign='center';ctx.font='12px monospace';ctx.fillText('ACTUAL FRAGMENT '+(index+1),x,205)})}finally{ctx=destination}
  }
  function damageArtStatus(){
    if(!damageCurrent)return{ready:false,message:'SELECT AN ENCOUNTER'};
    const e=damageCurrent.e;damageSetClock(e,damageClock);
    if(!damagePanel.querySelector('#damage-studio').checked&&!stageArt[(Math.max(1,wave)-1)%stageArt.length]?.ready)return{ready:false,message:'LOADING SELECTED MISSION BACKGROUND'};
    const source=e.kind==='mini'?miniBossSpriteFor(e.type):e.epic||e.type>=5?lateBossMaterialFrame(e).source:e.type===0?bloodstarPhaseSprites[e.phase-1]:e.type<=2?bossSprites[e.type]:e.type===3?(e.phase===1&&riftFrame(e)%2?riftPhase1InbetweenSprite:riftPhaseSprites[e.phase-1]):ironBloomFrame(e)%2?ironBloomInbetweenSprites[e.phase-1]:ironBloomPhaseSprites[e.phase-1];
    if(!source?.ready)return{ready:false,message:'LOADING ORIGINAL ENCOUNTER ART'};
    if(e.kind==='boss'&&!e.epic&&e.type===0)return{ready:true,message:'AUTHORED BLOODSTAR LAYERS READY'};
    const module=window.StarfighterDestruction;
    if(!module?.has(source))return{ready:false,message:'PREPARED DAMAGE SOURCE NOT REGISTERED: '+(source.sourcePath||source.src)};
    module.preload(source);if(!module.ready(source))return{ready:false,message:'LOADING PREPARED CORE / PARTS / JOINT ART'};
    return{ready:true,message:'PREPARED CORE / PARTS / JOINT ART READY'+(e.kind==='mini'&&source.frameCleanup?' · '+source.frameCleanup.removedPixels+' SOURCE SCRAP PIXELS REMOVED':'')}
  }
  function damageRender(){
    if(!damageCurrent)return;const readiness=damageArtStatus();for(const input of damageArea.querySelectorAll('[data-group]'))input.disabled=!readiness.ready;damagePanel.querySelector('#damage-combo').disabled=!readiness.ready;
    if(!readiness.ready){for(const canvas of[damageIntact,damageBroken,damageFragments]){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.fillStyle='#102235';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#f1dca4';c.font='16px monospace';c.fillText(readiness.message.slice(0,90),24,60)}damagePanel.querySelector('#damage-status').textContent=readiness.message;damageDirty=true;return}
    damagePaint(damageIntact.getContext('2d'),true);damagePaint(damageBroken.getContext('2d'),false);damagePaintFragments();
    const e=damageCurrent.e,pose=inspectionFrame(e),detail=damagePanel.querySelector('#damage-detail').checked;damageArea.querySelector('#damage-heading').textContent=e.def.name+' / PHASE '+(e.phase||1)+' / POSE '+pose+(detail?' / 2× DETAIL':' / FIGHT SCALE');
    damagePanel.querySelector('#damage-status').textContent='COMBINATION '+damageMask+' / '+((1<<damageGroups.length)-1)+' · '+bossFragments.length+' FALLEN PARTS · '+readiness.message
  }
  damagePanel.querySelector('#damage-load').onclick=damageLoad;
  damagePanel.querySelector('#damage-phase').onclick=()=>{const e=damageCurrent.e;if(e.kind==='mini')return;e.phase=e.phase%(e.epic?4:2)+1;damageGroupList();damageChoose(0)};
  damagePanel.querySelector('#damage-next').onclick=()=>{damageClock+=.125;damageDirty=true};damagePanel.querySelector('#damage-prev').onclick=()=>{damageClock=Math.max(0,damageClock-.125);damageDirty=true};
  damagePanel.querySelector('#damage-motion').onclick=()=>{damageMotion=!damageMotion;damagePanel.querySelector('#damage-motion').textContent=damageMotion?'FREEZE MOTION':'PLAY MOTION';damageDirty=true};
  damagePanel.querySelector('#damage-combo').onclick=()=>damageChoose((damageMask+1)%(1<<damageGroups.length));damagePanel.querySelector('#damage-reset').onclick=()=>damageChoose(0);
  for(const id of['#damage-detail','#damage-flash','#damage-smoke','#damage-studio'])damagePanel.querySelector(id).onchange=()=>damageDirty=true;
  damageLoad();function damageLoop(now){const dt=Math.min(.05,Math.max(0,(now-damageLast)/1000));damageLast=now;if(damageMotion){damageClock+=dt;damageDirty=true;if(damagePanel.querySelector('#damage-smoke').checked){emitWeakSmoke(damageCurrent.e,dt);updateParticles(dt)}}if(damageDirty||now-damageLastPaint>250){damageDirty=false;damageLastPaint=now;damageRender()}requestAnimationFrame(damageLoop)}requestAnimationFrame(damageLoop);
'''
end = source.rfind('})();')
assert end >= 0
(ROOT / 'artifacts/damage-sprite-preview-game.js').write_text(source[:end] + CONTROLS + source[end:], encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', '<script src="artifacts/damage-sprite-preview-game.js?v=1"></script>', html)
memory = '<script>const damageMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>damageMemory.get(k)??null,setItem:(k,v)=>damageMemory.set(k,String(v)),removeItem:k=>damageMemory.delete(k)}});</script>'
html = html.replace('<body>', '<body>' + memory, 1)
(ROOT / 'artifacts/damage-sprite-preview.html').write_text(html, encoding='utf-8')
print('Built private damage sprite comparison for all 22 encounters and break combinations.')
