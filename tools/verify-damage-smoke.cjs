#!/usr/bin/env node
'use strict';
// Isolated combat tests; no browser storage or player profiles are accessed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harnessPath=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(harnessPath,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('updateMiniBossMovement,','updateMiniBossMovement,emitDamageSmoke,emitRegularEnemyDamageSmoke,emitWeakSmoke,nativeSeveredSmokeAnchor,damageWeakNode,');
const harness=new Module(harnessPath,module);harness.filename=harnessPath;harness.paths=module.paths;
harness._compile(support+'\nmodule.exports={createGame};\n',harnessPath);
const{createGame}=harness.exports;let passed=0;
function check(name,run){run();passed++;console.log('PASS '+name)}
function smoke(api){return api.particles.filter(p=>p.smoke)}

check('healthy enemies remain clean while damaged hulls produce progressively denser and larger smoke',()=>{
  const{api}=createGame();api.start('story');const counts=[],sizes=[];
  for(const hp of[10,6,1]){
    api.particles.length=0;const enemy={x:500,y:220,r:14,hp,maxHp:10};
    for(let frame=0;frame<120;frame++)api.emitRegularEnemyDamageSmoke(enemy,1/60);
    const puffs=smoke(api);counts.push(puffs.length);sizes.push(puffs.reduce((sum,p)=>sum+p.s,0)/Math.max(1,puffs.length));
    assert.equal(enemy.hp,hp);assert.equal(enemy.maxHp,10);
  }
  assert.equal(counts[0],0);assert.ok(counts[2]>counts[1]&&counts[1]>0);assert.ok(sizes[2]>sizes[1]);
});

check('real fighter hits preserve regular enemy maximum health and activate attached damage smoke',()=>{
  const{api}=createGame();api.start('story');api.player.inv=1e6;
  const enemy={x:500,y:100,r:17,hp:5,maxHp:5,speed:0,cool:99,phase:0,type:'turret',stageStyle:'drift',c:'#4ef5ff'};
  api.enemies.push(enemy);api.shots.push({x:500,y:100,px:495,py:100,vx:0,vy:0,r:3,d:3});
  api.update(1/120);assert.equal(enemy.hp,2);assert.equal(enemy.maxHp,5);api.particles.length=0;
  for(let tick=0;tick<120;tick++)api.update(1/120);
  assert.ok(smoke(api).length>0);assert.ok(smoke(api).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

check('destroyed outer assemblies emit from the remaining severed joint rather than the fallen weakpoint',()=>{
  const{api}=createGame();api.startMiniBossLab(0);const enemy=api.miniBoss;enemy.intro=0;enemy.x=710;enemy.y=270;
  const node=api.activeWeakNodes(enemy)[0];api.damageWeakNode(enemy,node,node.hp);const joint=api.nativeSeveredSmokeAnchor(enemy,node);assert.ok(joint);
  api.particles.length=0;for(let frame=0;frame<60;frame++)api.emitWeakSmoke(enemy,1/60);
  assert.ok(smoke(api).length>0);assert.ok(smoke(api).every(p=>Math.hypot(p.x-joint.x,p.y-joint.y)<3));
});

check('smoke density is stable across display rates and never changes collision objects',()=>{
  const counts=[];
  for(const rate of[30,60,120]){
    const{api}=createGame();api.start('story');const enemy={x:500,y:220,r:14,hp:1,maxHp:10},bullet={x:600,y:220,r:4,d:1};api.enemyShots.push(bullet);
    for(let frame=0;frame<2*rate;frame++)api.emitRegularEnemyDamageSmoke(enemy,1/rate);
    counts.push(smoke(api).length);assert.equal(api.enemyShots[0],bullet);assert.equal(enemy.hp,1);
  }
  assert.equal(counts[0],counts[1]);assert.equal(counts[1],counts[2]);
});

check('heavy damage smoke obeys Clear Combat cosmetic limits without consuming live shots',()=>{
  const{api,sandbox}=createGame();api.start('story');sandbox.STARFIGHTER_SETTINGS.clearCombat=true;
  const enemy={x:500,y:220,r:14,hp:1,maxHp:10},bullet={x:600,y:220,r:4,d:1};api.shots.push(bullet);
  for(let frame=0;frame<12000;frame++)api.emitRegularEnemyDamageSmoke(enemy,1/60);
  assert.ok(smoke(api).length<=195);assert.ok(api.particles.length<=300);assert.equal(api.shots[0],bullet);
});
check('Art Inspector previews damage smoke without changing the saved combat state',()=>{
  const{api}=createGame();api.startBossLab(1);const enemy=api.boss,hp=enemy.hp,originalParticles=api.particles;
  api.openArtInspection();api.setInspectionMaterial('damaged');
  for(let frame=0;frame<60;frame++)api.advanceArtInspection(1/60);
  assert.ok(smoke(api).length>0);assert.ok(smoke(api).every(p=>p.life>0));
  api.closeArtInspection();assert.equal(enemy.hp,hp);assert.equal(api.particles,originalParticles);
});
console.log(`\n${passed} damage-smoke checks passed.`);
