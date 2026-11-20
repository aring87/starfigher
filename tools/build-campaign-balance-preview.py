"""Build private playable Story balance fixtures, never using browser pilot storage."""
from pathlib import Path
import hashlib
import re

root=Path(__file__).resolve().parent.parent
controls=r'''
  let balanceRunning=false,balanceSetup=null,balanceLedger={pickups:{},firstForce:null,encounters:[],lastEncounter:null};
  const balancePanel=document.querySelector('#balance-panel'),balanceOutput=document.querySelector('#balance-output');
  const epicStartSelect=document.querySelector('#balance-epic-start');
  for(let id=0;id<epicBossTypes.length;id++){const option=document.createElement('option');option.value='epic'+id;option.textContent='Secret: '+epicBossTypes[id].name;document.querySelector('#balance-kind').appendChild(option)}
  document.querySelector('#balance-kind').onchange=()=>{epicStartSelect.disabled=!document.querySelector('#balance-kind').value.startsWith('epic')};
  function balanceLayout(){document.documentElement.style.setProperty('--balance-tools',balancePanel.getBoundingClientRect().height+'px');fitCanvas();draw()}
  const balancePiece=(slot,trait,alignment,stats)=>normalizeGearItem({id:'balance-'+slot,slot,tier:2,power:114,name:gearSlotNames[slot]+' test roll',source:'PRIVATE COMPARISON FIXTURE',alignment,stats,...(slot==='weapon'?{gunVariant:trait}:{trait})});
  const balanceBuilds={
    empty:[],
    charge:[balancePiece('weapon','siege','VANGUARD',{damagePct:5,weakPct:6}),balancePiece('armor','capacitor','AEGIS',{hull:1,shields:1}),balancePiece('engine','vector','VECTOR',{chargePct:5,speedPct:5}),balancePiece('pod','relay','VANGUARD',{podDamagePct:6,podSize:1})],
    force:[balancePiece('weapon','sync','VECTOR',{chargePct:5,damagePct:5}),balancePiece('armor','ablative','AEGIS',{hull:1,shields:1}),balancePiece('engine','phase','AEGIS',{chargePct:5,profilePct:4}),balancePiece('pod','siphon','VECTOR',{podDamagePct:6,podSize:1})]
  };
  function balanceObserve(){
    const enemy=boss||miniBoss,key=enemy?`${wave}:${enemy.kind}:${enemy.phase||1}`:null;
    if(key!==balanceLedger.lastEncounter){balanceLedger.lastEncounter=key;if(enemy)balanceLedger.encounters.push({mission:wave,target:enemy.def.name,phase:enemy.phase||1,at:+runElapsed.toFixed(2),maxHp:enemy.max})}
  }
  function balanceReport(){
    return{fixture:balanceSetup,version:BALANCE_SOURCE_LABEL,sourceSha256:BALANCE_SOURCE_HASH,state,mode:runMode,dev:bossLab,mission:wave,seconds:+runElapsed.toFixed(2),fieldSeconds:+(stagePostEliteClock>=0?stagePostEliteClock:t).toFixed(2),segment:stagePostEliteClock>=0?'postElite':'approach',
      hull:player.hp,maxHull:player.maxHp,shields:player.shield,kit:{force:player.laserLevel,color:player.laserColor,missiles:player.missileLevel,bits:player.bits},perks:[...runProgression.perks],gear:garage.inventory.map(({id,slot,tier,stats,alignment,gunVariant,trait})=>({id,slot,tier,stats,alignment,gunVariant,trait})),
      target:(boss||miniBoss)?{name:(boss||miniBoss).def.name,hp:(boss||miniBoss).hp,max:(boss||miniBoss).max,phase:(boss||miniBoss).phase||1,epic:!!boss?.epic,ritual:boss?.ritual?{...boss.ritual}:null,wardProtected:boss?.toxinProtected??null}:null,guardians:epicHeavies.map(h=>({x:h.x,y:h.y,hp:h.hp,max:h.max,active:h.active,dead:h.dead})),stats:{...runStats},ledger:balanceLedger,
      limits:'Temporary pilot. Staged missions/encounters and capped-kit or Rare-build comparisons are explicit fixtures, not naturally earned campaign progression or human difficulty evidence.'};
  }
  function balanceStatus(){
    if(!balanceSetup)return;
    const target=boss||miniBoss,mode=balanceRunning?'LIVE':'FROZEN';
    document.querySelector('#balance-status').textContent=`${mode} / ${state.toUpperCase()} / MISSION ${wave} / ${runElapsed.toFixed(1)}s / HULL ${player.hp}/${player.maxHp} / SHIELD ${player.shield} / ${target?target.def.name+' '+target.hp.toFixed(1)+'/'+target.max:'FIELD'} / ${bossLab?'DEV LAB RESOURCES':runMode.toUpperCase()+' RULES'}`;
    if(state==='gameover'&&balanceSetup.kind!=='mission'){document.querySelector('#retry-btn').textContent='RESET TEST FIXTURE';document.querySelector('#retry-details').textContent='Repeat this private encounter and kit, then press Play. No real pilot data is saved.';document.querySelector('#restart-run-btn').hidden=true}
    if(state==='gameover'||state==='complete')balanceRunning=false;
  }
  function balanceLoad(){
    const mission=Number(document.querySelector('#balance-mission').value),kind=document.querySelector('#balance-kind').value,build=document.querySelector('#balance-build').value,kit=document.querySelector('#balance-kit').value,perkCount=Number(document.querySelector('#balance-perks').value),epicStart=epicStartSelect.value;
    profile.progress.onboardingSeen=mission===1&&kind==='mission'&&build==='empty'&&kit==='natural'?[]:[...ONBOARDING_IDS];
    let randomState=Number(document.querySelector('#balance-seed').value)||1103;
    Math.random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296};
    garage.inventory=JSON.parse(JSON.stringify(balanceBuilds[build]));garage.equipped=Object.fromEntries(gearSlots.map(slot=>[slot,garage.inventory.find(item=>item.slot===slot)?.id||null]));
    start('story');wave=mission;player.rank=mission;runEpicEncounter=null;
    for(let i=0;i<Math.min(perkCount,mission-1);i++){
      const desired=['precisionRelay','coreSurge','bitReclaimer'][i];let offered;
      for(let seed=0;seed<1000;seed++){offered=runRewards.offerPerks(runProgression,i+1,'balance-'+seed);if(offered.offer.includes(desired))break}
      runProgression=runRewards.choosePerk(offered,i+1,desired);
    }
    applyRunPerks();beginStage();
    if(kit.startsWith('capped')){
      const caps=combatProgressionCaps();
      const color=kit==='capped-blue'?'blue':kit==='capped-yellow'?'yellow':'red';
      for(let i=0;i<caps.force;i++)collectCombatPickup({type:'crystal',color});
      for(let i=0;i<caps.missile;i++)collectCombatPickup({type:'missile'});
      for(let i=0;i<caps.bits;i++)collectCombatPickup({type:'bit'});
    }
    score=kills=runElapsed=0;runStats=freshRunStats();
    balanceSetup={mission,kind,build,kit,epicStart:kind.startsWith('epic')?epicStart:null,earnedPerks:runProgression.perks.length,seed:Number(document.querySelector('#balance-seed').value)||1103,dev:false};
    balanceLedger={pickups:{},firstForce:null,encounters:[],lastEncounter:null};
    if(kind==='elite')makeMiniBoss();
    else if(kind==='apex'){t=48;miniBossSpawned=true;stagePostEliteClock=36;beginApexArrival()}
    else if(kind.startsWith('epic')){
      miniBossSpawned=true;stageIntro=0;spawn=999;makeEpicBoss(Number(kind.slice(4)),(mission-1)%10);
      if(epicStart.startsWith('ritual')){const phase=Number(epicStart.slice(6));boss.phase=phase;boss.hp=boss.max*(1-phase*.25);boss.intro=0;for(const nodes of boss.weakNodesByPhase.slice(0,phase))for(const node of nodes){node.hp=0;node.destroyed=true}beginEpicRitual(boss)}
    }
    else saveRunCheckpoint('mission');
    balanceRunning=false;clearInput();pauseMusic();balanceOutput.hidden=true;balanceLayout();balanceStatus();hud();draw();
  }
  document.querySelector('#balance-load').onclick=balanceLoad;
  document.querySelector('#balance-play').onclick=()=>{if(!balanceSetup)balanceLoad();if(state==='paused')pause();balanceRunning=!balanceRunning;if(balanceRunning)resumeMusic();else{clearInput();pauseMusic()}canvas.focus({preventScroll:true});balanceStatus()};
  document.querySelector('#balance-step').onclick=()=>{if(!balanceSetup)balanceLoad();balanceRunning=true;for(let i=0;i<120&&state==='playing';i++)update(1/120);balanceRunning=false;pauseMusic();balanceStatus();draw()};
  document.querySelector('#balance-report').onclick=()=>{if(!balanceSetup)balanceLoad();balanceOutput.hidden=!balanceOutput.hidden;balanceOutput.value=JSON.stringify(balanceReport(),null,2);balanceLayout()};
  document.querySelector('#balance-hide').onclick=()=>{balancePanel.classList.toggle('compact');balanceLayout();draw()};
  const balanceNormalRetry=document.querySelector('#retry-btn').onclick;
  document.querySelector('#retry-btn').onclick=()=>{if(balanceSetup&&balanceSetup.kind!=='mission'){balanceLoad();canvas.focus({preventScroll:true})}else balanceNormalRetry?.()};
  addEventListener('resize',balanceLayout);balanceLayout();
  setInterval(balanceStatus,250);
'''

