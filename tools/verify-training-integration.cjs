#!/usr/bin/env node
'use strict';

// Real practice-scene logic and collision tests. Reuses the game's browser
// mock without running its unrelated regression suite or touching real saves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const harnessPath = path.join(__dirname, 'verify-game.cjs');
const harness = fs.readFileSync(harnessPath, 'utf8');
const marker = '\nconst game = createGame();';
const split = harness.indexOf(marker);
assert.ok(split > 0, 'Shared game harness must expose its setup before its test cases');
let prefix = harness.slice(0, split);
const accessorMarker = 'globalThis.__gameTest = {';
assert.ok(prefix.includes(accessorMarker));
prefix = prefix.replace(accessorMarker, `${accessorMarker}
    beginTrainingPractice,setupTrainingLesson,updateTrainingScene,trainingTick,
    finishTrainingPractice,togglePod,togglePodMount,activateDelta,bitPositions,
    initializeFlightSchool,openFlightSchool,closeFlightSchool,chooseBriefingIntro,
    get trainingFrame(){return trainingFrame},get trainingController(){return trainingController},
    get trainingSession(){return trainingSession},get uiText(){return uiText},
    setTrainingController(value){trainingController=value},
`);
const contextMarker = 'const context = vm.createContext(sandbox);';
assert.ok(prefix.includes(contextMarker));
prefix = prefix.replace(contextMarker, `${contextMarker}
  if(typeof options.trainingSearch==='string')sandbox.location.search=options.trainingSearch;
  if(options.trainingBoot)vm.runInContext(fs.readFileSync(path.join(root,'flight-school-boot.js'),'utf8'),context,{filename:'flight-school-boot.js'});
`);
const helpers = {exports:{}};
vm.runInNewContext(prefix+'\nmodule.exports={createGame};', {
  require, module:helpers, __dirname, __filename:harnessPath, console, process, Buffer, URLSearchParams,
}, {filename:harnessPath});
const {createGame} = helpers.exports;
const ADVANCED_HINT_IDS=['missile','bit','shield','delta','gear','module','doctrine','synergy'];
const USER_SAVE = JSON.stringify({name:'REAL PILOT',garage:{inventory:[{id:'real-exotic',tier:4}],equipped:{weapon:'real-exotic'}},checkpoint:{wave:7},progress:{missionsCleared:[true,true,true]}});
const STORAGE_FIXTURE = [
  ['starfighterProfileSlot1',USER_SAVE],['starfighterProfileSlot2','SECOND REAL PROFILE'],
  ['starfighterProfile','LEGACY REAL PROFILE'],['starfighterGarage','REAL GARAGE'],
  ['starfighterActiveProfile','1'],['starfighterBest','987654'],
  ['starfighterCheckpoint','REAL CHECKPOINT'],['mouseFlight','true'],
  ['starfighterMuted','true'],['starfighterMusicVolume','.21'],
  ['starfighterSfxVolume','.61'],['starfighterDisplay','{"reducedMotion":true,"clearCombat":false,"collisionGuide":true}'],
];
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
function makePractice(options={}) {
  const game=createGame({trainingBoot:true,initialStorage:STORAGE_FIXTURE,...options});
  const {api,sandbox,document}=game,events=[],snapshots=[],messages=[],pressed=[];
  sandbox.parent={postMessage:(data,origin)=>messages.push({data,origin})};sandbox.location.origin='http://practice.test';
  api.setTrainingController({note:(type,payload={})=>events.push({type,...payload}),tick:(_dt,state)=>snapshots.push(state),close(){}});
  api.beginTrainingPractice();
  function press(type,code){pressed.push({type,code});sandbox.dispatchEvent({type,code,repeat:false,target:document.body})}
  function tap(code='KeyZ',hold=.025){press('keydown',code);advance(hold);press('keyup',code)}
  function advance(seconds){for(let i=0;i<Math.ceil(seconds*120);i++){if(api.state==='playing')api.update(1/120);assert.ok(Number.isFinite(api.player.x)&&Number.isFinite(api.player.y));assert.ok(api.player.hp>0,'Practice hull should remain usable')}}
  function until(predicate,seconds=8,label='practice condition') {for(let i=0;i<Math.ceil(seconds*120)&&!predicate();i++)advance(1/120);assert.ok(predicate(),label+' must be reachable with real scene collisions')}
  function setup(id){api.setupTrainingLesson(id);events.length=0;snapshots.length=0;assert.equal(api.trainingSession.id,id);assert.equal(api.state,'playing');assert.equal(api.runActive,false);assert.equal(api.bossLab,true)}
  function observed(key){return api.trainingSession.observed.has(key)}
  function unchanged(){assert.equal(JSON.stringify([...game.storage]),JSON.stringify(STORAGE_FIXTURE),'Real pilot, Garage, checkpoint, preferences, and other storage must remain byte-for-byte unchanged')}
  return {...game,events,snapshots,messages,pressed,press,tap,advance,until,setup,observed,unchanged};
}
function prepareParentOverlay(g){
  const create=g.document.createElement;g.document.createElement=tag=>{const node=create(tag);node.remove=()=>{g.document.body.children=g.document.body.children.filter(child=>child!==node)};return node};
}
function installRealController(g){
  const doc=g.document,rootElement=g.find('#game-shell'),controllerTestSource=fs.readFileSync(path.join(root,'tools/verify-training.cjs'),'utf8'),domSource=controllerTestSource.slice(controllerTestSource.indexOf('function walk('),controllerTestSource.indexOf('function createHarness(')),MockElement=new Function(domSource+'\nreturn MockElement;')();
  const walk=node=>[node,...(node.children||[]).flatMap(walk)];
  doc.head=new MockElement('head',doc);doc.createElement=tag=>new MockElement(tag,doc);doc.getElementById=id=>[...walk(doc.head),...walk(rootElement)].find(node=>node.id===id)||null;
  rootElement.appendChild=node=>{node.remove();node.parentElement=rootElement;rootElement.children.push(node);return node};
  rootElement.querySelectorAll=selector=>MockElement.prototype.querySelectorAll.call(rootElement,selector);rootElement.querySelector=selector=>rootElement.querySelectorAll(selector)[0]||null;
  vm.runInNewContext(fs.readFileSync(path.join(root,'training.js'),'utf8'),{window:g.sandbox,document:doc},{filename:'training.js'});g.api.initializeFlightSchool();
  const nodes=()=>walk(rootElement),next=()=>{const node=nodes().find(node=>node.tagName==='BUTTON'&&node.className==='sf-primary');assert.ok(node,'The real controller must expose its evidence-gated action');return node},button=label=>{const node=nodes().find(node=>node.tagName==='BUTTON'&&node.textContent===label);assert.ok(node,`Expected controller action: ${label}`);return node};
  return{rootElement,next,button,nodes};
}

