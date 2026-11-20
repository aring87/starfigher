#!/usr/bin/env node
'use strict';
// Isolated Story fixtures use the actual update and collision paths. Never
// reads browser storage or writes a pilot's progression.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,',`spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,
    combatProgressionCaps,enforceCombatProgression,fireForceLaser,updateForceFireCadence,queuePressureLance,updateHostileShot,fireWall,bossAttack,finishEncounterAttack,drawHostileShot,drawWallWarnings,
    get retrofits(){return tacticalRetrofits},get settings(){return settings},
    quietStory(level=2){wave=level;bossLab=false;miniBoss=boss=null;enemies=[];shots=[];enemyShots=[];pickups=[];stageHazards=[];miniBossSpawned=true;stageIntro=0;stagePostEliteClock=0;stageApexIntro=-1;stageHazardClock=999;spawn=999;t=0;player.inv=0;},
`);
const harness=new Module(file,module);harness.filename=file;harness.paths=module.paths;harness._compile(support+'\nmodule.exports={createGame};',file);const{createGame}=harness.exports;
const results=[];function check(name,run){run();results.push(name);console.log('PASS '+name)}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fresh(level=2){const game=createGame();game.api.start('story');game.api.quietStory(level);return game}
function kit(api){api.collectCombatPickup({type:'crystal',color:'red'});api.player.pod.mode='docked';api.player.pod.dockSide='front';api.player.bits=api.combatProgressionCaps().bits;api.update(1/120);api.player.inv=0}
function caster(api){const e={x:650,y:api.player.y,r:14,hp:5,maxHp:5,speed:0,type:'turret',threat:api.sectorThreat(),phase:0,cool:999,coolScale:1,c:'#f08',pressureCycle:0};api.enemies.push(e);return e}
function step(api,seconds){for(let i=0;i<Math.round(seconds*120)&&api.state==='playing';i++)api.update(1/120)}
check('Story pickup limits unlock across missions and preserve color switching at the limit',()=>{
  const{api}=fresh(1),expected=[[1,1,1],[2,1,1],[2,2,2],[3,2,2],[3,2,2]];
  for(let level=1;level<=5;level++){api.setWave(level);for(let n=0;n<10;n++)for(const type of['crystal','missile','bit'])api.collectCombatPickup({type,color:'blue'});assert.equal(JSON.stringify([api.player.laserLevel,api.player.missileLevel,api.player.bits]),JSON.stringify(expected[level-1]));api.collectCombatPickup({type:'crystal',color:'yellow'});assert.equal(api.player.laserColor,'yellow')}
  api.start('rush');assert.equal(JSON.stringify(api.combatProgressionCaps()),JSON.stringify({force:3,missile:2,bits:2}));api.startBossLab(0);assert.equal(api.combatProgressionCaps().force,3)
});
check('older Story checkpoint arsenals clamp safely without replacing build stats or spent guards',()=>{
  const{api}=fresh(2);Object.assign(api.player,{hp:2,shield:20,damage:1.047,laserLevel:3,missileLevel:2,bits:2,ablativeOwned:true,ablativeReady:false,secondChance:true,secondChanceReady:false});api.saveRunCheckpoint('mission');api.goMenu();api.loadGame();assert.equal(api.wave,2);assert.equal(api.player.hp,2);assert.equal(api.player.damage,1.047);assert.equal(api.player.shield,4);assert.equal(api.player.laserLevel,2);assert.equal(api.player.missileLevel,1);assert.equal(api.player.bits,1);assert.equal(api.player.ablativeReady,false);assert.equal(api.player.secondChanceReady,false)
});
check('short charge exploit is removed while normal and full-charge fighter output remain one and eight',()=>{
  const{api}=fresh(1);for(const [charge,damage]of[[0,1],[.24,1.4032],[1,8]]){api.shots.length=0;api.fire(charge);near(api.shots[0].d,damage)}
});
check('manual, Sync and queued charged Force packets share one emission clock without dropping charge',()=>{
  const{api}=fresh(4);kit(api);api.shots.length=0;api.player.forceFireTimer=0;assert.equal(api.fireForceLaser(0),true);assert.equal(api.fireForceLaser(0,1,'auto'),false);api.updateForceFireCadence(.1);assert.equal(api.fireForceLaser(1),false);api.updateForceFireCadence(.14);assert.equal(api.shots.filter(s=>s.pod).length,2);near(api.shots.filter(s=>s.pod)[1].d,8*.45);assert.equal(api.player.forcePendingCharge,0);
  api.shots.length=0;api.player.forceFireTimer=0;for(let n=0;n<360;n++){api.updateForceFireCadence(1/120);if(n%19===0)api.fireForceLaser(0);api.fireForceLaser(0,1,'auto')}const count=api.shots.filter(s=>s.pod).length;assert.ok(count>=12&&count<=13,`Shared stream emitted ${count} packets in three seconds`)
});
check('shield pickups and recovery modules cannot create unlimited reserves',()=>{
  const{api}=fresh(1);for(let i=0;i<30;i++)api.collectCombatPickup({type:'shield'});assert.equal(api.player.shield,4);assert.ok(api.player.dose>0);api.player.dose=0;api.retrofits.find(r=>r.key==='fieldPatch').apply();assert.equal(api.player.shield,4);assert.equal(api.player.dose,8);api.player.hp=2;api.retrofits.find(r=>r.key==='fieldPatch').apply();assert.equal(api.player.hp,3);assert.equal(api.player.shield,4);assert.equal(api.retrofits.find(r=>r.key==='arsenalMaintenance').max,3);assert.equal(api.retrofits.find(r=>r.key==='controlMaintenance').max,3)
});
check('ordinary pink aimed fire is still intercepted by the front Force pod',()=>{
  const{api}=fresh();kit(api);const e=caster(api);api.enemyFire(e);step(api,3);assert.equal(api.player.hp,3);assert.equal(api.enemyShots.length,0);assert.ok(api.player.dose>=2.5)
});
check('third-cycle amber fire damages a parked Story fighter through front Force and Bits',()=>{
  const{api}=fresh();kit(api);const e=caster(api);api.enemyFire(e);api.enemyFire(e);api.enemyFire(e);assert.equal(api.enemyShots.filter(b=>b.pressureLance).length,1);step(api,3.2);assert.equal(api.player.hp,2);assert.equal(api.player.pod.owned,true);assert.equal(api.player.bits,1)
});
check('warning shots neither move nor collide; a brief physical move evades their locked target',()=>{
  const{api}=fresh();kit(api);const e=caster(api);api.queuePressureLance(e);const b=api.enemyShots[0],target=b.targetY;step(api,.3);assert.ok(b.warn>0);assert.equal(api.player.hp,3);assert.ok(Math.abs(b.x-(e.x-10))<1);api.keys.add('ArrowDown');step(api,.35);api.keys.clear();assert.ok(api.player.y-target>80);assert.equal(b.targetY,target);step(api,3);assert.equal(api.player.hp,3)
});
check('destroying the carrier cancels its pending lance and pause freezes the warning',()=>{
  const{api}=fresh();kit(api);const e=caster(api);api.queuePressureLance(e);const b=api.enemyShots[0];api.pause();const warn=b.warn;for(let i=0;i<60;i++)api.loop(i*1000/60);assert.equal(b.warn,warn);api.pause();e.dead=true;api.update(1/120);assert.equal(api.enemyShots.includes(b),false);assert.equal(api.player.hp,3)
});
check('first mission retains ordinary attack patterns; later elite cooldown scaling survives every release',()=>{
  const{api}=fresh(1);const e=caster(api);for(let i=0;i<9;i++)api.enemyFire(e);assert.equal(api.enemyShots.some(b=>b.piercing),false);assert.equal(api.queuePressureLance(e),false);
  for(const level of[2,5,10]){api.quietStory(level);api.makeMiniBoss();const m=api.miniBoss;Object.assign(m,{intro:0,x:760,y:270,clock:4});for(let i=0;i<6;i++){api.miniBossAttack(m);assert.ok(m.cool>=.55);if((i+1)%3===0)assert.ok(api.enemyShots.some(b=>b.pressureLance&&b.owner===m))}api.makeBoss();const b=api.boss;Object.assign(b,{intro:0,x:760,y:270,clock:4});api.bossAttack(b);assert.ok(b.cool<1.25||b.type===0);assert.ok(b.cool>=.24)}
});
check('wall attack announces a fixed broad gap away from the parked fighter and stays harmless during its tell',()=>{
  const{api}=fresh(4);kit(api);api.fireWall(api.player.y,210);const wall=api.enemyShots[0];assert.ok(Math.abs(wall.gapY-api.player.y)>=105);assert.equal(wall.gapHalf,70);assert.ok(api.enemyShots.every(b=>b.wall&&b.piercing&&b.warn===.8));const gap=wall.gapY;api.keys.add('ArrowUp');step(api,.4);api.keys.clear();assert.equal(wall.gapY,gap);assert.equal(wall.x,api.logicalSize[0]+12);assert.ok(wall.warn>0);assert.equal(api.player.hp,3);api.draw()
});
check('amber render paths remain drawable with Reduced Motion and Clear Combat',()=>{
  const{api}=fresh();kit(api);api.settings.reducedMotion=true;api.settings.clearCombat=true;const e=caster(api);api.queuePressureLance(e);api.drawingContext.trace=[];api.draw();assert.ok(api.drawingContext.trace.some(r=>r.op==='setLineDash')||api.drawingContext.trace.some(r=>r.op==='lineTo'&&r.args[0]===api.player.x));step(api,.7);api.draw();assert.ok(api.enemyShots.some(b=>b.pressureLance&&b.warn===0))
});
const report=results.map(name=>'PASS '+name).join('\n')+`\n\n${results.length} checks passed, 0 failures.\n`;fs.writeFileSync(path.join(__dirname,'..','artifacts','story-balance-verification.txt'),report);console.log(report.split('\n').at(-2));
