"""Private v166 palette-readback batching candidate; never edits production."""
from pathlib import Path
import argparse, hashlib, json, re

parser = argparse.ArgumentParser()
# tile  = a fresh 96x96 sampler canvas per tile, exactly how the original single sampler allocates.
# batch = one fresh sampler canvas per batch, reused only inside that batch.
parser.add_argument('--scratch', choices=['tile', 'batch'], default='tile')
# fresh = the strip canvas is also new per batch, so no canvas outlives a prefetch call.
parser.add_argument('--strip', choices=['fresh', 'reuse'], default='fresh')
# on = also batch the first-use readbacks of the earlier (non-integrated) main bosses: Twin Maw, Helix Crown, Rift Wraith, Iron Bloom.
# Installed v167 design = on; --early off reproduces the v166 design (dcca2ee1...) byte-for-byte.
parser.add_argument('--early', choices=['on', 'off'], default='on')
parser.add_argument('--out', default='artifacts/batched-palette-candidate-game.js')
args = parser.parse_args()

r = Path(__file__).resolve().parent.parent
# Always build from the FROZEN v165 baseline, never from production, so the candidate can still be
# regenerated after v166 is installed (production game.js is then candidate + Flight School URL v166).
baseline_path = r / 'artifacts/palette-v165-baseline-game.js'
assert baseline_path.exists(), 'The frozen v165 baseline artifacts/palette-v165-baseline-game.js is required.'
baseline_hash = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
assert baseline_hash == 'e285386ecb4b815d88820ab15210261d7c73428960e25c7d74006ddf3d64ea27', 'Frozen v165 baseline changed.'
source = baseline_path.read_text(encoding='utf-8')
version = int(re.search(r'game.js\?v=(\d+)', (r/'index.html').read_text(encoding='utf-8'))[1])

start = source.index('  function nativeMaterialPalette(')
end = source.index('  const materialEmissionBuffer=', start)
old_palette = source[start:end]
prefix = '''  function nativeMaterialPalette(asset,rect,options={}){
    if(!nativePaletteAssetIds.has(asset))nativePaletteAssetIds.set(asset,++nativePaletteAssetSerial);
    const key=nativePaletteAssetIds.get(asset)+'/'+[rect.x,rect.y,rect.w,rect.h].map(v=>v.toFixed(3)).join('/')+'/'+(options.hue??'auto')+'/'+(options.hueSpread||38)+'/'+!!options.lowLight;
    if(nativePaletteCache.has(key)){const value=nativePaletteCache.get(key);nativePaletteCache.delete(key);nativePaletteCache.set(key,value);return value}
    const N=96,source=document.createElement('canvas');source.width=source.height=N;
    const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);
    const original=sourceContext.getImageData(0,0,N,N),layers=buildNativeSocketPalette(original.data,N,N,options),make=name=>{'''