test('child entry executes private storage boot before gameplay scripts',()=>{
  const html=fs.readFileSync(path.join(root,'flight-school.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match=>match[1].split('?')[0]);
  assert.equal(scripts[0],'flight-school-boot.js');assert.ok(scripts.indexOf('training.js')<scripts.indexOf('game.js'));
  const game=makePractice();assert.equal(game.sandbox.STARFIGHTER_TRAINING_SANDBOX,true);
  assert.equal(game.api.garage.inventory.length,0,'Real Garage must not enter the simulator');
  assert.equal(game.sandbox.localStorage.getItem('starfighterProfileSlot2'),null);
  assert.equal(game.sandbox.localStorage.getItem('starfighterBest'),null);
  assert.equal(game.sandbox.localStorage.getItem('starfighterMuted'),'true');
  assert.equal(game.sandbox.localStorage.getItem('starfighterMusicVolume'),'.21');
  assert.equal(game.sandbox.localStorage.getItem('starfighterSfxVolume'),'.61');
  game.api.storage.setItem('starfighterProfileSlot2','PRACTICE SAVE');game.api.storage.removeItem('starfighterProfileSlot1');game.unchanged();
  game.sandbox.localStorage.clear();game.unchanged();
});

test('the performance log stays inert in Flight School practice and hides its controls',()=>{
  const practice=createGame({trainingBoot:true,initialStorage:[['starfighterDiagnostics','1'],['starfighterDiagnosticsSessions','[]']]});
  assert.equal(practice.sandbox.STARFIGHTER_TRAINING_SANDBOX,true);
  const diagnostics=practice.api.diagnostics;
  assert.equal(diagnostics.sandbox,true);assert.equal(diagnostics.enabled,false,'A saved opt-in must not switch practice recording on');
  assert.equal(diagnostics.setEnabled(true),false);diagnostics.frame(1000,1,1);diagnostics.frame(1017,1,1);diagnostics.mark('part-break');
  assert.equal(diagnostics.snapshot().sessions.length,0);assert.equal(diagnostics.save(),null);
  assert.equal(practice.find('#diagnostics-group').hidden,true,'Practice must not show the logging controls');
  for(const key of ['starfighterDiagnostics','starfighterDiagnosticsSessions'])assert.equal(practice.sandbox.localStorage.getItem(key),null,'Practice storage never receives or writes '+key);
});

test('blocked reads still produce a private, writable practice store',()=>{
  const game=makePractice({failGet:true});game.setup('move');game.api.storage.setItem('starfighterProfileSlot1','PRIVATE');
  assert.equal(game.sandbox.localStorage.getItem('starfighterProfileSlot1'),'PRIVATE');game.unchanged();
});

test('actual flight keys and precision feed the practice state bridge',()=>{
  const g=makePractice();g.setup('move');const startX=g.api.player.x;
  g.press('keydown','KeyD');g.advance(.45);g.press('keyup','KeyD');const normal=g.api.player.x-startX;assert.ok(normal>=80);
  const before=g.api.player.x;g.press('keydown','ShiftLeft');g.press('keydown','KeyD');g.advance(.4);g.press('keyup','KeyD');g.press('keyup','ShiftLeft');
  const precision=g.api.player.x-before;assert.ok(precision>=30&&precision<normal);assert.ok(g.snapshots.some(state=>state.precision));
  g.press('keydown','KeyT');g.press('keyup','KeyT');assert.equal(g.api.state,'playing','Practice must not open a run Doctrine screen');
  g.press('keydown','KeyN');g.press('keyup','KeyN');assert.equal(g.api.miniBoss,null,'Developer advance must not escape practice');
  g.unchanged();
});

test('tap and hold/release create real quick and charged shot notes',()=>{
  const g=makePractice();g.setup('fire');g.tap();assert.ok(g.events.some(event=>event.type==='shot'&&event.charge===0));
  g.advance(.2);g.tap('KeyZ',1);assert.ok(g.events.some(event=>event.type==='shot'&&event.charge>=.7));assert.ok(g.api.shots.some(shot=>shot.charge>=.7));
  const count=g.events.length;g.press('keydown','Escape');g.press('keyup','Escape');assert.equal(g.api.state,'paused');g.tap('KeyZ',1);assert.equal(g.events.length,count,'Paused firing must not emit evidence');
  g.press('keydown','Escape');g.press('keyup','Escape');assert.equal(g.api.state,'playing');g.unchanged();
});

test('red crystal collision equips Force and missed supplies replenish',()=>{
  const g=makePractice();g.setup('force');g.advance(1/120);const pickup=g.api.pickups[0];assert.equal(pickup.color,'red');
  g.api.player.y=70;g.advance(4.5);assert.ok(g.api.pickups.some(item=>item.type==='crystal'&&item.color==='red'),'Missed crystal must be supplied again');
  g.api.player.y=g.api.pickups[0].y;g.until(()=>g.observed('pickup:crystal:red'),6,'red crystal collision');
  assert.equal(g.api.player.pod.owned,true);assert.equal(g.api.player.laserColor,'red');assert.equal(g.api.player.laserLevel,1);g.unchanged();
});

test('C and V perform deployment, real Force blocking, recall, and both mounts',()=>{
  const g=makePractice();g.setup('mount');g.tap('KeyC',0);assert.equal(g.api.player.pod.mode,'deployed');
  g.until(()=>g.observed('podBlock'),12,'deployed Force interception');assert.ok(g.api.player.dose>0);
  g.tap('KeyC',0);g.tap('KeyV',0);g.until(()=>g.api.player.pod.mode==='docked',3,'rear recall');assert.equal(g.api.player.pod.dockSide,'rear');
  g.tap('KeyV',0);g.until(()=>g.api.player.pod.mode==='docked',3,'front recall');assert.equal(g.api.player.pod.dockSide,'front');g.unchanged();
});

test('spectrum supply produces real blue then yellow collections and firing patterns',()=>{
  const g=makePractice();g.setup('spectrum');g.until(()=>g.observed('pickup:crystal:blue'),3,'blue crystal collision');assert.equal(g.api.player.laserColor,'blue');g.tap();
  assert.ok(g.api.shots.some(shot=>shot.surfaceBounce),'Blue practice shots should demonstrate their higher-level ricochet');
  g.until(()=>g.observed('pickup:crystal:yellow'),3,'yellow crystal collision');assert.equal(g.api.player.laserColor,'yellow');assert.equal(g.api.player.laserLevel,3,'The isolated lab can demonstrate all Force levels');g.tap();assert.ok(g.api.shots.some(shot=>shot.waveRay));g.unchanged();
});

test('missile, Bit, and ward drills complete through real pickup and hostile-shot collisions',()=>{
  const g=makePractice();g.setup('support');g.until(()=>g.observed('pickup:missile'),3,'missile pickup');g.tap();assert.ok(g.api.shots.some(shot=>shot.missile),'Fire control must launch an equipped missile');
  g.until(()=>g.observed('pickup:bit'),3,'Bit pickup');assert.equal(g.api.player.bits,1);g.until(()=>g.observed('bitBlock'),8,'Bit interception');
  g.until(()=>g.observed('pickup:shield'),3,'ward pickup');g.until(()=>g.observed('shieldHit'),5,'ward absorbs rear shot');assert.equal(g.api.player.shield,0);assert.equal(g.api.player.hp,3);
  assert.ok(g.events.some(event=>event.type==='bitBlock'));assert.ok(g.events.some(event=>event.type==='shieldHit'));g.unchanged();
});

test('Force interceptions fill precharged DOSE and Q activates the real Delta',()=>{
  const g=makePractice();g.setup('delta');assert.equal(g.api.player.dose,80);g.until(()=>g.api.player.dose>=100,9,'DOSE refill');assert.ok(g.observed('podBlock'));
  g.tap('KeyQ',0);assert.ok(g.observed('delta'));assert.equal(g.api.player.dose,0);assert.equal(g.api.enemyShots.length,0);assert.ok(g.api.player.deltaFlash>0);g.unchanged();
});

test('practice armor chips health, opens its core, and accepts a real aimed weak-point shot',()=>{
  const g=makePractice();g.setup('cores');const hp=g.api.miniBoss.hp;g.tap();g.until(()=>g.observed('armorHit'),3,'sealed armor collision');
  assert.ok(g.api.miniBoss.hp<hp&&g.api.miniBoss.hp>hp-1,'A quick armor hit should chip a fraction of its one damage');assert.ok(g.api.miniBoss.weakTelegraph>0,'Armor contact should trigger the opening tell');
  g.until(()=>g.api.miniBoss.weakOpen,1,'practice opening tell');
  const node=g.api.activeWeakNodes(g.api.miniBoss).find(item=>!item.destroyed),target=g.api.worldWeakNode(g.api.miniBoss,node);
  const direction=g.api.player.y<target.y?'KeyS':'KeyW';g.press('keydown',direction);g.until(()=>Math.abs(g.api.player.y-target.y)<4,2,'aim at exposed core');g.press('keyup',direction);g.advance(.2);g.tap();
  g.until(()=>g.observed('weakHit'),3,'exposed core collision');assert.ok(g.api.miniBoss,'Target should survive its teaching hits');assert.equal(g.api.profile.lifetime.miniBosses,0);assert.equal(g.api.player.skillPoints,0);g.unchanged();
});

test('one salvage pickup per drill, retries clear practice loot, and no awards reach the Garage',()=>{
  const g=makePractice();const lifetime=JSON.stringify(g.api.profile.lifetime);g.setup('salvage');g.until(()=>g.observed('gear'),3,'Asterprint collection');assert.equal(g.api.runLoot.length,1);g.advance(6);
  assert.equal(g.api.runLoot.length,1,'Waiting on Continue must not spawn duplicate salvage');assert.equal(g.api.garage.inventory.length,0);g.setup('salvage');assert.equal(g.api.runLoot.length,0,'Retry resets the practice reward');
  g.until(()=>g.observed('gear'),3,'retry Asterprint collection');assert.equal(g.api.runLoot.length,1);assert.equal(g.api.garage.inventory.length,0);assert.equal(JSON.stringify(g.api.profile.lifetime),lifetime);assert.equal(g.api.profile.checkpoint,null);g.unchanged();
});

test('workshop scenes remain quiet and finish sends only a completion message',()=>{
  const g=makePractice();for(const id of ['synergy','progression']){g.setup(id);g.advance(5);assert.equal(g.api.enemyShots.length,0);assert.equal(g.api.pickups.length,0);assert.equal(g.api.enemies.length,0);assert.equal(g.api.boss,null);assert.equal(g.api.miniBoss,null)}
  g.api.finishTrainingPractice({completed:true});assert.equal(g.api.trainingSession,null);assert.equal(g.messages.length,1);assert.equal(g.messages[0].data.type,'starfighter-flight-school-finished');assert.equal(g.messages[0].data.completed,true);assert.equal(g.messages[0].origin,'http://practice.test');g.unchanged();
});

test('normal menu initialization creates no lesson controller or practice session',()=>{
  const g=createGame();let creates=0;g.sandbox.StarfighterTraining={create(){creates++;throw Error('Parent must not mount lesson UI')}};
  g.api.initializeFlightSchool();assert.equal(creates,0);assert.equal(g.api.trainingController,null);assert.equal(g.api.trainingSession,null);assert.equal(g.find('#game-shell').dataset.training,'false');
});

test('every Story New Game asks Play or Skip without touching an existing checkpoint',()=>{
  for(const veteran of[false,true])for(const completed of[false,true]){
    const g=createGame(),{api,find}=g;api.profile.progress.missionsCleared[0]=veteran;api.profile.progress.trainingComplete=completed;api.start('story');api.goMenu();const saved=JSON.stringify(api.profile);
    find('#start-btn').onclick();assert.equal(api.state,'briefing');assert.equal(find('#briefing-intro-choice').hidden,false);assert.equal(find('#briefing-depart-btn').disabled,true);assert.equal(JSON.stringify(api.profile),saved);
    api.departMission();assert.equal(api.state,'briefing');assert.equal(JSON.stringify(api.profile),saved);
    find('#briefing-skip-intro-btn').onclick();assert.equal(find('#briefing-intro-choice').hidden,true);assert.equal(find('#briefing-depart-btn').disabled,false);assert.equal(api.trainingFrame,null);assert.equal(JSON.stringify(api.profile),saved);
    api.departMission();assert.equal(api.state,'briefing','Normal checkpoint replacement confirmation still applies');assert.equal(JSON.stringify(api.profile),saved);
  }
});

test('briefing Play opens isolated practice and graduation visits Garage before the same unlaunched briefing',()=>{
  const g=createGame(),{api,find}=g;api.start('story');api.goMenu();const checkpoint=JSON.stringify(api.profile.checkpoint),inventory=JSON.stringify(api.garage);prepareParentOverlay(g);
  find('#start-btn').onclick();find('#briefing-training-btn').onclick();assert.ok(api.trainingFrame);assert.match(api.trainingFrame.src,/^flight-school\.html\?v=168&course=intro&/);assert.equal(api.trainingController,null);assert.equal(api.trainingSession,null);assert.equal(api.state,'briefing');assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);
  api.closeFlightSchool(true);assert.equal(api.trainingFrame,null);assert.equal(api.state,'garage');assert.equal(find('#garage-intro-guide').hidden,false);assert.equal(api.profile.progress.introComplete,true);assert.equal(api.profile.progress.trainingComplete,false,'First Flight does not mark the optional advanced school completed');assert.deepEqual(Array.from(api.profile.progress.onboardingSeen),[]);assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(api.garage),inventory);
  find('#garage-intro-skip-btn').onclick();assert.equal(api.state,'briefing');assert.equal(find('#briefing-depart-btn').disabled,false);assert.equal(find('#briefing-intro-choice').hidden,true);assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(api.garage),inventory);
});

