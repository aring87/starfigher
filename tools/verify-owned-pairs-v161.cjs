#!/usr/bin/env node
'use strict';
// Inventory ownership is presentation only; native compilation still requires
// the exact pair to be equipped, and refits must preserve spent resources.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest(')).replace('globalThis.__gameTest = {','globalThis.__gameTest = {gearChoiceSummary,gearChoiceMarkup,renderGarageCombos,ownedGearForIntrinsic,garageGearAction,');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);const{createGame}=m.exports;
const results=[],plain=v=>JSON.parse(JSON.stringify(v));let serial=0;
function game(){return createGame({ruleset:'streamlined-v1'})}
function item(a,slot,intrinsic,{power=110,tier=0,name=slot+' '+intrinsic,equipped=false,locked=false}={}){const gear=a.normalizeGearItem({id:'owned-'+(++serial),slot,[slot==='weapon'?'gunVariant':'trait']:intrinsic,stats:{},power,tier,alignment:'VECTOR',name,locked});a.garage.inventory.push(gear);if(equipped)a.garage.equipped[slot]=gear.id;return gear}
function pair(a,id){return a.gearComboStates().find(row=>row.id===id)}
function panel(g){g.api.renderGarageCombos();return g.find('#equipped-gear').children.at(-1).innerHTML}
function check(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('all four named pairs distinguish missing, owned in storage, partially equipped and active',()=>{
 for(const[id,requirements]of[['absorptionCircuit',[['weapon','sync'],['pod','siphon']]],['chargedBastion',[['weapon','siege'],['armor','capacitor']]],['salvageMomentum',[['armor','recovery'],['engine','scavenger']]],['rearGuard',[['engine','vector'],['pod','relay']]]]){
  const{api:a}=game();assert.equal(pair(a,id).available,false);const first=item(a,...requirements[0]);assert.equal(pair(a,id).available,false);const second=item(a,...requirements[1]);assert.equal(pair(a,id).available,true);assert.equal(pair(a,id).active,false);assert.equal(pair(a,id).requirements.every(row=>!row.met&&row.owned),true);a.garage.equipped[first.slot]=first.id;assert.equal(pair(a,id).active,false);a.garage.equipped[second.slot]=second.id;assert.equal(pair(a,id).active,true);assert.equal(pair(a,id).requirements.every(row=>row.met),true);
 }
});
check('the collapsed panel counts owned inactive pairs, and expanded requirements identify the actual stored item',()=>{
 const g=game(),a=g.api;item(a,'weapon','siege',{name:'Morrow Wave Emitter'});item(a,'armor','capacitor',{equipped:true,name:'Pilgrim Aegis Plate'});let markup=panel(g);assert.match(markup,/1 OWNED PAIR TO TRY/);assert.match(markup,/OWNED · EQUIP TO ACTIVATE/);assert.match(markup,/IN STORAGE · Weapon \/ SIEGE COIL/);assert.match(markup,/Morrow Wave Emitter/);assert.match(markup,/EQUIPPED · Armor \/ CAPACITOR PLATING/);assert.match(markup,/NOT OWNED/);a.garage.equipped.weapon=a.garage.inventory[0].id;markup=panel(g);assert.match(markup,/1 ACTIVE/);assert.doesNotMatch(markup,/1 OWNED PAIR TO TRY/);
});
check('candidate cards point to a stored partner without implying the inactive pair is already active',()=>{
 const g=game(),a=g.api,candidate=item(a,'weapon','siege',{power:103}),stored=item(a,'armor','capacitor',{power:115,name:'Owned capacitor keeper',locked:true});item(a,'armor','recovery',{equipped:true});const summary=a.gearChoiceSummary(candidate);assert.equal(summary.completes.length,0);assert.match(summary.context,/Owned partner: Owned capacitor keeper \(Armor \/ CAPACITOR PLATING\).*Equip both for CHARGED BASTION/);assert.equal(summary.partners[0].owned.id,stored.id);a.garage.inventory=a.garage.inventory.filter(row=>row.id!==stored.id);assert.match(a.gearChoiceSummary(candidate).context,/Pair with CAPACITOR PLATING/);
});
check('owned representative selection is stable, slot-specific and never reorders stored gear',()=>{
 const{api:a}=game(),low=item(a,'pod','siphon',{power:104,tier:2}),best=item(a,'pod','siphon',{power:112,tier:1}),tie=item(a,'pod','siphon',{power:112,tier:0});item(a,'armor','capacitor',{power:160});const order=a.garage.inventory.map(row=>row.id);assert.equal(a.ownedGearForIntrinsic('pod','siphon').id,best.id);assert.equal(a.ownedGearForIntrinsic('armor','siphon'),null);assert.deepEqual(a.garage.inventory.map(row=>row.id),order);assert.ok(low&&tie);
});
check('dynamic stored item names stay escaped in both pair and candidate markup',()=>{
 const g=game(),a=g.api,candidate=item(a,'weapon','siege'),bad='<img src=x onerror=alert(1)>';item(a,'armor','capacitor',{name:bad});const pairMarkup=panel(g),candidateMarkup=a.gearChoiceMarkup(candidate,'private');for(const markup of[pairMarkup,candidateMarkup]){assert.ok(markup.includes('&lt;img'));assert.equal(markup.includes(bad),false)}
});
check('reading owned opportunities cannot equip, save, alter the checkpoint or grant combat effects',()=>{
 const g=game(),a=g.api;item(a,'weapon','siege');item(a,'armor','capacitor');a.start('story');const before=JSON.stringify({garage:a.garage,player:a.player,profile:a.profile,storage:[...g.storage]});for(let i=0;i<5;i++){panel(g);for(const gear of a.garage.inventory){a.gearChoiceSummary(gear);a.gearChoiceMarkup(gear,'private')}}assert.equal(JSON.stringify({garage:a.garage,player:a.player,profile:a.profile,storage:[...g.storage]}),before);assert.equal(a.player.shieldedChargeBonus,0);assert.equal(a.player.chargeDamage,1);
});
check('manual pair equipment activates only on committed round refit without granting shields or repairs',()=>{
 const g=game(),a=g.api,weapon=item(a,'weapon','siege'),armor=item(a,'armor','capacitor');a.start('story');a.player.hp=1;a.player.shield=0;a.player.dose=34;a.presentTacticalRetrofit();a.openRoundGarage();a.garageGearAction('weapon',weapon.id,'equip');a.garageGearAction('armor',armor.id,'equip');assert.equal(pair(a,'chargedBastion').active,true);assert.equal(a.player.shieldedChargeBonus,0);a.finishRoundGarage();assert.equal(a.player.shieldedChargeBonus,.06);assert.equal(a.player.hp,1);assert.equal(a.player.shield,0);assert.equal(a.player.dose,34);assert.equal(a.player.chargeDamage,1.12);
});
check('banking and dismantling update ownership hints without changing equipment or rerolling item stats',()=>{
 const g=game(),a=g.api,weapon=item(a,'weapon','siege',{locked:true});a.start('story');const drop=a.normalizeGearItem({id:'banked-partner',slot:'armor',tier:0,trait:'capacitor',stats:{hull:1},power:105,name:'Banked partner'}),snapshot=plain(drop);a.collectGear(drop);assert.equal(pair(a,'chargedBastion').available,false,'Pending field gear is not stored yet');a.bankRunLoot();assert.equal(pair(a,'chargedBastion').available,true);assert.deepEqual(plain(a.garage.inventory.find(row=>row.id===drop.id)),snapshot);a.goMenu();g.find('#garage-menu-btn').onclick();a.garageGearAction('armor',drop.id,'dismantle');assert.equal(pair(a,'chargedBastion').available,false);assert.ok(a.garage.inventory.some(row=>row.id===weapon.id));assert.equal(a.garage.equipped.weapon,null);
});
const failed=results.filter(row=>!row.passed).length,report={sourceHashes:Object.fromEntries(['game.js','style.css'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')])),passed:results.length-failed,failed,results,limits:'Actual ownership summaries, markup, banking, native equipment/refit and private VM storage. No auto-equip behavior or combat/difficulty claim.'};fs.writeFileSync(path.join(root,'artifacts/owned-pairs-v161-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} owned-pair checks passed, ${failed} failed`);if(failed)process.exitCode=1;