assert old_palette.count(prefix) == 1
helpers = '''  __VARS__
  function nativePaletteKey(asset,rect,options={}){
    if(!nativePaletteAssetIds.has(asset))nativePaletteAssetIds.set(asset,++nativePaletteAssetSerial);
    return nativePaletteAssetIds.get(asset)+'/'+[rect.x,rect.y,rect.w,rect.h].map(v=>v.toFixed(3)).join('/')+'/'+(options.hue??'auto')+'/'+(options.hueSpread||38)+'/'+!!options.lowLight
  }
  function prefetchNativeMaterialReadbacks(samples){
    const pending=[],seen=new Set(),N=96,LIMIT=16;
    for(const sample of samples){
      if(!sample.asset?.ready||![sample.rect.x,sample.rect.y,sample.rect.w,sample.rect.h].every(Number.isFinite)||sample.rect.w<=0||sample.rect.h<=0)return null;
      const key=nativePaletteKey(sample.asset,sample.rect,sample.options);
      if(!nativePaletteCache.has(key)&&!seen.has(key)){seen.add(key);pending.push({...sample,key})}
    }
    if(pending.length<2||pending.length>LIMIT)return null;
__SAMPLER__    const rgba=raster.getImageData(0,0,N,N*pending.length).data,prepared=new Map();
    for(let index=0;index<pending.length;index++)prepared.set(pending[index].key,rgba.subarray(index*N*N*4,(index+1)*N*N*4));
    const stats=prefetchNativeMaterialReadbacks.stats||(prefetchNativeMaterialReadbacks.stats={readbacks:0,tiles:0,batches:0,maxTiles:0});stats.readbacks++;stats.tiles+=pending.length;stats.batches++;stats.maxTiles=Math.max(stats.maxTiles,pending.length);
    return prepared
  }
  function prefetchLateBossMaterialReadbacks(e,frame,sx,sy){
    if(nativeSpritePartCapture||e!==boss)return null;
    let asset=frame.source,scaleX=1,scaleY=1;const module=window.StarfighterDestruction,broken=nativeSpriteBrokenGroups(e);
    if(module?.has(asset)){
      const surface=module.surface(asset,broken,{style:nativeSpriteStyle(e)});if(!surface)return null;
      if(surface!==asset){scaleX=(surface.naturalWidth||surface.width)/(asset.naturalWidth||asset.width);scaleY=(surface.naturalHeight||surface.height)/(asset.naturalHeight||asset.height);asset=surface}
    }
    const options={hue:frame.type===5?120:frame.type===6?188:frame.type===7?270:frame.type===8?25:345,hueSpread:frame.type===6?22:45},samples=[],nodes=activeWeakNodes(e);
    for(let index=0;index<nodes.length;index++){
      const profile=nativeFractureBaseProfile(e,nodes[index]);if(profile&&broken.has(profile.groupId))continue;
      const point=frame.pointAt(index),radius=lateBossSocketRadii(frame,index),rx=radius[0]/frame.factorX,ry=radius[1]/frame.factorY,rect={x:sx+point[0]-rx,y:sy+point[1]-ry,w:rx*2,h:ry*2};
      samples.push({asset,rect:{x:rect.x*scaleX,y:rect.y*scaleY,w:rect.w*scaleX,h:rect.h*scaleY},options})
    }
    return prefetchNativeMaterialReadbacks(samples)
  }
'''

common_reuse = '''    // Every tile is rasterized at the origin of its own 96x96 sampler canvas exactly like the original
    // single sampler (a destination offset inside a taller canvas changes float sampling in rare
    // geometries), then copied 1:1 at an integer offset into the strip so only ONE readback occurs.
    // Sampler canvases are never reused across batches: a long-lived sampler that had drawn a canvas
    // source later sampled image sources differently in this browser. No clip or saved state exists.
    const buffer=nativePaletteReadbackBuffer||(nativePaletteReadbackBuffer=document.createElement('canvas'));
    if(buffer.width!==N||buffer.height!==N*pending.length){buffer.width=N;buffer.height=N*pending.length}
    const raster=buffer.getContext('2d',{willReadFrequently:true});
    raster.setTransform(1,0,0,1,0,0);raster.globalAlpha=1;raster.globalCompositeOperation='source-over';raster.filter='none';raster.shadowBlur=0;raster.imageSmoothingEnabled=true;raster.imageSmoothingQuality='low';raster.clearRect(0,0,buffer.width,buffer.height);
'''
common_fresh = '''    // Every tile is rasterized at the origin of its own new 96x96 sampler canvas exactly like the original
    // single sampler (a destination offset inside a taller canvas changes float sampling in rare
    // geometries), then copied 1:1 at an integer offset into a new strip so only ONE readback occurs.
    // No canvas outlives this call: a long-lived sampler that had drawn a canvas source later sampled
    // image sources differently in this browser. No clip, saved state or reusable canvas exists.
    const buffer=document.createElement('canvas');buffer.width=N;buffer.height=N*pending.length;
    const raster=buffer.getContext('2d',{willReadFrequently:true});
'''
common = common_fresh if args.strip == 'fresh' else common_reuse
tile_loop = '''    for(let index=0;index<pending.length;index++){
      const sample=pending[index],rect=sample.rect,sampler=document.createElement('canvas');sampler.width=sampler.height=N;
      sampler.getContext('2d',{willReadFrequently:true}).drawImage(sample.asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);raster.drawImage(sampler,0,index*N)
    }
'''
batch_loop = '''    const sampler=document.createElement('canvas');sampler.width=sampler.height=N;const tile=sampler.getContext('2d',{willReadFrequently:true});
    for(let index=0;index<pending.length;index++){
      const sample=pending[index],rect=sample.rect;
      tile.clearRect(0,0,N,N);tile.drawImage(sample.asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);raster.drawImage(sampler,0,index*N)
    }
'''
helpers = helpers.replace('__VARS__', 'let nativePaletteReadbackScope=null;' if args.strip == 'fresh' else 'let nativePaletteReadbackScope=null,nativePaletteReadbackBuffer=null;', 1)
helpers = helpers.replace('__SAMPLER__', common + (tile_loop if args.scratch == 'tile' else batch_loop), 1)
new_prefix = '''  function nativeMaterialPalette(asset,rect,options={}){
    const key=nativePaletteKey(asset,rect,options);
    if(nativePaletteCache.has(key)){const value=nativePaletteCache.get(key);nativePaletteCache.delete(key);nativePaletteCache.set(key,value);return value}
    const N=96;let rgba=nativePaletteReadbackScope?.get(key);
    if(!rgba){
      const source=document.createElement('canvas');source.width=source.height=N;
      const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);rgba=sourceContext.getImageData(0,0,N,N).data
    }
    const layers=buildNativeSocketPalette(rgba,N,N,options),make=name=>{'''
