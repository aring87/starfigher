(() => {
  'use strict';

  window.STARFIGHTER_STAGES = [
    {
      id:1,name:'SHATTERED MERIDIAN',sector:'ORBITAL GRAVEYARD',art:'assets/levels/level-01-shattered-meridian.png',
      briefing:'Thread the broken fleet while tumbling armor closes the firing lane.',hazard:'wreck',hazardLabel:'RICOCHET DEBRIS',
      sky:['#030718','#21114a','#5b2876'],accent:'#62eaff',accent2:'#d66cff',silhouette:'#050815',enemyStyle:'drift',scroll:1
    },
    {
      id:2,name:'CINDER RAIL',sector:'MOBILE FOUNDRY',art:'assets/levels/level-02-cinder-rail.png',
      briefing:'Ride the furnace line through synchronized pistons and slag vents.',hazard:'piston',hazardLabel:'CRUSHER ARRAY',
      sky:['#0a0505','#4a130c','#e35b16'],accent:'#ffb13c',accent2:'#3ff3df',silhouette:'#090506',enemyStyle:'rail',scroll:1.12
    },
    {
      id:3,name:'PELAGIC TRENCH',sector:'ABYSSAL FACILITY',art:'assets/levels/level-03-pelagic-trench.png',
      briefing:'Fight the pressure current and luminous mines below the last research dome.',hazard:'current',hazardLabel:'PRESSURE SURGE',
      sky:['#01080e','#052d3c','#087b77'],accent:'#54fff0',accent2:'#82ff72',silhouette:'#010a0d',enemyStyle:'swim',scroll:.82
    },
    {
      id:4,name:'CRYSTAL VESPER',sector:'PRISM CATHEDRAL',art:'assets/levels/level-04-crystal-vesper.png',
      briefing:'Read the refraction telegraphs before the cathedral focuses its light.',hazard:'prism',hazardLabel:'REFRACTION LANCE',
      sky:['#07051a','#222061','#56369a'],accent:'#c8f8ff',accent2:'#df78ff',silhouette:'#080717',enemyStyle:'mirror',scroll:.94
    },
    {
      id:5,name:'IRON ORCHARD',sector:'AUTONOMOUS COLONY',art:'assets/levels/level-05-iron-orchard.png',
      briefing:'Break formation as the machine garden folds its armored petals shut.',hazard:'vine',hazardLabel:'CABLE BLOOM',
      sky:['#06100e','#174139','#805b1a'],accent:'#ffcc55',accent2:'#5fffd2',silhouette:'#06100c',enemyStyle:'seed',scroll:.9
    },
    {
      id:6,name:'HOLLOW ENGINE',sector:'LIVING DREADNOUGHT',art:'assets/levels/level-06-hollow-engine.png',
      briefing:'Enter a vessel that breathes; every armored aperture is a mouth.',hazard:'maw',hazardLabel:'PERISTALTIC GATE',
      sky:['#090307','#321019','#173d2a'],accent:'#69ff86',accent2:'#ff526e',silhouette:'#080306',enemyStyle:'pulse',scroll:.78
    },
    {
      id:7,name:'NECROPOLIS RELAY',sector:'DEAD SIGNAL ARRAY',art:'assets/levels/level-07-necropolis-relay.png',
      briefing:'Ghost transmissions wake the fleet whenever the relay storm discharges.',hazard:'emp',hazardLabel:'EMP ECHO',
      sky:['#030711','#15223c','#342658'],accent:'#86efff',accent2:'#aa79ff',silhouette:'#03060d',enemyStyle:'ghost',scroll:.86
    },
    {
      id:8,name:'HELIOS SCAR',sector:'CORONAL HARVESTER',art:'assets/levels/level-08-helios-scar.png',
      briefing:'Cross heat-shield shadows before the next stellar flare sweeps the lane.',hazard:'flare',hazardLabel:'CORONAL FRONT',
      sky:['#120805','#7e280d','#ffe07a'],accent:'#fff3ad',accent2:'#ff6638',silhouette:'#0e0807',enemyStyle:'solar',scroll:1.16
    },
    {
      id:9,name:'EVENTIDE ENGINE',sector:'GRAVITY OBSERVATORY',art:'assets/levels/level-09-eventide-engine.png',
      briefing:'Counter the singularity pull while inverted debris rewrites its orbit.',hazard:'gravity',hazardLabel:'GRAVITY WELL',
      sky:['#010208','#100d2d','#39226a'],accent:'#b8f6ff',accent2:'#9e68ff',silhouette:'#02030a',enemyStyle:'orbit',scroll:.72
    },
    {
      id:10,name:'LAST SIGNAL',sector:'BEACON ZERO',art:'assets/levels/level-10-last-signal.png',
      briefing:'Survive the collapsing beacon as every failed system joins the final defense.',hazard:'collapse',hazardLabel:'CORE COLLAPSE',
      sky:['#02040b','#10295a','#641d65'],accent:'#efffff',accent2:'#ff4fbd',silhouette:'#02040a',enemyStyle:'apex',scroll:1.04
    }
  ];
})();
