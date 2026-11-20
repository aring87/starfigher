#!/usr/bin/env node
'use strict';
// Actual game lifecycle and combat paths, in private VM storage. These checks
// exercise the production default; the shared historical fixture stays classic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');
support=support.slice(0,support.indexOf('\ntest(')).replace('globalThis.__gameTest = {',`globalThis.__gameTest = {
  get runRuleset(){return runRuleset},get progression(){return runProgression},get score(){return score},
  get victoryDelay(){return victoryDelay},get runEpoch(){return runEpoch},
  chooseRunService,chooseRunPerk,renderRunService,renderRunPerks,queueRunDoctrine,
  restartCurrentRun,bitPositions,collectShieldPickup,applyRunPerks,chooseBriefingIntro,
  formatOnboardingHint,pollController,applyControlBindings,get controlBindings(){return controlBindings},
  installProgression(value){const checked=runRewards.validate(value);if(!checked)throw new Error('Invalid test progression fixture');runProgression=checked;applyRunPerks()},
`);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const {createGame}=isolated.exports,model=require('../run-progression.js'),results=[];
const plain=value=>JSON.parse(JSON.stringify(value)),near=(actual,expected,label='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} != ${expected}`);
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function game(mode='story',options={}){const g=createGame({ruleset:'streamlined-v1',...options});g.api.start(mode);return g}
function reload(g){const next=createGame({ruleset:'streamlined-v1',initialStorage:[...g.storage]});next.api.loadGame();return next}
function all(node){return[node,...(node.children||[]).flatMap(all)]}
function service(g,id){const node=all(g.find('#upgrade-cards')).find(node=>node.dataset.service===id);assert.ok(node,'Missing service '+id);return node}
function perk(g,id){const node=all(g.find('#skill-paths')).find(node=>node.dataset.perk===id);assert.ok(node,'Missing perk '+id);return node}
function setPerks(g,perks){g.api.installProgression({...plain(model.fresh()),perks});}
function draft(g,wave=g.api.wave){g.api.setWave(wave);g.api.presentBossDoctrine('INTEGRATION APEX',()=>g.api.advanceAfterApex(wave+1),false);return plain(g.api.progression.offer)}
function desiredDraft(g,id,wave=g.api.wave){const a=g.api,base=plain(a.progression);a.setWave(wave);a.installProgression({...base,offer:[id,...model.catalogue.map(p=>p.id).filter(value=>value!==id&&!base.perks.includes(value)).slice(0,2)],pending:'perk',pendingWave:wave});draft(g,wave);return perk(g,id)}
function defeatElite(g){g.api.makeMiniBoss();g.api.miniBoss.hp=0;g.api.update(0);}
function defeatApex(g){g.api.makeBoss();g.api.handleBossDefeat(g.api.boss);}
function breakCore(g){g.api.makeBoss();const boss=g.api.boss,node=g.api.activeWeakNodes(boss).find(node=>!node.destroyed);assert.ok(node);const hp=node.hp;g.api.damageWeakNode(boss,node,hp);return{boss,node,hp}}
function storedProfile(profile){return[['starfighterProfileSlot1',JSON.stringify(profile)]]}
function key(g,type,code){g.sandbox.dispatchEvent({type,code,repeat:false,target:g.document.body})}

check('New Game departure uses the untouched streamlined default and leaves permanent gear intact',()=>{
 const g=createGame({ruleset:'streamlined-v1'}),a=g.api,item=a.normalizeGearItem({id:'rolled-keep',slot:'weapon',tier:2,name:'Vigil Plasma Fork',gunVariant:'fork',alignment:'VANGUARD',power:114,stats:{damagePct:5,chargePct:4},locked:true});
 a.garage.inventory=[item];a.garage.equipped.weapon=item.id;const before=plain(a.garage);a.launchNewRun();assert.equal(a.state,'briefing');a.chooseBriefingIntro(false);a.departMission();
 assert.equal(a.state,'playing');assert.equal(a.runRuleset,'streamlined-v1');assert.equal(a.profile.checkpoint.ruleset,'streamlined-v1');assert.deepEqual(plain(a.progression),plain(model.fresh()));assert.deepEqual(plain(a.garage),before);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
 const historical=createGame();historical.api.start('story');assert.equal(historical.api.profile.checkpoint.ruleset,'classic-v1','Shared old regression fixture must remain classic');
});

check('real elite defeat saves a pending service before the victory delay and banks loot once',()=>{
 const g=game(),a=g.api;defeatElite(g);assert.equal(a.state,'playing');assert.ok(a.victoryDelay);assert.equal(a.runStats.miniBosses,1);assert.equal(a.garage.inventory.length,1);assert.equal(a.runLoot.length,0);
 assert.equal(a.profile.checkpoint.segment,'module');assert.equal(a.profile.checkpoint.progression.pending,'service');assert.equal(a.profile.checkpoint.progression.pendingWave,1);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
 const restored=reload(g);assert.equal(restored.api.state,'upgrade');assert.equal(restored.api.garage.inventory.length,1);assert.equal(restored.api.runStats.miniBosses,1);assert.equal(restored.api.player.hp,a.player.hp);assert.deepEqual(plain(restored.api.progression),plain(a.progression));
 a.flushVictoryDelay();assert.equal(a.state,'upgrade');assert.equal(a.garage.inventory.length,1);assert.deepEqual(plain(a.player.retrofits),{});assert.equal(a.player.skillPoints,0);
});

check('recovery applies exactly one hull, one shield or twelve base DOSE and rejects duplicate callbacks',()=>{
 for(const choice of['repair','shield','dose']){
  const g=game(),a=g.api;a.player.hp=1;a.player.shield=0;a.player.dose=0;a.presentTacticalRetrofit();const button=service(g,choice),beforeScore=a.score;button.onclick();
  assert.equal(a.state,'playing');assert.equal(a.player.hp,choice==='repair'?2:1);assert.equal(a.player.shield,choice==='shield'?1:0);near(a.player.dose,choice==='dose'?12:0);assert.equal(a.score,beforeScore+100);assert.equal(a.runSegment,'postElite');assert.deepEqual(plain(a.progression.rewards),['service:1']);assert.equal(a.progression.pending,null);
  const snapshot=JSON.stringify({player:a.player,progress:a.progression,score:a.score});button.onclick();a.chooseRunService(choice);assert.equal(JSON.stringify({player:a.player,progress:a.progression,score:a.score}),snapshot);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
  const next=reload(g);assert.equal(next.api.state,'playing');assert.equal(next.api.runSegment,'postElite');assert.equal(next.api.player.hp,a.player.hp);assert.equal(next.api.player.shield,a.player.shield);near(next.api.player.dose,a.player.dose);
 }
});

check('full reserves disable unavailable recovery and Continue consumes no resources or score',()=>{
 const g=game(),a=g.api;a.player.hp=a.player.maxHp;a.player.shield=4;a.player.dose=100;a.presentTacticalRetrofit();for(const id of['repair','shield','dose']){assert.equal(service(g,id).disabled,true);a.chooseRunService(id);assert.equal(a.state,'upgrade')}
 const score=a.score;assert.equal(service(g,'skip').textContent,'CONTINUE');service(g,'skip').onclick();assert.equal(a.state,'playing');assert.equal(a.player.hp,a.player.maxHp);assert.equal(a.player.shield,4);assert.equal(a.player.dose,100);assert.equal(a.score,score);assert.deepEqual(plain(a.progression.rewards),['service:1']);
});

check('recovery DOSE is capped and a skipped recovery persists across load',()=>{
 const g=game(),a=g.api;a.player.dose=97;a.presentTacticalRetrofit();service(g,'dose').onclick();assert.equal(a.player.dose,100);
 a.setWave(2);a.presentTacticalRetrofit();const before={hp:a.player.hp,shield:a.player.shield,dose:a.player.dose,score:a.score};service(g,'skip').onclick();assert.deepEqual({hp:a.player.hp,shield:a.player.shield,dose:a.player.dose,score:a.score},before);const r=reload(g);assert.deepEqual(plain(r.api.progression.rewards),['service:1','service:2']);assert.equal(r.api.progression.pending,null);
});

check('recovery recharge is exactly twelve DOSE with Vector and other combat DOSE multipliers',()=>{
 for(const doseGain of[1.05,1.5]){const g=game(),a=g.api;a.player.doseGain=doseGain;a.player.dose=20;a.presentTacticalRetrofit();service(g,'dose').onclick();near(a.player.dose,32,'Recovery must match its card');a.player.dose=97;a.setWave(2);a.presentTacticalRetrofit();service(g,'dose').onclick();near(a.player.dose,100,'Recovery still caps at 100');a.player.gun=5;a.player.dose=0;a.collectCombatPickup({type:'power'});near(a.player.dose,2*doseGain,'Combat pickups must retain the multiplier')}
});

check('onboarding explains recovery and three run slots while classic hints retain their terminology',()=>{
 const g=game(),a=g.api,moduleHint=a.formatOnboardingHint({title:'ONE FIELD MODULE',copy:'OLD MODULE COPY'}),perkHint=a.formatOnboardingHint({title:'ONE DOCTRINE POINT',copy:'OLD DOCTRINE COPY'});
 assert.equal(moduleHint.title,'RECOVERY SERVICE');assert.match(moduleHint.copy,/repair, shield or Delta/);assert.match(moduleHint.copy,/applies once/);assert.match(moduleHint.copy,/Garage/);assert.equal(perkHint.title,'THREE RUN PERK SLOTS');assert.match(perkHint.copy,/replace one or keep your build/);assert.match(perkHint.copy,/rolled gear stays in the Garage/);
 a.start('story',1,'classic-v1');assert.equal(a.formatOnboardingHint({title:'ONE FIELD MODULE',copy:'MODULE COPY'}).title,'ONE FIELD MODULE');assert.equal(a.formatOnboardingHint({title:'ONE DOCTRINE POINT',copy:'DOCTRINE COPY'}).title,'ONE DOCTRINE POINT');
});

check('fixed controller navigation and confirmation operate the live recovery and perk replacement screens',()=>{
 const pad={index:0,id:'Private Standard Pad',connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))},g=game('story',{navigator:{getGamepads:()=>[pad]}}),a=g.api,B=g.sandbox.StarfighterBindings;
 a.applyControlBindings(B.rebind(a.controlBindings,'controller','fire',0,5).bindings);
 // Supply only browser layout/focus primitives absent from the shared DOM mock.
 // Actual controls-ui navigation, gamepad edges and reward handlers remain live.
 g.sandbox.getComputedStyle=()=>({visibility:'visible',display:'block',overflow:'visible'});
 const query=g.document.querySelector;g.document.querySelector=selector=>selector==='.screen.active'?g.find(a.state==='upgrade'?'#upgrade':'#skill-tree'):query(selector);
 function targets(){const nodes=a.state==='upgrade'?all(g.find('#upgrade-cards')).filter(n=>n.tagName==='BUTTON'):[...all(g.find('#skill-paths')).filter(n=>n.tagName==='BUTTON'),g.find('#tree-continue')];nodes.forEach((node,index)=>{node.getClientRects=()=>[{}];node.closest=()=>null;node.getBoundingClientRect=()=>({left:10,right:210,top:70*index,bottom:70*index+40,width:200,height:40});node.focus=()=>g.document.activeElement=node;node.click=()=>{if(!node.disabled)node.onclick?.()}});return nodes}
 for(const id of['#upgrade','#skill-tree']){const root=g.find(id);root.querySelectorAll=()=>targets();root.contains=node=>targets().includes(node);root.querySelector=selector=>selector.includes('[data-perk]')?targets().find(node=>node.dataset.perk&&!node.disabled):selector.includes('[data-node]')?targets().find(node=>node.dataset.node&&!node.disabled):null}
 g.find('#skill-paths').querySelector=selector=>{const nodes=targets();if(selector==='[data-replace-perk]')return nodes.find(node=>node.dataset.replacePerk);const perk=selector.match(/^\[data-perk="([^"]+)"\]$/)?.[1];return perk?nodes.find(node=>node.dataset.perk===perk):null};
 let now=0;function press(index){a.pollController(now+=400);pad.buttons[index]={pressed:true,value:1};a.pollController(now+=400);pad.buttons[index]={pressed:false,value:0};a.pollController(now+=400)}
 a.pollController();a.player.hp=1;a.presentTacticalRetrofit();press(13);assert.ok(g.document.activeElement.dataset.service);press(12);assert.equal(g.document.activeElement.dataset.service,'repair');press(0);assert.equal(a.player.hp,2);assert.equal(a.state,'playing');assert.equal(a.shots.length,0);
 setPerks(g,['precisionRelay','bitReclaimer','secondChance']);draft(g);
 const firstOffer=g.document.activeElement,incoming=firstOffer.dataset.perk;assert.ok(incoming,'Controller focus enters an available perk when the draft opens');
 press(13);assert.notEqual(g.document.activeElement,firstOffer);press(12);assert.equal(g.document.activeElement,firstOffer);press(0);
 assert.ok(all(g.find('#skill-paths')).some(n=>n.dataset.replacePerk));
 for(let step=0;step<8&&!g.document.activeElement.dataset.replacePerk;step++)press(13);
 const outgoing=g.document.activeElement.dataset.replacePerk;assert.ok(outgoing);press(0);assert.equal(a.state,'playing');assert.equal(a.wave,2);assert.equal(a.progression.perks.length,3);assert.ok(a.progression.perks.includes(incoming));assert.ok(!a.progression.perks.includes(outgoing));assert.equal(a.shots.length,0);assert.equal(a.player.charge,0);
});

