"""Private, staged Garage pairs and pause-after-hit review. Never real saves."""
from pathlib import Path
import hashlib,re
r=Path(__file__).resolve().parent.parent
source=(r/'game.js').read_text(encoding='utf-8');digest=hashlib.sha256((r/'game.js').read_bytes()).hexdigest()
version=re.search(r'game.js\?v=(\d+)',(r/'index.html').read_text(encoding='utf-8'))[1]
source=source.replace('function update(dt){','function update(dt){return; // Frozen private Garage/camera review.\n',1)
controls=r'''
 const panel=document.createElement('aside');panel.id='pair-review-tools';panel.innerHTML='<b>PRIVATE STAGED GEAR REVIEW</b><button id="pairs-garage">GARAGE</button><button id="pairs-hit">PAUSE AFTER HIT</button><button id="pairs-text">LARGE TEXT</button><button id="pairs-redraw">REDRAW</button><output id="pairs-status"></output>';document.body.append(panel);
 profile.progress.onboardingSeen=[...ONBOARDING_IDS];
 const items=[['arc','weapon','Vigil Plasma Fork','arc',126,2,'VANGUARD',{damagePct:4,chargePct:4}],['plate','armor','Pilgrim Aegis Plate','capacitor',114,2,'AEGIS',{hull:1,shields:1}],['phase','engine','Mercury Ion Thruster','phase',112,1,'VECTOR',{profilePct:3}],['shepherd','pod','Shepherd Drone Matrix','shepherd',110,1,'VECTOR',{podDamagePct:5}],['siege','weapon','Morrow Wave Emitter','siege',108,0,'AEGIS',{chargePct:3}],['recovery','armor','Bastion Hull Lattice','recovery',108,1,'VANGUARD',{evadePct:2}],['scavenger','engine','Comet Vector Drive','scavenger',104,0,'VANGUARD',{speedPct:3}],['siphon','pod','Choir Signal Core','siphon',105,0,'AEGIS',{podSize:1}]];
 garage.inventory=items.map(([id,slot,name,intrinsic,power,tier,alignment,stats])=>normalizeGearItem({id:'private-'+id,slot,name,[slot==='weapon'?'gunVariant':'trait']:intrinsic,power,tier,alignment,stats,source:'PRIVATE STAGED FIXTURE'}));garage.equipped={weapon:'private-arc',armor:'private-plate',engine:'private-phase',pod:'private-shepherd'};
 function reportPairs(){const pairs=gearComboStates();document.querySelector('#pairs-status').textContent=`${state.toUpperCase()} / ${pairs.filter(p=>p.active).length} ACTIVE / ${pairs.filter(p=>p.available&&!p.active).length} OWNED PAIRS TO TRY / ${PAIR_REVIEW_HASH.slice(0,12)}`;draw()}
 document.querySelector('#pairs-garage').onclick=()=>{goMenu();openGarage();reportPairs()};
 document.querySelector('#pairs-hit').onclick=()=>{goMenu();start('story');player.shield=0;player.inv=0;damage(1,{kind:'enemyShot'});pause();reportPairs()};
 document.querySelector('#pairs-text').onclick=()=>{uiText.set(uiText.value==='large'?'standard':'large');fitCanvas();reportPairs()};document.querySelector('#pairs-redraw').onclick=()=>{fitCanvas();reportPairs()};document.addEventListener('click',reportPairs);openGarage();reportPairs();
'''
end=source.rfind('})();');assert end>=0
(r/'artifacts/owned-pairs-preview-game.js').write_text(source[:end]+f'const PAIR_REVIEW_HASH={digest!r};\n'+controls+source[end:],encoding='utf-8')
html=(r/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/owned-pairs-preview-game.js?v={version}"></script>',html)
storage='''<script>const pairReviewMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>pairReviewMemory.get(String(k))??null,setItem:(k,v)=>pairReviewMemory.set(String(k),String(v)),removeItem:k=>pairReviewMemory.delete(String(k))}});</script>'''
style='''<style>body{height:100vh;padding-top:40px}#game-shell{width:min(100vw,calc((100vh - 40px)*16/9));max-height:calc(100vh - 40px)}#pair-review-tools{position:fixed;top:0;left:0;right:0;z-index:4000;display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:#071522;color:#cde5ef;padding:5px;font:10px system-ui}#pair-review-tools button{border:1px solid #46778e;background:#123042;color:#d6ecf6;font:700 9px system-ui;padding:4px 6px;letter-spacing:0}#pairs-status{color:#f7d886}</style>'''
(r/'artifacts/owned-pairs-preview.html').write_text(html.replace('</head>',style+'</head>',1).replace('<body>','<body>'+storage,1),encoding='utf-8')
print(f'Built memory-only staged pairs/pause review v{version}; source {digest}.')
