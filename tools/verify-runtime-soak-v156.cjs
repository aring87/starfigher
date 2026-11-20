#!/usr/bin/env node
'use strict';
// Long native-update sessions in one private VM. Graphics/audio are mocked.
// The staged meter and encounter resets are not campaign-completion evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
const sourceFile=path.resolve(root,process.argv.find(a=>a.startsWith('--source='))?.slice(9)||'game.js');
const sourceBytes=fs.readFileSync(sourceFile),sourceHash=crypto.createHash('sha256').update(sourceBytes).digest('hex');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(sourceBytes.toString('utf8'))+';');
support=support.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
  runtimeSoakScene(stage,kind,phase=1){
    wave=stage;t=0;beginStage(false,false);miniBoss=boss=null;epicHeavies=[];enemies=[];enemyShots=[];shots=[];pickups=[];stageHazards=[];victoryDelay=null;
    miniBossSpawned=kind!=='fieldPre';stagePostEliteClock=kind==='fieldPost'?0:-1;stageEncounterCursor=0;stageEvent=0;stageHazardClock=kind==='fieldPost'?3.5:5.4;stageIntro=0;spawn=kind==='fieldPost'?.4:.8;stageApexIntro=-1;
    player.x=kind.startsWith('field')?145:W-90;player.y=H/2;player.hp=1000;player.maxHp=3;player.shield=0;player.inv=.8;player.evade=0;player.ablativeReady=player.secondChanceReady=false;player.pod.owned=false;player.laserColor=null;player.laserLevel=0;player.missileLevel=player.bits=0;clearInput();state='playing';bossLab=false;bossLabLevel=false;
    if(kind==='boss'){makeBoss();boss.phase=phase;if(phase===2)boss.hp=boss.max*.5}
    if(kind==='mini')makeMiniBoss();
    const target=boss||miniBoss;if(target){const node=activeWeakNodes(target)[0];damageWeakNode(target,node,node.max)}
  },
  runtimeSoakDrain(){boss=miniBoss=null;epicHeavies=[];enemies=[];pickups=[];stageHazards=[];victoryDelay=null;stageApexIntro=-1;miniBossSpawned=true;stagePostEliteClock=-1;spawn=stageHazardClock=999;bossLab=true;state='playing';clearInput()},
