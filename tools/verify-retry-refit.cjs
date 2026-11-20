#!/usr/bin/env node
'use strict';
// Production loss, Garage, retry and persistence paths in disposable VM pilots.
// This never opens a browser, accesses a real pilot, or changes shipped source.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');
support=support.slice(0,support.indexOf('\ntest(')).replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
  over,retryLastCheckpoint,restartCurrentRun,applyRunPerks,switchProfile,
  get retryPoint(){return retryPoint},get lossGarageContext(){return lossGarageContext},
  get progression(){return runProgression},get runRuleset(){return runRuleset},get runEpoch(){return runEpoch},
  get lastCombatLoss(){return lastCombatLoss},
  installRetryPoint(point){retryPoint=point},installLossGarageContext(value){lossGarageContext=value},
  forceGarageScreen(){state='garage'},
  installPerks(ids){const checked=runRewards.validate({...runRewards.fresh(),perks:ids});if(!checked)throw new Error('Invalid test perks');runProgression=checked;applyRunPerks()},
  retryRefitFixture(stage=5){
    wave=stage;beginStage(false,false);t=59;miniBossSpawned=true;stagePostEliteClock=11;
    miniBoss=boss=null;enemies=[];enemyShots=[];shots=[];pickups=[];stageHazards=[];
    stageIntro=0;stageApexIntro=-1;stageHazardClock=spawn=999;victoryDelay=null;
    player.x=145;player.y=H/2;player.inv=0;player.evade=0;clearInput();state='playing';
  },
