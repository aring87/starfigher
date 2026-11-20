#!/usr/bin/env node
'use strict';

// Detect newly disconnected surviving source-art islands after native severs.
// This complements (rather than replaces) the exterior-hole audit. Private
// mocked game state only: no browser profile or production asset is written.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');

function optionsFrom(args){
  const options={density:2,alpha:4};
  for(let at=0;at<args.length;at++){
    const flag=args[at];
    if(!['--family','--type','--phase','--frame','--state','--density','--alpha','--report'].includes(flag))throw Error('Unknown option '+flag);
    const name=flag.slice(2),value=args[++at];assert.ok(value!==undefined,'Missing value for '+flag);
    options[name]=['type','phase','frame','density','alpha'].includes(name)?Number(value):value;
  }
  assert.ok(options.density>0&&Number.isFinite(options.density));
  assert.ok(Number.isInteger(options.alpha)&&options.alpha>=0&&options.alpha<255);
  return options;
}

function alphaAudit(alpha){
  // Reuse the proven PNG preparation, articulated-paint mapping and clipping
  // code with only its final opacity classification lowered. Never change
  // the shared audit file or production source to make this diagnostic pass.
  const filename=path.join(__dirname,'verify-severed-silhouettes.cjs');
  const source=fs.readFileSync(filename,'utf8'),needle='opaque:Uint8Array.from(alpha,a=>a>40?1:0)';
  assert.ok(source.includes(needle),'Native alpha rasterizer contract changed; review its threshold before running');
  assert.ok(source.includes('nativeFractureBaseProfile,pruneNativePartIslands,'),'Native harness exports changed; review cleanup instrumentation');
  const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
  isolated._compile(source.replace(needle,`opaque:Uint8Array.from(alpha,a=>a>${alpha}?1:0)`),filename);
  return isolated.exports;
}

function components(mask,width){
  const labels=new Int32Array(mask.length),queue=new Int32Array(mask.length),items=[];let id=0;
  for(let seed=0;seed<mask.length;seed++){
    if(!mask[seed]||labels[seed])continue;
    id++;let head=0,tail=1,minX=seed%width,maxX=minX,minY=Math.floor(seed/width),maxY=minY;
    queue[0]=seed;labels[seed]=id;
    const add=p=>{if(mask[p]&&!labels[p]){labels[p]=id;queue[tail++]=p}};
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width),left=x>0,right=x+1<width,up=p>=width,down=p+width<mask.length;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      // Foreground is eight-connected, complementary to the hole audit's
      // four-connected transparent exterior. Diagonal pixel art stays joined.
      if(left)add(p-1);if(right)add(p+1);
      if(up){add(p-width);if(left)add(p-width-1);if(right)add(p-width+1)}
      if(down){add(p+width);if(left)add(p+width-1);if(right)add(p+width+1)}
    }
    items.push({id,seed,pixels:tail,minX,minY,maxX,maxY});
  }
  return{labels,items};
}

function inside(p,x,y){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[a,b]=p[i],[c,d]=p[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit}return hit}
function removePolygons(body,polygons){
  const after=body.opaque.slice(),{density,minX,minY,width,height}=body;
  for(const polygon of polygons){
    if(polygon.length<3)continue;
    const left=Math.max(0,Math.floor((Math.min(...polygon.map(p=>p[0]))-minX)*density)),right=Math.min(width,Math.ceil((Math.max(...polygon.map(p=>p[0]))-minX)*density));
    const top=Math.max(0,Math.floor((Math.min(...polygon.map(p=>p[1]))-minY)*density)),bottom=Math.min(height,Math.ceil((Math.max(...polygon.map(p=>p[1]))-minY)*density));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const at=y*width+x;if(after[at]&&inside(polygon,minX+(x+.5)/density,minY+(y+.5)/density))after[at]=0}
  }
  return after;
}