check('service Garage return preserves pending reward and spent resources while applying changed gear once',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay','secondChance']);a.player.secondChanceReady=false;a.player.hp=1;a.player.shield=0;a.player.dose=43;a.presentTacticalRetrofit();const before=plain(a.progression);a.openRoundGarage();assert.equal(a.state,'garage');
 const item=a.normalizeGearItem({id:'live-refit',slot:'weapon',tier:2,name:'Siege Cannon',gunVariant:'siege',alignment:'VANGUARD',power:114,stats:{damagePct:5,chargePct:4}});a.garage.inventory.push(item);a.garage.equipped.weapon=item.id;a.finishRoundGarage();
 assert.equal(a.state,'upgrade');assert.deepEqual(plain(a.progression),before);assert.equal(a.player.hp,1);assert.equal(a.player.shield,0);assert.equal(a.player.dose,43);assert.equal(a.player.secondChanceReady,false);assert.equal(a.player.weakBreakDose,6);const damage=a.player.damage;
 for(let i=0;i<4;i++)a.rebuildRunLoadout();near(a.player.damage,damage);assert.equal(a.player.hp,1);assert.equal(a.player.shield,0);assert.equal(a.player.dose,43);assert.equal(a.player.secondChanceReady,false);assert.equal(a.player.weakBreakDose,6);
 const r=reload(g);assert.equal(r.api.state,'upgrade');assert.equal(r.api.garage.equipped.weapon,item.id);near(r.api.player.damage,damage);assert.equal(r.api.player.secondChanceReady,false);assert.deepEqual(plain(r.api.progression),before);
});

