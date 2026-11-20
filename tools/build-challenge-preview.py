from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = (root / 'game.js').read_text(encoding='utf-8')
source = source.replace('function update(dt){', 'function update(dt){if(challengeFrozen)return;', 1)
controls = r'''
  let challengeFrozen=false;
  const qaStatus=document.querySelector('#qa-status');
  function qaFreeze(message){challengeFrozen=true;qaStatus.textContent=message+` [hostile ${enemyShots.length}, tell ${enemyShots.find(b=>b.warn>0)?.warn||0}]`;hud();draw()}
  function qaLoad(){
    challengeFrozen=false;start('story');wave=Number(document.querySelector('#qa-sector').value);beginStage();
    const kind=document.querySelector('#qa-encounter').value;
    if(kind==='mini'){makeMiniBoss();Object.assign(miniBoss,{x:760,y:270,intro:0,cool:99,clock:4})}
    else if(kind==='boss'){makeBoss();Object.assign(boss,{x:760,y:270,intro:0,cool:99,clock:4})}
    player.inv=0;qaFreeze('Story stats · 3 hull · no gear, Doctrine or Field Modules. Private temporary save.');
  }
  function qaKit(){collectCombatPickup({type:'crystal',color:'red'});collectCombatPickup({type:'bit'});player.pod.mode='docked';player.pod.x=player.x+50;player.pod.y=player.y}
  function qaCaster(){return boss||miniBoss||enemies[0]}
  function qaStep(seconds){challengeFrozen=false;for(let n=0;n<Math.round(seconds*120)&&state==='playing';n++)update(1/120);challengeFrozen=true}
  document.querySelector('#qa-load').onclick=qaLoad;
  document.querySelector('#qa-hide').onclick=()=>{document.querySelector('#qa-panel').style.display='none';fitCanvas();draw()};
  document.querySelector('#qa-live').onclick=()=>{challengeFrozen=false;if(qaCaster())qaCaster().cool=1.2;qaStatus.textContent='Live Story preview · move with arrows/WASD · charge with Space · Escape pauses.'};
  document.querySelector('#qa-kit').onclick=()=>{qaKit();qaFreeze('Collected red Force level 1 + one defense Bit. No gear bonuses.')};
  document.querySelector('#qa-tell').onclick=()=>{qaLoad();qaKit();queuePressureLance(qaCaster());qaFreeze('Amber lance: target locked here · 0.65 second warning · pierces Force and Bits.')};
  document.querySelector('#qa-park').onclick=()=>{qaLoad();qaKit();queuePressureLance(qaCaster());qaStep(4);qaFreeze(`Parked result: HULL ${player.hp}/3 · amber lance passed the front pod and Bit.`)};
  document.querySelector('#qa-dodge').onclick=()=>{qaLoad();qaKit();queuePressureLance(qaCaster());keys.add('ArrowDown');qaStep(.35);keys.clear();qaStep(3.65);qaFreeze(`Dodge result: HULL ${player.hp}/3 · moved down for 0.35 seconds during the locked tell.`)};
  document.querySelector('#qa-pink').onclick=()=>{qaLoad();qaKit();enemyFire(qaCaster());qaStep(4);qaFreeze(`Pink shot result: HULL ${player.hp}/3 · DOSE ${player.dose.toFixed(1)}% · front pod still intercepts ordinary fire.`)};
  document.querySelector('#qa-wall').onclick=()=>{qaLoad();qaKit();fireWall(player.y,210);qaFreeze('Amber wall: move into the marked safe gap before the volley reaches the ship. Harmless 0.8-second tell.')};
  document.querySelector('#qa-shields').onclick=()=>{for(let n=0;n<8;n++)collectCombatPickup({type:'shield'});qaFreeze(`Eight shield pickups: SHIELD ${player.shield}/4 · surplus becomes DOSE.`)};
  qaLoad();
'''
end = source.rfind('})();')
source = source[:end] + controls + source[end:]
(root / 'artifacts/challenge-qa.js').write_text(source, encoding='utf-8')
html = (root / 'index.html').read_text(encoding='utf-8')
html = html.replace('<head>', '<head><base href="../">', 1)
import re
html = re.sub(r'<script src="game.js\?v=\d+"></script>', '<script src="artifacts/challenge-qa.js?v=131"></script>',html)
storage = '''<script>
const qaMemory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>qaMemory.get(String(k))??null,setItem:(k,v)=>qaMemory.set(String(k),String(v)),removeItem:k=>qaMemory.delete(String(k)),clear:()=>qaMemory.clear(),key:n=>Array.from(qaMemory.keys())[n]??null,get length(){return qaMemory.size}}});
</script>'''
panel = '''<aside id="qa-panel" style="position:relative;z-index:99;padding:10px;background:#101827;color:#f4f7ff;font:13px monospace;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
<strong>ISOLATED STORY QA</strong>
<label>Mission <select id="qa-sector"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label>
<label>Encounter <select id="qa-encounter"><option value="boss">Main boss</option><option value="mini">Miniboss</option><option value="field">Field</option></select></label>
<button id="qa-load">Load Story preview</button><button id="qa-live">Run live</button><button id="qa-kit">Ready Force</button><button id="qa-tell">Show amber tell</button><button id="qa-wall">Show wall tell</button><button id="qa-park">Parked test</button><button id="qa-dodge">Dodge test</button><button id="qa-pink">Pink block test</button><button id="qa-shields">Shield cap test</button><button id="qa-hide">Hide QA controls</button>
<output id="qa-status" style="flex-basis:100%;color:#ffd166"></output></aside>'''
html = html.replace('<body>', '<body>' + storage + panel, 1)
(root / 'artifacts/challenge-qa.html').write_text(html, encoding='utf-8')
print('Built private Story browser preview from current source.')
