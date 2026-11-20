"""Actual field updates behind explicit controls, with temporary browser storage."""
from pathlib import Path
import re

root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
source=source.replace('function update(dt){','function update(dt){if(rhythmFrozen)return;',1)
controls=r'''
  let rhythmFrozen=true,rhythmLoaded=false;
  const rhythmStatus=document.querySelector('#rhythm-status');
  function rhythmReport(){const beat=currentFieldBeat();rhythmStatus.textContent=`MISSION ${wave} / ${stagePostEliteClock>=0?'POST-ELITE':'APPROACH'} / ${ (stagePostEliteClock>=0?stagePostEliteClock:t).toFixed(2)}s / ${beat.id.toUpperCase()} / ENEMIES ${enemies.length} / SHOTS ${enemyShots.length} / HAZARDS ${stageHazards.length}`;hud();draw()}
  function rhythmLoad(){
    start('story');wave=Number(document.querySelector('#rhythm-sector').value);beginStage();
    if(document.querySelector('#rhythm-segment').value==='post'){miniBossSpawned=true;stagePostEliteClock=0;t=48;spawn=.4;stageHazardClock=3.5}
    mouse.move=mouse.firing=false;clearInput();player.inv=100000;player.pod.owned=true;player.laserColor='red';player.laserLevel=1;player.pod.mode='docked';player.pod.dockSide='front';
    pauseMusic();sfx.setMuted(true);rhythmLoaded=true;rhythmReport();
  }
  function rhythmStep(seconds){if(!rhythmLoaded)rhythmLoad();rhythmFrozen=false;for(let i=0;i<seconds*120&&state==='playing';i++)update(1/120);rhythmFrozen=true;rhythmReport()}
  document.querySelector('#rhythm-load').onclick=rhythmLoad;
  document.querySelector('#rhythm-one').onclick=()=>rhythmStep(1);
  document.querySelector('#rhythm-five').onclick=()=>rhythmStep(5);
  document.querySelector('#rhythm-pressure').onclick=()=>{rhythmLoad();rhythmStep(stagePostEliteClock>=0?9.75:15.75)};
  document.querySelector('#rhythm-reposition').onclick=()=>{rhythmLoad();rhythmStep(stagePostEliteClock>=0?17.75:23.75)};
  document.querySelector('#rhythm-test').onclick=()=>{rhythmLoad();rhythmStep(stagePostEliteClock>=0?27.75:37.75)};
  document.querySelector('#rhythm-hide').onclick=()=>{document.querySelector('#rhythm-panel').style.display='none';fitCanvas();draw()};
  rhythmLoad();
'''
at=source.rfind('})();')
assert at>=0
(root/'artifacts/rhythm-preview-game.js').write_text(source[:at]+controls+source[at:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/rhythm-preview-game.js?v=149"></script>',html)
storage='''<script>const rhythmMemory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>rhythmMemory.get(String(k))??null,setItem:(k,v)=>rhythmMemory.set(String(k),String(v)),removeItem:k=>rhythmMemory.delete(String(k)),clear:()=>rhythmMemory.clear(),key:n=>Array.from(rhythmMemory.keys())[n]??null,get length(){return rhythmMemory.size}}});</script>'''
panel='''<aside id="rhythm-panel" style="position:relative;z-index:9999;padding:8px;background:#071522;color:#ceefff;font:11px monospace;display:flex;flex-wrap:wrap;gap:6px;align-items:center"><b>PRIVATE FIELD PACING / INVULNERABLE METER / NO REAL SAVE</b><label>Mission <select id="rhythm-sector"><option>2</option><option selected>5</option><option>10</option></select></label><label>Segment <select id="rhythm-segment"><option value="pre">Approach</option><option value="post">Post-elite</option></select></label><button id="rhythm-load">RESET</button><button id="rhythm-pressure">PRESSURE SNAPSHOT</button><button id="rhythm-reposition">REPOSITION SNAPSHOT</button><button id="rhythm-test">TEST SNAPSHOT</button><button id="rhythm-one">STEP 1 SECOND</button><button id="rhythm-five">STEP 5 SECONDS</button><button id="rhythm-hide">HIDE QA</button><output id="rhythm-status" style="flex-basis:100%;color:#ffd166"></output></aside>'''
html=html.replace('<body>','<body>'+storage+panel,1)
(root/'artifacts/rhythm-preview.html').write_text(html,encoding='utf-8')
print('Built private native field pacing preview (temporary pilot, explicit 120 Hz stepping).')
