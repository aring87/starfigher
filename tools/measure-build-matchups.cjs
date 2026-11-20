#!/usr/bin/env node
'use strict';

// Seeded diagnostics only: native Story updates and collision paths, private VM
// storage, no browser saves, no production edits, and no damage multipliers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const quick=arg('quick','no')==='yes',perkCount=Number(arg('perks','0'));
assert.ok([0,3].includes(perkCount),'--perks must be 0 or 3');
const label=arg('label','v149').replace(/[^a-z0-9_-]/gi,'_')+(perkCount?'_perks3':'');
const HZ=120,dt=1/HZ;
const requestedStages=arg('stages','1,5,10').split(',').map(Number),requestedPilots=arg('pilots','core-charge,front-tap').split(',');
assert.ok(requestedStages.length&&requestedStages.every(n=>[1,5,10].includes(n))&&new Set(requestedStages).size===requestedStages.length,'--stages accepts unique missions 1,5,10');
assert.ok(requestedPilots.length&&requestedPilots.every(n=>['core-charge','front-tap'].includes(n))&&new Set(requestedPilots).size===requestedPilots.length,'--pilots accepts core-charge,front-tap');
const original=fs.readFileSync(path.join(root,'game.js'),'utf8');
let source=original;
function hook(before,after){assert.ok(source.includes(before),'Missing native diagnostic hook: '+before);source=source.replace(before,after)}
source=source.replaceAll('shots.push(','matchupShotPush(');
hook('function damage(amount=1){','function damage(amount=1){matchupLedger.damageAttempts++;if(player.inv>0)matchupLedger.invulnerableAttempts++;');
hook('const hullLost=beforeHp-player.hp;','const hullLost=beforeHp-player.hp;matchupLedger.hullLost+=Math.max(0,hullLost);');
hook('const dealt=Math.min(node.hp,amount);node.hp-=dealt;','const dealt=Math.min(node.hp,amount);matchupLedger.connectedDamage+=dealt;node.hp-=dealt;');
hook('if(node){b.dead=true;damageWeakNode(e,node,b.d*player.weakDamage);','if(node){matchupLedger.coreHits++;b.dead=true;damageWeakNode(e,node,b.d*player.weakDamage);');
hook('b.dead=true;const chipped=damageBossArmor(e,b);','b.dead=true;const chipped=damageBossArmor(e,b);if(chipped)matchupLedger.armorHits++;else matchupLedger.blockedHits++;');
const podHook=source.includes('else if(!b.piercing&&pod.owned&&sweptHit(b,pod)){')?'else if(!b.piercing&&pod.owned&&sweptHit(b,pod)){':'else if(pod.owned&&sweptHit(b,pod)){';
hook(podHook+'b.dead=true;',podHook+'matchupLedger.forceBlocks++;b.dead=true;');
hook('if(bit){b.dead=true;','if(bit){matchupLedger.bitBlocks++;b.dead=true;');
hook('else if(sweptHit(b,player)){b.dead=true;','else if(sweptHit(b,player)){matchupLedger.playerProjectileContacts++;b.dead=true;');
const harnessFile=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(harnessFile,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
const accessors=`
  let matchupLedger;
  function matchupShotPush(...items){if(matchupLedger){matchupLedger.emittedShots+=items.length;for(const b of items)matchupLedger.emittedDamage[b.pod?'force':b.bit?'bits':b.missile?'missiles':'fighter']+=b.d||0}return shots.push(...items)}
  globalThis.__gameTest = {
    get matchupLedger(){return matchupLedger},
    get matchupRuleset(){return runRuleset},get matchupPerks(){return [...runProgression.perks]},
    get matchupGearRules(){return {slots:gearSlots,alignments:gearAlignments,affixes:gearAffixes,rarities:rarityData}},
    matchupSetup(stage,kind,meter,perks){
      wave=stage;beginStage(false);runEpicEncounter=null;boss=miniBoss=null;enemies=[];enemyShots=[];shots=[];pickups=[];stageHazards=[];
      stageIntro=0;stageHazardClock=spawn=999;miniBossSpawned=true;stagePostEliteClock=-1;stageApexIntro=-1;victoryDelay=null;t=0;
      // Award through the real validated reward API; mission 1 cannot have perks.
      for(let i=0;i<Math.min(perks,stage-1);i++){
        const desired=['precisionRelay','coreSurge','bitReclaimer'][i];let offered;
        for(let seed=0;seed<1000;seed++){offered=runRewards.offerPerks(runProgression,i+1,'matchup-'+seed);if(offered.offer.includes(desired))break}
        runProgression=runRewards.choosePerk(offered,i+1,desired);
      }
      applyRunPerks();const caps=enforceCombatProgression();
      for(let i=0;i<caps.force;i++)collectCombatPickup({type:'crystal',color:'red'});
      for(let i=0;i<caps.missile;i++)collectCombatPickup({type:'missile'});
      for(let i=0;i<caps.bits;i++)collectCombatPickup({type:'bit'});
      player.pod.mode='docked';player.pod.dockSide=player.pod.returnSide='front';player.pod.x=player.x+50;player.pod.y=player.y;
      enforceCombatProgression();if(kind==='boss')makeBoss();else makeMiniBoss();
      if(meter)player.inv=100000;
      matchupLedger={emittedShots:0,emittedDamage:{fighter:0,force:0,bits:0,missiles:0},connectedDamage:0,coreHits:0,armorHits:0,blockedHits:0,damageAttempts:0,invulnerableAttempts:0,hullLost:0,forceBlocks:0,bitBlocks:0,playerProjectileContacts:0};
      return caps;
    },
    matchupDeploy(){togglePod()},
`;
support=support.replace('  globalThis.__gameTest = {',accessors);
const isolated=new Module(harnessFile,module);isolated.filename=harnessFile;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};',harnessFile);
const {createGame}=isolated.exports;
const round=n=>Math.round(n*1000)/1000,copy=x=>JSON.parse(JSON.stringify(x));
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const piece=(slot,tier,intrinsic,alignment,stats,power=113)=>({slot,tier,[slot==='weapon'?'gunVariant':'trait']:intrinsic,alignment,stats,power});
const builds=[
  {id:'starter',name:'Starter (no permanent gear)',pieces:[]},
  {id:'siege-capacitor',name:'Focused Rare Siege + Capacitor',pieces:[piece('weapon',2,'siege','AEGIS',{damagePct:4,chargePct:5}),piece('armor',2,'capacitor','AEGIS',{hull:1,shields:1}),piece('engine',2,'vector','VECTOR',{chargePct:5,profilePct:4}),piece('pod',2,'shepherd','VECTOR',{podDamagePct:6,weakPct:5})]},
  {id:'sync-siphon',name:'Focused Rare Sync + Siphon',pieces:[piece('weapon',2,'sync','VECTOR',{damagePct:4,weakPct:5}),piece('armor',2,'ablative','AEGIS',{hull:1,shields:1}),piece('engine',2,'phase','AEGIS',{chargePct:5,profilePct:4}),piece('pod',2,'siphon','VECTOR',{podDamagePct:6,podSize:1})]},
  // There are only three alignments: a four-slot mixed build must repeat one.
  {id:'mixed',name:'Mixed Common/Rare, three alignments (2+1+1)',pieces:[piece('weapon',0,'arc','VANGUARD',{damagePct:3},103),piece('armor',2,'capacitor','AEGIS',{hull:1,evadePct:2}),piece('engine',0,'phase','VECTOR',{speedPct:3},103),piece('pod',2,'relay','VANGUARD',{podSize:1,shields:1})]},
  {id:'exotic-charge-ceiling',name:'Exotic four-piece Vanguard charged offense ceiling',pieces:[piece('weapon',4,'siege','VANGUARD',{damagePct:7,chargePct:8,weakPct:9},150),piece('armor',4,'capacitor','VANGUARD',{hull:1,shields:1,podSize:2},150),piece('engine',4,'vector','VANGUARD',{chargePct:8,profilePct:7,speedPct:8},150),piece('pod',4,'siphon','VANGUARD',{podDamagePct:10,weakPct:9,shields:1},150)]}
];
const statKeys=['hp','maxHp','shield','damage','chargeDamage','shieldedChargeBonus','chargeSpeed','podDamage','weakDamage','critChance','evade','speed','r','signalPower','resonance','doseGain','podBlockDose','shieldDose','podAuto','podMove','rearForce','weakBreakDose','weakOverdrive','bitDose'];
function fresh(build,stage,kind,meter,seed){
  const game=createGame({ruleset:'streamlined-v1'}),api=game.api;
  game.sandbox.__matchupRandom=seeded(seed);vm.runInContext('Math.random=globalThis.__matchupRandom',vm.createContext(game.sandbox));
  assert.equal(api.garage.inventory.length,0,'Fresh VM must have private empty storage');
  const rules=copy(api.matchupGearRules);
  for(const raw of build.pieces){
    const item=api.normalizeGearItem({...copy(raw),id:build.id+'-'+raw.slot,name:'Diagnostic '+raw.slot,source:'APEX ASTERPRINT'});
    assert.equal(Object.keys(item.stats).length,rules.rarities[raw.tier].affixes,'Use the actual rarity affix count');
    for(const [key,value] of Object.entries(item.stats)){
      const range=rules.affixes[item.slot].find(row=>row[0]===key)?.[2][item.tier];
      assert.ok(range&&value>=range[0]&&value<=range[1],item.slot+' '+key+' must be a legitimate roll');
    }
    assert.deepEqual(copy(item.stats),raw.stats,'Normalizer must not clamp an invented roll');
    api.garage.inventory.push(item);api.garage.equipped[item.slot]=item.id;
  }
  const gearBefore=copy(api.garage.equipped);api.start('story');
  assert.deepEqual(copy(api.garage.equipped),gearBefore,'New run must preserve fixture equipment');
  const caps=copy(api.matchupSetup(stage,kind,meter,perkCount)),p=api.player;
  assert.equal(api.matchupRuleset,'streamlined-v1');assert.equal(api.runMode,'story');assert.equal(api.bossLab,false);
  assert.equal(p.skillsSpent,0);assert.equal(Object.keys(p.skills).length,0);assert.equal(Object.keys(p.retrofits).length,0);
  assert.equal(p.hp,p.maxHp);assert.equal(p.maxHp,3+(build.pieces.find(g=>g.slot==='armor')?.stats.hull||0),'No DEV bonus hull');
  assert.equal(p.shield,Math.min(4,build.pieces.reduce((n,g)=>n+(g.stats.shields||0),0)+(build.pieces.filter(g=>g.alignment==='AEGIS').length>=2?1:0)),'Only native equipment starting shields, no DEV bonus');
  assert.equal(p.laserLevel,caps.force);assert.equal(p.missileLevel,caps.missile);assert.equal(p.bits,caps.bits);
  return{game,api,caps,rules,stats:Object.fromEntries(statKeys.map(key=>[key,p[key]??null])),gear:copy(api.garage.inventory),combos:copy(api.gearComboStates()).map(c=>({id:c.id,active:c.active,requirements:c.requirements}))};
}
function followCore(api,target){
  const p=api.player,nodes=api.activeWeakNodes(target).filter(n=>!n.destroyed),points=nodes.map(n=>api.worldWeakNode(target,n));
  // This instrumented pilot knows current core positions. It still moves using
  // real held keys and respects normal speed; it does not teleport or aim shots.
  const point=points.sort((a,b)=>Math.abs(a.y-p.y)-Math.abs(b.y-p.y))[0],dy=(point?.y??target.y)-p.y;
  api.keys.delete('ArrowUp');api.keys.delete('ArrowDown');if(dy<-3)api.keys.add('ArrowUp');if(dy>3)api.keys.add('ArrowDown');
}
function runCase(build,stage,kind,policy,meter=true,seconds=60){
  const seed=1103,{api,caps,stats,gear,combos}=fresh(build,stage,kind,meter,seed),target=kind==='boss'?api.boss:api.miniBoss;
  const startingHp=api.player.hp,startingShield=api.player.shield,max=target.max;
  if(policy==='core-charge'){api.keys.add('Space');if(api.player.podAuto)api.matchupDeploy()}
  let elapsed=0,phaseAt=null,killAt=null,exposedSeconds=0,damageableSeconds=0,lastPhase=target.phase||1,decide=-1;
  for(let tick=0;tick<Math.ceil(seconds*HZ)&&api.state==='playing';tick++){
    if(policy==='core-charge'&&elapsed-decide>=.1){followCore(api,target);decide=elapsed}
    if(policy==='core-charge'?api.player.charge>=1-1e-9:api.player.fire<=0)api.releaseCharge();
    const allowed=!(target.intro>0||target.phaseTransition>0||target.hidden||target.ritual);
    if(allowed)damageableSeconds+=dt;if(allowed&&target.weakOpen)exposedSeconds+=dt;
    api.update(dt);elapsed+=dt;
    if((target.phase||1)>lastPhase){phaseAt??=elapsed;lastPhase=target.phase}
    if(target.hp<=0){killAt=elapsed;break}
  }
  const m=copy(api.matchupLedger),hp=Math.max(0,target.hp),connected=m.coreHits+m.armorHits;
  assert.ok(Number.isFinite(m.connectedDamage)&&m.connectedDamage>=0);assert.ok(m.connectedDamage<=max+.01);
  assert.ok(connected+m.blockedHits<=m.emittedShots,'A boss hit cannot exceed actual emitted projectiles');
  assert.ok(Math.abs((max-hp)-m.connectedDamage)<.1,'Connected ledger must match native boss HP depletion');
  return{stage,kind,boss:target.def.name,build:build.id,policy,meter,seed,perks:copy(api.matchupPerks),kit:caps,stats,gear,combos,seconds:round(elapsed),maxHp:max,remainingHp:round(hp),damage:round(m.connectedDamage),connectedDps:round(m.connectedDamage/elapsed),hpDepletedPct:round((max-hp)/max*100),timeToPhase:phaseAt===null?null:round(phaseAt),timeToKill:killAt===null?null:round(killAt),phaseAtEnd:target.phase||1,partsBroken:api.runStats.weakspotsDestroyed,hitRatioPct:round(connected/Math.max(1,m.emittedShots)*100),damageableSeconds:round(damageableSeconds),exposedSeconds:round(exposedSeconds),endingState:api.state,survived:api.state!=='gameover',startingHull:startingHp,endingHull:api.player.hp,startingShield,endingShield:api.player.shield,...m,connectedDamage:round(m.connectedDamage)};
}
const started=Date.now();
const result={source:'game.js',sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),label,generatedAt:new Date().toISOString(),ruleset:'streamlined-v1',assumptions:{storage:'Fresh seeded private VM Map per case; real browser profiles are never accessed.',combat:'Real update, charge, native movement, weak-opening and swept collision paths at 120 Hz; no forged damage scalars, weak-node damage calls, target repositioning or projectile edits.',scope:'Isolated Story encounters with actual mission pickup caps and full earned red Force/missile/Bit kit. No field attrition. This is a fixture of a plausible acquired kit, not proof that every player acquires it.',gear:'Each fixture has valid rarity-specific affix counts and bounded actual roll values. Gear survives start(story) and native loadout application. Power calibration is capped natively. The Exotic fixture is an intentional maximum-roll charged-offense ceiling at attainable Power 150, not a typical drop or a proof of universal optimum.',mixed:'Only three sets exist. Four different set alignments are impossible; mixed uses all three in a 2+1+1 arrangement and mismatched intrinsic pairs.',perks:perkCount?'Three earned native perks (Precision Relay, Core Surge, Bit Reclaimer) at missions 5/10; mission 1 has zero because no apex has been beaten. No Delta activations.':'Zero run perks in every case. Use --perks=3 for the earned three-perk sensitivity fixture at missions 5/10.',meter:'Outgoing-damage snapshots set only player.inv high after normal Story setup. Native damage/contact attempts are counted, but these rows cannot measure survival. Shields remain, so shield-conditioned charge receives its best-case uptime. Incoming shots and Force/Bit interceptions still run.',survival:'Normal starting hull/shields/invulnerability and real collision damage in separate rows; the pilots do not dodge. These rows are diagnostics, not human balance or skill ratings.',pilots:'core-charge follows the nearest current living core vertically using physical Arrow keys every 100 ms and releases at full charge; Sync deploys Force to exercise its native auto-fire. front-tap stays at spawn center with front-docked Force and taps whenever the native fire timer permits. No bullet dodging, forward motion, Delta or targeting prediction.',timing:'Includes native entry invulnerability, native weak windows and phase transitions. Null phase/kill time means not reached before the finite snapshot/death, never an extrapolated kill estimate.'},builds:builds.map(b=>({id:b.id,name:b.name})),meter:[],survival:[]};
const stageList=quick?[1]:requestedStages,buildList=quick?builds.filter(b=>['starter','siege-capacitor','exotic-charge-ceiling'].includes(b.id)):builds;
result.assumptions.breaks='partsBroken counts the native runStats.weakspotsDestroyed counter (individual broken cores), not emitted sprite fragment groups. Rendering is mocked; destruction art quality is outside this logic diagnostic.';
result.dimensions={hz:HZ,stages:stageList,pilots:requestedPilots,mini:!quick&&arg('mini','yes')!=='no',perksRequested:perkCount};
for(const stage of stageList){
  for(const build of buildList)for(const policy of requestedPilots)result.meter.push(runCase(build,stage,'boss',policy,true,60));
  console.log('MISSION '+stage+' '+JSON.stringify(result.meter.filter(r=>r.stage===stage).map(r=>({build:r.build,pilot:r.policy,hp:r.maxHp,damage:r.damage,phase:r.timeToPhase,kill:r.timeToKill,hitPct:r.hitRatioPct,parts:r.partsBroken}))));
}
if(result.dimensions.mini)for(const stage of stageList)for(const build of buildList)result.meter.push(runCase(build,stage,'mini','core-charge',true,30));
for(const stage of stageList)for(const build of buildList)result.survival.push(runCase(build,stage,'boss','core-charge',false,30));
result.runtimeSeconds=round((Date.now()-started)/1000);
result.totalSimulatedSeconds=round([...result.meter,...result.survival].reduce((sum,r)=>sum+r.seconds,0));
result.summary=result.meter.map(({stage,kind,boss,build,policy,maxHp,damage,connectedDps,timeToPhase,timeToKill,hitRatioPct,partsBroken,seconds})=>({stage,kind,boss,build,policy,maxHp,damage,connectedDps,timeToPhase,timeToKill,hitRatioPct,partsBroken,seconds}));
const artifact=path.join(root,'artifacts','build-matchups-'+label+(quick?'-quick':''));
fs.mkdirSync(path.dirname(artifact),{recursive:true});fs.writeFileSync(artifact+'.json',JSON.stringify(result,null,2)+'\n');
const text=['# Actual connected build matchups', '', 'Source SHA-256: `'+result.sourceSha256+'`. '+result.ruleset+'. '+result.assumptions.perks,'', 'Native Story encounters, actual mission-capped full red kit, no DEV hull/shields. Meter rows preserve native attacks and collision while making the player invulnerable; the separate normal-hull rows below measure only these scripted pilots. Neither is a human balance verdict. All times include entry and phase transition.', '', '| Mission | Target | Build | Pilot | HP | Damage | DPS | Phase (s) | Kill (s) | Hit % | Cores |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|',...result.summary.map(r=>'| '+[r.stage,r.kind,r.build,r.policy,r.maxHp,r.damage,r.connectedDps,r.timeToPhase??'—',r.timeToKill??'—',r.hitRatioPct,r.partsBroken].join(' | ')+' |'),'', 'A dash means the finite snapshot did not reach that milestone; no kill time is extrapolated. Main snapshots stop at 60 seconds, minis at 30. Hit % counts emitted projectiles that dealt core or armor damage, not damage efficiency. Armor deals its native 25% chip; weak cores use native multipliers. Cores (partsBroken in JSON) counts native weakspotsDestroyed, not visual sprite groups. Rendering is mocked, so this does not certify destruction artwork.', '', '| Mission | Build | Seconds | Survived | Hull start/end | Shield start/end | Damage | Contacts | Hull lost |', '|---|---|---:|---|---|---|---:|---:|---:|',...result.survival.map(r=>'| '+[r.stage,r.build,r.seconds,r.survived?'yes':'no',r.startingHull+'/'+r.endingHull,r.startingShield+'/'+r.endingShield,r.damage,r.playerProjectileContacts,r.hullLost].join(' | ')+' |'),'', 'Build definitions, exact rolls, native applied stats, set resonance, intrinsic requirements and raw attempt counters are in the JSON. Focused Rare rolls are moderate; the Exotic four-piece Vanguard fixture intentionally uses valid maximum offense rolls. Only three alignments exist, so the mixed four-slot build is necessarily 2+1+1. Sync deploys Force in core-charge; other pilots keep front-docked Force. Defense/DOSE and utility are not interchangeable with direct DPS; Delta is unused.', '', 'Three-perk sensitivity: `node tools/measure-build-matchups.cjs --perks=3 --label='+label.replace(/_perks3$/,'')+'`. Mission 1 correctly stays at zero earned perks. Reproducible seed 1103; private mock saves only. '+result.meter.length+' meter and '+result.survival.length+' normal-hull snapshots; '+result.totalSimulatedSeconds+' simulated seconds in '+result.runtimeSeconds+' wall seconds.',''];
fs.writeFileSync(artifact+'.md',text.join('\n'));
console.log('PASS '+result.meter.length+' meter + '+result.survival.length+' normal-hull matchups; '+result.runtimeSeconds+' wall seconds.\n'+artifact+'.json\n'+artifact+'.md');
