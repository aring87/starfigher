#!/usr/bin/env node
'use strict';

// Dependency-free logic smoke tests. Browser rendering/audio are mocked; use a
// real browser for visual, performance, and listening checks. Nothing here
// changes shipped source, reads real browser saves, or writes player data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const requestedAssets = new Set();
const imageDimensions = new Map();
const pngMaterialPixels = new Map();
const failures = [];
let passed = 0;

function pngDimensions(asset) {
  if (imageDimensions.has(asset)) return imageDimensions.get(asset);
  const filename = path.join(root, asset.split('?')[0]);
  let dimensions = [1024, 1024];
  if (fs.existsSync(filename)) {
    const fd = fs.openSync(filename, 'r');
    try {
      const header = Buffer.alloc(24);
      fs.readSync(fd, header, 0, header.length, 0);
      if (header.toString('ascii', 1, 4) === 'PNG') dimensions = [header.readUInt32BE(16), header.readUInt32BE(20)];
    } finally { fs.closeSync(fd); }
  }
  imageDimensions.set(asset, dimensions);
  return dimensions;
}

// Decode native PNG opacity and brightness for anatomical registration checks.
// This deliberately reads real files rather than the browser drawing mock.
function pngMaterial(asset,includeRgba=false) {
  if(pngMaterialPixels.has(asset)&&(!includeRgba||pngMaterialPixels.get(asset).rgba))return pngMaterialPixels.get(asset);
  const data=fs.readFileSync(path.join(root,asset.split('?')[0]));
  assert.equal(data.toString('ascii',1,4),'PNG');
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20),depth=data[24],color=data[25],interlace=data[28];
  assert.equal(depth,8,'Native atlas fixture must use 8-bit PNG channels');assert.equal(interlace,0,'Native atlas fixture must be noninterlaced');
  const channels=({0:1,2:3,3:1,4:2,6:4})[color];assert.ok(channels,'PNG color type must be supported');
  let palette=null,transparency=null;const chunks=[];
  for(let at=8;at<data.length;){const length=data.readUInt32BE(at),type=data.toString('ascii',at+4,at+8),chunk=data.subarray(at+8,at+8+length);if(type==='IDAT')chunks.push(chunk);else if(type==='PLTE')palette=chunk;else if(type==='tRNS')transparency=chunk;at+=length+12}
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*channels,alpha=new Uint8Array(width*height),light=new Uint8Array(width*height),rgba=includeRgba?new Uint8ClampedArray(width*height*4):null;
  let previous=Buffer.alloc(stride),offset=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
  for(let y=0;y<height;y++){
    const filter=raw[offset++],row=Buffer.allocUnsafe(stride);assert.ok(filter<=4,'PNG scanline filter must be valid');
    for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0,predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);row[x]=(raw[offset++]+predictor)&255}
    for(let x=0;x<width;x++){
      const i=x*channels,p=y*width+x;
      if(color===6){alpha[p]=row[i+3];light[p]=Math.max(row[i],row[i+1],row[i+2])}
      else if(color===2){alpha[p]=transparency&&row[i]===transparency.readUInt16BE(0)&&row[i+1]===transparency.readUInt16BE(2)&&row[i+2]===transparency.readUInt16BE(4)?0:255;light[p]=Math.max(row[i],row[i+1],row[i+2])}
      else if(color===4){alpha[p]=row[i+1];light[p]=row[i]}
      else if(color===0){alpha[p]=transparency&&row[i]===transparency.readUInt16BE(0)?0:255;light[p]=row[i]}
      else {const entry=row[i];alpha[p]=transparency?.[entry]??255;light[p]=Math.max(palette[entry*3],palette[entry*3+1],palette[entry*3+2])}
      if(rgba){const rgb=color===2||color===6?[row[i],row[i+1],row[i+2]]:color===3?[palette[row[i]*3],palette[row[i]*3+1],palette[row[i]*3+2]]:[row[i],row[i],row[i]];rgba.set([...rgb,alpha[p]],p*4)}
    }
    previous=row;
  }
  const pixels={width,height,alpha,light,rgba};pngMaterialPixels.set(asset,pixels);return pixels;
}

function eventTarget(target = {}) {
  const listeners = new Map();
  target.addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  target.removeEventListener = (name, fn) => {
    listeners.set(name, (listeners.get(name) || []).filter(item => item !== fn));
  };
  target.dispatchEvent = event => {
    event.target ||= target;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const fn of listeners.get(event.type) || []) fn(event);
    return !event.defaultPrevented;
  };
  return target;
}

function context2d() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], styleKeys = ['globalAlpha', 'globalCompositeOperation', 'filter', 'shadowBlur', 'shadowColor', 'fillStyle', 'strokeStyle', 'lineWidth'];
  const multiply = next => {
    assert.ok(next.every(Number.isFinite), 'Canvas transforms must remain finite');
    const [a, b, c, d, e, f] = matrix, [g, h, i, j, k, l] = next;
    matrix = [a*g+c*h, b*g+d*h, a*i+c*j, b*i+d*j, a*k+c*l+e, b*k+d*l+f];
  };
  const point = (x, y) => ({ x: matrix[0]*x+matrix[2]*y+matrix[4], y: matrix[1]*x+matrix[3]*y+matrix[5] });
  const record = (op, args = [], extra = {}) => {
    if (Array.isArray(state.trace)) state.trace.push({ op, args, matrix: [...matrix], origin: point(0, 0), alpha: state.globalAlpha, filter: state.filter, composite: state.globalCompositeOperation, shadowBlur: state.shadowBlur, ...extra });
  };
  const state = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', shadowBlur: 0, trace: null,
    save() { stack.push({ matrix: [...matrix], style: Object.fromEntries(styleKeys.map(key => [key, state[key]])) }); },
    restore() { const saved = stack.pop(); if (saved) { matrix = saved.matrix; Object.assign(state, saved.style); } },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); record('translate', [x, y]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); record('scale', [x, y]); },
    rotate(angle) { const c = Math.cos(angle), s = Math.sin(angle); multiply([c, s, -s, c, 0, 0]); record('rotate', [angle]); },
    transform(...values) { multiply(values); record('transform', values); },
    setTransform(...values) { matrix = values.length ? [...values] : [1, 0, 0, 1, 0, 0]; },
    resetTransform() { matrix = [1, 0, 0, 1, 0, 0]; },
    getTransform() { return { a: matrix[0], b: matrix[1], c: matrix[2], d: matrix[3], e: matrix[4], f: matrix[5], transformPoint: p => point(p.x, p.y) }; },
    beginPath() { record('beginPath'); },
    moveTo(...args) { record('moveTo', args); },
    lineTo(...args) { record('lineTo', args); },
    closePath() { record('closePath'); },
    fill(...args) { record('fill', args); },
    stroke(...args) { record('stroke', args); },
    rect(...args) { assert.ok(args.every(Number.isFinite)); record('rect', args); },
    clip() { record('clip'); },
    arc(...args) { assert.ok(args.every(Number.isFinite)); record('arc', args); },
    ellipse(...args) { assert.ok(args.every(Number.isFinite)); record('ellipse', args); },
    fillRect(...args) { assert.ok(args.every(Number.isFinite)); record('fillRect', args); },
    strokeRect(...args) { assert.ok(args.every(Number.isFinite)); record('strokeRect', args); },
    measureText: text => ({ width: String(text).length * 7 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    // An opaque fixture avoids spending test time on mocked-image flood fills.
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    drawImage(image, ...coordinates) {
      assert.ok(image && (image.naturalWidth || image.width) > 0, 'Drawn image must have positive dimensions');
      assert.ok(coordinates.every(Number.isFinite), 'Draw image coordinates must be finite');
      record('drawImage', [image.sourcePath || image.src || 'canvas', ...coordinates], { image });
    },
  };
  return new Proxy(state, { get: (target, key) => key in target ? target[key] : noop });
}

function element(tagName = 'div', id = '') {
  const classes = new Set();
  const drawingContext = context2d();
  const item = eventTarget({
    id, tagName: tagName.toUpperCase(), textContent: '', innerHTML: '', value: '', checked: false, open: false,
    width: 960, height: 540, hidden: false, disabled: false, children: [],
    cssRect: { left:0, top:0, width:960, height:540 },
    style: { setProperty() {}, removeProperty() {} }, dataset: {},
    classList: {
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value)),
      contains: value => classes.has(value),
      toggle(value, force) {
        const on = force === undefined ? !classes.has(value) : force;
        if (on) classes.add(value); else classes.delete(value);
        return on;
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    removeAttribute(name) { delete this[name]; },
    getContext: () => drawingContext,
    getBoundingClientRect() { const {left,top,width,height}=this.cssRect;return{x:left,y:top,left,top,width,height,right:left+width,bottom:top+height}; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    focus() {}, blur() {}, scrollIntoView() {},
    showModal() { this.open = true; }, close() { const wasOpen=this.open;this.open=false;if(wasOpen)this.dispatchEvent({type:'close'}); },
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part === 'input' || part === 'textarea' || part === 'select' || part === 'button') return part.toUpperCase() === this.tagName;
        if (part.includes('contenteditable')) return !!this.isContentEditable;
        return false;
      });
    },
    closest(selector) {
      if (selector.startsWith('.')) return this; // HUD wrapper only.
      return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
    },
    querySelector() { return element(); },
    querySelectorAll() { return []; },
  });
  return item;
}

function audioParam() {
  return new Proxy({ value: 0 }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
}
function audioNode() {
  return new Proxy({
    connect(target) { return target || this; }, disconnect() {}, start() {}, stop() {},
  }, { get: (obj, key) => key in obj ? obj[key] : (obj[key] = audioParam()) });
}

function createGame(options = {}) {
  const assetRequests = [];
  const requestAsset = value => { requestedAssets.add(value); assetRequests.push(value); };
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const item = element(match[1], match[2]);
    item.hidden = /\shidden(?:\s|>|=)/i.test(match[0]);
    const classMatch = match[0].match(/class="([^"]+)"/);
    classMatch?.[1].split(/\s+/).forEach(value => item.classList.add(value));
    if (match[0].includes('data-flight-deck')) item.dataset.flightDeck = '';
    elements.set(item.id, item);
  }
  for (const match of html.matchAll(/<button\b[^>]*\bdata-flight-deck\b[^>]*>/gi)) {
    if (/\bid="/.test(match[0])) continue;
    const item = element('button', '__flight-trigger-' + elements.size);
    item.dataset.flightDeck = '';
    elements.set(item.id, item);
  }
  for (const match of html.matchAll(/<button\b[^>]*\bdata-art-state="([^"]+)"[^>]*>/gi)) {
    const item = element('button', '__art-state-' + match[1]);
    item.dataset.artState = match[1]; elements.set(item.id, item);
  }
  const find = selector => {
    const id = selector.startsWith('#') ? selector.slice(1) : selector;
    if (!elements.has(id)) elements.set(id, element('div', id));
    return elements.get(id);
  };
  if(options.canvasRect)find('#game').cssRect={...find('#game').cssRect,...options.canvasRect};
  const document = eventTarget({
    hidden: false, visibilityState: 'visible', activeElement: null,
    querySelector: find, getElementById: id => find('#' + id),
    querySelectorAll: selector => selector === '.screen'
      ? [...elements.values()].filter(item => item.classList.contains('screen'))
      : selector === '[data-flight-deck]' ? [...elements.values()].filter(item => 'flightDeck' in item.dataset)
      : selector === '[data-art-state]' ? [...elements.values()].filter(item => 'artState' in item.dataset) : [],
    createElement: tag => element(tag), documentElement: element('html'), body: element('body'), head:element('head'), styleSheets:[],
    hasFocus: () => true,
  });
  const storage = new Map(options.initialStorage || []);
  const sandbox = eventTarget({
    console: { log() {}, warn() {}, error(...args) { throw new Error(args.join(' ')); } },
    document, navigator: { getGamepads: () => [], userAgent: 'Node regression harness' },
    localStorage: {
      getItem: key => { if (options.failGet) throw new Error('Storage access denied'); return storage.has(key) ? storage.get(key) : null; },
      setItem: (key, value) => { if (options.failSet) throw new Error('QuotaExceededError'); storage.set(key, String(value)); },
      removeItem: key => { if (options.failRemove) throw new Error('Storage removal denied'); storage.delete(key); },
    },
    Image: class {
      constructor() { this.naturalWidth = this.width = 1024; this.naturalHeight = this.height = 1024; this.complete = true; }
      set src(value) {
        this._src = value; requestAsset(value);
        [this.naturalWidth, this.naturalHeight] = pngDimensions(value);
        this.width = this.naturalWidth; this.height = this.naturalHeight;
        this.ready = true;
        // Synchronous delivery intentionally exercises preparation callbacks,
        // compact canvases, and every loaded-sprite rendering branch.
        this.onload?.();
      }
      get src() { return this._src; }
    },
    Audio: class {
      constructor() { this.paused = true; this.currentTime = 0; this.volume = 1; }
      load() { this.loadCount=(this.loadCount||0)+1;if (this.src) requestAsset(this.src); }
      pause() { this.paused = true; }
      play() { this.playCount=(this.playCount||0)+1;if(options.blockFirstMusicPlay&&this.playCount===1)return Promise.reject(new Error('NotAllowedError'));this.paused = false; return Promise.resolve(); }
      addEventListener() {}
    },
    AudioContext: class {
      constructor() { this.currentTime = 1; this.sampleRate = 1000; this.state = 'running'; this.destination = audioNode(); }
      createGain() { return audioNode(); }
      createOscillator() { return audioNode(); }
      createBiquadFilter() { return audioNode(); }
      createDynamicsCompressor() { return audioNode(); }
      createBufferSource() { return audioNode(); }
      createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
    },
    requestAnimationFrame(fn) { sandbox.nextFrame = fn; return 1; },
    cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {},
    matchMedia: () => ({ matches: !!options.prefersReducedMotion, addEventListener() {} }),
    Event: class { constructor(type) { this.type = type; } },
    performance: { now: () => 0 },
    confirm: () => false,
    navigator: options.navigator||{},
    location: { search: '', protocol: 'http:' },
    devicePixelRatio: options.devicePixelRatio||1, innerWidth: 1280, innerHeight: 720,
    URLSearchParams,
  });
  if (options.blockStorageGetter) Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); } });
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  options.prepare?.(sandbox);
  for(const script of ['assets/destruction/manifest.js','assets/destruction/joint-caps.js','destruction.js','input-bindings.js','gamepad.js','controls-ui.js','run-progression.js','run-rewards-ui.js','encounter-tactics.js','stage-rhythm.js','combat-loss.js','ui-text.js','diagnostics.js','sfx-samples.js'])if(fs.existsSync(path.join(root,script)))vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context,{filename:script});
  vm.runInContext(fs.readFileSync(path.join(root, 'levels.js'), 'utf8'), context, { filename: 'levels.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'systems.js'), 'utf8'), context, { filename: 'systems.js' });
  const accessors = `
  globalThis.__gameTest = {
    start, startLevelLab, startMiniBossLab, startBossLab, startEpicBossLab, makeMiniBoss, makeEpicBoss,
    launchNewRun,selectRunMode,loadGame,renderRunMenu,openMissionSelect,startMissionReplay,renderMissionSelect,
    openMissionBriefing,closeMissionBriefing,departMission,beginApexArrival,openRoundGarage,finishRoundGarage,rebuildRunLoadout,
    get garageRunContext(){return garageRunContext},
    get bossAudioFade(){return bossAudioFade},get stageApexIntro(){return stageApexIntro},
    setEpicEncounter(value){runEpicEncounter=value},
    flushBossArrival(){for(let step=0;stageApexIntro>=0&&step<600;step++)update(1/120)},
    validateRunCheckpoint,saveRunCheckpoint,completeRun,advanceAfterApex,handleBossDefeat,learnSkill,
    get runMode(){return runMode},get selectedMode(){return selectedMode},get runStartWave(){return runStartWave},get runSegment(){return runSegment},get runActive(){return runActive},
    get skillPaths(){return skillPaths},get checkpointVersion(){return RUN_CHECKPOINT_VERSION},
    nativeEmissionWeight,relightNativeMaterial,nativeMaterialPalette,
    sectorThreat,hostileDamage,spawnEnemy,enemyFire,bossBuildHealthScale,
    get nativePaletteCache(){return nativePaletteCache},get nativePaletteLimit(){return NATIVE_PALETTE_LIMIT},get diagnostics(){return diagnostics},
    get materialEmissionBuffer(){return materialEmissionBuffer},get materialEmissionContext(){return materialEmissionContext},
    openLootGuide,renderLootGuide,drawPickupSprite,gearDropSprite,recolorGearDropMaterial,
    skipBossLabSegment, presentTacticalRetrofit, chooseTacticalRetrofit, tacticalRetrofitChoices,
    update, draw, hud, loop, damage, updateEpicToxin, releaseCharge, pause,
    openSkillTree, closeSkillTree, normalizeGearItem, generateGear, gearComboStates,
    bankRunLoot, renderGarage, goMenu, collectCombatPickup,collectGear,fire,particlesAt,debrisAt,addParticle,
    spawnLevelOneBeat, levelOneTimeline, levelOnePostMiniTimeline,
    stageCountdown,get missionPacing(){return{firstElite:LEVEL_ONE_ELITE_TIME,firstPost:LEVEL_ONE_POST_TIME,elite:STAGE_ELITE_TIME,post:STAGE_POST_ELITE_TIME,apex:STAGE_ELITE_TIME+STAGE_POST_ELITE_TIME}},get postEliteClock(){return stagePostEliteClock},setPostEliteClock(value){stagePostEliteClock=value},
    storage, saveProfile, readProfileSlot, loadBossAsset, preloadBossAssets,
    activeWeakNodes, drawWeakPoints, worldWeakNode, drawPlayerAndPod, drawPlayerShield, drawEpicHeavy, drawBossStatus,
    nativeFractureProfile,nativeFractureVertices,nativeFractureGroupReady,
    nativeFractureBaseProfile,nativeSpriteBrokenGroups,nativeSocketRemoved,withModularSpritePaint,
    nativePreparedJointLocal,nativeSeveredSmokeAnchor,boundedMaterialSample,
    drawNativeFracturedBody,detachNativePart,emitNativeSpritePart,flushNativeSpriteParts,
    captureNativeFractureBody,paintNativeFractureBody,paintNativeBossBody,paintMiniBossNativeBody,
    drawModularArticulatedSprite,miniBossSpriteFor,damageWeakNode,drawBossFragment,
    get fractureContext(){return nativeFractureContext},get fractureBuffer(){return nativeFractureBuffer},
    renderPose:e=>enemyRenderPose(e), applyPose:(e,motion)=>applyEnemyPose(e,motion),
    localNode:(e,node)=>localWeakNode(e,node),
    miniFrame:e=>miniBossFrame(e),
    miniBossMuzzle,miniBossAttack,updateMiniBossMovement,
    get miniCoreTracks(){return miniBossCoreTracks},
    get bloodstarPoints(){return bloodstarNodePixels},
    get twinMawPoints(){return twinMawNodePixels},get helixPoints(){return helixNodePixels},
    recolorBloodstarMaterial:(data,heat)=>recolorBloodstarMaterial(data,heat),
    bloodstarWeakHeat:(enemy,index)=>bloodstarWeakHeat(enemy,index),
    get drawingContext(){return ctx},get shake(){return shake},
    get materialBuffer(){return materialSocketBuffer},
    get materialContext(){return materialSocketContext},
    get bloodstarContext(){return bloodstarScratchCtx},
    get bloodstarScratch(){return bloodstarScratch},
    fitCanvas:()=>fitCanvas(),get logicalSize(){return[W,H]},
    lateFrame:e=>lateBossMaterialFrame(e),
    openArtInspection, closeArtInspection, setInspectionMaterial, advanceArtInspection,
    get state(){return state}, get player(){return player},
    get boss(){return boss}, get miniBoss(){return miniBoss},
    get shots(){return shots}, get enemies(){return enemies},
    get enemyShots(){return enemyShots}, get pickups(){return pickups},
    get particles(){return particles},get debris(){return debris},get bossFragments(){return bossFragments},
    get runStats(){return runStats}, get garage(){return garage},
    get profile(){return profile}, get time(){return t}, get runElapsed(){return runElapsed},
    get runLoot(){return runLoot}, get mouse(){return mouse}, get keys(){return keys},
    get stageHazards(){return stageHazards},
    get sfx(){return sfx}, get soundtrack(){return soundtrack},
    get muted(){return muted}, get wave(){return wave},
    get bossLabMini(){return bossLabMini}, get bossLab(){return bossLab}, get artInspection(){return artInspection},
    setTime(value){t=value}, setWave(value){wave=value}, setShake(value){shake=value},
    makeBoss,presentBossDoctrine,renderProfileMenu,newGame,normalizeProfile,deleteProfile,activateProfile,damagedSlot,
    flushVictoryDelay(){const saved=victoryDelay;victoryDelay=null;saved?.run()},
    setRunTotals(nextScore,nextKills,nextElapsed){score=nextScore;kills=nextKills;runElapsed=nextElapsed},
  };
  `;
  // Historical regression fixtures retain classic rules. Current-default
  // integration checks pass ruleset:'streamlined-v1' and use untouched source.
  const runtimeSource=options.ruleset==='streamlined-v1'?source:source.replace("DEFAULT_RUN_RULESET='streamlined-v1'","DEFAULT_RUN_RULESET='classic-v1'");
  const end = runtimeSource.lastIndexOf('})();');
  assert.ok(end > 0, 'Game IIFE closure must be present');
  vm.runInContext(runtimeSource.slice(0, end) + accessors + runtimeSource.slice(end), context, { filename: 'game.js' });
  const api = sandbox.__gameTest;
  function simulate(seconds, drawEvery = 30) {
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
      if (api.state === 'playing') api.update(1 / 60);
      if (frame % drawEvery === 0) api.draw();
      assert.ok(Number.isFinite(api.player.x) && Number.isFinite(api.player.y), 'Fighter position must remain finite');
      assert.ok(api.player.hp >= 0, 'Hull must not become negative');
    }
    api.hud();
  }
  return { api, sandbox, document, find, simulate, storage, assetRequests };
}

