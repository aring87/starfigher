#!/usr/bin/env node
'use strict';
// Native emitter packets, guardian collision and a subsequent ordinary actor.
// Disposable VM pilots only; normal stats, with invulnerability for isolation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),harnessFile=path.join(__dirname,'verify-game.cjs'),results=[];
function harness(sourceFile){
 const original=fs.readFileSync(sourceFile,'utf8'),marker='const dealt=Math.min(heavy.hp,shot.d);';assert.ok(original.includes(marker));
 const source=original.replace(marker,'guardianImpactLog.push({shot,heavy});'+marker);
 let support=fs.readFileSync(harnessFile,'utf8');support=support.slice(0,support.indexOf('\ntest('));support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
 support=support.replace('  globalThis.__gameTest = {',`let guardianImpactLog=[];globalThis.__gameTest = {
  get guardianImpactLog(){return guardianImpactLog},
  guardianFixture(direction,level){
    wave=10;beginStage(false);stageIntro=0;stageHazardClock=spawn=999;miniBossSpawned=true;stagePostEliteClock=-1;stageApexIntro=-1;victoryDelay=null;runEpicEncounter=null;
    enemies=[];shots=[];enemyShots=[];stageHazards=[];pickups=[];makeEpicBoss(0,0);boss.phase=1;boss.intro=0;boss.hp=boss.max*.75;
    player.pod.owned=true;player.laserColor='red';player.laserLevel=level;player.missileLevel=0;player.bits=0;player.inv=10000;player.y=115;
    const targetX=direction===1?775:185;player.x=targetX-direction*300;player.pod.x=player.x+(direction===1?50:-45);player.pod.y=115;player.pod.mode='docked';player.pod.dockSide=player.pod.returnSide=direction===1?'front':'rear';player.dose=0;player.charge=0;
    beginEpicRitual(boss);const active=epicHeavies.find(h=>h.active);active.x=targetX;active.y=115;
    spawnEnemy();const next=enemies[0];next.x=targetX+direction*100;next.y=115;next.originY=115;next.speed=0;next.hp=next.maxHp=100;next.cool=999;next.phase=0;
    guardianImpactLog=[];return{active,next};
  },`);
 const m=new Module(harnessFile,module);m.filename=harnessFile;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',harnessFile);return{createGame:m.exports.createGame,sha:crypto.createHash('sha256').update(original).digest('hex')};
}
const cases=[['red3-front','force',3,1,true],['red3-rear','force',3,-1,true],['null-front','null',1,1,true],['fighter-front','fighter',1,1,false],['red2-front','force',2,1,false],['red2-rear','force',2,-1,false]];
for(const version of['baseline','live']){
 const {createGame,sha}=harness(path.join(root,version==='baseline'?'artifacts/epic-v154-baseline-game.js':'game.js'));
 for(const[name,kind,level,direction,piercing]of cases){
  const g=createGame({ruleset:'streamlined-v1'}),a=g.api;
  if(kind==='null'){const item=a.normalizeGearItem({id:'guardian-null',slot:'weapon',tier:2,name:'Null Lance test roll',gunVariant:'null',alignment:'VANGUARD',power:114,stats:{damagePct:5,weakPct:6}});a.garage.inventory=[item];a.garage.equipped.weapon=item.id;}
  a.start('story');const {active,next}=a.guardianFixture(direction,level),guardianHp=active.hp,nextHp=next.hp;
  a.fire(kind==='fighter'?0:1);const shot=a.shots.find(b=>kind==='force'?b.pod:!b.pod&&!b.bit&&!b.missile);assert.ok(shot);assert.equal(shot.vx>0,direction>0);assert.equal(shot.pierce||0,piercing?1:0);
  // Retain the selected native emitter packet, without changing its damage,
  // velocity, size, pierce budget or starting position.
  a.shots.splice(0,a.shots.length,shot);let first=null,ticks=0;
  while(!shot.dead&&a.shots.includes(shot)&&ticks++<240){a.update(1/120);if(!first&&a.guardianImpactLog.length)first={x:shot.x,px:shot.px,pierce:shot.pierce,guardianX:active.x};}
  const hitCount=a.guardianImpactLog.filter(row=>row.shot===shot&&row.heavy===active).length,guardianDamage=guardianHp-active.hp,nextDamage=nextHp-next.hp,expectedHits=version==='baseline'&&piercing?2:1;
  assert.equal(hitCount,expectedHits,name+' guardian hit count');assert.ok(Math.abs(guardianDamage-shot.d*expectedHits)<1e-7,name+' guardian damage must equal emitted packet accounting');
  if(version==='live'&&piercing){assert.equal(first.pierce,0);assert.equal(first.px,first.x);assert.ok(direction*(first.x-first.guardianX)>=active.r+shot.r+2-1e-8);assert.ok(Math.abs(nextDamage-shot.d)<1e-7,'Remaining target budget reaches the next actor once');}
  else assert.equal(nextDamage,0,'Nonpiercing or baseline double-hit packet is consumed before the next actor');
  results.push({version,sourceSha256:sha,name,kind,level,direction,piercing,emittedDamage:shot.d,guardianDamage,guardianHits:hitCount,nextActorDamage:nextDamage,firstImpact:first,ticks});console.log('PASS '+version+' '+name);
 }
}
fs.writeFileSync(path.join(root,'artifacts/epic-guardian-projectiles-v154.json'),JSON.stringify({scope:'Selected packets come from actual Red Force and fighter/Null Lance emitters. Other simultaneous packets are removed only to isolate one-projectile damage. Normal Story stats; invulnerability prevents unrelated death. Follow-up100HP ordinary actor is a collision receptor, not a balance fixture. Frozen baseline observations and live assertions are separate.',results},null,2)+'\n');
console.log('PASS '+results.length+' native projectile comparisons, including '+results.filter(r=>r.version==='live').length+' live cases.');
