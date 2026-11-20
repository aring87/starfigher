#!/usr/bin/env node
'use strict';
// Exercise the actual production SFX class with a recording Web Audio graph.
// This proves routing and envelopes, not the subjective quality of playback.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const start=source.indexOf('  class SFX{'),end=source.indexOf('  const sfx=new SFX();',start);
assert.ok(start>=0&&end>start,'Native SFX class boundaries exist');
const native=source.slice(start,end);
class Param{
  constructor(){this.value=0;this.events=[]}
  record(kind,value,time,constant){assert.ok(Number.isFinite(value)&&Number.isFinite(time),'Finite Web Audio event');this.events.push({kind,value,time,constant});this.value=value}
  setValueAtTime(v,t){this.record('set',v,t)}
  exponentialRampToValueAtTime(v,t){assert.ok(v>0);this.record('ramp',v,t)}
  setTargetAtTime(v,t,k){assert.ok(k>0);this.record('target',v,t,k)}
  cancelScheduledValues(t){this.events.push({kind:'cancel',time:t})}
}
class Node{
  constructor(kind){this.kind=kind;this.connections=[];this.starts=[];this.stops=[];for(const key of['gain','frequency','Q','threshold','knee','ratio','attack','release'])this[key]=new Param()}
  connect(target){assert.ok(target,'An output must exist');this.connections.push(target);return target}
  start(t=0){this.starts.push(t)}stop(t=0){this.stops.push(t)}
}
function fixture(){
  const contexts=[];
  class AudioContext{
    constructor(){this.nodes=[];this.currentTime=0;this.sampleRate=48000;this.state='running';this.destination=this.make('destination');contexts.push(this)}
    make(kind){const node=new Node(kind);this.nodes.push(node);return node}
    createGain(){return this.make('gain')}createOscillator(){return this.make('oscillator')}createBiquadFilter(){return this.make('filter')}createDynamicsCompressor(){return this.make('compressor')}createBufferSource(){return this.make('buffer')}
    createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData:i=>data[i]}}
    resume(){this.state='running';return Promise.resolve()}
  }
  const sandbox={window:{AudioContext},document:{hidden:false},muted:false,sfxVolume:.82,clamp:(n,a,b)=>Math.min(b,Math.max(a,n)),rand:(a,b)=>(a+b)/2};
  const context=vm.createContext(sandbox);vm.runInContext(native+'\nthis.SFX=SFX;',context,{filename:'native-SFX.js'});
  return{context,sandbox,contexts,sfx:new sandbox.SFX()};
}
let passed=0;
function test(name,work){work();passed++;console.log('PASS '+name)}
const oscillators=c=>c.nodes.filter(n=>n.kind==='oscillator');
test('muted and hidden cues allocate no audio context or one-shot voices',()=>{
  for(const key of['muted','hidden']){const f=fixture();if(key==='muted')f.sandbox.muted=true;else f.sandbox.document.hidden=true;for(const method of['shot','startCharge','impact','podBlock','coreHit','armorHit','shield','hurt','weakBreak'])f.sfx[method]();assert.equal(f.contexts.length,0)}
});
test('routine details and existing charge loops pass through a quieter detail bus',()=>{
  const{sfx}=fixture();sfx.impact();assert.equal(sfx.detail.gain.value,.82);assert.equal(sfx.detail.connections[0],sfx.master);
  const voices=sfx.c.nodes.filter(n=>n.kind==='gain'&&n!==sfx.master&&n!==sfx.detail&&n.connections.includes(sfx.detail));assert.equal(voices.length,3);
  sfx.startCharge();assert.equal(sfx.chargeNodes.gain.connections[0],sfx.detail);const count=oscillators(sfx.c).length;sfx.startCharge();assert.equal(oscillators(sfx.c).length,count,'One charging loop only');
});
test('first block and impact are audible immediately and repeated contacts are bounded',()=>{
  for(const[method,interval,count]of[['impact',.045,2],['podBlock',.09,1],['coreHit',.06,2],['armorHit',.07,1]]){
    const{sfx}=fixture();sfx[method]();assert.equal(oscillators(sfx.c).length,count);const nodes=sfx.c.nodes.length;
    for(let i=0;i<80;i++)sfx[method]();assert.equal(sfx.c.nodes.length,nodes,method+' same-time burst does not layer');
    sfx.c.currentTime=interval-.001;sfx[method]();assert.equal(sfx.c.nodes.length,nodes);sfx.c.currentTime=interval+.001;sfx[method]();assert.equal(oscillators(sfx.c).length,count*2);
  }
});
test('ordinary enemy destruction is rate limited while an elite destruction remains foreground',()=>{
  const{sfx}=fixture();sfx.enemyBreak();const size=sfx.c.nodes.length;for(let i=0;i<30;i++)sfx.enemyBreak();assert.equal(sfx.c.nodes.length,size);sfx.enemyBreak(true);assert.ok(sfx.c.nodes.length>size);assert.ok(sfx.focusUntil>=.25);
});
test('hull and shield cues bypass details and duck already-playing routine sounds',()=>{
  for(const[method,hold]of[['hurt',.36],['shield',.22],['weakBreak',.24],['tentacleBreak',.26]]){
    const{sfx}=fixture();sfx.startCharge();const before=sfx.c.nodes.length;sfx[method]();const targets=sfx.detail.gain.events.filter(e=>e.kind==='target');
    assert.deepEqual(targets.map(e=>[e.value,e.time]),[[.28,0],[.82,hold]]);assert.ok(sfx.c.nodes.slice(before).some(n=>n.kind==='gain'&&n.connections.includes(sfx.master)),'Critical voice connects directly to master');assert.equal(sfx.cueOutput,null);assert.ok(sfx.chargeNodes,'Ducking does not cancel the player charge');
  }
});
test('a shorter overlapping cue cannot release the previous critical duck early',()=>{
  const{sfx}=fixture();sfx.hurt();sfx.c.currentTime=.04;sfx.shield();assert.equal(sfx.focusUntil,.36);assert.equal(sfx.detail.gain.events.at(-1).time,.36);sfx.c.currentTime=.3;sfx.weakBreak();assert.equal(sfx.focusUntil,.54);
  sfx.c.currentTime=.4;sfx.impact();const gain=sfx.c.nodes.filter(n=>n.kind==='gain').at(-1);assert.equal(gain.connections[0],sfx.detail,'Foreground route cannot leak into later routine voices');
});
test('temporary output routing is restored even if a foreground cue throws',()=>{
  const{sfx}=fixture();assert.throws(()=>sfx.foreground(.2,()=>{throw new Error('fixture failure')}));assert.equal(sfx.cueOutput,null);assert.equal(sfx.output(),sfx.detail);
});
test('mute ends the charging oscillators, blocks new voices and restores selected volume',()=>{
  const{sfx}=fixture();sfx.startCharge();const nodes=sfx.chargeNodes;sfx.setMuted(true);assert.equal(sfx.chargeNodes,null);assert.equal(nodes.osc.stops.length,1);assert.equal(nodes.harmonic.stops.length,1);const before=sfx.c.nodes.length;sfx.hurt();sfx.podBlock();assert.equal(sfx.c.nodes.length,before);
  sfx.setVolume(.4);assert.equal(sfx.master.gain.events.at(-1).value,0);sfx.setMuted(false);assert.equal(sfx.master.gain.events.at(-1).value,.4);sfx.hurt();assert.ok(sfx.c.nodes.length>before);
});
test('hidden documents retain silence across volume changes and new sound requests',()=>{
  const f=fixture();f.sfx.impact();f.sandbox.document.hidden=true;f.sfx.setVolume(.9);assert.equal(f.sfx.master.gain.events.at(-1).value,0);const before=f.sfx.c.nodes.length;f.sfx.startCharge();f.sfx.hurt();assert.equal(f.sfx.c.nodes.length,before);
});
test('core, armor, blocked fire, shield loss and hull loss have distinct contours',()=>{
  const plans={};for(const method of['coreHit','armorHit','podBlock','shield','hurt','weakOpen','chargeReady']){const{sfx}=fixture();sfx.voice=(...args)=>plans[method].push(args);sfx.noise=()=>{};plans[method]=[];sfx[method]()}
  assert.ok(plans.coreHit[0][0]>1000&&plans.coreHit[0][1]>plans.coreHit[0][0]);assert.ok(plans.armorHit[0][0]<300&&plans.armorHit[0][1]<plans.armorHit[0][0]);
  assert.ok(plans.podBlock[0][2]<.06);assert.ok(plans.shield[0][2]>.2&&plans.shield[0][1]>plans.shield[0][0]);assert.ok(plans.hurt[0][0]<150&&plans.hurt[0][1]<plans.hurt[0][0]&&plans.hurt[0][3]==='sawtooth');
  assert.ok(plans.weakOpen[0][1]<plans.weakOpen[0][0]);assert.ok(plans.chargeReady[0][1]>plans.chargeReady[0][0]);
});
test('all production cue envelopes schedule finite valid values through the existing limiter',()=>{
  const{sfx}=fixture();for(const method of['launch','shot','startCharge','chargeReady','pod','enemyShot','enemyBreak','tentacleBreak','impact','armorHit','coreHit','podBlock','weakOpen','weakBreak','shield','hurt','evade','pickup','powerup','bossIntro','phase','victory','gameover','upgrade','skill','laser']){sfx[method]();if(sfx.c)sfx.c.currentTime+=1}
  const limiter=sfx.c.nodes.find(n=>n.kind==='compressor');assert.equal(limiter.ratio.value,12);assert.equal(limiter.threshold.value,-10);assert.equal(limiter.connections[0],sfx.c.destination);assert.ok(oscillators(sfx.c).length>40);
});
console.log(`${passed} audio clarity checks passed, 0 failed.`);
console.log('Scope: native production synthesis with a recording Web Audio graph; subjective playback and speakers require an audition.');
