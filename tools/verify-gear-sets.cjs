#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest(')).replace('globalThis.__gameTest = {','globalThis.__gameTest = {gearSetStates,gearChoiceSummary,gearChoiceMarkup,renderGarageSets,');const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(__dirname);isolated._compile(support+'\nmodule.exports={createGame};\n',file);const{createGame}=isolated.exports,results=[];
function test(name,fn){try{fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const slots=['weapon','armor','engine','pod'],intrinsics=['arc','capacitor','phase','shepherd'];
function setup(){const g=createGame();g.api.garage.inventory=[];g.api.garage.equipped={};return g}
function piece(a,slot,alignment,serial,tier=0){const item=a.normalizeGearItem({id:'set-'+serial,slot,alignment,tier,power:100,stats:{},gunVariant:slot==='weapon'?intrinsics[slots.indexOf(slot)]:null,trait:slot==='weapon'?null:intrinsics[slots.indexOf(slot)],name:slot+' test'});a.garage.inventory.push(item);return item}
test('set counts use equipped slots rather than stored pieces and work at every rarity',()=>{
 for(let tier=0;tier<5;tier++){const{api:a}=setup();for(let i=0;i<4;i++){const item=piece(a,slots[i],'VANGUARD',i,tier);if(i<2)a.garage.equipped[slots[i]]=item.id}const set=a.gearSetStates().find(s=>s.alignment==='VANGUARD');assert.equal(set.count,2);assert.deepEqual(Array.from(set.thresholds,t=>t.active),[true,false]);}
});
test('displayed two- and four-piece activations agree with actual classic build bonuses',()=>{
 for(const alignment of['VANGUARD','AEGIS','VECTOR'])for(let count=0;count<=4;count++){
  const{api:a}=setup();for(let i=0;i<count;i++){const item=piece(a,slots[i],alignment,i);a.garage.equipped[slots[i]]=item.id}a.start('story');const set=a.gearSetStates().find(s=>s.alignment===alignment);assert.equal(set.count,count);assert.equal(set.thresholds[0].active,count>=2);assert.equal(set.thresholds[1].active,count>=4);
  if(alignment==='VANGUARD'){assert.equal(a.player.weakDamage,count>=2?1.04:1);assert.equal(a.player.damage,count>=4?1.03:1);assert.equal(a.player.podDamage,count>=4?1.03:1)}
  if(alignment==='AEGIS'){assert.equal(a.player.shield,count>=2?1:0);assert.equal(a.player.pod.r,count>=4?14:13)}
  if(alignment==='VECTOR'){assert.equal(a.player.doseGain,count>=2?1.05:1);assert.equal(a.player.chargeSpeed,count>=4?1.04:1);assert.equal(a.player.podMove,count>=4?1.04:1)}
 }
});
test('mixed two-plus-two sets retain both real bonuses without claiming either four-piece effect',()=>{
 const{api:a}=setup();for(let i=0;i<4;i++){const item=piece(a,slots[i],i<2?'VANGUARD':'AEGIS',i);a.garage.equipped[slots[i]]=item.id}a.start('story');const states=a.gearSetStates();assert.equal(states.filter(s=>s.thresholds[0].active).length,2);assert.equal(states.some(s=>s.thresholds[1].active),false);assert.equal(a.player.weakDamage,1.04);assert.equal(a.player.shield,1);assert.equal(a.player.pod.r,13);
});
test('replacement previews show the resulting count and losses without changing equipment or resources',()=>{
 const g=setup(),a=g.api;for(let i=0;i<4;i++){const item=piece(a,slots[i],'AEGIS',i);a.garage.equipped[slots[i]]=item.id}a.start('story');const candidate=piece(a,'weapon','VANGUARD','candidate'),before=JSON.stringify({garage:a.garage,player:a.player}),summary=a.gearChoiceSummary(candidate);assert.equal(summary.setPreview.before,0);assert.equal(summary.setPreview.after,1);assert.ok(summary.resonanceChanges.some(c=>c.alignment==='AEGIS'&&c.threshold===4&&!c.gained));assert.match(a.gearChoiceMarkup(candidate,'stored:'+candidate.id),/VANGUARD · 0 → 1\/4 PIECES/);assert.equal(JSON.stringify({garage:a.garage,player:a.player}),before);const equipped=a.garage.inventory.find(i=>i.id===a.garage.equipped.armor);const same=a.gearChoiceSummary(equipped);assert.equal(same.setPreview.before,4);assert.equal(same.setPreview.after,4);
});
test('set disclosures are independent and explicitly distinguish new-run shields from refit resources',()=>{
 const g=setup(),a=g.api;a.renderGarageSets(['AEGIS']);const strip=g.find('#equipped-gear').children.find(c=>c.className==='gear-set-strip'),panels=strip.children;assert.equal(panels.length,3);assert.equal(panels.find(p=>p.dataset.gearSet==='AEGIS').open,true);assert.equal(panels.filter(p=>p.open).length,1);assert.match(panels.find(p=>p.dataset.gearSet==='AEGIS').innerHTML,/Refitting does not refill them/);assert.match(panels.find(p=>p.dataset.gearSet==='VECTOR').innerHTML,/DOSE generation \+5%/);
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(root,'artifacts/gear-sets-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} gear-set checks passed, ${failed} failed`);if(failed)process.exitCode=1;
