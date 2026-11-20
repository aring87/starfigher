#!/usr/bin/env node
'use strict';
// Native gameplay/UI-state regressions only. Uses private in-memory saves and
// browser mocks; visual layout and real controller hardware need browser QA.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const harnessPath=path.join(__dirname,'verify-game.cjs');
const snapshots=Object.fromEntries(['game.js','index.html','style.css'].map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
let prefix=fs.readFileSync(harnessPath,'utf8').split('\nconst game = createGame();')[0];
assert.ok(prefix.includes('globalThis.__gameTest = {'));
prefix=prefix.replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
  openFlightSchool,closeFlightSchool,openGarage,finishGarageIntro,moveGarageIntro,
  switchProfile,reset,menuBack,garageGearAction,onboardingAllowed,formatInputLesson,
  get garageIntroContext(){return garageIntroContext},get pendingBriefing(){return pendingBriefing},
  get trainingFrame(){return trainingFrame},get lossGarageContext(){return lossGarageContext},
`);
const frozenFs=Object.create(fs);
frozenFs.readFileSync=(filename,...args)=>{const file=path.relative(root,String(filename)).replace(/\\/g,'/');return Object.hasOwn(snapshots,file)?snapshots[file]:fs.readFileSync(filename,...args)};
const helper={exports:{}};
vm.runInNewContext(prefix+'\nmodule.exports={createGame};',{require:name=>name==='node:fs'?frozenFs:require(name),module:helper,__dirname,__filename:harnessPath,console,process,Buffer,URLSearchParams},{filename:harnessPath});
const {createGame}=helper.exports;
const results=[];
function test(name,run){try{run();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const json=value=>JSON.stringify(value);
const playerSnapshot=player=>json({...player,focus:!!player.focus});
function overlay(g){const create=g.document.createElement;g.document.createElement=tag=>{const node=create(tag);node.remove=()=>{g.document.body.children=g.document.body.children.filter(child=>child!==node)};return node}}
function begin(g=createGame({ruleset:'streamlined-v1'})){
  overlay(g);g.find('#start-btn').onclick();const briefing=g.api.pendingBriefing;g.find('#briefing-training-btn').onclick();assert.ok(g.api.trainingFrame);g.api.closeFlightSchool(true);
  assert.equal(g.api.state,'garage');assert.equal(g.api.garageIntroContext.briefing,briefing);return {...g,briefing};
}
function noGameplayChange(g,before){assert.equal(json(g.api.garage),before.garage);assert.equal(json(g.api.profile.checkpoint),before.checkpoint);assert.equal(playerSnapshot(g.api.player),before.player);assert.equal(json(g.api.runStats),before.stats)}
function before(g){return{garage:json(g.api.garage),checkpoint:json(g.api.profile.checkpoint),player:playerSnapshot(g.api.player),stats:json(g.api.runStats)}}

test('completed intro visits the actual empty Garage and all four steps preserve the pending Story briefing and gameplay',()=>{
  const g=createGame({ruleset:'streamlined-v1'}),original=before(g);const {api,find,briefing}=begin(g);
  assert.equal(find('#garage').classList.contains('active'),true);assert.equal(find('#garage-intro-guide').hidden,false);assert.equal(api.garageIntroContext.profile,api.profile);assert.equal(api.profile.progress.introComplete,true);assert.equal(api.profile.progress.trainingComplete,false);assert.equal(api.pendingBriefing,briefing);assert.equal(briefing.introChoice,'play');assert.equal(find('#garage-intro-prev-btn').disabled,true);assert.equal(find('#equipped-gear').classList.contains('garage-tour-target'),true);noGameplayChange(g,original);
  const titles=[];
  for(let step=0;step<4;step++){
    assert.equal(api.garageIntroContext.step,step);titles.push(find('#garage-intro-title').textContent);assert.equal(find('#garage-intro-sample').hidden,step!==1);noGameplayChange(g,original);
    if(step<3)find('#garage-intro-next-btn').onclick();
  }
  assert.equal(new Set(titles).size,4);assert.match(find('#garage-intro-copy').textContent,/LOCK.*DISMANTLE.*Alloy.*cosmetic.*32.*Apply.*Retry.*Load Game/);assert.equal(api.onboardingAllowed('gear'),false);assert.equal(api.onboardingAllowed('synergy'),false);
  find('#garage-intro-prev-btn').onclick();assert.equal(api.garageIntroContext.step,2);find('#garage-intro-next-btn').onclick();find('#garage-intro-next-btn').onclick();
  assert.equal(api.state,'briefing');assert.equal(api.pendingBriefing,briefing);assert.equal(briefing.introChoice,'play');assert.equal(find('#briefing-depart-btn').disabled,false);assert.equal(find('#briefing-intro-choice').hidden,true);assert.equal(api.garageIntroContext,null);assert.equal(find('#garage-intro-guide').hidden,true);noGameplayChange(g,original);
  api.departMission();assert.equal(api.state,'playing');assert.equal(api.runMode,'story');assert.equal(api.wave,1);
});

test('Skip, Garage Return, Back and controller Back return to the same briefing from each step without starting a run',()=>{
  for(const route of['skip','launch','back','controller'])for(let step=0;step<4;step++){
    const g=begin(),{api,find}=g,original=before(g);for(let i=0;i<step;i++)find('#garage-intro-next-btn').onclick();
    if(route==='controller')api.menuBack();else find(route==='skip'?'#garage-intro-skip-btn':route==='launch'?'#garage-launch-btn':'#garage-back-btn').onclick();
    assert.equal(api.state,'briefing');assert.equal(api.pendingBriefing,g.briefing);assert.equal(find('#briefing-depart-btn').disabled,false);assert.equal(api.garageIntroContext,null);assert.equal(api.runActive,false);noGameplayChange(g,original);
  }
});

test('real Equip autosaves without advancing the guide, applying combat stats or awarding gear',()=>{
  const g=createGame({ruleset:'streamlined-v1'}),{api,find}=g,item=api.normalizeGearItem({...api.generateGear(2),id:'tour-real-weapon',slot:'weapon',power:108,stats:{chargePct:4}});
  api.garage.inventory.push(item);const originalPlayer=playerSnapshot(api.player),checkpoint=json(api.profile.checkpoint),guided=begin(g);find('#garage-intro-next-btn').onclick();
  assert.equal(find('#garage-intro-sample').hidden,true);assert.equal(api.garageIntroContext.step,1);const inventorySize=api.garage.inventory.length;
  api.garageGearAction('weapon',item.id,'equip');assert.equal(api.garage.equipped.weapon,item.id);assert.equal(api.garageIntroContext.step,1);assert.equal(find('#garage-intro-guide').hidden,false);assert.equal(find('#gear-inventory').classList.contains('garage-tour-target'),true);assert.equal(api.garage.inventory.length,inventorySize);assert.equal(playerSnapshot(api.player),originalPlayer);assert.equal(json(api.profile.checkpoint),checkpoint);
  const stored=JSON.parse(g.storage.get('starfighterProfileSlot1'));assert.equal(stored.garage.equipped.weapon,item.id);find('#garage-intro-skip-btn').onclick();assert.equal(api.pendingBriefing,guided.briefing);assert.equal(api.garage.equipped.weapon,item.id);
});

test('aborted intro, full practice, direct practice and a stale different-profile completion do not enter the tour',()=>{
  for(const course of['intro','full'])for(const completed of[false,true]){
    const g=createGame({ruleset:'streamlined-v1'});overlay(g);g.api.openMissionBriefing('story',1);const briefing=g.api.pendingBriefing;
    if(course==='intro')g.find('#briefing-training-btn').onclick();else g.api.openFlightSchool(false,'full');g.api.closeFlightSchool(completed);
    assert.equal(g.api.state,course==='intro'&&completed?'garage':'briefing');assert.equal(!!g.api.garageIntroContext,course==='intro'&&completed);assert.equal(g.api.pendingBriefing,briefing);
  }
  const direct=createGame();overlay(direct);direct.api.openFlightSchool(false,'intro');direct.api.closeFlightSchool(true);assert.equal(direct.api.garageIntroContext,null);assert.equal(direct.api.state,'menu');
  const switched=createGame();overlay(switched);switched.api.openMissionBriefing('story',1);switched.find('#briefing-training-btn').onclick();switched.api.switchProfile(1);const current=json(switched.api.profile);switched.api.closeFlightSchool(true);assert.equal(switched.api.garageIntroContext,null);assert.equal(json(switched.api.profile),current);
});

test('menu, reset, profile switching and new pilot creation invalidate the tour and stale actions cannot return the old briefing',()=>{
  for(const route of['menu','reset','switch','new']){
    const g=begin(),{api,find}=g,old=api.pendingBriefing,next=find('#garage-intro-next-btn').onclick,skip=find('#garage-intro-skip-btn').onclick;
    if(route==='menu')api.goMenu();else if(route==='reset')api.reset();else if(route==='switch')api.switchProfile(1);else{g.sandbox.confirm=()=>true;api.newGame()}
    assert.equal(api.garageIntroContext,null);assert.equal(find('#garage-intro-guide').hidden,true);next();skip();assert.notEqual(api.garageIntroContext?.briefing,old);assert.equal(find('#garage-intro-guide').hidden,true);
  }
});

test('tour exit preserves the existing capacity and checkpoint replacement guards on Depart',()=>{
  const g=createGame({ruleset:'streamlined-v1'});g.api.start('story');g.api.goMenu();const checkpoint=json(g.api.profile.checkpoint);const guided=begin(g);g.find('#garage-intro-skip-btn').onclick();assert.equal(g.api.pendingBriefing,guided.briefing);g.api.departMission();assert.equal(g.api.state,'briefing');assert.equal(json(g.api.profile.checkpoint),checkpoint);
  for(let i=0;i<33;i++)g.api.garage.inventory.push(g.api.normalizeGearItem({...g.api.generateGear(0),id:'over-'+i}));g.api.departMission();assert.equal(g.api.state,'garage');assert.equal(g.api.garageIntroContext,null);assert.equal(g.find('#garage-launch-btn').disabled,true);assert.match(g.find('#profile-save-status').textContent,/DISMANTLE TO 32/);assert.equal(json(g.api.profile.checkpoint),checkpoint);
});

test('ordinary Garage and cleared-round Apply retain their existing routes after the tour',()=>{
  const g=begin(),{api,find}=g;find('#garage-intro-skip-btn').onclick();api.goMenu();find('#garage-menu-btn').onclick();assert.equal(find('#garage-intro-guide').hidden,true);assert.equal(find('#garage-launch-btn').textContent,'LAUNCH WITH LOADOUT');assert.equal(find('#garage-back-btn').textContent,'MAIN MENU');find('#garage-back-btn').onclick();assert.equal(api.state,'menu');
  api.start('story');api.presentTacticalRetrofit();const player=api.player;player.hp=2;player.shield=1;const saved=before(g);api.openRoundGarage();assert.equal(api.garageIntroContext,null);assert.ok(api.garageRunContext);assert.equal(find('#garage-launch-btn').textContent,'APPLY & RETURN TO ROUND');find('#garage-launch-btn').onclick();assert.equal(api.state,'upgrade');assert.equal(api.player,player);assert.equal(api.player.hp,2);assert.equal(api.player.shield,1);assert.equal(json(api.garage),saved.garage);
});

test('combat drill inputs lead with the actual fire button before precision and movement',()=>{
  const lesson=id=>({id,copy:'',tip:'',keys:[],goals:[]});const {api}=createGame();
  assert.deepEqual(Array.from(api.formatInputLesson(lesson('cores')).inputs,x=>x.action).slice(0,3),['fire','precision','up']);
  for(const id of['spectrum','support'])assert.equal(api.formatInputLesson(lesson(id)).inputs[0].action,'fire');
});

const report={generatedAt:new Date().toISOString(),sourceHashes:Object.fromEntries(Object.entries(snapshots).map(([file,source])=>[file,crypto.createHash('sha256').update(source).digest('hex')])),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/garage-intro-v159-verification.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(root,'artifacts/garage-intro-v159-verification.txt'),results.map(r=>(r.passed?'PASS ':'FAIL ')+r.name+(r.error?'\n'+r.error:'')).join('\n')+'\n');
console.log(`${report.passed} Garage intro check groups passed, ${report.failed} failed`);if(report.failed)process.exitCode=1;
