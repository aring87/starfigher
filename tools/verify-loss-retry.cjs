#!/usr/bin/env node
'use strict';
// Native combat, checkpoint and profile paths in disposable VM pilots only.
// No browser storage or real pilot is opened by this verifier.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');
support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
  over,restartCurrentRun,retryLastCheckpoint,captureRetryPoint,updateBossFight,applyRunPerks,switchProfile,bitPositions,
  ...(typeof restartRunFromStart==='function'?{restartRunFromStart}:{}),
  get lastCombatLoss(){return lastCombatLoss},get retryPoint(){return retryPoint},
  get progression(){return runProgression},get runRuleset(){return runRuleset},get runEpoch(){return runEpoch},
  installRetryPoint(point){retryPoint=point},forceLossScreen(){state='gameover'},
  installPerks(ids){const checked=runRewards.validate({...runRewards.fresh(),perks:ids});if(!checked)throw new Error('Invalid test perks');runProgression=checked;applyRunPerks()},
  lossFixture(stage=5,post=true,clock=12){
    wave=stage;beginStage(false,false);t=(post?48:0)+clock;
    miniBossSpawned=post;stagePostEliteClock=post?clock:-1;
    miniBoss=boss=null;enemies=[];enemyShots=[];shots=[];pickups=[];stageHazards=[];
    stageIntro=0;stageApexIntro=-1;stageHazardClock=spawn=999;victoryDelay=null;
    player.x=145;player.y=H/2;player.inv=0;player.evade=0;player.shield=0;
    player.ablativeReady=false;player.secondChanceReady=false;player.pod.owned=false;
    clearInput();state='playing';
  },
  lossRoll(value){Math.random=()=>value},
