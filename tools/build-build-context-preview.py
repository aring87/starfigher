"""Private browser fixtures for actual perk/gear wording; no real pilot storage."""
from pathlib import Path
import hashlib,re
r=Path(__file__).resolve().parent.parent
source=(r/'game.js').read_text(encoding='utf-8')
version=re.search(r'game.js\?v=(\d+)',(r/'index.html').read_text(encoding='utf-8'))[1]
digest=hashlib.sha256((r/'game.js').read_bytes()).hexdigest()
source=source.replace('function update(dt){','function update(dt){return; // Frozen private build-context review.\n',1)
controls=r'''
 const panel=document.createElement('aside');panel.id='build-context-tools';panel.innerHTML='<b>PRIVATE BUILD CONTEXT</b><button id="context-first">FIRST PERK / NO BITS</button><button id="context-bit">INSPECT / ONE BIT</button><button id="context-spent">SPENT SECOND CHANCE</button><button id="context-replace">REPLACEMENT</button><button id="context-large">LARGE TEXT</button><button id="context-redraw">REDRAW</button><output id="context-status"></output>';document.body.append(panel);
 function contextReport(){document.querySelector('#context-status').textContent=`${state} / ${player.bits} BITS / ${player.hp} HULL / GUARD ${player.secondChanceReady?'READY':'SPENT'} / ${CONTEXT_HASH.slice(0,12)}`;draw()}
 function contextSetup(perks,waveNumber,bits,ready=true){goMenu();profile.progress.onboardingSeen=[...ONBOARDING_IDS];start('story');wave=waveNumber;runProgression=runRewards.validate({...runRewards.fresh(),perks});applyRunPerks();player.hp=1;player.bits=bits;player.secondChanceReady=player.secondChance&&ready;player.inv=0}
 function contextDraft(perks,mission,ready=true){contextSetup(perks,mission,0,ready);const offered=['bitReclaimer','fieldNanites','secondChance','deltaReserve'].filter(id=>!perks.includes(id)).slice(0,3);runProgression=runRewards.validate({...runProgression,offer:offered,pending:'perk',pendingWave:wave});queueRunDoctrine('PRIVATE STAGED APEX',wave+1,0);const delayed=victoryDelay;victoryDelay=null;delayed.run();contextReport()}
 document.querySelector('#context-first').onclick=()=>contextDraft([],1);
 document.querySelector('#context-bit').onclick=()=>{contextSetup(['bitReclaimer','fieldNanites','secondChance'],5,1);openSkillTree();contextReport()};
 document.querySelector('#context-spent').onclick=()=>{contextSetup(['bitReclaimer','fieldNanites','secondChance'],5,0,false);openSkillTree();contextReport()};
 document.querySelector('#context-replace').onclick=()=>contextDraft(['secondChance','precisionRelay','coreSurge'],4,false);
 document.querySelector('#context-large').onclick=()=>{uiText.set(uiText.value==='large'?'standard':'large');fitCanvas();contextReport()};document.querySelector('#context-redraw').onclick=()=>{fitCanvas();contextReport()};document.addEventListener('click',contextReport);contextDraft([],1);
'''
end=source.rfind('})();');assert end>=0
(r/'artifacts/build-context-preview-game.js').write_text(source[:end]+f'const CONTEXT_HASH={digest!r};\n'+controls+source[end:],encoding='utf-8')
html=(r/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/build-context-preview-game.js?v={version}"></script>',html)
storage='''<script>const contextMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>contextMemory.get(String(k))??null,setItem:(k,v)=>contextMemory.set(String(k),String(v)),removeItem:k=>contextMemory.delete(String(k))}});</script>'''
style='''<style>body{height:100vh;padding-top:40px}#game-shell{width:min(100vw,calc((100vh - 40px)*16/9));max-height:calc(100vh - 40px)}#build-context-tools{position:fixed;top:0;left:0;right:0;z-index:4000;display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:#071522;color:#cde5ef;padding:5px;font:10px system-ui}#build-context-tools button{border:1px solid #46778e;background:#123042;color:#d6ecf6;font:700 9px system-ui;padding:4px 6px;letter-spacing:0}#context-status{color:#f7d886}</style>'''
(r/'artifacts/build-context-preview.html').write_text(html.replace('</head>',style+'</head>',1).replace('<body>','<body>'+storage,1),encoding='utf-8')
print(f'Built private build context review v{version}; source {digest}. Staged kit, temporary memory storage, frozen simulation.')