const pendingTests = [];
function test(name, fn) {
  if(process.env.STARFIGHTER_TEST_FILTER&&!name.includes(process.env.STARFIGHTER_TEST_FILTER))return;
  const pass = () => { passed++; console.log(`PASS ${name}`); }, fail = error => { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.stack}`); };
  try { const result = fn(); if (result && typeof result.then === 'function') pendingTests.push(result.then(pass, fail)); else pass(); }
  catch (error) { fail(error); }
}
const nextTick = () => new Promise(resolve => setImmediate(resolve));

function weakpointPaint(api,enemy){
  const ctx=api.drawingContext,materials=api.materialContext,bloodstar=enemy.kind==='boss'&&!enemy.epic&&enemy.type===0,scratch=api.bloodstarContext;ctx.trace=[];materials.trace=[];scratch.trace=[];ctx.resetTransform();api.setShake(0);
  if(enemy.kind==='mini')api.drawWeakPoints(enemy);else api.draw();
  const palettes=[...api.nativePaletteCache.values()],paletteCanvases=new Set(palettes.flatMap(item=>[item.sealed,item.hot,item.emission])),hotCanvases=new Set(palettes.map(item=>item.hot));
  const native=materials.trace.filter(record=>record.op==='drawImage');
  const stamps=(bloodstar?scratch.trace:ctx.trace).filter(record=>record.op==='drawImage'&&(record.image===api.materialBuffer||record.image===api.materialEmissionBuffer));
  const apertureArea=ctx.trace.filter(record=>record.op==='rect').reduce((sum,record)=>sum+Math.max(0,record.args[2]*record.args[3]),0);
  const brightness=record=>[...record.filter.matchAll(/brightness\(([\d.]+)\)/g)].reduce((value,match)=>value*Number(match[1]),1)*record.alpha;
  const stampPeak=Math.max(0,...stamps.filter(record=>['source-over','source-atop'].includes(record.composite)).map(brightness));
  const color=native.filter(record=>record.composite!=='destination-in'),peak=(bloodstar?1:stampPeak)*Math.max(0,...color.map(record=>{
    const factors=[...record.filter.matchAll(/brightness\(([\d.]+)\)/g)].map(match=>Number(match[1]));return factors.reduce((value,factor)=>value*factor,1)*record.alpha;
  }));
  const sceneStamps=ctx.trace.filter(record=>record.op==='drawImage'&&record.image===api.materialBuffer);
  const hotStrength=color.filter(record=>hotCanvases.has(record.image)).reduce((sum,record)=>sum+record.alpha,0);
  const onlySelectedLayers=native.every(record=>paletteCanvases.has(record.image));
  ctx.trace=materials.trace=scratch.trace=null;return{native,color,stamps,sceneStamps,apertureArea,peak,hotStrength,onlySelectedLayers};
}

function bloodstarBodyPasses(api,sceneTrace,scratchTrace){
  const bodies=sceneTrace.filter(record=>record.op==='drawImage'&&record.image===api.bloodstarScratch),marks=scratchTrace.filter(record=>record.op==='drawImage'&&record.image===api.materialBuffer),count=api.activeWeakNodes(api.boss).length;
  assert.equal(marks.length,bodies.length*count,'Each completed native body frame must own one material sample for each socket');
  return bodies.map((body,pass)=>({body,marks:marks.slice(pass*count,(pass+1)*count),centers:marks.slice(pass*count,(pass+1)*count).map(mark=>{
    const[,x,y,width,height]=mark.args,[a,b,c,d,e,f]=mark.matrix,px=x+width/2,py=y+height/2,sx=a*px+c*py+e,sy=b*px+d*py+f;
    const[,bx,by,bw,bh]=body.args,[A,B,C,D,E,F]=body.matrix,tx=bx+sx/api.bloodstarScratch.width*bw,ty=by+sy/api.bloodstarScratch.height*bh;
    return{x:A*tx+C*ty+E,y:B*tx+D*ty+F};
  })}));
}

const game = createGame();
const { api, sandbox, document, find, simulate } = game;
const press = (type, code, extra = {}) => sandbox.dispatchEvent({ type, code, repeat: false, target: document.body, ...extra });

test('startup and campaign launch', () => {
  assert.equal(api.state, 'menu');
  api.draw(); api.start(); simulate(2);
  assert.equal(api.state, 'playing');
  assert.equal(api.wave, 1);
  assert.equal(api.player.hp, api.player.maxHp);
});

for (let index = 0; index < 10; index++) {
  test(`level ${index + 1}: approach, elite, module, apex`, () => {
    api.startLevelLab(index); api.player.inv = 1e6; simulate(8);
    api.makeMiniBoss(); simulate(5);
    assert.ok(api.miniBoss, 'Elite should remain active until defeated');
    api.skipBossLabSegment(); simulate(1.5);
    assert.equal(api.state, 'upgrade');
    const choices = api.tacticalRetrofitChoices();
    assert.ok(choices.length > 0, 'Elite victory should offer a module');
    api.chooseTacticalRetrofit(choices[0]);
    assert.equal(api.state, 'playing');
    simulate(.1); api.skipBossLabSegment();
    simulate(5);
    assert.ok(api.boss, 'Apex should arrive after the completed approach');
  });
}

for (let index = 0; index < 10; index++) {
  test(`boss ${index + 1}: both phases and victory`, () => {
    api.startBossLab(index); api.player.inv = 1e6; simulate(8);
    assert.equal(api.boss.type, index);
    api.boss.hp = api.boss.max * .49; simulate(.1);
    assert.equal(api.boss.phase, 2);
    simulate(8); api.skipBossLabSegment(); simulate(1.5);
    assert.equal(api.state, 'bosslab');
    assert.equal(api.boss, null);
  });
}

for (let index = 0; index < 2; index++) {
  test(`epic ${index + 1}: four phases and guardian intermissions`, () => {
    api.startEpicBossLab(index); api.player.inv = 1e6; simulate(5);
    for (let phase = 1; phase <= 4; phase++) {
      assert.equal(api.boss.phase, phase);
      simulate(4); api.skipBossLabSegment(); simulate(.1);
      if (phase < 4) {
        assert.ok(api.boss.ritual, 'Phase break should begin a guardian ritual');
        api.skipBossLabSegment(); simulate(2);
        assert.equal(api.boss.phase, phase + 1);
      }
    }
    simulate(1.5);
    assert.equal(api.state, 'bosslab');
  });
}

test('lethal multi-damage clamps hull and records actual damage', () => {
  api.start(); api.player.hp = 1; api.player.shield = 0; api.player.inv = 0;
  api.damage(3); api.hud();
  assert.equal(api.player.hp, 0); assert.equal(api.state, 'gameover');
  assert.equal(api.runStats.damageTaken, 1);
  const records = api.runStats.finalized;
  api.damage(3);
  assert.equal(api.runStats.finalized, records);
});

test('lethal toxin clamps hull and records actual damage', () => {
  api.start(); api.player.maxHp = 12; api.player.hp = 1;
  api.updateEpicToxin({ phase: 2, toxinProtected: false, toxinTick: 0, epicId: 1 }, 1 / 60);
  assert.equal(api.player.hp, 0); assert.equal(api.state, 'gameover');
  assert.equal(api.runStats.damageTaken, 1);
});

test('lethal projectile ends frame before a pickup can repair the fighter', () => {
  api.start(); api.player.hp = 1; api.player.shield = 0; api.player.inv = 0;
  api.enemyShots.push({ x: api.player.x, y: api.player.y, r: 5, vx: 0, vy: 0, damage: 3 });
  api.pickups.push({ x: api.player.x, y: api.player.y, r: 14, spin: 0, type: 'shield' });
  api.update(1 / 60);
  assert.equal(api.state, 'gameover'); assert.equal(api.player.hp, 0);
  assert.equal(api.player.shield, 0, 'Pickup must not be collected after death');
});

test('Force contact honors its damage multiplier', () => {
  api.start(); api.player.inv = 1e6; api.player.pod.owned = true; api.player.podDamage = 2;
  const target = { x: api.player.x + 50, y: api.player.y, r: 15, hp: 10, speed: 0, type: 'wing', phase: 0, cool: 999, c: '#fff' };
  api.enemies.push(target); api.update(.01);
  assert.ok(Math.abs(target.hp - (10 - 28 * 2 * .01)) < .001);
});

test('fast projectile crossing an enemy uses swept collision', () => {
  api.start(); api.player.inv = 1e6;
  const target = { x: 300, y: 100, r: 10, hp: 2, speed: 0, type: 'wing', phase: 0, cool: 999, c: '#fff' };
  api.enemies.push(target);
  api.shots.push({ x: 200, y: 100, r: 3, vx: 10000, vy: 0, d: 1, pierce: 0 });
  api.update(.02);
  assert.equal(target.hp, 1);
});

test('garage renders and banking preserve every rarity', () => {
  api.start();
  const gear = Array.from({ length: 5 }, (_, tier) => api.generateGear(tier));
  gear.forEach(item => { item.slot = 'weapon'; api.garage.inventory.push(item); });
  for (let pass = 0; pass < 3; pass++) api.renderGarage();
  gear.forEach((item, tier) => assert.equal(item.tier, tier));
  api.runLoot.push(api.generateGear(1)); api.bankRunLoot();
  gear.forEach((item, tier) => assert.equal(item.tier, tier));
});

function equipPairBuild(api, pieces, tier = 0, power = 100) {
  api.garage.inventory = []; api.garage.equipped = { weapon: null, armor: null, engine: null, pod: null };
  pieces.forEach(([slot, intrinsic], index) => {
    const gear = api.normalizeGearItem({ ...api.generateGear(tier), id: `${slot}-${intrinsic}-${tier}`, slot, stats: {}, power, alignment: ['VANGUARD', 'AEGIS', 'VECTOR'][index % 3], gunVariant: intrinsic, trait: intrinsic });
    api.garage.inventory.push(gear); api.garage.equipped[slot] = gear.id;
  });
}

test('gear combos require both equipped intrinsics and work at every rarity', () => {
  const { api } = createGame();
  const pairs = [
    { id: 'absorptionCircuit', pieces: [['weapon', 'sync'], ['pod', 'siphon']], check: p => assert.equal(p.podBlockDose, 1) },
    { id: 'chargedBastion', pieces: [['weapon', 'siege'], ['armor', 'capacitor']], check: p => { assert.equal(p.shieldedChargeBonus, .06); assert.equal(p.chargeDamage, 1.12); } },
    { id: 'salvageMomentum', pieces: [['armor', 'recovery'], ['engine', 'scavenger']], check: p => { assert.equal(p.lootSurgeDuration, 6); assert.equal(p.salvageRepair, true); } },
    { id: 'rearGuard', pieces: [['engine', 'vector'], ['pod', 'relay']], check: p => { assert.ok(Math.abs(p.rearForce - 1.08 * 1.08) < 1e-12); assert.ok(Math.abs(p.podMove - 1.12 * 1.06) < 1e-12); } },
  ];
  for (const pair of pairs) for (let tier = 0; tier < 5; tier++) {
    equipPairBuild(api, pair.pieces.slice(0, 1), tier); api.start('story');
    const missing = api.gearComboStates().find(combo => combo.id === pair.id);
    assert.equal(missing.active, false); assert.equal(missing.requirements.filter(item => !item.met).length, 1);
    equipPairBuild(api, pair.pieces, tier); api.start('story');
    assert.equal(api.gearComboStates().filter(combo => combo.active).length, 1);
    assert.equal(api.gearComboStates().find(combo => combo.id === pair.id).active, true);
    pair.check(api.player);
    assert.equal(api.player.damage, 1, 'Conditional pairs must not become unconditional fighter-damage bonuses');
  }
  equipPairBuild(api, [['weapon', 'sync'], ['pod', 'siphon']], 4, 160); api.start('story');
  assert.equal(api.player.signalPower, 160); assert.equal(api.player.damage, 1.05, 'Signal Power calibration must remain capped at 5%');
});

test('gear combos recalculate on refit without stacking or restoring spent resources', () => {
  const { api } = createGame();
  equipPairBuild(api, [['weapon', 'sync'], ['pod', 'siphon'], ['armor', 'recovery'], ['engine', 'scavenger']]); api.start('story'); api.setWave(4);
  Object.assign(api.player, { hp: 2, shield: 0, dose: 49, laserColor: 'blue', laserLevel: 3, missileLevel: 2, bits: 2 });
  for (let pass = 0; pass < 5; pass++) {
    api.rebuildRunLoadout(); assert.equal(api.player.podBlockDose, 1); assert.equal(api.player.lootSurgeDuration, 6); assert.equal(api.player.shieldedChargeBonus, 0);
    assert.equal(api.player.hp, 2); assert.equal(api.player.shield, 0); assert.equal(api.player.dose, 49);
    assert.equal(api.player.laserColor, 'blue'); assert.equal(api.player.laserLevel, 3); assert.equal(api.player.missileLevel, 2); assert.equal(api.player.bits, 2);
  }
  api.garage.equipped.engine = null; api.rebuildRunLoadout(); assert.equal(api.player.lootSurgeDuration, 4);
  api.garage.equipped.pod = null; api.rebuildRunLoadout(); assert.equal(api.player.podBlockDose, 0);
  equipPairBuild(api, [['weapon', 'siege'], ['armor', 'capacitor']]); api.rebuildRunLoadout();
  assert.equal(api.player.shieldedChargeBonus, .06); api.garage.equipped.armor = null; api.rebuildRunLoadout(); assert.equal(api.player.shieldedChargeBonus, 0);
  assert.equal(api.player.hp, 2); assert.equal(api.player.shield, 0);
});

test('gear combo fields survive checkpoints with bounded values and older-save compatibility', () => {
  for (const pieces of [[['weapon', 'siege'], ['armor', 'capacitor']], [['armor', 'recovery'], ['engine', 'scavenger']]]) {
    const game = createGame(), { api } = game; equipPairBuild(api, pieces); api.start('story'); api.saveRunCheckpoint('mission');
    const checkpoint = api.profile.checkpoint; assert.ok(api.validateRunCheckpoint(checkpoint));
    const reloaded = createGame({ initialStorage: [...game.storage] }); reloaded.api.loadGame();
    assert.equal(reloaded.api.player.shieldedChargeBonus, api.player.shieldedChargeBonus); assert.equal(reloaded.api.player.lootSurgeDuration, api.player.lootSurgeDuration);
    for (const [key, bad] of [['shieldedChargeBonus', .5], ['shieldedChargeBonus', -.1], ['lootSurgeDuration', 20], ['lootSurgeDuration', 0]]) {
      const invalid = JSON.parse(JSON.stringify(checkpoint)); invalid.player[key] = bad; assert.equal(api.validateRunCheckpoint(invalid), null);
    }
    const older = JSON.parse(JSON.stringify(checkpoint)); delete older.player.shieldedChargeBonus; delete older.player.lootSurgeDuration;
    assert.ok(api.validateRunCheckpoint(older), 'Checkpoints made before equipment pairs must remain loadable');
  }
});

function garageActionFixture(counts = { weapon: 4, armor: 4, engine: 4, pod: 4 }) {
  const game = createGame(), { api, document, find } = game;
  // Model browser scroll clamping, removed DOM children and active focus for
  // the inventory controls; simulation-only elements elsewhere stay unchanged.
  function instrument(node) {
    let markup = node.innerHTML, scroll = 0;
    Object.defineProperties(node, {
      innerHTML: { configurable: true, get() { return markup; }, set(value) { markup = String(value); this.children = []; } },
      clientHeight: { get() { return this.id === 'garage' ? 540 : this.dataset.garageColumn === 'true' ? 160 : 0; } },
      scrollHeight: { get() { return this.id === 'garage' ? 2000 : this.dataset.garageColumn === 'true' ? Math.max(160, this.children.length * 120) : 0; } },
      scrollTop: { get() { return scroll; }, set(value) { scroll = Math.max(0, Math.min(Number(value) || 0, this.scrollHeight - this.clientHeight)); } },
    });
    node.focus = function(options) { document.activeElement = this; this.lastFocusOptions = options; if (!options?.preventScroll) find('#garage').scrollTop = 0; };
    return node;
  }
  const createElement = document.createElement;
  document.createElement = tag => instrument(createElement(tag));
  for (const id of ['garage', 'gear-inventory', 'equipped-gear']) instrument(find('#' + id));
  api.garage.inventory = []; api.garage.equipped = { weapon: null, armor: null, engine: null, pod: null };
  for (const [slot, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index++) {
      const gear = api.generateGear(1);
      Object.assign(gear, { id: `${slot}-${index}`, slot, name: `${slot.toUpperCase()} TEST ${index}`, power: 150 - index, locked: false });
      api.garage.inventory.push(api.normalizeGearItem(gear));
    }
  }
  find('#garage-menu-btn').onclick();
  const column = slot => find('#gear-inventory').children.find(group => group.dataset.garageSlot === slot).children.find(child => child.dataset.garageColumn === 'true');
  const action = (slot, id, verb) => column(slot).children.find(card => card.dataset.gearId === id)?.children.flatMap(child => child.children).find(button => button.dataset.gearAction === verb);
  return { ...game, column, action };
}

test('garage locks persist across reload and protect the live inventory item', () => {
  const game = garageActionFixture(), { api, action } = game;
  const staleDiscard = action('weapon', 'weapon-0', 'dismantle');
  action('weapon', 'weapon-0', 'lock').onclick();
  assert.equal(api.garage.inventory.find(item => item.id === 'weapon-0').locked, true);
  assert.equal(action('weapon', 'weapon-0', 'dismantle').disabled, true);
  assert.equal(api.readProfileSlot(0).garage.inventory.find(item => item.id === 'weapon-0').locked, true);
  const reloaded = createGame({ initialStorage: [...game.storage] });
  assert.equal(reloaded.api.garage.inventory.find(item => item.id === 'weapon-0').locked, true);
  staleDiscard.onclick();
  assert.ok(api.garage.inventory.some(item => item.id === 'weapon-0'), 'A stale dismantle action must respect the current lock');
  action('weapon', 'weapon-0', 'lock').onclick();
  assert.equal(api.readProfileSlot(0).garage.inventory.find(item => item.id === 'weapon-0').locked, false);
  assert.equal(action('weapon', 'weapon-0', 'dismantle').disabled, false);
});

test('garage equip and lock keep every column scroll and the focused action', () => {
  const { api, document, find, column, action } = garageActionFixture();
  const positions = { weapon: 288, armor: 152, engine: 204, pod: 65 };
  for (const [slot, position] of Object.entries(positions)) column(slot).scrollTop = position;
  find('#garage').scrollTop = 232;
  for (const verb of ['equip', 'lock']) {
    const button = action('weapon', 'weapon-2', verb); button.focus({ preventScroll: true }); button.onclick();
    assert.equal(api.garage.equipped.weapon, 'weapon-2');
    assert.equal(document.activeElement, action('weapon', 'weapon-2', verb));
    assert.equal(document.activeElement.lastFocusOptions.preventScroll, true);
    assert.ok(document.activeElement.getAttribute('aria-label').includes('WEAPON TEST 2'));
    assert.equal(find('#garage').scrollTop, 232);
    for (const [slot, position] of Object.entries(positions)) assert.equal(column(slot).scrollTop, position, `${slot} column must retain its own position`);
  }
  column('armor').focus({ preventScroll: true }); api.renderGarage();
  assert.equal(document.activeElement, column('armor'), 'Keyboard focus on a scroll region must survive a render');
  assert.equal(find('#garage').scrollTop, 232);
});

test('garage dismantling clamps scroll and moves focus to a neighbor or empty column', () => {
  const { document, find, column, action } = garageActionFixture({ weapon: 3, armor: 1, engine: 1, pod: 1 });
  column('weapon').scrollTop = 200; find('#garage').scrollTop = 200;
  for (const [id, remaining, expectedScroll] of [['weapon-2', 'weapon-1', 80], ['weapon-1', 'weapon-0', 0], ['weapon-0', null, 0]]) {
    const button = action('weapon', id, 'dismantle'); button.focus({ preventScroll: true }); button.onclick();
    assert.equal(column('weapon').scrollTop, expectedScroll);
    assert.equal(find('#garage').scrollTop, 200);
    assert.equal(document.activeElement, remaining ? action('weapon', remaining, 'dismantle') : column('weapon'));
    assert.equal(document.activeElement.lastFocusOptions.preventScroll, true);
  }
});

test('garage stale actions cannot duplicate salvage or dismantle newly equipped gear', () => {
  const { api, action } = garageActionFixture();
  const discard = action('weapon', 'weapon-0', 'dismantle'), equipRemoved = action('weapon', 'weapon-0', 'equip'), lockRemoved = action('weapon', 'weapon-0', 'lock'), before = api.garage.materials;
  discard.onclick(); const after = api.garage.materials; assert.ok(after > before);
  discard.onclick(); equipRemoved.onclick(); lockRemoved.onclick();
  assert.equal(api.garage.materials, after); assert.equal(api.garage.equipped.weapon, null);
  assert.ok(!api.garage.inventory.some(item => item.id === 'weapon-0'));
  const staleDiscard = action('weapon', 'weapon-1', 'dismantle'); action('weapon', 'weapon-1', 'equip').onclick(); staleDiscard.onclick();
  assert.equal(api.garage.equipped.weapon, 'weapon-1'); assert.ok(api.garage.inventory.some(item => item.id === 'weapon-1'));
  assert.equal(api.garage.materials, after);
});

test('typing profile names does not activate flight shortcuts', () => {
  api.goMenu();
  const editable = element('div'); editable.isContentEditable = true;
  for (const input of [element('input'), element('textarea'), element('select'), editable]) {
    const before = api.mouse.move;
    press('keydown', 'KeyM', { target: input });
    const space = { type: 'keydown', code: 'Space', target: input };
    sandbox.dispatchEvent(space);
    assert.equal(api.mouse.move, before);
    assert.ok(!space.defaultPrevented, 'Text inputs should retain Space');
    press('keyup', 'KeyM', { target: input }); press('keyup', 'Space', { target: input });
  }
});

test('pause ignores key repeat and clears held flight/charge', () => {
  api.start(); press('keydown', 'KeyD'); press('keydown', 'KeyZ'); simulate(.2);
  press('keydown', 'KeyP'); assert.equal(api.state, 'paused');
  press('keydown', 'KeyP', { repeat: true }); assert.equal(api.state, 'paused');
  assert.equal(api.keys.size, 0); assert.equal(api.player.charge, 0);
  press('keyup', 'KeyP'); api.pause(); assert.equal(api.state, 'playing');
  press('keydown', 'Escape'); assert.equal(api.state, 'paused');
  press('keydown', 'Escape', { repeat: true }); assert.equal(api.state, 'paused');
  press('keyup', 'Escape'); api.pause();
});

test('focus loss pauses and visibility restoration keeps explicit resume', () => {
  api.start(); press('keydown', 'KeyD');
  sandbox.dispatchEvent({ type: 'blur' });
  assert.equal(api.state, 'paused'); assert.equal(api.keys.size, 0);
  document.hidden = true; document.dispatchEvent({ type: 'visibilitychange' });
  document.hidden = false; document.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(api.state, 'paused'); api.pause(); assert.equal(api.state, 'playing');
});

test('opening doctrine stops held charge and returns cleanly', () => {
  api.start(); press('keydown', 'KeyZ'); simulate(.3);
  api.openSkillTree(); assert.equal(api.state, 'skilltree');
  assert.equal(api.player.charge, 0); assert.equal(api.keys.size, 0);
  assert.equal(api.sfx.chargeNodes, null);
  api.closeSkillTree(); assert.equal(api.state, 'playing');
});

test('returning to a menu tab restores the configured SFX mute state', () => {
  api.goMenu();
  const calls = [], original = api.sfx.setMuted;
  api.sfx.setMuted = function(value) { calls.push(value); return original.call(this, value); };
  try {
    document.hidden = true; document.dispatchEvent({ type: 'visibilitychange' });
    assert.equal(calls.at(-1), true);
    document.hidden = false; document.dispatchEvent({ type: 'visibilitychange' });
    assert.equal(calls.at(-1), api.muted);
    assert.equal(api.state, 'menu');
  } finally { document.hidden = false; api.sfx.setMuted = original; }
});

test('stray charge release and rapid taps cannot bypass firing cooldown', () => {
  api.start(); press('keyup', 'KeyZ');
  assert.equal(api.shots.length, 0);
  press('keydown', 'KeyZ'); simulate(.02); press('keyup', 'KeyZ');
  assert.equal(api.shots.length, 1);
  press('keydown', 'KeyZ'); simulate(.02); press('keyup', 'KeyZ');
  assert.equal(api.shots.length, 1);
  simulate(.2); press('keydown', 'KeyZ'); simulate(.02); press('keyup', 'KeyZ');
  assert.equal(api.shots.length, 2);
});

test('mouse and keyboard share charge until the final firing source releases', () => {
  api.start();
  find('#game').dispatchEvent({ type: 'pointerdown', button: 0, pointerId: 7, clientX: 145, clientY: 270 });
  press('keydown', 'KeyZ'); simulate(.4);
  sandbox.dispatchEvent({ type: 'pointerup', button: 0, pointerId: 7, clientX: 145, clientY: 270 });
  assert.equal(api.shots.length, 0);
  assert.ok(api.player.charge > .24);
  press('keyup', 'KeyZ'); assert.ok(api.shots.length > 0);
  assert.equal(api.player.charge, 0);
});

test('pointer cancellation discards charge without an unintended shot', () => {
  api.start();
  find('#game').dispatchEvent({ type: 'pointerdown', button: 0, pointerId: 8, clientX: 145, clientY: 270 });
  simulate(.4);
  find('#game').dispatchEvent({ type: 'pointercancel', pointerId: 8 });
  assert.equal(api.mouse.firing, false); assert.equal(api.player.charge, 0);
  assert.equal(api.shots.length, 0);
});

test('precision flight slows movement without shrinking the collision radius', () => {
  api.start(); const startX = api.player.x, radius = api.player.r;
  press('keydown', 'KeyD'); simulate(.2);
  const normalDistance = api.player.x - startX;
  api.start(); press('keydown', 'KeyD'); press('keydown', 'ShiftLeft'); simulate(.2);
  const focusedDistance = api.player.x - startX;
  assert.ok(Math.abs(focusedDistance / normalDistance - .45) < .001);
  assert.equal(api.player.r, radius);
});

test('authored Meridian formations fit the 540-pixel combat lane', () => {
  for (const beat of [...api.levelOneTimeline, ...api.levelOnePostMiniTimeline]) {
    api.startLevelLab(0); api.spawnLevelOneBeat(beat);
    for (const enemy of api.enemies) assert.ok(enemy.y >= 45 && enemy.y <= 495, `Enemy outside lane at ${enemy.y}`);
    for (const hazard of api.stageHazards) {
      if (hazard.type === 'debris') assert.ok(hazard.y > 0 && hazard.y < 540, `Debris outside lane at ${hazard.y}`);
    }
  }
});

test('display preferences persist and restore their document classes', () => {
  const first = createGame({ prefersReducedMotion: true });
  assert.equal(first.sandbox.STARFIGHTER_SETTINGS.reducedMotion, true);
  for (const id of ['reduced-motion', 'clear-combat', 'collision-guide']) {
    first.find('#' + id).checked = id !== 'reduced-motion';
    first.find('#' + id).dispatchEvent({ type: 'change' });
  }
  const second = createGame({ prefersReducedMotion: true, initialStorage: first.storage });
  assert.equal(second.sandbox.STARFIGHTER_SETTINGS.reducedMotion, false, 'Saved preference must override OS default');
  assert.equal(second.sandbox.STARFIGHTER_SETTINGS.clearCombat, true);
  assert.equal(second.sandbox.STARFIGHTER_SETTINGS.collisionGuide, true);
  assert.equal(second.document.documentElement.classList.contains('clear-combat'), true);
  assert.equal(second.document.documentElement.classList.contains('reduced-motion'), false);
  second.api.start(); second.api.draw();
});

test('flight-deck dialog pauses the game and excludes global shortcuts', () => {
  api.start(); press('keydown', 'KeyD');
  const trigger = document.querySelectorAll('[data-flight-deck]')[0];
  assert.ok(trigger, 'At least one Flight Deck control must exist');
  trigger.dispatchEvent({ type: 'click' });
  assert.equal(api.state, 'paused'); assert.equal(api.keys.size, 0);
  assert.equal(find('#flight-deck').open, true);
  const mouseBefore = api.mouse.move;
  press('keydown', 'KeyM'); press('keydown', 'KeyP'); press('keydown', 'Escape');
  assert.equal(api.mouse.move, mouseBefore); assert.equal(api.state, 'paused');
  find('#deck-close').dispatchEvent({ type: 'click' });
  assert.equal(find('#flight-deck').open, false); assert.equal(api.state, 'paused');
  api.pause(); assert.equal(api.state, 'playing');
});

test('blocked localStorage property and reads still allow campaign play', () => {
  for (const options of [{ blockStorageGetter: true }, { failGet: true }]) {
    const isolated = createGame(options);
    assert.equal(isolated.api.storage.sessionOnly, true);
    assert.equal(isolated.find('#save-status').hidden, false);
    assert.equal(isolated.find('#save-status').textContent, 'SESSION SAVE ONLY');
    isolated.api.start(); isolated.simulate(.1);
    assert.equal(isolated.api.state, 'playing');
    isolated.api.profile.name = 'SESSION PILOT'; isolated.api.saveProfile();
    assert.equal(isolated.api.readProfileSlot(0).name, 'SESSION PILOT');
  }
});

test('quota errors preserve readable session saves without replacing persistent values', () => {
  const prior = JSON.stringify(api.profile);
  const isolated = createGame({ initialStorage: [['starfighterProfileSlot1', prior]], failSet: true });
  isolated.api.profile.name = 'QUOTA PILOT'; isolated.api.saveProfile();
  assert.equal(isolated.api.storage.sessionOnly, true);
  assert.equal(isolated.api.readProfileSlot(0).name, 'QUOTA PILOT');
  assert.equal(isolated.storage.get('starfighterProfileSlot1'), prior);
});

test('failed storage removal uses a session tombstone', () => {
  const isolated = createGame({ initialStorage: [['probe', 'persistent']], failRemove: true });
  assert.equal(isolated.api.storage.getItem('probe'), 'persistent');
  isolated.api.storage.removeItem('probe');
  assert.equal(isolated.api.storage.getItem('probe'), null);
  assert.equal(isolated.storage.get('probe'), 'persistent');
  assert.equal(isolated.api.storage.sessionOnly, true);
});

test('working browser storage persists and reloads profiles normally', () => {
  const first = createGame(); first.api.profile.name = 'PERSISTENT PILOT'; first.api.saveProfile();
  const second = createGame({ initialStorage: first.storage });
  assert.equal(second.api.profile.name, 'PERSISTENT PILOT');
  assert.equal(second.api.storage.sessionOnly, false);
  assert.equal(second.find('#save-status').hidden, true);
});

test('malformed saved profiles remain untouched by subsequent autosave', () => {
  for (const key of ['starfighterProfileSlot1', 'starfighterProfile']) {
    const broken = '{corrupt profile bytes';
    const isolated = createGame({ initialStorage: [[key, broken]] });
    assert.equal(isolated.api.storage.sessionOnly, true);
    isolated.api.start(); isolated.api.profile.name = 'RECOVERY PILOT'; isolated.api.saveProfile();
    assert.equal(isolated.storage.get(key), broken);
    assert.equal(isolated.api.readProfileSlot(0).name, 'RECOVERY PILOT');
  }
});

test('a damaged active-profile setting falls back to the first slot and never names a bad storage key', () => {
  for (const damaged of ['abc', 'null', '[]', 'NaN', '1e999', '-4', '', ' 2 ']) {
    const isolated = createGame({ initialStorage: [['starfighterActiveProfile', damaged]] });
    isolated.api.goMenu(); isolated.api.renderProfileMenu(); isolated.api.start(); isolated.api.saveProfile();
    assert.deepEqual([...isolated.storage.keys()].filter(key => /NaN|undefined|null|Infinity/.test(key)), [], `bad storage key for ${JSON.stringify(damaged)}`);
    isolated.api.goMenu(); isolated.api.renderProfileMenu();
    assert.match(isolated.find('#profiles-menu-btn').textContent, /PILOT 0[123]/, `menu label for ${JSON.stringify(damaged)}`);
  }
});

test('damaged numbers in a stored profile become safe values instead of NaN', () => {
  const source = createGame(), real = source.api.generateGear(2, 1, '', {});
  const stat = Object.keys(real.stats)[0], stored = JSON.parse(JSON.stringify(source.api.profile));
  const item = JSON.parse(JSON.stringify(real));
  item.tier = 'abc'; item.power = 'abc'; item.stats = JSON.parse(`{"__proto__":5,"constructor":3,"${stat}":"abc"}`);
  stored.garage.inventory = [item, JSON.parse(JSON.stringify(real))]; stored.garage.materials = 'many';
  stored.lifetime = Object.assign(stored.lifetime, { runs: 7, kills: 'abc', gear: [1, 2], bestScore: 1e999 });
  stored.progress.epicBossesDefeated = ['a', 3]; stored.lastRun = 'junk'; stored.history = [null, 5, 'x', { score: 10 }];
  const loaded = createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(stored).replace('"bestScore":null', '"bestScore":1e999')]] }).api;
  const finite = value => Number.isFinite(value);
  assert.equal(loaded.garage.inventory.length, 2, 'no gear item is dropped');
  assert.equal(loaded.garage.materials, 0);
  assert.equal(loaded.profile.lifetime.runs, 7, 'valid totals are kept');
  for (const key of ['kills', 'gear', 'bestScore']) assert.equal(loaded.profile.lifetime[key], 0, `lifetime.${key}`);
  assert.deepEqual(Array.from(loaded.profile.progress.epicBossesDefeated), [0, 3]);
  assert.equal(loaded.profile.lastRun, null);
  assert.deepEqual(Array.from(loaded.profile.history, entry => entry.score), [10]);
  for (const gear of loaded.garage.inventory) {
    assert.ok(Number.isInteger(gear.tier) && gear.tier >= 0 && gear.tier <= 4 && finite(gear.power) && gear.power >= 100 && gear.power <= 160, 'tier and power are sane');
    for (const [key, value] of Object.entries(gear.stats)) assert.ok(finite(value), `stat ${key}`);
    assert.ok(!Object.prototype.hasOwnProperty.call(gear.stats, '__proto__') && !Object.prototype.hasOwnProperty.call(gear.stats, 'constructor'), 'only real stat names survive');
  }
  const view = createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(stored)]] });
  view.api.renderGarage(); assert.match(view.find('#garage-run-stats').innerHTML, /NO SAVED COMBAT RECORD/); assert.doesNotMatch(view.find('#garage-run-stats').innerHTML, /undefined|NaN/);
});

test('damaged names and labels become readable defaults instead of [object Object]', () => {
  const source = createGame(), stored = JSON.parse(JSON.stringify(source.api.profile)), real = JSON.parse(JSON.stringify(source.api.generateGear(1, 1, '', {})));
  Object.assign(real, { name: { a: 1 }, source: ['x'], id: { b: 2 } });
  stored.name = { __proto__: null, x: 1 }; stored.garage.cosmetics = { bayName: [1, 2] }; stored.garage.inventory = [real];
  const loaded = createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(stored)]] }).api;
  assert.equal(loaded.profile.name, 'PILOT 01'); assert.equal(loaded.garage.cosmetics.bayName, 'LAST SIGNAL BAY');
  const [gear] = loaded.garage.inventory;
  assert.ok(typeof gear.name === 'string' && gear.name.length > 0 && !/object/i.test(gear.name), 'gear name');
  assert.ok(typeof gear.id === 'string' && gear.id !== '[object Object]', 'gear id'); assert.equal(gear.source, 'LEGACY CACHE');
  // Real names are untouched: text stays, and a number is shown as its digits.
  stored.name = 'ACE'; stored.garage.cosmetics = { bayName: 'HANGAR 9' }; stored.garage.inventory[0].name = 'My Blaster';
  const kept = createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(stored)]] }).api;
  assert.equal(kept.profile.name, 'ACE'); assert.equal(kept.garage.cosmetics.bayName, 'HANGAR 9'); assert.equal(kept.garage.inventory[0].name, 'My Blaster');
});

test('a last run with damaged fields still shows a readable summary', () => {
  const source = createGame(), stored = JSON.parse(JSON.stringify(source.api.profile));
  stored.lastRun = { date: 1, mode: 'story', wave: 'x', score: null, kills: [], normalBosses: {}, shotsFired: 'abc', commonDrops: 'abc' };
  const view = createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(stored)]] });
  view.api.renderGarage();
  const text = view.find('#garage-run-stats').innerHTML;
  assert.doesNotMatch(text, /undefined|NaN|\[object/); assert.match(text, /LAST RUN<\/b> - WAVE 0 \/\/ SCORE 0 \/\/ 0 KILLS/); assert.match(text, /0 COMMON/);
});

test('a stored garage that cannot be used is preserved, not silently replaced by an empty one', () => {
  const source = createGame(); source.api.garage.inventory.push(source.api.generateGear(1, 1, '', {})); source.api.saveProfile();
  const good = JSON.parse(source.storage.get('starfighterProfileSlot1')), mirror = source.storage.get('starfighterGarage');
  const damaged = JSON.stringify({ ...good, name: 'DAMAGED GARAGE', garage: 'broken' });
  // Slot 2 has nothing to recover from: it must stay exactly as stored and be reported as session-only.
  const second = createGame({ initialStorage: [['starfighterProfileSlot2', damaged]] });
  assert.equal(second.api.readProfileSlot(1), null);
  second.api.start(); second.api.saveProfile();
  assert.equal(second.storage.get('starfighterProfileSlot2'), damaged);
  assert.equal(second.api.storage.sessionOnly, true);
  // Slot 1 still has the legacy garage mirror, so the gear is recovered rather than lost.
  const first = createGame({ initialStorage: [['starfighterProfileSlot1', damaged], ['starfighterGarage', mirror]] });
  assert.equal(first.api.readProfileSlot(0).garage.inventory.length, 1);
  // A profile that simply has no garage field (an old save) still opens normally.
  const { garage, ...old } = good; old.version = 5;
  assert.ok(createGame({ initialStorage: [['starfighterProfileSlot1', JSON.stringify(old)]] }).api.readProfileSlot(0));
});

test('the Profiles menu labels a damaged save instead of calling the slot empty, and can clear it', () => {
  const damaged = '{"version":6,"name":"BROKEN","garage":"junk"}', click = { stopPropagation() {} };
  const game = createGame({ initialStorage: [['starfighterProfileSlot2', damaged]] }), { api } = game;
  // The test DOM keeps old rows when innerHTML is cleared, so only the newest three rows are the current menu.
  const slots = () => game.find('#profile-menu-slots').children.slice(-3);
  api.renderProfileMenu();
  let [label, actions] = slots()[1].children, [select, remove] = actions.children;
  assert.match(slots()[1].className, /damaged/); assert.doesNotMatch(slots()[1].className, /empty/);
  assert.match(label.innerHTML, /SLOT 02 \/\/ DAMAGED SAVE/); assert.match(label.innerHTML, /KEPT UNTOUCHED/);
  assert.equal(select.disabled, true); assert.match(select.textContent, /SLOT LOCKED/);
  assert.equal(remove.disabled, false); assert.match(remove.textContent, /CLEAR DAMAGED SAVE/);
  assert.match(slots()[0].className, /empty/); assert.match(slots()[2].className, /empty/);
  assert.equal(game.find('#save-status').hidden, false, 'the session-only notice is shown while a save is being protected');
  // Selecting a damaged slot explains itself and changes nothing.
  const before = api.profile.name; label.onclick();
  assert.equal(api.profile.name, before); assert.match(game.find('#profiles-status').textContent, /DAMAGED SAVE/);
  // Declining the confirmation keeps the damaged text.
  game.sandbox.confirm = () => false; remove.onclick(click);
  assert.equal(game.storage.get('starfighterProfileSlot2'), damaged);
  // Accepting clears it, frees the slot and removes the session-only notice.
  game.sandbox.confirm = () => true; remove.onclick(click);
  assert.equal(game.storage.get('starfighterProfileSlot2'), undefined);
  assert.match(slots()[1].className, /empty/); assert.match(game.find('#profiles-status').textContent, /SLOT 2 CLEARED/);
  assert.equal(game.find('#save-status').hidden, true);
  [label, actions] = slots()[1].children; [select, remove] = actions.children;
  assert.equal(select.disabled, false); assert.match(select.textContent, /CREATE NEW GAME/);
});

test('clearing a damaged save keeps the session-only notice when storage itself is failing', () => {
  const damaged = '{"version":6,"name":"BROKEN","garage":"junk"}';
  const game = createGame({ initialStorage: [['starfighterProfileSlot2', damaged]], failSet: true });
  game.api.renderProfileMenu(); game.api.saveProfile();
  game.sandbox.confirm = () => true; game.api.deleteProfile(1);
  assert.equal(game.storage.get('starfighterProfileSlot2'), undefined);
  assert.equal(game.find('#save-status').hidden, false);
});

test('a damaged first slot is cleared together with its legacy copies', () => {
  const damaged = '{"version":6,"name":"BROKEN","garage":"junk"}';
  const game = createGame({ initialStorage: [['starfighterProfileSlot1', damaged], ['starfighterProfile', damaged], ['starfighterGarage', '{}'], ['lastSignalBest', '99']] });
  assert.equal(game.api.damagedSlot(0), true);
  game.api.renderProfileMenu();
  assert.match(game.find('#profile-menu-slots').children.slice(-3)[0].className, /damaged/);
  game.sandbox.confirm = () => true; game.api.deleteProfile(0);
  for (const key of ['starfighterProfileSlot1', 'starfighterProfile', 'starfighterGarage', 'lastSignalBest']) assert.equal(game.storage.get(key), undefined, key);
  assert.equal(game.api.damagedSlot(0), false); assert.equal(game.find('#save-status').hidden, true);
  assert.equal(game.api.profile.name, 'PILOT 01');
});

test('a new pilot is never placed in a slot that holds a damaged save', () => {
  const damaged = '{"version":6,"name":"BROKEN","garage":"junk"}', first = createGame(); first.api.saveProfile();
  const game = createGame({ initialStorage: [...first.storage, ['starfighterProfileSlot2', damaged]] });
  game.api.newGame();
  assert.equal(game.api.profile.name, 'PILOT 03');
  assert.equal(game.storage.get('starfighterProfileSlot2'), damaged);
  assert.equal(game.api.storage.sessionOnly, true, 'the damaged slot is still being protected');
  assert.ok(game.storage.get('starfighterProfileSlot3'), 'the new pilot was really saved');
});

test('fixed-step simulation advances equally at 30, 60, and 144 rendered FPS', () => {
  const times = [];
  for (const fps of [30, 60, 144]) {
    const isolated = createGame(); isolated.api.start(); isolated.api.player.inv = 1e6;
    for (let frame = 0; frame <= fps * 2; frame++) isolated.api.loop(100 + frame * 1000 / fps);
    assert.ok(Math.abs(isolated.api.time - 2) < 1e-6, `${fps} FPS simulated ${isolated.api.time}s`);
    assert.ok(Math.abs(isolated.api.runElapsed - 2) < 1e-6);
    times.push(isolated.api.time);
  }
  assert.ok(Math.max(...times) - Math.min(...times) < 1e-6);
});

test('paused frame time does not catch up on resume', () => {
  const isolated = createGame(); isolated.api.start();
  isolated.api.loop(100); isolated.api.loop(150);
  const before = isolated.api.time;
  isolated.api.pause(); isolated.api.loop(5150);
  assert.equal(isolated.api.time, before);
  isolated.api.pause(); isolated.api.loop(5200);
  assert.ok(Math.abs(isolated.api.time - before - .05) < 1e-6);
});

test('performance log: loop and part-break hooks stay inert until the player enables it, then record real frames, hitches and part breaks', () => {
  const g = createGame(); g.api.startBossLab(5); g.api.player.inv = 1e6;
  const diag = g.api.diagnostics;
  assert.equal(diag.active, false); assert.equal(diag.enabled, false);
  for (let i = 0; i <= 90; i++) g.api.loop(100 + i * 1000 / 60);
  assert.equal(diag.snapshot().sessions.length, 0);
  assert.equal(g.storage.has('starfighterDiagnosticsSessions'), false); assert.equal(g.storage.has('starfighterDiagnostics'), false, 'No preference is written until the player opts in');
  diag.setEnabled(true); assert.equal(g.storage.get('starfighterDiagnostics'), '1');
  let t = 100 + 91 * 1000 / 60;
  for (let i = 0; i < 120; i++) { t += 1000 / 60; g.api.loop(t); }
  let s = diag.snapshot().sessions.at(-1);
  assert.ok(s.frames >= 118 && s.frames <= 121, `Recorded ${s.frames} of 120 frames`);
  assert.ok(s.interval.p50 >= 16 && s.interval.p50 <= 17, `Median interval ${s.interval.p50}`);
  assert.ok(s.encounters['boss:5:p1'].frames >= 118, 'Frames are grouped by encounter and phase');
  // A slow frame keeps the encounter, the counts that explain it, and no save data.
  t += 120; g.api.loop(t);
  const slow = diag.snapshot().sessions.at(-1).recent.at(-1);
  assert.equal(slow.key, 'boss:5:p1'); assert.equal(Math.round(slow.interval), 120);
  assert.equal(slow.ctx.state, 'playing'); assert.equal(slow.ctx.boss.type, 5); assert.equal(slow.ctx.lab, true);
  for (const field of ['enemies', 'enemyShots', 'particles', 'debris', 'fragments', 'paletteCache'])assert.ok(Number.isFinite(slow.ctx[field]), 'Context needs ' + field);
  // A real part break is marked, and tags the next hitch.
  const boss = g.api.boss, node = g.api.activeWeakNodes(boss).find(n => !n.destroyed);
  g.api.damageWeakNode(boss, node, node.hp + 1);
  assert.equal(diag.snapshot().sessions.at(-1).marks['part-break'], 1);
  t += 90; g.api.loop(t);
  assert.ok(Number.isFinite(diag.snapshot().sessions.at(-1).recent.at(-1).sinceMark['part-break']), 'The hitch after a break carries its distance from the break');
  // Pausing resets the clock instead of recording the pause as a hitch; turning the log off stops recording.
  g.api.pause(); t += 5000; g.api.loop(t); g.api.pause(); t += 16.7; g.api.loop(t); t += 16.7; g.api.loop(t);
  assert.ok(diag.snapshot().sessions.at(-1).interval.max < 1000, 'A five-second pause is not a hitch');
  diag.setEnabled(false); const frames = diag.snapshot().sessions.at(-1).frames;
  for (let i = 0; i < 30; i++) { t += 16.7; g.api.loop(t); }
  assert.equal(diag.snapshot().sessions.at(-1).frames, frames);
  const text = diag.exportText();
  for (const word of ['garage', 'checkpoint', 'RECOVERY', 'hostKey', 'localStorage'])assert.ok(!text.includes(word), 'Export must not contain ' + word);
});

test('performance log: Flight Manual exposes the controls and remembers the choice', () => {
  const g = createGame();
  for (const id of ['diagnostics-group', 'diagnostics-enabled', 'diagnostics-save', 'diagnostics-copy', 'diagnostics-clear', 'diagnostics-status'])assert.ok(g.find('#' + id), id + ' is in Flight Manual');
  assert.match(g.find('#diagnostics-status').textContent, /^Off\. Turn on before playing/); assert.equal(g.find('#diagnostics-enabled').checked, false);
  const returning = createGame({ initialStorage: [['starfighterDiagnostics', '1']] });
  assert.equal(returning.api.diagnostics.enabled, true); assert.equal(returning.find('#diagnostics-enabled').checked, true, 'The choice survives a reload');
  assert.match(fs.readFileSync(path.join(root, 'flight-school.html'), 'utf8'), /diagnostics\.js\?v=\d+/, 'The practice page loads the same inert module');
});

// A stand-in for spotify.js that records what the game asks of it (the real module is covered by verify-spotify.cjs).
function spotifyStub() {
  const log = []; let change = null;
  const ctl = { hold: false, get takesMusic() { return this.hold; }, bind() { log.push('bind'); }, setLevel(value, muted) { log.push(['level', value, muted]); }, setAway(away) { log.push(['away', away]); }, connect() { log.push('connect'); return true; }, restore() { log.push('restore'); } };
  return { log, ctl, install: sandbox => { sandbox.StarfighterSpotify = { create(options) { change = options.onChange; log.push('create'); return ctl; } }; }, changed: () => change() };
}

// A stand-in for studio-intro.js that records what the game asks of it (the real card is covered by verify-studio-intro.cjs).
function introStub() {
  const log = []; let done = null;
  return { log, install: sandbox => { sandbox.StarfighterStudioIntro = { stingGain: .4, create(options) { log.push(['create', options.calm, options.volume()]); done = options.onDone; return { start() { log.push('start'); } }; } }; }, finish: () => done() };
}

test('studio intro: plays over the title, holds the menu music until it ends, and is skipped for ?nointro, builds without it and reduced motion plays calm', () => {
  const s = introStub(), g = createGame({ prepare: s.install }), music = g.api.soundtrack;
  assert.deepEqual(s.log, [['create', false, .4], 'start']); assert.equal(music.paused, true, 'Menu music waits for the card'); assert.equal(g.find('#studio-intro').hidden, false);
  g.document.dispatchEvent({ type: 'pointerdown', target: g.find('#audio-btn') }); assert.equal(music.paused, true, 'A click while the card is up does not start the menu music under it');
  s.finish(); assert.equal(music.paused, false, 'Menu music starts when the card ends'); assert.equal(music.src, 'music/menu-intro.mp3');
  const quiet = introStub(), q = createGame({ prepare: sandbox => { quiet.install(sandbox); sandbox.location.search = '?v=172&nointro=1'; } });
  assert.deepEqual(quiet.log, [], '?nointro skips the card'); assert.equal(q.find('#studio-intro').hidden, true); assert.equal(q.api.soundtrack.paused, false);
  const bare = createGame(); assert.equal(bare.find('#studio-intro').hidden, true, 'A build without studio-intro.js shows nothing'); assert.equal(bare.api.soundtrack.paused, false);
  const calm = introStub(); createGame({ prefersReducedMotion: true, prepare: calm.install }); assert.deepEqual(calm.log[0], ['create', true, .4]);
  const mute = introStub(); createGame({ initialStorage: [['starfighterMuted', 'true']], prepare: mute.install }); assert.equal(mute.log[0][2], 0, 'SOUND: OFF silences the sting');
  const refused = createGame({ prepare: sandbox => { sandbox.StarfighterStudioIntro = { stingGain: .4, create: () => null }; } }); assert.equal(refused.find('#studio-intro').hidden, true, 'If the card cannot start the cover is lifted'); assert.equal(refused.api.soundtrack.paused, false);
});

test('Spotify music: nothing is loaded, stored or requested at start, and the soundtrack is unchanged', () => {
  const g = createGame();
  assert.ok(g.find('#spotify-connect')); assert.equal(g.find('#spotify-group').hidden, false); assert.equal(g.document.head.children.length, 0, 'No script is added at start');
  assert.equal([...g.storage.keys()].filter(key => /spotify/i.test(key)).length, 0); assert.equal(g.sandbox.StarfighterSpotify, undefined);
  assert.equal(g.api.soundtrack.paused, false); assert.equal(g.api.soundtrack.src, 'music/menu-intro.mp3'); assert.ok(!g.assetRequests.some(item => /spotify|scdn/i.test(item)));
});

test('Spotify music: CONNECT loads the module on demand, and Spotify and the game soundtrack take turns without fighting', async () => {
  const s = spotifyStub(), g = createGame({ prepare: s.install }), { api, find } = g, music = api.soundtrack;
  assert.deepEqual(s.log, [], 'Nothing is created until the player asks');
  find('#spotify-connect').dispatchEvent({ type: 'click' }); await nextTick();
  assert.deepEqual(s.log, ['create', 'bind', ['level', .3, false], ['away', false], 'connect']);
  find('#spotify-connect').dispatchEvent({ type: 'click' }); await nextTick(); assert.equal(s.log.filter(item => item === 'create').length, 1, 'The module is created once');
  s.ctl.hold = true; s.changed(); assert.equal(music.paused, true, 'The soundtrack steps aside the moment Spotify plays');
  api.start('story'); assert.match(music.src, /^music\/level\d+\.mp3$/); assert.equal(music.paused, true, 'Level music is prepared but never fights Spotify'); api.goMenu(); api.start('rush');
  find('#music-volume').value = 50; find('#music-volume').dispatchEvent({ type: 'input' }); assert.deepEqual(s.log.at(-1), ['level', .5, false], 'The MUSIC slider moves Spotify too');
  find('#sound-btn').onclick(); assert.deepEqual(s.log.at(-1), ['level', .5, true], 'SOUND: OFF mutes Spotify'); find('#sound-btn').onclick();
  const before = s.log.length; api.flushBossArrival();
  const levels = s.log.slice(before).filter(item => Array.isArray(item) && item[0] === 'level').map(item => item[1]); assert.ok(levels.some(v => v < .45), 'The boss fade ducks Spotify as it does the soundtrack'); assert.equal(music.paused, true);
  g.document.hidden = true; g.document.dispatchEvent({ type: 'visibilitychange' }); assert.deepEqual(s.log.at(-1), ['away', true]);
  g.document.hidden = false; g.document.dispatchEvent({ type: 'visibilitychange' }); assert.deepEqual(s.log.at(-1), ['away', false]); assert.equal(music.paused, true, 'Returning to the page does not restart the soundtrack over Spotify');
  assert.equal(api.state, 'paused', 'Hiding the page paused the game, as it always has'); api.pause(); assert.equal(music.paused, true, 'Resuming play does not restart the soundtrack over Spotify');
  s.ctl.hold = false; s.changed(); assert.equal(music.paused, false, 'When Spotify stops or fails, the game soundtrack returns'); assert.match(music.src, /^music\/bosses\//);
});

test('Spotify music: a saved sign-in reconnects quietly at start; a build without the module keeps the game music and says so', async () => {
  const s = spotifyStub(), g = createGame({ initialStorage: [['starfighterSpotifyOn', '1']], prepare: s.install }); await nextTick();
  assert.deepEqual(s.log.filter(item => !Array.isArray(item) || item[0] !== 'level'), ['create', 'bind', ['away', false], 'restore']); assert.ok(s.log.filter(item => Array.isArray(item) && item[0] === 'level').every(item => item[1] === .3 && item[2] === false)); assert.equal(g.api.soundtrack.paused, false, 'The soundtrack plays until Spotify actually plays');
  const missing = createGame({ initialStorage: [['starfighterSpotifyOn', '1']] }), script = missing.document.head.children[0];
  assert.equal(script.src, 'spotify.js'); missing.find('#spotify-status').textContent = ''; script.onerror(); await nextTick();
  assert.match(missing.find('#spotify-status').textContent, /not included in this build.*game music keeps playing/); assert.equal(missing.api.soundtrack.paused, false);
  const press = createGame(); press.find('#spotify-connect').dispatchEvent({ type: 'click' }); press.document.head.children[0].onerror(); await nextTick();
  assert.match(press.find('#spotify-status').textContent, /not included in this build/);
});

test('HUD tolerates out-of-range hull values and remains drawable', () => {
  api.start(); api.player.hp = -3; api.hud();
  assert.equal(find('#health').textContent, '◇'.repeat(api.player.maxHp));
  api.player.hp = api.player.maxHp + 10; api.hud();
  assert.equal(find('#health').textContent, '◆'.repeat(api.player.maxHp));
  api.draw();
});

test('menu loads only the combat atlas and first environment plate', () => {
  const isolated = createGame(); isolated.api.draw();
  const pngs = isolated.assetRequests.filter(asset => asset.endsWith('.png'));
  assert.deepEqual([...new Set(pngs)].sort(), [
    'assets/combat-sprite-atlas.png',
    'assets/levels/level-01-shattered-meridian.png',
  ]);
  assert.equal(pngs.length, 2, 'Menu assets should each be requested once');
});

test('campaign preloads only the selected stage and encounter artwork', () => {
  const isolated = createGame(); isolated.api.draw(); isolated.api.start();
  const pngs = isolated.assetRequests.filter(asset => asset.endsWith('.png'));
  const destruction=JSON.parse(fs.readFileSync(path.join(root,'assets/destruction/manifest.json'),'utf8')).sources['assets/minibosses/elite-01-shattered-meridian-atlas-alpha-v2.png'];
  const prepared=[destruction.core,...destruction.parts.map(part=>part.file),'assets/destruction/joint-caps.png'];
  assert.equal(new Set(pngs).size, 29+prepared.length);
  assert.equal(pngs.length, 29+prepared.length, 'Preload must be idempotent');
  for(const file of prepared)assert.ok(pngs.includes(file),'Selected first-stage prepared anatomy must be ready before combat');
  assert.ok(pngs.some(asset => asset.includes('bloodstar-phase1-4frame')));
  assert.ok(!pngs.some(asset => /bloodstar-phase\d-node\d-pixel/.test(asset)), 'Legacy floating core overlays should not be fetched');
  assert.ok(pngs.some(asset => asset.includes('elite-01-')));
  assert.ok(!pngs.some(asset => /boss-0[2-9]-|boss-10-|elite-0[2-9]-|level-0[2-9]-/.test(asset)), 'First stage should not fetch later encounters');
});

test('direct Void Leviathan lab loads both selected phases without Bloodstar layers', () => {
  const isolated = createGame(); isolated.api.draw(); isolated.api.startBossLab(5);
  const pngs = isolated.assetRequests.filter(asset => asset.endsWith('.png'));
  for (const phase of [1, 2]) {
    assert.ok(pngs.some(asset => asset.includes(`boss-06-void-leviathan-phase${phase}-granular-16frame`)), `Missing coherent authored phase ${phase}`);
  }
  assert.ok(!pngs.some(asset=>asset.includes('inbetweens-16frame')), 'Inconsistent generated organs must not be preloaded after their art is retired');
  assert.ok(!pngs.some(asset=>asset.includes('weak-mask')), 'Native-material rendering should not preload retired overlay masks');
  assert.ok(!pngs.some(asset => asset.includes('bloodstar')), 'Direct labs should not preload unrelated boss art');
  isolated.simulate(1);
});

test('sparse Bloodstar layers compact to correct sheet dimensions and preload once', () => {
  const isolated = createGame();
  const fixtures = [
    ['assets/bosses/weakpoint-atlases/bloodstar-phase1-node1-pixel-weakpoint-v3.png', 448, 1344],
    ['assets/bosses/weakpoint-atlases/bloodstar-phase1-tentacle1-remove-mask-v2.png', 448, 448],
    ['assets/bosses/weakpoint-atlases/bloodstar-phase1-tentacle1-fragment-v2.png', 448, 448],
  ];
  for (const [filename, width, height] of fixtures) {
    const before = isolated.assetRequests.length;
    const asset = isolated.api.loadBossAsset(filename, true);
    assert.equal(isolated.assetRequests.length, before, 'Creating lazy descriptors should not request their source');
    assert.equal(asset.ready, true, 'Reading ready should preload and prepare the source');
    assert.equal(asset.width, width); assert.equal(asset.height, height);
    assert.equal(asset.naturalWidth, width); assert.equal(asset.naturalHeight, height);
    assert.equal(asset.hasAlpha, true);
    asset.preload(); asset.preload(); assert.equal(asset.ready, true);
    assert.equal(isolated.assetRequests.length, before + 1);
  }
});

test('main boss artwork retains original natural dimensions after lazy loading', () => {
  const isolated = createGame();
  const filename = 'assets/bosses/boss-06-void-leviathan-phase1-granular-16frame-alpha-v3.png';
  const dimensions = pngDimensions(filename), asset = isolated.api.loadBossAsset(filename, true, true);
  assert.equal(asset.ready, true);
  assert.equal(asset.naturalWidth, dimensions[0]); assert.equal(asset.naturalHeight, dimensions[1]);
  assert.equal(asset.followBoss, true); assert.equal(asset.hasAlpha, true);
});

test('audio mixer pauses combat, toggles cleanly, and resumes explicitly', () => {
  api.start(); press('keydown', 'KeyZ'); simulate(.2);
  find('#audio-btn').onclick();
  assert.equal(api.state, 'paused'); assert.equal(api.player.charge, 0);
  assert.equal(find('#audio-mixer').classList.contains('open'), true);
  find('#audio-btn').onclick();
  assert.equal(find('#audio-mixer').classList.contains('open'), false);
  assert.equal(api.state, 'paused');
  find('#pause-btn').onclick(); assert.equal(api.state, 'playing');
  find('#pause-btn').onclick(); assert.equal(api.state, 'paused');
  api.pause();
});

test('master mute persists across reload and restores the initial sound label', () => {
  const first = createGame();
  assert.equal(first.api.muted, false);
  first.find('#sound-btn').onclick();
  assert.equal(first.api.muted, true);
  assert.equal(first.find('#sound-btn').textContent, 'SOUND: OFF');
  assert.equal(first.storage.get('starfighterMuted'), 'true');
  const second = createGame({ initialStorage: first.storage });
  assert.equal(second.api.muted, true);
  assert.equal(second.find('#sound-btn').textContent, 'SOUND: OFF');
  second.api.start(); assert.equal(second.api.soundtrack.muted, true);
  second.find('#sound-btn').onclick();
  assert.equal(second.api.muted, false);
  const third = createGame({ initialStorage: second.storage });
  assert.equal(third.api.muted, false);
  assert.equal(third.find('#sound-btn').textContent, 'SOUND: ON');
});

test('menu intro uses the supplied track and stays continuous through front-end screens',()=>{
  const game=createGame(),{api,find}=game,music=api.soundtrack;
  assert.equal(music.src,'music/menu-intro.mp3');assert.equal(music.loop,true);assert.equal(music.volume,.3);assert.equal(music.paused,false);
  music.currentTime=23.75;const loads=music.loadCount,plays=music.playCount;
  find('#rush-mode-btn').onclick();find('#garage-menu-btn').onclick();find('#garage-back-btn').onclick();
  find('#profiles-menu-btn').onclick();find('#profiles-back-btn').onclick();api.openLootGuide();api.goMenu();
  api.profile.progress.missionsCleared[0]=true;api.openMissionSelect();api.goMenu();find('#boss-lab-menu-btn').onclick();api.goMenu();
  assert.equal(music.src,'music/menu-intro.mp3');assert.equal(music.currentTime,23.75);assert.equal(music.loadCount,loads);assert.equal(music.playCount,plays,'Menu navigation must not stop or restart the title track');
});

test('menu intro yields to gameplay and returns without interfering with pause or Field Modules',()=>{
  const game=createGame(),{api}=game,music=api.soundtrack;
  api.start('story');assert.match(music.src,/^music\/level\d+\.mp3$/);const level=music.src;music.currentTime=18;
  api.presentTacticalRetrofit();assert.equal(music.src,level);assert.equal(music.paused,false);
  api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);api.pause();assert.equal(music.paused,true);
  game.sandbox.dispatchEvent({type:'focus'});assert.equal(music.paused,true);api.goMenu();assert.equal(music.src,'music/menu-intro.mp3');assert.equal(music.paused,false);
  api.start('rush');api.flushBossArrival();assert.match(music.src,/^music\/bosses\/boss\d+\.mp3$/);api.goMenu();assert.equal(music.src,'music/menu-intro.mp3');
});

test('menu intro retries browser-blocked autoplay on clicks and keyboard input',()=>{
  for(const input of ['pointerdown','keydown']){
    const game=createGame({blockFirstMusicPlay:true}),music=game.api.soundtrack;assert.equal(music.paused,true);assert.equal(music.loadCount,1);
    if(input==='pointerdown')game.document.dispatchEvent({type:input,target:game.find('#audio-btn')});
    else game.sandbox.dispatchEvent({type:input,code:'ArrowDown',target:game.find('#game')});
    assert.equal(music.paused,false);assert.equal(music.loadCount,1);assert.equal(music.src,'music/menu-intro.mp3');
  }
});

test('menu intro respects saved volume, mute, help and hidden tabs without losing its position',()=>{
  const game=createGame({initialStorage:[['starfighterMusicVolume','.17'],['starfighterMuted','true']]}),{api,document,find}=game,music=api.soundtrack;
  assert.equal(music.volume,.17);assert.equal(music.muted,true);music.currentTime=31;
  find('#sound-btn').onclick();assert.equal(music.muted,false);
  find('#music-volume').value=24;find('#music-volume').dispatchEvent({type:'input'});assert.equal(music.volume,.24);
  const src=music.src,loads=music.loadCount;document.hidden=true;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,true);
  document.hidden=false;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,false);
  document.querySelectorAll('[data-flight-deck]')[0].dispatchEvent({type:'click'});assert.equal(music.paused,true);
  game.sandbox.dispatchEvent({type:'focus'});assert.equal(music.paused,true);find('#deck-close').dispatchEvent({type:'click'});assert.equal(music.paused,false);
  assert.equal(music.currentTime,31);assert.equal(music.src,src);assert.equal(music.loadCount,loads);
});

test('preference storage errors show status while the help dialog remains usable', () => {
  const isolated = createGame({ failSet: true }); isolated.api.start();
  const trigger = isolated.document.querySelectorAll('[data-flight-deck]')[0];
  trigger.dispatchEvent({ type: 'click' });
  assert.equal(isolated.api.state, 'paused');
  isolated.find('#clear-combat').checked = true;
  isolated.find('#clear-combat').dispatchEvent({ type: 'change' });
  assert.equal(isolated.sandbox.STARFIGHTER_SETTINGS.clearCombat, true);
  assert.equal(isolated.document.documentElement.classList.contains('clear-combat'), true);
  assert.match(isolated.find('#display-status').textContent, /active for this tab.*storage is unavailable/i);
  isolated.find('#deck-close').dispatchEvent({ type: 'click' });
  assert.equal(isolated.find('#flight-deck').open, false);
  trigger.dispatchEvent({ type: 'click' });
  assert.equal(isolated.find('#flight-deck').open, true);
  isolated.find('#deck-close').dispatchEvent({ type: 'click' });
  isolated.api.pause(); assert.equal(isolated.api.state, 'playing');
});

test('miniboss health is halved without changing its three-core damage budget', () => {
  const isolated = createGame();
  for (let index = 0; index < 10; index++) {
    isolated.api.startLevelLab(index); isolated.api.makeMiniBoss();
    const elite = isolated.api.miniBoss, prior = index === 0 ? 240 : 220 + (index+1)*24;
    assert.ok(elite.max > 0 && elite.max <= prior*.6, `Elite ${index+1} should be substantially shorter than its previous ${prior} HP`);
    assert.equal(elite.weakNodes.length, 3);
    assert.ok(Math.abs(elite.weakNodes.reduce((total, node) => total+node.max, 0)-elite.max) < 1e-9);
    assert.equal(elite.hp, elite.max);
  }
});

test('shared rendered transforms keep weakpoint collisions registered under impact and recoil', () => {
  const isolated = createGame(), { api: art } = isolated, ctx = art.drawingContext;
  const verify = enemy => {
    enemy.x = 715; enemy.y = 263; enemy.intro = 0;
    enemy.hitFlash = .14; enemy.recoil = .7; enemy.prismRecoil = .8; enemy.gravebellRecoil = .7; enemy.solarHydraRecoil = .6; enemy.omegaHeartRecoil = .5;
    for (const clock of [0, .17, .63, 1.4, 3.1]) {
      enemy.clock = clock; art.setTime(clock+.09);
      ctx.save(); ctx.resetTransform(); art.applyPose(enemy, true);
      const matrix = ctx.getTransform();
      for (const node of art.activeWeakNodes(enemy)) {
        const local = art.localNode(enemy, node), rendered = matrix.transformPoint({ x: local.dx, y: local.dy }), collision = art.worldWeakNode(enemy, node);
        assert.ok(Number.isFinite(collision.x) && Number.isFinite(collision.y) && collision.r > 0);
        assert.ok(Math.hypot(rendered.x-collision.x, rendered.y-collision.y) < 1e-8, `${enemy.kind} ${enemy.type} node must match the actual canvas matrix`);
      }
      ctx.restore();
    }
  };
  for (let index = 0; index < 10; index++) {
    art.startBossLab(index); for (const phase of [1, 2]) { art.boss.phase = phase; verify(art.boss); }
    art.startLevelLab(index); art.makeMiniBoss(); verify(art.miniBoss);
  }
  for (let index = 0; index < 2; index++) {
    art.startEpicBossLab(index); for (const phase of [1, 2, 3, 4]) { art.boss.phase = phase; verify(art.boss); }
  }
  ctx.trace = null;
});

test('miniboss sockets follow the chosen native sprite frame and stay inside its source cell', () => {
  const isolated = createGame(), { api: art } = isolated, ctx = art.drawingContext;
  const create=isolated.document.createElement;isolated.document.createElement=tag=>{const view=create(tag);if(tag==='canvas')view.getContext('2d').trace=[];return view};
  assert.equal(art.miniCoreTracks.length, 10);
  for (let index = 0; index < 10; index++) {
    art.startLevelLab(index); art.makeMiniBoss();
    const enemy = art.miniBoss; enemy.x = 710; enemy.y = 260; enemy.animOffset = 0; enemy.weakOpen = true; enemy.coreAperture = 1; enemy.recoil = 0;
    assert.equal(art.miniCoreTracks[index].length, 16);
    for (let frame = 0; frame < 16; frame++) {
      assert.equal(art.miniCoreTracks[index][frame].length, 3);
      for (const point of art.miniCoreTracks[index][frame]) assert.ok(point.length === 2 && point.every(Number.isFinite));
      enemy.clock = frame / enemy.def.rate; enemy.hitFlash = .11;
      const selected = art.miniFrame(enemy), sw = 384, sh = 256, cellX = selected%4*sw, cellY = Math.floor(selected/4)*sh;
      for (const node of enemy.weakNodes) {
        const local = art.localNode(enemy, node), point = art.miniCoreTracks[index][selected][node.miniIndex];
        assert.deepEqual([local.dx, local.dy], [point[0], point[1]]);
        assert.ok(Math.abs(local.dx) < enemy.def.w/2 && Math.abs(local.dy) < enemy.def.h/2, `Elite ${index+1} socket must sit inside its authored body cell`);
      }
      ctx.trace = []; art.materialContext.trace=[]; art.drawWeakPoints(enemy);
      const samples = art.materialContext.trace.filter(record=>record.op==='drawImage').map(record=>[...art.nativePaletteCache.values()].find(palette=>[palette.sealed,palette.hot,palette.emission].includes(record.image)));
      assert.ok(samples.length >= 3, 'Every native socket should sample its own material');
      for (const sample of samples) {
        const view=sample?.sourceAsset,bounded=view?.frameSample;assert.ok(bounded,'Miniboss materials must pass through a frame-bounded transparent view');
        assert.ok(bounded.source.sourcePath?.endsWith(enemy.def.file),'Every selected material layer must come from this miniboss native sheet');
        assert.deepEqual([bounded.bounds.x,bounded.bounds.y,bounded.bounds.w,bounded.bounds.h],[cellX,cellY,sw,sh],'The material guard must select the same native body frame');
        assert.deepEqual([sample.sourceRect.x,sample.sourceRect.y,sample.sourceRect.w,sample.sourceRect.h],[0,0,96,96],'Padded views retain the complete palette coordinate plane');
        const draws=view.getContext('2d').trace.filter(record=>record.op==='drawImage');assert.equal(draws.length,1,'A bounded material view samples its own native frame exactly once');
        const [,sx,sy,width,height,dx,dy,dw,dh]=draws[0].args;
        assert.ok(sx >= cellX-1e-6 && sy >= cellY-1e-6 && sx+width <= cellX+sw+1e-6 && sy+height <= cellY+sh+1e-6, `Elite ${index+1} frame ${selected} material sample must not bleed from another atlas cell`);
        const rect=bounded.rect;for(const[actual,expected]of[[dx,(sx-rect.x)/rect.w*96],[dy,(sy-rect.y)/rect.h*96],[dw,width/rect.w*96],[dh,height/rect.h*96]])assert.ok(Math.abs(actual-expected)<1e-8,'Clipped source pixels retain their original position inside the transparent96px plane');
      }
    }
    if (index === 0) {
      enemy.recoil = 0;
      for (let step = 0; step < 48; step++) { enemy.clock = step/enemy.def.rate; assert.ok(![3,5,10,13].includes(art.miniFrame(enemy)), 'White armor sweeps belong to attack accents, not the idle loop'); }
      const beforeRecoil=art.miniFrame(enemy);enemy.recoil=.8;assert.equal(art.miniFrame(enemy),beforeRecoil,'A firing accent must not jump to an unrelated whole-body frame');
    }
  }
  ctx.trace = art.materialContext.trace = null;
});

test('composited material socket centers agree with their hit centers in damaged and destroyed states', () => {
  const isolated = createGame(), { api: art } = isolated, ctx = art.drawingContext, scratch=art.bloodstarContext;
  const check = enemy => {
    enemy.x=710; enemy.y=262; enemy.intro=0; enemy.hitFlash=.13; enemy.clock=.61; enemy.recoil=.5;
    enemy.prismRecoil=.7; enemy.gravebellRecoil=.5; enemy.solarHydraRecoil=.4; enemy.omegaHeartRecoil=.6;
    art.setTime(.73);
    for (const destroyed of [false, true]) {
      enemy.weakOpen = true;
      for (const node of art.activeWeakNodes(enemy)) { node.hp=node.max*.3; node.destroyed=destroyed; }
      ctx.trace=[];scratch.trace=[];art.fractureContext.trace=[];ctx.resetTransform();art.setShake(0);art.draw();
      if(destroyed&&(enemy.kind==='mini'||enemy.epic||enemy.type!==0)){
        assert.equal([...ctx.trace,...art.fractureContext.trace].some(record=>record.composite==='destination-out'),false,'Prepared anatomy cannot cut holes from the displayed body');
        assert.ok(ctx.trace.some(record=>record.op==='drawImage'&&record.image?.destructionComposite),'Destroyed outer assemblies must select actual prepared body/part sprites');
      }
      const visibleNodes=art.activeWeakNodes(enemy).filter(node=>!art.nativeSocketRemoved(enemy,node));
      const origins=enemy.kind==='boss'&&!enemy.epic&&enemy.type===0
        ?(()=>{
          const passes=bloodstarBodyPasses(art,ctx.trace,scratch.trace),weight=passes.reduce((sum,pass)=>sum+pass.body.alpha,0);
          return art.activeWeakNodes(enemy).map((_,index)=>({x:passes.reduce((sum,pass)=>sum+pass.centers[index].x*pass.body.alpha,0)/weight,y:passes.reduce((sum,pass)=>sum+pass.centers[index].y*pass.body.alpha,0)/weight}));
        })()
        :ctx.trace.filter(record=>record.op==='drawImage'&&record.image===art.materialBuffer).map(record=>{
          const [,x,y,width,height]=record.args,[a,b,c,d,e,f]=record.matrix,px=x+width/2,py=y+height/2;
          return{x:a*px+c*py+e,y:b*px+d*py+f}
        });
      assert.ok(origins.length>=visibleNodes.length, 'Each remaining native socket must be painted into the body pass');
      for (const node of visibleNodes) {
        const target=art.worldWeakNode(enemy,node), nearest=Math.min(...origins.map(point=>Math.hypot(point.x-target.x,point.y-target.y)));
        assert.ok(nearest<.05, `${enemy.kind} ${enemy.type} phase ${enemy.phase||1} ${destroyed?'destroyed':'damaged'} socket origin drifted ${nearest.toFixed(3)}px from its collision`);
      }
    }
  };
  for (let index=0;index<10;index++) {
    art.startBossLab(index);for(const phase of[1,2]){art.boss.phase=phase;check(art.boss)}
    art.startLevelLab(index);art.makeMiniBoss();check(art.miniBoss);
  }
  for(let index=0;index<2;index++){art.startEpicBossLab(index);for(const phase of[1,2,3,4]){art.boss.phase=phase;check(art.boss)}}
  ctx.trace=scratch.trace=null;
});

test('late-boss sockets sample the same native pose and material opacity as their body, including inbetweens', () => {
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext,materials=art.materialContext;
  const verify=enemy=>{
    enemy.x=710;enemy.y=263;enemy.intro=0;enemy.hitFlash=0;enemy.weakOpen=true;enemy.ritual=null;
    enemy.prismRecoil=.6;enemy.gravebellRecoil=.7;enemy.solarHydraRecoil=.5;enemy.omegaHeartRecoil=.4;
    for(const node of art.activeWeakNodes(enemy)){node.destroyed=false;node.hp=node.max*.8}
    const seen=new Set();
    for(let step=0;step<32;step++){
      enemy.clock=step*.137;enemy.chargeWindow=1.35*(1-step/32);enemy.voidAnimWindow=0;art.setTime(enemy.clock);art.setShake(0);
      const frame=art.lateFrame(enemy),left=frame.frame%4*frame.cellW,top=Math.floor(frame.frame/4)*frame.cellH;
      seen.add(`${frame.source.sourcePath||'inbetween'}:${frame.frame}`);
      ctx.trace=[];materials.trace=[];art.draw();
      const body=ctx.trace.find(record=>record.op==='drawImage'&&record.image===frame.source);
      assert.ok(body,'Selected native body cell must be drawn');
      const bounds=frame.sourceBounds||[0,0,frame.cellW,frame.cellH],sourceRect=[left+bounds[0],top+bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1]];
      assert.deepEqual(body.args.slice(1,5),sourceRect);
      const patches=materials.trace.filter(record=>record.op==='drawImage');
      assert.equal(patches.length,art.activeWeakNodes(enemy).length*3,'Each live core should compose its selected sealed, hot and emissive native texels');
      for(let index=0;index<patches.length;index++){
        const patch=patches[index],palette=[...art.nativePaletteCache.values()].find(item=>[item.sealed,item.hot,item.emission].includes(patch.image));
        assert.ok(palette,'Material layers must come from a bounded source palette');
        assert.equal(palette.sourceAsset,frame.source,'Body and sockets must share the same coherent native pose texture');
        const{x,y,w:width,h:height}=palette.sourceRect;
        const centerX=x+width/2,centerY=y+height/2;
        assert.ok(centerX>=sourceRect[0]-.5&&centerY>=sourceRect[1]-.5&&centerX<=sourceRect[0]+sourceRect[2]+.5&&centerY<=sourceRect[1]+sourceRect[3]+.5,`${enemy.epic?'epic':'boss'} ${enemy.type} phase${enemy.phase} socket center must stay inside the selected body's recovered source bounds`);
      }
      const stamps=ctx.trace.filter(record=>record.op==='drawImage'&&record.image===art.materialBuffer);
      assert.equal(stamps.length,art.activeWeakNodes(enemy).length);
      assert.ok(stamps.every(record=>record.composite==='source-atop'),'Only existing native body alpha may receive socket paint');
    }
    assert.ok(seen.size>=12,'Inspection must cover many distinct native poses and inbetweens');
  };
  for(let index=5;index<10;index++){art.startBossLab(index);for(const phase of[1,2]){art.boss.phase=phase;verify(art.boss)}}
  for(let index=0;index<2;index++){art.startEpicBossLab(index);for(const phase of[1,2,3,4]){art.boss.phase=phase;verify(art.boss)}}
  ctx.trace=materials.trace=null;
});

