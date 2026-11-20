#!/usr/bin/env node
'use strict';

// Compare the production cleanup to an independent pixel-flood reference,
// including native source-PNG poses. Benchmarks measure the pure cleanup only.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {alphaAudit,removePolygons}=require('./verify-retained-islands.cjs');

function reference(before,after,width,height,anchors=[]){
  const count=width*height;
  function components(pixels){
    const labels=new Uint32Array(count),sizes=[0],seeds=[0],queue=new Uint32Array(count);let id=0;
    for(let seed=0;seed<count;seed++){
      if(pixels[seed]<=4||labels[seed])continue;
      id++;let head=0,tail=1;queue[0]=seed;labels[seed]=id;seeds[id]=seed;
      while(head<tail){
        const p=queue[head++],x=p%width,y=Math.floor(p/width);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
          const n=p+dy*width+dx;if(pixels[n]>4&&!labels[n]){labels[n]=id;queue[tail++]=n}
        }
      }
      sizes[id]=tail;
    }
    return{labels,sizes,seeds,count:id};
  }
  const original=components(before),remaining=components(after),largest=new Uint32Array(original.count+1),anchored=new Uint8Array(original.count+1),keep=new Uint8Array(remaining.count+1),origins=new Uint32Array(remaining.count+1);
  for(let id=1;id<=remaining.count;id++){
    const origin=origins[id]=original.labels[remaining.seeds[id]],best=largest[origin];
    if(!best||remaining.sizes[id]>remaining.sizes[best])largest[origin]=id;
  }
  for(const anchor of anchors){
    const ax=Math.round(anchor.x),ay=Math.round(anchor.y);let best=0,distance=Infinity;
    for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
      const x=ax+dx,y=ay+dy,d=dx*dx+dy*dy;if(x<0||x>=width||y<0||y>=height||d>=distance)continue;
      const id=remaining.labels[y*width+x];if(id){best=id;distance=d}
    }
    if(best){keep[best]=1;anchored[origins[best]]=1}
  }
  for(let origin=0;origin<=original.count;origin++)keep[largest[origin]]=1;
  let removed=0;
  for(let p=0;p<count;p++)if(remaining.labels[p]&&!keep[remaining.labels[p]]){after[p]=0;removed++}
  return removed;
}

function check(prune,fixture){
  const expected=fixture.after.slice(),actual=fixture.after.slice(),expectedCount=reference(fixture.before,expected,fixture.width,fixture.height,fixture.anchors),actualCount=prune(fixture.before,actual,fixture.width,fixture.height,fixture.anchors);
  assert.equal(actualCount,expectedCount,fixture.name+' removed-pixel count');
  assert.deepEqual(actual,expected,fixture.name+' retained pixels');
  return actualCount;
}

function syntheticChecks(prune){
  let checked=0;
  const width=80,height=40,before=new Uint8Array(width*height),rect=(pixels,x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)pixels.fill(255,yy*width+x,yy*width+x+w)};
  rect(before,2,3,52,25);rect(before,65,3,10,10);
  const after=before.slice();for(let y=0;y<height;y++)after.fill(0,y*width+40,y*width+44);
  // Anchor the smaller survivor. Preserve it alongside the largest hull,
  // while the intentionally separate original ornament survives independently.
  const anchored={name:'anchors preserve smaller anatomy alongside main hull',width,height,before,after,anchors:[{x:48,y:15}]};
  const result=after.slice();assert.equal(prune(before,result,width,height,anchored.anchors),0);assert.equal(result[15*width+48],255);assert.equal(result[6*width+68],255);check(prune,anchored);checked++;
  check(prune,{...anchored,name:'unanchored original components keep their largest',anchors:[]});checked++;
  check(prune,{...anchored,name:'multiple anchored survivors are retained',anchors:[{x:10,y:15},{x:48,y:15}]});checked++;
  check(prune,{name:'diagonal foreground and boundary pixels',width:3,height:3,before:Uint8Array.from([255,0,0,0,255,0,0,0,255]),after:Uint8Array.from([255,0,0,0,255,0,0,0,255]),anchors:[]});checked++;
  check(prune,{name:'equal-size fallback uses earliest source pixel',width:5,height:1,before:Uint8Array.from([255,255,255,255,255]),after:Uint8Array.from([255,255,0,255,255]),anchors:[]});checked++;
  check(prune,{name:'anchor equal-distance tie follows pixel scan order',width:7,height:1,before:Uint8Array.from([255,255,255,255,255,255,255]),after:Uint8Array.from([255,0,0,0,0,0,255]),anchors:[{x:3,y:0}]});checked++;
  check(prune,{name:'low alpha is outside topology and remains unchanged',width:6,height:1,before:Uint8Array.from([255,255,255,255,255,4]),after:Uint8Array.from([255,0,5,0,255,4]),anchors:[{x:2,y:0}]});checked++;
  let randomState=0x79a14b3;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
  for(let test=0;test<400;test++){
    const width=1+Math.floor(random()*75),height=1+Math.floor(random()*60),before=new Uint8Array(width*height),after=new Uint8Array(width*height),anchors=[];
    for(let p=0;p<before.length;p++){before[p]=random()<.62?(random()<.1?5:255):random()<.3?4:0;after[p]=random()<.67?before[p]:0}
    for(let i=0,n=Math.floor(random()*5);i<n;i++)anchors.push({x:random()*(width+24)-12,y:random()*(height+24)-12});
    check(prune,{name:'deterministic random mask '+test,width,height,before,after,anchors});checked++;
  }
  return checked;
}

