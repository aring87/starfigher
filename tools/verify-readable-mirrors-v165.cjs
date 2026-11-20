#!/usr/bin/env node
'use strict';
// Actual module/cache contracts with traced Canvas APIs. Pixel identity and
// browser timings are independently measured; mocked pixels prove neither.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),candidateArg=process.argv.find(arg=>arg==='--candidate'||arg.startsWith('--candidate=')),candidate=!!candidateArg,dependency=candidateArg?.includes('=')?candidateArg.slice('--candidate='.length):candidate?'artifacts/destruction-materialized-mirror-candidate.js':'destruction.js',moduleSource=fs.readFileSync(path.resolve(root,dependency),'utf8'),gameSource=fs.readFileSync(path.join(root,'game.js'),'utf8'),results=[];
assert.ok(moduleSource.includes('function readableSource('),'Install the mirror implementation or use --candidate');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const canvases=[],state={fail:null},sheet={width:128,height:96,cols:1,rows:1,cellW:128,cellH:96,core:'core.png',parts:[{id:'fin',file:'fin.png',capFrames:[{x:40,y:20,w:8,h:6,angle:.2,pixels:4}]},{id:'tail',file:'tail.png',capFrames:[]}]};
 function canvas(){
  const node={width:1,height:1,requests:[],draws:[],reads:[],writes:[]},context={globalCompositeOperation:'source-over',imageSmoothingEnabled:true,save(){},restore(){},translate(){},rotate(){},scale(){},
   drawImage(image,...args){if(state.fail==='draw')throw Error('copy draw failed');node.draws.push({image,args,composite:this.globalCompositeOperation,smoothing:this.imageSmoothingEnabled})},
   getImageData(...args){if(state.fail==='read')throw Error('completion read failed');node.reads.push(args);node.lastRead={data:new Uint8ClampedArray(4),width:args[2],height:args[3]};return node.lastRead},
   putImageData(pixels,...args){if(state.fail==='write')throw Error('materialization write failed');node.writes.push({pixels,args})}};
  node.getContext=(type,options)=>{node.requests.push({type,options});if(state.fail==='context')throw Error('context creation failed');return context};node.context=context;canvases.push(node);return node;
 }
 class Image{constructor(){this.width=this.naturalWidth=128;this.height=this.naturalHeight=96}set src(value){this._src=value;this.ready=true;this.onload?.()}get src(){return this._src}}
 const sandbox={document:{createElement:tag=>{assert.equal(tag,'canvas');return canvas()}},Image,STARFIGHTER_DESTRUCTION_MANIFEST:{sources:{'sheet.png':sheet}},STARFIGHTER_JOINT_CAPS:{file:'caps.png',frames:{0:{x:0,y:0,w:8,h:8}}}};sandbox.window=sandbox;vm.runInNewContext(moduleSource,sandbox,{filename:dependency});
 const source=(width=128,height=96,revision=1,extra={})=>({ready:true,destructionComposite:true,destructionRevision:revision,width,height,sourcePath:'sheet.png',...extra});
 return{m:sandbox.StarfighterDestruction,canvases,state,source,sheet};
}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}

check('raw, pending, invalid and oversized sources retain the existing sampler fallback without creating mirrors',()=>{
 const f=fixture(),m=f.m;
 for(const input of[null,{},f.source(10,10,1,{ready:false}),f.source(10,10,1,{destructionComposite:false}),f.source(10,10,0),f.source(10,10,-1),f.source(10,10,NaN),f.source(10,10,Infinity),f.source(0,10),f.source(-1,10),f.source(10,Infinity),f.source(1.5,10),f.source(Number.MAX_SAFE_INTEGER+1,1),f.source(1281,1280)])assert.equal(m.readableSource(input),null);
 assert.equal(f.canvases.length,0);const stats=m.inspect();assert.equal(stats.readableCopies,0);assert.equal(stats.readableBytes,0);assert.equal(stats.readableOversizedSkips,1);return{rejectedInputs:14,oversizedSkips:stats.readableOversizedSkips};
});

check('an immutable source is copied once at native dimensions with read-friendly context and reused by identity',()=>{
 const f=fixture(),m=f.m,input=f.source(127,93,7,{tag:'original'}),before={...input},first=m.readableSource(input);
 assert.ok(first);assert.equal(first.width,127);assert.equal(first.height,93);assert.deepEqual(plain(first.requests),[{type:'2d',options:{willReadFrequently:true}}]);assert.equal(first.draws.length,1);assert.equal(first.draws[0].image,input);assert.deepEqual(plain(first.draws[0].args),[0,0,127,93]);assert.equal(first.draws[0].composite,'copy');assert.equal(first.draws[0].smoothing,false);assert.deepEqual(plain(first.reads),[[0,0,127,93]]);assert.equal(first.writes.length,1);assert.equal(first.writes[0].pixels,first.lastRead,'Materialize the exact full-copy readback in the same readable surface');assert.deepEqual(plain(first.writes[0].args),[0,0]);assert.equal(first.context.globalCompositeOperation,'source-over');
 for(let repeat=0;repeat<100;repeat++)assert.equal(m.readableSource(input),first);
 assert.equal(f.canvases.length,1);assert.deepEqual(input,before);assert.equal(first.ready,true);assert.equal(first.hasAlpha,true);assert.equal(first.destructionComposite,true);assert.equal(first.sourcePath,input.sourcePath);assert.equal(first.readableSourceRevision,7);assert.equal(m.readableSource(first),null,'A readable copy must not recursively become another source');return{reuseCalls:100,copiedPixels:127*93};
});

