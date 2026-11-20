#!/usr/bin/env node
'use strict';
// Exercise the actual production SFX class with the actual sample bank and
// shipped WAV bytes. Recording nodes prove scheduling/routing, not audition quality.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),Samples=require('../sfx-samples.js');
const assetReport=JSON.parse(fs.readFileSync(path.join(root,'artifacts/game-sfx-assets-v151.json'),'utf8'));
const keys=Object.keys(Samples.manifest),files=new Map();
for(const key of keys)files.set(key,fs.readFileSync(path.join(root,Samples.manifest[key])));

function decodeWav(bytes){
  const data=Buffer.from(bytes);
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
  let format,pcm;
  for(let at=12;at+8<=data.length;){
    const kind=data.toString('ascii',at,at+4),size=data.readUInt32LE(at+4),end=at+8+size;
    assert.ok(end<=data.length,'WAV chunk fits its file');
    if(kind==='fmt ')format=data.subarray(at+8,end);
    if(kind==='data')pcm=data.subarray(at+8,end);
    at=end+(size%2);
  }
  assert.ok(format&&pcm,'WAV format and PCM chunks exist');
  assert.equal(format.readUInt16LE(0),1,'Shipped sample is PCM');assert.equal(format.readUInt16LE(14),16);
  const numberOfChannels=format.readUInt16LE(2),sampleRate=format.readUInt32LE(4),blockAlign=format.readUInt16LE(12);
  assert.equal(blockAlign,numberOfChannels*2);
  const length=pcm.length/blockAlign;
  assert.ok(Number.isInteger(length)&&length>0);
  const key=keys.find(name=>files.get(name).equals(data));assert.ok(key,'Decoded bytes came from a shipped sample');
  return{key,numberOfChannels,sampleRate,length,duration:length/sampleRate};
}

// Reuse the old suite's class extraction and graph fixture without running its
// tests or modifying its source. Only the mock gets decoding and disconnection.
const clarityPath=path.join(__dirname,'verify-audio-clarity.cjs');
const clarity=fs.readFileSync(clarityPath,'utf8'),fixtureEnd=clarity.indexOf('let passed=0;');
assert.ok(fixtureEnd>0,'Native audio suite exposes its fixture before its tests');
function replaceOnce(source,before,after){assert.ok(source.includes(before),'Fixture marker exists: '+before);return source.replace(before,after)}
let fixtureSource=clarity.slice(0,fixtureEnd);
fixtureSource=replaceOnce(fixtureSource,'function fixture(){','function fixture(sampleAPI){');
fixtureSource=replaceOnce(fixtureSource,'window:{AudioContext}','window:{AudioContext,StarfighterSfxSamples:sampleAPI}');
fixtureSource=replaceOnce(fixtureSource,"const node=new Node(kind);this.nodes.push(node);return node","const node=new Node(kind);node.context=this;this.nodes.push(node);return node");
fixtureSource=replaceOnce(fixtureSource,"resume(){this.state='running';return Promise.resolve()}","decodeAudioData(bytes){this.decodeCount=(this.decodeCount||0)+1;return Promise.resolve(decodeWav(bytes))}\n    resume(){this.state='running';return Promise.resolve()}");
const shared={exports:{}};
vm.runInNewContext(fixtureSource+'\nNode.prototype.disconnect=function(){this.disconnects=(this.disconnects||0)+1};\nmodule.exports={fixture};',{
  require,module:shared,__dirname,__filename:clarityPath,decodeWav,console,
},{filename:clarityPath});
const fixture=shared.exports.fixture;
const response=url=>{
  const key=keys.find(name=>Samples.manifest[name]===url);assert.ok(key,'Only local manifest paths are requested');
  const bytes=files.get(key);
  return{ok:true,arrayBuffer:()=>Promise.resolve(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};
};
function makeFixture(fetcher=response){
  const requests=[];
  const f=fixture({create:()=>Samples.create({fetcher:url=>{requests.push(url);return fetcher(url)}})});
  return Object.assign(f,{requests});
}
async function ready(){const f=makeFixture();f.sfx.init();assert.equal(await f.sfx.samples.prepare(f.sfx.c),true);return f}
const sampleNodes=c=>c.nodes.filter(node=>node.kind==='buffer'&&node.buffer?.key);
const oscillators=c=>c.nodes.filter(node=>node.kind==='oscillator');
const outputOf=source=>source.connections[0].connections[0];
const activeSamples=c=>sampleNodes(c).filter(node=>node.onended&&!node.stops.length);
const mapped=[
  ['armorHit','armor-hit',.045,'detail'],['coreHit','core-hit',.065,'detail'],
  ['podBlock','force-block',.045,'detail'],['shield','shield-hit',.115,'master'],
  ['hurt','hull-hit',.15,'master'],['weakBreak','core-break',.16,'master'],
  ['tentacleBreak','core-break',.16,'master'],['pickup','pickup-confirm',.11,'detail'],
];
const deferred=()=>{let resolve;return{promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)}};
let passed=0;
async function test(name,work){await work();passed++;console.log('PASS '+name)}

