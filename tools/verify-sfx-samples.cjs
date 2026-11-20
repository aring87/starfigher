#!/usr/bin/env node
'use strict';
// Real sample-bank behavior against recording Web Audio nodes, without opening
// an audio device or downloading data. Playback quality needs a listening pass.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Samples=require('../sfx-samples.js');
const keys=Object.keys(Samples.manifest);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
function fixture({fetcher,decoder,callback=false}={}){
  const requests=[],decodes=[],nodes=[];
  const bank=Samples.create({fetcher:fetcher||((url)=>{
    requests.push(url);
    return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new Uint8Array([keys.indexOf(path.basename(url,'.wav'))+1,2,3,4]).buffer)});
  })});
  const context={currentTime:4,state:'running',decodeAudioData(bytes,success,failure){
    decodes.push(bytes);
    if(decoder)return decoder(bytes,success,failure);
    const buffer={duration:.2,id:new Uint8Array(bytes)[0]};
    if(callback){queueMicrotask(()=>success(buffer));return undefined}
    return Promise.resolve(buffer);
  },createBufferSource(){return make('source')},createGain(){return make('gain')}};
  function make(kind){
    const node={kind,context,connections:[],starts:[],stops:[],disconnects:0,gain:{value:1,setValueAtTime(value,time){this.value=value;this.time=time}},
      connect(output){this.connections.push(output);return output},disconnect(){this.disconnects++},start(time){this.starts.push(time)},stop(time){this.stops.push(time)}};
    nodes.push(node);
    return node;
  }
  const output={context,name:'caller bus'};
  return{bank,context,output,requests,decodes,nodes,sources:()=>nodes.filter(node=>node.kind==='source')};
}
let passed=0;
async function test(name,work){await work();passed++;console.log('PASS '+name)}
(async()=>{
  await test('manifest is fixed, local and available in the browser without AudioContext',async()=>{
    assert.equal(keys.length,7);
    for(const key of keys)assert.equal(Samples.manifest[key],`assets/audio/sfx/${key}.wav`);
    assert.ok(Object.isFrozen(Samples.manifest));
    let contextCreations=0;
    const sandbox={window:{AudioContext(){contextCreations++;throw Error('No device allowed')}},Promise,Map,Set,WeakMap};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','sfx-samples.js'),'utf8'),sandbox);
    const bank=sandbox.window.StarfighterSfxSamples.create({fetcher:null});
    assert.equal(await bank.prefetch(),false);
    assert.equal(await bank.prepare(null),false);
    assert.equal(bank.play('hull-hit'),false);
    assert.equal(contextCreations,0);
  });
  await test('startup caches seven encoded requests and defers decoding until a caller context exists',async()=>{
    const f=fixture();
    assert.equal(await f.bank.prefetch(),true);
    assert.equal(f.requests.length,7);
    assert.equal(f.decodes.length,0);
    assert.equal(f.nodes.length,0);
    await Promise.all([f.bank.prefetch(),f.bank.prepare(f.context),f.bank.prepare(f.context)]);
    assert.equal(f.requests.length,7);
    assert.equal(f.decodes.length,7);
    await f.bank.prepare(f.context);
    assert.equal(f.decodes.length,7,'Decode only once per asset and context');
  });
  await test('a loading or decoding cue falls back immediately and never replays later',async()=>{
    const bytes=deferred(),decoded=deferred();
    const f=fixture({fetcher:()=>bytes.promise,decoder:()=>decoded.promise});
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),false);
    assert.equal(f.sources().length,0);
    bytes.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new Uint8Array([1,2]).buffer)});
    await f.bank.prefetch();
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),false);
    decoded.resolve({duration:.2});
    await f.bank.prepare(f.context);
    assert.equal(f.sources().length,0,'Completing decode never plays a past event');
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),true);
    assert.equal(f.sources().length,1);
  });
  await test('ready samples use caller routing, per-cue gain and ended cleanup',async()=>{
    const f=fixture();await f.bank.prepare(f.context);
    assert.equal(f.bank.play('core-hit',{context:f.context,output:f.output,gain:.37}),true);
    const [source,gain]=f.nodes;
    assert.equal(source.buffer.id,5);
    assert.equal(source.connections[0],gain);
    assert.equal(gain.connections[0],f.output);
    assert.equal(gain.gain.value,.37);
    assert.deepEqual(source.starts,[4]);
    source.onended();
    assert.equal(source.disconnects,1);
    assert.equal(gain.disconnects,1);
    f.bank.stopAll();assert.equal(source.stops.length,0,'Ended nodes are no longer active');
  });
  await test('per-key caps retire oldest nodes and stopAll cleans every remaining voice',async()=>{
    const f=fixture();await f.bank.prepare(f.context);
    for(let i=0;i<12;i++)assert.equal(f.bank.play('force-block',{context:f.context,output:f.output}),true);
    const routine=f.sources();
    assert.equal(routine.filter(source=>!source.stops.length).length,2);
    assert.ok(routine.slice(0,-2).every(source=>source.stops.length===1&&source.disconnects===1&&source.onended===null));
    for(let i=0;i<7;i++)f.bank.play('core-break',{context:f.context,output:f.output});
    const breaks=f.sources().slice(12);
    assert.equal(breaks.filter(source=>!source.stops.length).length,3);
    f.bank.stopAll();f.bank.stopAll();
    assert.ok(f.sources().every(source=>source.stops.length===1&&source.disconnects===1));
    assert.ok(f.nodes.filter(node=>node.kind==='gain').every(node=>node.disconnects===1));
  });
  await test('fetch and decode failures remain per asset and never reject preparation',async()=>{
    const urls=[];
    const f=fixture({fetcher:url=>{
      urls.push(url);
      if(url.includes('hull-hit'))throw Error('offline');
      if(url.includes('shield-hit'))return Promise.resolve({ok:false,arrayBuffer(){throw Error('404')}});
      return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new Uint8Array([url.includes('armor-hit')?9:1,2]).buffer)});
    },decoder:bytes=>new Uint8Array(bytes)[0]===9?Promise.reject(Error('bad WAV')):Promise.resolve({duration:.2})});
    assert.equal(await f.bank.prepare(f.context),true);
    for(const key of ['hull-hit','shield-hit','armor-hit'])assert.equal(f.bank.play(key,{context:f.context,output:f.output}),false);
    assert.equal(f.bank.play('pickup-confirm',{context:f.context,output:f.output}),true);
    const count=f.decodes.length;await f.bank.prepare(f.context);
    assert.equal(urls.length,7);
    assert.equal(f.decodes.length,count,'Failed assets do not decode repeatedly during combat');
  });
  await test('callback decoders work and new contexts decode preserved encoded bytes once',async()=>{
    const f=fixture({callback:true});await f.bank.prepare(f.context);
    const other={...f.context};await f.bank.prepare(other);
    assert.equal(f.requests.length,7);
    assert.equal(f.decodes.length,14);
    assert.notEqual(f.decodes[0],f.decodes[7]);
    assert.deepEqual(new Uint8Array(f.decodes[0]),new Uint8Array(f.decodes[7]));
    assert.equal(f.bank.play('hull-hit',{context:other,output:{context:other}}),true);
  });
  await test('suspended, closed, invalid and zero-gain requests create no queued nodes',async()=>{
    const f=fixture();await f.bank.prepare(f.context);
    for(const state of ['suspended','closed','interrupted']){
      f.context.state=state;
      assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),false);
    }
    f.context.state='running';
    assert.equal(f.bank.play('unknown',{context:f.context,output:f.output}),false);
    assert.equal(f.bank.play('hull-hit',{context:f.context}),false);
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:{context:{}}}),false);
    for(const gain of [0,-1,NaN,Infinity])assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output,gain}),false);
    assert.equal(f.nodes.length,0);
    f.bank.stopAll();
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),true,'Mute/cooldowns remain the caller responsibility');
  });
  await test('failed node creation or start falls back and disconnects partial graphs',async()=>{
    const f=fixture();await f.bank.prepare(f.context);
    const create=f.context.createBufferSource;
    f.context.createBufferSource=()=>{const source=create();source.start=()=>{throw Error('device closed')};return source};
    assert.equal(f.bank.play('hull-hit',{context:f.context,output:f.output}),false);
    assert.ok(f.nodes.every(node=>node.disconnects===1));
    f.bank.stopAll();assert.equal(f.sources()[0].stops.length,1);
  });
  console.log(`${passed} sample-bank checks passed, 0 failed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
