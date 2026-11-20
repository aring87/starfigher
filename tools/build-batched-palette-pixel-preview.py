"""Private exact-pixel comparison of frozen and batched native palette renderers.

Only QA artifacts are written. Production files, real pilots and releases are
untouched. The frozen single-sample functions and the candidate share the exact
same authored assets, but use independent unmodified destruction modules.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re

r = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--baseline', default='artifacts/palette-v165-baseline-game.js')
parser.add_argument('--candidate', default='artifacts/batched-palette-candidate-game.js')
# cpu = the comparison world canvas is CPU-backed (willReadFrequently), i.e. deterministic raster; diagnostic only.
# cpu-all additionally forces EVERY 2D canvas on the page (game, destruction module, samplers) to be CPU-backed.
parser.add_argument('--world', choices=['gpu', 'cpu', 'cpu-all'], default='gpu')
parser.add_argument('--failed-report', default='artifacts/palette-readback-v166-browser-full-initial.json')
args = parser.parse_args()
old_path, new_path = r / args.baseline, r / args.candidate
old, new = old_path.read_text(encoding='utf-8'), new_path.read_text(encoding='utf-8')
module_path = r / 'destruction.js'
module = module_path.read_text(encoding='utf-8')
assert 'prefetchNativeMaterialReadbacks' in new
assert 'nativePaletteReadbackScope' in new
assert hashlib.sha256(module_path.read_bytes()).hexdigest() == 'b3cab8b9f7e8cb478ca17a795ed9dd0624bf7537751cf37b2e81c208544a08a0', 'Use the original GPU compositor for this isolated experiment.'


def function_part(source, name, following):
    start = source.index('  function ' + name + '(')
    end = source.index(following, start)
    return source[start:end]


baseline_palette = function_part(old, 'nativeMaterialPalette', '  const materialEmissionBuffer').replace('function nativeMaterialPalette(', 'function qaBaselineNativeMaterialPalette(', 1)
baseline_renderer = function_part(old, 'renderIntegratedLateBoss', '  function drawVoidLeviathanSprite').replace('function renderIntegratedLateBoss(', 'function qaBaselineIntegratedRenderer(', 1)
baseline_early = function_part(old, 'drawEarlyMaterialSockets', '  function drawBloodstarCompositeFrame').replace('function drawEarlyMaterialSockets(', 'function qaBaselineEarlyMaterialSockets(', 1)
hashes = {
    'baselinePath': args.baseline,
    'baselineGame': hashlib.sha256(old_path.read_bytes()).hexdigest(),
    'candidatePath': args.candidate,
    'candidateGame': hashlib.sha256(new_path.read_bytes()).hexdigest(),
    'destruction': hashlib.sha256(module_path.read_bytes()).hexdigest(),
    'productionGame': hashlib.sha256((r / 'game.js').read_bytes()).hexdigest(),
    'baselinePaletteFunctionUtf8LF': hashlib.sha256(baseline_palette.encode()).hexdigest(),
    'baselineRendererFunctionUtf8LF': hashlib.sha256(baseline_renderer.encode()).hexdigest(),
    'baselineEarlySocketsFunctionUtf8LF': hashlib.sha256(baseline_early.encode()).hexdigest(),
}
failed_path = r / args.failed_report
failed_cases = []
if failed_path.exists():
    failed_report = json.loads(failed_path.read_text(encoding='utf-8'))
    for row in failed_report['rows']:
        if not row['passed']:
            failed_cases.append({key: row[key] for key in ['kind', 'id', 'phase', 'pose', 'mode', 'broken', 'cacheMode']})
    hashes['recheckOriginPath'] = args.failed_report
    hashes['recheckOriginSha256'] = hashlib.sha256(failed_path.read_bytes()).hexdigest()

# Reuse only the authored asset/pose helpers from the earlier strict comparator.
# The renderer selection, cache isolation, metrics and run orchestration below
# are independent; no mirror API or altered compositor is used here.
previous_builder = (r / 'tools/build-composite-readback-preview.py').read_text(encoding='utf-8')
previous_controller = re.search(r"controller=r'''([\s\S]*?)'''\.replace", previous_builder)[1]


def helper(name):
    match = re.search(r'\n (?:async )?function ' + re.escape(name) + r'\(', previous_controller)
    assert match, name
    start = match.start() + 1
    following = re.search(r'\n (?:async )?function ', previous_controller[match.end():])
    assert following, name
    end = match.end() + following.start()
    return previous_controller[start:end].replace('composite-', 'batch-pixel-')


helpers = '\n'.join(helper(name) for name in [
    'qaDiff', 'qaPixels', 'qaShow', 'qaWait', 'qaStates', 'qaEnemy',
    'qaBodyAssets', 'qaWaitBody', 'qaBodyGroups', 'qaMark',
])
# A frozen private scene executes only explicit painters; the real playing
# state exercises the normal prefetch eligibility guard without simulation.
helpers = helpers.replace("state='art';artInspection=", "state='playing';artInspection=")

controller = r'''
 update=()=>{};loop=()=>{};muted=true;soundtrack.pause();sfx.setMuted(true);playMusic=()=>{};resumeMusic=()=>{};
 const qaCandidateNativePalette=nativeMaterialPalette,qaCandidateIntegratedRenderer=renderIntegratedLateBoss,qaCandidateEarlySockets=drawEarlyMaterialSockets,qaNativeModule=window.StarfighterDestruction;
 __ORIGINAL_MODULE__
 const qaOld=window.StarfighterDestruction;
 __ORIGINAL_MODULE__
 const qaNew=window.StarfighterDestruction;window.StarfighterDestruction=qaNativeModule;
 const qaPanel=document.createElement('header');qaPanel.innerHTML='<b>PRIVATE BATCHED PALETTE PIXEL REVIEW</b><button id="batch-pixel-quick">RUN QUICK</button><button id="batch-pixel-full">RUN FULL PIXELS</button><button id="batch-pixel-recheck">RUN RECHECK FAILED</button><button id="batch-pixel-isolate">ISOLATE SAMPLER</button><button id="batch-pixel-firstuse">FIRST-USE PROBE</button><button id="batch-pixel-fuzz">FUZZ LAYOUTS</button><button id="batch-pixel-sequence">SEQUENCE PROBE</button><button id="batch-pixel-variants">VARIANT PROBE</button><button id="batch-pixel-cancel" disabled>CANCEL</button><button id="batch-pixel-json">SHOW REPORT</button><output id="batch-pixel-status">READY · frozen v165 versus batched palette sampling · memory-only pilot</output>';
 const qaMain=document.createElement('main');qaMain.innerHTML='<h1>Native boss materials / exact batched-readback pixels</h1><p>Frozen palette and late-boss rendering functions are compared with the candidate at identical native poses. Each renderer gets an isolated cold, hot or mixed palette-cache setup. The original GPU compositor and authored artwork remain unchanged. Every differing RGBA byte fails.</p><section><article><h2>FROZEN v165 / INDIVIDUAL READBACKS</h2><canvas id="batch-pixel-old" width="640" height="480"></canvas></article><article><h2>CANDIDATE / BATCHED COLD SAMPLES</h2><canvas id="batch-pixel-new" width="640" height="480"></canvas></article></section><output id="batch-pixel-example">No comparison yet.</output><pre id="batch-pixel-summary"></pre><textarea id="batch-pixel-report" aria-label="Batched palette pixel JSON" readonly hidden spellcheck="false" wrap="off"></textarea>';
 document.body.append(qaPanel,qaMain);const qaStyle=document.createElement('style');qaStyle.textContent='html,body{display:block!important;height:auto!important;overflow:auto!important;background:#07101a!important;color:#d6e9f1!important;padding:0!important}body::before,#game-shell{display:none!important}header{position:sticky;top:0;z-index:9999;background:#0b2233;padding:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:11px system-ui}header button{padding:6px;color:#d9edf7;border:1px solid #477889;background:#14384c;font:700 10px system-ui}main{max-width:1280px;margin:auto;padding:16px;font:13px/1.5 system-ui}h1{font-size:21px}section{display:grid;grid-template-columns:1fr 1fr;gap:10px}article{min-width:0;background:#0c1928;border:1px solid #325569}h2{font:700 11px system-ui;padding:7px}canvas{width:100%;height:auto;display:block;background:repeating-conic-gradient(#172b3a 0% 25%,#0c1c2b 0% 50%) 50%/20px 20px}#batch-pixel-example{display:block;margin:8px 0;color:#bcd8e8;font:11px monospace}pre{white-space:pre-wrap;padding:10px;border:1px solid #315268;background:#0a1a27;color:#bdd6df;font:11px/1.5 monospace}textarea{width:100%;height:250px;color:#bdd6df;background:#071522;font:10px monospace}textarea[hidden]{display:none!important}';document.head.append(qaStyle);
 let qaBusy=false,qaToken=0,qaReport=null,qaActiveMetrics=null,qaActiveBuilds=null;
 const qaStatus=document.querySelector('#batch-pixel-status'),qaSummary=document.querySelector('#batch-pixel-summary'),qaOutput=document.querySelector('#batch-pixel-report');
 const qaFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),qaSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const qaOriginalReadback=CanvasRenderingContext2D.prototype.getImageData,qaOriginalBuild=buildNativeSocketPalette;
 CanvasRenderingContext2D.prototype.getImageData=function(...args){if(qaActiveMetrics){qaActiveMetrics.readbacks++;qaActiveMetrics.readbackPixels+=Math.abs((args[2]||0)*(args[3]||0))}return qaOriginalReadback.apply(this,args)};
 buildNativeSocketPalette=function(...args){
  if(qaActiveMetrics)qaActiveMetrics.paletteBuilds++;
  const input=qaActiveBuilds?args[0].slice():null,result=qaOriginalBuild.apply(this,args);
  if(qaActiveBuilds){const options=args[3]||{};qaActiveBuilds.push({width:args[1],height:args[2],options:{hue:Number.isFinite(options.hue)?options.hue:null,hueSpread:options.hueSpread||38,lowLight:!!options.lowLight},input,inputAfter:args[0].slice(),weights:result.weights.slice(),sealed:result.sealed.slice(),hot:result.hot.slice(),emission:result.emission.slice()})}
  return result
 };
 function qaArrayDiff(a,b,rgba=false){
  if(a.constructor.name!==b.constructor.name||a.length!==b.length)return{error:'typed-array type/length mismatch',oldType:a.constructor.name,candidateType:b.constructor.name,oldLength:a.length,candidateLength:b.length};
  let bytes=0,alpha=0,max=0;const first=[];for(let index=0;index<a.length;index++)if(a[index]!==b[index]){bytes++;if(rgba&&index%4===3)alpha++;max=Math.max(max,Math.abs(a[index]-b[index]));if(first.length<8)first.push({index,old:a[index],candidate:b[index]})}return{error:bytes?'typed-array byte mismatch':'',bytes,alpha,max,first}
 }
 function qaCompareMaterialBuilds(oldBuilds,newBuilds){
  const result={baselineBuilds:oldBuilds.length,candidateBuilds:newBuilds.length,countExact:oldBuilds.length===newBuilds.length,metadataExact:true,inputsExact:true,layersExact:true,inputMutationExact:true,inputBytesCompared:0,layerBytesCompared:0,records:[]};
  for(let index=0;index<Math.min(oldBuilds.length,newBuilds.length);index++){
   const a=oldBuilds[index],b=newBuilds[index],metadataExact=a.width===b.width&&a.height===b.height&&JSON.stringify(a.options)===JSON.stringify(b.options),input=qaArrayDiff(a.input,b.input,true),oldMutation=qaArrayDiff(a.input,a.inputAfter,true),newMutation=qaArrayDiff(b.input,b.inputAfter,true),layers=Object.fromEntries(['weights','sealed','hot','emission'].map(key=>[key,qaArrayDiff(a[key],b[key],key!=='weights')]));
   const layerExact=Object.values(layers).every(diff=>!diff.error),mutationExact=!oldMutation.error&&!newMutation.error,record={index,width:a.width,height:a.height,options:a.options,metadataExact,inputExact:!input.error,layersExact:Object.fromEntries(Object.entries(layers).map(([key,diff])=>[key,!diff.error])),inputMutationExact:mutationExact};
   result.metadataExact&&=metadataExact;result.inputsExact&&=!input.error;result.layersExact&&=layerExact;result.inputMutationExact&&=mutationExact;result.inputBytesCompared+=a.input.byteLength;result.layerBytesCompared+=['weights','sealed','hot','emission'].reduce((sum,key)=>sum+a[key].byteLength,0);
   if(!metadataExact){record.baselineMetadata={width:a.width,height:a.height,options:a.options};record.candidateMetadata={width:b.width,height:b.height,options:b.options}}if(input.error)record.inputDifference=input;if(!layerExact)record.layerDifferences=layers;if(!mutationExact)record.inputMutations={baseline:oldMutation,candidate:newMutation};result.records.push(record)
  }
  result.allExact=result.countExact&&result.metadataExact&&result.inputsExact&&result.layersExact&&result.inputMutationExact;return result
 }
 // Repeat diagnostics: world pixels and actual palette input/layer bytes, kept separate.
 function qaRepeat(result,repeat){return{baselineSelf:qaDiff(result.a.pixels,repeat.a.pixels),candidateSelf:qaDiff(result.b.pixels,repeat.b.pixels),cross:repeat.difference,cacheBeforeEqual:repeat.cacheBeforeEqual,cacheAfterEqual:repeat.cacheAfterEqual,material:{baselineSelf:qaMaterialBrief(qaCompareMaterialBuilds(result.a.builds,repeat.a.builds)),candidateSelf:qaMaterialBrief(qaCompareMaterialBuilds(result.b.builds,repeat.b.builds)),cross:qaMaterialBrief(repeat.materialData)}}}
 // Report-sized view: per-build records are retained only when something differs.
 function qaMaterialBrief(m){const {records,...rest}=m;return m.allExact?rest:{...rest,records:records.filter(r=>!r.metadataExact||!r.inputExact||!r.inputMutationExact||Object.values(r.layersExact).some(v=>!v))}}
 function qaBatchStats(){const s=prefetchNativeMaterialReadbacks.stats;return{readbacks:s?.readbacks||0,tiles:s?.tiles||0,batches:s?.batches||0,maxTiles:s?.maxTiles||0}}
 function qaCacheSnapshot(){return [...nativePaletteCache].map(([key,value])=>({keyTail:key.slice(key.indexOf('/')+1),source:value.sourceAsset?.sourcePath||value.sourceAsset?.src||value.sourceAsset?.frameSample?.source?.sourcePath||null,rect:value.sourceRect,frameSample:value.sourceAsset?.frameSample?{rect:value.sourceAsset.frameSample.rect,bounds:value.sourceAsset.frameSample.bounds}:null}))}
 function qaBody(which,e,frameOverride){
  if(nativePaletteReadbackScope!==null)throw Error('Readback scope leaked before '+which+' draw');
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=600;
  const oldContext=ctx,oldModule=window.StarfighterDestruction,oldPalette=nativeMaterialPalette,oldRenderer=renderIntegratedLateBoss,oldEarly=drawEarlyMaterialSockets,oldMetrics=qaActiveMetrics,oldBuilds=qaActiveBuilds,before=qaBatchStats(),builds=[];
  const metrics={readbacks:0,readbackPixels:0,paletteBuilds:0,batchReadbacks:0,batchTiles:0,batches:0,maxBatchTiles:0};
  ctx=canvas.getContext('2d',QA_WORLD_CPU?{willReadFrequently:true}:undefined);window.StarfighterDestruction=which==='baseline'?qaOld:qaNew;nativeMaterialPalette=which==='baseline'?qaBaselineNativeMaterialPalette:qaCandidateNativePalette;renderIntegratedLateBoss=which==='baseline'?qaBaselineIntegratedRenderer:qaCandidateIntegratedRenderer;drawEarlyMaterialSockets=which==='baseline'?qaBaselineEarlyMaterialSockets:qaCandidateEarlySockets;qaActiveMetrics=metrics;qaActiveBuilds=builds;
  try{ctx.scale(1.5,1.5);ctx.translate(240.125,200.375);ctx.save();applyEnemyPose(e,false);drawNativeFracturedBody(e,()=>e.kind==='mini'?paintMiniBossNativeBody(e,frameOverride):paintNativeBossBody(e,e.hitFlash));ctx.restore();if(e.kind==='mini')drawMiniBossFireFlash(e);else drawWeakPoints(e)}
  finally{ctx=oldContext;window.StarfighterDestruction=oldModule;nativeMaterialPalette=oldPalette;renderIntegratedLateBoss=oldRenderer;drawEarlyMaterialSockets=oldEarly;qaActiveMetrics=oldMetrics;qaActiveBuilds=oldBuilds}
  if(nativePaletteReadbackScope!==null)throw Error('Readback scope leaked after '+which+' draw');
  const after=qaBatchStats();metrics.batchReadbacks=after.readbacks-before.readbacks;metrics.batchTiles=after.tiles-before.tiles;metrics.batches=after.batches-before.batches;metrics.maxBatchTiles=after.maxTiles;
  // Read the old world output before another render can clear its palettes or
  // reuse shared material scratch canvases. Capture reads are not work counts.
  return{canvas,pixels:qaPixels(canvas),metrics,cache:qaCacheSnapshot(),builds}
 }
 function qaCacheSetup(which,cacheMode,e,frameOverride){
  nativePaletteCache.clear();
  if(cacheMode!=='cold')qaBody(which,e,frameOverride);
  if(cacheMode==='mixed'){let index=0;for(const key of [...nativePaletteCache.keys()])if(index++%2===0)nativePaletteCache.delete(key)}
  return qaCacheSnapshot()
 }
 function qaCompare(e,frameOverride,cacheMode,order='baseline-first'){
  let oldBefore,newBefore,a,b;
  if(order==='candidate-first'){newBefore=qaCacheSetup('candidate',cacheMode,e,frameOverride);b=qaBody('candidate',e,frameOverride);oldBefore=qaCacheSetup('baseline',cacheMode,e,frameOverride);a=qaBody('baseline',e,frameOverride)}
  else{oldBefore=qaCacheSetup('baseline',cacheMode,e,frameOverride);a=qaBody('baseline',e,frameOverride);newBefore=qaCacheSetup('candidate',cacheMode,e,frameOverride);b=qaBody('candidate',e,frameOverride)}
  const difference=qaDiff(a.pixels,b.pixels),cacheBeforeEqual=JSON.stringify(oldBefore)===JSON.stringify(newBefore),cacheAfterEqual=JSON.stringify(a.cache)===JSON.stringify(b.cache);
  return{a,b,difference,cacheBeforeEqual,cacheAfterEqual,oldBefore,newBefore,order,materialData:qaCompareMaterialBuilds(a.builds,b.builds)}
 }
 __POSE_HELPERS__
 function qaSummarize(){const r=qaReport,m=r.materialData;qaSummary.textContent=`${r.rows.length} comparisons · ${r.failures} failures · ${r.comparedPixels.toLocaleString()} full pixels compared\nCache modes: ${JSON.stringify(r.rows.reduce((s,x)=>(s[x.cacheMode]=(s[x.cacheMode]||0)+1,s),{}))}\nMeasured render readbacks: ${r.work.baselineReadbacks} → ${r.work.candidateReadbacks}; candidate batch calls ${r.work.candidateBatchReadbacks}, tiles ${r.work.candidateBatchTiles}\nPalette data: ${m.buildsCompared} build pairs · ${m.rowsWithInputDifferences} input / ${m.rowsWithLayerDifferences} layer / ${m.rowsWithMetadataDifferences} metadata / ${m.rowsWithInputMutations} mutation discrepancies\n${r.mode==='recheck-failed'?`Recheck ${r.rows.length} trials + ${r.controlComparisons} strict self/cross controls · ${r.controlFailures} world control failures / ${r.materialControlFailures} palette control failures\n`:''}Independent frozen/candidate renderer functions; original GPU compositor. Candidate ${BATCH_PALETTE_HASHES.candidateGame.slice(0,16)}`}
 function qaRecord(spec,pose,mode,broken,cacheMode,result){
  const {a,b,difference,cacheBeforeEqual,cacheAfterEqual}=result,contract=[];
  if(!cacheBeforeEqual)contract.push('cache setup metadata/order mismatch');if(!cacheAfterEqual)contract.push('cache result metadata/order mismatch');if(cacheMode==='hot'&&(a.metrics.readbacks||b.metrics.readbacks))contract.push('hot render unexpectedly read pixels');
  const passed=!difference.error&&!contract.length;
  const row={materialState:'exposed',...spec,pose,mode,broken,cacheMode,passed,difference,contract,baseline:a.metrics,candidate:b.metrics,cacheBeforeEqual,cacheAfterEqual,cacheEntriesBefore:result.oldBefore.length,cacheEntriesAfter:a.cache.length,materialData:qaMaterialBrief(result.materialData)};
  const material=qaReport.materialData,m=result.materialData;material.buildsCompared+=m.records.length;material.inputBytesCompared+=m.inputBytesCompared;material.layerBytesCompared+=m.layerBytesCompared;if(!m.inputsExact)material.rowsWithInputDifferences++;if(!m.layersExact)material.rowsWithLayerDifferences++;if(!m.countExact||!m.metadataExact)material.rowsWithMetadataDifferences++;if(!m.inputMutationExact)material.rowsWithInputMutations++;
  qaReport.rows.push(row);qaReport.comparedPixels+=a.pixels.width*a.pixels.height;if(!passed)qaReport.failures++;
  qaReport.work.baselineReadbacks+=a.metrics.readbacks;qaReport.work.candidateReadbacks+=b.metrics.readbacks;qaReport.work.candidateBatchReadbacks+=b.metrics.batchReadbacks;qaReport.work.candidateBatchTiles+=b.metrics.batchTiles;
  if(!passed){row.baselineCacheBefore=result.oldBefore;row.candidateCacheBefore=result.newBefore;row.baselineCacheAfter=a.cache;row.candidateCacheAfter=b.cache;}
  if(!passed||qaReport.rows.length%24===1)qaShow(a.canvas,b.canvas,`${spec.kind} ${spec.id} phase${spec.phase} / pose${pose} / ${mode} / ${cacheMode} / ${passed?'EXACT':difference.error||contract.join(', ')}`);
  qaSummarize();return row
 }
 function qaSpecs(representative){return representative?[{kind:'mini',id:0,phase:1},{kind:'boss',id:1,phase:2},{kind:'boss',id:5,phase:2},{kind:'boss',id:6,phase:2}]:[...Array.from({length:10},(_,id)=>({kind:'mini',id,phase:1})),...Array.from({length:10},(_,id)=>[1,2].map(phase=>({kind:'boss',id,phase}))).flat(),...Array.from({length:2},(_,id)=>[1,2,3,4].map(phase=>({kind:'epic',id,phase}))).flat()]}
 async function qaCases(token,quick){
  for(const cacheMode of ['cold','hot','mixed'])for(const spec of qaSpecs(quick||cacheMode!=='cold')){
   if(token!==qaToken)throw Error('CANCELLED');const e=qaEnemy(spec);await qaWaitBody(e,token);const groups=qaBodyGroups(e),originalStates=qaStates(groups).filter((v,i,all)=>i===all.findIndex(a=>a.ids.join('/')===v.ids.join('/'))),allStates=[{name:'intact',ids:[]},...originalStates].filter((v,i,all)=>i===all.findIndex(a=>a.ids.join('/')===v.ids.join('/'))),states=quick||cacheMode!=='cold'?allStates.filter((v,i)=>i===0||v.ids.join('/')===originalStates[0]?.ids.join('/')):allStates;
   for(const pose of [0,1])for(const mode of ['normal','reduced','hit'])for(const state of states){
    if(token!==qaToken)throw Error('CANCELLED');settings.reducedMotion=mode==='reduced';e.hitFlash=mode==='hit'?.11:0;const rates={5:e.phase===2?3.7:3.35,6:e.phase===2?4.05:3.5,7:e.phase===2?4:3.6,8:e.phase===2?4.1:3.65,9:e.phase===2?3.9:3.55};e.clock=pose?e.epic?9.02/((3.35+e.phase*.14)*3):e.type>=5?9.02/(rates[e.type]*3):.72:.001;t=e.clock;e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-e.clock%1.35;qaMark(e,state.ids);
    const override=e.kind==='mini'?pose*7:undefined,result=qaCompare(e,override,cacheMode),row=qaRecord(spec,pose,mode,state.ids,cacheMode,result);
    if(!row.passed){const repeat=qaCompare(e,override,cacheMode);row.repeat=qaRepeat(result,repeat);}
    qaStatus.textContent=`${cacheMode.toUpperCase()} · ${spec.kind} ${spec.id+1} phase${spec.phase} · ${qaReport.rows.length} comparisons · ${qaReport.failures} failures`;if(qaReport.rows.length%6===0)await qaFrame()
   }
  }
  await qaMaterialStates(token)
 }
 function qaSetExactPose(e,spec){
  settings.reducedMotion=spec.mode==='reduced';e.hitFlash=spec.mode==='hit'?.11:0;
  const materialState=spec.materialState||'exposed';e.weakOpen=materialState==='exposed';e.weakTelegraph=materialState==='opening'?.28:0;e.coreAperture=e.weakOpen?1:materialState==='opening'?.2:0;
  const rates={5:e.phase===2?3.7:3.35,6:e.phase===2?4.05:3.5,7:e.phase===2?4:3.6,8:e.phase===2?4.1:3.65,9:e.phase===2?3.9:3.55};e.clock=spec.pose?e.epic?9.02/((3.35+e.phase*.14)*3):e.type>=5?9.02/(rates[e.type]*3):.72:.001;t=e.clock;e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-e.clock%1.35;qaMark(e,spec.broken)
 }
 async function qaMaterialStates(token){
  for(const base of [{kind:'boss',id:5,phase:2},{kind:'boss',id:6,phase:2}]){
   const e=qaEnemy(base);await qaWaitBody(e,token);const first=qaStates(qaBodyGroups(e))[0],states=[[],first.ids];
   for(const pose of [0,1])for(const materialState of ['sealed','opening'])for(const broken of states){
    if(token!==qaToken)throw Error('CANCELLED');const spec={...base,pose,mode:'normal',materialState,broken,cacheMode:'cold'};qaSetExactPose(e,spec);const result=qaCompare(e,undefined,'cold'),row=qaRecord(spec,pose,'normal',broken,'cold',result);
    if(!row.passed){const repeat=qaCompare(e,undefined,'cold');row.repeat=qaRepeat(result,repeat);}
    qaStatus.textContent=`MATERIAL · ${base.id===5?'Void':'Prism'} phase2 · ${materialState} · ${qaReport.rows.length} comparisons · ${qaReport.failures} failures`;if(qaReport.rows.length%4===0)await qaFrame()
   }
  }
 }
 // Sampler isolation (diagnostic only). For each (asset, rect) the frozen renderer really used,
 // compare a plain single-canvas read with strip variants: clip on/off, tile index, full candidate config.
 function qaTileRead(asset,rect,config){
  const N=96,canvas=document.createElement('canvas');canvas.width=N;canvas.height=N*config.count;
  const c=canvas.getContext('2d',{willReadFrequently:true});
  if(config.full){c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.shadowBlur=0;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low'}
  const y=config.index*N;
  if(config.clip){c.save();try{c.beginPath();c.rect(0,y,N,N);c.clip();c.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,y,N,N)}finally{c.restore()}}
  else c.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,y,N,N);
  return c.getImageData(0,y,N,N).data
 }
 function qaStripRead(entries,clip,full){
  const N=96,canvas=document.createElement('canvas');canvas.width=N;canvas.height=N*entries.length;
  const c=canvas.getContext('2d',{willReadFrequently:true});
  if(full){c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.shadowBlur=0;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low'}
  entries.forEach((entry,index)=>{const y=index*N,r=entry.rect;if(clip){c.save();try{c.beginPath();c.rect(0,y,N,N);c.clip();c.drawImage(entry.asset,r.x,r.y,r.w,r.h,0,y,N,N)}finally{c.restore()}}else c.drawImage(entry.asset,r.x,r.y,r.w,r.h,0,y,N,N)});
  const all=c.getImageData(0,0,N,N*entries.length).data;return entries.map((_,index)=>all.subarray(index*N*N*4,(index+1)*N*N*4))
 }
 async function qaIsolate(token){
  const names=['single-repeat','single-clip','tall-tile-noclip','tall-tile-clip','strip-noclip','strip-clip','strip-clip-full'];
  qaReport.environment={userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio};qaReport.isolationVariants=names;qaReport.isolation=[];qaReport.isolationTotals=Object.fromEntries(names.map(n=>[n,{exact:0,different:0}]));
  for(const spec of qaSpecs(false).filter(s=>s.kind!=='mini')){
   if(token!==qaToken)throw Error('CANCELLED');
   const e=qaEnemy(spec);await qaWaitBody(e,token);qaSetExactPose(e,{...spec,pose:0,mode:'normal',materialState:'exposed',broken:[]});
   nativePaletteCache.clear();qaBody('baseline',e);
   const entries=[...nativePaletteCache.values()].map(v=>({asset:v.sourceAsset,rect:{...v.sourceRect}}));
   if(!entries.length)continue;
   const strips={'strip-noclip':qaStripRead(entries,false,false),'strip-clip':qaStripRead(entries,true,false),'strip-clip-full':qaStripRead(entries,true,true)};
   entries.forEach((entry,index)=>{
    const single=qaTileRead(entry.asset,entry.rect,{count:1,index:0}),got={'single-repeat':qaTileRead(entry.asset,entry.rect,{count:1,index:0}),'single-clip':qaTileRead(entry.asset,entry.rect,{count:1,index:0,clip:true}),'tall-tile-noclip':qaTileRead(entry.asset,entry.rect,{count:entries.length,index}),'tall-tile-clip':qaTileRead(entry.asset,entry.rect,{count:entries.length,index,clip:true}),'strip-noclip':strips['strip-noclip'][index],'strip-clip':strips['strip-clip'][index],'strip-clip-full':strips['strip-clip-full'][index]};
    const a=entry.asset,row={kind:spec.kind,id:spec.id,phase:spec.phase,entry:index,entries:entries.length,assetType:a.constructor.name,assetWidth:a.width,assetHeight:a.height,naturalWidth:a.naturalWidth??null,destructionComposite:!!a.destructionComposite,hasFrameSample:!!a.frameSample,rect:entry.rect,scaleToTile:[entry.rect.w/96,entry.rect.h/96],variants:{}};
    for(const name of names){const d=qaArrayDiff(single,got[name],true);row.variants[name]=d.error?{bytes:d.bytes,alpha:d.alpha,max:d.max}:{bytes:0};qaReport.isolationTotals[name][d.error?'different':'exact']++}
    qaReport.isolation.push(row)
   });
   qaStatus.textContent=`ISOLATE · ${spec.kind} ${spec.id+1} phase${spec.phase} · ${qaReport.isolation.length} entries`;await qaFrame()
  }
  qaReport.rows=[];qaSummary.textContent=names.map(n=>`${n}: ${qaReport.isolationTotals[n].exact} exact / ${qaReport.isolationTotals[n].different} different`).join('\n')
 }
 // First-use probe (diagnostic only): for the specs whose first comparison failed in the full run,
 // compare in-render baseline inputs, in-render candidate inputs and post-hoc plain reads of the same
 // (asset, rect), repeated in both render orders. Run immediately after page load to preserve first use.
 async function qaFirstUse(token){
  qaReport.environment={userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio};qaReport.firstUse=[];
  const brief=d=>d.error?{bytes:d.bytes,alpha:d.alpha,max:d.max}:{bytes:0};
  for(const spec of [{kind:'boss',id:6,phase:1},{kind:'epic',id:0,phase:1},{kind:'boss',id:7,phase:2},{kind:'boss',id:5,phase:2}]){
   const e=qaEnemy(spec);await qaWaitBody(e,token);
   for(const order of ['baseline-first','baseline-first','baseline-first','candidate-first','candidate-first','candidate-first'])for(const mode of ['normal']){
    if(token!==qaToken)throw Error('CANCELLED');
    qaSetExactPose(e,{...spec,pose:0,mode,materialState:'exposed',broken:[]});
    const result=qaCompare(e,undefined,'cold',order),entries=[...nativePaletteCache.values()].map(v=>({asset:v.sourceAsset,rect:{...v.sourceRect}})),single=entries.map(en=>qaTileRead(en.asset,en.rect,{count:1,index:0})),strip=qaStripRead(entries,true,true);
    const per=entries.map((_,i)=>({entry:i,baselineVsSingle:brief(qaArrayDiff(result.a.builds[i].input,single[i],true)),candidateVsSingle:brief(qaArrayDiff(result.b.builds[i].input,single[i],true)),baselineVsCandidate:brief(qaArrayDiff(result.a.builds[i].input,result.b.builds[i].input,true)),stripVsSingle:brief(qaArrayDiff(strip[i],single[i],true))}));
    qaReport.firstUse.push({spec,order,sequence:qaReport.firstUse.length,entries:entries.length,worldPixels:result.difference.error?{bytes:result.difference.bytes,max:result.difference.max}:{bytes:0},builds:{baseline:result.a.builds.length,candidate:result.b.builds.length},materialAllExact:result.materialData.allExact,perEntry:per});
    qaStatus.textContent=`FIRST-USE · ${spec.kind} ${spec.id+1} phase${spec.phase} · ${order} · ${qaReport.firstUse.length} compares`;await qaFrame()
   }
  }
 }
 // Layout fuzz (diagnostic only): seeded perturbations of real (asset, rect) pairs; every strip layout is
 // compared tile-by-tile with a plain single-canvas read. Searches for a layout that is exact by construction.
 function qaRng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 let qaScratch=null;
 function qaLayoutStrip(entries,layout){
  const N=96,n=entries.length,stride=layout==='vertical-stride128'?128:N,horizontal=layout==='horizontal',canvas=document.createElement('canvas');
  canvas.width=horizontal?N*n:N;canvas.height=horizontal?N:(layout==='vertical-stride128'?stride*(n-1)+N:N*n);
  const c=canvas.getContext('2d',{willReadFrequently:true});
  if(layout==='copy-scratch'&&!qaScratch){qaScratch=document.createElement('canvas');qaScratch.width=qaScratch.height=N}
  entries.forEach((entry,index)=>{
   const r=entry.rect,y=horizontal?0:index*stride,x=horizontal?index*N:0;
   if(layout==='vertical-clip'||layout==='horizontal'||layout==='vertical-stride128'){c.save();try{c.beginPath();c.rect(x,y,N,N);c.clip();c.drawImage(entry.asset,r.x,r.y,r.w,r.h,x,y,N,N)}finally{c.restore()}}
   else if(layout==='vertical-noclip')c.drawImage(entry.asset,r.x,r.y,r.w,r.h,x,y,N,N);
   else if(layout==='translate'){c.save();try{c.translate(x,y);c.beginPath();c.rect(0,0,N,N);c.clip();c.drawImage(entry.asset,r.x,r.y,r.w,r.h,0,0,N,N)}finally{c.restore()}}
   else if(layout==='copy-scratch'){const s=qaScratch.getContext('2d',{willReadFrequently:true});s.clearRect(0,0,N,N);s.drawImage(entry.asset,r.x,r.y,r.w,r.h,0,0,N,N);c.drawImage(qaScratch,x,y)}
   else throw Error('unknown layout '+layout)
  });
  const all=horizontal?null:c.getImageData(0,0,canvas.width,canvas.height).data;
  return entries.map((_,index)=>horizontal?c.getImageData(index*N,0,N,N).data:all.subarray(index*(layout==='vertical-stride128'?stride:N)*N*4,(index*(layout==='vertical-stride128'?stride:N)+N)*N*4))
 }
 async function qaFuzz(token){
  const layouts=['vertical-clip','vertical-noclip','translate','horizontal','vertical-stride128','copy-scratch','candidate-actual'],rand=qaRng(166),STRIPS=40,TILES=4;
  // The real candidate function under test (palette cache cleared so every tile is a pending miss).
  const qaActual=pick=>{nativePaletteCache.clear();const options={hue:0},prepared=prefetchNativeMaterialReadbacks(pick.map(en=>({asset:en.asset,rect:en.rect,options})));return prepared?pick.map(en=>prepared.get(nativePaletteKey(en.asset,en.rect,options))||null):null};
  qaReport.environment={userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio};qaReport.fuzz={seed:166,stripsPerSeedRect:STRIPS,tilesPerStrip:TILES,layouts,totals:Object.fromEntries(layouts.map(l=>[l,{tiles:0,different:0,maxDiff:0,byTileIndex:[0,0,0,0]}])),examples:{},seedRects:0};
  const seeds=[];
  for(const spec of qaSpecs(false).filter(s=>s.kind!=='mini')){
   if(token!==qaToken)throw Error('CANCELLED');
   const e=qaEnemy(spec);await qaWaitBody(e,token);qaSetExactPose(e,{...spec,pose:0,mode:'normal',materialState:'exposed',broken:[]});nativePaletteCache.clear();qaBody('baseline',e);
   for(const v of nativePaletteCache.values())seeds.push({asset:v.sourceAsset,rect:{...v.sourceRect}})
  }
  qaReport.fuzz.seedRects=seeds.length;
  const perturb=seed=>{const q=[0,.5,.25,.05,.001][Math.floor(rand()*5)],snap=v=>q?Math.round(v/q)*q:v,w=Math.max(12,seed.rect.w*(.8+rand()*.45)),h=Math.max(12,seed.rect.h*(.8+rand()*.45));return{asset:seed.asset,rect:{x:Math.max(0,snap(seed.rect.x+(rand()-.5)*40)),y:Math.max(0,snap(seed.rect.y+(rand()-.5)*40)),w:snap(w)||w,h:snap(h)||h}}};
  for(let strip=0;strip<STRIPS;strip++){
   if(token!==qaToken)throw Error('CANCELLED');
   for(let group=0;group<seeds.length;group+=TILES){
    const pick=Array.from({length:TILES},(_,i)=>perturb(seeds[(group+i)%seeds.length])).filter(en=>en.asset===undefined?false:true);
    // Tiles of one strip may use different assets; a draw only needs each asset to be ready.
    const singles=pick.map(en=>qaTileRead(en.asset,en.rect,{count:1,index:0}));
    for(const layout of layouts){
     const got=layout==='candidate-actual'?qaActual(pick):qaLayoutStrip(pick,layout),t=qaReport.fuzz.totals[layout];
     if(!got){t.unprepared=(t.unprepared||0)+1;continue}
     got.forEach((tile,index)=>{if(!tile){t.skippedDuplicateKey=(t.skippedDuplicateKey||0)+1;return}const d=qaArrayDiff(singles[index],tile,true);t.tiles++;if(d.error){t.different++;t.byTileIndex[index]++;t.maxDiff=Math.max(t.maxDiff,d.max);const list=qaReport.fuzz.examples[layout]||(qaReport.fuzz.examples[layout]=[]);if(list.length<6)list.push({tileIndex:index,rect:pick[index].rect,bytes:d.bytes,alpha:d.alpha,max:d.max,assetType:pick[index].asset.constructor.name})}})
    }
   }
   if(strip%4===0){qaStatus.textContent=`FUZZ · strip ${strip+1}/${STRIPS} · `+layouts.map(l=>l.split('-')[0]+':'+qaReport.fuzz.totals[l].different).join(' ');await qaFrame()}
  }
 }
 // Sequence probe (diagnostic only): replay intact/broken renders in a fixed order and report, at every
 // step, baseline-vs-candidate palette input, each versus a post-hoc plain read, and the source types.
 async function qaSequence(token){
  qaReport.environment={userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio};qaReport.sequence=[];
  const brief=d=>d.error?{bytes:d.bytes,alpha:d.alpha,max:d.max}:{bytes:0},spec={kind:'boss',id:5,phase:2},e=qaEnemy(spec);await qaWaitBody(e,token);
  const first=qaStates(qaBodyGroups(e))[0].ids;
  const steps=[['intact','normal'],['broken','normal'],['intact','reduced'],['intact','reduced'],['intact','normal'],['broken','normal'],['broken','normal'],['intact','normal'],['intact','hit'],['intact','hit']];
  for(const [state,mode] of steps){
   if(token!==qaToken)throw Error('CANCELLED');
   qaSetExactPose(e,{...spec,pose:0,mode,materialState:'exposed',broken:state==='broken'?first:[]});
   const result=qaCompare(e,undefined,'cold'),entries=[...nativePaletteCache.values()].map(v=>({asset:v.sourceAsset,rect:{...v.sourceRect}})),single=entries.map(en=>qaTileRead(en.asset,en.rect,{count:1,index:0}));
   qaReport.sequence.push({step:qaReport.sequence.length,state,mode,sources:entries.map(en=>en.asset.constructor.name+(en.asset.destructionComposite?'+composite':'')),world:result.difference.error?{bytes:result.difference.bytes,max:result.difference.max}:{bytes:0},perEntry:entries.map((_,i)=>({baselineVsCandidate:brief(qaArrayDiff(result.a.builds[i].input,result.b.builds[i].input,true)),baselineVsSingle:brief(qaArrayDiff(result.a.builds[i].input,single[i],true)),candidateVsSingle:brief(qaArrayDiff(result.b.builds[i].input,single[i],true))}))});
   qaStatus.textContent=`SEQUENCE · step ${qaReport.sequence.length}/${steps.length}`;await qaFrame()
  }
 }
 // Variant probe (diagnostic only): replay the failing intact/broken sequence with alternative
 // implementations of the candidate's prefetch, swapped in through the game's own function binding.
 function qaVariantPrefetch(variant){
  const N=96,LIMIT=16;let strip=null,scratch=null;
  return function(samples){
   const pending=[],seen=new Set();
   for(const sample of samples){
    if(!sample.asset?.ready||![sample.rect.x,sample.rect.y,sample.rect.w,sample.rect.h].every(Number.isFinite)||sample.rect.w<=0||sample.rect.h<=0)return null;
    const key=nativePaletteKey(sample.asset,sample.rect,sample.options);if(!nativePaletteCache.has(key)&&!seen.has(key)){seen.add(key);pending.push({...sample,key})}
   }
   if(pending.length<2||pending.length>LIMIT)return null;
   if(!strip||variant==='fresh-strip'||variant==='fresh-both')strip=document.createElement('canvas');
   if(!scratch||variant==='fresh-scratch-batch'||variant==='fresh-both')scratch=document.createElement('canvas');
   if(strip.width!==N||strip.height!==N*pending.length){strip.width=N;strip.height=N*pending.length}
   if(scratch.width!==N||scratch.height!==N){scratch.width=N;scratch.height=N}
   const raster=strip.getContext('2d',{willReadFrequently:true});
   for(const c of[raster,scratch.getContext('2d',{willReadFrequently:true})]){c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.shadowBlur=0;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low'}
   raster.clearRect(0,0,strip.width,strip.height);
   pending.forEach((sample,index)=>{
    const r=sample.rect;
    if(variant==='direct-clip'){raster.save();try{raster.beginPath();raster.rect(0,index*N,N,N);raster.clip();raster.drawImage(sample.asset,r.x,r.y,r.w,r.h,0,index*N,N,N)}finally{raster.restore()}return}
    let tile=scratch;
    if(variant==='fresh-scratch-tile'){tile=document.createElement('canvas');tile.width=tile.height=N}
    const t=tile.getContext('2d',{willReadFrequently:true});if(variant==='fresh-scratch-tile'){t.imageSmoothingEnabled=true;t.imageSmoothingQuality='low'}
    t.clearRect(0,0,N,N);t.drawImage(sample.asset,r.x,r.y,r.w,r.h,0,0,N,N);raster.drawImage(tile,0,index*N)
   });
   const rgba=raster.getImageData(0,0,N,N*pending.length).data,prepared=new Map();
   pending.forEach((sample,index)=>prepared.set(sample.key,rgba.subarray(index*N*N*4,(index+1)*N*N*4)));
   return prepared
  }
 }
 async function qaVariants(token){
  qaReport.environment={userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio};qaReport.variants=[];
  const original=prefetchNativeMaterialReadbacks,spec={kind:'boss',id:5,phase:2},steps=[['intact','normal'],['broken','normal'],['intact','reduced'],['broken','normal'],['intact','normal'],['intact','hit']];
  try{
   for(const variant of ['current','fresh-scratch-batch','fresh-scratch-tile','fresh-strip','fresh-both','direct-clip']){
    prefetchNativeMaterialReadbacks=variant==='current'?original:qaVariantPrefetch(variant);
    const e=qaEnemy(spec);await qaWaitBody(e,token);const first=qaStates(qaBodyGroups(e))[0].ids,row={variant,steps:[]};
    for(const [state,mode] of steps){
     if(token!==qaToken)throw Error('CANCELLED');
     qaSetExactPose(e,{...spec,pose:0,mode,materialState:'exposed',broken:state==='broken'?first:[]});
     const result=qaCompare(e,undefined,'cold');row.steps.push({state,mode,world:result.difference.error?result.difference.bytes:0,inputDifferences:result.materialData.records.filter(r=>!r.inputExact).length,builds:result.materialData.candidateBuilds})
    }
    qaReport.variants.push(row);qaStatus.textContent=`VARIANTS · ${variant} done`;await qaFrame()
   }
  }finally{prefetchNativeMaterialReadbacks=original}
 }
 async function qaRecheckFailed(token){
  if(!QA_FAILED_CASES.length)throw Error('No retained failed cases were supplied to this fixture');
  qaReport.recheckCases=QA_FAILED_CASES;qaReport.trialsPerCase=12;qaReport.controlComparisons=0;qaReport.controlFailures=0;
  for(let caseIndex=0;caseIndex<QA_FAILED_CASES.length;caseIndex++){
   const spec=QA_FAILED_CASES[caseIndex],e=qaEnemy(spec);await qaWaitBody(e,token);
   for(let trial=0;trial<12;trial++){
    if(token!==qaToken)throw Error('CANCELLED');qaSetExactPose(e,spec);const order=trial%2?'candidate-first':'baseline-first',override=e.kind==='mini'?spec.pose*7:undefined,result=qaCompare(e,override,spec.cacheMode,order),row=qaRecord(spec,spec.pose,spec.mode,spec.broken,spec.cacheMode,result);row.caseIndex=caseIndex;row.trial=trial;row.order=order;
    const repeat=qaCompare(e,override,spec.cacheMode,order);row.repeat=qaRepeat(result,repeat);
    const checks=[row.repeat.baselineSelf,row.repeat.candidateSelf,row.repeat.cross];const materialFailures=Object.values(row.repeat.material).filter(m=>!m.allExact).length;row.controlsPassed=checks.every(diff=>!diff.error)&&repeat.cacheBeforeEqual&&repeat.cacheAfterEqual&&!materialFailures;qaReport.controlComparisons+=3;qaReport.materialControlFailures+=materialFailures;qaReport.controlFailures+=checks.filter(diff=>!!diff.error).length;if(!repeat.cacheBeforeEqual||!repeat.cacheAfterEqual)qaReport.controlFailures++;
    qaStatus.textContent=`RECHECK · case ${caseIndex+1}/${QA_FAILED_CASES.length} · trial ${trial+1}/12 · ${order} · ${qaReport.failures} cross / ${qaReport.controlFailures} control failures`;qaSummarize();await qaFrame()
   }
  }
 }
 async function qaRun(mode){
  if(qaBusy)return;qaBusy=true;const token=++qaToken,started=performance.now();qaReport={hashes:BATCH_PALETTE_HASHES,worldCanvas:QA_WORLD_CPU?(window.__qaAllCanvasesCpu?'ALL 2D canvases cpu-backed (willReadFrequently)':'comparison world canvas cpu-backed (willReadFrequently)'):'default (GPU-backed)',mode,status:'running',rows:[],comparedPixels:0,failures:0,materialControlFailures:0,materialData:{buildsCompared:0,inputBytesCompared:0,layerBytesCompared:0,rowsWithInputDifferences:0,rowsWithLayerDifferences:0,rowsWithMetadataDifferences:0,rowsWithInputMutations:0},work:{baselineReadbacks:0,candidateReadbacks:0,candidateBatchReadbacks:0,candidateBatchTiles:0},limits:['Memory-only pilot; production, releases and real browser saves remain untouched.','Frozen v165 nativeMaterialPalette and renderIntegratedLateBoss functions are injected independently and switched together for baseline output.','Original destruction module is instantiated separately for old/candidate; same GPU compositor, assets and native geometry. No CPU mirrors or changed canvas backends.','Cold clears nativePaletteCache before each old/candidate render. Hot warms each renderer independently; mixed warms then deletes alternating entries.','Baseline world RGBA is captured before candidate cache setup or any shared scratch reuse. Readback counters exclude world-output captures and warmup draws.','Quick: four representative families, two poses, normal/Reduced Motion/hit, intact/first-broken and cold/hot/mixed =144 comparisons, plus16 sealed/opening cases. Full retains all original1050 cases and adds intact states across all38phases, representative intact hot/mixed cases and16 sealed/opening cold cases. Recheck Failed repeats retained initial failed cases12 times each with alternating first-render order and strict self/cross controls.','All differing RGBA bytes fail. Cache setup/result metadata/order must also agree; hot renders must not read pixels. Self/cross repeats diagnose failures without relaxing thresholds.','Readback call/tile counts establish actual batching; runtime duration is QA throughput, not a game performance or FPS measurement.']};
  document.querySelector('#batch-pixel-quick').disabled=true;document.querySelector('#batch-pixel-full').disabled=true;document.querySelector('#batch-pixel-recheck').disabled=true;document.querySelector('#batch-pixel-cancel').disabled=false;
  try{if(mode==='isolate-sampler'){await qaIsolate(token);qaReport.status='isolation-complete'}else if(mode==='first-use'){await qaFirstUse(token);qaReport.status='first-use-complete'}else if(mode==='fuzz'){await qaFuzz(token);qaReport.status='fuzz-complete'}else if(mode==='sequence'){await qaSequence(token);qaReport.status='sequence-complete'}else if(mode==='variants'){await qaVariants(token);qaReport.status='variants-complete'}else{if(mode==='recheck-failed')await qaRecheckFailed(token);else await qaCases(token,mode==='quick');if(!qaReport.work.candidateBatchReadbacks)throw Error('Candidate never exercised a batched readback');const md=qaReport.materialData;qaReport.materialDiscrepancyRows=md.rowsWithInputDifferences+md.rowsWithLayerDifferences+md.rowsWithMetadataDifferences+md.rowsWithInputMutations;qaReport.status=qaReport.failures||qaReport.controlFailures||qaReport.materialControlFailures||qaReport.materialDiscrepancyRows?'failed':'passed'}}catch(error){qaReport.status=error.message==='CANCELLED'?'cancelled':'error';qaReport.error=String(error.stack||error)}finally{
   window.StarfighterDestruction=qaNativeModule;nativeMaterialPalette=qaCandidateNativePalette;renderIntegratedLateBoss=qaCandidateIntegratedRenderer;drawEarlyMaterialSockets=qaCandidateEarlySockets;artInspection=null;state='menu';show('menu');qaBusy=false;qaReport.runtimeSeconds=Math.round(performance.now()-started)/1000;qaReport.passed=qaReport.rows.length-qaReport.failures;qaReport.originalCache=qaOld.inspect();qaReport.candidateCache=qaNew.inspect();qaReport.scopeClean=nativePaletteReadbackScope===null;qaReport.paletteEntries=nativePaletteCache.size;qaReport.paletteLimit=NATIVE_PALETTE_LIMIT;qaReport.batchStats=qaBatchStats();qaSummarize();qaOutput.value=JSON.stringify(qaReport,null,2);qaStatus.textContent=`${qaReport.status.toUpperCase()} · ${mode} · ${qaReport.passed}/${qaReport.rows.length} exact · ${qaReport.failures} failures${mode==='recheck-failed'?` / ${qaReport.controlFailures} self/cross control failures`:''} · ${qaReport.runtimeSeconds}s`;document.querySelector('#batch-pixel-quick').disabled=false;document.querySelector('#batch-pixel-full').disabled=false;document.querySelector('#batch-pixel-recheck').disabled=!QA_FAILED_CASES.length;document.querySelector('#batch-pixel-cancel').disabled=true
  }
 }
 document.querySelector('#batch-pixel-variants').onclick=()=>qaRun('variants');document.querySelector('#batch-pixel-sequence').onclick=()=>qaRun('sequence');document.querySelector('#batch-pixel-fuzz').onclick=()=>qaRun('fuzz');document.querySelector('#batch-pixel-firstuse').onclick=()=>qaRun('first-use');document.querySelector('#batch-pixel-isolate').onclick=()=>qaRun('isolate-sampler');document.querySelector('#batch-pixel-quick').onclick=()=>qaRun('quick');document.querySelector('#batch-pixel-full').onclick=()=>qaRun('full');document.querySelector('#batch-pixel-recheck').onclick=()=>qaRun('recheck-failed');document.querySelector('#batch-pixel-recheck').disabled=!QA_FAILED_CASES.length;document.querySelector('#batch-pixel-cancel').onclick=()=>qaToken++;document.querySelector('#batch-pixel-json').onclick=()=>{qaOutput.hidden=!qaOutput.hidden};
'''.replace('__ORIGINAL_MODULE__', module).replace('__POSE_HELPERS__', helpers)

end = new.rfind('})();')
assert end >= 0
qa = new[:end] + '\n' + baseline_palette + '\n' + baseline_renderer + '\n' + baseline_early + '\nconst BATCH_PALETTE_HASHES=' + json.dumps(hashes) + ';\nconst QA_FAILED_CASES=' + json.dumps(failed_cases) + ';\nconst QA_WORLD_CPU=' + json.dumps(args.world in ('cpu', 'cpu-all')) + ';\n' + controller + new[end:]
(r / 'artifacts/batched-palette-pixel-preview.js').write_text(qa, encoding='utf-8')
html = (r / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
fixture_tag = hashlib.sha256(qa.encode('utf-8')).hexdigest()[:10]  # content-hash cache tag: never serve a stale fixture
html = re.sub(r'<script src="game.js\?v=\d+"></script>', f'<script src="artifacts/batched-palette-pixel-preview.js?v=166-{fixture_tag}"></script>', html)
storage = '''<script>const batchPixelMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>batchPixelMemory.get(String(k))??null,setItem:(k,v)=>batchPixelMemory.set(String(k),String(v)),removeItem:k=>batchPixelMemory.delete(String(k)),clear:()=>batchPixelMemory.clear(),key:n=>Array.from(batchPixelMemory.keys())[n]??null,get length(){return batchPixelMemory.size}}});</script>'''
cpu_all = '''<script>window.__qaAllCanvasesCpu=true;(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){if(type==='2d')options={...(options||{}),willReadFrequently:true};return get.call(this,type,options)}})();</script>''' if args.world == 'cpu-all' else ''
(r / 'artifacts/batched-palette-pixel-preview.html').write_text(html.replace('<body>', '<body>' + cpu_all + storage, 1), encoding='utf-8')
print('Built exact frozen/candidate native palette comparator: ' + json.dumps(hashes))