function retainedIslands(body,before,polygons,afterOverride=null){
  const after=afterOverride||removePolygons(body,polygons),survivors=components(after,body.width),byOriginal=new Map();
  for(const item of survivors.items){
    const originalId=before.labels[item.seed];assert.ok(originalId,'Removing pixels cannot create source opacity');
    const list=byOriginal.get(originalId)||[];list.push(item);byOriginal.set(originalId,list);
  }
  // The original largest source component is the connected retained torso.
  // Other original source components may be floating ornaments, chains or
  // authored gaps and are preserved/excluded rather than incorrectly merged.
  const torso=before.items.reduce((best,item)=>!best||item.pixels>best.pixels?item:best,null);
  if(!torso)return{islands:[],survivors:0,torsoPixels:0,retainedComponents:survivors.items,afterLabels:survivors.labels,afterMask:after};
  const pieces=(byOriginal.get(torso.id)||[]).sort((a,b)=>b.pixels-a.pixels),islands=pieces.slice(1);
  return{islands,survivors:pieces.length,torsoPixels:torso.pixels,retainedPixels:pieces[0]?.pixels||0,originalSeparateComponents:before.items.length-1,retainedComponents:survivors.items,afterLabels:survivors.labels,afterMask:after};
}

function prunedLargestSurvivors(body,before,result,afterAlpha){
  const largest=new Map();for(const item of result.retainedComponents){const origin=before.labels[item.seed],old=largest.get(origin);if(!old||item.pixels>old.pixels)largest.set(origin,item)}
  const lost=[];for(const[originalComponent,item]of largest){
    let prunedPixels=0;for(let y=item.minY;y<=item.maxY;y++)for(let x=item.minX;x<=item.maxX;x++){const p=y*body.width+x;if(result.afterLabels[p]===item.id&&!afterAlpha[p])prunedPixels++}
    if(prunedPixels)lost.push({originalComponent,largestSourceSurvivor:true,pixels:item.pixels,prunedPixels,bounds:{minX:body.minX+item.minX/body.density,minY:body.minY+item.minY/body.density,maxX:body.minX+(item.maxX+1)/body.density,maxY:body.minY+(item.maxY+1)/body.density}});
  }
  return lost;
}

function seedAssignments(body,result,coreSeeds,housings){
  const assignments=new Map(),{width,height,density,minX,minY}=body,labels=result.afterLabels;
  const entry=id=>{if(!assignments.has(id))assignments.set(id,{liveCoreIndices:[],retainedCentralCoreIndices:[],housingCenterIndices:[],protectedHousingOverlap:[]});return assignments.get(id)};
  const nearest=(cx,cy)=>{
    let best=0,distance=Infinity;
    const ax=Math.round((cx-minX)*density),ay=Math.round((cy-minY)*density);
    for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
      const x=ax+dx,y=ay+dy,d=dx*dx+dy*dy;if(x<0||x>=width||y<0||y>=height||d>=distance)continue;
      const id=labels[y*width+x];if(!id)continue;
      best=id;distance=d;
    }
    return best;
  };
  for(const seed of coreSeeds){
    const id=nearest(seed.x,seed.y);if(!id)continue;
    if(seed.live)entry(id).liveCoreIndices.push(seed.index);
    if(seed.central)entry(id).retainedCentralCoreIndices.push(seed.index);
  }
  for(let index=0;index<housings.length;index++){
    const h=housings[index],center=nearest(h.x,h.y);if(center)entry(center).housingCenterIndices.push(index);
    const overlaps=new Set(),left=Math.max(0,Math.floor((h.x-h.rx-minX)*density)),right=Math.min(width,Math.ceil((h.x+h.rx-minX)*density)),top=Math.max(0,Math.floor((h.y-h.ry-minY)*density)),bottom=Math.min(height,Math.ceil((h.y+h.ry-minY)*density));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const id=labels[y*width+x];if(id&&((minX+(x+.5)/density-h.x)/h.rx)**2+((minY+(y+.5)/density-h.y)/h.ry)**2<=1)overlaps.add(id)}
    for(const id of overlaps)entry(id).protectedHousingOverlap.push(index);
  }
  return assignments;
}

