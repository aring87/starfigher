#!/usr/bin/env node
'use strict';
// Real damage and presentation helpers with temporary browser/storage mocks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {encounterTrailHp,noteEncounterDamage,damageBossArmor,drawBossStatus,activateDelta,');
support=support.replace('shadowBlur: state.shadowBlur, ...extra','shadowBlur: state.shadowBlur, fillStyle:state.fillStyle, ...extra');
support=support.replace("beginPath() { record('beginPath'); },","fillText(...args) { record('fillText',args); },beginPath() { record('beginPath'); },");
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const{createGame}=isolated.exports,results=[];
function check(name,fn){try{const detail=fn();results.push({name,passed:true,detail});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function encounter(family='main',index=0){const game=createGame(),a=game.api;if(family==='mini')a.startMiniBossLab(index);else if(family==='epic')a.startEpicBossLab(index);else a.startBossLab(index);const e=a.boss||a.miniBoss;Object.assign(e,{intro:0,clock:5,phaseTransition:0,hidden:false,ritual:null});return{...game,e}}
function close(a,b,epsilon=1e-7){assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`)}
check('all 22 encounter families keep actual damage immediate and show only the recent health loss',()=>{
 let count=0;for(const[family,total]of[['mini',10],['main',10],['epic',2]])for(let index=0;index<total;index++){
  const{api:a,e}=encounter(family,index),before=e.hp,node=a.activeWeakNodes(e)[0],amount=Math.min(5,node.hp*.1),playerKeys=Object.keys(a.player).sort();a.damageWeakNode(e,node,amount);
  close(e.hp,before-amount);close(a.encounterTrailHp(e),before);e.clock+=.5;const expected=e.hp+amount*Math.exp(-4.5);close(a.encounterTrailHp(e),expected);assert.deepEqual(Object.keys(a.player).sort(),playerKeys);count++
 }return{encounters:count}
});
check('armor chip and Delta feed the same health feedback without changing their damage',()=>{
 const{api:a,e}=encounter('main',1);e.weakOpen=false;const before=e.hp;assert.equal(a.damageBossArmor(e,{x:e.x-70,y:e.y,d:8}),true);close(e.hp,before-2);close(a.encounterTrailHp(e),before);
 e.clock+=1;const beforeDelta=e.hp,nodes=a.activeWeakNodes(e),expected=nodes.reduce((sum,n)=>sum+Math.min(n.hp,Math.max(5,n.max*.22)),0);a.player.dose=100;a.activateDelta();close(e.hp,beforeDelta-expected);assert.equal(a.player.dose,0);assert.equal(a.player.deltaFlash,1.2);assert.ok(a.encounterTrailHp(e)>e.hp);
 const protectedHp=e.hp;e.intro=1;assert.equal(a.damageBossArmor(e,{x:e.x,y:e.y,d:100}),false);assert.equal(e.hp,protectedHp);return{armorDamage:2,deltaDamage:expected}
});
check('damage settling is analytic, draw-rate independent and frozen with the encounter clock',()=>{
 const values=[];for(const rate of[30,60,120]){const{api:a,e}=encounter('mini',0),node=a.activeWeakNodes(e)[0];a.damageWeakNode(e,node,8);for(let n=0;n<rate/2;n++){e.clock+=1/rate;a.encounterTrailHp(e)}const hp=a.encounterTrailHp(e);for(let n=0;n<100;n++)close(a.encounterTrailHp(e),hp);values.push(hp)}close(values[0],values[1]);close(values[1],values[2]);return{displayRates:[30,60,120]}
});
check('sustained hits accumulate bounded recent damage rather than holding the original full bar',()=>{
 const{api:a,e}=encounter('main',1),start=e.hp,node=a.activeWeakNodes(e)[0];let expected=0;for(let n=0;n<6;n++){if(n){e.clock+=.1;expected*=Math.exp(-.9)}a.damageWeakNode(e,node,3);expected+=3;close(a.encounterTrailHp(e)-e.hp,expected)}assert.ok(a.encounterTrailHp(e)<start-9,'The trail must keep settling during sustained fire');e.clock+=2;assert.ok(a.encounterTrailHp(e)-e.hp<.00001);return{hits:6}
});
check('phase, clock, direct health and max-health changes cannot leave stale damage feedback',()=>{
 for(const mutate of[e=>e.phase++,e=>e.clock-=1,e=>e.hp+=2,e=>e.hp-=2,e=>e.max+=10]){const{api:a,e}=encounter('main',1);a.damageWeakNode(e,a.activeWeakNodes(e)[0],5);mutate(e);close(a.encounterTrailHp(e),e.hp);const before=e.hp;a.damageWeakNode(e,a.activeWeakNodes(e)[0],1);close(a.encounterTrailHp(e),before)}return{resetCases:5}
});
check('Art Inspector preview health remains isolated and resumes the frozen real feedback after closing',()=>{
 const{api:a,e}=encounter('main',1);a.damageWeakNode(e,a.activeWeakNodes(e)[0],6);e.clock+=.05;const hp=e.hp,clock=e.clock,trail=a.encounterTrailHp(e);a.openArtInspection();a.setInspectionMaterial('damaged');close(a.encounterTrailHp(e),e.hp);a.advanceArtInspection(.2);close(a.encounterTrailHp(e),e.hp);a.closeArtInspection();assert.equal(e.hp,hp);assert.equal(e.clock,clock);close(a.encounterTrailHp(e),trail);return{previewIsolated:true}
});
check('Reduced Motion settles the bar directly and exposed-core text stays steady with isolated canvas state',()=>{
 const{api:a,e,sandbox}=encounter('main',1);a.damageWeakNode(e,a.activeWeakNodes(e)[0],6);sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;close(a.encounterTrailHp(e),e.hp);e.weakOpen=true;const c=a.drawingContext,colors=[];
 for(const time of[0,.1,.2,.3]){a.setTime(time);c.trace=[];a.drawBossStatus();const text=c.trace.find(r=>r.op==='fillText'&&r.args[0]==='WEAKPOINTS EXPOSED');assert.ok(text);colors.push(text.fillStyle);c.trace=null}assert.equal(new Set(colors).size,1);
 const before=JSON.stringify(e);c.globalAlpha=.37;c.globalCompositeOperation='multiply';c.filter='hue-rotate(15deg)';c.shadowBlur=7;c.translate(3,5);const transform=c.getTransform();a.drawBossStatus();assert.equal(JSON.stringify(e),before);assert.equal(c.globalAlpha,.37);assert.equal(c.globalCompositeOperation,'multiply');assert.equal(c.filter,'hue-rotate(15deg)');assert.equal(c.shadowBlur,7);for(const key of['a','b','c','d','e','f'])assert.equal(c.getTransform()[key],transform[key]);return{steadySamples:4}
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/encounter-feedback-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} encounter-feedback checks passed, ${failed} failed`);if(failed)process.exitCode=1;
