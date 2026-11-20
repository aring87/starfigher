#!/usr/bin/env node
'use strict';
// Native pickup, Delta use, shield damage and intermission paths in private VM
// storage. No real pilot state or production source is changed by this probe.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
const label=process.argv.includes('--baseline')?'baseline':'live',sourcePath=label==='baseline'?'artifacts/field-clarity-v155-baseline-game.js':'game.js';
let support=fs.readFileSync(filename,'utf8');
if(label==='baseline')support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",`const source = fs.readFileSync(path.join(root, '${sourcePath}'), 'utf8');`);
support=support.slice(0,support.indexOf('\nconst game = createGame();')).replace('globalThis.__gameTest = {','globalThis.__gameTest = {initializeOnboarding,onboardingAllowed,requestOnboarding,acknowledgeOnboarding,addDose,activateDelta,get onboardingController(){return onboardingController},');
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const {createGame}=isolated.exports,domSource=fs.readFileSync(path.join(__dirname,'verify-onboarding.cjs'),'utf8');
const Element=new Function(domSource.slice(domSource.indexOf('function walk('),domSource.indexOf('function harness('))+'\nreturn Element;')();
function boot(){
 const g=createGame({ruleset:'streamlined-v1'}),doc={activeElement:null,createElement(tag){return new Element(tag,doc)},getElementById(id){return doc.head.children.find(n=>n.id===id)||null}};doc.head=new Element('head',doc);doc.body=new Element('body',doc);
 for(const id of ['#game-shell','#onboarding-module-anchor','#onboarding-doctrine-anchor','#onboarding-garage-anchor']){const e=g.find(id);e.ownerDocument=doc;e.appendChild=function(child){child.remove();child.parentElement=this;this.children.push(child);return child};}
 vm.runInNewContext(fs.readFileSync(path.join(root,'onboarding.js'),'utf8'),{window:g.sandbox,document:doc},{filename:'onboarding.js'});g.api.initializeOnboarding();g.api.start('story');return{...g,guide:g.api.onboardingController};
}
function clearBoss(g){const a=g.api;a.handleBossDefeat(a.boss);a.flushVictoryDelay();assert.equal(a.state,'skilltree');a.closeSkillTree();assert.equal(a.state,'playing');assert.equal(a.wave,2);g.guide.tick(0);}
function seen(g,id){return g.api.profile.progress.onboardingSeen.includes(id);}
function spendShield(g){g.api.player.inv=0;const hp=g.api.player.hp;g.api.damage(1,{kind:'projectile'});assert.equal(g.api.player.shield,0);assert.equal(g.api.player.hp,hp);}
function spendDelta(g){g.api.activateDelta();assert.equal(g.api.player.dose,0);}
const results=[];
function check(name,run){try{const details=run();results.push({name,passed:true,details});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}}
check('Delta earned and spent during an apex cannot announce ready during the next field',()=>{
 const g=boot(),a=g.api;a.makeBoss();a.boss.intro=0;a.addDose(100);assert.equal(g.guide.activeId,null);assert.ok(g.guide.queuedIds.includes('delta'));spendDelta(g);clearBoss(g);assert.equal(g.guide.activeId,null);g.guide.tick(20);assert.equal(g.guide.activeId,null);assert.equal(seen(g,'delta'),false);assert.ok(g.guide.queuedIds.includes('delta'));return{dose:a.player.dose};
});
check('an apex shield consumed before departure cannot announce shield ready at zero charges',()=>{
 const g=boot(),a=g.api;a.makeBoss();a.collectCombatPickup({type:'shield'});assert.equal(a.player.shield,1);assert.equal(g.guide.activeId,null);spendShield(g);clearBoss(g);assert.equal(g.guide.activeId,null);g.guide.tick(20);assert.equal(g.guide.activeId,null);assert.equal(seen(g,'shield'),false);assert.ok(g.guide.queuedIds.includes('shield'));return{shield:a.player.shield};
});
check('a displayed Delta note suspends when fired, resumes on a true refill, and remembers only valid visible dwell',()=>{
 const g=boot(),a=g.api;a.addDose(100);g.guide.tick(1);assert.equal(g.guide.activeId,'delta');spendDelta(g);g.guide.tick(30);assert.equal(g.guide.activeId,null);assert.equal(seen(g,'delta'),false);a.addDose(100);g.guide.tick(7.99);assert.equal(g.guide.activeId,'delta');assert.equal(seen(g,'delta'),false);g.guide.tick(.01);assert.equal(seen(g,'delta'),true);assert.equal(g.guide.activeId,null);return{validVisibleSeconds:9};
});
check('a displayed shield note suspends after the final shield hit and resumes after collection',()=>{
 const g=boot(),a=g.api;a.collectCombatPickup({type:'shield'});g.guide.tick(1);assert.equal(g.guide.activeId,'shield');spendShield(g);g.guide.tick(30);assert.equal(g.guide.activeId,null);assert.equal(seen(g,'shield'),false);a.collectCombatPickup({type:'shield'});g.guide.tick(7.99);assert.equal(g.guide.activeId,'shield');assert.equal(seen(g,'shield'),false);g.guide.tick(.01);assert.equal(seen(g,'shield'),true);return{validVisibleSeconds:9};
});
check('an unspent boss-earned Delta note remains eligible after the intermission',()=>{
 const g=boot(),a=g.api;a.makeBoss();a.addDose(100);assert.equal(g.guide.activeId,null);clearBoss(g);assert.equal(g.guide.activeId,'delta');assert.equal(a.player.dose,100);g.guide.tick(9);assert.equal(seen(g,'delta'),true);
});
check('invalid pending combat notes do not block the actual recovery-service decision',()=>{
 const g=boot(),a=g.api;a.makeBoss();a.boss.intro=0;a.addDose(100);spendDelta(g);a.handleBossDefeat(a.boss);a.flushVictoryDelay();a.closeSkillTree();a.presentTacticalRetrofit(()=>{});g.guide.tick(0);assert.equal(g.guide.activeId,'module');assert.equal(g.find('#onboarding-module-anchor').children.length,1);assert.ok(g.guide.queuedIds.includes('delta'));assert.equal(seen(g,'delta'),false);
});
check('pause still freezes a valid hint and the unseen-resource gate changes no checkpoint resources',()=>{
 const g=boot(),a=g.api;a.collectCombatPickup({type:'shield'});g.guide.tick(2);a.pause();g.guide.tick(50);assert.equal(g.guide.activeId,null);assert.equal(seen(g,'shield'),false);a.pause();g.guide.tick(6.99);assert.equal(g.guide.activeId,'shield');assert.equal(seen(g,'shield'),false);const checkpoint=JSON.stringify(a.profile.checkpoint);g.guide.tick(.01);assert.equal(seen(g,'shield'),true);assert.equal(JSON.stringify(a.profile.checkpoint),checkpoint);assert.equal(a.player.shield,1);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;
const report={sourcePath,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,sourcePath))).digest('hex'),passed,failed,results,limits:'Logic and DOM lifecycle with native game events in private VM storage; no browser render, actual input device or human-readability judgment.'};
fs.writeFileSync(path.join(root,`artifacts/guidance-eligibility-v155-${label}.json`),JSON.stringify(report,null,2)+'\n');
console.log(`${passed} guidance eligibility checks passed, ${failed} failed`);if(failed)process.exitCode=1;
