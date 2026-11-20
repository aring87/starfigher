#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
if(!process.argv.some(a=>a.startsWith('--candidate=')))process.argv.push('--candidate=steady-exposure');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'measure-boss-aim-v153.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('const started=Date.now(),rows=[];'));
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={fresh,builds,HZ,dt,candidate,sourceSelection,sourceHashes};',file);
const {fresh,builds,HZ,dt,candidate,sourceSelection,sourceHashes}=m.exports,rows=[];
for(const phase of[1,2]){
 let normalTrace=null;
 for(const reduced of[false,true]){
  const {api,game}=fresh(builds[0],1,'boss',true,1103),b=api.boss;game.sandbox.STARFIGHTER_SETTINGS.reducedMotion=reduced;
  b.phase=phase;if(phase===2)b.hp=b.max*.5;
  let boundaries=0,exposedTicks=0,closedTicks=0,maxStep=0,maxBoundaryVelocityStep=0,maxVelocityStep=0,previousVelocity=null;const trace=[];
  for(let tick=0;tick<30*HZ;tick++){
   const x=b.x,y=b.y,clock=b.clock,angle=b.visualAngle,phaseY=b.motionPhaseY,open=b.weakOpen;
   const tempo=b.intro>0?1:b.queuedAttack||b.cool<.3?.42:1,response=b.intro>0?1:b.threat?.movementScale||1;
   api.update(dt);
   const displacement=Math.hypot(b.x-x,b.y-y),velocity=[(b.x-x)/dt,(b.y-y)/dt],velocityStep=previousVelocity?Math.hypot(velocity[0]-previousVelocity[0],velocity[1]-previousVelocity[1]):0;
   maxStep=Math.max(maxStep,displacement);maxVelocityStep=Math.max(maxVelocityStep,velocityStep);
   assert.ok(displacement<=380*dt+1e-8,'Motion respects the existing per-step speed bound');
   assert.ok(Math.abs(b.clock-clock-dt)<1e-8,'Exposure must not freeze animation or encounter clocks');
   if(Number.isFinite(phaseY)){
    const scale=['steady-exposure','live'].includes(candidate)&&open?.5:1,expected=dt*(phase===1?.72:1.18)*scale*tempo*response;
    assert.ok(Math.abs(b.motionPhaseY-phaseY-expected)<1e-8,'Only the accumulated movement phase rate changes during exposure');
   }
   if(open)exposedTicks++;else closedTicks++;
   if(open!==b.weakOpen){boundaries++;maxBoundaryVelocityStep=Math.max(maxBoundaryVelocityStep,velocityStep)}
   if(reduced)assert.equal(b.visualAngle,0,'Reduced Motion disables banking');
   trace.push([b.x,b.y,b.clock,b.motionPhaseY]);previousVelocity=velocity;
  }
  assert.ok(boundaries>=8&&exposedTicks>0&&closedTicks>0,'Natural opening/closing boundaries were exercised');
  if(reduced)assert.deepEqual(trace,normalTrace,'Reduced Motion changes presentation only');else normalTrace=trace;
  rows.push({phase,reduced,boundaries,exposedTicks,closedTicks,maxStep,maxBoundaryVelocityStep,maxVelocityStep});
 }
}
fs.writeFileSync(path.join(root,'artifacts/bloodstar-motion-'+candidate+'-v153.json'),JSON.stringify({candidate,sourceSelection,sourceHashes,rows},null,2)+'\n');
console.log(JSON.stringify({candidate,sourceSelection,sourceHashes,rows},null,2));console.log('PASS 4 natural 30-second movement traces, 14,400 native updates; positions bounded, movement phase continuous, full clocks preserved, Reduced Motion paths identical.');