(async()=>{
  await test('all seven shipped WAVs match the edit report and prefetch defers device/decode work',async()=>{
    assert.equal(keys.length,7);assert.equal(Object.keys(assetReport.assets).length,7);
    for(const key of keys){
      const bytes=files.get(key),record=assetReport.assets[key],decoded=decodeWav(bytes);
      assert.equal(record.output,Samples.manifest[key]);assert.equal(record.bytes,bytes.length);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
      assert.equal(decoded.numberOfChannels,1);assert.equal(decoded.sampleRate,48000);
      assert.equal(decoded.length,record.outputInfo.frames);assert.equal(decoded.duration,record.outputInfo.duration);
    }
    const f=makeFixture();assert.equal(await f.sfx.samples.prefetch(),true);
    assert.equal(f.contexts.length,0);assert.equal(f.requests.length,7);
    f.sfx.init();await f.sfx.samples.prepare(f.sfx.c);f.sfx.init();await f.sfx.samples.prepare(f.sfx.c);
    assert.equal(f.requests.length,7);assert.equal(f.sfx.c.decodeCount,7,'Decode once per asset/context');
  });

  await test('each ready production cue schedules one correct sample with no synth layer',async()=>{
    for(const[method,key,gain,route]of mapped){
      const{sfx}=await ready(),before=sfx.c.nodes.length;sfx[method](4);
      const fresh=sfx.c.nodes.slice(before),sources=fresh.filter(node=>node.kind==='buffer');
      assert.equal(sources.length,1,method+' has exactly one sample source');assert.equal(sources[0].buffer.key,key);
      assert.equal(fresh.filter(node=>node.kind==='oscillator').length,0,method+' does not layer its old synth');
      assert.equal(sources[0].connections[0].gain.value,gain);assert.equal(outputOf(sources[0]),sfx[route]);
      assert.equal(sources[0].starts.length,1);assert.equal(sfx.cueOutput,null);
    }
  });

  await test('routine cooldowns survive sample replacement and dense bursts respect voice caps',async()=>{
    for(const[method,key,interval]of[['armorHit','armor-hit',.07],['coreHit','core-hit',.06],['podBlock','force-block',.09]]){
      const{sfx}=await ready();sfx[method]();const count=sfx.c.nodes.length;
      for(let i=0;i<40;i++)sfx[method]();assert.equal(sfx.c.nodes.length,count,method+' rejects same-time contacts');
      sfx.c.currentTime=interval-.001;sfx[method]();assert.equal(sfx.c.nodes.length,count);
      for(let i=1;i<=7;i++){sfx.c.currentTime=i*(interval+.001);sfx[method]()}
      assert.equal(sampleNodes(sfx.c).length,8);assert.equal(activeSamples(sfx.c).length,Samples.voiceLimits[key]);
      assert.ok(sampleNodes(sfx.c).slice(0,-2).every(node=>node.stops.length===1&&node.disconnects===1));
    }
    const{sfx}=await ready();for(let i=0;i<16;i++)sfx[i%2?'weakBreak':'tentacleBreak']();
    assert.equal(activeSamples(sfx.c).length,3,'Both destruction methods share the core-break cap');
    const last=activeSamples(sfx.c).at(-1);last.onended();assert.equal(last.disconnects,1);
    sfx.setMuted(true);assert.equal(activeSamples(sfx.c).length,0);
  });

  await test('foreground samples retain overlapping ducks while preserving the existing charge loop',async()=>{
    const{sfx}=await ready();sfx.startCharge();const charge=sfx.chargeNodes;
    sfx.hurt();assert.equal(sfx.focusUntil,.36);
    sfx.c.currentTime=.04;sfx.shield();assert.equal(sfx.focusUntil,.36);
    sfx.c.currentTime=.3;sfx.weakBreak();assert.equal(sfx.focusUntil,.54);
    sfx.c.currentTime=.4;sfx.tentacleBreak();assert.equal(sfx.focusUntil,.66);
    assert.equal(sfx.detail.gain.events.at(-1).time,.66);
    assert.ok(sampleNodes(sfx.c).every(node=>outputOf(node)===sfx.master));
    assert.equal(sfx.chargeNodes,charge);assert.equal(oscillators(sfx.c).length,2);
    assert.equal(charge.osc.stops.length,0);assert.equal(charge.gain.connections[0],sfx.detail);
    sfx.updateCharge(.8);assert.ok(charge.osc.frequency.value>72);
    sfx.pickup(2);assert.equal(outputOf(sampleNodes(sfx.c).at(-1)),sfx.detail);assert.equal(sfx.cueOutput,null);
  });

  await test('mute and visibility stop samples, block new voices and retain the chosen mixer level',async()=>{
    const{sfx,sandbox}=await ready();sfx.setVolume(.4);sfx.hurt();sfx.pickup();sfx.startCharge();
    const playing=sampleNodes(sfx.c);sfx.setMuted(true);const count=sfx.c.nodes.length;
    assert.ok(playing.every(node=>node.stops.length===1&&node.disconnects===1));assert.equal(sfx.chargeNodes,null);
    for(const[method]of mapped)sfx[method]();assert.equal(sfx.c.nodes.length,count);
    sfx.setVolume(.23);assert.equal(sfx.master.gain.events.at(-1).value,0);
    sfx.setMuted(false);assert.equal(sfx.master.gain.events.at(-1).value,.23);sfx.hurt();
    sandbox.document.hidden=true;sfx.setMuted(true);sfx.setVolume(.9);
    assert.equal(sfx.master.gain.events.at(-1).value,0);const hiddenCount=sfx.c.nodes.length;
    for(const[method]of mapped)sfx[method]();assert.equal(sfx.c.nodes.length,hiddenCount);
    sandbox.document.hidden=false;sfx.setMuted(false);assert.equal(sfx.master.gain.events.at(-1).value,.9);
    for(const mode of['muted','hidden','silent']){
      const f=makeFixture();if(mode==='hidden')f.sandbox.document.hidden=true;else if(mode==='muted')f.sandbox.muted=true;else f.sfx.setMuted(true);
      for(const[method]of mapped)f.sfx[method]();await f.sfx.samples.prefetch();assert.equal(f.contexts.length,0,mode+' opens no device');
    }
  });

  await test('missing, loading and failed sample data use immediate synth fallback without late replay',async()=>{
    const absent=fixture();for(const[method]of mapped){const before=oscillators(absent.sfx.c||{nodes:[]}).length;absent.sfx[method]();assert.ok(oscillators(absent.sfx.c).length>before);absent.sfx.c.currentTime++}
    const gate=deferred(),loading=makeFixture(url=>gate.promise.then(()=>response(url)));
    loading.sfx.hurt();assert.ok(oscillators(loading.sfx.c).length>0);assert.equal(sampleNodes(loading.sfx.c).length,0);
    const before=loading.sfx.c.nodes.length;gate.resolve();await loading.sfx.samples.prepare(loading.sfx.c);
    assert.equal(loading.sfx.c.nodes.length,before,'Completing load never replays an earlier cue');
    const oscCount=oscillators(loading.sfx.c).length;loading.sfx.c.currentTime=1;loading.sfx.hurt();
    assert.equal(sampleNodes(loading.sfx.c).length,1);assert.equal(oscillators(loading.sfx.c).length,oscCount);
    for(const mode of['fetch','decode']){
      const f=makeFixture(mode==='fetch'?()=>Promise.reject(Error('offline')):response);f.sfx.init();
      if(mode==='decode')f.sfx.c.decodeAudioData=()=>Promise.reject(Error('invalid WAV'));
      assert.equal(await f.sfx.samples.prepare(f.sfx.c),false);f.sfx.hurt();
      assert.ok(oscillators(f.sfx.c).length>0);assert.equal(sampleNodes(f.sfx.c).length,0);
    }
    const partial=makeFixture(url=>url===Samples.manifest['armor-hit']?{ok:false}:response(url));
    partial.sfx.init();await partial.sfx.samples.prepare(partial.sfx.c);partial.sfx.armorHit();partial.sfx.coreHit();
    assert.equal(sampleNodes(partial.sfx.c).length,1);assert.equal(sampleNodes(partial.sfx.c)[0].buffer.key,'core-hit');
    assert.ok(oscillators(partial.sfx.c).length>0,'One unavailable file preserves its own synth fallback');
  });

  await test('selected volume and limiter remain shared, with rejected resume producing no stale sample',async()=>{
    const{sfx}=await ready();sfx.setVolume(.41);sfx.hurt();
    const source=sampleNodes(sfx.c).at(-1),gain=source.connections[0];
    assert.equal(gain.gain.value,.15);assert.equal(sfx.master.gain.value,.41);
    let node=outputOf(source);const chain=[];
    while(node&&chain.length<8){chain.push(node);node=node.connections[0]}
    assert.equal(chain[0],sfx.master);assert.equal(chain.at(-1),sfx.c.destination);
    const limiter=chain.find(item=>item.kind==='compressor');assert.ok(limiter);assert.equal(limiter.ratio.value,12);
    sfx.setVolume(0);assert.equal(sfx.master.gain.value,0);sfx.setVolume(.41);
    sfx.c.state='suspended';sfx.c.resume=()=>Promise.reject(Error('gesture required'));
    const count=sampleNodes(sfx.c).length;sfx.hurt();await Promise.resolve();await Promise.resolve();
    assert.equal(sampleNodes(sfx.c).length,count,'Suspended context never queues a sampled cue');
    sfx.c.state='running';await Promise.resolve();assert.equal(sampleNodes(sfx.c).length,count);
    sfx.c.currentTime=1;sfx.hurt();assert.equal(sampleNodes(sfx.c).length,count+1);
  });

  await test('native gameplay distinguishes real gear, supplies, exposed cores, armor and damage',async()=>{
    const harnessPath=path.join(__dirname,'verify-game.cjs'),harness=fs.readFileSync(harnessPath,'utf8');
    const marker='\nconst game = createGame();',split=harness.indexOf(marker);assert.ok(split>0);
    let prefix=harness.slice(0,split);
    prefix=replaceOnce(prefix,'globalThis.__gameTest = {','globalThis.__gameTest = {damageBossArmor,');
    const sharedGame={exports:{}};
    vm.runInNewContext(prefix+'\nmodule.exports={createGame};',{
      require,module:sharedGame,__dirname,__filename:harnessPath,console,process,Buffer,URLSearchParams,
    },{filename:harnessPath});
    const{api,storage}=sharedGame.exports.createGame({ruleset:'streamlined-v1'}),heard=[];
    api.sfx.sample=key=>{heard.push(key);return true};api.startMiniBossLab(0);heard.length=0;
    const privateStorage=JSON.stringify([...storage]);
    api.collectGear(api.generateGear(1));assert.deepEqual(heard,['pickup-confirm']);heard.length=0;
    api.collectCombatPickup({type:'missile'});assert.deepEqual(heard,[],'Combat supplies keep their distinct powerup sound');
    const enemy=api.miniBoss;enemy.intro=0;const node=api.activeWeakNodes(enemy)[0];
    api.damageWeakNode(enemy,node,0);assert.deepEqual(heard,[],'Zero damage has no core-hit sample');
    api.damageWeakNode(enemy,node,1);assert.deepEqual(heard,['core-hit']);heard.length=0;
    assert.equal(api.damageBossArmor(enemy,{y:enemy.y,d:1}),true);assert.deepEqual(heard,['armor-hit']);heard.length=0;
    api.damageWeakNode(enemy,node,node.hp+1);assert.deepEqual(heard,['core-break'],'Lethal core damage emits one break, without core-hit');heard.length=0;
    api.player.inv=0;api.player.shield=1;const hp=api.player.hp;api.damage(1);
    assert.equal(api.player.hp,hp);assert.deepEqual(heard,['shield-hit']);heard.length=0;
    api.player.inv=0;api.damage(1);assert.equal(api.player.hp,hp-1);assert.deepEqual(heard,['hull-hit']);heard.length=0;
    api.beginApexArrival();assert.deepEqual(heard,[],'Apex arrival adds no alarm sample');assert.equal(api.bossAudioFade.phase,'out');
    assert.equal(JSON.stringify([...storage]),privateStorage,'Read-only lab events leave private profile storage unchanged');
  });

  console.log(`${passed} sampled SFX integration checks passed, 0 failed.`);
  console.log('Scope: native game/class and bank with shipped WAV bytes and recording nodes; browser decoding and listening are separate checks.');
})().catch(error=>{console.error(error);process.exitCode=1});
