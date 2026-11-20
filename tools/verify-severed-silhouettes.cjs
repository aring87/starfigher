#!/usr/bin/env node
'use strict';

// Analyze actual source-PNG alpha painted by the shipping body helpers. A cut
// passes only when every newly transparent body pixel connects to the outside.
// Existing sprite holes are allowed. This is deliberately not a polygon-bounds
// test: a polygon can reach the border while still punching a separate hole.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const identity = [1, 0, 0, 1, 0, 0];
const point = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
const inverse = (m, x, y) => { const d=m[0]*m[3]-m[1]*m[2]; return [(m[3]*(x-m[4])-m[2]*(y-m[5]))/d,(-m[1]*(x-m[4])+m[0]*(y-m[5]))/d]; };
const bounds = p => ({minX:Math.min(...p.map(v=>v[0])),minY:Math.min(...p.map(v=>v[1])),maxX:Math.max(...p.map(v=>v[0])),maxY:Math.max(...p.map(v=>v[1]))});
function inside(p,x,y){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[a,b]=p[i],[c,d]=p[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes}return yes}

function loadHarness(){
  const filename=path.join(__dirname,'verify-game.cjs');let source=fs.readFileSync(filename,'utf8');source=source.slice(0,source.indexOf('\ntest('));
  const extra=`nativeFractureProfile,nativeFractureBaseProfile,pruneNativePartIslands,nativeFractureVertices,maskNativeFractures,paintNativeBossBody,paintMiniBossNativeBody,
    auditCorePoint(e,node){const m=bossSpriteMotion(e),p=e.kind==='mini'?miniBossNodeOffset(e,node):localWeakNode(e,node);return[p.dx*m.x,p.dy*m.y]},
    forceAuditFrame(e,frame){miniBossFrame=()=>frame%16;twinMawFrame=()=>frame%2;helixFrame=()=>frame%2;riftAnimationState=()=>({frame:frame%(e.phase===1?8:4),next:frame%(e.phase===1?8:4),mix:0});ironBloomFrame=()=>frame%8;boss32AnimationState=()=>boss32AnimationFromPosition(frame);voidLeviathanAnimationState=()=>({...boss32AnimationFromPosition(frame),active:true})},`;
  assert.ok(source.includes('nativeFractureProfile,nativeFractureVertices,'),'Harness fracture exports changed');source=source.replace('nativeFractureProfile,nativeFractureVertices,',extra);
  source=source.replace('save() { stack.push(',"save() { record('save');stack.push(").replace('restore() { const saved = stack.pop();',"restore() { record('restore');const saved = stack.pop();");
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);m._compile(source+'\nmodule.exports={createGame,pngMaterial,gameSource:source};\n',filename);return m.exports;
}

