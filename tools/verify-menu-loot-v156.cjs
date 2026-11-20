#!/usr/bin/env node
'use strict';
// Real pickup, Pause->Menu, banking and persistence paths in disposable pilots.
// Checkpoint fields deliberately stay at their existing stage boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),baseline=process.argv.includes('--baseline');
const sourceFile=baseline?'artifacts/session-v156-baseline-game.js':'game.js';
let support=fs.readFileSync(file,'utf8').split('\ntest(')[0];
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",`const source = fs.readFileSync(path.join(root, ${JSON.stringify(sourceFile)}), 'utf8');`);
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {switchProfile,');
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);
const{createGame}=mod.exports,plain=v=>JSON.parse(JSON.stringify(v)),results=[];
const boot=(initialStorage=[])=>{const g=createGame({ruleset:'streamlined-v1',initialStorage});g.api.start('story');return g};
function piece(a,id,tier=1,extra={}){return a.normalizeGearItem({id,slot:'weapon',tier,power:100+tier*5,name:id,gunVariant:'siege',alignment:'AEGIS',source:'FIELD ASTERPRINT',stats:{damagePct:3},...extra})}
function pickup(g,item){const a=g.api;a.pickups.push({type:'gear',gear:item,x:a.player.x+.1,y:a.player.y,r:13,spin:0});a.update(1/120);assert.equal(a.runLoot.filter(x=>x.id===item.id).length,1,'Native collision must collect one gear packet')}
function leave(g){g.api.pause();assert.equal(g.api.state,'paused');g.find('#pause-menu-btn').onclick();assert.equal(g.api.state,'menu')}
function reload(g){return createGame({ruleset:'streamlined-v1',initialStorage:[...g.storage]})}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}

