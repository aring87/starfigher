#!/usr/bin/env node
'use strict';
// Native gear generator in private VM storage. Fixed-seed distribution evidence
// checks a stated uniform-roll contract, not player win rates or power balance.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline'),name=baseline?'artifacts/gear-roll-v159-baseline-game.js':'game.js',source=fs.readFileSync(path.join(root,name),'utf8');
const file=path.join(__dirname,'verify-game.cjs');let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));
support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(source)+';');
support=support.replace('  globalThis.__gameTest = {','  globalThis.__gameTest = {rollInt,get gearRollRules(){return{affixes:gearAffixes,rarities:rarityData}},');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(support+'\nmodule.exports={createGame};',file);
const g=m.exports.createGame({ruleset:'streamlined-v1'}),a=g.api,plain=v=>JSON.parse(JSON.stringify(v)),rules=plain(a.gearRollRules),results=[];
function random(fn){g.sandbox.__gearRollRandom=fn;vm.runInContext('Math.random=globalThis.__gearRollRandom',vm.createContext(g.sandbox))}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.log('FAIL '+name+': '+error.message)}}
const beforeProfile=JSON.stringify(a.profile),beforePlayer=JSON.stringify(a.player),byTier={};let legal=true;
for(let tier=0;tier<5;tier++){
 random(rng(731+tier*9001));const slots={};
 for(const [slot,pool]of Object.entries(rules.affixes))slots[slot]={items:0,stats:Object.fromEntries(pool.map(row=>[row[0],0]))};
 for(let n=0;n<10000;n++){
  const item=a.generateGear(tier),row=slots[item.slot];row.items++;legal&&=item.tier===tier&&Object.keys(item.stats).length===rules.rarities[tier].affixes;
  for(const[key,value]of Object.entries(item.stats)){const range=rules.affixes[item.slot].find(row=>row[0]===key)?.[2][tier];legal&&=!!range&&Number.isInteger(value)&&value>=range[0]&&value<=range[1];row.stats[key]++}
 }
 byTier[tier]=slots;
}
check('every rarity keeps its authored unique stat count and integer roll bounds across 50,000 native items',()=>{assert.equal(legal,true);return{items:50000}});
for(const tier of[0,2,4])check(rules.rarities[tier].name+' stat selection gives every allowed stat an equal opportunity',()=>{
 const rows=[];for(const[slot,row]of Object.entries(byTier[tier])){
  const expected=row.items*rules.rarities[tier].affixes/4,chiSquare=Object.values(row.stats).reduce((s,n)=>s+(n-expected)**2/expected,0);
  rows.push({slot,items:row.items,inclusionPct:Object.fromEntries(Object.entries(row.stats).map(([k,v])=>[k,Math.round(v/row.items*10000)/100])),chiSquare});
  assert.ok(chiSquare<48,slot+' has an unintended stat preference: '+JSON.stringify(rows.at(-1)));
 }return rows;
});
const integerHistograms={};
check('every value in an authored integer range has the same roll probability, including endpoints',()=>{
 const unique=new Set(Object.values(rules.affixes).flat().flatMap(row=>row[2].map(range=>range.join(':'))));
 for(const key of unique){const[low,high]=key.split(':').map(Number),bins=Array(high-low+1).fill(0),samples=bins.length*120;
  let sample=0;random(()=>((sample++)+.5)/samples);for(let n=0;n<samples;n++)bins[a.rollInt(low,high)-low]++;integerHistograms[key]=bins;
  assert.ok(bins.every(count=>count===120),key+' endpoint weighting: '+bins.join('/'));
 }return{ranges:unique.size};
});
check('rolling new items never edits the pilot, equipment or live combat build',()=>{assert.equal(JSON.stringify(a.profile),beforeProfile);assert.equal(JSON.stringify(a.player),beforePlayer);return{inventory:a.garage.inventory.length}});
const failed=results.filter(row=>!row.passed).length,report={source:name,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),baseline,passed:results.length-failed,failed,results,byTier,integerHistograms,limits:'50,000 fixed-seed native item generations and exact integer buckets. No drop/rarity-rate, equipped-stat, saved-item or combat-balance changes are inferred.'};
fs.writeFileSync(path.join(root,'artifacts/gear-roll-'+(baseline?'v159-baseline':'v160')+'-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed} passed, ${failed} failed${baseline?' (historical baseline)':''}`);if(failed&&!baseline)process.exitCode=1;
