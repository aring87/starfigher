"""Native menu/retry QA with temporary storage and explicit simulated-pad controls."""
from pathlib import Path
import runpy

root=Path(__file__).resolve().parent.parent
runpy.run_path(str(root/'tools/build-comfort-preview.py'))
source=(root/'artifacts/comfort-preview-game.js').read_text(encoding='utf-8')
controls=r'''
  const navigationPad={index:0,id:'PRIVATE SIMULATED MENU PAD',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(window.navigator,'getGamepads',{configurable:true,value:()=>[navigationPad]});
  const navigationPanel=document.createElement('aside');navigationPanel.id='navigation-pad-panel';
  navigationPanel.style.cssText='display:flex;gap:4px;flex-wrap:wrap;padding:5px;background:#142334;border:1px solid #4d7088;color:#d9edff;font:10px monospace';
  navigationPanel.innerHTML='<b>PRIVATE SIMULATED PAD</b><button data-pad="focus">FOCUS SCREEN</button><button data-pad="up">PAD UP</button><button data-pad="down">PAD DOWN</button><button data-pad="left">PAD LEFT</button><button data-pad="right">PAD RIGHT</button><button data-pad="confirm">PAD CONFIRM</button><button data-pad="back">PAD BACK</button><output id="navigation-focus" style="flex-basis:100%"></output>';
  const indices={up:12,down:13,left:14,right:15,confirm:0,back:1};
  function navigationStatus(){const el=document.activeElement;navigationPanel.querySelector('output').textContent=`${state.toUpperCase()} / FOCUS: ${el?.id||el?.textContent?.trim().slice(0,70)||el?.tagName} / ${$('#game-shell').dataset.inputDevice}`}
  navigationPanel.addEventListener('mousedown',event=>event.preventDefault());
  navigationPanel.addEventListener('click',event=>{const action=event.target.dataset.pad;if(!action)return;setInputDevice('controller');if(action==='focus')focusMenuControl(null,true);else{pollController(performance.now());navigationPad.buttons[indices[action]]={pressed:true,value:1};pollController(performance.now());navigationPad.buttons[indices[action]]={pressed:false,value:0};pollController(performance.now())}navigationStatus()});
  function placeNavigationPanel(){const modal=$('#controls-dialog').open?$('#controls-dialog'):$('#flight-deck').open?$('#flight-deck'):null;if(modal){if(navigationPanel.parentElement!==modal)modal.appendChild(navigationPanel);navigationPanel.style.position='static'}else{if(navigationPanel.parentElement!==document.body)document.body.appendChild(navigationPanel);navigationPanel.style.position='fixed';navigationPanel.style.bottom='2px';navigationPanel.style.left='2px';navigationPanel.style.zIndex='2600'}navigationStatus()}
  document.addEventListener('click',placeNavigationPanel);$('#controls-dialog').addEventListener('close',placeNavigationPanel);$('#flight-deck').addEventListener('close',placeNavigationPanel);placeNavigationPanel();
'''
end=source.rfind('})();')
assert end>=0
(root/'artifacts/menu-navigation-preview-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'artifacts/comfort-preview.html').read_text(encoding='utf-8').replace('artifacts/comfort-preview-game.js','artifacts/menu-navigation-preview-game.js')
(root/'artifacts/menu-navigation-preview.html').write_text(html,encoding='utf-8')
print('Built private native menu/retry preview; real pilot storage is never read.')
