#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),T=require('../encounter-tactics.js'),results=[];
const plain=value=>JSON.parse(JSON.stringify(value)),nodes=count=>Array.from({length:count},()=>({hp:10,destroyed:false}));
function check(name,run){try{const details=run();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('the full roster exposes distinct concise tactical identities without inventory or asset state',()=>{
 assert.equal(T.catalogue.length,22);assert.equal(new Set(T.catalogue.map(item=>item.id)).size,22);assert.equal(new Set(T.catalogue.map(item=>item.name)).size,22);assert.equal(new Set(T.catalogue.map(item=>item.tactic)).size,22);
 for(const row of T.catalogue){assert.ok(row.tactic.length>30&&row.tactic.length<120);assert.ok(!/level|rarity|veteran|element|gear/i.test(row.tactic));assert.ok(Object.isFrozen(row));const def=T.describe(row);assert.equal(def.name,row.name);assert.equal(def.tactic,row.tactic);assert.ok(def.parts.length);}
});
check('every phase maps exterior weapon groups while reserving the intended solid core',()=>{
 let phases=0,supports=0;
 const core=type=>type===0?[0,1]:type===1?[]:type===2?[2]:type===3?[]:type===4?[]:type===5?[0,1,2]:type===6?[0]:type===7?[1]:type===8?[]:[0];
 for(const row of T.catalogue)for(let phase=1;phase<=(row.kind==='mini'?1:row.epicId!==undefined?4:2);phase++){
  const def=T.describe({...row,phase});assert.ok(def);assert.equal(new Set(def.parts.map(p=>p.id)).size,def.parts.length);for(const p of def.parts){assert.ok(p.indices.length);assert.equal(new Set(p.indices).size,p.indices.length);assert.ok(p.indices.every(Number.isInteger));supports+=p.indices.length;}
  let reserved=row.kind==='mini'?[1]:row.epicId===0?[0]:row.epicId===1?(phase===1?[]:[3]):core(row.type);
  if(row.epicId===undefined&&row.kind==='boss'){if(row.type===1)reserved=phase===1?[2]:[];if(row.type===3)reserved=phase===1?[2]:[3];if(row.type===4)reserved=phase===1?[]:[3];if(row.type===8)reserved=phase===1?[]:[3];}
  for(const index of reserved)assert.ok(!def.parts.some(p=>p.indices.includes(index)),row.id+' phase'+phase+' core '+index);phases++;
 }assert.equal(phases,38);return{phases,weaponSupports:supports};
});
check('all miniboss side assemblies remain independent of their center reactor',()=>{
 for(let type=0;type<10;type++){const def=T.describe({kind:'mini',type}),live=nodes(3);live[0].destroyed=true;live[1].destroyed=true;const state=T.status(def,live);assert.equal(state[0].destroyed,true);assert.equal(state[1].destroyed,false);assert.deepEqual(def.fanPorts,{upper:'upper',lower:'lower'});live[2].destroyed=true;assert.ok(T.status(def,live).every(p=>p.destroyed));}
});
check('phase-two Twin Maw requires both supports and missing supports never disable a jaw',()=>{
 const def=T.describe({kind:'boss',type:1,phase:2}),live=nodes(4);live[0].destroyed=true;assert.equal(T.status(def,live).find(p=>p.id==='upper-jaw').destroyed,false);live[2].destroyed=true;assert.equal(T.status(def,live).find(p=>p.id==='upper-jaw').destroyed,true);assert.equal(T.status(def,live).find(p=>p.id==='lower-jaw').destroyed,false);
 const missing=nodes(4);missing[0].destroyed=true;delete missing[2];assert.equal(T.status(def,missing)[0].destroyed,false);assert.equal(T.status(def,[{destroyed:true}])[0].destroyed,false);live[2].destroyed=1;assert.equal(T.status(def,live)[0].destroyed,false);
});
check('Hydra fan ports and beam resolve to their physical heads in both phases',()=>{
 for(const phase of[1,2]){const def=T.describe({kind:'boss',type:8,phase});assert.deepEqual(def.fanPorts,{upper:'hydra-head-0',middle:'hydra-head-1',lower:'hydra-head-2'});assert.equal(def.beamPart,'hydra-head-1');const live=nodes(phase===1?3:4);live[1].destroyed=true;assert.deepEqual(T.status(def,live).filter(p=>p.destroyed).map(p=>p.id),['hydra-head-1']);assert.ok(!def.parts.some(p=>p.indices.includes(3)));}
});
check('Gravebell rain weights use correct sides after the phase artwork changes',()=>{
 const first=T.describe({kind:'boss',type:7,phase:1}),second=T.describe({kind:'boss',type:7,phase:2});assert.deepEqual(first.rainParts,['grave-right-weight']);assert.deepEqual(second.rainParts,['grave-left-weight','grave-right-weight']);assert.deepEqual(first.parts.find(p=>p.id==='grave-right-weight').indices,[2]);assert.deepEqual(second.parts.find(p=>p.id==='grave-right-weight').indices,[3]);assert.deepEqual(second.parts.find(p=>p.id==='grave-left-weight').indices,[2]);assert.ok(!second.rainParts.includes('grave-horn'));
});
check('secret encounters map every phase without treating solid reactors as removable weapons',()=>{
 for(const epicId of[0,1])for(const[count,index]of[3,4,5,7].map((count,index)=>[count,index])){const def=T.describe({kind:'boss',type:10+epicId,epicId,phase:index+1,nodeCount:count}),used=def.parts.flatMap(p=>p.indices);assert.deepEqual(used,epicId===0?Array.from({length:count-1},(_,i)=>i+1):[0,1,2,...Array.from({length:Math.max(0,count-4)},(_,i)=>i+4)]);assert.ok(!used.includes(epicId===0?0:3));}
});
check('part decisions are immutable and ignore health, debris and sprite readiness',()=>{
 const def=T.describe({kind:'boss',type:1,phase:2}),live=nodes(4);live[0].hp=0;live[2].hp=0;live[0].detached=true;live[2].nativeDetached=true;const before=JSON.stringify(live),definition=JSON.stringify(def),state=T.status(def,live);assert.equal(state[0].destroyed,false);assert.equal(JSON.stringify(live),before);assert.equal(JSON.stringify(def),definition);assert.ok(Object.isFrozen(def));assert.ok(Object.isFrozen(def.parts));assert.ok(Object.isFrozen(def.parts[0].indices));assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(state[0]));assert.notEqual(state[0],def.parts[0]);assert.notEqual(state[0].indices,def.parts[0].indices);
});
check('malformed encounter selectors fail closed and valid inputs default to phase one',()=>{
 for(const input of[null,[],{}, {kind:'unknown',type:1},{kind:'mini',type:-1},{kind:'mini',type:10},{kind:'boss',type:'1'},{kind:'mini',type:1,phase:2},{kind:'boss',type:1,phase:3},{kind:'boss',type:10,epicId:1},{kind:'boss',type:11,phase:5},{kind:'boss',type:1,nodeCount:0},{kind:'boss',type:1,nodeCount:Infinity},{kind:'boss',type:1,nodeCount:1.5}])assert.equal(T.describe(input),null,JSON.stringify(input));assert.deepEqual(T.describe({kind:'boss',type:1}),T.describe({kind:'boss',type:1,phase:1}));assert.deepEqual(T.status(null,nodes(3)),[]);assert.deepEqual(T.status(T.describe({kind:'mini',type:0}),null),[]);assert.deepEqual(T.status({parts:[{}]},nodes(3)),[]);
});
check('browser export works with no DOM, storage, image, timer or ambient randomness API',()=>{
 const source=fs.readFileSync(path.join(root,'encounter-tactics.js'),'utf8'),math=Object.create(Math);math.random=()=>{throw new Error('No random decisions allowed')};const context={window:{},Math:math,Date:undefined,document:undefined,localStorage:undefined,Image:undefined,setTimeout:undefined};vm.createContext(context);vm.runInContext(source,context);const B=context.window.StarfighterEncounterTactics;assert.ok(B);for(const row of T.catalogue)assert.deepEqual(plain(B.describe(row)),plain(T.describe(row)));assert.deepEqual(plain(B.describe({kind:'boss',type:1,phase:2})),plain(T.describe({kind:'boss',type:1,phase:2})));assert.deepEqual(plain(B.status(B.describe({kind:'mini',type:0}),[{destroyed:true},{destroyed:false},{destroyed:false}])).map(p=>p.destroyed),[true,false]);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;
fs.writeFileSync(path.join(root,'artifacts/encounter-tactics-model-audit.json'),JSON.stringify({scope:'Pure authored support mappings and tactical identities; no live combat, assets or pilot data accessed',passed,failed,results},null,2)+'\n');
console.log(`${passed} encounter tactics model checks passed, ${failed} failed`);if(failed)process.exitCode=1;