`);
// Keep this verifier usable before the shared harness list is updated.
if(!support.includes("'combat-loss.js'"))support=support.replace('for(const script of [',"for(const script of ['combat-loss.js',");
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const {createGame}=isolated.exports,model=require('../combat-loss.js'),results=[];
const plain=value=>JSON.parse(JSON.stringify(value));
const step=1/120;
function check(name,fn){if(process.env.STARFIGHTER_LOSS_TEST_FILTER&&!name.includes(process.env.STARFIGHTER_LOSS_TEST_FILTER))return;try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function game(ruleset='streamlined-v1',options={}){const g=createGame({ruleset:'streamlined-v1',...options});g.api.start('story',1,ruleset);g.api.lossFixture();return g}
function fatal(api,source={kind:'projectile'}){api.player.hp=1;api.player.inv=0;api.player.shield=0;api.player.evade=0;api.player.ablativeReady=api.player.secondChanceReady=false;api.damage(1,source);assert.equal(api.state,'gameover');assert.equal(api.player.hp,0)}
function lossIs(api,source){const expected=model.describe(source);assert.ok(api.lastCombatLoss,'Fatal actual damage must identify its source');assert.equal(api.lastCombatLoss.key,expected.key);assert.ok(api.lastCombatLoss.label&&api.lastCombatLoss.tip,'Loss feedback includes a plain cause and one useful response')}
function bullet(api,extra={}){api.enemyShots.push({x:api.player.x,y:api.player.y,r:5,vx:0,vy:0,damage:1,...extra})}

check('loss descriptions distinguish actionable danger families with a safe unknown fallback',()=>{
  const descriptions=[
    {kind:'projectile'},{kind:'projectile',pressureLance:true,piercing:true},
    {kind:'projectile',wall:true,piercing:true},{kind:'projectile',homing:1.25},
    {kind:'hazard',hazardType:'debris'},{kind:'hazard',hazardType:'gate',variant:'metal'},
    {kind:'hazard',hazardType:'well'},{kind:'beam'},
    {kind:'contact',enemyName:'THE BLOODSTAR'},{kind:'toxin'}
  ].map(source=>model.describe(source));
  for(const value of descriptions){assert.equal(typeof value.key,'string');assert.ok(value.key);assert.equal(typeof value.label,'string');assert.equal(typeof value.tip,'string');assert.ok(value.label.length&&value.tip.length)}
  assert.ok(new Set(descriptions.slice(0,4).map(value=>value.key)).size>=3,'Pink, aimed amber, wall and tracking fire should not share one generic response');
  for(const input of[undefined,null,{}, {kind:'unrecognized'}])assert.doesNotThrow(()=>model.describe(input));
});

check('invulnerable, evaded and shielded hits cannot create a false hull-loss explanation',()=>{
  const {api}=game();assert.equal(api.lastCombatLoss,null);
  api.player.inv=5;api.damage(1,{kind:'beam'});assert.equal(api.player.hp,3);assert.equal(api.lastCombatLoss,null);
  api.player.inv=0;api.player.evade=1;api.lossRoll(0);api.damage(1,{kind:'toxin'});assert.equal(api.player.hp,3);assert.equal(api.lastCombatLoss,null);
  api.player.inv=0;api.player.evade=0;api.player.shield=1;api.damage(1,{kind:'projectile',wall:true,piercing:true});assert.equal(api.player.hp,3);assert.equal(api.player.shield,0);assert.equal(api.lastCombatLoss,null);
  fatal(api,{kind:'contact',enemyName:'DRONE'});lossIs(api,{kind:'contact',enemyName:'DRONE'});
});

check('native hostile projectile collisions report ordinary, lance, wall and tracking causes',()=>{
  for(const extra of[{}, {pressureLance:true,piercing:true},{wall:true,piercing:true},{homing:1.25}]){
    const {api}=game();api.player.hp=1;bullet(api,extra);api.update(step);
    assert.equal(api.state,'gameover');lossIs(api,{kind:'projectile',...extra});
  }
});

check('Force and Bits still intercept pink fire while amber remains attributable to its real collision',()=>{
  for(const protection of['force','bit']){
    const {api}=game();api.player.pod.owned=protection==='force';api.player.pod.mode='docked';api.player.pod.dockSide='front';
    if(protection==='bit')api.player.bits=1;
    api.update(step);api.player.inv=0;
    const point=protection==='force'?api.player.pod:api.bitPositions()[0];
    assert.ok(point);api.enemyShots.push({x:point.x,y:point.y,r:5,vx:0,vy:0,damage:1});api.update(step);
    assert.equal(api.player.hp,3);assert.equal(api.lastCombatLoss,null);assert.equal(api.enemyShots.length,0);
    api.player.hp=1;api.player.inv=0;bullet(api,{pressureLance:true,piercing:true});api.update(step);
    assert.equal(api.state,'gameover');lossIs(api,{kind:'projectile',pressureLance:true,piercing:true});
  }
});

check('native gate collision, boss beam and ritual toxin retain distinct loss explanations',()=>{
  {
    const {api}=game();api.player.hp=1;
    api.stageHazards.push({type:'gate',variant:'metal',x:api.player.x,gapY:api.player.y+180,gap:140,width:52,speed:0,warn:0,life:8,phase:0,color:'#fff'});
    api.update(step);assert.equal(api.state,'gameover');lossIs(api,{kind:'hazard',hazardType:'gate',variant:'metal'});
  }
  {
    const {api}=game();api.setWave(9);api.makeBoss();Object.assign(api.boss,{intro:0,phase:2,x:710,y:270,cool:999,laser:{y:api.player.y,t:.65}});
    api.player.hp=1;api.player.inv=0;api.updateBossFight(api.boss,step);
    assert.equal(api.state,'gameover');lossIs(api,{kind:'beam'});
  }
  {
    const {api}=game();api.player.hp=1;api.player.inv=999;api.player.shield=3;
    api.updateEpicToxin({phase:2,toxinProtected:false,toxinTick:0,epicId:1,def:{name:'MIASMA SOVEREIGN'}},step);
    assert.equal(api.state,'gameover');assert.equal(api.player.shield,3);lossIs(api,{kind:'toxin'});
  }
});

check('late Story retry preserves its recorded build, three perks and spent mission guards',()=>{
  const {api}=game();api.installPerks(['precisionRelay','secondChance','deltaReserve']);
  Object.assign(api.player,{hp:2,shield:2,damage:1.19,laserLevel:3,missileLevel:2,bits:2,secondChanceReady:false});
  api.player.pod.owned=true;api.player.laserColor='blue';api.player.pod.dockSide='rear';
  api.saveRunCheckpoint('postElite');const saved=plain(api.profile.checkpoint),garage=plain(api.garage);
  fatal(api);assert.ok(api.retryPoint);assert.equal(api.profile.checkpoint,null);
  assert.equal(api.retryLastCheckpoint(),true);assert.equal(api.state,'playing');assert.equal(api.wave,5);assert.equal(api.runMode,'story');assert.equal(api.runRuleset,'streamlined-v1');
  assert.deepEqual(plain(api.progression),saved.progression);assert.equal(api.player.damage,1.19);assert.equal(api.player.hp,2);assert.equal(api.player.shield,2);assert.equal(api.player.laserLevel,3);assert.equal(api.player.pod.dockSide,'rear');assert.equal(api.player.secondChanceReady,false);
  assert.deepEqual(plain(api.garage),garage);assert.equal(api.runStats.normalBosses,0);assert.equal(api.runStats.gearCollected,0);assert.equal(api.runElapsed,0);assert.equal(api.profile.checkpoint.score,0);assert.ok(api.validateRunCheckpoint(api.profile.checkpoint));
});

check('untagged classic retry restores legacy skills and consumed guards without applying Garage twice',()=>{
  const {api}=game('classic-v1');api.player.skillPoints=1;const node=api.skillPaths.flatMap(path=>path.nodes).find(node=>node.id==='a6');api.learnSkill(node);
  Object.assign(api.player,{hp:2,damage:1.73,ablativeOwned:true,ablativeReady:false,secondChanceReady:false});
  api.saveRunCheckpoint('mission');delete api.profile.checkpoint.ruleset;delete api.profile.checkpoint.buildVersion;
  const skillBuild=plain(api.player.skills);fatal(api);assert.equal(api.retryLastCheckpoint(),true);
  assert.equal(api.runRuleset,'classic-v1');assert.equal(api.wave,5);assert.equal(api.player.damage,1.73);assert.equal(api.player.hp,2);assert.equal(api.player.ablativeReady,false);assert.equal(api.player.secondChanceReady,false);assert.deepEqual(plain(api.player.skills),skillBuild);assert.equal(api.player.skillsSpent,1);assert.ok(api.validateRunCheckpoint(api.profile.checkpoint));
});

check('repeated attempts never rebook old lifetime kills, bosses, elapsed time or already banked loot',()=>{
  const {api}=game();Object.assign(api.runStats,{normalBosses:4,miniBosses:4,gearCollected:4});api.setRunTotals(1000,40,70);
  const item=api.normalizeGearItem({id:'failed-attempt-drop',slot:'weapon',tier:2,name:'Retained Drop',gunVariant:'siege',alignment:'AEGIS',power:114,stats:{damagePct:4,chargePct:5},locked:true});api.collectGear(item);
  api.saveRunCheckpoint('postElite');fatal(api);const first=plain(api.profile.lifetime),inventory=plain(api.garage.inventory);
  assert.equal(first.kills,40);assert.equal(first.bosses,4);assert.equal(first.gear,5);assert.equal(first.playSeconds,70);assert.equal(inventory.filter(item=>item.id==='failed-attempt-drop').length,1);
  assert.equal(api.retryLastCheckpoint(),true);assert.equal(api.runLoot.length,0);assert.deepEqual(plain(api.garage.inventory),inventory);
  fatal(api);assert.equal(api.profile.lifetime.runs,first.runs+1);for(const key of['kills','bosses','miniBosses','gear','playSeconds'])assert.equal(api.profile.lifetime[key],first[key],key+' must only add the fresh attempt delta');
  assert.deepEqual(plain(api.garage.inventory),inventory);assert.equal(api.profile.history.length,2);
});

check('Story apex retry starts at boss arrival rather than repeating the post-elite field or its award',()=>{
  const {api}=game();api.setPostEliteClock(36);api.setTime(100);api.beginApexArrival();
  assert.equal(api.profile.checkpoint.segment,'postElite');assert.ok(api.profile.checkpoint.postEliteClock>=36);
  api.flushBossArrival();assert.equal(api.boss.type,4);fatal(api);const loot=api.garage.inventory.length;
  assert.equal(api.retryLastCheckpoint(),true);assert.equal(api.miniBoss,null);api.update(step);assert.ok(api.stageApexIntro>4);assert.equal(api.runStats.miniBosses,0);assert.equal(api.garage.inventory.length,loot);
  api.flushBossArrival();assert.equal(api.boss.type,4);assert.equal(api.boss.phase,1);assert.equal(api.boss.hp,api.boss.max);assert.equal(api.garage.inventory.length,loot);
});

check('Rush and selected mission replay retry their recorded mode and current mission',()=>{
  {
    const g=createGame({ruleset:'streamlined-v1'}),api=g.api;api.start('rush');api.setWave(5);api.saveRunCheckpoint('apex');fatal(api);api.restartCurrentRun();
    assert.equal(api.runMode,'rush');assert.equal(api.wave,5);assert.ok(api.stageApexIntro>0);assert.equal(api.player.laserLevel,3);assert.equal(api.runRuleset,'streamlined-v1');
  }
  {
    const g=createGame({ruleset:'streamlined-v1'}),api=g.api;api.profile.progress.missionsCleared[3]=true;api.start('replay',4);api.lossFixture(4,false,4);api.saveRunCheckpoint('mission');fatal(api);api.restartCurrentRun();
    assert.equal(api.runMode,'replay');assert.equal(api.runStartWave,4);assert.equal(api.wave,4);assert.equal(api.state,'playing');
  }
});

check('stale epochs, profile changes and malformed snapshots cannot restore or replace another checkpoint',()=>{
  {
    const {api}=game();api.saveRunCheckpoint('postElite');fatal(api);const stale=api.retryPoint;api.start('story');const current=JSON.stringify(api.profile.checkpoint);api.installRetryPoint(stale);api.forceLossScreen();assert.equal(api.retryLastCheckpoint(),false);assert.equal(JSON.stringify(api.profile.checkpoint),current);
  }
  {
    const {api}=game();api.saveRunCheckpoint('postElite');fatal(api);const stale=api.retryPoint;api.switchProfile(1);const current=JSON.stringify(api.profile.checkpoint);api.installRetryPoint(stale);assert.equal(api.retryLastCheckpoint(),false);assert.equal(JSON.stringify(api.profile.checkpoint),current);
  }
  {
    const {api}=game();api.saveRunCheckpoint('postElite');fatal(api);const valid=api.retryPoint;assert.ok(valid?.saved);api.installRetryPoint({...valid,saved:{...plain(valid.saved),ruleset:'future-unrecognized-v100'}});assert.equal(api.retryLastCheckpoint(),false);assert.equal(api.profile.checkpoint,null);
  }
});

check('developer deaths cannot replace a real campaign checkpoint or offer its data as a retry',()=>{
  const {api}=game();api.saveRunCheckpoint('postElite');const checkpoint=JSON.stringify(api.profile.checkpoint),life=plain(api.profile.lifetime);
  api.startBossLab(4);fatal(api);assert.equal(api.retryPoint,null);assert.equal(api.retryLastCheckpoint(),false);assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.deepEqual(plain(api.profile.lifetime),life);
  api.restartCurrentRun();assert.equal(api.bossLab,true);assert.equal(api.boss.type,4);assert.equal(api.state,'playing');
});

check('explicit full restart retains the ruleset while beginning a new campaign build',()=>{
  for(const ruleset of['streamlined-v1','classic-v1']){
    const {api}=game(ruleset);assert.equal(typeof api.restartRunFromStart,'function');if(ruleset==='streamlined-v1')api.installPerks(['precisionRelay']);api.saveRunCheckpoint('postElite');fatal(api);api.restartRunFromStart();
    assert.equal(api.state,'playing');assert.equal(api.wave,1);assert.equal(api.runRuleset,ruleset);assert.equal(api.progression.perks.length,0);assert.equal(api.player.skillsSpent,0);
  }
});

const failed=results.filter(result=>!result.passed);console.log(`${results.length-failed.length} loss/retry checks passed, ${failed.length} failed`);
if(failed.length)process.exitCode=1;
