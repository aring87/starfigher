"""Private readiness/debris review using native game actions and temporary storage."""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parent.parent
source_path = root / 'game.js'
source = source_path.read_text(encoding='utf-8')
version = int(re.search(r'game.js\?v=(\d+)', (root/'index.html').read_text(encoding='utf-8'))[1])
source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()

controls = r'''
  let clarityLast=null;
  const clarityPanel=document.querySelector('#clarity-panel'),clarityReport=document.querySelector('#clarity-report');
  function clarityLayout(){document.documentElement.style.setProperty('--clarity-tools',clarityPanel.getBoundingClientRect().height+'px');fitCanvas();draw()}
  function clarityStart(){
    profile.progress.onboardingSeen=[];onboardingController?.close();
    garage.inventory=[];garage.equipped=Object.fromEntries(gearSlots.map(slot=>[slot,null]));
    start('story');player.inv=0;stageIntro=0;stageCue=null;t=8;spawn=999;stageHazardClock=999;
    clearInput();pauseMusic();
  }
  function clarityFinish(scenario,expected,extra={}){
    miniBoss=boss=null;victoryDelay=null;stageApexIntro=-1;player.deltaFlash=0;
    clearInput();pauseMusic();onboardingController?.tick(0);hud();
    const actual=onboardingController?.activeId||null;
    clarityLast={scenario,version:CLARITY_VERSION,sourceSha256:CLARITY_HASH,state,mode:runMode,dev:bossLab,
      hull:player.hp,maxHull:player.maxHp,shields:player.shield,dose:player.dose,
      activeHint:actual,queuedHints:onboardingController?.queuedIds||[],seenHints:[...profile.progress.onboardingSeen],
      remainingHazards:stageHazards.length,expectedHint:expected,...extra,
      limits:'Frozen isolated native-action fixture; ordinary Story resources, in-memory pilot only. Not natural campaign progression or a human difficulty result.'};
    clarityLast.passed=actual===expected&&(!('expectedHull' in extra)||player.hp===extra.expectedHull)&&(!('expectedHazards' in extra)||stageHazards.length===extra.expectedHazards);
    document.querySelector('#clarity-status').textContent=`${clarityLast.passed?'PASS':'FAIL'} / ${scenario} / HULL ${player.hp}/${player.maxHp} / SHIELD ${player.shield} / DOSE ${player.dose}% / HELP ${actual||'NONE'} / DEBRIS ${stageHazards.length} / FROZEN STORY RULES`;
    document.querySelector('#clarity-explanation').textContent=extra.explanation||'';
    clarityReport.value=JSON.stringify(clarityLast,null,2);clarityLayout();draw();
  }
  function clarityReady(kind,spent){
    clarityStart();makeMiniBoss();miniBoss.intro=0;player.inv=0;
    if(kind==='delta'){addDose(100);if(spent)activateDelta()}
    else{collectCombatPickup({type:'shield'});if(spent)damage(1,{kind:'projectile'})}
    clarityFinish(`${kind.toUpperCase()} ${spent?'SPENT':'READY'}`,spent?null:kind,{expectedHull:3,
      explanation:spent?'The resource was earned during a boss and spent before field flight. Its delayed Ready card waits until the resource is available again.':'The resource was earned during a boss and retained. Its first-earned help card appears when field flight resumes.'});
  }
  function clarityDebris(force){
    clarityStart();
    const h={type:'debris',mine:false,x:player.x+(force?20:12),y:player.y,r:22,speed:0,vy:0,rot:0,vr:0,hp:1,life:14,phase:0,color:'#ffb67a'};
    stageHazards.push(h);
    if(force){collectCombatPickup({type:'crystal',color:'red'});Object.assign(player.pod,{mode:'docked',x:player.x+50,y:player.y})}
    else fire(0);
    updateStageHazards(1/120);
    clarityFinish(force?'FORCE BREAK':'SHOT BREAK',null,{expectedHull:3,expectedHazards:0,
      destroyed:!!h.dead,score,explanation:force?'A live rock overlaps both Force and fighter. Native Force contact destroys it before hull contact; the fighter keeps all three hull.':'A live rock overlaps the fighter and its native tap projectile. The projectile destroys it before hull contact; the fighter keeps all three hull.'});
  }
  document.querySelector('#clarity-delta-spent').onclick=()=>clarityReady('delta',true);
  document.querySelector('#clarity-delta-ready').onclick=()=>clarityReady('delta',false);
  document.querySelector('#clarity-shield-spent').onclick=()=>clarityReady('shield',true);
  document.querySelector('#clarity-shield-ready').onclick=()=>clarityReady('shield',false);
  document.querySelector('#clarity-shot').onclick=()=>clarityDebris(false);
  document.querySelector('#clarity-force').onclick=()=>clarityDebris(true);
  document.querySelector('#clarity-show-report').onclick=()=>{clarityReport.hidden=!clarityReport.hidden;clarityLayout()};
  document.querySelector('#clarity-proof').onclick=()=>{onboardingController?.tick(0);clarityLayout();draw()};
  addEventListener('resize',clarityLayout);clarityReady('delta',true);
'''