test('main-menu Flight School opens the full course and completion remembers all advanced hints',()=>{
  const g=createGame(),{api,find}=g;api.start('story');api.goMenu();prepareParentOverlay(g);const checkpoint=JSON.stringify(api.profile.checkpoint),inventory=JSON.stringify(api.garage);
  find('#training-menu-btn').onclick();assert.match(api.trainingFrame.src,/^flight-school\.html\?v=168&course=full&/);assert.equal(api.trainingController,null);assert.equal(api.trainingSession,null);
  api.closeFlightSchool(true);assert.equal(api.trainingFrame,null);assert.equal(api.state,'menu');assert.equal(api.profile.progress.trainingComplete,true);assert.deepEqual(Array.from(api.profile.progress.onboardingSeen),ADVANCED_HINT_IDS);assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(api.garage),inventory);
});

test('partial and complete courses preserve the parent checkpoint and equipment exactly',()=>{
  for(const course of['intro','full'])for(const completed of[false,true]){
    const g=createGame(),{api}=g;api.start('story');api.goMenu();prepareParentOverlay(g);api.profile.progress.onboardingSeen=['shield'];const before=JSON.stringify(api.profile),checkpoint=JSON.stringify(api.profile.checkpoint),inventory=JSON.stringify(api.garage);
    api.openFlightSchool(false,course);assert.match(api.trainingFrame.src,new RegExp(`^flight-school\\.html\\?v=168&course=${course}&`));assert.equal(JSON.stringify(api.profile),before,'Opening private practice must not alter the parent');api.closeFlightSchool(completed);
    assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(api.garage),inventory);
    if(!completed)assert.equal(JSON.stringify(api.profile),before,'Leaving a partial course must not award completion or change an existing run');
    else if(course==='intro'){assert.equal(api.profile.progress.introComplete,true);assert.equal(api.profile.progress.trainingComplete,false);assert.deepEqual(Array.from(api.profile.progress.onboardingSeen),['shield']);}
    else{assert.equal(api.profile.progress.trainingComplete,true);assert.deepEqual(Array.from(api.profile.progress.onboardingSeen),ADVANCED_HINT_IDS);}
  }
});

