#!/usr/bin/env node
'use strict';
// Focused impact priority and guidance-allocation regressions. Runs shipping
// update/attack paths in private storage; no balance values or saves change.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');let support=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').replace(/^#![^\n]*\n/,'').split('const game = createGame();')[0];
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {defeatEnemy,activateDelta,');
const {createGame}=new Function('require','__dirname',support+'\nreturn{createGame};')(require,__dirname),results=[];
function test(name,run){try{const details=run();results.push({name,pass:true,details});console.log('PASS '+name)}catch(error){results.push({name,pass:false,error:error.stack});console.error('FAIL '+name+': '+error.stack)}}
function inertEnemy(a,x=650,y=300,extra={}){const before=a.enemies.length;a.spawnEnemy();const e=a.enemies.at(-1);a.enemies.splice(before,a.enemies.length-before,e);Object.assign(e,{x,y,type:'drone',hp:100,maxHp:100,speed:0,cool:999,fireAnim:0,phase:0,...extra});return e}
function field(){const g=createGame();g.api.startLevelLab(1);g.api.enemies.splice(0);g.api.player.pod.owned=false;g.api.player.bits=0;return g}
const shot=(angle=0,homing=2.75)=>({x:200,y:270,vx:350*Math.cos(angle),vy:350*Math.sin(angle),r:2,d:0,homingPlayer:homing});
function instrumentEnemies(a){const list=a.enemies,original=list.filter.bind(list);let calls=0;list.filter=(...args)=>{calls++;return original(...args)};return()=>calls}

test('regular enemy deaths preserve stronger hull-hit feedback and retain their own isolated impact',()=>{
  const{api:a}=field();a.player.shield=0;a.player.inv=0;const beforeHp=a.player.hp;a.damage();assert.equal(a.player.hp,beforeHp-1);assert.equal(a.shake,12);a.defeatEnemy(inertEnemy(a));assert.equal(a.shake,12,'A small kill cannot downgrade an actual hull impact');a.setShake(28);for(let i=0;i<3;i++)a.defeatEnemy(inertEnemy(a));assert.equal(a.shake,28,'Kill bursts preserve stronger impacts without adding to them');a.setShake(0);const e=inertEnemy(a);a.defeatEnemy(e);assert.equal(a.shake,4);a.defeatEnemy(e);assert.equal(a.shake,4,'Already defeated objects cannot trigger another hit');return{hullImpact:12,strongImpact:28,isolatedKillImpact:4};
});

test('Delta impact survives its real mass-kill update instead of collapsing to regular-death strength',()=>{
  const{api:a}=field();for(let i=0;i<5;i++)inertEnemy(a,620+i*10,150+i*20,{hp:1});a.player.dose=100;a.activateDelta();assert.equal(a.shake,28);assert.equal(a.enemies.every(e=>e.hp===0),true);const dt=1/120,expected=28*Math.pow(.03,dt);a.update(dt);assert.ok(Math.abs(a.shake-expected)<1e-9,'Death processing must retain the normal decay of the Delta impact');assert.equal(a.enemies.length,0);assert.equal(a.player.dose,20,'Five authored drone deaths still award their original DOSE');return{defeatedEnemies:5,shakeAfterUpdate:a.shake};
});

test('guided shots build one candidate list per update and ordinary shots build none',()=>{
  const{api:a}=field();inertEnemy(a);const read=instrumentEnemies(a);for(let i=0;i<15;i++)a.shots.push(shot((i-7)*.02));a.update(1/120);assert.equal(read(),2,'Exactly one target filter plus the existing final enemy cleanup, rather than one filter per missile');a.shots.splice(0);for(let i=0;i<15;i++)a.shots.push(shot((i-7)*.02,0));const readOrdinary=instrumentEnemies(a);a.update(1/120);assert.equal(readOrdinary(),1,'Unguided shots only incur existing enemy cleanup');return{guidedShots:15,targetBuilds:1,ordinaryTargetBuilds:0};
});

test('target cache refreshes between simulation steps when an enemy dies',()=>{
  const{api:a}=field(),near=inertEnemy(a,500,190),far=inertEnemy(a,700,400);a.shots.push(shot());a.update(1/120);assert.ok(a.shots[0].vy<0,'First update seeks the nearer upper enemy');near.dead=true;a.shots.splice(0);const next=shot();a.shots.push(next);a.update(1/120);assert.ok(next.vy>0,'Next update must seek the surviving lower enemy');assert.equal(a.enemies.includes(far),true);return{simulationSteps:2};
});

test('cached guidance preserves exact steering, speed and existing eligibility or tie order',()=>{
  const cases=[
    {name:'living regular excludes closer dead regular',mode:'field',regular:[{x:650,y:220},{x:220,y:270,dead:true}],target:0},
    {name:'zero-HP regular remains eligible until existing death processing',mode:'field',regular:[{x:500,y:320,hp:0},{x:700,y:150}],target:0},
    {name:'living mini',mode:'mini',regular:[],mini:{x:600,y:220},target:'mini'},
    {name:'mini dead flag preserves existing eligibility',mode:'mini',regular:[],mini:{x:600,y:220,dead:true},target:'mini'},
    {name:'mini zero HP preserves existing eligibility',mode:'mini',regular:[],mini:{x:600,y:220,hp:0},target:'mini'},
    {name:'living boss excludes closer dead regular',mode:'boss',regular:[{x:220,y:270,dead:true}],boss:{x:600,y:220},target:'boss'},
    {name:'boss hidden and dead flags preserve existing eligibility',mode:'boss',regular:[],boss:{x:600,y:220,dead:true,hidden:true},target:'boss'},
    {name:'boss zero HP preserves existing eligibility',mode:'boss',regular:[],boss:{x:600,y:220,hp:0},target:'boss'},
    {name:'regular wins exact-distance tie before mini and boss',mode:'both',regular:[{x:600,y:320}],mini:{x:600,y:220},boss:{x:750,y:270},target:0},
    {name:'mini wins exact-distance tie before boss',mode:'both',regular:[],mini:{x:600,y:220},boss:{x:600,y:320},target:'mini'},
    {name:'empty candidate set leaves guided velocity unchanged',mode:'field',regular:[],target:null},
  ];let comparisons=0;
  for(const item of cases){
    const g=createGame(),a=g.api;if(item.mode==='field')a.startLevelLab(1);else if(item.mode==='mini')a.startMiniBossLab(1);else{a.startBossLab(1);if(item.mode==='both')a.makeMiniBoss()}a.enemies.splice(0);a.player.pod.owned=false;a.player.bits=0;
    const mini=a.miniBoss,boss=a.boss;for(const e of[mini,boss].filter(Boolean))Object.assign(e,{intro:10,cool:999,x:700,y:270,r:0});if(mini)Object.assign(mini,item.mini);if(boss)Object.assign(boss,item.boss);
    const regular=item.regular.map(data=>inertEnemy(a,data.x,data.y,data)),target=item.target==='mini'?mini:item.target==='boss'?boss:item.target===null?null:regular[item.target],point=target?{x:target.x,y:target.y}:null,inputs=[];a.shots.splice(0);
    for(const angle of[-.4,-.1,0,.1,.4])for(const homing of[1.9,2.75]){const projectile=shot(angle,homing);inputs.push({projectile,...projectile});a.shots.push(projectile)}
    const dt=1/120;a.update(dt);
    for(const before of inputs){let expectedAngle=Math.atan2(before.vy,before.vx);if(point){const desired=Math.atan2(point.y-before.y,point.x-before.x),difference=Math.atan2(Math.sin(desired-expectedAngle),Math.cos(desired-expectedAngle));expectedAngle+=Math.max(-before.homingPlayer*dt,Math.min(before.homingPlayer*dt,difference))}const speed=Math.hypot(before.vx,before.vy),vx=Math.cos(expectedAngle)*speed,vy=Math.sin(expectedAngle)*speed;for(const[actual,expected]of[[before.projectile.vx,vx],[before.projectile.vy,vy],[before.projectile.x,before.x+vx*dt],[before.projectile.y,before.y+vy*dt]])assert.ok(Math.abs(actual-expected)<1e-9,item.name+' steering or movement changed');comparisons++}
  }
  return{targetScenarios:cases.length,guidedProjectileComparisons:comparisons};
});

const report={date:new Date().toISOString(),scope:'Production damage/death and Delta feedback priority; per-update target-list allocation budget; exact guided-shot steering with unchanged target eligibility and stable tie ordering.',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};fs.writeFileSync(path.join(root,'artifacts/combat-feedback-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} focused checks passed, ${report.failed} failed`);if(report.failed)process.exitCode=1;
