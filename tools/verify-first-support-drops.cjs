#!/usr/bin/env node
'use strict';
// Exercise native drop/collection/checkpoint paths in disposable Story pilots.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {drop,defeatEnemy,firstSupportDrop,retryLastCheckpoint,
 setDropRolls(values){let index=0;Math.random=()=>values[Math.min(index++,values.length-1)]},
 dropMission(stage){wave=stage;beginStage(false);enemies=[];pickups=[];enemyShots=[];shots=[];},`);
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);
const results=[],carrier=()=>({type:'drone',formationIndex:0,formationCount:4,x:520,y:270,c:'#4ef5ff',hp:1});
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(stage=3,ruleset='streamlined-v1'){
 const g=m.exports.createGame({ruleset}),a=g.api;a.start('story',1,ruleset);a.dropMission(stage);a.collectCombatPickup({type:'crystal',color:'red'});a.setDropRolls([.999]);return g;
}
const combat=a=>a.pickups.filter(p=>!p.dead&&p.type!=='gear');
function collect(a){const item=combat(a)[0];assert.ok(item);a.collectCombatPickup(item);item.dead=true;return item}
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}

check('actual Mission 2 formation leader carries a first missile and a repeated defeat awards nothing',()=>{
 const {api:a}=setup(2);a.setDropRolls([.4]);a.spawnEnemy();const leader=a.enemies.find(e=>e.type==='drone'&&e.formationIndex===0);assert.ok(leader,'Native spawner must create the carrier');assert.equal(leader.role,undefined);a.setDropRolls([.999]);a.defeatEnemy(leader);assert.equal(combat(a)[0].type,'missile');a.defeatEnemy(leader);assert.equal(combat(a).length,1);assert.equal(a.player.missileLevel,0,'Kill is not automatic collection');collect(a);assert.equal(a.player.missileLevel,1);
});
check('Mission 1 and a missing first Force keep their original pickup priority',()=>{
 const {api:a}=setup(1);a.drop(carrier());assert.equal(combat(a).length,0);a.player.pod.owned=false;a.player.laserColor=null;a.player.laserLevel=0;a.dropMission(3);a.drop(carrier());assert.equal(combat(a)[0].type,'crystal');assert.equal(a.player.missileLevel,0);
});
check('Mission 2 has no guaranteed Bit and Mission 3 rescues a missing first Bit',()=>{
 const {api:a}=setup(2);a.player.missileLevel=1;a.drop(carrier());assert.equal(combat(a).length,0);a.dropMission(3);a.drop(carrier());assert.equal(combat(a)[0].type,'bit');collect(a);assert.equal(a.player.bits,1);
});
check('missing missiles are rescued before Bits and both require separate collection',()=>{
 const {api:a}=setup();a.drop(carrier());assert.equal(combat(a)[0].type,'missile');collect(a);a.drop(carrier());assert.equal(combat(a)[0].type,'bit');assert.equal(a.player.bits,0);collect(a);assert.equal(a.player.bits,1);
});
check('a visible or traveling combat pickup blocks every additional support rescue',()=>{
 for(const type of['crystal','missile','bit','shield']){const {api:a}=setup();a.pickups.push({type,x:950,y:40,dead:false});a.drop(carrier());assert.equal(combat(a).length,1);assert.equal(combat(a)[0].type,type)}
});
check('expired or collected pickups release the single-pickup gate without a new pity counter',()=>{
 const {api:a}=setup();a.drop(carrier());a.pickups[0].dead=true;a.drop(carrier());assert.equal(combat(a).length,1);assert.equal(combat(a)[0].type,'missile');collect(a);a.drop(carrier());assert.equal(combat(a)[0].type,'bit');
});
check('ordinary drones, formation followers and turrets retain their random pickup rolls',()=>{
 for(const enemy of[{type:'drone'},{type:'wing',formationIndex:1,formationCount:4},{type:'turret',formationIndex:0,formationCount:4}]){const {api:a}=setup();a.drop({...carrier(),...enemy,formationIndex:enemy.formationIndex,formationCount:enemy.formationCount});assert.equal(combat(a).length,0)}
});
check('rescuing the first copy never grants maximum kit or guarantees its second copy',()=>{
 const {api:a}=setup(10);a.player.missileLevel=1;a.player.bits=1;a.drop(carrier());assert.equal(combat(a).length,0);assert.equal(a.player.missileLevel,1);assert.equal(a.player.bits,1);assert.equal(a.player.laserLevel,1);
});
check('normal random missile and Bit upgrades still use actual collection and mission caps',()=>{
 const {api:a}=setup(3);a.player.laserLevel=3;a.player.missileLevel=a.player.bits=1;a.setDropRolls([.005,.999]);a.drop(carrier());assert.equal(collect(a).type,'missile');assert.equal(a.player.missileLevel,2);a.setDropRolls([.009,.999]);a.drop(carrier());assert.equal(collect(a).type,'bit');assert.equal(a.player.bits,2);
});
check('a support rescue leaves the independent field gear roll and rolled item intact',()=>{
 const {api:a}=setup();a.setDropRolls([0]);a.drop(carrier());assert.equal(combat(a)[0].type,'missile');const item=a.pickups.find(p=>p.type==='gear');assert.ok(item?.gear);assert.ok(Object.keys(item.gear.stats).length>0);assert.equal(a.player.missileLevel,0);assert.equal(a.runLoot.length,0,'Gear still requires collection');
});
check('checkpoint reload preserves collected support and only rescues what is still missing',()=>{
 const g=setup(),a=g.api;a.drop(carrier());collect(a);a.saveRunCheckpoint('mission');const saved=plain(a.profile.checkpoint);assert.ok(a.validateRunCheckpoint(saved));const reloaded=m.exports.createGame({initialStorage:[...g.storage],ruleset:'streamlined-v1'});reloaded.api.loadGame();const b=reloaded.api;b.setDropRolls([.999]);assert.equal(b.wave,3);assert.equal(b.player.missileLevel,1);b.drop(carrier());assert.equal(combat(b)[0].type,'bit');assert.deepEqual(plain(a.profile.checkpoint),saved);
});
check('retrying a checkpoint from before collection can rescue its missing first copy again',()=>{
 const {api:a}=setup();a.saveRunCheckpoint('mission');a.drop(carrier());collect(a);assert.equal(a.player.missileLevel,1);a.player.shield=0;a.player.inv=a.player.evade=0;a.damage(99,{kind:'projectile',piercing:true});assert.equal(a.state,'gameover');assert.equal(a.retryLastCheckpoint(),true);assert.equal(a.player.missileLevel,0);a.setDropRolls([.999]);a.drop(carrier());assert.equal(combat(a)[0].type,'missile');
});
check('classic Story and unlocked Mission Replay use the same first-copy guard',()=>{
 const classic=setup(3,'classic-v1').api;classic.drop(carrier());assert.equal(combat(classic)[0].type,'missile');const {api:a}=setup();a.profile.progress.missionsCleared[2]=true;a.start('replay',3);a.collectCombatPickup({type:'crystal',color:'red'});a.setDropRolls([.999]);a.drop(carrier());assert.equal(combat(a)[0].type,'missile');
});
check('Rush and developer tests retain their existing arsenal and drop rules',()=>{
 const {api:a}=setup();a.start('rush');a.player.missileLevel=a.player.bits=0;a.setDropRolls([.999]);a.drop(carrier());assert.equal(combat(a).length,0);a.startLevelLab(2);a.collectCombatPickup({type:'crystal',color:'red'});a.player.missileLevel=a.player.bits=0;a.setDropRolls([.999]);a.drop(carrier());assert.equal(combat(a).length,0);
});

const failed=results.filter(r=>!r.passed);console.log(`${results.length-failed.length} first-support checks passed, ${failed.length} failed`);process.exitCode=failed.length?1:0;
