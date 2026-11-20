#!/usr/bin/env node
'use strict';

// Native 120Hz field diagnostics, with private mock saves only. The passive
// meter and stationary firing reference measure pressure, not human fairness.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const arg=(name,fallback)=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const seeds=arg('quick','no')==='yes'?[1103]:[1103,2026,7349];
const baselineFile=path.join(root,'artifacts','rhythm-v148-baseline-game.js');
const productionFile=path.join(root,'game.js');
const baselineSource=fs.readFileSync(baselineFile,'utf8');
const productionSource=fs.readFileSync(productionFile,'utf8');
// The historical v148 field comparison predates later combat fixes. Keep it
// for rhythm diagnostics, but compare exact random-stream pressure against
// the immediately preceding release when checking this pass's preservation.
const previousReleaseFile=path.join(root,'artifacts','field-clarity-v155-baseline-game.js');
const previousReleaseSource=fs.readFileSync(previousReleaseFile,'utf8');
const rhythmSource=fs.readFileSync(path.join(root,'stage-rhythm.js'),'utf8');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const step=1/120;
const round=n=>Math.round(n*1000)/1000;
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}

function factory(source,label){
  // Wrap native array emissions without changing movement, timing or damage.
  const instrumented=source.replaceAll('enemies.push(','rhythmEnemyPush(')
    .replaceAll('enemyShots.push(','rhythmShotPush(')
    .replaceAll('stageHazards.push(','rhythmHazardPush(');
  const harnessFile=path.join(__dirname,'verify-game.cjs');
  let support=fs.readFileSync(harnessFile,'utf8');
  support=support.slice(0,support.indexOf('\ntest('));
  const sourceHook="const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');";
  assert.ok(support.includes(sourceHook),'Shared harness source hook remains available');
  support=support.replace(sourceHook,'const source='+JSON.stringify(instrumented)+';');
  const definitions=`
    let rhythmProbe={enemyBirths:0,shotBirths:0,hazardBirths:0};
    function rhythmEnemyPush(...items){rhythmProbe.enemyBirths+=items.length;return enemies.push(...items)}
    function rhythmShotPush(...items){rhythmProbe.shotBirths+=items.length;return enemyShots.push(...items)}
    function rhythmHazardPush(...items){rhythmProbe.hazardBirths+=items.length;return stageHazards.push(...items)}
  `;
  support=support.replace('  globalThis.__gameTest = {',definitions+'\n  globalThis.__gameTest = {');
  const hook=`
    get rhythmProbe(){return rhythmProbe},
    rhythmClearProbe(){rhythmProbe={enemyBirths:0,shotBirths:0,hazardBirths:0}},
    rhythmTimers(){return{spawn,hazard:stageHazardClock,t,post:stagePostEliteClock}},
    rhythmStaleTimers(){spawn=-10;stageHazardClock=-10},
    rhythmSkipService(){chooseRunService('skip')},
    rhythmSetup(stage,post,clock=0){
      wave=stage;t=(post?48:0)+clock;beginStage(false,false);
      miniBossSpawned=post;stagePostEliteClock=post?clock:-1;
      miniBoss=boss=null;enemies=[];enemyShots=[];shots=[];pickups=[];
      stageHazards=[];stageApexIntro=-1;stageEncounterCursor=0;
      stageEvent=0;stageHazardClock=post?3.5:5.4;spawn=post?.4:.8;
      victoryDelay=null;state='playing';bossLab=false;bossLabLevel=false;
      player.x=145;player.y=H/2;player.hp=1000;player.maxHp=3;player.inv=.8;
      rhythmProbe={enemyBirths:0,shotBirths:0,hazardBirths:0};
    },
  `;
  const apiHook='spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,';
  assert.ok(support.includes(apiHook),'Shared harness field hook remains available');
  support=support.replace(apiHook,apiHook+hook);
  const harness=new Module(harnessFile,module);
  harness.filename=harnessFile;harness.paths=Module._nodeModulePaths(__dirname);
  harness._compile(support+'\nmodule.exports={createGame};',harnessFile);
  return seed=>{
    const game=harness.exports.createGame({ruleset:'streamlined-v1'});
    game.sandbox.__rhythmRandom=random(seed);
    vm.runInContext('Math.random=globalThis.__rhythmRandom',vm.createContext(game.sandbox));
    game.api.start('story');
    assert.equal(Object.values(game.api.garage.equipped).filter(Boolean).length,0,label+': zero equipped gear');
    return game;
  };
}

