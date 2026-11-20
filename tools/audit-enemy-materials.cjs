'use strict';
// Historical generic-relighting diagnostic. The shipping anatomical renderer
// is verified by verify-anatomical-sockets.cjs; this helper is legacy evidence.
// Inspect actual production socket crops and real PNG texels. No source art,
// browser data, game assets or player saves are changed by this audit.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),production=fs.readFileSync(path.join(root,'game.js'),'utf8');
let setup=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').split('const game = createGame();')[0];
setup=setup.replace(/^#![^\r\n]*[\r\n]+/,'');
// Borrow the verification harness only for read-only production render traces
// and native PNG decoding. Its canvas mock does not produce pixel evidence.
if(!setup.includes('createImageData:'))setup=setup.replace('getImageData: (_x','createImageData: (width,height) => ({ data: new Uint8ClampedArray(width*height*4) }),\n    getImageData: (_x');
const harness=new Function('require','__dirname',setup+'\nreturn {createGame,pngMaterial,pngMaterialPixels,bloodstarBodyPasses};')(require,__dirname);
function extract(name){
  const start=production.indexOf('function '+name+'(');if(start<0)throw new Error('Missing production helper '+name);
  let end=production.indexOf('{',start)+1,depth=1;
  for(;depth&&end<production.length;end++){if(production[end]==='{')depth++;if(production[end]==='}')depth--}
  return production.slice(start,end)
}
const palette=new Function('const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));'+['nativeEmissionWeight','relightNativeMaterial','recolorBloodstarMaterial'].map(extract).join('\n')+';return {nativeEmissionWeight,relightNativeMaterial,recolorBloodstarMaterial};')();
const {api:art}=harness.createGame(),ctx=art.drawingContext,material=art.materialContext;
const round=n=>Number(n.toFixed(4)),luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const specs=[...Array.from({length:10},(_,index)=>({kind:'mini',index})),...Array.from({length:10},(_,index)=>({kind:'apex',index})),...Array.from({length:2},(_,index)=>({kind:'epic',index}))];
const roster=[];
for(const spec of specs){
  if(spec.kind==='mini')art.startMiniBossLab(spec.index);else if(spec.kind==='epic')art.startEpicBossLab(spec.index);else art.startBossLab(spec.index);
  const enemy=spec.kind==='mini'?art.miniBoss:art.boss,phaseCount=spec.kind==='mini'?1:spec.kind==='epic'?4:2,crops=new Map(),coverage=[];
  Object.assign(enemy,{intro:0,x:710,y:263,hitFlash:0,recoil:0,visualAngle:0,animOffset:0,attackCycle:1,lastShotClock:-10,weakOpen:true,weakTelegraph:0,coreAperture:1});
  for(let phase=1;phase<=phaseCount;phase++){
    const seenFrames=new Set(),seenFiles=new Set();let registrationsChecked=0,maxRegistrationError=0;
    if(spec.kind!=='mini')enemy.phase=phase;
    for(const node of art.activeWeakNodes(enemy)){node.destroyed=false;node.hp=node.max}
    for(let sample=0;sample<96;sample++){
      const progress=(sample+.05)/96;
      if(spec.kind==='mini')enemy.clock=progress*12/enemy.def.rate;
      else if(spec.kind==='epic')enemy.clock=progress*32/((3.35+phase*.14)*3);
      else if(spec.index===0)enemy.clock=progress*4/(phase===1?2.45:3.15);
      else if(spec.index===1)enemy.clock=progress*2/(phase===1?5:6.5);
      else if(spec.index===2)enemy.clock=progress*2/(phase===1?4.6:6.2);
      else if(spec.index===3){enemy.cool=(phase===1?1.3:1.25)*(1-progress);enemy.clock=progress*3}
      else if(spec.index===4){enemy.ironCycle=progress*(phase===1?1.05:.86);enemy.clock=progress*3}
      else if(spec.index===5){enemy.chargeWindow=1.35*(1-progress);enemy.clock=progress*3}
      else {const rate=spec.index===6?(phase===1?3.5:4.05):spec.index===7?(phase===1?3.6:4):spec.index===8?(phase===1?3.65:4.1):(phase===1?3.55:3.9);enemy.clock=progress*32/(rate*3)}
      ctx.trace=[];material.trace=[];art.bloodstarContext.trace=[];ctx.resetTransform();art.setShake(0);
      if(spec.kind==='mini')art.drawWeakPoints(enemy);else art.draw();
      const traces=spec.kind==='mini'?ctx.trace:material.trace;
      for(const record of traces){
        if(record.op!=='drawImage'||record.args.length!==9||record.composite==='destination-in')continue;
        const [file,x,y,w,h]=record.args;if(typeof file!=='string'||!file.startsWith('assets/'))continue;
        const surfaceWidth=record.image.naturalWidth||record.image.width,surfaceHeight=record.image.naturalHeight||record.image.height;
        const key=[file,x,y,w,h].join('/');if(!crops.has(key))crops.set(key,{file,rect:[x,y,w,h],sourceSurface:[surfaceWidth,surfaceHeight],phase});
        const columns=spec.kind==='mini'||spec.kind==='epic'||spec.index>=5?4:2,cellWidth=surfaceWidth/columns,cellHeight=surfaceHeight/columns;
        seenFiles.add(file);seenFrames.add(file+'/'+Math.floor((x+w/2)/cellWidth)+'/'+Math.floor((y+h/2)/cellHeight))
      }
      const center=record=>{const[x,y,w,h]=record.args.slice(-4),[a,b,c,d,e,f]=record.matrix,px=x+w/2,py=y+h/2;return{x:a*px+c*py+e,y:b*px+d*py+f}};
      let painted=[];
      if(spec.kind==='apex'&&spec.index===0){
        const passes=harness.bloodstarBodyPasses(art,ctx.trace,art.bloodstarContext.trace),weight=passes.reduce((sum,pass)=>sum+pass.body.alpha,0);
        painted=art.activeWeakNodes(enemy).map((_node,index)=>({x:passes.reduce((sum,pass)=>sum+pass.centers[index].x*pass.body.alpha,0)/weight,y:passes.reduce((sum,pass)=>sum+pass.centers[index].y*pass.body.alpha,0)/weight}))
      }else painted=ctx.trace.filter(record=>record.op==='drawImage'&&(spec.kind==='mini'?record.args.length===9&&record.image?.sourcePath?.endsWith(enemy.def.file):record.image===art.materialBuffer)).map(center);
      for(const node of art.activeWeakNodes(enemy)){
        const target=art.worldWeakNode(enemy,node),error=Math.min(...painted.map(point=>Math.hypot(point.x-target.x,point.y-target.y)));
        if(!Number.isFinite(error)||error>1e-6)throw new Error(enemy.def.name+' phase '+phase+' visible core/collision drift '+error);
        registrationsChecked++;maxRegistrationError=Math.max(maxRegistrationError,error)
      }
    }
    coverage.push({phase,nativeSourceFrames:seenFrames.size,sourceFiles:[...seenFiles],actualPaintedCoreRegistrationsChecked:registrationsChecked,maximumPaintedCoreCollisionErrorPixels:round(maxRegistrationError)})
  }
  const files=[...new Set([...crops.values()].map(item=>item.file))],stats={sampledTexels:0,opaqueTexels:0,eligibleTexels:0,unchangedHousingTexels:0,housingRgbChanges:0,sourceAlphaChanges:0,newWhiteTexels:0,emissionOutsideEligible:0,eligibleNativeLuminance:0,eligibleExposedLuminance:0,eligibleSealedLuminance:0,formerBroadFilterNewWhiteTexels:0};
  const bloodstar=spec.kind==='apex'&&spec.index===0;
  let evidence=null;
  for(const file of files){
    const png=harness.pngMaterial(file,true);
    for(const crop of [...crops.values()].filter(item=>item.file===file)){
      const x=crop.rect[0]*png.width/crop.sourceSurface[0],y=crop.rect[1]*png.height/crop.sourceSurface[1],w=crop.rect[2]*png.width/crop.sourceSurface[0],h=crop.rect[3]*png.height/crop.sourceSurface[1],left=Math.max(0,Math.floor(x)),top=Math.max(0,Math.floor(y)),right=Math.min(png.width,Math.ceil(x+w)),bottom=Math.min(png.height,Math.ceil(y+h));
      if(left!==Math.floor(x)||top!==Math.floor(y)||right!==Math.ceil(x+w)||bottom!==Math.ceil(y+h))throw new Error('Socket crop exceeds native atlas: '+JSON.stringify(crop));
      const native=new Uint8ClampedArray((right-left)*(bottom-top)*4);let at=0;
      for(let py=top;py<bottom;py++)for(let px=left;px<right;px++){const p=(py*png.width+px)*4;native.set(png.rgba.subarray(p,p+4),at);at+=4}
      const hot=native.slice(),sealed=native.slice(),emission=native.slice();
      if(bloodstar){palette.recolorBloodstarMaterial(hot,2);palette.recolorBloodstarMaterial(sealed,0)}
      else {palette.relightNativeMaterial(hot,1);palette.relightNativeMaterial(sealed,-1);palette.relightNativeMaterial(emission,1,true)}
      for(let i=0;i<native.length;i+=4){
        const r=native[i],g=native[i+1],b=native[i+2],a=native[i+3],eligible=bloodstar?r>110&&r-g>40&&r-b>35:palette.nativeEmissionWeight(r,g,b,a)>0;
        stats.sampledTexels++;if(a>=128)stats.opaqueTexels++;
        if(hot[i+3]!==a||sealed[i+3]!==a)stats.sourceAlphaChanges++;
        if(!eligible){stats.unchangedHousingTexels++;if(hot[i]!==r||hot[i+1]!==g||hot[i+2]!==b||sealed[i]!==r||sealed[i+1]!==g||sealed[i+2]!==b)stats.housingRgbChanges++;if(!bloodstar&&emission[i+3])stats.emissionOutsideEligible++}
        if(a>=128){
          if(!(r>220&&g>220&&b>220)&&hot[i]>220&&hot[i+1]>220&&hot[i+2]>220)stats.newWhiteTexels++;
          if(!(r>220&&g>220&&b>220)&&r*4.6>220&&g*4.6>220&&b*4.6>220)stats.formerBroadFilterNewWhiteTexels++;
          if(eligible){stats.eligibleTexels++;stats.eligibleNativeLuminance+=luma(r,g,b);stats.eligibleExposedLuminance+=luma(hot[i],hot[i+1],hot[i+2]);stats.eligibleSealedLuminance+=luma(sealed[i],sealed[i+1],sealed[i+2])}
        }
      }
      evidence??=crop;
    }
    harness.pngMaterialPixels.clear();
  }
  for(const key of ['eligibleNativeLuminance','eligibleExposedLuminance','eligibleSealedLuminance'])stats[key]=round(stats[key]/Math.max(1,stats.eligibleTexels));
  roster.push({enemy:enemy.def.name,kind:spec.kind,phaseCount,phaseCoverage:coverage,capturedNativeSocketCrops:crops.size,sourceFiles:files,evidenceCrop:evidence,palette:bloodstar?'approved native red → yellow → bright yellow':'authored native hue, selective chromatic emission',paletteFilter:spec.kind==='epic'?(spec.index===0?'hue-rotate(24deg) saturate(1.4) contrast(1.08)':'hue-rotate(76deg) saturate(1.45) contrast(1.08)'):'none',sourcePacking:spec.kind==='mini'?'4 coherent row poses; original perspective columns intentionally excluded from idle':spec.index>=5||spec.kind==='epic'?'registered key/inbetween packing retained':'authored articulated frame and anatomical socket transforms retained',...stats});
  console.log(`${enemy.def.name}: ${crops.size} crops; ${stats.eligibleTexels} emissive texels; housing changes ${stats.housingRgbChanges}, opacity changes ${stats.sourceAlphaChanges}, new white ${stats.newWhiteTexels}`);
}
ctx.trace=material.trace=null;
const result={scope:'All 22 encounters. Production draw helpers identify actual native socket crops across runtime poses and phases; real PNG bytes, not canvas mocks, provide pixel evidence. Runtime-normalized inbetween crops map back to their original PNG dimensions before source-pixel inspection.',productionChange:'Selective native material relighting replaces whole-patch 4.6×/5.2× whitening. Bloodstar approved red/yellow ramp retained. Shutters, source alpha, cracks, char, core/body/collision transforms, coherent miniboss row poses and deliberate flight preserved.',cache:{globalLruEntries:256,canvasesPerEntry:3,canvasSize:[96,96],maximumPalettePixelBytes:256*3*96*96*4},roster,totals:roster.reduce((sum,item)=>{for(const key of['sampledTexels','eligibleTexels','housingRgbChanges','sourceAlphaChanges','newWhiteTexels','emissionOutsideEligible'])sum[key]=(sum[key]||0)+item[key];return sum},{}),limitations:'This audit proves source-pixel preservation, emission eligibility and frame crop coverage. It does not replace GPU/browser review of bloom, accessibility contrast, contour animation or long-session performance. Pixel statistics inspect original texels in the mapped source bounds; GPU resampling and original flood-alpha normalization remain unchanged. Former-filter white count is a conservative RGB×4.6 estimate before its additional contrast/screen passes.'};
if(roster.length!==22||result.totals.housingRgbChanges||result.totals.sourceAlphaChanges||result.totals.newWhiteTexels||result.totals.emissionOutsideEligible)throw new Error('Native material preservation audit failed');
fs.writeFileSync(path.join(root,'artifacts','enemy-material-native-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log('Wrote artifacts/enemy-material-native-audit.json');