storage='''<script>const balanceMemory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>balanceMemory.get(String(k))??null,setItem:(k,v)=>balanceMemory.set(String(k),String(v)),removeItem:k=>balanceMemory.delete(String(k)),clear:()=>balanceMemory.clear(),key:n=>Array.from(balanceMemory.keys())[n]??null,get length(){return balanceMemory.size}}});</script>'''
panel='''<aside id="balance-panel"><b>PRIVATE STORY BALANCE TEST · TEMPORARY PILOT · {label}</b><div class="balance-config"><label>Mission <select id="balance-mission">{missions}</select></label><label>Start <select id="balance-kind"><option value="mission">Full mission</option><option value="elite">Elite only</option><option value="apex">Apex approach</option></select></label><label>Epic start <select id="balance-epic-start" disabled><option value="phase1">Fight from Phase 1</option><option value="ritual1">Ritual after Phase 1</option><option value="ritual2">Ritual after Phase 2</option><option value="ritual3">Ritual after Phase 3</option></select></label><label>Gear <select id="balance-build"><option value="empty">Empty Garage</option><option value="charge">Rare Siege / Capacitor</option><option value="force">Rare Sync / Siphon</option></select></label><label>Kit <select id="balance-kit"><option value="natural">Fighter only · collect drops</option><option value="capped">Mission-capped Red kit · staged</option><option value="capped-blue">Mission-capped Blue kit · staged</option><option value="capped-yellow">Mission-capped Yellow kit · staged</option></select></label><label>Run perks <select id="balance-perks"><option value="0">None</option><option value="3">Up to 3 legitimately available</option></select></label><label>Seed <input id="balance-seed" type="number" value="1103"></label></div><div class="balance-actions"><button id="balance-load">RESET FIXTURE</button><button id="balance-play">PLAY / FREEZE</button><button id="balance-step">STEP 1 SECOND</button><button id="balance-report">SHOW REPORT</button><button id="balance-hide">COMPACT TOOLS</button><a href="{comparison}">Compare {other}</a></div><output id="balance-status">Choose a fixture, then Play. Normal Story hull, shields, kit caps and controls; no DEV bonuses. Full Mission 1 + Empty Garage + Fighter only is a fresh campaign.</output><textarea id="balance-output" aria-label="Private test report" readonly hidden></textarea></aside>'''
style='''<style>body{height:100vh;padding-top:var(--balance-tools,135px)}#game-shell{width:min(100vw,calc((100vh - var(--balance-tools,135px))*16/9));max-height:calc(100vh - var(--balance-tools,135px))}#balance-panel{padding:8px;background:#071522;color:#d6ecf6;font:11px system-ui;position:fixed;top:0;left:0;z-index:2000;box-sizing:border-box;width:100%}#balance-panel b{color:#8debf1}#balance-panel label{display:flex;align-items:center;gap:5px}#balance-panel select,#balance-panel input{font:11px system-ui;background:#132b3a;color:#fff;border:1px solid #365366;padding:3px}#balance-panel input{width:65px}.balance-config,.balance-actions{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}#balance-panel button{font:700 10px system-ui;letter-spacing:0;padding:5px 8px;border:1px solid #46778e;color:#d6ecf6;background:#123042}#balance-panel a{color:#80d7ec;align-self:center}#balance-status{display:block;color:#f7d886;line-height:1.4}#balance-panel textarea{width:95%;height:180px;font:11px monospace;color:#d6ecf6;background:#0a1822}#balance-panel.compact .balance-config,#balance-panel.compact>b{display:none}</style>'''