test('all ten direct miniboss tests use the halved campaign budget without saving rewards', () => {
  const isolated=createGame(),{api:art}=isolated,profile=JSON.stringify(art.profile);
  for(let index=0;index<10;index++){
    art.startMiniBossLab(index);
    assert.equal(art.state,'playing');assert.equal(art.bossLab,true);assert.equal(art.bossLabMini,true);
    assert.equal(art.miniBoss.type,index);assert.equal(art.miniBoss.max,index===0?120:110+(index+1)*12);
    assert.equal(art.player.laserLevel,3);assert.equal(art.player.pod.owned,true);
    art.player.inv=1e6;art.skipBossLabSegment();isolated.simulate(1.5);
    assert.equal(art.state,'bosslab');assert.equal(art.runLoot.length,0);
    assert.equal(JSON.stringify(art.profile),profile,'Direct testing must not mutate real progression or gear');
  }
});

test('art inspection previews all material states and restores target phases, nodes, and combat state', () => {
  const isolated=createGame(),{api:art}=isolated;
  const check=launch=>{
    launch();art.player.inv=1e6;isolated.simulate(.2);
    const enemy=art.boss||art.miniBoss,before=JSON.stringify(enemy),profile=JSON.stringify(art.profile),clock=art.time,elapsed=art.runElapsed;
    const effects={shots:art.shots,enemyShots:art.enemyShots,pickups:art.pickups,particles:art.particles,debris:art.debris,bossFragments:art.bossFragments};
    const sentinels={shots:{x:333,y:200,vx:123,vy:-3,r:3,d:1},enemyShots:{x:530,y:210,vx:-90,vy:1,r:4,damage:1},pickups:{x:350,y:315,r:8,type:'shield',spin:.25},particles:{x:100,y:100,vx:5,vy:0,life:.6,max:.6,c:'#fff',s:2},debris:{x:200,y:200,vx:0,vy:0,life:1,max:1,rot:0,vr:0,size:4,shape:5,color:'#fff',smoke:.3},bossFragments:{x:300,y:200,vx:0,vy:0,life:1,max:1,rot:0,vr:0,w:5,h:3,color:'#fff',smoke:.3}};
    for(const[key,array]of Object.entries(effects))array.push(sentinels[key]);
    const savedEffects=JSON.stringify(effects);
    art.openArtInspection();
    assert.equal(art.state,'art');assert.equal(isolated.find('#art-inspector').hidden,false);
    assert.equal(art.soundtrack.paused,true);
    for(const[key,array]of Object.entries(effects)){assert.notEqual(art[key],array,'Preview effects need isolated arrays');assert.equal(art[key].length,0);assert.equal(array.at(-1),sentinels[key])}
    // A frozen pose must remain stable even while the abandoned combat camera
    // still has shake energy. Use the stage view to exercise its camera path.
    if(art.artInspection.isolate)isolated.find('#art-stage-btn').onclick();
    art.setShake(10);const ctx=art.drawingContext;ctx.trace=[];art.draw();
    const frozen=ctx.trace.filter(record=>record.op==='drawImage').map(record=>record.matrix);
    ctx.trace=[];art.draw();assert.deepEqual(ctx.trace.filter(record=>record.op==='drawImage').map(record=>record.matrix),frozen,'Frozen inspection must not jitter with the combat camera');ctx.trace=null;
    const states=isolated.document.querySelectorAll('[data-art-state]');assert.equal(states.length,5);
    for(const button of states){
      button.onclick();const mode=button.dataset.artState;
      assert.equal(art.artInspection.mode,mode);assert.equal(button.getAttribute('aria-pressed'),'true');
      for(const node of art.activeWeakNodes(enemy)){
        assert.equal(node.destroyed,mode==='destroyed');
        assert.equal(node.hp,node.max*(mode==='destroyed'?0:mode==='damaged'?.32:1));
      }
      art.draw();isolated.find('#art-step-btn').onclick();
      if(enemy.kind==='boss')isolated.find('#art-phase-btn').onclick();
      assert.equal(art.state,'art','Previewing a destroyed phase cannot grant victory or begin a ritual');
      assert.equal(art.runElapsed,elapsed);assert.equal(JSON.stringify(art.profile),profile);
    }
    isolated.find('#art-motion-btn').onclick();assert.equal(art.artInspection.motion,true);
    art.loop(100);art.loop(200);assert.ok(art.time>clock);assert.equal(art.runElapsed,elapsed);
    isolated.find('#art-close-btn').onclick();
    assert.equal(art.state,'playing');assert.equal(art.artInspection,null);assert.equal(art.time,clock);
    assert.equal(JSON.stringify(enemy),before,'Every node property and backed-up animation/combat field must restore exactly');
    for(const[key,array]of Object.entries(effects))assert.equal(art[key],array,'Returning to combat must restore the original effect array reference');
    assert.equal(JSON.stringify(effects),savedEffects,'Projectiles, salvage, particles, and debris must not advance or disappear while inspecting');
    assert.equal(isolated.find('#art-inspector').hidden,true);assert.equal(art.soundtrack.paused,false);
  };
  check(()=>art.startMiniBossLab(0));check(()=>art.startBossLab(2));check(()=>art.startEpicBossLab(1));
});

