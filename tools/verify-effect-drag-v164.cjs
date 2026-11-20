#!/usr/bin/env node
'use strict';
// Compare actual frozen/current production functions in disposable VM pilots.
// Exact state and RNG comparisons establish effect behavior; timings/GPU FPS
// and human animation judgment are outside this test's scope.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),baseline='artifacts/effects-v163-baseline-game.js';
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {updateParticles,');
support=support.replace('const sandbox = eventTarget({','const sandbox = eventTarget({Math:options.effectMath||Math,');
assert.ok(support.includes('Math:options.effectMath||Math'));
function harness(frozen){
 let text=support;if(frozen)text=text.replace("path.join(root, 'game.js'), 'utf8'","path.join(root, 'artifacts/effects-v163-baseline-game.js'), 'utf8'");
 const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(text+'\nmodule.exports={createGame};',file);return isolated.exports.createGame;
}
const createBaseline=harness(true),createCandidate=harness(false),results=[];
function effectMath(seed){
 let state=seed>>>0,randomCalls=0,counts={particle:0,debris:0};const m=Object.create(Math);
 m.random=()=>{randomCalls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 m.pow=(base,exponent)=>{if(base===.97)counts.particle++;if(base===.7)counts.debris++;return Math.pow(base,exponent)};
 return{m,get randomState(){return{state,calls:randomCalls}},get counts(){return{...counts}},resetCounts(){counts={particle:0,debris:0}}};
}
function pair(seed=164){
 const a=effectMath(seed),b=effectMath(seed),before=createBaseline({ruleset:'streamlined-v1',effectMath:a.m}),after=createCandidate({ruleset:'streamlined-v1',effectMath:b.m});
 return{before,after,a,b};
}
const copy=value=>structuredClone(value);
function equalEffects(p,label){
 for(const field of['particles','debris','bossFragments','shots','enemyShots','pickups','enemies','player','runStats'])assert.deepEqual(copy(p.after.api[field]),copy(p.before.api[field]),label+' / '+field);
 assert.equal(p.after.api.time,p.before.api.time,label+' / simulation time');assert.equal(p.after.api.state,p.before.api.state,label+' / screen');assert.deepEqual(p.b.randomState,p.a.randomState,label+' / RNG sequence');
}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function seedParticles(api,dt){
 api.particles.length=0;
 const zero=[0,-0],life=[0,dt,dt/2,dt+Number.EPSILON,1,10];
 for(let i=0;i<48;i++)api.particles.push({id:i,x:i%2?-.125:1e6,y:i%3?2.75:-1000,vx:i<2?zero[i]:(i-20)*3.125,vy:i<2?zero[1-i]:(20-i)*2.75,life:life[i%life.length],max:10,c:'#bbaaff',s:2,smoke:i%3===0,damageSmoke:i%4===0});
}
function quietBoss(g){g.api.startBossLab(0);g.api.boss.intro=1000;g.api.boss.phaseFlash=0;g.api.player.inv=1e6;g.api.particles.length=0;g.api.debris.length=0;g.api.bossFragments.length=0}

check('single particle updates match frozen values, expiry, signed zero and survivor identity at all supported time steps',()=>{
 const p=pair(),steps=[0,1/120,1/60,1/30,.1];let snapshots=0;
 for(const dt of steps){for(const g of[p.before,p.after])seedParticles(g.api,dt);const oldBefore=[...p.before.api.particles],oldAfter=[...p.after.api.particles];p.before.api.updateParticles(dt);p.after.api.updateParticles(dt);assert.deepEqual(copy(p.after.api.particles),copy(p.before.api.particles));
  for(const item of p.before.api.particles)assert.equal(item,oldBefore[item.id]);for(const item of p.after.api.particles)assert.equal(item,oldAfter[item.id]);snapshots++;
 }
 return{steps,snapshots};
});

check('long mixed-step trajectories retain exact position, velocity, lifetime and removal order',()=>{
 const p=pair();for(const g of[p.before,p.after]){g.api.particles.length=0;for(let i=0;i<700;i++)g.api.particles.push({id:i,x:30+i*.3,y:50+i*.2,vx:(i%43-21)*11.5,vy:(i%37-18)*9.125,life:.05+(i%70)*.021,max:2,c:'#fff',s:1});}
 const steps=[1/120,1/120,1/30,0,1/60,.1];for(let tick=0;tick<180;tick++){const dt=steps[tick%steps.length];p.before.api.updateParticles(dt);p.after.api.updateParticles(dt);assert.deepEqual(copy(p.after.api.particles),copy(p.before.api.particles),'tick '+tick)}
 assert.equal(p.after.api.particles.length,0);return{initialParticles:700,exactTrajectorySteps:180};
});

for(const [mode,limit,debrisLimit]of[['standard',700,100],['clearCombat',300,40],['reducedMotion',450,60]])check(`${mode} full updates preserve capped effects, debris smoke, emission randomness and cleanup`,()=>{
 const p=pair(700+limit);for(const g of[p.before,p.after]){quietBoss(g);g.sandbox.STARFIGHTER_SETTINGS.clearCombat=mode==='clearCombat';g.sandbox.STARFIGHTER_SETTINGS.reducedMotion=mode==='reducedMotion';g.api.particlesAt(500,230,'#ff9977',3000,220);g.api.debrisAt(500,230,'#aaccff',500,1.2);assert.equal(g.api.particles.length,limit);assert.equal(g.api.debris.length,debrisLimit);}
 equalEffects(p,'after capped burst');let maxParticles=0,smokeSeen=false;for(let tick=0;tick<240;tick++){p.before.api.update(1/120);p.after.api.update(1/120);equalEffects(p,'tick '+tick);maxParticles=Math.max(maxParticles,p.after.api.particles.length);smokeSeen ||=p.after.api.particles.some(x=>x.smoke);assert.ok(p.after.api.particles.length<=limit);assert.ok(p.after.api.debris.length<=debrisLimit)}
 assert.ok(smokeSeen,'Debris must continue emitting its authored smoke');assert.equal(p.after.api.debris.length,0);return{simulationSteps:240,initialParticles:limit,initialDebris:debrisLimit,maxParticles,smokeSeen,randomCalls:p.b.randomState.calls};
});

check('empty effect updates calculate no particle or debris drag',()=>{
 const p=pair();for(const g of[p.before,p.after])quietBoss(g);p.a.resetCounts();p.b.resetCounts();p.before.api.update(1/120);p.after.api.update(1/120);equalEffects(p,'empty update');assert.deepEqual(p.a.counts,{particle:0,debris:0});assert.deepEqual(p.b.counts,{particle:0,debris:0});return{before:p.a.counts,after:p.b.counts};
});

check('a normal maximum-load update reuses two decay values with identical effect and combat state',()=>{
 const p=pair();for(const g of[p.before,p.after]){quietBoss(g);for(let i=0;i<700;i++)g.api.particles.push({x:300+i*.01,y:150,vx:-15+i*.02,vy:-8,life:10,max:10,c:'#fff',s:1});for(let i=0;i<100;i++)g.api.debris.push({x:400,y:200,vx:20-i*.1,vy:-10,rot:i*.05,vr:2,life:10,max:10,smoke:99,size:4,color:'#fff',shape:5});}
 p.a.resetCounts();p.b.resetCounts();p.before.api.update(1/120);p.after.api.update(1/120);equalEffects(p,'maximum update');assert.deepEqual(p.a.counts,{particle:1400,debris:200});assert.deepEqual(p.b.counts,{particle:1,debris:1});return{before:p.a.counts,after:p.b.counts,at120Hz:{beforeCallsPerSecond:192000,afterCallsPerSecond:240},scope:'Decay exponent calls only; not whole-update cost or FPS.'};
});

check('Art Inspector smoke follows the frozen larger-step trajectory and restores the original combat effects',()=>{
 const p=pair();for(const g of[p.before,p.after]){g.api.startBossLab(1);g.api.particles.push({id:'retained',x:10,y:20,vx:30,vy:40,life:1,max:1,c:'#fff',s:2});g.savedParticles=g.api.particles;g.savedEffects=copy(g.api.particles);g.api.openArtInspection();g.api.setInspectionMaterial('damaged');}
 for(let tick=0;tick<45;tick++){p.before.api.advanceArtInspection(1/30);p.after.api.advanceArtInspection(1/30);equalEffects(p,'inspection tick '+tick)}
 assert.ok(p.after.api.particles.some(x=>x.smoke));for(const g of[p.before,p.after]){g.api.closeArtInspection();assert.equal(g.api.particles,g.savedParticles);assert.deepEqual(copy(g.api.particles),g.savedEffects)}equalEffects(p,'restored inspection');return{inspectionSteps:45,dt:1/30,combatEffectArrayRestored:true};
});

const failed=results.filter(x=>!x.passed).length,hash=name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),report={version:164,sourceHashes:{candidate:hash('game.js'),baseline:hash(baseline)},passed:results.length-failed,failed,results,limits:['Actual production simulation and frozen v163 in disposable VM pilots; browser drawing/audio are mocked.','Exact state/RNG equality protects inputs supplied to unchanged effect renderers.','Counted decay exponent calls establish removed repeated work; no whole-update timing or FPS claim.','Real-device sustained frame times, human animation judgment and long campaign testing remain separate.']};
fs.writeFileSync(path.join(root,'artifacts/effect-drag-v164-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} effect-drag checks passed, ${failed} failed`);if(failed)process.exitCode=1;