check('same-path sources remain distinct and dimension or revision changes discard stale copies',()=>{
 const f=fixture(),m=f.m,a=f.source(),b=f.source(),old=m.readableSource(a),other=m.readableSource(b);assert.notEqual(old,other,'Object identity is required even when path/revision match');
 a.width=130;const resized=m.readableSource(a);assert.notEqual(resized,old);assert.deepEqual([old.width,old.height],[1,1]);assert.equal(resized.width,130);
 a.destructionRevision=2;const revised=m.readableSource(a);assert.notEqual(revised,resized);assert.deepEqual([resized.width,resized.height],[1,1]);assert.equal(revised.readableSourceRevision,2);
 a.width=1281;a.height=1280;assert.equal(m.readableSource(a),null);assert.deepEqual([revised.width,revised.height],[1,1]);assert.equal(m.inspect().readableCopies,1);
 const natural=f.source(4,3,10,{naturalWidth:80,naturalHeight:60}),n=m.readableSource(natural);assert.deepEqual([n.width,n.height],[80,60]);return{identitySeparated:true,dimensionAndRevisionInvalidations:2,oversizedInvalidation:true,naturalSize:[n.width,n.height]};
});

check('two-slot LRU remains within the 12.5 MiB authored RGBA bound and releases evicted surfaces',()=>{
 const f=fixture(),m=f.m,a=f.source(1280,1280,1),b=f.source(1280,1280,2),c=f.source(1280,1280,3),aa=m.readableSource(a),bb=m.readableSource(b);assert.equal(m.inspect().readableBytes,13107200);assert.equal(m.readableSource(a),aa);const cc=m.readableSource(c);assert.deepEqual([bb.width,bb.height],[1,1]);assert.equal(m.readableSource(a),aa);assert.equal(m.readableSource(c),cc);
 let peak=0;for(let i=0;i<80;i++){m.readableSource(f.source(96+i,1280,i+10));const s=m.inspect();peak=Math.max(peak,s.readableBytes);assert.ok(s.readableCopies<=2);assert.ok(s.readableBytes<=13107200)}return{initialMaxBytes:13107200,maxCopies:2,additionalSources:80,observedLoopPeak:peak};
});

check('failed copies fall back, release temporary storage and retry without poisoning the cache',()=>{
 const f=fixture(),m=f.m,resident=m.readableSource(f.source(40,30));let failures=0;
 for(const stage of['context','draw','read','write']){const input=f.source(80,60,++failures+1);f.state.fail=stage;assert.equal(m.readableSource(input),null);const failed=f.canvases.at(-1);assert.deepEqual([failed.width,failed.height],[1,1]);assert.ok(m.inspect().readableCopies<=1);f.state.fail=null;const retry=m.readableSource(input);assert.ok(retry);assert.equal(m.readableSource(input),retry);m.clear();}
 assert.deepEqual([resident.width,resident.height],[1,1]);assert.equal(m.inspect().readableCopyFailures,4);assert.equal(m.inspect().readableCopies,0);assert.equal(m.inspect().readableBytes,0);return{failureStages:4,successfulRetries:4};
});

check('world surfaces and parts retain the original GPU composition API while clear releases mirrors',()=>{
 const f=fixture(),m=f.m,asset=f.source(128,96,1,{destructionComposite:false}),broken=new Set(['fin']);assert.equal(m.surface(asset,new Set()),asset);
 const original=m.surface(asset,broken,{style:0});assert.ok(original?.destructionRevision>0);assert.equal(original.requests[0].options,undefined,'World composite context remains unchanged');const oldTrace=original.draws.map(x=>({image:x.image,args:[...x.args],composite:x.composite,smoothing:x.smoothing})),metadata={width:original.width,height:original.height,revision:original.destructionRevision,sourcePath:original.sourcePath},mirror=m.readableSource(original);
 assert.notEqual(mirror,original);assert.equal(m.surface(asset,new Set(['fin']),{style:0}),original);assert.deepEqual(original.draws,oldTrace);assert.deepEqual({width:original.width,height:original.height,revision:original.destructionRevision,sourcePath:original.sourcePath},metadata);
 assert.equal(original.draws.filter(x=>x.image.sourcePath==='core.png').length,1);assert.equal(original.draws.some(x=>x.image.sourcePath==='fin.png'),false);assert.equal(original.draws.filter(x=>x.image.sourcePath==='tail.png').length,1);const part=m.part(asset,'fin');assert.equal(part.sourcePath,'fin.png');assert.equal(m.readableSource(part),null);m.clear();assert.deepEqual([original.width,original.height,mirror.width,mirror.height],[1,1,1,1]);assert.equal(m.inspect().composites,0);assert.equal(m.inspect().readableBytes,0);assert.equal(m.surface(asset,new Set()),asset);return{worldSourceIdentityUnchanged:true,partSourceUnchanged:true,clearReleasedBoth:true};
});