test('art inspection is restricted to test mode and preserves a paused entry', () => {
  const isolated=createGame(),{api:art}=isolated;
  art.start();art.makeMiniBoss();art.openArtInspection();
  assert.equal(art.state,'playing');assert.equal(art.artInspection,null);
  art.startBossLab(0);art.pause();art.openArtInspection();assert.equal(art.state,'art');
  isolated.sandbox.dispatchEvent({type:'keydown',code:'KeyQ',target:isolated.document.body});
  assert.equal(art.player.dose,100,'Preview shortcuts must not fire combat weapons');
  isolated.sandbox.dispatchEvent({type:'keydown',code:'Escape',target:isolated.document.body,preventDefault(){}});
  assert.equal(art.state,'paused');assert.equal(art.soundtrack.paused,true);assert.equal(art.artInspection,null);
});

test('native late-boss socket anchors land on opaque source material in every active pose', () => {
  const isolated=createGame(),{api:art}=isolated,empty=[];let checked=0,expected=0;
  const verify=enemy=>{
    enemy.intro=0;enemy.hitFlash=0;const seen=new Set();
    for(let step=0;step<256;step++){
      enemy.clock=step*.02;enemy.chargeWindow=1.35*(1-step/256);enemy.voidAnimWindow=0;
      const frame=art.lateFrame(enemy),filename=frame.source.sourcePath||frame.source.src,key=`${filename}:${frame.frame}`;
      assert.ok(filename,'Every native body or prepared inbetween needs source metadata for inspection');
      if(seen.has(key))continue;seen.add(key);
      const png=pngMaterial(filename),scaleX=png.width/(frame.source.naturalWidth||frame.source.width),scaleY=png.height/(frame.source.naturalHeight||frame.source.height);
      for(let index=0;index<art.activeWeakNodes(enemy).length;index++){
        const point=frame.pointAt(index),x=Math.round((frame.frame%4*frame.cellW+point[0])*scaleX),y=Math.round((Math.floor(frame.frame/4)*frame.cellH+point[1])*scaleY);
        checked++;
        const p=y*png.width+x;
        if(x<0||x>=png.width||y<0||y>=png.height||png.alpha[p]<128||png.light[p]<24)empty.push(`${enemy.epic?'epic'+enemy.epicId:'boss'+enemy.type} phase${enemy.phase} ${path.basename(filename)} cell${frame.frame} node${index} @${x},${y} a${png.alpha[p]} light${png.light[p]}`);
      }
    }
    const poseCount=!enemy.epic&&enemy.type===6?32:16;
    assert.equal(seen.size,poseCount,'Source inspection must cover every coherent pose used by this boss');expected+=poseCount*art.activeWeakNodes(enemy).length;
  };
  for(let index=5;index<10;index++){art.startBossLab(index);for(const phase of[1,2]){art.boss.phase=phase;verify(art.boss)}}
  for(let index=0;index<2;index++){art.startEpicBossLab(index);for(const phase of[1,2,3,4]){art.boss.phase=phase;verify(art.boss)}}
  assert.equal(checked,expected,'The anatomical inspection must cover every active socket in every shipping pose');assert.ok(checked>=1200);
  assert.equal(empty.length,0,`${empty.length}/${checked} native socket centers sampled transparent or empty background:\n${empty.slice(0,20).join('\n')}`);
});

