"""Private same-page paired frozen/batched boss renderer profile. No production edits."""
from pathlib import Path
import argparse, hashlib, json, re

parser = argparse.ArgumentParser()
parser.add_argument('--candidate', default='artifacts/batched-palette-candidate-game.js')
parser.add_argument('--tag', default='')  # output name suffix; empty keeps the original fixture names
parser.add_argument('--ids', default='5,6')  # boss ids profiled pairwise; 2,3,4 = Helix Crown, Rift Wraith, Iron Bloom
parser.add_argument('--early-swap', action='store_true')  # also swap the baseline drawEarlyMaterialSockets in and out
args = parser.parse_args()
TAG = ('-' + args.tag) if args.tag else ''
IDS = [int(x) for x in args.ids.split(',')]
SCENES = 2 * len(IDS)

r=Path(__file__).resolve().parent.parent
baseline_path=r/'artifacts/palette-v165-baseline-game.js'
candidate_path=r/args.candidate
baseline=baseline_path.read_text(encoding='utf-8')
candidate=candidate_path.read_text(encoding='utf-8')
base_hash=hashlib.sha256(baseline_path.read_bytes()).hexdigest()
candidate_hash=hashlib.sha256(candidate_path.read_bytes()).hexdigest()
assert base_hash=='e285386ecb4b815d88820ab15210261d7c73428960e25c7d74006ddf3d64ea27'
assert 'function prefetchNativeMaterialReadbacks(' in candidate
version=int(re.search(r'game.js\?v=(\d+)',(r/'index.html').read_text(encoding='utf-8'))[1])

def function_block(source,name,next_marker):
    start=source.index('  function '+name+'(')
    end=source.index(next_marker,start)
    return source[start:end]

baseline_palette=function_block(baseline,'nativeMaterialPalette','  const materialEmissionBuffer=')
baseline_palette=baseline_palette.replace('function nativeMaterialPalette(', 'function pairedBaselineNativeMaterialPalette(',1)
baseline_renderer=function_block(baseline,'renderIntegratedLateBoss','  function drawVoidLeviathanSprite(')
baseline_renderer=baseline_renderer.replace('function renderIntegratedLateBoss(', 'function pairedBaselineIntegratedLateBoss(',1)
baseline_early=function_block(baseline,'drawEarlyMaterialSockets','  function drawBloodstarCompositeFrame(')
baseline_early=baseline_early.replace('function drawEarlyMaterialSockets(', 'function pairedBaselineEarlySockets(',1)
profile_builder=(r/'tools/build-boss-render-profile-preview.py').read_text(encoding='utf-8')
match=re.search(r"controller=r'''([\s\S]*?)'''\nend=",profile_builder)
assert match
controller=match[1]

def replace_once(old,new):
    global controller
    assert controller.count(old)==1,old[:120]
    controller=controller.replace(old,new)