function floodOutside(opaque,width,height,connectivity=4){
  const reached=new Uint8Array(opaque.length),queue=new Int32Array(opaque.length);let head=0,tail=0;
  const add=p=>{if(!opaque[p]&&!reached[p]){reached[p]=1;queue[tail++]=p}};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x)}for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1)}
  while(head<tail){const p=queue[head++],x=p%width;if(p>=width){add(p-width);if(connectivity===8){if(x)add(p-width-1);if(x+1<width)add(p-width+1)}}if(p+width<opaque.length){add(p+width);if(connectivity===8){if(x)add(p+width-1);if(x+1<width)add(p+width+1)}}if(x)add(p-1);if(x+1<width)add(p+1)}return reached;
}
function componentBoxes(mask,width){
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),out=[];
  for(let at=0;at<mask.length;at++){if(!mask[at]||seen[at])continue;let head=0,tail=1,minX=at%width,maxX=minX,minY=Math.floor(at/width),maxY=minY;queue[0]=at;seen[at]=1;
    while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const n of[p-width,p+width,...(x?[p-1]:[]),...(x+1<width?[p+1]:[])])if(n>=0&&n<mask.length&&mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}}
    out.push({pixels:tail,minX,minY,maxX,maxY});
  }return out.sort((a,b)=>b.pixels-a.pixels);
}
function productionCleanup(api,enemy,nodes,frame,body){
  // Reproduce cleanNativeFractureSurface's exact live/solid/housing anchors.
  // The source painter is evaluated separately from the cut so this never
  // replaces articulated anatomy with an invented solid silhouette.
  const anchors=[],point=(x,y)=>({x:(x-body.minX)*body.density,y:(y-body.minY)*body.density});
  for(const node of nodes){
    const profile=api.nativeFractureBaseProfile(enemy,node,frame);
    if(!node.destroyed||!profile){const p=api.auditCorePoint(enemy,node);anchors.push(point(...p))}
    if(profile?.protectedHousing)anchors.push(point(profile.protectedHousing.x,profile.protectedHousing.y));
  }
  return after=>{
    const beforeAlpha=Uint8Array.from(body.opaque,p=>p?255:0),afterAlpha=Uint8Array.from(after,p=>p?255:0);
    const removed=api.pruneNativePartIslands(beforeAlpha,afterAlpha,body.width,body.height,anchors);
    for(let p=0;p<after.length;p++)after[p]=afterAlpha[p]>4?1:0;
    return removed;
  };
}
function analyzeCut(body,polygons,protectedHousing=[],cleanup=null){
  const{opaque,width,height,density,minX,minY}=body,after=opaque.slice(),removed=new Uint8Array(opaque.length);let removedPixels=0;
  for(const polygon of polygons){const b=bounds(polygon),left=Math.max(0,Math.floor((b.minX-minX)*density)),right=Math.min(width,Math.ceil((b.maxX-minX)*density)),top=Math.max(0,Math.floor((b.minY-minY)*density)),bottom=Math.min(height,Math.ceil((b.maxY-minY)*density));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const p=y*width+x;if(after[p]&&inside(polygon,minX+(x+.5)/density,minY+(y+.5)/density)){after[p]=0;removed[p]=1;removedPixels++}}
  }
  const cleanupRemovedPixels=cleanup?cleanup(after):0;
  // Audit the complete shipping mask, including orphan cleanup, so removal
  // that opens a polygon sampling pocket to the exterior is represented.
  if(cleanupRemovedPixels)for(let p=0;p<after.length;p++)if(opaque[p]&&!after[p]&&!removed[p]){removed[p]=1;removedPixels++}
  // Flood only the newly opened pixels and old holes they reach. Reusing the
  // original exterior makes this equivalent to a fresh border flood, much
  // faster across hundreds of native poses and thousands of cuts.
  const outside=(body.outside||(body.outside=floodOutside(opaque,width,height))).slice(),queue=new Int32Array(opaque.length);let head=0,tail=0;
  const add=p=>{if(p>=0&&p<after.length&&!after[p]&&!outside[p]){outside[p]=1;queue[tail++]=p}};
  for(let p=0;p<removed.length;p++)if(removed[p]){const x=p%width;if(p<width||p>=after.length-width||!x||x===width-1||outside[p-width]||outside[p+width]||x&&outside[p-1]||x+1<width&&outside[p+1])add(p)}
  while(head<tail){const p=queue[head++],x=p%width;add(p-width);add(p+width);if(x)add(p-1);if(x+1<width)add(p+1)}
  const bounded=new Uint8Array(opaque.length);let boundedPixels=0;
  for(let p=0;p<removed.length;p++)if(removed[p]&&!outside[p]){bounded[p]=1;boundedPixels++}
  // Nearest-source sampling can close a continuous diagonal exterior passage
  // at a corner. Use eight-connected exterior with NO pixel-size tolerance.
  // Preserve the stricter four-connected result explicitly for review.
  const fourConnectedBoundedPixels=boundedPixels,corners=new Uint8Array(opaque.length);
  if(boundedPixels){const exterior8=floodOutside(after,width,height,8);for(let p=0;p<bounded.length;p++)if(bounded[p]&&exterior8[p]){bounded[p]=0;corners[p]=1;boundedPixels--}}
  const protectedCuts=protectedHousing.map(h=>{let pixels=0,beforePixels=0;for(let y=Math.max(0,Math.floor((h.y-h.ry-minY)*density));y<Math.min(height,Math.ceil((h.y+h.ry-minY)*density));y++)for(let x=Math.max(0,Math.floor((h.x-h.rx-minX)*density));x<Math.min(width,Math.ceil((h.x+h.rx-minX)*density));x++){if(((minX+(x+.5)/density-h.x)/h.rx)**2+((minY+(y+.5)/density-h.y)/h.ry)**2>1)continue;const p=y*width+x;if(opaque[p])beforePixels++;if(removed[p])pixels++}return{...h,pixels,beforePixels}}).filter(h=>h.pixels);
  return{removedPixels,cleanupRemovedPixels,boundedPixels,eightConnectedBoundedPixels:boundedPixels,fourConnectedBoundedPixels,diagonalExteriorPixels:fourConnectedBoundedPixels-boundedPixels,components:boundedPixels?componentBoxes(bounded,width):[],cornerComponents:fourConnectedBoundedPixels>boundedPixels?componentBoxes(corners,width):[],protectedCuts,after,removed,bounded,outside};
}