assert source.count('function update(dt){') == 1
source = source.replace('function update(dt){', 'function update(dt){return; // Frozen private review; fixture buttons call native actions.\n', 1)
assert 'onboardingController?.tick(elapsed);' in source
source = source.replace('onboardingController?.tick(elapsed);', 'onboardingController?.tick(0);', 1)
end = source.rfind('})();')
assert end >= 0
declarations = f'const CLARITY_VERSION={version},CLARITY_HASH={source_hash!r};\n'
(root/'artifacts/field-clarity-preview-game.js').write_text(source[:end]+declarations+controls+source[end:], encoding='utf-8')

storage = '''<script>const clarityMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>clarityMemory.get(String(k))??null,setItem:(k,v)=>clarityMemory.set(String(k),String(v)),removeItem:k=>clarityMemory.delete(String(k)),clear:()=>clarityMemory.clear(),key:n=>Array.from(clarityMemory.keys())[n]??null,get length(){return clarityMemory.size}}});</script>'''
panel = '''<aside id="clarity-panel"><b>PRIVATE FIELD CLARITY REVIEW · TEMPORARY PILOT</b><div class="clarity-actions"><button id="clarity-delta-spent">DELTA SPENT</button><button id="clarity-delta-ready">DELTA READY</button><button id="clarity-shield-spent">SHIELD SPENT</button><button id="clarity-shield-ready">SHIELD READY</button><button id="clarity-shot">SHOT BREAK</button><button id="clarity-force">FORCE BREAK</button><button id="clarity-show-report">SHOW REPORT</button><button id="clarity-proof">REDRAW PROOF</button></div><output id="clarity-status"></output><p id="clarity-explanation"></p><textarea id="clarity-report" aria-label="Private field clarity report" readonly hidden></textarea></aside>'''
style = '''<style>body{height:100vh;padding-top:var(--clarity-tools,112px)}#game-shell{width:min(100vw,calc((100vh - var(--clarity-tools,112px))*16/9));max-height:calc(100vh - var(--clarity-tools,112px))}#clarity-panel{position:fixed;top:0;left:0;width:100%;z-index:2000;box-sizing:border-box;padding:8px;background:#071522;color:#d6ecf6;font:11px system-ui}#clarity-panel b{color:#8debf1}.clarity-actions{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0}#clarity-panel button{font:700 10px system-ui;letter-spacing:0;padding:5px 8px;border:1px solid #46778e;color:#d6ecf6;background:#123042}#clarity-status{display:block;color:#f7d886;line-height:1.4}#clarity-explanation{margin:4px 0 0;line-height:1.4}#clarity-report{width:97%;height:155px;font:11px monospace;color:#d6ecf6;background:#0a1822}</style>'''
html = (root/'index.html').read_text(encoding='utf-8')
html = html.replace('<head>', '<head><base href="../">', 1).replace('</head>', style+'</head>', 1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', f'<script src="artifacts/field-clarity-preview-game.js?v={version}"></script>', html)
html = html.replace('<body>', '<body>'+storage+panel, 1)
(root/'artifacts/field-clarity-preview.html').write_text(html, encoding='utf-8')
print(f'Built private field clarity review v{version}; source {source_hash}. No real pilot storage.')
