#!/usr/bin/env node
'use strict';
// Production save/normalization paths, exercised against private VM storage.
// No browser storage or existing pilot data is accessed by this verifier.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),filename=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(filename,'utf8');support=support.slice(0,support.indexOf('\ntest('));
const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
isolated._compile(support+'\nmodule.exports={createGame};\n',filename);
const {createGame}=isolated.exports,results=[],plain=value=>JSON.parse(JSON.stringify(value));
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const sourceGear=(extra={})=>({id:'original-variant',slot:'weapon',tier:2,name:'Original rolled item',gunVariant:'siege',alignment:'VANGUARD',power:114,source:'APEX ASTERPRINT',locked:true,stats:{damagePct:5,weakPct:6,missileDamagePct:4},masterwork:true,godRoll:true,...extra});
const fresh=()=>plain(createGame().api.profile);
const stored=(profile,aliases=false)=>{const raw=JSON.stringify(profile),entries=[['starfighterProfileSlot1',raw]];if(aliases)entries.push(['starfighterProfile',raw],['starfighterGarage',JSON.stringify(profile.garage)],['lastSignalBest','19400']);return entries};

check('normalization archives original rolls and metadata while unsupported fields remain inactive',()=>{
 const a=createGame(),raw=sourceGear(),before=plain(raw),item=a.api.normalizeGearItem(raw);
 assert.equal(item.legacySource.version,1);assert.equal(item.legacySource.tierSchema,'v5');assert.deepEqual(plain(item.legacySource.item),before);assert.equal(Object.hasOwn(item.legacySource.item,'legacySource'),false);
 assert.equal(item.stats.missileDamagePct,undefined);assert.equal(item.masterwork,undefined);assert.equal(item.godRoll,undefined);assert.equal(item.legacySource.item.stats.missileDamagePct,4);assert.equal(item.legacySource.item.masterwork,true);assert.equal(item.legacySource.item.godRoll,true);
 a.api.garage.inventory=[item];a.api.garage.equipped.weapon=item.id;a.api.start('story');
 const b=createGame(),clean=b.api.normalizeGearItem({...before,stats:{damagePct:5,weakPct:6}});b.api.garage.inventory=[clean];b.api.garage.equipped.weapon=clean.id;b.api.start('story');
 for(const key of['damage','chargeDamage','weakDamage','missileDamage','chargeSpeed'])assert.equal(a.api.player[key],b.api.player[key],key+' must use only the classic projection');
});

check('the one-level original archive survives repeated normalization, metadata edits, save and reload',()=>{
 const g=createGame(),item=g.api.normalizeGearItem(sourceGear()),original=JSON.stringify(item.legacySource);item.locked=false;item.name='Renamed current item';item.source='CURRENT SOURCE';
 for(let pass=0;pass<5;pass++){g.api.normalizeGearItem(item);assert.equal(JSON.stringify(item.legacySource),original);assert.equal(Object.hasOwn(item.legacySource.item,'legacySource'),false)}
 g.api.garage.inventory=[item];g.api.garage.equipped.weapon=item.id;g.api.saveProfile();
 const reloaded=createGame({initialStorage:[...g.storage]}),again=reloaded.api.garage.inventory[0];reloaded.api.renderGarage();reloaded.api.saveProfile();
 assert.equal(JSON.stringify(again.legacySource),original);assert.equal(again.locked,false);assert.equal(again.name,'Renamed current item');assert.equal(again.source,'CURRENT SOURCE');assert.equal(again.legacySource.item.locked,true);assert.equal(again.legacySource.item.name,'Original rolled item');
});

check('same-intrinsic stat variants retain separate IDs, rolls, sets and live locks through banking',()=>{
 const g=createGame(),a=g.api.normalizeGearItem(sourceGear({id:'variant-a',alignment:'AEGIS',stats:{damagePct:4,chargePct:6},locked:true})),b=g.api.normalizeGearItem(sourceGear({id:'variant-b',alignment:'VECTOR',stats:{weakPct:5,chargePct:4},locked:false}));
 g.api.garage.inventory=[a,b];g.api.garage.equipped.weapon=b.id;g.api.saveProfile();
 const reload=createGame({initialStorage:[...g.storage]}),api=reload.api;api.collectGear(api.normalizeGearItem(sourceGear({id:'new-drop',tier:0,stats:{damagePct:3},locked:false})));api.bankRunLoot();api.renderGarage();api.saveProfile();
 for(const expected of[a,b]){const item=api.garage.inventory.find(item=>item.id===expected.id);assert.ok(item);assert.deepEqual(plain(item.stats),plain(expected.stats));assert.equal(item.alignment,expected.alignment);assert.equal(item.locked,expected.locked);assert.deepEqual(plain(item.legacySource.item),plain(expected.legacySource.item))}
 assert.equal(api.garage.equipped.weapon,'variant-b');assert.equal(api.garage.inventory.filter(item=>item.id==='variant-a'||item.id==='variant-b').length,2);
});

check('pre-v5 rarity migration records the original tier schema exactly once',()=>{
 const profile=fresh(),raw=sourceGear({tier:1,stats:{damagePct:4,weakPct:5}});profile.version=4;profile.garage.inventory=[raw];profile.garage.equipped.weapon=raw.id;
 const game=createGame({initialStorage:stored(profile)}),item=game.api.garage.inventory[0];assert.equal(item.tier,2);assert.equal(item.legacySource.tierSchema,'pre-v5');assert.equal(item.legacySource.item.tier,1);assert.deepEqual(plain(item.legacySource.item),raw);
 game.api.saveProfile();const reloaded=createGame({initialStorage:[...game.storage]}).api.garage.inventory[0];assert.equal(reloaded.tier,2);assert.equal(reloaded.legacySource.tierSchema,'pre-v5');assert.equal(reloaded.legacySource.item.tier,1);assert.equal(Object.hasOwn(reloaded.legacySource.item,'legacySource'),false);
});

