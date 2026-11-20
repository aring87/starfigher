#!/usr/bin/env node
'use strict';
// Live ritual budget after the piercing correction. No production edits/saves.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'audit-epic-ritual-v154.cjs');if(!process.argv.includes('--live'))process.argv.push('--live');
let source=fs.readFileSync(file,'utf8');source=source.slice(0,source.indexOf('const versions='));
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(source+'\nmodule.exports={build,original};',file);const createGame=m.exports.build(false),rows=[];
for(const color of['red','blue'])for(const corner of[0,1,2,3]){
 const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const target=a.ritualFixture(10,0,3,corner,color),hp=target.hp,window=a.boss.ritual.max;
 assert.equal(a.player.maxHp,3);assert.equal(a.player.shield,0);assert.equal(a.garage.inventory.length,0);assert.equal(a.player.damage,1);assert.equal(a.player.laserLevel,3);assert.equal(a.player.missileLevel,2);assert.equal(a.player.bits,2);
 a.keys.add('Space');let elapsed=0,result=null,firstDamage=null;
 for(let tick=0;tick<Math.ceil((window+1)*120)&&a.boss?.ritual;tick++){
  const dx=target.x-50-a.player.x,dy=target.y-a.player.y;
  for(const key of['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])a.keys.delete(key);
  if(dx>3)a.keys.add('ArrowRight');else if(dx<-3)a.keys.add('ArrowLeft');if(dy>3)a.keys.add('ArrowDown');else if(dy<-3)a.keys.add('ArrowUp');
  if(a.player.charge>=1-1e-9)a.releaseCharge();a.update(1/120);elapsed+=1/120;
  if(firstDamage===null&&target.hp<hp)firstDamage=elapsed;
  if(a.boss.ritual?.result!==null){result=a.boss.ritual.result;break;}
 }
 rows.push({color,corner,phase:3,mission:10,window,guardianHp:hp,remainingHp:Math.max(0,target.hp),cleared:result===true,seconds:elapsed,firstDamage,kit:{force:a.player.laserLevel,color:a.player.laserColor,missiles:a.player.missileLevel,bits:a.player.bits},gear:0,perks:0,startingMaxHull:3});
 console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(path.join(root,'artifacts/epic-late-colors-v154-live.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(m.exports.original).digest('hex'),scope:'Actual live game after guardian pierce correction, mission10/phase3, no gear/perks/Delta, normal capped Red or Blue kit,3max hull and0shields. Invulnerability keeps outgoing budget observation alive. Digital physical movement puts docked Force in guardian contact while firing full charge. Four staged corners are positional budget tests, not human survival predictions.',rows},null,2)+'\n');
assert.ok(rows.every(row=>row.cleared),'A required late ritual must remain achievable with the staged base capped kit/contact policy');
console.log('PASS '+rows.length+' late Red/Blue phase3 ritual budget snapshots.');
