#!/usr/bin/env node
'use strict';
// Guaranteed reward paths and owned-item build possibilities in private pilots.
// Staged victories are not a survival bot, human playtest or a claim about DPS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sourceBytes=fs.readFileSync(path.join(root,'game.js')),source=sourceBytes.toString('utf8');
const trials=Number(process.argv.find(value=>value.startsWith('--trials='))?.slice(9)||64);assert.ok([32,64].includes(trials),'Use --trials=32 or64.');
const label=process.argv.find(value=>value.startsWith('--label='))?.slice(8)||'v161';assert.ok(/^[a-z0-9_-]+$/i.test(label));
const harnessFile=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(harnessFile,'utf8');support=support.slice(0,support.indexOf('\ntest('));
// Reward compilation does not render sprites. Avoid expensive mocked-image
// preparation callbacks while retaining all native reward/progression paths.
support=support.replace('this.onload?.();','// Visual preparation omitted in the reward-only diagnostic.');
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
support=support.replace('  globalThis.__gameTest = {',`
  globalThis.__gameTest = {
    get earnedRules(){return{slots:gearSlots,combos:gearCombos.map(({id,name,requires})=>({id,name,requires})),capacity:GARAGE_CAPACITY}},
    get earnedRuleset(){return runRuleset},get earnedPerks(){return [...runProgression.perks]},
    earnedClear(){
      if(bossLab||!runActive||runMode!=='story'||state!=='playing')throw new Error('Expected an actual active Story pilot.');
      makeMiniBoss();miniBoss.hp=0;update(0);let delayed=victoryDelay;victoryDelay=null;delayed.run();
      chooseRunService('skip');makeBoss();handleBossDefeat(boss);delayed=victoryDelay;victoryDelay=null;delayed.run();closeSkillTree();
    },
    earnedCompile(equipment){
      const priorPlayer=player,priorEquipment=garage.equipped;
      try{
        for(const slot of gearSlots)if(equipment[slot]&&!garage.inventory.some(item=>item.slot===slot&&item.id===equipment[slot]))throw new Error('Build includes an unowned item.');
        player=JSON.parse(JSON.stringify(priorPlayer));garage.equipped={...equipment};rebuildRunLoadout();
        const fields=['hp','maxHp','shield','damage','chargeDamage','chargeSpeed','weakDamage','podDamage','critChance','evade','speed','r','doseGain','shieldDose','podBlockDose','podMove','rearForce','lootSurgePower','lootSurgeDuration','lootInvulnerability','salvageRepair','ablativeOwned','shieldedChargeBonus','signalPower','resonance','weaponVariant'];
        return{stats:Object.fromEntries(fields.map(key=>[key,player[key]])),bossBuildHealthScale:bossBuildHealthScale(),activePairs:gearComboStates().filter(combo=>combo.active).map(combo=>combo.id),sets:gearSetStates().map(({alignment,count})=>({alignment,count}))};
      }finally{player=priorPlayer;garage.equipped=priorEquipment}
    },
`);
const m=new Module(harnessFile,module);m.filename=harnessFile;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',harnessFile);
const {createGame}=m.exports,plain=value=>JSON.parse(JSON.stringify(value));
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function fresh(seed){
 const game=createGame({ruleset:'streamlined-v1'});game.sandbox.__earnedRandom=rng(seed);game.sandbox.__earnedNow=1600000000000+seed;
 vm.runInContext('Math.random=globalThis.__earnedRandom;Date.now=()=>globalThis.__earnedNow',vm.createContext(game.sandbox));
 game.api.start('story');assert.equal(game.api.garage.inventory.length,0);assert.equal(game.api.player.maxHp,3);assert.equal(game.api.player.shield,0);return game;
}
const equipmentOf=items=>Object.fromEntries(['weapon','armor','engine','pod'].map(slot=>[slot,items.find(item=>item.slot===slot)?.id||null]));
const trim=item=>{const{id,slot,tier,power,alignment,gunVariant,trait,stats,source}=item;return{id,slot,tier,power,alignment,gunVariant,trait,stats:plain(stats),source}};
function policies(a,rules){
 // Insertion order is the final tie breaker; no invented weighted stat score.
 const inventory=a.garage.inventory,ordered=inventory.map((item,index)=>({item,index})).sort((x,y)=>y.item.power-x.item.power||y.item.tier-x.item.tier||x.index-y.index).map(row=>row.item);
 const naive=equipmentOf(ordered),available=rules.combos.filter(combo=>combo.requires.every(([slot,id])=>ordered.some(item=>item.slot===slot&&item[slot==='weapon'?'gunVariant':'trait']===id)));
 const focused=available.map(combo=>{const equipped={...naive};for(const[slot,id]of combo.requires)equipped[slot]=ordered.find(item=>item.slot===slot&&item[slot==='weapon'?'gunVariant':'trait']===id).id;return{id:combo.id,equipment:equipped}});
 return{naive,available:available.map(combo=>combo.id),focused};
}
function compile(game,equipment){
 const before=JSON.stringify({garage:game.api.garage,player:game.api.player,profile:game.api.profile,storage:[...game.storage]});
 const result=plain(game.api.earnedCompile(equipment));assert.equal(JSON.stringify({garage:game.api.garage,player:game.api.player,profile:game.api.profile,storage:[...game.storage]}),before,'Compilation must be a read-only private probe.');
 return{equipment:plain(equipment),items:Object.values(equipment).filter(Boolean).map(id=>trim(game.api.garage.inventory.find(item=>item.id===id))),...result};
}
const rows=[],snapshots=[],round=n=>Math.round(n*10000)/10000;
for(let trial=1;trial<=trials;trial++){
 const seed=trial*743,game=fresh(seed),a=game.api,rules=plain(a.earnedRules);
 for(let mission=1;mission<=10;mission++){
  assert.equal(a.wave,mission);assert.equal(a.bossLab,false);assert.equal(a.earnedRuleset,'streamlined-v1');assert.equal(a.earnedPerks.length,0);
  if([2,5,10].includes(mission)){
   const choices=policies(a,rules),naive=compile(game,choices.naive),pairs=choices.focused.map(policy=>({pair:policy.id,...compile(game,policy.equipment)}));
   snapshots.push({trial,seed,enteringMission:mission,earnedThroughMission:mission-1,inventory:a.garage.inventory.map(trim),availablePairs:choices.available,highestPower:naive,pairAware:pairs});
  }
  const beforeIds=new Set(a.garage.inventory.map(item=>item.id));a.earnedClear();
  const awarded=a.garage.inventory.filter(item=>!beforeIds.has(item.id));assert.equal(awarded.length,2);assert.equal(awarded.filter(item=>item.source==='ELITE ASTERPRINT').length,1);assert.equal(awarded.filter(item=>item.source==='APEX ASTERPRINT').length,1);
  assert.equal(a.garage.inventory.length,mission*2);assert.ok(a.garage.inventory.length<=rules.capacity);assert.equal(a.runLoot.length,0);assert.equal(a.earnedPerks.length,0);assert.equal(a.player.hp,3);assert.equal(a.player.shield,0);assert.equal(a.player.bits,0);assert.equal(a.player.pod.owned,false);
  const choices=policies(a,rules),naive=compile(game,choices.naive);
  rows.push({trial,seed,afterMission:mission,inventoryCount:a.garage.inventory.length,coveredSlots:new Set(a.garage.inventory.map(item=>item.slot)).size,slotCounts:Object.fromEntries(rules.slots.map(slot=>[slot,a.garage.inventory.filter(item=>item.slot===slot).length])),availablePairs:choices.available,highestPowerActivePairs:naive.activePairs,awarded:awarded.map(trim)});
 }
 assert.equal(a.state,'complete');assert.equal(a.profile.checkpoint,null);assert.equal(a.profile.lifetime.runs,1);assert.equal(a.profile.lifetime.gear,20);assert.equal(a.garage.materials,0);
 if(trial%8===0)console.error('Completed '+trial+' / '+trials+' private award campaigns.');
}
const pct=(n,total)=>round(n/total*100),summary=values=>{const sorted=values.slice().sort((a,b)=>a-b);return{min:sorted[0],median:sorted[Math.floor((sorted.length-1)/2)],max:sorted.at(-1),mean:round(values.reduce((s,n)=>s+n,0)/values.length)}};
const byMission=Object.fromEntries(Array.from({length:10},(_,index)=>{const mission=index+1,data=rows.filter(row=>row.afterMission===mission);return[mission,{trials,inventoryCount:mission*2,fullSlotCoveragePct:pct(data.filter(row=>row.coveredSlots===4).length,trials),anyPairAvailablePct:pct(data.filter(row=>row.availablePairs.length).length,trials),highestPowerActivatesAnyPairPct:pct(data.filter(row=>row.highestPowerActivePairs.length).length,trials),availableButPowerPolicyMissesEveryPairPct:pct(data.filter(row=>row.availablePairs.length&&!row.highestPowerActivePairs.length).length,trials),pairAvailability:Object.fromEntries(['absorptionCircuit','chargedBastion','salvageMomentum','rearGuard'].map(id=>[id,pct(data.filter(row=>row.availablePairs.includes(id)).length,trials)]))}]}));
const bySnapshotMission=Object.fromEntries([2,5,10].map(mission=>{const data=snapshots.filter(row=>row.enteringMission===mission);return[mission,{trials,inventoryCount:(mission-1)*2,highestPower:{signalPower:summary(data.map(row=>row.highestPower.stats.signalPower)),damage:summary(data.map(row=>row.highestPower.stats.damage)),weakDamage:summary(data.map(row=>row.highestPower.stats.weakDamage)),chargeSpeed:summary(data.map(row=>row.highestPower.stats.chargeSpeed)),maxHp:summary(data.map(row=>row.highestPower.stats.maxHp)),bossBuildHealthScale:summary(data.map(row=>row.highestPower.bossBuildHealthScale))},pairAware:Object.fromEntries(['absorptionCircuit','chargedBastion','salvageMomentum','rearGuard'].map(id=>{const pairs=data.flatMap(row=>row.pairAware.filter(policy=>policy.pair===id).map(policy=>({policy,naive:row.highestPower})));return[id,{availableTrials:pairs.length,signalPowerDelta:pairs.length?summary(pairs.map(({policy,naive})=>policy.stats.signalPower-naive.stats.signalPower)):null,bossHealthScaleDelta:pairs.length?summary(pairs.map(({policy,naive})=>round(policy.bossBuildHealthScale-naive.bossBuildHealthScale))):null,alreadyActiveInPowerPolicy:pairs.filter(({naive})=>naive.activePairs.includes(id)).length}]}))}]}));
const report={generatedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),trials,scope:{rewards:'Actual ordinary elite defeat and normal apex defeat branches in64/32 private seeded empty Story pilots. Victories are staged, never simulated wins.',items:'Exactly20 guaranteed real generated rewards per complete campaign. Field loot and secret epic substitutions are excluded. No fake items, rarity changes, duplicate awards or shipped auto-equip behavior.',choices:'Skip every recovery and perk to isolate permanent gear. The actual campaign remains unequipped; compilation uses a temporary player/equipment copy and asserts no pilot/save/combat mutations.',policies:'Highest Power per slot, with rarity then earliest-owned tie breakers. For each assemblable named pair, select highest-Power owned required intrinsics and keep the naive choices in other slots.',snapshots:'On entry to missions2/5/10, before their elite/apex rewards:2/8/18 prior-mission items. Native live-refit compilation preserves current3hull/0shield rather than granting new-run starting resources.',limits:'Graphics/audio are mocked and image preparation callbacks omitted. No actual combat, collection, accuracy, firing cadence, survivability, field-loot model, physical controller or human difficulty claim. Pair presence is not equivalent to realized combat benefit.'},byMission,bySnapshotMission,rows,snapshots};
const stem='earned-builds-'+label;fs.writeFileSync(path.join(root,'artifacts/'+stem+'.json'),JSON.stringify(report,null,2)+'\n');
const md=['# Guaranteed earned gear — '+label,'','This read-only diagnostic uses '+trials+' seeded private Story pilots, actual elite/apex awards and staged victories. It isolates guaranteed permanent gear; it is not a campaign win-rate or DPS test.','','| After mission | Items | Four slots covered | Any pair available | Highest-Power build activates a pair | Available pair missed entirely |','| --- | ---: | ---: | ---: | ---: | ---: |',...Object.entries(byMission).map(([mission,row])=>'| '+[mission,row.inventoryCount,row.fullSlotCoveragePct+'%',row.anyPairAvailablePct+'%',row.highestPowerActivatesAnyPairPct+'%',row.availableButPowerPolicyMissesEveryPairPct+'%'].join(' | ')+' |'),'','## Native compiled snapshots','','Snapshots compile only actually owned builds on entry to missions2/5/10. The JSON records every earned item, selected slot, named pair, set count, native compiled statistic and boss-health scale. Pair alternatives may trade Power or another effect for the requested combination.','','| Entering mission | Prior guaranteed items | Median highest-Power loadout | Median native boss-health scale |','| --- | ---: | ---: | ---: |',...[2,5,10].map(mission=>{const row=bySnapshotMission[mission];return'| '+[mission,row.inventoryCount,row.highestPower.signalPower.median,round(row.highestPower.bossBuildHealthScale.median)+'×'].join(' | ')+' |'}),'','At entry to Mission10, pair-aware builds cost a median '+['absorptionCircuit','chargedBastion','salvageMomentum','rearGuard'].map(id=>id+': '+(bySnapshotMission[10].pairAware[id].signalPowerDelta?.median??'unavailable')+' Power').join('; ')+'. These are alternative builds from the same owned inventory, not extra or stronger rewards. A named-pair benefit may depend on a shield, mounted Force, block or pickup that this gear-only diagnostic does not assume.','','## Interpretation and limits','','The available-pair and highest-Power columns measure different things. The gap supports making owned partners easier to discover; it does not justify inflating gear values or assert that a pair is always the best combat choice.','','All recovery/perk choices are skipped. No field drops, Force, missiles or Bits are assumed. The campaign owns3hull/0shield and stays unequipped; native refit snapshots do not refill resources. Each campaign ends with20 unique banked items, zero overflow/Alloy, one finalized run and no retained checkpoint. Graphics/audio are mocked and unused image-preparation callbacks are omitted.','','This establishes availability and stat behavior, not whether a player can exploit a pair, survive a mission or prefer a build. Field acquisitions and actual earned perks must be evaluated separately.','','Source SHA256: `'+report.sourceSha256+'`.',''];
fs.writeFileSync(path.join(root,'artifacts/'+stem+'-review.md'),md.join('\n'));console.log(JSON.stringify({trials,sourceSha256:report.sourceSha256,byMission,bySnapshotMission},null,2));
