#!/usr/bin/env node
'use strict';

// Presentation-only checks with isolated browser/storage mocks. These trace
// actual shipped drawing helpers; browser screenshots cover visual judgment.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const filename=path.join(__dirname,'verify-game.cjs');
let harness=fs.readFileSync(filename,'utf8');
harness=harness.slice(0,harness.indexOf('\ntest('));
assert.ok(harness.includes('globalThis.__gameTest = {'));
harness=harness.replace('globalThis.__gameTest = {','globalThis.__gameTest = { drawEnemySprite,');
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
isolated._compile(harness+'\nmodule.exports={createGame};\n',filename);
const{api,sandbox,document}=isolated.exports.createGame(),ctx=api.drawingContext;
// Cached endpoint canvases are immutable. Retain their original bake trace,
// while intermediate scratch canvases are cleared before each observed draw.
const createElement=document.createElement;document.createElement=tag=>{const node=createElement(tag);if(tag==='canvas')node.getContext('2d').trace=[];return node};
const enemy=(type,extra={})=>({type,x:650,y:230,r:type==='turret'?17:14,hp:5,maxHp:5,speed:70,phase:.1,animOffset:0,cool:1.2,c:'#ff5a97',...extra});
function paint(e,time=0,reduced=false){
  api.setTime(time);sandbox.STARFIGHTER_SETTINGS.reducedMotion=reduced;
  for(const surface of api.drawEnemySprite.frameBuffers?.values()||[])surface.getContext('2d').trace=[];
  ctx.trace=[];ctx.resetTransform();api.drawEnemySprite(e);
  const body=ctx.trace.filter(record=>record.op==='drawImage'),surface=body[0]?.image,native=(surface?.getContext('2d').trace||[]).filter(record=>record.op==='drawImage');
  ctx.trace=null;return{body,native,surface};
}
const charge=paint=>paint.native.filter(record=>record.args[1]===record.image.naturalWidth/4).reduce((sum,record)=>sum+record.alpha,0);
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name)}

check('turret charge follows the existing cooldown and eligibility, independent of idle time',()=>{
  for(const time of[0,.2,.65,1.3,4.1]){
    assert.equal(charge(paint(enemy('turret'),time)),0,'Idle time must not show the charged muzzle');
    assert.ok(Math.abs(charge(paint(enemy('turret',{cool:.19}),time))-.5)<1e-9);
    assert.ok(charge(paint(enemy('turret',{cool:.001}),time))>.999);
    assert.equal(charge(paint(enemy('turret',{cool:2}),time)),0,'The muzzle must release when the real cooldown resets');
    assert.equal(charge(paint(enemy('turret',{cool:undefined}),time)),0,'A presentation without a firing clock must remain idle');
    assert.equal(charge(paint(enemy('turret',{x:api.logicalSize[0]-50,cool:.01}),time)),0,'An ineligible entrant must not hold a fake charge');
  }
});
check('authored turret charge reaches release and settles with its actual telegraph state',()=>{
  const turret=enemy('turret',{telegraphFire:true,fireAnim:.24,fireReleased:false});
  assert.ok(Math.abs(charge(paint(turret))-.5)<1e-9);
  turret.fireAnim=.42;assert.equal(charge(paint(turret)),1);
  turret.fireAnim=.49;turret.fireReleased=true;assert.equal(charge(paint(turret)),1);
  turret.fireAnim=.605;assert.ok(Math.abs(charge(paint(turret))-.5)<1e-9);
  turret.fireAnim=.73;assert.equal(charge(paint(turret)),0);
  turret.fireAnim=0;assert.equal(charge(paint(turret,8)),0);
});
check('pose interpolation preserves opaque armor coverage and replaces the old silhouette',()=>{
  for(const e of[enemy('wing'),enemy('drone',{fireAnim:.19}),enemy('turret',{cool:.19})]){
    const result=paint(e,.86/3.4);assert.equal(result.body.length,1,'Composite the body once rather than repainting its opaque old pose');
    assert.equal(result.native.length,2);const[base,next]=result.native;
    assert.ok(base.alpha>0&&base.alpha<1);assert.ok(next.alpha>0&&next.alpha<1);
    assert.ok(Math.abs(base.alpha+next.alpha-1)<1e-9,'Opaque common armor must remain opaque at every mix');
    assert.equal(base.composite,'source-over');assert.equal(next.composite,'lighter','Add weighted premultiplied color and alpha once');
  }
});
check('impact stays restrained and retains the native armor color',()=>{
  for(const type of['wing','drone','turret'])for(const time of[0,.13,.41,.72,1.9])for(const hitFlash of[0,.07,.12]){
    const e=enemy(type,{hitFlash}),result=paint(e,time),body=result.body[0],[a,b,c,d,x,y]=body.matrix;
    for(const scale of[Math.hypot(a,b),Math.hypot(c,d)])assert.ok(scale>=.97&&scale<=1.03,'A metal chassis must not stretch more than three percent');
    assert.ok(Math.abs(x-e.x)<=.65+1e-9);assert.equal(y,e.y);assert.equal(result.body.length,1);
    const brightness=Number(body.filter.match(/brightness\(([\d.]+)\)/)?.[1]||1),saturation=Number(body.filter.match(/saturate\(([\d.]+)\)/)?.[1]||1);
    assert.ok(brightness<=1.32+1e-9);assert.ok(saturation>=.93-1e-9,'Impact must not desaturate the whole ship to white');
  }
});
check('Reduced Motion removes chassis wobble, deformation and hit displacement',()=>{
  for(const type of['wing','drone','turret'])for(const time of[0,.13,.41,.72,1.9]){
    const e=enemy(type,{hitFlash:.12}),result=paint(e,time,true);
    assert.deepEqual(Array.from(result.body[0].matrix),[1,0,0,1,e.x,e.y]);
    assert.ok(result.body[0].filter.includes('brightness(1.2)'));
  }
});
check('drawing isolates target canvas state and never changes combat timing',()=>{
  const e=enemy('turret',{telegraphFire:true,fireAnim:.24,fireReleased:false,hitFlash:.12}),before=JSON.stringify(e);
  ctx.globalAlpha=.37;ctx.globalCompositeOperation='screen';ctx.filter='hue-rotate(15deg)';ctx.shadowBlur=7;ctx.translate(3,5);
  const matrix=ctx.getTransform();api.drawEnemySprite(e);
  assert.equal(JSON.stringify(e),before);assert.equal(ctx.globalAlpha,.37);assert.equal(ctx.globalCompositeOperation,'screen');assert.equal(ctx.filter,'hue-rotate(15deg)');assert.equal(ctx.shadowBlur,7);
  for(const key of['a','b','c','d','e','f'])assert.equal(ctx.getTransform()[key],matrix[key]);
  assert.deepEqual([...api.drawEnemySprite.frameBuffers.keys()].sort(),['drone','turret','wing']);
});
console.log('Enemy presentation: '+checks+' checks passed.');