test('Rush and replay briefings do not show intro choices or accept stale intro clicks',()=>{
  const g=createGame(),{api,find}=g;for(const mode of['rush','replay']){if(mode==='replay')api.profile.progress.missionsCleared[0]=true;api.openMissionBriefing(mode,1);assert.equal(find('#briefing-intro-choice').hidden,true);find('#briefing-training-btn').onclick();assert.equal(api.trainingFrame,null);assert.equal(find('#briefing-depart-btn').disabled,false);api.closeMissionBriefing()}
  find('#briefing-training-btn').onclick();assert.equal(api.trainingFrame,null);assert.equal(api.state,'menu');
});

test('real controller initialization enters lesson one before the practice-state guard runs',()=>{
  const g=createGame({trainingBoot:true}),{rootElement}=installRealController(g);
  assert.equal(g.api.state,'playing');assert.equal(g.api.trainingSession.id,'move');assert.equal(g.api.trainingController.active,true);assert.equal(g.api.trainingController.lessonId,'move');
  assert.equal(g.api.trainingController.course,'full');assert.equal(rootElement.querySelector('select').children.length,12);
  assert.equal(g.find('#menu').classList.contains('active'),false);assert.equal(g.find('#game-shell').dataset.training,'true');
  assert.ok(rootElement.children.some(node=>node.getAttribute?.('aria-label')==='Flight School guided practice'),'The actual lesson UI must mount, not just a stub controller');
});

