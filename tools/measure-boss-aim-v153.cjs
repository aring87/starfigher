#!/usr/bin/env node
'use strict';
// Read-only, native Story aim comparison. No browser profile access or production edits.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'measure-build-matchups.cjs');
const candidate=process.argv.find(a=>a.startsWith('--candidate='))?.slice(12)||'baseline';
assert.ok(['baseline','steady-exposure','hp300','live'].includes(candidate));
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('const started=Date.now();'));
const frozen=path.join(root,'artifacts/balance-v153-baseline-game.js');
if(candidate!=='live'&&fs.existsSync(frozen))support=support.replace("const original=fs.readFileSync(path.join(root,'game.js'),'utf8');",'const original='+JSON.stringify(fs.readFileSync(frozen,'utf8'))+';');
if(candidate==='steady-exposure')support=support.replace('let source=original;',"let source=original.replace(\"case 0:targetY+=Math.sin(phase('motionPhaseY',p===1?.72:1.18))\",\"case 0:targetY+=Math.sin(phase('motionPhaseY',(p===1?.72:1.18)*(b.weakOpen?.5:1)))\");assert.notEqual(source,original);");
if(candidate==='hp300')support=support.replace('let source=original;',"let source=original.replace(\"{name:'THE BLOODSTAR',hp:360\",\"{name:'THE BLOODSTAR',hp:300\");assert.notEqual(source,original);");
support=support.replace('function hook(before,after){','const gameplaySource=source;\nfunction hook(before,after){');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={fresh,builds,HZ,dt,original,gameplaySource,source};',file);
const {fresh,builds,HZ,dt,original,gameplaySource,source:compiledSource}=m.exports;
const sha256=source=>crypto.createHash('sha256').update(source).digest('hex');
const sourceSelection=candidate==='live'?'game.js':fs.existsSync(frozen)?'artifacts/balance-v153-baseline-game.js':'game.js';
const sourceHashes={originalSourceSha256:sha256(original),gameplaySourceSha256:sha256(gameplaySource),compiledInstrumentedSourceSha256:sha256(compiledSource)};
const round=n=>Math.round(n*1000)/1000;
function run(policy,stage=1,seed=1103){
 const {api,caps,stats}=fresh(builds[0],stage,'boss',true,seed),target=api.boss,p=api.player;
 const lead=policy.includes('lead'),forward=policy.includes('forward'),lock=policy.includes('locked'),tap=policy==='center-tap',deploy=policy.includes('deploy');
 let index=null,phase=target.phase,lastTime=-1,lastY=null,lastPhase=target.phase,firstPhase=null,kill=null;
 const history=[];let elapsed=0,previousPoints=null;
 if(!tap)api.keys.add('Space');if(deploy)api.matchupDeploy();
 for(let tick=0;tick<90*HZ&&api.state==='playing';tick++){
  if(!tap&&elapsed-lastTime>=.1){
   const nodes=api.activeWeakNodes(target),points=nodes.map(n=>api.worldWeakNode(target,n));
   if(phase!==target.phase){index=null;previousPoints=null;phase=target.phase}
   if(!lock||index===null||nodes[index]?.destroyed){index=nodes.map((n,i)=>({n,i,w:points[i]})).filter(v=>!v.n.destroyed).sort((a,b)=>Math.abs(a.w.y-p.y)-Math.abs(b.w.y-p.y))[0]?.i??null}
   const point=points[index];
   let aimY=point?.y??target.y;
   if(lead&&point){
    const flight=Math.max(0,(point.x-p.x-35)/490),future=api.worldWeakNode({...target,clock:target.clock+flight},nodes[index]);
    const bossYVelocity=lastY===null?0:(target.y-lastY)/Math.max(.001,elapsed-lastTime);
    aimY=future.y+Math.max(-160,Math.min(160,bossYVelocity*flight*.7));
   }
   const dy=aimY-p.y;api.keys.delete('ArrowUp');api.keys.delete('ArrowDown');if(dy<-3)api.keys.add('ArrowUp');if(dy>3)api.keys.add('ArrowDown');
   api.keys.delete('ArrowRight');api.keys.delete('ArrowLeft');if(forward&&p.x<360)api.keys.add('ArrowRight');
   previousPoints=points;lastY=target.y;lastTime=elapsed;
  }
  if(tap?p.fire<=0:p.charge>=1-1e-9)api.releaseCharge();
  api.update(dt);elapsed+=dt;
  if(target.phase>lastPhase){firstPhase??=elapsed;lastPhase=target.phase}
  if(tick%(HZ*10)===0)history.push({seconds:round(elapsed),phase:target.phase,hp:round(target.hp),cores:api.activeWeakNodes(target).map(n=>round(n.hp)),x:round(p.x),y:round(p.y)});
  if(target.hp<=0){kill=elapsed;break}
 }
 const ledger=api.matchupLedger;assert.ok(Math.abs(target.max-Math.max(0,target.hp)-ledger.connectedDamage)<.1);
 return{stage,policy,seed,kit:caps,maxHp:target.max,remainingHp:round(Math.max(0,target.hp)),elapsed:round(elapsed),firstPhase:firstPhase===null?null:round(firstPhase),kill:kill===null?null:round(kill),damage:round(ledger.connectedDamage),coreHits:ledger.coreHits,armorHits:ledger.armorHits,emitted:ledger.emittedShots,hitPct:round((ledger.coreHits+ledger.armorHits)/Math.max(1,ledger.emittedShots)*100),stats,history};
}
const started=Date.now(),rows=[];
for(const policy of['nearest-charge','locked-charge','locked-lead-charge','locked-lead-forward-charge','locked-lead-forward-deploy-charge','center-tap']){const row=run(policy);rows.push(row);console.log(JSON.stringify({stage:row.stage,policy:row.policy,damage:row.damage,phase:row.firstPhase,kill:row.kill,coreHits:row.coreHits,armorHits:row.armorHits,hitPct:row.hitPct}))}
for(const stage of[2,5,10]){const row=run('locked-lead-forward-charge',stage);rows.push(row);console.log(JSON.stringify({stage:row.stage,policy:row.policy,damage:row.damage,phase:row.firstPhase,kill:row.kill,coreHits:row.coreHits,armorHits:row.armorHits,hitPct:row.hitPct}))}
const result={candidate,sourceSelection,sourceHashes,generatedAt:new Date().toISOString(),assumptions:'Seeded private VM. Real Story update/collision/emission/weak windows and mission-capped red kit. Empty Garage, no perks or Delta. Meter invulnerability only; cannot measure survival or human play quality. Lead predicts authored clock animation and extrapolates current boss-center vertical velocity, target lock persists until its core breaks. Forward policy uses physical keys to approach x360. No teleports/projectile edits/damage buffs. Deploy uses native togglePod without automatic gear. Candidate changes run only in private gameplay source: steady-exposure halves accumulated Bloodstar pendulum phase rate during exposure only, hp300 adjusts only Bloodstar base HP. Live mode loads current game.js without candidate mutations. The compiled instrumented source adds read-only counters; original and gameplay hashes distinguish production/baseline from private mutations.',wallSeconds:round((Date.now()-started)/1000),rows};
fs.writeFileSync(path.join(root,'artifacts/boss-aim-v153-'+candidate+'.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceSelection,sourceHashes}));console.log('PASS '+rows.length+' native aim snapshots; '+result.wallSeconds+'s wall.');