const baseline=factory(baselineSource,'baseline');
const production=factory(productionSource,'production');
const previousRelease=factory(previousReleaseSource,'previous v154 release');
const modelContext=vm.createContext({});modelContext.window=modelContext;
vm.runInContext(rhythmSource,modelContext,{filename:'stage-rhythm.js'});
const rhythm=modelContext.StarfighterStageRhythm;
assert.equal(typeof rhythm?.describe,'function','Stage rhythm exposes its pure clock policy');
const describe=(stage,post,clock)=>rhythm.describe({stage,post,clock});
const births=api=>JSON.parse(JSON.stringify(api.rhythmProbe));
const advance=(api,seconds)=>{for(let tick=0;tick<Math.ceil(seconds/step);tick++)api.update(step)};

function field(make,{stage,post,seed,pilot='passive'}){
  const {api}=make(seed);api.rhythmSetup(stage,post);
  if(pilot==='firing')api.keys.add('Space');
  const duration=post?36:48,[width,height]=api.logicalSize;
  const samples=[];let previous={enemyBirths:0,shotBirths:0,hazardBirths:0};
  let visibleEnemyTicks=0,visibleShotTicks=0,visibleHazardTicks=0;
  let peakEnemies=0,peakShots=0,peakHazards=0;
  for(let tick=0;tick<duration*120;tick++){
    if(pilot==='firing'&&api.player.charge>=1-1e-9)api.releaseCharge();
    api.update(step);
    const visibleEnemies=api.enemies.filter(enemy=>!enemy.dead&&enemy.x>=-enemy.r&&enemy.x<=width+enemy.r).length;
    const visibleShots=api.enemyShots.filter(shot=>!shot.dead&&shot.x>=0&&shot.x<=width&&shot.y>=0&&shot.y<=height).length;
    const visibleHazards=api.stageHazards.filter(hazard=>!hazard.dead&&hazard.x>=-160&&hazard.x<=width+40).length;
    visibleEnemyTicks+=visibleEnemies;visibleShotTicks+=visibleShots;visibleHazardTicks+=visibleHazards;
    peakEnemies=Math.max(peakEnemies,visibleEnemies);peakShots=Math.max(peakShots,visibleShots);peakHazards=Math.max(peakHazards,visibleHazards);
    if((tick+1)%120===0){
      const current=births(api),second=(tick+1)/120;
      samples.push({second,phase:describe(stage,post,Math.min(second-.001,duration-.001))?.id,
        enemies:current.enemyBirths-previous.enemyBirths,shots:current.shotBirths-previous.shotBirths,hazards:current.hazardBirths-previous.hazardBirths,
        visibleEnemies:round(visibleEnemyTicks/120),visibleShots:round(visibleShotTicks/120),visibleHazards:round(visibleHazardTicks/120)});
      previous=current;visibleEnemyTicks=visibleShotTicks=visibleHazardTicks=0;
    }
    if(api.miniBoss||api.stageApexIntro>=0)break;
  }
  return{stage,post,seed,pilot,seconds:samples.length,...births(api),peakEnemies,peakShots,peakHazards,
    enemySeconds:round(samples.reduce((sum,sample)=>sum+sample.visibleEnemies,0)),
    shotSeconds:round(samples.reduce((sum,sample)=>sum+sample.visibleShots,0)),
    hazardSeconds:round(samples.reduce((sum,sample)=>sum+sample.visibleHazards,0)),
    hullContacts:round(1000-api.player.hp),samples};
}

let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name)}

check('pure phase boundaries cover precisely48/36 seconds and repeat across later missions',()=>{
  for(const post of[false,true])for(let stage=2;stage<=10;stage++){
    const duration=post?36:48;
    let previous=null;
    for(let tick=0;tick<duration*120;tick++){
      const clock=tick*step,phase=describe(stage,post,clock);
      assert.ok(phase&&Number.isFinite(phase.start)&&Number.isFinite(phase.end));
      assert.ok(phase.start<=clock+1e-8&&phase.end>clock-1e-8,'Every field tick belongs to its absolute phase');
      assert.equal(phase.duration,duration);
      if(previous&&previous.id!==phase.id){assert.equal(previous.end,phase.start);assert.equal(describe(stage,post,phase.start).id,phase.id)}
      previous=phase;
    }
    assert.equal(previous.end,duration);
  }
});