new_palette = helpers + old_palette.replace(prefix, new_prefix)
candidate = source[:start] + new_palette + source[end:]
start = candidate.index('  function renderIntegratedLateBoss(')
end = candidate.index('  function drawVoidLeviathanSprite(', start)
renderer = candidate[start:end]
# Prefetch only after the original GPU body blit and filter reset, immediately
# before the socket loop, so the body-draw / material-read order matches v165.
# The scope is assigned inside the try so a throwing prefetch (or paint) always
# leaves the caller's prior scope in place.
needle = "    ctx.drawImage(asset,...sourceRect,...targetRect);ctx.filter='none';\n    const nodes=activeWeakNodes(e);for(let index=0;index<nodes.length;index++){\n"
assert renderer.count(needle) == 1
renderer = renderer.replace(needle, "    ctx.drawImage(asset,...sourceRect,...targetRect);ctx.filter='none';\n    const previousReadbacks=nativePaletteReadbackScope;\n    try{\n    nativePaletteReadbackScope=prefetchLateBossMaterialReadbacks(e,frame,sx,sy);\n    const nodes=activeWeakNodes(e);for(let index=0;index<nodes.length;index++){\n")
needle = "    }\n    if(hit>0){ctx.save();ctx.globalAlpha*=Math.min(.34,hit*3);"
assert renderer.count(needle) == 1
renderer = renderer.replace(needle, "    }\n    }finally{nativePaletteReadbackScope=previousReadbacks}\n    if(hit>0){ctx.save();ctx.globalAlpha*=Math.min(.34,hit*3);")
candidate = candidate[:start] + renderer + candidate[end:]

if args.early == 'on':
    early_prefetch = """  function prefetchEarlyBossMaterialReadbacks(e,asset,nodes,points,type,phase,sx,sy){
    if(nativeSpritePartCapture||e!==boss)return null;
    // Mirrors drawMaterialSocketSample's destruction-surface substitution and rect scaling exactly.
    let source=asset,scaleX=1,scaleY=1;const module=window.StarfighterDestruction;
    if(module?.has(source)){
      const surface=module.surface(source,nativeSpriteBrokenGroups(e),{style:nativeSpriteStyle(e)});if(!surface)return null;
      if(surface!==source){scaleX=(surface.naturalWidth||surface.width)/(source.naturalWidth||source.width);scaleY=(surface.naturalHeight||surface.height)/(source.naturalHeight||source.height);source=surface}
    }
    const options={hue:[0,26,270,185,24][type],hueSpread:type===3?30:40},samples=[];
    for(let index=0;index<nodes.length;index++){
      const node=nodes[index];if(nativeSocketRemoved(e,node))continue;
      const point=points[index];if(!point)continue;
      // Copied expressions from the socket loop in drawEarlyMaterialSockets so every rectangle is bit-identical.
      const core=(type===1&&phase===0&&index===2)||(type===2&&index===2)||(type===3&&riftNodeSlot(e,node)===0),rx=type===0?(index<2?15:20):core?32:type===4?20:23,ry=type===0?(index<2?22:18):core?27:type===1?16:20;
      const materialRx=core?type===2?28:28:type===1?16:type===2?18:type===4?13:rx,materialRy=core?type===2?24:22:type===1?11:type===2?14:type===4?13:ry;
      const rect={x:sx+point[0]-materialRx,y:sy+point[1]-materialRy,w:materialRx*2,h:materialRy*2};
      samples.push({asset:source,rect:{x:rect.x*scaleX,y:rect.y*scaleY,w:rect.w*scaleX,h:rect.h*scaleY},options})
    }
    return prefetchNativeMaterialReadbacks(samples)
  }
"""
    fn_start = candidate.index('  function drawEarlyMaterialSockets(e){')
    fn_end = candidate.index('  function drawBloodstarCompositeFrame(', fn_start)
    early = candidate[fn_start:fn_end]
    needle = "    ctx.save();ctx.scale(motion.x,motion.y);\n    nodes.forEach((node,index)=>{\n"
    assert early.count(needle) == 1
    early = early.replace(needle, "    const previousReadbacks=nativePaletteReadbackScope;\n    try{\n    nativePaletteReadbackScope=prefetchEarlyBossMaterialReadbacks(e,asset,nodes,points,type,phase,sx,sy);\n" + needle, 1)
    needle = "    });ctx.restore()\n  }\n"
    assert early.count(needle) == 1
    early = early.replace(needle, "    });ctx.restore()\n    }finally{nativePaletteReadbackScope=previousReadbacks}\n  }\n", 1)
    candidate = candidate[:fn_start] + early_prefetch + early + candidate[fn_end:]
