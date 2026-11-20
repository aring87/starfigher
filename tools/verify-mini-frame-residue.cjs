#!/usr/bin/env node
'use strict';
// Original atlas contamination is not newly created damage topology. Audit it
// independently of the builder's ownership labels and fracture coordinates.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {png}=require('./verify-destruction-sprites.cjs'),root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8'));
const sources=Object.entries(manifest.sources).filter(([file])=>file.startsWith('assets/minibosses/'));
function cell(image,sheet,frame){const x0=Math.round(frame%sheet.cols*sheet.cellW),y0=Math.round(Math.floor(frame/sheet.cols)*sheet.cellH),W=Math.round((frame%sheet.cols+1)*sheet.cellW)-x0,H=Math.round((Math.floor(frame/sheet.cols)+1)*sheet.cellH)-y0,rgba=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)rgba.set(image.rgba.subarray(((y0+y)*image.width+x0)*4,((y0+y)*image.width+x0+W)*4),y*W*4);return{W,H,rgba}}
function components(tile,threshold){
  const{W,H,rgba}=tile,N=W*H,labels=new Int32Array(N),queue=new Int32Array(N),items=[];labels.fill(-1);
  for(let p=0;p<N;p++){
    if(labels[p]>=0||rgba[p*4+3]<threshold)continue;const id=items.length;let head=0,tail=1,alpha=0,r=0,g=0,b=0,minX=W,minY=H,maxX=-1,maxY=-1;queue[0]=p;labels[p]=id;
    while(head<tail){const at=queue[head++],x=at%W,y=Math.floor(at/W),a=rgba[at*4+3];alpha+=a;r+=rgba[at*4]*a;g+=rgba[at*4+1]*a;b+=rgba[at*4+2]*a;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(labels[q]<0&&rgba[q*4+3]>=threshold){labels[q]=id;queue[tail++]=q}}
    }
    items.push({id,pixels:tail,alphaMass:alpha/255,bounds:[minX,minY,maxX,maxY],meanRgb:[r/alpha,g/alpha,b/alpha].map(Math.round),top:minY===0,bottom:maxY===H-1});
  }
  const primary=items.reduce((best,item)=>!best||item.alphaMass>best.alphaMass?item:best,null);return{labels,items,primary};
}
function describeForeign(tile,labeling,adjacent){
  return labeling.items.filter(item=>item!==labeling.primary&&(item.top||item.bottom)).map(item=>{
    const links=[];
    for(const edge of['top','bottom'])if(item[edge]&&adjacent[edge]){
      const other=adjacent[edge],y=edge==='top'?0:tile.H-1,ny=edge==='top'?other.tile.H-1:0;let matched=0;
      for(let x=0;x<tile.W;x++)if(labeling.labels[y*tile.W+x]===item.id)for(let xx=Math.max(0,x-1);xx<=Math.min(other.tile.W-1,x+1);xx++)if(other.labels[ny*other.tile.W+xx]===other.primary?.id){matched++;break}
      links.push({edge,neighborFrame:other.frame,neighborPrimaryContacts:matched});
    }
    return{...item,links};
  });
}

