#!/usr/bin/env node
'use strict';

// Independent evidence for the anatomical socket palette. Real PNG crops are
// collected at production call sites; the canvas mock supplies no pixel proof.
// No player storage, shipping art, source code or existing tests are changed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const production=fs.readFileSync(path.join(root,'game.js'),'utf8');
assert.ok(production.includes('function buildNativeSocketPalette('),'Production anatomical palette helper is required');
let setup=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').split('const game = createGame();')[0].replace(/^#![^\r\n]*[\r\n]+/,'');
const marker='globalThis.__gameTest = {';
assert.ok(setup.includes(marker),'Shared browser harness export marker changed');
setup=setup.replace(marker,`const socketAuditCrops=[];
  const socketAuditNativePalette=nativeMaterialPalette;
  nativeMaterialPalette=function(asset,rect,...rest){const enemy=boss||miniBoss,frame=enemy?.kind==='boss'&&(enemy.epic||enemy.type>=5)?lateBossMaterialFrame(enemy):null;socketAuditCrops.push({asset,rect:{...rect},options:rest[0]||{},frameMeta:frame?{type:frame.type,phase:frame.phase,frame:frame.frame,cellW:frame.cellW,cellH:frame.cellH,sourceBounds:frame.sourceBounds,factorX:frame.factorX,factorY:frame.factorY,shift:frame.shift}:null});return socketAuditNativePalette.call(this,asset,rect,...rest)};
  ${marker}
    buildNativeSocketPalette,
    get socketAuditCrops(){return socketAuditCrops},
`);
const harness=new Function('require','__dirname',setup+'\nreturn {createGame,pngMaterial,pngMaterialPixels};')(require,__dirname);
const {api:art,sandbox:socketSandbox}=harness.createGame();
const build=(data,w,h,options={})=>art.buildNativeSocketPalette(data,w,h,options);
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
function image(w=40,h=40){const data=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++)data.set([49,55,64,255],p*4);return{data,w,h}}
function rect(f,x,y,w,h,color){for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)f.data.set(color,(py*f.w+px)*4)}
function selected(palette,x,y,w){return palette.weights[y*w+x]>0}
function validate(native,w,h,palette,label){
  assert.equal(palette.weights.length,w*h,label+' weights extent');
  for(const key of['sealed','hot','emission'])assert.equal(palette[key].length,native.length,label+' '+key+' RGBA extent');
  let selectedCount=0,opaqueSelectedCount=0,sourceOpaqueArea=0,sourceAlphaArea=0,emissionAlphaArea=0,hotLuma=0,sealedLuma=0;
  for(let p=0;p<w*h;p++){
    const i=p*4,weight=palette.weights[p];assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=255,label+' bounded weight');
    sourceAlphaArea+=native[i+3]/255;if(native[i+3]>=128)sourceOpaqueArea++;emissionAlphaArea+=palette.emission[i+3]/255;
    if(weight){selectedCount++;if(native[i+3]>100)opaqueSelectedCount++}
    for(const key of['sealed','hot','emission']){
      const output=palette[key];
      assert.ok(output[i+3]<=native[i+3],label+' '+key+' cannot add opacity outside native alpha');
      if(!weight)assert.equal(output[i+3],0,label+' '+key+' must remain transparent outside selected native texels');
      if(native[i+3]===0)assert.equal(output[i+3],0,label+' '+key+' transparent source stays clear');
    }
    if(weight){hotLuma+=luma(...palette.hot.subarray(i,i+3))*palette.hot[i+3]/255;sealedLuma+=luma(...palette.sealed.subarray(i,i+3))*palette.sealed[i+3]/255}
  }
  return{selectedCount,opaqueSelectedCount,sourceOpaqueArea,sourceAlphaArea,emissionAlphaArea,emissionToOpaqueRatio:sourceOpaqueArea?emissionAlphaArea/sourceOpaqueArea:0,hotLuma,sealedLuma};
}

