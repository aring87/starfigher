#!/usr/bin/env node
'use strict';

// Read actual PNG opacity and run the shipping render/damage paths in the
// isolated browser harness. No player saves or production assets are written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const harnessPath = path.join(__dirname, 'verify-game.cjs');
let support = fs.readFileSync(harnessPath, 'utf8');
support = support.slice(0, support.indexOf('\ntest('));
support = support.replace('nativeFractureProfile,nativeFractureVertices,', 'nativeFractureProfile,nativeFractureVertices,drawNativeFracturedBody,detachNativePart,captureNativeFractureBody,paintNativeBossBody,paintMiniBossNativeBody,miniBossSpriteFor,damageWeakNode,drawBossFragment,beginEpicRitual,finishEpicRitual,resumeEpicPhase,forceMiniFrame(frame){miniBossFrame=()=>frame},');
support = support.replace('createElement: tag => element(tag),', "createElement: tag => {const node=element(tag);if(tag==='canvas')node.getContext('2d').trace=[];return node},");
const harness = new Module(harnessPath, module);
harness.filename = harnessPath; harness.paths = module.paths;
harness._compile(support + '\nmodule.exports={createGame,pngMaterial};\n', harnessPath);
const { createGame, pngMaterial } = harness.exports;
const preparedSources=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/destruction/manifest.json'),'utf8')).sources;
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
function start(api, family, type, phase = 1) {
  if (family === 'mini') api.startMiniBossLab(type);
  else if (family === 'epic') api.startEpicBossLab(type);
  else api.startBossLab(type);
  const enemy = family === 'mini' ? api.miniBoss : api.boss;
  Object.assign(enemy, { x: 745, y: 267, intro: 0, clock: .61, cool: 5, hitFlash: 0, weakOpen: true, coreAperture: 1 });
  if (family !== 'mini') enemy.phase = phase;
  api.player.inv = 1e6;
  return enemy;
}
function roster(run, includeBloodstar = false) {
  for (const family of ['mini', 'main', 'epic']) for (let type = 0; type < (family === 'epic' ? 2 : 10); type++) {
    if (!includeBloodstar && family === 'main' && type === 0) continue;
    for (let phase = 1; phase <= (family === 'mini' ? 1 : family === 'epic' ? 4 : 2); phase++) run(family, type, phase);
  }
}
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function inverse(m, x, y) {
  const determinant = m[0] * m[3] - m[1] * m[2];
  return [(m[3] * (x - m[4]) - m[2] * (y - m[5])) / determinant, (-m[1] * (x - m[4]) + m[0] * (y - m[5])) / determinant];
}
function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i], [c, d] = points[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
  }
  return hit;
}
function bounds(points) { return { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])) }; }
function nativePaint(api, enemy, frame) {
  const context = api.drawingContext; context.trace = []; context.resetTransform();
  if (enemy.kind === 'mini') api.paintMiniBossNativeBody(enemy, frame); else api.paintNativeBossBody(enemy, 0);
  return context.trace.filter(record => record.op === 'drawImage' && record.image.sourcePath?.endsWith('.png')).map(record => {
    const material = pngMaterial(record.image.sourcePath), coordinates = record.args.slice(1);
    const rect = coordinates.length === 8 ? coordinates : [0, 0, material.width, material.height, ...coordinates];
    return { ...record, material, rect };
  });
}
function paintedAlpha(draws, x, y) {
  for (const draw of draws) {
    const [px, py] = inverse(draw.matrix, x, y), [sx, sy, sw, sh, dx, dy, dw, dh] = draw.rect;
    const u = (px - dx) / dw, v = (py - dy) / dh;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
    const ix = Math.floor(sx + u * sw), iy = Math.floor(sy + v * sh);
    if (ix >= 0 && iy >= 0 && ix < draw.material.width && iy < draw.material.height && draw.material.alpha[iy * draw.material.width + ix] > 40) return true;
  }
  return false;
}
function nativeCoverage(api, enemy, draws, frame) {
  assert.ok(draws.length, 'The body painter must use native PNG source art');
  const corners = draws.flatMap(draw => { const [, , , , x, y, w, h] = draw.rect; return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(p => transform(draw.matrix, ...p)); });
  const body = bounds(corners); let bodyPixels = 0;
  for (let y = body.minY; y < body.maxY; y += 2) for (let x = body.minX; x < body.maxX; x += 2) if (paintedAlpha(draws, x, y)) bodyPixels++;
  assert.ok(bodyPixels > 100);
  const profiles=api.activeWeakNodes(enemy).map(node=>api.nativeFractureProfile(enemy,node,frame)).filter(Boolean);
  for (const node of api.activeWeakNodes(enemy)) {
    const profile = api.nativeFractureProfile(enemy, node, frame);if(!profile)continue;
    const vertices = api.nativeFractureVertices(profile), box = bounds(vertices); let cutPixels = 0;
    assert.ok(vertices.length >= 3, 'An exterior assembly needs an open silhouette sever region');
    assert.ok(vertices.flat().every(Number.isFinite));
    assert.ok(profile.cutlineVertices?.length>=2,`${enemy.kind}/${enemy.type}/phase${enemy.phase||1}/frame${frame}/node${profile.index}: missing physical joint line`);
    for (let y = box.minY; y < box.maxY; y += 2) for (let x = box.minX; x < box.maxX; x += 2) if (inside(vertices, x, y) && paintedAlpha(draws, x, y)) cutPixels++;
    assert.ok(cutPixels >= 8, `${enemy.kind}/${enemy.type}/phase${enemy.phase || 1}/frame${frame}/node${profile.index} must contain real opaque native art`);
    if(process.argv.includes('--coverage-diagnostics')&&cutPixels/bodyPixels>=.5)console.log(`COVERAGE ${enemy.kind}/${enemy.type}/phase${enemy.phase||1}/frame${frame}/node${profile.index}: ${(cutPixels/bodyPixels*100).toFixed(1)}%`);else assert.ok(cutPixels / bodyPixels < .5, `${enemy.kind}/${enemy.type}/phase${enemy.phase || 1}/frame${frame}/node${profile.index}: sever removes ${(cutPixels/bodyPixels*100).toFixed(1)}% of the hull; most hull must remain`);
    if(profile.protectedHousing){
      const housing=profile.protectedHousing;
      for(let y=-housing.ry;y<=housing.ry;y+=3)for(let x=-housing.rx;x<=housing.rx;x+=3)if((x/housing.rx)**2+(y/housing.ry)**2<=1)assert.ok(!inside(vertices,housing.x+x,housing.y+y),'An exterior sever must preserve its central reactor housing');
    }
  }
  if(enemy.kind==='mini')assert.equal(profiles.length,2,'Every miniboss has upper/lower appendages and a solid central core');
}
function readyGroups(api,enemy){
  return [...new Map(api.activeWeakNodes(enemy).map(node=>api.nativeFractureProfile(enemy,node)).filter(profile=>profile&&api.nativeFractureGroupReady(enemy,profile)).map(profile=>[profile.groupId??profile.index,profile])).values()]
}
function assertPreparedParts(api, enemy) {
  const world = api.drawingContext, scratch = api.fractureContext;
  world.trace = []; scratch.trace = []; world.resetTransform(); api.setShake(0);
  world.save();api.applyPose(enemy,enemy.kind==='mini'?false:undefined);
  api.drawNativeFracturedBody(enemy,()=>enemy.kind==='mini'?api.paintMiniBossNativeBody(enemy):api.paintNativeBossBody(enemy,0));world.restore();
  const profiles=readyGroups(api,enemy),broken=api.nativeSpriteBrokenGroups(enemy);
  assert.deepEqual([...broken].sort(),profiles.map(profile=>profile.groupId??profile.index).sort(),'Prepared ownership follows only the completed exterior support groups');
  assert.equal([...world.trace,...scratch.trace].some(record=>record.composite==='destination-out'),false,'Prepared parts must never cut holes into the body or combat layers');
  const draws=world.trace.filter(record=>record.op==='drawImage');assert.ok(draws.length,'The native body remains visible');
  const leaves=draws.flatMap(record=>record.image.getContext?sourceLeaves(record.image):record.image.sourcePath?[record.image.sourcePath]:[]),key=`${enemy.kind==='mini'?'mini':enemy.epic?'epic':'main'}:${enemy.epic?enemy.epicId:enemy.type}:${enemy.phase||1}`;
  const registered=Object.values(preparedSources).filter(sheet=>sheet.uses?.includes(key));assert.ok(registered.length,'The current family and phase have authored ownership layers');
  for(const profile of profiles){const files=registered.flatMap(sheet=>sheet.parts.filter(part=>part.id===profile.groupId).map(part=>part.file));assert.ok(files.length,'Every missing group has an authored part layer');assert.ok(files.every(file=>!leaves.includes(file)),'A detached part must not remain in the surviving body paint');}
  assert.ok(draws.every(record=>record.matrix.every(Number.isFinite)),'Every surviving native layer keeps a finite articulated transform');
}
function sourceLeaves(canvas, seen = new Set()) {
  if (seen.has(canvas)) return []; seen.add(canvas);
  return (canvas.getContext('2d').trace || []).filter(record => record.op === 'drawImage').flatMap(record => record.image.getContext ? sourceLeaves(record.image, seen) : record.image.sourcePath ? [record.image.sourcePath] : []);
}

