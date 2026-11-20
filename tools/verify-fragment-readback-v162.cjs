#!/usr/bin/env node
'use strict';
// Native helper/contracts and patterned raster origins in disposable VM storage.
// Real prepared-PNG pixel equivalence is a separate browser/roster check.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs'),sourceBytes=fs.readFileSync(path.join(root,'game.js')),source=sourceBytes.toString('utf8');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
 captureNativePartRaster,
 setCaptureBody(fn){captureNativeFractureBody=fn},
 get captureBody(){return captureNativeFractureBody},
 auditPartCapture(e,profile,frame){const prior=nativeSpritePartCapture,flash=e.hitFlash;nativeSpritePartCapture=profile.groupId;nativeSpriteUnavailable=false;e.hitFlash=0;try{return captureNativePartRaster(()=>captureNativeFractureBody(e,()=>withModularSpritePaint(e,()=>paintNativeFractureBody(e,frame)),frame))}finally{nativeSpritePartCapture=prior;e.hitFlash=flash}},
`);
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);const{createGame}=mod.exports;
const results=[],plain=v=>JSON.parse(JSON.stringify(v)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`),full={x:0,y:0,w:1024,h:1024};
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function fixture(){const g=createGame({ruleset:'streamlined-v1'}),a=g.api,c=a.fractureContext,image={width:20,height:10,ready:true};c.resetTransform();c.filter='none';c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;return{g,a,c,image,capture:fn=>a.captureNativePartRaster(fn)}}
function bounds(f,fn){return plain(f.capture(()=>{fn();return true}).bounds)}
check('all three drawImage overloads use destination dimensions rather than source crop coordinates',()=>{
 const f=fixture(),{c,image}=f;assert.deepEqual(bounds(f,()=>c.drawImage(image,40,55)),{x:36,y:51,w:28,h:18});assert.deepEqual(bounds(f,()=>c.drawImage(image,80,60,30,40)),{x:76,y:56,w:38,h:48});assert.deepEqual(bounds(f,()=>c.drawImage(image,1000,2000,3,4,80,60,30,40)),{x:76,y:56,w:38,h:48});
});
check('native pixel transforms include scale, translation, rotation, shear and negative destination dimensions',()=>{
 const f=fixture(),{c,image}=f;c.setTransform(2,0,0,3,100,200);assert.deepEqual(bounds(f,()=>c.drawImage(image,-10,-20,20,40)),{x:76,y:136,w:48,h:128});c.setTransform(0,2,-3,0,500,100);assert.deepEqual(bounds(f,()=>c.drawImage(image,10,20,30,40)),{x:316,y:116,w:128,h:68});c.setTransform(-1,.5,.25,2,600,10);assert.deepEqual(bounds(f,()=>c.drawImage(image,-20,30,-40,-25)),{x:617,y:0,w:55,h:64});
});
check('multiple draws union correctly and guards clamp to actual buffer edges',()=>{
 const f=fixture(),{c,image}=f;assert.deepEqual(bounds(f,()=>{c.drawImage(image,20,30,10,10);c.drawImage(image,200,150,5,25)}),{x:16,y:26,w:193,h:153});assert.deepEqual(bounds(f,()=>c.drawImage(image,-6,-7,20,20)),{x:0,y:0,w:18,h:17});assert.deepEqual(bounds(f,()=>c.drawImage(image,1018,1019,20,20)),{x:1014,y:1015,w:10,h:9});
});
check('empty, zero-size, wholly off-buffer or invalid geometry falls back to the old full readback',()=>{
 const f=fixture(),{c,image}=f;assert.deepEqual(plain(f.capture(()=>true).bounds),full);assert.deepEqual(bounds(f,()=>c.drawImage(image,40,55,0,10)),full);assert.deepEqual(bounds(f,()=>c.drawImage(image,2000,2000,10,10)),full);
 const draw=c.drawImage,transform=c.getTransform;c.drawImage=()=>{};assert.deepEqual(bounds(f,()=>c.drawImage(image,NaN,1,20,10)),full);c.drawImage=draw;c.getTransform=()=>({a:NaN,b:0,c:0,d:1,e:0,f:0});assert.deepEqual(bounds(f,()=>c.drawImage(image,1,1,20,10)),full);c.getTransform=transform;
});
check('non-spatial color filters stay bounded while spatial/unknown filters and shadows retain full fallback',()=>{
 const f=fixture(),{c,image}=f;for(const filter of['none','brightness(1.2) saturate(.8)','hue-rotate(30deg) contrast(1.1)','opacity(.2) grayscale(.5) sepia(.2) invert(.1)']){c.filter=filter;assert.notDeepEqual(bounds(f,()=>c.drawImage(image,40,55)),full,filter)}
 for(const filter of['blur(1px)','drop-shadow(3px 0px 1px red)','url(#private-filter)','unknown(1)']){c.filter=filter;assert.deepEqual(bounds(f,()=>c.drawImage(image,40,55)),full,filter)}c.filter='none';for(const[key,value]of[['shadowBlur',.1],['shadowOffsetX',2],['shadowOffsetY',-2]]){c[key]=value;assert.deepEqual(bounds(f,()=>c.drawImage(image,40,55)),full,key);c[key]=0}
});
check('every supported non-image raster writer invalidates the bounded region',()=>{
 const f=fixture(),{c,image}=f;for(const name of['fill','stroke','fillRect','strokeRect','fillText','strokeText','putImageData']){const args=name.endsWith('Rect')?[1,2,3,4]:name.endsWith('Text')?['x',1,2]:name==='putImageData'?[{data:new Uint8ClampedArray(4),width:1,height:1},0,0]:[];assert.deepEqual(bounds(f,()=>{c.drawImage(image,40,55);c[name](...args)}),full,name)}
});
check('clearRect is harmless, rendered result is preserved, and wrappers restore on success and exceptions',()=>{
 const f=fixture(),{c,image}=f,names=['drawImage','fill','stroke','fillRect','strokeRect','fillText','strokeText','putImageData'],prior=Object.fromEntries(names.map(n=>[n,c[n]]));const result=f.capture(()=>{c.clearRect(0,0,1024,1024);c.drawImage(image,40,55);return false});assert.equal(result.rendered,false);assert.deepEqual(plain(result.bounds),{x:36,y:51,w:28,h:18});for(const name of names)assert.equal(c[name],prior[name],name);const failure=new Error('private capture failure');assert.throws(()=>f.capture(()=>{c.drawImage(image,40,55);throw failure}),error=>error===failure);for(const name of names)assert.equal(c[name],prior[name],name);
});
check('nested capture restores the outer wrapper and its complete draw union',()=>{
 const f=fixture(),{c,image}=f;const outer=f.capture(()=>{c.drawImage(image,10,10,20,20);const inner=f.capture(()=>{c.drawImage(image,300,400,10,10);return true});assert.deepEqual(plain(inner.bounds),{x:296,y:396,w:18,h:18});c.drawImage(image,100,200,10,10);return true});assert.deepEqual(plain(outer.bounds),{x:6,y:6,w:308,h:408});
});
check('real articulated, shifted, clipped and epic captures enclose every actual prepared draw destination',()=>{
 const specs=[['mini',0,1],['mini',8,1],['main',1,2],['main',2,2],['main',3,1],['main',6,2],['main',9,2],['epic',0,4],['epic',1,4]];let cases=0,draws=0,maxFraction=0;
 for(const[family,index,phase]of specs){const g=createGame(),a=g.api;if(family==='mini')a.startMiniBossLab(index);else if(family==='main')a.startBossLab(index);else a.startEpicBossLab(index);const e=family==='mini'?a.miniBoss:a.boss;Object.assign(e,{phase,x:720,y:245,intro:0,hitFlash:.2,weakOpen:true,coreAperture:1,visualAngle:.06,mawRecoil:.9,helixRecoil:.9,prismRecoil:.9,omegaHeartRecoil:.9});
  const groups=new Map();for(const node of a.activeWeakNodes(e)){const profile=a.nativeFractureBaseProfile(e,node);if(profile)groups.set(profile.groupId,profile)}
  for(const clock of[.01,.61,1.9,3.8])for(const profile of groups.values()){e.clock=clock;a.fractureContext.trace=[];const result=a.auditPartCapture(e,profile,Math.floor(clock*4)%16),b=result.bounds;assert.equal(result.rendered,true,`${family}${index}/${phase}`);assert.ok(b.w*b.h<1024*1024,'Actual prepared part should use bounded readback');maxFraction=Math.max(maxFraction,b.w*b.h/(1024*1024));const events=a.fractureContext.trace.filter(t=>t.op==='drawImage');assert.ok(events.length,'Actual native art drew no prepared image');for(const event of events){const nums=event.args.slice(1),rect=nums.length===8?nums.slice(4):nums.length===4?nums:[...nums,event.image.naturalWidth||event.image.width,event.image.naturalHeight||event.image.height],[x,y,w,h]=rect,[aa,bb,cc,dd,ee,ff]=event.matrix;for(const[px,py]of[[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){const tx=aa*px+cc*py+ee,ty=bb*px+dd*py+ff;if(tx>=0&&tx<=1024&&ty>=0&&ty<=1024){assert.ok(tx>=b.x&&tx<=b.x+b.w&&ty>=b.y&&ty<=b.y+b.h,'Prepared corner escaped crop')}}draws++}cases++}
 }return{nativeCaptures:cases,preparedDraws:draws,maxBufferFraction:maxFraction};
});
check('offset readback preserves old alpha threshold, final crop padding, fragment center and killing world pose',()=>{
 const f=fixture(),{g,a,c,image}=f;a.startMiniBossLab(0);const e=a.miniBoss;Object.assign(e,{intro:0,x:720,y:245,clock:.61,weakOpen:true,hitFlash:.3});const node=a.activeWeakNodes(e).find(n=>a.nativeFractureBaseProfile(e,n)),profile=a.nativeFractureBaseProfile(e,node),index=a.activeWeakNodes(e).indexOf(node),pose={x:720,y:245,scaleX:1.1,scaleY:.9,angle:.2};
 const original=a.captureBody,read=c.getImageData,reads=[];a.setCaptureBody(()=>{c.resetTransform();c.drawImage(image,200,352,12,12);return true});c.getImageData=(x,y,w,h)=>{reads.push({x,y,w,h});const data=new Uint8ClampedArray(w*h*4);for(const[px,py,alpha]of[[198,350,24],[203,357,255],[205,358,25],[208,362,255]])if(px>=x&&px<x+w&&py>=y&&py<y+h)data[((py-y)*w+(px-x))*4+3]=alpha;return{data,width:w,height:h}};
 try{assert.equal(a.emitNativeSpritePart(e,e,index,profile,pose),true);assert.deepEqual(reads,[{x:196,y:348,w:20,h:20}]);const fragment=a.bossFragments.at(-1),chunk=fragment.nativeChunk;assert.equal(chunk.canvas.width,10);assert.equal(chunk.canvas.height,10);assert.deepEqual(plain(chunk.localBounds),{x:-155.5,y:-78.5,w:5,h:5});assert.deepEqual(plain(chunk.localCenter),{x:-153,y:-76});near(fragment.x,720+(-153*1.1)*Math.cos(.2)-(-76*.9)*Math.sin(.2));near(fragment.y,245+(-153*1.1)*Math.sin(.2)+(-76*.9)*Math.cos(.2));assert.equal(fragment.rot,.2);assert.equal(e.hitFlash,.3)}finally{a.setCaptureBody(original);c.getImageData=read}
});
check('transparent or threshold-only samples cannot mark a native assembly removed or emit a fake fragment',()=>{
 const f=fixture(),{a,c,image}=f;a.startMiniBossLab(0);const e=a.miniBoss,node=a.activeWeakNodes(e).find(n=>a.nativeFractureBaseProfile(e,n)),profile=a.nativeFractureBaseProfile(e,node),pose={x:720,y:245,scaleX:1,scaleY:1,angle:0};a.setCaptureBody(()=>{c.resetTransform();c.drawImage(image,200,352,12,12);return true});for(const alpha of[0,24]){c.getImageData=(_x,_y,w,h)=>{const data=new Uint8ClampedArray(w*h*4);for(let p=3;p<data.length;p+=4)data[p]=alpha;return{data}};assert.equal(a.emitNativeSpritePart(e,e,0,profile,pose),false);assert.equal(a.bossFragments.length,0);assert.equal(Object.keys(e.nativeSeveredGroups||{}).length,0)}
});
const failed=results.filter(r=>!r.passed).length,report={sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),passed:results.length-failed,failed,results,limits:'Native capture helper and actual draw transforms in mocked Canvas2D plus explicit patterned alpha buffers. This verifies contracts and origin math, not raster equivalence of real PNGs or GPU timing.'};fs.writeFileSync(path.join(root,'artifacts/fragment-readback-v162-verification.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(root,'artifacts/fragment-readback-v162-verification.txt'),results.map(r=>(r.passed?'PASS ':'FAIL ')+r.name+(r.error?'\n'+r.error:'')).join('\n')+'\n');console.log(`${report.passed} fragment-readback groups passed, ${failed} failed`);if(failed)process.exitCode=1;