check('actual native palette sampling retains original cache keys and source rectangles while using a reusable mirror',()=>{
 const file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));let integration=gameSource;
 if(candidate&&!integration.includes('readableSource?.(asset)')){const old='sourceContext.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);';assert.equal(integration.split(old).length,2,'Candidate may alter only the palette draw source');integration=integration.replace(old,"sourceContext.drawImage(window.StarfighterDestruction?.readableSource?.(asset)||asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);")}
 support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(integration)+';');
 const dependencyRead="vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context,{filename:script})";assert.ok(support.includes(dependencyRead));support=support.replace(dependencyRead,"vm.runInContext(script==='destruction.js'?"+JSON.stringify(moduleSource)+":fs.readFileSync(path.join(root,script),'utf8'),context,{filename:script})");
 const harness=new Module(file,module);harness.filename=file;harness.paths=Module._nodeModulePaths(__dirname);harness._compile(support+'\nmodule.exports={createGame};',file);const g=harness.exports.createGame({ruleset:'streamlined-v1'}),a=g.api,m=g.sandbox.StarfighterDestruction,created=[],create=g.document.createElement;
 g.document.createElement=tag=>{const c=create(tag);if(tag==='canvas'){c.getContext('2d').trace=[];created.push(c)}return c};
 const asset=g.document.createElement('canvas');Object.assign(asset,{width:120,height:90,ready:true,hasAlpha:true,destructionComposite:true,destructionRevision:9,sourcePath:'private-immutable-composite'});const originalContext=asset.getContext('2d'),rect={x:4.25,y:7.5,w:23.75,h:31.125},options={hue:192,hueSpread:22},snapshot={width:asset.width,height:asset.height,sourcePath:asset.sourcePath,revision:asset.destructionRevision},palette=a.nativeMaterialPalette(asset,rect,options),mirror=m.readableSource(asset),keys=[...a.nativePaletteCache.keys()];
 assert.equal(palette.sourceAsset,asset);assert.deepEqual(plain(palette.sourceRect),rect);assert.equal(keys.length,1);assert.equal(a.nativeMaterialPalette(asset,{...rect},{...options}),palette);assert.deepEqual([...a.nativePaletteCache.keys()],keys);assert.deepEqual(originalContext.trace,[],'Palette preparation cannot mutate/draw into its world source');assert.deepEqual({width:asset.width,height:asset.height,sourcePath:asset.sourcePath,revision:asset.destructionRevision},snapshot);
 const samples=created.flatMap(c=>(c.getContext('2d').trace||[]).filter(x=>x.op==='drawImage'&&x.image===mirror));assert.equal(samples.length,1);assert.deepEqual(plain(samples[0].args.slice(1)),[rect.x,rect.y,rect.w,rect.h,0,0,96,96]);assert.equal(m.inspect().readableCopiesCreated,1);
 const fallback={ready:true,width:80,height:60,naturalWidth:80,naturalHeight:60,sourcePath:'private-raw-image'},raw=a.nativeMaterialPalette(fallback,rect,options);assert.equal(raw.sourceAsset,fallback);assert.ok(created.some(c=>(c.getContext('2d').trace||[]).some(x=>x.op==='drawImage'&&x.image===fallback)));assert.equal(m.inspect().readableCopiesCreated,1,'Raw image fallback must not create a mirror');return{paletteCacheEntries:a.nativePaletteCache.size,mirrorCopies:1,unchangedRoi:rect,rawImageFallback:true};
});

const failed=results.filter(r=>!r.passed).length,report={version:165,mode:candidate?'private-candidate':'production',dependency,sourceHashes:{game:hash(gameSource),destruction:hash(moduleSource)},passed:results.length-failed,failed,results,limits:['Actual mirror implementation and production palette function with traced Canvas APIs in disposable storage.','Mocked pixels do not establish GPU/CPU pixel equality, performance or actual heap usage.','Real-browser strict atlas/body/material comparisons and timing are separate evidence.','No production source, real profiles or friend release files are changed by this test.']};
fs.writeFileSync(path.join(root,'artifacts/readable-mirrors-v165-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} readable-mirror checks passed, ${failed} failed`);if(failed)process.exitCode=1;