check('all ten minibosses sever opaque outer assemblies while preserving reactor housings in all sixteen frames', () => {
  const { api } = createGame();
  for (let type = 0; type < 10; type++) {
    const enemy = start(api, 'mini', type);
    for (let frame = 0; frame < 16; frame++){api.forceMiniFrame(frame);nativeCoverage(api, enemy, nativePaint(api, enemy, frame), frame)}
  }
});

check('all other main and secret boss phases cut bounded parts from actual articulated PNG paint', () => {
  const { api } = createGame();
  roster((family, type, phase) => {
    if (family === 'mini') return;
    const enemy = start(api, family, type, phase);
    for (const clock of [.11, .61, 1.17]) { enemy.clock = clock; nativeCoverage(api, enemy, nativePaint(api, enemy)); }
  });
});

check('outer assemblies detach once after their last supporting core and central cores emit no fake plates', () => {
  const { api } = createGame();
  let breakSounds=0,sharedGroups=0;api.sfx.weakBreak=api.sfx.tentacleBreak=()=>{breakSounds++};
  roster((family, type, phase) => {
    const enemy = start(api, family, type, phase);
    const emitted=new Set();
    for (const node of api.activeWeakNodes(enemy)) {
      const profile=api.nativeFractureProfile(enemy,node),group=profile&&(profile.groupId??profile.index),members=profile?api.activeWeakNodes(enemy).filter(member=>{const candidate=api.nativeFractureProfile(enemy,member);return candidate&&(candidate.groupId??candidate.index)===group}):[];
      if(members.length>1)sharedGroups++;
      const before = api.bossFragments.length,soundsBefore=breakSounds;api.fractureContext.trace=[]; api.damageWeakNode(enemy, node, node.hp + 1);
      const shouldDetach=profile&&api.nativeFractureGroupReady(enemy,profile)&&!emitted.has(group);
      assert.equal(api.bossFragments.length, before + (shouldDetach?1:0), `${family}/${type}/phase${phase} must sever only completed exterior groups`);
      assert.equal(breakSounds,soundsBefore+1,'A native part break must produce exactly one fracture sound');
      if(!shouldDetach){const repeated=api.bossFragments.length;api.damageWeakNode(enemy,node,1000);assert.equal(api.bossFragments.length,repeated);continue}
      emitted.add(group);assert.ok(members.every(member=>member.nativeDetached));
      const part = api.bossFragments.at(-1), point = api.worldWeakNode(enemy, node);
      assert.ok(part.nativeChunk?.canvas); assert.equal(part.procedural, undefined);
      const{localBounds:crop,localCenter:center}=part.nativeChunk,pose=api.renderPose(enemy),matrix=[Math.cos(pose.angle)*pose.scaleX,Math.sin(pose.angle)*pose.scaleX,-Math.sin(pose.angle)*pose.scaleY,Math.cos(pose.angle)*pose.scaleY,pose.x,pose.y],origin=transform(matrix,center.x,center.y);
      assert.ok([crop.x,crop.y,crop.w,crop.h,center.x,center.y].every(Number.isFinite));assert.ok(crop.w>0&&crop.h>0);
      assert.ok(Math.hypot(center.x-crop.x-crop.w/2,center.y-crop.y-crop.h/2)<1e-7);
      assert.ok(Math.hypot(part.x-origin[0],part.y-origin[1])<.001,'The fragment must begin at its actual cropped native-art center');
      assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y),'The damaged collider stays valid without forcing the limb center onto it');
      assert.ok(Number.isFinite(part.vx) && Number.isFinite(part.vy) && Math.abs(part.vr) > .5);
      api.detachNativePart(enemy, node); api.damageWeakNode(enemy, node, 1000); assert.equal(api.bossFragments.length, before + 1);
      assert.equal(breakSounds,soundsBefore+1,'Repeated damage must not replay the fracture sound');
      const preparedParts=new Set(Object.values(preparedSources).filter(sheet=>sheet.uses?.includes(`${family}:${type}:${phase}`)).flatMap(sheet=>sheet.parts.filter(part=>part.id===group).map(part=>part.file)));
      assert.ok(preparedParts.size,'The native family/phase/group needs a registered prepared part');
      assert.ok(sourceLeaves(part.nativeChunk.canvas).some(file=>preparedParts.has(file)), 'The detached texture must descend from its exact authored part layer or ownership mask');
      api.drawingContext.trace = []; api.drawBossFragment(part);
      assert.ok(api.drawingContext.trace.some(record => record.op === 'drawImage' && record.image === part.nativeChunk.canvas && record.alpha===1),'A fresh source-art chunk must stay solid during its initial fall');
    }
  });
  assert.ok(sharedGroups>0,'At least one real multi-core appendage must exercise wait-for-last-member behavior');
});

