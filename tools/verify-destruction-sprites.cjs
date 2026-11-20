#!/usr/bin/env node
'use strict';

// Independent PNG ownership checks for prepared destruction artwork.
// Nothing here changes shipping art, source code, or real browser storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');

function projectPath(filename){
  assert.equal(typeof filename,'string','Asset path must be a string');
  const absolute=path.resolve(root,filename);
  assert.ok(absolute.toLowerCase().startsWith((root+path.sep).toLowerCase()),'Asset must stay within this project: '+filename);
  return absolute;
}
function png(filename){
  const bytes=fs.readFileSync(projectPath(filename));assert.equal(bytes.toString('ascii',1,4),'PNG',filename);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],color=bytes[25],channels=({0:1,2:3,3:1,4:2,6:4})[color];
  assert.equal(depth,8,filename+' must use 8-bit channels');assert.equal(bytes[28],0,filename+' must be noninterlaced');assert.ok(channels);
  let palette=null,transparent=null;const compressed=[];
  for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+n);if(type==='IDAT')compressed.push(data);else if(type==='PLTE')palette=data;else if(type==='tRNS')transparent=data;at+=n+12}
  const raw=zlib.inflateSync(Buffer.concat(compressed)),stride=width*channels,rgba=new Uint8ClampedArray(width*height*4);let previous=Buffer.alloc(stride),offset=0;
  const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c};
  for(let y=0;y<height;y++){
    const filter=raw[offset++],row=Buffer.allocUnsafe(stride);assert.ok(filter<=4);
    for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;row[x]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255}
    for(let x=0;x<width;x++){
      const at=x*channels,out=(y*width+x)*4;
      if(color===6)rgba.set(row.subarray(at,at+4),out);
      else if(color===2)rgba.set([row[at],row[at+1],row[at+2],transparent&&row[at]===transparent.readUInt16BE(0)&&row[at+1]===transparent.readUInt16BE(2)&&row[at+2]===transparent.readUInt16BE(4)?0:255],out);
      else if(color===4)rgba.set([row[at],row[at],row[at],row[at+1]],out);
      else if(color===0)rgba.set([row[at],row[at],row[at],transparent&&row[at]===transparent.readUInt16BE(0)?0:255],out);
      else{const index=row[at];rgba.set([palette[index*3],palette[index*3+1],palette[index*3+2],transparent?.[index]??255],out)}
    }
    previous=row;
  }
  return{width,height,rgba,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function verifyPartition(source,layers,label='partition'){
  const size=source.width*source.height,owner=new Int16Array(size);owner.fill(-1);const counts=layers.map(()=>0);let nativePixels=0,partialAlphaPixels=0;
  for(const layer of layers){assert.equal(layer.width,source.width,label+' width');assert.equal(layer.height,source.height,label+' height')}
  for(let p=0;p<size;p++){
    const at=p*4,a=source.rgba[at+3],x=p%source.width,y=Math.floor(p/source.width);let owned=-1;
    for(let index=0;index<layers.length;index++)if(layers[index].rgba[at+3]){
      assert.equal(owned,-1,label+' double-owned native texel @'+x+','+y);owned=index;
    }
    if(!a){assert.equal(owned,-1,label+' adds alpha outside original silhouette @'+x+','+y);continue}
    nativePixels++;if(a<255)partialAlphaPixels++;
    assert.notEqual(owned,-1,label+' loses native texel @'+x+','+y);
    for(let channel=0;channel<4;channel++)assert.equal(layers[owned].rgba[at+channel],source.rgba[at+channel],label+' changes native RGBA @'+x+','+y+' channel'+channel);
    owner[p]=owned;counts[owned]++;
  }
  return{owner,counts,nativePixels,partialAlphaPixels};
}
function selfChecks(){
  const source={width:3,height:1,rgba:Uint8ClampedArray.from([10,20,30,255,80,70,60,128,0,0,0,0])};
  const core={...source,rgba:Uint8ClampedArray.from([10,20,30,255,0,0,0,0,0,0,0,0])},part={...source,rgba:Uint8ClampedArray.from([0,0,0,0,80,70,60,128,0,0,0,0])};
  assert.deepEqual(verifyPartition(source,[core,part]).counts,[1,1]);
  assert.throws(()=>verifyPartition(source,[core,source]),/double-owned/);
  assert.throws(()=>verifyPartition(source,[core]),/loses native/);
  const bad={...part,rgba:part.rgba.slice()};bad.rgba[4]++;assert.throws(()=>verifyPartition(source,[core,bad]),/changes native/);
  bad.rgba.set([5,5,5,1],8);assert.throws(()=>verifyPartition(source,[core,bad]),/changes native|outside original/);
  return 5;
}
function entriesFrom(manifest){
  const sheets=manifest.sheets||manifest.sources||manifest;
  return Array.isArray(sheets)?sheets.map(sheet=>[sheet.source,sheet]):Object.entries(sheets).filter(([,value])=>value&&typeof value==='object'&&value.core&&Array.isArray(value.parts));
}
function fileOf(value){return typeof value==='string'?value:value?.file}
function auditCaps(metadataPath='assets/destruction/joint-caps.json'){
  const meta=JSON.parse(fs.readFileSync(projectPath(metadataPath),'utf8')),art=png(meta.file);
  assert.equal(art.width,meta.width);assert.equal(art.height,meta.height);assert.equal(meta.frames.length,meta.columns*meta.rows);
  const frames=meta.frames.map((frame,index)=>{
    for(const field of['x','y','w','h'])assert.ok(Number.isInteger(frame[field])&&frame[field]>=0,'Cap'+index+' valid '+field);
    assert.ok(frame.w>0&&frame.h>0&&frame.x+frame.w<=art.width&&frame.y+frame.h<=art.height,'Cap'+index+' rectangle stays inside its atlas');
    let opaquePixels=0,transparentPixels=0;const floor=[];
    for(let y=frame.y;y<frame.y+frame.h;y++)for(let x=frame.x;x<frame.x+frame.w;x++){const a=art.rgba[(y*art.width+x)*4+3];if(a>=240)opaquePixels++;if(a===0)transparentPixels++}
    assert.ok(opaquePixels>0&&transparentPixels>0,'Cap'+index+' needs both painted material and a transparent exterior');
    // These are the solid floor of the concave broken mount, not its open
    // upper rim. Test three interior bands; never fill intentional outer air.
    for(const centerY of[.5,.65,.75]){
      let pixels=0,minAlpha=255;
      for(let y=frame.y;y<frame.y+frame.h;y++)for(let x=frame.x;x<frame.x+frame.w;x++)if(((x+.5-frame.x-frame.w*.5)/(frame.w*.12))**2+((y+.5-frame.y-frame.h*centerY)/(frame.h*.1))**2<1){pixels++;minAlpha=Math.min(minAlpha,art.rgba[(y*art.width+x)*4+3])}
      assert.ok(pixels>100,'Cap'+index+' floor probe exercises painted pixels');assert.ok(minAlpha>=240,'Cap'+index+' has transparent painted-floor pixels');floor.push({centerY,pixels,minAlpha});
    }
    return{index,...frame,opaquePixels,transparentPixels,floor};
  });
  return{file:meta.file,sha256:art.sha256,width:art.width,height:art.height,frames,scope:'Native cap atlas metadata and opaque painted-floor probes. Open concave rims and exterior air remain transparent.'};
}
function auditAssets(manifestPath='assets/destruction/manifest.json'){
  const manifest=JSON.parse(fs.readFileSync(projectPath(manifestPath),'utf8')),entries=entriesFrom(manifest);assert.ok(entries.length,'Manifest must contain source sheets');
  const report={status:'pass',scope:'Exact raw-PNG ownership and RGBA reconstruction. This is not an approval of stump art or anatomical boundaries.',manifest:manifestPath,selfChecks:selfChecks(),caps:auditCaps(),sheets:[],totals:{sheets:0,parts:0,nativePixels:0,partialAlphaPixels:0,combinationsImpliedByExclusiveOwnership:0}};
  for(const[sourcePath,sheet]of entries){
    const source=png(sourcePath),coreFile=fileOf(sheet.core),core=png(coreFile),parts=sheet.parts.map(part=>({meta:part,file:fileOf(part),image:png(fileOf(part))})),result=verifyPartition(source,[core,...parts.map(part=>part.image)],sourcePath);
    const cols=sheet.cols,rows=sheet.rows,cellW=sheet.cellW,cellH=sheet.cellH;for(const value of[cols,rows])assert.ok(Number.isInteger(value)&&value>0,sourcePath+' valid tile grid');for(const value of[cellW,cellH])assert.ok(Number.isFinite(value)&&value>0,sourcePath+' valid native tile extent');
    assert.equal(source.width,cols*cellW,sourcePath+' columns align');assert.equal(source.height,rows*cellH,sourcePath+' rows align');
    const ids=new Set();for(const part of parts){assert.ok(typeof part.meta.id==='string'&&part.meta.id.length);assert.ok(!ids.has(part.meta.id),sourcePath+' duplicate assembly id');ids.add(part.meta.id);assert.equal(part.meta.capFrames.length,cols*rows,part.file+' cap state covers every source tile')}
    const frames=[];
    for(let frame=0;frame<cols*rows;frame++){
      const counts=Array(parts.length+1).fill(0),col=frame%cols,row=Math.floor(frame/cols),ox=Math.round(col*cellW),oy=Math.round(row*cellH),right=Math.round((col+1)*cellW),bottom=Math.round((row+1)*cellH);
      for(let y=oy;y<bottom;y++)for(let x=ox;x<right;x++){const index=result.owner[y*source.width+x];if(index>=0)counts[index]++}
      assert.ok(counts[0]>0,sourcePath+' frame'+frame+' must preserve a native core');
      for(let index=0;index<parts.length;index++){
        const cap=parts[index].meta.capFrames[frame];
        if(cap===null){assert.equal(counts[index+1],0,parts[index].file+' inactive frame '+frame+' unexpectedly contains anatomy');continue}
        assert.ok(counts[index+1]>0,parts[index].file+' active frame '+frame+' is empty');
        for(const field of['x','y','w','h','angle'])assert.ok(Number.isFinite(cap[field]),parts[index].file+' frame'+frame+' finite '+field);
        assert.ok(cap.w>0&&cap.h>0,parts[index].file+' cap has positive dimensions');
      }
      frames.push({frame,counts});
    }
    const summary={source:sourcePath,sourceSha256:source.sha256,core:coreFile,coreSha256:core.sha256,parts:parts.map(part=>({id:part.meta.id,file:part.file,sha256:part.image.sha256})),width:source.width,height:source.height,cols,rows,cellW,cellH,nativePixels:result.nativePixels,partialAlphaPixels:result.partialAlphaPixels,frames};
    if(sourcePath.includes('prism-warden')&&sourcePath.includes('inbetweens'))summary.normalization='Raw PNG includes opaque black backing in nativePixels. Production intersects these exclusive ownership masks with the prepared transparent source alpha; this raw pixel count is not visible foreground area.';
    report.sheets.push(summary);
    report.totals.sheets++;report.totals.parts+=parts.length;report.totals.nativePixels+=result.nativePixels;report.totals.partialAlphaPixels+=result.partialAlphaPixels;report.totals.combinationsImpliedByExclusiveOwnership+=2**parts.length;
    console.log('ASSET '+sourcePath+': '+parts.length+' exclusive parts, '+(cols*rows)+' tiles, '+result.nativePixels+' identical source pixels');
  }
  return report;
}
async function main(){
  const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
  const report=auditAssets(option('manifest')||'assets/destruction/manifest.json');
  report.runtime='Asset-only report. Separate traced production integration results are in artifacts/destruction-sprites-runtime-audit.json.';
  fs.writeFileSync(path.join(root,'artifacts/destruction-sprites-assets-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS exclusive source partition and tile/cap metadata; separate runtime audit covers integration.');
}
module.exports={png,verifyPartition,selfChecks,entriesFrom,auditCaps,auditAssets};
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1});
