"""Per-tab temporary-pilot review of native collection, menu and reload paths."""
from pathlib import Path
import hashlib
import re

root=Path(__file__).resolve().parent.parent
source_path=root/'game.js'
source=source_path.read_text(encoding='utf-8')
source_hash=hashlib.sha256(source_path.read_bytes()).hexdigest()
version=int(re.search(r'game.js\?v=(\d+)',(root/'index.html').read_text(encoding='utf-8'))[1])

# Use only a dedicated per-tab QA key. Unlike a window.name navigation snapshot,
# sessionStorage preserves writes from the outgoing pagehide handler.
# Real pilot localStorage keys are never read or written.
storage=r'''<script>(()=>{const key='starfighter-private-session-v156';const backing=window.sessionStorage;let entries=[];try{entries=JSON.parse(backing.getItem(key)||'[]')}catch{}const memory=new Map(Array.isArray(entries)?entries:[]);const persist=()=>backing.setItem(key,JSON.stringify([...memory]));if(!memory.has('starfighterMuted'))memory.set('starfighterMuted','true');persist();Object.defineProperty(window,'localStorage',{value:{getItem:key=>memory.get(String(key))??null,setItem:(key,value)=>{memory.set(String(key),String(value));persist()},removeItem:key=>{memory.delete(String(key));persist()},clear:()=>{memory.clear();persist()},key:n=>Array.from(memory.keys())[n]??null,get length(){return memory.size}}})})();</script>'''


controls=r'''
  let sessionQaAdvancing=false;
  const sessionQaPanel=document.querySelector('#session-panel'),sessionQaOutput=document.querySelector('#session-report');
  const sessionQaSequence=(()=>{try{return JSON.parse(localStorage.getItem('sessionReviewSequence')||'[]')}catch{return[]}})();
  function sessionQaNote(event){sessionQaSequence.push(event);if(sessionQaSequence.length>40)sessionQaSequence.shift();localStorage.setItem('sessionReviewSequence',JSON.stringify(sessionQaSequence))}
  function sessionQaLayout(){document.documentElement.style.setProperty('--session-tools',sessionQaPanel.getBoundingClientRect().height+'px');fitCanvas();draw()}
  function sessionQaReport(){
    const report={version:SESSION_QA_VERSION,sourceSha256:SESSION_QA_HASH,state,mode:runMode,dev:bossLab,
      hull:player.hp,maxHull:player.maxHp,shields:player.shield,dose:player.dose,
      pendingLootIds:runLoot.map(item=>item.id),inventoryIds:garage.inventory.map(item=>item.id),alloy:garage.materials,
      checkpointValid:!!validateRunCheckpoint(profile.checkpoint),checkpoint:profile.checkpoint?{segment:profile.checkpoint.segment,wave:profile.checkpoint.wave,stageClock:profile.checkpoint.stageClock,score:profile.checkpoint.score}:null,
      lifetime:{...profile.lifetime},sequence:[...sessionQaSequence],
      limits:'Temporary pilot stored only in a dedicated per-tab QA session key. Native collection, pause, menu, Garage and reload paths. Frozen field simulation; no real-pilot storage or campaign difficulty claim.'};
    sessionQaOutput.value=JSON.stringify(report,null,2);
    document.querySelector('#session-status').textContent=`${state.toUpperCase()} / HULL ${player.hp}/${player.maxHp} / PENDING ${report.pendingLootIds.length} / GARAGE ${report.inventoryIds.length} / ALLOY ${garage.materials} / CHECKPOINT ${report.checkpointValid?'VALID':'NONE'} / TEMPORARY TAB PILOT`;
    return report;
  }
  function sessionQaNew(){
    profile.progress.onboardingSeen=[...ONBOARDING_IDS];garage.inventory=[];garage.equipped=Object.fromEntries(gearSlots.map(slot=>[slot,null]));garage.materials=0;
    start('story');stageIntro=0;stageCue=null;spawn=stageHazardClock=999;player.inv=0;clearInput();
    const serial=Number(localStorage.getItem('sessionReviewSerial')||0)+1;localStorage.setItem('sessionReviewSerial',serial);
    const item=normalizeGearItem({...generateGear(2,1,'',{source:'PRIVATE SESSION FIELD ASTERPRINT'}),id:'private-session-'+serial,name:'Session Test Plasma Fork',slot:'weapon',gunVariant:'siege',alignment:'AEGIS',stats:{damagePct:5,chargePct:6},locked:false});
    pickups.push({type:'gear',gear:item,x:player.x+.1,y:player.y,r:13,spin:0});
    sessionQaAdvancing=true;try{update(1/120)}finally{sessionQaAdvancing=false}
    sessionQaNote('native field pickup '+item.id);sessionQaReport();sessionQaLayout();pauseMusic();
  }
  document.querySelector('#session-new').onclick=sessionQaNew;
  document.querySelector('#session-pause').onclick=()=>{if(state==='playing')pause();sessionQaNote('pause');sessionQaReport();sessionQaLayout()};
  document.querySelector('#session-menu').onclick=()=>{if(state!=='paused')return;document.querySelector('#pause-menu-btn').onclick();sessionQaNote('native pause menu action');sessionQaReport();sessionQaLayout()};
  document.querySelector('#session-garage').onclick=()=>{if(state!=='menu')return;openGarage();sessionQaNote('native Garage');sessionQaReport();sessionQaLayout()};
  document.querySelector('#session-show-report').onclick=()=>{sessionQaOutput.hidden=!sessionQaOutput.hidden;sessionQaReport();sessionQaLayout()};
  document.querySelector('#session-proof').onclick=()=>{sessionQaReport();sessionQaLayout()};
  document.querySelector('#session-reload').onclick=()=>location.reload();
  addEventListener('resize',sessionQaLayout);
  addEventListener('pagehide',()=>{sessionQaNote('pagehide: native handler secures pending loot');sessionQaReport()});
  if(localStorage.getItem('starfighterProfileSlot1')){goMenu();sessionQaNote('reloaded temporary pilot');sessionQaReport();sessionQaLayout()}
  else{sessionQaNew();pause();sessionQaNote('default paused pickup fixture');sessionQaReport();sessionQaLayout()}
  setInterval(sessionQaReport,250);
'''