test('every authored miniboss socket anchor sits on opaque native armor in all sixteen source poses',()=>{
  const isolated=createGame(),{api:art}=isolated,empty=[];
  for(let index=0;index<10;index++){
    art.startMiniBossLab(index);const enemy=art.miniBoss,png=pngMaterial('assets/minibosses/'+enemy.def.file),sw=png.width/4,sh=png.height/4;
    for(let frame=0;frame<16;frame++)for(let node=0;node<3;node++){
      const[dx,dy]=art.miniCoreTracks[index][frame][node],x=Math.round((frame%4+.5+dx/enemy.def.w)*sw),y=Math.round((Math.floor(frame/4)+.5+dy/enemy.def.h)*sh),p=y*png.width+x;
      if(png.alpha[p]<128)empty.push(`elite${index+1} frame${frame} node${node} @${x},${y} alpha${png.alpha[p]}`);
    }
  }
  assert.equal(empty.length,0,`${empty.length}/480 miniboss socket centers sampled transparent background:\n${empty.slice(0,20).join('\n')}`);
});

test('every Bloodstar socket is centered on native material in both four-pose phase sheets',()=>{
  const isolated=createGame(),{api:art}=isolated,empty=[];let checked=0;
  for(let phase=0;phase<2;phase++){
    const filename=`assets/bosses/boss-01-bloodstar-phase${phase+1}-4frame-alpha-v4.png`,png=pngMaterial(filename),sw=png.width/2,sh=png.height/2;
    for(let frame=0;frame<4;frame++)for(let node=0;node<8;node++){
      const point=art.bloodstarPoints[phase][frame][node],x=frame%2*sw+point[0],y=Math.floor(frame/2)*sh+point[1],p=y*png.width+x;checked++;
      if(png.alpha[p]<128||png.light[p]<24)empty.push(`phase${phase+1} frame${frame} node${node} @${x},${y} alpha${png.alpha[p]} light${png.light[p]}`);
    }
  }
  assert.equal(checked,64);
  assert.equal(empty.length,0,`${empty.length}/64 Bloodstar anchors sampled empty space:\n${empty.join('\n')}`);
});

test('Bloodstar sockets belong to each native body frame before blending and remain registered during transitions',()=>{
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext,scratch=art.bloodstarContext,materials=art.materialContext;art.startBossLab(0);
  const enemy=art.boss;enemy.x=710;enemy.y=263;enemy.intro=0;enemy.hitFlash=0;enemy.weakOpen=true;enemy.weakTimer=0;enemy.queuedAttack=null;
  for(const phase of[1,2]){
    enemy.phase=phase;const nodes=art.activeWeakNodes(enemy),rate=phase===1?2.45:3.15;
    for(const node of nodes){node.destroyed=false;node.hp=node.max}
    for(let frame=0;frame<4;frame++)for(const fraction of[.2,.9]){
      enemy.clock=(frame+fraction)/rate;ctx.trace=[];scratch.trace=[];materials.trace=[];ctx.resetTransform();art.setShake(0);art.draw();
      const passes=bloodstarBodyPasses(art,ctx.trace,scratch.trace),masks=materials.trace.filter(record=>record.op==='drawImage'&&record.composite==='destination-in');
      assert.equal(passes.length,fraction<.8?1:2,'A transition must blend its two completed native body frames');
      assert.equal(masks.length,passes.length*nodes.length);
      assert.equal(ctx.trace.filter(record=>record.op==='drawImage'&&record.image===art.materialBuffer).length,0,'No separate socket patch may follow the assembled Bloodstar body');
      for(let pass=0;pass<passes.length;pass++)for(let index=0;index<nodes.length;index++){
        const pose=(frame+pass)%4,[x,y]=art.bloodstarPoints[phase-1][pose][index],mask=masks[pass*nodes.length+index];
        assert.equal(mask.args[1]+mask.args[3]/2,pose%2*627+x);assert.equal(mask.args[2]+mask.args[4]/2,Math.floor(pose/2)*627+y);
        const mark=passes[pass].marks[index],[,dx,dy,dw,dh]=mark.args,[a,b,c,d,e,f]=mark.matrix,px=dx+dw/2,py=dy+dh/2;
        assert.ok(Math.abs(a*px+c*py+e-x/627*art.bloodstarScratch.width)<1e-8&&Math.abs(b*px+d*py+f-y/627*art.bloodstarScratch.height)<1e-8,'The recolored source patch must land on the same native pixel inside its own body frame');
      }
      const weight=passes.reduce((sum,pass)=>sum+pass.body.alpha,0);
      nodes.forEach((node,index)=>{
        const actual={x:passes.reduce((sum,pass)=>sum+pass.centers[index].x*pass.body.alpha,0)/weight,y:passes.reduce((sum,pass)=>sum+pass.centers[index].y*pass.body.alpha,0)/weight},target=art.worldWeakNode(enemy,node);
        assert.ok(Math.hypot(actual.x-target.x,actual.y-target.y)<1e-7,'The body transition and collision must follow the same interpolated socket center');
      });
    }
  }
  ctx.trace=scratch.trace=materials.trace=null;
});

test('Bloodstar emission turns yellow without bleaching its native armor, shadows, alpha or texture',()=>{
  const isolated=createGame(),{api:art}=isolated;let changed=0,strong=0;
  const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
  for(let phase=1;phase<=2;phase++){
    const png=pngMaterial(`assets/bosses/boss-01-bloodstar-phase${phase}-4frame-alpha-v4.png`,true),pixels=[];
    for(let frame=0;frame<4;frame++)for(let node=0;node<8;node++){
      const[cx,cy]=art.bloodstarPoints[phase-1][frame][node],rx=node<2?15:20,ry=node<2?22:18;
      for(let y=cy-ry;y<cy+ry;y++)for(let x=cx-rx;x<cx+rx;x++){
        const at=((Math.floor(frame/2)*png.height/2+y)*png.width+frame%2*png.width/2+x)*4;pixels.push(...png.rgba.subarray(at,at+4));
      }
    }
    const native=Uint8ClampedArray.from(pixels);
    const untouched=native.slice();art.recolorBloodstarMaterial(untouched,0);assert.deepEqual(untouched,native,'Zero heat must retain the original source palette');
    const yellow=native.slice(),bright=native.slice();art.recolorBloodstarMaterial(yellow,1);art.recolorBloodstarMaterial(bright,2);
    for(let at=0;at<native.length;at+=4){
      const[r,g,b,a]=native.subarray(at,at+4),eligible=r>110&&r-g>40&&r-b>35;
      assert.equal(yellow[at+3],a);assert.equal(bright[at+3],a);
      if(!eligible){assert.deepEqual(yellow.subarray(at,at+3),native.subarray(at,at+3),'Nonemissive armor and shadows must keep their exact original RGB');assert.deepEqual(bright.subarray(at,at+3),native.subarray(at,at+3))}
      if(a<128)continue;
      if(yellow[at]!==r||yellow[at+1]!==g||yellow[at+2]!==b)changed++;
      assert.ok(!(bright[at]>220&&bright[at+1]>220&&bright[at+2]>220)||r>220&&g>220&&b>220,'The palette must not introduce new white patches');
      if(r>=175&&r-Math.max(g,b)>=85){
        strong++;
        assert.ok(yellow[at+1]>=yellow[at]*.74&&yellow[at+2]<yellow[at]*.13,'Strong native emission should become saturated yellow');
        assert.ok(luma(...yellow.subarray(at,at+3))>luma(r,g,b),'Yellow exposure should raise the emission luminance');
        assert.ok(luma(...bright.subarray(at,at+3))>luma(...yellow.subarray(at,at+3)),'Bright yellow should be stronger than the opening yellow');
      }
    }
  }
  assert.ok(changed>1000&&strong>1000,'The real source atlas must exercise a substantial amount of emissive material');
  for(const heat of[1,2]){
    const ramp=new Uint8ClampedArray([170,10,20,255,190,10,20,255,210,10,20,255,230,10,20,255,250,10,20,255]);art.recolorBloodstarMaterial(ramp,heat);
    const values=Array.from({length:5},(_,i)=>luma(...ramp.subarray(i*4,i*4+3)));
    assert.ok(values.every((value,i)=>i===0||value>values[i-1]),'Brighter native ridges must remain brighter than their neighboring grooves');
  }
  art.startBossLab(0);const enemy=art.boss;
  for(const phase of[1,2]){
    enemy.phase=phase;enemy.clock=.6;enemy.weakOpen=false;enemy.weakTelegraph=0;assert.equal(art.bloodstarWeakHeat(enemy,0),0);
    const tell=phase===1?.55:.42,duration=phase===1?3.2:2.8,heats=[tell,tell/2,.000001].map(remaining=>{enemy.weakTelegraph=remaining;return art.bloodstarWeakHeat(enemy,0)});
    assert.ok(heats[0]===0&&heats[1]>heats[0]&&heats[2]>heats[1]&&heats[2]<1,'The sealed red emission should approach yellow continuously during its opening tell');
    enemy.weakOpen=true;enemy.weakTelegraph=0;enemy.weakTimer=duration;
    assert.ok(Math.abs(art.bloodstarWeakHeat(enemy,0)-heats[2])<.00001,'The opening tell and first exposed frame must meet without a palette jump');
    enemy.weakTimer=duration-.3;const hot=art.bloodstarWeakHeat(enemy,0);
    assert.ok(hot>1.8&&hot<=2,'An exposed socket should settle into the bright yellow range');
  }
});

test('Eventide body rendering clips the proven atlas-bleed strip in every native pose',()=>{
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext;art.startMiniBossLab(8);
  const enemy=art.miniBoss;enemy.animOffset=0;enemy.hitFlash=0;enemy.intro=0;
  for(let frame=0;frame<16;frame++){
    enemy.clock=(frame+.1)/enemy.def.rate;ctx.trace=[];art.setShake(0);art.draw();
    const at=ctx.trace.findIndex(record=>record.op==='drawImage'&&record.args[0].includes('elite-09-')&&record.args.length===9);
    assert.ok(at>=0,'The native Eventide body must be drawn');
    const body=ctx.trace[at],clip=ctx.trace.slice(0,at).filter(record=>record.op==='rect').at(-1),[,sx,sy,sw,sh,x,y,width,height]=body.args;
    assert.ok(clip,'Eventide body should establish a source-registered clip before its native image draw');
    const expected=[x,y+height*18/256,width,height*238/256];
    assert.ok(clip.args.every((value,index)=>Math.abs(value-expected[index])<1e-8),'Only the measured 18-of-256-pixel source strip should be excluded');
    const selected=art.miniFrame(enemy);assert.equal(sx,(selected%4)*sw);assert.equal(sy,Math.floor(selected/4)*sh);
  }
  ctx.trace=null;
});

test('high-DPI backing resolution preserves logical flight, pointer coordinates, and socket registration',()=>{
  for(const scenario of[{devicePixelRatio:2,canvasRect:{width:960,height:540}},{devicePixelRatio:1,canvasRect:{width:1920,height:1080}},{devicePixelRatio:4,canvasRect:{width:3840,height:2160}}]){
    const isolated=createGame(scenario),canvas=isolated.find('#game');
    assert.deepEqual(Array.from(isolated.api.logicalSize),[960,540]);
    assert.equal(canvas.width,1920);assert.equal(canvas.height,1080);
  }
  const isolated=createGame(),{api:art,sandbox}=isolated,canvas=isolated.find('#game'),ctx=art.drawingContext;
  art.startBossLab(6);const enemy=art.boss;enemy.x=715;enemy.y=260;enemy.clock=.61;enemy.intro=0;enemy.weakOpen=true;
  for(const node of art.activeWeakNodes(enemy))node.hp=node.max*.3;
  const pilot={x:art.player.x,y:art.player.y,r:art.player.r},before=art.activeWeakNodes(enemy).map(node=>art.worldWeakNode(enemy,node));
  canvas.cssRect={left:50,top:30,width:1920,height:1080};sandbox.dispatchEvent({type:'resize'});
  assert.equal(canvas.width,1920);assert.equal(canvas.height,1080);
  assert.deepEqual({x:art.player.x,y:art.player.y,r:art.player.r},pilot);
  const after=art.activeWeakNodes(enemy).map(node=>art.worldWeakNode(enemy,node));
  assert.deepEqual(after,before,'Resizing physical pixels must not move the logical weakpoint centers');
  canvas.dispatchEvent({type:'pointermove',clientX:530,clientY:840});
  assert.equal(art.mouse.x,240);assert.equal(art.mouse.y,405);assert.equal(art.mouse.inside,true);
  ctx.trace=[];art.setShake(0);art.draw();
  const centers=ctx.trace.filter(record=>record.op==='drawImage'&&record.image===art.materialBuffer).map(record=>{
    const[,x,y,width,height]=record.args,[a,b,c,d,e,f]=record.matrix,px=x+width/2,py=y+height/2;
    return{x:(a*px+c*py+e)/2,y:(b*px+d*py+f)/2}
  });
  for(const node of art.activeWeakNodes(enemy)){
    const target=art.worldWeakNode(enemy,node);
    assert.ok(centers.some(point=>Math.hypot(point.x-target.x,point.y-target.y)<.05),'Physical 2× body paint must agree with the unchanged logical hit center');
  }
  ctx.trace=null;art.player.inv=1e6;
  sandbox.dispatchEvent({type:'keydown',code:'ArrowRight',repeat:false,target:isolated.document.body});isolated.simulate(1);
  assert.ok(Math.abs(art.player.x-pilot.x-art.player.speed)<1e-6,'Backing pixel density must not change one-second flight distance');
  sandbox.dispatchEvent({type:'keyup',code:'ArrowRight',target:isolated.document.body});
  canvas.cssRect={left:0,top:0,width:960,height:540};sandbox.devicePixelRatio=1;isolated.document.dispatchEvent({type:'fullscreenchange'});
  assert.equal(canvas.width,960);assert.equal(canvas.height,540);
  assert.deepEqual(Array.from(art.logicalSize),[960,540]);
});

test('vulnerable sockets are brighter than tells and sealed armor while destroyed sockets stay subdued',()=>{
  const isolated=createGame(),{api:art}=isolated;
  const check=launch=>{
    launch();art.openArtInspection();const enemy=art.boss||art.miniBoss;enemy.clock=.61;art.setTime(.61);const paints={};
    for(const mode of['closed','opening','exposed','damaged','destroyed']){art.setInspectionMaterial(mode);paints[mode]=weakpointPaint(art,enemy)}
    const{closed,opening,exposed,damaged,destroyed}=paints,bloodstar=enemy.kind==='boss'&&!enemy.epic&&enemy.type===0;
    if(!bloodstar){
      assert.ok(exposed.hotStrength>opening.hotStrength*1.15,'Fully exposed material must use more of the native emissive palette than its opening tell');
      assert.ok(opening.hotStrength>closed.hotStrength,'Opening must introduce the emissive palette above sealed armor');
      assert.ok(exposed.color.every(record=>!record.filter.includes('brightness(')),'Vulnerable armor must not use a whole-material brightness filter');
    }else{
      assert.ok(exposed.color.every(record=>!record.filter.includes('brightness(')),'Bloodstar must use its native palette rather than bleaching the socket housing');
      for(const paint of Object.values(paints))assert.equal(paint.sceneStamps.length,0,'Bloodstar socket paint must belong to its body compositor, never a standalone scene patch');
    }
    assert.ok(damaged.peak>=exposed.peak*.9,'A damaged but vulnerable core must retain its readable highlight');
    assert.ok(destroyed.peak<closed.peak,'Destroyed native material should remain darker than sealed armor');
    if(enemy.kind==='mini'){
      for(const paint of Object.values(paints))assert.equal(paint.apertureArea,0,'Native emission must not be clipped into a synthetic rectangular shutter');
    }
    if(bloodstar){
      for(const paint of Object.values(paints)){
        const opacity=paint.native.filter(record=>record.composite==='destination-in');
        assert.equal(opacity.length,art.activeWeakNodes(enemy).length,'Every highlight state must restore each socket native alpha');
        for(const mask of opacity){
          assert.ok(mask.image.sourcePath?.includes('bloodstar-phase'),'Bloodstar opacity must still come from its original native phase sheet');
        }
      }
    }else{
      for(const paint of Object.values(paints))assert.ok(paint.onlySelectedLayers,'Every non-Bloodstar socket must stamp transparent native-material layers, never a whole cropped armor patch');
    }
    const glow=exposed.color.filter(record=>record.composite==='screen');assert.equal(glow.length,bloodstar?0:art.activeWeakNodes(enemy).length);
    if(bloodstar)assert.ok(exposed.stamps.every(record=>record.shadowBlur===0),'Bloodstar yellow emission must retain its native edge without an added halo');
    if(!bloodstar)for(const paint of Object.values(paints))for(const stamp of paint.stamps){
      assert.equal(stamp.shadowBlur,0,'Native emission must retain its authored contour without a floating halo');
      assert.equal(stamp.composite,'source-atop','Color layers must preserve the destination native alpha, including translucent edge pixels');
    }
    assert.equal(closed.color.filter(record=>record.composite==='screen').length,0);
    assert.equal(destroyed.color.filter(record=>record.composite==='screen').length,0);
    art.closeArtInspection();
  };
  for(let index=0;index<10;index++){check(()=>art.startMiniBossLab(index));check(()=>art.startBossLab(index))}
  for(let index=0;index<2;index++)check(()=>art.startEpicBossLab(index));
});

