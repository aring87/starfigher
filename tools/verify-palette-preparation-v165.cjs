#!/usr/bin/env node
'use strict';
// Explore palette preparation in private memory. Native art bytes and exact
// layer outputs are compared; Canvas readback/uploads and game FPS are excluded.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),baselinePath='artifacts/palette-v164-baseline-game.js',baseline=fs.readFileSync(path.join(root,baselinePath),'utf8'),current=fs.readFileSync(path.join(root,'game.js'),'utf8');
function part(source,name,next){const start=source.indexOf('  function '+name+'('),end=source.indexOf(next,start);assert.ok(start>=0&&end>start);return source.slice(start,end).trim().replace(/\r\n/g,'\n')}
const emission=part(baseline,'nativeEmissionWeight','  function relightNativeMaterial'),hue=part(baseline,'nativeSocketHue','  // Select the luminous material'),original=part(baseline,'buildNativeSocketPalette','  // Three 96px RGBA canvases');
const changes=[
 ['sealed.set([r*.28,g*.28,b*.28,alpha],at);','sealed[at]=r*.28;sealed[at+1]=g*.28;sealed[at+2]=b*.28;sealed[at+3]=alpha;'],
 ['hot.set([warm,warm*(.65+light*.2),warm*(.035+light*.1),alpha],at);','hot[at]=warm;hot[at+1]=warm*(.65+light*.2);hot[at+2]=warm*(.035+light*.1);hot[at+3]=alpha;'],
 ['emission.set([warm,warm*.95,warm*(.12+light*.13),alpha],at)','emission[at]=warm;emission[at+1]=warm*.95;emission[at+2]=warm*(.12+light*.13);emission[at+3]=alpha'],
 ['strength[p]=weight;hues[p]=nativeSocketHue(r,g,b);','if(!weight)continue;strength[p]=weight;hues[p]=nativeSocketHue(r,g,b);']
];
function proposed(source,fast){for(const[a,b]of changes.slice(0,fast?4:3)){assert.equal(source.split(a).length,2,a);source=source.replace(a,b)}return source}
const direct=proposed(original,false),candidate=proposed(original,true),compile=body=>new Function('const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));'+emission+'\n'+hue+'\n'+body+'\nreturn buildNativeSocketPalette;')();
const variants={baseline:compile(original),direct:compile(direct),candidate:compile(candidate)};
const verifyCurrent=process.argv.includes('--verify-current');
if(verifyCurrent){
 const actual=part(current,'buildNativeSocketPalette','  // Three 96px RGBA canvases');
 assert.equal(actual,candidate,'Production palette must match tested candidate exactly');
 assert.equal(part(current,'nativeEmissionWeight','  function relightNativeMaterial'),emission,'Emission weighting helper must remain unchanged');
 assert.equal(part(current,'nativeSocketHue','  // Select the luminous material'),hue,'Hue helper must remain unchanged');
 // Compile the actual current production function, rather than continuing to
 // exercise only the independently proposed in-memory replacement.
 variants.candidate=compile(actual);
}
const file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));const decoder=new Module(file,module);decoder.filename=file;decoder.paths=Module._nodeModulePaths(__dirname);decoder._compile(support+'\nmodule.exports={pngMaterial};',file);const{pngMaterial}=decoder.exports;
let seed=16501;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},N=96;
const inputs=[];
for(const density of[0,.05,.25,.65,1])for(let serial=0;serial<4;serial++){
 const data=new Uint8ClampedArray(N*N*4);for(let p=0;p<N*N;p++){const at=p*4;for(let q=0;q<3;q++)data[at+q]=Math.floor(random()*256);data[at+3]=random()<density?Math.floor(random()*256):0}inputs.push({name:'synthetic density '+density+' #'+serial,data});
}
for(const name of['transparent-colored','solid-red','solid-cyan','low-light-purple','neutral-metal','disconnected-branches']){
 const data=new Uint8ClampedArray(N*N*4);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const p=y*N+x,at=p*4,rgb=name==='solid-red'?[255,40,31]:name==='solid-cyan'?[25,210,250]:name==='low-light-purple'?[68,35,90]:name==='neutral-metal'?[128,128,128]:name==='disconnected-branches'?[30,235,180]:[255,40,231];data.set(rgb,at);data[at+3]=name==='transparent-colored'?0:name==='disconnected-branches'?(x%12<5&&y%17<9?255:0):255}inputs.push({name,data});
}
const assets=[
 'assets/minibosses/elite-01-shattered-meridian-atlas-alpha-v2.png',
 'assets/minibosses/elite-05-iron-orchard-atlas-alpha-v2.png',
 'assets/bosses/boss-06-void-leviathan-phase1-granular-16frame-alpha-v3.png',
 'assets/bosses/boss-06-void-leviathan-phase2-granular-16frame-alpha-v3.png',
 'assets/bosses/boss-07-prism-warden-phase1-granular-16frame-alpha-v3.png',
 'assets/bosses/boss-07-prism-warden-phase2-granular-16frame-alpha-v3.png'
];
// These are actual decoded native 96px patches, not approximations of Canvas
// resampling. This isolates the deterministic palette algorithm from graphics.
for(const asset of assets){const image=pngMaterial(asset,true),cellW=image.width/4,cellH=image.height/4;for(const frame of[0,3,5,10,15])for(const center of[[.33,.38],[.5,.5],[.62,.69]]){
 const data=new Uint8ClampedArray(N*N*4),sx=Math.floor((frame%4)*cellW+center[0]*cellW-N/2),sy=Math.floor(Math.floor(frame/4)*cellH+center[1]*cellH-N/2);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const px=sx+x,py=sy+y;if(px>=0&&px<image.width&&py>=0&&py<image.height)data.set(image.rgba.subarray((py*image.width+px)*4,(py*image.width+px)*4+4),(y*N+x)*4)}inputs.push({name:asset+' frame'+frame+' patch'+center.join('/'),data,native:true});
}}
const options=[{}, {hue:0,hueSpread:40},{hue:120,hueSpread:45},{hue:188,hueSpread:22},{hue:270,hueSpread:45},{hue:345,hueSpread:42,lowLight:true},{lowLight:true}];
let cases=0,bytes=0,retained=0;const start=performance.now();
for(const input of inputs)for(const config of options){const before=input.data.slice(),a=variants.baseline(input.data,N,N,config);assert.deepEqual(input.data,before,'Baseline input mutation');for(const variant of['direct','candidate']){const b=variants[variant](input.data,N,N,config);for(const key of['weights','sealed','hot','emission']){assert.deepEqual(b[key],a[key],input.name+' '+JSON.stringify(config)+' '+variant+' '+key);bytes+=a[key].byteLength}assert.deepEqual(input.data,before,'Candidate input mutation');cases++}retained+=a.weights.reduce((n,v)=>n+!!v,0)}
console.log(`PASS ${cases} exact palette comparisons from ${inputs.length} RGBA patches; ${bytes} layer bytes compared.`);
const compareMs=performance.now()-start;
const benchInputs=[...inputs.filter(x=>x.native).filter((x,i)=>i%9===0),inputs.find(x=>x.name==='solid-red'),inputs.find(x=>x.name==='low-light-purple')],config={hue:120,hueSpread:45,lowLight:true};
let checksum=0;function batch(fn){const began=performance.now();for(const input of benchInputs){const v=fn(input.data,N,N,config);checksum^=v.weights[333]}return performance.now()-began}
for(let i=0;i<12;i++)for(const key of Object.keys(variants))batch(variants[key]);
const timings={baseline:[],direct:[],candidate:[]};for(let round=0;round<48;round++)for(const key of(round%2?['baseline','direct','candidate']:['candidate','direct','baseline']))timings[key].push(batch(variants[key]));
const quantile=(a,p)=>{const b=a.slice().sort((x,y)=>x-y);return +b[Math.floor((b.length-1)*p)].toFixed(3)},stats=Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,{medianMs:quantile(v,.5),p95Ms:quantile(v,.95),batches:v.length,patchesPerBatch:benchInputs.length}]));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),report={sourceSha256:hash(fs.readFileSync(path.join(root,'game.js'))),baselineSha256:hash(fs.readFileSync(path.join(root,baselinePath))),productionVerified:verifyCurrent,candidateImplementation:verifyCurrent?'Actual function extracted from current production game.js; helpers asserted identical to baseline.':'Proposed in-memory replacement; production is unchanged.',passed:cases,failed:0,inputPatches:inputs.length,nativePatches:inputs.filter(x=>x.native).length,bytesCompared:bytes,retainedTexelsAcrossBaselineCases:retained,comparisonMs:+compareMs.toFixed(3),timings:stats,checksum,changes:changes.map(([before,after])=>({before,after})),limits:['Palette algorithm only; no Canvas readback, uploads, drawing, whole-frame time or FPS measurement.','Actual PNG patches are exact decoded96x96rectangles, separate from browser resampling.','Baseline and candidate use identical function support/Float32 intermediates and input options.','Twelve warmup batches and48 alternating-order measured batches per variant; timings belong to this Node/V8 process.','No production files or real pilot data changed by this script.']};
const reportPath=path.join(root,'artifacts/palette-preparation-v165-verification.json'),proposalPath=path.join(root,'artifacts/palette-preparation-v165-proposal.json');
if(verifyCurrent&&fs.existsSync(reportPath)&&!fs.existsSync(proposalPath)&&!JSON.parse(fs.readFileSync(reportPath,'utf8')).productionVerified)fs.copyFileSync(reportPath,proposalPath);
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(stats));
