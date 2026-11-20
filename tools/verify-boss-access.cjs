#!/usr/bin/env node
'use strict';
// Read-only diagnostics using the shipping isolated harness; no player saves.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harnessPath=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(harnessPath,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('updateMiniBossMovement,','updateMiniBossMovement,armoredHits,activateDelta,drawMiniBossFireFlash,get epicHeavies(){return epicHeavies},');
const harness=new Module(harnessPath,module);harness.filename=harnessPath;harness.paths=module.paths;
harness._compile(support+'\nmodule.exports={createGame,pngMaterial};\n',harnessPath);
const{createGame,pngMaterial}=harness.exports;
const{api}=createGame(),results=[],diagnostics=process.argv.includes('--diagnostics');
let passed=0;
function check(name,run){run();passed++;console.log('PASS '+name);}
function near(actual,expected,message){assert.ok(Math.abs(actual-expected)<1e-7,`${message}: ${actual} versus ${expected}`);}
function probe(enemy,node,row){
  api.shots.length=0;enemy.hitFlash=0;
  const before=api.activeWeakNodes(enemy).map(n=>n.hp),hp=enemy.hp;
  const shot={x:260,y:row,px:260,py:row,vx:620,vy:0,r:3,d:1,dead:false};api.shots.push(shot);
  for(let tick=0;tick<160&&!shot.dead;tick++){
    shot.px=shot.x;shot.x+=shot.vx/120;api.armoredHits(enemy,'#ffffff',1/120);
  }
  return{target:node?.miniIndex??node?.bloodstarIndex??null,hit:before.map((n,i)=>n>api.activeWeakNodes(enemy)[i].hp?i:null).filter(n=>n!==null),damage:hp-enemy.hp,passed:!shot.dead};
}
for(const family of['mini','bloodstar'])for(let phase=1;phase<=(family==='mini'?1:2);phase++)for(let frame=0;frame<(family==='mini'?16:4);frame++){
  if(family==='mini')api.startMiniBossLab(0);else api.startBossLab(0);
  const enemy=family==='mini'?api.miniBoss:api.boss;
  Object.assign(enemy,{x:796,y:270,intro:0,clock:family==='mini'?0:(frame+.25)/(phase===1?2.45:3.15),phase,cool:10,weakOpen:true,weakTimer:1,coreAperture:1,visualAngle:0,lastShotClock:-10,animOffset:frame});
  const nodes=api.activeWeakNodes(enemy);
  for(const node of nodes){
    const before=nodes.map(n=>({...n})),hp=enemy.hp,w=api.worldWeakNode(enemy,node);
    const result=probe(enemy,node,w.y);results.push({family,phase,frame,x:+w.x.toFixed(1),y:+w.y.toFixed(1),...result});
    nodes.forEach((n,i)=>Object.assign(n,before[i]));enemy.hp=hp;
  }
}
const blocked=results.filter(r=>!r.hit.includes(r.target)),noDamage=results.filter(r=>r.damage===0);
if(diagnostics)console.log(JSON.stringify({frozenForwardShots:results.length,targetNotReached:blocked.length,noDamage:noDamage.length,blocked},null,2));
check('112 forward shots across Reaver and Bloodstar native poses all deal shared HP damage',()=>assert.equal(noDamage.length,0));
let survivingTrials=0,survivingFailures=0;
for(let phase=1;phase<=2;phase++)for(let frame=0;frame<4;frame++)for(let index=2;index<8;index++){
  api.startBossLab(0);const enemy=api.boss;
  Object.assign(enemy,{x:796,y:270,intro:0,clock:(frame+.25)/(phase===1?2.45:3.15),phase,cool:10,weakOpen:true,weakTimer:1,visualAngle:0});
  const nodes=api.activeWeakNodes(enemy),target=nodes[index];
  nodes.forEach((node,n)=>{if(n!==index){node.hp=0;node.destroyed=true;}});
  const result=probe(enemy,target,api.worldWeakNode(enemy,target).y);survivingTrials++;if(!result.hit.includes(index))survivingFailures++;
}
if(diagnostics)console.log('REAR_AFTER_FRONT_BREAK',JSON.stringify({trials:survivingTrials,failures:survivingFailures}));
check('all 48 surviving Bloodstar rear appendages remain reachable from the left',()=>assert.equal(survivingFailures,0));
function fixture(family,type){
  if(family==='mini')api.startMiniBossLab(type);else if(family==='main')api.startBossLab(type);else api.startEpicBossLab(type);
  const enemy=family==='mini'?api.miniBoss:api.boss;
  Object.assign(enemy,{x:715,y:263,intro:0,clock:0,cool:10,weakOpen:false,weakTimer:100,phaseTransition:0,hidden:false,ritual:null,visualAngle:0,lastShotClock:-10,animOffset:0,hitFlash:0});
  api.player.pod.owned=false;api.player.inv=1e6;api.player.weakDamage=1.75;api.shots.length=0;return enemy;
}
function allEncounters(run){for(const family of['mini','main','epic'])for(let type=0;type<(family==='epic'?2:10);type++)run(fixture(family,type),family,type);}
function phaseFloor(enemy){return enemy.kind==='mini'?0:enemy.epic?enemy.max*(1-enemy.phase*.25):enemy.phase===1?enemy.max*.5:0;}
function pool(enemy){return api.activeWeakNodes(enemy).reduce((sum,node)=>sum+node.hp,0);}
function ledger(enemy,label){near(enemy.hp-phaseFloor(enemy),pool(enemy),label);}
function impact(enemy,damage,target=null){
  api.shots.length=0;const point=target?api.worldWeakNode(enemy,target):{x:enemy.x,y:enemy.y};
  const shot={x:point.x,y:point.y,px:point.x-2,py:point.y,vx:620,vy:0,r:3,d:damage,dead:false};api.shots.push(shot);
  const before=enemy.hp;api.armoredHits(enemy,'#ffffff',1/120);return before-enemy.hp;
}
check('all 22 encounters take 25 percent hull damage and full precision core output',()=>allEncounters((enemy,family,type)=>{
  near(impact(enemy,8),2,`${family} ${type} hull chip`);ledger(enemy,'Hull and node health must share one pool');
  enemy.weakOpen=true;near(impact(enemy,8,api.activeWeakNodes(enemy)[0]),14,`${family} ${type} core output`);ledger(enemy,'Core and shared health must match');
}));
check('armor spillover drains multiple cores without losing damage or crossing a phase budget',()=>allEncounters((enemy,family,type)=>{
  const nodes=api.activeWeakNodes(enemy),nearest=[...nodes].sort((a,b)=>Math.abs(api.worldWeakNode(enemy,a).y-enemy.y)-Math.abs(api.worldWeakNode(enemy,b).y-enemy.y))[0];
  nearest.hp=.5;enemy.hp=phaseFloor(enemy)+pool(enemy);
  near(impact(enemy,20),5,`${family} ${type} spillover`);assert.equal(nearest.destroyed,true);ledger(enemy,'Spilled damage must conserve the shared pool');
  impact(enemy,1e6);near(enemy.hp,phaseFloor(enemy),'Excess armor damage stops at the phase boundary');assert.ok(nodes.every(n=>n.destroyed&&n.hp===0));
  if(enemy.kind==='boss'){
    const future=enemy.epic?enemy.weakNodesByPhase.slice(enemy.phase):enemy.phase===1?[enemy.weakNodes2]:[];
    for(const phase of future)for(const node of phase)assert.equal(node.hp,node.max,'A large hit cannot pre-damage a future phase');
  }
}));
check('entry, phase transition, hidden bodies and rituals protect every encounter from shots and the pod',()=>allEncounters((enemy,family,type)=>{
  for(const[field,value]of[['intro',1],['phaseTransition',1],['hidden',true],['ritual',{}]]){
    Object.assign(enemy,{intro:0,phaseTransition:0,hidden:false,ritual:null,weakOpen:true});enemy[field]=value;
    const hp=enemy.hp,nodeHp=api.activeWeakNodes(enemy).map(n=>n.hp),node=api.activeWeakNodes(enemy)[0],point=api.worldWeakNode(enemy,node);
    Object.assign(api.player.pod,{owned:true,x:point.x,y:point.y,r:15});
    near(impact(enemy,1e5,node),0,`${family} ${type} ${field} core protection`);
    near(impact(enemy,1e5),0,`${family} ${type} ${field} hull protection`);
    assert.equal(enemy.hp,hp);assert.deepEqual(api.activeWeakNodes(enemy).map(n=>n.hp),nodeHp);
  }
  api.player.pod.owned=false;
}));
check('Delta preserves DOSE and every combat object during protected entry, transition, hidden and ritual states',()=>allEncounters((enemy,family,type)=>{
  for(const[field,value]of[['intro',1],['phaseTransition',1],['hidden',true],['ritual',{}]]){
    Object.assign(enemy,{intro:0,phaseTransition:0,hidden:false,ritual:null});enemy[field]=value;
    Object.assign(api.player,{dose:100,deltaFlash:0});const hp=enemy.hp,nodes=api.activeWeakNodes(enemy).map(node=>node.hp),fieldEnemy={hp:7},bullet={x:100,y:100};
    api.enemies.length=0;api.enemies.push(fieldEnemy);api.enemyShots.length=0;api.enemyShots.push(bullet);api.activateDelta();
    assert.equal(api.player.dose,100,`${family} ${type} ${field} must not spend Delta`);assert.equal(api.player.deltaFlash,0);assert.equal(enemy.hp,hp);assert.deepEqual(api.activeWeakNodes(enemy).map(node=>node.hp),nodes);
    assert.equal(fieldEnemy.hp,7);assert.equal(api.enemyShots[0],bullet);
  }
  api.enemies.length=0;api.enemyShots.length=0;
}));
check('Delta stays ready through the full apex warning and becomes usable after protected entry',()=>{
  api.start('rush');assert.equal(api.boss,null);assert.ok(api.stageApexIntro>0);api.activateDelta();assert.equal(api.player.dose,100);assert.equal(api.player.deltaFlash,0);
  api.flushBossArrival();assert.ok(api.boss.intro>0);const hp=api.boss.hp;api.activateDelta();assert.equal(api.player.dose,100);assert.equal(api.boss.hp,hp);
  api.boss.intro=0;api.boss.weakOpen=false;api.activateDelta();assert.equal(api.player.dose,0);assert.ok(api.boss.hp<hp,'Legal Delta still damages sealed boss cores after protection ends');
});
check('ordinary field Delta still clears hostile bullets and defeats regular enemies',()=>{
  api.start('story');api.player.dose=100;const enemy={hp:7,dead:false};api.enemies.push(enemy);api.enemyShots.push({x:100,y:100});
  api.activateDelta();assert.equal(api.player.dose,0);assert.equal(api.player.deltaFlash,1.2);assert.equal(enemy.hp,0);assert.equal(api.enemyShots.length,0);
});
check('forward hull fire can finish all 22 encounters while main and epic phase gates remain intact',()=>allEncounters((enemy,family,type)=>{
  const phases=family==='mini'?1:family==='main'?2:4;
  for(let phase=1;phase<=phases;phase++){
    assert.equal(enemy.phase||1,phase);enemy.weakOpen=false;enemy.weakTimer=100;enemy.cool=10;
    const shot={x:35,y:enemy.y,px:35,py:enemy.y,vx:620,vy:0,r:3,d:1e6,dead:false};api.shots.length=0;api.shots.push(shot);
    for(let tick=0;tick<240&&!shot.dead;tick++){shot.px=shot.x;shot.x+=shot.vx/120;api.armoredHits(enemy,'#ffffff',1/120);}
    assert.equal(shot.dead,true,'A forward shot must hit the body without requiring a rear mount');near(enemy.hp,phaseFloor(enemy),`${family} ${type} phase ${phase} floor`);
    assert.ok(api.activeWeakNodes(enemy).every(n=>n.destroyed));api.update(1/120);
    if(phase===phases){assert.equal(family==='mini'?api.miniBoss:api.boss,null);break;}
    if(family==='main'){
      assert.equal(enemy.phase,phase+1);while(enemy.phaseTransition>0)api.update(1/120);
    }else{
      assert.ok(enemy.ritual&&enemy.hidden,'An epic must enter its authored ritual before its next phase');
      const heavy=api.epicHeavies.find(h=>h.active&&!h.dead);assert.ok(heavy);
      api.shots.length=0;api.shots.push({x:heavy.x-80,y:heavy.y,r:3,vx:620,vy:0,d:1e6,pierce:0});
      for(let tick=0;tick<180&&enemy.ritual;tick++)api.update(1/120);
      assert.equal(enemy.ritual,null);assert.equal(enemy.phase,phase+1);assert.equal(enemy.toxinProtected,true,'The sentinel shot must complete the ritual successfully');
      while(enemy.intro>0)api.update(1/120);
    }
  }
}));
check('actual encounter updates keep Reaver exposed for 3.2 seconds and Bloodstar for 3.2 or 2.8 seconds',()=>{
  const cases=[...Array.from({length:10},(_,type)=>['mini',type,1,type===0?3.2:2.35]),['main',0,1,3.2],['main',0,2,2.8]];
  for(const[family,type,phase,duration]of cases){
    const enemy=fixture(family,type);enemy.phase=phase;enemy.hp=phaseFloor(enemy)+pool(enemy);
    enemy.weakTimer=0;enemy.weakTelegraph=1/120;api.update(1/120);
    assert.equal(enemy.weakOpen,true);near(enemy.weakTimer,duration,`${family} ${type} phase ${phase} exposure timer`);
    const ticks=Math.round(duration*120);
    for(let tick=1;tick<ticks;tick++)api.update(1/120);
    assert.equal(enemy.weakOpen,true,'The core must stay vulnerable through the full intended window');
    for(let tick=0;tick<2&&enemy.weakOpen;tick++)api.update(1/120);
    assert.equal(enemy.weakOpen,false,'The exposure must close within one fixed step of its authored duration');
  }
});
check('every encounter health readout visibly changes after a fractional hull hit',()=>{
  const ctx=api.drawingContext,fillText=ctx.fillText,text=[];
  ctx.fillText=value=>text.push(String(value));
  try{allEncounters((enemy,family,type)=>{
    text.length=0;api.drawBossStatus();const before=text.find(value=>value.includes(' HP'));assert.ok(before);
    near(impact(enemy,1),.25,`${family} ${type} fractional hull hit`);
    text.length=0;api.drawBossStatus();const after=text.find(value=>value.includes(' HP'));
    const expected=`${enemy.hp.toFixed(1).replace(/\.0$/,'')} / ${Math.ceil(enemy.max)} HP`;
    assert.ok(after.includes(expected));assert.notEqual(after,before,'A successful quarter-damage hit must change the displayed current HP');
  });}finally{ctx.fillText=fillText;}
});
check('broken elite side weapons remove their salvo while surviving lanes keep their authored packets and cadence',()=>{
  const packets=()=>Array.from(api.enemyShots,shot=>({x:shot.x,y:shot.y,vx:shot.vx,vy:shot.vy,r:shot.r,damage:shot.damage,homing:shot.homing,warn:shot.warn}));
  for(const[type,cycle]of[[0,1],[1,0],[5,0]]){
    const ready=fixture('mini',type);ready.clock=1;ready.cool=0;ready.attackCycle=cycle;api.enemyShots.length=0;api.miniBossAttack(ready);
    const intact=packets(),cool=ready.cool;assert.ok(intact.length>=6&&intact.length%2===0,'Fixture must capture both authored side fans without an amber follow-up');
    assert.deepEqual(Array.from(ready.muzzleFlares,flare=>flare.side),[-1,1]);
    const broken=fixture('mini',type);broken.clock=1;broken.cool=0;broken.attackCycle=cycle;
    broken.weakNodes[0].destroyed=true;broken.weakNodes[0].hp=0;
    api.enemyShots.length=0;api.miniBossAttack(broken);
    assert.deepEqual(packets(),intact.slice(intact.length/2),'The surviving lower fan keeps every original position, direction, radius, speed and damage');
    assert.equal(broken.cool,cool,'A broken weapon cannot accelerate the next attack');
    assert.deepEqual(Array.from(broken.muzzleFlares,flare=>flare.side),[1]);
    const disarmed=fixture('mini',type);disarmed.clock=1;disarmed.cool=0;disarmed.attackCycle=cycle;
    for(const index of[0,2]){disarmed.weakNodes[index].destroyed=true;disarmed.weakNodes[index].hp=0;}
    api.enemyShots.length=0;api.miniBossAttack(disarmed);
    assert.equal(api.enemyShots.length,0,'Both broken side weapons must not recreate their paired salvo at the central cannon');
    assert.equal(disarmed.cool,cool);assert.equal(disarmed.muzzleFlares.length,0);assert.equal(disarmed.weakNodes[1].destroyed,false,'The central reactor remains a distinct intact target');
  }
});
check('an existing muzzle flash disappears with its broken weapon while the surviving side stays attached',()=>{
  const enemy=fixture('mini',0);enemy.clock=1;enemy.cool=0;enemy.attackCycle=1;api.miniBossAttack(enemy);
  const original=api.miniBossMuzzle(enemy,-1);enemy.weakNodes[0].destroyed=true;enemy.weakNodes[0].hp=0;
  const front=api.miniBossMuzzle(enemy,0);assert.ok(Math.hypot(original.x-front.x,original.y-front.y)>20);
  const flares=JSON.stringify(enemy.muzzleFlares);
  const context=api.drawingContext;context.trace=[];context.resetTransform();
  try{
    api.drawMiniBossFireFlash(enemy);const stamps=context.trace.filter(record=>record.op==='fillRect');assert.equal(stamps.length,2,'Only the intact lower weapon may retain its two-pass muzzle flash');
    for(const stamp of stamps){
      const expected=api.miniBossMuzzle(enemy,1),painted=stamp.origin;
      near(painted.x,expected.x,'Muzzle flash must resolve its current attached cannon x');near(painted.y,expected.y,'Muzzle flash must resolve its current attached cannon y');
    }
    assert.equal(JSON.stringify(enemy.muzzleFlares),flares,'Drawing cannot rewrite the recorded release');
    enemy.weakNodes[2].destroyed=true;enemy.weakNodes[2].hp=0;context.trace=[];api.drawMiniBossFireFlash(enemy);
    assert.equal(context.trace.filter(record=>record.op==='fillRect').length,0,'A second broken weapon must not paint a redirected central flash');
  }finally{context.trace=null;}
});
if(diagnostics){
for(const family of['mini','bloodstar']){
  if(family==='mini')api.startMiniBossLab(0);else api.startBossLab(0);
  const enemy=family==='mini'?api.miniBoss:api.boss;Object.assign(enemy,{x:796,y:270,intro:0,clock:0,phase:1,cool:10,visualAngle:0,lastShotClock:-10,animOffset:0});
  for(const open of[false,true]){enemy.weakOpen=open;console.log('HULL',family,'open='+open,JSON.stringify(probe(enemy,null,270)));}
}
const material=pngMaterial('assets/minibosses/elite-01-shattered-meridian-atlas-alpha-v2.png',true),cores=[];
api.startMiniBossLab(0);const enemy=api.miniBoss;enemy.clock=0;
for(let frame=0;frame<16;frame++){
  enemy.animOffset=frame;const selected=api.miniFrame(enemy),sw=material.width/4,sh=material.height/4;
  for(const node of enemy.weakNodes){
    const p=api.localNode(enemy,node),cx=selected%4*sw+(p.dx/enemy.def.w+.5)*sw,cy=Math.floor(selected/4)*sh+(p.dy/enemy.def.h+.5)*sh;
    const rx=node.miniIndex===1?4:8,ry=node.miniIndex===1?8:3;let n=0,emissive=0,weighted=0,peak=0;
    for(let y=Math.floor(cy-ry*sh/enemy.def.h);y<=cy+ry*sh/enemy.def.h;y++)for(let x=Math.floor(cx-rx*sw/enemy.def.w);x<=cx+rx*sw/enemy.def.w;x++){
      if(x<0||y<0||x>=material.width||y>=material.height)continue;
      const i=(y*material.width+x)*4,r=material.rgba[i],g=material.rgba[i+1],b=material.rgba[i+2],a=material.rgba[i+3];if(a<128)continue;
      const w=api.nativeEmissionWeight(r,g,b,a);n++;if(w>.2)emissive++;weighted+=w;peak=Math.max(peak,r,g,b);
    }
    cores.push({frame:selected,index:node.miniIndex,emissiveFraction:+(emissive/n).toFixed(3),averageWeight:+(weighted/n).toFixed(3),peak});
  }
}
console.log('MINI_SOURCE',JSON.stringify(cores));
}
console.log(`\n${passed} boss-access checks passed.`);