def build_preview(name,source_path,label,other,comparison,version):
    source=source_path.read_text(encoding='utf-8')
    source_hash=hashlib.sha256(source_path.read_bytes()).hexdigest()
    source=source.replace('function update(dt){','function update(dt){if(!balanceRunning)return;balanceObserve();',1)
    source=source.replace("function collectCombatPickup(p){", "function collectCombatPickup(p){if(balanceSetup){balanceLedger.pickups[p.type]=(balanceLedger.pickups[p.type]||0)+1;if(p.type==='crystal'&&!player.pod.owned)balanceLedger.firstForce=+runElapsed.toFixed(2)}",1)
    at=source.rfind('})();')
    assert at>=0
    declarations=f"const BALANCE_SOURCE_LABEL={label!r},BALANCE_SOURCE_HASH={source_hash!r};\n"
    (root/f'artifacts/{name}-game.js').write_text(source[:at]+declarations+controls+source[at:],encoding='utf-8')
    html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1).replace('</head>',style+'</head>',1)
    html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/{name}-game.js?v={version}"></script>',html)
    content=panel.replace('{label}',label).replace('{missions}',''.join(f'<option>{i}</option>' for i in range(1,11))).replace('{comparison}',comparison).replace('{other}',other)
    html=html.replace('<body>','<body>'+storage+content,1)
    (root/f'artifacts/{name}.html').write_text(html,encoding='utf-8')
if __name__=='__main__':
    version=int(re.search(r'game.js\?v=(\d+)',(root/'index.html').read_text(encoding='utf-8'))[1])
    build_preview('campaign-balance-preview',root/'game.js',f'CURRENT v{version}','baseline',f'artifacts/campaign-balance-baseline.html?v={version}',version)
    build_preview('campaign-balance-baseline',root/'artifacts/balance-v153-baseline-game.js','BASELINE v152','current',f'artifacts/campaign-balance-preview.html?v={version}',version)
    print('Built private playable Story balance comparisons; no real pilot storage or DEV resources.')
