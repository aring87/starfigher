#!/usr/bin/env node
'use strict';
// DOM/lifecycle contracts for first-earned guidance. Player persistence belongs
// to the supplied profile callbacks; this test never reads a browser save.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rootPath=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(rootPath,'onboarding.js'),'utf8');
function walk(node){return[node,...node.children.flatMap(walk)]}
class Element{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.parentElement=null;this.children=[];this.attributes=new Map();this.listeners=new Map();this.style={};this.dataset={};this.className='';this.id='';this.text='';}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('')}
  set textContent(value){this.text=String(value);this.children.forEach(n=>n.parentElement=null);this.children=[];}
  appendChild(node){node.remove();node.parentElement=this;this.children.push(node);return node}
  append(...nodes){nodes.forEach(n=>this.appendChild(n))}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  setAttribute(name,value){this.attributes.set(name,String(value))}
  getAttribute(name){return this.attributes.get(name)??null}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(handler)}
  querySelector(selector){return walk(this).slice(1).find(n=>selector.startsWith('.')?n.className.split(/\s+/).includes(selector.slice(1)):n.tagName===selector.toUpperCase())||null}
  focus(){this.ownerDocument.activeElement=this}
  blur(){if(this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=null}
  click(){const event={preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};for(const handler of this.listeners.get('click')||[])handler(event);return event}
}
function harness(){
  const document={activeElement:null,createElement(tag){return new Element(tag,document)},getElementById(id){return[...walk(document.head),...walk(document.body)].find(n=>n.id===id)||null}};
  document.head=new Element('head',document);document.body=new Element('body',document);const root=new Element('main',document);document.body.appendChild(root);
  const anchors={module:new Element('div',document),doctrine:new Element('div',document),garage:new Element('div',document)};Object.values(anchors).forEach(n=>root.appendChild(n));
  const sandbox={document,window:{}};
  for(const target of[sandbox,sandbox.window])for(const name of['localStorage','sessionStorage','setTimeout','setInterval','requestAnimationFrame'])Object.defineProperty(target,name,{get(){throw new Error('Unexpected direct '+name+' access')}});
  vm.runInNewContext(source,sandbox,{filename:'onboarding.js'});
  let profile={name:'A',seen:[]},allowed=new Set(sandbox.window.StarfighterOnboarding.hintIds),enabled=true;
  const calls=[];
  const options={root,getScope:()=>profile,getSeen:()=>profile.seen,remember(id){calls.push([profile.name,id]);if(!profile.seen.includes(id))profile.seen.push(id);return true},isAllowed:id=>enabled&&allowed.has(id),getAnchor:id=>id==='module'?anchors.module:id==='doctrine'?anchors.doctrine:['gear','synergy'].includes(id)?anchors.garage:null};
  const api=sandbox.window.StarfighterOnboarding.create(options);
  const hosts=()=>walk(root).filter(n=>n.className==='sf-onboarding'),button=()=>hosts()[0]?.querySelector('button');
  return{api,document,root,anchors,calls,options,hosts,button,exports:sandbox.window.StarfighterOnboarding,setAllowed(ids){allowed=new Set(ids)},setEnabled(value){enabled=value},setProfile(value){profile=value},get profile(){return profile}};
}
const results=[];
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('the fixed catalogue queues unseen first-earned systems once and paints only one hint',()=>{
  const h=harness(),ids=['missile','bit','shield','delta','gear','module','doctrine','synergy'];assert.deepEqual(Array.from(h.exports.hintIds),ids);assert.equal(h.api.show('unknown'),false);h.profile.seen.push('missile');assert.equal(h.api.show('missile'),false);
  for(let repeat=0;repeat<10;repeat++)for(const id of ids)h.api.show(id);assert.equal(h.hosts().length,1);assert.equal(h.api.activeId,'bit');assert.equal(h.api.queuedIds.length,6);assert.equal(h.calls.length,0);
  const host=h.hosts()[0];assert.equal(host.getAttribute('role'),'status');assert.equal(host.getAttribute('aria-live'),'polite');assert.equal(host.getAttribute('aria-atomic'),'true');return{uniquePending:7};
});
check('floating notes retire after visible dwell and exact-once acknowledgement returns keyboard focus',()=>{
  const h=harness();h.api.show('missile');h.api.tick(8.99);assert.equal(h.calls.length,0);h.api.tick(.01);assert.deepEqual(h.calls,[['A','missile']]);assert.equal(h.api.activeId,null);assert.equal(h.hosts().length,0);assert.equal(h.api.show('missile'),false);
  h.api.show('bit');h.api.tick(.8);assert.equal(h.api.activeId,'bit');const button=h.button();button.focus();const event=button.click();assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(h.document.activeElement,null);assert.deepEqual(h.calls,[['A','missile'],['A','bit']]);assert.equal(h.api.dismiss(),false);return{visibleSeconds:9};
});
check('pause and menus hide guidance, freeze elapsed time and never mark an unread hint seen',()=>{
  const h=harness();h.api.show('shield');h.api.tick(4.25);h.setEnabled(false);h.api.tick(100);assert.equal(h.api.activeId,null);assert.equal(h.hosts().length,0);assert.deepEqual(Array.from(h.api.queuedIds),['shield']);assert.equal(h.calls.length,0);assert.equal(h.api.dismiss(),false);
  h.setEnabled(true);h.api.tick(4.74);assert.equal(h.api.activeId,'shield');assert.equal(h.calls.length,0);h.api.tick(.01);assert.deepEqual(h.calls,[['A','shield']]);return{pausedSecondsIgnored:100};
});
check('decision notes use stable normal-flow anchors and wait for explicit acknowledgement',()=>{
  const h=harness();h.api.show('module');let host=h.hosts()[0];assert.equal(host.parentElement,h.anchors.module);assert.equal(host.dataset.inline,'true');h.api.tick(100);assert.equal(h.api.activeId,'module');assert.equal(h.calls.length,0);
  h.api.show('doctrine');h.api.dismiss();host=h.hosts()[0];assert.equal(h.api.activeId,'doctrine');assert.equal(host.parentElement,h.anchors.doctrine);h.api.tick(100);assert.equal(h.calls.length,1);h.api.close();assert.equal(h.calls.length,1);assert.equal(h.hosts().length,0);return{decisionTimeout:false};
});
check('a suspended combat hint cannot block an eligible intermission explanation',()=>{
  const h=harness();h.setAllowed(['missile']);h.api.show('missile');h.api.tick(3);h.api.show('module');h.setAllowed(['module']);h.api.tick(0);assert.equal(h.api.activeId,'module');assert.deepEqual(Array.from(h.api.queuedIds),['missile']);assert.equal(h.hosts().length,1);h.api.tick(20);assert.equal(h.calls.length,0);h.api.dismiss();assert.deepEqual(h.calls,[['A','module']]);
  h.setAllowed(['missile']);h.api.tick(5.99);assert.equal(h.api.activeId,'missile');h.api.tick(.01);assert.deepEqual(h.calls,[['A','module'],['A','missile']]);return{resumedVisibleSeconds:6};
});
check('changing pilots discards old UI and queues while each profile learns independently',()=>{
  const h=harness(),a=h.profile,b={name:'B',seen:[]};h.api.show('gear');h.api.show('synergy');h.api.tick(3);h.setProfile(b);h.api.tick(0);assert.equal(h.hosts().length,0);assert.equal(h.api.queuedIds.length,0);assert.equal(a.seen.length,0);
  h.api.show('gear');assert.equal(h.hosts()[0].parentElement,h.anchors.garage);h.api.dismiss();assert.deepEqual(b.seen,['gear']);assert.equal(a.seen.length,0);h.setProfile(a);assert.equal(h.api.show('gear'),true);h.api.dismiss();assert.deepEqual(a.seen,['gear']);assert.deepEqual(h.calls,[['B','gear'],['A','gear']]);return{profiles:2};
});
check('live persistence updates prune already-seen queued hints without a duplicate reminder',()=>{
  const h=harness();h.api.show('missile');h.api.show('bit');h.api.show('gear');h.profile.seen.push('missile','gear');h.api.tick(0);assert.equal(h.api.activeId,'bit');assert.equal(h.api.queuedIds.length,0);assert.equal(h.calls.length,0);h.api.dismiss();assert.deepEqual(h.calls,[['A','bit']]);return{externalSeenUpdates:2};
});
check('cleanup, invalid time and failed callbacks cannot leak UI, timers or persistent-store access',()=>{
  const h=harness();h.api.show('shield');for(const dt of[-1,NaN,Infinity])h.api.tick(dt);assert.equal(h.api.activeId,'shield');assert.equal(h.calls.length,0);h.api.close();assert.equal(h.calls.length,0);assert.equal(h.api.show('shield'),true);h.api.dispose();assert.equal(h.hosts().length,0);assert.equal(h.api.show('delta'),false);h.api.tick(100);
  const second=h.exports.create(h.options);assert.equal(walk(h.document.head).filter(n=>n.id==='starfighter-onboarding-style').length,1);second.dispose();
  h.options.isAllowed=()=>{throw new Error('Unavailable screen')};const guarded=h.exports.create(h.options);guarded.show('delta');guarded.tick(100);assert.equal(guarded.activeId,null);assert.equal(h.hosts().length,0);guarded.dispose();
  h.options.isAllowed=()=>true;h.options.remember=()=>{throw new Error('Blocked persistence')};const session=h.exports.create(h.options);session.show('delta');assert.equal(session.dismiss(),true);assert.equal(session.show('delta'),false);session.dispose();return{styles:1,storageAccesses:0,timers:0};
});
const passed=results.filter(r=>r.passed).length,failed=results.length-passed;fs.writeFileSync(path.join(rootPath,'artifacts/onboarding-controller-audit.json'),JSON.stringify({passed,failed,results},null,2)+'\n');console.log(`${passed} onboarding checks passed, ${failed} failed`);if(failed)process.exitCode=1;
