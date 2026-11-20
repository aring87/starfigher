#!/usr/bin/env node
'use strict';

// Build reversible, native-pixel modular atlases. These bounded anatomical
// lobes are independent of the old fracture halfplanes/Voronoi polygons.
// Only physical joint, direction and group identity are borrowed from combat.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'assets/destruction');
const {loadHarness,nativeDraws}=require('./verify-severed-silhouettes.cjs');
const miniAnatomy=require('./destruction-mini-anatomy.cjs');
const {createGame,pngMaterial}=loadHarness(),{api}=createGame();
fs.mkdirSync(output,{recursive:true});
const only=process.argv.includes('--first')?'first':null;
const matchArg=process.argv.find(value=>value.startsWith('--match=')),matches=matchArg?matchArg.slice(8).split(','):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sources=new Map(),warnings=[];
function crc32(data){let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1}return(c^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc])}
function png(file,width,height,rgba){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1);fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]))}
function inverse(matrix,x,y){const[a,b,c,d,e,f]=matrix,det=a*d-b*c;return[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det]}
function sourcePoint(draw,x,y){const[sx,sy,sw,sh,dx,dy,dw,dh]=draw.rect,[lx,ly]=inverse(draw.matrix,x,y);return[(sx+(lx-dx)/dw*sw)*draw.sourceScaleX,(sy+(ly-dy)/dh*sh)*draw.sourceScaleY]}
function parameters(enemy,index){
  if(enemy.kind==='mini'){
    // [half neck width, distal half width, reach, compact cap half depth].
    const family=[[8,34,72,5],[10,35,72,6],[7,29,68,5],[7,29,68,5],[8,33,70,5],[8,29,66,6],[7,30,68,5],[8,31,70,5],[7,31,70,5],[7,31,70,5]][enemy.type];return family;
  }
  const type=enemy.epic?(enemy.epicId===0?9:8):enemy.type;
  return type===1?[8,31,110,6]:type===2?[10,45,125,6]:type===3?[7,36,120,4]:type===4?[7,27,100,5]:type===5?[6,19,90,5]:type===6?[6,26,100,5]:type===7?index===0?[5,17,65,4]:[5,23,130,4]:type===8?index<3?[7,23,110,6]:[5,18,80,4]:index<3?[7,28,115,5]:[5,20,95,4];
}
function chooseDraw(enemy,profile,draws){
  const type=enemy.epic?(enemy.epicId===0?9:8):enemy.type;
  if(enemy.kind==='boss'&&type===1)return draws[profile.groupId==='upper-jaw'?2:3];
  if(enemy.kind==='boss'&&type===2&&profile.index<2)return draws[profile.index];
  return draws[0];
}
function sourceRecord(file,draw,enemy){
  if(sources.has(file))return sources.get(file);
  const material=pngMaterial(file,true),cols=enemy.kind==='mini'||enemy.epic||enemy.type>=5?4:2,rows=cols;
  const baseType=enemy.epic?(enemy.epicId===0?9:8):enemy.type,bindW=enemy.kind==='mini'?enemy.def.w:baseType===4?262:baseType===5?232:baseType>=6?(enemy.epic?292:252):224,bindH=enemy.kind==='mini'?enemy.def.h:bindW;
  const record={kind:enemy.kind,baseType,bindW,bindH,coreFrames:[],referenceCore:null,file,width:material.width,height:material.height,rgba:material.rgba,cols,rows,cellW:material.width/cols,cellH:material.height/rows,parts:new Map(),uses:[]};sources.set(file,record);return record;
}
function inspect(family,type,phase,frame){
  if(family==='mini')api.startMiniBossLab(type);else if(family==='epic')api.startEpicBossLab(type);else api.startBossLab(type);
  const enemy=family==='mini'?api.miniBoss:api.boss;if(family!=='mini')enemy.phase=phase;
  Object.assign(enemy,{clock:.17+frame*.073,intro:0,weakOpen:false,weakTelegraph:0,coreAperture:0,hitFlash:0,recoil:0});
  for(const node of api.activeWeakNodes(enemy)){node.destroyed=false;node.hp=node.max}
  api.forceAuditFrame(enemy,frame);const draws=nativeDraws(api,enemy,frame,pngMaterial);
  if(!draws.length)return;
  const nodes=api.activeWeakNodes(enemy),unique=new Map();
  for(const node of nodes){const profile=api.nativeFractureBaseProfile(enemy,node,frame);if(profile&&!unique.has(profile.groupId))unique.set(profile.groupId,profile)}
  for(const profile of unique.values()){
    const draw=chooseDraw(enemy,profile,draws);if(!draw)continue;const file=draw.image.sourcePath;
    const record=sourceRecord(file,draw,enemy),point=sourcePoint(draw,profile.x,profile.y),ahead=sourcePoint(draw,profile.x+profile.axis[0],profile.y+profile.axis[1]),side=sourcePoint(draw,profile.x-profile.axis[1],profile.y+profile.axis[0]);
    const axis=[ahead[0]-point[0],ahead[1]-point[1]],axisScale=Math.hypot(...axis);axis[0]/=axisScale;axis[1]/=axisScale;
    const crossScale=Math.hypot(side[0]-point[0],side[1]-point[1]),[neck,lobe,reach,capDepth]=parameters(enemy,profile.index);
    const rect=draw.rect,cellX=Math.floor((rect[0]*draw.sourceScaleX+.1)/record.cellW),cellY=Math.floor((rect[1]*draw.sourceScaleY+.1)/record.cellH),tile=cellY*record.cols+cellX;
    // A jaw crop starts inside its tile, but never changes atlas origin.
    if(tile<0||tile>=record.cols*record.rows)throw Error('Invalid native tile '+file+' '+tile);
    let part=record.parts.get(profile.groupId);if(!part){part={id:profile.groupId,name:profile.name,frames:Array(record.cols*record.rows).fill(null)};record.parts.set(profile.groupId,part)}
    const use=family+':'+type+':'+phase;if(!record.uses.includes(use))record.uses.push(use);
    if(part.frames[tile])continue; // Normal source anatomy owns shared epic art.
    const rootPoint=[point[0]-cellX*record.cellW,point[1]-cellY*record.cellH];
    const internal=nodes.find(n=>!api.nativeFractureBaseProfile(enemy,n,frame));
    const corePoint=internal?sourcePoint(draw,...api.auditCorePoint(enemy,internal)):[cellX*record.cellW+record.cellW*.5,cellY*record.cellH+record.cellH*.5];
    const localCore=[corePoint[0]-cellX*record.cellW,corePoint[1]-cellY*record.cellH];
    if(!record.referenceCore)record.referenceCore=localCore;
    if(!record.coreFrames[tile])record.coreFrames[tile]={point:localCore,hasInternal:!!internal};
    const seedPoint=sourcePoint(draw,...api.auditCorePoint(enemy,nodes[profile.index]));
    part.frames[tile]={x:rootPoint[0],y:rootPoint[1],seed:[seedPoint[0]-cellX*record.cellW,seedPoint[1]-cellY*record.cellH],axis,neck:neck*crossScale,lobe:lobe*crossScale,reach:reach*axisScale,capDepth:capDepth*axisScale,cellX,cellY,profileIndex:profile.index};
  }
}
const scenarios=[];
for(let type=0;type<10;type++)if(!only||type===0)for(let frame=0;frame<16;frame++)scenarios.push(['mini',type,1,frame]);
for(let type=1;type<10;type++)if(!only||type===1)for(let phase=1;phase<=2;phase++)for(let frame=0;frame<(type===1||type===2?2:type===3?(phase===1?8:4):type===4?8:32);frame++)scenarios.push(['main',type,phase,frame]);
if(!only)for(let type=0;type<2;type++)for(let phase=1;phase<=4;phase++)for(let frame=0;frame<32;frame++)scenarios.push(['epic',type,phase,frame]);
const caseArg=process.argv.find(value=>value.startsWith('--case='));
for(const scenario of scenarios)if(!caseArg||scenario.slice(0,2).join(':')===caseArg.slice(7))inspect(...scenario);
if(process.argv.includes('--describe')){
  console.log(JSON.stringify([...sources.values()].filter(record=>!matches||matches.some(match=>record.file.includes(match))).map(record=>({file:record.file,cellW:record.cellW,cellH:record.cellH,coreFrames:record.coreFrames,parts:[...record.parts.values()]})),null,2));
  process.exit(0);
}

