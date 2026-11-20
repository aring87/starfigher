"""Isolated production presentation preview; temporary pilot, no progress writes."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
controls=r'''
  const polishUpdate=update;update=()=>{};loop=()=>{};
  let polishScene='support',polishLast=0;
  const polishPanel=document.createElement('aside');polishPanel.id='polish-panel';polishPanel.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:8px;padding:8px;background:#08121f;color:#dcfaff;border:1px solid #418aa4;font:12px monospace';
  polishPanel.innerHTML='<b>PRIVATE PRESENTATION REVIEW</b><button id="polish-support">SUPPORT HARDWARE</button><button id="polish-enemies">ENEMY FLIGHT</button><button id="polish-hit">HIT REACTIONS</button><label><input id="polish-reduced" type="checkbox">REDUCED MOTION</label>';
  document.body.appendChild(polishPanel);for(const button of polishPanel.querySelectorAll('button'))button.style.cssText='background:#102638;border:1px solid #3d8aa3;color:#d9f8ff;padding:6px;min-width:130px';
  function polishLoad(scene){
    polishScene=scene;startLevelLab(1);bossLabLevel=false;spawn=999;stageIntro=0;stageCue=null;stageApexIntro=-1;enemyShots=[];shots=[];enemies=[];particles=[];pickups=[];debris=[];player.inv=0;player.x=170;player.y=355;player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide='front';player.pod.x=220;player.pod.y=355;player.bits=2;player.shield=0;
    if(scene==='support')pickups=[{type:'missile',x:245,y:235},{type:'bit',x:405,y:235},{type:'shield',x:565,y:235},{type:'gear',gear:{tier:2},x:725,y:235}].map(p=>({...p,spin:0,r:11}));
    else for(const[type,index]of[['wing',0],['drone',1],['turret',2]])enemies.push({type,x:W*.7,y:150+index*105,r:type==='turret'?23:20,hp:100,maxHp:100,speed:25,phase:.6+index,c:'#ff5d8f',cool:.8+index*.35,coolScale:1,stageStyle:'rail',threat:sectorThreat(2),fireAnim:0,fireReleased:false,shotCycle:0});
    pauseMusic();sfx.setMuted(true);show('');$('#hud').classList.add('hidden')
  }
  for(const[selector,scene]of[['#polish-support','support'],['#polish-enemies','enemies'],['#polish-hit','hit']])polishPanel.querySelector(selector).onclick=()=>polishLoad(scene);
  polishPanel.querySelector('#polish-reduced').onchange=event=>settings.reducedMotion=event.target.checked;
  function polishFrame(now){const dt=Math.min(.04,Math.max(0,(now-polishLast)/1000));polishLast=now;
    if(polishScene==='support'){t+=dt;for(const p of pickups)p.spin+=dt;player.pod.phase+=dt}
    else{player.inv=1e6;polishUpdate(dt);for(const e of enemies){if(e.x<530)e.x=820;if(polishScene==='hit')e.hitFlash=.11}}
    draw();ctx.save();ctx.textAlign='center';ctx.font='700 12px Oxanium,sans-serif';ctx.fillStyle='#d5efff';ctx.shadowColor='#02040b';ctx.shadowBlur=6;
    if(polishScene==='support'){for(const[x,label]of[[245,'HOMING MISSILE RACK'],[405,'DEFENSE BIT'],[565,'AEGIS WARD'],[725,'RARE ASTERPRINT']])ctx.fillText(label,x,285);ctx.fillStyle='#8acbdc';ctx.fillText('THE SAME ARMORED BITS GUARD THE FIGHTER',W/2,425)}
    else{ctx.fillText(polishScene==='hit'?'RESTRAINED CHASSIS IMPACT / ARMOR DETAIL RETAINED':'AUTHORED TURRET CHARGE FOLLOWS ITS REAL SHOT',W/2,465)}ctx.restore();requestAnimationFrame(polishFrame)}
  polishLoad('support');requestAnimationFrame(polishFrame);
'''
end=source.rfind('})();');assert end>=0
(root/'artifacts/combat-polish-preview-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/combat-polish-preview-game.js?v=139"></script>',html)
storage='<script>const polishMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>polishMemory.get(k)??null,setItem:(k,v)=>polishMemory.set(k,String(v)),removeItem:k=>polishMemory.delete(k)}});</script>'
(root/'artifacts/combat-polish-preview.html').write_text(html.replace('<body>','<body>'+storage,1),encoding='utf-8')
print('Built private combat presentation preview.')
