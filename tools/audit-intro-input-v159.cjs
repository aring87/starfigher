#!/usr/bin/env node
'use strict';
// Report production tutorial copy after actual binding imports/remaps in a VM.
// Read-only gameplay; no browser, real pilot or production-file writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'tools/verify-game.cjs');
const capturedGame=fs.readFileSync(path.join(root,'game.js'),'utf8');
let support=fs.readFileSync(file,'utf8');support=support.slice(0,support.indexOf('\ntest('));support=support.replace("const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');",'const source='+JSON.stringify(capturedGame)+';');
support=support.replace('globalThis.__gameTest = {','globalThis.__gameTest = {formatInputLesson,applyControlBindings,setInputDevice,openFlightSchool,get inputConfig(){return controlBindings},get practiceFrame(){return trainingFrame},');
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(support+'\nmodule.exports={createGame};',file);
const catalogue={window:{}};const training=fs.readFileSync(path.join(root,'training.js'),'utf8').replace('window.StarfighterTraining=Object.freeze({','window.__lessonSources={full:LESSONS,intro:INTRO_LESSONS};window.StarfighterTraining=Object.freeze({');vm.runInNewContext(training,catalogue);
const g=mod.exports.createGame({ruleset:'streamlined-v1'}),a=g.api,B=g.sandbox.StarfighterBindings;
let current=a.inputConfig;
for(const[action,key]of Object.entries({up:'Numpad8',left:'Numpad4',down:'Numpad2',right:'Numpad6',fire:'KeyK',precision:'KeyR',force:'KeyF',mount:'KeyG',delta:'KeyE',pause:'KeyO',tree:'KeyU'}))current=B.rebind(current,'keyboard',action,0,key).bindings;
current=B.rebind(current,'keyboard','fire',1,'KeyJ').bindings;current=B.rebind(current,'keyboard','fire',2,'KeyH').bindings;a.applyControlBindings(current);
function row(device,lesson){a.setInputDevice(device);return{device,id:lesson.id,...JSON.parse(JSON.stringify(a.formatInputLesson(lesson)))}}
const rows=[];for(const device of['keyboard','controller'])for(const lesson of catalogue.window.__lessonSources.intro)rows.push(row(device,lesson));
for(const device of['keyboard','controller'])for(const id of['spectrum','support','delta'])rows.push(row(device,catalogue.window.__lessonSources.full.find(x=>x.id===id)));
a.setInputDevice('controller');a.openFlightSchool(false,'intro');
const data={sourceSha256:crypto.createHash('sha256').update(capturedGame).digest('hex'),trainingSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'training.js'))).digest('hex'),bindings:JSON.parse(JSON.stringify(current)),frame:a.practiceFrame?.src,rows,limits:'Formatted production lessons in native-game VM with private storage. No browser display/controller hardware or campaign outcome claim.'};
fs.writeFileSync(path.join(root,'artifacts/intro-input-v159-audit.json'),JSON.stringify(data,null,2)+'\n');
for(const r of rows)console.log(JSON.stringify({device:r.device,id:r.id,keys:r.keys,copy:r.copy}));
console.log('Recorded '+rows.length+' current production lesson/input snapshots.');