function loadGame(){const harness=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').replace(/^#![^\n]*\n/,'').split('const game = createGame();')[0];return new Function('require','__dirname',harness+'\nreturn{createGame};')(require,__dirname).createGame()}
// Only implement the full-image copy and destination-in operations used in
// production asset preparation. Scene transforms, cap drawing and GPU output
// are not emulated; those remain covered by renderer traces/browser inspection.
function installPixelPreparation(g){
  const cache=new Map(),decoded=file=>{if(!cache.has(file))cache.set(file,png(file));return cache.get(file)},Base=g.sandbox.Image,created=[];
  g.sandbox.Image=class extends Base{set src(file){if(file.endsWith('.png'))this.nativeRGBA=decoded(file).rgba;super.src=file}get src(){return super.src}};
  const create=g.document.createElement;
  g.document.createElement=tag=>{
    const canvas=create(tag);if(tag!=='canvas')return canvas;const c=canvas.getContext('2d'),draw=c.drawImage;c.trace=[];canvas.pixelOperations=[];created.push(canvas);
    c.drawImage=(image,...args)=>{
      draw.call(c,image,...args);canvas.pixelOperations.push({op:'drawImage',image,composite:c.globalCompositeOperation,args});
      const pixels=image.nativeRGBA;if(!pixels)return;
      const matrix=c.getTransform(),identity=matrix.a===1&&matrix.b===0&&matrix.c===0&&matrix.d===1&&matrix.e===0&&matrix.f===0;
      if(!identity||!([2,4].includes(args.length)&&args[0]===0&&args[1]===0))return;
      const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(w!==canvas.width||h!==canvas.height||args.length===4&&(args[2]!==w||args[3]!==h))return;
      if(c.globalCompositeOperation==='destination-in'){
        assert.ok(canvas.nativeRGBA,'A normalized mask must follow its prepared color source');
        for(let i=3;i<pixels.length;i+=4)canvas.nativeRGBA[i]=Math.round(canvas.nativeRGBA[i]*pixels[i]/255);
      }else if(c.globalCompositeOperation==='source-over')canvas.nativeRGBA=new Uint8ClampedArray(pixels);
    };
    c.getImageData=(x,y,w,h)=>{
      canvas.pixelOperations.push({op:'getImageData',args:[x,y,w,h]});assert.ok(canvas.nativeRGBA,'Preparation must read actual decoded image pixels');assert.ok(x>=0&&y>=0&&x+w<=canvas.width&&y+h<=canvas.height);const data=new Uint8ClampedArray(w*h*4);for(let yy=0;yy<h;yy++)data.set(canvas.nativeRGBA.subarray(((y+yy)*canvas.width+x)*4,((y+yy)*canvas.width+x+w)*4),yy*w*4);return{data,width:w,height:h};
    };
    c.putImageData=(pixels,x,y)=>{assert.equal(x,0);assert.equal(y,0);canvas.pixelOperations.push({op:'putImageData'});canvas.nativeRGBA=new Uint8ClampedArray(pixels.data)};
    return canvas;
  };
  return{created};
}
function samePrimaryBytes(original,cleaned,tiles,labels){
  let primary=0,removed=0;
  for(let frame=0;frame<tiles.length;frame++){
    const tile=tiles[frame],labeling=labels[frame],ox=frame%4*tile.W,oy=Math.floor(frame/4)*tile.H;
    for(let p=0;p<tile.W*tile.H;p++){
      const at=((oy+Math.floor(p/tile.W))*original.width+ox+p%tile.W)*4,isPrimary=labeling.labels[p]===labeling.primary?.id;
      for(let c=0;c<3;c++)assert.equal(cleaned[at+c],original.rgba[at+c],'Cleanup may mutate alpha only, including orphan RGB');
      if(isPrimary){for(let c=0;c<4;c++)assert.equal(cleaned[at+c],original.rgba[at+c],'Every primary-body RGBA byte must remain unchanged');primary++}
      else if(original.rgba[at+3]){assert.equal(cleaned[at+3],0,'Even a one-pixel non-primary component must be removed');removed++}
    }
  }
  return{primaryPixels:primary,removedPixels:removed};
}
const g=loadGame(),moduleApi=g.sandbox.StarfighterDestruction;assert.equal(typeof moduleApi.cleanMiniAtlas,'function','Production cleanMiniAtlas API must be present');const productionClean=moduleApi.cleanMiniAtlas;
const preparation=installPixelPreparation(g);let cleanupCalls=0;moduleApi.cleanMiniAtlas=(...args)=>{cleanupCalls++;return productionClean(...args)};
const tiny=new Uint8ClampedArray(16*4*4);for(const[x,y,a]of[[1,1,200],[2,1,200],[6,3,1],[9,1,255],[15,3,24]])tiny[(y*16+x)*4+3]=a;productionClean(tiny,16,4,2,1);assert.equal(tiny[(3*16+6)*4+3],0);assert.equal(tiny[(3*16+15)*4+3],0);assert.equal(tiny[(1*16+1)*4+3],200);
const report={date:new Date().toISOString(),algorithm:'independent-per-cell-native-components-and-row-boundaries-v2',scope:'All ten mini atlases, all sixteen cells, intact and every normalized core/live-part combination. Independent original-source component labeling defines foreign material; actual production cleanup and loader/normalization execute on real decoded PNG bytes.',thresholds:[1,24],primaryPixelsUnchanged:0,removedPixels:0,productionPreparation:{cleanupCalls:0,preparedSources:0,normalizedLayers:0,sourceReadWriteTraces:0},sheets:[],states:0,failures:[],muzzles:[]};
for(const[file,sheet]of sources){
  const native=png(file),rawLayers=[png(sheet.core),...sheet.parts.map(p=>png(p.file))],tiles=Array.from({length:sheet.cols*sheet.rows},(_,frame)=>cell(native,sheet,frame)),byThreshold=new Map(report.thresholds.map(threshold=>[threshold,tiles.map(tile=>components(tile,threshold))])),cleaned=new Uint8ClampedArray(native.rgba),stats=productionClean(cleaned,native.width,native.height),conservation=samePrimaryBytes(native,cleaned,tiles,byThreshold.get(1)),entry={file,...conservation,frames:[]};
  report.primaryPixelsUnchanged+=conservation.primaryPixels;report.removedPixels+=conservation.removedPixels;assert.equal(stats.removedPixels,conservation.removedPixels,'Production cleanup metrics must match independent original components');
  const type=Number(file.match(/elite-(\d+)-/)[1])-1,before=cleanupCalls;g.api.startMiniBossLab(type);const asset=g.api.miniBossSpriteFor(type);assert.equal(asset.ready,true,'Prepared mini asset must finish real loader');assert.equal(cleanupCalls-before,1,'Production loader must actually invoke cleanup once');assert.equal(asset.destructionAlphaMask,true,'Modular layers must intersect the same prepared alpha');assert.deepEqual(Buffer.from(asset.nativeRGBA),Buffer.from(cleaned),'Actual loader output must equal production cleanup of actual source PNG');assert.equal(asset.frameCleanup.removedPixels,stats.removedPixels);
  const operations=asset.pixelOperations.map(op=>op.op);assert.deepEqual(operations,['drawImage','getImageData','putImageData'],'Prepared source must read/write cleaned native pixels after source copy');report.productionPreparation.sourceReadWriteTraces++;report.productionPreparation.preparedSources++;
  assert.equal(moduleApi.surface(asset,new Set()),asset,'Intact enemy must actually draw the cleaned prepared source');
  const coreSurface=moduleApi.surface(asset,new Set(),{coreOnly:true}),coreDraw=coreSurface.getContext('2d').trace.find(t=>t.op==='drawImage'),normalized=[coreDraw.image,...sheet.parts.map(part=>moduleApi.surface(asset,new Set(),{onlyPart:part.id}))];
  for(let i=0;i<normalized.length;i++){
    const layer=normalized[i],ops=layer.pixelOperations;assert.equal(ops.length,2,'Layer normalization must contain exactly prepared source and native ownership mask');assert.equal(ops[0].image,asset,'Layer RGB and alpha must come from actual cleaned source');assert.equal(ops[0].composite,'source-over');assert.equal(ops[1].composite,'destination-in');assert.equal(ops[1].image.sourcePath,i===0?sheet.core:sheet.parts[i-1].file);assert.ok(layer.destructionComposite);
    for(let at=0;at<cleaned.length;at+=4){const expected=Math.round(cleaned[at+3]*rawLayers[i].rgba[at+3]/255);assert.equal(layer.nativeRGBA[at+3],expected,'Production layer alpha must use the exact cleaned-source intersection');if(expected)for(let c=0;c<3;c++)assert.equal(layer.nativeRGBA[at+c],cleaned[at+c],'Live native layer RGB cannot change during cleanup intersection')}
    report.productionPreparation.normalizedLayers++;
  }
  const cleanedImage={width:native.width,height:native.height,rgba:asset.nativeRGBA},normalizedImages=normalized.map(layer=>({width:native.width,height:native.height,rgba:layer.nativeRGBA}));
  for(let frame=0;frame<tiles.length;frame++){
    const tile=tiles[frame],displayTile=cell(cleanedImage,sheet,frame),layerTiles=normalizedImages.map(image=>cell(image,sheet,frame)),frameReport={frame,foreign:{},states:[]};
    for(const threshold of report.thresholds){const labeling=byThreshold.get(threshold)[frame],adjacent={};for(const[edge,neighbor]of[['top',frame-sheet.cols],['bottom',frame+sheet.cols]])if(neighbor>=0&&neighbor<tiles.length)adjacent[edge]={...byThreshold.get(threshold)[neighbor],tile:tiles[neighbor],frame:neighbor};frameReport.foreign[threshold]=describeForeign(tile,labeling,adjacent)}
    const original=byThreshold.get(1)[frame],foreignIds=new Set(frameReport.foreign[1].map(c=>c.id)),foreignPixels=[];for(let p=0;p<tile.W*tile.H;p++)if(foreignIds.has(original.labels[p]))foreignPixels.push(p);
    for(let mask=0;mask<1<<sheet.parts.length;mask++){
      const retained={1:0,24:0};for(const p of foreignPixels){let alpha=mask===0?displayTile.rgba[p*4+3]:layerTiles[0].rgba[p*4+3];if(mask)for(let i=0;i<sheet.parts.length;i++)if(!(mask&(1<<i)))alpha=Math.max(alpha,layerTiles[i+1].rgba[p*4+3]);for(const threshold of report.thresholds)if(alpha>=threshold)retained[threshold]++}
      const state={mask,name:mask===0?'intact':mask===(1<<sheet.parts.length)-1?'all-parts-off':'selected-parts-off',retainedForeignPixels:retained};frameReport.states.push(state);report.states++;if(retained[1])report.failures.push({file,frame,...state,reason:'Original disconnected atlas-edge material survives production prepared display alpha.'});
    }
    entry.frames.push(frameReport);
  }
  for(const item of[{file:'elite-09-',name:'Gravity Lancer translated firing nose',frame:3,rect:[0,147,35,35],minimum:650},{file:'elite-10-',name:'Signal Executor raised emitter',frame:15,rect:[5,94,30,13],minimum:125}])if(file.includes(item.file)){
    const sourceTile=tiles[item.frame],afterTile=cell(cleanedImage,sheet,item.frame);let examined=0;for(let y=item.rect[1];y<item.rect[1]+item.rect[3];y++)for(let x=item.rect[0];x<item.rect[0]+item.rect[2];x++){const at=(y*sourceTile.W+x)*4;if(sourceTile.rgba[at+3]<192)continue;examined++;for(let c=0;c<4;c++)assert.equal(afterTile.rgba[at+c],sourceTile.rgba[at+c],item.name+' primary muzzle cannot be erased by display cleanup')}assert.ok(examined>=item.minimum);report.muzzles.push({name:item.name,examined,pass:true});
  }
  report.sheets.push(entry);console.log('PASS '+file+': all16primary bodies unchanged; '+conservation.removedPixels+' original stray pixels removed; all64display states clean');
}
const pelagic=report.sheets.find(s=>s.file.includes('elite-03-'));for(const frame of[0,8,10])assert.ok(pelagic.frames[frame].foreign[1].length,'Known Pelagic idle/source spill must remain independently exercised');assert.ok(pelagic.frames[10].foreign[1].some(c=>c.pixels===458&&c.bounds[0]===165&&c.bounds[1]===243),'Known458-pixel source defect must not disappear from the test oracle');
report.productionPreparation.cleanupCalls=cleanupCalls;assert.equal(cleanupCalls,10);assert.equal(report.productionPreparation.normalizedLayers,30);assert.equal(report.muzzles.reduce((n,m)=>n+m.examined,0),903,'Both measured muzzles must exercise the original903 hardware texels');
// Verify all480 real authored socket requests through the production painter.
// Canvas pixels are mocked here; this section certifies UV intersection and
// transparent-padding draw geometry, while the earlier section uses real PNGs.
{
  const h=loadGame(),a=h.api,create=h.document.createElement;h.document.createElement=tag=>{const view=create(tag);if(tag==='canvas')view.getContext('2d').trace=[];return view};
  const bounded={samples:0,crossingCases:[],syntheticCrossing:null};
  function verify(view){
    const {source,rect,bounds}=view.frameSample,draws=view.getContext('2d').trace.filter(t=>t.op==='drawImage');assert.equal(view.width,96);assert.equal(view.height,96);assert.equal(draws.length,1,'Each tested real socket intersects its own native frame once');const draw=draws[0];assert.equal(draw.image,source);const[,sx,sy,sw,sh,dx,dy,dw,dh]=draw.args;
    assert.ok(sx>=bounds.x-1e-8&&sy>=bounds.y-1e-8&&sx+sw<=bounds.x+bounds.w+1e-8&&sy+sh<=bounds.y+bounds.h+1e-8,'Actual bounded draw cannot sample adjacent animation cells');
    for(const[actual,expected]of[[sx,Math.max(rect.x,bounds.x,0)],[sy,Math.max(rect.y,bounds.y,0)],[sx+sw,Math.min(rect.x+rect.w,bounds.x+bounds.w,source.naturalWidth||source.width)],[sy+sh,Math.min(rect.y+rect.h,bounds.y+bounds.h,source.naturalHeight||source.height)],[dx,(sx-rect.x)/rect.w*96],[dy,(sy-rect.y)/rect.h*96],[dw,sw/rect.w*96],[dh,sh/rect.h*96]])assert.ok(Math.abs(actual-expected)<1e-7,'Source clipping must preserve exact original mapping inside the96px plane');
    assert.ok(dx>=-1e-7&&dy>=-1e-7&&dx+dw<=96+1e-7&&dy+dh<=96+1e-7);assert.equal(view.getContext('2d').trace.some(t=>['fill','fillRect','stroke','strokeRect'].includes(t.op)),false,'Padding cannot be painted with arbitrary filler');
    return{rect:{...rect},bounds:{...bounds},draw:draw.args.slice(1),padding:[dx,dy,96-dx-dw,96-dy-dh].map(n=>Math.max(0,n))};
  }
  for(let type=0;type<10;type++){
    a.startMiniBossLab(type);const e=a.miniBoss;e.weakOpen=true;e.coreAperture=1;e.hitFlash=0;
    for(let frame=0;frame<16;frame++){
      a.materialContext.trace=[];a.paintMiniBossNativeBody(e,frame);const views=new Set();
      for(const draw of a.materialContext.trace.filter(t=>t.op==='drawImage')){const palette=[...a.nativePaletteCache.values()].find(p=>[p.sealed,p.hot,p.emission].includes(draw.image));if(palette?.sourceAsset?.frameSample)views.add(palette.sourceAsset)}
      assert.equal(views.size,3,'Every authored cell must exercise all three actual socket views');
      for(const view of views){const checked=verify(view),{rect,bounds}=checked;assert.deepEqual([bounds.x,bounds.y,bounds.w,bounds.h],[frame%4*384,Math.floor(frame/4)*256,384,256]);bounded.samples++;
        if(rect.x<bounds.x||rect.y<bounds.y||rect.x+rect.w>bounds.x+bounds.w||rect.y+rect.h>bounds.y+bounds.h){const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2,points=a.miniCoreTracks[type][frame],distances=points.map(([x,y])=>Math.hypot(cx-(bounds.x+(x/e.def.w+.5)*384),cy-(bounds.y+(y/e.def.h+.5)*256))),node=distances.indexOf(Math.min(...distances));bounded.crossingCases.push({type,frame,node,...checked})}
      }
    }
  }
  assert.equal(bounded.samples,480);
  a.startMiniBossLab(2);const source=a.miniBossSpriteFor(2),view=a.boundedMaterialSample(source,{x:370,y:246,w:40,h:40},{x:0,y:0,w:384,h:256});bounded.syntheticCrossing=verify(view);assert.ok(bounded.syntheticCrossing.padding[2]>60&&bounded.syntheticCrossing.padding[3]>60,'Synthetic edge case must retain substantial transparent right/bottom padding');
  report.boundedMaterialSamples=bounded;console.log(`PASS ${bounded.samples} actual bounded socket samples; ${bounded.crossingCases.length} original requests cross their frame; explicit synthetic crossing preserves transparent padding`);
}
fs.writeFileSync(path.join(root,'artifacts/mini-frame-residue-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.states} prepared display states; ${report.primaryPixelsUnchanged} primary texels byte-exact; ${report.removedPixels} stray texels removed; ${report.failures.length} failures`);if(report.failures.length)process.exitCode=1;
module.exports={components,describeForeign,cell};