test('child course URL accepts only exact intro and otherwise initializes the full school',()=>{
  for(const [search,course]of[['?v=159&course=intro','intro'],['?course=full','full'],['','full'],['?course=INTRO','full'],['?course=unsupported','full'],['?course=intro%00','full'],['?course=full&course=intro','full']]){
    const g=makePractice({trainingSearch:search}),ui=installRealController(g);assert.equal(g.api.trainingController.course,course);assert.equal(g.api.trainingController.lessonId,'move');assert.equal(ui.rootElement.querySelector('select').children.length,course==='intro'?6:12);g.unchanged();ui.button('EXIT SCHOOL').click();assert.equal(g.messages[0].data.completed,false);g.unchanged();
  }
});

test('actual First Flight completes all five gates through real keys, pickups and collisions',()=>{
  const g=makePractice({trainingSearch:'?v=159&course=intro'}),ui=installRealController(g),seen=[];
  const lesson=id=>{assert.equal(g.api.trainingSession.id,id);assert.equal(g.api.trainingController.lessonId,id);assert.equal(ui.next().disabled,true);seen.push(id);g.unchanged();};
  const next=id=>{assert.equal(ui.next().disabled,false,`${id} must unlock from real practice evidence`);ui.next().click();g.unchanged();};
  lesson('move');g.press('keydown','KeyD');g.advance(.45);g.press('keyup','KeyD');g.press('keydown','ShiftLeft');g.press('keydown','KeyD');g.advance(.4);g.press('keyup','KeyD');g.press('keyup','ShiftLeft');next('move');
  lesson('fire');g.tap();g.advance(.2);g.tap('KeyZ',1);next('fire');
  lesson('force');g.until(()=>g.observed('pickup:crystal:red'),3,'First Flight red crystal');assert.equal(g.api.player.pod.owned,true);next('force');
  lesson('mount');assert.equal(ui.rootElement.querySelector('.sf-training-goals').children.length,3);g.tap('KeyC',0);g.until(()=>g.observed('podBlock'),12,'First Flight deployed interception');assert.equal(ui.next().disabled,true,'The Force must still be recalled');g.tap('KeyC',0);g.until(()=>g.api.player.pod.mode==='docked',3,'First Flight front recall');assert.equal(g.api.player.pod.dockSide,'front');next('mount');
  lesson('cores');g.tap();g.until(()=>g.observed('armorHit'),3,'First Flight armor collision');assert.equal(ui.next().disabled,true);g.until(()=>g.api.miniBoss.weakOpen,1,'First Flight core opening');
  const node=g.api.activeWeakNodes(g.api.miniBoss).find(item=>!item.destroyed),target=g.api.worldWeakNode(g.api.miniBoss,node),direction=g.api.player.y<target.y?'KeyS':'KeyW';g.press('keydown',direction);g.until(()=>Math.abs(g.api.player.y-target.y)<4,2,'First Flight aim at core');g.press('keyup',direction);g.advance(.2);g.tap();g.until(()=>g.observed('weakHit'),3,'First Flight weak core collision');assert.equal(ui.next().textContent,'CONTINUE TO GARAGE');next('cores');
  assert.deepEqual(seen,['move','fire','force','mount','cores']);assert.equal(g.pressed.some(event=>event.code==='KeyV'),false,'The five essentials must not require rear-mount controls');assert.equal(g.api.trainingSession,null);assert.equal(g.api.trainingController.active,false);assert.equal(ui.rootElement.children.length,0);assert.equal(g.messages.length,1);assert.equal(g.messages[0].data.completed,true);assert.equal(g.messages[0].origin,'http://practice.test');assert.equal(g.api.profile.checkpoint,null);assert.equal(g.api.garage.inventory.length,0);g.unchanged();
});

