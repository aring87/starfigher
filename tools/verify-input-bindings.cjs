#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),B=require('../input-bindings.js'),results=[],clone=value=>JSON.parse(JSON.stringify(value));
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('all existing keyboard alternatives and standard controller defaults remain available',()=>{
 const defaults=B.normalize(B.defaults);assert.notEqual(defaults,B.defaults);assert.deepEqual(defaults.keyboard.fire,['KeyZ','Space','KeyX']);assert.deepEqual(defaults.keyboard.precision,['ShiftLeft','ShiftRight']);assert.deepEqual(defaults.keyboard.pause,['Escape','KeyP']);assert.deepEqual(defaults.controller.fire,[0,7]);assert.deepEqual(defaults.controller.precision,[4,6]);assert.deepEqual(B.actionsForKey(defaults,'KeyC'),['force']);assert.deepEqual(B.actionsForKey(defaults,'Tab'),[]);assert.equal(Object.isFrozen(defaults.keyboard.fire),true);
});
check('keyboard replacement swaps a conflict without unbinding either action or touching controller settings',()=>{
 const before=JSON.stringify(B.defaults),result=B.rebind(B.defaults,'keyboard','fire',0,'KeyC');assert.equal(result.bindings.keyboard.fire[0],'KeyC');assert.deepEqual(result.bindings.keyboard.force,['KeyZ']);assert.deepEqual(result.swapped,{action:'force',slot:0,previous:'KeyC',replacement:'KeyZ'});assert.deepEqual(result.bindings.controller,B.defaults.controller);assert.equal(JSON.stringify(B.defaults),before);assert.equal(Object.isFrozen(result.bindings),true);
});
check('controller conflicts swap whole buttons while retaining the alternate fire trigger',()=>{
 const result=B.rebind(B.defaults,'controller','force',0,0);assert.deepEqual(result.bindings.controller.force,[0]);assert.deepEqual(result.bindings.controller.fire,[2,7]);assert.deepEqual(result.bindings.keyboard,B.defaults.keyboard);assert.equal(result.swapped.action,'fire');assert.equal(result.swapped.replacement,2);
});
check('same-action aliases swap positions and later empty slots append without sparse arrays',()=>{
 let r=B.rebind(B.defaults,'keyboard','up',0,'ArrowUp');assert.deepEqual(r.bindings.keyboard.up,['ArrowUp','KeyW']);assert.equal(r.swapped.action,'up');r=B.rebind(r.bindings,'keyboard','force',2,'KeyJ');assert.deepEqual(r.bindings.keyboard.force,['KeyC','KeyJ']);assert.deepEqual(B.normalize(r.bindings),r.bindings);
});
check('clearing keeps each action reachable and empty-slot conflicts cannot silently steal another action',()=>{
 assert.throws(()=>B.rebind(B.defaults,'keyboard','force',0,null),/at least one/);const cleared=B.rebind(B.defaults,'keyboard','fire',1,null).bindings;assert.deepEqual(cleared.keyboard.fire,['KeyZ','KeyX']);assert.throws(()=>B.rebind(B.defaults,'keyboard','force',1,'KeyW'),/Replace an occupied slot/);assert.throws(()=>B.rebind(B.defaults,'keyboard','force',2,null),/already empty/);
});
check('reserved keys and invalid button, action or slot IDs fail before modifying controls',()=>{
 for(const code of['Enter','Tab','MetaLeft','ControlLeft','AltRight','F2','F5','BrowserBack','made-up'])assert.throws(()=>B.rebind(B.defaults,'keyboard','fire',0,code));assert.throws(()=>B.rebind(B.defaults,'keyboard','fire',0,'Escape'),/reserved/);assert.throws(()=>B.rebind(B.defaults,'keyboard','pause',0,'Space'),/Escape stays reserved/);
 for(const button of[-1,16,1.5,NaN,'0'])assert.throws(()=>B.rebind(B.defaults,'controller','fire',0,button));for(const index of[-1,3,1.5,NaN])assert.throws(()=>B.rebind(B.defaults,'keyboard','fire',index,'KeyJ'));assert.throws(()=>B.rebind(B.defaults,'touch','fire',0,'KeyJ'));assert.throws(()=>B.rebind(B.defaults,'controller','mouse',0,5));
});
check('malformed, duplicate or future stored configurations fall back as a complete safe default set',()=>{
 const bads=[null,[],{version:99},clone(B.defaults),clone(B.defaults),clone(B.defaults),clone(B.defaults),clone(B.defaults),clone(B.defaults)];bads[3].keyboard.fire=['KeyJ','KeyJ'];delete bads[4].keyboard.pause;bads[5].controller.fire=[16];bads[6].keyboard.extra=['KeyJ'];bads[7].controller.force=[0];bads[8].keyboard.fire=[,'KeyJ'];
 for(const bad of bads){const normalized=B.normalize(bad);assert.deepEqual(normalized,B.defaults);assert.notEqual(normalized,B.defaults)}
});
check('saved keyboard and controller customizations survive reload and invalid saves never replace data',()=>{
 const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)},keyboard=B.rebind(B.defaults,'keyboard','fire',0,'KeyJ').bindings,custom=B.rebind(keyboard,'controller','fire',0,5).bindings;assert.deepEqual(B.save(storage,custom),{saved:true});assert.deepEqual(B.load(storage),custom);const raw=map.get(B.storageKey);assert.equal(B.save(storage,{version:99}).saved,false);assert.equal(map.get(B.storageKey),raw);map.set(B.storageKey,'{broken');assert.deepEqual(B.load(storage),B.defaults);
});
check('blocked or unavailable browser storage never prevents session controls from working',()=>{
 const blocked={getItem(){throw new Error('SecurityError')},setItem(){throw new Error('QuotaExceededError')}};assert.deepEqual(B.load(blocked),B.defaults);assert.equal(B.save(blocked,B.defaults).saved,false);assert.deepEqual(B.load(null),B.defaults);assert.equal(B.save(null,B.defaults).saved,false);assert.equal(B.save({setItem:()=>false},B.defaults).saved,false);assert.deepEqual(B.rebind(B.load(blocked),'controller','fire',0,5).bindings.controller.fire,[5,7]);
});
check('labels cover keyboard keys, Xbox and PlayStation controller names without DOM dependencies',()=>{
 assert.equal(B.labelKey('KeyJ'),'J');assert.equal(B.labelKey('Numpad2'),'Numpad 2');assert.equal(B.labelKey('ArrowUp'),'↑');assert.equal(B.labelButton(0),'A / Cross');assert.equal(B.labelButton(7),'RT / R2');assert.equal(B.labelButton(12),'D-pad up');const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'input-bindings.js'),'utf8'),sandbox);assert.equal(sandbox.window.StarfighterBindings.defaults.version,1);assert.deepEqual(Array.from(sandbox.window.StarfighterBindings.defaults.controller.fire),[0,7]);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/input-bindings-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} input-binding checks passed, ${failed} failed`);if(failed)process.exitCode=1;
