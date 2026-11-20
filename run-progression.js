/* Versioned run rewards. Pure decisions only; the game owns combat resources,
 * equipment, UI and persistence. Existing classic checkpoints use their own rules.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterRunProgression=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  const ruleset='streamlined-v1';
  const policy=freeze({version:1,maxPerks:3,offerSize:3,maxWave:10,maxRewards:30});
  const catalogue=freeze([
    {id:'precisionRelay',name:'Precision Relay',description:'Breaking a boss core generates 6% DOSE.'},
    {id:'coreSurge',name:'Core Surge',description:'Breaking a boss core grants a four-second Surge: +6% movement and charge speed.'},
    {id:'bitReclaimer',name:'Bit Reclaimer',description:'Each hostile shot blocked by a defense Bit generates 0.4% DOSE.'},
    {id:'secondChance',name:'Second Chance',description:'Once each mission, survive a lethal ordinary hull hit with one hull.'},
    {id:'fieldNanites',name:'Field Nanites',description:'After defeating an apex, repair one hull, up to maximum hull.'},
    {id:'deltaReserve',name:'Delta Reserve',description:'Surplus kit pickups generate 5% DOSE instead of 2%.'}
  ]);
  const known=new Set(catalogue.map(perk=>perk.id));
  const fields=['version','perks','offer','pending','pendingWave','rewards'];
  const rewardPattern=/^(?:service|perk|apexRepair):(?:[1-9]|10)$/;
  function waveNumber(wave){if(!Number.isInteger(wave)||wave<1||wave>policy.maxWave)throw new RangeError('Choose a mission from 1 to 10.');return wave}
  function perkList(value,max=policy.maxPerks){
    if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length)return null;
    for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i)||!known.has(value[i]))return null;
    return [...value];
  }
  function fresh(){return freeze({version:1,perks:[],offer:[],pending:null,pendingWave:null,rewards:[]})}
  function validate(raw){
    try{
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1)return null;
      const keys=Object.keys(raw);if(keys.length!==fields.length||keys.some(key=>!fields.includes(key)))return null;
      const perks=perkList(raw.perks),offer=perkList(raw.offer,policy.offerSize);if(!perks||!offer||offer.some(id=>perks.includes(id)))return null;
      if(!Array.isArray(raw.rewards)||raw.rewards.length>policy.maxRewards||new Set(raw.rewards).size!==raw.rewards.length)return null;
      for(let i=0;i<raw.rewards.length;i++)if(!Object.hasOwn(raw.rewards,i)||typeof raw.rewards[i]!=='string'||!rewardPattern.test(raw.rewards[i]))return null;
      if(![null,'perk','service'].includes(raw.pending))return null;
      if(raw.pending===null){if(raw.pendingWave!==null||offer.length)return null}
      else{
        waveNumber(raw.pendingWave);
        if(raw.rewards.includes(raw.pending+':'+raw.pendingWave))return null;
        if(raw.pending==='perk'?offer.length!==policy.offerSize:offer.length!==0)return null;
      }
      return freeze({version:1,perks,offer,pending:raw.pending,pendingWave:raw.pendingWave,rewards:[...raw.rewards]});
    }catch{return null}
  }
  function stateValue(raw){const state=validate(raw);if(!state)throw new RangeError('Invalid run reward state.');return state}
  function mutable(state){return{...state,perks:[...state.perks],offer:[...state.offer],rewards:[...state.rewards]}}
  function perkId(id){if(!known.has(id))throw new RangeError('Unknown run perk: '+String(id)+'.');return id}
  function pendingReward(state,type,wave){if(state.pending!==type||state.pendingWave!==wave)throw new RangeError('That reward is not pending for this mission.')}
  function finish(state,type,wave){const next=mutable(state);next.rewards.push(type+':'+wave);next.pending=null;next.pendingWave=null;next.offer=[];return next}
  function randomFor(seed,wave){
    if(seed!==undefined&&seed!==null&&!(typeof seed==='string'||typeof seed==='number'&&Number.isFinite(seed)))throw new RangeError('A draft seed must be a string or finite number.');
    let state=2166136261;for(const char of String(seed??0)+'|'+wave){state^=char.charCodeAt(0);state=Math.imul(state,16777619)}
    return()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296};
  }
  function offerPerks(raw,wave,seed){
    const state=stateValue(raw);waveNumber(wave);
    if(state.rewards.includes('perk:'+wave))return state;
    if(state.pending==='perk'&&state.pendingWave===wave)return state;
    if(state.pending!==null)throw new RangeError('Finish the pending reward before opening another.');
    const pool=catalogue.map(perk=>perk.id).filter(id=>!state.perks.includes(id)),random=randomFor(seed,wave);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
    return freeze({...state,offer:pool.slice(0,policy.offerSize),pending:'perk',pendingWave:wave});
  }
  function offerService(raw,wave){
    const state=stateValue(raw);waveNumber(wave);
    if(state.rewards.includes('service:'+wave))return state;
    if(state.pending==='service'&&state.pendingWave===wave)return state;
    if(state.pending!==null)throw new RangeError('Finish the pending reward before opening another.');
    return freeze({...state,pending:'service',pendingWave:wave});
  }
  function choosePerk(raw,wave,newId,replaceId){
    const state=stateValue(raw);waveNumber(wave);perkId(newId);if(replaceId!==undefined&&replaceId!==null)perkId(replaceId);
    if(state.rewards.includes('perk:'+wave))return state;
    pendingReward(state,'perk',wave);
    if(!state.offer.includes(newId)||state.perks.includes(newId))throw new RangeError('Choose an unowned perk from this offer.');
    const next=finish(state,'perk',wave);
    if(replaceId!==undefined&&replaceId!==null){const index=next.perks.indexOf(replaceId);if(index<0)throw new RangeError('Choose one of your active perks to replace.');next.perks[index]=newId}
    else{if(next.perks.length>=policy.maxPerks)throw new RangeError('Three perks are active. Choose one to replace.');next.perks.push(newId)}
    return freeze(next);
  }
  function skipPerk(raw,wave){const state=stateValue(raw);waveNumber(wave);if(state.rewards.includes('perk:'+wave))return state;pendingReward(state,'perk',wave);return freeze(finish(state,'perk',wave))}
  function finishService(raw,wave){const state=stateValue(raw);waveNumber(wave);if(state.rewards.includes('service:'+wave))return state;pendingReward(state,'service',wave);return freeze(finish(state,'service',wave))}
  function consumeApexRepair(raw,wave){
    const state=stateValue(raw);waveNumber(wave);
    if(!state.perks.includes('fieldNanites')||state.rewards.includes('apexRepair:'+wave))return freeze({state,repair:false});
    const next=mutable(state);next.rewards.push('apexRepair:'+wave);return freeze({state:freeze(next),repair:true});
  }
  function effectConfig(perks){
    const selected=perkList(perks);if(!selected)throw new RangeError('Choose at most three unique known run perks.');
    return freeze({weakBreakDose:selected.includes('precisionRelay')?6:0,weakOverdrive:selected.includes('coreSurge')?4:0,bitDose:selected.includes('bitReclaimer')?.4:0,secondChance:selected.includes('secondChance'),repairOnApex:selected.includes('fieldNanites')?1:0,surplusDose:selected.includes('deltaReserve')?5:2});
  }
  return freeze({ruleset,policy,catalogue,fresh,validate,offerPerks,offerService,choosePerk,skipPerk,finishService,consumeApexRepair,effectConfig});
});