check('real apex defeat saves three stable unowned offers before its delay with no classic reward layers',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay']);defeatApex(g);assert.equal(a.runStats.normalBosses,1);assert.equal(a.player.rank,2);assert.equal(a.player.skillPoints,0);assert.equal(a.player.skillsSpent,0);assert.deepEqual(plain(a.player.skills),{});assert.deepEqual(plain(a.player.retrofits),{});
 const offer=plain(a.progression.offer);assert.equal(offer.length,3);assert.equal(new Set(offer).size,3);assert.ok(!offer.includes('precisionRelay'));assert.equal(a.profile.checkpoint.segment,'doctrine');assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
 const r=reload(g);assert.equal(r.api.state,'skilltree');assert.deepEqual(plain(r.api.progression.offer),offer);assert.equal(r.api.garage.inventory.length,1);r.api.openRoundGarage();r.api.finishRoundGarage();assert.deepEqual(plain(r.api.progression.offer),offer);r.api.saveRunCheckpoint('doctrine');assert.deepEqual(plain(r.api.progression.offer),offer);
 a.flushVictoryDelay();assert.equal(a.state,'skilltree');assert.deepEqual(plain(a.progression.offer),offer);a.goMenu();a.loadGame();assert.deepEqual(plain(a.progression.offer),offer);
});

