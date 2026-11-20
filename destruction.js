/* Prepared body, limb and mounting-joint sprites. No runtime body cutting. */
(() => {
  'use strict';
  const records=new Map(),composites=new Map(),MAX_SOURCES=4,MAX_COMPOSITES=8;
  let caps=null,serial=0;
  function cleanMiniAtlas(rgba,width,height,cols=4,rows=4){
    const report={removedPixels:0,removedComponents:0,frames:[]};
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const ox=Math.round(col*width/cols),oy=Math.round(row*height/rows),W=Math.round((col+1)*width/cols)-ox,H=Math.round((row+1)*height/rows)-oy,N=W*H,labels=new Int32Array(N),queue=new Int32Array(N),components=[];labels.fill(-1);
      const alpha=p=>rgba[((oy+Math.floor(p/W))*width+ox+p%W)*4+3];let primary=-1,bestMass=-1;
      let continuous=true;for(let p=0;p<N;p++)if(!alpha(p)){continuous=false;break}if(continuous){report.frames.push({frame:row*cols+col,removedPixels:0,removedComponents:0,primaryPixels:N});continue}
      for(let start=0;start<N;start++){
        if(labels[start]>=0||!alpha(start))continue;const id=components.length;let head=0,tail=1,mass=0;queue[0]=start;labels[start]=id;
        while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);mass+=alpha(p);for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++){const q=yy*W+xx;if(labels[q]<0&&alpha(q)){labels[q]=id;queue[tail++]=q}}}
        components.push({pixels:tail,mass});if(mass>bestMass){bestMass=mass;primary=id}
      }
      let removedPixels=0;for(let p=0;p<N;p++)if(labels[p]>=0&&labels[p]!==primary){rgba[((oy+Math.floor(p/W))*width+ox+p%W)*4+3]=0;removedPixels++}
      const removedComponents=Math.max(0,components.length-1);report.removedPixels+=removedPixels;report.removedComponents+=removedComponents;report.frames.push({frame:row*cols+col,removedPixels,removedComponents,primaryPixels:components[primary]?.pixels||0});
    }
    return report;
  }
  const sheets=()=>window.STARFIGHTER_DESTRUCTION_MANIFEST?.sources||{};
  const keyOf=asset=>typeof asset==='string'?asset:(asset?.sourcePath||asset?.src||'').split('?')[0];
  function picture(file){
    const image=new Image();image.ready=false;image.sourcePath=file;image.hasAlpha=true;image.destructionComposite=true;
    image.onload=()=>{image.ready=true;image.onload=image.onerror=null};
    image.onerror=()=>{image.failed=true;image.onload=image.onerror=null};
    image.src=file;return image;
  }
  function ensureCaps(){if(!caps&&window.STARFIGHTER_JOINT_CAPS)caps=picture(window.STARFIGHTER_JOINT_CAPS.file);return caps}
  function ensure(asset){
    const key=keyOf(asset),sheet=sheets()[key];if(!sheet)return null;
    if(records.has(key)){const record=records.get(key);records.delete(key);records.set(key,record);return record}
    const record={key,sheet,core:picture(sheet.core),parts:sheet.parts.map(meta=>({meta,image:picture(meta.file)}))};
    records.set(key,record);ensureCaps();
    while(records.size>MAX_SOURCES)records.delete(records.keys().next().value);
    return record;
  }
  function isReady(record){return !!record&&record.core.ready&&record.parts.every(part=>part.image.ready)&&!!ensureCaps()?.ready}
  function layerSources(record,asset){
    if(!asset?.destructionAlphaMask)return record;
    if(!asset.ready)return null;
    if(record.normalized?.asset===asset)return record.normalized;
    const width=asset.naturalWidth||asset.width,height=asset.naturalHeight||asset.height;
    const maskLayer=mask=>{
      const layer=document.createElement('canvas');layer.width=width;layer.height=height;layer.ready=true;layer.hasAlpha=true;layer.destructionComposite=true;layer.sourcePath=record.key;
      const context=layer.getContext('2d');context.drawImage(asset,0,0,width,height);context.globalCompositeOperation='destination-in';context.imageSmoothingEnabled=false;context.drawImage(mask,0,0,width,height);context.globalCompositeOperation='source-over';return layer
    };
    // Prepared sources supply the same clean alpha for miniature frame scraps
    // and opaque-backed intermediate sheets. Retain only each native layer's
    // texels; intact bodies, living limbs and debris share this exact source.
    record.normalized={asset,core:maskLayer(record.core),parts:record.parts.map(part=>({meta:part.meta,image:maskLayer(part.image)}))};
    return record.normalized
  }
  function drawCaps(context,record,broken,style){
    const atlas=window.STARFIGHTER_JOINT_CAPS,frame=atlas?.frames?.[style];if(!caps?.ready||!frame)return;
    for(const part of record.parts){
      if(!broken.has(part.meta.id))continue;
      part.meta.capFrames.forEach((joint,index)=>{
        if(!joint||!joint.pixels)return;
        const ox=index%record.sheet.cols*record.sheet.cellW,oy=Math.floor(index/record.sheet.cols)*record.sheet.cellH;
        context.save();context.translate(ox+joint.x,oy+joint.y);context.rotate(joint.angle+Math.PI/2);
        context.drawImage(caps,frame.x,frame.y,frame.w,frame.h,-joint.w/2,-joint.h*.65,joint.w,joint.h);context.restore();
      });
    }
  }
  function surface(asset,broken=new Set(),options={}){
    const record=ensure(asset);if(!record)return options.onlyPart?null:asset;
    if(!broken.size&&!options.onlyPart&&!options.coreOnly)return asset;
    if(!isReady(record))return null;
    const layers=layerSources(record,asset);if(!layers)return null;
    if(options.onlyPart){const part=layers.parts.find(item=>item.meta.id===options.onlyPart);return part?.image||null}
    const style=Math.max(0,Math.min(15,options.style||0)),ids=[...broken].sort(),key=record.key+'|'+ids.join(',')+'|'+style+'|'+!!options.coreOnly+'|'+(layers===record?'native':'prepared:'+layers.core.width+'x'+layers.core.height);
    if(composites.has(key)){const value=composites.get(key);composites.delete(key);composites.set(key,value);return value}
    const canvas=document.createElement('canvas');canvas.width=layers.core.naturalWidth||layers.core.width;canvas.height=layers.core.naturalHeight||layers.core.height;
    canvas.ready=true;canvas.hasAlpha=true;canvas.destructionComposite=true;canvas.sourcePath=record.key;canvas.destructionRevision=++serial;
    const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(layers.core,0,0);
    context.save();context.scale(canvas.width/record.sheet.width,canvas.height/record.sheet.height);drawCaps(context,record,broken,style);context.restore();
    if(!options.coreOnly)for(const part of layers.parts)if(!broken.has(part.meta.id))context.drawImage(part.image,0,0);
    composites.set(key,canvas);
    while(composites.size>MAX_COMPOSITES){const first=composites.keys().next().value,old=composites.get(first);composites.delete(first);old.width=old.height=1}
    return canvas;
  }
  window.StarfighterDestruction={
    cleanMiniAtlas,
    has:asset=>!!sheets()[keyOf(asset)],preload:asset=>{ensure(asset)},ready:asset=>isReady(ensure(asset)),surface,
    part:(asset,id)=>surface(asset,new Set(),{onlyPart:id}),
    clear(){for(const image of composites.values())image.width=image.height=1;composites.clear()},
    inspect:()=>({sources:records.size,composites:composites.size,maxSources:MAX_SOURCES,maxComposites:MAX_COMPOSITES}),
  };
})();