check('mission1 authored budgets stay identical to v148 and native pressure stays identical to v154',()=>{
  const before=baseline(1103).api,after=production(1103).api;
  assert.equal(JSON.stringify(after.levelOneTimeline),JSON.stringify(before.levelOneTimeline));
  assert.equal(JSON.stringify(after.levelOnePostMiniTimeline),JSON.stringify(before.levelOnePostMiniTimeline));
  assert.equal(after.makeMiniBoss.toString(),before.makeMiniBoss.toString());
  assert.equal(after.makeBoss.toString(),before.makeBoss.toString());
  for(let stage=1;stage<=10;stage++)assert.equal(JSON.stringify(after.sectorThreat(stage)),JSON.stringify(before.sectorThreat(stage)));
  for(const post of[false,true]){
    const options={stage:1,post,seed:1103,pilot:'passive'};
    const oldField=field(previousRelease,options),newField=field(production,options);
    assert.deepEqual(newField,oldField,'Native mission1 emissions and per-second pressure stay unchanged from v154');
  }
});

check('all field sections arrive at elite/apex after48/36 native simulation seconds',()=>{
  for(let stage=1;stage<=10;stage++)for(const post of[false,true]){
    const {api}=production(2026);api.rhythmSetup(stage,post);
    const duration=post?36:48;
    advance(api,duration-step*2);
    assert.equal(!!api.miniBoss,false);assert.ok(api.stageApexIntro<0);
    advance(api,step*4);
    assert.ok(post?api.stageApexIntro>=0:!!api.miniBoss,'Arrival preserves the authored duration');
  }
});

check('recovery windows do not emit stale waves/hazards or catch up at their exit',()=>{
  for(const post of[false,true]){
    const duration=post?36:48;
    const phases=[];
    for(let clock=0;clock<duration;clock+=.25){const phase=describe(5,post,clock);if(!phase.enemyScale&&phase.end<duration&&!phases.some(item=>item.id===phase.id))phases.push(phase)}
    assert.ok(phases.length>0,'Both field sections have a reposition window');
    for(const phase of phases){
      const {api}=production(7349);api.rhythmSetup(5,post,phase.start+.1);api.rhythmStaleTimers();
      advance(api,phase.end-phase.start-.3);
      assert.equal(api.rhythmProbe.enemyBirths,0);assert.equal(api.rhythmProbe.hazardBirths,0);
      assert.ok(api.rhythmTimers().spawn>=.39);assert.ok(api.rhythmTimers().hazard>=1.19);
      // Enter the next active beat with a fresh timer, never a replay loop.
      advance(api,.3);
      assert.ok(api.rhythmProbe.enemyBirths<=4,'At most one native formation can be born at a boundary');
      assert.equal(api.rhythmProbe.hazardBirths,0,'No stale hazard is released at a boundary');
    }
  }
});

check('pause, restored checkpoints and round Garage preserve field clocks',()=>{
  const {api}=production(1103);api.rhythmSetup(5,true,12.25);
  api.loop(1000);api.pause();const paused=api.rhythmTimers();
  for(let frame=1;frame<=50;frame++)api.loop(1000+frame*100);
  assert.deepEqual(api.rhythmTimers(),paused,'Paused render frames consume no field time');
  api.pause();api.loop(6000+1000/120);
  assert.ok(api.postEliteClock-paused.post<step*1.1,'Resume consumes only its fresh120Hz step');
  api.saveRunCheckpoint('postElite');const savedClock=api.postEliteClock;
  api.goMenu();api.loadGame();assert.equal(api.postEliteClock,savedClock);
  api.rhythmClearProbe();advance(api,.8);
  assert.equal(api.rhythmProbe.enemyBirths,0);assert.equal(api.rhythmProbe.hazardBirths,0,'Loading a recovery does not release reseeded timers');

  // Use the real elite/service/Garage path; fight and menu time never enters
  // the36-second field clock, including restored pending service callbacks.
  api.start('story');api.rhythmSetup(5,false,48.1);api.update(step);
  assert.ok(api.miniBoss);api.miniBoss.hp=0;api.update(step);api.flushVictoryDelay();
  assert.equal(api.state,'upgrade');assert.ok(api.postEliteClock<0);
  const serviceTime=api.time;api.openRoundGarage();assert.equal(api.state,'garage');
  for(let frame=0;frame<50;frame++)api.loop(10000+frame*100);
  assert.equal(api.time,serviceTime);assert.ok(api.postEliteClock<0);
  api.finishRoundGarage();assert.equal(api.state,'upgrade');api.rhythmSkipService();
  api.update(step);assert.ok(api.postEliteClock>0&&api.postEliteClock<step*1.1);
});