function nativeDraws(api,enemy,frame,pngMaterial){
  const ctx=api.drawingContext;ctx.trace=[];ctx.resetTransform();if(enemy.kind==='mini')api.paintMiniBossNativeBody(enemy,frame);else api.paintNativeBossBody(enemy,0);
  let clips=[],current=[],subpath=null;const stack=[],draws=[];
  const vertex=(r,x,y)=>point(r.matrix||identity,x,y);
  for(const r of ctx.trace){
    if(r.op==='save')stack.push(clips.slice());else if(r.op==='restore')clips=stack.pop()||[];
    else if(r.op==='beginPath'){current=[];subpath=null}
    else if(r.op==='moveTo'){subpath=[vertex(r,...r.args)];current.push(subpath)}
    else if(r.op==='lineTo'){if(!subpath){subpath=[];current.push(subpath)}subpath.push(vertex(r,...r.args))}
    else if(r.op==='rect'){const[x,y,w,h]=r.args;current.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>vertex(r,...p)))}
    else if(r.op==='ellipse'||r.op==='arc'){const[x,y,rx,ry,rotation]=r.op==='ellipse'?r.args:[r.args[0],r.args[1],r.args[2],r.args[2],0];current.push(Array.from({length:48},(_,i)=>{const a=i*Math.PI*2/48,px=Math.cos(a)*rx,py=Math.sin(a)*ry;return vertex(r,x+px*Math.cos(rotation)-py*Math.sin(rotation),y+px*Math.sin(rotation)+py*Math.cos(rotation))}))}
    else if(r.op==='clip')clips.push(current.filter(p=>p.length>=3).map(p=>p.slice()));
    else if(r.op==='drawImage'&&r.image?.sourcePath?.endsWith('.png')){
      const material=pngMaterial(r.image.sourcePath),iw=r.image.naturalWidth||r.image.width,ih=r.image.naturalHeight||r.image.height,c=r.args.slice(1),rect=c.length===8?c:c.length===4?[0,0,iw,ih,...c]:[0,0,iw,ih,c[0],c[1],iw,ih];
      const[, , , ,x,y,w,h]=rect,box=bounds([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>point(r.matrix,...p)));
      draws.push({...r,material,rect,box,clips:clips.slice(),sourceScaleX:material.width/iw,sourceScaleY:material.height/ih});
    }
  }ctx.trace=null;return draws;
}
const normalizedAlpha=new Map();
function alphaFor(draw){
  const{image,material}=draw;if(!image.getContext||!image.sourcePath.includes('inbetween'))return material.alpha;
  if(normalizedAlpha.has(image.sourcePath))return normalizedAlpha.get(image.sourcePath);
  // Shipping inbetween preparation flood-clears edge-connected near-black RGB.
  // Normalize original texels before mapping the production target dimensions.
  const opaque=Uint8Array.from(material.alpha,(a,p)=>a>=24&&material.light[p]>=24?1:0),outside=floodOutside(opaque,material.width,material.height),alpha=Uint8Array.from(material.alpha,(a,p)=>outside[p]||a<24?0:255);normalizedAlpha.set(image.sourcePath,alpha);return alpha;
}
function rasterNativeBody(draws,density=2){
  assert.ok(draws.length,'Native painter emitted no source-PNG draw');const b=bounds(draws.flatMap(d=>[[d.box.minX,d.box.minY],[d.box.maxX,d.box.maxY]])),minX=Math.floor(b.minX)-3,minY=Math.floor(b.minY)-3,width=Math.ceil((Math.ceil(b.maxX)+3-minX)*density),height=Math.ceil((Math.ceil(b.maxY)+3-minY)*density),alpha=new Uint8Array(width*height);
  for(const d of draws){const[sx,sy,sw,sh,dx,dy,dw,dh]=d.rect,sourceAlpha=alphaFor(d),left=Math.max(0,Math.floor((d.box.minX-minX)*density)),right=Math.min(width,Math.ceil((d.box.maxX-minX)*density)),top=Math.max(0,Math.floor((d.box.minY-minY)*density)),bottom=Math.min(height,Math.ceil((d.box.maxY-minY)*density)),m=d.matrix,det=m[0]*m[3]-m[1]*m[2],a0=m[3]/det,a1=-m[2]/det,a2=(m[2]*m[5]-m[3]*m[4])/det,b0=-m[1]/det,b1=m[0]/det,b2=(m[1]*m[4]-m[0]*m[5])/det;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const wx=minX+(x+.5)/density,wy=minY+(y+.5)/density;if(!d.clips.every(paths=>paths.some(p=>inside(p,wx,wy))))continue;const u=(a0*wx+a1*wy+a2-dx)/dw,v=(b0*wx+b1*wy+b2-dy)/dh;if(u<0||u>=1||v<0||v>=1)continue;const ix=Math.floor((sx+u*sw)*d.sourceScaleX),iy=Math.floor((sy+v*sh)*d.sourceScaleY);if(ix<0||iy<0||ix>=d.material.width||iy>=d.material.height)continue;const p=y*width+x,a=sourceAlpha[iy*d.material.width+ix]*d.alpha/255;if(d.composite==='destination-out')alpha[p]=Math.round(alpha[p]*(1-a));else alpha[p]=Math.round(a*255+alpha[p]*(1-a))}
  }return{opaque:Uint8Array.from(alpha,a=>a>40?1:0),alpha,width,height,density,minX,minY};
}