test('anatomical overlays preserve source data, alpha silhouette and unselected armor',()=>{
  const f=image();rect(f,17,17,6,6,[198,35,28,255]);rect(f,2,2,5,5,[0,0,0,0]);const original=f.data.slice(),result=build(f.data,f.w,f.h);
  assert.deepEqual(f.data,original,'Building variants must not alter source PNG bytes');
  const stats=validate(f.data,f.w,f.h,result,'source preservation');assert.ok(stats.selectedCount>0);assert.ok(stats.hotLuma>stats.sealedLuma,'Exposure must brighten the selected native emitter');
  assert.equal(selected(result,3,3,f.w),false);assert.equal(selected(result,12,20,f.w),false);
  const again=build(f.data,f.w,f.h);for(const key of['sealed','hot','emission','weights'])assert.deepEqual(result[key],again[key],'Palette is deterministic: '+key);
});

test('central native reactor wins over a separate cyan armor accent',()=>{
  const f=image();rect(f,17,17,6,6,[205,38,27,255]);rect(f,29,14,5,9,[22,172,220,255]);const result=build(f.data,f.w,f.h);
  validate(f.data,f.w,f.h,result,'hue exclusion');assert.ok(selected(result,20,20,f.w),'Native central reactor must be selected');
  for(let y=14;y<23;y++)for(let x=29;x<34;x++)assert.equal(selected(result,x,y,f.w),false,'A separate cyan accent must not turn into another weakpoint');
});

test('explicit authored hue chooses the intended material family',()=>{
  const f=image();rect(f,17,17,6,6,[20,180,220,255]);rect(f,28,17,4,6,[210,45,24,255]);const result=build(f.data,f.w,f.h,{hue:192,hueSpread:30});
  validate(f.data,f.w,f.h,result,'authored hue');assert.ok(selected(result,20,20,f.w));assert.equal(selected(result,29,20,f.w),false);
});

test('dim miniboss power circuits brighten without lighting neutral armor or filling their gaps',()=>{
  const f=image();rect(f,17,12,2,16,[12,78,92,255]);rect(f,21,12,2,16,[12,78,92,255]);
  const normal=build(f.data,f.w,f.h,{hue:192}),exposed=build(f.data,f.w,f.h,{hue:192,lowLight:true});
  validate(f.data,f.w,f.h,exposed,'dim native circuit');assert.equal(selected(normal,17,20,f.w),false);assert.ok(selected(exposed,17,20,f.w));
  for(const x of[12,19,20,26])assert.equal(selected(exposed,x,20,f.w),false,'Native metal gaps between circuit bars must remain visible');
});

test('a segmented native ring remains an anatomical ring rather than a solid decal',()=>{
  const f=image();for(const[x,y,w,h]of[[17,12,6,3],[17,25,6,3],[12,17,3,6],[25,17,3,6]])rect(f,x,y,w,h,[210,43,29,255]);const result=build(f.data,f.w,f.h,{hue:5,hueSpread:30});
  validate(f.data,f.w,f.h,result,'segmented ring');
  for(const[x,y]of[[20,13],[20,26],[13,20],[26,20]])assert.ok(selected(result,x,y,f.w),'Every nearby native ring segment should be retained');
  assert.equal(selected(result,20,20,f.w),false,'Neutral center must remain a real gap');
});

test('neutral armor and transparent saturated pixels cannot invent a weakpoint',()=>{
  const f=image();rect(f,14,14,12,12,[255,0,0,0]);const result=build(f.data,f.w,f.h);
  const stats=validate(f.data,f.w,f.h,result,'no invented feature');assert.equal(stats.selectedCount,0);for(const key of['sealed','hot','emission'])assert.ok(result[key].every(value=>value===0));
});