replace_once('PRIVATE BOSS RENDER PROFILE','PRIVATE PAIRED PALETTE READBACK PROFILE')
replace_once('<button id="boss-profile-run">RUN PROFILE</button>', '<button id="boss-profile-run">RUN BASELINE FIRST</button><button id="boss-profile-reverse">RUN CANDIDATE FIRST</button>')
replace_once('READY · Void Leviathan and Prism Warden phase2 · ~20s plus asset loading.', 'READY · paired frozen/batched phase2 · ~40s plus asset loading · choose either order.')
replace_once('max-height:82px;', 'height:92px;min-height:92px;max-height:92px;')
replace_once(' const profileNativeUpdate=update,profileNativeDraw=draw;', ''' const profileNativeUpdate=update,profileNativeDraw=draw;
 const pairedCandidatePalette=nativeMaterialPalette,pairedCandidateRenderer=renderIntegratedLateBoss;
 let pairedActiveVariant='candidate';
 renderIntegratedLateBoss=function(...args){return (pairedActiveVariant==='baseline'?pairedBaselineIntegratedLateBoss:pairedCandidateRenderer).apply(this,args)};
 function pairedPaletteDelegate(...args){return (pairedActiveVariant==='baseline'?pairedBaselineNativeMaterialPalette:pairedCandidatePalette).apply(this,args)}
 const pairedCandidateEarly=drawEarlyMaterialSockets;
 drawEarlyMaterialSockets=function(...args){return (pairedActiveVariant==='baseline'&&PAIRED_EARLY_SWAP?pairedBaselineEarlySockets:pairedCandidateEarly).apply(this,args)};
 function pairedSafeFrame(b){try{return lateBossMaterialFrame(b)}catch(error){return{source:b.def||b,frame:0}}}
 function pairedResetRandom(id){let seed=(164851+id*997)>>>0;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
 function pairedBatchStats(){return {...(prefetchNativeMaterialReadbacks.stats||{readbacks:0,tiles:0,batches:0,maxTiles:0})}}
''')
replace_once('profileOriginalPalette=nativeMaterialPalette,', 'profileOriginalPalette=pairedPaletteDelegate,')
replace_once("function profileCaches(){return{palette:nativePaletteCache.size,paletteLimit:NATIVE_PALETTE_LIMIT,destruction:window.StarfighterDestruction.inspect()}}", "function profileCaches(){return{palette:nativePaletteCache.size,paletteLimit:NATIVE_PALETTE_LIMIT,destruction:window.StarfighterDestruction.inspect(),paletteReadbackBatch:pairedBatchStats(),rawScopeActive:!!nativePaletteReadbackScope}}")
replace_once("async function profilePrepare(id,token){profileScene=null;", "async function profilePrepare(id,token){pairedResetRandom(id);prefetchNativeMaterialReadbacks.stats={readbacks:0,tiles:0,batches:0,maxTiles:0};profileScene=null;")
replace_once("profileScene={id,phase:2,name:boss.def.name,", "profileScene={id,variant:pairedActiveVariant,rngSeed:(164851+id*997)>>>0,phase:2,name:boss.def.name,canvasBacking:[canvas.width,canvas.height],")
replace_once("record={id:scene.id,name:scene.name,phase:scene.phase,", "record={id:scene.id,variant:scene.variant,rngSeed:scene.rngSeed,name:scene.name,phase:scene.phase,canvasBacking:[...scene.canvasBacking],")
replace_once("const raw=profileLast?", "if(canvas.width!==profileScene.canvasBacking[0]||canvas.height!==profileScene.canvasBacking[1])throw Error('Canvas backing changed during paired scene');const raw=profileLast?")
start=controller.index(' function profileDescribe(){')
end=controller.index(' function profilePause(',start)
controller=controller[:start]+r''' function profileDescribe(){
  if(!profileReport)return;
  profileSummary.textContent=profileReport.scenes.map(scene=>{
   const first=scene.buckets['after-break/first-visit'],warm=scene.buckets['after-break/repeat-visit'];
   return `${scene.variant.toUpperCase()} ${scene.name}: post-break first median/p95 ${first?.draw.medianMs??'—'}/${first?.draw.p95Ms??'—'}ms · warm ${warm?.draw.medianMs??'—'}/${warm?.draw.p95Ms??'—'}ms · readbacks ${scene.totals.readbackCalls}/${scene.totals.readbackPixels}px · batches ${scene.cacheAtEnd.paletteReadbackBatch.readbacks}`
  }).join('\n')+`\nCurrent ${profileScene?.variant||pairedActiveVariant} ${profileScene?.name||'none'} · order ${profileReport.runOrder} · interruptions ${profileReport.interruptions.length} · nested timings overlap; not FPS`;
  profileOutput.value=JSON.stringify(profileReport,null,2)
 }
''' + controller[end:]
replace_once('async function profileRun(){', 'async function profileRun(reverse=false){')
replace_once("sourceSha256:PROFILE_SOURCE_HASH,status:", "sourceSha256:PROFILE_SOURCE_HASH,baselineSourceSha256:PROFILE_BASE_HASH,profileMode:'same-page-paired-palette-readback',runOrder:reverse?'candidate-first':'baseline-first',status:")
replace_once("document.querySelector('#boss-profile-run').disabled=true;", "document.querySelector('#boss-profile-run').disabled=true;document.querySelector('#boss-profile-reverse').disabled=true;")
replace_once("document.querySelector('#boss-profile-run').disabled=false;", "document.querySelector('#boss-profile-run').disabled=false;document.querySelector('#boss-profile-reverse').disabled=false;")
replace_once("for(const id of[5,6]){await profilePrepare(id,token);", "for(const id of[__IDS__])for(const variant of(reverse?['candidate','baseline']:['baseline','candidate'])){pairedActiveVariant=variant;await profilePrepare(id,token);")
replace_once('const animation=lateBossMaterialFrame(boss),assetId=', 'const animation=pairedSafeFrame(boss),assetId=')
replace_once("if(profileReport.scenes.length!==2)throw Error('Missing scenes');", "if(profileReport.scenes.length!==__SCENES__)throw Error('Missing paired scenes');if(new Set(profileReport.scenes.map(s=>s.canvasBacking.join('x'))).size!==1)throw Error('Paired canvas size changed');")
replace_once('${profileReport.scenes.length}/2 scenes', '${profileReport.scenes.length}/__SCENES__ paired scenes')
replace_once("document.querySelector('#boss-profile-run').onclick=profileRun;", "document.querySelector('#boss-profile-run').onclick=()=>profileRun(false);document.querySelector('#boss-profile-reverse').onclick=()=>profileRun(true);")
replace_once("'Private memory-only pilot with1000hull safety meter, no physicalcontroller polling and muted audio.'", "'Paired frozen-v165 and batched candidate functions share this page, original world/destruction module, viewport and instrumentation wrappers.','Each matched boss resets to an identical private RNG seed. Both run orders are available. Caches/composites clear before each scene.','Rows snapshot batch stats by value; each scene resets diagnostic batch counters.','Private memory-only pilot with1000hull safety meter, no physicalcontroller polling and muted audio.'")
controller=controller.replace("Current ${profileScene?.name||'none'}", "Current ${profileScene?.variant||pairedActiveVariant} ${profileScene?.name||'none'}")
controller=controller.replace('__IDS__',','.join(str(i) for i in IDS)).replace('__SCENES__',str(SCENES))
end=candidate.rfind('})();')
assert end>=0
qa=candidate[:end]+'\n'+baseline_palette+'\n'+baseline_renderer+'\n'+baseline_early+f'\nconst PAIRED_EARLY_SWAP={json.dumps(bool(args.early_swap))};\nconst PROFILE_SOURCE_VERSION={version},PROFILE_SOURCE_HASH={json.dumps(candidate_hash)},PROFILE_BASE_HASH={json.dumps(base_hash)};\n'+controller+candidate[end:]
(r/f'artifacts/batched-palette-paired{TAG}-preview-game.js').write_text(qa,encoding='utf-8')
html=(r/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>',f'<script src="artifacts/batched-palette-paired{TAG}-preview-game.js?v={version}-{candidate_hash[:8]}"></script>',html)
storage='''<script>const pairedPaletteMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>pairedPaletteMemory.get(String(k))??null,setItem:(k,v)=>pairedPaletteMemory.set(String(k),String(v)),removeItem:k=>pairedPaletteMemory.delete(String(k)),clear:()=>pairedPaletteMemory.clear(),key:n=>Array.from(pairedPaletteMemory.keys())[n]??null,get length(){return pairedPaletteMemory.size}}});</script>'''
(r/f'artifacts/batched-palette-paired{TAG}-preview.html').write_text(html.replace('<body>','<body>'+storage,1),encoding='utf-8')
print('Built paired same-page palette profile; frozen '+base_hash+' / candidate '+candidate_hash+'.')
