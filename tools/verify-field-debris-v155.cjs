#!/usr/bin/env node
'use strict';
// Private native Story hazard regressions. These stage geometry/resources,
// call the shipping emitter/hazard update, and never read real pilot storage.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
const baseline=process.argv.includes('--baseline'),sourceFile=path.join(root,baseline?'artifacts/field-clarity-v155-baseline-game.js':'game.js');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",`const source = fs.readFileSync(${JSON.stringify(sourceFile)}, 'utf8');`);
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {updateStageHazards,
 get fieldScore(){return score},
 fieldDebrisFixture(mine=false,hp=2,hull=3,shield=0,inv=0,force=false){
   wave=1;t=0;beginStage(false);stageHazardClock=spawn=999;stageIntro=0;stageApexIntro=-1;stagePostEliteClock=-1;
   enemies=[];enemyShots=[];shots=[];pickups=[];particles=[];stageHazards=[];boss=miniBoss=null;victoryDelay=null;
   Object.assign(player,{x:145,y:270,hp:hull,maxHp:3,shield,inv,evade:0,critChance:0,gun:1,damage:1,chargeDamage:1,weaponVariant:null,missileLevel:0,bits:0,ablativeReady:false,secondChanceReady:false});
   Object.assign(player.pod,{owned:force,x:158,y:270,r:13,mode:'returning'});
   const hazard={type:'debris',mine,x:158,y:270,r:mine?20:28,speed:0,vy:0,rot:0,vr:0,hp,life:10,phase:0,color:'#ff4f9a'};stageHazards.push(hazard);return hazard;
 },`);
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);
const{createGame}=mod.exports,results=[];
function scene(options={}){const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const h=a.fieldDebrisFixture(options.mine,options.hp??2,options.hull??3,options.shield??0,options.inv??0,!!options.force);assert.equal(a.bossLab,false);assert.equal(a.runMode,'story');return{...g,a,h}}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}

check('a native charged kill cannot inflict corpse contact on a three-hull or one-hull pilot',()=>{
 let cases=0;for(const mine of[false,true])for(const hull of[3,1]){const{a,h}=scene({mine,hull}),score=a.fieldScore;a.fire(1);assert.equal(a.shots.length,1);assert.equal(a.shots[0].d,8);a.updateStageHazards(1/120);assert.ok(h.hp<=0);assert.equal(a.player.hp,hull);assert.equal(a.state,'playing');assert.ok(h.dead&&h.burst);assert.equal(a.stageHazards.length,0);assert.equal(a.fieldScore-score,15);cases++}return{cases,nativeChargedDamage:8};
});
check('Force destruction prevents same-step debris and mine contact',()=>{
 for(const mine of[false,true]){const{a,h}=scene({mine,force:true,hull:1});a.updateStageHazards(1/120);assert.equal(h.hp,0);assert.equal(a.player.hp,1);assert.equal(a.state,'playing');assert.ok(h.dead&&h.burst);assert.equal(a.stageHazards.length,0)}return{cases:2,force:'staged attached actor geometry; shipping Force hazard response'};
});
check('destroyed debris preserves shields and does not spend an active invulnerability timer',()=>{
 let cases=0;for(const mine of[false,true])for(const inv of[0,.4]){const{a,h}=scene({mine,shield:1,inv});a.fire(1);a.updateStageHazards(1/120);assert.ok(h.dead);assert.equal(a.player.hp,3);assert.equal(a.player.shield,1);assert.equal(a.player.inv,inv);cases++}return{cases};
});
check('living debris retains hull contact and shield contact behavior',()=>{
 let cases=0;for(const mine of[false,true])for(const shield of[0,1]){const{a,h}=scene({mine,hp:2,shield}),score=a.fieldScore;a.fire(0);const shot=a.shots[0];assert.equal(shot.d,1);a.updateStageHazards(1/120);assert.equal(shot.dead,true);assert.equal(a.player.hp,shield?3:2);assert.equal(a.player.shield,0);assert.ok(a.player.inv>0);assert.equal(a.state,'playing');assert.ok(h.dead&&h.burst);assert.equal(a.fieldScore-score,15);assert.equal(a.stageHazards.length,0);cases++}return{cases,nativeTapDamage:1,startingHazardHp:2};
});
check('living debris still vanishes harmlessly on an invulnerable pilot',()=>{
 for(const mine of[false,true]){const{a,h}=scene({mine,hp:2,inv:.4});a.fire(0);a.updateStageHazards(1/120);assert.equal(a.player.hp,3);assert.equal(a.player.inv,.4);assert.ok(h.dead&&h.burst);assert.equal(a.stageHazards.length,0)}return{cases:2};
});
check('destruction stops processing additional shot packets after the first lethal hit',()=>{
 for(const mine of[false,true]){const{a,h}=scene({mine}),score=a.fieldScore;a.fire(1);a.fire(1);const[first,second]=a.shots;a.updateStageHazards(1/120);assert.ok(h.dead&&h.burst);assert.equal(first.dead,true);assert.notEqual(second.dead,true);assert.equal(a.fieldScore-score,15);const particleCount=a.particles.length;a.updateStageHazards(1/120);assert.equal(a.fieldScore-score,15);assert.equal(a.particles.length,particleCount);assert.notEqual(second.dead,true)}return{cases:2,burstAndScore:'once across repeated native hazard updates'};
});
check('pre-depleted debris and mines cannot consume another packet, Force contact or hull',()=>{
 for(const mine of[false,true]){const{a,h}=scene({mine,hp:0,hull:1,force:true}),score=a.fieldScore;a.fire(1);const shot=a.shots[0];a.updateStageHazards(1/120);assert.equal(a.player.hp,1);assert.equal(a.state,'playing');assert.notEqual(shot.dead,true);assert.ok(h.dead&&h.burst);assert.equal(a.fieldScore-score,15);assert.equal(a.stageHazards.length,0)}return{cases:2};
});
const failed=results.filter(r=>!r.passed).length,label=baseline?'v154-baseline':'v155-live';
const report={label,sourceFile:path.relative(root,sourceFile),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),scope:'Private normal Story resources. Actual fire(1), damage, Force/debris response and hazard update. Overlapping geometry and debris HP deliberately staged; no full-campaign outcome claim.',passed:results.length-failed,failed,results};
fs.writeFileSync(path.join(root,'artifacts/field-debris-'+label+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${results.length-failed} field debris check groups passed, ${failed} failed`);process.exitCode=failed?1:0;
