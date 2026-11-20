#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../ui-text.js');
let checks=0;
function test(name,work){work();checks++;console.log('PASS '+name)}
const rule=(selector,size,priority='')=>({selectorText:selector,style:{getPropertyValue:name=>name==='font-size'?size:'',getPropertyPriority:()=>priority}});
const group=(head,rules)=>({cssText:head+' {}',cssRules:rules});
function documentFixture({saved=null,blocked=false,sheets=[]}={}){
  const data=new Map(saved===null?[]:[[T.key,saved]]),writes=[],listeners=new Map(),observers=[];
  const node=tag=>({tagName:tag.toUpperCase(),id:'',dataset:{},textContent:'',parentNode:null,
    remove(){const at=doc.head.children.indexOf(this);if(at>=0)doc.head.children.splice(at,1);this.parentNode=null},
    addEventListener(type,fn){this.listeners??=new Map();this.listeners.set(type,fn)},
    removeEventListener(type){this.listeners?.delete(type)}});
  const select=node('select'),status=node('p');select.value='standard';
  const root={attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}};
  const doc={documentElement:root,styleSheets:sheets,
    head:{children:[],appendChild(el){this.children.push(el);el.parentNode=this}},
    createElement:node,getElementById:id=>id==='ui-text-size'?select:id==='ui-text-status'?status:null,
    addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type){listeners.delete(type)}};
  class Observer{constructor(fn){this.fn=fn;observers.push(this)}observe(target,options){this.target=target;this.options=options}disconnect(){this.disconnected=true}}
  const storage={getItem:k=>{if(blocked)throw new Error('Blocked read');return data.get(k)??null},setItem(k,v){if(blocked)throw new Error('Blocked write');writes.push([k,v]);data.set(k,v)}};
  return{doc,root,select,status,storage,writes,data,listeners,observers,Observer,create:()=>T.create({document:doc,storage,MutationObserver:Observer})};
}

