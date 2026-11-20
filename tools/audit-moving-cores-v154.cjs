#!/usr/bin/env node
'use strict';
// Read-only native frame-displacement census. No production or pilot writes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace('updateMiniBossMovement,','updateMiniBossMovement,sweptHit,bossDamageAllowed,armoredHits,');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);
const rows=[],dt=1/120,seconds=20;
function distanceHit(shot,old,current){
 const relative={...shot,px:shot.px-old.x,py:shot.py-old.y,x:shot.x-current.x,y:shot.y-current.y};
 const dx=relative.x-relative.px,dy=relative.y-relative.py,l=dx*dx+dy*dy,u=l?Math.max(0,Math.min(1,-(relative.px*dx+relative.py*dy)/l)):0;
 return Math.hypot(relative.px+dx*u,relative.py+dy*u)<shot.r+current.r;
}
for(const family of['mini','main','epic'])for(let type=0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='mini'?1:family==='main'?2:4);phase++){
 const {api:a}=m.exports.createGame({ruleset:'streamlined-v1'});
 if(family==='mini')a.startMiniBossLab(type);else if(family==='main')a.startBossLab(type);else a.startEpicBossLab(type);
 const e=family==='mini'?a.miniBoss:a.boss;e.phase=phase;e.hp=e.max*(family==='epic'?1-(phase-1)*.25:phase===2?.5:1);
 a.player.inv=1e6;a.player.pod.owned=false;
 let maxStep=0,maxExposedStep=0,maxExposedAxis=0,exposedSteps=0,grazes=0,relativeGrazes=0,centralMisses=0,worst=null;
 for(let tick=0;tick<seconds*120;tick++){
  const nodes=a.activeWeakNodes(e),old=nodes.map(n=>a.worldWeakNode(e,n)),allowed=a.bossDamageAllowed(e)&&e.weakOpen;
  a.update(dt);
  if((family==='mini'?a.miniBoss:a.boss)!==e)throw Error('Fixture ended unexpectedly');
  const current=a.activeWeakNodes(e),open=allowed&&a.bossDamageAllowed(e)&&e.weakOpen&&nodes===current;
  current.forEach((n,i)=>{
   const w=a.worldWeakNode(e,n),before=old[i],d=Math.hypot(w.x-before.x,w.y-before.y);maxStep=Math.max(maxStep,d);
   if(!open||n.destroyed)return;exposedSteps++;
   if(d>maxExposedStep){maxExposedStep=d;worst={seconds:tick/120,node:i,before,current:w}}maxExposedAxis=Math.max(maxExposedAxis,Math.abs(w.y-before.y));
   for(const offset of[-.98,-.9,-.5,0,.5,.9,.98]){
    const midX=(w.x+before.x)/2,midY=(w.y+before.y)/2,shot={px:midX-620*dt/2,x:midX+620*dt/2,py:midY+offset*(w.r+3),y:midY+offset*(w.r+3),r:3};
    if(distanceHit(shot,before,w)){relativeGrazes++;if(!a.sweptHit(shot,w)){grazes++;if(offset===0)centralMisses++}}
   }
  });
 }
 rows.push({family,type,phase,name:e.def.name,maxStep,maxExposedStep,maxExposedAxis,exposedSteps,syntheticBoundaryMisses:grazes,syntheticRelativeHits:relativeGrazes,centralMisses,worst});
 console.log(JSON.stringify({family,type,phase,maxExposedStep:+maxExposedStep.toFixed(3),centralMisses,boundaryMisses:grazes}));
}
const output={sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'game.js'))).digest('hex'),secondsPerTrace:seconds,rows,limits:['Native 120 Hz updates; no damage or firing and invulnerability isolates motion.','Synthetic shot probes deliberately test core boundaries and are not a player miss rate.','Linear relative sweep is a comparison model, not assumed correct through native sprite pose changes.','No production edits.']};
fs.writeFileSync(path.join(root,'artifacts/moving-core-census-v154.json'),JSON.stringify(output,null,2)+'\n');
console.log('PASS '+rows.length+' natural motion traces across all22encounters; no real storage or production edits.');