test('real partial intro and full courses exit without rewards or parent storage changes',()=>{
  for(const course of['intro','full']){
    const g=makePractice({trainingSearch:`?v=159&course=${course}`}),ui=installRealController(g);
    if(course==='full'){const select=ui.rootElement.querySelector('select');select.value='8';select.change();assert.equal(g.api.trainingSession.id,'salvage');g.until(()=>g.observed('gear'),3,'Full school practice salvage');assert.equal(g.api.runLoot.length,1);}
    ui.button('EXIT SCHOOL').click();assert.equal(g.messages.length,1);assert.equal(g.messages[0].data.completed,false);assert.equal(g.api.trainingSession,null);assert.equal(g.api.trainingController.active,false);assert.equal(ui.rootElement.children.length,0);assert.equal(g.api.garage.inventory.length,0);assert.equal(g.api.profile.checkpoint,null);assert.equal(g.api.profile.progress.trainingComplete,false);assert.equal(g.api.profile.progress.introComplete,false);g.unchanged();
  }
});

test('Pause Main Menu exits practice and clears its lesson marker instead of opening a child menu',()=>{
  const g=makePractice();g.setup('mount');let closed=0;g.api.setTrainingController({close(){closed++}});g.api.pause();assert.equal(g.api.state,'paused');g.find('#pause-menu-btn').onclick();
  assert.equal(closed,1);assert.equal(g.api.trainingSession,null);assert.equal(g.find('#game-shell').dataset.training,'false');assert.equal(g.find('#hud').classList.contains('hidden'),true);assert.equal(g.messages.length,1);assert.equal(g.messages[0].data.completed,false);g.api.finishTrainingPractice({completed:true});assert.equal(g.messages.length,1);g.unchanged();
});

