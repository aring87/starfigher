/* A separate practice document owns its own temporary storage. Only sound, display
 * and input preferences are copied; no pilot, equipment or checkpoint enters it. */
(() => {
  'use strict';
  const memory=new Map();
  for(const key of ['starfighterMuted','starfighterMusicVolume','starfighterSfxVolume','starfighterReducedMotion','starfighterClearCombat','starfighterCollisionGuide','starfighterControls','starfighterUiText']){
    try{const value=window.localStorage.getItem(key);if(value!==null)memory.set(key,value)}catch{}
  }
  // Session-only audio preferences work even when persistent storage is blocked.
  if(typeof URLSearchParams==='function'&&window.location){
    const params=new URLSearchParams(window.location.search);
    window.STARFIGHTER_INPUT_DEVICE=params.get('device')==='controller'?'controller':'keyboard';
    if(params.has('controls')&&params.get('controls').length<=4096)memory.set('starfighterControls',params.get('controls'));
    if(params.has('muted'))memory.set('starfighterMuted',String(params.get('muted')==='1'));
    if(['standard','large'].includes(params.get('text')))memory.set('starfighterUiText',params.get('text'));
    for(const[param,key]of [['music','starfighterMusicVolume'],['sfx','starfighterSfxVolume']])if(params.has(param)){
      const value=Number(params.get(param));if(Number.isFinite(value))memory.set(key,String(Math.max(0,Math.min(1,value))))
    }
  }
  Object.defineProperty(window,'localStorage',{value:{getItem:key=>memory.get(String(key))??null,setItem:(key,value)=>memory.set(String(key),String(value)),removeItem:key=>memory.delete(String(key)),clear:()=>memory.clear(),key:index=>Array.from(memory.keys())[index]??null,get length(){return memory.size}}});
  window.STARFIGHTER_TRAINING_SANDBOX=true;
})();
