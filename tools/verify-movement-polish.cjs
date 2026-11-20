#!/usr/bin/env node
'use strict';

// Reuse the shipping game's isolated VM support, but do not run its unrelated
// image-material suite or access browser saves. Extra accessors exist only here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const harnessPath = path.join(__dirname, 'verify-game.cjs');
let support = fs.readFileSync(harnessPath, 'utf8');
const firstTest = support.indexOf('\ntest(');
assert.ok(firstTest > 0);
support = support.slice(0, firstTest).replace('updateMiniBossMovement,', 'updateMiniBossMovement,updateEnemyStageMotion,updateBossMovement,updateEpicBossMovement,bossVisualAngle,');
support = support.replace('const context = vm.createContext(sandbox);', 'const context = vm.createContext(sandbox);vm.runInContext("Math.random=()=>.25",context);');
const harness = new Module(harnessPath, module);
harness.filename = harnessPath;
harness.paths = module.paths;
harness._compile(support + '\nmodule.exports={createGame};\n', harnessPath);
const { createGame } = harness.exports;
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
function advanceRegular(api, enemy, seconds, rate = 120) {
  for (let step = 0; step < seconds * rate; step++) {
    enemy.phase += 1 / rate; enemy.x -= enemy.speed / rate;
    api.updateEnemyStageMotion(enemy, 1 / rate);
  }
}

check('regular sector paths stay bounded, continuous and distinct for all three enemy hulls', () => {
  const { api } = createGame(), styles = ['drift','rail','swim','mirror','seed','pulse','ghost','solar','orbit','apex'], signatures = [];
  for (const style of styles) {
    for (const type of ['wing','drone','turret']) {
      const enemy = { type, stageStyle:style, x:900, y:270, phase:.37, speed:130, threat:{movementScale:1.12} };
      let peakStep = 0;
      for (let tick = 0; tick < 1200; tick++) {
        const before = enemy.y; advanceRegular(api, enemy, 1 / 120);
        peakStep = Math.max(peakStep, Math.abs(enemy.y - before));
        assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
        assert.ok(enemy.y >= 52 && enemy.y <= 488);
      }
      assert.ok(peakStep < 2, 'A lane change must not snap vertically');
      if (type === 'turret') assert.ok(Math.abs(enemy.y - 270) < 8, 'A turret needs a steady firing platform');
      if (type === 'wing') signatures.push(enemy.y.toFixed(2));
    }
  }
  assert.ok(new Set(signatures).size >= 8, 'Sector flight styles must not collapse to one generic bob');
});

check('drones hold a lane, relocate deliberately and slow their route during a firing tell', () => {
  const { api } = createGame(), make = () => ({type:'drone',stageStyle:'pulse',x:900,y:270,phase:0,speed:100});
  const drone = make(); advanceRegular(api, drone, .3); assert.equal(drone.y,270);
  advanceRegular(api, drone, 1); assert.ok(Math.abs(drone.y-270)>4);
  const ready = JSON.parse(JSON.stringify(drone)), aiming = JSON.parse(JSON.stringify(drone));
  aiming.fireAnim=.2; aiming.fireReleased=false;
  const from=drone.y;advanceRegular(api,ready,.25);advanceRegular(api,aiming,.25);
  assert.ok(Math.abs(aiming.y-from)<Math.abs(ready.y-from));
  assert.ok(aiming.x>ready.x, 'Aiming drones should slow their advance without reversing it');
});

check('all ten elites preserve authored entry, bounded travel and restrained banking', () => {
  const { api } = createGame();
  for(let type=0;type<10;type++) {
    api.startMiniBossLab(type);api.player.inv=1e6;const enemy=api.miniBoss,phases=new Set();let peak=0;
    for(let tick=0;tick<2400;tick++) {
      const before={x:enemy.x,y:enemy.y};api.update(1/120);phases.add(enemy.flight.phase);
      peak=Math.max(peak,Math.hypot(enemy.x-before.x,enemy.y-before.y));
      if(tick/120>enemy.introMax+.1)assert.ok(enemy.x>=720&&enemy.x<=850&&enemy.y>=100&&enemy.y<=440);
      assert.ok(Math.abs(enemy.visualAngle)<=.065+1e-9);
    }
    assert.ok(peak<3.2);assert.ok(phases.has('entry')&&phases.has('hold')&&phases.has('travel'));
  }
});

