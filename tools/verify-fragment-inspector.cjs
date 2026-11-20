#!/usr/bin/env node
'use strict';
// Actual delayed Images and native painters through the private browser harness.
// Canvas pixel reads are mocked: exact native image selection is traced, while
// frozen queue ownership and once-only emission are state assertions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),support=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').replace(/^#![^\n]*\n/,'').split('const game = createGame();')[0],{createGame}=new Function('require','__dirname',support+'\nreturn{createGame};')(require,__dirname),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8')),results=[];
function test(name,run){try{const details=run();results.push({name,pass:true,details});console.log('PASS '+name)}catch(error){results.push({name,pass:false,error:error.stack});console.error('FAIL '+name+': '+error.stack)}}
function setup(family='mini',index=2,phase=1){
  const g=createGame(),a=g.api,create=g.document.createElement;g.document.createElement=tag=>{const c=create(tag);if(tag==='canvas')c.getContext('2d').trace=[];return c};a.fractureContext.trace=[];
  const Base=g.sandbox.Image,images=[];g.sandbox.Image=class extends Base{set src(file){if(file.startsWith('assets/destruction/')){this.pendingSource=file;this.ready=false;images.push(this)}else super.src=file}get src(){return this.pendingSource||super.src}release(){if(!this.pendingSource)return;const file=this.pendingSource;delete this.pendingSource;super.src=file}};
  if(family==='mini')a.startMiniBossLab(index);else a.startBossLab(index);const e=family==='mini'?a.miniBoss:a.boss;Object.assign(e,{phase,x:720,y:245,clock:index===6?.1:.61,intro:0,weakOpen:true,coreAperture:1,hitFlash:0,visualAngle:.045});
  const node=a.activeWeakNodes(e).find(n=>a.nativeFractureBaseProfile(e,n)),profile=a.nativeFractureBaseProfile(e,node),members=a.activeWeakNodes(e).filter(n=>a.nativeFractureBaseProfile(e,n)?.groupId===profile.groupId);for(const n of members)a.damageWeakNode(e,n,n.hp);
  assert.equal(e.pendingNativeSpriteParts.size,1,'Missing native textures must queue one real fragment');assert.equal(a.bossFragments.length,0,'Missing native textures cannot emit procedural filler');
  const request=[...e.pendingNativeSpriteParts.values()][0];return{g,a,e,node,members,profile,request,release(){for(const image of images)image.release()}};
}
function layers(image,seen=new Set()){if(!image||seen.has(image))return[];seen.add(image);return(image.getContext?.('2d')?.trace||[]).filter(t=>t.op==='drawImage').flatMap(t=>[t,...layers(t.image,seen)])}
function ownerState(e){return JSON.stringify({severed:e.nativeSeveredGroups||{},detached:[...(e.weakNodes||[]),...(e.weakNodes1||[]),...(e.weakNodes2||[])].map(n=>n.nativeDetached??false)})}
function finishAndCheck(f){
  const{a,e,node,request,profile}=f;a.closeArtInspection();if(a.state==='paused')a.pause();assert.equal(e.pendingNativeSpriteParts.size,1,'Closing inspector retains the real deferred request');assert.equal(a.bossFragments.length,0,'Temporary inspector effects cannot leak into combat');a.fractureContext.trace=[];a.draw();assert.equal(e.pendingNativeSpriteParts.size,0);assert.equal(a.bossFragments.length,1,'First normal native paint emits the real fragment exactly once');const fragment=a.bossFragments[0];assert.ok(fragment.nativeChunk?.spritePart);assert.equal(fragment.nativeChunk.groupId,profile.groupId);assert.equal(fragment.nativeChunk.phase,request.phase);
  const originalPath=e.kind==='mini'?'assets/minibosses/'+e.def.file:a.lateFrame&&e.type>=5?a.lateFrame(request.snapshot).source.sourcePath:'assets/bosses/boss-02-twin-maw-alpha-v2.png',partFile=manifest.sources[originalPath].parts.find(part=>part.id===profile.groupId).file,draws=a.fractureContext.trace.filter(t=>t.op==='drawImage').flatMap(t=>[t,...layers(t.image)]);assert.ok(draws.some(t=>t.args[0]===partFile),'Real deferred fragment must capture its exact native limb layer');
  const center=fragment.nativeChunk.localCenter,lx=center.x*request.pose.scaleX,ly=center.y*request.pose.scaleY,cos=Math.cos(request.pose.angle),sin=Math.sin(request.pose.angle);assert.ok(Math.hypot(fragment.x-(request.pose.x+lx*cos-ly*sin),fragment.y-(request.pose.y+lx*sin+ly*cos))<1e-8,'Fragment must retain its killing world pose rather than inspector studio placement');
  a.draw();a.flushNativeSpriteParts(e);assert.equal(a.detachNativePart(e,node),true);assert.equal(a.bossFragments.length,1,'Further paints and detach calls cannot duplicate the real fragment');
}

test('delayed native debris stays frozen through inspector painting and flushes once after returning',()=>{
  const cases=[['mini',2,1,false],['main',1,2,true],['main',6,1,false]];
  for(const[family,index,phase,paused]of cases){const f=setup(family,index,phase),{a,e,request}=f;if(paused)a.pause();a.openArtInspection();assert.equal(a.state,'art');const queue=e.pendingNativeSpriteParts,entry=[...queue.values()][0];f.release();
    for(const mode of['closed','destroyed','exposed']){a.setInspectionMaterial(mode);const before=ownerState(e);for(let i=0;i<2;i++){a.draw();a.flushNativeSpriteParts(e)}assert.equal(e.pendingNativeSpriteParts,queue);assert.equal(e.pendingNativeSpriteParts.size,1);assert.equal([...queue.values()][0],entry);assert.equal(ownerState(e),before,'Painting may not mark real pending parts severed or detached');assert.equal(a.bossFragments.length,0,'Real queue may not be consumed into temporary inspector fragments')}
    assert.equal(request.snapshot.phase,phase);finishAndCheck(f);
  }return{delayedEncounterCases:cases.length,inspectorPaints:cases.length*6,normalEmissions:cases.length};
});

test('explicit inspector-only fragment previews still work without consuming the real queue',()=>{
  const f=setup(),{a,e,request,profile}=f;a.openArtInspection();f.release();const before=ownerState(e),previewOwner={...request.snapshot,pendingNativeSpriteParts:new Map(),nativeSeveredGroups:{}};for(const key of['weakNodes','weakNodes1','weakNodes2'])if(previewOwner[key])previewOwner[key]=previewOwner[key].map(n=>({...n}));
  assert.equal(a.emitNativeSpritePart(previewOwner,request.snapshot,request.index,profile,request.pose),true,'Explicit preview emission is independent of deferred real-queue flushing');assert.equal(a.bossFragments.length,1);assert.ok(a.bossFragments[0].nativeChunk?.spritePart);assert.equal(e.pendingNativeSpriteParts.size,1);assert.equal(ownerState(e),before,'Preview owner changes cannot affect the real encounter');a.draw();assert.equal(a.bossFragments.length,1,'Inspector drawing cannot append the queued real fragment');finishAndCheck(f);return{previewFragments:1,realEmissionsAfterClose:1};
});

const report={date:new Date().toISOString(),scope:'Delayed native fragment ownership across Art Inspector freeze, actual asset readiness, exact native limb capture and normal once-only flush. Explicit temporary fragment previews remain supported.',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};fs.writeFileSync(path.join(root,'artifacts/fragment-inspector-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} focused checks passed, ${report.failed} failed`);if(report.failed)process.exitCode=1;