check('three apex choices fill three slots and a fourth choice requires an explicit replacement',()=>{
 const g=game(),a=g.api;
 for(let wave=1;wave<=3;wave++){const offered=draft(g,wave);perk(g,offered[0]).onclick();assert.equal(a.wave,wave+1);assert.equal(a.progression.perks.length,wave);assert.equal(a.progression.pending,null);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint))}
 const before=plain(a.progression.perks),offer=draft(g,4),score=a.score;a.chooseRunPerk(offer[0]);assert.equal(a.state,'skilltree');assert.deepEqual(plain(a.progression.perks),before);assert.equal(a.score,score);
 perk(g,offer[0]).onclick();const replacement=all(g.find('#skill-paths')).find(node=>node.dataset.replacePerk===before[0]);assert.ok(replacement);assert.equal(a.progression.perks.length,3);replacement.onclick();
 assert.equal(a.wave,5);assert.equal(a.progression.perks.length,3);assert.ok(a.progression.perks.includes(offer[0]));assert.ok(!a.progression.perks.includes(before[0]));assert.deepEqual(plain(model.effectConfig(a.progression.perks)),Object.fromEntries(Object.keys(model.effectConfig([])).map(key=>[key,a.player[key]])));assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
 const snapshot=JSON.stringify({progress:a.progression,score:a.score});replacement.onclick();assert.equal(JSON.stringify({progress:a.progression,score:a.score}),snapshot);
});

