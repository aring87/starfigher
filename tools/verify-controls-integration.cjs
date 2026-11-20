#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest(')).replace('globalThis.__gameTest = {','globalThis.__gameTest = {pollController,applyControlBindings,formatInputLesson,beginTrainingPractice,setupTrainingLesson,openFlightSchool,get trainingFrame(){return trainingFrame},setTrainingController(value){trainingController=value},get controlBindings(){return controlBindings},get padFrame(){return padFrame},');const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);const{createGame}=m.exports,results=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pad=()=>({index:0,id:'Private Standard Pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
function setup(){const p=pad(),devices=[p],g=createGame({ruleset:'streamlined-v1',navigator:{getGamepads:()=>devices}});return{...g,p,devices}}
function button(g,index,held=true){g.p.buttons[index]={pressed:held,value:held?1:0};g.api.pollController()}
function neutral(g){g.p.axes=[0,0];g.p.buttons.forEach((_,i)=>g.p.buttons[i]={pressed:false,value:0});g.api.pollController()}
function key(g,type,code){g.sandbox.dispatchEvent({type,code,repeat:false,target:g.document.body})}
function test(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
test('remapped keyboard flight and fire use actual movement, charging and release paths',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings;a.applyControlBindings(B.rebind(a.controlBindings,'keyboard','fire',0,'KeyK').bindings);a.applyControlBindings(B.rebind(a.controlBindings,'keyboard','right',0,'KeyL').bindings);a.start('story');const x=a.player.x;key(g,'keydown','KeyD');a.update(.1);near(a.player.x,x);key(g,'keyup','KeyD');key(g,'keydown','KeyL');a.update(.1);near(a.player.x,x+25.5);key(g,'keyup','KeyL');key(g,'keydown','KeyZ');a.update(.2);near(a.player.charge,0);key(g,'keyup','KeyZ');key(g,'keydown','KeyK');a.update(1.25);near(a.player.charge,1);key(g,'keyup','KeyK');assert.ok(a.shots.some(s=>s.charge===1));
});
test('analog magnitude survives the real update and precision scales both stick and keyboard motion',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);g.p.axes=[.5,0];a.pollController();let x=a.player.x;a.update(.1);near(a.player.x-x,255*.1*(.5-.18)/.82);button(g,4);x=a.player.x;a.update(.1);near(a.player.x-x,255*.1*.45*(.5-.18)/.82);neutral(g);key(g,'keydown','KeyD');key(g,'keydown','ShiftLeft');x=a.player.x;a.update(.1);near(a.player.x-x,255*.1*.45);
});
test('keyboard, mouse and controller charge sources release exactly once after the final held source',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);key(g,'keydown','KeyZ');button(g,7);a.update(.5);const count=a.shots.length;key(g,'keyup','KeyZ');assert.equal(a.shots.length,count);button(g,0);button(g,7,false);assert.equal(a.shots.length,count);button(g,0,false);assert.equal(a.shots.length,count+1);assert.ok(a.shots.at(-1).charge>.3);a.pollController();assert.equal(a.shots.length,count+1);
});
test('rebound controller fire stops the old combat button while fixed menu confirm stays available',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings;a.applyControlBindings(B.rebind(a.controlBindings,'controller','fire',0,5).bindings);a.start('story');neutral(g);button(g,0);assert.equal(a.padFrame.pressed.confirm,true);a.update(.1);near(a.player.charge,0);button(g,0,false);button(g,5);a.update(.5);assert.ok(a.player.charge>0);button(g,5,false);assert.ok(a.shots.some(s=>s.charge>0));
});
test('Force, mount and Delta execute on controller edges through their real actions',()=>{
 const g=setup(),a=g.api;a.start('story');a.collectCombatPickup({type:'crystal',color:'red'});a.player.pod.mode='docked';neutral(g);button(g,2);assert.equal(a.player.pod.mode,'deployed');a.pollController();assert.equal(a.player.pod.mode,'deployed');button(g,2,false);button(g,3);assert.equal(a.player.pod.returnSide,'rear');button(g,3,false);a.player.dose=100;button(g,1);assert.equal(a.player.dose,0);assert.ok(a.player.deltaFlash>0);
});
test('pause, resume and a screen transition cannot carry held controller fire into a shot',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);button(g,0);a.update(.5);button(g,9);assert.equal(a.state,'paused');assert.equal(a.player.charge,0);button(g,9,false);a.pollController();assert.equal(a.padFrame.fire,false);neutral(g);button(g,9);assert.equal(a.state,'playing');button(g,0);button(g,9,false);a.update(.2);assert.equal(a.player.charge,0);neutral(g);button(g,0);a.update(.2);assert.ok(a.player.charge>0);
});
test('disconnect pauses an active controller charge, discards it and gates a reconnect',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);button(g,7);a.update(.5);const count=a.shots.length;g.devices.length=0;a.pollController();assert.equal(a.state,'paused');assert.equal(a.player.charge,0);assert.equal(a.shots.length,count);g.devices.push(g.p);a.pollController();assert.equal(a.padFrame.fire,false);assert.equal(a.shots.length,count);
});
test('binding Pause to A does not steal fixed menu confirmation while paused',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings;a.applyControlBindings(B.rebind(a.controlBindings,'controller','pause',0,0).bindings);a.start('story');neutral(g);button(g,0);assert.equal(a.state,'paused');neutral(g);let confirms=0;g.sandbox.StarfighterControlsUI={...g.sandbox.StarfighterControlsUI,activate:()=>confirms++};button(g,0);assert.equal(confirms,1);assert.equal(a.state,'paused');neutral(g);button(g,9);assert.equal(a.state,'playing');assert.equal(a.player.charge,0);
});
test('a controller cannot resume or act while the game window has lost focus',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);button(g,7);a.update(.2);g.sandbox.dispatchEvent({type:'blur'});assert.equal(a.state,'paused');button(g,7,false);button(g,9);assert.equal(a.state,'paused');assert.equal(a.padFrame.fire,false);g.sandbox.dispatchEvent({type:'focus'});a.pollController();assert.equal(a.state,'paused');neutral(g);button(g,9);assert.equal(a.state,'playing');
});
test('controller navigation repeats at a bounded rate and never creates a gameplay shot in menus',()=>{
 const g=setup(),a=g.api;let moves=0,confirms=0;g.sandbox.StarfighterControlsUI={...g.sandbox.StarfighterControlsUI,navigate:()=>moves++,activate:()=>confirms++};neutral(g);g.p.axes=[0,1];a.pollController(1000);a.pollController(1100);assert.equal(moves,1);a.pollController(1340);assert.equal(moves,2);g.p.axes=[0,0];button(g,0);assert.equal(confirms,1);assert.equal(a.padFrame.fire,false);assert.equal(a.player.charge,0);
});
test('controls modals block combat input and keyboard typing never activates remapped actions',()=>{
 const g=setup(),a=g.api;a.start('story');neutral(g);g.find('#controls-dialog').open=true;button(g,0);a.update(.1);assert.equal(a.player.charge,0);g.find('#controls-dialog').open=false;neutral(g);const input=g.document.createElement('input');g.sandbox.dispatchEvent({type:'keydown',code:'KeyZ',target:input,repeat:false});a.update(.1);assert.equal(a.player.charge,0);
});
test('Flight School receives actual controller shots and Force actions, and A continues a completed lesson',()=>{
 const g=setup(),a=g.api,events=[],before=JSON.stringify(a.profile);g.sandbox.STARFIGHTER_TRAINING_SANDBOX=true;a.beginTrainingPractice();a.setTrainingController({note:(type,payload)=>events.push({type,...payload}),tick(){},close(){}});a.setupTrainingLesson('fire');neutral(g);button(g,0);a.update(.03);button(g,0,false);assert.ok(events.some(e=>e.type==='shot'));a.setupTrainingLesson('mount');neutral(g);button(g,2);assert.equal(a.player.pod.mode,'deployed');let advanced=0;a.setTrainingController({canContinue:true,advance(){advanced++},tick(){},close(){}});neutral(g);button(g,0);assert.equal(advanced,1);assert.equal(a.player.charge,0);assert.equal(JSON.stringify(a.profile),before);
});
test('the separate practice document imports custom controls while its parent ignores pad presses',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings;a.applyControlBindings(B.rebind(a.controlBindings,'keyboard','fire',0,'KeyK').bindings);const before=JSON.stringify(a.profile);a.openFlightSchool(false,'intro');assert.ok(a.trainingFrame);const params=new URL(a.trainingFrame.src,'http://practice.test').searchParams;assert.equal(JSON.parse(params.get('controls')).keyboard.fire[0],'KeyK');button(g,0);assert.equal(a.padFrame.fire,false);assert.equal(a.state,'menu');assert.equal(JSON.stringify(a.profile),before);
});
test('bindings persist independently of pilot gear and hint substitution does not rewrite inserted bindings',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings,before=JSON.stringify(a.profile),bindings=B.rebind(a.controlBindings,'keyboard','fire',0,'KeyC').bindings;a.applyControlBindings(bindings);assert.equal(JSON.stringify(a.profile),before);const copy=a.formatInputLesson({copy:'Tap Z, Space or X. Press C.',tip:'Shift',keys:['Z / SPACE / X'],goals:['Press C']});assert.match(copy.copy,/Tap C\. Press Z\./);const next=createGame({initialStorage:Array.from(g.storage)});assert.equal(next.api.controlBindings.keyboard.fire[0],'KeyC');assert.equal(next.api.controlBindings.keyboard.force[0],'KeyZ');
});
test('practice control changes are accepted only from its own same-origin frame and never alter the pilot',()=>{
 const g=setup(),a=g.api,B=g.sandbox.StarfighterBindings;a.openFlightSchool(false,'intro');g.sandbox.location.origin='http://practice.test';const acknowledgements=[];a.trainingFrame.contentWindow={postMessage:data=>acknowledgements.push(data)};const child=a.trainingFrame.contentWindow,next=B.rebind(a.controlBindings,'controller','force',0,5).bindings,before=JSON.stringify(a.profile);
 g.sandbox.dispatchEvent({type:'message',source:{},origin:g.sandbox.location.origin,data:{type:'starfighter-controls-changed',bindings:next}});assert.equal(a.controlBindings.controller.force[0],2);
 g.sandbox.dispatchEvent({type:'message',source:child,origin:'http://wrong.test',data:{type:'starfighter-controls-changed',bindings:next}});assert.equal(a.controlBindings.controller.force[0],2);
 g.sandbox.dispatchEvent({type:'message',source:child,origin:g.sandbox.location.origin,data:{type:'starfighter-controls-changed',bindings:{version:999}}});assert.equal(a.controlBindings.controller.force[0],2);
 g.sandbox.dispatchEvent({type:'message',source:child,origin:g.sandbox.location.origin,data:{type:'starfighter-controls-changed',bindings:next}});assert.equal(a.controlBindings.controller.force[0],5);assert.equal(acknowledgements[0].saved,true);assert.equal(JSON.stringify(a.profile),before);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/controls-integration-audit.json'),JSON.stringify({passed,failed,hardware:'Simulated browser-standard pad; no physical device assertion',results},null,2)+'\n');console.log(`${passed} controls integration checks passed, ${failed} failed`);if(failed)process.exitCode=1;
