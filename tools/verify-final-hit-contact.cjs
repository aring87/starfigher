#!/usr/bin/env node
'use strict';
// Native update, damage and reward regressions in private normal Story pilots.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {finishEpicRitual,
 contactFixture(kind,type,shotDamage,nearDefeat=false,phase=null){
   wave=type+1;beginStage(false);if(kind==='epic')makeEpicBoss(type,type);else makeBoss();const e=boss;
   e.phase=phase??(kind==='epic'?4:2);e.hp=e.max*(kind==='epic'?1-(e.phase-1)*.25:1-(e.phase-1)*.5);
   const past=kind==='epic'?e.weakNodesByPhase.slice(0,e.phase-1):e.phase>1?[e.weakNodes1]:[];for(const oldPhase of past)for(const node of oldPhase){node.hp=0;node.destroyed=true}
   Object.assign(e,{x:715,y:270,intro:0,phaseTransition:0,hidden:false,ritual:null,weakOpen:false,weakTimer:100,cool:100,clock:5,toxinProtected:true});
   Object.assign(player,{x:715,y:270,hp:1,maxHp:3,shield:0,inv:0,evade:0,ablativeReady:false,secondChanceReady:false,missileLevel:0,bits:0});player.pod.owned=false;
   miniBoss=null;miniBossSpawned=true;enemies=[];pickups=[];stageHazards=[];stageApexIntro=-1;stagePostEliteClock=-1;stageHazardClock=spawn=999;stageIntro=0;victoryDelay=null;
   enemyShots=[];shots=[];
   if(nearDefeat){const nodes=activeWeakNodes(e),floor=kind==='epic'?e.max*(1-e.phase*.25):e.phase===1?e.max*.5:0;for(const node of nodes)node.hp=2/nodes.length;e.hp=floor+2;fire(1)}
   else if(shotDamage)fire(0);
   return e;
 },`);
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);
const {createGame}=mod.exports,results=[],scenes=[];
for(const kind of['main','epic'])for(let type=0;type<(kind==='main'?10:2);type++)scenes.push({kind,type});
function game(scene,shotDamage,nearDefeat=false){const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const e=a.contactFixture(scene.kind,scene.type,shotDamage,nearDefeat,scene.phase);assert.equal(a.bossLab,false);assert.equal(a.runMode,'story');assert.equal(a.garage.inventory.length,0);return{...g,a,e}}
function rewardCount(a){return a.runStats.normalBosses+a.runStats.epicBosses}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('a valid final shot wins before the dead body can kill an overlapping one-hull Story pilot',()=>{
 for(const scene of scenes){const {a,e}=game(scene,8,true);assert.equal(a.shots.length,1);assert.equal(a.shots[0].d,8,'Native full charge uses ordinary starter output');a.enemyShots.push({x:a.player.x,y:a.player.y,vx:0,vy:0,r:5,damage:1});a.update(1/120);assert.equal(e.hp,0,JSON.stringify(scene)+' native shot depletes final phase');assert.equal(a.player.hp,1,JSON.stringify(scene)+' dead hull cannot hit');assert.equal(a.state,'playing');assert.equal(a.boss,null);assert.equal(rewardCount(a),1);assert.equal(a.garage.inventory.length,1);assert.equal(a.enemyShots.length,0);assert.equal(a.profile.progress.missionsCleared[a.wave-1],true)}
 return{normalBosses:10,epics:2,ordinaryStoryHull:3,startingCurrentHull:1,nativeChargedDamage:8,remainingBossHp:2};
});
check('native updates after victory do not repeat the boss reward or hit from a stale corpse',()=>{
 for(const scene of scenes){const {a,e}=game(scene,8,true);a.update(1/120);assert.equal(a.player.hp,1);assert.equal(a.boss,null);const id=a.garage.inventory[0].id;for(let i=0;i<60&&a.state==='playing';i++)a.update(1/120);assert.equal(rewardCount(a),1);assert.equal(a.garage.inventory.length,1);assert.equal(a.garage.inventory[0].id,id);assert.equal(a.player.hp,1);assert.equal(a.boss,null);assert.equal(e.hp,0)}
 return{encounters:12,postVictoryUpdates:720};
});
check('a surviving boss retains lethal body contact and awards no victory',()=>{
 for(const scene of scenes){const {a,e}=game(scene,0),before=e.hp;a.update(1/120);assert.equal(e.hp,before);assert.equal(a.player.hp,0);assert.equal(a.state,'gameover');assert.equal(a.boss,e);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0)}
 return{encounters:12};
});
check('a nonlethal armor hit does not cancel a living boss body collision',()=>{
 for(const scene of scenes){const {a,e}=game(scene,1),before=e.hp;assert.equal(a.shots[0].d,1);a.update(1/120);assert.ok(Math.abs(e.hp-(before-.25))<1e-7,JSON.stringify(scene)+' ordinary25percent armor chip');assert.equal(a.player.hp,0);assert.equal(a.state,'gameover');assert.equal(a.boss,e);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0)}
 return{encounters:12};
});
check('protected arrivals and Bloodstar phase transition retain their existing damage gates',()=>{
 for(const scene of scenes){const {a,e}=game(scene,8,true),hp=e.hp;e.intro=1;a.update(1/120);assert.equal(e.hp,hp);assert.equal(a.player.hp,1);assert.equal(a.boss,e);assert.equal(rewardCount(a),0)}
 const {a,e}=game({kind:'main',type:0},8,true),hp=e.hp;e.phaseTransition=1.55;a.update(1/120);assert.equal(e.hp,hp);assert.equal(a.player.hp,1);assert.equal(a.boss,e);assert.equal(rewardCount(a),0);assert.ok(e.phaseTransition<1.55&&e.phaseTransition>0);
 return{arrivals:12,bloodstarTransition:1};
});
check('each main phase-one finisher commits once before body contact and the living next phase remains dangerous',()=>{
 for(let type=0;type<10;type++){
  const {a,e}=game({kind:'main',type,phase:1},8,true),floor=e.max*.5;
  if(type===0){e.queuedAttack={phase:1,pattern:1};e.attackCue=e.cool=.2}
  a.update(1/120);
  assert.equal(a.player.hp,1,'Phase '+type+' finisher survives the current frame');assert.equal(a.state,'playing');assert.equal(a.boss,e);assert.equal(e.phase,2);assert.equal(e.hp,floor);assert.equal(e.queuedAttack,null);assert.equal(e.attackCue,0);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0);assert.ok(a.player.inv<=0,'No new invulnerability timer is added');
  assert.ok(a.activeWeakNodes(e).every(node=>!node.destroyed&&node.hp===node.max),'Next phase begins with its own intact health pool');
  if(type===0){
   assert.equal(e.phaseTransition,1.55,'Existing authored Bloodstar transition is retained');
   a.update(1/120);assert.equal(a.player.hp,1);assert.equal(e.phase,2);
   let ticks=0;while(e.phaseTransition>0&&ticks++<300)a.update(1/120);
   assert.ok(ticks<300);assert.equal(a.player.hp,1,'Existing transition gate protects overlapping contact');
   a.player.x=e.x;a.player.y=e.y;
  }
  a.update(1/120);assert.equal(a.player.hp,0,'Living next phase still deals contact damage');assert.equal(a.state,'gameover');assert.equal(e.phase,2);assert.equal(a.boss,e);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0);
 }
 return{mainPhaseOneFinishers:10,finalPhaseFinishersAlreadyCovered:10,newContactImmunity:false};
});
check('each epic phase-one through phase-three finisher starts one ritual before spent-body contact',()=>{
 for(let type=0;type<2;type++)for(let phase=1;phase<=3;phase++){
  const {a,e}=game({kind:'epic',type,phase},8,true),floor=e.max*(1-phase*.25);
  a.update(1/120);assert.equal(a.player.hp,1);assert.equal(a.state,'playing');assert.equal(a.boss,e);assert.equal(e.phase,phase);assert.equal(e.hp,floor);assert.ok(e.hidden&&e.ritual);assert.equal(e.ritual.phase,phase);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0);assert.ok(a.player.inv<=0,'No new invulnerability timer is added');
  const ritual=e.ritual,timer=ritual.timer;
  for(let tick=0;tick<10;tick++)a.update(1/120);
  assert.equal(a.player.hp,1);assert.equal(e.ritual,ritual,'The same ritual continues; it is not restarted');assert.equal(e.phase,phase);assert.ok(ritual.timer<timer);assert.equal(ritual.result,null);assert.equal(a.runStats.ritualsWon,0);assert.equal(a.runStats.ritualsFailed,0);assert.equal(rewardCount(a),0);
 }
 return{nonfinalEpicPhaseFinishers:6,finalEpicPhaseFinishersAlreadyCovered:2,followupNativeUpdates:60};
});
check('epic living contact returns after the existing ritual and arrival protection finishes',()=>{
 for(let type=0;type<2;type++)for(let phase=1;phase<=3;phase++){
  const {a,e}=game({kind:'epic',type,phase},8,true);a.update(1/120);assert.equal(a.player.hp,1);assert.ok(e.ritual);
  a.finishEpicRitual(e,false);a.player.x=145;a.player.y=270;
  let ticks=0;while((e.ritual||e.intro>0)&&ticks++<500)a.update(1/120);
  assert.ok(ticks<500);assert.equal(a.state,'playing');assert.equal(a.player.hp,1);assert.equal(a.player.shield,0);assert.equal(e.phase,phase+1);assert.equal(e.ritual,null);assert.ok(!e.hidden&&e.intro<=0);assert.ok(a.player.inv<=0);assert.ok(e.toxinTick>1/120,'This contact control is not a toxin tick');
  a.player.x=Math.min(870,e.x);a.player.y=e.y;a.update(1/120);
  assert.equal(a.player.hp,0);assert.equal(a.state,'gameover');assert.equal(e.phase,phase+1);assert.equal(a.boss,e);assert.equal(rewardCount(a),0);assert.equal(a.garage.inventory.length,0);assert.ok(e.toxinTick>0,'Living body contact remains lethal before toxin can tick');
 }
 return{resumedEpicPhases:6,authoredRitualAndIntroUsed:true};
});
const failed=results.filter(row=>!row.passed).length;
fs.writeFileSync(path.join(root,'artifacts/final-hit-contact-v154-verification.json'),JSON.stringify({scope:'Private normal Story pilots. Actual120Hz native update/emission/armor/contact/transitions/ritual/victory and banking; staged legal current-phase health pools. No DEV resource or reward suppression. Existing pending victory screens remain intact.',passed:results.length-failed,failed,results},null,2)+'\n');
console.log(`${results.length-failed} final-hit/contact check groups passed, ${failed} failed`);process.exitCode=failed?1:0;
