#!/usr/bin/env node
'use strict';
// Exercise production painters in private VM storage. Traces prove priority,
// geometry and state ownership; real screenshots are still needed for judgment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');support=support.slice(0,support.indexOf('\ntest('));
const injected=`
  for(const name of ['drawCombatBackdrop','drawStageForeground','drawStageHazards','drawEnemySprite','drawHostileShot','drawPlayerAndPod','drawForeground','drawBossStatus','drawStageTitle','drawDamageSmoke']){
    const original=eval(name);eval(name+'=function(...args){if(Array.isArray(ctx.trace))ctx.trace.push({op:"layer",args:["'+name+'"],alpha:ctx.globalAlpha,point:args[0]&&{x:args[0].x,y:args[0].y}});return original(...args)}');
  }
  for(const name of ['fill','stroke','fillRect','drawImage']){
    const original=ctx[name];ctx[name]=function(...args){if(Array.isArray(ctx.trace))ctx.trace.push({op:'paintStyle',method:name,args,alpha:ctx.globalAlpha,fillStyle:ctx.fillStyle,strokeStyle:ctx.strokeStyle,lineWidth:ctx.lineWidth,shadowBlur:ctx.shadowBlur});return original.apply(ctx,args)};
  }
  globalThis.__gameTest={drawCombatBackdrop,drawHostileShot,drawPlayerShot,buildCombatReadabilityAnchors,smokeReadabilityScale,
`;
assert.ok(support.includes('globalThis.__gameTest = {'));support=support.replace('globalThis.__gameTest = {',injected);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const{createGame}=isolated.exports,results=[],plain=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function setup(){const g=createGame({ruleset:'streamlined-v1'});g.api.start('story');g.api.player.pod.owned=false;g.api.player.bits=0;g.api.player.shield=0;g.api.player.inv=0;g.api.setShake(0);g.sandbox.STARFIGHTER_SETTINGS.clearCombat=false;g.sandbox.STARFIGHTER_SETTINGS.reducedMotion=false;return g}
function paint(g,fn=()=>g.api.draw()){const c=g.api.drawingContext;c.resetTransform();c.trace=[];try{fn();return c.trace}finally{c.trace=null}}
const layer=(trace,name)=>trace.findIndex(record=>record.op==='layer'&&record.args[0]===name);
const geometry=trace=>trace.filter(r=>['arc','ellipse','moveTo','lineTo','fillRect','drawImage'].includes(r.op)).map(r=>({op:r.op,args:r.args,matrix:r.matrix}));
function smoke(x,y,extra={}){return{smoke:true,damageSmoke:true,x,y,s:8,life:1,max:1,turn:0,...extra}}
const rgb=color=>{const match=String(color).match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);return match?[0,2,4].map(at=>parseInt(match[1].slice(at,at+2),16)):null};
const brightness=color=>{const c=rgb(color);return c?Math.max(...c):NaN};

check('decorative edge scenery stays beneath combat at both flight boundaries in all ten environments',()=>{
 const g=setup(),a=g.api;let frames=0;
 for(let stage=0;stage<10;stage++)for(const edge of['top','bottom']){
  a.startLevelLab(stage);a.player.y=edge==='top'?45:a.logicalSize[1]-45;a.player.inv=0;a.player.pod.owned=false;a.player.bits=0;
  a.enemies.push({type:'wing',x:650,y:a.player.y,r:14,hp:5,maxHp:5,speed:0,phase:0,animOffset:0,cool:99,c:'#ff4f88'});a.enemyShots.push({x:400,y:a.player.y,r:5,vx:-150,vy:0});
  const trace=paint(g),scenery=layer(trace,'drawStageForeground'),hazard=layer(trace,'drawStageHazards'),enemy=layer(trace,'drawEnemySprite'),shot=layer(trace,'drawHostileShot'),fighter=layer(trace,'drawPlayerAndPod'),hud=layer(trace,'drawForeground');
  assert.ok(scenery>=0&&scenery<hazard&&hazard<enemy&&enemy<shot&&shot<fighter&&fighter<hud,`Stage${stage+1} ${edge}: scenery cannot cover a collision object`);
  assert.equal(trace.filter(r=>r.op==='layer'&&r.args[0]==='drawStageForeground').length,1,'Scenery must not be repainted over gameplay');
  assert.ok(layer(trace,'drawBossStatus')>fighter);assert.ok(layer(trace,'drawStageTitle')>fighter);frames++;
 }return{environmentBoundaryFrames:frames};
});