check('field gear collected through its native collision is retained after Pause to Menu and browser reload',()=>{
 const g=boot(),a=g.api,item=piece(a,'menu-pickup');pickup(g,item);const checkpoint=JSON.stringify(a.profile.checkpoint),life=plain(a.profile.lifetime);leave(g);
 assert.equal(a.runLoot.length,0);assert.equal(a.garage.inventory.filter(x=>x.id===item.id).length,1);assert.equal(JSON.stringify(a.profile.checkpoint),checkpoint);assert.deepEqual(plain(a.profile.lifetime),life);
 const b=reload(g).api;assert.equal(b.garage.inventory.filter(x=>x.id===item.id).length,1);assert.equal(JSON.stringify(b.profile.checkpoint),checkpoint);return{hull:a.player.hp,checkpointAdvanced:false};
});
check('twenty pickup and checkpoint-resume cycles retain each item once without finalizing extra runs',()=>{
 let g=boot();const ids=[];
 for(let pass=0;pass<20;pass++){const id='cycle-'+pass;ids.push(id);pickup(g,piece(g.api,id));leave(g);g.api.goMenu();g=reload(g);assert.equal(g.api.garage.inventory.length,ids.length);for(const expected of ids)assert.equal(g.api.garage.inventory.filter(x=>x.id===expected).length,1);assert.equal(g.api.profile.lifetime.runs,0);g.api.loadGame();assert.equal(g.api.state,'playing')}
 return{cycles:20,items:ids.length};
});
check('full-Garage quit preserves locked/equipped gear and converts overflow to Alloy once',()=>{
 const g=boot(),a=g.api;for(let i=0;i<32;i++)a.garage.inventory.push(piece(a,'held-'+i,0,{locked:i===1}));a.garage.equipped.weapon='held-0';a.saveProfile();
 const item=piece(a,'new-rare',2);pickup(g,item);leave(g);assert.equal(a.garage.inventory.length,32);assert.ok(a.garage.inventory.some(x=>x.id==='held-0'));assert.ok(a.garage.inventory.some(x=>x.id==='held-1'));assert.ok(a.garage.inventory.some(x=>x.id===item.id));assert.equal(a.garage.materials,1);
 for(let repeat=0;repeat<5;repeat++)a.goMenu();assert.equal(a.garage.materials,1);const b=reload(g).api;assert.equal(b.garage.inventory.length,32);assert.equal(b.garage.materials,1);return{capacity:32,overflowAlloy:1};
});
check('overcapacity protection retains all locked items and still blocks a new launch',()=>{
 const g=boot(),a=g.api;for(let i=0;i<32;i++)a.garage.inventory.push(piece(a,'locked-'+i,0,{locked:true}));a.saveProfile();pickup(g,piece(a,'locked-exotic',4,{locked:true}));leave(g);assert.equal(a.garage.inventory.length,33);assert.equal(a.garage.materials,0);a.start('story');assert.equal(a.state,'garage');assert.equal(a.garage.inventory.length,33);return{protectedItems:33};
});
check('DEV pickup data never enters a real Garage when returning to Menu',()=>{
 const g=boot(),a=g.api;a.saveProfile();const before=plain(a.garage),stored=g.storage.get('starfighterProfileSlot1');a.startBossLab(0);a.collectGear(piece(a,'dev-only',4));a.goMenu();assert.deepEqual(plain(a.garage),before);assert.equal(g.storage.get('starfighterProfileSlot1'),stored);assert.equal(a.runLoot.length,0);
});
check('explicit campaign restart secures field gear before resetting the attempt and changes no lifetime totals',()=>{
 const g=boot(),a=g.api;pickup(g,piece(a,'restart-pickup'));const life=plain(a.profile.lifetime);a.pause();g.find('#restart-btn').onclick();assert.equal(a.state,'playing');assert.equal(a.garage.inventory.filter(x=>x.id==='restart-pickup').length,1);assert.equal(a.runLoot.length,0);assert.equal(a.runStats.gearCollected,0);assert.equal(a.wave,1);assert.equal(a.time,0);assert.deepEqual(plain(a.profile.lifetime),life);const b=reload(g).api;assert.equal(b.garage.inventory.filter(x=>x.id==='restart-pickup').length,1);return{restart:'native pause action',extraFinalizations:0};
});
check('pagehide secures field gear without advancing the checkpoint or resuming paused simulation',()=>{
 const g=boot(),a=g.api;pickup(g,piece(a,'pagehide-pickup'));const checkpoint=JSON.stringify(a.profile.checkpoint),life=plain(a.profile.lifetime),clock=a.time;g.sandbox.dispatchEvent({type:'pagehide'});assert.equal(a.state,'paused');assert.equal(a.time,clock);assert.equal(a.runLoot.length,0);assert.equal(a.garage.inventory.filter(x=>x.id==='pagehide-pickup').length,1);assert.equal(JSON.stringify(a.profile.checkpoint),checkpoint);assert.deepEqual(plain(a.profile.lifetime),life);const b=reload(g).api;assert.equal(b.garage.inventory.filter(x=>x.id==='pagehide-pickup').length,1);assert.equal(JSON.stringify(b.profile.checkpoint),checkpoint);
});
check('repeated pagehide and pageshow notifications bank and salvage a full Garage only once',()=>{
 const g=boot(),a=g.api;for(let i=0;i<32;i++)a.garage.inventory.push(piece(a,'page-held-'+i,0));a.saveProfile();pickup(g,piece(a,'page-new-rare',2));const checkpoint=JSON.stringify(a.profile.checkpoint);for(let repeat=0;repeat<10;repeat++){g.sandbox.dispatchEvent({type:'pagehide'});g.sandbox.dispatchEvent({type:'pageshow'});assert.equal(a.state,'paused');assert.equal(a.garage.inventory.length,32);assert.equal(a.garage.materials,1);assert.equal(a.runLoot.length,0);assert.equal(JSON.stringify(a.profile.checkpoint),checkpoint);assert.equal(a.profile.lifetime.runs,0)}return{cycles:10,overflowAlloy:1};
});
check('pagehide and restart keep DEV rewards disposable',()=>{
 const g=boot(),a=g.api;a.saveProfile();const before=plain(a.garage),stored=g.storage.get('starfighterProfileSlot1');a.startBossLab(0);a.collectGear(piece(a,'dev-hidden',4));g.sandbox.dispatchEvent({type:'pagehide'});assert.deepEqual(plain(a.garage),before);g.sandbox.dispatchEvent({type:'pageshow'});g.find('#restart-btn').onclick();assert.deepEqual(plain(a.garage),before);assert.equal(g.storage.get('starfighterProfileSlot1'),stored);assert.equal(a.runLoot.length,0);
});
check('secured menu loot stays with its original pilot when another profile is selected',()=>{
 const g=boot(),a=g.api;pickup(g,piece(a,'pilot-one-only'));leave(g);a.switchProfile(1);a.saveProfile();assert.equal(a.garage.inventory.length,0);a.goMenu();a.switchProfile(0);assert.equal(a.garage.inventory.filter(x=>x.id==='pilot-one-only').length,1);assert.equal(a.runLoot.length,0);
});
const failed=results.filter(x=>!x.passed).length,label=baseline?'baseline':'live';
fs.writeFileSync(path.join(root,`artifacts/menu-loot-v156-${label}.json`),JSON.stringify({sourceFile,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,sourceFile))).digest('hex'),scope:'Native collect/pause/menu/bank/reload actions with deliberately staged item rolls and capacity. No real pilot writes, campaign difficulty or rendering claim.',passed:results.length-failed,failed,results},null,2)+'\n');
console.log(`${results.length-failed} menu loot check groups passed, ${failed} failed`);process.exitCode=failed?1:0;