assert source.count('function update(dt){')==1
source=source.replace('function update(dt){','function update(dt){if(!sessionQaAdvancing)return;',1)
end=source.rfind('})();')
assert end>=0
declarations=f'const SESSION_QA_VERSION={version},SESSION_QA_HASH={source_hash!r};\n'
(root/'artifacts/session-review-preview-game.js').write_text(source[:end]+declarations+controls+source[end:],encoding='utf-8')
panel='''<aside id="session-panel"><b>PRIVATE SESSION REVIEW · TEMPORARY TAB PILOT · RELOAD SAFE IN THIS TAB</b><div class="session-actions"><button id="session-new">NEW TEST PICKUP</button><button id="session-pause">PAUSE</button><button id="session-menu">MENU</button><button id="session-garage">GARAGE</button><button id="session-show-report">SHOW REPORT</button><button id="session-proof">REDRAW PROOF</button><button id="session-reload">RELOAD TAB</button></div><output id="session-status"></output><p>Collect → Pause → Menu → Garage. Reload this tab to verify the item stays. New Test Pickup resets only this temporary fixture.</p><textarea id="session-report" aria-label="Private session report" readonly hidden></textarea></aside>'''
style='''<style>body{height:100vh;padding-top:var(--session-tools,110px)}#game-shell{width:min(100vw,calc((100vh - var(--session-tools,110px))*16/9));max-height:calc(100vh - var(--session-tools,110px))}#session-panel{position:fixed;top:0;left:0;width:100%;z-index:2000;box-sizing:border-box;padding:8px;background:#071522;color:#d6ecf6;font:11px system-ui}#session-panel b{color:#8debf1}.session-actions{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0}#session-panel button{font:700 10px system-ui;letter-spacing:0;padding:5px 8px;border:1px solid #46778e;color:#d6ecf6;background:#123042}#session-status{display:block;color:#f7d886;line-height:1.4}#session-panel p{margin:4px 0 0;line-height:1.4}#session-report{width:97%;height:150px;font:11px monospace;color:#d6ecf6;background:#0a1822}</style>'''
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1).replace('</head>',style+'</head>',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/session-review-preview-game.js?v={version}"></script>',html)
html=html.replace('<body>','<body>'+storage+panel,1)
(root/'artifacts/session-review-preview.html').write_text(html,encoding='utf-8')
print(f'Built isolated session review v{version}; source {source_hash}. Dedicated per-tab QA session storage only.')