function nativeFixtures(audit,api,pngMaterial){
  const fixtures=[];
  for(const [family,type,phase,frame]of[['mini',0,1,0],['mini',5,1,7],['mini',9,1,15],['main',1,2,1],['main',9,2,16],['epic',0,4,16],['epic',1,4,16]]){
    if(family==='mini')api.startMiniBossLab(type);else if(family==='main')api.startBossLab(type);else api.startEpicBossLab(type);
    const enemy=family==='mini'?api.miniBoss:api.boss;Object.assign(enemy,{x:745,y:267,intro:0,phase,clock:1.231,cool:5,hitFlash:0,weakOpen:true,coreAperture:1});api.forceAuditFrame(enemy,frame);
    const nodes=api.activeWeakNodes(enemy),groups=new Map();nodes.forEach(node=>{node.destroyed=false;node.hp=node.max;const p=api.nativeFractureProfile(enemy,node,frame);if(p)groups.set(p.groupId,p)});
    for(const group of [groups.keys().next().value,'all']){
      nodes.forEach(node=>{const p=api.nativeFractureProfile(enemy,node,frame);node.destroyed=!!p&&(group==='all'||p.groupId===group);node.hp=node.destroyed?0:node.max});
      const body=audit.rasterNativeBody(audit.nativeDraws(api,enemy,frame,pngMaterial),2),polygons=[...groups].filter(([id])=>group==='all'||id===group).map(([,p])=>api.nativeFractureVertices(p)),afterMask=removePolygons(body,polygons),anchors=[];
      for(const node of nodes){const p=api.nativeFractureBaseProfile(enemy,node,frame);if(!node.destroyed||!p){const[x,y]=api.auditCorePoint(enemy,node);anchors.push({x,y})}if(p?.protectedHousing)anchors.push(p.protectedHousing)}
      fixtures.push({name:`native ${family}-${type} phase-${phase} frame-${frame} cut-${group}`,family,width:body.width,height:body.height,before:Uint8Array.from(body.opaque,p=>p?255:0),after:Uint8Array.from(afterMask,p=>p?255:0),anchors:anchors.map(p=>({x:(p.x-body.minX)*2,y:(p.y-body.minY)*2}))});
    }
  }
  return fixtures;
}

function benchmark(prune,fixture,iterations=80){
  const after=fixture.after.slice(),samples=[];
  for(let i=0;i<25+iterations;i++){
    after.set(fixture.after);const start=performance.now();prune(fixture.before,after,fixture.width,fixture.height,fixture.anchors);const elapsed=performance.now()-start;if(i>=25)samples.push(elapsed);
  }
  samples.sort((a,b)=>a-b);return{name:fixture.name,width:fixture.width,height:fixture.height,medianMs:+samples[Math.floor(samples.length*.5)].toFixed(3),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(3)};
}

function run(){
  const audit=alphaAudit(4),{createGame,pngMaterial}=audit.loadHarness(),{api}=createGame(),prune=api.pruneNativePartIslands,synthetic=syntheticChecks(prune),fixtures=nativeFixtures(audit,api,pngMaterial);
  let removedPixels=0;for(const fixture of fixtures)removedPixels+=check(prune,fixture);
  const report={syntheticChecks:synthetic,nativeChecks:fixtures.length,removedPixels,benchmarks:fixtures.map(fixture=>benchmark(prune,fixture)),limitations:'Node timing of the pure production cleanup at native density 2; excludes raster capture, alpha copying and GPU upload. Source fixtures use nearest-texel native PNG alpha.'};
  console.log(JSON.stringify(report,null,2));return report;
}

module.exports={reference,check,syntheticChecks,nativeFixtures,benchmark,run};
if(require.main===module)run();
