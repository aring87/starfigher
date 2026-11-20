/* Replacement progression prototype. Not loaded by the live game.
 * Pure rules only: no DOM, storage, ambient randomness or mutable game globals.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.STARFIGHTER_FOUNDATION=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  function freeze(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      for(const item of Object.values(value))freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  function copy(value){
    if(Array.isArray(value))return value.map(copy);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copy(item)]));
    return value;
  }
  const slots=freeze(['weapon','armor','engine','pod']);
  const policy=freeze({prototype:true,maxActivePerks:3,missions:10,maxShields:4,
    futureElements:{enabled:false,ids:['neutral','heat','ion','cryo'],weakMultiplier:1.2,resistMultiplier:.85}});
  const rarities=freeze([
    {id:'common',name:'Common',rolls:1,floorFraction:0},
    {id:'uncommon',name:'Uncommon',rolls:2,floorFraction:.15},
    {id:'rare',name:'Rare',rolls:2,floorFraction:.25},
    {id:'superRare',name:'Super Rare',rolls:2,floorFraction:.35},
    {id:'exotic',name:'Exotic',rolls:2,floorFraction:.5}
  ]);
  const affixes=freeze({
    weapon:[{key:'damagePct',label:'Fighter damage',min:2,max:4},{key:'chargePct',label:'Charge speed',min:3,max:6},{key:'weakPct',label:'Core damage',min:3,max:5},{key:'missileDamagePct',label:'Missile damage',min:3,max:5}],
    armor:[{key:'hull',label:'Maximum hull',min:1,max:1},{key:'shields',label:'Starting shields',min:1,max:1},{key:'podSize',label:'Force interception radius',min:1,max:1}],
    engine:[{key:'speedPct',label:'Flight speed',min:3,max:6},{key:'chargePct',label:'Charge speed',min:3,max:6},{key:'podMovePct',label:'Force handling',min:4,max:8}],
    pod:[{key:'podDamagePct',label:'Force damage',min:3,max:6},{key:'bitDamagePct',label:'Bit damage',min:3,max:5},{key:'podSize',label:'Force interception radius',min:1,max:1},{key:'weakPct',label:'Core damage',min:3,max:5}]
  });
  const sets=freeze([
    {id:'VANGUARD',name:'Vanguard',thresholds:[{count:2,description:'Hits on exposed cores deal 4% more damage.'},{count:4,description:'Breaking a boss core generates 6% DOSE.'}]},
    {id:'AEGIS',name:'Aegis',thresholds:[{count:2,description:'Start a new run with one additional shield.'},{count:4,description:'After 12 Force blocks, restore one shield, once each mission. This is not a shield pickup.'}]},
    {id:'VECTOR',name:'Vector',thresholds:[{count:2,description:'Force deployment and recall are 8% faster.'},{count:4,description:'The first combat pickup each mission grants a six-second Surge: +10% movement and charge speed. Does not multiply Scavenger Drive.'}]}
  ]);
  // Compatibility export for the unfinished comparison lab. Exact-intrinsic
  // pair bonuses are retired; matching gear sets are the synergy layer.
  const pairs=freeze([]);
  const catalogue=freeze([
    {id:'weapon:arc',slot:'weapon',intrinsic:'arc',name:'Arc Splitter',role:'Spread fire',description:'Normal fighter shots add two diagonal bolts, each dealing 22% of the main shot.',effect:{weapon:{pattern:'arc',extraDiagonalBolts:2,diagonalDamage:.22}}},
    {id:'weapon:siege',slot:'weapon',intrinsic:'siege',name:'Siege Coil',role:'Charged fire',description:'Charged fighter shots deal 12% more damage and are 10% larger.',effect:{multipliers:{chargeDamage:1.12,chargeSize:1.1},weapon:{pattern:'siege'}}},
    {id:'weapon:core',slot:'weapon',intrinsic:'core',name:'Core Borer',role:'Core hunting',description:'Hits on exposed cores deal 10% more damage.',effect:{multipliers:{coreDamage:1.1},weapon:{pattern:'core'}}},
    {id:'weapon:null',slot:'weapon',intrinsic:'null',name:'Null Lance',role:'Piercing shots',description:'Charged fighter shots penetrate one additional target.',effect:{weapon:{pattern:'null',chargePierce:1}}},
    {id:'weapon:sync',slot:'weapon',intrinsic:'sync',name:'Pod Synchronizer',role:'Force control',description:'The deployed Force auto-fires; Force laser and contact damage increase by 6%.',effect:{multipliers:{forceDamage:1.06},weapon:{pattern:'sync',forceAutoFire:true}}},
    {id:'armor:recovery',slot:'armor',intrinsic:'recovery',name:'Recovery Weave',role:'Hull recovery',description:'Your first shield pickup each mission repairs one hull, up to maximum hull.',effect:{events:{recoveryOnFirstShield:true}}},
    {id:'armor:capacitor',slot:'armor',intrinsic:'capacitor',name:'Capacitor Plating',role:'Shield energy',description:'A shield pickup that adds a shield also generates 8% DOSE.',effect:{events:{shieldPickupDoseBonus:8}}},
    {id:'armor:ablative',slot:'armor',intrinsic:'ablative',name:'Ablative Memory',role:'Hull protection',description:'Ignore the first ordinary hit that would damage your hull each mission. Shields are used first.',effect:{events:{ordinaryHullGuard:true}}},
    {id:'engine:scavenger',slot:'engine',intrinsic:'scavenger',name:'Scavenger Drive',role:'Pickup mobility',description:'Your first combat pickup each mission grants a four-second Surge: +10% movement and charge speed.',effect:{events:{pickupSurgeDuration:4,pickupSurgePower:.1}}},
    {id:'engine:phase',slot:'engine',intrinsic:'phase',name:'Phase Turbine',role:'Contact protection',description:'Ignore one contact hit each mission. This does not block bullets.',effect:{events:{contactGuard:true}}},
    {id:'engine:vector',slot:'engine',intrinsic:'vector',name:'Vector Governor',role:'Force handling',description:'Force deployment and recall are 12% faster.',effect:{multipliers:{podHandling:1.12}}},
    {id:'pod:siphon',slot:'pod',intrinsic:'siphon',name:'Absorption Siphon',role:'Force absorption',description:'Each hostile shot blocked by the Force generates an additional 0.6% DOSE.',effect:{bonuses:{forceBlockDoseBonus:.6}}},
    {id:'pod:shepherd',slot:'pod',intrinsic:'shepherd',name:'Salvage Shepherd',role:'Safer collection',description:'All combat pickups are attracted from 170 units farther away.',effect:{bonuses:{combatPickupMagnetBonus:170}}},
    {id:'pod:relay',slot:'pod',intrinsic:'relay',name:'Rear Relay',role:'Rear coverage',description:'Rear-mounted Force shots deal 8% more damage.',effect:{multipliers:{rearForceDamage:1.08}}}
  ]);
  const perks=freeze([
    {id:'precisionRelay',name:'Precision Relay',description:'Breaking a boss core generates 6% DOSE.',effect:{events:{coreBreakDoseBonus:6}}},
    {id:'coreSurge',name:'Core Surge',description:'Breaking a boss core grants a four-second Surge: +6% movement and charge speed.',effect:{events:{coreBreakSurgeDuration:4,coreBreakSurgePower:.06}}},
    {id:'bitReclaimer',name:'Bit Reclaimer',description:'Each hostile shot blocked by a defense Bit generates 0.4% DOSE.',effect:{events:{bitBlockDoseBonus:.4}}},
    {id:'secondChance',name:'Second Chance',description:'Once each mission, survive a lethal ordinary hull hit with one hull.',effect:{events:{secondChance:true}}},
    {id:'fieldNanites',name:'Field Nanites',description:'After defeating an apex, repair one hull, up to maximum hull.',effect:{events:{apexRepairHull:1}}},
    {id:'deltaReserve',name:'Delta Reserve',description:'Surplus kit pickups generate 5% DOSE instead of 2%.',effect:{events:{surplusPickupDose:5}}}
  ]);

  const catalogueById=new Map(catalogue.map(item=>[item.id,item]));
  const perkById=new Map(perks.map(item=>[item.id,item]));
  const rarityById=new Map(rarities.map(item=>[item.id,item]));
  function equipmentId(slot,value){
    if(typeof value!=='string')throw new RangeError('Equipment must identify an intrinsic for '+slot+'.');
    const id=value.includes(':')?value:slot+':'+value;
    if(!catalogueById.has(id)||catalogueById.get(id).slot!==slot)throw new RangeError('Unknown or wrong-slot equipment: '+slot+' / '+value+'.');
    return id;
  }
  function normalizeGear(slot,value){
    if(value===undefined||value===null)return null;
    const shorthand=typeof value==='string',item=shorthand?{intrinsic:value}:value;
    if(!item||typeof item!=='object'||Array.isArray(item))throw new RangeError('Gear must be an item object or intrinsic ID.');
    if(item.slot!==undefined&&item.slot!==slot)throw new RangeError('Wrong equipment slot: '+slot+'.');
    const intrinsic=item.intrinsic??(slot==='weapon'?item.gunVariant:item.trait),id=equipmentId(slot,intrinsic),rarity=item.rarity??'common',alignment=item.alignment??null;
    if(!rarityById.has(rarity))throw new RangeError('Unknown gear rarity: '+String(rarity)+'.');
    if(alignment!==null&&!sets.some(set=>set.id===alignment))throw new RangeError('Unknown gear set: '+String(alignment)+'.');
    const stats=item.stats===undefined?{}:item.stats;
    if(!stats||typeof stats!=='object'||Array.isArray(stats))throw new RangeError('Gear stats must be an affix map.');
    if(Object.keys(stats).length>rarityById.get(rarity).rolls)throw new RangeError(rarity+' gear allows at most '+rarityById.get(rarity).rolls+' stat rolls.');
    for(const[key,value]of Object.entries(stats)){
      const definition=affixes[slot].find(affix=>affix.key===key);
      if(!definition)throw new RangeError('Unknown '+slot+' stat roll: '+key+'.');
      if(!Number.isInteger(value)||value<definition.min||value>definition.max)throw new RangeError('Out-of-range '+key+' roll: '+String(value)+'.');
    }
    const output={slot,intrinsic:catalogueById.get(id).intrinsic,alignment,rarity,stats:Object.fromEntries(affixes[slot].filter(affix=>Object.hasOwn(stats,affix.key)).map(affix=>[affix.key,stats[affix.key]]))};
    if(typeof item.id==='string')output.id=item.id;
    return output;
  }
  function validatePerks(ids){
    if(!Array.isArray(ids))throw new RangeError('Perks must be an array of unique perk IDs.');
    if(ids.length>policy.maxActivePerks)throw new RangeError('At most three run perks may be active.');
    const seen=new Set();
    for(const id of ids){
      if(typeof id!=='string'||!perkById.has(id))throw new RangeError('Unknown run perk: '+String(id)+'.');
      if(seen.has(id))throw new RangeError('Duplicate run perk: '+id+'.');
      seen.add(id);
    }
    return [...ids];
  }
  function applyEffect(build,effect){
    for(const[key,value]of Object.entries(effect.multipliers||{}))build.stats[key]*=value;
    for(const[key,value]of Object.entries(effect.bonuses||{}))build.stats[key]+=value;
    for(const[key,value]of Object.entries(effect.events||{})){
      if(key.endsWith('Bonus'))build.events[key]+=value;
      else build.events[key]=value;
    }
    Object.assign(build.weapon,effect.weapon||{});
  }
  function compileBuild(options={}){
    if(!options||typeof options!=='object'||Array.isArray(options))throw new RangeError('Build options must be an object.');
    const incoming=options.equipment===undefined?{}:options.equipment;
    if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw new RangeError('Equipment must be a slot map.');
    for(const slot of Object.keys(incoming))if(!slots.includes(slot))throw new RangeError('Unknown equipment slot: '+slot+'.');
    const equipment=Object.fromEntries(slots.map(slot=>[slot,normalizeGear(slot,incoming[slot])]));
    const selected=validatePerks(options.perks===undefined?[]:options.perks),orderedPerks=perks.filter(perk=>selected.includes(perk.id)).map(perk=>perk.id);
    const build={equipment,perks:orderedPerks,activePairs:[],activeSets:[],statRolls:{},
      stats:{fighterDamage:1,forceDamage:1,bitDamage:1,missileDamage:1,chargeDamage:1,chargeSize:1,rearForceDamage:1,coreDamage:1,podHandling:1,combatPickupMagnetBonus:0,forceBlockDoseBonus:0,shieldedChargeDamageBonus:0,maxHullBonus:0,startingShields:0,podBarrierBonus:0,flightSpeed:1,chargeSpeed:1},
      events:{recoveryOnFirstShield:false,shieldPickupDoseBonus:0,ordinaryHullGuard:false,pickupSurgeDuration:0,pickupSurgePower:0,contactGuard:false,coreBreakDoseBonus:0,coreBreakSurgeDuration:0,coreBreakSurgePower:0,bitBlockDoseBonus:0,secondChance:false,apexRepairHull:0,surplusPickupDose:2,setForceShieldEvery:0,setForceShieldLimit:0},
      weapon:{pattern:null,extraDiagonalBolts:0,diagonalDamage:0,chargePierce:0,forceAutoFire:false}};
    // Sum rolls first. Two +6% charge rolls produce +12%, not 1.06 squared.
    for(const slot of slots){const item=equipment[slot];if(!item)continue;applyEffect(build,catalogueById.get(slot+':'+item.intrinsic).effect);for(const[key,value]of Object.entries(item.stats))build.statRolls[key]=(build.statRolls[key]||0)+value}
    for(const[key,field]of Object.entries({damagePct:'fighterDamage',podDamagePct:'forceDamage',bitDamagePct:'bitDamage',missileDamagePct:'missileDamage',weakPct:'coreDamage',chargePct:'chargeSpeed',speedPct:'flightSpeed',podMovePct:'podHandling'}))build.stats[field]*=1+(build.statRolls[key]||0)/100;
    build.stats.maxHullBonus=build.statRolls.hull||0;build.stats.startingShields=build.statRolls.shields||0;build.stats.podBarrierBonus=build.statRolls.podSize||0;
    for(const set of sets){
      const count=Object.values(equipment).filter(item=>item?.alignment===set.id).length,thresholds=set.thresholds.filter(tier=>count>=tier.count).map(tier=>tier.count);
      if(!thresholds.length)continue;build.activeSets.push({id:set.id,count,thresholds});
      if(set.id==='VANGUARD'){build.stats.coreDamage*=1.04;if(count>=4)build.events.coreBreakDoseBonus+=6}
      else if(set.id==='AEGIS'){build.stats.startingShields++;if(count>=4){build.events.setForceShieldEvery=12;build.events.setForceShieldLimit=1}}
      else if(set.id==='VECTOR'){build.stats.podHandling*=1.08;if(count>=4){build.events.pickupSurgeDuration=Math.max(build.events.pickupSurgeDuration,6);build.events.pickupSurgePower=Math.max(build.events.pickupSurgePower,.1)}}
    }
    for(const id of orderedPerks)applyEffect(build,perkById.get(id).effect);
    return freeze(build);
  }
  function choosePerk(ids,newId,replaceId){
    const chosen=validatePerks(ids);
    if(typeof newId!=='string'||!perkById.has(newId))throw new RangeError('Unknown run perk: '+String(newId)+'.');
    if(chosen.includes(newId))throw new RangeError('Run perk is already selected: '+newId+'.');
    if(replaceId!==undefined&&replaceId!==null){const index=chosen.indexOf(replaceId);if(index<0)throw new RangeError('Replacement perk is not selected: '+String(replaceId)+'.');chosen[index]=newId}
    else{if(chosen.length>=policy.maxActivePerks)throw new RangeError('Three perks are active; choose a perk to replace.');chosen.push(newId)}
    return freeze(chosen);
  }
  function seedValue(seed){
    if(seed!==undefined&&seed!==null&&!(typeof seed==='string'||typeof seed==='number'&&Number.isFinite(seed)))throw new RangeError('A gear seed must be a string or finite number.');
    const text=String(seed??0);let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return hash>>>0;
  }
  function rollGear(options={}){
    if(!options||typeof options!=='object'||Array.isArray(options)||!slots.includes(options.slot))throw new RangeError('Choose a valid gear slot.');
    let state=seedValue(options.seed);const initial=state,random=()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296};
    const slot=options.slot,rarity=options.rarity??'common',definition=rarityById.get(rarity);
    if(!definition)throw new RangeError('Unknown gear rarity: '+String(rarity)+'.');
    const choices=catalogue.filter(item=>item.slot===slot),intrinsic=options.intrinsic??choices[Math.floor(random()*choices.length)].intrinsic;
    equipmentId(slot,intrinsic);
    const alignment=options.alignment===undefined?sets[Math.floor(random()*sets.length)].id:options.alignment;
    if(alignment!==null&&!sets.some(set=>set.id===alignment))throw new RangeError('Unknown gear set: '+String(alignment)+'.');
    const pool=[...affixes[slot]];
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
    const stats={};
    for(const affix of pool.slice(0,definition.rolls)){const floor=affix.min+Math.ceil((affix.max-affix.min)*definition.floorFraction);stats[affix.key]=floor+Math.floor(random()*(affix.max-floor+1))}
    return freeze(normalizeGear(slot,{id:'foundation-'+initial.toString(16)+'-'+slot+'-'+intrinsic,slot,intrinsic,alignment,rarity,stats}));
  }
  function previewLegacyGarage(garage){
    const source=garage&&typeof garage==='object'?garage:{},inventory=Array.isArray(source.inventory)?source.inventory:[];
    const mappings=inventory.map((item,index)=>{
      const warnings=[],original=copy(item);let proposedEquipment=null;
      if(!item||typeof item!=='object'||!slots.includes(item.slot))warnings.push('Unsupported legacy slot; original item retained.');
      else{
        const slot=item.slot,intrinsic=item.intrinsic??(slot==='weapon'?item.gunVariant:item.trait),id=typeof intrinsic==='string'?slot+':'+intrinsic:null;
        if(!catalogueById.has(id))warnings.push('Unsupported legacy intrinsic; original item retained.');
        else{
          const tier=Number.isInteger(item.tier)?Math.max(0,Math.min(4,item.tier)):0,rawRarity=item.rarity==='superrare'?'superRare':item.rarity,rarity=rarityById.has(rawRarity)?rawRarity:rarities[tier].id,alignment=sets.some(set=>set.id===item.alignment)?item.alignment:null,stats={};
          const oldStats=item.stats&&typeof item.stats==='object'?item.stats:{};
          for(const[key,value]of Object.entries(oldStats)){
            const affix=affixes[slot].find(affix=>affix.key===key);
            if(!affix){warnings.push('Legacy '+key+' roll has no proposed equivalent; original value retained.');continue}
            if(Object.keys(stats).length>=rarityById.get(rarity).rolls){warnings.push('Legacy '+key+' roll exceeds the proposed roll count; original value retained.');continue}
            if(!Number.isFinite(value)){warnings.push('Invalid legacy '+key+' roll; original value retained.');continue}
            stats[key]=Math.max(affix.min,Math.min(affix.max,Math.round(value)));
            if(stats[key]!==value)warnings.push('Preview clamps '+key+' from '+value+' to '+stats[key]+'; original value retained.');
          }
          if(item.power!==undefined)warnings.push('Signal Power is archived; it grants no proposed damage calibration.');
          proposedEquipment=normalizeGear(slot,{id:typeof item.id==='string'?item.id:undefined,slot,intrinsic,alignment,rarity,stats});
        }
      }
      return{index,legacyId:typeof item?.id==='string'?item.id:null,name:typeof item?.name==='string'?item.name:'Unnamed legacy item',original,proposedEquipment,warnings};
    });
    const equipment={};
    for(const slot of slots){const reference=source.equipped&&typeof source.equipped==='object'?source.equipped[slot]:null;equipment[slot]=mappings.find(row=>row.legacyId===reference&&row.proposedEquipment?.slot===slot)?.proposedEquipment||null}
    // Every entry remains a distinct original item, including stat variants.
    return freeze({previewOnly:true,sourceItemCount:inventory.length,archivedItemCount:inventory.length,unsupportedItemCount:mappings.filter(row=>!row.proposedEquipment).length,mergedItemCount:0,equipment,mappings,items:mappings.filter(row=>row.proposedEquipment).map(row=>row.proposedEquipment)});
  }
  return freeze({slots,policy,catalogue,sets,affixes,rarities,pairs,perks,compileBuild,choosePerk,rollGear,previewLegacyGarage});
});
