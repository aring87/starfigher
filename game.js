(() => {
  'use strict';
  const canvas=document.querySelector('#game'),W=canvas.width,H=canvas.height;
  let ctx=canvas.getContext('2d');
  const $=s=>document.querySelector(s),keys=new Set(),screens=[...document.querySelectorAll('.screen')];
  // Preserve the authored 960x540 arena while matching a large/high-DPI display.
  // The 2x ceiling bounds GPU cost and leaves input/collision coordinates intact.
  function fitCanvas(){
    const rect=canvas.getBoundingClientRect(),density=Number(window.devicePixelRatio)||1,scale=Math.min(2,Math.max(1,rect.width/W*density));
    const width=Math.round(W*scale),height=Math.round(H*scale);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
  }
  addEventListener('resize',fitCanvas);document.addEventListener('fullscreenchange',fitCanvas);fitCanvas();
  const storage=(()=>{
    const memory=new Map(),sessionKeys=new Set(),protectedKeys=new Set();let sessionOnly=false,hardFailure=false;
    function unavailable(reason='Browser storage is blocked or full.',preserved=false){sessionOnly=true;if(!preserved)hardFailure=true;const status=$('#save-status');if(status){status.hidden=false;status.textContent='SESSION SAVE ONLY';status.title=reason+' Progress remains available in this tab but may be lost when it closes.'}}
    function settle(){if(!sessionOnly||hardFailure||protectedKeys.size||sessionKeys.size)return;sessionOnly=false;const status=$('#save-status');if(status){status.hidden=true;status.textContent='';status.title=''}}
    return{
      get sessionOnly(){return sessionOnly},
      getItem(key){key=String(key);if(sessionKeys.has(key))return memory.get(key)??null;try{const value=localStorage.getItem(key);if(value===null)memory.delete(key);else memory.set(key,value);return value}catch{unavailable();return memory.get(key)??null}},
      setItem(key,value){key=String(key);value=String(value);memory.set(key,value);if(protectedKeys.has(key)){sessionKeys.add(key);unavailable('An existing save could not be read and has been preserved.',true);return}try{localStorage.setItem(key,value);sessionKeys.delete(key)}catch{sessionKeys.add(key);unavailable()}},
      removeItem(key){key=String(key);memory.delete(key);try{localStorage.removeItem(key);sessionKeys.delete(key);protectedKeys.delete(key)}catch{sessionKeys.add(key);unavailable()}settle()},
      protectItem(key){protectedKeys.add(String(key));unavailable('An existing save could not be read and has been preserved.',true)}
    }
  })();
  const bindingsAPI=window.StarfighterBindings,controlsStorage={getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)};
  let controlBindings=bindingsAPI.load(controlsStorage),controlsUI=null,gamepadController=null,inputDevice=window.STARFIGHTER_TRAINING_SANDBOX&&window.STARFIGHTER_INPUT_DEVICE==='controller'?'controller':'keyboard',controlsReturnFocus=null,padNavDirection='',padNavNext=0,padNavRoot=null,inputFocused=true;
  const uiText=window.StarfighterUiText.create({document,storage:window.STARFIGHTER_TRAINING_SANDBOX?{getItem:key=>controlsStorage.getItem(key),setItem(key,value){controlsStorage.setItem(key,value);return false}}:controlsStorage,
    onChange(value,{persist}){if(persist&&window.STARFIGHTER_TRAINING_SANDBOX)window.parent?.postMessage?.({type:'starfighter-ui-text-changed',value},window.location.origin)}});
  // Opt-in local performance log (see diagnostics.js). Uses the raw browser store, never the game's save wrapper,
  // and is inert in the isolated Flight School document. Every call below is a no-op while the log is off.
  const diagnostics=window.StarfighterDiagnostics?.create?.({window,document,sandbox:!!window.STARFIGHTER_TRAINING_SANDBOX,
    version:(document.querySelector?.('script[src*="game.js"]')?.src||'').match(/[?&]v=(\d+)/)?.[1]?.replace(/^/,'v')||'dev',
    storage:{getItem:key=>{try{return window.localStorage.getItem(key)}catch{return null}},setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>{try{window.localStorage.removeItem(key)}catch{}}}})
    ||{active:false,enabled:false,frame(){},idle(){},mark(){},setContext(){},setKey(){},setSettings(){},setEnvironment(){},bind(){return false}};
  diagnostics.setKey(()=>boss?`${boss.epic?'epic':'boss'}:${boss.type}:p${boss.phase}`:miniBoss?`mini:${miniBoss.type??'x'}`:`field:${runMode}:${wave}`);
  diagnostics.setContext(()=>({state,mode:runMode,segment:runSegment,wave,lab:!!bossLab,
    boss:boss?{kind:boss.kind,type:boss.type,epic:!!boss.epic,phase:boss.phase,hp:+(boss.hp/boss.max||0).toFixed(2),weakOpen:!!boss.weakOpen}:null,
    mini:miniBoss?{type:miniBoss.type,hp:+(miniBoss.hp/miniBoss.max||0).toFixed(2)}:null,
    enemies:enemies?.length,enemyShots:enemyShots?.length,shots:shots?.length,particles:particles?.length,debris:debris?.length,fragments:bossFragments?.length,pickups:pickups?.length,
    paletteCache:nativePaletteCache.size,runSeconds:Math.round(runElapsed)}));
  diagnostics.setSettings(()=>({reducedMotion:!!settings.reducedMotion,clearCombat:!!settings.clearCombat,collisionGuide:!!settings.collisionGuide,uiText:uiText.value,
    muted:!!muted,musicVolume,sfxVolume,mouseFlight:!!mouse.move,inputDevice}));
  diagnostics.setEnvironment(()=>({canvas:[canvas.width,canvas.height],fullscreen:!!document.fullscreenElement}));
  diagnostics.bind(document);
  const emptyPadFrame=()=>({connected:false,moveX:0,moveY:0,fire:false,precision:false,pressed:{},nav:{x:0,y:0},rawButtons:[]});
  let padFrame=emptyPadFrame();
  const keyHeld=action=>(controlBindings.keyboard[action]||[]).some(code=>keys.has(code));
  const inputLabel=action=>inputDevice==='controller'&&controlBindings.controller[action]?bindingsAPI.labelButton(controlBindings.controller[action][0]):bindingsAPI.labelKey(controlBindings.keyboard[action][0]);
  let bossLabMini=false,artInspection=null;
  const mouse={x:W*.5,y:H*.5,inside:false,firing:false,move:storage.getItem('mouseFlight')==='true'};
  const settings=window.STARFIGHTER_SETTINGS||{reducedMotion:false,clearCombat:false,collisionGuide:false};
  const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const spriteAtlas=new Image();spriteAtlas.src='assets/combat-sprite-atlas.png';
  const bossSpriteFiles=['boss-01-bloodstar-animated-v2.png','boss-02-twin-maw-alpha-v2.png','boss-03-helix-crown-alpha-v2.png','boss-04-rift-wraith-alpha-v2.png','boss-05-iron-bloom-screen.png','boss-06-void-leviathan-screen.png','boss-07-prism-warden-screen.png','boss-08-gravebell-screen.png','boss-09-solar-hydra-screen.png','boss-10-omega-heart-screen.png'];
  const bossSprites=bossSpriteFiles.map((name,index)=>loadBossAsset(`assets/bosses/${name}`,index>=1&&index<=3));
  const bloodstarPhaseSprites=[
    loadBossAsset('assets/bosses/boss-01-bloodstar-phase1-4frame-alpha-v4.png',true,true),
    loadBossAsset('assets/bosses/boss-01-bloodstar-phase2-4frame-alpha-v4.png',true,true)
  ];
  const riftPhaseSprites=[
    loadBossAsset('assets/bosses/boss-04-rift-wraith-phase1-4frame-alpha-v5.png',true,true),
    loadBossAsset('assets/bosses/boss-04-rift-wraith-phase2-4frame-alpha-v3.png',true,true)
  ];
  const riftPhase1InbetweenSprite=loadBossAsset('assets/bosses/boss-04-rift-wraith-phase1-inbetweens-4frame-alpha-v2.png',true,true);
  const ironBloomPhaseSprites=[
    loadBossAsset('assets/bosses/boss-05-iron-bloom-phase1-4frame-alpha-v2.png',true,true),
    loadBossAsset('assets/bosses/boss-05-iron-bloom-phase2-4frame-alpha-v2.png',true,true)
  ];
  const ironBloomInbetweenSprites=[
    loadBossAsset('assets/bosses/boss-05-iron-bloom-phase1-inbetweens-4frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-05-iron-bloom-phase2-inbetweens-4frame-alpha-v1.png',true,true)
  ];
  const voidLeviathanGranularSprites=[
    loadBossAsset('assets/bosses/boss-06-void-leviathan-phase1-granular-16frame-alpha-v3.png',true,true),
    loadBossAsset('assets/bosses/boss-06-void-leviathan-phase2-granular-16frame-alpha-v3.png',true,true)
  ];
  const voidLeviathanTentacleWeakSprites=[
    loadBossAsset('assets/bosses/boss-06-void-leviathan-phase1-tentacle-weak-mask-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-06-void-leviathan-phase2-tentacle-weak-mask-16frame-alpha-v1.png',true,true)
  ];
  const prismWardenGranularSprites=[
    loadBossAsset('assets/bosses/boss-07-prism-warden-phase1-granular-16frame-alpha-v3.png',true,true),
    loadBossAsset('assets/bosses/boss-07-prism-warden-phase2-granular-16frame-alpha-v3.png',true,true)
  ];
  const prismWardenWeakGlowSprites=[
    loadBossAsset('assets/bosses/boss-07-prism-warden-phase1-weak-glow-mask-16frame-alpha-v2.png',true,true),
    loadBossAsset('assets/bosses/boss-07-prism-warden-phase2-weak-glow-mask-16frame-alpha-v2.png',true,true)
  ];
  const gravebellGranularSprites=[
    loadBossAsset('assets/bosses/boss-08-gravebell-phase1-granular-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-08-gravebell-phase2-granular-16frame-alpha-v1.png',true,true)
  ];
  const gravebellWeakGlowSprites=[
    loadBossAsset('assets/bosses/boss-08-gravebell-phase1-weak-glow-mask-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-08-gravebell-phase2-weak-glow-mask-16frame-alpha-v1.png',true,true)
  ];
  const solarHydraGranularSprites=[
    loadBossAsset('assets/bosses/boss-09-solar-hydra-phase1-granular-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-09-solar-hydra-phase2-granular-16frame-alpha-v1.png',true,true)
  ];
  const omegaHeartGranularSprites=[
    loadBossAsset('assets/bosses/boss-10-omega-heart-phase1-granular-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-10-omega-heart-phase2-granular-16frame-alpha-v1.png',true,true)
  ];
  const omegaHeartWeakGlowSprites=[
    loadBossAsset('assets/bosses/boss-10-omega-heart-phase1-weak-glow-mask-16frame-alpha-v1.png',true,true),
    loadBossAsset('assets/bosses/boss-10-omega-heart-phase2-weak-glow-mask-16frame-alpha-v1.png',true,true)
  ];
  const bossInbetween32Files={
    5:['boss-06-void-leviathan-phase1-inbetweens-16frame-alpha-v1.png','boss-06-void-leviathan-phase2-inbetweens-16frame-alpha-v1.png'],
    6:['boss-07-prism-warden-phase1-inbetweens-16frame-alpha-v1.png','boss-07-prism-warden-phase2-inbetweens-16frame-alpha-v1.png'],
    7:['boss-08-gravebell-phase1-inbetweens-16frame-alpha-v1.png','boss-08-gravebell-phase2-inbetweens-16frame-alpha-v1.png'],
    8:['boss-09-solar-hydra-phase1-inbetweens-16frame-alpha-v1.png','boss-09-solar-hydra-phase2-inbetweens-16frame-alpha-v1.png'],
    9:['boss-10-omega-heart-phase1-inbetweens-16frame-alpha-v1.png','boss-10-omega-heart-phase2-inbetweens-16frame-alpha-v1.png']
  },bossInbetween32Dimensions={5:[1254,1254],6:[1536,1024],7:[1280,1280],8:[1280,1280],9:[1280,1280]},bossInbetween32Sprites={};
  const bloodstarWeakpointAtlases=[
    Array.from({length:8},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase1-node${index+1}-pixel-weakpoint-v3.png`,true)),
    Array.from({length:8},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase2-node${index+1}-pixel-weakpoint-v3.png`,true))
  ];
  const bloodstarTentacleMasks=[
    Array.from({length:6},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase1-tentacle${index+1}-remove-mask-v2.png`,true)),
    Array.from({length:6},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase2-tentacle${index+1}-remove-mask-v2.png`,true))
  ];
  const bloodstarTentacleFragments=[
    Array.from({length:6},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase1-tentacle${index+1}-fragment-v2.png`,true)),
    Array.from({length:6},(_,index)=>loadBossAsset(`assets/bosses/weakpoint-atlases/bloodstar-phase2-tentacle${index+1}-fragment-v2.png`,true))
  ];
  const bloodstarScratch=document.createElement('canvas'),bloodstarScratchCtx=bloodstarScratch.getContext('2d');bloodstarScratch.width=bloodstarScratch.height=448;
  const bossWeakpointFiles=['boss-01-bloodstar-weakpoints.png','boss-02-twin-maw-weakpoints.png','boss-03-helix-crown-weakpoints.png','boss-04-rift-wraith-weakpoints.png','boss-05-iron-bloom-weakpoints.png','boss-06-void-leviathan-weakpoints.png','boss-07-prism-warden-weakpoints.png','boss-08-gravebell-weakpoints.png','boss-09-solar-hydra-weakpoints.png','boss-10-omega-heart-weakpoints.png'];
  const bossWeakpointSprites=bossWeakpointFiles.map(name=>loadBossAsset(`assets/weakpoints/${name}`));
  const stageDefs=Array.isArray(window.STARFIGHTER_STAGES)&&window.STARFIGHTER_STAGES.length?window.STARFIGHTER_STAGES:[{id:1,name:'LAST SIGNAL',sector:'DEEP SPACE',art:null,briefing:'Survive the signal corridor.',hazard:'wreck',hazardLabel:'DEBRIS',sky:['#030612','#13234a','#4d1d57'],accent:'#4ef5ff',accent2:'#ff4f9a',silhouette:'#03050a',enemyStyle:'drift',scroll:1}];
  const miniBossDefs=[
    {name:'WRECK REAVER',file:'elite-01-shattered-meridian-atlas-alpha-v2.png',color:'#62eaff',accent:'#d66cff',w:190,h:128,r:48,rate:8.6,flex:3.2,key:true,weak:[[-9,-31],[7,0],[-9,31]]},
    {name:'FORGE GNAWER',file:'elite-02-cinder-rail-atlas-alpha-v2.png',color:'#ff9d25',accent:'#44f6df',w:192,h:128,r:49,rate:8.2,flex:3.8,key:true,weak:[[-4,-30],[-8,0],[-4,30]]},
    {name:'ABYSS STALKER',file:'elite-03-pelagic-trench-atlas-alpha-v2.png',color:'#55fff0',accent:'#82ff72',w:198,h:126,r:48,rate:8,flex:5,key:false,weak:[[-3,-33],[5,0],[-3,33]]},
    {name:'VESPER SHARD',file:'elite-04-crystal-vesper-atlas-alpha-v2.png',color:'#d7fbff',accent:'#df78ff',w:190,h:130,r:48,rate:8.5,flex:4.2,key:false,weak:[[-4,-32],[4,0],[-4,32]]},
    {name:'SEED TYRANT',file:'elite-05-iron-orchard-atlas-alpha-v2.png',color:'#ffca4a',accent:'#5fffd2',w:198,h:132,r:50,rate:7.8,flex:5.2,key:false,weak:[[-3,-34],[8,0],[-3,34]]},
    {name:'HOLLOW MAW',file:'elite-06-hollow-engine-atlas-alpha-v2.png',color:'#6cff88',accent:'#ff526e',w:194,h:132,r:50,rate:8.8,flex:4.6,key:true,weak:[[-10,-30],[-15,0],[-10,30]]},
    {name:'RELAY WARDEN',file:'elite-07-necropolis-relay-atlas-alpha-v2.png',color:'#87efff',accent:'#ad79ff',w:190,h:126,r:48,rate:8.1,flex:3.7,key:true,weak:[[-5,-31],[8,0],[-5,31]]},
    {name:'CINDER SERAPH',file:'elite-08-helios-scar-atlas-alpha-v2.png',color:'#ffb03c',accent:'#ff5c31',w:196,h:132,r:50,rate:8.7,flex:4.8,key:true,weak:[[-8,-33],[-12,0],[-8,33]]},
    {name:'GRAVITY LANCER',file:'elite-09-eventide-engine-atlas-alpha-v2.png',color:'#baf7ff',accent:'#9e68ff',w:188,h:130,r:49,rate:7.9,flex:5,key:true,weak:[[-2,-34],[4,0],[-2,34]]},
    {name:'SIGNAL EXECUTOR',file:'elite-10-last-signal-atlas-alpha-v2.png',color:'#58efff',accent:'#ff4fbd',w:194,h:130,r:50,rate:8.4,flex:4.3,key:true,weak:[[-6,-33],[7,0],[-6,33]]}
  ];
  // Native emissive anatomy measured in each 384x256 atlas cell, mapped
  // into the authored render size. These tracks drive art and hit detection.
  const miniBossCoreTracks=[
    [[[12.77,-20.29],[27.26,8.08],[10.69,29.72]],[[14.9,-16.7],[21.45,7.31],[18.15,32.94]],[[15.11,-13.99],[19.14,7.54],[17.99,31.44]],[[12.27,-14.76],[12.94,6.63],[13.3,30.03]],[[12.33,-16.74],[26.71,6.12],[10.86,29.76]],[[15.79,-16.08],[19.86,6.29],[19.57,31.02]],[[14.49,-16.05],[19.43,6.2],[19.68,36.01]],[[16.51,-20.27],[13.02,5.89],[10.63,28.64]],[[12.54,-16.5],[26.54,5.15],[8.69,26.72]],[[14.18,-15.69],[21.36,4.59],[16.54,35.79]],[[11.37,-15.28],[19.47,4.62],[17.36,34.5]],[[15.51,-17.94],[12.79,4.03],[14.71,36.28]],[[20.27,-16.16],[26.14,3.35],[8.97,29.28]],[[13.34,-16.57],[20.37,2.77],[17.74,31.46]],[[12.8,-18.72],[18.24,2.59],[16.78,32.49]],[[15.79,-20.17],[14.03,2.26],[15.72,35.81]]],
    [[[23.59,-18.66],[-0.89,7.78],[20.44,33.74]],[[21.8,-16.58],[-2.67,7.85],[17.11,33.61]],[[22.02,-16.43],[-4.08,7.82],[18.82,32.96]],[[18.98,-16.65],[-5.42,7.95],[18.04,32.17]],[[26.89,-21.57],[-1.02,6.17],[19.39,31.88]],[[22.94,-21.67],[-2.86,6.3],[16.4,30.83]],[[24.3,-21.14],[-4.27,5.86],[15.31,30.19]],[[22.68,-19.34],[-6.48,5.35],[17.89,27.48]],[[25.45,-25.23],[-3.36,4.25],[13.14,32.82]],[[26.79,-23.87],[-4.4,4.23],[11.38,32.11]],[[25.6,-24.31],[-5.95,3.76],[11.26,34.03]],[[24.31,-24.98],[-8.08,4.23],[7.0,29.0]],[[29.04,-27.31],[-3.35,1.17],[17.7,35.57]],[[28.63,-27.16],[-3.46,1.18],[17.11,34.07]],[[25.42,-26.84],[-5.0,1.43],[17.3,37.21]],[[22.4,-27.01],[-7.65,1.5],[15.21,37.17]]],
    [[[-23.22,-28.23],[15.47,2.98],[-18.01,30.24]],[[-28.74,-30.42],[11.33,4.5],[-23.99,31.58]],[[-28.99,-30.25],[12.05,4.43],[-24.05,31.57]],[[-31.95,-33.21],[9.48,4.86],[-29.27,33.1]],[[-23.82,-29.05],[14.16,2.33],[-15.38,28.5]],[[-26.97,-30.63],[13.01,2.42],[-21.42,30.75]],[[-29.52,-31.54],[12.38,2.2],[-22.05,30.41]],[[-33.05,-34.02],[8.43,2.12],[-27.41,32.87]],[[-26.86,-30.47],[17.23,0.29],[-14.41,28.26]],[[-30.19,-32.98],[13.5,0.3],[-20.0,29.52]],[[-32.12,-33.26],[12.68,0.03],[-21.13,30.58]],[[-32.79,-35.37],[9.45,0.41],[-26.1,32.79]],[[-26.11,-32.13],[16.78,-1.16],[-14.58,26.54]],[[-31.12,-33.95],[14.54,-1.51],[-19.32,29.22]],[[-31.63,-33.88],[13.12,-1.56],[-20.18,29.42]],[[-33.88,-35.56],[10.32,-2.22],[-25.62,30.83]]],
    [[[-15.4,-27.42],[5.39,6.45],[4.01,37.52]],[[-18.75,-28.65],[2.35,7.06],[-1.75,39.07]],[[-16.28,-27.9],[4.52,7.21],[0.05,37.77]],[[-16.88,-28.19],[4.5,6.68],[0.11,37.96]],[[-15.32,-28.4],[6.63,7.01],[0.31,36.82]],[[-19.61,-29.3],[3.91,7.56],[-1.1,37.73]],[[-18.78,-28.39],[4.88,7.41],[-0.8,36.52]],[[-18.34,-28.87],[5.58,7.69],[-1.59,36.55]],[[-15.21,-28.73],[6.73,7.74],[1.89,36.59]],[[-19.19,-28.61],[4.0,7.38],[-1.59,37.59]],[[-16.44,-28.4],[6.2,7.83],[1.88,37.07]],[[-17.23,-28.7],[4.15,7.56],[0.2,37.41]],[[-16.07,-30.11],[6.48,7.25],[3.67,34.75]],[[-19.19,-29.32],[4.18,6.97],[0.92,36.63]],[[-17.49,-29.67],[6.65,7.49],[2.84,35.34]],[[-17.33,-29.8],[5.45,7.01],[2.19,35.89]]],
    [[[-7.69,-29.82],[25.98,7.73],[-8.05,36.11]],[[-12.65,-34.28],[25.28,8.01],[-13.07,38.62]],[[-13.44,-34.85],[24.45,7.91],[-12.81,38.5]],[[-12.79,-34.4],[24.07,8.98],[-13.86,38.58]],[[-12.63,-33.8],[25.49,9.29],[-10.39,36.32]],[[-12.72,-34.25],[24.65,8.34],[-11.37,37.4]],[[-11.43,-32.8],[24.96,7.63],[-10.65,37.07]],[[-11.87,-33.26],[24.49,7.61],[-11.39,36.93]],[[-10.0,-32.48],[27.16,6.45],[-7.64,34.89]],[[-12.47,-34.01],[26.61,5.53],[-9.44,35.32]],[[-12.22,-34.03],[26.26,5.64],[-9.86,35.43]],[[-12.46,-34.2],[24.44,6.77],[-12.28,37.63]],[[-13.91,-36.31],[28.07,4.65],[-4.75,32.65]],[[-10.92,-35.19],[27.46,4.32],[-6.91,33.81]],[[-12.24,-35.06],[26.87,4.37],[-7.24,33.86]],[[0.75,-26.06],[25.56,4.25],[-8.24,35.39]]],
    [[[-3.5,-22.66],[23.92,6.59],[21.1,26.47]],[[-7.1,-29.43],[22.42,4.63],[16.17,22.25]],[[-1.0,-23.0],[24.0,4.55],[16.68,21.44]],[[-1.0,-23.0],[21.96,5.14],[22.0,25.0]],[[-4.16,-23.21],[23.83,3.95],[21.17,25.05]],[[-9.77,-26.7],[19.5,2.13],[14.52,22.47]],[[-4.26,-16.3],[21.82,7.42],[22.0,25.0]],[[-4.28,-16.96],[20.8,10.32],[22.0,25.0]],[[-5.11,-24.93],[22.61,1.44],[21.96,22.63]],[[-10.99,-25.04],[21.43,-0.03],[13.06,26.41]],[[-4.28,-18.6],[25.91,8.49],[22.0,25.0]],[[-3.58,-19.19],[20.76,9.58],[22.0,25.0]],[[-6.48,-25.12],[21.64,-0.28],[22.96,20.68]],[[-7.83,-25.98],[19.85,4.23],[13.01,25.3]],[[-4.95,-21.7],[26.06,6.86],[-8.589,21.656]],[[-5.16,-22.65],[21.73,7.74],[-12.63,21.141]]],
    [[[-6.8,-23.97],[28.25,5.35],[2.45,25.8]],[[-13.89,-25.27],[23.61,5.04],[-0.46,26.84]],[[-0.63,-25.71],[17.72,4.88],[-2.78,27.11]],[[-1.03,-24.5],[17.97,5.08],[-5.99,26.77]],[[-9.07,-26.04],[28.36,3.51],[0.5,25.6]],[[-16.13,-27.94],[23.08,3.13],[-0.98,26.3]],[[-1.05,-25.27],[18.59,3.3],[-5.54,25.16]],[[-1.35,-25.08],[18.13,2.76],[-5.74,24.93]],[[-12.05,-28.46],[27.35,1.35],[0.77,23.06]],[[-17.29,-28.5],[22.53,0.75],[-2.21,22.9]],[[0.85,-28.64],[18.4,0.63],[-5.26,22.53]],[[1.66,-29.43],[20.52,0.67],[-4.52,22.66]],[[-14.29,-29.91],[25.16,0.09],[-1.55,21.41]],[[-14.33,-26.66],[22.21,-1.43],[-0.88,20.16]],[[1.79,-26.89],[17.98,-1.4],[-5.53,20.09]],[[1.61,-30.82],[20.12,-1.57],[-6.12,19.35]]],
    [[[-10.33,-20.75],[-11.9,6.73],[13.15,29.02]],[[-13.86,-22.03],[-11.85,6.69],[14.43,29.29]],[[-19.99,-22.64],[-9.83,4.04],[13.41,31.48]],[[-16.41,-23.98],[-9.66,4.93],[11.07,31.64]],[[-13.72,-23.26],[-12.82,2.75],[12.31,27.58]],[[-16.2,-25.33],[-12.05,1.3],[16.07,25.79]],[[-18.49,-23.83],[-8.64,2.39],[14.66,25.63]],[[-11.84,-16.47],[-10.19,4.69],[9.98,25.18]],[[-15.66,-19.88],[-14.07,1.25],[14.16,25.86]],[[-14.17,-18.79],[-10.36,3.97],[14.34,25.37]],[[-12.04,-16.51],[-5.64,7.91],[13.39,25.15]],[[-9.61,-15.97],[-9.29,7.15],[10.84,24.65]],[[-14.09,-17.72],[-7.38,4.02],[16.66,23.62]],[[-13.61,-16.77],[-4.78,7.85],[16.38,23.55]],[[-11.77,-17.09],[-7.4,6.49],[9.3,23.15]],[[-10.61,-17.83],[-10.74,5.01],[5.01,23.45]]],
    [[[9.12,-11.73],[-13.44,16.06],[17.78,35.11]],[[3.08,-11.84],[-15.79,16.11],[9.68,31.87]],[[17.4,-10.6],[-11.45,15.71],[8.12,30.4]],[[15.73,-10.6],[-11.09,16.07],[23.43,30.66]],[[12.11,-9.73],[-14.3,16.37],[16.13,33.35]],[[4.94,-13.14],[-13.48,16.62],[11.15,28.75]],[[15.12,-11.74],[-11.6,16.26],[6.33,34.99]],[[13.39,-11.17],[-10.93,16.02],[21.69,31.43]],[[10.11,-10.03],[-15.59,16.78],[14.75,31.28]],[[6.91,-14.42],[-13.39,15.77],[7.07,26.69]],[[12.08,-11.93],[-11.68,15.74],[6.95,26.99]],[[12.66,-10.22],[-10.65,15.92],[21.32,29.7]],[[9.39,-17.05],[-15.29,11.66],[9.24,26.07]],[[8.19,-11.24],[-8.84,17.47],[-3.427,19.805]],[[16.23,-13.48],[-11.52,15.96],[-11.26,17.773]],[[20.66,-13.59],[-15.37,14.82],[-14.198,14.219]]],
    [[[6.94,-17.77],[0.82,5.35],[4.96,28.83]],[[1.93,-23.19],[-5.49,5.62],[1.59,30.89]],[[-1.2,-25.07],[-9.13,5.74],[-2.84,34.62]],[[-7.59,-28.69],[-1.32,13.58],[-6.66,36.8]],[[4.43,-23.25],[-0.55,3.25],[5.5,28.87]],[[-1.61,-23.16],[-5.82,3.46],[0.02,27.83]],[[-3.4,-26.19],[-6.48,5.91],[-2.37,29.37]],[[-7.5,-26.83],[-4.38,11.07],[-8.19,34.42]],[[4.9,-24.48],[0.56,1.67],[6.3,25.47]],[[0.13,-24.79],[-4.68,1.31],[1.97,26.43]],[[-4.61,-24.1],[-5.22,4.35],[0.79,28.87]],[[-7.74,-28.28],[-4.17,8.28],[-5.01,31.36]],[[2.44,-26.6],[-5.33,3.38],[6.02,23.63]],[[-2.08,-27.27],[1.89,1.6],[8.7,23.52]],[[-4.43,-23.67],[-0.72,3.08],[-0.81,26.02]],[[-1.79,-15.27],[-7.3,4.19],[-5.01,22.99]]],
  ];
  const miniBossCoreProfiles=[
    [[14,14],[14,9],[15,14]],
    [[16,13],[9,11],[16,13]],
    [[16,16],[15,8],[16,16]],
    [[17,17],[8,17],[18,15]],
    [[20,17],[15,8],[20,17]],
    [[13,15],[12,12],[13,14]],
    [[17,13],[10,12],[17,13]],
    [[16,14],[13,16],[16,14]],
    [[16,14],[14,15],[16,14]],
    [[15,16],[8,13],[17,15]]
  ];
  const miniBossMaterialHues=[[192,268,192],[172,28,172],[125,125,125],[260,260,260],[170,170,170],[0,95,0],[258,255,258],[20,20,20],[263,225,263],[305,190,305]];
  // Each tracked outer core controls an actual silhouette appendage. The
  // middle reactor is deliberately solid: a broken core scorches its housing.
  // Joint offsets follow the measured native track in every atlas cell.
  const miniBossAppendageMaps=[
    {upper:{id:'dorsal-fin',offset:[-5,-11],axis:[.05,-1],width:48,spread:.18},lower:{id:'ventral-fin',offset:[0,3],axis:[.05,1],width:52,spread:.18}},
    {upper:{id:'upper-crusher-arch',offset:[-8,-9],axis:[.1,-1],width:58,spread:.15},lower:{id:'lower-crusher-arch',offset:[-5,0],axis:[.05,1],width:58,spread:.15}},
    {upper:{id:'upper-pressure-fin',offset:[6,4],axis:[-.12,-1],width:45,spread:.18},lower:{id:'lower-pressure-fin',offset:[6,-2],axis:[-.12,1],width:45,spread:.18}},
    {upper:{id:'upper-prism-wing',offset:[5,4],axis:[.15,-1],width:40,spread:.2},lower:{id:'lower-prism-wing',offset:[-4,-8],axis:[.14,1],width:42,spread:.2}},
    {upper:{id:'upper-blade-petal',offset:[6,7],axis:[.45,-1],width:45,spread:.18},lower:{id:'lower-blade-petal',offset:[5,-6],axis:[.45,1],width:45,spread:.18}},
    {upper:{id:'upper-jaw-blade',offset:[24,15],axis:[-.18,-1],width:30,spread:.18},lower:{id:'lower-jaw-blade',offset:[5,-10],axis:[-.2,1],width:28,spread:.18}},
    {upper:{id:'upper-relay-wing',offset:[5,0],axis:[.2,-1],width:50,spread:.18},lower:{id:'lower-relay-wing',offset:[0,-1],axis:[.2,1],width:46,spread:.18}},
    {upper:{id:'upper-coronal-blade',offset:[6,-6],axis:[.15,-1],width:55,spread:.17},lower:{id:'lower-coronal-blade',offset:[4,-2],axis:[.2,1],width:52,spread:.17}},
    {upper:{id:'upper-gravity-fin',offset:[-3,-15],axis:[.1,-1],width:53,spread:.16},lower:{id:'lower-gravity-fin',offset:[-4,-7],axis:[.05,1],width:50,spread:.16}},
    {upper:{id:'upper-signal-wing',offset:[-3,-10],axis:[.1,-1],width:48,spread:.18},lower:{id:'lower-signal-wing',offset:[0,-2],axis:[.1,1],width:50,spread:.18}}
  ];
  function miniBossFractureProfile(e,node,frameOverride){
    const index=node.miniIndex??Math.max(0,activeWeakNodes(e).indexOf(node));if(index===1)return null;
    const frame=Number.isInteger(frameOverride)?((frameOverride%16)+16)%16:miniBossFrame(e),tracks=miniBossCoreTracks[e.type]?.[frame],point=tracks?.[index],center=tracks?.[1],map=miniBossAppendageMaps[e.type]?.[index===0?'upper':'lower'];
    if(!point||!center||!map)return null;
    const motion=bossSpriteMotion(e),magnitude=Math.hypot(...map.axis),axis=map.axis.map(value=>value/magnitude),tangent=[-axis[1],axis[0]],joint=[point[0]+map.offset[0],point[1]+map.offset[1]];
    const clearance=e.type===5?25:22,projection=(joint[0]-center[0])*axis[0]+(joint[1]-center[1])*axis[1],shift=Math.max(0,clearance-projection);joint[0]+=axis[0]*shift;joint[1]+=axis[1]*shift;
    const length=Math.max(e.def.w,e.def.h)*1.65,half=map.width/2,farHalf=half+length*map.spread;
    const at=(distance,side)=>[(joint[0]+axis[0]*distance+tangent[0]*side)*motion.x,(joint[1]+axis[1]*distance+tangent[1]*side)*motion.y];
    const cutlineVertices=[at(0,-half),at(1.5,0),at(0,half)],vertices=[...cutlineVertices,at(length,farHalf),at(length,-farHalf)],xs=vertices.map(point=>point[0]),ys=vertices.map(point=>point[1]);
    return{x:joint[0]*motion.x,y:joint[1]*motion.y,w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),angle:0,scaleX:motion.x,scaleY:motion.y,index,groupId:`mini-${e.type}-${map.id}`,name:map.id,axis,vertices,cutlineVertices,protectedHousing:{x:center[0]*motion.x,y:center[1]*motion.y,rx:18*motion.x,ry:18*motion.y}}
  }
  const miniBossSprites=Array(miniBossDefs.length);
  const stageArt=stageDefs.map(stage=>stage.art?loadBossAsset(stage.art):null);
  let state='menu',last=0,t=0,score=0,wave=1,kills=0,best=+(storage.getItem('lastSignalBest')||0),muted=storage.getItem('starfighterMuted')==='true',bossLab=false,bossLabLevel=false,bossLabEpic=false,bossLabRunAll=false,bossLabIndex=0;
  let player,shots,enemies,enemyShots,particles,debris,bossFragments,pickups,stars,depthRocks,depthDust,spawn,scroll,boss,miniBoss,miniBossSpawned,shake,pendingUpgrade,victoryDelay,upgradeOpensTree=false,runElapsed=0,runStats,runEpicEncounter=null,epicHeavies=[],stageHazards=[],stageIntro=0,stageHazardClock=0,stageFlash=0,stageEvent=0,stageEncounterCursor=0,stageCue=null,stagePostEliteClock=-1,stageApexIntro=-1;
  let selectedMode='story',runMode='story',runStartWave=1,runSegment='mission',runActive=false,runOutcome='lost',pendingBriefing=null,garageRunContext=null,lossGarageContext=null,garageIntroContext=null;
  let trainingController=null,trainingSession=null,trainingFrame=null,trainingReturn=null,trainingOverlay=null,onboardingController=null;
  const RUN_CHECKPOINT_VERSION=1,CLASSIC_RULESET='classic-v1',CLASSIC_BUILD_VERSION=1,DEFAULT_RUN_RULESET='streamlined-v1',RUN_MODES=['story','rush','replay'],CHECKPOINT_SEGMENTS=['mission','postElite','apex','module','doctrine'];
  const runRewards=window.StarfighterRunProgression;
  let runRuleset=CLASSIC_RULESET,runProgression=null,runEpoch=0;
  const streamlined=()=>runRuleset===runRewards.ruleset&&!trainingSession;
  function applyRunPerks(){if(!streamlined())return;const owned=player.secondChance,ready=player.secondChanceReady;Object.assign(player,runRewards.effectConfig(runProgression.perks));player.secondChanceReady=player.secondChance&&(owned?ready:true)}
  const savedVolume=(key,fallback)=>{const raw=storage.getItem(key),value=Number(raw);return raw!==null&&Number.isFinite(value)?clamp(value,0,1):fallback};
  let musicVolume=savedVolume('starfighterMusicVolume',.3),sfxVolume=savedVolume('starfighterSfxVolume',.82);
  const soundtrack=new Audio();soundtrack.loop=true;soundtrack.preload='auto';soundtrack.volume=musicVolume;let musicKey='';
  soundtrack.id='game-soundtrack';soundtrack.hidden=true;document.body.append(soundtrack);
  const menuMusicStates=new Set(['menu','garage','profiles','missions','briefing','lootguide','bosslab']);
  let bossAudioFade=null;

  const musicBags={level:[],boss:[],epic:[]},lastMusicTrack={level:0,boss:0,epic:0};
  const rarityData=[
    {key:'common',name:'COMMON',color:'#b7c0ca',affixes:1},
    {key:'uncommon',name:'UNCOMMON',color:'#72d68c',affixes:1},
    {key:'rare',name:'RARE',color:'#55a7ff',affixes:2},
    {key:'superrare',name:'SUPER RARE',color:'#b978ff',affixes:2},
    {key:'exotic',name:'EXOTIC',color:'#ffd166',affixes:3}
  ];
  const gearSlots=['weapon','armor','engine','pod'];
  const gearAlignments=['VANGUARD','AEGIS','VECTOR'];
  const GARAGE_CAPACITY=32;
  const gearAffixes={
    weapon:[['damagePct','Fighter Damage',[[2,3],[3,4],[4,5],[5,6],[6,7]],false],['chargePct','Charge Speed',[[2,4],[3,5],[4,6],[5,7],[6,8]],false],['critPct','Critical Chance',[[1,1],[1,2],[2,3],[3,4],[4,5]],false],['weakPct','Core Damage',[[2,4],[3,5],[4,6],[5,8],[7,9]],false]],
    armor:[['hull','Maximum Hull',[[1,1],[1,1],[1,1],[1,1],[1,1]],true],['shields','Starting Shields',[[1,1],[1,1],[1,1],[1,1],[1,1]],true],['evadePct','Evasion',[[1,1],[1,2],[2,3],[2,3],[3,4]],false],['podSize','Pod Barrier Size',[[1,1],[1,1],[1,1],[1,2],[2,2]],true]],
    engine:[['speedPct','Flight Speed',[[2,4],[3,5],[4,6],[5,7],[6,8]],false],['profilePct','Collision Profile',[[2,3],[2,4],[3,5],[4,6],[5,7]],false],['chargePct','Charge Speed',[[2,4],[3,5],[4,6],[5,7],[6,8]],false],['evadePct','Evasion',[[1,1],[1,2],[2,3],[2,3],[3,4]],false]],
    pod:[['podDamagePct','Pod Damage',[[3,5],[4,6],[5,7],[6,9],[8,10]],false],['podSize','Pod Barrier Size',[[1,1],[1,1],[1,1],[1,2],[2,2]],true],['weakPct','Core Damage',[[2,4],[3,5],[4,6],[5,8],[7,9]],false],['shields','Starting Shields',[[1,1],[1,1],[1,1],[1,1],[1,1]],true]]
  };
  const gunVariants=[
    {id:'arc',name:'ARC SPLITTER',desc:'Normal shots add two diagonal bolts at 22% damage.',apply:p=>p.weaponVariant='arc'},
    {id:'siege',name:'SIEGE COIL',desc:'Charged shots deal 12% more damage and grow 10% larger.',apply:p=>{p.weaponVariant='siege';p.chargeDamage*=1.12}},
    {id:'core',name:'CORE BORER',desc:'Exposed weak points take 10% more damage.',apply:p=>{p.weaponVariant='core';p.weakDamage*=1.1}},
    {id:'null',name:'NULL LANCE',desc:'Charged shots penetrate one additional target.',apply:p=>p.weaponVariant='null'},
    {id:'sync',name:'POD SYNCHRONIZER',desc:'The deployed Force auto-fires and gains 6% output.',apply:p=>{p.weaponVariant='sync';p.podAuto=true;p.podDamage*=1.06}}
  ];
  const gearTraits={
    armor:[
      {id:'recovery',name:'RECOVERY WEAVE',desc:'The first Asterprint collected each stage repairs one hull.',apply:p=>p.salvageRepair=true},
      {id:'capacitor',name:'CAPACITOR PLATING',desc:'Shield pickups also generate 8% DOSE.',apply:p=>p.shieldDose=8},
      {id:'ablative',name:'ABLATIVE MEMORY',desc:'Incoming hull damage is reduced by one, once per stage.',apply:p=>{p.ablativeOwned=true;p.ablativeReady=true}}
    ],
    engine:[
      {id:'scavenger',name:'SCAVENGER DRIVE',desc:'Gear pickups boost flight and charge speed by 10% for four seconds.',apply:p=>p.lootSurgePower=.1},
      {id:'phase',name:'PHASE TURBINE',desc:'Collecting gear grants two seconds of collision immunity.',apply:p=>p.lootInvulnerability=2},
      {id:'vector',name:'VECTOR GOVERNOR',desc:'Force deployment and recall are 12% faster.',apply:p=>p.podMove*=1.12}
    ],
    pod:[
      {id:'siphon',name:'ABSORPTION SIPHON',desc:'Force blocks generate an additional 0.6% DOSE.',apply:p=>p.podBlockDose=.6},
      {id:'shepherd',name:'SALVAGE SHEPHERD',desc:'Asterprints are pulled toward the fighter from farther away.',apply:p=>p.gearMagnet+=170},
      {id:'relay',name:'REAR RELAY',desc:'Rear-mounted Force output gains 8%.',apply:p=>p.rearForce*=1.08}
    ]
  };
  const gearCombos=[
    {id:'absorptionCircuit',name:'ABSORPTION CIRCUIT',requires:[['weapon','sync','POD SYNCHRONIZER'],['pod','siphon','ABSORPTION SIPHON']],desc:'Force blocks generate another 0.4% DOSE.',apply:p=>p.podBlockDose+=.4},
    {id:'chargedBastion',name:'CHARGED BASTION',requires:[['weapon','siege','SIEGE COIL'],['armor','capacitor','CAPACITOR PLATING']],desc:'Charged fighter shots gain 6% damage while a shield remains.',apply:p=>p.shieldedChargeBonus=.06},
    {id:'salvageMomentum',name:'SALVAGE MOMENTUM',requires:[['armor','recovery','RECOVERY WEAVE'],['engine','scavenger','SCAVENGER DRIVE']],desc:'Collecting gear grants a six-second Surge instead of four.',apply:p=>p.lootSurgeDuration=6},
    {id:'rearGuard',name:'REAR GUARD',requires:[['engine','vector','VECTOR GOVERNOR'],['pod','relay','REAR RELAY']],desc:'Rear-mounted Force output gains 8%; deployment and recall gain 6% speed.',apply:p=>{p.rearForce*=1.08;p.podMove*=1.06}}
  ];
  const gearNames={weapon:['Kestrel Pulse Lens','Morrow Wave Emitter','Vigil Plasma Fork'],armor:['Bastion Hull Lattice','Pilgrim Aegis Plate','Harrow Reactive Shell'],engine:['Comet Vector Drive','Riftline Turbine','Mercury Ion Thruster'],pod:['Choir Signal Core','Shepherd Drone Matrix','Halo Barrier Orb']};
  const garageThemes=[{id:'signal',name:'SIGNAL BLUE',cost:0},{id:'cinder',name:'CINDER FOUNDRY',cost:18},{id:'nebula',name:'NEBULA VEIL',cost:28},{id:'solar',name:'SOLAR VAULT',cost:42},{id:'void',name:'VOID CATHEDRAL',cost:60}];
  const garageEmblems=[{id:'signal',name:'LAST SIGNAL',glyph:'◇',cost:0},{id:'wing',name:'VOID WING',glyph:'≪',cost:10},{id:'comet',name:'COMET SPEAR',glyph:'✦',cost:18},{id:'crown',name:'APEX CROWN',glyph:'♢',cost:30}];
  const PROFILE_SLOTS=3,profileStorageKey=slot=>`starfighterProfileSlot${slot+1}`; 
  const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function freshGarage(){return{inventory:[],equipped:{weapon:null,armor:null,engine:null,pod:null},materials:0,capacity:GARAGE_CAPACITY,cosmetics:{theme:'signal',owned:['signal'],emblem:'signal',ownedEmblems:['signal'],bayName:'LAST SIGNAL BAY'}}}
  function loadLegacyGarage(){try{const saved=JSON.parse(storage.getItem('starfighterGarage')||'null');if(saved&&Array.isArray(saved.inventory)&&saved.equipped)return saved}catch{}return freshGarage()}
  function freshLifetime(){return{runs:0,bestScore:0,waves:0,kills:0,bosses:0,epicBosses:0,miniBosses:0,playSeconds:0,gear:0,exotics:0,ritualsWon:0,ritualsFailed:0}}
  function finiteOr(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback}
  function textOr(value,fallback){const text=typeof value==='string'||(typeof value==='number'&&Number.isFinite(value))?String(value):'';return text||(typeof fallback==='function'?fallback():fallback)}
  const ONBOARDING_IDS=['missile','bit','shield','delta','gear','module','doctrine','synergy'];
  function freshProfile(slot=0){return{version:6,name:`PILOT ${String(slot+1).padStart(2,'0')}`,garage:freshGarage(),progress:{normalBossesDefeated:Array(10).fill(false),missionsCleared:Array(10).fill(false),epicUnlocked:false,epicBossesDefeated:[0,0],trainingComplete:false,trainingSkipped:false,introComplete:false,onboardingSeen:[]},lifetime:freshLifetime(),history:[],lastRun:null,checkpoint:null}}
  function normalizeProfile(saved,slot=0){
    if(!saved||typeof saved!=='object'||Array.isArray(saved))return null;const priorVersion=saved.version===undefined?0:saved.version;if(typeof priorVersion!=='number'||!Number.isInteger(priorVersion)||priorVersion<0||priorVersion>6)return null;saved.version=6;saved.name=textOr(saved.name,`PILOT ${String(slot+1).padStart(2,'0')}`).slice(0,20);const fallback=slot===0?loadLegacyGarage():freshGarage();const garageUsable=!!saved.garage&&Array.isArray(saved.garage.inventory);if(!garageUsable&&saved.garage!==undefined&&saved.garage!==null&&!fallback.inventory.length)return null;saved.garage=garageUsable?saved.garage:fallback;saved.garage.equipped=saved.garage.equipped&&typeof saved.garage.equipped==='object'&&!Array.isArray(saved.garage.equipped)?saved.garage.equipped:freshGarage().equipped;saved.garage.materials=Math.max(0,finiteOr(saved.garage.materials,0));if(saved.garage.focusSlot)saved.garage.materials+=6;delete saved.garage.focusSlot;saved.garage.capacity=GARAGE_CAPACITY;const cosmeticDefaults=freshGarage().cosmetics,cosmetics=saved.garage.cosmetics||{},ownedThemes=Array.from(new Set(['signal',...(Array.isArray(cosmetics.owned)?cosmetics.owned:[])])),ownedEmblems=Array.from(new Set(['signal',...(Array.isArray(cosmetics.ownedEmblems)?cosmetics.ownedEmblems:[])]));saved.garage.cosmetics={theme:ownedThemes.includes(cosmetics.theme)?cosmetics.theme:'signal',owned:ownedThemes,emblem:ownedEmblems.includes(cosmetics.emblem)?cosmetics.emblem:'signal',ownedEmblems,bayName:textOr(cosmetics.bayName,cosmeticDefaults.bayName).slice(0,22)};saved.garage.inventory=saved.garage.inventory.map(item=>normalizeGearItem(item,priorVersion<5));
    saved.progress=saved.progress||{};saved.progress.normalBossesDefeated=Array.from({length:10},(_,i)=>!!saved.progress.normalBossesDefeated?.[i]);const cleared=Array.isArray(saved.progress.missionsCleared)?saved.progress.missionsCleared:priorVersion<6?saved.progress.normalBossesDefeated:[];saved.progress.missionsCleared=Array.from({length:10},(_,i)=>!!cleared[i]);saved.progress.trainingComplete=!!saved.progress.trainingComplete;saved.progress.trainingSkipped=!!saved.progress.trainingSkipped;saved.progress.introComplete=!!saved.progress.introComplete;const learned=Array.isArray(saved.progress.onboardingSeen)?saved.progress.onboardingSeen:saved.progress.trainingComplete?ONBOARDING_IDS:[];saved.progress.onboardingSeen=Array.from(new Set(learned.filter(id=>ONBOARDING_IDS.includes(id))));saved.progress.epicUnlocked=!!saved.progress.epicUnlocked;saved.progress.epicBossesDefeated=Array.from({length:2},(_,i)=>Math.max(0,finiteOr(saved.progress.epicBossesDefeated?.[i],0)));const plainRecord=entry=>!!entry&&typeof entry==='object'&&!Array.isArray(entry),lifetimeDefaults=freshLifetime();saved.lifetime={...lifetimeDefaults,...(plainRecord(saved.lifetime)?saved.lifetime:{})};for(const key of Object.keys(lifetimeDefaults))saved.lifetime[key]=Math.max(0,finiteOr(saved.lifetime[key],0));saved.history=Array.isArray(saved.history)?saved.history.filter(plainRecord).slice(0,20):[];if(plainRecord(saved.lastRun)){for(const key of['wave','score','kills','normalBosses','epicBosses','miniBosses','shotsFired','chargedShots','damageDealt','damageTaken','shieldsLost','evades','weakspotsDestroyed','gearCollected'])saved.lastRun[key]=finiteOr(saved.lastRun[key],0);for(const key of['duration','commonDrops','uncommonDrops','rareDrops','superDrops','exoticDrops','ritualsWon','ritualsFailed','buffsEarned'])if(key in saved.lastRun)saved.lastRun[key]=finiteOr(saved.lastRun[key],0)}else saved.lastRun=null;return saved
  }
  function readProfileSlot(slot){let key=profileStorageKey(slot),raw=storage.getItem(key);if(!raw&&slot===0){key='starfighterProfile';raw=storage.getItem(key)}if(!raw)return null;try{const saved=normalizeProfile(JSON.parse(raw),slot);if(!saved)throw new Error('Unreadable profile');return saved}catch{storage.protectItem(key);storage.protectItem(profileStorageKey(slot));if(slot===0)for(const alias of['starfighterProfile','starfighterGarage','lastSignalBest'])storage.protectItem(alias);return null}}
  function damagedSlot(slot){const key=profileStorageKey(slot);return !!(storage.getItem(key)||(slot===0&&storage.getItem('starfighterProfile')))&&!readProfileSlot(slot)}
  let activeProfileSlot=clamp(Math.floor(finiteOr(storage.getItem('starfighterActiveProfile'),0)),0,PROFILE_SLOTS-1),profile=readProfileSlot(activeProfileSlot)||freshProfile(activeProfileSlot),garage=profile.garage;best=Number(profile.lifetime.bestScore||0);let runLoot=[],lootToastTimer=0;
  function saveProfile(message='PROFILE SAVED'){profile.garage=garage;profile.lifetime.bestScore=Math.max(profile.lifetime.bestScore||0,best);storage.setItem(profileStorageKey(activeProfileSlot),JSON.stringify(profile));storage.setItem('starfighterActiveProfile',activeProfileSlot);if(activeProfileSlot===0){storage.setItem('starfighterProfile',JSON.stringify(profile));storage.setItem('starfighterGarage',JSON.stringify(garage));storage.setItem('lastSignalBest',best)}const status=$('#profile-save-status');if(status)status.textContent=message}
  function saveGarage(){saveProfile()}
  function renderProfileMenu(){
    const holder=$('#profile-menu-slots');if(!holder)return;holder.innerHTML='';
    for(let slot=0;slot<PROFILE_SLOTS;slot++){
      const saved=readProfileSlot(slot),row=document.createElement('div'),button=document.createElement('button'),actions=document.createElement('div'),select=document.createElement('button'),remove=document.createElement('button'),bosses=saved?.progress?.normalBossesDefeated?.filter(Boolean).length||0,active=slot===activeProfileSlot,damaged=!saved&&damagedSlot(slot);
      row.className='profile-slot-row'+(saved?'':damaged?' damaged':' empty');button.className='profile-slot'+(active?' active':'')+(saved?'':damaged?' damaged':' empty');
      button.innerHTML=saved?'<b>SLOT '+String(slot+1).padStart(2,'0')+' // '+escapeHTML(saved.name)+'</b><span>BEST '+String(saved.lifetime.bestScore||0).padStart(6,'0')+' // '+bosses+'/10 BOSSES // '+(saved.lifetime.runs||0)+' RUNS</span>':damaged?'<b>SLOT '+String(slot+1).padStart(2,'0')+' // DAMAGED SAVE</b><span>COULD NOT BE READ // KEPT UNTOUCHED // CLEAR IT TO REUSE THIS SLOT</span>':'<b>SLOT '+String(slot+1).padStart(2,'0')+' // EMPTY</b><span>SELECT THIS SLOT OR CREATE A NEW GAME</span>';
      button.onclick=()=>activateProfile(slot);actions.className='profile-slot-actions';select.className='profile-select';select.textContent=saved?(active?'ACTIVE // CONTINUE':'SELECT PROFILE'):damaged?'SLOT LOCKED':'CREATE NEW GAME';select.disabled=damaged;
      select.onclick=event=>{event.stopPropagation();if(saved)activateProfile(slot);else if(!damaged){switchProfile(slot);newGame()}};remove.className='profile-delete';remove.textContent=saved?'DELETE SAVE':damaged?'CLEAR DAMAGED SAVE':'NO SAVE DATA';remove.disabled=!saved&&!damaged;remove.onclick=event=>{event.stopPropagation();deleteProfile(slot)};
      actions.appendChild(select);actions.appendChild(remove);row.appendChild(button);row.appendChild(actions);holder.appendChild(row)
    }
    $('#active-profile-name').textContent=profile.name;$('#best-menu').textContent='BEST: '+best.toString().padStart(6,'0');const menuButton=$('#profiles-menu-btn');if(menuButton)menuButton.textContent='PROFILES // '+profile.name;renderRunMenu()
  }
  function activateProfile(slot){if(damagedSlot(slot)){const notice=$('#profiles-status');if(notice)notice.textContent='SLOT '+(slot+1)+' HAS A DAMAGED SAVE // CLEAR IT TO REUSE THE SLOT OR PICK ANOTHER';return}const saved=readProfileSlot(slot);switchProfile(slot);if(saved&&state==='profiles')goMenu()}
  function switchProfile(slot){clearGarageIntro();lossGarageContext=null;onboardingController?.close();activeProfileSlot=clamp(Math.floor(slot),0,PROFILE_SLOTS-1);storage.setItem('starfighterActiveProfile',activeProfileSlot);profile=readProfileSlot(activeProfileSlot)||freshProfile(activeProfileSlot);garage=profile.garage;best=Number(profile.lifetime.bestScore||0);renderProfileMenu();const status=$('#profiles-status');if(status)status.textContent='SLOT '+(activeProfileSlot+1)+' // '+(readProfileSlot(activeProfileSlot)?'PROFILE ACTIVE':'EMPTY SLOT SELECTED')}
  function openProfiles(){state='profiles';$('#hud').classList.add('hidden');renderProfileMenu();show('profiles');const status=$('#profiles-status');if(status)status.textContent='ACTIVE SLOT '+(activeProfileSlot+1)+' // SELECT A PROFILE TO CONTINUE'}
  function deleteProfile(slot){
    const saved=readProfileSlot(slot),damaged=!saved&&damagedSlot(slot);if(!saved&&!damaged)return;if(!window.confirm(saved?'Delete '+saved.name+' from slot '+(slot+1)+'? This save cannot be recovered.':'Clear the damaged save in slot '+(slot+1)+'? The game could not read it and has kept it untouched. This cannot be undone.'))return;
    storage.removeItem(profileStorageKey(slot));if(slot===0){storage.removeItem('starfighterProfile');storage.removeItem('starfighterGarage');storage.removeItem('lastSignalBest')}
    if(slot===activeProfileSlot){const replacement=Array.from({length:PROFILE_SLOTS},(_,index)=>index).find(index=>readProfileSlot(index));activeProfileSlot=replacement??slot;storage.setItem('starfighterActiveProfile',activeProfileSlot);profile=readProfileSlot(activeProfileSlot)||freshProfile(activeProfileSlot);garage=profile.garage;best=Number(profile.lifetime.bestScore||0)}
    renderProfileMenu();const status=$('#profiles-status');if(status)status.textContent='SLOT '+(slot+1)+(damaged?' CLEARED':' DELETED')
  }
  function newGame(){let target=activeProfileSlot,current=readProfileSlot(target);if(current){const empty=Array.from({length:PROFILE_SLOTS},(_,slot)=>slot).find(slot=>!readProfileSlot(slot)&&!damagedSlot(slot));if(empty!==undefined)target=empty;else if(!window.confirm('Overwrite '+current.name+' in profile slot '+(target+1)+'? This cannot be undone.'))return}clearGarageIntro();activeProfileSlot=target;profile=freshProfile(target);garage=profile.garage;best=0;saveProfile('NEW PROFILE CREATED');renderProfileMenu();openGarage();$('#profile-save-status').textContent='NEW PROFILE // NAME AND SAVE'}
  function freshRunStats(){return{finalized:false,shotsFired:0,chargedShots:0,damageDealt:0,damageTaken:0,shieldsLost:0,evades:0,weakspotsDestroyed:0,miniBosses:0,normalBosses:0,epicBosses:0,gearCollected:0,commonDrops:0,uncommonDrops:0,rareDrops:0,superDrops:0,exoticDrops:0,ritualsWon:0,ritualsFailed:0,buffsEarned:0}}
  function finalizeRunProfile(){
    if(bossLab||!runStats||runStats.finalized)return;runStats.finalized=true;
    const record={date:Date.now(),mode:runMode,result:runOutcome,duration:Math.round(runElapsed),score:score|0,wave,kills,shotsFired:runStats.shotsFired,chargedShots:runStats.chargedShots,damageDealt:Math.round(runStats.damageDealt),damageTaken:runStats.damageTaken,shieldsLost:runStats.shieldsLost,evades:runStats.evades,weakspotsDestroyed:runStats.weakspotsDestroyed,miniBosses:runStats.miniBosses,normalBosses:runStats.normalBosses,epicBosses:runStats.epicBosses,gearCollected:runStats.gearCollected,commonDrops:runStats.commonDrops,uncommonDrops:runStats.uncommonDrops,rareDrops:runStats.rareDrops,superDrops:runStats.superDrops,exoticDrops:runStats.exoticDrops,ritualsWon:runStats.ritualsWon,ritualsFailed:runStats.ritualsFailed,buffsEarned:runStats.buffsEarned};
    profile.lastRun=record;profile.history.unshift(record);profile.history=profile.history.slice(0,20);const life=profile.lifetime;life.runs++;life.bestScore=Math.max(life.bestScore||0,record.score);life.waves+=record.normalBosses+record.epicBosses;life.kills+=record.kills;life.bosses+=record.normalBosses;life.epicBosses+=record.epicBosses;life.miniBosses+=record.miniBosses;life.playSeconds+=record.duration;life.gear+=record.gearCollected;life.exotics+=record.exoticDrops;life.ritualsWon+=record.ritualsWon;life.ritualsFailed+=record.ritualsFailed;saveProfile('RUN AUTOSAVED')
  }
  function rollInt(a,b){return Math.floor(rand(a,b+1))}
  function randomGearAffixes(slot,count){
    const pool=[...gearAffixes[slot]];
    for(let i=0;i<count;i++){const pick=i+Math.floor(rand(0,pool.length-i));[pool[i],pool[pick]]=[pool[pick],pool[i]]}
    return pool.slice(0,count)
  }
  function gearHash(value=''){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return Math.abs(hash)}
  function profilePowerFloor(){const cleared=profile?.progress?.normalBossesDefeated?.filter(Boolean).length||0,epic=(profile?.progress?.epicBossesDefeated||[]).reduce((sum,value)=>sum+Number(value||0),0);return Math.min(145,100+cleared*4+Math.min(5,epic)*2)}
  function normalizeGearItem(item,legacyTier=false){
    const gear=item&&typeof item==='object'&&!Array.isArray(item)?item:{};if(!gear.legacySource||gear.legacySource.version!==1||!gear.legacySource.item||typeof gear.legacySource.item!=='object'||Array.isArray(gear.legacySource.item)){const{legacySource,...original}=gear;gear.legacySource={version:1,tierSchema:legacyTier?'pre-v5':'v5',item:JSON.parse(JSON.stringify(original))}}gear.id=textOr(gear.id,()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`);gear.slot=gearSlots.includes(gear.slot)?gear.slot:'weapon';const rawTier=clamp(Math.floor(finiteOr(gear.tier,0)),0,4);gear.tier=legacyTier===true?[0,2,3][Math.min(2,rawTier)]:rawTier;gear.rarity=rarityData[gear.tier].key;const incomingStats=gear.stats&&typeof gear.stats==='object'?gear.stats:{},allowedStats=Object.fromEntries(gearAffixes[gear.slot].map(([key,,ranges])=>[key,ranges[gear.tier][1]])),statLimit=rarityData[gear.tier].affixes;gear.stats=Object.fromEntries(Object.entries(incomingStats).filter(([key])=>Object.prototype.hasOwnProperty.call(allowedStats,key)).slice(0,statLimit).map(([key,value])=>[key,clamp(Math.round(finiteOr(value,0)),0,allowedStats[key])]));gear.power=clamp(Math.round(finiteOr(gear.power||100+gear.tier*4,100+gear.tier*4)),100,160);gear.alignment=gearAlignments.includes(gear.alignment)?gear.alignment:gearAlignments[gearHash(gear.id)%gearAlignments.length];gear.source=textOr(gear.source,'LEGACY CACHE');gear.locked=!!gear.locked;delete gear.masterwork;delete gear.godRoll;
    if(gear.slot==='weapon'){gear.gunVariant=gunVariants.some(v=>v.id===gear.gunVariant)?gear.gunVariant:gunVariants[gearHash(gear.id+'weapon')%gunVariants.length].id;gear.trait=null}else{const traits=gearTraits[gear.slot];gear.trait=traits.some(t=>t.id===gear.trait)?gear.trait:traits[gearHash(gear.id+'trait')%traits.length].id;gear.gunVariant=null}gear.name=textOr(gear.name,()=>gearNames[gear.slot][gearHash(gear.id)%gearNames[gear.slot].length]);return gear
  }
  function generateGear(tier=0,quality=1,customPrefix='',options={}){
    tier=clamp(Math.floor(tier),0,4);const rarity=rarityData[tier],slot=gearSlots[Math.floor(rand(0,gearSlots.length))],pool=randomGearAffixes(slot,rarity.affixes),stats={};for(const [key,,ranges] of pool){const [a,b]=ranges[tier];stats[key]=rollInt(a,b)}
    const base=gearNames[slot][Math.floor(rand(0,gearNames[slot].length))],prefix=String(customPrefix||'').replace(rarityNamePrefix,'').trim(),gunVariant=slot==='weapon'?(options.gunVariant||gunVariants[Math.floor(rand(0,gunVariants.length))].id):null,traits=gearTraits[slot]||[],trait=slot==='weapon'?null:(options.trait||traits[Math.floor(rand(0,traits.length))].id),source=String(options.source||'FIELD ASTERPRINT'),power=clamp(profilePowerFloor()+[0,2,5,9,14][tier]+Math.floor(rand(0,5))+(source.includes('APEX')?3:source.includes('ELITE')?1:0),100,160);return normalizeGearItem({id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,slot,rarity:rarity.key,tier,name:prefix?`${prefix} ${base}`:base,stats,gunVariant,trait,alignment:options.alignment||gearAlignments[Math.floor(rand(0,gearAlignments.length))],power,source,locked:tier===4})
  }
  function gearColor(gear){return rarityData[gear?.tier||0].color}
  const rarityNamePrefix=/^(?:super[\s-]*rare|uncommon|common|rare|exotic)(?:\s+|$)/i;
  function gearDisplayName(gear){const name=String(gear?.name||'');return name.replace(rarityNamePrefix,'').trim()||name}
  function gearIntrinsic(gear){if(gear.slot==='weapon')return gunVariants.find(v=>v.id===gear.gunVariant);return gearTraits[gear.slot]?.find(t=>t.id===gear.trait)}
  function equippedGear(slot){return garage.inventory.find(g=>g.id===garage.equipped[slot])||null}
  function ownedGearForIntrinsic(slot,id){
    const key=slot==='weapon'?'gunVariant':'trait';
    return garage.inventory.filter(item=>item.slot===slot&&item[key]===id).reduce((best,item)=>!best||item.power>best.power||item.power===best.power&&item.tier>best.tier?item:best,null)
  }
  function gearComboStates(){return gearCombos.map(combo=>{const requirements=combo.requires.map(([slot,id,name])=>({slot,id,name,met:equippedGear(slot)?.[slot==='weapon'?'gunVariant':'trait']===id,owned:ownedGearForIntrinsic(slot,id)}));return{...combo,requirements,active:requirements.every(item=>item.met),available:requirements.every(item=>item.owned)}})}
  const gearSlotNames={weapon:'Weapon',armor:'Armor',engine:'Engine',pod:'Force Pod'};
  const gearRoles={arc:'Spread fire',siege:'Charged fire',core:'Core hunting',null:'Piercing shots',sync:'Force control',recovery:'Hull recovery',capacitor:'Shield energy',ablative:'Hull protection',scavenger:'Salvage mobility',phase:'Salvage protection',vector:'Force handling',siphon:'Force absorption',shepherd:'Salvage collection',relay:'Rear coverage'};
  const gearSetBonuses={
    VANGUARD:['Exposed-core damage +4%.','Fighter and Force damage +3%.'],
    AEGIS:['One additional starting shield.','Force interception radius +1.'],
    VECTOR:['DOSE generation +5%.','Charge speed and Force deployment/recall speed +4%.']
  };
  function gearSetStates(items=gearSlots.map(equippedGear)){
    return gearAlignments.map(alignment=>{const count=items.filter(item=>item?.alignment===alignment).length;return{alignment,count,thresholds:[2,4].map((needed,index)=>({needed,active:count>=needed,description:gearSetBonuses[alignment][index]}))}})
  }
  function gearChoiceSummary(gear){
    const current=equippedGear(gear.slot),intrinsic=gearIntrinsic(gear),oldIntrinsic=current?gearIntrinsic(current):null,identity=item=>item?.[item.slot==='weapon'?'gunVariant':'trait'];
    const before=Object.fromEntries(gearSlots.map(slot=>[slot,equippedGear(slot)])),after={...before,[gear.slot]:gear};
    const states=items=>gearCombos.map(combo=>({combo,active:combo.requires.every(([slot,id])=>identity(items[slot])===id)}));
    const prior=states(before),next=states(after),completes=[],breaks=[],keeps=[],partners=[];
    next.forEach(({combo,active},index)=>{
      if(active){if(!prior[index].active)completes.push(combo.id);else if(combo.requires.some(([slot])=>slot===gear.slot))keeps.push(combo.id)}else if(prior[index].active)breaks.push(combo.id);
      if(!active&&combo.requires.some(([slot,id])=>slot===gear.slot&&identity(gear)===id))for(const[slot,id,name]of combo.requires)if(identity(after[slot])!==id)partners.push({comboId:combo.id,comboName:combo.name,slot,id,name,owned:ownedGearForIntrinsic(slot,id)})
    });
    const keys=Array.from(new Set([...Object.keys(current?.stats||{}),...Object.keys(gear.stats||{})]));
    const statChanges=keys.map(key=>({key,label:key==='profilePct'?'Hitbox reduction':statLabels[key]||key,before:Number(current?.stats?.[key]||0),after:Number(gear.stats?.[key]||0),delta:Number(gear.stats?.[key]||0)-Number(current?.stats?.[key]||0)}));
    const count=(items,alignment)=>Object.values(items).filter(item=>item?.alignment===alignment).length,resonanceChanges=[];
    for(const alignment of gearAlignments)for(const threshold of[2,4]){const had=count(before,alignment)>=threshold,has=count(after,alignment)>=threshold;if(had!==has)resonanceChanges.push({alignment,threshold,gained:has})}
    const named=ids=>ids.map(id=>gearCombos.find(combo=>combo.id===id).name),primary=gearCombos.find(combo=>combo.id===(completes[0]||keeps[0]));
    const partner=partners.find(item=>item.owned)||partners[0];
    let context=primary?`${completes.length?'Completes':'Keeps'} ${primary.name}. ${primary.desc}`:partner?partner.owned?`Owned partner: ${gearDisplayName(partner.owned)} (${gearSlotNames[partner.slot]} / ${partner.name}). Equip both for ${partner.comboName}.`:`Pair with ${partner.name} (${gearSlotNames[partner.slot]}) for ${partner.comboName}.`:!current?`Fills your empty ${gearSlotNames[gear.slot].toLowerCase()} slot.`:'';
    if(!context&&resonanceChanges.some(change=>change.gained)){const gain=resonanceChanges.find(change=>change.gained);context=`Adds the ${gain.alignment} ${gain.threshold}-piece bonus.`}
    const intrinsicLost=oldIntrinsic&&oldIntrinsic.id!==intrinsic?.id?oldIntrinsic.name:null,costs=[];
    if(breaks.length)costs.push(`Breaks ${named(breaks).join(', ')}.`);
    for(const loss of resonanceChanges.filter(change=>!change.gained))costs.push(`Loses the ${loss.alignment} ${loss.threshold}-piece bonus.`);
    if(intrinsicLost)costs.push(`Gives up ${intrinsicLost}.`);
    if(!costs.length){const lower=statChanges.find(stat=>stat.delta<0);if(lower)costs.push(`${lower.label} roll: ${lower.before}${lower.key.endsWith('Pct')?'%':''} → ${lower.after}${lower.key.endsWith('Pct')?'%':''}.`)}
    const setPreview={alignment:gear.alignment,before:count(before,gear.alignment),after:count(after,gear.alignment)};
    return{intrinsicName:intrinsic?.name||'STANDARD EQUIPMENT',effect:intrinsic?.desc||'No special effect.',role:gearRoles[identity(gear)]||'Equipment',equipped:!!current&&current.id===gear.id,currentName:current?gearDisplayName(current):null,powerDelta:current?Number(gear.power||100)-Number(current.power||100):null,intrinsicLost,completes,breaks,keeps,partners,statChanges,resonanceChanges,setPreview,context,tradeoff:costs.join(' ')}
  }
  function gearChoiceMarkup(gear,key,expanded=false){
    const summary=gearChoiceSummary(gear),current=equippedGear(gear.slot),comparison=summary.equipped?'EQUIPPED':summary.powerDelta===null?'EMPTY SLOT':summary.powerDelta===0?'SAME POWER':`${summary.powerDelta>0?'+':''}${summary.powerDelta} POWER`;
    const changeRows=summary.statChanges.map(stat=>{const unit=stat.key.endsWith('Pct')?'%':'',label=stat.key==='shields'?`${stat.label} (new run)`:stat.label,value=summary.equipped||!current?`${stat.after}${unit}`:`${stat.before}${unit} → ${stat.after}${unit}`;return`<div class="gear-stat-row"><span>${escapeHTML(label)}</span><b>${value}</b></div>`}).join('');
    const pairRows=[...summary.completes.map(id=>({id,label:'Activates'})),...summary.keeps.map(id=>({id,label:'Retains'})),...summary.breaks.map(id=>({id,label:'Removes'}))].map(({id,label})=>{const combo=gearCombos.find(item=>item.id===id);return`<p><b>${label} ${combo.name}</b> — ${combo.desc}</p>`}).join('');
    const set=summary.setPreview,setLabel=`${set.alignment} · ${set.before===set.after?set.after:set.before+' → '+set.after}/4 PIECES`;
    const resonance=summary.resonanceChanges.map(change=>`<p>${change.gained?'Adds':'Removes'} ${change.alignment} ${change.threshold}-piece resonance.</p>`).join('');
    return`<small class="rarity-${gear.rarity}">${rarityData[gear.tier].name} · ${gearSlotNames[gear.slot]}${summary.equipped?' · EQUIPPED':''}</small><span class="gear-name rarity-${gear.rarity}" title="${escapeHTML(gearDisplayName(gear))}">${escapeHTML(gearDisplayName(gear))}</span><div class="gear-power"><span>POWER ${gear.power}</span><span class="sidegrade">${comparison}</span></div><span class="gear-set-tag alignment-${gear.alignment.toLowerCase()}">${escapeHTML(setLabel)}</span><div class="gear-main-effect"><small>${summary.role}</small><b>${summary.intrinsicName}</b><p>${summary.effect}</p></div>${summary.context?`<p class="gear-fit${summary.completes.length?' pair-ready':''}">${escapeHTML(summary.context)}</p>`:''}${!summary.equipped&&summary.tradeoff?`<p class="gear-tradeoff"><b>TRADE-OFF</b> ${escapeHTML(summary.tradeoff)}</p>`:''}<details class="gear-details" data-gear-detail="${escapeHTML(key)}"${expanded?' open':''}><summary>STATS & COMPARISON</summary><div class="gear-stats">${current&&!summary.equipped?`<p>Replaces ${escapeHTML(gearDisplayName(current))}.</p>`:''}${!changeRows?'<p>No additional stat rolls.</p>':changeRows}<span class="gear-alignment alignment-${gear.alignment.toLowerCase()}">${gear.alignment} RESONANCE</span>${pairRows}${resonance}<p class="gear-source">Recovered from ${escapeHTML(gear.source)}.</p></div></details>`
  }
  function loadoutSignalPower(){const items=gearSlots.map(equippedGear).filter(Boolean);return items.length?Math.round(items.reduce((sum,item)=>sum+Number(item.power||100),0)/items.length):100}
  function applyGearStats(gear){const s=gear.stats;if(s.damagePct)player.damage*=1+s.damagePct/100;if(s.chargePct)player.chargeSpeed*=1+s.chargePct/100;if(s.critPct)player.critChance+=s.critPct/100;if(s.weakPct)player.weakDamage*=1+s.weakPct/100;if(s.hull)player.maxHp+=s.hull;if(s.shields)player.shield+=s.shields;if(s.evadePct)player.evade+=s.evadePct/100;if(s.speedPct)player.speed*=1+s.speedPct/100;if(s.profilePct)player.r*=1-s.profilePct/100;if(s.podDamagePct)player.podDamage*=1+s.podDamagePct/100;if(s.podSize)player.pod.r+=s.podSize;const intrinsic=gearIntrinsic(gear);if(intrinsic)intrinsic.apply(player)}
  function applyLoadout(){const items=gearSlots.map(equippedGear).filter(Boolean),counts=Object.fromEntries(gearAlignments.map(alignment=>[alignment,items.filter(item=>item.alignment===alignment).length]));player.shieldedChargeBonus=0;player.lootSurgeDuration=4;for(const gear of items)applyGearStats(gear);player.signalPower=loadoutSignalPower();player.damage*=1+clamp((player.signalPower-100)/1000,0,.05);if(counts.VANGUARD>=2)player.weakDamage*=1.04;if(counts.AEGIS>=2)player.shield++;if(counts.VECTOR>=2)player.doseGain*=1.05;if(counts.VANGUARD>=4){player.damage*=1.03;player.podDamage*=1.03}if(counts.AEGIS>=4)player.pod.r+=1;if(counts.VECTOR>=4){player.chargeSpeed*=1.04;player.podMove*=1.04}for(const combo of gearComboStates())if(combo.active)combo.apply(player);player.resonance=gearAlignments.filter(alignment=>counts[alignment]>=2).join('+')||'NONE';player.critChance=Math.min(player.critChance,.08);player.evade=Math.min(player.evade,.08);player.hp=player.maxHp}
  function rebuildRunLoadout(){
    if(!player?.pod)return false;
    // Rebuild the stat layer rather than multiplying new equipment over the old
    // build. Recovery and starting-shield grants never refill a live refit.
    const live=player,base={r:12,maxHp:3,speed:255,damage:1,chargeDamage:1,shieldedChargeBonus:0,critChance:0,chargeSpeed:1,podDamage:1,weakDamage:1,evade:0,repairOnApex:0,podAuto:false,redForce:1,blueForce:1,yellowForce:1,missileDamage:1,missileGuidance:1,bitDose:0,podBlockDose:0,shieldDose:0,doseGain:1,podMove:1,rearForce:1,signalPower:100,resonance:'NONE',gearMagnet:210,lootSurgeDuration:4,lootSurgePower:.06,lootInvulnerability:0,salvageRepair:false,ablativeOwned:false,weakBreakDose:0,weakOverdrive:0,secondChance:false,surplusDose:2,weaponVariant:null};
    const rebuilt={...live,...base,hp:3,shield:0,ablativeReady:false,secondChanceReady:false,pod:{...live.pod,r:13}};
    const ablativeSpent=live.loadoutAblativeSpentStage===wave||live.ablativeOwned&&!live.ablativeReady;
    try{
      player=rebuilt;applyLoadout();
      if(runMode==='rush')rebuilt.maxHp=Math.max(rebuilt.maxHp,8);
      if(streamlined())applyRunPerks();else{
        for(const path of skillPaths)for(const node of path.nodes)if(live.skills?.[node.id])node.apply();
        for(const retrofit of tacticalRetrofits){const count=live.retrofits?.[retrofit.key]||0;for(let i=0;i<count;i++)retrofit.apply()}
      }
    }finally{player=live}
    for(const key of Object.keys(base))live[key]=rebuilt[key];
    live.pod.r=rebuilt.pod.r;live.hp=clamp(live.hp,0,live.maxHp);
    // Keep consumed per-stage guards consumed, including across a temporary
    // armor removal. beginStage refreshes owned guards for the next mission.
    live.ablativeReady=live.ablativeOwned&&!ablativeSpent;
    if(ablativeSpent)live.loadoutAblativeSpentStage=wave;
    live.secondChanceReady=live.secondChance&&!!live.secondChanceReady;enforceCombatProgression();
    return true
  }
  function gearPowerDelta(gear){const current=equippedGear(gear.slot);return Number(gear.power||100)-Number(current?.power||100)}
  function gearSalvageValue(gear){return[1,2,4,8,16][gear.tier]||1}
  function collectGear(item){trainingNote('gear');const gear=normalizeGearItem(item),delta=gearPowerDelta(gear),dose=[6,9,13,18,25][gear.tier];runLoot.push(gear);if(runStats&&!bossLab){runStats.gearCollected++;[['commonDrops',0],['uncommonDrops',1],['rareDrops',2],['superDrops',3],['exoticDrops',4]].forEach(([key,tier])=>{if(gear.tier===tier)runStats[key]++})}if(player){addDose(dose);if(streamlined())player.lootSurgeStrength=Math.max(player.lootSurge>0?player.lootSurgeStrength||.06:0,player.lootSurgePower);player.lootSurge=Math.max(player.lootSurge,player.lootSurgeDuration||4);if(player.lootInvulnerability)player.inv=Math.max(player.inv,player.lootInvulnerability);if(player.salvageRepair&&player.salvageRepairStage!==wave&&player.hp<player.maxHp){player.hp++;player.salvageRepairStage=wave}}lootToastTimer=3.6;const toast=$('#loot-toast');toast.className=`loot-toast show rarity-${gear.rarity}`;toast.style.color='';toast.textContent=`${rarityData[gear.tier].name} ${gear.slot.toUpperCase()} // POWER ${gear.power} ${delta>0?'▲'+delta:delta<0?'▼'+Math.abs(delta):'SIDEGRADE'} // +${dose} DOSE`;hud();sfx.pickup(gear.tier);requestOnboarding('gear')}
  function bankRunLoot(message='SALVAGE SECURED'){if(!runLoot.length)return;const protectedIds=new Set(Object.values(garage.equipped).filter(Boolean)),combined=[...garage.inventory,...runLoot].map(item=>normalizeGearItem(item)).sort((a,b)=>Number(protectedIds.has(b.id)||b.locked)-Number(protectedIds.has(a.id)||a.locked)||b.tier-a.tier||b.power-a.power),protectedItems=combined.filter(item=>protectedIds.has(item.id)||item.locked),available=combined.filter(item=>!protectedIds.has(item.id)&&!item.locked),keep=[...protectedItems,...available.slice(0,Math.max(0,GARAGE_CAPACITY-protectedItems.length))],overflow=available.slice(Math.max(0,GARAGE_CAPACITY-protectedItems.length));garage.inventory=keep;runLoot=[];const reclaimed=overflow.reduce((sum,item)=>sum+gearSalvageValue(item),0);garage.materials+=reclaimed;saveGarage();systemToast(`${message}${overflow.length?` // ${overflow.length} OVERFLOW → ${reclaimed} ALLOY`:''}`,'#ffd166')}
  function securePendingRunLoot(){
    // Permanent equipment survives leaving a live run. Keep its checkpoint and
    // attempt accounting untouched; only the existing salvage bank is applied.
    if(runActive&&!bossLab&&!trainingSession&&runLoot?.length)bankRunLoot('RECOVERED GEAR SECURED')
  }
  const statLabels={damagePct:'Fighter damage',chargePct:'Charge speed',critPct:'Critical chance',weakPct:'Core damage',hull:'Maximum hull',shields:'Starting shields',evadePct:'Evasion',speedPct:'Flight speed',profilePct:'Smaller profile',podDamagePct:'Pod damage',podSize:'Pod size'};
  function gearStatsText(gear){const intrinsic=gearIntrinsic(gear),lines=Object.entries(gear.stats).map(([key,value])=>`${statLabels[key]} ${['hull','shields','podSize'].includes(key)?'+':''}${value}${key.endsWith('Pct')?'%':''}`);if(intrinsic)lines.unshift(`<span class="gear-intrinsic"><b>${intrinsic.name}</b> — ${intrinsic.desc}</span>`);return lines.join('<br>')}
  function openGarage(){if(state==='gameover'&&canRetryPoint())lossGarageContext={profile,slot:activeProfileSlot,epoch:runEpoch,point:retryPoint};else if(state!=='garage')lossGarageContext=null;state='garage';sfx.stopCharge();$('#hud').classList.add('hidden');renderGarage();show('garage')}
  const garageIntroSteps=[
    {title:'Your permanent loadout',copy:'This is your real Garage. Equip one weapon, armor, engine and pod. Recovered gear stays with this pilot between runs; field pickups and your three run perks last for the current run.',targets:['equipped-gear']},
    {title:'Read the effect, then compare',copy:'Start with an item’s main effect. Open its details to compare random stat rolls and Power. Higher Power is a useful guide; the effect still needs to suit your build. EQUIP saves your loadout automatically.',targets:['gear-inventory']},
    {title:'Build a combination',copy:'Matching 2 or 4 equipped alignments activates the set bonuses shown below. Equipment Pairs list specific named effects that work together. Open either panel to see exactly what is needed; you do not need a complete set to start.',targets:['garage-set-guide','garage-pair-guide']},
    {title:'Keep what matters',copy:'LOCK protects a keeper. DISMANTLE turns an unlocked, unequipped item into Alloy for cosmetic hangar themes and emblems. Storage holds 32 items. Between rounds, Apply updates your current build; Apply & Retry keeps checkpoint hull and shields. From the main menu, use Load Game to resume a checkpoint.',targets:['gear-inventory','garage-customizer']}
  ];
  function validGarageIntro(){return!!(garageIntroContext&&garageIntroContext.profile===profile&&garageIntroContext.briefing===pendingBriefing&&pendingBriefing?.profile===profile&&pendingBriefing.mode==='story'&&pendingBriefing.introChoice==='play')}
  function clearGarageIntro(){
    garageIntroContext=null;const guide=$('#garage-intro-guide');if(guide)guide.hidden=true;
    for(const id of ['equipped-gear','gear-inventory','garage-set-guide','garage-pair-guide','garage-customizer'])$('#'+id)?.classList.remove('garage-tour-target');
  }
  function renderGarageIntro(focus=false){
    for(const id of ['equipped-gear','gear-inventory','garage-set-guide','garage-pair-guide','garage-customizer'])$('#'+id)?.classList.remove('garage-tour-target');
    const guide=$('#garage-intro-guide');if(!validGarageIntro()){clearGarageIntro();return}
    const index=garageIntroContext.step,step=garageIntroSteps[index];guide.hidden=false;guide.dataset.step=String(index);
    $('#garage-intro-progress').textContent=`FIRST FLIGHT / GARAGE ${index+1} OF ${garageIntroSteps.length}`;
    $('#garage-intro-title').textContent=step.title;$('#garage-intro-copy').textContent=step.copy;
    $('#garage-intro-sample').hidden=!(index===1&&!garage.inventory.length);
    $('#garage-intro-prev-btn').disabled=index===0;$('#garage-intro-next-btn').textContent=index===garageIntroSteps.length-1?'RETURN TO BRIEFING':'NEXT';
    for(const id of step.targets)$('#'+id)?.classList.add('garage-tour-target');
    if(focus){$('#garage-intro-next-btn').focus({preventScroll:true});$('#'+step.targets[0])?.scrollIntoView?.({block:'nearest',inline:'nearest'})}
  }
  function beginGarageIntro(briefing){
    if(state!=='briefing'||briefing!==pendingBriefing||briefing?.profile!==profile||briefing.mode!=='story'||briefing.introChoice!=='play'||garageRunContext||lossGarageContext)return false;
    clearGarageIntro();garageIntroContext={profile,briefing,step:0};onboardingController?.close();openGarage();$('#garage').scrollTop=0;$('#garage-intro-next-btn').focus({preventScroll:true});return true
  }
  function finishGarageIntro(){
    if(state!=='garage'||!garageIntroContext)return false;
    if(!validGarageIntro()){clearGarageIntro();goMenu();return false}
    clearGarageIntro();state='briefing';$('#briefing-intro-choice').hidden=true;$('#briefing-depart-btn').disabled=false;show('mission-briefing');focusMenuControl($('#briefing-depart-btn'),true);return true
  }
  function moveGarageIntro(direction){
    if(state!=='garage'||!validGarageIntro())return;
    if(direction>0&&garageIntroContext.step===garageIntroSteps.length-1){finishGarageIntro();return}
    garageIntroContext.step=clamp(garageIntroContext.step+direction,0,garageIntroSteps.length-1);renderGarageIntro(true)
  }
  function renderGarageCustomizer(){
    const screen=$('#garage'),box=$('#garage-customizer'),cosmetics=garage.cosmetics,theme=garageThemes.find(item=>item.id===cosmetics.theme)||garageThemes[0],emblem=garageEmblems.find(item=>item.id===cosmetics.emblem)||garageEmblems[0],bayName=escapeHTML(cosmetics.bayName);for(const item of garageThemes)screen.classList.remove(`garage-theme-${item.id}`);screen.classList.add(`garage-theme-${theme.id}`);box.innerHTML=`<section class="hangar-preview"><small>CUSTOM HANGAR // COSMETIC ONLY</small><b>${emblem.glyph} <span>${bayName}</span> ${emblem.glyph}</b><div class="hangar-ship"><i></i><i></i><i></i></div><label>BAY NAME <input id="bay-name" maxlength="22" value="${bayName}"></label></section><section class="cosmetic-market"><div><b>ALLOY ${garage.materials}</b><span>Dismantled gear funds themes and emblems only. No gameplay effect.</span></div><div id="theme-options" class="cosmetic-options"></div><div id="emblem-options" class="cosmetic-options"></div></section>`;
    const bayInput=$('#bay-name');bayInput.onchange=()=>{cosmetics.bayName=(bayInput.value.trim()||'LAST SIGNAL BAY').slice(0,22);saveGarage();renderGarage()};const themeBox=$('#theme-options');for(const item of garageThemes){const owned=cosmetics.owned.includes(item.id),button=document.createElement('button');button.className=cosmetics.theme===item.id?'active':'';button.disabled=!owned&&garage.materials<item.cost;button.textContent=`${item.name} // ${owned?(cosmetics.theme===item.id?'ACTIVE':'OWNED'):`${item.cost} ALLOY`}`;button.onclick=()=>{if(!owned){garage.materials-=item.cost;cosmetics.owned.push(item.id)}cosmetics.theme=item.id;saveGarage();renderGarage()};themeBox.appendChild(button)}const emblemBox=$('#emblem-options');for(const item of garageEmblems){const owned=cosmetics.ownedEmblems.includes(item.id),button=document.createElement('button');button.className=cosmetics.emblem===item.id?'active':'';button.disabled=!owned&&garage.materials<item.cost;button.textContent=`${item.glyph} ${item.name} // ${owned?(cosmetics.emblem===item.id?'ACTIVE':'OWNED'):`${item.cost} ALLOY`}`;button.onclick=()=>{if(!owned){garage.materials-=item.cost;cosmetics.ownedEmblems.push(item.id)}cosmetics.emblem=item.id;saveGarage();renderGarage()};emblemBox.appendChild(button)}
  }
  function captureGarageView(){
    const view={scroll:{},outer:$('#garage').scrollTop||0,focus:null,detailKeys:Array.from($('#garage').querySelectorAll('details[data-gear-detail]')).filter(detail=>detail.open).map(detail=>detail.dataset.gearDetail),pairsOpen:!!$('#equipped-gear').querySelector('.gear-combo-panel')?.open,setKeys:Array.from($('#equipped-gear').querySelectorAll('details[data-gear-set]')).filter(detail=>detail.open).map(detail=>detail.dataset.gearSet)},active=document.activeElement;
    for(const group of Array.from($('#gear-inventory').children)){
      const slot=group.dataset.garageSlot,items=Array.from(group.children).find(child=>child.dataset.garageColumn==='true');
      if(!slot||!items)continue;
      view.scroll[slot]=items.scrollTop||0;
      if(active?.dataset.garageSlot===slot)view.focus={slot,id:active.dataset.gearId,action:active.dataset.gearAction,index:Array.from(items.children).findIndex(card=>card.dataset.gearId===active.dataset.gearId)}
    }
    return view
  }
  function restoreGarageView(view){
    for(const group of Array.from($('#gear-inventory').children)){
      const slot=group.dataset.garageSlot,items=Array.from(group.children).find(child=>child.dataset.garageColumn==='true');
      if(!items)continue;
      if(view.focus?.slot===slot){
        const cards=Array.from(items.children).filter(card=>card.dataset.gearId),card=cards.find(card=>card.dataset.gearId===view.focus.id)||cards[clamp(view.focus.index,0,cards.length-1)];
        const buttons=card?Array.from(card.children).flatMap(child=>Array.from(child.children)).filter(child=>child.tagName==='BUTTON'):[];
        const target=view.focus.id?(buttons.find(button=>button.dataset.gearAction===view.focus.action&&!button.disabled)||buttons.find(button=>!button.disabled)||items):items;
        target.focus({preventScroll:true})
      }
      items.scrollTop=Math.min(view.scroll[slot]||0,Math.max(0,(items.scrollHeight||0)-(items.clientHeight||0)))
    }
    $('#garage').scrollTop=view.outer
  }
  function garageGearAction(slot,id,action){
    const gear=garage.inventory.find(item=>item.id===id&&item.slot===slot);if(!gear)return;
    if(action==='equip')garage.equipped[slot]=garage.equipped[slot]===id?null:id;
    else if(action==='lock')gear.locked=!gear.locked;
    else if(action==='dismantle'){
      if(gear.locked||garage.equipped[slot]===id)return;
      garage.materials+=gearSalvageValue(gear);garage.inventory=garage.inventory.filter(item=>item.id!==id)
    }else return;
    saveGarage();renderGarage()
  }
  function renderGarageSets(expanded=[]){
    const strip=document.createElement('section');strip.id='garage-set-guide';strip.className='gear-set-strip';strip.setAttribute('aria-label','Equipped gear sets');
    strip.innerHTML='<div class="gear-set-heading"><b>GEAR SETS</b><span>Match 2 or 4 equipped pieces. A full set keeps its 2-piece bonus.</span></div>';
    for(const set of gearSetStates()){
      const detail=document.createElement('details');detail.className=`gear-set-progress alignment-${set.alignment.toLowerCase()}${set.count>=2?' active':''}`;detail.dataset.gearSet=set.alignment;detail.open=expanded.includes(set.alignment);
      const status=set.count===4?'FULL SET ACTIVE':set.count>=2?`2-PIECE ACTIVE · ${4-set.count} MORE FOR 4`:`${2-set.count} MORE FOR 2-PIECE`;
      detail.innerHTML=`<summary><span><b>${set.alignment}</b><em>${set.count}/4 PIECES</em></span><span class="gear-set-meter" aria-hidden="true">${[1,2,3,4].map(piece=>`<i${piece<=set.count?' class="filled"':''}></i>`).join('')}</span><small>${status} ▾</small></summary><div class="gear-set-effects">${set.thresholds.map(tier=>`<p${tier.active?' class="active"':''}><b>${tier.needed}-PIECE ${tier.active?'ACTIVE':'BONUS'}</b>${tier.description}</p>`).join('')}${set.alignment==='AEGIS'?'<small>Starting shields apply to a new run. Refitting does not refill them.</small>':''}</div>`;
      strip.appendChild(detail)
    }
    $('#equipped-gear').appendChild(strip)
  }
  function renderGarageCombos(expanded=false){
    const states=gearComboStates(),active=states.filter(combo=>combo.active),available=states.filter(combo=>!combo.active&&combo.available),panel=document.createElement('details');panel.id='garage-pair-guide';panel.className='gear-combo-panel';panel.open=expanded;panel.setAttribute('aria-label','Equipment pair bonuses');
    const status=[active.length?`${active.length} ACTIVE`:'',available.length?`${available.length} OWNED PAIR${available.length===1?'':'S'} TO TRY`:''].filter(Boolean).join(' · ')||'MATCH NAMED EFFECTS ACROSS SLOTS';
    panel.innerHTML=`<summary class="gear-combo-heading"><b>EQUIPMENT PAIRS & RESONANCE</b><span>${status}</span><em>VIEW BONUSES</em></summary><div class="gear-combo-grid">${states.map(combo=>`<article class="gear-combo-card${combo.active?' active':combo.available?' available':''}"><div><b>${combo.name}</b><small>${combo.active?'ACTIVE':combo.available?'OWNED · EQUIP TO ACTIVATE':`MISSING ${combo.requirements.filter(item=>!item.owned).length} ITEM${combo.requirements.filter(item=>!item.owned).length===1?'':'S'}`}</small></div><p>${combo.desc}</p>${combo.requirements.map(item=>`<span class="gear-combo-requirement${item.met?' met':item.owned?' owned':''}">${item.met?'EQUIPPED':item.owned?'IN STORAGE':'NOT OWNED'} · ${gearSlotNames[item.slot]} / ${item.name}${!item.met&&item.owned?`<small class="gear-owned-name">${escapeHTML(gearDisplayName(item.owned))}</small>`:''}</span>`).join('')}</article>`).join('')}</div><div class="gear-resonance-help"><b>MATCHING ALIGNMENTS</b><p>Resonance is a separate bonus for matching two or four equipped alignments.</p><p><b>VANGUARD</b> · 2 pieces: +4% core damage. 4 pieces also add +3% fighter and Force damage.</p><p><b>AEGIS</b> · 2 pieces: one starting shield. 4 pieces also add +1 Force interception radius.</p><p><b>VECTOR</b> · 2 pieces: +5% DOSE generation. 4 pieces also add +4% charge speed and Force handling.</p></div>`;
    $('#equipped-gear').appendChild(panel)
  }
  function renderGarage(){
    const view=captureGarageView(),equippedBox=$('#equipped-gear'),inventoryBox=$('#gear-inventory'),lastRun=profile.lastRun;equippedBox.innerHTML='';inventoryBox.innerHTML='';$('#profile-name').value=profile.name;$('#profile-save-status').textContent='PROFILE READY';renderGarageCustomizer();
    for(const slot of gearSlots){const gear=equippedGear(slot),card=document.createElement('div'),key='equipped:'+slot;card.className='gear-slot';card.innerHTML=gear?gearChoiceMarkup(gear,key,view.detailKeys.includes(key)):`<small>${gearSlotNames[slot]} // EQUIPPED</small><span class="gear-name">EMPTY SLOT</span><div class="gear-stats">Equip an item to add its main effect.</div>`;equippedBox.appendChild(card)}
    renderGarageSets(view.setKeys);renderGarageCombos(view.pairsOpen);
    for(const slot of gearSlots){
      const group=document.createElement('section'),heading=document.createElement('h3'),items=document.createElement('div'),slotGear=garage.inventory.filter(gear=>gear.slot===slot).map(item=>normalizeGearItem(item)).sort((a,b)=>b.tier-a.tier||b.power-a.power);
      group.className=`inventory-group inventory-${slot}`;group.dataset.garageSlot=slot;heading.innerHTML=`<span>${slot.toUpperCase()}</span><small>${slotGear.length} STORED</small>`;
      items.className='inventory-group-items';items.dataset.garageSlot=slot;items.dataset.garageColumn='true';items.tabIndex=0;items.setAttribute('role','region');items.setAttribute('aria-label',`${slot.toUpperCase()} stored gear`);if(!slotGear.length)items.innerHTML='<p>NO ITEMS STORED</p>';
      for(const gear of slotGear){
        const equipped=garage.equipped[gear.slot]===gear.id,card=document.createElement('div'),key='stored:'+gear.id;
        card.dataset.gearId=gear.id;card.className=`gear-card${equipped?' equipped':''}${gear.locked?' locked':''}`;card.innerHTML=gearChoiceMarkup(gear,key,view.detailKeys.includes(key));
        const buttons=document.createElement('div');buttons.className='gear-buttons';
        for(const action of ['equip','lock','dismantle']){
          const button=document.createElement('button'),value=gearSalvageValue(gear),verb=action==='equip'?(equipped?'UNEQUIP':'EQUIP'):action==='lock'?(gear.locked?'UNLOCK':'LOCK'):'DISMANTLE';
          button.dataset.garageSlot=slot;button.dataset.gearId=gear.id;button.dataset.gearAction=action;button.textContent=action==='dismantle'?`DISMANTLE +${value} ALLOY`:verb;
          button.setAttribute('aria-label',`${verb} ${gearDisplayName(gear)}${action==='dismantle'?` for ${value} Alloy`:''}`);
          if(action==='lock')button.className=`lock${gear.locked?' active':''}`;
          if(action==='dismantle'){button.className='discard';button.disabled=equipped||gear.locked}
          button.onclick=()=>garageGearAction(slot,gear.id,action);buttons.appendChild(button)
        }
        card.appendChild(buttons);items.appendChild(card)
      }
      group.appendChild(heading);group.appendChild(items);inventoryBox.appendChild(group)
    }
    const counts=rarityData.map(r=>garage.inventory.filter(g=>g.rarity===r.key).length),life=profile.lifetime,overCapacity=garage.inventory.length>GARAGE_CAPACITY;$('#inventory-count').textContent=`${garage.inventory.length} / ${GARAGE_CAPACITY} ITEMS${overCapacity?' // DISMANTLE TO LAUNCH':''}`;$('#garage-summary').textContent=`SIGNAL POWER ${loadoutSignalPower()} // COMMON ${counts[0]} // UNCOMMON ${counts[1]} // RARE ${counts[2]} // SUPER RARE ${counts[3]} // EXOTIC ${counts[4]} // ALLOY ${garage.materials}`;const launch=$('#garage-launch-btn');launch.disabled=overCapacity||!!lossGarageContext&&!validLossGarageContext();launch.textContent=overCapacity?'GARAGE OVER CAPACITY':lossGarageContext?'APPLY & RETRY CHECKPOINT':garageRunContext?'APPLY & RETURN TO ROUND':'LAUNCH WITH LOADOUT';$('#garage-back-btn').textContent=lossGarageContext?'BACK TO FLIGHT REPORT':'MAIN MENU';const returnNote=$('#garage-return-note');returnNote.hidden=!(garageRunContext||lossGarageContext);returnNote.textContent=lossGarageContext?'CHECKPOINT RETRY // Equip recovered gear, then apply and retry. Checkpoint hull and shields do not refill; attempt score resets.':'ROUND SECURED // Equip recovered gear, then apply it to this run. Combat stays paused.';
    $('#garage-run-stats').innerHTML=lastRun?`<b>LAST RUN</b> - WAVE ${lastRun.wave} // SCORE ${lastRun.score} // ${lastRun.kills} KILLS // ${lastRun.normalBosses} BOSSES // ${lastRun.epicBosses} EPIC // ${lastRun.miniBosses} MINI-BOSSES<br><b>COMBAT</b> - ${lastRun.shotsFired} SHOTS // ${lastRun.chargedShots} CHARGED // ${lastRun.damageDealt} DAMAGE DEALT // ${lastRun.damageTaken} HULL DAMAGE // ${lastRun.shieldsLost} SHIELDS LOST // ${lastRun.evades} EVADES // ${lastRun.weakspotsDestroyed} WEAKSPOTS<br><b>ASTERPRINTS</b> - ${lastRun.gearCollected} TOTAL // ${lastRun.commonDrops||0} COMMON // ${lastRun.uncommonDrops||0} UNCOMMON // ${lastRun.rareDrops||0} RARE // ${lastRun.superDrops||0} SUPER RARE // ${lastRun.exoticDrops||0} EXOTIC`:'<b>LAST RUN</b> - NO SAVED COMBAT RECORD YET';
    restoreGarageView(view);renderGarageIntro();if(validGarageIntro()){$('#garage-launch-btn').textContent=overCapacity?'GARAGE OVER CAPACITY':'RETURN TO BRIEFING';$('#garage-back-btn').textContent='SKIP GUIDE & RETURN'}if(garage.inventory.length)requestOnboarding('gear');if(gearComboStates().some(combo=>combo.active))requestOnboarding('synergy')
  }
  function goMenu(){clearGarageIntro();lossGarageContext=null;if(trainingSession){finishTrainingPractice({completed:false});return}securePendingRunLoot();onboardingController?.close();trainingController?.close();garageRunContext=null;pendingBriefing=null;artInspection=null;bossLabMini=false;$('#art-inspector').hidden=true;$('#game-shell').dataset.artView='false';state='menu';wave=1;t=0;scroll=0;bossLab=false;bossLabLevel=false;bossLabEpic=false;bossLabRunAll=false;upgradeOpensTree=false;mouse.firing=false;sfx.stopCharge();boss=miniBoss=null;victoryDelay=pendingUpgrade=null;runLoot=[];if(shots)shots.length=0;if(enemyShots)enemyShots.length=0;if(enemies)enemies.length=0;$('#hud').classList.add('hidden');show('menu');renderProfileMenu()}
  function runLoadoutKey(){return JSON.stringify(gearSlots.map(slot=>{const item=equippedGear(slot);return item?[item.id,item.power,item.alignment,item.gunVariant,item.trait,item.stats]:null}))}
  function openRoundGarage(){
    if(bossLab||!runActive||!(state==='upgrade'||state==='skilltree'&&runSegment==='doctrine'&&pendingUpgrade))return;
    garageRunContext={profile,state,screen:state==='upgrade'?'upgrade':'skill-tree',segment:runSegment,source:profile.checkpoint?.source,loadout:runLoadoutKey()};
    saveRunCheckpoint(runSegment);openGarage()
  }
  function finishRoundGarage(returnToRound=true){
    const saved=garageRunContext;if(state!=='garage'||!saved)return;
    if(saved.profile!==profile||!runActive){garageRunContext=null;goMenu();return}
    if(garage.inventory.length>GARAGE_CAPACITY){$('#profile-save-status').textContent='DISMANTLE TO 32 ITEMS BEFORE RETURNING';return}
    if(saved.loadout!==runLoadoutKey())rebuildRunLoadout();
    garageRunContext=null;state=saved.state;$('#hud').classList.remove('hidden');
    if(state==='upgrade'){if(streamlined())renderRunService();else renderRetrofitBrief();for(const card of $('#upgrade-cards').querySelectorAll('[data-module]')){const module=tacticalRetrofits.find(u=>u.key===card.dataset.module),context=card.querySelector('.choice-context');if(module&&context)context.textContent=retrofitContext(module)}}else renderSkillTree();
    show(saved.screen);saveRunCheckpoint(saved.segment,{source:saved.source});hud();
    if(!returnToRound)goMenu()
  }
  function leaveGarage(){if(garageIntroContext){finishGarageIntro();return}if(lossGarageContext){if(!returnToLossReport()){lossGarageContext=null;goMenu()}return}if(garageRunContext)finishRoundGarage(false);else goMenu()}
  function launchFromGarage(){if(garageIntroContext){finishGarageIntro();return}if(lossGarageContext){applyGarageRetry();return}if(garageRunContext)finishRoundGarage();else launchNewRun()}
  function syncRoundGarageButtons(){
    $('#upgrade-garage-btn').hidden=!(runActive&&!bossLab&&state==='upgrade');
    $('#tree-garage-btn').hidden=!(runActive&&!bossLab&&state==='skilltree'&&runSegment==='doctrine'&&pendingUpgrade)
  }
  class SFX{
    constructor(){this.c=null;this.sampleContext=null;this.samples=window.StarfighterSfxSamples?.create()||null;this.master=null;this.detail=null;this.cueOutput=null;this.silent=false;this.chargeNodes=null;this.cueTimes=Object.create(null);this.focusUntil=0;this.lastEnemyShot=0;this.lastBreak=0;this.lastPlayerShot=0;this.lastImpact=0}
    init(){if(muted||document.hidden||this.silent)return null;if(!this.c){this.c=new(window.AudioContext||window.webkitAudioContext);this.master=this.c.createGain();this.master.gain.value=sfxVolume;this.detail=this.c.createGain();this.detail.gain.value=.82;this.detail.connect(this.master);const presence=this.c.createBiquadFilter(),air=this.c.createBiquadFilter(),drive=this.c.createGain(),limiter=this.c.createDynamicsCompressor();presence.type='peaking';presence.frequency.value=2450;presence.Q.value=.72;presence.gain.value=2.2;air.type='highshelf';air.frequency.value=5200;air.gain.value=1.15;drive.gain.value=1.32;limiter.threshold.value=-10;limiter.knee.value=7;limiter.ratio.value=12;limiter.attack.value=.002;limiter.release.value=.095;this.master.connect(presence).connect(air).connect(drive).connect(limiter).connect(this.c.destination)}if(this.c.state==='suspended')this.c.resume().catch(()=>{});if(this.samples&&this.sampleContext!==this.c){this.sampleContext=this.c;this.samples.prepare(this.c)}return this.c}
    setMuted(value){this.silent=!!value;if(value){this.stopCharge();this.samples?.stopAll()}if(this.master&&this.c)this.master.gain.setTargetAtTime(value?0:sfxVolume,this.c.currentTime,.015)}
    setVolume(value){sfxVolume=clamp(value,0,1);if(this.master&&this.c)this.master.gain.setTargetAtTime(muted||document.hidden||this.silent?0:sfxVolume,this.c.currentTime,.02)}
    output(){return this.cueOutput||this.detail||this.master}
    sample(key,gain){const context=this.init();return !!(context&&this.samples?.play(key,{context,output:this.output(),gain}))}
    admitCue(key,interval){const c=this.init();if(!c)return false;const before=this.cueTimes[key]??-Infinity;if(c.currentTime-before<interval)return false;this.cueTimes[key]=c.currentTime;return true}
    foreground(duration,work){const c=this.init();if(!c)return;const now=c.currentTime;this.focusUntil=Math.max(this.focusUntil,now+duration);this.detail.gain.cancelScheduledValues(now);this.detail.gain.setTargetAtTime(.28,now,.008);this.detail.gain.setTargetAtTime(.82,this.focusUntil,.075);const previous=this.cueOutput;this.cueOutput=this.master;try{return work()}finally{this.cueOutput=previous}}
    voice(f1=440,f2=220,d=.08,type='square',v=.04,delay=0,attack=.004){const c=this.init();if(!c)return;const n=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(25,f1),n);o.frequency.exponentialRampToValueAtTime(Math.max(25,f2),n+d);g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),n+attack);g.gain.exponentialRampToValueAtTime(.0001,n+d);o.connect(g).connect(this.output());o.start(n);o.stop(n+d+.02)}
    filteredVoice(f1=440,f2=220,d=.1,type='triangle',v=.035,cutoff=3200,delay=0,attack=.004){const c=this.init();if(!c)return;const n=c.currentTime+delay,o=c.createOscillator(),filter=c.createBiquadFilter(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(25,f1),n);o.frequency.exponentialRampToValueAtTime(Math.max(25,f2),n+d);filter.type='lowpass';filter.Q.value=.72;filter.frequency.setValueAtTime(Math.max(260,cutoff),n);filter.frequency.exponentialRampToValueAtTime(Math.max(260,cutoff*.76),n+d);g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),n+attack);g.gain.exponentialRampToValueAtTime(.0001,n+d);o.connect(filter).connect(g).connect(this.output());o.start(n);o.stop(n+d+.02)}
    noise(d=.08,v=.025,freq=1400,type='bandpass',delay=0){const c=this.init();if(!c)return;const length=Math.max(1,Math.floor(c.sampleRate*d)),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const src=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain(),n=c.currentTime+delay;filter.type=type;filter.frequency.value=freq;filter.Q.value=type==='bandpass'?1.6:.7;g.gain.setValueAtTime(v,n);g.gain.exponentialRampToValueAtTime(.0001,n+d);src.buffer=buffer;src.connect(filter).connect(g).connect(this.output());src.start(n);src.stop(n+d+.02)}
    tone(f=440,d=.05,type='square',v=.025,slide=0){this.voice(f,Math.max(30,f+slide),d,type,v)}
    harmonicBurst(root,end,d=.09,v=.035,delay=0,attack=.006){this.voice(root,end,d,'sine',v,delay,attack);this.voice(root*1.5,end*1.5,d*.94,'triangle',v*.42,delay+.002,attack);this.voice(root*2,end*2,d*.82,'sine',v*.2,delay+.004,attack)}
    launch(){this.voice(75,420,.32,'sawtooth',.05);this.voice(150,920,.38,'sine',.04,.03);this.noise(.28,.03,900,'lowpass')}
    shot(charge=0){
      const c=this.init();if(!c)return;const variation=rand(.985,1.015),crowded=c.currentTime-this.lastPlayerShot<.075,gain=crowded?.72:1;this.lastPlayerShot=c.currentTime;
      if(charge>.2){
        this.stopCharge();
        // Charged phonetic contour: a crisp KSH release followed by a deep VWOOM body.
        this.noise(.058,.031*gain,3650,'bandpass');this.noise(.038,.014*gain,6900,'highpass',.002);
        this.filteredVoice(410*variation,105*variation,.36,'sawtooth',.078*gain,3300,0,.006);this.voice(116*variation,43*variation,.47,'sine',.096*gain,.004,.009);
        this.voice(820*variation,290*variation,.2,'triangle',.032*gain,.012,.003);this.voice(1230*variation,610*variation,.1,'sine',.015*gain,.025,.002);this.noise(.2,.028*gain,700,'lowpass',.006)
      }else{
        // Standard phonetic contour: TCH transient into a compact, readable YOW vowel.
        this.noise(.022,.014*gain,4700,'bandpass');this.noise(.014,.006*gain,7200,'highpass',.002);
        this.filteredVoice(880*variation,410*variation,.085,'triangle',.041*gain,5200,.002,.0018);this.voice(1320*variation,690*variation,.052,'sine',.013*gain,.004,.0015);this.voice(285*variation,155*variation,.075,'sine',.022*gain,.004,.003)
      }
    }
    startCharge(){const c=this.init();if(!c||this.chargeNodes)return;const osc=c.createOscillator(),harmonic=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter(),n=c.currentTime;osc.type='sawtooth';harmonic.type='sine';osc.frequency.value=72;harmonic.frequency.value=144;filter.type='lowpass';filter.frequency.value=420;gain.gain.setValueAtTime(.0001,n);gain.gain.exponentialRampToValueAtTime(.022,n+.08);osc.connect(filter);harmonic.connect(filter);filter.connect(gain).connect(this.detail);osc.start();harmonic.start();this.chargeNodes={osc,harmonic,gain,filter}}
    updateCharge(amount){if(!this.chargeNodes)return;const c=this.c,n=c.currentTime,{osc,harmonic,filter}=this.chargeNodes;osc.frequency.setTargetAtTime(72+amount*210,n,.025);harmonic.frequency.setTargetAtTime(145+amount*460,n,.025);filter.frequency.setTargetAtTime(420+amount*1700,n,.035)}
    stopCharge(){if(!this.chargeNodes||!this.c)return;const nodes=this.chargeNodes,n=this.c.currentTime;this.chargeNodes=null;nodes.gain.gain.cancelScheduledValues(n);nodes.gain.gain.setTargetAtTime(.0001,n,.025);try{nodes.osc.stop(n+.14);nodes.harmonic.stop(n+.14)}catch{}}
    chargeReady(){this.voice(620,1040,.12,'sine',.035);this.voice(930,1260,.1,'square',.015,.025)}
    pod(mode){if(mode==='deploy'){this.voice(180,620,.18,'sawtooth',.04);this.voice(420,920,.14,'sine',.026,.035)}else{this.voice(720,210,.2,'sine',.035);this.noise(.12,.018,900,'bandpass')}}
    enemyShot(heavy=false){const c=this.init();if(!c)return;const now=c.currentTime;if(now-this.lastEnemyShot<(heavy?.075:.11))return;this.lastEnemyShot=now;const variation=rand(.97,1.03),root=(heavy?220:360)*variation,end=root*(heavy?.4:.48);this.voice(root,end,heavy?.16:.085,'triangle',heavy?.032:.017,0,.006);this.voice(root*1.5,end*1.5,heavy?.14:.075,'sine',heavy?.014:.007,.003,.007);this.noise(heavy?.11:.04,heavy?.016:.0065,heavy?520:1500,heavy?'lowpass':'bandpass')}
    enemyBreak(heavy=false){const c=this.init();if(!c||!heavy&&!this.admitCue('enemyBreak',.055))return;const variation=rand(.975,1.025);if(heavy)this.foreground(.25,()=>{this.noise(.065,.044,2450,'bandpass');this.filteredVoice(245*variation,78*variation,.31,'triangle',.068,3100,.003,.005);this.voice(92*variation,41*variation,.41,'sine',.088,.006,.009);this.noise(.3,.051,620,'lowpass',.012);this.voice(368*variation,176*variation,.16,'sine',.023,.052,.006)});else{this.noise(.085,.031,2200,'bandpass');this.filteredVoice(310*variation,125*variation,.16,'triangle',.043,3400,0,.004);this.voice(465*variation,220*variation,.09,'sine',.016,.03,.004)}}
    tentacleBreak(){this.foreground(.26,()=>{if(this.sample('core-break',.16))return;const variation=rand(.98,1.02);this.noise(.068,.052,2650,'bandpass');this.filteredVoice(390*variation,145*variation,.24,'triangle',.071,3300,.003,.004);this.voice(112*variation,49*variation,.4,'sine',.092,.007,.008);this.noise(.27,.046,660,'lowpass',.017);this.noise(.11,.011,4100,'highpass',.028);this.voice(585*variation,292*variation,.18,'sine',.027,.047,.005);this.voice(780*variation,390*variation,.15,'sine',.015,.06,.005)})}
    impact(){if(!this.admitCue('impact',.045))return;this.noise(.047,.023,2600,'bandpass');this.filteredVoice(430,165,.075,'triangle',.021,3600,0,.0025);this.voice(645,325,.05,'sine',.008,.008,.003)}
    armorHit(){if(!this.admitCue('armorHit',.07))return;if(this.sample('armor-hit',.045))return;this.noise(.025,.012,1850,'bandpass');this.voice(235,145,.04,'triangle',.011)}
    coreHit(){if(!this.admitCue('coreHit',.06))return;if(this.sample('core-hit',.065))return;this.voice(1120,1510,.055,'sine',.018);this.voice(1680,2010,.043,'triangle',.007,.007)}
    podBlock(){if(!this.admitCue('podBlock',.09))return;if(this.sample('force-block',.045))return;this.voice(850,1220,.045,'sine',.014);this.noise(.025,.006,3500,'highpass')}
    weakOpen(){this.voice(880,760,.06,'sine',.013);this.voice(1320,1140,.07,'sine',.009,.04)}
    weakBreak(){this.foreground(.24,()=>{if(this.sample('core-break',.16))return;this.noise(.06,.04,2450,'bandpass');this.filteredVoice(430,155,.23,'triangle',.061,3200,0,.004);this.voice(98,49,.29,'sine',.067,.004,.008);this.noise(.17,.037,700,'lowpass',.014);this.voice(1260,1840,.12,'sine',.024,.035)})}
    shield(){this.foreground(.22,()=>{if(this.sample('shield-hit',.115))return;this.voice(260,980,.22,'sine',.055);this.voice(520,1380,.16,'triangle',.025,.035)})}
    hurt(){this.foreground(.36,()=>{if(this.sample('hull-hit',.15))return;this.voice(110,42,.3,'sawtooth',.075);this.noise(.22,.055,380,'lowpass')})}
    evade(){this.voice(520,1320,.13,'sine',.035);this.noise(.1,.015,3200,'highpass')}
    pickup(tier=0){if(this.sample('pickup-confirm',.11))return;const root=[440,520,620,720,820][tier]||440;this.voice(root,root*1.5,.12,'sine',.032);this.voice(root*1.25,root*2,.16,'triangle',.022,.07);if(tier>=3)this.voice(root*2,root*3,.28,'sine',.026,.15)}
    powerup(){this.voice(390,780,.11,'square',.025);this.voice(590,1180,.16,'sine',.03,.08)}
    bossIntro(main=true){this.voice(main?48:72,main?33:110,main?.8:.42,'sawtooth',main?.09:.055);this.noise(main?.7:.35,main?.07:.04,main?260:420,'lowpass');if(main)this.voice(96,46,.9,'square',.025,.09)}
    phase(){this.voice(58,720,.78,'sawtooth',.095);this.noise(.65,.075,520,'lowpass');this.voice(460,1320,.4,'sine',.04,.2)}
    victory(){for(let i=0;i<4;i++)this.voice([260,390,520,780][i],[390,520,780,1040][i],.18,'sine',.03,i*.08)}
    gameover(){this.stopCharge();this.foreground(.75,()=>{this.voice(220,44,.85,'sawtooth',.075);this.voice(110,32,1.05,'sine',.065,.12);this.noise(.65,.055,300,'lowpass')})}
    upgrade(){this.voice(330,660,.18,'sine',.04);this.voice(495,990,.2,'triangle',.026,.08)}
    skill(){this.voice(510,1020,.14,'sine',.035);this.voice(765,1530,.2,'triangle',.025,.08)}
    laser(){this.voice(85,560,.52,'sawtooth',.045);this.noise(.4,.025,1100,'bandpass')}
  }
  const sfx=new SFX();
  const hit=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<a.r+b.r;
  const sweptHit=(shot,target)=>{const x0=shot.px??shot.x,y0=shot.py??shot.y,dx=shot.x-x0,dy=shot.y-y0,lengthSq=dx*dx+dy*dy,along=lengthSq?clamp(((target.x-x0)*dx+(target.y-y0)*dy)/lengthSq,0,1):0,x=x0+dx*along,y=y0+dy*along;return Math.hypot(x-target.x,y-target.y)<shot.r+target.r};
  function clearInput(){resetMenuNavigation();keys.clear();padFrame=gamepadController?.requireNeutral()||emptyPadFrame();mouse.firing=false;mouse.inside=false;const pointerId=mouse.pointerId;mouse.pointerId=null;if(pointerId!=null&&canvas.hasPointerCapture?.(pointerId))canvas.releasePointerCapture(pointerId);if(player){player.charge=0;player.focus=false}sfx.stopCharge()}
  function musicPlaybackAllowed(){return!trainingFrame&&(menuMusicStates.has(state)||state==='playing'||state==='upgrade')&&!document.hidden&&!$('#flight-deck')?.open}
  function show(id){if(['menu','gameover','complete','bosslab'].includes(state))runActive=false;clearInput();sfx.setMuted(muted||document.hidden);if(!musicPlaybackAllowed())pauseMusic();screens.forEach(s=>s.classList.toggle('active',s.id===id));syncRoundGarageButtons();if(menuMusicStates.has(state))resumeMusic();if(state==='playing'){canvas.focus?.({preventScroll:true});$('#audio-mixer')?.classList.remove('open')}else focusMenuControl();onboardingController?.tick(0)}
  function pauseMusic(){soundtrack.pause()}
  function cancelBossMusicFade(){bossAudioFade=null;soundtrack.volume=musicVolume}
  function applyMusicVolume(){const fade=bossAudioFade,factor=!fade?1:fade.phase==='out'?1-clamp(fade.elapsed/4.2,0,1):clamp(fade.elapsed/.65,0,1);soundtrack.volume=musicVolume*factor}
  function beginBossMusicFade(){cancelBossMusicFade();bossAudioFade={phase:'out',elapsed:0};resumeMusic()}
  function updateBossAudio(dt){const fade=bossAudioFade;if(!fade)return;fade.elapsed+=dt;if(fade.phase==='in'&&fade.elapsed>=.65)bossAudioFade=null;applyMusicVolume()}
  function playMusic(key,src,fadeIn=false){
    if(fadeIn)bossAudioFade={phase:'in',elapsed:0};else cancelBossMusicFade();
    if(musicKey!==key){musicKey=key;soundtrack.src=src;soundtrack.load()}soundtrack.muted=muted;applyMusicVolume();if(musicPlaybackAllowed())soundtrack.play().catch(()=>{})
  }

  function nextMusicTrack(kind,source){if(!musicBags[kind].length){const bag=Array.isArray(source)?[...source]:Array.from({length:source},(_,i)=>i+1);for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}if(bag.length>1&&bag[bag.length-1]===lastMusicTrack[kind])[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];musicBags[kind]=bag}const track=musicBags[kind].pop();lastMusicTrack[kind]=track;return track}
  function playLevelMusic(){const track=nextMusicTrack('level',10);playMusic(`level-${track}`,`music/level${track}.mp3`)}
  function playBossMusic(){const track=nextMusicTrack('boss',[1,3,4,9,10,11,12,13,14]);playMusic(`boss-${track}`,`music/bosses/boss${track}.mp3`,!!bossAudioFade)}
  function playEpicBossMusic(){const track=nextMusicTrack('epic',6);playMusic(`epic-${track}`,`music/epic/epic${track}.mp3`,!!bossAudioFade)}
  function resumeMusic(){
    soundtrack.muted=muted;if(!musicPlaybackAllowed())return;
    if(menuMusicStates.has(state)&&!(state==='garage'&&garageRunContext)){if(bossAudioFade)cancelBossMusicFade();if(musicKey!=='menu-intro'){playMusic('menu-intro','music/menu-intro.mp3');return}}
    if(soundtrack.paused)soundtrack.play().catch(()=>{})
  }

  function reset(ruleset=DEFAULT_RUN_RULESET,progression=null){clearGarageIntro();runEpoch++;lossGarageContext=null;lastCombatLoss=null;retryPoint=null;runRuleset=ruleset===CLASSIC_RULESET?CLASSIC_RULESET:runRewards.ruleset;runProgression=runRewards.validate(progression)||runRewards.fresh();onboardingController?.close();garageRunContext=null;cancelBossMusicFade();pendingBriefing=null;bossLabMini=false;artInspection=null;$('#art-inspector').hidden=true;$('#game-shell').dataset.artView='false';t=score=kills=scroll=shake=0;wave=1;bossLab=false;bossLabLevel=false;bossLabEpic=false;bossLabRunAll=false;bossLabIndex=0;upgradeOpensTree=false;boss=miniBoss=null;miniBossSpawned=false;pendingUpgrade=victoryDelay=null;runLoot=[];lootToastTimer=0;$('#loot-toast').className='loot-toast';shots=[];enemies=[];enemyShots=[];particles=[];debris=[];bossFragments=[];pickups=[];spawn=.8;stars=Array.from({length:150},()=>({x:rand(0,W),y:rand(0,H),z:rand(.04,.95),warm:Math.random()<.12}));depthRocks=Array.from({length:20},(_,i)=>({x:rand(0,W+260),y:rand(70,H-70),z:rand(.12,.62),r:rand(7,30),rot:rand(0,Math.PI*2),shape:5+i%4}));depthDust=Array.from({length:38},()=>({x:rand(0,W),y:rand(35,H-35),z:rand(.65,1.35),r:rand(.7,2.4)}));player={x:145,y:H/2,r:12,hp:3,maxHp:3,speed:255,rate:.16,gun:1,damage:1,chargeDamage:1,critChance:0,chargeSpeed:1,podDamage:1,weakDamage:1,evade:0,repairOnVictory:0,repairOnApex:0,podAuto:false,podAutoTimer:0,rank:1,skillPoints:0,skillsSpent:0,skillCap:10,skills:{},upgrades:{},retrofits:{},fire:0,charge:0,shield:0,shieldWake:0,shieldHit:0,hullHit:0,inv:.8,laserColor:null,laserLevel:0,redForce:1,blueForce:1,blueVelocity:1,yellowForce:1,yellowGuidance:1,missileLevel:0,missileTimer:0,missileDamage:1,missileGuidance:1,bits:0,bitDose:0,podBlockDose:0,shieldDose:0,dose:0,doseGain:1,deltaFlash:0,podMove:1,rearForce:1,signalPower:100,resonance:'NONE',gearMagnet:210,lootSurge:0,lootSurgePower:.06,lootInvulnerability:0,salvageRepair:false,salvageRepairStage:-1,ablativeOwned:false,ablativeReady:false,weakBreakDose:0,weakOverdrive:0,surplusDose:2,lootSurgeStrength:.06,secondChance:false,secondChanceReady:false,pod:{owned:false,mode:'docked',dockSide:'front',returnSide:'front',x:195,y:H/2,r:13,phase:0}};applyLoadout();applyRunPerks();beginStage(false);hud();updateControlHints()}
  function rollEpicEncounter(){if(!profile.progress.epicUnlocked)return null;const roll=Math.random();if(roll>=.1)return null;return{id:roll<.05?0:1,wave:1+Math.floor(Math.random()*10)}}
  function runModeName(mode=runMode){return mode==='rush'?'BOSS RUSH':mode==='replay'?'MISSION REPLAY':'STORY'}
  function checkpointLabel(saved){const modern=saved.ruleset===runRewards.ruleset,segment=saved.segment==='postElite'&&saved.postEliteClock>=STAGE_POST_ELITE_TIME?'APEX APPROACH':{mission:'MISSION START',postElite:'POST-ELITE',apex:'APEX START',module:modern?'RECOVERY SERVICE':'FIELD MODULE',doctrine:modern?(saved.mode==='replay'||saved.wave===10?'FINAL BUILD':'RUN PERK'):'DOCTRINE'}[saved.segment];return`${runModeName(saved.mode)} · ${String(saved.wave).padStart(2,'0')} ${stageDefs[saved.wave-1].name} · ${segment}`}
  function checkpointObject(value){return!!value&&typeof value==='object'&&!Array.isArray(value)}
  function checkpointTreeSafe(value,depth=0){
    if(depth>7)return false;if(value===null||typeof value==='boolean')return true;
    if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=1e15;
    if(typeof value==='string')return value.length<=240;
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>120)return false;
    return Object.entries(value).every(([key,item])=>!['__proto__','prototype','constructor'].includes(key)&&checkpointTreeSafe(item,depth+1))
  }
  function validateRunCheckpoint(value){
    try{
      if(!checkpointObject(value)||value.version!==RUN_CHECKPOINT_VERSION||!RUN_MODES.includes(value.mode)||!CHECKPOINT_SEGMENTS.includes(value.segment))return null;
      const ruleset=value.ruleset===undefined?CLASSIC_RULESET:value.ruleset,buildVersion=value.buildVersion===undefined?CLASSIC_BUILD_VERSION:value.buildVersion;if(![CLASSIC_RULESET,runRewards.ruleset].includes(ruleset)||buildVersion!==CLASSIC_BUILD_VERSION)return null;
      const {progression:storedProgression,...envelope}=value,progression=ruleset===runRewards.ruleset?runRewards.validate(storedProgression):null;
      if(ruleset===runRewards.ruleset){if(!progression)return null;const pending=value.segment==='module'?'service':value.segment==='doctrine'&&value.mode!=='replay'&&value.wave<10?'perk':null;if(progression.pending!==pending||pending&&progression.pendingWave!==value.wave)return null}else if(storedProgression!==undefined)return null;
      if(!Number.isInteger(value.wave)||value.wave<1||value.wave>10||!Number.isInteger(value.startWave)||value.startWave<1||value.startWave>10)return null;
      if(value.mode!=='replay'&&value.startWave!==1||value.mode==='replay'&&(value.wave!==value.startWave||!profile.progress.missionsCleared[value.wave-1]))return null;
      if(value.mode==='rush'&&!['apex','doctrine'].includes(value.segment)||value.mode!=='rush'&&value.segment==='apex')return null;
      if(!checkpointTreeSafe(envelope)||!checkpointObject(value.player)||!checkpointObject(value.stats))return null;
      for(const key of['score','kills','elapsed','stageClock','postEliteClock'])if(!Number.isFinite(value[key])||value[key]<0||value[key]>1e8)return null;
      if(!Number.isInteger(value.kills)||!Number.isInteger(value.cleared)||value.cleared<0||value.cleared>10)return null;
      const p=value.player;
      if(progression){const config=runRewards.effectConfig(progression.perks);if(Object.entries(config).some(([key,expected])=>p?.[key]!==expected)||p.skillsSpent!==0||p.skillPoints!==0||Object.keys(p.retrofits||{}).length||Object.keys(p.skills||{}).length)return null;if(p.lootSurgeStrength!==undefined&&(!Number.isFinite(p.lootSurgeStrength)||p.lootSurgeStrength<0||p.lootSurgeStrength>.1))return null}
      const required='x y r hp maxHp speed rate gun damage chargeDamage critChance chargeSpeed podDamage weakDamage evade rank skillPoints skillsSpent skillCap laserLevel missileLevel bits dose doseGain podMove rearForce signalPower gearMagnet'.split(' ');
      if(required.some(key=>!Number.isFinite(p[key])))return null;
      if(p.shieldedChargeBonus!==undefined&&(!Number.isFinite(p.shieldedChargeBonus)||p.shieldedChargeBonus<0||p.shieldedChargeBonus>.06))return null;
      if(p.lootSurgeDuration!==undefined&&(!Number.isFinite(p.lootSurgeDuration)||p.lootSurgeDuration<4||p.lootSurgeDuration>6))return null;
      if(Object.values(p).some(item=>typeof item==='number'&&(!Number.isFinite(item)||Math.abs(item)>1e7)))return null;
      if(p.hp<1||p.hp>p.maxHp||p.maxHp>100||p.r<=0||p.r>80||p.speed<=0||p.speed>2000||p.rate<.02||p.rate>10||p.damage<=0||p.damage>1000)return null;
      for(const[key,max]of[['gun',5],['laserLevel',3],['missileLevel',2],['bits',2],['skillPoints',10],['skillsSpent',10]])if(!Number.isInteger(p[key])||p[key]<0||p[key]>max)return null;
      if(!Number.isInteger(p.rank)||p.rank<1||p.rank>11||p.skillCap!==10||p.skillsSpent+p.skillPoints>10||p.dose<0||p.dose>100)return null;
      if(!checkpointObject(p.pod)||typeof p.pod.owned!=='boolean'||!['docked','deployed','returning'].includes(p.pod.mode)||!['front','rear'].includes(p.pod.dockSide)||!['front','rear'].includes(p.pod.returnSide))return null;
      if(['x','y','r','phase'].some(key=>!Number.isFinite(p.pod[key]))||p.pod.r<1||p.pod.r>80||![null,'red','blue','yellow'].includes(p.laserColor))return null;
      if(!checkpointObject(p.skills)||!checkpointObject(p.retrofits)||!checkpointObject(p.upgrades))return null;
      const skillIds=new Set(skillPaths.flatMap(path=>path.nodes.map(node=>node.id)));
      if(Object.entries(p.skills).some(([key,owned])=>!skillIds.has(key)||owned!==true)||Object.keys(p.skills).length!==p.skillsSpent)return null;
      if(Object.entries(p.retrofits).some(([key,count])=>!tacticalRetrofits.some(item=>item.key===key)||!Number.isInteger(count)||count<0||count>100))return null;
      const expected=freshRunStats();for(const[key,initial]of Object.entries(expected)){const actual=value.stats[key];if(typeof initial==='boolean'?actual!==false:!Number.isFinite(actual)||actual<0||actual>1e8)return null}
      if(value.segment==='doctrine'&&value.nextWave!==value.wave+1)return null;
      if(value.epic!==null&&(!checkpointObject(value.epic)||![0,1].includes(value.epic.id)||!Number.isInteger(value.epic.wave)||value.epic.wave<1||value.epic.wave>10||value.epic.used!==undefined&&typeof value.epic.used!=='boolean'))return null;
      return{...JSON.parse(JSON.stringify(value)),ruleset,buildVersion,...(progression?{progression}:{})}
    }catch{return null}
  }
  function renderRunMenu(){
    const saved=validateRunCheckpoint(profile.checkpoint),cleared=profile.progress.missionsCleared.filter(Boolean).length;
    for(const mode of['story','rush']){const button=$(`#${mode}-mode-btn`);if(button){button.setAttribute('aria-pressed',String(selectedMode===mode));button.classList.toggle('active',selectedMode===mode)}}
    const summary=$('#mode-summary');if(summary)summary.textContent=selectedMode==='rush'?'Ten apex encounters. Ready Force arsenal. Earn gear and run perks; full mission replays unlock in Story.':'Ten full missions. Fight each approach, elite, and apex to bring the last signal home.';
    const load=$('#load-game-btn');if(load)load.disabled=!saved;
    const hint=$('#continue-summary');if(hint)hint.textContent=saved?checkpointLabel(saved):profile.checkpoint?'CHECKPOINT UNAVAILABLE · SAVE KEPT':'NO RUN CHECKPOINT · START A NEW GAME';
    const missions=$('#missions-menu-btn');if(missions)missions.disabled=cleared===0;
    const progress=$('#menu-progress');if(progress)progress.textContent=`${cleared} / 10 FULL MISSIONS CLEARED · ${profile.progress.normalBossesDefeated.filter(Boolean).length} / 10 APEX SIGNALS`;
  }
  function selectRunMode(mode){if(!['story','rush'].includes(mode))return;selectedMode=mode;renderRunMenu()}
  function saveRunCheckpoint(segment=runSegment,details={}){
    if(bossLab||!runActive||!runStats||runStats.finalized||player.hp<=0)return;
    if(streamlined()){if(segment==='module')runProgression=runRewards.offerService(runProgression,wave);else if(segment==='doctrine'&&runMode!=='replay'&&wave<10)runProgression=runRewards.offerPerks(runProgression,wave,`${profile.name}:${wave}:${Date.now()}`)}
    runSegment=segment;const saved={version:RUN_CHECKPOINT_VERSION,ruleset:runRuleset,buildVersion:CLASSIC_BUILD_VERSION,mode:runMode,startWave:runStartWave,wave,segment,savedAt:Date.now(),score,kills,elapsed:runElapsed,stageClock:Math.max(0,t),postEliteClock:Math.max(0,stagePostEliteClock),cleared:runStats.normalBosses+runStats.epicBosses,player:JSON.parse(JSON.stringify(player)),stats:{...runStats},epic:runEpicEncounter?{...runEpicEncounter}:null};
    if(streamlined())saved.progression=runRewards.validate(runProgression);
    saved.player.charge=0;saved.player.focus=false;saved.player.fire=0;saved.player.inv=Math.max(1,saved.player.inv||0);
    if(segment==='module')saved.recoveryApplied=details.recoveryApplied!==false;
    if(segment==='doctrine'){saved.nextWave=wave+1;saved.source=String(details.source||profile.checkpoint?.source||'APEX SECURED // DOCTRINE POINT AWARDED')}
    profile.checkpoint=saved;saveProfile('RUN CHECKPOINT SAVED');renderRunMenu()
  }
  function clearRunCheckpoint(){profile.checkpoint=null}
  let lastCombatLoss=null,retryPoint=null;
  function noteCombatLoss(source){lastCombatLoss=window.StarfighterCombatLoss.describe(source)}
  function captureRetryPoint(){
    retryPoint=null;if(bossLab||trainingSession||!runActive||runStats?.finalized)return;
    const saved=validateRunCheckpoint(profile.checkpoint);
    if(saved&&['mission','postElite','apex'].includes(saved.segment)&&saved.wave===wave&&saved.mode===runMode&&saved.ruleset===runRuleset)retryPoint={profile,slot:activeProfileSlot,epoch:runEpoch,saved};
  }
  function canRetryPoint(point=retryPoint){return !!(point&&point.profile===profile&&point.slot===activeProfileSlot&&point.epoch===runEpoch)}
  function validLossGarageContext(){const context=lossGarageContext;return !!(context&&context.profile===profile&&context.slot===activeProfileSlot&&context.epoch===runEpoch&&context.point===retryPoint&&canRetryPoint())}
  function returnToLossReport(){
    if(state!=='garage'||!validLossGarageContext())return false;
    lossGarageContext=null;state='gameover';renderCombatLoss();show('gameover');return true;
  }
  function applyGarageRetry(){
    if(state!=='garage'||!validLossGarageContext()||garage.inventory.length>GARAGE_CAPACITY)return false;
    return retryLastCheckpoint({refit:true,fromGarage:true});
  }
  function refitRetryCheckpoint(saved){
    // Compile against an isolated copy before replacing the recorded checkpoint.
    // Reuse live-refit rules, including HP clamping and consumed stage guards.
    const previous={player,wave,runMode,runRuleset,runProgression};
    try{
      player=JSON.parse(JSON.stringify(saved.player));wave=saved.wave;runMode=saved.mode;runRuleset=saved.ruleset;
      if(saved.progression)runProgression=runRewards.validate(saved.progression);
      if(!rebuildRunLoadout())return null;
      return validateRunCheckpoint({...saved,player:JSON.parse(JSON.stringify(player))});
    }catch{return null}
    finally{player=previous.player;wave=previous.wave;runMode=previous.runMode;runRuleset=previous.runRuleset;runProgression=previous.runProgression}
  }
  function retryLastCheckpoint({refit=false,fromGarage=false}={}){
    const point=retryPoint;
    if((fromGarage?state!=='garage'||!validLossGarageContext():state!=='gameover')||!canRetryPoint(point))return false;
    let saved=validateRunCheckpoint(point.saved);if(!saved)return false;
    // The failed attempt is already banked and counted. Retain the recorded
    // build, never its reward queue or cumulative accounting a second time.
    saved.score=0;saved.kills=0;saved.elapsed=0;saved.cleared=0;saved.stats=freshRunStats();
    if(refit){saved=refitRetryCheckpoint(saved);if(!saved){$('#profile-save-status').textContent='REFIT COULD NOT BE APPLIED; CHECKPOINT KEPT';return false}}
    profile.checkpoint=saved;saveProfile('CHECKPOINT RETRY READY');loadGame();return true;
  }
  function renderCombatLoss(){
    const loss=lastCombatLoss||window.StarfighterCombatLoss.describe();$('#loss-cause').textContent=loss.label;$('#loss-tip').textContent=loss.tip;
    const point=retryPoint,canRetry=!!(point&&point.profile===profile&&point.slot===activeProfileSlot&&point.epoch===runEpoch);
    $('#retry-btn').textContent=canRetry?'RETRY CHECKPOINT':bossLab?'RETRY ENCOUNTER':'RELAUNCH';
    $('#retry-details').textContent=canRetry?`${checkpointLabel(point.saved)}. Restore checkpoint build and hull; attempt score resets.`:bossLab?'Restart this study. Test data is not saved.':'Start another run with your Garage loadout.';
    const restart=$('#restart-run-btn');restart.hidden=!canRetry;restart.textContent=runMode==='rush'?'RESTART BOSS RUSH':runMode==='replay'?'RESTART MISSION':'RESTART CAMPAIGN';
  }
  function launchNewRun(){if(trainingSession){finishTrainingPractice({completed:false});return}openMissionBriefing(selectedMode,1,state==='garage'?'garage':'menu')}
  function openMissionBriefing(mode,mission,origin='menu'){
    if(!RUN_MODES.includes(mode)||!Number.isInteger(mission)||mission<1||mission>stageDefs.length||mode!=='replay'&&mission!==1)return;
    if(mode==='replay'&&!profile.progress.missionsCleared[mission-1])return;
    clearGarageIntro();
    const stage=stageDefs[mission-1],rush=mode==='rush';
    pendingBriefing={mode,mission,origin,profile,introChoice:mode==='story'?null:'skip'};
    $('#briefing-mode').textContent=rush?'BOSS RUSH // TEN APEX ENCOUNTERS':mode==='replay'?'MISSION REPLAY // CLEARED SECTOR':'STORY CAMPAIGN // FIRST DEPLOYMENT';
    $('#briefing-title').textContent=rush?bossTypes[0].name:stage.name;
    $('#briefing-sector').textContent=`${rush?'APEX':'MISSION'} ${String(mission).padStart(2,'0')} // ${stage.sector}`;
    $('#briefing-copy').textContent=rush?'Engage ten apex bosses back to back. Your Force, missiles, Bits and Delta are ready. Build up to three run perks between victories.':stage.briefing;
    $('#briefing-hazard').textContent=rush?'APPROACH BYPASSED':stage.hazardLabel;
    $('#briefing-elite').textContent=rush?'BYPASSED IN RUSH':miniBossDefs[mission-1].name;
    $('#briefing-apex').textContent=bossTypes[mission-1].name;
    $('#briefing-card-label').textContent=`${rush?'APEX':'MISSION'} ${String(mission).padStart(2,'0')} // ${runModeName(mode)}`;
    $('#briefing-art').style.setProperty('--briefing-art',`url("${stage.art}")`);
    $('#briefing-art').setAttribute('aria-label',`${stage.name} environment`);
    $('#briefing-depart-btn').disabled=mode==='story';
    $('#briefing-intro-choice').hidden=mode!=='story';
    state='briefing';$('#hud').classList.add('hidden');show('mission-briefing')
  }
  function closeMissionBriefing(){
    if(state!=='briefing')return;const origin=pendingBriefing?.origin;pendingBriefing=null;
    if(origin==='missions'&&profile.progress.missionsCleared.some(Boolean))openMissionSelect();else if(origin==='garage')openGarage();else goMenu()
  }
  function chooseBriefingIntro(play=false){
    const selection=pendingBriefing;if(state!=='briefing'||!selection||selection.mode!=='story'||selection.profile!==profile||trainingFrame)return;
    selection.introChoice=play?'play':'skip';$('#briefing-intro-choice').hidden=true;$('#briefing-depart-btn').disabled=false;
    if(play)openFlightSchool(false,'intro');else focusMenuControl($('#briefing-depart-btn'),true)
  }
  function departMission(){
    if(state!=='briefing'||!pendingBriefing)return;const selection=pendingBriefing;
    if(selection.profile!==profile||selection.mode==='replay'&&!profile.progress.missionsCleared[selection.mission-1]){pendingBriefing=null;goMenu();return}
    if(garage.inventory.length>GARAGE_CAPACITY){pendingBriefing=null;openGarage();$('#profile-save-status').textContent='DISMANTLE TO 32 ITEMS BEFORE LAUNCH';return}
    if(selection.mode==='story'&&!selection.introChoice)return;
    if(profile.checkpoint&&!window.confirm('Depart on a new '+runModeName(selection.mode)+' run? Your current run checkpoint will be replaced. Your Garage and pilot profile will be kept.'))return;
    pendingBriefing=null;$('#briefing-depart-btn').disabled=true;start(selection.mode,selection.mission)
  }
  function start(mode=selectedMode,mission=1,ruleset=DEFAULT_RUN_RULESET){
    if(garage.inventory.length>GARAGE_CAPACITY){openGarage();$('#profile-save-status').textContent='DISMANTLE TO 32 ITEMS BEFORE LAUNCH';return}
    if(!RUN_MODES.includes(mode))mode=selectedMode;if(mode==='replay'&&(!Number.isInteger(mission)||!profile.progress.missionsCleared[mission-1]))return;
    reset(ruleset);runMode=mode;runStartWave=mode==='replay'?mission:1;wave=runStartWave;runActive=true;runOutcome='lost';runSegment=mode==='rush'?'apex':'mission';runElapsed=0;runStats=freshRunStats();runEpicEncounter=mode==='story'?rollEpicEncounter():null;epicHeavies=[];player.weaponVariant=player.weaponVariant||null;
    if(mode==='rush'){player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide=player.pod.returnSide='front';player.laserColor='red';player.laserLevel=3;player.missileLevel=2;player.bits=2;player.dose=100;player.maxHp=Math.max(player.maxHp,8);player.hp=player.maxHp;player.shield=Math.max(player.shield,3)}
    beginStage(mode!=='rush');state='playing';show('');$('#hud').classList.remove('hidden');if(mode==='rush'){miniBossSpawned=true;stageIntro=0;spawn=999;beginApexArrival()}else playLevelMusic();sfx.launch();saveRunCheckpoint();hud()
  }
  function loadGame(){
    const saved=validateRunCheckpoint(profile.checkpoint);if(!saved){renderRunMenu();return}
    reset(saved.ruleset,saved.progression);runMode=saved.mode;selectedMode=runMode==='rush'?'rush':'story';runStartWave=saved.startWave;wave=saved.wave;runActive=true;runOutcome='lost';runSegment=saved.segment;score=saved.score;kills=saved.kills;runElapsed=saved.elapsed;runStats={...saved.stats};runEpicEncounter=saved.epic;epicHeavies=[];
    player={...player,...saved.player,pod:{...player.pod,...saved.player.pod},skills:{...saved.player.skills},retrofits:{...saved.player.retrofits},upgrades:{...saved.player.upgrades}};
    player.forceFireTimer=0;player.forcePendingCharge=0;enforceCombatProgression();
    // Resume the recorded stage without refreshing its consumed guard charges.
    beginStage(runMode!=='rush',false);t=saved.stageClock;player.inv=Math.max(1,player.inv);state='playing';show('');$('#hud').classList.remove('hidden');
    if(saved.segment==='apex'){stageIntro=0;spawn=999;miniBossSpawned=true;beginApexArrival()}
    else if(saved.segment==='module'){miniBossSpawned=true;playLevelMusic();presentTacticalRetrofit(()=>{},saved.recoveryApplied!==false)}
    else if(saved.segment==='doctrine'){miniBossSpawned=true;pendingUpgrade=()=>advanceAfterApex(saved.nextWave);state='skilltree';$('#tree-kicker').textContent=saved.source||'APEX SECURED // RESTORED DOCTRINE';$('#tree-title').textContent=`RANK ${player.rank} // COMMIT ONE DOCTRINE NODE`;renderSkillTree();show('skill-tree')}
    else{playLevelMusic();if(saved.segment==='postElite'){miniBossSpawned=true;stageIntro=0;stagePostEliteClock=saved.postEliteClock;spawn=.4;stageHazardClock=3.5;if(wave===1){stageEncounterCursor=levelOnePostMiniTimeline.findIndex(beat=>beat.at>stagePostEliteClock);if(stageEncounterCursor<0)stageEncounterCursor=levelOnePostMiniTimeline.length}}}
    renderRunMenu();hud()
  }
  function renderMissionSelect(){
    const grid=$('#mission-grid');grid.innerHTML='';const cleared=profile.progress.missionsCleared.filter(Boolean).length;
    $('#mission-select-status').textContent=cleared?`${cleared} / 10 FULL MISSIONS CLEARED · REPLAY AN UNLOCKED MISSION WITH YOUR GARAGE LOADOUT`:'CLEAR A FULL STORY MISSION TO UNLOCK ITS REPLAY';
    stageDefs.forEach((stage,index)=>{const button=document.createElement('button'),unlocked=profile.progress.missionsCleared[index];button.className='mission-card';button.disabled=!unlocked;button.style.setProperty('--mission-art',`url("${stage.art}")`);button.innerHTML=`<small class="mission-number">MISSION ${String(index+1).padStart(2,'0')}</small><b class="mission-name">${stage.name}</b><span class="mission-state">${unlocked?'CLEARED · REPLAY MISSION':'LOCKED · COMPLETE IN STORY'}</span>`;button.onclick=()=>startMissionReplay(index);grid.appendChild(button)})
  }
  function openMissionSelect(){if(!profile.progress.missionsCleared.some(Boolean))return;state='missions';$('#hud').classList.add('hidden');renderMissionSelect();show('mission-select')}
  function startMissionReplay(index){if(!Number.isInteger(index)||index<0||index>=10||!profile.progress.missionsCleared[index])return;openMissionBriefing('replay',index+1,'missions')}
  function advanceAfterApex(nextWave){
    if(runMode==='replay'||nextWave>10){completeRun();return}
    wave=nextWave;t=0;spawn=1;miniBossSpawned=runMode==='rush';beginStage(runMode!=='rush');if(!streamlined()&&player.repairOnApex)player.hp=Math.min(player.maxHp,player.hp+1);
    if(runMode==='rush'){stageIntro=0;spawn=999;beginApexArrival()}else playLevelMusic();saveRunCheckpoint(runMode==='rush'?'apex':'mission')
  }
  function queueRunDoctrine(source,nextWave,delay){
    player.rank++;if(!streamlined()&&player.skillsSpent+player.skillPoints<player.skillCap)player.skillPoints++;if(streamlined()){const recovery=runRewards.consumeApexRepair(runProgression,wave);runProgression=recovery.state;if(recovery.repair)player.hp=Math.min(player.maxHp,player.hp+1)}saveRunCheckpoint('doctrine',{source});victoryDelay={time:delay,run:()=>presentBossDoctrine(source,()=>advanceAfterApex(nextWave),false)}
  }
  function completeRun(){
    if(bossLab||!runActive)return;runOutcome='complete';runActive=false;clearRunCheckpoint();bankRunLoot('RUN SALVAGE SECURED');best=Math.max(best,score|0);finalizeRunProfile();state='complete';boss=miniBoss=null;pendingUpgrade=victoryDelay=null;clearInput();$('#hud').classList.add('hidden');
    $('#complete-title').textContent=runMode==='rush'?'RUSH COMPLETE':runMode==='replay'?'MISSION COMPLETE':'SIGNAL DELIVERED';
    $('#complete-subtitle').textContent=runMode==='rush'?'TEN APEX SIGNALS SILENCED':runMode==='replay'?stageDefs[runStartWave-1].name:'ALL TEN MISSIONS CLEARED · HUMANITY’S LAST SIGNAL IS HOME';
    $('#complete-stats').textContent=`${runModeName()} · SCORE ${(score|0).toString().padStart(6,'0')} · ${runStats.normalBosses+runStats.epicBosses} APEX · ${runStats.miniBosses} ELITES · ${kills} DESTROYED · ${Math.floor(runElapsed/60)}:${String(Math.floor(runElapsed%60)).padStart(2,'0')}`;
    show('run-complete');renderRunMenu();sfx.victory()
  }
  function renderBossLab(status='SELECT A LEVEL, STANDARD BOSS, OR EPIC BOSS'){
    const miniGrid=$('#mini-lab-grid'),levelGrid=$('#level-lab-grid'),grid=$('#boss-lab-grid'),epicGrid=$('#epic-boss-lab-grid');miniGrid.innerHTML='';levelGrid.innerHTML='';grid.innerHTML='';epicGrid.innerHTML='';$('#boss-lab-status').textContent=status;
    stageDefs.forEach((def,index)=>{const button=document.createElement('button');button.className='boss-lab-boss level-test';button.innerHTML=`<b>LEVEL ${(index+1).toString().padStart(2,'0')} // FULL APPROACH</b><span>${def.name}</span>`;button.onclick=()=>startLevelLab(index);levelGrid.appendChild(button)});
    miniBossDefs.forEach((def,index)=>{const button=document.createElement('button');button.className='boss-lab-boss';button.innerHTML=`<b>ELITE ${String(index+1).padStart(2,'0')} / ${index===0?120:110+(index+1)*12} HP</b><span>${def.name}</span>`;button.onclick=()=>startMiniBossLab(index);miniGrid.appendChild(button)});
    bossTypes.forEach((def,index)=>{const button=document.createElement('button');button.className='boss-lab-boss';button.innerHTML=`<b>TEST ${(index+1).toString().padStart(2,'0')}</b><span>${def.name}</span>`;button.onclick=()=>startBossLab(index,false);grid.appendChild(button)});
    epicBossTypes.forEach((def,index)=>{const button=document.createElement('button');button.className='boss-lab-boss epic-test';button.innerHTML=`<b>EPIC TEST 0${index+1} // FOUR PHASES</b><span>${def.name}</span>`;button.onclick=()=>startEpicBossLab(index,false);epicGrid.appendChild(button)})
  }
  function openBossLab(status){state='bosslab';boss=null;miniBoss=null;victoryDelay=null;mouse.firing=false;sfx.stopCharge();$('#hud').classList.add('hidden');renderBossLab(status);show('boss-lab')}
  function startLevelLab(index=0){reset();bossLab=true;bossLabLevel=true;bossLabEpic=false;bossLabRunAll=false;bossLabIndex=clamp(Math.floor(index),0,stageDefs.length-1);wave=bossLabIndex+1;t=0;spawn=.35;miniBoss=null;miniBossSpawned=false;enemies.length=0;enemyShots.length=0;shots.length=0;stageHazards=[];player.maxHp=Math.max(player.maxHp,8);player.hp=player.maxHp;player.shield=Math.max(player.shield,3);player.inv=2;beginStage();state='playing';show('');$('#hud').classList.remove('hidden');playLevelMusic(wave);sfx.launch();hud()}
  function startMiniBossLab(index=0){
    startLevelLab(index);bossLabMini=true;bossLabLevel=false;equipBossLabArsenal();spawn=999;stageIntro=0;makeMiniBoss();hud()
  }
  function equipBossLabArsenal(){player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide='front';player.pod.returnSide='front';player.laserColor='red';player.laserLevel=3;player.missileLevel=2;player.bits=2;player.dose=100;player.skillPoints=1}
  function launchBossLabBoss(index){bossLabLevel=false;bossLabEpic=false;bossLabIndex=clamp(Math.floor(index),0,bossTypes.length-1);wave=bossLabIndex+1;t=0;spawn=999;miniBoss=null;miniBossSpawned=true;enemies.length=0;enemyShots.length=0;shots.length=0;player.hp=player.maxHp;player.shield=Math.max(player.shield,3);player.inv=2;makeBoss();boss.intro=.75;boss.weakTimer=.35;hud()}
  function startBossLab(index=0,runAll=false){reset();bossLab=true;bossLabLevel=false;bossLabEpic=false;bossLabRunAll=runAll;equipBossLabArsenal();player.maxHp=Math.max(player.maxHp,8);player.hp=player.maxHp;player.shield=Math.max(player.shield,3);state='playing';show('');$('#hud').classList.remove('hidden');sfx.launch();launchBossLabBoss(index)}
  function launchEpicBossLabBoss(index){bossLabLevel=false;bossLabEpic=true;bossLabIndex=clamp(Math.floor(index),0,epicBossTypes.length-1);wave=bossLabIndex+1;t=0;spawn=999;miniBoss=null;miniBossSpawned=true;enemies.length=0;enemyShots.length=0;shots.length=0;epicHeavies=[];player.hp=player.maxHp;player.shield=Math.max(player.shield,6);player.inv=2;makeEpicBoss(bossLabIndex,bossLabIndex);boss.intro=.75;boss.weakTimer=.35;hud()}
  function startEpicBossLab(index=0,runAll=false){reset();bossLab=true;bossLabLevel=false;bossLabEpic=true;bossLabRunAll=runAll;equipBossLabArsenal();player.maxHp=Math.max(player.maxHp,12);player.hp=player.maxHp;player.shield=Math.max(player.shield,6);state='playing';show('');$('#hud').classList.remove('hidden');sfx.launch();launchEpicBossLabBoss(index)}
  function skipBossLabSegment(){if(!bossLab||state!=='playing')return;if(miniBoss){miniBoss.hp=0;return}if(boss){if(boss.epic&&boss.ritual){const active=epicHeavies.find(heavy=>heavy.active&&!heavy.dead);if(active){active.hp=0;updateEpicRitual(boss,0)}else finishEpicRitual(boss,true);return}if(boss.epic){boss.hp=boss.max*(1-boss.phase*.25);return}boss.hp=0;return}if(bossLabLevel){const levelOne=currentStage().id===1&&wave===1;if(!miniBossSpawned)t=(levelOne?LEVEL_ONE_ELITE_TIME:STAGE_ELITE_TIME)+.1;else stagePostEliteClock=levelOne?LEVEL_ONE_POST_TIME:STAGE_POST_ELITE_TIME}}
  function currentStage(){return stageDefs[(Math.max(1,wave)-1)%stageDefs.length]}
  function currentFieldBeat(){return window.StarfighterStageRhythm.describe({stage:currentStage().id,post:stagePostEliteClock>=0,clock:stagePostEliteClock>=0?stagePostEliteClock:t})}
  function beginStage(prefetchEncounter=true,refreshGuards=true){stageHazards=[];stageIntro=bossLab&&!bossLabLevel?0:5.2;stageHazardClock=5.4;stageFlash=0;stageEvent=0;stageEncounterCursor=0;stageCue=null;stagePostEliteClock=-1;stageApexIntro=-1;if(player){player.forceFireTimer=0;player.forcePendingCharge=0;enforceCombatProgression();if(refreshGuards){player.ablativeReady=player.ablativeOwned;player.secondChanceReady=player.secondChance}}prefetchStageAssets(prefetchEncounter)}
  function addStageDebris(count=3,mine=false){const stage=currentStage();for(let i=0;i<count;i++)stageHazards.push({type:'debris',mine,x:W+70+i*rand(42,105),y:rand(75,H-75),r:rand(mine?13:10,mine?24:30),speed:rand(mine?105:125,mine?155:215),vy:rand(-24,24),rot:rand(0,Math.PI*2),vr:rand(-3.8,3.8),hp:mine?2:rand(1,4),life:14,phase:rand(0,7),color:i%2?stage.accent:stage.accent2})}
  function addStageGate(variant,gap=165,speed=105){stageHazards.push({type:'gate',variant,x:W+92,gapY:rand(145,H-145),gap,width:variant==='organic'?68:variant==='vine'?58:52,speed,warn:1.15,life:13,phase:rand(0,7),color:currentStage().accent})}
  function addStageBeam(variant='prism'){stageHazards.push({type:'beam',variant,x:W+95,y:rand(155,H-155),angle:rand(-.48,.48),speed:variant==='collapse'?145:112,warn:1.35,active:1.25,life:4.2,color:currentStage().accent,phase:rand(0,7)})}
  function spawnStageHazard(){const stage=currentStage(),fieldClock=stagePostEliteClock>=0?STAGE_ELITE_TIME+stagePostEliteClock:t;stageEvent++;switch(stage.hazard){case'wreck':addStageDebris(fieldClock>28?5:3);break;case'piston':addStageGate('metal',fieldClock>28?142:170,118);break;case'current':addStageDebris(fieldClock>28?5:3,true);stageFlash=.35;break;case'prism':addStageBeam('prism');break;case'vine':addStageGate('vine',fieldClock>28?135:158,96);break;case'maw':addStageGate('organic',fieldClock>28?126:150,90);break;case'emp':addStageGate('emp',fieldClock>28?142:176,132);stageFlash=.55;break;case'flare':addStageGate('flare',fieldClock>28?150:188,168);break;case'gravity':stageHazards.push({type:'well',x:W+95,y:rand(130,H-130),r:30,speed:76,life:8.5,phase:rand(0,7),color:stage.accent2});break;default:if(stageEvent%3===1)addStageGate('collapse',138,150);else if(stageEvent%3===2)addStageDebris(6);else addStageBeam('collapse')}}
  function stageLineDistance(px,py,h){const dx=Math.cos(h.angle),dy=Math.sin(h.angle);return Math.abs((px-h.x)*dy-(py-h.y)*dx)}
  function strikeStageHazard(h){if(h.hit||player.inv>0||state!=='playing')return;h.hit=true;damage(1,{kind:'hazard',hazardType:h.type,variant:h.variant,mine:!!h.mine});particlesAt(player.x,player.y,h.color,13,170);shake=Math.max(shake,8)}
  function updateStageHazards(dt){
    stageIntro=Math.max(0,stageIntro-dt);stageFlash=Math.max(0,stageFlash-dt);if(stageCue)stageCue.time=Math.max(0,stageCue.time-dt);if(bossLab&&!bossLabLevel)return;const stage=currentStage(),scriptedLevelOne=stage.id===1&&wave===1,post=stagePostEliteClock>=0,fieldClock=post?stagePostEliteClock:t,approachEnd=post?(scriptedLevelOne?LEVEL_ONE_POST_TIME:STAGE_POST_ELITE_TIME)-3:(scriptedLevelOne?LEVEL_ONE_ELITE_TIME:STAGE_ELITE_TIME)-4,approach=!boss&&!miniBoss&&!victoryDelay&&stageApexIntro<0&&fieldClock>(post?2:5)&&fieldClock<approachEnd;
    if(approach&&stage.hazard==='current')player.y=clamp(player.y+(Math.sin(t*.76)*26+Math.sin(t*1.91)*9)*dt,45,H-45);
    if(approach&&!scriptedLevelOne){if(currentFieldBeat().hazards){stageHazardClock-=dt;if(stageHazardClock<=0){spawnStageHazard();stageHazardClock=Math.max(3.15,6.25-stage.id*.11-((post?STAGE_ELITE_TIME+fieldClock:fieldClock)>28?.85:0)+rand(-.45,.55))}}else stageHazardClock=Math.max(stageHazardClock,1.2)}
    for(const h of stageHazards){h.life-=dt;h.phase+=dt;h.hit=false;if(h.type==='debris'){
      h.x-=h.speed*dt;h.y+=h.vy*dt+Math.sin(h.phase*2.4)*12*dt;h.rot+=h.vr*dt;if(h.y<h.r||h.y>H-h.r)h.vy*=-1;
      for(const shot of shots){if(h.hp<=0)break;if(shot.dead||Math.hypot(shot.x-h.x,shot.y-h.y)>h.r+shot.r)continue;h.hp-=shot.d;if(shot.pierce>0)shot.pierce--;else shot.dead=true;particlesAt(shot.x,shot.y,h.color,4,85)}
      if(h.hp>0&&player.pod.owned&&Math.hypot(player.pod.x-h.x,player.pod.y-h.y)<player.pod.r+h.r){h.hp=0;particlesAt(h.x,h.y,'#4ef5ff',6,110)}
      if(h.hp>0&&Math.hypot(player.x-h.x,player.y-h.y)<player.r+h.r){h.hp=0;strikeStageHazard(h);if(state!=='playing')return}
      if(h.hp<=0)h.dead=true
    }
      else if(h.type==='gate'){h.x-=h.speed*dt;h.warn-=dt;h.gapY=clamp(h.gapY+Math.sin(h.phase*(h.variant==='organic'?2.2:1.35))*8*dt,115,H-115);if(h.warn<=0&&Math.abs(player.x-h.x)<h.width*.55+player.r&&Math.abs(player.y-h.gapY)>h.gap*.5-player.r)strikeStageHazard(h)}
      else if(h.type==='beam'){h.x-=h.speed*dt;if(h.warn>0)h.warn-=dt;else{h.active-=dt;if(h.active>0&&stageLineDistance(player.x,player.y,h)<13+player.r*.35)strikeStageHazard(h);else if(h.active<=0)h.dead=true}}
      else if(h.type==='well'){h.x-=h.speed*dt;const dx=h.x-player.x,dy=h.y-player.y,d=Math.hypot(dx,dy)||1,pull=clamp(1-d/290,0,1);player.x=clamp(player.x+dx/d*pull*78*dt,35,W-90);player.y=clamp(player.y+dy/d*pull*78*dt,45,H-45);for(const shot of enemyShots){const qx=h.x-shot.x,qy=h.y-shot.y,qd=Math.hypot(qx,qy)||1,q=clamp(1-qd/230,0,1);shot.vx+=qx/qd*q*95*dt;shot.vy+=qy/qd*q*95*dt}if(d<h.r+player.r)strikeStageHazard(h)}
      if(state!=='playing')return;if(h.dead&&!h.burst){h.burst=true;particlesAt(h.x,h.y,h.color,12,150);score+=15}}
    stageHazards=stageHazards.filter(h=>!h.dead&&h.life>0&&h.x>-160)
  }
  const enemyFlightProfiles={
    drift:{rate:1.25,weave:24,lane:46,travel:1.15,hold:.7},
    rail:{rate:.95,weave:16,lane:38,travel:.95,hold:.85},
    swim:{rate:.72,weave:32,lane:62,travel:1.4,hold:.6},
    mirror:{rate:1.4,weave:23,lane:48,travel:1.05,hold:.55},
    seed:{rate:.6,weave:18,lane:36,travel:1.35,hold:.9},
    pulse:{rate:1.05,weave:29,lane:55,travel:1.2,hold:.65},
    ghost:{rate:.48,weave:34,lane:65,travel:1.5,hold:.8},
    solar:{rate:1.65,weave:21,lane:48,travel:.95,hold:.55},
    orbit:{rate:.85,weave:31,lane:60,travel:1.3,hold:.7},
    apex:{rate:1.2,weave:28,lane:58,travel:1.05,hold:.6}
  };
  function updateEnemyStageMotion(e,dt){
    if(dt<=0)return;
    const style=e.stageStyle||currentStage().enemyStyle,profile=enemyFlightProfiles[style]||enemyFlightProfiles.drift,movementScale=e.threat?.movementScale||1;
    if(!e.stageMotion)e.stageMotion={originY:e.y,phase:e.phase-dt,clock:0,leg:0,mode:'hold',time:0,fromY:e.y,toY:e.y,duration:0};
    const motion=e.stageMotion,aiming=(e.fireAnim||0)>0&&!e.fireReleased,tempo=aiming?.28:1;
    motion.clock+=dt*tempo*movementScale;
    if(e.type==='drone'){
      if(motion.mode==='hold'){
        motion.time+=dt;
        if(motion.time>=profile.hold/movementScale&&!aiming){
          const offset=[-.85,.9,.25,-.4,0][((motion.leg+Math.floor(motion.phase))%5+5)%5];
          motion.mode='travel';motion.time=0;motion.fromY=e.y;motion.toY=clamp(motion.originY+offset*profile.lane,64,H-64);
          motion.duration=(profile.travel+Math.abs(motion.toY-e.y)/260)/movementScale;motion.leg++
        }
      }else{
        motion.time=Math.min(motion.duration,motion.time+dt*tempo);
        const u=clamp(motion.time/motion.duration,0,1),ease=u*u*u*(10+u*(-15+u*6));
        e.y=motion.fromY+(motion.toY-motion.fromY)*ease;
        if(u>=1){motion.mode='hold';motion.time=0}
      }
      // Give an aiming drone a steadier firing platform without stopping its advance.
      if(aiming)e.x+=(e.speed||0)*dt*.18
    }else{
      const amplitude=e.type==='turret'?3.5:profile.weave,phase=motion.phase+motion.clock*profile.rate;
      const target=clamp(motion.originY+(Math.sin(phase)-Math.sin(motion.phase))*amplitude,52,H-52);
      e.y+=(target-e.y)*(1-Math.exp(-dt*(e.type==='turret'?4:6)))
    }
    if(style==='rail')e.x-=Math.max(0,Math.sin(motion.phase+motion.clock*1.8))*18*dt*tempo
  }
  function addParticle(p){const limit=settings.clearCombat?300:settings.reducedMotion?450:700;if(particles.length>limit)particles.splice(0,particles.length-limit);if(p.smoke&&particles.length>=limit*.65)return;if(particles.length>=limit){const oldSmoke=particles.findIndex(item=>item.smoke);particles.splice(oldSmoke<0?0:oldSmoke,1)}particles.push(p)}
  function particlesAt(x,y,c,n=9,v=130){const count=Math.ceil(n*(settings.clearCombat?.55:settings.reducedMotion?.7:1));for(let i=0;i<count;i++){let a=rand(0,Math.PI*2),q=rand(30,v);addParticle({x,y,vx:Math.cos(a)*q,vy:Math.sin(a)*q,life:rand(.2,.7),c,s:rand(1,4)})}}
  const forceColors={red:'#ff416f',blue:'#55b8ff',yellow:'#ffd84f'};
  function systemToast(message,color='#4ef5ff'){lootToastTimer=2.8;const toast=$('#loot-toast');toast.className='loot-toast show';toast.style.color=color;toast.textContent=message}
  function addDose(amount,{scale=true}={}){if(!player)return;const before=player.dose;player.dose=clamp(player.dose+amount*(scale?player.doseGain:1),0,100);if(before<100&&player.dose>=100){systemToast(`DOSE 100% // DELTA WEAPON READY [${inputLabel('delta')}]`,'#fff07a');requestOnboarding('delta')}}
  const MAX_CAMPAIGN_SHIELDS=4;
  function clampPlayerShields(){if(player)player.shield=Math.max(0,Math.min(bossLab?99:MAX_CAMPAIGN_SHIELDS,Math.floor(player.shield||0)))}
  function grantShield(amount=1){
    if(!player)return 0;clampPlayerShields();const before=player.shield;
    player.shield=Math.min(bossLab?99:MAX_CAMPAIGN_SHIELDS,before+Math.max(0,Math.floor(amount)));return player.shield-before
  }
  function collectShieldPickup(){
    const gained=grantShield();
    if(gained){player.shieldWake=.65;if(player.shieldDose)addDose(player.shieldDose);systemToast(`AEGIS SHIELD +1${player.shieldDose?` // +${player.shieldDose}% DOSE`:''}`,'#ffd166')}
    else{const surplus=streamlined()?player.surplusDose:2;addDose(surplus);systemToast(`SHIELD BANK FULL // +${surplus} DOSE`,'#ffd166')}
  }
  function bitPositions(){if(!player?.bits)return[];const phase=t*2.2,offsets=player.bits===1?[-1]:[-1,1];return offsets.map((side,index)=>({x:player.x-2+Math.cos(phase+index*Math.PI)*3,y:player.y+side*31+Math.sin(phase+index*Math.PI)*4,r:7}))}
  function podDirection(){return player.pod.mode==='docked'&&player.pod.dockSide==='rear'?-1:1}
  const FORCE_EMISSION_INTERVAL=.24;
  function combatProgressionCaps(sector=wave){
    if(bossLab||runMode==='rush')return{force:3,missile:2,bits:2};
    const mission=Math.max(1,Math.floor(sector));return{force:mission===1?1:mission<4?2:3,missile:mission<3?1:2,bits:mission<3?1:2}
  }
  function enforceCombatProgression(){
    const caps=combatProgressionCaps();if(!player)return caps;
    player.laserLevel=clamp(Math.floor(player.laserLevel||0),0,caps.force);player.missileLevel=clamp(Math.floor(player.missileLevel||0),0,caps.missile);player.bits=clamp(Math.floor(player.bits||0),0,caps.bits);clampPlayerShields();
    return caps
  }
  function chargeOutput(charge=0){const amount=clamp(charge,0,1);return 1+7*amount*amount}
  function updateForceFireCadence(dt){
    player.forceFireTimer=Math.max(0,(player.forceFireTimer||0)-dt);
    if(victoryDelay){player.forcePendingCharge=0;return}
    if(player.forcePendingCharge>0&&player.forceFireTimer<=1e-9){const charge=player.forcePendingCharge;player.forcePendingCharge=0;fireForceLaser(charge,1,'queued')}
  }
  function fireForceLaser(charge=0,power=1,source='manual'){
    if(victoryDelay||!player.pod?.owned||!player.laserColor||!player.laserLevel)return false;
    enforceCombatProgression();charge=clamp(charge,0,1);
    if((player.forceFireTimer||0)>1e-9){if(charge>0)player.forcePendingCharge=Math.max(player.forcePendingCharge||0,charge);return false}
    const firstShot=shots.length,p=player.pod,level=player.laserLevel,dir=podDirection(),startX=p.x+dir*20,color=forceColors[player.laserColor],forcePower=player.podDamage*(dir<0?player.rearForce:1)*chargeOutput(charge);
    if(player.laserColor==='red'){
      shots.push({x:startX,y:p.y,vx:dir*(690+level*35),vy:0,r:3+level,d:forcePower*player.redForce*[0,.45,.72,1.05][level],charge:false,pod:true,forceColor:color,pierce:level===3?1:0});
      for(const bit of bitPositions())shots.push({x:bit.x+dir*10,y:bit.y,vx:dir*650,vy:0,r:2.6,d:forcePower*[0,.07,.095,.12][level],charge:false,bit:true,forceColor:color})
    }else if(player.laserColor==='blue'){
      const lanes=level===1?[0]:level===2?[-.16,.16]:[-.24,0,.24];for(const angle of lanes)shots.push({x:startX,y:p.y,vx:dir*610*player.blueVelocity*Math.cos(angle),vy:610*player.blueVelocity*Math.sin(angle),r:3.4,d:forcePower*player.blueForce*[0,.34,.30,.29][level],charge:false,pod:true,forceColor:color,surfaceBounce:level>1?level-1:0})
    }else{
      const lanes=level===1?[0]:level===2?[-8,8]:[-13,0,13];for(const off of lanes)shots.push({x:startX,y:p.y+off,vx:dir*(465+level*22),vy:off*1.8,r:3.8,d:forcePower*player.yellowForce*[0,.26,.23,.22][level],charge:false,pod:true,forceColor:color,homingPlayer:(1.55+level*.35)*player.yellowGuidance,waveRay:true})
    }
    player.forceFireTimer=FORCE_EMISSION_INTERVAL;
    if(source!=='manual'&&runStats&&!bossLab){const count=shots.length-firstShot;runStats.shotsFired+=count;if(charge>0)runStats.chargedShots+=count}
    return true
  }
  function fireMissiles(){if(victoryDelay||!player.missileLevel||player.missileTimer>0)return;enforceCombatProgression();const count=player.missileLevel,offsets=count===1?[18]:[-18,18];for(const off of offsets)shots.push({x:player.x+8,y:player.y+off,vx:360,vy:off<0?-55:55,r:4.2,d:.75*player.damage*player.missileDamage,missile:true,homingPlayer:2.75*player.missileGuidance,pierce:0});player.missileTimer=count===2?.70:.85}
  function fire(charge=0){
    if(victoryDelay||state!=='playing')return;trainingNote('shot',{charge,color:player.laserColor});
    const power=chargeOutput(charge)*player.damage*(charge?player.chargeDamage*(player.shield>0?1+(player.shieldedChargeBonus||0):1):1),count=player.gun,speed=charge?490:620,startCount=shots.length,variant=player.weaponVariant;for(let i=0;i<count;i++){const off=(i-(count-1)/2)*9,critical=Math.random()<player.critChance;shots.push({x:player.x+35,y:player.y+off,vx:speed,vy:0,r:(charge?7+charge*8:3)*(variant==='siege'&&charge?1.1:1),d:power*(critical?2:1),charge,critical,pierce:variant==='null'&&charge?1:0})}
    if(variant==='arc'&&!charge)shots.push({x:player.x+31,y:player.y-5,vx:590,vy:-58,r:3,d:power*.22,charge:false,critical:false},{x:player.x+31,y:player.y+5,vx:590,vy:58,r:3,d:power*.22,charge:false,critical:false});
    fireForceLaser(charge,power);fireMissiles();if(runStats&&!bossLab){const fired=shots.length-startCount;runStats.shotsFired+=fired;if(charge)runStats.chargedShots+=fired}sfx.shot(charge)
  }
  function releaseCharge(){if(!player||state!=='playing'||victoryDelay){if(player)player.charge=0;sfx.stopCharge();return}const charge=player.charge>=.24?player.charge:0;sfx.stopCharge();player.charge=0;if(!charge&&player.fire>0)return;fire(charge);player.fire=player.rate}
  function togglePod(){const p=player?.pod;if(!p?.owned||state!=='playing')return;if(p.mode==='docked'){p.returnSide=p.dockSide;p.mode='deployed';sfx.pod('deploy')}else if(p.mode==='deployed'){p.mode='returning';sfx.pod('recall')}}
  function togglePodMount(){const p=player?.pod;if(!p?.owned||state!=='playing')return;const next=p.dockSide==='front'?'rear':'front';p.dockSide=next;p.returnSide=next;if(p.mode==='docked')p.mode='returning';systemToast(`FORCE POD // ${next.toUpperCase()} MOUNT`,'#4ef5ff');sfx.pod('recall')}
  function activateDelta(){if(!player||state!=='playing'||victoryDelay||player.dose<100)return;const target=boss||miniBoss;if(stageApexIntro>=0||(target&&!bossDamageAllowed(target)))return;trainingNote('delta');deltaEffectOrigins.set(player,{x:player.x,y:player.y});player.deltaFlash=1.2;enemyShots.length=0;shake=28;for(const e of enemies){if(e.dead)continue;e.hp=0;particlesAt(e.x,e.y,'#fff07a',20,260)}if(target){for(const node of activeWeakNodes(target)){if(node.destroyed)continue;damageWeakNode(target,node,Math.max(5,node.max*.22))}}player.dose=0;particlesAt(player.x,player.y,'#ffffff',90,430);systemToast('DELTA WEAPON // SIGNAL ERASURE','#fff07a');sfx.phase()}
  const tacticalRetrofits=[
    {key:'forceTrim',category:'VANGUARD',name:'FORCE HARMONIZER',desc:'Force laser and contact output +6%.',note:'LOADOUT ADAPTATION · NO LASER LEVEL GRANTED',max:1,eligible:p=>p.pod.owned,apply:()=>player.podDamage*=1.06},
    {key:'missileTelemetry',category:'VANGUARD',name:'WARHEAD SYNCHRONIZER',desc:'Missile output +6% and guidance +8%.',note:'REQUIRES COLLECTED MISSILES · LEVEL REMAINS DROP-DRIVEN',max:1,eligible:p=>p.missileLevel>0,apply:()=>{player.missileDamage*=1.06;player.missileGuidance*=1.08}},
    {key:'precisionRelay',category:'VANGUARD',name:'PRECISION RELAY',desc:'Breaking a boss weak point generates 6% DOSE.',note:'REWARDS ACCURACY · NO PASSIVE DAMAGE MULTIPLIER',max:1,eligible:()=>true,apply:()=>player.weakBreakDose+=6},
    {key:'arsenalMaintenance',category:'VANGUARD',name:'CALIBRATED SIGHTS',desc:'Weak-point output improves by 3%. Up to three ranks.',note:'FALLBACK · RESTRAINED DIRECT OUTPUT',max:3,fallback:true,eligible:()=>true,apply:()=>player.weakDamage*=1.03},
    {key:'bitReclaimer',category:'AEGIS',name:'BIT ENERGY RECLAIMER',desc:'Every hostile shot blocked by a Bit adds 0.5% DOSE.',note:'DEFENSE SYNERGY · REQUIRES COLLECTED BITS',max:1,eligible:p=>p.bits>0,apply:()=>player.bitDose+=.5},
    {key:'doseLoop',category:'AEGIS',name:'DOSE RECIRCULATOR',desc:'All DOSE generation improves by 6%.',note:'RESOURCE FLOW · DELTA DAMAGE UNCHANGED',max:1,eligible:()=>true,apply:()=>player.doseGain*=1.06},
    {key:'fieldPatch',category:'AEGIS',name:'FIELD PATCH',desc:'Repair one hull, or gain a shield (four maximum). At full reserves, gain 8% DOSE.',note:'IMMEDIATE RECOVERY · NO MAXIMUM-HULL INCREASE',max:99,eligible:()=>true,apply:()=>{if(player.hp<player.maxHp)player.hp++;else if(!grantShield())addDose(8)}},
    {key:'aegisReserve',category:'AEGIS',name:'AEGIS RESERVE',desc:'Gain one shield charge, up to four.',note:'ONE-LAYER BUFFER · DOES NOT IMPROVE HULL',max:1,eligible:p=>p.shield<MAX_CAMPAIGN_SHIELDS,apply:()=>grantShield()},
    {key:'salvagePulse',category:'VECTOR',name:'SALVAGE PULSE',desc:'Asterprint magnet range expands and loot Surge becomes 4% stronger.',note:'LOOT SYNERGY · MAKES FIELD ASTERPRINTS SAFER TO CLAIM',max:1,eligible:()=>true,apply:()=>{player.gearMagnet+=180;player.lootSurgePower+=.04}},
    {key:'podVector',category:'VECTOR',name:'POD VECTOR SERVOS',desc:'Force deployment and recall become 12% more responsive.',note:'HANDLING UPGRADE · DAMAGE UNCHANGED',max:1,eligible:p=>p.pod.owned,apply:()=>player.podMove*=1.12},
    {key:'chargeBaffle',category:'VECTOR',name:'CHARGE BAFFLE',desc:'Wave-cannon charge time improves by 6%.',note:'TEMPO GAIN · SHOT POWER UNCHANGED',max:1,eligible:()=>true,apply:()=>player.chargeSpeed*=1.06},
    {key:'controlMaintenance',category:'VECTOR',name:'VECTOR TRIM',desc:'Flight response improves by 4%. Up to three ranks.',note:'FALLBACK · COLLISION PROFILE UNCHANGED',max:3,fallback:true,eligible:()=>true,apply:()=>player.speed*=1.04}
  ];
  const skillPaths=[
    {name:'VANGUARD',tag:'ARSENAL DOCTRINE',nodes:[
      {id:'v1',name:'TARGETING CORE',desc:'Weak-point output +4%. Unlocks Vanguard branches.',apply:()=>player.weakDamage*=1.04},
      {id:'v2',name:'FIGHTER LINK',desc:'Fighter-shot output +4%.',apply:()=>player.damage*=1.04},
      {id:'v3',name:'FORCE LINK',desc:'Force laser and contact output +5%.',apply:()=>player.podDamage*=1.05},
      {id:'v4',name:'PAYLOAD LINK',desc:'Missile output +5% and guidance +6%.',apply:()=>{player.missileDamage*=1.05;player.missileGuidance*=1.06}},
      {id:'v5',name:'SPECTRUM LENS',desc:'Red, Blue, and Yellow Force output +5%.',apply:()=>{player.redForce*=1.05;player.blueForce*=1.05;player.yellowForce*=1.05}},
      {id:'v6',name:'HUNTER SIGNAL',desc:'CAPSTONE — every destroyed weak point generates 12% DOSE.',apply:()=>player.weakBreakDose+=12}
    ]},
    {name:'AEGIS',tag:'DEFENSE DOCTRINE',nodes:[
      {id:'a1',name:'WARD CORE',desc:'Gain one shield, up to four. Unlocks Aegis branches.',apply:()=>grantShield()},
      {id:'a2',name:'FORCE BARRIER',desc:'Force interception radius +1.',apply:()=>player.pod.r+=1},
      {id:'a3',name:'BIT RECLAMATION',desc:'Bit blocks generate 0.4% DOSE.',apply:()=>player.bitDose+=.4},
      {id:'a4',name:'ABSORPTION LOOP',desc:'All DOSE generation +5%.',apply:()=>player.doseGain*=1.05},
      {id:'a5',name:'FIELD NANITES',desc:'Repair one hull after each main boss.',apply:()=>player.repairOnApex=1},
      {id:'a6',name:'CITADEL SIGNAL',desc:'CAPSTONE — survive one lethal hull hit per stage at one hull.',apply:()=>{player.secondChance=true;player.secondChanceReady=true}}
    ]},
    {name:'VECTOR',tag:'CONTROL DOCTRINE',nodes:[
      {id:'p1',name:'MOTION CORE',desc:'Flight response +4%. Unlocks Vector branches.',apply:()=>player.speed*=1.04},
      {id:'p2',name:'POD SERVOS',desc:'Force deployment and recall +10%.',apply:()=>player.podMove*=1.1},
      {id:'p3',name:'CHARGE GOVERNOR',desc:'Wave-cannon charge speed +5%.',apply:()=>player.chargeSpeed*=1.05},
      {id:'p4',name:'REAR-MOUNT RELAY',desc:'Rear-mounted Force output +8%.',apply:()=>player.rearForce*=1.08},
      {id:'p5',name:'GUIDANCE WEAVE',desc:'Missile tracking response +10%.',apply:()=>player.missileGuidance*=1.1},
      {id:'p6',name:'EVENT HORIZON',desc:'CAPSTONE — breaking a weak point triggers a four-second flight and charge Surge.',apply:()=>player.weakOverdrive=4}
    ]}
  ];
  const bloodstarNodePixels=[
    [
      [[130,258],[130,343],[283,173],[408,169],[453,245],[453,382],[405,457],[283,453]],
      [[112,276],[112,335],[275,178],[377,200],[436,266],[435,365],[375,428],[273,408]],
      [[135,268],[135,325],[285,152],[380,168],[446,213],[446,355],[382,406],[285,410]],
      [[98,249],[98,323],[242,143],[368,145],[414,219],[416,354],[366,430],[242,425]]
    ],
    [
      [[118,302],[118,360],[284,157],[402,176],[464,305],[468,398],[400,483],[272,518]],
      [[92,306],[92,367],[259,178],[359,193],[453,340],[446,387],[365,480],[233,506]],
      [[126,260],[126,325],[287,160],[410,142],[476,294],[469,344],[404,415],[286,424]],
      [[91,249],[91,324],[248,113],[361,135],[429,257],[441,343],[360,428],[242,472]]
    ]
  ];
  const bloodstarTentacleAngles=[
    [[-1.38,-.72,-.17,.29,.68,1.07],[-.72,-.60,.15,.76,.75,.95],[-.86,-.81,-.45,1.09,.75,1.11],[-1.01,-.74,-.21,.19,.62,1.10]],
    [[-1.02,-.78,-.34,.38,.66,.96],[-1.05,-.80,-1.30,1.05,1.16,1.22],[-1.03,.06,-.78,1.03,.97,2.77],[-1.13,-.69,-.29,.24,.68,1.12]]
  ];
  const twinMawNodePixels=[
    [
      [[277,162],[277,429],[549,292]],
      [[220,162],[221,429],[504,294]]
    ],
    [
      [[177,162],[181,381],[288,169],[293,374]],
      [[97,170],[101,370],[217,170],[219,370]]
    ]
  ];
  const helixNodePixels=[
    [
      [[342,146],[342,456],[241,304]],
      [[286,146],[286,456],[185,304]]
    ],
    [
      [[250,80],[285,392],[165,242],[400,241]],
      [[198,80],[233,392],[113,242],[348,241]]
    ]
  ];
  const riftNodePixels=[
    [
      [[380,78],[362,433],[368,273]],
      [[350,98],[352,416],[325,276]],
      [[387,54],[365,414],[368,256]],
      [[349,48],[351,414],[327,254]]
    ],
    [
      [[401,108],[399,430],[604,270],[355,277]],
      [[383,132],[377,415],[572,270],[335,282]],
      [[390,62],[365,442],[660,272],[327,255]],
      [[375,76],[382,439],[626,276],[319,258]]
    ]
  ];
  const riftFrameRegistration=[[[0,0],[43,-3],[0,17],[41,19]],[[0,0],[20,-5],[28,22],[36,19]]];
  const riftOuterArcPixels=[
    [[[431,69],[514,102]],[[580,180],[598,258]],[[568,389],[469,441]]],
    [[[427,90],[496,112]],[[548,177],[576,246]],[[492,392],[409,424]]],
    [[[432,67],[508,105]],[[578,179],[598,253]],[[570,389],[462,440]]],
    [[[430,68],[510,105]],[[579,180],[600,254]],[[570,388],[467,439]]]
  ];
  const blendFrameData=(a,b)=>typeof a==='number'?(a+b)/2:a.map((value,index)=>blendFrameData(value,b[index]));
  const interleaveFrameData=frames=>frames.flatMap((frame,index)=>[frame,blendFrameData(frame,frames[(index+1)%frames.length])]);
  const riftAnimatedNodePixels=[interleaveFrameData(riftNodePixels[0]),riftNodePixels[1]];
  const riftAnimatedRegistration=[interleaveFrameData(riftFrameRegistration[0]),riftFrameRegistration[1]];
  const riftSmoothedOuterArcs=[
    [[[472,38],[492,69]],[[634,191],[618,231]],[[582,398],[510,445]]],
    [[[470,43],[485,71]],[[624,181],[621,220]],[[580,390],[504,428]]],
    [[[429,65],[450,96]],[[570,209],[556,238]],[[519,391],[456,429]]],
    [[[448,69],[465,100]],[[579,219],[570,239]],[[520,393],[463,438]]],
    [[[480,36],[498,67]],[[625,179],[611,216]],[[574,376],[510,423]]],
    [[[470,36],[493,66]],[[619,177],[609,206]],[[568,368],[511,417]]],
    [[[439,35],[458,67]],[[586,179],[575,216]],[[537,376],[470,424]]],
    [[[444,44],[463,70]],[[583,187],[578,219]],[[529,372],[479,414]]]
  ];
  const ironBloomNodePixels=[
    interleaveFrameData([
      [[187.8,215.6],[127.8,257.8],[177.5,435.8]],
      [[184.7,207.6],[186.5,313.1],[182.1,429]],
      [[177.5,196.9],[107.4,254],[171.8,438.3]],
      [[182.8,220],[127.1,261.5],[183.8,416.2]]
    ]),
    interleaveFrameData([
      [[170.9,191.1],[123.4,243.3],[167.2,455.4],[300.2,317.7]],
      [[197.6,141.8],[121.8,233.3],[205.5,475.6],[303.9,317]],
      [[218.7,162.9],[92.3,220.1],[164.7,456.2],[296.6,321.8]],
      [[156.1,191.1],[121.9,244.8],[179.3,427.2],[298.7,315.2]]
    ])
  ];
  const voidLeviathanNodePixels=[
    [
      [[215.9,196.4],[179.8,265],[309.8,209.3]],[[214.3,188.9],[184.4,269.8],[308.1,202]],
      [[204.5,195.8],[193.6,272],[297.3,208.6]],[[201.1,204.3],[193.9,229.4],[288.2,223.3]],
      [[207.6,206.9],[201.9,230.4],[288.6,227.9]],[[221.5,193.3],[189.4,260.6],[292.6,218.5]],
      [[206.6,205.9],[186.2,245.3],[301,216.2]],[[218.7,198.1],[185.9,262.6],[306.2,203.4]],
      [[205,199.7],[175.3,263.6],[290,210.2]],[[221.6,203],[198.1,267.1],[315.9,205.4]],
      [[216.6,188.2],[182.7,242.6],[308.7,196.5]],[[204.8,197.8],[199.5,245],[321,200.6]],
      [[218.5,195],[178.7,259.5],[309.7,212.3]],[[226.7,190.5],[193.5,250.3],[321.9,197.4]],
      [[211.4,201.4],[182.7,274],[307.1,211.3]],[[227.7,185.7],[189.9,249.2],[321.6,203.6]]
    ],
    [
      [[220.5,209.8],[179.9,274],[365.9,246],[403.4,246.8]],[[222,197.8],[183.4,262.6],[361.5,244.4],[417.1,249.9]],
      [[222.6,193.8],[179.4,258.3],[364.2,245.3],[433,252.5]],[[230.8,199.7],[181.9,263.4],[362.2,260.9],[456,260.3]],
      [[226,212],[187.7,274.1],[365.6,259.6],[459.4,265.6]],[[229,201.5],[184.1,269.3],[361.3,258.7],[453.5,258.8]],
      [[239.6,203.3],[179.3,268.5],[366,259.8],[430.5,256.3]],[[230.9,205.5],[186,267.3],[366.9,254],[412.6,250.7]],
      [[240.7,223.2],[193.6,280.4],[363.8,253.6],[395.4,247.3]],[[224.7,205.8],[178,262.6],[365.6,240.3],[399.7,247]],
      [[241,222.9],[180.8,288.5],[370.1,249.3],[398.3,248.2]],[[223.7,198.2],[180.4,262.2],[364.7,235.6],[397.9,249.4]],
      [[227.1,208.3],[184.5,269.8],[369.3,242.3],[403.1,250.6]],[[236.8,196.7],[184.3,261.4],[367.7,237.8],[404.8,259.2]],
      [[230.4,192.7],[184.7,255.1],[367.2,232.6],[401,246.8]],[[225.8,196.5],[183.1,256.7],[364.7,235.1],[401.9,237.9]]
    ]
  ];
  const voidLeviathanAnchorPixels=[[214,197],[228,205]];
  const voidLeviathanGranularCellSize=1254/4;
  const voidLeviathanGranularNodeBases=[
    [[127,120],[108,155],[183,130],[105,260],[197,267]],
    [[136,103],[110,137],[196,126],[104,220],[142,253],[218,248]]
  ];
  const voidLeviathanGranularNodeMotion=[
    [[1.1,.8,0],[1.35,2.15,.35],[1.15,.9,.95],[3.2,4.8,.4],[3.5,5.2,1.35]],
    [[1.1,.8,0],[1.4,2.2,.35],[1.2,1,.9],[3.3,4.8,.2],[4.1,5.5,1.05],[3.8,5.2,1.8]]
  ];
  const voidLeviathanTentacleWeakAngles=[[-.62,-.72],[-.58,-.66,-.82]];
  const voidLeviathanGranularFrameShift=[
    [[0,0],[-18,0],[-22,0],[-26,0],[-6,-16],[-24,-16],[-26,-16],[-34,-16],[-8,-30],[-18,-34],[-26,-32],[-38,-30],[-6,-62],[-14,-58],[-26,-60],[-36,-62]],
    [[0,0],[-24,0],[-26,-2],[-42,-2],[-6,-18],[-28,-16],[-30,-18],[-44,-18],[-10,-32],[-32,-32],[-36,-32],[-46,-34],[-14,-50],[-30,-50],[-36,-50],[-46,-50]]
  ];
  const prismWardenCellWidth=384,prismWardenCellHeight=256,prismWardenContentScale=.86,prismWardenRenderWidth=312;
  const prismWardenFrameShift=[[-4.5,3.8],[.3,3.2],[4,1.7],[3.9,1.8],[-4.2,1.8],[0,-2.1],[3.7,-3],[1.4,-2.7],[-2.3,-2],[-.6,-3.3],[2.1,-6.4],[.8,-3.2],[-3.8,1.7],[0,1.2],[-.1,-.1],[-.3,0]];
  const prismWardenNodePixels=[
    [[188,129.5],[279.3,75.5],[273.1,199.3],[319.3,136.8]],[[183.2,130.1],[272.8,73.8],[268.8,198.7],[312.5,136.3]],
    [[179.5,131.6],[268.6,74.6],[266.5,197.7],[310.5,136.3]],[[179.6,131.5],[268.7,74.1],[267.2,197.3],[311.4,138.2]],
    [[187.7,131.5],[278.4,74.7],[277.2,201.2],[323,141.1]],[[183.5,135.4],[280.8,78.7],[277.9,204.9],[321.5,142.6]],
    [[179.8,136.3],[277.4,78.3],[279.9,203.4],[316.2,144.7]],[[182.1,136],[274.9,79.8],[275.5,200],[316.1,144]],
    [[185.8,135.3],[281.5,77.3],[278,205.7],[326.5,142]],[[184.1,136.6],[276.8,80.5],[276.6,199.5],[320.2,145.3]],
    [[181.4,139.7],[279.1,77],[279.5,203.3],[317.9,147.4]],[[182.7,136.5],[270.5,79.8],[274,199.7],[317.8,148.4]],
    [[187.3,131.6],[278.4,77.8],[273.9,199.4],[319.1,138.5]],[[183.5,132.1],[271.9,76.1],[267.5,198.4],[312.2,138.4]],
    [[183.6,133.4],[272.4,78.9],[272.9,197.3],[315.8,143]],[[183.8,133.3],[270.7,78],[270.2,198.3],[312.7,142.3]]
  ];
  const gravebellCellSize=320,gravebellRenderSize=300;
  const gravebellNodePixels=[
    [
      [[139.1,101.8],[154.5,173.4],[222.2,154]],[[140.1,102.7],[159.4,174.7],[224.1,158.1]],[[140.1,104.8],[155.3,173.9],[224.2,159.8]],[[134.6,105.8],[149.8,171.9],[220.4,163.4]],
      [[135.3,106.4],[154.2,177],[221.5,167.2]],[[136,107],[158.4,180],[222.4,170.1]],[[138,108.2],[160.4,180.4],[222.4,172.3]],[[134.8,110.5],[154.9,178],[222.4,173.4]],
      [[136.1,111],[153.4,179.2],[222.4,174.2]],[[138,112],[154.9,181.2],[223.1,174.9]],[[138.2,113],[153.8,181.6],[223.5,175.3]],[[132.7,113.9],[148.3,180.2],[218,177]],
      [[130.7,112.5],[148,175.9],[222.2,172]],[[128.3,110.6],[151.2,170.8],[227.4,166.5]],[[125.3,108.6],[151.4,166.4],[230.8,162.9]],[[125.1,103.1],[145.9,161.5],[225.3,165.6]]
    ],
    [
      [[141.8,119.3],[171.2,181.6],[98.5,201.5],[261.6,209.6]],[[139.5,120.8],[165.7,181.4],[95.1,200.7],[256.1,204.1]],[[136.6,120.7],[161.3,180.8],[91.5,198.7],[250.6,205.5]],[[136.8,122.7],[159.1,181.3],[89.2,197.8],[245.1,204.4]],
      [[140.9,121.9],[164.6,179.4],[94.7,195.7],[249.1,204.7]],[[141.7,122.5],[166.7,180.5],[92.2,193.3],[250.8,199.2]],[[142.2,121.5],[169.2,180.1],[95.3,192.7],[253.9,194.4]],[[139.6,120.9],[163.7,179.3],[89.9,195.4],[248.4,198.4]],
      [[142.8,120.8],[169.2,179.6],[93.8,192.1],[252.5,197.6]],[[140.2,120.1],[163.7,180.1],[95.1,193.4],[247,198.1]],[[140,119.4],[165.7,179.2],[92.3,191.3],[250.6,197.5]],[[137,118.4],[160.2,176.5],[87.7,191.1],[245.1,198.2]],
      [[142.5,120.2],[162.3,171],[87.7,191.1],[239.6,201.1]],[[148,121.8],[160.8,165.5],[93.2,185.6],[234.1,201.1]],[[150.6,126.4],[158.6,160],[97.7,186.6],[228.6,201.6]],[[150.2,131.3],[156,154.5],[99.8,187.7],[223.9,200.7]]
    ]
  ];
  const gravebellWeakRadii=[[[11,9],[15,22],[13,13]],[[11,9],[26,22],[12,12],[12,12]]];
  const solarHydraCellSize=320,solarHydraRenderSize=300;
  const solarHydraNodePixels=[
    [
      [[127.8,119.1],[111.8,169.4],[106,223.1],[186.2,173.3]],[[121.7,125.4],[108.8,166.6],[100,216.7],[177.7,175.2]],[[126.2,126.9],[110.3,165.8],[104.7,220.7],[179.5,174.6]],[[114,122.6],[105,164.4],[92.2,217.9],[170.5,177.4]],
      [[124.3,115.5],[105.9,166.3],[107.2,222.8],[186.3,167.3]],[[122.8,121.2],[106.6,160.5],[99.7,222.9],[178.6,169.8]],[[121,123],[107.2,159.6],[101.3,222.7],[178.8,170.3]],[[106.6,116.7],[97,159.9],[84.9,222.1],[163.3,171]],
      [[122.3,121.8],[107.2,161.9],[101.8,222.3],[180.5,170.8]],[[118.6,124.4],[106,161.5],[97,222.4],[176.2,171.8]],[[116.2,125],[106.1,160.9],[95.1,221.9],[174.1,172.4]],[[104.5,119.2],[94.9,160.7],[82.1,220],[162.1,171.3]],
      [[123,98.5],[105.6,161.8],[107.4,203.3],[182.3,148]],[[117.4,103.8],[101.6,161],[97.6,203.8],[173.1,149.2]],[[118.2,98.9],[104.3,161.7],[99.6,203.5],[174.9,150]],[[113.5,103.6],[94.1,157.8],[84,205.4],[158.9,150.9]]
    ],
    [
      [[127.4,118.5],[106.5,161.6],[104.5,228.8],[183.4,166.8]],[[116,116.1],[106.8,166.4],[104.6,215.9],[168.9,168.6]],[[122.6,120.7],[100.2,163.5],[97.2,221],[176,169.4]],[[121,120.1],[97.7,168],[89.8,215.2],[168.4,170.2]],
      [[121.4,117.8],[105.5,162.7],[104,220.3],[178.4,168.5]],[[108.7,117.2],[101,165.7],[99.9,215.3],[168.5,169.4]],[[111.7,118.4],[99.1,169.5],[94.4,218.4],[169.5,169.1]],[[112.6,118.7],[97.6,167.1],[94.9,217.9],[163.9,169.4]],
      [[110.8,120.1],[96,161.6],[96.7,221.4],[174.9,168.1]],[[107.5,119.4],[97.2,164],[91.9,216.8],[168.9,168.7]],[[109.7,119.6],[94.6,162.2],[93.1,218],[170.5,168.2]],[[111.2,121.2],[96,163.5],[94.6,217.5],[162.6,170.3]],
      [[113.6,97.3],[97.2,164.9],[95.1,200.8],[174.5,154.5]],[[114.3,102.3],[98.6,162.3],[88.6,203.7],[167.7,155.2]],[[118.2,107.4],[102.5,166.7],[97.3,206.4],[173.1,157.2]],[[111.3,101.6],[94.2,163.7],[84.6,205.9],[168.2,156.3]]
    ]
  ];
  const solarHydraWeakRadii=[[[19,13],[22,13],[21,13]],[[19,13],[22,13],[21,13],[25,25]]];
  const omegaHeartCellSize=320,omegaHeartRenderSize=308;
  const omegaHeartNodePixels=[
    [
      [[122.5,175.2],[171.9,125.3],[139.5,212.2]],[[117,175.6],[166.4,125.8],[134,212.6]],[[111.5,177.7],[160.9,124.4],[128.5,214.7]],[[106,179],[155.4,124.6],[123,216]],
      [[111.5,173.5],[160.2,120.5],[128.5,210.5]],[[107.5,168],[154.7,117.6],[124.5,205]],[[107,164.5],[154.4,114.7],[124,201.5]],[[102,164.8],[148.9,112.9],[119,201.8]],
      [[107.5,162.9],[154.4,113.3],[124.5,199.9]],[[105.1,163.6],[151,112.3],[122.1,200.6]],[[106.2,164.2],[152.7,111.9],[123.2,201.2]],[[101.2,164.9],[148,110.9],[118.2,201.9]],
      [[106.7,159.4],[150.2,107],[123.7,196.4]],[[104.7,153.9],[151.5,101.5],[121.7,190.9]],[[106.1,148.4],[153.7,97.4],[123.1,185.4]],[[100.6,146.5],[148.2,95.4],[117.6,183.5]]
    ],
    [
      [[114.4,166.8],[161.1,117.5],[167.2,209.9],[226,109.1],[212.3,224.7]],[[109.2,166.8],[164.8,121.5],[167,207.4],[221.9,108],[209.9,219.5]],[[106.8,167.2],[162.9,124.2],[164.4,204.6],[220.7,107],[207.7,215.5]],[[103.3,167.3],[159.3,126.8],[161.2,202.5],[220.4,104.2],[204.3,213.7]],
      [[108.1,167],[164.8,129.3],[165.9,201.6],[220.6,106],[198.8,210.1]],[[105.1,167.3],[162.3,131.2],[163.3,200.5],[219.4,104],[193.7,210.9]],[[104.1,167.8],[161.5,131.4],[163.8,199.9],[218.3,104.3],[188.9,211.6]],[[101.1,167.5],[159.8,132],[161.9,199],[217.5,102.3],[183.8,211.5]],
      [[106.6,167.7],[163.8,131.4],[166.3,199.7],[216.9,105.9],[185.7,210.7]],[[104.4,168.1],[162.5,132.2],[165.5,199],[216.3,107.1],[183.4,210.9]],[[103.2,168.5],[162,132.2],[164.8,198.7],[213.6,108.9],[181.7,211]],[[99.8,168.4],[160.2,133.5],[163.4,197.5],[210.2,113],[179.1,210.9]],
      [[105.3,162.9],[165.5,132.6],[166.9,198.3],[206.7,114.2],[182.9,206.5]],[[103.8,162.1],[164.9,132.3],[163.3,197.6],[203.7,115.7],[181.2,204.4]],[[104.1,162],[165.5,131.7],[163.7,196.8],[200.3,116.4],[182.1,203.6]],[[100.2,161.9],[164.2,131.5],[160.6,195.8],[199.2,118.1],[179.3,203.1]]
    ]
  ];
  const omegaHeartWeakRadii=[[[25,24],[22,15],[18,14]],[[25,24],[23,16],[23,16],[13,12],[13,12]]];
  const bossTypes=[
    {name:'THE BLOODSTAR',hp:360,c1:'#6d1748',c2:'#b62468',arms1:8,arms2:8,sides:10,move:0,weak1:[[-66,-20],[-66,11],[-11,-50],[34,-52],[50,-25],[50,25],[33,51],[-11,50]],weak2:[[-70,-4],[-70,17],[-11,-56],[32,-49],[54,-3],[55,30],[31,61],[-15,73]]},
    {name:'TWIN MAW',hp:330,c1:'#734022',c2:'#d85c2d',arms1:4,arms2:8,sides:6,move:1,weak1:[[-61,-22],[-61,22],[-46,0]],weak2:[[-64,-38],[-64,38],[-54,-12],[-54,12]]},
    {name:'HELIX CROWN',hp:390,c1:'#42307a',c2:'#875bdb',arms1:10,arms2:12,sides:12,move:2,weak1:[[-60,-30],[-60,30],[-52,0]],weak2:[[-65,-18],[-65,18],[-54,-48],[-54,48]]},
    {name:'RIFT WRAITH',hp:345,c1:'#155c69',c2:'#18a7a6',arms1:5,arms2:7,sides:5,move:3,weak1:[[-61,0],[-51,-36],[-51,36]],weak2:[[-66,-30],[-66,30],[-48,-52],[-48,52]]},
    {name:'IRON BLOOM',hp:470,c1:'#665c24',c2:'#c89e2b',arms1:12,arms2:16,sides:12,move:4,weak1:[[-57,-42],[-64,0],[-57,42]],weak2:[[-66,-20],[-66,20],[-52,-50],[-52,50]]},
    {name:'VOID LEVIATHAN',hp:410,c1:'#194d3a',c2:'#22a35d',arms1:3,arms2:5,sides:7,move:5,weak1:[[-65,-25],[-65,25],[-52,0],[-24,46],[20,48]],weak2:[[-68,-30],[-68,30],[-52,0],[-32,43],[4,52],[38,49]]},
    {name:'PRISM WARDEN',hp:385,c1:'#284d77',c2:'#3c9fe0',arms1:6,arms2:9,sides:3,move:6,weak1:[[-62,0],[-51,-43],[-51,43]],weak2:[[-67,-25],[-67,25],[-49,-53],[-49,53]]},
    {name:'GRAVEBELL',hp:440,c1:'#4f405d',c2:'#9172a8',arms1:4,arms2:6,sides:8,move:7,weak1:[[-64,-30],[-64,30],[-50,0]],weak2:[[-68,-15],[-68,15],[-55,-48],[-55,48]]},
    {name:'SOLAR HYDRA',hp:425,c1:'#7a321d',c2:'#f0792b',arms1:7,arms2:9,sides:9,move:8,weak1:[[-62,-35],[-66,0],[-62,35]],weak2:[[-69,-28],[-69,28],[-54,-55],[-54,55]]},
    {name:'OMEGA HEART',hp:500,c1:'#6d1230',c2:'#ff245f',arms1:10,arms2:14,sides:10,move:9,weak1:[[-64,-32],[-68,0],[-64,32]],weak2:[[-70,-35],[-70,0],[-70,35],[-54,-58],[-54,58]]}
  ];
  const epicBossTypes=[
    {name:'NULL CATHEDRAL',hp:920,c1:'#a72dff',c2:'#ff31b6',visual:'omega',weak:[[[-38,12],[10,-35],[-18,51]],[[-44,-8],[-34,34],[17,-42],[27,44]],[[-48,-38],[-49,0],[-45,39],[8,-53],[23,53]],[[-53,-46],[-56,-15],[-54,20],[-45,50],[8,-58],[34,0],[16,58]]]},
    {name:'MIASMA THRONE',hp:880,c1:'#2ce36a',c2:'#c8ff3e',visual:'solar',weak:[[[-48,-39],[-57,0],[-46,40]],[[-58,-28],[-62,17],[-22,-54],[5,50]],[[-63,-43],[-67,-5],[-58,36],[-15,-58],[24,52]],[[-68,-47],[-71,-16],[-69,18],[-60,48],[-18,-62],[19,-55],[32,44]]]}
  ];
  function tacticalRetrofitChoices(){const choices=[];for(const category of['VANGUARD','AEGIS','VECTOR']){const available=tacticalRetrofits.filter(u=>u.category===category&&u.eligible(player)&&(player.retrofits[u.key]||0)<u.max),primary=available.filter(u=>!u.fallback),candidates=(primary.length?primary:available).sort(()=>Math.random()-.5);if(candidates[0])choices.push(candidates[0])}return choices}
  function renderRetrofitBrief(){
    const kit=['fighter cannon'];if(player.pod.owned)kit.push(`${player.laserColor?player.laserColor+' ':''}Force (level ${player.laserLevel})`);if(player.missileLevel>0)kit.push(`${player.missileLevel} missile launcher${player.missileLevel===1?'':'s'}`);if(player.bits>0)kit.push(`${player.bits} defense Bit${player.bits===1?'':'s'}`);
    $('#upgrade-brief').textContent=`Your kit: ${kit.join(', ')}. Hull ${player.hp}/${player.maxHp}; ${player.shield} shield${player.shield===1?'':'s'}. Field Modules apply to this run.`
  }
  function retrofitContext(u){
      if(u.key==='fieldPatch')return player.hp<player.maxHp?'Right now: repair 1 hull.':player.shield<(bossLab?99:MAX_CAMPAIGN_SHIELDS)?'Right now: gain 1 shield.':'Right now: gain 8% DOSE.';
      if(u.key==='aegisReserve')return player.shield>0?`You have ${player.shield} shield${player.shield===1?'':'s'}.`:'Your shield is currently empty.';
      if(u.key==='forceTrim'&&player.pod.owned)return `${player.laserColor?player.laserColor[0].toUpperCase()+player.laserColor.slice(1)+' ':''}Force is equipped.`;
      if(u.key==='missileTelemetry'&&player.missileLevel>0)return `${player.missileLevel} missile launcher${player.missileLevel===1?' is':'s are'} equipped.`;
      if(u.key==='bitReclaimer'&&player.bits>0)return `${player.bits} defense Bit${player.bits===1?' is':'s are'} equipped.`;
      if(u.key==='podVector'&&player.pod.owned)return player.pod.mode==='docked'?`Your Force is mounted at the ${player.pod.dockSide}.`:player.pod.mode==='returning'?'Your Force is being recalled.':'Your Force is deployed.';
      if(u.key==='precisionRelay'&&player.weakBreakDose>0)return 'Adds to your existing core-break DOSE bonus.';
      if(u.key==='doseLoop')return `Your Delta meter is ${Math.round(player.dose)}% full.`;
      if(u.key==='chargeBaffle'&&player.chargeSpeed>0)return `Base full charge: ${(1.25/player.chargeSpeed).toFixed(2)} seconds.`;
      if(u.key==='salvagePulse'&&player.lootSurgeDuration>4)return `Your equipment Surge lasts ${player.lootSurgeDuration} seconds.`;
      return ''
    }
  function renderRunService(){
    const epoch=runEpoch,mission=wave,pilot=profile;$('#upgrade-kicker').textContent='ELITE SALVAGE SECURED';$('#upgrade-title').textContent='CHOOSE A RECOVERY SERVICE';
    $('#upgrade-brief').textContent=`Hull ${player.hp}/${player.maxHp} · Shields ${player.shield}/4 · DOSE ${Math.round(player.dose)}%. One choice, applied once. Recovered gear is waiting in the Garage.`;
    $('#upgrade-cards').classList.remove('retrofit-cards');window.StarfighterRunRewardsUI.renderService({container:$('#upgrade-cards'),player,onChoose:choice=>chooseRunService(choice,epoch,mission,pilot),onSkip:()=>chooseRunService('skip',epoch,mission,pilot)});
  }
  function chooseRunService(choice,epoch=runEpoch,mission=wave,pilot=profile){
    if(!streamlined()||state!=='upgrade'||epoch!==runEpoch||mission!==wave||pilot!==profile||runProgression.pending!=='service'||runProgression.pendingWave!==wave)return;
    if(!['repair','shield','dose','skip'].includes(choice)||choice==='repair'&&player.hp>=player.maxHp||choice==='shield'&&player.shield>=4||choice==='dose'&&player.dose>=100)return;
    runProgression=runRewards.finishService(runProgression,wave);if(choice==='repair')player.hp++;else if(choice==='shield')grantShield();else if(choice==='dose')addDose(12,{scale:false});
    acknowledgeOnboarding('module');player.inv=Math.max(player.inv,1);score+=choice==='skip'?0:100;resumeRun();if(state==='playing')saveRunCheckpoint('postElite');sfx.upgrade();
  }
  function renderRunPerks(){
    const epoch=runEpoch,mission=wave,pilot=profile,offering=runProgression.pending==='perk',final=!!pendingUpgrade&&runSegment==='doctrine'&&!offering;
    $('#tree-kicker').textContent=offering?'APEX CLEARED // RUN BUILD':final?'FINAL BUILD':'CURRENT RUN BUILD';$('#tree-title').textContent=offering?'CHOOSE ONE RUN PERK':final?'MISSION COMPLETE':'YOUR ACTIVE PERKS';
    $('#skill-points').textContent=final?`${runProgression.perks.length}/3 ACTIVE · Run complete. Recovered gear stays in the Garage.`:`${runProgression.perks.length}/3 ACTIVE · Perks last for this run. New choices replace a perk when all three slots are filled.`;
    $('#tree-continue').textContent=offering?'KEEP BUILD & CONTINUE':final?'FINISH RUN':'CONTINUE';
    window.StarfighterRunRewardsUI.renderPerks({container:$('#skill-paths'),progress:runProgression,player,inspect:!offering,final,onChoose:(id,replaced)=>chooseRunPerk(id,replaced,epoch,mission,pilot)});
  }
  function chooseRunPerk(id,replaced,epoch=runEpoch,mission=wave,pilot=profile){
    if(!streamlined()||state!=='skilltree'||epoch!==runEpoch||mission!==wave||pilot!==profile||runProgression.pending!=='perk'||runProgression.pendingWave!==wave)return;
    try{runProgression=runRewards.choosePerk(runProgression,wave,id,replaced)}catch{return}applyRunPerks();acknowledgeOnboarding('doctrine');score+=150;resumeRun();sfx.skill();
  }
  function presentTacticalRetrofit(after=()=>{},restoring=false){
    if(streamlined()){
      enemyShots.length=0;shots.length=0;mouse.firing=false;sfx.stopCharge();player.charge=0;pendingUpgrade=after;state='upgrade';runProgression=runRewards.offerService(runProgression,wave);renderRunService();show('upgrade');requestOnboarding('module');saveRunCheckpoint('module');sfx.upgrade();return;
    }
    $('#upgrade-cards').classList.remove('run-service-cards');
    enemyShots.length=0;shots.length=0;mouse.firing=false;sfx.stopCharge();player.charge=0;if(player.repairOnVictory&&!restoring)player.hp=Math.min(player.maxHp,player.hp+player.repairOnVictory);upgradeOpensTree=false;pendingUpgrade=after;state='upgrade';$('#upgrade-kicker').textContent=bossLab?'ELITE CORE SECURED // TEST WORKBENCH':'ELITE ASTERPRINT SECURED // FIELD ATTUNEMENT';$('#upgrade-title').textContent='CHOOSE ONE FIELD MODULE';renderRetrofitBrief();
    const pool=tacticalRetrofitChoices(),box=$('#upgrade-cards'),roles={VANGUARD:'OFFENSE',AEGIS:'DEFENSE',VECTOR:'HANDLING'},append=(parent,tag,className,text)=>{const node=document.createElement(tag);node.className=className;node.textContent=text;parent.appendChild(node);return node};
    box.classList.add('retrofit-cards');box.replaceChildren();
    for(const u of pool){
      const wrapper=document.createElement('article'),b=document.createElement('button');wrapper.className='retrofit-choice';b.type='button';b.className=`card retrofit-card retrofit-${u.category.toLowerCase()}`;b.dataset.module=u.key;
      append(b,'small','choice-category',`${roles[u.category]} · ${u.category}`);append(b,'b','choice-name',u.name);append(b,'span','choice-effect',u.desc);append(b,'span','choice-context',retrofitContext(u));
      if(u.fallback&&u.max>1)append(b,'small','choice-rank',`Rank ${(player.retrofits[u.key]||0)+1} of ${u.max}`);
      append(b,'em','choice-duration',['fieldPatch','aegisReserve'].includes(u.key)?'APPLIED ONCE · THIS RUN':'LASTS FOR THIS RUN');append(b,'span','choice-action','CHOOSE MODULE →');b.onclick=()=>chooseTacticalRetrofit(u);wrapper.appendChild(b);
      if(u.note){const details=document.createElement('details');details.className='choice-details';append(details,'summary','','Module details');append(details,'p','',u.note);wrapper.appendChild(details)}
      box.appendChild(wrapper)
    }
    show('upgrade');requestOnboarding('module');saveRunCheckpoint('module');sfx.upgrade()
  }
  function chooseTacticalRetrofit(u){if(streamlined()||state!=='upgrade')return;acknowledgeOnboarding('module');player.retrofits[u.key]=(player.retrofits[u.key]||0)+1;u.apply();score+=100;player.inv=Math.max(player.inv,1);systemToast(`${u.name} // INSTALLED FOR THIS RUN`,'#4ef5ff');resumeRun();if(state==='playing')saveRunCheckpoint('postElite');sfx.upgrade()}
  function presentBossDoctrine(source,after=()=>{},award=true){if(streamlined()){enemyShots.length=0;shots.length=0;mouse.firing=false;sfx.stopCharge();player.charge=0;if(award){player.rank=Math.min(11,player.rank+1);const recovery=runRewards.consumeApexRepair(runProgression,wave);runProgression=recovery.state;if(recovery.repair)player.hp=Math.min(player.maxHp,player.hp+1)}if(runMode!=='replay'&&wave<10)runProgression=runRewards.offerPerks(runProgression,wave,`${profile.name}:${wave}:${Date.now()}`);pendingUpgrade=after;state='skilltree';renderRunPerks();show('skill-tree');requestOnboarding('doctrine');saveRunCheckpoint('doctrine',{source});sfx.upgrade();return}enemyShots.length=0;shots.length=0;mouse.firing=false;sfx.stopCharge();player.charge=0;if(award){player.rank++;if(player.skillsSpent+player.skillPoints<player.skillCap)player.skillPoints++}upgradeOpensTree=false;pendingUpgrade=after;state='skilltree';$('#tree-kicker').textContent=source;$('#tree-title').textContent=`RANK ${player.rank} // COMMIT ONE DOCTRINE NODE`;renderSkillTree();show('skill-tree');requestOnboarding('doctrine');saveRunCheckpoint('doctrine',{source});sfx.upgrade()}
  function openSkillTree(){if(!player||!['playing','upgrade'].includes(state)||streamlined()&&state==='upgrade')return;if(state==='playing'){pendingUpgrade=null;$('#tree-kicker').textContent='PILOT NEURAL MATRIX // RUN DOCTRINE';$('#tree-title').textContent='INSPECT SKILL PATHS'}state='skilltree';renderSkillTree();show('skill-tree')}
  function renderSkillTree(){
    if(streamlined()){renderRunPerks();return}$('#skill-paths').classList.remove('run-perk-screen');$('#tree-continue').textContent='CONTINUE';
    const box=$('#skill-paths'),roles={VANGUARD:'Offense',AEGIS:'Defense',VECTOR:'Handling'},append=(parent,tag,className,text)=>{const node=document.createElement(tag);node.className=className;node.textContent=text;parent.appendChild(node);return node};box.replaceChildren();
    $('#skill-points').textContent=`${player.skillPoints} Doctrine point${player.skillPoints===1?'':'s'} available · ${player.skillsSpent}/${player.skillCap} chosen · This run only`;
    const context=id=>{
      if(['v3','v5','a2','p2','p4'].includes(id)&&!player.pod.owned)return 'Takes effect after you collect a Force crystal.';
      if(['v4','p5'].includes(id)&&player.missileLevel<1)return 'Takes effect after a missile pickup.';
      if(id==='a3'&&player.bits<1)return 'Takes effect after a defense Bit pickup.';
      if(id==='a1'&&player.shield>=(bossLab?99:MAX_CAMPAIGN_SHIELDS))return 'Your shields are full; this still unlocks the Defense branches.';
      return ''
    };
    for(const path of skillPaths){
      const column=document.createElement('section'),pathOwned=path.nodes.filter(node=>player.skills[node.id]).length;column.className=`tree-path tree-${path.name.toLowerCase()}`;const heading=append(column,'h3','',roles[path.name]);append(heading,'span','tree-path-name',path.name);
      path.nodes.forEach((node,i)=>{
        const owned=!!player.skills[node.id],ready=i===0||(i<path.nodes.length-1&&player.skills[path.nodes[0].id])||(i===path.nodes.length-1&&pathOwned>=path.nodes.length-1),button=document.createElement('button'),tier=i===0?'CORE':i===path.nodes.length-1?'CAPSTONE':'BRANCH';
        const reason=owned?'LEARNED':!ready?(i===path.nodes.length-1?`Learn ${path.nodes.length-1-pathOwned} more in this path`:`Learn ${path.nodes[0].name} first`):player.skillsSpent>=player.skillCap?'RUN LIMIT REACHED':player.skillPoints<1?'NO POINTS AVAILABLE':'AVAILABLE · 1 POINT';
        button.type='button';button.className=`skill-node${owned?' owned':''}`;button.disabled=owned||!ready||player.skillPoints<1||player.skillsSpent>=player.skillCap;button.dataset.node=node.id;button.dataset.tier=tier.toLowerCase();button.dataset.state=owned?'owned':button.disabled?'locked':'available';button.title=reason;
        const meta=append(button,'span','skill-node-meta','');append(meta,'span','skill-tier',tier);append(meta,'span','skill-state',reason);append(button,'b','',node.name);append(button,'span','skill-effect',node.desc);const current=!owned&&context(node.id);if(current)append(button,'small','skill-context',current);
        button.onclick=()=>learnSkill(node);column.appendChild(button)
      });box.appendChild(column)
    }
  }
  function learnSkill(node){if(streamlined())return;if(player.skillPoints<1||player.skillsSpent>=player.skillCap||player.skills[node.id])return;acknowledgeOnboarding('doctrine');player.skillPoints--;player.skillsSpent++;player.skills[node.id]=true;node.apply();score+=150;renderSkillTree();hud();if(runSegment==='doctrine')saveRunCheckpoint('doctrine');sfx.skill()}
  function resumeRun(){state='playing';show('');const resume=pendingUpgrade;pendingUpgrade=null;upgradeOpensTree=false;if(resume)resume();if(state==='playing')resumeMusic();hud()}
  function closeSkillTree(){if(state!=='skilltree')return;if(streamlined()&&runProgression.pending==='perk'){runProgression=runRewards.skipPerk(runProgression,wave);acknowledgeOnboarding('doctrine')}resumeRun()}
  // Sector pressure rises through authored approaches rather than damage spikes.
  // Keep one-hit damage and readable tells; later sectors mix tighter formations.
  function sectorThreat(sector=wave){
    const level=clamp(Math.floor(Number(sector)||1),1,10),progress=(level-1)/9,ramp=progress*progress*(3-2*progress),index=level-1;
    const pressure=[1,1.12,1.22,1.30,1.38,1.44,1.49,1.53,1.57,1.60],fire=[1.05,.94,.88,.82,.77,.74,.71,.68,.66,.64],projectile=[.98,1.04,1.09,1.14,1.18,1.20,1.215,1.225,1.235,1.24];
    return{sector:level,progress,pressure:pressure[index],speedScale:1+ramp*.26,movementScale:1+ramp*.12,fireScale:fire[index],projectileScale:projectile[index],healthScale:1+ramp*.9,formationChance:.3+ramp*.25,turretChance:.14+ramp*.1,formationSpacing:52-ramp*10}
  }
  function hostileDamage(){return 1}
  function spawnEnemy(){
    const stage=currentStage(),stageStyle=stage.enemyStyle,threat=sectorThreat(),y=rand(100,H-100),roll=Math.random(),hpScale=threat.healthScale,speedScale=threat.speedScale,coolScale=threat.fireScale,contactDamage=hostileDamage();
    if(roll<threat.turretChance&&t>18)enemies.push({x:W+30,y,r:17,hp:5*hpScale,maxHp:5*hpScale,speed:70*speedScale,type:'turret',stageStyle,threat,phase:rand(0,6),cool:rand(.7,1.6)*coolScale,coolScale,contactDamage,c:stage.accent2});
    else if(roll<threat.turretChance+threat.formationChance){
      const formationKind=threat.sector<3?'arc':threat.sector<5?'stagger':'cross';
      for(let i=0;i<4;i++){
        const offset=formationKind==='arc'?Math.sin(i*1.4)*44:formationKind==='stagger'?(i%2?1:-1)*(24+i*6):(i<2?-1:1)*(34+i%2*18);
        const leader=threat.sector>=2&&i===0;
        enemies.push({x:W+30+i*threat.formationSpacing,y:clamp(y+offset,65,H-65),r:leader?14:10,hp:(leader?2:1)*hpScale,maxHp:(leader?2:1)*hpScale,speed:135*speedScale,type:leader?'drone':'wing',stageStyle,threat,formationKind,formationIndex:i,formationCount:4,phase:i*.6,cool:leader?rand(1.4,2.1)*coolScale:99,coolScale,contactDamage,c:leader?stage.accent2:stage.accent})
      }
    }else enemies.push({x:W+30,y,r:14,hp:2*hpScale,maxHp:2*hpScale,speed:105*speedScale,type:'drone',stageStyle,threat,phase:rand(0,6),cool:rand(1.15,2.2)*coolScale,coolScale,contactDamage,c:stage.accent2})
  }
  const LEVEL_ONE_ELITE_TIME=48,LEVEL_ONE_POST_TIME=36,STAGE_ELITE_TIME=48,STAGE_POST_ELITE_TIME=36;
  const levelOneTimeline=[
    {at:.35,kind:'cue',kicker:'MERIDIAN ENTRY',text:'ACQUIRE THE FORCE // BREAK FORMATION'},
    {at:1.2,kind:'sine',y:190,count:5},{at:4.1,kind:'sine',y:525,count:5,flip:true},
    {at:7.4,kind:'pincer',count:6},{at:10.8,kind:'guard',y:205},
    {at:14,kind:'cross',y:360,count:7},
    {at:15.4,kind:'wreck',pattern:'center'},
    {at:15.5,kind:'cue',kicker:'WRECKFIELD',text:'DEBRIS IS DESTRUCTIBLE // FORCE CAN RAM'},
    {at:17,kind:'escort',y:360,count:6},{at:20.5,kind:'pincer',count:8},
    {at:24,kind:'guard',y:515},{at:27.5,kind:'sine',y:500,count:7,flip:true},
    {at:29,kind:'wreck',pattern:'high'},
    {at:31,kind:'escort',y:310,count:8},{at:34.5,kind:'cross',y:360,count:8},
    {at:36.4,kind:'cue',kicker:'REAVER ESCORT',text:'COMMAND DRONES ARE SCREENING THE CORE'},
    {at:38,kind:'pincer',count:8},{at:42,kind:'escort',y:320,count:7},
    {at:44,kind:'cue',kicker:'HEAVY SIGNAL',text:'WRECK REAVER INBOUND'}
  ];
  const levelOnePostMiniTimeline=[
    {at:.2,kind:'cue',kicker:'COUNTERATTACK',text:'SECONDARY SWARM DETECTED'},
    {at:1,kind:'sine',y:350,count:6},{at:4.5,kind:'pincer',count:6},
    {at:8,kind:'guard',y:210},{at:11.5,kind:'cross',y:360,count:8},
    {at:15,kind:'escort',y:360,count:8},
    {at:16.1,kind:'cue',kicker:'BLOODSTAR VANGUARD',text:'TARGET COMMAND DRONES // HOLD THE LANE'},
    {at:18.5,kind:'pincer',count:8},{at:22,kind:'sine',y:180,count:8},
    {at:25.5,kind:'guard',y:480},{at:29,kind:'cross',y:330,count:8},
    {at:31.8,kind:'escort',y:420,count:7},
    {at:32.5,kind:'cue',kicker:'APEX CORRIDOR',text:'CLEAR THE LANE // MASS LOCK IMMINENT'}
  ];
  function spawnLevelOneUnit(type,x,y,role,phase=0){
    const stage=currentStage(),stats=type==='turret'?{r:17,hp:5,speed:68,cool:.9}:type==='drone'?{r:14,hp:2.5,speed:102,cool:1.45}:{r:10,hp:1,speed:138,cool:role==='lancer'?1.25:99};
    enemies.push({x,y,type,role,stageStyle:'drift',phase,r:stats.r,hp:stats.hp,maxHp:stats.hp,speed:stats.speed,cool:stats.cool,coolScale:1,contactDamage:1,c:type==='wing'?stage.accent:stage.accent2,originY:y,formationX:x,shotCycle:0,telegraphFire:type==='turret'||role==='lancer'})
  }
  function setStageCue(kicker,text,duration=3.2){stageCue={kicker,text,time:duration,max:duration}}
  function spawnMeridianWreckBeat(pattern='center'){
    const stage=currentStage(),lanes=pattern==='high'?[330,445,575,640]:pattern==='low'?[80,145,265,385]:pattern==='split'?[82,158,560,638]:[92,205,515,628];
    lanes.forEach((y,index)=>stageHazards.push({type:'debris',mine:false,x:W+90+index*78,y:y*H/720,r:index%2?20:25,speed:132+index*7,vy:(index%2?1:-1)*8,rot:index*.72,vr:(index%2?1:-1)*(1.2+index*.25),hp:index%2?3:4,life:13,phase:index*.8,color:index%2?stage.accent:stage.accent2,scripted:true}))
  }
  function spawnLevelOneBeat(beat){
    const count=beat.count||1,scaleY=H/720;
    if(beat.kind==='cue')setStageCue(beat.kicker,beat.text);
    else if(beat.kind==='wreck')spawnMeridianWreckBeat(beat.pattern);
    else if(beat.kind==='sine')for(let i=0;i<count;i++){const side=beat.flip?-1:1;spawnLevelOneUnit('wing',W+35+i*44,(beat.y+side*Math.sin(i*.9)*72)*scaleY,'sine',i*.55)}
    else if(beat.kind==='pincer')for(let i=0;i<count/2;i++){spawnLevelOneUnit('wing',W+35+i*48,(105+i*34)*scaleY,'pincerTop',i*.4);spawnLevelOneUnit('wing',W+59+i*48,H-(105+i*34)*scaleY,'pincerBottom',i*.4)}
    else if(beat.kind==='guard'){spawnLevelOneUnit('turret',W+45,beat.y*scaleY,'anchor');spawnLevelOneUnit('wing',W+92,(beat.y-58)*scaleY,'lancer',.5);spawnLevelOneUnit('wing',W+132,(beat.y+58)*scaleY,'lancer',1.1)}
    else if(beat.kind==='cross')for(let i=0;i<count;i++)spawnLevelOneUnit(i===Math.floor(count/2)?'drone':'wing',W+35+i*42,(beat.y+(i-count/2)*34)*scaleY,i===Math.floor(count/2)?'command':'cross',i*.42);
    else for(let i=0;i<count;i++)spawnLevelOneUnit(i%3===2?'drone':'wing',W+40+i*45,(beat.y+Math.sin(i*1.25)*92)*scaleY,i%3===2?'command':'escort',i*.5)
  }
  function updateLevelOneTimeline(){const post=stagePostEliteClock>=0,timeline=post?levelOnePostMiniTimeline:levelOneTimeline,clock=post?stagePostEliteClock:t;while(stageEncounterCursor<timeline.length&&timeline[stageEncounterCursor].at<=clock)spawnLevelOneBeat(timeline[stageEncounterCursor++])}
  function beginApexArrival(){stageApexIntro=4.2;stageCue=null;enemies.length=0;enemyShots.length=0;shots.length=0;stageHazards.length=0;player.inv=Math.max(player.inv,4.2);shake=9;stageFlash=.7;beginBossMusicFade();if(!bossLab&&runActive&&runMode!=='rush'&&stagePostEliteClock>=STAGE_POST_ELITE_TIME)saveRunCheckpoint('postElite')}
  function makeWeakNodes(points,totalHp){const hp=totalHp/points.length;return points.map(([dx,dy])=>({dx,dy,hp,max:hp,destroyed:false}))}
  function bossBuildHealthScale(){const laneScale=1+Math.max(0,player.gun-1)*.28,rateScale=.16/Math.max(.08,player.rate),fighterPower=player.damage*laneScale*rateScale*(1+player.critChance)*player.weakDamage,podPower=player.podDamage*player.weakDamage,buildPower=fighterPower*.78+podPower*.22;return 1+Math.min(.45,Math.max(0,buildPower-1)*.4)}
  function makeMiniBoss(){const threat=sectorThreat(),type=(wave-1)%miniBossDefs.length,def=miniBossDefs[type];miniBossSpriteFor(type).preload();const cycle=Math.floor((wave-1)/miniBossDefs.length),baseHp=type===0&&wave===1?120:110+wave*12,hp=Math.round(baseHp*Math.pow(1.12,cycle)),weakNodes=makeWeakNodes(def.weak,hp);weakNodes.forEach((node,index)=>node.miniIndex=index);miniBoss={kind:'mini',type,def,threat,x:W+110,y:H/2,anchorY:H/2,targetY:H/2,r:def.r,hp,max:hp,cool:1.15*threat.fireScale,clock:0,animOffset:rand(0,16),attackCycle:0,recoil:0,moveTimer:1.8,visualAngle:0,intro:type===0?2.6:1.5,introMax:type===0?2.6:1.5,weakOpen:false,weakTimer:type===0?.72:.85,weakTelegraph:0,weakNodes};miniBossSpawned=true;stageCue=null;stageHazards.length=0;enemies.length=0;enemyShots.length=0;player.inv=Math.max(player.inv,miniBoss.intro);shake=10;sfx.bossIntro(false)}
  // Rows retain the same hull perspective. The columns change cannon/hull
  // perspective, so cycling all sixteen as idle made the machinery chatter.
  // A returning row cycle articulates the fins without a perspective reset.
  const miniBossIdleRows=[0,1,2,3,2,1];
  // Keep the reactor axis fixed as the authored armor and fins articulate.
  // Atlas cell centers are not anatomical roots; several sheets drift between rows.
  const miniBossRootCenters=miniBossCoreTracks.map(frames=>frames.reduce((root,points)=>[root[0]+points[1][0]/frames.length,root[1]+points[1][1]/frames.length],[0,0]));
  function miniBossFrame(e){
    const step=Math.floor(e.clock*e.def.rate*.5+(e.animOffset||0));
    return miniBossIdleRows[((step%miniBossIdleRows.length)+miniBossIdleRows.length)%miniBossIdleRows.length]*4
  }
  function miniBossFrameRegistration(e){
    const point=miniBossCoreTracks[e.type]?.[miniBossFrame(e)]?.[1],root=miniBossRootCenters[e.type];
    return point&&root?{dx:root[0]-point[0],dy:root[1]-point[1]}:{dx:0,dy:0}
  }
  function miniBossAttackIntent(e){
    const progress=e.intro>0?0:clamp(1-Math.max(0,e.cool)/.24,0,1);
    return progress*progress*(3-2*progress)
  }
  function miniBossRecoilOffset(e){
    const age=e.clock-(e.lastShotClock??-10),phase=age/.055;
    // Carry the anticipation offset through the trigger before the kick rises.
    return age<0||age>.55?0:5.2*phase*Math.exp(1-phase)-1.8*Math.exp(-phase)
  }
  function miniBossNodeOffset(e,node){
    const index=node.miniIndex??0,frame=miniBossFrame(e),point=miniBossCoreTracks[e.type]?.[frame]?.[index];
    return point?{dx:point[0],dy:point[1]}:{dx:node.dx,dy:node.dy}
  }
  const miniBossRouteProfiles=[
    {lanes:[.32,.68,.43,.59,.5],x:[-18,12,-6,18,0],pace:1,hold:0},
    {lanes:[.35,.65,.4,.6,.5],x:[-10,10,-14,12,0],pace:.96,hold:.1},
    {lanes:[.29,.68,.43,.61,.5],x:[-24,15,-12,20,0],pace:1.12,hold:.05},
    {lanes:[.38,.62,.5,.32,.68],x:[16,-18,8,-12,0],pace:.94,hold:.08},
    {lanes:[.43,.57,.5,.38,.62],x:[-9,8,-5,10,0],pace:1.1,hold:.18},
    {lanes:[.36,.64,.42,.58,.5],x:[-22,15,-16,18,0],pace:1.06,hold:.08},
    {lanes:[.32,.55,.68,.45,.5],x:[-12,12,-18,10,0],pace:1.02,hold:.12},
    {lanes:[.3,.66,.4,.6,.5],x:[14,-18,10,-12,0],pace:.96,hold:.02},
    {lanes:[.3,.7,.5,.38,.62],x:[-22,20,-12,16,0],pace:1.06,hold:.08},
    {lanes:[.38,.62,.46,.54,.5],x:[-12,10,-8,12,0],pace:1.08,hold:.16}
  ];
  function updateMiniBossMovement(e,dt){
    if(e.muzzleFlares)e.muzzleFlares=e.muzzleFlares.filter(f=>(f.time-=dt)>0);
    if(dt<=0)return;
    e.clock+=dt;e.recoil=Math.max(0,e.recoil-dt*4.5);e.coreAperture=(e.coreAperture||0)+((e.weakOpen?1:0)-(e.coreAperture||0))*(1-Math.exp(-dt*18));
    if(!e.flight){
      const entering=e.intro>0;
      e.flight={phase:entering?'entry':'hold',time:0,duration:entering?(e.introMax||e.intro):0,fromX:e.x,fromY:e.y,toX:W-164,toY:H*.5,leg:0,rest:.85+e.type*.035,vx:0,vy:0}
    }
    const flight=e.flight,route=miniBossRouteProfiles[e.type]||miniBossRouteProfiles[0],movementScale=e.threat?.movementScale||1,oldX=e.x,oldY=e.y,age=e.clock-(e.lastShotClock??-10),intent=miniBossAttackIntent(e),firing=age>=0&&age<.5?Math.exp(-age/.2):0;
    let remaining=dt;
    // Carry the unused frame time through lane boundaries instead of slowly
    // changing the route cadence on displays with different refresh rates.
    for(let transition=0;remaining>1e-9&&transition<4;transition++){
      if(flight.phase==='hold'){
        const wait=Math.max(0,flight.rest-flight.time),step=Math.min(remaining,wait);
        flight.time+=step;remaining-=step;
        if(flight.time+1e-9<flight.rest||e.cool<=.24||firing>=.35){flight.time+=remaining;break}
        const lane=route.lanes[flight.leg%route.lanes.length],weight=clamp((e.def.flex-3.2)/2,0,1);
        flight.phase='travel';flight.time=0;flight.fromX=e.x;flight.fromY=e.y;
        flight.toX=W-164+route.x[flight.leg%route.x.length]*(.65+weight*.35);
        flight.toY=clamp(H*lane*.82+player.y*.18,112,H-112);
        flight.duration=(1.3+(1-weight)*.26+Math.abs(flight.toY-e.y)/360)*route.pace/movementScale;flight.leg++
      }else{
        // Decelerate through the aim/fire beat; continue the route after recoil.
        const throttle=flight.phase==='entry'?1:1-Math.max(intent,firing)*.7,step=Math.min(remaining,Math.max(0,flight.duration-flight.time)/throttle);
        flight.time=Math.min(flight.duration,flight.time+step*throttle);remaining-=step;
        const u=clamp(flight.time/flight.duration,0,1),ease=u*u*u*(10+u*(-15+u*6));
        e.x=flight.fromX+(flight.toX-flight.fromX)*ease;e.y=flight.fromY+(flight.toY-flight.fromY)*ease;
        if(u>=1-1e-9){flight.phase='hold';flight.time=0;flight.rest=(.85+(1-clamp((e.def.flex-3.2)/2,0,1))*.45+route.hold)/movementScale}else break
      }
    }
    flight.vx=(e.x-oldX)/dt;flight.vy=(e.y-oldY)/dt;
    const bank=settings.reducedMotion?0:clamp(-flight.vy*.00072,-.065,.065);
    e.visualAngle=(e.visualAngle||0)+(bank-(e.visualAngle||0))*(1-Math.exp(-dt*7))
  }
  const miniBossMuzzleOffsets=[[-58,8],[-66,8],[-64,3],[-59,8],[-65,8],[-35,6],[-59,8],[-33,5],[-48,16],[-62,5]];
  function miniBossMuzzle(e,side=0){
    if(side&&e.weakNodes?.[side<0?0:2]?.destroyed)side=0;
    const frames=miniBossCoreTracks[e.type],root=frames[miniBossFrame(e)][1],reference=frames[0][1],local=side?miniBossNodeOffset(e,{miniIndex:side<0?0:2}):{dx:miniBossMuzzleOffsets[e.type][0]+root[0]-reference[0],dy:miniBossMuzzleOffsets[e.type][1]+root[1]-reference[1]},pose=enemyRenderPose(e),motion=bossSpriteMotion(e),dx=local.dx*pose.scaleX*motion.x,dy=local.dy*pose.scaleY*motion.y,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle);
    return{x:pose.x+dx*cos-dy*sin,y:pose.y+dx*sin+dy*cos,dx:local.dx,dy:local.dy}
  }
  function miniBossAttack(e){
    e.recoil=1;e.muzzleFlares=[];
    const aimed=(count,spread,speed,offsetY=0)=>{const side=Math.sign(offsetY),part=side<0?'upper':side>0?'lower':undefined;if(part&&encounterWeaponContext?.parts.some(p=>p.id===part&&p.destroyed))return;const port=miniBossMuzzle(e,side);e.muzzleFlares.push({side,dx:port.dx,dy:port.dy,time:.1});withEncounterPort(part,()=>fireFan({x:port.x+12,y:port.y},count,spread,speed))},homing=(count)=>{const port=miniBossMuzzle(e);e.muzzleFlares.push({side:0,dx:port.dx,dy:port.dy,time:.1});fireHoming({x:port.x+15,y:port.y},count)};
    e.attackCycle++;switch(e.type){
      case 0:if(e.attackCycle%3===1)aimed(5,.13,205);else if(e.attackCycle%3===2){aimed(3,.2,185,-30);aimed(3,.2,185,30)}else fireRing(e,8,155,e.attackCycle*.31);e.cool=e.attackCycle%3===0?1.4:1.08;break;
      case 1:aimed(3,.14,205,-26);aimed(3,.14,205,26);e.cool=1.22;break;
      case 2:homing(2);e.cool=1.5;break;
      case 3:fireRing(e,8,165,e.attackCycle*.23);if(e.attackCycle%2===0)aimed(3,.15,220);e.cool=1.2;break;
      case 4:fireRing(e,10,175,e.attackCycle*.19);e.cool=1.08;break;
      case 5:aimed(4,.12,220,-24);aimed(4,.12,220,24);e.cool=.96;break;
      case 6:homing(1);aimed(3,.18,205);e.cool=1.28;break;
      case 7:aimed(7,.105,230);e.cool=1.08;break;
      case 8:fireRing(e,8,e.attackCycle%2?155:215,e.attackCycle*.27);e.cool=.94;break;
      default:if(e.attackCycle%3===0)homing(2);else if(e.attackCycle%3===1)aimed(7,.1,235);else fireRing(e,10,185,e.attackCycle*.2);e.cool=.9;break
    }e.lastShotClock=e.clock;e.recoil=1;finishEncounterAttack(e)
  }
  const emitMiniBossAttack=miniBossAttack;
  miniBossAttack=function(e){return withEncounterWeapons(e,()=>emitMiniBossAttack(e))};
  function makeEpicBoss(epicId,replacedType){
    const threat=sectorThreat(),def=epicBossTypes[epicId],cycleScale=Math.pow(1.2,Math.floor((wave-1)/10)),buildScale=bossLab?1:bossBuildHealthScale(),hp=Math.round(def.hp*cycleScale*buildScale),weakNodesByPhase=def.weak.map(points=>makeWeakNodes(points,hp*.25).map((node,index)=>({...node,epicIndex:index})));prefetchStageAssets(false);preloadBossAssets(epicId===0?9:8);
    boss={kind:'boss',type:10+epicId,epic:true,epicId,replacedType,def,threat,x:W+150,y:H/2,r:82,hp,max:hp,baseHp:def.hp,cycleScale,buildScale,phase:1,cool:1.45*threat.fireScale,clock:0,intro:3,phaseFlash:0,attackAngle:0,attackCycle:0,moveTimer:1,targetY:H/2,weakOpen:false,weakTimer:1,weakNodesByPhase,ritual:null,hidden:false,toxinProtected:true,toxinTick:.7,epicBuffs:0,laser:null};
    stageHazards.length=0;enemies.length=0;enemyShots.length=0;shots.length=0;epicHeavies=[];playEpicBossMusic();shake=22
  }
  function makeBoss(){const threat=sectorThreat(),type=(wave-1)%bossTypes.length,def=bossTypes[type],cycle=Math.floor((wave-1)/bossTypes.length),cycleScale=Math.pow(1.2,cycle),buildScale=bossLab?1:bossBuildHealthScale(),hp=Math.round(def.hp*cycleScale*buildScale),weakNodes1=makeWeakNodes(def.weak1,hp*.5),weakNodes2=makeWeakNodes(def.weak2,hp*.5);prefetchStageAssets(false);preloadBossAssets(type);if(type===0){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>{node.bloodstarIndex=index;node.tentacleIndex=index>=2?index-2:-1})}else if(type===1){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.twinMawIndex=index)}else if(type===2){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.helixIndex=index)}else if(type===3){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.riftIndex=index)}else if(type===4){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.ironBloomIndex=index)}else if(type===5){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.voidLeviathanIndex=index)}else if(type===6){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.prismWardenIndex=index)}else if(type===7){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.gravebellIndex=index)}else if(type===8){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.solarHydraIndex=index)}else if(type===9){for(const nodes of[weakNodes1,weakNodes2])nodes.forEach((node,index)=>node.omegaHeartIndex=index)}boss={kind:'boss',type,def,threat,x:W+120,y:H/2,r:74,hp,max:hp,baseHp:def.hp,cycleScale,buildScale,phase:1,cool:1.5*threat.fireScale,clock:0,intro:2.4,phaseFlash:0,attackAngle:0,attackCycle:0,moveTimer:1,targetY:H/2,chargeWindow:0,voidAnimTimer:rand(3.4,5.6),voidAnimWindow:0,voidAnimDuration:2.8,mawRecoil:0,mawDamageKick:0,mawDamageSide:0,helixRecoil:0,helixDamageKick:0,helixDamageSide:0,riftRecoil:0,riftDamageKick:0,riftDamageSlot:0,riftWarp:0,riftWarpDir:1,ironRecoil:0,ironCycle:0,ironDamageKick:0,ironDamageSlot:0,prismRecoil:0,gravebellRecoil:0,solarHydraRecoil:0,omegaHeartRecoil:0,laser:null,weakOpen:false,weakTimer:1.1,weakNodes1,weakNodes2};enemies.length=0;enemyShots.length=0;shots.length=0;playBossMusic(wave);shake=14}
  const makeNormalBoss=makeBoss;
  makeBoss=function(){stageHazards.length=0;if(!bossLab&&runEpicEncounter&&!runEpicEncounter.used&&runEpicEncounter.wave===wave){runEpicEncounter.used=true;return makeEpicBoss(runEpicEncounter.id,(wave-1)%bossTypes.length)}return makeNormalBoss()}
  let encounterWeaponContext=null;
  function encounterWeaponState(e){
    const nodes=activeWeakNodes(e),definition=window.StarfighterEncounterTactics.describe({...e,nodeCount:nodes.length});
    const parts=window.StarfighterEncounterTactics.status(definition,nodes).map(part=>{
      const points=part.indices.filter(index=>nodes[index]).map(index=>worldWeakNode(e,nodes[index])),count=points.length||1;
      const x=points.reduce((sum,p)=>sum+p.x,0)/count-e.x,y=points.reduce((sum,p)=>sum+p.y,0)/count-e.y;
      return{...part,x,y,angle:Math.atan2(y,x)}
    });return{...definition,parts,enemy:e,port:undefined}
  }
  function withEncounterWeapons(e,fire){const previous=encounterWeaponContext;encounterWeaponContext=encounterWeaponState(e);try{return fire()}finally{encounterWeaponContext=previous}}
  function withEncounterPort(part,fire){if(!encounterWeaponContext)return fire();const previous=encounterWeaponContext.port;encounterWeaponContext.port=part;try{return fire()}finally{encounterWeaponContext.port=previous}}
  function encounterAllowsShot(family,index,count,options={}){
    const context=encounterWeaponContext;if(!context||!context.parts.length)return true;
    let parts=context.parts,part;
    if(context.port!==undefined)return !parts.some(p=>p.id===context.port&&p.destroyed);
    const enemy=context.enemy;
    if(family==='fan'&&enemy.kind==='boss'&&!enemy.epic){
      const explicit=enemy.type===1&&options.offsetY?context.fanPorts[options.offsetY<0?'upper':'lower']:enemy.type===8&&enemy.phase===1?context.fanPorts[options.offsetY<0?'upper':options.offsetY>0?'lower':'middle']:null;
      if(explicit)return !parts.some(p=>p.id===explicit&&p.destroyed)
    }
    // Omit authored packets; never recompute a spread using a smaller count.
    // Central/core packets remain a threat after supporting weapons are lost.
    if(family==='ring'){
      if(index===0)return true;
      const distance=p=>Math.abs(Math.atan2(Math.sin(options.angle-p.angle),Math.cos(options.angle-p.angle)));
      part=parts.reduce((best,p)=>distance(p)<distance(best)?p:best,parts[0])
    }else if(family==='homing'){
      if(index===0)return true;part=parts[(index-1+(enemy.attackCycle||0))%parts.length]
    }else{
      if(family==='rain'&&context.rainParts)parts=parts.filter(p=>context.rainParts.includes(p.id));
      if(!parts.length)return true;
      const horizontal=family==='rain',axis=horizontal?'x':'y';parts=[...parts].sort((a,b)=>a[axis]-b[axis]);
      if(index===Math.floor(count/2))return true;
      const position=family==='wall'?options.y/H:count<=1?.5:index/(count-1);
      part=parts[Math.min(parts.length-1,Math.floor(clamp(position,0,1)*parts.length))]
    }
    return !part?.destroyed
  }
  function encounterTactic(e){return trainingSession?'BREAK EMBEDDED CORES // ARMOR TAKES 25%':window.StarfighterEncounterTactics.describe(e)?.tactic.toUpperCase()||'BREAK EMBEDDED CORES // ARMOR TAKES 25%'}
  function encounterBeamDisabled(e){const weapons=encounterWeaponState(e);return !!weapons.beamPart&&weapons.parts.some(part=>part.id===weapons.beamPart&&part.destroyed)}
  function noteEncounterWeaponBreak(e,before){
    if(trainingSession)return;
    const after=encounterWeaponState(e),lost=after.parts.filter(part=>part.destroyed&&!before.parts.some(old=>old.id===part.id&&old.destroyed));
    if(lost.length)e.tacticalNotice={text:`${lost.map(part=>part.label).join(' + ').toUpperCase()} DISABLED`,until:e.clock+2.5,phase:e.phase||1};
    if(after.beamPart&&after.parts.some(part=>part.id===after.beamPart&&part.destroyed))e.laser=null
  }
  function queuePressureLance(e,side=0,offsetY=0){
    const threat=e.threat||sectorThreat();if(threat.sector<2||e.intro>0||e.phaseTransition>0||e.hidden||e.ritual||e.dead||e.hp<=0)return false;
    const port=e.kind==='mini'?miniBossMuzzle(e,side):{x:e.x-10,y:e.y+offsetY},targetX=player.x,targetY=player.y,speed=Math.min(275,235+threat.sector*4),angle=Math.atan2(targetY-port.y,targetX-port.x);
    enemyShots.push({x:port.x,y:port.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:4.5,damage:hostileDamage(),speed,piercing:true,pressureLance:true,warn:.65,warnMax:.65,targetX,targetY,owner:e,portSide:side,portOffsetY:offsetY});
    if(!player.amberFireSeen){player.amberFireSeen=true;systemToast('AMBER FIRE PIERCES FORCE // MOVE TO EVADE','#ffd166')}return true
  }
  function finishEncounterAttack(e){
    const threat=e.threat||sectorThreat(),floor=e.kind==='mini'?.55:.24;e.cool=Math.max(floor,e.cool*Math.min(1,threat.fireScale));
    if(e.kind==='boss'&&!e.epic&&(e.type===3||e.type===4))e.attackAnimationCycle=Object.freeze({phase:e.phase,period:e.cool,clock:e.clock});
    if(e.attackCycle%3===0)queuePressureLance(e)
  }
  function enemyFire(e,spread=0){const threat=e.threat||sectorThreat(),a=Math.atan2(player.y-e.y,player.x-e.x)+spread,speed=190*threat.projectileScale;enemyShots.push({x:e.x-10,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:5,damage:hostileDamage()});e.pressureCycle=(e.pressureCycle||0)+1;if((e.type==='drone'||e.type==='turret')&&e.pressureCycle%3===0)queuePressureLance(e);sfx.enemyShot(e.kind==='boss'||e.kind==='mini')}
  function enemyFireAngle(e,a,speed=190,r=5){enemyShots.push({x:e.x-10,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r,damage:hostileDamage()})}
  function fireFrom(x,y,a,speed=190,r=5,extra={}){enemyShots.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r,damage:hostileDamage(),...extra})}
  function fireFan(e,count,spread=.12,speed=195,offsetY=0){const y=e.y+offsetY,base=Math.atan2(player.y-y,player.x-e.x);for(let i=0;i<count;i++)if(encounterAllowsShot('fan',i,count,{offsetY}))fireFrom(e.x-12,y,base+(i-(count-1)/2)*spread,speed);sfx.enemyShot(true)}
  function fireRing(e,count=10,speed=175,offset=0){for(let i=0;i<count;i++){const angle=offset+i*Math.PI*2/count;if(encounterAllowsShot('ring',i,count,{angle}))fireFrom(e.x,e.y,angle,speed)}sfx.enemyShot(true)}
  function fireWall(gapY,speed=190){
    const threat=(boss||miniBoss)?.threat||sectorThreat(),owner=boss||miniBoss,offset=Math.min(130,105+Math.max(0,threat.sector-2)*5),side=(owner?.attackCycle||0)%2?1:-1;
    let target=gapY+side*offset;if(target<105||target>H-105)target=gapY-side*offset;const safeGap=clamp(target,105,H-105),gapHalf=70;
    let slot=0;const count=Math.ceil((H-45)/42);for(let y=45;y<H;y+=42,slot++)if(Math.abs(y-safeGap)>gapHalf&&encounterAllowsShot('wall',slot,count,{y}))fireFrom(W+12,y,Math.PI,speed,6,{warn:.8,warnMax:.8,wall:true,piercing:true,gapY:safeGap,gapHalf});sfx.enemyShot(true)
  }
  function updateHostileShot(b,dt){
    b.px=b.x;b.py=b.y;if(b.dead)return;
    if(b.warn>0){
      const owner=b.owner;
      if(owner){
        const active=owner.kind==='mini'?miniBoss===owner:owner.kind==='boss'?boss===owner:enemies.includes(owner);
        if(!active||owner.dead||owner.hp<=0||owner.phaseTransition>0||owner.hidden||owner.ritual){b.dead=true;return}
        const port=owner.kind==='mini'?miniBossMuzzle(owner,b.portSide||0):{x:owner.x-10,y:owner.y+(b.portOffsetY||0)};
        b.x=port.x;b.y=port.y;b.px=b.x;b.py=b.y;
      }
      const remaining=b.warn;b.warn=Math.max(0,remaining-dt);
      if(b.warn>0)return;
      dt=Math.max(0,dt-remaining);
      if(b.pressureLance){const angle=Math.atan2(b.targetY-b.y,b.targetX-b.x);b.vx=Math.cos(angle)*b.speed;b.vy=Math.sin(angle)*b.speed}
      b.owner=null;
    }
    if(b.homing){const speed=Math.hypot(b.vx,b.vy),current=Math.atan2(b.vy,b.vx),target=Math.atan2(player.y-b.y,player.x-b.x),turn=Math.atan2(Math.sin(target-current),Math.cos(target-current)),a=current+clamp(turn,-b.homing*dt,b.homing*dt);b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed}
    b.x+=b.vx*dt;b.y+=b.vy*dt
  }
  function fireRain(speed=205){let slot=0;const count=Math.ceil((W-30-260)/82);for(let x=260;x<W-30;x+=82,slot++){const px=x+rand(-20,20),angle=Math.PI/2+rand(-.08,.08);if(encounterAllowsShot('rain',slot,count))fireFrom(px,-12,angle,speed,6)}sfx.enemyShot(true)}
  function fireHoming(e,count=3){const base=Math.atan2(player.y-e.y,player.x-e.x);for(let i=0;i<count;i++)if(encounterAllowsShot('homing',i,count))fireFrom(e.x-15,e.y,base+(i-(count-1)/2)*.2,125,8,{homing:1.25});sfx.enemyShot(true)}
  function beginEpicRitual(b){
    const count=5-b.phase,positions=[[185,115],[W-185,115],[185,H-115],[W-185,H-115]].sort(()=>Math.random()-.5).slice(0,count),active=Math.floor(Math.random()*count),duration=10-b.phase,hp=Math.round((70+b.phase*28)*b.buildScale);
    epicHeavies=positions.map(([x,y],index)=>({x,y,r:31,hp,max:hp,active:index===active,dead:false,clock:index*.8,cool:.7+index*.16,color:b.epicId?'#78ff56':'#e45cff'}));b.ritual={phase:b.phase,timer:duration,max:duration,finishing:0,result:null};b.hidden=true;b.weakOpen=false;b.x=W+220;enemyShots.length=0;shots.length=0;shake=20;sfx.phase()
  }
  function finishEpicRitual(b,success){
    const ritual=b.ritual;if(!ritual||ritual.result!==null)return;ritual.result=success;ritual.finishing=.9;
    if(success){b.epicBuffs++;player.dose=100;grantShield();player.lootSurge=Math.max(player.lootSurge,8);if(runStats&&!bossLab){runStats.ritualsWon++;runStats.buffsEarned++}const toast=$('#loot-toast');toast.className='loot-toast show rarity-rare';toast.textContent='RITUAL BROKEN // DELTA PRIMED + WARD + SURGE';lootToastTimer=3;sfx.powerup()}
    else{if(runStats&&!bossLab)runStats.ritualsFailed++;const toast=$('#loot-toast');toast.className='loot-toast show rarity-superrare';toast.textContent='RITUAL FAILED // ATMOSPHERE LETHAL';lootToastTimer=3;sfx.hurt()}
    for(const heavy of epicHeavies)if(!heavy.dead){heavy.dead=true;particlesAt(heavy.x,heavy.y,heavy.color,18,190)}
  }
  function resumeEpicPhase(b){
    const success=b.ritual?.result===true;b.phase++;b.ritual=null;b.hidden=false;b.x=W+150;b.y=H/2;b.intro=1.45;b.phaseFlash=2.2;b.weakOpen=false;b.weakTimer=.75;b.cool=.9;b.attackAngle=0;b.attackCycle=0;b.toxinProtected=success;b.toxinTick=.68;epicHeavies=[];enemyShots.length=0;shots.length=0;player.inv=Math.max(player.inv,1.4);shake=24;sfx.phase()
  }
  function updateEpicRitual(b,dt){
    const ritual=b.ritual;if(!ritual)return;for(const heavy of epicHeavies){heavy.clock+=dt;if(!heavy.active||heavy.dead)continue;heavy.cool-=dt;if(heavy.cool<=0){fireFan(heavy,3,.18,185+ritual.phase*16);heavy.cool=Math.max(.48,1.15-ritual.phase*.13)}
      for(const shot of shots){if(shot.dead||!sweptHit(shot,heavy))continue;const dealt=Math.min(heavy.hp,shot.d);heavy.hp-=dealt;if(runStats&&!bossLab)runStats.damageDealt+=dealt;if(shot.pierce>0){shot.pierce--;shot.x=heavy.x+(shot.vx<0?-1:1)*(heavy.r+shot.r+2);shot.px=shot.x}else shot.dead=true;particlesAt(shot.x,shot.y,heavy.color,5,95)}
      if(player.pod.owned&&hit(player.pod,heavy)){const dealt=Math.min(heavy.hp,22*player.podDamage*dt);heavy.hp-=dealt;if(runStats&&!bossLab)runStats.damageDealt+=dealt;addDose(dealt*.035)}
      if(heavy.hp<=0){heavy.dead=true;particlesAt(heavy.x,heavy.y,'#ffffff',36,260);debrisAt(heavy.x,heavy.y,heavy.color,20,1.25);finishEpicRitual(b,true)}
    }
    if(ritual.result===null){ritual.timer-=dt;if(ritual.timer<=0)finishEpicRitual(b,false)}else{ritual.finishing-=dt;if(ritual.finishing<=0)resumeEpicPhase(b)}
  }
  function epicBossAttack(b){
    const p=b.phase,pattern=b.attackCycle++%5,speed=190+p*18;
    if(b.epicId===0){if(pattern===0)fireRing(b,8+p*2,speed,b.attackAngle);else if(pattern===1)fireFan(b,5+p*2,.1,speed+25);else if(pattern===2)fireHoming(b,1+p);else if(pattern===3)fireWall(player.y,speed);else{fireRing(b,6+p,speed-35,b.attackAngle);fireFan(b,3+p,.14,speed+35)}}
    else{if(pattern===0)fireRain(speed);else if(pattern===1)fireFan(b,4+p*2,.11,speed+20);else if(pattern===2){fireRing(b,7+p*2,speed-20,b.attackAngle);fireRing(b,5+p,speed+45,b.attackAngle+.2)}else if(pattern===3)fireHoming(b,1+p);else fireWall(player.y,speed+15)}
    b.attackAngle+=.21+p*.045;b.cool=Math.max(.32,1.12-(p-1)*.2)
  }
  const emitEpicBossAttack=epicBossAttack;
  epicBossAttack=function(e){return withEncounterWeapons(e,()=>emitEpicBossAttack(e))};
  function updateEpicToxin(b,dt){
    if(b.phase<2||b.toxinProtected||b.ritual)return;b.toxinTick-=dt;if(b.toxinTick>0)return;b.toxinTick=.62;const loss=Math.min(player.hp,Math.max(1,Math.ceil(player.maxHp*.42)));player.hp=Math.max(0,player.hp-loss);player.inv=0;if(runStats&&!bossLab)runStats.damageTaken+=loss;shake=18;particlesAt(player.x,player.y,b.epicId?'#72ff4d':'#e45cff',24,220);sfx.hurt();noteCombatLoss({kind:'toxin'});hud();if(player.hp<=0)over()
  }
  function updateEpicBossFight(b,dt){
    b.clock+=dt;b.hitFlash=Math.max(0,(b.hitFlash||0)-dt);b.phaseFlash=Math.max(0,(b.phaseFlash||0)-dt);if(b.ritual){updateEpicRitual(b,dt);return}
    updateEpicBossMovement(b,dt);
    if(b.intro>0){b.intro-=dt;b.weakOpen=false;armoredHits(b,b.def.c1,dt);return}updateEpicToxin(b,dt);if(state!=='playing')return;
    const threshold=b.max*(1-b.phase*.25);
    b.cool-=dt;updateWeakPoint(b,dt);if(b.cool<=0)epicBossAttack(b);armoredHits(b,b.phase===1?b.def.c1:b.def.c2,dt);if(b.hp>threshold+.001&&hit(b,player))damage(Math.min(3,1+Math.floor(b.phase/2)),{kind:'contact',boss:true});if(state!=='playing')return;
    if(b.hp<=threshold+.001){if(b.phase<4)beginEpicRitual(b);else handleBossDefeat(b)}
  }
  function bossMotionTempo(b){return b.intro>0?1:(b.queuedAttack||b.cool<.3) ? .42 : 1}
  function bossPathPhase(b,key,rate,dt){
    const response=b.intro>0?1:b.threat?.movementScale||1;
    if(!Number.isFinite(b[key]))b[key]=Math.max(0,b.clock-dt)*rate;
    b[key]+=dt*rate*bossMotionTempo(b)*response;return b[key]
  }
  function followBossPath(b,targetX,targetY,rateX,rateY,dt,maxSpeed=380){
    if(dt<=0)return;
    const oldX=b.x,oldY=b.y,response=b.intro>0?1:b.threat?.movementScale||1,limit=maxSpeed*dt;
    const dx=(targetX-b.x)*(1-Math.exp(-rateX*response*dt)),dy=(clamp(targetY,82,H-82)-b.y)*(1-Math.exp(-rateY*response*dt)),distance=Math.hypot(dx,dy),scale=distance>limit?limit/distance:1;
    b.x+=dx*scale;b.y+=dy*scale;b.motionVX=(b.x-oldX)/dt;b.motionVY=(b.y-oldY)/dt;
    const bankLimit=b.epic ? .004 : ([.026,.025,.025,.025,.012,.006,.008,.004,.006,.003][b.type]||.012),bank=settings.reducedMotion?0:clamp(-b.motionVY*.00012,-bankLimit,bankLimit);
    b.visualAngle=(b.visualAngle||0)+(bank-(b.visualAngle||0))*(1-Math.exp(-dt*7))
  }
  function updateEpicBossMovement(b,dt){
    const phaseX=bossPathPhase(b,'motionPhaseX',.46,dt),phaseY=bossPathPhase(b,'motionPhaseY',.45+b.phase*.08,dt);
    followBossPath(b,W-166+Math.sin(phaseX)*18,H/2+Math.sin(phaseY)*(92+b.phase*11),1.05,1.5,dt)
  }
  function updateBossMovement(b,dt){
    if(dt<=0)return;
    const p=b.phase,homeX=W-(p===1?138:158),phase=(key,rate)=>bossPathPhase(b,key,rate,dt);
    let targetX=homeX,targetY=H/2,rateX=1.2,rateY=2.2,maxSpeed=380;
    // Accumulated phases retain continuity when an encounter changes tempo.
    // Each hull keeps its authored pendulum, orbit, relocation or lunge path.
    switch(b.type){
      // The first apex steadies during exposure so a charged shot has time to
      // reach its native cores. Keep attack, animation and opening clocks live.
      case 0:targetY+=Math.sin(phase('motionPhaseY',(p===1?.72:1.18)*(b.weakOpen?.5:1)))*(p===1?142:168);rateX=.78;rateY=p===1?2.2:2.75;break;
      case 1:targetX+=Math.cos(phase('motionPhaseX',1.1))*42;targetY+=Math.sin(phase('motionPhaseY',p===1?.95:1.45))*175;rateX=1.2;rateY=2.4;break;
      case 2:{const rate=p===1?.8:1.3;targetX+=Math.cos(phase('motionPhaseX',rate))*55;targetY+=Math.sin(phase('motionPhaseY',rate))*155;rateX=1.3;rateY=2.35;break}
      case 3:b.moveTimer-=dt;if(b.moveTimer<=1e-9){b.targetY=rand(85,H-85);b.moveTimer+=p===1?2.35:1.35;particlesAt(b.x,b.y,'#4ef5ff',24,150)}targetY=b.targetY;rateX=1.8;rateY=p===1?3.4:6;maxSpeed=420;break;
      case 4:targetX+=Math.sin(phase('motionPhaseX',.8))*24;targetY+=Math.sin(phase('motionPhaseY',p===1?.5:.82))*55;rateX=1;rateY=1.65;break;
      case 5:{
        b.moveTimer-=dt;if(b.moveTimer<=1e-9){b.chargeWindow=Math.max(0,1.35+Math.min(0,b.moveTimer));b.moveTimer+=p===1?4.2:2.8}
        else if(b.chargeWindow>0)b.chargeWindow=Math.max(0,b.chargeWindow-dt);
        if(b.voidAnimWindow>0)b.voidAnimWindow=Math.max(0,b.voidAnimWindow-dt);else{b.voidAnimTimer-=dt;if(b.voidAnimTimer<=0){b.voidAnimDuration=rand(2.65,3.15);b.voidAnimWindow=b.voidAnimDuration;b.voidAnimTimer=rand(5.8,8.6)}}
        const progress=b.chargeWindow>0?1-clamp(b.chargeWindow/1.35,0,1):1,lungeEase=b.chargeWindow>0?Math.sin(progress*Math.PI)**2:0;
        targetX=homeX+(W*.56-homeX)*lungeEase;targetY=clamp(player.y,120,H-190);rateX=b.chargeWindow>0?3.6:1.4;rateY=p===1?.75:1.35;maxSpeed=420;break
      }
      case 6:targetX+=-28+Math.cos(phase('motionPhaseX',p===1?.46:.62))*16;targetY+=Math.sin(phase('motionPhaseY',p===1?.48:.7))*(p===1?138:158);rateX=1.15;rateY=1.7;break;
      case 7:targetX+=-18+Math.sin(phase('motionPhaseX',p===1?.31:.39))*12;targetY+=Math.sin(phase('motionPhaseY',p===1?.34:.46))*(p===1?96:108);rateX=.9;rateY=1.4;break;
      case 8:targetX+=-24+Math.sin(phase('motionPhaseX',p===1?.4:.5))*18;targetY+=Math.sin(phase('motionPhaseY',p===1?.46:.64))*(p===1?118:142);rateX=.95;rateY=1.6;break;
      case 9:targetX+=-30+Math.sin(phase('motionPhaseX',p===1?.32:.4))*12;targetY+=Math.sin(phase('motionPhaseY',p===1?.36:.48))*(p===1?92:108);rateX=.82;rateY=1.3;break;
      default:targetY+=Math.sin(phase('motionPhaseY',1))*155
    }
    followBossPath(b,targetX,targetY,rateX,rateY,dt,maxSpeed)
  }
  function bossAttack(b){const p=b.phase;b.attackCycle++;switch(b.type){case 0:if(p===1){fireFan(b,5,.14,205);b.cool=.9}else{fireRing(b,12,185,b.attackAngle);b.attackAngle+=.24;b.cool=.62}break;case 1:b.mawRecoil=1;fireFan(b,p===1?3:5,p===1?.16:.11,p===1?195:225,-38);fireFan(b,p===1?3:5,p===1?.16:.11,p===1?195:225,38);b.cool=p===1?1.15:.72;break;case 2:if(p===1){fireRing(b,8,165,b.attackAngle);b.attackAngle+=.35;b.cool=.95}else{for(let i=0;i<4;i++){const angle=b.attackAngle+i*Math.PI/2;if(encounterAllowsShot('ring',i,4,{angle}))fireFrom(b.x,b.y,angle,215);}sfx.enemyShot(true);b.attackAngle+=.28;b.cool=.24}break;case 3:if(p===1){fireFan(b,7,.105,235);b.cool=1.3}else{fireWall(player.y,210);b.cool=1.25}break;case 4:b.ironRecoil=1;b.ironCycle=0;fireRing(b,p===1?12:16,p===1?155:185,b.attackAngle);if(p===2)fireRing(b,8,245,b.attackAngle+Math.PI/8);b.attackAngle+=.2;b.cool=p===1?1.05:.86;break;case 5:if(p===1){fireHoming(b,2);b.cool=1.35}else{fireFan(b,7,.12,265);b.cool=.58}break;case 6:b.prismRecoil=1;if(p===1){fireFan(b,7,.1,215);b.cool=1}else{fireRing(b,8,165,b.attackAngle);fireRing(b,8,235,b.attackAngle+Math.PI/8);b.attackAngle+=.3;b.cool=.92}break;case 7:b.gravebellRecoil=1;if(p===1){fireHoming(b,3);b.cool=1.5}else{fireRain(220);b.cool=1.4}break;case 8:b.solarHydraRecoil=1;if(p===1){fireFan(b,3,.14,210,-48);fireFan(b,3,.14,210,0);fireFan(b,3,.14,210,48);b.cool=1.25}else{if(!b.laser&&!encounterBeamDisabled(b)){b.laser={y:b.y,t:1.65};sfx.laser()}fireFan(b,5,.13,225);b.cool=1.7}break;default:{const pattern=b.attackCycle%5;if(pattern===0)fireWall(player.y,220);else if(pattern===1)fireRing(b,p===1?10:16,200,b.attackAngle);else if(pattern===2)fireHoming(b,p===1?2:4);else if(pattern===3)fireFan(b,p===1?7:11,.1,245);else fireRain(225);b.attackAngle+=.27;b.cool=p===1?1.05:.7;break}}}
  const standardBossAttack=bossAttack;
  bossAttack=function(b){
    if(b.type!==0){standardBossAttack(b);finishEncounterAttack(b);return}
    if(!b.queuedAttack){const phase=b.phase,pattern=++b.attackCycle%(phase===1?3:4);b.queuedAttack={phase,pattern};b.attackCue=phase===1?.5:.4;b.cool=b.attackCue;return}
    const {phase:p,pattern}=b.queuedAttack;b.queuedAttack=null;b.attackCue=0;b.bloodstarRecoil=1;particlesAt(b.x-48,b.y,'#ff4d81',8,95);
    if(p===1){
      if(pattern===0){fireRing(b,8,158,b.attackAngle);b.attackAngle+=.29;b.cool=1.2}
      else if(pattern===1){fireFan(b,3,.2,225);b.cool=.72}
      else{fireFan(b,5,.12,195);b.cool=1.05}
    }else{
      if(pattern===0){fireFan(b,7,.1,235);b.cool=.95}
      else{fireRing(b,10,178,b.attackAngle);b.attackAngle+=.31;b.cool=.66}
    }finishEncounterAttack(b)
  };
  const emitBossAttack=bossAttack;
  bossAttack=function(e){return withEncounterWeapons(e,()=>emitBossAttack(e))};
  function activeWeakNodes(e){return e.kind==='boss'?(e.epic?e.weakNodesByPhase[e.phase-1]:(e.phase===1?e.weakNodes1:e.weakNodes2)):e.weakNodes}
  function bossSpriteMotion(e){if(e.kind!=='boss'){const breathe=Math.sin(e.clock*.72+e.type*.4),recoil=settings.reducedMotion?0:Math.max(0,miniBossRecoilOffset(e))/5.2;return{x:1+breathe*.004-recoil*.0035,y:1-breathe*.003+recoil*.002}}if(e.epic){const breathe=Math.sin(e.clock*(.72+e.phase*.04));return{x:1+breathe*.0055,y:1-breathe*.0035}}const speed=e.phase===2?1.35:1,p=e.clock*speed;switch(e.type){case 0:return{x:1+Math.sin(p*1.25)*.01,y:1-Math.sin(p*1.25)*.007};case 1:return{x:1+Math.sin(p*1.3)*.008,y:1+Math.cos(p*1.3)*.009};case 2:return{x:1+Math.sin(p*1.65)*.025,y:1+Math.cos(p*1.65)*.03};case 3:return{x:1+Math.sin(p*2.2)*.04,y:1+Math.sin(p*2.2+1.2)*.035};case 4:{const bloom=(1+Math.sin(p*.9))*.5;return{x:1+bloom*.045,y:1+bloom*.045}}case 5:{const breathe=Math.sin(p*.82)*.004;return{x:1+breathe,y:1+breathe}}case 6:{const breathe=Math.sin(p*.68)*.0035;return{x:1+breathe,y:1-breathe*.6}}case 7:{const breathe=Math.sin(p*.46)*.0025;return{x:1+breathe,y:1-breathe*.45}}case 8:{const breathe=Math.sin(p*.54)*.003;return{x:1+breathe,y:1-breathe*.5}}case 9:{const breathe=Math.sin(p*.42)*.0025;return{x:1+breathe,y:1-breathe*.4}}default:return{x:1,y:1}}}
  function bossVisualAngle(e){return settings.reducedMotion?0:e.visualAngle||0}
  let nativeSpritePartCapture=null,nativeSpriteLayerMode=null,nativeSpriteUnavailable=false;
  function nativeSpriteBrokenGroups(e){
    const groups=new Map();for(const node of activeWeakNodes(e)){const profile=nativeFractureBaseProfile(e,node);if(!profile)continue;const members=groups.get(profile.groupId)||[];members.push(node);groups.set(profile.groupId,members)}
    return new Set([...groups].filter(([,nodes])=>nodes.every(node=>node.destroyed)).map(([id])=>id))
  }
  function nativeSpriteStyle(e){return e.kind==='mini'?e.type:e.epic?(e.epicId===0?15:13):({1:10,2:11,3:12,4:13,5:2,6:14,7:6,8:13,9:15}[e.type]??0)}
  function nativeSpriteMode(mode,paint){const previous=nativeSpriteLayerMode;nativeSpriteLayerMode=mode;try{return paint()}finally{nativeSpriteLayerMode=previous}}
  function withModularSpritePaint(e,paint){
    const target=ctx,original=target.drawImage,module=window.StarfighterDestruction,broken=nativeSpriteBrokenGroups(e);
    target.drawImage=function(asset,...args){
      if(args.length===8&&!asset?.destructionComposite){
        if(module?.has(asset)){
          const surface=module.surface(asset,broken,{...nativeSpriteLayerMode,onlyPart:nativeSpritePartCapture||nativeSpriteLayerMode?.onlyPart,style:nativeSpriteStyle(e)});
          if(surface){const xScale=(surface.naturalWidth||surface.width)/(asset.naturalWidth||asset.width),yScale=(surface.naturalHeight||surface.height)/(asset.naturalHeight||asset.height);return original.call(target,surface,args[0]*xScale,args[1]*yScale,args[2]*xScale,args[3]*yScale,...args.slice(4))}
          nativeSpriteUnavailable=true;if(nativeSpritePartCapture)return;
        }else if(nativeSpritePartCapture&&asset?.sourcePath?.startsWith('assets/')){nativeSpriteUnavailable=true;return}
      }
      return original.call(target,asset,...args)
    };
    try{return paint()}finally{target.drawImage=original}
  }
  function nativeSocketRemoved(e,node){const profile=nativeFractureBaseProfile(e,node);return !!profile&&nativeSpriteBrokenGroups(e).has(profile.groupId)}
  const nativeFractureBuffer=document.createElement('canvas'),nativeFractureContext=nativeFractureBuffer.getContext('2d',{willReadFrequently:true}),nativeFractureExtent=256,nativeFractureDensity=2;
  nativeFractureBuffer.width=nativeFractureBuffer.height=nativeFractureExtent*2*nativeFractureDensity;
  const nativePartBuffer=document.createElement('canvas'),nativePartContext=nativePartBuffer.getContext('2d',{willReadFrequently:true});
  nativePartBuffer.width=nativePartBuffer.height=nativeFractureBuffer.width;
  function outerNativeAppendage(e,index,joint,axis,halfWidth,groupId,name,flare=.14){
    const motion=bossSpriteMotion(e),length=Math.hypot(...axis)||1,dx=axis[0]/length,dy=axis[1]/length,nx=-dy,ny=dx,reach=420,farWidth=halfWidth+reach*flare;
    const point=(along,across)=>[(joint[0]+dx*along+nx*across)*motion.x,(joint[1]+dy*along+ny*across)*motion.y];
    const cutlineVertices=[point(0,-halfWidth),point(-1.2,0),point(0,halfWidth)],vertices=[...cutlineVertices,point(reach,farWidth),point(reach,-farWidth)];
    const x=joint[0]*motion.x,y=joint[1]*motion.y,minX=Math.min(...vertices.map(p=>p[0])),maxX=Math.max(...vertices.map(p=>p[0])),minY=Math.min(...vertices.map(p=>p[1])),maxY=Math.max(...vertices.map(p=>p[1]));
    return{x,y,w:maxX-minX,h:maxY-minY,index,groupId,name,axis:[dx,dy],vertices,cutlineVertices}
  }
  function nativeFractureBaseProfile(e,node,frameOverride){
    if(e.kind==='mini')return miniBossFractureProfile(e,node,frameOverride);
    if(!e.epic&&e.type===0)return null;
    const nodes=activeWeakNodes(e),index=Math.max(0,nodes.indexOf(node)),type=e.epic?(e.epicId===0?9:8):e.type,offset=localWeakNode(e,node),part=(joint,axis,width,id,name,flare)=>outerNativeAppendage(e,index,joint,axis,width,id,name,flare);
    let profile=null;
    // Sever exterior anatomy at a joint. Internal reactors remain solid,
    // scorched housings; they never become a closed hole in the body.
    if(type===1){
      const side=twinMawNodeSide(e,node);if(!side)return null;
      const pivot=twinMawJawPivot(e,side),pose=twinMawJawPose(e,side),scale=224/627,px=(pivot.x-313.5)*scale,py=(pivot.y-313.5)*scale,angle=pose.angle,cos=Math.cos(angle),sin=Math.sin(angle),raw=[-14,e.phase===1?(side>0?-27:24):(side>0?-29:20)],rx=raw[0]-px,ry=raw[1]-py;
      const joint=[px+rx*cos-ry*sin+pose.dx*scale,py+rx*sin+ry*cos+pose.dy*scale],axis=[-.82*cos-(-side*.57)*sin,-.82*sin+(-side*.57)*cos];
      profile=part(joint,axis,20,side>0?'upper-jaw':'lower-jaw',side>0?'upper jaw':'lower jaw',.3)
    }else if(type===2){
      if(index===2)return null;
      const core=localWeakNode(e,nodes[2]||nodes[0]),joint=[core.dx+(offset.dx-core.dx)*.48,core.dy+(offset.dy-core.dy)*.48];
      profile=part(joint,[offset.dx-joint[0],offset.dy-joint[1]],index===3?12:17,`shell-${index}`,index===3?'rear crown blade':index?'lower crown shell':'upper crown shell',.18)
    }else if(type===3){
      const slot=riftNodeSlot(e,node);if(!slot)return null;
      const joint=slot===2?[offset.dx-24,offset.dy]:[offset.dx*.65,offset.dy*.62];
      profile=part(joint,slot===2?[1,.06]:[offset.dx-joint[0],offset.dy-joint[1]],slot===2?19:22,`rift-blade-${slot}`,slot===2?'rear crescent blade':slot>0?'upper crescent blade':'lower crescent blade',.12)
    }else if(type===4){
      if(index>=3)return null;
      const joint=index===1?[offset.dx+15,offset.dy]:[offset.dx+24,offset.dy*.58];
      profile=part(joint,index===1?[-1,-.08]:[-.65,index===0?-.76:.76],index===1?12:16,`bloom-jaw-${index}`,index===1?'forward beak':index===0?'upper mandible petal':'lower mandible petal',.13)
    }else if(type===5){
      if(index<3)return null;
      const joint=[offset.dx*.82+4,offset.dy*.82],axis=[offset.dx-joint[0],offset.dy-joint[1]];
      profile=part(joint,axis,13,`void-tail-${index}`,`ventral tail ${index-2}`,.1)
    }else if(type===6){
      if(index===0)return null;
      const joint=[offset.dx*.61,offset.dy*.58];profile=part(joint,[offset.dx-joint[0],offset.dy-joint[1]],index===3?13:16,`prism-fin-${index}`,index===1?'upper crystal fin':index===2?'lower crystal fin':'rear crystal fin',.15)
    }else if(type===7){
      if(index===1)return null;
      const joint=index===0?[offset.dx*.82,offset.dy*.82]:[offset.dx*.56,offset.dy*.28-12],axis=index===0?[offset.dx-joint[0],offset.dy-joint[1]]:[offset.dx-joint[0],Math.max(28,offset.dy-joint[1])];
      profile=part(joint,axis,index===0?12:14,`grave-appendage-${index}`,index===0?'crown horn':offset.dx<0?'left chain and weight':'right chain and weight',.1)
    }else if(type===8){
      if(index===3)return null;
      const joints=[[15,-23],[18,7],[5,33]],base=index<3?joints[index]:null,joint=base?[base[0]+(offset.dx-base[0])*.35,base[1]+(offset.dy-base[1])*.35]:[30+(offset.dx-30)*.55,offset.dy*.55],axis=[offset.dx-joint[0],offset.dy-joint[1]];
      profile=part(joint,axis,index<3?11:10,`hydra-branch-${index}`,index<3?['upper head and neck','middle head and neck','lower head and neck'][index]:'rear solar spine',.09)
    }else if(type===9){
      if(index===0)return null;
      const joint=index===1?[offset.dx*.75,offset.dy*.55]:index===2?[offset.dx+4,offset.dy-18]:[offset.dx*.62,offset.dy*.52];
      profile=part(joint,index===2?[.12,1]:[offset.dx-joint[0],offset.dy-joint[1]],index<3?13:12,`omega-tendril-${index}`,index===1?'upper crown tendril':index===2?'lower crown tendril':'rear talon tendril',.11)
    }
    if(profile){
      const centerIndex=type===2?2:type===3?(e.phase===1?2:3):type===5?2:type===7?1:type===8?3:0,center=type===1?{dx:42,dy:0}:type===4?(nodes[3]?localWeakNode(e,nodes[3]):{dx:-5,dy:2}):nodes[centerIndex]?localWeakNode(e,nodes[centerIndex]):{dx:28,dy:0},motion=bossSpriteMotion(e);
      profile.protectedHousing={x:center.dx*motion.x,y:center.dy*motion.y,rx:17,ry:17}
      const housing=profile.protectedHousing,[ax,ay]=profile.axis,signed=(housing.x-profile.x)*ax+(housing.y-profile.y)*ay,clearance=21;
      if(signed>-clearance){
        const distance=signed+clearance,dx=ax*distance,dy=ay*distance;profile.x+=dx;profile.y+=dy;
        profile.vertices=profile.vertices.map(([x,y])=>[x+dx,y+dy]);profile.cutlineVertices=profile.cutlineVertices.map(([x,y])=>[x+dx,y+dy])
      }
    }
    return profile
  }
  function clipNativePartRegion(vertices,nx,ny,limit){
    const result=[];for(let i=0;i<vertices.length;i++){
      const a=vertices[i],b=vertices[(i+1)%vertices.length],da=a[0]*nx+a[1]*ny-limit,db=b[0]*nx+b[1]*ny-limit,insideA=da<=1e-7,insideB=db<=1e-7;
      if(insideA)result.push(a);
      if(insideA!==insideB){const mix=da/(da-db);result.push([a[0]+(b[0]-a[0])*mix,a[1]+(b[1]-a[1])*mix])}
    }return result
  }
  function nativeFractureProfile(e,node,frameOverride){
    const profile=nativeFractureBaseProfile(e,node,frameOverride);if(!profile)return null;
    const motion=bossSpriteMotion(e),axis=profile.axis,length=Math.hypot(axis[0]/motion.x,axis[1]/motion.y),nx=axis[0]/motion.x/length,ny=axis[1]/motion.y/length;
    // Remove the complete outboard silhouette, including tips outside the old
    // narrow cone. Partition by stable assembly anchors so adjacent live limbs
    // retain their art. Broken groups continue owning the same region.
    const groups=new Map(),nodes=activeWeakNodes(e);
    for(let index=0;index<nodes.length;index++){
      const member=nodes[index],candidate=nativeFractureBaseProfile(e,member,frameOverride),key=candidate?.groupId??`housing-${index}`;
      const offset=e.kind==='mini'?(Number.isInteger(frameOverride)?miniBossCoreTracks[e.type][((frameOverride%16)+16)%16][member.miniIndex??index]:null):null;
      const point=offset?{dx:offset[0],dy:offset[1]}:e.kind==='mini'?miniBossNodeOffset(e,member):localWeakNode(e,member),group=groups.get(key)||{x:0,y:0,count:0,housing:!candidate};
      group.x+=point.dx*motion.x;group.y+=point.dy*motion.y;group.count++;groups.set(key,group)
    }
    for(const group of groups.values()){group.x/=group.count;group.y/=group.count}
    const owner=groups.get(profile.groupId);let limit=profile.x*nx+profile.y*ny-.65;
    for(const group of groups.values())if(group.housing)limit=Math.max(limit,group.x*nx+group.y*ny+6);
    const housing=profile.protectedHousing;if(housing)limit=Math.max(limit,housing.x*nx+housing.y*ny+Math.hypot(housing.rx*nx,housing.ry*ny)+2);
    let vertices=clipNativePartRegion([[-512,-512],[512,-512],[512,512],[-512,512]],-nx,-ny,-limit);
    const partitions=[];
    for(const [key,other]of groups){
      if(key===profile.groupId||other.housing)continue;
      const px=other.x-owner.x,py=other.y-owner.y,bound=(other.x*other.x+other.y*other.y-owner.x*owner.x-owner.y*owner.y)/2+Math.hypot(px,py)*.8;
      if(Math.hypot(px,py)<1e-5)continue;
      vertices=clipNativePartRegion(vertices,px,py,bound);partitions.push({nx:px,ny:py,limit:bound})
    }
    // Only the physical sever line gets a charred edge. Ownership boundaries
    // never receive an outline through the space left by a missing appendage.
    let jointLine=vertices.filter(([x,y])=>Math.abs(x*nx+y*ny-limit)<1e-5);const tx=-ny,ty=nx;
    if(jointLine.length<2&&vertices.length){
      // A neighboring assembly can own the original root. Start this part's
      // sever at its own first material region instead of outlining that seam.
      limit=Math.min(...vertices.map(([x,y])=>x*nx+y*ny))+.5;
      vertices=clipNativePartRegion(vertices,-nx,-ny,-limit);
      jointLine=vertices.filter(([x,y])=>Math.abs(x*nx+y*ny-limit)<1e-5)
    }
    jointLine.sort((a,b)=>(a[0]-b[0])*tx+(a[1]-b[1])*ty);
    if(jointLine.length>=2)profile.cutlineVertices=[jointLine[0],jointLine[jointLine.length-1]];
    else profile.cutlineVertices=[];
    const rootShift=limit-profile.x*nx-profile.y*ny;profile.vertices=vertices;profile.x+=nx*rootShift;profile.y+=ny*rootShift;profile.partitions=partitions;
    return profile
  }
  function nativeFractureVertices(profile){if(!profile)return[];if(profile.vertices)return profile.vertices;const cos=Math.cos(profile.angle||0),sin=Math.sin(profile.angle||0);return profile.points.map(([x,y])=>[profile.x+(x*cos-y*sin)*(profile.scaleX||1),profile.y+(x*sin+y*cos)*(profile.scaleY||1)])}
  function nativeFractureGroupReady(e,profile,frameOverride){return !!profile&&activeWeakNodes(e).filter(node=>nativeFractureBaseProfile(e,node,frameOverride)?.groupId===profile.groupId).every(node=>node.destroyed)}
  function nativePreparedJointLocal(e,groupId){
    let asset,frame,x,y;
    const sample=(source,index)=>{const sheet=window.STARFIGHTER_DESTRUCTION_MANIFEST?.sources[source?.sourcePath],joint=sheet?.parts.find(part=>part.id===groupId)?.capFrames[index];return joint?{sheet,joint}:null};
    if(e.kind==='mini'){
      asset=miniBossSpriteFor(e.type);frame=miniBossFrame(e);const data=sample(asset,frame);if(!data)return null;
      x=(data.joint.x/data.sheet.cellW-.5)*e.def.w;y=(data.joint.y/data.sheet.cellH-.5)*e.def.h;
    }else if(e.epic||e.type>=5){
      const pose=lateBossMaterialFrame(e),data=sample(pose.source,pose.frame);if(!data)return null;
      const px=data.joint.x/data.sheet.cellW*pose.cellW,py=data.joint.y/data.sheet.cellH*pose.cellH;
      x=((px-pose.cellW/2)*pose.factorX+pose.shift[0])*pose.scale-pose.recoil;y=((py-pose.cellH/2)*pose.factorY+pose.shift[1])*pose.scale;
    }else{
      const type=e.type,phase=e.phase-1;
      frame=type===1?twinMawFrame(e)+phase*2:type===2?helixFrame(e)+phase*2:type===3?riftFrame(e):ironBloomFrame(e);
      asset=type===1?bossSprites[1]:type===2?bossSprites[2]:type===3?(phase===0&&frame%2?riftPhase1InbetweenSprite:riftPhaseSprites[phase]):frame%2?ironBloomInbetweenSprites[phase]:ironBloomPhaseSprites[phase];
      const tile=type===3?(phase===0?Math.floor(frame/2):frame):type===4?Math.floor(frame/2):frame,data=sample(asset,tile);if(!data)return null;
      const scale=(type===4?262:224)/627,shift=type===2?helixFrameShift(e):0,registration=type===3?riftAnimatedRegistration[phase][frame]:[0,0];
      x=(data.joint.x-data.sheet.cellW/2+shift+registration[0])*scale;y=(data.joint.y-data.sheet.cellH/2+registration[1])*scale;
      if(type===1||type===2){
        const pose=type===1?twinMawCorePose(e):helixCorePose(e),core=type===1?{x:412.5,y:313.5}:helixCorePixel(e),px=(core.x+shift-313.5)*scale,py=(core.y-313.5)*scale,dx=(x-px)*pose.scale,dy=(y-py)/pose.scale;
        x=px+dx*Math.cos(pose.angle)-dy*Math.sin(pose.angle)+pose.dx*scale;y=py+dx*Math.sin(pose.angle)+dy*Math.cos(pose.angle);
      }
    }
    const motion=bossSpriteMotion(e);return{x:x*motion.x,y:y*motion.y};
  }
  function nativeSeveredSmokeAnchor(e,node){
    const profile=nativeFractureBaseProfile(e,node);if(!nativeFractureGroupReady(e,profile))return null;
    const joint=nativePreparedJointLocal(e,profile.groupId),point=joint?[joint.x,joint.y]:[profile.x,profile.y],pose=enemyRenderPose(e),x=point[0]*pose.scaleX,y=point[1]*pose.scaleY,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle);
    return{x:pose.x+x*cos-y*sin,y:pose.y+x*sin+y*cos,groupId:profile.groupId}
  }
  function traceNativeFracture(context,profile){context.beginPath();nativeFractureVertices(profile).forEach(([x,y],index)=>index?context.lineTo(x,y):context.moveTo(x,y));context.closePath()}
  function nativeBossRenderSize(e){return e.epic?292:e.type===4?262:e.type===5?232:e.type===6?prismWardenRenderWidth:e.type===7?gravebellRenderSize:e.type===8?solarHydraRenderSize:e.type===9?omegaHeartRenderSize:224}
  function paintNativeBossBody(e,hit=0){
    const size=nativeBossRenderSize(e);
    return e.epic?drawEpicBossSprite(e,size,hit):e.type===0?drawBloodstarSprite(e,size,hit):e.type===1?drawTwinMawSprite(e,size,hit):e.type===2?drawHelixCrownSprite(e,size,hit):e.type===3?drawRiftWraithSprite(e,size,hit):e.type===4?drawIronBloomSprite(e,size,hit):e.type===5?drawVoidLeviathanSprite(e,size,hit):e.type===6?drawPrismWardenSprite(e,size,hit):e.type===7?drawGravebellSprite(e,size,hit):e.type===8?drawSolarHydraSprite(e,size,hit):e.type===9?drawOmegaHeartSprite(e,size,hit):false
  }
  function paintNativeFractureBody(e,frameOverride){return e.kind==='mini'?paintMiniBossNativeBody(e,frameOverride):paintNativeBossBody(e)}
  function captureNativeFractureBody(e,paint,frameOverride){
    const destination=ctx;ctx=nativeFractureContext;
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,nativeFractureBuffer.width,nativeFractureBuffer.height);
      ctx.setTransform(nativeFractureDensity,0,0,nativeFractureDensity,nativeFractureExtent*nativeFractureDensity,nativeFractureExtent*nativeFractureDensity);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowBlur=0;
      return (paint?paint():paintNativeFractureBody(e,frameOverride))!==false
    }finally{ctx.restore();ctx=destination}
  }
  const nativeIslandWorkspace={size:0};
  function pruneNativePartIslands(before,after,width,height,anchors=[]){
    const count=width*height,workspace=nativeIslandWorkspace;
    if(workspace.size<count){
      workspace.size=count;workspace.original=new Uint32Array(count);workspace.remaining=new Uint32Array(count);
      workspace.originalParents=new Uint32Array(count+1);workspace.parents=new Uint32Array(count+1);workspace.sizes=new Uint32Array(count+1);workspace.origins=new Uint32Array(count+1);
      workspace.largest=new Uint32Array(count+1);workspace.anchored=new Uint8Array(count+1);workspace.retained=new Uint8Array(count+1)
    }
    if((workspace.rowWidth||0)<width){
      workspace.rowWidth=width;workspace.startsA=new Uint32Array(width+1);workspace.endsA=new Uint32Array(width+1);workspace.idsA=new Uint32Array(width+1);
      workspace.startsB=new Uint32Array(width+1);workspace.endsB=new Uint32Array(width+1);workspace.idsB=new Uint32Array(width+1)
    }
    const original=workspace.original,remaining=workspace.remaining,originalParents=workspace.originalParents,parents=workspace.parents,sizes=workspace.sizes,origins=workspace.origins;
    original.fill(0,0,count);remaining.fill(0,0,count);
    const root=(parents,id)=>{while(parents[id]!==id){parents[id]=parents[parents[id]];id=parents[id]}return id};
    // Label horizontal runs, joining only overlapping runs in the prior row.
    // Expanding each overlap by one pixel keeps the same eight-connectivity as
    // the source art, without a queue and eight neighbor tests per solid pixel.
    const label=(pixels,labels,parents,measure)=>{
      let previousStarts=workspace.startsA,previousEnds=workspace.endsA,previousIds=workspace.idsA,starts=workspace.startsB,ends=workspace.endsB,ids=workspace.idsB,previousCount=0,idCount=0;
      parents[0]=0;
      for(let row=0;row<count;row+=width){
        let x=0,runs=0,previous=0;
        while(x<width){
          while(x<width&&pixels[row+x]<=4)x++;
          if(x===width)break;
          const start=x;while(x<width&&pixels[row+x]>4)x++;const end=x;
          while(previous<previousCount&&previousEnds[previous]<start)previous++;
          let id=0;
          for(let at=previous;at<previousCount&&previousStarts[at]<=end;at++){
            const other=root(parents,previousIds[at]);
            if(!id)id=other;
            else if(id!==other){
              const smaller=Math.min(id,other),larger=Math.max(id,other);parents[larger]=smaller;
              if(measure)sizes[smaller]+=sizes[larger];id=smaller
            }
          }
          if(!id){id=++idCount;parents[id]=id;if(measure){sizes[id]=0;origins[id]=originalParents[original[row+start]]}}
          if(measure)sizes[id]+=end-start;
          labels.fill(id,row+start,row+end);starts[runs]=start;ends[runs]=end;ids[runs++]=id
        }
        [previousStarts,starts]=[starts,previousStarts];[previousEnds,ends]=[ends,previousEnds];[previousIds,ids]=[ids,previousIds];previousCount=runs
      }
      for(let id=1;id<=idCount;id++)parents[id]=root(parents,id);
      return idCount
    };
    const originalId=label(before,original,originalParents,false),remainingId=label(after,remaining,parents,true),largest=workspace.largest,anchored=workspace.anchored,retained=workspace.retained;
    largest.fill(0,0,originalId+1);anchored.fill(0,0,originalId+1);retained.fill(0,0,remainingId+1);
    for(let id=1;id<=remainingId;id++)if(parents[id]===id){const origin=origins[id];if(!largest[origin]||sizes[id]>sizes[largest[origin]])largest[origin]=id}
    // Keep every live target and solid reactor, even if the native sprite has
    // a separate articulated assembly. Never discard surviving combat anatomy.
    for(const anchor of anchors){let best=0,distance=Infinity;const ax=Math.round(anchor.x),ay=Math.round(anchor.y);
      for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){const x=ax+dx,y=ay+dy,d=dx*dx+dy*dy;if(x<0||x>=width||y<0||y>=height||d>=distance)continue;const id=parents[remaining[y*width+x]];if(id){best=id;distance=d}}
      if(best){retained[best]=1;anchored[origins[best]]=1}
    }
    for(let origin=0;origin<=originalId;origin++)retained[largest[origin]]=1;
    let removed=0;
    for(let p=0;p<count;p++)if(remaining[p]&&!retained[parents[remaining[p]]]){after[p]=0;removed++}
    return removed
  }
  function nativeFractureRasterBounds(e){
    const width=e.kind==='mini'?e.def.w:nativeBossRenderSize(e),height=e.kind==='mini'?e.def.h:width,multiplier=e.kind==='mini'?.55:.6;
    const halfW=Math.min(250,width*multiplier+8),halfH=Math.min(250,height*multiplier+8),left=Math.floor((nativeFractureExtent-halfW)*nativeFractureDensity),top=Math.floor((nativeFractureExtent-halfH)*nativeFractureDensity);
    return{x:left,y:top,w:Math.ceil(halfW*2*nativeFractureDensity),h:Math.ceil(halfH*2*nativeFractureDensity)}
  }
  function cleanNativeFractureSurface(e,original,bounds,frameOverride){
    const remaining=nativeFractureContext.getImageData(bounds.x,bounds.y,bounds.w,bounds.h),count=bounds.w*bounds.h,before=new Uint8Array(count),after=new Uint8Array(count);let changed=false;
    for(let p=0;p<count;p++){before[p]=original.data[p*4+3];after[p]=remaining.data[p*4+3];if(before[p]!==after[p])changed=true}
    if(!changed)return;
    const motion=bossSpriteMotion(e),anchors=[],point=(x,y)=>({x:(x+nativeFractureExtent)*nativeFractureDensity-bounds.x,y:(y+nativeFractureExtent)*nativeFractureDensity-bounds.y});
    for(const node of activeWeakNodes(e)){
      const profile=nativeFractureBaseProfile(e,node,frameOverride);
      if(!node.destroyed||!profile){const p=e.kind==='mini'?miniBossNodeOffset(e,node):localWeakNode(e,node);anchors.push(point(p.dx*motion.x,p.dy*motion.y))}
      if(profile?.protectedHousing)anchors.push(point(profile.protectedHousing.x,profile.protectedHousing.y))
    }
    if(!pruneNativePartIslands(before,after,bounds.w,bounds.h,anchors))return;
    for(let p=0;p<count;p++)if(remaining.data[p*4+3]>0&&!after[p]){remaining.data[p*4]=remaining.data[p*4+1]=remaining.data[p*4+2]=remaining.data[p*4+3]=0}
    nativeFractureContext.putImageData(remaining,bounds.x,bounds.y)
  }
  function maskNativeFractures(e,exclude=null,frameOverride){
    const context=nativeFractureContext,groups=new Set(),excluded=exclude?nativeFractureProfile(e,exclude,frameOverride)?.groupId:null;context.save();context.globalAlpha=1;context.filter='none';context.shadowBlur=0;context.fillStyle='#000';
    let original=null;const bounds=nativeFractureRasterBounds(e);
    context.setTransform(nativeFractureDensity,0,0,nativeFractureDensity,nativeFractureExtent*nativeFractureDensity,nativeFractureExtent*nativeFractureDensity);
    for(const node of activeWeakNodes(e)){
      if(!node.destroyed)continue;
      const profile=nativeFractureProfile(e,node,frameOverride);if(!profile||profile.groupId===excluded||groups.has(profile.groupId)||!nativeFractureGroupReady(e,profile,frameOverride))continue;
      if(!original)original=context.getImageData(bounds.x,bounds.y,bounds.w,bounds.h);
      groups.add(profile.groupId);traceNativeFracture(context,profile);context.globalCompositeOperation='destination-out';context.fill();
      // Char only the surviving root; outlining the entire region would draw
      // a floating polygon through the empty space where the limb used to be.
      const line=profile.cutlineVertices;context.beginPath();line.forEach(([x,y],index)=>index?context.lineTo(x,y):context.moveTo(x,y));
      context.globalCompositeOperation='source-atop';context.strokeStyle='#080b10';context.lineWidth=3;context.stroke();
      context.strokeStyle='#704032b8';context.lineWidth=.65;context.stroke()
    }
    context.restore();if(original)cleanNativeFractureSurface(e,original,bounds,frameOverride)
  }
  function drawNativeFracturedBody(e,paint,frameOverride){
    // Bloodstar retains its authored tentacle removal masks and fragment art.
    if(e.kind==='boss'&&!e.epic&&e.type===0)return paint?paint():paintNativeFractureBody(e,frameOverride);
    flushNativeSpriteParts(e);
    return withModularSpritePaint(e,()=>paint?paint():paintNativeFractureBody(e,frameOverride))
  }
  function captureNativePartRaster(paint){
    const context=nativeFractureContext,drawImage=context.drawImage,writes=new Map();
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,safe=true,rendered;
    const colorFilter=/^(?:none|(?:(?:brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)\([^)]*\)\s*)+)$/;
    // Track the actual prepared layer after its native pose transforms. A full
    // readback remains the fallback for paint that can extend outside images.
    context.drawImage=function(asset,...args){
      if(safe){
        try{
          if(!colorFilter.test(context.filter||'none')||context.shadowBlur>0||(Number(context.shadowOffsetX)||0)!==0||(Number(context.shadowOffsetY)||0)!==0)safe=false;
          const rect=args.length===8?args.slice(4):args.length===4?args:args.length===2?[...args,asset.naturalWidth||asset.width,asset.naturalHeight||asset.height]:null;
          const transform=context.getTransform();
          if(!rect||![...rect,transform.a,transform.b,transform.c,transform.d,transform.e,transform.f].every(Number.isFinite))safe=false;
          if(safe&&rect[2]&&rect[3]){
            const [x,y,w,h]=rect;
            for(const [px,py]of[[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){
              const tx=transform.a*px+transform.c*py+transform.e,ty=transform.b*px+transform.d*py+transform.f;
              minX=Math.min(minX,tx);minY=Math.min(minY,ty);maxX=Math.max(maxX,tx);maxY=Math.max(maxY,ty)
            }
          }
        }catch{safe=false}
      }
      return drawImage.call(context,asset,...args)
    };
    for(const name of['fill','stroke','fillRect','strokeRect','fillText','strokeText','putImageData']){
      const original=context[name];if(typeof original!=='function')continue;writes.set(name,original);
      context[name]=function(...args){safe=false;return original.apply(context,args)}
    }
    try{rendered=paint()}finally{context.drawImage=drawImage;for(const [name,original]of writes)context[name]=original}
    const width=nativeFractureBuffer.width,height=nativeFractureBuffer.height;
    if(!safe||!Number.isFinite(minX))return{rendered,bounds:{x:0,y:0,w:width,h:height}};
    // Include a sampling guard for transformed, smoothed sprite edges. The
    // fragment's original alpha threshold and final two-pixel padding stay put.
    const x=Math.max(0,Math.floor(minX-4)),y=Math.max(0,Math.floor(minY-4)),right=Math.min(width,Math.ceil(maxX+4)),bottom=Math.min(height,Math.ceil(maxY+4));
    return{rendered,bounds:right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:{x:0,y:0,w:width,h:height}}
  }
  function emitNativeSpritePart(owner,e,index,profile,pose){
    const previous=nativeSpritePartCapture,flash=e.hitFlash;let rendered=false,bounds;
    nativeSpritePartCapture=profile.groupId;nativeSpriteUnavailable=false;e.hitFlash=0;
    try{({rendered,bounds}=captureNativePartRaster(()=>captureNativeFractureBody(e,()=>withModularSpritePaint(e,()=>paintNativeFractureBody(e)))))}finally{nativeSpritePartCapture=previous;e.hitFlash=flash}
    if(!rendered||nativeSpriteUnavailable)return false;
    const context=nativeFractureContext,N=nativeFractureBuffer.width,pixels=context.getImageData(bounds.x,bounds.y,bounds.w,bounds.h).data;let minX=N,minY=N,maxX=-1,maxY=-1;
    for(let y=0;y<bounds.h;y++)for(let x=0;x<bounds.w;x++)if(pixels[(y*bounds.w+x)*4+3]>24){const px=bounds.x+x,py=bounds.y+y;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py)}
    if(maxX<minX)return false;
    minX=Math.max(0,minX-2);minY=Math.max(0,minY-2);maxX=Math.min(N-1,maxX+2);maxY=Math.min(N-1,maxY+2);
    const width=maxX-minX+1,height=maxY-minY+1,chunk=document.createElement('canvas');chunk.width=width;chunk.height=height;
    chunk.getContext('2d').drawImage(nativeFractureBuffer,minX,minY,width,height,0,0,width,height);
    const localBounds={x:minX/nativeFractureDensity-nativeFractureExtent,y:minY/nativeFractureDensity-nativeFractureExtent,w:width/nativeFractureDensity,h:height/nativeFractureDensity},localCenter={x:localBounds.x+localBounds.w/2,y:localBounds.y+localBounds.h/2},lx=localCenter.x*pose.scaleX,ly=localCenter.y*pose.scaleY,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle);
    const side=Math.sign(profile.axis?.[1]||profile.y)||1,speed=rand(85,145),angle=Math.atan2(profile.axis?.[1]??profile.y,profile.axis?.[0]??1),life=e.kind==='mini'?2:2.7;
    owner.nativeSeveredGroups=owner.nativeSeveredGroups||{};owner.nativeSeveredGroups[`${e.phase||1}/${profile.groupId}`]=true;
    const ownerNodes=owner.kind==='mini'?owner.weakNodes:owner.epic?owner.weakNodesByPhase[e.phase-1]:e.phase===1?owner.weakNodes1:owner.weakNodes2;
    ownerNodes.forEach((member,i)=>{if(nativeFractureBaseProfile(e,activeWeakNodes(e)[i])?.groupId===profile.groupId)member.nativeDetached=true});
    bossFragments.push({nativeChunk:{canvas:chunk,w:localBounds.w*pose.scaleX,h:localBounds.h*pose.scaleY,localBounds,localCenter,joint:{x:profile.x,y:profile.y},groupId:profile.groupId,nodeIndex:index,type:e.type,phase:e.phase||1,kind:e.kind,spritePart:true},x:pose.x+lx*cos-ly*sin,y:pose.y+lx*sin+ly*cos,rot:pose.angle,vx:Math.cos(angle)*speed-35,vy:Math.sin(angle)*speed*.45+side*rand(6,16),vr:side*rand(.9,2.3),life,max:life,smoke:0});
    return true
  }
  function flushNativeSpriteParts(e){
    if(artInspection||!e.pendingNativeSpriteParts?.size)return;
    for(const[key,request]of e.pendingNativeSpriteParts){
      if(e.nativeSeveredGroups?.[key]||emitNativeSpritePart(e,request.snapshot,request.index,request.profile,request.pose))e.pendingNativeSpriteParts.delete(key)
    }
  }
  function detachNativePart(e,node){
    if(e.kind==='boss'&&!e.epic&&e.type===0)return false;
    if(node.nativeDetached)return true;
    const profile=nativeFractureBaseProfile(e,node);if(!profile){node.nativeDetached=true;return true}
    if(!nativeSpriteBrokenGroups(e).has(profile.groupId))return true;
    const phase=e.phase||1,key=`${phase}/${profile.groupId}`;if(e.nativeSeveredGroups?.[key]||e.pendingNativeSpriteParts?.has(key))return true;
    const index=activeWeakNodes(e).indexOf(node),pose=enemyRenderPose(e);
    if(!emitNativeSpritePart(e,e,index,profile,pose)){
      // Keep the killing frame, bone pose and world transform while its exact
      // part texture loads. Never substitute a cut-out torso or generic plate.
      const snapshot={...e};for(const field of['weakNodes','weakNodes1','weakNodes2'])if(e[field])snapshot[field]=e[field].map(n=>({...n}));
      if(e.weakNodesByPhase)snapshot.weakNodesByPhase=e.weakNodesByPhase.map(nodes=>nodes.map(n=>({...n})));
      e.pendingNativeSpriteParts=e.pendingNativeSpriteParts||new Map();e.pendingNativeSpriteParts.set(key,{snapshot,index,profile,pose,phase})
    }
    return true
  }
  function bloodstarAnimationState(e){const rate=e.phase===2?3.15:2.45,position=(e.clock*rate)%4,frame=Math.floor(position),next=(frame+1)%4,raw=clamp((position-frame-.8)/.2,0,1);return{frame,next,mix:raw*raw*(3-2*raw)}}
  function bloodstarNodeOffset(e,node){const animation=bloodstarAnimationState(e),frames=bloodstarNodePixels[e.phase-1],index=node.bloodstarIndex??0,current=frames[animation.frame][index],next=frames[animation.next][index],x=current[0]+(next[0]-current[0])*animation.mix,y=current[1]+(next[1]-current[1])*animation.mix,scale=224/627;return{dx:(x-313.5)*scale,dy:(y-313.5)*scale}}
  function twinMawFrame(e){return Math.floor(e.clock*(e.phase===2?6.5:5))%2}
  function twinMawNodeSide(e,node){const index=node.twinMawIndex??0;if(e.phase===1&&index===2)return 0;return index%2===0?1:-1}
  function twinMawJawPivot(e,side){const frame=twinMawFrame(e);if(e.phase===1)return{x:frame?335:390,y:side>0?300:327};return{x:frame?300:360,y:side>0?270:342}}
  function twinMawJawPose(e,side){
    if(!side)return{angle:0,dx:0,dy:0};
    const nodes=activeWeakNodes(e).filter(node=>twinMawNodeSide(e,node)===side),damage=nodes.length?nodes.reduce((sum,node)=>sum+1-node.hp/node.max,0)/nodes.length:0,phase2=e.phase===2,speed=phase2?3.15:2.35;
    const cycle=(1+Math.sin(e.clock*speed-.45))/2,smooth=cycle*cycle*(3-2*cycle),recoil=e.mawRecoil||0,kick=(e.mawDamageSide===side?e.mawDamageKick||0:0),exposed=e.weakOpen?1:0;
    const opening=(phase2?.032:.022)+smooth*(phase2?.078:.058)+exposed*(phase2?.072:.052)+recoil*.052;
    const chatter=Math.sin(e.clock*(phase2?12.5:8.7)+side*.8)*(phase2?.008:.0045),loose=Math.sin(e.clock*(6.8+side*.55))*damage*.032+Math.sin(e.clock*18)*kick*.012;
    return{angle:side*(opening+chatter+loose),dx:smooth*(phase2?5:3)+exposed*4+recoil*10+kick*3,dy:-side*(smooth*(phase2?4:2.5)+exposed*5+recoil*4)}
  }
  function twinMawRearPose(e,side=0){const phase2=e.phase===2,recoil=e.mawRecoil||0,kick=(e.mawDamageSide===0||e.mawDamageSide===side?e.mawDamageKick||0:0),cycle=Math.sin(e.clock*(phase2?3.8:2.8)),flutter=Math.sin(e.clock*(phase2?7.4:5.2)+side*.9);return{dx:cycle*(phase2?4:2.5)+recoil*8+kick*4,dy:flutter*(phase2?1.8:1)+side*kick*2.5,angle:side*(cycle*(phase2?.018:.011)+flutter*.006+recoil*.014+kick*.012)}}
  function twinMawCorePose(e){const phase2=e.phase===2,beat=Math.sin(e.clock*(phase2?5.8:4.2)),recoil=e.mawRecoil||0;return{dx:beat*(phase2?3:1.8)+recoil*7,scale:1+Math.max(0,beat)*(phase2?.038:.022)+recoil*.035,angle:Math.sin(e.clock*(phase2?4.4:3.1))*(phase2?.018:.01)}}
  function twinMawModularCoreActive(e){const nodes=activeWeakNodes(e);return !!window.StarfighterDestruction?.ready(bossSprites[1])&&[1,-1].some(side=>{const jaw=nodes.filter(n=>twinMawNodeSide(e,n)===side);return jaw.length&&jaw.every(n=>n.destroyed)})}
  function twinMawNodeOffset(e,node){const frame=twinMawFrame(e),point=twinMawNodePixels[e.phase-1][frame][node.twinMawIndex??0],scale=224/627,side=twinMawNodeSide(e,node);let x=(point[0]-313.5)*scale,y=(point[1]-313.5)*scale;if(side){const pivot=twinMawJawPivot(e,side),pose=twinMawJawPose(e,side),px=(pivot.x-313.5)*scale,py=(pivot.y-313.5)*scale,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle),dx=x-px,dy=y-py;x=px+dx*cos-dy*sin+pose.dx*scale;y=py+dx*sin+dy*cos+pose.dy*scale}else if(twinMawModularCoreActive(e)){const pose=twinMawCorePose(e),px=(412.5-313.5)*scale,dx=(x-px)*pose.scale,dy=y/pose.scale;x=px+dx*Math.cos(pose.angle)-dy*Math.sin(pose.angle)+pose.dx*scale;y=dx*Math.sin(pose.angle)+dy*Math.cos(pose.angle)}else{const rearSide=point[1]<313.5?1:-1,rear=twinMawRearPose(e,rearSide),px=(455-313.5)*scale,py=((rearSide>0?278:349)-313.5)*scale,cos=Math.cos(rear.angle),sin=Math.sin(rear.angle),dx=x-px,dy=y-py;x=px+dx*cos-dy*sin+rear.dx*scale;y=py+dx*sin+dy*cos+rear.dy*scale}return{dx:x,dy:y}}
  function helixFrame(e){return Math.floor(e.clock*(e.phase===2?6.2:4.6))%2}
  function helixFrameShift(e,frame=helixFrame(e)){return frame?(e.phase===1?56:52):0}
  function helixCorePixel(e,frame=helixFrame(e)){const shift=frame?(e.phase===1?56:52):0;return{x:(e.phase===1?241:165)-shift,y:e.phase===1?304:242}}
  function helixNodeSide(node){const index=node.helixIndex??0;return index===0?1:index===1?-1:0}
  function helixShellPose(e,side){const phase2=e.phase===2,cycle=Math.sin(e.clock*(phase2?3.9:2.65)+side*.42),flutter=Math.sin(e.clock*(phase2?9.5:6.4)+side),recoil=e.helixRecoil||0,kick=e.helixDamageSide===side?e.helixDamageKick||0:0,exposed=e.weakOpen?1:0;return{angle:side*(cycle*(phase2?.052:.035)+flutter*(phase2?.01:.006)+exposed*.025+recoil*.022+kick*.018),dx:cycle*(phase2?4:2.5)+recoil*6+kick*4,dy:-side*(Math.abs(cycle)*(phase2?7:4)+exposed*5+recoil*2.5)}}
  function helixCorePose(e){const phase2=e.phase===2,beat=Math.sin(e.clock*(phase2?6.1:4.4)),recoil=e.helixRecoil||0,kick=e.helixDamageSide===0?e.helixDamageKick||0:0;return{beat,angle:Math.sin(e.clock*(phase2?5.2:3.5))*(phase2?.022:.012),dx:beat*(phase2?3:1.8)+recoil*7+kick*4,scale:1+Math.max(0,beat)*(phase2?.055:.035)+recoil*.04+kick*.025}}
  function helixNodeOffset(e,node){const frame=helixFrame(e),point=helixNodePixels[e.phase-1][frame][node.helixIndex??0],frameShift=helixFrameShift(e,frame),scale=224/627,side=helixNodeSide(node),core=helixCorePixel(e,frame);let x=(point[0]+frameShift-313.5)*scale,y=(point[1]-313.5)*scale,px=(core.x+frameShift-313.5)*scale,py=(core.y-313.5)*scale;if(side){const pose=helixShellPose(e,side),cos=Math.cos(pose.angle),sin=Math.sin(pose.angle),dx=x-px,dy=y-py;x=px+dx*cos-dy*sin+pose.dx*scale;y=py+dx*sin+dy*cos+pose.dy*scale}else{const pose=helixCorePose(e),dx=(x-px)*pose.scale,dy=(y-py)/pose.scale;x=px+dx*Math.cos(pose.angle)-dy*Math.sin(pose.angle)+pose.dx*scale;y=py+dx*Math.sin(pose.angle)+dy*Math.cos(pose.angle)}return{dx:x,dy:y}}
  function riftAttackIntent(e){const windup=e.phase===2?.44:.38,raw=e.intro>0?0:clamp((windup-Math.max(0,e.cool))/windup,0,1),anticipation=raw*raw*(3-2*raw),track=player?clamp((player.y-e.y)/220,-1,1):0;return{anticipation,release:e.riftRecoil||0,track}}
  function bossAttackAnimationPeriod(e,baseline){
    const cycle=e.attackAnimationCycle,inspecting=state==='art'&&artInspection?.target===e;
    return !inspecting&&cycle?.phase===e.phase&&Number.isFinite(cycle.period)&&cycle.period>0&&Number.isFinite(cycle.clock)&&Number.isFinite(e.clock)&&e.clock>=cycle.clock?cycle.period:baseline
  }
  function riftAnimationState(e){
    if(e.intro>0)return{frame:0,next:0,mix:0};
    const period=bossAttackAnimationPeriod(e,e.phase===2?1.25:1.3),sinceFire=clamp(period-e.cool,0,period),sequence=e.phase===1?[4,5,6,7,0,1,2,3]:[2,3,0,1],position=sinceFire/period*sequence.length,step=Math.min(sequence.length-1,Math.floor(position)),raw=position-step,mix=raw*raw*(3-2*raw);
    return{frame:sequence[step],next:sequence[(step+1)%sequence.length],mix}
  }
  function riftFrame(e){return riftAnimationState(e).frame}
  function riftNodeSlot(e,node){const index=node.riftIndex??0;if(e.phase===1)return index===0?1:index===1?-1:0;return index===0?1:index===1?-1:index===2?2:0}
  function riftNodeOffset(e,node){const frame=riftFrame(e),phase=e.phase-1,index=node.riftIndex??0,point=riftAnimatedNodePixels[phase][frame][index],registration=riftAnimatedRegistration[phase][frame],scale=224/627;return{dx:(point[0]+registration[0]-384)*scale,dy:(point[1]+registration[1]-256)*scale}}
  function ironBloomAttackIntent(e){const windup=e.phase===2?.3:.36,raw=e.intro>0?0:clamp((windup-Math.max(0,e.cool))/windup,0,1);return raw*raw*(3-2*raw)}
  function ironBloomFrame(e){if(e.intro>0)return Math.floor(e.clock*1.5)%2;if(!e.attackCycle)return 0;const period=bossAttackAnimationPeriod(e,e.phase===2?.86:1.05),sequence=[4,5,6,7,0,1,2,3],position=clamp((e.ironCycle||0)/period,0,.999)*sequence.length;return sequence[Math.floor(position)]}
  function ironBloomNodeOffset(e,node){const frame=ironBloomFrame(e),phase=e.phase-1,index=node.ironBloomIndex??0,point=ironBloomNodePixels[phase][frame][index],scale=262/627;return{dx:(point[0]-313.5)*scale,dy:(point[1]-313.5)*scale}}
  function voidLeviathanAnimationState(e){const charging=e.chargeWindow>0,idle=e.voidAnimWindow>0;if(!charging&&!idle)return{...boss32AnimationFromPosition(0),active:false};const progress=charging?1-clamp(e.chargeWindow/1.35,0,1):1-clamp(e.voidAnimWindow/Math.max(.1,e.voidAnimDuration),0,1),flow=progress-Math.sin(progress*Math.PI*2)*.055;return{...boss32AnimationFromPosition(Math.min(31.999,flow*32)),active:true}}
  function voidLeviathanFrame(e){const animation=voidLeviathanAnimationState(e);return animation.mix<.5?animation.frame:animation.next}
  function voidLeviathanNodePixelAtFrame(phase,index,frame){const base=voidLeviathanGranularNodeBases[phase][index]||voidLeviathanGranularNodeBases[phase][0],motion=voidLeviathanGranularNodeMotion[phase][index]||voidLeviathanGranularNodeMotion[phase][0],shift=voidLeviathanGranularFrameShift[phase][frame]||voidLeviathanGranularFrameShift[phase][0],angle=frame/16*Math.PI*2+motion[2];return{x:base[0]+shift[0]+(Math.sin(angle)-Math.sin(motion[2]))*motion[0],y:base[1]+shift[1]+(Math.cos(angle)-Math.cos(motion[2]))*motion[1]}}
  function voidLeviathanNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  function voidLeviathanSpriteCell(phase,frame,between=false){return{asset:between?bossInbetween32Asset(5,phase):voidLeviathanGranularSprites[phase],pose:frame,cols:4,rows:4}}
  function prismWardenAnimationState(e){return boss32AnimationState(e,e.phase===2?4.05:3.5)}
  function prismWardenNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  function gravebellAnimationState(e){return boss32AnimationState(e,e.phase===2?4:3.6)}
  function gravebellFrameShift(phase,frame){const anchor=gravebellNodePixels[phase][0][1],current=gravebellNodePixels[phase][frame][1];return[anchor[0]-current[0],anchor[1]-current[1]]}
  function gravebellNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  function solarHydraAnimationState(e){return boss32AnimationState(e,e.phase===2?4.1:3.65)}
  function solarHydraFrameShift(phase,frame){const anchor=solarHydraNodePixels[phase][0][3],current=solarHydraNodePixels[phase][frame][3];return[anchor[0]-current[0],anchor[1]-current[1]]}
  function solarHydraNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  function omegaHeartAnimationState(e){return boss32AnimationState(e,e.phase===2?3.9:3.55)}
  function omegaHeartFrameShift(phase,frame){const anchor=omegaHeartNodePixels[phase][0][0],current=omegaHeartNodePixels[phase][frame][0];return[anchor[0]-current[0],anchor[1]-current[1]]}
  function omegaHeartNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  // Body, armor sockets, collision and debris share one stable render pose.
  // A hit should read as weight and surface damage, not rubber deformation.
  function enemyRenderPose(e){
    const hit=clamp(e.hitFlash||0,0,.2),mini=e.kind==='mini',motion=settings.reducedMotion?0:hit,angle=bossVisualAngle(e),scaleX=1+motion*.12,scaleY=1-motion*.07;
    let x=e.x+(mini?motion*4:Math.sin(t*165)*motion*14),y=e.y;
    if(mini){
      const registration=miniBossFrameRegistration(e),breathe=bossSpriteMotion(e),intent=settings.reducedMotion?0:miniBossAttackIntent(e),recoil=settings.reducedMotion?0:miniBossRecoilOffset(e),dx=registration.dx*scaleX*breathe.x+recoil-intent*1.8,dy=registration.dy*scaleY*breathe.y;
      x+=dx*Math.cos(angle)-dy*Math.sin(angle);y+=dx*Math.sin(angle)+dy*Math.cos(angle)
    }
    return{x,y,angle,scaleX,scaleY}
  }
  function applyEnemyPose(e,includeMotion=false){
    const pose=enemyRenderPose(e),motion=includeMotion?bossSpriteMotion(e):{x:1,y:1};
    ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(pose.scaleX*motion.x,pose.scaleY*motion.y)
  }
  function localWeakNode(e,node){
    if(e.kind==='mini')return miniBossNodeOffset(e,node);
    if(e.epic)return epicNodeOffset(e,node);
    const offsets=[bloodstarNodeOffset,twinMawNodeOffset,helixNodeOffset,riftNodeOffset,ironBloomNodeOffset,voidLeviathanNodeOffset,prismWardenNodeOffset,gravebellNodeOffset,solarHydraNodeOffset,omegaHeartNodeOffset];
    return offsets[e.type]?.(e,node)||node
  }
  function worldWeakNode(e,node){
    const motion=bossSpriteMotion(e),pose=enemyRenderPose(e),offset=localWeakNode(e,node),dx=offset.dx*motion.x*pose.scaleX,dy=offset.dy*motion.y*pose.scaleY,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle),index=node.voidLeviathanIndex??node.prismWardenIndex??node.gravebellIndex??node.solarHydraIndex??node.omegaHeartIndex??0;
    const r=e.kind==='mini'?(e.type===0?14:11):e.epic?12:e.type===0?17:e.type===5?(index===2?15:index>=3?10:8):e.type===6?(index===0?16:13):e.type===7?(e.phase===2&&index===1?20:12):e.type===8?(e.phase===2&&index===3?19:13):e.type===9?(index===0?18:index>=3?11:14):12;
    return{x:pose.x+dx*cos-dy*sin,y:pose.y+dx*sin+dy*cos,r}
  }
  function detachBloodstarTentacle(e,node,world){if(e.kind!=='boss'||e.type!==0||node.tentacleIndex<0||node.detached)return false;const animation=bloodstarAnimationState(e),frame=animation.mix>.5?animation.next:animation.frame,phase=e.phase-1,index=node.tentacleIndex,point=bloodstarNodePixels[phase][frame][node.bloodstarIndex],scale=224/627,rootDx=(point[0]-313.5)*scale,rootDy=(point[1]-313.5)*scale,angle=bloodstarTentacleAngles[phase][frame][index]+bossVisualAngle(e),speed=rand(95,150);node.detached=true;bossFragments.push({asset:bloodstarTentacleFragments[phase][index],frame,x:world.x,y:world.y,rootDx,rootDy,size:224,rot:bossVisualAngle(e),vx:Math.cos(angle)*speed-35,vy:Math.sin(angle)*speed,vr:rand(-3.8,3.8),life:2.7,max:2.7,smoke:0});particlesAt(world.x,world.y,'#ff315f',34,250);particlesAt(world.x,world.y,'#ffb0c8',18,175);debrisAt(world.x,world.y,'#ff315f',14,1.35);shake=Math.max(shake,16);sfx.tentacleBreak();return true}
  function shedTwinMawShards(e,node,world,count){const side=Math.sign(world.y-e.y)||1;for(let i=0;i<count;i++)bossFragments.push({procedural:'twinMawShard',x:world.x+rand(-6,6),y:world.y+rand(-4,4),w:rand(5,10),h:rand(3,6),color:e.phase===1?'#ff8126':'#ffb13b',rot:rand(-1,1),vx:rand(-145,-65),vy:side*rand(35,105)+rand(-38,38),vr:rand(-8,8),life:rand(1.25,2),max:2,smoke:0});particlesAt(world.x,world.y,'#ff9b31',10,130);sfx.enemyBreak(false)}
  function detachTwinMawPlate(e,node,world){if(e.kind!=='boss'||e.type!==1||node.twinMawIndex===undefined||node.detached)return false;const side=Math.sign(world.y-e.y)||1;node.detached=true;bossFragments.push({procedural:'twinMawPlate',x:world.x,y:world.y,w:rand(15,20),h:rand(9,13),color:e.phase===1?'#ff8a28':'#ffb13b',rot:bossVisualAngle(e)+side*.16,vx:rand(-165,-95),vy:side*rand(65,125),vr:side*rand(3.4,5.8),life:2.35,max:2.35,smoke:0});particlesAt(world.x,world.y,'#ff8a28',28,230);particlesAt(world.x,world.y,'#fff078',10,155);debrisAt(world.x,world.y,'#ff8a28',10,1.15);shake=Math.max(shake,14);sfx.tentacleBreak();return true}
  function shedHelixShards(e,world,count){const side=Math.sign(world.y-e.y)||rand(-1,1);for(let i=0;i<count;i++)bossFragments.push({procedural:'helixShard',x:world.x+rand(-6,6),y:world.y+rand(-5,5),w:rand(4,9),h:rand(3,7),color:e.phase===1?'#8d67ff':'#c66cff',rot:rand(-2,2),vx:rand(-155,-65),vy:side*rand(32,110)+rand(-45,45),vr:rand(-10,10),life:rand(1.3,2.1),max:2.1,smoke:0});particlesAt(world.x,world.y,'#b78cff',12,145);sfx.enemyBreak(false)}
  function detachHelixPlate(e,node,world){if(e.kind!=='boss'||e.type!==2||node.helixIndex===undefined||node.detached)return false;const side=helixNodeSide(node)||Math.sign(world.y-e.y)||1;node.detached=true;bossFragments.push({procedural:'helixCrownPlate',x:world.x,y:world.y,w:rand(16,23),h:rand(7,12),color:e.phase===1?'#8b63ff':'#d66dff',rot:bossVisualAngle(e)+side*.22,vx:rand(-175,-90),vy:side*rand(70,135),vr:side*rand(4.2,7.5),life:2.5,max:2.5,smoke:0});particlesAt(world.x,world.y,'#b78cff',30,245);particlesAt(world.x,world.y,'#ffffff',12,175);debrisAt(world.x,world.y,'#8b63ff',12,1.25);shake=Math.max(shake,15);sfx.tentacleBreak();return true}
  function shedRiftShards(e,world,count){const side=Math.sign(world.y-e.y)||rand(-1,1);for(let i=0;i<count;i++)bossFragments.push({procedural:'riftShard',x:world.x+rand(-7,7),y:world.y+rand(-5,5),w:rand(4,10),h:rand(3,7),color:e.phase===1?'#3bf2e4':'#73fff4',rot:rand(-2,2),vx:rand(-170,-70),vy:side*rand(38,120)+rand(-50,50),vr:rand(-11,11),life:rand(1.25,2.15),max:2.15,smoke:0});particlesAt(world.x,world.y,'#5cfff1',13,155);sfx.enemyBreak(false)}
  function detachRiftBlade(e,node,world){if(e.kind!=='boss'||e.type!==3||node.riftIndex===undefined||node.detached)return false;const slot=riftNodeSlot(e,node),side=slot===-1?-1:slot===1?1:Math.sign(world.y-e.y)||1;node.detached=true;bossFragments.push({procedural:'riftBladePlate',x:world.x,y:world.y,w:rand(18,26),h:rand(7,12),color:e.phase===1?'#29d8cf':'#6efff4',rot:bossVisualAngle(e)+side*.3,vx:rand(-185,-95),vy:side*rand(75,145),vr:side*rand(4.8,8.2),life:2.6,max:2.6,smoke:0});particlesAt(world.x,world.y,'#5cfff1',32,260);particlesAt(world.x,world.y,'#ffffff',13,185);debrisAt(world.x,world.y,'#22d8cf',13,1.3);shake=Math.max(shake,16);sfx.tentacleBreak();return true}
  function shedIronBloomShards(e,world,count){const side=Math.sign(world.y-e.y)||rand(-1,1);for(let i=0;i<count;i++)bossFragments.push({procedural:'ironBloomShard',x:world.x+rand(-7,7),y:world.y+rand(-5,5),w:rand(5,11),h:rand(3,7),color:e.phase===1?'#e99a21':'#ffbc35',rot:rand(-2,2),vx:rand(-175,-75),vy:side*rand(35,120)+rand(-48,48),vr:rand(-10,10),life:rand(1.3,2.15),max:2.15,smoke:0});particlesAt(world.x,world.y,'#ffb22f',13,155);sfx.enemyBreak(false)}
  function detachIronBloomPlate(e,node,world){if(e.kind!=='boss'||e.type!==4||node.ironBloomIndex===undefined||node.detached)return false;const side=Math.sign(world.y-e.y)||1;node.detached=true;bossFragments.push({procedural:'ironBloomPlate',x:world.x,y:world.y,w:rand(18,27),h:rand(8,13),color:e.phase===1?'#e99a21':'#ffc13d',rot:bossVisualAngle(e)+side*.24,vx:rand(-180,-95),vy:side*rand(70,140),vr:side*rand(4.2,7.6),life:2.6,max:2.6,smoke:0});particlesAt(world.x,world.y,'#ffad27',34,255);particlesAt(world.x,world.y,'#fff1ad',14,180);debrisAt(world.x,world.y,'#d98919',13,1.3);shake=Math.max(shake,16);sfx.tentacleBreak();return true}
  function weakExposureDuration(e){return e.kind==='mini'?(e.type===0?3.2:2.35):e.phase===1?3.2:2.8}
  function updateWeakPoint(e,dt){
    const nodes=activeWeakNodes(e);if(nodes.every(n=>n.destroyed)){e.weakOpen=false;e.weakTelegraph=0;return}
    const authored=e.kind==='mini'||(e.type===0&&e.kind==='boss'&&!e.epic);
    if(authored){
      if(e.weakOpen){e.weakTimer-=dt;if(e.weakTimer<=0){e.weakOpen=false;e.weakTimer=e.kind==='mini'?.78:e.phase===1?1.05:.78}}
      else if(e.weakTelegraph>0){e.weakTelegraph=Math.max(0,e.weakTelegraph-dt);if(e.weakTelegraph<=0){e.weakOpen=true;e.weakTimer=weakExposureDuration(e);sfx.weakOpen()}}
      else{e.weakTimer-=dt;if(e.weakTimer<=0)e.weakTelegraph=e.kind==='mini'?.52:e.phase===1?.55:.42}
      return
    }
    e.weakTimer-=dt;if(e.weakTimer<=0){e.weakOpen=!e.weakOpen;if(e.weakOpen){e.weakTimer=rand(1.35,2.15);sfx.weakOpen()}else e.weakTimer=rand(.65,1.05)}
  }
  const encounterDamageFeedback=new WeakMap();
  function encounterTrailHp(e){
    const hp=clamp(e.hp,0,e.max),feedback=encounterDamageFeedback.get(e),clock=Number.isFinite(e.clock)?e.clock:t;
    if(settings.reducedMotion||artInspection||!feedback||feedback.phase!==e.phase||feedback.max!==e.max||clock<feedback.clock||Math.abs(feedback.hp-hp)>.0001)return hp;
    return clamp(hp+(feedback.trail-hp)*Math.exp(-9*(clock-feedback.clock)),hp,e.max)
  }
  function noteEncounterDamage(e,previousHp){
    if(artInspection||!(previousHp>e.hp))return;
    const clock=Number.isFinite(e.clock)?e.clock:t,feedback=encounterDamageFeedback.get(e),valid=feedback&&feedback.phase===e.phase&&feedback.max===e.max&&clock>=feedback.clock&&Math.abs(feedback.hp-previousHp)<.0001;
    const trail=valid?previousHp+(feedback.trail-previousHp)*Math.exp(-9*(clock-feedback.clock)):previousHp;
    const next=feedback||{};Object.assign(next,{hp:e.hp,trail:clamp(trail,e.hp,e.max),clock,max:e.max,phase:e.phase});encounterDamageFeedback.set(e,next)
  }
  function damageWeakNode(e,node,amount,feedback='core'){
    if(node.destroyed)return;const previousHp=e.hp,weaponsBefore=node.hp-amount<=.001?encounterWeaponState(e):null;node.hitTime=e.clock;e.hitFlash=Math.max(e.hitFlash||0,.11);const dealt=Math.min(node.hp,amount);node.hp-=dealt;e.hp=Math.max(0,e.hp-dealt);const ratio=node.hp/node.max;
    if(runStats&&!bossLab)runStats.damageDealt+=dealt;addDose(dealt*.015);if(dealt>0&&node.hp>.001&&feedback!=='armor')sfx.coreHit();
    if(e.kind==='boss'&&e.type===1){e.mawDamageKick=1;e.mawDamageSide=twinMawNodeSide(e,node);if(node.hp>.001){const stage=ratio<.25?2:ratio<.55?1:0;if(stage>(node.damageStage||0)){node.damageStage=stage;const w=worldWeakNode(e,node);shedTwinMawShards(e,node,w,stage===2?5:3);shake=Math.max(shake,stage===2?7:4)}}}
    if(e.kind==='boss'&&e.type===2){e.helixDamageKick=1;e.helixDamageSide=helixNodeSide(node);if(node.hp>.001){const stage=ratio<.25?2:ratio<.55?1:0;if(stage>(node.damageStage||0)){node.damageStage=stage;const w=worldWeakNode(e,node);shedHelixShards(e,w,stage===2?6:3);shake=Math.max(shake,stage===2?8:5)}}}
    if(e.kind==='boss'&&e.type===3){e.riftDamageKick=1;e.riftDamageSlot=riftNodeSlot(e,node);if(node.hp>.001){const stage=ratio<.25?2:ratio<.55?1:0;if(stage>(node.damageStage||0)){node.damageStage=stage;const w=worldWeakNode(e,node);shedRiftShards(e,w,stage===2?7:4);shake=Math.max(shake,stage===2?9:5)}}}
    if(e.kind==='boss'&&e.type===4){e.ironDamageKick=1;e.ironDamageSlot=node.ironBloomIndex??0;if(node.hp>.001){const stage=ratio<.25?2:ratio<.55?1:0;if(stage>(node.damageStage||0)){node.damageStage=stage;const w=worldWeakNode(e,node);shedIronBloomShards(e,w,stage===2?7:4);shake=Math.max(shake,stage===2?9:5)}}}
    if(!node.damageShown&&ratio<.5){node.damageShown=true;const w=worldWeakNode(e,node);particlesAt(w.x,w.y,'#ff7849',10,105);debrisAt(w.x,w.y,'#7d2637',4,.55)}
    if(node.hp<=.001){
      node.hp=0;node.destroyed=true;diagnostics.mark('part-break');
      if(runStats&&!bossLab)runStats.weakspotsDestroyed++;
      if(player.weakBreakDose)addDose(player.weakBreakDose);
      if(player.weakOverdrive){if(streamlined())player.lootSurgeStrength=Math.max(player.lootSurge>0?player.lootSurgeStrength||.06:0,.06);player.lootSurge=Math.max(player.lootSurge,player.weakOverdrive)}
      const w=worldWeakNode(e,node),bloodstar=detachBloodstarTentacle(e,node,w),native=!bloodstar&&detachNativePart(e,node);
      if(native){
        const color=e.kind==='mini'?e.def.color:e.phase===1?e.def.c1:e.def.c2;
        particlesAt(w.x,w.y,'#fff2d9',10,160);particlesAt(w.x,w.y,color,6,110);debrisAt(w.x,w.y,'#82929d',3,.65);
        if(e.kind==='mini')sfx.weakBreak();else sfx.tentacleBreak()
      }else{
        particlesAt(w.x,w.y,'#ffffff',22,190);particlesAt(w.x,w.y,'#ff3d81',14,130);debrisAt(w.x,w.y,'#ff3d81',7,e.kind==='boss'?1.2:.8);
        const detached=bloodstar||detachTwinMawPlate(e,node,w)||detachHelixPlate(e,node,w)||detachRiftBlade(e,node,w)||detachIronBloomPlate(e,node,w);
        if(!detached)sfx.weakBreak()
      }
      if(weaponsBefore)noteEncounterWeaponBreak(e,weaponsBefore);
      shake=Math.max(shake,10);
      if(activeWeakNodes(e).every(n=>n.destroyed))e.hp=e.kind==='boss'?(e.epic?e.max*(1-e.phase*.25):(e.phase===1?e.max*.5:0)):0
    }
    noteEncounterDamage(e,previousHp)
  }
  function damageSmokeIntensity(hp,max){return clamp((.8-hp/Math.max(.001,max))/.8,0,1)}
  const damageSmokeSprites=[false,true].map(dark=>{
    const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const paint=sprite.getContext('2d');
    for(const[x,y,r]of[[26,23,23],[40,35,22],[21,43,18]]){
      const cloud=paint.createRadialGradient(x,y,1,x,y,r),rgb=dark?'91,100,111':'151,159,168';
      cloud.addColorStop(0,`rgba(${rgb},.72)`);cloud.addColorStop(.4,`rgba(${rgb},.48)`);cloud.addColorStop(.78,`rgba(${rgb},.14)`);cloud.addColorStop(1,`rgba(${rgb},0)`);
      paint.fillStyle=cloud;paint.fillRect(x-r,y-r,r*2,r*2)
    }
    return sprite
  });
  function drawDamageSmoke(particle){
    const age=1-clamp(particle.life/particle.max,0,1),size=particle.s*(1.4+age*2.8);
    ctx.save();ctx.translate(particle.x,particle.y);ctx.rotate((particle.turn||0)+age*.22);ctx.drawImage(damageSmokeSprites[particle.heavy?1:0],-size/2,-size/2,size,size);ctx.restore()
  }
  function updateParticles(dt){
    const drag=particles.length?Math.pow(.97,dt*60):1;
    for(const particle of particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vx*=drag;particle.vy*=drag;particle.life-=dt}
    particles=particles.filter(particle=>particle.life>0)
  }
  function emitDamageSmoke(owner,point,intensity,dt,small=false){
    if(intensity<=0||dt<=0){if(intensity<=0)owner.damageSmokeClock=0;return}
    owner.damageSmokeClock=(owner.damageSmokeClock||0)+dt*(2+intensity*(small?12:22));
    const count=Math.min(4,Math.floor(owner.damageSmokeClock+1e-9));owner.damageSmokeClock-=count;
    for(let index=0;index<count;index++){
      const life=.6+intensity*.85+rand(0,.16),size=(small?1.8:2.3)+intensity*(small?3.2:4.5);
      addParticle({smoke:true,damageSmoke:true,heavy:intensity>.65,turn:rand(-1,1),x:point.x+rand(-2,2),y:point.y+rand(-2,2),vx:rand(-20,5),vy:rand(-25,-9)-intensity*9,life,max:life,c:intensity>.65?'#59616c':'#8b939c',s:size*rand(.8,1.15)});
      if(intensity>.7&&index===0)addParticle({x:point.x,y:point.y,vx:rand(-14,20),vy:rand(-24,5),life:.24,max:.24,c:'#e7ac70',s:small?1:1.5})
    }
  }
  function emitRegularEnemyDamageSmoke(e,dt){
    if(e.dead||e.hp<=0)return;
    emitDamageSmoke(e,{x:e.x+e.r*.45,y:e.y+e.r*.12},damageSmokeIntensity(e.hp,e.maxHp||e.hp),dt,true)
  }
  function emitWeakSmoke(e,dt){
    const stumps=new Set();
    for(const node of activeWeakNodes(e)){
      const stump=node.destroyed?nativeSeveredSmokeAnchor(e,node):null;
      if(stump){const key=stump.groupId||`${stump.x.toFixed(2)}/${stump.y.toFixed(2)}`;if(stumps.has(key))continue;stumps.add(key)}
      const intensity=node.destroyed?.9:damageSmokeIntensity(node.hp,node.max),point=stump||worldWeakNode(e,node);
      emitDamageSmoke(node,point,intensity,dt)
    }
  }
  const weakPointFrames=new WeakMap();
  function snapshotWeakPointFrame(e,dt){
    if(!e)return;
    weakPointFrames.delete(e);
    if(state!=='playing'||!(dt>0&&dt<=.05)||!Number.isFinite(e.clock)||!bossDamageAllowed(e)||!e.weakOpen)return;
    const nodes=activeWeakNodes(e),points=new Map();
    for(const node of nodes)if(!node.destroyed)points.set(node,worldWeakNode(e,node));
    weakPointFrames.set(e,{phase:e.phase,nodes,clock:e.clock,dt,points});
  }
  function sweptWeakPointHit(shot,e,node,dt){
    const current=worldWeakNode(e,node);
    if(sweptHit(shot,current))return true;
    const frame=weakPointFrames.get(e);
    if(state!=='playing'||!(dt>0)||node.destroyed||!bossDamageAllowed(e)||!e.weakOpen||e!==boss&&e!==miniBoss||!frame||frame.phase!==e.phase||frame.nodes!==activeWeakNodes(e)||Math.abs(frame.dt-dt)>1e-8||Math.abs(e.clock-frame.clock-dt)>1e-8)return false;
    const previous=frame.points.get(node);if(!previous)return false;
    // Sweep relative motion within this one exposed simulation step. Core
    // radii and the native pose used for drawing remain unchanged.
    return sweptHit({px:(shot.px??shot.x)-previous.x,py:(shot.py??shot.y)-previous.y,x:shot.x-current.x,y:shot.y-current.y,r:shot.r},{x:0,y:0,r:Math.min(previous.r,current.r)});
  }
  function bossDamageAllowed(e){return !(e.intro>0||e.phaseTransition>0||e.hidden||e.ritual)}
  function damageBossArmor(e,shot){
    if(!bossDamageAllowed(e))return false;
    // Armor chips the same phase health pool as the cores. It can finish an
    // encounter without forcing the pilot behind a surviving rear appendage.
    const nodes=activeWeakNodes(e).filter(node=>!node.destroyed).sort((a,b)=>Math.abs(worldWeakNode(e,a).y-shot.y)-Math.abs(worldWeakNode(e,b).y-shot.y));
    let remaining=shot.d*.25,dealt=0;
    for(const node of nodes){const amount=Math.min(node.hp,remaining);if(amount<=0)break;damageWeakNode(e,node,amount,'armor');remaining-=amount;dealt+=amount}if(dealt>0)sfx.armorHit();
    return dealt>0
  }
  function armoredHits(e,color,dt){
    const nodes=activeWeakNodes(e),canDamage=bossDamageAllowed(e);emitWeakSmoke(e,dt);
    for(const b of shots){
      if(b.dead)continue;
      const node=canDamage&&e.weakOpen?nodes.find(n=>!n.destroyed&&sweptWeakPointHit(b,e,n,dt)):null;
      if(node){b.dead=true;damageWeakNode(e,node,b.d*player.weakDamage);trainingNote('weakHit');const w=worldWeakNode(e,node);particlesAt(w.x,w.y,'#ffffff',5,100);shake=Math.max(shake,b.charge?6:2);continue}
      if(!sweptHit(b,e))continue;
      const openChannel=canDamage&&e.weakOpen&&nodes.some(n=>{if(n.destroyed)return false;const w=worldWeakNode(e,n),shotStartX=b.px??b.x;return Math.min(shotStartX,b.x)<w.x+w.r+6&&Math.abs(b.y-w.y)<b.r+w.r+4});
      if(openChannel)continue;
      b.dead=true;const chipped=damageBossArmor(e,b);if(chipped)trainingNote('armorHit');particlesAt(b.x,b.y,chipped?'#e3b96d':'#8b9aa8',chipped?3:2,chipped?68:52)
    }
    if(canDamage&&e.weakOpen&&player.pod.owned){const node=nodes.find(n=>!n.destroyed&&hit(player.pod,worldWeakNode(e,n)));if(node)damageWeakNode(e,node,16*player.podDamage*player.weakDamage*dt)}
    weakPointFrames.delete(e);
  }
  function handleBossDefeat(b){
    const defeatedName=b.def.name,nextWave=wave+1,nextLabIndex=bossLabIndex+1;clearInput();
    particlesAt(b.x,b.y,b.def.c2,90,340);debrisAt(b.x,b.y,b.def.c2,42,1.8);sfx.enemyBreak(true);sfx.victory();boss=null;enemyShots.length=0;shots.length=0;
    if(bossLab){
      if(bossLabLevel){victoryDelay={time:1.15,run:()=>openBossLab(`${currentStage().name} FULL RUN VERIFIED — SELECT ANOTHER TEST`)};return}
      const total=bossLabEpic?epicBossTypes.length:bossTypes.length;
      victoryDelay={time:1.15,run:()=>{if(bossLabRunAll&&nextLabIndex<total)(bossLabEpic?launchEpicBossLabBoss:launchBossLabBoss)(nextLabIndex);else openBossLab(bossLabRunAll?`ALL ${total} ${bossLabEpic?'EPIC ':''}BOSSES VERIFIED — SELECT ANOTHER TEST`:`${defeatedName} VERIFIED — SELECT ANOTHER BOSS`)}};
      return
    }
    clearRunCheckpoint();if(runMode!=='rush')profile.progress.missionsCleared[wave-1]=true;
    if(b.epic){
      if(runStats)runStats.epicBosses++;profile.progress.epicBossesDefeated[b.epicId]++;score+=12000+wave*700;
      collectGear(generateGear(4,1,'Exotic',{source:'SECRET EPIC ASTERPRINT'}));bankRunLoot('EXOTIC ASTERPRINT SECURED');saveProfile('EPIC VICTORY AUTOSAVED');
      queueRunDoctrine(`${defeatedName} ANNIHILATED // EPIC DOCTRINE`,nextWave,2.1);return
    }
    if(runStats)runStats.normalBosses++;profile.progress.normalBossesDefeated[b.type]=true;if(!profile.progress.epicUnlocked&&profile.progress.normalBossesDefeated.every(Boolean))profile.progress.epicUnlocked=true;saveProfile('PROGRESS AUTOSAVED');
    score+=3500+wave*250;const apexTier=Math.random()<.18?3:2;collectGear(generateGear(apexTier,1,apexTier===3?'Super-Rare':'Rare',{source:'APEX ASTERPRINT'}));bankRunLoot('APEX LOOT SECURED');queueRunDoctrine(`${defeatedName} DESTROYED // DOCTRINE POINT AWARDED`,nextWave,1.65)
  }
  function updateBossFight(b,dt){
    if(b.epic){updateEpicBossFight(b,dt);return}
    b.clock+=dt;b.hitFlash=Math.max(0,(b.hitFlash||0)-dt);b.phaseFlash=Math.max(0,b.phaseFlash-dt);b.mawRecoil=Math.max(0,(b.mawRecoil||0)-dt*3.8);b.mawDamageKick=Math.max(0,(b.mawDamageKick||0)-dt*7);b.helixRecoil=Math.max(0,(b.helixRecoil||0)-dt*4.4);b.helixDamageKick=Math.max(0,(b.helixDamageKick||0)-dt*7.5);b.riftRecoil=Math.max(0,(b.riftRecoil||0)-dt*4.8);b.riftDamageKick=Math.max(0,(b.riftDamageKick||0)-dt*8);b.riftWarp=Math.max(0,(b.riftWarp||0)-dt*3.6);b.ironRecoil=Math.max(0,(b.ironRecoil||0)-dt*(b.phase===2?4.6:4));b.ironCycle=(b.ironCycle||0)+dt;b.ironDamageKick=Math.max(0,(b.ironDamageKick||0)-dt*7.5);b.prismRecoil=Math.max(0,(b.prismRecoil||0)-dt*4.2);b.gravebellRecoil=Math.max(0,(b.gravebellRecoil||0)-dt*3.4);b.solarHydraRecoil=Math.max(0,(b.solarHydraRecoil||0)-dt*3.8);b.omegaHeartRecoil=Math.max(0,(b.omegaHeartRecoil||0)-dt*3.2);const priorMoveTimer=b.moveTimer;updateBossMovement(b,dt);if(b.type===3&&b.moveTimer>priorMoveTimer){b.riftWarp=1;b.riftWarpDir=Math.sign(b.targetY-b.y)||1}
    b.attackCue=Math.max(0,(b.attackCue||0)-dt);b.bloodstarRecoil=Math.max(0,(b.bloodstarRecoil||0)-dt*5.5);
    if(b.laser&&encounterBeamDisabled(b))b.laser=null;
    if(b.laser){b.laser.t-=dt;if(b.laser.t<.72&&Math.abs(player.y-b.laser.y)<18&&player.x<b.x)damage(1,{kind:'beam'});if(b.laser.t<=0)b.laser=null}if(state!=='playing')return;
    if((b.phaseTransition||0)>0){b.phaseTransition=Math.max(0,b.phaseTransition-dt);b.weakOpen=false;b.weakTelegraph=0;armoredHits(b,b.def.c2,dt);return}
    if(b.intro>0){b.intro-=dt;b.weakOpen=false;armoredHits(b,b.def.c1,dt);return}
    b.cool-=dt;updateWeakPoint(b,dt);if(b.cool<=0){if(b.type===2)b.helixRecoil=1;if(b.type===3)b.riftRecoil=1;if(b.type===9)b.omegaHeartRecoil=1;bossAttack(b)}armoredHits(b,b.phase===1?b.def.c1:b.def.c2,dt);if(b.hp>(b.phase===1?b.max*.5:0)&&hit(b,player))damage(1,{kind:'contact',boss:true});if(state!=='playing')return;
    if(b.phase===1&&b.hp<=b.max*.5){b.phase=2;b.weakOpen=false;b.weakTelegraph=0;b.weakTimer=1;b.cool=1.3;b.phaseTransition=b.type===0?1.55:0;b.phaseFlash=2.2;b.attackAngle=0;b.attackCycle=0;b.queuedAttack=null;b.attackCue=0;b.mawRecoil=b.type===1?1.4:0;b.helixRecoil=b.type===2?1.5:0;b.riftRecoil=b.type===3?1.6:0;b.riftWarp=b.type===3?1:0;b.riftWarpDir=b.type===3?-1:b.riftWarpDir;b.ironRecoil=b.type===4?1.6:0;b.ironCycle=0;b.prismRecoil=b.type===6?1.6:0;b.gravebellRecoil=b.type===7?1.8:0;b.solarHydraRecoil=b.type===8?1.8:0;b.omegaHeartRecoil=b.type===9?2:0;b.laser=null;enemyShots.length=0;shake=24;particlesAt(b.x,b.y,b.def.c2,55,260);debrisAt(b.x,b.y,b.def.c2,18,1.25);sfx.phase()}
    if(b.hp<=0)handleBossDefeat(b)
  }
  function damage(amount=1){
    if(state!=='playing'||player.hp<=0||player.inv>0)return;
    if(trainingSession&&player.shield<=0){player.inv=.4;return}
    if(player.evade&&Math.random()<player.evade){if(runStats&&!bossLab)runStats.evades++;player.inv=.35;particlesAt(player.x,player.y,'#4ef5ff',12,170);sfx.evade();return}
    const beforeHp=player.hp;let color='#ffd166',count=8,kick=3;
    if(player.shield>0){if(runStats&&!bossLab)runStats.shieldsLost++;player.shield--;trainingNote('shieldHit');player.shieldHit=.28;player.inv=.5;color='#78edff';count=8;kick=4;sfx.shield()}
    else{
      if(player.ablativeReady){player.ablativeReady=false;amount=Math.max(0,amount-1)}
      if(amount<=0){player.inv=.7;sfx.shield()}
      else if(player.hp-amount<=0&&player.secondChanceReady){player.secondChanceReady=false;player.hp=1;player.inv=1.8;systemToast(streamlined()?'SECOND CHANCE // LETHAL HIT DENIED':'CITADEL SIGNAL // LETHAL HIT DENIED','#ffd166');sfx.shield()}
      else{player.hp=Math.max(0,player.hp-amount);player.inv=1.2;sfx.hurt()}
    }
    const hullLost=beforeHp-player.hp;
    if(hullLost>0){noteCombatLoss(arguments[1]);if(runStats&&!bossLab)runStats.damageTaken+=hullLost;player.hullHit=.28;color='#ff3d81';count=18;kick=12}
    shake=Math.max(shake,kick);particlesAt(player.x,player.y,color,count,hullLost>0?190:110);if(player.hp<=0){if(trainingSession){player.hp=player.maxHp;systemToast('PRACTICE HULL RESTORED','#4ef5ff')}else over()}hud()
  }

  function over(){if(state==='gameover')return;captureRetryPoint();state='gameover';mouse.firing=false;sfx.gameover();pauseMusic();$('#loot-toast').classList.remove('show');const secured=runLoot.length;if(bossLab)runLoot=[];else{runActive=false;runOutcome='lost';clearRunCheckpoint();bankRunLoot();best=Math.max(best,score|0);finalizeRunProfile()}const labTotal=bossLabLevel?stageDefs.length:bossLabEpic?epicBossTypes.length:bossTypes.length,labName=bossLabLevel?'LEVEL LAB':bossLabEpic?'EPIC BOSS LAB':'BOSS LAB';$('#final-score').textContent=(score|0).toString().padStart(6,'0');$('#final-stats').textContent=bossLab?`${labName} ${bossLabIndex+1} / ${labTotal}  •  TEST DATA NOT SAVED`:`${runModeName()} · MISSION ${wave}  •  ${kills} DESTROYED  •  ${runStats?.normalBosses||0} APEX  •  ${runStats?.epicBosses||0} EPIC  •  ${secured} GEAR`;$('#hud').classList.add('hidden');renderCombatLoss();show('gameover');renderRunMenu()}
  function firstSupportDrop(e){
    // Existing formation leaders carry a missing first support weapon. Saved
    // kit state supplies the guard; upgrades retain their ordinary random roll.
    const carrier=e.type==='drone'&&e.formationIndex===0&&e.formationCount===4;
    if(bossLab||!['story','replay'].includes(runMode)||wave<2||!carrier)return null;
    if(player.missileLevel<1)return'missile';
    return wave>=3&&player.bits<1?'bit':null;
  }
  function drop(e){
    if(trainingSession)return;const caps=enforceCombatProgression(),colors=['red','blue','yellow'],combatPickupActive=pickups.some(p=>!p.dead&&p.type!=='gear');
    if(!player.pod.owned){if(!combatPickupActive)pickups.push({x:e.x,y:e.y,r:11,type:'crystal',color:colors[Math.floor(Math.random()*colors.length)],spin:0})}
    else if(!combatPickupActive){
      const firstSupport=firstSupportDrop(e);
      if(firstSupport)pickups.push({x:e.x,y:e.y,r:10,type:firstSupport,spin:0});
      else{
      const roll=Math.random(),canUpgrade=player.laserLevel<caps.force,crystalChance=canUpgrade?.025:.004,missileChance=player.missileLevel<caps.missile?.01:.0015,bitChance=player.bits<caps.bits?.008:.0015;
      if(roll<crystalChance){const keepColor=canUpgrade&&Math.random()<.9,color=keepColor?player.laserColor:colors[Math.floor(Math.random()*colors.length)];pickups.push({x:e.x,y:e.y,r:11,type:'crystal',color,spin:0})}
      else if(roll<crystalChance+missileChance)pickups.push({x:e.x,y:e.y,r:10,type:'missile',spin:0});
      else if(roll<crystalChance+missileChance+bitChance)pickups.push({x:e.x,y:e.y,r:10,type:'bit',spin:0});
      else if(roll<crystalChance+missileChance+bitChance+.012)pickups.push({x:e.x,y:e.y,r:8,type:'shield',spin:0})
      }
    }
    if(!bossLab&&Math.random()<.006){const tier=Math.random()<.28?1:0;pickups.push({x:e.x,y:e.y,r:10,type:'gear',gear:generateGear(tier,1,tier?'Uncommon':'Common',{source:'FIELD ASTERPRINT'}),spin:0})}
  }
  function defeatEnemy(e){if(e.dead)return;e.dead=true;kills++;addDose(e.type==='turret'?7:4);score+=e.type==='turret'?100:40;drop(e);particlesAt(e.x,e.y,e.c,14,180);debrisAt(e.x,e.y,e.c,e.type==='turret'?13:8,e.type==='turret'?1.1:.75);shake=Math.max(shake,4);sfx.enemyBreak(false)}
  function collectCombatPickup(p){trainingNote('pickup',{type:p.type,color:p.color});
    const caps=enforceCombatProgression(),surplus=label=>{const dose=streamlined()?player.surplusDose:2;addDose(dose);systemToast(`${label} // MISSION LIMIT · +${dose} DOSE`,'#bdeeff')};
    if(p.type==='crystal'){
      const first=!player.pod.owned,capped=player.laserLevel>=caps.force;player.pod.owned=true;player.pod.mode='returning';player.pod.dockSide='front';player.pod.returnSide='front';player.laserColor=p.color;player.laserLevel=Math.min(caps.force,player.laserLevel+1);
      if(capped)surplus(`${p.color.toUpperCase()} FORCE COLOR · LEVEL ${player.laserLevel}`);
      else systemToast(first?`FORCE POD EQUIPPED // ${p.color.toUpperCase()} LASER LV ${player.laserLevel}`:`${p.color.toUpperCase()} LASER // LEVEL ${player.laserLevel}`,forceColors[p.color])
    }else if(p.type==='missile'){
      if(player.missileLevel>=caps.missile)surplus(`HOMING MISSILES · LEVEL ${player.missileLevel}`);
      else{player.missileLevel++;systemToast(`HOMING MISSILES // LEVEL ${player.missileLevel}`,'#ff9b4f')}
    }else if(p.type==='bit'){
      if(player.bits>=caps.bits)surplus(`DEFENSE BITS · ${player.bits} / ${caps.bits}`);
      else{player.bits++;systemToast(`DEFENSE BIT // ${player.bits} / ${caps.bits}`,'#d9f8ff')}
    }else if(p.type==='shield')collectShieldPickup();
    else if(p.type==='power'){if(player.gun>=5)surplus('FIGHTER CANNONS · MAXIMUM');else player.gun++}
    if(['missile','bit','shield'].includes(p.type))requestOnboarding(p.type);score+=100;sfx.powerup()
  }
  function playerHomingTargets(){
    const targets=[...enemies.filter(e=>!e.dead),miniBoss];
    if(boss?.epic&&boss.ritual){
      // The hidden ritual owner cannot be damaged. Track its one live active
      // guardian until the ritual resolves, then wait for the boss to return.
      if(boss.ritual.result===null)targets.push(...epicHeavies.filter(h=>h.active&&!h.dead&&h.hp>0));
    }else targets.push(boss);
    return targets.filter(Boolean)
  }
  function update(dt){
    snapshotWeakPointFrame(boss||miniBoss,dt);
    if(trainingSession)updateTrainingScene(dt);enforceCombatProgression();updateForceFireCadence(dt);
    t+=dt;updateBossAudio(dt);if(!bossLab)runElapsed+=dt;scroll+=90*dt;score+=dt*5;shake*=Math.pow(.03,dt);player.inv-=dt;player.fire-=dt;player.lootSurge=Math.max(0,player.lootSurge-dt);player.missileTimer=Math.max(0,player.missileTimer-dt);player.deltaFlash=Math.max(0,player.deltaFlash-dt);player.shieldWake=Math.max(0,(player.shieldWake||0)-dt);player.shieldHit=Math.max(0,(player.shieldHit||0)-dt);player.hullHit=Math.max(0,(player.hullHit||0)-dt);if(lootToastTimer>0){lootToastTimer-=dt;if(lootToastTimer<=0)$('#loot-toast').classList.remove('show')}if(victoryDelay){victoryDelay.time-=dt;if(victoryDelay.time<=0){const run=victoryDelay.run;victoryDelay=null;run();return}}
    player.focus=keyHeld('precision')||padFrame.precision;const surge=player.lootSurge>0?1+(streamlined()?player.lootSurgeStrength||.06:player.lootSurgePower):1,flightSpeed=player.speed*surge*(player.focus?.45:1);let dx=Number(keyHeld('right'))-Number(keyHeld('left')),dy=Number(keyHeld('down'))-Number(keyHeld('up'));if(!dx&&!dy){dx=padFrame.moveX;dy=padFrame.moveY}if(mouse.move&&mouse.inside&&!dx&&!dy){const mx=mouse.x-player.x,my=mouse.y-player.y,md=Math.hypot(mx,my);if(md>3){dx=mx/md;dy=my/md;const step=Math.min(flightSpeed*dt,md);player.x+=dx*step;player.y+=dy*step;dx=dy=0}}if(dx||dy){const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}}player.x=clamp(player.x+dx*flightSpeed*dt,35,W-90);player.y=clamp(player.y+dy*flightSpeed*dt,45,H-45);
    const pod=player.pod;pod.phase+=dt;player.podAutoTimer-=dt;const dockX=player.x+(pod.dockSide==='rear'?-45:50),podMove=player.podMove;if(pod.mode==='docked'){pod.x=dockX;pod.y=player.y}else if(pod.mode==='deployed'){const tx=clamp(player.x+205,150,W-155),ty=clamp(player.y+Math.sin(pod.phase*2.25)*21,45,H-45);pod.x+=(tx-pod.x)*dt*3*podMove;pod.y+=(ty-pod.y)*dt*3*podMove;if(player.podAuto&&player.podAutoTimer<=0&&fireForceLaser(0,1,'auto'))player.podAutoTimer=FORCE_EMISSION_INTERVAL}else{const returnX=player.x+(pod.returnSide==='rear'?-45:50);pod.x+=(returnX-pod.x)*dt*6.2*podMove;pod.y+=(player.y-pod.y)*dt*6.2*podMove;if(Math.hypot(pod.x-returnX,pod.y-player.y)<7){pod.dockSide=pod.returnSide;pod.mode='docked'}}
    updateStageHazards(dt);if(state!=='playing')return;const chargeHeld=!victoryDelay&&(keyHeld('fire')||mouse.firing||padFrame.fire);if(victoryDelay){player.charge=0;sfx.stopCharge()}if(chargeHeld){const before=player.charge;if(before<=0)sfx.startCharge();player.charge=clamp(player.charge+dt*player.chargeSpeed*surge/1.25,0,1);sfx.updateCharge(player.charge);if(before<.24&&player.charge>=.24)sfx.chargeReady()}
    if(stageApexIntro>=0&&!boss&&!miniBoss){stageApexIntro=Math.max(0,stageApexIntro-dt);if(stageApexIntro===0){stageApexIntro=-1;makeBoss()}}
    if((!bossLab||bossLabLevel)&&!(runActive&&runMode==='rush')&&!boss&&!miniBoss&&!victoryDelay&&stageApexIntro<0){
      const levelOne=currentStage().id===1&&wave===1;
      if(miniBossSpawned&&stagePostEliteClock<0){stagePostEliteClock=0;stageEncounterCursor=0;stageHazardClock=3.5;spawn=.4}
      if(stagePostEliteClock>=0)stagePostEliteClock+=dt;
      if(levelOne)updateLevelOneTimeline();
      else{const beat=currentFieldBeat();if(beat.enemyScale>0){spawn-=dt;if(spawn<=0){spawnEnemy();const fieldClock=stagePostEliteClock>=0?STAGE_ELITE_TIME+stagePostEliteClock:t;spawn=Math.max(.32,(1.35-fieldClock*.006)/sectorThreat().pressure)*beat.enemyScale}}else spawn=Math.max(spawn,.4)}
      if(t>(levelOne?LEVEL_ONE_ELITE_TIME:STAGE_ELITE_TIME)&&!miniBossSpawned)makeMiniBoss();
      else if(stagePostEliteClock>=(levelOne?LEVEL_ONE_POST_TIME:STAGE_POST_ELITE_TIME))beginApexArrival()
    }
    let homingTargets=null;
    shots.forEach(b=>{b.px=b.x;b.py=b.y;if(b.homingPlayer){const targets=homingTargets||(homingTargets=playerHomingTargets()),target=targets.reduce((best,e)=>!best||Math.hypot(e.x-b.x,e.y-b.y)<Math.hypot(best.x-b.x,best.y-b.y)?e:best,null);if(target){const speed=Math.hypot(b.vx,b.vy),current=Math.atan2(b.vy,b.vx),desired=Math.atan2(target.y-b.y,target.x-b.x),turn=Math.atan2(Math.sin(desired-current),Math.cos(desired-current)),a=current+clamp(turn,-b.homingPlayer*dt,b.homingPlayer*dt);b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed}}b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.surfaceBounce&&((b.y<42&&b.vy<0)||(b.y>H-42&&b.vy>0))){b.vy*=-1;b.surfaceBounce--;particlesAt(b.x,b.y,b.forceColor||'#55b8ff',4,70)}});enemyShots.forEach(b=>updateHostileShot(b,dt));
    for(const e of enemies){if(e.dead)continue;if(e.hp<=0){defeatEnemy(e);continue}e.hitFlash=Math.max(0,(e.hitFlash||0)-dt);e.x-=e.speed*dt;e.phase+=dt;if(currentStage().id===1&&wave===1&&e.role){const age=Math.max(0,(e.formationX-e.x)/Math.max(1,e.speed));if(e.role==='sine'||e.role==='escort')e.y=e.originY+Math.sin(age*2.35+e.phase*.28)*28;else if(e.role==='pincerTop')e.y=e.originY+age*25;else if(e.role==='pincerBottom')e.y=e.originY-age*25;else if(e.role==='cross')e.y=e.originY+Math.sin(age*1.8+e.phase)*18;else if(e.role==='command')e.y=e.originY+Math.sin(age*1.35)*46;e.y=clamp(e.y,50,H-50)}else updateEnemyStageMotion(e,dt);e.cool-=dt;if(e.telegraphFire){if(e.fireAnim>0){e.fireAnim+=dt;if(!e.fireReleased&&e.fireAnim>=.42){enemyFire(e,e.role==='lancer'?(e.shotCycle++%2?.08:-.08):0);e.fireReleased=true;e.recoil=.14;particlesAt(e.x-13,e.y,'#ffb36b',5,75)}if(e.fireAnim>=.76)e.fireAnim=0}else if(e.cool<=0&&e.x<W-100){e.fireAnim=.001;e.fireReleased=false;e.cool=e.role==='lancer'?1.7:rand(1.65,2.35)}}else if(e.type==='drone'){if(e.fireAnim>0){e.fireAnim+=dt;if(!e.fireReleased&&e.fireAnim>=.3){enemyFire(e);e.fireReleased=true}if(e.fireAnim>=.68)e.fireAnim=0}else if(e.cool<=0&&e.x<W-100){e.fireAnim=.001;e.fireReleased=false;e.cool=(e.role==='command'?2.05:rand(1.4,2.7))*(e.coolScale||1)}}else if(e.cool<=0&&e.x<W-100){enemyFire(e);e.cool=rand(1.4,2.7)*(e.coolScale||1)}if(pod.owned&&hit(e,pod)){const dealt=Math.min(e.hp,28*player.podDamage*dt);e.hp-=dealt;if(runStats&&!bossLab)runStats.damageDealt+=dealt;e.hitFlash=Math.max(e.hitFlash,.07);e.x+=45*dt;particlesAt(pod.x,pod.y,'#4ef5ff',1,45);addDose(dealt*.035)}if(e.hp>0&&hit(e,player)){e.hp=0;damage(e.contactDamage||1,{kind:'contact'});if(state!=='playing')return}for(const b of shots)if(e.hp>0&&!b.dead&&sweptHit(b,e)){const dealt=Math.min(e.hp,b.d);e.hp-=b.d;if(runStats&&!bossLab)runStats.damageDealt+=dealt;e.hitFlash=Math.max(e.hitFlash,.12);if(b.pierce>0){b.pierce--;b.x=e.x+(b.vx<0?-1:1)*(e.r+b.r+2);b.px=b.x}else b.dead=true;particlesAt(b.x,b.y,b.forceColor||e.c,3,70);sfx.impact()}if(e.hp<=0)defeatEnemy(e);else emitRegularEnemyDamageSmoke(e,dt)}
    if(miniBoss){miniBoss.hitFlash=Math.max(0,(miniBoss.hitFlash||0)-dt);updateMiniBossMovement(miniBoss,dt);if(miniBoss.intro>0){miniBoss.intro=Math.max(0,miniBoss.intro-dt);miniBoss.weakOpen=false;miniBoss.weakTelegraph=0;armoredHits(miniBoss,miniBoss.def.color,dt)}else{miniBoss.cool-=dt;updateWeakPoint(miniBoss,dt);if(miniBoss.cool<=0)miniBossAttack(miniBoss);armoredHits(miniBoss,miniBoss.def.color,dt)}if(miniBoss.hp<=0){clearInput();score+=700;kills++;if(runStats&&!bossLab)runStats.miniBosses++;if(!bossLab){const eliteTier=Math.random()<.12?2:1;collectGear(generateGear(eliteTier,1,eliteTier===2?'Rare Elite':'Uncommon Elite',{source:'ELITE ASTERPRINT'}));bankRunLoot('ELITE LOOT SECURED')}particlesAt(miniBoss.x,miniBoss.y,'#ffd166',35,230);debrisAt(miniBoss.x,miniBoss.y,'#ffd166',24,1.35);miniBoss=null;enemyShots.length=0;shots.length=0;shake=12;sfx.enemyBreak(true);sfx.victory();victoryDelay={time:1.25,run:()=>bossLabMini?openBossLab('ELITE INTERCEPT CLEARED / SELECT ANOTHER STUDY'):presentTacticalRetrofit(()=>{})}}}
    if(victoryDelay&&miniBossSpawned&&!miniBoss&&!boss&&runSegment==='mission')saveRunCheckpoint('module',{recoveryApplied:false});
    if(boss)updateBossFight(boss,dt);if(state!=='playing')return;
    for(const b of enemyShots)if(!b.dead&&!(b.warn>0)){const bit=!b.piercing&&bitPositions().find(bit=>sweptHit(b,bit));if(bit){b.dead=true;trainingNote('bitBlock');if(player.bitDose)addDose(player.bitDose);particlesAt(bit.x,bit.y,'#d9f8ff',5,80);sfx.podBlock()}else if(!b.piercing&&pod.owned&&sweptHit(b,pod)){b.dead=true;trainingNote('podBlock');addDose(2.5+player.podBlockDose);particlesAt(b.x,b.y,forceColors[player.laserColor]||'#4ef5ff',7,95);sfx.podBlock()}else if(sweptHit(b,player)){b.dead=true;damage(b.damage||1,{kind:'projectile',piercing:!!b.piercing,pressureLance:!!b.pressureLance,wall:!!b.wall,homing:!!b.homing});if(state!=='playing')return}}for(const p of pickups){p.x-=80*dt;p.spin+=dt;if(p.type==='gear'){const dx=player.x-p.x,dy=player.y-p.y,d=Math.hypot(dx,dy);if(d<player.gearMagnet&&d>1){const pull=(1-d/player.gearMagnet)*520+95;p.x+=dx/d*pull*dt;p.y+=dy/d*pull*dt}}if(hit(p,player)){p.dead=true;if(p.type==='gear')collectGear(p.gear);else collectCombatPickup(p)}}
    updateParticles(dt);const debrisDrag=debris.length?Math.pow(.7,dt):1;debris.forEach(d=>{d.x+=d.vx*dt;d.y+=d.vy*dt;d.rot+=d.vr*dt;d.vx*=debrisDrag;d.vy*=debrisDrag;d.life-=dt;d.smoke-=dt;if(d.smoke<=0&&d.life>0){const life=rand(.45,.95);addParticle({smoke:true,x:d.x,y:d.y,vx:-25+d.vx*.08,vy:rand(-24,12)+d.vy*.08,life,max:life,c:Math.random()<.55?'#727987':'#383f4a',s:rand(3,7)});d.smoke=rand(.035,.09)}});bossFragments.forEach(f=>{f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=(f.nativeChunk?165:42)*dt;f.vx-=18*dt;f.rot+=f.vr*dt;f.life-=dt;f.smoke-=dt;if(f.smoke<=0&&f.life>0){const life=rand(.55,1.05);addParticle({smoke:true,x:f.x+rand(-5,5),y:f.y+rand(-5,5),vx:rand(-55,-15),vy:rand(-28,18),life,max:life,c:Math.random()<.45?'#8d293e':'#4c515b',s:rand(4,8)});f.smoke=rand(.035,.075)}});bossFragments=bossFragments.filter(f=>f.life>0&&f.x>-180&&f.x<W+180&&f.y>-180&&f.y<H+180);shots=shots.filter(b=>!b.dead&&b.x>-50&&b.x<W+50&&b.y>-50&&b.y<H+50);enemyShots=enemyShots.filter(b=>!b.dead&&b.x>-20&&b.x<W+30&&b.y>-20&&b.y<H+20);enemies=enemies.filter(e=>!e.dead&&e.x>-40);pickups=pickups.filter(p=>!p.dead&&p.x>-20);debris=debris.filter(d=>d.life>0&&d.x>-80&&d.x<W+80&&d.y>-80&&d.y<H+80);hud();if(trainingSession)trainingTick(dt)
  }
  function poly(x,y,r,n,rot=0){ctx.beginPath();for(let i=0;i<n;i++){let a=rot+i*Math.PI*2/n;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}ctx.closePath()}
  function loadBossAsset(src,hasAlpha=false,followBoss=false){
    // Sparse Bloodstar layers are composited into 224px cells. Retain that
    // display resolution instead of dozens of mostly transparent 627px cells.
    const compact=src.includes('/weakpoint-atlases/bloodstar-'),cleanMini=src.startsWith('assets/minibosses/'),prepared=compact||cleanMini,asset=prepared?document.createElement('canvas'):new Image();let ready=false,started=false;
    asset.hasAlpha=hasAlpha;asset.followBoss=followBoss;asset.sourcePath=src;
    if(prepared){asset.width=asset.height=1;asset.naturalWidth=asset.naturalHeight=0}if(cleanMini)asset.destructionAlphaMask=true;
    asset.preload=()=>{
      if(started)return asset;started=true;
      window.StarfighterDestruction?.preload(src);
      const source=prepared?new Image():asset;
      source.onload=()=>{
        try{
          if(compact){asset.width=448;asset.height=Math.round(source.naturalHeight*448/source.naturalWidth);const raster=asset.getContext('2d');raster.imageSmoothingEnabled=true;raster.imageSmoothingQuality='high';raster.drawImage(source,0,0,asset.width,asset.height);asset.naturalWidth=asset.width;asset.naturalHeight=asset.height}
          else if(cleanMini){asset.width=source.naturalWidth;asset.height=source.naturalHeight;const raster=asset.getContext('2d',{willReadFrequently:true});raster.imageSmoothingEnabled=false;raster.drawImage(source,0,0);const pixels=raster.getImageData(0,0,asset.width,asset.height);asset.frameCleanup=window.StarfighterDestruction.cleanMiniAtlas(pixels.data,asset.width,asset.height);raster.putImageData(pixels,0,0);asset.naturalWidth=asset.width;asset.naturalHeight=asset.height}
          ready=true;
        }catch(error){console.warn('Boss sprite preparation failed:',src,error)}
        // Drop source callbacks so temporary full-size decoded images can be
        // reclaimed after compact layers have been copied to their canvases.
        source.onload=source.onerror=null;
      };
      source.onerror=()=>{source.onload=source.onerror=null;console.warn('Boss sprite failed to load:',src)};
      source.src=src;return asset
    };
    Object.defineProperty(asset,'ready',{get(){if(!started)asset.preload();return ready},set(value){ready=!!value}});
    return asset
  }
  function preloadAssets(...assets){for(const asset of assets){if(Array.isArray(asset))preloadAssets(...asset);else asset?.preload?.()}}
  function preloadBossAssets(type){
    switch(type){
      case 0:preloadAssets(bloodstarPhaseSprites,bloodstarTentacleMasks,bloodstarTentacleFragments);break;
      case 1:case 2:preloadAssets(bossSprites[type]);break;
      case 3:preloadAssets(riftPhaseSprites,riftPhase1InbetweenSprite);break;
      case 4:preloadAssets(ironBloomPhaseSprites,ironBloomInbetweenSprites);break;
      case 5:preloadAssets(voidLeviathanGranularSprites);break;
      case 6:preloadAssets(prismWardenGranularSprites);break;
      case 7:preloadAssets(gravebellGranularSprites);break;
      case 8:preloadAssets(solarHydraGranularSprites);break;
      case 9:preloadAssets(omegaHeartGranularSprites);break;
      default:preloadAssets(bossSprites[type],bossWeakpointSprites[type]);break
    }
    if(bossInbetween32Files[type])for(let phase=0;phase<2;phase++)bossInbetween32Asset(type,phase)
  }
  function prefetchStageAssets(encounter=true){
    const index=(Math.max(1,wave)-1)%stageDefs.length;preloadAssets(stageArt[index]);if(!encounter)return;
    preloadAssets(miniBossSpriteFor(index));
    const epic=runEpicEncounter&&!runEpicEncounter.used&&runEpicEncounter.wave===wave;
    preloadBossAssets(epic?(runEpicEncounter.id===0?9:8):(wave-1)%bossTypes.length)
  }
  function miniBossSpriteFor(type){const index=(type+miniBossDefs.length)%miniBossDefs.length,def=miniBossDefs[index];if(!miniBossSprites[index]){const sprite=loadBossAsset('assets/minibosses/'+def.file,true);sprite.followMini=true;miniBossSprites[index]=sprite}return miniBossSprites[index]}
  function bossInbetween32Asset(type,phase){
    // These generated intermediates lose or relocate their authored organs.
    // Keep coherent native poses and continuous movement instead of gray ports.
    if([5,7,8,9].includes(type))return null;
    const key=`${type}-${phase}`,file=bossInbetween32Files[type]?.[phase],dimensions=bossInbetween32Dimensions[type];if(!file||!dimensions)return null;return bossInbetween32Sprites[key]||(bossInbetween32Sprites[key]=loadBossInbetweenAsset(`assets/bosses/${file}`,dimensions[0],dimensions[1]))
  }
  function loadBossInbetweenAsset(src,targetWidth,targetHeight){
    const surface=document.createElement('canvas'),image=new Image();surface.ready=false;surface.hasAlpha=true;surface.destructionAlphaMask=true;surface.sourcePath=src;
    window.StarfighterDestruction?.preload(src);
    image.onload=()=>{surface.width=targetWidth;surface.height=targetHeight;const raster=surface.getContext('2d',{willReadFrequently:true});raster.clearRect(0,0,targetWidth,targetHeight);raster.drawImage(image,0,0,targetWidth,targetHeight);
      try{const pixels=raster.getImageData(0,0,targetWidth,targetHeight),data=pixels.data,total=targetWidth*targetHeight,background=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
        const add=p=>{if(p<0||p>=total||background[p])return;const i=p*4,max=Math.max(data[i],data[i+1],data[i+2]);if(data[i+3]<24||max<24){background[p]=1;queue[tail++]=p}};
        for(let x=0;x<targetWidth;x++){add(x);add((targetHeight-1)*targetWidth+x)}for(let y=1;y<targetHeight-1;y++){add(y*targetWidth);add(y*targetWidth+targetWidth-1)}
        while(head<tail){const p=queue[head++],x=p%targetWidth;add(p-targetWidth);add(p+targetWidth);if(x>0)add(p-1);if(x<targetWidth-1)add(p+1)}
        for(let p=0,i=0;p<total;p++,i+=4)data[i+3]=background[p]||data[i+3]<24?0:255;raster.putImageData(pixels,0,0);surface.ready=true
      }catch(error){surface.ready=false;console.warn('Boss in-between alpha conversion failed:',src,error)}
    };image.onerror=()=>console.warn('Boss in-between sprite failed to load:',src);image.src=src;return surface
  }
  function boss32AnimationFromPosition(position){const state=((Math.floor(position)%32)+32)%32,pose=state/2,nodeFrame=Math.floor(pose)%16,nextState=(state+1)%32;return{frame:nodeFrame,next:(nodeFrame+1)%16,mix:pose-nodeFrame,drawFrame:Math.floor(state/2),drawBetween:state%2===1,drawNextFrame:Math.floor(nextState/2),drawNextBetween:nextState%2===1,drawMix:0}}
  function boss32AnimationState(e,rate){return boss32AnimationFromPosition((e.clock*rate*3)%32)}
  function boss32Body(type,phase,animation,baseAsset){const inbetween=bossInbetween32Asset(type,phase);if(!inbetween?.ready)return{asset:baseAsset,frame:animation.frame,nextAsset:baseAsset,nextFrame:animation.frame,mix:0};const asset=animation.drawBetween?inbetween:baseAsset;return{asset,frame:animation.drawFrame,nextAsset:asset,nextFrame:animation.drawFrame,mix:0}}
  function sheetCell(asset,col,row,cols,rows,x,y,w,h,alpha=1,filter='none',smooth=false){const sourceWidth=asset?.naturalWidth||asset?.width,sourceHeight=asset?.naturalHeight||asset?.height;if(!asset?.ready||!sourceWidth)return false;const sw=sourceWidth/cols,sh=sourceHeight/rows;let drawW=w,drawH=h;if(asset.followMini&&miniBoss){const motion=bossSpriteMotion(miniBoss);drawW*=motion.x;drawH*=motion.y}else if(boss&&(asset===bossSprites[boss.type]||asset.followBoss)){const motion=bossSpriteMotion(boss);drawW*=motion.x;drawH*=motion.y}ctx.save();if(asset.followMini&&miniBoss?.type===8){ctx.beginPath();ctx.rect(x-drawW/2,y-drawH/2+drawH*18/256,drawW,drawH*238/256);ctx.clip()}ctx.globalAlpha*=alpha;ctx.globalCompositeOperation=asset.hasAlpha?'source-over':'screen';ctx.filter=filter;ctx.imageSmoothingEnabled=smooth;if(smooth)ctx.imageSmoothingQuality='high';ctx.drawImage(asset,col*sw,row*sh,sw,sh,x-drawW/2,y-drawH/2,drawW,drawH);ctx.restore();return true}
  function sheetCellCrop(asset,col,row,cols,rows,x,y,w,h,cropX=.16,cropY=.44,alpha=1,filter='none'){
    if(!asset?.ready||!asset.naturalWidth)return false;
    const cellW=asset.naturalWidth/cols,cellH=asset.naturalHeight/rows,sw=cellW*cropX,sh=cellH*cropY,sx=col*cellW+(cellW-sw)/2,sy=row*cellH+(cellH-sh)/2;
    ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='screen';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(asset,sx,sy,sw,sh,x-w/2,y-h/2,w,h);ctx.restore();return true
  }
  function wrapX(x,speed,span=W+300){x=(x-scroll*speed)%span;if(x<-160)x+=span;return x}
  function atlasCell(col,row,x,y,w,h,alpha=1,filter='none',target=ctx){if(!spriteAtlas.complete||!spriteAtlas.naturalWidth)return false;const sw=spriteAtlas.naturalWidth/4,sh=spriteAtlas.naturalHeight/4;target.save();target.globalAlpha*=alpha;target.filter=filter;target.imageSmoothingEnabled=false;target.drawImage(spriteAtlas,col*sw,row*sh,sw,sh,x-w/2,y-h/2,w,h);target.restore();return true}
  function debrisAt(x,y,color,count=8,scale=1){const limit=settings.clearCombat?40:settings.reducedMotion?60:100,amount=Math.min(Math.ceil(count*(settings.clearCombat?.5:settings.reducedMotion?.7:1)),Math.max(0,limit-debris.length));for(let i=0;i<amount;i++){const a=rand(0,Math.PI*2),speed=rand(65,210)*scale,life=rand(.7,1.5);debris.push({x:x+rand(-5,5)*scale,y:y+rand(-5,5)*scale,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,rot:rand(0,7),vr:rand(-9,9),life,max:life,size:rand(3,8)*scale,color,shape:Math.floor(rand(3,7)),smoke:rand(0,.06)})}}
  function drawLegacyDepthBackground(){
    ctx.fillStyle='#02040c';ctx.fillRect(0,0,W,H);let sky=ctx.createLinearGradient(0,0,W,H);sky.addColorStop(0,'#07172d');sky.addColorStop(.48,'#100d30');sky.addColorStop(1,'#26091f');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='screen';let nebula=ctx.createRadialGradient(W*.63,H*.46,5,W*.63,H*.46,W*.57);nebula.addColorStop(0,'#6b2f8b66');nebula.addColorStop(.28,'#293f8a42');nebula.addColorStop(.62,'#0d6a8b20');nebula.addColorStop(1,'#00000000');ctx.fillStyle=nebula;ctx.fillRect(0,0,W,H);let haze=ctx.createRadialGradient(W*.2,H*.58,0,W*.2,H*.58,W*.35);haze.addColorStop(0,'#0eddf01d');haze.addColorStop(1,'#0000');ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);ctx.restore();
    ctx.save();ctx.globalAlpha=.22;ctx.globalCompositeOperation='screen';for(let i=0;i<5;i++){const x=570+i*48;ctx.fillStyle=i%2?'#795cff10':'#4ef5ff0c';ctx.beginPath();ctx.moveTo(x-20,0);ctx.lineTo(x+170,H);ctx.lineTo(x+255,H);ctx.lineTo(x+15,0);ctx.closePath();ctx.fill()}ctx.restore();
    for(const s of stars){let x=(s.x-scroll*s.z*.33)%W;if(x<0)x+=W;const size=.6+s.z*2.1;ctx.globalAlpha=.18+s.z*.68;ctx.fillStyle=s.warm?'#ffd6a0':'#d8f7ff';ctx.fillRect(Math.round(x),Math.round(s.y),Math.max(1,Math.round(size)),Math.max(1,Math.round(size*.62)))}ctx.globalAlpha=1;
    const planetX=wrapX(680,.035,W+980),planetY=H*.33;ctx.save();let corona=ctx.createRadialGradient(planetX,planetY,54,planetX,planetY,105);corona.addColorStop(0,'#df65ff99');corona.addColorStop(.18,'#724fff48');corona.addColorStop(.58,'#253d8a19');corona.addColorStop(1,'#0000');ctx.fillStyle=corona;ctx.fillRect(planetX-120,planetY-120,240,240);ctx.fillStyle='#080817';ctx.beginPath();ctx.arc(planetX,planetY,57,0,7);ctx.fill();ctx.strokeStyle='#f39cff';ctx.globalAlpha=.65;ctx.lineWidth=2;ctx.beginPath();ctx.arc(planetX,planetY,59,0,7);ctx.stroke();ctx.restore();
    const ringX=wrapX(640,.11,W+1050);ctx.save();ctx.translate(ringX,H*.5);ctx.rotate(-.34);ctx.strokeStyle='#262448aa';ctx.lineWidth=24;ctx.beginPath();ctx.arc(0,0,185,.25,2.35);ctx.stroke();ctx.beginPath();ctx.arc(0,0,185,3.05,5.85);ctx.stroke();ctx.strokeStyle='#74518b55';ctx.lineWidth=4;for(let i=0;i<14;i++){const a=i*.44+.12;if(i===5||i===10)continue;ctx.beginPath();ctx.arc(0,0,169+i%3*9,a,a+.24);ctx.stroke()}ctx.strokeStyle='#080a18aa';ctx.lineWidth=10;for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*144,Math.sin(a)*144);ctx.lineTo(Math.cos(a)*207,Math.sin(a)*207);ctx.stroke()}ctx.restore();
    for(const rock of depthRocks){const x=wrapX(rock.x,rock.z*.62,W+320),scale=.55+rock.z;ctx.save();ctx.translate(x,rock.y);ctx.rotate(rock.rot+scroll*rock.z*.00035);ctx.globalAlpha=.22+rock.z*.48;ctx.fillStyle=rock.z>.42?'#17172b':'#171d36';ctx.strokeStyle=rock.z>.42?'#58376155':'#334d6a44';ctx.lineWidth=2;poly(0,0,rock.r*scale,rock.shape,rock.rot);ctx.fill();ctx.stroke();ctx.fillStyle='#070b16aa';ctx.beginPath();ctx.arc(-rock.r*.22,-rock.r*.15,rock.r*.18,0,7);ctx.fill();ctx.restore()}
    let lane=ctx.createLinearGradient(0,H*.18,0,H*.82);lane.addColorStop(0,'#0008');lane.addColorStop(.23,'#0000');lane.addColorStop(.76,'#0000');lane.addColorStop(1,'#0009');ctx.fillStyle=lane;ctx.fillRect(0,0,W,H);
  }
  function drawDepthBackground(){
    const stage=currentStage(),art=stageArt[(Math.max(1,wave)-1)%stageArt.length];if(!art?.ready||!art.naturalWidth){drawLegacyDepthBackground();return}
    const sky=ctx.createLinearGradient(0,0,W,H);sky.addColorStop(0,stage.sky[0]);sky.addColorStop(.52,stage.sky[1]);sky.addColorStop(1,stage.sky[2]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const nw=art.naturalWidth,nh=art.naturalHeight,aspect=W/H;let sh=nh,sw=sh*aspect;if(sw>nw){sw=nw;sh=sw/aspect}const pan=(Math.sin(scroll*.00016*stage.scroll)+1)*.5,sx=(nw-sw)*pan,sy=clamp((nh-sh)*(.48+Math.sin(scroll*.00008)*.08),0,nh-sh);ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.globalAlpha=.9;ctx.drawImage(art,sx,sy,sw,sh,0,0,W,H);ctx.restore();
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.16;const wash=ctx.createLinearGradient(0,0,W,H);wash.addColorStop(0,stage.accent+'00');wash.addColorStop(.5,stage.accent+'55');wash.addColorStop(1,stage.accent2+'22');ctx.fillStyle=wash;ctx.fillRect(0,0,W,H);ctx.restore();
    const lane=ctx.createLinearGradient(0,0,0,H);lane.addColorStop(0,'#000000a8');lane.addColorStop(.18,'#00000024');lane.addColorStop(.46,'#00000000');lane.addColorStop(.82,'#00000028');lane.addColorStop(1,'#000000b8');ctx.fillStyle=lane;ctx.fillRect(0,0,W,H);drawStageAtmosphere(stage);if(stageFlash>0&&!settings.reducedMotion){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=stageFlash*.22;ctx.fillStyle=stage.accent;ctx.fillRect(0,0,W,H);ctx.restore()}
  }
  function drawStageAtmosphere(stage){
    ctx.save();const kind=stage.hazard;for(let i=0;i<34;i++){let x=(i*137-scroll*(.12+(i%5)*.032)*stage.scroll)%(W+90);if(x<0)x+=W+90;const y=(i*83+Math.sin(t*(.35+i%3*.12)+i)*38+H)%H,depth=.2+(i%7)/9;ctx.globalAlpha=.08+depth*.2;ctx.strokeStyle=i%2?stage.accent:stage.accent2;ctx.fillStyle=ctx.strokeStyle;if(kind==='current'){ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,1.5+(i%4),0,Math.PI*2);ctx.stroke()}else if(kind==='piston'||kind==='flare'){ctx.lineWidth=.7+i%3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-12-depth*18,y+8+depth*7);ctx.stroke()}else{ctx.fillRect(Math.round(x),Math.round(y),1+i%3,1)}}ctx.restore()
  }
  function drawStageMidground(){
    const stage=currentStage(),id=stage.id;ctx.save();ctx.globalAlpha=.095;ctx.strokeStyle=stage.accent;ctx.fillStyle=stage.silhouette;ctx.lineWidth=1;for(let i=0;i<7;i++){const x=wrapX(90+i*185,.12+(i%3)*.025,W+380),y=105+(i%4)*112,scale=.72+(i%3)*.22;ctx.save();ctx.translate(x,y);if(id===1){ctx.rotate(i*.31+t*.025);ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,42*scale,.2,2.55);ctx.stroke();ctx.fillRect(-48,-4,27,8)}else if(id===2){ctx.fillRect(-22,-75,44,150);ctx.strokeRect(-17,-65,34,130);for(let q=-2;q<3;q++)ctx.fillRect(-28,q*23,56,5)}else if(id===3){ctx.beginPath();ctx.ellipse(0,0,32*scale,76*scale,.3,0,Math.PI*2);ctx.stroke();for(let q=-2;q<3;q++){ctx.beginPath();ctx.arc(q*13,0,22+q%2*8,3.4,6);ctx.stroke()}}else if(id===4){ctx.rotate(t*.04+i);poly(0,0,54*scale,3,Math.PI/2);ctx.fill();ctx.stroke()}else if(id===5){for(let q=0;q<7;q++){ctx.rotate(Math.PI*2/7);ctx.beginPath();ctx.ellipse(30*scale,0,31*scale,11*scale,0,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.beginPath();ctx.arc(0,0,15,0,7);ctx.stroke()}else if(id===6){ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,0,70*scale,.4,2.75);ctx.stroke();for(let q=0;q<5;q++){ctx.rotate(.5);ctx.fillRect(20,-4,52,8)}}else if(id===7){ctx.rotate(-.25);ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,52,3.35,6.05);ctx.stroke();ctx.fillRect(-4,0,8,72)}else if(id===8){ctx.rotate(i*.5);ctx.lineWidth=13;ctx.beginPath();ctx.arc(0,0,58*scale,.25,2.8);ctx.stroke();ctx.lineWidth=2;for(let q=0;q<8;q++){ctx.rotate(Math.PI/4);ctx.fillRect(48,-1,34,2)}}else if(id===9){ctx.rotate(t*.035*(i%2?1:-1));ctx.lineWidth=3+i%3*3;ctx.beginPath();ctx.arc(0,0,34+i%3*14,0,7);ctx.stroke()}else{ctx.fillRect(-13,-82,26,164);ctx.strokeRect(-19,-88,38,176);ctx.beginPath();ctx.moveTo(0,-82);ctx.lineTo(0,82);ctx.stroke()}ctx.restore()}ctx.restore()
  }
  function drawStageHazards(){
    const stage=currentStage();for(const h of stageHazards){ctx.save();if(h.type==='debris'){ctx.translate(h.x,h.y);ctx.rotate(h.rot);ctx.fillStyle=stage.silhouette;ctx.strokeStyle=h.color;ctx.lineWidth=h.mine?2.5:1.5;ctx.shadowBlur=h.mine?14:6;ctx.shadowColor=h.color;poly(0,0,h.r,h.mine?8:5+Math.floor(h.r)%3,.2);ctx.fill();ctx.stroke();if(h.mine){ctx.fillStyle=h.color;ctx.globalAlpha=.7+Math.sin(h.phase*7)*.2;ctx.beginPath();ctx.arc(0,0,h.r*.28,0,7);ctx.fill()}}else if(h.type==='gate'){const top=h.gapY-h.gap*.5,bottom=h.gapY+h.gap*.5,w=h.width,warning=h.warn>0;ctx.globalAlpha=warning?.28+Math.sin(t*18)*.12:1;ctx.fillStyle=h.variant==='flare'?'#55200b':h.variant==='organic'?'#190812':stage.silhouette;ctx.strokeStyle=h.variant==='flare'?'#fff0a2':h.color;ctx.shadowBlur=warning?10:18;ctx.shadowColor=ctx.strokeStyle;ctx.lineWidth=warning?2:3;ctx.fillRect(h.x-w/2,0,w,Math.max(0,top));ctx.fillRect(h.x-w/2,bottom,w,H-bottom);ctx.strokeRect(h.x-w/2+.5,-2,w-1,top+2);ctx.strokeRect(h.x-w/2+.5,bottom,w-1,H-bottom+2);ctx.shadowBlur=0;ctx.globalAlpha*=.65;for(let y=18;y<top;y+=24)ctx.fillRect(h.x-w*.38,y,w*.76,3);for(let y=bottom+16;y<H;y+=24)ctx.fillRect(h.x-w*.38,y,w*.76,3);if(h.variant==='organic'||h.variant==='vine'){ctx.globalAlpha=1;ctx.fillStyle=h.color;for(const y of[top,bottom]){for(let q=0;q<6;q++){ctx.save();ctx.translate(h.x,y);ctx.rotate(q*Math.PI/3+h.phase*.2);ctx.beginPath();ctx.ellipse(20,0,23,7,0,0,7);ctx.fill();ctx.restore()}}}}else if(h.type==='beam'){const warning=h.warn>0;ctx.translate(h.x,h.y);ctx.rotate(h.angle);ctx.strokeStyle=warning?h.color:'#ffffff';ctx.shadowColor=h.color;ctx.shadowBlur=warning?8:30;ctx.lineWidth=warning?2:22;ctx.globalAlpha=warning?.38+Math.sin(t*20)*.2:.86;ctx.setLineDash(warning?[14,12]:[]);ctx.beginPath();ctx.moveTo(-1200,0);ctx.lineTo(1200,0);ctx.stroke();if(!warning){ctx.strokeStyle=h.color;ctx.lineWidth=7;ctx.stroke()}ctx.setLineDash([])}else if(h.type==='well'){const pulse=.5+.5*Math.sin(h.phase*4);ctx.translate(h.x,h.y);const glow=ctx.createRadialGradient(0,0,4,0,0,100);glow.addColorStop(0,'#000000');glow.addColorStop(.28,'#000000ee');glow.addColorStop(.55,h.color+'44');glow.addColorStop(1,h.color+'00');ctx.fillStyle=glow;ctx.fillRect(-110,-110,220,220);ctx.strokeStyle=h.color;ctx.shadowBlur=16;ctx.shadowColor=h.color;ctx.globalAlpha=.42+pulse*.28;for(let q=0;q<3;q++){ctx.rotate((q%2?1:-1)*h.phase*.18);ctx.beginPath();ctx.ellipse(0,0,48+q*17,19+q*9,.25*q,0,7);ctx.stroke()}ctx.fillStyle='#000';ctx.globalAlpha=1;ctx.beginPath();ctx.arc(0,0,h.r,0,7);ctx.fill()}ctx.restore()}
  }
  function drawStageForeground(){
    const stage=currentStage(),organic=stage.hazard==='maw'||stage.hazard==='vine',crystal=stage.hazard==='prism',off=-(scroll*1.08*stage.scroll%118);ctx.save();ctx.fillStyle=stage.silhouette;ctx.strokeStyle=stage.accent+'19';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);for(let i=-1;i<11;i++){const x=i*118+off,h=28+((i*17+stage.id*11)%31);ctx.lineTo(x,0);ctx.lineTo(x+15,h);ctx.lineTo(x+45,h+(crystal?28:organic?14:6));ctx.lineTo(x+72,h*.55);ctx.lineTo(x+118,0)}ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,H);for(let i=-1;i<11;i++){const x=i*118+off*.86,h=31+((i*23+stage.id*7)%34);ctx.lineTo(x,H);ctx.lineTo(x+18,H-h);ctx.lineTo(x+48,H-h-(crystal?30:organic?15:7));ctx.lineTo(x+78,H-h*.52);ctx.lineTo(x+118,H)}ctx.closePath();ctx.fill();ctx.stroke();for(let i=-1;i<11;i++){const x=i*118+off;ctx.fillStyle=i%2?stage.accent+'2a':stage.accent2+'24';ctx.shadowBlur=7;ctx.shadowColor=stage.accent;ctx.fillRect(x+32,18+(i%3)*8,15,2);ctx.fillRect(x+68,H-22-(i%3)*9,12,2)}ctx.shadowBlur=0;for(const d of depthDust){let x=(d.x-scroll*d.z*stage.scroll)%W;if(x<0)x+=W;ctx.globalAlpha=.12+d.z*.16;ctx.strokeStyle=d.z>1?stage.accent:stage.accent2;ctx.lineWidth=d.r;ctx.beginPath();ctx.moveTo(x,d.y);ctx.lineTo(x-6*d.z,d.y);ctx.stroke()}ctx.restore();ctx.globalAlpha=1
  }
  function drawStageTitle(){
    if(bossLab)return;const stage=currentStage();if(stageIntro>0){const age=5.2-stageIntro,alpha=Math.min(1,age*1.8,stageIntro/1.15);ctx.save();ctx.globalAlpha=alpha;const x=44,y=110,w=475,h=92,plate=ctx.createLinearGradient(x,0,x+w,0);plate.addColorStop(0,'#02050de8');plate.addColorStop(.76,'#02050da8');plate.addColorStop(1,'#02050d00');ctx.fillStyle=plate;ctx.fillRect(x-14,y-25,w,h);ctx.fillStyle=stage.accent;ctx.fillRect(x-14,y-25,3,h);ctx.font='700 10px Oxanium, sans-serif';ctx.fillStyle=stage.accent;ctx.letterSpacing='2px';ctx.fillText(`STAGE ${String(stage.id).padStart(2,'0')} // ${stage.sector}`,x,y-7);ctx.font='700 28px Oxanium, sans-serif';ctx.fillStyle='#ffffff';ctx.shadowBlur=16;ctx.shadowColor=stage.accent;ctx.fillText(stage.name,x,y+23);ctx.shadowBlur=0;ctx.font='600 10px Oxanium, sans-serif';ctx.fillStyle='#a9bfd0';ctx.fillText(stage.briefing.toUpperCase(),x,y+45);ctx.fillStyle=stage.accent2;ctx.fillText(`ENVIRONMENTAL THREAT // ${stage.hazardLabel}`,x,y+62);ctx.restore()}const warning=stageHazards.find(h=>(h.warn||0)>0);if(warning){ctx.save();ctx.globalAlpha=.55+Math.sin(t*14)*.25;ctx.textAlign='center';ctx.font='700 10px Oxanium, sans-serif';ctx.fillStyle=stage.accent;ctx.shadowBlur=10;ctx.shadowColor=stage.accent;ctx.fillText(`CAUTION // ${stage.hazardLabel}`,W/2,H-54);ctx.restore()}
  }
  function bossReadoutColor(e){
    if(e.epic)return e.epicId===0?'#ef87ff':'#a4ff88';
    if(e.kind!=='boss')return '#ffd166';
    const hex=e.def.c2||'#ff6b9f';
    return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.6+255*.4).toString(16).padStart(2,'0')).join('')
  }
  function drawBossStatus(){
    const e=boss||miniBoss;if(!e)return;const isBoss=e.kind==='boss',isEpic=!!e.epic,color=bossReadoutColor(e),width=isEpic&&e.ritual?360:isBoss?520:380,height=isBoss?10:8,x=(trainingSession?W*.34:W/2)-width/2,y=112,name=e.def?.name||'ELITE CORE';
    if(isEpic&&e.ritual){const ratio=clamp(e.ritual.timer/e.ritual.max,0,1);ctx.save();ctx.fillStyle='#02050df2';ctx.fillRect(x-10,y-22,width+20,height+48);ctx.strokeStyle=color;ctx.strokeRect(x-10.5,y-22.5,width+21,height+49);ctx.font='700 10px Oxanium, sans-serif';ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText('EPIC RITUAL WINDOW',x,y-8);ctx.fillStyle='#ffffff';ctx.font='700 12px Oxanium, sans-serif';ctx.fillText(`PHASE ${e.phase} CLEARED`,x+132,y-8);ctx.textAlign='right';ctx.fillStyle='#ffffff';ctx.fillText(`${e.ritual.timer.toFixed(1)}s`,x+width,y-8);ctx.fillStyle='#0a1220';ctx.fillRect(x,y,width,height);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;ctx.fillRect(x+1,y+1,(width-2)*ratio,height-2);ctx.shadowBlur=0;ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.font='700 10px Oxanium, sans-serif';ctx.fillText('DESTROY THE ACTIVE CORNER GUARDIAN // CLAIM TOXIN WARD',W/2,y+height+18);ctx.restore();return}
    const ratio=clamp(e.hp/e.max,0,1),healthText=`${Math.max(0,e.hp).toFixed(1).replace(/\.0$/,'')} / ${Math.ceil(e.max)} HP`;ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle='#02050df2';ctx.fillRect(x-10,y-22,width+20,height+32);ctx.strokeStyle=isEpic?color:'#26364dcc';ctx.lineWidth=1;ctx.strokeRect(x-10.5,y-22.5,width+21,height+33);
    ctx.font='700 10px Oxanium, sans-serif';ctx.textAlign='left';ctx.fillStyle=isEpic?color:'#9fb4c8';ctx.fillText(trainingSession?'PRACTICE TARGET':isEpic?'ANOMALOUS SIGNATURE':isBoss?'APEX SIGNATURE':'ELITE SIGNATURE',x,y-8);ctx.fillStyle='#ffffff';ctx.font='700 12px Oxanium, sans-serif';ctx.fillText(name,x+(isEpic?142:96),y-8);ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(isBoss?`PHASE ${e.phase}${isEpic?' / 4':''}  ·  ${healthText}`:healthText,x+width,y-8);
    ctx.fillStyle='#0a1220';ctx.fillRect(x,y,width,height);const trailRatio=clamp(encounterTrailHp(e)/e.max,ratio,1);if(trailRatio>ratio+.0001){ctx.fillStyle='#e9a15e';ctx.fillRect(x+1+(width-2)*ratio,y+1,(width-2)*(trailRatio-ratio),height-2)}ctx.strokeStyle='#51677dcc';ctx.strokeRect(x-.5,y-.5,width+1,height+1);const fill=ctx.createLinearGradient(x,0,x+width,0);fill.addColorStop(0,color);fill.addColorStop(.72,color);fill.addColorStop(1,'#ffffff');ctx.fillStyle=fill;ctx.shadowBlur=isEpic?18:10;ctx.shadowColor=color;ctx.fillRect(x+1,y+1,Math.max(0,(width-2)*ratio),height-2);ctx.shadowBlur=0;
    if(isBoss){ctx.fillStyle='#dffbffb8';const marks=isEpic?[.25,.5,.75]:[.5];for(const mark of marks)ctx.fillRect(x+width*mark-1,y-2,2,height+4)}if(e.tacticalNotice&&e.tacticalNotice.phase===(e.phase||1)&&e.clock<e.tacticalNotice.until){ctx.textAlign='center';ctx.font='700 10px Oxanium, sans-serif';ctx.fillStyle='#ffe3a0';ctx.fillText(e.tacticalNotice.text,W/2,y+height+16,width)}else if(e.weakOpen){ctx.textAlign='center';ctx.font='700 10px Oxanium, sans-serif';ctx.fillStyle=color;ctx.shadowBlur=12;ctx.shadowColor=color;ctx.fillText('WEAKPOINTS EXPOSED',W/2,y+height+16)}else if(e.weakTelegraph>0){ctx.textAlign='center';ctx.font='700 10px Oxanium, sans-serif';ctx.fillStyle=color;ctx.shadowBlur=8;ctx.shadowColor=color;ctx.fillText('CORE SYNC // OPENING',W/2,y+height+16)}ctx.restore()
  }
  function drawApexIntro(){if(stageApexIntro<0||boss)return;const scheduledEpic=!bossLab&&runEpicEncounter&&!runEpicEncounter.used&&runEpicEncounter.wave===wave,arrival=scheduledEpic?epicBossTypes[runEpicEncounter.id]:bossTypes[(wave-1)%bossTypes.length],age=4.2-stageApexIntro,pulse=.62+Math.sin(t*13)*.28,fade=Math.min(1,age*2,stageApexIntro*1.8);ctx.save();ctx.globalAlpha=fade;ctx.fillStyle='#01030ad9';ctx.fillRect(0,0,W,82);ctx.fillRect(0,H-82,W,82);ctx.fillStyle=`rgba(109,23,72,${.12+pulse*.08})`;ctx.fillRect(0,82,W,H-164);ctx.strokeStyle='#ff3d81';ctx.lineWidth=2;ctx.globalAlpha=fade*pulse;ctx.beginPath();ctx.moveTo(0,H*.5);ctx.lineTo(W,H*.5);ctx.stroke();for(let i=0;i<7;i++){const y=H*.5+(i-3)*18;ctx.globalAlpha=fade*(.08+Math.abs(Math.sin(t*9+i))*.08);ctx.fillRect(0,y,W,1)}ctx.globalAlpha=fade;ctx.textAlign='center';ctx.shadowColor='#ff3d81';ctx.shadowBlur=18;if(age<1.35){ctx.fillStyle='#ff6a9e';ctx.font='700 13px Oxanium, sans-serif';ctx.fillText('WARNING // GRAVITIC MASS APPROACHING',W/2,H*.43);ctx.fillStyle='#ffffff';ctx.font='700 32px Oxanium, sans-serif';ctx.fillText('APEX SIGNAL DETECTED',W/2,H*.52)}else{ctx.fillStyle='#ff6a9e';ctx.font='700 12px Oxanium, sans-serif';ctx.fillText(`${currentStage().name} // APEX SIGNATURE LOCKED`,W/2,H*.41);ctx.fillStyle='#ffffff';ctx.font='700 42px Oxanium, sans-serif';ctx.fillText(arrival.name,W/2,H*.51);ctx.shadowBlur=0;ctx.fillStyle='#9fb4c8';ctx.font='600 11px Oxanium, sans-serif';ctx.fillText(encounterTactic({kind:'boss',type:scheduledEpic?10+runEpicEncounter.id:(wave-1)%bossTypes.length,phase:1}),W/2,H*.57,W-100)}ctx.restore()}
  function drawStageCue(){if(!stageCue||stageCue.time<=0||stageApexIntro>=0||boss||miniBoss)return;const age=stageCue.max-stageCue.time,alpha=Math.min(1,age*3,stageCue.time*2.2),x=52,y=H-118;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#020711d9';ctx.fillRect(x-12,y-22,390,58);ctx.fillStyle=currentStage().accent;ctx.fillRect(x-12,y-22,3,58);ctx.font='700 9px Oxanium, sans-serif';ctx.fillStyle=currentStage().accent;ctx.fillText(stageCue.kicker,x,y-4);ctx.font='700 14px Oxanium, sans-serif';ctx.fillStyle='#edfaff';ctx.fillText(stageCue.text,x,y+20);ctx.restore()}
  function drawEliteIntro(){
    if(!miniBoss?.intro)return;
    const max=miniBoss.introMax||1.5,age=Math.max(0,max-miniBoss.intro),alpha=clamp(Math.min(age*3.5,miniBoss.intro*2.4),0,1),color=miniBoss.def.accent||miniBoss.def.color;
    const x=40-(settings.reducedMotion?0:12*clamp(1-age/.28,0,1)),y=158,width=356,height=82;
    ctx.save();ctx.globalAlpha=alpha;ctx.shadowBlur=0;ctx.textAlign='left';ctx.lineWidth=1;
    const plate=ctx.createLinearGradient(x,0,x+width,0);plate.addColorStop(0,'#04101bf2');plate.addColorStop(1,'#071322df');ctx.fillStyle=plate;ctx.strokeStyle='#51718788';
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.lineTo(x+width,y+height-12);ctx.lineTo(x+width-12,y+height);ctx.lineTo(x,y+height);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.fillRect(x,y,3,height);ctx.fillRect(x+16,y,82,2);ctx.font='700 9px Oxanium, sans-serif';ctx.fillText('ELITE INTERCEPT // ARMORED SIGNAL',x+16,y+19);
    ctx.fillStyle='#edfaff';ctx.font='700 25px Oxanium, sans-serif';ctx.fillText(miniBoss.def.name,x+16,y+47,width-32);
    ctx.fillStyle='#9eb7c9';ctx.font='600 9px Oxanium, sans-serif';ctx.fillText(encounterTactic(miniBoss),x+16,y+66,width-32);ctx.restore()
  }
  function drawBloodstarAttackCue(b){
    if(!b?.queuedAttack||b.attackCue<=0)return;
    const frame=bloodstarAnimationState(b).frame,phase=b.phase-1,asset=bloodstarPhaseSprites[phase];if(!asset?.ready)return;
    const points=bloodstarNodePixels[phase][frame],x=points[0][0]+170,y=(points[0][1]+points[1][1])/2,scale=224/627,sw=asset.naturalWidth/2,sh=asset.naturalHeight/2,progress=clamp(1-b.attackCue/(b.queuedAttack.phase===1?.5:.4),0,1);
    ctx.save();applyEnemyPose(b,true);drawMaterialSocketSample(asset,{x:frame%2*sw+x-32,y:Math.floor(frame/2)*sh+y-32,w:64,h:64},{x:(x-313.5)*scale,y:(y-313.5)*scale,w:64*scale,h:64*scale},{palette:'bloodstar',heat:progress*2,energy:.25+progress*.75,health:1});ctx.restore()
  }
  function drawCombatBackdrop(){
    ctx.save();
    if(!settings.clearCombat)drawStageForeground();
    // Grade scenery before gameplay. Decorative edge silhouettes must never
    // cover a fighter, projectile, hazard or native opening near the flight limit.
    ctx.fillStyle=settings.clearCombat?'#01071180':'#0206112e';ctx.fillRect(0,0,W,H);ctx.restore()
  }
  function drawForeground(){drawBossStatus();drawStageTitle();drawStageCue();drawApexIntro()}
  const gearDropSprites=Array(5);
  function recolorGearDropMaterial(data,tier){
    const color=rarityData[clamp(Math.floor(tier||0),0,4)].color,target=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),peak=Math.max(...target);
    for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],value=Math.max(r,g,b);if(!data[i+3]||value<70||g-r<25||b-r<30)continue;const amount=clamp((Math.min(g,b)-r-25)/45,0,1);for(let channel=0;channel<3;channel++)data[i+channel]=Math.round(data[i+channel]+(target[channel]/peak*value-data[i+channel])*amount)}
    return data
  }
  function gearDropSprite(tier){
    tier=clamp(Math.floor(tier||0),0,4);if(gearDropSprites[tier])return gearDropSprites[tier];
    if(!spriteAtlas.complete||!spriteAtlas.naturalWidth)return null;
    const sample=document.createElement('canvas');sample.width=sample.height=96;const c=sample.getContext('2d',{willReadFrequently:true}),sw=spriteAtlas.naturalWidth/4,sh=spriteAtlas.naturalHeight/4;
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(spriteAtlas,sw*2,sh*3,sw,sh,0,0,96,96);
    const pixels=c.getImageData(0,0,96,96);
    // Recolor the authored cyan energy, preserving its metal housing and alpha.
    recolorGearDropMaterial(pixels.data,tier);
    c.putImageData(pixels,0,0);gearDropSprites[tier]=sample;return sample
  }
  function paintDefenseBit(c,color='#d9f8ff',clock=0){
    c.save();c.lineJoin='round';c.lineWidth=1;c.shadowBlur=0;
    // Armored vanes and the inset optic use the same silhouette in flight and salvage.
    c.fillStyle='#162b3b';c.strokeStyle='#658b9f';
    for(const side of[-1,1]){c.beginPath();c.moveTo(side*4,-5);c.lineTo(side*9,-7);c.lineTo(side*11,-3);c.lineTo(side*9,5);c.lineTo(side*4,6);c.closePath();c.fill();c.stroke();c.fillStyle='#aec4ce';c.fillRect(side<0?-9:6,-4,2,6);c.fillStyle='#162b3b'}
    c.fillStyle='#293e4d';c.strokeStyle='#b4d0dd';c.beginPath();c.moveTo(-3,-7);c.lineTo(3,-7);c.lineTo(6,-3);c.lineTo(6,3);c.lineTo(3,7);c.lineTo(-3,7);c.lineTo(-6,3);c.lineTo(-6,-3);c.closePath();c.fill();c.stroke();
    c.fillStyle='#08151f';c.beginPath();c.arc(0,0,4.4,0,Math.PI*2);c.fill();c.fillStyle=color;c.shadowColor=color;c.shadowBlur=4;
    c.globalAlpha*=settings.reducedMotion?.9:.82+Math.sin(clock*4)*.12;c.beginPath();c.arc(0,0,2.8,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#f2fcff';c.fillRect(-1.6,-1.7,1.8,1.4);c.restore()
  }
  function paintMissileRack(c){
    c.save();c.lineJoin='round';c.shadowBlur=0;c.lineWidth=1.2;c.fillStyle='#142535';c.strokeStyle='#7294a8';
    c.beginPath();c.moveTo(-13,-8);c.lineTo(-8,-13);c.lineTo(8,-13);c.lineTo(13,-8);c.lineTo(13,11);c.lineTo(-13,11);c.closePath();c.fill();c.stroke();
    c.fillStyle='#3b5261';c.fillRect(-12,-6,24,3);c.fillRect(-12,6,24,3);
    for(const x of[-6,6]){
      c.fillStyle='#091522';c.fillRect(x-4,-10,8,20);c.fillStyle='#a8c2d1';c.fillRect(x-2.5,-5,5,12);c.fillStyle='#e7f3f6';c.fillRect(x-1.5,-5,1.5,10);
      c.fillStyle='#ffad62';c.beginPath();c.moveTo(x,-13);c.lineTo(x+2.5,-6);c.lineTo(x-2.5,-6);c.closePath();c.fill();
      c.fillStyle='#6c8b9d';c.beginPath();c.moveTo(x-2.5,2);c.lineTo(x-4.5,8);c.lineTo(x+4.5,8);c.lineTo(x+2.5,2);c.closePath();c.fill();
      c.fillStyle='#ffd4a0';c.shadowColor='#ff9b4f';c.shadowBlur=3;c.fillRect(x-1,8,2,2);c.shadowBlur=0
    }
    c.restore()
  }
  function drawPickupSprite(p,target=ctx){
    const c=target,tier=clamp(Math.floor(p.gear?.tier||0),0,4),spin=p.spin||0,color=p.type==='gear'?gearColor(p.gear):p.type==='crystal'?forceColors[p.color]:p.type==='missile'?'#ff9b4f':p.type==='bit'?'#d9f8ff':'#ffd166';
    c.save();c.translate(p.x,p.y);c.shadowColor=color;c.shadowBlur=12;c.strokeStyle=color;c.fillStyle='#091322';c.lineWidth=1.6;
    if(p.type==='gear'){
      const art=gearDropSprite(tier);
      if(art)c.drawImage(art,-18,-18,36,36);else{c.fillRect(-12,-12,24,24);c.strokeRect(-12,-12,24,24);c.fillStyle=color;c.fillRect(-4,-5,8,10)}
      c.shadowBlur=4;c.fillStyle=color;for(let pip=0;pip<=tier;pip++)c.fillRect((pip-tier/2)*4-1,-21,2,2);
      if(tier===4){c.lineWidth=1.3;for(const side of[-1,1]){c.beginPath();c.moveTo(side*21,-10);c.lineTo(side*24,-6);c.lineTo(side*24,6);c.lineTo(side*21,10);c.stroke()}}
    }else if(p.type==='crystal'){
      c.rotate(spin*1.8);c.beginPath();c.moveTo(0,-15);c.lineTo(10,0);c.lineTo(0,15);c.lineTo(-10,0);c.closePath();c.fill();c.stroke();
      c.globalAlpha*=.45+.12*Math.sin(t*3);c.fillStyle=color;c.fill();c.globalAlpha=1;c.shadowBlur=0;c.fillStyle='#e3ffffbb';c.beginPath();c.moveTo(0,-11);c.lineTo(-6,0);c.lineTo(0,4);c.closePath();c.fill()
    }else if(p.type==='shield'){
      c.rotate(Math.sin(spin*1.5)*.06);c.shadowBlur=12;c.lineWidth=1.4;c.fillStyle='#122a38';c.strokeStyle='#e5d998';c.beginPath();c.moveTo(0,-15);c.lineTo(12,-9);c.lineTo(10,5);c.lineTo(0,15);c.lineTo(-10,5);c.lineTo(-12,-9);c.closePath();c.fill();c.stroke();c.shadowBlur=5;c.fillStyle='#8cefff';c.beginPath();c.moveTo(0,-10);c.lineTo(7,-6);c.lineTo(5,3);c.lineTo(0,9);c.lineTo(-5,3);c.lineTo(-7,-6);c.closePath();c.fill();c.shadowBlur=0;c.strokeStyle='#122a38';c.lineWidth=1.5;c.beginPath();c.moveTo(0,-10);c.lineTo(0,9);c.moveTo(-7,-6);c.lineTo(5,3);c.moveTo(7,-6);c.lineTo(-5,3);c.stroke()
    }else if(p.type==='missile'){
      c.rotate(-.3+(settings.reducedMotion?0:Math.sin(spin*1.5)*.06));paintMissileRack(c)
    }else if(p.type==='bit'){
      c.rotate(settings.reducedMotion?0:Math.sin(spin*1.5)*.06);c.scale(1.35,1.35);paintDefenseBit(c,'#d9f8ff',spin)
    }else{
      c.rotate(Math.sin(spin*2)*.08);c.beginPath();c.arc(0,0,13,0,7);c.fill();c.stroke();c.shadowBlur=5;c.fillStyle=color;c.font='700 12px Oxanium, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(p.type==='missile'?'M':p.type==='bit'?'B':'S',0,1)
    }
    c.restore()
  }
  function renderLootGuide(){
    const grid=$('#loot-guide-grid');if(!grid)return;grid.innerHTML='';
    const items=[
      {name:'RED FORCE CRYSTAL',color:forceColors.red,pickup:{type:'crystal',color:'red'},description:'Equips or upgrades the detachable Force gun. Direct fire; Level 3 penetrates.'},
      {name:'BLUE FORCE CRYSTAL',color:forceColors.blue,pickup:{type:'crystal',color:'blue'},description:'Equips or upgrades blue Force lasers. Higher levels ricochet.'},
      {name:'YELLOW FORCE CRYSTAL',color:forceColors.yellow,pickup:{type:'crystal',color:'yellow'},description:'Equips or upgrades guided yellow wave rays. Force 2 unlocks in mission 2; Force 3 in mission 4.'},
      {name:'MISSILE MODULE',color:'#ff9b4f',pickup:{type:'missile'},description:'Adds homing missiles. From mission 2, formation leaders carry your first launcher if missing. A second launcher can drop from mission 3.'},
      {name:'DEFENSE BIT',color:'#d9f8ff',pickup:{type:'bit'},description:'Blocks pink shots above or below the fighter; amber fire pierces it. Formation leaders carry a missing first Bit from mission 3. Red Force adds Bit shots.'},
      {name:'AEGIS WARD',color:'#ffd166',pickup:{type:'shield'},description:'Adds one shield charge, up to four. Each absorbs one hit. Surplus pickups grant 2% DOSE.'},
      ...rarityData.map((rarity,tier)=>({name:rarity.name+' ASTERPRINT',color:rarity.color,pickup:{type:'gear',gear:{tier}},description:[
        'Grey equipment cache. Field drops; one stat roll. Bank it for the Garage.',
        'Green equipment cache. Field drops and the usual miniboss reward; one stat roll.',
        'Blue equipment cache. Usual apex reward or a lucky elite reward; two stat rolls.',
        'Purple equipment cache. Upgraded apex reward; two stat rolls.',
        'Gold equipment cache. Secret epic reward only; three stat rolls.'
      ][tier]}))
    ];
    for(const item of items){
      const card=document.createElement('article'),preview=document.createElement('canvas'),title=document.createElement('b'),copy=document.createElement('p');card.className='loot-guide-card';card.style.setProperty('--loot-color',item.color);preview.width=320;preview.height=180;preview.setAttribute('aria-label',item.name+' gameplay pickup');
      const c=preview.getContext('2d');c.scale(2,2);c.translate(80,45);c.scale(1.7,1.7);drawPickupSprite({...item.pickup,x:0,y:0,spin:0},c);title.textContent=item.name;copy.textContent=item.description;card.append(preview,title,copy);grid.appendChild(card)
    }
  }
  function openLootGuide(){state='lootguide';$('#hud').classList.add('hidden');show('loot-guide');renderLootGuide()}
  $('#loot-guide-menu-btn')?.addEventListener('click',openLootGuide);$('#loot-guide-back-btn')?.addEventListener('click',goMenu);
  spriteAtlas.addEventListener?.('load',()=>{drawEnemySprite.poseCache=null;if(state==='lootguide')renderLootGuide()});
  function enemyEndpointSurface(type,col,nextCol,row,w,h,mix){
    if(!['wing','drone','turret'].includes(type)||(mix!==0&&mix!==1)||type==='wing'&&mix===1||!spriteAtlas.complete||!spriteAtlas.naturalWidth||!spriteAtlas.naturalHeight)return null;
    let cache=drawEnemySprite.poseCache;
    if(!cache||cache.source!==spriteAtlas.src||cache.width!==spriteAtlas.naturalWidth||cache.height!==spriteAtlas.naturalHeight){
      cache={source:spriteAtlas.src,width:spriteAtlas.naturalWidth,height:spriteAtlas.naturalHeight,frames:new Map()};drawEnemySprite.poseCache=cache
    }
    const key=[type,col,nextCol,row,w,h,mix].join('/');if(cache.frames.has(key))return cache.frames.get(key);
    const surface=document.createElement('canvas');surface.width=w;surface.height=h;const raster=surface.getContext('2d');
    raster.clearRect(0,0,w,h);raster.globalCompositeOperation='source-over';
    if(!atlasCell(col,row,w/2,h/2,w,h,1-mix,'none',raster))return null;
    if(mix>0){raster.globalCompositeOperation='lighter';if(!atlasCell(nextCol,row,w/2,h/2,w,h,mix,'none',raster))return null;raster.globalCompositeOperation='source-over'}
    // Only the six authored endpoint poses are normally retained. Keep a hard
    // bound as well, without quantizing any intervening animation blend.
    cache.frames.set(key,surface);if(cache.frames.size>6)cache.frames.delete(cache.frames.keys().next().value);
    return surface
  }
  function drawEnemySprite(e){
    if(e.animOffset===undefined)e.animOffset=e.phase;
    const row=e.type==='turret'?3:2,baseCol=e.type==='drone'?2:0,rate=3.4,w=e.type==='turret'?62:e.type==='wing'?54:64,h=e.type==='turret'?58:e.type==='wing'?44:52,impact=clamp((e.hitFlash||0)/.12,0,1),motion=settings.reducedMotion?0:1,idle=Math.sin((t+e.animOffset)*(e.type==='drone'?2.4:4.2))*motion,smooth=value=>value*value*(3-2*value);
    let frame=0,next=1,mix=0;
    if(e.type==='turret'){
      const firing=e.fireAnim||0;
      // The second native pose contains the charged muzzle. It belongs to
      // the real firing cycle, rather than an unrelated repeating idle loop.
      if(e.telegraphFire&&firing>0)mix=smooth(firing<=.42?clamp((firing-.06)/.36,0,1):1-clamp((firing-.49)/.23,0,1));
      else if(!e.telegraphFire&&e.x<W-100&&Number.isFinite(e.cool))mix=smooth(clamp(1-Math.max(0,e.cool)/.38,0,1));
    }else if(e.type==='drone'){
      const firing=e.fireAnim||0,raw=firing<=.3?clamp((firing-.08)/.22,0,1):1-clamp((firing-.3)/.34,0,1);mix=smooth(raw)
    }else{
      const position=((t+e.animOffset)*rate)%2;frame=Math.floor(position);next=(frame+1)%2;mix=smooth(clamp((position-frame-.72)/.28,0,1))
    }
    const col=baseCol+frame,nextCol=baseCol+next,kick=impact*impact*.65*motion,stretch=impact*impact*.02*motion;
    ctx.save();ctx.translate(e.x+kick,e.y);ctx.rotate(e.type==='drone'?idle*.012:e.type==='turret'?idle*.006:0);ctx.scale((1+stretch)*(1-idle*.004),(1-stretch*.55)*(1+idle*(e.type==='drone'?.012:.006)));ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.filter=impact>0?`brightness(${1+impact*(settings.reducedMotion?.2:.32)}) saturate(${1-impact*.07})`:'none';
    // Interpolate native color and coverage once. Drawing a fully opaque old
    // pose under the next pose would leave its fins and cables visible.
    let surface=enemyEndpointSurface(e.type,col,nextCol,row,w,h,mix),rendered=!!surface;
    if(!surface){
      const buffers=drawEnemySprite.frameBuffers||(drawEnemySprite.frameBuffers=new Map());
      if(!buffers.has(e.type)){const scratch=document.createElement('canvas');scratch.width=w;scratch.height=h;buffers.set(e.type,scratch)}
      surface=buffers.get(e.type);const raster=surface.getContext('2d');raster.clearRect(0,0,w,h);raster.globalCompositeOperation='source-over';
      rendered=atlasCell(col,row,w/2,h/2,w,h,1-mix,'none',raster);
      if(rendered&&mix>0){raster.globalCompositeOperation='lighter';atlasCell(nextCol,row,w/2,h/2,w,h,mix,'none',raster);raster.globalCompositeOperation='source-over'}
    }
    if(rendered){ctx.imageSmoothingEnabled=false;ctx.drawImage(surface,-w/2,-h/2,w,h)}
    else{ctx.fillStyle=e.c;poly(0,0,e.r,e.type==='wing'?3:e.type==='turret'?8:5,Math.PI);ctx.fill();ctx.fillStyle='#080a19';ctx.beginPath();ctx.arc(0,0,e.r*.42,0,7);ctx.fill()}
    ctx.filter='none';
    if(e.telegraphFire&&(e.type!=='turret'||!rendered)&&e.fireAnim>0&&!e.fireReleased){const charge=clamp(e.fireAnim/.42,0,1),pulse=settings.reducedMotion?.65:.55+Math.sin(t*28)*.25;ctx.globalCompositeOperation='screen';ctx.globalAlpha=(.2+charge*.8)*pulse;ctx.fillStyle='#ff9b68';ctx.shadowColor='#ff3d81';ctx.shadowBlur=8+charge*18;ctx.beginPath();ctx.arc(-e.r*.7,0,2+charge*5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(-e.r*.7,0,5+charge*7,0,Math.PI*2);ctx.stroke()}
    ctx.restore()
  }
  function drawPlayerAndPod(){
    if(!player)return;const p=player.pod,podColor=forceColors[player.laserColor]||'#4ef5ff';
    for(const bit of bitPositions()){ctx.save();ctx.translate(bit.x,bit.y);ctx.rotate(settings.reducedMotion?0:Math.sin(t*2.2)*.035);paintDefenseBit(ctx,player.laserColor==='red'?'#ff6483':'#d9f8ff',t);ctx.restore()}
    if(p.owned){
      if(p.mode==='docked'){ctx.strokeStyle=podColor+'66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(player.x+(p.dockSide==='rear'?-25:25),player.y);ctx.lineTo(p.x,p.y);ctx.stroke()}
      ctx.save();ctx.translate(p.x,p.y);const pulse=settings.reducedMotion?1:1+Math.sin(p.phase*5)*.025,pose=settings.reducedMotion?0:Math.floor(p.phase*8)%4;ctx.scale(p.r/13*pulse,p.r/13*pulse);ctx.shadowBlur=24;ctx.shadowColor=podColor;ctx.globalCompositeOperation='source-over';
      if(!atlasCell(pose,1,0,0,51,51)){if(!settings.reducedMotion)ctx.rotate(p.phase*2.5);ctx.fillStyle=podColor;for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.fillRect(6,-2,9,4)}ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill()}
      ctx.globalCompositeOperation='screen';ctx.globalAlpha=.34;ctx.fillStyle=podColor;ctx.beginPath();ctx.arc(0,0,13,0,7);ctx.fill();ctx.restore()
    }
    ctx.save();ctx.translate(player.x,player.y);ctx.globalAlpha=player.inv>0?(settings.reducedMotion?.9:.84+Math.sin(t*18)*.1):1;ctx.fillStyle='#4ef5ff55';ctx.shadowBlur=24;ctx.shadowColor='#4ef5ff';ctx.beginPath();ctx.ellipse(-31,1,22,10,0,0,7);ctx.fill();if(!atlasCell(Math.floor(t*9)%4,0,0,0,88,70)){ctx.fillStyle='#ecffff';ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(-12,-12);ctx.lineTo(-5,0);ctx.lineTo(-12,12);ctx.closePath();ctx.fill()}ctx.shadowBlur=0;ctx.restore();drawPlayerShield()
  }
  // Separate hard-light facets follow the nose, wings and engine housing.
  // Gaps and a translucent surface keep the fighter readable inside its ward.
  const playerShieldFacets=[
    [[49,-1],[36,-14],[15,-22],[24,-10],[42,-1]],
    [[13,-23],[-8,-31],[-27,-29],[-33,-18],[-15,-20],[2,-16]],
    [[-34,-15],[-40,-7],[-40,7],[-34,15],[-30,7],[-30,-7]],
    [[13,23],[-8,31],[-27,29],[-33,18],[-15,20],[2,16]],
    [[49,1],[36,14],[15,22],[24,10],[42,1]]
  ];
  function drawPlayerShield(){
    if(!player)return;
    const impact=clamp((player.shieldHit||0)/.28,0,1),wake=clamp((player.shieldWake||0)/.65,0,1);
    if(player.shield<=0&&impact<=0)return;
    const active=player.shield>0?1:impact,flash=settings.reducedMotion?0:impact,assemble=settings.reducedMotion?0:wake;
    ctx.save();ctx.translate(player.x,player.y);ctx.globalCompositeOperation='screen';ctx.lineJoin='round';
    const glass=ctx.createLinearGradient(-38,-27,49,24);glass.addColorStop(0,'#3e9bba');glass.addColorStop(.5,'#5acde0');glass.addColorStop(1,'#ffda83');
    const edge=ctx.createLinearGradient(-36,0,49,0);edge.addColorStop(0,'#498d9d');edge.addColorStop(.48,'#84cfd3');edge.addColorStop(1,'#ffe4a1');
    for(let index=0;index<playerShieldFacets.length;index++){
      const facet=playerShieldFacets[index],growth=1+assemble*.07,trace=()=>{ctx.beginPath();facet.forEach(([x,y],i)=>{const px=x*growth,py=y*growth;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.closePath()};
      ctx.save();trace();ctx.fillStyle=glass;ctx.globalAlpha=active*(.055+assemble*.08+flash*.22);ctx.fill();
      ctx.strokeStyle=edge;ctx.lineWidth=.75+flash*.65;ctx.globalAlpha=active*(.3+assemble*.25+flash*.4);ctx.shadowColor='#9ceaff';ctx.shadowBlur=2+flash*6;ctx.stroke();
      ctx.shadowBlur=0;trace();ctx.clip();ctx.globalAlpha=active*(.1+flash*.16);ctx.strokeStyle='#a8eaff';ctx.lineWidth=.45;
      for(let x=-48;x<54;x+=9){ctx.beginPath();ctx.moveTo(x,-33);ctx.lineTo(x+28,33);ctx.stroke()}
      ctx.restore()
    }
    // Wing emitters tie the projected facets back to the ship's own armor.
    ctx.globalAlpha=active*(.65+flash*.3);ctx.fillStyle='#c4f7ff';ctx.shadowColor='#5be3ff';ctx.shadowBlur=4;
    for(const side of[-1,1]){ctx.save();ctx.translate(-17,side*20);ctx.rotate(side*.34);ctx.fillRect(-3,-.65,6,1.3);ctx.restore()}
    if(flash>0){ctx.globalAlpha=flash*.65;ctx.strokeStyle='#f1fcff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(31,-13);ctx.lineTo(46,0);ctx.lineTo(31,13);ctx.stroke()}
    ctx.restore()
  }
  function armorPanelPath(width,height){ctx.beginPath();ctx.moveTo(-width*.34,-height*.5);ctx.lineTo(width*.34,-height*.5);ctx.lineTo(width*.5,0);ctx.lineTo(width*.34,height*.5);ctx.lineTo(-width*.34,height*.5);ctx.lineTo(-width*.5,0);ctx.closePath()}
  function drawBloodstarScratchCell(asset,col,row,cols,rows,composite='source-over',alpha=1,filter='none'){if(!asset?.ready||!asset.naturalWidth)return false;const sw=asset.naturalWidth/cols,sh=asset.naturalHeight/rows;bloodstarScratchCtx.save();bloodstarScratchCtx.globalCompositeOperation=composite;bloodstarScratchCtx.globalAlpha=alpha;bloodstarScratchCtx.filter=filter;bloodstarScratchCtx.imageSmoothingEnabled=true;bloodstarScratchCtx.imageSmoothingQuality='high';bloodstarScratchCtx.drawImage(asset,col*sw,row*sh,sw,sh,0,0,bloodstarScratch.width,bloodstarScratch.height);bloodstarScratchCtx.restore();return true}
  function weakPointPulse(e,index=0){return settings.reducedMotion?.5:.5+.5*Math.sin(e.clock*5.2+index*.8)}
  function bloodstarWeakHeat(e,index=0){
    if(e.weakOpen){const duration=weakExposureDuration(e),warm=clamp((duration-e.weakTimer)/.22,0,1);return 1+warm*(.85+weakPointPulse(e,index)*.15)}
    return e.weakTelegraph>0?clamp(1-e.weakTelegraph/(e.phase===1?.55:.42),0,1):0
  }
  function drawBloodstarMaterialSockets(e,frame,asset){
    const phase=e.phase-1,points=bloodstarNodePixels[phase][frame],sw=asset.naturalWidth/2,sh=asset.naturalHeight/2,sx=frame%2*sw,sy=Math.floor(frame/2)*sh,scale=bloodstarScratch.width/sw;
    activeWeakNodes(e).forEach((node,index)=>{
      const point=points[index],rx=index<2?15:20,ry=index<2?22:18;
      drawMaterialSocketSample(asset,{x:sx+point[0]-rx,y:sy+point[1]-ry,w:rx*2,h:ry*2},{x:point[0]*scale,y:point[1]*scale,w:rx*2*scale,h:ry*2*scale},{context:bloodstarScratchCtx,palette:'bloodstar',heat:bloodstarWeakHeat(e,index),energy:e.weakOpen?1:e.weakTelegraph>0?.4:0,sealed:!e.weakOpen&&!e.weakTelegraph,health:node.hp/node.max,destroyed:node.destroyed,seed:index})
    })
  }
  function prefetchEarlyBossMaterialReadbacks(e,asset,nodes,points,type,phase,sx,sy){
    if(nativeSpritePartCapture||e!==boss)return null;
    // Mirrors drawMaterialSocketSample's destruction-surface substitution and rect scaling exactly.
    let source=asset,scaleX=1,scaleY=1;const module=window.StarfighterDestruction;
    if(module?.has(source)){
      const surface=module.surface(source,nativeSpriteBrokenGroups(e),{style:nativeSpriteStyle(e)});if(!surface)return null;
      if(surface!==source){scaleX=(surface.naturalWidth||surface.width)/(source.naturalWidth||source.width);scaleY=(surface.naturalHeight||surface.height)/(source.naturalHeight||source.height);source=surface}
    }
    const options={hue:[0,26,270,185,24][type],hueSpread:type===3?30:40},samples=[];
    for(let index=0;index<nodes.length;index++){
      const node=nodes[index];if(nativeSocketRemoved(e,node))continue;
      const point=points[index];if(!point)continue;
      // Copied expressions from the socket loop in drawEarlyMaterialSockets so every rectangle is bit-identical.
      const core=(type===1&&phase===0&&index===2)||(type===2&&index===2)||(type===3&&riftNodeSlot(e,node)===0),rx=type===0?(index<2?15:20):core?32:type===4?20:23,ry=type===0?(index<2?22:18):core?27:type===1?16:20;
      const materialRx=core?type===2?28:28:type===1?16:type===2?18:type===4?13:rx,materialRy=core?type===2?24:22:type===1?11:type===2?14:type===4?13:ry;
      const rect={x:sx+point[0]-materialRx,y:sy+point[1]-materialRy,w:materialRx*2,h:materialRy*2};
      samples.push({asset:source,rect:{x:rect.x*scaleX,y:rect.y*scaleY,w:rect.w*scaleX,h:rect.h*scaleY},options})
    }
    return prefetchNativeMaterialReadbacks(samples)
  }
  function drawEarlyMaterialSockets(e){
    // Bloodstar's material is painted inside each native frame, before blending.
    if(e.type===0)return;
    const phase=e.phase-1,type=e.type,nodes=activeWeakNodes(e);let asset,pose,points,cols=2,rows=2;
    if(type===0){pose=bloodstarAnimationState(e).frame;asset=bloodstarPhaseSprites[phase];points=bloodstarNodePixels[phase][pose]}
    else if(type===1){pose=twinMawFrame(e)+phase*2;asset=bossSprites[1];points=twinMawNodePixels[phase][pose%2]}
    else if(type===2){pose=helixFrame(e)+phase*2;asset=bossSprites[2];points=helixNodePixels[phase][pose%2]}
    else if(type===3){const frame=riftFrame(e),between=phase===0&&frame%2===1;asset=between?riftPhase1InbetweenSprite:riftPhaseSprites[phase];pose=phase===0?Math.floor(frame/2):frame;points=riftAnimatedNodePixels[phase][frame]}
    else{const frame=ironBloomFrame(e);asset=frame%2?ironBloomInbetweenSprites[phase]:ironBloomPhaseSprites[phase];pose=Math.floor(frame/2);points=ironBloomNodePixels[phase][frame]}
    if(!asset?.ready||!points)return;
    const sw=(asset.naturalWidth||asset.width)/cols,sh=(asset.naturalHeight||asset.height)/rows,sx=(pose%cols)*sw,sy=Math.floor(pose/cols)*sh,scale=(type===4?262:224)/627,motion=bossSpriteMotion(e);
    const previousReadbacks=nativePaletteReadbackScope;
    try{
    nativePaletteReadbackScope=prefetchEarlyBossMaterialReadbacks(e,asset,nodes,points,type,phase,sx,sy);
    ctx.save();ctx.scale(motion.x,motion.y);
    nodes.forEach((node,index)=>{
      if(nativeSocketRemoved(e,node))return;
      const point=points[index];if(!point)return;const offset=localWeakNode(e,node),core=(type===1&&phase===0&&index===2)||(type===2&&index===2)||(type===3&&riftNodeSlot(e,node)===0),rx=type===0?(index<2?15:20):core?32:type===4?20:23,ry=type===0?(index<2?22:18):core?27:type===1?16:20;
      const angle=type===1?(twinMawNodeSide(e,node)?twinMawJawPose(e,twinMawNodeSide(e,node)).angle:twinMawModularCoreActive(e)?twinMawCorePose(e).angle:twinMawRearPose(e,point[1]<313.5?1:-1).angle):type===2?(helixNodeSide(node)?helixShellPose(e,helixNodeSide(node)).angle:helixCorePose(e).angle):0;
      const energy=e.weakOpen?.86+weakPointPulse(e,index)*.14:e.weakTelegraph>0?.4:0,localHit=Number.isFinite(node.hitTime)?clamp(1-(e.clock-node.hitTime)/.14,0,1):0;
      ctx.save();ctx.translate(offset.dx,offset.dy);ctx.rotate(angle);
      const materialRx=core?type===2?28:28:type===1?16:type===2?18:type===4?13:rx,materialRy=core?type===2?24:22:type===1?11:type===2?14:type===4?13:ry;
      drawMaterialSocketSample(asset,{x:sx+point[0]-materialRx,y:sy+point[1]-materialRy,w:materialRx*2,h:materialRy*2},{x:0,y:0,w:materialRx*2*scale,h:materialRy*2*scale},{energy,highlight:e.weakOpen,sealed:!e.weakOpen&&!e.weakTelegraph,health:node.hp/node.max,destroyed:node.destroyed,hit:localHit,hue:[0,26,270,185,24][type],hueSpread:type===3?30:40,seed:index+type*3});ctx.restore()
    });ctx.restore()
    }finally{nativePaletteReadbackScope=previousReadbacks}
  }
  function drawBloodstarCompositeFrame(b,frame,size,alpha=1,filter='none'){
    const phase=b.phase-1,asset=bloodstarPhaseSprites[phase];if(!asset?.ready)return false;bloodstarScratchCtx.clearRect(0,0,bloodstarScratch.width,bloodstarScratch.height);drawBloodstarScratchCell(asset,frame%2,Math.floor(frame/2),2,2);drawBloodstarMaterialSockets(b,frame,asset);
    const nodes=activeWeakNodes(b);for(const node of nodes)if(node.destroyed&&node.tentacleIndex>=0){const mask=bloodstarTentacleMasks[phase][node.tentacleIndex];drawBloodstarScratchCell(mask,frame%2,Math.floor(frame/2),2,2,'destination-out')}
    const motion=bossSpriteMotion(b),drawW=size*motion.x,drawH=size*motion.y;ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bloodstarScratch,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();return true
  }
  function drawBloodstarSprite(b,size,hit){
    const {frame,next,mix}=bloodstarAnimationState(b),drawFrame=(index,alpha=1,filter='none')=>drawBloodstarCompositeFrame(b,index,size,alpha,filter),rendered=drawFrame(frame,1-mix);if(rendered&&mix>0)drawFrame(next,mix);if(rendered)drawEarlyMaterialSockets(b);if(rendered&&hit>0){const flash=Math.min(.3,hit*2.5);drawFrame(frame,flash*(1-mix),'brightness(1.75) saturate(.85)');if(mix>0)drawFrame(next,flash*mix,'brightness(1.75) saturate(.85)')}return rendered
  }
  function drawModularArticulatedSprite(b,asset,size,hit,helix=false){
    const module=window.StarfighterDestruction,broken=nativeSpriteBrokenGroups(b);
    if(!nativeSpritePartCapture&&!broken.size)return false;
    if(!module?.has(asset)||!module.ready(asset))return false;
    const cellW=(asset.naturalWidth||asset.width)/2,cellH=(asset.naturalHeight||asset.height)/2,frame=helix?helixFrame(b):twinMawFrame(b),row=b.phase-1,scale=size/cellW,motion=bossSpriteMotion(b),phase2=b.phase===2,shift=helix?helixFrameShift(b,frame):0,core=helix?helixCorePixel(b,frame):null;
    const render=(alpha=1,filter='none')=>{
      ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(motion.x,motion.y);
      const cell=surface=>ctx.drawImage(surface,frame*cellW,row*cellH,cellW,cellH,(shift-cellW/2)*scale,-cellH/2*scale,size,cellH*scale);
      const layer=(id,pose,pivot)=>{
        if(nativeSpritePartCapture?nativeSpritePartCapture!==id:broken.has(id))return;
        const surface=module.surface(asset,broken,{onlyPart:id});if(!surface){nativeSpriteUnavailable=true;return}
        const px=(pivot.x+shift-cellW/2)*scale,py=(pivot.y-cellH/2)*scale;
        ctx.save();ctx.translate(pose.dx*scale,pose.dy*scale);ctx.translate(px,py);ctx.rotate(pose.angle||0);ctx.translate(-px,-py);cell(surface);ctx.restore()
      };
      const coreTransform=paint=>{
        ctx.save();
        if(helix){const pose=helixCorePose(b),px=(core.x+shift-cellW/2)*scale,py=(core.y-cellH/2)*scale;ctx.translate(pose.dx*scale,0);ctx.translate(px,py);ctx.rotate(Math.sin(b.clock*(phase2?5.2:3.5))*(phase2?.022:.012));ctx.scale(pose.scale,1/pose.scale);ctx.translate(-px,-py)}
        else{const pose=twinMawCorePose(b),px=(412.5-cellW/2)*scale;ctx.translate(pose.dx*scale,0);ctx.translate(px,0);ctx.rotate(pose.angle);ctx.scale(pose.scale,1/pose.scale);ctx.translate(-px,0)}
        paint();ctx.restore()
      };
      if(!nativeSpritePartCapture)coreTransform(()=>cell(module.surface(asset,broken,{coreOnly:true,style:nativeSpriteStyle(b)})));
      if(helix){layer('shell-0',helixShellPose(b,1),core);layer('shell-1',helixShellPose(b,-1),core);if(phase2&&(nativeSpritePartCapture==='shell-3'||!nativeSpritePartCapture&&!broken.has('shell-3')))coreTransform(()=>cell(module.surface(asset,broken,{onlyPart:'shell-3'})))}
      else{layer('upper-jaw',twinMawJawPose(b,1),twinMawJawPivot(b,1));layer('lower-jaw',twinMawJawPose(b,-1),twinMawJawPivot(b,-1))}
      ctx.restore()
    };
    render();drawEarlyMaterialSockets(b);if(hit>0)render(Math.min(.3,hit*2.5),'brightness(1.75) saturate(.85)');return true
  }
  function drawTwinMawSprite(b,size,hit){
    const asset=bossSprites[1],sourceWidth=asset?.naturalWidth||asset?.width,sourceHeight=asset?.naturalHeight||asset?.height;if(!asset?.ready||!sourceWidth)return false;
    if(drawModularArticulatedSprite(b,asset,size,hit))return true;
    const cellW=sourceWidth/2,cellH=sourceHeight/2,frame=twinMawFrame(b),row=b.phase-1,scale=size/cellW,motion=bossSpriteMotion(b),cellX=frame*cellW,cellY=row*cellH,phase2=b.phase===2;
    const render=(alpha=1,filter='none')=>{
      ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(motion.x,motion.y);
      const crop=(sx,sy,sw,sh)=>ctx.drawImage(asset,cellX+sx,cellY+sy,sw,sh,(sx-cellW/2)*scale,(sy-cellH/2)*scale,sw*scale,sh*scale);
      const rear=(side,sy,sh)=>{const pose=twinMawRearPose(b,side),px=(455-cellW/2)*scale,py=((side>0?278:349)-cellH/2)*scale;ctx.save();ctx.translate(pose.dx*scale,pose.dy*scale);ctx.translate(px,py);ctx.rotate(pose.angle);ctx.translate(-px,-py);crop(420,sy,cellW-420,sh);ctx.restore()};
      const jaw=(side,sy,sh)=>{const pivot=twinMawJawPivot(b,side),pose=twinMawJawPose(b,side),px=(pivot.x-cellW/2)*scale,py=(pivot.y-cellH/2)*scale;ctx.save();ctx.translate(pose.dx*scale,pose.dy*scale);ctx.translate(px,py);ctx.rotate(pose.angle);ctx.translate(-px,-py);crop(0,sy,445,sh);ctx.restore()};
      rear(1,0,cellH/2);rear(-1,cellH/2,cellH/2);jaw(1,0,cellH/2);jaw(-1,cellH/2,cellH/2);
      const tail=twinMawRearPose(b,1),tailX=(552-cellW/2)*scale,tailY=(307-cellH/2)*scale;ctx.save();ctx.translate(tail.dx*scale,tail.dy*scale);ctx.translate(tailX,tailY);ctx.rotate(tail.angle);ctx.translate(-tailX,-tailY);crop(500,240,cellW-500,147);ctx.restore();
      const coreBeat=Math.sin(b.clock*(phase2?5.8:4.2)),recoil=b.mawRecoil||0,coreX=(412.5-cellW/2)*scale,coreShift=(coreBeat*(phase2?3:1.8)+recoil*7)*scale,coreScale=1+Math.max(0,coreBeat)*(phase2?.038:.022)+recoil*.035;
      ctx.save();ctx.translate(coreShift,0);ctx.translate(coreX,0);ctx.rotate(Math.sin(b.clock*(phase2?4.4:3.1))*(phase2?.018:.01));ctx.scale(coreScale,1/coreScale);ctx.translate(-coreX,0);crop(300,220,225,187);ctx.restore();
      ctx.restore()
    };
    render();drawEarlyMaterialSockets(b);if(hit>0)render(Math.min(.3,hit*2.5),'brightness(1.75) saturate(.85)');return true
  }
  function drawHelixCrownSprite(b,size,hit){
    const asset=bossSprites[2],sourceWidth=asset?.naturalWidth||asset?.width,sourceHeight=asset?.naturalHeight||asset?.height;if(!asset?.ready||!sourceWidth)return false;
    if(drawModularArticulatedSprite(b,asset,size,hit,true))return true;
    const cellW=sourceWidth/2,cellH=sourceHeight/2,frame=helixFrame(b),row=b.phase-1,frameShift=helixFrameShift(b,frame),scale=size/cellW,motion=bossSpriteMotion(b),cellX=frame*cellW,cellY=row*cellH,core=helixCorePixel(b,frame),splitY=core.y,phase2=b.phase===2;
    const render=(alpha=1,filter='none')=>{
      ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(motion.x,motion.y);
      const crop=(sx,sy,sw,sh)=>ctx.drawImage(asset,cellX+sx,cellY+sy,sw,sh,(sx+frameShift-cellW/2)*scale,(sy-cellH/2)*scale,sw*scale,sh*scale),pivotX=(core.x+frameShift-cellW/2)*scale,pivotY=(core.y-cellH/2)*scale;
      const shell=(side,sy,sh)=>{const pose=helixShellPose(b,side);ctx.save();ctx.translate(pose.dx*scale,pose.dy*scale);ctx.translate(pivotX,pivotY);ctx.rotate(pose.angle);ctx.translate(-pivotX,-pivotY);crop(0,sy,cellW,sh);ctx.restore()};
      shell(1,0,splitY);shell(-1,splitY,cellH-splitY);
      const corePose=helixCorePose(b),coreLeft=Math.max(0,core.x-(phase2?95:90)),coreTop=Math.max(0,core.y-(phase2?92:86)),coreWidth=Math.min(cellW-coreLeft,phase2?390:340),coreHeight=Math.min(cellH-coreTop,phase2?184:172);
      ctx.save();ctx.translate(corePose.dx*scale,0);ctx.translate(pivotX,pivotY);ctx.rotate(Math.sin(b.clock*(phase2?5.2:3.5))*(phase2?.022:.012));ctx.scale(corePose.scale,1/corePose.scale);ctx.translate(-pivotX,-pivotY);crop(coreLeft,coreTop,coreWidth,coreHeight);ctx.restore();
      ctx.restore()
    };
    render();drawEarlyMaterialSockets(b);if(hit>0)render(Math.min(.3,hit*2.5),'brightness(1.75) saturate(.85)');return true
  }
  function drawRiftWraithSprite(b,size,hit){
    const phase=b.phase-1,frame=riftFrame(b),phase2=b.phase===2,keyAsset=riftPhaseSprites[phase],betweenAsset=!phase2&&riftPhase1InbetweenSprite.ready?riftPhase1InbetweenSprite:null,sourceWidth=keyAsset?.naturalWidth||keyAsset?.width,sourceHeight=keyAsset?.naturalHeight||keyAsset?.height;if(!keyAsset?.ready||!sourceWidth)return false;
    const cellW=sourceWidth/2,cellH=sourceHeight/2,scale=size/627,drawW=cellW*scale,drawH=cellH*scale,motion=bossSpriteMotion(b);
    const drawFrame=(pose,alpha=1,filter='none')=>{
      const useBetween=!phase2&&pose%2===1&&betweenAsset,asset=useBetween?betweenAsset:keyAsset,sourcePose=phase2?pose:Math.floor(pose/2),registration=riftAnimatedRegistration[phase][pose],col=sourcePose%2,row=Math.floor(sourcePose/2);
      ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(motion.x,motion.y);ctx.drawImage(asset,col*cellW,row*cellH,cellW,cellH,-drawW/2+registration[0]*scale,-drawH/2+registration[1]*scale,drawW,drawH);ctx.restore()
    };
    drawFrame(frame);
    if(hit>0)drawFrame(frame,Math.min(.3,hit*2.5),'brightness(1.75) saturate(.85)');
    drawEarlyMaterialSockets(b);return true
  }
  function drawIronBloomSprite(b,size,hit){
    const frame=ironBloomFrame(b),sourcePose=Math.floor(frame/2),asset=frame%2?ironBloomInbetweenSprites[b.phase-1]:ironBloomPhaseSprites[b.phase-1],sourceWidth=asset?.naturalWidth||asset?.width,sourceHeight=asset?.naturalHeight||asset?.height;if(!asset?.ready||!sourceWidth)return false;
    const cellW=sourceWidth/2,cellH=sourceHeight/2,col=sourcePose%2,row=Math.floor(sourcePose/2),motion=bossSpriteMotion(b),drawW=size,drawH=size,phase2=b.phase===2;
    const render=(alpha=1,filter='none')=>{ctx.save();ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';ctx.filter=filter;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(motion.x,motion.y);ctx.drawImage(asset,col*cellW,row*cellH,cellW,cellH,-drawW/2,-drawH/2,drawW,drawH);ctx.restore()};
    render();if(hit>0)render(Math.min(.3,hit*2.5),'brightness(1.75) saturate(.85)');
    drawEarlyMaterialSockets(b);return true
  }
  // Measured native energy anchors and source rectangles, including off-grid inbetween poses.
  const lateBossMaterialTracks={"5":[{"key":[[[127.14,119.7],[108.99,154.59],[187.18,126.82],[105.64,255.25],[192.82,267.74]],[[109.24,118.95],[91.69,155.86],[168.47,126.26],[89.4,253.88],[175.54,265.16]],[[106.89,115.7],[88.09,152.15],[151.77,127.39],[86.34,253.77],[171.96,265.83]],[[95.95,124.76],[81.96,161.85],[155.47,126.15],[84.48,254.62],[162.19,258.57]],[[124.6,101.3],[104.61,136.01],[169.83,112.02],[101.52,230.42],[186.61,249.02]],[[100.66,106.18],[85.33,141.36],[157.61,110.5],[87.07,237.99],[165.96,246.79]],[[104.45,98.72],[83.96,131.48],[149.3,110.69],[84.73,236.3],[167.47,248.71]],[[92.29,104.31],[75.47,140.73],[150.74,110.95],[75.77,238.22],[157.15,248.1]],[[124.17,84.64],[102.82,119.35],[168.38,97.47],[102.59,220.86],[184.16,234.74]],[[114.07,82.22],[91.81,116.42],[158.83,95.52],[89.41,217.88],[175.14,234.48]],[[104.03,83.85],[83.95,119.2],[148.56,96.46],[82.34,220.87],[165.22,234.93]],[[91.43,90.9],[74.03,127.85],[135.95,97.98],[65.32,221.34],[152.78,235.74]],[[119.37,56.34],[102.82,93.78],[179.5,64.52],[105.62,198.06],[184.11,203.65]],[[116.24,62.02],[96.99,96.51],[160.79,71.49],[91.45,199.41],[175.08,209.58]],[[101.82,59.82],[83.38,95.53],[146.29,68.86],[79.67,195.37],[162.82,205.69]],[[91.71,59.23],[74.42,94.94],[150.08,65.22],[69.44,193.7],[154.93,205.3]]],"between":[[[122.52,86.12],[106.39,121.45],[185.57,92.59],[89.43,226.96],[179.71,236.19]],[[105.2,82.59],[87.72,124.07],[159.99,92.06],[82.69,225.87],[167.44,235.85]],[[99.86,88.55],[82.59,125.63],[161.21,93.86],[71.89,231.83],[163.49,239.91]],[[99.47,78.42],[82.73,129.46],[160.18,93.6],[76.98,227.45],[157.03,233.04]],[[115.9,70.37],[100.03,105.91],[161.85,80.56],[90.35,212.34],[180.8,225.4]],[[98.14,76.89],[84.86,113.43],[159.17,78.31],[81.6,220.43],[160.48,230.53]],[[100.19,71.48],[81.7,108.71],[160.41,77.58],[79.07,217.83],[159.81,230.11]],[[98.58,61.31],[69.01,93.47],[157.63,77.57],[75.99,197.9],[182.12,206.43]],[[112.21,69.99],[83.17,85.64],[159.06,78.96],[93.68,202.4],[189.65,210.57]],[[103.61,72.43],[75.69,94.06],[149.75,80.68],[72.94,204.65],[177.69,208.17]],[[101.21,57.25],[80.98,109.42],[159.63,76.27],[88.46,180.96],[162.5,198.01]],[[93.08,71.77],[75.16,108.61],[155.06,76.62],[66.98,205.49],[162.58,224.93]],[[110.65,57.85],[94.51,94.03],[172.47,62.94],[81.66,204.97],[170.23,216.54]],[[106.06,58.88],[89.44,96.04],[167.18,66.29],[74.74,208.6],[166.09,219.11]],[[99.67,60.48],[83.27,97.88],[161.48,66.42],[71.71,209.54],[160.58,218.83]],[[99.43,61.63],[80.24,100.01],[159.39,66.01],[75.79,207.23],[162.23,214.22]]],"registration":[[[29.0,16.0,315.0,274.0],[22.5,56.0,305.5,297.0]],[[17.5,14.0,296.5,271.0],[10.0,56.0,296.5,295.0]],[[10.0,17.0,299.0,274.0],[18.0,56.5,291.5,290.5]],[[8.5,17.0,296.5,268.0],[27.5,49.0,299.5,282.0]],[[25.0,1.5,308.0,261.5],[29.5,40.5,300.0,277.0]],[[14.5,0.5,295.5,268.5],[19.0,40.0,288.5,277.0]],[[9.0,-0.5,295.0,267.5],[13.5,40.5,284.5,278.5]],[[7.5,1.5,294.5,261.5],[22.5,33.5,295.0,295.5]],[[20.0,4.0,306.0,264.0],[31.0,26.5,304.5,288.0]],[[14.5,5.0,296.5,261.0],[22.5,26.0,295.0,288.0]],[[9.0,4.0,298.0,264.0],[14.0,25.5,285.0,313.0]],[[3.5,2.0,296.5,266.0],[23.0,13.0,294.0,272.5]],[[20.0,-12.5,310.0,249.5],[34.0,2.0,305.0,235.5]],[[15.5,-10.5,303.5,251.5],[24.0,2.0,295.0,236.5]],[[9.0,-11.5,300.0,252.5],[13.5,0.0,283.0,234.5]],[[7.5,-11.5,296.5,250.5],[27.5,28.0,295.5,267.5]]]},{"key":[[[135.85,102.98],[110.49,136.62],[192.22,126.03],[102.55,215.4],[146.99,255.23],[222.0,252.56]],[[114.58,99.85],[89.91,133.27],[170.68,123.93],[78.96,215.42],[123.08,253.72],[199.88,251.7]],[[115.75,98.12],[90.97,130.88],[177.31,123.96],[76.65,213.91],[119.28,251.53],[195.15,249.78]],[[97.96,98.05],[73.97,129.83],[152.04,122.07],[61.63,213.03],[104.95,251.75],[178.89,250.19]],[[131.41,82.73],[109.03,116.41],[184.94,106.55],[97.85,198.1],[143.21,236.05],[213.55,233.53]],[[112.15,87.25],[88.9,118.74],[167.19,108.87],[77.35,199.13],[122.19,236.73],[196.68,234.96]],[[108.53,82.89],[86.37,115.94],[173.55,107.02],[75.29,198.35],[117.21,235.53],[191.75,234.65]],[[94.26,84.5],[72.19,117.56],[150.95,106.34],[62.3,197.95],[103.06,235.99],[177.1,234.4]],[[129.43,66.41],[105.54,99.31],[184.69,91.37],[96.94,183.48],[136.44,222.05],[209.1,221.17]],[[108.46,67.42],[85.28,99.04],[170.46,92.37],[73.57,183.64],[114.39,222.82],[188.07,221.79]],[[103.42,66.23],[80.07,99.64],[157.33,92.74],[68.26,184.18],[109.1,223.77],[183.56,222.41]],[[93.91,66.15],[71.31,98.71],[156.39,91.12],[60.11,184.0],[99.87,223.66],[172.31,221.41]],[[124.56,50.36],[102.64,84.5],[178.36,75.72],[92.36,170.09],[131.79,208.71],[202.84,205.7]],[[109.43,50.86],[85.98,83.65],[171.53,76.15],[74.92,170.4],[114.98,208.92],[188.41,205.88]],[[102.48,51.09],[77.77,84.27],[157.29,76.02],[66.2,170.18],[108.11,208.34],[185.11,204.65]],[[93.84,50.22],[72.45,83.61],[156.35,75.46],[60.01,169.87],[101.28,208.12],[173.95,204.07]]],"between":[[[123.84,80.2],[98.51,116.24],[184.27,104.67],[89.0,217.34],[126.2,253.48],[206.89,249.36]],[[115.76,80.3],[89.97,115.17],[176.93,103.76],[72.87,209.03],[123.73,253.06],[201.28,248.07]],[[114.45,78.82],[87.97,113.84],[179.53,105.64],[70.3,210.17],[120.05,251.77],[202.93,246.44]],[[112.97,81.08],[85.69,113.57],[172.34,104.33],[71.2,209.42],[119.81,249.75],[203.65,245.52]],[[118.64,72.2],[89.67,107.2],[184.27,99.61],[75.19,202.32],[123.67,243.95],[203.1,240.13]],[[114.39,72.03],[67.03,110.81],[180.62,98.81],[71.72,202.8],[115.12,242.78],[186.34,239.29]],[[112.85,71.94],[86.77,107.04],[173.45,98.54],[71.93,201.44],[115.48,243.35],[199.09,244.26]],[[111.81,71.79],[85.06,103.81],[178.17,94.81],[67.2,186.49],[112.05,225.4],[196.27,222.98]],[[118.86,67.77],[63.35,109.02],[181.14,89.4],[79.55,172.61],[88.18,192.07],[195.44,200.96]],[[113.31,49.86],[60.69,108.98],[182.21,84.43],[86.4,166.4],[85.13,190.39],[197.77,190.55]],[[115.78,47.53],[82.0,80.09],[176.3,87.0],[71.83,177.14],[83.55,191.46],[201.7,190.63]],[[112.52,64.1],[84.83,96.77],[182.24,85.23],[72.01,177.42],[114.53,222.26],[190.93,218.23]],[[114.37,60.53],[88.24,94.78],[175.5,85.98],[71.87,192.71],[119.23,240.36],[202.76,236.68]],[[114.37,60.84],[88.37,95.13],[176.76,86.55],[71.37,194.81],[117.95,239.55],[202.39,235.21]],[[114.54,58.07],[84.68,94.92],[176.71,85.01],[70.75,196.59],[118.01,239.33],[202.82,234.03]],[[112.77,60.51],[85.46,98.61],[180.72,87.84],[67.68,200.94],[117.71,245.11],[204.17,238.26]]],"registration":[[[19.0,6.0,314.0,295.0],[20.5,35.5,308.0,289.0]],[[10.5,7.0,309.5,295.0],[10.0,35.0,302.0,289.0]],[[10.0,7.0,310.0,295.0],[11.5,35.0,292.5,289.0]],[[8.5,8.0,304.5,295.0],[22.5,27.0,297.0,281.0]],[[13.0,-1.5,310.0,288.5],[31.0,20.0,303.0,273.0]],[[9.5,-0.5,306.5,289.5],[18.5,19.5,293.5,273.0]],[[10.0,2.5,308.0,290.5],[10.5,18.5,284.5,273.0]],[[8.5,3.5,305.5,289.5],[21.0,11.0,293.0,293.0]],[[13.0,-2.0,310.0,284.0],[27.5,3.0,298.5,313.0]],[[9.5,-5.0,306.5,279.0],[14.0,3.5,286.5,313.0]],[[9.0,-7.0,309.0,281.0],[8.0,3.5,276.5,313.0]],[[8.5,-7.0,305.5,282.0],[20.0,1.5,281.5,278.5]],[[10.0,-11.5,308.0,282.5],[26.5,0.0,289.0,244.0]],[[8.5,-11.5,307.5,281.5],[13.0,0.0,282.5,244.0]],[[7.0,-11.5,307.0,281.5],[8.0,0.0,272.5,244.0]],[[7.5,-11.5,302.5,286.5],[24.5,18.0,288.5,266.5]]]}],"6":[{"key":[[[190.44,131.77],[270.63,87.61],[265.34,191.66]],[[184.93,132.61],[263.22,86.66],[258.65,191.73]],[[179.83,133.2],[258.31,87.21],[254.39,191.73]],[[179.93,133.23],[255.18,73.76],[254.2,191.13]],[[189.94,133.75],[267.04,81.0],[267.96,194.68]],[[184.77,136.74],[271.5,84.75],[269.27,198.35]],[[180.54,137.98],[263.87,88.65],[268.82,196.26]],[[182.91,137.4],[264.29,89.5],[266.07,193.38]],[[187.27,136.83],[271.09,86.74],[273.23,199.12]],[[185.15,137.37],[265.71,90.52],[266.72,195.17]],[[182.18,140.84],[265.72,88.82],[269.67,197.3]],[[183.73,139.53],[258.09,83.16],[260.79,196.79]],[[189.47,133.88],[267.69,83.42],[265.0,192.32]],[[184.79,134.48],[259.88,82.01],[255.46,192.24]],[[184.92,136.14],[260.0,80.12],[260.33,193.02]],[[184.96,136.25],[257.96,79.24],[258.6,193.95]]],"between":[[[200.73,135.07],[273.93,86.37],[271.23,189.74]],[[181.55,132.71],[252.2,82.13],[252.05,189.59]],[[165.61,133.68],[235.69,82.36],[235.48,188.15]],[[159.73,133.54],[232.9,82.18],[231.14,189.75]],[[190.27,128.09],[264.9,75.69],[265.44,186.43]],[[184.73,130.19],[265.47,80.3],[265.82,186.53]],[[170.65,130.38],[249.97,80.56],[252.69,185.52]],[[164.91,129.8],[242.42,80.14],[242.92,186.19]],[[187.55,128.55],[264.86,79.25],[264.93,185.41]],[[183.2,128.81],[258.7,78.32],[260.79,182.8]],[[172.01,128.4],[250.45,76.39],[252.7,181.92]],[[166.74,128.46],[240.48,78.73],[240.02,184.48]],[[190.86,115.64],[264.32,65.51],[262.92,171.38]],[[182.33,116.54],[254.13,65.05],[251.35,171.34]],[[174.32,117.9],[247.52,67.7],[246.87,172.44]],[[168.03,119.43],[241.25,69.91],[239.17,174.71]]],"registration":[[[68.0,32.0,329.0,234.0],[48.0,22.0,322.0,238.0]],[[47.0,25.0,309.0,235.0],[40.5,22.0,316.0,238.0]],[[32.0,27.0,293.0,235.0],[37.5,22.5,315.0,238.0]],[[27.0,28.0,290.0,235.0],[44.0,25.0,323.0,238.0]],[[55.0,23.0,326.0,229.0],[47.0,29.0,330.0,238.5]],[[46.0,25.0,324.0,230.0],[39.5,29.5,326.0,239.0]],[[31.0,23.0,308.0,230.0],[37.0,28.0,322.5,239.0]],[[27.0,24.0,305.0,230.0],[41.0,29.0,331.0,239.0]],[[49.0,24.0,332.0,227.0],[43.5,28.5,335.5,239.0]],[[46.0,21.0,322.0,227.0],[41.0,29.0,328.5,239.5]],[[34.0,25.0,309.0,227.0],[39.5,34.0,325.0,239.5]],[[29.0,28.0,302.0,227.0],[44.5,35.5,325.5,237.0]],[[54.0,17.0,322.0,213.0],[46.0,33.0,322.0,235.0]],[[46.0,17.0,312.0,216.0],[42.0,34.5,321.0,237.0]],[[34.0,20.0,308.0,218.0],[41.0,36.5,321.0,239.0]],[[30.0,20.0,300.0,219.0],[47.0,29.0,322.0,238.5]]]},{"key":[[[189.26,131.37],[270.05,88.43],[265.48,185.07],[299.13,136.41]],[[184.12,131.92],[260.83,86.42],[261.08,183.96],[290.99,136.3]],[[179.75,132.91],[255.65,87.46],[254.54,184.73],[283.98,135.14]],[[180.0,132.88],[255.92,87.69],[256.17,184.06],[287.91,138.26]],[[189.47,133.61],[266.99,88.24],[266.27,192.51],[301.83,139.99]],[[184.48,136.35],[268.62,85.24],[270.25,197.07],[299.32,142.69]],[[180.52,137.43],[263.91,85.35],[266.75,195.27],[291.18,143.54]],[[183.07,136.99],[263.59,89.69],[264.86,192.62],[288.85,141.82]],[[186.76,135.95],[268.42,84.54],[270.89,197.38],[303.88,141.99]],[[184.64,136.42],[267.25,92.94],[264.88,194.09],[296.51,144.51]],[[182.22,139.7],[264.72,85.1],[268.8,196.77],[296.2,146.78]],[[183.51,138.26],[257.0,81.87],[259.19,194.71],[296.14,146.0]],[[189.06,133.84],[268.77,90.6],[264.39,186.28],[298.43,138.1]],[[184.52,134.13],[260.0,88.68],[256.7,185.1],[290.75,138.75]],[[184.62,135.54],[261.45,92.37],[259.99,187.45],[292.28,140.89]],[[184.63,135.43],[259.34,91.31],[257.81,187.92],[288.04,139.61]]],"between":[[[195.07,136.64],[269.86,88.07],[267.22,191.61],[296.51,139.49]],[[187.24,135.8],[260.76,84.85],[259.01,191.42],[287.1,139.08]],[[180.72,136.8],[252.48,87.83],[252.46,191.22],[280.39,139.83]],[[186.8,135.49],[262.96,86.2],[262.98,191.26],[293.28,140.28]],[[187.06,128.21],[264.52,77.38],[265.57,187.29],[294.76,132.54]],[[187.82,132.9],[269.23,84.14],[268.01,189.25],[297.33,137.83]],[[191.13,134.2],[270.1,84.81],[270.13,188.39],[295.62,138.74]],[[193.79,132.66],[271.95,84.21],[271.53,188.89],[302.17,137.75]],[[188.95,126.42],[267.42,79.12],[266.84,182.49],[298.83,131.42]],[[187.44,126.73],[264.82,78.74],[267.18,179.58],[295.59,131.7]],[[193.94,125.17],[272.04,74.85],[274.41,178.75],[300.85,133.52]],[[202.46,124.77],[274.6,79.38],[275.62,180.22],[307.16,131.94]],[[195.94,112.51],[266.23,64.87],[266.01,167.42],[294.24,115.19]],[[187.88,112.71],[257.82,64.72],[255.62,167.01],[284.82,116.4]],[[198.26,112.37],[268.22,66.63],[267.99,165.99],[297.05,118.21]],[[203.16,113.32],[272.96,67.88],[272.74,166.94],[302.38,118.47]]],"registration":[[[57.0,28.0,329.0,243.0],[48.0,22.0,322.0,238.0]],[[48.0,26.0,319.0,241.0],[40.5,22.0,316.0,238.0]],[[41.0,28.0,312.0,241.0],[37.5,22.5,315.0,238.0]],[[44.0,27.0,326.0,241.0],[44.0,25.0,323.0,238.0]],[[48.0,19.0,328.0,234.0],[47.0,29.0,330.0,238.5]],[[46.0,28.0,330.0,233.0],[39.5,29.5,326.0,239.0]],[[50.0,27.0,329.0,234.0],[37.0,28.0,322.5,239.0]],[[53.0,27.0,336.0,233.0],[41.0,29.0,331.0,239.0]],[[51.0,23.0,334.0,224.0],[43.5,28.5,335.5,239.0]],[[45.0,20.0,332.0,224.0],[41.0,29.0,328.5,239.5]],[[53.0,22.0,334.0,224.0],[39.5,34.0,325.0,239.5]],[[62.0,26.0,341.0,223.0],[44.5,35.5,325.5,237.0]],[[62.0,12.0,325.0,213.0],[46.0,33.0,322.0,235.0]],[[53.0,13.0,317.0,214.0],[42.0,34.5,321.0,237.0]],[[60.0,16.0,330.0,213.0],[41.0,36.5,321.0,239.0]],[[68.0,15.0,334.0,213.0],[47.0,29.0,322.0,238.5]]]}],"7":[{"key":[[[133.74,99.4],[157.35,175.42],[230.48,150.5]],[[139.86,102.34],[159.0,175.0],[222.82,165.42]],[[142.28,106.3],[154.78,174.12],[229.68,156.44]],[[128.08,106.05],[147.15,171.44],[217.14,165.89]],[[132.25,104.95],[155.97,179.55],[216.21,174.12]],[[134.93,106.34],[158.0,181.0],[222.66,174.24]],[[137.0,107.0],[161.87,181.77],[218.0,176.0]],[[133.75,111.53],[152.03,177.62],[222.73,174.38]],[[141.61,113.14],[154.0,180.0],[212.0,177.0]],[[144.14,114.18],[156.0,182.0],[214.0,177.0]],[[142.95,115.11],[153.91,181.9],[232.0,175.0]],[[128.48,114.53],[145.48,178.64],[215.0,178.0]],[[128.3,110.86],[147.75,169.53],[224.38,161.83]],[[129.54,112.19],[152.19,168.45],[228.29,160.98]],[[125.89,108.28],[152.18,164.93],[227.79,159.89]],[[125.91,97.02],[142.58,160.79],[221.34,172.31]]],"between":[[[132.42,105.77],[153.79,178.36],[225.97,155.0]],[[135.59,108.5],[157.18,179.84],[214.18,168.8]],[[144.98,108.88],[161.72,177.32],[238.97,174.09]],[[130.42,107.93],[145.81,175.18],[212.65,162.09]],[[137.89,105.19],[159.86,176.88],[212.83,169.44]],[[137.04,106.29],[160.63,178.01],[213.94,170.93]],[[153.41,109.29],[169.83,178.03],[245.17,174.78]],[[123.47,108.69],[142.9,177.07],[211.69,162.77]],[[130.93,107.71],[155.27,178.8],[233.53,178.76]],[[136.88,111.77],[155.84,181.09],[233.6,179.29]],[[142.75,112.22],[159.88,180.93],[232.37,181.29]],[[126.32,120.35],[143.66,185.8],[216.75,182.61]],[[130.86,109.48],[154.24,166.27],[229.51,158.11]],[[127.0,107.0],[153.89,163.46],[228.94,156.37]],[[136.26,100.13],[160.13,160.1],[247.21,167.48]],[[121.71,92.54],[141.14,158.95],[214.15,156.01]]],"registration":[[[82.0,58.0,282.0,279.0],[91.0,55.0,284.0,276.5]],[[81.0,59.0,283.0,280.0],[89.0,55.0,281.0,276.5]],[[82.0,59.0,281.0,279.0],[78.0,55.0,266.5,276.5]],[[68.0,60.0,261.0,279.0],[72.5,58.5,267.0,280.5]],[[79.0,60.0,281.0,280.0],[76.5,62.5,278.0,284.0]],[[81.0,61.0,281.0,280.0],[81.5,63.0,277.5,284.0]],[[87.0,61.0,283.0,281.0],[75.5,63.0,266.5,284.0]],[[57.0,61.0,256.0,280.0],[72.0,63.0,263.5,285.0]],[[76.0,61.0,275.0,283.0],[79.5,63.0,270.5,286.0]],[[78.0,63.0,275.0,284.0],[82.5,63.5,269.0,286.5]],[[79.0,63.0,274.0,284.0],[76.0,64.0,258.0,286.5]],[[65.0,64.0,258.0,284.0],[74.0,53.0,255.5,275.0]],[[84.0,39.0,272.0,262.0],[82.0,42.0,263.5,264.5]],[[81.0,39.0,272.0,262.0],[83.5,42.0,265.0,265.0]],[[84.0,39.0,272.0,262.0],[75.0,42.5,255.5,265.0]],[[68.0,40.0,254.0,262.0],[78.5,49.0,264.0,270.5]]]},{"key":[[[142.12,120.23],[171.05,181.5],[99.25,195.29],[256.82,213.26]],[[140.28,122.43],[163.88,181.25],[93.0,201.0],[252.28,201.15]],[[135.45,120.75],[160.22,180.78],[91.0,196.0],[255.5,204.42]],[[136.55,122.78],[158.41,181.49],[90.82,198.99],[241.0,205.58]],[[137.09,120.27],[167.26,179.55],[89.86,194.21],[249.32,205.65]],[[141.83,122.28],[165.91,180.82],[93.29,190.38],[257.91,201.68]],[[142.17,120.63],[167.48,180.42],[88.92,192.98],[257.12,189.6]],[[137.4,121.97],[160.61,179.32],[88.71,202.49],[243.26,199.7]],[[143.21,119.78],[169.34,180.07],[87.92,191.27],[252.12,194.89]],[[139.03,119.36],[162.4,180.31],[89.65,193.44],[242.0,199.0]],[[140.21,119.08],[163.73,179.3],[93.0,189.0],[253.06,195.7]],[[133.92,117.24],[158.02,176.38],[88.5,193.35],[245.7,195.72]],[[146.85,120.87],[167.05,162.17],[113.45,201.82],[242.32,201.69]],[[143.99,121.11],[160.88,155.63],[95.02,174.4],[236.56,201.06]],[[152.28,129.15],[157.43,151.78],[95.29,181.51],[230.85,202.35]],[[150.23,132.45],[156.0,149.0],[91.01,183.73],[229.91,201.87]]],"between":[[[122.61,80.51],[155.8,156.52],[70.54,180.09],[274.14,192.54]],[[122.06,81.5],[153.34,157.18],[60.19,185.38],[272.28,182.92]],[[122.78,83.24],[154.46,157.98],[71.38,181.68],[267.2,194.5]],[[123.14,84.33],[154.0,157.81],[59.53,176.05],[257.32,198.58]],[[120.26,74.24],[151.07,144.81],[57.06,159.21],[246.55,174.55]],[[118.56,75.38],[152.37,147.51],[51.99,161.16],[258.1,163.79]],[[126.13,74.94],[159.99,147.33],[64.25,161.6],[271.71,173.74]],[[133.57,73.22],[164.03,147.61],[66.47,164.2],[282.24,169.32]],[[112.71,62.13],[147.93,133.86],[41.74,146.93],[256.38,158.29]],[[118.51,60.82],[151.95,134.08],[50.54,147.19],[259.83,151.73]],[[121.59,59.85],[156.4,135.54],[56.18,153.58],[273.23,163.2]],[[136.73,87.3],[163.35,143.32],[73.28,170.67],[272.06,178.55]],[[127.72,91.41],[142.3,139.27],[76.19,195.4],[241.45,193.52]],[[131.4,92.04],[148.16,136.66],[60.14,165.3],[242.38,195.63]],[[149.77,108.02],[157.58,132.7],[86.71,193.99],[250.58,199.72]],[[146.41,79.18],[163.39,125.79],[77.02,166.55],[257.1,188.98]]],"registration":[[[37.0,35.0,294.0,268.0],[74.5,83.0,273.5,270.0]],[[42.0,34.0,283.0,269.0],[76.5,83.0,263.0,269.5]],[[44.0,36.0,287.0,269.0],[76.5,83.5,259.0,269.0]],[[50.0,33.0,279.0,270.0],[81.5,83.0,263.0,267.0]],[[49.0,27.0,276.0,252.0],[83.0,82.5,268.5,266.5]],[[44.0,27.0,280.0,257.0],[82.5,82.5,271.0,267.0]],[[47.0,27.0,291.0,256.0],[80.0,82.0,261.5,266.0]],[[55.0,24.0,290.0,260.0],[79.5,81.5,261.5,267.0]],[[34.0,14.0,283.0,242.0],[85.0,80.5,266.0,268.0]],[[42.0,13.0,282.0,243.0],[82.5,80.5,264.0,267.0]],[[34.0,9.0,296.0,253.0],[77.0,79.5,260.5,265.0]],[[52.0,8.0,294.0,247.0],[75.5,61.0,258.5,246.5]],[[24.0,-3.0,282.0,234.0],[78.0,44.5,267.0,229.5]],[[36.0,-3.0,289.0,234.0],[79.5,45.0,262.0,230.0]],[[45.0,-6.0,297.0,239.0],[78.0,44.0,253.0,230.0]],[[52.0,-10.0,297.0,240.0],[74.5,63.0,266.0,250.0]]]}],"8":[{"key":[[[124.73,122.78],[118.43,180.63],[118.32,233.52],[189.78,174.75]],[[131.79,127.44],[113.4,163.11],[98.47,213.15],[178.12,175.48]],[[132.88,130.25],[118.1,161.29],[102.28,213.96],[180.42,175.13]],[[119.81,131.17],[120.89,169.5],[87.14,221.02],[170.38,177.64]],[[119.74,119.2],[110.84,173.31],[121.06,229.12],[188.37,167.89]],[[132.46,122.08],[107.98,173.43],[110.96,232.05],[179.04,170.01]],[[129.93,124.17],[111.55,153.4],[101.24,227.94],[179.33,170.51]],[[110.63,123.69],[93.37,157.2],[89.79,231.22],[162.87,171.07]],[[133.47,122.02],[111.96,153.91],[114.41,231.19],[181.19,171.1]],[[127.07,125.68],[105.53,159.38],[110.02,234.05],[176.6,172.01]],[[123.89,127.11],[105.64,159.93],[105.84,233.09],[174.17,172.6]],[[111.76,123.27],[84.45,155.51],[90.91,230.65],[161.53,171.39]],[[110.72,96.76],[100.08,147.31],[116.37,199.9],[183.07,147.54]],[[121.92,94.75],[101.32,149.31],[103.84,201.17],[173.06,148.98]],[[126.64,91.95],[103.81,149.39],[107.74,200.71],[175.02,149.8]],[[113.0,96.0],[98.43,149.2],[88.47,202.32],[158.25,150.61]]],"between":[[[152.15,135.03],[135.62,171.48],[122.11,231.62],[205.07,180.02]],[[137.1,134.13],[118.32,170.23],[122.63,223.38],[186.33,182.06]],[[119.76,134.69],[104.04,169.69],[119.54,225.61],[171.81,181.01]],[[92.09,135.46],[96.6,170.64],[94.51,247.28],[164.82,182.84]],[[126.47,115.01],[117.18,174.54],[95.19,231.15],[196.08,167.77]],[[134.55,120.51],[113.85,154.21],[113.97,234.11],[184.77,167.73]],[[122.21,118.7],[99.69,151.49],[102.24,232.98],[174.63,166.92]],[[112.2,121.0],[92.14,151.93],[90.17,233.39],[163.06,169.19]],[[141.65,107.34],[121.26,141.46],[91.17,219.98],[192.02,155.44]],[[132.8,111.68],[112.46,145.51],[84.14,220.28],[184.5,157.3]],[[123.98,111.52],[103.96,147.11],[74.32,219.84],[178.46,158.08]],[[113.66,111.65],[93.07,169.92],[96.25,223.74],[166.43,162.24]],[[115.25,100.26],[105.49,152.39],[121.03,206.16],[191.64,147.46]],[[130.56,97.82],[105.69,154.98],[112.09,207.64],[184.11,152.42]],[[126.96,93.95],[93.3,151.57],[103.8,204.8],[179.02,151.16]],[[109.83,91.98],[79.9,148.47],[89.38,203.93],[159.81,142.61]]],"registration":[[[75.0,87.0,304.0,284.0],[61.0,87.0,276.5,274.0]],[[57.0,89.0,282.0,285.0],[56.5,87.0,269.5,273.0]],[[42.0,89.0,267.0,286.0],[52.5,90.0,266.5,276.0]],[[33.0,91.0,263.0,286.0],[53.0,84.5,273.5,272.0]],[[63.0,73.0,295.0,269.0],[60.0,79.0,275.5,265.0]],[[50.0,73.0,282.0,271.0],[56.5,83.0,268.0,266.0]],[[38.0,73.0,268.0,269.0],[47.0,84.0,256.0,265.5]],[[27.0,76.0,257.0,270.0],[48.0,84.5,258.0,265.0]],[[58.0,63.0,289.0,257.0],[55.5,86.0,268.5,266.0]],[[48.0,66.0,280.0,258.0],[52.5,86.5,262.0,267.5]],[[40.0,66.0,269.0,258.0],[42.5,85.5,250.0,266.0]],[[29.0,64.0,258.0,257.0],[45.5,67.5,256.5,248.5]],[[54.0,44.0,288.0,239.0],[55.0,52.5,264.5,233.0]],[[48.0,51.0,277.0,243.0],[52.5,55.0,257.5,233.5]],[[39.0,49.0,269.0,241.0],[42.5,54.5,246.5,234.5]],[[27.0,46.0,254.0,240.0],[51.5,70.5,259.0,254.5]]]},{"key":[[[124.11,123.09],[113.05,169.36],[114.97,231.01],[191.96,170.42],[212.86,132.01],[214.82,190.15],[244.28,164.55]],[[124.25,114.51],[114.0,165.0],[110.46,218.97],[169.3,170.65],[212.75,133.86],[201.97,196.45],[222.3,171.07]],[[131.45,121.68],[117.91,158.57],[105.82,226.19],[178.0,171.87],[206.07,126.93],[210.12,199.58],[228.85,166.3]],[[123.94,121.59],[99.21,179.49],[95.77,227.03],[169.82,175.62],[205.73,137.6],[204.13,205.06],[229.01,171.42]],[[114.88,122.56],[110.69,170.71],[110.88,220.57],[181.06,170.65],[211.05,125.81],[212.49,199.29],[234.48,165.09]],[[116.93,114.1],[98.28,171.24],[101.87,221.39],[169.07,172.01],[210.26,138.0],[206.39,203.48],[232.61,176.48]],[[119.06,116.71],[100.12,176.03],[99.65,228.24],[170.1,171.5],[213.35,138.09],[208.7,203.75],[220.53,173.09]],[[113.87,116.81],[90.67,174.42],[94.37,225.25],[163.31,172.14],[204.4,139.47],[199.4,204.22],[225.44,176.68]],[[120.96,118.65],[95.74,170.13],[101.71,222.98],[178.26,172.47],[210.88,133.69],[216.84,202.48],[227.67,172.0]],[[111.54,119.22],[88.96,175.22],[97.31,225.61],[169.95,171.92],[209.38,136.49],[205.72,202.8],[231.5,174.8]],[[116.86,119.16],[88.56,170.11],[97.53,221.97],[173.02,173.17],[213.29,137.46],[209.03,203.24],[234.42,174.64]],[[105.76,120.68],[107.82,158.83],[86.73,223.16],[161.71,173.37],[200.18,138.6],[197.02,204.27],[223.38,177.61]],[[97.39,95.13],[106.13,170.73],[100.97,194.55],[176.8,150.92],[213.57,120.25],[218.08,187.87],[224.81,152.51]],[[116.89,96.29],[97.03,148.28],[93.25,198.12],[167.96,152.58],[203.93,121.86],[208.8,189.42],[229.44,147.34]],[[122.04,99.62],[101.71,155.82],[101.18,202.38],[175.13,155.27],[212.92,125.65],[207.44,185.99],[237.36,150.87]],[[112.1,91.35],[93.09,149.84],[89.15,200.9],[168.74,153.48],[203.99,123.66],[207.91,190.91],[228.2,148.32]]],"between":[[[138.91,114.01],[128.35,163.58],[132.62,223.01],[205.67,165.87],[236.26,119.36],[232.76,187.45],[258.72,159.49]],[[132.08,108.2],[113.2,166.49],[116.51,219.61],[181.76,169.35],[220.9,132.29],[218.07,197.96],[244.09,173.89]],[[132.02,108.83],[107.95,164.99],[111.49,219.35],[181.66,166.71],[209.67,120.64],[215.99,196.86],[243.01,172.01]],[[117.02,117.31],[92.84,172.66],[67.21,224.21],[164.64,171.84],[192.0,124.29],[191.28,191.15],[215.82,169.86]],[[121.83,75.37],[126.18,122.08],[104.01,186.69],[192.92,127.99],[224.27,81.14],[219.65,148.13],[246.55,126.81]],[[110.02,82.41],[103.6,131.87],[102.94,172.32],[180.12,128.91],[206.57,82.39],[202.73,148.96],[227.87,128.21]],[[97.12,74.32],[97.15,133.43],[105.77,185.07],[170.49,128.2],[199.63,81.41],[201.97,155.03],[221.79,120.3]],[[82.44,76.15],[83.68,131.79],[80.48,170.94],[157.7,128.91],[187.22,81.69],[183.85,148.22],[211.05,120.67]],[[110.15,36.47],[113.54,68.06],[97.07,139.49],[190.8,81.76],[215.67,34.16],[213.31,101.65],[239.42,77.9]],[[95.31,32.73],[83.56,76.05],[78.9,115.07],[173.42,81.2],[201.43,35.15],[204.42,107.98],[239.58,83.87]],[[110.74,30.48],[90.46,69.07],[88.51,122.8],[163.25,81.47],[197.79,42.79],[190.0,101.0],[227.15,82.27]],[[81.47,38.72],[80.64,89.55],[90.93,141.28],[153.31,87.21],[179.75,54.94],[184.55,120.11],[205.3,87.04]],[[117.57,0.59],[86.59,59.37],[99.59,107.17],[189.84,48.36],[218.02,9.41],[218.59,75.66],[243.29,47.34]],[[102.26,0.62],[98.04,50.04],[86.48,107.13],[172.87,47.71],[200.14,9.81],[204.19,75.52],[228.97,48.05]],[[98.89,0.19],[94.17,49.42],[79.43,106.56],[175.2,47.55],[202.86,9.8],[201.83,74.78],[225.11,47.68]],[[112.39,-10.55],[86.86,50.35],[71.16,107.6],[161.83,42.26],[190.99,9.74],[193.11,65.23],[227.45,39.91]]],"registration":[[[74.0,67.0,313.0,271.0],[56.0,73.5,282.5,275.5]],[[49.0,71.0,284.0,274.0],[43.5,73.5,275.5,276.0]],[[41.0,68.0,283.0,272.0],[34.0,75.5,273.0,277.5]],[[24.0,72.0,273.0,275.0],[46.0,76.0,280.0,276.5]],[[62.0,27.0,304.0,232.0],[57.0,73.5,282.0,274.5]],[[44.0,27.0,284.0,232.0],[48.0,72.5,275.0,274.0]],[[33.0,27.0,277.0,232.0],[39.0,74.0,272.5,275.0]],[[20.0,27.0,266.0,232.0],[39.0,72.0,279.5,275.0]],[[52.0,-21.0,295.0,185.0],[46.5,69.5,280.0,275.0]],[[35.0,-21.0,279.0,185.0],[44.0,69.5,271.5,275.5]],[[22.0,-21.0,267.0,185.0],[34.5,71.0,268.5,276.5]],[[13.0,-20.0,262.0,186.0],[38.0,56.0,277.0,261.5]],[[51.0,-66.0,296.0,142.0],[47.5,40.0,282.0,245.5]],[[38.0,-66.0,282.0,143.0],[50.5,42.5,275.0,248.0]],[[35.0,-65.0,278.0,141.0],[42.5,43.5,273.5,249.0]],[[24.0,-63.0,268.0,142.0],[48.0,58.5,280.5,262.0]]]}],"9":[{"key":[[[123.0,175.0],[174.38,128.77],[139.42,218.53],[244.81,163.61]],[[104.71,176.06],[167.51,124.51],[124.42,214.85],[235.58,159.57]],[[109.0,179.0],[160.76,129.23],[130.54,216.0],[225.73,166.12]],[[102.0,179.0],[152.92,130.4],[123.53,216.47],[219.43,165.72]],[[118.48,167.8],[164.84,120.08],[135.92,206.12],[232.69,166.3]],[[105.0,166.0],[150.7,117.3],[128.5,201.55],[233.0,159.0]],[[107.0,166.0],[154.81,115.21],[131.83,201.94],[224.64,152.44]],[[102.0,165.0],[149.61,114.19],[123.59,202.58],[219.0,153.0]],[[112.39,162.6],[162.94,118.31],[124.28,190.43],[236.0,150.0]],[[103.0,165.0],[153.17,116.77],[128.39,201.45],[222.0,153.0]],[[106.0,165.0],[155.15,114.11],[121.08,206.08],[225.15,152.26]],[[97.0,165.0],[148.06,113.64],[122.94,201.36],[218.13,152.41]],[[112.17,150.51],[155.48,103.5],[130.95,188.25],[227.53,148.49]],[[103.24,149.04],[149.04,100.82],[117.11,188.75],[230.44,147.49]],[[106.0,147.0],[157.29,98.97],[120.9,189.1],[226.0,135.0]],[[101.0,147.0],[148.22,99.09],[122.61,184.22],[217.0,135.0]]],"between":[[[126.14,176.91],[176.65,128.23],[150.88,214.89],[257.0,163.0]],[[117.37,176.47],[167.19,125.09],[139.09,216.03],[245.486,162.297]],[[112.26,179.8],[161.96,128.78],[136.15,219.16],[242.0,171.0]],[[105.33,183.79],[155.04,131.93],[120.73,223.05],[225.95,169.44]],[[121.66,168.62],[169.92,117.92],[137.74,207.55],[251.08,160.93]],[[114.96,165.85],[161.82,116.07],[129.02,206.49],[242.23,155.05]],[[108.83,167.8],[156.36,117.57],[133.68,204.96],[235.71,158.87]],[[102.56,167.91],[152.31,118.32],[119.31,209.29],[222.97,156.32]],[[119.08,154.45],[169.442,104.115],[127.75,180.83],[248.14,140.96]],[[115.07,160.01],[160.96,110.59],[139.53,197.39],[239.0,148.0]],[[108.86,159.87],[156.75,109.73],[133.52,196.37],[236.0,151.0]],[[105.23,163.04],[152.67,111.39],[121.5,201.26],[225.41,148.25]],[[117.1,148.69],[162.45,96.73],[134.94,188.19],[246.2,137.32]],[[111.51,148.08],[158.35,95.77],[127.21,186.67],[242.94,141.65]],[[114.39,146.27],[161.7,94.21],[128.93,187.93],[241.7,134.1]],[[101.86,146.31],[150.58,94.48],[127.54,185.08],[229.23,131.15]]],"registration":[[[56.0,64.0,306.0,297.0],[49.0,64.0,288.5,293.5]],[[47.0,59.0,293.0,297.0],[41.0,65.0,280.5,294.5]],[[43.0,61.0,287.0,300.0],[38.0,65.5,281.5,295.0]],[[39.0,66.0,287.0,299.0],[44.5,57.0,287.5,287.0]],[[56.0,50.0,301.0,284.0],[47.5,49.0,288.0,280.0]],[[48.0,50.0,291.0,284.0],[41.0,50.5,281.0,281.0]],[[42.0,52.0,285.0,285.0],[38.5,51.0,279.0,281.0]],[[38.0,54.0,284.0,284.0],[44.0,50.0,284.0,280.5]],[[54.0,35.0,303.0,275.0],[46.5,50.0,285.5,280.0]],[[49.0,46.0,292.0,277.0],[41.0,51.0,280.0,280.0]],[[42.0,45.0,286.0,277.0],[38.5,51.0,278.0,280.5]],[[40.0,45.0,285.0,277.0],[43.0,41.0,282.5,271.5]],[[52.0,25.0,298.0,265.0],[45.5,31.5,283.5,262.5]],[[46.0,31.0,289.0,265.0],[41.5,32.0,278.5,263.0]],[[47.0,28.0,290.0,266.0],[38.0,32.5,276.0,263.0]],[[35.0,27.0,279.0,266.0],[45.5,48.0,286.0,278.0]]]},{"key":[[[112.0,168.0],[159.96,117.63],[159.39,212.35],[232.35,101.62],[216.51,228.81],[240.96,133.89],[238.0,198.89]],[[109.0,168.0],[165.05,122.94],[175.48,202.81],[227.97,100.98],[203.01,216.08],[234.0,142.0],[240.57,199.45]],[[108.0,168.0],[162.34,125.43],[153.78,202.66],[228.0,109.0],[206.26,211.66],[232.82,139.04],[227.34,197.75]],[[101.0,170.0],[158.34,128.16],[150.65,199.99],[224.77,99.3],[198.05,214.45],[225.99,133.47],[223.45,198.4]],[[108.14,167.46],[165.45,130.81],[165.52,191.38],[214.81,105.02],[195.97,209.15],[235.34,136.49],[233.3,195.9]],[[102.0,169.0],[162.2,132.55],[162.88,199.46],[226.16,97.46],[190.13,211.52],[235.13,142.46],[227.63,198.96]],[[103.0,170.0],[161.35,132.51],[164.01,198.83],[226.0,97.0],[187.0,211.93],[232.0,137.0],[227.24,198.47]],[[99.0,169.0],[159.57,132.97],[153.16,193.94],[222.61,96.88],[181.85,211.71],[228.29,138.04],[222.62,195.91]],[[108.0,169.0],[163.83,131.99],[161.09,196.92],[214.05,109.12],[185.89,210.25],[231.02,129.33],[230.54,198.85]],[[101.0,170.0],[162.38,133.3],[164.85,197.7],[214.55,113.65],[182.48,210.91],[234.78,143.18],[226.0,199.91]],[[103.0,171.0],[162.2,133.03],[164.45,197.49],[206.86,110.33],[181.12,210.93],[235.0,142.0],[226.42,197.46]],[[101.0,169.0],[160.08,134.69],[155.92,192.48],[208.31,113.12],[178.18,210.9],[225.07,132.6],[222.71,197.85]],[[107.05,162.63],[167.02,133.54],[166.7,198.03],[204.33,114.16],[185.08,204.15],[232.28,127.52],[232.36,190.45]],[[103.0,164.0],[164.26,133.03],[153.47,194.67],[205.0,119.0],[180.62,203.86],[227.92,124.8],[225.63,190.97]],[[104.0,164.0],[165.45,132.44],[163.51,195.89],[197.71,116.26],[182.01,203.41],[226.7,124.13],[226.9,193.57]],[[98.0,164.0],[163.4,132.2],[160.16,194.91],[198.4,118.02],[178.33,203.01],[226.0,131.0],[225.61,188.86]]],"between":[[[110.81,166.01],[157.05,116.19],[175.86,201.16],[229.73,100.4],[208.97,226.93],[237.9,137.62],[231.95,199.92]],[[102.12,166.44],[146.81,116.94],[161.53,202.89],[223.97,99.83],[204.0,216.0],[225.99,135.99],[233.64,196.88]],[[101.2,166.89],[156.4,125.04],[164.97,198.15],[224.03,99.33],[203.0,216.0],[229.7,141.35],[224.3,199.75]],[[98.38,166.66],[153.84,127.04],[161.67,196.61],[221.96,99.0],[194.64,209.3],[225.58,137.37],[230.66,193.43]],[[102.44,165.87],[160.21,128.92],[155.3,194.81],[224.78,97.22],[190.25,207.95],[227.82,132.27],[227.05,198.25]],[[100.32,166.78],[158.12,130.94],[153.29,194.91],[223.62,97.81],[185.81,209.48],[232.56,142.92],[225.11,199.2]],[[99.39,167.09],[157.63,131.47],[160.97,196.37],[222.99,98.23],[182.34,209.04],[231.3,142.1],[223.43,198.81]],[[97.14,167.05],[155.16,131.64],[151.89,194.22],[220.85,97.85],[178.69,208.79],[229.84,142.31],[222.94,199.12]],[[100.79,167.11],[157.87,131.19],[161.54,196.18],[207.85,109.86],[180.05,208.15],[221.81,131.76],[225.35,196.64]],[[99.45,167.44],[165.3,134.57],[162.89,194.33],[212.0,114.0],[178.79,208.48],[231.1,141.37],[225.63,201.14]],[[99.33,168.11],[165.36,135.22],[162.09,195.08],[206.63,116.95],[178.67,208.76],[230.41,143.43],[223.29,196.82]],[[97.01,168.46],[162.06,138.15],[162.46,196.81],[203.04,118.57],[176.6,209.58],[224.58,137.6],[221.7,199.76]],[[103.5,164.59],[165.67,134.51],[164.32,198.33],[204.67,116.69],[182.97,204.87],[228.98,132.78],[228.41,193.43]],[[100.34,165.51],[162.91,135.28],[152.46,196.77],[199.41,118.32],[179.74,206.24],[228.06,132.63],[223.67,195.06]],[[99.67,165.69],[167.12,135.86],[161.25,197.76],[197.99,119.2],[180.17,205.82],[231.18,139.02],[224.08,198.05]],[[99.55,164.55],[156.25,123.81],[150.81,198.83],[206.11,114.59],[189.99,211.45],[229.68,135.57],[229.92,192.87]]],"registration":[[[46.0,46.0,299.0,295.0],[46.0,50.5,295.5,296.0]],[[36.0,46.0,295.0,295.0],[42.5,50.0,296.0,296.0]],[[36.0,46.0,295.0,295.0],[40.5,49.5,295.0,296.0]],[[34.0,46.0,294.0,295.0],[43.5,49.5,296.0,296.5]],[[39.0,45.0,297.0,295.0],[45.0,49.0,296.5,297.0]],[[36.0,45.0,295.0,296.0],[41.5,47.5,295.0,297.0]],[[35.0,45.0,294.0,295.0],[40.0,47.0,293.5,297.0]],[[34.0,45.0,293.0,296.0],[43.0,47.0,295.5,297.0]],[[38.0,45.0,295.0,295.0],[44.5,47.0,297.0,297.5]],[[36.0,45.0,294.0,295.0],[41.5,47.0,294.5,298.0]],[[35.0,45.0,294.0,295.0],[38.5,46.5,293.5,297.5]],[[34.0,45.0,293.0,295.0],[41.5,43.5,295.5,293.5]],[[41.0,41.0,298.0,292.0],[44.5,41.0,296.0,290.5]],[[36.0,42.0,295.0,294.0],[42.0,41.0,293.5,290.5]],[[35.0,42.0,294.0,294.0],[40.5,41.0,290.5,290.5]],[[34.0,42.0,294.0,294.0],[44.0,46.0,291.5,293.5]]]}]};
  const materialSocketBuffer=document.createElement('canvas'),materialSocketContext=materialSocketBuffer.getContext('2d');materialSocketBuffer.width=materialSocketBuffer.height=96;
  const bloodstarPaletteCache=new WeakMap();
  function recolorBloodstarMaterial(data,heat){
    const amount=clamp(heat,0,2),blend=Math.min(1,amount),hot=Math.max(0,amount-1);
    if(!blend)return data;
    for(let i=0;i<data.length;i+=4){
      const r=data[i],g=data[i+1],b=data[i+2];
      // Relight red emission only. Housing, neutral specular detail, deep
      // grooves and native opacity stay exactly as authored.
      if(!data[i+3]||r<=110||r-g<=40||r-b<=35)continue;
      const strength=clamp((r-110)/60,0,1)*clamp((r-Math.max(g,b)-35)/45,0,1)*blend,red=r+(255-r)*hot*.45;
      data[i]=Math.round(r+(red-r)*strength);
      data[i+1]=Math.round(g+(red*(.78+hot*.16)-g)*strength);
      data[i+2]=Math.round(b+(red*(.035+hot*.065)-b)*strength)
    }
    return data
  }
  function bloodstarMaterialPalette(asset,rect){
    let cache=bloodstarPaletteCache.get(asset);if(!cache){cache=new Map();bloodstarPaletteCache.set(asset,cache)}
    const key=[rect.x,rect.y,rect.w,rect.h].join('/');if(cache.has(key))return cache.get(key);
    const samples=[1,2].map(heat=>{
      const sample=document.createElement('canvas');sample.width=sample.height=96;const c=sample.getContext('2d',{willReadFrequently:true});
      c.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,0,96,96);const pixels=c.getImageData(0,0,96,96);recolorBloodstarMaterial(pixels.data,heat);c.putImageData(pixels,0,0);return sample
    });cache.set(key,samples);return samples
  }
  // Native relighting changes luminous chromatic material, never the hull's
  // neutral specular ridges, dark metal, gaps or source opacity.
  function nativeEmissionWeight(r,g,b,a=255){
    if(!a)return 0;
    const high=Math.max(r,g,b),low=Math.min(r,g,b),light=clamp((high-105)/90,0,1),chroma=clamp((high-low-35)/85,0,1);
    return light*light*(3-2*light)*chroma*chroma*(3-2*chroma)
  }
  function relightNativeMaterial(data,amount=1,emissionOnly=false){
    const exposure=clamp(amount,-1,1);
    for(let i=0;i<data.length;i+=4){
      const r=data[i],g=data[i+1],b=data[i+2],alpha=data[i+3],weight=nativeEmissionWeight(r,g,b,alpha),high=Math.max(r,g,b);
      if(weight&&exposure){
        const gain=exposure<0?1+exposure*weight*.86:1+(255-high)/high*exposure*weight*.72;
        data[i]=Math.round(r*gain);data[i+1]=Math.round(g*gain);data[i+2]=Math.round(b*gain)
      }
      if(emissionOnly)data[i+3]=Math.round(alpha*weight)
    }
    return data
  }
  function nativeSocketHue(r,g,b){
    const high=Math.max(r,g,b),low=Math.min(r,g,b),span=high-low;if(!span)return 0;
    return ((high===r?(g-b)/span:high===g?(b-r)/span+2:(r-g)/span+4)*60+360)%360
  }
  // Select the luminous material of the tracked organ, not a circular area of
  // armor. Segmented reactor bars may be separate components of the same hue.
  // All three layers are transparent outside those original source texels.
  function buildNativeSocketPalette(data,width,height,options={}){
    const count=width*height,weights=new Uint8Array(count),strength=new Float32Array(count),hues=new Float32Array(count),labels=new Int32Array(count),queue=new Int32Array(count);
    const xDistance=Float32Array.from({length:width},(_,x)=>((x+.5-width/2)/(width/2))**2),yDistance=Float32Array.from({length:height},(_,y)=>((y+.5-height/2)/(height/2))**2),distanceSq=p=>xDistance[p%width]+yDistance[Math.floor(p/width)],fixedHue=Number.isFinite(options.hue);
    let seed=-1,best=0;
    for(let p=0;p<count;p++){
      const at=p*4,r=data[at],g=data[at+1],b=data[at+2],a=data[at+3],high=Math.max(r,g,b),low=Math.min(r,g,b),dimCircuit=options.lowLight&&a?clamp((high-42)/90,0,1)*clamp((high-low-28)/60,0,1):0,weight=Math.max(nativeEmissionWeight(r,g,b,a),dimCircuit);if(!weight)continue;strength[p]=weight;hues[p]=nativeSocketHue(r,g,b);
      if(!fixedHue){const score=weight*(a/255)*Math.exp(-distanceSq(p)*8);if(score>best){best=score;seed=p}}
    }
    const hue=fixedHue?options.hue:seed>=0?hues[seed]:0,spread=options.hueSpread||38;
    for(let p=0;p<count;p++){
      const difference=Math.abs(hues[p]-hue),delta=Math.min(difference,360-difference),gate=clamp((spread-delta)/Math.min(14,spread),0,1);
      strength[p]*=gate;if(strength[p]>.018)labels[p]=-1
    }
    let component=0;
    for(let start=0;start<count;start++){
      if(labels[start]!==-1)continue;component++;let head=0,tail=1,nearest=Infinity;queue[0]=start;labels[start]=component;
      while(head<tail){
        const p=queue[head++],x=p%width,y=Math.floor(p/width);nearest=Math.min(nearest,distanceSq(p));
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const q=ny*width+nx;
          if(labels[q]===-1){labels[q]=component;queue[tail++]=q}
        }
      }
      // A complete component is retained, including its irregular branches;
      // a neighboring vent that never enters the organ's inner area stays dark.
      if(nearest>.64*.64)continue;
      for(let i=0;i<tail;i++){
        const p=queue[i],x=p%width,y=Math.floor(p/width),edge=Math.min(x+.5,y+.5,width-x-.5,height-y-.5);
        weights[p]=Math.round(255*strength[p]*Math.min(1,edge/2))
      }
    }
    const sealed=new Uint8ClampedArray(count*4),hot=new Uint8ClampedArray(count*4),emission=new Uint8ClampedArray(count*4);
    for(let p=0;p<count;p++){
      const at=p*4,weight=weights[p]/255;if(!weight)continue;
      const r=data[at],g=data[at+1],b=data[at+2],peak=Math.max(r,g,b),luma=r*.2126+g*.7152+b*.0722,light=luma/255,alpha=Math.round(data[at+3]*weight),warm=Math.min(255,peak*.3+luma*1.1+(options.lowLight?42:14));
      sealed[at]=r*.28;sealed[at+1]=g*.28;sealed[at+2]=b*.28;sealed[at+3]=alpha;
      hot[at]=warm;hot[at+1]=warm*(.65+light*.2);hot[at+2]=warm*(.035+light*.1);hot[at+3]=alpha;
      emission[at]=warm;emission[at+1]=warm*.95;emission[at+2]=warm*(.12+light*.13);emission[at+3]=alpha
    }
    return{sealed,hot,emission,weights}
  }
  // Three 96px RGBA canvases per entry, at most 27 MiB of palette pixels.
  // One shared LRU covers all enemies, phases, native poses and socket crops.
  const nativePaletteCache=new Map(),nativePaletteAssetIds=new WeakMap(),NATIVE_PALETTE_LIMIT=256;
  let nativePaletteAssetSerial=0;
  let nativePaletteReadbackScope=null;
  function nativePaletteKey(asset,rect,options={}){
    if(!nativePaletteAssetIds.has(asset))nativePaletteAssetIds.set(asset,++nativePaletteAssetSerial);
    return nativePaletteAssetIds.get(asset)+'/'+[rect.x,rect.y,rect.w,rect.h].map(v=>v.toFixed(3)).join('/')+'/'+(options.hue??'auto')+'/'+(options.hueSpread||38)+'/'+!!options.lowLight
  }
  function prefetchNativeMaterialReadbacks(samples){
    const pending=[],seen=new Set(),N=96,LIMIT=16;
    for(const sample of samples){
      if(!sample.asset?.ready||![sample.rect.x,sample.rect.y,sample.rect.w,sample.rect.h].every(Number.isFinite)||sample.rect.w<=0||sample.rect.h<=0)return null;
      const key=nativePaletteKey(sample.asset,sample.rect,sample.options);
      if(!nativePaletteCache.has(key)&&!seen.has(key)){seen.add(key);pending.push({...sample,key})}
    }
    if(pending.length<2||pending.length>LIMIT)return null;
    // Every tile is rasterized at the origin of its own new 96x96 sampler canvas exactly like the original
    // single sampler (a destination offset inside a taller canvas changes float sampling in rare
    // geometries), then copied 1:1 at an integer offset into a new strip so only ONE readback occurs.
    // No canvas outlives this call: a long-lived sampler that had drawn a canvas source later sampled
    // image sources differently in this browser. No clip, saved state or reusable canvas exists.
    const buffer=document.createElement('canvas');buffer.width=N;buffer.height=N*pending.length;
    const raster=buffer.getContext('2d',{willReadFrequently:true});
    for(let index=0;index<pending.length;index++){
      const sample=pending[index],rect=sample.rect,sampler=document.createElement('canvas');sampler.width=sampler.height=N;
      sampler.getContext('2d',{willReadFrequently:true}).drawImage(sample.asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);raster.drawImage(sampler,0,index*N)
    }
    const rgba=raster.getImageData(0,0,N,N*pending.length).data,prepared=new Map();
    for(let index=0;index<pending.length;index++)prepared.set(pending[index].key,rgba.subarray(index*N*N*4,(index+1)*N*N*4));
    const stats=prefetchNativeMaterialReadbacks.stats||(prefetchNativeMaterialReadbacks.stats={readbacks:0,tiles:0,batches:0,maxTiles:0});stats.readbacks++;stats.tiles+=pending.length;stats.batches++;stats.maxTiles=Math.max(stats.maxTiles,pending.length);
    return prepared
  }
  function prefetchLateBossMaterialReadbacks(e,frame,sx,sy){
    if(nativeSpritePartCapture||e!==boss)return null;
    let asset=frame.source,scaleX=1,scaleY=1;const module=window.StarfighterDestruction,broken=nativeSpriteBrokenGroups(e);
    if(module?.has(asset)){
      const surface=module.surface(asset,broken,{style:nativeSpriteStyle(e)});if(!surface)return null;
      if(surface!==asset){scaleX=(surface.naturalWidth||surface.width)/(asset.naturalWidth||asset.width);scaleY=(surface.naturalHeight||surface.height)/(asset.naturalHeight||asset.height);asset=surface}
    }
    const options={hue:frame.type===5?120:frame.type===6?188:frame.type===7?270:frame.type===8?25:345,hueSpread:frame.type===6?22:45},samples=[],nodes=activeWeakNodes(e);
    for(let index=0;index<nodes.length;index++){
      const profile=nativeFractureBaseProfile(e,nodes[index]);if(profile&&broken.has(profile.groupId))continue;
      const point=frame.pointAt(index),radius=lateBossSocketRadii(frame,index),rx=radius[0]/frame.factorX,ry=radius[1]/frame.factorY,rect={x:sx+point[0]-rx,y:sy+point[1]-ry,w:rx*2,h:ry*2};
      samples.push({asset,rect:{x:rect.x*scaleX,y:rect.y*scaleY,w:rect.w*scaleX,h:rect.h*scaleY},options})
    }
    return prefetchNativeMaterialReadbacks(samples)
  }
  function nativeMaterialPalette(asset,rect,options={}){
    const key=nativePaletteKey(asset,rect,options);
    if(nativePaletteCache.has(key)){const value=nativePaletteCache.get(key);nativePaletteCache.delete(key);nativePaletteCache.set(key,value);return value}
    const N=96;let rgba=nativePaletteReadbackScope?.get(key);
    if(!rgba){
      const source=document.createElement('canvas');source.width=source.height=N;
      const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(asset,rect.x,rect.y,rect.w,rect.h,0,0,N,N);rgba=sourceContext.getImageData(0,0,N,N).data
    }
    const layers=buildNativeSocketPalette(rgba,N,N,options),make=name=>{
      const sample=document.createElement('canvas');sample.width=sample.height=N;const c=sample.getContext('2d'),pixels=c.createImageData(N,N);
      pixels.data.set(layers[name]);c.putImageData(pixels,0,0);return sample
    };
    const color='#ffe49a',value={sealed:make('sealed'),hot:make('hot'),emission:make('emission'),color,sourceAsset:asset,sourceRect:{...rect}};
    nativePaletteCache.set(key,value);
    while(nativePaletteCache.size>NATIVE_PALETTE_LIMIT){
      const oldest=nativePaletteCache.keys().next().value,expired=nativePaletteCache.get(oldest);nativePaletteCache.delete(oldest);
      for(const sample of[expired.sealed,expired.hot,expired.emission])sample.width=sample.height=1
    }
    return value
  }
  const materialEmissionBuffer=document.createElement('canvas'),materialEmissionContext=materialEmissionBuffer.getContext('2d');materialEmissionBuffer.width=materialEmissionBuffer.height=96;
  function drawAnatomicalSocketSample(asset,sourceRect,targetRect,options){
    if(!asset?.ready)return;
    const target=options.context||ctx,palette=nativeMaterialPalette(asset,sourceRect,options),destroyed=!!options.destroyed,sealed=!!options.sealed&&!destroyed;
    const energy=clamp(options.energy||0,0,1),hit=clamp(options.hit||0,0,1),c=materialSocketContext,N=96,base=options.filter&&options.filter!=='none'?options.filter+' ':'';
    c.save();c.clearRect(0,0,N,N);c.shadowBlur=0;c.globalCompositeOperation='source-over';c.filter=base||'none';
    c.globalAlpha=destroyed?1:sealed?.88:Math.max(.12,1-energy*.88);c.drawImage(palette.sealed,0,0,N,N);
    if(!destroyed&&!sealed){c.globalAlpha=Math.max(energy,hit*.7);c.drawImage(palette.hot,0,0,N,N)}
    if(!destroyed&&!sealed&&options.highlight){
      c.globalCompositeOperation='screen';c.globalAlpha=.18+energy*.22;c.drawImage(palette.emission,0,0,N,N)
    }
    c.restore();target.save();target.globalCompositeOperation='source-atop';target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';target.shadowBlur=0;
    if(destroyed)target.filter='brightness(.2)';
    // Only the destination sprite's existing coverage may receive this layer.
    // Brightening an antialiased edge must never make that edge more opaque.
    target.drawImage(materialSocketBuffer,targetRect.x-targetRect.w/2,targetRect.y-targetRect.h/2,targetRect.w,targetRect.h);
    target.restore()
  }
  const boundedMaterialSamples=new WeakMap();
  function boundedMaterialSample(asset,rect,bounds){
    let cache=boundedMaterialSamples.get(asset);if(!cache){cache=new Map();boundedMaterialSamples.set(asset,cache)}
    const key=[rect.x,rect.y,rect.w,rect.h,bounds.x,bounds.y,bounds.w,bounds.h].join('/');if(cache.has(key))return cache.get(key);
    const view=document.createElement('canvas'),N=96;view.width=view.height=N;view.ready=true;view.hasAlpha=true;view.destructionComposite=true;
    const left=Math.max(rect.x,bounds.x,0),top=Math.max(rect.y,bounds.y,0),right=Math.min(rect.x+rect.w,bounds.x+bounds.w,asset.naturalWidth||asset.width),bottom=Math.min(rect.y+rect.h,bounds.y+bounds.h,asset.naturalHeight||asset.height);
    view.frameSample={source:asset,rect:{...rect},bounds:{...bounds}};
    if(right>left&&bottom>top){const raster=view.getContext('2d');raster.imageSmoothingEnabled=true;raster.drawImage(asset,left,top,right-left,bottom-top,(left-rect.x)/rect.w*N,(top-rect.y)/rect.h*N,(right-left)/rect.w*N,(bottom-top)/rect.h*N)}
    cache.set(key,view);if(cache.size>64)cache.delete(cache.keys().next().value);return view;
  }
  function drawMaterialSocketSample(asset,sourceRect,targetRect,options={}){
    if(nativeSpritePartCapture)return;
    if(!asset?.ready)return;
    let frameBounds=options.frameBounds;
    const owner=miniBoss?.kind==='mini'&&asset?.followMini?miniBoss:boss,module=window.StarfighterDestruction;
    if(owner&&module?.has(asset)){
      const surface=module.surface(asset,nativeSpriteBrokenGroups(owner),{style:nativeSpriteStyle(owner)});
      if(surface&&surface!==asset){const sx=(surface.naturalWidth||surface.width)/(asset.naturalWidth||asset.width),sy=(surface.naturalHeight||surface.height)/(asset.naturalHeight||asset.height);sourceRect={x:sourceRect.x*sx,y:sourceRect.y*sy,w:sourceRect.w*sx,h:sourceRect.h*sy};if(frameBounds)frameBounds={x:frameBounds.x*sx,y:frameBounds.y*sy,w:frameBounds.w*sx,h:frameBounds.h*sy};asset=surface}
    }
    if(frameBounds){asset=boundedMaterialSample(asset,sourceRect,frameBounds);sourceRect={x:0,y:0,w:96,h:96}}
    if(options.palette!=='bloodstar'){drawAnatomicalSocketSample(asset,sourceRect,targetRect,options);return}
    const energy=clamp(options.energy||0,0,1),health=clamp(options.health??1,0,1),hit=clamp(options.hit||0,0,1),destroyed=!!options.destroyed,sealed=!!options.sealed&&!destroyed,bloodstar=options.palette==='bloodstar',heat=clamp(options.heat||0,0,2),target=options.context||ctx;
    if(!asset?.ready||(!sealed&&!destroyed&&energy<=0&&health>=.55&&hit<=0))return;
    const c=materialSocketContext,N=96,base=options.filter&&options.filter!=='none'?options.filter+' ':'',palette=!bloodstar&&!destroyed?nativeMaterialPalette(asset,sourceRect):null;
    c.save();c.clearRect(0,0,N,N);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.shadowBlur=0;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    c.filter=destroyed?base+'brightness(.18) saturate(.35) contrast(1.14)':base||'none';
    c.drawImage(asset,sourceRect.x,sourceRect.y,sourceRect.w,sourceRect.h,0,0,N,N);c.filter='none';
    if(bloodstar&&!destroyed&&!sealed&&heat>0){const palette=bloodstarMaterialPalette(asset,sourceRect);c.globalAlpha=Math.min(1,heat);c.drawImage(palette[0],0,0,N,N);if(heat>1){c.globalAlpha=heat-1;c.drawImage(palette[1],0,0,N,N)}c.globalAlpha=1}
    else if(palette){c.filter=base||'none';c.globalAlpha=sealed?1:Math.max(energy,hit*.6);c.drawImage(sealed?palette.sealed:palette.hot,0,0,N,N);c.globalAlpha=1;c.filter='none'}
    if(destroyed||health<.55){
      c.globalAlpha=destroyed?.72:.42;c.strokeStyle='#080b10';c.lineWidth=destroyed?3:1.7;c.lineCap='round';
      const seed=options.seed||0,side=seed%2?1:-1;c.beginPath();c.moveTo(24,35+side*5);c.lineTo(40,46);c.lineTo(47,34);c.moveTo(40,46);c.lineTo(57,57+side*3);c.lineTo(70,49);c.moveTo(57,57+side*3);c.lineTo(53,70);c.stroke();
      if(destroyed){c.globalAlpha=.25;c.strokeStyle='#958b87';c.lineWidth=.8;c.beginPath();c.moveTo(25,37+side*5);c.lineTo(39,48);c.lineTo(46,36);c.stroke()}
    }
    c.globalAlpha=1;c.globalCompositeOperation='destination-in';c.drawImage(asset,sourceRect.x,sourceRect.y,sourceRect.w,sourceRect.h,0,0,N,N);
    const matte=c.createRadialGradient(48,48,20,48,48,48);matte.addColorStop(0,'#fff');matte.addColorStop(.6,'#fff');matte.addColorStop(1,'#ffffff00');c.fillStyle=matte;c.fillRect(0,0,N,N);c.restore();
    target.save();target.globalCompositeOperation='source-over';target.globalAlpha*=bloodstar?1:destroyed?1:sealed?.86:health<.55?.92:Math.max(energy,hit*.8);target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';target.drawImage(materialSocketBuffer,targetRect.x-targetRect.w/2,targetRect.y-targetRect.h/2,targetRect.w,targetRect.h);
    if(options.highlight&&palette&&!destroyed&&!sealed){
      const glow=materialEmissionContext;glow.save();glow.clearRect(0,0,N,N);glow.globalAlpha=1;glow.globalCompositeOperation='source-over';glow.filter=base||'none';glow.drawImage(palette.emission,0,0,N,N);glow.filter='none';
      glow.globalCompositeOperation='destination-in';glow.fillStyle=matte;glow.fillRect(0,0,N,N);glow.restore();
      target.globalCompositeOperation='screen';target.globalAlpha*=.3+energy*.25;target.shadowColor=palette.color;target.shadowBlur=2.4;target.drawImage(materialEmissionBuffer,targetRect.x-targetRect.w/2,targetRect.y-targetRect.h/2,targetRect.w,targetRect.h)
    }
    target.restore()
  }
  // Physical violet claw organs measured in the coherent authored poses.
  const gravebellAuthoredOrbTracks=[{"2":[[263.167,234.04],[267.361,234.712],[257.186,234.726],[238.03,234.929],[258.617,238.48],[260.819,240.24],[257.547,240.51],[239.013,240.814],[252.107,242.527],[253.056,242.705],[249.093,242.909],[231.281,242.71],[244.882,221.165],[247.26,221.003],[246.893,221.291],[229.628,220.943]],"0":[null,null,null,null,null,null,null,null,null,null,null,null,[138.953,94.651],[142.534,95.393],[142.474,96.289],null]},{"2":[[88.148,187.445],[93.03,201.501],[90.901,197.465],[91.107,199.628],[101.006,197.629],[94.36,191.112],[100.695,196.178],[89.032,203.571],[99.038,192.329],[100.067,199.841],[93.807,189.512],[89.873,194.211],[90.855,136.773],[95.225,155.786],[94.035,159.914],[91.154,163.328]],"3":[[267.339,210.438],[249.624,185.367],[245.116,208.933],[242.399,206.321],[254.667,205.431],[253.287,188.909],[258.15,190.619],[234.55,209.875],[257.495,195.281],[241.621,201.289],[254.17,196.876],[236.102,201.382],[251.649,140.517],[253.467,142.623],[240.311,162.489],[235.426,166.476]],"0":[null,null,null,null,null,null,null,null,null,null,null,null,[152.338,110.338],[150.997,112.763],null,null]}];
  // Native horn/head landmarks measured in each authored pose.
  const bossAnatomyLandmarks={"7":[{"-1":[[157.35,175.42],[161.35,175.42],[153.35,175.42],[136.35,175.42],[155.35,181.42],[160.35,182.42],[161.35,182.42],[141.35,182.42],[152.35,182.42],[154.35,183.42],[153.35,183.42],[136.35,184.42],[147.35,160.42],[152.35,163.42],[151.35,161.42],[135.35,161.42]],"0":[[147,109],[151,110],[144,109],[128,109],[147,117],[153,117],[153,117],[134,116],[144,117],[147,118],[146,118],[129,118],[140,96],[144,96],[143,96],[128,97]]},{"-1":[[171.05,181.5],[161.05,180.5],[158.05,180.5],[157.05,181.5],[170.05,177.5],[165.05,181.5],[167.05,180.5],[156.05,178.5],[169.05,177.5],[159.05,179.5],[164.05,179.5],[154.05,175.5],[167.05,142.5],[162.05,143.5],[157.05,140.5],[153.05,141.5]],"0":[[154,127],[142,128],[139,126],[141,128],[152,124],[147,127],[150,125],[143,124],[151,124],[140,124],[148,122],[137,121],[148,86],[144,88],[136,90],[132,93]]}],"8":[{"-1":[[200,179],[182,179],[185,179],[170,183],[197,169],[183,171],[182,171],[157,169],[186,173],[177,172],[174,173],[155,173],[186,139],[170,140],[173,141],[154,140]],"0":[[124.73,122.78],[106.73,131.78],[107.73,134.78],[92.73,134.78],[119.73,118.78],[108.73,126.78],[105.73,128.78],[82.73,126.78],[110.73,126.78],[100.73,130.78],[97.73,131.78],[85.73,127.78],[110.73,92.78],[97.73,99.78],[99.73,94.78],[79.73,103.78]],"1":[[118.43,180.63],[106.43,185.63],[110.43,183.63],[89.43,195.63],[113.43,172.63],[103.43,174.63],[103.43,175.63],[83.43,177.63],[106.43,176.63],[98.43,181.63],[98.43,182.63],[78.43,178.63],[105.43,144.63],[97.43,148.63],[100.43,148.63],[76.43,148.63]],"2":[[118.32,233.52],[107.32,237.52],[113.32,237.52],[99.32,244.52],[121.32,227.52],[113.32,230.52],[115.32,230.52],[88.32,231.52],[115.32,230.52],[112.32,233.52],[106.32,233.52],[89.32,232.52],[118.32,198.52],[106.32,199.52],[108.32,200.52],[87.32,202.52]]},{"-1":[[199,176],[176,176],[183,180],[169,181],[188,179],[171,179],[173,179],[163,178],[181,177],[168,177],[173,177],[160,180],[179,146],[168,149],[176,153],[167,150]],"0":[[124.11,123.09],[98.11,125.09],[106.11,132.09],[93.11,136.09],[113.11,125.09],[91.11,125.09],[93.11,127.09],[80.11,128.09],[97.11,127.09],[83.11,130.09],[90.11,128.09],[76.11,131.09],[94.11,96.09],[85.11,103.09],[100.11,109.09],[85.11,102.09]],"1":[[113.05,169.36],[111.05,165.36],[102.05,176.36],[94.05,181.36],[112.05,170.36],[95.05,172.36],[95.05,178.36],[79.05,173.36],[92.05,170.36],[88.05,177.36],[89.05,170.36],[74.05,174.36],[96.05,144.36],[91.05,147.36],[103.05,154.36],[81.05,148.36]],"2":[[114.97,231.01],[111.97,220.01],[104.97,227.01],[94.97,229.01],[109.97,221.01],[98.97,225.01],[102,228],[84.97,229.01],[98.97,224.01],[97,226],[94.97,224.01],[85.97,226.01],[99.97,195.01],[92.97,199.01],[103.97,204.01],[86.97,201.01]]}]};
  function lateBossRawPoint(type,phase,frame,index){
    if(type===5){const point=voidLeviathanNodePixelAtFrame(phase,index,frame);return[point.x,point.y]}
    if(type===6){const points=prismWardenNodePixels[frame],core=points[0],point=points[index]||core;return[core[0]+(point[0]-core[0])*prismWardenContentScale,core[1]+(point[1]-core[1])*prismWardenContentScale]}
    const frames=type===7?gravebellNodePixels:type===8?solarHydraNodePixels:omegaHeartNodePixels,points=frames[phase][frame];
    if(points[index])return points[index];
    const anchor=points[type===8?3:0],reference=frames[phase][0][type===8?3:0];
    const extras=type===8?(phase?[[219,132],[221,195],[241,167]]:[]):(phase?[[242,135],[239,198]]:[[244,164]]),extra=extras[index-points.length]||reference;
    return[extra[0]+anchor[0]-reference[0],extra[1]+anchor[1]-reference[1]]
  }
  function lateBossMaterialFrame(e,sizeOverride){
    const type=e.epic?(e.epicId===0?9:8):e.type,phase=e.epic?(e.phase<=2?0:1):e.phase-1,size=sizeOverride||(e.epic?292:type===5?232:type===6?prismWardenRenderWidth:type===7?gravebellRenderSize:type===8?solarHydraRenderSize:omegaHeartRenderSize);
    const animation=e.epic?epicAnimationState(e):type===5?voidLeviathanAnimationState(e):type===6?prismWardenAnimationState(e):type===7?gravebellAnimationState(e):type===8?solarHydraAnimationState(e):omegaHeartAnimationState(e),assets=type===5?voidLeviathanGranularSprites:type===6?prismWardenGranularSprites:type===7?gravebellGranularSprites:type===8?solarHydraGranularSprites:omegaHeartGranularSprites,base=assets[phase],body=boss32Body(type,phase,animation,base),between=body.asset!==base,mix=between?.5:0,frame=body.frame,next=(frame+1)%16;
    const cellW=type===5?voidLeviathanGranularCellSize:type===6?prismWardenCellWidth:320,cellH=type===6?prismWardenCellHeight:cellW,shiftAt=f=>type===5?voidLeviathanGranularFrameShift[phase][f].map(v=>-v):type===6?prismWardenFrameShift[f]:type===7?gravebellFrameShift(phase,f):type===8?solarHydraFrameShift(phase,f):omegaHeartFrameShift(phase,f),a=shiftAt(frame),b=shiftAt(next),shift=[a[0]+(b[0]-a[0])*mix,a[1]+(b[1]-a[1])*mix],scale=size/cellW,recoil=e.epic?0:type===6?(e.prismRecoil||0)*2.2:type===7?(e.gravebellRecoil||0)*2.8:type===8?(e.solarHydraRecoil||0)*3.2:type===9?(e.omegaHeartRecoil||0)*3:0;
    const tracks=lateBossMaterialTracks[type]?.[phase],registration=between?tracks?.registration[frame]:null,sourceBounds=registration?.[0]||[0,0,cellW,cellH];let factorX=1,factorY=1;
    if(registration){const reference=registration[1];factorX=(reference[2]-reference[0])/(sourceBounds[2]-sourceBounds[0]);factorY=(reference[3]-reference[1])/(sourceBounds[3]-sourceBounds[1]);shift[0]+=reference[0]-sourceBounds[0]*factorX+cellW/2*(factorX-1);shift[1]+=reference[1]-sourceBounds[1]*factorY+cellH/2*(factorY-1)}
    const pointAt=index=>{const physical=bossAnatomyLandmarks[type]?.[phase]?.[index]?.[frame];if(physical)return physical;const authored=type===7?gravebellAuthoredOrbTracks[phase]?.[index]?.[frame]:type===9&&phase===1&&index===3&&frame===2?[227.311,97.444]:null;if(authored)return authored;const registered=tracks?.[between?'between':'key']?.[frame]?.[index];if(registered)return registered;const p=lateBossRawPoint(type,phase,frame,index),q=lateBossRawPoint(type,phase,next,index);return[p[0]+(q[0]-p[0])*mix,p[1]+(q[1]-p[1])*mix]};
    return{type,phase,size,cellW,cellH,scale,recoil,shift,pointAt,source:body.asset,frame,sourceBounds,factorX,factorY,drawW:size,drawH:cellH*scale}
  }
  function lateBossSocketOffset(e,node){const frame=lateBossMaterialFrame(e),index=e.epic?(node.epicIndex??Math.max(0,activeWeakNodes(e).indexOf(node))):frame.type===5?(node.voidLeviathanIndex??0):frame.type===6?(node.prismWardenIndex??0):frame.type===7?(node.gravebellIndex??0):frame.type===8?(node.solarHydraIndex??0):(node.omegaHeartIndex??0),point=frame.pointAt(index);return{dx:((point[0]-frame.cellW/2)*frame.factorX+frame.shift[0])*frame.scale-frame.recoil,dy:((point[1]-frame.cellH/2)*frame.factorY+frame.shift[1])*frame.scale}}
  function epicNodeOffset(e,node){return lateBossSocketOffset(e,node)}
  function lateBossSocketRadii(frame,index){
    if(frame.type===5)return index===2?[26,18]:index>=3?[18,9]:[8,7];
    if(frame.type===6)return index===0?[20,20]:[16,12];
    if(frame.type===8)return index===3?[23,23]:index<3?[15,9]:[12,11];
    if(frame.type===9)return index===0?[22,22]:index<3?[15,10]:[10,9];
    return gravebellWeakRadii[frame.phase][index]||[10,9]
  }
  function renderIntegratedLateBoss(e,size,hit,filter='none'){
    const frame=lateBossMaterialFrame(e,size),asset=frame.source;if(!asset?.ready)return false;
    const motion=bossSpriteMotion(e),sx=(frame.frame%4)*frame.cellW,sy=Math.floor(frame.frame/4)*frame.cellH,bounds=frame.sourceBounds,sourceRect=[sx+bounds[0],sy+bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1]],targetRect=[(bounds[0]-frame.cellW/2)*frame.factorX*frame.scale-frame.recoil,(bounds[1]-frame.cellH/2)*frame.factorY*frame.scale,(bounds[2]-bounds[0])*frame.factorX*frame.scale,(bounds[3]-bounds[1])*frame.factorY*frame.scale];
    ctx.save();ctx.scale(motion.x,motion.y);ctx.translate(frame.shift[0]*frame.scale,frame.shift[1]*frame.scale);ctx.globalCompositeOperation='source-over';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.filter=filter;
    ctx.drawImage(asset,...sourceRect,...targetRect);ctx.filter='none';
    const previousReadbacks=nativePaletteReadbackScope;
    try{
    nativePaletteReadbackScope=prefetchLateBossMaterialReadbacks(e,frame,sx,sy);
    const nodes=activeWeakNodes(e);for(let index=0;index<nodes.length;index++){
      const node=nodes[index];if(nativeSocketRemoved(e,node))continue;
      const point=frame.pointAt(index),radius=lateBossSocketRadii(frame,index),rx=radius[0]/frame.factorX,ry=radius[1]/frame.factorY,energy=e.weakOpen?.86+weakPointPulse(e,index)*.14:e.weakTelegraph>0?.4:0,localHit=Number.isFinite(node.hitTime)?clamp(1-(e.clock-node.hitTime)/.14,0,1):0;
      drawMaterialSocketSample(asset,{x:sx+point[0]-rx,y:sy+point[1]-ry,w:rx*2,h:ry*2},{x:(point[0]-frame.cellW/2)*frame.factorX*frame.scale-frame.recoil,y:(point[1]-frame.cellH/2)*frame.factorY*frame.scale,w:radius[0]*2*frame.scale,h:radius[1]*2*frame.scale},{energy,highlight:e.weakOpen,sealed:!e.weakOpen&&!e.weakTelegraph,health:node.hp/node.max,destroyed:node.destroyed,hit:localHit,filter,hue:frame.type===5?120:frame.type===6?188:frame.type===7?270:frame.type===8?25:345,hueSpread:frame.type===6?22:45,seed:index+frame.type})
    }
    }finally{nativePaletteReadbackScope=previousReadbacks}
    if(hit>0){ctx.save();ctx.globalAlpha*=Math.min(.34,hit*3);ctx.filter=filter==='none'?'brightness(1.8) saturate(.75)':filter+' brightness(1.65)';ctx.drawImage(asset,...sourceRect,...targetRect);ctx.restore()}
    ctx.restore();return true
  }
  function drawVoidLeviathanSprite(b,size,hit){return renderIntegratedLateBoss(b,size,hit)}
  function drawPrismWardenSprite(b,size,hit){return renderIntegratedLateBoss(b,size,hit)}
  function drawGravebellSprite(b,size,hit){return renderIntegratedLateBoss(b,size,hit)}
  function drawGravebellWeakPoints(e){/* Material state is composited inside the animated body. */}
  function drawSolarHydraSprite(b,size,hit){return renderIntegratedLateBoss(b,size,hit)}
  function drawSolarHydraWeakPoints(e){/* Material state is composited inside the animated body. */}
  function drawOmegaHeartSprite(b,size,hit){return renderIntegratedLateBoss(b,size,hit)}
  function drawOmegaHeartWeakPoints(e){/* Material state is composited inside the animated body. */}
  function drawPrismWardenWeakPoints(e){/* Material state is composited inside the animated body. */}
  function drawIronBloomWeakPoints(e){/* Native socket material is composited with its animated body. */}

  function drawTwinMawWeakPoints(e){/* Native socket material is composited with its animated body. */}

  function drawHelixWeakPoints(e){/* Native socket material is composited with its animated body. */}

  function drawRiftWeakPoints(e){/* Native socket material is composited with its animated body. */}

  function drawVoidLeviathanWeakPoints(e){/* Material state is composited inside the animated body. */}
  function epicAnimationState(e){return boss32AnimationState(e,3.35+e.phase*.14)}
  function drawEpicBossSprite(b,size,hit){const filter=b.epicId===0?'hue-rotate(24deg) saturate(1.4) contrast(1.08)':'hue-rotate(76deg) saturate(1.45) contrast(1.08)';return renderIntegratedLateBoss(b,size,hit,filter)}
  function drawEpicAtmosphere(){if(!boss?.epic||boss.phase<2)return;const color=boss.epicId===0?'#d33cff':'#5dff47';ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.09+boss.phase*.018;const fog=ctx.createRadialGradient(W*.55+Math.sin(t*.18)*80,H*.5,20,W*.55,H*.5,W*.72);fog.addColorStop(0,color);fog.addColorStop(.48,color+'55');fog.addColorStop(1,'#00000000');ctx.fillStyle=fog;ctx.fillRect(0,0,W,H);ctx.globalAlpha=.05;ctx.fillStyle=color;for(let i=0;i<7;i++){const x=(i*187+t*(9+i*1.5))%(W+240)-120,y=80+(i*97)%Math.max(100,H-160);ctx.beginPath();ctx.ellipse(x,y,150+i*9,28+i*2,Math.sin(i)*.25,0,Math.PI*2);ctx.fill()}ctx.restore()}
  function drawEpicHeavy(h){
    const active=h.active&&!h.dead,charging=active&&h.cool<.2,filter=h.color==='#78ff56'?'hue-rotate(155deg) saturate(1.08)':'hue-rotate(-18deg)';
    ctx.save();ctx.translate(h.x,h.y);ctx.globalAlpha=h.dead?.1:active?1:.28;ctx.shadowColor=h.color;ctx.shadowBlur=active?5:0;
    // Ritual sentinels use the same authored organic machinery as the fleet.
    // The firing pose winds up at the real fan-release beat; idle mounts stay still.
    if(!atlasCell(charging?1:0,3,0,0,78,78,1,filter)){
      ctx.fillStyle='#121c28';ctx.strokeStyle=h.color;ctx.lineWidth=1.3;poly(0,0,25,6,Math.PI/6);ctx.fill();ctx.stroke()
    }
    ctx.shadowBlur=0;
    if(active){
      ctx.globalAlpha=1;ctx.fillStyle='#06101beb';ctx.fillRect(-30,40,60,5);ctx.fillStyle=h.color;ctx.fillRect(-29,41,58*clamp(h.hp/h.max,0,1),3);
      ctx.strokeStyle=h.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-9,-38);ctx.lineTo(0,-32);ctx.lineTo(9,-38);ctx.stroke()
    }
    ctx.restore()
  }
  function drawEpicWeakPoints(e){/* Frame-registered source materials replace floating energy glyphs. */}

  function drawMiniBossFireFlash(e){
    if(!e.muzzleFlares?.length)return;ctx.save();applyEnemyPose(e,true);ctx.globalCompositeOperation='screen';
    for(const flare of e.muzzleFlares){if(flare.side&&e.weakNodes?.[flare.side<0?0:2]?.destroyed)continue;const port=Number.isFinite(flare.side)?miniBossMuzzle(e,flare.side):flare;ctx.save();ctx.translate(port.dx,port.dy);const pulse=clamp(flare.time/.1,0,1);ctx.globalAlpha=pulse*.85;ctx.shadowBlur=5;ctx.shadowColor=e.def.color;ctx.fillStyle=e.def.color;ctx.fillRect(-4-pulse*3,-1.2,6+pulse*3,2.4);ctx.fillStyle='#f4ffff';ctx.shadowBlur=0;ctx.fillRect(-2,-.65,3,1.3);ctx.restore()}
    ctx.restore()
  }
  function paintMiniBossNativeBody(e,frameOverride){
    const asset=miniBossSpriteFor(e.type),frame=frameOverride===undefined?miniBossFrame(e):((Math.trunc(frameOverride)%16)+16)%16,sw=(asset.naturalWidth||asset.width)/4,sh=(asset.naturalHeight||asset.height)/4;
    if(!asset.ready||!sw||!sh)return false;
    const motion=bossSpriteMotion(e),width=e.def.w,height=e.def.h,hit=e.hitFlash||0;
    ctx.save();ctx.scale(motion.x,motion.y);ctx.imageSmoothingEnabled=false;
    if(e.type===8){ctx.beginPath();ctx.rect(-width/2,-height/2+height*18/256,width,height*238/256);ctx.clip()}
    ctx.globalCompositeOperation=asset.hasAlpha?'source-over':'screen';
    ctx.drawImage(asset,frame%4*sw,Math.floor(frame/4)*sh,sw,sh,-width/2,-height/2,width,height);
    if(hit>0){ctx.save();ctx.globalAlpha*=Math.min(.24,hit*2);ctx.filter='brightness(1.7) saturate(.85)';ctx.drawImage(asset,frame%4*sw,Math.floor(frame/4)*sh,sw,sh,-width/2,-height/2,width,height);ctx.restore()}
    paintMiniBossWeakPoints(e,frame);ctx.restore();return true
  }
  function paintMiniBossWeakPoints(e,frameOverride){
    const nodes=activeWeakNodes(e),asset=miniBossSpriteFor(e.type),frame=frameOverride===undefined?miniBossFrame(e):((Math.trunc(frameOverride)%16)+16)%16,col=frame%4,row=Math.floor(frame/4),sw=(asset.naturalWidth||asset.width)/4,sh=(asset.naturalHeight||asset.height)/4;
    if(!asset.ready||!sw||!sh)return;
    for(const node of nodes){
      if(nativeSocketRemoved(e,node))continue;
      const index=node.miniIndex??0,point=miniBossCoreTracks[e.type]?.[frame]?.[index],offset=point?{dx:point[0],dy:point[1]}:miniBossNodeOffset(e,node),[rx,ry]=miniBossCoreProfiles[e.type]?.[index]||[12,12];
      const sourceRect={x:col*sw+(offset.dx/e.def.w+.5)*sw-rx*sw/e.def.w,y:row*sh+(offset.dy/e.def.h+.5)*sh-ry*sh/e.def.h,w:rx*2*sw/e.def.w,h:ry*2*sh/e.def.h};
      const energy=e.weakOpen?.86+weakPointPulse(e,index)*.14:e.weakTelegraph>0?.4:0,localHit=Number.isFinite(node.hitTime)?clamp(1-(e.clock-node.hitTime)/.14,0,1):0;
      drawMaterialSocketSample(asset,sourceRect,{x:offset.dx,y:offset.dy,w:rx*2,h:ry*2},{frameBounds:{x:col*sw,y:row*sh,w:sw,h:sh},energy,highlight:e.weakOpen,sealed:!e.weakOpen&&!e.weakTelegraph,health:node.hp/node.max,destroyed:node.destroyed,hit:localHit,hue:miniBossMaterialHues[e.type]?.[index],hueSpread:42,lowLight:true,seed:index+e.type*3})
    }
  }
  function drawMiniBossWeakPoints(e){ctx.save();applyEnemyPose(e,true);paintMiniBossWeakPoints(e);ctx.restore()}
  function drawWeakPoints(e){
    const isBoss=e.kind==='boss';if(!isBoss){drawMiniBossWeakPoints(e);return}
    const nodes=activeWeakNodes(e),asset=bossWeakpointSprites[e.type],hit=e.hitFlash||0,motion=bossSpriteMotion(e);
    if(isBoss&&e.epic){drawEpicWeakPoints(e);return}
    if(isBoss&&e.type===0)return;
    if(isBoss&&e.type===1){drawTwinMawWeakPoints(e);return}
    if(isBoss&&e.type===2){drawHelixWeakPoints(e);return}
    if(isBoss&&e.type===3){drawRiftWeakPoints(e);return}
    if(isBoss&&e.type===4){drawIronBloomWeakPoints(e);return}
    if(isBoss&&e.type===5){drawVoidLeviathanWeakPoints(e);return}
    if(isBoss&&e.type===6){drawPrismWardenWeakPoints(e);return}
    if(isBoss&&e.type===7){drawGravebellWeakPoints(e);return}
    if(isBoss&&e.type===8){drawSolarHydraWeakPoints(e);return}
    if(isBoss&&e.type===9){drawOmegaHeartWeakPoints(e);return}
    ctx.save();ctx.translate(e.x+Math.sin(t*(isBoss?165:150))*hit*(isBoss?52:42),e.y);ctx.rotate(bossVisualAngle(e));ctx.scale((1+hit*(isBoss?.62:.7))*motion.x,(1-hit*(isBoss?.24:.28))*motion.y);
    for(const node of nodes){
      if(!node.destroyed&&!e.weakOpen)continue;
      const health=clamp(node.hp/node.max,0,1),state=node.destroyed?3:health<.5?2:1,tilt=clamp(node.dy/135,-.32,.32),pulse=node.destroyed?1:1+Math.sin(t*25)*.035;
      const seamColor=isBoss?(e.phase===1?e.def.c1:e.def.c2):'#ffd166',drawW=node.destroyed?(isBoss?16:13):(isBoss?11:9),drawH=node.destroyed?(isBoss?25:20):(isBoss?23:18),cropX=node.destroyed?.21:.115,cropY=node.destroyed?.5:.42;
      ctx.save();ctx.translate(node.dx,node.dy);ctx.rotate(tilt);ctx.scale(pulse,pulse);
      ctx.shadowBlur=node.destroyed?4:13;ctx.shadowColor=seamColor;
      const rendered=sheetCellCrop(asset,state%2,Math.floor(state/2),2,2,0,0,drawW,drawH,cropX,cropY,1,node.destroyed?'brightness(.72) contrast(1.35) saturate(1.25)':'brightness(1.3) contrast(1.35) saturate(1.65)');
      if(!rendered){ctx.strokeStyle=node.destroyed?'#252b35':seamColor;ctx.lineWidth=node.destroyed?3:2;ctx.beginPath();ctx.moveTo(0,-drawH*.42);ctx.lineTo(0,drawH*.42);ctx.stroke();if(!node.destroyed){ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(0,0,1.7,0,7);ctx.fill()}}
      ctx.restore()
    }
    ctx.restore()
  }
  function drawBossFragment(f){
    const fadeDuration=f.nativeChunk?.canvas ? .65 : Math.max(.001,f.max||f.life);
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rot||0);ctx.globalAlpha=clamp(f.life/fadeDuration,0,1);ctx.globalCompositeOperation='source-over';
    if(f.nativeChunk?.canvas){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(f.nativeChunk.canvas,-f.nativeChunk.w/2,-f.nativeChunk.h/2,f.nativeChunk.w,f.nativeChunk.h)}
    else if(f.asset?.ready){const sourceWidth=f.asset.naturalWidth||f.asset.width,sourceHeight=f.asset.naturalHeight||f.asset.height,cellW=sourceWidth/2,cellH=sourceHeight/2,frame=f.frame||0,col=frame%2,row=Math.floor(frame/2),size=f.size||224;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(f.asset,col*cellW,row*cellH,cellW,cellH,-size/2-(f.rootDx||0),-size/2-(f.rootDy||0),size,size)}
    else{const plate=f.procedural?.includes('Plate'),width=f.w||12,height=f.h||7;ctx.fillStyle=f.color||'#8a5362';ctx.strokeStyle='#d8e3ed88';ctx.lineWidth=1;if(plate){ctx.beginPath();ctx.moveTo(-width*.62,0);ctx.lineTo(-width*.18,-height*.62);ctx.lineTo(width*.58,-height*.3);ctx.lineTo(width*.48,height*.42);ctx.lineTo(-width*.28,height*.58);ctx.closePath()}else{ctx.beginPath();ctx.moveTo(-width*.62,-height*.22);ctx.lineTo(width*.55,-height*.5);ctx.lineTo(width*.35,height*.52);ctx.closePath()}ctx.fill();ctx.stroke()}
    ctx.restore()
  }
  function drawCollisionGuide(){
    if(!player||player.hp<=0||(!player.focus&&!settings.collisionGuide))return;
    ctx.save();ctx.translate(player.x,player.y);ctx.lineWidth=1;ctx.strokeStyle='#e3fcff';ctx.shadowBlur=5;ctx.shadowColor='#071422';
    ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ffffff';ctx.strokeStyle='#071422';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,2.4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore()
  }
  function drawPlayerShot(b){
    const color=b.forceColor||(b.missile?'#ffad62':b.critical?'#ffe49b':b.charge?'#86edff':'#65e8fa');
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.shadowColor=color;ctx.shadowBlur=b.charge?12:5;
    if(b.missile){
      const plume=ctx.createLinearGradient(-24,0,-4,0);plume.addColorStop(0,'#ff781800');plume.addColorStop(1,'#ffb469');ctx.fillStyle=plume;ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(-5,-2.5);ctx.lineTo(-5,2.5);ctx.closePath();ctx.fill();
      ctx.fillStyle='#dcecf1';ctx.strokeStyle='#14212f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(1,-3);ctx.lineTo(-7,-3);ctx.lineTo(-5,0);ctx.lineTo(-7,3);ctx.lineTo(1,3);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#ffbd75';ctx.fillRect(-6,-1,4,2)
    }else if(b.charge){
      const r=b.r,trail=ctx.createLinearGradient(-r*4,0,r,0);trail.addColorStop(0,'#58dfff00');trail.addColorStop(.65,'#69dcff77');trail.addColorStop(1,'#ddffff');ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(-r*4,0);ctx.quadraticCurveTo(-r,-r*.55,r*.9,0);ctx.quadraticCurveTo(-r,r*.55,-r*4,0);ctx.fill();
      ctx.fillStyle='#285f7e';ctx.beginPath();ctx.ellipse(0,0,r*1.3,r*.78,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(r*.18,0,r*1.1,r*.62,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=4;ctx.fillStyle='#f4ffff';ctx.beginPath();ctx.ellipse(r*.35,0,r*.75,r*.27,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c7fcff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-r*1.3,-r*.58);ctx.lineTo(-r*.35,-r*.58);ctx.moveTo(-r*1.8,r*.58);ctx.lineTo(-r*.6,r*.58);ctx.stroke()
    }else{
      ctx.fillStyle=color;ctx.strokeStyle='#07121d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,b.r*(b.waveRay?2.5:2),b.r*.72,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#efffff';ctx.fillRect(0,-Math.max(.6,b.r*.17),b.r*1.4,Math.max(1,b.r*.34))
    }
    ctx.restore()
  }
  function drawHostileShot(b){
    if(b.dead)return;
    if(b.warn>0)return;
    if(b.piercing){
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle='#251408';ctx.strokeStyle='#080b14';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-5,-5);ctx.lineTo(-11,0);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#ffbd4a';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff3b6';ctx.fillRect(-7,-1.4,15,2.8);ctx.restore();return
    }
    ctx.save();ctx.fillStyle=settings.clearCombat?'#ff7b96':'#ff4f88';ctx.strokeStyle='#080b14';ctx.lineWidth=4;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#ff8eaf';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#ffe2ed';ctx.beginPath();ctx.arc(b.x,b.y,Math.max(1,b.r*.35),0,Math.PI*2);ctx.fill();ctx.restore()
  }
  function drawEmitterCharge(x,y,progress,color='#ffd166'){
    const charge=clamp(progress,0,1),width=6+charge*8,height=3+charge*2;
    ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='screen';ctx.globalAlpha=settings.reducedMotion?.88:.58+charge*.36;
    ctx.shadowColor=color;ctx.shadowBlur=6+charge*10;ctx.fillStyle=color;ctx.fillRect(-width/2,-height/2,width,height);
    ctx.shadowBlur=0;ctx.fillStyle='#fff8df';ctx.fillRect(-2,-1,4,2);ctx.restore()
  }
  function drawBossLaser(b){
    if(!b.laser)return;
    if(b.laser.t>=.72){drawEmitterCharge(b.x-14,b.y,1-(b.laser.t-.72)/.93,'#ff3d81');return}
    ctx.save();ctx.globalAlpha=.9;ctx.strokeStyle='#ffffff';ctx.shadowBlur=30;ctx.shadowColor='#ff3d81';ctx.lineWidth=22;
    ctx.beginPath();ctx.moveTo(0,b.laser.y);ctx.lineTo(b.x,b.laser.y);ctx.stroke();ctx.strokeStyle='#ff3d81';ctx.lineWidth=8;ctx.stroke();ctx.restore()
  }
  function drawHostileWarning(b){
    if(b.dead||!(b.warn>0)||b.wall)return;
    const progress=1-b.warn/(b.warnMax||.65),alpha=settings.reducedMotion?.85:.65+progress*.3;
    if(b.owner?.kind==='boss'||b.owner?.kind==='mini'){drawEmitterCharge(b.x,b.y,progress);return}
    ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation='source-over';ctx.strokeStyle='#1b100b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.targetX,b.targetY);ctx.stroke();
    ctx.strokeStyle='#ffe19a';ctx.lineWidth=1.8;ctx.setLineDash([8,7]);ctx.stroke();ctx.setLineDash([]);
    ctx.translate(b.targetX,b.targetY);ctx.strokeStyle='#ffda7a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,-12);ctx.lineTo(-24,-21);ctx.lineTo(-13,-21);ctx.moveTo(13,-21);ctx.lineTo(24,-21);ctx.lineTo(24,-12);ctx.moveTo(24,12);ctx.lineTo(24,21);ctx.lineTo(13,21);ctx.moveTo(-13,21);ctx.lineTo(-24,21);ctx.lineTo(-24,12);ctx.stroke();ctx.restore()
  }
  function drawWallWarnings(){
    const walls=enemyShots.filter(b=>!b.dead&&b.wall&&b.warn>0),seen=new Set();
    for(const b of walls){const key=`${b.gapY}:${b.warn}`;if(seen.has(key))continue;seen.add(key);
      ctx.save();ctx.fillStyle='#ffb63b18';ctx.fillRect(W-26,30,26,Math.max(0,b.gapY-b.gapHalf-30));ctx.fillRect(W-26,b.gapY+b.gapHalf,26,H-b.gapY-b.gapHalf-30);
      ctx.strokeStyle='#ffd166';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(W-8,30);ctx.lineTo(W-8,b.gapY-b.gapHalf);ctx.moveTo(W-8,b.gapY+b.gapHalf);ctx.lineTo(W-8,H-30);ctx.stroke();
      ctx.strokeStyle='#84f4df';ctx.lineWidth=2;ctx.strokeRect(W-32,b.gapY-b.gapHalf+5,24,b.gapHalf*2-10);ctx.fillStyle='#b6ffed';ctx.font='11px monospace';ctx.textAlign='right';ctx.fillText('SAFE GAP',W-38,b.gapY+4);ctx.restore()
    }
  }
  const deltaEffectOrigins=new WeakMap();
  function drawDeltaEffect(){
    if(!player||!(player.deltaFlash>0)||state==='art')return false;
    if(!deltaEffectOrigins.has(player))deltaEffectOrigins.set(player,{x:player.x,y:player.y});
    const origin=deltaEffectOrigins.get(player),age=clamp(1.2-player.deltaFlash,0,1.2),clear=settings.clearCombat;
    if(settings.reducedMotion){
      if(age>=.32)return false;
      // A steady, local energy facet confirms the ability without a flash
      // or an expanding shape beneath a pilot who requests reduced motion.
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(1-age/.32)*(clear?.08:.13);ctx.fillStyle='#ffe5a1';ctx.beginPath();ctx.moveTo(origin.x+27,origin.y-11);ctx.lineTo(origin.x+65,origin.y-3);ctx.lineTo(origin.x+78,origin.y);ctx.lineTo(origin.x+65,origin.y+3);ctx.lineTo(origin.x+27,origin.y+11);ctx.lineTo(origin.x+43,origin.y);ctx.closePath();ctx.fill();ctx.restore();return true
    }
    if(age>=.78)return false;
    const progress=clamp(age/.78,0,1),radius=34+Math.pow(progress,.78)*W*.92,fade=(1-progress)*(1-progress);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.lineJoin='bevel';ctx.shadowColor='#ffd166';
    if(age<.11){
      const launch=ctx.createRadialGradient(origin.x+12,origin.y,4,origin.x+12,origin.y,118);launch.addColorStop(0,'#fff8d5');launch.addColorStop(.3,'#ffd166');launch.addColorStop(1,'#ffd16600');ctx.fillStyle=launch;ctx.globalAlpha=Math.pow(1-age/.11,2)*(clear?.12:.26);ctx.beginPath();ctx.moveTo(origin.x-100,origin.y);ctx.lineTo(origin.x-22,origin.y-42);ctx.lineTo(origin.x+54,origin.y-20);ctx.lineTo(origin.x+116,origin.y);ctx.lineTo(origin.x+54,origin.y+20);ctx.lineTo(origin.x-22,origin.y+42);ctx.closePath();ctx.fill()
    }
    // Four open, tapered fronts travel outwards. Their gaps retain the
    // negative space of a shock wave rather than a charging circle.
    for(const side of[-1,1])for(const vertical of[-1,1]){
      const x=origin.x,y=origin.y;ctx.globalAlpha=fade*(clear?.14:.36);ctx.shadowBlur=clear?2:10*fade;ctx.fillStyle='#ffe8a6';ctx.strokeStyle='#fff8da';ctx.lineWidth=clear?.6:1;
      ctx.beginPath();ctx.moveTo(x+side*radius*.42,y+vertical*radius*.54);ctx.lineTo(x+side*radius*.81,y+vertical*radius*.18);ctx.lineTo(x+side*radius,y+vertical*8);ctx.lineTo(x+side*radius*.84,y+vertical*(radius*.18+6));ctx.lineTo(x+side*radius*.43,y+vertical*(radius*.54+6));ctx.closePath();ctx.fill();ctx.stroke()
    }
    ctx.restore();return true
  }
  function buildCombatReadabilityAnchors(){
    if(state==='art'&&artInspection?.isolate)return[];
    const anchors=[];if(player?.hp>0)anchors.push({x:player.x,y:player.y,radius:player.r+22});
    for(const enemy of[miniBoss,boss]){
      if(!enemy||enemy.hp<=0||!enemy.weakOpen||!bossDamageAllowed(enemy))continue;
      for(const node of activeWeakNodes(enemy)){
        if(node.destroyed||node.hp<=0)continue;
        const point=worldWeakNode(enemy,node);anchors.push({x:point.x,y:point.y,radius:point.r+6})
      }
    }
    return anchors
  }
  function smokeReadabilityScale(particle,anchors){
    if(!particle.smoke&&!particle.damageSmoke)return 1;
    const age=1-clamp(particle.life/(particle.max||.7),0,1),footprint=Math.max(0,particle.s||0)*(particle.damageSmoke?.7+age*1.4:.7);
    let scale=1;for(const anchor of anchors){
      const distance=Math.hypot(particle.x-anchor.x,particle.y-anchor.y),inside=anchor.radius+footprint,feather=Math.max(18,footprint+anchor.radius*.5),u=clamp((distance-inside)/feather,0,1);
      scale=Math.min(scale,.18+.82*u*u*(3-2*u))
    }
    return scale
  }
  function draw(){
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    const studio=state==='art'&&artInspection?.isolate;
    if(studio){ctx.fillStyle='#0a111b';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#28415a24';ctx.lineWidth=.5;for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}}else{drawDepthBackground();drawEpicAtmosphere();drawStageMidground()}
    if(!['playing','paused','skilltree','upgrade','gameover','art'].includes(state)){if(!settings.clearCombat)drawStageForeground();return}
    if(!studio)drawCombatBackdrop();
    const cameraShake=settings.reducedMotion||state!=='playing'?0:Math.min(shake,10);ctx.save();ctx.translate(rand(-cameraShake,cameraShake),rand(-cameraShake,cameraShake));drawDeltaEffect();drawStageHazards();drawEliteIntro();
    enemies.forEach(drawEnemySprite);
    epicHeavies.forEach(drawEpicHeavy);
    if(miniBoss){
      ctx.save();applyEnemyPose(miniBoss,false);
      drawNativeFracturedBody(miniBoss,()=>paintMiniBossNativeBody(miniBoss));
      ctx.restore();drawMiniBossFireFlash(miniBoss)
    }
    if(boss&&!boss.hidden){
      const d=boss.def,c=boss.epic?(boss.epicId===0?'#ee4cff':'#78ff56'):(boss.phase===1?d.c1:d.c2),hit=boss.hitFlash||0,frame=Math.floor(boss.clock*5)%2,row=boss.epic?0:boss.phase-1,size=boss.epic?292:boss.type===4?262:boss.type===5?232:boss.type===6?prismWardenRenderWidth:boss.type===7?gravebellRenderSize:boss.type===8?solarHydraRenderSize:boss.type===9?omegaHeartRenderSize:224;
      if(boss.laser?.t<.72)drawBossLaser(boss);
      ctx.save();applyEnemyPose(boss);
      const rendered=drawNativeFracturedBody(boss,()=>paintNativeBossBody(boss,hit));
      if(!rendered){ctx.fillStyle=hit>0?'#ffffff':c;const arms=boss.epic?10+boss.phase*2:boss.phase===1?d.arms1:d.arms2;for(let i=0;i<arms;i++){ctx.rotate(Math.PI*2/arms);const length=58+(boss.type%4)*7+(boss.phase>1?12:0);ctx.fillRect(-6-(boss.type%3),-70-length/2,12+(boss.type%3)*2,length)}poly(0,0,boss.phase===1?70:67,boss.epic?10:d.sides,boss.clock*.08);ctx.fill()}else if(hit>0&&!boss.epic&&boss.type>9)sheetCell(bossSprites[boss.type],frame,row,2,2,0,0,size,size,Math.min(1,hit*9),'brightness(5) saturate(0)');
      ctx.restore();if(boss.laser?.t>=.72)drawBossLaser(boss);drawWeakPoints(boss);if(boss.type===0)drawBloodstarAttackCue(boss);ctx.save();ctx.textAlign='center';
      if(boss.intro>0){const introMax=boss.epic?3:2.4;ctx.globalAlpha=Math.max(0,Math.min(1,(introMax-boss.intro)*2,boss.intro));ctx.fillStyle='#ffffff';ctx.font='700 12px sans-serif';ctx.fillText(`WAVE ${wave} // ${boss.epic?'EPIC ANOMALY':'APEX SIGNATURE'}`,W/2,H*.38);ctx.fillStyle=bossReadoutColor(boss);ctx.shadowBlur=24;ctx.shadowColor=bossReadoutColor(boss);ctx.font='700 34px sans-serif';ctx.fillText(d.name,W/2,H*.47);ctx.shadowBlur=0}
      if(boss.phaseFlash>0){ctx.globalAlpha=Math.min(1,boss.phaseFlash);ctx.fillStyle='#ffffff';ctx.font='700 30px sans-serif';ctx.fillText(`PHASE ${boss.phase} // PATTERN SHIFT`,W/2,H*.48)}ctx.restore()
    }
    bossFragments.forEach(drawBossFragment);
    debris.forEach(d=>{ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=Math.min(1,d.life/.25,d.life/d.max*2);ctx.fillStyle='#111722';ctx.strokeStyle=d.color;ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor=d.color;poly(0,0,d.size,d.shape,.2);ctx.fill();ctx.stroke();ctx.fillStyle='#d9e4ec88';ctx.fillRect(-d.size*.25,-d.size*.45,d.size*.5,1.5);ctx.restore()});
    const readabilityAnchors=buildCombatReadabilityAnchors();
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,Math.min(1,p.life/(p.max||.7)))*(p.damageSmoke?(settings.clearCombat?.18:.72):p.smoke?(settings.clearCombat?.12:.4):1)*smokeReadabilityScale(p,readabilityAnchors);if(p.damageSmoke)drawDamageSmoke(p);else{ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.s,p.s)}});
    ctx.globalAlpha=1;pickups.forEach(p=>drawPickupSprite(p));shots.forEach(drawPlayerShot);ctx.shadowBlur=0;drawWallWarnings();enemyShots.forEach(drawHostileShot);
    if(!studio){drawPlayerAndPod();drawCollisionGuide();enemyShots.forEach(drawHostileWarning)}
    ctx.restore();if(studio)drawBossStatus();else drawForeground()
  }
  function stageCountdown(stage){const first=stage.id===1&&wave===1;return stagePostEliteClock>=0?`${Math.max(0,Math.ceil((first?LEVEL_ONE_POST_TIME:STAGE_POST_ELITE_TIME)-stagePostEliteClock))}s POST-ELITE RUN`:`${Math.max(0,Math.ceil((first?LEVEL_ONE_ELITE_TIME:STAGE_ELITE_TIME)-t))}s TO ELITE`}
  function inspectionFrame(e){
    if(e.kind==='mini')return miniBossFrame(e);
    if(e.epic)return epicAnimationState(e).drawFrame;
    return e.type===0?bloodstarAnimationState(e).frame:e.type===1?twinMawFrame(e):e.type===2?helixFrame(e):e.type===3?riftFrame(e):e.type===4?ironBloomFrame(e):lateBossMaterialFrame(e).frame
  }
  function setInspectionMaterial(mode='closed'){
    if(!artInspection)return;artInspection.mode=mode;const e=artInspection.target;
    e.weakOpen=['exposed','damaged','destroyed'].includes(mode);e.weakTelegraph=mode==='opening'?.28:0;e.coreAperture=e.weakOpen?1:mode==='opening'?.2:0;e.hitFlash=0;
    for(const node of activeWeakNodes(e)){node.destroyed=mode==='destroyed';node.hp=node.max*(mode==='destroyed'?0:mode==='damaged'?.32:1);node.hitTime=-100;node.detached=node.destroyed}
    const nodes=activeWeakNodes(e);e.hp=nodes.reduce((total,node)=>total+node.hp,0)+(e.kind==='boss'?(e.epic?e.max*(1-e.phase*.25):e.phase===1?e.max*.5:0):0);
    document.querySelectorAll('[data-art-state]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.artState===mode)));refreshArtInspection()
  }
  function refreshArtInspection(){
    if(!artInspection)return;const e=artInspection.target;
    $('#art-inspector-name').textContent=e.def.name+' / MATERIAL & MOTION';
    $('#art-inspector-status').textContent=`${artInspection.mode.toUpperCase()} / POSE ${String(inspectionFrame(e)+1).padStart(2,'0')}${e.kind==='boss'?' / PHASE '+e.phase:''}`;
    $('#art-motion-btn').textContent=artInspection.motion?'FREEZE MOTION':'PLAY MOTION';$('#art-stage-btn').textContent=artInspection.isolate?'SHOW STAGE':'STUDIO BACKDROP';$('#art-phase-btn').disabled=e.kind!=='boss';hud()
  }
  function advanceArtInspection(dt){
    if(!artInspection)return;const e=artInspection.target;e.clock+=dt;t+=dt;
    if(e.kind==='boss'&&!e.epic){if(e.type===3){const period=e.phase===2?1.25:1.3;e.cool=period-e.clock%period}else if(e.type===4){e.attackCycle=1;e.ironCycle=e.clock%(e.phase===2?.86:1.05)}else if(e.type===5){e.voidAnimWindow=.5;e.voidAnimDuration=2.8;e.chargeWindow=1.35-e.clock%1.35}}
    emitWeakSmoke(e,dt);updateParticles(dt);
    refreshArtInspection()
  }
  function openArtInspection(){
    const e=boss||miniBoss;if(!bossLab||!e||!['playing','paused'].includes(state))return;
    const arrays=e.kind==='mini'?[e.weakNodes]:e.epic?e.weakNodesByPhase:[e.weakNodes1,e.weakNodes2],backup={};
    for(const key of ['x','y','clock','phase','hp','intro','weakOpen','weakTelegraph','hitFlash','phaseFlash','coreAperture','cool','attackCycle','ironCycle','chargeWindow','voidAnimWindow','voidAnimDuration'])backup[key]=e[key];
    artInspection={target:e,previous:state,time:t,backup,arrays:arrays.map(nodes=>nodes.map(node=>({...node}))),motion:false,mode:'closed',isolate:true,effects:{enemyShots,shots,particles,debris,bossFragments,pickups}};
    e.x=W*.65;e.y=H*.5;e.intro=0;e.phaseFlash=0;enemyShots=[];shots=[];particles=[];debris=[];bossFragments=[];pickups=[];
    state='art';clearInput();pauseMusic();show('');$('#art-inspector').hidden=false;$('#game-shell').dataset.artView='true';setInspectionMaterial('closed');focusMenuControl()
  }
  function closeArtInspection(){
    if(!artInspection)return;const saved=artInspection,e=saved.target;Object.assign(e,saved.backup);
    const arrays=e.kind==='mini'?[e.weakNodes]:e.epic?e.weakNodesByPhase:[e.weakNodes1,e.weakNodes2];arrays.forEach((nodes,i)=>nodes.forEach((node,j)=>{for(const key of Object.keys(node))delete node[key];Object.assign(node,saved.arrays[i][j])}));
    t=saved.time;({enemyShots,shots,particles,debris,bossFragments,pickups}=saved.effects);state=saved.previous;artInspection=null;$('#art-inspector').hidden=true;$('#game-shell').dataset.artView='false';show(state==='paused'?'pause':'');if(state==='playing')resumeMusic();hud()
  }
  $('#art-inspect-btn').onclick=openArtInspection;$('#art-close-btn').onclick=closeArtInspection;
  $('#art-motion-btn').onclick=()=>{if(artInspection){artInspection.motion=!artInspection.motion;refreshArtInspection()}};
  $('#art-step-btn').onclick=()=>advanceArtInspection(1/30);
  $('#art-stage-btn').onclick=()=>{if(artInspection){artInspection.isolate=!artInspection.isolate;refreshArtInspection()}};
  $('#art-phase-btn').onclick=()=>{if(artInspection?.target.kind==='boss'){const e=artInspection.target;e.phase=e.phase%(e.epic?4:2)+1;setInspectionMaterial(artInspection.mode)}};
  document.querySelectorAll('[data-art-state]').forEach(button=>button.onclick=()=>setInspectionMaterial(button.dataset.artState));
  const hudElements=new Map(),hudValues=new Map();
  function hudElement(id){if(!hudElements.has(id))hudElements.set(id,$('#'+id));return hudElements.get(id)}
  function hudText(id,value){if(hudValues.get(id)===value)return;hudValues.set(id,value);hudElement(id).textContent=value}
  function hud(){
    const directBossLab=bossLab&&!bossLabLevel,labTotal=bossLabEpic?epicBossTypes.length:bossTypes.length,labAction=boss?.epic?(boss.ritual?'BREAK GUARDIAN':'NEXT PHASE'):'NEXT',stage=currentStage(),dose=Math.round(player?.dose||0),charge=Math.round((player?.charge||0)*100);
    const force=player?.pod.owned?`${(player.laserColor||'force').toUpperCase()} L${player.laserLevel} / ${player.pod.mode==='docked'?player.pod.dockSide.toUpperCase():player.pod.mode==='returning'?'RECALLING':'DEPLOYED'}`:'FORCE OFFLINE';
    const encounter=boss||miniBoss,objective=encounter?(boss?.ritual?'BREAK THE ACTIVE GUARDIAN':encounter.intro>0?'SIGNATURE ACQUIRED':encounter.weakOpen?'FIRE AT EXPOSED CORES':encounter.weakTelegraph>0?'CORES OPENING / PREPARE FIRE':'ARMOR // 25% DAMAGE / AIM FOR CORES'):stageApexIntro>=0?'APEX SIGNAL LOCKED':victoryDelay?'SIGNATURE CLEARED':!player?.pod.owned?'RECOVER A COLORED CRYSTAL':stageCountdown(stage);
    hudText('score',Math.max(0,score|0).toString().padStart(6,'0'));
    hudText('loot-count',bossLab?'TEST MODE':`SALVAGE ${runLoot.length}`);
    hudText('level',directBossLab?`${bossLabMini?'ELITE LAB':bossLabEpic?'EPIC BOSS LAB':'BOSS LAB'} ${bossLabIndex+1} / ${labTotal}`:!bossLab&&runMode==='rush'?`RUSH / APEX ${String(wave).padStart(2,'0')} OF 10`:!bossLab&&runMode==='replay'?`MISSION REPLAY / ${String(stage.id).padStart(2,'0')} ${stage.name}`:`${String(stage.id).padStart(2,'0')} / ${stage.name}${bossLabLevel?' / DEV LEVEL':''}`);
    hudText('mission-status',directBossLab?`${objective} · [N] ${labAction}`:`${objective} · RANK ${player?.rank||1}`);
    if(hudValues.get('charge-width')!==charge){hudValues.set('charge-width',charge);hudElement('xp-bar').style.width=`${charge}%`}
    if(hudValues.get('dose-width')!==dose){hudValues.set('dose-width',dose);hudElement('dose-bar').style.width=`${dose}%`}
    hudText('charge-label',charge>=100?'FULL CHARGE / RELEASE':charge>=24?`CHARGED ${charge}% / RELEASE`:`CHARGE / HOLD ${inputLabel('fire')}`);
    hudElement('charge-label').closest('.charge-meter').classList.toggle('ready',charge>=100);
    hudText('dose-label',dose>=100?`DELTA READY [${inputLabel('delta')}]`:`DOSE ${dose}%`);
    hudElement('dose-label').closest('.dose-meter').classList.toggle('ready',dose>=100);
    hudText('combat-loadout',`${force} · MISSILES ${player?.missileLevel||0} · BITS ${player?.bits||0}${player?.focus?' · PRECISION':player?.lootSurge>0?' · SURGE':''}`);
    const maxHp=Math.max(0,Math.trunc(player?.maxHp||0)),hp=clamp(Math.trunc(player?.hp||0),0,maxHp);
    hudText('health','◆'.repeat(hp)+'◇'.repeat(maxHp-hp));hudText('hull-label',hp===1?'HULL CRITICAL':'HULL');hudElement('health').classList.toggle('critical',hp===1);hudElement('health').classList.toggle('hit',player.hullHit>0);hudElement('shield-status').classList.toggle('shield-hit',player.shieldHit>0);
    hudText('shield-status',`SHIELD ${player?.shield||0}`);
    $('#game-shell').dataset.artTest=String(bossLab&&!trainingSession&&!!(boss||miniBoss)&&['playing','paused'].includes(state));
    $('#game-shell').dataset.playing=String(state==='playing'||state==='paused'||state==='skilltree');
  }
  addEventListener('flightdeckopen',()=>{if(state==='playing')pause();else{clearInput();pauseMusic()}});
  $('#flight-deck')?.addEventListener('close',()=>{resumeMusic();resetMenuNavigation();focusMenuControl(null,true)});
  function formatInputLesson(lesson){
    const move=inputDevice==='controller'?'the left stick or the movement buttons below':`your movement keys (${['up','left','down','right'].map(inputLabel).join(' / ')})`;
    // Substitute once so a bound C, Q or Shift label is never rewritten as
    // another action. Explicit action rows also cover lessons without key prose.
    const convert=text=>String(text).replace(/\{(move|fire|precision|force|mount|delta|pause|tree)\}|WASD or the arrow keys|WASD \/ ARROWS|WASD|Z, Space,? or X|Z \/ SPACE \/ X|\b(?:Shift|SHIFT|C|V|Q|T)\b/g,(token,action)=>action?(action==='move'?move:inputLabel(action)):token.startsWith('WASD')?move:token.startsWith('Z')?inputLabel('fire'):inputLabel(({Shift:'precision',SHIFT:'precision',C:'force',V:'mount',Q:'delta',T:'tree'})[token]));
    const actions=lesson.inputActions||({move:['move','precision'],fire:['fire'],force:['move','fire'],mount:['force','mount'],spectrum:['fire','move'],support:['fire','move'],delta:['force','delta'],cores:['fire','precision','move'],salvage:['move'],synergy:[],progression:['tree']})[lesson.id]||[];
    const labels={up:'MOVE UP',left:'MOVE LEFT',down:'MOVE DOWN',right:'MOVE RIGHT',fire:'FIRE / HOLD & RELEASE',precision:'PRECISION FLIGHT',force:'DEPLOY / RECALL FORCE',mount:'FRONT / REAR MOUNT',delta:'DELTA AT 100% DOSE',tree:'INSPECT RUN BUILD',pause:'PAUSE'};
    const allBindings=action=>(controlBindings[inputDevice][action]||[]).map(inputDevice==='controller'?bindingsAPI.labelButton:bindingsAPI.labelKey).join(inputDevice==='controller'?' or ':' / '),inputs=[];
    for(const action of [...new Set([...actions,'pause'])]){
      if(action==='move'){
        if(inputDevice==='controller')inputs.push({action:'move',label:'MOVE',binding:'Left stick (always available)'});
        for(const direction of ['up','left','down','right'])inputs.push({action:direction,label:labels[direction],binding:allBindings(direction)});
      }else inputs.push({action,label:labels[action],binding:allBindings(action)});
    }
    return{...lesson,copy:convert(lesson.copy),tip:convert(lesson.tip),keys:lesson.keys.map(convert),goals:lesson.goals.map(convert),inputs,inputHeading:inputDevice==='controller'?'YOUR CONTROLLER BUTTONS':'YOUR KEYBINDS',completeCopy:inputDevice==='controller'?'Practice complete. Press A / Cross to continue.':'Practice complete. Select Continue when you are ready.'};
  }
  function updateControlHints(){
    $('#game-shell').dataset.inputDevice=inputDevice;
    $('#combat-hint').textContent=`${inputLabel('force')} FORCE · ${inputLabel('mount')} FRONT / REAR · ${inputLabel('delta')} DELTA · ${inputLabel('pause')} PAUSE`;
    $('#tree-btn').textContent=`${streamlined()?'RUN PERKS':'SKILL TREE'} [${inputLabel('tree')}]`;$('#tree-btn').setAttribute('aria-label',streamlined()?'Inspect run perks':'Open skill tree');$('#pause-btn').textContent=`PAUSE [${inputLabel('pause')}]`;
    canvas.setAttribute('aria-label',`Starfighter: Last Signal game canvas. ${inputDevice==='controller'?'Left stick or D-pad':'Movement keys'} to fly. ${inputLabel('fire')} to fire or charge. ${inputLabel('precision')} for precision flight. ${inputLabel('pause')} to pause.`);
    for(const el of document.querySelectorAll('[data-binding-hint]'))el.textContent=el.dataset.bindingHint==='move'?['up','left','down','right'].map(id=>bindingsAPI.labelKey(controlBindings.keyboard[id][0])).join(' / '):(controlBindings.keyboard[el.dataset.bindingHint]||[]).map(bindingsAPI.labelKey).join(' / ');
    trainingController?.refreshInputHints?.();onboardingController?.refreshInputHints?.();
  }
  function formatOnboardingHint(hint){
    if(streamlined()&&hint.title==='ONE FIELD MODULE')return{title:'RECOVERY SERVICE',copy:'Choose one repair, shield or Delta recharge. It applies once. Recovered gear is waiting in the Garage.'};
    if(streamlined()&&hint.title==='ONE DOCTRINE POINT')return{title:'THREE RUN PERK SLOTS',copy:'Choose one perk for this run. At three active perks, replace one or keep your build. Your rolled gear stays in the Garage.'};
    return{...hint,copy:hint.copy.replace(/\bQ\b/g,inputLabel('delta'))};
  }
  function resetMenuNavigation(){padNavDirection='';padNavNext=0;padNavRoot=null}
  function visibleMenuControl(element,root){
    return !!(element&&root?.contains?.(element)&&!element.disabled&&!element.closest('[hidden],[inert],[aria-hidden="true"]')&&element.getClientRects?.().length&&getComputedStyle(element).visibility!=='hidden');
  }
  function focusMenuControl(preferred=null,force=false){
    if(!force&&inputDevice!=='controller')return;
    const root=controllerMenuRoot();if(!root)return;
    if(!visibleMenuControl(preferred,root)){
      if(visibleMenuControl(document.activeElement,root))return;
      const choices=state==='skilltree'?['[data-perk]:not(:disabled)','[data-node]:not(:disabled)']:state==='profiles'?['.profile-slot.active']:state==='briefing'?['#briefing-training-btn','#briefing-depart-btn']:[];
      preferred=choices.map(selector=>root.querySelector(selector)).find(element=>visibleMenuControl(element,root));
    }
    if(preferred){preferred.focus({preventScroll:true});preferred.scrollIntoView?.({block:'nearest',inline:'nearest'})}
    else window.StarfighterControlsUI.focusFirst(root);
  }
  function setInputDevice(device){if(inputDevice===device)return;inputDevice=device;updateControlHints();if(device==='controller')focusMenuControl()}
  function applyControlBindings(next){controlBindings=bindingsAPI.normalize(next);clearInput();updateControlHints();const result=bindingsAPI.save(controlsStorage,controlBindings);if(window.STARFIGHTER_TRAINING_SANDBOX&&window.parent!==window&&typeof window.parent?.postMessage==='function')window.parent.postMessage({type:'starfighter-controls-changed',bindings:controlBindings},window.location.origin);return result}
  function openControls(){controlsReturnFocus=document.activeElement;if(state==='playing')pause();else clearInput();if($('#flight-deck')?.open)$('#flight-deck').close();controlsUI?.open();onboardingController?.tick(0)}
  function menuBack(){
    if($('#controls-dialog')?.open){controlsUI.close();return}if($('#flight-deck')?.open){$('#flight-deck').close();return}
    if($('#audio-mixer')?.classList.contains('open')){$('#audio-mixer').classList.remove('open');resetMenuNavigation();focusMenuControl(null,true);return}
    if(state==='art')closeArtInspection();else if(state==='playing'||state==='paused')pause();else if(state==='skilltree')closeSkillTree();else if(state==='briefing')closeMissionBriefing();else if(state==='garage'&&garageIntroContext)finishGarageIntro();else if(state==='garage'&&lossGarageContext)leaveGarage();else if(state==='garage'&&garageRunContext)finishRoundGarage();else if(state!=='menu')goMenu();
  }
  function controllerMenuRoot(){
    if($('#controls-dialog')?.open)return controlsUI.navigationRoot();if($('#flight-deck')?.open)return $('#flight-deck');if($('#audio-mixer')?.classList.contains('open'))return $('#audio-mixer');
    if(state==='art')return $('#art-inspector');if(trainingSession&&state==='playing')return document.querySelector('.sf-training-panel');
    return document.querySelector('.screen.active')||$('#menu');
  }
  function pollController(now=0){
    if(!gamepadController)return;if(trainingFrame||document.hidden||!inputFocused){resetMenuNavigation();padFrame=gamepadController.requireNeutral();return}
    const wasFiring=padFrame.fire,frame=gamepadController.poll();padFrame=frame;controlsUI?.setConnection(frame);
    const activity=frame.rawButtons.length||frame.moveX||frame.moveY;if(activity){const changed=inputDevice!=='controller';setInputDevice('controller');mouse.inside=false;if(menuMusicStates.has(state)&&(changed||Object.values(frame.pressed).some(Boolean)))resumeMusic()}
    const hint=$('#controller-hint');hint.hidden=!frame.connected||inputDevice!=='controller'||state==='playing'&&!trainingController?.canContinue||$('#controls-dialog')?.open;
    const hintText=state==='playing'&&trainingController?.canContinue?`A / Cross: CONTINUE LESSON · ${inputLabel('pause')}: PAUSE`:'STICK / D-PAD NAVIGATE · A / CROSS CONFIRM · B / CIRCLE BACK';if(hint.textContent!==hintText)hint.textContent=hintText;
    if(controlsUI?.captureButtons(frame.rawButtons)||controlsUI?.isCapturing()){resetMenuNavigation();padFrame=gamepadController.requireNeutral();return}
    if(!frame.connected){resetMenuNavigation();return}
    const modal=$('#controls-dialog')?.open||$('#flight-deck')?.open;
    if(!modal&&(state==='playing'&&frame.pressed.pause||state==='paused'&&frame.pressed.menuPause)){pause();return}
    const lessonMenu=trainingSession&&['synergy','progression'].includes(trainingController?.lessonId);
    if(state==='playing'&&!modal&&!lessonMenu){
      resetMenuNavigation();
      if(trainingController?.canContinue&&frame.pressed.confirm){trainingController.advance();clearInput();return}
      if(frame.pressed.force)togglePod();if(frame.pressed.mount)togglePodMount();if(frame.pressed.delta)activateDelta();if(frame.pressed.tree&&!trainingSession){openSkillTree();return}
      if(wasFiring&&!frame.fire&&!keyHeld('fire')&&!mouse.firing)releaseCharge();return;
    }
    // Workshop and menu button presses never become live firing inputs.
    padFrame={...frame,fire:false,precision:false,moveX:0,moveY:0};
    const root=controllerMenuRoot();if(root!==padNavRoot){resetMenuNavigation();padNavRoot=root;focusMenuControl()}if(frame.pressed.back){menuBack();padFrame=gamepadController.requireNeutral();return}
    const direction=frame.nav.y?(frame.nav.y<0?'up':'down'):frame.nav.x?(frame.nav.x<0?'left':'right'):'';
    if(direction&&(direction!==padNavDirection||now>=padNavNext)){window.StarfighterControlsUI.navigate(root,direction);padNavNext=now+(direction===padNavDirection?110:330)}padNavDirection=direction;
    if(frame.pressed.confirm){window.StarfighterControlsUI.activate(root);padFrame=gamepadController.requireNeutral()}
  }
  let simulationAccumulator=0,lastIdleRender=-100;
  const SIMULATION_STEP=1/120;
  function loop(n){
    const elapsed=last?clamp((n-last)/1000,0,.1):0;last=n;
    try{
      pollController(n);
      const diagnosticsOn=diagnostics.active&&state==='playing',diagnosticsStart=diagnosticsOn?performance.now():0;
      if(state==='playing'){
        simulationAccumulator+=elapsed;
        while(simulationAccumulator+1e-9>=SIMULATION_STEP&&state==='playing'){
          update(SIMULATION_STEP);simulationAccumulator-=SIMULATION_STEP;
        }
      }else{simulationAccumulator=0;if(state==='art'&&artInspection?.motion)advanceArtInspection(elapsed)}
      onboardingController?.tick(elapsed);
      const artAvailable=String(bossLab&&!!(boss||miniBoss)&&['playing','paused'].includes(state));if($('#game-shell').dataset.artTest!==artAvailable)$('#game-shell').dataset.artTest=artAvailable;
      const playing=state==='playing'||state==='paused'||state==='skilltree';
      if($('#game-shell').dataset.playing!==String(playing))$('#game-shell').dataset.playing=String(playing);
      const diagnosticsMid=diagnosticsOn?performance.now():0;
      if(state==='playing'||state==='art'||n-lastIdleRender>=100){draw();lastIdleRender=n}
      if(diagnosticsOn&&state==='playing')diagnostics.frame(n,diagnosticsMid-diagnosticsStart,performance.now()-diagnosticsMid);else diagnostics.idle();
    }catch(error){
      console.error('Game loop stopped after an error:',error);clearInput();pauseMusic();
      ctx.fillStyle='#050816';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ff3d81';ctx.font='700 20px sans-serif';ctx.textAlign='center';
      ctx.fillText('SIGNAL INTERRUPTED — RELOAD TO RETRY',W/2,H/2);
      return;
    }
    requestAnimationFrame(loop)
  }
  function pointMouse(e){const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*W/r.width;mouse.y=(e.clientY-r.top)*H/r.height;mouse.inside=mouse.x>=0&&mouse.x<=W&&mouse.y>=0&&mouse.y<=H}
  function toggleMouse(){mouse.move=!mouse.move;storage.setItem('mouseFlight',mouse.move);$('#mouse-btn').textContent=`MOUSE FLIGHT: ${mouse.move?'ON':'OFF'}`}
  const chargeKeyHeld=()=>keyHeld('fire')||padFrame.fire;
  canvas.addEventListener('pointermove',pointMouse);
  canvas.addEventListener('pointerenter',pointMouse);
  canvas.addEventListener('pointerleave',()=>{mouse.inside=false});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||state!=='playing'||mouse.pointerId!=null)return;e.preventDefault();pointMouse(e);mouse.firing=true;mouse.pointerId=e.pointerId;canvas.setPointerCapture?.(e.pointerId)});
  addEventListener('pointerup',e=>{if(e.pointerId!==mouse.pointerId)return;const firing=mouse.firing;mouse.firing=false;mouse.pointerId=null;pointMouse(e);if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(firing&&!chargeKeyHeld())releaseCharge()});
  const cancelPointer=e=>{if(e.pointerId!==mouse.pointerId)return;mouse.pointerId=null;mouse.firing=false;if(!chargeKeyHeld()){if(player)player.charge=0;sfx.stopCharge()}};
  canvas.addEventListener('pointercancel',cancelPointer);canvas.addEventListener('lostpointercapture',cancelPointer);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function pause(){if(state==='playing'){state='paused';$('#pause-save-note').hidden=bossLab||!!trainingSession;show('pause')}else if(state==='paused'&&!document.hidden){state='playing';show('');resumeMusic()}}
  function onboardingAllowed(id){
    if(window.STARFIGHTER_TRAINING_SANDBOX||trainingSession||trainingFrame||garageIntroContext||bossLab||document.hidden||$('#flight-deck')?.open||$('#controls-dialog')?.open)return false;
    if(id==='gear'||id==='synergy')return state==='garage';
    if(!runActive||runMode!=='story')return false;
    if(id==='module')return state==='upgrade';
    if(id==='doctrine')return state==='skilltree'&&!!pendingUpgrade;
    if(id==='delta'&&!(player?.dose>=100)||id==='shield'&&!(player?.shield>0))return false;
    return state==='playing'&&!boss&&!miniBoss&&!victoryDelay&&stageApexIntro<0
  }
  function requestOnboarding(id){
    if(window.STARFIGHTER_TRAINING_SANDBOX||trainingSession||bossLab)return;
    onboardingController?.show(id)
  }
  function acknowledgeOnboarding(id){if(onboardingController?.activeId===id)onboardingController.dismiss()}
  function initializeOnboarding(){
    onboardingController?.dispose();onboardingController=null;
    if(window.STARFIGHTER_TRAINING_SANDBOX||!window.StarfighterOnboarding)return;
    onboardingController=window.StarfighterOnboarding.create({root:$('#game-shell'),formatHint:formatOnboardingHint,getScope:()=>profile,getSeen:()=>profile.progress.onboardingSeen||[],isAllowed:onboardingAllowed,
      getAnchor:id=>['gear','synergy','module','doctrine'].includes(id)?$('#onboarding-'+(id==='gear'||id==='synergy'?'garage':id)+'-anchor'):null,
      remember:id=>{if(!ONBOARDING_IDS.includes(id)||profile.progress.onboardingSeen.includes(id))return;profile.progress.onboardingSeen.push(id);saveProfile('FLIGHT TIP REMEMBERED')}
    })
  }
  function openFlightSchool(continueStory=false,course='full'){
    if(window.STARFIGHTER_TRAINING_SANDBOX||trainingFrame)return;
    trainingController?.close();onboardingController?.close();course=course==='intro'?'intro':'full';
    trainingReturn={profile,continueStory,course,briefing:pendingBriefing};clearInput();pauseMusic();sfx.setMuted(true);
    const overlay=document.createElement('div');overlay.className='training-frame-bar';overlay.style.cssText='position:fixed;inset:0;z-index:3000;background:#060914;color:#b9d1e1;font:12px sans-serif';
    const title=document.createElement('span');title.textContent=course==='intro'?'FIRST FLIGHT · FIVE ESSENTIAL DRILLS':'FLIGHT SCHOOL · OPTIONAL PRACTICE';title.style.cssText='position:absolute;top:13px;left:16px;letter-spacing:.12em';
    const back=document.createElement('button');back.className='training-frame-return';back.textContent=pendingBriefing?'BACK TO BRIEFING':'RETURN TO MENU';back.style.cssText='position:absolute;right:12px;top:5px;padding:7px 12px;border:1px solid #37596d;background:#102336;color:#e5faff;font:700 10px sans-serif;cursor:pointer';back.onclick=()=>closeFlightSchool(false);
    const frame=document.createElement('iframe');frame.title='Flight School — guided practice';frame.src=`flight-school.html?v=170&course=${course}&muted=${muted?1:0}&music=${musicVolume}&sfx=${sfxVolume}&text=${uiText.value}&device=${inputDevice}&controls=${encodeURIComponent(JSON.stringify(controlBindings))}`;frame.allow='autoplay';frame.style.cssText='position:absolute;top:40px;left:0;width:100%;height:calc(100% - 40px);border:0;background:#060914';
    trainingFrame=frame;trainingOverlay=overlay;overlay.append(title,back,frame);document.body.appendChild(overlay);frame.focus?.();
  }
  function closeFlightSchool(completed=false){
    if(!trainingFrame)return;const prior=trainingReturn;trainingOverlay?.remove();trainingOverlay=null;trainingFrame=null;trainingReturn=null;trainingController?.close();$('#game-shell').dataset.training='false';sfx.setMuted(muted||document.hidden);
    if(completed&&prior?.profile===profile){if(prior.course==='intro')profile.progress.introComplete=true;else{profile.progress.trainingComplete=true;profile.progress.onboardingSeen=[...ONBOARDING_IDS]}saveProfile(prior.course==='intro'?'FIRST FLIGHT COMPLETE':'FLIGHT SCHOOL COMPLETE')}
    if(completed&&prior?.course==='intro'&&prior.profile===profile&&beginGarageIntro(prior.briefing)){resumeMusic();return}
    if(completed&&prior?.continueStory&&prior.briefing===pendingBriefing){departMission();return}
    resumeMusic();focusMenuControl(state==='briefing'?$('#briefing-depart-btn'):null,true)
  }
  function trainingNote(type,payload={}){
    if(!trainingSession)return;
    const seen=trainingSession.observed,first=!seen.has(type);seen.add(type);if(payload.type)seen.add(`${type}:${payload.type}`);if(payload.color)seen.add(`${type}:${payload.type||''}:${payload.color}`);
    if(type==='shot'&&payload.color)seen.add(`shot:${payload.color}`);
    if(type==='podBlock'&&trainingSession.id==='mount'&&(seen.has('deployed')||player.pod.mode==='deployed')){trainingController?.tick(0,{x:player.x,y:player.y,podMode:player.pod.mode,dockSide:player.pod.dockSide,dose:player.dose});seen.add('mountBlock');enemyShots.length=0}
    if(first&&type==='armorHit'&&trainingSession.id==='cores'&&miniBoss){miniBoss.weakOpen=false;miniBoss.weakTelegraph=.52;miniBoss.weakTimer=0;miniBoss.coreAperture=0}
    trainingController?.note(type,payload)
  }
  function beginTrainingPractice(){
    if(!window.STARFIGHTER_TRAINING_SANDBOX)return false;
    trainingSession={id:'move',clock:0,shotClock:0,observed:new Set()};settings.clearCombat=true;
    $('#game-shell').dataset.training='true';$('#tree-btn').hidden=true;$('#art-inspect-btn').hidden=true;
    state='playing';show('');return true;
  }
  function setupTrainingLesson(id){
    if(!trainingSession)return;
    reset(CLASSIC_RULESET);bossLab=true;bossLabLevel=false;bossLabMini=false;bossLabEpic=false;runActive=false;runMode='story';wave=1;miniBossSpawned=true;stageIntro=0;stageHazardClock=999;stageApexIntro=-1;
    trainingSession={id,clock:0,shotClock:0,observed:new Set()};$('#loot-toast').textContent='';player.x=155;player.y=H/2;player.hp=player.maxHp=3;player.inv=0;player.shield=0;player.skillPoints=0;
    if(['mount','spectrum','support','delta','cores'].includes(id)){player.pod.owned=true;player.pod.mode='docked';player.pod.dockSide=player.pod.returnSide='front';player.laserColor='red';player.laserLevel=1;player.pod.x=player.x+50;player.pod.y=player.y}
    if(id==='delta')player.dose=80;
    if(id==='cores'){
      makeMiniBoss();Object.assign(miniBoss,{x:455,y:H/2,intro:0,cool:999,clock:0,weakOpen:false,weakTimer:999,coreAperture:0,flight:{phase:'hold',time:0,rest:999,duration:1,leg:0,vx:0,vy:0}});
      player.pod.owned=false;player.laserColor=null;player.laserLevel=0
    }
    state='playing';show('');$('#hud').classList.remove('hidden');playLevelMusic(1);hud()
  }
  function updateTrainingScene(dt){
    const school=trainingSession;if(!school)return;school.clock+=dt;school.shotClock-=dt;player.x=Math.min(player.x,W*(school.id==='mount'?.4:.58));
    if(player.pod.mode==='deployed')school.observed.add('deployed');
    const has=key=>school.observed.has(key),supply=(type,color)=>{
      const key=color?`pickup:${type}:${color}`:`pickup:${type}`;if(has(key)||pickups.some(p=>!p.dead&&p.type===type&&(!color||p.color===color)))return;
      const item={x:Math.min(510,player.x+110),y:player.y,r:type==='gear'?13:11,type,color,spin:0};
      if(type==='gear')item.gear=normalizeGearItem({...generateGear(0,1,'Training',{source:'PRACTICE ASTERPRINT'}),slot:'weapon',gunVariant:'siege',stats:{chargePct:2},alignment:'AEGIS'});
      pickups.push(item)
    };
    if(school.id==='force')supply('crystal','red');
    if(school.id==='spectrum'){if(!has('pickup:crystal:blue'))supply('crystal','blue');else if(has('shot:blue'))supply('crystal','yellow')}
    if(school.id==='support'){
      if(!has('pickup:missile'))supply('missile');else if(!has('pickup:bit'))supply('bit');else supply('shield')
    }
    if(school.id==='salvage'&&!has('gear'))supply('gear');
    if(school.id==='fire'&&!enemies.some(e=>!e.dead))enemies.push({x:470,y:H/2,r:17,hp:60,maxHp:60,speed:0,phase:0,cool:999,role:'trainingDummy',originY:H/2,type:'turret',stageStyle:'drift',threat:sectorThreat(1),coolScale:1,c:'#4ef5ff'});
    if(school.id==='spectrum'&&!enemies.some(e=>!e.dead))enemies.push({x:480,y:H*.32,r:14,hp:60,maxHp:60,speed:0,phase:0,cool:999,role:'trainingDummy',originY:H*.32,type:'drone',stageStyle:'drift',threat:sectorThreat(1),coolScale:1,c:'#4ef5ff'});
    if(school.shotClock<=0){
      let origin=null,target=null;
      if(school.id==='mount'&&player.pod.owned&&!has('mountBlock')){origin={x:620,y:player.y};target={x:player.x,y:player.y}}
      if(school.id==='delta'&&player.dose<100&&!has('delta')){origin={x:570,y:player.y};target={x:player.x,y:player.y}}
      if(school.id==='support'&&player.bits>0&&!has('bitBlock')){const bit=bitPositions()[0];origin={x:570,y:bit.y};target=bit}
      else if(school.id==='support'&&player.shield>0&&has('bitBlock')&&!has('shieldHit')){origin={x:Math.max(20,player.x-100),y:player.y};target=player}
      if(origin){const angle=Math.atan2(target.y-origin.y,target.x-origin.x);enemyShots.push({x:origin.x,y:origin.y,vx:Math.cos(angle)*210,vy:Math.sin(angle)*210,r:5,damage:1})}
      school.shotClock=school.id==='delta'?.28:.8
    }
  }
  function trainingTick(dt){
    if(!trainingSession)return;trainingController?.tick(dt,{x:player.x,y:player.y,precision:player.focus,podMode:player.pod.mode,dockSide:player.pod.dockSide,laserColor:player.laserColor,dose:player.dose,paused:state!=='playing'||document.hidden});
    hudText('level','FLIGHT SCHOOL');hudText('loot-count','PRACTICE · NO SAVED REWARDS');hudText('mission-status','SAFE SIMULATOR · FOLLOW THE LESSON');$('#art-inspect-btn').hidden=true;$('#tree-btn').hidden=true
  }
  function finishTrainingPractice(result){
    if(!window.STARFIGHTER_TRAINING_SANDBOX||!trainingSession)return;
    trainingController?.close();clearInput();pauseMusic();sfx.setMuted(true);trainingSession=null;$('#game-shell').dataset.training='false';$('#hud').classList.add('hidden');state='menu';
    if(window.parent!==window)window.parent.postMessage({type:'starfighter-flight-school-finished',completed:!!result.completed},window.location.origin);
    else{state='menu';goMenu()}
  }
  function initializeFlightSchool(){
    if(!window.STARFIGHTER_TRAINING_SANDBOX){trainingController?.close();trainingController=null;$('#game-shell').dataset.training='false';if($('#training-menu-btn'))$('#training-menu-btn').onclick=()=>openFlightSchool(false,'full');return}
    if(!window.StarfighterTraining)return;
    trainingController=window.StarfighterTraining.create({root:$('#game-shell'),begin:beginTrainingPractice,setupLesson:setupTrainingLesson,finish:finishTrainingPractice,pauseToggle:pause,formatLesson:formatInputLesson,isPractice:()=>!!trainingSession&&['playing','paused'].includes(state),isPaused:()=>state==='paused'||document.hidden});
    const course=typeof URLSearchParams==='function'&&new URLSearchParams(window.location.search).get('course')==='intro'?'intro':'full';
    trainingController.start({continueStory:false,course})
  }
  addEventListener('message',event=>{
    if(window.STARFIGHTER_TRAINING_SANDBOX&&event.source===window.parent&&event.origin===window.location.origin&&event.data?.type==='starfighter-ui-text-save-result'){uiText.setSaveResult({value:event.data.value,saved:event.data.saved===true});return}
    if(window.STARFIGHTER_TRAINING_SANDBOX&&event.source===window.parent&&event.origin===window.location.origin&&event.data?.type==='starfighter-controls-save-result'){controlsUI?.setSaveResult({saved:event.data.saved===true});return}
    if(!trainingFrame||event.source!==trainingFrame.contentWindow||event.origin!==window.location.origin)return;
    if(event.data?.type==='starfighter-ui-text-changed'&&window.StarfighterUiText.choices.includes(event.data.value)){const result=uiText.set(event.data.value);trainingFrame.contentWindow?.postMessage?.({type:'starfighter-ui-text-save-result',value:result.value,saved:result.saved},window.location.origin);return}
    if(event.data?.type==='starfighter-controls-changed'){
      if(!bindingsAPI.save({setItem(){}},event.data.bindings).saved)return;
      const result=applyControlBindings(event.data.bindings);trainingFrame.contentWindow?.postMessage?.({type:'starfighter-controls-save-result',saved:result.saved},window.location.origin);return;
    }
    if(event.data?.type==='starfighter-flight-school-finished')closeFlightSchool(!!event.data.completed)
  });
  function restartCurrentRun(){if(retryLastCheckpoint())return;restartRunFromStart()}
  function restartRunFromStart(){if(trainingSession){trainingController?.retry?.();return}securePendingRunLoot();if(bossLabMini){startMiniBossLab(bossLabIndex);return}bossLab?(bossLabLevel?startLevelLab(bossLabIndex):bossLabEpic?startEpicBossLab(bossLabIndex,bossLabRunAll):startBossLab(bossLabIndex,bossLabRunAll)):start(runMode,runStartWave,runRuleset)}
  const editingTarget=target=>target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
  addEventListener('keydown',e=>{
    if(menuMusicStates.has(state))resumeMusic();
    if(state==='art'){if(e.code==='Escape'||e.code==='F2'){e.preventDefault();closeArtInspection()}return}
    if(e.code==='F2'&&!e.repeat&&bossLab&&!trainingSession){e.preventDefault();openArtInspection();return}
    if($('#flight-deck')?.open||$('#controls-dialog')?.open)return;
    setInputDevice('keyboard');
    if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='Escape'&&state!=='playing'){e.preventDefault();if(!e.repeat)menuBack();return}
    if(editingTarget(e.target))return;
    if(e.target?.closest?.('button')&&['Space','Enter'].includes(e.code))return;
    const actions=bindingsAPI.actionsForKey(controlBindings,e.code);
    if(e.repeat&&(!keys.has(e.code)||actions.some(action=>['pause','force','mount','delta','mouse','tree'].includes(action))||e.code==='KeyN'))return;
    if(state==='playing'){keys.add(e.code);if(actions.length||['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault()}
    if(actions.includes('pause')&&['playing','paused'].includes(state)){e.preventDefault();pause();return}
    if(actions.includes('force'))togglePod();if(actions.includes('mount'))togglePodMount();if(actions.includes('delta'))activateDelta();if(actions.includes('mouse'))toggleMouse();
    if(e.code==='KeyN'&&!actions.length&&bossLab&&!trainingSession&&state==='playing')skipBossLabSegment();
    if(actions.includes('tree')&&!trainingSession){if(state==='playing')openSkillTree();else if(state==='skilltree')closeSkillTree()}
  });
  addEventListener('keyup',e=>{const wasHeld=keys.delete(e.code);if(wasHeld&&controlBindings.keyboard.fire.includes(e.code)&&!chargeKeyHeld()&&!mouse.firing)releaseCharge()});
  $('#pause-btn').onclick=pause;
  $('#story-mode-btn').onclick=()=>selectRunMode('story');$('#rush-mode-btn').onclick=()=>selectRunMode('rush');$('#load-game-btn').onclick=loadGame;$('#missions-menu-btn').onclick=openMissionSelect;$('#mission-back-btn').onclick=goMenu;$('#complete-retry-btn').onclick=()=>start(runMode,runStartWave,runRuleset);$('#complete-menu-btn').onclick=goMenu;
  $('#start-btn').onclick=start;$('#profiles-menu-btn').onclick=openProfiles;$('#profiles-back-btn').onclick=goMenu;$('#new-game-btn').onclick=newGame;$('#retry-btn').onclick=restartCurrentRun;$('#restart-run-btn').onclick=restartRunFromStart;$('#resume-btn').onclick=pause;$('#restart-btn').onclick=restartCurrentRun;$('#pause-menu-btn').onclick=goMenu;$('#menu-btn').onclick=goMenu;$('#garage-menu-btn').onclick=openGarage;$('#garage-btn').onclick=openGarage;$('#garage-launch-btn').onclick=start;$('#garage-back-btn').onclick=leaveGarage;$('#boss-lab-menu-btn').onclick=()=>openBossLab();$('#boss-lab-all-btn').onclick=()=>startBossLab(0,true);$('#epic-boss-lab-all-btn').onclick=()=>startEpicBossLab(0,true);$('#boss-lab-back-btn').onclick=goMenu;$('#sound-btn').onclick=()=>{muted=!muted;storage.setItem('starfighterMuted',muted);soundtrack.muted=muted;sfx.setMuted(muted);if(!muted)resumeMusic();$('#sound-btn').textContent=`SOUND: ${muted?'OFF':'ON'}`};$('#mouse-btn').onclick=toggleMouse;$('#tree-btn').onclick=()=>{if(state==='playing')openSkillTree()};$('#tree-continue').onclick=closeSkillTree;
  $('#garage-save-btn').onclick=()=>{profile.name=($('#profile-name').value.trim()||'LAST SIGNAL PILOT').slice(0,20);saveProfile();renderGarage();renderProfileMenu();$('#profile-save-status').textContent='PROFILE SAVED'};
  $('#start-btn').onclick=launchNewRun;$('#garage-launch-btn').onclick=launchFromGarage;$('#briefing-depart-btn').onclick=departMission;$('#briefing-back-btn').onclick=closeMissionBriefing;$('#upgrade-garage-btn').onclick=openRoundGarage;$('#tree-garage-btn').onclick=openRoundGarage;$('#complete-garage-btn').onclick=openGarage;
  $('#briefing-training-btn').onclick=()=>chooseBriefingIntro(true);$('#briefing-skip-intro-btn').onclick=()=>chooseBriefingIntro(false);
  $('#garage-intro-prev-btn').onclick=()=>moveGarageIntro(-1);$('#garage-intro-next-btn').onclick=()=>moveGarageIntro(1);$('#garage-intro-skip-btn').onclick=finishGarageIntro;
  const audioMixer=$('#audio-mixer'),musicSlider=$('#music-volume'),sfxSlider=$('#sfx-volume');function syncAudioMixer(){musicSlider.value=Math.round(musicVolume*100);sfxSlider.value=Math.round(sfxVolume*100);$('#music-volume-value').textContent=`${musicSlider.value}%`;$('#sfx-volume-value').textContent=`${sfxSlider.value}%`}$('#audio-btn').onclick=()=>{if(state==='playing')pause();audioMixer.classList.toggle('open');resetMenuNavigation();focusMenuControl(audioMixer.classList.contains('open')?musicSlider:null,true)};musicSlider.addEventListener('input',()=>{musicVolume=musicSlider.value/100;applyMusicVolume();storage.setItem('starfighterMusicVolume',musicVolume);$('#music-volume-value').textContent=`${musicSlider.value}%`});sfxSlider.addEventListener('input',()=>{sfx.setVolume(sfxSlider.value/100);storage.setItem('starfighterSfxVolume',sfxVolume);$('#sfx-volume-value').textContent=`${sfxSlider.value}%`});syncAudioMixer();
  function suspendPlay(){if(state==='playing')pause();else clearInput();pauseMusic()}
  addEventListener('blur',()=>{inputFocused=false;suspendPlay()});
  addEventListener('focus',()=>{inputFocused=true;sfx.setMuted(muted||document.hidden);resumeMusic()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendPlay();sfx.setMuted(true)}else{sfx.setMuted(muted);resumeMusic()}});
  addEventListener('pagehide',()=>{inputFocused=false;suspendPlay();securePendingRunLoot();sfx.c?.suspend?.().catch(()=>{})});
  addEventListener('pageshow',()=>{inputFocused=true;sfx.setMuted(muted||document.hidden);resumeMusic()});
  // Browsers may defer title music until the first click or key press.
  document.addEventListener('pointerdown',e=>{setInputDevice('keyboard');if(menuMusicStates.has(state))resumeMusic();if(e.target.closest?.('button'))sfx.tone(690,.045,'square',.012,-160)});
  $('#sound-btn').textContent=`SOUND: ${muted?'OFF':'ON'}`;
  controlsUI=window.StarfighterControlsUI.create({host:$('#controls-dialog'),getBindings:()=>controlBindings,
    onChange:applyControlBindings,
    onCaptureChange:()=>clearInput(),onClose:()=>{clearInput();onboardingController?.tick(0);focusMenuControl(controlsReturnFocus,true)}});
  gamepadController=window.StarfighterGamepad.create({getGamepads:()=>{if(typeof window.navigator?.getGamepads!=='function')throw new Error('Gamepad API unavailable');return window.navigator.getGamepads()},getBindings:()=>controlBindings.controller,
    onDisconnect:()=>{const active=inputDevice==='controller'||padFrame.fire;padFrame=emptyPadFrame();if(active){if(state==='playing')pause();else clearInput();if(player)systemToast('CONTROLLER DISCONNECTED // INPUT CLEARED','#ffd166')}}});
  for(const id of['controls-menu-btn','controls-pause-btn','controls-manual-btn'])$('#'+id).onclick=openControls;
  updateControlHints();
  renderProfileMenu();$('#mouse-btn').textContent=`MOUSE FLIGHT: ${mouse.move?'ON':'OFF'}`;
  reset();state='menu';initializeOnboarding();initializeFlightSchool();if(!trainingSession)resumeMusic();requestAnimationFrame(loop)
})();