check('combat scenery has a restrained default veil and a stronger optional Clear Combat veil',()=>{
 const g=setup(),a=g.api,canvas=a.logicalSize;
 function veil(clear){g.sandbox.STARFIGHTER_SETTINGS.clearCombat=clear;const trace=paint(g,()=>a.drawCombatBackdrop());return trace.filter(r=>r.op==='paintStyle'&&r.method==='fillRect'&&r.args[0]===0&&r.args[1]===0&&r.args[2]===canvas[0]&&r.args[3]===canvas[1]).at(-1)}
 const standard=veil(false),clear=veil(true);assert.ok(standard&&clear);for(const v of[standard,clear])assert.ok(brightness(v.fillStyle)<32,'The backdrop separation must be dark, not a competing flash');
 const opacity=v=>v.alpha*(String(v.fillStyle).length===9?parseInt(v.fillStyle.slice(7),16)/255:1),normalOpacity=opacity(standard),clearOpacity=opacity(clear);
 assert.ok(normalOpacity>=.1&&normalOpacity<=.25,'Keep stage artwork visible by default');assert.ok(clearOpacity>=.45&&clearOpacity<=.6);assert.ok(clearOpacity>normalOpacity*2);
});

check('round and piercing projectiles keep different silhouettes with dark and bright edge contrast',()=>{
 const g=setup(),a=g.api;
 for(const clear of[false,true])for(const piercing of[false,true]){
  g.sandbox.STARFIGHTER_SETTINGS.clearCombat=clear;const shot={x:420,y:230,r:5,vx:-130,vy:17,piercing,damage:1,life:3},before=JSON.stringify(shot),trace=paint(g,()=>a.drawHostileShot(shot));
  assert.equal(JSON.stringify(shot),before,'Painting cannot enlarge the hit radius or change flight');
  const strokes=trace.filter(r=>r.op==='paintStyle'&&r.method==='stroke');assert.ok(strokes.length>=2,'Use separate dark/bright edges for bright and dark scenery');
  const dark=strokes.findIndex(r=>brightness(r.strokeStyle)<=40&&r.lineWidth>=4),rim=strokes.findIndex((r,index)=>index>dark&&brightness(r.strokeStyle)>=180&&r.lineWidth<=2.1);assert.ok(dark>=0&&rim>dark);
  if(piercing){assert.equal(trace.some(r=>r.op==='arc'),false);assert.ok(trace.filter(r=>r.op==='lineTo').length>=3,'Piercing threats retain their directional diamond');}
  else{const body=trace.find(r=>r.op==='arc');assert.ok(body);near(body.args[0],shot.x);near(body.args[1],shot.y);near(body.args[2],shot.r);assert.equal(trace.some(r=>r.op==='lineTo'),false)}
 }
 for(const extra of[{dead:true},{warn:.4}])assert.equal(paint(g,()=>a.drawHostileShot({x:400,y:200,r:5,vx:-100,vy:0,...extra})).filter(r=>r.op==='paintStyle').length,0,'Pending or dead shots must not masquerade as active threats');
});

check('invulnerability keeps the native fighter visible and charging adds no circle or extra sprite',()=>{
 const g=setup(),a=g.api,c=a.drawingContext;a.player.inv=2;
 const sprite=time=>{a.setTime(time);return paint(g,()=>a.drawPlayerAndPod()).filter(r=>r.op==='drawImage'&&r.image?.src==='assets/combat-sprite-atlas.png'&&r.args[2]===0)};
 let low=1,high=0;for(let tick=0;tick<60;tick++){const rows=sprite(tick/60);assert.equal(rows.length,1);low=Math.min(low,rows[0].alpha);high=Math.max(high,rows[0].alpha)}assert.ok(low>=.73&&high<=.95,'The fighter may pulse gently but must remain readable');assert.ok(high-low>.05);
 g.sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;near(sprite(0)[0].alpha,sprite(.37)[0].alpha);assert.ok(sprite(1)[0].alpha>=.85);
 a.player.inv=0;a.setTime(.2);let first;for(const charge of[0,.5,1]){a.player.charge=charge;const trace=paint(g,()=>a.drawPlayerAndPod());assert.equal(trace.some(r=>r.op==='arc'),false,'Do not restore the discarded charge circle');const shape=geometry(trace);if(first)assert.deepEqual(shape,first);else first=shape}
 c.trace=null;
});

