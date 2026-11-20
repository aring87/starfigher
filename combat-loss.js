/* One concise explanation for the hit that removed hull. Presentation only. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterCombatLoss=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const message=(key,label,tip)=>Object.freeze({key,label,tip});
  function describe(source={}){
    if(!source||typeof source!=='object')source={};
    if(source.kind==='toxin')return message('toxin','RITUAL TOXIN','Destroy the bright active guardian before the timer expires to protect the next phase.');
    if(source.kind==='beam')return message('beam','BOSS BEAM','Leave the beam lane during its charge. Hydra’s middle head powers its beam.');
    if(source.kind==='contact')return message('contact',source.boss?'BOSS COLLISION':'ENEMY COLLISION','Keep clear of the enemy hull. Use precision flight to move through a clear lane.');
    if(source.kind==='hazard'){
      if(source.hazardType==='well')return message('gravity','GRAVITY WELL','Move around the well’s center and correct your flight as it pulls you.');
      if(source.hazardType==='beam')return message('hazard-beam','ENVIRONMENT BEAM','Leave the marked lane before the beam activates.');
      if(source.hazardType==='gate')return message('gate','SECTOR HAZARD','Move into the opening before the barrier reaches the fighter.');
      return message('debris',source.mine?'DRIFTING MINE':'FLYING DEBRIS','Shoot debris or ram it with the Force Pod. Keep the fighter’s hull clear.');
    }
    if(source.kind==='projectile'){
      if(source.pressureLance)return message('lance','AMBER LANCE','Reposition when the amber charge locks on. Amber fire passes through the Force Pod and Bits.');
      if(source.wall)return message('wall','AMBER WALL','Move into the wall’s open gap. The Force Pod and Bits cannot stop amber fire.');
      if(source.piercing)return message('piercing','PIERCING SHOT','Evade amber fire; it passes through the Force Pod and Defense Bits.');
      if(source.homing)return message('tracking','TRACKING SHOT','Change lanes to evade tracking fire. The Force Pod and Bits can block pink shots.');
      return message('shot','HOSTILE SHOT','Block pink shots with the Force Pod or Defense Bits, or move through an open lane.');
    }
    return message('unknown','HULL DAMAGE','Use precision flight for small corrections and watch for an open lane.');
  }
  return Object.freeze({version:1,describe});
});
