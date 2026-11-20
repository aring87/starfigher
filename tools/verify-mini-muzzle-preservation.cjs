#!/usr/bin/env node
'use strict';
// Independent native-pixel regressions for two firing noses previously torn
// away with a fin. These rectangles were measured in the source artwork.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {png}=require('./verify-destruction-sprites.cjs'),root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8'));
const cases=[
  {name:'Gravity Lancer translated firing nose',source:'elite-09-eventide-engine-atlas-alpha-v2.png',frame:3,rect:[0,147,35,35],minimum:650},
  {name:'Signal Executor raised emitter',source:'elite-10-last-signal-atlas-alpha-v2.png',frame:15,rect:[5,94,30,13],minimum:125},
];
const report={scope:'Measured native muzzle regions: their solid firing hardware must remain on the body after either fin breaks.',cases:[],failed:0};
for(const item of cases){
  const sourcePath='assets/minibosses/'+item.source,sheet=manifest.sources[sourcePath],source=png(sourcePath),core=png(sheet.core),ox=Math.round(item.frame%sheet.cols*sheet.cellW),oy=Math.round(Math.floor(item.frame/sheet.cols)*sheet.cellH);let examined=0,lost=0;
  for(let y=item.rect[1];y<item.rect[1]+item.rect[3];y++)for(let x=item.rect[0];x<item.rect[0]+item.rect[2];x++){
    const at=((oy+y)*source.width+ox+x)*4;if(source.rgba[at+3]<192)continue;examined++;for(let c=0;c<4;c++)if(source.rgba[at+c]!==core.rgba[at+c]){lost++;break;}
  }
  try{assert.ok(examined>=item.minimum,item.name+' must exercise substantial original firing hardware');assert.equal(lost,0,item.name+' cannot lose hardware with either wing');report.cases.push({...item,examined,lost,pass:true});console.log('PASS '+item.name+': '+examined+' solid native texels retained');}
  catch(error){report.failed++;report.cases.push({...item,examined,lost,pass:false,error:error.message});console.error('FAIL '+item.name+': '+lost+'/'+examined+' firing texels assigned to a fin');}
}
fs.writeFileSync(path.join(root,'artifacts/mini-muzzle-preservation-audit.json'),JSON.stringify(report,null,2)+'\n');
if(report.failed)process.exitCode=1;