function selfCheck(){
  const width=30,mask=new Uint8Array(width*20),rect=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)mask[yy*width+xx]=1};
  rect(3,3,15,12);rect(23,4,3,3); // A torso and intentionally separate ornament.
  const body={opaque:mask,width,height:20,density:1,minX:0,minY:0},before=components(mask,width);
  assert.equal(retainedIslands(body,before,[]).islands.length,0,'Existing detached artwork is allowed');
  assert.equal(retainedIslands(body,before,[[[12,0],[30,0],[30,20],[12,20]]]).islands.length,0,'Fully removed outer art leaves no survivor');
  assert.equal(retainedIslands(body,before,[[[10,0],[11,0],[11,20],[10,20]]]).islands.length,1,'A severed bridge with a surviving outer piece must fail');
  const thin=new Uint8Array(100);thin[22]=thin[33]=thin[44]=1;assert.equal(components(thin,10).items.length,1,'Diagonal source-art pixels are connected');
  const sliver=mask.slice();for(let y=3;y<15;y++)for(let x=11;x<18;x++)sliver[y*width+x]=0;sliver[3*width+17]=1;
  const split=components(sliver,width),oldId=before.labels[3*width+17];assert.equal(split.items.filter(item=>before.labels[item.seed]===oldId).length,2,'Even a one-pixel new island is not silently tolerated');
  const raw=retainedIslands(body,before,[[[10,0],[11,0],[11,20],[10,20]]]),badCleanup=Uint8Array.from(raw.afterMask,p=>p?255:0);
  for(let p=0;p<badCleanup.length;p++)if(raw.afterLabels[p]===raw.retainedComponents.find(c=>c.pixels===Math.max(...raw.retainedComponents.map(c=>c.pixels))).id)badCleanup[p]=0;
  assert.equal(prunedLargestSurvivors(body,before,raw,badCleanup).length,1,'Cleanup must not delete the largest surviving torso while keeping a smaller anchored fragment');
  return 6;
}