check('Bloodstar retains authored tentacle masks and source-art fragments', () => {
  const { api } = createGame();
  for (const phase of [1, 2]) {
    const enemy = start(api, 'main', 0, phase), node = api.activeWeakNodes(enemy).find(node => node.tentacleIndex >= 0);
    api.damageWeakNode(enemy, node, node.hp + 1); const part = api.bossFragments.at(-1);
    assert.ok(part.asset?.sourcePath?.includes('bloodstar')); assert.equal(node.detached, true);
    const before = api.bossFragments.length; api.damageWeakNode(enemy, node, 1000); assert.equal(api.bossFragments.length, before);
  }
});

check('miniboss outer severs persist through all frames and hit flashes without moving surviving colliders', () => {
  const { api } = createGame();
  for (let type = 0; type < 10; type++) {
    const enemy = start(api, 'mini', type), nodes = api.activeWeakNodes(enemy); api.damageWeakNode(enemy, nodes[0], nodes[0].hp + 1);
    for (let frame = 0; frame < 16; frame++) {
      api.forceMiniFrame(frame); enemy.clock = frame * .1; enemy.hitFlash = frame % 2 ? .12 : 0;
      const before = JSON.stringify(nodes.slice(1).map(node => api.worldWeakNode(enemy, node))), hp = enemy.hp;
      assertPreparedParts(api, enemy, 1);
      assert.equal(enemy.hp, hp); assert.equal(JSON.stringify(nodes.slice(1).map(node => api.worldWeakNode(enemy, node))), before);
    }
  }
});

