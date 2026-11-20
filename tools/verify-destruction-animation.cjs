#!/usr/bin/env node
'use strict';
// Animation coverage through shipping painters; no damage events or debris scans.
// A trace certifies selected prepared sources/cells, not visual anatomical taste.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),harness=fs.readFileSync(path.join(__dirname,'verify-game.cjs'),'utf8').replace(/^#![^\n]*\n/,'').split('const game = createGame();')[0];
const {createGame}=new Function('require','__dirname',harness+'\nreturn{createGame};')(require,__dirname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8'));
const specs=[...Array.from({length:10},(_,i)=>['mini',i,1]),...Array.from({length:9},(_,i)=>[1,2].map(p=>['main',i+1,p])).flat(),...Array.from({length:2},(_,i)=>[1,2,3,4].map(p=>['epic',i,p])).flat()];
function pose(e,n){
  e.clock=n*.125;if(e.kind==='mini')return n%16;
  if(e.epic)e.clock=(n+.02)/((3.35+e.phase*.14)*3);
  else if(e.type===1)e.clock=n/(e.phase===2?6.5:5);
  else if(e.type===2)e.clock=n/(e.phase===2?6.2:4.6);
  else if(e.type===3){const period=e.phase===2?1.25:1.3,count=e.phase===2?4:8;e.cool=period*(1-((n%count)+.02)/count)}
  else if(e.type===4){e.attackCycle=1;e.ironCycle=(e.phase===2?.86:1.05)*((n%8)+.02)/8}
  else if(e.type===5){let lo=0,hi=1;for(let i=0;i<24;i++){const x=(lo+hi)/2;if(x-Math.sin(x*Math.PI*2)*.055<(n+.02)/32)lo=x;else hi=x}e.chargeWindow=1.35*(1-(lo+hi)/2);e.voidAnimWindow=0}
  else{const rate=e.type===6?(e.phase===2?4.05:3.5):e.type===7?(e.phase===2?4:3.6):e.type===8?(e.phase===2?4.1:3.65):(e.phase===2?3.9:3.55);e.clock=(n+.02)/(rate*3)}
}
const report={date:new Date().toISOString(),scope:'All prepared native animation sources and all 36 native encounter phases. Bloodstar retains separately tested authored removal art.',method:'Actual production body painters with prepared module, traced source/tile identity and no damage events. Real PNG partition audit and browser inspection supply pixel/art evidence.',phases:[],sources:{},stateCount:0,failed:0};
for(const[family,index,phase]of specs){
  const g=createGame(),a=g.api,key=`${family}:${index}:${phase}`;
  if(family==='mini')a.startMiniBossLab(index);else if(family==='main')a.startBossLab(index);else a.startEpicBossLab(index);
  const e=family==='mini'?a.miniBoss:a.boss;Object.assign(e,{phase,x:0,y:0,intro:0,clock:0,hitFlash:0,weakOpen:true,weakTelegraph:0,coreAperture:1,hidden:false,visualAngle:0});
  for(const node of a.activeWeakNodes(e)){node.destroyed=!!a.nativeFractureBaseProfile(e,node);node.hp=node.destroyed?0:node.max}
  const observed=new Set(),frames=family==='mini'?16:32;
  try{
    for(let n=0;n<frames;n++){
      const frame=pose(e,n);e.hitFlash=n%7===0?.11:0;a.drawingContext.trace=[];a.fractureContext.trace=[];
      a.drawNativeFracturedBody(e,()=>a.paintNativeFractureBody(e,frame),frame);
      const events=[...a.drawingContext.trace,...a.fractureContext.trace];assert.equal(events.some(t=>t.composite==='destination-out'),false,key+' cuts body at animation state'+n);
      const bodies=a.drawingContext.trace.filter(t=>t.op==='drawImage'&&t.image?.destructionComposite&&manifest.sources[t.image.sourcePath]);assert.ok(bodies.length,key+' used intact fallback at state'+n);
      for(const body of bodies){
        const file=body.image.sourcePath,sheet=manifest.sources[file];assert.ok(sheet.uses.includes(key),key+' animation selected unrelated prepared source '+file);
        const[,sx,sy,sw,sh]=body.args;assert.ok([sx,sy,sw,sh].every(Number.isFinite)&&sw>0&&sh>0,key+' invalid source crop');
        const nativeWidth=body.image.naturalWidth||body.image.width,nativeHeight=body.image.naturalHeight||body.image.height,cw=nativeWidth/sheet.cols,ch=nativeHeight/sheet.rows,col=Math.floor((sx+sw*.5)/cw),row=Math.floor((sy+sh*.5)/ch);assert.ok(col>=0&&col<sheet.cols&&row>=0&&row<sheet.rows,key+' crop center escaped source grid');
        const tile=row*sheet.cols+col;observed.add(file+':'+tile);(report.sources[file]??={tiles:[],phases:[]});if(!report.sources[file].tiles.includes(tile))report.sources[file].tiles.push(tile);if(!report.sources[file].phases.includes(key))report.sources[file].phases.push(key);
        if(e.kind==='boss'&&!e.epic&&[1,2].includes(e.type))assert.equal(row,phase-1,key+' selected art from wrong phase');
      }
      report.stateCount++;
    }
    report.phases.push({key,states:frames,uniqueSourceCells:observed.size,pass:true});console.log('PASS '+key+': '+frames+' native states, '+observed.size+' prepared source cells');
  }catch(error){report.failed++;report.phases.push({key,pass:false,error:error.stack});console.error('FAIL '+key+': '+error.stack)}
}
try{
  assert.equal(Object.keys(report.sources).length,Object.keys(manifest.sources).length,'Animation sweep must actually visit every registered prepared source');
  for(const[file,sheet]of Object.entries(manifest.sources))assert.equal(report.sources[file]?.tiles.length,sheet.cols*sheet.rows,'Animation sweep must actually visit every native tile of '+file);
}catch(error){report.failed++;report.coverageError=error.stack;console.error('FAIL source/tile coverage: '+error.stack)}
for(const source of Object.values(report.sources))source.tiles.sort((a,b)=>a-b);
fs.writeFileSync(path.join(root,'artifacts/destruction-animation-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.phases.filter(p=>p.pass).length} phases passed, ${report.stateCount} animation states, ${Object.keys(report.sources).length} sources, ${report.failed} failures`);
if(report.failed)process.exitCode=1;