`);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const {createGame}=isolated.exports,results=[];
const plain=value=>JSON.parse(JSON.stringify(value)),near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function check(name,fn){if(process.env.STARFIGHTER_RETRY_REFIT_FILTER&&!name.includes(process.env.STARFIGHTER_RETRY_REFIT_FILTER))return;try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function game(ruleset='streamlined-v1'){const g=createGame({ruleset:'streamlined-v1'});g.api.start('story',1,ruleset);g.api.retryRefitFixture();return g}
function fatal(g){const a=g.api;Object.assign(a.player,{hp:1,inv:0,shield:0,evade:0,ablativeReady:false,secondChanceReady:false});a.damage(1,{kind:'projectile',pressureLance:true,piercing:true});assert.equal(a.state,'gameover');assert.equal(a.player.hp,0)}
function saveLoss(g,segment='postElite'){g.api.saveRunCheckpoint(segment);const checkpoint=plain(g.api.profile.checkpoint);fatal(g);assert.ok(g.api.retryPoint);return checkpoint}
function open(g){g.find('#garage-btn').onclick();assert.equal(g.api.state,'garage');assert.ok(g.api.lossGarageContext)}
function apply(g){g.find('#garage-launch-btn').onclick()}
function gear(g,slot,id,stats={},trait){const item=g.api.normalizeGearItem({id,slot,tier:2,name:id,power:114,alignment:'VANGUARD',stats,gunVariant:slot==='weapon'?'siege':null,trait:slot==='weapon'?null:trait||({armor:'capacitor',engine:'vector',pod:'relay'})[slot]});g.api.garage.inventory.push(item);return item}
function equip(g,item){g.api.garage.equipped[item.slot]=item.id}
function reload(g){const next=createGame({ruleset:'streamlined-v1',initialStorage:[...g.storage]});next.api.loadGame();return next}
function report(g){return{cause:g.find('#loss-cause').textContent,tip:g.find('#loss-tip').textContent,score:g.find('#final-score').textContent,stats:g.find('#final-stats').textContent}}

check('Garage Back returns to the exact flight report and retains the original retry without banking again',()=>{
  const g=game(),a=g.api;saveLoss(g);const point=a.retryPoint,epoch=a.runEpoch,flightReport=report(g),profile=plain(a.profile),live=plain(a.player);
  open(g);assert.match(g.find('#garage-launch-btn').textContent,/APPLY.*RETRY/);assert.match(g.find('#garage-back-btn').textContent,/FLIGHT REPORT/);assert.equal(g.find('#garage-return-note').hidden,false);
  g.find('#garage-back-btn').onclick();assert.equal(a.state,'gameover');assert.equal(a.retryPoint,point);assert.equal(a.runEpoch,epoch);assert.equal(a.lossGarageContext,null);assert.deepEqual(report(g),flightReport);assert.deepEqual(plain(a.profile),profile);assert.deepEqual(plain(a.player),live);
  open(g);g.find('#garage-back-btn').onclick();assert.deepEqual(plain(a.profile),profile);assert.equal(a.retryLastCheckpoint(),true);assert.equal(a.wave,5);
});

check('Escape returns from the loss Garage without applying equipment or discarding checkpoint retry',()=>{
  const g=game(),a=g.api,saved=saveLoss(g),point=a.retryPoint;open(g);equip(g,gear(g,'weapon','escape-only-weapon',{damagePct:7}));
  g.sandbox.dispatchEvent({type:'keydown',code:'Escape',repeat:false,target:g.document.body});assert.equal(a.state,'gameover');assert.equal(a.retryPoint,point);assert.equal(a.profile.checkpoint,null);assert.equal(a.player.hp,0);
  assert.equal(a.retryLastCheckpoint(),true);assert.equal(a.player.damage,saved.player.damage);assert.equal(a.player.weaponVariant,saved.player.weaponVariant);
});

check('Apply and Retry restores checkpoint resources and kit before rebuilding and persists its new build',()=>{
  const g=game(),a=g.api;a.installPerks(['precisionRelay','secondChance','deltaReserve']);
  Object.assign(a.player,{hp:2,shield:1,dose:43,laserColor:'blue',laserLevel:3,missileLevel:2,bits:2,secondChanceReady:false,ablativeOwned:true,ablativeReady:false});a.player.pod.owned=true;a.player.pod.dockSide=a.player.pod.returnSide='rear';
  const saved=saveLoss(g),life=plain(a.profile.lifetime);open(g);equip(g,gear(g,'armor','refit-hull',{hull:1,shields:1},'ablative'));equip(g,gear(g,'weapon','refit-siege',{damagePct:7}));apply(g);
  assert.equal(a.state,'playing');assert.equal(a.wave,5);assert.equal(a.runSegment,'postElite');assert.equal(a.runRuleset,'streamlined-v1');assert.equal(a.player.maxHp,4);assert.equal(a.player.hp,2);assert.equal(a.player.shield,1);assert.equal(a.player.dose,43);assert.equal(a.player.ablativeReady,false);assert.equal(a.player.secondChanceReady,false);assert.equal(a.player.laserLevel,3);assert.equal(a.player.missileLevel,2);assert.equal(a.player.bits,2);assert.equal(a.player.pod.dockSide,'rear');assert.equal(a.player.weaponVariant,'siege');assert.ok(a.player.damage>saved.player.damage);
  assert.deepEqual(plain(a.progression),saved.progression);assert.deepEqual(plain(a.profile.lifetime),life);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));assert.equal(a.profile.checkpoint.player.maxHp,4);assert.equal(a.profile.checkpoint.player.damage,a.player.damage);assert.equal(a.profile.checkpoint.player.shield,1);assert.equal(a.profile.checkpoint.stageClock,saved.stageClock);assert.equal(a.profile.checkpoint.postEliteClock,saved.postEliteClock);assert.equal(a.lossGarageContext,null);assert.equal(a.retryPoint,null);
  const restored=reload(g).api;assert.equal(restored.state,'playing');assert.equal(restored.wave,5);assert.equal(restored.player.damage,a.player.damage);assert.equal(restored.player.hp,2);assert.equal(restored.player.shield,1);assert.equal(restored.player.secondChanceReady,false);assert.equal(restored.player.ablativeReady,false);assert.deepEqual(plain(restored.progression),saved.progression);
});

check('lower maximum hull clamps once and repeated Apply retries add no healing, shields or stat multipliers',()=>{
  const g=game(),a=g.api;equip(g,gear(g,'armor','old-hull',{hull:1,shields:1},'ablative'));a.start('story',1,'streamlined-v1');a.retryRefitFixture();a.installPerks(['secondChance','coreSurge']);Object.assign(a.player,{hp:4,shield:0,dose:27,secondChanceReady:false,ablativeReady:false});saveLoss(g);open(g);a.garage.equipped.armor=null;equip(g,gear(g,'weapon','constant-siege',{damagePct:5}));apply(g);
  assert.equal(a.player.maxHp,3);assert.equal(a.player.hp,3);assert.equal(a.player.shield,0);assert.equal(a.player.dose,27);assert.equal(a.player.secondChanceReady,false);const damage=a.player.damage,charge=a.player.chargeDamage;
  for(let pass=0;pass<3;pass++){fatal(g);open(g);apply(g);assert.equal(a.player.maxHp,3);assert.equal(a.player.hp,3);assert.equal(a.player.shield,0);assert.equal(a.player.dose,27);assert.equal(a.player.secondChanceReady,false);near(a.player.damage,damage);near(a.player.chargeDamage,charge)}
});

check('explicit Apply rebuilds equipped gear even if no gear changed during this Garage visit',()=>{
  const g=game(),a=g.api;saveLoss(g);equip(g,gear(g,'weapon','already-equipped-after-checkpoint',{damagePct:6}));open(g);apply(g);assert.equal(a.state,'playing');assert.equal(a.player.weaponVariant,'siege');assert.ok(a.player.damage>1);assert.equal(a.profile.checkpoint.player.weaponVariant,'siege');
});

check('plain Retry keeps the exact recorded build after visiting Garage and changing equipped gear',()=>{
  const g=game(),a=g.api;Object.assign(a.player,{hp:2,shield:2,damage:1.271});const saved=saveLoss(g);open(g);equip(g,gear(g,'weapon','plain-retry-new-gear',{damagePct:7}));g.find('#garage-back-btn').onclick();assert.equal(a.retryLastCheckpoint(),true);assert.equal(a.player.damage,1.271);assert.equal(a.player.hp,2);assert.equal(a.player.shield,2);assert.equal(a.player.weaponVariant,saved.player.weaponVariant);assert.equal(a.profile.checkpoint.player.damage,1.271);
});

check('classic retry refit preserves its ruleset, skills and modules without regranting recovery or guards',()=>{
  const g=game('classic-v1'),a=g.api;a.player.skillPoints=2;a.learnSkill(a.skillPaths[0].nodes[0]);a.learnSkill(a.skillPaths[1].nodes[5]);a.player.retrofits={fieldPatch:2,aegisReserve:1,chargeBaffle:1};Object.assign(a.player,{hp:2,shield:0,dose:21,ablativeOwned:true,ablativeReady:false,secondChanceReady:false});a.saveRunCheckpoint('postElite');delete a.profile.checkpoint.ruleset;delete a.profile.checkpoint.buildVersion;const saved=plain(a.profile.checkpoint);fatal(g);open(g);equip(g,gear(g,'weapon','classic-siege',{damagePct:5}));equip(g,gear(g,'armor','classic-armor',{shields:1},'ablative'));apply(g);
  assert.equal(a.state,'playing');assert.equal(a.runRuleset,'classic-v1');assert.equal(a.profile.checkpoint.ruleset,'classic-v1');assert.equal(a.profile.checkpoint.progression,undefined);assert.equal(a.player.hp,2);assert.equal(a.player.shield,0);assert.equal(a.player.dose,21);assert.equal(a.player.ablativeReady,false);assert.equal(a.player.secondChanceReady,false);assert.deepEqual(plain(a.player.skills),saved.player.skills);assert.deepEqual(plain(a.player.retrofits),saved.player.retrofits);assert.equal(a.player.skillsSpent,2);near(a.player.chargeSpeed,1.06);near(a.player.weakDamage,1.04*1.04);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
});

check('failed attempt loot and lifetime totals are counted once across Garage visits and repeated refit deaths',()=>{
  const g=game(),a=g.api;Object.assign(a.runStats,{normalBosses:4,miniBosses:4,gearCollected:4});a.setRunTotals(900,40,70);const item=gear(g,'weapon','bank-once-drop',{damagePct:5});a.garage.inventory=a.garage.inventory.filter(gear=>gear.id!==item.id);a.collectGear(item);saveLoss(g);const first=plain(a.profile.lifetime),inventory=plain(a.garage.inventory);assert.equal(inventory.filter(gear=>gear.id===item.id).length,1);assert.equal(first.kills,40);assert.equal(first.bosses,4);assert.equal(first.gear,5);assert.equal(first.playSeconds,70);
  open(g);g.find('#garage-back-btn').onclick();open(g);equip(g,a.garage.inventory.find(gear=>gear.id===item.id));apply(g);assert.deepEqual(plain(a.profile.lifetime),first);assert.equal(a.runLoot.length,0);assert.equal(a.runStats.gearCollected,0);assert.equal(a.runStats.normalBosses,0);assert.equal(a.runElapsed,0);assert.equal(a.profile.checkpoint.score,0);assert.equal(a.profile.checkpoint.kills,0);assert.equal(a.profile.checkpoint.elapsed,0);assert.equal(a.profile.checkpoint.cleared,0);
  for(let attempt=0;attempt<2;attempt++){fatal(g);assert.equal(a.profile.lifetime.runs,first.runs+attempt+1);for(const key of['kills','bosses','miniBosses','gear','playSeconds'])assert.equal(a.profile.lifetime[key],first[key],key+' must not be booked twice');assert.deepEqual(plain(a.garage.inventory),inventory);open(g);apply(g)}
});

check('Rush and mission replay refit retry the current checkpoint mode and mission',()=>{
  const rush=createGame({ruleset:'streamlined-v1'});rush.api.start('rush');rush.api.setWave(5);Object.assign(rush.api.player,{hp:5,shield:1,dose:64});saveLoss(rush,'apex');open(rush);equip(rush,gear(rush,'weapon','rush-siege',{damagePct:5}));apply(rush);assert.equal(rush.api.state,'playing');assert.equal(rush.api.runMode,'rush');assert.equal(rush.api.wave,5);assert.equal(rush.api.player.maxHp,8);assert.equal(rush.api.player.hp,5);assert.equal(rush.api.player.shield,1);assert.equal(rush.api.player.dose,64);assert.ok(rush.api.stageApexIntro>0);assert.equal(rush.api.player.laserLevel,3);
  const replay=createGame({ruleset:'streamlined-v1'});replay.api.profile.progress.missionsCleared[3]=true;replay.api.start('replay',4);replay.api.retryRefitFixture(4);saveLoss(replay,'mission');open(replay);equip(replay,gear(replay,'weapon','replay-siege',{damagePct:5}));apply(replay);assert.equal(replay.api.state,'playing');assert.equal(replay.api.runMode,'replay');assert.equal(replay.api.runStartWave,4);assert.equal(replay.api.wave,4);
});

check('overcapacity Garage disables Apply and direct activation cannot consume the retry point',()=>{
  const g=game(),a=g.api;saveLoss(g);open(g);const point=a.retryPoint;for(let i=0;i<33;i++)gear(g,'weapon','capacity-'+i);a.renderGarage();assert.equal(g.find('#garage-launch-btn').disabled,true);apply(g);assert.equal(a.state,'garage');assert.equal(a.retryPoint,point);assert.equal(a.profile.checkpoint,null);g.find('#garage-back-btn').onclick();assert.equal(a.state,'gameover');assert.equal(a.retryPoint,point);
});

check('stale profile, epoch, retry identity and malformed snapshots cannot overwrite or launch another checkpoint',()=>{
  for(const kind of['profile','epoch','identity','malformed']){
    const g=game(),a=g.api;saveLoss(g);open(g);const point=a.retryPoint,context=a.lossGarageContext;
    if(kind==='profile')a.switchProfile(1);
    else if(kind==='epoch'){a.start('story');a.installRetryPoint(point);a.installLossGarageContext(context);a.forceGarageScreen()}
    else if(kind==='identity')a.installRetryPoint({...point});
    else point.saved.ruleset='future-ruleset-v999';
    const checkpoint=JSON.stringify(a.profile.checkpoint),profile=plain(a.profile),epoch=a.runEpoch;apply(g);assert.notEqual(a.state,'playing',kind+' must not launch');assert.equal(JSON.stringify(a.profile.checkpoint),checkpoint,kind+' checkpoint must not be overwritten');assert.deepEqual(plain(a.profile),profile,kind+' profile must not be overwritten');assert.equal(a.runEpoch,epoch,kind+' must not reset a run');
  }
});

const failed=results.filter(result=>!result.passed);console.log(`${results.length-failed.length} retry/refit checks passed, ${failed.length} failed`);if(failed.length)process.exitCode=1;