test('reduced motion keeps vulnerable-core highlight strength steady without changing its material footprint',()=>{
  const isolated=createGame(),{api:art,sandbox}=isolated;
  const check=launch=>{
    launch();art.openArtInspection();art.setInspectionMaterial('exposed');const enemy=art.boss||art.miniBoss;
    const signature=clock=>{enemy.clock=clock;art.setTime(clock);const paint=weakpointPaint(art,enemy);return JSON.stringify({material:paint.color.map(record=>[record.filter,record.alpha,record.composite]),glow:paint.stamps.filter(record=>record.composite==='screen').map(record=>[record.alpha,record.filter,record.shadowBlur])})};
    sandbox.STARFIGHTER_SETTINGS.reducedMotion=false;assert.notEqual(signature(.1),signature(.9),'Normal motion should gently pulse the exposed core highlight');
    sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;assert.equal(signature(.1),signature(.9),'Reduced motion must hold exposure brightness and glow constant');
    art.closeArtInspection();
  };
  check(()=>art.startMiniBossLab(0));check(()=>art.startBossLab(0));check(()=>art.startBossLab(6));check(()=>art.startEpicBossLab(0));
});

test('combat polish: shield, guard and hull hits have distinct feedback with accurate damage totals',()=>{
  const game=createGame(),{api,find}=game;api.start('story');api.player.inv=0;api.player.shield=1;api.setShake(0);api.damage();assert.equal(api.player.hp,3);assert.equal(api.player.shield,0);assert.equal(api.runStats.damageTaken,0);assert.equal(api.runStats.shieldsLost,1);assert.equal(api.shake,4);assert.ok(api.particles.every(p=>p.c==='#78edff'));
  api.particles.length=0;api.player.inv=0;api.player.ablativeReady=true;api.setShake(0);api.damage();assert.equal(api.player.hp,3);assert.equal(api.shake,3);assert.ok(api.particles.every(p=>p.c==='#ffd166'));
  api.particles.length=0;api.player.inv=0;api.player.hp=2;api.damage();assert.equal(api.player.hp,1);assert.equal(api.runStats.damageTaken,1);assert.ok(api.particles.every(p=>p.c==='#ff3d81'));assert.equal(find('#hull-label').textContent,'HULL CRITICAL');assert.equal(find('#health').classList.contains('critical'),true);
  api.player.inv=0;api.player.hp=3;api.player.secondChanceReady=true;api.damage(5);assert.equal(api.player.hp,1);assert.equal(api.runStats.damageTaken,3,'Citadel must count the two hull actually lost while preventing death');
});

test('combat polish: Reduced Motion keeps the invulnerable fighter steady and visible',()=>{
  const{api,sandbox}=createGame(),ctx=api.drawingContext;api.start('story');api.player.inv=1;sandbox.STARFIGHTER_SETTINGS.reducedMotion=true;
  const opacity=time=>{api.setTime(time);ctx.trace=[];api.drawPlayerAndPod();return ctx.trace.find(item=>item.op==='drawImage'&&item.image?.src==='assets/combat-sprite-atlas.png'&&item.args[2]===0).alpha};
  assert.equal(opacity(0),opacity(.1));assert.ok(opacity(.3)>=.7);sandbox.STARFIGHTER_SETTINGS.reducedMotion=false;assert.notEqual(opacity(0),opacity(.1));ctx.trace=null;
});

test('combat polish: victory destruction clears held charge and suppresses new fire while effects animate',()=>{
  const{api,sandbox}=createGame();api.startBossLab(0);api.boss.x=700;api.boss.y=270;api.player.charge=.5;api.keys.add('KeyZ');api.handleBossDefeat(api.boss);assert.equal(api.player.charge,0);assert.equal(api.keys.size,0);api.keys.add('KeyZ');api.player.podAuto=true;api.player.pod.owned=true;
  api.player.dose=100;sandbox.dispatchEvent({type:'keydown',code:'KeyQ',target:null,repeat:false});assert.equal(api.player.dose,100,'Delta must not be consumed during the victory animation');assert.equal(api.player.deltaFlash,0);const before=api.debris[0].x;api.update(.05);api.releaseCharge();api.update(.2);assert.equal(api.player.charge,0);assert.equal(api.shots.length,0);assert.notEqual(api.debris[0].x,before,'The destruction animation must continue during weapon lockout');
});

test('combat polish: cosmetic budgets preserve gameplay objects and reduce smoke in Clear Combat',()=>{
  const{api,sandbox}=createGame();api.start('story');const hostile={x:500,y:100,vx:-100,vy:0,r:5},pickup={x:350,y:200,type:'shield'};api.enemyShots.push(hostile);api.pickups.push(pickup);api.particlesAt(200,200,'#fff',3000,120);api.debrisAt(200,200,'#fff',500,1);assert.equal(api.particles.length,700);assert.ok(api.debris.length<=100);
  sandbox.STARFIGHTER_SETTINGS.clearCombat=true;api.particlesAt(200,200,'#fff',1000,120);assert.equal(api.particles.length,300);assert.equal(api.enemyShots[0],hostile);assert.equal(api.pickups[0],pickup);
});

test('combat polish: hostile shots and the fighter render over decorative smoke',()=>{
  const{api}=createGame(),ctx=api.drawingContext;api.start('story');api.particles.push({x:17,y:19,s:3,c:'#727987',smoke:true,life:.5,max:1,vx:0,vy:0});api.enemyShots.push({x:300,y:100,vx:-200,vy:0,r:5,damage:1});ctx.trace=[];api.draw();
  const smoke=ctx.trace.findIndex(item=>item.op==='fillRect'&&item.args[0]===17&&item.args[1]===19&&item.args[2]===3),shot=ctx.trace.findIndex(item=>(item.op==='arc'||item.op==='ellipse')&&Math.abs(item.args[0]-300)<.01&&Math.abs(item.args[1]-100)<.01),fighter=ctx.trace.findIndex(item=>item.op==='drawImage'&&item.image?.src==='assets/combat-sprite-atlas.png'&&item.args[2]===0);assert.ok(smoke>=0&&shot>smoke&&fighter>shot);ctx.trace=null;
});

test('gear runtime: Siege-Capacitor bonus needs a shield and never boosts normal shots',()=>{
  const{api}=createGame();api.start('story');api.player.critChance=0;api.player.shieldedChargeBonus=.06;api.player.shield=1;api.fire(1);const boosted=api.shots[0].d;api.shots.length=0;api.player.shield=0;api.fire(1);const bare=api.shots[0].d;assert.ok(Math.abs(boosted/bare-1.06)<1e-9);api.shots.length=0;api.player.shield=1;api.fire(0);assert.equal(api.shots[0].d,api.player.damage);
});

test('gear runtime: salvage pair extends gear Surge without shortening a stronger existing buff',()=>{
  const{api}=createGame();api.start('story');api.player.lootSurgeDuration=6;api.collectGear(api.generateGear(0));assert.equal(api.player.lootSurge,6);api.player.lootSurge=8;api.collectGear(api.generateGear(0));assert.equal(api.player.lootSurge,8);
});

test('charging adds no circular ship indicator while shields, Force art, and charged fire remain intact',()=>{
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext;art.startBossLab(0);art.setTime(.2);
  const roundGeometry=charge=>{
    art.player.charge=charge;ctx.trace=[];ctx.resetTransform();art.drawPlayerAndPod();
    return ctx.trace.filter(record=>record.op==='arc'||record.op==='ellipse').map(record=>({op:record.op,args:record.args,matrix:record.matrix}));
  };
  const baseline=roundGeometry(0);
  assert.ok(!baseline.some(record=>record.op==='ellipse'&&record.args[0]===0&&record.args[1]===0&&record.args[2]===46&&record.args[3]===29),'The old circular shield outline must stay removed');
  assert.ok(baseline.some(record=>record.op==='arc'&&record.args[0]===0&&record.args[1]===0&&record.args[2]===13),'The normal Force Pod overlay must remain visible');
  for(const charge of[.25,.6,1])assert.deepEqual(roundGeometry(charge),baseline,'Holding a charge must not introduce a ring or orb around the ship');
  art.hud();assert.equal(isolated.find('#xp-bar').style.width,'100%');
  const shots=art.shots.length;art.player.fire=0;art.releaseCharge();assert.ok(art.shots.length>shots,'Removing the cosmetic charge circle must not stop charged firing');assert.equal(art.player.charge,0);
  ctx.trace=null;
});

test('miniboss native reactor pixels and muzzles stay registered across atlas row boundaries',()=>{
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext;
  for(let index=0;index<10;index++){
    art.startMiniBossLab(index);const enemy=art.miniBoss;Object.assign(enemy,{x:715,y:263,clock:.61,cool:1,intro:0,recoil:0,hitFlash:0,visualAngle:.02,lastShotClock:-10});
    let firstCore,firstMuzzle;
    const seen=new Set();
    for(let step=0;step<32;step++){
      enemy.animOffset=step;const frame=art.miniFrame(enemy);seen.add(frame);ctx.trace=[];art.setShake(0);art.draw();
      const body=ctx.trace.find(record=>record.op==='drawImage'&&record.image?.sourcePath?.endsWith(enemy.def.file)&&record.args.length===9&&record.args[3]===384&&record.args[4]===256);
      assert.ok(body,'The authored full native body pose must be rendered');
      const[,sx,sy,sw,sh,x,y,width,height]=body.args,[a,b,c,d,e,f]=body.matrix,core=art.localNode(enemy,enemy.weakNodes[1]);
      const pixelX=x+(core.dx/enemy.def.w+.5)*width,pixelY=y+(core.dy/enemy.def.h+.5)*height,painted={x:a*pixelX+c*pixelY+e,y:b*pixelX+d*pixelY+f};
      const collider=art.worldWeakNode(enemy,enemy.weakNodes[1]),muzzle=art.miniBossMuzzle(enemy);
      assert.ok(Math.hypot(painted.x-collider.x,painted.y-collider.y)<1e-8,'The reactor center measured from the actual native body draw must match its collision');
      firstCore??=painted;firstMuzzle??=muzzle;
      assert.ok(Math.hypot(painted.x-firstCore.x,painted.y-firstCore.y)<1e-8,'Atlas pose changes must not make the registered reactor jump');
      assert.ok(Math.hypot(muzzle.x-firstMuzzle.x,muzzle.y-firstMuzzle.y)<1e-8,'The cannon port must remain attached to its registered reactor across poses');
      assert.equal(sx,frame%4*sw);assert.equal(sy,Math.floor(frame/4)*sh);
    }
    assert.equal(seen.size,4,'Registration inspection must cover all four matching-perspective idle poses');
  }
  ctx.trace=null;
});

test('miniboss firing continues its windup pose and emits from attached ports without a trigger snap',()=>{
  const isolated=createGame(),{api:art}=isolated;
  for(let index=0;index<10;index++){
    art.startMiniBossLab(index);const enemy=art.miniBoss;Object.assign(enemy,{x:715,y:263,clock:1,cool:1,intro:0,recoil:0,hitFlash:0,visualAngle:.015,lastShotClock:-10,animOffset:.137});
    const neutral=art.worldWeakNode(enemy,enemy.weakNodes[1]);enemy.cool=0;
    const pose=art.renderPose(enemy),core=art.worldWeakNode(enemy,enemy.weakNodes[1]),ports=[0,-1,1].map(side=>art.miniBossMuzzle(enemy,side)),frame=art.miniFrame(enemy),before=art.enemyShots.length;
    art.miniBossAttack(enemy);
    const released=art.renderPose(enemy),releasedCore=art.worldWeakNode(enemy,enemy.weakNodes[1]);
    assert.ok(Math.hypot(released.x-pose.x,released.y-pose.y)<1e-8,'The exact firing trigger must continue the preceding windup position');
    assert.ok(Math.hypot(releasedCore.x-core.x,releasedCore.y-core.y)<1e-8,'Firing must not detach the core from its moving armor');
    assert.equal(art.miniFrame(enemy),frame,'Firing must not select an unrelated native pose');assert.ok(art.enemyShots.length>before);
    if(enemy.muzzleFlares.length)for(const shot of art.enemyShots.slice(before))assert.ok(ports.some(port=>Math.hypot(shot.x-port.x,shot.y-port.y)<1e-8),'Directed and homing fire must spawn exactly at an attached native cannon port');
    enemy.clock+=.0001;const firstRecoil=art.worldWeakNode(enemy,enemy.weakNodes[1]);assert.ok(Math.hypot(firstRecoil.x-core.x,firstRecoil.y-core.y)<.1,'The recoil must begin continuously after the trigger');
    enemy.clock=enemy.lastShotClock+.7;const settled=art.worldWeakNode(enemy,enemy.weakNodes[1]);assert.ok(Math.hypot(settled.x-neutral.x,settled.y-neutral.y)<.2,'The heavy recoil must settle back to neutral instead of drifting');
  }
});

test('miniboss flight glides into position, holds a firing lane, and banks into deliberate travel',()=>{
  const isolated=createGame(),{api:art}=isolated;art.startMiniBossLab(0);art.player.inv=1e6;
  isolated.simulate(2.6);const enemy=art.miniBoss;
  assert.ok(Math.abs(enemy.x-796)<.01&&Math.abs(enemy.y-270)<.01,'The authored entry must finish at its destination');
  const atRest={x:enemy.x,y:enemy.y};isolated.simulate(.5);
  assert.ok(Math.hypot(enemy.x-atRest.x,enemy.y-atRest.y)<.01,'A settled hull must hold its lane without constant sine bobbing');
  const make=(fromY=130,toY=400)=>({...enemy,x:715,y:fromY,clock:0,cool:1,intro:0,recoil:0,visualAngle:0,animOffset:.137,lastShotClock:-10,muzzleFlares:[],flight:{phase:'travel',time:0,duration:1.5,fromX:715,fromY,toX:780,toY,leg:1,rest:1,vx:0,vy:0}});
  const slow=make(),fast=make();for(let frame=0;frame<60;frame++)art.updateMiniBossMovement(slow,1/60);for(let frame=0;frame<120;frame++)art.updateMiniBossMovement(fast,1/120);
  assert.ok(Math.hypot(slow.x-fast.x,slow.y-fast.y)<1e-7,'A deliberate route must be independent of update frequency');
  assert.ok(Math.abs(slow.visualAngle-fast.visualAngle)<.003);assert.equal(art.miniFrame(slow),art.miniFrame(fast));
  const descending=make(),ascending=make(400,130);art.updateMiniBossMovement(descending,.1);art.updateMiniBossMovement(ascending,.1);
  assert.ok(descending.y>130&&descending.visualAngle<0,'A left-facing descending hull should bank its nose downward');
  assert.ok(ascending.y<400&&ascending.visualAngle>0,'A left-facing ascending hull should bank its nose upward');
});

test('all miniboss flight routes remain bounded and continuous across entry, aiming, travel and recovery',()=>{
  const isolated=createGame(),{api:art}=isolated;
  for(let index=0;index<10;index++){
    art.startMiniBossLab(index);art.player.inv=1e6;const enemy=art.miniBoss;const phases=new Set();let largestStep=0;
    for(let tick=0;tick<2400;tick++){
      const before={x:enemy.x,y:enemy.y};art.update(1/120);phases.add(enemy.flight.phase);
      largestStep=Math.max(largestStep,Math.hypot(enemy.x-before.x,enemy.y-before.y));
      assert.ok(Number.isFinite(enemy.x)&&Number.isFinite(enemy.y));
      assert.ok(Math.abs(enemy.visualAngle)<=.065+1e-8,'Banking must remain restrained');
      if(tick/120>enemy.introMax+.1)assert.ok(enemy.x>=720&&enemy.x<=850&&enemy.y>=100&&enemy.y<=440,'Combat routes must remain inside the readable right-hand arena');
    }
    assert.ok(largestStep<3.2,'No route boundary may teleport the hull');
    assert.ok(phases.has('entry')&&phases.has('hold')&&phases.has('travel'),'Each elite needs a readable entry, settled firing beat, and relocation');
  }
});

test('Field Module selection keeps the current track playing while the battlefield is frozen',()=>{
  const isolated=createGame(),{api:art}=isolated;art.startLevelLab(0);art.player.inv=1e6;art.makeMiniBoss();art.miniBoss.hp=0;
  const music=art.soundtrack;music.currentTime=37.25;const src=music.src,loads=music.loadCount,plays=music.playCount;
  art.update(1/120);isolated.simulate(1.4);assert.equal(art.state,'upgrade');assert.equal(music.paused,false);assert.equal(music.src,src);assert.equal(music.currentTime,37.25);assert.equal(music.loadCount,loads);
  const before=JSON.stringify({time:art.time,x:art.player.x,y:art.player.y,shots:art.enemyShots});art.loop(1000);art.loop(1500);
  assert.equal(JSON.stringify({time:art.time,x:art.player.x,y:art.player.y,shots:art.enemyShots}),before,'Music must not advance the frozen combat simulation');
  art.chooseTacticalRetrofit(art.tacticalRetrofitChoices()[0]);assert.equal(art.state,'playing');assert.equal(music.paused,false);assert.equal(music.src,src);assert.equal(music.currentTime,37.25);assert.equal(music.loadCount,loads);assert.equal(music.playCount,plays,'Choosing a module must not restart already-playing music');
});

test('Field Module music respects tab hiding, help, mute and explicit gameplay pause',()=>{
  const isolated=createGame(),{api:art,sandbox,document}=isolated;art.start();art.presentTacticalRetrofit();const music=art.soundtrack;music.currentTime=19;const src=music.src;
  document.hidden=true;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,true);assert.equal(art.state,'upgrade');
  document.hidden=false;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,false);assert.equal(music.currentTime,19);assert.equal(music.src,src);
  const trigger=document.querySelectorAll('[data-flight-deck]')[0];trigger.dispatchEvent({type:'click'});assert.equal(music.paused,true);
  sandbox.dispatchEvent({type:'focus'});assert.equal(music.paused,true,'Returning focus must not play music over help');
  isolated.find('#deck-close').dispatchEvent({type:'click'});assert.equal(music.paused,false);assert.equal(art.state,'upgrade');
  isolated.find('#sound-btn').onclick();assert.equal(music.muted,true);isolated.find('#sound-btn').onclick();assert.equal(music.muted,false);
  art.chooseTacticalRetrofit(art.tacticalRetrofitChoices()[0]);art.pause();assert.equal(music.paused,true);sandbox.dispatchEvent({type:'focus'});assert.equal(music.paused,true,'A gameplay pause must still require explicit resume');
});

test('faceted shield assembles on pickup, reacts on impact and clears after the last charge is spent',()=>{
  const isolated=createGame(),{api:art}=isolated,ctx=art.drawingContext;art.start();art.player.inv=0;
  const paint=()=>{ctx.trace=[];art.drawPlayerShield();const records=ctx.trace;ctx.trace=null;return records};
  assert.equal(paint().length,0);art.collectCombatPickup({type:'shield'});assert.equal(art.player.shield,1);assert.ok(art.player.shieldWake>0);
  const ward=paint();assert.ok(ward.length>0);assert.ok(!ward.some(record=>record.op==='arc'||record.op==='ellipse'),'The shield must use ship-shaped facets instead of a drawn circle');
  assert.equal(ctx.globalAlpha,1);art.damage();assert.equal(art.player.shield,0);assert.equal(art.player.hp,art.player.maxHp);assert.ok(art.player.shieldHit>0);assert.ok(paint().length>0,'The final shield charge should leave a short impact response');
  art.update(.3);assert.equal(paint().length,0,'The ward must disappear after its final impact fades');
});

test('native materials: emissive relighting preserves native armor, texture, hue and opacity',()=>{
  const{api}=createGame(),pixels=Uint8ClampedArray.from([35,42,48,255,168,174,180,231,220,65,25,255,140,35,200,128,25,200,210,255,245,245,245,255,220,50,20,0]);
  const dim=api.relightNativeMaterial(pixels.slice(),-1),hot=api.relightNativeMaterial(pixels.slice(),1),emission=api.relightNativeMaterial(pixels.slice(),1,true),unchanged=api.relightNativeMaterial(pixels.slice(),0);
  assert.deepEqual(unchanged,pixels);
  for(const index of[0,1,5,6]){const at=index*4;assert.deepEqual(dim.subarray(at,at+4),pixels.subarray(at,at+4));assert.deepEqual(hot.subarray(at,at+4),pixels.subarray(at,at+4));assert.equal(emission[at+3],0,'Nonemissive armor and transparent pixels must be absent from the screen pass')}
  for(const index of[2,3,4]){const at=index*4,original=pixels.subarray(at,at+4),bright=hot.subarray(at,at+4);assert.equal(bright[3],original[3]);assert.equal(dim[at+3],original[3]);assert.ok(Math.max(...bright.subarray(0,3))>Math.max(...original.subarray(0,3)));assert.ok(Math.max(...dim.subarray(at,at+3))<Math.max(...original.subarray(0,3)));assert.ok(emission[at+3]>0);assert.deepEqual(emission.subarray(at,at+3),bright.subarray(0,3));
    const peak=Math.max(...original.subarray(0,3)),hotPeak=Math.max(...bright.subarray(0,3));for(let channel=0;channel<3;channel++)assert.ok(Math.abs(original[channel]/peak-bright[channel]/hotPeak)<.012,'Exposure must retain the source hue rather than whitening the core');
  }
  const ramp=Uint8ClampedArray.from([120,20,15,255,150,25,19,255,180,30,23,255,210,35,26,255]);api.relightNativeMaterial(ramp,1);for(let at=4;at<ramp.length;at+=4)assert.ok(ramp[at]>ramp[at-4],'Native ridge/groove ordering must survive exposure');
});

test('native materials: real atlas shadows and neutral ridges stay byte-exact under exposure',()=>{
  const{api}=createGame();let checked=0,lit=0;
  for(const file of['assets/minibosses/elite-01-shattered-meridian-atlas-alpha-v2.png','assets/minibosses/elite-08-helios-scar-atlas-alpha-v2.png','assets/bosses/boss-07-prism-warden-phase1-granular-16frame-alpha-v3.png']){
    const png=pngMaterial(file,true),samples=[];for(let at=0;at<png.rgba.length;at+=4*31)samples.push(...png.rgba.subarray(at,at+4));const native=Uint8ClampedArray.from(samples),hot=api.relightNativeMaterial(native.slice(),1),sealed=api.relightNativeMaterial(native.slice(),-1),mask=api.relightNativeMaterial(native.slice(),1,true);
    for(let at=0;at<native.length;at+=4){const[r,g,b,a]=native.subarray(at,at+4);assert.equal(hot[at+3],a);assert.equal(sealed[at+3],a);if(!a||Math.max(r,g,b)<=105||Math.max(r,g,b)-Math.min(r,g,b)<=35){checked++;assert.deepEqual(hot.subarray(at,at+4),native.subarray(at,at+4));assert.deepEqual(sealed.subarray(at,at+4),native.subarray(at,at+4));assert.equal(mask[at+3],0)}else if(a>128&&Math.max(...hot.subarray(at,at+3))>Math.max(r,g,b))lit++}
  }
  assert.ok(checked>1000&&lit>100,'Real enemy textures must exercise protected housing and visible emission');
});

test('native materials: palette cache shares samples and bounds its native RGBA memory',()=>{
  const game=createGame(),{api}=game,asset=game.find('#palette-test');asset.ready=true;const first=api.nativeMaterialPalette(asset,{x:0,y:0,w:32,h:32});assert.equal(first.hot.width,96);assert.equal(first.hot.height,96);assert.equal(api.nativeMaterialPalette(asset,{x:0,y:0,w:32,h:32}),first);
  for(let i=1;i<=api.nativePaletteLimit;i++)api.nativeMaterialPalette(asset,{x:i,y:0,w:32,h:32});assert.equal(api.nativePaletteCache.size,256);assert.ok(![...api.nativePaletteCache.values()].includes(first),'Old pose samples must be evicted instead of accumulating indefinitely');
});

