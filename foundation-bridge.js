/* Standalone integration bridge. The live game does not load this module.
 * It produces replacement configuration, never a mutation of a live fighter.
 * Foundation event routing and source-aware emissions remain the caller's job.
 */
(function(root,factory){
  'use strict';
  const foundation=typeof module==='object'&&module.exports?require('./foundation.js'):root?.STARFIGHTER_FOUNDATION;
  const api=factory(foundation);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.STARFIGHTER_FOUNDATION_BRIDGE=api;
})(typeof window==='object'?window:null,function(F){
  'use strict';
  if(!F?.compileBuild||!F?.previewLegacyGarage)throw new Error('Load the foundation rules before their integration bridge.');
  function freeze(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}
    return value;
  }
  function copy(value){
    if(Array.isArray(value))return value.map(copy);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copy(item)]));
    return value;
  }
  function object(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(name+' must be an object.');return value}
  function bounded(value,name,min,max,integer=false){
    if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new RangeError(name+' is outside the supported fighter range.');
    return value;
  }
  function buildPlayerPatch(build,options={}){
    object(build,'Compiled build');object(options,'Base fighter options');
    object(build.equipment,'Compiled equipment');
    if(!Array.isArray(build.perks))throw new TypeError('Compiled perks must be an array.');
    // Recompile the declared equipment/perks, rather than trusting arbitrary
    // injected scalar fields. Nothing is multiplied over a live player.
    const compiled=F.compileBuild({equipment:build.equipment,perks:build.perks}),s=compiled.stats,e=compiled.events;
    const {baseMaxHp=3,baseSpeed=255,basePodRadius=13,baseFighterRadius=12}=options;
    bounded(baseMaxHp,'Base maximum hull',1,100,true);bounded(baseSpeed,'Base speed',Number.MIN_VALUE,2000);
    bounded(basePodRadius,'Base Force radius',1,80);bounded(baseFighterRadius,'Fighter radius',1,80);
    const patch={
      r:baseFighterRadius,
      maxHp:bounded(baseMaxHp+s.maxHullBonus,'Compiled maximum hull',1,100,true),
      speed:bounded(baseSpeed*s.flightSpeed,'Compiled speed',Number.MIN_VALUE,2000),
      podRadius:bounded(basePodRadius+s.podBarrierBonus,'Compiled Force radius',1,80),
      damage:s.fighterDamage,missileDamage:s.missileDamage,bitDamage:s.bitDamage,podDamage:s.forceDamage,
      chargeDamage:s.chargeDamage,chargeSize:s.chargeSize,chargeSpeed:s.chargeSpeed,
      weakDamage:s.coreDamage,podMove:s.podHandling,rearForce:s.rearForceDamage,
      podAuto:compiled.weapon.forceAutoFire,weaponVariant:compiled.weapon.pattern,
      shieldedChargeBonus:s.shieldedChargeDamageBonus,
      critChance:0,evade:0,signalPower:100,resonance:compiled.activeSets.map(set=>set.id).join('+')||'NONE',
      redForce:1,blueForce:1,yellowForce:1,blueVelocity:1,yellowGuidance:1,missileGuidance:1,doseGain:1,
      // Old callback flags are disabled. The foundation event reducer owns
      // these triggers, including contact-only protection and set restoration.
      repairOnVictory:0,repairOnApex:0,bitDose:0,podBlockDose:0,shieldDose:0,
      lootInvulnerability:0,salvageRepair:false,ablativeOwned:false,weakBreakDose:0,weakOverdrive:0,secondChance:false,
      // The old gear magnet is not a combat-pickup magnet. Keep them explicit.
      gearMagnet:210,
      foundationCombatPickupMagnet:210+s.combatPickupMagnetBonus,
      foundationStartingShields:s.startingShields,
      foundationForceBlockDoseBonus:s.forceBlockDoseBonus,
      foundationRecoveryOnFirstShield:e.recoveryOnFirstShield,
      foundationShieldPickupDoseBonus:e.shieldPickupDoseBonus,
      foundationOrdinaryHullGuard:e.ordinaryHullGuard,
      foundationPickupSurgeDuration:e.pickupSurgeDuration,
      foundationPickupSurgePower:e.pickupSurgePower,
      foundationContactGuard:e.contactGuard,
      foundationCoreBreakDoseBonus:e.coreBreakDoseBonus,
      foundationCoreBreakSurgeDuration:e.coreBreakSurgeDuration,
      foundationCoreBreakSurgePower:e.coreBreakSurgePower,
      foundationBitBlockDoseBonus:e.bitBlockDoseBonus,
      foundationSecondChance:e.secondChance,
      foundationApexRepairHull:e.apexRepairHull,
      foundationSurplusPickupDose:e.surplusPickupDose,
      foundationSetForceShieldEvery:e.setForceShieldEvery,
      foundationSetForceShieldLimit:e.setForceShieldLimit
    };
    return freeze(patch);
  }
  const playerFields=freeze(Object.keys(buildPlayerPatch(F.compileBuild())));
  function snapshotLoadout(garage){
    object(garage,'Legacy Garage');
    const incoming=Array.isArray(garage.inventory)?garage.inventory:[];
    const originals=incoming.map(item=>item?.legacySource?.version===1&&item.legacySource.item&&typeof item.legacySource.item==='object'&&!Array.isArray(item.legacySource.item)?item.legacySource.item:item);
    // Archived data owns the original intrinsic, rolls and set. Item identity
    // and editable metadata belong to the current inventory envelope, which
    // may have acquired an ID, a new name or a lock since archival capture.
    const proposedInputs=originals.map((original,index)=>{
      if(!original||typeof original!=='object'||Array.isArray(original))return original;
      const proposal={...original},live=incoming[index];
      for(const key of['id','name','source','locked'])if(live&&typeof live==='object'&&Object.hasOwn(live,key))proposal[key]=live[key];
      return proposal;
    });
    const source={...garage,inventory:proposedInputs},preview=F.previewLegacyGarage(source);
    const warnings=preview.mappings.flatMap(row=>row.warnings.map(message=>({index:row.index,legacyId:row.legacyId,message})));
    const inventory=preview.mappings.filter(row=>row.proposedEquipment).map(row=>({
      ...row.proposedEquipment,name:row.name,
      source:typeof row.original?.source==='string'?row.original.source:'LEGACY INVENTORY',
      locked:row.original?.locked===true
    }));
    const equipment=Object.fromEntries(F.slots.map(slot=>{
      const proposed=preview.equipment[slot],mapped=proposed?.id?inventory.find(item=>item.slot===slot&&item.id===proposed.id):null;
      const reference=garage.equipped?.[slot];
      if(reference&&!mapped)warnings.push({index:null,legacyId:reference,message:'Equipped '+slot+' has no valid foundation mapping; its original item remains in the archive.'});
      return[slot,mapped||null];
    }));
    return freeze({
      schemaVersion:1,ruleset:'foundation-v1',equipment,inventory,
      // Both the exact source envelope and original-item preview survive.
      // No deduplication, salvage or write is performed by this module.
      archive:{garage:copy(garage),originalItems:originals.map(copy)},
      warnings,sourceItemCount:preview.sourceItemCount,unsupportedItemCount:preview.unsupportedItemCount,mergedItemCount:0
    });
  }
  return freeze({ruleset:'foundation-v1',playerFields,buildPlayerPatch,snapshotLoadout});
});
