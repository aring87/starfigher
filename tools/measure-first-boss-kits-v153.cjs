#!/usr/bin/env node
'use strict';
// Bounded, private outgoing meters for a valid first Force with/without supports.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'measure-boss-aim-v153.cjs'),results=[];
function load(candidate){
 let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('const started=Date.now(),rows=[];'));
 support=support.replace("const candidate=process.argv.find(a=>a.startsWith('--candidate='))?.slice(12)||'baseline';",'const candidate='+JSON.stringify(candidate)+';');
 support=support.replace('function run(policy,stage=1,seed=1103){','function run(policy,stage=1,seed=1103,kitOptions={}){');
 support=support.replace(" const lead=policy.includes('lead')",` p.missileLevel=kitOptions.support?1:0;p.bits=kitOptions.support?1:0;
 api.collectCombatPickup({type:'crystal',color:kitOptions.color});p.dose=0;
 const actualKit={forceColor:p.laserColor,forceLevel:p.laserLevel,missileLevel:p.missileLevel,bits:p.bits};
 assert.equal(p.laserLevel,1);assert.equal(p.hp,3);assert.equal(p.maxHp,3);assert.equal(p.shield,0);assert.equal(p.damage,1);assert.equal(p.weakDamage,1);assert.equal(api.bossLab,false);
 const lead=policy.includes('lead')`);
 support=support.replace('tick<90*HZ','tick<120*HZ');
 support=support.replace('return{stage,policy,seed,kit:caps,maxHp:','return{stage,policy,seed,kit:actualKit,missionCeilings:caps,maxHp:');
 support=support.replace('stats,history};','stats,history,emittedDamage:JSON.parse(JSON.stringify(ledger.emittedDamage))};');
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={run,sourceSelection,sourceHashes};',file);return m.exports;
}
const started=Date.now();
for(const candidate of['baseline','live']){
 const diagnostic=load(candidate),rows=[];
 for(const color of['red','blue','yellow'])for(const support of[false,true]){
  const row=diagnostic.run('locked-lead-forward-charge',1,1103,{color,support});
  assert.equal(row.kit.forceColor,color);assert.equal(row.kit.missileLevel,support?1:0);assert.equal(row.kit.bits,support?1:0);
  if(!support){assert.equal(row.emittedDamage.missiles,0);assert.equal(row.emittedDamage.bits,0)}
  rows.push(row);console.log(JSON.stringify({candidate,kit:row.kit,phase:row.firstPhase,kill:row.kill,remainingHp:row.remainingHp,damage:row.damage,hitPct:row.hitPct}));
 }
 results.push({candidate,sourceSelection:diagnostic.sourceSelection,sourceHashes:diagnostic.sourceHashes,rows});
}
const output={generatedAt:new Date().toISOString(),wallSeconds:Math.round((Date.now()-started)/10)/100,assumptions:'12 seeded private VM outgoing meters, 120-second cap. Native Story physics, collision, damage, exposure and physical-key movement toward x360; locked core with motion leading and full charge. Empty Garage, zero perks, ordinary three hull/zero shields and native damage stats; only outgoing-meter invulnerability is extra. Kit fixture explicitly sets support counts to valid zero/one values and selects color through native crystal collection; recorded kit fields are actual values rather than progression ceilings. No Delta activations, automatic Force deployment or field attrition. This tests combat access and color/kit sensitivity, not human survival, enjoyment or actual collection rates.',results};
fs.writeFileSync(path.join(root,'artifacts/first-boss-kits-v153.json'),JSON.stringify(output,null,2)+'\n');
console.log('PASS 12 actual-kit first-boss outgoing meters; '+output.wallSeconds+'s wall.');
