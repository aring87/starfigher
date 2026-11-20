#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),R=require('../run-progression.js'),results=[];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const plain=value=>JSON.parse(JSON.stringify(value));
const stateWith=perks=>R.validate({...R.fresh(),perks});
function test(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
test('fresh runs have three-slot policy, six distinct perks and no permanent gear or resource state',()=>{
 const state=R.fresh();assert.equal(R.ruleset,'streamlined-v1');assert.equal(R.policy.maxPerks,3);assert.equal(R.catalogue.length,6);assert.equal(new Set(R.catalogue.map(p=>p.id)).size,6);assert.deepEqual(state,{version:1,perks:[],offer:[],pending:null,pendingWave:null,rewards:[]});assert.deepEqual(R.validate(plain(state)),state);assert.equal(Object.isFrozen(state),true);assert.equal(Object.isFrozen(R.catalogue[0]),true);
});
test('seeded drafts offer three distinct unowned perks and never reroll a pending reward',()=>{
 let variations=new Set();for(let seed=0;seed<100;seed++){
  const state=stateWith(['precisionRelay']),draft=R.offerPerks(state,2,seed);assert.deepEqual(draft,R.offerPerks(state,2,seed));assert.equal(draft.offer.length,3);assert.equal(new Set(draft.offer).size,3);assert.equal(draft.offer.includes('precisionRelay'),false);assert.equal(draft.pending,'perk');assert.equal(draft.pendingWave,2);assert.deepEqual(R.offerPerks(draft,2,'different seed'),draft);variations.add(draft.offer.join(','));
 }assert.ok(variations.size>10);return{draftSeeds:100,distinctOffers:variations.size};
});
test('filling empty slots and replacing one active perk keep the exact three-perk cap',()=>{
 let state=R.fresh();for(let wave=1;wave<=3;wave++){state=R.offerPerks(state,wave,'fill');state=R.choosePerk(state,wave,state.offer[0]);assert.equal(state.perks.length,wave)}const draft=R.offerPerks(state,4,'replace'),candidate=draft.offer[0];assert.throws(()=>R.choosePerk(draft,4,candidate),/replace/);assert.throws(()=>R.choosePerk(draft,4,candidate,'not-a-perk'));const old=draft.perks[1],replaced=R.choosePerk(draft,4,candidate,old);assert.equal(replaced.perks.length,3);assert.equal(replaced.perks[1],candidate);assert.equal(replaced.perks.includes(old),false);assert.equal(replaced.offer.length,0);assert.equal(replaced.pending,null);assert.equal(replaced.pendingWave,null);assert.ok(replaced.rewards.includes('perk:4'));assert.equal(draft.perks[1],old);
});
test('a ten-mission sequence supports skips, replacements and stable replay-safe reward ledgers',()=>{
 let state=R.fresh(),replacements=0;for(let wave=1;wave<=10;wave++){
  state=R.offerService(state,wave);assert.deepEqual(R.offerService(state,wave),state);state=R.finishService(state,wave);assert.deepEqual(R.finishService(state,wave),state);
  const repair=R.consumeApexRepair(state,wave);state=repair.state;assert.equal(R.consumeApexRepair(state,wave).repair,false);
  state=R.offerPerks(state,wave,'campaign-'+wave);assert.equal(state.offer.length,3);assert.ok(state.offer.every(id=>!state.perks.includes(id)));
  if(wave===4||wave===7)state=R.skipPerk(state,wave);else{const previous=state.perks.length;state=R.choosePerk(state,wave,state.offer[0],previous===3?state.perks[0]:undefined);if(previous===3)replacements++}
  assert.ok(state.perks.length<=3);assert.equal(new Set(state.perks).size,state.perks.length);assert.equal(new Set(state.rewards).size,state.rewards.length);assert.ok(R.validate(plain(state)));
 }assert.equal(state.rewards.filter(id=>id.startsWith('service:')).length,10);assert.equal(state.rewards.filter(id=>id.startsWith('perk:')).length,10);assert.ok(replacements>=3);return{missions:10,replacements,rewardEntries:state.rewards.length};
});
test('service and perk commits are idempotent and cannot overwrite a newer pending choice',()=>{
 let state=R.finishService(R.offerService(R.fresh(),1),1);state=R.skipPerk(R.offerPerks(state,1,0),1);const newer=R.offerPerks(state,2,1);assert.deepEqual(R.finishService(newer,1),newer);assert.deepEqual(R.skipPerk(newer,1),newer);assert.deepEqual(R.choosePerk(newer,1,'coreSurge'),newer);assert.deepEqual(R.offerService(newer,1),newer);assert.deepEqual(R.offerPerks(newer,1,999),newer);assert.equal(newer.pendingWave,2);
});
test('wrong mission, reward type, unoffered perk and invalid replacement callbacks fail without mutation',()=>{
 const draft=freeze(R.offerPerks(stateWith(['precisionRelay','secondChance','deltaReserve']),5,'guard')),before=JSON.stringify(draft);
 assert.throws(()=>R.choosePerk(draft,4,draft.offer[0]));assert.throws(()=>R.skipPerk(draft,4));assert.throws(()=>R.finishService(draft,5));assert.throws(()=>R.offerPerks(draft,6,1));assert.throws(()=>R.offerService(draft,5));assert.throws(()=>R.choosePerk(draft,5,'precisionRelay','secondChance'));assert.throws(()=>R.choosePerk(draft,5,draft.offer[0],draft.offer[1]));assert.equal(JSON.stringify(draft),before);
 const service=R.offerService(R.fresh(),2);assert.throws(()=>R.choosePerk(service,2,'coreSurge'));assert.throws(()=>R.skipPerk(service,2));assert.throws(()=>R.offerPerks(service,2,0));
});
test('apex repair is consumed once only while Field Nanites is active',()=>{
 const empty=R.fresh(),none=R.consumeApexRepair(empty,1);assert.equal(none.repair,false);assert.deepEqual(none.state,empty);let state=stateWith(['fieldNanites']);const first=R.consumeApexRepair(state,1);assert.equal(first.repair,true);assert.ok(first.state.rewards.includes('apexRepair:1'));assert.equal(R.consumeApexRepair(first.state,1).repair,false);assert.equal(R.consumeApexRepair(first.state,2).repair,true);assert.deepEqual(state.rewards,[]);
});
test('all thirty mission reward IDs fit the ledger without repeat awards',()=>{
 let state=stateWith(['fieldNanites']);for(let wave=1;wave<=10;wave++){state=R.finishService(R.offerService(state,wave),wave);state=R.consumeApexRepair(state,wave).state;state=R.skipPerk(R.offerPerks(state,wave,'all'),wave)}assert.equal(state.rewards.length,30);assert.ok(R.validate(state));for(let wave=1;wave<=10;wave++){assert.equal(R.consumeApexRepair(state,wave).repair,false);assert.deepEqual(R.offerService(state,wave),state);assert.deepEqual(R.offerPerks(state,wave,Date.now()),state)}return{uniqueRewardEntries:30};
});
test('effect configuration contains only the intended bounded event fields with no rank or flat damage stacking',()=>{
 const expected={weakBreakDose:0,weakOverdrive:0,bitDose:0,secondChance:false,repairOnApex:0,surplusDose:2};assert.deepEqual(R.effectConfig([]),expected);
 const fields={precisionRelay:['weakBreakDose',6],coreSurge:['weakOverdrive',4],bitReclaimer:['bitDose',.4],secondChance:['secondChance',true],fieldNanites:['repairOnApex',1],deltaReserve:['surplusDose',5]};
 for(const[id,[field,value]]of Object.entries(fields)){assert.deepEqual(R.effectConfig([id]),{...expected,[field]:value})}const config=R.effectConfig(['precisionRelay','coreSurge','bitReclaimer']);assert.deepEqual(Object.keys(config),Object.keys(expected));assert.equal(config.weakBreakDose,6);assert.equal(config.weakOverdrive,4);assert.equal(config.bitDose,.4);assert.equal(Object.isFrozen(config),true);assert.throws(()=>R.effectConfig(['coreSurge','coreSurge']));assert.throws(()=>R.effectConfig(R.catalogue.slice(0,4).map(p=>p.id)));
});
test('validation rejects malformed versions, unknown fields, duplicate IDs and inconsistent pending data',()=>{
 const cases=[null,[],{}, {...R.fresh(),version:2},{...R.fresh(),extra:true},{...R.fresh(),perks:['unknown']},{...R.fresh(),perks:['coreSurge','coreSurge']},{...R.fresh(),perks:R.catalogue.slice(0,4).map(p=>p.id)},{...R.fresh(),rewards:['service:0']},{...R.fresh(),rewards:['service:11']},{...R.fresh(),rewards:['service:1','service:1']},{...R.fresh(),rewards:['perk:01']},{...R.fresh(),pending:'service',pendingWave:1,offer:['coreSurge']},{...R.fresh(),pending:'perk',pendingWave:1,offer:['coreSurge']},{...R.fresh(),pending:'service',pendingWave:null},{...R.fresh(),pendingWave:1},{...R.fresh(),offer:['coreSurge']},{...R.fresh(),pending:'service',pendingWave:1,rewards:['service:1']}];
 const overlap=plain(R.offerPerks(R.fresh(),1,3));overlap.perks=[overlap.offer[0]];cases.push(overlap);const sparse=plain(R.fresh());sparse.perks=new Array(1);cases.push(sparse);for(const value of cases)assert.equal(R.validate(value),null);
 const reordered={rewards:[],pendingWave:null,pending:null,offer:[],perks:[],version:1};assert.deepEqual(R.validate(reordered),R.fresh());
});
test('invalid mission and seed inputs fail before any draft or ledger can change',()=>{
 const state=freeze(R.fresh());for(const wave of[0,11,-1,1.5,NaN,Infinity,'1']){assert.throws(()=>R.offerPerks(state,wave,1));assert.throws(()=>R.offerService(state,wave));assert.throws(()=>R.consumeApexRepair(state,wave))}for(const seed of[NaN,Infinity,{},[]])assert.throws(()=>R.offerPerks(state,1,seed));assert.equal(R.validate({...state,pending:'service',pendingWave:Infinity}),null);
});
test('frozen inputs stay unchanged and all returned state arrays are independently frozen',()=>{
 const raw=freeze(plain(R.offerPerks(R.fresh(),1,'immutable'))),before=JSON.stringify(raw),validated=R.validate(raw);assert.notEqual(validated,raw);assert.notEqual(validated.offer,raw.offer);const chosen=R.choosePerk(raw,1,raw.offer[0]);assert.equal(JSON.stringify(raw),before);assert.equal(Object.isFrozen(chosen),true);for(const key of['perks','offer','rewards'])assert.equal(Object.isFrozen(chosen[key]),true);assert.equal(Object.isFrozen(R.consumeApexRepair(chosen,1)),true);
});
test('browser and CommonJS exports have no DOM, storage, timers or ambient randomness dependencies',()=>{
 const source=fs.readFileSync(path.join(root,'run-progression.js'),'utf8'),sandbox={window:{}};vm.runInNewContext(source,sandbox,{filename:'run-progression.js'});assert.equal(sandbox.window.StarfighterRunProgression.ruleset,R.ruleset);assert.equal(Object.isFrozen(R),true);assert.doesNotMatch(source,/localStorage|sessionStorage|document\.|setTimeout|Math\.random/);assert.deepEqual(Array.from(sandbox.window.StarfighterRunProgression.fresh().perks),[]);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/run-progression-audit.json'),JSON.stringify({ruleset:R.ruleset,passed,failed,results},null,2)+'\n');console.log(`${passed} run progression checks passed, ${failed} failed`);if(failed)process.exitCode=1;