candidate_path = r/args.out
candidate_path.write_text(candidate, encoding='utf-8')
candidate_hash = hashlib.sha256(candidate_path.read_bytes()).hexdigest()

# Reuse the existing private profiler's authored controls and observation code.
# Neither the production source nor the old profiler/evidence files are edited.
profile_builder = (r/'tools/build-boss-render-profile-preview.py').read_text(encoding='utf-8')
match = re.search(r"controller=r'''([\s\S]*?)'''\nend=", profile_builder)
assert match, 'Expected the existing private profiler controller.'
controller = match[1]
controller = controller.replace('PRIVATE BOSS RENDER PROFILE', 'PRIVATE BATCHED PALETTE CANDIDATE')
controller = controller.replace("destruction:window.StarfighterDestruction.inspect()", "destruction:window.StarfighterDestruction.inspect(),paletteReadbackBatch:{...(prefetchNativeMaterialReadbacks.stats||{readbacks:0,tiles:0,batches:0,maxTiles:0})},rawScopeActive:!!nativePaletteReadbackScope")
controller = controller.replace("sourceSha256:PROFILE_SOURCE_HASH,status:", "sourceSha256:PROFILE_SOURCE_HASH,baseSourceSha256:PROFILE_BASE_HASH,profileMode:'batched-raw-palette-readback-candidate',status:")
controller = controller.replace("'Private memory-only pilot with1000hull safety meter, no physicalcontroller polling and muted audio.'", "'Private candidate: scoped raw palette misses batch into one bounded sampler strip; world composition remains original.','Private memory-only pilot with1000hull safety meter, no physicalcontroller polling and muted audio.'")
end = candidate.rfind('})();')
qa = candidate[:end] + f'\nconst PROFILE_SOURCE_VERSION={version},PROFILE_SOURCE_HASH={json.dumps(candidate_hash)},PROFILE_BASE_HASH={json.dumps(baseline_hash)};\n' + controller + candidate[end:]
(r/'artifacts/batched-palette-candidate-preview-game.js').write_text(qa, encoding='utf-8')
html = (r/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', f'<script src="artifacts/batched-palette-candidate-preview-game.js?v={version}"></script>', html)
storage = '''<script>const batchPaletteMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>batchPaletteMemory.get(String(k))??null,setItem:(k,v)=>batchPaletteMemory.set(String(k),String(v)),removeItem:k=>batchPaletteMemory.delete(String(k)),clear:()=>batchPaletteMemory.clear(),key:n=>Array.from(batchPaletteMemory.keys())[n]??null,get length(){return batchPaletteMemory.size}}});</script>'''
(r/'artifacts/batched-palette-candidate-preview.html').write_text(html.replace('<body>','<body>'+storage,1), encoding='utf-8')
print(f'Built private batched palette candidate [{args.scratch}/{args.strip}, early={args.early}] {candidate_hash} -> {args.out}; frozen baseline {baseline_hash}.')
