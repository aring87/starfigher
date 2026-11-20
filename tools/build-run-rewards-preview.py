"""Private browser review of the production run-reward flow; memory storage only."""
from pathlib import Path
import re, runpy
root=Path(__file__).resolve().parent.parent
runpy.run_path(str(root/'tools/build-controller-preview.py'))
source=(root/'artifacts/controller-qa-game.js').read_text(encoding='utf-8')
controls=r'''
  const qaStatus=document.createElement('output');qaStatus.id='qa-run-status';qaStatus.style.cssText='position:fixed;left:2px;top:2px;z-index:2550;color:#9ab8c8;background:#07111fee;font:10px monospace;padding:5px;max-width:410px';document.body.appendChild(qaStatus);
  function qaRunStatus(){qaStatus.textContent=JSON.stringify({state,ruleset:runRuleset,wave,perks:runProgression?.perks,pending:runProgression?.pending,hp:player?.hp,shield:player?.shield,dose:player?.dose,checkpointValid:!!validateRunCheckpoint(profile.checkpoint)});}
  setInterval(qaRunStatus,150);
  const qaStart=()=>{start('story');player.inv=600;player.pod.owned=true;player.laserColor='red';player.laserLevel=1;player.bits=1;};
  $('#qa-build-module').textContent='RECOVERY';$('#qa-build-module').onclick=()=>{qaStart();player.hp=1;player.shield=1;player.dose=94;presentTacticalRetrofit(()=>{})};
  const qaApex=(label,next)=>{queueRunDoctrine(label,next,0);victoryDelay.run();victoryDelay=null;hud()};
  $('#qa-build-doctrine').textContent='PERK DRAFT';$('#qa-build-doctrine').onclick=()=>{qaStart();qaApex('PRIVATE APEX CLEAR',2)};
  function qaButton(id,label,action){const b=document.createElement('button');b.id=id;b.textContent=label;b.onclick=action;buildQaPanel.appendChild(b);}
  qaButton('qa-full-recovery','FULL RECOVERY',()=>{qaStart();player.shield=4;player.dose=100;presentTacticalRetrofit(()=>{})});
  qaButton('qa-replace-perk','THREE SLOTS',()=>{qaStart();wave=4;runProgression=runRewards.validate({...runRewards.fresh(),perks:['precisionRelay','coreSurge','deltaReserve']});applyRunPerks();qaApex('PRIVATE FOURTH APEX',5)});
  qaButton('qa-final-build','FINAL BUILD',()=>{qaStart();wave=10;runProgression=runRewards.validate({...runRewards.fresh(),perks:['precisionRelay','secondChance','deltaReserve']});applyRunPerks();queueRunDoctrine('PRIVATE FINAL APEX',11,0);victoryDelay.run();victoryDelay=null});
  qaButton('qa-reload-reward','RESTORE SAVE',()=>{loadGame();player.inv=600});
  const qaHide=document.createElement('button');qaHide.id='qa-toggle-panels';qaHide.textContent='QA';qaHide.style.cssText='position:fixed;right:2px;bottom:2px;z-index:2700;font:9px monospace;background:#08121f;color:#7193a6;border:0';document.body.appendChild(qaHide);let qaPanelsHidden=false;qaHide.onclick=()=>{qaPanelsHidden=!qaPanelsHidden;for(const panel of[buildQaPanel,qaPadPanel,qaStatus])panel.style.visibility=qaPanelsHidden?'hidden':'visible'};
  qaRunStatus();
'''
end=source.rfind('})();');assert end>=0
(root/'artifacts/run-rewards-qa-game.js').write_text(source[:end]+controls+source[end:],encoding='utf-8')
html=(root/'artifacts/controller-qa.html').read_text(encoding='utf-8').replace('artifacts/controller-qa-game.js','artifacts/run-rewards-qa-game.js')
(root/'artifacts/run-rewards-qa.html').write_text(html,encoding='utf-8')
print('Built isolated run reward review and standard-pad controls. Real pilot storage untouched.')
