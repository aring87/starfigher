#!/usr/bin/env node
'use strict';
// Native ritual collisions and homing, in disposable Story pilots only.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),live=process.argv.includes('--live');
const sourceFile=path.join(root,live?'game.js':'artifacts/epic-v154-baseline-game.js'),original=fs.readFileSync(sourceFile,'utf8');
const oldTargets="[...enemies.filter(e=>!e.dead),miniBoss,boss].filter(Boolean)";
const newTargets="[...enemies.filter(e=>!e.dead),miniBoss,...(boss?.epic&&boss.ritual?(boss.ritual.result===null?epicHeavies.filter(h=>h.active&&!h.dead&&h.hp>0):[]):[boss])].filter(Boolean)";
if(!live)assert.ok(original.includes(oldTargets),'Expected v153 native player homing list');
function build(candidate){
 let source=candidate?original.replace(oldTargets,newTargets):original;
 source=source.replace('if(target){const speed=Math.hypot(b.vx,b.vy)',"if(target){epicTargetLog.push({kind:b.missile?'missile':b.waveRay?'yellow':'other',guardian:epicHeavies.includes(target),active:!!target.active,dead:!!target.dead,hp:target.hp,allowed:bossDamageAllowed(target),x:target.x,y:target.y});const speed=Math.hypot(b.vx,b.vy)");
 let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
 support=support.replace('  globalThis.__gameTest = {',`let epicTargetLog=[];globalThis.__gameTest = {
   beginEpicRitual,finishEpicRitual,resumeEpicPhase,updateEpicRitual,fireMissiles,epicBossAttack,updateEpicBossFight,
   get epicHeavies(){return epicHeavies},get epicTargetLog(){return epicTargetLog},resetEpicTargetLog(){epicTargetLog=[]},
   ritualFixture(stage,epicId,phase,corner,color='red'){
     wave=stage;beginStage(false);stageIntro=0;stageHazardClock=spawn=999;miniBossSpawned=true;stagePostEliteClock=-1;stageApexIntro=-1;victoryDelay=null;runEpicEncounter=null;
     enemies=[];shots=[];enemyShots=[];stageHazards=[];pickups=[];makeEpicBoss(epicId,0);boss.phase=phase;boss.intro=0;boss.hp=boss.max*(1-phase*.25);
     const caps=combatProgressionCaps();player.pod.owned=true;player.laserColor=color;player.laserLevel=caps.force;player.missileLevel=caps.missile;player.bits=caps.bits;player.inv=10000;
     player.x=145;player.y=270;player.pod.x=195;player.pod.y=270;player.pod.mode='docked';player.pod.dockSide=player.pod.returnSide='front';player.dose=0;player.charge=0;
     beginEpicRitual(boss);const active=epicHeavies.find(h=>h.active);[active.x,active.y]=[[185,115],[775,115],[185,425],[775,425]][corner];epicTargetLog=[];return active;
   },`);
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);return m.exports.createGame;
}
const versions=live?{live:build(false)}:{baseline:build(false),candidate:build(true)},dt=1/120,rows=[],direction=[],controls=[];
for(const[version,createGame]of Object.entries(versions))for(const epicId of[0,1])for(const corner of[0,1,2,3]){
 const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const target=a.ritualFixture(1,epicId,1,corner,'yellow');a.fire(0);a.update(dt);
 const homing=a.shots.filter(s=>s.missile||s.waveRay),log=a.epicTargetLog;
 assert.ok(log.some(r=>r.kind==='missile')&&log.some(r=>r.kind==='yellow'));
 if(version!=='baseline')assert.ok(log.every(r=>r.guardian&&r.active&&!r.dead&&r.hp>0&&r.allowed),'Only active damageable guardian may be targeted');else assert.ok(log.every(r=>!r.guardian&&!r.allowed),'Baseline demonstrates the protected hidden-body target');
 direction.push({version,epicId,corner,target:{x:target.x,y:target.y,hp:target.hp},logged:log.length,guardianTargets:log.filter(r=>r.guardian).length,hiddenBossTargets:log.filter(r=>!r.allowed).length,missileVelocity:homing.filter(s=>s.missile).map(s=>({vx:s.vx,vy:s.vy}))});
}
for(const[version,createGame]of Object.entries(versions).filter(([name])=>name!=='baseline')){
 for(const condition of['inactive','dead','zero-hp','finishing']){
   const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const target=a.ritualFixture(1,0,1,1,'yellow');
   if(condition==='inactive')target.active=false;if(condition==='dead')target.dead=true;if(condition==='zero-hp')target.hp=0;if(condition==='finishing')a.boss.ritual.result=true;
   a.fire(0);a.update(dt);assert.equal(a.epicTargetLog.length,0,'No homing target during '+condition+' guardian state');controls.push({version,name:condition,passed:true});
 }
 for(const state of['intro','active-body','ordinary-enemy']){
   const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');a.makeBoss();a.player.pod.owned=false;a.player.missileLevel=1;a.player.inv=1000;
   if(state==='active-body')a.boss.intro=0;
   if(state==='ordinary-enemy'){a.spawnEnemy();const enemy=a.enemies[0];enemy.x=350;enemy.y=300;}
   a.fireMissiles();a.update(dt);
   if(state==='intro'){assert.ok(a.epicTargetLog.length);assert.ok(a.epicTargetLog.every(r=>!r.allowed&&!r.guardian),'Normal protected-body tracking remains unchanged');}
   else{assert.ok(a.epicTargetLog.length);assert.ok(a.epicTargetLog.every(r=>r.allowed&&!r.guardian));if(state==='ordinary-enemy')assert.ok(a.epicTargetLog.every(r=>r.x<400),'Live ordinary actor wins over protected body');}
   controls.push({version,name:state,passed:true});
 }
}
// Same corner/starting positions and exact native firing/movement in both versions.
for(const[version,createGame]of Object.entries(versions))for(const stage of[1,10])for(const phase of[1,2,3])for(const corner of[0,1,2,3])for(const policy of['stand-charge','pod-contact-charge']){
 const g=createGame({ruleset:'streamlined-v1'}),a=g.api;a.start('story');const target=a.ritualFixture(stage,0,phase,corner,'yellow'),initial=target.hp,window=a.boss.ritual.max;
 a.keys.add('Space');let success=null,at=null,firstContact=null,elapsed=0;
 for(let tick=0;tick<Math.ceil((window+1)*120)&&a.boss?.ritual;tick++){
   if(policy==='pod-contact-charge'){
     const dx=target.x-50-a.player.x,dy=target.y-a.player.y;
     for(const key of['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])a.keys.delete(key);
     if(dx>3)a.keys.add('ArrowRight');else if(dx<-3)a.keys.add('ArrowLeft');if(dy>3)a.keys.add('ArrowDown');else if(dy<-3)a.keys.add('ArrowUp');
   }else{
     // Vertical alignment only, like normal forward firing from the back lane.
     a.keys.delete('ArrowUp');a.keys.delete('ArrowDown');if(target.y-a.player.y>3)a.keys.add('ArrowDown');else if(target.y-a.player.y<-3)a.keys.add('ArrowUp');
   }
   if(a.player.charge>=1-1e-9)a.releaseCharge();
   a.update(dt);elapsed+=dt;
   if(firstContact===null&&target.hp<initial)firstContact=elapsed;
   if(a.boss.ritual?.result!==null&&success===null){success=a.boss.ritual.result;at=elapsed;break}
 }
 rows.push({version,stage,phase,corner,policy,window,guardianHp:initial,remainingHp:Math.max(0,target.hp),success,at,firstDamage:firstContact,kit:{force:a.player.laserLevel,color:a.player.laserColor,missiles:a.player.missileLevel,bits:a.player.bits},hull:a.player.maxHp,gear:g.api.garage.inventory.length});
}
const output={sourceFile,sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),candidateTargetList:live?null:newTargets,scope:'Private normal Story stats and actual update/emission/collision. Ritual fixtures use mission-capped Yellow Force/support kit, no gear/perks/Delta, 3 maximum hull. Invulnerability is a nonlethal damage meter only. Each active corner is staged to isolate positional budgets, not a natural campaign or human outcome. Candidate modifies only the homing eligible-target list. Live mode applies no private source mutation beyond read-only target counters.',direction,controls,rows};
fs.writeFileSync(path.join(root,'artifacts/epic-ritual-v154'+(live?'-live':'')+'.json'),JSON.stringify(output,null,2)+'\n');
for(const version of Object.keys(versions))for(const stage of[1,10])for(const policy of['stand-charge','pod-contact-charge']){
 const selected=rows.filter(r=>r.version===version&&r.stage===stage&&r.policy===policy);console.log(JSON.stringify({version,stage,policy,wins:selected.filter(r=>r.success).length,trials:selected.length,remaining:selected.filter(r=>!r.success).map(r=>({phase:r.phase,corner:r.corner,hp:r.remainingHp}))}));
}
console.log('PASS '+direction.length+' native homing eligibility snapshots; '+controls.length+' guarded-target controls; '+rows.length+' native ritual budget snapshots.');
