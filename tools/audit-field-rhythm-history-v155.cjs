#!/usr/bin/env node
'use strict';
// Explain the legacy v149 exact-pressure snapshot failure without altering it.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-stage-rhythm.cjs');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('let checks=0;'));
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={factory,field,baseline,production,baselineSource,productionSource};',file);
const m=mod.exports,snapshotFile=path.join(root,'artifacts/field-clarity-v155-baseline-game.js'),snapshot=fs.readFileSync(snapshotFile,'utf8'),v154=m.factory(snapshot,'frozen-v154'),rows=[];
for(const post of[false,true]){
 const config={stage:1,post,seed:1103,pilot:'passive'},old=m.field(m.baseline,config),previous=m.field(v154,config),live=m.field(m.production,config);
 const totals=row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='samples'));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),firstDifference=(a,b)=>a.samples.map((sample,i)=>({second:sample.second,before:sample,after:b.samples[i]})).find(row=>!same(row.before,row.after));
 rows.push({post,totals:{v148:totals(old),v154:totals(previous),v155:totals(live)},v154MatchesV148:same(previous,old),v155MatchesV154:same(live,previous),firstV148toV154Difference:firstDifference(old,previous),firstV154toV155Difference:firstDifference(previous,live)});
 console.log(JSON.stringify(rows.at(-1)));
}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),report={scope:'Legacy native pressure-meter comparison only: one stationary no-fire 1000-hull private pilot, seed1103, Mission1 pre/post sections. Not a human outcome.',sources:{v148:hash(m.baselineSource),v154:hash(snapshot),v155:hash(m.productionSource)},rows};
fs.writeFileSync(path.join(root,'artifacts/field-rhythm-history-v155.json'),JSON.stringify(report,null,2)+'\n');
