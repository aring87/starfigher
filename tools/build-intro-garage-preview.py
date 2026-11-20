"""Private, memory-only browser review of the real intro -> Garage -> briefing flow."""
from pathlib import Path
import hashlib,re

r=Path(__file__).resolve().parent.parent
source=(r/'game.js').read_text(encoding='utf-8')
version=re.search(r'game.js\?v=(\d+)',(r/'index.html').read_text(encoding='utf-8'))[1]
digest=hashlib.sha256((r/'game.js').read_bytes()).hexdigest()
source=source.replace('function update(dt){','function update(dt){if(!introQaAdvancing)return; // Private manual simulation.\n',1)
source=source.replace('frame.src=`flight-school.html?', 'frame.src=`artifacts/first-flight-review.html?',1)
private=r'''
 let introQaAdvancing=false;
 const qa=document.createElement('aside');qa.id='intro-qa-tools';qa.innerHTML='<b>PRIVATE INTRO / GARAGE REVIEW</b> <button id="intro-qa-keys">CUSTOM KEYBOARD</button> <button id="intro-qa-pad">CUSTOM CONTROLLER</button> <button id="intro-qa-large">LARGE TEXT</button> <button id="intro-qa-draw">REDRAW</button> <button id="intro-qa-run">RUN NATIVE INTRO DRILLS</button> <output id="intro-qa-status">Memory-only pilot; frozen until the authored drill button.</output>';document.body.append(qa);
 function qaReport(text){document.querySelector('#intro-qa-status').textContent=text||`${state.toUpperCase()} / ${inputDevice} / ${garage.inventory.length} ITEMS / SOURCE ${QA_HASH.slice(0,12)}`;draw()}
 function qaBindings(device){let c=bindingsAPI.normalize(bindingsAPI.defaults);for(const[action,key]of Object.entries({up:'Numpad8',left:'Numpad4',down:'Numpad2',right:'Numpad6',fire:'KeyK',precision:'KeyR',force:'KeyF',mount:'KeyG',delta:'KeyE',pause:'KeyO',tree:'KeyU'}))c=bindingsAPI.rebind(c,'keyboard',action,0,key).bindings;c=bindingsAPI.rebind(c,'keyboard','fire',1,'KeyJ').bindings;c=bindingsAPI.rebind(c,'keyboard','fire',2,'KeyH').bindings;c=bindingsAPI.rebind(c,'controller','fire',0,5).bindings;c=bindingsAPI.rebind(c,'controller','up',0,10).bindings;applyControlBindings(c);setInputDevice(device);qaReport()}
 document.querySelector('#intro-qa-keys').onclick=()=>qaBindings('keyboard');document.querySelector('#intro-qa-pad').onclick=()=>qaBindings('controller');document.querySelector('#intro-qa-large').onclick=()=>{uiText.set(uiText.value==='large'?'standard':'large');qaReport()};document.querySelector('#intro-qa-draw').onclick=()=>{fitCanvas();qaReport()};
 function qaSteps(seconds){introQaAdvancing=true;try{for(let i=0;i<Math.ceil(seconds*120);i++)update(1/120)}finally{introQaAdvancing=false}}
 function qaUntil(predicate,max){for(let i=0;i<max*120&&!predicate();i++)qaSteps(1/120);if(!predicate())throw Error('Native objective did not complete: '+trainingController.lessonId)}
 function qaMove(action,seconds,precision=false){keys.add(controlBindings.keyboard[action][0]);if(precision)keys.add(controlBindings.keyboard.precision[0]);qaSteps(seconds);keys.clear()}
 document.querySelector('#intro-qa-run').hidden=!window.STARFIGHTER_TRAINING_SANDBOX;
 document.querySelector('#intro-qa-run').onclick=()=>{try{
  trainingController.start({course:'intro'});qaMove('down',.4);qaMove('up',.35,true);if(!trainingController.canContinue)throw Error('Flight gate');trainingController.advance();
  fire(0);qaSteps(.1);fire(1);if(!trainingController.canContinue)throw Error('Fire gate');trainingController.advance();
  keys.add(controlBindings.keyboard.right[0]);qaUntil(()=>trainingController.canContinue,3);keys.clear();trainingController.advance();
  togglePod();qaUntil(()=>trainingSession.observed.has('mountBlock'),8);togglePod();qaUntil(()=>trainingController.canContinue,5);trainingController.advance();
  fire(0);qaUntil(()=>trainingSession.observed.has('armorHit'),3);qaUntil(()=>miniBoss.weakOpen,1);
  const target=worldWeakNode(miniBoss,activeWeakNodes(miniBoss).find(n=>!n.destroyed));keys.add(controlBindings.keyboard[player.y<target.y?'down':'up'][0]);qaUntil(()=>Math.abs(player.y-target.y)<4,2);keys.clear();qaSteps(.2);fire(0);qaUntil(()=>trainingController.canContinue,3);
  qaReport('PASS / FIVE NATIVE DRILLS / RECAP READY / NO CAMPAIGN REWARDS');
 }catch(e){qaReport('FAIL / '+e.message)}};
 qaReport();
'''
end=source.rfind('})();');assert end>=0
source=source[:end]+f'const QA_HASH={digest!r};\n'+private+source[end:]
(r/'artifacts/first-flight-review-game.js').write_text(source,encoding='utf-8')

style='''<style>body{height:100vh;padding-top:40px}#game-shell{width:min(100vw,calc((100vh - 40px)*16/9));max-height:calc(100vh - 40px)}#intro-qa-tools{position:fixed;top:0;left:0;right:0;z-index:5000;padding:5px;background:#071522;color:#d6ecf6;font:10px system-ui;display:flex;gap:5px;flex-wrap:wrap;align-items:center}#intro-qa-tools button{font:700 9px system-ui;letter-spacing:0;padding:4px 6px;border:1px solid #46778e;color:#d6ecf6;background:#123042}#intro-qa-status{color:#f7d886}</style>'''
storage='''<script>const introReviewMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>introReviewMemory.get(String(k))??null,setItem:(k,v)=>introReviewMemory.set(String(k),String(v)),removeItem:k=>introReviewMemory.delete(String(k)),clear:()=>introReviewMemory.clear(),key:n=>Array.from(introReviewMemory.keys())[n]??null,get length(){return introReviewMemory.size}}});</script>'''
for name,child in [('intro-garage-review.html',False),('first-flight-review.html',True)]:
 html=(r/('flight-school.html' if child else 'index.html')).read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1).replace('</head>',style+'</head>',1)
 html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/first-flight-review-game.js?v={version}"></script>',html)
 if not child:html=html.replace('<body>','<body>'+storage,1)
 (r/'artifacts'/name).write_text(html,encoding='utf-8')
print(f'Built memory-only intro/Garage review v{version}; source {digest}. Native drill fixture, not a real controller or balance test.')