function inCore(record,tile,x,y){
  const W=record.cellW,H=record.cellH,sx=record.bindW/W,sy=record.bindH/H,wx=(x-W/2)*sx,wy=(y-H/2)*sy,type=record.baseType;
  const center=record.coreFrames[tile]?.point||[W/2,H/2],ref=record.referenceCore||center,cx=(center[0]-W/2)*sx,cy=(center[1]-H/2)*sy,dx=(center[0]-ref[0])*sx,dy=(center[1]-ref[1])*sy;
  const ellipse=(x,y,rx,ry)=>x*x/(rx*rx)+y*y/(ry*ry)<=1;
  if(record.kind==='mini')return miniAnatomy.classify(record,tile,x,y);
  if(type===1)return ellipse(x-W*420/627,y-H*.5,W*145/627,H*160/627)||(x>=W*420/627&&Math.abs(y-H*.5)<H*145/627);
  if(type===2)return ellipse(wx-cx-24,wy-cy,83,24)||(Math.abs(wy-cy)<10&&wx<cx+98);
  if(type===3)return ellipse(wx-cx,wy-cy,35,31); // actual separate blades are assigned as full alpha islands below.
  if(type===4){
    if(ellipse(wx-cx-14,wy-cy,51,39))return true;
    // Only three front mandible petals are targetable. Rear petals keep their
    // complete native tips rather than being sliced by a vertical core band.
    const angle=Math.atan2(y-center[1],x-center[0]);
    return ![...record.parts.values()].some(part=>{const f=part.frames[tile];if(!f)return false;const target=Math.atan2(f.seed[1]-center[1],f.seed[0]-center[0]),difference=Math.abs(Math.atan2(Math.sin(angle-target),Math.cos(angle-target)));return difference<(part.id==='bloom-jaw-1'?.39:.33)});
  }
  if(type===5){
    const frames=[...record.parts.values()].map(p=>p.frames[tile]).filter(Boolean),rootY=Math.min(...frames.map(f=>(f.y-H/2)*sy)),rootX=frames.reduce((n,f)=>n+(f.x-W/2)*sx,0)/Math.max(1,frames.length);
    const curvedRoot=rootY-9+9*Math.sqrt(Math.max(0,1-((wx-rootX)/90)**2));return wy<curvedRoot;
  }
  if(type===6){
    const xx=wx-cx,yy=wy-cy,fore=xx<-25&&Math.abs(yy)<45,rear=record.parts.size===2&&((xx>45&&Math.abs(yy)<8)||(xx>=52&&xx<=108&&Math.abs(yy)<Math.min(30,(108-xx)*.65)));
    return ellipse(xx,yy,49,45)||fore||rear;
  }
  if(type===7){
    const yy=wy-dy,xx=wx-dx-10,width=26+clamp((yy+65)/110,0,1)*40;
    const leftPart=[...record.parts.values()].some(part=>part.id!=='grave-appendage-0'&&part.frames[tile]?.seed[0]<W*.5);
    // The clapper is internal machinery. Phase one has no left-chain target,
    // so that entire untouched assembly remains native core art.
    return yy>=-65&&yy<=46&&Math.abs(xx)<width||ellipse(wx-dx-22,yy-65,23,38)||!leftPart&&wx-dx<0&&yy>-40;
  }
  if(type===8){const x0=record.coreFrames[tile]?.hasInternal?cx:24+dx,y0=record.coreFrames[tile]?.hasInternal?cy:5+dy;return ellipse(wx-x0,wy-y0,44,48)||(record.parts.size<=3&&wx>x0+25);}
  // The rear talon is an entire targetable assembly. A full-width midline
  // strip would retain its glowing tip after the talon has detached.
  return ellipse(wx-dx+10,wy-dy,70,54)||(wx<cx&&Math.abs(wy-dy)<45);
}
function tileBounds(record,tile){const col=tile%record.cols,row=Math.floor(tile/record.cols),ox=Math.round(col*record.cellW),oy=Math.round(row*record.cellH);return{ox,oy,W:Math.round((col+1)*record.cellW)-ox,H:Math.round((row+1)*record.cellH)-oy}}
function splitRiftTile(record,tile,parts){
  if(record.file.includes('phase2-'))return splitRiftArmature(record,tile,parts);
  const{W,H,ox,oy}=tileBounds(record,tile),N=W*H,labels=new Int16Array(N),solid=new Uint8Array(N),seen=new Uint8Array(N),queue=new Int32Array(N),nodes=parts.map((part,index)=>({index,frame:part.frames[tile]})).filter(item=>item.frame),center=record.coreFrames[tile]?.point||[W/2,H/2];labels.fill(-3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x,at=((oy+y)*record.width+ox+x)*4,a=record.rgba[at+3],high=Math.max(...record.rgba.subarray(at,at+3)),low=Math.min(...record.rgba.subarray(at,at+3));if(!a)continue;labels[p]=-2;solid[p]=a>48&&(high>165||high>100&&high-low>35)?1:0;}
  for(let start=0;start<N;start++){
    if(!solid[start]||seen[start])continue;let head=0,tail=1,core=false;queue[0]=start;seen[start]=1;const distances=nodes.map(()=>Infinity);
    while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);if(Math.abs(x-center[0])<W*.22&&Math.abs(y-center[1])<H*.2)core=true;nodes.forEach((item,k)=>distances[k]=Math.min(distances[k],(x-item.frame.seed[0])**2+(y-item.frame.seed[1])**2));for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(solid[q]&&!seen[q]){seen[q]=1;queue[tail++]=q}}}
    const owner=core?-1:nodes[distances.indexOf(Math.min(...distances))].index;for(let i=0;i<tail;i++)labels[queue[i]]=owner;
  }
  // Expand only through low-light halo texels. Real blade material is already
  // assigned as a whole component, so a fog bridge cannot retain its outline.
  let head=0,tail=0;for(let p=0;p<N;p++){if(labels[p]===-2&&inCore(record,tile,p%W+.5,Math.floor(p/W)+.5))labels[p]=-1;if(labels[p]>=-1)queue[tail++]=p;}
  while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);for(const q of[y?p-W:-1,y+1<H?p+W:-1,x?p-1:-1,x+1<W?p+1:-1])if(q>=0&&labels[q]===-2){labels[q]=labels[p];queue[tail++]=q}}
  for(let p=0;p<N;p++)if(labels[p]===-2)labels[p]=-1;return labels;
}
function splitRiftArmature(record,tile,parts){
  const{W,H,ox,oy}=tileBounds(record,tile),labels=new Int16Array(W*H),center=record.coreFrames[tile].point,scale=W/768;
  const upper=parts.findIndex(p=>p.id==='rift-blade-1'),lower=parts.findIndex(p=>p.id==='rift-blade--1'),rear=parts.findIndex(p=>p.id==='rift-blade-2'),root=parts[rear].frames[tile];labels.fill(-3);
  // The charged second phase connects its complete blade fans with bright
  // electric arcs. Those arcs cannot determine material connectivity: keep
  // the armored reactor and arrowhead, and give every fan its entire arm,
  // blade and outgoing electricity up to the authored mounting joint.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x;if(!record.rgba[((oy+y)*record.width+ox+x)*4+3])continue;
    const dx=(x-center[0])/scale,dy=(y-center[1])/scale,reactor=dx*dx/(135*135)+dy*dy/(108*108)<=1,fore=dx<=-60&&dx>=-220&&Math.abs(dy)<(dx+220)*.59+8;
    if(reactor||fore){labels[p]=-1;continue}
    const u=(x-root.x)/scale,v=(y-root.y)/scale,rearArm=u>-18&&Math.abs(v)<27+Math.max(0,u)*1.15;
    labels[p]=rearArm?rear:dy<0?upper:lower;
  }
  for(const part of parts){
    const f=part.frames[tile];if(!f)continue;let best=Infinity,point=null;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(labels[y*W+x]!==-1)continue;const at=((oy+y)*record.width+ox+x)*4;if(record.rgba[at+3]<180||Math.max(record.rgba[at],record.rgba[at+1],record.rgba[at+2])<50)continue;
      const distance=(x-f.seed[0])**2+(y-f.seed[1])**2;if(distance<best){best=distance;point=[x+.5,y+.5]}
    }
    if(point){const length=Math.hypot(f.seed[0]-point[0],f.seed[1]-point[1]);f.axis=[(f.seed[0]-point[0])/length,(f.seed[1]-point[1])/length];f.x=point[0]-f.axis[0]*2*scale;f.y=point[1]-f.axis[1]*2*scale;f.neck=19*scale;f.capDepth=8*scale;f.authoredCap=true}
  }
  return labels;
}
function repairTwinCoreIslands(record,tile,labels,parts){
  const{W,H}=tileBounds(record,tile),N=W*H,seen=new Uint8Array(N),queue=new Int32Array(N),components=[];
  for(let start=0;start<N;start++){
    if(labels[start]!==-1||seen[start])continue;let head=0,tail=1,sumY=0;queue[0]=start;seen[start]=1;const pixels=[];
    while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);pixels.push(p);sumY+=y;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(labels[q]===-1&&!seen[q]){seen[q]=1;queue[tail++]=q}}}
    components.push({pixels,meanY:sumY/tail});
  }
  components.sort((a,b)=>b.pixels.length-a.pixels.length);const center=record.coreFrames[tile]?.point||[W*.7,H/2];
  for(const component of components.slice(1)){
    if(component.pixels.some(p=>(p%W-center[0])**2+(Math.floor(p/W)-center[1])**2<22**2))continue;
    const id=component.meanY<H/2?'upper-jaw':'lower-jaw',owner=parts.findIndex(part=>part.id===id&&part.frames[tile]);if(owner>=0)for(const p of component.pixels)labels[p]=owner;
  }
}
function splitIronTile(record,tile,parts){
  const{W,H,ox,oy}=tileBounds(record,tile),labels=new Int16Array(W*H);labels.fill(-3);
  const sx=W/627,sy=H/627;
  const anatomy=parts.map((part,index)=>{
    const frame=part.frames[tile];if(!frame)return null;
    if(part.id==='bloom-jaw-1'){
      // The native beak sits on the firing axis. A few original weak-node
      // tracks sit on the adjacent armor scale, so use the visible assembly.
      frame.seed=[W*.18,H*.514];frame.x=W*.405;frame.y=H*.514;frame.axis=[-1,0];frame.authoredCap=true;frame.neck=48*sx;frame.capDepth=20*sx;
      return{index,frame,neck:36*sx,widen:.12,maxWidth:62*sx,reach:225*sx};
    }
    frame.authoredCap=true;frame.neck=32*sx;frame.capDepth=18*sx;
    return{index,frame,neck:22*sx,widen:.25,maxWidth:62*sx,reach:185*sx};
  }).filter(Boolean);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x,a=record.rgba[((oy+y)*record.width+ox+x)*4+3];if(!a)continue;labels[p]=-1;
    for(const shape of anatomy){
      const f=shape.frame,dx=x+.5-f.x,dy=y+.5-f.y,u=dx*f.axis[0]+dy*f.axis[1],v=-dx*f.axis[1]+dy*f.axis[0],width=Math.min(shape.maxWidth,shape.neck+Math.max(0,u)*shape.widen),root=-8*sx+8*sx*Math.sqrt(Math.max(0,1-(v/shape.neck)**2));
      if(u>root&&u<shape.reach&&Math.abs(v)<width){labels[p]=shape.index;break;}
    }
  }
  return labels;
}
function lateAnatomyShift(record,tile,parts){
  if(record.latePhysical?.body){const frames=record.latePhysical.body;return[frames[tile].dx,frames[tile].dy]}
  const current=record.coreFrames[tile],first=record.coreFrames[0];
  if(current?.hasInternal&&first?.hasInternal)return[current.point[0]-first.point[0],current.point[1]-first.point[1]];
  const shifts=parts.filter(part=>part.frames[tile]&&part.frames[0]&&part.frames[tile].profileIndex<3).map(part=>[part.frames[tile].seed[0]-part.frames[0].seed[0],part.frames[tile].seed[1]-part.frames[0].seed[1]]);
  return shifts.length?[shifts.reduce((n,p)=>n+p[0],0)/shifts.length,shifts.reduce((n,p)=>n+p[1],0)/shifts.length]:[0,0];
}
function matchLateNativeFeature(record,tile,rect,rough,point,range){
  const{W,H,ox,oy}=tileBounds(record,tile),samples=[];
  for(let y=rect[1];y<rect[1]+rect[3];y+=3)for(let x=rect[0];x<rect[0]+rect[2];x+=3){const p=(y*record.width+x)*4;samples.push([x,y,record.rgba[p+3]>64?1:0,record.rgba[p],record.rgba[p+1],record.rgba[p+2]]);}
  const score=(dx,dy)=>{
    if(range&&(point[1]+dy<range[0]||point[1]+dy>range[1]))return Infinity;let sum=0;
    for(const[x,y,a,r,g,b]of samples){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H){sum+=a?6:0;continue;}const p=((oy+yy)*record.width+ox+xx)*4,aa=record.rgba[p+3]>64?1:0;if(a!==aa){sum+=a?6:3;continue;}if(a){const rr=record.rgba[p],gg=record.rgba[p+1],bb=record.rgba[p+2],hi=Math.max(r,g,b,30),hh=Math.max(rr,gg,bb,30);sum+=(Math.abs(r/hi-rr/hh)+Math.abs(g/hi-gg/hh)+Math.abs(b/hi-bb/hh))*.5+Math.abs(hi-hh)/255*.6;}}
    return sum/samples.length+((dx-rough[0])**2+(dy-rough[1])**2)*.00002;
  };
  let best={score:Infinity};for(let dy=Math.round(rough[1]-42);dy<=rough[1]+42;dy+=4)for(let dx=Math.round(rough[0]-42);dx<=rough[0]+42;dx+=4){const value=score(dx,dy);if(value<best.score)best={dx,dy,score:value};}
  const coarse=best;for(let dy=coarse.dy-4;dy<=coarse.dy+4;dy++)for(let dx=coarse.dx-4;dx<=coarse.dx+4;dx++){const value=score(dx,dy);if(value<best.score)best={dx,dy,score:value};}
  return{...best,point:[point[0]+best.dx,point[1]+best.dy]};
}
function prepareLateNativeFeatures(record,parts){
  if(record.latePhysical)return;
  const phase2=record.file.includes('phase2'),grave=record.baseType===7;
  const frozenFile=path.join(output,'native-landmarks.json'),frozen=fs.existsSync(frozenFile)?JSON.parse(fs.readFileSync(frozenFile,'utf8')).points?.[record.baseType]?.[phase2?1:0]:null;
  if(frozen?.[-1]){
    // These absolute native-source anchors are shared with gameplay. They do
    // not depend on the current game node offsets, so rebuilding after a
    // collider correction cannot apply the same source displacement twice.
    const physical={},register=(id,index)=>{const points=frozen[index];if(points)physical[id]=points.map(point=>({point:[...point],dx:point[0]-points[0][0],dy:point[1]-points[0][1]}));};
    register('body',-1);if(grave)register('crown',0);else for(let index=0;index<3;index++)register('head'+index,index);
    record.latePhysical=physical;physical.body.forEach((frame,tile)=>record.coreFrames[tile].point=frame.point);
    for(const part of parts){const index=part.frames[0]?.profileIndex,frames=grave?(index===0?physical.crown:null):index<3?physical['head'+index]:null;if(frames)frames.forEach((frame,tile)=>{if(part.frames[tile])part.frames[tile].seed=[...frame.point];});}
    return;
  }
  const features=grave?[{id:'body',index:-1,rect:phase2?[142,140,86,74]:[140,130,90,85],point:record.coreFrames[0].point},{id:'crown',index:0,rect:phase2?[121,80,65,65]:[110,50,80,84],point:phase2?[154,127]:[147,109]}]:[{id:'body',index:-1,rect:[151,125,103,104],point:phase2?[199,176]:[200,179]},{id:'head0',index:0,rect:phase2?[101,80,77,66]:[101,88,77,65],point:phase2?[124.11,123.09]:[124.73,122.78]},{id:'head1',index:1,rect:phase2?[65,143,101,48]:[67,151,99,49],point:phase2?[113.05,169.36]:[118.43,180.63]},{id:'head2',index:2,rect:phase2?[65,204,108,51]:[69,204,105,53],point:phase2?[114.97,231.01]:[118.32,233.52]}],physical={};
  for(const feature of features){const part=parts.find(part=>part.frames[0]?.profileIndex===feature.index),base=part?.frames[0].seed;physical[feature.id]=Array.from({length:record.cols*record.rows},(_,tile)=>{
      const frame=part?.frames[tile],rough=part?[frame.seed[0]-base[0],frame.seed[1]-base[1]]:[record.coreFrames[tile].point[0]-record.coreFrames[0].point[0],record.coreFrames[tile].point[1]-record.coreFrames[0].point[1]],body=physical.body?.[tile]?.point,range=!grave&&feature.index>=0?(feature.index===0?[body[1]-100,body[1]-25]:feature.index===1?[body[1]-25,body[1]+25]:[body[1]+26,body[1]+100]):null;
      return matchLateNativeFeature(record,tile,feature.rect,rough,feature.point,range);
    });}
  record.latePhysical=physical;
  for(const feature of features){if(feature.index<0){physical.body.forEach((frame,tile)=>record.coreFrames[tile].point=frame.point);continue;}const part=parts.find(part=>part.frames[0]?.profileIndex===feature.index);physical[feature.id].forEach((frame,tile)=>{if(part?.frames[tile])part.frames[tile].seed=frame.point;});}
}
function lateAnatomyInside(polygon,x,y){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[a,b]=polygon[i],[c,d]=polygon[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit}return hit}
function lateAnatomyTube(x,y,points){
  let best=Infinity;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1),radius=a[2]+(b[2]-a[2])*t;best=Math.min(best,Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)/radius)}
  return best;
}
function lateAnatomyLobe(x,y,frame,neck,width,reach){
  const dx=x-frame.x,dy=y-frame.y,u=dx*frame.axis[0]+dy*frame.axis[1],v=-dx*frame.axis[1]+dy*frame.axis[0],root=-3+3*Math.sqrt(Math.max(0,1-(v/neck)**2)),half=Math.min(width,neck+Math.max(0,u)*.32);
  return u>=root&&u<reach&&Math.abs(v)<half?Math.abs(v)/half+Math.max(0,u)*.0005:Infinity;
}
function lateAnatomySeat(record,tile,labels,index,frame,desired,neck=10){
  const{W,H}=tileBounds(record,tile),contacts=[];
  for(let y=1;y+1<H;y++)for(let x=1;x+1<W;x++){const p=y*W+x;if(labels[p]!==index)continue;if(labels[p-1]===-1||labels[p+1]===-1||labels[p-W]===-1||labels[p+W]===-1)contacts.push([x+.5,y+.5]);}
  if(contacts.length){const nearest=Math.min(...contacts.map(p=>(p[0]-desired[0])**2+(p[1]-desired[1])**2)),cluster=contacts.filter(p=>(p[0]-desired[0])**2+(p[1]-desired[1])**2<nearest+neck*neck*.7);frame.x=cluster.reduce((n,p)=>n+p[0],0)/cluster.length;frame.y=cluster.reduce((n,p)=>n+p[1],0)/cluster.length;}
  else{frame.x=desired[0];frame.y=desired[1]}
  const length=Math.hypot(frame.seed[0]-frame.x,frame.seed[1]-frame.y)||1;frame.axis=[(frame.seed[0]-frame.x)/length,(frame.seed[1]-frame.y)/length];frame.neck=neck;frame.capDepth=neck*.5;frame.authoredCap=true;
}
function lateAnatomyRehomeIslands(record,tile,labels,parts){
  const{W,H,ox,oy}=tileBounds(record,tile),N=W*H,solid=new Uint8Array(N),original=new Uint8Array(N),seen=new Uint8Array(N),queue=new Int32Array(N),components=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;original[p]=record.rgba[((oy+y)*record.width+ox+x)*4+3]>8?1:0;solid[p]=labels[p]===-1&&original[p]?1:0;}
  const walk=(start,mask,visited)=>{let head=0,tail=1;queue[0]=start;visited[start]=1;while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(mask[q]&&!visited[q]){visited[q]=1;queue[tail++]=q}}}return Array.from(queue.subarray(0,tail));};
  let originalMain=[];for(let p=0;p<N;p++)if(original[p]&&!seen[p]){const component=walk(p,original,seen);if(component.length>originalMain.length)originalMain=component;}const grounded=new Uint8Array(N);for(const p of originalMain)grounded[p]=1;seen.fill(0);
  for(let p=0;p<N;p++)if(solid[p]&&!seen[p])components.push(walk(p,solid,seen));components.sort((a,b)=>b.length-a.length);
  // A newly isolated horn edge or severed neck plate belongs to the limb it
  // touched. Preserve details that were already separate in the native art.
  for(const component of components.slice(1)){
    if(!component.some(p=>grounded[p]))continue;const contacts=new Int32Array(parts.length);
    for(const p of component){const x=p%W,y=Math.floor(p/W);for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const owner=labels[yy*W+xx];if(owner>=0)contacts[owner]++;}}
    let owner=contacts.indexOf(Math.max(...contacts));if(!contacts[owner]){let distance=Infinity;for(const p of component){const x=p%W,y=Math.floor(p/W);parts.forEach((part,index)=>{const f=part.frames[tile];if(!f)return;const d=(x-f.seed[0])**2+(y-f.seed[1])**2;if(d<distance){distance=d;owner=index;}});}}
    for(const p of component)labels[p]=owner;
    for(const p of component){const x=p%W,y=Math.floor(p/W);for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(labels[q]===-1&&!original[q])labels[q]=owner;}}
  }
}
function splitVoidTile(record,tile,parts){
  const{W,H,ox,oy}=tileBounds(record,tile),labels=new Int16Array(W*H);labels.fill(-3);
  const phase2=record.file.includes('phase2'),shift=lateAnatomyShift(record,tile,parts),roots=phase2?[[182,175,14,25],[237,198,18,30],[278,192,19,29]]:[[202,205,17,28],[255,220,20,31]],anatomy=[];
  parts.forEach((part,index)=>{const frame=part.frames[tile];if(!frame)return;const ref=roots[frame.profileIndex-3],root=[ref[0]+shift[0],ref[1]+shift[1]],length=Math.hypot(frame.seed[0]-root[0],frame.seed[1]-root[1])||1;frame.x=root[0];frame.y=root[1];frame.axis=[(frame.seed[0]-root[0])/length,(frame.seed[1]-root[1])/length];anatomy.push({index,frame,root,neck:ref[2],width:ref[3]});});
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(!record.rgba[((oy+y)*record.width+ox+x)*4+3])continue;labels[p]=-1;let best=Infinity;for(const limb of anatomy){const score=lateAnatomyLobe(x+.5,y+.5,limb.frame,limb.neck,limb.width,190);if(score<best){best=score;labels[p]=limb.index;}}}
  lateAnatomyRehomeIslands(record,tile,labels,parts);
  for(const limb of anatomy)lateAnatomySeat(record,tile,labels,limb.index,limb.frame,limb.root,limb.neck*.75);
  return labels;
}
function splitGraveTile(record,tile,parts){
  prepareLateNativeFeatures(record,parts);
  const{W,H,ox,oy}=tileBounds(record,tile),labels=new Int16Array(W*H);labels.fill(-3);
  const phase2=record.file.includes('phase2'),shift=lateAnatomyShift(record,tile,parts),offset=p=>[p[0]+shift[0],p[1]+shift[1]],crown=parts.findIndex(part=>part.id==='grave-appendage-0'),horn=parts[crown]?.frames[tile],hornRef=parts[crown]?.frames[0],hornShift=horn?[horn.seed[0]-hornRef.seed[0],horn.seed[1]-hornRef.seed[1]]:shift;
  // Leave the lower jaw clasp on the bell: its chain still needs a physical
  // anchor when the crown breaks before that chain's own weakpoint does.
  const hornOutline=(phase2?[[122,132],[121,122],[133,108],[148,97],[145,115],[164,92],[183,77],[179,92],[164,116],[169,129],[158,134],[143,134],[132,131]]:[[113,119],[114,107],[129,88],[146,68],[142,89],[164,69],[188,50],[180,72],[163,101],[171,116],[159,121],[141,121],[130,116]]).map(p=>[p[0]+hornShift[0],p[1]+hornShift[1]]);
  const bell=(phase2?[[157,126],[172,100],[202,104],[217,126],[218,168],[235,215],[215,232],[144,231],[120,212],[145,163],[150,141]]:[[154,115],[175,83],[201,90],[218,120],[220,168],[245,214],[225,230],[140,230],[116,216],[141,168],[149,131]]).map(offset),anatomy=[];
  parts.forEach((part,index)=>{const frame=part.frames[tile];if(!frame||index===crown)return;const left=phase2&&frame.profileIndex===2,root=offset(left?[135,140]:phase2?[220,112]:[227,85]),seed=frame.seed;
    const first=offset(left?[128,148]:phase2?[234,128]:[242,100]),middle=[first[0]*.55+seed[0]*.45,first[1]*.55+seed[1]*.45],path=[root.concat(9),first.concat(11),middle.concat(12),seed.concat(10)],radius=left?[21,30]:phase2?[22,29]:[24,39];
    const returnPath=!phase2?[seed.concat(7),offset([242,243]).concat(6),offset([227,236]).concat(5)]:null;anatomy.push({index,frame,root,path,returnPath,radius});});
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(!record.rgba[((oy+y)*record.width+ox+x)*4+3])continue;const xx=x+.5,yy=y+.5;labels[p]=-1;if(horn&&lateAnatomyInside(hornOutline,xx,yy)){labels[p]=crown;continue;}if(lateAnatomyInside(bell,xx,yy))continue;let best=Infinity;
    for(const limb of anatomy){const sx=xx-limb.frame.seed[0],sy=yy-limb.frame.seed[1],weight=Math.hypot(sx/limb.radius[0],sy/limb.radius[1]),score=Math.min(lateAnatomyTube(xx,yy,limb.path),limb.returnPath?lateAnatomyTube(xx,yy,limb.returnPath):Infinity,weight);if(score<=1&&score<best){best=score;labels[p]=limb.index;}}
  }
  lateAnatomyRehomeIslands(record,tile,labels,parts);
  if(horn)lateAnatomySeat(record,tile,labels,crown,horn,[158+hornShift[0],(phase2?134:122)+hornShift[1]],14);
  for(const limb of anatomy)lateAnatomySeat(record,tile,labels,limb.index,limb.frame,limb.root,7);
  return labels;
}
function splitHydraTile(record,tile,parts){
  prepareLateNativeFeatures(record,parts);
  const{W,H,ox,oy}=tileBounds(record,tile),labels=new Int16Array(W*H);labels.fill(-3);
  const phase2=record.file.includes('phase2'),shift=lateAnatomyShift(record,tile,parts),roots=phase2?[[172,139,17,34],[166,172,16,29],[165,212,18,31]]:[[171,141,17,34],[167,177,16,29],[166,214,18,31]],anatomy=[],rear=[];
  parts.forEach((part,index)=>{const frame=part.frames[tile];if(!frame)return;if(frame.profileIndex>=3){rear.push({index,frame});return;}const base=roots[frame.profileIndex],first=part.frames[0],local=[frame.seed[0]-first.seed[0],frame.seed[1]-first.seed[1]],root=[base[0]+shift[0]*.65+local[0]*.35,base[1]+shift[1]*.65+local[1]*.35],length=Math.hypot(frame.seed[0]-root[0],frame.seed[1]-root[1])||1;frame.x=root[0];frame.y=root[1];frame.axis=[(frame.seed[0]-root[0])/length,(frame.seed[1]-root[1])/length];anatomy.push({index,frame,root,neck:base[2],width:base[3]});});
  const center=record.coreFrames[tile]?.point||[192+shift[0],175+shift[1]],rx=44/(record.bindW/W),ry=48/(record.bindH/H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(!record.rgba[((oy+y)*record.width+ox+x)*4+3])continue;labels[p]=-1;let best=Infinity;for(const limb of anatomy){const hood=limb.frame.profileIndex===0&&((x+.5-limb.frame.seed[0]-24)/31)**2+((y+.5-limb.frame.seed[1]+22)/20)**2<=1,score=hood?0:lateAnatomyLobe(x+.5,y+.5,limb.frame,limb.neck,limb.width,145);if(score<best){best=score;labels[p]=limb.index;}}
    if(labels[p]===-1&&rear.length&&x+.5>center[0]-18&&((x+.5-center[0])/rx)**2+((y+.5-center[1])/ry)**2>1){let distance=Infinity;for(const limb of rear){const d=(x-limb.frame.seed[0])**2+(y-limb.frame.seed[1])**2;if(d<distance){distance=d;labels[p]=limb.index;}}}
  }
  lateAnatomyRehomeIslands(record,tile,labels,parts);
  for(const limb of anatomy)lateAnatomySeat(record,tile,labels,limb.index,limb.frame,limb.root,limb.neck*.72);
  return labels;
}
function splitTile(record,tile,parts){
  if(record.baseType===3&&record.kind!=='mini')return splitRiftTile(record,tile,parts);
  if(record.baseType===4&&record.kind!=='mini')return splitIronTile(record,tile,parts);
  if(record.baseType===5&&record.kind!=='mini')return splitVoidTile(record,tile,parts);
  if(record.baseType===7&&record.kind!=='mini')return splitGraveTile(record,tile,parts);
  if(record.baseType===8&&record.kind!=='mini')return splitHydraTile(record,tile,parts);
  const {W,H,ox,oy}=tileBounds(record,tile),N=W*H,labels=new Int16Array(N);labels.fill(-3);
  const nodes=parts.map((part,index)=>({part,index,frame:part.frames[tile]})).filter(item=>item.frame),queue=new Int32Array(N),active=nodes.length;
  if(!active)return labels;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x,a=record.rgba[((oy+y)*record.width+ox+x)*4+3];if(!a)continue;labels[p]=inCore(record,tile,x+.5,y+.5)?-1:-2;
  }
  // Native disconnected blades keep their complete silhouette, rather than
  // intersecting an arbitrary shape. The island containing the core stays core.
  if(record.baseType===3&&record.kind!=='mini'){
    const center=record.coreFrames[tile]?.point||[W/2,H/2];let start=-1,best=Infinity;
    for(let p=0;p<N;p++)if(labels[p]!==-3){const d=(p%W-center[0])**2+(Math.floor(p/W)-center[1])**2;if(d<best){best=d;start=p}}
    if(start>=0){let head=0,tail=1;queue[0]=start;const seen=new Uint8Array(N);seen[start]=1;while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);labels[p]=-1;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(!seen[q]&&labels[q]!==-3){seen[q]=1;queue[tail++]=q}}}}
  }
  const seen=new Uint8Array(N);
  for(let start=0;start<N;start++){
    if(labels[start]!==-2||seen[start])continue;let head=0,tail=1;queue[0]=start;seen[start]=1;const distances=nodes.map(()=>Infinity);
    while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);nodes.forEach((item,k)=>{const seed=item.frame.seed;distances[k]=Math.min(distances[k],(x-seed[0])**2+(y-seed[1])**2)});for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const q=yy*W+xx;if(!seen[q]&&labels[q]===-2){seen[q]=1;queue[tail++]=q}}}
    const close=nodes.filter((item,k)=>distances[k]<Math.min(W,H)**2*.0225);
    for(let i=0;i<tail;i++){
      const p=queue[i],x=p%W,y=Math.floor(p/W);let chosen=nodes[distances.indexOf(Math.min(...distances))],distance=Infinity;
      if(close.length>1)for(const item of close){const seed=item.frame.seed,d=(x-seed[0])**2+(y-seed[1])**2;if(d<distance){distance=d;chosen=item}}
      labels[p]=chosen.index;
    }
  }
  if(record.kind==='mini')miniAnatomy.repairLabels(record,tile,labels,parts);
  if(record.baseType===1&&record.kind!=='mini')repairTwinCoreIslands(record,tile,labels,parts);
  return labels;
}
const existing=matches&&fs.existsSync(path.join(output,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8')):null;
const manifest={version:1,method:'native-body-and-whole-assembly-sprites-v4',sources:existing?.sources||{}};
for(const record of sources.values()){
  if(matches&&!matches.some(match=>record.file.includes(match)))continue;
  const core=record.rgba.slice(),parts=[...record.parts.values()].map(part=>({...part,rgba:new Uint8ClampedArray(record.rgba.length),counts:Array(record.cols*record.rows).fill(0)}));
  const overlaps=Array(record.cols*record.rows).fill(0),opaque=Array(record.cols*record.rows).fill(0),owners=new Int16Array(record.width*record.height);owners.fill(-1);
  for(let tile=0;tile<record.cols*record.rows;tile++){
    const labels=splitTile(record,tile,parts),{W,H,ox,oy}=tileBounds(record,tile);
    const contacts=parts.map(()=>[]);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const q=y*W+x,p=(oy+y)*record.width+ox+x,at=p*4;if(!record.rgba[at+3])continue;opaque[tile]++;const owner=labels[q];if(owner<0)continue;
      owners[p]=owner;parts[owner].rgba.set(record.rgba.subarray(at,at+4),at);core.fill(0,at,at+4);parts[owner].counts[tile]++;
      if((x>0&&labels[q-1]===-1)||(x+1<W&&labels[q+1]===-1)||(y>0&&labels[q-W]===-1)||(y+1<H&&labels[q+W]===-1))contacts[owner].push([x+.5,y+.5]);
    }
    parts.forEach((part,index)=>{
      const f=part.frames[tile],contact=contacts[index];if(!f||!contact.length||f.authoredCap)return;
      const seed=f.seed,nearest=Math.min(...contact.map(p=>(p[0]-seed[0])**2+(p[1]-seed[1])**2)),cluster=contact.filter(p=>(p[0]-seed[0])**2+(p[1]-seed[1])**2<nearest+(W*.055)**2);
      if(!cluster.length)return;const x=cluster.reduce((n,p)=>n+p[0],0)/cluster.length,y=cluster.reduce((n,p)=>n+p[1],0)/cluster.length;
      f.x=x;f.y=y;const length=Math.hypot(seed[0]-x,seed[1]-y)||1;f.axis=[(seed[0]-x)/length,(seed[1]-y)/length];f.neck=clamp(Math.sqrt(cluster.length)*2.7,W*.025,W*.065);f.capDepth=f.neck*.55;
    });
  }
  const stem=path.basename(record.file,'.png'),coreFile='assets/destruction/'+stem+'-core.png';png(path.join(root,coreFile),record.width,record.height,core);
  const entry={core:coreFile,cols:record.cols,rows:record.rows,cellW:record.cellW,cellH:record.cellH,width:record.width,height:record.height,uses:record.uses,parts:[]};
  for(const part of parts){
    const file='assets/destruction/'+stem+'-'+part.id+'.png';png(path.join(root,file),record.width,record.height,part.rgba);
    const capFrames=part.frames.map((frame,tile)=>frame?{x:frame.x,y:frame.y,w:frame.neck*2.15,h:frame.capDepth*2.2,angle:Math.atan2(frame.axis[1],frame.axis[0]),pixels:part.counts[tile]}:null);
    entry.parts.push({id:part.id,file,capFrames});
    for(let tile=0;tile<part.frames.length;tile++)if(part.frames[tile]&&!part.counts[tile])warnings.push({source:record.file,id:part.id,tile,reason:'Declared anatomy region contains no native pixels; do not silently ship this part'});
  }
  entry.review={opaquePixelsByTile:opaque,overlappingCandidatesByTile:overlaps,partPixelsByTile:Object.fromEntries(parts.map(part=>[part.id,part.counts]))};
  manifest.sources[record.file]=entry;console.log('BUILT '+record.file+' / '+parts.length+' anatomy layers');
}
// Even a targeted art rebuild refreshes aliases for every inspected source.
// A source shared by several epic phases must declare each reachable use.
for(const record of sources.values())if(manifest.sources[record.file])manifest.sources[record.file].uses=record.uses;
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'manifest.js'),'window.STARFIGHTER_DESTRUCTION_MANIFEST='+JSON.stringify(manifest)+';\n');
fs.writeFileSync(path.join(root,'artifacts/destruction-build-review.json'),JSON.stringify({method:manifest.method,sourceCount:sources.size,warnings},null,2)+'\n');
console.log('WROTE '+sources.size+' source atlases; '+warnings.length+' anatomy warnings.');
if(warnings.length)process.exitCode=1;
