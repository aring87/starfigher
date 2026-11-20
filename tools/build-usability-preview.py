"""Private native menus, text sizes and simulated controller review."""
from pathlib import Path
import hashlib
import re

root=Path(__file__).resolve().parent.parent
source_path=root/'game.js'
source=source_path.read_text(encoding='utf-8')
source_hash=hashlib.sha256(source_path.read_bytes()).hexdigest()
version=int(re.search(r'game.js\?v=(\d+)',(root/'index.html').read_text(encoding='utf-8'))[1])

storage='''<script>const usabilityMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>usabilityMemory.get(String(k))??null,setItem:(k,v)=>usabilityMemory.set(String(k),String(v)),removeItem:k=>usabilityMemory.delete(String(k)),clear:()=>usabilityMemory.clear(),key:n=>Array.from(usabilityMemory.keys())[n]??null,get length(){return usabilityMemory.size}}});</script>'''

controls=r'''
  const usabilityPanel=document.querySelector('#usability-panel'),usabilityOutput=document.querySelector('#usability-report'),usabilityPadPanel=document.querySelector('#usability-pad');
  const usabilityPad={index:0,id:'PRIVATE SIMULATED STANDARD PAD',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(window.navigator,'getGamepads',{configurable:true,value:()=>[usabilityPad]});
  profile.progress.onboardingSeen=[...ONBOARDING_IDS];profile.progress.missionsCleared=Array(10).fill(true);profile.progress.normalBossesDefeated=Array(10).fill(true);
  garage.inventory=[];garage.equipped=Object.fromEntries(gearSlots.map(slot=>[slot,null]));
  for(let i=0;i<32;i++){
    const slot=gearSlots[i%4],item=generateGear(2,1,'',{source:'PRIVATE UI ASTERPRINT'});item.id='usability-'+slot+'-'+Math.floor(i/4);item.slot=slot;item.alignment=gearAlignments[Math.floor(i/4)%gearAlignments.length];
    if(slot==='weapon'){item.gunVariant=Math.floor(i/4)%2?'arc':'siege';item.trait=null}else{item.gunVariant=null;item.trait=gearTraits[slot][Math.floor(i/4)%gearTraits[slot].length].id}
    garage.inventory.push(normalizeGearItem(item));if(i<4)garage.equipped[slot]=item.id;
  }
  function usabilityLayout(){document.documentElement.style.setProperty('--usability-tools',usabilityPanel.getBoundingClientRect().height+'px');fitCanvas();draw()}
  function usabilityReport(){
    const active=document.activeElement;
    const report={version:USABILITY_VERSION,sourceSha256:USABILITY_HASH,state,mode:runMode,dev:bossLab,inputDevice,textSize:uiText.value,
      focus:{id:active?.id||null,text:active?.textContent?.trim().slice(0,100)||null,tag:active?.tagName||null},controlsOpen:!!document.querySelector('#controls-dialog').open,
      hull:player.hp,maxHull:player.maxHp,shields:player.shield,items:garage.inventory.length,slotCounts:Object.fromEntries(gearSlots.map(slot=>[slot,garage.inventory.filter(item=>item.slot===slot).length])),
      limits:'Private temporary pilot and explicit 32-item/unlocked-mission fixtures; frozen simulation; browser-standard pad is simulated, not a physical-device or campaign-balance claim.'};
    usabilityOutput.value=JSON.stringify(report,null,2);document.querySelector('#usability-status').textContent=`${state.toUpperCase()} / ${uiText.value.toUpperCase()} TEXT / ${inputDevice.toUpperCase()} / FOCUS ${active?.id||active?.tagName||'NONE'} / ${garage.inventory.length} ITEMS / FROZEN TEMPORARY PILOT`;
    return report;
  }
  function usabilityPlacePad(){
    const host=document.querySelector('#controls-dialog').open?document.querySelector('#controls-dialog'):document.querySelector('#flight-deck').open?document.querySelector('#flight-deck'):null;
    if(host){if(usabilityPadPanel.parentElement!==host)host.insertBefore(usabilityPadPanel,host.firstChild);usabilityPadPanel.dataset.modal='true'}
    else{if(usabilityPadPanel.parentElement!==document.querySelector('#usability-pad-slot'))document.querySelector('#usability-pad-slot').appendChild(usabilityPadPanel);usabilityPadPanel.dataset.modal='false'}
    usabilityLayout();usabilityReport();
  }
  function usabilityFixture(kind){
    if(kind==='menu')goMenu();
    if(kind==='garage'){goMenu();openGarage()}
    if(kind==='pause'){start('story');stageIntro=0;stageCue=null;pause()}
    if(kind==='briefing'){goMenu();openMissionBriefing('story',1,'menu')}
    if(kind==='controls')openControls();
    clearInput();pauseMusic();usabilityPlacePad();
  }
  for(const button of usabilityPanel.querySelectorAll('[data-usability-fixture]'))button.onclick=()=>usabilityFixture(button.dataset.usabilityFixture);
  for(const button of usabilityPanel.querySelectorAll('[data-usability-text]'))button.onclick=()=>{uiText.set(button.dataset.usabilityText);usabilityLayout();usabilityReport()};
  document.querySelector('#usability-show-report').onclick=()=>{usabilityOutput.hidden=!usabilityOutput.hidden;usabilityReport();usabilityLayout()};
  document.querySelector('#usability-proof').onclick=()=>{usabilityPlacePad();usabilityLayout();usabilityReport()};
  const usabilityPadIndices={up:12,down:13,left:14,right:15,confirm:0,back:1};
  let usabilityPollTime=1000;
  usabilityPadPanel.addEventListener('mousedown',event=>event.preventDefault());
  usabilityPadPanel.addEventListener('click',event=>{
    const action=event.target.dataset.usabilityPad;if(!action)return;
    setInputDevice('controller');usabilityPad.buttons.forEach((_,i)=>usabilityPad.buttons[i]={pressed:false,value:0});usabilityPad.axes=[0,0,0,0];pollController(usabilityPollTime+=400);
    if(action==='focus')focusMenuControl(null,true);else{usabilityPad.buttons[usabilityPadIndices[action]]={pressed:true,value:1};pollController(usabilityPollTime+=1);usabilityPad.buttons[usabilityPadIndices[action]]={pressed:false,value:0};pollController(usabilityPollTime+=1)}
    usabilityPlacePad();
  });
  document.addEventListener('click',usabilityPlacePad);document.querySelector('#controls-dialog').addEventListener('close',usabilityPlacePad);document.querySelector('#flight-deck').addEventListener('close',usabilityPlacePad);addEventListener('resize',usabilityLayout);
  setInterval(usabilityReport,250);usabilityFixture('garage');
'''

