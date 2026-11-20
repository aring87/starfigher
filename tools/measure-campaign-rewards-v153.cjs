#!/usr/bin/env node
'use strict';
// Read-only pickup/reward diagnostic. Private VM profiles only. The collection
// models below are explicit assumptions, not human telemetry or survival bots.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),shippingSource=fs.readFileSync(path.join(root,'game.js'),'utf8');
const arg=(key,fallback)=>process.argv.find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const carrierEvery=Number(arg('carrier-every','0')),label=arg('label','v153');assert.ok(/^[a-z0-9_-]+$/i.test(label));
assert.ok(Number.isInteger(carrierEvery)&&(carrierEvery===0||carrierEvery>=2&&carrierEvery<=100));
let gameSource=shippingSource;
if(carrierEvery&&!process.argv.includes('--live')){
 assert.ok(Number.isInteger(carrierEvery)&&carrierEvery>=2&&carrierEvery<=100);
 const marker='if(roll<crystalChance){';assert.ok(gameSource.includes(marker));
 gameSource=gameSource.replace(marker,"if(e.type==='drone'&&e.formationIndex===0&&e.formationCount===4&&wave>=2&&player.missileLevel===0){pickups.push({x:e.x,y:e.y,r:10,type:'missile',spin:0})}else if(e.type==='drone'&&e.formationIndex===0&&e.formationCount===4&&wave>=3&&player.missileLevel>0&&player.bits===0){pickups.push({x:e.x,y:e.y,r:10,type:'bit',spin:0})}else "+marker);
}
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(gameSource)+';');
support=support.replace('  globalThis.__gameTest = {',`
  globalThis.__gameTest = {
    drop,enforceCombatProgression,
    rewardField(stage,post){wave=stage;t=post?48:0;beginStage(false,false);miniBossSpawned=post;stagePostEliteClock=post?0:-1;stageEncounterCursor=0;stageEvent=0;stageApexIntro=-1;stageHazardClock=post?3.5:5.4;spawn=post?.4:.8;victoryDelay=null;miniBoss=boss=null;stageHazards=[];enemies=[];enemyShots=[];shots=[];pickups=[];state='playing';bossLab=false;player.inv=999;},
    rewardAwards(stage){wave=stage;t=48;bossLab=false;victoryDelay=null;miniBoss=boss=null;state='playing';player.inv=999;makeMiniBoss();miniBoss.hp=0;update(0);let delayed=victoryDelay;victoryDelay=null;delayed?.run();chooseRunService('skip');makeBoss();handleBossDefeat(boss);delayed=victoryDelay;victoryDelay=null;delayed?.run();closeSkillTree();},
`);
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);const{createGame}=m.exports;
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function randomize(game,seed){game.sandbox.__rewardRandom=rng(seed);vm.runInContext('Math.random=globalThis.__rewardRandom',vm.createContext(game.sandbox))}
function fresh(seed){const g=createGame({ruleset:'streamlined-v1'});randomize(g,seed);g.api.start('story');assert.equal(g.api.player.maxHp,3);assert.equal(g.api.player.shield,0);assert.equal(g.api.bossLab,false);return g}
const round=value=>Math.round(value*1000)/1000,summary=values=>{const a=values.slice().sort((a,b)=>a-b),q=p=>a[Math.floor((a.length-1)*p)];return{mean:round(a.reduce((n,v)=>n+v,0)/a.length),p10:q(.1),median:q(.5),p90:q(.9)}};
const result={sourceSha256:crypto.createHash('sha256').update(shippingSource).digest('hex'),probeSha256:crypto.createHash('sha256').update(gameSource).digest('hex'),scope:{ruleset:'streamlined-v1',storage:'Private empty VM pilots; no real browser saves.',field:'Native 120 Hz update census. Newly spawned enemies are counted and removed; invulnerability exists only to isolate spawn budgets. These are potential enemies, not kills.',pickups:'Production drop/collect helpers. Wave is explicitly advanced before each mission. Each missed combat pickup suppresses later combat pickups for ten attempted kills.',rescue:carrierEvery?`${process.argv.includes('--live')?'Unmodified LIVE drop helper':'PRIVATE candidate only'}: first missile on command carrier from Mission 2, first Bit from Mission 3 once a missile is present. Assumed one carrier killed per ${carrierEvery} kills, not observed command-kill frequency. No existing kit is upgraded by rescue.`:'Unchanged shipping drop policy.',rewards:'Actual elite defeat and normal apex defeat award branches, bypassing fight outcomes. No victory-rate claims.',limits:'No claim about actual kill/claim rates, human difficulty, equipment quality preference or survival. No Secret Epic substitution.'},fieldBirths:{},models:{},nativeAwards:{}};
const reuseFields=arg('reuse-fields','');
if(reuseFields){const cached=JSON.parse(fs.readFileSync(path.resolve(root,reuseFields),'utf8'));result.fieldBirths=cached.fieldBirths;result.scope.field=`Fixed birth budgets reused from ${reuseFields}; native baseline census source ${cached.sourceSha256}. No fresh field simulation in this comparison.`}
const field=fresh(1103);
for(let stage=1;!reuseFields&&stage<=10;stage++){
 const samples=[];for(const seed of[1103,2026,7349]){randomize(field,stage*999+seed);let total=0;for(const post of[false,true]){field.api.rewardField(stage,post);for(let tick=0;tick<(post?36:48)*120;tick++){field.api.update(1/120);total+=field.api.enemies.length;field.api.enemies.length=0;field.api.enemyShots.length=0;field.api.stageHazards.length=0;field.api.particles.length=0;field.api.debris.length=0}}samples.push(total)}result.fieldBirths[stage]={samples,...summary(samples)};
}
const partial=path.join(root,'artifacts/campaign-rewards-'+label+'.json');
fs.writeFileSync(partial,JSON.stringify(result,null,2)+'\n');
const trials=Number(arg('samples','32'));assert.ok(Number.isInteger(trials)&&trials>=8&&trials<=512);
for(const spec of[{id:'low-collection-sensitivity',kill:.4,claim:.6},{id:'moderate-assumption',kill:.7,claim:.8},{id:'perfect-collection-bound',kill:1,claim:1}]){
 const byStage=Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,[]]));
 for(let seed=1;seed<=trials;seed++){
  const g=fresh(seed*731),a=g.api,claim=rng(seed*97),counts={crystal:0,missile:0,bit:0,shield:0,gear:0,surplus:0},first={};let blockedUntil=0,kill=0;
  for(let stage=1;stage<=10;stage++){
   a.setWave(stage);const caps=a.enforceCombatProgression(),potential=result.fieldBirths[stage].samples[(seed-1)%3],kills=Math.round(potential*spec.kill);
   for(let n=0;n<kills;n++){
    kill++;if(kill>=blockedUntil)a.pickups.length=0;a.drop(carrierEvery&&kill%carrierEvery===0?{x:700,y:250,type:'drone',formationIndex:0,formationCount:4}:{x:700,y:250});
    for(const p of a.pickups){if(p.auditHandled)continue;p.auditHandled=true;if(p.type==='gear'){counts.gear++;p.dead=true;continue}if(claim()<spec.claim){const before={force:a.player.laserLevel,missile:a.player.missileLevel,bit:a.player.bits};if(p.type==='crystal'&&before.force>=caps.force||p.type==='missile'&&before.missile>=caps.missile||p.type==='bit'&&before.bit>=caps.bits)counts.surplus++;a.collectCombatPickup(p);p.dead=true;counts[p.type]++;first[p.type]??=stage}else blockedUntil=kill+10}
    for(let i=a.pickups.length-1;i>=0;i--)if(a.pickups[i].dead)a.pickups.splice(i,1);
   }
   byStage[stage].push({...counts,forceOwned:a.player.pod.owned,force:a.player.laserLevel,missileLevel:a.player.missileLevel,bitCount:a.player.bits,first:{...first}});
  }
 }
 result.models[spec.id]={trials,killedFraction:spec.kill,claimedFraction:spec.claim,stages:Object.fromEntries(Object.entries(byStage).map(([stage,rows])=>[stage,{forceOwnedPct:round(rows.filter(r=>r.forceOwned).length/trials*100),force3Pct:round(rows.filter(r=>r.force===3).length/trials*100),missileOwnedPct:round(rows.filter(r=>r.missileLevel>0).length/trials*100),bitOwnedPct:round(rows.filter(r=>r.bitCount>0).length/trials*100),missile2Pct:round(rows.filter(r=>r.missileLevel===2).length/trials*100),bit2Pct:round(rows.filter(r=>r.bitCount===2).length/trials*100),forceLevel:summary(rows.map(r=>r.force)),missileLevel:summary(rows.map(r=>r.missileLevel)),bitCount:summary(rows.map(r=>r.bitCount)),shieldDrops:summary(rows.map(r=>r.shield)),offeredFieldGear:summary(rows.map(r=>r.gear)),surplusKit:summary(rows.map(r=>r.surplus))}]))};
}
fs.writeFileSync(partial,JSON.stringify(result,null,2)+'\n');
const awardStages=Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,[]]));
for(let seed=1;!process.argv.includes('--skip-awards')&&seed<=16;seed++){const g=fresh(seed*743),a=g.api;for(let stage=1;stage<=10;stage++){const old=new Set(a.garage.inventory.map(item=>item.id));a.rewardAwards(stage);const items=a.garage.inventory.filter(item=>!old.has(item.id));assert.equal(items.length,2,'Every native elite and apex victory awards one item');awardStages[stage].push({items:items.map(({slot,tier,power,source})=>({slot,tier,power,source})),coveredSlots:new Set(a.garage.inventory.map(item=>item.slot)).size,total:a.garage.inventory.length});}}
result.nativeAwards=Object.fromEntries(Object.entries(awardStages).filter(([,rows])=>rows.length).map(([stage,rows])=>[stage,{trials:rows.length,itemCount:summary(rows.map(r=>r.total)),fullSlotCoveragePct:round(rows.filter(r=>r.coveredSlots===4).length/rows.length*100),eliteRarePct:round(rows.filter(r=>r.items.find(item=>item.source.includes('ELITE')).tier===2).length/rows.length*100),apexSuperRarePct:round(rows.filter(r=>r.items.find(item=>item.source.includes('APEX')).tier===3).length/rows.length*100),power:summary(rows.flatMap(r=>r.items.map(item=>item.power)))}]));
const out=partial;fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({artifact:out,fieldBirths:result.fieldBirths,models:Object.fromEntries(Object.entries(result.models).map(([key,model])=>[key,{...model,stages:Object.fromEntries([1,2,3,5,10].map(stage=>[stage,model.stages[stage]]))}])),nativeAwards:result.nativeAwards},null,2));