const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function pngChunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let c=0xffffffff;for(const v of Buffer.concat([name,data]))c=crcTable[(c^v)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([length,name,data,crc])}
function writeFailureMap(filename,body,result,polygons,protectedHousing){
  const{width,height,minX,minY,density}=body,beforeOutside=floodOutside(body.opaque,width,height),rgba=Buffer.alloc(width*height*4);
  const pixel=(x,y,c)=>{if(x>=0&&x<width&&y>=0&&y<height){const p=(y*width+x)*4;rgba[p]=c[0];rgba[p+1]=c[1];rgba[p+2]=c[2];rgba[p+3]=255}};
  for(let p=0;p<body.opaque.length;p++){const color=result.bounded[p]?[255,48,105]:result.removed[p]?[24,181,190]:body.opaque[p]?[117,136,150]:!beforeOutside[p]?[77,34,92]:[5,11,20];pixel(p%width,Math.floor(p/width),color)}
  const line=(a,b,c)=>{let[x,y]=a.map(Math.round),[endX,endY]=b.map(Math.round),dx=Math.abs(endX-x),dy=-Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1,error=dx+dy;for(let guard=0;guard<20000;guard++){pixel(x,y,c);if(x===endX&&y===endY)break;const e=2*error;if(e>=dy){error+=dy;x+=sx}if(e<=dx){error+=dx;y+=sy}}};
  for(const p of polygons)for(let i=0;i<p.length;i++)line([(p[i][0]-minX)*density,(p[i][1]-minY)*density],[(p[(i+1)%p.length][0]-minX)*density,(p[(i+1)%p.length][1]-minY)*density],[255,178,70]);
  for(const h of protectedHousing){let prev;for(let i=0;i<=64;i++){const a=i*Math.PI*2/64,next=[(h.x+Math.cos(a)*h.rx-minX)*density,(h.y+Math.sin(a)*h.ry-minY)*density];if(prev)line(prev,next,[255,238,115]);prev=next}}
  const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;fs.writeFileSync(filename,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))]));
}

