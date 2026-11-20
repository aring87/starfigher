"""Private onboarding review: production screens and hints, temporary pilot."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
controls=r'''
  const guideQaPanel=document.createElement('aside');guideQaPanel.style.cssText='position:fixed;top:2px;right:2px;z-index:2500;display:flex;gap:5px;padding:5px;background:#08121ff2;border:1px solid #418aa4;color:#dff8ff;font:10px monospace';
  guideQaPanel.innerHTML='<b>PRIVATE INTRO REVIEW</b><button id="qa-guide-pickup">PICKUP</button><button id="qa-guide-module">FIELD MODULE</button><button id="qa-guide-garage">ROUND GARAGE</button><button id="qa-guide-doctrine">DOCTRINE</button><button id="qa-guide-reset">RESET TIPS</button>';
  document.body.appendChild(guideQaPanel);for(const button of guideQaPanel.querySelectorAll('button'))button.style.cssText='background:#102638;border:1px solid #3d8aa3;color:#d9f8ff;padding:4px;font:10px monospace';
  function guideQaGear(){if(garage.inventory.length)return;const weapon=normalizeGearItem({...generateGear(1,1,'Practice Demo'),slot:'weapon',gunVariant:'siege'}),armor=normalizeGearItem({...generateGear(1,1,'Practice Demo'),slot:'armor',trait:'capacitor'});collectGear(weapon);collectGear(armor);bankRunLoot()}
  guideQaPanel.querySelector('#qa-guide-pickup').onclick=()=>{start('story');collectCombatPickup({type:'missile'})};
  guideQaPanel.querySelector('#qa-guide-module').onclick=()=>{start('story');guideQaGear();presentTacticalRetrofit(()=>{})};
  guideQaPanel.querySelector('#qa-guide-garage').onclick=()=>{if(!runActive||runMode!=='story')start('story');guideQaGear();if(state!=='upgrade')presentTacticalRetrofit(()=>{});openRoundGarage()};
  guideQaPanel.querySelector('#qa-guide-doctrine').onclick=()=>{start('story');presentBossDoctrine('FIRST APEX CLEARED',()=>{})};
  guideQaPanel.querySelector('#qa-guide-reset').onclick=()=>{profile.progress.onboardingSeen=[];onboardingController?.close();initializeOnboarding();goMenu()};
'''
end=source.rfind('})();');assert end>=0
(root/'artifacts/onboarding-qa-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/onboarding-qa-game.js?v=142"></script>',html)
storage='<script>const guideQaMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>guideQaMemory.get(k)??null,setItem:(k,v)=>guideQaMemory.set(k,String(v)),removeItem:k=>guideQaMemory.delete(k)}});</script>'
(root/'artifacts/onboarding-qa.html').write_text(html.replace('<body>','<body>'+storage,1),encoding='utf-8')
print('Built isolated First Flight and contextual-tip review.')
