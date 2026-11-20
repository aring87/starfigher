#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),G=require('../gamepad.js'),root=path.resolve(__dirname,'..'),results=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function test(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const pad=(index=0,id='Test Controller')=>({index,id,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
function fixture(extra={}){const p=pad(),devices=[p];let lost=0;const core=G.create({getGamepads:()=>devices,onDisconnect:()=>lost++,...extra});core.poll();return{p,devices,core,get lost(){return lost}}}
function press(p,index,value=1){p.buttons[index]={pressed:value>.5,value}}
test('first connection and screen changes require release before any action can fire',()=>{
 const p=pad();press(p,0);const core=G.create({getGamepads:()=>[p]});let f=core.poll();assert.equal(f.connected,true);assert.equal(f.fire,false);assert.equal(f.pressed.confirm,false);assert.deepEqual(f.rawButtons,[0]);assert.equal(core.poll().fire,false);press(p,0,0);assert.equal(core.poll().fire,false);press(p,0);f=core.poll();assert.equal(f.fire,true);assert.equal(f.pressed.confirm,true);assert.equal(core.requireNeutral().fire,false);assert.equal(core.poll().fire,false);press(p,0,0);core.poll();press(p,0);assert.equal(core.poll().pressed.confirm,true);
});
test('radial deadzone suppresses drift and preserves partial analog speed outside the deadzone',()=>{
 const{p,core}=fixture();p.axes=[.1,.1];let f=core.poll();near(f.moveX,0);near(f.moveY,0);p.axes=[.5,0];f=core.poll();near(f.moveX,(.5-.18)/.82);near(f.moveY,0);assert.ok(f.moveX>0&&f.moveX<1);p.axes=[1,0];near(core.poll().moveX,1);p.axes=[0,-1];near(core.poll().moveY,-1);
});
test('diagonal movement is capped without discarding direction and digital flight overrides drift',()=>{
 const{p,core}=fixture();p.axes=[1,1];let f=core.poll();near(Math.hypot(f.moveX,f.moveY),1);near(f.moveX,Math.SQRT1_2);press(p,12);f=core.poll();near(f.moveX,0);near(f.moveY,-1);press(p,15);f=core.poll();near(Math.hypot(f.moveX,f.moveY),1);near(f.moveX,Math.SQRT1_2);near(f.moveY,-Math.SQRT1_2);
});
test('button actions are edges while firing and precision remain held actions',()=>{
 const{p,core}=fixture();for(const index of[1,2,3,4,8,9])press(p,index);let f=core.poll();assert.equal(f.precision,true);for(const key of['back','delta','force','mount','tree','pause'])assert.equal(f.pressed[key],true,key);f=core.poll();assert.equal(f.precision,true);for(const value of Object.values(f.pressed))assert.equal(value,false);press(p,2,0);core.poll();press(p,2);assert.equal(core.poll().pressed.force,true);
});
test('A and right-trigger fire merge until their final source is released',()=>{
 const{p,core}=fixture();press(p,0);assert.equal(core.poll().fire,true);press(p,7);assert.equal(core.poll().fire,true);press(p,0,0);let f=core.poll();assert.equal(f.fire,true);assert.equal(f.pressed.confirm,false);press(p,7,0);assert.equal(core.poll().fire,false);press(p,6,.8);assert.equal(core.poll().precision,true);
});
test('combat rebindings apply dynamically while menu confirm and back stay accessible',()=>{
 let bindings={fire:[5],precision:[6],delta:[4],force:[3],mount:[2],pause:[9],tree:[8]};const{p,core}=fixture({getBindings:()=>bindings});press(p,0);let f=core.poll();assert.equal(f.pressed.confirm,true);assert.equal(f.fire,false);press(p,0,0);press(p,5);assert.equal(core.poll().fire,true);press(p,1);f=core.poll();assert.equal(f.pressed.back,true);assert.equal(f.pressed.delta,false);press(p,4);assert.equal(core.poll().pressed.delta,true);bindings={...bindings,fire:[]};assert.equal(core.poll().fire,false);
});
test('remapped digital flight leaves menu D-pad navigation fixed',()=>{
 const{p,core}=fixture({getBindings:()=>({up:[3],down:[0],left:[2],right:[1]})});press(p,12);let f=core.poll();assert.equal(f.moveY,0);assert.equal(f.nav.y,-1);press(p,12,0);press(p,3);f=core.poll();assert.equal(f.moveY,-1);assert.equal(f.nav.y,0);p.axes=[.56,0];f=core.poll();assert.equal(f.nav.x,1);
});
test('capture data remains available during neutral gating without leaking gameplay actions',()=>{
 const{p,core}=fixture();core.requireNeutral();press(p,5);press(p,7);const f=core.poll();assert.deepEqual(f.rawButtons,[5,7]);assert.equal(f.fire,false);assert.equal(f.moveX,0);assert.deepEqual(f.nav,{x:0,y:0});for(const value of Object.values(f.pressed))assert.equal(value,false);press(p,5,0);press(p,7,0);p.axes=[.9,0];core.poll();press(p,0);assert.equal(core.poll().fire,false);press(p,0,0);p.axes=[0,0];core.poll();press(p,0);assert.equal(core.poll().fire,true);
});
test('disconnect clears held actions exactly once and reconnect requires a new neutral sample',()=>{
 const f=fixture();press(f.p,0);assert.equal(f.core.poll().fire,true);f.devices[0]=null;let output=f.core.poll();assert.equal(output.connected,false);assert.equal(output.fire,false);assert.equal(f.lost,1);f.core.poll();assert.equal(f.lost,1);f.devices[0]=f.p;assert.equal(f.core.poll().fire,false);press(f.p,0,0);f.core.poll();press(f.p,0);assert.equal(f.core.poll().fire,true);
});
test('sparse pad lists retain the selected device rather than letting another controller hijack play',()=>{
 const first=pad(2,'First'),other=pad(5,'Other');const devices=[null,null,first,null,null,other];let lost=0;const core=G.create({getGamepads:()=>devices,onDisconnect:()=>lost++});assert.equal(core.poll().index,2);press(other,0);assert.equal(core.poll().fire,false);devices[2]=null;let f=core.poll();assert.equal(lost,1);assert.equal(f.index,5);assert.equal(f.fire,false);press(other,0,0);core.poll();press(other,0);assert.equal(core.poll().fire,true);
});
test('missing or blocked APIs and nonstandard pads fail safely without stopping the game',()=>{
 assert.equal(G.create().poll().supported,false);const p=pad();p.mapping='';let f=G.create({getGamepads:()=>[p]}).poll();assert.equal(f.connected,false);assert.equal(f.supported,true);assert.equal(f.unsupported,true);let blocked=false,lost=0;p.mapping='standard';const core=G.create({getGamepads:()=>{if(blocked)throw new Error('blocked');return[p]},onDisconnect:()=>lost++});core.poll();press(p,7);assert.equal(core.poll().fire,true);blocked=true;f=core.poll();assert.equal(f.fire,false);assert.equal(f.connected,false);assert.equal(f.supported,false);assert.equal(lost,1);core.poll();assert.equal(lost,1);
});
test('invalid axes, button payloads and invalid bindings remain finite and never mutate defaults',()=>{
 const{p,core}=fixture({getBindings:()=>({fire:['bad'],precision:[-1]})});p.axes=[NaN,Infinity];p.buttons[4]={value:NaN};let f=core.poll();assert.equal(f.moveX,0);assert.equal(f.moveY,0);assert.equal(f.precision,false);press(p,0);assert.equal(core.poll().fire,true);assert.equal(Object.isFrozen(G.DEFAULT_BINDINGS.fire),true);assert.throws(()=>G.create({deadzone:1}));assert.throws(()=>G.create({deadzone:NaN}));
});
test('browser export has no DOM, storage, timers or ambient browser dependencies',()=>{
 const source=fs.readFileSync(path.join(root,'gamepad.js'),'utf8'),sandbox={window:{}};vm.runInNewContext(source,sandbox);assert.equal(typeof sandbox.window.StarfighterGamepad.create,'function');assert.equal(sandbox.window.StarfighterGamepad.create().poll().connected,false);assert.equal(Object.isFrozen(G),true);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/gamepad-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} gamepad checks passed, ${failed} failed`);if(failed)process.exitCode=1;
