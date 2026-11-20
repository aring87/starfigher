'use strict';
// Read-only audit of the production native-pose registration. No artwork changes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
function declaration(name) {
  const start = source.indexOf('const ' + name + '=');
  if (start < 0) throw new Error('Missing production declaration: ' + name);
  return source.slice(start, source.indexOf(';', start) + 1);
}
function fn(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing production function: ' + name);
  const body = source.indexOf('{', start); let depth = 1, end = body + 1;
  // These selected render helpers have no braces in string literals/comments.
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(start, end);
}
const render = new Function(`
  const settings={reducedMotion:false}, t=0;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  ${['miniBossDefs','miniBossCoreTracks','miniBossRootCenters','miniBossIdleRows','miniBossMuzzleOffsets'].map(declaration).join('\n')}
  ${['miniBossFrame','miniBossFrameRegistration','miniBossAttackIntent','miniBossRecoilOffset','miniBossNodeOffset','bossSpriteMotion','bossVisualAngle','enemyRenderPose','miniBossMuzzle'].map(fn).join('\n')}
  return {miniBossDefs,miniBossCoreTracks,miniBossRootCenters,miniBossFrame,miniBossFrameRegistration,miniBossRecoilOffset,enemyRenderPose,miniBossMuzzle,bossSpriteMotion};
`)();
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const maxStep=points=>Math.max(...points.map((p,i)=>distance(p,points[(i+1)%points.length])));
const round=n=>Number(n.toFixed(6));
const roster=render.miniBossDefs.map((def,type)=>{
  const sourcePoints=render.miniBossCoreTracks[type].map(frame=>frame[1]);
  const fixedRoot=render.miniBossRootCenters[type];
  const registrations=sourcePoints.map(p=>[fixedRoot[0]-p[0],fixedRoot[1]-p[1]]);
  const registered=sourcePoints.map((p,i)=>[p[0]+registrations[i][0],p[1]+registrations[i][1]]);
  const enemy={kind:'mini',type,def,x:700,y:260,clock:10,animOffset:0,visualAngle:0,intro:0,cool:0,hitFlash:0,recoil:0,lastShotClock:-10};
  const before=render.enemyRenderPose(enemy), beforeFrame=render.miniBossFrame(enemy), beforeMuzzle=render.miniBossMuzzle(enemy);
  enemy.cool=1.2;enemy.recoil=1;enemy.lastShotClock=enemy.clock;
  const after=render.enemyRenderPose(enemy),afterFrame=render.miniBossFrame(enemy),afterMuzzle=render.miniBossMuzzle(enemy);
  return {
    enemy:def.name,
    root:'native reactor/core track 1, mean root across all 16 source poses',
    nativeSourcePoses:16, runtimeIdlePoses:4, idleSequence:[0,4,8,12,8,4], cadencePosesPerSecond:def.rate*.5,
    largestRootStepBeforeDisplayPixels:round(maxStep(sourcePoints)),
    largestRootStepAfterRegistrationDisplayPixels:round(maxStep(registered)),
    maxFrameCorrectionDisplayPixels:round(Math.max(...registrations.map(p=>Math.hypot(...p)))),
    triggerPoseStepDisplayPixels:round(Math.hypot(before.x-after.x,before.y-after.y)),
    triggerMuzzleStepDisplayPixels:round(Math.hypot(beforeMuzzle.x-afterMuzzle.x,beforeMuzzle.y-afterMuzzle.y)),
    triggerFrameBefore:beforeFrame,triggerFrameAfter:afterFrame,
    frameRegistrationDisplayPixels:registrations.map(point=>point.map(round))
  };
});
const audit={
  scope:'Production helper audit, all 16 source poses plus loop closure. The reactor root is stabilized rigidly; native armor/fin articulation, silhouette changes and authored lighting variation remain. No source artwork is edited.',
  units:'Logical display pixels at each enemy authored render size. Root step excludes intentional global bank, movement, breathing and recoil; the actual renderer applies registration under those shared transforms.',
  source:'game.js production tables and helper functions',
  roster,
  recoilCurve:[0,1/120,1/60,1/30,.055,.09,.15,.3,.55].map(age=>({secondsAfterTrigger:round(age),localOffsetDisplayPixels:round(render.miniBossRecoilOffset({clock:10+age,lastShotClock:10}))})),
  limitations:'This validates native-root placement and trigger continuity, not optical-flow reconstruction of every contour. All original native fins/armor still animate; actual GPU/collision/projectile validation belongs to the verification harness and browser playtest.'
};
const output=path.join(root,'artifacts','miniboss-motion-audit.json');
fs.writeFileSync(output,JSON.stringify(audit,null,2)+'\n');
for(const item of roster) console.log(`${item.enemy}: root loop step ${item.largestRootStepBeforeDisplayPixels.toFixed(2)}px → ${item.largestRootStepAfterRegistrationDisplayPixels.toFixed(2)}px; trigger ${item.triggerPoseStepDisplayPixels.toFixed(6)}px; frame ${item.triggerFrameBefore} → ${item.triggerFrameAfter}`);
