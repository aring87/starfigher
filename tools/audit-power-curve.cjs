#!/usr/bin/env node
'use strict';

// Read-only balance audit. This loads the real game into the existing browser
// mock, never loads browser saves, and writes only reproducible audit artifacts.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const harnessFile=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(harnessFile,'utf8');
support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,',`spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,
    get auditRetrofits(){return tacticalRetrofits},fireForceLaser,drop,
    auditField(stage,post=false){wave=stage;t=post?48:0;miniBossSpawned=post;miniBoss=boss=null;stagePostEliteClock=post?0:-1;stageEncounterCursor=0;stageApexIntro=-1;stageHazardClock=post?3.5:5.4;stageHazards=[];enemies=[];enemyShots=[];shots=[];pickups=[];spawn=post?.4:.8;state='playing';player.inv=999;},`);
const harness=new Module(harnessFile,module);
harness.filename=harnessFile;harness.paths=Module._nodeModulePaths(__dirname);
harness._compile(support+'\nmodule.exports={createGame,gameSource:source};\n',harnessFile);
const {createGame,gameSource}=harness.exports;
const sampleStages=[1,2,3,5,10];
const round=n=>Math.round(n*1000)/1000;
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function randomize(game,seed){game.sandbox.__auditRandom=seeded(seed);vm.runInContext('Math.random=globalThis.__auditRandom',vm.createContext(game.sandbox))}
function fresh(seed=1){const game=createGame();randomize(game,seed);game.api.start('normal');return game}
function summarize(values){const sorted=values.slice().sort((a,b)=>a-b),q=p=>round(sorted[Math.floor((sorted.length-1)*p)]);return{mean:round(values.reduce((a,b)=>a+b,0)/values.length),p10:q(.1),median:q(.5),p90:q(.9)}}

// No collisions/hit probability are assumed: these are emitted damage budgets,
// not damage guaranteed to converge on one small boss core. Blue/Yellow/Arc
// side lanes and Bits need their own alignment; rear Force faces backwards.
function emission(api,{charged=false,chargeAmount=charged?1:0,deployed=false,rear=false,seconds=120}={}){
  const p=api.player;
  p.pod.mode=deployed?'deployed':'docked';p.pod.dockSide=rear?'rear':'front';p.pod.returnSide=p.pod.dockSide;
  p.missileTimer=0;
  const interval=chargeAmount?Math.max(p.rate,chargeAmount*1.25/p.chargeSpeed):p.rate;
  const totals={fighter:0,fighterCenter:0,force:0,bits:0,missiles:0,autoForce:0,autoBits:0};
  const counts={fighter:0,force:0,bits:0,missiles:0,autoForce:0,autoBits:0};
  let last=0,volley=0;
  for(let time=0;time<seconds-1e-8;time+=interval){
    p.missileTimer=Math.max(0,p.missileTimer-(time-last));last=time;api.shots.length=0;api.fire(chargeAmount);volley++;
    let fighterIndex=0;
    for(const shot of api.shots){const kind=shot.missile?'missiles':shot.bit?'bits':shot.pod?'force':'fighter';const expected=shot.d*(kind==='fighter'&&!shot.forceColor&&shot.vy===0?1+p.critChance:1);totals[kind]+=expected;counts[kind]++;if(kind==='fighter'&&fighterIndex++===Math.floor(p.gun/2))totals.fighterCenter+=expected}
  }
  if(deployed&&p.podAuto){for(let time=0;time<seconds-1e-8;time+=.34){api.shots.length=0;api.fireForceLaser(0,1);for(const shot of api.shots){const kind=shot.bit?'autoBits':'autoForce';totals[kind]+=shot.d;counts[kind]++}}}
  const damage=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,round(v/seconds)]));
  const total=totals.fighter+totals.force+totals.bits+totals.missiles+totals.autoForce+totals.autoBits;
  return{interval:round(interval),volleysPerSecond:round(volley/seconds),...damage,total:round(total/seconds),exposedCoreBudget:round(total*p.weakDamage/seconds),projectilesPerSecond:round(Object.values(counts).reduce((a,b)=>a+b,0)/seconds)}
}
function quietRandom(game){vm.runInContext('Math.random=()=>.999999',vm.createContext(game.sandbox))}
function kit(api,{color='red',level=0,missiles=0,bits=0}={}){for(let i=0;i<level;i++)api.collectCombatPickup({type:'crystal',color});for(let i=0;i<missiles;i++)api.collectCombatPickup({type:'missile'});for(let i=0;i<bits;i++)api.collectCombatPickup({type:'bit'});api.player.pod.mode='docked'}
function moduleApply(api,key){const u=api.auditRetrofits.find(u=>u.key===key),p=api.player;assert.ok(u&&u.eligible(p));assert.ok((p.retrofits[key]||0)<u.max);const available=api.auditRetrofits.filter(other=>other.category===u.category&&other.eligible(p)&&(p.retrofits[other.key]||0)<other.max);assert.ok(!u.fallback||!available.some(other=>!other.fallback),'Fallback cannot be selected before primary modules are exhausted');p.retrofits[key]=(p.retrofits[key]||0)+1;u.apply()}
function doctrineApply(api,id){const path=api.skillPaths.find(p=>p.nodes.some(n=>n.id===id)),node=path?.nodes.find(n=>n.id===id);assert.ok(node);const position=path.nodes.indexOf(node);assert.ok(position===0||api.player.skills[path.nodes[0].id]);assert.ok(position!==5||path.nodes.slice(0,5).every(n=>api.player.skills[n.id]));api.player.skillPoints++;api.learnSkill(node);assert.ok(api.player.skills[id])}
function snapshot(game){const api=game.api,p=api.player;quietRandom(game);return{gun:p.gun,rate:p.rate,kit:{color:p.laserColor,level:p.laserLevel,missiles:p.missileLevel,bits:p.bits},modules:{...p.retrofits},doctrine:Object.keys(p.skills),stats:{damage:round(p.damage),weak:round(p.weakDamage),pod:round(p.podDamage),chargeSpeed:round(p.chargeSpeed),rearForce:round(p.rearForce),maxHull:p.maxHp,shield:p.shield},bossHealthScale:round(api.bossBuildHealthScale()),tapFront:emission(api),minimumChargeFront:emission(api,{chargeAmount:.24}),chargeFront:emission(api,{charged:true}),tapDeployed:emission(api,{deployed:true}),minimumChargeDeployed:emission(api,{chargeAmount:.24,deployed:true}),chargeDeployed:emission(api,{charged:true,deployed:true}),tapRear:emission(api,{rear:true}),chargeRear:emission(api,{charged:true,rear:true}),forceContactOpenCorePerSecond:round(16*p.podDamage*p.weakDamage)}}

const allStages=Array.from({length:10},(_,i)=>i+1);
const results={sourceSha256:crypto.createHash('sha256').update(gameSource).digest('hex'),assumptions:{freshPilot:true,perks:'Actual production helpers; prerequisites and fallback eligibility asserted.',damage:'Ideal emitted damage, expected crit; no hit chance, armor/exposure duty cycle, Delta or contact damage included.',input:'Tap at .16s; full-charge release at actual1.25/chargeSpeed; missiles emitted only on fire, quantized to that cadence.',sync:'Deployed automatic Force every.34s adds to ordinary fire-triggered Force.',stageEntrances:'Stage1/2/3/5/10 have0/1/2/4/9 earlier apex Doctrine and miniboss modules. Pre-apex includes the current module.',gear:'One actual-generator guaranteed-drop sample, seed20261114, highest displayed Power per slot. Earned in earlier stages; independent of pickup rolls. Does not assert these are median gear or optimal choices.',fixedArsenal:'The fixedArsenalPerkCurves deliberately hold a complete pickup kit constant, even at stage1, to isolate perk growth; this is NOT a reachable stage1 entrance.',combinedCurves:'Illustrative reachable levels using marginal-median pickup kit, earned gear sample, favorable valid module offers; separate marginal medians do not establish a joint median build.',fieldSampling:'Production update() sampled at50ms;16 seeds for all10 actual84-second field sections. Instant removal counts potential spawn units, not player kills.',pickupModel:'256 seeds; practicalAssumption kills70% of spawned units and claims80% of offered combat pickups. A missed pickup blocks further combat drops for10 kills. Ideal kills/claims100%. Gear roll counts offered gear, not claims. No claim this is player telemetry.',legacy:'gun5/rate.08 are checkpoint/internal ceilings, not current fresh-run drops.'},baseline:{},kitReferences:[],fieldSpawns:{},pickupReachability:{},fixedArsenalPerkCurves:[],combinedCurves:[],variantReferences:[]};
for(const spec of[{name:'naked fighter',level:0},{name:'first red Force',level:1},{name:'red Force3',level:3},{name:'red Force3+missiles2',level:3,missiles:2},{name:'red Force3+missiles2+bits2',level:3,missiles:2,bits:2},{name:'blue Force3+missiles2+bits2',color:'blue',level:3,missiles:2,bits:2},{name:'yellow Force3+missiles2+bits2',color:'yellow',level:3,missiles:2,bits:2}]){const game=fresh();kit(game.api,spec);const row={name:spec.name,...snapshot(game)};results.kitReferences.push(row);if(spec.level===0)results.baseline=row}

// Count the actual authored/generic spawns during each dedicated field phase.
// Removing spawned enemies prevents incidental collisions from altering timing.
const fieldGame=fresh();
for(const stage of allStages){const before=[],after=[];for(let seed=1;seed<=16;seed++){randomize(fieldGame,stage*1000+seed);for(const post of[false,true]){const api=fieldGame.api;api.auditField(stage,post);let count=0;const duration=post?36:48;for(let elapsed=0;elapsed<duration-1e-8;elapsed+=.05){api.update(Math.min(.05,duration-elapsed));count+=api.enemies.length;api.enemies.length=0;api.enemyShots.length=0;api.particles.length=0;api.debris.length=0} (post?after:before).push(count)}}results.fieldSpawns[stage]={pre:summarize(before),post:summarize(after),total:summarize(before.map((v,i)=>v+after[i]))}}

// Actual drop() rolls, immediately collected in the perfect-collection bound.
// Practical case assumes70% of enemies killed,80% pickups claimed; missed
// combat pickups block later drops for10 kills (about one screen crossing).
for(const mode of[{name:'ideal',kill:1,collect:1},{name:'practicalAssumption',kill:.7,collect:.8}]){
  const samples=Object.fromEntries(allStages.map(stage=>[stage,[]]));
  for(let seed=1;seed<=256;seed++){
    const game=fresh(seed*731),api=game.api,rng=seeded(seed*97),counts={crystals:0,missiles:0,bits:0,shields:0,fieldGear:0};let heldUntil=0,killNumber=0;
    for(let stage=1;stage<=10;stage++){
      const total=results.fieldSpawns[stage].total.mean,kills=Math.round(total*mode.kill);
      for(let n=0;n<kills;n++){
        killNumber++;if(killNumber>=heldUntil)api.pickups.length=0;api.drop({x:700,y:250});
        for(const pickup of api.pickups){if(pickup.auditHandled)continue;pickup.auditHandled=true;if(pickup.type==='gear'){counts.fieldGear++;pickup.dead=true;continue}if(rng()<mode.collect){api.collectCombatPickup(pickup);pickup.dead=true;counts[pickup.type==='crystal'?'crystals':pickup.type==='missile'?'missiles':pickup.type==='bit'?'bits':'shields']++}else heldUntil=killNumber+10}
        for(let i=api.pickups.length-1;i>=0;i--)if(api.pickups[i].dead)api.pickups.splice(i,1);
      }
      if(samples[stage])samples[stage].push({level:api.player.laserLevel,missiles:api.player.missileLevel,bits:api.player.bits,shieldDrops:counts.shields,fieldGear:counts.fieldGear,forceOwned:api.player.pod.owned});
    }
  }
  results.pickupReachability[mode.name]=Object.fromEntries(allStages.map(stage=>{const rows=samples[stage];return[stage,{forceOwnedPct:round(rows.filter(r=>r.forceOwned).length/rows.length*100),laser3Pct:round(rows.filter(r=>r.level===3).length/rows.length*100),missile2Pct:round(rows.filter(r=>r.missiles===2).length/rows.length*100),bits2Pct:round(rows.filter(r=>r.bits===2).length/rows.length*100),laserLevel:summarize(rows.map(r=>r.level)),missiles:summarize(rows.map(r=>r.missiles)),bits:summarize(rows.map(r=>r.bits)),shieldDrops:summarize(rows.map(r=>r.shieldDrops)),fieldGear:summarize(rows.map(r=>r.fieldGear))}]}));
}

// Offensive reference obeys the real finite reward budget. This intentionally
// favorable module order is possible, not guaranteed by randomized card offers.
const reference=fresh();kit(reference.api,{level:3,missiles:2,bits:2});
const doctrine=['v1','v2','v3','v4','v5','p1','p3','p4','v6'];
const modules=['forceTrim','chargeBaffle','missileTelemetry','precisionRelay','arsenalMaintenance','arsenalMaintenance','arsenalMaintenance','arsenalMaintenance','arsenalMaintenance','arsenalMaintenance'];
for(let stage=1;stage<=10;stage++){if(stage>1)doctrineApply(reference.api,doctrine[stage-2]);reference.api.setWave(stage);if(sampleStages.includes(stage))results.fixedArsenalPerkCurves.push({stage,phase:'entrance',...snapshot(reference)});moduleApply(reference.api,modules[stage-1]);if(sampleStages.includes(stage))results.fixedArsenalPerkCurves.push({stage,phase:'preApex',...snapshot(reference)})}
const gearAuditFile=path.join(root,'artifacts','gear-power-audit.json');
if(fs.existsSync(gearAuditFile)){
  const gearAudit=JSON.parse(fs.readFileSync(gearAuditFile,'utf8'));
  for(const stage of sampleStages)for(const phase of['entrance','preApex']){
    const game=fresh(stage*111),api=game.api,p=api.player,gearSample=gearAudit.snapshots.find(s=>s.stage===stage);
    api.setWave(stage);
    if(gearSample){api.garage.inventory=gearSample.equipment.map(item=>api.normalizeGearItem(item));for(const item of api.garage.inventory)api.garage.equipped[item.slot]=item.id;api.rebuildRunLoadout()}
    const pickupStage=phase==='entrance'?stage-1:stage,pickup=results.pickupReachability.practicalAssumption[pickupStage];
    if(pickup)kit(api,{level:pickup.laserLevel.median,missiles:pickup.missiles.median,bits:pickup.bits.median});
    for(let i=0;i<stage-1;i++)doctrineApply(api,doctrine[i]);
    for(let i=0;i<stage-(phase==='entrance'?1:0);i++)moduleApply(api,modules[i]);
    results.combinedCurves.push({stage,phase,equipment:gearSample?.equipment.map(item=>({slot:item.slot,tier:item.tier,variant:item.gunVariant||item.trait,power:item.power}))||[],...snapshot(game)})
  }
}
for(const variant of['arc','siege','core','null','sync']){
  const game=fresh();kit(game.api,{level:3,missiles:2,bits:2});
  const gear=game.api.normalizeGearItem({id:'isolate-'+variant,slot:'weapon',tier:0,rarity:'common',name:'Variant isolation',stats:{damagePct:2},gunVariant:variant,alignment:'VECTOR',power:100});
  game.api.garage.inventory=[gear];game.api.garage.equipped.weapon=gear.id;game.api.rebuildRunLoadout();
  results.variantReferences.push({variant,...snapshot(game)})
}
results.threat=sampleStages.map(stage=>({stage,...reference.api.sectorThreat(stage)}));
results.safetyChecks={freshGun1:results.baseline.gun===1&&results.baseline.rate===.16,currentDropNoPower:!gameSource.slice(gameSource.indexOf('function drop(e)'),gameSource.indexOf('function defeatEnemy')).includes("type:'power'"),moduleCountBeforeFinalApex:Object.values(reference.api.player.retrofits).reduce((a,b)=>a+b,0),doctrineCountBeforeFinalApex:reference.api.player.skillsSpent,maximumBuildHpScale:1.45};
assert.equal(results.safetyChecks.moduleCountBeforeFinalApex,10);assert.equal(results.safetyChecks.doctrineCountBeforeFinalApex,9);assert.equal(reference.api.player.gun,1);assert.equal(reference.api.player.rate,.16);
assert.equal(results.baseline.tapFront.total,6.25);assert.equal(results.baseline.chargeFront.total,6.4);assert.equal(results.kitReferences.find(r=>r.name==='first red Force').tapFront.total,18.75);
assert.ok(results.baseline.minimumChargeFront.total>results.baseline.chargeFront.total*1.7,'Minimum-charge throughput discrepancy should remain visible to this audit');
assert.ok(results.kitReferences.every(r=>r.bossHealthScale===1),'Acquired kit is not represented in current boss build scaling');
assert.equal(results.fieldSpawns[1].total.mean,146,'Authored first-level field beat count must remain intact');
results.recommendation={retain:'Keep gear, Doctrine and one miniboss module as separate build choices; count replacements and the finite ten-stage budget rather than adding every reward as a new permanent multiplier.',priority:['Reconcile stale serialized derived stats with equipped gear, while preserving earned kit and one-use resources.','Smooth minimum-charge output discontinuity: fast partial releases currently outdamage full charge substantially.','Evaluate early kit pickup saturation and Sync dual-trigger Force before globally shrinking small affix/Doctrine/module percentages.','Keep Delta/core-break resource budget and protection-window behavior explicit; this emitted-shot audit excludes Delta.'],limits:'Do not treat emitted total as guaranteed single-core DPS or a boss clear-time measurement. Accuracy, divergent lanes, exposure windows, contact, invulnerability and Delta need real encounter playtests.'};
const json=path.join(root,'artifacts','power-curve-audit.json');fs.mkdirSync(path.dirname(json),{recursive:true});fs.writeFileSync(json,JSON.stringify(results,null,2)+'\n');
const concise={artifact:path.relative(root,json),baseline:results.baseline.tapFront,kit:results.kitReferences.map(r=>({name:r.name,tap:r.tapFront.total,minimumCharge:r.minimumChargeFront.total,charged:r.chargeFront.total,bossScale:r.bossHealthScale})),spawns:Object.fromEntries(sampleStages.map(stage=>[stage,results.fieldSpawns[stage].total])),practical:Object.fromEntries(sampleStages.map(stage=>[stage,results.pickupReachability.practicalAssumption[stage]])),combined:results.combinedCurves.map(r=>({stage:r.stage,phase:r.phase,kit:r.kit,tap:r.tapFront.exposedCoreBudget,minimumCharge:r.minimumChargeFront.exposedCoreBudget,charge:r.chargeFront.exposedCoreBudget,hpScale:r.bossHealthScale})),variants:results.variantReferences.map(r=>({variant:r.variant,front:r.tapFront.exposedCoreBudget,deployed:r.tapDeployed.exposedCoreBudget,chargeDeployed:r.chargeDeployed.exposedCoreBudget,hpScale:r.bossHealthScale})),safetyChecks:results.safetyChecks,recommendation:results.recommendation};
fs.writeFileSync(path.join(root,'artifacts','power-curve-verification.txt'),'PASS read-only emitted-output, reward-budget, pickup and native fieldspawn audit\n'+JSON.stringify(concise,null,2)+'\n');
console.log(JSON.stringify(concise,null,2));
