#!/usr/bin/env node
'use strict';

// Seeded actual-update diagnostics. All saves live in the mock's private Map.
// This never opens, imports, or writes the user's browser profile.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const label=arg('label','current').replace(/[^a-z0-9_-]/gi,'_');
const sourceFile=path.resolve(root,arg('source','game.js'));
const original=fs.readFileSync(sourceFile,'utf8');
const seeds=arg('quick','no')==='yes'?[1103]:[1103,2026,7349];
let instrumented=original;
function replaceOnce(before,after){assert.ok(instrumented.includes(before),'Missing diagnostic hook: '+before);instrumented=instrumented.replace(before,after)}
instrumented=instrumented.replaceAll('enemyShots.push(','campaignProbeHostilePush(').replaceAll('shots.push(','campaignProbePlayerPush(');
replaceOnce('function damage(amount=1){','function damage(amount=1){campaignProbe.damageAttempts++;if(player?.inv>0)campaignProbe.invulnerableAttempts++;');
replaceOnce('const hullLost=beforeHp-player.hp;','const hullLost=beforeHp-player.hp;campaignProbe.hullLost+=Math.max(0,hullLost);if(player.shield<campaignProbe.lastShield)campaignProbe.shieldSpent+=campaignProbe.lastShield-player.shield;campaignProbe.lastShield=player.shield;');
replaceOnce('if(bit){b.dead=true;','if(bit){campaignProbe.bitBlocks++;b.dead=true;');
const podHook=instrumented.includes('else if(!b.piercing&&pod.owned&&sweptHit(b,pod)){')?'else if(!b.piercing&&pod.owned&&sweptHit(b,pod)){':'else if(pod.owned&&sweptHit(b,pod)){';
replaceOnce(podHook+'b.dead=true;',podHook+'campaignProbe.podBlocks++;b.dead=true;');
replaceOnce('else if(sweptHit(b,player)){b.dead=true;','else if(sweptHit(b,player)){campaignProbe.playerProjectileContacts++;b.dead=true;');
replaceOnce('function collectCombatPickup(p){','function collectCombatPickup(p){if(campaignProbeNoPickups)return;campaignProbe.pickups[p.type]=(campaignProbe.pickups[p.type]||0)+1;');
replaceOnce('function defeatEnemy(e){if(e.dead)return;','function defeatEnemy(e){if(e.dead)return;campaignProbe.regularKills++;');
replaceOnce('const dealt=Math.min(node.hp,amount);node.hp-=dealt;','const dealt=Math.min(node.hp,amount);campaignProbe.bossDamage+=dealt;node.hp-=dealt;');
const harnessFile=path.join(__dirname,'verify-game.cjs');
let support=fs.readFileSync(harnessFile,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(instrumented)+';');
const hook=`
    get campaignProbe(){return campaignProbe}, campaignProbePickups(enabled){campaignProbeNoPickups=!enabled},
    campaignProbeReset(){campaignProbe={incoming:0,playerShots:0,podBlocks:0,bitBlocks:0,playerProjectileContacts:0,damageAttempts:0,invulnerableAttempts:0,hullLost:0,shieldSpent:0,lastShield:player?.shield||0,regularKills:0,bossDamage:0,pickups:{}}},
    campaignProbeSetup(stage,kind,phase=1,meter=false){wave=stage;t=0;miniBossSpawned=kind!=='fieldPre';miniBoss=boss=null;enemies=[];enemyShots=[];shots=[];pickups=[];stageHazards=[];stageApexIntro=-1;stagePostEliteClock=kind==='fieldPost'?0:-1;stageEncounterCursor=0;stageEvent=0;stageHazardClock=kind==='fieldPost'?3.5:5.4;stageIntro=5.2;spawn=kind==='fieldPost'?.4:.8;victoryDelay=null;state='playing';bossLab=false;bossLabLevel=false;player.inv=.8;player.x=145;player.y=H/2;player.hp=meter?1000:3;player.maxHp=3;
      if(kind==='boss'){makeBoss();boss.phase=phase;if(phase===2)boss.hp=boss.max*.5;}
      if(kind==='mini')makeMiniBoss();
      if(kind==='micro'){bossLab=true;spawn=999;stageHazardClock=999;}
    },
    campaignProbeShot(x,y,speed=190){const a=Math.atan2(player.y-y,player.x-x);campaignProbeHostilePush({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:5,damage:1})},
`;
support=support.replace('spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,','spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,'+hook);
// Hoisted functions are available to all native emitters, while this mutable
// counter is initialized before the first test run starts.
const definitions=`
  let campaignProbeNoPickups=false;
  let campaignProbe={incoming:0,playerShots:0,podBlocks:0,bitBlocks:0,playerProjectileContacts:0,damageAttempts:0,invulnerableAttempts:0,hullLost:0,shieldSpent:0,lastShield:0,regularKills:0,bossDamage:0,pickups:{}};
  function campaignProbeHostilePush(...items){campaignProbe.incoming+=items.length;return enemyShots.push(...items)}
  function campaignProbePlayerPush(...items){campaignProbe.playerShots+=items.length;return shots.push(...items)}
`;
support=support.replace('  globalThis.__gameTest = {',definitions+'\n  globalThis.__gameTest = {');
const harness=new Module(harnessFile,module);harness.filename=harnessFile;harness.paths=Module._nodeModulePaths(__dirname);harness._compile(support+'\nmodule.exports={createGame};',harnessFile);
const {createGame}=harness.exports;
const r=n=>Math.round(n*1000)/1000;
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function fresh(seed){const game=createGame();game.sandbox.__probeRandom=seeded(seed);vm.runInContext('Math.random=globalThis.__probeRandom',vm.createContext(game.sandbox));game.api.start('story');assert.equal(game.api.garage.inventory.length,0);assert.ok(Object.values(game.api.garage.equipped).every(x=>!x));assert.equal(game.api.player.skillsSpent,0);assert.deepEqual(Object.keys(game.api.player.retrofits),[]);return game}
function equip(api,name){if(name==='bare'||name==='natural')return;const level=name==='force1'?1:3;for(let i=0;i<level;i++)api.collectCombatPickup({type:'crystal',color:'red'});if(name==='maxPickedKit')for(let i=0;i<2;i++){api.collectCombatPickup({type:'missile'});api.collectCombatPickup({type:'bit'})}api.player.pod.mode='docked';api.player.pod.dockSide=api.player.pod.returnSide='front'}
function dodge(api){const p=api.player,H=api.logicalSize[1],candidates=[0,-1,1],look=.65;let best=0,bestCost=Infinity;for(const action of candidates){const vy=action*p.speed;let cost=action===0?0:.02;for(const shot of api.enemyShots){if(shot.dead||shot.x<p.x-40||shot.x>p.x+250)continue;const dx=shot.x-p.x,dy=shot.y-p.y,rvx=shot.vx,rvy=shot.vy-vy,den=rvx*rvx+rvy*rvy,at=den?Math.max(0,Math.min(look,-(dx*rvx+dy*rvy)/den)):0,dist=Math.hypot(dx+rvx*at,dy+rvy*at),buffer=p.r+shot.r+12;if(dist<buffer)cost+=(buffer-dist)**2}for(const e of api.enemies){if(e.dead||e.x<p.x-40||e.x>p.x+220)continue;const dx=e.x-p.x,dy=e.y-p.y,rvx=-(e.speed||100),rvy=-vy,den=rvx*rvx+rvy*rvy,at=den?Math.max(0,Math.min(look,-(dx*rvx+dy*rvy)/den)):0,dist=Math.hypot(dx+rvx*at,dy+rvy*at),buffer=p.r+e.r+24;if(dist<buffer)cost+=(buffer-dist)**2*2}for(const h of api.stageHazards){if(h.type==='gate'&&h.x>=p.x&&h.x-p.x<150){const at=(h.x-p.x)/h.speed;if(at<look&&Math.abs(p.y+vy*at-h.gapY)>h.gap*.5-p.r-8)cost+=1000}if(h.type==='debris'&&h.x>=p.x&&h.x-p.x<100){const at=(h.x-p.x)/h.speed;if(at<look&&Math.abs(p.y+vy*at-h.y)<p.r+h.r+10)cost+=1000}}if(p.y+vy*look<48||p.y+vy*look>H-48)cost+=10000;if(cost<bestCost){bestCost=cost;best=action}}api.keys.delete('ArrowUp');api.keys.delete('ArrowDown');if(best<0)api.keys.add('ArrowUp');if(best>0)api.keys.add('ArrowDown')}
function runCase({stage,kind,phase=1,loadout='bare',movement='stationary',fire=false,meter=false,seed=1103,seconds=30}){
  const game=fresh(seed),api=game.api;api.campaignProbeSetup(stage,kind,phase,meter);equip(api,loadout);api.campaignProbePickups(loadout!=='bare');api.campaignProbeReset();if(fire)api.keys.add('Space');let elapsed=0,movementDistance=0,lastY=api.player.y,lastDecision=-1;
  const startHp=api.player.hp;
  for(let tick=0;tick<Math.ceil(seconds*60)&&api.state==='playing';tick++){
    if(movement==='dodge'&&elapsed-lastDecision>=.12){dodge(api);lastDecision=elapsed}
    if(fire&&api.player.charge>=1-1e-9)api.releaseCharge();
    api.update(1/60);elapsed+=1/60;movementDistance+=Math.abs(api.player.y-lastY);lastY=api.player.y;
    if(loadout==='bare')api.pickups.length=0;
    if((kind==='fieldPre'&&api.miniBoss)||(kind==='fieldPost'&&api.stageApexIntro>=0))break;
    if(api.boss&&api.boss.hp<=0)break;
  }
  const p=api.player,stats=JSON.parse(JSON.stringify(api.campaignProbe));
  assert.ok(Number.isFinite(stats.hullLost)&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.equal(Object.values(api.garage.equipped).filter(Boolean).length,0);assert.equal(p.skillsSpent,0);assert.equal(Object.keys(p.retrofits).length,0);
  return{stage,kind,phase,loadout,movement,fire:fire?'full-charge releases':'none',meter,seed,seconds:r(elapsed),endState:api.state,survived:api.state!=='gameover',hullLost:r(startHp-p.hp),endingHull:meter?null:p.hp,endingShield:p.shield,kit:{force:p.pod.owned,level:p.laserLevel,missiles:p.missileLevel,bits:p.bits},movementDistance:r(movementDistance),bossHp:api.boss?r(api.boss.hp):null,bossMax:api.boss?r(api.boss.max):null,miniHp:api.miniBoss?r(api.miniBoss.hp):null,connectedDamage:r(api.runStats?.damageDealt||0),...stats,bossDamage:r(stats.bossDamage),hullLossPerMinute:r(stats.hullLost/elapsed*60),projectileContactRate:r(stats.playerProjectileContacts/elapsed*60),podBlockPct:r(stats.podBlocks/Math.max(1,stats.podBlocks+stats.bitBlocks+stats.playerProjectileContacts)*100)}
}
const result={source:path.relative(root,sourceFile),sha256:crypto.createHash('sha256').update(original).digest('hex'),label,assumptions:{saves:'Private fresh mock storage only; zero equipped gear, zero Doctrine and zero Field Modules asserted every case.',field:'Independent native first48-second and post36-second sections; actual shots, physical movement and naturally touching pickups. Full-charge releases; no auto-aim or forced collections. Post-field force1 is an earned-kit reference snapshot, not a natural whole-run simulation.',pressure:'30-second attack snapshots; hp1000 prevents early death but actual collision, shield and1.2s hull-invulnerability behavior is unchanged. Not a survivability claim.',boss:'Both boss phases initialized independently with actual native movement and attacks; not a full campaign clear test.',dodge:'Physical ArrowUp/Down only, decisions every120ms from incoming trajectories within250px/.65s; respects speed, enemy bodies and stage gates/debris. This simple bot is not a human skill model. Does not teleport or alter bullets.',notThreshold:'Diagnostics assert data integrity, not an arbitrary requirement that an ungeared player must die.'},micro:[],pressure:[],fields:[],fights:[]};
for(const loadout of['bare','force1'])for(const offset of[0,-60,60,-150,150,-250,250]){
  const game=fresh(13),api=game.api;api.campaignProbeSetup(1,'micro',1,true);equip(api,loadout);api.campaignProbeReset();api.update(1/60);api.player.inv=0;api.campaignProbeShot(700,api.player.y+offset);let elapsed=0;while(api.enemyShots.length&&elapsed<5){api.update(1/120);elapsed+=1/120}const metrics=JSON.parse(JSON.stringify(api.campaignProbe));result.micro.push({loadout,offset,...metrics})
}
// Publish pressure results first: useful while the longer field matrix runs.
for(let stage=1;stage<=5;stage++)for(const kind of['mini','boss'])for(const phase of(kind==='boss'?[1,2]:[1]))for(const loadout of['bare','force1','maxPickedKit'])for(const movement of['stationary','dodge'])for(const seed of seeds)result.pressure.push(runCase({stage,kind,phase,loadout,movement,seed,meter:true}));
const artifact=path.join(root,'artifacts','campaign-challenge-'+label+'.json');
fs.writeFileSync(artifact,JSON.stringify(result,null,2)+'\n');
console.log('PRESSURE '+JSON.stringify(result.pressure.filter(s=>s.kind==='boss'&&s.phase===1&&s.movement==='stationary'&&s.seed===seeds[0]).map(s=>({stage:s.stage,kit:s.loadout,hullLost:s.hullLost,podBlocks:s.podBlocks,bitBlocks:s.bitBlocks,playerContacts:s.playerProjectileContacts,incoming:s.incoming}))));
for(let stage=1;stage<=5;stage++)for(const kind of['fieldPre','fieldPost'])for(const movement of['stationary','dodge'])for(const loadout of(kind==='fieldPre'?['bare','natural']:['bare','force1']))for(const seed of seeds)result.fields.push(runCase({stage,kind,movement,loadout,seed,seconds:kind==='fieldPre'?47.9:35.9,fire:true}));
for(let stage=1;stage<=5;stage++)for(const loadout of['bare','force1','maxPickedKit'])for(const movement of['stationary','dodge'])result.fights.push(runCase({stage,kind:'boss',loadout,movement,seed:seeds[0],seconds:75,fire:true}));
const mean=rows=>rows.reduce((s,row)=>s+row,0)/Math.max(1,rows.length);
result.summary={pressure:[],fields:[],fights:result.fights.map(s=>({stage:s.stage,kit:s.loadout,movement:s.movement,seconds:s.seconds,survived:s.survived,hullLost:s.hullLost,bossDamage:s.bossDamage,bossRemaining:s.bossHp,projectilesFired:s.playerShots}))};
for(const kind of['mini','boss'])for(const phase of(kind==='boss'?[1,2]:[1]))for(const loadout of['bare','force1','maxPickedKit'])for(const movement of['stationary','dodge']){const rows=result.pressure.filter(s=>s.kind===kind&&s.phase===phase&&s.loadout===loadout&&s.movement===movement);result.summary.pressure.push({kind,phase,loadout,movement,meanHullLossPerMinute:r(mean(rows.map(s=>s.hullLossPerMinute))),totalPodBlocks:rows.reduce((n,s)=>n+s.podBlocks,0),totalBitBlocks:rows.reduce((n,s)=>n+s.bitBlocks,0),totalPlayerContacts:rows.reduce((n,s)=>n+s.playerProjectileContacts,0)})}
for(const kind of['fieldPre','fieldPost'])for(const movement of['stationary','dodge'])for(const loadout of(kind==='fieldPre'?['bare','natural']:['bare','force1'])){const rows=result.fields.filter(s=>s.kind===kind&&s.movement===movement&&s.loadout===loadout);result.summary.fields.push({kind,movement,loadout,survivalPct:r(rows.filter(s=>s.survived).length/rows.length*100),meanSeconds:r(mean(rows.map(s=>s.seconds))),meanHullLost:r(mean(rows.map(s=>s.hullLost))),totalIncoming:rows.reduce((n,s)=>n+s.incoming,0),totalPodBlocks:rows.reduce((n,s)=>n+s.podBlocks,0),totalPlayerContacts:rows.reduce((n,s)=>n+s.playerProjectileContacts,0),meanConnectedDamage:r(mean(rows.map(s=>s.connectedDamage)))})}
assert.ok(result.micro.find(s=>s.loadout==='bare'&&s.offset===0).playerProjectileContacts===1,'Unprotected aimed projectile must connect in the native update');
assert.ok(result.pressure.every(s=>s.playerProjectileContacts+s.podBlocks+s.bitBlocks<=s.incoming),'Native interception counters cannot exceed emitted hostiles');
fs.writeFileSync(artifact,JSON.stringify(result,null,2)+'\n');
const report='PASS actual-update challenge diagnostics; '+result.pressure.length+' pressure snapshots, '+result.fields.length+' field segments, '+result.fights.length+' boss fights\n'+JSON.stringify(result.summary,null,2)+'\n';
fs.writeFileSync(path.join(root,'artifacts','campaign-challenge-'+label+'-verification.txt'),report);
console.log(report);