test('only bounded Standard/Large preferences normalize; no arbitrary numeric scale is accepted',()=>{
  for(const value of['',null,undefined,0,1.2,NaN,'120','large;zoom:2','LARGE',{},['large']])assert.equal(T.normalize(value),'standard');
  assert.equal(T.normalize('standard'),'standard');assert.equal(T.normalize('large'),'large');
  assert.deepEqual(T.choices,['standard','large']);assert.ok(Object.isFrozen(T.choices));
});
test('absolute local font sizes retain responsive expressions and grouping conditions',()=>{
  const out=T.compileRules([rule('.gear-name','.8rem'),group('@media (max-width:650px)',[rule('.copy','clamp(10px,1.1cqw,14px)')]),group('@supports (display:grid)',[rule('.actions button','12px','important')]),group('@container (max-width:500px)',[rule('.hint','1.4cqw')])]);
  assert.equal(out.count,4);assert.match(out.css,/font-size:calc\(\.8rem \* var\(--ui-text-scale\)\)/);
  assert.match(out.css,/@media \(max-width:650px\)\{\nhtml\[data-ui-text="large"\] \.copy/);
  assert.match(out.css,/calc\(clamp\(10px,1.1cqw,14px\) \* var\(--ui-text-scale\)\)/);
  assert.match(out.css,/var\(--ui-text-scale\)\)!important/);assert.match(out.css,/@supports/);assert.match(out.css,/@container/);
});
test('nested selectors keep comma boundaries, original order and source specificity',()=>{
  const out=T.compileRules([rule('.a:not(.x,.y), #garage :is(.name,.stats)','.7rem'),rule('.a','.8rem')]);
  assert.match(out.css,/html\[data-ui-text="large"\] \.a:not\(\.x,\.y\),html\[data-ui-text="large"\] #garage :is\(\.name,\.stats\)/);
  assert.ok(out.css.indexOf('calc(.7rem')<out.css.indexOf('calc(.8rem'));
});
test('display titles, relative inherited sizes, decorative glyphs and keyframes are excluded',()=>{
  const out=T.compileRules([rule('#menu h1','4.3cqw'),rule('.screen h2','2rem'),rule('.lesson h3','14px'),rule('.button span','1.25em'),rule('.copy small','80%'),rule('.icon::before','24px'),rule('.archive-mark','3.7cqw'),group('@keyframes pulse',[rule('to','12px')]),rule('.body-copy','12px')]);
  assert.equal(out.count,1);assert.match(out.css,/\.body-copy/);assert.doesNotMatch(out.css,/h1|h2|h3|before|archive|keyframes|1.25em|80%/);
});
test('unreadable external fonts and the generated sheet cannot prevent or recursively scale UI copy',()=>{
  const inaccessible={get cssRules(){throw new Error('SecurityError')}};
  const out=T.compileSheets([inaccessible,{ownerNode:{id:'starfighter-ui-text-overrides'},cssRules:[rule('.self','12px')]},{href:'http://local/ui-text.css?v=150',cssRules:[rule('.setting','12px')]},{disabled:true,cssRules:[rule('.disabled','12px')]},{media:{mediaText:'(min-width:800px)'},cssRules:[rule('.copy','12px')]}]);
  assert.equal(out.count,1);assert.match(out.css,/@media \(min-width:800px\)/);assert.doesNotMatch(out.css,/self|setting|disabled/);
});
test('startup restores independent saved text without writing a profile or other preference',()=>{
  const f=documentFixture({saved:'large',sheets:[{cssRules:[rule('.copy','12px')]}]}),api=f.create();
  assert.equal(api.value,'large');assert.equal(f.select.value,'large');assert.equal(f.root.attributes['data-ui-text'],'large');assert.equal(f.writes.length,0);
  assert.equal(f.doc.head.children.length,1);assert.equal(f.doc.head.children[0].dataset.ruleCount,'1');
  assert.equal(f.create(),api);assert.equal(f.observers.length,1,'Repeated integration does not install duplicate listeners/observers');
});
test('native select changes persist once, reject unsupported values and remove all overrides on Standard',()=>{
  const f=documentFixture({sheets:[{cssRules:[rule('.copy','12px')]}]}),api=f.create();
  f.select.value='large';f.select.listeners.get('change')();assert.equal(api.value,'large');assert.deepEqual(f.writes,[[T.key,'large']]);assert.match(f.status.textContent,/Saved for this browser/);
  assert.equal(api.set('unsupported').valid,false);assert.equal(api.value,'large');assert.equal(f.writes.length,1);
  api.set('standard');assert.equal(f.doc.head.children.length,0);assert.equal(f.root.attributes['data-ui-text'],'standard');assert.equal(f.select.value,'standard');
});
test('blocked getter/write storage still supports session text changes without touching pilot data',()=>{
  const f=documentFixture({blocked:true}),api=f.create();assert.equal(api.value,'standard');
  assert.deepEqual(api.set('large'),{value:'large',saved:false,valid:true});assert.equal(f.root.attributes['data-ui-text'],'large');assert.match(f.status.textContent,/Active for this session/);assert.equal(f.data.size,0);
  const doc=f.doc;api.destroy();assert.equal(doc.documentElement.attributes['data-ui-text'],undefined);assert.ok(f.observers[0].disconnected);assert.equal(f.listeners.size,0);
});
test('new local lesson/onboarding styles rebuild once without scaling their own output',()=>{
  const f=documentFixture({saved:'large',sheets:[{cssRules:[rule('.copy','12px')]}]}),api=f.create();
  const style=f.doc.head.children[0],before=style.textContent;
  f.doc.styleSheets.push({cssRules:[rule('.sf-training-copy','11px')]});
  f.observers[0].fn([{target:f.doc.head,addedNodes:[{tagName:'STYLE'}]}]);
  assert.match(style.textContent,/sf-training-copy/);assert.equal(style.dataset.ruleCount,'2');
  f.observers[0].fn([{target:style,addedNodes:[]}]);assert.equal(style.dataset.ruleCount,'2');assert.ok(style.textContent.startsWith(before));
  api.set('standard');f.doc.styleSheets.push({cssRules:[rule('.new','13px')]});f.observers[0].fn([{target:f.doc.head,addedNodes:[{}]}]);assert.equal(f.doc.head.children.length,0);
  api.set('large');assert.equal(f.doc.head.children[0].dataset.ruleCount,'3');
});
test('parent practice-save acknowledgements update only the matching current text choice',()=>{
  const f=documentFixture({blocked:true}),api=f.create();api.set('large');
  assert.equal(api.setSaveResult({value:'standard',saved:true}),false);assert.match(f.status.textContent,/Active for this session/);
  assert.equal(api.setSaveResult({value:'large',saved:true}),true);assert.match(f.status.textContent,/Saved for this browser/);assert.equal(f.writes.length,0);
  api.setSaveResult({value:'large',saved:false});assert.match(f.status.textContent,/Active for this session/);
});
test('text rules never change the root font, transforms, zoom, canvas size or collision geometry',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../ui-text.css'),'utf8');
  assert.doesNotMatch(css,/(?:^|[;{])\s*(?:zoom|transform|scale)\s*:|(?:html|:root)\s*\{[^}]*font-size|canvas\s*\{/);
  const compiled=T.compileRules([rule('html','16px'),rule(':root','16px'),rule('body','14px')]);assert.equal(compiled.count,1);assert.match(compiled.css,/body/);
});
console.log(`${checks} UI text checks passed, 0 failed. CSSOM fixtures validate policy and persistence; native browser layout/computed-font review remains required.`);