const preparedNativePngs=new Map();
function nativeCrop(crop){
  if(crop.asset.frameSample){
    const sample=crop.asset.frameSample,source=sample.source,file=source.sourcePath||source.src;if(!file||!fs.existsSync(path.join(root,file.split('?')[0])))return null;
    if(!preparedNativePngs.has(file)){const original=harness.pngMaterial(file,true),rgba=new Uint8ClampedArray(original.rgba);if(file.startsWith('assets/minibosses/'))socketSandbox.StarfighterDestruction.cleanMiniAtlas(rgba,original.width,original.height);preparedNativePngs.set(file,{...original,rgba})}
    const png=preparedNativePngs.get(file),surfaceW=source.naturalWidth||source.width,surfaceH=source.naturalHeight||source.height,rect=sample.rect,bounds=sample.bounds,w=96,h=96,data=new Uint8ClampedArray(w*h*4),left=Math.max(rect.x,bounds.x,0),top=Math.max(rect.y,bounds.y,0),right=Math.min(rect.x+rect.w,bounds.x+bounds.w,surfaceW),bottom=Math.min(rect.y+rect.h,bounds.y+bounds.h,surfaceH);
    // Preserve the real 96px padded coordinate plane. Nearest native texels
    // supply independent PNG evidence; browser bilinear filtering is separate.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=rect.x+(x+.5)/w*rect.w,sy=rect.y+(y+.5)/h*rect.h;if(sx<left||sx>=right||sy<top||sy>=bottom)continue;const px=Math.floor(sx*png.width/surfaceW),py=Math.floor(sy*png.height/surfaceH);if(px<0||py<0||px>=png.width||py>=png.height)continue;const at=(py*png.width+px)*4;data.set(png.rgba.subarray(at,at+4),(y*w+x)*4)}
    return{file,w,h,data,left,top,options:crop.options,surfaceW,surfaceH,rawRect:rect,frameBounds:bounds,padded:true,frameMeta:crop.frameMeta,sourcePngWidth:png.width,sourcePngHeight:png.height};
  }
  const file=crop.asset.sourcePath||crop.asset.src;if(!file||file.startsWith('data:')||!fs.existsSync(path.join(root,file.split('?')[0])))return null;
  const png=harness.pngMaterial(file,true),surfaceW=crop.asset.naturalWidth||crop.asset.width,surfaceH=crop.asset.naturalHeight||crop.asset.height;
  const left=Math.max(0,Math.floor(crop.rect.x*png.width/surfaceW)),top=Math.max(0,Math.floor(crop.rect.y*png.height/surfaceH));
  const right=Math.min(png.width,Math.ceil((crop.rect.x+crop.rect.w)*png.width/surfaceW)),bottom=Math.min(png.height,Math.ceil((crop.rect.y+crop.rect.h)*png.height/surfaceH));
  if(right<=left||bottom<=top)return null;const w=right-left,h=bottom-top,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)data.set(png.rgba.subarray(((top+y)*png.width+left)*4,((top+y)*png.width+right)*4),y*w*4);
  return{file,w,h,data,left,top,options:crop.options,surfaceW,surfaceH,rawRect:crop.rect,frameMeta:crop.frameMeta,sourcePngWidth:png.width,sourcePngHeight:png.height};
}
const focus=process.argv.find(arg=>arg.startsWith('--focus='))?.slice('--focus='.length);
const allSpecs=[...Array.from({length:10},(_,index)=>({family:'mini',index})),...Array.from({length:9},(_,i)=>({family:'main',index:i+1})),...Array.from({length:2},(_,index)=>({family:'epic',index}))];
const specs=focus?allSpecs.filter(item=>item.family+':'+item.index===focus):allSpecs;
assert.ok(specs.length,'Unknown focus '+focus);
const roster=[];
test('all '+specs.length+' selected non-reference encounters preserve native material boundaries in real PNG crops',()=>{
  for(const spec of specs){
    if(spec.family==='mini')art.startMiniBossLab(spec.index);else if(spec.family==='main')art.startBossLab(spec.index);else art.startEpicBossLab(spec.index);
    const enemy=art.miniBoss||art.boss,phaseCount=spec.family==='mini'?1:spec.family==='epic'?4:2,crops=new Map();
    Object.assign(enemy,{intro:0,x:710,y:263,hitFlash:0,recoil:0,visualAngle:0,animOffset:0,attackCycle:1,lastShotClock:-10,weakOpen:true,weakTelegraph:0,coreAperture:1});
    for(let phase=1;phase<=phaseCount;phase++){
      if(spec.family!=='mini')enemy.phase=phase;
      const late=spec.family==='epic'||spec.family==='main'&&spec.index>=5,sampleCount=late?32:16;
      for(let sample=0;sample<sampleCount;sample++){
        const progress=(sample+.05)/sampleCount;enemy.clock=progress*5;enemy.cool=1.3*(1-progress);enemy.ironCycle=progress*(phase===1?1.05:.86);enemy.chargeWindow=1.35*(1-progress);
        if(late){
          const rate=spec.family==='epic'?3.35+phase*.14:spec.index===6?(phase===1?3.5:4.05):spec.index===7?(phase===1?3.6:4):spec.index===8?(phase===1?3.65:4.1):(phase===1?3.55:3.9);
          enemy.clock=(sample+.05)/(rate*3);
          if(spec.family==='main'&&spec.index===5){let low=0,high=1;for(let i=0;i<30;i++){const mid=(low+high)/2;if(mid-Math.sin(mid*Math.PI*2)*.055<progress)low=mid;else high=mid}enemy.chargeWindow=1.35*(1-(low+high)/2)}
        }
        art.socketAuditCrops.length=0;
        if(spec.family==='mini')art.drawWeakPoints(enemy);else art.draw();
        for(const crop of art.socketAuditCrops){const bounded=crop.asset.frameSample,source=bounded?.source||crop.asset,file=source.sourcePath||source.src,key=phase+'|'+file+'|'+JSON.stringify(bounded?.rect||crop.rect)+'|'+JSON.stringify(bounded?.bounds||null)+'|'+JSON.stringify(crop.options),baseType=spec.family==='epic'?(spec.index===0?9:8):spec.index,nodeIndex=crop.options.seed-(spec.family==='mini'||baseType<5?baseType*3:baseType);if(!crops.has(key))crops.set(key,{...crop,phase,sample,nodeIndex})}
      }
    }
    assert.ok(crops.size,enemy.def.name+' must actually call the anatomical material renderer');
    const stats={name:enemy.def.name,...spec,phaseCount,crops:0,selectedCrops:0,nativePixels:0,selectedPixels:0,zeroCrops:[],faintOnlyCrops:[],nodeCoverage:[],cropCoverage:[],phases:[]};
    for(const crop of crops.values()){
      const native=nativeCrop(crop);if(!native)continue;const result=build(native.data,native.w,native.h,native.options),counts=validate(native.data,native.w,native.h,result,enemy.def.name+' P'+crop.phase);
      stats.crops++;stats.nativePixels+=native.w*native.h;stats.selectedPixels+=counts.selectedCount;
      const coverage={phase:crop.phase,nodeIndex:crop.nodeIndex,sample:crop.sample,file:native.file,left:native.left,top:native.top,w:native.w,h:native.h,sourcePngWidth:native.sourcePngWidth,sourcePngHeight:native.sourcePngHeight,surfaceW:native.surfaceW,surfaceH:native.surfaceH,rawRect:native.rawRect,frameMeta:native.frameMeta,options:native.options,...counts};stats.cropCoverage.push(coverage);
      if(counts.selectedCount){stats.selectedCrops++;assert.ok(counts.hotLuma>counts.sealedLuma,enemy.def.name+' selected native emitter should brighten')}else stats.zeroCrops.push(coverage);
      if(counts.selectedCount&&!counts.opaqueSelectedCount)stats.faintOnlyCrops.push(coverage);
      if(!stats.phases.includes(crop.phase))stats.phases.push(crop.phase);
    }
    assert.ok(stats.crops,enemy.def.name+' real PNG crop evidence must exist');assert.ok(stats.selectedCrops,enemy.def.name+' needs at least one native emitter');assert.equal(stats.phases.length,phaseCount,enemy.def.name+' phase coverage');
    const nodes=new Map();for(const crop of stats.cropCoverage){const key=crop.phase+':'+crop.nodeIndex;let node=nodes.get(key);if(!node){node={phase:crop.phase,nodeIndex:crop.nodeIndex,crops:0,selectedPixels:0,sourceOpaqueArea:0,emissionAlphaArea:0,zeroCrops:0,faintOnlyCrops:0,minSelectedPixels:Infinity,minEmissionAlphaArea:Infinity,minEmissionToOpaqueRatio:Infinity};nodes.set(key,node)}node.crops++;node.selectedPixels+=crop.selectedCount;node.sourceOpaqueArea+=crop.sourceOpaqueArea;node.emissionAlphaArea+=crop.emissionAlphaArea;node.zeroCrops+=crop.selectedCount===0;node.faintOnlyCrops+=crop.selectedCount>0&&crop.opaqueSelectedCount===0;node.minSelectedPixels=Math.min(node.minSelectedPixels,crop.selectedCount);node.minEmissionAlphaArea=Math.min(node.minEmissionAlphaArea,crop.emissionAlphaArea);node.minEmissionToOpaqueRatio=Math.min(node.minEmissionToOpaqueRatio,crop.emissionToOpaqueRatio)}
    stats.nodeCoverage=[...nodes.values()].map(node=>({...node,emissionToOpaqueRatio:node.sourceOpaqueArea?node.emissionAlphaArea/node.sourceOpaqueArea:0}));
    roster.push(stats);harness.pngMaterialPixels.clear();preparedNativePngs.clear();console.log('NATIVE '+stats.name+': '+stats.selectedCrops+'/'+stats.crops+' crops contain selected emitters');
  }
  assert.equal(roster.length,specs.length);
});