function selfCheck(){
  const opaque=new Uint8Array(10000);for(let y=10;y<90;y++)for(let x=10;x<90;x++)opaque[y*100+x]=1;for(let y=45;y<55;y++)for(let x=45;x<55;x++)opaque[y*100+x]=0;const body={opaque,width:100,height:100,minX:0,minY:0,density:1};
  assert.equal(analyzeCut(body,[]).boundedPixels,0,'Original sprite holes are allowed');assert.ok(analyzeCut(body,[[[40,40],[60,40],[60,60],[40,60]]]).boundedPixels>0,'An interior polygon must fail');assert.equal(analyzeCut(body,[[[70,40],[110,40],[110,60],[70,60]]]).boundedPixels,0,'An actual edge sever must pass');
  const deceptive=[[40,40],[60,40],[60,60],[40,60],[40,40],[110,40],[110,20],[95,20],[95,40],[110,40]];assert.ok(bounds(deceptive).maxX>body.width);assert.ok(analyzeCut(body,[deceptive]).boundedPixels>0,'A polygon bounding box outside the image must not hide its separate interior punch');
  assert.ok(analyzeCut(body,[[[40,40],[110,40],[110,60],[40,60]]],[{x:50,y:50,rx:10,ry:10}]).protectedCuts.length,'An exterior-connected cut can still wrongly eat central housing');
  const cleanupHole=analyzeCut(body,[],[],after=>{after[20*100+20]=0;return 1});
  assert.equal(cleanupHole.eightConnectedBoundedPixels,1,'A new enclosed hole caused by cleanup must still fail');
  const cleanupOpen=analyzeCut(body,[[[40,40],[60,40],[60,60],[40,60]]],[],after=>{let n=0;for(let y=40;y<60;y++)for(let x=60;x<100;x++){const p=y*100+x;if(after[p]){after[p]=0;n++}}return n});
  assert.equal(cleanupOpen.boundedPixels,0,'Production cleanup opening an interior pocket to the exterior must be reflected');
}