test('Loot Guide uses eleven real pickup previews without awarding loot or touching run saves',()=>{
  const game=createGame(),{api}=game;api.start();api.goMenu();const before=JSON.stringify({profile:api.profile,garage:api.garage,stats:api.runStats,loot:api.runLoot}),main=api.drawingContext;main.trace=[];api.openLootGuide();assert.equal(api.state,'lootguide');assert.equal(game.find('#loot-guide-grid').children.length,11);assert.equal(main.trace.length,0,'Guide previews must draw into their own canvas contexts');
  assert.equal(JSON.stringify({profile:api.profile,garage:api.garage,stats:api.runStats,loot:api.runLoot}),before);
  const preview=element('canvas').getContext('2d');preview.trace=[];for(const tier of[0,1,2,3,4])api.drawPickupSprite({type:'gear',gear:{tier},x:0,y:0},preview);assert.equal(preview.trace.filter(item=>item.op==='drawImage').length,5);assert.equal(main.trace.length,0);main.trace=null;
});

test('Loot Guide rarity palettes preserve native metal and alpha while giving all five crate colors',()=>{
  const{api}=createGame(),native=Uint8ClampedArray.from([0,255,255,255,8,190,220,128,160,165,170,255,25,31,38,255,0,255,255,0]),colors=[];
  for(let tier=0;tier<5;tier++){const recolored=api.recolorGearDropMaterial(native.slice(),tier);colors.push(Array.from(recolored.subarray(0,3)).join(','));for(let at=0;at<native.length;at+=4)assert.equal(recolored[at+3],native[at+3]);for(const index of[2,3,4])assert.deepEqual(recolored.subarray(index*4,index*4+4),native.subarray(index*4,index*4+4));}
  assert.equal(new Set(colors).size,5);const grey=colors[0].split(',').map(Number),green=colors[1].split(',').map(Number),blue=colors[2].split(',').map(Number),purple=colors[3].split(',').map(Number),gold=colors[4].split(',').map(Number);assert.ok(Math.max(...grey)-Math.min(...grey)<30);assert.ok(green[1]>green[0]&&green[1]>green[2]);assert.ok(blue[2]>blue[0]&&blue[2]>blue[1]);assert.ok(purple[0]>purple[1]&&purple[2]>purple[1]);assert.ok(gold[0]>gold[1]&&gold[1]>gold[2]);
});

test('mode: Story is selected by default and New Game keeps the pilot and Garage',()=>{
  const game=createGame(),{api,find,sandbox}=game;
  assert.equal(api.selectedMode,'story');assert.equal(find('#story-mode-btn').getAttribute('aria-pressed'),'true');assert.equal(find('#load-game-btn').disabled,true);assert.equal(find('#missions-menu-btn').disabled,true);
  const gear=api.generateGear(2);api.garage.inventory.push(gear);api.garage.equipped[gear.slot]=gear.id;api.profile.name='VETERAN';api.profile.progress.missionsCleared[2]=true;api.saveProfile();
  find('#start-btn').onclick();assert.equal(api.state,'briefing');assert.equal(api.profile.checkpoint,null);find('#briefing-skip-intro-btn').onclick();find('#briefing-depart-btn').onclick();assert.equal(api.state,'playing');assert.equal(api.runMode,'story');assert.equal(api.wave,1);assert.equal(api.boss,null);assert.equal(api.bossLab,false);
  assert.equal(api.profile.name,'VETERAN');assert.equal(api.garage.inventory[0].id,gear.id);assert.equal(api.profile.progress.missionsCleared[2],true);assert.ok(api.validateRunCheckpoint(api.profile.checkpoint));
  const checkpoint=JSON.stringify(api.profile.checkpoint);api.goMenu();find('#rush-mode-btn').onclick();find('#start-btn').onclick();assert.equal(api.state,'briefing');find('#briefing-depart-btn').onclick();assert.equal(api.state,'briefing','Cancelling departure must retain the saved run');assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);
  sandbox.confirm=()=>true;find('#briefing-depart-btn').onclick();assert.equal(api.runMode,'rush');assert.equal(api.profile.name,'VETERAN');assert.equal(api.garage.inventory[0].id,gear.id);
});

test('mode: Rush fights ten real apex bosses with a ready arsenal and never unlocks full missions',()=>{
  const game=createGame(),{api,sandbox}=game;api.start('rush');assert.equal(api.boss,null);api.flushBossArrival();assert.equal(api.bossLab,false);assert.equal(api.boss.type,0);assert.equal(api.miniBoss,null);assert.equal(api.player.pod.owned,true);assert.equal(api.player.laserColor,'red');assert.equal(api.player.laserLevel,3);assert.equal(api.player.missileLevel,2);assert.equal(api.player.bits,2);assert.ok(api.player.hp>=8&&api.player.shield>=3);
  const hp=api.boss.hp;sandbox.dispatchEvent({type:'keydown',code:'KeyN',target:game.document.body});assert.equal(api.boss.hp,hp,'Live Rush must not accept the developer skip key');
  for(let index=0;index<10;index++){
    api.flushBossArrival();assert.equal(api.wave,index+1);assert.equal(api.boss.type,index);assert.equal(api.miniBoss,null);assert.equal(api.enemies.length,0);assert.equal(api.stageHazards.length,0);
    api.boss.hp=0;api.handleBossDefeat(api.boss);assert.equal(api.profile.checkpoint.segment,'doctrine');api.flushVictoryDelay();assert.equal(api.state,'skilltree');api.closeSkillTree();
  }
  assert.equal(api.state,'complete');assert.equal(api.wave,10);assert.equal(api.boss,null);assert.equal(api.profile.checkpoint,null);assert.equal(api.runStats.normalBosses,10);assert.equal(api.runStats.miniBosses,0);assert.equal(api.profile.lifetime.runs,1);assert.equal(api.profile.lifetime.bosses,10);assert.equal(api.profile.lastRun.result,'complete');assert.equal(api.profile.lastRun.mode,'rush');assert.equal(api.profile.progress.normalBossesDefeated.filter(Boolean).length,10);assert.equal(api.profile.progress.missionsCleared.filter(Boolean).length,0);assert.equal(game.find('#missions-menu-btn').disabled,true);assert.ok(api.garage.inventory.length>=10);
  assert.equal(api.profile.progress.epicUnlocked,true,'The existing all-ten-actual-boss unlock must remain intact');
});

test('mode: Story ends after mission ten and records each full-stage clear',()=>{
  const{api}=createGame();api.start('story');
  for(let index=0;index<10;index++){assert.equal(api.wave,index+1);api.makeBoss();api.handleBossDefeat(api.boss);assert.equal(api.profile.progress.missionsCleared[index],true);api.flushVictoryDelay();api.closeSkillTree()}
  assert.equal(api.state,'complete');assert.equal(api.wave,10);assert.equal(api.profile.progress.missionsCleared.filter(Boolean).length,10);assert.equal(api.profile.lifetime.runs,1);assert.equal(api.profile.lifetime.waves,10);assert.equal(api.player.rank,11);assert.equal(api.player.skillPoints,10);assert.equal(api.profile.lastRun.mode,'story');assert.equal(api.profile.checkpoint,null);
  api.completeRun();assert.equal(api.profile.lifetime.runs,1,'Completion must finalize a run once');
});

test('mode: Mission Select gates individual full clears and a replay finishes after one mission',()=>{
  const game=createGame(),{api,find}=game;api.openMissionSelect();assert.equal(api.state,'menu');api.profile.progress.normalBossesDefeated[1]=true;api.renderRunMenu();assert.equal(find('#missions-menu-btn').disabled,true,'A boss-only clear must not open a mission replay');
  api.profile.progress.missionsCleared[3]=true;api.renderRunMenu();api.openMissionSelect();assert.equal(api.state,'missions');const tiles=find('#mission-grid').children;assert.equal(tiles.length,10);assert.equal(tiles[0].disabled,true);assert.equal(tiles[3].disabled,false);
  api.startMissionReplay(0);assert.equal(api.state,'missions');api.startMissionReplay(3);assert.equal(api.state,'briefing');find('#briefing-depart-btn').onclick();assert.equal(api.state,'playing');assert.equal(api.runMode,'replay');assert.equal(api.wave,4);assert.equal(api.boss,null,'A replay must include the approach, not launch a direct boss test');assert.equal(api.bossLab,false);
  api.makeMiniBoss();api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);assert.equal(api.runStats.miniBosses,1);api.makeBoss();api.handleBossDefeat(api.boss);api.flushVictoryDelay();api.closeSkillTree();assert.equal(api.state,'complete');assert.equal(api.wave,4);assert.equal(api.profile.lastRun.normalBosses,1);assert.equal(api.profile.lastRun.mode,'replay');assert.equal(api.profile.progress.missionsCleared.filter(Boolean).length,1);
});

function advanceAudioRun(api,seconds){for(let tick=0;tick<Math.ceil(seconds*120)&&api.state==='playing';tick++)api.update(1/120)}

test('boss music fade: current music leads directly into the boss theme without loading an alarm',()=>{
  const game=createGame(),{api}=game;assert.ok(!game.assetRequests.some(path=>path.includes('boss-warning')));assert.ok(!html.includes('boss-audio-mode'));let entryCues=0;api.sfx.bossIntro=()=>entryCues++;api.start('rush');const music=api.soundtrack,source=music.src;assert.equal(api.boss,null);
  advanceAudioRun(api,.45);assert.ok(music.volume>.26&&music.volume<.28);advanceAudioRun(api,1);assert.equal(music.paused,false);assert.equal(music.src,source);assert.equal(api.bossAudioFade.phase,'out');assert.equal(api.enemyShots.length,0);
  api.flushBossArrival();assert.equal(api.boss.type,0);assert.match(music.src,/music\/bosses\//);assert.equal(api.bossAudioFade.phase,'in');assert.ok(music.volume<.02);advanceAudioRun(api,.7);assert.equal(music.volume,.3);assert.equal(api.bossAudioFade,null);assert.equal(entryCues,0,'Apex arrival must use music only, without a replacement intro sound');
});

test('boss music fade: pause, help, hidden tabs, volume and mute preserve the fade and Menu cancels it',()=>{
  const game=createGame(),{api,find,document,sandbox}=game;api.start('rush');advanceAudioRun(api,1.05);const music=api.soundtrack;music.currentTime=23;api.pause();const clock=api.bossAudioFade.elapsed,volume=music.volume;assert.equal(music.paused,true);api.loop(1000);api.loop(1500);assert.equal(api.bossAudioFade.elapsed,clock);assert.equal(music.volume,volume);api.pause();assert.equal(music.paused,false);assert.equal(music.currentTime,23);
  document.hidden=true;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,true);document.hidden=false;document.dispatchEvent({type:'visibilitychange'});assert.equal(music.paused,true);api.pause();
  document.querySelectorAll('[data-flight-deck]')[0].dispatchEvent({type:'click'});assert.equal(music.paused,true);find('#deck-close').dispatchEvent({type:'click'});assert.equal(music.paused,true);api.pause();
  find('#sound-btn').onclick();assert.equal(music.muted,true);find('#sound-btn').onclick();assert.equal(music.muted,false);find('#music-volume').value=48;find('#music-volume').dispatchEvent({type:'input'});assert.ok(music.volume>.35&&music.volume<.37);
  api.goMenu();assert.equal(api.bossAudioFade,null);assert.equal(music.src,'music/menu-intro.mp3');assert.equal(music.volume,.48);assert.equal(music.paused,false);sandbox.dispatchEvent({type:'focus'});assert.equal(music.volume,.48);
});

test('boss music fade: later Story and secret apexes fade into their correct themes',()=>{
  for(const epic of[false,true]){const{api}=createGame();api.start('story');api.setWave(2);api.makeMiniBoss();api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);api.setPostEliteClock(api.missionPacing.post);if(epic)api.setEpicEncounter({id:1,wave:2});api.update(1/120);assert.equal(api.boss,null);assert.ok(api.stageApexIntro>4);assert.equal(api.bossAudioFade.phase,'out');api.flushBossArrival();assert.equal(!!api.boss.epic,epic);assert.match(api.soundtrack.src,epic?/music\/epic\//:/music\/bosses\//);assert.equal(api.bossAudioFade.phase,'in')}
  const{api}=createGame();api.startBossLab(2);assert.equal(api.boss.type,2);assert.equal(api.bossAudioFade,null);
});

test('refit: a cleared round offers Garage without resetting the run or awarding its loot twice',()=>{
  const game=createGame(),{api,find}=game;api.start('story');api.makeBoss();api.handleBossDefeat(api.boss);api.flushVictoryDelay();assert.equal(api.state,'skilltree');assert.equal(find('#tree-garage-btn').hidden,false);
  const player=api.player,stats=JSON.stringify(api.runStats),loot=api.garage.inventory.length,rank=player.rank;player.hp=2;player.shield=1;player.dose=61;player.pod.owned=true;player.laserColor='blue';player.laserLevel=1;player.bits=1;player.missileLevel=1;
  find('#tree-garage-btn').onclick();assert.equal(api.state,'garage');assert.equal(api.runActive,true);assert.match(find('#garage-launch-btn').textContent,/APPLY/);assert.equal(find('#garage-return-note').hidden,false);
  const weapon=api.normalizeGearItem({...api.generateGear(2),slot:'weapon',power:114,stats:{damagePct:4},gunVariant:'arc',alignment:'VANGUARD'});api.garage.inventory.push(weapon);api.garage.equipped.weapon=weapon.id;
  find('#garage-launch-btn').onclick();assert.equal(api.state,'skilltree');assert.equal(find('#hud').classList.contains('hidden'),false);assert.equal(api.player,player);assert.ok(player.damage>1);assert.equal(player.weaponVariant,'arc');assert.equal(player.hp,2);assert.equal(player.shield,1);assert.equal(player.dose,61);assert.equal(player.laserLevel,1);assert.equal(player.bits,1);assert.equal(player.missileLevel,1);assert.equal(player.rank,rank);assert.equal(JSON.stringify(api.runStats),stats);assert.equal(api.garage.inventory.length,loot+1);
  const damage=player.damage;find('#tree-garage-btn').onclick();find('#garage-launch-btn').onclick();assert.equal(player.damage,damage);api.closeSkillTree();assert.equal(api.wave,2);assert.equal(api.runStats.normalBosses,1);assert.equal(api.garage.inventory.length,loot+1);
});

test('refit: checkpoint stores the new build and Main Menu resumes the pending round once',()=>{
  const game=createGame(),{api,find}=game;api.start('story');api.makeBoss();api.handleBossDefeat(api.boss);api.flushVictoryDelay();api.openRoundGarage();
  const engine=api.normalizeGearItem({...api.generateGear(1),slot:'engine',power:109,stats:{speedPct:4},trait:'vector',alignment:'VECTOR'});api.garage.inventory.push(engine);api.garage.equipped.engine=engine.id;api.saveProfile();find('#garage-back-btn').onclick();assert.equal(api.state,'menu');assert.equal(api.profile.checkpoint.segment,'doctrine');assert.ok(api.profile.checkpoint.player.speed>255);const loot=api.garage.inventory.length,build=JSON.stringify(api.profile.checkpoint.player);
  const reloaded=createGame({initialStorage:Array.from(game.storage)});reloaded.api.loadGame();assert.equal(reloaded.api.state,'skilltree');assert.equal(JSON.stringify(reloaded.api.profile.checkpoint.player),build);assert.equal(reloaded.api.garage.inventory.length,loot);reloaded.api.closeSkillTree();assert.equal(reloaded.api.wave,2);assert.equal(reloaded.api.runStats.normalBosses,1);assert.equal(reloaded.api.garage.inventory.length,loot);
});

test('refit: Field Module Garage preserves choices, music and the frozen battlefield',()=>{
  const game=createGame(),{api,find,sandbox}=game;api.start('story');api.presentTacticalRetrofit();const music=api.soundtrack,source=music.src;music.currentTime=34;const choices=find('#upgrade-cards').children.slice(),clock=api.time;
  assert.equal(find('#upgrade-garage-btn').hidden,false);find('#upgrade-garage-btn').onclick();assert.equal(api.state,'garage');api.loop(1000);api.loop(1500);assert.equal(api.time,clock);assert.equal(music.src,source);assert.equal(music.currentTime,34);assert.equal(music.paused,false);
  sandbox.dispatchEvent({type:'keydown',code:'Escape',target:game.document.body});assert.equal(api.state,'upgrade');assert.equal(find('#upgrade-cards').children.length,choices.length);choices.forEach((choice,index)=>assert.equal(find('#upgrade-cards').children[index],choice));assert.equal(music.src,source);assert.equal(music.currentTime,34);assert.equal(api.profile.checkpoint.segment,'module');
  api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);assert.equal(api.state,'playing');assert.equal(api.profile.checkpoint.segment,'postElite');
});

test('refit: rebuilding replaces traits without stacking Doctrine, modules, recovery or stage guards',()=>{
  const {api}=createGame();const weaponA=api.normalizeGearItem({...api.generateGear(2),slot:'weapon',power:100,stats:{damagePct:4},gunVariant:'sync',alignment:'VANGUARD'}),weaponB=api.normalizeGearItem({...api.generateGear(2),slot:'weapon',power:100,stats:{damagePct:5},gunVariant:'arc',alignment:'VANGUARD'}),armor=api.normalizeGearItem({...api.generateGear(2),slot:'armor',power:100,stats:{hull:1,shields:1},trait:'ablative',alignment:'AEGIS'});
  api.garage.inventory.push(weaponA,weaponB,armor);api.garage.equipped.weapon=weaponA.id;api.garage.equipped.armor=armor.id;api.start('story');api.player.skillPoints=2;api.learnSkill(api.skillPaths[0].nodes[0]);api.learnSkill(api.skillPaths[0].nodes[1]);api.presentTacticalRetrofit();const module=api.tacticalRetrofitChoices().find(item=>item.category==='VANGUARD');api.chooseTacticalRetrofit(module);
  const player=api.player,pod=player.pod;player.hp=2;player.shield=0;player.dose=48;player.ablativeReady=false;pod.owned=true;pod.mode='deployed';pod.x=290;pod.y=163;const spent=player.skillsSpent,retrofits=JSON.stringify(player.retrofits);api.garage.equipped.weapon=weaponB.id;api.rebuildRunLoadout();assert.equal(player.podAuto,false);assert.equal(player.weaponVariant,'arc');const damage=player.damage,weak=player.weakDamage;
  for(let i=0;i<4;i++)api.rebuildRunLoadout();assert.equal(api.player,player);assert.equal(player.pod,pod);assert.equal(player.damage,damage);assert.equal(player.weakDamage,weak);assert.equal(player.skillsSpent,spent);assert.equal(JSON.stringify(player.retrofits),retrofits);assert.equal(player.hp,2);assert.equal(player.shield,0);assert.equal(player.dose,48);assert.equal(pod.x,290);assert.equal(pod.y,163);assert.equal(pod.mode,'deployed');assert.equal(player.ablativeReady,false);
  api.garage.equipped.armor=null;api.rebuildRunLoadout();assert.equal(player.ablativeOwned,false);api.garage.equipped.armor=armor.id;api.rebuildRunLoadout();assert.equal(player.ablativeReady,false,'Changing armor must not refresh a consumed same-stage guard');
});

test('refit: Rush keeps its hull floor and developer or inspection screens do not offer run refits',()=>{
  const game=createGame(),{api,find}=game;api.start('rush');api.flushBossArrival();api.player.hp=5;api.player.shield=1;api.rebuildRunLoadout();assert.equal(api.player.maxHp,8);assert.equal(api.player.hp,5);assert.equal(api.player.shield,1);api.goMenu();api.startBossLab(0);api.openRoundGarage();assert.equal(api.state,'playing');assert.equal(find('#tree-garage-btn').hidden,true);api.goMenu();api.start('story');api.openSkillTree();assert.equal(find('#tree-garage-btn').hidden,true);api.openRoundGarage();assert.equal(api.state,'skilltree');
});

test('briefing: preview and Escape preserve a saved run and return to Mission Select',()=>{
  const game=createGame(),{api,find,sandbox}=game;api.profile.progress.missionsCleared[3]=true;api.start('story');api.goMenu();api.openMissionSelect();
  const before=JSON.stringify(api.profile),stats=JSON.stringify(api.runStats),music=api.soundtrack;music.currentTime=26;const loads=music.loadCount,plays=music.playCount;
  api.startMissionReplay(3);assert.equal(api.state,'briefing');assert.equal(find('#briefing-title').textContent,'CRYSTAL VESPER');assert.match(find('#briefing-sector').textContent,/MISSION 04/);assert.match(find('#briefing-hazard').textContent,/REFRACTION/);
  assert.equal(JSON.stringify(api.profile),before);assert.equal(JSON.stringify(api.runStats),stats);assert.equal(api.runActive,false);assert.equal(music.currentTime,26);assert.equal(music.loadCount,loads);assert.equal(music.playCount,plays);assert.equal(music.paused,false);
  sandbox.dispatchEvent({type:'keydown',code:'Escape',target:game.document.body});assert.equal(api.state,'missions');assert.equal(JSON.stringify(api.profile),before);
});

test('briefing: cancellation keeps the selected mission and confirmed departure launches exactly once',()=>{
  const game=createGame(),{api,find,sandbox}=game;api.profile.progress.missionsCleared[5]=true;api.start('story');api.goMenu();const checkpoint=JSON.stringify(api.profile.checkpoint);api.openMissionSelect();api.startMissionReplay(5);
  find('#briefing-depart-btn').onclick();assert.equal(api.state,'briefing');assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);
  sandbox.confirm=()=>true;find('#briefing-depart-btn').onclick();assert.equal(api.state,'playing');assert.equal(api.runMode,'replay');assert.equal(api.wave,6);assert.equal(api.profile.checkpoint.wave,6);
  const player=api.player,saved=JSON.stringify(api.profile.checkpoint);find('#briefing-depart-btn').onclick();assert.equal(api.player,player);assert.equal(JSON.stringify(api.profile.checkpoint),saved);
});

test('briefing: Garage Back restores the Garage and Rush describes its actual starting encounter',()=>{
  const game=createGame(),{api,find}=game;find('#garage-menu-btn').onclick();find('#garage-launch-btn').onclick();assert.equal(api.state,'briefing');find('#briefing-back-btn').onclick();assert.equal(api.state,'garage');
  api.goMenu();api.selectRunMode('rush');api.launchNewRun();assert.equal(api.state,'briefing');assert.equal(find('#briefing-title').textContent,'THE BLOODSTAR');assert.equal(find('#briefing-elite').textContent,'BYPASSED IN RUSH');assert.equal(find('#briefing-hazard').textContent,'APPROACH BYPASSED');
  assert.equal(api.profile.checkpoint,null);find('#briefing-depart-btn').onclick();assert.equal(api.runMode,'rush');assert.equal(api.state,'playing');assert.equal(api.boss,null);api.flushBossArrival();assert.equal(api.boss.type,0);assert.equal(api.miniBoss,null);
});

test('briefing: departure revalidates mission locks and capacity before replacing a checkpoint',()=>{
  const game=createGame(),{api,sandbox}=game;api.start('story');api.goMenu();api.profile.progress.missionsCleared[2]=true;api.openMissionSelect();api.startMissionReplay(2);const checkpoint=JSON.stringify(api.profile.checkpoint);
  api.profile.progress.missionsCleared[2]=false;api.departMission();assert.equal(api.state,'menu');assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);
  api.launchNewRun();while(api.garage.inventory.length<=32)api.garage.inventory.push(api.generateGear(0));let confirmations=0;sandbox.confirm=()=>{confirmations++;return true};api.departMission();assert.equal(api.state,'garage');assert.equal(confirmations,0);assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.match(game.find('#profile-save-status').textContent,/DISMANTLE/);
});

test('briefing: abandoning a preview cannot launch its stale selection from another screen or pilot',()=>{
  const game=createGame(),{api,find}=game;api.launchNewRun();api.goMenu();api.departMission();assert.equal(api.state,'menu');assert.equal(api.profile.checkpoint,null);
  api.launchNewRun();api.newGame();const profile=api.profile;api.departMission();assert.equal(api.state,'garage');assert.equal(api.profile,profile);assert.equal(api.profile.checkpoint,null);
  find('#garage-launch-btn').onclick();assert.equal(api.state,'briefing');api.closeMissionBriefing();assert.equal(api.state,'garage');
});

test('mode: profile migration preserves legacy full clears without promoting new Rush saves',()=>{
  const legacy={version:5,name:'LEGACY',garage:{inventory:[],equipped:{}},progress:{normalBossesDefeated:[false,true,false,true]},lifetime:{}};
  const game=createGame({initialStorage:[['starfighterProfileSlot1',JSON.stringify(legacy)]]});assert.equal(game.api.profile.version,6);assert.deepEqual(Array.from(game.api.profile.progress.missionsCleared),[false,true,false,true,false,false,false,false,false,false]);
  const modern=JSON.parse(JSON.stringify(game.api.profile));modern.progress.missionsCleared=Array(10).fill(false);modern.progress.normalBossesDefeated=Array(10).fill(true);
  const reload=createGame({initialStorage:[['starfighterProfileSlot1',JSON.stringify(modern)]]});assert.equal(reload.api.profile.progress.missionsCleared.filter(Boolean).length,0);assert.equal(reload.find('#missions-menu-btn').disabled,true);
});

