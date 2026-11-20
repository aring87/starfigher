#!/usr/bin/env node
'use strict';

// Regressions for the animated strips left outside the old removal cones.
// Real source-PNG texels, independently authored distal art regions and the
// production destination-out paths are compared in private browser mocks.
// This does not read or modify a real pilot's browser saves.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const {nativeDraws,rasterNativeBody}=require('./verify-severed-silhouettes.cjs');
const arg=(key,fallback)=>process.argv.find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const sourcePath=path.resolve(root,arg('source','game.js')),reportName=arg('report','severed-remnants-audit.json');
const focused=process.argv.includes('--focused'),regionsOnly=process.argv.includes('--regions-only');
function loadHarness(){
  const filename=path.join(__dirname,'verify-game.cjs'),gameSource=fs.readFileSync(sourcePath,'utf8');
  let support=fs.readFileSync(filename,'utf8');support=support.slice(0,support.indexOf('\ntest('));
  support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(gameSource)+';');
  support=support.replace('nativeFractureProfile,nativeFractureVertices,',`nativeFractureProfile,nativeFractureVertices,maskNativeFractures,paintNativeBossBody,paintMiniBossNativeBody,bossSpriteMotion,
    forceRemnantFrame(e,frame){miniBossFrame=()=>frame%16;twinMawFrame=()=>frame%2;helixFrame=()=>frame%2;riftAnimationState=()=>({frame:frame%(e.phase===1?8:4),next:frame%(e.phase===1?8:4),mix:0});ironBloomFrame=()=>frame%8;boss32AnimationState=()=>boss32AnimationFromPosition(frame);voidLeviathanAnimationState=()=>({...boss32AnimationFromPosition(frame),active:true})},`);
  support=support.replace('save() { stack.push(',"save() { record('save');stack.push(").replace('restore() { const saved = stack.pop();',"restore() { record('restore');const saved = stack.pop();");
  const module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(__dirname);module._compile(support+'\nmodule.exports={createGame,pngMaterial};',filename);return{...module.exports,gameSource}
}
function inside(p,x,y){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[a,b]=p[i],[c,d]=p[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit}return hit}
function maskPaths(api,enemy,frame){
  const scratch=api.fractureContext;scratch.trace=[];api.maskNativeFractures(enemy,null,frame);let current=[];const paths=[];
  for(const record of scratch.trace){if(record.op==='beginPath')current=[];else if(record.op==='moveTo'||record.op==='lineTo')current.push(record.args.slice(0,2));else if(record.op==='fill'&&record.composite==='destination-out'){assert.equal(record.alpha,1,'A removal mask cannot leave a translucent copy of its limb');paths.push(current.slice())}}
  scratch.trace=null;return paths
}
// These art-local rectangles target real outer fins and the rear/front ventral
// rim strips visible in the source sheets. They deliberately do not depend on
// fracture profiles, cone width, cutline, axis or ownership helper output.
// Per-frame translation follows the source-art core track, not mask geometry.
const distalRegions=[
  {type:0,name:'Reaver dorsal fin',node:0,box:[-8,-60,30,-35]},
  {type:0,name:'Reaver ventral rear rim',node:2,box:[26,37,72,58]},
  {type:0,name:'Reaver ventral forward rim',node:2,box:[-32,44,-18,54]},
  {type:1,name:'Forge upper crusher arch',node:0,box:[-10,-58,48,-33]},
  {type:1,name:'Forge lower rear rim',node:2,box:[20,35,80,62]},
  {type:1,name:'Forge lower forward rim',node:2,box:[-32,43,-16,55]},
  {type:9,name:'Crown upper signal wing',node:0,box:[-23,-56,42,-33]},
  {type:9,name:'Crown lower rear rim',node:2,box:[10,34,63,55]},
  {type:9,name:'Crown lower forward rim',node:2,box:[-40,38,-20,54]}
];
const {createGame,pngMaterial,gameSource}=loadHarness(),{api}=createGame();
const report={algorithm:'independent-native-distal-region-v1',source:path.relative(root,sourcePath),sourceSha256:crypto.createHash('sha256').update(gameSource).digest('hex'),alphaThreshold:4,scope:'Actual source alpha above4/255 is normalized before native paint transforms and sampled at half-arena-pixel resolution. Independently authored distal fin/rim regions on Reaver, Forge and Crown are tested across all16 atlas poses. Production destination-out paths must remove their native opaque texels. Separate full-draw tracing checks that a masked enemy cannot be restored by direct body, socket or damage-flash paint outside its fracture buffer.',limitations:'Nearest-texel alpha sampling does not emulate GPU bilinear edges or glows; browser inspection is still required. Distal completeness is established for the named authored regions, not every unannotated appendage in the fleet.',regions:[],renderChecks:0,failures:[]};
function begin(family,type,phase=1){
  if(family==='mini')api.startMiniBossLab(type);else if(family==='epic')api.startEpicBossLab(type);else api.startBossLab(type);
  const e=family==='mini'?api.miniBoss:api.boss;Object.assign(e,{x:745,y:267,phase,intro:0,clock:.61,cool:5,hitFlash:0,weakOpen:true,coreAperture:1});api.player.inv=1e6;api.setShake(0);return e
}
let nativeTexels=0,remainingTexels=0,faintNativeTexels=0;
const normalizedMaterials=new WeakMap();
function normalizedMaterial(material,threshold){let levels=normalizedMaterials.get(material);if(!levels){levels=new Map();normalizedMaterials.set(material,levels)}if(!levels.has(threshold))levels.set(threshold,{...material,alpha:Uint8Array.from(material.alpha,a=>a>threshold?255:0)});return levels.get(threshold)}
for(const type of[0,1,9]){
  const e=begin('mini',type),regions=distalRegions.filter(region=>region.type===type),tracks=api.miniCoreTracks[type];
  for(let frame=0;frame<16;frame++){
    api.forceRemnantFrame(e,frame);e.clock=.17+frame*.073;e.hitFlash=0;const motion=api.bossSpriteMotion(e);
    const original=nativeDraws(api,e,frame,pngMaterial);
    const normalize=threshold=>original.map(draw=>({...draw,material:normalizedMaterial(draw.material,threshold)}));
    const body=rasterNativeBody(normalize(4),2),solid=rasterNativeBody(normalize(40),2);
    for(const region of regions){
      const nodes=api.activeWeakNodes(e);nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});nodes[region.node].destroyed=true;nodes[region.node].hp=0;
      const paths=maskPaths(api,e,frame),dx=tracks[frame][region.node][0]-tracks[0][region.node][0],dy=tracks[frame][region.node][1]-tracks[0][region.node][1],box=region.box.map((value,index)=>(value+(index%2?dy:dx))*(index%2?motion.y:motion.x));
      let opaque=0,left=0,faint=0,faintLeft=0;const examples=[];
      for(let y=Math.max(0,Math.floor((box[1]-body.minY)*2));y<Math.min(body.height,Math.ceil((box[3]-body.minY)*2));y++)for(let x=Math.max(0,Math.floor((box[0]-body.minX)*2));x<Math.min(body.width,Math.ceil((box[2]-body.minX)*2));x++){
        const at=y*body.width+x;if(!body.opaque[at])continue;const wx=body.minX+(x+.5)/2,wy=body.minY+(y+.5)/2;if(wx<box[0]||wx>box[2]||wy<box[1]||wy>box[3])continue;
        opaque++;const edge=!solid.opaque[at];if(edge)faint++;
        if(!paths.some(p=>inside(p,wx,wy))){left++;if(edge)faintLeft++;if(examples.length<3)examples.push([wx,wy])}
      }
      const result={type,frame,name:region.name,node:region.node,nativePixels:opaque/4,remainingPixels:left/4,faintPixels:faint/4,faintRemainingPixels:faintLeft/4};report.regions.push(result);nativeTexels+=opaque;remainingTexels+=left;faintNativeTexels+=faint;
      if(left)report.failures.push({...result,reason:'Detached distal source pixels remain on the animated body',examples});
    }
  }
}
report.appendageCoverage=[];
for(const type of[0,1,9])for(let frame=0;frame<16;frame++)for(const node of[0,2]){const rows=report.regions.filter(r=>r.type===type&&r.frame===frame&&r.node===node),native=rows.reduce((sum,r)=>sum+r.nativePixels,0);report.appendageCoverage.push({type,frame,node,nativePixels:native});if(native<1)report.failures.push({type,frame,node,reason:'Each annotated appendage pose must exercise real distal source texels',nativePixels:native})}
console.log('DISTAL '+JSON.stringify({checks:report.regions.length,nativePixels:nativeTexels/4,remainingPixels:remainingTexels/4,failures:report.failures.length}));
function renderIsolation(family,type,phase,frame){
  const e=begin(family,type,phase);api.forceRemnantFrame(e,frame);e.clock=.17+frame*.073;e.hitFlash=frame%2?.12:0;
  const nodes=api.activeWeakNodes(e);for(const node of nodes){node.destroyed=true;node.hp=0}
  const world=api.drawingContext,scratch=api.fractureContext;world.trace=[];world.resetTransform();if(family==='mini')api.paintMiniBossNativeBody(e,frame);else api.paintNativeBossBody(e,0);const nativeSources=new Set(world.trace.filter(r=>r.op==='drawImage'&&r.image?.sourcePath?.endsWith('.png')).map(r=>r.image.sourcePath));
  world.trace=[];scratch.trace=[];world.resetTransform();api.draw();
  const paletteCanvases=new Set([...api.nativePaletteCache.values()].flatMap(p=>[p.sealed,p.hot,p.emission]));
  const leaked=world.trace.filter(r=>r.op==='drawImage'&&(nativeSources.has(r.image?.sourcePath)||paletteCanvases.has(r.image)||r.image===api.materialBuffer||r.image===api.materialEmissionBuffer));
  const composites=world.trace.filter(r=>r.op==='drawImage'&&r.image===api.fractureBuffer);
  if(leaked.length||composites.length!==1)report.failures.push({family,type,phase,frame,reason:'Body/material/flash must stay inside one masked composite',unmaskedDraws:leaked.length,fractureComposites:composites.length});
  world.trace=null;scratch.trace=null;report.renderChecks++
}
if(!regionsOnly)for(let type=0;type<10;type++)for(let frame=0;frame<16;frame++)renderIsolation('mini',type,1,frame);
if(!focused&&!regionsOnly)for(const family of['main','epic'])for(let type=family==='main'?1:0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='epic'?4:2);phase++){
  const poses=family==='main'&&type<3?2:family==='main'&&type===3?(phase===1?8:4):family==='main'&&type===4?8:32;
  for(let frame=0;frame<poses;frame++)renderIsolation(family,type,phase,frame)
}
report.summary={authoredRegions:distalRegions.length,poseRegionChecks:report.regions.length,nativePixels:nativeTexels/4,faintNativePixels:faintNativeTexels/4,remainingPixels:remainingTexels/4,renderChecks:report.renderChecks,failures:report.failures.length};
fs.writeFileSync(path.join(root,'artifacts',reportName),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
for(const failure of report.failures.slice(0,15))console.log('FAIL '+JSON.stringify(failure));
if(report.failures.length)process.exitCode=1;else console.log('PASS independent distal texels disappear and body/material/flash rendering stays masked.');