check('Keep Build consumes the offer and resumes without changing perks, stats or score',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay','bitReclaimer','deltaReserve']);draft(g);const before={perks:plain(a.progression.perks),damage:a.player.damage,score:a.score};g.find('#tree-continue').onclick();
 assert.equal(a.state,'playing');assert.equal(a.wave,2);assert.deepEqual(plain(a.progression.perks),before.perks);assert.equal(a.player.damage,before.damage);assert.equal(a.score,before.score);assert.ok(a.progression.rewards.includes('perk:1'));assert.equal(a.progression.pending,null);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));
});

check('in-field run perk inspection offers no rewards and old module or doctrine callbacks cannot add stats',()=>{
 const g=game(),a=g.api;a.openSkillTree();assert.equal(a.state,'skilltree');assert.equal(all(g.find('#skill-paths')).filter(n=>n.dataset.perk).length,0);const before=JSON.stringify({player:a.player,progress:a.progression,score:a.score});
 a.learnSkill(a.skillPaths[0].nodes[0]);a.chooseTacticalRetrofit(a.tacticalRetrofitChoices()[0]);assert.equal(JSON.stringify({player:a.player,progress:a.progression,score:a.score}),before);a.closeSkillTree();assert.equal(a.state,'playing');
 a.presentTacticalRetrofit();a.openSkillTree();assert.equal(a.state,'upgrade','Inspect must not replace a pending service screen');
});

check('stale reward buttons from a previous mission cannot consume the current mission reward',()=>{
 const g=game(),a=g.api;a.player.hp=1;a.presentTacticalRetrofit();const old=service(g,'repair');service(g,'skip').onclick();a.setWave(2);a.presentTacticalRetrofit();const before=JSON.stringify({progress:a.progression,player:a.player,score:a.score});old.onclick();assert.equal(JSON.stringify({progress:a.progression,player:a.player,score:a.score}),before);
 service(g,'skip').onclick();const offer=draft(g,2),oldPerk=perk(g,offer[0]);a.closeSkillTree();draft(g,3);const next=JSON.stringify({progress:a.progression,player:a.player,score:a.score});oldPerk.onclick();assert.equal(JSON.stringify({progress:a.progression,player:a.player,score:a.score}),next);
});

check('stale reward buttons from before Load or Restart cannot mutate a new run epoch',()=>{
 const g=game(),a=g.api;a.player.hp=1;a.presentTacticalRetrofit();const old=service(g,'repair');a.goMenu();a.loadGame();const snapshot=JSON.stringify({progress:a.progression,player:a.player,score:a.score});old.onclick();assert.equal(JSON.stringify({progress:a.progression,player:a.player,score:a.score}),snapshot);
 service(g,'skip').onclick();const offers=draft(g),oldPerk=perk(g,offers[0]);a.restartCurrentRun();draft(g);const next=JSON.stringify({progress:a.progression,player:a.player,score:a.score});oldPerk.onclick();assert.equal(JSON.stringify({progress:a.progression,player:a.player,score:a.score}),next);
});

check('Precision Relay adds exactly six base DOSE on a real core break and removed perks stop doing so',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay']);a.player.dose=0;let broken=breakCore(g);near(a.player.dose,broken.hp*.015+6);const dose=a.player.dose;a.damageWeakNode(broken.boss,broken.node,999);near(a.player.dose,dose,'Destroyed core must not repay');
 setPerks(g,[]);a.player.dose=0;broken=breakCore(g);near(a.player.dose,broken.hp*.015);
});