const report={baseline:{path:path.relative(root,baselineFile),sha256:hash(baselineSource)},production:{path:'game.js',sha256:hash(productionSource)},
  preservationBaseline:{path:path.relative(root,previousReleaseFile),sha256:hash(previousReleaseSource),scope:'Exact native Mission 1 pressure preservation only; v148 remains the rhythm diagnostic baseline.'},
  policy:{path:'stage-rhythm.js',sha256:hash(rhythmSource),schedules:JSON.parse(JSON.stringify(rhythm.schedules))},
  assumptions:{ruleset:'streamlined-v1',simulationHz:120,seeds,
    saves:'Private fresh VM storage; no real browser profile is opened or modified.',
    field:'Native standalone48/36-second sections. Post sections seed t=48, retaining the actual turret eligibility. All ordinary movement, hits, enemy fire and hazard lifetime rules execute.',
    passive:'Stationary x145 reference without firing; hull1000 prevents early termination. This is an incoming-pressure and occupancy meter, not a survivability or human-fairness claim.',
    firing:'Stationary x145, empty Garage, no run perks, full-charge releases and naturally touching pickups. No forced kit collection or enemy targeting. Not a campaign-clear or skilled-player claim.',
    samples:'Per-second births and mean on-screen live occupancy. Existing enemies, bullets and hazards keep moving/firing during phases that suppress new births.'},checks,cases:[]};
for(const stage of[2,5,10])for(const post of[false,true])for(const pilot of['passive','firing'])for(const seed of seeds){
  const options={stage,post,pilot,seed};
  report.cases.push({stage,post,pilot,seed,before:field(baseline,options),after:field(production,options)});
}
const mean=(samples,key)=>round(samples.reduce((sum,sample)=>sum+sample[key],0)/Math.max(1,samples.length));
report.recovery=report.cases.map(item=>{
  const phase=describe(item.stage,item.post,item.post?12:20);
  const prior=item.after.samples.filter(sample=>sample.second>phase.start-3&&sample.second<=phase.start);
  const tail=item.after.samples.filter(sample=>sample.second>phase.end-3&&sample.second<=phase.end);
  return{stage:item.stage,post:item.post,pilot:item.pilot,seed:item.seed,
    precedingPressure:{start:phase.start-3,end:phase.start,enemies:mean(prior,'visibleEnemies'),shots:mean(prior,'visibleShots')},
    recoveryTail:{start:phase.end-3,end:phase.end,enemies:mean(tail,'visibleEnemies'),shots:mean(tail,'visibleShots')}};
});
check('regroup tails reduce actual live enemy occupancy after pressure',()=>{
  for(const item of report.recovery){
    assert.ok(item.recoveryTail.enemies<item.precedingPressure.enemies,
      `Stage${item.stage} ${item.post?'post':'pre'} ${item.pilot} seed${item.seed}: live enemy recovery tail must fall below preceding pressure`);
  }
});
report.checks=checks;
const out=path.join(root,'artifacts',arg('label','stage-rhythm-v155-diagnostics')+'.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const totals=key=>report.cases.reduce((sum,item)=>sum+item[key].enemyBirths,0);
console.log(`${checks} checks passed; ${report.cases.length} paired native-field probes. Enemy births ${totals('before')} -> ${totals('after')}.`);
console.log(path.relative(root,out));