test('New Game invoked inside practice exits it without opening a Story briefing under lesson UI',()=>{
  const g=makePractice();g.setup('move');g.find('#start-btn').onclick();assert.equal(g.api.trainingSession,null);assert.equal(g.api.state,'menu');assert.equal(g.find('#game-shell').dataset.training,'false');assert.equal(g.messages.length,1);assert.equal(g.messages[0].data.completed,false);g.unchanged();
});

test('practice Pause Restart retries the same lesson without launching a developer boss',()=>{
  const g=makePractice();g.setup('support');let retries=0;g.api.setTrainingController({retry(){retries++;g.api.setupTrainingLesson('support')}});g.api.pause();g.find('#restart-btn').onclick();assert.equal(retries,1);assert.equal(g.api.state,'playing');assert.equal(g.api.trainingSession.id,'support');assert.equal(g.api.trainingSession.clock,0);assert.equal(g.api.boss,null);assert.equal(g.api.miniBoss,null);assert.equal(g.messages.length,0);g.unchanged();
});

test('practice text size accepts exact safe URL choices with blocked persistent storage',()=>{
  for(const[value,expected]of[['large','large'],['standard','standard'],['LARGE','standard'],['unexpected','standard']]){
    const g=makePractice({failGet:true,trainingSearch:'?course=intro&text='+value});assert.equal(g.api.uiText.value,expected);assert.equal(g.sandbox.localStorage.getItem('starfighterUiText'),expected==='large'?'large':value==='standard'?'standard':null);g.unchanged();
  }
});