check('Core Surge grants four seconds and six percent actual movement/charge without borrowing gear strength',()=>{
 const g=game(),a=g.api;setPerks(g,['coreSurge']);a.player.lootSurgePower=.1;a.player.lootSurge=0;breakCore(g);near(a.player.lootSurge,4);near(a.player.lootSurgeStrength,.06);a.boss.intro=99;const x=a.player.x;key(g,'keydown','KeyD');key(g,'keydown','KeyZ');a.update(.1);near(a.player.x-x,a.player.speed*.1*1.06);near(a.player.charge,.1*a.player.chargeSpeed*1.06/1.25);key(g,'keyup','KeyD');key(g,'keyup','KeyZ');
 a.player.lootSurge=7;a.player.lootSurgeStrength=.1;breakCore(g);near(a.player.lootSurge,7);near(a.player.lootSurgeStrength,.1,'Core reward must not downgrade an existing gear/epic Surge');
});

check('Bit Reclaimer uses actual hostile-shot blocking and removal stops the DOSE reward',()=>{
 const g=game(),a=g.api;setPerks(g,['bitReclaimer']);a.player.bits=1;a.player.dose=0;const block=()=>{const b=a.bitPositions()[0];a.enemyShots.push({x:b.x,y:b.y,px:b.x,py:b.y,vx:0,vy:0,r:2,life:3});a.update(0)};block();near(a.player.dose,.4);assert.equal(a.enemyShots.length,0);setPerks(g,[]);block();near(a.player.dose,.4);assert.equal(a.enemyShots.length,0);
});

check('Delta Reserve changes both capped shield and capped kit surplus and removes cleanly',()=>{
 const g=game(),a=g.api;setPerks(g,['deltaReserve']);a.player.shield=4;a.player.gun=5;a.player.dose=0;a.collectShieldPickup();near(a.player.dose,5);a.collectCombatPickup({type:'power'});near(a.player.dose,10);assert.match(g.find('#loot-toast').textContent,/\+5 DOSE/);
 setPerks(g,[]);a.collectShieldPickup();near(a.player.dose,12);a.collectCombatPickup({type:'power'});near(a.player.dose,14);assert.match(g.find('#loot-toast').textContent,/\+2 DOSE/);
});

check('Second Chance is spent once, survives save/load and refits, and refreshes next mission',()=>{
 const g=game(),a=g.api;setPerks(g,['secondChance']);assert.equal(a.player.secondChanceReady,true);a.player.hp=1;a.player.shield=0;a.player.inv=0;a.damage();assert.equal(a.player.hp,1);assert.equal(a.player.secondChanceReady,false);a.saveRunCheckpoint('mission');const r=reload(g);assert.equal(r.api.player.secondChanceReady,false);r.api.rebuildRunLoadout();assert.equal(r.api.player.secondChanceReady,false);r.api.advanceAfterApex(2);assert.equal(r.api.player.secondChanceReady,true);r.api.player.inv=0;r.api.damage();assert.equal(r.api.player.hp,1);assert.equal(r.api.player.secondChanceReady,false);r.api.player.inv=0;r.api.damage();assert.equal(r.api.state,'gameover');
});

check('replacing Second Chance removes its lethal guard immediately',()=>{
 const g=game(),a=g.api;setPerks(g,['secondChance','precisionRelay','coreSurge']);const button=desiredDraft(g,'deltaReserve');button.onclick();const replacement=all(g.find('#skill-paths')).find(n=>n.dataset.replacePerk==='secondChance');assert.ok(replacement);replacement.onclick();assert.equal(a.player.secondChance,false);assert.equal(a.player.secondChanceReady,false);a.player.hp=1;a.player.shield=0;a.player.inv=0;a.damage();assert.equal(a.state,'gameover');
});

check('Field Nanites heals on apex defeat exactly once with no extra heal on Continue, refit or Load',()=>{
 const g=game(),a=g.api;setPerks(g,['fieldNanites']);a.player.hp=1;defeatApex(g);assert.equal(a.player.hp,2);assert.ok(a.progression.rewards.includes('apexRepair:1'));const r=reload(g);assert.equal(r.api.player.hp,2);r.api.openRoundGarage();r.api.finishRoundGarage();assert.equal(r.api.player.hp,2);r.api.closeSkillTree();assert.equal(r.api.wave,2);assert.equal(r.api.player.hp,2);r.api.saveRunCheckpoint();assert.equal(reload(r).api.player.hp,2);
 a.flushVictoryDelay();assert.equal(a.player.hp,2);a.closeSkillTree();assert.equal(a.player.hp,2);
});

check('newly selecting Field Nanites does not retroactively repair the defeated apex',()=>{
 const g=game(),a=g.api;a.player.hp=1;const button=desiredDraft(g,'fieldNanites');button.onclick();assert.equal(a.wave,2);assert.equal(a.player.hp,1);defeatApex(g);assert.equal(a.player.hp,2);assert.ok(a.progression.rewards.includes('apexRepair:2'));
});

