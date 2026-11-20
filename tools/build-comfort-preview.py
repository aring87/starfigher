"""Private audio/text/loss review. Explicit controls, no real pilot storage."""
from pathlib import Path
import re

root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
source=source.replace('function update(dt){','function update(dt){if(comfortFrozen)return;',1)
controls=r'''
  let comfortFrozen=true;
  const comfortStatus=document.querySelector('#comfort-status');
  profile.progress.onboardingSeen=[...ONBOARDING_IDS];
  for(let i=0;i<32;i++){
    const item=generateGear(i%5,1,'',{source:'PRIVATE QA ASTERPRINT'});item.id='comfort-'+i;item.slot=gearSlots[i%4];
    if(item.slot==='weapon'){item.gunVariant=i%2?'arc':'siege';item.trait=null}else{item.gunVariant=null;item.trait=gearTraits[item.slot][0].id}
    garage.inventory.push(normalizeGearItem(item));if(i<4)garage.equipped[item.slot]=item.id;
  }
  function comfortLoss(){
    start('story');wave=5;beginStage(false);miniBossSpawned=true;t=84;stagePostEliteClock=36;
    for(const desired of ['precisionRelay','coreSurge','bitReclaimer']){
      let offered;for(let seed=0;seed<1000;seed++){offered=runRewards.offerPerks(runProgression,runProgression.perks.length+1,'comfort-'+seed);if(offered.offer.includes(desired))break}
      runProgression=runRewards.choosePerk(offered,offered.pendingWave,desired);
    }
    applyRunPerks();beginApexArrival();player.inv=0;player.evade=0;player.hp=1;player.shield=0;player.ablativeReady=player.secondChanceReady=false;
    damage(1,{kind:document.querySelector('#comfort-cause').value==='toxin'?'toxin':'projectile',pressureLance:true,piercing:true});
    comfortStatus.textContent='Private Story5 apex loss. Three run perks + recorded build; retry should bypass field. Temporary pilot only.';draw();
  }
  document.querySelector('#comfort-menu').onclick=()=>{goMenu();comfortStatus.textContent='Private menu. Open Flight Manual to change text size.'};
  document.querySelector('#comfort-garage').onclick=()=>{openGarage();comfortStatus.textContent='Private Garage with32rolleditems. Test each column and expanded details.'};
  document.querySelector('#comfort-loss').onclick=comfortLoss;
  document.querySelector('#comfort-step').onclick=()=>{comfortFrozen=false;for(let i=0;i<120&&state==='playing';i++)update(1/120);comfortFrozen=true;draw();comfortStatus.textContent=`${state.toUpperCase()} / MISSION ${wave} / PERKS ${runProgression.perks.length} / APEX ARRIVAL ${stageApexIntro.toFixed(2)} / BOSS ${boss?.def.name||'PENDING'}`};
  document.querySelector('#comfort-audio').onclick=()=>{sfx.setMuted(false);const methods=['podBlock','armorHit','coreHit','shield','hurt','weakBreak'];methods.forEach((method,index)=>setTimeout(()=>sfx[method](),index*900));comfortStatus.textContent='Sound order: Force block → armor hit → exposed core hit → shield loss → hull hit → core break.'};
  document.querySelector('#comfort-hide').onclick=()=>{document.querySelector('#comfort-panel').style.display='none';fitCanvas();draw()};
  renderRunMenu();
'''
end=source.rfind('})();')
assert end>=0
(root/'artifacts/comfort-preview-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/comfort-preview-game.js?v=152"></script>',html)
storage='''<script>const comfortMemory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>comfortMemory.get(String(k))??null,setItem:(k,v)=>comfortMemory.set(String(k),String(v)),removeItem:k=>comfortMemory.delete(String(k)),clear:()=>comfortMemory.clear(),key:n=>Array.from(comfortMemory.keys())[n]??null,get length(){return comfortMemory.size}}});</script>'''
panel='''<aside id="comfort-panel" style="position:relative;z-index:9999;padding:6px;background:#071522;color:#cceaff;font:11px monospace;display:flex;flex-wrap:wrap;gap:5px;align-items:center"><b>PRIVATE COMFORT REVIEW / TEMPORARY PILOT</b><button id="comfort-menu">PRIVATE MENU</button><button id="comfort-garage">32-ITEM GARAGE</button><label>Loss <select id="comfort-cause"><option value="lance">Amber lance</option><option value="toxin">Ritual toxin</option></select></label><button id="comfort-loss">STORY5 BOSS LOSS</button><button id="comfort-step">STEP 1 SECOND</button><button id="comfort-audio">AUDITION CUES</button><button id="comfort-hide">HIDE QA</button><output id="comfort-status" style="flex-basis:100%;color:#ffd166">Private menu. Use Flight Manual for Standard / Large text.</output></aside>'''
html=html.replace('<body>','<body>'+storage+panel,1)
(root/'artifacts/comfort-preview.html').write_text(html,encoding='utf-8')
print('Built private comfort preview:32gear, text settings, recorded boss retry and cue audition.')