function run(options={density:2,alpha:4}){
  options={density:2,alpha:4,...options};
  const selfChecks=selfCheck(),audit=alphaAudit(options.alpha),{createGame,pngMaterial,gameSource}=audit.loadHarness(),{api}=createGame();
  const report={algorithm:'retained-source-islands-v2-with-production-cleanup',sourceSha256:crypto.createHash('sha256').update(gameSource).digest('hex'),density:options.density,alphaThreshold:options.alpha,foregroundConnectivity:8,selfChecks,poses:0,individualCuts:0,combinedCuts:0,cleanupRemovedPixels:0,geometryFindings:[],retainedSeeded:[],prunedProtectedOverlap:[],failures:[],coverage:[],scope:'Native source-PNG opacity through production articulated paint transforms. Compare eight-connected components before/after each group and all severs, then run the production pure island cleanup with its actual live/central/housing anchors. Unseeded final islands fail with no size tolerance. Seeded surviving islands are reported separately for geometry review, not treated as cleanup failures. Originally separate source components remain allowed.',limitations:'Nearest source-texel sampling; not GPU antialiasing. Material-only overlays and cosmetic effects are excluded. Largest original opaque component identifies torso; this detects new topology splits, not complete anatomical removal or a remnant still attached to its stump. Binary source opacity classified at the selected threshold is passed to cleanup as 0/255. Protected-ellipse overlap is conservative review data; production cleanup seeds ellipse centers.'};
  for(const family of['mini','main','epic'])for(let type=family==='main'?1:0;type<(family==='epic'?2:10);type++)for(let phase=1;phase<=(family==='mini'?1:family==='epic'?4:2);phase++){
    if(options.family&&family!==options.family||options.type!==undefined&&type!==options.type||options.phase&&phase!==options.phase)continue;
    if(family==='mini')api.startMiniBossLab(type);else if(family==='main')api.startBossLab(type);else api.startEpicBossLab(type);
    const enemy=family==='mini'?api.miniBoss:api.boss;Object.assign(enemy,{x:745,y:267,intro:0,phase,clock:.61,cool:5,hitFlash:0,coreAperture:1});api.player.inv=1e6;
    // Earlier bosses repeat fewer atlas cells, but their articulated joints
    // move continuously. Thirty-two clock samples cover those moving poses
    // as well as every late-boss keyframe/inbetween source cell.
    const count=family==='mini'?16:32;
    const startFailures=report.failures.length,startPoses=report.poses;
    for(let pose=0;pose<count;pose++)for(const state of options.state?[options.state]:['sealed','open']){
      if(options.frame!==undefined&&pose!==options.frame)continue;
      enemy.clock=.17+pose*.073;enemy.weakOpen=state==='open';enemy.coreAperture=enemy.weakOpen?1:0;api.forceAuditFrame(enemy,pose);
      const nodes=api.activeWeakNodes(enemy);nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});
      let body=audit.rasterNativeBody(audit.nativeDraws(api,enemy,pose,pngMaterial),options.density),before=components(body.opaque,body.width);const groups=new Map();
      for(const node of nodes){const p=api.nativeFractureProfile(enemy,node,pose);if(p)groups.set(p.groupId,p)}
      const union=[];report.poses++;
      const inspect=(polygons,group)=>{
        const coreSeeds=nodes.map((node,index)=>{const point=api.auditCorePoint(enemy,node);return{index,x:point[0],y:point[1],live:!node.destroyed,central:!api.nativeFractureBaseProfile(enemy,node,pose)}}).filter(seed=>seed.live||seed.central);
        const housingMap=new Map();for(const node of nodes){const h=api.nativeFractureBaseProfile(enemy,node,pose)?.protectedHousing;if(h)housingMap.set([h.x,h.y,h.rx,h.ry].join('/'),h)}
        const housings=[...housingMap.values()],raw=retainedIslands(body,before,polygons),runtimeAnchors=[...coreSeeds,...housings].map(p=>({x:(p.x-body.minX)*body.density,y:(p.y-body.minY)*body.density}));
        const afterAlpha=Uint8Array.from(raw.afterMask,v=>v?255:0),beforeAlpha=Uint8Array.from(body.opaque,v=>v?255:0);
        const removed=api.pruneNativePartIslands(beforeAlpha,afterAlpha,body.width,body.height,runtimeAnchors);report.cleanupRemovedPixels+=removed;
        const cleaned=retainedIslands(body,before,[],Uint8Array.from(afterAlpha,a=>a>4?1:0));
        const describe=(result)=>{
          const assignments=seedAssignments(body,result,coreSeeds,housings);
          return result.islands.map(item=>{
            const anchors=assignments.get(item.id)||{liveCoreIndices:[],retainedCentralCoreIndices:[],housingCenterIndices:[],protectedHousingOverlap:[]};
            const runtimeSeeded=anchors.liveCoreIndices.length>0||anchors.retainedCentralCoreIndices.length>0||anchors.housingCenterIndices.length>0,seeded=runtimeSeeded||anchors.protectedHousingOverlap.length>0;
            let prunedPixels=0;if(result===raw)for(let y=item.minY;y<=item.maxY;y++)for(let x=item.minX;x<=item.maxX;x++){const at=y*body.width+x;if(result.afterLabels[at]===item.id&&!afterAlpha[at])prunedPixels++}
            return{pixels:item.pixels,arenaArea:item.pixels/(options.density**2),seeded,runtimeSeeded,removableUnseeded:!seeded,...anchors,...(result===raw?{prunedPixels}:{}),bounds:{minX:body.minX+item.minX/options.density,minY:body.minY+item.minY/options.density,maxX:body.minX+(item.maxX+1)/options.density,maxY:body.minY+(item.maxY+1)/options.density}};
          });
        };
        const meta={family,type,phase,pose,state,group,coreSeeds,protectedHousings:housings},rawItems=describe(raw),finalItems=describe(cleaned);
        if(rawItems.length)report.geometryFindings.push({...meta,originalTorsoPixels:raw.torsoPixels,retainedTorsoPixels:raw.retainedPixels,cleanupRemovedPixels:removed,islands:rawItems});
        const largestLost=prunedLargestSurvivors(body,before,raw,afterAlpha),protectedLost=rawItems.filter(i=>i.runtimeSeeded&&i.prunedPixels>0),unseeded=finalItems.filter(i=>!i.seeded);
        if(largestLost.length||protectedLost.length||unseeded.length){const failure={...meta,reason:largestLost.length?'Cleanup removed the largest surviving source component':protectedLost.length?'Cleanup removed a live/central/housing-seeded component':'Unseeded survivor remains after production cleanup',islands:[...largestLost,...protectedLost,...unseeded]};report.failures.push(failure);if(report.failures.length<=25)console.log('FAIL '+JSON.stringify(failure))}
        const retained=finalItems.filter(i=>i.seeded);if(retained.length)report.retainedSeeded.push({...meta,islands:retained});
        const overlapPruned=rawItems.filter(i=>i.protectedHousingOverlap.length&&i.prunedPixels>0&&!i.runtimeSeeded);if(overlapPruned.length)report.prunedProtectedOverlap.push({...meta,islands:overlapPruned});
      };
      for(const[group,p]of groups){
        nodes.forEach(node=>{node.destroyed=false;node.hp=node.max});
        const members=nodes.filter(node=>api.nativeFractureProfile(enemy,node,pose)?.groupId===group);members.forEach(node=>{node.destroyed=true;node.hp=0});
        // Twin Maw's loose jaw angle depends on the destroyed assembly's
        // health. Compare the actual post-break source pose to its own mask.
        if(family==='main'&&type===1){body=audit.rasterNativeBody(audit.nativeDraws(api,enemy,pose,pngMaterial),options.density);before=components(body.opaque,body.width)}
        const vertices=api.nativeFractureVertices(api.nativeFractureProfile(enemy,members[0],pose));union.push(vertices);inspect([vertices],group);report.individualCuts++;
      }
      if(union.length>1){
        nodes.forEach(node=>{const p=api.nativeFractureProfile(enemy,node,pose);node.destroyed=!!p;node.hp=p?0:node.max});
        const finalProfiles=new Map();for(const node of nodes){const p=api.nativeFractureProfile(enemy,node,pose);if(p)finalProfiles.set(p.groupId,p)}
        if(family==='main'&&type===1){body=audit.rasterNativeBody(audit.nativeDraws(api,enemy,pose,pngMaterial),options.density);before=components(body.opaque,body.width)}
        inspect([...finalProfiles.values()].map(p=>api.nativeFractureVertices(p)),'all-severs');report.combinedCuts++;
      }
    }
    const entry={family,type,phase,poses:report.poses-startPoses,failures:report.failures.length-startFailures};report.coverage.push(entry);console.log('PROBED '+JSON.stringify(entry));
    fs.writeFileSync(path.join(root,'artifacts','retained-islands-progress.json'),JSON.stringify({sourceSha256:report.sourceSha256,last:entry,poses:report.poses,individualCuts:report.individualCuts,combinedCuts:report.combinedCuts,cleanupRemovedPixels:report.cleanupRemovedPixels,failures:report.failures,retainedSeeded:report.retainedSeeded,prunedProtectedOverlap:report.prunedProtectedOverlap},null,2)+'\n');
  }
  report.summary={poses:report.poses,individualCuts:report.individualCuts,combinedCuts:report.combinedCuts,geometryCutsWithIslands:report.geometryFindings.length,cleanupRemovedPixels:report.cleanupRemovedPixels,cleanupFailingCuts:report.failures.length,retainedSeededCuts:report.retainedSeeded.length,retainedSeededIslands:report.retainedSeeded.reduce((sum,f)=>sum+f.islands.length,0),retainedSeededPixels:report.retainedSeeded.reduce((sum,f)=>sum+f.islands.reduce((n,i)=>n+i.pixels,0),0),prunedProtectedOverlapCuts:report.prunedProtectedOverlap.length};
  const output=path.join(root,'artifacts',options.report||'retained-islands-audit.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
  return report;
}

module.exports={alphaAudit,components,removePolygons,retainedIslands,prunedLargestSurvivors,seedAssignments,selfCheck,run};
if(require.main===module){const report=run(optionsFrom(process.argv.slice(2)));if(report.failures.length)process.exitCode=1}