assert source.count('function update(dt){')==1
source=source.replace('function update(dt){','function update(dt){return; // Frozen private menu usability review.\n',1)
end=source.rfind('})();');assert end>=0
declarations=f'const USABILITY_VERSION={version},USABILITY_HASH={source_hash!r};\n'
(root/'artifacts/usability-preview-game.js').write_text(source[:end]+declarations+controls+source[end:],encoding='utf-8')

# QA pad spans expose button roles to browser automation, but are intentionally
# outside production's button/input/tabindex navigation targets. They must not
# become controller focus destinations when attached inside a native dialog.
pad='''<div id="usability-pad" class="usability-pad"><b>SIMULATED PAD</b><span role="button" data-usability-pad="focus">FOCUS SCREEN</span><span role="button" data-usability-pad="up">PAD UP</span><span role="button" data-usability-pad="down">PAD DOWN</span><span role="button" data-usability-pad="left">PAD LEFT</span><span role="button" data-usability-pad="right">PAD RIGHT</span><span role="button" data-usability-pad="confirm">PAD CONFIRM</span><span role="button" data-usability-pad="back">PAD BACK</span></div>'''
panel='''<aside id="usability-panel"><div class="usability-actions"><b>PRIVATE USABILITY REVIEW</b><button data-usability-fixture="menu">MENU FIXTURE</button><button data-usability-fixture="garage">GARAGE 32</button><button data-usability-fixture="pause">PAUSED FIXTURE</button><button data-usability-fixture="briefing">BRIEFING FIXTURE</button><button data-usability-fixture="controls">CONTROLS FIXTURE</button><button data-usability-text="standard">STANDARD TEXT</button><button data-usability-text="large">LARGE TEXT</button><button id="usability-show-report">SHOW REPORT</button><button id="usability-proof">REDRAW PROOF</button></div><div id="usability-pad-slot">'''+pad+'''</div><output id="usability-status"></output><textarea id="usability-report" aria-label="Private usability report" readonly hidden></textarea></aside>'''
style='''<style>body{height:100vh;padding-top:var(--usability-tools,95px)}#game-shell{width:min(100vw,calc((100vh - var(--usability-tools,95px))*16/9));max-height:calc(100vh - var(--usability-tools,95px))}#usability-panel{position:fixed;top:0;left:0;width:100%;z-index:2000;box-sizing:border-box;padding:5px;background:#071522;color:#d6ecf6;font:10px system-ui}#usability-panel b,.usability-pad b{color:#8debf1}.usability-actions,.usability-pad{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:3px 0}.usability-actions button,.usability-pad [role=button]{font:700 9px system-ui;letter-spacing:0;padding:4px 6px;border:1px solid #46778e;color:#d6ecf6;background:#123042;cursor:pointer}.usability-pad{box-sizing:border-box;background:#071522;padding:3px;color:#d6ecf6;font:10px system-ui}.usability-pad[data-modal=true]{position:sticky;top:0;z-index:10;margin:0 0 10px;box-shadow:0 5px 10px #0008}#usability-status{display:block;color:#f7d886;line-height:1.35}#usability-report{width:98%;height:130px;font:10px monospace;color:#d6ecf6;background:#0a1822}</style>'''
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1).replace('</head>',style+'</head>',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/usability-preview-game.js?v={version}"></script>',html)
html=html.replace('<body>','<body>'+storage+panel,1)
(root/'artifacts/usability-preview.html').write_text(html,encoding='utf-8')
print(f'Built isolated usability review v{version}; source {source_hash}. Temporary pilot, frozen simulation, simulated pad.')
