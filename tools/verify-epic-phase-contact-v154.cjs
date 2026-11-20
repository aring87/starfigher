#!/usr/bin/env node
'use strict';
// Same-frame contact at a native ordinary-shot phase completion. Private pilots.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('  globalThis.__gameTest = {',`globalThis.__gameTest = {
 epicContactFixture(epicId,phase,pool){
   wave=5;beginStage(false);stageIntro=0;stageHazardClock=spawn=999;miniBossSpawned=true;stagePostEliteClock=-1;stageApexIntro=-1;victoryDelay=null;runEpicEncounter=null;
   enemies=[];shots=[];enemyShots=[];stageHazards=[];pickups=[];makeEpicBoss(epicId,0);
   Object.assign(boss,{phase,intro:0,x:715,y:263,cool:999,weakOpen:false,weakTimer:999});
   const nodes=activeWeakNodes(boss);nodes.forEach((node,index)=>{node.hp=index?0:pool;node.destroyed=index!==0});boss.hp=boss.max*(1-phase*.25)+pool;
   player.pod.owned=false;player.laserColor=null;player.laserLevel=player.missileLevel=player.bits=0;
   player.x=boss.x-35-620/120;player.y=boss.y;player.hp=1;player.shield=0;player.inv=0;player.evade=0;player.ablativeReady=player.secondChanceReady=false;
   return boss;
 },`);
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);const rows=[];
for(const epicId of[0,1])for(const phase of[1,2,3,4])for(const complete of[false,true]){
 const g=m.exports.createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const b=a.epicContactFixture(epicId,phase,complete?.25:1),before=b.hp;
 a.fire(0);assert.equal(a.shots.length,1);const packet=a.shots[0];assert.equal(packet.d,1);assert.equal(packet.charge,0);assert.equal(packet.vx,620);
 a.update(1/120);const row={epicId,phase,complete,emittedDamage:packet.d,dealt:before-b.hp,state:a.state,hull:a.player.hp,ritual:!!b.ritual,bossGone:a.boss===null,bossHp:b.hp};
 assert.ok(Math.abs(row.dealt-.25)<1e-8,'Actual ordinary body hit deals its native quarter damage');
 if(complete){assert.equal(a.player.hp,1,'A completed phase cannot apply stale contact');assert.equal(a.state,'playing');if(phase<4)assert.ok(b.ritual,'Phase completion commits its ritual');else assert.equal(a.boss,null,'Final phase commits victory');}
 else{assert.equal(a.player.hp,0,'A still-living phase retains real contact damage');assert.equal(a.state,'gameover');assert.equal(b.ritual,null);}
 rows.push(row);console.log('PASS epic'+epicId+' phase'+phase+' '+(complete?'spent phase commits':'live phase contact'));
}
fs.writeFileSync(path.join(root,'artifacts/epic-phase-contact-v154-verification.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'Actual ordinary1damage fighter emitter and native quarter-damage armor collision. A valid near-cleared phase has one remaining .25HP core; the control retains1HP before impact. The1-hull pilot overlaps the body with no invulnerability, shield, evade or guards. Tests isolate state ordering, not encounter difficulty.',rows},null,2)+'\n');
console.log('PASS '+rows.length+' ordinary-emitter epic phase/contact checks.');
