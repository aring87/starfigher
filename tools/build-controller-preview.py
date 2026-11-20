"""Browser QA for real controls UI with a disposable pilot and simulated pad."""
from pathlib import Path
import runpy
root=Path(__file__).resolve().parent.parent
runpy.run_path(str(root/'tools/build-build-clarity-preview.py'))
source=(root/'artifacts/build-clarity-qa-game.js').read_text(encoding='utf-8')
controls=r'''
  const qaPad={index:0,id:'PRIVATE SIMULATED STANDARD PAD',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};let qaPadConnected=false;
  Object.defineProperty(window.navigator,'getGamepads',{configurable:true,value:()=>qaPadConnected?[qaPad]:[]});
  const qaPadPanel=document.createElement('aside');qaPadPanel.id='qa-pad-panel';qaPadPanel.style.cssText='display:flex;gap:5px;flex-wrap:wrap;padding:7px;background:#142334;border:1px solid #4d7088;color:#d9edff;font:10px monospace';
  qaPadPanel.innerHTML='<b>PRIVATE PAD SIMULATOR</b><button id="qa-pad-connect">CONNECT</button><button id="qa-pad-disconnect">DISCONNECT</button><select id="qa-pad-index" aria-label="Simulated pad button"></select><button id="qa-pad-press">PRESS</button><button id="qa-pad-tap">TAP</button><button id="qa-pad-release">RELEASE ALL</button><button id="qa-pad-right">STICK RIGHT</button><button id="qa-pad-stop">STICK CENTER</button><button id="qa-pad-fly">FLIGHT TEST</button>';
  for(let i=0;i<16;i++){const option=document.createElement('option');option.value=i;option.textContent=bindingsAPI.labelButton(i);qaPadPanel.querySelector('select').appendChild(option)}
  const release=()=>{qaPad.buttons.forEach((_,i)=>qaPad.buttons[i]={pressed:false,value:0});qaPad.axes=[0,0,0,0]};
  qaPadPanel.querySelector('#qa-pad-connect').onclick=()=>{release();qaPadConnected=true};qaPadPanel.querySelector('#qa-pad-disconnect').onclick=()=>{qaPadConnected=false};
  qaPadPanel.querySelector('#qa-pad-press').onclick=()=>{const i=Number(qaPadPanel.querySelector('select').value);qaPad.buttons[i]={pressed:true,value:1}};
  qaPadPanel.querySelector('#qa-pad-tap').onclick=()=>{const i=Number(qaPadPanel.querySelector('select').value);qaPad.buttons[i]={pressed:true,value:1};setTimeout(()=>{qaPad.buttons[i]={pressed:false,value:0}},100)};
  qaPadPanel.querySelector('#qa-pad-fly').onclick=()=>{release();start('story');player.inv=60;player.pod.owned=true;player.laserColor='red';player.laserLevel=1};
  qaPadPanel.querySelector('#qa-pad-release').onclick=release;qaPadPanel.querySelector('#qa-pad-right').onclick=()=>{qaPad.axes=[.5,0,0,0]};qaPadPanel.querySelector('#qa-pad-stop').onclick=()=>{qaPad.axes=[0,0,0,0]};
  qaPadPanel.addEventListener('mousedown',event=>event.preventDefault());
  function qaPlacePadPanel(){const host=$('#controls-dialog');if(host.open){if(qaPadPanel.parentElement!==host)host.appendChild(qaPadPanel);qaPadPanel.style.position='static'}else{if(qaPadPanel.parentElement!==document.body)document.body.appendChild(qaPadPanel);qaPadPanel.style.position='fixed';qaPadPanel.style.bottom='2px';qaPadPanel.style.left='2px';qaPadPanel.style.zIndex='2600'}}
  document.addEventListener('click',qaPlacePadPanel);$('#controls-dialog').addEventListener('close',qaPlacePadPanel);qaPlacePadPanel();
'''
end=source.rfind('})();');assert end>=0
(root/'artifacts/controller-qa-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'artifacts/build-clarity-qa.html').read_text(encoding='utf-8').replace('artifacts/build-clarity-qa-game.js','artifacts/controller-qa-game.js')
(root/'artifacts/controller-qa.html').write_text(html,encoding='utf-8')
print('Built private keyboard/controller UI review. No real pilot or physical pad used.')