check('main and secret boss missing parts stay registered through key poses and phase-specific anatomy', () => {
  const { api } = createGame();
  roster((family, type, phase) => {
    if (family === 'mini') return;
    const enemy = start(api, family, type, phase);
    for (const node of api.activeWeakNodes(enemy)) { node.destroyed = true; node.hp = 0; }
    for (let pose = 0; pose < 8; pose++) { enemy.clock = pose * .173; enemy.hitFlash = pose % 2 ? .1 : 0; assertPreparedParts(api, enemy, api.activeWeakNodes(enemy).length); }
  });
});

check('art studies restore prior missing parts and fragment lists without duplicating detachments', () => {
  const { api } = createGame();
  for (const [family, type] of [['mini', 0], ['mini', 9], ['main', 1], ['main', 9], ['epic', 0], ['epic', 1]]) {
    const enemy = start(api, family, type),node=api.activeWeakNodes(enemy).find(node=>api.nativeFractureProfile(enemy,node)),profile=api.nativeFractureProfile(enemy,node);
    for(const member of api.activeWeakNodes(enemy)){const candidate=api.nativeFractureProfile(enemy,member);if(candidate&&candidate.groupId===profile.groupId)api.damageWeakNode(enemy,member,member.hp+1)}
    const parts = api.bossFragments, state = JSON.stringify(api.activeWeakNodes(enemy));
    api.openArtInspection(); api.setInspectionMaterial('destroyed'); api.setInspectionMaterial('closed'); api.closeArtInspection();
    assert.equal(api.bossFragments, parts); assert.equal(JSON.stringify(api.activeWeakNodes(enemy)), state); assertPreparedParts(api, enemy, 1);
  }
});

