#!/usr/bin/env node
'use strict';
// Warmed headless logic comparison only; no draw/GPU/device performance claim.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'prototype-moving-core-sweep-v154.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('const examples=[seek'));
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createBaseline,createCandidate,fixture,dt};',file);
const {createBaseline,createCandidate,fixture,dt}=m.exports,rows=[],scenes=[['main',7,2],['epic',0,4]],warmTicks=960,measuredTicks=3600;
for(const [family,type,phase]of scenes)for(let sample=0;sample<3;sample++)for(const label of sample%2?['candidate','baseline']:['baseline','candidate']){
 const {a,e}=fixture(label==='baseline'?createBaseline:createCandidate,type,phase,family);if(e.epic)e.toxinProtected=true;
 for(let tick=0;tick<warmTicks;tick++)a.update(dt);
 const started=performance.now();for(let tick=0;tick<measuredTicks;tick++)a.update(dt);const milliseconds=performance.now()-started;
 rows.push({family,type,phase,sample,label,milliseconds,msPerStep:milliseconds/measuredTicks});
}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)],summary=scenes.map(([family,type,phase])=>{
 const selected=rows.filter(r=>r.family===family&&r.type===type&&r.phase===phase),baseline=median(selected.filter(r=>r.label==='baseline').map(r=>r.msPerStep)),candidate=median(selected.filter(r=>r.label==='candidate').map(r=>r.msPerStep));return{family,type,phase,baselineMsPerStep:baseline,candidateMsPerStep:candidate,ratio:candidate/baseline,deltaMsPerStep:candidate-baseline};
});
const report={warmTicksPerTrial:warmTicks,measuredTicksPerTrial:measuredTicks,samplesPerCase:3,rows,summary,limits:['Actual native update logic in disposable VMs, rendering/audio mocked; no GPU/device or long-session claim.','Alternating pair order and medians reduce, but do not eliminate, GC/JIT/host variance.','No player firing: isolates exposed-core snapshot overhead against native actor/hostile update work.','Both scenes preserve native exposure windows and continuous clocks.']};
fs.writeFileSync(path.join(root,'artifacts/moving-core-candidate-v154-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary,null,2));console.log('PASS bounded warmed logic comparison;12 trials,43,200 measured native steps.');
