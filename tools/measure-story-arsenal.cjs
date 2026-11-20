#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'verify-game.cjs');
function harnessFor(sourceFile){
  let source=fs.readFileSync(sourceFile,'utf8').replaceAll('shots.push(','balanceShotPush(');
  let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
  support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
  support=support.replace('  globalThis.__gameTest = {',`let balanceLedger={fighter:0,force:0,bits:0,missiles:0,packets:0};
  function balanceShotPush(...items){for(const b of items){balanceLedger[b.pod?'force':b.bit?'bits':b.missile?'missiles':'fighter']+=b.d||0;if(b.pod)balanceLedger.packets++}return shots.push(...items)}
  globalThis.__gameTest = {
    get balanceLedger(){return balanceLedger},resetBalanceLedger(){balanceLedger={fighter:0,force:0,bits:0,missiles:0,packets:0}},
    prepareBalance(level,color,loadout){wave=level;bossLab=false;boss=miniBoss=null;miniBossSpawned=true;stagePostEliteClock=0;stageHazardClock=spawn=999;stageIntro=0;t=0;enemies=[];enemyShots=[];shots=[];player.inv=1000;player.pod.owned=!!color;player.laserColor=color;player.laserLevel=loadout==='first'?1:3;player.missileLevel=loadout==='max'?2:0;player.bits=loadout==='max'?2:0;player.pod.mode='docked';player.pod.dockSide='front'},`);
  const module=new Module(file);module.filename=file;module.paths=Module._nodeModulePaths(__dirname);module._compile(support+'\nmodule.exports={createGame};',file);return module.exports.createGame
}
const rows=[];
for(const version of['baseline','updated']){
  const createGame=harnessFor(path.join(root,version==='baseline'?'artifacts/challenge-baseline-game.js':'game.js'));
  for(const stage of[1,2,3,4,5])for(const loadout of['bare','first','max'])for(const mode of['tap','full']){
    const{api}=createGame();api.start('story');api.prepareBalance(stage,loadout==='bare'?null:'red',loadout);
    const step=()=>{api.update(1/120);if(mode==='tap'&&api.player.fire<=0)api.releaseCharge();if(mode==='full'&&api.player.charge>=1-1e-9)api.releaseCharge()};
    if(mode==='full')api.keys.add('Space');for(let n=0;n<240;n++)step();api.resetBalanceLedger();for(let n=0;n<2880;n++)step();
    const ledger=api.balanceLedger,damage=ledger.fighter+ledger.force+ledger.bits+ledger.missiles;assert.ok(Number.isFinite(damage));
    rows.push({version,stage,loadout,mode,seconds:24,kit:{force:api.player.laserLevel,missiles:api.player.missileLevel,bits:api.player.bits},emittedDps:Math.round(damage/24*100)/100,forcePackets:ledger.packets,damage:{...ledger}})
  }
}
const output={scope:'Actual 120 Hz update/fire/charge/cooldown paths in an empty isolated Story lane. Counts emitted damage, not connected damage or boss time to kill. No gear, Doctrine, Field Modules, critical hits, overdrive or Delta. Max requests a perfect pickup kit; current mission limits still apply.',rows};
fs.writeFileSync(path.join(root,'artifacts','story-arsenal-comparison.json'),JSON.stringify(output,null,2)+'\n');
for(const stage of[1,2,3,4])for(const loadout of['first','max']){console.log('MISSION '+stage+' '+loadout+' '+rows.filter(r=>r.stage===stage&&r.loadout===loadout&&r.mode==='tap').map(r=>r.version+' '+r.emittedDps+' DPS').join(' -> '))}
console.log('PASS '+rows.length+' actual-update arsenal measurements.');