check('new main and epic phases do not inherit removed parts from earlier node arrays', () => {
  const { api } = createGame();
  for (let type = 1; type < 10; type++) {
    const enemy = start(api, 'main', type); for (const node of api.activeWeakNodes(enemy)) api.damageWeakNode(enemy, node, node.hp + 1);
    api.update(1 / 120); assert.equal(enemy.phase, 2); assert.ok(api.activeWeakNodes(enemy).every(node => !node.destroyed && !node.nativeDetached)); assertPreparedParts(api, enemy, 0);
  }
  for (let type = 0; type < 2; type++) {
    const enemy = start(api, 'epic', type); for (const node of api.activeWeakNodes(enemy)) api.damageWeakNode(enemy, node, node.hp + 1);
    api.beginEpicRitual(enemy); api.finishEpicRitual(enemy, true); api.resumeEpicPhase(enemy); assert.equal(enemy.phase, 2);
    assert.ok(api.activeWeakNodes(enemy).every(node => !node.destroyed && !node.nativeDetached)); assertPreparedParts(api, enemy, 0);
  }
});

check('native limbs fall, rotate and expire while the outer assembly stays missing', () => {
  const { api } = createGame(), enemy = start(api, 'mini', 0), node = api.activeWeakNodes(enemy)[0]; api.damageWeakNode(enemy, node, node.hp + 1);
  const part = api.bossFragments.at(-1), before = { x: part.x, y: part.y, rot: part.rot, vy: part.vy };
  api.update(.1); assert.notEqual(part.x, before.x); assert.notEqual(part.y, before.y); assert.notEqual(part.rot, before.rot); assert.ok(part.vy > before.vy);
  for (let tick = 0; tick < 300; tick++) api.update(1 / 120);
  assert.ok(!api.bossFragments.includes(part)); assert.equal(node.destroyed, true); assertPreparedParts(api, enemy, 1);
});

check('central reactors remain solid and scorched without alpha cuts or fake chunks', () => {
  const{api}=createGame();let centers=0;
  roster((family,type,phase)=>{
    const enemy=start(api,family,type,phase),central=api.activeWeakNodes(enemy).filter(node=>!api.nativeFractureProfile(enemy,node));
    for(const node of central){const before=api.bossFragments.length;api.damageWeakNode(enemy,node,node.hp+1);assert.equal(api.bossFragments.length,before);assert.equal(node.destroyed,true);centers++}
    assertPreparedParts(api,enemy);assert.equal(readyGroups(api,enemy).length,0,'Destroyed central cores must not trigger a body mask');
    assert.equal(api.fractureContext.trace.some(record=>record.composite==='destination-out'),false);
  });
  assert.ok(centers>=10,'All ten miniboss reactors must use solid scorched housings');
  const enemy = start(api, 'mini', 0), original = api.drawingContext;
  assert.throws(() => api.captureNativeFractureBody(enemy, () => { throw new Error('intentional capture interruption'); }), /intentional capture interruption/);
  assert.equal(api.drawingContext, original); api.draw(); assert.equal(api.drawingContext, original);
});

console.log(`\n${passed} detachable-part checks passed; native PNG opacity and production render/damage paths verified.`);
console.log('Scope: isolated simulation and real source pixels. Final animated appearance requires browser review.');
