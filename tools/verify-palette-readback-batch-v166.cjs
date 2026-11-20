#!/usr/bin/env node
'use strict';
// Exercise actual palette/cache painters in disposable VM pilots. Canvas traces
// establish data routing and resource contracts, not real RGBA/GPU equivalence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
const sourcePath=path.resolve(root,process.argv.find(a=>a.startsWith('--source='))?.slice(9)||'game.js');
const sourceBytes=fs.readFileSync(sourcePath),source=sourceBytes.toString('utf8');
assert.ok(source.includes('function prefetchNativeMaterialReadbacks('),'Run against the batch candidate or installed batch implementation.');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
// The earlier-boss prefetch exists only in the extended candidate; accessors are added only when present.
const hasEarly=source.includes('function prefetchEarlyBossMaterialReadbacks(');
const earlyAccessors=hasEarly?`prefetchEarlyBossMaterialReadbacks,drawEarlyMaterialSockets,
    withoutEarlyBatch(paint){const previous=prefetchEarlyBossMaterialReadbacks;prefetchEarlyBossMaterialReadbacks=()=>null;try{return paint()}finally{prefetchEarlyBossMaterialReadbacks=previous}},
    `:'';
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
    ${earlyAccessors}
    nativePaletteKey,prefetchNativeMaterialReadbacks,prefetchLateBossMaterialReadbacks,nativeMaterialPalette,renderIntegratedLateBoss,lateBossMaterialFrame,
    get batchScope(){return nativePaletteReadbackScope},
    get batchStats(){return prefetchNativeMaterialReadbacks.stats},
    setBatchScope(value){nativePaletteReadbackScope=value},setPartCapture(value){nativeSpritePartCapture=value},
    withBatchScope(value,paint){const previous=nativePaletteReadbackScope;nativePaletteReadbackScope=value;try{return paint()}finally{nativePaletteReadbackScope=previous}},
    withoutBatch(paint){const previous=prefetchLateBossMaterialReadbacks;prefetchLateBossMaterialReadbacks=()=>null;try{return paint()}finally{prefetchLateBossMaterialReadbacks=previous}},
    capturePaletteInputs(){const inputs=[],previous=buildNativeSocketPalette;buildNativeSocketPalette=function(data,w,h,options){inputs.push({first:Array.from(data.subarray(0,4)),last:Array.from(data.subarray(data.length-4)),buffer:data.buffer,offset:data.byteOffset,length:data.length,w,h,options:{...options}});return previous(data,w,h,options)};return inputs},