check('perk replacement clears every outgoing effect and repeated live refits never accumulate effects',()=>{
 for(const outgoing of model.catalogue.map(p=>p.id)){
  const g=game(),a=g.api;setPerks(g,[outgoing]);const before=plain(a.garage);a.player.hp=1;a.player.shield=0;a.player.dose=27;a.player.secondChanceReady=false;
  for(let pass=0;pass<3;pass++)a.rebuildRunLoadout();assert.deepEqual(plain(a.garage),before);assert.equal(a.player.hp,1);assert.equal(a.player.shield,0);assert.equal(a.player.dose,27);for(const[key,value]of Object.entries(model.effectConfig([outgoing])))assert.equal(a.player[key],value,outgoing+' '+key);
  setPerks(g,[]);for(const[key,value]of Object.entries(model.effectConfig([])))assert.equal(a.player[key],value,'Removed '+outgoing+' '+key);assert.equal(a.player.secondChanceReady,false);
 }
});

check('streamlined and classic Restart retain their rules, and New Game explicitly selects the new default',()=>{
 for(const ruleset of['streamlined-v1','classic-v1']){const g=game(),a=g.api;a.start('story',1,ruleset);a.restartCurrentRun();assert.equal(a.runRuleset,ruleset);assert.equal(a.profile.checkpoint.ruleset,ruleset);assert.equal(a.player.skillPoints,0);assert.equal(a.progression.perks.length,0)}
 const g=game(),a=g.api;a.start('story',1,'classic-v1');a.goMenu();g.sandbox.confirm=()=>true;a.launchNewRun();a.chooseBriefingIntro(false);a.departMission();assert.equal(a.runRuleset,'streamlined-v1');
});

check('final Story and Rush apex show a final build without a perk draft and Finish clears the checkpoint',()=>{
 for(const mode of['story','rush']){const g=game(mode),a=g.api;setPerks(g,['fieldNanites']);a.setWave(10);a.player.hp=1;defeatApex(g);assert.equal(a.progression.pending,null);assert.equal(a.progression.offer.length,0);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));assert.equal(a.player.hp,2);const r=reload(g);assert.equal(r.api.state,'skilltree');assert.equal(r.find('#tree-continue').textContent,'FINISH RUN');assert.equal(all(r.find('#skill-paths')).filter(n=>n.dataset.perk).length,0);r.find('#tree-continue').onclick();assert.equal(r.api.state,'complete');assert.equal(r.api.profile.checkpoint,null);assert.equal(r.api.runActive,false);r.find('#complete-retry-btn').onclick();assert.equal(r.api.runRuleset,'streamlined-v1');assert.equal(r.api.wave,1);assert.equal(r.api.progression.perks.length,0)}
});

check('unlocked mission replay finishes after one apex without a reward draft or next mission',()=>{
 const g=game(),a=g.api;a.profile.progress.missionsCleared[3]=true;a.start('replay',4);defeatApex(g);assert.equal(a.progression.pending,null);assert.equal(a.progression.offer.length,0);assert.ok(a.validateRunCheckpoint(a.profile.checkpoint));a.flushVictoryDelay();assert.equal(g.find('#tree-continue').textContent,'FINISH RUN');a.closeSkillTree();assert.equal(a.state,'complete');assert.equal(a.wave,4);assert.equal(a.profile.checkpoint,null);assert.equal(a.runStats.normalBosses,1);
});

check('old untagged checkpoints load recorded classic stats and keep their original reward screens',()=>{
 const old=createGame(),a=old.api;a.start('story');a.player.damage=1.73;a.player.hp=2;a.player.skillPoints=1;a.learnSkill(a.skillPaths[0].nodes[0]);a.saveRunCheckpoint('mission');delete a.profile.checkpoint.ruleset;delete a.profile.checkpoint.buildVersion;a.saveProfile();const g=reload(old),b=g.api;
 assert.equal(b.runRuleset,'classic-v1');near(b.player.damage,a.player.damage);assert.equal(b.player.skillsSpent,1);assert.equal(b.player.hp,2);b.presentTacticalRetrofit();assert.equal(g.find('#upgrade-title').textContent,'CHOOSE ONE FIELD MODULE');b.chooseTacticalRetrofit(b.tacticalRetrofitChoices()[0]);assert.equal(Object.keys(b.player.retrofits).length,1);b.presentBossDoctrine('LEGACY');assert.equal(b.player.skillPoints,1);assert.match(g.find('#tree-title').textContent,/DOCTRINE/);b.restartCurrentRun();assert.equal(b.runRuleset,'classic-v1');
});