check('every main-boss phase change retains continuous body and core positions', () => {
  const {api}=createGame();
  for(let type=0;type<10;type++) {
    api.startBossLab(type);const boss=api.boss;boss.intro=0;boss.x=760;boss.y=270;boss.clock=8.3;boss.cool=10;
    for(let tick=0;tick<900;tick++) {
      if(tick===450)boss.phase=2;
      const before={x:boss.x,y:boss.y};boss.clock+=1/120;api.updateBossMovement(boss,1/120);
      assert.ok(Math.hypot(boss.x-before.x,boss.y-before.y)<=3.501);
      assert.ok(boss.y>=82&&boss.y<=458);assert.ok(Math.abs(api.bossVisualAngle(boss))<=.0261);
      for(const node of api.activeWeakNodes(boss)){const point=api.worldWeakNode(boss,node);assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));}
    }
  }
});

check('both four-phase epics glide through phase-tempo changes without jumps', () => {
  const{api}=createGame();
  for(let id=0;id<2;id++) {
    api.startEpicBossLab(id);const boss=api.boss;boss.intro=0;boss.x=760;boss.y=270;boss.cool=10;
    for(let phase=1;phase<=4;phase++) {
      boss.phase=phase;
      for(let tick=0;tick<180;tick++) {
        const before={x:boss.x,y:boss.y};boss.clock+=1/120;api.updateEpicBossMovement(boss,1/120);
        assert.ok(Math.hypot(boss.x-before.x,boss.y-before.y)<=3.1671);
        assert.ok(boss.y>=82&&boss.y<=458);assert.ok(Math.abs(api.bossVisualAngle(boss))<=.0041);
      }
    }
  }
});

check('boss motion settles during a windup and Reduced Motion removes banking', () => {
  const{api,sandbox}=createGame();api.startBossLab(1);const ready=JSON.parse(JSON.stringify(api.boss)),aiming=JSON.parse(JSON.stringify(api.boss));
  for(const boss of[ready,aiming]){boss.intro=0;boss.cool=10;boss.clock=3;boss.motionPhaseY=1;boss.motionPhaseX=1;}
  aiming.cool=.1;
  for(let tick=0;tick<60;tick++)for(const boss of[ready,aiming]){boss.clock+=1/120;api.updateBossMovement(boss,1/120);}
  assert.ok(aiming.motionPhaseY-1<(ready.motionPhaseY-1)*.5);
  sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;assert.equal(api.bossVisualAngle(ready),0);
});

check('all 22 encounters retain identical routes at 30, 60 and 120 display frames per second', () => {
  for(const family of ['mini','main','epic'])for(let type=0;type<(family==='epic'?2:10);type++){
    const paths=[];
    for(const rate of [30,60,120]){
      const{api}=createGame();
      if(family==='mini')api.startMiniBossLab(type);
      else if(family==='main')api.startBossLab(type);
      else api.startEpicBossLab(type);
      const enemy=family==='mini'?api.miniBoss:api.boss,path=[];
      enemy.cool=10;enemy.lastShotClock=-10;api.player.inv=1e6;
      if(family!=='mini'){enemy.intro=0;enemy.x=760;enemy.y=270;enemy.clock=0;enemy.moveTimer=1;}
      api.loop(1000);
      for(let frame=0;frame<6*rate;frame++){
        if(family!=='mini')enemy.phase=family==='epic'?1+Math.floor(frame/(1.5*rate)):frame<3*rate?1:2;
        api.loop(1000+(frame+1)*1000/rate);
        assert.equal(api.state,'playing');
        if((frame+1)%rate===0)path.push({x:enemy.x,y:enemy.y});
      }
      paths.push(path);
    }
    for(let rateIndex=0;rateIndex<2;rateIndex++)for(let second=0;second<6;second++){
      const distance=Math.hypot(paths[rateIndex][second].x-paths[2][second].x,paths[rateIndex][second].y-paths[2][second].y);
      assert.ok(distance<1e-7,`${family} ${type}, ${[30,60][rateIndex]} Hz at ${second+1}s diverged ${distance.toFixed(9)}px`);
    }
  }
});

console.log(`\n${passed} movement-polish checks passed.`);