check('future or malformed profile versions preserve every backing-store alias during ordinary saves and loot banking',()=>{
 for(const version of[7,999,-1,1.5,'6',null,{}]){
  const profile=fresh();profile.version=version;profile.name='PRESERVE UNSUPPORTED';profile.garage.inventory=[sourceGear()];const entries=stored(profile,true),game=createGame({initialStorage:entries}),api=game.api;
  assert.equal(api.storage.sessionOnly,true,'Rejected version '+JSON.stringify(version)+' must protect storage');api.saveProfile();api.renderGarage();api.collectGear(api.normalizeGearItem(sourceGear({id:'session-drop',tier:0,stats:{damagePct:3}})));api.bankRunLoot();
  for(const[key,raw]of entries)assert.equal(game.storage.get(key),raw,key+' must retain its raw persisted data for '+JSON.stringify(version));
 }
 const old=fresh();delete old.version;const legacy=createGame({initialStorage:stored(old)});assert.equal(legacy.api.profile.version,6);assert.equal(legacy.api.storage.sessionOnly,false,'Missing version still means the supported legacy version0');
});

check('untagged checkpoints restore the recorded build and consumed guards without applying current Garage gear',()=>{
 const game=createGame(),api=game.api;api.start('story');api.player.damage=1.73;api.player.chargeSpeed=1.42;api.player.hp=2;api.player.shield=0;api.player.dose=64;api.player.ablativeOwned=true;api.player.ablativeReady=false;api.player.secondChance=true;api.player.secondChanceReady=false;api.player.skillPoints=1;api.learnSkill(api.skillPaths[0].nodes[0]);api.saveRunCheckpoint('mission');
 const old=plain(api.profile.checkpoint);delete old.ruleset;delete old.buildVersion;api.profile.checkpoint=old;const before=JSON.stringify(old),checked=api.validateRunCheckpoint(old);assert.ok(checked);assert.equal(checked.ruleset,'classic-v1');assert.equal(checked.buildVersion,1);assert.equal(JSON.stringify(old),before,'Defaulting marker values must not mutate the source checkpoint');
 const weapon=api.normalizeGearItem(sourceGear({id:'garage-newer',stats:{damagePct:5,chargePct:6}}));api.garage.inventory=[weapon];api.garage.equipped.weapon=weapon.id;api.saveProfile();
 const restored=createGame({initialStorage:[...game.storage]});assert.equal(restored.find('#load-game-btn').disabled,false);restored.api.loadGame();
 for(const key of['damage','chargeSpeed','weakDamage','hp','shield','dose','ablativeOwned','ablativeReady','secondChance','secondChanceReady','skillsSpent'])assert.equal(restored.api.player[key],old.player[key],key+' must retain the recorded legacy value');
 assert.equal(restored.api.player.skills.v1,true);assert.equal(restored.api.garage.equipped.weapon,'garage-newer');
});

check('new checkpoints explicitly identify classic rules and independently default either missing old marker',()=>{
 const api=createGame().api;api.start('story');const saved=plain(api.profile.checkpoint);assert.equal(saved.ruleset,'classic-v1');assert.equal(saved.buildVersion,1);assert.ok(api.validateRunCheckpoint(saved));
 for(const missing of['ruleset','buildVersion']){const old=plain(saved);delete old[missing];const normalized=api.validateRunCheckpoint(old);assert.ok(normalized);assert.equal(normalized.ruleset,'classic-v1');assert.equal(normalized.buildVersion,1);assert.equal(Object.hasOwn(old,missing),false)}
});

check('unknown checkpoint rules stay unavailable and intact until departure is explicitly confirmed',()=>{
 const seed=createGame();seed.api.start('story');const good=plain(seed.api.profile.checkpoint),profile=plain(seed.api.profile);
 const invalid=[{ruleset:'foundation-v1',buildVersion:1},{ruleset:'classic-v1',buildVersion:2},{ruleset:'classic-v1',buildVersion:'1'},{ruleset:null,buildVersion:1},{ruleset:'classic-v1',buildVersion:null}];
 for(const markers of invalid){profile.checkpoint={...plain(good),...markers};const original=JSON.stringify(profile.checkpoint),game=createGame({initialStorage:stored(profile)}),api=game.api;assert.equal(api.validateRunCheckpoint(api.profile.checkpoint),null);assert.equal(game.find('#load-game-btn').disabled,true);api.goMenu();api.loadGame();api.saveRunCheckpoint();assert.equal(api.state,'menu');assert.equal(JSON.stringify(api.profile.checkpoint),original);assert.equal(JSON.stringify(JSON.parse(game.storage.get('starfighterProfileSlot1')).checkpoint),original);
  let confirmations=0;game.sandbox.confirm=()=>{confirmations++;return false};api.openMissionBriefing('rush',1);api.departMission();assert.equal(confirmations,1,'Replacing an unreadable checkpoint must still ask');assert.equal(api.state,'briefing');assert.equal(JSON.stringify(api.profile.checkpoint),original);
 }
});

const passed=results.filter(result=>result.passed).length,failed=results.length-passed;
fs.writeFileSync(path.join(root,'artifacts/save-foundation-compat-audit.json'),JSON.stringify({scope:'Actual save and normalization functions with isolated VM storage; no real pilots accessed',passed,failed,results},null,2)+'\n');
console.log(`${passed} save-foundation compatibility checks passed, ${failed} failed`);if(failed)process.exitCode=1;
