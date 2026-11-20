#!/usr/bin/env node
'use strict';
// Private source candidate only. Never writes game.js or browser pilot data.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),harnessFile=path.join(__dirname,'verify-game.cjs'),frozen=path.join(root,'artifacts/moving-core-v154-before.js'),live=process.argv.includes('--live'),liveRaw=live?fs.readFileSync(path.join(root,'game.js'),'utf8'):null;
if(!fs.existsSync(frozen))fs.copyFileSync(path.join(root,'game.js'),frozen);
const baselineSource=fs.readFileSync(frozen,'utf8').replace(/\r\n/g,'\n');
const candidateFunctions=`
  const weakPointFrames=new WeakMap();
  function snapshotWeakPointFrame(e,dt){
    if(!e)return;
    weakPointFrames.delete(e);
    if(state!=='playing'||!(dt>0&&dt<=.05)||!Number.isFinite(e.clock)||!bossDamageAllowed(e)||!e.weakOpen)return;
    const nodes=activeWeakNodes(e),points=new Map();
    for(const node of nodes)if(!node.destroyed)points.set(node,worldWeakNode(e,node));
    weakPointFrames.set(e,{phase:e.phase,nodes,clock:e.clock,dt,points});
  }
  function sweptWeakPointHit(shot,e,node,dt){
    const current=worldWeakNode(e,node);
    if(sweptHit(shot,current))return true;
    const frame=weakPointFrames.get(e);
    if(state!=='playing'||!(dt>0)||node.destroyed||!bossDamageAllowed(e)||!e.weakOpen||e!==boss&&e!==miniBoss||!frame||frame.phase!==e.phase||frame.nodes!==activeWeakNodes(e)||Math.abs(frame.dt-dt)>1e-8||Math.abs(e.clock-frame.clock-dt)>1e-8)return false;
    const previous=frame.points.get(node);if(!previous)return false;
    return sweptHit({px:(shot.px??shot.x)-previous.x,py:(shot.py??shot.y)-previous.y,x:shot.x-current.x,y:shot.y-current.y,r:shot.r},{x:0,y:0,r:Math.min(previous.r,current.r)});
  }
`;
function candidateSource(){
 let text=baselineSource;
 const replace=(from,to)=>{assert.ok(text.includes(from),'Missing candidate hook '+from);text=text.replace(from,to)};
 replace('  function bossDamageAllowed(e){',candidateFunctions+'\n  function bossDamageAllowed(e){');
 replace('  function update(dt){','  function update(dt){snapshotWeakPointFrame(boss||miniBoss,dt);');
 replace('sweptHit(b,worldWeakNode(e,n))','sweptWeakPointHit(b,e,n,dt)');
 const ending="    if(canDamage&&e.weakOpen&&player.pod.owned){const node=nodes.find(n=>!n.destroyed&&hit(player.pod,worldWeakNode(e,n)));if(node)damageWeakNode(e,node,16*player.podDamage*player.weakDamage*dt)}\n  }\n  function handleBossDefeat";
 replace(ending,ending.replace('\n  }\n  function handleBossDefeat','\n    weakPointFrames.delete(e);\n  }\n  function handleBossDefeat'));
 return text;
}
const candidate=live?liveRaw.replace(/\r\n/g,'\n'):candidateSource();fs.writeFileSync(path.join(root,live?'artifacts/moving-core-live-v154-game.js':'artifacts/moving-core-candidate-v154-game.js'),candidate);
function makeHarness(text,temporal){
 let support=fs.readFileSync(harnessFile,'utf8');support=support.slice(0,support.indexOf('\ntest('));
 text=text.replace('  function armoredHits(e,color,dt){','  function armoredHits(e,color,dt){weakSweepTestHook?.(e,dt);');
 if(temporal)text=text.replace('snapshotWeakPointFrame(boss||miniBoss,dt);','snapshotWeakPointFrame(boss||miniBoss,dt);weakSweepBeforeUpdate?.(dt);');
 text=text.replace('  function bossDamageAllowed(e){','  let weakSweepTestHook=null,weakSweepBeforeUpdate=null;\n  function bossDamageAllowed(e){');
 support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(text)+';');
 support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {armoredHits,sweptHit,bossDamageAllowed,updateBossFight,updateEpicBossFight,
 setCollisionHook(fn){weakSweepTestHook=fn},${temporal?'setBeforeUpdate(fn){weakSweepBeforeUpdate=fn},getWeakFrame:e=>weakPointFrames.get(e),sweptWeakPointHit,':''}`);
 support=support.replace('const context = vm.createContext(sandbox);','const context = vm.createContext(sandbox);vm.runInContext("Math.random=()=>.25",context);');
 const m=new Module(harnessFile,module);m.filename=harnessFile;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',harnessFile);return m.exports.createGame;
}
const createBaseline=makeHarness(baselineSource,false),createCandidate=makeHarness(candidate,true),dt=1/120,results=[],reproductions=[];
function fixture(create,type=3,phase=2,family='main'){const g=create({ruleset:'streamlined-v1'}),a=g.api;if(family==='mini')a.startMiniBossLab(type);else if(family==='epic')a.startEpicBossLab(type);else a.startBossLab(type);const e=family==='mini'?a.miniBoss:a.boss;if(family!=='mini')e.phase=phase;e.hp=e.max*(family==='epic'?1-(phase-1)*.25:family==='main'&&phase===2?.5:1);a.player.inv=1e6;a.player.pod.owned=false;return{...g,a,e}}
function relativeHit(a,s,p,q){return a.sweptHit({...s,px:s.px-p.x,py:s.py-p.y,x:s.x-q.x,y:s.y-q.y},{x:0,y:0,r:Math.min(p.r,q.r)})}
function crossing(a,previous,current){const x=(previous.x+current.x)/2,y=(previous.y+current.y)/2;return{px:x-620*dt/2,x:x+620*dt/2,py:y,y,r:3,d:1,vx:620,vy:0,dead:false}}
function crossingProbe(a,previous,current,step=dt){
 const delta=620*step,vx=delta-(current.x-previous.x),vy=previous.y-current.y,length=Math.hypot(vx,vy)||1,radius=3+Math.min(previous.r,current.r);
 for(const fraction of[0,.5,-.5,.9,-.9,.98,-.98,.999,-.999,.99999,-.99999]){
  const x=(previous.x+current.x)/2-vy/length*radius*fraction,y=(previous.y+current.y)/2+vx/length*radius*fraction,s={px:x-delta/2,x:x+delta/2,py:y,y,r:3,d:1,vx:620,vy:0,dead:false};
  if(relativeHit(a,s,previous,current)&&!a.sweptHit(s,current))return s;
 }
 return null;
}
function seek(type){
 const {a,e}=fixture(createBaseline,type);
 for(let tick=0;tick<3600;tick++){
  const nodes=a.activeWeakNodes(e),old=nodes.map(n=>a.worldWeakNode(e,n)),open=a.bossDamageAllowed(e)&&e.weakOpen;a.update(dt);
  if(!open||!a.bossDamageAllowed(e)||!e.weakOpen||nodes!==a.activeWeakNodes(e))continue;
  for(let i=0;i<nodes.length;i++){
   const current=a.worldWeakNode(e,nodes[i]),s=crossing(a,old[i],current);
   if(relativeHit(a,s,old[i],current)&&!a.sweptHit(s,current)&&!a.sweptHit({x:s.px,y:s.py,r:s.r},old[i])&&!nodes.some(n=>a.sweptHit(s,a.worldWeakNode(e,n))))return{type,tick,node:i,shot:s,previous:old[i],current};
  }
 }
 throw Error('No natural crossing found for '+type);
}
function atBefore(example,create=createCandidate){const g=fixture(create,example.type,example.phase||2,example.family||'main');for(let tick=0;tick<example.tick;tick++)g.a.update(dt);return g}
function insert(a,shot){const packet={...shot,x:shot.px,y:shot.py,dead:false};a.shots.push(packet);return packet}
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const examples=[seek(3),seek(7)];
for(const example of examples)check('native moving '+(example.type===3?'Rift':'Gravebell')+' crossing becomes one precision hit',()=>{
 const row={type:example.type,tick:example.tick,node:example.node};
 for(const [label,create]of[['baseline',createBaseline],['candidate',createCandidate]]){
  const {a,e}=atBefore(example,create),hp=e.hp,packet=insert(a,example.shot);a.update(dt);
  row[label]={dealt:hp-e.hp,consumed:packet.dead,coreHp:a.activeWeakNodes(e)[example.node].hp,clock:e.clock};
 }
 assert.equal(row.baseline.dealt,0);assert.equal(row.candidate.dealt,1);assert.equal(row.candidate.consumed,true);reproductions.push(row);
});
const example=examples[0];
check('relative temporal coverage preserves genuine near misses',()=>{
 const {a,e}=atBefore(example),s={...example.shot},above=Math.min(example.previous.y,example.current.y)-example.current.r-s.r-2;s.py=s.y=above;const hp=e.hp;insert(a,s);a.update(dt);assert.equal(e.hp,hp);
});
for(const kind of['opening','closing','intro-before','intro-after','hidden-before','hidden-after','ritual-before','ritual-after','phase','node-array','node-identity','destroyed-before','destroyed-after','wrong-dt','wrong-clock','foreign-actor','paused-after','long-step'])check('temporal sweep rejects '+kind+' history',()=>{
 const {a,e}=atBefore(example),node=a.activeWeakNodes(e)[example.node],previousPoint=a.worldWeakNode(e,node);
 if(kind==='opening'){e.weakOpen=false;e.weakTimer=100;e.weakTelegraph=0}
 if(kind==='intro-before')e.intro=1;
 if(kind==='hidden-before')e.hidden=true;
 if(kind==='ritual-before')e.ritual={};
 if(kind==='destroyed-before')node.destroyed=true;
 let observed=false;
 a.setCollisionHook((actor,step)=>{
  if(actor!==e)return;observed=true;a.setCollisionHook(null);
  if(['opening','intro-before','hidden-before','ritual-before'].includes(kind)){e.intro=0;e.hidden=false;e.ritual=null;e.weakOpen=true}
  if(kind==='closing')e.weakOpen=false;
  if(kind==='intro-after')e.intro=1;
  if(kind==='hidden-after')e.hidden=true;
  if(kind==='ritual-after')e.ritual={};
  if(kind==='phase')e.phase=1;
  if(kind==='node-array')e.weakNodes2=[...e.weakNodes2];
  let target=node;
  if(kind==='node-identity'){target={...node};e.weakNodes2[example.node]=target}
  if(kind==='destroyed-before')node.destroyed=false;
  if(kind==='destroyed-after')node.destroyed=true;
  if(kind==='wrong-clock')e.clock+=.01;
  if(kind==='foreign-actor')a.makeBoss();
  if(kind==='paused-after')a.pause();
  const current=a.worldWeakNode(e,target),s=crossingProbe(a,previousPoint,current,step);
  assert.ok(s,'Guard must reject an actual relative crossing, not a far miss');
  assert.equal(relativeHit(a,s,previousPoint,current),true);assert.equal(a.sweptHit(s,current),false);
  assert.equal(a.sweptWeakPointHit(s,e,target,kind==='wrong-dt'?step/2:step),false);
 });
 a.update(kind==='long-step'?.1:dt);assert.equal(observed,true,'Native collision callback must run');
});
check('paused direct updates cannot create temporal history or advance the actor',()=>{
 const {a,e}=atBefore(example),clock=e.clock,hp=e.hp;a.pause();a.update(dt);assert.equal(e.clock,clock);assert.equal(e.hp,hp);assert.equal(a.getWeakFrame(e),undefined);assert.equal(a.sweptWeakPointHit(example.shot,e,a.activeWeakNodes(e)[example.node],dt),false);
});
check('zero-time updates add no temporal hit and the next real step can still connect',()=>{
 const {a,e}=atBefore(example),hp=e.hp,packet=insert(a,example.shot);a.update(0);assert.equal(e.hp,hp);assert.equal(packet.dead,false);assert.equal(a.getWeakFrame(e),undefined);a.update(dt);assert.equal(hp-e.hp,1);
});
check('paused loops do not move, damage or retain a ghost temporal frame',()=>{
 const {a,e}=atBefore(example),hp=e.hp,clock=e.clock,packet=insert(a,example.shot);a.pause();a.loop(100);a.loop(1100);assert.equal(e.hp,hp);assert.equal(e.clock,clock);assert.equal(packet.dead,false);assert.equal(a.getWeakFrame(e),undefined);a.pause();a.loop(1100+1000/120);assert.equal(hp-e.hp,1);
});
check('actor-only calls without a matching global frame preserve endpoint fallback',()=>{
 const {a,e}=atBefore(example),hp=e.hp;const packet=insert(a,example.shot);packet.px=packet.x;packet.py=packet.y;packet.x+=620*dt;a.updateBossFight(e,dt);assert.equal(e.hp,hp);assert.equal(a.getWeakFrame(e),undefined);
 const node=a.activeWeakNodes(e)[0],point=a.worldWeakNode(e,node),direct={x:point.x,y:point.y,px:point.x-1,py:point.y,r:3,d:1,dead:false};a.shots.length=0;a.shots.push(direct);a.armoredHits(e,'#fff',0);assert.equal(hp-e.hp,1);
});
check('one frame cannot be reused for a later direct collision call',()=>{
 const {a,e}=atBefore(example);a.update(dt);assert.equal(a.getWeakFrame(e),undefined);assert.equal(a.sweptWeakPointHit(example.shot,e,a.activeWeakNodes(e)[example.node],dt),false);
});
const frameParity=[];
check('30/60/120 display loops retain identical fixed-step collision outcomes',()=>{
 for(const fps of[30,60,120]){
  const {a,e}=fixture(createCandidate,3),hp=e.hp;let ticks=0,packet=null;
  a.setBeforeUpdate(()=>{if(ticks++===example.tick)packet=insert(a,example.shot)});
  for(let frame=0;frame<=fps*4;frame++)a.loop(100+frame*1000/fps);
  assert.ok(packet);assert.equal(hp-e.hp,1);assert.equal(packet.dead,true);
  frameParity.push({fps,clock:e.clock,x:e.x,y:e.y,hp:e.hp,nodeHp:a.activeWeakNodes(e)[example.node].hp,updates:ticks});
 }
 for(const row of frameParity.slice(1))for(const key of['clock','x','y','hp','nodeHp','updates'])assert.ok(Math.abs(row[key]-frameParity[0][key])<1e-7,key+' must agree across display rates');
});
const roster=[];
check('all22 encounters and all38 phases accept a native temporal crossing without larger hit radii',()=>{
 for(const family of['mini','main','epic'])for(let type=0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='mini'?1:family==='main'?2:4);phase++){
  const {a,e}=fixture(createBaseline,type,phase,family);let found=null;
  for(let tick=0;tick<2400&&!found;tick++){
   const nodes=a.activeWeakNodes(e),old=nodes.map(n=>a.worldWeakNode(e,n)),open=a.bossDamageAllowed(e)&&e.weakOpen;a.update(dt);
   if(!open||!a.bossDamageAllowed(e)||!e.weakOpen||nodes!==a.activeWeakNodes(e))continue;
   for(let i=0;i<nodes.length&&!found;i++){
    const current=a.worldWeakNode(e,nodes[i]),shot=crossingProbe(a,old[i],current);
    if(!shot||a.sweptHit({x:shot.px,y:shot.py,r:shot.r},old[i])||nodes.some(n=>a.sweptHit(shot,a.worldWeakNode(e,n))))continue;
    found={family,type,phase,tick,node:i,shot};
   }
  }
  assert.ok(found,'Natural temporal crossing must exist: '+family+' '+type+' '+phase);
  const row={family,type,phase,tick:found.tick,node:found.node};
  for(const[label,create]of[['baseline',createBaseline],['candidate',createCandidate]]){const{a:b,e:enemy}=atBefore(found,create),hp=enemy.hp,shot=insert(b,found.shot);b.update(dt);row[label]={damage:hp-enemy.hp,consumed:shot.dead}}
  assert.ok(row.baseline.damage<1,'Baseline is not already a precision hit');assert.equal(row.candidate.damage,1,'Candidate must deliver exactly the existing precision amount');assert.equal(row.candidate.consumed,true);roster.push(row);
 }
});
const failed=results.filter(r=>!r.passed),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const report={sourceSelection:live?'game.js without candidate mutation':'private candidate applied to frozen source',liveRawSourceSha256:live?hash(liveRaw):null,baselineSourceSha256:hash(baselineSource),testedGameplaySha256:hash(candidate),sourceHashFormat:'Gameplay hashes normalize UTF-8 text to LF; liveRawSourceSha256 uses original file bytes',passed:results.length-failed.length,failed:failed.length,results,reproductions,frameParity,roster,limits:[live?'Live gameplay with test callbacks added in private VM only; no production or asset edits.':'Candidate only; no production or asset edits.','The temporal coverage interprets native pose travel linearly between displayed samples, without changing current artwork, hit radii or target registration.','Synthetic grazing counts are not a human miss rate.','Global prepass is before t and actor clocks advance; records are consumed after armoredHits, never serialized.']};
fs.writeFileSync(path.join(root,live?'artifacts/moving-core-live-v154-verification.json':'artifacts/moving-core-candidate-v154-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(report.passed+' '+(live?'live':'private')+' moving-core checks passed, '+failed.length+' failed');process.exitCode=failed.length?1:0;