test('inspected native weakpoints never vanish into zero or faint-only source-alpha selections',()=>{
  assert.equal(roster.length,specs.length,'Visibility coverage requires the complete selected roster');
  const findings=roster.flatMap(r=>r.nodeCoverage.filter(n=>n.zeroCrops||n.faintOnlyCrops).map(n=>({name:r.name,...n})));
  for(const finding of findings)console.error('VISIBILITY '+JSON.stringify(finding));
  assert.deepEqual(findings,[],'Every exposed weakpoint must select some substantially opaque source material in every inspected crop; see per-node coverage');
});

const report={status:failed?'fail':'pass',checks:passed,failures:failed,source:'game.js buildNativeSocketPalette',sourceSha256:crypto.createHash('sha256').update(production).digest('hex'),roster,totals:roster.reduce((sum,r)=>{for(const key of['crops','selectedCrops','nativePixels','selectedPixels'])sum[key]=(sum[key]||0)+r[key];sum.zeroCrops=(sum.zeroCrops||0)+r.zeroCrops.length;sum.faintOnlyCrops=(sum.faintOnlyCrops||0)+r.faintOnlyCrops.length;return sum},{}),scope:'Synthetic material and alpha counterexamples plus real source PNG crops captured through production palette calls for ten minibosses, nine main bosses, and two epics. Approved Bloodstar is unchanged and outside this helper.',limitations:'Source-pixel evidence does not emulate browser bilinear filtering, GPU shadow bloom, real-display contrast, animation appeal, or collision registration. Source rects round outward to include every touched native texel. Visibility gate rejects zero selections and selections with no source texel above alpha100; native alpha areas and ratios remain explicit per crop/node. Zero-emitter crops are not automatically replaced with invented color.'};
report.focus=focus||null;
const reportName=focus?'anatomical-sockets-'+focus.replace(':','-')+'-audit.json':'anatomical-sockets-audit.json';
fs.writeFileSync(path.join(root,'artifacts',reportName),JSON.stringify(report,null,2)+'\n');
console.log(`\n${passed} anatomical socket checks passed, ${failed} failed.`);console.log('Wrote artifacts/'+reportName);if(failed)process.exitCode=1;
