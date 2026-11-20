"""Private deterministic warning preview; production renderer, temporary pilot."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
controls=r'''
  update=()=>{};loop=()=>{};
  const warningPanel=document.createElement('aside');
  warningPanel.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;z-index:99999;padding:8px;background:#08121f;color:#eaffff;border:1px solid #53ddeb;font:12px monospace';
  warningPanel.innerHTML='<b>PRIVATE WARNING REVIEW</b><button id="warning-pressure">BOSS CHARGE</button><button id="warning-mini">MINIBOSS CHARGE</button><button id="warning-laser">LASER CHARGE</button><button id="warning-active">ACTIVE LASER</button><span id="warning-status"></span>';
  document.body.appendChild(warningPanel);for(const button of warningPanel.querySelectorAll('button'))button.style.cssText='background:#102638;border:1px solid #3d8aa3;color:#d9f8ff;padding:6px;min-width:110px';
  function warningMode(mode){
    if(mode==='mini')startMiniBossLab(2);else startBossLab(8);
    const e=boss||miniBoss;Object.assign(e,{x:W*.77,y:H*.5,intro:0,clock:.6,phase:2,hitFlash:0,phaseFlash:0,weakOpen:true,weakTelegraph:0,weakTimer:999,cool:999,hidden:false,visualAngle:0});
    player.x=W*.23;player.y=H*.5;player.inv=0;player.pod.owned=false;player.bits=0;enemyShots=[];shots=[];particles=[];e.laser=null;
    if(mode==='pressure'||mode==='mini'){const port=mode==='mini'?miniBossMuzzle(e):{x:e.x-10,y:e.y};enemyShots.push({x:port.x,y:port.y,vx:-250,vy:0,r:4.5,piercing:true,warn:.12,warnMax:.65,targetX:player.x,targetY:player.y,owner:e})}
    else e.laser={y:e.y,t:mode==='active'?.4:1.05};
    pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden');warningPanel.querySelector('#warning-status').textContent=mode==='active'?'ACTIVE / VISIBLE BEAM':'WINDUP / LOCAL EMITTER FLASH';
  }
  warningPanel.querySelector('#warning-pressure').onclick=()=>warningMode('pressure');
  warningPanel.querySelector('#warning-mini').onclick=()=>warningMode('mini');
  warningPanel.querySelector('#warning-laser').onclick=()=>warningMode('laser');
  warningPanel.querySelector('#warning-active').onclick=()=>warningMode('active');
  warningMode('pressure');function warningPreviewLoop(){draw();requestAnimationFrame(warningPreviewLoop)}requestAnimationFrame(warningPreviewLoop);
'''
end=source.rfind('})();')
assert end>=0
(root/'artifacts/boss-warning-preview-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/boss-warning-preview-game.js?v=139"></script>',html)
memory='<script>const warningMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>warningMemory.get(k)??null,setItem:(k,v)=>warningMemory.set(k,String(v)),removeItem:k=>warningMemory.delete(k)}});</script>'
html=html.replace('<body>','<body>'+memory,1)
(root/'artifacts/boss-warning-preview.html').write_text(html,encoding='utf-8')
print('Built isolated boss warning preview.')
