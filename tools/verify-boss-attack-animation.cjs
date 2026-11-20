#!/usr/bin/env node
'use strict';

// Check live attack cadence, source UVs and socket registration together.
// This uses isolated browser/storage mocks and never opens a real profile.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const filename=path.join(__dirname,'verify-game.cjs');
let harness=fs.readFileSync(filename,'utf8');harness=harness.slice(0,harness.indexOf('\ntest('));
assert.ok(harness.includes('globalThis.__gameTest = {'));
harness=harness.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
    bossAttack,standardBossAttack,bossAttackAnimationPeriod,riftAnimationState,ironBloomFrame,
    get riftSourcePoints(){return riftAnimatedNodePixels},get riftRegistration(){return riftAnimatedRegistration},
    get ironSourcePoints(){return ironBloomNodePixels},get playerAtlas(){return spriteAtlas},`);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(harness+'\nmodule.exports={createGame};\n',filename);
const{api,sandbox}=isolated.exports.createGame(),ctx=api.drawingContext;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message||`${actual} != ${expected}`);
const baseline=(type,phase)=>type===3?(phase===1?1.3:1.25):(phase===1?1.05:.86);
const sequence=(type,phase)=>type===3&&phase===2?[2,3,0,1]:[4,5,6,7,0,1,2,3];
function setup(type,phase=1){api.startBossLab(type);const e=api.boss;Object.assign(e,{x:750,y:270,intro:0,phase,clock:3.1,attackCycle:0,attackAngle:.17,ironCycle:0,hitFlash:0,weakOpen:true,weakTelegraph:0});api.player.x=145;api.player.y=270;api.player.inv=1e6;return e}
function frame(e){return e.type===3?api.riftAnimationState(e).frame:api.ironBloomFrame(e)}
function advancePose(e,age){e.clock=e.attackAnimationCycle.clock+age;e.cool=e.attackAnimationCycle.period-age;e.ironCycle=age}
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name)}

check('actual sector4/5 shot intervals contain every intended native pose in order',()=>{
  for(const type of[3,4])for(const phase of[1,2]){
    const e=setup(type,phase);api.bossAttack(e);const expected=sequence(type,phase),period=e.cool,seen=[];
    near(period,type===3?(phase===1?1.066:1.025):(phase===1?.8085:.6622));assert.ok(Object.isFrozen(e.attackAnimationCycle));
    for(let age=0;age<period;age+=1/240){advancePose(e,age);const current=frame(e);if(seen.at(-1)!==current)seen.push(current)}
    assert.deepEqual(seen,expected,`Type${type} phase${phase} must finish its opening and recovery poses`);
    advancePose(e,period*.9999);assert.equal(frame(e),expected.at(-1));e.clock+=.001;api.bossAttack(e);assert.equal(frame(e),expected[0]);
  }
});
check('animation bookkeeping leaves attack cooldowns and emitted projectiles unchanged',()=>{
  for(const type of[3,4])for(const phase of[1,2]){
    const original=setup(type,phase);api.standardBossAttack(original);const expectedShots=JSON.stringify(api.enemyShots),authoredCooldown=original.cool;
    const actual=setup(type,phase);api.bossAttack(actual);assert.equal(JSON.stringify(api.enemyShots),expectedShots);near(actual.cool,authoredCooldown*actual.threat.fireScale);assert.equal(actual.attackCycle,1);
  }
});
check('phase changes, cold encounters and Art Inspector retain authored fallback timing',()=>{
  for(const type of[3,4]){
    const e=setup(type);near(api.bossAttackAnimationPeriod(e,baseline(type,1)),baseline(type,1));api.bossAttack(e);near(api.bossAttackAnimationPeriod(e,baseline(type,1)),e.cool);
    const old=e.attackAnimationCycle;e.phase=2;near(api.bossAttackAnimationPeriod(e,baseline(type,2)),baseline(type,2));api.bossAttack(e);assert.notEqual(e.attackAnimationCycle,old);assert.equal(e.attackAnimationCycle.phase,2);
    e.clock=e.attackAnimationCycle.clock-.1;near(api.bossAttackAnimationPeriod(e,baseline(type,2)),baseline(type,2));e.clock=e.attackAnimationCycle.clock;
    api.openArtInspection();assert.equal(api.state,'art');near(api.bossAttackAnimationPeriod(e,baseline(type,2)),baseline(type,2));api.closeArtInspection();
  }
});
check('body UVs, sampled native material and colliders share the cadence-correct pose',()=>{
  for(const type of[3,4])for(const phase of[1,2]){
    const e=setup(type,phase);api.bossAttack(e);const poses=sequence(type,phase);
    for(let step=0;step<poses.length;step++){
      advancePose(e,e.attackAnimationCycle.period*(step+.3)/poses.length);const expected=poses[step];assert.equal(frame(e),expected);api.nativePaletteCache.clear();ctx.trace=[];ctx.resetTransform();api.paintNativeBossBody(e);const trace=ctx.trace;ctx.trace=null;
      const body=trace.find(r=>r.op==='drawImage'&&r.image.sourcePath?.startsWith('assets/bosses/'));assert.ok(body);
      const intermediate=type===3?phase===1&&expected%2===1:expected%2===1,pose=type===3&&phase===2?expected:Math.floor(expected/2),sw=body.image.naturalWidth/2,sh=body.image.naturalHeight/2;
      assert.equal(body.image.sourcePath.includes('inbetween'),intermediate);near(body.args[1],pose%2*sw);near(body.args[2],Math.floor(pose/2)*sh);
      const palettes=[...api.nativePaletteCache.values()],points=(type===3?api.riftSourcePoints:api.ironSourcePoints)[phase-1][expected],nodes=api.activeWeakNodes(e);assert.equal(palettes.length,nodes.length);
      nodes.forEach((node,index)=>{
        const source=palettes.find(p=>Math.abs((p.sourceRect.x+p.sourceRect.w/2)-(pose%2*sw+points[index][0]))<1e-8&&Math.abs((p.sourceRect.y+p.sourceRect.h/2)-(Math.floor(pose/2)*sh+points[index][1]))<1e-8);
        assert.ok(source,'The relit socket must sample this exact source pose');assert.equal(source.sourceAsset,body.image);
        const actual=api.localNode(e,node),point=points[index],scale=type===3?224/627:262/627,registration=type===3?api.riftRegistration[phase-1][expected]:[0,0];
        near(actual.dx,(point[0]+registration[0]-(type===3?384:313.5))*scale);near(actual.dy,(point[1]+registration[1]-(type===3?256:313.5))*scale);
      });
    }
  }
});
check('frozen native-fragment snapshots retain the shot timing after the live boss fires again',()=>{
  for(const type of[3,4]){
    const e=setup(type);api.bossAttack(e);advancePose(e,e.cool*.82);const snapshot={...e,weakNodes1:e.weakNodes1.map(n=>({...n})),weakNodes2:e.weakNodes2.map(n=>({...n}))},expected=frame(snapshot),timing=snapshot.attackAnimationCycle;
    e.clock+=1;api.bossAttack(e);assert.notEqual(e.attackAnimationCycle,timing);assert.equal(snapshot.attackAnimationCycle,timing);assert.equal(frame(snapshot),expected);
    api.openArtInspection();assert.equal(frame(snapshot),expected,'Entering inspection must not retime an already frozen debris pose');api.closeArtInspection();
    api.fractureContext.trace=[];assert.equal(api.captureNativeFractureBody(snapshot,()=>api.paintNativeBossBody(snapshot)),true);assert.ok(api.fractureContext.trace.some(r=>r.op==='drawImage'));api.fractureContext.trace=null;assert.equal(frame(snapshot),expected);
  }
});
function podPaint(phase,reduced){const p=api.player.pod;p.phase=phase;sandbox.STARFIGHTER_SETTINGS.reducedMotion=reduced;ctx.trace=[];ctx.resetTransform();api.drawPlayerAndPod();const trace=ctx.trace;ctx.trace=null;return trace}
check('Reduced Motion keeps the Force Pod in its neutral native pose and physical size',()=>{
  api.startLevelLab(0);Object.assign(api.player,{bits:0,shield:0,inv:0});Object.assign(api.player.pod,{owned:true,mode:'deployed',x:370,y:245,r:13});
  for(const phase of[0,.13,.3,.8,1.4]){
    const before={...api.player.pod,phase},trace=podPaint(phase,true),body=trace.find(r=>r.op==='drawImage'&&r.image===api.playerAtlas&&r.args[2]===api.playerAtlas.naturalHeight/4);assert.ok(body);assert.equal(body.args[1],0);assert.deepEqual(Array.from(body.matrix),[1,0,0,1,370,245]);assert.equal(JSON.stringify(api.player.pod),JSON.stringify(before));
  }
  const poses=new Set([0,.13,.26,.39].map(phase=>podPaint(phase,false).find(r=>r.op==='drawImage'&&r.image===api.playerAtlas&&r.args[2]===api.playerAtlas.naturalHeight/4).args[1]));assert.equal(poses.size,4,'Normal mode keeps the authored rotation sequence');
});
check('Reduced Motion also stops decorative fallback spin without stopping pod gameplay motion',()=>{
  const atlas=api.playerAtlas;atlas.complete=false;const a=podPaint(.1,true).filter(r=>r.op==='fillRect').map(r=>r.matrix),b=podPaint(.7,true).filter(r=>r.op==='fillRect').map(r=>r.matrix);assert.equal(a.length,4);assert.deepEqual(a,b);
  const moving=podPaint(.7,false).filter(r=>r.op==='fillRect').map(r=>r.matrix);assert.notDeepEqual(moving,a);atlas.complete=true;sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;
  const p=api.player.pod;p.phase=0;p.x=300;p.y=200;api.update(.1);near(p.phase,.1);assert.notEqual(p.x,300,'Gameplay follow/return movement must continue');const before=JSON.stringify(p);api.drawPlayerAndPod();assert.equal(JSON.stringify(p),before);
});
console.log('Boss attack / Force Pod presentation: '+checks+' checks passed.');