check('smoke thins near the fighter with a smooth bounded falloff and leaves sparks unchanged',()=>{
 const g=setup(),a=g.api,anchors=a.buildCombatReadabilityAnchors(),p=smoke(a.player.x,a.player.y),before=JSON.stringify(p),scales=[];
 for(const distance of[0,8,20,45,90,180])scales.push(a.smokeReadabilityScale({...p,x:p.x+distance},anchors));
 assert.ok(scales[0]<.5,'Smoke must yield at the collision-bearing ship');assert.equal(scales.at(-1),1,'Distant damage smoke should remain visible');for(let index=0;index<scales.length;index++){assert.ok(scales[index]>=.18&&scales[index]<=1);if(index)assert.ok(scales[index]>=scales[index-1]-1e-9)}
 const samples=Array.from({length:120},(_,i)=>a.smokeReadabilityScale({...p,x:p.x+i},anchors));assert.ok(samples.some(v=>v>.25&&v<.95),'Use a feathered transition rather than a visible cutout');assert.ok(samples.slice(1).every((v,i)=>Math.abs(v-samples[i])<.1));
 assert.equal(a.smokeReadabilityScale({x:p.x,y:p.y,s:8,life:1,max:1},anchors),1,'Impact sparks are not smoke');assert.equal(JSON.stringify(p),before);
});

check('exposed-core protection follows registered anatomy across every boss family and animation pose',()=>{
 const g=setup(),a=g.api;let sampled=0,phases=0;
 const encounters=[...Array.from({length:10},(_,id)=>['mini',id]),...Array.from({length:10},(_,id)=>['boss',id]),['epic',0],['epic',1]];
 for(const[kind,id]of encounters){if(kind==='mini')a.startMiniBossLab(id);else if(kind==='boss')a.startBossLab(id);else a.startEpicBossLab(id);const e=kind==='mini'?a.miniBoss:a.boss;e.x=710;e.y=270;e.intro=0;e.phaseFlash=0;e.weakOpen=true;
  for(let phase=1;phase<=(kind==='mini'?1:kind==='epic'?4:2);phase++){if(kind!=='mini')e.phase=phase;phases++;for(const clock of[.2,.9,2.2]){e.clock=clock;const nodes=a.activeWeakNodes(e),anchors=a.buildCombatReadabilityAnchors();for(const node of nodes.filter(n=>!n.destroyed)){const point=a.worldWeakNode(e,node);assert.ok(anchors.some(anchor=>Math.hypot(anchor.x-point.x,anchor.y-point.y)<1e-7),`${kind}${id} phase${phase}: aperture must track the real hit geometry`);assert.ok(a.smokeReadabilityScale(smoke(point.x,point.y),anchors)<.5);sampled++}}}
 }return{encounters:encounters.length,phases,registeredCoreSamples:sampled};
});

check('sealed, destroyed, hidden and protected cores never create misleading smoke openings',()=>{
 const g=setup(),a=g.api;a.startBossLab(3);const e=a.boss;e.x=710;e.y=270;e.intro=0;e.weakOpen=true;const nodes=a.activeWeakNodes(e);
 const coreAnchors=()=>a.buildCombatReadabilityAnchors().filter(anchor=>Math.hypot(anchor.x-a.player.x,anchor.y-a.player.y)>1);
 assert.equal(coreAnchors().length,nodes.length);e.weakOpen=false;assert.equal(coreAnchors().length,0);e.weakOpen=true;
 for(const[field,value]of[['intro',1],['phaseTransition',.2],['hidden',true],['ritual',{}]]){const prior=e[field];e[field]=value;assert.equal(coreAnchors().length,0,field);e[field]=prior}
 nodes.forEach(n=>n.destroyed=true);assert.equal(coreAnchors().length,0);assert.equal(a.buildCombatReadabilityAnchors().length,1,'The living fighter still needs smoke separation');
});