check('valid streamlined checkpoints round trip frozen progression without mutating their source',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay','secondChance','deltaReserve']);a.player.secondChanceReady=false;draft(g);const raw=plain(a.profile.checkpoint),before=JSON.stringify(raw),checked=a.validateRunCheckpoint(raw);assert.ok(checked);assert.equal(JSON.stringify(raw),before);assert.ok(Object.isFrozen(checked.progression));assert.ok(Object.isFrozen(checked.progression.perks));assert.deepEqual(plain(checked.progression),plain(raw.progression));a.saveProfile();const r=reload(g);assert.equal(r.api.runRuleset,'streamlined-v1');assert.equal(r.api.player.secondChanceReady,false);assert.deepEqual(plain(r.api.progression),plain(raw.progression));
});

check('invalid progression, mismatched segments and stale scalar effects are rejected without altering private stored data',()=>{
 const g=game(),a=g.api;setPerks(g,['precisionRelay']);draft(g);const good=plain(a.profile.checkpoint),profile=plain(a.profile),mutations=[
  ['missing progression',cp=>delete cp.progression],['unknown perk',cp=>cp.progression.perks=['futureElement']],['four perks',cp=>cp.progression.perks=['precisionRelay','coreSurge','bitReclaimer','secondChance']],['duplicate perks',cp=>cp.progression.perks=['precisionRelay','precisionRelay']],['duplicate offers',cp=>cp.progression.offer=[cp.progression.offer[0],cp.progression.offer[0],cp.progression.offer[0]]],['stale wave',cp=>cp.progression.pendingWave=2],['wrong segment',cp=>cp.segment='mission'],['wrong pending kind',cp=>{cp.progression.pending='service';cp.progression.offer=[]}],['array envelope',cp=>cp.player.skills=[]],['effect mismatch',cp=>cp.player.weakBreakDose=99],['legacy skill points',cp=>cp.player.skillPoints=1],['legacy modules',cp=>cp.player.retrofits={fieldPatch:1}],['surge overflow',cp=>cp.player.lootSurgeStrength=1],['extra progression field',cp=>cp.progression.future=true],['bad reward ledger',cp=>cp.progression.rewards=['perk:11']]
 ];
 for(const[label,mutate]of mutations){const bad=plain(good);mutate(bad);assert.equal(a.validateRunCheckpoint(bad),null,label);profile.checkpoint=bad;const entries=storedProfile(profile),raw=JSON.stringify(bad),invalid=createGame({ruleset:'streamlined-v1',initialStorage:entries});assert.equal(invalid.find('#load-game-btn').disabled,true,label);invalid.api.loadGame();invalid.api.goMenu();invalid.api.saveProfile();assert.equal(invalid.api.state,'menu');assert.equal(JSON.stringify(invalid.api.profile.checkpoint),raw,label+' runtime preservation');assert.equal(JSON.stringify(JSON.parse(invalid.storage.get('starfighterProfileSlot1')).checkpoint),raw,label+' backing-store preservation')}
});

check('unknown future rules remain unavailable and preserved through ordinary menu, load and save actions',()=>{
 const g=game(),profile=plain(g.api.profile);profile.checkpoint.ruleset='elements-v99';const raw=JSON.stringify(profile.checkpoint),unsupported=createGame({ruleset:'streamlined-v1',initialStorage:storedProfile(profile)});assert.equal(unsupported.find('#load-game-btn').disabled,true);unsupported.api.loadGame();unsupported.api.goMenu();unsupported.api.saveProfile();assert.equal(JSON.stringify(unsupported.api.profile.checkpoint),raw);assert.equal(JSON.stringify(JSON.parse(unsupported.storage.get('starfighterProfileSlot1')).checkpoint),raw);
});

const passed=results.filter(result=>result.passed).length,failed=results.length-passed;
fs.writeFileSync(path.join(root,'artifacts/streamlined-integration-audit.json'),JSON.stringify({scope:'Live production defaults, real defeat/reward/combat/refit/save/load paths in private VM storage; no real pilots accessed',passed,failed,results},null,2)+'\n');
console.log(`${passed} streamlined live integration checks passed, ${failed} failed`);if(failed)process.exitCode=1;
