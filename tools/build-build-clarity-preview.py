"""Review production reward screens with a disposable, in-memory pilot."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
source = (root / 'game.js').read_text(encoding='utf-8')
controls = r'''
  const buildQaPanel=document.createElement('aside');buildQaPanel.style.cssText='position:fixed;top:2px;right:2px;z-index:2500;display:flex;gap:5px;padding:5px;background:#08121ff2;border:1px solid #418aa4;color:#dff8ff;font:10px monospace';
  buildQaPanel.innerHTML='<b>PRIVATE BUILD REVIEW</b><button id="qa-build-garage">GARAGE</button><button id="qa-build-module">FIELD MODULE</button><button id="qa-build-doctrine">DOCTRINE</button>';
  document.body.appendChild(buildQaPanel);for(const button of buildQaPanel.querySelectorAll('button'))button.style.cssText='background:#102638;border:1px solid #3d8aa3;color:#d9f8ff;padding:4px;font:10px monospace';
  profile.name='PRIVATE BUILD REVIEW';profile.progress.onboardingSeen=[...ONBOARDING_IDS];
  const qaItem=(id,slot,name,intrinsic,power,tier,alignment,stats)=>normalizeGearItem({id,slot,name,[slot==='weapon'?'gunVariant':'trait']:intrinsic,power,tier,alignment,stats,source:'PRIVATE REVIEW — NOT SAVED'});
  const qaItems=[
    qaItem('qa-arc','weapon','Rare Vigil Plasma Fork','arc',118,2,'VANGUARD',{damagePct:5,chargePct:6}),
    qaItem('qa-siege','weapon','Common Morrow Charge Coil','siege',105,0,'AEGIS',{chargePct:4}),
    qaItem('qa-core','weapon','Rare Kestrel Core Lens','core',124,2,'VANGUARD',{weakPct:6,damagePct:4}),
    qaItem('qa-capacitor','armor','Rare Pilgrim Capacitor Plate','capacitor',114,2,'AEGIS',{hull:1,shields:1}),
    qaItem('qa-recovery','armor','Uncommon Bastion Recovery Shell','recovery',110,1,'VANGUARD',{evadePct:2}),
    qaItem('qa-phase','engine','Common Mercury Phase Turbine','phase',106,0,'VECTOR',{profilePct:3}),
    qaItem('qa-scavenger','engine','Uncommon Comet Salvage Drive','scavenger',109,1,'VANGUARD',{speedPct:5}),
    qaItem('qa-shepherd','pod','Uncommon Shepherd Drone Matrix','shepherd',109,1,'VECTOR',{podDamagePct:6}),
    qaItem('qa-siphon','pod','Common Choir Absorption Core','siphon',104,0,'AEGIS',{podSize:1})
  ];
  for(let i=0;i<7;i++)qaItems.push(qaItem('qa-spare-'+i,'weapon','Common Reserve Coil '+(i+1),'siege',104-i%3,0,i%2?'VECTOR':'AEGIS',{chargePct:2+i%3}));
  garage.inventory=qaItems;garage.equipped={weapon:'qa-arc',armor:'qa-capacitor',engine:'qa-phase',pod:'qa-shepherd'};garage.materials=12;
  buildQaPanel.querySelector('#qa-build-garage').onclick=()=>{goMenu();openGarage()};
  buildQaPanel.querySelector('#qa-build-module').onclick=()=>{start('story');player.pod.owned=true;player.laserColor='red';player.laserLevel=1;player.missileLevel=1;player.bits=1;player.hp=2;for(const module of tacticalRetrofits)player.retrofits[module.key]=['forceTrim','fieldPatch','chargeBaffle'].includes(module.key)?0:module.max;presentTacticalRetrofit(()=>{})};
  buildQaPanel.querySelector('#qa-build-doctrine').onclick=()=>{start('story');presentBossDoctrine('FIRST APEX CLEARED',()=>{})};
'''
end=source.rfind('})();')
assert end>=0
(root/'artifacts/build-clarity-qa-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/build-clarity-qa-game.js?v=159"></script>',html)
storage='<script>const buildQaMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>buildQaMemory.get(k)??null,setItem:(k,v)=>buildQaMemory.set(k,String(v)),removeItem:k=>buildQaMemory.delete(k)}});</script>'
(root/'artifacts/build-clarity-qa.html').write_text(html.replace('<body>','<body>'+storage,1),encoding='utf-8')
print('Built isolated build-choice review.')
