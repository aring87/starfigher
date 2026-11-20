#!/usr/bin/env node
'use strict';

// Inspect presentation order and geometry through the shipped drawing helpers.
// The browser, storage and sound remain isolated in the existing test harness.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const filename=path.join(__dirname,'verify-game.cjs');
let harness=fs.readFileSync(filename,'utf8');harness=harness.slice(0,harness.indexOf('\ntest('));
const wrappers=`
  for(const name of ['drawDeltaEffect','drawStageHazards','drawEliteIntro','drawEnemySprite','drawPlayerAndPod','drawHostileShot','drawForeground']){
    const original=eval(name);eval(name+' = function(...args){if(Array.isArray(ctx.trace))ctx.trace.push({op:"layer",args:["'+name+'"]});return original(...args)}');
  }
  globalThis.__gameTest = { activateDelta,drawDeltaEffect,drawEliteIntro,`;
assert.ok(harness.includes('globalThis.__gameTest = {'));harness=harness.replace('globalThis.__gameTest = {',wrappers);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(harness+'\nmodule.exports={createGame};\n',filename);
const{api,sandbox}=isolated.exports.createGame(),ctx=api.drawingContext;
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name)}
function setup(){api.startLevelLab(0);api.setShake(0);sandbox.STARFIGHTER_SETTINGS.reducedMotion=false;sandbox.STARFIGHTER_SETTINGS.clearCombat=false;ctx.resetTransform()}
function paintEffect(remaining,options={}){
  api.player.deltaFlash=remaining;sandbox.STARFIGHTER_SETTINGS.reducedMotion=!!options.reduced;sandbox.STARFIGHTER_SETTINGS.clearCombat=!!options.clear;ctx.trace=[];
  const rendered=api.drawDeltaEffect(),trace=ctx.trace;ctx.trace=null;return{rendered,trace};
}
const geometry=trace=>trace.filter(r=>['moveTo','lineTo'].includes(r.op)).map(r=>[r.op,...r.args]);
const visible=trace=>trace.filter(r=>['fill','stroke','fillRect','strokeRect'].includes(r.op));