check('actual frame painting thins smoke over ship and exposed cores while preserving distant smoke and sparks',()=>{
 const g=setup(),a=g.api;a.startBossLab(1);const e=a.boss;e.x=710;e.y=270;e.intro=0;e.weakOpen=true;a.player.inv=0;a.player.pod.owned=false;a.player.bits=0;a.particles.length=0;
 const core=a.worldWeakNode(e,a.activeWeakNodes(e)[0]),points=[{x:a.player.x,y:a.player.y},{x:core.x,y:core.y},{x:400,y:70}];for(const p of points)a.particles.push(smoke(p.x,p.y));a.particles.push({x:a.player.x,y:a.player.y,s:3,life:1,max:1,c:'#abcdef'});
 const trace=paint(g),smokes=trace.filter(r=>r.op==='layer'&&r.args[0]==='drawDamageSmoke');assert.equal(smokes.length,3);assert.ok(smokes[0].alpha<smokes[2].alpha*.5);assert.ok(smokes[1].alpha<smokes[2].alpha*.5);assert.ok(smokes[2].alpha>.3,'Damage smoke should remain visible away from essentials');
 const spark=trace.find(r=>r.op==='paintStyle'&&r.method==='fillRect'&&r.fillStyle==='#abcdef');assert.ok(spark);near(spark.alpha,1);assert.ok(layer(trace,'drawHostileShot')===-1||layer(trace,'drawHostileShot')>layer(trace,'drawDamageSmoke'));
});

check('isolated Art Inspector shows unattenuated material smoke without battlefield veiling',()=>{
 const g=setup(),a=g.api;a.startBossLab(1);a.openArtInspection();a.setInspectionMaterial('damaged');const e=a.boss,point=a.worldWeakNode(e,a.activeWeakNodes(e)[0]);e.weakOpen=true;a.particles.length=0;a.particles.push(smoke(point.x,point.y));const trace=paint(g);
 assert.equal(layer(trace,'drawCombatBackdrop'),-1,'Studio inspection must preserve the chosen backdrop');const puff=trace.find(r=>r.op==='layer'&&r.args[0]==='drawDamageSmoke');assert.ok(puff);assert.ok(puff.alpha>.3,'Inspection must show full material smoke for art review');
 a.closeArtInspection();
});

check('readability painters preserve canvas ownership, combat resources, saves and collision geometry',()=>{
 const g=setup(),a=g.api,c=a.drawingContext,shot={x:420,y:230,r:5,vx:-130,vy:17,piercing:true,damage:1,life:3};a.player.charge=.7;a.player.dose=52;
 const before=JSON.stringify({player:a.player,checkpoint:a.profile.checkpoint,garage:a.garage,shot}),p=smoke(a.player.x,a.player.y),pBefore=JSON.stringify(p);
 for(const draw of[()=>a.drawCombatBackdrop(),()=>a.drawHostileShot(shot),()=>a.drawPlayerAndPod()]){c.resetTransform();c.translate(4,7);c.globalAlpha=.37;c.globalCompositeOperation='multiply';c.filter='hue-rotate(15deg)';c.shadowBlur=7;c.lineWidth=3;const transform=c.getTransform();draw();near(c.globalAlpha,.37);assert.equal(c.globalCompositeOperation,'multiply');assert.equal(c.filter,'hue-rotate(15deg)');assert.equal(c.shadowBlur,7);assert.equal(c.lineWidth,3);for(const key of['a','b','c','d','e','f'])near(c.getTransform()[key],transform[key]);}
 a.smokeReadabilityScale(p,a.buildCombatReadabilityAnchors());assert.equal(JSON.stringify(p),pBefore);assert.equal(JSON.stringify({player:a.player,checkpoint:a.profile.checkpoint,garage:a.garage,shot}),before);
});

const passed=results.filter(r=>r.passed).length,failed=results.length-passed;
fs.writeFileSync(path.join(root,'artifacts/combat-readability-audit.json'),JSON.stringify({scope:'Untouched streamlined production source; real drawing paths in isolated VM storage. GPU screenshots and human contrast review remain separate.',passed,failed,results},null,2)+'\n');
console.log(`${passed} combat readability checks passed, ${failed} failed`);if(failed)process.exitCode=1;
