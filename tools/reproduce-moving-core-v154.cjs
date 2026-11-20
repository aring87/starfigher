#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest(')).replace('updateMiniBossMovement,','updateMiniBossMovement,sweptHit,bossDamageAllowed,armoredHits,');
support=support.replace('const context = vm.createContext(sandbox);','const context = vm.createContext(sandbox);vm.runInContext("Math.random=()=>.25",context);');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);
function relativeHit(a,s,p,q){return a.sweptHit({...s,px:s.px-p.x,py:s.py-p.y,x:s.x-q.x,y:s.y-q.y},{x:0,y:0,r:q.r})}
const dt=1/120,rows=[];
for(const type of[3,7]){
 const {api:a}=m.exports.createGame({ruleset:'streamlined-v1'});a.startBossLab(type);const e=a.boss;e.phase=2;e.hp=e.max*.5;a.player.inv=1e6;a.player.pod.owned=false;
 let found=false;
 for(let tick=0;tick<3600&&!found;tick++){
  const nodes=a.activeWeakNodes(e),old=nodes.map(n=>a.worldWeakNode(e,n)),open=a.bossDamageAllowed(e)&&e.weakOpen;a.update(dt);
  if(!open||!a.bossDamageAllowed(e)||!e.weakOpen||nodes!==a.activeWeakNodes(e))continue;
  for(let i=0;i<nodes.length&&!found;i++){
   const current=a.worldWeakNode(e,nodes[i]),previous=old[i],midX=(previous.x+current.x)/2,midY=(previous.y+current.y)/2,s={px:midX-620*dt/2,x:midX+620*dt/2,py:midY,y:midY,r:3,d:1,vx:620,vy:0,dead:false};
   if(!relativeHit(a,s,previous,current)||a.sweptHit(s,current)||a.sweptHit({x:s.px,y:s.py,r:s.r},previous))continue;
   if(nodes.some(n=>a.sweptHit(s,a.worldWeakNode(e,n))))continue;
   const hp=e.hp,targetHp=nodes[i].hp;a.shots.length=0;a.shots.push(s);a.armoredHits(e,'#ffffff',dt);
   rows.push({type,name:e.def.name,phase:e.phase,clock:e.clock,node:i,previous,current,shot:s,relativeHit:true,staticCoreHit:false,bodyHit:a.sweptHit(s,e),nativeDamage:hp-e.hp,targetDamage:targetHp-nodes[i].hp,shotConsumed:s.dead,assumptions:'Shot begins outside the previous core, crosses its linear relative path during one native 120 Hz step, and misses every current core. Ordinary r3 speed620 damage1 packet; no target/HP/multiplier mutation.'});found=true;
  }
 }
 assert.ok(found,'Expected moving-core reproduction for type '+type);
}
const result={sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),rows,limits:'The comparison treats observed core movement linearly between the two native poses. Discrete native-pose jumps may be better addressed with temporal collision coverage or smoother registered animation, not larger hit radii. No production change.'};
fs.writeFileSync(path.join(root,'artifacts/moving-core-reproduction-v154.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