`);
const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};',file);
const g=isolated.exports.createGame({ruleset:'streamlined-v1'}),a=g.api;
let seed=1103;g.sandbox.__soakRandom=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};vm.runInContext('Math.random=globalThis.__soakRandom',vm.createContext(g.sandbox));
a.start('story');
const collections=['shots','enemyShots','enemies','particles','debris','bossFragments','pickups','stageHazards'],peaks=Object.fromEntries(collections.map(k=>[k,0])),rows=[],step=1/120;
let totalTicks=0,samples=0,draws=0,cachePeak=0;
function observe(){
  for(const key of collections){const items=a[key];peaks[key]=Math.max(peaks[key],items.length);assert.ok(items.length<5000,key+' runaway guard');for(const item of items){assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.type==='gate'?item.gapY:item.y),key+' positions remain finite');if('life' in item)assert.ok(Number.isFinite(item.life),key+' finite lifetimes')}}
  assert.ok(a.particles.length<=700,'Shipping normal-mode particle cap remains enforced');
  assert.ok(a.nativePaletteCache.size<=a.nativePaletteLimit,'Native material palette cache respects its shipping limit');cachePeak=Math.max(cachePeak,a.nativePaletteCache.size);
  assert.ok(Number.isFinite(a.player.x)&&Number.isFinite(a.player.y)&&Number.isFinite(a.player.hp));samples++;
}
const scenarios=[
  [1,'fieldPre',1,47.5],[1,'fieldPost',1,35.5],[2,'fieldPre',1,47.5],[2,'fieldPost',1,35.5],[5,'fieldPre',1,47.5],[5,'fieldPost',1,35.5],[10,'fieldPre',1,47.5],[10,'fieldPost',1,35.5],
  [2,'mini',1,45],[8,'mini',1,45],[1,'boss',1,70],[4,'boss',2,70],[8,'boss',2,70],[10,'boss',2,70]
];
for(const [stage,kind,phase,seconds] of scenarios){
  a.runtimeSoakScene(stage,kind,phase);const startTicks=totalTicks;let nextFire=0;
  const localPeaks=Object.fromEntries(collections.map(k=>[k,0]));
  for(let tick=0;tick<Math.round(seconds*120);tick++){
    // Physical vertical input changes direction every 2 seconds. Encounters
    // are fired from the allowed right edge so finite-life outgoing packets
    // are exercised without claiming a boss kill or target-leading policy.
    a.keys.delete('ArrowUp');a.keys.delete('ArrowDown');a.keys.add(Math.floor(tick/240)%2?'ArrowDown':'ArrowUp');
    if(!kind.startsWith('field')&&tick>=nextFire){a.fire(tick%240===0?1:0);nextFire=tick+30}
    a.update(step);totalTicks++;assert.equal(a.state,'playing','Meter fixture must remain live');
    for(const key of collections){localPeaks[key]=Math.max(localPeaks[key],a[key].length);peaks[key]=Math.max(peaks[key],a[key].length)}
    if(tick%120===0)observe();
    if(tick%1200===0){a.draw();draws++;observe()}
  }
  a.runtimeSoakDrain();
  for(let tick=0;tick<12*120;tick++){a.update(step);totalTicks++;if(tick%120===0)observe()}
  observe();const afterDrain=Object.fromEntries(collections.map(k=>[k,a[k].length]));
  assert.equal(a.particles.length,0,'Expired cosmetic particles drain');assert.equal(a.debris.length,0,'Expired debris drains');assert.equal(a.bossFragments.length,0,'Expired detached parts drain');assert.equal(a.shots.length,0,'Forward player packets drain without targets');
  const row={stage,kind,phase,seconds,simulatedTicks:totalTicks-startTicks,maxHull:3,meterStartingHull:1000,endingHull:a.player.hp,peaks:localPeaks,afterDrain,materialCache:a.nativePaletteCache.size};rows.push(row);console.log(JSON.stringify(row));
}
// Reset through the shipping run entry point, then ensure all transient arrays
// are fresh rather than retaining any previous fixture's actor/effect state.
a.start('story');for(const key of collections)assert.equal(a[key].length,0,'Restart clears '+key);assert.equal(a.player.hp,3);assert.equal(a.player.shield,0);assert.equal(a.bossLab,false);assert.equal(a.garage.inventory.length,0);
const result={source:path.relative(root,sourceFile),sourceSha256:sourceHash,passed:3,failed:0,groups:['Bounded and finite native runtime arrays with shipping particle/material-cache limits','Actor-free 12-second drains remove effects and player packets after every segment','Native Story restart clears transient arrays and restores ordinary starting resources'],simulatedSeconds:totalTicks/120,ticks:totalTicks,samples,draws,peaks,materialCachePeak:cachePeak,rows,limits:['One private VM and deterministic seed; no real pilot is read or written.','Staged fields and encounters use 1000HP outgoing/incoming meter, 3 maxHull, no gear/perks or defensive kit. Encounters fire from the allowed right boundary; this is not a human combat/difficulty or full campaign result.','Native actors, attacks, movement, collisions, packet filtering, particle expiry and native Story restart execute. One direct native core-break call per staged encounter exercises detached-part effects; it is not a legal shot/arrival-protection test. Twelve-second drains deliberately remove owning actors, spawn admission and hazards.','Mocked image/audio output and timing do not establish GPU/mobile performance, real heap usage, physical input feel or browser long-session stability. Material-cache observations use mocked render samples only.']};
fs.writeFileSync(path.join(root,'artifacts/runtime-soak-v156.json'),JSON.stringify(result,null,2)+'\n');console.log(`PASS 3 runtime soak groups; ${result.simulatedSeconds.toFixed(1)} simulated seconds, ${totalTicks} native updates, ${samples} samples, ${draws} mocked-render samples.`);