test('practice text changes require the current same-origin frame and preserve every pilot field',()=>{
  const g=createGame(),{api,sandbox}=g;prepareParentOverlay(g);api.openFlightSchool(false,'intro');sandbox.location.origin='http://practice.test';
  const acks=[];api.trainingFrame.contentWindow={postMessage:data=>acks.push(data)};const child=api.trainingFrame.contentWindow,before=JSON.stringify(api.profile);
  const message=(source,origin,value)=>sandbox.dispatchEvent({type:'message',source,origin,data:{type:'starfighter-ui-text-changed',value}});
  message({},sandbox.location.origin,'large');message(child,'http://other.test','large');message(child,sandbox.location.origin,'unknown');assert.equal(api.uiText.value,'standard');assert.equal(acks.length,0);
  message(child,sandbox.location.origin,'large');assert.equal(api.uiText.value,'large');assert.equal(g.storage.get('starfighterUiText'),'large');assert.equal(acks[0].saved,true);assert.equal(acks[0].value,'large');assert.equal(JSON.stringify(api.profile),before);
});

test('practice text preference uses its temporary store and trusts only its parent save acknowledgement',()=>{
  const g=makePractice(),{api,sandbox,find}=g;sandbox.location.origin='http://practice.test';api.uiText.set('large');
  assert.equal(g.messages.at(-1).data.type,'starfighter-ui-text-changed');assert.match(find('#ui-text-status').textContent,/session/);g.unchanged();
  const ack=(source,origin,value)=>sandbox.dispatchEvent({type:'message',source,origin,data:{type:'starfighter-ui-text-save-result',value,saved:true}});
  ack({},sandbox.location.origin,'large');ack(sandbox.parent,'http://other.test','large');ack(sandbox.parent,sandbox.location.origin,'standard');assert.match(find('#ui-text-status').textContent,/session/);
  ack(sandbox.parent,sandbox.location.origin,'large');assert.match(find('#ui-text-status').textContent,/Saved for this browser/);g.unchanged();
});

console.log(`\n${passed} practice integration checks passed, ${failed} failed.`);
console.log('Scope: real game logic, simulated keyboard input and collisions; browser drawing/audio remain mocked.');
if(failed)process.exitCode=1;
