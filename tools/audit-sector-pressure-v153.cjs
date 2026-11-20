#!/usr/bin/env node
'use strict';
// Reuse the native update/collision challenge meter. No real pilot storage.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'verify-campaign-challenge.cjs');
let support=fs.readFileSync(file,'utf8');
support=support.slice(0,support.indexOf('const result={source:'));
support=support.replace('const game=createGame();game.sandbox.__probeRandom','const game=createGame({ruleset:\'streamlined-v1\'});game.sandbox.__probeRandom');
const ledger="const hullLost=beforeHp-player.hp;if(hullLost>0){const source=arguments[1]||{},label=source.kind==='projectile'?(source.pressureLance?'amber lance':source.wall?'wall':source.homing?'homing':'ordinary projectile'):(source.kind||'unspecified');campaignProbe.sources=campaignProbe.sources||{};campaignProbe.sources[label]=(campaignProbe.sources[label]||0)+hullLost;campaignProbe.hits=campaignProbe.hits||[];campaignProbe.hits.push({time:t,x:player.x,y:player.y,source:label,nearbyShots:enemyShots.filter(s=>!s.dead&&Math.abs(s.x-player.x)<200&&Math.abs(s.y-player.y)<160).map(s=>({x:s.x,y:s.y,vx:s.vx,vy:s.vy,r:s.r,warn:s.warn||0,wall:!!s.wall,lance:!!s.pressureLance,piercing:!!s.piercing}))})}";
support=support.replace("const harnessFile=path.join(__dirname,'verify-game.cjs');",`instrumented=instrumented.replace('const hullLost=beforeHp-player.hp;',${JSON.stringify(ledger)});\nconst harnessFile=path.join(__dirname,'verify-game.cjs');`);
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);
m._compile(support+'\nmodule.exports={runCase,sourceSha256:crypto.createHash("sha256").update(original).digest("hex")};',file);
const rows=[];
const late=process.argv.includes('--late'),seeds=late?[1103,2026,7349]:[1103];
for(let stage=late?9:1;stage<=10;stage++)for(const phase of[1,2])for(const movement of['stationary','dodge'])for(const seed of seeds){
 const row=m.exports.runCase({stage,kind:'boss',phase,loadout:'force1',movement,meter:true,seed,seconds:30});
 rows.push(row);console.log(JSON.stringify({stage,phase,movement,seed,hullLost:row.hullLost,sources:row.sources,podBlocks:row.podBlocks,contacts:row.playerProjectileContacts,incoming:row.incoming}));
}
const data={label:'v153-sector-pressure'+(late?'-late':''),sourceSha256:m.exports.sourceSha256,assumptions:['Private streamlined Story pilots with one front-docked Red Force, no gear/perks, no firing.','Nonlethal 1000 HP meter preserves ordinary invulnerability timing to observe 30 seconds.','Actual native updates, shots, collisions, sector scaling and 0.65-second locked amber warnings.',seeds.length+' deterministic seeds per scenario. Moving policy uses physical Up/Down and a simple trajectory heuristic.','Moving policy does not deliberately read laser beams or use horizontal movement.','No human win-rate, playability or entire-campaign conclusion.'],rows};
fs.writeFileSync(path.join(__dirname,'../artifacts/sector-pressure-v153'+(late?'-late':'')+'.json'),JSON.stringify(data,null,2)+'\n');
console.log('PASS '+rows.length+' '+(late?'late-boss':'all-sector boss')+' native pressure snapshots');