test('mode: checkpoint reload restores the complete run build and totals without applying Garage twice',()=>{
  const game=createGame(),{api}=game;api.start();api.setWave(2);api.player.damage=1.73;api.player.chargeSpeed=1.42;api.player.skillPoints=1;api.learnSkill(api.skillPaths[0].nodes[0]);api.player.pod.owned=true;api.player.laserColor='blue';api.player.laserLevel=2;api.player.missileLevel=1;api.player.bits=1;api.player.dose=64;api.player.hp=2;api.player.pod.dockSide=api.player.pod.returnSide='rear';api.runStats.damageDealt=123;api.setRunTotals(4521,17,86.5);api.saveRunCheckpoint('mission');
  assert.ok(api.validateRunCheckpoint(api.profile.checkpoint));const build=JSON.parse(JSON.stringify(api.profile.checkpoint.player));const reloaded=createGame({initialStorage:Array.from(game.storage)});assert.equal(reloaded.find('#load-game-btn').disabled,false);reloaded.find('#load-game-btn').onclick();const restored=reloaded.api;
  assert.equal(restored.state,'playing');assert.equal(restored.runMode,'story');assert.equal(restored.player.damage,build.damage);assert.equal(restored.player.chargeSpeed,build.chargeSpeed);assert.equal(restored.player.weakDamage,build.weakDamage);assert.equal(restored.player.skills.v1,true);assert.equal(restored.player.skillsSpent,1);assert.equal(restored.player.hp,2);assert.equal(restored.player.pod.dockSide,'rear');assert.equal(restored.player.laserColor,'blue');assert.equal(restored.player.laserLevel,2);assert.equal(restored.player.dose,64);assert.equal(restored.runStats.damageDealt,123);assert.equal(restored.runElapsed,86.5);assert.equal(restored.profile.checkpoint.score,4521);assert.equal(restored.profile.lifetime.runs,0);
});

test('mode: module and doctrine checkpoints resume their pending choices without repeating rewards',()=>{
  const game=createGame(),{api}=game;api.start();api.makeMiniBoss();api.miniBoss.hp=0;api.update(1/120);assert.equal(api.profile.checkpoint.segment,'module');const gear=api.garage.inventory.length,minis=api.runStats.miniBosses;api.goMenu();api.loadGame();assert.equal(api.state,'upgrade');assert.equal(api.garage.inventory.length,gear);assert.equal(api.runStats.miniBosses,minis);api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);assert.equal(api.profile.checkpoint.segment,'postElite');const module=JSON.stringify(api.player.retrofits);api.goMenu();api.loadGame();assert.equal(api.state,'playing');assert.equal(api.miniBoss,null);assert.equal(JSON.stringify(api.player.retrofits),module);
  api.makeBoss();api.handleBossDefeat(api.boss);const rank=api.player.rank,points=api.player.skillPoints,bosses=api.runStats.normalBosses,secured=api.garage.inventory.length;assert.equal(api.profile.checkpoint.segment,'doctrine');api.goMenu();api.loadGame();assert.equal(api.state,'skilltree');assert.equal(api.player.rank,rank);assert.equal(api.player.skillPoints,points);assert.equal(api.runStats.normalBosses,bosses);assert.equal(api.garage.inventory.length,secured);api.learnSkill(api.skillPaths[0].nodes[0]);const weak=api.player.weakDamage;api.goMenu();api.loadGame();assert.equal(api.player.skillPoints,0);assert.equal(api.player.weakDamage,weak);api.closeSkillTree();assert.equal(api.wave,2);assert.equal(api.profile.checkpoint.segment,'mission');
});

test('mode: checkpoint reload preserves spent and ready stage guards through repeated saves',()=>{
  for(const spent of[false,true]){
    const game=createGame(),{api}=game,armor=api.normalizeGearItem({...api.generateGear(0),slot:'armor',trait:'ablative',stats:{},alignment:'VANGUARD'});
    api.garage.inventory=[armor];api.garage.equipped.armor=armor.id;api.start('story');api.player.skillPoints=6;
    for(const node of api.skillPaths[1].nodes)api.learnSkill(node);
    api.player.shield=0;
    if(spent){api.player.inv=0;api.damage(1);assert.equal(api.player.ablativeReady,false);api.player.hp=1;api.player.inv=0;api.damage(1);assert.equal(api.player.secondChanceReady,false)}
    api.makeMiniBoss();api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();
    assert.equal(api.profile.checkpoint.segment,'module');assert.equal(api.profile.checkpoint.player.ablativeReady,!spent);assert.equal(api.profile.checkpoint.player.secondChanceReady,!spent);
    const restored=createGame({initialStorage:[...game.storage]}).api;
    for(let pass=0;pass<2;pass++){
      restored.loadGame();assert.equal(restored.state,'upgrade');assert.equal(restored.player.ablativeReady,!spent);assert.equal(restored.player.secondChanceReady,!spent);
      assert.equal(restored.profile.checkpoint.player.ablativeReady,!spent);assert.equal(restored.profile.checkpoint.player.secondChanceReady,!spent);
      assert.equal(restored.readProfileSlot(0).checkpoint.player.ablativeReady,!spent);assert.equal(restored.readProfileSlot(0).checkpoint.player.secondChanceReady,!spent);restored.goMenu()
    }
  }
});

test('mode: advancing to the next mission refreshes guards while the current Doctrine stop does not',()=>{
  const{api}=createGame(),armor=api.normalizeGearItem({...api.generateGear(0),slot:'armor',trait:'ablative',stats:{},alignment:'VANGUARD'});
  api.garage.inventory=[armor];api.garage.equipped.armor=armor.id;api.start('story');api.player.skillPoints=6;for(const node of api.skillPaths[1].nodes)api.learnSkill(node);
  api.player.shield=0;api.player.inv=0;api.damage(1);api.player.hp=1;api.player.inv=0;api.damage(1);assert.equal(api.player.ablativeReady,false);assert.equal(api.player.secondChanceReady,false);
  api.makeBoss();api.handleBossDefeat(api.boss);api.flushVictoryDelay();assert.equal(api.state,'skilltree');assert.equal(api.player.ablativeReady,false);assert.equal(api.player.secondChanceReady,false);
  api.goMenu();api.loadGame();assert.equal(api.state,'skilltree');assert.equal(api.player.ablativeReady,false);assert.equal(api.player.secondChanceReady,false);
  api.closeSkillTree();assert.equal(api.wave,2);assert.equal(api.player.ablativeReady,true);assert.equal(api.player.secondChanceReady,true);
  assert.equal(api.profile.checkpoint.player.ablativeReady,true);assert.equal(api.profile.checkpoint.player.secondChanceReady,true);
});

test('mode: invalid checkpoints are unavailable and remain untouched until an explicit new run',()=>{
  const game=createGame(),{api}=game;api.start();const good=JSON.parse(JSON.stringify(api.profile.checkpoint));
  const badCases=[{...good,version:999},{...good,wave:11},{...good,mode:'lab'},{...good,segment:'midfight'},{...good,player:{...good.player,hp:0}},{...good,player:{...good.player,pod:null}},{...good,player:{...good.player,damage:Infinity}},{...good,stats:{...good.stats,finalized:true}},{...good,mode:'rush',segment:'mission'}];
  for(const bad of badCases){api.profile.checkpoint=bad;api.renderRunMenu();assert.equal(game.find('#load-game-btn').disabled,true);const before=JSON.stringify(api.profile.checkpoint);api.goMenu();api.loadGame();assert.equal(api.state,'menu');assert.equal(JSON.stringify(api.profile.checkpoint),before)}
});

test('mode: session-only checkpoints remain loadable while blocked or full storage preserves old data',()=>{
  for(const options of[{failSet:true},{blockStorageGetter:true}]){const game=createGame(options);game.api.start('rush');assert.ok(game.api.validateRunCheckpoint(game.api.profile.checkpoint));assert.equal(game.find('#save-status').hidden,false);game.api.goMenu();game.api.loadGame();assert.equal(game.api.runMode,'rush');game.api.flushBossArrival();assert.equal(game.api.boss.type,0);assert.equal(game.api.bossLab,false);assert.equal(game.api.readProfileSlot(0).checkpoint.mode,'rush')}
});

test('mode: developer labs never replace a real checkpoint or unlock full mission replays',()=>{
  const{api}=createGame();api.start('rush');const checkpoint=JSON.stringify(api.profile.checkpoint);api.goMenu();api.startLevelLab(0);api.makeBoss();api.handleBossDefeat(api.boss);api.flushVictoryDelay();assert.equal(JSON.stringify(api.profile.checkpoint),checkpoint);assert.equal(api.profile.progress.missionsCleared.filter(Boolean).length,0);assert.equal(api.profile.progress.normalBossesDefeated.filter(Boolean).length,0);
});

test('epic ritual sentinels retain native machinery art and distinct active, idle and spent states',()=>{
  const {api}=createGame(),ctx=api.drawingContext;
  const sentinel={x:185,y:115,r:31,hp:50,max:100,active:true,dead:false,clock:0,cool:.1,color:'#e45cff'};
  const paint=h=>{const original=JSON.stringify(h);ctx.trace=[];api.drawEpicHeavy(h);assert.equal(JSON.stringify(h),original,'Rendering must not alter a guardian or its firing clock');const trace=ctx.trace;ctx.trace=null;return trace};
  const charged=paint(sentinel),body=charged.find(item=>item.op==='drawImage');assert.ok(body&&body.image.src==='assets/combat-sprite-atlas.png','A ritual guardian must use the authored enemy atlas');
  const cellWidth=body.image.naturalWidth/4,cellHeight=body.image.naturalHeight/4;assert.equal(body.args[1],cellWidth);assert.equal(body.args[2],cellHeight*3);assert.ok(charged.some(item=>item.op==='fillRect'),'The active guardian needs its health readout');
  const idle=paint({...sentinel,active:false,cool:.7}),spent=paint({...sentinel,dead:true});assert.ok(idle.find(item=>item.op==='drawImage').alpha<body.alpha);assert.ok(spent.find(item=>item.op==='drawImage').alpha<idle.find(item=>item.op==='drawImage').alpha);
  const green=paint({...sentinel,color:'#78ff56'}).find(item=>item.op==='drawImage');assert.match(green.filter,/hue-rotate/);assert.equal(ctx.globalAlpha,1);
  api.startEpicBossLab(0);api.boss.ritual={timer:9,max:9};ctx.trace=[];api.drawBossStatus();
  const plate=ctx.trace.find(item=>item.op==='fillRect').args,[arenaWidth]=api.logicalSize;
  assert.ok(plate[0]>185+39&&plate[0]+plate[2]<arenaWidth-185-39,'The ritual panel must leave both upper corner guardians fully visible');ctx.trace=null;
});

test('mode: a secret epic replacing a Story apex clears that full mission and banks exactly one Exotic',()=>{
  const game=createGame(),{api}=game;api.profile.progress.normalBossesDefeated=Array(10).fill(true);api.profile.progress.epicUnlocked=true;api.start('story');api.makeEpicBoss(0,0);const before=api.garage.inventory.length;api.handleBossDefeat(api.boss);
  assert.equal(api.profile.progress.missionsCleared[0],true);assert.equal(api.profile.progress.missionsCleared[1],false);assert.equal(api.runStats.epicBosses,1);assert.equal(api.runStats.normalBosses,0);assert.equal(api.garage.inventory.length,before+1);assert.equal(api.garage.inventory.at(-1).tier,4);assert.equal(api.profile.checkpoint.segment,'doctrine');
  api.flushVictoryDelay();api.closeSkillTree();assert.equal(api.wave,2);assert.equal(api.profile.checkpoint.segment,'mission');assert.equal(api.garage.inventory.length,before+1);
});

test('sector pressure: ten mission tiers rise smoothly with fixed threat caps and one-hit damage',()=>{
  const {api}=createGame(),levels=Array.from({length:10},(_,index)=>api.sectorThreat(index+1));
  const rising=['pressure','speedScale','movementScale','projectileScale','healthScale','formationChance','turretChance'];
  for(let index=0;index<10;index++){
    const tier=levels[index];assert.equal(tier.sector,index+1);assert.equal(tier.progress,index/9);api.setWave(index+1);assert.equal(api.hostileDamage(),1,'Mission six must not silently double incoming damage');
    assert.ok(tier.formationChance+tier.turretChance<.8,'The encounter mix must retain solo-drone breathing room');
    if(index){for(const key of rising)assert.ok(tier[key]>levels[index-1][key],`${key} must progress through all ten sectors`);assert.ok(tier.fireScale<levels[index-1].fireScale);assert.ok(tier.formationSpacing<levels[index-1].formationSpacing)}
  }
  const top=levels.at(-1);for(const [key,cap]of Object.entries({pressure:1.6,speedScale:1.26,movementScale:1.12,projectileScale:1.24,healthScale:1.9,formationChance:.55,turretChance:.24}))assert.ok(Math.abs(top[key]-cap)<1e-9,`${key} must stop at its authored cap`);
  assert.ok(Math.abs(top.fireScale-.64)<1e-9);assert.equal(top.formationSpacing,42);
  assert.equal(JSON.stringify(api.sectorThreat(-5)),JSON.stringify(levels[0]));assert.equal(JSON.stringify(api.sectorThreat(100)),JSON.stringify(top));assert.equal(JSON.stringify(api.sectorThreat(NaN)),JSON.stringify(levels[0]));
});

test('sector pressure: spawned formations stay bounded and add one telegraphed leader without multiplying bullets',()=>{
  const game=createGame(),{api,sandbox}=game,context=vm.createContext(sandbox);
  for(let level=1;level<=10;level++){
    api.start('story');api.setWave(level);api.setTime(30);
    for(const roll of[.05,.4,.95]){
      vm.runInContext(`Math.random=()=>${roll}`,context);api.enemies.length=0;api.spawnEnemy();assert.ok(api.enemies.length>=1&&api.enemies.length<=4);
      for(const enemy of api.enemies){assert.equal(enemy.threat.sector,level);assert.equal(enemy.contactDamage,1);assert.ok(enemy.x>=api.logicalSize[0]+30);assert.ok(enemy.y>=65&&enemy.y<=api.logicalSize[1]-65);assert.ok(enemy.speed<=135*1.26+1e-9);assert.ok(enemy.hp<=9.5+1e-9);assert.ok(enemy.coolScale>=.64-1e-9)}
      if(roll===.4){assert.equal(api.enemies.length,4);assert.equal(api.enemies.filter(enemy=>enemy.type==='drone').length,level>=2?1:0);assert.equal(api.enemies[0].formationKind,level<3?'arc':level<5?'stagger':'cross');const lanes=api.enemies.map(enemy=>enemy.y);assert.ok(Math.max(...lanes)-Math.min(...lanes)<=150,'A formation must leave broad vertical escape lanes')}
      const enemy=api.enemies[0];api.enemyShots.length=0;api.enemyFire(enemy);assert.equal(api.enemyShots.length,1);const shot=api.enemyShots[0];assert.equal(shot.damage,1);assert.ok(Math.abs(Math.hypot(shot.vx,shot.vy)-190*enemy.threat.projectileScale)<1e-8);
    }
  }
});

test('sector pressure: elite and apex health budgets and exposure tells retain their authored limits',()=>{
  const {api}=createGame();
  for(let level=1;level<=10;level++){
    api.startMiniBossLab(level-1);const elite=api.miniBoss;assert.equal(elite.max,level===1?120:110+12*level);assert.equal(elite.threat.sector,level);assert.ok(Math.abs(elite.weakNodes.reduce((sum,node)=>sum+node.max,0)-elite.max)<1e-8);assert.equal(elite.intro,level===1?2.6:1.5);assert.ok(elite.cool>=1.15*.64-1e-9);
    api.startBossLab(level-1);api.makeBoss();assert.equal(api.boss.max,api.boss.baseHp);assert.equal(api.boss.threat.sector,level);assert.equal(api.boss.intro,2.4);assert.equal(api.boss.weakTimer,1.1);
  }
  api.startEpicBossLab(0);api.setWave(10);api.makeEpicBoss(0,9);assert.equal(api.boss.max,920);assert.equal(api.boss.threat.sector,10);assert.equal(api.boss.intro,3);for(const nodes of api.boss.weakNodesByPhase)assert.ok(Math.abs(nodes.reduce((sum,node)=>sum+node.max,0)-230)<1e-8);
  api.start('story');Object.assign(api.player,{damage:100,gun:5,rate:.02,critChance:.08,weakDamage:100,podDamage:100});assert.equal(api.bossBuildHealthScale(),1.45);api.makeBoss();assert.equal(api.boss.max,Math.round(api.boss.baseHp*1.45));assert.equal('threat' in api.profile.checkpoint.player,false,'Encounter tuning must not become a player stat or get applied twice after loading');
});

test('mission pacing: Meridian retains approved timing and later missions match its full field windows',()=>{
  const {api}=createGame(),timing=api.missionPacing,ratio=(timing.firstElite+timing.firstPost)/(72+54);
  assert.ok(ratio>=.65&&ratio<=.7,'Meridian travel should keep its approved one-third reduction');assert.equal(timing.firstElite,48);assert.equal(timing.firstPost,36);assert.equal(timing.elite,timing.firstElite);assert.equal(timing.post,timing.firstPost);
  for(const [timeline,duration]of[[api.levelOneTimeline,timing.firstElite],[api.levelOnePostMiniTimeline,timing.firstPost]]){
    for(let index=0;index<timeline.length;index++){assert.ok(timeline[index].at>=0&&timeline[index].at<duration-2);if(index)assert.ok(timeline[index].at>=timeline[index-1].at,'Authored beats must remain in chronological order')}
    const encounters=timeline.filter(beat=>!['cue','wreck'].includes(beat.kind));assert.ok(encounters.length>=8&&encounters.length<=14,'Trim repeated waves instead of compressing every old wave');for(let index=1;index<encounters.length;index++)assert.ok(encounters[index].at-encounters[index-1].at>=2.8-1e-9,'Each formation needs a readable entry beat');assert.ok(encounters.every(beat=>(beat.count||1)<=8));
  }
  assert.equal(api.levelOneTimeline.filter(beat=>beat.kind==='sine')[0].at,1.2);assert.equal(api.levelOneTimeline.filter(beat=>beat.kind==='sine')[1].at,4.1);
  assert.ok(api.levelOneTimeline.some(beat=>beat.kind==='cue'&&beat.text.includes('FORCE')));assert.ok(api.levelOneTimeline.some(beat=>beat.kind==='wreck'));assert.ok(api.levelOneTimeline.some(beat=>beat.kind==='cue'&&beat.text.includes('DESTRUCTIBLE')));assert.ok(api.levelOneTimeline.some(beat=>beat.kind==='guard'));assert.ok(api.levelOnePostMiniTimeline.some(beat=>beat.kind==='escort'));assert.ok(api.levelOnePostMiniTimeline.some(beat=>beat.kicker==='APEX CORRIDOR'));
});

test('mission pacing: shortened Meridian boundaries and older post-elite saves advance once without duplicate rewards',()=>{
  const {api}=createGame(),timing=api.missionPacing;api.start('story');api.player.inv=1e6;assert.equal(api.stageCountdown({id:1}),`${timing.firstElite}s TO ELITE`);
  api.setTime(timing.firstElite-.05);api.update(.02);assert.equal(api.miniBoss,null);api.update(.06);assert.ok(api.miniBoss);api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();assert.equal(api.state,'upgrade');api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);
  const banked=api.garage.inventory.length;assert.equal(api.runStats.miniBosses,1);api.profile.checkpoint.postEliteClock=timing.firstPost-.05;api.profile.checkpoint.stageClock=80;api.goMenu();api.loadGame();assert.equal(api.stageCountdown({id:1}),'1s POST-ELITE RUN');api.update(.02);assert.equal(api.stageApexIntro,-1);api.update(.06);assert.ok(api.stageApexIntro>4);assert.equal(api.miniBoss,null);assert.equal(api.boss,null);api.flushBossArrival();assert.ok(api.boss);assert.equal(api.runStats.miniBosses,1);assert.equal(api.garage.inventory.length,banked);
  api.profile.checkpoint.postEliteClock=44;api.profile.checkpoint.stageClock=100;api.goMenu();api.loadGame();assert.equal(api.stageCountdown({id:1}),'0s POST-ELITE RUN');api.update(1/120);assert.ok(api.stageApexIntro>4);assert.equal(api.miniBoss,null);assert.equal(api.runStats.miniBosses,1);assert.equal(api.garage.inventory.length,banked,'A legacy post-elite checkpoint must not repeat the module reward');
});

test('mission pacing: later missions always receive a full post-elite field instead of an expired global timer',()=>{
  const {api}=createGame(),timing=api.missionPacing;
  for(let level=2;level<=10;level++){
    api.start('story');api.setWave(level);api.player.inv=1e6;assert.equal(api.stageCountdown({id:level}),`${timing.elite}s TO ELITE`);
    api.setTime(timing.elite-.05);api.update(.02);assert.equal(api.miniBoss,null);api.update(.06);assert.ok(api.miniBoss);api.setTime(400);api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);
    api.update(.05);assert.equal(api.stageApexIntro,-1,'A long elite fight must not expire the post-elite run');assert.ok(api.postEliteClock>0&&api.postEliteClock<.1);assert.equal(api.stageCountdown({id:level}),`${timing.post}s POST-ELITE RUN`);
    api.setPostEliteClock(timing.post-.05);api.update(.02);assert.equal(api.stageApexIntro,-1);api.update(.06);assert.ok(api.stageApexIntro>4);assert.equal(api.stageCountdown({id:level}),'0s POST-ELITE RUN');assert.equal(api.miniBoss,null);assert.equal(api.boss,null);
  }
});

test('mission pacing: actual long elite combat and menus do not consume the later-sector field clock',()=>{
  const game=createGame(),{api,find}=game;api.start('story');api.setWave(2);api.player.inv=1e6;api.setTime(48);api.makeMiniBoss();advanceAudioRun(api,65);assert.ok(api.time>=113);assert.ok(api.miniBoss);assert.equal(api.postEliteClock,-1);
  api.miniBoss.hp=0;api.update(1/120);api.flushVictoryDelay();assert.equal(api.state,'upgrade');const before=api.time;api.loop(1000);api.loop(9000);assert.equal(api.time,before);assert.equal(api.postEliteClock,-1);api.openRoundGarage();assert.equal(api.state,'garage');api.loop(10000);api.loop(20000);assert.equal(api.time,before);assert.equal(api.postEliteClock,-1);api.finishRoundGarage();assert.equal(api.state,'upgrade');api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);advanceAudioRun(api,10.5);
  assert.equal(api.boss,null);assert.equal(api.stageApexIntro,-1);assert.ok(api.postEliteClock>10&&api.postEliteClock<11);assert.ok(api.enemies.length>0,'The extended post-elite run must contain actual formations');assert.ok(api.stageHazards.some(h=>h.type==='gate'&&h.variant==='metal'),'Cinder Rail keeps its own machinery hazards during the post-elite run');
  const clock=api.postEliteClock;api.pause();api.loop(30000);api.loop(40000);assert.equal(api.postEliteClock,clock);api.pause();api.saveRunCheckpoint('postElite');const inventory=api.garage.inventory.length;api.goMenu();find('#garage-menu-btn').onclick();api.loop(50000);api.loop(60000);assert.equal(api.postEliteClock,clock);api.goMenu();api.loadGame();assert.equal(api.postEliteClock,clock);assert.equal(api.miniBoss,null);assert.equal(api.runStats.miniBosses,1);assert.equal(api.garage.inventory.length,inventory);advanceAudioRun(api,1);assert.ok(api.postEliteClock>clock+.9);assert.equal(api.stageApexIntro,-1);
});

test('mission pacing: developer next-segment controls advance later levels through elite and post-elite phases',()=>{
  const {api}=createGame();for(const index of[1,9]){api.startLevelLab(index);api.player.inv=1e6;api.skipBossLabSegment();api.update(1/120);assert.ok(api.miniBoss);api.skipBossLabSegment();api.update(1/120);api.flushVictoryDelay();assert.equal(api.state,'upgrade');api.chooseTacticalRetrofit(api.tacticalRetrofitChoices()[0]);api.skipBossLabSegment();api.update(1/120);assert.ok(api.stageApexIntro>4);api.flushBossArrival();assert.ok(api.boss);assert.equal(api.boss.type,index)}
});

test('all runtime requested and shipping entry assets exist', () => {
  for (const match of html.matchAll(/(?:src|href)="((?!https?:)[^"]+)"/g)) requestedAssets.add(match[1]);
  for (let index = 1; index <= 10; index++) requestedAssets.add(`music/level${index}.mp3`);
  for (const index of [1, 3, 4, 9, 10, 11, 12, 13, 14]) requestedAssets.add(`music/bosses/boss${index}.mp3`);
  for (let index = 1; index <= 6; index++) requestedAssets.add(`music/epic/epic${index}.mp3`);
  const missing = [...requestedAssets].filter(asset => {
    const clean = asset.split('?')[0];
    return clean && !clean.startsWith('data:') && !fs.existsSync(path.join(root, clean));
  });
  assert.deepEqual(missing, []);
});

Promise.all(pendingTests).then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed; ${requestedAssets.size} asset references checked.`);
  console.log('Scope: simulated logic with mocked browser APIs. Real GPU output, sound quality, device input, and long-session balance require browser playtesting.');
  if (failures.length) process.exitCode = 1;
});
