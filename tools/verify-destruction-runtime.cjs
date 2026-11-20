#!/usr/bin/env node
'use strict';
// Drawing-call and state-contract checks. Real PNG ownership is independently
// checked by verify-destruction-sprites.cjs; mock canvas pixels are not evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const harness=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').replace(/^#![^\n]*\n/,'').split('const game = createGame();')[0];
assert.ok(harness.includes('function createGame(')&&!harness.includes("test('menu loads"),'Harness boundary must precede test execution');
const {createGame}=new Function('require','__dirname',harness+'\nreturn {createGame};')(require,__dirname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8'));
const results=[];
function test(name,fn){try{const details=fn();results.push({name,pass:true,details});console.log('PASS '+name)}catch(error){results.push({name,pass:false,error:error.stack});console.error('FAIL '+name+': '+error.stack)}}
function traced(g){const canvases=[];const create=g.document.createElement;g.document.createElement=tag=>{const c=create(tag);if(tag==='canvas'){c.getContext('2d').trace=[];canvases.push(c)}return c};for(const c of[g.api.drawingContext,g.api.fractureContext,g.api.materialContext])c.trace=[];return canvases}
function launch(g,family,index,phase=1){const a=g.api;if(family==='mini')a.startMiniBossLab(index);else if(family==='main')a.startBossLab(index);else a.startEpicBossLab(index);const e=family==='mini'?a.miniBoss:a.boss;Object.assign(e,{phase,x:675,y:270,intro:0,clock:.61,hitFlash:0,weakOpen:true,weakTelegraph:0,weakTimer:999,coreAperture:1,cool:99,hidden:false,visualAngle:.027,prismRecoil:.3});return e}
function groups(a,e){const map=new Map();for(const node of a.activeWeakNodes(e)){const p=a.nativeFractureBaseProfile(e,node);if(p){const group=map.get(p.groupId)||{id:p.groupId,nodes:[]};group.nodes.push(node);map.set(p.groupId,group)}}return [...map.values()]}
function setMask(a,e,list,mask){for(const n of a.activeWeakNodes(e)){n.destroyed=false;n.hp=n.max}for(let i=0;i<list.length;i++)if(mask&(1<<i))for(const n of list[i].nodes){n.destroyed=true;n.hp=0}}
function paint(a,e){a.drawingContext.trace=[];a.fractureContext.trace=[];a.drawingContext.resetTransform();a.drawNativeFracturedBody(e,()=>a.paintNativeFractureBody(e));return [...a.drawingContext.trace,...a.fractureContext.trace]}
function graph(image,seen=new Set()){if(!image||seen.has(image))return[];seen.add(image);const events=image.getContext?.('2d')?.trace||[];return events.flatMap(e=>e.op==='drawImage'?[e,...graph(e.image,seen)]:[e])}
function surfaces(events){return events.filter(e=>e.op==='drawImage'&&e.image?.destructionComposite)}
function registeredSources(a,e,key){if(e.epic||(e.kind==='boss'&&e.type>=5)){const file=a.lateFrame(e).source.sourcePath;assert.ok(manifest.sources[file],key+' current animated source has no prepared layers: '+file);return [[file,manifest.sources[file]]]}return Object.entries(manifest.sources).filter(([,s])=>s.uses?.includes(key))}
const focus=process.argv.includes('--focus=first');
const specs=focus?[['mini',0,1],['main',1,1],['main',1,2]]:[...Array.from({length:10},(_,i)=>['mini',i,1]),...Array.from({length:9},(_,i)=>[1,2].map(p=>['main',i+1,p])).flat(),...Array.from({length:2},(_,i)=>[1,2,3,4].map(p=>['epic',i,p])).flat()];

test('module composites preserve exclusive authored layer identity for every break combination',()=>{
  const g=createGame(),created=traced(g),m=g.sandbox.StarfighterDestruction;let count=0,combinations=0;
  for(const [file,sheet]of Object.entries(manifest.sources)){
    const asset=new g.sandbox.Image();asset.src=file;asset.sourcePath=file;assert.equal(m.surface(asset,new Set()),asset);
    m.preload(asset);assert.equal(m.ready(asset),true,'All dependencies must actually be ready');
    for(let mask=1;mask<(1<<sheet.parts.length);mask++){
      const broken=new Set(sheet.parts.filter((_,i)=>mask&(1<<i)).map(p=>p.id)),surface=m.surface(asset,broken,{style:count%16});assert.ok(surface?.ready&&surface.destructionComposite,'Broken surface must be prepared');
      const trace=surface.getContext('2d').trace,draws=trace.filter(e=>e.op==='drawImage');
      assert.equal(draws.filter(e=>e.args[0]===sheet.core).length,1,'Core painted exactly once');
      for(const p of sheet.parts)assert.equal(draws.filter(e=>e.args[0]===p.file).length,broken.has(p.id)?0:1,'Each live authored neighbor appears once; detached art is absent');
      const capCount=sheet.parts.filter(p=>broken.has(p.id)).reduce((n,p)=>n+p.capFrames.filter(c=>c&&c.pixels).length,0);assert.equal(draws.filter(e=>e.args[0]===g.sandbox.STARFIGHTER_JOINT_CAPS.file).length,capCount,'Every authored broken mount gets its cap and no live mount does');
      assert.equal(trace.some(e=>e.op==='clip'||e.composite==='destination-out'),false,'Sprite assembly must not cut a displayed body');
      assert.equal(m.surface(asset,new Set([...broken].reverse()),{style:count%16}),surface,'Stable order-independent composite cache');combinations++;
    }
    for(const p of sheet.parts){const limb=m.surface(asset,new Set(),{onlyPart:p.id});assert.equal(limb.sourcePath,p.file);assert.equal(limb.destructionComposite,true,'Prepared limb bypasses whole-body replacement');assert.equal(m.part(asset,p.id),limb)}
    assert.equal(m.surface(asset,new Set(),{onlyPart:'not-an-authored-part'}),null);count++;
  }
  const cache=m.inspect();assert.ok(cache.sources<=cache.maxSources&&cache.composites<=cache.maxComposites,'Bounded caches');assert.ok(created.length>count);
  return{sources:count,combinations};
});

test('module defers composites and parts until every image and cap has loaded',()=>{
  const g=createGame(),Base=g.sandbox.Image,waiting=[];g.sandbox.Image=class extends Base{set src(v){this.held=v;this.ready=false;waiting.push(this)}get src(){return this.held}release(){super.src=this.held}};
  const [file,sheet]=Object.entries(manifest.sources)[0],asset={sourcePath:file,ready:true,width:sheet.width,height:sheet.height},m=g.sandbox.StarfighterDestruction,id=sheet.parts[0].id;
  m.preload(asset);assert.equal(m.ready(asset),false);assert.equal(m.surface(asset,new Set([id])),null);assert.equal(m.surface(asset,new Set(),{onlyPart:id}),null);assert.ok(waiting.length>=sheet.parts.length+2);
  waiting.slice(0,-1).forEach(i=>i.release());assert.equal(m.ready(asset),false,'Cap is a real readiness dependency');waiting.at(-1).release();assert.equal(m.ready(asset),true);assert.ok(m.surface(asset,new Set([id]))?.ready);
  return{awaitedImages:waiting.length};
});

test('failed texture preparation never produces an empty ready body or fake fragment',()=>{
  const g=createGame(),Base=g.sandbox.Image;g.sandbox.Image=class extends Base{set src(v){if(v.startsWith('assets/destruction/')){this._src=v;this.ready=false;this.onerror?.()}else super.src=v}get src(){return this._src}};
  const a=g.api,e=launch(g,'mini',0),group=groups(a,e)[0],m=g.sandbox.StarfighterDestruction,asset=a.miniBossSpriteFor(0);for(const n of group.nodes)a.damageWeakNode(e,n,n.hp);assert.equal(m.ready(asset),false);assert.equal(m.surface(asset,new Set([group.id])),null);assert.equal(a.bossFragments.length,0);assert.equal(e.pendingNativeSpriteParts.size,1);a.flushNativeSpriteParts(e);assert.equal(a.bossFragments.length,0);assert.equal(e.pendingNativeSpriteParts.size,1);return{pendingNativeRequests:1};
});

test('prepared native dimensions remap source UVs while preserving destination placement',()=>{
  const g=createGame();traced(g);const a=g.api,e=launch(g,'mini',0),list=groups(a,e);setMask(a,e,list,1);const [file,sheet]=Object.entries(manifest.sources).find(([,s])=>s.uses?.includes('mini:0:1')),asset=g.document.createElement('canvas');Object.assign(asset,{width:sheet.width*.75,height:sheet.height*.75,sourcePath:file,ready:true});const input=[12,18,126,135,-75,-55,252,270];a.drawingContext.trace=[];a.withModularSpritePaint(e,()=>a.drawingContext.drawImage(asset,...input));const draw=a.drawingContext.trace.find(t=>t.op==='drawImage');assert.ok(draw.image.destructionComposite);assert.deepEqual(draw.args.slice(1,5),input.slice(0,4).map(n=>n/.75));assert.deepEqual(draw.args.slice(5),input.slice(4));const original=a.drawingContext.drawImage;assert.throws(()=>a.withModularSpritePaint(e,()=>{throw new Error('test restore')}),/test restore/);assert.equal(a.drawingContext.drawImage,original,'Paint wrapper must restore context on exceptions');return{nativeSize:[sheet.width,sheet.height],preparedSize:[asset.width,asset.height]};
});

test('normalized intermediate layers keep prepared source RGB and alpha before ownership masking',()=>{
  const g=createGame();traced(g);const [file,sheet]=Object.entries(manifest.sources)[0],asset=g.document.createElement('canvas');Object.assign(asset,{width:sheet.width/2,height:sheet.height/2,sourcePath:file,ready:true,destructionAlphaMask:true});const m=g.sandbox.StarfighterDestruction,id=sheet.parts[0].id;
  m.preload(asset);const part=m.surface(asset,new Set(),{onlyPart:id}),trace=part.getContext('2d').trace;
  assert.equal(part.width,asset.width);assert.equal(part.height,asset.height);assert.equal(trace[0].image,asset,'Normalized RGB and alpha come from prepared transparent source');assert.equal(trace[0].composite,'source-over');assert.equal(trace[1].args[0],sheet.parts[0].file);assert.equal(trace[1].composite,'destination-in','Exclusive authored mask is applied only during offscreen preparation');assert.equal(trace.some(e=>e.composite==='destination-out'||e.op==='clip'),false);
  const surface=m.surface(asset,new Set([id]));assert.equal(surface.width,asset.width);const layers=surface.getContext('2d').trace.filter(e=>e.op==='drawImage');assert.ok(layers[0].image.destructionComposite);assert.equal(layers[0].image.getContext('2d').trace[0].image,asset);return{preparedSize:[asset.width,asset.height]};
});

test('DEV Inspector flags alone select prepared damaged art across every native encounter and phase',()=>{
  let combinations=0;for(const [family,index,phase]of specs){const g=createGame();traced(g);const a=g.api,e=launch(g,family,index,phase),key=`${family}:${index}:${phase}`,list=groups(a,e);assert.ok(list.length,key+' needs authored groups');const registered=registeredSources(a,e,key).map(([,s])=>s);assert.ok(registered.length,key+' missing prepared source registration');for(const group of list)assert.ok(registered.some(s=>s.parts.some(p=>p.id===group.id)),key+' missing exact part '+group.id);
    const baseline=paint(a,e),baselineClips=baseline.filter(e=>e.op==='clip').length;
    for(let mask=1;mask<(1<<list.length);mask++){setMask(a,e,list,mask);const events=paint(a,e);assert.equal(events.some(e=>e.composite==='destination-out'),false,key+' still cuts body');assert.ok(events.filter(e=>e.op==='clip').length<=baselineClips,key+' introduces destruction clipping');assert.ok(surfaces(events).length,key+' silently used intact fallback');assert.equal(a.nativeSpriteBrokenGroups(e).size,list.filter((_,i)=>mask&(1<<i)).length,key+' direct destroyed flags must drive render');for(let i=0;i<list.length;i++)for(const n of list[i].nodes)assert.equal(a.nativeSocketRemoved(e,n),!!(mask&(1<<i)),key+' stale removed socket');combinations++}
    setMask(a,e,list,0);e.nativeSeveredGroups={'stale/part':true};assert.equal(a.nativeSpriteBrokenGroups(e).size,0,'Stale event bookkeeping cannot override live phase nodes');
  }return{encounterPhases:specs.length,combinations,scope:focus?'Reaver and Twin Maw only':'all 21 native families; Bloodstar retains approved legacy art'};
});

test('destroying groups emits matching native limb sprites once with no procedural fallback',()=>{
  let checked=0;
  for(const [family,index,phase]of specs){
    const g=createGame();traced(g);const a=g.api,e=launch(g,family,index,phase),list=groups(a,e),key=`${family}:${index}:${phase}`;
    for(const group of list){
      setMask(a,e,list,0);e.hp=e.max;e.nativeSeveredGroups={};e.pendingNativeSpriteParts=new Map();
      for(const n of a.activeWeakNodes(e)){n.nativeDetached=false;n.detached=false}
      a.bossFragments.splice(0);a.fractureContext.trace=[];
      for(const n of group.nodes)a.damageWeakNode(e,n,n.hp);
      assert.equal(e.pendingNativeSpriteParts.size,0,'Synchronous ready asset must not defer');
      const fragments=a.bossFragments.filter(f=>f.nativeChunk?.spritePart);
      assert.equal(fragments.length,1,key+' native fragment missing for '+group.id);
      const chunk=fragments[0].nativeChunk;assert.equal(chunk.groupId,group.id);assert.equal(chunk.phase,phase);
      assert.equal(a.bossFragments.length,1,'Native sprite kill cannot emit procedural filler');
      const capture=a.fractureContext.trace.filter(t=>t.op==='drawImage'),leaves=capture.flatMap(t=>[t,...graph(t.image)]),candidateSources=registeredSources(a,e,key),exactFiles=candidateSources.flatMap(([,s])=>s.parts.filter(p=>p.id===group.id).map(p=>p.file));
      assert.ok(leaves.some(t=>exactFiles.includes(t.args[0])),key+' captured unrelated body instead of actual '+group.id);
      const nativeFiles=candidateSources.flatMap(([,s])=>[s.core,...s.parts.filter(p=>p.id!==group.id).map(p=>p.file)]);
      assert.equal(leaves.some(t=>nativeFiles.includes(t.args[0])),false,key+' detached fragment includes core or neighboring limb');
      for(const n of group.nodes)assert.equal(a.detachNativePart(e,n),true);
      assert.equal(a.bossFragments.length,1,'Repeated detach must remain consumed');checked++;
    }
  }return{nativeKills:checked};
});

test('pending native debris keeps kill pose and phase through delayed texture loading',()=>{
  const g=createGame();traced(g);const Base=g.sandbox.Image,waiting=[];g.sandbox.Image=class extends Base{set src(v){if(v.startsWith('assets/destruction/')){this.held=v;this.ready=false;waiting.push(this)}else super.src=v}get src(){return this.held||super.src}release(){const held=this.held;delete this.held;super.src=held}};
  const a=g.api,e=launch(g,'main',1,1),group=groups(a,e)[0];for(const n of group.nodes)a.damageWeakNode(e,n,n.hp);assert.equal(a.bossFragments.length,0,'Pending art may not spawn procedural filler');assert.equal(e.pendingNativeSpriteParts.size,1);const request=[...e.pendingNativeSpriteParts.values()][0],killClock=request.snapshot.clock,killNodes=request.snapshot.weakNodes1;assert.notEqual(killNodes,e.weakNodes1,'Pending pose needs copied node arrays');assert.notEqual(killNodes[0],e.weakNodes1[0]);const killPhase=request.phase;e.clock+=7;e.x+=100;e.phase=2;assert.equal(request.snapshot.clock,killClock);assert.equal(request.snapshot.phase,killPhase);for(const n of group.nodes)a.detachNativePart(e,n);assert.equal(e.pendingNativeSpriteParts.size,1,'Repeated pending requests deduplicate');waiting.forEach(i=>i.release());a.fractureContext.trace=[];a.flushNativeSpriteParts(e);assert.equal(e.pendingNativeSpriteParts.size,0,'Old-phase native debris still flushes');assert.equal(a.bossFragments.length,1);assert.equal(a.bossFragments[0].nativeChunk.phase,1);assert.equal(a.bossFragments[0].nativeChunk.groupId,group.id);assert.ok(a.fractureContext.trace.some(t=>t.op==='drawImage'&&t.image?.destructionComposite),'Readiness flush must capture prepared sprite');assert.equal(a.activeWeakNodes(e).some(n=>n.nativeDetached),false,'Old-phase queue cannot mark new-phase nodes detached');a.flushNativeSpriteParts(e);assert.equal(a.bossFragments.length,1);return{awaitedImages:waiting.length,frozenPhase:killPhase};
});

test('articulated core weakpoints follow the actual prepared core matrix after a limb breaks',()=>{
  const g=createGame();traced(g);const a=g.api;let checks=0;
  for(const [index,phase,clock]of[[1,1,10.8],[2,1,1.37],[2,2,10.8]]){
    const e=launch(g,'main',index,phase);Object.assign(e,{clock,mawRecoil:1,helixRecoil:1});const list=groups(a,e);setMask(a,e,list,1);a.drawingContext.trace=[];a.drawingContext.resetTransform();a.drawingContext.save();a.applyPose(e,false);a.drawNativeFracturedBody(e,()=>a.paintNativeFractureBody(e));a.drawingContext.restore();
    const core=a.drawingContext.trace.find(t=>t.op==='drawImage'&&t.image?.destructionRevision);assert.ok(core,'Prepared articulated core must be drawn');const nodes=a.activeWeakNodes(e),frame=Math.floor(clock*(index===1?(phase===2?6.5:5):(phase===2?6.2:4.6)))%2,points=(index===1?a.twinMawPoints:a.helixPoints)[phase-1][frame];
    for(const nodeIndex of index===1?[2]:phase===2?[2,3]:[2]){
      const draw=nodeIndex===3?a.drawingContext.trace.find(t=>t.op==='drawImage'&&t.args[0].endsWith('shell-3.png')):core;assert.ok(draw,'Prepared rear blade must retain core bone');const point=points[nodeIndex],[,sx,sy,sw,sh,dx,dy,dw,dh]=draw.args,cellW=627,px=dx+(point[0]+frame*cellW-sx)/sw*dw,py=dy+(point[1]+(phase-1)*cellW-sy)/sh*dh,[ma,mb,mc,md,mx,my]=draw.matrix,actual={x:ma*px+mc*py+mx,y:mb*px+md*py+my},target=a.worldWeakNode(e,nodes[nodeIndex]);assert.ok(Math.hypot(actual.x-target.x,actual.y-target.y)<.01,`Boss${index} phase${phase} node${nodeIndex} native art/collision drift`);checks++;
    }
  }return{nativeProjectionChecks:checks};
});

test('severed smoke follows the actual painted joint-cap origin through body and bone transforms',()=>{
  let checks=0,maxDrift=0;const covered=[];
  for(const[family,index,phase]of specs){
    const g=createGame();traced(g);const a=g.api,e=launch(g,family,index,phase),list=groups(a,e),key=`${family}:${index}:${phase}`,selected=[list[0]];
    if((family==='main'&&phase===2&&[2,3,5,8,9].includes(index))||(family==='epic'&&phase===4))if(list.at(-1)!==list[0])selected.push(list.at(-1));
    a.setTime(.73);
    for(const group of selected)for(const clock of[.17,1.61]){
      setMask(a,e,list,0);for(const node of group.nodes){node.destroyed=true;node.hp=0}
      Object.assign(e,{clock,hitFlash:.11,mawRecoil:.7,helixRecoil:.6,visualAngle:.075});
      if(family==='main'&&index===3){const period=phase===2?1.25:1.3;e.cool=period-clock%period}
      if(family==='main'&&index===4){e.attackCycle=1;e.ironCycle=clock%(phase===2?.86:1.05)}
      if(family==='main'&&index===5){e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-clock%1.35}
      a.drawingContext.trace=[];a.drawingContext.resetTransform();a.drawingContext.save();a.applyPose(e,false);a.drawNativeFracturedBody(e,()=>a.paintNativeFractureBody(e));a.drawingContext.restore();
      const projected=[];
      for(const draw of a.drawingContext.trace.filter(t=>t.op==='drawImage'&&t.image?.destructionRevision)){
        const caps=(draw.image.getContext('2d').trace||[]).filter(t=>t.op==='drawImage'&&t.args[0]===g.sandbox.STARFIGHTER_JOINT_CAPS.file),[,sx,sy,sw,sh,dx,dy,dw,dh]=draw.args;
        for(const cap of caps){
          const uv=cap.origin;if(uv.x<sx-1e-6||uv.x>sx+sw+1e-6||uv.y<sy-1e-6||uv.y>sy+sh+1e-6)continue;
          const x=dx+(uv.x-sx)/sw*dw,y=dy+(uv.y-sy)/sh*dh,[ma,mb,mc,md,mx,my]=draw.matrix;projected.push({x:ma*x+mc*y+mx,y:mb*x+md*y+my});
        }
      }
      assert.ok(projected.length,key+' '+group.id+' has no actual painted cap in current body UV crop');
      const anchor=a.nativeSeveredSmokeAnchor(e,group.nodes[0]);assert.ok(anchor&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y),key+' missing sever smoke anchor');
      const drift=Math.min(...projected.map(point=>Math.hypot(point.x-anchor.x,point.y-anchor.y)));assert.ok(drift<.05,`${key} ${group.id} clock${clock} smoke drifted ${drift.toFixed(5)}px from painted cap`);maxDrift=Math.max(maxDrift,drift);checks++;
    }
    covered.push(key);
  }
  return{encounterPhases:covered.length,paintedCapProjectionChecks:checks,maxDriftPixels:maxDrift};
});

const report={date:new Date().toISOString(),scope:focus?'first-two-encounters':'full-native-roster',method:'Production VM with traced draw calls and state transitions; pixel identity checked separately from real PNG bytes.',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
fs.writeFileSync(path.join(root,'artifacts/destruction-sprites-runtime-audit.json'),JSON.stringify(report,null,2)+'\n');
if(report.failed)process.exitCode=1;
