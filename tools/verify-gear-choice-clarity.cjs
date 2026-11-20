#!/usr/bin/env node
'use strict';
// Preview real equipment swaps through the shipping helper. No browser saves,
// player build or live equipment may change while describing a candidate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs'),all=fs.readFileSync(filename,'utf8');
let support=all.slice(0,all.indexOf('\ntest('));
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {gearChoiceSummary,gearIntrinsic,');
const fixtureAt=all.indexOf('function garageActionFixture('),fixtureEnd=all.indexOf('\ntest(',fixtureAt);
assert.ok(fixtureAt>0&&fixtureEnd>fixtureAt);
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\n'+all.slice(fixtureAt,fixtureEnd)+'\nmodule.exports={createGame,garageActionFixture};\n',filename);
const{createGame,garageActionFixture}=isolated.exports,results=[];
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
function blank(){const game=createGame();game.api.garage.inventory=[];game.api.garage.equipped={weapon:null,armor:null,engine:null,pod:null};return game}
let serial=0;
function item(a,slot,intrinsic,{power=110,tier=0,stats={},alignment='VANGUARD',equipped=false,locked=false}={}){
 const gear=a.normalizeGearItem({id:'clarity-'+(++serial),slot,tier,power,stats,alignment,gunVariant:slot==='weapon'?intrinsic:null,trait:slot==='weapon'?null:intrinsic,name:slot.toUpperCase()+' / '+intrinsic,source:'PRIVATE CLARITY FIXTURE',locked});
 a.garage.inventory.push(gear);if(equipped)a.garage.equipped[slot]=gear.id;return gear;
}
const pairs=[
 {id:'absorptionCircuit',name:'ABSORPTION CIRCUIT',slot:'weapon',intrinsic:'sync',old:'arc',partnerSlot:'pod',partner:'siphon'},
 {id:'chargedBastion',name:'CHARGED BASTION',slot:'weapon',intrinsic:'siege',old:'arc',partnerSlot:'armor',partner:'capacitor'},
 {id:'salvageMomentum',name:'SALVAGE MOMENTUM',slot:'armor',intrinsic:'recovery',old:'ablative',partnerSlot:'engine',partner:'scavenger'},
 {id:'rearGuard',name:'REAR GUARD',slot:'engine',intrinsic:'vector',old:'phase',partnerSlot:'pod',partner:'relay'}
];
function schema(summary){
 assert.ok(summary&&typeof summary==='object');
 for(const name of['intrinsicName','effect','role','context','tradeoff'])assert.equal(typeof summary[name],'string',name+' must be readable text');
 for(const name of['completes','breaks','keeps','partners','statChanges','resonanceChanges'])assert.ok(Array.isArray(summary[name]),name+' must be a list');
 assert.ok(summary.effect.length&&summary.role.length);assert.equal(typeof summary.equipped,'boolean');
}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value)}
check('lower-Power Common items can complete every real intrinsic pair without a rarity gate',()=>{
 for(const pair of pairs){const{api:a}=blank();item(a,pair.slot,pair.old,{power:120,tier:4,equipped:true});item(a,pair.partnerSlot,pair.partner,{equipped:true});const candidate=item(a,pair.slot,pair.intrinsic,{power:105,tier:0}),summary=a.gearChoiceSummary(candidate);schema(summary);assert.ok(summary.completes.includes(pair.id),pair.name+' must complete');assert.equal(summary.breaks.length,0);assert.equal(summary.powerDelta,-15);assert.ok(summary.context.toUpperCase().includes(pair.name));assert.ok(summary.tradeoff.length,'Lower Power or lost intrinsic must remain visible');assert.equal(candidate.rarity,'common');assert.equal(a.gearComboStates().find(c=>c.id===pair.id).active,false,'Preview must not actually equip the item')}
 return{pairs:4,rarity:'Common',powerDelta:-15};
});
check('higher Power exposes a broken pair and the intrinsic being replaced instead of hiding the cost',()=>{
 for(const pair of pairs){const{api:a}=blank(),current=item(a,pair.slot,pair.intrinsic,{power:105,equipped:true});item(a,pair.partnerSlot,pair.partner,{equipped:true});const candidate=item(a,pair.slot,pair.old,{power:125,tier:4}),summary=a.gearChoiceSummary(candidate);schema(summary);assert.ok(summary.breaks.includes(pair.id));assert.equal(summary.completes.length,0);assert.equal(summary.powerDelta,20);assert.equal(summary.intrinsicLost,a.gearIntrinsic(current).name);assert.ok((summary.context+' '+summary.tradeoff).toUpperCase().includes(pair.name));assert.ok(summary.tradeoff.length);assert.equal(a.gearComboStates().find(c=>c.id===pair.id).active,true)}
 return{brokenPairCases:4,powerDelta:20};
});
check('same-intrinsic replacements retain a pair and compare real gained or lost stat rolls',()=>{
 const{api:a}=blank();item(a,'weapon','siege',{tier:2,power:112,stats:{damagePct:5,chargePct:6},equipped:true});item(a,'armor','capacitor',{equipped:true});const candidate=item(a,'weapon','siege',{tier:2,power:112,stats:{chargePct:4,weakPct:5}}),summary=a.gearChoiceSummary(candidate);schema(summary);assert.deepEqual(Array.from(summary.keeps),['chargedBastion']);assert.equal(summary.intrinsicLost,null);assert.equal(summary.powerDelta,0);assert.equal(summary.completes.length,0);assert.equal(summary.breaks.length,0);
 const change=key=>summary.statChanges.find(stat=>stat.key===key);assert.deepEqual({...change('damagePct')},{key:'damagePct',label:'Fighter damage',before:5,after:0,delta:-5});assert.equal(change('chargePct').delta,-2);assert.equal(change('weakPct').delta,5);assert.ok(summary.tradeoff.length,'The cost of lost stat rolls must be described');return{statGains:1,statLosses:2};
});
check('stored partners stay missing until equipped and name their exact required slot and intrinsic',()=>{
 const{api:a}=blank();item(a,'weapon','arc',{equipped:true});item(a,'pod','siphon');const candidate=item(a,'weapon','sync'),summary=a.gearChoiceSummary(candidate);schema(summary);assert.equal(summary.completes.length,0);assert.equal(summary.keeps.length,0);const missing=summary.partners.find(p=>p.comboId==='absorptionCircuit');assert.ok(missing);assert.equal(missing.comboName,'ABSORPTION CIRCUIT');assert.equal(missing.slot,'pod');assert.equal(missing.id,'siphon');assert.equal(missing.name,'ABSORPTION SIPHON');assert.ok(summary.context.toUpperCase().includes('ABSORPTION SIPHON'));return{storedIsNotEquipped:true};
});
check('empty slots and already-equipped items are described without a fictitious replacement',()=>{
 const{api:a}=blank(),candidate=item(a,'weapon','core',{power:119}),empty=a.gearChoiceSummary(candidate);schema(empty);assert.equal(empty.equipped,false);assert.equal(empty.powerDelta,null);assert.equal(empty.intrinsicLost,null);assert.ok(!empty.currentName);assert.equal(empty.breaks.length,0);
 a.garage.equipped.weapon=candidate.id;const equipped=a.gearChoiceSummary(candidate);schema(equipped);assert.equal(equipped.equipped,true);assert.equal(equipped.currentName,candidate.name);assert.equal(equipped.powerDelta,0);assert.equal(equipped.intrinsicLost,null);assert.ok(equipped.statChanges.every(s=>s.delta===0));return{emptyPowerDelta:null};
});
check('resonance changes distinguish two- and four-piece thresholds and hitbox reduction keeps its meaning',()=>{
 const{api:a}=blank();item(a,'weapon','arc',{equipped:true,alignment:'VANGUARD'});item(a,'armor','ablative',{equipped:true,alignment:'VANGUARD'});item(a,'engine','phase',{equipped:true,alignment:'AEGIS'});const candidate=item(a,'weapon','core',{alignment:'AEGIS'}),summary=a.gearChoiceSummary(candidate);
 assert.ok(summary.resonanceChanges.some(r=>r.alignment==='VANGUARD'&&r.threshold===2&&r.gained===false));assert.ok(summary.resonanceChanges.some(r=>r.alignment==='AEGIS'&&r.threshold===2&&r.gained===true));
 for(const gear of a.garage.inventory)gear.alignment='VANGUARD';item(a,'pod','shepherd',{equipped:true,alignment:'AEGIS'});const pod=item(a,'pod','siphon',{alignment:'VANGUARD'}),four=a.gearChoiceSummary(pod);assert.ok(four.resonanceChanges.some(r=>r.alignment==='VANGUARD'&&r.threshold===4&&r.gained));assert.ok(!four.resonanceChanges.some(r=>r.alignment==='VANGUARD'&&r.threshold===2));
 const engine=item(a,'engine','phase',{tier:2,stats:{profilePct:5},alignment:'VANGUARD'}),hitbox=a.gearChoiceSummary(engine).statChanges.find(s=>s.key==='profilePct');assert.ok(hitbox);assert.equal(hitbox.label,'Hitbox reduction');assert.equal(hitbox.delta,5);return{thresholds:[2,4]};
});
check('unrelated active pairs are not presented as a benefit of the candidate',()=>{
 const{api:a}=blank();item(a,'weapon','arc',{equipped:true});item(a,'armor','recovery',{equipped:true});item(a,'engine','scavenger',{equipped:true});const candidate=item(a,'weapon','core'),summary=a.gearChoiceSummary(candidate);assert.equal(a.gearComboStates().find(c=>c.id==='salvageMomentum').active,true);assert.equal(summary.keeps.length,0);assert.equal(summary.completes.length,0);assert.equal(summary.context.includes('SALVAGE MOMENTUM'),false);return{unrelatedPair:'salvageMomentum'};
});
check('choice previews never temporarily equip, rebuild the fighter, mutate gear or write a save',()=>{
 const game=blank(),{api:a}=game;item(a,'weapon','arc',{power:125,equipped:true,locked:true});item(a,'armor','capacitor',{equipped:true});const candidate=item(a,'weapon','siege',{power:105,locked:true});a.start('story');
 const before=JSON.stringify({garage:a.garage,player:a.player,profile:a.profile,storage:[...game.storage]}),original=a.garage.equipped;let equipWrites=0,saveWrites=0;
 a.garage.equipped=new Proxy(original,{set(){equipWrites++;throw new Error('Preview attempted to equip')},deleteProperty(){equipWrites++;throw new Error('Preview attempted to unequip')}});
 for(const gear of a.garage.inventory)deepFreeze(gear);deepFreeze(a.player);const set=game.storage.set;game.storage.set=function(){saveWrites++;throw new Error('Preview attempted a save')};
 for(let pass=0;pass<20;pass++)schema(a.gearChoiceSummary(candidate));assert.equal(equipWrites,0);assert.equal(saveWrites,0);assert.equal(JSON.stringify({garage:a.garage,player:a.player,profile:a.profile,storage:[...game.storage]}),before);game.storage.set=set;a.garage.equipped=original;return{previews:20,equipmentWrites:0,saveWrites:0};
});
check('describing gear preserves Garage scroll, focused controls and existing lock protection',()=>{
 const game=garageActionFixture(),{api:a,find,column,action,document}=game;const positions={weapon:288,armor:152,engine:204,pod:65};for(const[slot,position]of Object.entries(positions))column(slot).scrollTop=position;find('#garage').scrollTop=232;const focus=action('weapon','weapon-2','lock');focus.focus({preventScroll:true});const candidate=a.garage.inventory.find(g=>g.id==='weapon-2'),before=JSON.stringify(a.garage);for(const gear of a.garage.inventory)a.gearChoiceSummary(gear);assert.equal(JSON.stringify(a.garage),before);assert.equal(document.activeElement,focus);assert.equal(find('#garage').scrollTop,232);for(const[slot,position]of Object.entries(positions))assert.equal(column(slot).scrollTop,position);
 const staleDiscard=action('weapon',candidate.id,'dismantle');action('weapon',candidate.id,'lock').onclick();staleDiscard.onclick();assert.ok(a.garage.inventory.some(g=>g.id===candidate.id));assert.equal(action('weapon',candidate.id,'dismantle').disabled,true);return{columns:4,lockProtected:true};
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/gear-choice-clarity-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} gear-choice clarity checks passed, ${failed} failed`);if(failed)process.exitCode=1;
