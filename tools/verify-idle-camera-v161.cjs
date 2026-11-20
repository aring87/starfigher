#!/usr/bin/env node
'use strict';
// Native screen transitions and actual draw transform, in private VM storage.
// Capture is at Delta rendering entry, immediately after camera translation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline'),sourceName=baseline?'artifacts/idle-camera-v160-baseline-game.js':'game.js',production=fs.readFileSync(path.join(root,sourceName),'utf8');
assert.equal(production.split('function drawDeltaEffect(){').length,2,'Native draw capture hook must remain unique.');
const captured=production.replace('function drawDeltaEffect(){','function drawDeltaEffect(){globalThis.__idleCameraTransforms.push({...ctx.getTransform()});');
const file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(captured)+';');
support=support.replace('  globalThis.__gameTest = {','  globalThis.__gameTest = {get cameraSettings(){return settings},');
const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};',file);
const{createGame}=isolated.exports,results=[];
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.message)}}
function fresh(){const g=createGame({ruleset:'streamlined-v1'});g.sandbox.__idleCameraTransforms=[];let seed=161;g.sandbox.__idleCameraRandom=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};vm.runInContext('Math.random=globalThis.__idleCameraRandom',vm.createContext(g.sandbox));g.api.start('story');return g}
function resources(g){const a=g.api;return JSON.stringify({hp:a.player.hp,maxHp:a.player.maxHp,shield:a.player.shield,dose:a.player.dose,charge:a.player.charge,shake:a.shake,time:a.time,elapsed:a.runElapsed,wave:a.wave,runStats:a.runStats,garage:a.garage,storage:[...g.storage]})}
function frames(g,count=24,viaLoop=false){g.sandbox.__idleCameraTransforms.length=0;for(let n=0;n<count;n++){if(viaLoop)g.api.loop(1000+n*110);else g.api.draw()}const raw=g.sandbox.__idleCameraTransforms;assert.equal(raw.length,count,'Each actual draw must be captured.');return Array.from(raw,m=>({x:m.e/m.a,y:m.f/m.d}))}
function enter(g,state){const a=g.api;if(state==='paused')a.pause();else if(state==='skilltree')a.openSkillTree();else if(state==='upgrade')a.presentTacticalRetrofit(()=>{});else if(state==='gameover'){a.player.hp=1;a.player.shield=0;a.player.inv=0;a.damage(99)}else if(state==='art'){a.startBossLab(1);a.openArtInspection()}assert.equal(a.state,state)}
check('playing retains nonzero clamped jitter and the draw does not decay its held shake',()=>{
 const g=fresh(),a=g.api;a.setShake(27);const before=resources(g),samples=frames(g,40);assert.ok(samples.every(p=>Math.abs(p.x)<=10&&Math.abs(p.y)<=10));assert.ok(samples.some(p=>Math.abs(p.x)>.001||Math.abs(p.y)>.001));assert.ok(new Set(samples.map(p=>p.x+','+p.y)).size>1);assert.equal(resources(g),before);return{samples:samples.length,maximum:10};
});
check('playing below the clamp retains its authored shake amplitude',()=>{
 const g=fresh();g.api.setShake(3);const samples=frames(g);assert.ok(samples.every(p=>Math.abs(p.x)<=3&&Math.abs(p.y)<=3));assert.ok(samples.some(p=>Math.abs(p.x)>.001||Math.abs(p.y)>.001));return{samples:samples.length,maximum:3};
});
check('Reduced Motion suppresses camera displacement in active combat without consuming shake',()=>{
 const g=fresh();g.api.cameraSettings.reducedMotion=true;g.api.setShake(27);const before=resources(g),samples=frames(g);assert.ok(samples.every(p=>p.x===0&&p.y===0));assert.equal(resources(g),before);return{samples:samples.length};
});
for(const state of['paused','skilltree','upgrade','gameover','art'])check(state+' stays still across repeated native draws with a nonzero held shake',()=>{
 const g=fresh();enter(g,state);g.api.setShake(27);const before=resources(g),samples=frames(g,24,true);assert.ok(samples.every(p=>p.x===0&&p.y===0),'Idle camera moved: '+JSON.stringify(samples.slice(0,3)));assert.equal(g.api.state,state);assert.equal(resources(g),before);return{nativeScreen:state,samples:samples.length,heldShake:g.api.shake};
});
check('resuming Pause restores active shake rather than discarding its remaining effect',()=>{
 const g=fresh(),a=g.api;a.setShake(7);a.pause();const paused=frames(g);assert.ok(paused.every(p=>p.x===0&&p.y===0));a.pause();assert.equal(a.state,'playing');assert.equal(a.shake,7);const resumed=frames(g);assert.ok(resumed.some(p=>Math.abs(p.x)>.001||Math.abs(p.y)>.001));assert.ok(resumed.every(p=>Math.abs(p.x)<=7&&Math.abs(p.y)<=7));return{pausedSamples:paused.length,resumedSamples:resumed.length};
});
const failed=results.filter(r=>!r.passed).length,label=baseline?'v160-baseline':'v161',report={source:sourceName,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,sourceName))).digest('hex'),baseline,passed:results.length-failed,failed,results,limits:'Actual game draw transforms and screen transitions with mocked canvas/audio and private storage. No browser-frame-time, GPU, visual-quality or physical-controller claim.'};
fs.writeFileSync(path.join(root,'artifacts/idle-camera-'+label+'-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} idle camera checks passed, ${failed} failed${baseline?' (historical baseline)':''}`);if(failed&&!baseline)process.exitCode=1;