function runAudit(options={}){
  selfCheck();const{createGame,pngMaterial,gameSource}=loadHarness(),{api}=createGame(),density=options.density||2,output=path.join(root,'artifacts','severed-silhouettes-failures');fs.mkdirSync(output,{recursive:true});
  const report={algorithm:'native-alpha-exterior8-v4-production-cleanup',sourceSha256:crypto.createHash('sha256').update(gameSource).digest('hex'),scope:'Actual source-PNG opacity mapped through production native-body draw transforms and clips, then production pure orphan cleanup with actual live/solid/housing anchors. Eight-connected transparent pixels flood from a padded image border before/after the complete mask, with no size tolerance. Four-connected diagonal corner findings remain explicit review data. Original sprite holes are allowed; newly bounded removed pixels and removed protected housing fail.',density,coverage:[],cuts:0,solidCores:0,groupChecks:0,cleanupRemovedPixels:0,rasterCornerCuts:[],failures:[],maps:[],selfChecks:7,limitations:'Nearest source-texel sampling at half-arena-pixel resolution; exterior8 models a continuous filtered-alpha diagonal passage and does not emulate GPU bilinear edge antialiasing. Strict4 corner evidence is retained separately. Binary source opacity at alpha >40 is passed to cleanup as 0/255. Inbetween RGB alpha conversion is applied at original PNG resolution before mapping its shipping target dimensions. Native material-only canvas overlays and decorative glows are excluded from the source silhouette.'},maps=new Map();
  for(const family of['mini','main','epic'])for(let type=family==='main'?1:0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='mini'?1:family==='epic'?4:2);phase++){
    if(options.family&&family!==options.family||options.type!==undefined&&type!==options.type||options.phase&&phase!==options.phase)continue;
    if(family==='mini')api.startMiniBossLab(type);else if(family==='epic')api.startEpicBossLab(type);else api.startBossLab(type);
    const enemy=family==='mini'?api.miniBoss:api.boss;Object.assign(enemy,{x:745,y:267,intro:0,phase,clock:.61,cool:5,hitFlash:0,coreAperture:1});api.player.inv=1e6;
    const count=family==='mini'?16:options.allFrames?32:family==='main'&&type<3?2:family==='main'&&type===3?(phase===1?8:4):family==='main'&&type===4?8:16;
    for(let pose=0;pose<count;pose++)for(const state of options.state?[options.state]:['sealed','open']){
      const frame=family==='mini'||family==='main'&&type<5?pose:options.allFrames?pose:pose*2;if(options.frame!==undefined&&pose!==options.frame)continue;enemy.clock=.17+pose*.073;enemy.weakOpen=state==='open';enemy.coreAperture=enemy.weakOpen?1:0;api.forceAuditFrame(enemy,frame);
      const nodes=api.activeWeakNodes(enemy);nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});
      let body=rasterNativeBody(nativeDraws(api,enemy,frame,pngMaterial),density);const profiles=nodes.map(node=>api.nativeFractureProfile(enemy,node,frame)),protectedHousing=profiles.flatMap((p,index)=>p?[]:[{x:api.auditCorePoint(enemy,nodes[index])[0],y:api.auditCorePoint(enemy,nodes[index])[1],rx:4,ry:4,label:'solid-core-'+index}]);
      report.coverage.push({family,type,phase,pose,frame,state,solidCores:profiles.filter(p=>!p).length});report.solidCores+=profiles.filter(p=>!p).length;
      const unique=new Map();profiles.forEach((profile,index)=>{if(profile)unique.set(profile.groupId??index,{profile,index})});const union=[];
      for(const{profile,index}of unique.values()){
        const members=nodes.filter((node,at)=>profiles[at]?.groupId===profile.groupId),scratch=api.fractureContext,paintedCuts=()=>{scratch.trace=[];api.maskNativeFractures(enemy,null,frame);const count=scratch.trace.filter(r=>r.op==='fill'&&r.composite==='destination-out').length;scratch.trace=null;return count};
        nodes.forEach(node=>node.destroyed=false);members.slice(0,-1).forEach(node=>node.destroyed=true);const premature=api.nativeFractureGroupReady(enemy,profile,frame)||paintedCuts()!==0;members.forEach(node=>node.destroyed=true);const complete=api.nativeFractureGroupReady(enemy,profile,frame)&&paintedCuts()===1;nodes.forEach(node=>node.destroyed=false);report.groupChecks++;
        if(premature||!complete)report.failures.push({family,type,phase,pose,frame,state,node:index,group:profile.groupId,reason:'Group alpha must remain solid until every group core is destroyed, then mask once',premature,complete});
        members.forEach(node=>{node.destroyed=true;node.hp=0});
        if(family==='main'&&type===1)body=rasterNativeBody(nativeDraws(api,enemy,frame,pngMaterial),density);
        const postBreakProfile=api.nativeFractureProfile(enemy,members[0],frame),vertices=api.nativeFractureVertices(postBreakProfile);assert.ok(vertices.length>=3&&vertices.flat().every(Number.isFinite),'Profile vertices must be a finite native-local polygon');union.push(vertices);const housing=[...protectedHousing,...(postBreakProfile.protectedHousing?[{...postBreakProfile.protectedHousing,label:'profile-housing'}]:[])],result=analyzeCut(body,[vertices],housing,productionCleanup(api,enemy,nodes,frame,body));report.cuts++;report.cleanupRemovedPixels+=result.cleanupRemovedPixels;
        if(result.diagonalExteriorPixels)report.rasterCornerCuts.push({family,type,phase,pose,frame,state,node:index,fourConnectedBoundedPixels:result.fourConnectedBoundedPixels,eightConnectedBoundedPixels:result.boundedPixels,diagonalExteriorPixels:result.diagonalExteriorPixels,components:result.cornerComponents});
        nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});
        if(result.boundedPixels||result.protectedCuts.length||!result.removedPixels){const key=[family,type,phase,index].join('-'),name=`${family}-${String(type+1).padStart(2,'0')}-phase${phase}-node${index}.png`,failure={family,type,phase,pose,frame,state,node:index,group:profile.groupId??index,removedPixels:result.removedPixels,newBoundedPixels:result.boundedPixels,eightConnectedBoundedPixels:result.eightConnectedBoundedPixels,diagonalExteriorPixels:result.diagonalExteriorPixels,components:result.components.slice(0,5),protectedCuts:result.protectedCuts,vertices,map:'artifacts/severed-silhouettes-failures/'+name};report.failures.push(failure);const severity=result.boundedPixels+result.protectedCuts.reduce((n,h)=>n+h.pixels*4,0)+(!result.removedPixels?1:0);if(!maps.has(key)||severity>maps.get(key).severity){writeFailureMap(path.join(output,name),body,result,[vertices],housing);maps.set(key,{severity,...failure})}}
      }
      if(union.length>1){
        nodes.forEach((node,index)=>{node.destroyed=!!profiles[index];node.hp=node.destroyed?0:node.max});
        if(family==='main'&&type===1)body=rasterNativeBody(nativeDraws(api,enemy,frame,pngMaterial),density);
        const finalProfiles=new Map();for(const node of nodes){const p=api.nativeFractureProfile(enemy,node,frame);if(p)finalProfiles.set(p.groupId,p)}
        const result=analyzeCut(body,[...finalProfiles.values()].map(p=>api.nativeFractureVertices(p)),protectedHousing,productionCleanup(api,enemy,nodes,frame,body));report.cleanupRemovedPixels+=result.cleanupRemovedPixels;
        if(result.diagonalExteriorPixels)report.rasterCornerCuts.push({family,type,phase,pose,frame,state,node:'all-severs',fourConnectedBoundedPixels:result.fourConnectedBoundedPixels,eightConnectedBoundedPixels:result.boundedPixels,diagonalExteriorPixels:result.diagonalExteriorPixels,components:result.cornerComponents});
        if(result.boundedPixels||result.protectedCuts.length)report.failures.push({family,type,phase,pose,frame,state,node:'all-severs',newBoundedPixels:result.boundedPixels,eightConnectedBoundedPixels:result.eightConnectedBoundedPixels,diagonalExteriorPixels:result.diagonalExteriorPixels,protectedCuts:result.protectedCuts,components:result.components.slice(0,5)});
        nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});
      }
    }
    console.log(`PROBED ${family}/${type}/phase${phase}: ${count} ${family==='mini'?'atlas':'native'} poses`);
    fs.writeFileSync(path.join(root,'artifacts','severed-silhouettes-progress.json'),JSON.stringify({algorithm:report.algorithm,sourceSha256:report.sourceSha256,last:{family,type,phase},frames:report.coverage.length,cuts:report.cuts,rasterCornerCuts:report.rasterCornerCuts,failures:report.failures,maps:[...maps.values()]},null,2));
  }
  report.maps=[...maps.values()];report.summary={frames:report.coverage.length,cuts:report.cuts,solidCoreChecks:report.solidCores,groupChecks:report.groupChecks,cleanupRemovedPixels:report.cleanupRemovedPixels,rasterCornerCuts:report.rasterCornerCuts.length,failingCuts:report.failures.length,focusedMaps:maps.size};fs.writeFileSync(path.join(root,'artifacts',options.report||'severed-silhouettes-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));for(const entry of report.maps.slice(0,25))console.log(`FAIL ${entry.family}/${entry.type}/phase${entry.phase}/pose${entry.pose}/${entry.state}/node${entry.node}: ${entry.newBoundedPixels} new bounded pixels, ${entry.protectedCuts.reduce((n,h)=>n+h.pixels,0)} protected pixels; ${entry.map}`);return report;
}

module.exports={loadHarness,floodOutside,analyzeCut,productionCleanup,nativeDraws,rasterNativeBody,selfCheck,runAudit};
if(require.main===module){const options={},args=process.argv.slice(2);for(let at=0;at<args.length;at++){const flag=args[at];if(flag==='--all-frames')options.allFrames=true;else if(['--family','--type','--phase','--frame','--state','--density','--report'].includes(flag)){const name=flag.slice(2),value=args[++at];options[name]=['type','phase','frame','density'].includes(name)?Number(value):value}else throw Error('Unknown option '+flag)}const report=runAudit(options);if(report.failures.length)process.exitCode=1;}