`);
const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};',file);
const plain=value=>JSON.parse(JSON.stringify(value)),results=[];
function colorFor(args){const n=Math.abs(Math.round(args[0]*37+args[1]*17+args[2]*13+args[3]*7));return[90+n%128,100+n%90,35+n%40,255]}
function fixture(){
 const g=isolated.exports.createGame({ruleset:'streamlined-v1'}),created=[],reads=[],create=g.document.createElement;
 g.document.createElement=tag=>{
  const node=create(tag);if(tag!=='canvas')return node;
  const c=node.getContext('2d'),draw=c.drawImage;node.batchTrace={draws:[],reads:[],contexts:[]};
  node.getContext=(kind,options)=>{node.batchTrace.contexts.push({kind,options});return c};
  // A 1:1 canvas-to-canvas copy (image,dx,dy) snapshots the source canvas' latest sampled tile colour.
  c.drawImage=function(image,...args){const record={image,args:[...args]};if(args.length===2&&image?.batchTrace){const source=[...image.batchTrace.draws].reverse().find(d=>d.args.length===8);record.snapshot=source?colorFor(source.args):[255,255,255,255]}node.batchTrace.draws.push(record);return draw.apply(this,[image,...args])};
  for(const name of['save','restore','clip']){const original=c[name];node.batchTrace[name]=0;c[name]=function(...args){node.batchTrace[name]++;return original.apply(this,args)}}
  c.getImageData=function(x,y,w,h){
   const call={canvas:node,x,y,w,h};reads.push(call);node.batchTrace.reads.push(call);
   const data=new Uint8ClampedArray(w*h*4),draws=node.batchTrace.draws;
   for(let yy=0;yy<h;yy++){
    const worldY=y+yy,row=[...draws].reverse().find(d=>d.snapshot?worldY>=d.args[1]&&worldY<d.args[1]+96:d.args.length===8&&worldY>=d.args[5]&&worldY<d.args[5]+d.args[7]);
    const color=row?(row.snapshot||colorFor(row.args)):[255,255,255,255];
    for(let xx=0;xx<w;xx++)data.set(color,(yy*w+xx)*4);
   }
   return{data,width:w,height:h};
  };
  created.push(node);return node;
 };
 return{...g,a:g.api,created,reads};
}
function sample(asset,x,extra={}){return{asset,rect:{x,y:20.25,w:27.125,h:31.5},options:{hue:120,hueSpread:45},...extra}}
function asset(name='private-palette-source'){return{ready:true,naturalWidth:1280,naturalHeight:1280,width:1280,height:1280,sourcePath:name}}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function coldBoss(g,type,broken=false){
 g.a.startBossLab(type);const e=g.a.boss;e.phase=2;e.hp=e.max*.5;e.intro=0;e.clock=.001;e.phaseFlash=0;e.weakOpen=true;e.weakTimer=99;e.coreAperture=1;e.hitFlash=0;e.x=710;e.y=270;
 if(type===5){e.voidAnimWindow=2.8;e.voidAnimDuration=2.8;e.voidAnimTimer=3.2}
 if(broken){const target=g.a.activeWeakNodes(e).find(n=>g.a.nativeFractureBaseProfile(e,n));assert.ok(target);target.destroyed=true;target.hp=0;target.detached=true}
 g.a.nativePaletteCache.clear();g.reads.length=0;g.created.length=0;return e;
}
function render(g,e){return g.a.renderIntegratedLateBoss(e,e.type===5?232:undefined,0)}

check('cold native Void and Prism painters reduce preparation reads while hot poses allocate and read nothing',()=>{
 const rows=[];
 for(const[type,expected]of[[5,[6,5]],[6,[4,3]]])for(const broken of[false,true]){
  const g=fixture(),e=coldBoss(g,type,broken);g.a.withoutBatch(()=>render(g,e));const before=g.reads.length;assert.equal(before,expected[broken?1:0]);
  g.a.nativePaletteCache.clear();g.reads.length=0;g.created.length=0;render(g,e);const after=g.reads.length;assert.equal(after,1);assert.equal(g.a.batchScope,null);
  const cached=g.a.nativePaletteCache.size,created=g.created.length;g.reads.length=0;render(g,e);assert.equal(g.reads.length,0);assert.equal(g.created.length,created,'A warm pose cannot allocate a sampler or fresh layer canvas');assert.equal(g.a.nativePaletteCache.size,cached);
  rows.push({type,broken,before,after,hot:0});
 }
 return{rows};
});

check('vertical tiles route contiguous RGBA views to the actual palette miss path without changing source metadata',()=>{
 const g=fixture(),a=asset(),jobs=[sample(a,10.1251),sample(a,70.25),sample(a,130.375)],inputs=g.a.capturePaletteInputs();
 const prepared=g.a.prefetchNativeMaterialReadbacks(jobs);assert.equal(prepared.size,3);assert.equal(g.reads.length,1);assert.deepEqual([g.reads[0].w,g.reads[0].h],[96,288]);
 const original=plain(a),rects=plain(jobs.map(j=>j.rect));
 g.a.withBatchScope(prepared,()=>jobs.forEach(job=>{const p=g.a.nativeMaterialPalette(job.asset,job.rect,job.options);assert.equal(p.sourceAsset,a);assert.deepEqual(plain(p.sourceRect),job.rect)}));
 assert.equal(g.reads.length,1,'Palette construction must consume the prefetched sample instead of reading again');assert.equal(inputs.length,3);
 for(let i=0;i<inputs.length;i++){assert.deepEqual(plain(inputs[i].first),colorFor([jobs[i].rect.x,jobs[i].rect.y,jobs[i].rect.w,jobs[i].rect.h]));assert.deepEqual(inputs[i].last,inputs[i].first);assert.equal(inputs[i].length,96*96*4);assert.equal(inputs[i].w,96);assert.equal(inputs[i].h,96);assert.equal(inputs[i].buffer,inputs[0].buffer);assert.equal(inputs[i].offset,i*96*96*4)}
 assert.deepEqual(plain(a),original);assert.deepEqual(plain(jobs.map(j=>j.rect)),rects);assert.equal(g.a.batchScope,null);
 return{tiles:3,reads:1,sharedContiguousBuffer:true};
});

check('rounded-key duplicates keep the first exact rectangle and the existing hue/lighting key semantics',()=>{
 const g=fixture(),a=asset(),first=sample(a,10.1251),duplicate=sample(a,10.1252),other=sample(a,70.25);
 assert.equal(g.a.nativePaletteKey(a,first.rect,first.options),g.a.nativePaletteKey(a,duplicate.rect,duplicate.options));
 const before=[...g.a.nativePaletteCache.keys()],prepared=g.a.prefetchNativeMaterialReadbacks([first,duplicate,other]);assert.equal(prepared.size,2);assert.deepEqual([...g.a.nativePaletteCache.keys()],before,'Prefetch must not mutate LRU order or insert palettes');
 const [strip,...tiles]=g.created;assert.equal(tiles.length,2,'One strip plus one new sampler per pending tile');const draws=tiles.map(t=>t.batchTrace.draws[0]);assert.ok(tiles.every(t=>t.batchTrace.draws.length===1));assert.equal(draws[0].args[0],10.1251,'Sampling coordinates retain full precision rather than cache-key rounding');assert.deepEqual(draws.map(d=>d.args.slice(4)),[[0,0,96,96],[0,0,96,96]],'Every tile is rasterized at its own sampler origin like the original lone sampler');
 assert.deepEqual(strip.batchTrace.draws.map(d=>d.args),[[0,0],[0,96]],'The strip receives only integer 1:1 tile copies');assert.deepEqual(strip.batchTrace.draws.map(d=>d.image),tiles);
 for(const canvas of[strip,...tiles])assert.equal(canvas.batchTrace.contexts[0].options.willReadFrequently,true);assert.notEqual(g.a.nativePaletteKey({...a},first.rect,first.options),g.a.nativePaletteKey(a,first.rect,first.options),'Different source objects cannot share prepared pixels just because their metadata matches');
 assert.notEqual(g.a.nativePaletteKey(a,first.rect,{hue:0}),g.a.nativePaletteKey(a,first.rect,{}));assert.equal(g.a.nativePaletteKey(a,first.rect,{hueSpread:0}),g.a.nativePaletteKey(a,first.rect,{hueSpread:38}));assert.notEqual(g.a.nativePaletteKey(a,first.rect,{lowLight:true}),g.a.nativePaletteKey(a,first.rect,{}));
 return{duplicates:1,tiles:2};
});

check('one/zero pending samples and sixteen-tile bounds preserve the unbatched fallback without extra allocation',()=>{
 const g=fixture(),a=asset(),one=sample(a,10);
 assert.equal(g.a.prefetchNativeMaterialReadbacks([]),null);assert.equal(g.a.prefetchNativeMaterialReadbacks([one]),null);assert.equal(g.created.length,0);assert.equal(g.reads.length,0);
 const jobs=Array.from({length:16},(_,i)=>sample(a,20+i*5));const prepared=g.a.prefetchNativeMaterialReadbacks(jobs);assert.equal(prepared.size,16);assert.deepEqual([g.created[0].width,g.created[0].height],[96,1536]);assert.equal(g.created.length,17,'One strip plus sixteen samplers');assert.equal(g.a.batchStats.maxTiles,16);
 const created=g.created.length,reads=g.reads.length;assert.equal(g.a.prefetchNativeMaterialReadbacks([...jobs,sample(a,200)]),null);assert.equal(g.created.length,created);assert.equal(g.reads.length,reads);
 g.a.nativeMaterialPalette(a,one.rect,one.options);assert.equal(g.reads.length,reads+1,'A single uncached request retains the native sampler');
 return{maxTiles:16,maxSamplerPixels:96*1536};
});

check('pending assets and invalid sampling rectangles never allocate or return a partial batch',()=>{
 const g=fixture(),a=asset(),good=sample(a,20);
 for(const bad of[sample({...a,ready:false},30),sample(a,30,{rect:{x:NaN,y:1,w:10,h:10}}),sample(a,30,{rect:{x:1,y:1,w:0,h:10}}),sample(a,30,{rect:{x:1,y:1,w:10,h:-1}})])assert.equal(g.a.prefetchNativeMaterialReadbacks([good,bad]),null);
 assert.equal(g.created.length,0);assert.equal(g.reads.length,0);assert.equal(g.a.nativePaletteCache.size,0);
});

function pressure(batched){
 const g=fixture(),a=asset(),A=sample(a,10),B=sample(a,20),C=sample(a,30),D=sample(a,40),all=[A,B,C,D];
 const pA=g.a.nativeMaterialPalette(a,A.rect,A.options),pC=g.a.nativeMaterialPalette(a,C.rect,C.options);
 for(let i=0;i<254;i++){const canvas=()=>{const c=g.document.createElement('canvas');c.width=c.height=96;return c};g.a.nativePaletteCache.set('filler-'+i,{sealed:canvas(),hot:canvas(),emission:canvas()})}
 assert.equal(g.a.nativePaletteCache.size,256);const before=[...g.a.nativePaletteCache.keys()];g.reads.length=0;
 const prepared=batched?g.a.prefetchNativeMaterialReadbacks(all):null;assert.deepEqual([...g.a.nativePaletteCache.keys()],before);
 g.a.withBatchScope(prepared,()=>all.forEach(j=>g.a.nativeMaterialPalette(a,j.rect,j.options)));
 assert.equal(g.a.nativePaletteCache.size,256);assert.equal(pA.sealed.width,96);assert.equal(pC.sealed.width,1,'A key evicted in native request order releases its original layers');
 const key=k=>g.a.nativePaletteKey(a,k.rect,k.options);assert.deepEqual([...g.a.nativePaletteCache.keys()].slice(-4),all.map(key));
 return{keys:[...g.a.nativePaletteCache.keys()],reads:g.reads.length};
}
check('mixed cache pressure retains native LRU order and falls back for an initially cached key evicted during painting',()=>{
 const original=pressure(false),batch=pressure(true);assert.deepEqual(batch.keys,original.keys);assert.equal(original.reads,3);assert.equal(batch.reads,2,'One batch plus the native fallback for C');return{beforeReads:3,afterReads:2,originalLruOrderPreserved:true};
});

check('capture, foreign-owner and unavailable-texture paths leave preparation out of unsupported paints',()=>{
 const g=fixture(),e=coldBoss(g,5),frame=g.a.lateBossMaterialFrame(e),sx=frame.frame%4*frame.cellW,sy=Math.floor(frame.frame/4)*frame.cellH;
 const created=g.created.length;assert.equal(g.a.prefetchLateBossMaterialReadbacks({...e},frame,sx,sy),null);assert.equal(g.created.length,created);
 g.a.setPartCapture('private-native-capture');assert.equal(g.a.prefetchLateBossMaterialReadbacks(e,frame,sx,sy),null);g.a.setPartCapture(null);assert.equal(g.created.length,created);
 const unavailable={...frame,source:{ready:false,width:1,height:1,sourcePath:'private-unavailable'}};assert.equal(g.a.prefetchLateBossMaterialReadbacks(e,unavailable,sx,sy),null);assert.equal(g.created.length,created);
 const prepared=g.a.prefetchLateBossMaterialReadbacks(e,frame,sx,sy);assert.equal(prepared.size,6);return{supportedTiles:prepared.size};
});

check('prefetch happens after the original body draw and before the first socket palette, matching the v165 body/material read order',()=>{
 const order=batched=>{
  const g=fixture(),e=coldBoss(g,5),c=g.a.drawingContext,draw=c.drawImage,log=[],push=g.reads.push.bind(g.reads);
  c.drawImage=function(...args){log.push('world-draw');return draw.apply(this,args)};g.reads.push=(...calls)=>{log.push('read:'+calls[0].w+'x'+calls[0].h);return push(...calls)};
  (batched?()=>render(g,e):()=>g.a.withoutBatch(()=>render(g,e)))();return log;
 };
 const original=order(false),batch=order(true);
 assert.deepEqual(original.slice(0,2),['world-draw','read:96x96'],'Frozen order: body blit, then the first material read');
 assert.deepEqual(batch.slice(0,2),['world-draw','read:96x576'],'Batched order: same body blit first, then one strip read before any socket draw');
 assert.equal(batch.filter(x=>x.startsWith('read:')).length,1);assert.ok(original.filter(x=>x.startsWith('read:')).length>1);
 return{originalPrefix:original.slice(0,2),batchPrefix:batch.slice(0,2)};
});

check('a thrown socket paint after prefetch restores the caller scope and subsequent native drawing recovers',()=>{
 // The body blit is world draw #1, so failing draw #2 occurs while the batch scope is live.
 const g=fixture(),e=coldBoss(g,5),outer=new Map([['sentinel',new Uint8ClampedArray(4)]]),c=g.a.drawingContext,draw=c.drawImage;g.a.setBatchScope(outer);
 let calls=0,live=null;c.drawImage=function(...args){if(++calls===2){live=g.a.batchScope;throw Error('private paint failure')}return draw.apply(this,args)};
 assert.throws(()=>render(g,e),/private paint failure/);assert.ok(live&&typeof live.get==='function'&&live!==outer&&live.size===6,'The failure must happen while the new strip scope is active (VM-realm Map, so no instanceof)');assert.equal(g.a.batchScope,outer);
 c.drawImage=draw;c.resetTransform();g.a.setBatchScope(null);assert.equal(render(g,e),true);assert.equal(g.a.batchScope,null);
 return{liveScopeTiles:live.size};
});

check('a thrown body draw leaves the caller scope untouched because no prefetch has begun',()=>{
 const g=fixture(),e=coldBoss(g,5),outer=new Map([['sentinel',new Uint8ClampedArray(4)]]),c=g.a.drawingContext,draw=c.drawImage;g.a.setBatchScope(outer);
 c.drawImage=()=>{throw Error('private body failure')};g.reads.length=0;assert.throws(()=>render(g,e),/private body failure/);assert.equal(g.a.batchScope,outer);assert.equal(g.reads.length,0,'No sampler read may precede a failed body blit');
 c.drawImage=draw;c.resetTransform();g.a.setBatchScope(null);assert.equal(render(g,e),true);assert.equal(g.a.batchScope,null);
});

check('no sampler canvas outlives a prefetch, holds a clip or saved state, or survives a failed tile into a retry',()=>{
 const g=fixture(),e=coldBoss(g,5),frame=g.a.lateBossMaterialFrame(e),sx=frame.frame%4*frame.cellW,sy=Math.floor(frame.frame/4)*frame.cellH;
 const quiet=canvases=>{for(const canvas of canvases){assert.equal(canvas.batchTrace.save,0,'No saved state');assert.equal(canvas.batchTrace.restore,0);assert.equal(canvas.batchTrace.clip,0,'No clip region can ever exist')}};
 g.created.length=0;g.a.prefetchLateBossMaterialReadbacks(e,frame,sx,sy);const first=[...g.created];assert.equal(first.length,7,'One strip plus six tile samplers');quiet(first);
 g.created.length=0;g.a.prefetchLateBossMaterialReadbacks(e,frame,sx,sy);const second=[...g.created];assert.equal(second.length,7);assert.ok(second.every(c=>!first.includes(c)),'Every canvas is new: nothing is reused between batches');quiet(second);
 // Fail the second tile's draw (canvas #3: strip, tile 0, tile 1).
 const outer=new Map([['outer-sentinel',new Uint8ClampedArray(4)]]),create=g.document.createElement;let made=0;g.a.setBatchScope(outer);g.created.length=0;
 g.document.createElement=tag=>{const node=create(tag);if(tag==='canvas'&&++made===3){const getContext=node.getContext;node.getContext=(...a)=>{const c=getContext(...a);c.drawImage=()=>{throw Error('private sampler failure')};return c}}return node};
 assert.throws(()=>render(g,e),/private sampler failure/);g.document.createElement=create;assert.equal(g.a.batchScope,outer,'An exception while preparing the RHS must preserve the prior scope');quiet(g.created.filter(c=>c.batchTrace));
 g.a.drawingContext.resetTransform();g.a.setBatchScope(null);g.reads.length=0;g.a.nativePaletteCache.clear();const inputs=g.a.capturePaletteInputs();g.created.length=0;assert.equal(render(g,e),true);assert.equal(g.reads.length,1);assert.equal(g.a.batchScope,null);
 assert.ok(inputs.length>=2&&inputs.every(i=>i.length===96*96*4),'The retry builds from freshly rasterized tiles');
 return{canvasesPerBatch:7,tileFailureRecovered:true,successfulRetryReads:1};
});

check('every tile is rasterized exactly like the original lone sampler: new 96x96 canvas, unmodified rect, integer 1:1 strip copies',()=>{
 const g=fixture(),a=asset(),jobs=Array.from({length:16},(_,i)=>sample(a,20.0625+i*5.37,{rect:{x:20.0625+i*5.37,y:20.25+i*.5,w:27.125+i%3,h:31.5+i%5}}));
 g.created.length=0;const prepared=g.a.prefetchNativeMaterialReadbacks(jobs);assert.equal(prepared.size,16);assert.equal(g.reads.length,1);assert.deepEqual([g.reads[0].w,g.reads[0].h],[96,1536]);
 const [strip,...tiles]=g.created;assert.equal(tiles.length,16);assert.deepEqual([strip.width,strip.height],[96,1536]);assert.equal(strip.batchTrace.draws.length,16);
 tiles.forEach((tile,i)=>{assert.deepEqual([tile.width,tile.height],[96,96]);assert.equal(tile.batchTrace.draws.length,1,'Exactly one draw per sampler');const d=tile.batchTrace.draws[0];assert.equal(d.image,a);assert.deepEqual(d.args,[jobs[i].rect.x,jobs[i].rect.y,jobs[i].rect.w,jobs[i].rect.h,0,0,96,96]);assert.equal(tile.batchTrace.reads.length,0,'Tiles are never read individually');assert.equal(tile.batchTrace.contexts[0].options.willReadFrequently,true)});
 strip.batchTrace.draws.forEach((d,i)=>{assert.equal(d.image,tiles[i]);assert.deepEqual(d.args,[0,i*96])});
 for(const canvas of[strip,...tiles])assert.deepEqual([canvas.batchTrace.save,canvas.batchTrace.restore,canvas.batchTrace.clip],[0,0,0]);
 return{tiles:16,copies:16};
});

check('normal batched painting preserves canvas ownership, combat resources, saves and source registration',()=>{
 const g=fixture(),e=coldBoss(g,6),c=g.a.drawingContext;const before=JSON.stringify({hp:e.hp,max:e.max,phase:e.phase,clock:e.clock,nodes:g.a.activeWeakNodes(e),player:g.a.player,checkpoint:g.a.profile.checkpoint,garage:g.a.garage,storage:[...g.storage]});
 c.resetTransform();c.translate(3,7);c.globalAlpha=.37;c.globalCompositeOperation='multiply';c.filter='hue-rotate(15deg)';c.shadowBlur=7;const matrix=plain(c.getTransform());render(g,e);
 assert.equal(JSON.stringify({hp:e.hp,max:e.max,phase:e.phase,clock:e.clock,nodes:g.a.activeWeakNodes(e),player:g.a.player,checkpoint:g.a.profile.checkpoint,garage:g.a.garage,storage:[...g.storage]}),before);
 assert.deepEqual(plain(c.getTransform()),matrix);assert.equal(c.globalAlpha,.37);assert.equal(c.globalCompositeOperation,'multiply');assert.equal(c.filter,'hue-rotate(15deg)');assert.equal(c.shadowBlur,7);assert.equal(g.a.batchScope,null);
 const frame=g.a.lateBossMaterialFrame(e);for(const value of g.a.nativePaletteCache.values()){assert.ok(value.sourceAsset===frame.source||value.sourceAsset.destructionComposite);assert.ok([value.sourceRect.x,value.sourceRect.y,value.sourceRect.w,value.sourceRect.h].every(Number.isFinite))}
});

if(hasEarly){
 function earlyBoss(g,type,phase,broken=false){
  g.a.startBossLab(type);const e=g.a.boss;e.phase=phase;e.hp=e.max*.5;e.intro=0;e.clock=.001;e.phaseFlash=0;e.weakOpen=true;e.weakTimer=99;e.coreAperture=1;e.hitFlash=0;e.x=710;e.y=270;
  if(broken){const target=g.a.activeWeakNodes(e).find(n=>g.a.nativeFractureBaseProfile(e,n));assert.ok(target,'type '+type+' phase '+phase+' needs a native part to break');target.destroyed=true;target.hp=0;target.detached=true}
  g.a.nativePaletteCache.clear();g.reads.length=0;g.created.length=0;return e;
 }
 check('earlier bosses: cold socket paints batch into one read with identical palette keys, and hot paints read nothing',()=>{
  const rows=[];
  for(const type of[1,2,3,4])for(const phase of[1,2])for(const broken of[false,true]){
   const a=fixture(),ea=earlyBoss(a,type,phase,broken);a.a.withoutEarlyBatch(()=>a.a.drawEarlyMaterialSockets(ea));const reads0=a.reads.length,keys0=[...a.a.nativePaletteCache.keys()];
   const b=fixture(),eb=earlyBoss(b,type,phase,broken);b.a.drawEarlyMaterialSockets(eb);const reads1=b.reads.length,keys1=[...b.a.nativePaletteCache.keys()];
   assert.deepEqual(keys1,keys0,`type ${type} phase ${phase} broken ${broken}: batched paint must insert the same palette keys in the same order`);
   assert.equal(reads1,reads0>=2?1:reads0,`type ${type} phase ${phase} broken ${broken}: one strip read replaces ${reads0} single reads (a mismatch here means a prefetched rect differs from the painted rect)`);
   assert.equal(b.a.batchScope,null);b.reads.length=0;const created=b.created.length;b.a.drawEarlyMaterialSockets(eb);assert.equal(b.reads.length,0,'A warm pose cannot read pixels');assert.equal(b.created.length,created,'A warm pose cannot allocate canvases');
   rows.push({type,phase,broken,single:reads0,batched:reads1});
  }
  assert.ok(rows.some(r=>r.single>=2&&r.batched===1),'At least one early boss state must exercise the batch');
  return{rows};
 });
 check('earlier-boss prefetch declines foreign owners, part capture and runs only for the live boss',()=>{
  const g=fixture(),e=earlyBoss(g,2,2,false);assert.equal(g.a.prefetchEarlyBossMaterialReadbacks({...e},{},[],[],2,1,0,0),null);
  g.a.setPartCapture('private-native-capture');assert.equal(g.a.prefetchEarlyBossMaterialReadbacks(e,{},[],[],2,1,0,0),null);g.a.setPartCapture(null);assert.equal(g.created.length,0);
 });
 check('a thrown earlier-boss socket paint after prefetch restores the caller scope and later paints recover',()=>{
  const g=fixture(),e=earlyBoss(g,3,2,false),outer=new Map([['sentinel',new Uint8ClampedArray(4)]]),c=g.a.drawingContext,draw=c.drawImage;g.a.setBatchScope(outer);
  let live=null;c.drawImage=function(){live=g.a.batchScope;throw Error('private paint failure')};
  assert.throws(()=>g.a.drawEarlyMaterialSockets(e),/private paint failure/);assert.ok(live&&typeof live.get==='function'&&live!==outer&&live.size>=2,'The failure must happen while the strip scope is active');assert.equal(g.a.batchScope,outer);
  c.drawImage=draw;c.resetTransform();g.a.setBatchScope(null);g.a.nativePaletteCache.clear();g.reads.length=0;g.a.drawEarlyMaterialSockets(e);assert.equal(g.reads.length,1);assert.equal(g.a.batchScope,null);
  return{liveScopeTiles:live.size};
 });
}

const failed=results.filter(r=>!r.passed).length,report={version:166,source:path.relative(root,sourcePath),sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),destructionSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'destruction.js'))).digest('hex'),passed:results.length-failed,failed,results,limits:['Actual renderer/cache/helper functions in disposable VM pilots; no real profiles or saves are accessed.','Canvas2D traces and synthetic per-tile RGBA establish routing, read counts, cache/resource bounds and fallback contracts.','Mock drawing does not establish real native RGBA equality, GPU performance, frame times or human animation quality; those require browser comparison.']};
fs.writeFileSync(path.join(root,'artifacts/palette-readback-batch-v166-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} palette readback batch checks passed, ${failed} failed`);if(failed)process.exitCode=1;
