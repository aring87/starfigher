#!/usr/bin/env node
'use strict';
// Read-only native fight ordering probe. Disposable VM pilots; no save access.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {updateBossFight,updateEpicBossFight,
 prepareFinalHit(kind,type){wave=type+1;beginStage(false);if(kind==='epic')makeEpicBoss(type,type);else makeBoss();const e=boss;e.phase=kind==='epic'?4:2;e.hp=e.max*(kind==='epic'?.25:.5);Object.assign(e,{x:715,y:270,intro:0,phaseTransition:0,hidden:false,ritual:null,weakOpen:false,weakTimer:100,cool:100,clock:0});Object.assign(player,{x:715,y:270,hp:1,maxHp:3,shield:0,inv:0,evade:0,ablativeReady:false,secondChanceReady:false});player.pod.owned=false;enemyShots=[];shots=[{x:715,y:270,px:715,py:270,vx:0,vy:0,r:3,d:1e6,dead:false}];return e;},`);
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);
const rows=[];
for(const kind of['main','epic'])for(let type=0;type<(kind==='main'?10:2);type++){
 const g=mod.exports.createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const e=a.prepareFinalHit(kind,type);if(kind==='epic'){e.toxinProtected=true;a.updateEpicBossFight(e,0)}else a.updateBossFight(e,0);
 rows.push({kind,type,name:e.def.name,bossHp:e.hp,playerHp:a.player.hp,state:a.state,bossStillPresent:a.boss===e,normalBosses:a.runStats.normalBosses,epicBosses:a.runStats.epicBosses,loot:a.garage.inventory.length});
 assert.equal(e.hp,0,'The real shot must deplete the final phase');
}
const blocked=rows.filter(r=>r.state==='gameover'&&r.bossStillPresent&&r.normalBosses+r.epicBosses===0);
const result={scope:'Actual armor damage, phase/node health, player contact and victory handlers. Player and boss deliberately overlap; a valid final shot is applied by armoredHits before contact. No real pilot storage, no result extrapolation.',rows,victorySuppressedByDeadBody:blocked.length};
fs.writeFileSync(path.join(root,'artifacts/final-hit-order-v154.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