check('Delta and arrival presentation paint below enemies, projectiles and the player',()=>{
  setup();api.player.deltaFlash=1.1;
  api.enemies.push({type:'wing',x:620,y:240,r:10,hp:2,maxHp:2,speed:100,phase:0,animOffset:0,cool:99,c:'#ff4f88'});
  api.enemyShots.push({x:400,y:240,r:5,vx:-150,vy:0});ctx.trace=[];api.draw();const trace=ctx.trace;ctx.trace=null;
  const layer=name=>trace.findIndex(record=>record.op==='layer'&&record.args[0]===name),delta=layer('drawDeltaEffect'),hazards=layer('drawStageHazards'),intro=layer('drawEliteIntro'),enemy=layer('drawEnemySprite'),shot=layer('drawHostileShot'),player=layer('drawPlayerAndPod');
  assert.ok(delta>=0&&delta<hazards&&hazards<intro&&intro<enemy&&enemy<shot&&shot<player);
  assert.equal(trace.filter(r=>r.op==='layer'&&r.args[0]==='drawDeltaEffect').length,1);
  assert.equal(trace.filter(r=>r.op==='layer'&&r.args[0]==='drawEliteIntro').length,1,'Foreground must not repaint the intro over actors');
  assert.equal(trace.slice(enemy).filter(r=>r.op==='fillRect'&&r.composite==='screen'&&r.args[0]===0&&r.args[1]===0&&r.args[2]===960&&r.args[3]===540).length,0,'No topmost full-screen screen wash may cover actors');
});
check('Delta uses bounded open energy fronts instead of a full-screen flash or closed ring',()=>{
  setup();const first=paintEffect(1.2);assert.equal(first.rendered,true);assert.equal(first.trace.filter(r=>r.op==='arc'||r.op==='ellipse'||r.op==='fillRect').length,0);
  const origin=[api.player.x,api.player.y];for(const row of geometry(first.trace)){
    assert.ok(row.slice(1).every(Number.isFinite));assert.ok(Math.abs(row[1]-origin[0])<=118);assert.ok(Math.abs(row[2]-origin[1])<=50);
  }
  const later=paintEffect(.8);assert.notDeepEqual(geometry(later.trace),geometry(first.trace),'The fragments should travel away from the launch point');
  assert.ok(visible(later.trace).every(r=>r.alpha<=.36));const quiet=paintEffect(.4);assert.equal(quiet.rendered,false);assert.equal(visible(quiet.trace).length,0);assert.equal(api.player.deltaFlash,.4,'Presentation must not shorten the ability timer');
});
check('the shock front remains at its launch origin when the fighter dodges',()=>{
  setup();api.player.dose=100;const origin=[api.player.x,api.player.y];api.activateDelta();const first=geometry(paintEffect(1.1).trace);
  api.player.x+=180;api.player.y-=85;const moved=geometry(paintEffect(1.1).trace);assert.deepEqual(moved,first);
  api.player.dose=100;api.activateDelta();const next=geometry(paintEffect(1.1).trace);assert.notDeepEqual(next,first,'A new use must capture its own world origin');
  for(let i=0;i<next.length;i++){assert.ok(Math.abs(next[i][1]-first[i][1]-180)<1e-8);assert.ok(Math.abs(next[i][2]-first[i][2]+85)<1e-8)}
  assert.deepEqual([api.player.x,api.player.y],[origin[0]+180,origin[1]-85]);
});
check('Reduced Motion stays local and steady while Clear Combat reduces intensity',()=>{
  setup();const a=paintEffect(1.2,{reduced:true}),b=paintEffect(1.1,{reduced:true});assert.deepEqual(geometry(a.trace),geometry(b.trace));assert.equal(a.trace.some(r=>r.op==='stroke'||r.op==='arc'),false);assert.ok(visible(a.trace).every(r=>r.alpha<=.13));
  assert.equal(paintEffect(.8,{reduced:true}).rendered,false);
  const normal=paintEffect(1.05),clear=paintEffect(1.05,{clear:true}),normalPeak=Math.max(...visible(normal.trace).map(r=>r.alpha)),clearPeak=Math.max(...visible(clear.trace).map(r=>r.alpha));assert.ok(clearPeak<normalPeak*.5);assert.ok(visible(clear.trace).every(r=>r.shadowBlur<=2));
});
check('Delta drawing preserves combat state, timing and target canvas state',()=>{
  setup();api.player.dose=100;api.player.inv=.73;const hp=api.player.hp,inv=api.player.inv,keys=Object.keys(api.player).sort();
  api.enemyShots.push({x:600,y:220,r:5,vx:-160,vy:0});api.enemies.push({x:620,y:240,r:10,hp:2,maxHp:2,type:'wing'});api.activateDelta();
  assert.equal(api.player.deltaFlash,1.2);assert.equal(api.player.dose,0);assert.equal(api.player.hp,hp);assert.equal(api.player.inv,inv);assert.equal(api.enemyShots.length,0);assert.equal(api.enemies[0].hp,0);assert.deepEqual(Object.keys(api.player).sort(),keys,'Origin must remain outside player/checkpoint fields');
  const before=JSON.stringify({player:api.player,enemies:api.enemies,shots:api.enemyShots});ctx.globalAlpha=.37;ctx.globalCompositeOperation='multiply';ctx.filter='hue-rotate(15deg)';ctx.shadowBlur=7;ctx.translate(3,5);const matrix=ctx.getTransform();api.drawDeltaEffect();
  assert.equal(JSON.stringify({player:api.player,enemies:api.enemies,shots:api.enemyShots}),before);assert.equal(ctx.globalAlpha,.37);assert.equal(ctx.globalCompositeOperation,'multiply');assert.equal(ctx.filter,'hue-rotate(15deg)');assert.equal(ctx.shadowBlur,7);for(const key of['a','b','c','d','e','f'])assert.equal(ctx.getTransform()[key],matrix[key]);
});
check('Delta retains the existing boss-core damage and player protection rules',()=>{
  api.startBossLab(1);const enemy=api.boss;enemy.intro=0;const nodes=api.activeWeakNodes(enemy),before=nodes.map(node=>({hp:node.hp,max:node.max})),hp=enemy.hp;api.player.dose=100;api.player.inv=.53;api.activateDelta();
  let dealt=0;nodes.forEach((node,index)=>{const amount=Math.min(before[index].hp,Math.max(5,before[index].max*.22));dealt+=amount;assert.ok(Math.abs(node.hp-(before[index].hp-amount))<1e-8)});
  assert.ok(Math.abs(enemy.hp-(hp-dealt))<1e-8);assert.equal(api.player.inv,.53);assert.equal(api.player.dose,0);assert.equal(api.player.deltaFlash,1.2);
});
check('elite arrival card is compact and keeps Reduced Motion geometry steady',()=>{
  api.startMiniBossLab(0);const enemy=api.miniBoss;enemy.introMax=2.6;sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;
  const card=remaining=>{enemy.intro=remaining;ctx.trace=[];api.drawEliteIntro();const trace=ctx.trace;ctx.trace=null;return trace;};
  const early=card(2.57),later=card(2.45);assert.deepEqual(geometry(early),geometry(later));const points=geometry(early);const xs=points.map(p=>p[1]),ys=points.map(p=>p[2]);assert.ok(Math.max(...xs)-Math.min(...xs)<=360);assert.ok(Math.max(...ys)-Math.min(...ys)<=90);assert.ok(Math.max(...ys)<=240);
  assert.equal(early.some(r=>r.op==='fillRect'&&r.args[2]>700),false,'Arrival must not paint the old full-width central curtain');
});
console.log('Delta/arrival presentation: '+checks+' checks passed.');
