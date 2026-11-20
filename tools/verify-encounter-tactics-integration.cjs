#!/usr/bin/env node
'use strict';
// Production attack/part-break paths in private VM storage. The v147 painter
// fixture supplies the pre-tactics reference; no real pilot storage is read.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
const currentSource=fs.readFileSync(path.join(root,'game.js'),'utf8');
let baselineSource;
const dedicated=path.join(root,'artifacts/tactics-v147-baseline-game.js');
if(fs.existsSync(dedicated))baselineSource=fs.readFileSync(dedicated,'utf8');
else{
 const preview=fs.readFileSync(path.join(root,'artifacts/readability-preview-game.js'),'utf8'),at=preview.indexOf('\n  // Freeze simulation, not painting');
 assert.ok(at>0,'The frozen v147 production fixture is required');baselineSource=preview.slice(0,at)+'\n})();\n';
}
assert.equal(baselineSource.includes('function encounterWeaponState('),false,'Reference must precede the tactics implementation');
const accessor=`globalThis.__gameTest = {
 bossAttack,epicBossAttack,updateBossFight,updateEpicBossFight,updateHostileShot,queuePressureLance,
 drawMiniBossFireFlash,beginEpicRitual,finishEpicRitual,
 ...(typeof encounterWeaponState==='function'?{encounterWeaponState}:{}),
 ...(typeof encounterAllowsShot==='function'?{encounterAllowsShot}:{}),
 ...(typeof withEncounterWeapons==='function'?{withEncounterWeapons,withEncounterPort}:{}),
 seedConstant(){Math.random=()=>.5},
`;
function harness(source){
 let support=fs.readFileSync(filename,'utf8');support=support.slice(0,support.indexOf('\ntest('));
 support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source = '+JSON.stringify(source)+';');
 support=support.replace('globalThis.__gameTest = {',accessor);
 if(!support.includes("'encounter-tactics.js'"))support=support.replace('for(const script of [',"for(const script of ['encounter-tactics.js',");
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};\n',filename);return mod.exports.createGame;
}
const createGame=harness(currentSource),createReference=harness(baselineSource),T=require('../encounter-tactics.js'),results=[];
const live=createGame({ruleset:'streamlined-v1'}),reference=createReference({ruleset:'streamlined-v1'});
const plain=value=>JSON.parse(JSON.stringify(value)),near=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const scenarios=[];for(const family of['mini','main','epic'])for(let type=0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='mini'?1:family==='epic'?4:2);phase++)scenarios.push({family,type,phase});
function check(name,fn){if(process.env.STARFIGHTER_TACTICS_TEST_FILTER&&!name.includes(process.env.STARFIGHTER_TACTICS_TEST_FILTER))return;try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function fixture(g,{family,type,phase=1}){
 const a=g.api;a.seedConstant();if(family==='mini')a.startMiniBossLab(type);else if(family==='epic')a.startEpicBossLab(type);else a.startBossLab(type);
 const e=family==='mini'?a.miniBoss:a.boss;Object.assign(e,{x:715,y:263,anchorY:263,targetY:263,clock:.83,phase,intro:0,phaseTransition:0,hidden:false,ritual:null,cool:0,attackCycle:0,attackAngle:0,queuedAttack:null,attackCue:0,weakOpen:true,weakTimer:2,visualAngle:0,lastShotClock:-10,animOffset:0,laser:null});
 Object.assign(a.player,{x:145,y:251,inv:1e6,evade:0,bits:0});a.player.pod.owned=false;a.enemyShots.length=0;a.shots.length=0;a.particles.length=0;a.setTime(.83);return e;
}
const projectionKeys='x y vx vy r damage warn warnMax piercing pressureLance homing wall gapY gapHalf targetX targetY speed'.split(' ');
function projectile(shot){return Object.fromEntries(projectionKeys.filter(key=>Object.hasOwn(shot,key)).map(key=>[key,shot[key]]))}
function volley(g,e,cycle){
 const a=g.api;e.attackCycle=cycle;e.attackAngle=cycle*.27;e.queuedAttack=null;e.laser=null;e.cool=0;e.hitFlash=0;e.recoil=0;e.lastShotClock=-10;a.enemyShots.length=0;a.seedConstant();
 if(e.kind==='mini')a.miniBossAttack(e);else if(e.epic)a.epicBossAttack(e);else{a.bossAttack(e);if(e.queuedAttack)a.bossAttack(e)}
 return{shots:a.enemyShots.map(projectile),cool:e.cool,cycle:e.attackCycle,angle:e.attackAngle,laser:e.laser?plain(e.laser):null};
}
function definition(a,e){return T.describe({kind:e.kind,type:e.type,epicId:e.epic?e.epicId:undefined,phase:e.phase||1,nodeCount:a.activeWeakNodes(e).length})}
function breakPart(a,e,part){for(const index of part.indices){const node=a.activeWeakNodes(e)[index];assert.ok(node,'Valid physical support '+part.id+'/'+index);a.damageWeakNode(e,node,node.hp)}}
function subset(actual,expected,label){const pool=expected.map(shot=>JSON.stringify(shot));for(const shot of actual){const key=JSON.stringify(shot),index=pool.indexOf(key);assert.ok(index>=0,label+' introduced or moved a projectile: '+key);pool.splice(index,1)}assert.ok(actual.length<=expected.length,label+' increased the volley');}

check('all intact encounter phases retain pre-tactics projectile geometry, warnings and cadence',()=>{
 let comparisons=0;for(const scene of scenarios){const old=fixture(reference,scene),e=fixture(live,scene);for(let cycle=0;cycle<6;cycle++){const before=volley(reference,old,cycle),after=volley(live,e,cycle);assert.deepEqual(plain(after),plain(before),JSON.stringify(scene)+' cycle '+cycle);comparisons++}}
 return{encounterPhases:scenarios.length,volleyComparisons:comparisons};
});

check('destroyed physical assemblies only remove existing lanes across the entire roster',()=>{
 let trials=0,effectiveGroups=0,effectivePhases=0;for(const scene of scenarios){let phaseEffective=false;const initial=fixture(live,scene),parts=definition(live.api,initial).parts;assert.ok(parts.length,'Physical tactics are defined for '+JSON.stringify(scene));
  for(const part of parts){const old=fixture(reference,scene),e=fixture(live,scene);breakPart(live.api,e,part);let changed=false;
   for(let cycle=0;cycle<6;cycle++){const before=volley(reference,old,cycle),after=volley(live,e,cycle),label=JSON.stringify(scene)+' '+part.id+' cycle '+cycle;subset(after.shots,before.shots,label);near(after.cool,before.cool,label+' cooldown');assert.equal(after.cycle,before.cycle,label+' attack cycle');near(after.angle,before.angle,label+' angle clock');if(after.shots.length<before.shots.length||!!before.laser&&!after.laser)changed=true;trials++}
   if(changed){effectiveGroups++;phaseEffective=true}
  }if(phaseEffective)effectivePhases++;
 }
 assert.equal(effectivePhases,scenarios.length,'Every phase should have at least one strategically useful assembly');return{partVolleyTrials:trials,effectiveGroups,effectivePhases};
});

check('paired miniboss cannons stop firing instead of duplicating salvos from the center',()=>{
 for(const[type,cycle]of[[0,1],[1,0],[5,0]]){const e=fixture(live,{family:'mini',type}),intact=volley(live,e,cycle),parts=definition(live.api,e).parts,upper=parts.find(p=>p.indices.includes(0)),lower=parts.find(p=>p.indices.includes(2));breakPart(live.api,e,upper);const one=volley(live,e,cycle);assert.equal(one.shots.length,intact.shots.length/2);subset(one.shots,intact.shots,'Mini '+type);assert.deepEqual(Array.from(e.muzzleFlares,f=>f.side),[1]);breakPart(live.api,e,lower);const none=volley(live,e,cycle);assert.equal(none.shots.length,0);assert.equal(e.muzzleFlares.length,0);near(none.cool,intact.cool)}
});

check('Twin Maw phase-two jaws require both physical supports before a fan is disabled',()=>{
 const a=live.api,e=fixture(live,{family:'main',type:1,phase:2}),intact=volley(live,e,0);a.damageWeakNode(e,a.activeWeakNodes(e)[0],a.activeWeakNodes(e)[0].hp);const partial=volley(live,e,0);assert.deepEqual(plain(partial.shots),plain(intact.shots));
 a.damageWeakNode(e,a.activeWeakNodes(e)[2],a.activeWeakNodes(e)[2].hp);const broken=volley(live,e,0);assert.equal(broken.shots.length,intact.shots.length/2);subset(broken.shots,intact.shots,'Shared upper jaw');assert.ok(broken.shots.every(s=>s.y>e.y));near(broken.cool,intact.cool);
});

check('Hydra upper, middle and lower heads each control their own phase-one fan',()=>{
 for(const index of[0,1,2]){const a=live.api,e=fixture(live,{family:'main',type:8}),intact=volley(live,e,0);a.damageWeakNode(e,a.activeWeakNodes(e)[index],a.activeWeakNodes(e)[index].hp);const broken=volley(live,e,0);assert.equal(intact.shots.length,9);assert.equal(broken.shots.length,6);subset(broken.shots,intact.shots,'Hydra head '+index);const disabledY=e.y+[-48,0,48][index];assert.ok(broken.shots.every(s=>s.y!==disabledY));near(broken.cool,intact.cool)}
});

check('breaking the Hydra beam head cancels a charging or active beam before it can hit again',()=>{
 const a=live.api;for(const remaining of[1.3,.71]){const e=fixture(live,{family:'main',type:8,phase:2});e.laser={y:a.player.y,t:remaining};a.player.inv=0;a.player.shield=0;a.player.hp=a.player.maxHp=3;e.cool=99;e.r=0;
  a.damageWeakNode(e,a.activeWeakNodes(e)[1],a.activeWeakNodes(e)[1].hp);a.updateBossFight(e,.001);assert.equal(e.laser,null);assert.equal(a.player.hp,3,'A destroyed emitter must not retain an invisible damage lane');
  const next=volley(live,e,0);assert.equal(next.laser,null);assert.ok(next.shots.length>0,'The surviving front battery must retain an attack');
 }
});

check('Gravebell weights create persistent rain gaps on the corresponding field side',()=>{
 for(const index of[2,3]){const a=live.api,e=fixture(live,{family:'main',type:7,phase:2}),intact=volley(live,e,0);a.damageWeakNode(e,a.activeWeakNodes(e)[index],a.activeWeakNodes(e)[index].hp);const broken=volley(live,e,0);assert.ok(broken.shots.length<intact.shots.length,'A weight must remove rain columns');subset(broken.shots,intact.shots,'Gravebell weight '+index);const removed=intact.shots.filter(s=>!broken.shots.some(t=>JSON.stringify(t)===JSON.stringify(s))),midpoint=(Math.min(...intact.shots.map(s=>s.x))+Math.max(...intact.shots.map(s=>s.x)))/2;assert.ok(removed.every(s=>index===2?s.x<midpoint:s.x>midpoint),'Weight must remove columns on its own half of the active rain field');near(broken.cool,intact.cool)}
});

check('broken assembly effects do not depend on loaded art or fragment capture',()=>{
 const ready=createGame({ruleset:'streamlined-v1'}),unloaded=createGame({ruleset:'streamlined-v1'});unloaded.sandbox.StarfighterDestruction={...unloaded.sandbox.StarfighterDestruction,ready:()=>false,surface:()=>null};
 for(const scene of[{family:'mini',type:1},{family:'main',type:1,phase:2},{family:'main',type:8,phase:2},{family:'epic',type:1,phase:4}]){const a=fixture(ready,scene),b=fixture(unloaded,scene),part=definition(ready.api,a).parts[0];breakPart(ready.api,a,part);breakPart(unloaded.api,b,part);for(let cycle=0;cycle<6;cycle++)assert.deepEqual(plain(volley(unloaded,b,cycle)),plain(volley(ready,a,cycle)),JSON.stringify(scene))}
});

check('phase transitions restore their new intact weapon assemblies rather than carrying old breaks',()=>{
 const a=live.api,e=fixture(live,{family:'main',type:1});for(const node of a.activeWeakNodes(e))a.damageWeakNode(e,node,node.hp);a.updateBossFight(e,0);assert.equal(e.phase,2);assert.ok(a.activeWeakNodes(e).every(n=>!n.destroyed));const fresh=fixture(reference,{family:'main',type:1,phase:2});assert.deepEqual(plain(volley(live,e,0)),plain(volley(reference,fresh,0)));
});

check('part breaks preserve launched projectiles and core-controlled pressure warning timing',()=>{
 const a=live.api,e=fixture(live,{family:'main',type:1,phase:2});volley(live,e,0);const launched=a.enemyShots[0],before=projectile(launched);assert.ok(launched);const upper=definition(a,e).parts.find(p=>p.indices.includes(0));breakPart(a,e,upper);assert.equal(a.enemyShots.includes(launched),true);assert.equal(launched.dead,undefined);a.updateHostileShot(launched,.1);near(launched.x,before.x+before.vx*.1);near(launched.y,before.y+before.vy*.1);
 a.enemyShots.length=0;e.threat=a.sectorThreat(5);assert.equal(a.queuePressureLance(e),true);const pressure=a.enemyShots[0];assert.equal(pressure.warn,.65);a.updateHostileShot(pressure,.25);near(pressure.warn,.4);assert.equal(pressure.dead,undefined);
});

check('arrival and phase protection still block boss attacks through actual update functions',()=>{
 const a=live.api;for(const mode of['arrival','transition']){const e=fixture(live,{family:'main',type:1,phase:2});e.intro=mode==='arrival'?1:0;e.phaseTransition=mode==='transition'?1:0;e.cool=0;a.enemyShots.length=0;a.updateBossFight(e,.01);assert.equal(a.enemyShots.length,0,mode+' must not expose an unannounced attack')}
 const e=fixture(live,{family:'epic',type:1,phase:3});e.intro=1;e.cool=0;a.enemyShots.length=0;a.updateEpicBossFight(e,.01);assert.equal(a.enemyShots.length,0);
});

check('weapon-disable feedback appears after the complete assembly breaks and expires without a stale phase label',()=>{
 const a=live.api,e=fixture(live,{family:'main',type:1,phase:2}),ctx=a.drawingContext,nodes=a.activeWeakNodes(e),messages=[],original=ctx.fillText;
 try{ctx.fillText=text=>messages.push(String(text));a.damageWeakNode(e,nodes[0],nodes[0].hp);assert.equal(e.tacticalNotice,undefined,'One support is not a severed jaw');a.damageWeakNode(e,nodes[2],nodes[2].hp);assert.ok(e.tacticalNotice);assert.match(e.tacticalNotice.text,/UPPER JAW.*DISABLED/);a.drawBossStatus();assert.ok(messages.some(text=>/UPPER JAW.*DISABLED/.test(text)));messages.length=0;e.clock=e.tacticalNotice.until+.01;a.drawBossStatus();assert.equal(messages.some(text=>/UPPER JAW.*DISABLED/.test(text)),false);e.clock=.83;e.phase=1;messages.length=0;a.drawBossStatus();assert.equal(messages.some(text=>/UPPER JAW.*DISABLED/.test(text)),false)}finally{ctx.fillText=original}
});

check('nested and failed weapon emissions cannot leak suppression into unrelated attacks',()=>{
 const a=live.api,outer=fixture(live,{family:'mini',type:1}),part=definition(a,outer).parts.find(p=>p.indices.includes(0));breakPart(a,outer,part);
 const inner=fixture(live,{family:'mini',type:0});a.withEncounterWeapons(outer,()=>a.withEncounterPort(part.id,()=>{assert.equal(a.encounterAllowsShot('fan',0,3),false);assert.throws(()=>a.withEncounterWeapons(inner,()=>{assert.equal(a.encounterAllowsShot('fan',0,3),true);throw new Error('PRIVATE TEST FAILURE')}),/PRIVATE TEST FAILURE/);assert.equal(a.encounterAllowsShot('fan',0,3),false)}));assert.equal(a.encounterAllowsShot('fan',0,3),true,'Outside an encounter all original emission remains allowed');
});

const passed=results.filter(r=>r.passed).length,failed=results.length-passed;
fs.writeFileSync(path.join(root,'artifacts/encounter-tactics-integration-audit.json'),JSON.stringify({scope:'Production attack and real part-damage functions in private VM storage; exact comparison against frozen v147 intact volleys. No real pilots accessed.',passed,failed,results},null,2)+'\n');
console.log(`${passed} encounter tactics integration checks passed, ${failed} failed`);if(failed)process.exitCode=1;
